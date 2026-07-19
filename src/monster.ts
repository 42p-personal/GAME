// Seed -> monster generator (§10.1 genome idea, simplified) plus derived values.
import {
  FOODS, LEAGUES, Monster, Move, RNG, STATS, Stat, Stats, classForStats, hashString,
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
// monster grows along its natural lean. Each stat is clamped to 1000.
function applyTraining(base: Stats, train: number, rng: RNG): Stats {
  const stats: Stats = { ...base }
  const total = STATS.reduce((sum, k) => sum + base[k], 0)
  for (const k of STATS) {
    const weight = base[k] / total
    // jitter each stat's share ±30% so no two monsters train identically
    const jitter = 0.7 + rng() * 0.6
    stats[k] = Math.min(1000, Math.round(stats[k] + train * weight * jitter))
  }
  return stats
}

// CON safety net, NOT a target average (loosened 2026-07-21 — low CON is now a
// real archetype, not a pure downside: turn order runs off CON ascending, so a
// light/low-CON build acts first — see turnOrderCompare in battle.ts). The
// original 45%-of-cap floor was pulling the whole population toward an
// average; that fought directly against "quite low CON should be common and
// achievable." Now it's a thin backstop only — 15% of league cap, and only a
// weak 10-30% of the gap closes — so most monsters land naturally low (often
// well under the target itself, since a below-target roll only partially
// closes toward it) and only the most degenerate rolls get nudged up at all.
// Still only ever pulls upward — naturally tanky species keep whatever CON
// they earned.
const CON_LEAGUE_TARGET_FRACTION = 0.15
function boostConstitution(stats: Stats, rng: RNG): Stats {
  const preBoostMax = Math.max(...STATS.map((k) => stats[k]))
  const cap = LEAGUES.find((l) => l.name === leagueForStat(preBoostMax))?.cap ?? LEAGUES[0].cap
  const target = cap * CON_LEAGUE_TARGET_FRACTION
  if (stats.CON >= target) return stats
  const pull = 0.1 + rng() * 0.2 // 10%-30% of the gap to the floor closes
  const boosted = stats.CON + (target - stats.CON) * pull
  return { ...stats, CON: Math.min(1000, Math.round(boosted)) }
}

// Hidden wild-instinct roll for GENERATED monsters — rivals, market offers,
// Sandbox opponents (user spec 2026-07-21). League scales it: Wood averages
// exactly the stated floor (40%), each league above trends ~6 points tamer.
// Tamer Elite is an EXCEPTION, not just the top of the curve (user spec
// 2026-07-21 follow-up: "make tamer an exception with max tameness for all
// animals, this is the elite") — every Tamer Elite monster is guaranteed 100,
// no roll, no variance; the tier is defined by total obedience. Every league
// below still rolls with variance, so it's a genuine per-individual trait
// there. Player monsters NEVER get this: `careerMonster()` builds its Monster
// by hand and simply never sets the field, so `tameness` stays undefined for
// anything the player raises — see chooseAction/wildAction in battle.ts,
// where undefined means "fully tame."
const TAMENESS_LEAGUE_BASE = 40 // Wood-league average — the spec's stated floor
const TAMENESS_LEAGUE_STEP = 6 // each league above Wood trends this much tamer
function rollTameness(maxStat: number, rng: RNG): number {
  const league = leagueForStat(maxStat)
  if (league === 'Tamer Elite') return 100
  const idx = Math.max(0, LEAGUES.findIndex((l) => l.name === league))
  const avg = TAMENESS_LEAGUE_BASE + idx * TAMENESS_LEAGUE_STEP
  return Math.max(5, Math.min(100, avg + randInt(rng, -18, 18)))
}

export function learnedMoves(stats: Stats): Move[] {
  return ALL_MOVES.filter((m) => stats[m.stat] >= m.learnLevel)
}

// Pick a 3-move loadout to MATCH the monster's class play style (user spec
// 2026-07-21: "make sure that the non player monster picks skills to match
// this play style"). With `stats`, damage moves are ranked by what this
// monster's stats can actually drive (power × the same (atk/40)^0.8 curve the
// battle sim uses, per channel), and support classes reserve slots for their
// signature utility: Tanks pack ward/guard/taunt, Sages pack heals and
// cleanses, Bards/Orators pack team buffs and enemy debuffs. Every reserved
// slot falls through to best-damage when nothing suitable is learned yet, so
// low-level monsters degrade gracefully. Without `stats` (legacy callers),
// falls back to raw-power ranking.
const expectedOutput = (m: Move) => m.power * (m.effects?.hits ? (m.effects.hits[0] + m.effects.hits[1]) / 2 : 1)

type MovePick = (mv: Move) => boolean
const isHeal: MovePick = (mv) => mv.type !== 'damage' && mv.power > 0
const isWardOrGuard: MovePick = (mv) => !!(mv.effects?.ward || mv.effects?.guard) && mv.type !== 'damage'
const isTaunt: MovePick = (mv) => !!mv.effects?.tauntForce
const isTeamBuff: MovePick = (mv) => mv.type !== 'damage' && mv.target === 'team'
const isEnemyDebuff: MovePick = (mv) => mv.type !== 'damage' && (mv.target === 'enemy' || mv.target === 'allEnemies')
const isCleanseOrRegen: MovePick = (mv) => !!(mv.effects?.cleanse || mv.effects?.regenBuff) && mv.type !== 'damage'

// Utility slots a support class fills before topping up with damage, in order.
const CLASS_UTILITY_SLOTS: Record<string, MovePick[]> = {
  Tank: [isTaunt, isWardOrGuard, isHeal],
  Spellshield: [isWardOrGuard, isHeal],
  Sage: [isHeal, isCleanseOrRegen],
  Orator: [isTeamBuff, isEnemyDebuff],
  Bard: [isTeamBuff, isEnemyDebuff],
}

export function chooseLoadout(learned: Move[], stats?: Stats): Move[] {
  const dmgScore = (m: Move) => stats
    ? expectedOutput(m) * Math.pow(Math.max(1, attackStat(stats, m.channel)) / 40, 0.8)
    : expectedOutput(m)
  const damage = learned.filter((m) => m.type === 'damage').sort((a, b) => dmgScore(b) - dmgScore(a))
  const support = learned.filter((m) => m.type !== 'damage').sort((a, b) => b.learnLevel - a.learnLevel)
  const out: Move[] = []

  // Support classes reserve slots for their signature utility first.
  if (stats) {
    const slots = CLASS_UTILITY_SLOTS[classForStats(stats)] ?? []
    for (const want of slots) {
      if (out.length >= 2) break // always keep at least one damage slot
      const pick = support.find((mv) => want(mv) && !out.includes(mv))
      if (pick) out.push(pick)
    }
  }

  // Fill remaining slots with the best damage this monster's stats can drive,
  // varied across stats where possible.
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

  const stats = boostConstitution(applyTraining(base, opts.train ?? 0, rng), rng)
  const learned = learnedMoves(stats)
  const loadout = chooseLoadout(learned, stats)
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
    tameness: rollTameness(maxStat, rng),
  }
}

