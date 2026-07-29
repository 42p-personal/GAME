// THE FREE ATTACK must stay a filler — it may never out-damage a real ability.
// This is an invariant, not a preference: when the basic out-DPSed every
// monster's best ability (1.2–2.3× at train 850), abilities were strictly worse
// than swinging and the ~1s swing dominated the whole action economy.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { basicAttackFor } from './engine'
import { CHANNEL_CAST_TIME, CHANNEL_RANGE, BASIC_STAT_TIER } from './types'
import { Monster, Move } from '../core'

const effCd = (mv: Move) => mv.cooldown * 0.9 + (mv.castTime ?? CHANNEL_CAST_TIME[mv.channel])
const dpsOf = (mv: Move) => mv.power / effCd(mv)

const SPECIES = ['kongrath', 'aegisox', 'grivvel', 'maneleo', 'ursath']

describe('tamerengine — the free attack is a filler', () => {
  it('never out-DPSes the monster\'s best damaging ability', () => {
    for (const sp of SPECIES) {
      // ⚠️ WIDE sample: an earlier 2-seed version passed while a real monster
      // (ursath at train 850) still had a basic at 104% of its best ability.
      for (const train of [200, 400, 650, 850, 1000]) {
       for (const tag of ['', 'x', 'y', '850']) {
        const m = generateMonster(`${tag}${sp}${train}`, { speciesId: sp, train }) as Monster
        const abilities = m.loadout.filter((mv) => mv.type === 'damage')
        if (!abilities.length) continue // empty loadout — nothing to compare against
        const best = Math.max(...abilities.map(dpsOf))
        const basic = dpsOf(basicAttackFor(m))
        expect(basic).toBeLessThan(best)
       }
      }
    }
  })

  it('is tiered by stat — a STR swing beats a WIS jab', () => {
    expect(BASIC_STAT_TIER.STR).toBeGreaterThan(BASIC_STAT_TIER.DEX)
    expect(BASIC_STAT_TIER.DEX).toBeGreaterThan(BASIC_STAT_TIER.INT)
    expect(BASIC_STAT_TIER.INT).toBeGreaterThan(BASIC_STAT_TIER.CON)
    expect(BASIC_STAT_TIER.CON).toBeGreaterThan(BASIC_STAT_TIER.CHA)
    expect(BASIC_STAT_TIER.CHA).toBeGreaterThan(BASIC_STAT_TIER.WIS)
  })

  it('still reaches from where the unit stands (channel keyed to reach)', () => {
    // ⚠️ The basic's range must cover the standoff the unit positions itself at,
    // or it is unusable — the bug that left ranged monsters holding a 1.28-range
    // swing while standing at 6.8, with nothing to do between cooldowns.
    for (const sp of SPECIES) {
      const m = generateMonster(`br-${sp}`, { speciesId: sp, train: 850 }) as Monster
      const dmg = m.loadout.filter((mv) => mv.type === 'damage')
      if (!dmg.length) continue
      const reach = Math.max(...dmg.map((mv) => mv.range ?? CHANNEL_RANGE[mv.channel]))
      const ba = basicAttackFor(m)
      expect(ba.range ?? 0).toBeGreaterThanOrEqual(reach * 0.75 - 0.01) // standoff is reach × 0.75
    }
  })
})
