import { Dispatch, ReactNode, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import {
  BODY_ELEMENT, BODY_MINOR, BodyType, COMBO_INFO, DEFAULT_TACTICS, Element, FOODS, FoodDef, FoodTier, GAMEPLANS, INNATE_SECONDARY_LEVEL, LEAGUES, MANA_POLICY_INFO, Monster, Move, STATS, Stat,
  TARGET_PRIORITY_INFO, TEMPERAMENT_INFO, Tactics, classForStats,
  feedDelta, frontRowCount, happinessMultiplier, hashString, mulberry32, roleOfClass, rowOfSlot,
} from './core'
import { generateMonster, manaCost, maxHp, maxMana, staminaDamageMult } from './monster'
import { BattleResult, simulateTeamBattle } from './battle'
import { ArenaBattle } from './arena'
import { Sprite } from './Sprite'
import { SPECIES } from './species'
import { BIOS } from './bestiary'
import { BASIC_DRILLS, Drill, INTENSIVE_DRILLS } from './drills'
import {
  BASIC_DRILL_STAMINA, Career, INTENSIVE_DRILL_STAMINA, MAX_STAMINA, canRankUp, careerMonster,
  dateLabel, foodName, FORAGE_STAMINA_COST, FORAGE_HAPPINESS_COST, previewWeekEffects, rankUpFee, stageInfo, trainingProfileFor,
} from './game'
import {
  PANTRY_CONTRACT_COST, GRAND_LARDER_COST, ELITE_LICENSE_COST, EventMatch, EventStanding, FUSION_COST, GameState, PendingEvent, RENTAL_PER_FROZEN, RIVAL_BAND_MIN, SPECIAL_LICENSE_COST,
  WeekPlanEntry, advanceWeek, barnCost, buyPantryContract, buyGrandLarder, buyEliteLicense, buyMonster, foodDiscountFor, resolveEvent,
  buySpecialLicense, cancelSignUp, cupLore, eligibleForTournament, freeze, fuse, fusionRoom, gameplanForRivalTeam, generateRivalTeamsForTournament, goto, healAtInfirmary, infirmaryFee, leagueIndexOf, monthOfWeek,
  RANK_UP_MONTHS, RANK_UP_WEEK, entryFee, isRankUpWeek, placementLabel, scoutFee, teamHasLicensedLeader, teamSizeForLeague,
  trainerXpProgress, trainerBarnBonus, effectiveBarnCap, BREEDING_BONUS,
  firstTeamLeagueIndex, generateRival, newGame, offerMonster, promoteMonster, renameMonster, rewardMultiplier, setActiveInnate, setLoadout, setMarkTarget, setProtectTarget, setTactics, signUp, teamTacticsUnlocked, thaw,
  tournamentCalendarFor, upgradeBarn, visibleLeagueCount, weekOfMonth, yearOfWeek,
} from './town'
import { APP_VERSION } from './version'

const STAT_COLOR: Record<Stat, string> = {
  STR: 'var(--str)', DEX: 'var(--dex)', CON: 'var(--con)',
  WIS: 'var(--wis)', INT: 'var(--int)', CHA: 'var(--cha)',
}
const ELEMENT_ICON: Record<Element, string> = { fire: '🔥', water: '💧', earth: '⛰️', air: '💨' }

function StatBar({ stat, value, max }: { stat: Stat; value: number; max: number }) {
  return (
    <div className="stat">
      <span>{stat}</span>
      <span className="bar"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: STAT_COLOR[stat] }} /></span>
      <span className="v">{value}</span>
    </div>
  )
}


// Training-aptitude marks (2026-07-25): one uniform rendering used everywhere a
// species' growth profile is summarised, so it reads the same on the Market
// card, the Bestiary, and a monster card. Each mark is a coloured arrow + its
// stat, both tinted to that stat's colour. Major = ▲ (large up), minor = ▴
// (small up — a weaker buff), flaw = ▼ (down). The magnitude/word lives in the
// tooltip so the line stays a clean set of same-shaped, same-coloured marks.
const APT_MARK = {
  major: { glyph: '▲', label: 'major aptitude · trains +20% faster' },
  minor: { glyph: '▴', label: 'minor aptitude · trains +10% faster' },
  flaw: { glyph: '▼', label: 'training flaw · trains −20% slower' },
} as const
function AptMark({ kind, stat }: { kind: 'major' | 'minor' | 'flaw'; stat: Stat }) {
  const a = APT_MARK[kind]
  return <span className={'aptmark ' + kind} style={{ color: STAT_COLOR[stat] }} title={`${stat} — ${a.label}`}>{a.glyph}&nbsp;{stat}</span>
}
function AptMarks({ prof }: { prof: { major?: Stat; minor: Stat; flaw?: Stat } }) {
  return (
    <span className="aptmarks">
      {prof.major && <AptMark kind="major" stat={prof.major} />}
      <AptMark kind="minor" stat={prof.minor} />
      {prof.flaw && <AptMark kind="flaw" stat={prof.flaw} />}
    </span>
  )
}

// Training aptitude — same metric the Ranch screen tags stats with, so this
// line always agrees with it.
function Signature({ m }: { m: Monster }) {
  return (
    <div className="meta sig">
      <AptMarks prof={trainingProfileFor(m.species)} />
      <span className="dim">training aptitude</span>
    </div>
  )
}

// Compact effect label for a food button (2026-07-25): the primary effect
// in-line (not tooltip-only), plus a muted `cost` line for the training foods'
// downside. Normal foods show the taste outcome for the current monster.
function foodEffectLabel(f: FoodDef, c: Career): { primary: string; cls: string; cost?: string } {
  if (f.tier === 'normal') {
    const d = feedDelta(f.id, c.favouriteFood, c.hatedFood)
    return d > 0 ? { primary: '♥ favourite · +1', cls: 'pos' } : d < 0 ? { primary: '✖ hated · −1', cls: 'neg' } : { primary: 'neutral', cls: 'dim' }
  }
  if (f.boostStats) return {
    primary: `${f.boostStats.join('·')} +${Math.round((f.boostMult ?? 0) * 100)}%`, cls: 'pos',
    cost: `−${Math.abs(f.happiness ?? 0)} happiness · ${f.stamina} stamina`,
  }
  if (f.rewardMult) return { primary: 'win cup → +50% reward', cls: 'gold' }
  if (f.stamina) return { primary: `+${f.stamina} stamina`, cls: 'pos' }
  if (f.happiness) return { primary: `+${f.happiness} happiness`, cls: 'pos' }
  return { primary: '', cls: 'dim' }
}

// HP → MP → Stamina → Happiness, in that order (user spec 2026-07-19) —
// shared between the feeding screen and the Ranch detail panel so the two
// never drift out of sync. Bars turn amber/red as condition worsens so an
// injured monster reads as injured at a glance, not as a hairline sliver.
const hpBarColor = (frac: number) =>
  frac < 0.25 ? '#ef5350' : frac < 0.6 ? '#ffb74d' : 'linear-gradient(90deg, #43a047, #7cb342)'
const mpBarColor = (frac: number) =>
  frac < 0.25 ? '#ffb74d' : 'linear-gradient(90deg, #1e88e5, #42a5f5)'
// Injured enough to warn about before a fight (also drives strip chips).
const isInjured = (c: Career) => c.hp < maxHp(c.stats) * 0.6 || (maxMana(c.stats) > 0 && c.mp < maxMana(c.stats) * 0.25)

