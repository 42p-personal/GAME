// Shared game state + the Town hub economy (§13). One gold wallet and one stable
// span all areas; the Ranch (src/game.ts) raises the active monster week by week.
import {
  ClassRole, Food, INNATE_SECONDARY_LEVEL, LEAGUES, Monster, Sex, Species, Stat, STATS, Stats, classForStats, hashString,
  mulberry32, roleOfClass,
} from './core'
import { generateMonster, maxHp, maxMana } from './monster'
import { BattleResult, simulateTeamBattle } from './battle'
import {
  Career, START_GOLD, WEEKS_PER_MONTH, WEEKS_PER_YEAR, WeeklyAction, ageOneWeek, applyWeek, buyFood,
  careerMonster, newCareer, rankUp, rollMarket, trainingProfileFor,
} from './game'
import { ALL_DRILLS } from './drills'
import { learnedMoves } from './monster'

export type Area = 'town' | 'ranch'

// Licensing costs for exclusive monster types
export const SPECIAL_LICENSE_COST = 800 // Silver rank: Draconic + Abyssal
export const ELITE_LICENSE_COST = 2000 // Masters rank: Mythical

export interface Tournament {
  id: string
  name: string
  month: number // 1-12
  week: number // 1-4 — the specific week within the month it's held
  league: string // Wood, Copper, Tin, etc.
  rewards: { gold: number; exp: number }
}

// Calendar (§3): the below-Silver circuit is drawn fresh each game year from the
// seed — every league is GUARANTEED at least one event per quarter, sometimes
// two, in unpredictable months (never a fixed monthly slot). Repeating these is
// the game's financial backbone; scarcity makes the calendar worth planning
// around. Silver+ are fixed one-per-year prestige events. A monster may also
// enter BELOW its league at reduced rewards (§rewardMultiplier).
const CIRCUIT_REWARDS: Record<string, { gold: number; exp: number }> = {
  Wood: { gold: 100, exp: 50 },
  Copper: { gold: 150, exp: 75 },
  Tin: { gold: 200, exp: 100 },
  Bronze: { gold: 250, exp: 125 },
  Iron: { gold: 300, exp: 150 },
}

// Event names (user spec 2026-07-20): never named after a month, unique within
// a league's year, and the tone climbs the ladder — Wood sounds like a village
// scrap ("The Sprout Cup"), Iron already sounds like a real championship.
const CIRCUIT_EVENT_NAMES: Record<string, string[]> = {
  Wood: ['The Sprout Cup', 'Twig Tussle', 'The Mulch Pit', 'Acorn Scramble', 'Sawdust Scuffle', 'The Woodshed Brawl', 'Kindling Clash', 'Stump Jamboree', 'The Knothole Open', 'Bramble Bash', 'Sapling Skirmish', 'The Splinter Scrap'],
  Copper: ['The Copper Pots', 'Kettle Cup', 'The Penny Purse', 'Scullery Scrap', 'The Green Kettle', 'Patina Punch-Up', 'Tinker Town Trophy', 'The Verdigris Vase'],
  Tin: ['Tin Daggers', 'The Tin Whistle', 'Foil Fracas', 'Canteen Clash', "The Tinsmith's Trophy", 'Pewter Mug Melee', 'Rattlecan Rumble', 'The Solder Circuit'],
  Bronze: ['The Bronze Bell', 'Statuary Showdown', "Gladiator's Gong", 'The Laurel Bout', 'Medalist Melee', "The Founder's Cast", 'Old Verdant Trophy', 'The Standard-Bearer'],
  Iron: ['The Anvil Championship', 'Hammerfall Cup', 'The Forge Trials', 'Ironclad Open', "The Smelter's Stand", 'Blackfurnace Bout', 'The Iron Gauntlet', 'Quenchfire Classic'],
}

const PRESTIGE_EVENTS: Omit<Tournament, 'id'>[] = [
  { name: 'The Silver Crescent', month: 6, week: 2, league: 'Silver', rewards: { gold: 350, exp: 175 } },
  { name: 'The Gilded Crown', month: 7, week: 2, league: 'Gold', rewards: { gold: 400, exp: 200 } },
  { name: 'The Radiant Throne', month: 8, week: 2, league: 'Platinum', rewards: { gold: 450, exp: 225 } },
  { name: "The Grandmasters' Summit", month: 9, week: 2, league: 'Masters', rewards: { gold: 500, exp: 250 } },
  { name: 'The Apex Invitational', month: 10, week: 2, league: 'Tamer Elite', rewards: { gold: 600, exp: 300 } },
]

// Cup lore (user spec 2026-07-22): a pre-cup preamble (prize money + a line of
// setting/lore tied to the cup's name) and a post-cup closing flavour line.
// Hybrid sourcing — hand-authored for the fixed annual prestige events (seen
// once a year, worth the writing), templated from a per-league flavour table
// for the circuit cups (Wood-Iron regenerate a new name every game-year, seen
// far more often, not worth authoring individually).
export interface CupLore { intro: string; outroFlavour: string }