// --- Derived combat values (§11) ---
// Battle fatigue (user spec 2026-07-19): entering a fight below full stamina
// debuffs ALL damage that monster deals. 76+ is rested (no penalty), then
// tiers: ≤75 → −10%, ≤50 → −20%, ≤40 → −30%, ≤25 → −50%. Rivals and sandbox
// monsters have no stamina tracked and always fight fresh.
export function staminaDamageMult(stamina: number): number {
  if (stamina >= 76) return 1
  if (stamina > 50) return 0.9
  if (stamina > 40) return 0.8
  if (stamina > 25) return 0.7
  return 0.5
}

export const maxHp = (s: Stats) => Math.round(50 + s.CON * 2.5)
export const maxMana = (s: Stats) => s.WIS
export const dodgeChance = (s: Stats) => Math.min(35, s.DEX * 0.06)

// Per-turn regen + proc chances derived from stats (user spec 2026-07-19) —
// every stat contributes a small battle bonus beyond its main role:
export const hpRegen = (s: Stats) => Math.floor(s.CON / 25) // +1 HP/turn per 25 CON
export const manaRegen = (s: Stats) => Math.round(2 + s.WIS * 0.01) + Math.floor(s.WIS / 50) // base + 1/turn per 50 WIS
export const critChance = (s: Stats) => Math.floor(s.DEX / 50) // % chance to deal double damage, per 50 DEX
export const mitigationPierce = (s: Stats) => Math.floor(s.STR / 100) * 0.01 // fraction of mitigation ignored, 1% per 100 STR
export const echoChance = (s: Stats) => Math.floor(s.INT / 100) // % chance a skill casts twice, per 100 INT
export const debuffReduction = (s: Stats) => Math.floor(s.CHA / 50) * 0.01 // incoming debuff magnitude cut, 1% per 50 CHA
export const debuffBonus = (s: Stats) => Math.floor(s.CHA / 50) // % added to own status-proc chance, per 50 CHA — MAY exceed the 50% design cap

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
// Multi-hit skills pay for their expected total output, not the per-hit power.
// Costs are 2× the base formula (user spec 2026-07-20: "increase all spell costs by 100%").
export function manaCost(m: Move): number {
  const avgHits = m.effects?.hits ? (m.effects.hits[0] + m.effects.hits[1]) / 2 : 1
  const base = m.type === 'damage' ? Math.max(4, Math.round(m.power * avgHits * 0.45))
    : m.power > 0 ? Math.max(6, Math.round(m.power * 0.4)) // heals
    : 6 // buffs / control / utility
  return base * 2
}
