// ─────────────────────────────────────────────────────────────────────────────
// TAMER ARENA (M4) — the mounted renderer for a tamerengine fight.
//
// Plays back a `FieldResult` (the deterministic event stream) on the pixel
// battlefield: the battle sprites walk/strike, a notched HP + MP bar and the
// buff/debuff rows sit over each monster, ability animations fire off the
// cast/hit events, and the player controls the pace with the timer toggles.
//
// ⚠️ DRIVEN IMPERATIVELY, not by per-frame React state. At 60fps a React tree of
// a dozen animating sprites would thrash; instead React lays out the shell and
// controls once, and a single rAF loop in an effect updates the DOM (transforms,
// bar fills, icon rows) and the fx canvas directly. React state is only the
// controls (speed, playing). This is the same shape the previews proved.
//
// The sprite frame logic mirrors BattleSprite's `sheet` mode (walk cycle from
// public/battle, strike on a cast) — kept inline here because the playback owns
// the animation clock rather than each sprite owning its own.
import { useEffect, useRef, useState } from 'react'
import { FieldEvent, FieldResult, Obstacle, FIELD_W } from './types'
import { moveFx, effectIcon, TRAVELS, MoveFx } from './fieldFx'
import { BATTLE_SPRITE_SET } from './BattleSprite'
import './tamerArena.css'

type Snap = Extract<FieldEvent, { kind: 'snapshot' }>
const WALK = ['walk1', 'walk2', 'walk3', 'walk4']
const SPEEDS = [0.25, 0.5, 1, 2, 4]

export interface TamerArenaProps {
  result: FieldResult
  /** unit id (e.g. "A0") → species id, so the renderer knows which sprite. */
  speciesById: Record<string, string>
  obstacles: Obstacle[]
  /** Team display names for the legend. */
  teamAName?: string
  teamBName?: string
}

