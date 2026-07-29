// ─────────────────────────────────────────────────────────────────────────────
// DEPLOY (tamerengine M5) — the pre-battle formation screen.
//
// Both teams deploy on hexes. The player drops each monster onto a hex in their
// zone (click a monster in the tray, click a hex — one monster per hex, so the
// formation can never start stacked); the enemy is auto-placed on its own hexes
// by role. The chosen placement feeds the sim's `placeA` / `placeB`.
//
// ⚠️ SPRITES RENDER IN THEIR OWN UN-CLIPPED LAYER, not inside the hex divs. A
// clip-path hexagon clips its CHILDREN, so a sprite nested in the hex was cut to
// the hex shape. And the hex slot markers are drawn small (well inside the cell
// spacing) so they never overlap — an early version sized the hex box at 2×the
// hex radius while columns are only √3×radius apart, so the hexes piled together
// and placed monsters looked like they shared one spot.
//
// Static UI, so plain React state is fine here (unlike the animated TamerArena).
import { useLayoutEffect, useRef, useState } from 'react'
import { FIELD_W, Vec2 } from './types'
import { hexCells, HexCell } from './hex'
import { BATTLE_SPRITE_SET } from './BattleSprite'
import './deploy.css'

export interface DeployMonster { id: string; name: string; species: string }
export interface DeployProps { team: DeployMonster[]; onStart: (placeA: Vec2[]) => void }

const spriteSrc = (species: string) =>
  BATTLE_SPRITE_SET.has(species) ? `/battle/${species}-idle.png` : `/sprites/${species}.png`

export function Deploy({ team, onStart }: DeployProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(0)
  const [placed, setPlaced] = useState<Record<number, string>>({}) // monster idx → "q,r"
  const [picked, setPicked] = useState<number | null>(0)

  const cellsA = hexCells('A')
  const cellsB = hexCells('B')
  const cellByKey = (k: string) => cellsA.find((c) => `${c.q},${c.r}` === k)!

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const f = el.querySelector('.dp-field') as HTMLElement | null
      if (f && f.clientWidth > 0) setPx(f.clientWidth / FIELD_W)
    }
    measure()
    // the aspect-ratio field may lay out a tick late; re-measure on the next frame
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure) }
  }, [])

  const usedKeys = new Set(Object.values(placed))
  const allPlaced = team.every((_, i) => placed[i] != null)

  const placeOnCell = (cell: HexCell) => {
    const key = `${cell.q},${cell.r}`
    setPlaced((prev) => {
      const next = { ...prev }
      const occ = Object.entries(next).find(([, k]) => k === key)
      if (occ) { delete next[Number(occ[0])]; setPicked(Number(occ[0])); return next } // pick up
      const who = picked ?? team.findIndex((_, i) => next[i] == null)
      if (who < 0 || who >= team.length) return next
      next[who] = key
      const nextUnplaced = team.findIndex((_, i) => next[i] == null)
      setPicked(nextUnplaced >= 0 ? nextUnplaced : null)
      return next
    })
  }

  const start = () => onStart(team.map((_, i) => {
    const c = cellByKey(placed[i]); return { x: c.cx, y: c.cy }
  }))

  // A small hex slot marker centred on the cell — sized well inside the ~3-unit
  // cell spacing so neighbours never touch.
  const R = 1.35 * px
  const slot = (c: HexCell) => ({ left: c.cx * px - R, top: c.cy * px - R, width: R * 2, height: R * 2 })

  return (
    <div className="dp-wrap" ref={wrapRef}>
      <div className="dp-stage">
        <div className="dp-field" style={{ backgroundImage: 'url(/field/arena-grass.jpg)' }}>
          {px > 0 && <>
            {/* enemy slots — shown, not editable */}
            {cellsB.map((c) => <div key={`b${c.q},${c.r}`} className="dp-hex dp-enemy" style={slot(c)} />)}
            {/* player slots — clickable */}
            {cellsA.map((c) => {
              const key = `${c.q},${c.r}`
              return (
                <div
                  key={`a${key}`}
                  className={`dp-hex dp-mine${usedKeys.has(key) ? ' dp-filled' : ''}${picked != null && !usedKeys.has(key) ? ' dp-open' : ''}`}
                  style={slot(c)} onClick={() => placeOnCell(c)} role="button" aria-label={`hex ${c.q},${c.r}`}
                />
              )
            })}
            {/* SPRITES — a separate, un-clipped layer so nothing is cut off */}
            {team.map((m, i) => {
              if (placed[i] == null) return null
              const c = cellByKey(placed[i])
              const S = 3.6 * px
              return (
                <img
                  key={`s${m.id}`} className="dp-sprite" alt={m.name} src={spriteSrc(m.species)}
                  draggable={false}
                  style={{ left: c.cx * px - S / 2, top: c.cy * px - S + R * 0.6, width: S, height: S }}
                  onClick={() => placeOnCell(c)}
                />
              )
            })}
          </>}
        </div>
      </div>

      <div className="dp-tray">
        <span className="dp-lbl">Your team — pick, then click a hex</span>
        {team.map((m, i) => (
          <button key={m.id} className={`dp-chip${picked === i ? ' dp-picked' : ''}${placed[i] != null ? ' dp-done' : ''}`} onClick={() => setPicked(i)}>
            <img src={spriteSrc(m.species)} alt="" />
            <span>{m.name}</span>
            {placed[i] != null && <em className="dp-tick">✓</em>}
          </button>
        ))}
        <button className="dp-start" disabled={!allPlaced} onClick={start}>Start battle →</button>
      </div>
      <p className="dp-hint">
        Click a monster, then a blue hex to place it. The enemy (red hexes) deploys by role —
        anchors up front, casters at the back. One monster per hex, no stacking.
      </p>
    </div>
  )
}
