// Long-haul balance-sim bot (the "arbiter" from docs/BALANCING.md), rebuilt for
// the v0.81 deferred/interactive tournament flow. Unlike the old scratch bot,
// this one lives in the repo so it stays in sync with the mechanics.
//
//   npx tsx sim/bot.ts            # 3 seeds × 15 years, summary table
//   npx tsx sim/bot.ts 25 5       # <years> <seeds>
//
// It is NOT part of the app build (tsconfig `include` is ["src"] only) — it just
// drives the real exported game functions. A "competent player" coach AI picks
// per-fight orders using ALL the tactics levers (v0.81): temperament, target
// priority (scouting-informed), mana policy, opening SEQUENCE, survival
// (preserve), control-first (ccPriority), combo discipline, formation, protect,
// and focus/mark. Every player match is resolved through stageCup → per-fight
// MatchOrders → finalizeCup/finalizeTrial, exactly like the UI.

import {
  GameState, advanceWeek, buyLicense, buyMonster, eligibleForTournament, finalizeCup, finalizeTrial,
  freezeToLab, breed, leagueIndexOf, monthOfWeek, newGame, nextLicenseCost, resolveEvent as resolveWeeklyEvent,
  roundRobinSchedule, signUp, startTrial, teamSizeForLeague, tournamentCalendarFor, trialStatus, weekOfMonth, yearOfWeek, WeekPlanEntry,
} from '../src/town'
import { Career, careerMonster, careerSpanYears, stageInfo, statCapFor } from '../src/game'
import { LEAGUES, MatchOrders, Monster, STATS, Stat, Tactics, Food } from '../src/core'
import { maxHp } from '../src/monster'

const CC = new Set<string>(['stun', 'sleep', 'fear', 'confusion', 'silence', 'charm', 'knockback', 'blind'])
const total = (s: Record<Stat, number>) => STATS.reduce((t, k) => t + s[k], 0)
const healthy = (c: Career) => c.hp >= maxHp(c.stats) * 0.6 && !c.retired
const WEEKS_PER_YEAR = 48

// --- The coach AI: build one fight's orders, using every lever. -------------
function coachOrders(team: Career[], opp: Monster[]): MatchOrders {
  const favored = team.reduce((s, c) => s + total(c.stats), 0) >= opp.reduce((s, m) => s + total(m.stats), 0)
  const oppHasCaster = Math.max(...opp.map((m) => m.stats.INT + m.stats.WIS)) >= 380
  const markSlot = opp.map((m, i) => ({ i, t: total(m.stats) })).sort((a, b) => b.t - a.t)[0].i // focus their biggest
  const solo = team.length === 1
  const tactics: Record<string, Tactics> = {}
  for (const c of team) {
    const mon = careerMonster(c)
    const dmg = mon.loadout.filter((m) => m.type === 'damage')
    const buff = mon.loadout.filter((m) => m.type !== 'damage' && m.power === 0 && m.target !== 'enemy' && m.target !== 'allEnemies')
    const cc = mon.loadout.some((m) => (m.target === 'enemy' || m.target === 'allEnemies') && m.status && CC.has(m.status.kind))
    const comboReady = mon.loadout.some((p) => p.effects?.bonusVsStatus && mon.loadout.some((s) => s.status?.kind === p.effects!.bonusVsStatus!.kind))
    // Opening SEQUENCE: lead with a buff (if any), then the hardest hit — up to 2.
    const seq: string[] = []
    if (buff[0]) seq.push(buff[0].id)
    for (const d of dmg) { if (seq.length >= 2) break; if (!seq.includes(d.id)) seq.push(d.id) }
    tactics[c.id] = {
      temperament: favored ? 'aggressive' : 'cautious',
      targetPriority: oppHasCaster ? 'casters' : solo ? 'weakest' : 'focus',
      manaPolicy: favored ? 'burst' : 'conserve',
      openerIds: seq.length ? seq.slice(0, 2) : undefined,
      preserve: 'cautious',
      ccPriority: cc,
      comboDiscipline: comboReady,
    }
  }
  const byCon = [...team].sort((a, b) => b.stats.CON - a.stats.CON) // tanks to the front line
  return {
    tactics,
    formation: byCon.map((c) => c.id),
    protectId: solo ? undefined : [...team].sort((a, b) => a.stats.CON - b.stats.CON)[0].id, // guard the squishiest
    mark: solo ? undefined : markSlot,
  }
}

