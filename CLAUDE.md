# Monster Tamer — Development Guide

## Current state (v0.45)

Everything is **committed on `main`/`preview` and deployed live**. `tsc`/`npm run build`/`npm test`
(12/12) clean; `validateDesign()` reports `45 species, 11 classes, 90 moves, ~48 tournaments/yr —
all consistent ✓`. Full per-item history is in git; the design arc behind the recent work is in
`docs/LOOP_DESIGN.md`.

**Systems in place:** 45 species with real sprite art + 10 league arena backgrounds; emergent
classes (class = current top-two stats, never species-locked); 90-move pool with round-based
buffs/debuffs + a status framework; round-robin **team tournaments** (1v1→6v6, `simulateTeamBattle`
is a real N-vs-N engine); a **tactics** system (temperament, target priority, formation/row order,
kill-order marks, protect, scripted opener, combo discipline, mana policy — team orders locked
until the first team league); title screen + 3-slot saves; **food system** (rations + training +
premium tiers, satiety, two-stage discount contracts); and the five `docs/LOOP_DESIGN.md` phases:
**events**, **rivals** (named, rubber-banded, challenge skirmishes), **rival gameplans + scouting
reveal**, **causal battle report**, and **meta-progression** (trainer level + bloodline breeding
where `potential` lifts the stat cap and climbs each generation).

