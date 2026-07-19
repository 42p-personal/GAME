// Pixel-art sprite: the species' body-type silhouette, tinted by a per-species hue.
import { useMemo } from 'react'
import { Species, hashString } from './core'
import { SPRITES, palette } from './sprites'

export function Sprite({ species, size = 96 }: { species: Species; size?: number }) {
  const pal = useMemo(() => palette(hashString(species.id) % 360), [species.id])
  const grid = SPRITES[species.body]
  const u = size / 16
  const cells: JSX.Element[] = []
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      cells.push(<rect key={y * 16 + x} x={x * u} y={y * u} width={u} height={u} fill={pal[ch]} />)
    }
  })
  return (
    <svg width={size} height={size} style={{ imageRendering: 'pixelated', background: '#0c0e15', borderRadius: 8, border: '1px solid var(--line)' }}>
      {cells}
    </svg>
  )
}
