// The 45 species (§8.2 / §8.3): stats, lifespans, innate abilities, ultimates.
// 30 base (6 body types × 5) + 15 exclusive (Draconic/Abyssal/Mythical).
import { BodyType, STATS, Stat, Stats, Species } from './core'

const s = (STR: number, DEX: number, CON: number, WIS: number, INT: number, CHA: number) => ({ STR, DEX, CON, WIS, INT, CHA })

export const SPECIES: Species[] = [
  // --- Mammal (STR / CON) ---
  { id: 'bouldram', name: 'Bouldram', body: 'Mammal', naturalClass: 'Warrior', base: s(42, 20, 34, 12, 10, 16), lifespan: 4, flavour: 'Bighorn ram, charging bruiser.',
    innate: [{ name: 'Charge', desc: 'Bonus damage on first melee hit.' }, { name: 'Momentum', desc: 'Melee grows as it advances.' }], ultimate: { name: 'Avalanche Charge', desc: 'Massive unavoidable melee rush that stuns.' } },
  { id: 'aegisox', name: 'Aegisox', body: 'Mammal', naturalClass: 'Tank', base: s(30, 14, 44, 16, 10, 14), lifespan: 6, flavour: 'Armoured ox, immovable wall.',
    innate: [{ name: 'Ironclad', desc: 'Reduces incoming melee damage.' }, { name: 'Immovable', desc: 'Resists knockback/displacement.' }], ultimate: { name: 'Aegis Fortress', desc: 'Near-immune for a few ticks; taunts all enemies.' } },
  { id: 'maneleo', name: 'Maneleo', body: 'Mammal', naturalClass: 'Captain', base: s(40, 22, 26, 12, 12, 30), lifespan: 4, flavour: 'Lion pride-leader, inspiring.',
    innate: [{ name: 'Rallying Roar', desc: 'Team attack/morale buff.' }, { name: 'Pride', desc: 'Stronger while allies stand.' }], ultimate: { name: "Pride's Roar", desc: 'Huge team-wide attack + morale surge.' } },
  { id: 'grivvel', name: 'Grivvel', body: 'Mammal', naturalClass: 'Rogue', base: s(34, 40, 22, 12, 10, 14), lifespan: 4, flavour: 'Wolverine brawler.',
    innate: [{ name: 'Rend', desc: 'Attacks cause bleed (DoT).' }, { name: 'Frenzy', desc: 'Attack speed up at low HP.' }], ultimate: { name: 'Blood Frenzy', desc: 'Attack speed & lifesteal spike until battle ends.' } },
  { id: 'ursath', name: 'Ursath', body: 'Mammal', naturalClass: 'Warrior', base: s(40, 14, 38, 14, 10, 12), lifespan: 5, flavour: 'Great bear, slow but immensely sturdy.',
    innate: [{ name: 'Thick Hide', desc: 'Flat damage reduction.' }, { name: 'Maul', desc: 'Heavy melee crits.' }], ultimate: { name: "Titan's Maul", desc: 'Colossal melee blow that ignores defence.' } },

  // --- Avian (DEX / WIS) ---
  { id: 'skyrend', name: 'Skyrend', body: 'Avian', naturalClass: 'Ranger', base: s(20, 44, 18, 24, 28, 12), lifespan: 4, flavour: 'Raptor, diving ranged striker.',
    innate: [{ name: 'Dive Bomb', desc: 'High-damage opening ranged strike.' }, { name: 'Keen Eye', desc: 'Ignores some dodge.' }], ultimate: { name: 'Death from Above', desc: 'Execute-style dive on the lowest-HP enemy.' } },
  { id: 'strixil', name: 'Strixil', body: 'Avian', naturalClass: 'Sage', base: s(10, 22, 16, 42, 32, 14), lifespan: 5, flavour: 'Owl, quiet mana engine.',
    innate: [{ name: 'Wellspring', desc: 'Boosts team mana regen.' }, { name: 'Silent Wisdom', desc: 'Passive mana over time.' }], ultimate: { name: 'Eclipse', desc: 'Silences enemy casters + floods team mana.' } },
  { id: 'zephyri', name: 'Zephyri', body: 'Avian', naturalClass: 'Rogue', base: s(28, 44, 18, 20, 16, 14), lifespan: 4, flavour: 'Swift, evasive skirmisher.',
    innate: [{ name: 'Evasion', desc: 'High dodge.' }, { name: 'Flurry', desc: 'Multiple fast strikes.' }], ultimate: { name: 'Thousand Cuts', desc: 'Flurry of unavoidable rapid strikes.' } },
  { id: 'corvaan', name: 'Corvaan', body: 'Avian', naturalClass: 'Wizard', base: s(12, 26, 16, 30, 40, 16), lifespan: 4, flavour: 'Sorcerous raven, arcane.',
    innate: [{ name: 'Arcane Bolt', desc: 'Elemental nuke.' }, { name: 'Hex', desc: 'Lowers enemy accuracy/mana.' }], ultimate: { name: 'Doomcaw', desc: 'Heavy elemental burst + curse on target.' } },
  { id: 'larkessa', name: 'Larkessa', body: 'Avian', naturalClass: 'Bard', base: s(12, 34, 14, 22, 16, 42), lifespan: 4, flavour: 'Songlark, voice performer.',
    innate: [{ name: 'Song of Valor', desc: 'Voice AoE that buffs allies.' }, { name: 'Encore', desc: 'Repeats last ally buff.' }], ultimate: { name: 'Anthem of Glory', desc: 'Team-wide buff to all channels for the rest of the fight.' } },

  // --- Marsupial (CHA / DEX) ---
  { id: 'bruxaroo', name: 'Bruxaroo', body: 'Marsupial', naturalClass: 'Captain', base: s(40, 28, 26, 12, 10, 34), lifespan: 4, flavour: 'Boxing kangaroo, charismatic.',
    innate: [{ name: 'Haymaker', desc: 'Big melee blow, stun chance.' }, { name: 'Southpaw', desc: 'Counter on dodge.' }], ultimate: { name: 'Knockout Combo', desc: 'Multi-hit melee, guaranteed stun finisher.' } },
  { id: 'koalio', name: 'Koalio', body: 'Marsupial', naturalClass: 'Orator', base: s(12, 20, 18, 30, 14, 44), lifespan: 5, flavour: 'Crooning koala, commanding voice.',
    innate: [{ name: 'Drowsy Aura', desc: 'Nearby foes grow sleepy (slow).' }, { name: 'Soothing Words', desc: 'Steadies/heals allies.' }], ultimate: { name: 'Dreamsong', desc: 'Puts multiple enemies to sleep.' } },
  { id: 'quokkade', name: 'Quokkade', body: 'Marsupial', naturalClass: 'Bard', base: s(12, 36, 14, 22, 14, 40), lifespan: 4, flavour: 'Beaming quokka, nimble performer.',
    innate: [{ name: 'Cheer', desc: 'Team dodge/crit buff.' }, { name: 'Quickstep', desc: 'Evasive.' }], ultimate: { name: 'Festival', desc: 'Big team dodge/crit/heal party buff.' } },
  { id: 'sylvaglide', name: 'Sylvaglide', body: 'Marsupial', naturalClass: 'Ranger', base: s(12, 42, 12, 24, 28, 26), lifespan: 4, flavour: 'Sugar glider, gliding ranged.',
    innate: [{ name: 'Glide Strike', desc: 'Ranged hit-and-retreat.' }, { name: 'Aerial', desc: 'Briefly untargetable.' }], ultimate: { name: 'Skydance', desc: 'Untargetable while raining ranged hits.' } },
  { id: 'tazzik', name: 'Tazzik', body: 'Marsupial', naturalClass: 'Rogue', base: s(34, 40, 24, 12, 12, 20), lifespan: 4, flavour: 'Tasmanian devil, ferocious.',
    innate: [{ name: 'Devour', desc: 'Lifesteal on melee.' }, { name: 'Whirlwind', desc: 'Spinning AoE melee.' }], ultimate: { name: 'Tasmanian Fury', desc: 'Spinning AoE lifesteal storm.' } },

  // --- Aquatic (WIS / INT) ---
  { id: 'maelurk', name: 'Maelurk', body: 'Aquatic', naturalClass: 'Wizard', base: s(12, 22, 18, 32, 44, 14), lifespan: 4, flavour: 'Octopus mage, elemental burst.',
    innate: [{ name: 'Ink Cloud', desc: 'Lowers enemy accuracy.' }, { name: 'Tentacle Barrage', desc: 'Multi-hit elemental.' }], ultimate: { name: 'Abyssal Grasp', desc: 'Ensnares & drains multiple enemies (mana + HP).' } },
  { id: 'nautilux', name: 'Nautilux', body: 'Aquatic', naturalClass: 'Spellshield', base: s(14, 12, 42, 32, 20, 12), lifespan: 5, flavour: 'Nautilus, defensive warder.',
    innate: [{ name: 'Ward', desc: 'Team absorb shield.' }, { name: 'Spiral Shell', desc: 'Reflects part of magic damage.' }], ultimate: { name: 'Pearl Barrier', desc: 'Massive team shield + magic reflect.' } },
  { id: 'serapelle', name: 'Serapelle', body: 'Aquatic', naturalClass: 'Sage', base: s(12, 16, 24, 44, 30, 14), lifespan: 6, flavour: 'Sea-turtle sage, deep mana.',
    innate: [{ name: 'Tidal Wisdom', desc: 'Team mana + heal over time.' }, { name: 'Ancient Carapace', desc: 'High defence.' }], ultimate: { name: 'Ancient Tide', desc: 'Full team heal + mana surge over time.' } },
  { id: 'voltaray', name: 'Voltaray', body: 'Aquatic', naturalClass: 'Ranger', base: s(14, 42, 18, 22, 32, 12), lifespan: 4, flavour: 'Electric ray, shock skirmisher.',
    innate: [{ name: 'Live Wire', desc: 'Ranged hit with a stun chance.' }, { name: 'Static Field', desc: 'Chips enemy mana.' }], ultimate: { name: 'Thunderstorm', desc: 'Chain-lightning stun across enemies.' } },
  { id: 'corallux', name: 'Corallux', body: 'Aquatic', naturalClass: 'Spellsword', base: s(20, 14, 36, 24, 40, 12), lifespan: 5, flavour: 'Coral crustacean, mage-bruiser.',
    innate: [{ name: 'Spellblade', desc: 'Melee hits add elemental damage.' }, { name: 'Coral Guard', desc: 'Defence while casting.' }], ultimate: { name: 'Reef Blade', desc: 'Empowers melee with elemental burst + self-fortify.' } },

  // --- Insectoid (⛰️ resist / 💧 weak) — chitinous, tireless; covers WIS/DEX training weaknesses ---
  { id: 'scarabrute', name: 'Scarabrute', body: 'Insectoid', naturalClass: 'Tank', base: s(36, 16, 44, 8, 14, 12), lifespan: 5, flavour: 'Colossal beetle, living rampart.',
    innate: [{ name: 'Chitin Plate', desc: 'Flat damage reduction.' }, { name: 'Burrow', desc: 'Slips underground to avoid hits.' }], ultimate: { name: 'Fortress Carapace', desc: 'Near-impervious shell; taunts all enemies.' } },
  { id: 'mantevoke', name: 'Mantevoke', body: 'Insectoid', naturalClass: 'Rogue', base: s(34, 42, 18, 8, 20, 12), lifespan: 4, flavour: 'Mantis duellist, patient killer.',
    innate: [{ name: 'Ambush', desc: 'Devastating opening strike.' }, { name: 'Serrated Claws', desc: 'Attacks shred and linger.' }], ultimate: { name: 'Scything Execution', desc: 'A single perfect cut; massive crit.' } },
  { id: 'arachnyx', name: 'Arachnyx', body: 'Insectoid', naturalClass: 'Wizard', base: s(14, 8, 16, 32, 40, 20), lifespan: 4, flavour: 'Web-weaver mage, never leaves its lair.',
    innate: [{ name: 'Web Trap', desc: 'Hard to reach; foes arrive slowed.' }, { name: 'Venom Fang', desc: 'Magic laced with toxin.' }], ultimate: { name: 'Silken Cataclysm', desc: 'Binds all enemies in webs; heavy poison burst.' } },
  { id: 'vespera', name: 'Vespera', body: 'Insectoid', naturalClass: 'Orator', base: s(12, 8, 26, 34, 18, 44), lifespan: 5, flavour: 'Wasp queen, voice of the hive.',
    innate: [{ name: 'Hive Command', desc: 'The swarm amplifies her strikes.' }, { name: 'Royal Jelly', desc: 'Restorative aura.' }], ultimate: { name: 'Swarm Decree', desc: 'Summons the hive; overwhelming AoE.' } },
  { id: 'odonatra', name: 'Odonatra', body: 'Insectoid', naturalClass: 'Ranger', base: s(14, 44, 16, 22, 30, 8), lifespan: 4, flavour: 'Dragonfly skirmisher, four-winged blur.',
    innate: [{ name: 'Skim Dart', desc: 'Opening dive at full speed.' }, { name: 'Compound Eyes', desc: 'Sees every gap in a guard.' }], ultimate: { name: 'Thousand-Lens Volley', desc: 'Unerring ranged barrage; cannot miss.' } },

  // --- Reptilian (🔥 resist / 💨 weak) — slow, patient, cold-blooded; covers DEX/WIS training weaknesses ---
  { id: 'crocmaw', name: 'Crocmaw', body: 'Reptilian', naturalClass: 'Warrior', base: s(44, 10, 38, 20, 12, 14), lifespan: 6, flavour: 'River crocodile, ambush juggernaut.',
    innate: [{ name: 'Death Roll', desc: 'Grapples crush and tear.' }, { name: 'Armored Scales', desc: 'Flat damage reduction.' }], ultimate: { name: 'Jawbreaker Vice', desc: 'Clamps one enemy; colossal damage + stun.' } },
  { id: 'iguanor', name: 'Iguanor', body: 'Reptilian', naturalClass: 'Captain', base: s(42, 10, 26, 14, 12, 34), lifespan: 4, flavour: 'Crested iguana warlord.',
    innate: [{ name: 'Sun Basking', desc: 'Recovers strength between blows.' }, { name: 'Crest Display', desc: 'Intimidating presence empowers attacks.' }], ultimate: { name: 'Banner of Scales', desc: 'Rallying display; team-wide attack surge.' } },
  { id: 'serpwyn', name: 'Serpwyn', body: 'Reptilian', naturalClass: 'Sage', base: s(16, 22, 14, 42, 30, 8), lifespan: 5, flavour: 'Hooded cobra oracle, unblinking.',
    innate: [{ name: 'Cold Blood', desc: 'Unshaken; reduces incoming damage.' }, { name: 'Hypnotic Gaze', desc: 'Strikes land where the eyes lead.' }], ultimate: { name: "Serpent's Prophecy", desc: 'Foresees the fight; team dodges + mana surge.' } },
  { id: 'geckari', name: 'Geckari', body: 'Reptilian', naturalClass: 'Rogue', base: s(30, 40, 18, 8, 16, 20), lifespan: 4, flavour: 'Gecko wall-runner, impossible angles.',
    innate: [{ name: 'Wall Runner', desc: 'Attacks from surfaces others cannot reach.' }, { name: 'Tail Drop', desc: 'Sheds its tail to escape a killing blow.' }], ultimate: { name: 'Ceiling Ambush', desc: 'Untouchable repositioning; guaranteed backstab.' } },
  { id: 'tortavos', name: 'Tortavos', body: 'Reptilian', naturalClass: 'Spellshield', base: s(8, 12, 44, 36, 22, 14), lifespan: 6, flavour: 'Ancient tortoise mystic, unhurried.',
    innate: [{ name: 'Shell Ward', desc: 'Flat damage reduction.' }, { name: 'Inner Calm', desc: 'Deep reserves of mana.' }], ultimate: { name: 'Aeon Shell', desc: 'Time slows around the shell; massive team barrier.' } },

  // --- Draconic (STR / WIS, weakness CHA) — Silver rank exclusive ---
  { id: 'pyraxon', name: 'Pyraxon', body: 'Draconic', naturalClass: 'Warrior', base: s(28, 18, 24, 20, 16, 8), lifespan: 5, flavour: 'Fire-breathing drake, ancient fury.',
    innate: [{ name: 'Flame Aura', desc: 'Nearby foes burn (DoT).' }, { name: 'Draconic Pride', desc: 'Stronger when alone.' }], ultimate: { name: 'Inferno Cataclysm', desc: 'Massive fire AoE that ignores shields.' } },
  { id: 'frostwyren', name: 'Frostwyren', body: 'Draconic', naturalClass: 'Wizard', base: s(20, 20, 14, 24, 36, 6), lifespan: 5, flavour: 'Icy wyvern, patient mage.',
    innate: [{ name: 'Blizzard', desc: 'Spells leave frozen ground.' }, { name: 'Glacial Wisdom', desc: 'Mana efficiency boost.' }], ultimate: { name: 'Absolute Zero', desc: 'Freezes all enemies; stun if already frozen.' } },
  { id: 'stormlerath', name: 'Stormlerath', body: 'Draconic', naturalClass: 'Ranger', base: s(24, 30, 18, 20, 28, 6), lifespan: 4, flavour: 'Lightning-winged serpent, swift strike.',
    innate: [{ name: 'Overload', desc: 'High-damage ranged crits.' }, { name: 'Dodge Storm', desc: 'Evasion under pressure.' }], ultimate: { name: 'Maelstrom Lance', desc: 'Ranged barrage that chains on hits.' } },
  { id: 'verdantdrake', name: 'Verdantdrake', body: 'Draconic', naturalClass: 'Sage', base: s(18, 18, 20, 36, 28, 8), lifespan: 6, flavour: 'Emerald dragon, nature\'s guardian.',
    innate: [{ name: 'Life Bloom', desc: 'Passive team heal over time.' }, { name: 'Root Grasp', desc: 'Immobilize enemies briefly.' }], ultimate: { name: 'Vitality Surge', desc: 'Massive team heal + grow in power.' } },
  { id: 'voidmaw', name: 'Voidmaw', body: 'Draconic', naturalClass: 'Wizard', base: s(20, 24, 18, 28, 32, 6), lifespan: 4, flavour: 'Void-touched dragon, cosmic terror.',
    innate: [{ name: 'Void Pulse', desc: 'Ranged magic ignores defense.' }, { name: 'Entropy', desc: 'Debuffs enemy stats.' }], ultimate: { name: 'Annihilation', desc: 'Pure void damage; scales with enemy weaknesses.' } },

  // --- Abyssal (INT / DEX, weakness CON) — Silver rank exclusive ---
  { id: 'tenebrae', name: 'Tenebrae', body: 'Abyssal', naturalClass: 'Rogue', base: s(28, 34, 12, 20, 24, 10), lifespan: 4, flavour: 'Shadow squid, sneaky assassin.',
    innate: [{ name: 'Cloak of Shadow', desc: 'Evasion burst + damage while hidden.' }, { name: 'Silent Strike', desc: 'Guaranteed crit from stealth.' }], ultimate: { name: 'Venom Fangs', desc: 'Stealth + poison burst combo.' } },
  { id: 'abyssomancer', name: 'Abyssomancer', body: 'Abyssal', naturalClass: 'Wizard', base: s(14, 28, 10, 32, 40, 12), lifespan: 5, flavour: 'Deep-sea sorceress, eldritch power.',
    innate: [{ name: 'Rift Magic', desc: 'Spells tear holes in space.' }, { name: 'Mana Theft', desc: 'Drain enemy mana on cast.' }], ultimate: { name: 'Abyssal Convergence', desc: 'Summons void rifts; massive damage + mana drain.' } },
  { id: 'lurkerss', name: 'Lurkerss', body: 'Abyssal', naturalClass: 'Sage', base: s(12, 30, 14, 36, 32, 14), lifespan: 5, flavour: 'Luminescent serpent, deep thinker.',
    innate: [{ name: 'Psychic Aura', desc: 'Team dodge + crit buff.' }, { name: 'Ancient Knowing', desc: 'Predict enemy actions.' }], ultimate: { name: 'Mind Flay', desc: 'Paralyze multiple enemies; drain their knowledge.' } },
  { id: 'chrono-leviathan', name: 'Chrono-Leviathan', body: 'Abyssal', naturalClass: 'Sage', base: s(14, 28, 10, 36, 34, 8), lifespan: 6, flavour: 'Time-warped colossus, ageless predator.',
    innate: [{ name: 'Temporal Distortion', desc: 'Slow enemies, haste allies.' }, { name: 'Age Reversal', desc: 'Heal by aging enemies.' }], ultimate: { name: 'Time\'s Grasp', desc: 'Stop all enemies for several ticks.' } },
  { id: 'cephalumbra', name: 'Cephalumbra', body: 'Abyssal', naturalClass: 'Rogue', base: s(28, 40, 10, 18, 24, 10), lifespan: 4, flavour: 'Phantom tentacles, ghost-swift.',
    innate: [{ name: 'Phase Shift', desc: 'Become untargetable briefly.' }, { name: 'Whip Strike', desc: 'Ranged multi-hit.' }], ultimate: { name: 'Phantom Assault', desc: 'Untargetable flurry; each hit paralyzes.' } },

  // --- Mythical (5 unique archetypes) — Masters rank exclusive ---
  { id: 'titanrex', name: 'Titanrex', body: 'Mythical', naturalClass: 'Warrior', base: s(48, 14, 38, 10, 10, 6), lifespan: 7, flavour: 'Primal tyrant lizard, raw power.',
    innate: [{ name: 'Prehistoric Roar', desc: 'Debilitate all foes.' }, { name: 'Unstoppable', desc: 'Cannot be displaced.' }], ultimate: { name: 'Meteor Stomp', desc: 'AoE devastation; world-shaking force.' } },
  { id: 'stellarion', name: 'Stellarion', body: 'Mythical', naturalClass: 'Ranger', base: s(10, 46, 8, 28, 40, 12), lifespan: 5, flavour: 'Star-born hunter, celestial archer.',
    innate: [{ name: 'Stellar Shot', desc: 'Ranged hits pierce armor.' }, { name: 'Cosmic Precision', desc: 'Always hits.' }], ultimate: { name: 'Supernova Barrage', desc: 'Ranged salvo; each shot ignores defense.' } },
  { id: 'wisdomkeeper', name: 'Wisdomkeeper', body: 'Mythical', naturalClass: 'Sage', base: s(10, 16, 18, 50, 42, 10), lifespan: 7, flavour: 'Ancient oracle, all-seeing guide.',
    innate: [{ name: 'Foresight', desc: 'Team dodge + magic resist.' }, { name: 'Truth\'s Word', desc: 'Dispel all buffs/debuffs at will.' }], ultimate: { name: 'Revelation', desc: 'See all enemy stats; team gains massive wisdom buff.' } },
  { id: 'archmage-aleph', name: 'Archmage-Aleph', body: 'Mythical', naturalClass: 'Wizard', base: s(6, 18, 12, 36, 52, 20), lifespan: 5, flavour: 'First of mages, spell incarnate.',
    innate: [{ name: 'Spell Echo', desc: 'Magic casts twice with half cost.' }, { name: 'Arcane Mastery', desc: 'Spellcasting is near-costless.' }], ultimate: { name: 'Spell Tsunami', desc: 'Cast all learned spells simultaneously.' } },
  { id: 'harmonybringer', name: 'Harmonybringer', body: 'Mythical', naturalClass: 'Bard', base: s(8, 36, 26, 14, 10, 52), lifespan: 6, flavour: 'Mythical unifier, peace in chaos.',
    innate: [{ name: 'Unison', desc: 'Team stat sync + buff sharing.' }, { name: 'Aegis Bond', desc: 'Redirect damage to self, heal difference.' }], ultimate: { name: 'Perfect Harmony', desc: 'All allies gain all buffs; team cannot be divided.' } },
]

