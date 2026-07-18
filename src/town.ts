// Shared game state + the Town hub economy (§13). One gold wallet and one stable
// span all areas; the Ranch (src/game.ts) raises the active monster week by week.
import {
  Food, Sex, Species, Stat, STATS, Stats, hashString, mulberry32,
} from './core'
import { generateMonster } from './monster'
import {
  Career, START_GOLD, WEEKS_PER_MONTH, WEEKS_PER_YEAR, WeeklyAction, ageOneWeek, applyWeek, buyFood,
  newCareer, rankUp, rollMarket,
} from './game'

export type Area = 'town' | 'ranch'

// Licensing costs for exclusive monster types
export const SPECIAL_LICENSE_COST = 800 // Silver rank: Draconic + Abyssal
export const ELITE_LICENSE_COST = 2000 // Masters rank: Mythical

export interface Tournament {
  id: string
  name: string
  month: number // 1-12
  league: string // Wood, Copper, Tin, etc.
  rewards: { gold: number; exp: number }
}

// Calendar: 12 tournaments, one per month, ranging from Wood to Gold leagues
export const TOURNAMENT_CALENDAR: Tournament[] = [
  { id: 'jan-wood', name: 'January Classic', month: 1, league: 'Wood', rewards: { gold: 100, exp: 50 } },
  { id: 'feb-copper', name: 'February Clash', month: 2, league: 'Copper', rewards: { gold: 150, exp: 75 } },
  { id: 'mar-tin', name: 'March Melee', month: 3, league: 'Tin', rewards: { gold: 200, exp: 100 } },
  { id: 'apr-bronze', name: 'April Bout', month: 4, league: 'Bronze', rewards: { gold: 250, exp: 125 } },
  { id: 'may-iron', name: 'May Invitational', month: 5, league: 'Iron', rewards: { gold: 300, exp: 150 } },
  { id: 'jun-silver', name: 'June Showdown', month: 6, league: 'Silver', rewards: { gold: 350, exp: 175 } },
  { id: 'jul-gold', name: 'July Grand Prix', month: 7, league: 'Gold', rewards: { gold: 400, exp: 200 } },
  { id: 'aug-plat', name: 'August Crown', month: 8, league: 'Platinum', rewards: { gold: 450, exp: 225 } },
  { id: 'sep-masters', name: 'September Summit', month: 9, league: 'Masters', rewards: { gold: 500, exp: 250 } },
  { id: 'oct-elite', name: 'October Elite', month: 10, league: 'Tamer Elite', rewards: { gold: 600, exp: 300 } },
  { id: 'nov-wood2', name: 'November Novice', month: 11, league: 'Wood', rewards: { gold: 100, exp: 50 } },
  { id: 'dec-charity', name: 'December Dash', month: 12, league: 'Copper', rewards: { gold: 150, exp: 75 } },
]

// A banked genome: enough of a monster to restore it (thaw) or fuse it later.
export interface Frozen {
  id: string
  name: string
  species: Species
  sex: Sex
  stats: Stats
  favouriteFood: Food
  hatedFood: Food
  licenseIndex: number
}

// One Market listing: a deterministic seed (so the preview == what you buy) + price.
export interface MarketOffer {
  seed: string
  price: number
}

export interface GameState {
  seed: string
  gold: number
  week: number // the global calendar — one clock for market, tournaments, and stable
  stable: Career[]
  activeId: string
  frozen: Frozen[]
  barnCapacity: number
  bulkFood: boolean // Ranch Shop upgrade: 20% off food
  specialLicense: boolean // Silver rank: unlock Draconic + Abyssal
  eliteLicense: boolean // Masters rank: unlock Mythical
  area: Area
  market: MarketOffer[] // monster market; restocks at the start of each month
  foodMarket: Record<Food, number> // this week's town food prices (shared by all monsters)
  nextId: number // monotonic id counter, survives save/load
}

// Calendar helpers off the global week clock.
export const monthOfWeek = (week: number) => Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_MONTH) + 1

// --- Economy constants (§13.3) ---
export const RENTAL_PER_FROZEN = 8 // weekly upkeep per frozen genome
export const MARKET_BASE = 150 // base monster price; fluctuates ±60%
export const FUSION_COST = 500 // huge, one-off
export const BULK_FOOD_COST = 200 // one-off Ranch Shop upgrade
export const FUSION_PENALTY = 0.9 // average of parents − 10% (§10.2)
export const START_BARN = 2

