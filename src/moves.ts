// The 90-skill shared learned-move pool (§7.5): 15 per stat, each with an explicit
// learn level and mechanical effects (core.ts:MoveEffects — pierce, multi-hit,
// execute, recoil, lifesteal, mana warfare, wards, ROUND-LIMITED buffs/debuffs —
// nothing lasts "for the fight" anymore, everything expires and can be refreshed).
// Big effects are balanced by MP cost (monster.ts:manaCost) and long cooldowns.
//
// Design philosophy per stat (user spec 2026-07-20) — each pool has a distinct
// identity so the stat itself, not just flavour text, determines playstyle:
//   STR: highest raw hits, some recoil (capped 15%), SELF buffs only,
//        one Fire-elemental attack, one Earth-elemental attack
//   DEX: poison + precision, heavy on multi-hit, SELF buffs only,
//        one Air-elemental attack, one Water-elemental attack
//   CON: the ONLY stat that grants shields (ward) or armour (defBuff); taunts
//        (forces targeting — inert until team battles exist); some self-heal;
//        very few party buffs; self-cleanse
//   WIS: heavy mana regen/mana burn; some healing reaches allies, not just
//        self; a few buffs; one party-wide cleanse
//   INT: all four elements represented; mix of AoE and single-target;
//        NO buffs, NO healing — pure elemental damage
//   CHA: party buffs on the user's side, party-wide debuffs on the enemy side
// Values are first-pass and meant for tuning.
//
// Synergy revamp (user spec 2026-07-25, level 120+ ONLY — 40/90 never touched):
// every stat gained setup->payoff combos via bonusVsStatus, most self-contained
// within the stat's own 12 post-90 moves (STR bleed setter+payoff, INT burn
// setter+payoff, WIS doom setter+early-cash, CHA fear setter+payoff), some
// cross-stat (DEX bleed setter/payoff mirrors STR's). AoE-status and "big"
// full-hijack statuses (sleep/charm/doom/silence/fear) were deliberately kept
// LOW probability (15-30%) per that spec; single-target "smaller" statuses
// (bleed/vulnerable) stayed moderate (30-50%). Thunderclap (INT) introduces
// firstStrikeMult — bonus damage if the caster acted before the target this
// round, rewarding speed investment (DEX/haste/knockback) without being a
// status. CON's Bulwark's Challenge (mass taunt, target allEnemies) + Barbed
// Carapace (thorns) is the flagship team-fight combo: force the whole enemy
// side onto one tank, then punish every hit.
import { Move, Stat } from './core'

type Row = Omit<Move, 'id' | 'stat'>

