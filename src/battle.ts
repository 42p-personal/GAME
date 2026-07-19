// 1v1 auto-battle simulator (§11). Deterministic given a seed. Teamfight-Manager
// style: no player input mid-fight — the monster's build decides the outcome.
import { Channel, Element, Monster, Move, RNG, StatusKind, chance, elementMultiplier, happinessMultiplier, hashString, mulberry32, randInt } from './core'
import { attackStat, dodgeChance, manaCost, manaRegen, maxHp, maxMana } from './monster'

interface ActiveStatus { kind: StatusKind; turns: number }

// --- Structured battle events: the animatable beat stream the arena renders.
// The text log is kept alongside for the readable transcript.
export type BattleSide = 'A' | 'B'
export type BattleEvent =
  | { kind: 'round'; n: number }
  | { kind: 'hit'; side: BattleSide; move: string; channel: Channel; element?: Element; dmg: number; hits: number; execute: boolean; eff: 'super' | 'resist' | null; lifesteal: number; manaBurn: number; recoil: number; warded: number; self: boolean }
  | { kind: 'miss'; side: BattleSide; move: string; channel: Channel; blocked: boolean }
  | { kind: 'stance'; side: BattleSide; avoid: number }
  | { kind: 'utility'; side: BattleSide; move: string; heal: number; hostile: boolean }
  | { kind: 'status'; side: BattleSide; status: StatusKind } // side = the afflicted
  | { kind: 'dot'; side: BattleSide; status: 'burn' | 'poison'; amount: number }
  | { kind: 'skip'; side: BattleSide; reason: 'stun' | 'fear' }
  | { kind: 'ultimate'; side: BattleSide; name: string }
  | { kind: 'snap'; aHp: number; bHp: number; aMana: number; bMana: number; aWard: number; bWard: number }
  | { kind: 'end'; winner: 'A' | 'B' | 'draw' }

// Passive effects granted by innate abilities (§8.3). Curated table by ability
// name; unlisted innates stay flavour-only for now. A species' two innates stack.
interface InnateEffect {
  flatDR?: number // flat damage reduction on every hit taken
  dodge?: number // bonus dodge %
  acc?: number // bonus accuracy %
  regen?: number // bonus mana regen per turn
  dmgMult?: number // multiplier on all damage dealt
  firstHitMult?: number // multiplier on this monster's first damaging hit
  lifesteal?: number // fraction of damage dealt returned as HP
}

