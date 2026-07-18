// 1v1 auto-battle simulator (§11). Deterministic given a seed. Teamfight-Manager
// style: no player input mid-fight — the monster's build decides the outcome.
import { Monster, Move, RNG, StatusKind, chance, elementMultiplier, happinessMultiplier, hashString, mulberry32 } from './core'
import { attackStat, dodgeChance, manaCost, manaRegen, maxHp, maxMana } from './monster'

interface ActiveStatus { kind: StatusKind; turns: number }

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
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  cooldowns: Record<string, number> // moveId -> turns remaining
  statuses: ActiveStatus[]
  guard: number // temporary flat damage reduction (from buff moves)
  blockAvoid: number // Block stance: bonus % chance to avoid hits until next action
  happiness: number // 0..10, scales damage dealt (§2.4)
  innate: Required<InnateEffect>
  hasLandedHit: boolean // first-hit bonuses spend after the first damaging hit
  ultimateUsed: boolean
}

export interface BattleResult {
  log: string[]
  winner: 'A' | 'B' | 'draw'
  winnerName: string
}

function makeCombatant(m: Monster, happiness: number): Combatant {
  return {
    m,
    hp: maxHp(m.stats),
    maxHp: maxHp(m.stats),
    mana: maxMana(m.stats),
    maxMana: maxMana(m.stats),
    cooldowns: {},
    statuses: [],
    guard: 0,
    blockAvoid: 0,
    happiness,
    innate: innateEffects(m) as Required<InnateEffect>,
    hasLandedHit: false,
    ultimateUsed: false,
  }
}

const hasStatus = (c: Combatant, k: StatusKind) => c.statuses.some((s) => s.kind === k)

