# Balancing — findings & working reference

Living doc for the economy/progression balance effort. Condensed from the
2026-07-23 balancing sessions. Numbers are current as of **v0.74**.

## Design principles (from the user)
- **Challenging but possible.** The top (Masters / Tamer Elite) should be hard-won, not gated shut.
- **No fixed timeline / forced pacing.** We do NOT target "reach X by year N." A skilled player goes faster; a mediocre one takes a long time. Both are fine.
- **Slow iterations.** Small tuning steps, each **validated against the long-haul sim**, then adjust. The sim is the arbiter.

## How we measure — the long-haul sim
A competent-player bot plays the full game (economy + cups + trials + licenses +
breeding) reporting **peak league, end gold, dynasty generation, cup record**.
As of v0.81 it is **committed** (no longer scratch): `sim/bot.ts`, run with
`npx tsx sim/bot.ts [years] [seeds]` (default 15×3). It's outside the app build
(`tsconfig` includes only `src`) and drives the real exported game functions —
including the v0.81 deferred flow (stage → per-fight `MatchOrders` → finalize)
via a "coach AI" (`coachOrders`) that uses **every** tactics lever (temperament,
scouting-informed target priority, mana policy, opening sequence, survival,
control-first, combo, formation, protect, focus/mark). Keep it in sync when
mechanics change. Peak league + whether breeding fires are the headline metrics.
**v0.81 baseline (15y × 4 seeds):** Silver ×4, gen-2 ×4, ~210 cups/seed,
~55–75% cup wins, 24k–33k end gold — a stable competent-but-unoptimised floor
(a skilled human should still outrun it, per the design principles above).

## Current numbers

### Cup rewards (1st-place gold; exp = gold/2)
| League | Wood | Copper | Tin | Bronze | Iron | Silver | Gold | Platinum | Masters | Tamer Elite |
|---|--|--|--|--|--|--|--|--|--|--|
| Regular cup | 120 | 180 | 250 | 330 | 420 | 500 | 590 | 690 | 800 | 920 |
| Marquee event | — | — | — | — | — | 650 | 760 | 880 | 1010 | 1150 |

- **Roster stipend** `CUP_ROSTER_STIPEND = 20`g per *extra* team member (income scales a bit with team size).
- **Placement** `PLACEMENT_REWARD_FRACTION`: 1st 100% · 2nd 65% · 3rd 40% · 4th+ 0.
- **Punch-down** `rewardMultiplier`: 100% at league · 50% one below · 10% two+ below.
- **Entry fee** `entryFee = (leagueIndex + 1) × 10`g (Wood 10 … Tamer Elite 100).

### Other income
- **Trainer stipend (v0.72):** `+5g/wk × trainer level` (Lv1 = 5 … Lv10 = 50/wk). Paid weekly. **Hook for achievements:** achievements will grant trainer XP → level → stipend.
- **Trainer XP** `TRAINER_XP_PER_LEVEL = 250`; from cup podiums + raising monsters to retirement. Also grants **+1 barn slot / 2 levels**.
- **Pension** (retired champions): 2 + 1/podium + 2/championship, cap 10g/wk.
- **Stud income** (frozen legacy w/ Stud Book): 1/podium + 3/championship, uncapped.
- **Excursion:** cap = `LEAGUE_TOP_GOLD × 0.4` (was ⅓), bottom-skewed (`rng²`). `LEAGUE_TOP_GOLD` Wood 110 … TE 760, tuned **independently** of cups but must stay ≤ cup gold (validated).

### Costs / sinks
- **Food** — the dominant sink (~60–70% of spend). Rations swing ±60%; training/premium 0.9–1.5×. Forage fallback only when gold < 10.
- **Monsters** ~MARKET_BASE 150 ±60%. **Barn** 120 × current cap.
- **Fusion** 1000g. **Breeding** `BREED_COST = 300`. **Lab/stud slots** expand 400/800/1600.
- Comfort set 300/500/1000, Extreme Manual 1500, food contracts 400/1500, breeding licenses 800/2000, peddler gear 200–1250/tier, Elder Tonic 500, Stud Book 750.

