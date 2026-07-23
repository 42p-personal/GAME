// Core types, RNG, and shared game constants for Monster Tamer.
// See docs/GAME_DESIGN.md for the design these mirror.

export type Stat = 'STR' | 'DEX' | 'CON' | 'WIS' | 'INT' | 'CHA'
export const STATS: Stat[] = ['STR', 'DEX', 'CON', 'WIS', 'INT', 'CHA']
export const STAT_NAMES: Record<Stat, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  WIS: 'Wisdom',
  INT: 'Intelligence',
  CHA: 'Charisma',
}
export type Stats = Record<Stat, number>

export type BodyType = 'Mammal' | 'Avian' | 'Marsupial' | 'Aquatic' | 'Insectoid' | 'Reptilian' | 'Draconic' | 'Abyssal' | 'Mythical'
  | 'Saurian' // fusion class: Mammal + Reptilian (FUSION_DESIGN.md)

// Fusion classes (v0.7): body types that only exist as the RESULT of fusion —
// never wild, never in the market. Drives the gen-1 Platinum stat cap and the
// per-monster (not per-species) minor/flaw roll. See FUSION_DESIGN.md.
export const FUSION_BODIES: BodyType[] = ['Saurian']
export const isFusionBody = (b: BodyType): boolean => FUSION_BODIES.includes(b)
export type Sex = 'M' | 'F'

// Training aptitude (user spec 2026-07-23): `minor` is body-type-derived
// (BODY_MINOR below, same stat for every species of that body) — a light
// touch, not real differentiation. `major`/`flaw` are individually authored
// per species (Species.trainingProfile) — this is what actually makes two
// monsters of the same body type train differently. Species without an
// authored `major`/`flaw` (the exclusive body types — Draconic/Abyssal/
// Mythical, not yet migrated) fall back to the legacy derivation (top/2nd/
// lowest base stat) inside game.ts:trainingProfileFor.
export interface TrainingProfile { minor: Stat; major?: Stat; flaw?: Stat }

// What a species DATA ENTRY authors — just major/flaw, never minor (that's
// always derived from the species' body type, not hand-picked). Resolved
// into a full TrainingProfile (with minor filled in) by trainingProfileFor.
export interface AuthoredAptitude { major?: Stat; flaw?: Stat }

// Body type's single minor training bonus (+10%, same for every species of
// that body — see TrainingProfile above). Only the 6 base body types are
// migrated to the new authored-aptitude system so far; the 3 exclusive body
// types intentionally have no entry here and fall back to the legacy system.
export const BODY_MINOR: Partial<Record<BodyType, Stat>> = {
  Mammal: 'STR', Avian: 'WIS', Marsupial: 'CHA', Aquatic: 'INT', Insectoid: 'CON', Reptilian: 'DEX',
}

export type Channel = 'melee' | 'ranged' | 'magic' | 'voice' | 'support'
export type MoveType = 'damage' | 'buff' | 'debuff' | 'status' | 'control'
export type Target = 'enemy' | 'allEnemies' | 'self' | 'ally' | 'team'
export type StatusKind = 'blind' | 'poison' | 'burn' | 'fear' | 'confusion' | 'stun' | 'knockback' | 'bleed' | 'silence' | 'vulnerable'
  | 'sleep' | 'doom' | 'healblock' | 'haste' | 'charm'

export type Element = 'fire' | 'water' | 'earth' | 'air'
export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air']

export type Food =
  | 'vegetables' | 'fruit' | 'meat' | 'sweet treats' // normal (taste-based)
  | 'prime cut' | 'scholars tea' | 'sprinters mix'   // training boosters
  | 'vigor melon' | 'bliss berry' | 'golden truffle'  // premium specials
export type FoodTier = 'normal' | 'training' | 'premium'

export interface MoveStatus { kind: StatusKind; chance: number; duration: number }

