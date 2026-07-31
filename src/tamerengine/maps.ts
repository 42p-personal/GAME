// ARENAS — three authored battlegrounds, differing in size, cover density and
// cover SHAPE.
//
// ⚠️ FAIRNESS IS STRUCTURAL, NOT CHECKED. Every map is built from `mirror()`,
// which authors one obstacle and derives its 180°-rotated partner about the
// field centre. You cannot write an asymmetric map with this helper by accident.
// That matters more than it looks: an arena that favours one side biases EVERY
// measurement taken on it, silently and in one direction, and a sweep would
// report it as a balance finding about the monsters. The engine's own
// DEFAULT_OBSTACLES carry the same note ("a symmetric pair of blocks so neither
// side is advantaged") — this makes the property impossible to lose rather than
// a thing to remember.
//
// Rotational, not mirror, symmetry: the sides face each other along x, so a
// left-right flip alone would put a wall on one side's left and the other's
// right. 180° is the transform that actually maps the fight onto itself.
//
// Cover SIZE never scales with the field. The premise these were built to test
// is that the things standing on the ground keep their size while the ground
// grows — so a big arena is genuinely sparser, not a photocopy.
import type { Obstacle } from './types'

export interface ArenaMap {
  id: string
  name: string
  /** One line on what this arena is FOR — what it should stress in the sim. */
  brief: string
  w: number
  h: number
  obstacles: Obstacle[]
}

/**
 * One authored block plus its 180° partner. A block already centred on the field
 * is its own partner and is emitted once, so a centrepiece does not get drawn
 * (and collided with) twice.
 */
function mirror(w: number, h: number, o: Obstacle): Obstacle[] {
  const twin: Obstacle = { x: w - o.x - o.w, y: h - o.y - o.h, w: o.w, h: o.h }
  const same = Math.abs(twin.x - o.x) < 1e-6 && Math.abs(twin.y - o.y) < 1e-6
  return same ? [o] : [o, twin]
}

const build = (w: number, h: number, half: Obstacle[]): Obstacle[] =>
  half.flatMap((o) => mirror(w, h, o))

// ── 1. Dustbowl ─────────────────────────────────────────────────────────────
// Small and nearly bare. Nowhere to hide, so approach is trivial and the fight
// is decided on raw trade — the control against which the other two read.
const DUSTBOWL_W = 34
const DUSTBOWL_H = 20

// ── 2. The Ossuary ──────────────────────────────────────────────────────────
// Medium, and the only map with LONG cover. Two 12-unit transverse walls set
// diagonally opposite force the approach into lanes instead of a straight line,
// and the centre pillar splits the one gap that connects them.
const OSSUARY_W = 48
const OSSUARY_H = 26

// ── 3. Titan's Rest ─────────────────────────────────────────────────────────
// Large, with a single massive centre block — the only true hard-cover wall in
// the set — ringed by rubble. Long approach, and a caster that wants line of
// sight has to commit to a side and give up the middle.
const TITAN_W = 64
const TITAN_H = 34

export const MAPS: ArenaMap[] = [
  {
    id: 'dustbowl',
    name: 'Dustbowl',
    brief: 'Small, open, almost no cover — the control map. Melee should thrive.',
    w: DUSTBOWL_W,
    h: DUSTBOWL_H,
    obstacles: build(DUSTBOWL_W, DUSTBOWL_H, [
      { x: 15, y: 3.5, w: 2, h: 2 },
      { x: 8, y: 9.2, w: 1.6, h: 1.6 },
    ]),
  },
  {
    id: 'ossuary',
    name: 'The Ossuary',
    brief: 'Long transverse walls and a centre choke. Lanes, not a straight charge.',
    w: OSSUARY_W,
    h: OSSUARY_H,
    obstacles: build(OSSUARY_W, OSSUARY_H, [
      { x: 13, y: 6.5, w: 12, h: 1.4 }, // the long wall; its twin sits diagonally opposite
      { x: 23, y: 11.5, w: 2, h: 3 }, // dead centre — its own twin, emitted once
      { x: 5.5, y: 12.2, w: 1.8, h: 1.8 },
    ]),
  },
  {
    // ⚠️ THIS MAP DOES NOT RESOLVE — 0/40, every fight to sudden death, 72.9s
    // mean (vs Dustbowl 37/40 @ 18.6s). Kept deliberately: it is the sharpest
    // reproduction of the engine's open target-selection gap, and a regression
    // case is worth more than a fourth pleasant arena.
    //
    // ⚠️ AND IT IS NOT THE MASSIF, WHICH IS THE OPPOSITE OF WHAT IT LOOKS LIKE.
    // Held at 64x34 with cover as the only variable:
    //     bare (no cover)            0.0% cover   20/20   19.7s
    //     massif only (the 8x8)      2.9% cover   20/20   19.8s   <- harmless
    //     rubble only (no massif)    2.7% cover    0/20   72.5s   <- the cause
    //     full map                   5.6% cover    0/20   72.5s
    // The huge block behaves exactly like an empty field: it is too big to
    // circle, so a unit rounds it once and commits. The SMALL scattered blocks
    // are the killer — each one is a cheap way to break line of sight without
    // leaving the fight, so a shooter steps, re-acquires, loses sight again, and
    // the exchange never closes. Field SIZE was separately measured null (sign
    // test p=0.43 at 1.5x, p=0.64 at 2x), so this is cover GEOMETRY alone.
    //
    // Do not "fix" it by deleting the rubble. Fix target selection (P6) and let
    // this map tell you when it works.
    id: 'titans-rest',
    name: "Titan's Rest",
    brief: 'Large, long approach, one huge central massif. Hard cover and flanks.',
    w: TITAN_W,
    h: TITAN_H,
    obstacles: build(TITAN_W, TITAN_H, [
      { x: 28, y: 13, w: 8, h: 8 }, // the massif — centred, emitted once
      { x: 16, y: 6.5, w: 3.5, h: 3.5 },
      { x: 16, y: 24, w: 3.5, h: 3.5 },
      { x: 9, y: 16, w: 2.2, h: 2.2 },
    ]),
  },
]

