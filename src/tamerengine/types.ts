// ─────────────────────────────────────────────────────────────────────────────
// FIELD BATTLE (v0.93) — a continuous-2D autobattler engine, in the Teamfight
// Manager mould. Monsters occupy real positions, move under their own steering,
// choose their own targets, and fight until one side is gone.
//
// ⚠️ This is a SECOND engine. `battle.ts` (turn-based) is untouched and remains
// the shipping engine — the whole balance arc up to v0.92 is calibrated to it,
// and its 12 golden battles still pin it exactly. Nothing in this folder is
// imported by battle.ts, so the goldens cannot move. The two run side by side
// until this one is tuned well enough to take over.
// ─────────────────────────────────────────────────────────────────────────────
import { Channel, Monster, StatusKind } from '../core'

export interface Vec2 { x: number; y: number }

// The arena in world units. Roughly 40x22 gives a wide pitch with room for two
// deployment zones, a no-man's land, and cover in the middle.
export const FIELD_W = 40
export const FIELD_H = 22
// A side deploys within this many units of its own edge.
export const DEPLOY_DEPTH = 11

// Simulation cadence. Fixed dt is what keeps the whole thing deterministic —
// never derive movement from wall-clock time.
export const TICK_HZ = 10
export const DT = 1 / TICK_HZ
export const MAX_SECONDS = 90
export const MAX_TICKS = MAX_SECONDS * TICK_HZ
// Re-picking a target every tick makes units jitter between equal-scoring foes.
// They commit for this long unless the target dies or they are forced off it.
export const RETARGET_EVERY = 0.6 // seconds
// KITE BUDGET. A ranged unit may backpedal for at most this long before it must
// hold and fight — you cannot attack and kite. Drains while a threat is in kite
// range, refills (at KITE_REFILL× the rate) only once the unit is safe.
export const KITE_MAX = 1.2 // seconds
export const KITE_REFILL = 0.5
// LEASH. No unit may aim to stand more than this far from the fight's centre of
// mass, so nothing can wander off across the map however it is steered.
export const LEASH_RADIUS = 12
// Move statuses author their duration in ROUNDS, a unit the field has no
// concept of. A turn-based round — everyone acting once — is worth roughly
// this many seconds here. One constant, so restating it is impossible.
export const SECONDS_PER_ROUND = 2.0

// SUDDEN DEATH. ⚠️ Without it, the moment buffs and debuffs became real on the
// field, draws went from 4 to 11 in 40 fights — two teams shaving each other's
// damage down until the 90s cap ran out. The turn engine solved this exact
// problem at round 35 with escalating %-of-maxHp chip, and for the same reason
// it must be a FRACTION of max HP: flat chip lets raw CON win the clock, which
// double-dips a stat that already buys health.
export const SUDDEN_DEATH_AT = 55 // seconds
export const SUDDEN_DEATH_BASE = 0.010 // fraction of maxHp per second at onset
export const SUDDEN_DEATH_RAMP = 0.004 // added per further second

export type FieldSide = 'A' | 'B'

// Rectangular cover. Blocks movement AND line of sight, so a caster can shelter
// behind a rock and a melee unit has to path around it.
export interface Obstacle { x: number; y: number; w: number; h: number }

// ── The two new stats the design calls for ──────────────────────────────────
// Together they give four readable archetypes:
//   high cohesion / low predation  → anchor: holds the line with the team
//   high cohesion / high predation → coordinated dive: team focuses one target
//   low cohesion  / low predation  → skirmisher: freelances, takes what's near
//   low cohesion  / high predation → assassin: solo-dives the enemy backline
export interface FieldTraits {
  /** 0..1 — sticks with the team, shares focus, peels for allies. */
  cohesion: number
  /** 0..1 — hunts the highest-VALUE target regardless of danger or distance. */
  predation: number
}

export interface FieldUnit {
  id: string
  side: FieldSide
  slot: number // index within its own team — identity, for events and results
  m: Monster
  pos: Vec2
  vel: Vec2
  radius: number
  /** world units per second */
  speed: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  traits: FieldTraits
  /** id of the unit it is currently committed to */
  targetId: string | null
  /** seconds until it may re-evaluate its target */
  retargetIn: number
  /** per-move cooldowns, keyed by move id, in seconds */
  cooldowns: Record<string, number>
  /** seconds left in a cast it has committed to (it is rooted while casting) */
  castingFor: number
  castMoveId: string | null
  /** Who the in-flight cast is aimed at. Not always the combat target — a heal
   *  or a haul aims at an ALLY while the unit is still fighting an enemy. */
  castTargetId: string | null
  /** Live afflictions. `from` is the unit that applied it — fear flees FROM it
   *  and charm is drawn TOWARD it, so the source has to be remembered. */
  statuses: { kind: StatusKind; until: number; from: string }[]
  /** Timed multipliers from buff/debuff moves. Kept as a list rather than two
   *  scalars so several can overlap and expire independently — the turn engine
   *  models these as round-limited `Combatant.mods` and this is its analogue. */
  mods: { atk?: number; dmgTaken?: number; until: number }[]
  /** TAUNT. While this holds, the unit must attack the taunter — the one thing
   *  that lets a tank protect a back line it is not standing on. */
  forcedTargetId: string | null
  forcedUntil: number
  /** seconds left unable to MOVE (it may still act) — from a root */
  rootedFor: number
  /** wall-clock time until which this unit is hard to notice (a Fade) */
  fadedUntil: number
  /** speed multiplier and the time it expires — from a slow */
  slowMult: number
  slowFor: number
  /** seconds an assassin will break off and dart to safety after a strike,
   *  before diving back in — the in-and-out of the assassin archetype. */
  disengageFor: number
  /** KITE BUDGET — seconds of backpedalling a ranged unit has left before it must
   *  stand and fight. You cannot attack and kite, so kiting is a brief measure:
   *  it drains while a threat is in kite range and only refills once the unit is
   *  safe again. At 0 the unit holds ground (and uses cover) instead of running. */
  kiteFor: number
  /** BLOCKING until this time. A unit in reach of its target with nothing off
   *  cooldown BRACES rather than wandering — the free defensive action the turn
   *  engine has always had ("Attack + Block") and the field engine was missing. */
  blockingUntil: number
  dead: boolean
}

