// N-vs-N simultaneous team battle simulator (§11, extended for team tournaments
// 2026-07-21). Deterministic given a seed. Teamfight-Manager style: no player
// input mid-fight — each monster's build + the shared battlefield state decides
// the outcome. All combatants across both teams act on ONE shared initiative
// order each round (lowest CON first — light builds are fast), and moves
// resolve against REAL targets
// (a single enemy, every enemy, a single ally, or the whole team) rather than
// always collapsing onto "the only other fighter" — the old assumption from
// when this was strictly 1v1. `simulateBattle` (still exported) is a thin
// team-of-1 wrapper over `simulateTeamBattle`, so every existing 1v1 call site
// (Sandbox) keeps working unchanged.
import { Channel, Element, Monster, Move, RNG, StatusKind, chance, elementMultiplier, happinessMultiplier, hashString, mulberry32, randInt } from './core'
import {
  attackStat, critChance, debuffBonus, debuffReduction, dodgeChance, echoChance, hpRegen,
  manaCost, manaRegen, maxHp, maxMana, mitigationPierce, staminaDamageMult,
} from './monster'

interface ActiveStatus { kind: StatusKind; turns: number }

// --- Structured battle events: the animatable beat stream the arena renders.
// The text log is kept alongside for the readable transcript. Every event that
// identifies a specific fighter carries `slot` (its 0-based roster position)
// alongside `side`; events with a distinct target also carry `targetSide`/
// `targetSlot` — with more than one possible fighter per side, "the other
// side" is no longer enough to infer who was hit.
export type BattleSide = 'A' | 'B'
export type BattleEvent =
  | { kind: 'round'; n: number }
  | { kind: 'hit'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; channel: Channel; element?: Element; dmg: number; hits: number; crit: boolean; execute: boolean; eff: 'super' | 'resist' | null; lifesteal: number; manaBurn: number; recoil: number; warded: number; self: boolean }
  | { kind: 'miss'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; channel: Channel; blocked: boolean }
  | { kind: 'stance'; side: BattleSide; slot: number; avoid: number }
  | { kind: 'utility'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; heal: number; hostile: boolean }
  | { kind: 'status'; side: BattleSide; slot: number; status: StatusKind } // side/slot = the afflicted
  | { kind: 'dot'; side: BattleSide; slot: number; status: 'burn' | 'poison'; amount: number }
  | { kind: 'skip'; side: BattleSide; slot: number; reason: 'stun' | 'fear' }
  | { kind: 'ultimate'; side: BattleSide; slot: number; name: string }
  | { kind: 'snap'; states: { side: BattleSide; slot: number; hp: number; mana: number; ward: number }[] }
  | { kind: 'end'; winner: 'A' | 'B' | 'draw' }

// Passive effects granted by innate abilities (§8.3). Curated table by ability
// name; unlisted innates stay flavour-only for now. A species' two innates stack.
interface InnateEffect {
  flatDR?: number // flat damage reduction on every hit taken
  dodge?: number // bonus dodge %
  acc?: number // bonus accuracy %
  regen?: number // bonus mana regen per turn
  dmgMult?: number // multiplier on all damage dealt
  firstHitMult?: number // multiplier on this monster's first damaging hit
  lifesteal?: number // fraction of damage dealt returned as HP
}

const INNATE_EFFECTS: Record<string, InnateEffect> = {
  // damage reduction
  'Thick Hide': { flatDR: 3 }, Ironclad: { flatDR: 3 }, 'Ancient Carapace': { flatDR: 3 },
  Immovable: { flatDR: 2 }, 'Spiral Shell': { flatDR: 2 }, 'Coral Guard': { flatDR: 2 },
  Ward: { flatDR: 2 }, Unstoppable: { flatDR: 3 }, Unison: { flatDR: 2 }, 'Aegis Bond': { flatDR: 2 },
  // evasion
  Evasion: { dodge: 8 }, Quickstep: { dodge: 6 }, Aerial: { dodge: 6 }, 'Phase Shift': { dodge: 8 },
  'Dodge Storm': { dodge: 6 }, 'Cloak of Shadow': { dodge: 8 }, 'Ink Cloud': { dodge: 5 },
  Cheer: { dodge: 4 }, Southpaw: { dodge: 4 }, 'Psychic Aura': { dodge: 5 }, 'Ancient Knowing': { dodge: 5 },
  'Temporal Distortion': { dodge: 4 }, Foresight: { dodge: 6 },
  // accuracy
  'Keen Eye': { acc: 8 }, 'Cosmic Precision': { acc: 10 },
  // mana engines
  Wellspring: { regen: 3 }, 'Silent Wisdom': { regen: 3 }, 'Tidal Wisdom': { regen: 3 },
  'Glacial Wisdom': { regen: 3 }, 'Arcane Mastery': { regen: 4 }, 'Mana Theft': { regen: 2 },
  'Soothing Words': { regen: 2 }, 'Life Bloom': { regen: 2 },
  // damage boosts
  Maul: { dmgMult: 1.08 }, Overload: { dmgMult: 1.08 }, 'Rising Fury': { dmgMult: 1.05 }, Pride: { dmgMult: 1.05 },
  'Rallying Roar': { dmgMult: 1.05 }, Flurry: { dmgMult: 1.05 }, 'Arcane Bolt': { dmgMult: 1.05 },
  'Song of Valor': { dmgMult: 1.05 }, Whirlwind: { dmgMult: 1.05 }, 'Tentacle Barrage': { dmgMult: 1.05 },
  'Live Wire': { dmgMult: 1.05 }, Spellblade: { dmgMult: 1.06 }, 'Flame Aura': { dmgMult: 1.05 },
  'Draconic Pride': { dmgMult: 1.06 }, Blizzard: { dmgMult: 1.05 }, 'Void Pulse': { dmgMult: 1.06 },
  'Rift Magic': { dmgMult: 1.06 }, 'Whip Strike': { dmgMult: 1.05 }, 'Stellar Shot': { dmgMult: 1.06 },
  'Spell Echo': { dmgMult: 1.1 }, Rend: { dmgMult: 1.05 },
  // openers
  'Chest Beat': { firstHitMult: 1.5 }, 'Dive Bomb': { firstHitMult: 1.5 }, 'Glide Strike': { firstHitMult: 1.3 },
  Haymaker: { firstHitMult: 1.3 }, 'Silent Strike': { firstHitMult: 1.5 }, 'Prehistoric Roar': { firstHitMult: 1.3 },
  // sustain
  Devour: { lifesteal: 0.3 }, 'Age Reversal': { lifesteal: 0.15 },
  // Insectoid
  'Chitin Plate': { flatDR: 3 }, Burrow: { dodge: 4 }, Ambush: { firstHitMult: 1.5 },
  'Serrated Claws': { dmgMult: 1.05 }, 'Web Trap': { dodge: 5 }, 'Venom Fang': { dmgMult: 1.05 },
  'Hive Command': { dmgMult: 1.05 }, 'Royal Jelly': { regen: 2 }, 'Skim Dart': { firstHitMult: 1.3 },
  'Compound Eyes': { acc: 8 },
  // Reptilian
  'Death Roll': { dmgMult: 1.08 }, 'Armored Scales': { flatDR: 3 }, 'Sun Basking': { regen: 2 },
  'Crest Display': { dmgMult: 1.05 }, 'Cold Blood': { flatDR: 2 }, 'Hypnotic Gaze': { acc: 8 },
  'Wall Runner': { dodge: 6 }, 'Tail Drop': { dodge: 4 }, 'Shell Ward': { flatDR: 3 },
  'Inner Calm': { regen: 3 },
}

