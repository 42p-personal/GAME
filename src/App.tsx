import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import {
  BODY_ELEMENT, BodyType, Element, FOODS, Monster, STATS, Stat, Species, bodySignature, feedDelta,
  happinessMultiplier, hashString, mulberry32,
} from './core'
import { generateMonster, maxHp, maxMana } from './monster'
import { BattleResult, simulateBattle } from './battle'
import { SPRITES, palette } from './sprites'
import { SPECIES } from './species'
import { BIOS } from './bestiary'
import {
  MAX_STAMINA, WeeklyAction, applyWeek, careerMonster, dateLabel, foodName, stageInfo,
} from './game'
import {
  FUSION_COST, GameState, RENTAL_PER_FROZEN, barnCost, buyBulkFood, buyMonster, buySpecialLicense, buyEliteLicense,
  feed, freeze, fuse, fusionRoom, goto, newGame, offerMonster, refreshMarket,
  thaw, upgradeBarn, BULK_FOOD_COST, SPECIAL_LICENSE_COST, ELITE_LICENSE_COST, TOURNAMENT_CALENDAR,
} from './town'

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
  const feedLocal = (food: (typeof FOODS)[number]['id']) =>
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
              <button key={f.id} className="food" onClick={() => feedLocal(f.id)} title={`${f.price}g · ${d > 0 ? 'favourite (+1)' : d < 0 ? 'hated (−1)' : 'neutral'}`}>
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

// Reveals the battle log turn-by-turn (~1.5s per action) so the fight plays out
// like a match you're watching, even though the sim is resolved instantly.
function BattleReplay({ result, onClear }: { result: BattleResult; onClear: () => void }) {
  const [revealed, setRevealed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const done = revealed >= result.log.length

  useEffect(() => {
    if (done) return
    const line = result.log[revealed]
    const isTurn = / uses |^🏆|^🏳️/.test(line) // an action (or the finale) = a beat
    const t = setTimeout(() => setRevealed((r) => r + 1), isTurn ? 1500 : 300)
    return () => clearTimeout(t)
  }, [result, revealed, done])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [revealed])

  return (
    <>
      <div className="battlebar">
        {!done && <button className="ghost" onClick={() => setRevealed(result.log.length)}>skip ⏭</button>}
        <button className="ghost" onClick={onClear}>clear</button>
      </div>
      {done && <div className="result">{result.winner === 'draw' ? 'Draw!' : `🏆 ${result.winnerName} wins`}</div>}
      <div className="log" ref={logRef}>
        {result.log.slice(0, revealed).map((line, i) => (
          <div key={i} className={line.startsWith('🏆') || line.startsWith('🏳️') ? 'win' : ''}>{line}</div>
        ))}
      </div>
    </>
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

  const [result, setResult] = useState<BattleResult | null>(null)
  const [battleKey, setBattleKey] = useState(0)
  const runBattle = () => {
    setResult(simulateBattle(monA, monB, happyA, happyB))
    setBattleKey((k) => k + 1)
  }

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
      </div>

      {result && <BattleReplay key={battleKey} result={result} onClear={() => setResult(null)} />}
    </>
  )
}

