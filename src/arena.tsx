// Animated arena: plays a resolved battle's event stream as live beats —
// Teamfight-Manager style. The sim is already decided (deterministic); this is
// pure presentation: lunges, projectiles, floating numbers, HP/MP bars.
import { useEffect, useRef, useState } from 'react'
import { BattleEvent, BattleResult, BattleSide } from './battle'
import { Channel, Element, Monster, StatusKind } from './core'
import { maxHp, maxMana } from './monster'
import { Sprite } from './Sprite'

const ELEMENT_COLOR: Record<Element, string> = { fire: '#ff7043', water: '#4fc3f7', earth: '#a1887f', air: '#b0bec5' }
const CHANNEL_COLOR: Record<Channel, string> = { melee: '#eee', ranged: '#ffd54f', magic: '#ba68c8', voice: '#f48fb1', support: '#80cbc4' }
const STATUS_ICON: Record<StatusKind, string> = { blind: '🕶️', poison: '☠️', burn: '🔥', fear: '😱', confusion: '💫', stun: '💤', knockback: '💨' }

interface FloatFx { id: number; side: BattleSide; text: string; cls: string }
interface Bars { aHp: number; bHp: number; aMana: number; bMana: number; aWard: number; bWard: number }
interface Fx { id: number; side: BattleSide; type: 'lunge' | 'proj' | 'stance' | 'ult'; color?: string }

const other = (s: BattleSide): BattleSide => (s === 'A' ? 'B' : 'A')