const INNATE_EFFECTS: Record<string, InnateEffect> = {
  // damage reduction
  'Thick Hide': { flatDR: 3 }, Ironclad: { flatDR: 3 }, 'Ancient Carapace': { flatDR: 3 },
  Immovable: { flatDR: 2 }, 'Spiral Shell': { flatDR: 2 }, 'Coral Guard': { flatDR: 2 },
  Ward: { flatDR: 2 }, Unstoppable: { flatDR: 3 }, Unison: { flatDR: 2 }, 'Aegis Bond': { flatDR: 2 },
  // evasion
  Evasion: { dodge: 8 }, Quickstep: { dodge: 6 }, Aerial: { dodge: 6 }, 'Phase Shift': { dodge: 8 },
  'Dodge Storm': { dodge: 6 }, 'Cloak of Shadow': { dodge: 8 }, 'Ink Cloud': { dodge: 5 },
  Cheer: { dodge: 4 }, Southpaw: { dodge: 4 }, 'Psychic Aura': { dodge: 5 }, 'Ancient Knowing': { dodge: 5 },
  'Temporal Distortion': { dodge: 4 }, Foresight: { dodge: 6 },
  // accuracy
  'Keen Eye': { acc: 8 }, 'Cosmic Precision': { acc: 10 },
  // mana engines
  Wellspring: { regen: 3 }, 'Silent Wisdom': { regen: 3 }, 'Tidal Wisdom': { regen: 3 },
  'Glacial Wisdom': { regen: 3 }, 'Arcane Mastery': { regen: 4 }, 'Mana Theft': { regen: 2 },
  'Soothing Words': { regen: 2 }, 'Life Bloom': { regen: 2 },
  // damage boosts
  Maul: { dmgMult: 1.08 }, Overload: { dmgMult: 1.08 }, Momentum: { dmgMult: 1.05 }, Pride: { dmgMult: 1.05 },
  'Rallying Roar': { dmgMult: 1.05 }, Flurry: { dmgMult: 1.05 }, 'Arcane Bolt': { dmgMult: 1.05 },
  'Song of Valor': { dmgMult: 1.05 }, Whirlwind: { dmgMult: 1.05 }, 'Tentacle Barrage': { dmgMult: 1.05 },
  'Live Wire': { dmgMult: 1.05 }, Spellblade: { dmgMult: 1.06 }, 'Flame Aura': { dmgMult: 1.05 },
  'Draconic Pride': { dmgMult: 1.06 }, Blizzard: { dmgMult: 1.05 }, 'Void Pulse': { dmgMult: 1.06 },
  'Rift Magic': { dmgMult: 1.06 }, 'Whip Strike': { dmgMult: 1.05 }, 'Stellar Shot': { dmgMult: 1.06 },
  'Spell Echo': { dmgMult: 1.1 }, Rend: { dmgMult: 1.05 },
  // openers
  Charge: { firstHitMult: 1.5 }, 'Dive Bomb': { firstHitMult: 1.5 }, 'Glide Strike': { firstHitMult: 1.3 },
  Haymaker: { firstHitMult: 1.3 }, 'Silent Strike': { firstHitMult: 1.5 }, 'Prehistoric Roar': { firstHitMult: 1.3 },
  // sustain
  Devour: { lifesteal: 0.3 }, 'Age Reversal': { lifesteal: 0.15 },
  // Insectoid
  'Chitin Plate': { flatDR: 3 }, Burrow: { dodge: 4 }, Ambush: { firstHitMult: 1.5 },
  'Serrated Claws': { dmgMult: 1.05 }, 'Web Trap': { dodge: 5 }, 'Venom Fang': { dmgMult: 1.05 },
  'Hive Command': { dmgMult: 1.05 }, 'Royal Jelly': { regen: 2 }, 'Skim Dart': { firstHitMult: 1.3 },
  'Compound Eyes': { acc: 8 },
  // Reptilian
  'Death Roll': { dmgMult: 1.08 }, 'Armored Scales': { flatDR: 3 }, 'Sun Basking': { regen: 2 },
  'Crest Display': { dmgMult: 1.05 }, 'Cold Blood': { flatDR: 2 }, 'Hypnotic Gaze': { acc: 8 },
  'Wall Runner': { dodge: 6 }, 'Tail Drop': { dodge: 4 }, 'Shell Ward': { flatDR: 3 },
  'Inner Calm': { regen: 3 },
}

function innateEffects(m: Monster): InnateEffect {
  const out: Required<InnateEffect> = { flatDR: 0, dodge: 0, acc: 0, regen: 0, dmgMult: 1, firstHitMult: 1, lifesteal: 0 }
  for (const ab of m.species.innate) {
    const e = INNATE_EFFECTS[ab.name]
    if (!e) continue
    out.flatDR += e.flatDR ?? 0
    out.dodge += e.dodge ?? 0
    out.acc += e.acc ?? 0
    out.regen += e.regen ?? 0
    out.dmgMult *= e.dmgMult ?? 1
    out.firstHitMult = Math.max(out.firstHitMult, e.firstHitMult ?? 1)
    out.lifesteal += e.lifesteal ?? 0
  }
  return out
}

const activePassives = (m: Monster) => m.species.innate.filter((ab) => INNATE_EFFECTS[ab.name]).map((ab) => ab.name)