// ============================ Town hub (§13) ============================
function TownView({ game, setGame }: { game: GameState; setGame: Dispatch<SetStateAction<GameState>> }) {
  const [fuseA, setFuseA] = useState('')
  const [fuseB, setFuseB] = useState('')
  const barnFull = game.stable.length >= game.barnCapacity

  return (
    <>
      <p className="sub">Town — your hub. Buy monsters at the Market, bank &amp; combine genomes at the Lab, upgrade at the Ranch Shop, then head to the Ranch to raise your active monster.</p>

      <div className="townbar">
        <span>🪙 {game.gold}g</span>
        <span>🏠 Stable {game.stable.length}/{game.barnCapacity}</span>
        <span>❄️ Frozen {game.frozen.length}</span>
        {game.bulkFood && <span className="up">🛒 Bulk food</span>}
      </div>

      <div className="townmap">
        {/* Market */}
        <div className="card loc">
          <div className="loc-h"><span>🛒 Market</span><button className="ghost" onClick={() => setGame((g) => refreshMarket(g))}>↻ Refresh</button></div>
          <div className="hint">3 random monsters · prices swing wider than food (±60%).{barnFull ? ' Stable full — upgrade a barn to buy.' : ''}</div>
          <div className="offers">
            {game.market.length === 0 && <div className="dim">Sold out — refresh for a new lineup.</div>}
            {game.market.map((o, i) => {
              const m = offerMonster(o)
              const afford = game.gold >= o.price
              return (
                <div className="offer" key={o.seed}>
                  <MonsterCard m={m} />
                  <button disabled={!afford || barnFull} onClick={() => setGame((g) => buyMonster(g, i))}>
                    Buy · {o.price}g
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Lab */}
        <div className="card loc">
          <div className="loc-h"><span>🧪 Lab</span><span className="dim">upkeep {RENTAL_PER_FROZEN}g/wk each</span></div>
          <div className="section-title">Freeze (bank a genome)</div>
          <div className="labrows">
            {game.stable.length === 0 && <div className="dim">No monsters in the stable.</div>}
            {game.stable.map((c) => (
              <div className="labrow" key={c.id}>
                <Sprite species={c.species} size={28} />
                <span className="bn">{c.name}</span>
                <span className="dim">{c.species.name}</span>
                <button className="ghost" onClick={() => setGame((g) => freeze(g, c.id))}>Freeze ❄️</button>
              </div>
            ))}
          </div>
          <div className="section-title">Thaw</div>
          <div className="labrows">
            {game.frozen.length === 0 && <div className="dim">No frozen genomes.</div>}
            {game.frozen.map((f) => (
              <div className="labrow" key={f.id}>
                <Sprite species={f.species} size={28} />
                <span className="bn">{f.name}</span>
                <span className="dim">{f.species.name}</span>
                <button className="ghost" disabled={barnFull} onClick={() => setGame((g) => thaw(g, f.id))}>Thaw</button>
              </div>
            ))}
          </div>
          <div className="section-title">Fuse (combine two frozen → baby)</div>
          <div className="fuserow">
            <select value={fuseA} onChange={(e) => setFuseA(e.target.value)}>
              <option value="">— parent A —</option>
              {game.frozen.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.species.name})</option>)}
            </select>
            <select value={fuseB} onChange={(e) => setFuseB(e.target.value)}>
              <option value="">— parent B —</option>
              {game.frozen.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.species.name})</option>)}
            </select>
            <button
              className="rankup"
              disabled={!fuseA || !fuseB || fuseA === fuseB || game.gold < FUSION_COST || !fusionRoom(game)}
              onClick={() => { setGame((g) => fuse(g, fuseA, fuseB)); setFuseA(''); setFuseB('') }}
            >
              Fuse · {FUSION_COST}g
            </button>
          </div>
          <div className="hint">Baby inherits the average of both parents minus a small penalty, and starts unlicensed.</div>
        </div>

        {/* Ranch */}
        <div className="card loc">
          <div className="loc-h"><span>🐄 Ranch</span></div>
          <div className="hint">Raise your active monster week by week — train, feed, rest, rank up.</div>
          <button className="enter" disabled={game.stable.length === 0} onClick={() => setGame((g) => goto(g, 'ranch'))}>Enter the Ranch →</button>
          {game.stable.length === 0 && <div className="dim">Buy a monster first.</div>}
        </div>

        {/* Ranch Shop */}
        <div className="card loc">
          <div className="loc-h"><span>🏗️ Ranch Shop</span></div>
          <div className="shoprow">
            <div>
              <b>Bigger Barn</b>
              <div className="dim">Capacity {game.barnCapacity} → {game.barnCapacity + 1}</div>
            </div>
            <button disabled={game.gold < barnCost(game)} onClick={() => setGame((g) => upgradeBarn(g))}>Buy · {barnCost(game)}g</button>
          </div>
          <div className="shoprow">
            <div>
              <b>Bulk Food Contract</b>
              <div className="dim">{game.bulkFood ? 'Owned — 20% off food.' : 'Permanent 20% off all food.'}</div>
            </div>
            <button disabled={game.bulkFood || game.gold < BULK_FOOD_COST} onClick={() => setGame((g) => buyBulkFood(g))}>
              {game.bulkFood ? '✓ Owned' : `Buy · ${BULK_FOOD_COST}g`}
            </button>
          </div>
          <div className="shoprow">
            <div>
              <b>Special Breeding License</b>
              <div className="dim">{game.specialLicense ? '✓ Unlocked Draconic & Abyssal' : 'Requires Silver league'}</div>
            </div>
            <button disabled={game.specialLicense || game.gold < SPECIAL_LICENSE_COST} onClick={() => setGame((g) => buySpecialLicense(g))}>
              {game.specialLicense ? '✓ Owned' : `Buy · ${SPECIAL_LICENSE_COST}g`}
            </button>
          </div>
          <div className="shoprow">
            <div>
              <b>Elite Breeding License</b>
              <div className="dim">{game.eliteLicense ? '✓ Unlocked Mythical' : 'Requires Masters league'}</div>
            </div>
            <button disabled={game.eliteLicense || game.gold < ELITE_LICENSE_COST} onClick={() => setGame((g) => buyEliteLicense(g))}>
              {game.eliteLicense ? '✓ Owned' : `Buy · ${ELITE_LICENSE_COST}g`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================ Ranch (raising loop) ============================
interface WeekPlanEntry { trainingType: 'weak' | 'strong' | 'rest'; food: (typeof FOODS)[number]['id'] | '' }

function RanchView({ game, setGame }: { game: GameState; setGame: Dispatch<SetStateAction<GameState>> }) {
  const [phase, setPhase] = useState<'decisions' | 'review' | 'summary'>('decisions')
  const [decisionIdx, setDecisionIdx] = useState(0)
  const [weekPlan, setWeekPlan] = useState<Record<string, WeekPlanEntry>>({})
  const [calendarMonth, setCalendarMonth] = useState(1)

  if (game.stable.length === 0) {
    return (
      <>
        <div className="ranchtop">
          <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>🏛 Town</button>
        </div>
        <p className="sub">Your stable is empty. Head to Town → Market to buy a monster.</p>
      </>
    )
  }

  const currentCareer = game.stable[decisionIdx]
  const m = careerMonster(currentCareer)
  const st = stageInfo(currentCareer.ageWeeks, currentCareer.species.lifespan)
  const discount = game.bulkFood ? 0.8 : 1
  const currentPlan = weekPlan[currentCareer.id] || { trainingType: 'rest', food: '' }

  const handleSetDecision = (trainingType: 'weak' | 'strong' | 'rest', food: (typeof FOODS)[number]['id'] | '') => {
    setWeekPlan((wp) => ({ ...wp, [currentCareer.id]: { trainingType, food } }))
    if (decisionIdx < game.stable.length - 1) {
      setDecisionIdx((i) => i + 1)
    } else {
      setPhase('review')
    }
  }

  if (phase === 'decisions') {
    return (
      <>
        <div className="ranchtop">
          <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>🏛 Town</button>
          <span>🪙 {game.gold}g</span>
          <span>Monster {decisionIdx + 1}/{game.stable.length}</span>
        </div>
        <p className="sub">Week {dateLabel(currentCareer.week)} — Choose training &amp; food for {currentCareer.name}.</p>

        <div className="career">
          <div className="card">
            <div className="careerbar">
              <span>📅 {dateLabel(currentCareer.week)}</span>
              <span>{st.stage} · age {st.ageYears}y / {currentCareer.species.lifespan}y</span>
            </div>
            <div className="meters">
              <div className="meter"><label>Stamina {currentCareer.stamina}/{MAX_STAMINA}</label><div className="bar"><i style={{ width: `${currentCareer.stamina}%`, background: 'var(--dex)' }} /></div></div>
              <div className="meter"><label>Happiness {currentCareer.happiness}/10</label><div className="bar"><i style={{ width: `${currentCareer.happiness * 10}%`, background: 'var(--cha)' }} /></div></div>
            </div>
            <MonsterCard m={m} />
          </div>

          <div className="card actions">
            {currentCareer.retired ? (
              <div className="retired">🏁 {currentCareer.name} has retired and can no longer compete.</div>
            ) : (
              <>
                <div className="section-title">Training — choose weak or strong training, or rest</div>
                <div className="carerow">
                  <button className={currentPlan.trainingType === 'weak' ? 'selected' : ''} onClick={() => handleSetDecision('weak', currentPlan.food)}>💪 Weak Training (−10% stamina)</button>
                  <button className={currentPlan.trainingType === 'strong' ? 'selected' : ''} onClick={() => handleSetDecision('strong', currentPlan.food)}>🔥 Strong Training (−25% stamina)</button>
                  <button className={currentPlan.trainingType === 'rest' ? 'selected' : ''} onClick={() => handleSetDecision('rest', currentPlan.food)}>😴 Rest (+stamina)</button>
                </div>

                <div className="section-title">Food — buy 1 food this week{game.bulkFood ? ' · 🛒 −20%' : ''}</div>
                <div className="foods">
                  {FOODS.map((f) => {
                    const price = Math.max(1, Math.round(currentCareer.market[f.id] * discount))
                    const d = feedDelta(f.id, currentCareer.favouriteFood, currentCareer.hatedFood)
                    const afford = game.gold >= price
                    const selected = currentPlan.food === f.id
                    return (
                      <button key={f.id} className={`food ${selected ? 'selected' : ''}`} disabled={!afford}
                        onClick={() => setWeekPlan((wp) => ({ ...wp, [currentCareer.id]: { ...currentPlan, food: selected ? '' : f.id } }))}
                        title={d > 0 ? 'favourite (+1 happiness)' : d < 0 ? 'hated (−1 happiness)' : 'neutral'}>
                        {foodName(f.id)}{currentPlan.food === f.id ? ' ✓' : ''} · {price}g{d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}
                      </button>
                    )
                  })}
                </div>

                <div className="carerow" style={{ marginTop: '1rem' }}>
                  {decisionIdx < game.stable.length - 1 ? (
                    <button className="enter" onClick={() => handleSetDecision(currentPlan.trainingType, currentPlan.food)}>Next Monster →</button>
                  ) : (
                    <button className="enter" onClick={() => handleSetDecision(currentPlan.trainingType, currentPlan.food)}>Continue to Review →</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  // Review phase
  const tournamentsThisMonth = TOURNAMENT_CALENDAR.filter((t) => t.month === calendarMonth)

  return (
    <>
      <div className="ranchtop">
        <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>🏛 Town</button>
        <span>🪙 {game.gold}g</span>
        <button className="ghost" onClick={() => setPhase('decisions')}>← Back</button>
      </div>
      <p className="sub">Review decisions before advancing. Inspect abilities, check tournaments, or return to town.</p>

      <div className="townmap" style={{ gap: '1rem' }}>
        {/* Abilities inspect */}
        <div className="card loc">
          <div className="loc-h"><span>⚔️ Abilities</span></div>
          <div className="hint">Manage active abilities (coming soon)</div>
        </div>

        {/* Calendar */}
        <div className="card loc">
          <div className="loc-h">
            <span>📅 Tournament Calendar</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ghost" onClick={() => setCalendarMonth((m) => m === 1 ? 12 : m - 1)}>◀</button>
              <span>Month {calendarMonth}</span>
              <button className="ghost" onClick={() => setCalendarMonth((m) => m === 12 ? 1 : m + 1)}>▶</button>
            </div>
          </div>
          <div className="hint">Tournaments this month: {tournamentsThisMonth.length}</div>
          {tournamentsThisMonth.map((t) => (
            <div key={t.id} className="offer" style={{ padding: '0.5rem', borderBottom: '1px solid var(--line)' }}>
              <div><b>{t.name}</b> — {t.league} league</div>
              <div className="dim">Rewards: {t.rewards.gold}g, {t.rewards.exp} exp</div>
              <button className="enter">Sign Up →</button>
            </div>
          ))}
        </div>

        {/* Proceed */}
        <div className="card loc">
          <div className="loc-h"><span>⏭️ Advance Week</span></div>
          <div className="hint">Decisions locked in. Ready to advance?</div>
          <button className="enter" onClick={() => {
            // Apply all week actions to each monster, then feed them (if selected).
            // Important: we apply actions directly to each monster without calling weekAction,
            // which would age all monsters multiple times.
            let newGame = { ...game, stable: [...game.stable] }
            const rental = game.frozen.length * RENTAL_PER_FROZEN
            let totalGold = game.gold

            for (let i = 0; i < newGame.stable.length; i++) {
              const c = newGame.stable[i]
              const plan = weekPlan[c.id]
              if (!c.retired && plan) {
                const action: WeeklyAction = plan.trainingType === 'rest'
                  ? { kind: 'rest' }
                  : { kind: 'train', trainType: plan.trainingType as 'weak' | 'strong' }
                const { c: updated, gold } = applyWeek(c, action, totalGold, rental)
                totalGold = gold
                newGame.stable[i] = updated
              }
            }

            // Feed selected monsters
            for (let i = 0; i < newGame.stable.length; i++) {
              const c = newGame.stable[i]
              const plan = weekPlan[c.id]
              if (plan && plan.food) {
                const feedGame = feed({ ...newGame, stable: newGame.stable, gold: totalGold }, plan.food)
                newGame = feedGame
                totalGold = feedGame.gold
              }
            }

            setGame({ ...newGame, gold: totalGold })
            setWeekPlan({})
            setDecisionIdx(0)
            setPhase('decisions')
          }}>⏭ Proceed to Next Week</button>
        </div>
      </div>
    </>
  )
}

export function App() {
  const [view, setView] = useState<'game' | 'sandbox'>('game')
  const [game, setGame] = useState<GameState>(() => newGame('Aki'))
  return (
    <div className="app">
      <h1>Monster Tamer <span className="tag">/ prototype</span></h1>
      <div className="tabs">
        <button className={'tab' + (view === 'game' ? ' on' : '')} onClick={() => setView('game')}>🎮 Game</button>
        <button className={'tab' + (view === 'sandbox' ? ' on' : '')} onClick={() => setView('sandbox')}>⚔️ Sandbox</button>
      </div>
      {view === 'game'
        ? (game.area === 'town'
          ? <TownView game={game} setGame={setGame} />
          : <RanchView game={game} setGame={setGame} />)
        : <SandboxView />}
      <Bestiary />
    </div>
  )
}
