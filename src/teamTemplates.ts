// TEAM TEMPLATES — the shapes a non-player tamer's roster can take.
//
// ⚠️ WHY THESE EXIST. Rival teams were assembled from a league budget with no
// notion of composition, so every opponent tended toward the same undifferentiated
// mix. A template gives a team an IDENTITY a player can scout, plan against, and
// eventually recognise — and it makes "what does a support actually do for a
// team" a question the game can answer, because some templates field one and some
// deliberately do not.
//
// ⚠️ AND THEY ARE THE SWEEP'S COMPOSITIONS. `sweep40`/`ab.ts` used ten hand-picked
// fixtures that existed nowhere in the game — so every balance number was measured
// against teams no player would ever fight. Templates close that: the harness
// tests the shapes the game actually produces.
//
// ⚠️ SLOTS, NOT ROSTERS. A template constrains ROLES; the species inside each slot
// still vary by seed. Fixed rosters would make five opponents repeat forever.
// `CLASS_ROLES` is not the vocabulary here — it is only damage/support, far too
// coarse to build a team from — and classes are emergent from trained stats
// anyway, so a team cannot be assembled out of them.
import { PRESTIGE_BODIES, Stats, TeamGameplan, isFusionBody } from './core'
import { SPECIES } from './species'

/**
 * The default pool: BASE bodies only.
 *
 * ⚠️ Ranking raw base stats without this filter hands every slot to the prestige
 * tier — the first draft of these templates fielded `titanrex` in four of six
 * shapes and `archmage-aleph` in three, because Mythical and Abyssal simply have
 * bigger numbers. That is not a team template, it is a list of the best species.
 * Prestige and fusion bodies are licence-gated content and a rival at Wood league
 * should not be fielding them; pass an explicit pool for the high leagues.
 */
export const BASE_POOL = SPECIES.filter(
  (sp) => !PRESTIGE_BODIES.includes(sp.body) && !isFusionBody(sp.body))

export type TeamSlot = 'front' | 'skirmish' | 'caster' | 'support' | 'flex'

export interface TeamTemplate {
  id: string
  name: string
  /** What the shape is FOR — the plan a scouting player should be able to read. */
  brief: string
  /** The repeating role pattern. Cycled to fill whatever size the league wants. */
  pattern: TeamSlot[]
  /**
   * The PLAN this shape fights to — the `Tactics` its members carry.
   *
   * ⚠️ A SHAPE WITHOUT A PLAN IS HALF A TEAM. A template says who is on the field;
   * a gameplan says what they are trying to do with each other. Two walls and a
   * mender told to play `aggressive/dive` is not a Phalanx, it is a Phalanx losing.
   * Until this existed, every composition in the balance harness fought on
   * identical neutral orders, so the sweep spanned ten SHAPES and exactly one PLAN.
   *
   * ⚠️ REUSES `GAMEPLANS`, DOES NOT INVENT A TWELFTH VOCABULARY. These are the five
   * plans rival teams actually field and players actually scout. Authoring separate
   * harness-only tactics would put the sweep back to measuring fights that happen
   * nowhere in the game — the precise mistake `tools/comps.ts` was written to undo.
   *
   * ⚠️ `hammer-anvil` DELIBERATELY HAS NONE. It is the generalist baseline, and a
   * harness with no unordered control cannot tell "this plan helped" from "having
   * any plan at all helped".
   */
  gameplan?: TeamGameplan
}

/**
 * ⚠️ SUSTAIN IS WORTH WHAT THE FIGHT IS LONG ENOUGH TO USE. A tank-heavy side
 * fights for 40s and converts healing into wins; a glass side resolves in 12s and
 * a support is a wasted slot. So a template DECLARES whether it carries one
 * rather than rolling for it, and the tanky shapes are the ones that do.
 */