interface Combatant {
  m: Monster
  side: BattleSide
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  cooldowns: Record<string, number> // moveId -> turns remaining
  statuses: ActiveStatus[]
  guard: number // temporary flat damage reduction until next action (guard effects)
  ward: number // absorb shield HP — soaks damage before health (ward effects)
  blockAvoid: number // Block stance: bonus % chance to avoid hits until next action
  // battle-long modifiers accumulated from buff/debuff effects
  atkMod: number // multiplier on damage dealt (buffs raise, debuffs on self lower)
  defFlat: number // flat mitigation delta (Iron Skin raises, armour shred lowers)
  dodgeMod: number // additive % dodge
  accMod: number // additive % accuracy
  regenMod: number // additive mana regen
  appliedBuffs: Set<string> // battle-long self-buff move ids already cast (no re-casting)
  sufferedDebuffs: Set<string> // debuff move ids already landed on this combatant
  happiness: number // 0..10, scales damage dealt (§2.4)
  innate: Required<InnateEffect>
  hasLandedHit: boolean // first-hit bonuses spend after the first damaging hit
  ultimateUsed: boolean
}

export interface BattleResult {
  log: string[]
  events: BattleEvent[]
  winner: 'A' | 'B' | 'draw'
  winnerName: string
}

function makeCombatant(m: Monster, happiness: number, side: BattleSide): Combatant {
  return {
    m,
    side,
    hp: maxHp(m.stats),
    maxHp: maxHp(m.stats),
    mana: maxMana(m.stats),
    maxMana: maxMana(m.stats),
    cooldowns: {},
    statuses: [],
    guard: 0,
    ward: 0,
    blockAvoid: 0,
    atkMod: 1,
    defFlat: 0,
    dodgeMod: 0,
    accMod: 0,
    regenMod: 0,
    appliedBuffs: new Set(),
    sufferedDebuffs: new Set(),
    happiness,
    innate: innateEffects(m) as Required<InnateEffect>,
    hasLandedHit: false,
    ultimateUsed: false,
  }
}

// Does this move apply a battle-long self-buff (cast once, lasts all fight)?
const isBattleLongBuff = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkBuff !== undefined || e.defBuff !== undefined || e.dodgeBuff !== undefined
    || e.accBuff !== undefined || e.regenBuff !== undefined)
}
const isDebuffMove = (mv: Move) => {
  const e = mv.effects
  return !!e && (e.atkDebuff !== undefined || e.defDebuff !== undefined || e.accDebuff !== undefined)
}

const hasStatus = (c: Combatant, k: StatusKind) => c.statuses.some((s) => s.kind === k)

function tickStatuses(c: Combatant, log: string[], ev: BattleEvent[]): void {
  for (const st of c.statuses) {
    if (st.kind === 'burn') {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.05))
      c.hp -= dmg
      log.push(`  ${c.m.name} suffers ${dmg} burn damage.`)
      ev.push({ kind: 'dot', side: c.side, status: 'burn', amount: dmg })
    } else if (st.kind === 'poison') {
      const dmg = Math.max(1, Math.round(c.maxMana * 0.15))
      c.mana = Math.max(0, c.mana - dmg)
      log.push(`  ${c.m.name} loses ${dmg} mana to poison.`)
      ev.push({ kind: 'dot', side: c.side, status: 'poison', amount: dmg })
    }
    st.turns--
  }
  c.statuses = c.statuses.filter((s) => s.turns > 0)
}

// --- Universal free actions (battle-choice design) ---
// Every skill costs MP; when none is affordable the monster must Attack or Block.
const ATTACK_POWER = 12
const FREE_MOVE_IDS = new Set(['attack', 'ultimate'])
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
// multi-hit totals count, and execute range boosts value against weakened foes.
function effPower(mv: Move, foe: Combatant): number {
  const avgHits = mv.effects?.hits ? (mv.effects.hits[0] + mv.effects.hits[1]) / 2 : 1
  let p = mv.power * avgHits
  if (mv.effects?.execute && foe.hp / foe.maxHp <= mv.effects.execute) p *= 1.5
  return p
}

