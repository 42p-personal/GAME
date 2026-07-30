// PAIRED A/B for balance constants.
//
// ⚠️ Pooled means cannot see small effects here. The 40-matchup sweep has sd 3.04s
// on duration, because its ten compositions genuinely differ (an all-caster fight
// resolves fast, a tank mirror grinds) — that spread is real signal about the game
// but pure noise when comparing two constants.
//
// The sim is deterministic given a seed, so the SAME fight can be run under both
// settings and compared directly. Pairing removes composition variance entirely and
// leaves only the effect of the change, which is the difference between "cannot
// distinguish 1/320 from 1/270" and a clean answer.
//
// Usage: npx tsx tools/ab.ts <label-A> <label-B>
//   Requires the caller to have produced two JSON snapshots via --dump.
//   npx tsx tools/ab.ts --dump out.json     (run once per setting)
import { generateMonster } from '../src/monster'
import { simulateFieldBattle } from '../src/tamerengine/engine'
import { autoDeployByRole } from '../src/tamerengine/hex'
import * as fs from 'fs'

const mk = (id: string, sp: string, train = 850) => generateMonster(id, { speciesId: sp, train }) as never
const OBSTACLES = [
  { x: 19, y: 6, w: 2.2, h: 2.2 }, { x: 21, y: 15, w: 2.2, h: 2.2 },
  { x: 13, y: 11, w: 2, h: 2 }, { x: 27, y: 11, w: 2, h: 2 },
]
const COMPS: { name: string; a: string[]; b: string[] }[] = [
  { name: 'balanced',      a: ['kongrath', 'maelurk', 'larkessa'],          b: ['aegisox', 'strixil', 'pinguox'] },
  { name: 'all-caster',    a: ['maelurk', 'strixil', 'archmage-aleph'],     b: ['abyssomancer', 'carcharun', 'frostwyren'] },
  { name: 'double-front',  a: ['aegisox', 'kongrath', 'maelurk'],           b: ['ursath', 'maneleo', 'strixil'] },
  { name: 'mixed-arcane',  a: ['lanterix', 'bruxaroo', 'carcharun'],        b: ['lurkerss', 'vespera', 'geckari'] },
  { name: 'assassins',     a: ['grivvel', 'mantevoke', 'larkessa'],         b: ['aegisox', 'nautilux', 'frostwyren'] },
  { name: 'support-heavy', a: ['strixil', 'koalio', 'tortavos'],            b: ['quokkade', 'carcharun', 'aegisox'] },
  { name: 'marksmen',      a: ['pinguox', 'mantaris', 'maelurk'],           b: ['kongrath', 'aegisox', 'strixil'] },
  { name: 'generalists',   a: ['corvaan', 'tazzik', 'abyssomancer'],        b: ['geckari', 'odonatra', 'sylvaglide'] },
  { name: 'tank-mirror',   a: ['aegisox', 'tortavos', 'ursath'],            b: ['vipramane', 'nautilux', 'crocmaw'] },
  { name: 'glass',         a: ['archmage-aleph', 'grivvel', 'stormlerath'], b: ['lurkerss', 'balaenix', 'stellarion'] },
]
const SEEDS = ['s1', 's2', 's3', 's4']

function collect() {
  const rows: { key: string; dur: number; resolved: number; dmg: number }[] = []
  for (const comp of COMPS) for (const sd of SEEDS) {
    const A = comp.a.map((s, i) => mk(`${sd}${comp.name}a${i}`, s))
    const B = comp.b.map((s, i) => mk(`${sd}${comp.name}b${i}`, s))
    const front = (m: never) => { const st = (m as never as { stats: Record<string, number> }).stats
      return { front: st.CON + st.STR - st.INT - st.WIS } }
    const r = simulateFieldBattle({ seed: sd + comp.name, teamA: A, teamB: B, obstacles: OBSTACLES,
      placeA: autoDeployByRole('A', A.map(front)), placeB: autoDeployByRole('B', B.map(front)) })
    let dmg = 0
    for (const e of r.events as never as { kind: string; dmg: number }[]) if (e.kind === 'hit') dmg += e.dmg
    rows.push({ key: comp.name + '/' + sd, dur: r.duration, resolved: r.duration < 55 ? 1 : 0, dmg })
  }
  return rows
}

