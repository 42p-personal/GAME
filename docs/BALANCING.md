# Balancing — findings & working reference

Living doc for the economy/progression balance effort. Condensed from the
2026-07-23 balancing sessions. Numbers are current as of **v0.73**.

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
- **Trial to rank up:** beat a champion team scaled to `leagueCap × RIVAL_BUDGET_MULT(1.8) × TRIAL_CHAMPION_MULT(1.25)`.
- **`statCapFor = leagueCap × potential`** (gen-1 fusion hard-capped at Platinum = 800).
- **Career span** ~6 years base; **+2yr pedigree bonus (`PEDIGREE_SPAN_BONUS`, v0.73)** for fusion / prestige (Draconic/Abyssal/Mythical) / bred (gen≥2) monsters — wild base monsters unchanged.

### Breeding & fusion
- **Potential:** wild = 1.0; **+0.10 / generation** + up to **+0.08** champion-parent bonus; **cap `MAX_POTENTIAL = 1.5`** (~4–5 generations to reach). Breed cost 300, ≤2 children per stud, heritage stat +10%, **head-start `BREED_HEAD_START = 0.45`** (child hatches at 45% of parents' averaged stats — v0.73).
- **Fusion:** 1000g, consumes two lab-frozen monsters; result = **all stats 100**, **+20% on each parent's major** + rolled +10%/−10%, species by spinning wheel, **potential 1.075 (1½★)**, gen-1 **Platinum-capped**, then fully breedable (gen-2 ≈ 3★ → Tamer Elite).

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
1. **Potential edge** — gen-1 fusion 1.075 → ~1.15–1.2, so fusing *seeds a high-potential bloodline instantly* (a shortcut vs breeding up from wild).
2. **Cut friction** — allow fuse straight from the stable (drop the freeze-to-Lab hoop) and/or lower the 1000g cost.
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

## Ledger of changes made
- **v0.62** — economy pass #1 (stipend/pension/comfort/peddler/breeding/soft-lock).
- **v0.72** — cup gold ↑ + trainer gold stipend + excursion nudge. Peak Bronze → Gold/Platinum; breeding now fires.
- **v0.73** — pedigree span +2yr (fusion/prestige/bred) + bred head-start 0.35→0.45. **Peak Gold → Masters/Tamer Elite** (1 seed reached TE @ yr 12.7); top is now reachable via breeding, still challenging (12–19yr). Fusion still unused by the bot.
