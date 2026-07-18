import { Dispatch, SetStateAction, useMemo, useState } from 'react'
import {
  BODY_ELEMENT, BodyType, Element, FOODS, Monster, STATS, Stat, Species, bodySignature, feedDelta,
  happinessMultiplier, hashString, mulberry32,
} from './core'
import { generateMonster, maxHp, maxMana } from './monster'
import { simulateBattle } from './battle'
import { SPRITES, palette } from './sprites'
import { SPECIES } from './species'
import { BIOS } from './bestiary'
import { BASIC_DRILLS, INTENSIVE_DRILLS } from './drills'
import {
  Career, MAX_STAMINA, WeeklyAction, applyWeek, buyFood, canRankUp, careerMonster, dateLabel,
  foodName, newCareer, rankUp, rankUpFee, stageInfo,
} from './game'

const STAT_COLOR: Record<Stat, string> = {
  STR: 'var(--str)', DEX: 'var(--dex)', CON: 'var(--con)',
  WIS: 'var(--wis)', INT: 'var(--int)', CHA: 'var(--cha)',
}
const ELEMENT_ICON: Record<Element, string> = { fire: '🔥', water: '💧', earth: '⛰️', air: '💨' }

// Pixel-art sprite: the species' body-type silhouette, tinted by a per-species hue.
function Sprite({ species, size = 96 }: { species: Species; size?: number }) {
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
        <Sprite species={m.species} />
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

      <div className="afftaste">
        <span>Element: <b className="up">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].resist]} resist</b> · <b className="down">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].weak]} weak</b></span>
        <span>Taste: <b className="up">♥ {m.favouriteFood}</b> · <b className="down">✖ {m.hatedFood}</b></span>
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

