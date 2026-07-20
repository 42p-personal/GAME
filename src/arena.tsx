// Animated arena: plays a resolved battle's event stream as live beats —
// Teamfight-Manager style. The sim is already decided (deterministic); this is
// pure presentation. 1v1 (Wood/Copper leagues, Sandbox) keeps the original
// lunge/projectile choreography exactly as it was. Team battles (>1 per side)
// use a compact roster-row presentation instead — full per-monster traversal
// animation doesn't stay legible at 6v6 — leaning on the scrolling turn-by-turn
// log for the detailed narration either way.
import { useEffect, useRef, useState } from 'react'
import { BattleEvent, BattleResult, BattleSide } from './battle'
import { Channel, Element, Monster, StatusKind } from './core'
import { maxHp, maxMana } from './monster'
import { Sprite } from './Sprite'

const ELEMENT_COLOR: Record<Element, string> = { fire: '#ff7043', water: '#4fc3f7', earth: '#a1887f', air: '#b0bec5' }
const CHANNEL_COLOR: Record<Channel, string> = { melee: '#eee', ranged: '#ffd54f', magic: '#ba68c8', voice: '#f48fb1', support: '#80cbc4' }
const STATUS_ICON: Record<StatusKind, string> = {
  blind: '🕶️', poison: '☠️', burn: '🔥', fear: '😱', confusion: '💫', stun: '💤', knockback: '💨',
  bleed: '🩸', silence: '🤐', vulnerable: '🎯', sleep: '😴', doom: '💀', healblock: '🚫', haste: '⚡', charm: '💞',
}

interface FloatFx { id: number; side: BattleSide; slot: number; text: string; cls: string }
interface BarState { hp: number; mana: number; ward: number }
type Bars = Record<string, BarState> // keyed by `${side}${slot}`
interface Fx { id: number; side: BattleSide; slot: number; type: 'lunge' | 'proj' | 'stance'; color?: string }

const barKey = (side: BattleSide, slot: number) => `${side}${slot}`