const dumpAt = process.argv.indexOf('--dump')
if (dumpAt >= 0) {
  fs.writeFileSync(process.argv[dumpAt + 1], JSON.stringify(collect()))
  console.log('dumped', process.argv[dumpAt + 1])
} else {
  const A = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as ReturnType<typeof collect>
  const B = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) as ReturnType<typeof collect>
  const map = new Map(A.map((r) => [r.key, r]))
  let better = 0, worse = 0, same = 0, dDur = 0, dRes = 0, dDmg = 0
  const moved: string[] = []
  for (const b of B) {
    const a = map.get(b.key)!; const dd = b.dur - a.dur
    dDur += dd; dRes += b.resolved - a.resolved; dDmg += b.dmg - a.dmg
    if (Math.abs(dd) < 0.05) same++; else if (dd < 0) better++; else worse++
    if (b.resolved !== a.resolved) moved.push(`${b.key} ${a.resolved ? 'resolved->timeout' : 'timeout->RESOLVED'}`)
  }
  const n = B.length
  const durs = B.map((b) => b.dur - map.get(b.key)!.dur)
  const mean = durs.reduce((x, y) => x + y, 0) / n
  const sd = Math.sqrt(durs.map((d) => (d - mean) ** 2).reduce((x, y) => x + y, 0) / n)
  const se = sd / Math.sqrt(n)
  console.log(`PAIRED A/B over ${n} identical matchups\n`)
  console.log(`  fights that got FASTER : ${better}`)
  console.log(`  fights that got SLOWER : ${worse}`)
  console.log(`  unchanged              : ${same}`)
  console.log(`\n  mean duration delta : ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}s  (sd ${sd.toFixed(2)}, se ${se.toFixed(2)})`)
  console.log(`  95% CI              : ${(mean - 1.96 * se).toFixed(2)}s .. ${(mean + 1.96 * se).toFixed(2)}s`)
  console.log(`  resolved delta      : ${dRes >= 0 ? '+' : ''}${dRes} fights`)
  console.log(`  damage/fight delta  : ${dDmg / n >= 0 ? '+' : ''}${(dDmg / n).toFixed(0)}`)
  // ⚠️ The mean CI is the WRONG primary test here and nearly caused a good change
  // to be discarded. A handful of fights swing 20-30s (a fight that tips from
  // timeout to a kill changes wholesale), so sd is huge and the CI is wide even
  // when the change helps almost every fight. The SIGN TEST asks the robust
  // question instead — of the fights that moved at all, did more get better than
  // worse? — and is immune to those outliers.
  const moved2 = better + worse
  const logC = (n: number, k: number) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s }
  let p = 0
  const hi = Math.max(better, worse)
  for (let k = hi; k <= moved2; k++) p += Math.exp(logC(moved2, k) + moved2 * Math.log(0.5))
  p = Math.min(1, 2 * p) // two-tailed
  const meanSig = Math.abs(mean) > 1.96 * se
  console.log(`\n  mean-CI verdict : ${meanSig ? 'significant' : 'not significant (CI includes zero)'}`)
  console.log(`  SIGN TEST       : ${better} better / ${worse} worse of ${moved2} that moved,  p = ${p.toFixed(4)}`)
  console.log(`  => ${p < 0.05
    ? 'REAL EFFECT — more fights improved than chance allows.'
    : 'NO EFFECT — the split is what a coin would give.'}`)
  if (moved.length) console.log('\n  fights that flipped:\n   ', moved.join('\n    '))
}