// Mechanical effects a skill can carry (battle.ts implements each). Mixing these
// with statuses, elements, targets, cooldowns, and MP costs is where skill
// variety and strategy comes from.
export interface MoveEffects {
  pierce?: number // 0..1 — fraction of the target's mitigation ignored
  lifesteal?: number // 0..1 — fraction of damage dealt returned as HP
  recoil?: number // 0..1 — fraction of damage dealt taken by the user (max 0.15 in practice)
  hits?: [number, number] // multi-hit: strikes N times; `power` is per hit
  execute?: number // 0..1 — 1.5× damage when target HP is below this fraction
  manaBurn?: number // flat MP burned off the target
  guard?: number // flat damage reduction on EVERY hit taken until the user's next action
  ward?: number // absorb shield (HP pool) that soaks damage before health — CON-exclusive
  cleanse?: boolean // remove negative statuses (self, or the whole team if target is 'team')
  tauntForce?: boolean // forces the target's single-target hostile actions onto the caster for `duration` rounds; cast via target 'allEnemies' it taunts the WHOLE enemy team onto one monster
  // --- Synergy/framework effects (2026-07-25 framework pass — engine support
  // built first, moves adopt them in a later pass) ---
  maxHpDmg?: number // 0..1 — bonus damage equal to this fraction of the TARGET's max HP ("giant-killer" tools)
  bonusVsStatus?: { kind: StatusKind; mult: number; consume?: boolean } // setup→payoff combos: extra damage vs a target carrying `kind`; consume removes the status when cashed
  thorns?: number // timed buff: attackers take this much flat damage per hit landed on the wearer (lasts `duration` rounds)
  hpRegenBuff?: number // timed buff: +flat HP regen per turn (lasts `duration` rounds)
  firstStrikeMult?: number // damage multiplier if the TARGET hasn't yet acted this round (attacker moved first in the initiative order) — rewards investing in speed (DEX/haste/knockback) rather than being a status
  // Timed modifiers — ALL of the below last `duration` rounds, then expire and are
  // removed entirely (no more "for the fight" effects). Re-casting the same move
  // refreshes its remaining duration rather than stacking a second copy.
  duration?: number // rounds this move's buff/debuff fields below remain active
  atkBuff?: number // +% damage dealt (0.2 = +20%)
  defBuff?: number // +flat mitigation — CON-exclusive ("armour")
  dodgeBuff?: number // +% dodge
  accBuff?: number // +% accuracy
  regenBuff?: number // +flat mana regen per turn
  atkDebuff?: number // on target: −% damage dealt
  defDebuff?: number // on target: −flat mitigation (armour shred)
  accDebuff?: number // on target: −% accuracy
}

export interface Move {
  id: string
  name: string
  stat: Stat // which stat pool gates it
  learnLevel: number
  type: MoveType
  channel: Channel
  target: Target
  cooldown: number
  accuracy: number // 0..100
  power: number // damage / heal scale; 0 for pure utility
  status?: MoveStatus
  element?: Element // magic moves carry an element (§8.5)
  effects?: MoveEffects
  desc: string
}

export interface Ability { name: string; desc: string }

export interface Species {
  id: string
  name: string
  body: BodyType
  naturalClass: string
  base: Stats
  lifespan: number // retiree age in years
  innate: Ability[]
  flavour: string
  // Authored major/flaw for the new per-species aptitude system (2026-07-23).
  // DEFINED (even as `{}` for a "vanilla, minor-only" species) => opts into
  // the new system; UNDEFINED => legacy top/2nd/lowest-base-stat derivation.
  trainingProfile?: AuthoredAptitude
}

export interface Monster {
  seed: string
  name: string
  species: Species
  sex: Sex
  stats: Stats
  className: string
  league: string
  learned: Move[]
  loadout: Move[]
  innateUnlocked: boolean // 2nd innate choice available (highest stat >= INNATE_SECONDARY_LEVEL)
  activeInnate: number // 0 or 1 — index into species.innate; only one is ever active
  favouriteFood: Food
  hatedFood: Food
  stamina?: number // 0-100 at fight time; absent = fresh (rivals, sandbox) — see staminaDamageMult
  hp?: number // current HP at fight time — injuries persist; absent = full (rivals, sandbox)
  mp?: number // current MP at fight time — absent = full (rivals, sandbox)
  tameness?: number // 0-100, HIDDEN wild-instinct roll — absent = fully tame (player monsters)
  tactics?: Tactics // standing battle orders (2026-07-25); absent = DEFAULT_TACTICS (rivals, legacy saves)
  protect?: boolean // team-event "protect target" designation — allies guard/heal this monster first
  marked?: boolean // team-event kill order on an ENEMY monster (set via scouting) — the whole opposing team strikes it first while reachable
}