function innateEffects(m: Monster): InnateEffect {
  const out: Required<InnateEffect> = { flatDR: 0, dodge: 0, acc: 0, regen: 0, dmgMult: 1, firstHitMult: 1, lifesteal: 0 }
  for (const ab of m.species.innate) {
    const e = INNATE_EFFECTS[ab.name]
    if (!e) continue
    out.flatDR += e.flatDR ?? 0
    out.dodge += e.dodge ?? 0
    out.acc += e.acc ?? 0
    out.regen += e.regen ?? 0
    out.dmgMult *= e.dmgMult ?? 1
    out.firstHitMult = Math.max(out.firstHitMult, e.firstHitMult ?? 1)
    out.lifesteal += e.lifesteal ?? 0
  }
  return out
}

const activePassives = (m: Monster) => m.species.innate.filter((ab) => INNATE_EFFECTS[ab.name]).map((ab) => ab.name)

// A single timed buff/debuff currently active on a combatant, counted down once
// per ROUND (not per action) and removed on expiry — nothing lasts "for the
// fight" anymore. Re-applying the same move id refreshes turnsLeft instead of
// stacking a second copy.
interface ActiveMod {
  moveId: string
  turnsLeft: number
  atkBuff?: number; defBuff?: number; dodgeBuff?: number; accBuff?: number; regenBuff?: number
  atkDebuff?: number; defDebuff?: number; accDebuff?: number
}

interface Combatant {
  m: Monster
  side: BattleSide
  slot: number // 0-based position within its own team's roster array
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  cooldowns: Record<string, number> // moveId -> turns remaining
  statuses: ActiveStatus[]
  guard: number // temporary flat damage reduction until next action (guard effects)
  ward: number // absorb shield HP — soaks damage before health (ward effects)
  blockAvoid: number // Block stance: bonus % chance to avoid hits until next action
  mods: ActiveMod[] // active timed buffs/debuffs (round-limited)
  // derived from `mods` — recomputed via recomputeMods() whenever mods changes
  atkMod: number // multiplier on damage dealt (buffs raise, debuffs on self lower)
  defFlat: number // flat mitigation delta (Iron Skin raises, armour shred lowers)
  dodgeMod: number // additive % dodge
  accMod: number // additive % accuracy
  regenMod: number // additive mana regen
  happiness: number // 0..10, scales damage dealt (§2.4)
  staminaMult: number // fatigue damage multiplier, fixed at fight start (staminaDamageMult)
  innate: Required<InnateEffect>
  hasLandedHit: boolean // first-hit bonuses spend after the first damaging hit
  ultimateUsed: boolean
  wasKOd: boolean // true once hp has ever hit <=0 — drives the per-individual injury system
  // Taunted: single-target hostile actions are FORCED onto the taunter while
  // this lasts (ticked down per round alongside mods; cleared if the taunter
  // falls). This is what makes Tanks work despite acting last in the
  // CON-ascending turn order — they redirect damage into their HP pool.
  tauntedBy: { side: BattleSide; slot: number; turnsLeft: number } | null
}

// Rebuild the 5 cached modifier totals from the active mods list. Call after any
// mods mutation (apply, expiry).
function recomputeMods(c: Combatant): void {
  let atkMod = 1, defFlat = 0, dodgeMod = 0, accMod = 0, regenMod = 0
  for (const m of c.mods) {
    if (m.atkBuff) atkMod *= 1 + m.atkBuff
    if (m.atkDebuff) atkMod *= 1 - m.atkDebuff
    if (m.defBuff) defFlat += m.defBuff
    if (m.defDebuff) defFlat -= m.defDebuff
    if (m.dodgeBuff) dodgeMod += m.dodgeBuff
    if (m.accBuff) accMod += m.accBuff
    if (m.accDebuff) accMod -= m.accDebuff
    if (m.regenBuff) regenMod += m.regenBuff
  }
  c.atkMod = atkMod; c.defFlat = defFlat; c.dodgeMod = dodgeMod; c.accMod = accMod; c.regenMod = regenMod
}

// Tick every active mod down by one ROUND (called once per round, not per turn);
// prune anything that's expired and rebuild the cached totals.
function tickMods(c: Combatant): void {
  for (const m of c.mods) m.turnsLeft--
  c.mods = c.mods.filter((m) => m.turnsLeft > 0)
  if (c.tauntedBy && --c.tauntedBy.turnsLeft <= 0) c.tauntedBy = null
  recomputeMods(c)
}

export interface BattleResult {
  log: string[]
  events: BattleEvent[]
  winner: 'A' | 'B' | 'draw'
  winnerName: string
  // where every combatant on BOTH teams ended the fight, and whether they were
  // ever KO'd along the way — the tournament resolver carries these forward
  // per-individual (injury system), not just for a single win/loss pair.
  finals: { side: BattleSide; slot: number; hp: number; mana: number; wasKOd: boolean }[]
}

