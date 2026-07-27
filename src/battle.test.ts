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
    // recaptured v0.91: the AI now understands multi-target reach and contagion,
    // so it ranks moves it used to undervalue. A wins FASTER and CLEANER — 126 →
    // 58 events, and slot 0 survives where it used to be KO'd. Better play, not
    // a balance change. Prior capture, v0.852: 126/93 (prestige base-stat bump).
    // Recaptured again for the play-quality pass (lethality, ranked support):
    // 58 -> 52 events. Fights keep getting shorter as the AI gets better.
    winner: 'A', events: 52, logLines: 47,
    finals: [
      { side: 'A', slot: 0, hp: 150, mana: 204, wasKOd: false },
      { side: 'A', slot: 1, hp: 152, mana: 235, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 226, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 326, wasKOd: true },
    ],
  },
  {
    // exercises the round-35 sudden-death path — now DECISIVE (was a full-wipe
    // draw). Recaptured 2026-07-22 after the %-of-max-HP sudden-death rework
    // (flat chip → % chip), CON coefficient trims, and WIS spell-power — the
    // clock now resolves a winner instead of wiping both.
    name: '3v3-high', a: ['gold-a5', 'gold-a6', 'gold-a7'], b: ['gold-b5', 'gold-b6', 'gold-b7'], train: 2000,
    // ⚠️ recaptured v0.91 (THIRD move this cycle) — WINNER FLIPPED A → B, after the
    // AI learned multi-target reach. Both sides got the same upgrade; B's kit
    // (gold-b5 Archmage-Aleph runs Inferno) simply gains more from an AI that
    // finally ranks a 3-target sweep above a single hit of the same face power.
    // A 3v3 decided by one AoE caster flipping is a fair outcome, not a
    // regression — the long-haul sim was re-run and the economy held.
    // Prior captures: AoE-falloff 419/314; live-formation 376/274; v0.89 349/254.
    // ⚠️ Recaptured for the guardian-taunt pass, and the winner flipped BACK to A.
    // Not noise: side A fields TWO Tortavos, both carrying Bulwark's Challenge.
    // Taunts previously fired only for a monster explicitly flagged `protect`, so
    // those tanks sat on the move while teammates died. Letting a guardian cover
    // any endangered ally is precisely the kit this unlocks — a tank-heavy team
    // getting its tanks back is the change working, not a coin landing differently.
    // Captures this cycle: B 347 (play-quality) <- B 404 (AoE-aware AI) <-
    // A 419 (AoE falloff) <- A 376 (live formation) <- A 349 (v0.89 league curve).
    winner: 'A', events: 406, logLines: 317,
    finals: [
      { side: 'A', slot: 0, hp: 350, mana: 709, wasKOd: false },
      { side: 'A', slot: 1, hp: 0, mana: 242, wasKOd: true },
      { side: 'A', slot: 2, hp: 874, mana: 737, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 743, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 746, wasKOd: true },
      { side: 'B', slot: 2, hp: 0, mana: 23, wasKOd: true },
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
