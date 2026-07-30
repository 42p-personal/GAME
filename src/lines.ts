// ─────────────────────────────────────────────────────────────────────────────
// ABILITY LINES (ability rework, P4) — the fix for the `chooseLoadout` trap.
//
// ⚠️ WHY THIS EXISTS. Three separate times, well-designed content was authored,
// typed, priced, and then never reached a single monster's kit, because the
// loadout picker had no notion of what a monster is FOR:
//   • control moves      — 0% equipped across 780 monsters (they are deliberately
//                          low-power, so they can never win a damage comparison)
//   • team buffs         — Arcane Aegis: 53% learnable, 0% equipped
//   • defensive moves    — Acrobatics / Mage Armour: still 0%
// Nudging scores did not fix it and twice made it worse (a status weighting put
// Rime Bind on 36% of ALL monsters across ten classes; a value-based support sort
// dropped defensive casts 6.5% -> 5.3%). The problem is not the scoring, it is
// that the picker ranks the whole pool globally instead of drawing from the
// handful of lines that express this monster's class.
//
// A LINE is a group of abilities sharing a win condition — Bloodrage spends HP,
// Venomcraft stacks poison, Warden owns ground. Three lines per stat.
//
// ⚠️ A line is a group you DRAW FROM, not a track you commit to. The player is
// never shoehorned into taking a whole line, and the class stays their choice —
// affinity only decides what the AUTO-picker reaches for first.
//
// Design reference: docs/ABILITY_REWORK.md. The full 144-ability rework is
// designed but not yet authored; this file already carries its line names so the
// two cannot drift.
// ─────────────────────────────────────────────────────────────────────────────

/** The three lines of each stat, in the order a kit should prefer them. */
export const LINES = {
  STR: ['Bloodrage', 'Duelist', 'Warcry'],
  DEX: ['Assassin', 'Venomcraft', 'Volley'],
  CON: ['Warden', 'Guardian', 'Bulwark'],
  WIS: ['Disruptor', 'Mender', 'Siphon'],
  INT: ['Hexer', 'Elementalist', 'Arcanist'],
  CHA: ['Enchanter', 'Captain', 'Demagogue'],
} as const

/**
 * Which lines each class draws from — its primary stat's lines first, then the
 * one secondary-stat line that expresses the pairing.
 *
 * ⚠️ Straight from the per-class contract in docs/ABILITY_REWORK.md, so a Tank
 * reaches for CON protection and STR shouts, and a Wizard reaches for hexes and
 * elements rather than for whatever happened to score highest across all 102.
 */
export const CLASS_LINES: Record<string, readonly string[]> = {
  Tank: ['Guardian', 'Warden', 'Warcry'],
  Warrior: ['Duelist', 'Bloodrage', 'Bulwark'],
  Rogue: ['Assassin', 'Venomcraft', 'Duelist'],
  Ranger: ['Volley', 'Assassin', 'Elementalist'],
  Sage: ['Mender', 'Siphon', 'Hexer'],
  Wizard: ['Hexer', 'Elementalist', 'Disruptor'],
  Spellsword: ['Arcanist', 'Elementalist', 'Bulwark'],
  Spellshield: ['Guardian', 'Bulwark', 'Mender'],
  Captain: ['Captain', 'Warcry', 'Duelist'],
  Orator: ['Demagogue', 'Enchanter', 'Disruptor'],
  Bard: ['Captain', 'Enchanter', 'Volley'],
}

/**
 * Name -> line for every move in the pool.
 *
 * ⚠️ Kept as a lookup rather than a `line:` field on each of the ~100 rows in
 * moves.ts on purpose: the assignment is a DESIGN statement about how the pool
 * is grouped, and it is far easier to check that grouping is right when it can
 * be read in one place. `moves.ts` attaches it when it builds ALL_MOVES, so the
 * field is still present on every Move at runtime.
 *
 * ⚠️ Every pool move must appear here — `validate.ts` asserts it, because a move
 * with no line is invisible to affinity and would silently become unpickable,
 * which is the exact failure this whole file exists to end.
 */
