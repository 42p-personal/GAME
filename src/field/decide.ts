// The brain of the field engine: who do I attack, and where do I stand?
//
// Everything here is a PURE function of the units' state — no randomness, no
// mutation — so it is directly unit-testable and the tick loop stays readable.
import { Monster, Stat, roleOfClass } from '../core'
import { FieldTraits, FieldUnit, Vec2, FIELD_W, FIELD_H, CHANNEL_RANGE } from './types'
import { panicThreshold, personalityOf, resolvePersonality } from './personality'

export const v = (x: number, y: number): Vec2 => ({ x, y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y)
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const FIELD_DIAG = Math.hypot(FIELD_W, FIELD_H)

// ── The two new stats ───────────────────────────────────────────────────────
// Derived from the coaching the player ALREADY sets (tactics) plus the
// monster's emergent class, so the feature needs no new authored data to work.
// They are first-class fields on the unit, so they can later be authored,
// trained, or bred without changing any of the logic that consumes them.
export function traitsFor(m: Monster): FieldTraits {
  // PERSONALITY FIRST, coaching second. resolvePersonality blends the monster's
  // innate aggression/teamplay with what your Tactics are asking for, weighted
  // by its DISCIPLINE — so an undisciplined bruiser ordered to hold back still
  // charges. These two numbers are the whole behavioural identity of the unit.
  const { aggression, teamplay } = resolvePersonality(m)
  let predation = aggression
  let cohesion = teamplay

  // Small role/order nudges on top of who it is.
  if (roleOfClass(m.className) === 'support') cohesion += 0.12
  if (m.protect) cohesion += 0.12 // told to guard someone: by definition a team player
  if (m.tactics?.targetPriority === 'tanks') predation -= 0.1 // content to grind the front

  return { cohesion: clamp01(cohesion), predation: clamp01(predation) }
}

/** Rough offensive output, used to judge how dangerous an enemy is. */
export function threatOf(m: Monster): number {
  const statOf = (s: Stat) => m.stats[s] ?? 0
  let best = 0
  for (const mv of m.loadout) {
    if (mv.type !== 'damage') continue
    best = Math.max(best, mv.power * (1 + statOf(mv.stat) / 400))
  }
  return best
}

/** How rewarding this enemy is to kill: high output, low durability. */
export function valueOf(u: FieldUnit): number {
  const out = clamp01(threatOf(u.m) / 140)
  const tough = clamp01(u.maxHp / 900)
  return clamp01(out * (1.2 - tough * 0.7))
}

/** The reach of the longest-ranged damaging move this unit can currently use. */
export function reachOf(u: FieldUnit): number {
  let best = CHANNEL_RANGE.melee
  for (const mv of u.m.loadout) {
    const r = mv.range ?? CHANNEL_RANGE[mv.channel]
    if (r > best) best = r
  }
  return best
}

export const centroid = (us: FieldUnit[]): Vec2 => {
  if (!us.length) return v(FIELD_W / 2, FIELD_H / 2)
  let x = 0, y = 0
  for (const u of us) { x += u.pos.x; y += u.pos.y }
  return v(x / us.length, y / us.length)
}

// ── Target selection ────────────────────────────────────────────────────────
// A weighted score per enemy. The weights themselves are bent by the unit's
// traits, which is what makes an assassin and an anchor behave differently while
// running identical code.
export function pickTarget(self: FieldUnit, enemies: FieldUnit[], allies: FieldUnit[]): FieldUnit | null {
  const live = enemies.filter((e) => !e.dead)
  if (!live.length) return null
  const { cohesion, predation } = self.traits

  // How many allies are already committed to each enemy — the focus-fire signal.
  const focusCount = new Map<string, number>()
  for (const a of allies) {
    if (a.dead || a.id === self.id || !a.targetId) continue
    focusCount.set(a.targetId, (focusCount.get(a.targetId) ?? 0) + 1)
  }
  const allyN = Math.max(1, allies.length - 1)

  let best: FieldUnit | null = null
  let bestScore = -Infinity
  for (const e of live) {
    const d = dist(self.pos, e.pos)
    const proximity = 1 - clamp01(d / FIELD_DIAG)
    const wounded = 1 - clamp01(e.hp / e.maxHp)
    const value = valueOf(e)
    const focus = clamp01((focusCount.get(e.id) ?? 0) / allyN)

    // A predator discounts distance (it will cross the field for the right
    // kill) and weights value heavily. A team player weights whatever its
    // allies are already hitting.
    const score =
      1.00 * proximity * (1 - 0.65 * predation) +
      0.85 * wounded * (0.5 + predation) +
      0.90 * value * predation +
      0.80 * focus * cohesion +
      priorityBias(self, e)

    if (score > bestScore) { bestScore = score; best = e }
  }
  return best
}

/** The player's explicit target order, as a nudge rather than an override. */
function priorityBias(self: FieldUnit, e: FieldUnit): number {
  const p = self.m.tactics?.targetPriority
  if (p === 'weakest') return (1 - clamp01(e.hp / e.maxHp)) * 0.35
  if (p === 'casters') return roleOfClass(e.m.className) === 'support' ? 0.3 : 0
  if (p === 'tanks') return clamp01(e.maxHp / 900) * 0.3
  if (p === 'focus') return e.m.marked ? 0.5 : 0
  return 0
}

// ── Positioning ─────────────────────────────────────────────────────────────
/**
 * Where this unit wants to be standing. Returns a world point; the engine
 * steers toward it and handles collision.
 */
export function desiredGoal(self: FieldUnit, target: FieldUnit | null, allies: FieldUnit[], enemies: FieldUnit[]): Vec2 {
  const liveAllies = allies.filter((a) => !a.dead && a.id !== self.id)
  const liveEnemies = enemies.filter((e) => !e.dead)
  const homeX = self.side === 'A' ? 2 : FIELD_W - 2

  // Playing to survive: below its threshold it disengages toward its own edge.
  const hpFrac = self.hp / self.maxHp
  // COMPOSURE decides when it breaks. A steady monster holds until it is
  // nearly done; a flighty one bails early. An explicit 'preserve' order raises
  // the floor on top of that.
  const preserve = self.m.tactics?.preserve ?? 'off'
  const innatePanic = panicThreshold(personalityOf(self.m))
  const ordered = preserve === 'defensive' ? 0.4 : preserve === 'cautious' ? 0.25 : 0
  const retreatAt = Math.max(innatePanic, ordered)
  if (retreatAt > 0 && hpFrac < retreatAt && liveEnemies.length) {
    const away = norm(sub(self.pos, centroid(liveEnemies)))
    return {
      x: Math.min(FIELD_W - 1, Math.max(1, self.pos.x + away.x * 6 + (homeX - self.pos.x) * 0.25)),
      y: Math.min(FIELD_H - 1, Math.max(1, self.pos.y + away.y * 6)),
    }
  }

  if (!target) return centroid(liveAllies.length ? liveAllies : [self])

  const reach = reachOf(self)
  const d = dist(self.pos, target.pos)
  const toward = norm(sub(target.pos, self.pos))

  // Stand-off point: just inside reach, so a ranged unit does not walk into a
  // melee unit's face and a melee unit does close all the way.
  const standoff = Math.max(0.8, reach * 0.85)
  let goal: Vec2
  if (d > standoff) {
    goal = add(self.pos, scale(toward, d - standoff))
  } else if (reach > 3 && d < reach * 0.55) {
    // KITING: a ranged unit backs off when something closes on it.
    goal = add(self.pos, scale(toward, -(reach * 0.55 - d)))
  } else {
    goal = { ...self.pos }
  }

  // COHESION pulls the goal back toward the team. A high-cohesion unit will not
  // stray far from its allies even to reach a juicy target; a low-cohesion one
  // goes wherever it likes. This single blend is what makes a team look like a
  // team rather than five monsters running separate errands.
  if (liveAllies.length) {
    const c = centroid(liveAllies)
    const pull = self.traits.cohesion * 0.35
    goal = { x: goal.x * (1 - pull) + c.x * pull, y: goal.y * (1 - pull) + c.y * pull }
  }
  return {
    x: Math.min(FIELD_W - 0.5, Math.max(0.5, goal.x)),
    y: Math.min(FIELD_H - 0.5, Math.max(0.5, goal.y)),
  }
}
