// N-vs-N simultaneous team battle simulator (§11, extended for team tournaments
// 2026-07-21). Deterministic given a seed. Teamfight-Manager style: no player
// input mid-fight — each monster's build + the shared battlefield state decides
// the outcome. All combatants across both teams act on ONE shared initiative
// order each round (lowest CON first — light builds are fast), and moves
// resolve against REAL targets
// (a single enemy, every enemy, a single ally, or the whole team) rather than
// always collapsing onto "the only other fighter" — the old assumption from
// when this was strictly 1v1. `simulateBattle` (still exported) is a thin
// team-of-1 wrapper over `simulateTeamBattle`, so every existing 1v1 call site
// (Sandbox) keeps working unchanged.
import { Ability, Channel, Element, ManaPolicy, Monster, Move, RNG, StatusKind, Temperament, chance, elementMultiplier, happinessMultiplier, hashString, mulberry32, randInt, rowOfSlot } from './core'
import {
  attackStat, critChance, debuffBonus, debuffReduction, dodgeChance, echoChance, hpRegen,
  manaCost, manaRegen, maxHp, maxMana, mitigationPierce, staminaDamageMult,
} from './monster'

interface ActiveStatus { kind: StatusKind; turns: number }

// --- Structured battle events: the animatable beat stream the arena renders.
// The text log is kept alongside for the readable transcript. Every event that
// identifies a specific fighter carries `slot` (its 0-based roster position)
// alongside `side`; events with a distinct target also carry `targetSide`/
// `targetSlot` — with more than one possible fighter per side, "the other
// side" is no longer enough to infer who was hit.
export type BattleSide = 'A' | 'B'
export type BattleEvent =
  | { kind: 'round'; n: number }
  | { kind: 'hit'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; channel: Channel; element?: Element; dmg: number; hits: number; crit: boolean; execute: boolean; eff: 'super' | 'resist' | null; lifesteal: number; manaBurn: number; recoil: number; warded: number; self: boolean }
  | { kind: 'miss'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; channel: Channel; blocked: boolean }
  | { kind: 'stance'; side: BattleSide; slot: number; avoid: number }
  | { kind: 'utility'; side: BattleSide; slot: number; targetSide: BattleSide; targetSlot: number; move: string; heal: number; hostile: boolean }
  | { kind: 'status'; side: BattleSide; slot: number; status: StatusKind } // side/slot = the afflicted
  | { kind: 'dot'; side: BattleSide; slot: number; status: 'burn' | 'poison' | 'bleed' | 'doom'; amount: number }
  | { kind: 'skip'; side: BattleSide; slot: number; reason: 'stun' | 'fear' | 'sleep' }
  | { kind: 'snap'; states: { side: BattleSide; slot: number; hp: number; mana: number; ward: number; statuses: StatusKind[] }[] }
  | { kind: 'end'; winner: 'A' | 'B' | 'draw' }

// Passive effects granted by innate abilities (§8.3, reworked 2026-07-25:
// every innate must be a genuine passive that maps to a real mechanical
// number — no flavour-only entries left). Curated table by ability name.
// Only ONE of a species' two innates is active at a time (Monster.activeInnate)
// — balance rule from that: a self-only field must carry a HIGHER magnitude
// than its aura twin (auras include the owner, so at equal numbers the aura
// strictly dominates — see Quickstep 6 vs Cheer 4 for the pattern).
interface InnateEffect {
  flatDR?: number // flat damage reduction on every hit taken
  dodge?: number // bonus dodge %
  acc?: number // bonus accuracy %
  regen?: number // bonus mana regen per turn
  hpRegen?: number // bonus HP regen per turn (self)
  dmgMult?: number // multiplier on all damage dealt
  firstHitMult?: number // multiplier on this monster's first damaging hit
  lifesteal?: number // fraction of damage dealt returned as HP
  lowHpDmgMult?: number // extra damage multiplier while below 30% HP
  highHpDmgMult?: number // extra damage multiplier while above 70% HP
  crit?: number // bonus critical-hit % (stacks with DEX-derived critChance)
  pierce?: number // fraction of target mitigation ignored (stacks with STR pierce + skill pierce)
  echo?: number // bonus % chance a skill casts twice (stacks with INT-derived echoChance)
  elemDmgMult?: number // multiplier on damage from ELEMENTAL moves only
  executeMult?: number // damage multiplier vs targets below 30% HP
  startWard?: number // begins every battle with an absorb shield of this many HP
  manaSteal?: number // fraction of damage dealt drained from the target's mana into own
  buffExtend?: number // % chance each of its cast buffs lasts +1 round (rolled on apply)
  debuffExtend?: number // % chance each of its inflicted debuffs lasts +1 round (rolled on apply)
  debuffResist?: number // % shaved off incoming debuff magnitudes (stacks with CHA-derived)
  statusOnHit?: { kind: StatusKind; chance: number; duration: number } | null // may inflict a status on every damaging hit

  // Team-wide auras (user spec 2026-07-25): apply to every LIVING ally each
  // round, including the owner — vanish the round after the owner falls.
  // Stack additively with each other and with the recipient's own self-only
  // fields above (aura dmgMult multiplies in).
  auraFlatDR?: number
  auraDodge?: number
  auraRegen?: number
  auraHpRegen?: number
  auraDmgMult?: number

  // Enemy-facing debuff auras: apply to every LIVING enemy each round, same
  // living/vanish-on-death rule as team auras above, just the opposing side.
  enemyAccDebuff?: number
  enemyDodgeDebuff?: number
  enemyRegenDebuff?: number
  enemyDmgDebuff?: number
}

export const INNATE_EFFECTS: Record<string, InnateEffect> = {
  // --- Thematic redistribution (user spec 2026-07-25): crit → DEX majors then
  // Reptilians; pierce → STR majors then Mammals; mana regen → WIS then Avians;
  // elemental/echo → INT then Aquatics; auras → CHA majors then Marsupials;
  // flat-DR trimmed on the tournament-dominant CON tanks. ---

  // damage reduction (self) — every entry its own defensive texture (2026-07-25:
  // no two innates share a profile; clusters got distinct numbers/riders)
  'Thick Hide': { flatDR: 3 }, // the plain thickest hide in the game
  'Weathered Hide': { flatDR: 2, debuffResist: 10 }, // old scars — little gets under its skin
  'Spiral Shell': { flatDR: 2, dodge: 2 }, // the spiral deflects glancing blows
  'Statue Stance': { highHpDmgMult: 1.1 },
  // CON-tank trim (2026-07-25 balance sweep: these species dominated at every level)
  Ironclad: { flatDR: 2 }, // the textbook plate
  Unstoppable: { flatDR: 1, debuffResist: 15 }, // cannot be slowed or weakened
  'Chitin Plate': { flatDR: 1, startWard: 12 }, // the dam-keystone shell is already braced
  'Armored Scales': { flatDR: 1, hpRegen: 1 }, // crocodile wounds knit famously fast
  'Shell Ward': { startWard: 18 }, // the shell is raised before the bell
  // Aegis Bond outbids its aura twin Unison (auraFlatDR 2) — self-only must pay more (the bond also mends).
  'Aegis Bond': { flatDR: 2, hpRegen: 2 },
  // evasion (self) — pure-dodge ladder 4..10, no two alike; composites carry riders
  Quickstep: { dodge: 6 }, Aerial: { dodge: 7 }, 'Phase Shift': { dodge: 9 }, 'Wing Current': { dodge: 10 },
  'Dodge Storm': { dodge: 6, crit: 3 }, // storm-dancer: slip the blow, answer it
  'Cloak of Shadow': { dodge: 8 }, 'Ancient Knowing': { dodge: 5 },
  Burrow: { dodge: 4 }, 'Wall Runner': { dodge: 6, acc: 2 }, // impossible angles cut both ways
  // "Hard to reach" (self dodge) AND "foes arrive slowed" (enemy dodge debuff) — both halves of the description, one entry.
  'Web Trap': { dodge: 5, enemyDodgeDebuff: 3 },
  // accuracy (self) — 7/8/10/12 ladder
  'Keen Eye': { acc: 8 }, 'Cosmic Precision': { acc: 10 }, 'Compound Eyes': { acc: 11 }, 'Hypnotic Gaze': { acc: 7 },
  // mana regen (self) — WIS majors and Avians; 2/3/4/5 ladder
  'Silent Wisdom': { regen: 4 }, 'Glacial Wisdom': { regen: 2, flatDR: 1 }, 'Arcane Mastery': { regen: 5 },
  'Inner Calm': { regen: 2 },
  'Abyssal Glow': { regen: 3 }, // its glow is its own wellspring — Lanterix, WIS major
  // HP regen (self) — Sun Basking was miscoded as mana regen; "recovers strength between blows" is HP.
  'Sun Basking': { hpRegen: 3 },
  // damage boosts (self, flat %) — thinned to a 1.05..1.08 ladder, one holder each
  'Rising Fury': { dmgMult: 1.05 }, 'Draconic Pride': { dmgMult: 1.06 }, Overload: { dmgMult: 1.07 },
  // Pride outbids its aura twin Rallying Roar (auraDmgMult 1.05).
  Pride: { dmgMult: 1.08 },
  // former exclusive "+X% damage" clones, re-textured (2026-07-25):
  'Flame Aura': { statusOnHit: { kind: 'burn', chance: 8, duration: 2 } }, // the aura itself scorches
  Blizzard: { statusOnHit: { kind: 'stun', chance: 6, duration: 1 } }, // frozen stiff
  'Whip Strike': { pierce: 0.1 }, // the whip wraps around shields
  'Void Pulse': { lifesteal: 0.1 }, // the void consumes
  'Rift Magic': { echo: 6 }, // a cast slips through the rift twice
  'Stellar Shot': { crit: 9 }, // starlight finds the mark
  // critical hits — DEX majors (Grivvel/Tazzik/Mantaris) + Reptilian (Geckari); 6..10 ladder
  Rend: { crit: 8 }, Whirlwind: { crit: 7 }, 'Current Rider': { crit: 6, acc: 2 }, 'Tail Drop': { crit: 10 },
  // armour piercing — STR majors (Mantevoke/Bruxaroo) + Mammal (Ursath); serrated cuts deepest
  'Serrated Claws': { pierce: 0.18 }, Southpaw: { pierce: 0.12 }, Maul: { pierce: 0.15 },
  // elemental mastery / double-cast — INT majors + Aquatics; echo 6/8/10/12 ladder
  'Arcane Bolt': { elemDmgMult: 1.1 }, Spellblade: { elemDmgMult: 1.12 },
  Wellspring: { echo: 10 }, 'Tentacle Barrage': { echo: 8 }, // eight arms — some casts come twice
  'Spell Echo': { echo: 12 }, // finally does what its name says
  // openers — bonus multiplier on this monster's first landed hit (self);
  // 1.2..1.7 ladder, the mantis's legendary strike at the top
  'Chest Beat': { firstHitMult: 1.5 }, 'Dive Bomb': { firstHitMult: 1.6 }, 'Glide Strike': { firstHitMult: 1.3 },
  Haymaker: { firstHitMult: 1.35 }, 'Silent Strike': { firstHitMult: 1.4, crit: 5 }, 'Prehistoric Roar': { firstHitMult: 1.2 },
  'Ambush Strike': { firstHitMult: 1.4, acc: 4 }, // the patient strike does not miss
  Ambush: { firstHitMult: 1.7 }, 'Skim Dart': { firstHitMult: 1.25 },
  // sustain — lifesteal / mana steal (self)
  Devour: { lifesteal: 0.3 }, 'Age Reversal': { lifesteal: 0.15 }, 'Mana Theft': { manaSteal: 0.2 },
  // conditional damage windows
  Frenzy: { lowHpDmgMult: 1.25 }, // desperation — below 30% HP
  'Death Roll': { executeMult: 1.25 }, // finishes weakened prey — below 30% target HP
  // status-on-hit — venom in every bite, a dazzling crest flash
  'Venom Fang': { statusOnHit: { kind: 'poison', chance: 12, duration: 3 } },
  'Crest Display': { statusOnHit: { kind: 'blind', chance: 10, duration: 2 } },
  // buff/debuff duration extension — the song plays again; the queen's decree lingers
  Encore: { buffExtend: 25 }, 'Hive Command': { debuffExtend: 30 },
  // debuff resistance — the ox is the most unshakeable; the serpent close behind
  Immovable: { debuffResist: 25 }, 'Cold Blood': { debuffResist: 20 },
  // opening shield — the shell is already up when the bell rings
  Ward: { startWard: 25 },

  // Tidal Wisdom: SELF sustain now (was an aura — Carcharun is a STR-major
  // aquatic, off the CHA/Marsupial aura theme; the old shark keeps its own counsel).
  'Tidal Wisdom': { regen: 2, hpRegen: 2 },

  // --- Team-wide auras: apply to every LIVING ally each round, including the
  // owner. Reserved (user spec 2026-07-25) for CHA-major species (Maneleo,
  // Larkessa, Vespera) and Marsupials (Quokkade, Koalio) — plus the exclusive
  // species, which sit outside the training-theme system entirely. ---
  'Rallying Roar': { auraDmgMult: 1.05 },
  Cheer: { auraDodge: 4 }, Unison: { auraFlatDR: 2 },
  'Song of Valor': { auraDmgMult: 1.04 },
  'Psychic Aura': { auraDodge: 3, auraRegen: 1 }, // the mind shields and feeds the mind
  Foresight: { auraDodge: 5 },
  'Soothing Words': { auraHpRegen: 3 }, // the pool's strongest pure team-heal — the crooner's whole identity
  'Life Bloom': { auraHpRegen: 2, auraRegen: 1 }, // the bloom nourishes body and spirit
  'Royal Jelly': { auraHpRegen: 2 }, // the queen feeds the hive

  // --- Enemy-facing debuff auras: apply to every LIVING enemy each round.
  // Ink Cloud was miscoded as a SELF buff when its own description says it
  // weakens the enemy — fixed here. ---
  'Ink Cloud': { enemyAccDebuff: 5 },
  Hex: { enemyAccDebuff: 4, enemyRegenDebuff: 1 },
  // Dodge-debuffs are dead weight vs low-DEX foes (dodge has no floor at 0 and
  // hit chance past 100 is wasted), so Drowsy Aura moved to accuracy — drowsy
  // foes swing wide — and Root Grasp splits its value across both (balance
  // sweep 2026-07-25: these two were the pool's worst performers).
  'Drowsy Aura': { enemyAccDebuff: 3 },
  'Root Grasp': { enemyDodgeDebuff: 3, enemyAccDebuff: 2 }, Entropy: { enemyDmgDebuff: 0.05 },
  'Temporal Distortion': { enemyDodgeDebuff: 4, auraRegen: 1 },

  // Truth's Word: reworked into a genuine passive (see truthsWordCleanse), plus
  // a small always-on ward of conviction — the cleanse alone is worthless
  // against teams that carry no debuff moves.
  "Truth's Word": { flatDR: 1 },
}

