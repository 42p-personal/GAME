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
const PAIRINGS: [string, string, number][] = [
  // [template A, template B, TEAM SIZE]
  //
  // ⚠️ SIZE IS PART OF THE COMPOSITION. Every pairing used to be 3v3, so the
  // instrument measured Bronze/Iron and nothing else while the game runs 1v1
  // (Wood) to 6v6 (Tamer Elite). It was blind by construction to the only place
  // the fight clock ever binds: at 6v6 one fight in forty ran 166.9s, against a
  // 31.7s max at 3v3 — a tail that simply does not exist at small sizes. Balance
  // decisions for Tamer Elite were being made on Tin-league evidence.
  //
  // 1v1 is deliberately absent: a team of one has no composition to vary, so it
  // measures a species rather than a shape. Wood league wants its own harness if
  // it ever needs one.
  ['coven', 'coven', 2],              // all-caster mirror, Copper/Tin scale
  ['coven', 'wolfpack', 2],           // glass vs divers
  ['hammer-anvil', 'hammer-anvil', 3], // the generalist baseline
  ['phalanx', 'vanguard', 3],         // wall vs burst
  ['phalanx', 'coven', 4],            // wall vs glass
  ['wolfpack', 'choir', 4],           // divers vs support
  ['vanguard', 'choir', 5],           // burst vs attrition — the sustain question
  ['hammer-anvil', 'wolfpack', 5],
  ['phalanx', 'phalanx', 6],          // ⚠️ the tank mirror that grinds, at the size
  //                                     where the tail actually lives. Dropping
  //                                     either the shape or the size hides it.
  ['choir', 'coven', 6],
]

export const COMPS: { name: string; a: string[]; b: string[]; size: number }[] =
  PAIRINGS.map(([ta, tb, size], i) => {
    const A = templateById(ta)
    const B = templateById(tb)
    if (!A || !B) throw new Error(`comps: unknown template ${ta}/${tb}`)
    const label = ta === tb ? `${A.name} mirror` : `${A.name} v ${B.name}`
    return {
      name: `${label} ${size}v${size}`,
      size,
      a: speciesForTemplate(A, size, 1000 + i * 7),
      b: speciesForTemplate(B, size, 5000 + i * 13),
    }
  })

/** Mean team size across the sweep — for anything that needs a single figure. */
export const TEAM_SIZE = Math.round(
  COMPS.reduce((n, c) => n + c.size, 0) / COMPS.length)
