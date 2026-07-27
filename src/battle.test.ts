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
    winner: 'A', events: 221, logLines: 160, // recaptured v0.852: gold-a1 Titanrex / gold-b1 Pyraxon (prestige base-stat bump)
    finals: [
      { side: 'A', slot: 0, hp: 188, mana: 0, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 5, wasKOd: true },
    ],
  },
  {
    name: '1v1-high', a: ['gold-a2'], b: ['gold-b2'], train: 1800,
    winner: 'B', events: 74, logLines: 57,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 437, wasKOd: true },
      { side: 'B', slot: 0, hp: 511, mana: 673, wasKOd: false },
    ],
  },
  {
    name: '2v2-mid', a: ['gold-a3', 'gold-a4'], b: ['gold-b3', 'gold-b4'], train: 700,
    winner: 'A', events: 126, logLines: 93, // recaptured v0.852: gold-a3 Wisdomkeeper / gold-b3 Stormlerath (prestige base-stat bump)
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 489, wasKOd: true },
      { side: 'A', slot: 1, hp: 121, mana: 98, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 201, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 183, wasKOd: true },
    ],
  },
  {
    // exercises the round-35 sudden-death path — now DECISIVE (was a full-wipe
    // draw). Recaptured 2026-07-22 after the %-of-max-HP sudden-death rework
    // (flat chip → % chip), CON coefficient trims, and WIS spell-power — the
    // clock now resolves a winner instead of wiping both.
    name: '3v3-high', a: ['gold-a5', 'gold-a6', 'gold-a7'], b: ['gold-b5', 'gold-b6', 'gold-b7'], train: 2000,
    // recaptured v0.91 (SECOND move this cycle) — AoE falloff. gold-b5's Inferno
    // hits 3 targets and now lands at 90% power, so the fight runs materially
    // longer (376 → 419 events) and the round-35 sudden-death chip has time to
    // bite: A still wins, but 3-0 untouched became 2-1 with the survivor on 9 HP.
    // ⚠️ That length-then-chip chain is the systemic effect to watch — weaker AoE
    // does not simply mean gentler fights, it means LONGER ones. Wants a sim pass.
    // Prior captures: v0.91 live-formation 376/274; v0.89 league-curve 349/254.
    winner: 'A', events: 419, logLines: 314,
    finals: [
      { side: 'A', slot: 0, hp: 9, mana: 690, wasKOd: false },
      { side: 'A', slot: 1, hp: 0, mana: 213, wasKOd: true },
      { side: 'A', slot: 2, hp: 1117, mana: 756, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 741, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 756, wasKOd: true },
      { side: 'B', slot: 2, hp: 0, mana: 13, wasKOd: true },
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
