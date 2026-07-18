// Seed -> monster generator (§10.1 genome idea, simplified) plus derived values.
import {
  FOODS, Monster, Move, RNG, STATS, Stat, Stats, classForStats, hashString,
  leagueForStat, mulberry32, pick, randInt, ULTIMATE_LEVEL,
} from './core'
import { ALL_MOVES } from './moves'
import { SPECIES } from './species'

const NAME_PARTS = ['Ash', 'Bru', 'Cor', 'Dra', 'Fen', 'Gru', 'Ky', 'Lo', 'Mor', 'Nyx', 'Pyr', 'Qui', 'Rho', 'Syl', 'Tho', 'Vex', 'Wyn', 'Zar']
const NAME_TAILS = ['ak', 'en', 'ix', 'or', 'us', 'a', 'eth', 'io', 'ryn', 'ok']

function randomName(rng: RNG): string {
  return pick(rng, NAME_PARTS) + pick(rng, NAME_TAILS)
}

// Spend `train` points across stats, weighted by the species' base spread so a
// monster grows along its natural lean. Each stat is clamped to 999.
function applyTraining(base: Stats, train: number, rng: RNG): Stats {
  const stats: Stats = { ...base }
  const total = STATS.reduce((sum, k) => sum + base[k], 0)
  for (const k of STATS) {
    const weight = base[k] / total
    // jitter each stat's share ±30% so no two monsters train identically
    const jitter = 0.7 + rng() * 0.6
    stats[k] = Math.min(999, Math.round(stats[k] + train * weight * jitter))
  }
  return stats
}

export function learnedMoves(stats: Stats): Move[] {
  return ALL_MOVES.filter((m) => stats[m.stat] >= m.learnLevel)
}

// Pick a 3-move loadout: favour high-power damage, but keep it varied across stats.
export function chooseLoadout(learned: Move[]): Move[] {
  const damage = learned.filter((m) => m.type === 'damage').sort((a, b) => b.power - a.power)
  const support = learned.filter((m) => m.type !== 'damage').sort((a, b) => b.learnLevel - a.learnLevel)
  const out: Move[] = []
  const seenStats = new Set<Stat>()
  for (const m of damage) {
    if (out.length >= 3) break
    if (!seenStats.has(m.stat) || out.length < 2) { out.push(m); seenStats.add(m.stat) }
  }
  for (const m of [...damage, ...support]) {
    if (out.length >= 3) break
    if (!out.includes(m)) out.push(m)
  }
  return out.slice(0, 3)
}

export interface GenOptions { train?: number }

export function generateMonster(seed: string, opts: GenOptions = {}): Monster {
  const rng = mulberry32(hashString(seed || 'egg'))
  const species = SPECIES[hashString(seed || 'egg') % SPECIES.length]
  const sex = rng() < 0.5 ? 'M' : 'F'

  // Individual variance (±5), order-preserving: jittered values are re-assigned
  // largest-to-largest along the species' base ranking, so siblings differ in
  // magnitude but a species' stat hierarchy (and thus its class) never flips.
  const base: Stats = { ...species.base }
  const jittered = STATS.map((k) => Math.max(1, species.base[k] + randInt(rng, -5, 5))).sort((a, b) => b - a)
  const ranked = [...STATS].sort((a, b) => species.base[b] - species.base[a])
  ranked.forEach((k, i) => { base[k] = jittered[i] })

  const stats = applyTraining(base, opts.train ?? 0, rng)
  const learned = learnedMoves(stats)
  const loadout = chooseLoadout(learned)
  const maxStat = Math.max(...STATS.map((k) => stats[k]))

  const favouriteFood = pick(rng, FOODS).id
  let hatedFood = pick(rng, FOODS).id
  while (hatedFood === favouriteFood) hatedFood = pick(rng, FOODS).id

  return {
    seed,
    name: randomName(rng),
    species,
    sex,
    stats,
    className: classForStats(stats),
    league: leagueForStat(maxStat),
    learned,
    loadout,
    ultimateUnlocked: maxStat >= ULTIMATE_LEVEL,
    favouriteFood,
    hatedFood,
  }
}

// --- Derived combat values (§11) ---
export const maxHp = (s: Stats) => Math.round(50 + s.CON * 2.5)
export const maxMana = (s: Stats) => Math.round(20 + s.WIS * 1.5)
export const manaRegen = (s: Stats) => Math.round(2 + s.WIS * 0.12)
export const dodgeChance = (s: Stats) => Math.min(35, s.DEX * 0.06)

export function attackStat(s: Stats, channel: Move['channel']): number {
  switch (channel) {
    case 'melee': return s.STR
    case 'ranged': return s.DEX
    case 'magic': return s.INT
    case 'voice': return s.CHA
    case 'support': return s.WIS
  }
}

// Mana cost per skill (battle-choice design): EVERY skill costs MP, whatever its
// channel — if a monster can't afford any equipped skill it must Attack or Block.
// The universal Attack/Block actions (battle.ts) are the only free options.
export function manaCost(m: Move): number {
  if (m.type === 'damage') return Math.max(4, Math.round(m.power * 0.45))
  if (m.power > 0) return Math.max(6, Math.round(m.power * 0.4)) // heals
  return 6 // buffs / control / utility
}
