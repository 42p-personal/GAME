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

### 1. Ability Selection UI
- Moves are already learned from stat thresholds (LEARN_LADDER) and shown in inspect view
- Add "Change Abilities" in review phase: 3 active slots, swap from learned pool
- Persist loadout choice on Career (currently auto-chosen by chooseLoadout)

### 2. Tournament Battle System
- Sign Up button exists (disabled) with league-eligibility check in review phase
- On sign-up, simulate battle that week vs a generated rival (use simulateBattle)
- Apply results + display outcome in week summary

### 3. Tournament Rewards
- Gold: varies by league tier (values already in TOURNAMENT_CALENDAR)
- Training exp: bonus for winning
- Rare items: champion-only drops (TBD)

### 4. Other Ranch Features
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
- Magic/voice moves cost mana (`monster.ts:manaCost`); dry casters Struggle
- Mitigation: physical vs CON + guard, magic/voice vs WIS
- Innate abilities grant passives via `INNATE_EFFECTS` table (flat DR, dodge,
  regen, damage mults, first-hit bonuses, lifesteal)
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
| `src/battle.ts` | Auto-battle sim: mana, innates, ultimates |
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