function makeCombatant(m: Monster, happiness: number, side: BattleSide, slot: number): Combatant {
  return {
    m,
    side,
    slot,
    // injuries persist: a monster fights from its CURRENT HP/MP when tracked
    hp: Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats)),
    maxHp: maxHp(m.stats),
    mana: Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats)),
    maxMana: maxMana(m.stats),
    cooldowns: {},
    statuses: [],
    guard: 0,
    ward: 0,
    blockAvoid: 0,
    mods: [],
    atkMod: 1,
    defFlat: 0,
    dodgeMod: 0,
    accMod: 0,
    regenMod: 0,
    happiness,
    staminaMult: staminaDamageMult(m.stamina ?? 100),
    innate: innateEffects(m) as Required<InnateEffect>,
    hasLandedHit: false,
    ultimateUsed: false,
    wasKOd: false,
    tauntedBy: null,
  }
}

// --- Shared-battlefield context: both teams flattened into one list, plus the
// helpers every targeting decision is built from. ---
interface BattleContext { all: Combatant[] }
const livingTeamOf = (ctx: BattleContext, side: BattleSide) => ctx.all.filter((c) => c.side === side && c.hp > 0)
const enemiesOf = (ctx: BattleContext, c: Combatant) => livingTeamOf(ctx, c.side === 'A' ? 'B' : 'A')
const alliesOf = (ctx: BattleContext, c: Combatant) => livingTeamOf(ctx, c.side).filter((x) => x !== c)
// Lowest-HP%-first — rewards finishing blows / prioritizes the neediest ally.
// Array.sort is spec-stable, so ties preserve roster (slot) order.
const pickEnemyTarget = (foes: Combatant[]) => foes.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
const pickAllyTarget = (allies: Combatant[]) => allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]

// Does this move apply a timed self-buff (round-limited, refreshed on recast)?
const isTimedBuff = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkBuff !== undefined || e.defBuff !== undefined || e.dodgeBuff !== undefined
    || e.accBuff !== undefined || e.regenBuff !== undefined)
}
const isDebuffMove = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkDebuff !== undefined || e.defDebuff !== undefined || e.accDebuff !== undefined)
}

const hasStatus = (c: Combatant, k: StatusKind) => c.statuses.some((s) => s.kind === k)

function tickStatuses(c: Combatant, log: string[], ev: BattleEvent[]): void {
  for (const st of c.statuses) {
    if (st.kind === 'burn') {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.05))
      c.hp -= dmg
      log.push(`  ${c.m.name} suffers ${dmg} burn damage.`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'burn', amount: dmg })
    } else if (st.kind === 'poison') {
      const dmg = Math.max(1, Math.round(c.maxMana * 0.15))
      c.mana = Math.max(0, c.mana - dmg)
      log.push(`  ${c.m.name} loses ${dmg} mana to poison.`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'poison', amount: dmg })
    }
    st.turns--
  }
  c.statuses = c.statuses.filter((s) => s.turns > 0)
}

// --- Universal free actions (battle-choice design) ---
// Every skill costs MP; when none is affordable the monster must Attack or Block.
const ATTACK_POWER = 12
const FREE_MOVE_IDS = new Set(['attack', 'ultimate'])
const moveCost = (mv: Move) => (FREE_MOVE_IDS.has(mv.id) ? 0 : manaCost(mv))

// Basic attack through the monster's best offensive channel (a wizard's "attack"
// is a bolt, a bard's a taunt) — free, always available.
function basicAttack(m: Monster): Move {
  const channels: Move['channel'][] = ['melee', 'ranged', 'magic', 'voice']
  const best = channels.reduce((a, b) => (attackStat(m.stats, a) >= attackStat(m.stats, b) ? a : b))
  return {
    id: 'attack', name: 'Attack', stat: 'STR', learnLevel: 0, type: 'damage',
    channel: best, target: 'enemy', cooldown: 0, accuracy: 95, power: ATTACK_POWER, desc: 'A basic attack.',
  }
}

// Block: defensive stance until the blocker's next action — raises the chance to
// NOT take a hit at all. Scales gently with WIS (composure under pressure).
const blockValue = (c: Combatant) => Math.min(55, Math.round(30 + c.m.stats.WIS * 0.05))

type Action = { kind: 'skill'; move: Move } | { kind: 'attack' } | { kind: 'block' }

// Expected output of a damage skill, for comparing against the free Attack:
// multi-hit totals count, and execute range boosts value against weakened foes.
function effPower(mv: Move, foe: Combatant): number {
  const avgHits = mv.effects?.hits ? (mv.effects.hits[0] + mv.effects.hits[1]) / 2 : 1
  let p = mv.power * avgHits
  if (mv.effects?.execute && foe.hp / foe.maxHp <= mv.effects.execute) p *= 1.5
  return p
}

// Class battle personality (user spec 2026-07-21): each class tunes the SAME
// policy tree below rather than getting a bespoke one — Tanks shield early and
// block often, Sages heal at the first scratch, Wizards chain spells and
// charge mana instead of parrying, Rogues just keep swinging, Bards/Orators
// open with the band. Keyed off className, which is recomputed from CURRENT
// stats at fight time (classes are emergent, never species-locked).
interface ClassPersonality {
  healAt: number // hpFrac below which healing/guarding-up kicks in
  blockWhenHurt: number // % chance to block when hurt with a real hit incoming
  openBuff: number // % chance to open with a buff while healthy
  debuff: number // % chance to land a debuff/control move on a threat
  blockToCharge: number // % chance to block a turn to charge mana for a skill
  parry: number // % chance to block against a heavy incoming threat
  aggro: number // shifts the "damage skill worth its MP" threshold; negative = spammier
}
const DEFAULT_PERSONALITY: ClassPersonality = { healAt: 0.45, blockWhenHurt: 55, openBuff: 40, debuff: 35, blockToCharge: 50, parry: 35, aggro: 0 }
const CLASS_PERSONALITY: Record<string, Partial<ClassPersonality>> = {
  Tank: { healAt: 0.5, blockWhenHurt: 75, openBuff: 65, debuff: 60, parry: 55 }, // shields up early, taunts, blocks often
  Spellshield: { healAt: 0.55, blockWhenHurt: 70, openBuff: 60, parry: 50 },
  Warrior: { blockWhenHurt: 35, openBuff: 25, parry: 20, aggro: -4 }, // keeps swinging
  Rogue: { blockWhenHurt: 25, openBuff: 20, parry: 15, aggro: -4 }, // all-out
  Ranger: { debuff: 45, parry: 30 },
  Wizard: { blockToCharge: 80, openBuff: 15, aggro: -6 }, // chains spells; charges when dry
  Spellsword: { blockToCharge: 65, aggro: -4 },
  Sage: { healAt: 0.65, openBuff: 55, blockToCharge: 70 }, // heals early and often
  Orator: { openBuff: 70, debuff: 60 },
  Bard: { openBuff: 75, debuff: 55, blockWhenHurt: 45 },
  Captain: { openBuff: 50, aggro: -2 }, // buff the line, then brawl
}