// --- Tactics (2026-07-25): pre-battle standing orders, Teamfight-Manager
// style — the player is a coach, not a puppeteer. Each tactic parameterizes
// the EXISTING battle AI (class personality thresholds, target picking);
// the defaults reproduce the untuned AI exactly, so a monster with no
// tactics set fights precisely as it always has. ---
export type Temperament = 'aggressive' | 'balanced' | 'cautious'
export type TargetPriority = 'weakest' | 'casters' | 'tanks' | 'focus'
export type ManaPolicy = 'normal' | 'conserve' | 'burst'
export interface Tactics {
  temperament: Temperament
  targetPriority: TargetPriority
  manaPolicy?: ManaPolicy // absent = 'normal' (inert)
  comboDiscipline?: boolean // hold bonusVsStatus payoffs until their setup status is on the target
  openerId?: string // scripted first action — an equipped move id; ignored if no longer equipped
}
export const DEFAULT_TACTICS: Tactics = { temperament: 'balanced', targetPriority: 'weakest' }

// Formation (wave 2): roster ORDER is the formation — the first half of a
// team fights in the front line, the rest in the back line. Single-target
// MELEE attacks (including a melee-channel basic Attack) can only reach the
// front line while it stands; ranged/magic/voice ignore rows entirely, and
// AoE always hits everyone. A solo team is all front line.
export const frontRowCount = (teamSize: number) => Math.ceil(teamSize / 2)
export const rowOfSlot = (slot: number, teamSize: number): 'front' | 'back' =>
  slot < frontRowCount(teamSize) ? 'front' : 'back'

export const TEMPERAMENT_INFO: { id: Temperament; icon: string; name: string; desc: string }[] = [
  { id: 'aggressive', icon: '⚔', name: 'Aggressive', desc: 'Keeps swinging even when hurt — blocks, parries and heals late, spends MP freely.' },
  { id: 'balanced', icon: '⚖', name: 'Balanced', desc: "Fights on its class's natural instincts." },
  { id: 'cautious', icon: '🛡', name: 'Cautious', desc: 'Guards early and heals early — takes fewer risks, deals less pressure.' },
]
export const TARGET_PRIORITY_INFO: { id: TargetPriority; icon: string; name: string; desc: string }[] = [
  { id: 'weakest', icon: '🎯', name: 'Finish the wounded', desc: 'Strike whichever enemy is closest to falling.' },
  { id: 'casters', icon: '🧙', name: 'Hunt the casters', desc: "Focus the enemy's strongest INT/WIS monster — silence the spells and heals." },
  { id: 'tanks', icon: '🐘', name: 'Break the tank', desc: 'Focus the highest-CON wall so its team loses its anchor.' },
  { id: 'focus', icon: '🤝', name: 'Focus together', desc: 'Pile onto whichever enemy a teammate struck last.' },
]
export const MANA_POLICY_INFO: { id: ManaPolicy; icon: string; name: string; desc: string }[] = [
  { id: 'burst', icon: '💥', name: 'Opening burst', desc: 'Spend MP freely and early — hit hard before the enemy settles in.' },
  { id: 'normal', icon: '💠', name: 'As needed', desc: "Spend MP on the class's own judgement." },
  { id: 'conserve', icon: '💧', name: 'Conserve', desc: 'Save MP for clearly worthwhile skills — charge up rather than waste casts.' },
]
export const COMBO_INFO: { id: boolean; icon: string; name: string; desc: string }[] = [
  { id: false, icon: '🎲', name: 'Free play', desc: 'Casts whatever ranks best each turn.' },
  { id: true, icon: '🔗', name: 'Work the combo', desc: 'Holds a payoff move until its setup status is on the target, and sets up first.' },
]

