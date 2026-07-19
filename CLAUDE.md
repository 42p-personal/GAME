# Monster Tamer — Development Guide

## Handover state (2026-07-20)

**Everything below is COMMITTED and shipped as v0.21** — committed on `preview`, merged to
`main`, and pushed (Cloudflare Pages auto-deploys `main`). The "What changed this session" list
below is the change history for that release, newest first.

One caveat carried forward: the item marked **UNTESTED** below (the 2026-07-20 formula tuning
pass) was only compile-checked at the user's direction ("do not do any more testing") and then
shipped as part of the broader user-approved release — every OTHER item was sim/browser-verified
individually. If battle balance feels off in play, that pass plus the later damage-halving and
CON/turn-order changes are the tuning knobs to revisit.

### What changed this session, newest first

-5. **UI overhaul (2026-07-21, full review implemented, live-verified at desktop + mobile):**
    - **Default-rest bug FIXED** (`town.ts:advanceWeek`): a monster with no plan now genuinely
      RESTS (the UI had always promised "This week's plan — Rest" with exact heal numbers, but
      the engine silently did nothing — no stamina/HP/MP recovery). Strip chip reworded to
      "😴 rest (no plan set)". Verified live: two unplanned monsters healed +57/+64 HP.
    - **"Last week" digest** (`GameState.lastWeek`, built in advanceWeek from before/after
      deltas): per-monster activity + stat/HP/MP/stamina changes + tournament placement, shown
      once at the top of the next feeding screen. No more results buried in per-monster logs.
    - **Persistent status strip on the stable screen** (date · gold · signed-up event) — gold was
      previously invisible exactly where entry/rank-up fees get paid.
    - **Injury visibility everywhere**: HP bars turn amber (<60%) / red (<25%) with a 🩹 marker
      (`hpBarColor`/`isInjured` in App.tsx); stable strip cards get 🩹 injured and ⭐ trial-ready
      chips; the sign-up select shows condition inline ("Kyak (Tin) · 🩹 1/130 HP"); TeamPicker
      pool rows show class · role · league · injury/fatigue; and both sign-up branches warn in
      red when an injured monster is about to ENTER a fight. Also fixed: 1v1 sign-up warnings now
      render for the DEFAULT dropdown selection (previously only after the player touched it).
    - **Calendar**: every league row shows its team size ("Tin 2v2"), plus an icon legend
      (🏆 open · ✅ signed · ✔ competed · ➖ missed · ⭐ trials).
    - **Feeding screen slimmed**: compact card (species·class / stage·age·league header, sprite,
      food preferences, condition meters) — the full stat/innate/loadout dump is gone from the
      feeding decision, along with the duplicate date.
    - **Pre-flight rail note** under Advance Week: 💪N 😴N (🧭N) + "🏟 entered" so the weekly
      commit is never blind.
    - **Stable detail** gained the stage · age · league line (lifespan was invisible outside
      feeding).
    - **Element badges** (🔥💧⛰️💨) on move names in the AbilitySelector slots/pool and
      MonsterCard loadouts — elements were invisible during loadout building.
    - **Arena**: fx cleared on the end event (no more frozen projectile after a fight); the raw
      sim transcript is now a collapsible section INSIDE ArenaBattle (appears when the replay
      finishes, richer than the captions) — sandbox's separate BattleLog reduced to its clear
      button, and tournament battles gained the transcript for free.
    - **Mobile (<820px)**: the action rail is a fixed bottom bar (Advance Week no longer needs a
      full-page scroll); malus chips no longer wrap mid-chip; Sign Up button normalized from the
      full-width slab (`button.signup`).