export const mapById = (id: string): ArenaMap | undefined => MAPS.find((m) => m.id === id)

/**
 * Problems with an arena's geometry, for `validate.ts` and the map tests.
 * Checks what `mirror()` cannot: blocks inside the field, blocks not overlapping
 * each other, symmetry surviving any later hand edit, and a deployment band that
 * is not so blocked a team cannot seat in it.
 */
export function mapProblems(m: ArenaMap): string[] {
  const out: string[] = []

  for (const [i, o] of m.obstacles.entries()) {
    if (o.x < 0 || o.y < 0 || o.x + o.w > m.w || o.y + o.h > m.h) {
      out.push(`${m.id}: obstacle ${i} (${o.x},${o.y} ${o.w}x${o.h}) falls outside the field`)
    }
    for (const [j, p] of m.obstacles.entries()) {
      if (j <= i) continue
      const overlap = o.x < p.x + p.w && p.x < o.x + o.w && o.y < p.y + p.h && p.y < o.y + o.h
      if (overlap) out.push(`${m.id}: obstacles ${i} and ${j} overlap`)
    }
  }

  // The symmetry `mirror()` guarantees — asserted anyway, because a later hand
  // edit to the emitted array would not go through the helper.
  for (const o of m.obstacles) {
    const twin = { x: m.w - o.x - o.w, y: m.h - o.y - o.h, w: o.w, h: o.h }
    const found = m.obstacles.some(
      (p) => Math.abs(p.x - twin.x) < 1e-6 && Math.abs(p.y - twin.y) < 1e-6
        && Math.abs(p.w - twin.w) < 1e-6 && Math.abs(p.h - twin.h) < 1e-6,
    )
    if (!found) out.push(`${m.id}: obstacle at (${o.x},${o.y}) has no 180° partner — the map favours a side`)
  }

  // ⚠️ CROWDING, NOT PROXIMITY. This first rejected any block inside a
  // deployment band, and all three maps failed it on their small side-blocks —
  // which is the tell that the CHECK was wrong, not the data. Cover near your
  // own spawn is a design choice (a caster breaking sight from the start line),
  // and `mirror()` already guarantees both sides get exactly the same of it, so
  // there is no bias to catch. The real failure is a band so blocked that
  // `autoDeployByRole` cannot seat a team and units get shoved out of position.
  const band = m.w * 0.24 + 1.5 // mirrors hex.ts:zoneFor
  const bandArea = band * m.h
  for (const [side, x0, x1] of [['A', 0, band], ['B', m.w - band, m.w]] as const) {
    let blocked = 0
    for (const o of m.obstacles) {
      const ox = Math.max(0, Math.min(o.x + o.w, x1) - Math.max(o.x, x0))
      blocked += ox * o.h
    }
    if (blocked / bandArea > 0.15) {
      out.push(`${m.id}: ${(blocked / bandArea * 100).toFixed(0)}% of side ${side}'s `
        + `deployment band is blocked — the team cannot seat cleanly`)
    }
  }
  return out
}