// --- Rival team gameplans (LOOP_DESIGN.md Phase 3) ---
// A rival team's standing orders, expressed through the SAME Tactics the player
// uses (no separate rival AI). Scouting reveals the archetype + a counter-hint,
// closing the scout → adapt → win loop. `tell` is the composition flavour shown
// once scouted; `counter` is the actionable hint.
export type TeamGameplan = 'rushdown' | 'bulwark' | 'attrition' | 'focusfire' | 'zone'
export interface GameplanInfo {
  name: string
  icon: string
  tell: string
  counter: string
  tactics: Tactics
  protectCarry?: boolean // guard the team's top damage dealer (bulwark)
}
export const GAMEPLANS: Record<TeamGameplan, GameplanInfo> = {
  rushdown: {
    name: 'Rushdown', icon: '🔥',
    tell: 'Fast, aggressive, no support — all pressure.',
    counter: "They rush your softest monster and spend big early. Put a tank up front, or burst them before they snowball.",
    tactics: { temperament: 'aggressive', targetPriority: 'weakest', manaPolicy: 'burst' },
  },
  bulwark: {
    name: 'Bulwark', icon: '🛡',
    tell: 'Tanks and guardians around a protected carry.',
    counter: "They turtle and guard one damage dealer. Grind the wall down, or focus the protected monster before its guards react.",
    tactics: { temperament: 'cautious', targetPriority: 'weakest', manaPolicy: 'conserve' },
    protectCarry: true,
  },
  attrition: {
    name: 'Attrition', icon: '☠',
    tell: 'Poison, bleed and stall — out-lasts you.',
    counter: "They drag the fight long and out-sustain you. End it fast, or bring cleanse and healing to weather it.",
    tactics: { temperament: 'cautious', targetPriority: 'weakest', manaPolicy: 'conserve', comboDiscipline: true },
  },
  focusfire: {
    name: 'Focus-Fire', icon: '🎯',
    tell: 'High burst — the whole team piles on one target.',
    counter: "They assassinate one of your monsters early. Protect your carry, or spread durability so no single loss breaks you.",
    tactics: { temperament: 'aggressive', targetPriority: 'focus' },
  },
  zone: {
    name: 'Zone', icon: '🌩',
    tell: 'Back-row casters hunting your fragile monsters.',
    counter: "They hunt your casters. Shield your back line, or lead with a durable front they have to chew through first.",
    tactics: { temperament: 'balanced', targetPriority: 'casters' },
  },
}

// --- Leagues (license -> stat cap), §3 ---
export interface League { name: string; cap: number }
export const LEAGUES: League[] = [
  { name: 'Wood', cap: 100 },
  { name: 'Copper', cap: 200 },
  { name: 'Tin', cap: 300 },
  { name: 'Bronze', cap: 400 },
  { name: 'Iron', cap: 500 },
  { name: 'Silver', cap: 600 },
  { name: 'Gold', cap: 700 },
  { name: 'Platinum', cap: 800 },
  { name: 'Masters', cap: 900 },
  { name: 'Tamer Elite', cap: 1000 },
]

export function leagueForStat(maxStat: number): string {
  for (const l of LEAGUES) if (maxStat <= l.cap) return l.name
  return 'Tamer Elite'
}

// --- Classes (primary/secondary), balanced table §6 ---
export interface ClassDef { name: string; primary: Stat; secondary: Stat }
export const CLASSES: ClassDef[] = [
  { name: 'Tank', primary: 'CON', secondary: 'STR' },
  { name: 'Warrior', primary: 'STR', secondary: 'CON' },
  { name: 'Rogue', primary: 'DEX', secondary: 'STR' },
  { name: 'Ranger', primary: 'DEX', secondary: 'INT' },
  { name: 'Sage', primary: 'WIS', secondary: 'INT' },
  { name: 'Wizard', primary: 'INT', secondary: 'WIS' },
  { name: 'Spellsword', primary: 'INT', secondary: 'CON' },
  { name: 'Spellshield', primary: 'CON', secondary: 'WIS' },
  { name: 'Captain', primary: 'STR', secondary: 'CHA' },
  { name: 'Orator', primary: 'CHA', secondary: 'WIS' },
  { name: 'Bard', primary: 'CHA', secondary: 'DEX' },
]

// Emergent class from the two highest stats (§6.2). Falls back to Generalist.
export function classForStats(stats: Stats): string {
  const ordered = [...STATS].sort((a, b) => stats[b] - stats[a])
  const [p, s] = ordered
  const hit = CLASSES.find((c) => c.primary === p && c.secondary === s)
  return hit ? hit.name : 'Generalist'
}

// Battle role per class (user spec 2026-07-21): drives rival-team composition
// templates ("a mixture of support and damage dealing classes") and class-aware
// loadout/AI behavior. Tanks count as support — they enable, not carry, damage.
export type ClassRole = 'damage' | 'support'
export const CLASS_ROLES: Record<string, ClassRole> = {
  Warrior: 'damage', Rogue: 'damage', Ranger: 'damage', Wizard: 'damage',
  Spellsword: 'damage', Captain: 'damage',
  Tank: 'support', Spellshield: 'support', Sage: 'support', Orator: 'support', Bard: 'support',
}
export const roleOfClass = (className: string): ClassRole => CLASS_ROLES[className] ?? 'damage'