const PRESTIGE_LORE: Record<string, CupLore> = {
  'The Silver Crescent': {
    intro: 'An invitational older than the town itself, held under a banner of hammered silver shaped like a waning moon. Legend says the first Crescent was fought to settle a dispute between two tamers who refused to just talk it out.',
    outroFlavour: 'The crescent banner is lowered for another year, its silver a little more tarnished, its legend a little longer.',
  },
  'The Gilded Crown': {
    intro: "The season's marquee event — every League office in the region sends a scout, and the winner's monster gets its likeness cast onto next year's entry medallion.",
    outroFlavour: 'Gold dust settles over the arena floor as the crown is presented — already, whispers of next year\'s favourites begin.',
  },
  'The Radiant Throne': {
    intro: 'A single ornate throne sits at the centre of the arena, empty until the final bout — only the realm\'s best ever get to stand beside it, let alone claim it.',
    outroFlavour: 'The throne is claimed for another year. The rest of the field files out past it, already plotting their return.',
  },
  "The Grandmasters' Summit": {
    intro: "Where every League's reigning champions finally meet on equal ground — no punching down, no easy brackets, just the best against the best.",
    outroFlavour: 'The Summit disperses, its champions scattering back to their home leagues to defend what they nearly lost here.',
  },
  'The Apex Invitational': {
    intro: 'There is nothing above this. The Apex answers only one question: of everyone who has ever climbed this far, who climbs highest.',
    outroFlavour: 'The Apex falls silent. For one team, there is nowhere left to climb — for everyone else, the climb starts again.',
  },
}

const CIRCUIT_LORE_FLAVOUR: Record<string, { setting: string; closer: string }> = {
  Wood: { setting: 'a muddy paddock behind the tannery, more scrap than sport', closer: 'The paddock empties out, mud-caked and already half-forgotten — until next quarter.' },
  Copper: { setting: 'the market square, pots and pans still rattling loose from last year\'s brawl', closer: 'Stallholders sweep up the mess and reopen for business by morning.' },
  Tin: { setting: 'a proper ring at last — canvas ropes, and a crowd that actually paid to get in', closer: 'The ropes come down for storage, already a little worse for wear.' },
  Bronze: { setting: "a real arena, cast in the town's own bronze bell-metal", closer: 'The bell-metal seats empty slowly, the bronze still warm from the crowd.' },
  Iron: { setting: "the forge-district's own championship, judged by smiths who don't impress easily", closer: 'The forge fires bank low for the night — the smiths, for once, look impressed.' },
}

// A tournament's pre-cup preamble + post-cup closing flavour.
export function cupLore(t: Tournament): CupLore {
  const authored = PRESTIGE_LORE[t.name]
  if (authored) return authored
  const f = CIRCUIT_LORE_FLAVOUR[t.league] ?? CIRCUIT_LORE_FLAVOUR.Wood
  return {
    intro: `${t.name} — ${f.setting}. On the line: ${t.rewards.gold}g and bragging rights across the ${t.league} circuit.`,
    outroFlavour: f.closer,
  }
}

// Team size per league (user spec 2026-07-21): Wood/Copper stay 1v1; Tin steps
// to 2v2, Bronze to 3v3, Silver to 4v4, Platinum to 5v5, Masters to 6v6 —
// leagues not named hold the previous named size (Iron holds Bronze's 3, since
// Iron sits between Bronze and Silver's step-up; Gold holds Silver's 4; Tamer
// Elite holds Masters' 6).
export const TEAM_SIZE_BY_LEAGUE: Record<string, number> = {
  Wood: 1, Copper: 1, Tin: 2, Bronze: 3, Iron: 3, Silver: 4, Gold: 4, Platinum: 5, Masters: 6, 'Tamer Elite': 6,
}
export const teamSizeForLeague = (league: string): number => TEAM_SIZE_BY_LEAGUE[league] ?? 1

// Non-player team count per event (user's own words: "always ≥3, sometimes
// 4/5" — exact boundaries weren't specified, this is a single tunable table).
export const RIVAL_TEAM_COUNT_BY_LEAGUE: Record<string, number> = {
  Wood: 3, Copper: 3, Tin: 3, Bronze: 3, Iron: 3, Silver: 4, Gold: 4, Platinum: 5, Masters: 5, 'Tamer Elite': 5,
}
export const rivalTeamCountForLeague = (league: string): number => RIVAL_TEAM_COUNT_BY_LEAGUE[league] ?? 3

// Round-robin reward scales by the player's FINAL PLACEMENT (replaces the old
// strict win/lose-only gate) — 4th place or worse earns nothing.
export const PLACEMENT_REWARD_FRACTION: Record<number, number> = { 1: 1, 2: 0.65, 3: 0.4 }
export const placementRewardFraction = (placement: number): number => PLACEMENT_REWARD_FRACTION[placement] ?? 0
export const placementLabel = (placement: number): string => {
  if (placement === 1) return '1st'
  if (placement === 2) return '2nd'
  if (placement === 3) return '3rd'
  return `${placement}th`
}

export const yearOfWeek = (week: number) => Math.floor(week / WEEKS_PER_YEAR)

// Draw the year's tournament calendar. Deterministic per (seed, year): each
// circuit league gets 1 event per quarter, ~40% of quarters get a second one,
// each landing on a specific (unpredictable) week within its month.
export function tournamentCalendarFor(seed: string, year: number): Tournament[] {
  const out: Tournament[] = []
  for (const league of Object.keys(CIRCUIT_REWARDS)) {
    const rng = mulberry32(hashString(seed + ':calendar:' + year + ':' + league))
    const names = [...CIRCUIT_EVENT_NAMES[league]]
    const takeName = () => names.length ? names.splice(Math.floor(rng() * names.length), 1)[0] : `${league} Open`
    for (let q = 0; q < 4; q++) {
      const months = [q * 3 + 1, q * 3 + 2, q * 3 + 3]
      const count = rng() < 0.4 ? 2 : 1
      for (let i = 0; i < count; i++) {
        const month = months.splice(Math.floor(rng() * months.length), 1)[0]
        // Trial months (4/8/12) reserve Week 4 for the rank-up trials — circuit
        // events there land Weeks 1-3 only, so no event count is ever lost.
        const weekChoices = RANK_UP_MONTHS.includes(month) ? WEEKS_PER_MONTH - 1 : WEEKS_PER_MONTH
        const week = 1 + Math.floor(rng() * weekChoices)
        out.push({
          id: `${league.toLowerCase()}-y${year}-m${month}`,
          name: takeName(), month, week, league,
          rewards: CIRCUIT_REWARDS[league],
        })
      }
    }
  }
  for (const p of PRESTIGE_EVENTS) out.push({ ...p, id: `${p.league.toLowerCase().replace(' ', '-')}-y${year}-m${p.month}` })
  return out.sort((a, b) => a.month - b.month || a.week - b.week || leagueIndexOf(a.league) - leagueIndexOf(b.league))
}