export function newGame(seed = 'start'): GameState {
  return {
    seed,
    gold: START_GOLD,
    week: 0,
    stable: [],
    activeId: '',
    frozen: [],
    barnCapacity: START_BARN,
    bulkFood: false,
    specialLicense: false,
    eliteLicense: false,
    area: 'town',
    market: rollMarketOffers(seed, 0, false, false),
    foodMarket: rollMarket(seed, 0),
    nextId: 0,
  }
}

// --- Market (§13.1) — 3 equal-weighted base monsters; price band wider than food. ---
export function rollMarketOffers(seed: string, roll: number, hasSpecialLicense = false, hasEliteLicense = false): MarketOffer[] {
  const offers: MarketOffer[] = []
  let attemptIndex = 0
  const maxAttempts = 100 // prevent infinite loops

  while (offers.length < 3 && attemptIndex < maxAttempts) {
    const s = 'mkt-' + hashString(seed + ':' + roll + ':' + attemptIndex).toString(36)
    const monster = generateMonster(s)
    const bodyType = monster.species.body

    // Filter out exclusive creatures if player doesn't have licenses
    const isExclusive = ['Draconic', 'Abyssal'].includes(bodyType)
    const isMythical = bodyType === 'Mythical'

    if (isExclusive && !hasSpecialLicense) {
      attemptIndex++
      continue
    }
    if (isMythical && !hasEliteLicense) {
      attemptIndex++
      continue
    }

    const rng = mulberry32(hashString(seed + ':town:' + roll + ':' + attemptIndex))
    const price = Math.max(1, Math.round(MARKET_BASE * (0.4 + rng() * 1.2))) // ±60%
    offers.push({ seed: s, price })
    attemptIndex++
  }

  return offers
}

export const offerMonster = (o: MarketOffer) => generateMonster(o.seed, { train: 0 })

export function buyMonster(g: GameState, index: number): GameState {
  const o = g.market[index]
  if (!o || g.gold < o.price || g.stable.length >= g.barnCapacity) return g

  const monster = generateMonster(o.seed, { train: 0 })
  const bodyType = monster.species.body

  // Check licensing requirements for exclusive creatures
  const isExclusive = ['Draconic', 'Abyssal'].includes(bodyType)
  const isMythical = bodyType === 'Mythical'

  if (isExclusive && !g.specialLicense) return g
  if (isMythical && !g.eliteLicense) return g

  const c = newCareer(o.seed, { id: 'own-' + g.nextId + '-' + o.seed })
  const market = g.market.filter((_, i) => i !== index)
  return { ...g, gold: g.gold - o.price, stable: [...g.stable, c], market, activeId: g.activeId || c.id, nextId: g.nextId + 1 }
}

export function goto(g: GameState, area: Area): GameState {
  return { ...g, area }
}

// --- The weekly tick (§2): one canonical path that advances the whole game ---
// Per monster: feed first (start-of-week choice, at this week's prices), then the
// chosen activity. Monsters with no plan (or retired) still age. Lab rental is
// charged once. The global clock advances; food prices reroll weekly and the
// monster market restocks at the start of each month.
export interface WeekPlanEntry { activity: string; food: Food | '' } // activity: drill id | 'rest' | 'excursion'

export function advanceWeek(g: GameState, plans: Record<string, WeekPlanEntry>): GameState {
  let gold = g.gold
  let rentalDue = g.frozen.length * RENTAL_PER_FROZEN
  const stable = g.stable.map((c) => {
    const plan = plans[c.id]
    let cur = c
    if (plan?.food && !c.retired) {
      const fed = buyFood(cur, gold, plan.food, g.foodMarket, g.bulkFood ? 0.8 : 1)
      cur = fed.c
      gold = fed.gold
    }
    if (c.retired || !plan) return ageOneWeek(cur)
    const action: WeeklyAction =
      plan.activity === 'rest' ? { kind: 'rest' }
        : plan.activity === 'excursion' ? { kind: 'excursion' }
          : { kind: 'train', drillId: plan.activity }
    const r = applyWeek(cur, action, gold, rentalDue)
    rentalDue = 0 // charged once per week, not per monster
    gold = r.gold
    return r.c
  })
  if (rentalDue > 0) gold -= rentalDue // no monster processed the charge (all retired/unplanned)

  const week = g.week + 1
  const monthTurned = week % WEEKS_PER_MONTH === 0
  return {
    ...g,
    stable,
    gold,
    week,
    foodMarket: rollMarket(g.seed, week),
    market: monthTurned
      ? rollMarketOffers(g.seed, week / WEEKS_PER_MONTH, g.specialLicense, g.eliteLicense)
      : g.market,
  }
}

