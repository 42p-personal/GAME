// Weekly calendar / career loop (M2, §2). A single monster you raise week by week:
// weekly actions (train drill / rest / feed / excursion), stamina, gold, aging.
import {
  FOODS, Food, LEAGUES, MAX_HAPPINESS, Monster, Move, RNG, STATS, Sex, Species, Stats, Stat, TrainingProfile,
  ULTIMATE_LEVEL, classForStats, feedDelta, hashString, mulberry32, randInt,
} from './core'
import { ALL_DRILLS } from './drills'
import { chooseLoadout, generateMonster, learnedMoves, maxHp, maxMana } from './monster'

export const WEEKS_PER_MONTH = 4
export const MONTHS_PER_YEAR = 12
export const WEEKS_PER_YEAR = WEEKS_PER_MONTH * MONTHS_PER_YEAR // 48
const START_AGE_WEEKS = WEEKS_PER_YEAR // start as a Teen (age 1)
export const START_GOLD = 500
export const MAX_STAMINA = 100
export const BASIC_DRILL_STAMINA = 10
export const INTENSIVE_DRILL_STAMINA = 25
const EXCURSION_COST = 25

export type Stage = 'Baby' | 'Teen' | 'Fully Grown' | 'Elder' | 'Retiree'

export function stageInfo(ageWeeks: number, lifespan: number): { stage: Stage; trainMult: number; ageYears: number } {
  const ageYears = Math.floor(ageWeeks / WEEKS_PER_YEAR)
  let stage: Stage
  if (ageYears <= 0) stage = 'Baby'
  else if (ageYears === 1) stage = 'Teen'
  else if (ageYears >= lifespan) stage = 'Retiree'
  else if (ageYears === lifespan - 1) stage = 'Elder'
  else stage = 'Fully Grown'
  const trainMult = stage === 'Baby' ? 0.5 : stage === 'Teen' ? 1 : stage === 'Fully Grown' ? 0.95 : stage === 'Elder' ? 0.8 : 0
  return { stage, trainMult, ageYears }
}

export function dateLabel(week: number): string {
  const y = Math.floor(week / WEEKS_PER_YEAR) + 1
  const mo = Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_MONTH) + 1
  const wk = (week % WEEKS_PER_MONTH) + 1
  return `Yr ${y} · Month ${mo} · Wk ${wk}`
}

// A past tournament entry, kept for the ranch's Tournament History panel.
// `placement` is binary for now (a tournament is one battle vs one rival) —
// becomes richer (1st/2nd/3rd/...) once multi-participant brackets land.
export interface TournamentResult {
  name: string
  league: string
  week: number // global week the tournament resolved
  placement: number // 1-based final round-robin standing (1 = champion)
  fieldSize: number // total participants that event, for a "2nd of 5" display
}

export interface Career {
  id: string
  name: string
  species: Species
  sex: Sex
  favouriteFood: Food
  hatedFood: Food
  stats: Stats
  ageWeeks: number
  hp: number // current hit points — injuries persist between weeks; only Rest heals
  mp: number // current mana — drained by battles; only Rest restores
  stamina: number
  happiness: number
  licenseIndex: number
  week: number // weeks since this monster joined the stable (age/log bookkeeping)
  retired: boolean
  fedThisWeek: boolean // only one food may be bought per week per monster
  loadout: string[] // persisted equipped-move ids (≤3); empty = auto-pick (chooseLoadout)
  tournamentHistory: TournamentResult[]
  log: string[]
}

// Weekly food prices fluctuate ±40% around each food's base value (§2.5).
export function rollMarket(id: string, week: number): Record<Food, number> {
  const rng = mulberry32(hashString(id + ':mkt:' + week))
  const m = {} as Record<Food, number>
  for (const f of FOODS) m[f.id] = Math.max(1, Math.round(f.price * (0.6 + rng() * 0.8)))
  return m
}

export const foodName = (id: Food) => FOODS.find((f) => f.id === id)!.name

export type WeeklyAction =
  | { kind: 'train'; drillId: string }
  | { kind: 'rest' }
  | { kind: 'excursion' }

