// SIGNATURE SKILLS (v0.91, user spec 2026-07-27) — the one move a monster earns
// rather than learns, and the only thing besides stats and potential that a
// bloodline passes down.
//
// EARNED at the annual marquee. The six PRESTIGE_EVENTS (town.ts) are the fixed
// once-a-year, same-date championships — The Silver Crescent through The Dynasty
// Eternal, one per league Silver→Tamers Apex. WIN one and the team's strongest
// monster forges a signature themed on its own best stat and tiered by the
// league it won in. That is the only source. Nothing else in the game grants one.
//
// Three consequences of putting it on the marquee specifically:
//   1. Scarcity is structural, not a tuned drop-rate — six chances a YEAR exist
//      in the whole world, and only in leagues you've licensed into.
//   2. The marquees finally matter beyond their (already larger) purse. Before
//      this they were a bigger cup; now they're the only way to make one.
//   3. An inherited signature is genuinely an heirloom — the child is carrying
//      something its parent won on a specific date, which the log records.
//
// INHERITED DORMANT. A bred child of a signature-holder is born knowing the move
// at SIGNATURE_DORMANT_MULT power and stripped of its rider effect, and awakens
// it to full by training the relevant stat up to what the parent had when the
// parent forged it (`awakenStat`). So the dynasty starts ahead but still has
// something left to achieve, and the bar it must clear is literally its
// ancestor's peak. See breed() in town.ts and the awakening check in applyWeek.
//
// COSTS A NORMAL SLOT. The signature is appended to the learned-move pool by
// careerMonster(), so it competes with the 90-move pool for one of the three
// loadout slots like anything else. That is deliberate (user spec): it keeps
// total equipped power flat and makes wielding the heirloom a real choice.
//
// ⚠️ Why the golden battle tests do NOT move: this file adds no engine code.
// A signature resolves to an ordinary `Move`, handed to simulateTeamBattle
// through the existing loadout path. Generated and rival monsters never carry
// one, so every golden matchup is byte-identical.
import { Move, MoveType, Channel, Stat } from './core'

export interface Signature {
  id: string // synthesized move id, never collides with the MOVES pool ('SIG-…')
  name: string
  stat: Stat // the stat it is themed on and scales with
  tier: number // 0..5 — index into SIGNATURE_LEAGUES, drives power
  eventName: string // the marquee it was won at, for the log and the UI
  forgedBy: string // the monster that first earned it — carried down the line
  awakenStat: number // stat value an heir must reach to wield it at full power
  awakened: boolean // false only for an inherited copy that hasn't met the bar
  inherited: number // 0 = forged here; N = generations down the line
}

// The six marquee-bearing leagues, in ladder order. Index === Signature.tier.
export const SIGNATURE_LEAGUES = ['Silver', 'Gold', 'Platinum', 'Masters', 'Tamer Elite', 'Tamers Apex']

// Power by tier. The strongest moves in the 90-move pool top out at 70 power but
// gate at learnLevel 920 — effectively a late-career reward. A signature trades
// that: a Silver champion wields 38 power YEARS before any pool move comes close,
// and only an Apex winner (73) edges past what the pool can eventually offer.
export const SIGNATURE_BASE_POWER = 38
export const SIGNATURE_TIER_STEP = 7
export const signaturePower = (tier: number): number => SIGNATURE_BASE_POWER + tier * SIGNATURE_TIER_STEP

// A dormant (inherited, un-awakened) signature keeps its identity but not its
// edge: 60% power and no rider effect. Still worth a slot on a young heir,
// never worth as much as earning it.
export const SIGNATURE_DORMANT_MULT = 0.6

// Names climb in grandeur with the league, so a monster's signature announces
// which marquee its line won. Six per stat, one per tier.
const SIGNATURE_NAMES: Record<Stat, string[]> = {
  STR: ['Ironbreaker', 'Mountainfall', 'The Sundering', "Titan's Verdict", 'Worldbreak', 'Atlas Unbound'],
  DEX: ['Ghoststep', 'Thousand Cuts', 'The Vanishing', 'Windshear Rite', 'Perfect Zero', 'Zenith Flicker'],
  CON: ['Unyielding', 'Bastion Eternal', 'The Long Stand', 'Aegis Absolute', 'Immovable', 'Bulwark of Ages'],
  WIS: ['Clear Water', 'The Still Point', 'Farsight', "Oracle's Descent", 'Providence', 'The Unclouded Eye'],
  INT: ['Emberthought', 'Runewright', 'The Calculus', 'Arcane Ascendant', 'Prime Equation', 'Theorem of Ruin'],
  CHA: ['Crowdfire', 'The Standing Ovation', 'Silver Tongue', 'Aria of Command', 'The Grand Finale', 'Legend Undying'],
}

