// The 60-skill shared learned-move pool (§7.5). 10 per stat at the learn ladder.
// Values (cooldown / accuracy / power / status) are first-pass and meant for tuning.
import { LEARN_LADDER, Move, Stat } from './core'

type Row = Omit<Move, 'id' | 'stat' | 'learnLevel'>

// Ten rows per stat, in learn-ladder order (index 0..9 -> level 40..920).
const POOLS: Record<Stat, Row[]> = {
  STR: [
    { name: 'Jab', type: 'damage', channel: 'melee', target: 'enemy', cooldown: 1, accuracy: 95, power: 12, desc: 'Quick light melee hit.' },
    { name: 'Guard', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Block: reduce the next incoming physical hit.' },
    { name: 'Power Strike', type: 'damage', channel: 'melee', target: 'enemy', cooldown: 2, accuracy: 90, power: 28, desc: 'Heavy single-target melee blow.' },
    { name: 'Cleave', type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 22, desc: 'Melee hit that splashes to all foes.' },
    { name: 'Crushing Blow', type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 26, desc: 'Melee that lowers the target’s defence.' },
    { name: 'Bracer', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'Raises physical defence for the battle.' },
    { name: 'Earthshaker', type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 4, accuracy: 80, power: 24, status: { kind: 'stun', chance: 30, duration: 1 }, desc: 'Melee AoE with a brief stun.' },
    { name: 'Sunder Armor', type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 30, desc: 'Melee that ignores a % of defence.' },
    { name: 'Berserk', type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, desc: 'Trade defence for a large melee-damage boost.' },
    { name: 'Titanfall', type: 'damage', channel: 'melee', target: 'enemy', cooldown: 5, accuracy: 80, power: 55, desc: 'Massive single-target melee finisher.' },
  ],
  DEX: [
    { name: 'Sling', type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, desc: 'Light ranged shot.' },
    { name: 'Sidestep', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Small dodge-chance buff.' },
    { name: 'Piercing Shot', type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, status: { kind: 'poison', chance: 60, duration: 3 }, desc: 'Venom-tipped ranged hit; applies Poison.' },
    { name: 'Twin Shot', type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 88, power: 24, desc: 'Two quick ranged hits.' },
    { name: 'Blur', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'High dodge for a few ticks.' },
    { name: 'Snipe', type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 80, power: 34, desc: 'High-damage single ranged, slow windup.' },
    { name: 'Volley', type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 20, desc: 'Light ranged AoE.' },
    { name: 'Riposte', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Counter a dodged attack with a ranged hit.' },
    { name: 'Rain of Arrows', type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 30, desc: 'Sustained ranged AoE.' },
    { name: 'Deadeye', type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 5, accuracy: 90, power: 48, desc: 'Near-guaranteed critical ranged shot.' },
  ],
  CON: [
    { name: 'Brace', type: 'buff', channel: 'support', target: 'self', cooldown: 2, accuracy: 100, power: 0, desc: 'Small flat damage reduction this turn.' },
    { name: 'Second Wind', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 18, desc: 'Heal a little HP.' },
    { name: 'Taunt', type: 'control', channel: 'support', target: 'enemy', cooldown: 3, accuracy: 100, power: 0, desc: 'Force enemies to target this monster.' },
    { name: 'Iron Skin', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'Passive HP / defence bump.' },
    { name: 'Regenerate', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 12, desc: 'Heal over time.' },
    { name: 'Bulwark', type: 'buff', channel: 'support', target: 'ally', cooldown: 4, accuracy: 100, power: 0, desc: 'Soak damage aimed at an ally.' },
    { name: 'Last Stand', type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, desc: 'Survive one lethal hit at 1 HP.' },
    { name: 'Fortify', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'Large shield absorbing damage.' },
    { name: 'Vital Surge', type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 40, desc: 'Big heal + cleanse debuffs.' },
    { name: 'Undying', type: 'buff', channel: 'support', target: 'self', cooldown: 7, accuracy: 100, power: 0, desc: 'Auto-heal when dropping below a HP threshold.' },
  ],
  WIS: [
    { name: 'Focus', type: 'buff', channel: 'support', target: 'self', cooldown: 2, accuracy: 100, power: 0, desc: 'Restore a little mana.' },
    { name: 'Meditate', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Mana-regen buff.' },
    { name: 'Cleanse', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Remove a debuff.' },
    { name: 'Empower', type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, desc: 'Buff the next move.' },
    { name: 'Mana Font', type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, desc: 'Team mana-regen aura.' },
    { name: 'Barrier', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'Magic-damage shield.' },
    { name: 'Haste', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, desc: 'Speed up actions.' },
    { name: 'Channel', type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 30, desc: 'Convert mana into a heal.' },
    { name: 'Arcane Insight', type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, desc: 'Big mana battery + cooldown reset.' },
    { name: 'Ascendance', type: 'buff', channel: 'support', target: 'self', cooldown: 7, accuracy: 100, power: 0, desc: 'Power surge for a few ticks.' },
  ],
  INT: [
    { name: 'Spark', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 1, accuracy: 95, power: 12, element: 'air', desc: 'Small air bolt.' },
    { name: 'Ember', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 14, element: 'fire', status: { kind: 'burn', chance: 70, duration: 3 }, desc: 'Minor fire damage; applies Burn.' },
    { name: 'Frost Shard', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, element: 'water', desc: 'Water/ice hit that slows.' },
    { name: 'Shock', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 22, element: 'air', status: { kind: 'stun', chance: 30, duration: 1 }, desc: 'Air/lightning hit with stun chance.' },
    { name: 'Fireball', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 30, element: 'fire', desc: 'Solid single-target fire burst.' },
    { name: 'Stone Spear', type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 85, power: 34, element: 'earth', desc: 'High earth damage, pierces.' },
    { name: 'Chain Lightning', type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 85, power: 26, element: 'air', desc: 'Air bolt bouncing between foes.' },
    { name: 'Inferno', type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 28, element: 'fire', status: { kind: 'burn', chance: 60, duration: 3 }, desc: 'Fire AoE; applies Burn.' },
    { name: 'Blizzard', type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 5, accuracy: 80, power: 34, element: 'water', desc: 'Water/ice AoE + freeze.' },
    { name: 'Meteor', type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 6, accuracy: 78, power: 52, element: 'earth', desc: 'Massive earth AoE nuke.' },
  ],
  CHA: [
    { name: 'Taunt Cry', type: 'damage', channel: 'voice', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, desc: 'Light voice damage + minor aggro.' },
    { name: 'Discord', type: 'damage', channel: 'voice', target: 'enemy', cooldown: 2, accuracy: 90, power: 12, status: { kind: 'blind', chance: 70, duration: 3 }, desc: 'Voice hit; applies Blind.' },
    { name: 'War Chant', type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, desc: 'Team attack buff.' },
    { name: 'Screech', type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 16, status: { kind: 'fear', chance: 30, duration: 1 }, desc: 'Voice AoE; chance to inflict Fear.' },
    { name: 'Demoralize', type: 'debuff', channel: 'voice', target: 'enemy', cooldown: 3, accuracy: 90, power: 0, desc: 'Lower enemy attack.' },
    { name: 'Anthem', type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, desc: 'Team defence buff.' },
    { name: 'Sonic Boom', type: 'damage', channel: 'voice', target: 'enemy', cooldown: 3, accuracy: 85, power: 34, desc: 'Heavy single-target voice burst.' },
    { name: 'Lullaby', type: 'control', channel: 'voice', target: 'enemy', cooldown: 4, accuracy: 80, power: 0, status: { kind: 'stun', chance: 50, duration: 2 }, desc: 'Chance to put an enemy to sleep.' },
    { name: 'Cacophony', type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 24, status: { kind: 'confusion', chance: 40, duration: 2 }, desc: 'Voice AoE; applies Confusion.' },
    { name: 'Crescendo', type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 6, accuracy: 80, power: 50, desc: 'Massive voice AoE finisher.' },
  ],
}

export const ALL_MOVES: Move[] = (Object.keys(POOLS) as Stat[]).flatMap((stat) =>
  POOLS[stat].map((row, i) => ({
    ...row,
    id: `${stat}-${i}`,
    stat,
    learnLevel: LEARN_LADDER[i],
  })),
)

export const MOVES_BY_ID: Record<string, Move> = Object.fromEntries(ALL_MOVES.map((m) => [m.id, m]))