// A species' two innates are ALTERNATIVES, not a stacked pair (user spec
// 2026-07-25) — only the one at Monster.activeInnate is ever in effect, same
// as only one loadout of moves is ever equipped. Falls back to slot 0 if
// activeInnate is out of range (e.g. the 2nd choice's unlock stat was since
// trained down, mirroring careerMonster's loadout-shrink safety).
const currentInnate = (m: Monster): Ability | undefined =>
  m.species.innate[m.activeInnate] ?? m.species.innate[0]

// This monster's own ACTIVE innate as one struct — everything it PROVIDES
// (self-only fields, plus what it grants as an aura/enemy-debuff), before any
// team-context is applied. This is what Combatant.selfInnate holds, static
// for the whole fight; Combatant.innate (below) is the EFFECTIVE per-round
// value after folding in living allies' auras and living enemies' debuffs.
function innateEffects(m: Monster): Required<InnateEffect> {
  const out: Required<InnateEffect> = {
    flatDR: 0, dodge: 0, acc: 0, regen: 0, hpRegen: 0, dmgMult: 1, firstHitMult: 1, lifesteal: 0,
    lowHpDmgMult: 1, highHpDmgMult: 1, crit: 0, pierce: 0, echo: 0, elemDmgMult: 1, executeMult: 1,
    startWard: 0, manaSteal: 0, buffExtend: 0, debuffExtend: 0, debuffResist: 0, statusOnHit: null,
    auraFlatDR: 0, auraDodge: 0, auraRegen: 0, auraHpRegen: 0, auraDmgMult: 1,
    enemyAccDebuff: 0, enemyDodgeDebuff: 0, enemyRegenDebuff: 0, enemyDmgDebuff: 0,
  }
  const ab = currentInnate(m)
  const e = ab && INNATE_EFFECTS[ab.name]
  if (!e) return out
  out.flatDR += e.flatDR ?? 0
  out.dodge += e.dodge ?? 0
  out.acc += e.acc ?? 0
  out.regen += e.regen ?? 0
  out.hpRegen += e.hpRegen ?? 0
  out.dmgMult *= e.dmgMult ?? 1
  out.firstHitMult = Math.max(out.firstHitMult, e.firstHitMult ?? 1)
  out.lifesteal += e.lifesteal ?? 0
  out.lowHpDmgMult *= e.lowHpDmgMult ?? 1
  out.highHpDmgMult *= e.highHpDmgMult ?? 1
  out.crit += e.crit ?? 0
  out.pierce += e.pierce ?? 0
  out.echo += e.echo ?? 0
  out.elemDmgMult *= e.elemDmgMult ?? 1
  out.executeMult *= e.executeMult ?? 1
  out.startWard += e.startWard ?? 0
  out.manaSteal += e.manaSteal ?? 0
  out.buffExtend += e.buffExtend ?? 0
  out.debuffExtend += e.debuffExtend ?? 0
  out.debuffResist += e.debuffResist ?? 0
  out.statusOnHit = e.statusOnHit ?? null
  out.auraFlatDR += e.auraFlatDR ?? 0
  out.auraDodge += e.auraDodge ?? 0
  out.auraRegen += e.auraRegen ?? 0
  out.auraHpRegen += e.auraHpRegen ?? 0
  out.auraDmgMult *= e.auraDmgMult ?? 1
  out.enemyAccDebuff += e.enemyAccDebuff ?? 0
  out.enemyDodgeDebuff += e.enemyDodgeDebuff ?? 0
  out.enemyRegenDebuff += e.enemyRegenDebuff ?? 0
  out.enemyDmgDebuff += e.enemyDmgDebuff ?? 0
  return out
}

const activePassives = (m: Monster) => {
  const ab = currentInnate(m)
  return ab && INNATE_EFFECTS[ab.name] ? [ab.name] : []
}
const hasInnate = (m: Monster, name: string) => currentInnate(m)?.name === name

// A single timed buff/debuff currently active on a combatant, counted down once
// per ROUND (not per action) and removed on expiry — nothing lasts "for the
// fight" anymore. Re-applying the same move id refreshes turnsLeft instead of
// stacking a second copy.
interface ActiveMod {
  moveId: string
  turnsLeft: number
  atkBuff?: number; defBuff?: number; dodgeBuff?: number; accBuff?: number; regenBuff?: number
  thorns?: number; hpRegenBuff?: number // framework 2026-07-25: flat reflect per hit taken; flat HP/turn
  atkDebuff?: number; defDebuff?: number; accDebuff?: number
}

interface Combatant {
  m: Monster
  side: BattleSide
  slot: number // 0-based position within its own team's roster array
  row: 'front' | 'back' // formation (wave 2): from roster order via rowOfSlot — melee can only reach the front line while it stands
  openerPending: boolean // scripted opening move (tactics.openerId) not yet attempted — spent on this monster's first action either way
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  cooldowns: Record<string, number> // moveId -> turns remaining
  statuses: ActiveStatus[]
  guard: number // temporary flat damage reduction until next action (guard effects)
  ward: number // absorb shield HP — soaks damage before health (ward effects)
  blockAvoid: number // Block stance: bonus % chance to avoid hits until next action
  mods: ActiveMod[] // active timed buffs/debuffs (round-limited)
  // derived from `mods` — recomputed via recomputeMods() whenever mods changes
  atkMod: number // multiplier on damage dealt (buffs raise, debuffs on self lower)
  defFlat: number // flat mitigation delta (Iron Skin raises, armour shred lowers)
  dodgeMod: number // additive % dodge
  accMod: number // additive % accuracy
  regenMod: number // additive mana regen
  thornsFlat: number // flat damage reflected onto attackers per hit taken (thorns buffs)
  hpRegenMod: number // additive HP regen per turn (hpRegenBuff buffs)
  happiness: number // 0..10, scales damage dealt (§2.4)
  staminaMult: number // fatigue damage multiplier, fixed at fight start (staminaDamageMult)
  selfInnate: Required<InnateEffect> // this monster's own two innates, static for the fight
  innate: Required<InnateEffect> // EFFECTIVE totals: selfInnate + living allies' auras + living enemies' debuffs received — recomputed every round via recomputeInnateAuras()
  hasLandedHit: boolean // first-hit bonuses spend after the first damaging hit
  wasKOd: boolean // true once hp has ever hit <=0 — drives the per-individual injury system
  actedThisRound: boolean // reset false at the top of every round, set true when this combatant reaches its turn — drives firstStrikeMult (a target that hasn't acted yet this round hasn't "reacted" to the incoming hit)
  // Taunted: single-target hostile actions are FORCED onto the taunter while
  // this lasts (ticked down per round alongside mods; cleared if the taunter
  // falls). This is what makes Tanks work despite acting last in the
  // CON-ascending turn order — they redirect damage into their HP pool.
  tauntedBy: { side: BattleSide; slot: number; turnsLeft: number } | null
}