// The per-turn choice: skill vs Attack vs Block. First-pass policy, meant for tuning:
// heal when hurt, block when hurt and a big hit looms or while charging MP for a
// skill, open with battle-long buffs, land debuffs on threats, spend MP on skills
// that clearly beat a basic Attack, otherwise Attack.
function chooseAction(self: Combatant, foe: Combatant, rng: RNG): Action {
  const ready = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  const heals = ready.filter((mv) => mv.type !== 'damage' && mv.power > 0)
  const dmgs = ready.filter((mv) => mv.type === 'damage').sort((a, b) => effPower(b, foe) - effPower(a, foe))
  // battle-long buffs not yet cast; debuffs the foe hasn't suffered yet
  const buffs = ready.filter((mv) => mv.type !== 'damage' && mv.power === 0 && mv.target !== 'enemy' && mv.target !== 'allEnemies'
    && !(isBattleLongBuff(mv) && self.appliedBuffs.has(mv.id)))
  const hostiles = ready.filter((mv) => mv.type !== 'damage' && (mv.target === 'enemy' || mv.target === 'allEnemies')
    && !(isDebuffMove(mv) && foe.sufferedDebuffs.has(mv.id)))
  const hpFrac = self.hp / self.maxHp

  // What the foe can plausibly throw next turn (AI may peek — it's a sim).
  const foeThreats = foe.m.loadout.filter((mv) => (foe.cooldowns[mv.id] ?? 0) <= 1 && moveCost(mv) <= foe.mana + manaRegen(foe.m.stats))
  const threat = Math.max(ATTACK_POWER, ...foeThreats.filter((mv) => mv.type === 'damage').map((mv) => effPower(mv, self)))

  // Emergency heal beats everything.
  if (hpFrac < 0.45 && heals.length) return { kind: 'skill', move: heals[0] }

  // Hurt with a real hit incoming → guard up more often than not.
  if (hpFrac < 0.45 && threat >= 20 && chance(rng, 55)) return { kind: 'block' }

  // Open with a battle-long buff (or shield up) while still healthy.
  if (buffs.length && hpFrac > 0.6 && chance(rng, 40)) return { kind: 'skill', move: buffs[0] }

  // Land a debuff / control move on a threatening foe.
  if (hostiles.length && threat >= 18 && chance(rng, 35)) return { kind: 'skill', move: hostiles[0] }

  // A damage skill is worth its MP if it clearly out-hits a basic Attack, or if
  // it carries a status/debuff rider that a plain Attack never could.
  const worthIt = dmgs.filter((mv) => effPower(mv, foe) >= ATTACK_POWER + 4
    || ((mv.status !== undefined || isDebuffMove(mv) || mv.effects?.manaBurn !== undefined) && effPower(mv, foe) >= ATTACK_POWER - 4))
  if (worthIt.length) return { kind: 'skill', move: worthIt[0] }

  // Nothing affordable, but one more turn of regen unlocks a skill → block to charge.
  if (ready.length === 0) {
    const upcoming = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 1).map(moveCost)
    const cheapest = upcoming.length ? Math.min(...upcoming) : Infinity
    if (self.mana + manaRegen(self.m.stats) + self.innate.regen + self.regenMod >= cheapest && chance(rng, 50)) return { kind: 'block' }
  }

  // No worthwhile skill this turn and the foe threatens something heavy → parry window.
  if (threat >= 25 && chance(rng, 35)) return { kind: 'block' }

  return { kind: 'attack' }
}