// The per-turn choice: skill vs Attack vs Block. One shared policy tree, tuned
// per class via CLASS_PERSONALITY above. Takes a single representative `foe`
// (the AI's primary threat read) — target FAN-OUT for the move it picks is
// resolved separately once the move is actually cast (see resolveTargets).
function chooseAction(self: Combatant, foe: Combatant, rng: RNG): Action {
  const p = { ...DEFAULT_PERSONALITY, ...CLASS_PERSONALITY[self.m.className] }
  const ready = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  const heals = ready.filter((mv) => mv.type !== 'damage' && mv.power > 0)
  const dmgs = ready.filter((mv) => mv.type === 'damage').sort((a, b) => effPower(b, foe) - effPower(a, foe))
  // timed buffs not currently active (or about to expire — worth refreshing);
  // debuffs the foe isn't currently suffering from (or is about to shake off)
  const activeFor = (id: string) => (c: Combatant) => c.mods.find((m) => m.moveId === id)
  const buffs = ready.filter((mv) => mv.type !== 'damage' && mv.power === 0 && mv.target !== 'enemy' && mv.target !== 'allEnemies'
    && !(isTimedBuff(mv) && (activeFor(mv.id)(self)?.turnsLeft ?? 0) > 1))
  const hostiles = ready.filter((mv) => mv.type !== 'damage' && (mv.target === 'enemy' || mv.target === 'allEnemies')
    && !(isDebuffMove(mv) && (activeFor(mv.id)(foe)?.turnsLeft ?? 0) > 1))
  const hpFrac = self.hp / self.maxHp

  // What the foe can plausibly throw next turn (AI may peek — it's a sim).
  const foeThreats = foe.m.loadout.filter((mv) => (foe.cooldowns[mv.id] ?? 0) <= 1 && moveCost(mv) <= foe.mana + manaRegen(foe.m.stats))
  const threat = Math.max(ATTACK_POWER, ...foeThreats.filter((mv) => mv.type === 'damage').map((mv) => effPower(mv, self)))

  // Emergency heal beats everything.
  if (hpFrac < p.healAt && heals.length) return { kind: 'skill', move: heals[0] }

  // Hurt with a real hit incoming → guard up (how often is personality).
  if (hpFrac < p.healAt && threat >= 20 && chance(rng, p.blockWhenHurt)) return { kind: 'block' }

  // Open with a buff (or shield up) while still healthy.
  if (buffs.length && hpFrac > 0.6 && chance(rng, p.openBuff)) return { kind: 'skill', move: buffs[0] }

  // Land a debuff / control move on a threatening foe.
  if (hostiles.length && threat >= 18 && chance(rng, p.debuff)) return { kind: 'skill', move: hostiles[0] }

  // A damage skill is worth its MP if it clearly out-hits a basic Attack, or if
  // it carries a status/debuff rider that a plain Attack never could. Aggro
  // (negative for damage classes) widens what counts as "worth it."
  const worthIt = dmgs.filter((mv) => effPower(mv, foe) >= ATTACK_POWER + 4 + p.aggro
    || ((mv.status !== undefined || isDebuffMove(mv) || mv.effects?.manaBurn !== undefined) && effPower(mv, foe) >= ATTACK_POWER - 4 + p.aggro))
  if (worthIt.length) return { kind: 'skill', move: worthIt[0] }

  // Nothing affordable, but one more turn of regen unlocks a skill → block to charge.
  if (ready.length === 0) {
    const upcoming = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 1).map(moveCost)
    const cheapest = upcoming.length ? Math.min(...upcoming) : Infinity
    if (self.mana + manaRegen(self.m.stats) + self.innate.regen + self.regenMod >= cheapest && chance(rng, p.blockToCharge)) return { kind: 'block' }
  }

  // No worthwhile skill this turn and the foe threatens something heavy → parry window.
  if (threat >= 25 && chance(rng, p.parry)) return { kind: 'block' }

  return { kind: 'attack' }
}

// Wild-instinct flub: an untamed monster ignores the smart policy above and
// does something random instead — any ready skill, or Attack, or Block, each
// equally likely. HIDDEN stat (user spec 2026-07-21) — never surfaced in any
// UI, only felt through occasional erratic play from wild/rival monsters.
function wildAction(self: Combatant, rng: RNG): Action {
  const ready = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  const options: Action[] = [{ kind: 'attack' }, { kind: 'block' }, ...ready.map((mv): Action => ({ kind: 'skill', move: mv }))]
  return options[Math.floor(rng() * options.length)]
}

// The species ultimate (§8.3): once per battle, unleashed when pushed below 40%
// HP. A heavy strike through the monster's best offensive channel.
function ultimateMove(m: Monster): Move {
  const channels: Move['channel'][] = ['melee', 'ranged', 'magic', 'voice']
  const best = channels.reduce((a, b) => (attackStat(m.stats, a) >= attackStat(m.stats, b) ? a : b))
  return {
    id: 'ultimate', name: m.species.ultimate.name, stat: 'STR', learnLevel: 0, type: 'damage',
    channel: best, target: 'enemy', cooldown: 99, accuracy: 100, power: 70, desc: m.species.ultimate.desc,
  }
}

