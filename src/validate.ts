// Dev-only design validation. Catches data drift that produced real bugs before:
// species whose stats derive a different class than their naturalClass, duplicate
// class stat-pairs (which shadow each other), and degenerate stat spreads.
import { BODY_ELEMENT, BodyType, CLASSES, STATS, classForStats } from './core'
import { SPECIES } from './species'
import { trainingProfileFor } from './game'

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

  if (problems.length) console.warn('[design-validation] issues found:\n - ' + problems.join('\n - '))
  else console.info(`[design-validation] ${SPECIES.length} species, ${CLASSES.length} classes — all consistent ✓`)
}