export const LINE_OF: Record<string, string> = {
  // ── STR ────────────────────────────────────────────────────────────────────
  Jab: 'Bloodrage', Scrap: 'Bloodrage', 'War Cry': 'Bloodrage', Enrage: 'Bloodrage',
  'Reckless Slam': 'Bloodrage', Berserk: 'Bloodrage', 'Last Stand': 'Bloodrage',
  Titanfall: 'Bloodrage', 'Blood Price': 'Bloodrage', 'Blood Fury': 'Bloodrage',
  'Power Strike': 'Duelist', Sunder: 'Duelist', Riposte: 'Duelist', Bonebreaker: 'Duelist',
  'Rending Blow': 'Duelist', Rend: 'Duelist', 'Flurry of Blows': 'Duelist',
  Bloodletter: 'Duelist', Executioner: 'Duelist', Headbutt: 'Duelist',
  Guard: 'Warcry', Cleave: 'Warcry', Intimidate: 'Warcry', Challenge: 'Warcry',
  Bracer: 'Warcry', Earthshaker: 'Warcry', Whirlwind: 'Warcry', "Warlord's Roar": 'Warcry',

  // ── DEX ────────────────────────────────────────────────────────────────────
  Shadowstep: 'Assassin', Ambush: 'Assassin', Vanish: 'Assassin', Hamstring: 'Assassin',
  'Throat Cut': 'Assassin', Heartseeker: 'Assassin', 'Shadow Barrage': 'Assassin',
  'Fleetfoot Riposte': 'Assassin', 'Smoke Bomb': 'Assassin',
  'Piercing Shot': 'Venomcraft', 'Toxin Stack': 'Venomcraft', 'Twin Fangs': 'Venomcraft',
  'Paralytic Dart': 'Venomcraft', Virulence: 'Venomcraft', 'Plague Shot': 'Venomcraft',
  'Marked for the Pack': 'Venomcraft',
  Sling: 'Volley', Sidestep: 'Volley', Acrobatics: 'Volley', 'Focus Aim': 'Volley',
  'Pin Down': 'Volley', "Gambler's Volley": 'Volley', 'Rain of Arrows': 'Volley',
  Deadeye: 'Volley', Blur: 'Volley', Snipe: 'Volley', 'Needle Storm': 'Volley',
  Ricochet: 'Volley', 'Pinning Volley': 'Volley',

  // ── CON ────────────────────────────────────────────────────────────────────
  Seize: 'Warden', 'Shield Wall': 'Warden', 'Quagmire Stomp': 'Warden', Barricade: 'Warden',
  'Zone of Control': 'Warden', 'Earthen Grasp': 'Warden', 'Body Slam': 'Warden',
  Tremor: 'Warden', 'Crushing Grip': 'Warden',
  // ⚠️ Barbed Carapace lives in GUARDIAN, not Bulwark: it is a TEAM protective
  // buff and the other half of the flagship mass-taunt+thorns combo. Filing it
  // under Bulwark (self-shields) split that designed pair across two lines and
  // measurably cost the Tank its thorns — 5% equipped down to 1%.
  Taunt: 'Guardian', 'Steady Vigil': 'Guardian', Interpose: 'Guardian',
  'Barbed Carapace': 'Guardian',
  "Bulwark's Challenge": 'Guardian', 'Aegis of the Fallen': 'Guardian',
  Brace: 'Bulwark', Bastion: 'Bulwark', 'Shell Slam': 'Bulwark',
  Fortify: 'Bulwark', Retaliate: 'Bulwark', 'Colossus Crash': 'Bulwark', 'Vital Surge': 'Bulwark',
  'Second Wind': 'Bulwark', Purge: 'Bulwark', 'Stone Wall': 'Bulwark', Undying: 'Bulwark',
  Overrun: 'Bulwark',

  // ── WIS ────────────────────────────────────────────────────────────────────
  'Silencing Spike': 'Disruptor', 'Null Field': 'Disruptor', Foresight: 'Disruptor',
  'Field of Doom': 'Disruptor', 'Dread Whisper': 'Disruptor', 'Mind Crush': 'Disruptor',
  Insight: 'Disruptor', Enfeeble: 'Disruptor', Wither: 'Disruptor', Hush: 'Disruptor',
  Mend: 'Mender', Clarity: 'Mender', Renewal: 'Mender', Tranquility: 'Mender',
  'Ward Against Ruin': 'Mender', 'Mage Armour': 'Mender', Rebuke: 'Mender',
  'Mana Sap': 'Siphon', Serenity: 'Siphon', Attunement: 'Siphon', 'Drain Spirit': 'Siphon',
  'Spirit Siphon': 'Siphon', Providence: 'Siphon', Focus: 'Siphon', Ascendance: 'Siphon',
  'Mind Spike': 'Siphon', Judgement: 'Siphon',

  // ── INT ────────────────────────────────────────────────────────────────────
  Ember: 'Hexer', 'Fracturing Stones': 'Hexer', Cinderburst: 'Hexer', 'Arcane Bomb': 'Hexer',
  'Curse of Ruin': 'Hexer', Detonate: 'Hexer', 'Sap Will': 'Hexer',
  'Frost Shard': 'Elementalist', 'Rime Bind': 'Elementalist', 'Frost Nova': 'Elementalist',
  Firewall: 'Elementalist', Inferno: 'Elementalist', 'Seismic Crush': 'Elementalist',
  'World Ender': 'Elementalist', Thunderclap: 'Elementalist', 'Glacial Prison': 'Elementalist',
  'Deep Freeze': 'Elementalist',
  Spark: 'Arcanist', Blink: 'Arcanist', 'Mirror Image': 'Arcanist', 'Static Chain': 'Arcanist',
  'Mana Leech': 'Arcanist', Displace: 'Arcanist', 'Void Lance': 'Arcanist',
  'Arcane Overload': 'Arcanist', 'Arcane Aegis': 'Arcanist', 'Stone Spear': 'Arcanist',
  'Elemental Infusion': 'Arcanist', Unmake: 'Arcanist', Polymorph: 'Arcanist',

  // ── CHA ────────────────────────────────────────────────────────────────────
  Discord: 'Enchanter', Screech: 'Enchanter', 'Sonic Boom': 'Enchanter', Lullaby: 'Enchanter',
  Cacophony: 'Enchanter', 'Mass Hysteria': 'Enchanter',
  'Rallying Song': 'Captain', Bravura: 'Captain', 'Battle Hymn': 'Captain', Rally: 'Captain',
  'Hymn of Shields': 'Captain', 'Standing Ovation': 'Captain', 'Anthem of Iron': 'Captain',
  Inspire: 'Captain', Fanfare: 'Captain', Triumph: 'Captain',
  'Grand Mockery': 'Demagogue', Captivate: 'Demagogue', Demoralize: 'Demagogue',
  'Crowd Surge': 'Demagogue', Dirge: 'Demagogue', "Siren's Call": 'Demagogue',
  Crescendo: 'Demagogue', 'Taunt Cry': 'Demagogue', Showstopper: 'Demagogue',
}

/** Does this line express what the class is for? */
export const lineFitsClass = (line: string | undefined, className: string): boolean =>
  !!line && (CLASS_LINES[className]?.includes(line) ?? false)