// Rebuild the 5 cached modifier totals from the active mods list. Call after any
// mods mutation (apply, expiry).
function recomputeMods(c: Combatant): void {
  let atkMod = 1, defFlat = 0, dodgeMod = 0, accMod = 0, regenMod = 0, thornsFlat = 0, hpRegenMod = 0
  for (const m of c.mods) {
    if (m.atkBuff) atkMod *= 1 + m.atkBuff
    if (m.atkDebuff) atkMod *= 1 - m.atkDebuff
    if (m.defBuff) defFlat += m.defBuff
    if (m.defDebuff) defFlat -= m.defDebuff
    if (m.dodgeBuff) dodgeMod += m.dodgeBuff
    if (m.accBuff) accMod += m.accBuff
    if (m.accDebuff) accMod -= m.accDebuff
    if (m.regenBuff) regenMod += m.regenBuff
    if (m.thorns) thornsFlat += m.thorns
    if (m.hpRegenBuff) hpRegenMod += m.hpRegenBuff
  }
  c.atkMod = atkMod; c.defFlat = defFlat; c.dodgeMod = dodgeMod; c.accMod = accMod; c.regenMod = regenMod
  c.thornsFlat = thornsFlat; c.hpRegenMod = hpRegenMod
}

// Tick every active mod down by one ROUND (called once per round, not per turn);
// prune anything that's expired and rebuild the cached totals.
function tickMods(c: Combatant): void {
  for (const m of c.mods) m.turnsLeft--
  c.mods = c.mods.filter((m) => m.turnsLeft > 0)
  if (c.tauntedBy && --c.tauntedBy.turnsLeft <= 0) c.tauntedBy = null
  recomputeMods(c)
}

// Truth's Word (user spec 2026-07-25): reworked from an "at will" active
// dispel — which isn't a passive — into a genuine passive that fires on its
// own: every 3rd round, a bearer automatically shrugs off one random debuff
// currently on itself. Special-cased by name (like tauntForce) rather than a
// generic InnateEffect field, since it's the only ability that removes a mod
// outright instead of adjusting a number.
function truthsWordCleanse(ctx: BattleContext, round: number, log: string[], ev: BattleEvent[]): void {
  if (round % 3 !== 0) return
  for (const c of ctx.all) {
    if (c.hp <= 0 || !hasInnate(c.m, "Truth's Word")) continue
    const debuffs = c.mods.filter((m) => m.atkDebuff || m.defDebuff || m.accDebuff)
    if (!debuffs.length) continue
    const gone = debuffs[0]
    c.mods = c.mods.filter((m) => m !== gone)
    recomputeMods(c)
    log.push(`  ✨ ${c.m.name}'s Truth's Word shrugs off a debuff.`)
    ev.push({ kind: 'utility', side: c.side, slot: c.slot, targetSide: c.side, targetSlot: c.slot, move: "Truth's Word", heal: 0, hostile: false })
  }
}

export interface BattleResult {
  log: string[]
  events: BattleEvent[]
  winner: 'A' | 'B' | 'draw'
  winnerName: string
  // where every combatant on BOTH teams ended the fight, and whether they were
  // ever KO'd along the way — the tournament resolver carries these forward
  // per-individual (injury system), not just for a single win/loss pair.
  finals: { side: BattleSide; slot: number; hp: number; mana: number; wasKOd: boolean }[]
}

function makeCombatant(m: Monster, happiness: number, side: BattleSide, slot: number, teamSize: number): Combatant {
  const self = innateEffects(m)
  return {
    m,
    side,
    slot,
    row: rowOfSlot(slot, teamSize), // formation (wave 2): roster order IS the formation
    openerPending: !!m.tactics?.openerId,
    // injuries persist: a monster fights from its CURRENT HP/MP when tracked
    hp: Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats)),
    maxHp: maxHp(m.stats),
    mana: Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats)),
    maxMana: maxMana(m.stats),
    cooldowns: {},
    statuses: [],
    guard: 0,
    ward: self.startWard, // e.g. Ward (Nautilux) — opens every battle behind a shell shield
    blockAvoid: 0,
    mods: [],
    atkMod: 1,
    defFlat: 0,
    dodgeMod: 0,
    accMod: 0,
    regenMod: 0,
    thornsFlat: 0,
    hpRegenMod: 0,
    happiness,
    staminaMult: staminaDamageMult(m.stamina ?? 100),
    selfInnate: self,
    innate: self, // placeholder until recomputeInnateAuras() runs before round 1
    hasLandedHit: false,
    wasKOd: false,
    actedThisRound: false,
    tauntedBy: null,
  }
}

// --- Shared-battlefield context: both teams flattened into one list, plus the
// helpers every targeting decision is built from. `focus` tracks, per side,
// the last enemy that side dealt damage to — the 'focus' target-priority
// tactic reads it so teammates can pile onto one victim together. ---
interface BattleContext { all: Combatant[]; focus: Record<BattleSide, { side: BattleSide; slot: number } | null> }
const livingTeamOf = (ctx: BattleContext, side: BattleSide) => ctx.all.filter((c) => c.side === side && c.hp > 0)
const enemiesOf = (ctx: BattleContext, c: Combatant) => livingTeamOf(ctx, c.side === 'A' ? 'B' : 'A')
const alliesOf = (ctx: BattleContext, c: Combatant) => livingTeamOf(ctx, c.side).filter((x) => x !== c)

// Recompute every combatant's EFFECTIVE innate totals (Combatant.innate) from
// scratch: own selfInnate + every LIVING ally's aura fields (including its
// own, since a team aura benefits its owner too) + every LIVING enemy's
// enemy-debuff fields received. Called once before round 1 and once per round
// thereafter (same cadence as tickMods) — a fallen ally's aura or a fallen
// enemy's debuff drops off starting the round after they die, not instantly
// mid-round, matching how tauntedBy/mods already tick once per round.
function recomputeInnateAuras(ctx: BattleContext): void {
  for (const c of ctx.all) {
    if (c.hp <= 0) continue
    const self = c.selfInnate
    let flatDR = self.flatDR, dodge = self.dodge, regen = self.regen, hpRegen = self.hpRegen, dmgMult = self.dmgMult
    for (const ally of [c, ...alliesOf(ctx, c)]) {
      const a = ally.selfInnate
      flatDR += a.auraFlatDR; dodge += a.auraDodge; regen += a.auraRegen; hpRegen += a.auraHpRegen
      dmgMult *= a.auraDmgMult
    }
    let acc = self.acc
    for (const foe of enemiesOf(ctx, c)) {
      const e = foe.selfInnate
      acc -= e.enemyAccDebuff
      dodge -= e.enemyDodgeDebuff
      regen -= e.enemyRegenDebuff
      dmgMult *= 1 - e.enemyDmgDebuff
    }
    c.innate = {
      ...self, flatDR, dodge, acc, regen, hpRegen, dmgMult,
    }
  }
}

// Lowest-HP%-first — rewards finishing blows / prioritizes the neediest ally.
// Array.sort is spec-stable, so ties preserve roster (slot) order.
const pickEnemyTarget = (foes: Combatant[]) => foes.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
// Heals/support prefer a designated protect target once it's meaningfully
// hurt (below 85%) — otherwise the plain neediest-ally rule (identical to the
// pre-tactics behavior whenever no protect target is set).
const pickAllyTarget = (allies: Combatant[]) => {
  const protectd = allies.find((a) => a.m.protect && a.hp / a.maxHp < 0.85)
  return protectd ?? allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
}

// Tactic-aware enemy pick (2026-07-25): the player's target-priority order,
// falling back to the classic lowest-HP% rule ('weakest' IS that rule, so a
// monster with no tactics behaves exactly as before). Taunt/confusion/charm
// still take precedence at the resolveTargets layer — orders don't override
// compulsions.
function pickEnemyTargetFor(attacker: Combatant, foes: Combatant[], ctx: BattleContext): Combatant {
  switch (attacker.m.tactics?.targetPriority) {
    case 'casters':
      return foes.slice().sort((a, b) =>
        (b.m.stats.INT + b.m.stats.WIS) - (a.m.stats.INT + a.m.stats.WIS) || a.hp / a.maxHp - b.hp / b.maxHp)[0]
    case 'tanks':
      return foes.slice().sort((a, b) => b.m.stats.CON - a.m.stats.CON || a.hp / a.maxHp - b.hp / b.maxHp)[0]
    case 'focus': {
      const f = ctx.focus[attacker.side]
      const t = f && foes.find((c) => c.side === f.side && c.slot === f.slot)
      return t || pickEnemyTarget(foes) // nobody's engaged yet (or the mark fell) → open normally
    }
    default:
      return pickEnemyTarget(foes)
  }
}

// Does this move apply a timed self-buff (round-limited, refreshed on recast)?
const isTimedBuff = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkBuff !== undefined || e.defBuff !== undefined || e.dodgeBuff !== undefined
    || e.accBuff !== undefined || e.regenBuff !== undefined || e.thorns !== undefined || e.hpRegenBuff !== undefined)
}
const isDebuffMove = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkDebuff !== undefined || e.defDebuff !== undefined || e.accDebuff !== undefined)
}

const hasStatus = (c: Combatant, k: StatusKind) => c.statuses.some((s) => s.kind === k)

// Haste is the one BENEFICIAL status — cleanses scrub ailments, never gifts.
const BENEFICIAL_STATUSES = new Set<StatusKind>(['haste'])
const cleanseStatuses = (c: Combatant) => { c.statuses = c.statuses.filter((s) => BENEFICIAL_STATUSES.has(s.kind)) }

