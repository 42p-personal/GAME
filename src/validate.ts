// Dev-only design validation. Catches data drift that produced real bugs before:
// species whose stats derive a different class than their naturalClass, duplicate
// class stat-pairs (which shadow each other), and degenerate stat spreads.
import { BODY_ELEMENT, BodyType, CLASSES, LEAGUES, STATS, classForStats } from './core'
import { SPECIES } from './species'
import { ALL_MOVES } from './moves'
import { trainingProfileFor } from './game'
import { RANK_UP_MONTHS, RANK_UP_WEEK, tournamentCalendarFor } from './town'

export function validateDesign(): void {
  const problems: string[] = []

  // Class table: primary/secondary pairs must be unique or later entries are unreachable.
  const seenPairs = new Map<string, string>()
  for (const c of CLASSES) {
    const key = c.primary + '/' + c.secondary
    const prev = seenPairs.get(key)
    if (prev) problems.push(`CLASSES: ${c.name} duplicates ${prev}'s stat pair ${key} — ${c.name} is unreachable.`)
    seenPairs.set(key, c.name)
  }

  // Element affinities: every body type must have a unique (resist, weak) pair.
  const seenElements = new Map<string, string>()
  for (const [body, aff] of Object.entries(BODY_ELEMENT) as [BodyType, { resist: string; weak: string }][]) {
    if (aff.resist === aff.weak) problems.push(`BODY_ELEMENT: ${body} resists and is weak to ${aff.resist}.`)
    const key = aff.resist + '>' + aff.weak
    const prev = seenElements.get(key)
    if (prev) problems.push(`BODY_ELEMENT: ${body} duplicates ${prev}'s affinity (resist ${aff.resist} / weak ${aff.weak}).`)
    seenElements.set(key, body)
  }

  for (const sp of SPECIES) {
    // The class its base stats derive must match its declared naturalClass.
    const derived = classForStats(sp.base)
    if (derived !== sp.naturalClass) {
      problems.push(`${sp.name}: naturalClass is ${sp.naturalClass} but base stats derive ${derived}.`)
    }
    // Top-two stats must be strictly above the lowest (1 major + 1 minor + 1 weakness shape).
    const sorted = [...STATS].sort((a, b) => sp.base[b] - sp.base[a])
    if (sp.base[sorted[0]] === sp.base[sorted[1]]) {
      problems.push(`${sp.name}: top two stats tie (${sorted[0]}/${sorted[1]}) — class derivation is order-dependent.`)
    }
    // Training flaw should never be one of its two class-defining stats.
    const prof = trainingProfileFor(sp)
    if (prof.flaw === sorted[0] || prof.flaw === sorted[1]) {
      problems.push(`${sp.name}: training flaw ${prof.flaw} is one of its class stats.`)
    }
  }

  // Move pool: unique names, sane learn levels and effect fractions.
  const moveNames = new Set<string>()
  for (const mv of ALL_MOVES) {
    if (moveNames.has(mv.name)) problems.push(`MOVES: duplicate move name "${mv.name}".`)
    moveNames.add(mv.name)
    if (mv.learnLevel < 40 || mv.learnLevel > 920) problems.push(`MOVES: ${mv.name} learnLevel ${mv.learnLevel} outside 40–920.`)
    const e = mv.effects
    if (e) {
      for (const k of ['pierce', 'lifesteal', 'recoil', 'execute'] as const) {
        const v = e[k]
        if (v !== undefined && (v <= 0 || v > 1)) problems.push(`MOVES: ${mv.name} ${k}=${v} outside (0,1].`)
      }
      if (e.hits && (e.hits[0] < 1 || e.hits[1] < e.hits[0])) problems.push(`MOVES: ${mv.name} has invalid hits range.`)
    }
    if (mv.type === 'damage' && mv.power <= 0) problems.push(`MOVES: damage move ${mv.name} has no power.`)
  }

  // Tournament calendar generator: probe several seed-years and assert the
  // economy invariant — every circuit league (below Silver) has at least one
  // event per quarter (max two), valid leagues/months, unique ids and names.
  const circuit = ['Wood', 'Copper', 'Tin', 'Bronze', 'Iron']
  for (const seed of ['probe-a', 'probe-b', 'probe-c']) {
    for (let year = 0; year < 4; year++) {
      const cal = tournamentCalendarFor(seed, year)
      const ids = new Set<string>()
      const names = new Set<string>()
      for (const t of cal) {
        if (ids.has(t.id)) problems.push(`CALENDAR(${seed}/y${year}): duplicate id ${t.id}.`)
        ids.add(t.id)
        if (names.has(t.name)) problems.push(`CALENDAR(${seed}/y${year}): duplicate name ${t.name}.`)
        names.add(t.name)
        if (!LEAGUES.some((l) => l.name === t.league)) problems.push(`CALENDAR(${seed}/y${year}): unknown league "${t.league}".`)
        if (t.month < 1 || t.month > 12) problems.push(`CALENDAR(${seed}/y${year}): ${t.name} invalid month ${t.month}.`)
        if (t.week < 1 || t.week > 4) problems.push(`CALENDAR(${seed}/y${year}): ${t.name} invalid week ${t.week}.`)
        if (RANK_UP_MONTHS.includes(t.month) && t.week === RANK_UP_WEEK)
          problems.push(`CALENDAR(${seed}/y${year}): ${t.name} collides with the rank-up trials (month ${t.month}, week ${t.week}).`)
      }
      for (const league of circuit) {
        for (let q = 0; q < 4; q++) {
          const inQuarter = cal.filter((t) => t.league === league && t.month > q * 3 && t.month <= q * 3 + 3).length
          if (inQuarter < 1) problems.push(`CALENDAR(${seed}/y${year}): ${league} has no event in Q${q + 1}.`)
          if (inQuarter > 2) problems.push(`CALENDAR(${seed}/y${year}): ${league} has ${inQuarter} events in Q${q + 1} (max 2).`)
        }
      }
    }
  }

  const sample = tournamentCalendarFor('probe-a', 0)
  if (problems.length) console.warn('[design-validation] issues found:\n - ' + problems.join('\n - '))
  else console.info(`[design-validation] ${SPECIES.length} species, ${CLASSES.length} classes, ${ALL_MOVES.length} moves, ~${sample.length} tournaments/yr — all consistent ✓`)
}
