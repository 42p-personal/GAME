// Hex deployment (tamerengine M5).
import { describe, it, expect } from 'vitest'
import { hexCells, deployZone, autoDeployByRole } from './hex'
import { generateMonster } from '../monster'
import { simulateFieldBattle } from './engine'
import { DEFAULT_TACTICS, Monster } from '../core'
import { FieldEvent } from './types'

const plain = (seed: string): Monster =>
  ({ ...generateMonster(seed, { train: 600 }), tactics: { ...DEFAULT_TACTICS } }) as Monster
const snaps = (evs: FieldEvent[]) =>
  evs.filter((e) => e.kind === 'snapshot') as Extract<FieldEvent, { kind: 'snapshot' }>[]

describe('tamerengine — hex deployment', () => {
  it('cells sit inside the team deploy zone and never coincide', () => {
    for (const side of ['A', 'B'] as const) {
      const z = deployZone(side)
      const cells = hexCells(side)
      expect(cells.length).toBeGreaterThanOrEqual(6) // room for a full team
      const seen = new Set<string>()
      for (const c of cells) {
        expect(c.cx).toBeGreaterThanOrEqual(z.x0 - 0.01)
        expect(c.cx).toBeLessThanOrEqual(z.x1 + 0.01)
        const key = `${c.cx},${c.cy}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  it('cells are spaced wider than the non-overlap floor', () => {
    // Any two occupied cells must be far enough apart that placed monsters start
    // non-overlapping (the collision floor is ~1.19).
    const cells = hexCells('A')
    let worst = Infinity
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        worst = Math.min(worst, Math.hypot(cells[i].cx - cells[j].cx, cells[i].cy - cells[j].cy))
      }
    }
    expect(worst).toBeGreaterThan(1.3)
  })

  it('auto-deploy puts the sturdiest monster on a front cell', () => {
    // front score = CON+STR - INT-WIS. Side A's front is the higher-x cells.
    const team = [{ front: -300 }, { front: 500 }, { front: 100 }]
    const placed = autoDeployByRole('A', team)
    // the sturdiest (index 1) should have the greatest x (closest to enemy)
    const maxX = Math.max(...placed.map((p) => p.x))
    expect(placed[1].x).toBe(maxX)
  })

  it('a chosen placement feeds through the sim; units start on their cells', () => {
    const cells = hexCells('A')
    const teamA = [plain('a0'), plain('a1'), plain('a2')]
    const placeA = [cells[0], cells[2], cells[4]].map((c) => ({ x: c.cx, y: c.cy }))
    const r = simulateFieldBattle({ seed: 'dep', teamA, teamB: [plain('b0'), plain('b1'), plain('b2')], placeA })
    const first = snaps(r.events)[0]
    // Each A unit starts at (or, after the setup non-overlap pass, very near) its
    // chosen cell — and no two share a spot.
    for (let i = 0; i < 3; i++) {
      const u = first.units.find((x) => x.id === 'A' + i)!
      expect(Math.hypot(u.x - placeA[i].x, u.y - placeA[i].y)).toBeLessThan(0.5)
    }
    const aPos = first.units.filter((u) => u.id[0] === 'A')
    for (let i = 0; i < aPos.length; i++) {
      for (let j = i + 1; j < aPos.length; j++) {
        expect(Math.hypot(aPos[i].x - aPos[j].x, aPos[i].y - aPos[j].y)).toBeGreaterThan(1.1)
      }
    }
  })
})
