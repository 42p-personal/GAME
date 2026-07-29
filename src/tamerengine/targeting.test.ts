// Targeting split (Step 1): melee targets the NEAREST enemy (so a front-liner
// screens the back row); ranged/magic keep free value-and-priority choice.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { isMelee, pickTarget, traitsFor } from './decide'
import { FieldUnit, FieldSide, Vec2 } from './types'
import { Monster } from '../core'

// A minimal FieldUnit wrapper — only the fields pickTarget/isMelee read need to
// be real; the rest are inert defaults.
function unit(m: Monster, side: FieldSide, pos: Vec2, hp = 500, maxHp = 500): FieldUnit {
  return {
    id: `${side}${pos.x}_${pos.y}`, side, slot: 0, m, pos, vel: { x: 0, y: 0 },
    radius: 0.9, speed: 4, hp, maxHp, mp: 100, maxMp: 100, traits: traitsFor(m),
    targetId: null, retargetIn: 0, cooldowns: {}, castingFor: 0, castMoveId: null,
    castTargetId: null, statuses: [], mods: [], forcedTargetId: null, forcedUntil: 0,
    rootedFor: 0, fadedUntil: 0, slowMult: 1, slowFor: 0, disengageFor: 0, dead: false,
  }
}
const melee = (seed: string) => generateMonster(seed, { speciesId: 'aegisox', train: 700 }) as Monster // Tank, reach 1.6
const ranged = (seed: string) => generateMonster(seed, { speciesId: 'grivvel', train: 850 }) as Monster // Rogue, reach 8

describe('tamerengine — targeting split', () => {
  it('classifies reach correctly (melee vs ranged)', () => {
    expect(isMelee(unit(melee('m'), 'A', { x: 5, y: 11 }))).toBe(true)
    expect(isMelee(unit(ranged('r'), 'A', { x: 5, y: 11 }))).toBe(false)
  })

  it('a melee unit attacks the NEAREST enemy, not the juicy one behind it', () => {
    // Enemy front-liner (tank, low value) is close; a squishy ranged unit (high
    // value) sits further back. A melee attacker must engage the near tank.
    const self = unit(melee('self'), 'A', { x: 10, y: 11 })
    const nearTank = unit(melee('etank'), 'B', { x: 13, y: 11 })   // 3 units away
    const backRanged = unit(ranged('emage'), 'B', { x: 22, y: 11 }) // 12 units away, high value
    const pick = pickTarget(self, [nearTank, backRanged], [])
    expect(pick?.id).toBe(nearTank.id)
  })

  it('a ranged unit is free to reach past the front line to a high-value target', () => {
    // Same board, but the attacker is ranged: it may choose the valuable back
    // unit over the nearer tank — that reach is its whole advantage.
    const self = unit(ranged('self'), 'A', { x: 10, y: 11 })
    const nearTank = unit(melee('etank'), 'B', { x: 13, y: 11 })
    const backRanged = unit(ranged('emage'), 'B', { x: 20, y: 11 }, 120, 300) // wounded + squishy
    const pick = pickTarget(self, [nearTank, backRanged], [])
    // Not forced to the nearest: it reaches the wounded high-value target.
    expect(pick?.id).toBe(backRanged.id)
  })
})