function tickStatuses(c: Combatant, log: string[]): void {
  for (const st of c.statuses) {
    if (st.kind === 'burn') {
      const dmg = Math.max(1, Math.round(c.maxHp * 0.05))
      c.hp -= dmg
      log.push(`  ${c.m.name} suffers ${dmg} burn damage.`)
    } else if (st.kind === 'poison') {
      const dmg = Math.max(1, Math.round(c.maxMana * 0.15))
      c.mana = Math.max(0, c.mana - dmg)
      log.push(`  ${c.m.name} loses ${dmg} mana to poison.`)
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

// The per-turn choice: skill vs Attack vs Block. First-pass policy, meant for tuning:
// heal when hurt, block when hurt and a big hit looms or while charging MP for a
// skill, spend MP on skills that clearly beat a basic Attack, otherwise Attack.
function chooseAction(self: Combatant, foe: Combatant, rng: RNG): Action {
  const ready = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 0 && moveCost(mv) <= self.mana)
  const heals = ready.filter((mv) => mv.type !== 'damage' && mv.power > 0)
  const dmgs = ready.filter((mv) => mv.type === 'damage').sort((a, b) => b.power - a.power)
  const utils = ready.filter((mv) => mv.type !== 'damage' && mv.power === 0)
  const hpFrac = self.hp / self.maxHp

  // What the foe can plausibly throw next turn (AI may peek — it's a sim).
  const foeThreats = foe.m.loadout.filter((mv) => (foe.cooldowns[mv.id] ?? 0) <= 1 && moveCost(mv) <= foe.mana + manaRegen(foe.m.stats))
  const threat = Math.max(ATTACK_POWER, ...foeThreats.filter((mv) => mv.type === 'damage').map((mv) => mv.power))

  // Emergency heal beats everything.
  if (hpFrac < 0.45 && heals.length) return { kind: 'skill', move: heals[0] }

  // Hurt with a real hit incoming → guard up more often than not.
  if (hpFrac < 0.45 && threat >= 20 && chance(rng, 55)) return { kind: 'block' }

  // A damage skill is worth its MP if it clearly out-hits a basic Attack, or if
  // it can land a status effect that a plain Attack never could.
  const worthIt = dmgs.filter((mv) => mv.power >= ATTACK_POWER + 4 || (mv.status !== undefined && mv.power >= ATTACK_POWER - 4))
  if (worthIt.length) return { kind: 'skill', move: worthIt[0] }

  // Nothing affordable, but one more turn of regen unlocks a skill → block to charge.
  if (ready.length === 0) {
    const upcoming = self.m.loadout.filter((mv) => (self.cooldowns[mv.id] ?? 0) <= 1).map(moveCost)
    const cheapest = upcoming.length ? Math.min(...upcoming) : Infinity
    if (self.mana + manaRegen(self.m.stats) + self.innate.regen >= cheapest && chance(rng, 50)) return { kind: 'block' }
  }

  // No worthwhile skill this turn and the foe threatens something heavy → parry window.
  if (threat >= 25 && chance(rng, 35)) return { kind: 'block' }

  // Occasionally spend a turn (and MP) on a utility buff.
  if (utils.length && chance(rng, 25)) return { kind: 'skill', move: utils[0] }

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

function resolveMove(attacker: Combatant, defender: Combatant, move: Move, rng: RNG, log: string[]): void {
  // Confusion: chance to hit self
  let realTarget = defender
  if (hasStatus(attacker, 'confusion') && chance(rng, 20)) {
    realTarget = attacker
    log.push(`  ${attacker.m.name} is confused and turns on itself!`)
  }

  attacker.cooldowns[move.id] = move.cooldown
  attacker.mana = Math.max(0, attacker.mana - moveCost(move))

  if (move.type !== 'damage') {
    // Utility: heal or guard. Everything else is flavour + spends the turn.
    if (move.power > 0) {
      const heal = Math.round(move.power * 1.2)
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal)
      log.push(`  ${attacker.m.name} uses ${move.name}, healing ${heal} HP.`)
    } else if (move.name === 'Guard' || move.name === 'Brace' || move.name === 'Bracer' || move.name === 'Iron Skin' || move.name === 'Fortify') {
      attacker.guard += Math.round(attacker.m.stats.CON * 0.15) + 4
      log.push(`  ${attacker.m.name} uses ${move.name} and braces (guard +${attacker.guard}).`)
    } else {
      log.push(`  ${attacker.m.name} uses ${move.name}.`)
    }
    return
  }

  // Accuracy vs dodge (+blind penalty, innate passives, Block stance avoidance)
  let acc = move.accuracy + attacker.innate.acc
  if (hasStatus(attacker, 'blind')) acc -= 25
  const dodge = dodgeChance(realTarget.m.stats) + realTarget.innate.dodge + realTarget.blockAvoid
  if (!chance(rng, Math.max(5, acc - dodge))) {
    if (realTarget.blockAvoid > 0) log.push(`  🛡 ${realTarget.m.name} blocks ${attacker.m.name}'s ${move.name}!`)
    else log.push(`  ${attacker.m.name}'s ${move.name} misses ${realTarget.m.name}.`)
    return
  }

  const atk = attackStat(attacker.m.stats, move.channel)
  const variance = 0.85 + rng() * 0.3
  let dmg = move.power * (atk / 40) * variance
  dmg *= happinessMultiplier(attacker.happiness) // happy monsters hit harder (§2.4)
  dmg *= attacker.innate.dmgMult
  if (!attacker.hasLandedHit && attacker.innate.firstHitMult > 1) {
    dmg *= attacker.innate.firstHitMult
    log.push(`  ${attacker.m.name}'s opening strike hits with full force!`)
  }
  // elemental affinity: resisted or super-effective vs the target's body type (§8.5)
  let effNote = ''
  if (move.element) {
    const em = elementMultiplier(realTarget.m.species.body, move.element)
    dmg *= em
    if (em > 1) effNote = ' — super effective!'
    else if (em < 1) effNote = ' — resisted'
  }
  // physical channels mitigated by target CON + guard; magic/voice by WIS (§11)
  const mitigation = ((move.channel === 'melee' || move.channel === 'ranged')
    ? realTarget.m.stats.CON * 0.06 + realTarget.guard
    : realTarget.m.stats.WIS * 0.05) + realTarget.innate.flatDR
  dmg = Math.max(1, Math.round(dmg - mitigation))
  realTarget.hp -= dmg
  realTarget.guard = 0
  attacker.hasLandedHit = true
  if (attacker.innate.lifesteal > 0) {
    const heal = Math.max(1, Math.round(dmg * attacker.innate.lifesteal))
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal)
    log.push(`  ${attacker.m.name} uses ${move.name} → ${dmg} damage to ${realTarget.m.name}${effNote} (drains ${heal} HP).`)
  } else {
    log.push(`  ${attacker.m.name} uses ${move.name} → ${dmg} damage to ${realTarget.m.name}${effNote}.`)
  }

  // Apply status
  if (move.status && chance(rng, move.status.chance)) {
    realTarget.statuses.push({ kind: move.status.kind, turns: move.status.duration })
    log.push(`    ${realTarget.m.name} is afflicted with ${move.status.kind}!`)
  }
}

function takeTurn(attacker: Combatant, defender: Combatant, rng: RNG, log: string[]): void {
  // A Block stance lasts until the blocker's next action — it ends now.
  attacker.blockAvoid = 0
  // regen mana (innate mana engines add to it)
  attacker.mana = Math.min(attacker.maxMana, attacker.mana + manaRegen(attacker.m.stats) + attacker.innate.regen)

  if (hasStatus(attacker, 'stun')) { log.push(`  ${attacker.m.name} is stunned and cannot act.`); return }
  if (hasStatus(attacker, 'fear')) { log.push(`  ${attacker.m.name} flees in fear and loses its action.`); return }

  // Ultimate: unlocked at 600+ in a stat, fires once when pushed below 40% HP
  if (attacker.m.ultimateUnlocked && !attacker.ultimateUsed && attacker.hp <= attacker.maxHp * 0.4) {
    attacker.ultimateUsed = true
    log.push(`  ★ ${attacker.m.name} unleashes its ultimate!`)
    resolveMove(attacker, defender, ultimateMove(attacker.m), rng, log)
    return
  }

  // The per-turn choice: skill (costs MP) vs free Attack vs free Block.
  const action = chooseAction(attacker, defender, rng)
  if (action.kind === 'block') {
    attacker.blockAvoid = blockValue(attacker)
    log.push(`  🛡 ${attacker.m.name} braces to block (+${attacker.blockAvoid}% avoid).`)
    return
  }
  resolveMove(attacker, defender, action.kind === 'attack' ? basicAttack(attacker.m) : action.move, rng, log)
}

export function simulateBattle(a: Monster, b: Monster, happA = 0, happB = 0): BattleResult {
  const rng = mulberry32(hashString(a.seed + '|' + b.seed + '|vs'))
  const A = makeCombatant(a, happA)
  const B = makeCombatant(b, happB)
  const log: string[] = []
  log.push(`⚔️  ${a.name} the ${a.species.name} (${a.className}) vs ${b.name} the ${b.species.name} (${b.className})`)
  log.push(`   ${a.name}: ${A.maxHp} HP · ${b.name}: ${B.maxHp} HP`)
  for (const c of [A, B]) {
    const p = activePassives(c.m)
    if (p.length) log.push(`   ${c.m.name}'s innate: ${p.join(' · ')}`)
  }

  // faster monster (DEX) acts first each round
  const aFirst = a.stats.DEX >= b.stats.DEX
  const first = aFirst ? A : B
  const second = aFirst ? B : A

  let round = 1
  const MAX_ROUNDS = 60
  while (A.hp > 0 && B.hp > 0 && round <= MAX_ROUNDS) {
    log.push(`— Round ${round} —`)
    // decrement cooldowns at the start of the round
    for (const c of [A, B]) for (const id in c.cooldowns) if (c.cooldowns[id] > 0) c.cooldowns[id]--

    takeTurn(first, second, rng, log)
    if (second.hp > 0) takeTurn(second, first, rng, log)

    tickStatuses(A, log)
    tickStatuses(B, log)
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
  return { log, winner, winnerName }
}
