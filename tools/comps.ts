// THE COMPOSITIONS EVERY BALANCE MEASUREMENT IS MADE AGAINST.
//
// ⚠️ ONE DEFINITION, TWO HARNESSES. `sweep40.ts` and `ab.ts` each carried their
// own copy of a ten-composition list. Identical today, free to drift tomorrow —
// and a paired A/B that disagrees with the sweep because the two are fighting
// different teams is worse than no measurement at all.
//
// ⚠️ AND THEY ARE THE GAME'S OWN TEAM SHAPES. Both copies were hand-picked
// species triples that existed NOWHERE in the game, so every balance number was
// measured against teams no player would ever field. `src/teamTemplates.ts` was
// written to close exactly that gap, and its header already claimed to be "THE
// SWEEP'S COMPOSITIONS" — but it was imported by nothing except its own test.
// Six templates, a species picker and a full test file, all unreachable. That is
// this project's signature failure mode, committed in the same file as the
// warning about it.
import { speciesForTemplate, templateById } from '../src/teamTemplates'

/**
 * ⚠️ SPANNING, NOT SAMPLING. Melee measured as hopeless (100% deaths) alone and
 * fine (81%) beside a second front-liner — same monsters, different team. So
 * these deliberately reach from all-caster to double-front rather than
 * collecting "typical" teams, because there is no typical team. The templates
 * supply that span natively: Coven is the glass cannon, Phalanx the wall.
 */
const PAIRINGS: [string, string][] = [
  ['hammer-anvil', 'hammer-anvil'], // the generalist baseline
  ['phalanx', 'coven'],             // wall vs glass
  ['coven', 'wolfpack'],            // glass vs divers
  ['vanguard', 'choir'],            // burst vs attrition — the sustain question
  ['phalanx', 'vanguard'],          // wall vs burst
  ['wolfpack', 'choir'],            // divers vs support
  ['coven', 'coven'],               // all-caster mirror
  ['phalanx', 'phalanx'],           // ⚠️ the tank mirror that grinds — 40.9s and
  //                                   a first kill at 16.1s, against 10.7s/5.6s
  //                                   for Coven v Wolfpack. This shape is the
  //                                   focus-fire problem, and dropping it from
  //                                   the list would hide the thing worth fixing.
  ['hammer-anvil', 'wolfpack'],
  ['choir', 'coven'],
]

export const TEAM_SIZE = 3

/**
 * ⚠️ ROSTERS ARE FIXED, NOT ROLLED PER SEED. `speciesForTemplate` takes a
 * constant here, so a composition names the same species every run and only the
 * MONSTER seeds vary across batches. Rolling species per batch would fold
 * template variance into the error band and blunt the instrument that exists to
 * measure small effects. Composition is a variable ACROSS comps, a constant
 * WITHIN one.
 *
 * A and B draw different seeds, so a mirror is two different Phalanxes rather
 * than a symmetric no-op that can only ever report 50/50.
 */
export const COMPS: { name: string; a: string[]; b: string[] }[] = PAIRINGS.map(([ta, tb], i) => {
  const A = templateById(ta)
  const B = templateById(tb)
  if (!A || !B) throw new Error(`comps: unknown template ${ta}/${tb}`)
  return {
    name: ta === tb ? `${A.name} mirror` : `${A.name} v ${B.name}`,
    a: speciesForTemplate(A, TEAM_SIZE, 1000 + i * 7),
    b: speciesForTemplate(B, TEAM_SIZE, 5000 + i * 13),
  }
})