### Progression / combat gates
- **League caps** (per-stat): Wood 100, Copper 200, Tin 300, Bronze 400, Iron 500, Silver 600, Gold 700, Platinum 800, Masters 900, Tamer Elite 1000.
- **Team size:** Wood/Copper 1 · Tin 2 · Bronze/Iron 3 · Silver/Gold 4 · Platinum 5 · Masters/TE 6.
- **Trial to rank up:** beat a champion team scaled to `leagueCap × rivalBudgetMult(leagueIdx) × TRIAL_CHAMPION_MULT(1.25)`.
- **Rival budget escalation (v0.75):** `rivalBudgetMult(i) = 1.8 + i × 0.02` (Wood 1.8 → Tamer Elite 1.98). Was a flat 1.8 — a constant ratio the player's compounding power outgrew, making late leagues walkovers. The gentle per-league ramp keeps difficulty pacing the player. Applies to cup rivals, challenge skirmishes, and rank-up champions. **Deliberately shallow** (first increment — tune the step up from the sim if the top is still a coast).
- **`statCapFor = leagueCap × potential`** (gen-1 fusion hard-capped at Platinum = 800).
- **Career span** ~6 years base; **+2yr pedigree bonus (`PEDIGREE_SPAN_BONUS`, v0.73)** for fusion / prestige (Draconic/Abyssal/Mythical) / bred (gen≥2) monsters — wild base monsters unchanged.

