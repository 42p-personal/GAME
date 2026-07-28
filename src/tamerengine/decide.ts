// The brain of the field engine: who do I attack, and where do I stand?
//
// Everything here is a PURE function of the units' state — no randomness, no
// mutation — so it is directly unit-testable and the tick loop stays readable.
import { Monster, Stat, roleOfClass } from '../core'
import { FieldTraits, FieldUnit, Vec2, FIELD_W, FIELD_H, CHANNEL_RANGE } from './types'
import { coachedValue, panicThreshold, personalityOf, resolvePersonality, threatRadius } from './personality'

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
  // by its DISCIPLINE — so an untemperamentd bruiser ordered to hold back still
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
/**
 * The range this monster wants to FIGHT at.
 *
 * ⚠️ DAMAGE MOVES ONLY. Scanning the whole loadout meant a melee bruiser
 * carrying any support move — a war cry, a heal, a taunt, all of which reach
 * 5–6 — took its stand-off distance from that and parked outside its own
 * swinging range, never landing a blow all fight. A support move's reach
 * governs when that move can be cast (checked separately), never where the
 * monster chooses to stand.
 */
export function reachOf(u: FieldUnit): number {
  let best = 0
  for (const mv of u.m.loadout) {
    if (mv.type !== 'damage') continue
    const r = mv.range ?? CHANNEL_RANGE[mv.channel]
    if (r > best) best = r
  }
  return best || CHANNEL_RANGE.melee
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
export function pickTarget(self: FieldUnit, enemies: FieldUnit[], allies: FieldUnit[], now = 0): FieldUnit | null {
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
    // allies are already hitting. An AWARE monster answers whoever is diving
    // its friends — without this term nothing ever punishes a dive, and the
    // assassin archetype has no counter at all.
    const score =
      1.00 * proximity * (1 - 0.65 * predation) +
      0.85 * wounded * (0.5 + predation) +
      0.90 * value * predation +
      0.80 * focus * cohesion +
      1.10 * diveThreat(self, e, allies) +
      priorityBias(self, e)

    // FADE is the anti-taunt: while it holds, this monster is simply not worth
    // looking at, so attackers drift onto someone else. A heavy multiplier
    // rather than true untargetability, so a lone faded survivor is still
    // eventually found and the fight cannot stall.
    const faded = e.fadedUntil > now ? 0.15 : 1
    const final = score * faded
    if (final > bestScore) { bestScore = final; best = e }
  }
  return best
}

/**
 * How badly this enemy needs answering: is it bearing down on a teammate who
 * cannot survive it? Scaled by the observer's AWARENESS, so an oblivious
 * bruiser keeps hitting whatever is in front of it while an alert one turns
 * to intercept. This is the counterplay to Predation.
 */
