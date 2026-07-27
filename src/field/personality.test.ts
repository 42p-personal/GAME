// Personality (v0.93) — who a monster IS. The load-bearing property is that it
// costs NO generation rng, so the 12 golden battles cannot move.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { basePersonality, coachedValue, panicThreshold, personalityOf, resolvePersonality } from './personality'
import { DEFAULT_TACTICS, Monster, Personality } from '../core'
import { SPECIES } from '../species'

const mk = (seed: string, over: Partial<Monster> = {}): Monster =>
  ({ ...generateMonster(seed, { train: 900 }), tactics: { ...DEFAULT_TACTICS }, ...over }) as Monster

const AXES: (keyof Personality)[] = ['aggression', 'teamplay', 'composure', 'discipline']

describe('personality is derived, not rolled', () => {
  it('is stable for the same monster', () => {
    const sp = SPECIES[0]
    expect(basePersonality('abc', sp)).toEqual(basePersonality('abc', sp))
  })

  it('gives different individuals different characters', () => {
    const sp = SPECIES[0]
    const many = ['s1', 's2', 's3', 's4', 's5', 's6'].map((s) => basePersonality(s, sp))
    for (const axis of AXES) {
      expect(new Set(many.map((p) => p[axis])).size).toBeGreaterThan(1)
    }
  })

  it('stays in 0..100 across every species', () => {
    for (const sp of SPECIES) {
      for (const s of ['a', 'b', 'c']) {
        const p = basePersonality(sp.id + s, sp)
        for (const axis of AXES) {
          expect(p[axis]).toBeGreaterThanOrEqual(0)
          expect(p[axis]).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('species have distinguishable dispositions', () => {
    // Averaged over many individuals, a species' character should show through
    // the individual variation.
    const avg = (id: string, axis: keyof Personality) => {
      const sp = SPECIES.find((s) => s.id === id)!
      const n = 40
      let sum = 0
      for (let i = 0; i < n; i++) sum += basePersonality(id + ':' + i, sp)[axis]
      return sum / n
    }
    // Tortavos: ancient tortoise, CON major. Tazzik: Tasmanian devil, DEX major.
    expect(avg('tortavos', 'composure')).toBeGreaterThan(avg('tazzik', 'composure'))
    expect(avg('tazzik', 'aggression')).toBeGreaterThan(avg('tortavos', 'aggression'))
  })

  it('applies earned drift on top of the innate block', () => {
    const m = mk('drift')
    const before = personalityOf(m)
    const after = personalityOf({ ...m, personality: { discipline: 20 } })
    expect(after.discipline).toBe(Math.min(100, before.discipline + 20))
    expect(after.aggression).toBe(before.aggression) // untouched axes stay put
  })
})

describe('coaching is gated by discipline', () => {
  it('a fully disciplined monster obeys the order exactly', () => {
    expect(coachedValue(0.1, 0.9, 100)).toBeCloseTo(0.9)
  })

  it('an undisciplined monster ignores the order and plays to its nature', () => {
    expect(coachedValue(0.1, 0.9, 0)).toBeCloseTo(0.1)
  })

  it('partial discipline lands in between', () => {
    const half = coachedValue(0.1, 0.9, 50)
    expect(half).toBeGreaterThan(0.1)
    expect(half).toBeLessThan(0.9)
  })

  it('with no order, nature applies unchanged', () => {
    expect(coachedValue(0.42, undefined, 100)).toBe(0.42)
  })

  it('THE POINT: the same order produces different behaviour on different monsters', () => {
    // Two monsters with the same innate aggression but opposite discipline,
    // both told to hold back. The disciplined one complies; the wild one does not.
    const wild = { aggression: 90, teamplay: 50, composure: 50, discipline: 5 }
    const pro = { aggression: 90, teamplay: 50, composure: 50, discipline: 95 }
    const order = 0.15 // "cautious"
    const wildOut = coachedValue(wild.aggression / 100, order, wild.discipline)
    const proOut = coachedValue(pro.aggression / 100, order, pro.discipline)
    expect(wildOut).toBeGreaterThan(0.8) // still charging
    expect(proOut).toBeLessThan(0.25) // actually held back
  })
})

describe('composure decides when a monster breaks', () => {
  it('steadier monsters hold on longer', () => {
    const steady = panicThreshold({ aggression: 50, teamplay: 50, composure: 100, discipline: 50 })
    const flighty = panicThreshold({ aggression: 50, teamplay: 50, composure: 0, discipline: 50 })
    expect(steady).toBeLessThan(flighty)
    expect(steady).toBeGreaterThanOrEqual(0)
    expect(flighty).toBeLessThanOrEqual(0.5)
  })
})

describe('resolvePersonality feeds the field AI', () => {
  it('returns coached 0..1 values plus the raw block', () => {
    const r = resolvePersonality(mk('r1', { tactics: { ...DEFAULT_TACTICS, temperament: 'aggressive' } }))
    expect(r.aggression).toBeGreaterThanOrEqual(0)
    expect(r.aggression).toBeLessThanOrEqual(1)
    expect(r.teamplay).toBeGreaterThanOrEqual(0)
    expect(r.teamplay).toBeLessThanOrEqual(1)
    for (const axis of AXES) expect(typeof r.p[axis]).toBe('number')
  })

  it('an aggressive order raises aggression on a disciplined monster', () => {
    const m = mk('r2', { personality: { discipline: 100 } })
    const calm = resolvePersonality({ ...m, tactics: { ...DEFAULT_TACTICS, temperament: 'cautious' } })
    const angry = resolvePersonality({ ...m, tactics: { ...DEFAULT_TACTICS, temperament: 'aggressive' } })
    expect(angry.aggression).toBeGreaterThan(calm.aggression)
  })
})