// Doom: nothing happens while the countdown runs, then a heavy burst when it
// ends — the counterplay is cleansing it in time.
const DOOM_DMG_FRACTION = 0.25 // of the victim's own max HP
// Healblock ("grievous wounds"): heals, lifesteal, and HP regen multiplied by
// this while the status holds.
const HEALBLOCK_MULT = 0.4

// A damaged sleeper wakes — the ONE way sleep differs from stun.
function wakeIfSleeping(c: Combatant, log: string[]): void {
  if (!hasStatus(c, 'sleep')) return
  c.statuses = c.statuses.filter((s) => s.kind !== 'sleep')
  log.push(`    ${c.m.name} is jolted awake!`)
}

// Statuses stack (bleed, capped) or refresh (everything else) — never duplicate.
// Bleed is the ONE stacking status: up to 3 concurrent stacks, each ticking its
// own damage; re-applying any other status just refreshes its duration.
export const BLEED_MAX_STACKS = 3
export function applyStatus(c: { statuses: ActiveStatus[] }, kind: StatusKind, duration: number): boolean {
  if (kind === 'bleed') {
    if (c.statuses.filter((s) => s.kind === 'bleed').length >= BLEED_MAX_STACKS) return false
    c.statuses.push({ kind, turns: duration })
    return true
  }
  const existing = c.statuses.find((s) => s.kind === kind)
  if (existing) { existing.turns = Math.max(existing.turns, duration); return false }
  c.statuses.push({ kind, turns: duration })
  return true
}

function tickStatuses(c: Combatant, log: string[], ev: BattleEvent[]): void {
  let tookHpDamage = false
  for (const st of c.statuses) {
    if (st.kind === 'burn') {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.05))
      c.hp -= dmg
      tookHpDamage = true
      log.push(`  ${c.m.name} suffers ${dmg} burn damage.`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'burn', amount: dmg })
    } else if (st.kind === 'poison') {
      const dmg = Math.max(1, Math.round(c.maxMana * 0.15))
      c.mana = Math.max(0, c.mana - dmg)
      log.push(`  ${c.m.name} loses ${dmg} mana to poison.`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'poison', amount: dmg })
    } else if (st.kind === 'bleed') {
      // flat per stack — a lighter, stackable cousin of burn's %-of-maxHp tick
      const dmg = Math.max(1, Math.round(c.maxHp * 0.02))
      c.hp -= dmg
      tookHpDamage = true
      log.push(`  ${c.m.name} bleeds for ${dmg}.`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'bleed', amount: dmg })
    } else if (st.kind === 'doom' && st.turns === 1) {
      // the countdown ends THIS tick — the doom strikes (true damage, no mitigation;
      // the counterplay was cleansing it in time)
      const dmg = Math.max(1, Math.round(c.maxHp * DOOM_DMG_FRACTION))
      c.hp -= dmg
      tookHpDamage = true
      log.push(`  💀 The doom strikes ${c.m.name} for ${dmg}!`)
      ev.push({ kind: 'dot', side: c.side, slot: c.slot, status: 'doom', amount: dmg })
    }
    st.turns--
  }
  c.statuses = c.statuses.filter((s) => s.turns > 0)
  if (tookHpDamage) wakeIfSleeping(c, log)
}

// Vulnerable status: flat +20% damage taken from every source while marked.
const VULNERABLE_MULT = 1.2

// --- Universal free actions (battle-choice design) ---
// Every skill costs MP; when none is affordable the monster must Attack or Block.
const ATTACK_POWER = 12
const FREE_MOVE_IDS = new Set(['attack'])
const moveCost = (mv: Move) => (FREE_MOVE_IDS.has(mv.id) ? 0 : manaCost(mv))

// Basic attack through the monster's best offensive channel (a wizard's "attack"
// is a bolt, a bard's a taunt) — free, always available.
function basicAttack(m: Monster): Move {
  const channels: Move['channel'][] = ['melee', 'ranged', 'magic', 'voice']
  const best = channels.reduce((a, b) => (attackStat(m.stats, a) >= attackStat(m.stats, b) ? a : b))
  return {
    id: 'attack', name: 'Attack', stat: 'STR', learnLevel: 0, type: 'damage',
    channel: best, target: 'enemy', cooldown: 0, accuracy: 95, power: ATTACK_POWER, desc: 'A basic attack.',
  }
}

// Block: defensive stance until the blocker's next action — raises the chance to
// NOT take a hit at all. Scales gently with WIS (composure under pressure).
const blockValue = (c: Combatant) => Math.min(55, Math.round(30 + c.m.stats.WIS * 0.05))

type Action = { kind: 'skill'; move: Move } | { kind: 'attack' } | { kind: 'block' }

// Expected output of a damage skill, for comparing against the free Attack:
// multi-hit totals count, execute range boosts value against weakened foes,
// and — the combo-AI hook (2026-07-25) — setup→payoff moves surge in value
// when the foe is CARRYING the status they exploit, so the policy tree
// naturally cashes combos without a bespoke branch. maxHpDmg tools likewise
// rank by what they'd actually add against THIS foe.
function effPower(mv: Move, foe: Combatant): number {
  const e = mv.effects
  const avgHits = e?.hits ? (e.hits[0] + e.hits[1]) / 2 : 1
  let p = mv.power * avgHits
  if (e?.execute && foe.hp / foe.maxHp <= e.execute) p *= 1.5
  if (e?.bonusVsStatus && hasStatus(foe, e.bonusVsStatus.kind)) p *= e.bonusVsStatus.mult
  if (e?.maxHpDmg) p += foe.maxHp * e.maxHpDmg
  // Element-aware (2026-07-25 review fix): the damage calc has always applied
  // the body-type resist/weak multiplier, but the AI never consulted it when
  // ranking moves — so a caster would happily throw a resisted element when a
  // neutral or super-effective option sat in the same loadout.
  if (mv.element) p *= elementMultiplier(foe.m.species.body, mv.element)
  // First-strike tools ranked at their real value when the foe hasn't acted
  // yet this round (the hit resolves immediately, so live state is correct).
  if (e?.firstStrikeMult && !foe.actedThisRound) p *= e.firstStrikeMult
  return p
}

// Class battle personality (user spec 2026-07-21): each class tunes the SAME
// policy tree below rather than getting a bespoke one — Tanks shield early and
// block often, Sages heal at the first scratch, Wizards chain spells and
// charge mana instead of parrying, Rogues just keep swinging, Bards/Orators
// open with the band. Keyed off className, which is recomputed from CURRENT
// stats at fight time (classes are emergent, never species-locked).
interface ClassPersonality {
  healAt: number // hpFrac below which healing/guarding-up kicks in
  blockWhenHurt: number // % chance to block when hurt with a real hit incoming
  openBuff: number // % chance to open with a buff while healthy
  debuff: number // % chance to land a debuff/control move on a threat
  blockToCharge: number // % chance to block a turn to charge mana for a skill
  parry: number // % chance to block against a heavy incoming threat
  aggro: number // shifts the "damage skill worth its MP" threshold; negative = spammier
}
const DEFAULT_PERSONALITY: ClassPersonality = { healAt: 0.45, blockWhenHurt: 55, openBuff: 40, debuff: 35, blockToCharge: 50, parry: 35, aggro: 0 }

// Temperament tactic (2026-07-25): an additive layer over the class
// personality — the player's coaching adjusts the class's instincts rather
// than replacing them. 'balanced' is all zeros, so the default reproduces the
// untuned class personality EXACTLY (golden-battle safe).
const TEMPERAMENT_MOD: Record<Temperament, Partial<ClassPersonality>> = {
  aggressive: { healAt: -0.12, blockWhenHurt: -25, openBuff: -15, blockToCharge: -15, parry: -20, aggro: -4 },
  balanced: {},
  cautious: { healAt: 0.12, blockWhenHurt: 20, openBuff: 10, blockToCharge: 10, parry: 20, aggro: 4 },
}
// Mana policy (wave 2): a second additive coaching layer — conserve raises
// the "worth its MP" bar and charges more; burst lowers both. 'normal' is all
// zeros (inert).
const MANA_POLICY_MOD: Record<ManaPolicy, Partial<ClassPersonality>> = {
  normal: {},
  conserve: { aggro: 6, blockToCharge: 20 },
  burst: { aggro: -8, blockToCharge: -20 },
}
function personalityFor(self: Combatant): ClassPersonality {
  const p = { ...DEFAULT_PERSONALITY, ...CLASS_PERSONALITY[self.m.className] }
  const t = TEMPERAMENT_MOD[self.m.tactics?.temperament ?? 'balanced']
  const mp = MANA_POLICY_MOD[self.m.tactics?.manaPolicy ?? 'normal']
  return {
    healAt: Math.min(0.9, Math.max(0.05, p.healAt + (t.healAt ?? 0))),
    blockWhenHurt: Math.min(95, Math.max(0, p.blockWhenHurt + (t.blockWhenHurt ?? 0))),
    openBuff: Math.min(95, Math.max(0, p.openBuff + (t.openBuff ?? 0))),
    debuff: p.debuff,
    blockToCharge: Math.min(95, Math.max(0, p.blockToCharge + (t.blockToCharge ?? 0) + (mp.blockToCharge ?? 0))),
    parry: Math.min(95, Math.max(0, p.parry + (t.parry ?? 0))),
    aggro: p.aggro + (t.aggro ?? 0) + (mp.aggro ?? 0),
  }
}
const CLASS_PERSONALITY: Record<string, Partial<ClassPersonality>> = {
  Tank: { healAt: 0.5, blockWhenHurt: 75, openBuff: 65, debuff: 60, parry: 55 }, // shields up early, taunts, blocks often
  Spellshield: { healAt: 0.55, blockWhenHurt: 70, openBuff: 60, parry: 50 },
  Warrior: { blockWhenHurt: 35, openBuff: 25, parry: 20, aggro: -4 }, // keeps swinging
  Rogue: { blockWhenHurt: 25, openBuff: 20, parry: 15, aggro: -4 }, // all-out
  Ranger: { debuff: 45, parry: 30 },
  Wizard: { blockToCharge: 80, openBuff: 15, aggro: -6 }, // chains spells; charges when dry
  Spellsword: { blockToCharge: 65, aggro: -4 },
  Sage: { healAt: 0.65, openBuff: 55, blockToCharge: 70 }, // heals early and often
  Orator: { openBuff: 70, debuff: 60 },
  Bard: { openBuff: 75, debuff: 55, blockWhenHurt: 45 },
  Captain: { openBuff: 50, aggro: -2 }, // buff the line, then brawl
}

