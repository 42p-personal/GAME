// 1v1 auto-battle simulator (§11). Deterministic given a seed. Teamfight-Manager
// style: no player input mid-fight — the monster's build decides the outcome.
import { Monster, Move, RNG, StatusKind, chance, elementMultiplier, happinessMultiplier, hashString, mulberry32 } from './core'
import { attackStat, dodgeChance, manaRegen, maxHp, maxMana } from './monster'

interface ActiveStatus { kind: StatusKind; turns: number }

interface Combatant {
  m: Monster
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  cooldowns: Record<string, number> // moveId -> turns remaining
  statuses: ActiveStatus[]
  guard: number // temporary flat damage reduction (from buff moves)
  happiness: number // 0..10, scales damage dealt (§2.4)
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
    happiness,
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

function chooseMove(c: Combatant): Move | null {
  const ready = c.m.loadout.filter((mv) => (c.cooldowns[mv.id] ?? 0) <= 0)
  if (ready.length === 0) return null
  const dmg = ready.filter((m) => m.type === 'damage').sort((a, b) => b.power - a.power)
  if (dmg.length) return dmg[0]
  return ready[0]
}

const STRUGGLE: Move = {
  id: 'struggle', name: 'Struggle', stat: 'STR', learnLevel: 0, type: 'damage',
  channel: 'melee', target: 'enemy', cooldown: 0, accuracy: 100, power: 6, desc: 'A desperate blow.',
}

function resolveMove(attacker: Combatant, defender: Combatant, move: Move, rng: RNG, log: string[]): void {
  // Confusion: chance to hit self
  let realTarget = defender
  if (hasStatus(attacker, 'confusion') && chance(rng, 20)) {
    realTarget = attacker
    log.push(`  ${attacker.m.name} is confused and turns on itself!`)
  }

  attacker.cooldowns[move.id] = move.cooldown

  if (move.type !== 'damage') {
    // Utility: heal or guard. Everything else is flavour + spends the turn.
    if (move.power > 0) {
      const heal = Math.round(move.power * 1.2)
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal)
      log.push(`  ${attacker.m.name} uses ${move.name}, healing ${heal} HP.`)
    } else if (move.name === 'Guard' || move.name === 'Brace' || move.name === 'Bracer' || move.name === 'Iron Skin' || move.name === 'Fortify') {
      attacker.guard += Math.round(attackStat(attacker.m.stats, 'melee') * 0.15) + 4
      log.push(`  ${attacker.m.name} uses ${move.name} and braces (guard +${attacker.guard}).`)
    } else {
      log.push(`  ${attacker.m.name} uses ${move.name}.`)
    }
    return
  }

  // Accuracy vs dodge (+blind penalty)
  let acc = move.accuracy
  if (hasStatus(attacker, 'blind')) acc -= 25
  const dodge = dodgeChance(realTarget.m.stats)
  if (!chance(rng, Math.max(5, acc - dodge))) {
    log.push(`  ${attacker.m.name}'s ${move.name} misses ${realTarget.m.name}.`)
    return
  }

  const atk = attackStat(attacker.m.stats, move.channel)
  const variance = 0.85 + rng() * 0.3
  let dmg = move.power * (atk / 40) * variance
  dmg *= happinessMultiplier(attacker.happiness) // happy monsters hit harder (§2.4)
  // elemental affinity: resisted or super-effective vs the target's body type (§8.5)
  let effNote = ''
  if (move.element) {
    const em = elementMultiplier(realTarget.m.species.body, move.element)
    dmg *= em
    if (em > 1) effNote = ' — super effective!'
    else if (em < 1) effNote = ' — resisted'
  }
  // physical channels mitigated by target STR-based guard; magic/voice partly by CON
  const mitigation = (move.channel === 'melee' || move.channel === 'ranged')
    ? realTarget.m.stats.STR * 0.06 + realTarget.guard
    : realTarget.m.stats.CON * 0.04
  dmg = Math.max(1, Math.round(dmg - mitigation))
  realTarget.hp -= dmg
  realTarget.guard = 0
  log.push(`  ${attacker.m.name} uses ${move.name} → ${dmg} damage to ${realTarget.m.name}${effNote}.`)

  // Apply status
  if (move.status && chance(rng, move.status.chance)) {
    realTarget.statuses.push({ kind: move.status.kind, turns: move.status.duration })
    log.push(`    ${realTarget.m.name} is afflicted with ${move.status.kind}!`)
  }
}

function takeTurn(attacker: Combatant, defender: Combatant, rng: RNG, log: string[]): void {
  // regen mana
  attacker.mana = Math.min(attacker.maxMana, attacker.mana + manaRegen(attacker.m.stats))

  if (hasStatus(attacker, 'stun')) { log.push(`  ${attacker.m.name} is stunned and cannot act.`); return }
  if (hasStatus(attacker, 'fear')) { log.push(`  ${attacker.m.name} flees in fear and loses its action.`); return }

  const move = chooseMove(attacker) ?? STRUGGLE
  resolveMove(attacker, defender, move, rng, log)
}

export function simulateBattle(a: Monster, b: Monster, happA = 0, happB = 0): BattleResult {
  const rng = mulberry32(hashString(a.seed + '|' + b.seed + '|vs'))
  const A = makeCombatant(a, happA)
  const B = makeCombatant(b, happB)
  const log: string[] = []
  log.push(`⚔️  ${a.name} the ${a.species.name} (${a.className}) vs ${b.name} the ${b.species.name} (${b.className})`)
  log.push(`   ${a.name}: ${A.maxHp} HP · ${b.name}: ${B.maxHp} HP`)

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
