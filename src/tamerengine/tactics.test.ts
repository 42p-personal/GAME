// Spatial orders (v0.93) — coaching that only means anything on real ground.
// Each is gated by temperament, like every other order.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { ALL_MOVES } from '../moves'
import { commitLimit, desiredGoal, engageMult, spacingRadius } from './decide'
import { simulateFieldBattle, hasLineOfSight, DEFAULT_OBSTACLES } from './engine'
import { DEFAULT_TACTICS, Monster, Tactics } from '../core'
import { FIELD_W, FieldUnit } from './types'

// A perfectly biddable monster, so an order lands in full and the test is
// measuring the ORDER rather than the temperament gate.
const obedient = (over: Partial<Tactics> = {}): Partial<Monster> => ({
  personality: { temperament: 100 },
  tactics: { ...DEFAULT_TACTICS, ...over },
})
const mk = (seed: string, over: Partial<Monster> = {}): Monster =>
  ({ ...generateMonster(seed, { train: 900 }), tactics: { ...DEFAULT_TACTICS }, ...over }) as Monster

const unit = (id: string, over: Partial<FieldUnit>): FieldUnit => ({
  id, side: 'A', slot: 0, m: mk(id), pos: { x: 8, y: 11 }, vel: { x: 0, y: 0 },
  radius: 0.9, speed: 3, hp: 500, maxHp: 500, mp: 60, maxMp: 60,
  traits: { cohesion: .5, predation: .5 }, targetId: null, retargetIn: 0,
  cooldowns: {}, castingFor: 0, castMoveId: null, castTargetId: null, statuses: [], mods: [], forcedTargetId: null, forcedUntil: 0,
  rootedFor: 0, fadedUntil: 0, slowMult: 1, slowFor: 0, disengageFor: 0, kiteFor: 99, blockingUntil: 0, ward: 0, ccResist: 0, lastCcAt: -999, ccImmuneUntil: 0, hasAttacked: false, chaseFor: 0, chaseBest: Infinity, gaveUp: {}, dead: false, ...over,
})

describe('engage range', () => {
  it('skirmish holds further out than brawl', () => {
    const skirmish = unit('s', { m: mk('s', obedient({ engageRange: 'skirmish' })) })
    const brawl = unit('b', { m: mk('s', obedient({ engageRange: 'brawl' })) })
    expect(engageMult(skirmish)).toBeGreaterThan(1)
    expect(engageMult(brawl)).toBeLessThan(1)
  })

  it('is ignored by a wilful monster', () => {
    const wilful = unit('w', {
      m: mk('w', { personality: { temperament: -100 }, tactics: { ...DEFAULT_TACTICS, engageRange: 'brawl' } }),
    })
    expect(engageMult(wilful)).toBeCloseTo(1, 1) // plays to its own nature
  })

  it('no order means no change', () => {
    expect(engageMult(unit('n', {}))).toBe(1)
  })
})

describe('spacing', () => {
  it('spread fans out; tight clumps up', () => {
    const spread = unit('sp', { m: mk('sp', obedient({ spacing: 'spread' })) })
    const tight = unit('ti', { m: mk('sp', obedient({ spacing: 'tight' })) })
    expect(spacingRadius(spread)).toBeGreaterThan(spacingRadius(tight))
    expect(spacingRadius(tight)).toBeLessThan(unit('d', {}).radius * 2 + 0.01)
  })
})

describe('commit', () => {
  it("a 'hold' order caps how far into enemy ground a unit will go", () => {
    const holder = unit('h', { m: mk('h', obedient({ commit: 'hold' })) })
    expect(commitLimit(holder)).toBeLessThan(FIELD_W * 0.7)
  })

  it('mirrors correctly for side B', () => {
    const b = unit('hb', { side: 'B', m: mk('h', obedient({ commit: 'hold' })) })
    expect(commitLimit(b)).toBeGreaterThan(FIELD_W * 0.3)
  })

  it('⚠️ the no-order sentinel is SIDE-AWARE — a shared one pinned side B to the wall', () => {
    expect(commitLimit(unit('a', { side: 'A' }))).toBe(FIELD_W)
    expect(commitLimit(unit('b', { side: 'B' }))).toBe(0)
  })

  it("actually stops a held unit chasing across the field", () => {
    const me = unit('me', { m: mk('me', obedient({ commit: 'hold' })), pos: { x: 18, y: 11 } })
    const far = unit('far', { side: 'B', pos: { x: 38, y: 11 } })
    const goal = desiredGoal(me, far, [], [far])
    expect(goal.x).toBeLessThan(FIELD_W * 0.62)
  })
})