// The per-turn choice: skill vs Attack vs Block. One shared policy tree, tuned
// per class via CLASS_PERSONALITY above. Takes a single representative `foe`
// (the AI's primary threat read) — target FAN-OUT for the move it picks is
// resolved separately once the move is actually cast (see resolveTargets).
function chooseAction(self: Combatant, foe: Combatant, rng: RNG, allies: Combatant[] = []): Action {
  const p = personalityFor(self)
  // Silenced: skills are sealed — Attack, or Block if something heavy is coming.
  if (hasStatus(self, 'silence')) {
    const silencedThreats = foe.m.loadout.filter((mv) => (foe.cooldowns[mv.id] ?? 0) <= 1 && moveCost(mv) <= foe.mana)
    const incoming = Math.max(ATTACK_POWER, ...silencedThreats.filter((mv) => mv.type === 'damage').map((mv) => effPower(mv, self)))
    if (self.hp / self.maxHp < p.healAt && incoming >= 20 && chance(rng, p.blockWhenHurt)) return { kind: 'block' }
    return { kind: 'attack' }
  }
  const ready = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  // Scripted opener (wave 2): the designated first play. Fires on this
  // monster's first real action if the move is still equipped and castable —
  // otherwise the script is simply dropped (openerPending clears either way
  // in takeTurn). No rng consumed; monsters without an opener are untouched.
  if (self.openerPending) {
    const opener = ready.find((mv) => mv.id === self.m.tactics?.openerId)
    if (opener) return { kind: 'skill', move: opener }
  }
  // Strongest heal first (2026-07-25 review fix: `heals[0]` used to be loadout
  // order, so a monster carrying Purge AND Vital Surge could "emergency heal"
  // for 10 when 46 was equally ready).
  const heals = ready.filter((mv) => mv.type !== 'damage' && mv.power > 0).sort((a, b) => b.power - a.power)
  const dmgs = ready.filter((mv) => mv.type === 'damage').sort((a, b) => effPower(b, foe) - effPower(a, foe))
  // timed buffs not currently active (or about to expire — worth refreshing);
  // debuffs the foe isn't currently suffering from (or is about to shake off)
  const activeFor = (id: string) => (c: Combatant) => c.mods.find((m) => m.moveId === id)
  const buffs = ready.filter((mv) => mv.type !== 'damage' && mv.power === 0 && mv.target !== 'enemy' && mv.target !== 'allEnemies'
    && !(isTimedBuff(mv) && (activeFor(mv.id)(self)?.turnsLeft ?? 0) > 1))
  const hostiles = ready.filter((mv) => mv.type !== 'damage' && (mv.target === 'enemy' || mv.target === 'allEnemies')
    && !(isDebuffMove(mv) && (activeFor(mv.id)(foe)?.turnsLeft ?? 0) > 1))
  const hpFrac = self.hp / self.maxHp

  // What the foe can plausibly throw next turn (AI may peek — it's a sim).
  const foeThreats = foe.m.loadout.filter((mv) => (foe.cooldowns[mv.id] ?? 0) <= 1 && moveCost(mv) <= foe.mana + manaRegen(foe.m.stats))
  const threat = Math.max(ATTACK_POWER, ...foeThreats.filter((mv) => mv.type === 'damage').map((mv) => effPower(mv, self)))

  // Emergency heal beats everything. Prefer a heal that can actually reach
  // SELF (self/team target) — an 'ally'-target heal goes to the neediest
  // teammate instead, which is no rescue for the dying caster; it's still the
  // fallback when it's all that's equipped (and in a solo fight it self-casts).
  if (hpFrac < p.healAt && heals.length) {
    return { kind: 'skill', move: heals.find((mv) => mv.target !== 'ally') ?? heals[0] }
  }

  // Hurt with a real hit incoming → guard up (how often is personality).
  if (hpFrac < p.healAt && threat >= 20 && chance(rng, p.blockWhenHurt)) return { kind: 'block' }

  // Protect order (2026-07-25 tactics): a designated protect target is in
  // real trouble → a guardian with a taunt ready throws it NOW, pulling the
  // enemy's single-target attacks onto itself, ahead of its usual buff/debuff
  // instincts. No rng consumed when no protect target exists, so battles
  // without the tactic replay identically.
  const ward = allies.find((a) => a.m.protect && a.hp > 0 && a.hp / a.maxHp < 0.6)
  if (ward && !(foe.tauntedBy && foe.tauntedBy.side === self.side && foe.tauntedBy.slot === self.slot)) {
    const taunt = ready.find((mv) => mv.effects?.tauntForce)
    if (taunt) return { kind: 'skill', move: taunt }
  }

  // Open with a buff (or shield up) while still healthy.
  if (buffs.length && hpFrac > 0.6 && chance(rng, p.openBuff)) return { kind: 'skill', move: buffs[0] }

  // Land a debuff / control move on a threatening foe.
  if (hostiles.length && threat >= 18 && chance(rng, p.debuff)) return { kind: 'skill', move: hostiles[0] }

  // Work the combo (wave 2): payoff's status is live -> cash it NOW; not live
  // -> cast a setup for an equipped payoff, and HOLD the payoff itself out of
  // the generic ranking below (raw power made Bloodletter fire on cooldown
  // instead of waiting — the exact failure documented in the item -25 sims).
  let dmgPool = dmgs
  if (self.m.tactics?.comboDiscipline) {
    const livePayoff = dmgs.find((mv) => mv.effects?.bonusVsStatus && hasStatus(foe, mv.effects.bonusVsStatus.kind))
    if (livePayoff) return { kind: 'skill', move: livePayoff }
    const payoffKinds = new Set(self.m.loadout.filter((mv) => mv.effects?.bonusVsStatus).map((mv) => mv.effects!.bonusVsStatus!.kind))
    const setup = ready.find((mv) => mv.status && payoffKinds.has(mv.status.kind) && !hasStatus(foe, mv.status.kind))
    if (setup) return { kind: 'skill', move: setup }
    dmgPool = dmgs.filter((mv) => !(mv.effects?.bonusVsStatus && payoffKinds.has(mv.effects.bonusVsStatus.kind)))
  }

  // A damage skill is worth its MP if it clearly out-hits a basic Attack, or if
  // it carries a status/debuff rider that a plain Attack never could. Aggro
  // (negative for damage classes) widens what counts as "worth it."
  const worthIt = dmgPool.filter((mv) => effPower(mv, foe) >= ATTACK_POWER + 4 + p.aggro
    || ((mv.status !== undefined || isDebuffMove(mv) || mv.effects?.manaBurn !== undefined) && effPower(mv, foe) >= ATTACK_POWER - 4 + p.aggro))
  if (worthIt.length) return { kind: 'skill', move: worthIt[0] }

  // Nothing affordable, but one more turn of regen unlocks a skill → block to charge.
  if (ready.length === 0) {
    const upcoming = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 1).map(moveCost)
    const cheapest = upcoming.length ? Math.min(...upcoming) : Infinity
    if (self.mana + manaRegen(self.m.stats) + self.innate.regen + self.regenMod >= cheapest && chance(rng, p.blockToCharge)) return { kind: 'block' }
  }

  // No worthwhile skill this turn and the foe threatens something heavy → parry window.
  if (threat >= 25 && chance(rng, p.parry)) return { kind: 'block' }

  return { kind: 'attack' }
}

// Wild-instinct flub: an untamed monster ignores the smart policy above and
// does something random instead — any ready skill, or Attack, or Block, each
// equally likely. HIDDEN stat (user spec 2026-07-21) — never surfaced in any
// UI, only felt through occasional erratic play from wild/rival monsters.
function wildAction(self: Combatant, rng: RNG): Action {
  const ready = hasStatus(self, 'silence') ? [] // silence seals skills for wild monsters too
    : self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  const options: Action[] = [{ kind: 'attack' }, { kind: 'block' }, ...ready.map((mv): Action => ({ kind: 'skill', move: mv }))]
  return options[Math.floor(rng() * options.length)]
}

// Upsert a timed mod onto `mods` by move id — refreshes duration on recast
// instead of stacking a second copy — then rebuild the cached totals.
function upsertMod(c: Combatant, moveId: string, duration: number, fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'>): void {
  const existing = c.mods.find((m) => m.moveId === moveId)
  if (existing) existing.turnsLeft = duration
  else c.mods.push({ moveId, turnsLeft: duration, ...fields })
  recomputeMods(c)
}

// Land a debuff's timed effects on the target (round-limited). tauntForce is
// LIVE (2026-07-21): the target's single-target hostile actions are forced
// onto the attacker for the move's duration.
function applyDebuffs(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[]): void {
  const e = move.effects
  if (!e) return
  // innate debuffExtend (e.g. Hive Command): rolled once on apply — the curse lingers a round longer
  let duration = e.duration ?? 3
  const extended = attacker.innate.debuffExtend > 0 && chance(rng, attacker.innate.debuffExtend)
  if (extended) duration += 1
  // 50 CHA = 1% shaved off incoming debuff magnitudes (charisma deflects
  // scorn); innate debuffResist (e.g. Cold Blood) stacks on top.
  const dr = Math.max(0, 1 - debuffReduction(target.m.stats) - target.innate.debuffResist / 100)
  const fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'> = {}
  const notes: string[] = []
  if (e.atkDebuff) { fields.atkDebuff = e.atkDebuff * dr; notes.push(`−${Math.round(e.atkDebuff * dr * 100)}% damage`) }
  if (e.defDebuff) { fields.defDebuff = e.defDebuff * dr; notes.push(`−${Math.round(e.defDebuff * dr)} mitigation`) }
  if (e.accDebuff) { fields.accDebuff = e.accDebuff * dr; notes.push(`−${Math.round(e.accDebuff * dr)}% accuracy`) }
  if (notes.length) {
    upsertMod(target, move.id, duration, fields)
    const resistNote = dr < 1 ? ` (${Math.round((1 - dr) * 100)}% resisted)` : ''
    const lingerNote = extended ? ' — it lingers!' : ''
    log.push(`    ${target.m.name} is weakened for ${duration} rounds: ${notes.join(', ')}${resistNote}${lingerNote}.`)
  }
  if (e.tauntForce && target.side !== attacker.side) {
    target.tauntedBy = { side: attacker.side, slot: attacker.slot, turnsLeft: duration }
    log.push(`    ${target.m.name} is taunted — forced to attack ${attacker.m.name} for ${duration} rounds!`)
  }
}