export const leagueIndexOf = (league: string): number => LEAGUES.findIndex((l) => l.name === league)

// Rank-up trials are scheduled calendar EVENTS (user spec 2026-07-19): held in
// Week 4 of months 4, 8 and 12, for every league at once. Promotion is only
// possible during one of these weeks — the Ranch rank-up button unlocks then.
export const RANK_UP_MONTHS = [4, 8, 12]
export const RANK_UP_WEEK = 4
export const isRankUpWeek = (week: number) =>
  RANK_UP_MONTHS.includes(monthOfWeek(week)) && weekOfMonth(week) === RANK_UP_WEEK

// Competing below your league pays less: same league 100%, one league above the
// event 50%, two or more above 20%. (You can never enter above your license.)
export function rewardMultiplier(monsterLeagueIndex: number, tournamentLeague: string): number {
  const d = monsterLeagueIndex - leagueIndexOf(tournamentLeague)
  if (d <= 0) return 1
  if (d === 1) return 0.5
  return 0.2
}

// A banked genome: enough of a monster to restore it (thaw) or fuse it later.
export interface Frozen {
  id: string
  name: string
  species: Species
  sex: Sex
  stats: Stats
  favouriteFood: Food
  hatedFood: Food
  licenseIndex: number
}

// One Market listing: a deterministic seed (so the preview == what you buy) + price.
export interface MarketOffer {
  seed: string
  price: number
}

// Tournament entry fee (user-approved economy sink 2026-07-21): paid at
// sign-up, refunded on cancel, kept once the event resolves. Scales by league
// so punching down for easy gold has a real cost-benefit.
export const entryFee = (league: string): number => (leagueIndexOf(league) + 1) * 10

// A tournament entry locked in for this week; resolved during advanceWeek.
// `monsterIds` length must equal teamSizeForLeague(tournament's league).
// `feePaid` is refunded by cancelSignUp.
export interface PendingTournament { tournamentId: string; monsterIds: string[]; feePaid: number }

// One resolved match within a round-robin event (§2e resolveTournament).
export interface EventMatch {
  aLabel: string
  bLabel: string
  teamA: Monster[]
  teamB: Monster[]
  result: BattleResult
  involvesPlayer: boolean
}

// One participant's final standing in a round-robin event.
export interface EventStanding {
  label: string
  isPlayer: boolean
  wins: number
  draws: number
  losses: number
  hpFracSum: number // tie-break metric: summed average remaining HP fraction across a team's own matches
  placement: number // 1-based, after sort
}

// The most recent tournament EVENT, kept for the battle screen. A full
// round-robin among every participant (the player's team + every rival team).
export interface LastBattle {
  tournamentId: string
  tournamentName: string
  league: string
  teamSize: number
  matches: EventMatch[] // full round robin, in resolution order
  standings: EventStanding[] // sorted by placement ascending
  playerPlacement: number
  fieldSize: number // rivalTeamCount + 1
  goldReward: number
  expNote: string
}

export interface GameState {
  seed: string
  trainerName: string
  tutorialEnabled: boolean
  tutorialDismissed: boolean // player closed the welcome-tips banner
  gold: number
  week: number // the global calendar — one clock for market, tournaments, and stable
  stable: Career[]
  activeId: string
  frozen: Frozen[]
  barnCapacity: number
  bulkFood: boolean // Ranch Shop upgrade: 20% off food
  specialLicense: boolean // Silver rank: unlock Draconic + Abyssal
  eliteLicense: boolean // Masters rank: unlock Mythical
  area: Area
  market: MarketOffer[] // monster market; restocks at the start of each month
  foodMarket: Record<Food, number> // this week's town food prices (shared by all monsters)
  nextId: number // monotonic id counter, survives save/load
  pendingTournament: PendingTournament | null
  lastBattle: LastBattle | null
  enteredThisMonth: string[] // tournament ids already competed in this month (one entry per event)
  // This week's per-monster plans (activity + food). Lives in GameState (not
  // component state) so plans survive navigating away and reloading; the
  // weekly tick consumes them and carries each ACTIVITY into the new week
  // (food resets — it's bought fresh weekly).
  weekPlans: Record<string, WeekPlanEntry>
  // Digest of what the last weekly tick did (per-monster deltas + tournament
  // result), shown once on the next feeding screen so results aren't buried
  // in per-monster logs.
  lastWeek: string[]
}

// Calendar helpers off the global week clock.
export const monthOfWeek = (week: number) => Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_MONTH) + 1
export const weekOfMonth = (week: number) => (week % WEEKS_PER_MONTH) + 1

// League visibility (user spec 2026-07-19): the calendar shows Wood→Silver
// until Silver is COMPLETED (a monster promoted past it), then up to Masters;
// Tamer Elite appears only once a monster has REACHED Masters. Progress counts
// the stable AND frozen genomes, so retiring/freezing a champion never hides
// leagues the player has already earned sight of.
export function visibleLeagueCount(g: GameState): number {
  const silverIdx = leagueIndexOf('Silver')
  const mastersIdx = leagueIndexOf('Masters')
  const maxIdx = Math.max(0, ...g.stable.map((c) => c.licenseIndex), ...g.frozen.map((f) => f.licenseIndex))
  if (maxIdx >= mastersIdx) return LEAGUES.length
  if (maxIdx > silverIdx) return mastersIdx + 1
  return silverIdx + 1
}