### Breeding & fusion
- **Potential:** wild = 1.0; **+0.10 / generation** + up to **+0.08** champion-parent bonus; **cap `MAX_POTENTIAL = 1.5`** (~4–5 generations to reach). Breed cost 300, ≤2 children per stud, heritage stat +10%, **head-start `BREED_HEAD_START = 0.45`** (child hatches at 45% of parents' averaged stats — v0.73).
- **Fusion:** 1000g, consumes two monsters **from the stable OR the freezer (v0.74 — no freeze step)**; result = **all stats 100**, **+20% on each parent's major** + rolled +10%/−10%, species by spinning wheel, **potential 1.15 (3★, v0.74)**, gen-1 **Platinum-capped**, then fully breedable (gen-2 ≈ 3★ → Tamer Elite).

## Sim findings

### v0.71 → v0.72 (economy pass)
| | v0.71 (before) | v0.72 (after) |
|---|---|---|
| Peak league (3 seeds) | Tin / Bronze / Bronze | **Platinum / Gold / Gold** |
| Breeding | 0 | **gen-2, ~4 dynasties/seed** |
| End gold | 30–114g (cash-starved) | **1,900–3,300g (surplus)** |
| Fusions | 0 | **still 0** |

The economy pass (cup gold up + trainer stipend + excursion nudge) **fixed the
money gate**: the wall moved from Bronze up to Gold/Platinum, and breeding
dynasties now fire. Masters/TE remained unreached at the ~19-year sim cap.

### Diagnosis — what gates the top now (NOT money)
The 1,900–3,300g surplus proves gold is no longer the constraint. The top is
gated by:
1. **The roster-assembly treadmill.** Higher leagues need more monsters (4v4 → 6v6) all trained to champion-grade stats *simultaneously*; each takes years (≈1 stat/week, stamina-gated) and **ages out at ~6 years**. By the time monster #4 is ready, #1 is retiring. Arrivals show a ~4-year stall just at Iron (3v3).
2. **Potential is NOT the binding limit.** At Masters (cap 900) even potential 1.0 has room to train champion stats — raising the cap makes elites *stronger*, not the top *more reachable*. Potential helps only indirectly (higher ceiling + bigger breeding head-start).
3. **Ran out of clock, not road.** All seeds stopped at the sim's fixed 19-year cap while still climbing — "peak Gold/Platinum" is the *pace*, not a wall.
4. **The two accelerants went unused:** fusion (0×) and deep breeding (only gen-2). A player leaning on both goes further.

## Open levers (candidate next iterations — NOT yet done)

### Encourage fusion (ranked by impact)
1. ✅ **DONE (v0.74)** Potential edge — gen-1 fusion 1.075 → **1.15** (seeds a high-potential bloodline).
2. ✅ **DONE (v0.74)** Cut friction — fuse straight from the stable (no freeze step). (Cost still 1000g.)
3. **Signature skills** (task #112) — an exclusive strong move per fusion species = the combat draw.
4. **Longer career span for fusion monsters** — more training years for the "burn-bright" specialists.
5. Keep the **gen-1 Platinum cap** so none of this is an instant-win.

### Make the top more reachable (if desired)
- **Head-start 0.35 → ~0.45** (best lever — shortens the aging treadmill directly).
- **Potential step 0.10 → 0.15** (dynasties compound faster).
- **Career span +** (more training time per monster).
- **Do NOT raise MAX_POTENTIAL (1.5) yet** — not the binding constraint.

### Still-open economy items
- Fusion firing in practice (bot never coordinates it — a human would; validate with the levers above).
- Whether the v0.72 bump overshot (Bronze → Gold/Platinum is ~2–3 leagues; dial back top-league cup gold or stipend if too generous).
- Food-cost relief for large rosters (bulk-feeding discount) — deferred lever.

## v0.77 — the big economy correction

**Diagnosis (measured, 25y × 3 seeds).** Income was inverted: retiree **pension 45%**,
**trainer stipend 40%**, **cup prizes just 7%**. Both faucets were perpetual, uncapped and
cumulative (retirees never leave; stipend grew forever), while every sink was a one-off.
An average player finished on **~180,000g** with nothing to spend it on.

**Fixes**
- **Pension REMOVED.** Retirement Ranch → **🏛 Hall of Fame**: honours only, no income,
  **unlimited room** (retirees no longer occupy barn slots — they used to clog it).
  Breeding still requires freezing into the limited stud farm.
- **Trainer stipend capped**: was `5g × level` uncapped (~95g/wk by LV19). Now **1g/level,
  flat from level 15 = 15g/wk**. A LV53 trainer still earns 15g/wk.
- **Cup gold +8%** and **Extreme Manual 1500 → 1200**, to re-open the advanced systems the
  cut had priced out.

**Result:** average end gold **180k → 2.8–15.4k**; cups became **~81%** of a good player's
income. Gold is a real constraint again.

### Gen-1 training ceilings (v0.77)
A monster you did not BREED is walled. Breeding (gen 2+) is the only unconditional way past.
| Kind | Ceiling |
|---|---|
| Wild / market, no coach | **800** |
| Wild / market + Market Coach I | **900** |
| Wild / market + Market Coach II | **1000** |
| **Fusion (gen 1)** | **1000** |
| Bred gen 2+ | `leagueCap × potential` (1100+ at TE) |

Rank-up needs `leagueCap − 10`, so: **Masters** requires coach I / fusion / breeding;
**Tamer Elite** requires coach II / fusion / breeding. The Coach's league gates (Gold, then
Platinum) line up exactly with where the lift is needed. Fusion gen-1 now **out-ceilings
uncoached market stock by 200** — that's the draw that pays for 1000g + two monsters.

### Potential ladder (verified against `breedPotentialV2`)
| Line | Gen 1 | Gen 2 | Gen 3 | Gen 4 | Gen 5 | Gen 6 |
|---|--|--|--|--|--|--|
| Bred, plain parents | 1.00 | 1.10 | 1.20 | 1.30 | 1.40 | **1.50** |
| Bred, champion parents | 1.00 | 1.18 | 1.36 | **1.50** | — | — |
| Fusion, plain parents | 1.15 | 1.25 | 1.35 | 1.45 | **1.50** | — |
| Fusion, champion parents | 1.15 | 1.33 | **1.50** | — | — | — |

All lines converge at `MAX_POTENTIAL 1.5`; fusion + champion parents is the fastest route
(3 generations vs 4 or 6).

### Two-profile sim (25y × 3 seeds, post-change)
| | Good player | Average player |
|---|---|---|
| Peak | **Tamer Elite / Masters / Tamer Elite** | Iron / Bronze / Silver |
| Best stat | 1000 / 930 / 1000 | 260 / 104 / 430 |
| Cup wins | 90–106 | 25–33 |
| End gold | 0.6–2.2k (fully invested) | 2.8–15.4k |
| Coach bought | **2/2 every seed** | never |

⚠️ **Known gap:** fusion still fires only ~1× per 25 years. The binding constraint is NOT
gold — it's needing two *spare* monsters forming a valid body pair (Mammal+Reptilian /
Avian+Aquatic / Marsupial+Insectoid). A roster/recipe friction, not an economy one.