// Upsert a timed mod onto `mods` by move id — refreshes duration on recast
// instead of stacking a second copy — then rebuild the cached totals.
function upsertMod(c: Combatant, moveId: string, duration: number, fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'>): void {
  const existing = c.mods.find((m) => m.moveId === moveId)
  if (existing) existing.turnsLeft = duration
  else c.mods.push({ moveId, turnsLeft: duration, ...fields })
  recomputeMods(c)
}

// Land a debuff's timed effects on the target (round-limited). tauntForce is
// LIVE (2026-07-21): the target's single-target hostile actions are forced
// onto the attacker for the move's duration.
function applyDebuffs(attacker: Combatant, target: Combatant, move: Move, log: string[]): void {
  const e = move.effects
  if (!e) return
  const duration = e.duration ?? 3
  // 50 CHA = 1% shaved off incoming debuff magnitudes (charisma deflects scorn)
  const dr = 1 - debuffReduction(target.m.stats)
  const fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'> = {}
  const notes: string[] = []
  if (e.atkDebuff) { fields.atkDebuff = e.atkDebuff * dr; notes.push(`−${Math.round(e.atkDebuff * dr * 100)}% damage`) }
  if (e.defDebuff) { fields.defDebuff = e.defDebuff * dr; notes.push(`−${Math.round(e.defDebuff * dr)} mitigation`) }
  if (e.accDebuff) { fields.accDebuff = e.accDebuff * dr; notes.push(`−${Math.round(e.accDebuff * dr)}% accuracy`) }
  if (notes.length) {
    upsertMod(target, move.id, duration, fields)
    const resistNote = dr < 1 ? ` (${Math.round((1 - dr) * 100)}% resisted)` : ''
    log.push(`    ${target.m.name} is weakened for ${duration} rounds: ${notes.join(', ')}${resistNote}.`)
  }
  if (e.tauntForce && target.side !== attacker.side) {
    target.tauntedBy = { side: attacker.side, slot: attacker.slot, turnsLeft: duration }
    log.push(`    ${target.m.name} is taunted — forced to attack ${attacker.m.name} for ${duration} rounds!`)
  }
}

// Apply a move's beneficial effects to one recipient: guard, ward, cleanse,
// timed buffs. Called per-target for 'team'/'ally' fan-out, so a party buff
// genuinely buffs every living ally, not just the caster.
function applyBeneficialEffects(target: Combatant, move: Move, log: string[]): void {
  const e = move.effects
  if (!e) return
  const notes: string[] = []
  if (e.guard) { target.guard += e.guard + Math.round(target.m.stats.CON * 0.1); notes.push(`guard ${target.guard}`) }
  if (e.ward) { target.ward += e.ward; notes.push(`${target.ward} HP shield`) }
  if (e.cleanse && target.statuses.length) { target.statuses = []; notes.push('ailments cleansed') }
  if (isTimedBuff(move)) {
    const duration = e.duration ?? 3
    const fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'> = {}
    if (e.atkBuff) { fields.atkBuff = e.atkBuff; notes.push(`+${Math.round(e.atkBuff * 100)}% damage`) }
    if (e.defBuff) { fields.defBuff = e.defBuff; notes.push(`+${e.defBuff} mitigation`) }
    if (e.dodgeBuff) { fields.dodgeBuff = e.dodgeBuff; notes.push(`+${e.dodgeBuff}% dodge`) }
    if (e.accBuff) { fields.accBuff = e.accBuff; notes.push(`+${e.accBuff}% accuracy`) }
    if (e.regenBuff) { fields.regenBuff = e.regenBuff; notes.push(`+${e.regenBuff} regen`) }
    upsertMod(target, move.id, duration, fields)
    notes.push(`${duration} rounds`)
  }
  if (notes.length) log.push(`    (${notes.join(', ')})`)
}

// The living combatant this taunted attacker is FORCED to strike, if any.
function tauntTargetOf(attacker: Combatant, ctx: BattleContext): Combatant | null {
  if (!attacker.tauntedBy) return null
  const t = ctx.all.find((c) => c.side === attacker.tauntedBy!.side && c.slot === attacker.tauntedBy!.slot && c.hp > 0)
  if (!t) { attacker.tauntedBy = null; return null } // taunter fell — compulsion breaks
  return t
}

// Resolve WHO a move actually affects, given the live battlefield. This is the
// crux of real team battles — previously every non-self/enemy target silently
// collapsed onto "the only other fighter." Confusion's redirect-to-self roll
// happens here, ONCE per move cast (matching the original single roll per
// resolveMove call), and only actually redirects for single-target 'enemy'
// moves — an 'allEnemies' volley under confusion still goes out (scoped this
// way deliberately; a "confusion cancels the whole volley" reading wasn't
// specified and isn't a strict subset of the old single-target behavior).
// Precedence for 'enemy' moves: confusion (self) > taunt (forced) > lowest-HP%.
function resolveTargets(attacker: Combatant, ctx: BattleContext, move: Move, rng: RNG, log: string[]): Combatant[] {
  const confused = hasStatus(attacker, 'confusion') && chance(rng, 20)
  if (confused) log.push(`  ${attacker.m.name} is confused and turns on itself!`)

  switch (move.target) {
    case 'self':
      return [attacker]
    case 'team':
      return [attacker, ...alliesOf(ctx, attacker)]
    case 'ally': {
      const allies = alliesOf(ctx, attacker)
      // no other living ally (solo team, or the last one standing) → falls
      // back to self, preserving exactly today's Wood/Copper-league behavior
      return [allies.length ? pickAllyTarget(allies) : attacker]
    }
    case 'allEnemies':
      return enemiesOf(ctx, attacker) // may be empty if the enemy team just wiped this round
    case 'enemy':
    default: {
      if (confused) return [attacker]
      const forced = tauntTargetOf(attacker, ctx)
      if (forced) return [forced]
      const foes = enemiesOf(ctx, attacker)
      return foes.length ? [pickEnemyTarget(foes)] : []
    }
  }
}

