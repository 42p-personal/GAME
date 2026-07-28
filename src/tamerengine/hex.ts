// ─────────────────────────────────────────────────────────────────────────────
// HEX (tamerengine M5) — the deployment grid math.
//
// Hexes are used ONLY for deployment: the player drops each monster onto a hex
// to set a starting formation, and the enemy is placed on its own hexes too.
// During the fight movement is continuous — so this file is small, just enough
// to lay a hex grid over a team's deployment zone and turn a chosen cell into
// the world Vec2 the engine's `placeA` / `placeB` accepts.
//
// Pointy-top axial hexes. World units are the engine's (40×22 field).
import { FIELD_H, FIELD_W, Vec2 } from './types'

export interface HexCell {
  /** axial coordinates, unique per cell */
  q: number; r: number
  /** world-space centre — this is what feeds the sim's placement */
  cx: number; cy: number
}

/** A team's deployment zone: the back band on its own side of the field. */
export function deployZone(side: 'A' | 'B'): { x0: number; x1: number; y0: number; y1: number } {
  const band = FIELD_W * 0.24 // back ~quarter
  return side === 'A'
    ? { x0: 1.5, x1: 1.5 + band, y0: 2, y1: FIELD_H - 2 }
    : { x0: FIELD_W - 1.5 - band, x1: FIELD_W - 1.5, y0: 2, y1: FIELD_H - 2 }
}

/**
 * The hex cells covering a deployment zone. `size` is the hex radius in world
 * units — tuned so a cell comfortably holds one monster (radius 0.9) with the
 * ~1.19 non-overlap gap, i.e. cells are spaced wider than that so a placed
 * formation never starts overlapping.
 */
export function hexCells(side: 'A' | 'B', size = 2.0): HexCell[] {
  const z = deployZone(side)
  const w = Math.sqrt(3) * size       // horizontal spacing between columns
  const h = (3 / 2) * size            // vertical spacing between rows
  const cells: HexCell[] = []
  let q = 0
  for (let cx = z.x0 + size; cx <= z.x1; cx += w, q++) {
    let r = 0
    // odd columns offset down by half a row (pointy-top brick layout)
    const yOff = (q % 2) * (h / 2)
    for (let cy = z.y0 + size + yOff; cy <= z.y1; cy += h, r++) {
      cells.push({ q, r, cx: +cx.toFixed(2), cy: +cy.toFixed(2) })
    }
  }
  return cells
}

/** Enemy auto-deploy: sort its team by role and lay it onto its hexes —
 *  anchors (sturdy) on the FRONT column, artillery/support on the BACK. */
export function autoDeployByRole(
  side: 'A' | 'B',
  team: { front: number }[], // `front` = CON+STR vs INT+WIS score; higher = more front-line
  size = 2.0,
): Vec2[] {
  const cells = hexCells(side, size)
  // Front column = the one nearest the enemy (max cx for A, min cx for B).
  const frontFirst = [...cells].sort((a, b) => (side === 'A' ? b.cx - a.cx : a.cx - b.cx) || a.cy - b.cy)
  const order = team.map((t, i) => ({ i, front: t.front })).sort((a, b) => b.front - a.front)
  const out: Vec2[] = new Array(team.length)
  order.forEach((t, k) => {
    const cell = frontFirst[k] ?? frontFirst[frontFirst.length - 1]
    out[t.i] = { x: cell.cx, y: cell.cy }
  })
  return out
}
