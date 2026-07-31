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
// ⚠️ `let`, NOT `const` — arenas differ in size (see `maps.ts`), and the whole
// engine reads these as module-level bindings rather than threading dimensions
// through every call site. ES live bindings mean `setFieldSize` is seen by every
// importer, which is what makes a per-map size possible without a refactor that
// would touch ~15 clamp sites across engine.ts, decide.ts and hex.ts.
//
// The trade, stated plainly: this is MUTABLE GLOBAL STATE. It is safe only
// because the engine is synchronous and single-threaded — one battle runs to
// completion before the next starts. Do NOT interleave battles at different
// sizes, and always set the size BEFORE `simulateFieldBattle`, never during.
// The game itself never calls the setter; it is for maps and harnesses.
export let FIELD_W = 40
export let FIELD_H = 22

/** Select the arena dimensions. Returns the previous pair so a caller can restore. */
export function setFieldSize(w: number, h: number): [number, number] {
  const prev: [number, number] = [FIELD_W, FIELD_H]
  FIELD_W = w
  FIELD_H = h
  return prev
}
// A side deploys within this many units of its own edge.
export const DEPLOY_DEPTH = 11

// Simulation cadence. Fixed dt is what keeps the whole thing deterministic —
// never derive movement from wall-clock time.
export const TICK_HZ = 10
export const DT = 1 / TICK_HZ
export const MAX_SECONDS = 120
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

// ── GIVING UP A CHASE ───────────────────────────────────────────────────────
// ⚠️ THE COUNTERWEIGHT TO PATHFINDING. Once units route around cover properly, a
// pursuer never loses the trail — which is the opposite failure to the one that
// was just fixed, and it makes any escape budget irrelevant: a support can spend
// every cooldown it owns and still be caught. A chase has to be able to fail.
//
// ⚠️ MEASURED AS TIME WITHOUT PROGRESS, NOT TIME SPENT CHASING. A bruiser closing
// steadily from across a 64-unit arena is doing exactly what it should; abandoning
// it mid-approach because a stopwatch expired would undo the approach work
// entirely. What earns a give-up is failing to get any NEARER.
export const PURSUIT_PATIENCE = 3.0 // seconds without closing before giving up
// ⚠️ WITHOUT THIS, GIVING UP THRASHES. Drop B, take C, drop C, take B again, and
// nobody ever dies — a new way to stall a fight dressed up as a fix. A unit that
// has just been abandoned is off the menu for a while.
export const PURSUIT_IGNORE = 5.0 // seconds an abandoned target is skipped
export const PURSUIT_PROGRESS = 0.35 // world units of closing that counts as progress

// ── FALL BACK ───────────────────────────────────────────────────────────────
// The universal escape: every monster has one, on a long cooldown, so breaking
// contact is an EVENT a player can see and plan around rather than a continuous
// drift nobody can observe. A cooldown was chosen over a stamina budget for
// exactly that reason — see docs/PATHFINDING_DESIGN.md §5.
//
// ⚠️ NOT A SMALLER VERSION OF MICRO-KITING. `KITE_MAX` (1.2s) is a ranged unit
// shuffling back to hold range, continuously, every second. This is a discrete
// decision to break contact, two or three times a fight. Putting a cooldown on
// the former would walk archers into melee; they stay separate systems.
export const FALL_BACK_CD = 15 // seconds between uses
export const FALL_BACK_DUR = 2 // seconds of committed retreat
// ⚠️ ITS TEETH COME FROM SUSPENDING BACKPEDAL_MULT, not from a speed bonus.
// Giving ground normally costs 40% of your speed — that penalty is what lets a
// committed attacker ever close. Lifting it briefly is what separates a real
// retreat from a shuffle, and it needs no new speed constant.
export const FALL_BACK_HP = 0.4 // trigger: below this fraction of max HP
export const FALL_BACK_NEAR = 3.5 // trigger: a melee threat this close
// ⚠️ THE HAZARD IS NOT "TWO ESCAPES IN A FIGHT", IT IS "TWO IN TWO SECONDS".
// Two across a 45s fight is the premium build working. Two inside one window
// makes an assassin's commitment unanswerable — it lands, the support
// Disengages, it re-closes, the support instantly Falls Back, and it has spent
// eight seconds achieving nothing. No value of FALL_BACK_CD catches that,
// because the whole burst happens inside a single window, which is why this is
// a second and much SHORTER constant rather than a bigger first one.
export const ESCAPE_LOCKOUT = 5 // seconds either escape locks the other

