# Monster Tamer — Development Guide

## Balancing principle (standing rule)

**All balancing is iterative: small increments, validated against the long-haul sim,
until we find the right balance.** Never make a big sweeping tuning change in one step —
nudge a value gently, sim it, read the result, adjust again. The sim is the arbiter. See
`docs/BALANCING.md` for the working ledger. This applies to every economy/difficulty/
progression number, always.

## Current state (v0.90)

**v0.90 — the training-tier rebalance + the toolchain fix.** Shipped on top of the v0.89
endgame arc (documented immediately below, still current). Validated against `sim/bot.ts`;
evidence in `docs/BALANCING.md`.

**Four training tiers**, with `diverse` new:

| Tier | Shape | Net | Stamina | net/stam |
|---|---|---|---|---|
| basic | +6 | 6 | **15** (was 10) | 0.40 |
| intensive | +12 / −4 | 8 | 25 | 0.32 |
| **diverse** (NEW) | **+8 / +8** | **16** | **35** | 0.46 |
| extreme | **+24 / −4 / −4** (was +20/−6/−6) | **16** | 35 | 0.46 |

**Diverse and extreme are deliberate MIRRORS** — same net, same cost, opposite shape.
Extreme spikes one stat and pays out of two others; diverse splits the total across a pair
and pays nothing. Neither is stronger; you pick a shape. **Basic is now the LEAST efficient
tier** (0.40 < 0.46), so the safe option is no longer the quietly optimal one and the
manuals buy real throughput. New **📗 Diverse Training Manual, 800g** (`diverseUnlocked`),
priced level with the **📕 Extreme Manual, repriced 1200 → 800g** — siblings, not a ladder.

The six diverse drills: Pilgrim's Burden STR+WIS · The Cannon Crew STR+INT · Trapeze Hours
DEX+CON · Blindfold Forms DEX+WIS · Taking the Fall CON+CHA · Illusionist's Patter INT+CHA.

> ⚠️ **These six are exactly the complement of the 9 `CLASSES` stat-pairs.** That single
> choice gives BOTH properties at once: all off-archetype (0/6 class pairs) AND perfectly
> even coverage (every stat ×2). **Moving any one pair breaks one or both** — rediscovered
> the hard way over ~5 edits. The `src/drills.ts` header records it.

**Food:** Vigor Melon 200 → **90g**, Bliss Berry 250 → **90g**. Both now sit just above the
75g training foods, so a feeding week is a real three-way call: train harder (+30% pair,
−15 stam), recover (+30 stam), or lift mood (+3 happiness, persists). Golden Truffle stays
500g — a cup-day gamble, not weekly upkeep.

**Any drill/manual number shown in the UI must interpolate its constant.** The Extreme
Manual shop copy hardcoded the old `+20/−6` and went stale through the retune; it now reads
`EXTREME_GAIN`/`EXTREME_COST`. Static checks can't catch this class of bug — only a browser
pass did.

**Toolchain:** vite 5 → 8 (see the ✅ note below) — the Cloudflare auto-build works now.

---

## Prior state (v0.89)

**v0.89 — the endgame arc.** Everything below was validated against the rebuilt
full-economy sim bot (`sim/bot.ts`), and the evidence lives in `docs/BALANCING.md`.

**TAMERS APEX — an 11th league (cap 1400)** sits above Tamer Elite, and the top of the
curve steepens to meet it: Gold 700→**750**, Platinum 800→**900**, Masters 900→**1000**,
Tamer Elite 1000→**1200**. Apex is wired through every league-keyed table (pool rewards,
an 8-name cup pool, the annual marquee *The Dynasty Eternal*, 6v6, 5 rival teams,
half-density calendar, 1900g license, excursion ceiling, `validate.ts` probes) and has its
own painted backdrop. Because every gen-1 monster is walled at 700–1100, **an Apex-grade
roster can only come from a bred dynasty** — that is the whole point of the league.

**PRIMEVAL — the prestige fusion** (`Mythical + Draconic/Abyssal`, two recipes → one
class of five: Aeonrex, Stellavore, Chronoshell, Originmage, Worldsong). Roster **65
species**, all with real sprite art. **1.25× potential** and a **1100 gen-1 cap** — the
only gen-1 monster above the Tamer Elite league cap. Element affinity inherits Mythical's
air/earth (all 12 distinct pairs were taken — the one sanctioned `validate.ts` exception).

