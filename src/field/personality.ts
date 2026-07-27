// ─────────────────────────────────────────────────────────────────────────────
// PERSONALITY (v0.93) — who a monster IS, as opposed to what you tell it to do.
//
// Four innate axes, 0..100. Your per-fight Tactics are COACHING laid on top;
// DISCIPLINE decides how much of that coaching actually sticks. Order an
// untemperamentd bruiser to hold the line and it will charge anyway — which is
// the point. Coaching becomes a negotiation with a creature, not a switch.
//
// ⚠️ DERIVED FROM THE SEED, NEVER ROLLED IN generateMonster.
// Monster generation's rng stream is load-bearing: the 12 golden battles pin
// it, and CLAUDE.md's standing warning is that anything drawing from that
// stream shifts them. So personality runs on its OWN stream keyed off the
// monster's seed. Consequences, all good:
//   • every existing monster — including ones in old saves — already HAS a
//     personality, with no migration
//   • the goldens cannot move, because generation is untouched
//   • it is stable: the same monster is always the same character
// ─────────────────────────────────────────────────────────────────────────────
import { Monster, Personality, Species, Tactics, hashString, mulberry32 } from '../core'

export type { Personality } from '../core'

export type PersonalityAxis = keyof Personality

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

/**
 * A species' natural disposition, read off its base stats so all 65 species
 * have a sensible character without a separate authoring pass. A species may
 * override this later by declaring its own block.
 */
function speciesBias(sp: Species): Personality {
  const b = sp.base
  const total = Math.max(1, b.STR + b.DEX + b.CON + b.WIS + b.INT + b.CHA)
  const share = (n: number) => (n / total) * 6 // 1.0 == an even share
  return {
    // Brawn and speed want to be in the fight; bulk and wisdom are patient.
    aggression: 50 + (share(b.STR) + share(b.DEX) - share(b.CON) - share(b.WIS)) * 16,
    // Presence and wisdom make a team player.
    teamplay: 50 + (share(b.CHA) + share(b.WIS) - share(b.STR)) * 15,
    // Toughness and wisdom keep their head.
    mental: 50 + (share(b.CON) + share(b.WIS) - share(b.DEX)) * 15,
    // Intellect and wisdom follow a plan.
    temperament: 50 + (share(b.INT) + share(b.WIS) - share(b.STR)) * 15,
    // Quick eyes and a quick mind spot the flanker; bulk does not.
    awareness: 50 + (share(b.DEX) + share(b.INT) - share(b.CON)) * 15,
    // Deliberate and durable monsters wait for the moment; twitchy ones do not.
    patience: 50 + (share(b.CON) + share(b.WIS) - share(b.DEX)) * 15,
  }
}

/**
 * This individual's personality: its species' disposition plus its own
 * variation. Pure and stable for a given (seed, species).
 */
export function basePersonality(seed: string, sp: Species): Personality {
  const rng = mulberry32(hashString(seed + ':personality:v1'))
  const bias = speciesBias(sp)
  // ±18 of individual character, so two Tortavos are recognisably the same
  // species and still distinct animals.
  const vary = () => (rng() * 2 - 1) * 18
  return {
    aggression: clamp(bias.aggression + vary()),
    teamplay: clamp(bias.teamplay + vary()),
    mental: clamp(bias.mental + vary()),
    temperament: clamp(bias.temperament + vary()),
    awareness: clamp(bias.awareness + vary()),
    patience: clamp(bias.patience + vary()),
  }
}

/**
 * The personality actually in play: innate, plus any drift earned through
 * training, care or breeding (stored on the monster when present).
 */
export function personalityOf(m: Monster): Personality {
  const base = basePersonality(m.seed, m.species)
  const drift = m.personality
  if (!drift) return base
  return {
    aggression: clamp(base.aggression + (drift.aggression ?? 0)),
    teamplay: clamp(base.teamplay + (drift.teamplay ?? 0)),
    mental: clamp(base.mental + (drift.mental ?? 0)),
    temperament: clamp(base.temperament + (drift.temperament ?? 0)),
    awareness: clamp(base.awareness + (drift.awareness ?? 0)),
    patience: clamp(base.patience + (drift.patience ?? 0)),
  }
}

// ── Coaching ────────────────────────────────────────────────────────────────
/** What the player's orders are ASKING for, as 0..1 targets. */
function coachingTargets(t: Tactics | undefined): { aggression?: number; teamplay?: number } {
  if (!t) return {}
  const out: { aggression?: number; teamplay?: number } = {}
  if (t.temperament === 'aggressive') out.aggression = 0.9
  if (t.temperament === 'cautious') out.aggression = 0.15
  if (t.temperament === 'balanced') out.aggression = 0.5
  if (t.targetPriority === 'focus') out.teamplay = 0.9
  if (t.targetPriority === 'casters') out.aggression = Math.max(out.aggression ?? 0, 0.8)
  if (t.preserve && t.preserve !== 'off') out.aggression = Math.min(out.aggression ?? 1, 0.3)
  return out
}

/**
 * Blend innate disposition with coaching, weighted by DISCIPLINE.
 *
 * obey = temperament/100. At obey 1 the order lands in full; at obey 0 the
 * monster ignores you and plays to its nature. This single line is what makes
 * a stable full of individuals feel different from a stable of settings.
 */
export function coachedValue(innate01: number, coached01: number | undefined, temperament: number): number {
  if (coached01 === undefined) return innate01
  const obey = clamp(temperament) / 100
  return innate01 * (1 - obey) + coached01 * obey
}

/** How readily this monster disengages when hurt — low mental panics early. */
export function panicThreshold(p: Personality): number {
  // 0.45 at no mental down to 0.10 at full mental.
  return 0.45 - (p.mental / 100) * 0.35
}

/**
 * How reliably it picks its BEST available move rather than just something
 * that is off cooldown. Temperament is execution as well as obedience.
 */
export function executionQuality(p: Personality): number {
  return 0.55 + (p.temperament / 100) * 0.45
}

/** Everything the field engine needs, resolved once per fight. */
export function resolvePersonality(m: Monster): {
  p: Personality
  /** 0..1, post-coaching — feeds `predation` */
  aggression: number
  /** 0..1, post-coaching — feeds `cohesion` */
  teamplay: number
} {
  const p = personalityOf(m)
  const want = coachingTargets(m.tactics)
  return {
    p,
    aggression: coachedValue(p.aggression / 100, want.aggression, p.temperament),
    teamplay: coachedValue(p.teamplay / 100, want.teamplay, p.temperament),
  }
}

/**
 * How far out this monster notices a threat, in world units. An oblivious
 * monster only reacts to what is already on top of it.
 */
export const threatRadius = (p: Personality): number => 3 + (p.awareness / 100) * 7

/**
 * How soft a target has to be before a PATIENT monster will spend one of its
 * big cooldowns on it. At patience 0 it fires the moment the move is up; at
 * 100 it waits until the target is at half health (a guaranteed kill always
 * overrides this — see worthSpending).
 */
export const spendAbove = (p: Personality): number => 1 - (p.patience / 100) * 0.5