// --- Economy constants (§13.3) ---
export const RENTAL_PER_FROZEN = 8 // weekly upkeep per frozen genome
export const MARKET_BASE = 150 // base monster price; fluctuates ±60%
export const FUSION_COST = 500 // huge, one-off
export const BULK_FOOD_COST = 200 // one-off Ranch Shop upgrade
export const FUSION_PENALTY = 0.9 // average of parents − 10% (§10.2)
export const START_BARN = 2

export function newGame(seed = 'start', opts?: { trainerName?: string; tutorialEnabled?: boolean }): GameState {
  return {
    seed,
    trainerName: opts?.trainerName?.trim() || 'Tamer',
    tutorialEnabled: opts?.tutorialEnabled ?? true,
    tutorialDismissed: false,
    gold: START_GOLD,
    week: 0,
    stable: [],
    activeId: '',
    frozen: [],
    barnCapacity: START_BARN,
    bulkFood: false,
    specialLicense: false,
    eliteLicense: false,
    area: 'town',
    market: rollMarketOffers(seed, 0, false, false),
    foodMarket: rollMarket(seed, 0),
    nextId: 0,
    pendingTournament: null,
    lastBattle: null,
    enteredThisMonth: [],
    weekPlans: {},
    lastWeek: [],
  }
}

// --- Market (§13.1) — 3 equal-weighted base monsters; price band wider than food. ---
export function rollMarketOffers(seed: string, roll: number, hasSpecialLicense = false, hasEliteLicense = false): MarketOffer[] {
  const offers: MarketOffer[] = []
  let attemptIndex = 0
  const maxAttempts = 100 // prevent infinite loops

  while (offers.length < 3 && attemptIndex < maxAttempts) {
    const s = 'mkt-' + hashString(seed + ':' + roll + ':' + attemptIndex).toString(36)
    const monster = generateMonster(s)
    const bodyType = monster.species.body

    // Filter out exclusive creatures if player doesn't have licenses
    const isExclusive = ['Draconic', 'Abyssal'].includes(bodyType)
    const isMythical = bodyType === 'Mythical'

    if (isExclusive && !hasSpecialLicense) {
      attemptIndex++
      continue
    }
    if (isMythical && !hasEliteLicense) {
      attemptIndex++
      continue
    }

    const rng = mulberry32(hashString(seed + ':town:' + roll + ':' + attemptIndex))
    const price = Math.max(1, Math.round(MARKET_BASE * (0.4 + rng() * 1.2))) // ±60%
    offers.push({ seed: s, price })
    attemptIndex++
  }

  return offers
}

export const offerMonster = (o: MarketOffer) => generateMonster(o.seed, { train: 0 })

export function buyMonster(g: GameState, index: number): GameState {
  const o = g.market[index]
  if (!o || g.gold < o.price || g.stable.length >= g.barnCapacity) return g

  const monster = generateMonster(o.seed, { train: 0 })
  const bodyType = monster.species.body

  // Check licensing requirements for exclusive creatures
  const isExclusive = ['Draconic', 'Abyssal'].includes(bodyType)
  const isMythical = bodyType === 'Mythical'

  if (isExclusive && !g.specialLicense) return g
  if (isMythical && !g.eliteLicense) return g

  const c = newCareer(o.seed, { id: 'own-' + g.nextId + '-' + o.seed })
  const market = g.market.filter((_, i) => i !== index)
  return { ...g, gold: g.gold - o.price, stable: [...g.stable, c], market, activeId: g.activeId || c.id, nextId: g.nextId + 1 }
}

export function goto(g: GameState, area: Area): GameState {
  return { ...g, area }
}

// --- The weekly tick (§2): one canonical path that advances the whole game ---
// Per monster: feed first (start-of-week choice, at this week's prices), then the
// chosen activity. Monsters with no plan (or retired) still age. Lab rental is
// charged once. The global clock advances; food prices reroll weekly and the
// monster market restocks at the start of each month.
export interface WeekPlanEntry { activity: string; food: Food | '' } // activity: drill id | 'rest' | 'excursion'

