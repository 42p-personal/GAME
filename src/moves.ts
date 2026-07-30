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
import { LINE_OF } from './lines'

type Row = Omit<Move, 'id' | 'stat'>

const POOLS: Record<Stat, Row[]> = {
  // ══ STR ══ executes · shouts · rages · dueling · heavy hitting · combos ══════
  // Three lines (src/lines.ts): BLOODRAGE spends HP as a resource · DUELIST sets up
  // and cashes in single targets · WARCRY is shouts — STR's hard CC arrives through
  // the voice, not the blade, which is what stops it overlapping CHA's damage.
  // ⚠️ mana is priced by EFFECTIVENESS, not derived from power: Blood Price costs
  // 10 MP for 30 power because you pay the rest in blood.
  // ⚠️ `variance` is the half-width of the damage range. A duellist lands where it
  // aimed (0.10); a berserker swinging wild does not (0.25-0.35).
  STR: [
    // ── Bloodrage — HP is the resource; you spend life and race the clock ──────
    { name: 'Scrap', learnLevel: 40, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 1, accuracy: 95, power: 13, mana: 4, variance: 0.15, desc: 'A cheap, scrappy swing — what you throw while the rage builds.' },
    { name: 'Enrage', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, mana: 14, effects: { atkBuff: 0.2, duration: 3 }, desc: 'Works itself into a fury: +20% damage for 3 rounds.' },
    { name: 'Blood Price', learnLevel: 240, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 90, power: 30, mana: 10, variance: 0.2, effects: { recoil: 0.1 }, desc: 'Swung with everything, including what it costs you. Cheap in mana because it is paid for in blood.' },
    { name: 'Reckless Slam', learnLevel: 380, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 85, power: 44, mana: 26, variance: 0.25, element: 'fire', effects: { recoil: 0.1 }, desc: 'A scorching, reckless haymaker; it burns the arm that throws it.' },
    { name: 'Last Stand', learnLevel: 540, type: 'buff', channel: 'support', target: 'self', cooldown: 7, accuracy: 100, power: 0, mana: 30, effects: { atkBuff: 0.3, defBuff: 10, duration: 3 }, desc: 'Digs in and stops retreating: +30% damage and +10 mitigation for 3 rounds.' },
    // ⚠️ hpScale is the ONE effect that already reads the caster's remaining HP,
    // so Blood Fury is the line's payoff ATTACK rather than one more modifier —
    // half damage at full health, more than double on the edge of death.
    { name: 'Blood Fury', learnLevel: 700, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 88, power: 26, mana: 24, variance: 0.3, effects: { hpScale: { atFull: 0.5, atEmpty: 2.1 } }, desc: 'Feeble while it is still whole, and terrifying once it is not — this blow feeds on its own wounds.' },
    { name: 'Titanfall', learnLevel: 920, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 6, accuracy: 80, power: 62, mana: 52, variance: 0.25, effects: { pierce: 0.3, recoil: 0.15 }, desc: 'Colossal blow that partly ignores defence; 15% recoil.' },

    // ── Duelist — precision, armour-break, execute; STR's combo line ───────────
    // ⚠️ Power Strike was the game's damage CEILING at lvl 90, which is why nothing
    // above it ever felt like progress. Cut ~20% so the ladder above it can exist.
    { name: 'Power Strike', learnLevel: 90, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 2, accuracy: 90, power: 24, mana: 16, variance: 0.1, effects: { recoil: 0.05 }, desc: 'A heavy, committed blow, thrown exactly where it was aimed.' },
    { name: 'Sunder', learnLevel: 200, type: 'debuff', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 90, power: 16, mana: 14, variance: 0.1, effects: { defDebuff: 12, duration: 3 }, desc: 'Splits the guard rather than the body: −12 mitigation for 3 rounds. The setup STR never had.' },
    { name: 'Riposte', learnLevel: 260, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, mana: 18, effects: { thorns: 10, defBuff: 4, duration: 2 }, desc: 'Takes the blow to answer it: returns 10 damage on every hit for 2 rounds.' },
    { name: 'Headbutt', learnLevel: 300, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 90, power: 25, mana: 16, variance: 0.15, status: { kind: 'stun', chance: 30, duration: 1 }, desc: 'Short, ugly, and it rings their bell.' },
    { name: 'Bonebreaker', learnLevel: 330, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 85, power: 28, mana: 22, variance: 0.15, effects: { defDebuff: 8, duration: 3 }, status: { kind: 'vulnerable', chance: 45, duration: 2 }, desc: 'Shatters defence and leaves them open — the opener Executioner is waiting on.' },
    { name: 'Rend', learnLevel: 480, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 22, mana: 18, variance: 0.15, status: { kind: 'bleed', chance: 55, duration: 3 }, desc: 'Opens a wound that keeps opening. Bleed here; Bonebreaker handles armour.' },
    { name: 'Bloodletter', learnLevel: 780, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 5, accuracy: 85, power: 10, mana: 30, variance: 0.35, effects: { hits: [3, 5], bonusVsStatus: { kind: 'bleed', mult: 2.5, consume: true } }, desc: 'A weak flurry, 3–5 strikes — unless the target is Bleeding, and then it drinks the wound.' },
    { name: 'Executioner', learnLevel: 850, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 4, accuracy: 90, power: 32, mana: 28, variance: 0.1, effects: { execute: 0.35, bonusVsStatus: { kind: 'vulnerable', mult: 1.8, consume: true } }, desc: 'The closing blow: brutal against the weakened, and devastating against the Vulnerable.' },

    // ── Warcry — shouts. STR's hard CC comes through the voice ────────────────
    { name: 'Guard', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, mana: 6, effects: { guard: 8 }, desc: 'Brace against the next hits.' },
    { name: 'Cleave', learnLevel: 160, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 26, mana: 22, variance: 0.2, desc: 'A horizontal sweep through everything in front of it — weak into one body, brutal into three.' },
    { name: 'Intimidate', learnLevel: 220, type: 'debuff', channel: 'voice', target: 'allEnemies', cooldown: 5, accuracy: 95, power: 0, mana: 20, effects: { atkDebuff: 0.1, duration: 2 }, status: { kind: 'fear', chance: 35, duration: 2 }, desc: 'A roar with a body behind it: the nearest of them break and run.' },
    { name: 'Challenge', learnLevel: 400, type: 'debuff', channel: 'voice', target: 'enemy', cooldown: 4, accuracy: 100, power: 0, mana: 16, effects: { tauntForce: true, atkDebuff: 0.12, duration: 3 }, desc: 'Singles one out and dares it. It comes for you, and it swings softer for the insult.' },
    { name: 'Bracer', learnLevel: 560, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, mana: 20, effects: { guard: 14 }, desc: 'A hard defensive set — Guard is the cheap answer, this is the committed one.' },
    { name: 'Whirlwind', learnLevel: 600, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 4, accuracy: 88, power: 30, mana: 34, variance: 0.2, desc: 'Spins through everything within reach. Pure volume, no rider.' },
    { name: 'Earthshaker', learnLevel: 650, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 5, accuracy: 80, power: 38, mana: 40, variance: 0.25, element: 'earth', status: { kind: 'stun', chance: 30, duration: 1 }, desc: 'A shockwave that fells whatever is standing near it.' },
    { name: "Warlord's Roar", learnLevel: 820, type: 'buff', channel: 'support', target: 'team', cooldown: 6, accuracy: 100, power: 0, mana: 44, effects: { atkBuff: 0.18, accBuff: 6, duration: 3 }, desc: "STR's one team buff, and of course it is a shout: the whole line hits harder and truer for 3 rounds." },
  ],
  // ══ DEX ══ buildup · poisons · stealths · ranged · volleys · multishots ══════
  // ASSASSIN is stealth -> burst -> vanish, where each piece needs the one before
  // it. VENOMCRAFT builds poison up and then cashes it in. VOLLEY is volume and
  // variance — it owns the widest damage ranges in the game, which is DEX's
  // "gambler" identity expressed mechanically instead of in flavour text.
  DEX: [
    // ── Assassin — stealth, reach the back line, kill one thing, leave ────────
    { name: 'Shadowstep', learnLevel: 120, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 4, accuracy: 92, power: 30, mana: 16, variance: 0.15, desc: 'Steps through the shadow behind them. The only reliable way past a front line.' },
    { name: 'Ambush', learnLevel: 200, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 92, power: 26, mana: 18, variance: 0.2, effects: { firstStrikeMult: 1.5 }, desc: 'Devastating on someone who has not swung yet — worthless once they have seen you.' },
    { name: 'Vanish', learnLevel: 300, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, mana: 22, effects: { dodgeBuff: 20, duration: 2 }, desc: 'Gone. Attackers lose interest and swing at whoever is left.' },
    { name: 'Smoke Bomb', learnLevel: 340, type: 'debuff', channel: 'ranged', target: 'allEnemies', cooldown: 5, accuracy: 100, power: 0, mana: 20, effects: { accDebuff: 14, duration: 2 }, status: { kind: 'blind', chance: 50, duration: 2 }, desc: 'Blinds everything close and covers the exit — the setup Ambush wants.' },
    { name: 'Hamstring', learnLevel: 420, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 90, power: 26, mana: 16, variance: 0.15, desc: 'Cuts the leg out from under them. They keep fighting; they stop leaving.' },
    { name: 'Throat Cut', learnLevel: 600, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 5, accuracy: 90, power: 36, mana: 30, variance: 0.1, status: { kind: 'silence', chance: 55, duration: 2 }, desc: 'Quiet, precise, and it ends the casting. What the Assassin line exists to do.' },
    { name: 'Heartseeker', learnLevel: 850, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 4, accuracy: 92, power: 15, mana: 26, variance: 0.3, effects: { hits: [2, 3], execute: 0.35 }, desc: 'Two or three finding strikes, lethal against anything already failing.' },

    // ── Venomcraft — put poison on, keep it there, then detonate it ───────────
    { name: 'Piercing Shot', learnLevel: 90, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 90, power: 18, mana: 14, variance: 0.2, effects: { hits: [1, 2], spreadStatus: { kind: 'poison', targets: 1, chance: 20 } }, status: { kind: 'poison', chance: 45, duration: 3 }, desc: 'One or two venom-tipped shots, and the venom may pass to a neighbour.' },
    { name: 'Toxin Stack', learnLevel: 180, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 92, power: 18, mana: 10, variance: 0.15, status: { kind: 'poison', chance: 70, duration: 4 }, desc: 'A cheap second dose. Poison is the point; the dart barely matters.' },
    { name: 'Twin Fangs', learnLevel: 280, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 2, accuracy: 90, power: 11, mana: 14, variance: 0.25, effects: { hits: [2, 2] }, status: { kind: 'bleed', chance: 35, duration: 3 }, desc: 'Two quick shots that open a wound — bleed here, poison everywhere else in the line.' },
    { name: 'Paralytic Dart', learnLevel: 400, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 4, accuracy: 90, power: 30, mana: 22, variance: 0.15, status: { kind: 'stun', chance: 35, duration: 1 }, desc: "DEX's one hard control: a neurotoxin that drops them where they stand." },
    { name: 'Virulence', learnLevel: 560, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 5, accuracy: 90, power: 26, mana: 20, variance: 0.2, effects: { bonusVsStatus: { kind: 'poison', mult: 2.6, consume: true } }, desc: 'Feeble on clean blood, ruinous on poisoned — the payoff the whole line builds toward.' },
    { name: 'Plague Shot', learnLevel: 740, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 5, accuracy: 85, power: 20, mana: 34, variance: 0.2, effects: { spreadStatus: { kind: 'poison', targets: 2, chance: 40 } }, status: { kind: 'poison', chance: 55, duration: 4 }, desc: 'Poison that jumps between bodies. It rewards an enemy that stands together.' },

    // ── Volley — volume and variance. The widest damage ranges in the game ────
    { name: 'Sling', learnLevel: 40, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, mana: 5, variance: 0.3, effects: { hits: [1, 2] }, desc: 'One or two quick shots. Cheap enough to throw all day.' },
    { name: 'Sidestep', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, mana: 8, effects: { dodgeBuff: 14, duration: 2 }, desc: 'Footwork. Small, cheap, and always available.' },
    { name: 'Acrobatics', learnLevel: 160, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, mana: 12, effects: { dodgeBuff: 30, duration: 1 }, desc: 'A tumbling, weaving burst — almost untouchable, but only for a moment.' },
    { name: 'Focus Aim', learnLevel: 240, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, mana: 14, effects: { accBuff: 18, duration: 3 }, desc: 'Steadies the breathing. The gambler choosing, briefly, not to gamble.' },
    { name: 'Pin Down', learnLevel: 330, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 88, power: 28, mana: 18, variance: 0.15, desc: 'Suppressing fire that drags them out of position and holds them there.' },
    // ⚠️ The widest range in the game — 1 to 6 hits AND a 0.5 spread on top. This
    // is the DEX identity as a single move: it can whiff or it can delete someone.
    { name: "Gambler's Volley", learnLevel: 470, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 3, accuracy: 85, power: 8, mana: 20, variance: 0.5, effects: { hits: [1, 6] }, desc: 'Everything in the quiver, all at once, aimed roughly. Anywhere from a scratch to a slaughter.' },
    { name: 'Ricochet', learnLevel: 500, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 4, accuracy: 88, power: 18, mana: 26, variance: 0.3, effects: { hits: [1, 2] }, desc: 'One shot, several bodies. It bounces, and it does not much care whose.' },
    { name: 'Rain of Arrows', learnLevel: 650, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 5, accuracy: 85, power: 24, mana: 34, variance: 0.25, desc: 'A bombardment onto a chosen patch of ground — it punishes standing together.' },
    { name: 'Pinning Volley', learnLevel: 680, type: 'damage', channel: 'ranged', target: 'allEnemies', cooldown: 5, accuracy: 88, power: 22, mana: 32, variance: 0.2, desc: 'Nails several of them to the spot at once.' },
    // ⚠️ The lowest variance in the game (0.05), and deliberately so: the capstone
    // marksman is where the gambler finally stops gambling.
    { name: 'Deadeye', learnLevel: 920, type: 'damage', channel: 'ranged', target: 'enemy', cooldown: 6, accuracy: 95, power: 52, mana: 44, variance: 0.05, desc: 'One shot. It goes exactly where it was sent.' },
  ],
  CON: [
    { name: 'Brace', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 2, accuracy: 100, power: 0, effects: { guard: 6 }, desc: 'Small flat damage reduction until next action.' },
    { name: 'Second Wind', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 16, desc: 'Catch a breath: heal a little HP.' },
    { name: 'Taunt', learnLevel: 90, type: 'debuff', channel: 'support', target: 'enemy', cooldown: 4, accuracy: 100, power: 0, effects: { atkDebuff: 0.1, duration: 3, tauntForce: true }, desc: 'Enrages and forces the target to attack the taunter for 3 rounds (−10% damage while enraged).' },
    // ⚠️ CON's four TEAM/ALLY buffs. The stat had TEN buffs and every one was
    // `self`, so a Tank or Spellshield literally could not protect anybody — the
    // biggest hole the class-kit audit found. These are the same effects pointed
    // outward, and they are UNCAPPED (every ally, no target limit) with the
    // authored `mana` doing the pricing instead. See ABILITY_REWORK.md §3c.
    { name: 'Barbed Carapace', learnLevel: 120, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, mana: 24, effects: { defBuff: 4, thorns: 6, duration: 3 }, desc: 'The whole line bristles: +4 mitigation and reflects 6 damage per hit for 3 rounds.' },
    { name: 'Body Slam', learnLevel: 160, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, status: { kind: 'knockback', chance: 40, duration: 2 }, desc: 'Throws its bulk into the target; 40% chance to send it reeling — knocked back, it acts last.' },
    { name: 'Steady Vigil', learnLevel: 200, type: 'buff', channel: 'support', target: 'ally', cooldown: 4, accuracy: 100, power: 20, mana: 18, effects: { hpRegenBuff: 5, duration: 3 }, desc: 'Stands over a wounded ally: solid heal, then +5 HP regen/turn for 3 rounds.' },
    // ⚠️ SEIZE — CON's grab. `pull` + `root` are registered in
    // tamerengine/spatial.ts, NOT inline: `spatialOf` only reads the name-keyed
    // table, so an inline `spatial` on a POOL move is silently inert (the exact
    // way 8 spatial entries once did nothing). Rename here => rename there.
    { name: 'Seize', learnLevel: 160, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 90, power: 17, mana: 14, status: { kind: 'knockback', chance: 55, duration: 2 }, desc: 'Clamps on and hauls the target in, pinning it in place for a moment — it can still fight, but it cannot leave.' },
    { name: 'Bastion', learnLevel: 240, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { ward: 25 }, desc: 'Raise a 25 HP absorb shield.' },
    { name: 'Purge', learnLevel: 330, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 10, effects: { cleanse: true }, desc: 'Shrug off ailments and mend a little.' },
    { name: 'Shell Slam', learnLevel: 380, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 3, accuracy: 85, power: 26, effects: { recoil: 0.1, hpScale: { atFull: 1.4, atEmpty: 0.8 } }, desc: 'Full-body crash; slight recoil. Hits hardest while the shell is whole, and weakens as its own health fails.' },
    { name: 'Fortify', learnLevel: 430, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, mana: 44, effects: { ward: 40 }, desc: 'Raise a 40 HP absorb shield on every ally.' },
    // ⚠️ SHIELD WALL — the Warden's ground denial. A `zone` is placed by
    // applySelfEffects at CAST time, so unlike root/slow it works on a utility
    // that never "hits". Zone `power` for a slow zone is the speed MULTIPLIER
    // (0.55 = 55% speed), not a magnitude — see the zone tick in engine.ts.
    // ⚠️ First authored with NO `effects` at all — its whole payload was the
    // spatial zone, which made it inert in the TURN engine (which has no zones)
    // and invisible to every loadout predicate, since those read `effects`. A
    // move must carry its identity in the shared data, not only in a field-only
    // side table. The guard is what a shield wall obviously is; the zone is the
    // field's extra expression of it.
    { name: 'Shield Wall', learnLevel: 240, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 0, mana: 30, effects: { guard: 14 }, desc: 'Plants a wall of shields and holds it: +14 flat mitigation, and the ground around this monster becomes a slog for anything that closes in.' },
    { name: 'Stone Wall', learnLevel: 540, type: 'buff', channel: 'support', target: 'team', cooldown: 6, accuracy: 100, power: 0, mana: 48, effects: { defBuff: 8, duration: 3 }, desc: 'Living rampart: +8 mitigation for the whole team for 3 rounds.' },
    { name: 'Quagmire Stomp', learnLevel: 300, type: 'damage', channel: 'melee', target: 'allEnemies', cooldown: 5, accuracy: 85, power: 22, mana: 30, status: { kind: 'knockback', chance: 45, duration: 2 }, desc: 'Stomps hard enough to churn the footing out from under the whole enemy line — they wade for a while afterwards.' },
    { name: "Bulwark's Challenge", learnLevel: 650, type: 'debuff', channel: 'support', target: 'allEnemies', cooldown: 6, accuracy: 100, power: 0, effects: { guard: 20, tauntForce: true, duration: 2 }, desc: 'Plants its feet and roars a challenge: massive guard, and forces the WHOLE enemy team to attack it for 2 rounds.' },
    { name: 'Vital Surge', learnLevel: 780, type: 'buff', channel: 'support', target: 'self', cooldown: 6, accuracy: 100, power: 46, effects: { cleanse: true }, desc: 'Big heal + cleanse ailments.' },
    { name: 'Colossus Crash', learnLevel: 850, type: 'damage', channel: 'melee', target: 'enemy', cooldown: 5, accuracy: 85, power: 36, effects: { guard: 10, maxHpDmg: 0.03, consumeWard: 0.015 }, desc: 'Crushing advance that braces after the hit; extra damage scaled off the target\'s own max HP.' },
    { name: 'Undying', learnLevel: 920, type: 'buff', channel: 'support', target: 'self', cooldown: 8, accuracy: 100, power: 70, desc: 'Refuses to fall: massive recovery.' },
  ],
  WIS: [
    { name: 'Focus', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, effects: { regenBuff: 2, duration: 3 }, desc: 'Centre the mind: +2 mana regen for 3 rounds.' },
    { name: 'Mend', learnLevel: 40, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 14, desc: 'Soothing focus: heal a little HP.' },
    { name: 'Mana Sap', learnLevel: 90, type: 'damage', channel: 'support', target: 'enemy', cooldown: 2, accuracy: 92, power: 11, effects: { manaBurn: 10 }, desc: 'Light hit that drinks 10 MP from the target.' },
    { name: 'Clarity', learnLevel: 120, type: 'buff', channel: 'support', target: 'self', cooldown: 3, accuracy: 100, power: 0, effects: { cleanse: true }, desc: 'A clear mind: remove ailments.' },
    { name: 'Serenity', learnLevel: 160, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { dodgeBuff: 6, regenBuff: 2, duration: 3 }, desc: 'Calm flow: +6% dodge, +2 regen for 3 rounds.' },
    { name: 'Silencing Spike', learnLevel: 200, type: 'damage', channel: 'support', target: 'enemy', cooldown: 2, accuracy: 90, power: 18, effects: { manaBurn: 13 }, status: { kind: 'silence', chance: 25, duration: 2 }, desc: 'Psychic jab that burns 13 MP; 25% chance to Silence.' },
    { name: 'Attunement', learnLevel: 240, type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, effects: { regenBuff: 3, duration: 3 }, desc: "Links the team's focus: everyone regains more mana for 3 rounds." },
    { name: 'Mage Armour', learnLevel: 160, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, mana: 16, effects: { ward: 30, defBuff: 12, duration: 3 }, desc: 'Woven force settles over the caster: a 30 HP absorb shield and +12 mitigation for 3 rounds.' },
    { name: 'Insight', learnLevel: 330, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, effects: { accBuff: 12, duration: 3 }, desc: 'Read the fight: +12% accuracy for 3 rounds.' },
    { name: 'Drain Spirit', learnLevel: 380, type: 'damage', channel: 'support', target: 'enemy', cooldown: 4, accuracy: 88, power: 20, effects: { manaBurn: 15, lifesteal: 0.3 }, desc: 'Drinks 15 MP and heals for part of the damage.' },
    { name: 'Tranquility', learnLevel: 430, type: 'buff', channel: 'support', target: 'ally', cooldown: 5, accuracy: 100, power: 32, desc: 'Deep restorative calm channelled into an ally: strong heal.' },
    { name: 'Field of Doom', learnLevel: 540, type: 'debuff', channel: 'support', target: 'enemy', cooldown: 5, accuracy: 95, power: 0, effects: { atkDebuff: 0.15, duration: 3 }, status: { kind: 'doom', chance: 28, duration: 4 }, desc: 'Dampening field: target deals −15% damage for 3 rounds; 28% chance to seal its Doom.' },
    // ⚠️ Ward Against Ruin's team heal is PAID FOR with cooldown 6 -> 7. Healing has
    // NO AoE falloff (that applies to damage only), so a team heal scales linearly
    // with team size: 18 each is 54 at 3v3 but 108 at 6v6 off a single cast. The
    // modest per-head number plus the longer cooldown are what keep it from
    // outclassing Tranquility (lv430, one ally, 32) and preserve the WIS healing
    // ladder: self (Mend 14) -> one ally (Tranquility 32) -> whole team (18 each).
    { name: 'Ward Against Ruin', learnLevel: 650, type: 'buff', channel: 'support', target: 'team', cooldown: 7, accuracy: 100, power: 18, effects: { cleanse: true, regenBuff: 3, duration: 3 }, desc: "Clears the whole team's ailments — confusion, charm, doom, silence, sleep, healblock, all of it — mends 18 HP each, and steadies their focus for 3 rounds." },
    { name: 'Mind Crush', learnLevel: 780, type: 'damage', channel: 'support', target: 'enemy', cooldown: 5, accuracy: 85, power: 36, effects: { manaBurn: 25, bonusVsStatus: { kind: 'doom', mult: 1.6, consume: true } }, desc: 'Heavy psychic blow; burns 25 MP. 1.6× and detonates the target\'s Doom early if it has one.' },
    { name: 'Providence', learnLevel: 850, type: 'buff', channel: 'support', target: 'self', cooldown: 7, accuracy: 100, power: 0, effects: { dodgeBuff: 12, accBuff: 12, duration: 4 }, desc: 'Sees what comes: +12% dodge and accuracy for 4 rounds.' },
    { name: 'Ascendance', learnLevel: 920, type: 'buff', channel: 'support', target: 'self', cooldown: 8, accuracy: 100, power: 0, effects: { atkBuff: 0.25, regenBuff: 4, duration: 4 }, desc: 'Transcendent state: +25% damage, +4 regen for 4 rounds.' },
  ],
  INT: [
    { name: 'Spark', learnLevel: 40, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 1, accuracy: 95, power: 13, element: 'air', desc: 'Small air bolt.' },
    { name: 'Ember', learnLevel: 40, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 12, element: 'fire', status: { kind: 'burn', chance: 40, duration: 3 }, desc: 'Minor fire; 40% chance to Burn.' },
    // ⚠️ Ember deliberately does NOT spread its burn, despite being the most
    // thematically obvious carrier for contagion. It is the cheapest INT move and
    // therefore the most-equipped move in the game — 8 of the 14 golden monsters
    // run it. Adding a spread here was tried and moved THREE goldens including two
    // winner flips and a draw: it is not a move buff, it is global power creep.
    // Contagion belongs on moves a player CHOOSES, not on the default.,
    { name: 'Frost Shard', learnLevel: 90, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, element: 'water', desc: 'Icy dart.' },
    { name: 'Fracturing Stones', learnLevel: 120, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 2, accuracy: 90, power: 20, element: 'earth', status: { kind: 'vulnerable', chance: 30, duration: 3 }, desc: 'A stinging barrage of stone shards; 30% chance to crack their guard, leaving them Vulnerable.' },
    // ⚠️ INT's first non-damage moves ever. The pool was 15/15 damage — a Wizard
    // or Spellsword had no way to protect, empower, or hold anything, which is
    // why "mages can use roots and slows" needed authoring, not just engine work.
    { name: 'Arcane Aegis', learnLevel: 120, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, mana: 30, effects: { ward: 22 }, desc: 'Spins a lattice of force around the whole team: each ally gains a 22 HP absorb shield.' },
    { name: 'Rime Bind', learnLevel: 160, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 90, power: 27, element: 'water', mana: 16, status: { kind: 'knockback', chance: 50, duration: 2 }, desc: 'Ice climbs the target\'s legs and sets — it can still cast and swing, but it is going nowhere.' },
    { name: 'Thunderclap', learnLevel: 160, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 27, element: 'air', effects: { firstStrikeMult: 1.35 }, desc: 'Lightning hit; 1.35× damage if this monster acted before the target this round.' },
    { name: 'Frost Nova', learnLevel: 280, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 85, power: 20, element: 'water', mana: 26, status: { kind: 'knockback', chance: 40, duration: 2 }, desc: 'A ring of hoarfrost bursts outward, chilling every foe stiff and slow.' },
    { name: 'Cinderburst', learnLevel: 200, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 28, element: 'fire', effects: { bonusVsStatus: { kind: 'burn', mult: 1.5, consume: true } }, desc: 'Solid single-target fire burst; 1.5× and snuffs the flame if the target is already Burning.' },
    { name: 'Stone Spear', learnLevel: 240, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 85, power: 30, element: 'earth', effects: { pierce: 0.25 }, desc: 'Earth lance that punches through defence.' },
    { name: 'Static Chain', learnLevel: 330, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 85, power: 24, element: 'air', status: { kind: 'vulnerable', chance: 20, duration: 2 }, desc: 'Bolt that arcs across all foes; 20% chance to leave each Vulnerable.' },
    { name: 'Mana Leech', learnLevel: 380, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 3, accuracy: 88, power: 29, effects: { manaBurn: 12, lifesteal: 0.25 }, desc: 'Arcane siphon: burns MP, heals the caster.' },
    { name: 'Elemental Infusion', learnLevel: 240, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, mana: 36, effects: { atkBuff: 0.16, accBuff: 6, duration: 3 }, desc: "Charges every ally's strikes with raw element: team +16% damage and +6% accuracy for 3 rounds." },
    { name: 'Inferno', learnLevel: 430, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 4, accuracy: 82, power: 26, element: 'fire', status: { kind: 'burn', chance: 25, duration: 3 }, desc: 'Fire AoE; 25% chance to Burn.' },
    { name: 'Mirror Image', learnLevel: 250, type: 'buff', channel: 'support', target: 'self', cooldown: 5, accuracy: 100, power: 0, mana: 20, effects: { dodgeBuff: 14, duration: 3 }, desc: 'Splits into shimmering duplicates: +14% dodge for 3 rounds as attacks find the wrong one.' },
    { name: 'Glacial Prison', learnLevel: 540, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 5, accuracy: 85, power: 43, element: 'water', status: { kind: 'stun', chance: 25, duration: 1 }, desc: 'Entombs in ice, 25% stun chance.' },
    { name: 'Deep Freeze', learnLevel: 650, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 5, accuracy: 80, power: 32, element: 'water', effects: { pierce: 0.2 }, desc: 'Freezing AoE storm that punches through frozen armour.' },
    { name: 'Void Lance', learnLevel: 780, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 5, accuracy: 85, power: 44, effects: { pierce: 0.5 }, desc: 'Pure void: half of defence ignored.' },
    { name: 'Arcane Overload', learnLevel: 850, type: 'damage', channel: 'magic', target: 'enemy', cooldown: 6, accuracy: 85, power: 52, effects: { recoil: 0.15 }, desc: 'Overchannelled blast; the caster burns too.' },
    { name: 'World Ender', learnLevel: 920, type: 'damage', channel: 'magic', target: 'allEnemies', cooldown: 7, accuracy: 78, power: 56, element: 'earth', effects: { maxHpDmg: 0.02 }, desc: 'Massive earth AoE nuke; extra damage to each target scaled off its own max HP.' },
  ],
  CHA: [
    { name: 'Taunt Cry', learnLevel: 40, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 1, accuracy: 95, power: 10, desc: 'Light voice damage + minor aggro.' },
    { name: 'Discord', learnLevel: 40, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 2, accuracy: 90, power: 14, status: { kind: 'blind', chance: 45, duration: 3 }, desc: 'Jarring note; 45% chance to Blind.' },
    { name: 'Rallying Song', learnLevel: 90, type: 'buff', channel: 'support', target: 'team', cooldown: 4, accuracy: 100, power: 0, effects: { atkBuff: 0.1, duration: 3 }, desc: 'Stirring tune: team +10% damage for 3 rounds.' },
    { name: 'Grand Mockery', learnLevel: 120, type: 'debuff', channel: 'voice', target: 'allEnemies', cooldown: 4, accuracy: 95, power: 0, effects: { atkDebuff: 0.12, duration: 3 }, status: { kind: 'healblock', chance: 20, duration: 2 }, desc: 'Cutting jeer: enemy team −12% damage for 3 rounds; 20% chance their wounds won\'t close.' },
    // ⚠️ CHA's self-protection. The audit reported "zero self-buffs", which was
    // PARTLY a measurement artifact — it counted `target: 'self'` only, and CHA's
    // three team buffs already include the caster (the crowd is every living
    // ally, caster included). What was genuinely missing was a DEFENSIVE option
    // for a class with the weakest damage tier: Bravura is that, and Hymn of
    // Shields is the uncapped team version that covers the bard too.
    { name: 'Bravura', learnLevel: 140, type: 'buff', channel: 'support', target: 'self', cooldown: 4, accuracy: 100, power: 0, mana: 16, effects: { ward: 20, dodgeBuff: 8, duration: 3 }, desc: 'Performs straight through the danger: a 20 HP absorb shield and +8% dodge for 3 rounds.' },
    { name: 'Screech', learnLevel: 160, type: 'damage', channel: 'voice', target: 'allEnemies', cooldown: 3, accuracy: 85, power: 14, status: { kind: 'fear', chance: 20, duration: 2 }, desc: 'Voice AoE; 20% chance to inflict Fear for 2 rounds.' },
    { name: 'Hymn of Shields', learnLevel: 260, type: 'buff', channel: 'support', target: 'team', cooldown: 6, accuracy: 100, power: 0, mana: 38, effects: { ward: 26, guard: 5, duration: 3 }, desc: 'A swelling hymn that armours everyone who can hear it, the singer included: 26 HP of shield and +5 flat mitigation each.' },
    { name: 'Captivate', learnLevel: 200, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 3, accuracy: 88, power: 18, effects: { lifesteal: 0.4 }, desc: 'Feeds on adoration: heals 40% of damage.' },
    { name: 'Battle Hymn', learnLevel: 240, type: 'buff', channel: 'support', target: 'team', cooldown: 5, accuracy: 100, power: 0, effects: { dodgeBuff: 5, regenBuff: 2, duration: 3 }, status: { kind: 'haste', chance: 100, duration: 2 }, desc: 'Steadying anthem: team +5% dodge, +2 regen for 3 rounds — and the whole team acts first next round.' },
    { name: 'Demoralize', learnLevel: 330, type: 'debuff', channel: 'voice', target: 'allEnemies', cooldown: 5, accuracy: 90, power: 0, effects: { atkDebuff: 0.2, duration: 3 }, desc: 'Breaks the spirit: enemy team −20% damage for 3 rounds.' },
    { name: 'Sonic Boom', learnLevel: 380, type: 'damage', channel: 'voice', target: 'enemy', cooldown: 4, accuracy: 85, power: 30, status: { kind: 'confusion', chance: 35, duration: 2 }, effects: { spreadStatus: { kind: 'confusion', targets: 1, chance: 25 } }, desc: 'Heavy voice burst; 35% chance to Confuse, the disorientation carrying to a neighbour.' },
    { name: 'Lullaby', learnLevel: 430, type: 'control', channel: 'voice', target: 'enemy', cooldown: 5, accuracy: 80, power: 0, status: { kind: 'sleep', chance: 35, duration: 3 }, effects: { spreadStatus: { kind: 'sleep', targets: 1, chance: 25 } }, desc: 'Sings the target to actual sleep — 35% chance, and drowsiness is catching; a stray hit will wake either.' },
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
    // The line this move belongs to, from the single lookup in `lines.ts`. See
    // that file for why the pool needs lines at all — three separate waves of
    // authored content were silently unreachable without them.
    line: LINE_OF[row.name],
  })),
)

export const MOVES_BY_ID: Record<string, Move> = Object.fromEntries(ALL_MOVES.map((m) => [m.id, m]))
