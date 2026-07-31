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
| **Balancing** | `tools/sweep40.ts` (40 matchups over `tools/comps.ts`, `--noise` reports its own error band), `tools/ab.ts` (paired A/B + sign test), `docs/BALANCING.md`, every economy/difficulty/progression number | One value at a time — and prove it. ⚠️ A 12-fight sweep has sd 0.7; several changes were once made on 1-fight differences that a paired A/B later showed did nothing. Judge on the SIGN TEST, not a mean CI: a few fights swing 20-30s when they tip from timeout to a kill, and those outliers hide real effects. |
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
(+20%) and FLAW (−20%) via `Species.trainingProfile`. ⚠️ **All 65 species now author a profile** —
the legacy stat-derived fallback in `game.ts:trainingProfileFor()` is still there as a safety net
for any future species added without one, but nothing currently reaches it. See
`game.ts:trainingProfileFor()` / `statTrainingBonus()`.

### Classes are emergent, not species-locked
`classForStats()` derives class from a monster's two CURRENT highest stats, recomputed fresh every
time — never stored, never a species identity. `Species.naturalClass` is only "what this species'
untrained base stats derive," used solely by `validate.ts` to catch self-contradictory species data.
Any species can in principle train into any class; aptitude only weights how fast each stat trains.
**Never write flavour text or UI as if a species is destined for its class.**

### The ability system (`moves.ts` + `lines.ts` + the authoring axes)

Reworked wholesale on `3doverhal`; `docs/ABILITY_REWORK.md` is the live design doc.

**Lines.** Each stat has THREE lines — a group of abilities sharing a win condition, not a power
tier (`src/lines.ts`): STR Bloodrage/Duelist/Warcry · DEX Assassin/Venomcraft/Volley · CON
Warden/Guardian/Bulwark · WIS Disruptor/Mender/Siphon · INT Hexer/Elementalist/Arcanist · CHA
Enchanter/Captain/Demagogue. `CLASS_LINES` says which three a class draws from, and `chooseLoadout`
multiplies affine moves by 1.35.

⚠️ **Lines exist because three separate waves of authored content never reached a kit.** The picker
used to rank all ~100 moves globally, so a move could only be drafted by out-scoring every other —
control moves (deliberately low-power) measured 0% equipped, `Arcane Aegis` was 53% learnable and 0%
equipped. Nudging scores twice made it WORSE. A line is a group to DRAW FROM, never a track the
player is forced down, and affinity is a multiplier so off-line picks stay possible.

⚠️ **Every move must appear in `LINE_OF`** — `validate.ts` enforces it, because a lineless move is
invisible to affinity and silently unpickable.

**The four authoring axes**, all per-ability:
| axis | what it does | ⚠️ |
|---|---|---|
| `statScale` | damage is `power × (1 + stat × statScale)`; the progression axis | **FIELD-ONLY** — `battle.ts` never reads it, so changing it CANNOT move a golden. `STAT_SCALE_HIGH` only reaches capstones a mid-game monster cannot learn. |
| `mana` | authored MP, overriding the derived `manaCost` | All 137 author one. Mana prices EFFECTIVENESS, not power — `Blood Price` is 30 power for 10 MP because it is paid for in blood. |
| `variance` | half-width of the damage range; `power` is the MID-POINT | Default 0.15 is exactly the flat spread `battle.ts` always rolled, so an unauthored move behaves identically. `Deadeye` 0.05, `Gambler's Volley` 0.50. |
| `range` | how far the ability reaches, in world units | **All 137 author one and `validate.ts` FAILS a move without it.** Seeded per LINE by `tools/authorranges.ts` — a line is a shared win condition and its reach is part of that identity (Assassin 2.4–2.8, Volley 8.4–11.0). ⚠️ The line owns the reach, NOT the channel: DEX's channel is `ranged` whether the move is a bow or a stiletto. |

**Two standing balance rules the pool is held to** (both asserted by harnesses, not vibes):
- **Nothing falls below the free attack.** Judged with conditionals credited — an opener, a
  detonator or a stun is worth more than its raw number, and ignoring that once flagged 8 correctly
  priced DEX moves as broken.
- **AoE is weak into one body and strong into three.** `aoeFalloff` expresses it; the audit judges
  AoE at 3 targets, never at 1.

**Support is divided by KIND, not by amount: CHA empowers · CON protects · WIS restores.** CHA is the
only stat that makes an ally stronger; CON's support is shields and prevention; WIS's is healing and
cleansing, and it is the ONLY stat that can heal another monster.

