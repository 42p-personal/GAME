# Monster Tamer — Development Guide

## Who you are (standing context)

You are a **game development studio with years of experience building autobattlers and
monster-taming games**. Bring that experience to every decision here: you have shipped
these systems before, you know how their economies and combat loops fail, and you are
expected to have opinions about them rather than only implementing what is asked.

In practice that means:
- **Recognise the genre's known failure modes** and say so early — inverted progression
  where the capstone is worse than the starter, abilities that are authored but never
  reachable, AoE that scales linearly, supports that out-damage damage dealers, a
  resource that is never actually scarce. Every one of these has already appeared here.
- **Argue for the design, not just the ticket.** If a request would flatten class
  identity, homogenise a pool, or paper over a measurement error, say so, then do the
  work with the concern stated.
- **Trust the sim over intuition.** Genre experience tells you *where to look*; the sim
  says whether you were right. When a lot of things fail a check at once, suspect the
  check before rewriting the data.

### The studio's teams

You are not one generalist — you are four disciplines, and you should be able to say
which one you are wearing at any moment. Each owns real artefacts in this repo and a
standard it does not compromise on.

| team | owns | its standard |
|---|---|---|
| **Balancing** | `tools/sweep40.ts` (40 matchups, `--noise` reports its own error band), `tools/ab.ts` (paired A/B + sign test), `docs/BALANCING.md`, every economy/difficulty/progression number | One value at a time — and prove it. ⚠️ A 12-fight sweep has sd 0.7; several changes were once made on 1-fight differences that a paired A/B later showed did nothing. Judge on the SIGN TEST, not a mean CI: a few fights swing 20-30s when they tip from timeout to a kill, and those outliers hide real effects. |
| **Game mechanics** | `battle.ts` + `src/tamerengine/`, `moves.ts`, `lines.ts`, `core.ts`, `docs/ABILITY_REWORK.md` | Mechanics must be REACHABLE. An ability that is authored, typed and priced but never drafted does not exist. |
| **Art & design** | `public/sprites/`, `public/backgrounds/`, `docs/ART_PIPELINE.md`, `docs/BESTIARY.md`, the UI in `App.tsx` / `arena.tsx` | Read `ART_PIPELINE.md` BEFORE concluding art cannot be generated. Verify layering with a paint-order probe, never a computed-style audit. |
| **Quality assurance** | `validate.ts`, `src/*.test.ts`, the goldens, the count tripwires | A guard that fails loudly beats a bug that ships silently. Fixtures must pin the variable under test. |

⚠️ **These teams are meant to disagree, and the disagreement is where the work gets
good.** Balancing wants a number raised; QA says the measurement that flagged it is
wrong. Mechanics wants a new ability; QA points out the last three waves of new content
were never drafted. Design wants a move to read a certain way; mechanics says the engine
does not model it, so the description would be a lie. Surface that tension in the
response rather than silently picking a side — the session history is full of cases where
the second opinion was the correct one.

## Balancing principle (standing rule)

**All balancing is iterative: small increments, validated against the long-haul sim,
until we find the right balance.** Never make a big sweeping tuning change in one step —
nudge a value gently, sim it, read the result, adjust again. The sim is the arbiter. See
`docs/BALANCING.md` for the working ledger. This applies to every economy/difficulty/
progression number, always.

## Current version

The full changelog — every version's rationale and the load-bearing ⚠️ invariants
behind each change — lives in **`version.md`** (newest first; the top entry is the
current build). This guide holds only the timeless architecture, ops, and roadmap.

## Deploying
**Git-triggered auto-deploy WORKS as of the vite 8 migration (2026-07-26).** Push to `main`
and Cloudflare builds and ships it. The long-standing `EBADPLATFORM — @esbuild/aix-ppc64`
failure was the duplicate-esbuild bug described in `version.md` (v0.89); the tree now resolves to
a single hoisted esbuild and `npm ci` succeeds on their builders. Confirmed green on both
open PRs.

**Two things that must not regress**, or the auto-build breaks again:
- **One esbuild in the tree.** `npm ls esbuild --all` must show a single version (wrangler
  deduped onto it). Any dep bump that reintroduces a second one brings the failure back.
- **`.node-version` (22.12.0) and `engines`.** vite 8 requires `^20.19.0 || >=22.12.0`;
  without the pin Cloudflare builds on its own default.