## v0.78 — freeze-to-breed (the Lab is the only preservation route)

**Problem.** Breeding stock could only be banked *after* retirement (`freeze()` required
`c.retired`), and lab-frozen monsters were breeding-ineligible. So the intended plan —
"freeze the ones you want to breed" — was impossible, and the incentives ran the other way:
retirement preserves stats and the Hall of Fame is unlimited, so waiting was strictly better.
Dynasties stalled at **gen 2** in every sim ever run.

**Change.** One preservation store: `labFrozen`. Breeding and fusion both read it.
`freezeToLab()` refuses retired monsters. Stud farm (`frozen`, `studSlots`, `freeze`, `thaw`,
`expandStud`) deleted; saves migrate. Hall of Fame = honours only.

**Reprice** (the Lab was costed as an optional parking bay, not core infrastructure):
| | was | now |
|---|--|--|
| `LAB_SLOTS_BASE` | 2 | **3** |
| Expansions | 400 / 800 / 1600 | **250 / 500 / 900** |
| Upkeep per monster | 5g/wk | **3g/wk** (loan 3 → **2**) |

**Results, 25y × 3 seeds (good player)**
| | Old retire→stud | Freeze-only, untuned | Freeze-only, tuned |
|---|---|---|---|
| Peak | TE / Masters / TE | Masters / Gold / Platinum | **TE / Platinum / Gold** |
| Best stat | 1000 / 930 / 1000 | 886 / 692 / 800 | 975 / 801 / 679 |
| Breeds | 4 | 4 | **6** |
| Generation | 2 | 2 (one seed 3) | **2 / 3 / 3** |

Gen 3 on two of three seeds is the deepest any sim has reached. The untuned row shows why the
reprice was needed: freezing removes a monster from the roster mid-career, and at 2 slots /
400g / 5g-wk it competed directly with the Market Coach (the thing that actually lifts your
stat ceiling) — one seed never afforded the Coach at all.

⚠️ **Open:** more variable than the old path (one seed stalled at Gold, 679 — eleven points
short of the 690 needed to rank into Platinum). Also the "average player" bot is modelled as
*always* missing the freeze window, so it ends gen 1 with no breeding and 30–40k unspent gold;
that is probably harsher than a real casual player and overstates the skill gap.