// Stamina malus: exp penalty scales with stamina level
export function staminaMalus(stamina: number): number {
  if (stamina > 70) return 1 // no penalty
  if (stamina > 50) return 0.95 // -5%
  if (stamina > 30) return 0.9 // -10%
  return 0.5 // -50%
}

// Training aptitude for a species: explicit override if set, else derived from its
// base spread (best stat trains fastest, worst slowest) — so aptitude always
// matches the species' natural identity.
export function trainingProfileFor(species: Species): TrainingProfile {
  if (species.trainingProfile) return species.trainingProfile
  const ordered = [...STATS].sort((a, b) => species.base[b] - species.base[a])
  return { primary: ordered[0], secondary: ordered[1], weakness: ordered[STATS.length - 1] }
}

// Stat training bonus: primary +20%, secondary +10%, weakness -20%
export function statTrainingBonus(species: Species, stat: Stat): number {
  const prof = trainingProfileFor(species)
  if (stat === prof.primary) return 1.2
  if (stat === prof.secondary) return 1.1
  if (stat === prof.weakness) return 0.8
  return 1
}

export interface WeekPreview {
  happinessDelta: number // feedDelta if food chosen, else the -1 unfed penalty
  statDeltas: Partial<Record<Stat, number>> // per-stat gain (+) or drill malus (-)
  staminaDelta: number // rest gain (+) or drill/excursion cost (-), clamped to [0, MAX]
  goldDelta: number // excursion purse — 0 for every other activity
  hpDelta: number // rest healing (30-70% of max, capped) — 0 for other activities
  mpDelta: number // rest mana recovery (25-80% of max, capped) — 0 for other activities
}

// A drill's positive gain is a happiness-weighted random roll, not a flat
// number (user spec 2026-07-19): the roll ranges ±1/3 of the drill's base
// gain, and `happiness` skews it toward the top of that range — 0 happiness
// rolls uniformly, 10 happiness leans hard toward the ceiling. Combined with
// the existing aptitude multiplier (statTrainingBonus, applied after this
// roll), a favoured stat at high happiness can exceed the old flat number —
// intentionally not advertised as a stated max anywhere in the UI. Malus
// values stay flat/unscaled, as before — only positive gains roll.
// Deterministic per (monster, week) via the caller's seeded `rng`, so the
// review screen's preview can show the EXACT roll, not just an estimate.
function rollDrillGain(rng: RNG, base: number, happiness: number): number {
  const range = Math.round(base / 3)
  const skew = 1 / (1 + happiness / 5) // 1 = uniform (happiness 0) → 1/3 = top-skewed (happiness 10)
  const t = Math.pow(rng(), skew)
  return base - range + Math.round(t * range * 2)
}