// Apply a move's beneficial effects to one recipient: guard, ward, cleanse,
// timed buffs. Called per-target for 'team'/'ally' fan-out, so a party buff
// genuinely buffs every living ally, not just the caster. `caster` carries the
// innate buffExtend roll (e.g. Encore) — the CASTER's gift, whoever receives it.
function applyBeneficialEffects(caster: Combatant, target: Combatant, move: Move, rng: RNG, log: string[]): void {
  const e = move.effects
  if (!e) return
  const notes: string[] = []
  if (e.guard) { target.guard += e.guard + Math.round(target.m.stats.CON * 0.1); notes.push(`guard ${target.guard}`) }
  if (e.ward) { target.ward += e.ward; notes.push(`${target.ward} HP shield`) }
  if (e.cleanse && target.statuses.some((s) => !BENEFICIAL_STATUSES.has(s.kind))) { cleanseStatuses(target); notes.push('ailments cleansed') }
  if (isTimedBuff(move)) {
    let duration = e.duration ?? 3
    if (caster.innate.buffExtend > 0 && chance(rng, caster.innate.buffExtend)) { duration += 1; notes.push('encore!') }
    const fields: Omit<ActiveMod, 'moveId' | 'turnsLeft'> = {}
    if (e.atkBuff) { fields.atkBuff = e.atkBuff; notes.push(`+${Math.round(e.atkBuff * 100)}% damage`) }
    if (e.defBuff) { fields.defBuff = e.defBuff; notes.push(`+${e.defBuff} mitigation`) }
    if (e.dodgeBuff) { fields.dodgeBuff = e.dodgeBuff; notes.push(`+${e.dodgeBuff}% dodge`) }
    if (e.accBuff) { fields.accBuff = e.accBuff; notes.push(`+${e.accBuff}% accuracy`) }
    if (e.regenBuff) { fields.regenBuff = e.regenBuff; notes.push(`+${e.regenBuff} regen`) }
    if (e.thorns) { fields.thorns = e.thorns; notes.push(`thorns ${e.thorns}`) }
    if (e.hpRegenBuff) { fields.hpRegenBuff = e.hpRegenBuff; notes.push(`+${e.hpRegenBuff} HP/turn`) }
    upsertMod(target, move.id, duration, fields)
    notes.push(`${duration} rounds`)
  }
  if (notes.length) log.push(`    (${notes.join(', ')})`)
}

// The living combatant this taunted attacker is FORCED to strike, if any.
function tauntTargetOf(attacker: Combatant, ctx: BattleContext): Combatant | null {
  if (!attacker.tauntedBy) return null
  const t = ctx.all.find((c) => c.side === attacker.tauntedBy!.side && c.slot === attacker.tauntedBy!.slot && c.hp > 0)
  if (!t) { attacker.tauntedBy = null; return null } // taunter fell — compulsion breaks
  return t
}

// Resolve WHO a move actually affects, given the live battlefield. This is the
// crux of real team battles — previously every non-self/enemy target silently
// collapsed onto "the only other fighter." Confusion's redirect-to-self roll
// happens here, ONCE per move cast (matching the original single roll per
// resolveMove call), and only actually redirects for single-target 'enemy'
// moves — an 'allEnemies' volley under confusion still goes out (scoped this
// way deliberately; a "confusion cancels the whole volley" reading wasn't
// specified and isn't a strict subset of the old single-target behavior).
// Precedence for 'enemy' moves: confusion (self) > charm (own ally) > taunt
// (forced) > lowest-HP%. Charm (2026-07-25) is confusion's team-battle
// sibling — same single-target-only scoping as confusion (an 'allEnemies'
// volley isn't redirected by either), inert in a solo-team fight (falls
// through to normal targeting when there's no ally to strike).
function resolveTargets(attacker: Combatant, ctx: BattleContext, move: Move, rng: RNG, log: string[]): Combatant[] {
  const confused = hasStatus(attacker, 'confusion') && chance(rng, 20)
  if (confused) log.push(`  ${attacker.m.name} is confused and turns on itself!`)
  const charmed = !confused && hasStatus(attacker, 'charm') && alliesOf(ctx, attacker).length > 0

  switch (move.target) {
    case 'self':
      return [attacker]
    case 'team':
      return [attacker, ...alliesOf(ctx, attacker)]
    case 'ally': {
      const allies = alliesOf(ctx, attacker)
      // no other living ally (solo team, or the last one standing) → falls
      // back to self, preserving exactly today's Wood/Copper-league behavior
      return [allies.length ? pickAllyTarget(allies) : attacker]
    }
    case 'allEnemies':
      return enemiesOf(ctx, attacker) // may be empty if the enemy team just wiped this round
    case 'enemy':
    default: {
      if (confused) return [attacker]
      if (charmed) {
        log.push(`  ${attacker.m.name} is charmed and turns on its own team!`)
        return [pickAllyTarget(alliesOf(ctx, attacker))]
      }
      const forced = tauntTargetOf(attacker, ctx)
      if (forced) return [forced]
      const foes = enemiesOf(ctx, attacker)
      if (!foes.length) return []
      // Formation (wave 2): single-target MELEE can only reach the front line
      // while it stands; every other channel shoots straight over it. AoE and
      // compulsions (above) are untouched.
      const reachable = move.channel === 'melee'
        ? (foes.some((f) => f.row === 'front') ? foes.filter((f) => f.row === 'front') : foes)
        : foes
      // Mark (wave 2): the coach's kill order — a scouted-and-marked enemy is
      // every teammate's first choice while it lives and can be reached.
      const marked = reachable.find((f) => f.m.marked)
      if (marked) return [marked]
      return [pickEnemyTargetFor(attacker, reachable, ctx)]
    }
  }
}