// ⚠️ A DASH CROSSES THE GROUND. It did not: `u.pos = dest` set the destination
// in a single tick, so a 7-unit Backstep was an instantaneous 7-unit jump —
// visually a teleport with no explanation, and mechanically un-interruptible.
// The comment on `MoveSpatial.move` has always said a dash "crosses the ground
// and IS stopped by cover"; only the second half was true.
//
// A BLINK still snaps, because that is what a teleport is, and it emits its own
// event so a renderer can draw the discontinuity deliberately.
export const DASH_SPEED_MULT = 4 // times normal speed while dashing
export const DASH_MAX_TIME = 0.9 // seconds before a dash gives up and releases
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
// ⚠️ THE FIGHT TIMER IS TWO MINUTES; SUDDEN DEATH STARTS AT NINETY SECONDS.
// Do not read the ~20s MEAN duration as the fight length — that is how long a
// 3v3 takes to kill itself, and it is far inside the clock. The timer bounds the
// tail: the fights that would otherwise never end.
//
// ⚠️ MAX_SECONDS AND SUDDEN_DEATH_AT MOVE TOGETHER. Sudden death needs runway to
// finish the job — 30s of ramp here. Raising the onset past the cap means it
// never fires at all and the fight simply stops at the wall.
export const SUDDEN_DEATH_AT = 90 // seconds
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
   *  models these as round-limited `Combatant.mods` and this is its analogue.
   *
   *  ⚠️ EXTENDED for the previously-inert effects rather than adding six parallel
   *  timers: `guard` (flat DR), `thorns` (flat reflect per hit taken), `dodge` /
   *  `acc` (percentage POINTS — never fractions), `hpRegen` (HP per second).
   *  One list means expiry is handled in exactly one place. */
  mods: {
    atk?: number; dmgTaken?: number
    guard?: number; thorns?: number; dodge?: number; acc?: number; hpRegen?: number
    // MANA regen, authored per ROUND by the move and paid out per second here —
    // the same translation `hpRegen` gets.
    regen?: number
    /**
     * `defDebuff` — PERCENTAGE POINTS off the target's mitigation fraction.
     *
     * ⚠️ FIRST MAPPED ONTO NEGATIVE `guard` AND THAT WAS WRONG FOR THIS ENGINE.
     * The turn engine models it as `defFlat -= defDebuff`, and `guard` is this
     * engine's defFlat, so the port looked exact — but on a field a monster's
     * defence is the MITIGATION CURVE (CON/WIS ÷ 1400), not a flat guard it
     * usually does not have. Against a bare target negative guard just added a
     * few flat damage, which is why handing every damage class a defDebuff
     * move made them WORSE at killing tanks (39% -> 35%).
     * battle.ts prints this effect as "−N mitigation"; here that is literal.
     */
    mitDebuff?: number
    until: number
  }[]
  /** WARD — an absorb shield that soaks damage BEFORE health. Not timed: it is a
   *  pool that depletes, mirroring the turn engine's `Combatant.ward`. */
  ward: number
  /** CC DIMINISHING RETURNS. Successive control on the same unit lands shorter:
   *  applied for `duration × (1 − ccResist)`, then the meter steps up. Decays back
   *  to 0 after CC_DR_RESET seconds without any control landing, so chain-CC is a
   *  timing decision rather than a dump. */
  ccResist: number
  /** When the last control effect landed — drives the reset window above. */
  lastCcAt: number
  /** Brief control IMMUNITY, granted by a cleanse. ⚠️ Deliberately does NOT reset
   *  `ccResist`: resetting it would make cleansing your own ally a DR-wipe exploit
   *  that re-opens them to a full-duration stun. */
  ccImmuneUntil: number
  /** Has this unit attacked yet? ⚠️ The field's stand-in for the turn engine's
   *  `actedThisRound`, which `firstStrikeMult` keys off — a continuous field has
   *  no rounds, so "hasn't reacted yet" becomes "hasn't thrown a blow yet". Makes
   *  first-strike bonuses an OPENING-burst reward rather than a per-round one. */
  hasAttacked: boolean
  /** Seconds spent chasing the current target without getting closer. */
  chaseFor: number
  /** Closest this unit has come to its current target — the progress yardstick. */
  chaseBest: number
  /** Targets recently given up on, and the time each becomes fair game again. */
  gaveUp: Record<string, number>
  /** Time Fall Back becomes available again. */
  fallBackAt: number
  /** While `t` is under this, the unit is in a committed retreat. */
  fallBackUntil: number
  /** Mid-dash destination, travelled over several ticks rather than snapped. */
  dashTo: Vec2 | null
  /** When the dash gives up, so a blocked dash cannot strand the unit. */
  dashUntil: number
  /** Where that retreat is heading. ⚠️ Chosen ONCE when it triggers, not
   *  re-scored per tick — a committed retreat that re-picks its destination as
   *  the threat moves oscillates on the spot instead of going anywhere. */
  fallBackTo: Vec2 | null
  /** Shared escape lockout — set by ANY escape, checked by all of them. */
  escapeLockUntil: number
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
        /** ⚠️ WHO THIS UNIT IS HUNTING. Added for the escape instrument: without
         *  it a "chase" can only be inferred from damage, which misses the whole
         *  pursuit phase — precisely the part cover is meant to extend. Also what
         *  a renderer needs to draw a threat line. */
        targetId: string | null
        hp: number; maxHp: number; mp: number; maxMp: number
        // Active-effect icon keys, split by sign so the renderer draws its two
        // rows (debuffs above buffs, above the HP bar) directly. Usually 0–3.
        buffs: string[]; debuffs: string[]
      }[]
    }
  | { t: number; kind: 'cast'; id: string; targetId: string | null; move: string; channel: Channel }
  | { t: number; kind: 'hit'; id: string; targetId: string; move: string; channel: Channel; dmg: number; crit: boolean }
  | { t: number; kind: 'miss'; id: string; targetId: string; move: string }
  /** ⚠️ A CHASE THAT FAILED — emitted, not merely tallied, because the whole
   *  point of a give-up is that a watcher can SEE the assassin break off. It is
   *  also the only way to tell "the support escaped" from "the support was never
   *  chased", which no outcome metric can distinguish. */
  | { t: number; kind: 'giveup'; id: string; targetId: string }
  /** A committed retreat began. Visible so a player can see the break, and so
   *  the escape instrument can tell a retreat from a rout. */
  | { t: number; kind: 'fallback'; id: string }
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

