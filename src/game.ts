// Weekly calendar / career loop (M2, §2). A single monster you raise week by week:
// weekly actions (train drill / rest / feed / excursion), stamina, gold, aging.
import {
  FOODS, Food, LEAGUES, MAX_HAPPINESS, Monster, STATS, Sex, Species, Stat, Stats,
  ULTIMATE_LEVEL, classForStats, feedDelta, hashString, mulberry32, randInt,
} from './core'
import { ALL_DRILLS } from './drills'
import { chooseLoadout, generateMonster, learnedMoves } from './monster'

export const WEEKS_PER_MONTH = 4
export const MONTHS_PER_YEAR = 12
export const WEEKS_PER_YEAR = WEEKS_PER_MONTH * MONTHS_PER_YEAR // 48
const START_AGE_WEEKS = WEEKS_PER_YEAR // start as a Teen (age 1)
const START_GOLD = 200
const WEEKLY_ALLOWANCE = 15
export const MAX_STAMINA = 100
const TRAIN_COST = { basic: 20, intensive: 30 }
const REST_RECOVER = 55
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
  gold: number
  week: number
  retired: boolean
  market: Record<Food, number> // this week's fluctuating food prices
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

export function newCareer(seed: string): Career {
  const m = generateMonster(seed, { train: 0 })
  return {
    id: seed,
    name: m.name,
    species: m.species,
    sex: m.sex,
    favouriteFood: m.favouriteFood,
    hatedFood: m.hatedFood,
    stats: { ...m.stats },
    ageWeeks: START_AGE_WEEKS,
    stamina: MAX_STAMINA,
    happiness: 5,
    licenseIndex: 0,
    gold: START_GOLD,
    week: 0,
    retired: false,
    market: rollMarket(seed, 0),
    fedThisWeek: false,
    log: [`${m.name} the ${m.species.name} (${m.sex === 'M' ? '♂' : '♀'}) joins your stable — a Wood-league hopeful.`],
  }
}

// Buy one food from this week's market. Does NOT advance the week — feeding is a
// start-of-week choice, separate from the weekly activity.
export function buyFood(c: Career, food: Food): Career {
  if (c.retired || c.fedThisWeek) return c
  const price = c.market[food]
  if (c.gold < price) return push(c, `Wk ${c.week + 1}: can't afford ${foodName(food)} (${price}g).`)
  const d = feedDelta(food, c.favouriteFood, c.hatedFood)
  const happiness = Math.max(0, Math.min(MAX_HAPPINESS, c.happiness + d))
  const n: Career = { ...c, gold: c.gold - price, happiness, fedThisWeek: true, log: [...c.log] }
  return push(n, `Wk ${c.week + 1}: fed ${foodName(food)} (−${price}g). Happiness ${happiness}/10${d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}.`)
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

export function rankUp(c: Career): Career {
  if (!canRankUp(c)) return c
  const fee = rankUpFee(c)
  if (c.gold < fee) return push(c, `Rank-up trial costs ${fee}g — not enough gold.`)
  const n: Career = { ...c, licenseIndex: c.licenseIndex + 1, gold: c.gold - fee, log: [...c.log] }
  return push(n, `⭐ Passed the rank-up trial! Promoted to ${LEAGUES[n.licenseIndex].name} (cap ${LEAGUES[n.licenseIndex].cap}).`)
}

function push(c: Career, line: string): Career {
  return { ...c, log: [...c.log, line].slice(-40) }
}

export function applyWeek(c: Career, action: WeeklyAction): Career {
  if (c.retired) return c
  const n: Career = { ...c, stats: { ...c.stats }, log: [...c.log] }
  const rng = mulberry32(hashString(c.id + ':' + c.week))
  const cap = LEAGUES[c.licenseIndex].cap
  const { stage, trainMult } = stageInfo(c.ageWeeks, c.species.lifespan)
  const beforeMoves = learnedMoves(c.stats).length
  const wk = c.week + 1

  if (action.kind === 'train') {
    const drill = ALL_DRILLS.find((d) => d.id === action.drillId)!
    const eff = trainMult * (n.stamina <= 0 ? 0.5 : 1)
    const changes: string[] = []
    for (const key of Object.keys(drill.gains) as Stat[]) {
      const delta = drill.gains[key]!
      const applied = delta > 0 ? Math.round(delta * eff) : delta // life-stage malus hits gains, not penalties
      const nv = Math.max(1, Math.min(delta > 0 ? cap : 999, n.stats[key] + applied))
      const real = nv - n.stats[key]
      n.stats[key] = nv
      if (real !== 0) changes.push(`${key} ${real > 0 ? '+' : ''}${real}`)
    }
    n.stamina = Math.max(0, n.stamina - TRAIN_COST[drill.kind])
    n.log.push(`Wk ${wk}: ${drill.name} — ${changes.join(', ') || 'no gain (capped)'}.`)
  } else if (action.kind === 'rest') {
    n.stamina = Math.min(MAX_STAMINA, n.stamina + REST_RECOVER)
    n.log.push(`Wk ${wk}: rested. Stamina ${n.stamina}/${MAX_STAMINA}.`)
  } else {
    n.stamina = Math.max(0, n.stamina - EXCURSION_COST)
    const purse = randInt(rng, 30, 80)
    n.gold += purse
    n.log.push(`Wk ${wk}: excursion — returned with ${purse}g.`)
  }

  // hunger: a monster that wasn't fed this week loses a little happiness
  if (!n.fedThisWeek) {
    n.happiness = Math.max(0, n.happiness - 1)
    n.log.push(`  ↳ ${n.name} went unfed — happiness ${n.happiness}/10.`)
  }

  // weekly allowance, advance the calendar, age the monster, reroll the market
  n.gold += WEEKLY_ALLOWANCE
  n.week += 1
  n.ageWeeks += 1
  n.fedThisWeek = false
  n.market = rollMarket(n.id, n.week)

  const afterMoves = learnedMoves(n.stats).length
  if (afterMoves > beforeMoves) n.log.push(`  ↳ learned ${afterMoves - beforeMoves} new move(s)!`)

  const nowStage = stageInfo(n.ageWeeks, n.species.lifespan).stage
  if (nowStage !== stage) {
    if (nowStage === 'Retiree') {
      n.retired = true
      n.log.push(`🏁 ${n.name} has reached retirement age and can no longer compete.`)
    } else {
      n.log.push(`  ↳ ${n.name} is now ${nowStage}${nowStage === 'Elder' ? ' (−20% training)' : nowStage === 'Fully Grown' ? ' (−5% training)' : ''}.`)
    }
  }

  n.log = n.log.slice(-40)
  return n
}
