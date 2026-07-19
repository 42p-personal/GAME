# Monster Tamer — Development Guide

## Project Status
✅ **Ranch Weekly System**: Complete and tested
- Drill-based training (6 basic + 12 intensive drills), rest, excursion
- Sequential multi-monster decision UI (plan first, advance explicitly)
- Global week clock: one calendar drives food prices, monthly market restock, tournaments
- Exclusive body types (Draconic, Abyssal, Mythical) with licensing
- localStorage saves (`monster-tamer-save-v1`) + New Game button
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

### 1b. Ability Selection UI
- Moves are already learned from stat thresholds (LEARN_LADDER) and shown in inspect view
- Add "Change Abilities" in review phase: 3 active slots, swap from learned pool
- Persist loadout choice on Career (currently auto-chosen by chooseLoadout)

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
- **Basic drills**: +6 to one stat, −10 stamina
- **Intensive drills**: +12 to one stat, −4 to a paired stat, −25 stamina
- Gains scale by life stage, stamina malus, and species aptitude

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