**The gen-1 cap ladder.** The Market Coach is now a *universal* quality upgrade, lifting
wild AND prestige walls by tier (`statCapFor` reads the coach tier off the synced `wildCap`):

|              | no coach | coach T1 | coach T2 |
|--------------|----------|----------|----------|
| wild/market  | 700      | 800      | 900      |
| Draconic/Abyssal | 800  | 900      | 950      |
| Mythical     | 900      | 950      | 1000     |
| fusion       | 1000 flat | | |
| **Primeval** | **1100 flat** | | |

**The breeding ladder.** The per-generation potential step keys off the line's BEST parent
(`BREED_STEP_BY_TIER`) — wild .10, prestige .11, Mythical .12, fusion .13, **Primeval .15**
— and `breedPotentialV2` bases off `max(parents)` rather than their average, so one
exceptional founder isn't diluted by a modest partner. Ratio the user specified: a wild
line needs FOUR breeding generations to reach ~1.40 potential; a Primeval needs ONE.
(Absolute caps scale with league cap, so the numbers rise at the top — the ORDER is the
invariant.) `BREED_HEAD_START` is 0.30.

**Prestige scarcity.** Licensed prestige stock is a *rare find*, not regular stock:
`PRESTIGE_MARKET_CHANCE` 0.12 lets only 12% of would-be prestige rolls through (measured
33% → 5.3% of offers), survivors carry a 1.5× premium, and the Market Scout —
which deliberately BYPASSES rarity, making it the hunting tool — was trimmed to 12/20%.
Licenses repriced 200/600 → **500/1200**.

**Difficulty.** `RIVAL_BUDGET_STEP` .02→**.03**, `RIVAL_BAND_MIN` .60→**.65**, mid license
costs +10–15%, and `trialChampionMult` is now per-rung: **1.30** Bronze→Gold (mid-game
friction), **1.15** at Tamer Elite/Apex (summit relief — a flat 1.25 compounded with the
climbing budget mult into a literal wall; the sim never once won the TE trial before this).

**⚠️ Rivals do NOT follow the gen-1 cap ladder.** Their strength is
`league cap × rivalBudgetMult(i)` as a TOTAL-stat budget per monster (no per-stat cap at
all) — so raising a league cap raises its whole field automatically. Worth remembering
before touching `LEAGUES`.

**Other v0.89 fixes.** Resume-mid-cup no longer replays fought matches (`resumeOutcomes`
rebuilds the win/loss strip from the committed `MatchOrders` — results are deterministic —
and `doneThrough` is now actually maintained); the Lab shows a **fusion nudge** when you
hold a fusable pair (the sim only started fusing once it earmarked the cost, so a player
needs telling); `BREED_HEAD_START` carries 30% of parents' stats.

**✅ The Cloudflare auto-build is FIXED (vite 5 → 8).** The tree used to carry two esbuilds
— vite@5 pinned 0.21.5 while vitest@4's nested vite wanted ^0.27||^0.28 — and the
deeply-nested duplicate's platform-gated optional deps tripped Cloudflare's pinned
`npm@10.9.2` with `EBADPLATFORM — @esbuild/aix-ppc64`. Upgrading vite realigns it with what
vitest already pulls in: **one hoisted `esbuild@0.28.1`**, wrangler deduped onto it, no
nested copy. `vite.config.ts` needed no changes. Also pins Node (`.node-version` 22.12.0 +
`engines`), since vite 8 needs `^20.19.0 || >=22.12.0` and nothing declared a version.
Green on Cloudflare — see the deploy section. Historical note: the first attempt was a
package.json `overrides` forcing esbuild 0.28.1 under vite@5; that deduped the tree and then
broke vite@5's own `esbuild-transpile` with 124 transform errors. **Upgrade vite, don't pin
esbuild beneath it.**

---

## Prior state (v0.851)

**v0.851 — prestige overhaul + life-stage / career-span tuning.** A multi-step pass
(v0.84 → v0.851) on top of the v0.81 tactics architecture. All of it is **golden-safe
except the one deliberate recapture noted below** — training aptitude, stat caps, life
stages, and aging never touch `simulateTeamBattle`'s RNG.