-4. **Class-driven combat + fair fixed-standard tournaments + economy/care/UX pass (2026-07-21)**
    — the "review recommendations" implementation, all sim-verified (38 scratch assertions) and
    live-checked in the browser:
    - **Leagues are a FIXED standard now** (user-confirmed): rival teams no longer scale to the
      player. Each rival team rolls its strength in a 60-100% band of the league budget
      (cap × 3.5) from the event seed (`town.ts:RIVAL_BAND_MIN/MAX`) — a fresh entrant faces the
      weak end of genuine league competition and grows into, then out of, each cup. Verified:
      identical rival stats for a weak vs strong player team at the same event. Replaces the old
      `min(playerTotal, budget)` rubber-banding.
    - **Rival teams are role-composed** (user spec): `compositionTemplate` — even sizes split
      damage/support 50/50, odd sizes lean damage (3v3 → 2D/1S, 5v5 → 3D/2S). Roles per class in
      `core.ts:CLASS_ROLES` (Tank/Spellshield/Sage/Orator/Bard = support, rest = damage;
      Generalist counts damage). `generateRivalMonster` rejects candidates whose TRAINED class
      doesn't match its slot's role (50 tries, then first legal candidate).
    - **Class-aware loadouts** (`monster.ts:chooseLoadout(learned, stats?)`) — the "NPC picks
      skills to match its play style" piece, also applied to the player's auto-pick fallback:
      damage moves are ranked by what the monster's stats actually drive (power × the battle
      sim's own (atk/40)^0.8 curve per channel), and support classes reserve up to 2 slots for
      signature utility (Tank: taunt + ward/guard; Sage: heal + cleanse/regen; Bard/Orator: team
      buff + enemy debuff; Spellshield: ward + heal), falling through to damage when not yet
      learned. Verified: Tank auto-packs Taunt+Fortify, Sage packs Tranquility+Attunement, Bard
      packs Anthem/Rallying Song.
    - **Class battle personalities** (`battle.ts:CLASS_PERSONALITY`): one shared chooseAction
      policy tree, tuned per class — Tanks shield early/block often/taunt (blockWhenHurt 75),
      Sages heal at 65% HP, Wizards chain spells and block-to-charge (80) instead of parrying,
      Rogues/Warriors just keep swinging (aggro −4), Bards/Orators open with the band. Keyed off
      className = current stats at fight time. Verified: Tank blocked 309× vs Rogue's 92× across
      15 identical fights. NOTE: this deliberately changes 1v1 battle outcomes vs the previous
      engine (no more golden-output compatibility — user-directed gameplay change).
    - **Taunt is LIVE** (`Combatant.tauntedBy`): tauntForce moves force the target's
      single-target hostile actions onto the taunter for the move's duration (ticked with mods,
      broken if the taunter falls; precedence: confusion > taunt > lowest-HP% pick). This is the
      counterweight to CON-ascending turn order — tanks act last but redirect damage into their
      HP pool. Verified: a taunted foe repeatedly hit the 400-CON tank over a 10-CON glass ally.
    - **Symmetric round-robin** (`town.ts:roundRobinSchedule`, circle method): every participant
      plays once per scheduling round, and EVERY team (rivals included) carries its end-of-match
      HP/MP into its next match — fixes the old player-fights-everyone-first-while-rivals-stay-
      fresh unfairness. Match records keep as-entered state so arena replays are correct.
    - **Entry fees** (`town.ts:entryFee` = (leagueIndex+1)×10g): paid at sign-up, refunded on
      cancel, kept when the event resolves; sign-up refused when unaffordable
      (`PendingTournament.feePaid`, migrated in loadSavedGame). First recurring gold sink;
      makes punching down a real cost/benefit call.
    - **Player-monster tameness from care** (`careerMonster`): tameness = 90 + happiness — a
      pampered monster (10) never misbehaves, a neglected one (0) has a 10% chance per turn of a
      random battle action via the existing wildAction path. Hidden stat, same as rivals'.
    - **Week plans persist** (`GameState.weekPlans`): plans survive navigating to Town and back,
      and reloads — previously component state that silently reset. `advanceWeek(g)` now
      consumes `g.weekPlans` directly (optional override param kept) and carries activities
      forward itself.
    - **Save-migration bug fixed**: pre-team saves carrying a live `pendingTournament.monsterId`
      (singular) crashed `.monsterIds` accesses on load; `loadSavedGame` now drops stale
      sign-ups, converts old 'champion'/'none' history to numeric placements, and defaults
      `feePaid`/`weekPlans`.
    - **Not yet built from the review** (each needs its own design/UI pass): consumable items +
      champion drops, Hall of Fame, pre-event scouting, feeding-phase bulk UX, App.tsx split,
      previewWeekEffects/applyWeek dedup. The review also flagged: `maxMana = WIS` starves
      INT-primary/non-WIS classes (Spellsword/Ranger) of the chain-caster identity; `knockback`
      status exists but no move applies it; turn-order "recomputed per round" only matters once
      something can shift CON mid-fight.

