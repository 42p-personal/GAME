// Dev-only design validation. Catches data drift that produced real bugs before:
// species whose stats derive a different class than their naturalClass, duplicate
// class stat-pairs (which shadow each other), and degenerate stat spreads.
import { BODY_ELEMENT, BodyType, CLASSES, LEAGUES, STATS, classForStats } from './core'
import { SPECIES } from './species'
import { ALL_MOVES } from './moves'
import { trainingProfileFor } from './game'
import { TOURNAMENT_CALENDAR } from './town'

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
    // Training weakness should never be one of its two class-defining stats.
    const prof = trainingProfileFor(sp)
    if (prof.weakness === sorted[0] || prof.weakness === sorted[1]) {
      problems.push(`${sp.name}: training weakness ${prof.weakness} is one of its class stats.`)
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

  // Tournament calendar: valid leagues/months, unique ids, and the economy rule —
  // a Wood-league event must run EVERY month (repeatable low-league income).
  const tourIds = new Set<string>()
  const woodMonths = new Set<number>()
  for (const t of TOURNAMENT_CALENDAR) {
    if (tourIds.has(t.id)) problems.push(`CALENDAR: duplicate tournament id ${t.id}.`)
    tourIds.add(t.id)
    if (!LEAGUES.some((l) => l.name === t.league)) problems.push(`CALENDAR: ${t.name} has unknown league "${t.league}".`)
    if (t.month < 1 || t.month > 12) problems.push(`CALENDAR: ${t.name} has invalid month ${t.month}.`)
    if (t.league === 'Wood') woodMonths.add(t.month)
  }
  for (let mo = 1; mo <= 12; mo++) {
    if (!woodMonths.has(mo)) problems.push(`CALENDAR: no Wood-league event in month ${mo} — new monsters have no income there.`)
  }

  if (problems.length) console.warn('[design-validation] issues found:\n - ' + problems.join('\n - '))
  else console.info(`[design-validation] ${SPECIES.length} species, ${CLASSES.length} classes, ${ALL_MOVES.length} moves, ${TOURNAMENT_CALENDAR.length} tournaments — all consistent ✓`)
}