// Preview what applyWeek would do THIS week, without mutating state — mirrors
// its training + feeding math exactly (same seeded rng as applyWeek, so the
// roll shown IS the roll that will land) so the Ranch screen can show the
// happiness swing and exact stat gains/maluses before the player commits.
export function previewWeekEffects(c: Career, activity: string, food: Food | ''): WeekPreview {
  const happinessDelta = food ? feedDelta(food, c.favouriteFood, c.hatedFood) : -1
  const statDeltas: Partial<Record<Stat, number>> = {}
  let staminaDelta = 0
  let goldDelta = 0
  let hpDelta = 0
  let mpDelta = 0
  if (c.retired) return { happinessDelta, statDeltas, staminaDelta, goldDelta, hpDelta, mpDelta }
  const rng = mulberry32(hashString(c.id + ':' + c.week))
  const drill = ALL_DRILLS.find((d) => d.id === activity)
  if (drill) {
    const cap = LEAGUES[c.licenseIndex].cap
    const { trainMult } = stageInfo(c.ageWeeks, c.species.lifespan)
    const eff = trainMult * staminaMalus(c.stamina)
    // feeding resolves before training in the real weekly tick (advanceWeek),
    // so the roll below must use the POST-feed happiness to match exactly
    const trainHappiness = food ? Math.max(0, Math.min(MAX_HAPPINESS, c.happiness + feedDelta(food, c.favouriteFood, c.hatedFood))) : c.happiness
    for (const [stat, delta] of Object.entries(drill.gains) as [Stat, number][]) {
      const applied = delta > 0
        ? Math.round(rollDrillGain(rng, delta, trainHappiness) * eff * statTrainingBonus(c.species, stat))
        : delta
      const nv = Math.max(1, Math.min(cap, c.stats[stat] + applied))
      const real = nv - c.stats[stat]
      if (real !== 0) statDeltas[stat] = real
    }
    const stamCost = drill.kind === 'basic' ? BASIC_DRILL_STAMINA : INTENSIVE_DRILL_STAMINA
    staminaDelta = Math.max(0, c.stamina - stamCost) - c.stamina
  } else if (activity === 'rest') {
    // same rng call ORDER as applyWeek's rest branch: stamina, then heal, then mana
    const restMin = Math.round(0.3 * MAX_STAMINA)
    const restMax = Math.round(1 * MAX_STAMINA)
    const restAmount = restMin + Math.floor(rng() * ((restMax - restMin) / 5 + 1)) * 5
    staminaDelta = Math.min(MAX_STAMINA, c.stamina + restAmount) - c.stamina
    const healAmt = Math.round(maxHp(c.stats) * (0.3 + rng() * 0.4))
    const mpAmt = Math.round(maxMana(c.stats) * (0.25 + rng() * 0.55))
    hpDelta = Math.min(maxHp(c.stats), c.hp + healAmt) - c.hp
    mpDelta = Math.min(maxMana(c.stats), c.mp + mpAmt) - c.mp
  } else if (activity === 'excursion') {
    staminaDelta = Math.max(0, c.stamina - EXCURSION_COST) - c.stamina
    goldDelta = randInt(rng, 30, 80)
  }
  return { happinessDelta, statDeltas, staminaDelta, goldDelta, hpDelta, mpDelta }
}

export interface NewCareerOpts {
  id?: string // stable-unique id (defaults to the generation seed)
  ageWeeks?: number // fusion babies start at 0 (Baby)
  stats?: Stats // override seed stats (fusion averages the parents)
  licenseIndex?: number
  happiness?: number
}

// Create a raising Career. Stats/species/name come from `seed`; `opts.id` lets the
// Market give a bought monster a stable-unique id while keeping the previewed
// monster (same seed). Fusion passes ageWeeks:0 + averaged stats for a baby.
export function newCareer(seed: string, opts: NewCareerOpts = {}): Career {
  const m = generateMonster(seed, { train: 0 })
  const id = opts.id ?? seed
  return {
    id,
    name: m.name,
    species: m.species,
    sex: m.sex,
    favouriteFood: m.favouriteFood,
    hatedFood: m.hatedFood,
    stats: opts.stats ? { ...opts.stats } : { ...m.stats },
    ageWeeks: opts.ageWeeks ?? START_AGE_WEEKS,
    hp: maxHp(opts.stats ?? m.stats),
    mp: maxMana(opts.stats ?? m.stats),
    stamina: MAX_STAMINA,
    happiness: opts.happiness ?? 5,
    licenseIndex: opts.licenseIndex ?? 0,
    week: 0,
    retired: false,
    fedThisWeek: false,
    loadout: [],
    tournamentHistory: [],
    log: [`${m.name} the ${m.species.name} (${m.sex === 'M' ? '♂' : '♀'}) joins your stable — a Wood-league hopeful.`],
  }
}

// Buy one food from this week's town food market. Does NOT advance the week —
// feeding is a start-of-week choice, resolved BEFORE the weekly activity. Gold is
// game-owned, so it's passed in and returned; `discount` is the bulk-food perk.
export function buyFood(c: Career, gold: number, food: Food, market: Record<Food, number>, discount = 1): { c: Career; gold: number } {
  if (c.retired || c.fedThisWeek) return { c, gold }
  const price = Math.max(1, Math.round(market[food] * discount))
  if (gold < price) return { c: push(c, `Wk ${c.week + 1}: can't afford ${foodName(food)} (${price}g).`), gold }
  const d = feedDelta(food, c.favouriteFood, c.hatedFood)
  const happiness = Math.max(0, Math.min(MAX_HAPPINESS, c.happiness + d))
  const n: Career = { ...c, happiness, fedThisWeek: true, log: [...c.log] }
  return {
    c: push(n, `Wk ${c.week + 1}: fed ${foodName(food)} (−${price}g). Happiness ${happiness}/10${d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}.`),
    gold: gold - price,
  }
}