-3. **Turn order now runs off CON, not DEX — lowest CON acts first (2026-07-21).** Light/low-CON
    builds are fast; bulky/high-CON tanks are slow. This flips CON from a pure defensive stat
    (more HP, more mitigation, more HP regen) into a genuine risk/reward stat — trading toughness
    for going first is now a real archetype. `battle.ts:turnOrderCompare` sorts ascending by CON
    (was descending DEX), ties fall back to DEX descending (confirmed: DEX keeps a supporting
    role, not removed from turn order entirely), then side A-before-B, then roster slot. Turn
    order was ALREADY a single shared list across both teams each round, not team-blocked (a
    factual correction to the user's premise, not a structural change) — this is a one-line swap
    of the sort key, verified to still interleave freely across teams by CON exactly as before by
    DEX.
    - **CON generation floor loosened to match**: the 45%-of-league-cap floor added earlier this
      session (`monster.ts:boostConstitution`) was fighting directly against "low CON should be
      common and achievable" now that it has a real upside. Target dropped 45%→**15%** of league
      cap, pull strength dropped from 25-60% of the gap to **10-30%** — it's now a thin safety net
      against truly degenerate rolls, not a population-average target. Confirmed via the exact
      Ashryn (Abyssal squid) case documented earlier: CON that the OLD floor boosted 136→205 now
      stays at its natural **136** (19.4% of Gold's cap) since that's already above the new,
      much-lower floor.

-2. **Sandbox: multi-fighter teams + per-fighter ability editing (2026-07-21), v0.2.**
    Sandbox now builds on the NvN engine below rather than staying hardcoded 1v1: each side is a
    `FighterSlot[]` (`App.tsx`), "+ Add Fighter" appends up to `SANDBOX_MAX_TEAM = 6` per side
    (matching the tournament ceiling), each fighter card gets a "✕ remove" once its team has >1
    member, and Auto-Battle now calls `simulateTeamBattle(monstersA, monstersB, ...)` — the same
    roster-tile arena from team tournaments renders automatically once either side exceeds 1
    fighter, while a strict 1v1 sandbox match still gets the original lunge/projectile
    choreography (the arena's existing size-gating just works, unchanged).
    - **`AbilitySelector` was generalized** from `{career: Career}` to `{m: Monster, name: string}`
      so it works for a plain Sandbox `Monster` (no Career/persistence) as well as the Ranch's
      Career-backed monsters — same component, same slot-click/pool-click UX, both call sites
      updated. A `FighterSlot.loadout: string[] | null` override (null = auto-pick) is applied in
      `buildSandboxMonster` before the fight, exactly mirroring how `careerMonster` resolves a
      persisted loadout.
    - Removing a fighter or adding one clears any stale `result` (a battle result's event stream
      references specific roster slots — keeping it around after the roster shape changes would
      desync the arena). Editing a fighter's seed/train/happiness in place does NOT clear it,
      matching the pre-existing 1v1 sandbox convention (stale-until-you-rerun).
    - Live-verified: added a 2nd Team-A fighter, edited its loadout (swapped a move, confirmed it
      persisted), ran a 2v1 battle end-to-end in the roster-tile arena, then removed the fighter
      and confirmed the team cleanly reverted to 1v1 with the edited loadout intact.
    - `APP_VERSION` bumped `0.1` → `0.2` (`src/version.ts`) — first version bump since the
      tournament economy work; this session's team-battle overhaul is the natural line to draw it.

-1. **NvN team tournament battles (2026-07-21) — the largest feature built this session, fully
    live-verified end-to-end.** Tournaments are no longer 1-monster-vs-1-rival: each league fields
    a TEAM (Wood/Copper 1v1, Tin/Bronze/Iron 2v2/3v3/3v3, Silver/Gold 4v4, Platinum 5v5,
    Masters/Tamer Elite 6v6 — `town.ts:TEAM_SIZE_BY_LEAGUE`), and every event is a round-robin
    among the player's team + 3-5 generated rival teams (`RIVAL_TEAM_COUNT_BY_LEAGUE`, tunable —
    exact per-league boundaries were the user's own judgment call, not fully specified). Built via
    a written, user-approved plan (`C:\Users\P\.claude\plans\agile-conjuring-sphinx.md`) across 7
    milestones, each verified in isolation (golden-output regression + synthetic scratch sims)
    before the next began.
    - **`battle.ts` is now a genuine simultaneous N-vs-N engine**, not 1v1 with a wrapper bolted
      on. `Combatant` gained `slot` (roster position) and `wasKOd`; a new `BattleContext` flattens
      both teams for `enemiesOf`/`alliesOf`/target-picking helpers. Turn order is ONE shared
      initiative list across BOTH teams each round (fastest current DEX first, recomputed every
      round — not a fixed "team A block, then team B block"). `resolveTargets` is the crux: `'enemy'`
      picks the lowest-HP% living foe, `'allEnemies'` fans out to every living foe (each with its
      OWN independent accuracy/variance/crit/mitigation roll — never one roll × N), `'ally'` picks
      the neediest living ally and falls back to self on a solo team (preserves Wood/Copper exactly),
      `'team'` hits the caster + every living ally. This is what actually activates the 19 moves
      (13 `allEnemies`, 5 `team`, 1 `ally`) that were silently collapsing to self-only in the old
      1v1 engine — see the per-stat design philosophy in `docs/ABILITIES.md`. `BattleEvent` gained
      `slot`/`targetSide`/`targetSlot` on every relevant variant; the `snap` event became an array
      (`states: {side,slot,hp,mana,ward}[]`) instead of 6 hardcoded scalar fields. `BattleResult.finals`
      (was `aFinal`/`bFinal`) is now one entry per combatant on both teams, each tagged `wasKOd` —
      this is what lets the injury system work per-INDIVIDUAL instead of per-whole-team.
      `simulateTeamBattle(teamA: Monster[], teamB: Monster[], ...)` is the new engine;
      `simulateBattle(a, b, ...)` is now a 2-line wrapper (`simulateTeamBattle([a],[b],...)`) — zero
      call-site churn for Sandbox. **Regression-verified byte-exact** against golden 1v1 output
      captured before the rewrite (winner/events/finals identical across 5 seeded matchups
      including a confusion edge case) — see `tauntForce` note below for the one deliberate,
      documented behavior change.
    - **`town.ts:resolveTournament`** is a full rewrite: builds the player's team + N rival teams
      (`generateRivalTeam`, each member scaled independently via the same budget logic as before),
      simulates EVERY pairwise match (including rival-vs-rival — needed for genuine standings,
      computationally trivial), tracks win/draw/loss + summed HP-fraction per participant, sorts
      into placement. Reward = `placementRewardFraction(placement)` (`{1:100%, 2:65%, 3:40%, 4+:0%}`)
      × the existing league-punch-down `rewardMultiplier` (now keyed off the TEAM's minimum
      licenseIndex — a mixed-league roster is judged by its least-decorated member). **Per-member
      injury, not per-team**: each of the player's own monsters that was EVER KO'd across any of
      its matches that week comes home at 1 HP/1 MP regardless of the team's final placement;
      survivors carry forward whatever HP/MP their last match left them at. **Team members do NOT
      heal between matches within the same event** — deliberate, verified live (a monster KO'd in
      match 1 entered match 2 already dead) — this is what makes roster depth matter, not just
      raw power. `PendingTournament.monsterIds: string[]` (was single `monsterId`); `LastBattle`
      is now event-shaped (`matches: EventMatch[]`, `standings: EventStanding[]`, `playerPlacement`,
      `fieldSize`) instead of one opponent pair. `Career.tournamentHistory`'s `TournamentResult`
      gained a numeric `placement` + `fieldSize` (was binary `'champion'|'none'`).
    - **`App.tsx`**: new `TeamPicker` component (click-a-slot-then-a-pool-monster, same convention
      as `AbilitySelector`) replaces the single `<select>` for team size >1 leagues; Wood/Copper
      keep the original single-select UX untouched. The battle screen now steps through the
      player's own matches one at a time via `ArenaBattle` (`key={matchIdx}` forces a clean
      remount per match), shows rival-vs-rival results as plain text (not replayed), then a
      standings table + placement + reward summary.
    - **`arena.tsx`**: `ArenaBattle` takes `teamA`/`teamB: Monster[]` instead of `a`/`b`. Gated on
      team size, NOT universally simplified: exactly-1v1 (Wood/Copper, Sandbox) keeps the original
      lunge/projectile choreography completely unchanged, byte-for-byte layout; team size >1 gets a
      new compact roster-row presentation (small sprite tiles with mini HP/MP bars, dimmed on KO, a
      shared pulse highlight on the acting tile, floating numbers over the correct target tile) —
      full per-monster traversal animation doesn't stay legible past 2 fighters, so this leans on
      the existing scrolling turn-by-turn `.arena-log` for detailed narration instead.
    - **Judgment calls made and documented, not re-litigated** (all easily tunable): rival teams
      always fight fresh, never persisting injuries between their own matches; every fielded
      member gets the FULL training-reward formula independently on a qualifying finish, not a
      split pool; a multi-target opening move's `firstHitMult` bonus applies to every target it
      hits, computed once before the fan-out loop; `tauntForce` stays inert (needs its own small
      forced-targeting design as a follow-on, not bundled into an already-huge feature) — this is
      the one deliberate behavior change from the 1v1 engine (confusion's redirect-to-self only
      applies to single-target `'enemy'` casts now, not `'allEnemies'` volleys, since "confusion
      cancels a whole volley" was never specified either way).
    - **Live-verified end-to-end in the browser**, not just scratch sims: built a 2-monster Tin-
      league test save, signed up a 2v2 team via `TeamPicker`, watched all 3 of the player's
      matches animate correctly (KO'd teammate visibly dimmed and carried into the next match
      still dead, a team entering fully wiped resolves instantly without hanging), confirmed the
      4-team standings table, correct tie-breaking, 0g reward at 4th place, and the Tournament
      History panel showing "4th of 4."

0. **Plan-benefit preview + tournament renaming (2026-07-19, browser-verified):**
   - Feeding screen now shows THE PLANNED ACTION'S BENEFIT while picking food (`PlanBenefit` in
     `App.tsx`): training → per-stat bar going current → new (e.g. CON 69 → 75) with the exact
     happiness-weighted roll; rest → exact stamina gain; excursion → the flat gold purse. Gains
     render WHITE, maluses render BLACK (user rule) — black text sits on a light chip
     (`.benefit-malus` in `styles.css`) to stay readable on the dark theme.
   - `previewWeekEffects` (`game.ts`) extended with `staminaDelta`/`goldDelta`, mirroring
     `applyWeek`'s rng exactly for rest (30–100 roll, capped) and excursion (30–80g purse) —
     previews are exact, not estimates.
   - Week plan's ACTIVITY now carries forward into the next week (food still resets weekly) —
     otherwise the feeding screen could only ever show the Rest default (`doAdvanceWeek`).
   - Stable screen Rest/Excursion blocks show live exact numbers (were static "+30–100 stam");
     training-block gains/maluses recolored white/black to match.
   - All tournament names de-month-ified and retoned (`town.ts`): circuit pools climb from humble
     ("The Sprout Cup", "Tin Daggers", "The Copper Pots") to serious ("The Anvil Championship");
     prestige events renamed The Silver Crescent / The Gilded Crown / The Radiant Throne /
     The Grandmasters' Summit / The Apex Invitational. No name anywhere references a month.
   - **True calendar grid**: one row per league (league name on the left), Wk 1–4 columns labelled
     along the bottom, always drawn in full with empty cells. League rows unlock with progress
     (`town.ts:visibleLeagueCount`): Wood→Silver until a monster is promoted PAST Silver, then up
     to Masters; Tamer Elite appears once a monster REACHES Masters (progress counts stable +
     frozen). Tournaments in hidden leagues are also hidden from the details panel.
   - **Per-stat derived battle bonuses** (user spec 2026-07-19, `monster.ts`, applied in
     `battle.ts`; all floor-tiered, sim-verified):
     - CON: +1 HP regen/turn per 25 (`hpRegen`, ticked alongside mana regen in `takeTurn`)
     - WIS: `manaRegen = round(2 + WIS×0.01) + floor(WIS/50)` — BIG nerf vs the old
       `2 + WIS×0.12` (999 WIS: 31/turn, was 122); combined with 2× spell costs, casters
       sustain far fewer skills per fight now
     - DEX: 1% crit per 50 (`critChance`) — double damage, logged "CRITICAL HIT!", `crit`
       flag on the hit BattleEvent, arena floats 💥 CRIT
     - STR: 1% of target mitigation ignored per 100 (`mitigationPierce`, stacks with skill pierce)
     - INT: 1% chance per 100 to cast a skill twice (`echoChance`) — echo is free (no MP,
       no extra cooldown), skills only (not Attack/ultimate)
     - CHA: per 50 (was per 25), +1% own status-proc chance (`debuffBonus`, UNCAPPED — may
       exceed the pool-wide 50% design rule, which applies to base move design only) AND 1%
       shaved off incoming stat-debuff magnitudes (`debuffReduction`)
   - **MonsterCard cleanup + training-aptitude bug fix** (user spec 2026-07-20): the "▲ STR DEX
     ▼ CHA WIS vs body avg" line under a monster's name was showing a DIFFERENT metric (current
     stats vs body-TYPE average) than the PRIMARY/SECONDARY/WEAKNESS tags shown elsewhere
     (species' own base-stat training aptitude) — the two disagreed and looked like the same
     thing. `Signature` now shows the real training aptitude (`trainingProfileFor`), so it always
     matches the Ranch screen. Also: removed the "223 HP"/"19 MP" pill badges and the ultimate's
     "(600)" teaser pill; "Taste:" relabelled "Food preferences:"; the ultimate move is now
     INVISIBLE until `ultimateUnlocked`, then appears as a 4th entry in the Loadout list (accent-
     bordered `.move.ultimate`), not a badge. New shared `ConditionMeters` component (HP → MP →
     Stamina → Happiness bars, in that order) replaces the separate meter markup that used to
     live in both the feeding screen and the Ranch detail panel — feeding screen gained HP/MP
     bars it didn't have before; both screens now render from the same code so they can't drift.
   - **Training-block aptitude coloring** (user spec 2026-07-20, `TrainBlock` in `App.tsx`): a
     drill's gain number now tints to the stat's own colour (STAT_COLOR) when that stat is the
     species' PRIMARY or SECONDARY training aptitude — e.g. Vexa (DEX primary, STR secondary)
     shows DEX gains in DEX-green and STR gains in STR-red; untagged stats stay white. The malus
     box (intensive drills' paired reduced stat) is unchanged — boxed when present, no box when
     a drill has no malus (basic drills). Verified via computed styles, not just a screenshot.
   - **CON floor by league average** (user spec 2026-07-21, `monster.ts:boostConstitution`):
     pure proportional training let a species with a tiny natural CON share (e.g. an Abyssal
     squid) come out of generation with almost no HP even at a high league, while every other
     stat sat at 500-900 — a glass cannon 100% of the time, not just sometimes. Each league now
     has a designed CON AVERAGE = 45% of that league's stat cap (Wood ~45 → Tamer Elite ~450).
     Generation pulls CON toward that average, but ONLY upward (never lowers an already-tanky
     species) and only a RANDOM 25-60% of the gap closes each time — so most monsters land near
     the average while some still roll low and stay genuine glass cannons (verified: 4.2% of a
     4000-monster sample still sit below 60% of their league's target after the boost). Applied
     once, right after `applyTraining`, using the pre-boost league so there's no feedback loop.
     Confirmed against the exact Kongrath-vs-Maelurk sandbox matchup: Ashryn's CON went 136→205
     at identical seed/training, every other stat unchanged.
   - **Stats cap at 1000** (was 999): `applyTraining` clamp + Tamer Elite league cap.
   - **Arena turn-by-turn log** (`arena.tsx`): captions accumulate in a scrolling `.arena-log`
     panel below the fight, revealed in step with the replay (skip fills the remainder) — shows
     in both tournament battles and Sandbox. Bestiary footer is HIDDEN during the tournament
     battle screen (RanchView reports via `onBattleScreen` → App state); Sandbox keeps it.
   - **Injury system — persistent HP/MP** (user spec 2026-07-19): `Career.hp`/`Career.mp` are
     tracked between weeks. Tournament LOSS (or draw) → monster comes home at 1 HP / 1 MP; WIN →
     carries whatever the fight ended with (`BattleResult.aFinal/bFinal`, applied in
     `resolveTournament`). Monsters ENTER battles at current HP/MP (`makeCombatant`), so an
     unhealed monster genuinely fights hurt (verified by sim: 1-HP entry loses; half-HP entry
     flips an otherwise-won matchup). Rest is the ONLY heal: 30-70% of max HP + 25-80% of max MP,
     rolled on applyWeek's seeded rng so `previewWeekEffects` (hpDelta/mpDelta) shows exact
     numbers in the feeding-screen plan panel and the stable Rest block. Stable detail meters
     stack HP (green) → MP (blue) → Stamina → Happiness, per spec. Old saves migrate in
     `loadSavedGame` (missing hp/mp → full). Rivals/sandbox monsters always start full.
   - **Battle fatigue** (`monster.ts:staminaDamageMult`, applied in `battle.ts`): entering a
     fight below full stamina debuffs ALL damage the monster deals — 76+ clean, ≤75 −10%,
     ≤50 −20%, ≤40 −30%, ≤25 −50%. `Monster.stamina?` carries it (`careerMonster` copies from
     the Career; rivals/sandbox monsters have none → always fresh). Battle log opens with a
     "💤 enters fatigued" line; the tournament sign-up panel warns before entry. Verified by
     sim sweep across every tier boundary.
   - **Rank-up trials are scheduled events** (`town.ts:RANK_UP_MONTHS/RANK_UP_WEEK/isRankUpWeek`):
     Week 4 of months 4, 8, 12, for every league — shown as ⭐ on the calendar. `promoteMonster`
     refuses outside those weeks; the Ranch rank-up button becomes a "trials run Week 4 of months
     4, 8, 12" hint when a monster is ready off-week. Trial weeks are EXCLUSIVE: the calendar
     generator never places a circuit event on Week 4 of a trial month (it rolls Weeks 1–3 there
     instead, so no event count is lost), enforced by a `validate.ts` collision check across the
     probed seed-years. Prestige events (fixed Week 2) never collide by construction.

1. **Formula tuning pass — UNTESTED, verify before committing:**
   - `maxMana = WIS` (was `WIS − 100`; simplified, no floor needed since WIS is always ≥1)
   - `manaCost()` doubled — every skill costs 2× what the base formula gives (`monster.ts`)
   - DEX gained more multi-hit moves: Sling (1–2 hits), Piercing Shot (1–2 hits, poison trimmed
     60%→45%), Heartseeker (2–3 hits) — multi-hit density up from 2/15 to 5/15
   - STR recoil tier: Power Strike (lvl 90, 5% recoil, pwr 26→30) → Reckless Slam (lvl 430, 10%,
     pwr 44→48) → Titanfall (lvl 920, 15% — the design-philosophy cap, pwr 60→68)
   - **Status-effect chance hard cap at 50%** (user rule: "cannot be higher than 50%"), applied
     pool-wide: Ember 70→40%, Inferno 60→35%, Shock 30→25%, Glacial Prison 40→30% (INT trimmed
     further — INT already scores off elemental-weakness multiplier, doesn't need high procs too),
     Discord 70→45%, Piercing Shot 60→45%. Swept the whole 90-move file; nothing else exceeded 50%
     (Lullaby sits exactly at 50%, which is allowed).
   - Design context from the user for the NEXT formula pass (not yet built): INT is the intended
     "chain-caster" stat (already has good CD2–3 density — no fix needed); WIS having higher
     cooldowns is fine/intentional since WIS is about buffs, not spam.

2. **Ability system overhaul — verified (150-battle stress sweep, live UI, typecheck/build clean):**
   - **Round-based buffs/debuffs.** Nothing lasts "for the fight" anymore. New `MoveEffects.duration`
     (rounds) drives `Combatant.mods: ActiveMod[]` in `battle.ts` — ticked down once per ROUND
     (`tickMods`, alongside cooldown decrement), expired entries pruned, cached totals
     (`atkMod`/`defFlat`/`dodgeMod`/`accMod`/`regenMod`) rebuilt via `recomputeMods`. Re-casting a
     move refreshes its duration (`upsertMod`) — previously a buff could only ever be cast once
     (old `appliedBuffs` Set, now removed).
   - `Taunt` (CON) carries `MoveEffects.tauntForce` — forces the target to attack the taunter.
     Inert in today's 1v1 sim (only one possible target already) but wired through and logged,
     ready for team battles.
   - **Per-stat identity enforced structurally** (full spec in `docs/ABILITIES.md`): CON is the
     SOLE granter of ward/defBuff ("shields and armour"); INT has zero buffs/heals (Arcane Focus
     removed, replaced by Pebble Storm); CHA buffs are Team-only and debuffs are All-enemies-only,
     no self/single-target CHA buff-debuff left; STR/DEX each gained one Fire/Earth and one
     Air/Water attack (previously fully non-elemental); WIS gained an ally-target heal
     (Tranquility) and a party-wide cleanse (Spirit Ward).
   - `docs/ABILITIES.md` (new) — full 90-move reference table + design-philosophy write-up.
     Republish as an Artifact if the user wants it shareable again (was published earlier this
     session at a stable URL — call `Artifact` with the same file path to update it).

3. **Bestiary rework — verified (build clean, in-game UI checked live):**
   - **Class removed from all display.** Class is `classForStats(current stats)`, recomputed
     fresh, never a species-locked identity. `docs/BESTIARY.md` entries no longer list a class in
     their header; the in-game Bestiary UI (`App.tsx`) now shows the species `flavour` tag instead
     of `naturalClass`. The `naturalClass` field itself is untouched — still used by `validate.ts`
     to confirm a species' base stats aren't self-contradictory.
   - **Bouldram → Kongrath.** The Mammal "Warrior" species was a bighorn ram; now a silverback
     gorilla (user wanted a design more unique to gorillas). New id/name, new innate abilities
     (Chest Beat, Rising Fury — renamed in lockstep in `battle.ts`'s `INNATE_EFFECTS` table, since
     that table is keyed by ability name string), new ultimate (Silverback Rampage), new backstory
     (grew up protecting a traveling troupe of smaller creatures; joined the Circuit after it
     scattered, looking for something worth guarding again).
   - **Avian ↔ Marsupial elemental affinities swapped** (`core.ts:BODY_ELEMENT`): Avian is now
     resist Air / weak Water; Marsupial is now resist Earth / weak Fire. Uniqueness across all 9
     body types re-verified.
   - **Six body-type themes**, each a population-level condition that all 5 backstories in that
     type answer differently (full text in `docs/BESTIARY.md`):
     - Mammals — displaced, finding renewed purpose
     - Avians — scattered by scarcity/migration, some finding their way home, some not wanting to
     - Marsupials — "the itinerant fair": their land burns too easily to ever settle, so their
       culture is built around traveling troupes, not places
     - Aquatics — "the deep stirs": a long-dormant trench silence is ending, oldest and newest
       alike surfacing for the first time in generations
     - Insectoids — decline & new nests: old colonies dwindling, but young nests quietly appearing
       elsewhere — a changing of hands, not an ending
     - Reptilians — "the long wait ends": patient beyond reckoning, each one waited (sometimes
       literal decades) for a reason good enough to finally move
   - In-game short bios (`src/bestiary.ts`) rewritten to match all 30 new backstories (kept
     condensed — the long-form doc is canonical).

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

### Ranch screen (`RanchView` in `App.tsx`, phase `'stable'`)
Free-navigation stable screen, not sequential: stable strip (click a monster, plan-status chip at a
glance) + detail panel (portrait, inline rename, Edit Abilities, Tournament History with podium
count, stat bars with aptitude tags, rank-up trial) + training row condensed by stat (6 columns,
basic + both intensive variants stacked, plus Rest/Excursion) + sticky action rail (Advance Week /
Back to Town / Tournaments toggle). Training blocks show a LIVE roll via `previewWeekEffects` —
exact, not estimated, because training rolls are deterministic per (monster, week) off the same
seeded rng `applyWeek` uses.

### Training — drills (`src/drills.ts`, roll in `game.ts:rollDrillGain`)
- **Basic**: ~6 to one stat (rolled 4–8, happiness-weighted), −10 stamina
- **Intensive**: ~12 to one stat (rolled 8–16, happiness-weighted), −4 flat to a paired stat, −25 stamina
- Roll skews toward the top of its range as happiness rises (0 happiness = uniform, 10 = strongly
  top-skewed); the existing aptitude multiplier (primary ×1.2/secondary ×1.1/weakness ×0.8) applies
  AFTER the roll, so a favoured stat at high happiness can exceed the old flat ceiling — intentionally
  not advertised as a stated max.

### Species Training Aptitude
Derived per species from its base stat spread (primary = highest, secondary = 2nd, weakness =
lowest), NOT per body type. Optional override via `Species.trainingProfile`. See
`game.ts:trainingProfileFor()` / `statTrainingBonus()`.

### Classes are emergent, not species-locked
`classForStats()` derives class from a monster's two CURRENT highest stats, recomputed fresh every
time — never stored, never a species identity. `Species.naturalClass` is only "what this species'
untrained base stats derive," used solely by `validate.ts` to catch self-contradictory species data.
Any species can in principle train into any class; aptitude only weights how fast each stat trains.
**Never write flavour text or UI as if a species is destined for its class** — see the bestiary
rework above.

### Battle sim (`src/battle.ts`)
- Every skill costs MP (`monster.ts:manaCost`, now 2× the base formula); free universal Attack +
  Block; per-turn choice policy in `chooseAction`
- `maxMana = WIS` directly (no offset) — a monster with very low WIS has very little MP and leans
  on Attack; `maxHp = 50 + CON×2.5`
- 90-skill pool (`src/moves.ts`, 15/stat, full reference in `docs/ABILITIES.md`) with mechanical
  effects (`core.ts:MoveEffects`): pierce, multi-hit, execute, recoil (capped 15%), lifesteal, mana
  burn, guard, ward shields (CON-exclusive), ROUND-LIMITED buffs/debuffs via `Combatant.mods`
- Mitigation: physical vs CON + guard, magic/voice/support vs WIS
- Innate abilities grant passives via `INNATE_EFFECTS` table (keyed by ability NAME — renaming a
  species' innate in `species.ts` requires renaming the matching key here too)
- Ultimate (stat 600+) fires once per battle below 40% HP

### Tournaments (`town.ts`)
- Seeded calendar generator (`tournamentCalendarFor(seed, year)`), drawn fresh each game year:
  every circuit league (Wood→Iron) guaranteed ≥1 event per quarter, ~40% get a second, unpredictable
  months/weeks. Silver+ are fixed annual prestige events. `validate.ts` probes 12 seed-years.
- Monster may enter its own league or any league below (never above); `rewardMultiplier` scales
  gold+exp down the further below their league they punch (100%/50%/20%), now keyed off the
  TEAM's minimum licenseIndex
- Rivals scale to the TOURNAMENT's league budget, not the player's stats — at-league fights stay
  close, punching down means stomping genuine league-locals
- One entry per event per month (`GameState.enteredThisMonth`, resets monthly)
- **Full round-robin team battles (2026-07-21)** — team size scales by league
  (`TEAM_SIZE_BY_LEAGUE`: Wood/Copper 1v1 → Tin 2v2 → Bronze/Iron 3v3 → Silver/Gold 4v4 →
  Platinum 5v5 → Masters/Tamer Elite 6v6); each event fields the player's team + 3-5 generated
  rival teams (`RIVAL_TEAM_COUNT_BY_LEAGUE`) in a full round robin (every pair fights once,
  including rival-vs-rival, for genuine standings); reward scales by final placement
  (`placementRewardFraction`: 100%/65%/40%/0%). See the top of "What changed this session" for
  the full design — `battle.ts`'s `simulateTeamBattle` is a real simultaneous N-vs-N engine
  (shared DEX-ordered initiative, real `enemy`/`allEnemies`/`ally`/`team` targeting), not a 1v1 loop.
- Battle plays in the animated arena (`src/arena.tsx`): `battle.ts` emits a structured
  `BattleEvent[]` stream. Exactly-1v1 matches (Wood/Copper, Sandbox) get the original lunge/
  projectile choreography unchanged; team battles get a compact roster-row presentation instead.

### Body Types (9)
Base: Mammal, Avian, Marsupial, Aquatic, Insectoid, Reptilian. Exclusive: Draconic + Abyssal
(Special License 800g), Mythical (Elite License 2000g). Every body type has a UNIQUE element
(resist, weak) pair, enforced by `validate.ts`. Full backstories + per-type themes: `docs/BESTIARY.md`.

---

## Roadmap — what's actually left

- **Balance validation** (in progress) — user testing the latest formula pass live; a full numeric
  rebalance beyond the structural fixes already done is still open ("lots of the balancing is not
  correct" was flagged as a broader concern, not fully addressed)
- **HP/MP pool balance across archetypes** — not empirically validated; would need simulated fights
  across a few builds (glass-cannon caster, tanky bruiser, etc.) to check time-to-kill feels similar
- ~~Tournament brackets & multi-participant events~~ **DONE (2026-07-21)** — round-robin team
  tournaments, real 1st/2nd/3rd+ placements (see the top of "What changed this session").
- ~~Team battles + real-time positional sim~~ **DONE (2026-07-21)** — `battle.ts:simulateTeamBattle`,
  up to 6v6, real `enemy`/`allEnemies`/`ally`/`team` targeting. One piece deliberately deferred:
  **`tauntForce`** (Taunt/forced-targeting) is still inert — needs its own small design (a
  forced-target flag consulted by `pickEnemyTarget`, expiring via the existing `mods` system) as a
  follow-on, not bundled into the already-huge team-battle feature.
- **Class-based AI tactics** — classes get distinct battle personalities (Bard buffs, Wizard nukes,
  Tank taunts), keyed off `classForStats(current stats)` at fight time. Tournament brackets (the
  thing this was sequenced after) are now done, so this is next in line whenever picked up.
- **Player-monster tameness/instinct** — non-player (rival/generated) monsters already have a
  hidden league-scaled tameness roll driving occasional AI misplay (`monster.ts:rollTameness`,
  `battle.ts:wildAction`, see "What changed this session"). The PLAYER-monster half of the original
  idea — odds shrink as a monster is well cared for — is still just designed in chat, not built.
- **Breeding/fusion depth** — fusion is currently a stub (averages two parents' stats, −10%). User
  is explicitly unsure what would make deeper fusion REWARDING in the gameplay loop — needs design
  thought before implementation starts, not a build-it-and-see.
- **Hall of Fame** — a retired monster just stops being usable today; no legacy record beyond
  freeze/fuse. No design yet.
- **Monster lifespan extension** — possibly a future Ranch Shop purchase. No design yet; species
  lifespans (4–6y) are currently fixed at generation.
- **First-time tutorial** — no onboarding exists; a new player has zero in-game guidance.
- **Rare tournament item drops** — champion-only rewards, TBD. No item/inventory system exists at all yet.
- **Unique per-species sprites** — every species in a body type currently shares one 16×16
  silhouette (`src/sprites.ts`), tinted by a per-species hue. `docs/BESTIARY.md`'s Appearance lines
  are written as concrete sprite-artist reference for whenever this gets built.

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/town.ts` | GameState, global week clock, advanceWeek(), market, lab, licensing, tournaments |
| `src/game.ts` | Career state, drills/training logic, applyWeek(), aptitudes, rollDrillGain |
| `src/drills.ts` | The 18 training drills (basic + intensive) |
| `src/App.tsx` | UI: TownView, RanchView (stable screen), AbilitySelector, saves |
| `src/core.ts` | Types, classes, elements, learn ladder, MoveEffects, RNG |
| `src/species.ts` | 45 species (30 base + 15 exclusive) + computed BODY_AVERAGES |
| `src/moves.ts` | The 90-move pool, 15/stat — see `docs/ABILITIES.md` for the rendered reference |
| `src/battle.ts` | Auto-battle sim: mana, innates, ultimates, round-based mods, BattleEvent stream |
| `src/arena.tsx` | Animated arena replay (plays BattleEvent[] as live beats) |
| `src/Sprite.tsx` | Shared pixel-sprite component |
| `src/bestiary.ts` | In-game condensed species bios (BIOS record) |
| `src/validate.ts` | Dev-only design consistency checks (species/class/element/calendar/moves) |
| `src/sprites.ts` | 16×16 pixel art per body type (shared across species in that type) |
| `docs/BESTIARY.md` | Full lore doc: all 30 base species, appearance + backstory, 6 body-type themes |
| `docs/ABILITIES.md` | Full 90-move reference table + per-stat design philosophy |
| `docs/GAME_DESIGN.md` | Original design doc — increasingly stale in places (predates several
  reworks this session); treat CLAUDE.md and the code as more current where they conflict |

## Deployment
Cloudflare Pages has git integration on `main` — every push auto-builds & deploys (see
`docs/DEPLOY.md`). Established workflow: commit to `preview` branch first, verify, then merge
`preview` → `main` and push (triggers the deploy). Don't skip straight to `main` for unverified
work. v0.21 (the entire 2026-07-20 session) shipped through this flow.

## Testing Checklist (smoke test after resuming)
- [ ] `npm run dev`, console shows `[design-validation] ... all consistent ✓` with no warnings
- [ ] Sandbox: run a battle, confirm no console errors, buffs/debuffs show round counts and expire
- [ ] Sandbox: a low-WIS monster (WIS < ~50) should barely afford any skill — mostly Attack/Block
- [ ] Sandbox: a high-WIS "caster" build should be able to chain low-cooldown INT/CHA moves
- [ ] Bestiary: species show flavour text, not a class tag; expand a couple of entries and confirm
      bios read as themed (e.g. Kongrath's gorilla backstory, not the old ram one)
- [ ] Ranch: feeding → stable screen → advance week loop completes without errors
- [ ] Tournament sign-up at a team-size-1 league (Wood/Copper) → battle → history shows placement
- [ ] Tournament sign-up at a team-size>1 league (Tin+) → TeamPicker fills all slots → round-robin
      battle screen steps through each of the player's matches → standings table + placement
