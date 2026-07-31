// GOLDEN FIELD BATTLES — tamerengine's own regression pins.
//
// ⚠️ WHY THESE EXIST SEPARATELY FROM `battle.test.ts`. The turn engine's four
// goldens pin `simulateTeamBattle`, an engine tamerengine replaces at M7, and
// they say nothing about the field. They are also famously twitchy: they moved
// 22 times in a single day during the ability rework, because their teams are
// built by `generateMonster` and then DRAFT their kits from the pool. Any pool
// edit re-drafts every golden team, so all four move together — a fixture that
// moves that often is a changelog, not a regression detector.
//
// ⚠️ SO THESE PIN THEIR LOADOUTS EXPLICITLY. That is the entire design decision.
// A golden should fail when the ENGINE changes, and stay silent when the POOL
// changes. Naming each move by hand decouples them from `chooseLoadout`, from
// move powers, from line affinity, and from the draft rules — all of which moved
// repeatedly today without any engine bug being involved.
//
// Everything else is pinned for the same reason: fixed seeds, fixed species,
// fixed training, fixed placement, fixed obstacles. The only free variable left
// is the simulation itself.
//
// RECAPTURED AT STAGE 1 (visibility-graph pathfinding): two of the three moved
// again. Both moved the same way — the side that has to cross the arena arrives
// sooner and healthier, because it rounds cover instead of scraping it.
//
// RECAPTURED ONCE, DELIBERATELY, at Stage 0 of docs/PATHFINDING_DESIGN.md —
// push-out at spawn, a real escape scan, and the rejection of zero-displacement
// "moves". All three moved and two flipped their winner, which is the fix
// working: units that could not get round cover now can.
//
// ⚠️ WHEN ONE OF THESE MOVES: an intentional engine change (targeting, spacing,
// mitigation, the free attack, status rules) SHOULD move them — recapture
// deliberately, in its own commit, and say which change did it. An UNEXPLAINED
// diff is a regression. `move()` throws on an unknown name, so a rename is a
// loud failure rather than a silently different fight.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { simulateFieldBattle } from './engine'
import { ALL_MOVES } from '../moves'
import { DEFAULT_TACTICS, Monster } from '../core'
import { FieldEvent, Vec2 } from './types'

const move = (name: string) => {
  const m = ALL_MOVES.find((x) => x.name === name)
  if (!m) throw new Error(`golden references a move that no longer exists: ${name}`)
  return m
}
const mk = (seed: string, speciesId: string, kit: string[]): Monster => ({
  ...(generateMonster(seed, { speciesId, train: 850 }) as Monster),
  loadout: kit.map(move),
  tactics: { ...DEFAULT_TACTICS },
})

/** Two rocks, deliberately few — cover is a variable, not scenery. */
const OBSTACLES = [
  { x: 19, y: 6, w: 2.2, h: 2.2 },
  { x: 13, y: 11, w: 2, h: 2 },
]

interface Golden {
  name: string
  seed: string
  a: Monster[]
  b: Monster[]
  placeA: Vec2[]
  placeB: Vec2[]
  winner: 'A' | 'B' | 'draw'
  duration: number
  survivors: [number, number]
  casts: number
  hits: number
  deaths: number
  finalHp: number[]
}