// What the renderer consumes. Positions are sampled once per tick so the view
// can interpolate; discrete beats (a hit landing, a death) are their own events.
export type FieldEvent =
  | {
      t: number; kind: 'snapshot'
      units: {
        id: string; x: number; y: number; facing: number; state: UnitVisState
        hp: number; maxHp: number; mp: number; maxMp: number
        // Active-effect icon keys, split by sign so the renderer draws its two
        // rows (debuffs above buffs, above the HP bar) directly. Usually 0–3.
        buffs: string[]; debuffs: string[]
      }[]
    }
  | { t: number; kind: 'cast'; id: string; targetId: string | null; move: string; channel: Channel }
  | { t: number; kind: 'hit'; id: string; targetId: string; move: string; channel: Channel; dmg: number; crit: boolean }
  | { t: number; kind: 'miss'; id: string; targetId: string; move: string }
  | { t: number; kind: 'heal'; id: string; targetId: string; move: string; amount: number }
  | { t: number; kind: 'status'; id: string; by: string; status: StatusKind }
  | { t: number; kind: 'blink'; id: string; fromX: number; fromY: number; toX: number; toY: number }
  | { t: number; kind: 'shove'; id: string; by: string; kind2: 'pull' | 'push' }
  | { t: number; kind: 'death'; id: string }
  | { t: number; kind: 'end'; winner: FieldSide | 'draw' }

/** Coarse pose for the renderer — drives which animation a sprite plays. */
export type UnitVisState = 'idle' | 'move' | 'cast' | 'hurt' | 'block' | 'dead'
/** Damage a blocking unit shrugs off. The free defensive action's whole value. */
export const BLOCK_DR = 0.2

// ── THE FREE ATTACK ─────────────────────────────────────────────────────────
// ⚠️ It must never out-damage a real ability. It did: at train 850 the basic
// out-DPSed every monster's BEST ability by 1.2–2.3×, so abilities were strictly
// worse than just swinging, and the ~1s swing dominated the action economy.
//
// Base damage keys off the STAT — never off the monster's own abilities, which
// is gameable in both directions — on a deliberate hierarchy: a STR bruiser's
// swing is a real blow, a caster's is a feeble jab so it must spend abilities.
// The basic's stat follows its channel (melee STR / ranged DEX / magic INT /
// voice CHA / support WIS), so this table IS part of the class identity.
// An EVEN ramp 0.70 → 0.35, one step (0.07) per rung. ⚠️ The first cut of this
// table ran 1.00 → 0.35, which let a STR bruiser's free swing hit far too hard
// for a move that costs nothing; compressing the top keeps the hierarchy while
// stopping STR from carrying a fight on autos alone.
export const BASIC_STAT_TIER: Record<string, number> = {
  STR: 0.70, DEX: 0.63, INT: 0.56, CON: 0.49, CHA: 0.42, WIS: 0.35,
}
/** Flat floor, so an untrained monster can still swing for something. */
export const BASIC_BASE_POWER = 5
/** Stat → power, kept well under the authored pool's scaling. */
export const BASIC_STAT_SCALE = 1 / 70

export interface FieldSetup {
  seed: string
  teamA: Monster[]
  teamB: Monster[]
  /** Optional explicit deployment. Omit a side to auto-deploy it. */
  placeA?: Vec2[]
  placeB?: Vec2[]
  obstacles?: Obstacle[]
}

export interface FieldResult {
  winner: FieldSide | 'draw'
  events: FieldEvent[]
  /** seconds the fight lasted */
  duration: number
  survivorsA: number
  survivorsB: number
}

// ── Reach ───────────────────────────────────────────────────────────────────
// The 140 authored moves carry no range (they were written for a turn-based
// engine that had no space). Rather than a blocking data pass over all of them,
// reach DERIVES from the channel and can be overridden per-move later — so the
// engine runs today and authoring can refine it incrementally.
export const CHANNEL_RANGE: Record<Channel, number> = {
  melee: 1.6,
  ranged: 8,
  magic: 7,
  voice: 5.5,
  support: 6,
}
// Heavier casts root the caster briefly — that wind-up is what gives a dive a
// window to punish a caster, and makes positioning matter.
export const CHANNEL_CAST_TIME: Record<Channel, number> = {
  melee: 0.15,
  ranged: 0.3,
  magic: 0.55,
  voice: 0.45,
  support: 0.4,
}