// Body-type averages + species signatures moved to species.ts — they're computed
// from the actual SPECIES data so they can never drift out of sync again.

// --- Elemental affinities (§8.5) ---
// Each body type resists one element (takes less) and is weak to one (takes more).
// Every body type has a UNIQUE (resist, weak) pair — no two share the same combo,
// so elemental matchups always distinguish body types (validated in validate.ts).
export const BODY_ELEMENT: Record<BodyType, { resist: Element; weak: Element }> = {
  Mammal: { resist: 'water', weak: 'air' },
  Avian: { resist: 'air', weak: 'water' }, // wind is a flier's home turf; waterlogged wings ground fast
  Marsupial: { resist: 'earth', weak: 'fire' }, // sturdy against tremors; helpless in dry-brush fire
  Aquatic: { resist: 'fire', weak: 'earth' },
  Insectoid: { resist: 'earth', weak: 'water' }, // chitin shrugs off stone; rain drowns the swarm
  Reptilian: { resist: 'fire', weak: 'air' }, // desert-baskers; cold winds still cold blood
  Draconic: { resist: 'fire', weak: 'water' },
  Abyssal: { resist: 'water', weak: 'fire' }, // crushing depths; surface heat is lethal
  Mythical: { resist: 'air', weak: 'earth' }, // celestial beings; the ground rejects them
  Saurian: { resist: 'earth', weak: 'air' }, // fusion (Mammal+Reptilian): grounded stone-scaled titans, unsettled by wind
}
export const RESIST_MULT = 0.7
export const WEAK_MULT = 1.3
export function elementMultiplier(body: BodyType, element: Element): number {
  const aff = BODY_ELEMENT[body]
  if (aff.resist === element) return RESIST_MULT
  if (aff.weak === element) return WEAK_MULT
  return 1
}

// --- Food & happiness (§2.4 / §12) ---
// Three tiers (2026-07-25 food overhaul):
//   normal   — flat 10g, taste-based ±1 happiness (feedDelta); the casual baseline.
//   training — a specialist ration: +30% to its stat-pair's drills this week,
//              paid for with −1 happiness and −15 stamina (a food "intensive drill").
//   premium  — pricey specials: raw stamina/happiness top-ups, or the Golden
//              Truffle's win-conditional reward gamble.
// All prices flow through rollMarket's weekly ±40% fluctuation automatically.
export interface FoodDef {
  id: Food
  name: string
  price: number
  tier: FoodTier
  icon: string
  desc: string
  boostStats?: Stat[] // training: drills whose primary stat is here gain boostMult
  boostMult?: number  // e.g. 0.3 → +30%
  happiness?: number  // FIXED happiness delta (training/premium ignore taste); undefined = taste via feedDelta (normal)
  stamina?: number    // flat stamina delta (+restore / −cost)
  rewardMult?: number // Golden Truffle: pending multiplier on the next cup WON
}
export const FOODS: FoodDef[] = [
  { id: 'vegetables', name: 'Vegetables', price: 10, tier: 'normal', icon: '🥬', desc: 'Basic ration — ±1 happiness by taste.' },
  { id: 'fruit', name: 'Fruit', price: 10, tier: 'normal', icon: '🍎', desc: 'Basic ration — ±1 happiness by taste.' },
  { id: 'meat', name: 'Meat', price: 10, tier: 'normal', icon: '🍖', desc: 'Basic ration — ±1 happiness by taste.' },
  { id: 'sweet treats', name: 'Sweet Treats', price: 10, tier: 'normal', icon: '🍰', desc: 'Basic ration — ±1 happiness by taste.' },
  { id: 'prime cut', name: 'Prime Cut', price: 75, tier: 'training', icon: '🥩', desc: 'STR & CON training +30% · −1 happiness · −15 stamina.', boostStats: ['STR', 'CON'], boostMult: 0.3, happiness: -1, stamina: -15 },
  { id: 'scholars tea', name: "Scholar's Tea", price: 75, tier: 'training', icon: '🌿', desc: 'WIS & INT training +30% · −1 happiness · −15 stamina.', boostStats: ['WIS', 'INT'], boostMult: 0.3, happiness: -1, stamina: -15 },
  { id: 'sprinters mix', name: "Sprinter's Mix", price: 75, tier: 'training', icon: '⚡', desc: 'DEX & CHA training +30% · −1 happiness · −15 stamina.', boostStats: ['DEX', 'CHA'], boostMult: 0.3, happiness: -1, stamina: -15 },
  { id: 'vigor melon', name: 'Vigor Melon', price: 200, tier: 'premium', icon: '🍈', desc: '+30 stamina.', stamina: 30 },
  { id: 'bliss berry', name: 'Bliss Berry', price: 250, tier: 'premium', icon: '🫐', desc: '+3 happiness.', happiness: 3 },
  { id: 'golden truffle', name: 'Golden Truffle', price: 500, tier: 'premium', icon: '🟡', desc: 'Win your next cup → +50% gold & exp. Nothing if you lose.', rewardMult: 1.5 },
]
export const foodDef = (id: Food): FoodDef => FOODS.find((f) => f.id === id)!
// The basic-taste foods a monster can have as a favourite/hated food. Kept to the
// four normal rations (a premium/training food isn't a "taste" preference) — this
// is also what monster generation draws from, so the roster can grow with new
// training/premium foods without shifting generation's RNG stream.
export const NORMAL_FOODS: FoodDef[] = FOODS.filter((f) => f.tier === 'normal')
// Discount group for the two-stage Bulk contracts: normal foods vs everything
// premium (training foods count as premium for the Grand Larder).
export const foodDiscountGroup = (id: Food): 'normal' | 'premium' => (foodDef(id).tier === 'normal' ? 'normal' : 'premium')
export const MAX_HAPPINESS = 10
// Happiness 0..10 → +1% damage per point (1.10× at 10).
export const happinessMultiplier = (happiness: number) => 1 + 0.01 * happiness
// Feeding: favourite +1 happiness, hated −1, anything else neutral.
export function feedDelta(food: Food, fav: Food, hated: Food): number {
  if (food === fav) return 1
  if (food === hated) return -1
  return 0
}