**Prestige groups reworked (v0.85, `species.ts`/`game.ts`/`core.ts`)** so the
license + rank gate buys a real, distinct creature instead of a worse-than-fusion body:
- **Authored training aptitudes** for all 15 exclusive species — each now has a
  hand-picked `trainingProfile` (major + flaw) *plus a shared group body-minor* added to
  `BODY_MINOR`: **Draconic WIS**, **Abyssal INT**, **Mythical CHA**. No more legacy
  stat-derived fallback (that path in `trainingProfileFor` now only catches future species
  that forget to author one).
- **Gentle / no flaws:** Draconic & Abyssal flaws softened from −20% to a token **−5%**
  (`PRESTIGE_FLAW_PENALTY` in `statTrainingBonus`; no amplified intensive-drill malus
  either). **Mythical carry no flaw at all** (authored major-only). `AptMarks` renders a
  hollow ▽ for the soft flaw and suppresses a minor mark that duplicates the major.
- **Long lifespans:** base `lifespan` values raised so effective **career spans are
  9–12y** (via the existing +2 `pedigreeSpanBonus`), the longest of any monster.
- **Ceiling lifted:** prestige gen-1 stat cap **800 → 1000** (`PRESTIGE_GEN1_CAP`, fusion
  parity) in `statCapFor` — they now reach the full league cap at Masters/Tamer Elite
  instead of walling at 800. Still bound *by* the league cap, so they can't out-scale a
  league's rival field. (The gen1cap tip + "raise the ceiling" help text exclude prestige.)
