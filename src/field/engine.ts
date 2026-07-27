// The field engine's simulation loop.
//
// DETERMINISM IS THE CONTRACT. Everything downstream — resuming a saved cup,
// recomputing standings, the sim harness, replaying a fight in the arena —
// depends on `simulateFieldBattle` being a pure function of
// (monsters + placement + obstacles + seed). So: fixed dt, fixed unit order,
// one seeded rng stream, and no wall-clock or Math.random anywhere.
import { Channel, Monster, Move, Stat, mulberry32, hashString } from '../core'
import { manaCost, maxHp, maxMana } from '../monster'
import {
  DT, FIELD_H, FIELD_W, FieldEvent, FieldResult, FieldSetup, FieldSide, FieldUnit,
  MAX_TICKS, Obstacle, RETARGET_EVERY, UnitVisState, Vec2,
  CHANNEL_CAST_TIME, CHANNEL_RANGE, DEPLOY_DEPTH,
} from './types'
import { desiredGoal, dist, norm, pickTarget, sub, traitsFor } from './decide'

// ── Geometry helpers ────────────────────────────────────────────────────────
const insideObstacle = (p: Vec2, o: Obstacle, pad = 0) =>
  p.x > o.x - pad && p.x < o.x + o.w + pad && p.y > o.y - pad && p.y < o.y + o.h + pad

/** Does the segment a→b cross this rectangle? Used for line of sight. */
function segmentHitsRect(a: Vec2, b: Vec2, o: Obstacle): boolean {
  // Cheap reject on bounding boxes first.
  if (Math.max(a.x, b.x) < o.x || Math.min(a.x, b.x) > o.x + o.w) return false
  if (Math.max(a.y, b.y) < o.y || Math.min(a.y, b.y) > o.y + o.h) return false
  // Sample the segment — at these scales this is both accurate enough and
  // completely predictable, which matters more here than elegance.
  const steps = Math.max(4, Math.ceil(dist(a, b) * 2))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (insideObstacle(p, o)) return true
  }
  return false
}

export const hasLineOfSight = (a: Vec2, b: Vec2, obstacles: Obstacle[]): boolean =>
  !obstacles.some((o) => segmentHitsRect(a, b, o))

// ── Setup ───────────────────────────────────────────────────────────────────
/** Default cover: a symmetric pair of blocks so neither side is advantaged. */
export const DEFAULT_OBSTACLES: Obstacle[] = [
  { x: FIELD_W / 2 - 1.2, y: 3.5, w: 2.4, h: 4.5 },
  { x: FIELD_W / 2 - 1.2, y: FIELD_H - 8, w: 2.4, h: 4.5 },
]

/** Auto-deployment when the player has not placed anyone: a front arc and a back line. */
function autoPlace(team: Monster[], side: FieldSide): Vec2[] {
  const n = team.length
  return team.map((m, i) => {
    // Sturdier monsters take the front; casters and healers sit behind.
    const front = m.stats.CON + m.stats.STR >= m.stats.INT + m.stats.WIS
    const depth = front ? DEPLOY_DEPTH * 0.75 : DEPLOY_DEPTH * 0.3
    const x = side === 'A' ? depth : FIELD_W - depth
    const spread = Math.min(FIELD_H - 4, n * 3.2)
    const y = n === 1 ? FIELD_H / 2 : FIELD_H / 2 - spread / 2 + (i * spread) / Math.max(1, n - 1)
    return { x, y }
  })
}

function buildUnit(m: Monster, side: FieldSide, slot: number, pos: Vec2): FieldUnit {
  const hp = Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats))
  const mp = Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats))
  return {
    id: side + slot,
    side, slot, m,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: 0.9,
    // DEX drives how fast it crosses the field — the stat finally has a
    // spatial meaning beyond initiative.
    speed: 2.4 + (m.stats.DEX / 1000) * 3.6,
    hp, maxHp: maxHp(m.stats),
    mp, maxMp: maxMana(m.stats),
    traits: traitsFor(m),
    targetId: null,
    retargetIn: 0,
    cooldowns: {},
    castingFor: 0,
    castMoveId: null,
    statuses: [],
    dead: false,
  }
}

// ── Move selection ──────────────────────────────────────────────────────────
const rangeOf = (mv: Move) => mv.range ?? CHANNEL_RANGE[mv.channel]
const castOf = (mv: Move) => mv.castTime ?? CHANNEL_CAST_TIME[mv.channel]

/** The best move this unit can actually land on its target right now. */
function chooseMove(u: FieldUnit, target: FieldUnit, obstacles: Obstacle[]): Move | null {
  const d = dist(u.pos, target.pos)
  let best: Move | null = null
  let bestScore = -Infinity
  for (const mv of u.m.loadout) {
    if (mv.type !== 'damage') continue
    if ((u.cooldowns[mv.id] ?? 0) > 0) continue
    if (u.mp < manaCost(mv)) continue
    if (d > rangeOf(mv)) continue
    // Ranged and magic need to actually SEE the target — cover is real.
    if (mv.channel !== 'melee' && !hasLineOfSight(u.pos, target.pos, obstacles)) continue
    const score = mv.power
    if (score > bestScore) { bestScore = score; best = mv }
  }
  return best
}