function Stable({ label, seed, setSeed, train, setTrain, happiness, setHappiness, m }: {
  label: string; seed: string; setSeed: (s: string) => void
  train: number; setTrain: (n: number) => void
  happiness: number; setHappiness: (n: number) => void; m: Monster
}) {
  const feed = (food: (typeof FOODS)[number]['id']) =>
    setHappiness(Math.max(0, Math.min(10, happiness + feedDelta(food, m.favouriteFood, m.hatedFood))))
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
      <div className="feed">
        <div className="happyrow">
          <span>Happiness {happiness}/10</span>
          <span className="dim">battle dmg ×{happinessMultiplier(happiness).toFixed(2)}</span>
        </div>
        <div className="happybar"><i style={{ width: `${happiness * 10}%` }} /></div>
        <div className="foods">
          {FOODS.map((f) => {
            const d = feedDelta(f.id, m.favouriteFood, m.hatedFood)
            return (
              <button key={f.id} className="food" onClick={() => feed(f.id)} title={`${f.price}g · ${d > 0 ? 'favourite (+1)' : d < 0 ? 'hated (−1)' : 'neutral'}`}>
                {f.name}{d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Expandable codex of all 20 species, grouped by body type.
function Bestiary() {
  const types: BodyType[] = ['Mammal', 'Avian', 'Marsupial', 'Aquatic']
  return (
    <details className="bestiary">
      <summary>📖 Bestiary — {SPECIES.length} monsters</summary>
      <div className="bestbody">
        {types.map((bt) => (
          <div className="bestgroup" key={bt}>
            <div className="bestgroup-h">
              {bt} · resist {ELEMENT_ICON[BODY_ELEMENT[bt].resist]} · weak {ELEMENT_ICON[BODY_ELEMENT[bt].weak]}
            </div>
            {SPECIES.filter((s) => s.body === bt).map((s) => (
              <details className="bestrow" key={s.id}>
                <summary>
                  <Sprite species={s} size={36} />
                  <span className="bn">{s.name}</span>
                  <span className="dim">· {s.naturalClass} · ★ {s.ultimate.name}</span>
                </summary>
                <p className="bio">{BIOS[s.id]}</p>
                <p className="dim bsmall">
                  Innate: {s.innate.map((a) => a.name).join(' · ')} · Lifespan {s.lifespan}y
                </p>
              </details>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

function SandboxView() {
  const [seedA, setSeedA] = useState('Bouldram')
  const [seedB, setSeedB] = useState('Maelurk')
  const [trainA, setTrainA] = useState(300)
  const [trainB, setTrainB] = useState(300)
  const [happyA, setHappyA] = useState(5)
  const [happyB, setHappyB] = useState(5)

  const monA = useMemo(() => generateMonster(seedA, { train: trainA }), [seedA, trainA])
  const monB = useMemo(() => generateMonster(seedB, { train: trainB }), [seedB, trainB])

  const [result, setResult] = useState<ReturnType<typeof simulateBattle> | null>(null)
  const runBattle = () => setResult(simulateBattle(monA, monB, happyA, happyB))

  return (
    <>
      <p className="sub">Type a seed to generate a monster, invest training to unlock moves &amp; its ultimate (at 600), then auto-battle. Same seeds → same monsters &amp; same fight.</p>

      <div className="arena">
        <Stable label="A" seed={seedA} setSeed={setSeedA} train={trainA} setTrain={setTrainA} happiness={happyA} setHappiness={setHappyA} m={monA} />
        <div className="vs">VS</div>
        <Stable label="B" seed={seedB} setSeed={setSeedB} train={trainB} setTrain={setTrainB} happiness={happyB} setHappiness={setHappyB} m={monB} />
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
    </>
  )
}

// Career mode: raise one monster week by week (M2). State is held by App so it
// survives tab switches.
function CareerView({ career, setCareer, seed, setSeed }: {
  career: Career; setCareer: Dispatch<SetStateAction<Career>>
  seed: string; setSeed: Dispatch<SetStateAction<string>>
}) {
  const m = careerMonster(career)
  const st = stageInfo(career.ageWeeks, career.species.lifespan)
  const act = (a: WeeklyAction) => setCareer((c) => applyWeek(c, a))

  return (
    <>
      <p className="sub">Raise a monster week by week — train, rest, feed, or explore. It ages, learns moves, and climbs the leagues; each action advances one week.</p>
      <div className="controls" style={{ maxWidth: 420 }}>
        <input type="text" value={seed} placeholder="starter seed…" onChange={(e) => setSeed(e.target.value)} />
        <button onClick={() => setCareer(newCareer('career-' + seed))}>New career</button>
      </div>

      <div className="career">
        <div className="card">
          <div className="careerbar">
            <span>📅 {dateLabel(career.week)}</span>
            <span>🪙 {career.gold}g</span>
            <span>{st.stage} · age {st.ageYears}y / {career.species.lifespan}y</span>
          </div>
          <div className="meters">
            <div className="meter"><label>Stamina {career.stamina}/{MAX_STAMINA}</label><div className="bar"><i style={{ width: `${career.stamina}%`, background: 'var(--dex)' }} /></div></div>
            <div className="meter"><label>Happiness {career.happiness}/10</label><div className="bar"><i style={{ width: `${career.happiness * 10}%`, background: 'var(--cha)' }} /></div></div>
          </div>
          <MonsterCard m={m} />
        </div>

        <div className="card actions">
          {career.retired ? (
            <div className="retired">🏁 {career.name} has retired and can no longer compete. (Retirement options — sell / freeze / expert trainer / breeding — arrive with M5–M6.) Start a new career to keep playing.</div>
          ) : (
            <>
              <div className="section-title">
                Market — buy 1 food this week{career.fedThisWeek ? ' · ✓ fed' : ''}
              </div>
              <div className="foods">
                {FOODS.map((f) => {
                  const price = career.market[f.id]
                  const d = feedDelta(f.id, career.favouriteFood, career.hatedFood)
                  const afford = career.gold >= price
                  return (
                    <button key={f.id} className="food" disabled={career.fedThisWeek || !afford}
                      onClick={() => setCareer(buyFood(career, f.id))}
                      title={d > 0 ? 'favourite (+1 happiness)' : d < 0 ? 'hated (−1 happiness)' : 'neutral'}>
                      {foodName(f.id)} · {price}g{d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}
                    </button>
                  )
                })}
              </div>
              <div className="hint">Prices fluctuate weekly. Not feeding costs 1 happiness (hunger).</div>
              <div className="section-title">Train — basic (+minor, no downside)</div>
              <div className="drillgrid">
                {BASIC_DRILLS.map((d) => (
                  <button key={d.id} className="drill" onClick={() => act({ kind: 'train', drillId: d.id })} title={d.desc}>{d.name}</button>
                ))}
              </div>
              <div className="section-title">Train — intensive (+major / −minor)</div>
              <div className="drillgrid">
                {INTENSIVE_DRILLS.map((d) => (
                  <button key={d.id} className="drill int" onClick={() => act({ kind: 'train', drillId: d.id })} title={d.desc}>{d.name}</button>
                ))}
              </div>
              <div className="section-title">Care &amp; explore</div>
              <div className="carerow">
                <button onClick={() => act({ kind: 'rest' })}>😴 Rest</button>
                <button onClick={() => act({ kind: 'excursion' })}>🧭 Excursion</button>
                {canRankUp(career) && <button className="rankup" onClick={() => setCareer(rankUp(career))}>⭐ Rank-up ({rankUpFee(career)}g)</button>}
              </div>
            </>
          )}
          <div className="section-title">Journal</div>
          <div className="log careerlog">
            {career.log.slice().reverse().map((line, i) => <div key={i} className={line.startsWith('⭐') || line.startsWith('🏁') ? 'win' : ''}>{line}</div>)}
          </div>
        </div>
      </div>
    </>
  )
}

export function App() {
  const [view, setView] = useState<'career' | 'sandbox'>('career')
  const [careerSeed, setCareerSeed] = useState('Aki')
  const [career, setCareer] = useState<Career>(() => newCareer('career-Aki'))
  return (
    <div className="app">
      <h1>Monster Tamer <span className="tag">/ prototype</span></h1>
      <div className="tabs">
        <button className={'tab' + (view === 'career' ? ' on' : '')} onClick={() => setView('career')}>🎮 Career</button>
        <button className={'tab' + (view === 'sandbox' ? ' on' : '')} onClick={() => setView('sandbox')}>⚔️ Sandbox</button>
      </div>
      {view === 'career'
        ? <CareerView career={career} setCareer={setCareer} seed={careerSeed} setSeed={setCareerSeed} />
        : <SandboxView />}
      <Bestiary />
    </div>
  )
}
