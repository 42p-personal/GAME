# Monster Tamer — Development Guide

## Project Status
✅ **Ranch Weekly System**: Complete and tested
- Stamina-based training (weak/strong/rest)
- Sequential multi-monster decision UI
- Tournament calendar system
- Exclusive body types (Draconic, Abyssal, Mythical) with licensing

## Quick Start
```bash
cd G:\p42.uk\Monster-Tamer
npm run dev
# Open http://localhost:5173
```

## Next Steps (In Priority Order)

### 1. Ability Learning System
- Monsters learn abilities from stat thresholds (e.g., STR 40 → "Power Slash")
- Store learned abilities in Career.learned array
- Display in inspect view with ability details

### 2. Ability Selection UI
- Add "Change Abilities" button in review phase
- Show 3 active ability slots per monster
- Let players swap from learned abilities
- Persist loadout choice

### 3. Tournament Battle System
- When monster signs up for tournament, simulate battle that week
- Compare stats → winner determined (or RNG-based)
- Apply results (winner gets rewards, loser nothing)
- Display battle outcome in week summary

### 4. Tournament Rewards
- Gold: varies by league tier
- Training exp: bonus for winning
- Rare items: champion-only drops (TBD)

### 5. Other Ranch Features
- (Deferred: user said "we will look at the other options when in the ranch")

## Architecture Notes

### Training Bonus System
All body types have stat bonuses during training:
- **Primary stat**: +20% exp when training
- **Secondary stat**: +10% exp when training
- **Weakness stat**: -20% penalty when training

See `src/core.ts:BODY_TYPE_STATS` and `src/game.ts:statTrainingBonus()`

### Stamina Malus
Exp gains scale down as stamina drops:
```
>70%: 1.0× (no penalty)
50-69%: 0.95× (-5%)
30-49%: 0.9× (-10%)
<30%: 0.5× (-50%)
```

### Exclusive Body Types
- **Silver rank (800g)**: Draconic + Abyssal unlock
- **Masters rank (2000g)**: Mythical creatures unlock
- Licensing system in Ranch Shop (`src/App.tsx:TownView`)

## Files to Know

| File | Purpose |
|------|---------|
| `src/game.ts` | Career state, training logic, applyWeek() |
| `src/town.ts` | GameState, market, lab, licensing |
| `src/App.tsx` | UI: TownView, RanchView, sequential decisions |
| `src/core.ts` | Types, body stats, element affinities |
| `src/species.ts` | 35 species (20 base + 15 exclusive) |
| `src/sprites.ts` | 16x16 pixel art per body type |

## Deployment
All changes pushed to **preview** branch. No wrangler deploy yet (Worker hasn't changed).

```bash
git push origin preview
```

## Testing Checklist
- [ ] Start fresh game (500g, empty stable)
- [ ] Buy monster from market
- [ ] Enter Ranch → see decision phase
- [ ] Choose training + food → auto-advance to next monster
- [ ] Continue to review → see calendar
- [ ] Proceed → week advances correctly
- [ ] Stamina costs apply (-10% weak, -25% strong)
- [ ] Stats gain with training bonus applied
- [ ] Buy Special License → Draconic/Abyssal appear in market