export function advanceWeek(g: GameState, plansOverride?: Record<string, WeekPlanEntry>): GameState {
  const plans = plansOverride ?? g.weekPlans ?? {}
  let gold = g.gold
  let rentalDue = g.frozen.length * RENTAL_PER_FROZEN
  const stable = g.stable.map((c) => {
    if (c.retired) return ageOneWeek(c)
    // A monster with NO plan rests by default — this is what the UI has always
    // promised ("This week's plan — Rest" preview); previously the engine
    // silently did nothing (age only, no stamina/HP/MP recovery).
    const plan = plans[c.id] ?? { activity: 'rest', food: '' as const }
    let cur = c
    if (plan.food) {
      const fed = buyFood(cur, gold, plan.food, g.foodMarket, g.bulkFood ? 0.8 : 1)
      cur = fed.c
      gold = fed.gold
    }
    const action: WeeklyAction =
      plan.activity === 'rest' ? { kind: 'rest' }
        : plan.activity === 'excursion' ? { kind: 'excursion' }
          : { kind: 'train', drillId: plan.activity }
    const r = applyWeek(cur, action, gold, rentalDue)
    rentalDue = 0 // charged once per week, not per monster
    gold = r.gold
    return r.c
  })
  if (rentalDue > 0) gold -= rentalDue // no monster processed the charge (all retired)

  // Tournament battle (if signed up) fights with this week's training applied.
  const { gold: goldAfterBattle, lastBattle } = resolveTournament(g, stable, gold)
  gold = goldAfterBattle
  const entered = lastBattle && g.pendingTournament
    ? [...(g.enteredThisMonth ?? []), g.pendingTournament.tournamentId]
    : (g.enteredThisMonth ?? [])

  // "Last week" digest: per-monster deltas + activity + tournament result,
  // surfaced once on the next feeding screen (results otherwise live only in
  // per-monster logs).
  const lastWeek: string[] = []
  for (let i = 0; i < g.stable.length; i++) {
    const before = g.stable[i]
    const after = stable[i]
    if (before.retired) continue
    const plan = plans[before.id]
    const drill = plan ? ALL_DRILLS.find((d) => d.id === plan.activity) : undefined
    const actName = !plan ? 'rested (no plan set)'
      : plan.activity === 'rest' ? 'rested'
        : plan.activity === 'excursion' ? 'excursion'
          : drill?.name ?? plan.activity
    const bits: string[] = []
    for (const k of STATS) {
      const d = after.stats[k] - before.stats[k]
      if (d !== 0) bits.push(`${k} ${d > 0 ? '+' : ''}${d}`)
    }
    const hpD = after.hp - before.hp
    const mpD = after.mp - before.mp
    const stD = after.stamina - before.stamina
    if (hpD !== 0) bits.push(`HP ${hpD > 0 ? '+' : ''}${hpD}`)
    if (mpD !== 0) bits.push(`MP ${mpD > 0 ? '+' : ''}${mpD}`)
    if (stD !== 0) bits.push(`stamina ${stD > 0 ? '+' : ''}${stD}`)
    lastWeek.push(`${before.name} — ${actName}${bits.length ? ': ' + bits.join(', ') : ''}`)
    if (after.retired && !before.retired) lastWeek.push(`🏁 ${before.name} has retired.`)
  }
  if (lastBattle) {
    lastWeek.push(`🏟 ${lastBattle.tournamentName}: finished ${placementLabel(lastBattle.playerPlacement)} of ${lastBattle.fieldSize}`
      + (lastBattle.goldReward > 0 ? ` — +${lastBattle.goldReward}g` : ' — no reward'))
  }

  const week = g.week + 1
  const monthTurned = week % WEEKS_PER_MONTH === 0
  return {
    ...g,
    stable,
    gold,
    week,
    foodMarket: rollMarket(g.seed, week),
    market: monthTurned
      ? rollMarketOffers(g.seed, week / WEEKS_PER_MONTH, g.specialLicense, g.eliteLicense)
      : g.market,
    pendingTournament: null,
    lastBattle,
    enteredThisMonth: monthTurned ? [] : entered,
    // carry each monster's planned ACTIVITY into the new week; food resets
    weekPlans: Object.fromEntries(Object.entries(plans).map(([id, p]) => [id, { activity: p.activity, food: '' as const }])),
    lastWeek,
  }
}

export function promoteMonster(g: GameState, id: string): GameState {
  if (!isRankUpWeek(g.week)) return g // trials only run on scheduled trial weeks
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  const { c: nc, gold } = rankUp(c, g.gold)
  return { ...g, gold, stable: g.stable.map((x) => (x.id === id ? nc : x)) }
}

export function renameMonster(g: GameState, id: string, name: string): GameState {
  const trimmed = name.trim().slice(0, 24)
  if (!trimmed) return g
  return { ...g, stable: g.stable.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) }
}

// Ability Selection UI (§1b): free any time EXCEPT the week a monster is
// signed up for a tournament (can't reroll abilities mid-entry). `moveIds`
// must all be moves the monster has actually learned; an empty array resets
// to auto-pick (careerMonster falls back to chooseLoadout).
export function setLoadout(g: GameState, id: string, moveIds: string[]): GameState {
  if (g.pendingTournament?.monsterIds.includes(id)) return g
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  const learnedIds = new Set(learnedMoves(c.stats).map((mv) => mv.id))
  const valid = moveIds.filter((mid) => learnedIds.has(mid)).slice(0, 3)
  return { ...g, stable: g.stable.map((x) => (x.id === id ? { ...x, loadout: valid } : x)) }
}

// Innate choice is swapped the same way loadout moves are (user spec
// 2026-07-25): free any time except mid tournament-entry; the 2nd choice can
// only be selected once actually unlocked (INNATE_SECONDARY_LEVEL in a stat).
export function setActiveInnate(g: GameState, id: string, index: number): GameState {
  if (g.pendingTournament?.monsterIds.includes(id)) return g
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  if (index !== 0 && index !== 1) return g
  if (index === 1 && Math.max(...STATS.map((s) => c.stats[s])) < INNATE_SECONDARY_LEVEL) return g
  return { ...g, stable: g.stable.map((x) => (x.id === id ? { ...x, activeInnate: index } : x)) }
}

// --- Tournaments (§3): sign up in the review phase, battle resolves on the weekly tick ---
// A monster may enter its own league's events (full rewards) or any league BELOW
// it (reduced rewards via rewardMultiplier) — never above its license.
export function eligibleForTournament(g: GameState, t: Tournament): Career[] {
  const tIdx = leagueIndexOf(t.league)
  return g.stable.filter((c) => !c.retired && c.licenseIndex >= tIdx)
}

export function signUp(g: GameState, tournamentId: string, monsterIds: string[]): GameState {
  const t = tournamentCalendarFor(g.seed, yearOfWeek(g.week)).find((x) => x.id === tournamentId)
  if (!t || monthOfWeek(g.week) !== t.month || weekOfMonth(g.week) !== t.week) return g
  if ((g.enteredThisMonth ?? []).includes(tournamentId)) return g // one entry per event
  const needed = teamSizeForLeague(t.league)
  if (monsterIds.length !== needed) return g
  if (new Set(monsterIds).size !== monsterIds.length) return g // no duplicate roster slots
  const tIdx = leagueIndexOf(t.league)
  const ok = monsterIds.every((id) => {
    const c = g.stable.find((x) => x.id === id)
    return !!c && !c.retired && c.licenseIndex >= tIdx
  })
  if (!ok) return g
  const fee = entryFee(t.league)
  if (g.gold < fee) return g
  return { ...g, gold: g.gold - fee, pendingTournament: { tournamentId, monsterIds, feePaid: fee } }
}