// The species ultimate (§8.3): once per battle, unleashed when pushed below 40%
// HP. A heavy strike through the monster's best offensive channel.
function ultimateMove(m: Monster): Move {
  const channels: Move['channel'][] = ['melee', 'ranged', 'magic', 'voice']
  const best = channels.reduce((a, b) => (attackStat(m.stats, a) >= attackStat(m.stats, b) ? a : b))
  return {
    id: 'ultimate', name: m.species.ultimate.name, stat: 'STR', learnLevel: 0, type: 'damage',
    channel: best, target: 'enemy', cooldown: 99, accuracy: 100, power: 70, desc: m.species.ultimate.desc,
  }
}

// Land a debuff's battle-long effects on the target (once per debuff move).
function applyDebuffs(target: Combatant, move: Move, log: string[]): void {
  const e = move.effects
  if (!e || target.sufferedDebuffs.has(move.id)) return
  const notes: string[] = []
  if (e.atkDebuff) { target.atkMod *= 1 - e.atkDebuff; notes.push(`−${Math.round(e.atkDebuff * 100)}% damage`) }
  if (e.defDebuff) { target.defFlat -= e.defDebuff; notes.push(`−${e.defDebuff} mitigation`) }
  if (e.accDebuff) { target.accMod -= e.accDebuff; notes.push(`−${e.accDebuff}% accuracy`) }
  if (notes.length) {
    target.sufferedDebuffs.add(move.id)
    log.push(`    ${target.m.name} is weakened: ${notes.join(', ')}.`)
  }
}

// Apply a move's self-side effects: guard, ward, cleanse, battle-long buffs.
function applySelfEffects(user: Combatant, move: Move, log: string[]): void {
  const e = move.effects
  if (!e) return
  const notes: string[] = []
  if (e.guard) { user.guard += e.guard + Math.round(user.m.stats.CON * 0.1); notes.push(`guard ${user.guard}`) }
  if (e.ward) { user.ward += e.ward; notes.push(`${user.ward} HP shield`) }
  if (e.cleanse && user.statuses.length) { user.statuses = []; notes.push('ailments cleansed') }
  if (isBattleLongBuff(move) && !user.appliedBuffs.has(move.id)) {
    user.appliedBuffs.add(move.id)
    if (e.atkBuff) { user.atkMod *= 1 + e.atkBuff; notes.push(`+${Math.round(e.atkBuff * 100)}% damage`) }
    if (e.defBuff) { user.defFlat += e.defBuff; notes.push(`+${e.defBuff} mitigation`) }
    if (e.dodgeBuff) { user.dodgeMod += e.dodgeBuff; notes.push(`+${e.dodgeBuff}% dodge`) }
    if (e.accBuff) { user.accMod += e.accBuff; notes.push(`+${e.accBuff}% accuracy`) }
    if (e.regenBuff) { user.regenMod += e.regenBuff; notes.push(`+${e.regenBuff} regen`) }
  }
  if (notes.length) log.push(`    (${notes.join(', ')})`)
}

