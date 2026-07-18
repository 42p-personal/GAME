// Weekly calendar / career loop (M2, §2). A single monster you raise week by week:
// weekly actions (train drill / rest / feed / excursion), stamina, gold, aging.
import {
  FOODS, Food, LEAGUES, MAX_HAPPINESS, Monster, STATS, Sex, Species, Stats, Stat, TrainingProfile,
  ULTIMATE_LEVEL, classForStats, feedDelta, hashString, mulberry32, randInt,
} from './core'
import { ALL_DRILLS } from './drills'
import { chooseLoadout, generateMonster, learnedMoves } from './monster'

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

export interface Career {
  id: string
  name: string
  species: Species
  sex: Sex
  favouriteFood: Food
  hatedFood: Food
  stats: Stats
  ageWeeks: number
  stamina: number
  happiness: number
  licenseIndex: number
  week: number // weeks since this monster joined the stable (age/log bookkeeping)
  retired: boolean
  fedThisWeek: boolean // only one food may be bought per week per monster
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
function staminaMalus(stamina: number): number {
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
    stamina: MAX_STAMINA,
    happiness: opts.happiness ?? 5,
    licenseIndex: opts.licenseIndex ?? 0,
    week: 0,
    retired: false,
    fedThisWeek: false,
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

// Derive a display Monster from the career's current state.
export function careerMonster(c: Career): Monster {
  const learned = learnedMoves(c.stats)
  return {
    seed: c.id,
    name: c.name,
    species: c.species,
    sex: c.sex,
    stats: c.stats,
    className: classForStats(c.stats),
    league: LEAGUES[c.licenseIndex].name,
    learned,
    loadout: chooseLoadout(learned),
    ultimateUnlocked: Math.max(...STATS.map((s) => c.stats[s])) >= ULTIMATE_LEVEL,
    favouriteFood: c.favouriteFood,
    hatedFood: c.hatedFood,
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
      // gains scale with life stage, stamina, and species aptitude; drill maluses apply flat
      const applied = delta > 0 ? Math.round(delta * eff * statTrainingBonus(c.species, stat)) : delta
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
    n.log.push(`Wk ${wk}: rested. Stamina ${n.stamina}/${MAX_STAMINA}.`)
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

  const afterMoves = learnedMoves(n.stats).length
  if (afterMoves > beforeMoves) n.log.push(`  ↳ learned ${afterMoves - beforeMoves} new move(s)!`)

  applyStageTransition(n, stage)

  n.log = n.log.slice(-40)
  return { c: n, gold: g }
}