// ── CC DIMINISHING RETURNS ──────────────────────────────────────────────────
// Arena-style: control on the same target lands shorter each time, resetting
// after a quiet window. 100% → 75% → 50% → 25% → immune.
//
// ⚠️ This is the hard cap on the lockout build (WIS Disruptor + CHA Enchanter:
// resource denial stacked on action denial). It must exist BEFORE both of those
// ability lines do, or that pairing has no counterplay at all.
//
// Global rather than per-category on purpose: mixing a silence with a charm gets
// no discount, which is exactly what caps the lockout. Per-category would reward
// varied CC kits but loosen that cap — revisit only if chain-CC feels
// over-punished in sim.
export const CC_DR_STEP = 0.25
export const CC_DR_RESET = 3.0 // seconds without control before the meter clears
/** Seconds of control immunity a cleanse grants. Compensation for NOT resetting
 *  the DR meter — a real window to act, without the DR-wipe exploit. */
export const CLEANSE_CC_IMMUNITY = 1.2

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

// ── MANA ECONOMY ────────────────────────────────────────────────────────────
// ⚠️ WIS regen alone STARVED every physical class. `maxMana = WIS + INT/2` and
// regen keyed off WIS, but a warrior's abilities are STR-based — so the monsters
// whose kit is physical had the least fuel to cast it. Measured: 4–6 ability
// casts for a WHOLE fight, and 76% of all casts were the free attack.
//
// So each role now EARNS mana the way it actually plays. THREE roles only —
// a "caster" is not one of them: a caster is a DAMAGE dealer if it throws spells
// and a SUPPORT if it mends, and fuels the same way anyone in that job does.
// What makes casting feel different is the WIS POOL and WIS regen, which an
// INT/WIS monster has far more of.
//   tank    — pays for its abilities by soaking (per hit TAKEN)
//   damage  — pays for them by connecting (per hit DEALT)
//   support — a steady trickle, since it neither tanks nor spikes
export const MANA_ON_HIT_TAKEN = 2   // tanks
export const MANA_ON_HIT_DEALT = 2   // STR/DEX damage dealers
export const MANA_SUPPORT_PER_SEC = 1
/** WIS → mana/sec divisor. Lowered 300 → 200 so INT/WIS casters gain real fuel. */
export const WIS_REGEN_DIVISOR = 200
/**
 * FIELD-ONLY mana cost scalar. `monster.ts:manaCost` is deliberately 2× the base
 * formula — a TURN-engine decision, where a monster acts once per ~2s round so a
 * pool stretches a long way in wall-clock terms. On a real-time field a unit can
 * act every second, so that doubling priced abilities out entirely: even WITH the
 * per-hit generation above, monsters could not afford their cheapest ability 61.5%
 * of the time. This undoes the doubling for the field only, so battle.ts and its
 * 12 goldens are untouched.
 */