const POOLS: Record<Stat, Row[]> = {
  STR: [
    { name: 'Jab', learnLevel: 40, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 1, accuracy: 95, power: 12, desc: 'Quick light melee hit.' },
    { name: 'Guard', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, effects: { guard: 8 }, desc: 'Brace against the next hits.' },
    { name: 'Power Strike', learnLevel: 90, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 2, accuracy: 90, power: 30, effects: { recoil: 0.05 }, desc: 'Heavy single-target blow; 5% recoil.' },
    { name: 'War Cry', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { atkBuff: 0.15, duration: 3 }, desc: 'Battle fury: +15% damage for 3 rounds.' },
    { name: 'Cleave', learnLevel: 160, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 20, desc: 'Sweeping hit that splashes all foes.' },
    { name: 'Rending Blow', learnLevel: 200, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 24, effects: { defDebuff: 4, duration: 3 }, status: { kind: 'bleed', chance: 50, duration: 3 }, desc: 'Dents armour for 3 rounds; 50% chance to cause Bleed.' },
    { name: 'Flurry of Blows', learnLevel: 240, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 90, power: 9, effects: { hits: [2, 4] }, desc: 'A rapid combination, 2–4 strikes.' },
    { name: 'Bonebreaker', learnLevel: 330, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 85, power: 28, effects: { defDebuff: 8, duration: 3 }, status: { kind: 'vulnerable', chance: 40, duration: 2 }, desc: 'Shatters defence for 3 rounds; 40% chance to leave the target Vulnerable.' },
    { name: 'Bracer', learnLevel: 380, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { guard: 14 }, desc: 'A hard defensive set.' },
    { name: 'Reckless Slam', learnLevel: 430, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 85, power: 48, element: 'fire', effects: { recoil: 0.1 }, desc: 'A scorching, reckless haymaker; 10% recoil.' },
    { name: 'Berserk', learnLevel: 540, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, effects: { atkBuff: 0.3, duration: 3 }, desc: 'Sees red: +30% damage for 3 rounds.' },
    { name: 'Earthshaker', learnLevel: 650, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 5, accuracy: 80, power: 26, element: 'earth', status: { kind: 'stun', chance: 30, duration: 1 }, desc: 'Ground-splitting AoE with a stun chance.' },
    { name: 'Bloodletter', learnLevel: 780, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 5, accuracy: 85, power: 10, effects: { hits: [3, 5], bonusVsStatus: { kind: 'bleed', mult: 2.5, consume: true } }, desc: 'A weak flurry, 3–5 strikes, unless the target is Bleeding — then 2.5× and drains the wound.' },
    { name: 'Executioner', learnLevel: 850, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 90, power: 34, effects: { execute: 0.35 }, desc: 'Brutal finisher: 1.5× vs weakened foes.' },
    { name: 'Titanfall', learnLevel: 920, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 6, accuracy: 80, power: 68, effects: { pierce: 0.3, recoil: 0.15 }, desc: 'Colossal blow that partly ignores defence; 15% recoil.' },
  ],
  DEX: [
    { name: 'Sling', learnLevel: 40, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, effects: { hits: [1, 2] }, desc: 'One or two quick shots.' },
    { name: 'Sidestep', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { dodgeBuff: 8, duration: 2 }, desc: 'Footwork: +8% dodge for 2 rounds.' },
    { name: 'Piercing Shot', learnLevel: 90, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 90, power: 18, effects: { hits: [1, 2] }, status: { kind: 'poison', chance: 45, duration: 3 }, desc: 'One or two venom-tipped shots; 45% chance to Poison.' },
    { name: 'Focus Aim', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { accBuff: 10, duration: 3 }, desc: 'Steady breathing: +10% accuracy for 3 rounds.' },
    { name: 'Twin Fangs', learnLevel: 160, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 90, power: 11, effects: { hits: [2, 2] }, status: { kind: 'bleed', chance: 30, duration: 3 }, desc: 'Two quick shots; 30% chance to cause Bleed.' },
    { name: 'Pin Down', learnLevel: 200, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 88, power: 16, effects: { accDebuff: 10, duration: 3 }, desc: 'Suppressing fire: target aims worse for 3 rounds.' },
    { name: 'Blur', learnLevel: 240, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { dodgeBuff: 14, duration: 3 }, desc: 'A blur of motion: +14% dodge for 3 rounds.' },
    { name: 'Snipe', learnLevel: 330, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 82, power: 34, effects: { pierce: 0.25 }, desc: 'Slow, punishing shot through armour.' },
    { name: 'Needle Storm', learnLevel: 380, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 18, element: 'water', desc: 'A driving spray of needles across all foes.' },
    { name: 'Fleetfoot Riposte', learnLevel: 430, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { guard: 8, dodgeBuff: 6, duration: 2 }, status: { kind: 'haste', chance: 100, duration: 2 }, desc: 'Defensive stance with an answer ready (dodge +6% for 2 rounds); acts first next round.' },
    { name: 'Marked for the Pack', learnLevel: 540, type: 'debuff', channel: 'ranged', target: 'enemy', cooldown: 4, accuracy: 100, power: 0, effects: { defDebuff: 10, duration: 3 }, status: { kind: 'vulnerable', chance: 100, duration: 3 }, desc: 'Marks the prey for the whole team: takes more damage and is left Vulnerable for 3 rounds.' },
    { name: 'Rain of Arrows', learnLevel: 650, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 28, element: 'air', status: { kind: 'knockback', chance: 20, duration: 2 }, desc: 'A sustained volley riding the wind; 20% chance to drive each foe back (acts last).' },
    { name: 'Shadow Barrage', learnLevel: 780, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 5, accuracy: 88, power: 13, effects: { hits: [3, 6] }, desc: 'A storm of strikes from cover, 3–6 hits.' },
    { name: 'Heartseeker', learnLevel: 850, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 4, accuracy: 92, power: 38, effects: { hits: [2, 3], execute: 0.4 }, desc: 'A homing volley, 2–3 shots, 1.5× vs weakened foes.' },
    { name: 'Deadeye', learnLevel: 920, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 6, accuracy: 95, power: 52, effects: { pierce: 0.5, bonusVsStatus: { kind: 'bleed', mult: 1.5, consume: true } }, desc: 'The perfect shot: half of defence ignored; 1.5× and drains the wound if the target is Bleeding.' },
  ],
  CON: [
    { name: 'Brace', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 2, accuracy: 100, power: 0, effects: { guard: 6 }, desc: 'Small flat damage reduction until next action.' },
    { name: 'Second Wind', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 16, desc: 'Catch a breath: heal a little HP.' },
    { name: 'Taunt', learnLevel: 90, type: 'debuff', channel: 'support', target: 'enemy', cooldown: 4, accuracy: 100, power: 0, effects: { atkDebuff: 0.1, duration: 3, tauntForce: true }, desc: 'Enrages and forces the target to attack the taunter for 3 rounds (−10% damage while enraged).' },
    { name: 'Barbed Carapace', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { defBuff: 4, thorns: 6, duration: 3 }, desc: 'Hardened, spiked hide: +4 mitigation and reflects 6 damage per hit for 3 rounds.' },
    { name: 'Body Slam', learnLevel: 160, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, status: { kind: 'knockback', chance: 40, duration: 2 }, desc: 'Throws its bulk into the target; 40% chance to send it reeling — knocked back, it acts last.' },
    { name: 'Steady Vigil', learnLevel: 200, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 20, effects: { hpRegenBuff: 5, duration: 3 }, desc: 'Knit flesh: solid heal, then +5 HP regen/turn for 3 rounds.' },
    { name: 'Bulwark', learnLevel: 240, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { ward: 25 }, desc: 'Raise a 25 HP absorb shield.' },
    { name: 'Purge', learnLevel: 330, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 10, effects: { cleanse: true }, desc: 'Shrug off ailments and mend a little.' },
    { name: 'Shell Slam', learnLevel: 380, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 26, effects: { recoil: 0.1 }, desc: 'Full-body crash; slight recoil.' },
    { name: 'Fortify', learnLevel: 430, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { ward: 40 }, desc: 'Raise a 40 HP absorb shield.' },
    { name: 'Stone Wall', learnLevel: 540, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, effects: { defBuff: 8, duration: 3 }, desc: 'Living rampart: +8 mitigation for 3 rounds.' },
    { name: "Bulwark's Challenge", learnLevel: 650, type: 'debuff', channel: 'support', target: 'allEnemies', cooldown: 6, accuracy: 100, power: 0, effects: { guard: 20, tauntForce: true, duration: 2 }, desc: 'Plants its feet and roars a challenge: massive guard, and forces the WHOLE enemy team to attack it for 2 rounds.' },
    { name: 'Vital Surge', learnLevel: 780, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 46, effects: { cleanse: true }, desc: 'Big heal + cleanse ailments.' },
    { name: 'Colossus Crash', learnLevel: 850, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 5, accuracy: 85, power: 36, effects: { guard: 10, maxHpDmg: 0.03 }, desc: 'Crushing advance that braces after the hit; extra damage scaled off the target\'s own max HP.' },
    { name: 'Undying', learnLevel: 920, type: 'buff', channel: 'support', target: 'self', cooldown: 8, accuracy: 100, power: 70, desc: 'Refuses to fall: massive recovery.' },
  ],
  WIS: [
    { name: 'Focus', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { regenBuff: 2, duration: 3 }, desc: 'Centre the mind: +2 mana regen for 3 rounds.' },
    { name: 'Mend', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 14, desc: 'Soothing focus: heal a little HP.' },
    { name: 'Mana Sap', learnLevel: 90, type: 'damage', channel: 'support', target: 'enemy', cooldown: 2, accuracy: 92, power: 8, effects: { manaBurn: 10 }, desc: 'Light hit that drinks 10 MP from the target.' },
    { name: 'Clarity', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, effects: { cleanse: true }, desc: 'A clear mind: remove ailments.' },
    { name: 'Serenity', learnLevel: 160, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { dodgeBuff: 6, regenBuff: 2, duration: 3 }, desc: 'Calm flow: +6% dodge, +2 regen for 3 rounds.' },
    { name: 'Silencing Spike', learnLevel: 200, type: 'damage', channel: 'support', target: 'enemy', cooldown: 2, accuracy: 90, power: 18, effects: { manaBurn: 13 }, status: { kind: 'silence', chance: 25, duration: 2 }, desc: 'Psychic jab that burns 13 MP; 25% chance to Silence.' },
    { name: 'Attunement', learnLevel: 240, type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, effects: { regenBuff: 3, duration: 3 }, desc: "Links the team's focus: everyone regains more mana for 3 rounds." },
    { name: 'Insight', learnLevel: 330, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { accBuff: 12, duration: 3 }, desc: 'Read the fight: +12% accuracy for 3 rounds.' },
    { name: 'Drain Spirit', learnLevel: 380, type: 'damage', channel: 'support', target: 'enemy', cooldown: 4, accuracy: 88, power: 20, effects: { manaBurn: 15, lifesteal: 0.3 }, desc: 'Drinks 15 MP and heals for part of the damage.' },
    { name: 'Tranquility', learnLevel: 430, type: 'buff', channel: 'support', target: 'ally', cooldown: 5, accuracy: 100, power: 32, desc: 'Deep restorative calm channelled into an ally: strong heal.' },
    { name: 'Field of Doom', learnLevel: 540, type: 'debuff', channel: 'support', target: 'enemy', cooldown: 5, accuracy: 95, power: 0, effects: { atkDebuff: 0.15, duration: 3 }, status: { kind: 'doom', chance: 28, duration: 4 }, desc: 'Dampening field: target deals −15% damage for 3 rounds; 28% chance to seal its Doom.' },
    { name: 'Ward Against Ruin', learnLevel: 650, type: 'buff', channel: 'support', target: 'team', cooldown: 6, accuracy: 100, power: 0, effects: { cleanse: true, regenBuff: 3, duration: 3 }, desc: "Clears the whole team's ailments — confusion, charm, doom, silence, sleep, healblock, all of it — and steadies their focus for 3 rounds." },
    { name: 'Mind Crush', learnLevel: 780, type: 'damage', channel: 'support', target: 'enemy', cooldown: 5, accuracy: 85, power: 36, effects: { manaBurn: 25, bonusVsStatus: { kind: 'doom', mult: 1.6, consume: true } }, desc: 'Heavy psychic blow; burns 25 MP. 1.6× and detonates the target\'s Doom early if it has one.' },
    { name: 'Providence', learnLevel: 850, type: 'buff', channel: 'support', target: 'self', cooldown: 7, accuracy: 100, power: 0, effects: { dodgeBuff: 12, accBuff: 12, duration: 4 }, desc: 'Sees what comes: +12% dodge and accuracy for 4 rounds.' },
    { name: 'Ascendance', learnLevel: 920, type: 'buff', channel: 'support', target: 'self', cooldown: 8, accuracy: 100, power: 0, effects: { atkBuff: 0.25, regenBuff: 4, duration: 4 }, desc: 'Transcendent state: +25% damage, +4 regen for 4 rounds.' },
  ],
  INT: [
    { name: 'Spark', learnLevel: 40, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 1, accuracy: 95, power: 12, element: 'air', desc: 'Small air bolt.' },
    { name: 'Ember', learnLevel: 40, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 12, element: 'fire', status: { kind: 'burn', chance: 40, duration: 3 }, desc: 'Minor fire; 40% chance to Burn.' },
    { name: 'Frost Shard', learnLevel: 90, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 18, element: 'water', desc: 'Icy dart.' },
    { name: 'Fracturing Stones', learnLevel: 120, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 16, element: 'earth', status: { kind: 'vulnerable', chance: 30, duration: 3 }, desc: 'A stinging barrage of stone shards; 30% chance to crack their guard, leaving them Vulnerable.' },
    { name: 'Thunderclap', learnLevel: 160, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 20, element: 'air', effects: { firstStrikeMult: 1.35 }, desc: 'Lightning hit; 1.35× damage if this monster acted before the target this round.' },
    { name: 'Cinderburst', learnLevel: 200, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 28, element: 'fire', effects: { bonusVsStatus: { kind: 'burn', mult: 1.5, consume: true } }, desc: 'Solid single-target fire burst; 1.5× and snuffs the flame if the target is already Burning.' },
    { name: 'Stone Spear', learnLevel: 240, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 85, power: 30, element: 'earth', effects: { pierce: 0.25 }, desc: 'Earth lance that punches through defence.' },
    { name: 'Static Chain', learnLevel: 330, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 85, power: 24, element: 'air', status: { kind: 'vulnerable', chance: 20, duration: 2 }, desc: 'Bolt that arcs across all foes; 20% chance to leave each Vulnerable.' },
    { name: 'Mana Leech', learnLevel: 380, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 18, effects: { manaBurn: 12, lifesteal: 0.25 }, desc: 'Arcane siphon: burns MP, heals the caster.' },
    { name: 'Inferno', learnLevel: 430, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 26, element: 'fire', status: { kind: 'burn', chance: 25, duration: 3 }, desc: 'Fire AoE; 25% chance to Burn.' },
    { name: 'Glacial Prison', learnLevel: 540, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 5, accuracy: 85, power: 30, element: 'water', status: { kind: 'stun', chance: 25, duration: 1 }, desc: 'Entombs in ice, 25% stun chance.' },
    { name: 'Deep Freeze', learnLevel: 650, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 5, accuracy: 80, power: 32, element: 'water', effects: { pierce: 0.2 }, desc: 'Freezing AoE storm that punches through frozen armour.' },
    { name: 'Void Lance', learnLevel: 780, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 5, accuracy: 85, power: 44, effects: { pierce: 0.5 }, desc: 'Pure void: half of defence ignored.' },
    { name: 'Arcane Overload', learnLevel: 850, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 6, accuracy: 85, power: 52, effects: { recoil: 0.15 }, desc: 'Overchannelled blast; the caster burns too.' },
    { name: 'World Ender', learnLevel: 920, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 7, accuracy: 78, power: 56, element: 'earth', effects: { maxHpDmg: 0.02 }, desc: 'Massive earth AoE nuke; extra damage to each target scaled off its own max HP.' },
  ],
  CHA: [
    { name: 'Taunt Cry', learnLevel: 40, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, desc: 'Light voice damage + minor aggro.' },
    { name: 'Discord', learnLevel: 40, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 2, accuracy: 90, power: 11, status: { kind: 'blind', chance: 45, duration: 3 }, desc: 'Jarring note; 45% chance to Blind.' },
    { name: 'Rallying Song', learnLevel: 90, type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, effects: { atkBuff: 0.1, duration: 3 }, desc: 'Stirring tune: team +10% damage for 3 rounds.' },
    { name: 'Grand Mockery', learnLevel: 120, type: 'debuff', channel: 'voice', target: 'allEnemies', cooldown: 4, accuracy: 95, power: 0, effects: { atkDebuff: 0.12, duration: 3 }, status: { kind: 'healblock', chance: 20, duration: 2 }, desc: 'Cutting jeer: enemy team −12% damage for 3 rounds; 20% chance their wounds won\'t close.' },
    { name: 'Screech', learnLevel: 160, type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 14, status: { kind: 'fear', chance: 20, duration: 2 }, desc: 'Voice AoE; 20% chance to inflict Fear for 2 rounds.' },
    { name: 'Captivate', learnLevel: 200, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 3, accuracy: 88, power: 16, effects: { lifesteal: 0.4 }, desc: 'Feeds on adoration: heals 40% of damage.' },
    { name: 'Battle Hymn', learnLevel: 240, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, effects: { dodgeBuff: 5, regenBuff: 2, duration: 3 }, status: { kind: 'haste', chance: 100, duration: 2 }, desc: 'Steadying anthem: team +5% dodge, +2 regen for 3 rounds — and the whole team acts first next round.' },
    { name: 'Demoralize', learnLevel: 330, type: 'debuff', channel: 'voice', target: 'allEnemies', cooldown: 5, accuracy: 90, power: 0, effects: { atkDebuff: 0.2, duration: 3 }, desc: 'Breaks the spirit: enemy team −20% damage for 3 rounds.' },
    { name: 'Sonic Boom', learnLevel: 380, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 3, accuracy: 85, power: 30, status: { kind: 'confusion', chance: 35, duration: 2 }, desc: 'Heavy single-target voice burst; 35% chance to Confuse — a confused foe may strike itself.' },
    { name: 'Lullaby', learnLevel: 430, type: 'control', channel: 'voice', target: 'enemy', cooldown: 5, accuracy: 80, power: 0, status: { kind: 'sleep', chance: 35, duration: 3 }, desc: 'Sings the target to actual sleep — 35% chance; a stray hit will wake it.' },
    { name: 'Standing Ovation', learnLevel: 540, type: 'buff', channel: 'support', target: 'team', cooldown: 6, accuracy: 100, power: 0, effects: { atkBuff: 0.18, accBuff: 8, hpRegenBuff: 3, duration: 3 }, desc: 'Feeds on applause: team +18% damage, +8% accuracy, +3 HP regen/turn for 3 rounds.' },
    { name: 'Cacophony', learnLevel: 650, type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 5, accuracy: 82, power: 26, status: { kind: 'charm', chance: 15, duration: 2 }, desc: 'Voice AoE; 15% chance to Charm — a charmed foe turns on its own team.' },
    { name: "Siren's Call", learnLevel: 780, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 5, accuracy: 85, power: 34, effects: { manaBurn: 15, bonusVsStatus: { kind: 'fear', mult: 1.5, consume: true } }, desc: 'Irresistible song that scatters focus (burns MP); 1.5× and shatters their courage if they\'re Afraid.' },
    { name: 'Showstopper', learnLevel: 850, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 5, accuracy: 88, power: 40, effects: { execute: 0.35 }, desc: 'The closing number: 1.5× vs weakened foes.' },
    { name: 'Crescendo', learnLevel: 920, type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 7, accuracy: 80, power: 52, desc: 'Massive voice AoE finisher.' },
  ],
}

export const ALL_MOVES: Move[] = (Object.keys(POOLS) as Stat[]).flatMap((stat) =>
  POOLS[stat].map((row, i) => ({
    ...row,
    id: `${stat}-${i}`,
    stat,
  })),
)

export const MOVES_BY_ID: Record<string, Move> = Object.fromEntries(ALL_MOVES.map((m) => [m.id, m]))
