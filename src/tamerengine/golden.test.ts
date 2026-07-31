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
    winner: 'B', duration: 57.7, survivors: [0, 1],
    casts: 30, hits: 12, deaths: 1, finalHp: [0, 724],
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
    winner: 'A', duration: 15.2, survivors: [1, 0],
    casts: 17, hits: 13, deaths: 1, finalHp: [206, 0],
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
    winner: 'B', duration: 21.2, survivors: [0, 2],
    casts: 110, hits: 66, deaths: 4, finalHp: [0, 0, 0, 0, 178, 282],
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
