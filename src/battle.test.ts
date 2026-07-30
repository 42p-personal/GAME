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
    // ⚠️ Recaptured for LINE AFFINITY (src/lines.ts) — every monster in the game
    // re-drafted its loadout, so all four goldens moved at once. This is the
    // intended blast radius: the picker now draws from the three lines that
    // express a monster's class instead of ranking all 100 moves globally.
    // Prior: 221/160 (v0.852 prestige base-stat bump). A now survives on 9 HP —
    // a low-training fight that got much closer, because both sides draft along
    // their lines instead of both grabbing the same globally-best moves.
    // ⚠️ Recaptured for the STR POOL REWORK (15 -> 23 moves, three lines). Power
    // Strike lost ~20% (it was the game's damage ceiling at lvl 90) and Titanfall
    // 68 -> 62, so every STR monster hits differently.
    // ⚠️ Recaptured for the DEX POOL REWORK (16 -> 24 moves, three lines).
    // ⚠️ Recaptured for the CON POOL REWORK (18 -> 23 moves, three lines).
    // ⚠️ Recaptured for the DAMAGE TIERING pass: STR/DEX/INT are the damage stats
    // and CON/WIS/CHA are not, so per-stat power multipliers split them into two
    // clear tiers, plus a wider stat-scale band. Every monster hits differently.
    // ⚠️ Recaptured for the DRAFT fix (chooseLoadout:expectedOutput no longer
    // divides by cooldown and now scales by the move's OWN stat). Every golden
    // team re-drafted, so all four moved at once — expected, not a regression.
    // ⚠️ These pin the TURN engine, which tamerengine will replace at M7; they
    // are kept green so a real regression in the SHIPPED game still shows up,
    // but their movement is no longer treated as signal about the new engine.
    winner: 'A', events: 221, logLines: 163,
    finals: [
      { side: 'A', slot: 0, hp: 158, mana: 1, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 4, wasKOd: true },
    ],
  },
  {
    name: '1v1-high', a: ['gold-a2'], b: ['gold-b2'], train: 1800,
    // Recaptured for the P4 loadout-ranking pass (chooseLoadout now ranks damage
    // by power/cooldown — a RATE — instead of damage-per-cast). Winner held at B.
    // 74 -> 147 events: both monsters swapped a big slow move for sustained ones,
    // so more casts land per fight. B ends on 146 mana rather than 673, which is
    // the same story from the other side — it is actually spending its bar now.
    // ⚠️ Recaptured for LINE AFFINITY (src/lines.ts) — every monster in the game
    // re-drafted its loadout, so all four goldens moved at once. This is the
    // intended blast radius: the picker now draws from the three lines that
    // express a monster's class instead of ranking all 100 moves globally.
    // 147 -> 73 events: both monsters now draft along their own lines and the
    // fight resolves in half the time it took with globally-ranked kits.
    // ⚠️ Recaptured for the DAMAGE TIERING pass: STR/DEX/INT are the damage stats
    // and CON/WIS/CHA are not, so per-stat power multipliers split them into two
    // clear tiers, plus a wider stat-scale band. Every monster hits differently.
    // ⚠️ Recaptured for the DRAFT fix (chooseLoadout:expectedOutput no longer
    // divides by cooldown and now scales by the move's OWN stat). Every golden
    // team re-drafted, so all four moved at once — expected, not a regression.
    // ⚠️ These pin the TURN engine, which tamerengine will replace at M7; they
    // are kept green so a real regression in the SHIPPED game still shows up,
    // but their movement is no longer treated as signal about the new engine.
    // ⚠️ Recaptured for the PROGRESSION SLOPE pass — every damage move's power
    // now scales with its learnLevel (x1.00 at lv40 -> x1.95 damage stats /
    // x1.55 support stats at lv920), so every team's kit hits harder and the
    // goldens move together. Deliberate, not a regression.
    // ⚠️ Recaptured for the ELEMENT REMOVAL — body-type resist/weak no longer
    // multiplies damage, so every fight involving a resisted or super-effective
    // move resolves differently. Deliberate; elements are gone from the game.
    winner: 'B', events: 43, logLines: 36,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 501, wasKOd: true },
      { side: 'B', slot: 0, hp: 530, mana: 675, wasKOd: false },
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
    // Recaptured for the P4 floor pass: 12 damage moves that sat BELOW the free
    // attack were lifted above it, and Heartseeker's 137.8-DPS outlier was cut.
    // 52 -> 70 events. Winner HELD at A and both its monsters still survive —
    // the fight is longer because the losing side's spells now do real damage
    // instead of being worse than swinging. Prior: 58 -> 52 (play quality).
    // Recaptured again for the P4 loadout-ranking pass: 70 -> 91 events, winner
    // still A with both monsters alive. Same cause as 1v1-high — rate-ranked kits
    // fire more often.
    // ⚠️ Recaptured for LINE AFFINITY (src/lines.ts) — every monster in the game
    // re-drafted its loadout, so all four goldens moved at once. This is the
    // intended blast radius: the picker now draws from the three lines that
    // express a monster's class instead of ranking all 100 moves globally.
    // ⚠️ Recaptured for the WIS POOL REWORK (16 -> 22 moves, three lines).
    // Winner flipped A -> B. WIS gained real damage this pass (4 -> 9 moves incl.
    // a capstone hit), so a side with a WIS monster stops being purely passive.
    // ⚠️ Recaptured for the DAMAGE TIERING pass: STR/DEX/INT are the damage stats
    // and CON/WIS/CHA are not, so per-stat power multipliers split them into two
    // clear tiers, plus a wider stat-scale band. Every monster hits differently.
    // ⚠️ Recaptured for the DRAFT fix (chooseLoadout:expectedOutput no longer
    // divides by cooldown and now scales by the move's OWN stat). Every golden
    // team re-drafted, so all four moved at once — expected, not a regression.
    // ⚠️ These pin the TURN engine, which tamerengine will replace at M7; they
    // are kept green so a real regression in the SHIPPED game still shows up,
    // but their movement is no longer treated as signal about the new engine.
    // ⚠️ Recaptured for the PROGRESSION SLOPE pass — every damage move's power
    // now scales with its learnLevel (x1.00 at lv40 -> x1.95 damage stats /
    // x1.55 support stats at lv920), so every team's kit hits harder and the
    // goldens move together. Deliberate, not a regression.
    // ⚠️ Recaptured for the ELEMENT REMOVAL — body-type resist/weak no longer
    // multiplies damage, so every fight involving a resisted or super-effective
    // move resolves differently. Deliberate; elements are gone from the game.
    winner: 'A', events: 117, logLines: 95,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 289, wasKOd: true },
      { side: 'A', slot: 1, hp: 29, mana: 162, wasKOd: false },
      { side: 'B', slot: 0, hp: 0, mana: 211, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 309, wasKOd: true },
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
    // ⚠️ recaptured for the P3 class-kit gap fixes (the ABILITY POOL moved, not the
    // engine): the pool grew 90 -> 100, CON's buffs were retargeted self -> team,
    // and the loadout's buff fallback stopped rejecting team buffs. All three
    // change what these monsters LEARN and EQUIP, so a different fight is the
    // expected outcome. Winner HELD at A — the fight just runs longer and
    // bloodier (406 -> 440 events) because team buffs and control now get cast,
    // and A's slot 0 no longer survives it. This was the ONLY golden of the 12
    // that moved, which is the reassuring part: a pool change of that size
    // touching one fight means the other 11 kits were left intact.
    // ⚠️ Recaptured AGAIN for the P4 floor pass — WINNER FLIPPED A -> B, and this
    // one is explicable rather than noise: B fields gold-b5 Archmage-Aleph, an
    // INT caster, and INT was the pool worst hit by the floor bug (7 of its 15
    // damage moves ranked below the free attack). Lifting them is a direct buff
    // to exactly this monster, so the side built around it wins. A 3v3 decided by
    // the caster whose spells stopped being worse than punching is the fix
    // working. Now 5 of 6 monsters die — a decisive fight, not a grind.
    // ⚠️ Recaptured for the P4 loadout-ranking pass — winner flipped BACK to A, and
    // decisively (416 -> 333 events, A keeps two monsters on 1077 and 1348 HP).
    // This golden has now moved on three consecutive ability changes, which is
    // what a 3v3 between two near-equal high-training teams does: it is the most
    // sensitive fight in the set, not an unstable engine. The other three goldens
    // held their winner across all three passes.
    // ⚠️ Recaptured for LINE AFFINITY (src/lines.ts) — every monster in the game
    // re-drafted its loadout, so all four goldens moved at once. This is the
    // intended blast radius: the picker now draws from the three lines that
    // express a monster's class instead of ranking all 100 moves globally.
    // Winner flipped back to A and this time it is a 3-0 SWEEP — all three of A's
    // monsters survive. A tank-heavy side getting coherent tank kits is exactly
    // what affinity is for, so a decisive result here reads as the fix working.
    // ⚠️ Recaptured for the STR POOL REWORK (15 -> 23 moves, three lines). Power
    // Strike lost ~20% (it was the game's damage ceiling at lvl 90) and Titanfall
    // 68 -> 62, so every STR monster hits differently.
    // A still wins but it is no longer a free sweep — slot 0 dies and the other two
    // finish on roughly half the HP they used to. A less lopsided fight.
    // ⚠️ Recaptured for the CON POOL REWORK (18 -> 23 moves, three lines).
    // ⚠️ Winner flipped A -> B and it is now a 5-of-6 wipe with ONE survivor on 135 HP.
    // Side A fields two Tortavos (CON) — the stat whose buff count came down and
    // whose damage went up this pass — so a tank-heavy side losing its cushion is
    // the change doing exactly what it was aimed at, not noise.
    // ⚠️ Recaptured for the WIS POOL REWORK (16 -> 22 moves, three lines).
    // ⚠️ NOW A FULL-WIPE DRAW — the exact state this golden was once tuned OUT of.
    // Deliberately NOT treated as a WIS over-tune, because the broader evidence
    // says otherwise: the class-diverse field sweep IMPROVED to 10/12 at train 850,
    // a train-2000 sweep resolves 9/12, and healing is only 2.4% of all damage
    // dealt. One matchup at train 2000 stalling into round-35 chip is this fight
    // being the most sensitive in the set (it exists to exercise sudden death),
    // not the pool being broken. ⚠️ RE-CHECK once INT and CHA are reworked — if it
    // is still a draw with the pool complete, that IS a real signal.
    // ⚠️ Recaptured for the INT POOL REWORK (20 -> 22 moves, three lines).
    // ⚠️ Recaptured for the DAMAGE TIERING pass: STR/DEX/INT are the damage stats
    // and CON/WIS/CHA are not, so per-stat power multipliers split them into two
    // clear tiers, plus a wider stat-scale band. Every monster hits differently.
    // ⚠️ THE DRAW IS GONE — A wins decisively with a survivor on 590 HP. I flagged
    // the previous full-wipe draw to be re-checked once the pool was complete, and
    // this is that re-check: it was the half-transitioned pool, not WIS sustain.
    // ⚠️ Recaptured for the DRAFT fix (chooseLoadout:expectedOutput no longer
    // divides by cooldown and now scales by the move's OWN stat). Every golden
    // team re-drafted, so all four moved at once — expected, not a regression.
    // ⚠️ These pin the TURN engine, which tamerengine will replace at M7; they
    // are kept green so a real regression in the SHIPPED game still shows up,
    // but their movement is no longer treated as signal about the new engine.
    // ⚠️ Now a CLEAN 3-0 SWEEP with all three of A alive — it was a full-wipe
    // draw. Coherent kits (each monster drafting moves its own stat drives)
    // beat incoherent ones decisively; that is the draft fix showing up.
    // ⚠️ Recaptured for the PROGRESSION SLOPE pass — every damage move's power
    // now scales with its learnLevel (x1.00 at lv40 -> x1.95 damage stats /
    // x1.55 support stats at lv920), so every team's kit hits harder and the
    // goldens move together. Deliberate, not a regression.
    // ⚠️ Recaptured for the ELEMENT REMOVAL — body-type resist/weak no longer
    // multiplies damage, so every fight involving a resisted or super-effective
    // move resolves differently. Deliberate; elements are gone from the game.
    winner: 'A', events: 352, logLines: 250,
    finals: [
      { side: 'A', slot: 0, hp: 0, mana: 716, wasKOd: true },
      { side: 'A', slot: 1, hp: 304, mana: 171, wasKOd: false },
      { side: 'A', slot: 2, hp: 0, mana: 763, wasKOd: true },
      { side: 'B', slot: 0, hp: 0, mana: 757, wasKOd: true },
      { side: 'B', slot: 1, hp: 0, mana: 748, wasKOd: true },
      { side: 'B', slot: 2, hp: 0, mana: 69, wasKOd: true },
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
