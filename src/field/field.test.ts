// Field engine (v0.93). The turn-based engine keeps its 12 goldens; this one
// gets behavioural tests, because a spatial autobattler's correctness is about
// what units DO, not about one pinned outcome.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { DEFAULT_OBSTACLES, hasLineOfSight, simulateFieldBattle } from './engine'
import { traitsFor, pickTarget, valueOf, desiredGoal, dist } from './decide'
import { FIELD_H, FIELD_W, FieldUnit } from './types'
import type { Monster } from '../core'
import { DEFAULT_TACTICS } from '../core'

const mk = (seed: string, tweaks: Partial<Monster> = {}): Monster => {
  const m = generateMonster(seed, { train: 900 })
  return { ...m, tactics: { ...DEFAULT_TACTICS }, ...tweaks } as Monster
}
const teamOf = (n: number, prefix: string, tweaks: Partial<Monster> = {}) =>
  Array.from({ length: n }, (_, i) => mk(prefix + i, tweaks))

describe('field engine — determinism', () => {
  it('is a pure function of (monsters, seed)', () => {
    const A = teamOf(3, 'a'), B = teamOf(3, 'b')
    const r1 = simulateFieldBattle({ seed: 'fixed', teamA: A, teamB: B })
    const r2 = simulateFieldBattle({ seed: 'fixed', teamA: A, teamB: B })
    expect(r1.winner).toBe(r2.winner)
    expect(r1.duration).toBe(r2.duration)
    expect(r1.events.length).toBe(r2.events.length)
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events))
  })

  it('a different seed can produce a different fight', () => {
    const A = teamOf(3, 'a'), B = teamOf(3, 'b')
    const seeds = ['s1', 's2', 's3', 's4', 's5'].map((s) =>
      JSON.stringify(simulateFieldBattle({ seed: s, teamA: A, teamB: B }).events.length))
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  it('always terminates and declares a result', () => {
    for (const s of ['t1', 't2', 't3']) {
      const r = simulateFieldBattle({ seed: s, teamA: teamOf(4, 'x' + s), teamB: teamOf(4, 'y' + s) })
      expect(['A', 'B', 'draw']).toContain(r.winner)
      expect(r.events[r.events.length - 1].kind).toBe('end')
      expect(r.duration).toBeGreaterThan(0)
    }
  })
})

describe('field engine — units move and fight', () => {
  const r = simulateFieldBattle({ seed: 'move', teamA: teamOf(3, 'ma'), teamB: teamOf(3, 'mb') })
  const snaps = r.events.filter((e) => e.kind === 'snapshot') as Extract<typeof r.events[number], { kind: 'snapshot' }>[]

  it('emits a positional snapshot every tick', () => {
    expect(snaps.length).toBeGreaterThan(20)
    expect(snaps[0].units).toHaveLength(6)
  })

  it('monsters actually traverse the field', () => {
    const first = snaps[0].units
    const mid = snaps[Math.floor(snaps.length / 2)].units
    const moved = first.filter((u, i) => Math.hypot(u.x - mid[i].x, u.y - mid[i].y) > 2)
    expect(moved.length).toBeGreaterThan(0)
  })

  it('keeps every unit inside the arena at all times', () => {
    for (const s of snaps) {
      for (const u of s.units) {
        expect(u.x).toBeGreaterThanOrEqual(0)
        expect(u.x).toBeLessThanOrEqual(FIELD_W)
        expect(u.y).toBeGreaterThanOrEqual(0)
        expect(u.y).toBeLessThanOrEqual(FIELD_H)
      }
    }
  })

  it('lands hits and kills', () => {
    expect(r.events.some((e) => e.kind === 'hit')).toBe(true)
    expect(r.events.some((e) => e.kind === 'death')).toBe(true)
  })

  it('never damages a dead unit', () => {
    const dead = new Set<string>()
    for (const e of r.events) {
      if (e.kind === 'death') dead.add(e.id)
      if (e.kind === 'hit') expect(dead.has(e.targetId)).toBe(false)
    }
  })
})

