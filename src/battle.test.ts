// Golden battle regressions + determinism. The goldens pin the engine's exact
// behavior for four seeded matchups (captured 2026-07-25, after the guard-
// persistence / element-aware-AI / firstStrike-valuation / heal-sorting fixes
// and the maxMana WIS+INT/2 blend). ANY intentional engine change will move
// these — recapture with a fresh run and update the table deliberately; an
// UNINTENTIONAL diff here is a regression.
import { describe, expect, it } from 'vitest'
import { simulateTeamBattle } from './battle'
import { generateMonster } from './monster'

const team = (seeds: string[], train: number) => seeds.map((s) => generateMonster(s, { train }))

const GOLDENS = [
  {
    name: '1v1-low', a: ['gold-a1'], b: ['gold-b1'], train: 150,
    winner: 'A', events: 239, logLines: 172,
    finals: [
      { side: 'A', slot: 0, hp: 233, mana: 5, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 9, wasKOd: true },
    ],
  },
  {
    name: '1v1-high', a: ['gold-a2'], b: ['gold-b2'], train: 1800,
    winner: 'B', events: 220, logLines: 162,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 338, wasKOd: true },
      { side: 'B', slot: 0, hp: 353, mana: 676, wasKOd: false },
    ],
  },
  {
    name: '2v2-mid', a: ['gold-a3', 'gold-a4'], b: ['gold-b3', 'gold-b4'], train: 700,
    winner: 'A', events: 138, logLines: 105,
    finals: [
      { side: 'A', slot: 0, hp: 246, mana: 136, wasKOd: false },
      { side: 'A', slot: 1, hp: 190, mana: 180, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 99, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 141, wasKOd: true },
    ],
  },
  {
    // full-wipe draw — exercises the round-35 sudden-death chip path
    name: '3v3-high', a: ['gold-a5', 'gold-a6', 'gold-a7'], b: ['gold-b5', 'gold-b6', 'gold-b7'], train: 2000,
    winner: 'draw', events: 558, logLines: 413,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 709, wasKOd: true },
      { side: 'A', slot: 1, hp: 0, mana: 0, wasKOd: true },
      { side: 'A', slot: 2, hp: 0, mana: 737, wasKOd: true },
      { side: 'B', slot: 0, hp: 0, mana: 725, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 756, wasKOd: true },
      { side: 'B', slot: 2, hp: 0, mana: 1, wasKOd: true },
    ],
  },
] as const

describe('golden battles', () => {
  for (const g of GOLDENS) {
    it(g.name, () => {
      const r = simulateTeamBattle(team([...g.a], g.train), team([...g.b], g.train))
      expect(r.winner).toBe(g.winner)
      expect(r.events.length).toBe(g.events)
      expect(r.log.length).toBe(g.logLines)
      expect(r.finals).toEqual(g.finals)
    })
  }
})

describe('determinism', () => {
  it('identical inputs produce byte-identical battles', () => {
    const run = () => simulateTeamBattle(team(['det-a1', 'det-a2'], 900), team(['det-b1', 'det-b2'], 900))
    const r1 = run()
    const r2 = run()
    expect(r2.winner).toBe(r1.winner)
    expect(r2.log).toEqual(r1.log)
    expect(r2.events).toEqual(r1.events)
    expect(r2.finals).toEqual(r1.finals)
  })

  it('every battle ends with a winner and full finals coverage', () => {
    for (let i = 0; i < 10; i++) {
      const r = simulateTeamBattle(team([`end-a${i}`], 100 + i * 200), team([`end-b${i}`], 100 + i * 200))
      expect(['A', 'B', 'draw']).toContain(r.winner)
      expect(r.finals.length).toBe(2)
      expect(r.events[r.events.length - 1]?.kind).toBe('end')
    }
  })
})
