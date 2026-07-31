import { describe, it, expect } from 'vitest'
import { MAPS, mapById, mapProblems } from './maps'

describe('arenas', () => {
  it('every map is geometrically sound and 180°-symmetric', () => {
    for (const m of MAPS) expect(mapProblems(m), m.id).toEqual([])
  })

  it('the three arenas genuinely differ — size AND cover density', () => {
    // A test bed of three near-identical maps tests nothing. Pin that they
    // actually span a range, so a later edit cannot quietly collapse them.
    const sizes = MAPS.map((m) => m.w * m.h)
    expect(new Set(sizes).size).toBe(MAPS.length)
    const cover = MAPS.map((m) => m.obstacles.reduce((s, o) => s + o.w * o.h, 0) / (m.w * m.h))
    expect(Math.max(...cover) / Math.min(...cover)).toBeGreaterThan(2)
  })

  it('a hand-edited asymmetric map is caught', () => {
    // The guard on the guard: mirror() cannot be bypassed silently.
    const m = { ...MAPS[0], obstacles: [...MAPS[0].obstacles, { x: 2, y: 2, w: 1, h: 1 }] }
    expect(mapProblems(m).some((p) => p.includes('no 180° partner'))).toBe(true)
  })

  it('mapById resolves every published id', () => {
    for (const m of MAPS) expect(mapById(m.id)?.name).toBe(m.name)
    expect(mapById('nope')).toBeUndefined()
  })
})
