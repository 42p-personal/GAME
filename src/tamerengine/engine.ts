// The field engine's simulation loop.
//
// DETERMINISM IS THE CONTRACT. Everything downstream — resuming a saved cup,
// recomputing standings, the sim harness, replaying a fight in the arena —
// depends on `simulateFieldBattle` being a pure function of
// (monsters + placement + obstacles + seed). So: fixed dt, fixed unit order,
// one seeded rng stream, and no wall-clock or Math.random anywhere.
import { Channel, Monster, Move, MoveArea, MoveSpatial, Stat, aoeFalloff, mulberry32, hashString, StatusKind } from '../core'
import { manaCost, maxHp, maxMana } from '../monster'
import {
  DT, FIELD_H, FIELD_W, FieldEvent, FieldResult, FieldSetup, FieldSide, FieldUnit,
  MAX_TICKS, Obstacle, RETARGET_EVERY, UnitVisState, Vec2,
  CHANNEL_CAST_TIME, CHANNEL_RANGE, DEPLOY_DEPTH, SECONDS_PER_ROUND,
  SUDDEN_DEATH_AT, SUDDEN_DEATH_BASE, SUDDEN_DEATH_RAMP,
} from './types'
import { desiredGoal, dist, norm, pickTarget, spacingRadius, sub, traitsFor } from './decide'
import { personalityOf, spendAbove } from './personality'
import { spatialOf } from './spatial'
import { FIELD_STATUS, BENEFICIAL, CONFUSION_VEER } from './status'

// ── Geometry helpers ────────────────────────────────────────────────────────
const insideObstacle = (p: Vec2, o: Obstacle, pad = 0) =>
  p.x > o.x - pad && p.x < o.x + o.w + pad && p.y > o.y - pad && p.y < o.y + o.h + pad

/** Does the segment a→b cross this rectangle? Used for line of sight. */
function segmentHitsRect(a: Vec2, b: Vec2, o: Obstacle): boolean {
  // Cheap reject on bounding boxes first.
  if (Math.max(a.x, b.x) < o.x || Math.min(a.x, b.x) > o.x + o.w) return false
  if (Math.max(a.y, b.y) < o.y || Math.min(a.y, b.y) > o.y + o.h) return false
  // Sample the segment — at these scales this is both accurate enough and
  // completely predictable, which matters more here than elegance.
  const steps = Math.max(4, Math.ceil(dist(a, b) * 2))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (insideObstacle(p, o)) return true
  }
  return false
}

/** Is the attacker on the far side of the target from its own goal line? */
export const isBehind = (attacker: FieldUnit, target: FieldUnit): boolean =>
  attacker.side === 'A' ? attacker.pos.x > target.pos.x : attacker.pos.x < target.pos.x

const clampToField = (p: Vec2): Vec2 => ({
  x: Math.min(FIELD_W - 0.5, Math.max(0.5, p.x)),
  y: Math.min(FIELD_H - 0.5, Math.max(0.5, p.y)),
})

export const hasLineOfSight = (a: Vec2, b: Vec2, obstacles: Obstacle[]): boolean =>
  !obstacles.some((o) => segmentHitsRect(a, b, o))

// Non-overlap uses this fraction of the sum of visual radii, so two monsters
// settle ~1.19 units apart (0.66 × 1.8) — inside the 1.28 basic-melee reach, so
// melee still connects, but far enough that the sprites read as adjacent, never
// stacked. Must stay below (CHANNEL_RANGE.melee × 0.8) / (2 × radius) = 0.71.
const COLLISION_R_FRAC = 0.66

// ── Setup ───────────────────────────────────────────────────────────────────
/** Default cover: a symmetric pair of blocks so neither side is advantaged. */
export const DEFAULT_OBSTACLES: Obstacle[] = [
  { x: FIELD_W / 2 - 1.2, y: 3.5, w: 2.4, h: 4.5 },
  { x: FIELD_W / 2 - 1.2, y: FIELD_H - 8, w: 2.4, h: 4.5 },
]

/** Auto-deployment when the player has not placed anyone: a front arc and a back line. */
function autoPlace(team: Monster[], side: FieldSide): Vec2[] {
  const n = team.length
  return team.map((m, i) => {
    // Sturdier monsters take the front; casters and healers sit behind.
    const front = m.stats.CON + m.stats.STR >= m.stats.INT + m.stats.WIS
    const depth = front ? DEPLOY_DEPTH * 0.75 : DEPLOY_DEPTH * 0.3
    const x = side === 'A' ? depth : FIELD_W - depth
    const spread = Math.min(FIELD_H - 4, n * 3.2)
    const y = n === 1 ? FIELD_H / 2 : FIELD_H / 2 - spread / 2 + (i * spread) / Math.max(1, n - 1)
    return { x, y }
  })
}

function buildUnit(m: Monster, side: FieldSide, slot: number, pos: Vec2): FieldUnit {
  const hp = Math.min(m.hp ?? maxHp(m.stats), maxHp(m.stats))
  const mp = Math.min(m.mp ?? maxMana(m.stats), maxMana(m.stats))
  return {
    id: side + slot,
    side, slot, m,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    radius: 0.9,
    // DEX drives how fast it crosses the field — the stat finally has a
    // spatial meaning beyond initiative.
    speed: 2.4 + (m.stats.DEX / 1000) * 3.6,
    hp, maxHp: maxHp(m.stats),
    mp, maxMp: maxMana(m.stats),
    traits: traitsFor(m),
    targetId: null,
    retargetIn: 0,
    cooldowns: {},
    castingFor: 0,
    castMoveId: null,
    castTargetId: null,
    statuses: [],
    mods: [],
    forcedTargetId: null,
    forcedUntil: 0,
    rootedFor: 0,
    fadedUntil: 0,
    slowMult: 1,
    slowFor: 0,
    dead: false,
  }
}

// ── Move selection ──────────────────────────────────────────────────────────
const rangeOf = (mv: Move) => mv.range ?? CHANNEL_RANGE[mv.channel]
const castOf = (mv: Move) => mv.castTime ?? CHANNEL_CAST_TIME[mv.channel]

/** Rough damage this move would do to this target — for kill checks only. */
function estimateDamage(u: FieldUnit, mv: Move, target: FieldUnit): number {
  const atk = u.m.stats[mv.stat] ?? 0
  const mit = mv.channel === 'melee' || mv.channel === 'ranged' ? target.m.stats.CON : target.m.stats.WIS
  return Math.max(1, Math.round(mv.power * (1 + atk / 320) * (1 - Math.min(0.55, mit / 1400))))
}

