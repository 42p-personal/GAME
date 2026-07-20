// Pixel-art sprite: the species' body-type silhouette, tinted by a per-species hue.
// Species with an entry in SPECIES_SPRITES (Mammals so far — user spec
// 2026-07-24) get their OWN silhouette instead, one per life stage, growing
// in size/detail child -> teen -> adult like an evolution line. 'Elder'/
// 'Retiree' reuse the adult silhouette but render visually aged (desaturated,
// dimmed) rather than needing a 4th hand-drawn shape, since a monster's
// proportions don't change further at that point — only its condition does.
import { useMemo } from 'react'
import { Species, hashString } from './core'
import { SPRITES, palette } from './sprites'
import { LifeStage, SPECIES_PALETTE, SPECIES_SPRITES } from './mammalSprites'

// Mirrors game.ts's Stage type (not imported directly, to avoid pulling the
// whole game/career module into this leaf component) — callers pass a
// monster's current life stage when known; omit it to default to adult.
type Stage = 'Baby' | 'Teen' | 'Fully Grown' | 'Elder' | 'Retiree'

export function Sprite({ species, size = 96, stage }: { species: Species; size?: number; stage?: Stage }) {
  const genericPal = useMemo(() => palette(hashString(species.id) % 360), [species.id])
  const speciesStages = SPECIES_SPRITES[species.id]
  // Species with their own art also carry their own real colour palette
  // (a lion is gold, an ox is brown with pale horns, etc.) instead of the
  // generic hue-rotated one every other body type still uses.
  const pal = SPECIES_PALETTE[species.id] ?? genericPal
  const stageKey: LifeStage = stage === 'Baby' ? 'child' : stage === 'Teen' ? 'teen' : 'adult'
  const grid = speciesStages ? speciesStages[stageKey] : SPRITES[species.body]
  const isElder = stage === 'Elder' || stage === 'Retiree'
  const gridSize = grid.length
  const u = size / gridSize
  const cells: JSX.Element[] = []
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      cells.push(<rect key={y * gridSize + x} x={x * u} y={y * u} width={u} height={u} fill={pal[ch]} />)
    }
  })
  return (
    <svg
      width={size} height={size}
      style={{
        imageRendering: 'pixelated', background: '#0c0e15', borderRadius: 8, border: '1px solid var(--line)',
        filter: isElder && speciesStages ? 'grayscale(0.55) brightness(0.75) saturate(0.6)' : undefined,
      }}
    >
      {cells}
    </svg>
  )
}