describe('obstacles', () => {
  it('block line of sight', () => {
    const o = DEFAULT_OBSTACLES[0]
    const left = { x: o.x - 4, y: o.y + o.h / 2 }
    const right = { x: o.x + o.w + 4, y: o.y + o.h / 2 }
    expect(hasLineOfSight(left, right, DEFAULT_OBSTACLES)).toBe(false)
    // ...but not where there is a clear lane
    expect(hasLineOfSight({ x: 2, y: 1 }, { x: FIELD_W - 2, y: 1 }, DEFAULT_OBSTACLES)).toBe(true)
  })

  it('are never walked through', () => {
    const r2 = simulateFieldBattle({ seed: 'obs', teamA: teamOf(3, 'oa'), teamB: teamOf(3, 'ob') })
    const snaps2 = r2.events.filter((e) => e.kind === 'snapshot') as Extract<typeof r2.events[number], { kind: 'snapshot' }>[]
    for (const s of snaps2) {
      for (const u of s.units) {
        for (const o of DEFAULT_OBSTACLES) {
          const inside = u.x > o.x && u.x < o.x + o.w && u.y > o.y && u.y < o.y + o.h
          expect(inside).toBe(false)
        }
      }
    }
  })
})

describe('the two new stats', () => {
  it('temperament drives predation and cohesion in opposite directions', () => {
    const agg = traitsFor(mk('t1', { tactics: { ...DEFAULT_TACTICS, temperament: 'aggressive' } }))
    const cau = traitsFor(mk('t1', { tactics: { ...DEFAULT_TACTICS, temperament: 'cautious' } }))
    expect(agg.predation).toBeGreaterThan(cau.predation)
    expect(cau.cohesion).toBeGreaterThan(agg.cohesion)
  })

  it('hunting casters raises predation; protecting raises cohesion', () => {
    const base = traitsFor(mk('t2'))
    const hunter = traitsFor(mk('t2', { tactics: { ...DEFAULT_TACTICS, targetPriority: 'casters' } }))
    const guard = traitsFor(mk('t2', { protect: true } as Partial<Monster>))
    expect(hunter.predation).toBeGreaterThan(base.predation)
    expect(guard.cohesion).toBeGreaterThan(base.cohesion)
  })

  it('stays within 0..1 for every tactic combination', () => {
    for (const temperament of ['aggressive', 'balanced', 'cautious'] as const) {
      for (const targetPriority of ['weakest', 'casters', 'tanks', 'focus'] as const) {
        for (const preserve of ['off', 'cautious', 'defensive'] as const) {
          const t = traitsFor(mk('t3', { protect: true, tactics: { ...DEFAULT_TACTICS, temperament, targetPriority, preserve } }))
          expect(t.cohesion).toBeGreaterThanOrEqual(0)
          expect(t.cohesion).toBeLessThanOrEqual(1)
          expect(t.predation).toBeGreaterThanOrEqual(0)
          expect(t.predation).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('target selection', () => {
  // Two enemies: one near and tanky, one far and squishy-but-dangerous.
  const unit = (id: string, over: Partial<FieldUnit>): FieldUnit => ({
    id, side: 'B', slot: 0, m: mk(id), pos: { x: 20, y: 11 }, vel: { x: 0, y: 0 },
    radius: 0.9, speed: 3, hp: 500, maxHp: 500, mp: 50, maxMp: 50,
    traits: { cohesion: 0.5, predation: 0.5 }, targetId: null, retargetIn: 0,
    cooldowns: {}, castingFor: 0, castMoveId: null, statuses: [], dead: false, ...over,
  })

  it('a PREDATOR crosses the field for the valuable kill; an ANCHOR takes what is near', () => {
    const near = unit('near', { pos: { x: 12, y: 11 }, hp: 900, maxHp: 900 })
    const far = unit('far', { pos: { x: 36, y: 11 }, hp: 220, maxHp: 400 })
    const self = (predation: number) => unit('me', { side: 'A', pos: { x: 8, y: 11 }, traits: { cohesion: 0.3, predation } })

    const anchorPick = pickTarget(self(0.05), [near, far], [])
    const predatorPick = pickTarget(self(0.98), [near, far], [])
    expect(anchorPick?.id).toBe('near')
    expect(predatorPick?.id).toBe('far')
  })

  it('a COHESIVE unit joins the target its allies are already on', () => {
    const e1 = unit('e1', { pos: { x: 22, y: 11 } })
    const e2 = unit('e2', { pos: { x: 22, y: 12 } })
    const mate = unit('mate', { side: 'A', pos: { x: 10, y: 11 }, targetId: 'e2' })
    const loner = unit('me', { side: 'A', pos: { x: 10, y: 10 }, traits: { cohesion: 0, predation: 0.5 } })
    const teamPlayer = unit('me', { side: 'A', pos: { x: 10, y: 10 }, traits: { cohesion: 1, predation: 0.5 } })
    // The cohesive one piles onto e2 with its ally; the loner picks for itself.
    expect(pickTarget(teamPlayer, [e1, e2], [mate, teamPlayer])?.id).toBe('e2')
    expect(pickTarget(loner, [e1, e2], [mate, loner])?.id).toBe('e1')
  })

  it('values a squishy damage dealer above a tanky one', () => {
    const squishy = unit('sq', { maxHp: 320 })
    const beefy = unit('bf', { maxHp: 900 })
    expect(valueOf(squishy)).toBeGreaterThan(valueOf(beefy))
  })
})

describe('positioning', () => {
  const base = (over: Partial<FieldUnit>): FieldUnit => ({
    id: 'u', side: 'A', slot: 0, m: mk('p'), pos: { x: 6, y: 11 }, vel: { x: 0, y: 0 },
    radius: 0.9, speed: 3, hp: 500, maxHp: 500, mp: 50, maxMp: 50,
    traits: { cohesion: 0.5, predation: 0.5 }, targetId: null, retargetIn: 0,
    cooldowns: {}, castingFor: 0, castMoveId: null, statuses: [], dead: false, ...over,
  })

  it('closes the distance toward a distant target', () => {
    const me = base({})
    const foe = base({ id: 'f', side: 'B', pos: { x: 34, y: 11 } })
    const goal = desiredGoal(me, foe, [], [foe])
    expect(goal.x).toBeGreaterThan(me.pos.x)
  })

  it('a wounded monster on PRESERVE disengages instead of advancing', () => {
    const me = base({ hp: 60, m: mk('p', { tactics: { ...DEFAULT_TACTICS, preserve: 'defensive' } }) })
    const foe = base({ id: 'f', side: 'B', pos: { x: 20, y: 11 } })
    const goal = desiredGoal(me, foe, [], [foe])
    expect(goal.x).toBeLessThan(me.pos.x) // moving away from the enemy, toward its own edge
  })

  it('COHESION pulls a unit back toward its allies', () => {
    const foe = base({ id: 'f', side: 'B', pos: { x: 36, y: 11 } })
    const mates = [base({ id: 'm1', pos: { x: 4, y: 4 } }), base({ id: 'm2', pos: { x: 4, y: 5 } })]
    const loner = desiredGoal(base({ traits: { cohesion: 0, predation: 0.5 } }), foe, mates, [foe])
    const sticky = desiredGoal(base({ traits: { cohesion: 1, predation: 0.5 } }), foe, mates, [foe])
    // the cohesive one ends up nearer its team
    expect(dist(sticky, { x: 4, y: 4.5 })).toBeLessThan(dist(loner, { x: 4, y: 4.5 }))
  })
})