/**
 * PATIENCE: is this the moment to spend a big cooldown?
 *
 * Before this the engine simply fired the highest-power move that was off
 * cooldown, so a signature move was a rotation rather than a decision — and
 * dumping it into a full-health tank cost nothing. A patient monster holds it
 * until the target is softened; an impulsive one fires the instant it is up.
 * A guaranteed KILL always overrides the wait.
 */
function worthSpending(u: FieldUnit, mv: Move, target: FieldUnit, avgPower: number): boolean {
  const isBig = mv.power > avgPower * 1.25
  if (!isBig) return true
  if (estimateDamage(u, mv, target) >= target.hp) return true // finish it
  return target.hp / target.maxHp <= spendAbove(personalityOf(u.m))
}

/** The best move this unit can actually land on its target right now. */
function chooseMove(u: FieldUnit, target: FieldUnit, obstacles: Obstacle[]): Move | null {
  const d = dist(u.pos, target.pos)
  const dmgMoves = u.m.loadout.filter((mv) => mv.type === 'damage')
  const avgPower = dmgMoves.length
    ? dmgMoves.reduce((n, mv) => n + mv.power, 0) / dmgMoves.length
    : 0
  let best: Move | null = null
  let bestScore = -Infinity
  for (const mv of dmgMoves) {
    if ((u.cooldowns[mv.id] ?? 0) > 0) continue
    if (u.mp < manaCost(mv)) continue
    if (d > rangeOf(mv)) continue
    // Ranged and magic need to actually SEE the target — cover is real.
    if (mv.channel !== 'melee' && !hasLineOfSight(u.pos, target.pos, obstacles)) continue
    if (!worthSpending(u, mv, target, avgPower)) continue
    const score = mv.power
    if (score > bestScore) { bestScore = score; best = mv }
  }
  return best
}

/**
 * ⚠️ NON-DAMAGE MOVES USED TO BE DEAD WEIGHT. `chooseMove` filtered
 * `type === 'damage'`, so a monster holding Mend, Bastion, Hallowed Ground or
 * any of the six movement abilities simply never cast them — the whole field
 * move set, and every support kit in the game, was inert on the field. This is
 * the half of move selection that was missing.
 *
 * The score is expressed on the SAME scale as damage (a move's `power`, roughly
 * 12–68 across the pool), so utility and damage compete honestly in one
 * comparison rather than needing a priority order. A utility cast wins when the
 * situation makes it genuinely worth more than hitting something.
 *
 * ⚠️ It returns 0 — never cast — for effects the field engine does not model:
 * ward, guard, thorns and the round-based stat buffs have no representation
 * here. Scoring them anyway would have monsters spending casts on nothing.
 * Making them real is a separate piece of work, not something to fake.
 */
interface UtilityAim { mv: Move; aim: FieldUnit; score: number }

/** Below this an effect is not worth a cast, a cooldown, or the mana. */
const UTILITY_FLOOR = 8

function utilityScore(
  u: FieldUnit, mv: Move, mates: FieldUnit[], foes: FieldUnit[],
): UtilityAim | null {
  const sp = spatialOf(mv.name)
  const live = (xs: FieldUnit[]) => xs.filter((x) => !x.dead)
  const allies = [u, ...live(mates).filter((x) => x.id !== u.id)]
  const enemies = live(foes)
  if (!enemies.length) return null

  let best: UtilityAim | null = null
  const offer = (score: number, aim: FieldUnit) => {
    if (score > 0 && (!best || score > best.score)) best = { mv, aim, score }
  }

  // ── HEALING ───────────────────────────────────────────────────────────────
  // Worth what it actually restores, not its printed number: a 60-point heal on
  // someone missing 10 HP is worth 10. Same rule as `battle.ts:healValue`, so
  // the two engines agree about when a Sage should heal.
  if (mv.power > 0 && (mv.type === 'buff' || mv.type === 'control')
      && (mv.target === 'self' || mv.target === 'ally' || mv.target === 'team')) {
    const pool = mv.target === 'self' ? [u] : allies
    const patient = [...pool].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
    if (patient) {
      const restored = mv.target === 'team'
        ? pool.reduce((n, c) => n + Math.min(mv.power, c.maxHp - c.hp), 0)
        : Math.min(mv.power, patient.maxHp - patient.hp)
      // Face value is what it restores, but a heal is worth MORE than its
      // number when it denies a kill — scored flat, healing simply never won a
      // comparison against damage and no monster ever healed anyone.
      const urgency = 1 + (1 - patient.hp / patient.maxHp) * 1.5
      offer(restored * urgency, patient)
    }
  }

  if (sp) {
    // ── ESCAPE ──────────────────────────────────────────────────────────────
    // Fading or dashing clear is worth exactly as much as the danger you are
    // in. With nothing near, both score zero, so a healthy monster never wastes
    // the cooldown — the cost of getting this wrong is that Fade becomes a tic.
    if (sp.fade || sp.move?.to === 'awayFromTarget') {
      const near = enemies.filter((e) => dist(u.pos, e.pos) < 5).length
      const hurt = 1 - u.hp / u.maxHp
      offer(near * 16 + hurt * 40 - 10, u)
    }

    // ── ZONES ───────────────────────────────────────────────────────────────
    // A patch of ground is worth the bodies standing on it. Aimed zones look at
    // the best enemy cluster; self-centred ones at who is already beside you.
    if (sp.zone) {
      const z = sp.zone
      const hostile = z.effect !== 'heal'
      const crowd = hostile ? enemies : allies
      const rate = z.power * z.duration * (hostile ? 0.5 : 0.35)
      if (z.centre === 'target') {
        for (const c of enemies) {
          const caught = crowd.filter((x) => dist(c.pos, x.pos) <= z.radius).length
          if (dist(u.pos, c.pos) <= rangeOf(mv)) offer(caught * rate * 0.5, c)
        }
      } else {
        const caught = crowd.filter((x) => dist(u.pos, x.pos) <= z.radius
          && (hostile || x.hp < x.maxHp)).length
        offer(caught * rate * 0.5, u)
      }
    }

    // ── HAULING AN ALLY OUT ─────────────────────────────────────────────────
    // Only worth a cast when someone is genuinely in trouble AND far enough
    // away that dragging them changes anything.
    if (sp.haulAlly) {
      const worst = allies.filter((a) => a.id !== u.id)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      if (worst && worst.hp / worst.maxHp < 0.5 && dist(worst.pos, u.pos) > 4) {
        offer((1 - worst.hp / worst.maxHp) * 60, worst)
      }
    }
  }

  // ── CONTROL AND DEBUFFS ───────────────────────────────────────────────────
  // ⚠️ ONLY what the field genuinely implements. A first cut scored every
  // `type: 'debuff'` move, and the AI immediately spent 86 casts on Taunt
  // across 25 fights back when taunt did nothing — the exact "spending casts on
  // nothing" failure this scorer exists to avoid. Anything unmodelled (cleanse,
  // accuracy and dodge mods, ward, thorns) must score zero until it is real.
  const fx = mv.effects
  const modelled = !!(mv.status || sp?.root || sp?.slow || sp?.pull || sp?.push
    || fx?.atkDebuff || fx?.tauntForce)
  if (modelled) {
    const chance = (mv.status?.chance ?? 100) / 100
    for (const e of enemies) {
      if (dist(u.pos, e.pos) > rangeOf(mv)) continue
      // ⚠️ REFRESHING SOMETHING ALREADY RUNNING IS NEARLY WORTHLESS. Without
      // this the AI re-cast the same debuff the instant its cooldown returned —
      // War Cry alone took 129 of 242 utility casts, most of them onto a buff
      // that had not expired. Same principle as overhealing being wasted.
      const already = (mv.status && e.statuses.some((st) => st.kind === mv.status!.kind))
        || (fx?.atkDebuff && e.mods.some((m) => (m.atk ?? 1) < 1))
        || (fx?.tauntForce && e.forcedTargetId === u.id)
      // Control is worth most on whoever is most dangerous and least dead —
      // stunning something about to die wastes it.
      offer(34 * chance * (e.hp / e.maxHp) * (already ? 0.1 : 1), e)
    }
  }

  // ── SELF AND TEAM BUFFS ───────────────────────────────────────────────────
  // Only the two the field reads. A flat worth, discounted so a buff never
  // outbids a real nuke, and scaled by how many allies it actually reaches.
  if ((fx?.atkBuff || fx?.defBuff) && (mv.target === 'self' || mv.target === 'ally' || mv.target === 'team')) {
    const reach = mv.target === 'team' ? allies.length : 1
    const running = (fx.atkBuff && u.mods.some((m) => (m.atk ?? 1) > 1))
      || (fx.defBuff && u.mods.some((m) => (m.dmgTaken ?? 1) < 1))
    offer(((fx.atkBuff ?? 0) * 55 * reach + (fx.defBuff ?? 0) * 0.5 * reach) * (running ? 0.1 : 1), u)
  }

  return best
}