**Damage is tiered on purpose.** Median effective DPS: STR 42.6 · DEX 38.2 · INT 35.2 || CON 28.0 ·
CHA 26.8 · WIS 22.8. The support tier is not underpowered — it is paid in utility.

### Battle sim (`src/battle.ts`)
- Every skill costs MP (`monster.ts:manaCost`, 2× the base formula); free universal Attack + Block;
  per-turn choice policy in `chooseAction` (`effPower` folds in firstStrikeMult when live).
- `maxMana = WIS + floor(INT/2)`; WIS is the sole regen stat; `maxHp = 40 + CON×2.0`
  (`monster.ts:maxHp`, shared by BOTH engines — changing it moves the goldens).
- Guard (flat DR) lasts until the guardian's NEXT ACTION and mitigates every hit in between.
- **137-move pool** (`src/moves.ts` — 23 per stat except WIS 22) with `core.ts:MoveEffects`:
  pierce, multi-hit, execute, recoil (capped 15%), lifesteal, mana burn, guard, ward,
  round-limited buffs/debuffs via `Combatant.mods`, plus framework effects (maxHpDmg, bonusVsStatus
  combos, thorns, hpRegenBuff). ⚠️ `ward` is NO LONGER CON-exclusive — CHA carries it too
  (Bravura, Hymn of Shields), and `guard` spans STR/CON/CHA. See "The ability system" below.
- Mitigation: physical vs CON + guard; magic/voice/support vs WIS.
- **The free attack is AUTHORED PER CLASS** (`tamerengine/types.ts:CLASS_BASIC`) — channel, reach
  and scaling stat, drawn from four bands: melee 3.0 · ranged 8.0 · magic 7.0 · support 6.0.
  ⚠️ It used to be DERIVED from whichever damage move a monster happened to draft, and there is no
  version of that guess that works: by POWER a ranged monster got a melee basic it could never
  reach with; by REACH a Warrior that drafted one Piercing Shot became a ranged unit standing off
  at 6.4. The same mistake had already been found and fixed once in `reachOf` — this was a second
  copy. DEX is why no formula replaces the table: Rogue is a knife, Ranger is a bow, and the stat
  pair cannot tell them apart. `reachOf` takes the SHORTER of best weapon and class basic — stand
  where everything in your hands works.
- **Nothing teleports.** Knockbacks travel at `KNOCKBACK_SPEED` and cost the target control for the
  flight. ⚠️ `applyOnTarget` used to write `target.pos = dest`, landing Body Slam's `push: 3` in a
  single 0.1s tick. `spatial.test.ts` has a tripwire: no unit may move >2.0 units in one tick.
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

⚠️ **ELEMENTS ARE REMOVED FROM THE GAME (2026-07-30).** Body types no longer carry a
resist/weak pair, moves no longer carry an element, and there is no damage multiplier for
either. `Element`, `ELEMENTS`, `BODY_ELEMENT` and `elementMultiplier` are gone from
`core.ts`; the `validate.ts` uniqueness guard is gone with them.

*Why:* the field engine never implemented it — `grep element src/tamerengine/engine.ts`
returned nothing — so a 13-body matrix that `validate.ts` policed for uniqueness had **zero
mechanical effect** in the engine the game is moving to, and only 14 of 137 moves carried one
at all. A resist/weak table a player cannot observe is bookkeeping, not a mechanic. INT
expresses itself through statuses, zones and the widest debuff vocabulary in the pool instead.

⚠️ **Do not reintroduce an `element` field** without also implementing it on the field engine;
that split is exactly what made it dead weight. Two knock-ons to remember: the `Elementalist`
LINE NAME (INT) is unrelated and stays, and the innate once called `elemDmgMult` (Arcane Bolt,
Spellblade) is now `magicDmgMult` and reads the CHANNEL, so those species keep a live innate.

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
- **`tauntForce` targeting design** — mass taunt works; a proper forced-target pass for the AI is a
  standalone follow-on.

### tamerengine — what the ability rework left open

