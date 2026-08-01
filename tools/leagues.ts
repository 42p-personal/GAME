// SWEEP THE WHOLE PROGRESSION — one 40-matchup run per league ceiling.
//
// ⚠️ `train` IS A BUDGET, NOT A STAT, so a league's cap cannot be passed in
// directly. This binary-searches the budget whose top trained stat lands on each
// cap, then runs the standard sweep there. That mapping is the only reason the
// rows are comparable to each other at all.
// ⚠️ TWO FINDINGS FROM ITS FIRST RUN, BOTH RECORDED HERE SO THEY ARE NOT REDISCOVERED:
//
// 1. `generateMonster` CAPS EVERY STAT AT 1000 regardless of budget. train 6000
//    still tops out at 1000, so the Tamer Elite (1200) and Tamers Apex (1400)
//    CEILINGS CANNOT BE SIMULATED AT ALL — only reached by in-game training via
//    `applyWeek`/`statCapFor`. TRAIN_ELITE in comps.ts is therefore really a
//    MASTERS-tier harness, not an Apex one, and the top two leagues remain
//    unmeasurable. The Apex row below is "every stat near 1000", not "cap 1400".
//
// 2. WOOD IS THE OUTLIER OF THE WHOLE PROGRESSION — 54.7s and a first kill at
//    15.9s, against 17-20s and 5.7-7.4s everywhere above it. At cap 100 the flat
//    +40 in maxHp and a move's base power dominate, so damage-per-HP is far worse
//    than at any later league. The rest of the curve is remarkably flat.
import { generateMonster } from '../src/monster'
import { simulateFieldBattle } from '../src/tamerengine/engine'
import { autoDeployByRole } from '../src/tamerengine/hex'
import { FIELD_H, FIELD_W, SUDDEN_DEATH_AT } from '../src/tamerengine/types'
import { LEAGUES, STATS } from '../src/core'
import { SPECIES } from '../src/species'
import { COMPS } from './comps'

const OB = [
  { x: FIELD_W * (19 / 40), y: FIELD_H * (6 / 22), w: 2.2, h: 2.2 },
  { x: FIELD_W * (21 / 40), y: FIELD_H * (15 / 22), w: 2.2, h: 2.2 },
  { x: FIELD_W * (13 / 40), y: FIELD_H * (11 / 22), w: 2, h: 2 },
  { x: FIELD_W * (27 / 40), y: FIELD_H * (11 / 22), w: 2, h: 2 },
]
const topStat = (train: number) => {
  let mx = 0
  for (const sp of SPECIES) {
    const m = generateMonster(`cal-${sp.id}`, { speciesId: sp.id, train }) as never as
      { stats: Record<string, number> }
    for (const s of STATS) mx = Math.max(mx, m.stats[s])
  }
  return mx
}
/** Budget whose top trained stat lands nearest `cap`. */
function trainForCap(cap: number): number {
  let lo = 20, hi = 6000
  for (let i = 0; i < 18; i++) {
    const mid = Math.round((lo + hi) / 2)
    if (topStat(mid) < cap) lo = mid; else hi = mid
  }
  return hi
}

const WANT = ['Wood', 'Tin', 'Iron', 'Gold', 'Masters', 'Tamers Apex']
console.log('league        cap  train  topStat  resolved    dur   kills  dmg/fight  1st kill')
for (const name of WANT) {
  const L = LEAGUES.find((l) => l.name === name)!
  const train = trainForCap(L.cap)
  let fights = 0, res = 0, dur = 0, kills = 0, dmg = 0, fk = 0, fkn = 0
  for (const c of COMPS) for (const sd of ['s1', 's2', 's3', 's4']) {
    const mk = (id: string, sp: string) => generateMonster(id, { speciesId: sp, train }) as never
    const A = c.a.map((s, i) => mk(`${sd}${c.name}a${i}`, s))
    const B = c.b.map((s, i) => mk(`${sd}${c.name}b${i}`, s))
    const fr = (m: never) => {
      const st = (m as never as { stats: Record<string, number> }).stats
      return { front: st.CON + st.STR - st.INT - st.WIS }
    }
    const r = simulateFieldBattle({ seed: sd + c.name, teamA: A, teamB: B, obstacles: OB,
      placeA: autoDeployByRole('A', A.map(fr)), placeB: autoDeployByRole('B', B.map(fr)) })
    fights++; dur += r.duration
    if (r.duration < SUDDEN_DEATH_AT) res++
    const ev = r.events as never as { kind: string; t: number; dmg: number }[]
    const first = ev.find((e) => e.kind === 'death')
    if (first) { fk += first.t; fkn++ }
    for (const e of ev) { if (e.kind === 'death') kills++; if (e.kind === 'hit') dmg += e.dmg }
  }
  console.log(`${name.padEnd(12)}${String(L.cap).padStart(5)}${String(train).padStart(7)}`
    + `${String(topStat(train)).padStart(9)}${(res + '/' + fights).padStart(10)}`
    + `${(dur / fights).toFixed(1) + 's'}`.padStart(8) + String(kills).padStart(8)
    + (dmg / fights).toFixed(0).padStart(11)
    + `${fkn ? (fk / fkn).toFixed(1) + 's' : '-'}`.padStart(10))
}