export function ArenaBattle({ a, b, result, onDone }: { a: Monster; b: Monster; result: BattleResult; onDone?: () => void }) {
  const aMax = { hp: maxHp(a.stats), mana: maxMana(a.stats) }
  const bMax = { hp: maxHp(b.stats), mana: maxMana(b.stats) }
  const events = result.events

  const [idx, setIdx] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [bars, setBars] = useState<Bars>({ aHp: aMax.hp, bHp: bMax.hp, aMana: aMax.mana, bMana: bMax.mana, aWard: 0, bWard: 0 })
  const [round, setRound] = useState(0)
  const [fx, setFx] = useState<Fx | null>(null)
  const [floats, setFloats] = useState<FloatFx[]>([])
  const [caption, setCaption] = useState('The battle begins!')
  const counter = useRef(0)
  const notified = useRef(false)

  const done = idx >= events.length
  const nameOf = (s: BattleSide) => (s === 'A' ? a.name : b.name)

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

  function addFloat(side: BattleSide, text: string, cls: string) {
    const id = ++counter.current
    setFloats((f) => [...f, { id, side, text, cls }])
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100)
  }

  function applyEvent(e: BattleEvent): number {
    switch (e.kind) {
      case 'round':
        setRound(e.n)
        setCaption(`— Round ${e.n} —`)
        return 450
      case 'snap':
        setBars({ aHp: e.aHp, bHp: e.bHp, aMana: e.aMana, bMana: e.bMana, aWard: e.aWard, bWard: e.bWard })
        return 30
      case 'hit': {
        const id = ++counter.current
        const color = e.element ? ELEMENT_COLOR[e.element] : CHANNEL_COLOR[e.channel]
        setFx({ id, side: e.side, type: e.channel === 'melee' ? 'lunge' : 'proj', color })
        const target = e.self ? e.side : other(e.side)
        addFloat(target, `-${e.dmg}`, 'dmg')
        if (e.warded > 0) addFloat(target, `🛡 ${e.warded}`, 'info')
        if (e.lifesteal > 0) addFloat(e.side, `+${e.lifesteal}`, 'heal')
        if (e.recoil > 0) addFloat(e.side, `-${e.recoil}`, 'burn')
        if (e.manaBurn > 0) addFloat(target, `-${e.manaBurn} MP`, 'mana')
        const bits = [e.hits > 1 ? `${e.hits} hits` : '', e.execute ? 'executes!' : '', e.eff === 'super' ? 'super effective!' : e.eff === 'resist' ? 'resisted' : ''].filter(Boolean).join(' · ')
        setCaption(`${nameOf(e.side)} uses ${e.move} → ${e.dmg} damage${bits ? ` (${bits})` : ''}`)
        return e.execute || e.eff === 'super' ? 950 : 800
      }
      case 'miss': {
        const id = ++counter.current
        setFx({ id, side: e.side, type: e.channel === 'melee' ? 'lunge' : 'proj', color: CHANNEL_COLOR[e.channel] })
        addFloat(other(e.side), e.blocked ? '🛡 blocked!' : 'miss', 'info')
        setCaption(`${nameOf(e.side)}'s ${e.move} ${e.blocked ? 'is blocked!' : 'misses.'}`)
        return 650
      }
      case 'stance':
        setFx({ id: ++counter.current, side: e.side, type: 'stance' })
        addFloat(e.side, '🛡', 'info')
        setCaption(`${nameOf(e.side)} braces to block (+${e.avoid}% avoid).`)
        return 550
      case 'utility':
        if (e.heal > 0) addFloat(e.side, `+${e.heal}`, 'heal')
        else addFloat(e.side, `✨ ${e.move}`, 'info')
        setCaption(`${nameOf(e.side)} uses ${e.move}${e.hostile ? ` on ${nameOf(other(e.side))}` : ''}.`)
        return 620
      case 'status':
        addFloat(e.side, `${STATUS_ICON[e.status]} ${e.status}`, 'info')
        setCaption(`${nameOf(e.side)} is afflicted with ${e.status}!`)
        return 520
      case 'dot':
        addFloat(e.side, e.status === 'burn' ? `-${e.amount} 🔥` : `-${e.amount} MP ☠️`, e.status === 'burn' ? 'burn' : 'mana')
        return 340
      case 'skip':
        addFloat(e.side, e.reason === 'stun' ? '💤 stunned' : '😱 flees', 'info')
        setCaption(e.reason === 'stun' ? `${nameOf(e.side)} is stunned!` : `${nameOf(e.side)} flees in fear!`)
        return 550
      case 'ultimate':
        setFx({ id: ++counter.current, side: e.side, type: 'ult' })
        setCaption(`★ ${nameOf(e.side)} unleashes ${e.name}!`)
        return 900
      case 'end':
        setCaption(e.winner === 'draw' ? '🏳️ Double knockout — a draw!' : `🏆 ${result.winnerName} wins!`)
        return 400
    }
  }

  const skip = () => {
    const lastSnap = [...events].reverse().find((e): e is Extract<BattleEvent, { kind: 'snap' }> => e.kind === 'snap')
    if (lastSnap) setBars({ aHp: lastSnap.aHp, bHp: lastSnap.bHp, aMana: lastSnap.aMana, bMana: lastSnap.bMana, aWard: lastSnap.aWard, bWard: lastSnap.bWard })
    setFloats([])
    setFx(null)
    setCaption(result.winner === 'draw' ? '🏳️ Double knockout — a draw!' : `🏆 ${result.winnerName} wins!`)
    setIdx(events.length)
  }

  const fighterCls = (side: BattleSide) => {
    let cls = 'combatant ' + (side === 'A' ? 'left' : 'right')
    if (fx && fx.side === side) {
      if (fx.type === 'lunge') cls += side === 'A' ? ' lungeA' : ' lungeB'
      if (fx.type === 'stance') cls += ' stancePulse'
    }
    return cls
  }
  const ko = (side: BattleSide) => (done && ((side === 'A' && result.winner === 'B') || (side === 'B' && result.winner === 'A')) ? ' ko' : '')

  return (
    <div className="arena">
      <div className="arena-hud">
        <div className="arena-fighter-hud">
          <div className="ahn">{a.name} <span className="dim">· {a.className}</span></div>
          <div className="abar hp"><i style={{ width: `${(bars.aHp / aMax.hp) * 100}%` }} /><span>{bars.aHp}/{aMax.hp}</span></div>
          <div className="abar mp"><i style={{ width: `${(bars.aMana / aMax.mana) * 100}%` }} /><span>{bars.aMana} MP</span></div>
          {bars.aWard > 0 && <div className="award">🛡 shield {bars.aWard}</div>}
        </div>
        <div className="arena-round">{done ? (result.winner === 'draw' ? '🏳️ Draw' : `🏆 ${result.winnerName}`) : round > 0 ? `Round ${round}` : '⚔️'}</div>
        <div className="arena-fighter-hud right">
          <div className="ahn">{b.name} <span className="dim">· {b.className}</span></div>
          <div className="abar hp"><i style={{ width: `${(bars.bHp / bMax.hp) * 100}%` }} /><span>{bars.bHp}/{bMax.hp}</span></div>
          <div className="abar mp"><i style={{ width: `${(bars.bMana / bMax.mana) * 100}%` }} /><span>{bars.bMana} MP</span></div>
          {bars.bWard > 0 && <div className="award">🛡 shield {bars.bWard}</div>}
        </div>
      </div>

      <div className={'arena-floor' + (fx?.type === 'ult' ? ' ult-flash' : '')}>
        <div className={fighterCls('A') + ko('A')}>
          <Sprite species={a.species} size={84} />
          <div className="floats">{floats.filter((f) => f.side === 'A').map((f) => <span key={f.id} className={'float ' + f.cls}>{f.text}</span>)}</div>
        </div>
        {fx?.type === 'proj' && (
          <i key={fx.id} className={'proj ' + (fx.side === 'A' ? 'projA' : 'projB')} style={{ background: fx.color, color: fx.color }} />
        )}
        <div className={fighterCls('B') + ko('B')}>
          <span className="mirror"><Sprite species={b.species} size={84} /></span>
          <div className="floats">{floats.filter((f) => f.side === 'B').map((f) => <span key={f.id} className={'float ' + f.cls}>{f.text}</span>)}</div>
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
    </div>
  )
}