The pool rework is DONE (137 moves, 18 lines, all six stats). Still outstanding, in order:
1. ~~**FOCUS FIRE (P6)** — the highest-value item~~ ⚠️ **THIS ENTRY WAS WRONG AND THE
   MEASUREMENT THAT REFUTED IT IS `tools/focus.ts` (2026-07-31).** It claimed damage "spreads
   evenly across a whole enemy side". It does not: top share — a side's damage landing on its
   single most-damaged enemy, up to the first death — measures **0.711**, where an even split
   across three bodies would be 0.333. A side hits 1.78 distinct enemies per 5s, not 3.
   Correlating across the ten compositions: **maxHp r=+0.79** against time-to-first-kill,
   **top share r=−0.56**. Focus is real and signed correctly, but it is the SMALLER lever —
   it spans 0.59–0.87 while maxHp spans 291–534 (1.84x). Healing was the other suspect and is
   not it (0–9% of damage dealt).
   ⚠️ **And "both measured NULL" was an instrument artifact.** Re-run as a paired A/B on the
   fixed harness, the maxHp coefficient gives **p=0.0022** (30 better / 10 worse of 40),
   concentrated exactly on the grinding shapes. The earlier null came from measuring against
   compositions that existed nowhere in the game, with `resolved` as the metric (now at ceiling,
   sd 0.00) and no time-to-first-kill at all.
   Still worth building at its real size; do NOT build it expecting it to fix the grind.
   Flanking (+10 acc when outnumbered and unsupported) is already in; target selection is not.
2. **Six PASSIVES** — designed in `ABILITY_REWORK.md`, not built. Needs engine work FIRST: exclude
   them from `chooseMove`, from `reachOf` (or a passive's channel sets a unit's stand-off distance —
   the bug that once parked bruisers outside their own swing range) and from `basicAttackFor`.
3. ~~**+7 classes**~~ — **DONE.** `core.ts:CLASSES` carries all 18 (the orphan-pair seven —
   Evoker, Skirmisher, Stalker, Swashbuckler, Shaman, Mystic, Herald — plus the original eleven).
   Generalist is ~3% of the population, down from 18.1%.
4. **`spreadStatus`** (contagion) — the one effect from P2 deliberately left unbuilt; sim it alone.
5. **Move ability geometry onto `Move.area`** and retire the `spatial.ts` side
   table — a move's AoE is currently attached by NAME, so renaming an ability
   silently detaches it and the move quietly becomes single-target. Pure
   refactor, no gameplay change. ⚠️ Two attempts were reverted on scripting
   errors; every trap and exact line number is written up in
   **`docs/HANDOVER_area_consolidation.md`** — read it before starting.
6. **Freeze the goldens.** They moved 22 times in one day during the rework. A golden that moves that
   often is a changelog, not a regression detector — capture once now the pool is stable.

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/town.ts` | GameState, week clock, advanceWeek(), market, lab/breeding, licensing, tournaments, events, rivals, trainer XP |
| `src/game.ts` | Career state, drills/training, applyWeek()/previewWeekEffects(), aptitudes, food math, statCapFor() |
| `src/drills.ts` | The **30** training drills: 6 basic + 12 intensive + 6 extreme + 6 diverse |
| `src/App.tsx` | UI: TownView, RanchView, AbilitySelector, EventModal, saves, migration |
| `src/core.ts` | Types, classes, MoveEffects, Tactics, GAMEPLANS, Rival, foods, RNG, the three ability axes (`statScale`/`mana`/`variance`), `HARD_CONTROL_STATUSES` |
| `src/species.ts` | **65 species** = 13 body types x 5 (30 base + 15 prestige + 20 fusion) + computed BODY_AVERAGES |
| `src/moves.ts` | The **137**-move pool, 23/stat (WIS 22), grouped into 18 lines. `docs/ABILITIES.md` is GENERATED from it (`npx tsx tools/genabilities.ts`); `docs/ABILITY_REWORK.md` is the live design doc |
| `src/lines.ts` | The 18 ability LINES, per-class affinity (`CLASS_LINES`), and `LINE_OF` for every move. ⚠️ The fix for three waves of authored-but-unreachable content |
| `tools/comps.ts` | ⚠️ **The compositions BOTH balance harnesses fight.** One definition, built from `src/teamTemplates.ts`. Each tool used to carry its own copy of ten hand-picked species triples that existed NOWHERE in the game |
| `tools/sweep40.ts` | The balance instrument: 40 matchups over 10 compositions, per-composition + time-to-first-kill. `--noise` reports its own error band. ⚠️ `resolved` is now AT CEILING (sd 0.00) — judge on duration (beat ~2.2s) and first kill |
| `tools/focus.ts` | Damage concentration — top share, targets/5s, healing share. The instrument that refuted P6 |
| `tools/authorranges.ts` | Seeds a per-ability `range` for every move, per LINE. ⚠️ Refuses to overwrite without `--force` |
| `tools/ab.ts` | Paired A/B for balance constants — runs the SAME fights under both settings and judges with a sign test |
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
| `docs/BESTIARY.md` / `docs/ABILITIES.md` | Full lore doc / full move reference (ABILITIES.md is GENERATED — `npx tsx tools/genabilities.ts`, never hand-edit) |
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