/**
 * The free universal attack. Every unit needs one it can use AT ITS OWN REACH:
 * a first pass gave everyone a melee-only swing, so an archer whose skills were
 * all on cooldown simply stood at range doing nothing — 6 units managed one hit
 * every ~6 seconds and the fight read as passive. A basic attack matched to the
 * unit's natural range keeps everyone contributing between cooldowns.
 */
function basicAttack(u: FieldUnit): Move {
  // Fight at the range this monster is built for.
  let channel: Channel = 'melee'
  let best = 0
  for (const mv of u.m.loadout) {
    if (mv.type !== 'damage') continue
    if (mv.power > best) { best = mv.power; channel = mv.channel }
  }
  const stat: Stat = channel === 'melee' ? 'STR' : channel === 'ranged' ? 'DEX'
    : channel === 'magic' ? 'INT' : channel === 'voice' ? 'CHA' : 'WIS'
  return {
    id: 'basic', name: 'Attack', stat, learnLevel: 0, type: 'damage',
    channel, target: 'enemy',
    // Deliberately weak and fast — it fills the gaps between real skills, it
    // does not replace them.
    cooldown: 0.9, accuracy: 90,
    power: 12 + (u.m.stats[stat] ?? 0) / 26,
    range: CHANNEL_RANGE[channel] * 0.8,
    castTime: 0.15,
    desc: 'A basic strike.',
  }
}

// ── Status accessors ────────────────────────────────────────────────────────
// A unit can carry several afflictions at once, so every query is an aggregate
// over the whole list rather than a lookup of one. Flags OR together, penalties
// add, multipliers multiply — stating that once here is what stops each call
// site inventing its own stacking rule.
const hasStatus = (u: FieldUnit, k: StatusKind) => u.statuses.some((s) => s.kind === k)

/**
 * The unit's active effects, split into buff/debuff icon keys for the renderer's
 * two rows. Statuses map by sign (`BENEFICIAL` → buff, the rest → debuff); the
 * timed `mods` become `atkUp`/`atkDown`/`defUp`. De-duped so a stack of the same
 * kind shows one icon. Active-only, so both lists are usually 0–3.
 */
function effectIcons(u: FieldUnit): { buffs: string[]; debuffs: string[] } {
  const buffs = new Set<string>()
  const debuffs = new Set<string>()
  for (const s of u.statuses) (BENEFICIAL.has(s.kind) ? buffs : debuffs).add(s.kind)
  for (const m of u.mods) {
    if (m.atk && m.atk > 1) buffs.add('atkUp')
    else if (m.atk && m.atk < 1) debuffs.add('atkDown')
    if (m.dmgTaken && m.dmgTaken < 1) buffs.add('defUp')
  }
  return { buffs: [...buffs], debuffs: [...debuffs] }
}

type StatusFlag = 'incapacitates' | 'noSkills' | 'noAttack' | 'blockHeal' | 'turncoat'
const statusFlag = (u: FieldUnit, key: StatusFlag) =>
  u.statuses.some((s) => FIELD_STATUS[s.kind][key])

const statusAccPenalty = (u: FieldUnit) =>
  u.statuses.reduce((n, s) => n + (FIELD_STATUS[s.kind].accPenalty ?? 0), 0)

const statusSpeedMult = (u: FieldUnit) =>
  u.statuses.reduce((n, s) => n * (FIELD_STATUS[s.kind].speedMult ?? 1), 1)

const statusDamageTaken = (u: FieldUnit) =>
  u.statuses.reduce((n, s) => n * (FIELD_STATUS[s.kind].damageTakenMult ?? 1), 1)

const modAtk = (u: FieldUnit) => u.mods.reduce((n, m) => n * (m.atk ?? 1), 1)
const modDmgTaken = (u: FieldUnit) => u.mods.reduce((n, m) => n * (m.dmgTaken ?? 1), 1)

/** The affliction currently driving this unit's feet, if any. First wins. */
const steeringStatus = (u: FieldUnit) => {
  for (const s of u.statuses) {
    const st = FIELD_STATUS[s.kind].steer
    if (st) return { steer: st, from: s.from }
  }
  return null
}

// A confused monster veers consistently for the whole fight rather than
// jittering: which way it leans is derived from its id, so a replay of the same
// battle traces the same wrong path. Randomising it here would spend rng draws
// and break the determinism the field contract rests on.
const veerSign = (u: FieldUnit) => (hashString(u.id) % 2 === 0 ? 1 : -1)