// ⚠️ P5, sim-tuned 0.5 -> 0.22. The 4th field slot made mana the binding
// constraint: 66% of live unit-ticks could not afford even the CHEAPEST ability,
// so monsters fell back to the free attack and the whole authored pool went
// unused (ability share of casts was 43%). Swept one knob at a time per the
// standing rule — 0.50/0.40/0.32/0.25/0.22/0.18/0.15 — and the response is
// clean and monotonic in starvation:
//   0.50 -> 66.1% starved, 57% basic, 8/12 resolved, 45.5s
//   0.32 -> 42.2% starved, 47% basic, 10/12,        39.8s
//   0.22 -> 18.4% starved, 38% basic, 9/12,         42.4s   <- chosen
//   0.15 -> 12.3% starved, 35% basic, 10/12,        41.2s
// 0.22 is the point that clears both targets (<20% starved, >60% ability share)
// while mana is still a resource you can run out of. Below ~0.18 the returns
// flatten and mana stops being a constraint at all, which would quietly delete a
// whole axis of play — the reason not to just take the lowest number.
// ⚠️ 0.22 -> 0.18 after LINE AFFINITY landed. Coherent kits actually cast their
// abilities (ability casts 1191 -> 1851), which pushed starvation back over the
// target to 23.1%. Re-swept: 0.20 -> 21.2%, 0.18 -> 18.5%. Not a walk-back of
// the 'keep mana a real constraint' reasoning above — the constraint is the SAME
// share of ticks as before, it just costs a smaller multiplier now that the
// abilities being paid for are worth casting.
// ⚠️ 0.18 -> 0.30, re-swept against the REWORKED pool. The old value was tuned
// when abilities were weak; once every stat was reworked and damage was tiered,
// mana stopped being a constraint at all — 39.7% of live ticks sat at FULL MP
// with nothing worth spending it on. Re-swept 0.18/0.22/0.26/0.30/0.34:
//
//   mult   starved   at FULL   managing   ability share   resolved   dur
//   0.18    11.1%     39.7%      49.2%        60%          10/12    35.4s
//   0.22    12.4%     23.6%      64.1%        60%          10/12    35.4s
//   0.26    14.2%     18.4%      67.3%        59%          10/12    35.4s
//   0.30    16.6%     13.3%      70.2%        58%          10/12    35.0s  <- chosen
//   0.34    24.8%      9.9%      65.4%        55%          10/12    34.9s
//
// ⚠️ Chosen on the MANAGING column, not the ability share. 'at FULL' is the
// direct measure of mana doing nothing, and 70.2% spent actively managing MP is
// the state where the resource is a decision. That knowingly trades 2 points of
// ability share (58% vs the >60% target) — a target set back when the pool was
// weak and the free attack was genuinely competitive with it. Abilities are
// still the clear majority of casts, and some basic attacks between casts is
// correct play rather than a failure.
// ⚠️ FIELD-ONLY. battle.ts uses manaCost() raw, so the 12 goldens cannot move.
export const FIELD_MANA_COST_MULT = 0.30

