// Training drills (§2.4). Chosen as a weekly action.
// - Basic drills: raise one stat by a minor amount, no downside.
// - Intensive drills: raise one stat by a greater amount, but slightly lower another.
// Gains are clamped to the monster's license cap and reduced by the life-stage
// training malus (§9.1). Values are first-pass and meant for tuning.
import { Stat } from './core'

export type DrillKind = 'basic' | 'intensive' | 'extreme'

export interface Drill {
  id: string
  name: string
  kind: DrillKind
  gains: Partial<Record<Stat, number>> // positive = raise, negative = lower
  desc: string
}

export const BASIC_GAIN = 6
export const INTENSIVE_GAIN = 12
export const INTENSIVE_COST = 4

export const BASIC_DRILLS: Drill[] = [
  { id: 'weights', name: 'Weight Training', kind: 'basic', gains: { STR: BASIC_GAIN }, desc: 'Steady strength work.' },
  { id: 'agility', name: 'Agility Course', kind: 'basic', gains: { DEX: BASIC_GAIN }, desc: 'Footwork and reflex drills.' },
  { id: 'endurance', name: 'Endurance Run', kind: 'basic', gains: { CON: BASIC_GAIN }, desc: 'Long, steady conditioning.' },
  { id: 'meditation', name: 'Meditation', kind: 'basic', gains: { WIS: BASIC_GAIN }, desc: 'Quiet focus and breath work.' },
  { id: 'study', name: 'Study', kind: 'basic', gains: { INT: BASIC_GAIN }, desc: 'Books, runes, and theory.' },
  { id: 'stage', name: 'Stage Practice', kind: 'basic', gains: { CHA: BASIC_GAIN }, desc: 'Poise and presence.' },
]

export const INTENSIVE_DRILLS: Drill[] = [
  { id: 'powerlift', name: 'Powerlifting', kind: 'intensive', gains: { STR: INTENSIVE_GAIN, DEX: -INTENSIVE_COST }, desc: 'Raw power; bulk dulls speed.' },
  { id: 'berserker', name: 'Berserker Training', kind: 'intensive', gains: { STR: INTENSIVE_GAIN, WIS: -INTENSIVE_COST }, desc: 'Fury over composure.' },
  { id: 'sprints', name: 'Sprint Intervals', kind: 'intensive', gains: { DEX: INTENSIVE_GAIN, STR: -INTENSIVE_COST }, desc: 'Lean speed; less brawn.' },
  { id: 'acrobatics', name: 'Acrobatics', kind: 'intensive', gains: { DEX: INTENSIVE_GAIN, CON: -INTENSIVE_COST }, desc: 'Nimbleness over toughness.' },
  { id: 'toughening', name: 'Toughening Regimen', kind: 'intensive', gains: { CON: INTENSIVE_GAIN, DEX: -INTENSIVE_COST }, desc: 'Mass and grit; heavier feet.' },
  { id: 'irondiet', name: 'Iron Diet', kind: 'intensive', gains: { CON: INTENSIVE_GAIN, INT: -INTENSIVE_COST }, desc: 'Body over book.' },
  { id: 'deepmed', name: 'Deep Meditation', kind: 'intensive', gains: { WIS: INTENSIVE_GAIN, STR: -INTENSIVE_COST }, desc: 'Inner focus; softer muscle.' },
  { id: 'ascetic', name: 'Ascetic Trance', kind: 'intensive', gains: { WIS: INTENSIVE_GAIN, CHA: -INTENSIVE_COST }, desc: 'Solitude over showmanship.' },
  { id: 'arcane', name: 'Arcane Study', kind: 'intensive', gains: { INT: INTENSIVE_GAIN, CON: -INTENSIVE_COST }, desc: 'The mind sharpens; the body wanes.' },
  { id: 'runic', name: 'Runic Focus', kind: 'intensive', gains: { INT: INTENSIVE_GAIN, STR: -INTENSIVE_COST }, desc: 'Mind over might.' },
  { id: 'oratory', name: 'Oratory Drills', kind: 'intensive', gains: { CHA: INTENSIVE_GAIN, INT: -INTENSIVE_COST }, desc: 'Charm over calculation.' },
  { id: 'showmanship', name: 'Showmanship', kind: 'intensive', gains: { CHA: INTENSIVE_GAIN, CON: -INTENSIVE_COST }, desc: 'Flair over conditioning.' },
]

// Extreme drills (v0.6 economy pass, user spec): the risk tier above intensive —
// a big gain to one stat at the cost of SIX points across TWO paired stats and
// heavy stamina. Locked behind the Extreme Training Manual (Ranch Shop, 1500g).
// Net +8 but the double malus can genuinely un-learn moves / drop class
// thresholds — a deliberate gamble for rushing a stat, not a default.
export const EXTREME_GAIN = 20
export const EXTREME_COST = 6

export const EXTREME_DRILLS: Drill[] = [
  { id: 'xstr', name: 'Titan Regimen', kind: 'extreme', gains: { STR: EXTREME_GAIN, DEX: -EXTREME_COST, WIS: -EXTREME_COST }, desc: 'Brutal loads; speed and composure pay for it.' },
  { id: 'xdex', name: 'Gauntlet Sprints', kind: 'extreme', gains: { DEX: EXTREME_GAIN, STR: -EXTREME_COST, CON: -EXTREME_COST }, desc: 'Blinding speed; muscle and mass melt away.' },
  { id: 'xcon', name: 'Stone Vigil', kind: 'extreme', gains: { CON: EXTREME_GAIN, DEX: -EXTREME_COST, INT: -EXTREME_COST }, desc: 'Unmoving endurance; quickness and wits dull.' },
  { id: 'xwis', name: 'Void Fast', kind: 'extreme', gains: { WIS: EXTREME_GAIN, STR: -EXTREME_COST, CHA: -EXTREME_COST }, desc: 'Total seclusion; body and charm wither.' },
  { id: 'xint', name: 'Forbidden Texts', kind: 'extreme', gains: { INT: EXTREME_GAIN, CON: -EXTREME_COST, CHA: -EXTREME_COST }, desc: 'Dangerous knowledge; health and warmth fade.' },
  { id: 'xcha', name: 'Grand Spectacle', kind: 'extreme', gains: { CHA: EXTREME_GAIN, WIS: -EXTREME_COST, INT: -EXTREME_COST }, desc: 'All showmanship; depth and study abandoned.' },
]

export const ALL_DRILLS: Drill[] = [...BASIC_DRILLS, ...INTENSIVE_DRILLS, ...EXTREME_DRILLS]