// Shape per stat follows the SAME identity rules as the 90-move pool (moves.ts
// header): CON is the only stat that shields, WIS heals the team, INT is pure
// elemental damage, CHA works on the whole enemy side. A signature is the
// flagship expression of its stat, not an exception to it.
const SHAPE: Record<Stat, { type: MoveType; channel: Channel; target: Move['target']; element?: Move['element'] }> = {
  STR: { type: 'damage', channel: 'melee', target: 'enemy' },
  DEX: { type: 'damage', channel: 'ranged', target: 'enemy' },
  CON: { type: 'buff', channel: 'support', target: 'self' },
  WIS: { type: 'buff', channel: 'support', target: 'team' },
  INT: { type: 'damage', channel: 'magic', target: 'enemy', element: 'fire' },
  CHA: { type: 'damage', channel: 'voice', target: 'allEnemies' },
}

// The rider — dropped entirely while dormant, which is most of what makes an
// un-awakened heirloom weaker than the real thing.
const rider = (stat: Stat, tier: number): Move['effects'] => {
  const scale = 1 + tier * 0.1
  switch (stat) {
    case 'STR': return { pierce: 0.35, maxHpDmg: Math.round(6 * scale) / 100 }
    case 'DEX': return { pierce: 0.2, execute: 0.3 }
    case 'CON': return { ward: Math.round(22 * scale), thorns: Math.round(4 * scale), duration: 3 }
    case 'WIS': return { cleanse: true, hpRegenBuff: Math.round(5 * scale), duration: 3 }
    case 'INT': return { pierce: 0.25, bonusVsStatus: { kind: 'burn', mult: 1.5 } }
    case 'CHA': return { atkDebuff: 0.15, duration: 3 }
  }
}

const FLAVOUR: Record<Stat, string> = {
  STR: 'A blow the crowd still talks about.',
  DEX: 'Nobody in the stands saw it land.',
  CON: 'It simply refused to give ground.',
  WIS: 'Calm spreads across the whole team.',
  INT: 'The air itself was rewritten.',
  CHA: 'The whole arena turned on the opponent.',
}

// Build the real Move a Signature resolves to. Dormant copies lose the rider and
// 40% of their power; everything else about them is identical, so the UI and the
// battle engine treat an heirloom exactly like any other equipped move.
export function signatureMove(sig: Signature): Move {
  const shape = SHAPE[sig.stat]
  const full = signaturePower(sig.tier)
  const power = sig.awakened ? full : Math.round(full * SIGNATURE_DORMANT_MULT)
  return {
    id: sig.id,
    name: sig.name,
    stat: sig.stat,
    learnLevel: 0, // earned, never learned — careerMonster appends it directly
    type: shape.type,
    channel: shape.channel,
    target: shape.target,
    element: shape.element,
    cooldown: 5,
    accuracy: 92,
    power,
    effects: sig.awakened ? rider(sig.stat, sig.tier) : undefined,
    desc: (sig.awakened ? '★ Signature — ' : '☆ Dormant signature — ') + FLAVOUR[sig.stat],
  }
}

// Forge a brand-new signature. `stat` is the winner's best stat, `tier` the index
// of the marquee's league, `atStat` the winner's value in that stat right now —
// which becomes the bar every heir must clear to awaken the move.
export function forgeSignature(opts: {
  stat: Stat
  tier: number
  atStat: number
  eventName: string
  forgedBy: string
  seed: string
}): Signature {
  const tier = Math.max(0, Math.min(SIGNATURE_LEAGUES.length - 1, opts.tier))
  return {
    id: `SIG-${opts.stat}-${tier}-${opts.seed}`,
    name: SIGNATURE_NAMES[opts.stat][tier],
    stat: opts.stat,
    tier,
    eventName: opts.eventName,
    forgedBy: opts.forgedBy,
    awakenStat: opts.atStat,
    awakened: true,
    inherited: 0,
  }
}

// The copy a bred child is born with: same move, same lineage, dormant until the
// heir matches its ancestor's peak in that stat.
export const inheritSignature = (sig: Signature): Signature => ({
  ...sig,
  awakened: false,
  inherited: (sig.inherited ?? 0) + 1,
})

// Pure check — has this heir earned the right to wield it at full power?
export const canAwaken = (sig: Signature, stats: Record<Stat, number>): boolean =>
  !sig.awakened && stats[sig.stat] >= sig.awakenStat