// Cancelling before the weekly tick refunds the entry fee in full.
export const cancelSignUp = (g: GameState): GameState =>
  ({ ...g, gold: g.gold + (g.pendingTournament?.feePaid ?? 0), pendingTournament: null })

// League strength band (user spec 2026-07-21: "a wood cup should always stay
// capped to its league limit" — the league is a FIXED standard, independent of
// the player): every rival team rolls its strength somewhere in 60-100% of the
// league's budget (cap × 3.5), from the event seed. A fresh entrant faces the
// weak end of genuine league competition and grows into (then out of) the cup;
// the same cup is always the same strength, which is also what makes scouting
// and placements meaningful. Replaces the old min(playerTotal, budget)
// rubber-banding.
export const RIVAL_BAND_MIN = 0.6
export const RIVAL_BAND_MAX = 1.0

// Rival team composition (user spec 2026-07-21): "a mixture of support and
// damage dealing classes, with more damage dealing classes in the case of an
// odd number" — even sizes split 50/50, odd sizes lean damage.
export function compositionTemplate(teamSize: number): ClassRole[] {
  const damage = Math.ceil(teamSize / 2)
  return Array.from({ length: teamSize }, (_, i): ClassRole => (i < damage ? 'damage' : 'support'))
}

// A rival monster appropriate to a target stat total AND a battle role: scaled
// via generateMonster's train-points system with a random 0.85-1.15x jitter,
// rejecting exclusive bodies (Draconic/Abyssal/Mythical) unless the tournament
// allows them (Silver+), and rejecting candidates whose TRAINED class doesn't
// match the requested role — so a "support" slot really does field a
// Tank/Sage/Bard/Orator/Spellshield, loadout and AI included.
const EXCLUSIVE_BODIES = ['Draconic', 'Abyssal', 'Mythical']
function generateRivalMonster(seedBase: string, targetTotal: number, allowExclusive: boolean, role?: ClassRole): Monster {
  let fallback: Monster | null = null
  for (let i = 0; i < 50; i++) {
    const seed = 'rival-' + hashString(seedBase + ':' + i).toString(36)
    const preview = generateMonster(seed, { train: 0 })
    if (!allowExclusive && EXCLUSIVE_BODIES.includes(preview.species.body)) continue
    const baseTotal = STATS.reduce((sum, k) => sum + preview.stats[k], 0)
    const rng = mulberry32(hashString(seed + ':scale'))
    const train = Math.max(0, Math.round((targetTotal - baseTotal) * (0.85 + rng() * 0.3)))
    const candidate = generateMonster(seed, { train })
    fallback = fallback ?? candidate
    if (role && roleOfClass(classForStats(candidate.stats)) !== role) continue
    return candidate
  }
  // 50 tries without a role match — take the first legal candidate rather than none.
  return fallback ?? generateMonster('rival-fallback-' + seedBase, { train: 0 })
}

// A full rival TEAM: role slots from the composition template, each member
// independently scaled to the same per-monster budget.
function generateRivalTeam(seedBase: string, teamSize: number, targetTotal: number, allowExclusive: boolean): Monster[] {
  return compositionTemplate(teamSize).map((role, i) => generateRivalMonster(seedBase + ':m' + i, targetTotal, allowExclusive, role))
}

// Every rival team a tournament will field, purely a function of (seed, week,
// tournament id) — deterministic and side-effect-free, so it can be called
// ahead of resolution (scouting reports, the bracket preview screen) and
// reproduce byte-identical teams to what resolveTournament actually fights.
export function generateRivalTeamsForTournament(g: GameState, t: Tournament): Monster[][] {
  const teamSize = teamSizeForLeague(t.league)
  const rivalCount = rivalTeamCountForLeague(t.league)
  const allowExclusive = leagueIndexOf(t.league) >= leagueIndexOf('Silver')
  const leagueBudget = LEAGUES[leagueIndexOf(t.league)].cap * 3.5
  return Array.from({ length: rivalCount }, (_, r) => {
    const bandRng = mulberry32(hashString(g.seed + ':' + g.week + ':' + t.id + ':band:r' + r))
    const teamBudget = leagueBudget * (RIVAL_BAND_MIN + bandRng() * (RIVAL_BAND_MAX - RIVAL_BAND_MIN))
    return generateRivalTeam(g.seed + ':' + g.week + ':' + t.id + ':r' + r, teamSize, teamBudget, allowExclusive)
  })
}

// Scouting fee (user spec 2026-07-22): pay to see an upcoming rival team
// before the fight — cheap reveals class + loadout, pricier also reveals raw
// stats. Both scale with league, same shape as entryFee.
export const scoutFee = (league: string, tier: 'basic' | 'full'): number =>
  (leagueIndexOf(league) + 1) * (tier === 'basic' ? 5 : 15)

// Standard circle-method round-robin schedule: every participant plays exactly
// once per scheduling round, so injuries accrue at the SAME rate for everyone
// (the old player-plays-all-matches-first ordering systematically fed the
// player's damaged team to fresh rivals). Returns ordered index pairs.
export function roundRobinSchedule(n: number): [number, number][] {
  const teams = [...Array(n).keys()]
  if (teams.length % 2 === 1) teams.push(-1) // bye slot for odd fields
  const rounds = teams.length - 1
  const half = teams.length / 2
  const out: [number, number][] = []
  let rest = teams.slice(1)
  for (let r = 0; r < rounds; r++) {
    const ring = [teams[0], ...rest]
    for (let i = 0; i < half; i++) {
      const a = ring[i]
      const b = ring[ring.length - 1 - i]
      if (a !== -1 && b !== -1) out.push([Math.min(a, b), Math.max(a, b)])
    }
    rest = [rest[rest.length - 1], ...rest.slice(0, rest.length - 1)]
  }
  return out
}