// Derive a display Monster from the career's current state. Uses the
// player's persisted `loadout` (Ability Selection UI) when set and still
// valid; falls back to auto-pick (chooseLoadout) otherwise — including the
// edge case where a drill malus dropped a stat below a move's learnLevel,
// silently shrinking the persisted loadout below 3.
export function careerMonster(c: Career): Monster {
  const learned = learnedMoves(c.stats)
  const persisted = c.loadout
    .map((id) => learned.find((mv) => mv.id === id))
    .filter((mv): mv is Move => !!mv)
  const loadout = persisted.length > 0 ? persisted : chooseLoadout(learned, c.stats)
  return {
    seed: c.id,
    name: c.name,
    species: c.species,
    sex: c.sex,
    stats: c.stats,
    className: classForStats(c.stats),
    league: LEAGUES[c.licenseIndex].name,
    learned,
    loadout,
    ultimateUnlocked: Math.max(...STATS.map((s) => c.stats[s])) >= ULTIMATE_LEVEL,
    favouriteFood: c.favouriteFood,
    hatedFood: c.hatedFood,
    stamina: c.stamina,
    hp: Math.min(c.hp, maxHp(c.stats)),
    mp: Math.min(c.mp, maxMana(c.stats)),
    // Care-derived instinct (roadmap item, player half): a well-kept monster
    // obeys perfectly (happiness 10 → tameness 100, zero wild actions); a
    // neglected one gets flighty (happiness 0 → 90 → 10% chance per turn of a
    // random action in battle). HIDDEN — never shown in any UI, only felt.
    tameness: 90 + c.happiness,
  }
}

export function canRankUp(c: Career): boolean {
  if (c.licenseIndex >= LEAGUES.length - 1) return false
  const cap = LEAGUES[c.licenseIndex].cap
  return Math.max(...STATS.map((s) => c.stats[s])) >= cap - 10
}

export function rankUpFee(c: Career): number {
  return (c.licenseIndex + 1) * 40
}

export function rankUp(c: Career, gold: number): { c: Career; gold: number } {
  if (!canRankUp(c)) return { c, gold }
  const fee = rankUpFee(c)
  if (gold < fee) return { c: push(c, `Rank-up trial costs ${fee}g — not enough gold.`), gold }
  const n: Career = { ...c, licenseIndex: c.licenseIndex + 1, log: [...c.log] }
  return {
    c: push(n, `⭐ Passed the rank-up trial! Promoted to ${LEAGUES[n.licenseIndex].name} (cap ${LEAGUES[n.licenseIndex].cap}).`),
    gold: gold - fee,
  }
}

function push(c: Career, line: string): Career {
  return { ...c, log: [...c.log, line].slice(-40) }
}

// Log a life-stage transition (shared by applyWeek and ageOneWeek). Mutates `n`.
function applyStageTransition(n: Career, beforeStage: Stage): void {
  const nowStage = stageInfo(n.ageWeeks, n.species.lifespan).stage
  if (nowStage === beforeStage) return
  if (nowStage === 'Retiree') {
    n.retired = true
    n.log.push(`🏁 ${n.name} has reached retirement age and can no longer compete.`)
  } else {
    n.log.push(`  ↳ ${n.name} is now ${nowStage}${nowStage === 'Elder' ? ' (−20% training)' : nowStage === 'Fully Grown' ? ' (−5% training)' : ''}.`)
  }
}

// Advance the calendar for a monster that took no weekly action (retired, or no
// plan submitted) — it still ages.
export function ageOneWeek(c: Career): Career {
  const before = stageInfo(c.ageWeeks, c.species.lifespan).stage
  const n: Career = { ...c, week: c.week + 1, ageWeeks: c.ageWeeks + 1, fedThisWeek: false, log: [...c.log] }
  applyStageTransition(n, before)
  n.log = n.log.slice(-40)
  return n
}

