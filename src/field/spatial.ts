// Which existing moves gain a spatial dimension on the field (v0.93).
//
// Keyed by move NAME, exactly like arena.tsx's BESPOKE_KIND — a curated table
// rather than a data pass over all 140 moves. Anything not listed simply has no
// spatial behaviour, so this is additive and reversible, and the turn-based
// engine never reads it either way.
//
// The point of these is that positioning becomes a DECISION rather than a
// consequence. Before them, where a monster stood was only ever an output of
// the steering code; now a kit can attack the geometry itself — close a gap
// that was keeping you safe, drag a caster out from behind cover, or pin the
// assassin that just landed on your healer.
import { MoveSpatial } from '../core'

export const SPATIAL_MOVES: Record<string, MoveSpatial> = {
  // ── GAP CLOSERS ───────────────────────────────────────────────────────────
  // The counter to kiting. A charge crosses the ground, so cover still stops
  // it — that is what keeps it fair against a caster who positioned well.
  'Power Strike': { move: { kind: 'dash', to: 'target', maxRange: 7 } },
  'Reckless Slam': { move: { kind: 'dash', to: 'target', maxRange: 8 } },
  'Titanfall': { move: { kind: 'dash', to: 'target', maxRange: 9 }, push: 2.5 },
  'Colossus Crash': { move: { kind: 'dash', to: 'target', maxRange: 8 }, push: 3 },
  'Body Slam': { move: { kind: 'dash', to: 'target', maxRange: 7 }, push: 3 }, // already a knockback move

  // ── TELEPORTS ─────────────────────────────────────────────────────────────
  // A blink IGNORES cover, which is the entire reason to want one: it is the
  // only way to reach a caster who has correctly hidden behind a rock.
  // Paid for with a backstab that only lands if you actually arrive behind.
  'Shadow Barrage': { move: { kind: 'blink', to: 'behindTarget', maxRange: 12 }, backstab: 1.45 },
  'Void Lance': { move: { kind: 'blink', to: 'behindTarget', maxRange: 14 }, backstab: 1.4 },
  'Executioner': { move: { kind: 'blink', to: 'behindTarget', maxRange: 10 }, backstab: 1.6 },
  'Mana Leech': { move: { kind: 'blink', to: 'awayFromTarget', maxRange: 9 } }, // escape, not engage

  // ── FORCED MOVEMENT ───────────────────────────────────────────────────────
  // Pull is the answer to a turtled back line; push is the answer to a diver
  // standing on your healer. Both are counterplay, not just damage.
  'Pin Down': { pull: 5, root: 1.2 },
  'Snipe': { pull: 0, slow: { mult: 0.6, duration: 1.5 } }, // crippling shot
  'Deep Freeze': { root: 1.6 },
  'Glacial Prison': { root: 2.0 },
  'Sonic Boom': { push: 4 },
  'Earthshaker': { push: 3.5, slow: { mult: 0.6, duration: 2 } },
  'Rain of Arrows': { push: 3 }, // already a knockback move

  // ── MOVEMENT DENIAL ───────────────────────────────────────────────────────
  // Rooting a fast monster is worth more than damaging it — this is where DEX
  // as move speed finally has a real counter.
  'Lullaby': { slow: { mult: 0.45, duration: 2.5 } },
  'Captivate': { slow: { mult: 0.55, duration: 3 } },
  'Static Chain': { slow: { mult: 0.6, duration: 2 } },
}

/** The spatial behaviour of a move, if it has one. */
export const spatialOf = (moveName: string): MoveSpatial | undefined => SPATIAL_MOVES[moveName]