export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'phalanx',
    name: 'Phalanx',
    brief: 'Two walls and a mender. Wins long, loses to burst that ignores the front.',
    pattern: ['front', 'front', 'support'],
    gameplan: 'bulwark', // turtle behind the wall and protect the carry — the same thing the shape is built to do
  },
  {
    id: 'hammer-anvil',
    name: 'Hammer & Anvil',
    brief: 'A wall to hold, a knife to flank, a caster behind. The generalist shape.',
    pattern: ['front', 'skirmish', 'caster'],
  },
  {
    id: 'coven',
    name: 'Coven',
    brief: 'All casters, no front. Enormous output, dies to anything that reaches it.',
    pattern: ['caster', 'caster', 'flex'],
    gameplan: 'zone', // back-row casters, AoE, hunting the fragile — an all-caster side has no other plan
  },
  {
    id: 'wolfpack',
    name: 'Wolfpack',
    brief: 'Skirmishers only. Fast, flanking, and deliberately without sustain.',
    pattern: ['skirmish', 'skirmish', 'flex'],
    gameplan: 'rushdown', // fast, aggressive, no support; the plan and the pattern say the same sentence
  },
  {
    id: 'choir',
    name: 'Choir',
    brief: 'One wall, two supports. Attrition — wants the clock and hates burst.',
    pattern: ['front', 'support', 'support'],
    gameplan: 'attrition', // wants the clock and out-sustains you — one wall and two supports is the roster for it
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    brief: 'Front-loaded pressure with no healer. Ends fights before sustain matters.',
    pattern: ['front', 'front', 'skirmish'],
    gameplan: 'focusfire', // front-loaded burst that ends the fight before sustain matters
  },
]

export const templateById = (id: string): TeamTemplate | undefined =>
  TEAM_TEMPLATES.find((t) => t.id === id)

/** Cycle a template's pattern out to the league's team size. */
export function slotsFor(t: TeamTemplate, size: number): TeamSlot[] {
  const out: TeamSlot[] = []
  for (let i = 0; i < size; i++) out.push(t.pattern[i % t.pattern.length])
  return out
}

/**
 * How well a species' BASE stats suit a slot. Base, not trained: training is the
 * player's lever, and a template is choosing raw material.
 */
export function slotAffinity(base: Stats, slot: TeamSlot): number {
  const { STR, DEX, CON, WIS, INT, CHA } = base
  switch (slot) {
    case 'front': return CON * 1.3 + STR
    case 'skirmish': return DEX * 1.4 + STR * 0.4
    case 'caster': return INT * 1.4 + WIS * 0.3
    // ⚠️ WIS leads and CHA supports it, because WIS is the only stat that can
    // heal another monster (CHA empowers, CON protects). A support slot that
    // weighted CHA first would field buffers and never a healer.
    case 'support': return WIS * 1.4 + CHA * 0.6
    case 'flex': return STR + DEX + CON + WIS + INT + CHA
  }
}

/**
 * Deterministically pick species for a template's slots.
 *
 * ⚠️ Draws from the top `spread` candidates rather than always the single best,
 * or every Phalanx in the game fields the same two species forever. The seed
 * picks within that band, so two Phalanxes look related but not identical.
 */
export function speciesForTemplate(
  t: TeamTemplate,
  size: number,
  seedNum: number,
  pool = BASE_POOL,
  spread = 6,
): string[] {
  const taken = new Set<string>()
  const out: string[] = []
  slotsFor(t, size).forEach((slot, i) => {
    const ranked = [...pool]
      .filter((sp) => !taken.has(sp.id))
      .sort((a, b) => slotAffinity(b.base, slot) - slotAffinity(a.base, slot)
        || a.id.localeCompare(b.id))
    // A simple mixed hash of seed and slot index — no rng, so a template plus a
    // seed always yields the same roster and a replay reproduces.
    const pick = ranked[Math.abs((seedNum * 2654435761 + i * 40503) >>> 0) % Math.min(spread, ranked.length)]
    if (!pick) return
    taken.add(pick.id)
    out.push(pick.id)
  })
  return out
}