// --- Body-type average stat profiles (§8.4) ---
// Computed from the species data above so they can never drift from it. Every
// species deviates from its body average — that deviation is its "signature".
export const BODY_AVERAGES: Record<BodyType, Stats> = (() => {
  const out = {} as Record<BodyType, Stats>
  const bodies = [...new Set(SPECIES.map((sp) => sp.body))]
  for (const body of bodies) {
    const members = SPECIES.filter((sp) => sp.body === body)
    const avg = {} as Stats
    for (const k of STATS) avg[k] = Math.round(members.reduce((sum, sp) => sum + sp.base[k], 0) / members.length)
    out[body] = avg
  }
  return out
})()

// A species' stat signature: which stats sit notably above / below its body-type
// average. Returns up to two of each (deviation ≥ 4 counts as notable).
export function bodySignature(base: Stats, body: BodyType): { above: Stat[]; below: Stat[] } {
  const avg = BODY_AVERAGES[body]
  const deltas = STATS.map((st) => ({ st, d: base[st] - avg[st] }))
  const above = deltas.filter((x) => x.d >= 4).sort((a, b) => b.d - a.d).slice(0, 2).map((x) => x.st)
  const below = deltas.filter((x) => x.d <= -4).sort((a, b) => a.d - b.d).slice(0, 2).map((x) => x.st)
  return { above, below }
}

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((sp) => [sp.id, sp]))