export function TamerArena({ result, speciesById, obstacles, teamAName = 'Team A', teamBName = 'Team B' }: TamerArenaProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(true)
  const [ended, setEnded] = useState(false)
  // Live refs the rAF loop reads without re-subscribing.
  const speedR = useRef(speed); speedR.current = speed
  const playR = useRef(playing); playR.current = playing

  useEffect(() => {
    const field = fieldRef.current, fx = fxRef.current
    if (!field || !fx) return
    const ctx = fx.getContext('2d')!
    const snaps = result.events.filter((e) => e.kind === 'snapshot') as Snap[]
    if (!snaps.length) return
    const duration = snaps[snaps.length - 1].t

    // ── geometry ────────────────────────────────────────────────────────────
    let PX = 1, SPRITE = 1
    const scale = () => {
      PX = field.clientWidth / FIELD_W
      SPRITE = PX * 3.4
      fx.width = field.clientWidth
      fx.height = field.clientHeight
    }

    // ── obstacles (pixel boulders) ────────────────────────────────────────────
    const drawRocks = () => {
      field.querySelectorAll('.ta-rock').forEach((r) => r.remove())
      for (const o of obstacles) {
        const el = document.createElement('div')
        el.className = 'ta-rock'
        el.style.cssText = `left:${o.x * PX}px;top:${o.y * PX}px;width:${o.w * PX}px;height:${o.h * PX}px`
        el.innerHTML = '<img src="/field/boulder.png" alt="">'
        field.appendChild(el)
      }
    }

    // ── one unit's DOM (sprite + bars + icon rows) ────────────────────────────
    interface UnitEl {
      root: HTMLDivElement; face: HTMLDivElement; img: HTMLImageElement
      hpFill: HTMLDivElement; mpFill: HTMLDivElement
      buffRow: HTMLDivElement; debuffRow: HTMLDivElement
      species: string; side: string; facing: number; walk: number; wt: number; anim: string
      maxHp: number; maxMp: number
    }
    const units: Record<string, UnitEl> = {}

    // Notches: one tick per `per` points, drawn as fixed-position dividers so a
    // more powerful monster shows more, tighter notches on a same-width bar.
    const notches = (max: number, per: number) => {
      const n = Math.floor(max / per)
      let html = ''
      for (let i = 1; i < n; i++) html += `<span class="ta-notch" style="left:${(i / (max / per)) * 100}%"></span>`
      return html
    }

    const buildUnits = () => {
      field.querySelectorAll('.ta-unit').forEach((u) => u.remove())
      for (const key of Object.keys(units)) delete units[key]
      const first = snaps[0]
      for (const u of first.units) {
        const sp = speciesById[u.id]
        const side = u.id[0]
        const root = document.createElement('div')
        root.className = `ta-unit team${side}`
        // Order top→bottom: debuffs · buffs · HP · MP (per the spec), all above
        // the sprite; then the contact shadow and the sprite itself.
        root.innerHTML =
          `<div class="ta-over">` +
          `<div class="ta-debuffs ta-icons"></div>` +
          `<div class="ta-buffs ta-icons"></div>` +
          `<div class="ta-bar ta-hp"><div class="ta-fill"></div>${notches(u.maxHp, 100)}</div>` +
          `<div class="ta-bar ta-mp"><div class="ta-fill"></div>${notches(u.maxMp, 50)}</div>` +
          `</div>` +
          `<div class="ta-shadow"></div>` +
          `<div class="ta-face"><img draggable="false" alt="${sp}"></div>`
        field.appendChild(root)
        const has = BATTLE_SPRITE_SET.has(sp)
        const img = root.querySelector('.ta-face img') as HTMLImageElement
        img.src = has ? `/battle/${sp}-idle.png` : `/sprites/${sp}.png`
        units[u.id] = {
          root, face: root.querySelector('.ta-face')!, img,
          hpFill: root.querySelector('.ta-hp .ta-fill')!, mpFill: root.querySelector('.ta-mp .ta-fill')!,
          buffRow: root.querySelector('.ta-buffs')!, debuffRow: root.querySelector('.ta-debuffs')!,
          species: sp, side, facing: side === 'A' ? 1 : -1, walk: 0, wt: 0, anim: 'idle',
          maxHp: u.maxHp, maxMp: u.maxMp,
        }
      }
    }

    const spriteFrame = (u: UnitEl, state: string, dt: number) => {
      const has = BATTLE_SPRITE_SET.has(u.species)
      if (!has) return `/sprites/${u.species}.png`
      if (state === 'move') { u.wt += dt; if (u.wt > 0.11) { u.wt = 0; u.walk = (u.walk + 1) % 4 } return `/battle/${u.species}-${WALK[u.walk]}.png` }
      if (state === 'cast') return `/battle/${u.species}-strike.png`
      return `/battle/${u.species}-idle.png`
    }
    const setRow = (row: HTMLDivElement, keys: string[]) => {
      const want = keys.map(effectIcon).join('')
      if (row.dataset.k !== want) { row.dataset.k = want; row.textContent = want }
    }

    // ── ability fx (canvas overlay) ───────────────────────────────────────────
    interface Proj { t0: number; t1: number; from: [number, number]; to: [number, number]; fx: MoveFx }
    interface Burst { t: number; at: [number, number]; fx: MoveFx; kind: string; crit?: boolean }
    const projectiles: Proj[] = []
    const bursts: Burst[] = []
    const posAt = (id: string, tt: number): [number, number] | null => {
      const i = Math.max(0, Math.min(snaps.length - 1, Math.round(tt / 0.1)))
      const u = snaps[i].units.find((x) => x.id === id)
      return u ? [u.x, u.y] : null
    }
    // Pre-compute every ability's fx from the cast/hit stream.
    for (const e of result.events) {
      if (e.kind === 'cast' && e.targetId) {
        const fxv = moveFx(e.move, e.channel)
        const from = posAt(e.id, e.t), to = posAt(e.targetId, e.t + 0.2)
        if (!from || !to) continue
        if (TRAVELS.has(fxv.kind)) {
          projectiles.push({ t0: e.t, t1: e.t + (fxv.kind === 'beam' ? 0.16 : 0.34), from, to, fx: fxv })
        } else {
          bursts.push({ t: e.t + 0.12, at: to, fx: fxv, kind: fxv.kind })
        }
      }
      if (e.kind === 'hit') {
        const at = posAt(e.targetId, e.t)
        if (at) bursts.push({ t: e.t, at, fx: moveFx(e.move, e.channel), kind: 'impact', crit: e.crit })
      }
      if (e.kind === 'heal' && (e as { targetId?: string }).targetId) {
        const at = posAt((e as { targetId: string }).targetId, e.t)
        if (at) bursts.push({ t: e.t, at, fx: { struct: 'burst', kind: 'heal', color: '#7dffab' }, kind: 'heal' })
      }
    }

    const drawFx = (tt: number) => {
      ctx.clearRect(0, 0, fx.width, fx.height)
      for (const p of projectiles) {
        if (tt < p.t0 || tt > p.t1) continue
        const f = (tt - p.t0) / (p.t1 - p.t0)
        const x = (p.from[0] + (p.to[0] - p.from[0]) * f) * PX
        const y = (p.from[1] + (p.to[1] - p.from[1]) * f - 1.6) * PX
        const ang = Math.atan2(p.to[1] - p.from[1], p.to[0] - p.from[0])
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang)
        if (p.fx.kind === 'arrow' || p.fx.kind === 'beam') {
          ctx.strokeStyle = p.fx.color; ctx.lineWidth = p.fx.kind === 'beam' ? 3.5 : 2.4
          ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke()
          ctx.fillStyle = p.fx.color; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -3.5); ctx.lineTo(5, 3.5); ctx.closePath(); ctx.fill()
        } else {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10)
          g.addColorStop(0, '#fff'); g.addColorStop(0.4, p.fx.color); g.addColorStop(1, 'transparent')
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill()
        }
        ctx.restore()
      }
      for (const b of bursts) {
        const age = tt - b.t
        const life = b.kind === 'heal' ? 0.4 : b.kind === 'slam' ? 0.32 : 0.26
        if (age < 0 || age > life) continue
        const k = age / life, x = b.at[0] * PX, y = (b.at[1] - 1.6) * PX
        ctx.globalAlpha = 1 - k
        if (b.kind === 'heal') {
          ctx.strokeStyle = '#7dffab'; ctx.lineWidth = 3
          const yy = y - 8 - k * 12; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x, yy - 6); ctx.moveTo(x - 3, yy - 3); ctx.lineTo(x + 3, yy - 3); ctx.stroke()
        } else if (b.kind === 'impact' || b.kind === 'claw') {
          const r = 4 + k * 15
          ctx.strokeStyle = b.crit ? '#ffd45e' : '#fff2c8'; ctx.lineWidth = b.crit ? 3 : 2
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke()
          const n = b.crit ? 7 : 5
          for (let i = 0; i < n; i++) { const a = (i / n) * 7 + k; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke() }
        } else {
          // burst kinds — a coloured shockwave ring (cage/firewall/earthspike/sonic…)
          const r = 6 + k * 22
          ctx.strokeStyle = b.fx.color; ctx.lineWidth = 3
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke()
          if (b.kind === 'slam' || b.kind === 'earthspike') { ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 7); ctx.stroke() }
        }
        ctx.globalAlpha = 1
      }
    }

    // ── playback loop ─────────────────────────────────────────────────────────
    scale(); drawRocks(); buildUnits()
    // ⚠️ The clock is accumulated from rAF dt, NOT `now - mountTime`. rAF is
    // paused while the tab is hidden but `performance.now()` keeps running, so a
    // component mounted off-screen would, on first paint, jump the fight straight
    // to its end. Accumulating dt (which only advances on real frames) and
    // scaling by the current speed also makes the speed toggles seamless.
    let clock = 0, last = performance.now(), done = false
    const hud = field.querySelector('.ta-hud') as HTMLDivElement
    let raf = 0
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (playR.current) {
        clock += dt * speedR.current
        const tt = clock
        const i = Math.min(snaps.length - 1, Math.floor(tt / 0.1))
        const j = Math.min(snaps.length - 1, i + 1)
        const f = tt / 0.1 - i
        const a = snaps[i], b = snaps[j]
        const bmap: Record<string, Snap['units'][number]> = {}
        for (const u of b.units) bmap[u.id] = u
        for (const ua of a.units) {
          const el = units[ua.id]; if (!el) continue
          const ub = bmap[ua.id] ?? ua
          const x = ua.x + (ub.x - ua.x) * f, y = ua.y + (ub.y - ua.y) * f
          const dead = ua.state === 'dead'
          const dx = ub.x - ua.x
          if (Math.abs(dx) > 0.02) el.facing = dx > 0 ? 1 : -1
          el.img.src = spriteFrame(el, ua.state, dt * speedR.current)
          el.img.style.width = el.img.style.height = SPRITE + 'px'
          el.hpFill.style.width = Math.max(0, Math.min(100, (ua.hp / el.maxHp) * 100)) + '%'
          el.mpFill.style.width = Math.max(0, Math.min(100, (ua.mp / el.maxMp) * 100)) + '%'
          setRow(el.buffRow, ua.buffs)
          setRow(el.debuffRow, ua.debuffs)
          el.face.style.transform = `scaleX(${el.facing}) rotate(${dead ? '82deg' : '0'})`
          el.root.style.opacity = dead ? '0.34' : '1'
          el.root.querySelectorAll<HTMLElement>('.ta-bar,.ta-buffs,.ta-debuffs').forEach((n) => (n.style.display = dead ? 'none' : ''))
          el.root.style.transform = `translate3d(${x * PX - SPRITE / 2}px,${y * PX - SPRITE}px,0)`
          el.root.style.zIndex = String(5 + Math.round(y))
        }
        drawFx(tt)
        const alive = a.units.filter((u) => u.state !== 'dead').length
        if (hud) hud.textContent = `t=${tt.toFixed(1)}s / ${duration.toFixed(0)}s · alive ${alive}/${a.units.length} · ${speedR.current}×`
        if (tt >= duration && !done) { done = true; setEnded(true); setPlaying(false) }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const onResize = () => { scale(); drawRocks() }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [result, speciesById, obstacles])

  const winner = result.winner
  return (
    <div className="ta-wrap">
      <div className="ta-stage">
        <div className="ta-field" ref={fieldRef} style={{ backgroundImage: 'url(/field/arena-grass.jpg)' }}>
          <canvas className="ta-fx" ref={fxRef} />
          <div className="ta-hud">—</div>
          {ended && (
            <div className="ta-banner">
              <span>{winner === 'A' ? `${teamAName} wins` : winner === 'B' ? `${teamBName} wins` : 'Draw'}</span>
            </div>
          )}
        </div>
      </div>
      <div className="ta-controls">
        <button className="ta-btn ta-primary" onClick={() => { setPlaying((p) => !p) }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <div className="ta-speeds">
          <span className="ta-lbl">Speed</span>
          {SPEEDS.map((s) => (
            <button key={s} className="ta-btn" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </div>
      <div className="ta-legend">
        <span><i className="ta-dotA" /> {teamAName}</span>
        <span><i className="ta-dotB" /> {teamBName}</span>
      </div>
    </div>
  )
}
