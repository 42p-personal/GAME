// The 20 base species (§8.2 / §8.3): stats, lifespans, innate abilities, ultimates.
import { Species } from './core'

const s = (STR: number, DEX: number, CON: number, WIS: number, INT: number, CHA: number) => ({ STR, DEX, CON, WIS, INT, CHA })

export const SPECIES: Species[] = [
  // --- Mammal (STR / CON) ---
  { id: 'bouldram', name: 'Bouldram', body: 'Mammal', naturalClass: 'Warrior', base: s(42, 20, 34, 12, 10, 16), lifespan: 4, flavour: 'Bighorn ram, charging bruiser.',
    innate: [{ name: 'Charge', desc: 'Bonus damage on first melee hit.' }, { name: 'Momentum', desc: 'Melee grows as it advances.' }], ultimate: { name: 'Avalanche Charge', desc: 'Massive unavoidable melee rush that stuns.' } },
  { id: 'aegisox', name: 'Aegisox', body: 'Mammal', naturalClass: 'Tank', base: s(30, 14, 44, 16, 10, 14), lifespan: 6, flavour: 'Armoured ox, immovable wall.',
    innate: [{ name: 'Bulwark', desc: 'Reduces incoming melee.' }, { name: 'Immovable', desc: 'Resists knockback/displacement.' }], ultimate: { name: 'Aegis Fortress', desc: 'Near-immune for a few ticks; taunts all enemies.' } },
  { id: 'maneleo', name: 'Maneleo', body: 'Mammal', naturalClass: 'Captain', base: s(40, 22, 26, 12, 12, 30), lifespan: 4, flavour: 'Lion pride-leader, inspiring.',
    innate: [{ name: 'Rallying Roar', desc: 'Team attack/morale buff.' }, { name: 'Pride', desc: 'Stronger while allies stand.' }], ultimate: { name: "Pride's Roar", desc: 'Huge team-wide attack + morale surge.' } },
  { id: 'grivvel', name: 'Grivvel', body: 'Mammal', naturalClass: 'Rogue', base: s(34, 40, 22, 12, 10, 14), lifespan: 4, flavour: 'Wolverine brawler.',
    innate: [{ name: 'Rend', desc: 'Attacks cause bleed (DoT).' }, { name: 'Frenzy', desc: 'Attack speed up at low HP.' }], ultimate: { name: 'Blood Frenzy', desc: 'Attack speed & lifesteal spike until battle ends.' } },
  { id: 'ursath', name: 'Ursath', body: 'Mammal', naturalClass: 'Warrior', base: s(40, 18, 36, 14, 10, 14), lifespan: 5, flavour: 'Great bear, sturdy all-rounder.',
    innate: [{ name: 'Thick Hide', desc: 'Flat damage reduction.' }, { name: 'Maul', desc: 'Heavy melee crits.' }], ultimate: { name: "Titan's Maul", desc: 'Colossal melee blow that ignores defence.' } },

  // --- Avian (DEX / WIS) ---
  { id: 'skyrend', name: 'Skyrend', body: 'Avian', naturalClass: 'Ranger', base: s(20, 44, 18, 24, 28, 12), lifespan: 4, flavour: 'Raptor, diving ranged striker.',
    innate: [{ name: 'Dive Bomb', desc: 'High-damage opening ranged strike.' }, { name: 'Keen Eye', desc: 'Ignores some dodge.' }], ultimate: { name: 'Death from Above', desc: 'Execute-style dive on the lowest-HP enemy.' } },
  { id: 'strixil', name: 'Strixil', body: 'Avian', naturalClass: 'Sage', base: s(10, 22, 16, 42, 32, 14), lifespan: 5, flavour: 'Owl, quiet mana engine.',
    innate: [{ name: 'Mana Font', desc: 'Boosts team mana regen.' }, { name: 'Silent Wisdom', desc: 'Passive mana over time.' }], ultimate: { name: 'Eclipse', desc: 'Silences enemy casters + floods team mana.' } },
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
    innate: [{ name: 'Lullaby', desc: 'Voice attack, can sleep/slow.' }, { name: 'Soothing Words', desc: 'Steadies/heals allies.' }], ultimate: { name: 'Dreamsong', desc: 'Puts multiple enemies to sleep.' } },
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
    innate: [{ name: 'Shock', desc: 'Ranged hit, stun chance.' }, { name: 'Static Field', desc: 'Chips enemy mana.' }], ultimate: { name: 'Thunderstorm', desc: 'Chain-lightning stun across enemies.' } },
  { id: 'corallux', name: 'Corallux', body: 'Aquatic', naturalClass: 'Spellsword', base: s(20, 14, 36, 24, 40, 12), lifespan: 5, flavour: 'Coral crustacean, mage-bruiser.',
    innate: [{ name: 'Spellblade', desc: 'Melee hits add elemental damage.' }, { name: 'Coral Guard', desc: 'Defence while casting.' }], ultimate: { name: 'Reef Blade', desc: 'Empowers melee with elemental burst + self-fortify.' } },
]

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((sp) => [sp.id, sp]))
