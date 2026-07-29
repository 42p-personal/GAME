// ─────────────────────────────────────────────────────────────────────────────
// DEPLOY (tamerengine) — the pre-battle PLANNING phase.
//
// One screen that commits BOTH the formation and the orders before the fight, so
// the player's plan drives the battle (the M5/Step-1 requirement that pre-battle
// tactics "greatly drive behaviour"):
//   • drop each monster onto a hex in your zone (one per hex, so a formation can
//     never start stacked); the enemy auto-deploys on its own hexes by role.
//   • the SELECTED monster's orders show in a TacticsPanel below the field — the
//     same Tactics the field decider reads, so they genuinely bite.
//   • FIGHT fades the hex grid out and hands (placement + tactics) to the sim;
//     the hexes exist only for deployment, gone once the fight begins.
//
// ⚠️ SPRITES RENDER IN THEIR OWN UN-CLIPPED LAYER, not inside the hex divs. A
// clip-path hexagon clips its CHILDREN, so a sprite nested in the hex was cut to
// the hex shape. The hex slot markers are drawn small (well inside the cell
// spacing) so they never overlap.
//
// Static UI, so plain React state is fine here (unlike the animated TamerArena).
import { useLayoutEffect, useRef, useState } from 'react'
import { FIELD_W, Vec2 } from './types'
import { fieldHexCells, FieldHexCell } from './hex'
import { BATTLE_SPRITE_SET } from './BattleSprite'
import { TacticsPanel } from './TacticsPanel'
import { Tactics, DEFAULT_TACTICS } from '../core'
import './deploy.css'

export interface DeployMonster { id: string; name: string; species: string }
export interface DeployResult { placeA: Vec2[]; tactics: Tactics[] }
export interface DeployProps { team: DeployMonster[]; onStart: (r: DeployResult) => void }

const spriteSrc = (species: string) =>
  BATTLE_SPRITE_SET.has(species) ? `/battle/${species}-idle.png` : `/sprites/${species}.png`

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Deploy({ team, onStart }: DeployProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(0)
  const [placed, setPlaced] = useState<Record<number, string>>({}) // monster idx → "q,r"
  const [selected, setSelected] = useState<number>(0)               // whose orders/placement is active
  const [tactics, setTactics] = useState<Record<number, Tactics>>({})
  const [launching, setLaunching] = useState(false)

  const allCells = fieldHexCells()
  const cellByKey = (k: string) => allCells.find((c) => `${c.q},${c.r}` === k)!

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const f = el.querySelector('.dp-field') as HTMLElement | null
      if (f && f.clientWidth > 0) setPx(f.clientWidth / FIELD_W)
    }
    measure()
    const raf = requestAnimationFrame(measure) // aspect-ratio field may lay out a tick late
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure) }
  }, [])

  const usedKeys = new Set(Object.values(placed))
  const allPlaced = team.every((_, i) => placed[i] != null)
  const tacticFor = (i: number) => tactics[i] ?? DEFAULT_TACTICS

  // Click a hex in YOUR zone: if occupied, SELECT that monster (for orders); if
  // empty, place (or move) the selected monster there, then advance to the next
  // unplaced. Neutral / enemy hexes are display-only.
  const placeOnCell = (cell: FieldHexCell) => {
    if (launching || cell.zone !== 'A') return
    const key = `${cell.q},${cell.r}`
    const occ = Object.entries(placed).find(([, k]) => k === key)
    if (occ) { setSelected(Number(occ[0])); return }
    setPlaced((prev) => {
      const next = { ...prev, [selected]: key }
      const nextUnplaced = team.findIndex((_, i) => next[i] == null)
      if (nextUnplaced >= 0) setSelected(nextUnplaced)
      return next
    })
  }

  const start = () => {
    if (!allPlaced || launching) return
    const result: DeployResult = {
      placeA: team.map((_, i) => { const c = cellByKey(placed[i]); return { x: c.cx, y: c.cy } }),
      tactics: team.map((_, i) => tacticFor(i)),
    }
    if (prefersReducedMotion()) { onStart(result); return }
    setLaunching(true) // fade the hexes out, then hand off
    window.setTimeout(() => onStart(result), 460)
  }

  // A small hex slot marker centred on the cell — sized well inside the ~3-unit
  // cell spacing so neighbours never touch.
  const R = 1.35 * px
  const slot = (c: FieldHexCell) => ({ left: c.cx * px - R, top: c.cy * px - R, width: R * 2, height: R * 2 })

  return (
    <div className="dp-wrap" ref={wrapRef}>
      <div className="dp-stage">
        <div className="dp-field" style={{ backgroundImage: 'url(/field/arena-grass.jpg)' }}>
          {px > 0 && <>
            {/* HEX GRID — the WHOLE board is hexed (middle band faint, the two
                zones live). Fades out on launch; deployment-only, gone in the fight. */}
            <div className={`dp-hexlayer${launching ? ' launching' : ''}`}>
              {allCells.map((c) => {
                const key = `${c.q},${c.r}`
                if (c.zone === 'neutral') return <div key={`n${key}`} className="dp-hex dp-neutral" style={slot(c)} />
                if (c.zone === 'B') return <div key={`b${key}`} className="dp-hex dp-enemy" style={slot(c)} />
                return (
                  <div
                    key={`a${key}`}
                    className={`dp-hex dp-mine${usedKeys.has(key) ? ' dp-filled' : ' dp-open'}`}
                    style={slot(c)} onClick={() => placeOnCell(c)} role="button" aria-label={`hex ${c.q},${c.r}`}
                  />
                )
              })}
            </div>
            {/* SPRITES — a separate, un-clipped layer so nothing is cut off; stays
                through the hex fade for visual continuity into the fight. */}
            {team.map((m, i) => {
              if (placed[i] == null) return null
              const c = cellByKey(placed[i])
              const S = 3.6 * px
              return (
                <img
                  key={`s${m.id}`} className={`dp-sprite${selected === i ? ' dp-sel' : ''}`} alt={m.name} src={spriteSrc(m.species)}
                  draggable={false}
                  style={{ left: c.cx * px - S / 2, top: c.cy * px - S + R * 0.6, width: S, height: S }}
                  onClick={() => setSelected(i)}
                />
              )
            })}
          </>}
        </div>
      </div>

      <div className="dp-tray">
        <span className="dp-lbl">Your team — pick, then click a hex</span>
        {team.map((m, i) => (
          <button key={m.id}
            className={`dp-chip${selected === i ? ' dp-picked' : ''}${placed[i] != null ? ' dp-done' : ''}`}
            onClick={() => setSelected(i)}>
            <img src={spriteSrc(m.species)} alt="" />
            <span>{m.name}</span>
            {placed[i] != null && <em className="dp-tick">✓</em>}
          </button>
        ))}
        <button className="dp-start" disabled={!allPlaced || launching} onClick={start}>
          {launching ? 'Fighting…' : 'Fight →'}
        </button>
      </div>

      <TacticsPanel name={team[selected]?.name ?? ''} value={tacticFor(selected)}
        onChange={(t) => setTactics((prev) => ({ ...prev, [selected]: t }))} />

      <p className="dp-hint">
        Click a monster (tray or field) to select it, a blue hex to place or move it, and set its
        <b> orders</b> below — they drive how it fights. The enemy (red hexes) deploys by role.
        The grid is for deployment only; it fades when the fight begins.
      </p>
    </div>
  )
}