## Ledger of changes made
- **v0.62** — economy pass #1 (stipend/pension/comfort/peddler/breeding/soft-lock).
- **v0.72** — cup gold ↑ + trainer gold stipend + excursion nudge. Peak Bronze → Gold/Platinum; breeding now fires.
- **v0.74** — fuse-from-stable (removed the freeze hoop) + fusion potential 1.075→1.15. Mechanic verified firing in the sim; fusion now a 1-click stable action.
- **v0.73** — pedigree span +2yr (fusion/prestige/bred) + bred head-start 0.35→0.45. **Peak Gold → Masters/Tamer Elite** (1 seed reached TE @ yr 12.7); top is now reachable via breeding, still challenging (12–19yr). Fusion still unused by the bot.
- **v0.75** — difficulty escalation: flat `RIVAL_BUDGET_MULT 1.8` → `rivalBudgetMult(i) = 1.8 + i×0.02` (Wood 1.8 → TE 1.98). **A/B (25yr × 3 seeds, rebuilt bot):** flat → Gold/Gold/Bronze; escalating → Gold/**Silver**/Bronze — one seed held back a league, win-rates dipped slightly, no collapse. Gentle friction confirmed, first increment. ⚠️ **Instrument caveat:** the rebuilt bot trains only basic drills / 3-stat builds and peaks at **Gold** — much weaker than the prior Masters/TE bot, so it can't reproduce the skilled-human "easy run to Masters" the change targets. Money is a non-constraint at every peak (48k–121k surplus). Next: either strengthen the bot (intensive/extreme drills, comfort/tonic, timed breeding) to test the top directly, or nudge the step up (0.02 → ~0.03) and re-A/B.

## v0.861 — validation run for the un-simmed v0.85–v0.86 batch

**What accumulated without a sim pass:** life-stage training Teen 1.0→1.35× / Fully Grown
0.95→1.15×; prestige overhaul (base stats ~144/~158, gen-1 cap 800→1000, 9–12y careers,
−5%/no flaws); COACH_PRESTIGE_MULT; BREED_HEAD_START 0.45→0.15→0.30; free cup entry;
trial gold; ≥2 cups/month.

**Run (25y × 3 seeds, v0.81 bot) + A/B isolating the training multipliers:**
| | OLD mults (1.0/0.95) | NEW mults (1.35/1.15) |
|---|---|---|
| Peak | Iron / Silver / Silver | **Silver / Silver / Silver** |
| End gold | 56–66k | 50–71k |
| Cup 1sts | 234–237 | 209–270 |
| Trials won | 4–5 | 5 |
| Generation | 2 | 2–3 |

**Read:** the training bump is a mild accelerant, not a runaway — the stat cap
(league cap × potential) binds either way, so faster training mostly reaches the same wall
sooner (one seed converted Iron→Silver; ~+10% cup wins). No economy spiral. The two
standing caveats predate this batch and still dominate the signal: (1) money is a
non-constraint (50–70k unspent — sinks needed at the top end, or the bot under-spends);
(2) the bot's basic-drill 3-stat build stalls at the Silver→Gold trial, so the top half of
the ladder (where the prestige/coach changes actually live) is untested by this instrument.
**Next:** strengthen the bot's economy brain (intensive/extreme drills, comfort/tonics,
licenses+prestige purchases, timed freezes) before drawing conclusions above Silver.

### v0.861 follow-up — full-economy bot rebuild + retest (same code, better instrument)

The bot now exercises EVERY mechanic (all three drill tiers incl. the Extreme Manual,
aptitude-aware 3-stat builds with maluses steered off-build, training foods + Vigor Melon
rescues, market slots/coach, prestige licenses + prestige-preferring recruitment to a
league-sized stable, barn/comfort/lab/pantry purchases, infirmary healing, peddler tonics,
Elder freezing, best-pair breeding, spare-pair fusion, trial-first scheduling).

**25y × 3 seeds, current live tuning:**
| seed | peak | @yr | best stat | gen | cups→1sts | trials | breeds | coach | prestige owned | end gold |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Tamer Elite | 10 | 1180 | 2 | 192→125 | 9 | 4 | 2/2 | 13 | 702 |
| 1 | Tamer Elite | 10 | 1180 | 2 | 192→140 | 9 | 4 | 2/2 | 13 | 754 |
| 2 | Tamer Elite | 19 | 1170 | 2 | 211→117 | 9 | 4 | 2/2 | 10 | 1037 |