const GOLDENS: Golden[] = [
  {
    // A bruiser against a wall: the matchup the whole melee-reach pass was about.
    name: 'duel-melee',
    seed: 'g-duel',
    a: [mk('ga1', 'kongrath', ['Power Strike', 'Cleave', 'Blood Price'])],
    b: [mk('gb1', 'aegisox', ['Body Slam', 'Seize', 'Taunt'])],
    placeA: [{ x: 14, y: 11 }],
    placeB: [{ x: 26, y: 11 }],
    // ⚠️ 57.7s -> 14.6s at Stage 0. This golden is titled "a bruiser against a
    // wall", and that turned out to be literal: the fight ran to sudden death
    // because the melee could not get past the rock. It now resolves.
    // Stage 3a (Fall Back): 15s -> 13.1s and the winner finishes on 604 not
    // 428. A hurt unit that breaks contact for two seconds takes less on the
    // way, so the fight is shorter and the survivor healthier.
    // Stage 3b: 15.1s -> 24.2s. Both duellists now carry a movement ability,
    // so the loser keeps breaking contact and the fight takes far longer to
    // close. The clearest single illustration of what escapes cost in tempo.
    // Dashes travel now instead of snapping: 24.2s -> 21.7s, because a
    // Backstep costs half a second of ground rather than teleporting free.
    winner: 'B', duration: 13.1, survivors: [0, 1],
    casts: 44, hits: 31, deaths: 1, finalHp: [0, 462],
  },
  {
    // Ranged vs melee across the full width — pins approach, stand-off and the
    // line-of-sight behaviour, starting far enough apart that all three matter.
    name: 'caster-vs-brawler',
    seed: 'g-cast',
    a: [mk('ga2', 'archmage-aleph', ['Ember', 'Cinderburst', 'Arcane Bomb'])],
    b: [mk('gb2', 'ursath', ['Power Strike', 'Headbutt', 'Cleave'])],
    placeA: [{ x: 10, y: 11 }],
    placeB: [{ x: 30, y: 11 }],
    // ⚠️ WINNER FLIPPED A -> B at Stage 0, and the flip is the point: the
    // brawler now reaches the caster instead of scraping along cover on the way
    // in. Melee that can navigate beats a caster at this range — the matchup
    // working rather than breaking.
    // Stage 1 (pathfinding): 9.9s -> 6.8s and the brawler finishes on 530 not
    // 222. It now walks ROUND the rock rather than scraping along it, so it
    // arrives sooner and takes far less on the way in.
    // ⚠️ 6.8s -> 7s on the HEAL-DRAFT fix, and these goldens pin their loadouts
    // precisely so a pool/draft change CANNOT move them. It moved anyway, by one
    // tick — so the FIELD engine re-drafts its own 4-slot kit (FIELD_LOADOUT_SIZE)
    // rather than using the pinned 3. Worth knowing: the pinning is real for the
    // turn engine and only partial here.
    // Cover-seeking retreat: the caster now runs to the rock rather than
    // straight backwards, and the fight lasts longer for it.
    winner: 'B', duration: 8.5, survivors: [0, 1],
    casts: 11, hits: 8, deaths: 1, finalHp: [0, 178],
  },
  {
    // Front line + damage + support on both sides: targeting, taunt, healing and
    // formation all in one fight.
    name: 'trio',
    seed: 'g-trio',
    a: [
      mk('ga3', 'aegisox', ['Body Slam', 'Taunt', 'Shield Wall']),
      mk('ga4', 'kongrath', ['Power Strike', 'Cleave', 'Blood Price']),
      mk('ga5', 'strixil', ['Mend', 'Ember', 'Mind Spike']),
    ],
    b: [
      mk('gb3', 'crocmaw', ['Body Slam', 'Seize', 'Taunt']),
      mk('gb4', 'grivvel', ['Ambush', 'Twin Fangs', 'Toxin Stack']),
      mk('gb5', 'maelurk', ['Ember', 'Frost Shard', 'Rime Bind']),
    ],
    placeA: [{ x: 12, y: 8 }, { x: 12, y: 11 }, { x: 8, y: 14 }],
    placeB: [{ x: 28, y: 8 }, { x: 28, y: 11 }, { x: 32, y: 14 }],
    // ⚠️ WINNER FLIPPED B -> A at Stage 0. Same cause: A's front line reaches
    // the fight instead of hanging on geometry, so its wall+bruiser pairing does
    // the job it was built for.
    // Stage 1: A now wins 3-0 rather than 2-0 — one fewer death on the winning
    // side, because its front line spends the approach walking instead of
    // grinding along cover.
    // Stage 2a (isolation targeting): 17.4s -> 23s. ⚠️ A term measured NULL
    // across 40 paired fights (p=0.69, 34 identical) still moved this one by
    // 5.6s — which is exactly why the sign test is the arbiter here and a
    // single golden is not. It is a fixture, not evidence.
    // Stage 2b (pursuit give-up): 17s -> 21s, and B finishes on 150/13 rather
    // than 223/215. Longer and bloodier is the mechanic working — a chase that
    // stalls now breaks off and finds someone reachable instead of following
    // one target to the end of the fight.
    // ⚠️ Stage 3a flipped this back to A, 2-0. Retreat helps whichever side is
    // losing the exchange at the moment it triggers, so a golden that was close
    // is exactly the one it can tip. The paired sweep is the arbiter, not this.
    // ⚠️ Slower escapes cost the ESCAPER, not the fight. A retreat you can watch
    // is a retreat that can be caught.
    winner: 'B', duration: 19.6, survivors: [0, 2],
    casts: 103, hits: 63, deaths: 4, finalHp: [0, 0, 0, 0, 147, 282],
  },
]

const run = (g: Golden) => simulateFieldBattle({
  seed: g.seed, teamA: g.a, teamB: g.b,
  obstacles: OBSTACLES, placeA: g.placeA, placeB: g.placeB,
})
const tally = (events: FieldEvent[]) => {
  const n: Record<string, number> = {}
  for (const e of events) n[e.kind] = (n[e.kind] ?? 0) + 1
  return n
}

describe('tamerengine golden battles', () => {
  for (const g of GOLDENS) {
    it(g.name, () => {
      const r = run(g)
      const n = tally(r.events)
      const snaps = r.events.filter((e) => e.kind === 'snapshot')
      const last = snaps[snaps.length - 1] as Extract<FieldEvent, { kind: 'snapshot' }>

      expect(r.winner).toBe(g.winner)
      expect(r.duration).toBe(g.duration)
      expect([r.survivorsA, r.survivorsB]).toEqual(g.survivors)
      // Action counts catch a change in WHAT the units did even when the result
      // is unchanged — a targeting or cooldown regression that still ends 1-0.
      expect(n.cast ?? 0).toBe(g.casts)
      expect(n.hit ?? 0).toBe(g.hits)
      expect(n.death ?? 0).toBe(g.deaths)
      // Final HP is the sharpest signal: it moves on any damage-path change.
      expect(last.units.map((u) => u.hp)).toEqual(g.finalHp)
    })
  }

  it('is deterministic — the same inputs give the same fight twice', () => {
    for (const g of GOLDENS) {
      const a = run(g)
      const b = run(g)
      expect(b.winner).toBe(a.winner)
      expect(b.duration).toBe(a.duration)
      expect(b.events.length).toBe(a.events.length)
      expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events))
    }
  })

  it('pins its own loadouts — a golden must never depend on the draft', () => {
    // The guard on the guard. If someone "simplifies" these fixtures by letting
    // generateMonster draft the kits, every pool edit starts moving them again
    // and the whole point is lost.
    for (const g of GOLDENS) {
      for (const m of [...g.a, ...g.b]) {
        expect(m.loadout.length, `${g.name}: ${m.name} has no pinned loadout`).toBeGreaterThan(0)
        for (const mv of m.loadout) expect(ALL_MOVES).toContain(mv)
      }
    }
  })
})