function ConditionMeters({ hp, mp, stamina, happiness, stats }: {
  hp: number; mp: number; stamina: number; happiness: number; stats: Monster['stats']
}) {
  const hpMax = maxHp(stats)
  const mpMax = maxMana(stats)
  const hpFrac = Math.min(hp, hpMax) / hpMax
  const mpFrac = mpMax > 0 ? Math.min(mp, mpMax) / mpMax : 1
  return (
    <div className="detail-meters">
      <div className="meter"><label>HP {Math.min(hp, hpMax)}/{hpMax}{hpFrac < 0.25 ? ' 🩹' : ''}</label><div className="bar"><i style={{ width: `${Math.min(100, hpFrac * 100)}%`, background: hpBarColor(hpFrac) }} /></div></div>
      <div className="meter"><label>MP {Math.min(mp, mpMax)}/{mpMax}</label><div className="bar"><i style={{ width: `${mpFrac * 100}%`, background: mpBarColor(mpFrac) }} /></div></div>
      <div className="meter"><label>Stamina {stamina}/{MAX_STAMINA}</label><div className="bar"><i style={{ width: `${stamina}%`, background: 'var(--dex)' }} /></div></div>
      <div className="meter"><label>Happiness {happiness}/10</label><div className="bar"><i style={{ width: `${happiness * 10}%`, background: 'var(--cha)' }} /></div></div>
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
      </div>

      <div className="afftaste">
        <span>Element: <b className="up">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].resist]} resist</b> · <b className="down">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].weak]} weak</b></span>
        <span>Food preferences: <b className="up">♥ {m.favouriteFood}</b> · <b className="down">✖ {m.hatedFood}</b></span>
      </div>

      {STATS.map((k) => <StatBar key={k} stat={k} value={m.stats[k]} max={barMax} />)}

      <div className="section-title">Innate</div>
      {(() => {
        const a = m.species.innate[m.activeInnate] ?? m.species.innate[0]
        return <div className="ability" key={a.name}>{a.name} — <small>{a.desc}</small></div>
      })()}
      <div className="md dim">
        {m.innateUnlocked ? '2nd choice unlocked — edit abilities to switch.' : `2nd choice unlocks at ${INNATE_SECONDARY_LEVEL} in a stat.`}
      </div>

      <div className="section-title">Loadout (equipped {m.loadout.length} of {m.learned.length} learned)</div>
      <div className="moves">
        {m.loadout.length === 0 && <div className="md">No moves yet — train a stat past 40.</div>}
        {m.loadout.map((mv) => (
          <div className="move" key={mv.id}>
            <span className="lvl">{mv.stat} {mv.learnLevel}</span>
            <span className="mn">{mv.element ? ELEMENT_ICON[mv.element] + ' ' : ''}{mv.name}</span>
            <div className="md">{mv.desc} {mv.status ? `(${mv.status.kind})` : ''} · {manaCost(mv)} MP · cd {mv.cooldown} · acc {mv.accuracy}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Scouting profile (user spec 2026-07-22, reference: the full MonsterCard
// layout) — same shape whether or not you've paid: identity (sprite, name,
// species, element) is always visible since it's plainly on display in the
// bracket already; class + loadout unlock at the 'basic' tier, stats unlock
// at 'full'. Whatever tier hasn't been bought renders as "??" text / a
// locked ">" bar instead of being omitted, so the card never reflows.
function ScoutReport({ m, tier }: { m: Monster; tier: 'basic' | 'full' | undefined }) {
  const knowsKit = tier === 'basic' || tier === 'full'
  const knowsStats = tier === 'full'
  const barMax = Math.max(100, ...STATS.map((k) => m.stats[k])) * 1.05
  return (
    <div className="scoutcard">
      <div className="mhead">
        <Sprite species={m.species} />
        <div>
          <div className="name">{m.name}</div>
          <div className="meta">{m.species.name} · {m.species.body} · {m.sex === 'M' ? '♂' : '♀'}</div>
          <div className="meta">{m.species.flavour}</div>
        </div>
      </div>

      <div className="badges">
        <span className={'badge' + (knowsKit ? '' : ' locked')}>{knowsKit ? m.className : '??'}</span>
        <span className="badge">{m.league} league</span>
        <span className="badge">Lifespan {m.species.lifespan}y</span>
      </div>

      <div className="afftaste">
        <span>Element: <b className="up">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].resist]} resist</b> · <b className="down">{ELEMENT_ICON[BODY_ELEMENT[m.species.body].weak]} weak</b></span>
      </div>

      {STATS.map((k) => knowsStats
        ? <StatBar key={k} stat={k} value={m.stats[k]} max={barMax} />
        : (
          <div className="stat" key={k}>
            <span>{k}</span>
            <span className="bar locked">&gt;</span>
            <span className="v">??</span>
          </div>
        ))}

      <div className="section-title">Loadout</div>
      <div className="moves">
        {knowsKit ? m.loadout.map((mv) => (
          <div className="move" key={mv.id}>
            <span className="lvl">{mv.stat} {mv.learnLevel}</span>
            <span className="mn">{mv.element ? ELEMENT_ICON[mv.element] + ' ' : ''}{mv.name}</span>
            <div className="md">{mv.desc} {mv.status ? `(${mv.status.kind})` : ''} · {manaCost(mv)} MP · cd {mv.cooldown} · acc {mv.accuracy}</div>
          </div>
        )) : <div className="md dim">?? — pay to scout its class &amp; loadout.</div>}
      </div>
    </div>
  )
}

function Stable({ label, seed, setSeed, train, setTrain, happiness, setHappiness, m, onEditAbilities, onRemove }: {
  label: string; seed: string; setSeed: (s: string) => void
  train: number; setTrain: (n: number) => void
  happiness: number; setHappiness: (n: number) => void; m: Monster
  onEditAbilities: () => void; onRemove?: () => void
}) {
  const feedLocal = (food: (typeof FOODS)[number]['id']) =>
    setHappiness(Math.max(0, Math.min(10, happiness + feedDelta(food, m.favouriteFood, m.hatedFood))))
  return (
    <div className="card">
      <div className="controls">
        <input type="text" value={seed} placeholder="seed word…" onChange={(e) => setSeed(e.target.value)} />
        <button className="ghost" onClick={() => setSeed(label + '-' + Math.floor(mulberry32(hashString(seed + train))() * 1e6))}>🎲</button>
        {onRemove && <button className="ghost" title="remove fighter" onClick={onRemove}>✕</button>}
      </div>
      <div className="slider">
        <label><span>Training invested</span><span>{train} pts · {m.league}</span></label>
        <input type="range" min={0} max={2400} step={20} value={train} onChange={(e) => setTrain(Number(e.target.value))} />
      </div>
      <MonsterCard m={m} />
      <button className="detail-actionbtn" style={{ marginTop: 6 }} onClick={onEditAbilities}>⚔ Edit Abilities</button>
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
        {groups.map(({ bt, locked, licenseName }) => {
          const minor = BODY_MINOR[bt]
          return (
          <div className="bestgroup" key={bt}>
            <div className="bestgroup-h">
              {bt}{minor && <> · minor <span style={{ color: STAT_COLOR[minor] }}>{minor}</span></>}
              {' '}· resist {ELEMENT_ICON[BODY_ELEMENT[bt].resist]} · weak {ELEMENT_ICON[BODY_ELEMENT[bt].weak]}
            </div>
            {locked
              ? <div className="dim bsmall">🔒 {SPECIES.filter((s) => s.body === bt).length} species — unlock with the {licenseName}.</div>
              : SPECIES.filter((s) => s.body === bt).map((s) => {
                const prof = trainingProfileFor(s)
                return (
                <details className="bestrow" key={s.id}>
                  <summary>
                    <Sprite species={s} size={36} />
                    <span className="bn">{s.name}</span>
                    <span className="dim">· {s.flavour}</span>
                    <span className="bsmall"><AptMarks prof={prof} /></span>
                  </summary>
                  <p className="bio">{BIOS[s.id] ?? s.flavour}</p>
                  <p className="dim bsmall">
                    Innate: {s.innate.map((a) => a.name).join(' · ')} · Lifespan {s.lifespan}y
                  </p>
                </details>
                )
              })}
          </div>
          )
        })}
      </div>
    </details>
  )
}

// The detailed transcript now lives INSIDE ArenaBattle (collapsible, appears
// once the replay finishes) — this is just the sandbox's clear button.
function BattleLog({ onClear }: { onClear: () => void }) {
  return (
    <div className="battlebar">
      <button className="ghost" onClick={onClear}>clear</button>
    </div>
  )
}

// A sandbox fighter's raising state — enough to regenerate its Monster
// deterministically. `loadout: null` means auto-pick (chooseLoadout inside
// generateMonster); a non-null array is a player-chosen override, same
// slot-swap mechanism as the Ranch's AbilitySelector.
interface FighterSlot { id: number; seed: string; train: number; happiness: number; loadout: string[] | null; activeInnate: number | null; tactics: Tactics | null }
const SANDBOX_MAX_TEAM = 6
const SEED_POOL_A = ['Kongrath', 'Wyna', 'Rex', 'Zeta', 'Ashen', 'Nova']
const SEED_POOL_B = ['Maelurk', 'Ashryn', 'Doom', 'Vex', 'Iris', 'Talon']

function buildSandboxMonster(f: FighterSlot): Monster {
  const m = generateMonster(f.seed, { train: f.train })
  if (f.loadout) {
    const picked = f.loadout.map((mid) => m.learned.find((mv) => mv.id === mid)).filter((mv): mv is Move => !!mv)
    if (picked.length) m.loadout = picked
  }
  if (f.activeInnate != null && (f.activeInnate !== 1 || m.innateUnlocked)) m.activeInnate = f.activeInnate
  if (f.tactics) m.tactics = f.tactics
  return m
}

function SandboxView() {
  const [teamA, setTeamA] = useState<FighterSlot[]>([{ id: 0, seed: SEED_POOL_A[0], train: 300, happiness: 5, loadout: null, activeInnate: null, tactics: null }])
  const [teamB, setTeamB] = useState<FighterSlot[]>([{ id: 1, seed: SEED_POOL_B[0], train: 300, happiness: 5, loadout: null, activeInnate: null, tactics: null }])
  const nextId = useRef(2)
  const [editing, setEditing] = useState<{ side: 'A' | 'B'; id: number } | null>(null)
  const [result, setResult] = useState<BattleResult | null>(null)
  const [battleKey, setBattleKey] = useState(0)

  const teamFor = (side: 'A' | 'B') => (side === 'A' ? teamA : teamB)
  const setTeamFor = (side: 'A' | 'B') => (side === 'A' ? setTeamA : setTeamB)

  const addFighter = (side: 'A' | 'B') => {
    const list = teamFor(side)
    if (list.length >= SANDBOX_MAX_TEAM) return
    const id = nextId.current++
    const pool = side === 'A' ? SEED_POOL_A : SEED_POOL_B
    const seed = pool[list.length] ?? `${side}-${id}`
    setTeamFor(side)((l) => [...l, { id, seed, train: 300, happiness: 5, loadout: null, activeInnate: null, tactics: null }])
    setResult(null) // roster shape changed — the old result no longer lines up
  }
  const removeFighter = (side: 'A' | 'B', id: number) => {
    setTeamFor(side)((l) => (l.length > 1 ? l.filter((f) => f.id !== id) : l))
    setResult(null)
  }
  const updateFighter = (side: 'A' | 'B', id: number, patch: Partial<FighterSlot>) => {
    setTeamFor(side)((l) => l.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const monstersA = useMemo(() => teamA.map(buildSandboxMonster), [teamA])
  const monstersB = useMemo(() => teamB.map(buildSandboxMonster), [teamB])

  const runBattle = () => {
    setResult(simulateTeamBattle(monstersA, monstersB, teamA.map((f) => f.happiness), teamB.map((f) => f.happiness)))
    setBattleKey((k) => k + 1)
  }

  const editingFighter = editing ? teamFor(editing.side).find((f) => f.id === editing.id) : undefined
  const editingMonster = editingFighter ? buildSandboxMonster(editingFighter) : null

  if (editing && editingFighter && editingMonster) {
    return (
      <AbilitySelector
        m={editingMonster}
        name={editingMonster.name}
        onSetLoadout={(ids) => updateFighter(editing.side, editing.id, { loadout: ids.length ? ids : null })}
        onSetInnate={(index) => updateFighter(editing.side, editing.id, { activeInnate: index })}
        onSetTactics={(t) => updateFighter(editing.side, editing.id, { tactics: t })}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      <p className="sub">Type a seed to generate a monster, invest training to unlock moves (2nd innate at 300), add fighters to build a team, edit abilities, then auto-battle. Same seeds → same monsters &amp; same fight.</p>

      <div className="arena">
        <div className="sandbox-team">
          {teamA.map((f, i) => (
            <Stable key={f.id} label={`A${f.id}`} seed={f.seed} setSeed={(s) => updateFighter('A', f.id, { seed: s })}
              train={f.train} setTrain={(n) => updateFighter('A', f.id, { train: n })}
              happiness={f.happiness} setHappiness={(n) => updateFighter('A', f.id, { happiness: n })}
              m={monstersA[i]}
              onEditAbilities={() => setEditing({ side: 'A', id: f.id })}
              onRemove={teamA.length > 1 ? () => removeFighter('A', f.id) : undefined}
            />
          ))}
          <button className="ghost addfighter" disabled={teamA.length >= SANDBOX_MAX_TEAM} onClick={() => addFighter('A')}>
            + Add Fighter ({teamA.length}/{SANDBOX_MAX_TEAM})
          </button>
        </div>
        <div className="vs">VS</div>
        <div className="sandbox-team">
          {teamB.map((f, i) => (
            <Stable key={f.id} label={`B${f.id}`} seed={f.seed} setSeed={(s) => updateFighter('B', f.id, { seed: s })}
              train={f.train} setTrain={(n) => updateFighter('B', f.id, { train: n })}
              happiness={f.happiness} setHappiness={(n) => updateFighter('B', f.id, { happiness: n })}
              m={monstersB[i]}
              onEditAbilities={() => setEditing({ side: 'B', id: f.id })}
              onRemove={teamB.length > 1 ? () => removeFighter('B', f.id) : undefined}
            />
          ))}
          <button className="ghost addfighter" disabled={teamB.length >= SANDBOX_MAX_TEAM} onClick={() => addFighter('B')}>
            + Add Fighter ({teamB.length}/{SANDBOX_MAX_TEAM})
          </button>
        </div>
      </div>

      <div className="battlebar">
        <button onClick={runBattle}>⚔️ Auto-Battle</button>
      </div>

      {result && (
        <div key={battleKey}>
          <ArenaBattle teamA={monstersA} teamB={monstersB} result={result} />
          <BattleLog onClear={() => setResult(null)} />
        </div>
      )}
    </>
  )
}

// ============================ Town hub (§13) ============================
function TownView({ game, setGame }: { game: GameState; setGame: Dispatch<SetStateAction<GameState>> }) {
  const [fuseA, setFuseA] = useState('')
  const [fuseB, setFuseB] = useState('')
  const barnFull = game.stable.length >= effectiveBarnCap(game)

  return (
    <>
      {game.tutorialEnabled && !game.tutorialDismissed && (
        <TutorialBanner onDismiss={() => setGame((g) => ({ ...g, tutorialDismissed: true }))} />
      )}
      <div className="townbar">
        <span>🪙 {game.gold}g</span>
        <span>🏠 Stable {game.stable.length}/{effectiveBarnCap(game)}</span>
        <span>❄️ Frozen {game.frozen.length}</span>
        {game.pantryContract && <span className="up">🧺 Pantry</span>}
        {game.grandLarder && <span className="up">🏰 Larder</span>}
      </div>

      <div className="townmap">
        {/* Market */}
        <div className="card loc">
          <div className="loc-h"><span>🛒 Market</span></div>
          {barnFull && <div className="hint">🏠 Stable full — upgrade a barn to buy.</div>}
          <div className="offers">
            {game.market.length === 0 && <div className="dim">Sold out — market refreshes at the start of each month.</div>}
            {game.market.map((o, i) => {
              const m = offerMonster(o)
              const afford = game.gold >= o.price
              const prof = trainingProfileFor(m.species)
              return (
                <div className="offer" key={o.seed}>
                  {/* Compact by default (three full cards made Town very long);
                      the full MonsterCard is one click away. */}
                  <details className="offer-details">
                    <summary className="offer-brief">
                      <Sprite species={m.species} size={44} />
                      <span className="offer-brief-text">
                        <b>{m.name}</b> <span className="dim">· {m.species.name} · {m.className}</span>
                        <span className="offer-brief-sub">
                          <AptMarks prof={prof} /> <span className="dim">· {m.species.lifespan}y</span>
                        </span>
                      </span>
                      <span className="offer-brief-more dim">details ▾</span>
                    </summary>
                    <MonsterCard m={m} />
                  </details>
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
                <Sprite species={c.species} size={28} stage={stageInfo(c.ageWeeks, c.species.lifespan).stage} />
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
                {/* Frozen genomes carry no age — thaw always returns a Teen. */}
                <Sprite species={f.species} size={28} stage="Teen" />
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
          <div className="hint">Baby hatches unlicensed with a <b>bloodline potential</b> = the parents' average +{Math.round(BREEDING_BONUS * 100)}% — a higher stat ceiling than any wild monster. Breed a line over generations to climb it.</div>
        </div>

        {/* Ranch */}
        <div className="card loc">
          <div className="loc-h"><span>🐄 Ranch</span></div>
          <button className="enter" disabled={game.stable.length === 0} onClick={() => setGame((g) => goto(g, 'ranch'))}>Enter the Ranch →</button>
          {game.stable.length === 0 && <div className="dim">Buy a monster first.</div>}
        </div>

        {/* Trainer level (LOOP_DESIGN Phase 5): the persistent meta character —
            the ranch is the account, monsters are the runs. */}
        {(() => {
          const p = trainerXpProgress(game)
          const barn = trainerBarnBonus(game)
          return (
            <div className="card loc">
              <div className="loc-h"><span>🎓 Trainer — {game.trainerName}</span><span className="dim">Level {p.level}</span></div>
              <div className="xpbar"><div className="xpfill" style={{ width: `${Math.round((p.into / p.need) * 100)}%` }} /></div>
              <div className="dim" style={{ marginTop: 4 }}>
                {p.into}/{p.need} XP to level {p.level + 1} · earn XP from cup podiums &amp; raising monsters to retirement
                {barn > 0 && <> · <b className="up">+{barn} barn slot{barn > 1 ? 's' : ''}</b></>}
              </div>
            </div>
          )
        })()}

        {/* Rivals (LOOP_DESIGN Phase 2): the recurring face(s) on the ladder,
            with the running head-to-head. Climb toward the player's level. */}
        {game.rivals.length > 0 && (
          <div className="card loc">
            <div className="loc-h"><span>🥊 Rivals</span></div>
            {game.rivals.map((rv) => {
              const led = rv.wins > rv.losses, tied = rv.wins === rv.losses
              const record = rv.wins === 0 && rv.losses === 0 ? 'Not yet faced'
                : tied ? `Even ${rv.wins}–${rv.losses}`
                  : led ? `You lead ${rv.wins}–${rv.losses}` : `${rv.name} leads ${rv.losses}–${rv.wins}`
              const trait = rv.personality === 'aggressive' ? 'hits hard and early'
                : rv.personality === 'cagey' ? 'patient and defensive' : 'loves a big play'
              return (
                <div className="shoprow" key={rv.id}>
                  <div>
                    <b>{rv.name}</b> <span className="dim">· {LEAGUES[rv.licenseIndex].name} · {trait}</span>
                    <div className={led ? 'up' : tied ? 'dim' : 'down'}>{record}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Infirmary (2026-07-25): pay to mend wounds NOW instead of resting a
            week away — fee scales with league and how much is missing.
            Stamina is untouched; only Rest cures fatigue. */}
        <div className="card loc">
          <div className="loc-h"><span>⛑ Infirmary</span><span className="dim">mends HP &amp; MP · not stamina</span></div>
          {game.stable.filter((c) => !c.retired && infirmaryFee(c) > 0).length === 0
            ? <div className="dim">Everyone is in fighting shape.</div>
            : game.stable.filter((c) => !c.retired && infirmaryFee(c) > 0).map((c) => (
              <div className="shoprow" key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <div className="dim">{c.hp}/{maxHp(c.stats)} HP · {c.mp}/{maxMana(c.stats)} MP</div>
                </div>
                <button disabled={game.gold < infirmaryFee(c)} onClick={() => setGame((g) => healAtInfirmary(g, c.id))}>
                  Heal · {infirmaryFee(c)}g
                </button>
              </div>
            ))}
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
              <b>🧺 Pantry Contract</b>
              <div className="dim">{game.pantryContract ? 'Owned — 20% off normal foods.' : 'Permanent 20% off normal foods.'}</div>
            </div>
            <button disabled={game.pantryContract || game.gold < PANTRY_CONTRACT_COST} onClick={() => setGame((g) => buyPantryContract(g))}>
              {game.pantryContract ? '✓ Owned' : `Buy · ${PANTRY_CONTRACT_COST}g`}
            </button>
          </div>
          <div className="shoprow">
            <div>
              <b>🏰 Grand Larder</b>
              <div className="dim">{game.grandLarder ? 'Owned — 20% off premium foods.' : '20% off premium foods (training & fruits).'}</div>
            </div>
            <button disabled={game.grandLarder || game.gold < GRAND_LARDER_COST} onClick={() => setGame((g) => buyGrandLarder(g))}>
              {game.grandLarder ? '✓ Owned' : `Buy · ${GRAND_LARDER_COST}g`}
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
// The stat a drill primarily trains — the one with a positive gain (basic
// drills have exactly one entry; intensive drills pair it with a malus stat).
const primaryStatOf = (d: Drill): Stat => Object.entries(d.gains).find(([, v]) => (v as number) > 0)![0] as Stat

// A "last week" digest line with its numeric deltas tinted — losses (the line
// that tells you a monster came home hurt) previously read identically to
// gains. Splits on signed numbers only; all other text passes through.
function DigestLine({ text, className }: { text: string; className: string }) {
  const parts = text.split(/([+-]\d+)/g)
  return (
    <div className={className}>
      {parts.map((p, i) =>
        /^-\d+$/.test(p) ? <span key={i} className="neg">{p}</span>
          : /^\+\d+$/.test(p) ? <span key={i} className="pos">{p}</span>
            : p)}
    </div>
  )
}

// One training-row block: a drill's LIVE preview for the selected monster this
// week (exact, not estimated — previewWeekEffects shares applyWeek's seeded
// rng) so the happiness-weighted roll shows the real number, not a nominal one.
function TrainBlock({ d, career, food, forage, selected, onClick }: {
  d: Drill; career: Career; food: WeekPlanEntry['food']; forage?: boolean; selected: boolean; onClick: () => void
}) {
  const stat = primaryStatOf(d)
  const preview = previewWeekEffects(career, d.id, food, forage)
  const gain = preview.statDeltas[stat]
  const malusEntry = (Object.entries(d.gains) as [Stat, number][]).find(([, v]) => v < 0)
  const malus = malusEntry ? preview.statDeltas[malusEntry[0]] ?? malusEntry[1] : undefined
  const stamCost = d.kind === 'basic' ? BASIC_DRILL_STAMINA : INTENSIVE_DRILL_STAMINA
  const gainText = gain !== undefined ? `${gain > 0 ? '+' : ''}${gain} ${stat}` : `+${d.gains[stat]} ${stat}`
  // Aptitude coloring (user spec 2026-07-20): a stat this species trains FASTER
  // (major/minor) gets its number tinted to the stat's own colour instead
  // of plain white, so the boost is visible right on the number, uniformly
  // across every drill. No box on the gain — the box is reserved for the
  // intensive-drill malus stat, which keeps its existing boxed treatment.
  const prof = trainingProfileFor(career.species)
  const hasBenefit = stat === prof.major || stat === prof.minor
  return (
    <button className={'trainblock' + (selected ? ' selected' : '')} onClick={onClick} title={d.desc}>
      <div className="trainblock-name" style={{ color: STAT_COLOR[stat] }}>{d.name}</div>
      <div className="trainblock-sub">
        <span className="benefit-gain" style={hasBenefit ? { color: STAT_COLOR[stat] } : undefined}>{gainText}</span>
        {malusEntry && <>, <span className="benefit-malus">{malus} {malusEntry[0]}</span></>} · −{stamCost} stam
      </div>
    </button>
  )
}

// The planned action's benefit, shown while picking food (user spec 2026-07-20):
// training shows each stat bar going current → new, rest shows the stamina gain,
// excursion shows the flat gold purse. Gains render white; maluses render black.
// Live and exact — previewWeekEffects shares applyWeek's seeded rng, and the
// preview re-rolls with the post-feed happiness as the food selection changes.
function PlanBenefit({ career, plan }: { career: Career; plan: WeekPlanEntry }) {
  const preview = previewWeekEffects(career, plan.activity, plan.food, plan.forage)
  const drill = [...BASIC_DRILLS, ...INTENSIVE_DRILLS].find((d) => d.id === plan.activity)
  const label = drill ? `💪 ${drill.name}` : plan.activity === 'excursion' ? '🧭 Excursion' : '😴 Rest'
  const cap = LEAGUES[career.licenseIndex].cap
  return (
    <>
      <div className="section-title">This week's plan — {label}</div>
      <div className="planbenefit">
        {drill && (Object.keys(drill.gains) as Stat[]).map((stat) => {
          const cur = career.stats[stat]
          const delta = preview.statDeltas[stat] ?? 0
          const next = cur + delta
          const basePct = (Math.min(cur, next) / cap) * 100
          const diffPct = (Math.abs(delta) / cap) * 100
          return (
            <div className="benefitrow" key={stat}>
              <span style={{ color: STAT_COLOR[stat], fontWeight: 700 }}>{stat}</span>
              <span className="bar">
                <i style={{ width: `${basePct}%`, background: STAT_COLOR[stat] }} />
                {delta !== 0 && <i style={{ width: `${diffPct}%`, background: delta > 0 ? '#fff' : '#000' }} />}
              </span>
              <span className="v">{cur} → {next}</span>
              {delta > 0 ? <span className="benefit-gain">+{delta}</span>
                : delta < 0 ? <span className="benefit-malus">{delta}</span>
                  : <span className="dim">capped</span>}
            </div>
          )
        })}
        {plan.activity === 'rest' && (() => {
          const hpMax = maxHp(career.stats)
          const mpMax = maxMana(career.stats)
          return (
            <>
              <div className="benefitrow">
                <span style={{ fontWeight: 700 }}>HP</span>
                <span className="bar">
                  <i style={{ width: `${(Math.min(career.hp, hpMax) / hpMax) * 100}%`, background: 'linear-gradient(90deg, #43a047, #7cb342)' }} />
                  {preview.hpDelta > 0 && <i style={{ width: `${(preview.hpDelta / hpMax) * 100}%`, background: '#fff' }} />}
                </span>
                <span className="v">{Math.min(career.hp, hpMax)} → {Math.min(career.hp, hpMax) + preview.hpDelta}</span>
                {preview.hpDelta > 0 ? <span className="benefit-gain">+{preview.hpDelta}</span> : <span className="dim">full</span>}
              </div>
              <div className="benefitrow">
                <span style={{ fontWeight: 700 }}>MP</span>
                <span className="bar">
                  <i style={{ width: `${mpMax > 0 ? (Math.min(career.mp, mpMax) / mpMax) * 100 : 0}%`, background: 'linear-gradient(90deg, #1e88e5, #42a5f5)' }} />
                  {preview.mpDelta > 0 && <i style={{ width: `${(preview.mpDelta / mpMax) * 100}%`, background: '#fff' }} />}
                </span>
                <span className="v">{Math.min(career.mp, mpMax)} → {Math.min(career.mp, mpMax) + preview.mpDelta}</span>
                {preview.mpDelta > 0 ? <span className="benefit-gain">+{preview.mpDelta}</span> : <span className="dim">full</span>}
              </div>
              <div className="benefitrow">
                <span style={{ fontWeight: 700 }}>Stamina</span>
                <span className="bar">
                  <i style={{ width: `${career.stamina}%`, background: 'var(--dex)' }} />
                  {preview.staminaDelta > 0 && <i style={{ width: `${preview.staminaDelta}%`, background: '#fff' }} />}
                </span>
                <span className="v">{career.stamina} → {career.stamina + preview.staminaDelta}</span>
                {preview.staminaDelta > 0 ? <span className="benefit-gain">+{preview.staminaDelta}</span> : <span className="dim">full</span>}
              </div>
            </>
          )
        })()}
        {plan.activity === 'excursion' && (
          <div className="benefitrow flat">
            <span style={{ fontWeight: 700 }}>Gold</span>
            <span className="benefit-gain big">+{preview.goldDelta}g</span>
          </div>
        )}
        {(drill || plan.activity === 'excursion') && (
          <div className="benefitrow flat">
            <span style={{ fontWeight: 700 }}>Stamina</span>
            <span className="benefit-malus">{preview.staminaDelta}</span>
          </div>
        )}
      </div>
    </>
  )
}

// The Ability Selection UI (§1b, mockup approved 2026-07-19): click a slot,
// then a pool move to swap it in. Filter by stat; equipped moves show dimmed
// in the pool. Changes apply immediately via onSetLoadout (no separate save
// step) — free any time except a monster's active tournament week.
function AbilitySelector({ m, name, onSetLoadout, onSetInnate, onSetTactics, onClose, teamTacticsOpen = true }: {
  m: Monster; name: string; onSetLoadout: (ids: string[]) => void
  onSetInnate: (index: number) => void; onSetTactics: (t: Tactics) => void; onClose: () => void
  teamTacticsOpen?: boolean // false until team battles are unlocked — locks the multi-combatant orders
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [filter, setFilter] = useState<Stat | 'All'>('All')
  const loadout = m.loadout
  const pool = filter === 'All' ? m.learned : m.learned.filter((mv) => mv.stat === filter)

  const swap = (move: Move) => {
    const slot = selectedSlot ?? 0
    const ids = [0, 1, 2]
      .map((i) => (i === slot ? move.id : loadout[i]?.id))
      .filter((id): id is string => !!id)
    onSetLoadout(ids)
    setSelectedSlot(null)
  }

  return (
    <div className="card abilityeditor">
      <div className="loc-h">
        <span>⚔ Edit Abilities — {name}</span>
        <button className="ghost" onClick={onClose}>✕ close</button>
      </div>
      <details className="editor-section" open>
        <summary className="editor-summary">⚔ Moves &amp; loadout</summary>
      <div className="hint">Pick one of the three equipped slots, then click a move from the pool to put it there.</div>
      <div className="abilityslots">
        {[0, 1, 2].map((i) => {
          const mv = loadout[i]
          return (
            <div key={i} className={'abilityslot' + (selectedSlot === i ? ' selected' : '')}
              onClick={() => setSelectedSlot(selectedSlot === i ? null : i)}>
              <div className="slotlabel">Slot {i + 1}{selectedSlot === i ? ' — pick a move below' : ''}</div>
              {mv ? (
                <>
                  <div className="mn">{mv.element ? ELEMENT_ICON[mv.element] + ' ' : ''}{mv.name}</div>
                  <div className="md">{mv.stat} · {mv.channel} · {manaCost(mv)} MP · cd {mv.cooldown}</div>
                </>
              ) : <div className="dim">empty slot</div>}
            </div>
          )
        })}
      </div>
      <div className="abilitychips">
        {(['All', ...STATS] as const).map((s) => (
          <button key={s} className={'abilitychip' + (filter === s ? ' on' : '')} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>
      <div className="abilitypool">
        {pool.length === 0 && <div className="dim">No moves learned yet — train a stat past 40.</div>}
        {pool.map((mv) => {
          const equipped = loadout.some((l) => l.id === mv.id)
          return (
            <div key={mv.id} className={'move' + (equipped ? ' dim-eq' : '')} onClick={() => !equipped && swap(mv)}>
              <span className="lvl">{mv.stat} {mv.learnLevel}</span>
              <span className="mn">{mv.element ? ELEMENT_ICON[mv.element] + ' ' : ''}{mv.name}</span>
              <div className="md">{mv.desc} · {mv.channel} · {manaCost(mv)} MP · cd {mv.cooldown} · acc {mv.accuracy}{equipped ? ' · equipped' : ''}</div>
            </div>
          )
        })}
      </div>
      <button className="ghost" style={{ marginTop: 8 }} onClick={() => onSetLoadout([])}>Reset to suggested loadout</button>
      </details>

      <details className="editor-section">
        <summary className="editor-summary">✦ Innate passive</summary>
      <div className="hint">The 2nd choice is an alternative, not an upgrade — click to switch.</div>
      <div className="abilitypool">
        {m.species.innate.map((a, i) => {
          const locked = i === 1 && !m.innateUnlocked
          const active = m.activeInnate === i
          return (
            <div key={a.name} className={'ability innatepick' + (active ? ' active' : '') + (locked ? ' locked' : '')}
              onClick={() => !locked && !active && onSetInnate(i)}>
              <span className="mn">{a.name}</span>
              <div className="md">{a.desc} {active ? '· ACTIVE' : locked ? `· 🔒 unlocks at ${INNATE_SECONDARY_LEVEL} in a stat` : ''}</div>
            </div>
          )
        })}
      </div>
      </details>

      {(() => {
        // Tactics (2026-07-25): Teamfight-Manager-style standing orders — the
        // player coaches how the auto-battler fights, one highlighted choice
        // per group. Groups lead with the always-relevant Temperament and end
        // with the niche/locked ones; every active choice is spelled out in the
        // summary below so no tactic's meaning lives in a hover-only tooltip.
        const cur = m.tactics ?? DEFAULT_TACTICS
        const temp = TEMPERAMENT_INFO.find((o) => o.id === cur.temperament)!
        const prio = TARGET_PRIORITY_INFO.find((o) => o.id === cur.targetPriority)!
        const mana = MANA_POLICY_INFO.find((o) => o.id === (cur.manaPolicy ?? 'normal'))!
        const combo = COMBO_INFO.find((o) => o.id === (cur.comboDiscipline ?? false))!
        const openerMove = cur.openerId ? m.loadout.find((mv) => mv.id === cur.openerId) : undefined
        // Combo discipline only does anything with BOTH halves of a pair
        // equipped — a payoff (bonusVsStatus) and a move that sets its status.
        // Gating the toggle stops it being a live-but-inert control (H5).
        const comboReady = m.loadout.some((p) => p.effects?.bonusVsStatus
          && m.loadout.some((s) => s.status?.kind === p.effects!.bonusVsStatus!.kind))

        // Every group's ACTIVE choice, spelled out — the panel's single source
        // of "what are my orders right now", replacing tooltip-only meaning.
        const summary = [
          { icon: temp.icon, name: temp.name, desc: temp.desc },
          { icon: openerMove ? (openerMove.element ? ELEMENT_ICON[openerMove.element] : '▶') : '🎲',
            name: openerMove ? `Open with ${openerMove.name}` : 'Instinct opener',
            desc: openerMove ? 'Always throws this move first when it can.' : 'The class picks its own first play.' },
          { icon: mana.icon, name: mana.name, desc: mana.desc },
          { icon: combo.icon, name: combo.name, desc: comboReady ? combo.desc : 'No setup→payoff pair equipped yet — no effect.' },
          { icon: prio.icon, name: prio.name, desc: teamTacticsOpen ? prio.desc : 'Locked until team battles unlock.' },
        ]

        return (
          <details className="editor-section">
            <summary className="editor-summary">🎯 Tactics — battle orders</summary>
            <div className="hint">Standing orders {name} follows in every battle — adjust after scouting a field.</div>
            <div className="tacticgroups">
              <div className="tacticgroup">
                <div className="tacticgroup-h">Temperament</div>
                {TEMPERAMENT_INFO.map((o) => (
                  <button key={o.id} className={'tacticopt' + (cur.temperament === o.id ? ' on' : '')}
                    onClick={() => onSetTactics({ ...cur, temperament: o.id })}>
                    {o.icon} {o.name}
                  </button>
                ))}
              </div>
              <div className="tacticgroup">
                <div className="tacticgroup-h">Opening move</div>
                <button className={'tacticopt' + (!openerMove ? ' on' : '')}
                  onClick={() => onSetTactics({ ...cur, openerId: undefined })}>
                  🎲 Instinct
                </button>
                {m.loadout.map((mv) => (
                  <button key={mv.id} className={'tacticopt' + (cur.openerId === mv.id ? ' on' : '')}
                    onClick={() => onSetTactics({ ...cur, openerId: mv.id })}>
                    {mv.element ? ELEMENT_ICON[mv.element] + ' ' : '▶ '}{mv.name}
                  </button>
                ))}
              </div>
              <div className="tacticgroup">
                <div className="tacticgroup-h">Mana policy</div>
                {MANA_POLICY_INFO.map((o) => (
                  <button key={o.id} className={'tacticopt' + ((cur.manaPolicy ?? 'normal') === o.id ? ' on' : '')}
                    onClick={() => onSetTactics({ ...cur, manaPolicy: o.id })}>
                    {o.icon} {o.name}
                  </button>
                ))}
              </div>
              <div className="tacticgroup">
                <div className="tacticgroup-h">Combo play{comboReady ? '' : ' 🔒'}</div>
                {COMBO_INFO.map((o) => {
                  const disabled = o.id === true && !comboReady
                  return (
                    <button key={String(o.id)} disabled={disabled}
                      className={'tacticopt' + ((cur.comboDiscipline ?? false) === o.id ? ' on' : '') + (disabled ? ' lockedopt' : '')}
                      onClick={() => !disabled && onSetTactics({ ...cur, comboDiscipline: o.id })}>
                      {o.icon} {o.name}
                    </button>
                  )
                })}
                {!comboReady && <div className="hint">🔗 Equip a setup move and its matching payoff to use this.</div>}
              </div>
              <div className="tacticgroup">
                <div className="tacticgroup-h">Target priority{teamTacticsOpen ? '' : ' 🔒'}</div>
                {TARGET_PRIORITY_INFO.map((o) => {
                  // Priorities only matter with multiple combatants — locked
                  // (except the default) until team battles are reachable.
                  const locked = !teamTacticsOpen && o.id !== 'weakest'
                  return (
                    <button key={o.id} disabled={locked}
                      className={'tacticopt' + (cur.targetPriority === o.id ? ' on' : '') + (locked ? ' lockedopt' : '')}
                      onClick={() => !locked && onSetTactics({ ...cur, targetPriority: o.id })}>
                      {o.icon} {o.name}
                    </button>
                  )
                })}
                {!teamTacticsOpen && (
                  <div className="hint">🔒 Orders for team battles — unlock by earning the {LEAGUES[firstTeamLeagueIndex()].name} license
                    ({teamSizeForLeague(LEAGUES[firstTeamLeagueIndex()].name)}v{teamSizeForLeague(LEAGUES[firstTeamLeagueIndex()].name)}).</div>
                )}
              </div>
            </div>
            <div className="tactic-summary">
              {summary.map((s, i) => (
                <div key={i} className="tactic-summary-row"><span className="tsr-icon">{s.icon}</span><span><b>{s.name}</b> — {s.desc}</span></div>
              ))}
            </div>
          </details>
        )
      })()}
    </div>
  )
}

// Team-roster picker for team-size >1 tournaments (Tin+): same slot-click /
// pool-click convention as AbilitySelector above — click a slot, then a pool
// monster to fill it. Parent owns the persisted `monsterIds` array.
function TeamPicker({ pool, teamSize, monsterIds, onChange }: {
  pool: Career[]; teamSize: number; monsterIds: string[]; onChange: (ids: string[]) => void
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const pick = (c: Career) => {
    const firstEmpty = Array.from({ length: teamSize }, (_, i) => i).find((i) => !monsterIds[i])
    const slot = selectedSlot ?? firstEmpty ?? 0
    const ids = Array.from({ length: teamSize }, (_, i) => (i === slot ? c.id : monsterIds[i])).filter((id): id is string => !!id)
    onChange(ids)
    setSelectedSlot(null)
  }
  return (
    <div className="teampicker">
      <div className="hint">
        Pick {teamSize} monsters — click a slot, then a monster below. <b>Slot order is your formation</b>:
        the first {frontRowCount(teamSize)} fight in the ⚔ front line (melee can only reach the front while it
        stands); the rest shoot from the 🏹 back line.
      </div>
      <div className="abilityslots">
        {Array.from({ length: teamSize }, (_, i) => {
          const id = monsterIds[i]
          const c = pool.find((x) => x.id === id)
          const cls = c ? classForStats(c.stats) : ''
          const row = rowOfSlot(i, teamSize)
          return (
            <div key={i} className={'abilityslot' + (selectedSlot === i ? ' selected' : '')}
              onClick={() => setSelectedSlot(selectedSlot === i ? null : i)}>
              <div className="slotlabel">{row === 'front' ? '⚔ Front' : '🏹 Back'} · slot {i + 1}</div>
              {c ? (
                <>
                  <div className="mn">{c.name}</div>
                  <div className="md">{cls} · {roleOfClass(cls)}</div>
                </>
              ) : <div className="dim">empty slot</div>}
            </div>
          )
        })}
      </div>
      <div className="abilitypool">
        {pool.map((c) => {
          const equipped = monsterIds.includes(c.id)
          const cls = classForStats(c.stats)
          const hurt = c.hp < maxHp(c.stats)
          return (
            <div key={c.id} className={'move' + (equipped ? ' dim-eq' : '')} onClick={() => !equipped && pick(c)}>
              <span className="lvl">{roleOfClass(cls)}</span>
              <span className="mn">{c.name}</span>
              <div className="md">
                {c.species.name} · {cls} · {LEAGUES[c.licenseIndex].name}
                {hurt ? ` · 🩹 ${c.hp}/${maxHp(c.stats)} HP` : ''}
                {staminaDamageMult(c.stamina) < 1 ? ` · 💤 ${c.stamina} stam` : ''}
                {equipped ? ' · picked' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// A round-robin event's internal `label` ("Your Team" / "Rival Team N") is
// just a stable bookkeeping key — resolve it to the actual roster (for a
// name and an icon) wherever it's shown to the player (user spec 2026-07-22:
// "instead of rival teams, give them names or use the icons of the
// monsters"). Every match a label appears in carries the same fixed-full
// roster, so the first match found is enough.
function teamRoster(label: string, matches: EventMatch[]): Monster[] | null {
  const m = matches.find((mm) => mm.aLabel === label || mm.bLabel === label)
  if (!m) return null
  return m.aLabel === label ? m.teamA : m.teamB
}
function teamName(label: string, matches: EventMatch[]): string {
  const roster = teamRoster(label, matches)
  return roster ? roster.map((m) => m.name).join(' & ') : label
}

// Round-robin results grid (user spec 2026-07-22, reference: Monster
// Rancher's bracket screen) — rows/columns are the field in placement order;
// each off-diagonal cell shows the ROW participant's result against the
// COLUMN participant (O win, ✕ loss, – draw). Row headers carry the lead
// monster's sprite + full team name instead of the internal label.
//
// The whole event is actually pre-simulated in one shot (advanceWeek), but
// the grid must not just dump every result at once (user spec 2026-07-22:
// "the bracket must begin empty... must not start complete") — `revealed`
// is the subset of `allMatches` treated as "already happened" so far, and
// ONLY that subset fills in cells. `allMatches` (always the full event) is
// still used for name/icon identity, since a team's roster shouldn't stay
// anonymous just because none of its matches have been revealed yet.
function BracketGrid({ standings, allMatches, revealed }: { standings: EventStanding[]; allMatches: EventMatch[]; revealed: EventMatch[] }) {
  const resultFor = (rowLabel: string, colLabel: string): 'win' | 'loss' | 'draw' | null => {
    const m = revealed.find((mm) => (mm.aLabel === rowLabel && mm.bLabel === colLabel) || (mm.aLabel === colLabel && mm.bLabel === rowLabel))
    if (!m) return null
    if (m.result.winner === 'draw') return 'draw'
    const rowIsA = m.aLabel === rowLabel
    return (rowIsA && m.result.winner === 'A') || (!rowIsA && m.result.winner === 'B') ? 'win' : 'loss'
  }
  return (
    <div className="bracket-grid-wrap">
      <table className="bracket-grid">
        <thead>
          <tr>
            <th />
            {standings.map((_, i) => <th key={i}>{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const roster = teamRoster(row.label, allMatches)
            return (
              <tr key={row.label}>
                <td className="bracket-row-head">
                  <span className="bracket-num">{i + 1}</span>
                  {roster && <Sprite species={roster[0].species} size={22} />}
                  <span className={row.isPlayer ? 'pos' : ''}>{roster ? roster.map((m) => m.name).join(' & ') : row.label}</span>
                </td>
                {standings.map((col, j) => {
                  if (i === j) return <td key={j} className="bracket-cell self" />
                  const res = resultFor(row.label, col.label)
                  return (
                    <td key={j} className={`bracket-cell ${res ?? ''}`}>
                      {res === 'win' ? 'O' : res === 'loss' ? '✕' : res === 'draw' ? '–' : ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RanchView({ game, setGame, onBattleScreen }: {
  game: GameState; setGame: Dispatch<SetStateAction<GameState>>; onBattleScreen: (v: boolean) => void
}) {
  // If every active monster already has food picked this week (e.g. the player
  // hopped Town -> Ranch and back), land straight on the stable instead of
  // replaying the feeding walkthrough; if only SOME are fed (a mid-week Market
  // buy), start feeding at the first unfed monster rather than monster 1.
  const firstUnfedIdx = game.stable.findIndex((c) => !c.retired && !game.weekPlans?.[c.id]?.food)
  const [phase, setPhase] = useState<'feeding' | 'stable' | 'battle'>(() =>
    game.stable.length > 0 && firstUnfedIdx === -1 ? 'stable' : 'feeding')
  const [decisionIdx, setDecisionIdx] = useState(() => Math.max(0, firstUnfedIdx))
  // Week plans live in GameState (persisted) so they survive navigating to
  // Town and back, and reloads — this was a real papercut as component state.
  const weekPlan = game.weekPlans ?? {}
  const setPlanFor = (monsterId: string, entry: WeekPlanEntry) =>
    setGame((g) => ({ ...g, weekPlans: { ...(g.weekPlans ?? {}), [monsterId]: entry } }))
  const [calendarMonth, setCalendarMonth] = useState(() => monthOfWeek(game.week))
  const [teamPick, setTeamPick] = useState<Record<string, string[]>>({})
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [battleOver, setBattleOver] = useState(false)
  const [matchIdx, setMatchIdx] = useState(0)
  // Bracket hub sub-phase: pre-cup lore -> bracket standings (Fight from
  // here) -> the match itself -> back to bracket -> post-cup announcement.
  const [battleSub, setBattleSub] = useState<'preamble' | 'bracket' | 'fight' | 'announce'>('preamble')
  // Which of the player's upcoming matches have been paid-scouted, and at
  // what tier — keyed by matchIdx, reset each new tournament event.
  const [scouted, setScouted] = useState<Record<number, 'basic' | 'full'>>({})
  // Pre-signup field scouting (2026-07-25): rival teams are deterministic per
  // (seed, week, tournament), so they can be scouted BEFORE committing a
  // roster — when loadout edits are still free and the intel is actionable.
  // Keyed `${tournamentId}:${rivalIdx}`; local state, same convention as
  // `scouted` above (paying again at the bracket is match-day re-intel).
  const [fieldScout, setFieldScout] = useState<Record<string, 'basic' | 'full'>>({})
  const [selectedMonsterId, setSelectedMonsterId] = useState(() => game.stable.find((c) => !c.retired)?.id ?? game.stable[0]?.id ?? '')
  const [abilityEditorFor, setAbilityEditorFor] = useState<string | null>(null)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)

  // Tell App when the battle screen is up, so it can hide the Bestiary footer.
  const onBattleScreenNow = phase === 'battle' && !!game.lastBattle
  useEffect(() => {
    onBattleScreen(onBattleScreenNow)
    return () => onBattleScreen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBattleScreenNow])

  // The calendar (and a clicked tournament's entry panel) render BELOW the tall
  // training grid — without these scrolls, toggling "Tournaments" looked like
  // it did nothing at all.
  const calendarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showCalendar) calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showCalendar])
  const entryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedTournamentId) entryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedTournamentId])

  if (game.stable.length === 0) {
    return (
      <>
        <div className="ranchtop">
          <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>← 🏛 Town</button>
        </div>
        <p className="sub">Your stable is empty. Head to Town → Market to buy a monster.</p>
      </>
    )
  }

  // Tournament battle screen: a round-robin EVENT resolved this week, walked
  // through as a Monster-Rancher-style bracket hub (user spec 2026-07-22) —
  // pre-cup lore -> bracket standings (pay to scout the next opponent, then
  // Fight) -> the match itself -> back to the bracket -> repeat -> a post-cup
  // announcement. Rival-vs-rival matches aren't replayed, only listed.
  if (phase === 'battle' && game.lastBattle) {
    const lb = game.lastBattle
    const tourney = tournamentCalendarFor(game.seed, yearOfWeek(game.week)).find((t) => t.id === lb.tournamentId)
    const lore = tourney ? cupLore(tourney) : null
    const playerMatches = lb.matches.filter((m) => m.involvesPlayer)
    const currentMatch: EventMatch | undefined = playerMatches[matchIdx]
    const allMatchesShown = matchIdx >= playerMatches.length
    // The event is pre-simulated in one shot, but the bracket must not just
    // dump every result at once (user spec 2026-07-22) — only matches "at or
    // before" the player's last-completed match count as revealed. Starts
    // empty (matchIdx 0 -> nothing revealed yet).
    const revealedThroughIdx = matchIdx > 0 ? lb.matches.indexOf(playerMatches[matchIdx - 1]) : -1
    const revealedMatches = lb.matches.slice(0, revealedThroughIdx + 1)
    const otherMatches = revealedMatches.filter((m) => !m.involvesPlayer)
    const header = (
      <div className="ranchtop">
        <span>🏟 {lb.tournamentName}</span>
        <span>📅 {dateLabel(game.week)}</span>
        <span>🪙 {game.gold}g</span>
      </div>
    )

    if (battleSub === 'preamble') {
      // Expectation-setting (2026-07-25 playtest addition): rivals fight at the
      // league's own FIXED standard, so a young team's first cup is usually a
      // hard field — say so up front instead of letting a sweep read as failure.
      const playerRoster = teamRoster('Your Team', lb.matches)
      const perMonsterBudget = (LEAGUES[leagueIndexOf(lb.league)]?.cap ?? 100) * 3.5
      const avgTotal = playerRoster && playerRoster.length
        ? playerRoster.reduce((s, m) => s + STATS.reduce((t, k) => t + m.stats[k], 0), 0) / playerRoster.length
        : Infinity
      const underdog = avgTotal < perMonsterBudget * RIVAL_BAND_MIN
      return (
        <>
          {header}
          <div className="card">
            <div className="section-title">{lb.tournamentName} — {lb.league} League</div>
            <p className="sub">{lore?.intro ?? `${lb.tournamentName} is under way.`}</p>
            <p className="dim">Prize on the line: up to {tourney?.rewards.gold ?? lb.goldReward}g for 1st place, {lb.fieldSize} teams competing round robin.</p>
            {underdog && (
              <p className="dim">
                ⚠ The field here fights at the {lb.league}-league standard, and your team looks young for it —
                a rough day is normal. Every match is experience; champions grow into their first cups, not through them.
              </p>
            )}
            <div className="carerow" style={{ justifyContent: 'center' }}>
              <button className="enter" onClick={() => setBattleSub('bracket')}>Enter the Cup →</button>
            </div>
          </div>
        </>
      )
    }

    if (battleSub === 'bracket') {
      const opponentIsA = currentMatch ? currentMatch.bLabel === 'Your Team' : false
      const opponentTeam = currentMatch ? (opponentIsA ? currentMatch.teamA : currentMatch.teamB) : null
      const opponentLabel = currentMatch ? (opponentIsA ? currentMatch.aLabel : currentMatch.bLabel) : null
      const tier = scouted[matchIdx]
      const buyScout = (t: 'basic' | 'full') => {
        const fee = scoutFee(lb.league, t)
        if (game.gold < fee) return
        setGame((g) => ({ ...g, gold: g.gold - fee }))
        setScouted((s) => ({ ...s, [matchIdx]: t }))
      }
      return (
        <>
          {header}
          <p className="sub">{lb.tournamentName} — {lb.league} league, {lb.fieldSize} teams, round robin.</p>
          <div className="card">
            <div className="section-title">Bracket</div>
            <BracketGrid standings={lb.standings} allMatches={lb.matches} revealed={revealedMatches} />
          </div>
          {otherMatches.length > 0 && (
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="section-title">Other results</div>
              {otherMatches.map((m, i) => (
                <div key={i} className="dim" style={{ fontSize: 12, padding: '2px 0' }}>
                  {teamName(m.aLabel, lb.matches)} vs {teamName(m.bLabel, lb.matches)} — {m.result.winner === 'draw' ? 'draw' : `${teamName(m.result.winner === 'A' ? m.aLabel : m.bLabel, lb.matches)} wins`}
                </div>
              ))}
            </div>
          )}
          {!allMatchesShown && currentMatch && opponentTeam ? (
            <div className="card">
              <div className="section-title">Next up: {opponentLabel ? teamName(opponentLabel, lb.matches) : ''}</div>
              <div className="scout-report">
                {opponentTeam.map((m, i) => <ScoutReport key={i} m={m} tier={tier} />)}
              </div>
              {tier !== 'full' && (
                <div className="carerow" style={{ marginTop: 8 }}>
                  {!tier && (
                    <button className="ghost" disabled={game.gold < scoutFee(lb.league, 'basic')} onClick={() => buyScout('basic')}>
                      🔍 Scout class &amp; loadout — {scoutFee(lb.league, 'basic')}g
                    </button>
                  )}
                  <button className="ghost" disabled={game.gold < scoutFee(lb.league, 'full')} onClick={() => buyScout('full')}>
                    🔍 Full scouting report — {scoutFee(lb.league, 'full')}g
                  </button>
                </div>
              )}
              <div className="carerow" style={{ justifyContent: 'center', marginTop: 8 }}>
                <button className="enter" onClick={() => setBattleSub('fight')}>Fight →</button>
              </div>
            </div>
          ) : (
            <div className="carerow" style={{ justifyContent: 'center' }}>
              <button className="enter" onClick={() => setBattleSub('announce')}>See Results →</button>
            </div>
          )}
        </>
      )
    }

    if (battleSub === 'fight' && currentMatch) {
      return (
        <>
          {header}
          <p className="sub">Match {matchIdx + 1} of {playerMatches.length}: {teamName(currentMatch.aLabel, lb.matches)} vs {teamName(currentMatch.bLabel, lb.matches)}</p>
          <ArenaBattle key={matchIdx} teamA={currentMatch.teamA} teamB={currentMatch.teamB} result={currentMatch.result} league={lb.league} playerSide={currentMatch.aLabel === 'Your Team' ? 'A' : 'B'} onDone={() => setBattleOver(true)} />
          {battleOver && (
            <div className="carerow" style={{ justifyContent: 'center' }}>
              <button className="enter" onClick={() => { setBattleOver(false); setMatchIdx((i) => i + 1); setBattleSub('bracket') }}>
                ← Back to Bracket
              </button>
            </div>
          )}
        </>
      )
    }

    // battleSub === 'announce'
    return (
      <>
        {header}
        <div className="card">
          <div className="section-title">🏆 {lb.tournamentName} — Final Results</div>
          <BracketGrid standings={lb.standings} allMatches={lb.matches} revealed={lb.matches} />
          {lore?.outroFlavour && <p className="sub">{lore.outroFlavour}</p>}
          <div className="battle-summary">
            {lb.goldReward > 0
              ? `You finished ${placementLabel(lb.playerPlacement)} of ${lb.fieldSize}! +${lb.goldReward}g${lb.expNote ? ` · training bonus: ${lb.expNote}` : ''}`
              : `You finished ${placementLabel(lb.playerPlacement)} of ${lb.fieldSize} — no reward this time. Train harder and try again.`}
          </div>
        </div>
        <div className="carerow" style={{ justifyContent: 'center' }}>
          <button className="enter" onClick={() => setPhase('feeding')}>Continue →</button>
        </div>
      </>
    )
  }

  const currentCareer = game.stable[decisionIdx]
  const currentPlan: WeekPlanEntry = weekPlan[currentCareer.id] || { activity: 'rest', food: '' }

  const advanceFeeding = () => {
    if (decisionIdx < game.stable.length - 1) setDecisionIdx((i) => i + 1)
    else {
      setPhase('stable')
      setSelectedMonsterId(game.stable.find((c) => !c.retired)?.id ?? game.stable[0].id)
    }
  }

  // --- Feeding: sequential per-monster, food only (each monster has its own
  // tastes, so a single bulk-feed button can't work) — happens BEFORE the
  // stable screen every week.
  if (phase === 'feeding') {
    const st = stageInfo(currentCareer.ageWeeks, currentCareer.species.lifespan)
    return (
      <>
        {game.pendingEvent && (
          <EventModal pe={game.pendingEvent} gold={game.gold}
            onChoose={(i) => setGame((g) => resolveEvent(g, i))} />
        )}
        <div className="ranchtop">
          <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>← 🏛 Town</button>
          <span>📅 {dateLabel(game.week)}</span>
          <span>🪙 {game.gold}g</span>
          <span>Feeding {decisionIdx + 1}/{game.stable.length}</span>
          {decisionIdx > 0 && <button className="ghost" onClick={() => setDecisionIdx((i) => i - 1)}>← Previous</button>}
        </div>
        <p className="sub">Feed {currentCareer.name} for the week.</p>

        {isInjured(currentCareer) && (
          <TipBanner game={game} setGame={setGame} id="injury">
            {currentCareer.name} is hurt. Injuries only mend by <b>Resting</b> for a week or paying the
            Town <b>Infirmary</b> — training won't fix HP, and an injured monster fights badly.
          </TipBanner>
        )}
        {decisionIdx === 0 && (game.lastWeek?.length ?? 0) > 0 && (
          <div className="card lastweek">
            <div className="section-title">Last week</div>
            {game.lastWeek.map((l, i) => (
              <DigestLine key={i} text={l} className={l.startsWith('🏟') || l.startsWith('🏁') ? 'lw-hl' : 'dim'} />
            ))}
          </div>
        )}

        <div className="career">
          {/* Compact feeding card: just what the feeding decision needs —
              condition, identity, preferences. Full stats/loadout live on the
              stable screen. */}
          <div className="card">
            <div className="careerbar">
              <span>{currentCareer.species.name} · {classForStats(currentCareer.stats)}</span>
              <span>{st.stage} · age {st.ageYears}y / {currentCareer.species.lifespan}y · {LEAGUES[currentCareer.licenseIndex].name}</span>
            </div>
            <div className="feedhead">
              <Sprite species={currentCareer.species} size={72} stage={st.stage} />
              <div>
                <div className="name">{currentCareer.name}</div>
                <div className="meta">Food preferences: <b className="up">♥ {foodName(currentCareer.favouriteFood)}</b> · <b className="down">✖ {foodName(currentCareer.hatedFood)}</b></div>
              </div>
            </div>
            <ConditionMeters hp={currentCareer.hp} mp={currentCareer.mp} stamina={currentCareer.stamina} happiness={currentCareer.happiness} stats={currentCareer.stats} />
          </div>

          <div className="card actions">
            {currentCareer.retired ? (
              <div className="retired">🏁 {currentCareer.name} has retired and can no longer compete.</div>
            ) : (
              <>
                <div className="section-title">Food — buy 1 this week</div>
                <div className={'foodgroups' + (currentPlan.food || currentPlan.forage ? '' : ' foods-missing')}>
                  {([['normal', 'Rations'], ['training', 'Training foods'], ['premium', 'Premium']] as [FoodTier, string][]).map(([tier, label]) => {
                    const discounted = tier === 'normal' ? game.pantryContract : game.grandLarder
                    return (
                      <div className="foodgroup" key={tier}>
                        <div className="foodgroup-h">{label}{discounted ? ' · 🛒 −20%' : ''}</div>
                        <div className="foods">
                          {FOODS.filter((f) => f.tier === tier).map((f) => {
                            const price = Math.max(1, Math.round(game.foodMarket[f.id] * foodDiscountFor(game, f.id)))
                            const afford = game.gold >= price
                            const selected = currentPlan.food === f.id
                            const eff = foodEffectLabel(f, currentCareer)
                            return (
                              <button key={f.id} className={`food ${f.tier}${selected ? ' selected' : ''}`} disabled={!afford}
                                onClick={() => setPlanFor(currentCareer.id, { ...currentPlan, food: selected ? '' : f.id, forage: false })}
                                title={f.desc}>
                                <span className="food-top">{f.icon} {f.name}{selected ? ' ✓' : ''}</span>
                                <span className={'food-eff ' + eff.cls}>{eff.primary}</span>
                                {eff.cost && <span className="food-cost">{eff.cost}</span>}
                                <span className="food-price">{price}g</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Forage fallback (user spec): only when nearly broke (< 10g) —
                    a free "feed" that costs stamina + happiness so a skint player is
                    never soft-locked out of advancing. */}
                {game.gold < 10 && (
                  <button className={'forage-option' + (currentPlan.forage ? ' selected' : '')}
                    onClick={() => setPlanFor(currentCareer.id, { ...currentPlan, food: '', forage: !currentPlan.forage })}>
                    <span className="forage-top">🌿 Forage for the week{currentPlan.forage ? ' ✓' : ''}</span>
                    <span className="forage-sub">no gold — but −{FORAGE_STAMINA_COST} stamina · −{FORAGE_HAPPINESS_COST} happiness</span>
                  </button>
                )}
                <PlanBenefit career={currentCareer} plan={currentPlan} />
              </>
            )}
            <div className="carerow" style={{ marginTop: '1rem' }}>
              <button
                className="enter"
                disabled={!currentCareer.retired && !currentPlan.food && !currentPlan.forage}
                title={!currentCareer.retired && !currentPlan.food && !currentPlan.forage ? 'Pick a food (or forage) for this monster first' : undefined}
                onClick={advanceFeeding}
              >
                {decisionIdx < game.stable.length - 1 ? 'Next Monster →' : 'Continue to Stable →'}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // --- Stable screen (§1c): free-navigation stable strip + detail panel +
  // training row condensed by stat, with a persistent right-hand action rail.
  const selectedCareer = game.stable.find((c) => c.id === selectedMonsterId) ?? game.stable[0]
  const selM = careerMonster(selectedCareer)
  const selProf = trainingProfileFor(selectedCareer.species)
  const selPlan: WeekPlanEntry = weekPlan[selectedCareer.id] || { activity: 'rest', food: '' }
  const setSelActivity = (activity: string) =>
    setPlanFor(selectedCareer.id, { ...selPlan, activity })

  const activityName = (p?: WeekPlanEntry) => {
    if (!p) return null
    if (p.activity === 'rest') return '😴 Resting'
    if (p.activity === 'excursion') return '🧭 Excursion'
    const d = [...BASIC_DRILLS, ...INTENSIVE_DRILLS].find((x) => x.id === p.activity)
    return d ? `💪 ${d.name}` : null
  }

  const currentMonth = monthOfWeek(game.week)
  const currentWeek = weekOfMonth(game.week)
  const isCurrentMonth = calendarMonth === currentMonth
  const tournamentsThisMonth = tournamentCalendarFor(game.seed, yearOfWeek(game.week)).filter((t) => t.month === calendarMonth)
  const visibleLeagues = LEAGUES.slice(0, visibleLeagueCount(game))
  const visibleTournamentsThisMonth = tournamentsThisMonth.filter((t) => visibleLeagues.some((lg) => lg.name === t.league))
  const isTrialMonth = RANK_UP_MONTHS.includes(calendarMonth)
  const selectedTournament = visibleTournamentsThisMonth.find((t) => t.id === selectedTournamentId) ?? null

  const doAdvanceWeek = () => {
    // advanceWeek consumes game.weekPlans and carries each ACTIVITY into the
    // new week itself (food resets — it's bought fresh weekly).
    const next = advanceWeek(game)
    setGame(next)
    setCalendarMonth(monthOfWeek(next.week))
    setDecisionIdx(0)
    setBattleOver(false)
    setMatchIdx(0)
    setBattleSub('preamble')
    setScouted({})
    setSelectedMonsterId(next.stable.find((c) => !c.retired)?.id ?? next.stable[0]?.id ?? '')
    setPhase(next.lastBattle ? 'battle' : 'feeding')
  }

  // Signed-up event name for the status strip.
  const pendingEventName = game.pendingTournament
    ? tournamentCalendarFor(game.seed, yearOfWeek(game.week)).find((t) => t.id === game.pendingTournament!.tournamentId)?.name
    : null

  return (
    <>
      {/* Persistent status strip: gold + date were previously invisible on the
          stable screen, where every economic decision actually happens. */}
      <div className="ranchtop">
        <button className="ghost" onClick={() => setGame((g) => goto(g, 'town'))}>← 🏛 Town</button>
        <span>📅 {dateLabel(game.week)}</span>
        <span>🪙 {game.gold}g</span>
        {pendingEventName && <span className="up">✅ {pendingEventName}</span>}
      </div>
      <div className="feedok">✓ feeding complete for this week — plan training below, or check the calendar</div>
      {isRankUpWeek(game.week) && (
        <TipBanner game={game} setGame={setGame} id="rankup">
          ⭐ Rank-up trials run THIS week — if a monster's best stat is near its league cap, promote it
          from its detail panel before advancing. The next trials are months away.
        </TipBanner>
      )}

      <div className="stablescreen">
        <div className="stablemain">
          {/* Stable strip */}
          <div className="stablestrip">
            {game.stable.map((c) => {
              const label = activityName(weekPlan[c.id])
              return (
                <div key={c.id} className={'stablecard' + (c.id === selectedCareer.id ? ' selected' : '') + (c.retired ? ' retired' : '')}
                  onClick={() => { setSelectedMonsterId(c.id); setAbilityEditorFor(null); setShowHistoryFor(null); setRenamingId(null) }}>
                  <Sprite species={c.species} size={40} stage={stageInfo(c.ageWeeks, c.species.lifespan).stage} />
                  <span className="bn">{c.name}</span>
                  <div className="dim" style={{ fontSize: 10.5 }}>{c.species.name}</div>
                  {c.retired ? <span className="stablechip warn">🏁 retired</span>
                    : label ? <span className="stablechip ok">{label}</span>
                      : <span className="stablechip warn">😴 rest (no plan set)</span>}
                  {!c.retired && isInjured(c) && <span className="stablechip hurt">🩹 injured</span>}
                  {!c.retired && canRankUp(c) && <span className="stablechip star">⭐ trial ready</span>}
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          <div className="detailgrid">
            <div className="card detail-portrait">
              <Sprite species={selectedCareer.species} size={96} stage={stageInfo(selectedCareer.ageWeeks, selectedCareer.species.lifespan).stage} />
              <div className="detail-namerow">
                {renamingId === selectedCareer.id ? (
                  <input autoFocus defaultValue={selectedCareer.name} className="detail-nameinput" maxLength={24}
                    onBlur={(e) => { setGame((g) => renameMonster(g, selectedCareer.id, e.target.value)); setRenamingId(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                ) : (
                  <>
                    <span className="bn">{selectedCareer.name}</span>
                    <button className="ghost iconbtn" title="rename" onClick={() => setRenamingId(selectedCareer.id)}>✎</button>
                  </>
                )}
              </div>
              <div className="dim" style={{ fontSize: 11 }}>{selectedCareer.species.name} · {selM.className}
                {(selectedCareer.potential ?? 1) > 1 && (
                  <span className="potential" title={`Bloodline potential ×${(selectedCareer.potential ?? 1).toFixed(2)} — trains ${Math.round(((selectedCareer.potential ?? 1) - 1) * 100)}% above the normal league ceiling`}> · {'★'.repeat(Math.round(((selectedCareer.potential ?? 1) - 1) / BREEDING_BONUS))} ×{(selectedCareer.potential ?? 1).toFixed(2)}</span>
                )}
              </div>
              {(() => {
                const st = stageInfo(selectedCareer.ageWeeks, selectedCareer.species.lifespan)
                return <div className="dim" style={{ fontSize: 11 }}>{st.stage} · age {st.ageYears}y / {selectedCareer.species.lifespan}y · {LEAGUES[selectedCareer.licenseIndex].name} league</div>
              })()}

              <button className="detail-actionbtn" disabled={game.pendingTournament?.monsterIds.includes(selectedCareer.id) ?? false}
                onClick={() => setAbilityEditorFor(abilityEditorFor === selectedCareer.id ? null : selectedCareer.id)}>
                ⚔ Edit Abilities{game.pendingTournament?.monsterIds.includes(selectedCareer.id) ? ' (locked — competing)' : ''}
              </button>
              <button className="detail-actionbtn" onClick={() => setShowHistoryFor(showHistoryFor === selectedCareer.id ? null : selectedCareer.id)}>
                🏆 Tournament History
              </button>
              {showHistoryFor === selectedCareer.id && (
                <div className="tour-history">
                  <div className="tour-history-podiums">
                    🏆 {selectedCareer.tournamentHistory.filter((h) => h.placement <= 3).length} podium finishes
                  </div>
                  {selectedCareer.tournamentHistory.length === 0
                    ? <div className="dim">No tournaments entered yet.</div>
                    : selectedCareer.tournamentHistory.slice().reverse().map((h, i) => (
                      <div className="tour-history-row" key={i}>
                        <span>{h.name} <span className="dim">· {h.league}</span></span>
                        <span className={h.placement <= 3 ? 'pos' : 'dim'}>{placementLabel(h.placement)} of {h.fieldSize}</span>
                      </div>
                    ))}
                </div>
              )}

              <ConditionMeters hp={selectedCareer.hp} mp={selectedCareer.mp} stamina={selectedCareer.stamina} happiness={selectedCareer.happiness} stats={selectedCareer.stats} />
            </div>

            <div className="card detail-stats">
              {STATS.map((s) => {
                // Same ▲/▴/▼ aptitude vocabulary as the Market/Bestiary marks —
                // the stat is already the row label, so the tag is just the
                // arrow + magnitude, tinted to the stat.
                const tag = selProf.major === s ? '▲ +20%' : selProf.minor === s ? '▴ +10%' : selProf.flaw === s ? '▼ −20%' : ''
                return (
                  <div className="detailstat" key={s}>
                    {/* Aptitude tag sits right beside its stat's name — parked
                        at the row's far end it read as a detached floater. */}
                    <span style={{ color: STAT_COLOR[s], fontWeight: 700 }}>{s}</span>
                    <span className="detailstat-tag" style={{ color: STAT_COLOR[s] }}>{tag}</span>
                    <span className="bar"><i style={{ width: `${Math.min(100, (selectedCareer.stats[s] / LEAGUES[selectedCareer.licenseIndex].cap) * 100)}%`, background: STAT_COLOR[s] }} /></span>
                    <span className="v">{selectedCareer.stats[s]}</span>
                  </div>
                )
              })}
              {/* Battle kit at a glance — previously invisible on this screen
                  without opening the ability editor, leaving this card mostly
                  empty space below the six stat rows. */}
              <div className="detail-kit">
                <div className="detail-kit-h">Battle kit</div>
                {selM.loadout.map((mv) => (
                  <div className="detail-kit-move" key={mv.id}>
                    <span className="lvl">{mv.stat}</span>
                    <span>{mv.element ? ELEMENT_ICON[mv.element] + ' ' : ''}{mv.name}</span>
                    <span className="dim">{manaCost(mv)} MP · cd {mv.cooldown}</span>
                  </div>
                ))}
                {selM.loadout.length === 0 && <div className="dim">No moves learned yet — train a stat past 40.</div>}
                <div className="detail-kit-innate">
                  <span className="lvl">✦</span>
                  <span>{selM.species.innate[selM.activeInnate]?.name}</span>
                  <span className="dim">{selM.species.innate[selM.activeInnate]?.desc}</span>
                </div>
              </div>
              {canRankUp(selectedCareer) && (
                isRankUpWeek(game.week) ? (
                  <button className="carerow rankup" style={{ width: '100%', marginTop: 10 }}
                    disabled={game.gold < rankUpFee(selectedCareer)}
                    onClick={() => setGame((g) => promoteMonster(g, selectedCareer.id))}>
                    ⭐ Rank-up trial · {rankUpFee(selectedCareer)}g → {LEAGUES[selectedCareer.licenseIndex + 1].name} league
                  </button>
                ) : (
                  <div className="hint" style={{ marginTop: 10 }}>
                    ⭐ Ready for the {LEAGUES[selectedCareer.licenseIndex + 1].name} rank-up trial — trials run
                    Week {RANK_UP_WEEK} of months {RANK_UP_MONTHS.join(', ')}.
                  </div>
                )
              )}
            </div>
          </div>

          {/* Ability editor OR training row */}
          {abilityEditorFor === selectedCareer.id ? (
            <AbilitySelector
              m={selM}
              name={selectedCareer.name}
              onSetLoadout={(ids) => setGame((g) => setLoadout(g, selectedCareer.id, ids))}
              onSetInnate={(index) => setGame((g) => setActiveInnate(g, selectedCareer.id, index))}
              onSetTactics={(t) => setGame((g) => setTactics(g, selectedCareer.id, t))}
              onClose={() => setAbilityEditorFor(null)}
              teamTacticsOpen={teamTacticsUnlocked(game)}
            />
          ) : selectedCareer.retired ? (
            <div className="retired">🏁 {selectedCareer.name} has retired and can no longer train.</div>
          ) : (
            <>
              <div className="section-title">Training</div>
              <div className="trainrow">
                {STATS.map((stat) => {
                  const basic = BASIC_DRILLS.find((d) => primaryStatOf(d) === stat)!
                  const intensives = INTENSIVE_DRILLS.filter((d) => primaryStatOf(d) === stat)
                  return (
                    <div className="traincol" key={stat}>
                      <div className="traincol-h" style={{ color: STAT_COLOR[stat] }}>{stat}</div>
                      <TrainBlock d={basic} career={selectedCareer} food={selPlan.food} forage={selPlan.forage} selected={selPlan.activity === basic.id} onClick={() => setSelActivity(basic.id)} />
                      {intensives.map((d) => (
                        <TrainBlock key={d.id} d={d} career={selectedCareer} food={selPlan.food} forage={selPlan.forage} selected={selPlan.activity === d.id} onClick={() => setSelActivity(d.id)} />
                      ))}
                    </div>
                  )
                })}
                <div className="traincol">
                  <div className="traincol-h dim">OTHER</div>
                  {(() => {
                    const restPrev = previewWeekEffects(selectedCareer, 'rest', selPlan.food, selPlan.forage)
                    const excPrev = previewWeekEffects(selectedCareer, 'excursion', selPlan.food, selPlan.forage)
                    return (
                      <>
                        <button className={'trainblock' + (selPlan.activity === 'rest' ? ' selected' : '')} onClick={() => setSelActivity('rest')}>
                          <div className="trainblock-name">Rest</div>
                          <div className="trainblock-sub">
                            <span className="benefit-gain">+{restPrev.staminaDelta} stam</span>
                            {restPrev.hpDelta > 0 && <>, <span className="benefit-gain">+{restPrev.hpDelta} HP</span></>}
                            {restPrev.mpDelta > 0 && <>, <span className="benefit-gain">+{restPrev.mpDelta} MP</span></>}
                          </div>
                        </button>
                        <button className={'trainblock' + (selPlan.activity === 'excursion' ? ' selected' : '')} onClick={() => setSelActivity('excursion')}>
                          <div className="trainblock-name">Excursion</div>
                          <div className="trainblock-sub"><span className="benefit-gain">+{excPrev.goldDelta}g</span>, <span className="benefit-malus">{excPrev.staminaDelta} stam</span></div>
                        </button>
                      </>
                    )
                  })()}
                </div>
              </div>
              <div className="hint">Rolls skew toward the top of the range as happiness rises · always some random variation.</div>
            </>
          )}

          {/* Tournament calendar (toggled from the rail) */}
          {showCalendar && (
            <div className="card loc" style={{ marginTop: 12 }} ref={calendarRef}>
              <div className="loc-h">
                <span>📅 Tournament Calendar</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="ghost" onClick={() => setCalendarMonth((mo) => mo === 1 ? 12 : mo - 1)}>◀</button>
                  <span>Month {calendarMonth}{isCurrentMonth ? ` · Week ${currentWeek} now` : ''}</span>
                  <button className="ghost" onClick={() => setCalendarMonth((mo) => mo === 12 ? 1 : mo + 1)}>▶</button>
                </div>
              </div>
              <div className="hint">
                Tournaments this month: {visibleTournamentsThisMonth.length}. Click a 🏆 for entry details.
                {isTrialMonth && ` · ⭐ rank-up trials run Week ${RANK_UP_WEEK}.`}
              </div>

              {/* True calendar grid: one row per VISIBLE league (leagues unlock
                  with progress), one column per week — always drawn in full,
                  empty cells included (user spec 2026-07-19). */}
              <div className="calgrid">
                {visibleLeagues.map((lg, li) => {
                  const t = visibleTournamentsThisMonth.find((x) => x.league === lg.name)
                  const signedHere = t && game.pendingTournament?.tournamentId === t.id
                  const alreadyEntered = t && (game.enteredThisMonth ?? []).includes(t.id)
                  const isPastWeek = t && isCurrentMonth && currentWeek > t.week
                  const icon = signedHere ? '✅' : alreadyEntered ? '✔' : isPastWeek ? '➖' : '🏆'
                  const isOpenNow = t && isCurrentMonth && currentWeek === t.week && !alreadyEntered && !signedHere
                  const hasTrial = isTrialMonth && li < LEAGUES.length - 1
                  return (
                    <div className="calgrid-row" key={lg.name}>
                      <div className="calgrid-label">
                        {lg.name} <span className="dim">{teamSizeForLeague(lg.name)}v{teamSizeForLeague(lg.name)}</span>
                      </div>
                      {[1, 2, 3, 4].map((w) => (
                        <div key={w} className={'calgrid-cell' + (isCurrentMonth && w === currentWeek ? ' now' : '')}>
                          {t && w === t.week && (
                            <button
                              className={'calicon' + (isOpenNow ? ' open' : '') + (selectedTournamentId === t.id ? ' selected' : '')}
                              onClick={() => setSelectedTournamentId(t.id)}
                              title={`${t.name} — Week ${t.week}`}
                            >
                              {icon}
                            </button>
                          )}
                          {hasTrial && w === RANK_UP_WEEK && (
                            <span className="calicon trial" title={`${lg.name} rank-up trial — take it from the monster panel this week`}>⭐</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
                <div className="calgrid-row calgrid-footer">
                  <div className="calgrid-label" />
                  {[1, 2, 3, 4].map((w) => (
                    <div key={w} className={'calgrid-wk' + (isCurrentMonth && w === currentWeek ? ' now' : '')}>Wk {w}</div>
                  ))}
                </div>
              </div>
              <div className="hint">🏆 open · ✅ signed up · ✔ competed · ➖ missed · ⭐ rank-up trials</div>

              {selectedTournament ? (() => {
                const t = selectedTournament
                const teamSize = teamSizeForLeague(t.league)
                const eligible = eligibleForTournament(game, t)
                const tIdx = leagueIndexOf(t.league)
                const isGuest = (c: Career) => c.licenseIndex < tIdx // licensed-leader rule: allowed, but someone must hold the license
                const signedHere = game.pendingTournament?.tournamentId === t.id
                const signedMonsters = signedHere ? game.stable.filter((c) => game.pendingTournament!.monsterIds.includes(c.id)) : []
                const alreadyEntered = (game.enteredThisMonth ?? []).includes(t.id)
                const isOpenWeek = isCurrentMonth && currentWeek === t.week
                const rawPickIds = (teamPick[t.id] ?? []).filter((id) => eligible.some((c) => c.id === id))
                // For 1v1 the select DEFAULTS to the first eligible monster — the
                // effective pick must include that default so the warnings below
                // render before the player ever touches the dropdown.
                const pickIds = teamSize === 1 && rawPickIds.length === 0 && eligible[0] ? [eligible[0].id] : rawPickIds
                const pickedCareers = pickIds.map((id) => eligible.find((c) => c.id === id)!).filter(Boolean)
                const teamFull = pickedCareers.length === teamSize
                const hasLeader = teamHasLicensedLeader(game, t, pickIds)
                const mult = teamFull ? rewardMultiplier(Math.min(...pickedCareers.map((c) => c.licenseIndex)), t.league) : 1
                const fatigued = pickedCareers.filter((c) => staminaDamageMult(c.stamina) < 1)
                const injured = pickedCareers.filter(isInjured)
                const condition = (c: Career) => {
                  const parts: string[] = []
                  if (c.hp < maxHp(c.stats)) parts.push(`${c.hp}/${maxHp(c.stats)} HP`)
                  if (maxMana(c.stats) > 0 && c.mp < maxMana(c.stats)) parts.push(`${c.mp}/${maxMana(c.stats)} MP`)
                  return parts.length ? ` · ${isInjured(c) ? '🩹 ' : ''}${parts.join(', ')}` : ''
                }
                return (
                  <div className="tour-entry" ref={entryRef}>
                    <div className="tour-entry-head">
                      <div><b>{t.name}</b> — {t.league} league · Week {t.week} · {teamSize === 1 ? '1v1' : `${teamSize}v${teamSize}`}</div>
                      <button className="ghost" onClick={() => setSelectedTournamentId(null)}>✕</button>
                    </div>
                    <div className="dim">
                      Entry: {entryFee(t.league)}g (refunded if you cancel) · Rewards: {t.rewards.gold}g + training exp,
                      scaled by final placement (round-robin vs the rest of the field)
                    </div>
                    {game.gold < entryFee(t.league) && !signedHere && !alreadyEntered && (
                      <div className="neg" style={{ fontSize: 12 }}>Not enough gold for the {entryFee(t.league)}g entry fee.</div>
                    )}
                    {isOpenWeek && !alreadyEntered && (
                      <TipBanner game={game} setGame={setGame} id="signup">
                        Your team fights every other team once, round robin. Rivals fight at the league's own fixed
                        standard — scout the field below, then pick monsters and loadouts to match. Win or lose,
                        everyone comes home needing rest.
                      </TipBanner>
                    )}
                    {isOpenWeek && !alreadyEntered && (() => {
                      // Rival teams are week-seeded, so this preview IS the real field.
                      const rivalTeams = generateRivalTeamsForTournament(game, t)
                      return (
                        <details className="scout-field">
                          <summary>🔍 Scout the field — {rivalTeams.length} rival teams</summary>
                          {rivalTeams.map((team, r) => {
                            const key = `${t.id}:${r}`
                            const tier = fieldScout[key]
                            const basicFee = scoutFee(t.league, 'basic')
                            const fullFee = scoutFee(t.league, 'full')
                            const gp = GAMEPLANS[gameplanForRivalTeam(game.seed, game.week, t.id, r)]
                            return (
                              <div key={key} className="scout-report">
                                <div className="section-title">Rival Team {r + 1}</div>
                                {/* Gameplan reveal (LOOP_DESIGN Phase 3): the tactical intel scouting
                                    is FOR — revealed with the basic tier alongside class + loadout. */}
                                {tier ? (
                                  <div className="gameplan">
                                    <div className="gp-h">{gp.icon} {gp.name} <span className="dim">· {gp.tell}</span></div>
                                    <div className="gp-counter">💡 {gp.counter}</div>
                                  </div>
                                ) : (
                                  <div className="gameplan locked"><div className="gp-h dim">🧠 Gameplan: ?? — scout to reveal</div></div>
                                )}
                                {team.map((m, i) => <ScoutReport key={i} m={m} tier={tier} />)}
                                {/* Kill order (wave 2): only while signed up — the mark lives on the pending entry. */}
                                {signedHere && team.length > 1 && (
                                  <div className="protectrow">
                                    <span className="dim" title="Your whole team strikes the marked monster first while it can be reached (melee must break the front line first)">🎯 Mark:</span>
                                    <button className={'tacticopt small' + (game.pendingTournament?.marks?.[r] === undefined ? ' on' : '')}
                                      onClick={() => setGame((g) => setMarkTarget(g, r, null))}>Nobody</button>
                                    {team.map((m, i) => (
                                      <button key={i} className={'tacticopt small' + (game.pendingTournament?.marks?.[r] === i ? ' on' : '')}
                                        onClick={() => setGame((g) => setMarkTarget(g, r, i))}>
                                        {m.name}{rowOfSlot(i, team.length) === 'back' ? ' 🏹' : ''}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className="carerow">
                                  {!tier && (
                                    <button className="ghost" disabled={game.gold < basicFee}
                                      onClick={() => { setGame((g) => ({ ...g, gold: g.gold - basicFee })); setFieldScout((s) => ({ ...s, [key]: 'basic' })) }}>
                                      🔍 Class &amp; loadout — {basicFee}g
                                    </button>
                                  )}
                                  {tier !== 'full' && (
                                    <button className="ghost" disabled={game.gold < fullFee}
                                      onClick={() => { setGame((g) => ({ ...g, gold: g.gold - fullFee })); setFieldScout((s) => ({ ...s, [key]: 'full' })) }}>
                                      🔍 Full report — {fullFee}g
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </details>
                      )
                    })()}
                    {signedHere ? (
                      <div>
                        ✅ {signedMonsters.map((c) => c.name).join(', ') || '?'} compete{signedMonsters.length === 1 ? 's' : ''} this week{' '}
                        <button className="ghost" onClick={() => setGame((g) => cancelSignUp(g))}>Cancel</button>
                        {signedMonsters.length > 1 && (
                          <div className="protectrow">
                            <span className="dim" title="The team guards this monster: taunts fire sooner for it, heals go to it first">🛡 Protect:</span>
                            <button className={'tacticopt small' + (!game.pendingTournament?.protectId ? ' on' : '')}
                              onClick={() => setGame((g) => setProtectTarget(g, null))}>Nobody</button>
                            {signedMonsters.map((c) => (
                              <button key={c.id} className={'tacticopt small' + (game.pendingTournament?.protectId === c.id ? ' on' : '')}
                                onClick={() => setGame((g) => setProtectTarget(g, c.id))}>{c.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : alreadyEntered ? (
                      <div className="dim">✔ Already competed this month.</div>
                    ) : !isOpenWeek ? (
                      <div className="dim">
                        {!isCurrentMonth ? `Sign-ups open in Month ${t.month}, Week ${t.week}.`
                          : currentWeek < t.week ? `Sign-ups open on Week ${t.week} (currently Week ${currentWeek}).`
                            : `Week ${t.week} has passed for this event.`}
                      </div>
                    ) : eligible.length < teamSize ? (
                      <div className="dim">
                        Requires {teamSize} eligible monster{teamSize > 1 ? 's' : ''} — only {eligible.length} available.
                        {teamSize > 1 && ` (Guests one league below ${t.league} may join, but at least one member must hold the ${t.league} license.)`}
                      </div>
                    ) : game.pendingTournament ? (
                      <div className="dim">Already entered a tournament this week.</div>
                    ) : teamSize === 1 ? (
                      <>
                        <div className="carerow" style={{ marginTop: 6, alignItems: 'center' }}>
                          <select value={pickIds[0]} onChange={(ev) => setTeamPick((sp) => ({ ...sp, [t.id]: [ev.target.value] }))}>
                            {eligible.map((c) => <option key={c.id} value={c.id}>{c.name} ({LEAGUES[c.licenseIndex].name}){condition(c)}</option>)}
                          </select>
                          <button className="signup" onClick={() => setGame((g) => signUp(g, t.id, pickIds))}>Sign Up →</button>
                        </div>
                        {mult < 1 && pickedCareers[0] && (
                          <div className="dim">⚠ {pickedCareers[0].name} is above {t.league} league — rewards reduced to {Math.round(mult * 100)}%.</div>
                        )}
                        {fatigued[0] && (
                          <div className="neg" style={{ fontSize: 12 }}>
                            💤 {fatigued[0].name} is fatigued ({fatigued[0].stamina}/100 stamina) — will fight at
                            −{Math.round((1 - staminaDamageMult(fatigued[0].stamina)) * 100)}% damage.
                          </div>
                        )}
                        {injured[0] && (
                          <div className="neg" style={{ fontSize: 12 }}>
                            🩹 {injured[0].name} is injured ({injured[0].hp}/{maxHp(injured[0].stats)} HP, {injured[0].mp}/{maxMana(injured[0].stats)} MP)
                            — it will ENTER the fight like this. Rest first unless you mean it.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <TeamPicker pool={eligible} teamSize={teamSize} monsterIds={pickIds} onChange={(ids) => setTeamPick((sp) => ({ ...sp, [t.id]: ids }))} />
                        <div className="carerow" style={{ marginTop: 8 }}>
                          <button className="signup" disabled={!teamFull || !hasLeader} onClick={() => setGame((g) => signUp(g, t.id, pickIds))}>
                            {!teamFull ? `Pick ${teamSize - pickedCareers.length} more` : !hasLeader ? `Needs a ${t.league}-licensed leader` : 'Sign Up →'}
                          </button>
                        </div>
                        {teamFull && !hasLeader && (
                          <div className="neg" style={{ fontSize: 12 }}>
                            ⚠ Every picked monster is below {t.league} league — at least one member must hold the {t.league} license to vouch for the team.
                          </div>
                        )}
                        {pickedCareers.some(isGuest) && hasLeader && (
                          <div className="dim">🎫 {pickedCareers.filter(isGuest).map((c) => c.name).join(', ')} enter{pickedCareers.filter(isGuest).length === 1 ? 's' : ''} as a licensed leader's guest (one league below).</div>
                        )}
                        {mult < 1 && (
                          <div className="dim">⚠ your whole team is above {t.league} league — rewards reduced to {Math.round(mult * 100)}%.</div>
                        )}
                        {fatigued.length > 0 && (
                          <div className="neg" style={{ fontSize: 12 }}>
                            💤 {fatigued.map((c) => c.name).join(', ')} {fatigued.length === 1 ? 'is' : 'are'} fatigued — will fight at reduced damage.
                          </div>
                        )}
                        {injured.length > 0 && (
                          <div className="neg" style={{ fontSize: 12 }}>
                            🩹 {injured.map((c) => `${c.name} (${c.hp}/${maxHp(c.stats)} HP)`).join(', ')} — injured monsters ENTER the fight like this. Rest first unless you mean it.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })() : visibleTournamentsThisMonth.length > 0 && (
                <div className="dim tour-entry-hint">Click a tournament above to view entry details.</div>
              )}
            </div>
          )}
        </div>

        {/* Action rail */}
        <div className="rail">
          {(() => {
            // Every active monster needs a food chosen before the week can
            // advance (user spec 2026-07-22: "monsters always require food").
            const active = game.stable.filter((c) => !c.retired)
            const unfed = active.filter((c) => !weekPlan[c.id]?.food && !weekPlan[c.id]?.forage)
            const trainN = active.filter((c) => weekPlan[c.id] && weekPlan[c.id].activity !== 'rest' && weekPlan[c.id].activity !== 'excursion').length
            const excN = active.filter((c) => weekPlan[c.id]?.activity === 'excursion').length
            const restN = active.length - trainN - excN
            return (
              <>
                <button
                  className="railbtn primary"
                  disabled={unfed.length > 0}
                  title={unfed.length > 0 ? `${unfed.length} monster${unfed.length > 1 ? 's need' : ' needs'} food chosen first: ${unfed.map((c) => c.name).join(', ')}` : undefined}
                  onClick={doAdvanceWeek}
                >⏭<br />Advance<br />Week</button>
                <div className="rail-note" title="what Advance Week will resolve">
                  {unfed.length > 0
                    ? <div className="down">🍽 {unfed.length} unfed — pick food first</div>
                    : (
                      <>
                        <div>💪 {trainN} training</div>
                        <div>😴 {restN} resting</div>
                        {excN > 0 && <div>🧭 {excN} exploring</div>}
                      </>
                    )}
                  {pendingEventName && <div className="up">🏟 entered</div>}
                </div>
              </>
            )
          })()}
          <button className="railbtn" onClick={() => setGame((g) => goto(g, 'town'))}>🏛<br />Back to<br />Town</button>
          <button className={'railbtn' + (showCalendar ? ' on' : '')} onClick={() => setShowCalendar((v) => !v)}>📅<br />Tournaments</button>
        </div>
      </div>
    </>
  )
}

// --- Persistence: 3 independent save slots, each the whole GameState as plain JSON ---
const SAVE_SLOTS = 3
const LEGACY_SAVE_KEY = 'monster-tamer-save-v2' // pre-slot single save (v2: loadout/tournamentHistory)
const slotKey = (slot: number) => `monster-tamer-save-slot-${slot}`
const randomSeed = () => Math.random().toString(36).slice(2, 8)

function sanitizeAndMigrate(raw: string): GameState | null {
  try {
    const g = JSON.parse(raw)
    // sanity-check the save shape (older/foreign saves start fresh)
    if (typeof g?.week !== 'number' || !Array.isArray(g?.stable) || typeof g?.foodMarket !== 'object') return null
    // migrate pre-injury-system saves: monsters without tracked HP/MP wake at full
    for (const c of g.stable) {
      if (typeof c.hp !== 'number') c.hp = maxHp(c.stats)
      if (typeof c.mp !== 'number') c.mp = maxMana(c.stats)
      // migrate pre-innate-choice saves: both innates used to be always-on
      if (typeof c.activeInnate !== 'number') c.activeInnate = 0
      // Saves serialize the whole Species object, so ability descs/renames go
      // stale the moment species.ts changes — re-link to the live table by id.
      // (A species whose id itself was renamed keeps its stored snapshot.)
      const live = SPECIES.find((s) => s.id === c.species?.id)
      if (live) c.species = live
    }
    if (Array.isArray(g.frozen)) for (const f of g.frozen) {
      const live = SPECIES.find((s) => s.id === f.species?.id)
      if (live) f.species = live
    }
    // migrate pre-team-tournament saves: PendingTournament went from a single
    // `monsterId` to `monsterIds: string[]` — an old save carrying a live
    // sign-up would crash `.monsterIds.includes(...)` / `.map(...)`. Drop the
    // stale entry (sign-ups only ever last until the next weekly tick anyway).
    if (g.pendingTournament && !Array.isArray(g.pendingTournament.monsterIds)) g.pendingTournament = null
    if (g.pendingTournament && typeof g.pendingTournament.feePaid !== 'number') g.pendingTournament.feePaid = 0
    if (typeof g.weekPlans !== 'object' || g.weekPlans === null) g.weekPlans = {}
    if (!Array.isArray(g.lastWeek)) g.lastWeek = []
    // migrate pre-round-robin tournamentHistory: placement was 'champion'|'none'
    if (Array.isArray(g.stable)) for (const c of g.stable) {
      if (Array.isArray(c.tournamentHistory)) for (const h of c.tournamentHistory) {
        if (typeof h.placement !== 'number') { h.placement = h.placement === 'champion' ? 1 : 2; h.fieldSize = h.fieldSize ?? 2 }
      }
    }
    // migrate pre-title-screen saves: no trainer name/tutorial flag existed
    if (typeof g.trainerName !== 'string' || !g.trainerName) g.trainerName = 'Tamer'
    if (typeof g.tutorialEnabled !== 'boolean') g.tutorialEnabled = false // already playing — skip tips by default
    if (typeof g.tutorialDismissed !== 'boolean') g.tutorialDismissed = true
    if (!Array.isArray(g.tipsSeen)) g.tipsSeen = []
    // migrate pre-food-overhaul saves (2026-07-25): the single `bulkFood` perk
    // (20% off all food) becomes the Pantry Contract (normal foods); the new
    // Grand Larder (premium foods) starts unowned. Career lastFood/truffleReady
    // default absent — no migration needed.
    if (typeof g.pantryContract !== 'boolean') g.pantryContract = !!g.bulkFood
    if (typeof g.grandLarder !== 'boolean') g.grandLarder = false
    delete g.bulkFood
    // migrate pre-events saves (LOOP_DESIGN Phase 1): no pending incident
    if (g.pendingEvent === undefined) g.pendingEvent = null
    // migrate pre-rival saves (LOOP_DESIGN Phase 2): mint a primary rival so
    // returning players get one too
    if (!Array.isArray(g.rivals) || g.rivals.length === 0) g.rivals = [generateRival(g.seed, 0)]
    // migrate pre-trainer-XP saves (LOOP_DESIGN Phase 5); potential stays absent (= 1.0)
    if (typeof g.trainerXp !== 'number') g.trainerXp = 0
    return g as GameState
  } catch {
    return null
  }
}

function loadSlot(slot: number): GameState | null {
  const raw = localStorage.getItem(slotKey(slot))
  return raw ? sanitizeAndMigrate(raw) : null
}

function saveSlot(slot: number, game: GameState) {
  try { localStorage.setItem(slotKey(slot), JSON.stringify(game)) } catch { /* storage full/unavailable — play on */ }
}

// One-time migration: a save from before multi-slot support moves into slot 1
// so a returning player doesn't lose progress when this feature ships.
function migrateLegacySave() {
  try {
    if (localStorage.getItem(slotKey(1))) return
    const raw = localStorage.getItem(LEGACY_SAVE_KEY)
    if (!raw) return
    const g = sanitizeAndMigrate(raw)
    if (g) localStorage.setItem(slotKey(1), JSON.stringify(g))
  } catch { /* ignore */ }
}

function slotSummary(g: GameState) {
  const highestLeagueIdx = Math.max(0, ...g.stable.map((c) => c.licenseIndex), ...g.frozen.map((f) => f.licenseIndex))
  return {
    trainerName: g.trainerName || 'Tamer',
    date: dateLabel(g.week),
    gold: g.gold,
    monsterCount: g.stable.length,
    league: LEAGUES[highestLeagueIdx]?.name ?? LEAGUES[0].name,
  }
}

// ============================ Title screen & save flow ============================
function TitleScreen({ onNewGame, onContinue }: { onNewGame: () => void; onContinue: () => void }) {
  return (
    <div className="titlescreen">
      <div className="titlecard">
        <h1 className="titlelogo">Monster Tamer</h1>
        <p className="titletag">Raise it. Train it. Enter the circuit.</p>
        <div className="titlebtns">
          <button className="titlebtn primary" onClick={onNewGame}>
            <span>✨ New Game</span>
            <span className="btnsub">Start a fresh adventure in an open save slot</span>
          </button>
          <button className="titlebtn" onClick={onContinue}>
            <span>▶ Continue</span>
            <span className="btnsub">Resume from a saved game</span>
          </button>
        </div>
        <p className="titlever">v{APP_VERSION} · early alpha</p>
      </div>
    </div>
  )
}

// Small in-app modal — the native confirm()/prompt()/alert() dialogs looked
// jarring against the styled UI (and block the whole renderer while open).
function Modal({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

// Weekly incident (LOOP_DESIGN Phase 1): a choice with a trade-off, shown over
// the feeding screen. Choices with a gold cost above the wallet disable.
function EventModal({ pe, gold, onChoose }: { pe: PendingEvent; gold: number; onChoose: (i: number) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title">{pe.title}</div>
        <div className="modal-body"><p className="ev-body">{pe.body}</p></div>
        <div className="modal-actions ev-actions">
          {pe.choices.map((ch, i) => {
            const cant = ch.cost != null && ch.cost > gold
            return (
              <button key={i} className="ev-choice" disabled={cant} onClick={() => onChoose(i)}
                title={cant ? 'Not enough gold' : undefined}>
                <span className="ev-label">{ch.label}</span>
                {ch.note && <span className="ev-note">{ch.note}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SlotPicker({ mode, onBack, onPickEmpty, onPickOccupied }: {
  mode: 'new' | 'continue'
  onBack: () => void
  onPickEmpty: (slot: number) => void
  onPickOccupied: (slot: number) => void
}) {
  // Slot management (2026-07-25): delete (confirmed), export (downloads the
  // raw save JSON — cheap insurance while alpha migrations still bite), and
  // import (a .json backup file into an empty slot). `refresh` re-reads
  // localStorage after any of them.
  const [refresh, setRefresh] = useState(0)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<number | null>(null)
  const [confirmOverwriteSlot, setConfirmOverwriteSlot] = useState<number | null>(null)
  const [importError, setImportError] = useState(false)
  const importTarget = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const slots = useMemo(() => Array.from({ length: SAVE_SLOTS }, (_, i) => i + 1).map((slot) => ({ slot, game: loadSlot(slot) })),
    [refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const deleteSlot = (slot: number) => {
    localStorage.removeItem(slotKey(slot))
    setRefresh((r) => r + 1)
  }
  const exportSlot = (slot: number) => {
    const raw = localStorage.getItem(slotKey(slot))
    if (!raw) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    a.download = `monster-tamer-slot-${slot}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const onImportFile = async (file: File | undefined) => {
    const slot = importTarget.current
    importTarget.current = null
    if (!file || slot == null) return
    const g = sanitizeAndMigrate(await file.text())
    if (!g) { setImportError(true); return }
    localStorage.setItem(slotKey(slot), JSON.stringify(g))
    setRefresh((r) => r + 1)
  }
  return (
    <div className="titlescreen">
      <div className="titlecard slotcard">
        <h2>{mode === 'new' ? 'New Game — choose a slot' : 'Continue — choose a slot'}</h2>
        <div className="slotlist">
          {slots.map(({ slot, game }) => {
            const empty = !game
            const summary = game ? slotSummary(game) : null
            const disabled = mode === 'continue' && empty
            return (
              <div key={slot} className={'slotrow' + (empty ? ' empty' : '')}>
                <button
                  className="slotmain"
                  disabled={disabled}
                  onClick={() => (empty ? onPickEmpty(slot)
                    : mode === 'new' ? setConfirmOverwriteSlot(slot)
                      : onPickOccupied(slot))}
                >
                  <span className="slotnum">Slot {slot}</span>
                  {empty
                    ? <span className="slotmeta dim">— empty —{mode === 'new' ? ' (start here)' : ''}</span>
                    : (
                      <span className="slotmeta">
                        <b>{summary!.trainerName}</b> · {summary!.league} league · {summary!.date} · 🪙{summary!.gold}g · {summary!.monsterCount} monster{summary!.monsterCount === 1 ? '' : 's'}
                        {mode === 'new' && <span className="slotoverwrite"> · overwrite?</span>}
                      </span>
                    )}
                </button>
                <div className="slotactions">
                  {!empty && <button className="slotaction" title="Download this save as a JSON backup file" onClick={() => exportSlot(slot)}>⬇ Export</button>}
                  {!empty && <button className="slotaction danger" title="Delete this save" onClick={() => setConfirmDeleteSlot(slot)}>🗑 Delete</button>}
                  {empty && <button className="slotaction" title="Load a previously exported .json save backup into this slot" onClick={() => { importTarget.current = slot; fileInputRef.current?.click() }}>⬆ Import</button>}
                </div>
              </div>
            )
          })}
        </div>
        <button className="titlebtn back" onClick={onBack}>← Back</button>
        <input
          ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
          onChange={(e) => { void onImportFile(e.target.files?.[0]); e.target.value = '' }}
        />
        {confirmDeleteSlot != null && (
          <Modal
            title={`Delete the save in Slot ${confirmDeleteSlot}?`}
            actions={
              <>
                <button className="ghost" onClick={() => setConfirmDeleteSlot(null)}>Keep it</button>
                <button className="modal-danger" onClick={() => { deleteSlot(confirmDeleteSlot); setConfirmDeleteSlot(null) }}>🗑 Delete forever</button>
              </>
            }
          >
            This cannot be undone. Export a backup first if you might want it back.
          </Modal>
        )}
        {confirmOverwriteSlot != null && (
          <Modal
            title={`Overwrite Slot ${confirmOverwriteSlot}?`}
            actions={
              <>
                <button className="ghost" onClick={() => setConfirmOverwriteSlot(null)}>Keep it</button>
                <button className="modal-danger" onClick={() => { const s = confirmOverwriteSlot; setConfirmOverwriteSlot(null); onPickOccupied(s) }}>Overwrite it</button>
              </>
            }
          >
            Starting a new game here replaces the existing save. Export a backup first if you might want it back.
          </Modal>
        )}
        {importError && (
          <Modal
            title="Import failed"
            actions={<button className="ghost" onClick={() => setImportError(false)}>OK</button>}
          >
            That file doesn't look like a valid Monster Tamer save backup.
          </Modal>
        )}
      </div>
    </div>
  )
}

function NewGameSetup({ onBack, onStart }: { onBack: () => void; onStart: (trainerName: string, tutorialEnabled: boolean) => void }) {
  const [name, setName] = useState('')
  const [tutorial, setTutorial] = useState(true)
  const trimmed = name.trim()
  return (
    <div className="titlescreen">
      <div className="titlecard">
        <h2>Name your Tamer</h2>
        <input
          className="nameinput"
          value={name}
          maxLength={20}
          placeholder="Trainer name"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="tutorialtoggle">
          <input type="checkbox" checked={tutorial} onChange={(e) => setTutorial(e.target.checked)} />
          Show tutorial tips
        </label>
        <div className="titlebtns">
          <button className="titlebtn back" onClick={onBack}>← Back</button>
          <button className="titlebtn primary" disabled={!trimmed} onClick={() => onStart(trimmed, tutorial)}>Start Adventure →</button>
        </div>
      </div>
    </div>
  )
}

function AlphaDisclaimer({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="titlescreen">
      <div className="titlecard disclaimer">
        <h2>🚧 Early Alpha</h2>
        <p>
          Monster Tamer is very early in development. Expect rough edges, balance swings, and
          missing pieces as the game keeps growing.
        </p>
        <p>
          In particular: <b>breeding (fusion)</b> and much of the <b>Lab</b> are placeholders for
          now and don't do much yet — they're planned features, not finished ones.
        </p>
        <button className="titlebtn primary" onClick={onContinue}>Got it, let's go!</button>
      </div>
    </div>
  )
}

// Contextual one-shot tutorial tips (2026-07-25 playtest addition): shown at
// the moment a system first matters (sign-up, first injury, rank-up week),
// only while tutorialEnabled, each dismissible exactly once (GameState.tipsSeen).
function TipBanner({ game, setGame, id, children }: {
  game: GameState; setGame: Dispatch<SetStateAction<GameState>>; id: string; children: ReactNode
}) {
  if (!game.tutorialEnabled || (game.tipsSeen ?? []).includes(id)) return null
  return (
    <div className="tipbanner">
      <span>💡 {children}</span>
      <button className="tutorial-dismiss" onClick={() => setGame((g) => ({ ...g, tipsSeen: [...(g.tipsSeen ?? []), id] }))}>✕</button>
    </div>
  )
}

function TutorialBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="tutorial-banner">
      <div>
        <b>👋 Welcome tips</b>
        <ul>
          <li>Each week: feed your monster, then pick a training drill, rest, or an excursion — then Advance Week.</li>
          <li>Sign up for tournaments in Town once your monster is ready — matching or lower leagues are safest.</li>
          <li>Breeding and the Lab's deeper features are still under construction — freeze/thaw works, but treat them as early previews.</li>
        </ul>
      </div>
      <button className="tutorial-dismiss" onClick={onDismiss}>✕</button>
    </div>
  )
}

type Screen = 'title' | 'slots' | 'setup' | 'disclaimer' | 'playing'

export function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [slotMode, setSlotMode] = useState<'new' | 'continue'>('continue')
  const [pendingSlot, setPendingSlot] = useState<number | null>(null)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [view, setView] = useState<'game' | 'sandbox'>('game')
  const [game, setGame] = useState<GameState | null>(null)
  const [battleScreen, setBattleScreen] = useState(false) // hide the Bestiary footer mid-battle

  useEffect(() => { migrateLegacySave() }, [])

  useEffect(() => {
    if (activeSlot != null && game) saveSlot(activeSlot, game)
  }, [game, activeSlot])

  const enterSlot = (slot: number) => {
    const g = loadSlot(slot)
    if (!g) return
    setActiveSlot(slot)
    setGame(g)
    setView('game')
    setScreen('playing')
  }

  const startNewGame = (trainerName: string, tutorialEnabled: boolean) => {
    if (pendingSlot == null) return
    const g = newGame(randomSeed(), { trainerName, tutorialEnabled })
    saveSlot(pendingSlot, g)
    setActiveSlot(pendingSlot)
    setGame(g)
    setView('game')
    setScreen('disclaimer')
  }

  const titleScreen = (
    <TitleScreen
      onNewGame={() => { setSlotMode('new'); setScreen('slots') }}
      onContinue={() => { setSlotMode('continue'); setScreen('slots') }}
    />
  )

  if (screen === 'title') return titleScreen

  if (screen === 'slots') {
    return (
      <SlotPicker
        mode={slotMode}
        onBack={() => setScreen('title')}
        onPickEmpty={(slot) => { setPendingSlot(slot); setScreen('setup') }}
        onPickOccupied={(slot) => {
          // Overwrite confirmation lives inside SlotPicker as a styled modal —
          // by the time this fires in 'new' mode, the player already confirmed.
          if (slotMode === 'continue') enterSlot(slot)
          else { setPendingSlot(slot); setScreen('setup') }
        }}
      />
    )
  }

  if (screen === 'setup') return <NewGameSetup onBack={() => setScreen('slots')} onStart={startNewGame} />
  if (screen === 'disclaimer') return <AlphaDisclaimer onContinue={() => setScreen('playing')} />
  if (!game) return titleScreen // structurally unreachable — 'playing' only sets once game is loaded

  return (
    <div className="app">
      <h1>Monster Tamer <span className="tag">/ prototype</span> <span className="version">v{APP_VERSION}</span></h1>
      <div className="tabs">
        <button className={'tab' + (view === 'game' ? ' on' : '')} onClick={() => setView('game')}>🎮 Game</button>
        <button className={'tab' + (view === 'sandbox' ? ' on' : '')} onClick={() => setView('sandbox')}>⚔️ Sandbox</button>
        <button className="tab" onClick={() => setScreen('title')}>🏠 Main Menu</button>
      </div>
      {view === 'game'
        ? (game.area === 'town'
          ? <TownView game={game} setGame={setGame as Dispatch<SetStateAction<GameState>>} />
          : <RanchView game={game} setGame={setGame as Dispatch<SetStateAction<GameState>>} onBattleScreen={setBattleScreen} />)
        : <SandboxView />}
      {!(view === 'game' && battleScreen) && (
        <Bestiary specialLicense={game.specialLicense} eliteLicense={game.eliteLicense} />
      )}
    </div>
  )
}