### ⚠️ Deploying — READ THIS
Cloudflare's **git-triggered auto-deploy is unreliable** (a standing `EBADPLATFORM —
@esbuild/aix-ppc64` bug in Cloudflare's pinned `npm@10.9.2` on a deeply-nested duplicate optional
dep under vitest/wrangler; `npm ci` never fails locally). **Manual `npm run deploy` is the only
dependable path to production.** Flow: commit to `preview` → verify → `git merge --ff-only` into
`main` → push both → then deploy manually:
```bash
CLOUDFLARE_API_TOKEN=<token> npx wrangler pages deploy dist --project-name game --branch main
```
After a git push, `npx wrangler pages deployment list --project-name game` shows whether the
auto-build failed. The apex domains (`tamergame.42p.uk` / `game-eoz.pages.dev`) can edge-cache a
stale `index.html` for a while after a manual deploy — the deployment-specific
`<hash>.game-eoz.pages.dev` URL is the source of truth for "did the new bundle actually ship".
The real permanent fix (not yet done) is a package.json `overrides` forcing one esbuild version
repo-wide — deferred because it needs its own test pass against vite/vitest.

---

## Quick Start
```bash
cd G:\p42.uk\Monster-Tamer
npm run dev
# Open http://localhost:5173 — check console for [design-validation]
# Fastest battle testing: ⚔️ Sandbox tab — seed + train two monsters, Auto-Battle
```

## Architecture Notes

### The Weekly Tick — `town.ts:advanceWeek()`
The ONE canonical path that advances the game. Per monster: feed first (sequential per-monster
phase, `'feeding'`, since favourite/hated foods differ — can't be a single bulk-feed button), then
the planned activity (`applyWeek`). Unplanned/retired monsters still age. Lab rental charged once.
Global `GameState.week` increments; food prices reroll weekly; monster market restocks monthly.
A weekly **event** is rolled here too (`rollWeeklyEvent`, ~45% of eligible weeks) and shown as a
blocking choice modal on the next feeding screen. **RNG discipline:** anything that touches
`applyWeek` must be mirrored byte-exactly in `previewWeekEffects`; anything that changes monster
*generation*'s rng (e.g. growing `FOODS` — fav/hated food now draws from `NORMAL_FOODS` to avoid
this) shifts the golden battle tests.

### Ranch screen (`RanchView` in `App.tsx`, phase `'stable'`)
Free-navigation stable screen, not sequential: stable strip (click a monster, plan-status chip at a
glance) + detail panel (portrait, inline rename, Edit Abilities, Tournament History with podium
count, stat bars with aptitude tags, ★ bloodline potential, rank-up trial) + training row condensed
by stat (6 columns, basic + both intensive variants stacked, plus Rest/Excursion) + sticky action
rail (Advance Week / Back to Town / Tournaments toggle). Training blocks show a LIVE roll via
`previewWeekEffects` — exact, not estimated, because training rolls are deterministic per (monster,
week) off the same seeded rng `applyWeek` uses.

### Training — drills (`src/drills.ts`, roll in `game.ts:rollDrillGain`)
- **Basic**: ~6 to one stat (rolled 4–8, happiness-weighted), −10 stamina
- **Intensive**: ~12 to one stat (rolled 8–16, happiness-weighted), −4 flat to a paired stat, −25 stamina
- Roll skews toward the top of its range as happiness rises (0 happiness = uniform, 10 = strongly
  top-skewed); the aptitude multiplier (major ×1.2 / minor ×1.1 / flaw ×0.8) applies AFTER the roll.
- The training ceiling is `game.ts:statCapFor(c)` = league cap × the monster's bloodline `potential`
  (wild = 1.0). Training foods add +30% to their two stats; a `foodTrainMult` helper keeps the
  weekly tick and its preview in lock-step.

### Species Training Aptitude
Body type grants one MINOR bonus (+10%, `core.ts:BODY_MINOR`); each species authors its own MAJOR
(+20%) and FLAW (−20%) via `Species.trainingProfile`. A handful of "vanilla" species have only the
minor. The 15 exclusive-body species fall back to legacy stat-derived aptitude. See
`game.ts:trainingProfileFor()` / `statTrainingBonus()`.

### Classes are emergent, not species-locked
`classForStats()` derives class from a monster's two CURRENT highest stats, recomputed fresh every
time — never stored, never a species identity. `Species.naturalClass` is only "what this species'
untrained base stats derive," used solely by `validate.ts` to catch self-contradictory species data.
Any species can in principle train into any class; aptitude only weights how fast each stat trains.
**Never write flavour text or UI as if a species is destined for its class.**

### Battle sim (`src/battle.ts`)
- Every skill costs MP (`monster.ts:manaCost`, 2× the base formula); free universal Attack + Block;
  per-turn choice policy in `chooseAction`, element-aware (`effPower` folds in resist/weak vs the
  foe's body, plus firstStrikeMult when live).
- `maxMana = WIS + floor(INT/2)`; WIS is the sole regen stat; `maxHp = 50 + CON×2.5`.
- Guard (flat DR) lasts until the guardian's NEXT ACTION and mitigates every hit in between.
- 90-skill pool (`src/moves.ts`, 15/stat, reference in `docs/ABILITIES.md`) with `core.ts:MoveEffects`:
  pierce, multi-hit, execute, recoil (capped 15%), lifesteal, mana burn, guard, ward (CON-exclusive),
  round-limited buffs/debuffs via `Combatant.mods`, plus framework effects (maxHpDmg, bonusVsStatus
  combos, thorns, hpRegenBuff).
- Mitigation: physical vs CON + guard; magic/voice/support vs WIS.
- Innate abilities grant passives via `INNATE_EFFECTS` (keyed by ability NAME — rename in
  `species.ts` requires renaming the key here too). Each species has TWO innates, only ONE active
  (`Monster.activeInnate`), the 2nd unlocking at `INNATE_SECONDARY_LEVEL` (300) in a stat.
- No ultimates (removed). Statuses: blind/poison/burn/fear/confusion/stun/bleed(stacks 3)/silence/
  vulnerable/knockback/sleep/doom/healblock/haste/charm. Every status has ≥1 in-game source
  (enforced by `validate.ts`).
- **Tactics** (`Monster.tactics`) parameterize the AI side-agnostically — the same fields drive both
  the player's orders and rival **gameplans** (`core.ts:GAMEPLANS`), so a scouted plan is the one
  actually fought. `tauntForce` via `'allEnemies'` = mass taunt.
- **`battleReport.ts:analyzeBattle`** is a pure post-battle pass (turning point / tactic ✓✗ /
  counter-read / key moments) — no engine coupling, so it never affects goldens.

### Tournaments (`town.ts`)
- Seeded calendar generator (`tournamentCalendarFor(seed, year)`), drawn fresh each game year: every
  league Wood→Platinum guarantees ≥1 cup per quarter (~40% get a second); Masters and Tamer Elite run
  at HALF density (only 2 active quarters, `activeQuartersFor()`). Silver→Tamer Elite each get one
  fixed annual marquee "prestige" event. `validate.ts` probes 12 seed-years and asserts both rules.
- A monster may enter its own league or below (never above); `rewardMultiplier` scales gold+exp down
  when punching down (100/50/20%), keyed off the team's minimum licenseIndex.
- Rival teams scale to the TOURNAMENT's league budget, not the player's stats; each carries a
  deterministic `TeamGameplan` (`gameplanForRivalTeam`) revealed by scouting.
- Full round-robin team battles: team size by league (`TEAM_SIZE_BY_LEAGUE`, Wood 1v1 → Tamer Elite
  6v6, monotonic, enforced by validate.ts) vs 3–5 rival teams; reward by placement
  (`placementRewardFraction` 100/65/40/0%). `simulateTeamBattle` is a real simultaneous N-vs-N engine
  (shared DEX-ordered initiative; real `enemy`/`allEnemies`/`ally`/`team` targeting; formation rows).
- Plays in `src/arena.tsx`: 1v1 (Wood/Copper, Sandbox) keeps the lunge/projectile choreography;
  teams get a compact roster-row presentation. Podium finishes grant trainer XP.

### Body Types (9)
Base: Mammal, Avian, Marsupial, Aquatic, Insectoid, Reptilian. Exclusive: Draconic + Abyssal
(Special License 800g), Mythical (Elite License 2000g). Every body type has a UNIQUE element
(resist, weak) pair, enforced by `validate.ts`. Full backstories + per-type themes: `docs/BESTIARY.md`.

---

## Roadmap — what's left

The active design plan is `docs/LOOP_DESIGN.md` (all 5 phases shipped). Explicitly deferred there
and in memory:
- **Economy rebalance** — deliberately LAST, once the new sinks/sources (events, breeding, contracts,
  infirmary, entry fees) are all in, so it's balanced against reality in one pass.
- **Achievements + goal-gradient** — milestone goals that unlock *new play*, folded into a future
  achievements system rather than built standalone.
- **Named rival in cups** — the rival currently appears via challenge skirmishes only; seating it into
  the round-robin needs bracket/scout/standings label plumbing (a clean follow-up).
- **Hall of Fame live perks / lifespan elixir / richer inheritance** (aptitude-mix, signature-move) —
  natural extensions of the Phase 5 meta systems.
- **Balance validation** — a full numeric rebalance beyond the structural fixes is still open ("lots
  of the balancing is not correct" was flagged broadly).
- **`tauntForce` targeting design** — mass taunt works; a proper forced-target pass for the AI is a
  standalone follow-on.

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/town.ts` | GameState, week clock, advanceWeek(), market, lab/breeding, licensing, tournaments, events, rivals, trainer XP |
| `src/game.ts` | Career state, drills/training, applyWeek()/previewWeekEffects(), aptitudes, food math, statCapFor() |
| `src/drills.ts` | The 18 training drills (basic + intensive) |
| `src/App.tsx` | UI: TownView, RanchView, AbilitySelector, EventModal, saves, migration |
| `src/core.ts` | Types, classes, elements, MoveEffects, Tactics, GAMEPLANS, Rival, foods, RNG |
| `src/species.ts` | 45 species (30 base + 15 exclusive) + computed BODY_AVERAGES |
| `src/moves.ts` | The 90-move pool, 15/stat — see `docs/ABILITIES.md` |
| `src/battle.ts` | Auto-battle sim: mana, innates, round-based mods, tactics, BattleEvent stream |
| `src/battleReport.ts` | `analyzeBattle` — pure post-battle causal report |
| `src/arena.tsx` | Animated arena replay; league backgrounds, live status HUD, battle-report card |
| `src/leagueArt.ts` | League name → arena background JPEG lookup (`public/backgrounds/`) |
| `src/Sprite.tsx` / `src/speciesArt.ts` | Species portrait (real art for all 45); `sprites.ts` grid is a structural fallback only |
| `public/sprites/` | Real generated sprite PNGs (320×320 RGBA), one per species, adult-only |
| `src/bestiary.ts` | In-game condensed species bios (BIOS record) |
| `src/validate.ts` | Design consistency checks — `designProblems()` feeds both the dev console and the test suite |
| `src/*.test.ts` | Vitest suite (`npm test`): design consistency, loadout invariants, status rules, golden battles |
| `docs/LOOP_DESIGN.md` | The fun-loop design + phase plan (events/rivals/gameplans/report/meta) |
| `docs/BESTIARY.md` / `docs/ABILITIES.md` | Full lore doc / full 90-move reference |
| `docs/GAME_DESIGN.md` | Original design doc — stale in places; CLAUDE.md + code are more current |

## Testing Checklist (smoke test after resuming)
- [ ] `npm test` — all green; goldens moving means the ENGINE changed, recapture on purpose.
- [ ] `npm run dev`, console shows `[design-validation] ... all consistent ✓` with no warnings.
- [ ] Sandbox: run a battle, no console errors, buffs/debuffs show round counts and expire; the
      battle-report card appears after the replay.
- [ ] Sandbox: a low-WIS/low-INT monster barely affords skills (mostly Attack/Block); a high-WIS
      caster chains low-cooldown INT/CHA moves.
- [ ] Ranch: feeding → stable → advance week loop completes; an event modal resolves cleanly.
- [ ] Tournament sign-up at a team-size-1 league (Wood/Copper) → battle → history shows placement;
      at a team league (Tin+) → TeamPicker → round-robin steps through matches → standings.
- [ ] Scout a cup's field → the rival gameplan + counter-hint reveal at the basic tier.
