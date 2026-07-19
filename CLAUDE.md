# Monster Tamer — Development Guide

## Project Status
✅ **Ranch Weekly System**: Complete and tested
- Drill-based training (6 basic + 12 intensive drills), rest, excursion
- Sequential multi-monster decision UI (plan first, advance explicitly)
- Global week clock: one calendar drives food prices, monthly market restock, tournaments
- Exclusive body types (Draconic, Abyssal, Mythical) with licensing
- localStorage saves (`monster-tamer-save-v2`) + New Game button
- Battle sim: mana costs, innate passives, low-HP ultimates, CON/WIS mitigation
- Dev-time design validation (`src/validate.ts`, runs on dev startup)

## Quick Start
```bash
cd G:\p42.uk\Monster-Tamer
npm run dev
# Open http://localhost:5173 — check console for [design-validation]
```

## Next Steps (In Priority Order)

### 1. Skills & Battle-Choice System (DESIGN LOCKED — user spec 2026-07-18)
**STATUS: battle-side implemented on the `preview` branch (2026-07-18)** — all
skills cost MP (`monster.ts:manaCost`), universal Attack (free, best channel,
power 12) and Block (free, +30–55% avoid scaling with WIS, lasts until next
action), choice policy in `battle.ts:chooseAction`. Remaining: tune policy
numbers, damage scaling at high stats (one-shots), and the Ability Selection UI.
Every turn, the battle AI chooses one of:
- **A skill** — one of the monster's 3 equipped active abilities (learned at
  milestones via LEARN_LADDER). EVERY skill has an MP cost; if the monster can't
  afford any equipped skill it CANNOT use one — it must Attack or Block.
- **Attack** — universal basic attack, no MP cost (replaces "Struggle" as the
  standard action, not a last resort).
- **Block** — universal defensive stance, no MP cost; raises the chance to NOT
  take a hit (avoidance, not just flat mitigation).
The interesting work is the choice logic: when to spend MP on a skill vs
conserve, when to block (low HP / out of MP / expecting a big hit) vs attack.

### 1b. Ability Selection UI — DONE on `preview` (2026-07-19)
- `Career.loadout: string[]` (≤3 move ids) persists the player's choice;
  `careerMonster()` uses it when non-empty and still valid, else falls back to
  auto-pick (`chooseLoadout`) — including the edge case where a drill malus
  dropped a stat below a move's learnLevel, silently shrinking the loadout.