/**
 * The free universal attack. Every unit needs one it can use AT ITS OWN REACH:
 * a first pass gave everyone a melee-only swing, so an archer whose skills were
 * all on cooldown simply stood at range doing nothing — 6 units managed one hit
 * every ~6 seconds and the fight read as passive. A basic attack matched to the
 * unit's natural range keeps everyone contributing between cooldowns.
 */
function basicAttack(u: FieldUnit): Move {
  // Fight at the range this monster is built for.
  let channel: Channel = 'melee'
  let best = 0
  for (const mv of u.m.loadout) {
    if (mv.type !== 'damage') continue
    if (mv.power > best) { best = mv.power; channel = mv.channel }
  }
  const stat: Stat = channel === 'melee' ? 'STR' : channel === 'ranged' ? 'DEX'
    : channel === 'magic' ? 'INT' : channel === 'voice' ? 'CHA' : 'WIS'
  return {
    id: 'basic', name: 'Attack', stat, learnLevel: 0, type: 'damage',
    channel, target: 'enemy',
    // Deliberately weak and fast — it fills the gaps between real skills, it
    // does not replace them.
    cooldown: 0.9, accuracy: 90,
    power: 12 + (u.m.stats[stat] ?? 0) / 26,
    range: CHANNEL_RANGE[channel] * 0.8,
    castTime: 0.15,
    desc: 'A basic strike.',
  }
}