// ── The loop ────────────────────────────────────────────────────────────────
export function simulateFieldBattle(setup: FieldSetup): FieldResult {
  const rng = mulberry32(hashString(
    setup.seed + ':' + setup.teamA.map((m) => m.seed).join(',') + '|' + setup.teamB.map((m) => m.seed).join(','),
  ))
  const obstacles = setup.obstacles ?? DEFAULT_OBSTACLES
  const placeA = setup.placeA ?? autoPlace(setup.teamA, 'A')
  const placeB = setup.placeB ?? autoPlace(setup.teamB, 'B')
  const units: FieldUnit[] = [
    ...setup.teamA.map((m, i) => buildUnit(m, 'A', i, placeA[i] ?? autoPlace(setup.teamA, 'A')[i])),
    ...setup.teamB.map((m, i) => buildUnit(m, 'B', i, placeB[i] ?? autoPlace(setup.teamB, 'B')[i])),
  ]
  const byId = new Map(units.map((u) => [u.id, u]))
  const events: FieldEvent[] = []
  // Persistent patches of ground. The arena's own contribution to tactics: a
  // zone denies SPACE rather than damaging a body.
  const zones: { x: number; y: number; r: number; until: number; effect: 'damage' | 'slow' | 'heal'; power: number; side: FieldSide }[] = []
  const vis = new Map<string, UnitVisState>(units.map((u) => [u.id, 'idle']))
  // Total damage each side has dealt — the fair, deterministic tiebreak when a
  // fight ends in a true simultaneous double-death (both sides' last unit dying
  // the same tick, which hard collision made possible by keeping fights closer).
  const dmgDealt = { A: 0, B: 0 }

  const living = (side: FieldSide) => units.filter((u) => u.side === side && !u.dead)
  let tick = 0
  let winner: FieldSide | 'draw' = 'draw'

  // Enforce non-overlap at SETUP too: a custom placement (hex deployment) or a
  // tight auto-placement must not start two monsters on the same spot.
  resolveCollisions()

  for (; tick < MAX_TICKS; tick++) {
    const t = +(tick * DT).toFixed(2)

    if (!living('A').length || !living('B').length) {
      winner = living('A').length ? 'A' : living('B').length ? 'B' : 'draw'
      break
    }

    for (const u of units) {
      if (u.dead) { vis.set(u.id, 'dead'); continue }

      // timers
      for (const k of Object.keys(u.cooldowns)) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - DT)
      u.retargetIn -= DT
      u.rootedFor = Math.max(0, u.rootedFor - DT)
      u.slowFor = Math.max(0, u.slowFor - DT)
      if (u.slowFor <= 0) u.slowMult = 1
      u.mp = Math.min(u.maxMp, u.mp + (u.m.stats.WIS / 300) * DT)
      tickStatuses(u, t)
      if (u.dead) { vis.set(u.id, 'dead'); continue }

      // HARD CONTROL. A stun does not merely stop the next action — it BREAKS
      // the cast in progress, which is the whole counterplay to a long wind-up
      // like Meteor. Without the interrupt, control would be strictly worse
      // against the moves it most needs to answer.
      if (statusFlag(u, 'incapacitates')) {
        u.castingFor = 0
        u.castMoveId = null
        vis.set(u.id, 'idle')
        continue
      }

      // CHARM turns a monster on its own side: the list it treats as hostile is
      // swapped wholesale, so targeting, steering and threat all follow without
      // any of them needing to know charm exists.
      const charmed = statusFlag(u, 'turncoat')
      const own = units.filter((x) => x.side === u.side)
      const opp = units.filter((x) => x.side !== u.side)
      const foes = charmed ? own.filter((x) => x.id !== u.id) : opp
      const mates = charmed ? opp : own

      // Commit to a target for RETARGET_EVERY, unless it died.
      const cur = u.targetId ? byId.get(u.targetId) : null
      if (!cur || cur.dead || u.retargetIn <= 0) {
        const pick = pickTarget(u, foes, mates, t)
        u.targetId = pick?.id ?? null
        u.retargetIn = RETARGET_EVERY
      }
      // A TAUNT outranks the unit's own judgement — that is the whole point of
      // one. Charm wins over it, because charm already swapped which side
      // counts as hostile and a taunter on the far team is no longer reachable.
      const forced = u.forcedTargetId ? byId.get(u.forcedTargetId) : null
      if (forced && !forced.dead && foes.includes(forced)) u.targetId = forced.id
      const target = u.targetId ? byId.get(u.targetId) ?? null : null

      // A committed cast roots the unit — this is the window a diver punishes.
      if (u.castingFor > 0) {
        u.castingFor -= DT
        vis.set(u.id, 'cast')
        if (u.castingFor <= 0 && u.castMoveId) {
          const aim = byId.get(u.castTargetId ?? '') ?? target
          if (aim && !aim.dead) resolveHit(u, aim, u.castMoveId)
          else { u.castMoveId = null; u.castTargetId = null }
        }
        continue
      }

      if (!target) { vis.set(u.id, 'idle'); continue }

      // Act if something is in range; otherwise reposition.
      // real skill first, else the basic attack if the target is within ITS reach
      // FEAR is a rout, not a stun: the victim keeps moving — away — but cannot
      // bring itself to turn and fight. SILENCE locks the skills only, leaving
      // the free attack, so a silenced monster is diminished rather than absent.
      const routed = statusFlag(u, 'noAttack')
      const silenced = statusFlag(u, 'noSkills')
      // Settle the DAMAGE option first — best skill, else the free attack —
      // then let utility try to beat it. ⚠️ Scoring utility against the skill
      // alone made the bar zero whenever every skill was on cooldown, so a
      // near-worthless buff pre-empted the basic attack and War Cry took 137 of
      // 254 utility casts. The bar is whatever the unit would otherwise DO.
      let mv: Move | null = routed || silenced ? null : chooseMove(u, target, obstacles)
      if (!mv && !routed) {
        const ba = basicAttack(u)
        const inReach = dist(u.pos, target.pos) <= (ba.range ?? CHANNEL_RANGE.melee)
        const canSee = ba.channel === 'melee' || hasLineOfSight(u.pos, target.pos, obstacles)
        if (inReach && canSee && (u.cooldowns.basic ?? 0) <= 0) mv = ba
      }
      let aim: FieldUnit = target
      if (!routed && !silenced) {
        // Utility competes with damage on the SAME scale, so the better answer
        // to the situation wins outright — no priority order to get wrong. The
        // floor stops a unit with nothing better to do burning cooldowns on
        // effects worth almost nothing.
        const best = bestUtility(u, target, mates, foes, obstacles)
        if (best && best.score > Math.max(UTILITY_FLOOR, mv?.power ?? 0)) { mv = best.mv; aim = best.aim }
      }
      if (mv) {
        u.castingFor = castOf(mv)
        u.castMoveId = mv.id
        u.castTargetId = aim.id
        u.cooldowns[mv.id] = mv.cooldown * 0.9 + castOf(mv)
        u.mp = Math.max(0, u.mp - manaCost(mv))
        events.push({ t, kind: 'cast', id: u.id, targetId: aim.id, move: mv.name, channel: mv.channel })
        applyCasterMovement(u, aim, mv, t, obstacles)
        applySelfEffects(u, aim, mv, t)
        vis.set(u.id, 'cast')
        // Instant moves land the same tick they are cast.
        if (u.castingFor <= 0) { resolveHit(u, aim, mv.id); u.castMoveId = null; u.castTargetId = null }
        continue
      }

      // MOVE. Steer toward the goal, slide off obstacles, keep off allies.
      // A ROOTED unit may still act — it simply cannot travel, which is what
      // makes a root a genuine answer to a fast diver rather than a stun.
      if (u.rootedFor > 0) { vis.set(u.id, 'idle'); continue }
      let goal = desiredGoal(u, target, mates, foes, (a, b) => hasLineOfSight(a, b, obstacles))
      // THE THREE SPATIAL STATUSES. On the field these words can mean something
      // a turn counter cannot express, so they hijack the goal outright rather
      // than rolling a chance to misbehave.
      const steer = steeringStatus(u)
      if (steer) {
        const src = byId.get(steer.from)
        if (steer.steer === 'flee' && src) {
          // Run. Straight away from whatever frightened it, to the field edge.
          const away = norm(sub(u.pos, src.pos))
          goal = clampToField({ x: u.pos.x + away.x * FIELD_W, y: u.pos.y + away.y * FIELD_W })
        } else if (steer.steer === 'toSource' && src) {
          goal = { ...src.pos }
        } else if (steer.steer === 'veer') {
          // Walk the wrong way: the heading is rotated, so it still travels
          // with purpose — it is simply mistaken about where it is going.
          const d = sub(goal, u.pos)
          const a = CONFUSION_VEER * veerSign(u)
          const rx = d.x * Math.cos(a) - d.y * Math.sin(a)
          const ry = d.x * Math.sin(a) + d.y * Math.cos(a)
          goal = clampToField({ x: u.pos.x + rx, y: u.pos.y + ry })
        }
      }
      stepToward(u, goal, mates, obstacles)
      vis.set(u.id, 'move')
    }

    // HARD COLLISION. `stepToward`'s separation is only a soft steering force, so
    // units still overlap when they converge. This pass runs once everyone has
    // moved and pushes overlapping pairs apart until no two share space — a
    // monster pinned by several attackers settles adjacent to all of them.
    resolveCollisions()

    // ZONES tick on everyone standing in them, friend or foe as appropriate.
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]
      if (t >= z.until) { zones.splice(i, 1); continue }
      for (const u of units) {
        if (u.dead || dist(u.pos, z) > z.r + u.radius) continue
        if (z.effect === 'heal') {
          if (u.side !== z.side) continue
          if (statusFlag(u, 'blockHeal')) continue
          u.hp = Math.min(u.maxHp, u.hp + z.power * DT)
        } else if (z.effect === 'slow') {
          if (u.side === z.side) continue
          u.slowMult = Math.min(u.slowMult, z.power)
          u.slowFor = Math.max(u.slowFor, 0.4)
        } else {
          if (u.side === z.side) continue
          u.hp -= z.power * DT
          if (u.hp <= 0) {
            u.hp = 0; u.dead = true; vis.set(u.id, 'dead')
            events.push({ t, kind: 'death', id: u.id })
          }
        }
      }
    }

    // SUDDEN DEATH — the clock itself starts killing, harder every second, so
    // no pair of teams can stall each other past the cap.
    if (t >= SUDDEN_DEATH_AT) {
      const rate = SUDDEN_DEATH_BASE + (t - SUDDEN_DEATH_AT) * SUDDEN_DEATH_RAMP
      for (const u of units) {
        if (u.dead) continue
        u.hp -= u.maxHp * rate * DT
        if (u.hp <= 0) {
          u.hp = 0; u.dead = true; vis.set(u.id, 'dead')
          events.push({ t, kind: 'death', id: u.id })
        }
      }
    }

    // One positional snapshot per tick for the renderer to interpolate.
    events.push({
      t, kind: 'snapshot',
      units: units.map((u) => {
        const fx = effectIcons(u)
        return {
          id: u.id, x: +u.pos.x.toFixed(2), y: +u.pos.y.toFixed(2),
          facing: u.side === 'A' ? 1 : -1,
          state: vis.get(u.id) ?? 'idle',
          hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
          mp: Math.round(u.mp), maxMp: Math.round(u.maxMp),
          buffs: fx.buffs, debuffs: fx.debuffs,
        }
      }),
    })
  }

  if (winner === 'draw' && living('A').length !== living('B').length) {
    winner = living('A').length > living('B').length ? 'A' : 'B'
  }
  // Still a draw = a genuine simultaneous wipe. Break it by who dealt more total
  // damage — the side that was fighting harder takes it. Deterministic, and only
  // a perfect damage tie (vanishingly rare) stays a draw.
  if (winner === 'draw' && dmgDealt.A !== dmgDealt.B) {
    winner = dmgDealt.A > dmgDealt.B ? 'A' : 'B'
  }
  events.push({ t: +(tick * DT).toFixed(2), kind: 'end', winner })

  return {
    winner, events,
    duration: +(tick * DT).toFixed(2),
    survivorsA: living('A').length,
    survivorsB: living('B').length,
  }

  // ── inner helpers (close over rng/events/units) ───────────────────────────
  /**
   * Everyone an AREA move actually catches, in fixed unit order so the result
   * stays deterministic. A shape centred on 'self' radiates from the caster (a
   * scream cannot be aimed at a spot); one centred on 'target' lands where the
   * victim is standing, which is what makes clumping dangerous.
   */
  function areaVictims(u: FieldUnit, target: FieldUnit, area: MoveArea): FieldUnit[] {
    const origin = area.centre === 'self' ? u.pos : target.pos
    const foes = units.filter((x) => x.side !== u.side && !x.dead)
    if (area.shape === 'circle') {
      const r = area.radius ?? 4
      return foes.filter((f) => dist(origin, f.pos) <= r + f.radius)
    }
    if (area.shape === 'cone') {
      const reach = area.range ?? 4
      const half = ((area.angle ?? 90) / 2) * (Math.PI / 180)
      const facing = norm(sub(target.pos, u.pos))
      return foes.filter((f) => {
        const d = dist(origin, f.pos)
        if (d > reach + f.radius || d < 1e-6) return false
        const to = norm(sub(f.pos, origin))
        return Math.acos(Math.max(-1, Math.min(1, to.x * facing.x + to.y * facing.y))) <= half
      })
    }
    // line: everything within `width` of the segment from the caster outward.
    const reach = area.range ?? 8
    const halfW = (area.width ?? 2) / 2
    const dir = norm(sub(target.pos, u.pos))
    return foes.filter((f) => {
      const rel = sub(f.pos, u.pos)
      const along = rel.x * dir.x + rel.y * dir.y
      if (along < 0 || along > reach) return false
      const perp = Math.abs(rel.x * -dir.y + rel.y * dir.x)
      return perp <= halfW + f.radius
    })
  }

  /** The best utility cast available to this unit right now, if any. */
  function bestUtility(u: FieldUnit, target: FieldUnit, mates: FieldUnit[], foes: FieldUnit[], obs: Obstacle[]) {
    let best: { mv: Move; aim: FieldUnit; score: number } | null = null
    for (const mv of u.m.loadout) {
      if (mv.type === 'damage') continue
      if ((u.cooldowns[mv.id] ?? 0) > 0) continue
      if (u.mp < manaCost(mv)) continue
      const got = utilityScore(u, mv, mates, foes)
      if (!got) continue
      // Same reach and cover rules as a damage cast — a support cannot heal
      // through a rock any more than a mage can burn through one.
      if (dist(u.pos, got.aim.pos) > rangeOf(mv)) continue
      if (mv.channel !== 'melee' && got.aim.id !== u.id && !hasLineOfSight(u.pos, got.aim.pos, obs)) continue
      if (!best || got.score > best.score) best = got
    }
    void target
    return best
  }

  /** How a non-damage cast lands: healing, then its spatial and status riders. */
  function resolveUtility(u: FieldUnit, aim: FieldUnit, mv: Move, t2: number) {
    const sp = spatialOf(mv.name)
    const friendly = aim.side === u.side
    const fx = mv.effects
    // ⚠️ UNITS ARE NOT UNIFORM (see CLAUDE.md): `atkBuff`/`atkDebuff` are
    // FRACTIONS, `defBuff` is percentage POINTS. Reading either as the other
    // compiles, runs, and is wrong by a factor of a hundred.
    const until = t2 + (fx?.duration ?? 3) * SECONDS_PER_ROUND
    if (fx?.atkBuff && friendly) {
      const crowd = mv.target === 'team' ? units.filter((x) => x.side === u.side && !x.dead) : [aim]
      for (const v of crowd) v.mods.push({ atk: 1 + fx.atkBuff, until })
    }
    if (fx?.defBuff && friendly) {
      const crowd = mv.target === 'team' ? units.filter((x) => x.side === u.side && !x.dead) : [aim]
      for (const v of crowd) v.mods.push({ dmgTaken: Math.max(0.4, 1 - fx.defBuff / 100), until })
    }
    if (friendly && mv.power > 0 && !statusFlag(aim, 'blockHeal')) {
      const healed = Math.min(mv.power, aim.maxHp - aim.hp)
      if (healed > 0) {
        aim.hp += healed
        events.push({ t: t2, kind: 'heal', id: u.id, targetId: aim.id, move: mv.name, amount: Math.round(healed) })
      }
    }
    if (!friendly) {
      // Debuffs respect their area shape exactly as damage does, so a shout
      // that should catch a cluster does, and a single-target root does not.
      const victims = sp?.area ? areaVictims(u, aim, sp.area)
        : mv.target === 'allEnemies' ? units.filter((x) => x.side !== u.side && !x.dead)
        : [aim]
      for (const v of victims) {
        if (v.dead) continue
        if (fx?.atkDebuff) v.mods.push({ atk: Math.max(0.4, 1 - fx.atkDebuff), until })
        // TAUNT: forced onto the taunter, which is what makes a tank able to
        // defend a back line it is not physically standing in front of.
        if (fx?.tauntForce) { v.forcedTargetId = u.id; v.forcedUntil = until }
        if (sp) applyOnTarget(u, v, sp, t2)
        if (mv.status && !BENEFICIAL.has(mv.status.kind) && rng() * 100 < mv.status.chance) {
          applyFieldStatus(u, v, mv.status.kind, mv.status.duration, t2)
        }
      }
    } else if (mv.status && BENEFICIAL.has(mv.status.kind)) {
      // The pool's two haste moves are team buffs — the only way haste is ever
      // handed out, so without this branch the status would never once appear.
      const crowd = mv.target === 'team' ? units.filter((x) => x.side === u.side && !x.dead) : [aim]
      for (const v of crowd) applyFieldStatus(u, v, mv.status.kind, mv.status.duration, t2)
    }
  }

  /**
   * Land an affliction. Duration is authored in ROUNDS by every move in the
   * game; this is the ONE place it becomes seconds, so the conversion can never
   * be restated inconsistently elsewhere.
   *
   * Bleed stacks (up to 3, each ticking its own damage) — everything else
   * refreshes, exactly as `battle.ts:applyStatus` does. Two engines disagreeing
   * on whether a status stacks would be a genuine balance divergence.
   */
  function applyFieldStatus(from: FieldUnit, target: FieldUnit, kind: StatusKind, rounds: number, t: number) {
    if (target.dead) return
    const until = t + rounds * SECONDS_PER_ROUND
    const rule = FIELD_STATUS[kind]
    if (rule.maxStacks) {
      if (target.statuses.filter((s) => s.kind === kind).length >= rule.maxStacks) return
      target.statuses.push({ kind, until, from: from.id })
    } else {
      const existing = target.statuses.find((s) => s.kind === kind)
      if (existing) {
        existing.until = Math.max(existing.until, until)
        existing.from = from.id // whoever most recently applied it is what fear runs from
      } else {
        target.statuses.push({ kind, until, from: from.id })
      }
    }
    if (rule.lurchToSource) {
      const dir = norm(sub(from.pos, target.pos))
      const step = Math.min(rule.lurchToSource, Math.max(0, dist(from.pos, target.pos) - 1.6))
      const dest = clampToField({ x: target.pos.x + dir.x * step, y: target.pos.y + dir.y * step })
      if (step > 0 && !obstacles.some((o) => insideObstacle(dest, o, target.radius * 0.6))) {
        target.pos = dest
        events.push({ t, kind: 'shove', id: target.id, by: from.id, kind2: 'pull' })
      }
    }
    events.push({ t, kind: 'status', id: target.id, by: from.id, status: kind })
  }

  /** Attrition, expiry, and the one status that pays out ON expiry. */
  function tickStatuses(u: FieldUnit, t: number) {
    if (u.mods.length) u.mods = u.mods.filter((m) => t < m.until)
    if (u.forcedTargetId && (t >= u.forcedUntil || byId.get(u.forcedTargetId)?.dead)) {
      u.forcedTargetId = null
    }
    if (!u.statuses.length) return
    let lost = 0
    for (const s of u.statuses) {
      const rule = FIELD_STATUS[s.kind]
      if (rule.hpPerSec) lost += u.maxHp * rule.hpPerSec * DT
      if (rule.mpPerSec) u.mp = Math.max(0, u.mp - u.maxMp * rule.mpPerSec * DT)
    }
    // DOOM is a countdown, not a drip: it does nothing until its timer runs
    // out, and then hits for a quarter of the victim's health. Cleansing or
    // killing the caster in time is the counterplay, so it MUST resolve on
    // expiry rather than being silently dropped by the filter below.
    const expired = u.statuses.filter((s) => t >= s.until)
    for (const s of expired) {
      const det = FIELD_STATUS[s.kind].detonate
      if (det) lost += u.maxHp * det
    }
    if (expired.length) u.statuses = u.statuses.filter((s) => t < s.until)
    if (lost > 0) {
      u.hp -= lost
      if (u.hp <= 0) {
        u.hp = 0; u.dead = true; vis.set(u.id, 'dead')
        events.push({ t, kind: 'death', id: u.id })
      }
    }
  }

  function resolveHit(u: FieldUnit, target: FieldUnit, moveId: string) {
    const mv = u.m.loadout.find((x) => x.id === moveId) ?? basicAttack(u)
    u.castMoveId = null
    u.castTargetId = null
    const t2 = +(tick * DT).toFixed(2)
    // A NON-DAMAGE move does not go through `strike` at all — it would roll
    // accuracy and mitigation against a friend. It restores, or it controls.
    if (mv.type !== 'damage') { resolveUtility(u, target, mv, t2); return }
    // AREA MOVES fan out to whoever is genuinely inside the shape, each hit
    // discounted by the existing AoE falloff so splashing six bodies is not
    // six times a single-target cast.
    const areaSpec = spatialOf(mv.name)?.area
    if (areaSpec) {
      const victims = areaVictims(u, target, areaSpec)
      if (!victims.length) {
        events.push({ t: t2, kind: 'miss', id: u.id, targetId: target.id, move: mv.name })
        return
      }
      const falloff = aoeFalloff(victims.length)
      for (const v of victims) strike(u, v, mv, t2, falloff)
      return
    }
    strike(u, target, mv, t2, 1)
  }

  function strike(u: FieldUnit, target: FieldUnit, mv: Move, t2: number, falloff: number) {
    if (target.dead) return
    // Out of range by the time it lands (the target walked away) — a real
    // miss. Area moves already resolved their own geometry, so they skip this.
    if (falloff === 1 && dist(u.pos, target.pos) > rangeOf(mv) * 1.25) {
      events.push({ t: t2, kind: 'miss', id: u.id, targetId: target.id, move: mv.name })
      return
    }
    // BLIND and CONFUSION bite here — the accuracy penalty is the same one the
    // turn engine applies, so a blinded monster is worth the same in either.
    if (rng() * 100 > mv.accuracy - statusAccPenalty(u)) {
      events.push({ t: t2, kind: 'miss', id: u.id, targetId: target.id, move: mv.name })
      return
    }
    const atk = u.m.stats[mv.stat] ?? 0
    const mitigation = mv.channel === 'melee' || mv.channel === 'ranged' ? target.m.stats.CON : target.m.stats.WIS
    const crit = rng() < 0.08
    // BACKSTAB: the payoff for arriving behind someone, and the reason a blink
    // is worth a slot. It only pays if the caster is genuinely on the far side.
    const sp = spatialOf(mv.name)
    const behind = sp?.backstab && isBehind(u, target) ? sp.backstab : 1
    const raw = mv.power * (1 + atk / 320) * (crit ? 1.5 : 1) * behind * falloff * modAtk(u)
    const dmg = Math.max(1, Math.round(raw * (1 - Math.min(0.55, mitigation / 1400)) * statusDamageTaken(target) * modDmgTaken(target)))
    target.hp -= dmg
    dmgDealt[u.side] += dmg
    events.push({ t: t2, kind: 'hit', id: u.id, targetId: target.id, move: mv.name, channel: mv.channel, dmg, crit })
    // SLEEP breaks the moment it is hit — otherwise it would be a stun with a
    // longer duration and no drawback, and there would be no reason to run one.
    if (hasStatus(target, 'sleep')) target.statuses = target.statuses.filter((st) => st.kind !== 'sleep')
    // The move's own rider. Rolled AFTER the hit lands, so a miss applies
    // nothing — and never onto an ally, since a few statuses are beneficial.
    if (mv.status && u.side !== target.side && !BENEFICIAL.has(mv.status.kind)
        && rng() * 100 < mv.status.chance) {
      applyFieldStatus(u, target, mv.status.kind, mv.status.duration, t2)
    }
    if (sp) applyOnTarget(u, target, sp, t2)
    if (target.hp <= 0) {
      target.hp = 0
      target.dead = true
      vis.set(target.id, 'dead')
      events.push({ t: t2, kind: 'death', id: target.id })
    }
  }


  /**
   * Move the CASTER as part of its cast — a charge or a teleport.
   *
   * The difference between them is the whole design: a `dash` crosses the
   * ground and IS stopped by cover, so good positioning still protects you; a
   * `blink` ignores cover, which is the only way to reach a caster who has
   * correctly hidden behind a rock. That is what a teleport is FOR — and why
   * it is priced with a backstab that only pays if you actually arrive behind.
   */
  function applyCasterMovement(u: FieldUnit, target: FieldUnit, mv: Move, t: number, obs: Obstacle[]) {
    const sp = spatialOf(mv.name)
    if (!sp?.move) return
    const from = { ...u.pos }
    const dir = norm(sub(target.pos, u.pos))
    let dest: Vec2
    if (sp.move.to === 'behindTarget') {
      dest = { x: target.pos.x + dir.x * 1.6, y: target.pos.y + dir.y * 1.6 }
    } else if (sp.move.to === 'awayFromTarget') {
      dest = { x: u.pos.x - dir.x * sp.move.maxRange, y: u.pos.y - dir.y * sp.move.maxRange }
    } else {
      dest = { x: target.pos.x - dir.x * 1.4, y: target.pos.y - dir.y * 1.4 }
    }
    const d = dist(from, dest)
    if (d > sp.move.maxRange) {
      const k = sp.move.maxRange / d
      dest = { x: from.x + (dest.x - from.x) * k, y: from.y + (dest.y - from.y) * k }
    }
    dest = clampToField(dest)
    if (obs.some((o) => insideObstacle(dest, o, u.radius * 0.6))) return // never land inside rock
    if (sp.move.kind === 'dash' && !hasLineOfSight(from, dest, obs)) return // a charge is blocked by cover
    u.pos = dest
    if (sp.move.kind === 'blink') {
      events.push({ t, kind: 'blink', id: u.id,
        fromX: +from.x.toFixed(2), fromY: +from.y.toFixed(2),
        toX: +dest.x.toFixed(2), toY: +dest.y.toFixed(2) })
    }
  }

  /**
   * Effects that land on the CASTER or its own side the instant it commits —
   * fading from notice, hauling an ally clear, dropping a zone.
   */
  function applySelfEffects(u: FieldUnit, target: FieldUnit, mv: Move, t: number) {
    const sp = spatialOf(mv.name)
    if (!sp) return
    if (sp.fade) u.fadedUntil = t + sp.fade.duration
    if (sp.zone) {
      const c = sp.zone.centre === 'target' ? target.pos : u.pos
      zones.push({ x: c.x, y: c.y, r: sp.zone.radius, until: t + sp.zone.duration,
        effect: sp.zone.effect, power: sp.zone.power, side: u.side })
    }
    if (sp.haulAlly) {
      // Pull the ally in the worst trouble — lowest HP fraction — to the caster.
      const mates = units.filter((x) => x.side === u.side && !x.dead && x.id !== u.id)
      const worst = mates.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      if (worst && dist(worst.pos, u.pos) > 2) {
        const dir = norm(sub(u.pos, worst.pos))
        const step = Math.min(sp.haulAlly, dist(worst.pos, u.pos) - 1.6)
        const dest = clampToField({ x: worst.pos.x + dir.x * step, y: worst.pos.y + dir.y * step })
        if (!obstacles.some((o) => insideObstacle(dest, o, worst.radius * 0.6))) {
          worst.pos = dest
          events.push({ t, kind: 'shove', id: worst.id, by: u.id, kind2: 'pull' })
        }
      }
    }
  }

  /** Forced movement and movement denial, landed on the target. */
  function applyOnTarget(u: FieldUnit, target: FieldUnit, sp: MoveSpatial, t: number) {
    if (sp.pull || sp.push) {
      const away = norm(sub(target.pos, u.pos))
      const shift = (sp.push ?? 0) - (sp.pull ?? 0)
      const dest = clampToField({ x: target.pos.x + away.x * shift, y: target.pos.y + away.y * shift })
      if (!obstacles.some((o) => insideObstacle(dest, o, target.radius * 0.6))) {
        target.pos = dest
        events.push({ t, kind: 'shove', id: target.id, by: u.id, kind2: sp.push ? 'push' : 'pull' })
      }
    }
    if (sp.root) target.rootedFor = Math.max(target.rootedFor, sp.root)
    if (sp.slow) {
      target.slowMult = Math.min(target.slowMult, sp.slow.mult)
      target.slowFor = Math.max(target.slowFor, sp.slow.duration)
    }
  }

  function stepToward(u: FieldUnit, goal: Vec2, mates: FieldUnit[], obs: Obstacle[]) {
    let dir = norm(sub(goal, u.pos))
    // Separation: don't pile into the same square metre as an ally. The
    // SPACING order widens (spread, vs AoE) or tightens (focus-fire) this.
    const personal = spacingRadius(u)
    for (const a of mates) {
      if (a.dead || a.id === u.id) continue
      const d = dist(u.pos, a.pos)
      if (d < personal && d > 1e-6) {
        const push = norm(sub(u.pos, a.pos))
        dir = { x: dir.x + push.x * 0.9, y: dir.y + push.y * 0.9 }
      }
    }
    dir = norm(dir)
    const step = u.speed * u.slowMult * statusSpeedMult(u) * DT
    const tryMove = (nx: number, ny: number) => {
      const p = { x: nx, y: ny }
      if (obs.some((o) => insideObstacle(p, o, u.radius * 0.6))) return false
      u.pos = p
      return true
    }
    const nx = Math.min(FIELD_W - 0.5, Math.max(0.5, u.pos.x + dir.x * step))
    const ny = Math.min(FIELD_H - 0.5, Math.max(0.5, u.pos.y + dir.y * step))
    // Try the full step, then slide along each axis so units round cover
    // instead of sticking to it.
    if (!tryMove(nx, ny) && !tryMove(nx, u.pos.y) && !tryMove(u.pos.x, ny)) {
      // fully blocked — nudge perpendicular so it never deadlocks
      tryMove(u.pos.x + dir.y * step, u.pos.y - dir.x * step)
    }
    u.vel = { x: dir.x * step, y: dir.y * step }
  }

  /**
   * HARD NON-OVERLAP. After every unit has moved, push apart any pair closer
   * than the sum of their radii, half the overlap each, a few iterations for
   * stability. No two living monsters may share space — they end up adjacent,
   * and several attackers converging on one target settle around it (surround)
   * rather than stacking on top of it.
   *
   * ⚠️ Deterministic: fixed unit order, no rng. The exact-overlap case (two units
   * on the same point) is separated along a FIXED axis derived from id order, so
   * a replay reproduces. A push that would land inside an obstacle is skipped for
   * that unit — the next iteration resolves it from the other side.
   */
  function resolveCollisions() {
    const live = units.filter((u) => !u.dead)
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j]
          // ⚠️ COLLISION RADIUS < VISUAL RADIUS. A monster's `radius` (0.9) is its
          // steering/footprint size, but the sum of two full radii (1.8) exceeds
          // the basic MELEE reach (CHANNEL_RANGE.melee × 0.8 = 1.28) — so if
          // collision kept them 1.8 apart, melee attackers could NEVER close to
          // hit and every melee fight would stall. Non-overlap uses a smaller
          // physical radius so units settle just inside melee reach: adjacent,
          // touching, never stacked, and still able to swing. Must stay below
          // half the basic melee reach.
          const min = (a.radius + b.radius) * COLLISION_R_FRAC
          let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y
          let d = Math.hypot(dx, dy)
          if (d >= min) continue
          if (d < 1e-6) { dx = 1; dy = 0; d = 1 } // exact overlap → fixed axis
          const push = (min - d) / 2
          const nx = dx / d, ny = dy / d
          const aDest = clampToField({ x: a.pos.x - nx * push, y: a.pos.y - ny * push })
          const bDest = clampToField({ x: b.pos.x + nx * push, y: b.pos.y + ny * push })
          if (!obstacles.some((o) => insideObstacle(aDest, o, a.radius * 0.6))) a.pos = aDest
          if (!obstacles.some((o) => insideObstacle(bDest, o, b.radius * 0.6))) b.pos = bDest
        }
      }
    }
  }
}
