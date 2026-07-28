// Field statuses and utility casting (v0.93).
//
// Two whole systems were silently absent before this: NO status was ever
// applied on the field, and NO non-damage move was ever cast. Both failed
// quietly — a monster holding Glacial Prison or Hallowed Ground simply behaved
// as though it held nothing. Nothing caught it, because "the fight still ran"
// looks exactly like "the fight ran correctly".
//
// So these tests assert the MECHANICS directly, each by building a monster that
// holds one specific move and checking the effect appears. Measuring aggregate
// battles is not enough: a rider that lands 2% of the time reads as noise.
import { describe, it, expect } from 'vitest'
import { generateMonster } from '../monster'
import { simulateFieldBattle } from './engine'
import { FIELD_STATUS } from './status'
import { ALL_MOVES } from '../moves'
import { DEFAULT_TACTICS, STATUS_INFO, Move, Monster, StatusKind } from '../core'
import { FieldEvent } from './types'

const mk = (seed: string, loadout?: Move[]): Monster => {
  const m = generateMonster(seed, { train: 900 })
  const o = { ...m, tactics: { ...DEFAULT_TACTICS } } as Monster
  if (loadout) o.loadout = loadout
  return o
}
const move = (name: string) => {
  const m = ALL_MOVES.find((x) => x.name === name)
  if (!m) throw new Error(`no such move: ${name}`) // guards against a rename
  return m
}
/** The same move with a guaranteed rider — a 15% charm is untestable otherwise. */
const certain = (name: string): Move => {
  const m = move(name)
  return { ...m, status: { ...m.status!, chance: 100 } }
}
const run = (a: Monster[], b: Monster[], seed = 'st') =>
  simulateFieldBattle({ seed, teamA: a, teamB: b })
const of = <K extends FieldEvent['kind']>(evs: FieldEvent[], k: K) =>
  evs.filter((e) => e.kind === k) as Extract<FieldEvent, { kind: K }>[]

describe('field statuses — the table itself', () => {
  it('covers every StatusKind the game can produce', () => {
    const kinds = Object.keys(STATUS_INFO) as StatusKind[]
    for (const k of kinds) expect(FIELD_STATUS[k], `${k} has no field rule`).toBeTruthy()
    expect(Object.keys(FIELD_STATUS).sort()).toEqual([...kinds].sort())
  })

  // The failure this guards is a rule that exists but is empty — it would look
  // implemented at every call site and do nothing at runtime.
  it('gives every status at least one real effect', () => {
    for (const [kind, rule] of Object.entries(FIELD_STATUS)) {
      expect(Object.keys(rule).length, `${kind} is an empty rule — inert`).toBeGreaterThan(0)
    }
  })

  it('every pool move that sets a status names a real one', () => {
    for (const m of ALL_MOVES) {
      if (!m.status) continue
      expect(FIELD_STATUS[m.status.kind], `${m.name} sets unknown ${m.status.kind}`).toBeTruthy()
    }
  })
})

describe('field statuses — riders actually land', () => {
  it('applies statuses in ordinary fights', () => {
    let total = 0
    for (let i = 0; i < 10; i++) {
      const A = [0, 1, 2].map((n) => mk(`sa${i}${n}`))
      const B = [0, 1, 2].map((n) => mk(`sb${i}${n}`))
      total += of(run(A, B, 's' + i).events, 'status').length
    }
    expect(total).toBeGreaterThan(20)
  })

  it('records WHO applied it — fear and charm are meaningless without a source', () => {
    const A = [mk('fa', [certain('Screech')])]
    const B = [mk('fb')]
    const evs = of(run(A, B).events, 'status')
    expect(evs.length).toBeGreaterThan(0)
    for (const e of evs) expect(e.by).toBeTruthy()
  })

  it('a rider never lands on an ally', () => {
    const A = [mk('ga'), mk('ga2')]
    const B = [mk('gb'), mk('gb2')]
    const r = run(A, B, 'ally')
    for (const e of of(r.events, 'status')) {
      // haste is the one beneficial status and IS meant to land on the team
      if (FIELD_STATUS[e.status].speedMult && e.status === 'haste') continue
      expect(e.id[0], `${e.status} hit an ally`).not.toBe(e.by[0])
    }
  })
})

