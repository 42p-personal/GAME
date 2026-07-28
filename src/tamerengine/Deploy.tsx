// ─────────────────────────────────────────────────────────────────────────────
// DEPLOY (tamerengine M5) — the pre-battle formation screen.
//
// Both teams deploy on hexes. The player drops each monster onto a hex in their
// zone (click a monster in the tray, click a hex — one monster per hex, so the
// formation can never start stacked); the enemy is auto-placed on its own hexes
// by role. The chosen placement feeds the sim's `placeA` / `placeB`.
//
// Static UI, so plain React state is fine here (unlike the animated TamerArena).
import { useLayoutEffect, useRef, useState } from 'react'
import { FIELD_W, Vec2 } from './types'
import { hexCells, HexCell } from './hex'
import { BATTLE_SPRITE_SET } from './BattleSprite'
import './deploy.css'

export interface DeployMonster { id: string; name: string; species: string }

export interface DeployProps {
  team: DeployMonster[]
  onStart: (placeA: Vec2[], enemyFrontHint?: undefined) => void
}

export function Deploy({ team, onStart }: DeployProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(20)
  // monster index → hex cell it's placed on (by "q,r" key)
  const [placed, setPlaced] = useState<Record<number, string>>({})
  const [picked, setPicked] = useState<number | null>(0)

  const cellsA = hexCells('A')
  const cellsB = hexCells('B')
  const cellByKey = (k: string) => cellsA.find((c) => `${c.q},${c.r}` === k)!

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setPx((el.querySelector('.dp-field') as HTMLElement).clientWidth / FIELD_W)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const usedKeys = new Set(Object.values(placed))
  const allPlaced = team.every((_, i) => placed[i] != null)

  const placeOnCell = (cell: HexCell) => {
    const key = `${cell.q},${cell.r}`
    setPlaced((prev) => {
      const next = { ...prev }
      // if this cell already holds someone, pick them up instead
      const occupantEntry = Object.entries(next).find(([, k]) => k === key)
      if (occupantEntry) { delete next[Number(occupantEntry[0])]; setPicked(Number(occupantEntry[0])); return next }
      const who = picked ?? team.findIndex((_, i) => next[i] == null)
      if (who < 0 || who >= team.length) return next
      next[who] = key
      // auto-advance to the next unplaced monster
      const nextUnplaced = team.findIndex((_, i) => next[i] == null)
      setPicked(nextUnplaced >= 0 ? nextUnplaced : null)
      return next
    })
  }

  const start = () => {
    const placeA: Vec2[] = team.map((_, i) => {
      const c = cellByKey(placed[i])
      return { x: c.cx, y: c.cy }
    })
    onStart(placeA)
  }

  const hexPoly = (cell: HexCell) => {
    const size = 2.0 * px
    const cx = cell.cx * px, cy = cell.cy * px
    return { left: cx - size, top: cy - size, width: size * 2, height: size * 2 }
  }

  return (
    <div className="dp-wrap" ref={wrapRef}>
      <div className="dp-stage">
        <div className="dp-field" style={{ backgroundImage: 'url(/field/arena-grass.jpg)' }}>
          {/* enemy hexes — shown, not editable */}
          {cellsB.map((c) => (
            <div key={`b${c.q},${c.r}`} className="dp-hex dp-enemy" style={hexPoly(c)} />
          ))}
          {/* player hexes */}
          {cellsA.map((c) => {
            const key = `${c.q},${c.r}`
            const occupant = team.findIndex((_, i) => placed[i] === key)
            const box = hexPoly(c)
            return (
              <div
                key={`a${key}`}
                className={`dp-hex dp-mine${usedKeys.has(key) ? ' dp-filled' : ''}${picked != null && !usedKeys.has(key) ? ' dp-open' : ''}`}
                style={box}
                onClick={() => placeOnCell(c)}
                role="button"
                aria-label={`hex ${c.q},${c.r}`}
              >
                {occupant >= 0 && (
                  <img
                    className="dp-sprite"
                    alt={team[occupant].name}
                    src={BATTLE_SPRITE_SET.has(team[occupant].species) ? `/battle/${team[occupant].species}-idle.png` : `/sprites/${team[occupant].species}.png`}
                    style={{ width: 3.4 * px, height: 3.4 * px }}
                    draggable={false}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="dp-tray">
        <span className="dp-lbl">Your team — pick, then click a hex</span>
        {team.map((m, i) => (
          <button
            key={m.id}
            className={`dp-chip${picked === i ? ' dp-picked' : ''}${placed[i] != null ? ' dp-done' : ''}`}
            onClick={() => setPicked(i)}
          >
            <img src={BATTLE_SPRITE_SET.has(m.species) ? `/battle/${m.species}-idle.png` : `/sprites/${m.species}.png`} alt="" />
            <span>{m.name}</span>
            {placed[i] != null && <em className="dp-tick">✓</em>}
          </button>
        ))}
        <button className="dp-start" disabled={!allPlaced} onClick={start}>Start battle →</button>
      </div>
      <p className="dp-hint">
        The enemy deploys on its own hexes by role. Your formation is the plan — anchors up front,
        casters at the back. No two monsters share a hex.
      </p>
    </div>
  )
}