// Resolve a signed-up tournament using the post-week stable. Mutates `stable`
// in place (called from advanceWeek on its freshly-built array). A full
// round-robin: the player's team + `rivalTeamCountForLeague` generated rival
// teams, every pair fights exactly once (circle-method schedule). EVERY
// participant fights EVERY match at full HP/MP (user spec 2026-07-22: "we
// want a monster to heal to full health inbetween each fight, they do not
// carry injuries throughout the tournament") — no mid-event carry-forward.
// Rival strength is a FIXED league standard (60-100% of the league budget,
// rolled per team from the event seed) — independent of the player's own
// power. Reward scales by final placement. Injury is assessed ONCE, when the
// team returns home: a flat random 0-50% of max HP/MP regardless of how the
// event went — "only injured when they return to the ranch... must rest
// before they train again."
function resolveTournament(g: GameState, stable: Career[], gold: number): { gold: number; lastBattle: LastBattle | null } {
  const pending = g.pendingTournament
  if (!pending) return { gold, lastBattle: null }
  const t = tournamentCalendarFor(g.seed, yearOfWeek(g.week)).find((x) => x.id === pending.tournamentId)
  const idxs = pending.monsterIds.map((id) => stable.findIndex((x) => x.id === id))
  if (!t || idxs.some((i) => i < 0 || stable[i].retired)) return { gold, lastBattle: null }

  const teamSize = teamSizeForLeague(t.league)
  const playerCareers = idxs.map((i) => stable[i])

  // Tournament matches always start fresh, full HP/MP — home condition
  // (injuries, fatigue via stamina) only matters between tournaments, not
  // mid-event.
  const playerTeam: Monster[] = playerCareers.map((c) => {
    const m = careerMonster(c)
    return { ...m, hp: maxHp(m.stats), mp: maxMana(m.stats) }
  })
  const rivalTeams = generateRivalTeamsForTournament(g, t)

  interface Participant { label: string; isPlayer: boolean; team: Monster[]; happiness: number[] }
  const participants: Participant[] = [
    { label: 'Your Team', isPlayer: true, team: playerTeam, happiness: playerCareers.map((c) => c.happiness) },
    ...rivalTeams.map((team, r) => ({ label: `Rival Team ${r + 1}`, isPlayer: false, team, happiness: team.map(() => 5) })),
  ]

  const standings = participants.map((p) => ({ label: p.label, isPlayer: p.isPlayer, wins: 0, draws: 0, losses: 0, hpFracSum: 0 }))
  const matches: EventMatch[] = []

  for (const [i, j] of roundRobinSchedule(participants.length)) {
    const pa = participants[i], pb = participants[j]
    const teamA = pa.team, teamB = pb.team // fixed full-strength roster, same every match
    const result = simulateTeamBattle(teamA, teamB, pa.happiness, pb.happiness)
    matches.push({ aLabel: pa.label, bLabel: pb.label, teamA, teamB, result, involvesPlayer: pa.isPlayer || pb.isPlayer })

    const aHpFrac = result.finals.filter((f) => f.side === 'A').reduce((s, f) => s + f.hp / maxHp(teamA[f.slot].stats), 0) / teamSize
    const bHpFrac = result.finals.filter((f) => f.side === 'B').reduce((s, f) => s + f.hp / maxHp(teamB[f.slot].stats), 0) / teamSize
    standings[i].hpFracSum += aHpFrac
    standings[j].hpFracSum += bHpFrac
    if (result.winner === 'A') { standings[i].wins++; standings[j].losses++ }
    else if (result.winner === 'B') { standings[j].wins++; standings[i].losses++ }
    else { standings[i].draws++; standings[j].draws++ }
  }

  const sorted = [...standings].sort((a, b) => b.wins - a.wins || b.hpFracSum - a.hpFracSum)
  const withPlacement: EventStanding[] = sorted.map((s, i) => ({ ...s, placement: i + 1 }))
  const playerPlacement = withPlacement.find((s) => s.isPlayer)!.placement
  const fieldSize = participants.length

  // Punching-down reduction only applies if the WHOLE team is above the
  // tournament's league (team's minimum licenseIndex) — a mixed-league roster
  // is judged by its least-decorated member.
  const teamMinLicense = Math.min(...playerCareers.map((c) => c.licenseIndex))
  const leagueMult = rewardMultiplier(teamMinLicense, t.league)
  const placeFrac = placementRewardFraction(playerPlacement)
  const mult = placeFrac * leagueMult
  const goldPrize = Math.round(t.rewards.gold * mult)

  let expNote = ''
  const updatedCareers = playerCareers.map((c) => {
    const nc: Career = { ...c, stats: { ...c.stats }, log: [...c.log], tournamentHistory: [...c.tournamentHistory] }
    if (mult > 0) {
      const prof = trainingProfileFor(c.species)
      const pts = Math.max(1, Math.round((t.rewards.exp * mult) / 10))
      const cap = LEAGUES[c.licenseIndex].cap
      if (prof.major) {
        // 60/40 split between the individually-authored major and the
        // body-derived minor — a "vanilla" species (no authored major) puts
        // the full reward into its minor instead (see the else branch).
        const p1 = Math.ceil(pts * 0.6)
        const p2 = pts - p1
        nc.stats[prof.major] = Math.min(cap, nc.stats[prof.major] + p1)
        nc.stats[prof.minor] = Math.min(cap, nc.stats[prof.minor] + p2)
        expNote = p2 > 0 ? `${prof.major} +${p1} · ${prof.minor} +${p2}` : `${prof.major} +${p1}`
      } else {
        nc.stats[prof.minor] = Math.min(cap, nc.stats[prof.minor] + pts)
        expNote = `${prof.minor} +${pts}`
      }
    }
    // Injury is a flat post-event roll (user spec 2026-07-22), independent of
    // placement or how any individual match went: every monster comes home at
    // a random 0-50% of max HP/MP, needing rest before training again.
    const injRng = mulberry32(hashString(g.seed + ':' + g.week + ':' + t.id + ':injury:' + c.id))
    nc.hp = Math.max(1, Math.round(maxHp(nc.stats) * injRng() * 0.5))
    nc.mp = Math.round(maxMana(nc.stats) * injRng() * 0.5)
    nc.log.push(`  ↳ ${c.name} comes home from the tournament needing rest.`)
    nc.log.push(`🏟 ${t.name}: finished ${placementLabel(playerPlacement)} of ${fieldSize}` + (goldPrize > 0 ? ` — +${goldPrize}g` : ' — no reward'))
    nc.tournamentHistory.push({ name: t.name, league: t.league, week: g.week, placement: playerPlacement, fieldSize })
    return nc
  })
  updatedCareers.forEach((nc, k) => { stable[idxs[k]] = nc })

  return {
    gold: gold + goldPrize,
    lastBattle: {
      tournamentId: t.id, tournamentName: t.name, league: t.league, teamSize, matches, standings: withPlacement,
      playerPlacement, fieldSize, goldReward: goldPrize, expNote,
    },
  }
}