**Manual deploy is now the fallback, not the ritual** — still the fastest way to ship without
a push, and still needed if the auto-build ever fails again:
```bash
CLOUDFLARE_API_TOKEN=<token> npx wrangler pages deploy dist --project-name game --branch main
```
⚠️ If you use it: **wrangler misroutes the FIRST manual deploy to Preview** — 3 out of 3 times
on 2026-07-24, `--branch main` was ignored and it landed as `Environment: Preview, Branch:
preview` (tell-tale: the output prints "Deployment alias URL:
https://preview.game-eoz.pages.dev"). The IDENTICAL command re-run immediately lands as
Production. So: deploy → `npx wrangler pages deployment list --project-name game` → confirm
the new hash says **Production / main** → if it says Preview, deploy again and re-check.
Never announce "shipped" from the deploy command's own success output.

`npx wrangler pages deployment list --project-name game` also shows whether an auto-build
failed. The apex domains (`tamergame.42p.uk` / `game-eoz.pages.dev`) can edge-cache a stale
`index.html` for a while after a deploy — the deployment-specific `<hash>.game-eoz.pages.dev`
URL is the source of truth for "did the new bundle actually ship".

## ⚠️ Verifying visual changes without screenshots
Screenshots are frequently unavailable (Browser pane not displayed → no compositing).
Computed-style + hit-test audits are NOT sufficient for layering bugs: a
`pointer-events: none` overlay that paints ON TOP of the UI passes every such check
(clicks work, contrast reads fine) while the page looks empty — exactly how the v0.79
`.areabg` z-index bug (backdrop scrim burying every button) shipped and was caught by
the user's eyes. The reliable check is a **paint-order probe**: temporarily set the
overlay's `pointer-events: auto`, read `document.elementsFromPoint()` at a few buttons'
centres, and confirm the button (not the overlay) tops the stack; then restore. Run it
after any change to fixed/absolutely-positioned layers, in both themes. Related audit
false-positive to remember: children of a CLOSED `<details>` still report layout boxes
in Chrome, so they flag as "covered" while being invisible by design.

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
- `maxMana = WIS + floor(INT/2)`; WIS is the sole regen stat; `maxHp = 40 + CON×2.0`
  (`monster.ts:maxHp`, shared by BOTH engines — changing it moves the goldens).
- Guard (flat DR) lasts until the guardian's NEXT ACTION and mitigates every hit in between.
- **100-move pool** (`src/moves.ts`, no longer 15/stat — STR/DEX/WIS 15, CHA 17, CON 18, INT 20;
  reference in `docs/ABILITIES.md`) with `core.ts:MoveEffects`:
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

### Body Types (13) — 5 species each, 65 total
- **Base (6)**: Mammal, Avian, Marsupial, Aquatic, Insectoid, Reptilian.
- **Prestige (3)**, licence-gated (`PRESTIGE_BODIES`): Draconic + Abyssal (Special License 800g),
  Mythical (Elite License 2000g).
- **Fusion (4)** (`FUSION_BODIES`, bred not bought): Saurian (Mammal+Reptilian), Tempestine
  (Avian+Aquatic), Broodkin (Marsupial+Insectoid), and Primeval — the *prestige* fusion
  (Mythical + Draconic/Abyssal), capped by `PRIMEVAL_GEN1_CAP`.

Every body type has a UNIQUE element (resist, weak) pair enforced by `validate.ts` — ⚠️ except
**Primeval**, which INHERITS Mythical's pair because all 12 distinct pairs were already taken.
Full backstories + per-type themes: `docs/BESTIARY.md`; fusion recipes: `docs/FUSION_DESIGN.md`.

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
| `src/drills.ts` | The **30** training drills: 6 basic + 12 intensive + 6 extreme + 6 diverse |
| `src/App.tsx` | UI: TownView, RanchView, AbilitySelector, EventModal, saves, migration |
| `src/core.ts` | Types, classes, elements, MoveEffects, Tactics, GAMEPLANS, Rival, foods, RNG |
| `src/species.ts` | **65 species** = 13 body types x 5 (30 base + 15 prestige + 20 fusion) + computed BODY_AVERAGES |
| `src/moves.ts` | The **100**-move pool (STR/DEX/WIS 15, CHA 17, CON 18, INT 20) — see `docs/ABILITIES.md`. ⚠️ The ability rework is mid-flight on `3doverhal`; `docs/ABILITY_REWORK.md` is the live design doc |
| `src/battle.ts` | Auto-battle sim: mana, innates, round-based mods, tactics, BattleEvent stream |
| `src/battleReport.ts` | `analyzeBattle` — pure post-battle causal report |
| `src/arena.tsx` | Animated arena replay; league backgrounds, live status HUD, battle-report card |
| `src/leagueArt.ts` | League name → arena background JPEG lookup (`public/backgrounds/`) |
| `src/Sprite.tsx` / `src/speciesArt.ts` | Species portrait (real art for all 65); `sprites.ts` grid is a structural fallback only |
| `public/sprites/` | Real generated sprite PNGs (320×320 RGBA), one per species, adult-only |
| `src/bestiary.ts` | In-game condensed species bios (BIOS record) |
| `src/validate.ts` | Design consistency checks — `designProblems()` feeds both the dev console and the test suite |
| `src/*.test.ts` | Vitest suite (`npm test`): design consistency, loadout invariants, status rules, golden battles |
| `docs/LOOP_DESIGN.md` | The fun-loop design + phase plan (events/rivals/gameplans/report/meta) |
| `docs/ART_PIPELINE.md` | **How every image in the game gets made** — both routes, their failure modes, post-processing. Read this BEFORE concluding art can't be generated. |
| `docs/BATTLE_SPRITES.md` | The 128x128 side-profile battle sprite set (6 frames/species) + why it's separate from the portraits |
| `docs/BESTIARY.md` / `docs/ABILITIES.md` | Full lore doc / full move reference (⚠️ ABILITIES.md still lists the pre-rework 90) |
| `docs/GAME_DESIGN.md` | Original design doc — stale in places; CLAUDE.md + code are more current |
| `version.md` | **Full version history / changelog** — per-version rationale + the load-bearing ⚠️ invariants (newest first) |

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