export function diveThreat(self: FieldUnit, e: FieldUnit, allies: FieldUnit[]): number {
  const p = personalityOf(self.m)
  const radius = threatRadius(p)
  let worst = 0
  for (const a of allies) {
    if (a.dead || a.id === self.id) continue
    const d = dist(e.pos, a.pos)
    if (d > radius) continue
    // A squishy, valuable, already-hurt ally is the one worth turning for.
    const stakes = valueOf(a) * (1.3 - clamp01(a.hp / a.maxHp) * 0.6)
    worst = Math.max(worst, (1 - d / radius) * stakes)
  }
  return worst * (p.awareness / 100)
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

/** How early a ranged monster starts giving ground — awareness buys distance. */
const kiteAt = (u: FieldUnit): number => 0.45 + (personalityOf(u.m).awareness / 100) * 0.3


// ── SPATIAL ORDERS (v0.93) ──────────────────────────────────────────────────
// Coaching that only means anything on real ground. Each is applied in
// proportion to the monster's TEMPERAMENT, exactly like every other order: a
// wilful monster told to hold the line still wanders forward.

/** How far out to fight, as a multiplier on the unit's natural stand-off. */
export function engageMult(u: FieldUnit): number {
  const order = u.m.tactics?.engageRange
  if (!order) return 1
  // skirmish = fight at the edge of reach; brawl = get in its face.
  const want = order === 'skirmish' ? 1.3 : order === 'brawl' ? 0.55 : 1
  return coachedValue(1, want, personalityOf(u.m).temperament)
}

/** Personal-space radius. Spread fans out against AoE; tight clumps to focus. */
export function spacingRadius(u: FieldUnit): number {
  const order = u.m.tactics?.spacing
  const base = u.radius * 2
  if (!order) return base
  const want = order === 'spread' ? base * 2.6 : base * 0.75
  return coachedValue(base, want, personalityOf(u.m).temperament)
}

/**
 * Will this monster chase past the enemy front line? A 'hold' order caps how
 * far into enemy ground it is willing to go — the answer to a team that keeps
 * over-extending into a counter-attack.
 */
export function commitLimit(u: FieldUnit): number {
  const order = u.m.tactics?.commit
  // ⚠️ The "no limit" sentinel MUST be side-aware. Side A clamps with min() and
  // side B with max(), so a single shared sentinel of FIELD_W pinned every B
  // unit to the far edge and they could never advance at all.
  if (order !== 'hold') return u.side === 'A' ? FIELD_W : 0
  // Refuse to go much past the halfway line.
  const cap = u.side === 'A' ? FIELD_W * 0.58 : FIELD_W * 0.42
  return coachedValue(u.side === 'A' ? FIELD_W : 0, cap, personalityOf(u.m).temperament)
}

// ── Positioning ─────────────────────────────────────────────────────────────
/**
 * Where this unit wants to be standing. Returns a world point; the engine
 * steers toward it and handles collision.
 */
export function desiredGoal(
  self: FieldUnit, target: FieldUnit | null, allies: FieldUnit[], enemies: FieldUnit[],
  /** injected by the engine so this file stays free of geometry imports */
  losFn?: (a: Vec2, b: Vec2) => boolean,
): Vec2 {
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
  const standoff = Math.max(0.8, reach * 0.85 * engageMult(self))
  let goal: Vec2
  if (d > standoff) {
    goal = add(self.pos, scale(toward, d - standoff))
  } else if (reach > 3 && d < reach * kiteAt(self)) {
    // KITING: a ranged unit backs off when something closes on it — and an
    // AWARE one starts backing off earlier, before it is already in trouble.
    goal = add(self.pos, scale(toward, -(reach * kiteAt(self) - d)))
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
  // USE COVER: sample a ring around the intended spot and prefer ground where
  // an obstacle breaks the enemies' line to us while our own target stays
  // reachable. Cover you cannot shoot from is just hiding.
  if (self.m.tactics?.useCover && losFn && liveEnemies.length) {
    const threat = centroid(liveEnemies)
    const obey = personalityOf(self.m).temperament / 100
    if (obey > 0.25 && losFn(goal, threat)) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const c = { x: goal.x + Math.cos(a) * 3.5, y: goal.y + Math.sin(a) * 3.5 }
        if (c.x < 1 || c.x > FIELD_W - 1 || c.y < 1 || c.y > FIELD_H - 1) continue
        if (losFn(c, threat)) continue           // still exposed
        if (dist(c, target.pos) > reach) continue // cannot shoot from there
        goal = c
        break
      }
    }
  }

  // ── ARCHETYPE POSITIONING ───────────────────────────────────────────────
  // On top of the reach-driven standoff/kite above, each role wants a different
  // PLACE on the field. Artillery already kites (reach > 3); this adds the other
  // three. Blended, not absolute, so the personality axes and tactics still bend
  // it — a coached 'brawl' anchor still gets in deeper than a timid one.
  const enemyDir = self.side === 'A' ? 1 : -1
  switch (archetypeOf(self)) {
    case 'anchor': {
      // Hold the FRONT of the line: nudge toward the nearest enemy so the tank
      // is the body between the team and the threat.
      goal.x += enemyDir * 1.0
      break
    }
    case 'support': {
      // Stay BEHIND the line — pull back toward home and toward the ally in the
      // most trouble, so heals land and the support isn't caught out front.
      goal.x -= enemyDir * 1.3
      if (liveAllies.length) {
        const worst = [...liveAllies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
        goal = { x: goal.x * 0.7 + worst.pos.x * 0.3, y: goal.y * 0.7 + worst.pos.y * 0.3 }
      }
      break
    }
    case 'assassin': {
      // After a strike the diver breaks off — dart back toward safety for a beat
      // (`disengageFor`, set by the engine on the assassin's hit) before diving
      // again. This is the in-and-out that makes an assassin read differently
      // from a bruiser that just parks on the target.
      if (self.disengageFor > 0 && liveEnemies.length) {
        const away = norm(sub(self.pos, centroid(liveEnemies)))
        goal = { x: self.pos.x + away.x * 7, y: self.pos.y + away.y * 7 }
      }
      break
    }
  }

  // COMMIT: a 'hold' order refuses to over-extend past the halfway line.
  const limit = commitLimit(self)
  if (self.side === 'A') goal.x = Math.min(goal.x, limit)
  else goal.x = Math.max(goal.x, limit)

  return {
    x: Math.min(FIELD_W - 0.5, Math.max(0.5, goal.x)),
    y: Math.min(FIELD_H - 0.5, Math.max(0.5, goal.y)),
  }
}

/** Field positioning archetypes, derived from stats + reach + personality. */
export type Archetype = 'anchor' | 'artillery' | 'assassin' | 'support' | 'skirmisher'
export function archetypeOf(u: FieldUnit): Archetype {
  if (roleOfClass(u.m.className) === 'support') return 'support'
  // Artillery = a genuine RANGED or MAGIC single-target reach. ⚠️ Voice reach
  // does NOT count: a voice AoE radiates from the CASTER, so a screamer wants to
  // be AMONG the enemies, not kiting at range — treating it as artillery makes
  // it back off and whiff its own AoE.
  const longRanged = u.m.loadout.some(
    (mv) => mv.type === 'damage'
      && (mv.channel === 'ranged' || mv.channel === 'magic')
      && (mv.range ?? CHANNEL_RANGE[mv.channel]) > 3,
  )
  if (longRanged) return 'artillery'
  const s = u.m.stats
  if (s.CON >= s.STR && s.CON >= s.DEX && s.CON >= s.INT) return 'anchor' // tanky → front
  if (s.DEX >= s.STR && personalityOf(u.m).aggression > 52) return 'assassin' // fast + eager
  return 'skirmisher'
}