- `town.ts:setLoadout(g, id, ids)` validates ids against the monster's actual
  learned pool and blocks the change while `pendingTournament.monsterId === id`
  (free any time EXCEPT a monster's active tournament week).
- UI (`AbilitySelector` in App.tsx, opened from the 1c detail panel's "⚔ Edit
  Abilities"): click a slot, then a pool card to swap it in (defaults to slot 0
  if none selected); filter chips by stat; equipped moves show dimmed in the
  pool; "reset to suggested loadout" calls `onSetLoadout([])` to fall back to
  auto-pick.

### 1c. Ranch Screen Redesign — DONE on `preview` (2026-07-19)
Replaced the sequential per-monster training decision with a free-navigation
stable screen (`RanchView` phase `'stable'`). Structure:
- **Stable strip**: every monster as a card, click to select (`selectedMonsterId`
  state). Each card shows an at-a-glance plan-status chip — the planned activity
  name if set, amber "⚠ needs a plan" if not, "🏁 retired" if retired.
- **Detail panel** (2 columns): portrait + inline-editable name (click ✎, blurs
  to commit via `renameMonster`) + "⚔ Edit Abilities" (opens 1b, disabled the
  week the monster is competing) + "🏆 Tournament History" (podium count +
  per-entry placement, see 2c) on the left; stat bars with training-aptitude
  tags (PRIMARY +20% / SECONDARY +10% / WEAKNESS −20%) + stamina/happiness bars
  + the rank-up trial button (moved here from the old decisions phase) on the
  right.
- **Training row**: condensed by stat — 6 columns (STR/DEX/CON/WIS/INT/CHA),
  each with its basic drill block + BOTH intensive drill variants stacked (no
  toggle — user spec: "having both stacked is fine"), plus a 7th "OTHER" column
  for Rest/Excursion. Each block shows a LIVE roll via `previewWeekEffects` —
  exact, not estimated (see 1d). Replaces the old wall of 18 buttons.
- **Tournament Calendar**: unchanged grid+entry-panel UI from 2b, now toggled
  from the rail instead of being a separate phase.
- **Action rail** (right, sticky): "⏭ Advance Week", "🏛 Back to Town", "📅
  Tournaments" toggle — room for more later.
- Feeding is NOT on this screen — monsters have different favourite/hated
  foods, so it's a separate SEQUENTIAL per-monster phase (`'feeding'`)
  immediately before the stable screen every week (can't be a single
  bulk-feed button).
- Basic drills already had proper names in `drills.ts` (Weight Training,
  Agility Course, Endurance Run, Meditation, Study, Stage Practice) — no data
  change needed, just using the real names instead of an earlier mockup's
  generic "basic" placeholder label.
- Save format bumped to `monster-tamer-save-v2` (Career gained required
  `loadout`/`tournamentHistory` fields) — old saves are dropped, not migrated.

### 1d. Variable Training Rolls — DONE on `preview` (2026-07-19)
Drill stat gains are a happiness-weighted random roll, not a flat number
(`game.ts:rollDrillGain`):
- Range is base ± ⅓ (basic 6→[4,8], intensive 12→[8,16]). `skew = 1/(1 +
  happiness/5)`; `t = rng()^skew` biases the roll toward the top as happiness
  rises (0 happiness = uniform, 10 = strongly top-skewed).
- The existing aptitude multiplier (`statTrainingBonus`, ×1.2/1.1/0.8) still
  applies AFTER the roll — "preferred trait" (primary/secondary/weakness)
  wasn't folded into the roll itself, it's the pre-existing multiplier.
  Combined, a favoured stat at high happiness can exceed the old flat +12
  ceiling on the best rolls — intentionally not advertised as a stated max.
- Malus stays flat/unscaled, as before — only positive gains roll.
- Deterministic per (monster, week) via the same seeded rng as everything
  else calendar-related, so `previewWeekEffects` shows the EXACT roll that
  will land, not an estimate — it mirrors `applyWeek`'s rng creation/call
  order exactly, and uses POST-feed happiness (feeding resolves first in the
  real weekly tick) so the preview matches the commit precisely.

### 2. Tournament Battle System — DONE on `preview` (2026-07-19)
- Sign up in review phase (eligible-monster select, one entry/week, cancelable)
- `town.ts:resolveTournament` runs during advanceWeek: rival generated at ±15%
  of the player's total stats (`generateRival`; exclusives only Silver+)
- Win → gold + training exp on the aptitude stats; loss/draw → nothing; logged
- Battle plays in the ANIMATED ARENA (`src/arena.tsx`): battle.ts emits a
  structured `BattleEvent[]` stream (hits, misses, stances, dots, ultimates,
  HP/MP snapshots) that the arena renders as beats — lunges, projectiles,
  floating numbers, KO topple, 1×/2×/4×/skip. Sandbox uses it too.

### 2b. Tournament economy (user spec 2026-07-19) — DONE on `preview`
- SEEDED calendar generator (`town.ts:tournamentCalendarFor(seed, year)`), drawn
  fresh each game year: every circuit league (Wood→Iron) is GUARANTEED ≥1 event
  per quarter, ~40% of quarters get a second, in unpredictable months — never a
  fixed monthly slot (user spec). Silver+ keep fixed annual prestige events.
  validate.ts probes 12 seed-years to enforce the quarterly invariant.
- Monsters may enter their own league or ANY league below it, never above
- `rewardMultiplier`: same league 100%, 1 league above the event 50%, 2+ 20%
  (applies to gold AND exp; UI warns before sign-up, log records the reduction)
- Rivals scale to the TOURNAMENT league budget (cap × 3.5, never above the
  player's total) — punching down means stomping genuine league-locals
- One entry per event per month (`GameState.enteredThisMonth`, resets monthly)

### 2c. Tournament Brackets & League Cups (user spec 2026-07-19 — LATER, not yet implemented)
Replaces today's 1v1-vs-one-generated-rival model with real multi-participant
brackets:
- Each league gets its OWN named cups/tournaments instead of one generic
  circuit event — e.g. Wood league has "the Sapling Cup" AND "the Plank
  Tournament" as distinct events, each potentially with its own participant
  count (varies per tournament, not fixed).
- The "rank-up tournament" IS the existing gold-fee rank-up trial
  (`game.ts:rankUp`/`canRankUp`/`rankUpFee`) — same system, not a second path.
  No open question here; nothing new to build for rank-up itself.
- Real placements (1st/2nd/3rd/...) become meaningful once brackets exist.
  The 1c tournament-history UI currently shows binary champion/not-placed
  because that's all a single 1v1 battle can produce — it should show real
  placement once this lands.
- Blocks on it: `town.ts:resolveTournament` (single `simulateBattle` call),
  `TOURNAMENT_CALENDAR`/`tournamentCalendarFor` (one event per league-slot,
  not multiple named cups), `LastBattle` (assumes one opponent).

### 3. Tournament Rewards polish
- Rare items: champion-only drops (TBD)

### 4. Later: tameness/instinct roll, class AI priorities, team battles (3v3),
  real-time positional sim (designs agreed in chat, not yet implemented)

### 5. Other Ranch Features
- (Deferred: user said "we will look at the other options when in the ranch")

## Architecture Notes

### The Weekly Tick — `town.ts:advanceWeek()`
The ONE canonical path that advances the game. Per monster: feed first (at this
week's prices), then the planned activity (`applyWeek`). Unplanned/retired
monsters still age (`ageOneWeek`). Lab rental charged once. Then the global
`GameState.week` increments, food prices reroll, and the monster market restocks
when the month turns (`week % 4 === 0`). There is no manual market refresh.

### Training — drills (`src/drills.ts`)
- **Basic drills**: ~6 to one stat (rolled 4–8, happiness-weighted), −10 stamina
- **Intensive drills**: ~12 to one stat (rolled 8–16, happiness-weighted), −4 flat
  to a paired stat, −25 stamina
- Gains scale by life stage, stamina malus, and species aptitude — see
  "1d. Variable Training Rolls" for the roll itself (`game.ts:rollDrillGain`)

### Species Training Aptitude
Derived per species from its base stat spread (NOT per body type):
- **Primary** (highest base stat): +20% training exp
- **Secondary** (2nd highest): +10%
- **Weakness** (lowest): −20%
Optional per-species override via `Species.trainingProfile`.
See `game.ts:trainingProfileFor()` / `statTrainingBonus()`.

### Stamina Malus
```
>70%: 1.0× (no penalty)
50-69%: 0.95× (-5%)
30-49%: 0.9× (-10%)
<30%: 0.5× (-50%)
```

### Classes are emergent
`classForStats()` derives class from the two highest stats; species base stats are
authoritative and MUST derive their declared `naturalClass` — `src/validate.ts`
warns in dev if they drift. Monster generation uses order-preserving ±5 variance
so a monster's class never flips from its species.

### Battle sim (`src/battle.ts`)
- EVERY skill costs MP (`monster.ts:manaCost`); free universal Attack + Block
  actions; per-turn choice policy in `chooseAction`
- 90-skill pool (`src/moves.ts`, 15/stat) with mechanical effects
  (`core.ts:MoveEffects`): pierce, multi-hit, execute, recoil, lifesteal,
  mana burn, guard, ward shields, battle-long buffs/debuffs (atk/def/dodge/acc/regen)
- Mitigation: physical vs CON + guard, magic/voice/support vs WIS
- Innate abilities grant passives via `INNATE_EFFECTS` table
- Ultimate (stat 600+) fires once per battle below 40% HP

### Body Types (9)
Base: Mammal, Avian, Marsupial, Aquatic, Insectoid, Reptilian.
Exclusive: Draconic + Abyssal (Special License 800g), Mythical (Elite License 2000g).
Market filtering AND buyMonster guard both enforce licenses (`src/town.ts`).
Every body type has a UNIQUE element (resist, weak) pair — enforced by validate.ts.
Insectoid/Reptilian species carry the DEX- and WIS-weak training profiles no other
monsters have, so all six stats appear as both strengths and weaknesses somewhere.

## Files to Know

| File | Purpose |
|------|---------|
| `src/town.ts` | GameState, global week clock, advanceWeek(), market, lab, licensing |
| `src/game.ts` | Career state, drills/training logic, applyWeek(), aptitudes |
| `src/drills.ts` | The 18 training drills (basic + intensive) |
| `src/App.tsx` | UI: TownView, RanchView, saves, sequential decisions |
| `src/core.ts` | Types, classes, elements, learn ladder, RNG |
| `src/species.ts` | 45 species (30 base across 6 body types + 15 exclusive) + computed BODY_AVERAGES |
| `src/battle.ts` | Auto-battle sim: mana, innates, ultimates, BattleEvent stream |
| `src/arena.tsx` | Animated arena replay (plays BattleEvent[] as live beats) |
| `src/Sprite.tsx` | Shared pixel-sprite component |
| `src/validate.ts` | Dev-only design consistency checks |
| `src/sprites.ts` | 16x16 pixel art per body type |

## Deployment
All changes pushed to **main**. No wrangler deploy yet (Worker hasn't changed).

## Testing Checklist
- [ ] Fresh game (500g, empty stable); console shows design-validation ✓
- [ ] Buy monster from market (no Refresh button anywhere)
- [ ] Enter Ranch → pick drill + food in either order → explicit Next advances
- [ ] Review shows per-monster plan; calendar marks current month
- [ ] Proceed → gold drops by food, stamina by drill, chosen stat gains
- [ ] Advance 4 weeks → market restocks with 3 new monsters at Month 2
- [ ] Reload page → game state persists; New Game resets after confirm
- [ ] Bestiary lists all 9 body types; exclusives locked until licensed
- [ ] Sandbox battle log shows innates, mana exhaustion, drains
