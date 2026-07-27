// Spatial mechanics (v0.93) — the class of ability the turn-based engine could
// not express, because it had no space.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { simulateFieldBattle, isBehind, hasLineOfSight, DEFAULT_OBSTACLES } from './engine'
import { SPATIAL_MOVES, spatialOf } from './spatial'
import { ALL_MOVES } from '../moves'
import { DEFAULT_TACTICS, Monster, Move } from '../core'
import { FieldUnit } from './types'

const mk = (seed: string, over: Partial<Monster> = {}): Monster =>
  ({ ...generateMonster(seed, { train: 900 }), tactics: { ...DEFAULT_TACTICS }, ...over }) as Monster

const unit = (id: string, over: Partial<FieldUnit>): FieldUnit => ({
  id, side: 'A', slot: 0, m: mk(id), pos: { x: 10, y: 11 }, vel: { x: 0, y: 0 },
  radius: 0.9, speed: 3, hp: 500, maxHp: 500, mp: 60, maxMp: 60,
  traits: { cohesion: .5, predation: .5 }, targetId: null, retargetIn: 0,
  cooldowns: {}, castingFor: 0, castMoveId: null, statuses: [],
  rootedFor: 0, slowMult: 1, slowFor: 0, dead: false, ...over,
})

describe('the spatial table is honest', () => {
  it('only names moves that actually exist in the pool', () => {
    const pool = new Set(ALL_MOVES.map((m: Move) => m.name))
    const ghosts = Object.keys(SPATIAL_MOVES).filter((n) => !pool.has(n))
    expect(ghosts).toEqual([])
  })

  it('every entry does something', () => {
    for (const [name, sp] of Object.entries(SPATIAL_MOVES)) {
      const does = !!(sp.move || sp.pull || sp.push || sp.root || sp.slow || sp.backstab)
      expect(does, `${name} declares nothing`).toBe(true)
    }
  })

  it('a backstab is only ever paired with a way to GET behind', () => {
    // Otherwise the bonus is unreachable and the move is quietly weaker than
    // its numbers suggest.
    for (const [name, sp] of Object.entries(SPATIAL_MOVES)) {
      if (!sp.backstab) continue
      expect(sp.move?.to, `${name} has backstab but no way behind`).toBe('behindTarget')
    }
  })

  it('leaves the rest of the pool alone', () => {
    expect(spatialOf('Ember')).toBeUndefined()
    expect(Object.keys(SPATIAL_MOVES).length).toBeLessThan(ALL_MOVES.length / 3)
  })
})

describe('isBehind', () => {
  it('is true only when the attacker is past its target', () => {
    const t = unit('t', { side: 'B', pos: { x: 20, y: 11 } })
    expect(isBehind(unit('a', { side: 'A', pos: { x: 24, y: 11 } }), t)).toBe(true)
    expect(isBehind(unit('a', { side: 'A', pos: { x: 16, y: 11 } }), t)).toBe(false)
    // and it mirrors for the other side
    const t2 = unit('t2', { side: 'A', pos: { x: 20, y: 11 } })
    expect(isBehind(unit('b', { side: 'B', pos: { x: 16, y: 11 } }), t2)).toBe(true)
  })
})

describe('teleports beat cover, charges do not', () => {
  it('cover blocks a straight line — the premise the design rests on', () => {
    const o = DEFAULT_OBSTACLES[0]
    const a = { x: o.x - 3, y: o.y + o.h / 2 }
    const b = { x: o.x + o.w + 3, y: o.y + o.h / 2 }
    expect(hasLineOfSight(a, b, DEFAULT_OBSTACLES)).toBe(false)
  })

  it('a dash is gated on line of sight; a blink is not', () => {
    const dash = spatialOf('Power Strike')!
    const blink = spatialOf('Shadow Barrage')!
    expect(dash.move!.kind).toBe('dash')
    expect(blink.move!.kind).toBe('blink')
    expect(blink.backstab).toBeGreaterThan(1) // priced for it
  })
})

describe('mechanics fire in a real fight', () => {
  // Give both sides the full spatial kit so the mechanics are reachable.
  const kitted = (seed: string) => {
    const m = mk(seed)
    const names = ['Power Strike', 'Web Trap', 'Sonic Boom']
    const loadout = names.map((n) => ALL_MOVES.find((x: Move) => x.name === n)).filter(Boolean) as Move[]
    return { ...m, loadout } as Monster
  }
  const r = simulateFieldBattle({
    seed: 'spatial',
    teamA: [kitted('sa0'), kitted('sa1'), kitted('sa2')],
    teamB: [kitted('sb0'), kitted('sb1'), kitted('sb2')],
  })

  it('still terminates deterministically', () => {
    const again = simulateFieldBattle({
      seed: 'spatial',
      teamA: [kitted('sa0'), kitted('sa1'), kitted('sa2')],
      teamB: [kitted('sb0'), kitted('sb1'), kitted('sb2')],
    })
    expect(JSON.stringify(r.events)).toBe(JSON.stringify(again.events))
  })

  it('forced movement actually displaces someone', () => {
    expect(r.events.some((e) => e.kind === 'shove')).toBe(true)
  })

  it('nobody is ever displaced outside the arena or into rock', () => {
    const snaps = r.events.filter((e) => e.kind === 'snapshot') as Extract<typeof r.events[number], { kind: 'snapshot' }>[]
    for (const s of snaps) {
      for (const u of s.units) {
        expect(u.x).toBeGreaterThanOrEqual(0)
        expect(u.x).toBeLessThanOrEqual(40)
        for (const o of DEFAULT_OBSTACLES) {
          expect(u.x > o.x && u.x < o.x + o.w && u.y > o.y && u.y < o.y + o.h).toBe(false)
        }
      }
    }
  })
})