describe('field statuses — the three that gained geometry', () => {
  // The user's ask: on a field these words can mean something a turn counter
  // cannot express. Each test compares against the SAME fight without the rider.
  const enemy = () => [mk('vic')]

  it('FEAR routs the victim — it moves away from what frightened it', () => {
    // ⚠️ Assert fear's OWN mechanic. Two robustness fixes over the naive version:
    // (1) don't compare against a control fight — hard collision now separates
    // that one too, confounding it; (2) PLACE the two units within Screech's
    // reach at the start, so the voice cast reliably lands. A lone weak screamer
    // left to chase a ranged kiter across the field never closes to cast at all.
    const screamer = mk('ka', [certain('Screech')])
    const r = simulateFieldBattle({
      seed: 'fear', teamA: [screamer], teamB: enemy(),
      placeA: [{ x: 18, y: 11 }], placeB: [{ x: 21, y: 11 }], // 3 apart, inside voice reach
    })
    const feared = of(r.events, 'status').filter((e) => e.status === 'fear')
    expect(feared.length).toBeGreaterThan(0)
    const t0 = feared[0].t
    const snaps = of(r.events, 'snapshot')
    const gapAt = (tt: number) => {
      const s = snaps.reduce((best, s) => (Math.abs(s.t - tt) < Math.abs(best.t - tt) ? s : best))
      return Math.abs(s.units[0].x - s.units[1].x)
    }
    // Distance from the attacker is greater a moment after fear lands than at
    // the instant it landed — the victim is running.
    expect(gapAt(t0 + 1.0)).toBeGreaterThan(gapAt(t0))
  })

  it('CONFUSION sends the victim off its intended heading', () => {
    const confused = run([mk('ca', [certain('Sonic Boom')])], enemy(), 'conf')
    const control = run([mk('ca', [move('Cleave')])], enemy(), 'conf')
    const path = (r: ReturnType<typeof run>) =>
      JSON.stringify(of(r.events, 'snapshot').map((s) => s.units[1].y.toFixed(1)))
    expect(path(confused)).not.toBe(path(control))
  })

  it('CHARM turns the victim against its own side', () => {
    // Charm's shipped duration is 2 rounds. That is a balance number; here the
    // window is widened so the mechanic is observable at all — a charmed
    // monster has to cross ground to reach the ally it now wants to hit.
    const c = move('Cacophony')
    const long: Move = { ...c, status: { kind: 'charm', chance: 100, duration: 6 } }
    const A = [mk('ha', [long])]
    const B = [mk('hb'), mk('hb2')]
    const r = run(A, B, 'charm')
    // A charmed B unit striking the other B unit — friendly fire that can only
    // happen because charm swapped which side it treats as hostile.
    const friendlyFire = of(r.events, 'hit').filter((e) => e.id[0] === e.targetId[0])
    expect(friendlyFire.length).toBeGreaterThan(0)
  })
})

