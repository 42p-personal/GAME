import { useMemo, useState } from 'react'
import { Monster, STATS, Stat, bodySignature, hashString, mulberry32 } from './core'
import { generateMonster, maxHp, maxMana } from './monster'
import { simulateBattle } from './battle'
import { SPRITES, palette } from './sprites'

const STAT_COLOR: Record<Stat, string> = {
  STR: 'var(--str)', DEX: 'var(--dex)', CON: 'var(--con)',
  WIS: 'var(--wis)', INT: 'var(--int)', CHA: 'var(--cha)',
}

// Pixel-art sprite: the species' body-type silhouette, tinted by a per-species hue.
function Sprite({ m, size = 96 }: { m: Monster; size?: number }) {
  const pal = useMemo(() => palette(hashString(m.species.id) % 360), [m.species.id])
  const grid = SPRITES[m.species.body]
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

function StatBar({ stat, value, max }: { stat: Stat; value: number; max: number }) {
  return (
    <div className="stat">
      <span>{stat}</span>
      <span className="bar"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: STAT_COLOR[stat] }} /></span>
      <span className="v">{value}</span>
    </div>
  )
}

// Individuality: which stats sit above/below the species' body-type average (§8.4).
function Signature({ m }: { m: Monster }) {
  const sig = bodySignature(m.species.base, m.species.body)
  return (
    <div className="meta sig">
      {sig.above.length > 0 && <span className="up">▲ {sig.above.join(' ')}</span>}
      {sig.below.length > 0 && <span className="down">▼ {sig.below.join(' ')}</span>}
      {!sig.above.length && !sig.below.length && <span>balanced</span>}
      <span className="dim">vs {m.species.body} avg</span>
    </div>
  )
}

function MonsterCard({ m }: { m: Monster }) {
  const barMax = Math.max(100, ...STATS.map((k) => m.stats[k])) * 1.05
  return (
    <div>
      <div className="mhead">
        <Sprite m={m} />
        <div>
          <div className="name">{m.name}</div>
          <div className="meta">{m.species.name} · {m.species.body} · {m.sex === 'M' ? '♂' : '♀'}</div>
          <div className="meta">{m.species.flavour}</div>
          <Signature m={m} />
        </div>
      </div>

      <div className="badges">
        <span className="badge">{m.className}</span>
        <span className="badge">{m.league} league</span>
        <span className="badge">Lifespan {m.species.lifespan}y</span>
        <span className="badge">{maxHp(m.stats)} HP</span>
        <span className="badge">{maxMana(m.stats)} MP</span>
        <span className={'badge' + (m.ultimateUnlocked ? ' on' : '')}>★ {m.species.ultimate.name} {m.ultimateUnlocked ? '' : '(600)'}</span>
      </div>

      {STATS.map((k) => <StatBar key={k} stat={k} value={m.stats[k]} max={barMax} />)}

      <div className="section-title">Innate</div>
      {m.species.innate.map((a) => (
        <div className="ability" key={a.name}>{a.name} — <small>{a.desc}</small></div>
      ))}

      <div className="section-title">Loadout (equipped 3 of {m.learned.length} learned)</div>
      <div className="moves">
        {m.loadout.length === 0 && <div className="md">No moves yet — train a stat past 40.</div>}
        {m.loadout.map((mv) => (
          <div className="move" key={mv.id}>
            <span className="lvl">{mv.stat} {mv.learnLevel}</span>
            <span className="mn">{mv.name}</span>
            <div className="md">{mv.desc} {mv.status ? `(${mv.status.kind})` : ''} · cd {mv.cooldown} · acc {mv.accuracy}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stable({ label, seed, setSeed, train, setTrain, m }: {
  label: string; seed: string; setSeed: (s: string) => void
  train: number; setTrain: (n: number) => void; m: Monster
}) {
  return (
    <div className="card">
      <div className="controls">
        <input type="text" value={seed} placeholder="seed word…" onChange={(e) => setSeed(e.target.value)} />
        <button className="ghost" onClick={() => setSeed(label + '-' + Math.floor(mulberry32(hashString(seed + train))() * 1e6))}>🎲</button>
      </div>
      <div className="slider">
        <label><span>Training invested</span><span>{train} pts · {m.league}</span></label>
        <input type="range" min={0} max={2400} step={20} value={train} onChange={(e) => setTrain(Number(e.target.value))} />
      </div>
      <MonsterCard m={m} />
    </div>
  )
}

export function App() {
  const [seedA, setSeedA] = useState('Bouldram')
  const [seedB, setSeedB] = useState('Maelurk')
  const [trainA, setTrainA] = useState(300)
  const [trainB, setTrainB] = useState(300)

  const monA = useMemo(() => generateMonster(seedA, { train: trainA }), [seedA, trainA])
  const monB = useMemo(() => generateMonster(seedB, { train: trainB }), [seedB, trainB])

  const [result, setResult] = useState<ReturnType<typeof simulateBattle> | null>(null)
  const runBattle = () => setResult(simulateBattle(monA, monB))

  return (
    <div className="app">
      <h1>Monster Tamer <span className="tag">/ prototype</span></h1>
      <p className="sub">Type a seed to generate a monster, invest training to unlock moves &amp; its ultimate (at 600), then auto-battle. Same seeds → same monsters &amp; same fight.</p>

      <div className="arena">
        <Stable label="A" seed={seedA} setSeed={setSeedA} train={trainA} setTrain={setTrainA} m={monA} />
        <div className="vs">VS</div>
        <Stable label="B" seed={seedB} setSeed={setSeedB} train={trainB} setTrain={setTrainB} m={monB} />
      </div>

      <div className="battlebar">
        <button onClick={runBattle}>⚔️ Auto-Battle</button>
        {result && <button className="ghost" onClick={() => setResult(null)}>clear</button>}
      </div>

      {result && (
        <>
          <div className="result">{result.winner === 'draw' ? 'Draw!' : `🏆 ${result.winnerName} wins`}</div>
          <div className="log">
            {result.log.map((line, i) => (
              <div key={i} className={line.startsWith('🏆') || line.startsWith('🏳️') ? 'win' : ''}>{line}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