function resolveMove(attacker: Combatant, defender: Combatant, move: Move, rng: RNG, log: string[], ev: BattleEvent[]): void {
  // Confusion: chance to hit self
  let realTarget = defender
  if (hasStatus(attacker, 'confusion') && chance(rng, 20)) {
    realTarget = attacker
    log.push(`  ${attacker.m.name} is confused and turns on itself!`)
  }

  attacker.cooldowns[move.id] = move.cooldown
  attacker.mana = Math.max(0, attacker.mana - moveCost(move))
  const e = move.effects

  // --- Non-damage moves: heals, shields, buffs on self; debuffs/control on the enemy ---
  if (move.type !== 'damage') {
    const hostile = move.target === 'enemy' || move.target === 'allEnemies'
    if (!hostile) {
      let heal = 0
      if (move.power > 0) {
        heal = Math.round(move.power * 1.2)
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal)
        log.push(`  ${attacker.m.name} uses ${move.name}, healing ${heal} HP.`)
      } else {
        log.push(`  ${attacker.m.name} uses ${move.name}.`)
      }
      applySelfEffects(attacker, move, log)
      ev.push({ kind: 'utility', side: attacker.side, move: move.name, heal, hostile: false })
      return
    }
    // Hostile utility (debuff / control) must land — dodge and Block apply.
    let hacc = move.accuracy + attacker.innate.acc + attacker.accMod
    if (hasStatus(attacker, 'blind')) hacc -= 25
    const hdodge = dodgeChance(realTarget.m.stats) + realTarget.innate.dodge + realTarget.dodgeMod + realTarget.blockAvoid
    if (!chance(rng, Math.max(5, hacc - hdodge))) {
      if (realTarget.blockAvoid > 0) log.push(`  🛡 ${realTarget.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
      else log.push(`  ${attacker.m.name}'s ${move.name} misses ${realTarget.m.name}.`)
      ev.push({ kind: 'miss', side: attacker.side, move: move.name, channel: move.channel, blocked: realTarget.blockAvoid > 0 })
      return
    }
    log.push(`  ${attacker.m.name} uses ${move.name} on ${realTarget.m.name}.`)
    ev.push({ kind: 'utility', side: attacker.side, move: move.name, heal: 0, hostile: true })
    applyDebuffs(realTarget, move, log)
    if (e?.manaBurn) {
      const burned = Math.min(realTarget.mana, e.manaBurn)
      realTarget.mana -= burned
      if (burned > 0) log.push(`    ${realTarget.m.name} loses ${burned} MP.`)
    }
    if (move.status && chance(rng, move.status.chance)) {
      realTarget.statuses.push({ kind: move.status.kind, turns: move.status.duration })
      log.push(`    ${realTarget.m.name} is afflicted with ${move.status.kind}!`)
      ev.push({ kind: 'status', side: realTarget.side, status: move.status.kind })
    }
    return
  }

  // --- Damage moves ---
  // Accuracy vs dodge (+blind penalty, passives, buffs/debuffs, Block avoidance)
  let acc = move.accuracy + attacker.innate.acc + attacker.accMod
  if (hasStatus(attacker, 'blind')) acc -= 25
  const dodge = dodgeChance(realTarget.m.stats) + realTarget.innate.dodge + realTarget.dodgeMod + realTarget.blockAvoid
  if (!chance(rng, Math.max(5, acc - dodge))) {
    if (realTarget.blockAvoid > 0) log.push(`  🛡 ${realTarget.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${realTarget.m.name}.`)
    ev.push({ kind: 'miss', side: attacker.side, move: move.name, channel: move.channel, blocked: realTarget.blockAvoid > 0 })
    return
  }

  const atk = attackStat(attacker.m.stats, move.channel)
  const variance = 0.85 + rng() * 0.3
  const hits = e?.hits ? randInt(rng, e.hits[0], e.hits[1]) : 1
  // softened growth curve so high-stat monsters don't one-shot before defense matters
  let dmg = move.power * hits * Math.pow(atk / 40, 0.8) * variance
  dmg *= happinessMultiplier(attacker.happiness) // happy monsters hit harder (§2.4)
  dmg *= attacker.innate.dmgMult * attacker.atkMod
  if (!attacker.hasLandedHit && attacker.innate.firstHitMult > 1) {
    dmg *= attacker.innate.firstHitMult
    log.push(`  ${attacker.m.name}'s opening strike hits with full force!`)
  }
  // execute: heavy bonus against weakened targets
  let execNote = ''
  if (e?.execute && realTarget.hp / realTarget.maxHp <= e.execute) {
    dmg *= 1.5
    execNote = ' — executes!'
  }
  // elemental affinity: resisted or super-effective vs the target's body type (§8.5)
  let effNote = ''
  if (move.element) {
    const em = elementMultiplier(realTarget.m.species.body, move.element)
    dmg *= em
    if (em > 1) effNote = ' — super effective!'
    else if (em < 1) effNote = ' — resisted'
  }
  // physical channels mitigated by target CON + guard; magic/voice/support by WIS
  // (§11); buffs/shreds shift it; pierce ignores a fraction of the total.
  let mitigation = ((move.channel === 'melee' || move.channel === 'ranged')
    ? realTarget.m.stats.CON * 0.06 + realTarget.guard
    : realTarget.m.stats.WIS * 0.05) + realTarget.innate.flatDR + realTarget.defFlat
  mitigation = Math.max(0, mitigation) * (1 - (e?.pierce ?? 0))
  dmg = Math.max(1, Math.round(dmg - mitigation))

  // ward shields soak damage before health
  let wardNote = ''
  let absorbed = 0
  if (realTarget.ward > 0) {
    absorbed = Math.min(realTarget.ward, dmg)
    realTarget.ward -= absorbed
    dmg -= absorbed
    wardNote = ` (${absorbed} absorbed by shield)`
  }
  realTarget.hp -= dmg
  realTarget.guard = 0
  attacker.hasLandedHit = true

  const hitNote = hits > 1 ? ` (${hits} hits)` : ''
  const notes: string[] = []
  // lifesteal: innate and skill effects stack
  let stolen = 0
  const steal = attacker.innate.lifesteal + (e?.lifesteal ?? 0)
  if (steal > 0 && dmg > 0) {
    stolen = Math.max(1, Math.round(dmg * steal))
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + stolen)
    notes.push(`drains ${stolen} HP`)
  }
  let burned = 0
  if (e?.manaBurn) {
    burned = Math.min(realTarget.mana, e.manaBurn)
    realTarget.mana -= burned
    if (burned > 0) notes.push(`burns ${burned} MP`)
  }
  let recoil = 0
  if (e?.recoil) {
    recoil = Math.max(1, Math.round(dmg * e.recoil))
    attacker.hp -= recoil
    notes.push(`${recoil} recoil`)
  }
  const noteStr = notes.length ? ` (${notes.join(', ')})` : ''
  log.push(`  ${attacker.m.name} uses ${move.name}${hitNote} → ${dmg} damage to ${realTarget.m.name}${execNote}${effNote}${wardNote}${noteStr}.`)
  ev.push({
    kind: 'hit', side: attacker.side, move: move.name, channel: move.channel, element: move.element,
    dmg, hits, execute: execNote !== '', eff: effNote.includes('super') ? 'super' : effNote.includes('resisted') ? 'resist' : null,
    lifesteal: stolen, manaBurn: burned, recoil, warded: absorbed, self: realTarget === attacker,
  })

  // rider effects: armour shred / attack-down on damage moves, self-guard followups
  applyDebuffs(realTarget, move, log)
  if (e?.guard) applySelfEffects(attacker, move, log)

  // Apply status
  if (move.status && chance(rng, move.status.chance)) {
    realTarget.statuses.push({ kind: move.status.kind, turns: move.status.duration })
    log.push(`    ${realTarget.m.name} is afflicted with ${move.status.kind}!`)
    ev.push({ kind: 'status', side: realTarget.side, status: move.status.kind })
  }
}