/**
 * FIELD loadout size — 4, against the turn engine's 3. More equipped abilities
 * means more that is off cooldown at any moment, which is the direct lever on the
 * action economy: fewer dead seconds filled by the free attack, and more room for
 * counterplay in what a monster brings.
 * ⚠️ FIELD-ONLY. `chooseLoadout` still defaults to 3, so battle.ts equips exactly
 * what it always did and the 12 goldens cannot move.
 */
export const FIELD_LOADOUT_SIZE = 4

/**
 * How far CONTAGION (`spreadStatus`) can jump from its victim, in field units.
 * ~3 body-widths: it punishes a clumped line and does nothing against a spread
 * one, which is what makes the `spacing` tactic a real decision rather than
 * flavour. The turn engine has no geometry and spreads to any N enemies; on a
 * field that would be a strictly better effect for free.
 */
export const CONTAGION_RADIUS = 5.5

/**
 * How far a TEAM buff, ward or heal reaches from the caster, in field units.
 *
 * ⚠️ TEAM EFFECTS USED TO HAVE NO RANGE AT ALL — `units.filter(x => x.side ===
 * u.side)`, so a war cry reached an ally on the far side of a 40x22 field.
 * Support was the only role in the game that was completely position-blind: a
 * Bard could stand in a corner and buff as well as one standing with its line.
 * 9 covers a team that is fighting together and drops a straggler or a diving
 * assassin. Sits under LEASH_RADIUS (12) on purpose — a unit at the leash edge
 * is exactly the one that should fall out of the aura.
 *
 * ⚠️ AT 9 THIS IS A GUARD RAIL, NOT A DECISION, and that is deliberate. Measured
 * ally-to-ally spacing over 45,842 sampled pairs:
 *     radius  5 -> 15.0% of allies missed      radius  8 -> 2.3%
 *     radius  6 ->  8.8%                       radius  9 -> 0.7%
 *     radius  7 ->  5.0%                       radius 10 -> 0.7%
 * Teams fight inside 9 almost always, so this punishes only a support that has
 * genuinely wandered off — 200 paired fights moved 8 of them (p = 0.29). Drop it
 * to 6-7 to make positioning a real cost; that is a BALANCE decision with a
 * measurable price, not a tuning nicety, so it is left generous until asked for.
 */
export const TEAM_AURA_RADIUS = 9

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
// ⚠️ MELEE WAS 1.6 AND THAT IS SMALLER THAN TWO MONSTERS. Unit radius is 0.9, so
// two bodies in contact sit 1.8 apart centre-to-centre — further than melee could
// reach. COLLISION_R_FRAC exists solely to shrink the collision floor to 1.19 so
// a swing connects at all, which left melee an operating window of 1.19..1.60:
// a 0.41-unit band on a 40-unit field, about 20x less positional tolerance than
// ranged. Measured consequence: melee units were in range of their best move 9%
// of ticks and melee was 6.5% of all damage in the game.
// 3.0 is arm's reach plus a step. Swept 2.2/2.6/3.0/3.4/3.8 — the gain plateaus
// by 3.0 (37/40 resolved @ 23.2s vs 34/40 @ 27.0s) and everything past it buys
// almost nothing while blurring melee against ranged 8 / magic 7.
export const CHANNEL_RANGE: Record<Channel, number> = {
  melee: 3.0,
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