// --- Rivals (LOOP_DESIGN.md Phase 2) ---
// A named trainer who climbs the ladder alongside the player, gives the ladder
// a recurring face, and carries a tracked head-to-head grudge. Phase 2 meets
// them via off-calendar challenge skirmishes; Phase 3 seats them into cups with
// a team gameplan (the `personality` colours that + their between-match voice).
export type RivalPersonality = 'aggressive' | 'cagey' | 'flashy'
export interface Rival {
  id: string
  name: string
  personality: RivalPersonality
  licenseIndex: number // rubber-banded toward the player's highest so they stay a threat
  wins: number // player's POV: times the player beat this rival
  losses: number // player's POV: times this rival beat the player
}

// --- Status descriptions (§7.6) ---
export const STATUS_INFO: Record<StatusKind, string> = {
  blind: 'Lowers the target’s chance to hit.',
  poison: 'Ongoing mana damage.',
  burn: 'Ongoing HP damage (fire).',
  fear: 'Briefly flees; loses its action.',
  confusion: 'Next ability may hit itself (20%).',
  stun: 'Cannot act briefly.',
  knockback: 'Shoved back; acts last while it lasts.',
  bleed: 'Ongoing physical HP damage; stacks up to 3.',
  silence: 'Cannot use skills — only Attack and Block.',
  vulnerable: 'Takes 20% more damage.',
  sleep: 'Cannot act; wakes when damaged.',
  doom: 'When the countdown ends, takes a heavy burst of damage. Cleansable.',
  healblock: 'Healing, lifesteal and HP regen are 60% less effective.',
  haste: 'Acts first in the round while it lasts. (Beneficial — not removed by cleanses.)',
  charm: 'Single-target hostile actions strike its own allies.',
}

// --- Learn ladder (§7.2) ---
export const LEARN_LADDER = [40, 90, 160, 240, 330, 430, 540, 650, 780, 920]

// A species' 2nd innate is no better than the 1st — it's an ALTERNATIVE, not
// an upgrade (user spec 2026-07-25). The 1st is available from the start; the
// 2nd unlocks once the monster's highest stat reaches this level. Only ONE
// innate is ever active at a time — swapped via the same slot-click UI as
// loadout moves. (Species ultimates were REMOVED entirely 2026-07-25 — their
// descriptions promised effects the engine never delivered.)
export const INNATE_SECONDARY_LEVEL = 300

// --- Seeded RNG: mulberry32 + string hash ---
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RNG = () => number
export const randInt = (rng: RNG, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min
export const chance = (rng: RNG, pct: number) => rng() * 100 < pct
export const pick = <T>(rng: RNG, arr: T[]): T => arr[Math.floor(rng() * arr.length)]