function takeTurn(attacker: Combatant, defender: Combatant, rng: RNG, log: string[], ev: BattleEvent[]): void {
  // A Block stance lasts until the blocker's next action — it ends now.
  attacker.blockAvoid = 0
  // regen mana (innate mana engines + regen buffs add to it)
  attacker.mana = Math.min(attacker.maxMana, attacker.mana + manaRegen(attacker.m.stats) + attacker.innate.regen + attacker.regenMod)

  if (hasStatus(attacker, 'stun')) { log.push(`  ${attacker.m.name} is stunned and cannot act.`); ev.push({ kind: 'skip', side: attacker.side, reason: 'stun' }); return }
  if (hasStatus(attacker, 'fear')) { log.push(`  ${attacker.m.name} flees in fear and loses its action.`); ev.push({ kind: 'skip', side: attacker.side, reason: 'fear' }); return }

  // Ultimate: unlocked at 600+ in a stat, fires once when pushed below 40% HP
  if (attacker.m.ultimateUnlocked && !attacker.ultimateUsed && attacker.hp <= attacker.maxHp * 0.4) {
    attacker.ultimateUsed = true
    log.push(`  ★ ${attacker.m.name} unleashes its ultimate!`)
    ev.push({ kind: 'ultimate', side: attacker.side, name: attacker.m.species.ultimate.name })
    resolveMove(attacker, defender, ultimateMove(attacker.m), rng, log, ev)
    return
  }

  // The per-turn choice: skill (costs MP) vs free Attack vs free Block.
  const action = chooseAction(attacker, defender, rng)
  if (action.kind === 'block') {
    attacker.blockAvoid = blockValue(attacker)
    log.push(`  🛡 ${attacker.m.name} braces to block (+${attacker.blockAvoid}% avoid).`)
    ev.push({ kind: 'stance', side: attacker.side, avoid: attacker.blockAvoid })
    return
  }
  resolveMove(attacker, defender, action.kind === 'attack' ? basicAttack(attacker.m) : action.move, rng, log, ev)
}