// ── The loop ────────────────────────────────────────────────────────────────
export function simulateFieldBattle(setup: FieldSetup): FieldResult {
  const rng = mulberry32(hashString(
    setup.seed + ':' + setup.teamA.map((m) => m.seed).join(',') + '|' + setup.teamB.map((m) => m.seed).join(','),
  ))
  const obstacles = setup.obstacles ?? DEFAULT_OBSTACLES
  const placeA = setup.placeA ?? autoPlace(setup.teamA, 'A')
  const placeB = setup.placeB ?? autoPlace(setup.teamB, 'B')
  const units: FieldUnit[] = [
    ...setup.teamA.map((m, i) => buildUnit(m, 'A', i, placeA[i] ?? autoPlace(setup.teamA, 'A')[i])),
    ...setup.teamB.map((m, i) => buildUnit(m, 'B', i, placeB[i] ?? autoPlace(setup.teamB, 'B')[i])),
  ]
  const byId = new Map(units.map((u) => [u.id, u]))
  const events: FieldEvent[] = []
  const vis = new Map<string, UnitVisState>(units.map((u) => [u.id, 'idle']))

  const living = (side: FieldSide) => units.filter((u) => u.side === side && !u.dead)
  let tick = 0
  let winner: FieldSide | 'draw' = 'draw'

  for (; tick < MAX_TICKS; tick++) {
    const t = +(tick * DT).toFixed(2)

    if (!living('A').length || !living('B').length) {
      winner = living('A').length ? 'A' : living('B').length ? 'B' : 'draw'
      break
    }

    for (const u of units) {
      if (u.dead) { vis.set(u.id, 'dead'); continue }

      // timers
      for (const k of Object.keys(u.cooldowns)) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - DT)
      u.retargetIn -= DT
      u.mp = Math.min(u.maxMp, u.mp + (u.m.stats.WIS / 300) * DT)

      const foes = units.filter((x) => x.side !== u.side)
      const mates = units.filter((x) => x.side === u.side)

      // Commit to a target for RETARGET_EVERY, unless it died.
      const cur = u.targetId ? byId.get(u.targetId) : null
      if (!cur || cur.dead || u.retargetIn <= 0) {
        const pick = pickTarget(u, foes, mates)
        u.targetId = pick?.id ?? null
        u.retargetIn = RETARGET_EVERY
      }
      const target = u.targetId ? byId.get(u.targetId) ?? null : null

      // A committed cast roots the unit — this is the window a diver punishes.
      if (u.castingFor > 0) {
        u.castingFor -= DT
        vis.set(u.id, 'cast')
        if (u.castingFor <= 0 && u.castMoveId && target && !target.dead) {
          resolveHit(u, target, u.castMoveId)
        }
        continue
      }

      if (!target) { vis.set(u.id, 'idle'); continue }

      // Act if something is in range; otherwise reposition.
      // real skill first, else the basic attack if the target is within ITS reach
      let mv = chooseMove(u, target, obstacles)
      if (!mv) {
        const ba = basicAttack(u)
        const inReach = dist(u.pos, target.pos) <= (ba.range ?? CHANNEL_RANGE.melee)
        const canSee = ba.channel === 'melee' || hasLineOfSight(u.pos, target.pos, obstacles)
        if (inReach && canSee && (u.cooldowns.basic ?? 0) <= 0) mv = ba
      }
      if (mv) {
        u.castingFor = castOf(mv)
        u.castMoveId = mv.id
        u.cooldowns[mv.id] = mv.cooldown * 0.9 + castOf(mv)
        u.mp = Math.max(0, u.mp - manaCost(mv))
        events.push({ t, kind: 'cast', id: u.id, targetId: target.id, move: mv.name, channel: mv.channel })
        vis.set(u.id, 'cast')
        // Instant moves land the same tick they are cast.
        if (u.castingFor <= 0) { resolveHit(u, target, mv.id); u.castMoveId = null }
        continue
      }

      // MOVE. Steer toward the goal, slide off obstacles, keep off allies.
      const goal = desiredGoal(u, target, mates, foes)
      stepToward(u, goal, mates, obstacles)
      vis.set(u.id, 'move')
    }

    // One positional snapshot per tick for the renderer to interpolate.
    events.push({
      t, kind: 'snapshot',
      units: units.map((u) => ({
        id: u.id, x: +u.pos.x.toFixed(2), y: +u.pos.y.toFixed(2),
        hp: Math.round(u.hp),
        facing: u.side === 'A' ? 1 : -1,
        state: vis.get(u.id) ?? 'idle',
      })),
    })
  }

  if (winner === 'draw' && living('A').length !== living('B').length) {
    winner = living('A').length > living('B').length ? 'A' : 'B'
  }
  events.push({ t: +(tick * DT).toFixed(2), kind: 'end', winner })

  return {
    winner, events,
    duration: +(tick * DT).toFixed(2),
    survivorsA: living('A').length,
    survivorsB: living('B').length,
  }

  // ── inner helpers (close over rng/events/units) ───────────────────────────
  function resolveHit(u: FieldUnit, target: FieldUnit, moveId: string) {
    const mv = u.m.loadout.find((x) => x.id === moveId) ?? basicAttack(u)
    u.castMoveId = null
    const t2 = +(tick * DT).toFixed(2)
    if (target.dead) return
    // Out of range by the time it lands (the target walked away) — a real miss.
    if (dist(u.pos, target.pos) > rangeOf(mv) * 1.25) {
      events.push({ t: t2, kind: 'miss', id: u.id, targetId: target.id, move: mv.name })
      return
    }
    if (rng() * 100 > mv.accuracy) {
      events.push({ t: t2, kind: 'miss', id: u.id, targetId: target.id, move: mv.name })
      return
    }
    const atk = u.m.stats[mv.stat] ?? 0
    const mitigation = mv.channel === 'melee' || mv.channel === 'ranged' ? target.m.stats.CON : target.m.stats.WIS
    const crit = rng() < 0.08
    const raw = mv.power * (1 + atk / 320) * (crit ? 1.5 : 1)
    const dmg = Math.max(1, Math.round(raw * (1 - Math.min(0.55, mitigation / 1400))))
    target.hp -= dmg
    events.push({ t: t2, kind: 'hit', id: u.id, targetId: target.id, move: mv.name, channel: mv.channel, dmg, crit })
    if (target.hp <= 0) {
      target.hp = 0
      target.dead = true
      vis.set(target.id, 'dead')
      events.push({ t: t2, kind: 'death', id: target.id })
    }
  }

  function stepToward(u: FieldUnit, goal: Vec2, mates: FieldUnit[], obs: Obstacle[]) {
    let dir = norm(sub(goal, u.pos))
    // Separation: don't pile into the same square metre as an ally.
    for (const a of mates) {
      if (a.dead || a.id === u.id) continue
      const d = dist(u.pos, a.pos)
      if (d < u.radius + a.radius && d > 1e-6) {
        const push = norm(sub(u.pos, a.pos))
        dir = { x: dir.x + push.x * 0.9, y: dir.y + push.y * 0.9 }
      }
    }
    dir = norm(dir)
    const step = u.speed * DT
    const tryMove = (nx: number, ny: number) => {
      const p = { x: nx, y: ny }
      if (obs.some((o) => insideObstacle(p, o, u.radius * 0.6))) return false
      u.pos = p
      return true
    }
    const nx = Math.min(FIELD_W - 0.5, Math.max(0.5, u.pos.x + dir.x * step))
    const ny = Math.min(FIELD_H - 0.5, Math.max(0.5, u.pos.y + dir.y * step))
    // Try the full step, then slide along each axis so units round cover
    // instead of sticking to it.
    if (!tryMove(nx, ny) && !tryMove(nx, u.pos.y) && !tryMove(u.pos.x, ny)) {
      // fully blocked — nudge perpendicular so it never deadlocks
      tryMove(u.pos.x + dir.y * step, u.pos.y - dir.x * step)
    }
    u.vel = { x: dir.x * step, y: dir.y * step }
  }
}
