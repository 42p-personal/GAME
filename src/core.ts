// Core types, RNG, and shared game constants for Monster Tamer.
// See docs/GAME_DESIGN.md for the design these mirror.

export type Stat = 'STR' | 'DEX' | 'CON' | 'WIS' | 'INT' | 'CHA'
export const STATS: Stat[] = ['STR', 'DEX', 'CON', 'WIS', 'INT', 'CHA']
export const STAT_NAMES: Record<Stat, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  WIS: 'Wisdom',
  INT: 'Intelligence',
  CHA: 'Charisma',
}
export type Stats = Record<Stat, number>

export type BodyType = 'Mammal' | 'Avian' | 'Marsupial' | 'Aquatic'
export type Sex = 'M' | 'F'

export type Channel = 'melee' | 'ranged' | 'magic' | 'voice' | 'support'
export type MoveType = 'damage' | 'buff' | 'debuff' | 'status' | 'control'
export type Target = 'enemy' | 'allEnemies' | 'self' | 'ally' | 'team'
export type StatusKind = 'blind' | 'poison' | 'burn' | 'fear' | 'confusion' | 'stun' | 'knockback'

export interface MoveStatus { kind: StatusKind; chance: number; duration: number }

export interface Move {
  id: string
  name: string
  stat: Stat // which stat pool gates it
  learnLevel: number
  type: MoveType
  channel: Channel
  target: Target
  cooldown: number
  accuracy: number // 0..100
  power: number // damage / heal scale; 0 for pure utility
  status?: MoveStatus
  desc: string
}

export interface Ability { name: string; desc: string }

export interface Species {
  id: string
  name: string
  body: BodyType
  naturalClass: string
  base: Stats
  lifespan: number // retiree age in years
  innate: Ability[]
  ultimate: Ability
  flavour: string
}

export interface Monster {
  seed: string
  name: string
  species: Species
  sex: Sex
  stats: Stats
  className: string
  league: string
  learned: Move[]
  loadout: Move[]
  ultimateUnlocked: boolean
}

// --- Leagues (license -> stat cap), §3 ---
export interface League { name: string; cap: number }
export const LEAGUES: League[] = [
  { name: 'Wood', cap: 100 },
  { name: 'Copper', cap: 200 },
  { name: 'Tin', cap: 300 },
  { name: 'Bronze', cap: 400 },
  { name: 'Iron', cap: 500 },
  { name: 'Silver', cap: 600 },
  { name: 'Gold', cap: 700 },
  { name: 'Platinum', cap: 800 },
  { name: 'Masters', cap: 900 },
  { name: 'Tamer Elite', cap: 999 },
]

export function leagueForStat(maxStat: number): string {
  for (const l of LEAGUES) if (maxStat <= l.cap) return l.name
  return 'Tamer Elite'
}

// --- Classes (primary/secondary), balanced table §6 ---
export interface ClassDef { name: string; primary: Stat; secondary: Stat }
export const CLASSES: ClassDef[] = [
  { name: 'Tank', primary: 'CON', secondary: 'STR' },
  { name: 'Warrior', primary: 'STR', secondary: 'CON' },
  { name: 'Rogue', primary: 'DEX', secondary: 'STR' },
  { name: 'Ranger', primary: 'DEX', secondary: 'INT' },
  { name: 'Sage', primary: 'WIS', secondary: 'INT' },
  { name: 'Wizard', primary: 'INT', secondary: 'WIS' },
  { name: 'Spellsword', primary: 'INT', secondary: 'CON' },
  { name: 'Spellshield', primary: 'CON', secondary: 'WIS' },
  { name: 'Captain', primary: 'STR', secondary: 'CHA' },
  { name: 'Orator', primary: 'CHA', secondary: 'DEX' },
  { name: 'Bard', primary: 'CHA', secondary: 'DEX' },
]

// Emergent class from the two highest stats (§6.2). Falls back to Generalist.
export function classForStats(stats: Stats): string {
  const ordered = [...STATS].sort((a, b) => stats[b] - stats[a])
  const [p, s] = ordered
  const hit = CLASSES.find((c) => c.primary === p && c.secondary === s)
  return hit ? hit.name : 'Generalist'
}

// --- Status descriptions (§7.6) ---
export const STATUS_INFO: Record<StatusKind, string> = {
  blind: 'Lowers the target’s chance to hit.',
  poison: 'Ongoing mana damage.',
  burn: 'Ongoing HP damage (fire).',
  fear: 'Briefly flees; loses its action.',
  confusion: 'Next ability may hit itself (20%).',
  stun: 'Cannot act briefly.',
  knockback: 'Shoved back; next action delayed.',
}

// --- Learn ladder (§7.2) ---
export const LEARN_LADDER = [40, 90, 160, 240, 330, 430, 540, 650, 780, 920]
export const ULTIMATE_LEVEL = 600

// --- Seeded RNG: mulberry32 + string hash ---
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RNG = () => number
export const randInt = (rng: RNG, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min
export const chance = (rng: RNG, pct: number) => rng() * 100 < pct
export const pick = <T>(rng: RNG, arr: T[]): T => arr[Math.floor(rng() * arr.length)]