export function simulateBattle(a: Monster, b: Monster, happA = 0, happB = 0): BattleResult {
  const rng = mulberry32(hashString(a.seed + '|' + b.seed + '|vs'))
  const A = makeCombatant(a, happA, 'A')
  const B = makeCombatant(b, happB, 'B')
  const log: string[] = []
  const ev: BattleEvent[] = []
  const snap = () => ev.push({
    kind: 'snap', aHp: Math.max(0, A.hp), bHp: Math.max(0, B.hp),
    aMana: Math.round(A.mana), bMana: Math.round(B.mana), aWard: A.ward, bWard: B.ward,
  })
  log.push(`⚔️  ${a.name} the ${a.species.name} (${a.className}) vs ${b.name} the ${b.species.name} (${b.className})`)
  log.push(`   ${a.name}: ${A.maxHp} HP · ${b.name}: ${B.maxHp} HP`)
  for (const c of [A, B]) {
    const p = activePassives(c.m)
    if (p.length) log.push(`   ${c.m.name}'s innate: ${p.join(' · ')}`)
  }
  snap()

  // faster monster (DEX) acts first each round
  const aFirst = a.stats.DEX >= b.stats.DEX
  const first = aFirst ? A : B
  const second = aFirst ? B : A

  let round = 1
  const MAX_ROUNDS = 60
  while (A.hp > 0 && B.hp > 0 && round <= MAX_ROUNDS) {
    log.push(`— Round ${round} —`)
    ev.push({ kind: 'round', n: round })
    // decrement cooldowns at the start of the round
    for (const c of [A, B]) for (const id in c.cooldowns) if (c.cooldowns[id] > 0) c.cooldowns[id]--

    takeTurn(first, second, rng, log, ev)
    snap()
    if (second.hp > 0) { takeTurn(second, first, rng, log, ev); snap() }

    tickStatuses(A, log, ev)
    tickStatuses(B, log, ev)
    snap()
    log.push(`   ${a.name}: ${Math.max(0, A.hp)} HP · ${b.name}: ${Math.max(0, B.hp)} HP`)
    round++
  }

  let winner: BattleResult['winner'] = 'draw'
  if (A.hp <= 0 && B.hp <= 0) winner = 'draw'
  else if (B.hp <= 0) winner = 'A'
  else if (A.hp <= 0) winner = 'B'
  else winner = A.hp >= B.hp ? 'A' : 'B' // timeout → higher HP
  const winnerName = winner === 'A' ? a.name : winner === 'B' ? b.name : '—'
  log.push(winner === 'draw' ? '🏳️  Double knockout — a draw!' : `🏆  ${winnerName} wins!`)
  ev.push({ kind: 'end', winner })
  return { log, events: ev, winner, winnerName }
}