- **Draconic base-stat parity (v0.851):** Draconic averaged only ~123 total (vs ~133–142
  for every other body — the roster's weakest). Bumped the five to ~132–134 each,
  preserving class/flaw/identity. Abyssal (~132) was already at parity and left alone.
  **This moved two golden battles** (`gold-b1` rolls Pyraxon, `gold-b3` rolls Stormlerath —
  prestige bodies ARE generated by `generateMonster`, unlike fusion bodies) — `1v1-low`
  and `2v2-mid` recaptured deliberately in `battle.test.ts` (2v2-mid flipped B→A). 12/12.

**Life stages (v0.851, `game.ts:stageInfo`):** training multipliers bumped —
**Teen 1.0× → 1.35×**, **Fully Grown 0.95× → 1.15×** (Baby 0.5×, Elder 0.8×, Retiree 0×
unchanged). This is a broad power increase across every monster's whole career and has
**not yet had a long-haul sim pass** — flagged as the next balance task.

**Career span now computed in WEEKS (v0.851):** `stageInfo` derives Elder/Retiree
boundaries from `spanWeeks = round(careerSpanYears × 48)` instead of an integer-year
compare. The old compare rounded any fractional span up to a whole extra year, so one
Comfort item and three gave the *same* retirement. Now each **+8-week** comfort/tonic
purchase (`COMFORT_WEEKS_PER_ITEM`/`TONIC_WEEKS`) delays aging by exactly its weeks, and
the added weeks all land in the **Fully Grown** adult phase (Elder is a fixed final-year
window that just slides later). Baby/Teen stay pinned to whole years.

**v0.84 — post-fight Match Analysis + Battle Analyst + economy tweaks.**
- **📋 Match analysis** card on the between-match bracket hub AND the results screen
  (`MatchAnalysis` in `App.tsx`, over `battleReport.analyzeBattle`): turning point,
  tactic ✓/✗, key moments — free. Hiring the **🔎 Battle Analyst** (500g, Ranch Shop,
  `battleAnalyst`/`buyBattleAnalyst`) adds the opponent's gameplan counter-read + 1–3
  concrete tips (`battleReport.battleAdvice`).
- **Live round-robin standings** grid on the bracket hub (rebuilt deterministically,
  revealed through the player's last match). Tournament **calendar is always-on** (the
  toggle was removed).
- Economy: **≥2 cups/month** guaranteed (`tournamentCalendarFor` filler + a `validate.ts`
  assertion), **rank-up trial pays 50% of a league cup** (`finalizeTrial` goldReward),
  **cup entry fee removed** (free to enter), and the **Rival Challenge event shows a rough
  win-chance** (`challengeWinChance`).

---

## Prior state (v0.81)

**v0.81 — per-fight tactics + deferred, interactive tournament resolution.**
Tactics are no longer a monster's standing trait — they're chosen **fresh before each
battle the player fights**, exactly like abilities are chosen before a tournament. The
standing-orders `<details>` panel is **gone from the Stables** (`TacticsControls` was
extracted and now lives only on the new pre-fight screen and the Sandbox lab editor).

The enabling change is architectural: the whole tournament used to be simulated **up
front** inside `advanceWeek` (`resolveTournament`/`resolveTrial`), and the battle screen
merely **replayed** a finished `lastBattle`. Now `advanceWeek` only **stages** the event
(`stageCup`/`stageTrial` → `GameState.activeCup`, a serializable in-flight event carrying
the fielded ids + the generated rival teams). The `'battle'` phase fights it **match by
match**: `preamble → bracket (scout) → tactics → fight (simulated live) → … → finalize`.
Each player match is simulated at the moment its `MatchOrders` are committed, so tactics
genuinely decide the outcome. `finalizeCup`/`finalizeTrial` (called from the UI when the
last match ends) score standings, rewards, injury, exp, trainer XP, the seated-rival
head-to-head, and license unlock — the tail of the old resolvers, moved out of the tick.

**Expanded tactic set (same v0.81 cycle):** three new coach-level orders on
`TacticsControls`, all opt-in and golden-safe (default off): **opening sequence**
(`Tactics.openerIds` — up to 2 scripted first plays, replacing the single
`openerId`; the engine tracks an `openerQueue`), **survival** (`Tactics.preserve`
— below 40%/25% HP the monster guards incoming hits and drops self-harm/recoil
moves), and **control-first** (`Tactics.ccPriority` — leads with a hard CC status
(stun/sleep/silence/…) before committing to damage; gated on having a control
move equipped). Each verified to change the battle log in a differential sim.

**Why goldens don't move:** `simulateTeamBattle` seeds its RNG purely from monster seeds
(`battle.ts`), so a matchup is a pure function of (monsters + their tactics) — the engine
is untouched, and a scratch sim confirmed two different `MatchOrders` for the same matchup
produce different battle logs (tactics bite). 12/12 tests still green. `MatchOrders`
(per-member `Tactics` + formation row order + protect + mark) and `ActiveCup` live in
`core.ts`; the old `setTactics`/`setProtectTarget`/`setMarkTarget` and the sign-up
protect/mark pickers are removed (those orders are now picked per fight). Applies to **all
player fights** — team cups, 1v1 cups, and rank-up trials. A staged event is persisted, so
a reload mid-cup resumes (migration routes `activeCup` saves to the ranch). Browser-verified
end-to-end: an Iron 3v3 cup fought match-by-match, finished 1st/4, +494g, `activeCup`
cleared.

---

## Prior state (v0.80)

**v0.80 — per-move battle animations (hybrid) + Bastion rename.** The 1v1 arena
(`arena.tsx`, shown in Sandbox + Wood/Copper) now animates each ability distinctly.
The design is a **hybrid**: shared base motions for moves that legitimately look alike
(every fireball, every arrow) + **bespoke motions** hand-assigned to ~28 distinctive
moves via `BESPOKE_KIND` (keyed by move NAME — the acting Move is recovered from the
caster's loadout by name, since names are unique within a loadout): `slam` (heavy
crash — Titanfall/Colossus Crash/World Ender/…), `guillotine` (Executioner/Showstopper),
`flurry` (rapid multi-slash), `beam` (pierce line — Snipe/Deadeye/Void Lance/…), `volley`
(Rain of Arrows/Needle Storm), `chain` (Static Chain), `cage` (Glacial Prison/Deep
Freeze), `firewall` (Inferno), `notes` (song buffs). On TOP of the base, a **composite
overlay layer** (`fxForMove`/`utilityFx`) adds a per-effect tell driven off the Move's
fields — `exec` flash, lifesteal `tether`, `manaburn`, `crater`, `shield`/`thorns`/`heal`/
`cleanse`, buff `aura-*` — plus a themed **status puff** (the STATUS_ICON emoji) over the
afflicted monster on every `status` event. All presentation-only: goldens unmoved. The
team-battle (>1) compact tile presentation is unchanged. Every new class verified bound to
a real keyframe. `respects prefers-reduced-motion`.
Also: the self-ward CON move **`Bulwark` → `Bastion`** (distinct from `Bulwark's Challenge`
the mass-taunt, and the `bulwark` rival GAMEPLAN which is unrelated and stays). Move ids
are positional (`CON-6`), not name-derived, so loadouts/goldens were unaffected.

---

## Prior state (v0.79)

**v0.79 — painted area backdrops.** Eight new full-bleed scene paintings, one per
screen: **Town** (village square at dusk), **Market** (beast bazaar), **Ranch Shop**
(tack-and-tonics store interior), **Stables** (training yard), **Breeding Ranch**
(paddocks + hatchery), **Hall of Fame** (marble gallery of champion statues), **Lab**
(cryo-stasis chamber), **Title** (tamer + dragon overlooking the valley). Same
painterly matte-painting look, 1400×788 JPEG, as the 10 league arena backdrops —
`src/areaArt.ts` mirrors `leagueArt.ts`. Distinct palettes double as navigation: the
Lab's icy cyan vs the Breeding Ranch's pastoral green tells you instantly which
preservation screen you're on.
**Legibility:** these sit behind dense admin UI, so `.areabg` is a `position: fixed`
layer under a **theme-aware scrim** (night `rgba(18,20,28,.80→.95)`, day
`rgba(243,245,250,.82→.95)`); cards stay fully opaque — and it MUST be `z-index: -1`
(at 0 a positioned element paints above all static content; the scrim buried every
button on the live site, see the deploy section's verification note). Each view mounts
its own backdrop (fixed positioning means no state lifting); the arena stands down
during battles since it paints its own league backdrop. Art total 3.4MB.

**Post-v0.79 fix passes (same day, shipped as fix commits):**
- **Desktop UX audit** — `.hubbtn`/`.ev-choice`/`.forage-option` set their own panel
  background but inherited `--btn-ink` (text-on-accent) → near-invisible labels; all set
  `color: var(--ink)` explicitly now. Any new button style that overrides `background`
  MUST also set `color`. Day-theme `--btn-ink` is near-black (white on `#0fb488` was
  2.7:1, AA fail). Feeding queue now iterates ACTIVE monsters only (Hall of Fame
  retirees were adding a weekly feeding click + food bill each, forever). Range sliders
  styled with a 24px hit area.
- **Mobile audit (375px)** — `.arena` stacks to one column ≤720px (the two sandbox team
  cards forced 631px page width); theme toggle is icon-only ≤560px (`.tt-label` hidden)
  with `h1` padding to clear it; `.stablescreen` bottom padding 88px so the fixed rail
  can't cover the last row (tactics "Conserve" was unclickable).
- **Tutorial rewrite** — welcome banner now teaches the real loop (weekly tick, cups +
  rank-up licenses, freeze-before-retirement, gen-1 ceiling); five new one-shot
  `TipBanner`s (ids: `market`, `lab`, `breeding`, `hof`, plus conditional `freezewindow`
  — fires at first Elder with freezer room — and `gen1cap` — fires when a gen-1 monster
  nears its `wildCap`, tested against the wall itself, NOT `wall < leagueCap`, which is
  false at Platinum where they're equal). Tips gate on `tutorialEnabled` + `tipsSeen`.

---

## Prior state (v0.78)

**v0.78 — the Lab freezer is the single preservation mechanism.** The stud farm is
**gone**. `breed()` and `fuse()` both draw from `labFrozen`, and `freezeToLab()` now
**refuses retired monsters** — you must commit a monster to the freezer *before* its career
ends. Let it age out and it retires to the Hall of Fame (honours only) and the line is
closed. That is the core dynasty decision now: **freeze early** (bank the genome at peak,
sacrifice the remaining competing years, occupy a limited Lab slot) **vs compete to the end**
(full career, cups, trainer XP — but no bloodline). Stud Book moved onto lab-frozen monsters;
`Career` gained `breedCount`/`studBook`. Old saves migrate their banked studs into the
freezer with `labSlots` widened to fit, so no bloodline is lost.
**Lab repriced** from luxury to core infrastructure: `LAB_SLOTS_BASE` 2→**3**, expansions
400/800/1600→**250/500/900**, upkeep 5→**3g/wk** (lab-tech loan 3→2). The Lab UI now also
lists the fusion pairs, which were previously invisible.
**Result (25y × 3 seeds):** good player TE/Platinum/Gold, **6 breeds**, and **generation 3 on
two of three seeds** — the deepest dynasties any sim has produced (previously always gen 2).
More variable than the old retire→stud path; see `docs/BALANCING.md`.

---

## Prior state (v0.77)

**v0.77 — economy correction + market systems + gen-1 caps.** The retiree **pension is
gone** (it was 45% of all income, perpetual and cumulative); the Retirement Ranch is now the
**🏛 Hall of Fame** — honours only, **unlimited room**, and retirees no longer occupy barn
slots. **Trainer stipend capped** at 1g/level, flat from LV15 (15g/wk). Cup gold +8%.
Result: cups went from 7% → ~81% of a good player's income; an average player's end gold
fell from ~180k to ~3–15k. **Gen-1 training ceilings**: wild/market **800** (→900/1000 via
the two Market Coach tiers), **fusion gen-1 1000**, bred gen-2+ `leagueCap × potential`.
**Monster-market upgrades**: Market Slots (50/100/150 → 3 to 6 offers), **Market Scout**
(350g, 15%/slot; +500g → 25% and a 2nd species pick), **Market Coach** (Gold: 300g Tin-band
stock +100g each; Platinum: 750g Iron-band +250g each). Prestige licences now **actually
enforce rank** (Special 200g @ Iron, Elite 600g @ Platinum — previously the requirement was
copy only); the stray event can no longer roll a prestige body. Rival budget escalates
gently by league (`1.8 + i×0.02`). Day/night theme toggle on every screen. See
`docs/BALANCING.md` for the full evidence.

---

## Prior state (v0.7)

**v0.7 — Fusion system + 15 fusion species (2026-07-23):** the 🧪 Lab is now a real
**stasis freezer** (`labFrozen`/`labSlots`, expandable from the Ranch Shop), SEPARATE
from the Breeding Ranch stud farm (the old `labCapacity` was renamed `studSlots`).
Freeze any active monster to pause its aging (e.g. until you can afford an Elder Tonic,
which now works on frozen monsters); **fuse** two lab-frozen monsters of a valid
BODY-TYPE pair into a brand-new **fusion species**. Fusion: 1000g, both consumed, all
stats start at **100**; aptitude is INHERITED per-monster (+20% on each parent's
training major) plus a rolled +10% minor / −10% flaw; the species (which of the class's
5) is a **spinning wheel**; potential **×1.075 (1½★)**, gen-1 **Platinum-capped** then
fully breedable (gen-2 ≈3★ → Tamer Elite). **15 new fusion species across 3 classes**
(`docs/FUSION_DESIGN.md`): **Saurian** (Mammal+Reptilian, earth/air), **Tempestine**
(Avian+Aquatic, air/fire), **Broodkin** (Marsupial+Insectoid, water/earth) — each 5
species, aptitude-neutral shells (`trainingProfile {}`), 30 unique innates, real
generated sprite art (via Codex image-gen, `image-gen-codex` skill). Fusion bodies are
excluded from wild/market generation (`generateMonster`), keeping goldens byte-exact.
**Roster: 60 species.**

---

## Prior state (v0.62)

**v0.62 — economy pass + Town hub (2026-07-23):** the big economy rebalance plus a
Town navigation restructure. Economy (see `docs/ECONOMY_FINDINGS.md` for the sim
evidence that drove it): cup roster **stipend** (+20g/extra member), league team-size
redistribution (Iron 4v4→3v3, Gold 5v5→4v4 — perfect pairs), retiree **pension**
(2 +1/podium +2/champ, cap 10g/wk), freeze = **retirees only** + limited lab slots
(2, expand 400/800/1600) + upkeep 8→5(→3 via lab-tech loan event), **comfort set**
(stable-wide +2mo career span each: 300/500/1000), **Mysterious Peddler** event (the
only source of training gear — 6 stat lines ×5 tiers 200/500/750/1000/1250 with a
reveal chain; Elder Tonic 500g; Stud Book 750g uncapped stud income), **extreme
drills** (+20/−6/−6, 1500g manual), **breeding** (two frozen legacies → child, parents
preserved ≤2 each, potential avg+10%+champ bonus cap 1.5, 35% head start, heritage
stat, Gen ★), **stray-monster** soft-lock backstop, "career span" rename. Town is now
a **hub of location buttons** (🛒 Market · 🏟 Stables · 🐎 Breeding Ranch · 🏡 Retirement
Ranch · 🧪 Lab), each a focused sub-screen; new games still open in the Market. The
🧪 Lab is a placeholder for the upcoming **fusion** system (`docs/FUSION_DESIGN.md`:
15 new fusion species across 3 classes — NOT yet built).

---

## Prior state (v0.5)

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
premium tiers, satiety, forage fallback when <10g, two-stage discount contracts); the five
`docs/LOOP_DESIGN.md` phases: **events**, **rivals** (named, rubber-banded, challenge skirmishes),
**rival gameplans + scouting reveal**, **causal battle report**, and **meta-progression** (trainer
level + bloodline breeding where `potential` lifts the stat cap and climbs each generation).

**v0.5 also ships the sim-driven COMBAT BALANCE PASS (2026-07-22, ~2,500 battles measured):**
sudden-death chip is now **%-of-max-HP** (8% +5%/rd from rd 35 — flat chip let raw HP auto-win
the clock, double-dipping CON; the 3v3 golden went draw→decisive); **turn order = highest DEX
first** (replaces CON-ascending; symmetric tiebreak killed the old side-A bias that flipped ~1
in 5 mirror matchups); **WIS is the caster foundation** (+WIS×0.6 to magic/voice damage — was a
dead stat at 0% win); `maxHp = 40 + CON×2.0` (was 50+2.5), CON melee mitigation 0.05→0.04;
**`RIVAL_BUDGET_MULT` 3.5→1.8** (was: every rival had 3-4 stats near cap, unreachable in a
lifespan — a just-ranked player placed LAST 100% at Iron+; now a dedicated player is competitive
at every league). Results: draws 10→4%, Tank 71→52%, Wizard 49→62%, Bard/Orator strong in teams
(a support 3rd now beats a 3rd Warrior in 3v3), all four battle goldens deliberately recaptured.

**v0.5 — per-player licensing + trial battles + compete-as-action (2026-07-22):**
- **The license belongs to the TRAINER** (`GameState.licenseIndex`), not the monster — recruits/
  thaws/babies join at the player's tier; every stable `Career.licenseIndex` is kept SYNCED to it
  (the one invariant, enforced at every career-creation funnel + `buyLicense` + migration), so the
  many per-career consumers (stat caps, fees, exp clamps) work unchanged. The guest-leader rule is
  obsolete and removed from sign-up.
- **Rank-up = win an on-demand TRIAL BATTLE, then BUY the license.** `startTrial` (Ranch panel)
  sets a champion fight vs a hard same-league team (`TRIAL_CHAMPION_MULT` 1.25× of cap ×
  `RIVAL_BUDGET_MULT` — sim-tuned: a just-ready single-stat monster wins ~38%, a capped one ~63%);
  resolves in `advanceWeek` (mutually exclusive with a cup — one arena event per week); win →
  license unlocks in the Ranch Shop (`licenseEarned`), lose → 3-week cooldown; standard injury
  either way. `LICENSE_COSTS` = 0/50/120/220/350/520/750/1000/1300/1650 (~i^1.5, validator-checked
  monotonic + never-doubling). Trials are DE-CALENDARIZED (RANK_UP_MONTHS/isRankUpWeek/
  promoteMonster/rankUp all gone; calendar week-4 reservation removed).
- **Competing IS the weekly action**: cup/trial monsters get `{kind:'compete'}` forced in
  advanceWeek (no training/rest that week), plans lock to 'compete' at signUp/startTrial and free
  on cancel; training row shows a lock banner.
- **Punch-down steepened**: 2+ leagues below now pays 10% (was 20%).
- **Named rival seated in cups**: `seatedRivalTeamIndex` — ~1/3 of at-league cups, GUARANTEED at
  marquee events; the seated team runs the rival's personality gameplan
  (`RIVAL_PERSONALITY_GAMEPLAN`), the scout panel shows "🥊 {name}'s Team · record", and the
  player-vs-rival cup result moves the head-to-head.
- Sign-up gained an **underpowered-team warning** (below the league band) and a competing-week
  notice. Browser-verified E2E: trial → victory → shop unlock → buy (−50g) → account at Copper →
  Tin gate at 120g. Old saves migrate (player license = max of old per-career licenses).

### Deploying
**Git-triggered auto-deploy WORKS as of the vite 8 migration (2026-07-26).** Push to `main`
and Cloudflare builds and ships it. The long-standing `EBADPLATFORM — @esbuild/aix-ppc64`
failure was the duplicate-esbuild bug described in the v0.89 section; the tree now resolves to
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

### ⚠️ Verifying visual changes without screenshots
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