export function ArenaBattle({ teamA, teamB, result, onDone }: { teamA: Monster[]; teamB: Monster[]; result: BattleResult; onDone?: () => void }) {
  const is1v1 = teamA.length === 1 && teamB.length === 1
  const events = result.events

  const [idx, setIdx] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [bars, setBars] = useState<Bars>(() => {
    const out: Bars = {}
    teamA.forEach((m, i) => { out[barKey('A', i)] = { hp: Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats)), mana: Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats)), ward: 0 } })
    teamB.forEach((m, i) => { out[barKey('B', i)] = { hp: Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats)), mana: Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats)), ward: 0 } })
    return out
  })
  const [round, setRound] = useState(0)
  const [fx, setFx] = useState<Fx | null>(null)
  const [floats, setFloats] = useState<FloatFx[]>([])
  const [caption, setCaption] = useState('The battle begins!')
  const counter = useRef(0)
  const notified = useRef(false)

  const done = idx >= events.length
  const teamOf = (side: BattleSide) => (side === 'A' ? teamA : teamB)
  const nameOf = (side: BattleSide, slot: number) => teamOf(side)[slot]?.name ?? '?'

  // Turn-by-turn log: every event's caption accumulates below the fight as it
  // plays (skip fills in the rest), so the replay never spoils itself.
  const [history, setHistory] = useState<string[]>(['The battle begins!'])
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [history])

  function captionOf(e: BattleEvent): string | null {
    switch (e.kind) {
      case 'round': return `— Round ${e.n} —`
      case 'snap': return null
      case 'hit': {
        const bits = [e.crit ? 'CRITICAL!' : '', e.hits > 1 ? `${e.hits} hits` : '', e.execute ? 'executes!' : '', e.eff === 'super' ? 'super effective!' : e.eff === 'resist' ? 'resisted' : ''].filter(Boolean).join(' · ')
        const tgt = e.self ? '' : ` to ${nameOf(e.targetSide, e.targetSlot)}`
        return `${nameOf(e.side, e.slot)} uses ${e.move} → ${e.dmg} damage${tgt}${bits ? ` (${bits})` : ''}`
      }
      case 'miss': return `${nameOf(e.side, e.slot)}'s ${e.move} ${e.blocked ? 'is blocked!' : `misses ${nameOf(e.targetSide, e.targetSlot)}.`}`
      case 'stance': return `${nameOf(e.side, e.slot)} braces to block (+${e.avoid}% avoid).`
      case 'utility': return `${nameOf(e.side, e.slot)} uses ${e.move}${e.hostile || e.targetSlot !== e.slot || e.targetSide !== e.side ? ` on ${nameOf(e.targetSide, e.targetSlot)}` : ''}.`
      case 'status': return `${nameOf(e.side, e.slot)} is afflicted with ${e.status}!`
      case 'dot': return e.status === 'burn' ? `${nameOf(e.side, e.slot)} suffers ${e.amount} burn damage.`
        : e.status === 'bleed' ? `${nameOf(e.side, e.slot)} bleeds for ${e.amount}.`
        : e.status === 'doom' ? `💀 The doom strikes ${nameOf(e.side, e.slot)} for ${e.amount}!`
        : `${nameOf(e.side, e.slot)} loses ${e.amount} MP to poison.`
      case 'skip': return e.reason === 'stun' ? `${nameOf(e.side, e.slot)} is stunned!`
        : e.reason === 'sleep' ? `${nameOf(e.side, e.slot)} is fast asleep!`
        : `${nameOf(e.side, e.slot)} flees in fear!`
      case 'end': return e.winner === 'draw' ? '🏳️ Double knockout — a draw!' : `🏆 ${result.winnerName} wins!`
    }
  }

  useEffect(() => {
    if (done) {
      if (!notified.current) { notified.current = true; onDone?.() }
      return
    }
    const e = events[idx]
    const delay = applyEvent(e)
    const t = setTimeout(() => setIdx((i) => i + 1), Math.max(25, delay / speed))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done, speed])

  function addFloat(side: BattleSide, slot: number, text: string, cls: string) {
    const id = ++counter.current
    setFloats((f) => [...f, { id, side, slot, text, cls }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100)
  }

  function applyEvent(e: BattleEvent): number {
    const cap = captionOf(e)
    if (cap) setHistory((h) => [...h, cap])
    if (cap && e.kind !== 'dot') setCaption(cap)
    switch (e.kind) {
      case 'round':
        setRound(e.n)
        return 450
      case 'snap':
        setBars((prev) => {
          const next = { ...prev }
          for (const s of e.states) next[barKey(s.side, s.slot)] = { hp: s.hp, mana: s.mana, ward: s.ward }
          return next
        })
        return 30
      case 'hit': {
        const id = ++counter.current
        const color = e.element ? ELEMENT_COLOR[e.element] : CHANNEL_COLOR[e.channel]
        setFx({ id, side: e.side, slot: e.slot, type: e.channel === 'melee' ? 'lunge' : 'proj', color })
        addFloat(e.targetSide, e.targetSlot, `-${e.dmg}`, 'dmg')
        if (e.warded > 0) addFloat(e.targetSide, e.targetSlot, `🛡 ${e.warded}`, 'info')
        if (e.lifesteal > 0) addFloat(e.side, e.slot, `+${e.lifesteal}`, 'heal')
        if (e.recoil > 0) addFloat(e.side, e.slot, `-${e.recoil}`, 'burn')
        if (e.manaBurn > 0) addFloat(e.targetSide, e.targetSlot, `-${e.manaBurn} MP`, 'mana')
        if (e.crit) addFloat(e.targetSide, e.targetSlot, '💥 CRIT', 'dmg')
        return e.crit || e.execute || e.eff === 'super' ? 950 : 800
      }
      case 'miss': {
        const id = ++counter.current
        setFx({ id, side: e.side, slot: e.slot, type: e.channel === 'melee' ? 'lunge' : 'proj', color: CHANNEL_COLOR[e.channel] })
        addFloat(e.targetSide, e.targetSlot, e.blocked ? '🛡 blocked!' : 'miss', 'info')
        return 650
      }
      case 'stance':
        setFx({ id: ++counter.current, side: e.side, slot: e.slot, type: 'stance' })
        addFloat(e.side, e.slot, '🛡', 'info')
        return 550
      case 'utility':
        if (e.heal > 0) addFloat(e.targetSide, e.targetSlot, `+${e.heal}`, 'heal')
        else addFloat(e.side, e.slot, `✨ ${e.move}`, 'info')
        return 620
      case 'status':
        addFloat(e.side, e.slot, `${STATUS_ICON[e.status]} ${e.status}`, 'info')
        return 520
      case 'dot':
        addFloat(e.side, e.slot,
          e.status === 'burn' ? `-${e.amount} 🔥` : e.status === 'bleed' ? `-${e.amount} 🩸`
            : e.status === 'doom' ? `-${e.amount} 💀` : `-${e.amount} MP ☠️`,
          e.status === 'poison' ? 'mana' : 'burn')
        return 340
      case 'skip':
        addFloat(e.side, e.slot, e.reason === 'stun' ? '💤 stunned' : e.reason === 'sleep' ? '😴 asleep' : '😱 flees', 'info')
        return 550
      case 'end':
        setFx(null) // don't leave a frozen projectile/lunge on screen
        return 400
    }
  }

  const skip = () => {
    const lastSnap = [...events].reverse().find((e): e is Extract<BattleEvent, { kind: 'snap' }> => e.kind === 'snap')
    if (lastSnap) {
      setBars((prev) => {
        const next = { ...prev }
        for (const s of lastSnap.states) next[barKey(s.side, s.slot)] = { hp: s.hp, mana: s.mana, ward: s.ward }
        return next
      })
    }
    setFloats([])
    setFx(null)
    setCaption(result.winner === 'draw' ? '🏳️ Double knockout — a draw!' : `🏆 ${result.winnerName} wins!`)
    // fill the turn log with everything the replay would still have shown
    const rest = events.slice(idx).map(captionOf).filter((l): l is string => !!l)
    setHistory((h) => [...h, ...rest])
    setIdx(events.length)
  }

  const floatsFor = (side: BattleSide, slot: number) =>
    floats.filter((f) => f.side === side && f.slot === slot).map((f) => <span key={f.id} className={'float ' + f.cls}>{f.text}</span>)

  // Shared tail: the live turn log, plus (once the replay finishes) the raw
  // sim transcript — richer than the captions (buff durations, resist notes).
  const logAndTranscript = (
    <>
      <div className="arena-log" ref={logRef}>
        {history.map((l, i) => (
          <div key={i} className={l.startsWith('— Round') ? 'rnd' : l.startsWith('🏆') || l.startsWith('🏳️') ? 'fin' : ''}>{l}</div>
        ))}
      </div>
      {done && (
        <details className="arena-transcript">
          <summary className="dim">📜 full battle transcript</summary>
          <div className="log">
            {result.log.map((line, i) => (
              <div key={i} className={line.startsWith('🏆') || line.startsWith('🏳️') ? 'win' : ''}>{line}</div>
            ))}
          </div>
        </details>
      )}
    </>
  )

  // ---------- 1v1: original lunge/projectile choreography, unchanged ----------
  if (is1v1) {
    const a = teamA[0], b = teamB[0]
    const aMax = { hp: maxHp(a.stats), mana: maxMana(a.stats) }
    const bMax = { hp: maxHp(b.stats), mana: maxMana(b.stats) }
    const aBar = bars[barKey('A', 0)], bBar = bars[barKey('B', 0)]

    const fighterCls = (side: BattleSide) => {
      let cls = 'combatant ' + (side === 'A' ? 'left' : 'right')
      if (fx && fx.side === side && fx.slot === 0) {
        if (fx.type === 'lunge') cls += side === 'A' ? ' lungeA' : ' lungeB'
        if (fx.type === 'stance') cls += ' stancePulse'
      }
      return cls
    }
    const ko = (side: BattleSide) => (done && ((side === 'A' && result.winner === 'B') || (side === 'B' && result.winner === 'A')) ? ' ko' : '')

    return (
      <div className="battle-arena">
        <div className="arena-hud">
          <div className="arena-fighter-hud">
            <div className="ahn">{a.name} <span className="dim">· {a.className}</span></div>
            <div className="abar hp"><i style={{ width: `${(aBar.hp / aMax.hp) * 100}%` }} /><span>{aBar.hp}/{aMax.hp}</span></div>
            <div className="abar mp"><i style={{ width: `${aMax.mana > 0 ? (aBar.mana / aMax.mana) * 100 : 0}%` }} /><span>{aBar.mana} MP</span></div>
            {aBar.ward > 0 && <div className="award">🛡 shield {aBar.ward}</div>}
          </div>
          <div className="arena-round">{done ? (result.winner === 'draw' ? '🏳️ Draw' : `🏆 ${result.winnerName}`) : round > 0 ? `Round ${round}` : '⚔️'}</div>
          <div className="arena-fighter-hud right">
            <div className="ahn">{b.name} <span className="dim">· {b.className}</span></div>
            <div className="abar hp"><i style={{ width: `${(bBar.hp / bMax.hp) * 100}%` }} /><span>{bBar.hp}/{bMax.hp}</span></div>
            <div className="abar mp"><i style={{ width: `${bMax.mana > 0 ? (bBar.mana / bMax.mana) * 100 : 0}%` }} /><span>{bBar.mana} MP</span></div>
            {bBar.ward > 0 && <div className="award">🛡 shield {bBar.ward}</div>}
          </div>
        </div>

        <div className={'arena-floor'}>
          <div className={fighterCls('A') + ko('A')}>
            <Sprite species={a.species} size={84} />
            <div className="floats">{floatsFor('A', 0)}</div>
          </div>
          {fx?.type === 'proj' && (
            <i key={fx.id} className={'proj ' + (fx.side === 'A' ? 'projA' : 'projB')} style={{ background: fx.color, color: fx.color }} />
          )}
          <div className={fighterCls('B') + ko('B')}>
            <span className="mirror"><Sprite species={b.species} size={84} /></span>
            <div className="floats">{floatsFor('B', 0)}</div>
          </div>
        </div>

        <div className="arena-controls">
          {!done && (
            <>
              {[1, 2, 4].map((s) => (
                <button key={s} className={'ghost' + (speed === s ? ' selected' : '')} onClick={() => setSpeed(s)}>{s}×</button>
              ))}
              <button className="ghost" onClick={skip}>skip ⏭</button>
            </>
          )}
          <span className="arena-caption">{caption}</span>
        </div>

        {logAndTranscript}
      </div>
    )
  }

  // ---------- Team battles: compact roster rows ----------
  const renderTile = (side: BattleSide, slot: number) => {
    const m = teamOf(side)[slot]
    const bar = bars[barKey(side, slot)]
    const hpMax = maxHp(m.stats)
    const mpMax = maxMana(m.stats)
    const koed = bar.hp <= 0
    const acting = fx && fx.side === side && fx.slot === slot
    let cls = 'roster-tile'
    if (koed) cls += ' ko'
    if (acting) cls += ` acting acting-${fx!.type}`
    return (
      <div className={cls} key={slot} title={m.name}>
        <Sprite species={m.species} size={40} />
        <div className="rt-name">{m.name}</div>
        <div className="rt-bar hp"><i style={{ width: `${Math.max(0, (bar.hp / hpMax) * 100)}%` }} /></div>
        <div className="rt-bar mp"><i style={{ width: `${mpMax > 0 ? Math.max(0, (bar.mana / mpMax) * 100) : 0}%` }} /></div>
        {bar.ward > 0 && <div className="rt-ward">🛡{bar.ward}</div>}
        <div className="floats">{floatsFor(side, slot)}</div>
      </div>
    )
  }

  return (
    <div className="battle-arena team-mode">
      <div className="arena-hud">
        <div className="arena-round">{done ? (result.winner === 'draw' ? '🏳️ Draw' : `🏆 ${result.winnerName}`) : round > 0 ? `Round ${round}` : '⚔️'}</div>
      </div>

      <div className={'arena-floor team-floor'}>
        <div className="roster roster-a">{teamA.map((_, i) => renderTile('A', i))}</div>
        <div className="roster-vs">vs</div>
        <div className="roster roster-b">{teamB.map((_, i) => renderTile('B', i))}</div>
      </div>

      <div className="arena-controls">
        {!done && (
          <>
            {[1, 2, 4].map((s) => (
              <button key={s} className={'ghost' + (speed === s ? ' selected' : '')} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
            <button className="ghost" onClick={skip}>skip ⏭</button>
          </>
        )}
        <span className="arena-caption">{caption}</span>
      </div>

      {logAndTranscript}
    </div>
  )
}