export function promoteMonster(g: GameState, id: string): GameState {
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  const { c: nc, gold } = rankUp(c, g.gold)
  return { ...g, gold, stable: g.stable.map((x) => (x.id === id ? nc : x)) }
}

// --- Lab (§13.1): freeze / thaw / fuse ---
export function freeze(g: GameState, id: string): GameState {
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  const fr: Frozen = {
    id: c.id, name: c.name, species: c.species, sex: c.sex,
    stats: { ...c.stats }, favouriteFood: c.favouriteFood, hatedFood: c.hatedFood,
    licenseIndex: c.licenseIndex,
  }
  const stable = g.stable.filter((x) => x.id !== id)
  const activeId = g.activeId === id ? stable[0]?.id ?? '' : g.activeId
  return { ...g, stable, frozen: [...g.frozen, fr], activeId }
}

export function thaw(g: GameState, fid: string): GameState {
  if (g.stable.length >= g.barnCapacity) return g
  const fr = g.frozen.find((x) => x.id === fid)
  if (!fr) return g
  const c = careerFromFrozen(fr, fr.id)
  return {
    ...g,
    stable: [...g.stable, c],
    frozen: g.frozen.filter((x) => x.id !== fid),
    activeId: g.activeId || c.id,
  }
}

export const fusionRoom = (g: GameState): boolean => g.stable.length < g.barnCapacity

export function fuse(g: GameState, aId: string, bId: string): GameState {
  if (aId === bId || g.gold < FUSION_COST || !fusionRoom(g)) return g
  const a = g.frozen.find((x) => x.id === aId)
  const b = g.frozen.find((x) => x.id === bId)
  if (!a || !b) return g
  // Baby potential = average of the two sources − a small penalty (§10.2). The full
  // genome/appearance-parts model is a later TODO; here we average current stats.
  const stats = {} as Stats
  for (const s of STATS) stats[s as Stat] = Math.max(1, Math.round(((a.stats[s] + b.stats[s]) / 2) * FUSION_PENALTY))
  const babySeed = 'fuse-' + a.id + '+' + b.id
  const baby = newCareer(babySeed, { id: 'own-fuse-' + g.nextId + '-' + babySeed, ageWeeks: 0, stats, licenseIndex: 0 })
  baby.species = a.species // base parent supplies the frame (§10.1)
  baby.log = [`A fusion of ${a.name} and ${b.name} hatches — a baby with inherited promise (unlicensed).`]
  return {
    ...g,
    gold: g.gold - FUSION_COST,
    stable: [...g.stable, baby],
    frozen: g.frozen.filter((x) => x.id !== aId && x.id !== bId),
    nextId: g.nextId + 1,
  }
}

function careerFromFrozen(fr: Frozen, id: string): Career {
  // Restore a raising shell from a banked genome, preserving stats + league. The
  // monster returns at Teen age (its prior calendar position isn't banked).
  const c = newCareer(fr.id, { id, stats: fr.stats, licenseIndex: fr.licenseIndex })
  c.name = fr.name
  c.species = fr.species
  c.sex = fr.sex
  c.favouriteFood = fr.favouriteFood
  c.hatedFood = fr.hatedFood
  c.log = [`${fr.name} the ${fr.species.name} is thawed and back in your stable.`]
  return c
}

// --- Ranch Shop (§13.1): barn capacity + bulk-food upgrades ---
export const barnCost = (g: GameState): number => 120 * g.barnCapacity

export function upgradeBarn(g: GameState): GameState {
  const cost = barnCost(g)
  if (g.gold < cost) return g
  return { ...g, gold: g.gold - cost, barnCapacity: g.barnCapacity + 1 }
}

export function buyBulkFood(g: GameState): GameState {
  if (g.bulkFood || g.gold < BULK_FOOD_COST) return g
  return { ...g, gold: g.gold - BULK_FOOD_COST, bulkFood: true }
}

export function buySpecialLicense(g: GameState): GameState {
  if (g.specialLicense || g.gold < SPECIAL_LICENSE_COST) return g
  return { ...g, gold: g.gold - SPECIAL_LICENSE_COST, specialLicense: true }
}

export function buyEliteLicense(g: GameState): GameState {
  if (g.eliteLicense || g.gold < ELITE_LICENSE_COST) return g
  return { ...g, gold: g.gold - ELITE_LICENSE_COST, eliteLicense: true }
}