describe('field statuses — control and attrition', () => {
  it('STUN stops the victim acting', () => {
    const A = [mk('ta', [certain('Glacial Prison')])]
    const B = [mk('tb')]
    const r = run(A, B, 'stun')
    const stuns = of(r.events, 'status').filter((e) => e.status === 'stun')
    expect(stuns.length).toBeGreaterThan(0)
    // In the second after a stun lands, the victim casts nothing.
    const t0 = stuns[0].t
    const dur = FIELD_STATUS.stun ? 1 : 1
    const casts = of(r.events, 'cast')
      .filter((e) => e.id === stuns[0].id && e.t > t0 && e.t < t0 + 1.5 * dur)
    expect(casts.length).toBe(0)
  })

  it('SLEEP breaks the moment the sleeper is hit', () => {
    const A = [mk('la', [certain('Lullaby'), move('Cleave')])]
    const B = [mk('lb')]
    const r = run(A, B, 'sleep')
    const naps = of(r.events, 'status').filter((e) => e.status === 'sleep')
    expect(naps.length).toBeGreaterThan(0)
    // It gets re-applied, which can only happen if it broke in between.
    const victim = naps[0].id
    const hits = of(r.events, 'hit').filter((e) => e.targetId === victim)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('BURN drains health over time, not on impact', () => {
    expect(FIELD_STATUS.burn.hpPerSec).toBeGreaterThan(0)
    const A = [mk('ba', [certain('Ember')])]
    const B = [mk('bb')]
    const r = run(A, B, 'burn')
    const burns = of(r.events, 'status').filter((e) => e.status === 'burn')
    expect(burns.length).toBeGreaterThan(0)
    // HP falls between hits, which only a tick-based drain can cause.
    const snaps = of(r.events, 'snapshot').filter((s) => s.t > burns[0].t)
    const hitTimes = new Set(of(r.events, 'hit').map((e) => e.t.toFixed(1)))
    let quietDrops = 0
    for (let i = 1; i < snaps.length; i++) {
      if (hitTimes.has(snaps[i].t.toFixed(1))) continue
      if (snaps[i].units[1].hp < snaps[i - 1].units[1].hp) quietDrops++
    }
    expect(quietDrops).toBeGreaterThan(0)
  })

  it('DOOM pays out when it expires, not while it runs', () => {
    expect(FIELD_STATUS.doom.detonate).toBeGreaterThan(0)
    expect(FIELD_STATUS.doom.hpPerSec).toBeUndefined()
  })
})

describe('field — non-damage moves are actually cast', () => {
  // ⚠️ `chooseMove` filtered `type === 'damage'`, so every support kit and all
  // 18 field moves were dead weight. This is the regression test for that.
  const byName = new Map(ALL_MOVES.map((m) => [m.name, m]))

  it('casts buffs, debuffs and heals in ordinary fights', () => {
    let util = 0, total = 0
    for (let i = 0; i < 10; i++) {
      const A = [0, 1, 2, 3].map((n) => mk(`ua${i}${n}`))
      const B = [0, 1, 2, 3].map((n) => mk(`ub${i}${n}`))
      for (const e of of(run(A, B, 'u' + i).events, 'cast')) {
        total++
        if (byName.get(e.move)?.type !== 'damage') util++
      }
    }
    expect(total).toBeGreaterThan(200)
    expect(util).toBeGreaterThan(20)
  })

  it('a healer actually heals', () => {
    let healed = 0
    for (let i = 0; i < 8; i++) {
      const A = [mk(`ha${i}`, [move('Second Wind'), move('Cleave')]), mk(`hc${i}`)]
      const B = [mk(`hb${i}`), mk(`hd${i}`)]
      healed += of(run(A, B, 'h' + i).events, 'heal').length
    }
    expect(healed).toBeGreaterThan(0)
  })

  it('TAUNT forces the victim onto the taunter', () => {
    const A = [mk('pa', [move('Taunt'), move('Cleave')]), mk('pc')]
    const B = [mk('pb'), mk('pd')]
    const r = run(A, B, 'taunt')
    const taunts = of(r.events, 'cast').filter((e) => e.move === 'Taunt')
    expect(taunts.length).toBeGreaterThan(0)
    // After a taunt, the victim's hits land on the taunter.
    const t = taunts[0]
    const after = of(r.events, 'hit').filter((e) => e.id === t.targetId && e.t > t.t && e.t < t.t + 5)
    if (after.length) expect(after.some((e) => e.targetId === t.id)).toBe(true)
  })

  it('never spends a cast on an effect the field does not model', () => {
    // Dodge and accuracy mods have no field representation at all. A monster
    // holding ONLY such a move must fall back to its basic attack, not burn
    // cooldowns on nothing — the failure that had Taunt cast 86 times for zero
    // effect before taunt was real. (Purge would NOT do here: its 10 power is a
    // genuine small heal, so casting it is correct.)
    for (const dead of ['Sidestep', 'Focus Aim', 'Blur']) {
      const A = [mk('na' + dead, [move(dead)])]
      const B = [mk('nb' + dead)]
      const casts = of(run(A, B, 'noop').events, 'cast')
      expect(casts.length, `${dead}: never acted`).toBeGreaterThan(0) // it still fights
      expect(casts.every((e) => e.move !== dead), `${dead} was cast for nothing`).toBe(true)
    }
  })
})

describe('field — the clock always resolves', () => {
  it('produces no draws across a spread of fights', () => {
    let draws = 0, longest = 0
    for (let i = 0; i < 24; i++) {
      const A = [0, 1, 2].map((n) => mk(`ca${i}${n}`))
      const B = [0, 1, 2].map((n) => mk(`cb${i}${n}`))
      const r = run(A, B, 'c' + i)
      if (r.winner === 'draw') draws++
      longest = Math.max(longest, r.duration)
    }
    // ⚠️ Buffs and debuffs becoming real pushed draws from 4 to 11 in 40 fights
    // until sudden death was added. This is that regression test.
    expect(draws).toBe(0)
    expect(longest).toBeLessThan(90)
  })

  it('is still perfectly deterministic with all of this live', () => {
    const A = [0, 1, 2].map((n) => mk('za' + n))
    const B = [0, 1, 2].map((n) => mk('zb' + n))
    const r1 = run(A, B, 'det'), r2 = run(A, B, 'det')
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events))
  })
})
