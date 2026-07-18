// Shared game state + the Town hub economy (§13). One gold wallet and one stable
// span all areas; the Ranch (src/game.ts) raises the active monster week by week.
import {
  Food, Sex, Species, Stat, STATS, Stats, hashString, mulberry32,
} from './core'
import { generateMonster } from './monster'
import {
  Career, START_GOLD, WeeklyAction, applyWeek, buyFood, newCareer, rankUp, stageInfo,
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
  stable: Career[]
  activeId: string
  frozen: Frozen[]
  barnCapacity: number
  bulkFood: boolean // Ranch Shop upgrade: 20% off food
  specialLicense: boolean // Silver rank: unlock Draconic + Abyssal
  eliteLicense: boolean // Masters rank: unlock Mythical
  area: Area
  market: MarketOffer[]
  marketRoll: number
}

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
    stable: [],
    activeId: '',
    frozen: [],
    barnCapacity: START_BARN,
    bulkFood: false,
    specialLicense: false,
    eliteLicense: false,
    area: 'town',
    market: rollMarketOffers(seed, 0),
    marketRoll: 0,
  }
}

// --- Market (§13.1) — 3 equal-weighted base monsters; price band wider than food. ---
export function rollMarketOffers(seed: string, roll: number): MarketOffer[] {
  const offers: MarketOffer[] = []
  for (let i = 0; i < 3; i++) {
    const rng = mulberry32(hashString(seed + ':town:' + roll + ':' + i))
    const s = 'mkt-' + hashString(seed + ':' + roll + ':' + i).toString(36)
    const price = Math.max(1, Math.round(MARKET_BASE * (0.4 + rng() * 1.2))) // ±60%
    offers.push({ seed: s, price })
  }
  return offers
}

export const offerMonster = (o: MarketOffer) => generateMonster(o.seed, { train: 0 })

let boughtCounter = 0
export function buyMonster(g: GameState, index: number): GameState {
  const o = g.market[index]
  if (!o || g.gold < o.price || g.stable.length >= g.barnCapacity) return g
  const c = newCareer(o.seed, { id: 'own-' + boughtCounter++ + '-' + o.seed })
  const market = g.market.filter((_, i) => i !== index)
  return { ...g, gold: g.gold - o.price, stable: [...g.stable, c], market, activeId: g.activeId || c.id }
}

export function refreshMarket(g: GameState): GameState {
  const roll = g.marketRoll + 1
  return { ...g, marketRoll: roll, market: rollMarketOffers(g.seed, roll) }
}

// --- Active-monster helpers + Ranch loop wrappers (fold gold + rental into state) ---
export const activeCareer = (g: GameState): Career | undefined =>
  g.stable.find((c) => c.id === g.activeId) ?? g.stable[0]

const replaceActive = (g: GameState, c: Career): GameState => ({
  ...g,
  stable: g.stable.map((x) => (x.id === g.activeId ? c : x)),
})

export function setActive(g: GameState, id: string): GameState {
  return g.stable.some((c) => c.id === id) ? { ...g, activeId: id } : g
}

export function goto(g: GameState, area: Area): GameState {
  return { ...g, area }
}

// Age all stable monsters by one week (they all age regardless of activity).
function ageStableMonster(c: Career): Career {
  const { stage: nowStage } = stageInfo(c.ageWeeks + 1, c.species.lifespan)
  const { stage: oldStage } = stageInfo(c.ageWeeks, c.species.lifespan)
  const n: Career = { ...c, week: c.week + 1, ageWeeks: c.ageWeeks + 1, log: [...c.log] }
  if (nowStage !== oldStage) {
    if (nowStage === 'Retiree') {
      n.retired = true
      n.log.push(`🏁 ${n.name} has reached retirement age and can no longer compete.`)
    } else {
      n.log.push(`  ↳ ${n.name} is now ${nowStage}${nowStage === 'Elder' ? ' (−20% training)' : nowStage === 'Fully Grown' ? ' (−5% training)' : ''}.`)
    }
  }
  return n
}

export function weekAction(g: GameState, action: WeeklyAction): GameState {
  const c = activeCareer(g)
  if (!c) return g
  const rental = g.frozen.length * RENTAL_PER_FROZEN
  const { c: nc, gold } = applyWeek(c, action, g.gold, rental)
  // Age all stable monsters (not just the active one)
  const aged = g.stable.map((m) => m.id === c.id ? nc : ageStableMonster(m))
  return { ...g, stable: aged, gold, activeId: c.id }
}

export function feed(g: GameState, food: Food): GameState {
  const c = activeCareer(g)
  if (!c) return g
  const { c: nc, gold } = buyFood(c, g.gold, food, g.bulkFood ? 0.8 : 1)
  return { ...replaceActive({ ...g, activeId: c.id }, nc), gold }
}

export function promote(g: GameState): GameState {
  const c = activeCareer(g)
  if (!c) return g
  const { c: nc, gold } = rankUp(c, g.gold)
  return { ...replaceActive({ ...g, activeId: c.id }, nc), gold }
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
  const baby = newCareer(babySeed, { id: 'own-fuse-' + boughtCounter++ + '-' + babySeed, ageWeeks: 0, stats, licenseIndex: 0 })
  baby.species = a.species // base parent supplies the frame (§10.1)
  baby.log = [`A fusion of ${a.name} and ${b.name} hatches — a baby with inherited promise (unlicensed).`]
  return {
    ...g,
    gold: g.gold - FUSION_COST,
    stable: [...g.stable, baby],
    frozen: g.frozen.filter((x) => x.id !== aId && x.id !== bId),
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
