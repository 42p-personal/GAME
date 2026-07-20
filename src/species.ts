// The 45 species (§8.2 / §8.3): stats, lifespans, innate abilities.
// 30 base (6 body types × 5) + 15 exclusive (Draconic/Abyssal/Mythical).
import { BodyType, STATS, Stat, Stats, Species } from './core'

const s = (STR: number, DEX: number, CON: number, WIS: number, INT: number, CHA: number) => ({ STR, DEX, CON, WIS, INT, CHA })

export const SPECIES: Species[] = [
  // --- Mammal (STR / CON) ---
  { id: 'kongrath', name: 'Kongrath', body: 'Mammal', naturalClass: 'Warrior', base: s(42, 20, 34, 12, 10, 16), lifespan: 4, flavour: 'Silverback gorilla, quiet protector of its troupe.',
    trainingProfile: {},
    innate: [{ name: 'Chest Beat', desc: '+50% damage on its first hit.' }, { name: 'Rising Fury', desc: '+5% damage.' }] },
  { id: 'aegisox', name: 'Aegisox', body: 'Mammal', naturalClass: 'Tank', base: s(30, 14, 44, 16, 10, 14), lifespan: 6, flavour: 'Armoured ox, immovable and steady.',
    trainingProfile: { major: 'CON', flaw: 'DEX' },
    innate: [{ name: 'Ironclad', desc: 'Reduces damage taken by 2 per hit.' }, { name: 'Immovable', desc: 'Incoming debuffs are 25% weaker.' }] },
  { id: 'maneleo', name: 'Maneleo', body: 'Mammal', naturalClass: 'Captain', base: s(40, 22, 26, 12, 12, 30), lifespan: 4, flavour: 'Lion pride-leader, inspiring.',
    trainingProfile: { major: 'CHA', flaw: 'CON' },
    innate: [{ name: 'Rallying Roar', desc: 'Team: +5% damage.' }, { name: 'Pride', desc: '+8% damage.' }] },
  { id: 'grivvel', name: 'Grivvel', body: 'Mammal', naturalClass: 'Rogue', base: s(34, 40, 22, 12, 10, 14), lifespan: 4, flavour: 'Wolverine, relentless and short-tempered.',
    trainingProfile: { major: 'DEX', flaw: 'CHA' },
    innate: [{ name: 'Rend', desc: '+8% critical hit chance.' }, { name: 'Frenzy', desc: '+25% damage while below 30% HP.' }] },
  { id: 'ursath', name: 'Ursath', body: 'Mammal', naturalClass: 'Warrior', base: s(40, 14, 38, 14, 10, 12), lifespan: 5, flavour: 'Great bear, slow but immensely sturdy.',
    trainingProfile: { major: 'WIS', flaw: 'INT' },
    innate: [{ name: 'Thick Hide', desc: 'Reduces damage taken by 3 per hit.' }, { name: 'Maul', desc: 'Ignores 15% of enemy mitigation.' }] },

  // --- Avian (DEX / WIS) ---
  { id: 'pinguox', name: 'Pinguox', body: 'Avian', naturalClass: 'Ranger', base: s(20, 44, 18, 24, 28, 12), lifespan: 4, flavour: 'Armoured penguin, torpedo-built for the deep dive.',
    // No flaw (user spec 2026-07-24): DEX is already this species' highest base
    // stat, so a DEX flaw would fight its own class identity — major only.
    trainingProfile: { major: 'CON' },
    innate: [{ name: 'Dive Bomb', desc: '+60% damage on its first hit.' }, { name: 'Keen Eye', desc: '+8% accuracy.' }] },
  { id: 'strixil', name: 'Strixil', body: 'Avian', naturalClass: 'Sage', base: s(10, 22, 16, 42, 32, 14), lifespan: 5, flavour: 'Owl, watchful and unnervingly still.',
    trainingProfile: { major: 'INT', flaw: 'STR' },
    innate: [{ name: 'Wellspring', desc: '10% chance to cast a skill twice.' }, { name: 'Silent Wisdom', desc: '+4 mana regen/turn.' }] },
  { id: 'balaenix', name: 'Balaenix', body: 'Avian', naturalClass: 'Rogue', base: s(28, 44, 18, 20, 16, 14), lifespan: 4, flavour: 'Shoebill stork, motionless until it strikes.',
    trainingProfile: { major: 'STR', flaw: 'CHA' },
    innate: [{ name: 'Ambush Strike', desc: '+40% damage on its first hit. +4% accuracy.' }, { name: 'Statue Stance', desc: '+10% damage while above 70% HP.' }] },
  { id: 'corvaan', name: 'Corvaan', body: 'Avian', naturalClass: 'Wizard', base: s(12, 26, 16, 30, 40, 16), lifespan: 4, flavour: 'Raven, sharp-eyed and light-fingered.',
    trainingProfile: {},
    innate: [{ name: 'Arcane Bolt', desc: '+10% elemental damage.' }, { name: 'Hex', desc: 'Enemies: -4% accuracy. Enemies: -1 mana regen/turn.' }] },
  { id: 'larkessa', name: 'Larkessa', body: 'Avian', naturalClass: 'Bard', base: s(12, 34, 14, 22, 16, 42), lifespan: 4, flavour: 'Songlark, voice carries for miles.',
    trainingProfile: { major: 'CHA', flaw: 'INT' },
    innate: [{ name: 'Song of Valor', desc: 'Team: +4% damage.' }, { name: 'Encore', desc: '25% chance its buffs last an extra round.' }] },

  // --- Marsupial (CHA / DEX) ---
  { id: 'bruxaroo', name: 'Bruxaroo', body: 'Marsupial', naturalClass: 'Captain', base: s(40, 28, 26, 12, 10, 34), lifespan: 4, flavour: 'Boxing kangaroo, charismatic.',
    trainingProfile: { major: 'STR', flaw: 'INT' },
    innate: [{ name: 'Haymaker', desc: '+35% damage on its first hit.' }, { name: 'Southpaw', desc: 'Ignores 12% of enemy mitigation.' }] },
  { id: 'koalio', name: 'Koalio', body: 'Marsupial', naturalClass: 'Orator', base: s(12, 20, 18, 30, 14, 44), lifespan: 5, flavour: 'Crooning koala, a deep and carrying voice.',
    trainingProfile: { major: 'CON', flaw: 'STR' },
    innate: [{ name: 'Drowsy Aura', desc: 'Enemies: -3% accuracy.' }, { name: 'Soothing Words', desc: 'Team: +3 HP regen/turn.' }] },
  { id: 'quokkade', name: 'Quokkade', body: 'Marsupial', naturalClass: 'Bard', base: s(12, 36, 14, 22, 14, 40), lifespan: 4, flavour: 'Beaming quokka, endlessly cheerful.',
    trainingProfile: {},
    innate: [{ name: 'Cheer', desc: 'Team: +4% dodge chance.' }, { name: 'Quickstep', desc: '+6% dodge chance.' }] },
  { id: 'sylvaglide', name: 'Sylvaglide', body: 'Marsupial', naturalClass: 'Ranger', base: s(12, 42, 12, 24, 28, 26), lifespan: 4, flavour: 'Sugar glider, gliding between the treetops.',
    // No flaw (user spec 2026-07-24): same reasoning as Pinguox — DEX is
    // already its highest base stat, so no DEX flaw is authored.
    trainingProfile: { major: 'WIS' },
    innate: [{ name: 'Glide Strike', desc: '+30% damage on its first hit.' }, { name: 'Aerial', desc: '+7% dodge chance.' }] },
  { id: 'tazzik', name: 'Tazzik', body: 'Marsupial', naturalClass: 'Rogue', base: s(34, 40, 24, 12, 12, 20), lifespan: 4, flavour: 'Tasmanian devil, ferocious.',
    trainingProfile: { major: 'DEX', flaw: 'CON' },
    innate: [{ name: 'Devour', desc: 'Heals 30% of damage dealt as HP.' }, { name: 'Whirlwind', desc: '+7% critical hit chance.' }] },

  // --- Aquatic (WIS / INT) ---
  { id: 'maelurk', name: 'Maelurk', body: 'Aquatic', naturalClass: 'Wizard', base: s(12, 22, 18, 32, 44, 14), lifespan: 4, flavour: 'Octopus, ink-dark and endlessly curious.',
    trainingProfile: {},
    innate: [{ name: 'Ink Cloud', desc: 'Enemies: -5% accuracy.' }, { name: 'Tentacle Barrage', desc: '8% chance to cast a skill twice.' }] },
  { id: 'nautilux', name: 'Nautilux', body: 'Aquatic', naturalClass: 'Spellshield', base: s(14, 12, 42, 32, 20, 12), lifespan: 5, flavour: 'Nautilus, spiral shell weathered by a thousand tides.',
    trainingProfile: { major: 'CON', flaw: 'STR' },
    innate: [{ name: 'Ward', desc: 'Starts battle with a 25 HP shield.' }, { name: 'Spiral Shell', desc: 'Reduces damage taken by 2 per hit. +2% dodge chance.' }] },
  { id: 'carcharun', name: 'Carcharun', body: 'Aquatic', naturalClass: 'Sage', base: s(12, 16, 24, 44, 30, 14), lifespan: 6, flavour: 'Ancient reef shark, ageless apex mind.',
    trainingProfile: { major: 'STR', flaw: 'CHA' },
    innate: [{ name: 'Tidal Wisdom', desc: '+2 mana regen/turn. +2 HP regen/turn.' }, { name: 'Weathered Hide', desc: 'Reduces damage taken by 2 per hit. Incoming debuffs are 10% weaker.' }] },
  { id: 'mantaris', name: 'Mantaris', body: 'Aquatic', naturalClass: 'Ranger', base: s(14, 42, 18, 22, 32, 12), lifespan: 4, flavour: 'Manta ray, wing-like fins gliding through open water.',
    trainingProfile: { major: 'DEX', flaw: 'CON' },
    innate: [{ name: 'Wing Current', desc: '+10% dodge chance.' }, { name: 'Current Rider', desc: '+6% critical hit chance. +2% accuracy.' }] },
  { id: 'lanterix', name: 'Lanterix', body: 'Aquatic', naturalClass: 'Spellsword', base: s(20, 14, 36, 24, 40, 12), lifespan: 5, flavour: 'Lanternfish, a living lure glowing in the abyss.',
    trainingProfile: { major: 'WIS', flaw: 'DEX' },
    innate: [{ name: 'Spellblade', desc: '+12% elemental damage.' }, { name: 'Abyssal Glow', desc: '+3 mana regen/turn.' }] },

  // --- Insectoid (⛰️ resist / 💧 weak) — chitinous, tireless; covers WIS/DEX training weaknesses ---
  { id: 'scarabrute', name: 'Scarabrute', body: 'Insectoid', naturalClass: 'Tank', base: s(36, 16, 44, 8, 14, 12), lifespan: 5, flavour: 'Colossal beetle, armoured shell built like a dam.',
    trainingProfile: {},
    innate: [{ name: 'Chitin Plate', desc: 'Reduces damage taken by 1 per hit. Starts battle with a 12 HP shield.' }, { name: 'Burrow', desc: '+4% dodge chance.' }] },
  { id: 'mantevoke', name: 'Mantevoke', body: 'Insectoid', naturalClass: 'Rogue', base: s(34, 42, 18, 8, 20, 12), lifespan: 4, flavour: 'Mantis, patient and precise.',
    trainingProfile: { major: 'STR', flaw: 'INT' },
    innate: [{ name: 'Ambush', desc: '+70% damage on its first hit.' }, { name: 'Serrated Claws', desc: 'Ignores 18% of enemy mitigation.' }] },
  { id: 'arachnyx', name: 'Arachnyx', body: 'Insectoid', naturalClass: 'Wizard', base: s(14, 8, 16, 32, 40, 20), lifespan: 4, flavour: 'Web-weaver spider, never leaves its lair.',
    trainingProfile: { major: 'WIS', flaw: 'DEX' },
    innate: [{ name: 'Web Trap', desc: '+5% dodge chance. Enemies: -3% dodge chance.' }, { name: 'Venom Fang', desc: '12% chance to Poison on every hit.' }] },
  { id: 'vespera', name: 'Vespera', body: 'Insectoid', naturalClass: 'Orator', base: s(12, 8, 26, 34, 18, 44), lifespan: 5, flavour: 'Wasp queen, voice of the hive.',
    trainingProfile: { major: 'CHA', flaw: 'STR' },
    innate: [{ name: 'Hive Command', desc: '30% chance its debuffs last an extra round.' }, { name: 'Royal Jelly', desc: 'Team: +2 HP regen/turn.' }] },
  { id: 'odonatra', name: 'Odonatra', body: 'Insectoid', naturalClass: 'Ranger', base: s(14, 44, 16, 22, 30, 8), lifespan: 4, flavour: 'Dragonfly, a four-winged blur.',
    trainingProfile: { major: 'DEX', flaw: 'WIS' },
    innate: [{ name: 'Skim Dart', desc: '+25% damage on its first hit.' }, { name: 'Compound Eyes', desc: '+11% accuracy.' }] },

  // --- Reptilian (🔥 resist / 💨 weak) — slow, patient, cold-blooded; covers DEX/WIS training weaknesses ---
  { id: 'crocmaw', name: 'Crocmaw', body: 'Reptilian', naturalClass: 'Warrior', base: s(44, 10, 38, 20, 12, 14), lifespan: 6, flavour: 'River crocodile, a patient ambush predator.',
    trainingProfile: { major: 'STR', flaw: 'WIS' },
    innate: [{ name: 'Death Roll', desc: '+25% damage to enemies below 30% HP.' }, { name: 'Armored Scales', desc: 'Reduces damage taken by 1 per hit. +1 HP regen/turn.' }] },
  { id: 'iguanor', name: 'Iguanor', body: 'Reptilian', naturalClass: 'Captain', base: s(42, 10, 26, 14, 12, 34), lifespan: 4, flavour: 'Crested iguana, sun-crowned and proud.',
    trainingProfile: { major: 'INT', flaw: 'CON' },
    innate: [{ name: 'Sun Basking', desc: '+3 HP regen/turn.' }, { name: 'Crest Display', desc: '10% chance to Blind on every hit.' }] },
  { id: 'serpwyn', name: 'Serpwyn', body: 'Reptilian', naturalClass: 'Sage', base: s(16, 22, 14, 42, 30, 8), lifespan: 5, flavour: 'Hooded cobra, unblinking and patient.',
    trainingProfile: { major: 'WIS', flaw: 'STR' },
    innate: [{ name: 'Cold Blood', desc: 'Incoming debuffs are 20% weaker.' }, { name: 'Hypnotic Gaze', desc: '+7% accuracy.' }] },
  { id: 'geckari', name: 'Geckari', body: 'Reptilian', naturalClass: 'Rogue', base: s(30, 40, 18, 8, 16, 20), lifespan: 4, flavour: 'Gecko wall-runner, impossible angles.',
    trainingProfile: {},
    innate: [{ name: 'Wall Runner', desc: '+6% dodge chance. +2% accuracy.' }, { name: 'Tail Drop', desc: '+10% critical hit chance.' }] },
  { id: 'tortavos', name: 'Tortavos', body: 'Reptilian', naturalClass: 'Spellshield', base: s(8, 12, 44, 36, 22, 14), lifespan: 6, flavour: 'Ancient tortoise, unhurried and deep-shelled.',
    trainingProfile: { major: 'CON', flaw: 'INT' },
    innate: [{ name: 'Shell Ward', desc: 'Starts battle with an 18 HP shield.' }, { name: 'Inner Calm', desc: '+2 mana regen/turn.' }] },

  // --- Draconic (STR / WIS, weakness CHA) — Silver rank exclusive ---
  { id: 'pyraxon', name: 'Pyraxon', body: 'Draconic', naturalClass: 'Warrior', base: s(28, 18, 24, 20, 16, 8), lifespan: 5, flavour: 'Fire-breathing drake, ancient fury.',
    innate: [{ name: 'Flame Aura', desc: '8% chance to Burn on every hit.' }, { name: 'Draconic Pride', desc: '+6% damage.' }] },
  { id: 'frostwyren', name: 'Frostwyren', body: 'Draconic', naturalClass: 'Wizard', base: s(20, 20, 14, 24, 36, 6), lifespan: 5, flavour: 'Icy wyvern, patient mage.',
    innate: [{ name: 'Blizzard', desc: '6% chance to Stun on every hit.' }, { name: 'Glacial Wisdom', desc: '+2 mana regen/turn. Reduces damage taken by 1 per hit.' }] },
  { id: 'stormlerath', name: 'Stormlerath', body: 'Draconic', naturalClass: 'Ranger', base: s(24, 30, 18, 20, 28, 6), lifespan: 4, flavour: 'Lightning-winged serpent, swift strike.',
    innate: [{ name: 'Overload', desc: '+7% damage.' }, { name: 'Dodge Storm', desc: '+6% dodge chance. +3% critical hit chance.' }] },
  { id: 'verdantdrake', name: 'Verdantdrake', body: 'Draconic', naturalClass: 'Sage', base: s(18, 18, 20, 36, 28, 8), lifespan: 6, flavour: 'Emerald dragon, nature\'s guardian.',
    innate: [{ name: 'Life Bloom', desc: 'Team: +2 HP regen/turn. Team: +1 mana regen/turn.' }, { name: 'Root Grasp', desc: 'Enemies: -3% dodge chance. Enemies: -2% accuracy.' }] },
  { id: 'voidmaw', name: 'Voidmaw', body: 'Draconic', naturalClass: 'Wizard', base: s(20, 24, 18, 28, 32, 6), lifespan: 4, flavour: 'Void-touched dragon, cosmic terror.',
    innate: [{ name: 'Void Pulse', desc: 'Heals 10% of damage dealt as HP.' }, { name: 'Entropy', desc: 'Enemies: -5% damage dealt.' }] },

  // --- Abyssal (INT / DEX, weakness CON) — Silver rank exclusive ---
  { id: 'tenebrae', name: 'Tenebrae', body: 'Abyssal', naturalClass: 'Rogue', base: s(28, 34, 12, 20, 24, 10), lifespan: 4, flavour: 'Shadow squid, sneaky assassin.',
    innate: [{ name: 'Cloak of Shadow', desc: '+8% dodge chance.' }, { name: 'Silent Strike', desc: '+40% damage on its first hit. +5% critical hit chance.' }] },
  { id: 'abyssomancer', name: 'Abyssomancer', body: 'Abyssal', naturalClass: 'Wizard', base: s(14, 28, 10, 32, 40, 12), lifespan: 5, flavour: 'Deep-sea sorceress, eldritch power.',
    innate: [{ name: 'Rift Magic', desc: '6% chance to cast a skill twice.' }, { name: 'Mana Theft', desc: 'Steals mana equal to 20% of damage dealt.' }] },
  { id: 'lurkerss', name: 'Lurkerss', body: 'Abyssal', naturalClass: 'Sage', base: s(12, 30, 14, 36, 32, 14), lifespan: 5, flavour: 'Luminescent serpent, deep thinker.',
    innate: [{ name: 'Psychic Aura', desc: 'Team: +3% dodge chance. Team: +1 mana regen/turn.' }, { name: 'Ancient Knowing', desc: '+5% dodge chance.' }] },
  { id: 'chrono-leviathan', name: 'Chrono-Leviathan', body: 'Abyssal', naturalClass: 'Sage', base: s(14, 28, 10, 36, 34, 8), lifespan: 6, flavour: 'Time-warped colossus, ageless predator.',
    innate: [{ name: 'Temporal Distortion', desc: 'Team: +1 mana regen/turn. Enemies: -4% dodge chance.' }, { name: 'Age Reversal', desc: 'Heals 15% of damage dealt as HP.' }] },
  { id: 'cephalumbra', name: 'Cephalumbra', body: 'Abyssal', naturalClass: 'Rogue', base: s(28, 40, 10, 18, 24, 10), lifespan: 4, flavour: 'Phantom tentacles, ghost-swift.',
    innate: [{ name: 'Phase Shift', desc: '+9% dodge chance.' }, { name: 'Whip Strike', desc: 'Ignores 10% of enemy mitigation.' }] },

  // --- Mythical (5 unique archetypes) — Masters rank exclusive ---
  { id: 'titanrex', name: 'Titanrex', body: 'Mythical', naturalClass: 'Warrior', base: s(48, 14, 38, 10, 10, 6), lifespan: 7, flavour: 'Primal tyrant lizard, raw power.',
    innate: [{ name: 'Prehistoric Roar', desc: '+20% damage on its first hit.' }, { name: 'Unstoppable', desc: 'Reduces damage taken by 1 per hit. Incoming debuffs are 15% weaker.' }] },
  { id: 'stellarion', name: 'Stellarion', body: 'Mythical', naturalClass: 'Ranger', base: s(10, 46, 8, 28, 40, 12), lifespan: 5, flavour: 'Star-born hunter, celestial archer.',
    innate: [{ name: 'Stellar Shot', desc: '+9% critical hit chance.' }, { name: 'Cosmic Precision', desc: '+10% accuracy.' }] },
  { id: 'wisdomkeeper', name: 'Wisdomkeeper', body: 'Mythical', naturalClass: 'Sage', base: s(10, 16, 18, 50, 42, 10), lifespan: 7, flavour: 'Ancient oracle, all-seeing guide.',
    innate: [{ name: 'Foresight', desc: 'Team: +5% dodge chance.' }, { name: 'Truth\'s Word', desc: 'Reduces damage taken by 1 per hit. Every 3rd round, automatically shrugs off one debuff on itself.' }] },
  { id: 'archmage-aleph', name: 'Archmage-Aleph', body: 'Mythical', naturalClass: 'Wizard', base: s(6, 18, 12, 36, 52, 20), lifespan: 5, flavour: 'First of mages, spell incarnate.',
    innate: [{ name: 'Spell Echo', desc: '12% chance to cast a skill twice.' }, { name: 'Arcane Mastery', desc: '+5 mana regen/turn.' }] },
  { id: 'harmonybringer', name: 'Harmonybringer', body: 'Mythical', naturalClass: 'Bard', base: s(8, 36, 26, 14, 10, 52), lifespan: 6, flavour: 'Mythical unifier, peace in chaos.',
    innate: [{ name: 'Unison', desc: 'Team: reduces damage taken by 2 per hit.' }, { name: 'Aegis Bond', desc: 'Reduces damage taken by 2 per hit. +2 HP regen/turn.' }] },
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