// Non-damage, non-hostile move landing on one recipient (self, an ally, or a
// team-mate in a 'team' fan-out).
function resolveUtilityOnTarget(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[]): void {
  let heal = 0
  if (move.power > 0) {
    heal = Math.round(move.power * 1.2 * (hasStatus(target, 'healblock') ? HEALBLOCK_MULT : 1))
    target.hp = Math.min(target.maxHp, target.hp + heal)
    log.push(target === attacker
      ? `  ${attacker.m.name} uses ${move.name}, healing ${heal} HP${hasStatus(target, 'healblock') ? ' (healblocked)' : ''}.`
      : `  ${attacker.m.name} uses ${move.name} on ${target.m.name}, healing ${heal} HP${hasStatus(target, 'healblock') ? ' (healblocked)' : ''}.`)
  } else {
    log.push(target === attacker ? `  ${attacker.m.name} uses ${move.name}.` : `  ${attacker.m.name} uses ${move.name} on ${target.m.name}.`)
  }
  applyBeneficialEffects(attacker, target, move, rng, log)
  // A beneficial move can carry a status too — currently only used for the
  // one beneficial status, haste (e.g. a self-cast "Haste Self"-style move).
  // No CHA debuffBonus roll here (that's a hostile-proc bonus, not relevant
  // to granting your own team a buff).
  if (move.status && chance(rng, move.status.chance)) {
    applyStatus(target, move.status.kind, move.status.duration)
    log.push(BENEFICIAL_STATUSES.has(move.status.kind)
      ? `    ${target.m.name} gains ${move.status.kind}!`
      : `    ${target.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: move.status.kind })
  }
  ev.push({ kind: 'utility', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, heal, hostile: false })
}

// Hostile non-damage move (debuff/control) landing on one enemy — looped per
// fanned target for 'allEnemies'.
function resolveHostileUtilityOnTarget(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[]): void {
  const e = move.effects
  let hacc = move.accuracy + attacker.innate.acc + attacker.accMod
  if (hasStatus(attacker, 'blind')) hacc -= 25
  const hdodge = dodgeChance(target.m.stats) + target.innate.dodge + target.dodgeMod + target.blockAvoid
  if (!chance(rng, Math.max(5, hacc - hdodge))) {
    if (target.blockAvoid > 0) log.push(`  🛡 ${target.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${target.m.name}.`)
    ev.push({ kind: 'miss', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, channel: move.channel, blocked: target.blockAvoid > 0 })
    return
  }
  log.push(`  ${attacker.m.name} uses ${move.name} on ${target.m.name}.`)
  ev.push({ kind: 'utility', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, heal: 0, hostile: true })
  applyDebuffs(attacker, target, move, rng, log)
  if (e?.manaBurn) {
    const burned = Math.min(target.mana, e.manaBurn)
    target.mana -= burned
    if (burned > 0) log.push(`    ${target.m.name} loses ${burned} MP.`)
  }
  if (move.status && chance(rng, move.status.chance + debuffBonus(attacker.m.stats))) {
    applyStatus(target, move.status.kind, move.status.duration)
    log.push(`    ${target.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: move.status.kind })
  }
}

// A single damage hit landing on one target — looped per fanned target for
// 'allEnemies', each with its OWN independent accuracy/variance/crit/mitigation
// roll (never one roll multiplied by target count). `openerEligible` is
// computed ONCE by the caller before the fan-out loop, so a multi-target
// opening volley grants the bonus to every target it strikes, not just
// whichever one happens to be processed first.
function resolveDamageOnTarget(attacker: Combatant, target: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[], openerEligible: boolean): void {
  const e = move.effects
  let acc = move.accuracy + attacker.innate.acc + attacker.accMod
  if (hasStatus(attacker, 'blind')) acc -= 25
  const dodge = dodgeChance(target.m.stats) + target.innate.dodge + target.dodgeMod + target.blockAvoid
  if (!chance(rng, Math.max(5, acc - dodge))) {
    if (target.blockAvoid > 0) log.push(`  🛡 ${target.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${target.m.name}.`)
    ev.push({ kind: 'miss', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot, move: move.name, channel: move.channel, blocked: target.blockAvoid > 0 })
    return
  }

  const atk = attackStat(attacker.m.stats, move.channel)
  const variance = 0.85 + rng() * 0.3
  const hits = e?.hits ? randInt(rng, e.hits[0], e.hits[1]) : 1
  // softened growth curve so high-stat monsters don't one-shot before defense
  // matters; stat multiplier halved pool-wide (user spec 2026-07-19)
  let dmg = move.power * hits * Math.pow(atk / 40, 0.8) * 0.5 * variance
  dmg *= happinessMultiplier(attacker.happiness) // happy monsters hit harder (§2.4)
  dmg *= attacker.staminaMult // fatigue: tired monsters hit softer, all channels
  dmg *= attacker.innate.dmgMult * attacker.atkMod
  // conditional damage windows: desperation below 30% HP, composure above 70%
  if (attacker.hp / attacker.maxHp < 0.3) dmg *= attacker.innate.lowHpDmgMult
  if (attacker.hp / attacker.maxHp > 0.7) dmg *= attacker.innate.highHpDmgMult
  if (openerEligible) {
    dmg *= attacker.innate.firstHitMult
    log.push(`  ${attacker.m.name}'s opening strike hits with full force!`)
  }
  // critical hit: 50 DEX = 1% chance to deal double damage (+ innate crit)
  let crit = false
  if (chance(rng, critChance(attacker.m.stats) + attacker.innate.crit)) {
    dmg *= 2
    crit = true
  }
  // execute: heavy bonus against weakened targets (skill effect and/or innate)
  let execNote = ''
  if (e?.execute && target.hp / target.maxHp <= e.execute) {
    dmg *= 1.5
    execNote = ' — executes!'
  }
  if (attacker.innate.executeMult > 1 && target.hp / target.maxHp < 0.3) {
    dmg *= attacker.innate.executeMult
    if (!execNote) execNote = ' — executes!'
  }
  // vulnerable status: the target takes more from EVERY source while marked
  if (hasStatus(target, 'vulnerable')) dmg *= VULNERABLE_MULT
  // first-strike tools: bonus damage if the target hasn't acted yet this round
  // (attacker got there first) — a speed-differential reward, not a status;
  // rolls against the LIVE initiative order, so haste/knockback shifts matter.
  if (e?.firstStrikeMult && !target.actedThisRound) dmg *= e.firstStrikeMult
  // giant-killer tools: bonus damage scaled off the TARGET's max HP
  if (e?.maxHpDmg) dmg += target.maxHp * e.maxHpDmg
  // setup→payoff combos: extra damage vs a target carrying the right status,
  // optionally consuming it (all stacks) when cashed
  if (e?.bonusVsStatus && hasStatus(target, e.bonusVsStatus.kind)) {
    dmg *= e.bonusVsStatus.mult
    if (e.bonusVsStatus.consume) {
      target.statuses = target.statuses.filter((s) => s.kind !== e.bonusVsStatus!.kind)
      log.push(`    ${attacker.m.name} exploits ${target.m.name}'s ${e.bonusVsStatus.kind}!`)
    }
  }
  // elemental affinity: resisted or super-effective vs the target's body type (§8.5)
  let effNote = ''
  if (move.element) {
    const em = elementMultiplier(target.m.species.body, move.element)
    dmg *= em * attacker.innate.elemDmgMult // innate elemental mastery only ever amplifies elemental moves
    if (em > 1) effNote = ' — super effective!'
    else if (em < 1) effNote = ' — resisted'
  }
  // physical channels mitigated by target CON + guard; magic/voice/support by WIS
  // (§11); buffs/shreds shift it; pierce ignores a fraction of the total.
  // CON coefficient trimmed 0.06 → 0.05 (2026-07-25) — part of the anti-tank-
  // dominance package alongside the giant-killer maxHpDmg tools.
  let mitigation = ((move.channel === 'melee' || move.channel === 'ranged')
    ? target.m.stats.CON * 0.05 + target.guard
    : target.m.stats.WIS * 0.05) + target.innate.flatDR + target.defFlat
  // skill pierce + innate pierce + STR's own armour-breaking (100 STR = 1% of mitigation ignored)
  mitigation = Math.max(0, mitigation) * (1 - Math.min(1, (e?.pierce ?? 0) + attacker.innate.pierce + mitigationPierce(attacker.m.stats)))
  dmg = Math.max(1, Math.round(dmg - mitigation))

  // ward shields soak damage before health
  let wardNote = ''
  let absorbed = 0
  if (target.ward > 0) {
    absorbed = Math.min(target.ward, dmg)
    target.ward -= absorbed
    dmg -= absorbed
    wardNote = ` (${absorbed} absorbed by shield)`
  }
  target.hp -= dmg
  attacker.hasLandedHit = true
  if (dmg > 0) wakeIfSleeping(target, log)

  const hitNote = hits > 1 ? ` (${hits} hits)` : ''
  const notes: string[] = []
  // lifesteal: innate and skill effects stack; healblock on the ATTACKER dulls
  // its own drain (grievous wounds don't knit shut just because you spilled blood)
  let stolen = 0
  const steal = attacker.innate.lifesteal + (e?.lifesteal ?? 0)
  if (steal > 0 && dmg > 0) {
    stolen = Math.max(1, Math.round(dmg * steal * (hasStatus(attacker, 'healblock') ? HEALBLOCK_MULT : 1)))
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + stolen)
    notes.push(`drains ${stolen} HP`)
  }
  // mana steal: drains the target's mana into the attacker's own pool
  if (attacker.innate.manaSteal > 0 && dmg > 0) {
    const sip = Math.min(Math.round(target.mana), Math.max(1, Math.round(dmg * attacker.innate.manaSteal)))
    if (sip > 0) {
      target.mana -= sip
      attacker.mana = Math.min(attacker.maxMana, attacker.mana + sip)
      notes.push(`steals ${sip} MP`)
    }
  }
  let burned = 0
  if (e?.manaBurn) {
    burned = Math.min(target.mana, e.manaBurn)
    target.mana -= burned
    if (burned > 0) notes.push(`burns ${burned} MP`)
  }
  // thorns: the wearer punishes every hit landed on it with flat reflect damage
  if (target.thornsFlat > 0 && dmg > 0) {
    attacker.hp -= target.thornsFlat
    notes.push(`${target.thornsFlat} thorns`)
  }
  let recoil = 0
  if (e?.recoil) {
    recoil = Math.max(1, Math.round(dmg * e.recoil))
    attacker.hp -= recoil
    notes.push(`${recoil} recoil`)
  }
  const noteStr = notes.length ? ` (${notes.join(', ')})` : ''
  const critNote = crit ? ' — CRITICAL HIT!' : ''
  log.push(`  ${attacker.m.name} uses ${move.name}${hitNote} → ${dmg} damage to ${target.m.name}${critNote}${execNote}${effNote}${wardNote}${noteStr}.`)
  ev.push({
    kind: 'hit', side: attacker.side, slot: attacker.slot, targetSide: target.side, targetSlot: target.slot,
    move: move.name, channel: move.channel, element: move.element,
    dmg, hits, crit, execute: execNote !== '', eff: effNote.includes('super') ? 'super' : effNote.includes('resisted') ? 'resist' : null,
    lifesteal: stolen, manaBurn: burned, recoil, warded: absorbed, self: target === attacker,
  })

  // rider effect: armour shred / attack-down on damage moves (per-target)
  applyDebuffs(attacker, target, move, rng, log)

  // Apply status (50 CHA = +1% proc chance — the pool-wide 50% cap applies to
  // base move design only; CHA may push the effective chance past it)
  if (move.status && chance(rng, move.status.chance + debuffBonus(attacker.m.stats))) {
    applyStatus(target, move.status.kind, move.status.duration)
    log.push(`    ${target.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: move.status.kind })
  }
  // Innate status-on-hit (e.g. Venom Fang, Crest Display): a small chance to
  // afflict on EVERY damaging hit, whatever the move — rolled independently of
  // any move-carried status, no CHA bonus (it's venom, not persuasion).
  const soh = attacker.innate.statusOnHit
  if (soh && target.hp > 0 && !hasStatus(target, soh.kind) && chance(rng, soh.chance)) {
    applyStatus(target, soh.kind, soh.duration)
    log.push(`    ${target.m.name} is afflicted with ${soh.kind}!`)
    ev.push({ kind: 'status', side: target.side, slot: target.slot, status: soh.kind })
  }
}

// Orchestrator: resolve targets once, pay the cost once, then fan the move out
// across every resolved target through the appropriate per-target resolver.
function resolveMove(attacker: Combatant, ctx: BattleContext, move: Move, rng: RNG, log: string[], ev: BattleEvent[], freeCast = false): void {
  const targets = resolveTargets(attacker, ctx, move, rng, log)
  if (!freeCast) { // an INT echo repeats the cast without paying again
    attacker.cooldowns[move.id] = move.cooldown
    attacker.mana = Math.max(0, attacker.mana - moveCost(move))
  }
  if (!targets.length) return // e.g. the enemy team was already wiped by an earlier actor this round

  if (move.type !== 'damage') {
    const hostile = move.target === 'enemy' || move.target === 'allEnemies'
    if (!hostile) { for (const t of targets) resolveUtilityOnTarget(attacker, t, move, rng, log, ev); return }
    for (const t of targets) resolveHostileUtilityOnTarget(attacker, t, move, rng, log, ev)
    // Self-guard rider on a HOSTILE utility (2026-07-25 review fix): this
    // branch used to return without it, so Bulwark's Challenge — a 'debuff'
    // move whose whole design is "mass taunt AND brace behind guard 20" —
    // never actually received its guard. Only the damage branch's identical
    // rider below ever ran.
    if (move.effects?.guard) applyBeneficialEffects(attacker, attacker, move, rng, log)
    return
  }

  const e = move.effects
  const openerEligible = !attacker.hasLandedHit && attacker.innate.firstHitMult > 1
  // Record this side's engagement for the 'focus' target-priority tactic —
  // teammates who follow the focus order strike whoever the side hit last.
  if (targets[0].side !== attacker.side) ctx.focus[attacker.side] = { side: targets[0].side, slot: targets[0].slot }
  for (const t of targets) resolveDamageOnTarget(attacker, t, move, rng, log, ev, openerEligible)
  // self-guard follow-up on a damage move stays targeted at the attacker
  // specifically (a "hit and raise a shield" rider), once per cast — not once
  // per fanned target.
  if (e?.guard) applyBeneficialEffects(attacker, attacker, move, rng, log)
}

function takeTurn(attacker: Combatant, ctx: BattleContext, rng: RNG, log: string[], ev: BattleEvent[]): void {
  // Reaching this call IS "acting this round" for firstStrikeMult purposes —
  // set unconditionally, before any stun/fear/sleep short-circuit, since even
  // a skipped turn means this combatant's initiative slot has passed.
  attacker.actedThisRound = true
  // A Block stance lasts until the blocker's next action — it ends now. Guard
  // works the same way (2026-07-25 review fix): it used to vanish after ONE
  // landed hit, which contradicted its "until next action" description and
  // gutted tanks in team fights — Bulwark's Challenge taunts up to 6 enemies
  // onto the guardian, and the guard evaporated on the first of those hits.
  // Now every hit until the guardian's next turn is mitigated.
  attacker.blockAvoid = 0
  attacker.guard = 0
  // regen mana (innate mana engines + regen buffs add to it) and HP (25 CON = 1/turn)
  attacker.mana = Math.min(attacker.maxMana, attacker.mana + manaRegen(attacker.m.stats) + attacker.innate.regen + attacker.regenMod)
  const hpRegenMult = hasStatus(attacker, 'healblock') ? HEALBLOCK_MULT : 1
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + (hpRegen(attacker.m.stats) + attacker.innate.hpRegen + attacker.hpRegenMod) * hpRegenMult)

  if (hasStatus(attacker, 'stun')) { log.push(`  ${attacker.m.name} is stunned and cannot act.`); ev.push({ kind: 'skip', side: attacker.side, slot: attacker.slot, reason: 'stun' }); return }
  if (hasStatus(attacker, 'fear')) { log.push(`  ${attacker.m.name} flees in fear and loses its action.`); ev.push({ kind: 'skip', side: attacker.side, slot: attacker.slot, reason: 'fear' }); return }
  if (hasStatus(attacker, 'sleep')) { log.push(`  ${attacker.m.name} is fast asleep.`); ev.push({ kind: 'skip', side: attacker.side, slot: attacker.slot, reason: 'sleep' }); return }

  const enemies = enemiesOf(ctx, attacker)
  if (!enemies.length) return // this monster's own team already won mid-round — nothing to act against


  // The per-turn choice: skill (costs MP) vs free Attack vs free Block. Wild
  // (low-tameness) monsters occasionally ignore the smart policy — undefined
  // tameness (player monsters) never rolls, so this only ever fires for
  // generated/rival monsters (see rollTameness in monster.ts). `chooseAction`
  // is fed a single representative foe (the taunter if taunted, else the
  // lowest-HP% living enemy) for its threat heuristics; the move it picks
  // resolves its REAL target(s) separately.
  const primaryFoe = tauntTargetOf(attacker, ctx) ?? pickEnemyTargetFor(attacker, enemies, ctx)
  const tameness = attacker.m.tameness
  const action = (tameness !== undefined && chance(rng, 100 - tameness))
    ? wildAction(attacker, rng)
    : chooseAction(attacker, primaryFoe, rng, alliesOf(ctx, attacker))
  attacker.openerPending = false // the scripted opener rides on the FIRST action only, cast or not
  if (action.kind === 'block') {
    attacker.blockAvoid = blockValue(attacker)
    log.push(`  🛡 ${attacker.m.name} braces to block (+${attacker.blockAvoid}% avoid).`)
    ev.push({ kind: 'stance', side: attacker.side, slot: attacker.slot, avoid: attacker.blockAvoid })
    return
  }
  resolveMove(attacker, ctx, action.kind === 'attack' ? basicAttack(attacker.m) : action.move, rng, log, ev)
  // 100 INT = 1% chance a skill casts twice (free — no extra MP, same cooldown); innate echo stacks
  if (action.kind === 'skill' && attacker.hp > 0 && enemiesOf(ctx, attacker).length > 0 && chance(rng, echoChance(attacker.m.stats) + attacker.innate.echo)) {
    log.push(`  ✨ ${attacker.m.name}'s ${action.move.name} echoes — it casts again!`)
    resolveMove(attacker, ctx, action.move, rng, log, ev, true)
  }
}

const teamAlive = (team: Combatant[]) => team.some((c) => c.hp > 0)
const sumHpFrac = (team: Combatant[]) => team.reduce((s, c) => s + Math.max(0, c.hp) / c.maxHp, 0)

// Shared-battlefield initiative: every living combatant on BOTH teams acts once
// per round, LOWEST current CON first (user spec 2026-07-21 — a light, low-CON
// build is fast; a bulky, high-CON tank is slow; recomputed every round, so
// mid-fight CON shifts matter) — not a fixed "team A's fastest, then team B's
// fastest" block order, and turn order can jump between teams freely based on
// each individual's CON. Ties fall back to DEX descending (quicker reflexes
// settle a tie), then side A before B, then roster slot.
function turnOrderCompare(x: Combatant, y: Combatant): number {
  // Haste/knockback (2026-07-25): the two ends of turn-order manipulation —
  // hasted acts FIRST regardless of CON, knocked-back acts LAST — bucketed
  // ahead of the normal CON-ascending sort. A combatant with both (rare) nets
  // to neutral, back to the normal CON sort. Order is recomputed every round,
  // so mid-fight haste/knockback swings matter immediately.
  const bucket = (c: Combatant) => (hasStatus(c, 'haste') ? -1 : 0) + (hasStatus(c, 'knockback') ? 1 : 0)
  const bx = bucket(x), by = bucket(y)
  if (bx !== by) return bx - by
  if (y.m.stats.CON !== x.m.stats.CON) return x.m.stats.CON - y.m.stats.CON
  if (y.m.stats.DEX !== x.m.stats.DEX) return y.m.stats.DEX - x.m.stats.DEX
  if (x.side !== y.side) return x.side === 'A' ? -1 : 1
  return x.slot - y.slot
}

export function simulateTeamBattle(teamA: Monster[], teamB: Monster[], happA: number[] = [], happB: number[] = []): BattleResult {
  const seedKey = teamA.map((m) => m.seed).join(',') + '|' + teamB.map((m) => m.seed).join(',') + '|vs'
  const rng = mulberry32(hashString(seedKey))
  const A = teamA.map((m, i) => makeCombatant(m, happA[i] ?? 0, 'A', i, teamA.length))
  const B = teamB.map((m, i) => makeCombatant(m, happB[i] ?? 0, 'B', i, teamB.length))
  const ctx: BattleContext = { all: [...A, ...B], focus: { A: null, B: null } }
  recomputeInnateAuras(ctx)
  const log: string[] = []
  const ev: BattleEvent[] = []
  const snap = () => ev.push({
    kind: 'snap',
    states: ctx.all.map((c) => ({
      side: c.side, slot: c.slot, hp: Math.max(0, c.hp), mana: Math.round(Math.max(0, c.mana)), ward: c.ward,
      statuses: c.statuses.map((s) => s.kind),
    })),
  })

  if (teamA.length === 1 && teamB.length === 1) {
    log.push(`⚔️  ${teamA[0].name} the ${teamA[0].species.name} (${teamA[0].className}) vs ${teamB[0].name} the ${teamB[0].species.name} (${teamB[0].className})`)
  } else {
    log.push(`⚔️  Team A (${teamA.map((m) => m.name).join(', ')}) vs Team B (${teamB.map((m) => m.name).join(', ')})`)
  }
  log.push(`   A: ${A.map((c) => `${c.m.name} ${c.maxHp}HP`).join(' · ')}  |  B: ${B.map((c) => `${c.m.name} ${c.maxHp}HP`).join(' · ')}`)
  for (const c of ctx.all) {
    const p = activePassives(c.m)
    if (p.length) log.push(`   ${c.m.name}'s innate: ${p.join(' · ')}`)
    if (c.staminaMult < 1)
      log.push(`   💤 ${c.m.name} enters fatigued (${c.m.stamina}/100 stamina — −${Math.round((1 - c.staminaMult) * 100)}% damage)`)
  }
  snap()

  let round = 1
  const MAX_ROUNDS = 60
  const CHIP_START_ROUND = 35
  while (teamAlive(A) && teamAlive(B) && round <= MAX_ROUNDS) {
    log.push(`— Round ${round} —`)
    ev.push({ kind: 'round', n: round })
    // decrement cooldowns and tick down active buffs/debuffs at the start of the round
    for (const c of ctx.all) for (const id in c.cooldowns) if (c.cooldowns[id] > 0) c.cooldowns[id]--
    for (const c of ctx.all) tickMods(c)
    for (const c of ctx.all) c.actedThisRound = false
    recomputeInnateAuras(ctx) // a fallen ally's aura / fallen enemy's debuff drops off from here
    truthsWordCleanse(ctx, round, log, ev)

    const order = ctx.all.filter((c) => c.hp > 0).sort(turnOrderCompare)
    for (const c of order) {
      if (c.hp <= 0) continue // may have been KO'd by an earlier actor's move this same round
      takeTurn(c, ctx, rng, log, ev)
      snap()
      if (!teamAlive(A) || !teamAlive(B)) break
    }

    for (const c of ctx.all) tickStatuses(c, log, ev)

    // Sudden-death clock (user spec 2026-07-22): some early-game matchups
    // grind for a long time with neither side able to close it out. From
    // round 35, EVERY living combatant takes flat TRUE damage (bypasses
    // ward/mitigation, so a defensive comp can't out-tank the clock) that
    // doubles each round, guaranteeing a winner within a handful more rounds.
    if (round >= CHIP_START_ROUND && teamAlive(A) && teamAlive(B)) {
      const chip = Math.pow(2, round - CHIP_START_ROUND)
      for (const c of ctx.all) if (c.hp > 0) c.hp = Math.max(0, c.hp - chip)
      log.push(`   ⏱️  Sudden death (Rd ${round}): everyone takes ${chip} damage.`)
    }

    snap()
    log.push(`   A: ${A.map((c) => `${c.m.name} ${Math.max(0, c.hp)}`).join(' · ')}  |  B: ${B.map((c) => `${c.m.name} ${Math.max(0, c.hp)}`).join(' · ')}`)
    round++
  }

  for (const c of ctx.all) if (c.hp <= 0) c.wasKOd = true

  let winner: BattleResult['winner']
  const aAlive = teamAlive(A), bAlive = teamAlive(B)
  if (!aAlive && !bAlive) winner = 'draw'
  else if (!bAlive) winner = 'A'
  else if (!aAlive) winner = 'B'
  else winner = sumHpFrac(A) >= sumHpFrac(B) ? 'A' : 'B' // timeout → higher summed HP fraction wins
  const winnerName = winner === 'draw' ? '—' : (winner === 'A' ? A : B).map((c) => c.m.name).join(' & ')
  log.push(winner === 'draw' ? '🏳️  Double knockout — a draw!' : `🏆  ${winnerName} wins!`)
  ev.push({ kind: 'end', winner })
  return {
    log, events: ev, winner, winnerName,
    finals: ctx.all.map((c) => ({ side: c.side, slot: c.slot, hp: Math.max(0, c.hp), mana: Math.round(Math.max(0, c.mana)), wasKOd: c.wasKOd })),
  }
}

// Thin 1v1 wrapper — every existing single-monster call site (Sandbox) keeps
// working completely unchanged.
export function simulateBattle(a: Monster, b: Monster, happA = 0, happB = 0): BattleResult {
  return simulateTeamBattle([a], [b], [happA], [happB])
}
