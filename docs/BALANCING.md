# Balancing — findings & working reference

Living doc for the economy/progression balance effort. Condensed from the
2026-07-23 balancing sessions. Numbers are current as of **v0.74**.

## Design principles (from the user)
- **Challenging but possible.** The top (Masters / Tamer Elite) should be hard-won, not gated shut.
- **No fixed timeline / forced pacing.** We do NOT target "reach X by year N." A skilled player goes faster; a mediocre one takes a long time. Both are fine.
- **Slow iterations.** Small tuning steps, each **validated against the long-haul sim**, then adjust. The sim is the arbiter.

## How we measure — the long-haul sim
A competent-player bot plays the full game (economy + cups + trials + licenses +
breeding + fusion) for ~19 game-years × 3 seeds, reporting **peak league, end
gold, dynasty generation, breeds/fusions, cup record**. Recreate from the pattern
in git history (bot was scratch, deleted after each run). Peak league + whether
breeding/fusion actually fire are the headline metrics.

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

## Ledger of changes made
- **v0.62** — economy pass #1 (stipend/pension/comfort/peddler/breeding/soft-lock).
- **v0.72** — cup gold ↑ + trainer gold stipend + excursion nudge. Peak Bronze → Gold/Platinum; breeding now fires.
- **v0.74** — fuse-from-stable (removed the freeze hoop) + fusion potential 1.075→1.15. Mechanic verified firing in the sim; fusion now a 1-click stable action.
- **v0.73** — pedigree span +2yr (fusion/prestige/bred) + bred head-start 0.35→0.45. **Peak Gold → Masters/Tamer Elite** (1 seed reached TE @ yr 12.7); top is now reachable via breeding, still challenging (12–19yr). Fusion still unused by the bot.
- **v0.75** — difficulty escalation: flat `RIVAL_BUDGET_MULT 1.8` → `rivalBudgetMult(i) = 1.8 + i×0.02` (Wood 1.8 → TE 1.98). **A/B (25yr × 3 seeds, rebuilt bot):** flat → Gold/Gold/Bronze; escalating → Gold/**Silver**/Bronze — one seed held back a league, win-rates dipped slightly, no collapse. Gentle friction confirmed, first increment. ⚠️ **Instrument caveat:** the rebuilt bot trains only basic drills / 3-stat builds and peaks at **Gold** — much weaker than the prior Masters/TE bot, so it can't reproduce the skilled-human "easy run to Masters" the change targets. Money is a non-constraint at every peak (48k–121k surplus). Next: either strengthen the bot (intensive/extreme drills, comfort/tonic, timed breeding) to test the top directly, or nudge the step up (0.02 → ~0.03) and re-A/B.