// Resolve a staged event by filling in every player match's orders, then
// finalizing — the bot's equivalent of the interactive battle screen.
function resolveEvent(g: GameState): GameState {
  const ac = g.activeCup
  if (!ac) return g
  const team = ac.playerMonsterIds.map((id) => g.stable.find((c) => c.id === id)).filter((c): c is Career => !!c)
  const oppOrder = ac.kind === 'trial' ? [0]
    : roundRobinSchedule(ac.rivalTeams.length + 1).filter(([i, j]) => i === 0 || j === 0).map(([i, j]) => (i === 0 ? j : i) - 1)
  const matchOrders: Record<number, MatchOrders> = {}
  oppOrder.forEach((oi, k) => { matchOrders[k] = coachOrders(team, ac.rivalTeams[oi]) })
  const g2: GameState = { ...g, activeCup: { ...ac, matchOrders, doneThrough: oppOrder.length - 1 } }
  return ac.kind === 'trial' ? finalizeTrial(g2).game : finalizeCup(g2)
}

// --- Economy loop: a plain "train two-three stats, enter every cup you can". -
function cheapFood(g: GameState): Food {
  return (Object.entries(g.foodMarket).sort((a, b) => a[1] - b[1])[0]?.[0] ?? '') as Food
}
function planFor(c: Career, g: GameState, drills: { id: string; gains: Partial<Record<Stat, number>>; kind: string }[]): WeekPlanEntry {
  const food = cheapFood(g)
  if (c.hp < maxHp(c.stats) * 0.5 || c.stamina < 12) return { activity: 'rest', food }
  const cap = statCapFor(c)
  const targets = STATS.filter((k) => c.stats[k] < cap).sort((a, b) => c.stats[b] - c.stats[a]).slice(0, 3)
  if (!targets.length) return { activity: 'rest', food }
  const stat = targets[g.week % targets.length] // rotate the top few stats to build a real class
  const pool = c.stamina >= 25 ? drills.filter((d) => d.kind === 'intensive') : drills.filter((d) => d.kind === 'basic')
  const drill = pool.find((d) => (d.gains[stat] ?? 0) > 0)
  return { activity: drill?.id ?? 'rest', food }
}

interface Report { seed: string; peak: string; gold: number; gen: number; cupsEntered: number; podiums: number; wins: number; trialsWon: number }