// --- Lab (§13.1): freeze / thaw / fuse ---
export function freeze(g: GameState, id: string): GameState {
  const c = g.stable.find((x) => x.id === id)
  if (!c) return g
  const fr: Frozen = {
    id: c.id, name: c.name, species: c.species, sex: c.sex,
    stats: { ...c.stats }, favouriteFood: c.favouriteFood, hatedFood: c.hatedFood,
    licenseIndex: c.licenseIndex,
  }
  const stable = g.stable.filter((x) => x.id !== id)
  const activeId = g.activeId === id ? stable[0]?.id ?? '' : g.activeId
  return { ...g, stable, frozen: [...g.frozen, fr], activeId }
}

export function thaw(g: GameState, fid: string): GameState {
  if (g.stable.length >= g.barnCapacity) return g
  const fr = g.frozen.find((x) => x.id === fid)
  if (!fr) return g
  const c = careerFromFrozen(fr, fr.id)
  return {
    ...g,
    stable: [...g.stable, c],
    frozen: g.frozen.filter((x) => x.id !== fid),
    activeId: g.activeId || c.id,
  }
}

export const fusionRoom = (g: GameState): boolean => g.stable.length < g.barnCapacity

export function fuse(g: GameState, aId: string, bId: string): GameState {
  if (aId === bId || g.gold < FUSION_COST || !fusionRoom(g)) return g
  const a = g.frozen.find((x) => x.id === aId)
  const b = g.frozen.find((x) => x.id === bId)
  if (!a || !b) return g
  // Baby potential = average of the two sources − a small penalty (§10.2). The full
  // genome/appearance-parts model is a later TODO; here we average current stats.
  const stats = {} as Stats
  for (const s of STATS) stats[s as Stat] = Math.max(1, Math.round(((a.stats[s] + b.stats[s]) / 2) * FUSION_PENALTY))
  const babySeed = 'fuse-' + a.id + '+' + b.id
  const baby = newCareer(babySeed, { id: 'own-fuse-' + g.nextId + '-' + babySeed, ageWeeks: 0, stats, licenseIndex: 0 })
  baby.species = a.species // base parent supplies the frame (§10.1)
  baby.log = [`A fusion of ${a.name} and ${b.name} hatches — a baby with inherited promise (unlicensed).`]
  return {
    ...g,
    gold: g.gold - FUSION_COST,
    stable: [...g.stable, baby],
    frozen: g.frozen.filter((x) => x.id !== aId && x.id !== bId),
    nextId: g.nextId + 1,
  }
}

function careerFromFrozen(fr: Frozen, id: string): Career {
  // Restore a raising shell from a banked genome, preserving stats + league. The
  // monster returns at Teen age (its prior calendar position isn't banked).
  const c = newCareer(fr.id, { id, stats: fr.stats, licenseIndex: fr.licenseIndex })
  c.name = fr.name
  c.species = fr.species
  c.sex = fr.sex
  c.favouriteFood = fr.favouriteFood
  c.hatedFood = fr.hatedFood
  c.log = [`${fr.name} the ${fr.species.name} is thawed and back in your stable.`]
  return c
}

// --- Ranch Shop (§13.1): barn capacity + bulk-food upgrades ---
export const barnCost = (g: GameState): number => 120 * g.barnCapacity

export function upgradeBarn(g: GameState): GameState {
  const cost = barnCost(g)
  if (g.gold < cost) return g
  return { ...g, gold: g.gold - cost, barnCapacity: g.barnCapacity + 1 }
}

export function buyBulkFood(g: GameState): GameState {
  if (g.bulkFood || g.gold < BULK_FOOD_COST) return g
  return { ...g, gold: g.gold - BULK_FOOD_COST, bulkFood: true }
}

export function buySpecialLicense(g: GameState): GameState {
  if (g.specialLicense || g.gold < SPECIAL_LICENSE_COST) return g
  return { ...g, gold: g.gold - SPECIAL_LICENSE_COST, specialLicense: true }
}

export function buyEliteLicense(g: GameState): GameState {
  if (g.eliteLicense || g.gold < ELITE_LICENSE_COST) return g
  return { ...g, gold: g.gold - ELITE_LICENSE_COST, eliteLicense: true }
}