export function applyWeek(c: Career, action: WeeklyAction, gold: number, rental = 0): { c: Career; gold: number } {
  if (c.retired) return { c, gold }
  let g = gold
  const n: Career = { ...c, stats: { ...c.stats }, log: [...c.log] }
  const rng = mulberry32(hashString(c.id + ':' + c.week))
  const cap = LEAGUES[c.licenseIndex].cap
  const { stage, trainMult } = stageInfo(c.ageWeeks, c.species.lifespan)
  const beforeMoves = learnedMoves(c.stats).length
  const wk = c.week + 1

  if (action.kind === 'train') {
    const drill = ALL_DRILLS.find((d) => d.id === action.drillId) ?? ALL_DRILLS[0]
    const stamCost = drill.kind === 'basic' ? BASIC_DRILL_STAMINA : INTENSIVE_DRILL_STAMINA
    const malus = staminaMalus(n.stamina)
    const eff = trainMult * malus
    const changes: string[] = []
    for (const [stat, delta] of Object.entries(drill.gains) as [Stat, number][]) {
      // positive gains roll (happiness-weighted, see rollDrillGain), then scale by
      // life stage, stamina, and species aptitude; drill maluses apply flat
      const applied = delta > 0
        ? Math.round(rollDrillGain(rng, delta, n.happiness) * eff * statTrainingBonus(c.species, stat))
        : delta
      const nv = Math.max(1, Math.min(cap, n.stats[stat] + applied))
      const real = nv - n.stats[stat]
      n.stats[stat] = nv
      if (real !== 0) changes.push(`${stat} ${real > 0 ? '+' : ''}${real}`)
    }
    n.stamina = Math.max(0, n.stamina - stamCost)
    n.log.push(`Wk ${wk}: ${drill.name} — ${changes.length > 0 ? changes.join(', ') : 'no gain (capped)'}.`)
  } else if (action.kind === 'rest') {
    const restMin = Math.round(0.3 * MAX_STAMINA)
    const restMax = Math.round(1 * MAX_STAMINA)
    const restAmount = restMin + Math.floor(rng() * ((restMax - restMin) / 5 + 1)) * 5
    n.stamina = Math.min(MAX_STAMINA, n.stamina + restAmount)
    // Rest is also the ONLY way injuries mend: heal 30-70% of max HP and
    // recover 25-80% of max MP (user spec 2026-07-19). Rolls share applyWeek's
    // seeded rng so previewWeekEffects can show the exact numbers.
    const healAmt = Math.round(maxHp(n.stats) * (0.3 + rng() * 0.4))
    const mpAmt = Math.round(maxMana(n.stats) * (0.25 + rng() * 0.55))
    n.hp = Math.min(maxHp(n.stats), n.hp + healAmt)
    n.mp = Math.min(maxMana(n.stats), n.mp + mpAmt)
    n.log.push(`Wk ${wk}: rested. Stamina ${n.stamina}/${MAX_STAMINA} · HP ${n.hp}/${maxHp(n.stats)} · MP ${n.mp}/${maxMana(n.stats)}.`)
  } else {
    n.stamina = Math.max(0, n.stamina - EXCURSION_COST)
    const purse = randInt(rng, 30, 80)
    g += purse
    n.log.push(`Wk ${wk}: excursion — returned with ${purse}g.`)
  }

  // hunger: a monster that wasn't fed this week loses a little happiness
  if (!n.fedThisWeek) {
    n.happiness = Math.max(0, n.happiness - 1)
    n.log.push(`  ↳ ${n.name} went unfed — happiness ${n.happiness}/10.`)
  }

  // lab upkeep, advance the calendar, age the monster
  if (rental > 0) {
    g -= rental
    n.log.push(`  ↳ lab upkeep −${rental}g (frozen genomes).`)
  }
  n.week += 1
  n.ageWeeks += 1
  n.fedThisWeek = false
  // training can shift CON/WIS, so current HP/MP never exceed the new maxima
  n.hp = Math.max(1, Math.min(n.hp, maxHp(n.stats)))
  n.mp = Math.max(0, Math.min(n.mp, maxMana(n.stats)))

  const afterMoves = learnedMoves(n.stats).length
  if (afterMoves > beforeMoves) n.log.push(`  ↳ learned ${afterMoves - beforeMoves} new move(s)!`)

  applyStageTransition(n, stage)

  n.log = n.log.slice(-40)
  return { c: n, gold: g }
}