describe('use cover', () => {
  it('a RANGED unit runs LoS — tucks where a closing melee cannot see it', () => {
    const los = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      hasLineOfSight(a, b, DEFAULT_OBSTACLES)
    const o = DEFAULT_OBSTACLES[0] // spans x 18.8-21.2, y 3.5-8.0
    const start = { x: o.x - 1.8, y: 10 }
    // Cover is a RANGED behaviour, and it breaks line from the closing MELEE
    // threat specifically (melee wants contact and never hides).
    const foe = unit('f', {
      side: 'B', pos: { x: o.x + 4, y: 10 },
      // ⚠️ The FOE is pinned melee too. Cover is triggered by a closing MELEE threat
      // specifically, so if the pool happens to hand this Tank a ranged move the
      // branch under test never runs at all.
      m: { ...generateMonster('cover-foe', { speciesId: 'aegisox', train: 700 }),
        loadout: [ALL_MOVES.find((x) => x.name === 'Power Strike')!],
        tactics: { ...DEFAULT_TACTICS } } as Monster,
    })
    expect(los(start, foe.pos)).toBe(true) // precondition: currently exposed
    const seeker = unit('m2', {
      pos: { ...start },
      // ⚠️ Loadout PINNED to a ranged move. Reach derives from the drafted damage
      // moves, so a pool change can silently turn this fixture melee — and melee
      // never hides, which short-circuits the very branch under test. Same fix as
      // targeting.test.ts. Rain of Arrows is ranged, so reach is deterministic.
      m: { ...generateMonster('cover-rg', { speciesId: 'grivvel', train: 850 }),
        loadout: [ALL_MOVES.find((x) => x.name === 'Rain of Arrows')!],
        personality: { temperament: 100 }, tactics: { ...DEFAULT_TACTICS, useCover: true } } as Monster,
    })
    // ⚠️ THE TARGET AND THE THREAT MUST BE DIFFERENT MONSTERS. This test used to
    // pass `foe` as both, then assert the seeker ended up where `foe` could not
    // see it — which, with one enemy, is the same as asserting it hides where it
    // cannot shoot. That is not cover, it is just hiding, and it was the actual
    // engine defect: cover was picked on DISTANCE to the target alone, so a unit
    // would relocate behind a rock that blocked its own line and then stand
    // there doing nothing (casters held a shot only 47% of ticks).
    // Cover means: break the DIVER's line while keeping your own on your TARGET.
    const mark = unit('mark', {
      side: 'B', pos: { x: start.x - 7, y: start.y },
      m: { ...generateMonster('cover-mark', { speciesId: 'aegisox', train: 700 }),
        loadout: [ALL_MOVES.find((x) => x.name === 'Power Strike')!],
        tactics: { ...DEFAULT_TACTICS } } as Monster,
    })
    const gSeek = desiredGoal(seeker, mark, [], [foe, mark], los)
    // THE INVARIANT: whatever stance it picks, it can still shoot what it is
    // aiming at. A position that blocks its own shot is never an improvement.
    expect(los(gSeek, mark.pos)).toBe(true)
  })

  it('is ignored by a wilful monster', () => {
    const los = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      hasLineOfSight(a, b, DEFAULT_OBSTACLES)
    const o = DEFAULT_OBSTACLES[0]
    const foe = unit('f', { side: 'B', pos: { x: o.x + 5, y: 10 } })
    const start = { x: o.x - 1.8, y: 10 }
    // ⚠️ SAME seed for both, or they get different loadouts and therefore a
    // different reach — which changes the stand-off and has nothing to do with
    // cover. Only the tactics may differ.
    const wilful = unit('w', {
      pos: { ...start },
      m: mk('w', { personality: { temperament: -100 }, tactics: { ...DEFAULT_TACTICS, useCover: true } }),
    })
    const plain = unit('w', { pos: { ...start }, m: mk('w', { personality: { temperament: -100 } }) })
    expect(desiredGoal(wilful, foe, [], [foe], los)).toEqual(desiredGoal(plain, foe, [], [foe], los))
  })
})

describe('orders do not break the simulation', () => {
  it('a fully-ordered team still fights deterministically and terminates', () => {
    const team = (p: string, t: Partial<Tactics>) =>
      [0, 1, 2].map((i) => mk(p + i, obedient(t)))
    const setup = () => ({
      seed: 'orders',
      teamA: team('oa', { engageRange: 'skirmish', spacing: 'spread', useCover: true, commit: 'hold' }),
      teamB: team('ob', { engageRange: 'brawl', spacing: 'tight', commit: 'dive' }),
    })
    const r1 = simulateFieldBattle(setup())
    const r2 = simulateFieldBattle(setup())
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events))
    expect(['A', 'B', 'draw']).toContain(r1.winner)
    expect(r1.events.some((e) => e.kind === 'hit')).toBe(true)
  })
})