function playGame(seed: string, years: number, DRILLS: { id: string; gains: Partial<Record<Stat, number>>; kind: string }[]): Report {
  let g = newGame(seed, { tutorialEnabled: false })
  let cupsEntered = 0, podiums = 0, wins = 0, trialsWon = 0, peakLicense = 0
  const endWeek = years * WEEKS_PER_YEAR
  while (g.week < endWeek) {
    // 0) Resolve any pending weekly event by its cheapest choice — accepts the
    //    free/beneficial ones (incl. the stray-monster soft-lock backstop)
    //    without splurging on optional purchases.
    if (g.pendingEvent) {
      const cs = g.pendingEvent.choices
      let best = 0
      for (let i = 1; i < cs.length; i++) if ((cs[i].cost ?? 0) < (cs[best].cost ?? 0)) best = i
      g = resolveWeeklyEvent(g, best)
    }
    // 1) Buy a monster when short-handed and there's a cheap offer.
    if (g.stable.filter((c) => !c.retired).length < 3) {
      const idx = g.market.map((o, i) => ({ i, p: (o as { price: number }).price })).filter((o) => o.p <= g.gold * 0.5).sort((a, b) => a.p - b.p)[0]?.i
      if (idx !== undefined) g = buyMonster(g, idx)
    }
    // 2) Buy an earned license.
    if (g.licenseEarned > g.licenseIndex && g.gold >= nextLicenseCost(g)) g = buyLicense(g)
    // 3) Enter the strongest cup we can field a healthy team for this week.
    const cups = tournamentCalendarFor(g.seed, yearOfWeek(g.week))
      .filter((t) => monthOfWeek(g.week) === t.month && weekOfMonth(g.week) === t.week)
      .sort((a, b) => leagueIndexOf(b.league) - leagueIndexOf(a.league))
    for (const t of cups) {
      const size = teamSizeForLeague(t.league)
      const elig = eligibleForTournament(g, t).filter(healthy)
      if (elig.length >= size && !(g.enteredThisMonth ?? []).includes(t.id)) {
        const before = g.pendingTournament
        g = signUp(g, t.id, elig.slice(0, size).map((c) => c.id))
        if (g.pendingTournament && g.pendingTournament !== before) { cupsEntered++; break }
      }
    }
    // 4) Otherwise attempt a rank-up trial when ready.
    if (!g.pendingTournament && trialStatus(g).ok) {
      const size = teamSizeForLeague(LEAGUES[g.licenseIndex].name)
      const elig = g.stable.filter(healthy)
      if (elig.length >= size) g = startTrial(g, elig.slice(0, size).map((c) => c.id))
    }
    // 5) Weekly plans for everyone not competing (competing is forced in advanceWeek).
    const competing = new Set([...(g.pendingTournament?.monsterIds ?? []), ...(g.pendingTrial?.monsterIds ?? [])])
    const weekPlans: Record<string, WeekPlanEntry> = { ...g.weekPlans }
    for (const c of g.stable) if (!c.retired && !competing.has(c.id)) weekPlans[c.id] = planFor(c, g, DRILLS)
    g = { ...g, weekPlans }
    // 6) Freeze a monster in its final year (banks the genome before it retires).
    for (const c of g.stable) {
      if (c.retired || (g.labFrozen ?? []).some((f) => f.id === c.id)) continue
      if (stageInfo(c.ageWeeks, careerSpanYears(c)).stage === 'Elder' && (g.labFrozen ?? []).length < (g.labSlots ?? 3)) g = freezeToLab(g, c.id)
    }
    // 7) Breed two frozen legacies when there's barn room (climbs the generation).
    const frozen = g.labFrozen ?? []
    if (frozen.length >= 2 && g.stable.filter((c) => !c.retired).length < 4) g = breed(g, frozen[0].id, frozen[1].id)

    // 8) Tick, then resolve any staged event through the coach AI.
    g = advanceWeek(g)
    if (g.activeCup) {
      g = resolveEvent(g)
      const lb = g.lastBattle
      if (lb) {
        if (lb.isTrial) { if (lb.playerPlacement === 1) trialsWon++ }
        else { if (lb.playerPlacement === 1) wins++; if (lb.playerPlacement <= 3) podiums++ }
      }
    }
    peakLicense = Math.max(peakLicense, g.licenseIndex)
  }
  const gen = Math.max(1, ...[...g.stable, ...(g.labFrozen ?? [])].map((c) => c.generation ?? 1))
  return { seed, peak: LEAGUES[peakLicense].name, gold: g.gold, gen, cupsEntered, podiums, wins, trialsWon }
}

// --- Runner -----------------------------------------------------------------
async function main() {
  const years = Number(process.argv[2]) || 15
  const seeds = Number(process.argv[3]) || 3
  const { BASIC_DRILLS, INTENSIVE_DRILLS } = await import('../src/drills')
  const DRILLS = [...BASIC_DRILLS, ...INTENSIVE_DRILLS].map((d) => ({ id: d.id, gains: d.gains, kind: d.kind }))
  console.log(`Long-haul bot — ${seeds} seeds × ${years} years (v0.81 flow, all tactics levers)\n`)
  const rows: Report[] = []
  for (let s = 0; s < seeds; s++) rows.push(playGame('bot-seed-' + s, years, DRILLS))
  const pad = (v: unknown, n: number) => String(v).padEnd(n)
  console.log(pad('seed', 14) + pad('peak', 12) + pad('gold', 9) + pad('gen', 5) + pad('cups', 6) + pad('podium', 8) + pad('1st', 5) + 'trials')
  for (const r of rows) console.log(pad(r.seed, 14) + pad(r.peak, 12) + pad(r.gold, 9) + pad(r.gen, 5) + pad(r.cupsEntered, 6) + pad(r.podiums, 8) + pad(r.wins, 5) + r.trialsWon)
  const peakIdx = rows.map((r) => LEAGUES.findIndex((l) => l.name === r.peak))
  console.log(`\npeak leagues: ${rows.map((r) => r.peak).join(' / ')}  (best ${LEAGUES[Math.max(...peakIdx)].name})`)
}
main()
