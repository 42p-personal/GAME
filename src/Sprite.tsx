// Species portrait. The 30 base species (2026-07-25) render their real
// hand-generated art (see speciesArt.ts) — the same adult image at every
// life stage, since per-stage generation produced worse results (see
// CLAUDE.md). Species without real art yet (the 15 exclusive-body species)
// fall back to the original hand-authored body-type pixel-grid silhouette,
// tinted by a per-species hue. 'Elder'/'Retiree' render visually aged
// (desaturated, dimmed) rather than needing separate art, since a monster's
// proportions don't change further at that point — only its condition does.
import { useMemo, type CSSProperties } from 'react'
import { Species, hashString } from './core'
import { SPRITES, palette } from './sprites'
import { SPECIES_ART } from './speciesArt'

// Mirrors game.ts's Stage type (not imported directly, to avoid pulling the
// whole game/career module into this leaf component) — callers pass a
// monster's current life stage when known; omit it to default to adult.
type Stage = 'Baby' | 'Teen' | 'Fully Grown' | 'Elder' | 'Retiree'

const AGING_FILTER = 'grayscale(0.55) brightness(0.75) saturate(0.6)'

export function Sprite({ species, size = 96, stage }: { species: Species; size?: number; stage?: Stage }) {
  const genericPal = useMemo(() => palette(hashString(species.id) % 360), [species.id])
  const art = SPECIES_ART[species.id]
  const isElder = stage === 'Elder' || stage === 'Retiree'

  const wrapperStyle: CSSProperties = {
    width: size, height: size,
    background: '#0c0e15', borderRadius: 8, border: '1px solid var(--line)',
    filter: isElder ? AGING_FILTER : undefined,
  }

  if (art) {
    return (
      <img
        src={art}
        width={size} height={size}
        alt={species.name}
        style={{ ...wrapperStyle, objectFit: 'contain', imageRendering: 'auto' }}
      />
    )
  }

  const grid = SPRITES[species.body]
  const gridSize = grid.length
  const u = size / gridSize
  const cells: JSX.Element[] = []
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      cells.push(<rect key={y * gridSize + x} x={x * u} y={y * u} width={u} height={u} fill={genericPal[ch]} />)
    }
  })
  return (
    <svg width={size} height={size} style={{ ...wrapperStyle, imageRendering: 'pixelated' }}>
      {cells}
    </svg>
  )
}
