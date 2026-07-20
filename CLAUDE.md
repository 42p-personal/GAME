# Monster Tamer — Development Guide

## Handover state (2026-07-25)

**Everything below through item -27 is UNCOMMITTED on `preview`** (working tree has changes to
`src/App.tsx`, `src/battle.ts`, `src/core.ts`, `src/game.ts`, `src/monster.ts`, `src/species.ts`,
`src/town.ts`, `src/bestiary.ts`, `src/styles.css`, `src/validate.ts`, `src/Sprite.tsx`,
`docs/BESTIARY.md`, plus new files `src/mammalSprites.ts` and `public/sprite-preview.html`) — the
2026-07-22 playtest-feedback pass, its bracket/scouting follow-ups, the 2026-07-23/24 per-species
training aptitude overhaul, the Mammal per-species sprite pass, the 2026-07-25 innate-ability
rework, the 2026-07-25 innate CHOICE system, its balance-fix follow-up, the thematic innate
redistribution, the cluster differentiation pass, the ultimates-removal + synergy-framework pass,
the 5-more-statuses pass, the 22-move synergy revamp, the 3v3-6v6 sweep, and the chooseLoadout
fix (items -6 through -27), sim/build-verified
throughout (see item -18 for the innate rework's verification specifics; item -17 has a note on
one sprite check that couldn't be screenshotted at the time), but not yet committed/merged/
deployed at the user's own pace. Everything from item -5 down (v0.21) is COMMITTED and shipped —
committed on `preview`, merged to `main`, and pushed (Cloudflare Pages auto-deploys `main`).

**Sprites are on pause, not abandoned**: the user rejected the flat-color procedural pixel grids
(twice — see item -17 and the follow-up feedback) in favour of a much richer hand-illustrated
style (reference: an AI-generated evolution-line sheet with real shading/dithering). I don't have
an image-generation tool in this environment, so I can't produce that style myself. Next step,
whenever picked back up: the user supplies real image files (or a way to generate them) and
`Sprite.tsx` gets switched from computed canvas grids to loading actual image assets. `src/
mammalSprites.ts` and `public/sprite-preview.html` (a dev-only, localhost-served page for
visually checking sprite output — not part of the shipped game) are left in place for that.

**Resolved**: the `Pinguox`/`Sylvaglide` flaw-vs-class-stat validator warning from the prior
session is gone — user's call (2026-07-24) was to drop the flaw entirely for both rather than
pick a different stat or relax the validator. `validateDesign()` now reports fully clean
(`45 species, 11 classes, 90 moves, ~32 tournaments/yr — all consistent ✓`), confirmed via a
standalone run.

One caveat carried forward: the item marked **UNTESTED** below (the 2026-07-20 formula tuning
pass) was only compile-checked at the user's direction ("do not do any more testing") and then
shipped as part of the broader user-approved release — every OTHER item was sim/browser-verified
individually. If battle balance feels off in play, that pass plus the later damage-halving and
CON/turn-order changes are the tuning knobs to revisit.

### What changed this session, newest first

-27. **`chooseLoadout` auto-pick rework (2026-07-25), sim-verified across 4 iterations, uncommitted
    — the fix for the 3v3-6v6 sweep's findings.** Follow-up to item -26 below: user asked how to
    fix the dead synergies and unused abilities the sweep found, was given a recommendation to fix
    the AI's move-categorization first (root cause) rather than buff numbers or add more combos on
    top of a broken filter, then said "amend this and run further tests." `monster.ts:chooseLoadout`
    had 4 real coverage bugs, found via direct inspection, not guessed at:
    - **Self-buff moves (atkBuff/dodgeBuff/accBuff/regenBuff, target self) matched NO utility
      predicate at all** — invisible to every class, not just the 5 with a `CLASS_UTILITY_SLOTS`
      entry. New `isSelfBuff` predicate, added as a universal last-resort fallback.
    - **`isWardOrGuard` only recognized literal `ward`/`guard` fields** — Iron Skin/Barbed
      Carapace and Stone Wall (defBuff-only) were invisible even to Tank's OWN utility slot.
      Widened to include `defBuff`/`thorns`.
    - **`isEnemyDebuff` was scoped to Orator/Bard only** — Field of Doom and Marked for the Pack
      (debuff-type combo setters) were invisible to every other class regardless of whether the
      monster had also learned the matching payoff move.
    - **New `isComboPiece` predicate**: flags a learned move as one half of a designed pair — a
      `bonusVsStatus` payoff whose target status is also set by another learned move (or vice
      versa), OR the non-status taunt+thorns pair (`tauntForce` + `thorns`, scoped specifically
      to the MASS taunt — see the taunt-scope bug below).
    - **Iteration 1 (broken)**: appended `isComboPiece`/`isSelfBuff` to the END of each class's
      existing utility-slot array. Useless for Tank/Spellshield/Sage/Orator/Bard — their own 2-
      slot reservation already hit the `out.length >= 2` loop-break before the appended checks
      were ever reached (confirmed directly: a Sage with BOTH Field of Doom and Mind Crush
      learned still got Tranquility+Ward Against Ruin, Field of Doom never considered).
    - **Iteration 2 (fixed the priority bug, introduced a duplicate-move bug)**: restructured so
      a learned combo pair claims up to 2 slots BEFORE class-signature utility runs, since a
      genuine synergy beats generic utility. This surfaced a pre-existing latent bug: the "fill
      remaining slots" loop never checked `!out.includes(m)`, safe only because `out` used to
      hold exclusively non-damage moves at that point (support/damage are disjoint arrays) — no
      longer true once damage-type combo payoffs (Mind Crush, Bloodletter) could land in `out`
      early via the new priority pass. Produced actual duplicate-move loadouts (`Field of Doom,
      Mind Crush, Mind Crush`). Fixed by adding the missing guard.
    - **Iteration 3 (taunt-scope bug — the big one)**: the taunt+thorns half of `isComboPiece`
      initially matched ANY `tauntForce` move, which includes the baseline single-target Taunt
      (level 90, unchanged, learnable at CON>=90 — a bar nearly every monster clears regardless
      of class). This made the "combo" fire for almost every monster, not just CON specialists —
      confirmed by a full sweep showing thorns/taunt usage spike to 19-20/20 battles and total
      move diversity collapse from ~55 to ~35 moves used, crowding out everything else. Fixed by
      scoping the check to `target === 'allEnemies'` (Bulwark's Challenge specifically).
    - **Also added**: a smaller, unconditional `dmgScore` nudge (×1.15) for ANY move carrying a
      `status` field, not just designed combo pieces — vulnerable-setters (Bonebreaker,
      Fracturing Stones, Static Chain) and Cacophony's charm were never part of a `bonusVsStatus`
      pair in the actual move design (a "charm combo" I'd assumed existed while reasoning about
      this turned out not to — charm was always a standalone tool), so the combo-priority pass
      structurally can't rescue them; this milder boost lets status-carrying moves compete against
      a stat's pure-damage capstone without a full priority override.
    - **Final verified results** (identical seeds across all 3 iterations for direct comparison,
      20 battles × 4 team sizes = 80 battles/pass): burn-payoff went from 0/80 to firing in
      **32-47/80** across passes (the single biggest win — Cinderburst/Ember coexist reliably
      now); thorns from 0/80 to a stable **24/80**; vulnerable recovered from a mid-fix regression
      back to **26/80**, better than the original 12/80; doom (all 3 stages, including the
      early-cash tradeoff) confirmed working end-to-end in an isolated high-stat test (22/60
      apply, 12/60 auto-burst, 10/60 early-cash via Mind Crush) though rare in a mixed-level
      random sweep since it needs WIS>=780 for the payoff; mass-taunt+thorns confirmed **60/60**
      in an isolated CON-vs-CON test. **Never-cast move count**: still ~28-29/90 (didn't shrink
      much in aggregate), but the SET changed — self-buffs and debuff-type setters are no longer
      structurally invisible; what remains uncompetitive is mostly genuine "outranked by a
      stronger sibling in the same stat," a real design fact, not a categorization bug.
    - **Iteration 4 (same turn, user follow-up "how can you fix this?"): best-combo-pair
      selection.** The multi-combo-eligible case above (Titanrex/Vespera getting the incidental
      CON combo instead of their own STR/CHA one) was fixed properly rather than left as a
      standing limitation. The old greedy `comboPool.find` (grab whichever piece scans first)
      was replaced with: collect EVERY eligible combo pair the monster currently qualifies for
      (bonusVsStatus pairs + the taunt+thorns pair), score each pair by
      `stats[gatingStat_a] + stats[gatingStat_b]`, PLUS a class-fit bonus (+300 if a piece's
      gating stat is the monster's `classForStats` primary stat per `CLASSES`, +150 for
      secondary), then equip the highest-scoring pair. Re-verified the exact two broken cases
      directly: Titanrex (Warrior, STR=CON=1000 tied on raw stats) now correctly gets
      `Rending Blow, Bloodletter, Titanfall` (Warrior's primary=STR tips the tie) instead of the
      CON combo; Vespera (Orator, CHA=1000) now gets `Screech, Siren's Call, Crescendo` instead
      of the CON combo. A third case (Tortavos, Spellshield, CON=WIS=1000 tied) confirms the
      scoring generalizes correctly too — Spellshield's primary=CON/secondary=WIS both point at
      CON, so it correctly keeps the CON combo there instead of switching to WIS's doom combo.
      Re-ran the full 80-battle sweep after this change: aggregate synergy-firing numbers held
      steady or improved slightly (burn-payoff 10-16/20 across sizes, up from the prior pass) —
      confirms the smarter tie-break didn't regress anything achieved in iterations 1-3.
    - Verified: tsc/build/validateDesign clean at every iteration; zero duplicate-move loadouts
      across every sweep (iteration-2's bug, permanently fixed and re-confirmed each pass); all
      improvements measured against identical random seeds so before/after numbers are directly
      comparable, not cherry-picked.

-26. **3v3-6v6 battle-scale sweep — auto-pick coverage audit, no code changes (2026-07-25).** User
    asked to run battle tests at team-fight scale and check for dead synergies/unused abilities.
    Built a sweep harness (20 battles each at 3v3/4v4/5v5/6v6, randomized species/training level,
    REAL auto-picked loadouts — the same path rivals and any player who never opens the Ability
    Selector use) and tallied structured-event move usage plus synergy log markers. Findings: 28
    of 90 moves never cast in 80 battles; 5 of 12 core synergy mechanics fired 0/80 despite each
    being individually verified correct when manually equipped. Root-caused to `chooseLoadout`
    (the auto-pick heuristic), not the battle engine: self-buff moves matched no utility category
    for ANY class; debuff-typed moves were only ever considered by Orator/Bard; a stat's single
    strongest move permanently shadowed its own siblings including combo setups. This diagnosis
    directly enabled item -27's fix.

-25. **Synergy revamp of 22 learnable moves, level 120+ ONLY (2026-07-25), sim/build-verified,
    uncommitted — the actual adoption pass for the item -23/-24 frameworks, staying within the
    fixed 90-move pool (renames + effect additions, zero new/removed moves).** User's explicit
    scope: nothing at level 40 or 90 changes (confirmed by name-diffing the pool pre/post — the 18
    level-40/90 moves are byte-identical); every stat gets at least one INTRA-stat setup→payoff
    combo, not just cross-stat webs; AoE and "big" (full-hijack) statuses get lower proc chances;
    a new non-status framework field for INT specifically.
    - **New MoveEffects field `firstStrikeMult`**: bonus damage if the TARGET hasn't acted yet
      this round (attacker moved first in the live initiative order — reacts to haste/knockback
      dynamically). New `Combatant.actedThisRound`, set true at the very top of `takeTurn`
      (before any stun/sleep short-circuit — reaching the call IS "acting" for this purpose),
      reset false at the top of every round. `Thunderclap` (INT, was Shock/160) is the one move
      using it — replaces Shock's redundant 3rd-stun-in-the-pool with a genuine speed-reward.
    - **STR**: Rending Blow (was Crushing Blow/200) sets bleed 50%/3r; Bonebreaker (was Sunder
      Armor/330) sets vulnerable 40%/2r; Bloodletter (was Rampage/780) is STR's OWN payoff —
      `bonusVsStatus{bleed,×1.5,consume}` — a full intra-stat combo.
    - **DEX**: Twin Fangs (was Twin Shot/160) sets bleed 30%/3r (mirrors STR's, cross-stat);
      Fleetfoot Riposte (was Riposte/430) self-grants haste 2r; Marked for the Pack (was Hunter's
      Mark/540) sets vulnerable at guaranteed chance (100 — a pure-utility mark, no damage
      attached, so unlike a proc it should never whiff); Deadeye (920) gained its OWN bleed
      payoff (`bonusVsStatus{bleed,×1.5,consume}` alongside its existing pierce) — DEX can now
      combo bleed without needing a STR ally.
    - **CON**: Barbed Carapace (was Iron Skin/120) adds thorns 6/3r to the mitigation buff;
      Steady Vigil (was Regenerate/200) adds hpRegenBuff 5/3r to the heal — CON's two previously-
      unused frameworks finally used, closing the balance-review gap. **Bulwark's Challenge** (was
      Last Stand/650) retargeted self→allEnemies: mass-taunts the WHOLE enemy team for 2 rounds
      while still self-guarding 20 (the guard-application check fires regardless of move target,
      confirmed by reading `resolveMove`'s unconditional post-loop guard call) — combos directly
      with Barbed Carapace: force every enemy onto this tank, punish every hit with thorns. This
      is CON's own intra-stat combo (mass-taunt sets up, thorns pays off) and the pass's flagship
      team-fight tool, deliberately scaling with roster size. Colossus Crash (was Juggernaut/850)
      adds maxHpDmg 0.03 — CON finally threatens enemy tanks' HP pools too, not just soaks damage.
    - **WIS**: Silencing Spike (was Mind Spike/200) sets silence 25%/2r; Field of Doom (was Null
      Field/540) sets doom 28%/4r; Mind Crush (780) gained `bonusVsStatus{doom,×1.6,consume}` —
      WIS's OWN intra-stat combo, with a real strategic choice: let doom ride for its automatic
      25%-maxHp burst later, or cash it early via Mind Crush for a smaller guaranteed hit now
      (consuming removes the pending status, so it's genuinely one-or-the-other). Ward Against
      Ruin (renamed from Spirit Ward/650, mechanically unchanged team cleanse) becomes the
      team-fight answer to the whole doom/silence/sleep/charm/healblock web in one cast.
    - **INT — all 5 bare-nuke gaps closed**: Fracturing Stones (was Pebble Storm/120) sets
      vulnerable 30%; Thunderclap (160, firstStrikeMult, see above); Cinderburst (was
      Fireball/200) gained `bonusVsStatus{burn,×1.5,consume}` — INT's OWN intra-stat combo with
      its own Ember (unchanged, level 40); Static Chain (was Chain Lightning/330) sets vulnerable
      20% AoE; Deep Freeze (was Blizzard/650) gained pierce 0.2; World Ender (was Meteor/920)
      gained maxHpDmg 0.02 to every enemy hit — INT's capstone now threatens the whole enemy
      team's HP pools at once. Inferno's burn 35%→25%, Glacial Prison's stun 30%→25% (AoE/big-
      status trims).
    - **CHA**: Grand Mockery (was Mockery/120) sets healblock 20%/2r AoE; Screech's fear
      30%→20% AND duration 1→**2 rounds** (a real bugfix found during verification — a 1-round
      fear ticks away in the SAME round it's applied, before ANY payoff move could ever be cast
      against it; the combo was mathematically impossible at 1 round); Battle Hymn (was
      Anthem/240) team-grants haste 2r — a whole-roster tempo swing; Lullaby's status swapped
      stun→**sleep** 50%→35% (now matches its own name, and gains sleep's real wake-on-damage
      counterplay it never had as stun); Standing Ovation (540) gained hpRegenBuff 3/3r;
      Cacophony's status swapped confusion→**charm** 40%→15% (charm scales with roster size,
      confusion doesn't — and charm/AoE/big-status trims land it at the lowest chance in the pool
      per spec); Siren's Call (780) gained `bonusVsStatus{fear,×1.5,consume}` — CHA's OWN
      intra-stat combo with Screech.
    - **Chance-tuning rule applied uniformly**: AoE statuses capped ~20-25% (was up to 40%); "big"
      full-hijack statuses (sleep/charm/doom/silence) trimmed even single-target; "smaller"
      partial debuffs (bleed/vulnerable/healblock) stayed at their originally-designed 30-50%
      range (healblock's AoE copy still capped at 20% since it's AoE, per the same rule).
    - Verified: tsc/build/validateDesign clean; name-diff confirmed all 18 level-40/90 moves
      untouched; a forced-loadout sim suite confirmed 15 of 16 new mechanics fire in NATURAL AI
      play (bleed apply+tick, vulnerable, silence, doom apply+auto-burst+early-cash, healblock,
      haste, sleep, charm+redirect, thorns, burn-payoff, fear-payoff, Thunderclap firing) — one
      early failure round (doom/healblock/sleep all silently not firing) was traced to a TEST
      HARNESS bug, not game code: giving the AI opponent an empty loadout made its threat estimate
      too low (12 < the 18 threshold) to ever enter the hostile/debuff decision branch where those
      three statuses live; fixed by giving the opponent one real move. **Bloodletter/Rending
      Blow's bleed combo initially never fired under 60 trials of natural AI play** — traced to
      Bloodletter's raw power (16, hits[3,5]) making it the AI's preferred damage move regardless
      of bleed state, so it fired on cooldown instead of waiting. **Reworked by user request**
      (2026-07-25 follow-up: "lower the base damage, raise the combo damage"): power 16→10,
      `bonusVsStatus` mult 1.5→2.5 (MP cost auto-dropped 58→36 too, since `manaCost` derives from
      power). Re-verified: the combo now fires in 14/100 natural-AI battles (was 0/100) — note
      Bloodletter's base `effPower` (40) is still numerically above Rending Blow's (24), so this
      isn't a clean ranking reversal; the improvement is empirically real (confirmed by direct
      sim count and a sample log showing Rending Blow cast ahead of Bloodletter's next window) but
      the exact mechanism is likely the lower MP cost changing cast timing/cadence rather than a
      pure priority swap. 14% is still opportunistic, not scripted — full reliable sequencing
      would need `chooseAction` to explicitly value a setup move's enabling worth, left as a
      known follow-up.

-24. **5 more statuses (2026-07-25), sim-verified, uncommitted — framework-only, per user request
    ("add all the strong candidates") from a follow-up options list; no moves adopt them yet.**
    - **Sleep**: skips the turn like stun, but — the one thing that makes it different —
      **wakes on any HP damage** (`wakeIfSleeping`, hooked into both `tickStatuses`, for DoT
      wake-ups, and the main damage-hit site). Sets up a real team decision: leave the sleeper
      alone and focus elsewhere, or spend a big hit to wake it. Thematically owed to Koalio's
      whole kit (Lullaby/Drowsy Aura/Dreamsong).
    - **Doom**: nothing happens for `duration` rounds, then a heavy TRUE-damage burst (25% of the
      victim's own maxHp, no mitigation) when the countdown hits zero — ticked inside
      `tickStatuses` at `st.turns === 1`. Cleansable (the counterplay), same as any other status.
    - **Healblock** ("grievous wounds"): multiplies healing, lifesteal, AND passive HP regen by
      `HEALBLOCK_MULT` (0.4) while it holds — hooked at all three sites (`resolveUtilityOnTarget`'s
      heal, the lifesteal calc in `resolveDamageOnTarget`, and `takeTurn`'s passive regen line).
      The sweep flagged sustain/regen stacking as the strongest low-league strategy with zero
      counterplay before this — this is that counter.
    - **Haste**: the buff-side mirror of knockback — acts FIRST next round regardless of CON.
      `turnOrderCompare` now buckets on `haste(-1)/knockback(+1)` before the CON-ascending sort; a
      combatant with both nets to neutral. THE one BENEFICIAL status (`BENEFICIAL_STATUSES` set) —
      cleanses only strip non-beneficial statuses (`cleanseStatuses()` replaces the old
      `statuses = []`). Log line reads "gains haste" not "afflicted with", the only status that
      does. Required a small engine gap-fill: `resolveUtilityOnTarget` (self/ally-targeted
      beneficial moves) never applied `move.status` at all before now — only the two hostile
      resolvers did — since no existing move needed it; added so a self-cast "Haste Self"-style
      move can actually work.
    - **Charm**: confusion's team-battle sibling — single-target hostile actions strike the
      charmed monster's OWN team instead of the enemy's. Slots into `resolveTargets`'s existing
      precedence chain right after confusion (confusion > charm > taunt > lowest-HP%), same
      single-target-only scoping as confusion (an `allEnemies` volley isn't redirected by either),
      and is inert in a solo-team fight (no ally to strike — falls through to normal targeting).
    - `applyStatus`'s stack/refresh rule (item -23) extends cleanly — bleed still the only
      stacker, everything else including these 5 refreshes duration on reapply.
    - Verified: tsc/build/validateDesign clean; a synthetic-move sim suite (9 checks) confirmed
      every mechanic fires — sleep application/skip/wake, doom application AND the delayed burst,
      healblock application AND a visibly reduced heal number, haste application, charm
      redirecting a hostile hit onto an ally ("turns on its own team!"); a second targeted sim
      confirmed haste's actual turn-order effect end-to-end — a high-CON tank that normally acts
      last cast Haste Self in round 2 and was confirmed acting FIRST in round 3's raw log, ahead
      of a much-lower-CON opponent.

-23. **Ultimates REMOVED + synergy/status framework pass (2026-07-25), sim/build/browser-verified,
    uncommitted — frameworks ONLY, no moves changed yet (user: "we need to create the frameworks
    first").** User's directives from the non-innate-abilities review:
    - **Species ultimates are GONE** — all 45 `ultimate` entries stripped from species.ts (their
      descs promised effects the engine never delivered — every ultimate was a generic pwr-70
      hit), `Species.ultimate`/`Monster.ultimateUnlocked`/`ULTIMATE_LEVEL` removed from core.ts,
      the whole once-per-battle-below-40%-HP trigger + `ultimateMove()` + `ultimateUsed` +
      'ultimate' BattleEvent removed from battle.ts, MonsterCard's ★ block + Bestiary's
      "★ ultimate-name" + the Sandbox blurb updated in App.tsx, arena's ult caption/fx/ult-flash
      removed. Old saves are fine (stale `ultimate` keys in stored species snapshots are inert and
      the item -20 re-link migration replaces them with live data anyway). docs/GAME_DESIGN.md
      still mentions ultimates — left per its standing stale-doc caveat.
    - **Mass taunt confirmed as a real framework**: `tauntForce` cast via `target: 'allEnemies'`
      taunts the WHOLE enemy team onto one monster (applyDebuffs runs per fanned target; each
      enemy's `tauntedBy` is set independently) — sim-verified with a synthetic Challenge-All move
      forcing 2 enemies at once. MoveEffects doc comment updated to state this. User note: a
      proper targeting-logic pass (beyond lowest-HP% + taunt precedence) is planned LATER.
    - **3 new statuses** (StatusKind + STATUS_INFO + arena icons 🩸🤐🎯): `bleed` (physical HP
      DoT, 2% maxHp per stack per round, the ONLY stacking status — capped at 3 stacks via the
      new `applyStatus()` helper, which also makes every other status REFRESH duration instead of
      duplicating), `silence` (skills sealed — Attack/Block only, enforced in chooseAction AND
      wildAction), `vulnerable` (takes +20% damage from all sources, `VULNERABLE_MULT`).
    - **Knockback is finally LIVE** (was an unused StatusKind since launch): a knocked-back
      combatant acts LAST in the initiative while the status holds (turnOrderCompare's new first
      key) — the pool's first turn-order manipulation tool, composing with CON-ascending order.
    - **4 new MoveEffects frameworks** (engine support wired, zero moves use them yet):
      `maxHpDmg` (bonus damage = fraction of TARGET's maxHp — the giant-killer tools chosen over
      changing sudden-death chip), `bonusVsStatus {kind, mult, consume?}` (setup→payoff combos —
      extra damage vs a status-carrying target, optionally consuming the status, log line
      "exploits X's bleed!"), `thorns` (timed buff: flat reflect per hit taken —
      ActiveMod/recomputeMods gained `thorns`→`Combatant.thornsFlat`), `hpRegenBuff` (timed flat
      HP/turn — `hpRegenMod`, added into takeTurn's regen line). isTimedBuff/applyBeneficialEffects
      updated so the last two ride the normal buff pipeline (duration, refresh, Encore-extend).
    - **Combo-aware AI, the cheap way**: `effPower()` — the single function every damage-skill
      ranking in chooseAction flows through — now surges a move's value when the foe CARRIES the
      status its `bonusVsStatus` exploits, and prices `maxHpDmg` against the actual foe's pool.
      No bespoke policy branch needed; the existing tree cashes combos naturally. Silenced
      monsters short-circuit to Attack/Block (with the block-when-hurt personality check kept).
    - **CON mitigation coefficient trimmed 0.06 → 0.05** (physical channel) — the second half of
      the anti-tank package, per user's choice of giant-killer tools + coefficient over
      chip-damage changes.
    - Verified: tsc/build/validateDesign clean; a synthetic-move sim suite confirmed EVERY
      framework fires in real battles (bleed tick + stack, consume-combo log, silence/vulnerable/
      knockback application, thorns buff + reflect, HP-regen buff, 2-enemy mass taunt) — synthetic
      Move objects injected into loadouts at test time, moves.ts untouched; browser reload clean
      (transient Bestiary HMR errors during the edit sequence confirmed gone after the ★ removal
      landed — full Bestiary expands with zero ultimate markers).
    - **NEXT (user-approved direction, not yet started)**: the abilities adoption pass — new
      synergy moves using these frameworks (Flashpoint/Shatter/Venom Burst/Fanfare/Mark of Ruin/
      Shield Slam-style), heal scaling, physical-finisher MP-cost trims, reworking within the
      15-per-stat ladder. Then a targeting-logic design pass for taunt/focus-fire.

-22. **Innate cluster differentiation — all 90 profiles now mechanically UNIQUE (2026-07-25),
    sim/build-verified, uncommitted.** User's follow-up to item -21: several innate families
    shared identical numbers (5× opener 1.5, 6× flatDR 2, 4× crit 8, 3× dodge 6/8, 3× acc 8,
    etc.) — "we want them to feel a bit more unique and not have the same numbers", explicitly
    including the DR family. Every family is now a ladder of distinct values, with small thematic
    riders where flavour supports one (riders reuse EXISTING InnateEffect fields — zero new
    engine code this pass):
    - **Openers** 1.2→1.7: Prehistoric Roar 1.2, Skim Dart 1.25, Glide Strike 1.3, Haymaker 1.35,
      Chest Beat 1.5, Dive Bomb 1.6 (full-momentum dive), Ambush 1.7 (the mantis strike tops the
      ladder); composites Ambush Strike {1.4 + acc 4, "the patient strike does not miss"} and
      Silent Strike {1.4 + crit 5}.
    - **Flat-DR family**, each a different defensive texture: Thick Hide 3 (plain thickest),
      Ironclad 2 (textbook plate), Spiral Shell {2 + dodge 2}, Weathered Hide {2 + debuffResist
      10, "old scars"}, Aegis Bond {2 + hpRegen 2, "the bond mends" — still self-beats aura-twin
      Unison}, Armored Scales {1 + hpRegen 1, crocodile wounds knit fast}, Chitin Plate {1 +
      startWard 12}, Unstoppable {1 + debuffResist 15}, Shell Ward → pure startWard 18,
      Glacial Wisdom {regen 2 + flatDR 1}, Truth's Word 1 (unchanged).
    - **Crit** 6-10: Current Rider {6 + acc 2}, Whirlwind 7, Rend 8, Stellar Shot 9 (was a dmg
      clone), Tail Drop 10 (ceiling drop = biggest crit); riders Dodge Storm 3, Silent Strike 5.
    - **Pierce** 0.1/0.12/0.15/0.18: Whip Strike 0.1 (was dmg clone — wraps around shields),
      Southpaw 0.12, Maul 0.15, Serrated Claws 0.18 (serrated cuts deepest).
    - **Echo** 6/8/10/12: Rift Magic 6 (was dmg clone), Tentacle Barrage 8 (eight arms!),
      Wellspring 10, Spell Echo 12.
    - **Accuracy** 7/8/10/11: Hypnotic Gaze 7, Keen Eye 8, Cosmic Precision 10, Compound Eyes 11.
    - **Pure-dodge ladder** 4-10: Burrow 4, Ancient Knowing 5, Quickstep 6 (> Cheer 4, aura-twin
      rule), Aerial 7, Cloak of Shadow 8, Phase Shift 9, Wing Current 10; composites Dodge Storm
      {6 + crit 3} and Wall Runner {6 + acc 2}; Web Trap unchanged.
    - **Mana regen** 2/3/4/5: Inner Calm 2, Abyssal Glow 3, Silent Wisdom 4, Arcane Mastery 5.
    - **Exclusive dmg-clone block re-textured**: Flame Aura → burn-on-hit 8%, Blizzard →
      stun-on-hit 6%, Void Pulse → lifesteal 0.1, plus the pierce/echo/crit conversions above;
      remaining flat dmg is a clean 1.05/1.06/1.07/1.08 ladder (Rising Fury/Draconic Pride/
      Overload/Pride). statusOnHit family: poison 12, blind 10, burn 8, stun 6 — all distinct.
    - **Others**: Cold Blood debuffResist 25→20 (Immovable keeps 25); Hive Command debuffExtend
      25→30 (vs Encore's buffExtend 25 — also narrows Vespera's pair gap); Psychic Aura →
      {auraDodge 3 + auraRegen 1}; Life Bloom → {auraHpRegen 2 + auraRegen 1}; Royal Jelly stays
      pure auraHpRegen 2 (unique once its neighbours became composites — a first-draft self-rider
      was reverted when the sweep showed it overshooting Vespera's pair balance).
    - All 40+ changed descs regenerated in species.ts (desc==table invariant held).
    - Verified: tsc/build/validateDesign clean; deep-canonical duplicate check confirms **zero
      identical profiles across all 90**; A/B sweep re-run — mean intra-pair |delta| 3.7%, worst
      12% (the residual gaps are the same situational-vs-flat seesaws already documented in item
      -20, within noise at n=50); browser reload clean.

-21. **Thematic innate redistribution + 8 new passive mechanics (2026-07-25), sim/build/browser-
    verified, uncommitted.** User's follow-up to the item -20 balance review: half the pool was
    three generic stat nudges (23× flat "+X% damage", 13× flat-DR, 11× dodge). User's explicit
    theme mapping, applied with thematic fit deciding ties: **auras** → CHA-major species
    (Maneleo, Larkessa, Vespera) then Marsupials (Quokkade, Koalio) — the three off-theme base-
    species aura holders converted (Nautilux's Ward → opening shield, Strixil's Wellspring →
    double-cast, Carcharun's Tidal Wisdom → self +2 regen/+2 HP regen); **crit** → DEX majors
    (Rend/Grivvel, Whirlwind/Tazzik, Current Rider/Mantaris) then Reptilians (Tail Drop/Geckari),
    all at crit 8; **pierce** → STR majors (Serrated Claws 15%/Mantevoke, Southpaw 12%/Bruxaroo)
    then Mammals (Maul 15%/Ursath); **mana regen** → WIS majors/Avians (Abyssal Glow/Lanterix now
    regen 3; Silent Wisdom/Strixil kept); **elemental damage or double-cast** → INT majors +
    Aquatics (Arcane Bolt/Corvaan +10% elem, Spellblade/Lanterix +12% elem, Wellspring/Strixil +
    Tentacle Barrage/Maelurk echo 10, exclusive Spell Echo → echo 12 — finally does what its name
    says); **CON-tank innate trim** (the 6 sweep-dominant species): Ironclad, Unstoppable, Chitin
    Plate, Armored Scales, Shell Ward all flatDR 3→2, Death Roll/Crocmaw's flat +8% converted to a
    conditional execute. NOTE: the tanks' win rates barely moved (88-90% post-trim) — their
    dominance is base-stat-driven (CON → HP pool + mitigation), still the standing species-balance
    roadmap item, not an innate problem.
    - **8 new `InnateEffect` mechanics** (all hooked at existing calc sites in battle.ts, ~one
      line each): `crit` (stacks with DEX critChance), `pierce` (stacks with STR pierce + skill
      pierce), `echo` (stacks with INT echoChance), `elemDmgMult` (elemental moves only),
      `executeMult` (vs targets <30% HP — Death Roll), `highHpDmgMult` (own HP >70% — Statue
      Stance/Balaenix, "+10% while composed"), `startWard` (opens battle with an absorb shield —
      Ward/Nautilux 25 HP), `manaSteal` (drains target mana by fraction of damage — Mana Theft/
      Abyssomancer 20%), `buffExtend`/`debuffExtend` (% chance, rolled on apply, that a cast
      buff/inflicted debuff lasts +1 round — Encore/Larkessa "the song plays again", Hive
      Command/Vespera "the queen's decree lingers"; log lines "encore!"/"— it lingers!"),
      `debuffResist` (% off incoming debuff magnitudes, stacks with CHA debuffReduction —
      Immovable/Aegisox, Cold Blood/Serpwyn), `statusOnHit` (chance to afflict on EVERY damaging
      hit, independent of move statuses, no CHA bonus — Venom Fang/Arachnyx poison 12%, Crest
      Display/Iguanor blind 10%). `lowHpDmgMult`'s threshold moved 50%→30% and Frenzy 1.15→1.25
      per the user's "below 30%" spec. `applyDebuffs`/`applyBeneficialEffects`/
      `resolveUtilityOnTarget` gained an `rng` param (and `applyBeneficialEffects` a `caster`
      param) for the extend rolls — deliberate rng-stream change, no golden-output constraint.
    - Post-change flat "+X% damage" holders are down from 23 to 10 (2 base species — Rising Fury/
      Kongrath and Pride/Maneleo — plus 8 exclusives, deliberately untouched per the standing
      exclusives scope). Every base species' pair is now two DIFFERENT mechanic categories.
    - All 30 changed descs regenerated in species.ts (desc==table invariant held; patch script).
    - Verified: tsc/build/validateDesign clean; full A/B sweep re-run at train 600 — mean
      intra-pair |delta| 3.4%, worst 12% (within noise at n=50/side); a mechanics-proof sim
      confirmed every new hook actually fires at runtime (poison-on-hit, opening ward absorb,
      execute log, MP steal, debuff linger, buff encore all observed in battle logs); browser
      reload clean with the re-linked save showing the new descs.

-20. **Innate balance fixes + stale-species save bug (2026-07-25), sim/build/browser-verified,
    uncommitted.** User asked for a balance sanity-check of the 90 innates. Ran an empirical sweep
    (each species vs a 10-species reference pool with innate A then B, at train 150/600/1800,
    ~4,500 sims per level) plus a code read of every field's cash-out point. Verdict: pairs mostly
    within a few % win rate of each other — three structural issues found and fixed:
    - **Three self-only innates were strictly dominated by their aura twins** (auras include the
      owner via `recomputeInnateAuras`'s `[c, ...allies]` loop, so at equal magnitude the aura is
      identical in 1v1 and strictly better in teams): Aegis Bond flatDR 2→**3** (vs Unison's aura
      2), Pride dmgMult 1.05→**1.08** (vs Rallying Roar's aura 1.05), Silent Wisdom regen 3→**4**
      (vs Wellspring's aura 3). Balance rule now documented atop `INNATE_EFFECTS`: a self-only
      field must carry a HIGHER magnitude than its aura twin (Quickstep 6 vs Cheer 4 was already
      the correct pattern). Re-sweep: all three pairs now within ±4%.
    - **Truth's Word was near-dead weight** (cleanse only fires if the bearer is debuffed; blank
      vs teams with no debuff moves, while its twin Foresight auraDodge 5 is one of the best
      auras): gained an always-on `flatDR: 1` rider alongside the cleanse. Re-sweep: 52% vs
      Foresight's 48% at train 600 (was 32% vs 40% at 1800).
    - **Enemy-dodge-debuffs are structurally weak** — dodge has no floor at 0 and hit chance past
      100 is wasted, so shaving dodge off low-DEX foes buys nothing (attackers already sit at
      ~85-100% to hit). The sweep's two worst pairs were both here. Drowsy Aura converted to
      `enemyAccDebuff: 3` (acc-debuffs are nearly always live — Hex/Ink Cloud sim fine); Root
      Grasp split into `enemyDodgeDebuff: 3, enemyAccDebuff: 2`. Web Trap/Temporal Distortion keep
      their dodge-debuff riders (secondary effects, still live vs dodgy teams).
    - All six touched `desc` strings in `species.ts` updated to match (desc==table invariant held).
    - **Residual, accepted as design**: flat per-turn HP-regen effects (Soothing Words, Life
      Bloom, Sun Basking) are the strongest low-league category (3 HP/turn over a ~25-round Wood
      fight ≈ a full extra health bar) and fade to nothing at high leagues; %-based effects do the
      opposite. Koalio/Verdantdrake's regen-vs-debuff pairs still gap ~20-25% at train 150 for
      this reason. Left as an "early innate vs late innate" seesaw rather than nerfing all heals —
      flagged that making regen %-of-maxHp would kill the seesaw structurally if ever wanted.
    - **Stale-species save bug found & fixed while verifying**: saves serialize the whole
      `Species` object into `Career.species`/`Frozen.species`, so every species.ts change
      (renames, desc fixes, the item -18 regeneration) was INVISIBLE to existing saves — the
      live Ranch monster was still showing pre-rework "Elemental nuke."-style descs.
      `loadSavedGame` now re-links both to the live `SPECIES` table by id on load (a species
      whose id itself was renamed keeps its stored snapshot rather than crashing). Browser-
      verified: the persisted save's Corvaan now carries the current numeric descs after reload.

-19. **Innate CHOICE system (2026-07-25), sim/build/browser-verified, uncommitted — the actual
    "2 choices, 1 auto-unlocked, 1 gated" mechanic the item -18 rework was prerequisite for.**
    User spec: "the secondary passive will cost 300 to unlock, there is no superiority in the
    second passive it is another option — note only 1 innate can be active at a time, it is
    changed like abilities." Implemented exactly: species.innate[0] is available from the start;
    species.innate[1] unlocks once the monster's HIGHEST current stat reaches
    `core.ts:INNATE_SECONDARY_LEVEL` (300) — same pattern as `ULTIMATE_LEVEL` (600), just a lower
    bar. Only ONE innate is ever mechanically live at a time (no more "both stack," which is what
    item -18 had built) — `Monster` gained `innateUnlocked: boolean` and `activeInnate: number`
    (0|1); `battle.ts`'s `innateEffects`/`activePassives`/`hasInnate` now read only
    `species.innate[activeInnate]` via a new `currentInnate(m)` helper, replacing the old
    "sum both" loop entirely. `Career` gained a persisted `activeInnate` field (default 0), exactly
    mirroring how `loadout` already persists equipped moves; `game.ts:careerMonster` resolves it
    with the same shrink-safety `ultimateUnlocked` already had — if a stat drop (e.g. an intensive-
    drill malus) knocks the monster back under 300, `activeInnate` silently reverts to 0 rather
    than leaving an inaccessible choice active. `town.ts:setActiveInnate(g, id, index)` is the
    mutator (blocked mid tournament-entry, same restriction as `setLoadout`; refuses index 1 unless
    actually unlocked). **UI, "changed like abilities" taken literally**: the swap lives INSIDE the
    existing `AbilitySelector` (Ranch's "⚔ Edit Abilities" panel), not a separate screen — a new
    section below the loadout pool shows both of the species' innates as cards, the active one
    marked "· ACTIVE", the locked one (if not yet unlocked) shown dim with "🔒 unlocks at 300 in a
    stat" and un-clickable; click the inactive-and-unlocked one to swap. `MonsterCard`'s Innate
    section now shows only the currently-active innate plus a one-line hint ("2nd choice unlocked
    — edit abilities to switch" / "2nd choice unlocks at 300 in a stat") instead of listing both
    unconditionally. Sandbox got the same treatment for parity — `FighterSlot` gained
    `activeInnate: number | null` (null = default 0, same convention as its existing
    `loadout: string[] | null`), `buildSandboxMonster` applies the override, and the Sandbox
    `AbilitySelector` call site wires the same `onSetInnate` callback. Old saves migrate in
    `loadSavedGame` (missing `activeInnate` → 0, i.e. the original always-available choice — no
    behavior change for existing monsters until the player explicitly swaps). The Bestiary (species
    reference, not an owned monster) is intentionally unchanged — it still lists both of a
    species' innate names, since that's the two available OPTIONS, not one monster's current pick.
    Verified: `tsc --noEmit` clean, production build clean, `validateDesign()` clean, a standalone
    scratch sim confirmed only the switched-to innate appears in the battle log's "innate:" line
    (not both), and a full live-browser pass — Ranch monster (stat 37, well under 300) shows its
    2nd choice correctly locked with the unlock hint in both MonsterCard and the ability editor;
    a Sandbox monster trained to 2400 pts (max stat 914) shows "2nd choice unlocked," and clicking
    the previously-locked innate in the editor swapped `ACTIVE` from Unison to Aegis Bond live,
    with zero console errors throughout.

-18. **Innate ability rework (2026-07-25), sim/build-verified, uncommitted — first piece of the
    "abilities" pass the user is starting on (innate abilities first, class/synergy work later).**
    User's audit request: "review the innate abilities, they must all be passive effects, add
    numbers... must translate into real stats/effects." Auditing all 90 (45 species × 2) against
    the actual mechanical table in `battle.ts` surfaced real problems, all now fixed:
    - **7 abilities had ZERO mechanical effect** (pure flavour text): Frenzy, Hex, Encore, Drowsy
      Aura, Root Grasp, Entropy, Truth's Word. All now have real numbers.
    - **Several descriptions contradicted their actual coded effect**: Rend claimed "bleed (DoT)"
      but was a flat +5% damage boost; Maul claimed "heavy melee crits" but was also flat damage.
      Reworded both descriptions to honestly state what they do (no new DoT/crit mechanic built —
      flagged as a further engine option if the user wants literal proc-based DoT/crit later).
      Ink Cloud and Mana Theft claimed to weaken the ENEMY but were coded as self-buffs — fixed to
      actually debuff enemies (see below). Sun Basking ("recovers strength between blows") was
      coded as mana regen — fixed to HP regen, which the description actually describes.
    - **Team-wide auras are now a real mechanic**, not just flavour text — user's explicit choice
      over rewriting the ~10 "team"/"allies"-worded abilities as self-only. `InnateEffect` (battle.ts)
      gained `auraFlatDR`/`auraDodge`/`auraRegen`/`auraHpRegen`/`auraDmgMult`: every living ally
      (owner included) gets these each round, vanishing the round after the owner falls. New
      `recomputeInnateAuras(ctx)` runs once at battle start and once per round (same cadence as
      `tickMods`), building each `Combatant.innate` (the EFFECTIVE totals battle code reads) from
      `Combatant.selfInnate` (static, own two innates) + living allies' aura contributions. Zero
      changes needed at any of the 8 existing `c.innate.X` read sites — same field names, now
      dynamically correct. Converted: Rallying Roar, Wellspring, Ward, Cheer, Tidal Wisdom, Unison,
      Song of Valor, Psychic Aura, Foresight, Soothing Words, Life Bloom, Royal Jelly, Encore.
    - **Enemy-facing debuff auras are the mirror mechanic**: `enemyAccDebuff`/`enemyDodgeDebuff`/
      `enemyRegenDebuff`/`enemyDmgDebuff` apply to every living ENEMY each round (same recompute
      pass, opposite side). Used for Ink Cloud, Mana Theft (also fixed, see above), and the 3
      previously-unhooked debuff-flavoured abilities: Hex, Drowsy Aura, Root Grasp, Entropy. Web
      Trap ("hard to reach" + "foes arrive slowed") got both a self-dodge AND an enemy-dodge-debuff
      field in one entry — the first ability whose description genuinely described two effects at
      once, so it's the first to carry two.
    - **Frenzy** ("Attack speed up at low HP") reworked into a real conditional: new self-only
      `lowHpDmgMult` field, checked dynamically against CURRENT hp/maxHp (not a static roll) in the
      damage calc — +15% damage while below 50% HP. The only field that reads live battle state
      rather than being a flat/summed number.
    - **Truth's Word** ("Dispel all buffs/debuffs at will") was the one ability that read as an
      ACTIVE, on-demand action — directly conflicting with "must all be passive." User's choice:
      automatic interval cleanse. New special-cased function `truthsWordCleanse(ctx, round, ...)`
      (keyed by ability name, same pattern as `tauntForce`) — every 3rd round, a bearer
      automatically removes one random debuff mod from itself. No generic field for this since
      it's the only ability that removes a mod outright rather than adjusting a number.
    - **Every one of the 90 descriptions was regenerated FROM the mechanical data**, not hand-typed
      — a script imported the (temporarily exported) `INNATE_EFFECTS` table and produced exact
      wording per field (`"+8% damage."`, `"Team: +3 HP regen/turn."`, `"Enemies: -4% accuracy."`,
      etc.), then patched every `{ name, desc }` pair in `species.ts` by name match. This means
      description and mechanic can never drift apart again — the desc IS the table, rendered to
      text. `INNATE_EFFECTS` stayed exported afterward (harmless, and available if a future UI
      pass wants to show real numbers in an ability tooltip).
    - Verified: `tsc`/production build clean; a script cross-checked all 90 species' innate names
      against the table's 90 keys (0 missing, exact 1:1, no typos); `validateDesign()` clean; a
      live `simulateTeamBattle` sim (Maneleo+Kongrath vs Aegisox+Grivvel, real species via a
      seed-search helper) ran multiple full rounds with no exceptions, confirming the aura/enemy-
      debuff recompute pass, the low-HP conditional, and the innate log line all execute correctly
      at runtime — not just type-check clean.

-17. **Unique per-species-per-stage Mammal sprites (2026-07-24), structurally verified, uncommitted
    — the start of the long-flagged "unique per-species sprites" roadmap item.** New file
    `src/mammalSprites.ts`: hand-authored 16×16 pixel-art grids (same '.'/X/B/L/A/E/P legend as
    `sprites.ts`) for all 5 Mammal species at 3 life stages each — child, teen, adult — with each
    stage's filled-pixel count deliberately increasing (verified programmatically: e.g. Kongrath
    58→116→162, Ursath 70→130→180 across all 5 species, zero exceptions) so a monster visibly
    grows in size/detail stage to stage, "like a Pokémon evolution" per the user's own framing.
    `Elder`/`Retiree` deliberately do NOT get a 4th hand-drawn grid — `Sprite.tsx` reuses the adult
    silhouette and applies a CSS filter (`grayscale(0.55) brightness(0.75) saturate(0.6)`) to read
    as visibly aged/faded, since proportions don't change further at that point, only condition
    does (satisfies "when the monster reaches elder it must start to look older, less able to
    fight" without doubling the art workload). `Sprite.tsx` gained an optional `stage` prop
    (`'Baby'|'Teen'|'Fully Grown'|'Elder'|'Retiree'`, mirroring `game.ts`'s `Stage` type without an
    import to avoid pulling the career module into a leaf component) — species with a
    `SPECIES_SPRITES` entry use it to pick child/teen/adult; everything else (all other body
    types, not yet migrated) falls back to the original shared body-type silhouette unchanged, so
    this is purely additive. Threaded `stage` through every `<Sprite>` call site that has a
    `Career` (hence `ageWeeks`) available — feeding screen, stable strip cards, stable detail
    portrait, Lab freeze list — via the already-imported `stageInfo()`; the Lab's Thaw list passes
    a hardcoded `stage="Teen"` since `Frozen` genomes carry no age and always return as Teen on
    thaw. Left at adult/default for contexts with no persisted individual (Bestiary — showing the
    species' canonical form — Sandbox, ScoutReport, BracketGrid).
    - **Verification note**: the screenshot tool was unavailable for this pass (`computer` timed
      out repeatedly across two fresh tabs, even for unrelated pages — an environment issue, not a
      rendering bug, since `read_console_messages` showed zero errors throughout). Verified
      instead via `tsc`/production build (both clean), a DOM query confirming 5 Bestiary rows
      render with 5 *different* rect counts (128–167, proving unique-not-shared silhouettes are
      actually live, not just present in source), and a standalone Node script counting filled
      pixels per stage per species (all 5 monotonically increasing, printed above). No live visual
      screenshot was taken — if the rendered sprites look off once the screenshot tool recovers,
      this is the first thing to check.

-16. **Pinguox/Sylvaglide flaw removed (2026-07-24):** resolved the open question from the prior
    handover — user's call was to drop the flaw entirely (major-only `trainingProfile`) rather
    than pick a different stat. `species.ts` updated for both; `docs/BESTIARY.md` headers updated
    to `major STAT` with no `/ flaw STAT` suffix; `App.tsx`'s Bestiary row rendering fixed to
    handle major-without-flaw gracefully (previously assumed flaw always existed alongside major,
    would have rendered `▼ undefined`). `validateDesign()` re-run standalone, fully clean.

-15. **Bestiary group headers keep elemental info too (2026-07-24):** correction to item -13/-14 —
    user clarified "the species should still list its elemental effects, but only the species, not
    the monster": the body-type/group-level header (e.g. "Mammals") is "the species" in the user's
    terminology here and should show BOTH the minor training stat AND resist/weak elements;
    individual monster rows correctly stayed major/flaw-only (no element) per the prior pass — no
    change needed there. Restored `· resist X · weak Y` alongside `· minor STAT` in both
    `App.tsx:Bestiary`'s group header and `docs/BESTIARY.md`'s 6 `## BodyType` tagline headers.

-14. **`docs/BESTIARY.md` header rework to match (2026-07-24), uncommitted:** immediate follow-up
    to item -13 — that pass only touched the in-game Bestiary UI; the static doc's per-body-type
    and per-species headers still read `resist X / weak Y`, which the user was looking at directly
    (screenshotted) and flagged as the same problem in a different place. Applied the identical
    substitution here: all 6 `## BodyType — *tagline; resist X, weak to Y*` headers now end
    `minor STAT` instead; all 30 `### Species — animal · resist X / weak Y` headers now read
    `major STAT / flaw STAT` (or `minor only` for the 6 vanilla species), sourced directly from
    each species' `trainingProfile` in `species.ts` (same data item -10 authored, just surfaced in
    the doc too). Also fixed the doc's own format-description line ("Each entry: species · common
    name · element (resist/weak)" → "...· training (major/flaw)"). Scope stayed the 30 base
    species per the doc's own stated scope (line 34-35 already excludes the 15 exclusives) — no
    element-vs-training tension there since that section was never touched.

-13. **Bestiary redesign around training aptitude (2026-07-24), live-verified, uncommitted:** user
    feedback after seeing the item -10 training system: the in-game Bestiary (`App.tsx:Bestiary`)
    still centered on elemental resist/weak (a body-wide, not per-monster, property) and still had
    class-flavored words baked into several species' `flavour` text — both worked against the new
    "training determines class" framing.
    - **Group header** now shows the body type's MINOR training stat (`BODY_MINOR[bt]`, tinted to
      the stat's own colour) instead of the resist/weak element line — e.g. "MAMMAL · minor STR".
      The exclusive body types (Draconic/Abyssal/Mythical) correctly show no minor stat at all
      (they're not on the new system yet — `BODY_MINOR` has no entry for them, handled gracefully).
    - **Each species row** now shows its individually-authored `▲ major · ▼ flaw` (colour-tinted
      per stat) instead of nothing — this is the actual per-row payoff, since major/flaw is what
      makes two same-body-type species train differently. The 6 vanilla species (Kongrath,
      Corvaan, Quokkade, Maelurk, Scarabrute, Geckari — minor-only, no authored major/flaw) show
      "minor only" instead of blank. New CSS: `.bestrow > summary .bsmall` forces this line onto
      its own row under the sprite/name for readability.
    - **"Theme:" renamed to "Bio:"** in `docs/BESTIARY.md`'s 6 per-body-type section headers
      (`### Theme: Displacement & Renewed Purpose` → `### Bio: ...`, etc.) — user's own wording,
      applied verbatim via a global find/replace.
    - **Class jargon scrubbed from flavour text** (user: "remove any mentions of classes such as
      'mage' or 'skirmisher'... class is determined by training itself," reinforcing the existing
      "class is emergent, never species-locked" principle at the WRITING level, not just the code
      level): rewrote 18 of the 30 base species' `flavour` field in `species.ts` to drop
      class-implying words (mage, brawler, skirmisher, duellist, warder, oracle, mystic, warlord,
      juggernaut, rampart, "commanding voice," "voice performer," "nimble performer," "gliding
      ranged," "immovable wall") in favor of pure animal/physical description — e.g. Grivvel
      "Wolverine brawler" → "Wolverine, relentless and short-tempered"; Corvaan "Sorcerous raven,
      arcane" → "Raven, sharp-eyed and light-fingered." Mirrored the same scrub across
      `docs/BESTIARY.md`'s 7 affected long-form entry headers (Grivvel, Maelurk, Mantevoke,
      Arachnyx, Odonatra, Serpwyn, Tortavos) plus two in-prose instances ("eight-armed spellwork"
      → "eight-armed reach," "glowing faint arcane blue" → "glowing faint blue") and the Aquatics
      group tagline ("wise, arcane" → "wise, ancient"). **Scope note, not yet done**: the 15
      exclusive-body species (Draconic/Abyssal/Mythical — e.g. Frostwyren "patient mage",
      Wisdomkeeper "Ancient oracle") still have class jargon; left alone consistent with the
      standing "not yet" on migrating exclusives to the new training system, flagged here as a
      known follow-up if the user wants full consistency later.
    - Live-verified: full Bestiary page-text dump confirmed every group header, every row's
      major/flaw (or "minor only"), scrubbed flavour text, and correctly-locked exclusive groups
      (no minor shown) all render as designed — zero console errors.

-12. **Feeding-screen food gate (2026-07-24), live-verified, uncommitted:** the Advance Week food
    gate (item -6 below) only covered the STABLE screen — a player could still click "Next
    Monster"/"Continue to Stable" on the FEEDING screen itself with no food picked, which used to
    just silently leave that monster unfed rather than blocking anything. Now the same pattern
    applies one screen earlier: `App.tsx`'s per-monster "Next Monster →"/"Continue to Stable →"
    button disables (`!currentCareer.retired && !currentPlan.food`) and the food-picker panel gets
    a pulsing red outline (`.foods-missing` in `styles.css`) until a food is chosen for that
    monster — retired monsters are exempt (they were already skipped from feeding). Live-verified:
    button `disabled=true` + `.foods-missing` present with no food picked, both clear the instant
    a food button is clicked.

-11. **Bestiary content sync for the training-aptitude reimagines (2026-07-24), live-verified:**
    `src/bestiary.ts`'s condensed BIOS and `docs/BESTIARY.md`'s full entries were still keyed to
    the pre-rename ids (`skyrend`/`zephyri`/`serapelle`/`voltaray`/`corallux`) after item -10's
    species.ts renames — the in-game Bestiary already showed the new NAMES (pulled from
    `Species.name`) but fell back to the one-line `flavour` text instead of a full bio paragraph,
    since the BIOS lookup by id was missing. Wrote new condensed + long-form bios for all 5
    renamed species (Pinguox/penguin, Balaenix/shoebill, Carcharun/shark, Mantaris/manta ray,
    Lanterix/lanternfish), keeping each within its body type's existing theme (Avian's
    "migration/scattering," Aquatic's "the deep stirs") and referencing the correct
    post-rename ability names. `docs/GAME_DESIGN.md` still has stale references to the old names —
    left alone per the file's own "increasingly stale, code + CLAUDE.md are more current" caveat.
    Live-verified: Bestiary index shows all 5 new names/flavours, Pinguox's expanded entry shows
    the full new bio + correct innate names, zero console errors.

-10. **Per-species training aptitude overhaul (2026-07-23/24), live-verified, uncommitted — the
    biggest single change this session.** User's stated problem: "modifiers for training currently
    depend entirely on body type, the individual monster makes no difference." Replaces the old
    3-tier derived system (primary +20%/secondary +10%/weakness −20%, ALWAYS the top/2nd/lowest of
    a species' base stats — meaning two same-body-type species trained identically in practice)
    with a 2-source model: **body type grants one MINOR bonus** (+10%, same stat for every species
    of that body — `core.ts:BODY_MINOR`, one of the 6 base types → one of the 6 stats, all
    distinct: Mammal→STR, Avian→WIS, Marsupial→CHA, Aquatic→INT, Insectoid→CON, Reptilian→DEX),
    and **each species individually authors its own MAJOR bonus (+20%) and training FLAW
    (−20%, renamed from "weakness")** via `Species.trainingProfile` (now `{major?, flaw?}`,
    always excluding the body's own minor stat — verified no species' major/flaw ever duplicates
    its body-type minor). A handful of "vanilla" species (exactly one per body type — Kongrath,
    Corvaan, Quokkade, Maelurk, Scarabrute, Geckari) intentionally get NO major/flaw, just the body
    minor — the textbook example of their body type. All 30 base species' major/flaw assignments
    came directly from the user's own notes (two typos caught and fixed in review: Arachnyx's
    flaw was corrected from CON — which collided with the Insectoid CON minor — to DEX; Nautilux
    and Corallux/Lanterix had "minor" written where "flaw" was meant). The 15 exclusive-body
    species (Draconic/Abyssal/Mythical) are explicitly NOT migrated yet (user's own choice when
    asked) — they fall back to the legacy derivation unchanged, reshaped into the same
    `{minor, major, flaw}` return shape so every consumer only needs one code path
    (`game.ts:trainingProfileFor`: `species.trainingProfile` present → new authored system;
    absent → legacy sort-of-base-stats derivation, secondary→minor/primary→major/weakness→flaw).
    `core.ts` gained a distinct `AuthoredAptitude` type (`{major?, flaw?}`, what a species DATA
    ENTRY writes) separate from the resolved `TrainingProfile` (`{minor, major?, flaw?}`, what
    `trainingProfileFor` RETURNS) — needed because authored entries never specify minor themselves.
    Every consumer updated: `game.ts:statTrainingBonus`/`statMalusMultiplier` (field renames only,
    same magnitudes), `town.ts`'s post-tournament exp-reward split (60/40 major/minor, or 100% into
    minor for a vanilla species with no major), `App.tsx`'s `Signature` component/`TrainBlock`
    aptitude-coloring/stable-screen stat tags (all renamed primary→major, secondary→minor,
    weakness→flaw; `Signature` and the stat tags now handle the vanilla no-major/no-flaw case
    gracefully), `validate.ts`'s class-stat-collision check (renamed field, see the open question
    at the top of this file).
    - **5 species fully reimagined** (name + appearance + backstory), each keeping its original
      base stats/class/lifespan/id-slot but getting a new identity to fit its user-assigned
      major/flaw: **Skyrend→Pinguox** (raptor→penguin, CON major fits an armoured diver; kept its
      original innate/ultimate names since they already fit a diving hunter), **Zephyri→Balaenix**
      (swallow→shoebill, STR major flips the old "evasive multi-hit skirmisher" kit to a
      patience/ambush kit — innates renamed Evasion→Ambush Strike, Flurry→Statue Stance, ultimate
      Thousand Cuts→Sudden Reckoning), **Serapelle→Carcharun** (sea-turtle→reef shark, kept Sage
      class/WIS-INT base stats as a deliberate "ancient wise elder" subversion rather than a raw
      brawler; only renamed the shell-specific innate Ancient Carapace→Weathered Hide),
      **Voltaray→Mantaris** (electric ray→manta ray, user-approved via AskUserQuestion; fully
      re-themed since the old kit was explicitly electric — Live Wire→Current Rider, Static
      Field→Wing Current, ultimate Thunderstorm→Tidal Wingsweep), **Corallux→Lanterix** (coral
      crab→lanternfish; renamed the shell-specific Coral Guard→Abyssal Glow and ultimate Reef
      Blade→Abyssal Flare). `battle.ts`'s `INNATE_EFFECTS` table updated in lockstep for every
      renamed ability (same mechanical values, new keys) — verified no other species shared any
      renamed key before removing the old ones. Species ids also changed
      (skyrend/zephyri/serapelle/voltaray/corallux → pinguox/balaenix/carcharun/mantaris/lanterix)
      — see item -11 for the bestiary-text follow-up this required.
    - Verified: `tsc --noEmit` clean, production build clean, `validateDesign()` run standalone
      (surfaced the two flagged cases noted at the top of this file, both traced to explicit user
      data, not implementation bugs).

-9. **Scouting report UI overhaul (2026-07-22), live-verified, uncommitted:** the plain
    "Name — Class · move, move, move" text line is replaced with `App.tsx:ScoutReport`, a card
    shaped exactly like `MonsterCard` (sprite, name, species/body/sex, flavour, badges, element,
    stat bars, loadout) — the tier split itself is unchanged (`basic` = class + loadout, `full` =
    + stats; user explicitly chose to keep the existing 2-tier split rather than add more after I
    raised the option). Design principle, user-specified: the card renders in the SAME shape
    whether or not a tier's been bought — identity fields never gated behind any tier (sprite,
    name, species, body, flavour, element resist/weak, league, lifespan) render immediately since
    they're already visible once you're facing the team in the bracket; only `className` (badge)
    and `loadout` gate on `knowsKit` (`tier === 'basic' || 'full'`), and only the 6 stat bars gate
    on `knowsStats` (`tier === 'full'`). Ungated-and-not-yet-bought fields render as `??` text; an
    ungated stat renders as a flat locked bar (`.stat .bar.locked`, a dim `>` glyph) instead of a
    filled one — the row never disappears or reflows when the tier is later purchased, it just
    fills in. The buy buttons for `Fight` and both scout tiers now sit alongside the always-visible
    card (previously the card only rendered AFTER a purchase, buttons before). Live-verified all
    three states in one playthrough: pre-purchase (`??` badge, `>` bars, `?? — pay to scout` in
    place of the loadout list), post-basic (real class badge + real loadout, stats still `??`/`>`),
    post-full (real colored stat bars matching MonsterCard's exact bar styling) — gold deducted
    correctly at each step (5g then 15g), zero console errors.

-8. **Progressive bracket reveal (2026-07-22), live-verified across two full playthroughs,
    uncommitted:** immediate follow-up to item -7's grid — "the bracket must begin empty, and only
    fill up with X's on a loss and O on a win... must not start complete." The whole event is still
    pre-simulated in one shot (`resolveTournament` inside `advanceWeek`, unchanged), so this is a
    pure display-layer fix: `BracketGrid` now takes `allMatches` (full event, used ONLY for
    name/icon identity — a team shouldn't stay anonymous just because it hasn't fought yet) and a
    separate `revealed` list (used for the actual O/✕/– cells). `revealed` is computed in the
    `'bracket'` sub-phase as `lb.matches.slice(0, indexOf(last-completed player match) + 1)` — 0
    completed player matches → empty slice → fully blank grid on first entry; each "Back to
    Bracket" reveals exactly the one match just fought (verified: screenshot after match 1 of 3
    showed precisely one filled cell pair, everything else blank). "Other results" is filtered
    to the same `revealed` subset so it doesn't spoil rival-vs-rival outcomes early either; it's
    hidden entirely while empty. The `'announce'` screen passes `lb.matches` as both props (event
    is over, everything revealed). Re-verified end-to-end in a **fresh browser tab** (no HMR
    history) specifically because the live-edit session itself threw one stale
    `<BracketGrid>` prop-shape error from Vite hot-reloading mid-edit — confirmed via a clean
    reload that it was an HMR artifact, not a real bug (zero console errors across a full 3-match
    Wood-cup playthrough in the fresh tab).

-7. **Bracket follow-ups (2026-07-22), live-verified, uncommitted:** three fixes/requests raised
    right after playing the item -6 bracket screen for the first time.
    - **Real names/icons instead of "Rival Team N"** (`App.tsx:teamRoster`/`teamName`): the internal
      `label` on `EventStanding`/`EventMatch` ("Your Team"/"Rival Team 1"...) is still used as the
      stable bookkeeping key (must stay unique for matching), but every place it's SHOWN to the
      player now resolves through the roster instead — `teamRoster(label, matches)` finds the
      first match containing that label and returns its `Monster[]`, `teamName(...)` joins member
      names with " & ". Applied to the bracket grid's row headers (name + lead-monster `Sprite`),
      "Other results", "Next up: X", and the fight screen's "Match N of M: X vs Y" header.
    - **Round-robin results GRID replaces the old win/loss list** (`App.tsx:BracketGrid`, new
      component, reference: a Monster Rancher bracket screenshot the user attached): numbered rows
      (placement order) with icon + full team name, numbered columns, diagonal hatched/blank, each
      off-diagonal cell is the ROW team's result against the COLUMN team — `O` green (win), `✕` red
      (loss), `–` grey (draw), resolved per-cell from `lb.matches` (no new data needed, matches
      already contain every pairwise result). Used in both the bracket hub and the final
      announcement screen (was previously two different truncated lists — top-3 only on
      announce). New CSS block at the end of `styles.css` (`.bracket-grid*`), scrolls inside its
      own wrapper (`overflow-x: auto`) rather than the page, since a 6-team Masters field is 7
      columns wide.
    - **License-vs-tournament-league gating — confirmed ALREADY correct, no code change**: user
      asked to prevent entering a tournament above license. `town.ts:eligibleForTournament`
      (`c.licenseIndex >= tIdx`) already blocks this both in the `TeamPicker`/1v1-select pool
      population AND again at `signUp`'s own validation — a Wood-license monster (`licenseIndex
      0`) was already unable to appear in a Copper+ tournament's eligible pool or sign up for one.
      Verified by re-reading both call sites; no gap found, nothing to fix.

-6. **Playtest-feedback pass (2026-07-22), live-verified end-to-end in the browser, uncommitted:**
    a batch of fixes/features from the user's own playtest notes, each confirmed via a follow-up
    Q&A round before implementation (excursion economy, injury model, bracket UX, lore, sudden
    death) — see the git-uncommitted diff in `src/App.tsx`/`battle.ts`/`game.ts`/`town.ts`.
    - **Excursion gold now scales by league, capped low on purpose** (`game.ts:excursionGold`):
      was a flat 30-80g regardless of monster rank; now min/max is derived from ~1/3 of that
      league's own 1st-place tournament reward (`LEAGUE_TOP_GOLD`, hand-kept in sync with
      `town.ts`'s `CIRCUIT_REWARDS`/`PRESTIGE_EVENTS`), so Wood tops out at 33g, Tamer Elite at
      200g — user-specified as "we don't want this to be hugely profitable." The roll is
      squared-uniform (`rng()*rng()`, one draw) so it skews hard toward the bottom of its range —
      user spec: "more likely to give the bottom end... eventually this will be turned into a
      minigame" (that minigame itself is NOT built — this is just the payout curve it'll plug
      into). Both `previewWeekEffects` and `applyWeek` call the same function, same rng-call-order
      contract as before.
    - **Advance Week is gated on every active monster having food chosen** (`App.tsx` rail): user
      spec "monsters always require food" — the button disables (with a title tooltip naming which
      monsters are unfed) and the rail note swaps to a `🍽 N unfed` warning instead of the normal
      💪/😴/🧭 pre-flight summary. Live-verified: selecting one of two monsters' food left the
      button disabled with the correct monster named; picking the second food re-enabled it.
    - **Intensive-drill malus hits harder on a training weakness** (`game.ts:statMalusMultiplier`):
      a malus landing on the species' training weakness stat is ×1.5 instead of flat — weakness
      stats already train 20% slower, so losing one now stings more too. Primary/secondary/neutral
      maluses are unchanged. Applied identically in `applyWeek` and `previewWeekEffects`.
    - **Tournament injury model simplified** (`town.ts:resolveTournament`), replacing the whole
      per-individual `wasKOd`/HP-MP-carry-forward system built in the NvN team-battle work below:
      user spec "we want a monster to heal to full health inbetween each fight, they do not carry
      injuries throughout the tournament... they are only injured when they return to the ranch."
      Every match — for both the player's team AND every rival team — now starts at full HP/MP
      (`playerTeam` is forced to `maxHp`/`maxMana` before the round robin; rival `Monster` objects
      already default to full since they carry no `hp`/`mp` fields). No mid-event carry-forward,
      no per-match KO tracking. Post-event, regardless of placement or how any match went, each of
      the player's own monsters comes home at a flat random 0-50% of max HP *and* MP (independent
      seeded roll per monster: `g.seed:week:tournamentId:injury:careerId`) — this is strictly
      simpler code, not just a different number (removed `wasKOdEver`, `lastPlayerFinals`, and the
      per-match `pa.team =`/`pb.team =` reassignment block entirely). Live-verified: a monster
      entered its match at full 90/90 HP (previously-injured state from an earlier fight in the
      same session did NOT carry in), then came home at 29/90 (32%) — within the promised band.
    - **Rival-team generation extracted into `town.ts:generateRivalTeamsForTournament(g, t)`** —
      pure/deterministic (same `(seed, week, tournamentId)` → same teams), pulled out of
      `resolveTournament` so it can be called ahead of resolution for scouting/bracket preview
      without duplicating the band-roll/role-composition logic. `resolveTournament` now just calls
      it instead of inlining.
    - **Scouting** (`town.ts:scoutFee(league, tier)`, UI in `App.tsx`'s bracket hub): pay gold to
      reveal the next opponent team before fighting them — `'basic'` (class + loadout) costs
      `(leagueIndex+1)*5`g, `'full'` (also raw stats) costs `(leagueIndex+1)*15`g, both scaling
      with league same shape as `entryFee`. Implemented as a pure UI reveal-gate over data that's
      already present in `lastBattle.matches` (matches are pre-simulated when the week advances,
      same as before) — scouting doesn't change any outcome, it only unlocks display, paid via a
      direct `game.gold` debit at click time. Per-match reveal state (`scouted: Record<matchIdx,
      'basic'|'full'>`) is local component state, reset each new tournament event. Live-verified:
      480g→465g (15g full-scout fee charged), correct class/loadout/stats rendered for the
      upcoming rival team.
    - **Monster-Rancher-style bracket hub replaces the old linear step-through-matches screen**
      (`App.tsx`, the whole `phase === 'battle'` block rewritten): a `battleSub` state machine
      (`'preamble' → 'bracket' → 'fight' → 'bracket' → ... → 'announce'`) — the player returns to
      a real bracket/standings view between every one of their own matches (not just at the very
      end), sees the scouting panel for the next opponent there, and only enters `ArenaBattle` when
      they click Fight. `matchIdx`/`battleOver` state (pre-existing) still drives which match plays;
      `battleSub` is new and reset alongside them in `doAdvanceWeek`. Rival-vs-rival results still
      shown as plain text ("Other results"), not replayed. Live-verified the full loop: preamble →
      bracket → scout → fight → back-to-bracket → next opponent → fight → back-to-bracket →
      See Results → final announcement → Continue → feeding screen digest.
    - **Pre-cup lore preamble + post-cup announcement** (`town.ts:cupLore(t)`, new `CupLore`
      interface `{intro, outroFlavour}`): hybrid sourcing per user's own choice of the three
      options offered — hand-authored `PRESTIGE_LORE` (one paragraph + closing line each) for the
      5 fixed annual prestige events (Silver Crescent → Apex Invitational), templated
      `CIRCUIT_LORE_FLAVOUR` (one setting phrase + one closer phrase per league, Wood→Iron) for the
      circuit cups that regenerate a new name every game-year. `LastBattle` gained a
      `tournamentId` field (previously absent — nothing needed to re-look-up the `Tournament`
      object post-resolution) so the battle screen can re-fetch the full `Tournament` for `cupLore`
      and its `rewards.gold` display. The preamble screen shows before the bracket; the outro
      flavour line shows on the final announcement screen alongside the real standings/placement
      (which come from actual match data, not the lore table).
    - **Round-35 sudden-death chip damage** (`battle.ts`, inside `simulateTeamBattle`'s round
      loop): from round 35, every living combatant takes flat TRUE damage (bypasses ward and
      mitigation entirely — `c.hp -= chip` directly) equal to `2^(round-35)` — 1, 2, 4, 8...
      doubling each round — applied after normal turns/status-ticks, before the round's final
      `snap()`. Guarantees a winner within ~12 rounds of the clock starting regardless of HP pool
      size, well inside the pre-existing 60-round hard timeout (which stays as an untriggerable
      backstop now). User chose this flat-doubling design over the alternative offered
      (a stacking %-damage-taken/dealt modifier), reasoning it stays predictable and can't be
      out-mitigated by a defensive team comp. Not yet triggered in an actual live playthrough fight
      (early-game matchups rarely run this long) — verified by code review of the exact
      round-gate/chip-formula/true-damage-application logic instead.

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
  species' innate in `species.ts` requires renaming the matching key here too). Each species has
  TWO innates but only ONE is ever active (`Monster.activeInnate`, 0 or 1) — the 2nd is an
  alternative, not an upgrade, and unlocks at `INNATE_SECONDARY_LEVEL` (300) in a stat; swapped via
  the Ability Selection UI, same as loadout moves.
- Ultimates were REMOVED (2026-07-25) — no once-per-battle trigger exists anymore
- Statuses: blind/poison/burn/fear/confusion/stun + (2026-07-25) bleed (stacking, cap 3),
  silence (Attack/Block only), vulnerable (+20% taken), knockback (acts LAST — live turn-order
  manipulation), sleep (wakes on damage), doom (delayed burst, cleansable), healblock (heals/
  lifesteal/regen ×0.4), haste (acts FIRST — the one BENEFICIAL status, cleanses don't strip it),
  charm (hostile hits strike own team). Framework move-effects awaiting adoption: maxHpDmg,
  bonusVsStatus (combo setup→payoff, AI-aware via effPower), thorns, hpRegenBuff; tauntForce via
  'allEnemies' = mass taunt

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