// Non-damage, non-hostile move landing on one recipient (self, an ally, or a
// team-mate in a 'team' fan-out).
function resolveUtilityOnTarget(attacker: Combatant, target: Combatant, move: Move, log: string[], ev: BattleEvent[]): void {
  let heal = 0
  if (move.power > 0) {
    heal = Math.round(move.power * 1.2)
    target.hp = Math.min(target.maxHp, target.hp + heal)
    log.push(target === attacker
      ? `  ${attacker.m.name} uses ${move.name}, healing ${heal} HP.`
      : `  ${attacker.m.name} uses ${move.name} on ${target.m.name}, healing ${heal} HP.`)
  } else {
    log.push(target === attacker ? `  ${attacker.m.name} uses ${move.name}.` : `  ${attacker.m.name} uses ${move.name} on ${target.m.name}.`)
  }
  applyBeneficialEffects(target, move, log)
  ev.push({ kind: 'utility', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, heal, hostile: false })
}

// Hostile non-damage move (debuff/control) landing on one enemy — looped per
// fanned target for 'allEnemies'.
function resolveHostileUtilityOnTarget(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[]): void {
  const e = move.effects
  let hacc = move.accuracy + attacker.innate.acc + attacker.accMod
  if (hasStatus(attacker, 'blind')) hacc -= 25
  const hdodge = dodgeChance(target.m.stats) + target.innate.dodge + target.dodgeMod + target.blockAvoid
  if (!chance(rng, Math.max(5, hacc - hdodge))) {
    if (target.blockAvoid > 0) log.push(`  🛡 ${target.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${target.m.name}.`)
    ev.push({ kind: 'miss', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, channel: move.channel, blocked: target.blockAvoid > 0 })
    return
  }
  log.push(`  ${attacker.m.name} uses ${move.name} on ${target.m.name}.`)
  ev.push({ kind: 'utility', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, heal: 0, hostile: true })
  applyDebuffs(attacker, target, move, log)
  if (e?.manaBurn) {
    const burned = Math.min(target.mana, e.manaBurn)
    target.mana -= burned
    if (burned > 0) log.push(`    ${target.m.name} loses ${burned} MP.`)
  }
  if (move.status && chance(rng, move.status.chance + debuffBonus(attacker.m.stats))) {
    target.statuses.push({ kind: move.status.kind, turns: move.status.duration })
    log.push(`    ${target.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: move.status.kind })
  }
}

// A single damage hit landing on one target — looped per fanned target for
// 'allEnemies', each with its OWN independent accuracy/variance/crit/mitigation
// roll (never one roll multiplied by target count). `openerEligible` is
// computed ONCE by the caller before the fan-out loop, so a multi-target
// opening volley grants the bonus to every target it strikes, not just
// whichever one happens to be processed first.
function resolveDamageOnTarget(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[], openerEligible: boolean): void {
  const e = move.effects
  let acc = move.accuracy + attacker.innate.acc + attacker.accMod
  if (hasStatus(attacker, 'blind')) acc -= 25
  const dodge = dodgeChance(target.m.stats) + target.innate.dodge + target.dodgeMod + target.blockAvoid
  if (!chance(rng, Math.max(5, acc - dodge))) {
    if (target.blockAvoid > 0) log.push(`  🛡 ${target.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${target.m.name}.`)
    ev.push({ kind: 'miss', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, channel: move.channel, blocked: target.blockAvoid > 0 })
    return
  }

  const atk = attackStat(attacker.m.stats, move.channel)
  const variance = 0.85 + rng() * 0.3
  const hits = e?.hits ? randInt(rng, e.hits[0], e.hits[1]) : 1
  // softened growth curve so high-stat monsters don't one-shot before defense
  // matters; stat multiplier halved pool-wide (user spec 2026-07-19)
  let dmg = move.power * hits * Math.pow(atk / 40, 0.8) * 0.5 * variance
  dmg *= happinessMultiplier(attacker.happiness) // happy monsters hit harder (§2.4)
  dmg *= attacker.staminaMult // fatigue: tired monsters hit softer, all channels
  dmg *= attacker.innate.dmgMult * attacker.atkMod
  if (openerEligible) {
    dmg *= attacker.innate.firstHitMult
    log.push(`  ${attacker.m.name}'s opening strike hits with full force!`)
  }
  // critical hit: 50 DEX = 1% chance to deal double damage
  let crit = false
  if (chance(rng, critChance(attacker.m.stats))) {
    dmg *= 2
    crit = true
  }
  // execute: heavy bonus against weakened targets
  let execNote = ''
  if (e?.execute && target.hp / target.maxHp <= e.execute) {
    dmg *= 1.5
    execNote = ' — executes!'
  }
  // elemental affinity: resisted or super-effective vs the target's body type (§8.5)
  let effNote = ''
  if (move.element) {
    const em = elementMultiplier(target.m.species.body, move.element)
    dmg *= em
    if (em > 1) effNote = ' — super effective!'
    else if (em < 1) effNote = ' — resisted'
  }
  // physical channels mitigated by target CON + guard; magic/voice/support by WIS
  // (§11); buffs/shreds shift it; pierce ignores a fraction of the total.
  let mitigation = ((move.channel === 'melee' || move.channel === 'ranged')
    ? target.m.stats.CON * 0.06 + target.guard
    : target.m.stats.WIS * 0.05) + target.innate.flatDR + target.defFlat
  // skill pierce + STR's own armour-breaking (100 STR = 1% of mitigation ignored)
  mitigation = Math.max(0, mitigation) * (1 - Math.min(1, (e?.pierce ?? 0) + mitigationPierce(attacker.m.stats)))
  dmg = Math.max(1, Math.round(dmg - mitigation))

  // ward shields soak damage before health
  let wardNote = ''
  let absorbed = 0
  if (target.ward > 0) {
    absorbed = Math.min(target.ward, dmg)
    target.ward -= absorbed
    dmg -= absorbed
    wardNote = ` (${absorbed} absorbed by shield)`
  }
  target.hp -= dmg
  target.guard = 0
  attacker.hasLandedHit = true

  const hitNote = hits > 1 ? ` (${hits} hits)` : ''
  const notes: string[] = []
  // lifesteal: innate and skill effects stack
  let stolen = 0
  const steal = attacker.innate.lifesteal + (e?.lifesteal ?? 0)
  if (steal > 0 && dmg > 0) {
    stolen = Math.max(1, Math.round(dmg * steal))
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + stolen)
    notes.push(`drains ${stolen} HP`)
  }
  let burned = 0
  if (e?.manaBurn) {
    burned = Math.min(target.mana, e.manaBurn)
    target.mana -= burned
    if (burned > 0) notes.push(`burns ${burned} MP`)
  }
  let recoil = 0
  if (e?.recoil) {
    recoil = Math.max(1, Math.round(dmg * e.recoil))
    attacker.hp -= recoil
    notes.push(`${recoil} recoil`)
  }
  const noteStr = notes.length ? ` (${notes.join(', ')})` : ''
  const critNote = crit ? ' — CRITICAL HIT!' : ''
  log.push(`  ${attacker.m.name} uses ${move.name}${hitNote} → ${dmg} damage to ${target.m.name}${critNote}${execNote}${effNote}${wardNote}${noteStr}.`)
  ev.push({
    kind: 'hit', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot,
    move: move.name, channel: move.channel, element: move.element,
    dmg, hits, crit, execute: execNote !== '', eff: effNote.includes('super') ? 'super' : effNote.includes('resisted') ? 'resist' : null,
    lifesteal: stolen, manaBurn: burned, recoil, warded: absorbed, self: target === attacker,
  })

  // rider effect: armour shred / attack-down on damage moves (per-target)
  applyDebuffs(attacker, target, move, log)

  // Apply status (50 CHA = +1% proc chance — the pool-wide 50% cap applies to
  // base move design only; CHA may push the effective chance past it)
  if (move.status && chance(rng, move.status.chance + debuffBonus(attacker.m.stats))) {
    target.statuses.push({ kind: move.status.kind, turns: move.status.duration })
    log.push(`    ${target.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: move.status.kind })
  }
}

// Orchestrator: resolve targets once, pay the cost once, then fan the move out
// across every resolved target through the appropriate per-target resolver.
function resolveMove(attacker: Combatant, ctx: BattleContext, move: Move, rng: RNG, log: string[], ev: BattleEvent[], freeCast = false): void {
  const targets = resolveTargets(attacker, ctx, move, rng, log)
  if (!freeCast) { // an INT echo repeats the cast without paying again
    attacker.cooldowns[move.id] = move.cooldown
    attacker.mana = Math.max(0, attacker.mana - moveCost(move))
  }
  if (!targets.length) return // e.g. the enemy team was already wiped by an earlier actor this round

  if (move.type !== 'damage') {
    const hostile = move.target === 'enemy' || move.target === 'allEnemies'
    if (!hostile) { for (const t of targets) resolveUtilityOnTarget(attacker, t, move, log, ev); return }
    for (const t of targets) resolveHostileUtilityOnTarget(attacker, t, move, rng, log, ev)
    return
  }

  const e = move.effects
  const openerEligible = !attacker.hasLandedHit && attacker.innate.firstHitMult > 1
  for (const t of targets) resolveDamageOnTarget(attacker, t, move, rng, log, ev, openerEligible)
  // self-guard follow-up on a damage move stays targeted at the attacker
  // specifically (a "hit and raise a shield" rider), once per cast — not once
  // per fanned target.
  if (e?.guard) applyBeneficialEffects(attacker, move, log)
}

function takeTurn(attacker: Combatant, ctx: BattleContext, rng: RNG, log: string[], ev: BattleEvent[]): void {
  // A Block stance lasts until the blocker's next action — it ends now.
  attacker.blockAvoid = 0
  // regen mana (innate mana engines + regen buffs add to it) and HP (25 CON = 1/turn)
  attacker.mana = Math.min(attacker.maxMana, attacker.mana + manaRegen(attacker.m.stats) + attacker.innate.regen + attacker.regenMod)
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + hpRegen(attacker.m.stats))

  if (hasStatus(attacker, 'stun')) { log.push(`  ${attacker.m.name} is stunned and cannot act.`); ev.push({ kind: 'skip', side: attacker.side, slot: attacker.slot, reason: 'stun' }); return }
  if (hasStatus(attacker, 'fear')) { log.push(`  ${attacker.m.name} flees in fear and loses its action.`); ev.push({ kind: 'skip', side: attacker.side, slot: attacker.slot, reason: 'fear' }); return }

  const enemies = enemiesOf(ctx, attacker)
  if (!enemies.length) return // this monster's own team already won mid-round — nothing to act against

  // Ultimate: unlocked at 600+ in a stat, fires once when pushed below 40% HP
  if (attacker.m.ultimateUnlocked && !attacker.ultimateUsed && attacker.hp <= attacker.maxHp * 0.4) {
    attacker.ultimateUsed = true
    log.push(`  ★ ${attacker.m.name} unleashes its ultimate!`)
    ev.push({ kind: 'ultimate', side: attacker.side, slot: attacker.slot, name: attacker.m.species.ultimate.name })
    resolveMove(attacker, ctx, ultimateMove(attacker.m), rng, log, ev)
    return
  }

  // The per-turn choice: skill (costs MP) vs free Attack vs free Block. Wild
  // (low-tameness) monsters occasionally ignore the smart policy — undefined
  // tameness (player monsters) never rolls, so this only ever fires for
  // generated/rival monsters (see rollTameness in monster.ts). `chooseAction`
  // is fed a single representative foe (the taunter if taunted, else the
  // lowest-HP% living enemy) for its threat heuristics; the move it picks
  // resolves its REAL target(s) separately.
  const primaryFoe = tauntTargetOf(attacker, ctx) ?? pickEnemyTarget(enemies)
  const tameness = attacker.m.tameness
  const action = (tameness !== undefined && chance(rng, 100 - tameness))
    ? wildAction(attacker, rng)
    : chooseAction(attacker, primaryFoe, rng)
  if (action.kind === 'block') {
    attacker.blockAvoid = blockValue(attacker)
    log.push(`  🛡 ${attacker.m.name} braces to block (+${attacker.blockAvoid}% avoid).`)
    ev.push({ kind: 'stance', side: attacker.side, slot: attacker.slot, avoid: attacker.blockAvoid })
    return
  }
  resolveMove(attacker, ctx, action.kind === 'attack' ? basicAttack(attacker.m) : action.move, rng, log, ev)
  // 100 INT = 1% chance a skill casts twice (free — no extra MP, same cooldown)
  if (action.kind === 'skill' && attacker.hp > 0 && enemiesOf(ctx, attacker).length > 0 && chance(rng, echoChance(attacker.m.stats))) {
    log.push(`  ✨ ${attacker.m.name}'s ${action.move.name} echoes — it casts again!`)
    resolveMove(attacker, ctx, action.move, rng, log, ev, true)
  }
}

const teamAlive = (team: Combatant[]) => team.some((c) => c.hp > 0)
const sumHpFrac = (team: Combatant[]) => team.reduce((s, c) => s + Math.max(0, c.hp) / c.maxHp, 0)

// Shared-battlefield initiative: every living combatant on BOTH teams acts once
// per round, LOWEST current CON first (user spec 2026-07-21 — a light, low-CON
// build is fast; a bulky, high-CON tank is slow; recomputed every round, so
// mid-fight CON shifts matter) — not a fixed "team A's fastest, then team B's
// fastest" block order, and turn order can jump between teams freely based on
// each individual's CON. Ties fall back to DEX descending (quicker reflexes
// settle a tie), then side A before B, then roster slot.
function turnOrderCompare(x: Combatant, y: Combatant): number {
  if (y.m.stats.CON !== x.m.stats.CON) return x.m.stats.CON - y.m.stats.CON
  if (y.m.stats.DEX !== x.m.stats.DEX) return y.m.stats.DEX - x.m.stats.DEX
  if (x.side !== y.side) return x.side === 'A' ? -1 : 1
  return x.slot - y.slot
}

export function simulateTeamBattle(teamA: Monster[], teamB: Monster[], happA: number[] = [], happB: number[] = []): BattleResult {
  const seedKey = teamA.map((m) => m.seed).join(',') + '|' + teamB.map((m) => m.seed).join(',') + '|vs'
  const rng = mulberry32(hashString(seedKey))
  const A = teamA.map((m, i) => makeCombatant(m, happA[i] ?? 0, 'A', i))
  const B = teamB.map((m, i) => makeCombatant(m, happB[i] ?? 0, 'B', i))
  const ctx: BattleContext = { all: [...A, ...B] }
  const log: string[] = []
  const ev: BattleEvent[] = []
  const snap = () => ev.push({
    kind: 'snap',
    states: ctx.all.map((c) => ({ side: c.side, slot: c.slot, hp: Math.max(0, c.hp), mana: Math.round(Math.max(0, c.mana)), ward: c.ward })),
  })

  if (teamA.length === 1 && teamB.length === 1) {
    log.push(`⚔️  ${teamA[0].name} the ${teamA[0].species.name} (${teamA[0].className}) vs ${teamB[0].name} the ${teamB[0].species.name} (${teamB[0].className})`)
  } else {
    log.push(`⚔️  Team A (${teamA.map((m) => m.name).join(', ')}) vs Team B (${teamB.map((m) => m.name).join(', ')})`)
  }
  log.push(`   A: ${A.map((c) => `${c.m.name} ${c.maxHp}HP`).join(' · ')}  |  B: ${B.map((c) => `${c.m.name} ${c.maxHp}HP`).join(' · ')}`)
  for (const c of ctx.all) {
    const p = activePassives(c.m)
    if (p.length) log.push(`   ${c.m.name}'s innate: ${p.join(' · ')}`)
    if (c.staminaMult < 1)
      log.push(`   💤 ${c.m.name} enters fatigued (${c.m.stamina}/100 stamina — −${Math.round((1 - c.staminaMult) * 100)}% damage)`)
  }
  snap()

  let round = 1
  const MAX_ROUNDS = 60
  while (teamAlive(A) && teamAlive(B) && round <= MAX_ROUNDS) {
    log.push(`— Round ${round} —`)
    ev.push({ kind: 'round', n: round })
    // decrement cooldowns and tick down active buffs/debuffs at the start of the round
    for (const c of ctx.all) for (const id in c.cooldowns) if (c.cooldowns[id] > 0) c.cooldowns[id]--
    for (const c of ctx.all) tickMods(c)

    const order = ctx.all.filter((c) => c.hp > 0).sort(turnOrderCompare)
    for (const c of order) {
      if (c.hp <= 0) continue // may have been KO'd by an earlier actor's move this same round
      takeTurn(c, ctx, rng, log, ev)
      snap()
      if (!teamAlive(A) || !teamAlive(B)) break
    }

    for (const c of ctx.all) tickStatuses(c, log, ev)
    snap()
    log.push(`   A: ${A.map((c) => `${c.m.name} ${Math.max(0, c.hp)}`).join(' · ')}  |  B: ${B.map((c) => `${c.m.name} ${Math.max(0, c.hp)}`).join(' · ')}`)
    round++
  }

  for (const c of ctx.all) if (c.hp <= 0) c.wasKOd = true

  let winner: BattleResult['winner']
  const aAlive = teamAlive(A), bAlive = teamAlive(B)
  if (!aAlive && !bAlive) winner = 'draw'
  else if (!bAlive) winner = 'A'
  else if (!aAlive) winner = 'B'
  else winner = sumHpFrac(A) >= sumHpFrac(B) ? 'A' : 'B' // timeout → higher summed HP fraction wins
  const winnerName = winner === 'draw' ? '—' : (winner === 'A' ? A : B).map((c) => c.m.name).join(' & ')
  log.push(winner === 'draw' ? '🏳️  Double knockout — a draw!' : `🏆  ${winnerName} wins!`)
  ev.push({ kind: 'end', winner })
  return {
    log, events: ev, winner, winnerName,
    finals: ctx.all.map((c) => ({ side: c.side, slot: c.slot, hp: Math.max(0, c.hp), mana: Math.round(Math.max(0, c.mana)), wasKOd: c.wasKOd })),
  }
}

// Thin 1v1 wrapper — every existing single-monster call site (Sandbox) keeps
// working completely unchanged.
export function simulateBattle(a: Monster, b: Monster, happA = 0, happB = 0): BattleResult {
  return simulateTeamBattle([a], [b], [happA], [happB])
}
