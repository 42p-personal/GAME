import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import {
  BODY_ELEMENT, BodyType, Element, FOODS, LEAGUES, Monster, STATS, Stat, Species, feedDelta,
  happinessMultiplier, hashString, mulberry32,
} from './core'
import { generateMonster, manaCost, maxHp, maxMana } from './monster'
import { BattleResult, simulateBattle } from './battle'
import { SPRITES, palette } from './sprites'
import { SPECIES, bodySignature } from './species'
import { BIOS } from './bestiary'
import { BASIC_DRILLS, Drill, INTENSIVE_DRILLS } from './drills'
import {
  MAX_STAMINA, canRankUp, careerMonster, dateLabel, foodName, rankUpFee, stageInfo, trainingProfileFor,
} from './game'
import {
  BULK_FOOD_COST, ELITE_LICENSE_COST, FUSION_COST, GameState, RENTAL_PER_FROZEN, SPECIAL_LICENSE_COST,
  TOURNAMENT_CALENDAR, WeekPlanEntry, advanceWeek, barnCost, buyBulkFood, buyEliteLicense, buyMonster,
  buySpecialLicense, freeze, fuse, fusionRoom, goto, monthOfWeek, newGame, offerMonster, promoteMonster,
  thaw, upgradeBarn,
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
            <div className="md">{mv.desc} {mv.status ? `(${mv.status.kind})` : ''} · {manaCost(mv)} MP · cd {mv.cooldown} · acc {mv.accuracy}</div>
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

// Expandable codex of all species, grouped by body type. Exclusive body types
// stay locked (name only) until the matching breeding license is owned.
function Bestiary({ specialLicense, eliteLicense }: { specialLicense: boolean; eliteLicense: boolean }) {
  const groups: { bt: BodyType; locked: boolean; licenseName: string }[] = [
    { bt: 'Mammal', locked: false, licenseName: '' },
    { bt: 'Avian', locked: false, licenseName: '' },
    { bt: 'Marsupial', locked: false, licenseName: '' },
    { bt: 'Aquatic', locked: false, licenseName: '' },
    { bt: 'Insectoid', locked: false, licenseName: '' },
    { bt: 'Reptilian', locked: false, licenseName: '' },
    { bt: 'Draconic', locked: !specialLicense, licenseName: 'Special Breeding License' },
    { bt: 'Abyssal', locked: !specialLicense, licenseName: 'Special Breeding License' },
    { bt: 'Mythical', locked: !eliteLicense, licenseName: 'Elite Breeding License' },
  ]
  return (
    <details className="bestiary">
      <summary>📖 Bestiary — {SPECIES.length} monsters</summary>
      <div className="bestbody">
        {groups.map(({ bt, locked, licenseName }) => (
          <div className="bestgroup" key={bt}>
            <div className="bestgroup-h">
              {bt} · resist {ELEMENT_ICON[BODY_ELEMENT[bt].resist]} · weak {ELEMENT_ICON[BODY_ELEMENT[bt].weak]}
            </div>
            {locked
              ? <div className="dim bsmall">🔒 {SPECIES.filter((s) => s.body === bt).length} species — unlock with the {licenseName}.</div>
              : SPECIES.filter((s) => s.body === bt).map((s) => (
                <details className="bestrow" key={s.id}>
                  <summary>
                    <Sprite species={s} size={36} />
                    <span className="bn">{s.name}</span>
                    <span className="dim">· {s.naturalClass} · ★ {s.ultimate.name}</span>
                  </summary>
                  <p className="bio">{BIOS[s.id] ?? s.flavour}</p>
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
          <div className="loc-h"><span>🛒 Market</span></div>
          <div className="hint">3 random monsters · prices swing wider than food (±60%).{barnFull ? ' Stable full — upgrade a barn to buy.' : ''}</div>
          <div className="offers">
            {game.market.length === 0 && <div className="dim">Sold out — market refreshes at the start of each month.</div>}
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
const drillLabel = (d: Drill) =>
  Object.entries(d.gains).map(([st, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${st}`).join(' ')

function RanchView({ game, setGame }: { game: GameState; setGame: Dispatch<SetStateAction<GameState>> }) {
  const [phase, setPhase] = useState<'decisions' | 'review'>('decisions')
  const [decisionIdx, setDecisionIdx] = useState(0)
  const [weekPlan, setWeekPlan] = useState<Record<string, WeekPlanEntry>>({})
  const [calendarMonth, setCalendarMonth] = useState(() => monthOfWeek(game.week))

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
  const currentPlan: WeekPlanEntry = weekPlan[currentCareer.id] || { activity: 'rest', food: '' }
  const prof = trainingProfileFor(currentCareer.species)

  // Selecting an activity or food only records the plan — advancing to the next
  // monster is always an explicit button press, so both can be chosen in any order.
  const setActivity = (activity: string) =>
    setWeekPlan((wp) => ({ ...wp, [currentCareer.id]: { ...currentPlan, activity } }))
  const advanceDecision = () => {
    setWeekPlan((wp) => ({ ...wp, [currentCareer.id]: currentPlan }))
    if (decisionIdx < game.stable.length - 1) setDecisionIdx((i) => i + 1)
    else setPhase('review')
  }

  if (phase === 'decisions') {
    return (
      <>
        <div className="ranchtop">
          <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>🏛 Town</button>
          <span>📅 {dateLabel(game.week)}</span>
          <span>🪙 {game.gold}g</span>
          <span>Monster {decisionIdx + 1}/{game.stable.length}</span>
          {decisionIdx > 0 && <button className="ghost" onClick={() => setDecisionIdx((i) => i - 1)}>← Previous</button>}
        </div>
        <p className="sub">Choose an activity &amp; food for {currentCareer.name}.</p>

        <div className="career">
          <div className="card">
            <div className="careerbar">
              <span>📅 {dateLabel(game.week)}</span>
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
              <>
                <div className="retired">🏁 {currentCareer.name} has retired and can no longer compete.</div>
                <div className="carerow" style={{ marginTop: '1rem' }}>
                  <button className="enter" onClick={advanceDecision}>
                    {decisionIdx < game.stable.length - 1 ? 'Next Monster →' : 'Continue to Review →'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {canRankUp(currentCareer) && (
                  <div className="carerow">
                    <button className="rankup" disabled={game.gold < rankUpFee(currentCareer)}
                      onClick={() => setGame((g) => promoteMonster(g, currentCareer.id))}>
                      ⭐ Rank-up trial · {rankUpFee(currentCareer)}g → {LEAGUES[currentCareer.licenseIndex + 1].name} league
                    </button>
                  </div>
                )}

                <div className="section-title">Activity — rest, go exploring, or train a drill</div>
                <div className="hint">
                  Aptitude: trains {prof.primary} fastest (+20%), {prof.secondary} well (+10%), {prof.weakness} poorly (−20%).
                  Low stamina weakens gains.
                </div>
                <div className="carerow">
                  <button className={currentPlan.activity === 'rest' ? 'selected' : ''} onClick={() => setActivity('rest')}>😴 Rest (+stamina)</button>
                  <button className={currentPlan.activity === 'excursion' ? 'selected' : ''} onClick={() => setActivity('excursion')}>🧭 Excursion (−25 stamina, finds gold)</button>
                </div>

                <div className="section-title">Basic drills — one stat, −10 stamina</div>
                <div className="foods">
                  {BASIC_DRILLS.map((d) => (
                    <button key={d.id} className={`food ${currentPlan.activity === d.id ? 'selected' : ''}`}
                      onClick={() => setActivity(d.id)} title={d.desc}>
                      {d.name}{currentPlan.activity === d.id ? ' ✓' : ''} · {drillLabel(d)}
                    </button>
                  ))}
                </div>

                <div className="section-title">Intensive drills — bigger gains, a cost, −25 stamina</div>
                <div className="foods">
                  {INTENSIVE_DRILLS.map((d) => (
                    <button key={d.id} className={`food ${currentPlan.activity === d.id ? 'selected' : ''}`}
                      onClick={() => setActivity(d.id)} title={d.desc}>
                      {d.name}{currentPlan.activity === d.id ? ' ✓' : ''} · {drillLabel(d)}
                    </button>
                  ))}
                </div>

                <div className="section-title">Food — buy 1 food this week{game.bulkFood ? ' · 🛒 −20%' : ''}</div>
                <div className="foods">
                  {FOODS.map((f) => {
                    const price = Math.max(1, Math.round(game.foodMarket[f.id] * discount))
                    const d = feedDelta(f.id, currentCareer.favouriteFood, currentCareer.hatedFood)
                    const afford = game.gold >= price
                    const selected = currentPlan.food === f.id
                    return (
                      <button key={f.id} className={`food ${selected ? 'selected' : ''}`} disabled={!afford}
                        onClick={() => setWeekPlan((wp) => ({ ...wp, [currentCareer.id]: { ...currentPlan, food: selected ? '' : f.id } }))}
                        title={d > 0 ? 'favourite (+1 happiness)' : d < 0 ? 'hated (−1 happiness)' : 'neutral'}>
                        {foodName(f.id)}{selected ? ' ✓' : ''} · {price}g{d > 0 ? ' ♥' : d < 0 ? ' ✖' : ''}
                      </button>
                    )
                  })}
                </div>

                <div className="carerow" style={{ marginTop: '1rem' }}>
                  <button className="enter" onClick={advanceDecision}>
                    {decisionIdx < game.stable.length - 1 ? 'Next Monster →' : 'Continue to Review →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  // Review phase
  const currentMonth = monthOfWeek(game.week)
  const tournamentsThisMonth = TOURNAMENT_CALENDAR.filter((t) => t.month === calendarMonth)
  const activityName = (p?: WeekPlanEntry) => {
    if (!p) return '—'
    if (p.activity === 'rest') return '😴 Rest'
    if (p.activity === 'excursion') return '🧭 Excursion'
    const d = [...BASIC_DRILLS, ...INTENSIVE_DRILLS].find((x) => x.id === p.activity)
    return d ? `💪 ${d.name}` : p.activity
  }

  return (
    <>
      <div className="ranchtop">
        <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>🏛 Town</button>
        <span>📅 {dateLabel(game.week)}</span>
        <span>🪙 {game.gold}g</span>
        <button className="ghost" onClick={() => { setDecisionIdx(0); setPhase('decisions') }}>← Back</button>
      </div>
      <p className="sub">Review decisions before advancing. Check the tournament calendar, or return to town.</p>

      <div className="townmap" style={{ gap: '1rem' }}>
        {/* This week's plan */}
        <div className="card loc">
          <div className="loc-h"><span>📋 This week's plan</span></div>
          <div className="labrows">
            {game.stable.map((c) => {
              const p = weekPlan[c.id]
              return (
                <div className="labrow" key={c.id}>
                  <Sprite species={c.species} size={28} />
                  <span className="bn">{c.name}</span>
                  <span className="dim">
                    {c.retired ? '🏁 Retired' : activityName(p)}{p?.food ? ` · 🍽 ${foodName(p.food)}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Calendar */}
        <div className="card loc">
          <div className="loc-h">
            <span>📅 Tournament Calendar</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ghost" onClick={() => setCalendarMonth((mo) => mo === 1 ? 12 : mo - 1)}>◀</button>
              <span>Month {calendarMonth}{calendarMonth === currentMonth ? ' · now' : ''}</span>
              <button className="ghost" onClick={() => setCalendarMonth((mo) => mo === 12 ? 1 : mo + 1)}>▶</button>
            </div>
          </div>
          <div className="hint">Tournaments this month: {tournamentsThisMonth.length}</div>
          {tournamentsThisMonth.map((t) => {
            const eligible = game.stable.some((c) => !c.retired && LEAGUES[c.licenseIndex].name === t.league)
            return (
              <div key={t.id} className="offer" style={{ padding: '0.5rem', borderBottom: '1px solid var(--line)' }}>
                <div><b>{t.name}</b> — {t.league} league</div>
                <div className="dim">Rewards: {t.rewards.gold}g, {t.rewards.exp} exp</div>
                {!eligible && <div className="dim">Requires a {t.league}-league monster.</div>}
                <button className="enter" disabled title="Tournament battles arrive in the next update">Sign Up →</button>
              </div>
            )
          })}
        </div>

        {/* Proceed */}
        <div className="card loc">
          <div className="loc-h"><span>⏭️ Advance Week</span></div>
          <div className="hint">Feeding resolves first at this week's prices, then each monster's activity. The market restocks monthly.</div>
          <button className="enter" onClick={() => {
            setGame((g) => advanceWeek(g, weekPlan))
            setCalendarMonth(monthOfWeek(game.week + 1))
            setWeekPlan({})
            setDecisionIdx(0)
            setPhase('decisions')
          }}>⏭ Proceed to Next Week</button>
        </div>
      </div>
    </>
  )
}

// --- Persistence: the whole GameState is plain JSON, saved on every change ---
const SAVE_KEY = 'monster-tamer-save-v1'
const randomSeed = () => Math.random().toString(36).slice(2, 8)

function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    // sanity-check the save shape (older/foreign saves start fresh)
    if (typeof g?.week !== 'number' || !Array.isArray(g?.stable) || typeof g?.foodMarket !== 'object') return null
    return g as GameState
  } catch {
    return null
  }
}

export function App() {
  const [view, setView] = useState<'game' | 'sandbox'>('game')
  const [game, setGame] = useState<GameState>(() => loadSavedGame() ?? newGame(randomSeed()))

  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)) } catch { /* storage full/unavailable — play on */ }
  }, [game])

  return (
    <div className="app">
      <h1>Monster Tamer <span className="tag">/ prototype</span></h1>
      <div className="tabs">
        <button className={'tab' + (view === 'game' ? ' on' : '')} onClick={() => setView('game')}>🎮 Game</button>
        <button className={'tab' + (view === 'sandbox' ? ' on' : '')} onClick={() => setView('sandbox')}>⚔️ Sandbox</button>
        <button className="tab" onClick={() => {
          if (window.confirm('Start a new game? Current progress will be lost.')) setGame(newGame(randomSeed()))
        }}>✨ New Game</button>
      </div>
      {view === 'game'
        ? (game.area === 'town'
          ? <TownView game={game} setGame={setGame} />
          : <RanchView game={game} setGame={setGame} />)
        : <SandboxView />}
      <Bestiary specialLicense={game.specialLicense} eliteLicense={game.eliteLicense} />
    </div>
  )
}