**Reads:**
- **The whole ladder is beatable** — first time any sim instrument has seen Masters/TE.
  An optimal player summits in **~10y** (worst seed 19y); the v0.73 design point was
  12–19y for a strong player, so the v0.85/0.86 buff stack has shaved ~2–3y off the
  fast path. Borderline — a human is less optimal than this bot; watch, don't panic-nerf.
- **The gold hoard was bot passivity, not a design hole**: fully-invested end gold is
  ~0.7–1k (vs the old bot's 50–70k). A good player has real sinks all the way up.
- **Fusion never fires for a prestige-heavy stable** — prestige bodies have no fusion
  recipes, so once the Special License lands, fusable base bodies stop entering the
  roster. Structural tension worth a design look (prestige recipes? keep as niche?).
- **Gen stalls at 2** even with 4 breeds: freezer slots fill with the original parents,
  so bred children rarely get frozen before career end. Partly bot heuristics, partly
  a real slot-pressure feel a player would also hit.
- Sustained ~60–65% cup win rate at-league — strong but not degenerate.

## v0.87 — prestige scarcity increment #1 (market rarity + price premium + scout nerf)

**Problem (from the v0.861 full-economy run):** once the Special License lands, prestige
bodies are ~1/3 of all market rolls at ordinary prices — the roster goes all-prestige
(10–13 owned per 25y) and the ladder's fast path compressed to ~10y.

**Change (gentle first increment, all in `rollMarketOffers` — golden-safe):**
- `PRESTIGE_MARKET_CHANCE 0.12` — only 12% of would-be prestige rolls survive; the rest
  re-roll to base species. Measured stock: prestige fell 33% → **5.3% of offers**
  (~1 offer per 3 full restocks). The Market Scout pick deliberately bypasses rarity —
  scouting IS the hunting tool.
- `PRESTIGE_PRICE_MULT 1.5` on the rolled price (measured avg 209g vs 150g base).
- `SCOUT_CHANCE 0.15/0.25 → 0.12/0.20` — the hunting tool lands a touch less often.

**Retest (25y × 3 seeds, full-economy bot):**
| | before | after |
|---|---|---|
| Peak @yr | TE@10 / TE@10 / TE@19 | TE@18 / TE@17 / Masters@19 |
| Prestige owned | 13 / 13 / 10 | **4 / 3 / 1** |
| Cup 1sts | 125 / 140 / 117 | 98 / 130 / 76 |
| End gold | 702–1037 | 719–806 |

The fast path moved from ~10y back into the 12–19y design band, prestige ownership landed
in the intended 2–4 range, money stays fully invested, and one seed now tops out at
Masters — the summit is once again earned. License-price increase (option 3) held in
reserve; fusion still never fires (structural, separate design question).

## v0.87 — mid-game difficulty pass (four small nudges, one increment)

**Problem:** every seed cleared Tin→Gold nearly frictionless — mid trials never failed,
mid cup win rates peaked, difficulty lived only in the last two trials.

**Nudges:**
| knob | was | now |
|---|---|---|
| `RIVAL_BUDGET_STEP` | 0.02 | **0.03** (v0.75's prescribed increment; TE mult 1.98 → 2.07) |
| `RIVAL_BAND_MIN` | 0.60 | **0.65** (fewer rolled-weak teams = fewer free round-robin wins) |
| trial champion mult | 1.25 flat | **1.30 for Bronze→Gold** (`trialChampionMult`; top trials unchanged — already the hardest step) |
| `LICENSE_COSTS` mid | 220/350/520/750 | **235/410/610/860** (~10–15%; still monotonic + never-doubling) |

**Retest (25y × 6 seeds):** summit years stretched (TE @ 17/18/22/25 vs 17–18 clustered),
cup 1st-place rate fell ~20–25% across the board (72–119 vs 76–140), one seed now tops out
at Platinum (was Masters), and — first time ever — one seed reached **gen 3 / best stat
1270**. Money still fully invested. Mid-game friction is real without any collapse: the
distribution now runs Platinum → TE across six optimal-play runs, which is the shape we
want (summit possible, never guaranteed).

## v0.87 — interlocking gen-1 cap ladder (user spec)

**Change:** the Market Coach becomes a UNIVERSAL quality upgrade — it lifts wild AND
prestige walls by tier. `statCapFor` reads the coach tier from the synced wildCap:

|            | no coach | coach T1 | coach T2 |
|---|---|---|---|
| wild/market | **700** (was 800) | 800 | 900 (was 1000) |
| Draconic/Abyssal | **800** (was 1000) | 900 | 950 |
| Mythical | **900** (was 1000) | 950 | **1000** |
| fusion gen-1 | 1000 flat (unchanged) | | |
| **Primeval** gen-1 | **1100 flat** (v0.88) — the only gen-1 above the TE league cap | | |

Only fusion and a fully-coached Mythical reach 1000 — every other gen-1 now falls short
of the TE cap, so the summit belongs to bred dynasties. Saves re-sync wildCap on load.

**Retest (25y × 6):** 5/6 seeds reach TE (@15–25y), seed 5 still walls at Platinum.
Best stats 1000–1180 are now BRED gen-2 monsters — and notably seed 4 summited with
**zero prestige owned**: with prestige walls lowered, optimal spending shifted from
"buy prestige" to "breed earlier", which is precisely the intent. The ladder made
dynasty the endgame route without making the summit unreachable. Fusion still 0 —
its problem is recipe friction, not ceilings.

## v0.88 — Primeval: the prestige fusion (Mythical + Draconic/Abyssal)

**New fusion class** (5 species: Aeonrex, Stellavore, Chronoshell, Originmage, Worldsong —
roster 65): two body-pair recipes (Mythical+Draconic, Mythical+Abyssal) feed one class.
**1.25× potential** (vs 1.15 base fusion) makes Primeval the premier founder of endgame
bloodlines. Element affinity inherits Mythical's air/earth (all 12 pairs were taken —
one sanctioned validator exception). Fusion bodies stay out of wild/market generation —
goldens untouched.

**Making the bot prove it** (three instrumented findings, each a real player insight):
1. The scout was priority-starved — bigger purchases drained gold below its threshold
   every week for 25 straight years. Promoted: scouting is the prestige-hunting tool.
2. The pair's Elder windows never overlap (the Mythical arrives ~a decade later) —
   fuse YOUNG, weakest-of-each-body, like a player deliberately building a Primeval.
3. Even with the pair assembled for 9 straight years, gold never touched the fuse
   threshold at the weekly check — the bot now EARMARKS the fusion cost while the
   ingredients are owned. This is a genuine UX signal: a player needs a way to see
   "you own a fusable pair — save 1000g" (future nudge?).

**Result (25y × 6):** fusion fires 1–2× in 5/6 seeds (was 0 in every sim ever run);
peaks TE ×5 @13–21y + Masters ×1; best stats 1035–1180. The fusion loop is finally a
living part of optimal play, and Primeval lines are staged as the Tamers Apex on-ramp.

## v0.88 — breeding cap ladder by heritage (user spec)

**Change.** The per-generation potential step is no longer flat 0.10 — it now depends on
the line's BEST parent (`BREED_STEP_BY_TIER` / `breedStepFor`), and `breedPotentialV2`
bases off `max(parents)` instead of their average so one exceptional founder isn't
diluted by a modest partner. (For same-generation pairings — the usual case — max ==
average, so ordinary lines are unchanged.)

| heritage | step/gen | gen-1 cap | gens to a 1400 cap |
|---|---|---|---|
| wild | 0.10 | 700–900 | **4** |
| Draconic / Abyssal | 0.11 | 800–950 | 4 (reaches 1440) |
| Mythical | 0.12 | 900–1000 | 4 (reaches 1480) |
| base fusion | 0.13 | 1000 | 2 |
| **Primeval** (prestige fusion) | **0.15** | 1100 | **1** |

**Measured ladder** (Tamer Elite, league cap 1000, no champion bonus):
```
tier              gen1   gen2          gen3          gen4          gen5
wild               700   1100 (1.10)   1200 (1.20)   1300 (1.30)   1400 (1.40)
Draconic           800   1110 (1.11)   1220 (1.22)   1330 (1.33)   1440 (1.44)
Mythical           900   1120 (1.12)   1240 (1.24)   1360 (1.36)   1480 (1.48)
fusion (Saurian)  1000   1280 (1.28)   1410 (1.41)   1500 (cap)    1500 (cap)
Primeval          1100   1400 (1.40)   1500 (cap)    1500 (cap)    1500 (cap)
```
A lone Primeval bred with a plain wild gen-1 partner still lands **1.40 / 1400** — the
stated one-generation target holds for the realistic pairing, not just Primeval×Primeval.

**Note:** `MAX_POTENTIAL` stays 1.5, so the prestige-fusion advantage is *speed to the
ceiling*, not a higher ceiling — a patient wild dynasty still gets there, four
generations later. Long-haul sim unchanged (TE ×5 / Masters ×1, 25y × 6) because the bot
plateaus at gen 2; the ladder is a deterministic formula, verified analytically above.

## v0.89 — league curve steepened + TAMERS APEX (11th league)

**Curve (user spec).** The top of the ladder pulls away from the flat +100/league:
Gold 700→**750**, Platinum 800→**900**, Masters 900→**1000**, Tamer Elite 1000→**1200**,
and a new summit **Tamers Apex at 1400**. (Spec read "Masters 100" — taken as 1000, the
only monotonic value between Platinum 900 and TE 1200.)

Apex is wired through every league-keyed table: pool rewards (1140/570), an 8-name cup
pool, the annual marquee **The Dynasty Eternal** (month 12), 6v6, 5 rival teams,
half-density calendar [Q2,Q4], license 2100g, excursion ceiling 820g, validator probes.
Backdrop reuses the Tamer Elite art (TODO: generate its own).

**Golden moved (recaptured):** `3v3-high`. `boostConstitution` derives its CON target from
the league cap of the monster's stat band, so changing Masters/TE caps changes a
`train: 2000` roll. Legitimate data change, not a regression. 12/12 green.

**Retest (25y × 6):**
| | before curve | after curve |
|---|---|---|
| Peaks | TE ×5, Masters ×1 | **TE ×2, Masters ×3, Platinum ×1** |
| Best stat | 1035–1190 | 1035–1428 |
| Apex reached | — | **never** |

**Two consequences worth a decision:**
1. **The whole late game got materially harder.** Rival budgets are `league cap × mult`,
   so raising four league caps raised every late-game field with them: a Tamer Elite cup
   rival went ~1683 → ~2049 total stats. Three seeds that used to summit now stop at
   Masters/Platinum. That may be exactly the intent (the summit should be rare) — but it
   is a bigger difficulty swing than the four "small nudges" that preceded it.
2. **Tamers Apex is currently unreachable.** Its trial champion is **3675 total stats per
   monster, six of them**, versus a player best of ~1428 top / ~2400 total. No seed won
   the TE trial *and* then the Apex trial. If Apex is meant to be enterable this decade,
   it needs either a gentler `trialChampionMult` at the top or a lower Apex rival mult.
3. **The breeding ballpark drifted.** Bred caps are `league cap × potential`, so with Apex
   at 1400 a *wild* gen-2 line already reaches 1540 there — the "4 generations to a 1400
   cap" target was calibrated against a 1000-cap league and now lands in ~1 generation at
   the top. The tier ORDER still holds (wild < prestige < Mythical < fusion < Primeval);
   only the absolute numbers moved.
