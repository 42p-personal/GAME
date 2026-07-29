# Ability rework (branch `3doverhal`) — design, decisions, and state

The working document for the tamerengine ability pass. Supersedes the scratch notes; the
per-move listing lives in `docs/ABILITIES.md` and the engine's own notes in `docs/TAMERENGINE.md`.

> **Where this sits.** tamerengine's *positioning* is solved (out-of-range 76%→37%, travel/unit
> 119→28, tanks hold a front line, fights stopped being a race). What remained was the **ability
> pool** — both its numbers and its content. This is that work.

---

## 1. What the audit found

Measured over the 90-move pool, with DPS as `power × avg(hits) / (cooldown×0.9 + castTime)`:

| problem | evidence |
|---|---|
| **Progression didn't pay** | In **all 6 stats** the lvl-920 capstone lost to something far earlier: lvl 90 Power Strike **15.4** beat lvl 920 Titanfall **12.3**; lvl 40 Sling 12.5 beat lvl 920 Deadeye 9.1. Training a stat to 920 could leave a monster *worse* than at 90. |
| **Floor below the free attack** | Mana Sap 3.6, Screech 4.4, Discord 4.9 vs a stat-tiered basic at 6.0–8.8. CHA/voice was the weakest damage tier overall. |
| **Keywords were free** | Heartseeker (multi-hit + `execute`) a **60% outlier** at 24.4 DPS vs 15.4 next. |
| **Dead content** | **11 moves did literally nothing**; 29 inert effect instances in the pool, **26 more** across the 50 signatures. Of CON's 15 moves — the TANK stat — three were fully inert and six more had their signature effect dead. |
| **Redundancy** | 4× `regenBuff` (WIS), 4× `manaBurn`, 4× `pierce` (INT), 2× `atkBuff` + 2× `atkDebuff` (CHA). ~10 slots on duplicate ideas. |
| **Unused axes** | **0 of 90** moves authored `range` or `castTime`; every move shared one flat stat coefficient (`/320`). |
| **Mana starvation** | `maxMana = WIS + INT/2` with WIS-only regen starved every physical class — 4–6 ability casts per *whole fight*, and **76% of all casts were the free attack**. |

---

## 2. Decisions taken (user)

- **Progression ≈ 2.5×** first move → capstone, delivered through **stat scaling**, not a flat curve.
- **Re-price `moves.ts` globally** (single source of truth), **deliberately recapturing the 12 goldens**.
- **The pool may GROW** — nothing off the table.
- ⚠️ **Class design is the ONLY hard rule.** Damage, stat scaling, cooldown, mana, range, keywords
  and status are all **per-ability design axes**, traded creatively and judged by sim. No global
  formula derives the pool; formulas only seed a starting point.
- **AoE is strongest into many bodies and weak into one** — not exempt from costing, just
  conditional on target count.
- **Mana is a trading axis**: a move may be stronger somewhere and simply cost more MP.
- **Nothing falls below the free attack** (peaks 8.8 DPS) — the one hard rule beyond class design.
- **Hybrid class model**: class stays emergent from stats; a player-chosen **battle role** drives
  positioning/personality.
- **Flanking**: +10% accuracy vs a target engaged by **2+ enemies with no adjacent ally**.
- **Passive abilities** may be taken instead of an active.
- **CC diminishing returns**, arena-style; **cleanse grants brief CC immunity** as compensation.
- **Three playstyle LINES per stat**, one of them a **flagship** with a real loop.
- **~24 per stat (144 total)**, built in **two passes**.

---

## 3. The design

### Three lines per stat, for multi-classing

A class emerges from the top **two** stats, so 3 lines per stat gives **3 × 3 = 9 build identities
per stat pair** — on the order of **80 recognisably different builds**. Multi-classing becomes
"which two *lines* am I combining", not "which two stats are highest".

**Shape: 3 lines × 8 = 24 per stat**, each line ~7 actives + **1 passive that is the payoff for
committing to it**.

⚠️ **The pool grows for AVAILABILITY, not variety.** `learnedMoves` gates by stat, so at 6 per line
a mid-game monster reaches only 3–4 of its chosen line — barely a loadout and no choice, meaning
**lines would only exist at endgame**. Aim ~5 of each line's 8 learnable by stat ~450.

⚠️ **Two passes**: rework the existing 90 into the 3-line structure first (~18/stat), sim it,
confirm lines read as distinct — *then* deepen to 24. Authoring 54 new moves before knowing the
structure works would repeat how the pool got 11 dead moves and four duplicate `regenBuff`s.

⚠️ Passives must stay *situationally* strong. The moment one is strictly better than an active, the
4-slot decision collapses.

### One flagship per stat

The test is whether the line has **its own win condition or resource loop**, not flavour:

| stat | flagship | loop | other two lines |
|---|---|---|---|
| **STR** | **Berserker** | **HP is a resource** — recoil hurts you, missing health *is* the damage buff; you spend life and race the clock | Duelist (precision/finish) · Wrestler (grab/push/stun) |
| **CON** | **Warden** | **Decide the geometry** — Seize drags a diver in, Shield Wall denies the crossing, Zone of Control slows adjacent | Guardian (protect others) · Juggernaut (retaliate, remaining-HP) |
| **DEX** | **Assassin** | **Stealth → burst → vanish** — every piece needs the one before it | Marksman (precision) · Volleyer (volume/variance) |
| **INT** | **Hexer** | **Stack, then detonate** — burn, vulnerable, a ticking bomb, then Cinderburst cashes it in | Artillery (single-target) · Elementalist (AoE/zones) |
| **WIS** | **Disruptor** | **Resource denial** — steal, silence, zone them out; the enemy never casts | Battery (feed team mana) · Mender (sustain) |
| **CHA** | **Enchanter** | **Action denial** — charm turns them on each other, sleep gives one free hit, fear routs | Captain (team buffs) · Demagogue (debuff/punish) |

Six ways to win — self-damage economy, spatial control, burst-and-escape, status detonation,
resource denial, action denial. **None is "deal more damage."**

### Per-stat notes

- **STR** — highest single-target melee on the shortest reach, and it *commits* (heavy moves get
  real wind-up). **Power Strike** must lose ~25%: it is the game's damage ceiling at **lvl 90**.
  New: **Grapple** (pull+root), **Enrage** (atkBuff on missing HP), **Blood Fury** (damage on
  missing HP — the line's payoff *attack*, so the loop pays out through more than modifiers),
  **Sunder** (armour break — the setup STR lacks).
- **CON** — **a support stat, not a damage stat.** Only ~4 damage moves, all *conditional*:
  Body Slam, Shell Slam (`hpScale`), Colossus Crash, and new **Bulwark Breaker** (scales with
  **current** HP — a healthy tank hits, a broken one doesn't). ⚠️ **Bastion and Fortify are
  duplicate plain wards** — make Fortify a **team** ward. New: **Seize** (grab), **Shield Wall**
  (zone), **PASSIVE Bodyguard** (redirect damage aimed at your lowest-HP ally), **PASSIVE Immovable**.
- **DEX** — high accuracy, multi-hit, mobility; **variance is the flavour**. **Heartseeker** keeps
  `execute` but loses the multi-hit. The three dead moves become identity: **Sidestep** (dodge +
  dash), **Focus Aim** (accBuff + guaranteed crit), **Blur** (dodge + fade). **Pin Down** reworked
  from a limp `accDebuff` into a real **root**. New: **Shadowstep**, **Ambush**, **Throat Cut**,
  **Vanish**, **Hamstring**, **Gambler's Volley** (1–6 hits), **PASSIVE Opportunist**.
- **WIS** — wins the **resource** race, not the damage race. ⚠️ Consolidate 4× `regenBuff` → 2.
  **Mana Sap** (worst move in the game) → a true **mana steal**. New: **PASSIVE Font of Power**
  (allies gain MANA per second — categorically unlike CHA's buffs: it doesn't make allies stronger,
  it makes their abilities *affordable*), **Null Field** (zone silence), **Spirit Siphon**
  (channelled), **Foresight**.
- **INT** — two genuinely competitive builds. ⚠️ Thin 4× `pierce` → 2. **Thunderclap** (inert
  `firstStrikeMult`) → line AoE + knockback. **Static Chain** → actually chains. **Glacial Prison**
  is a bad deal (5.9 DPS for a 25% stun at lvl 540). New: **Firewall** (zone), **Frost Nova**
  (rewards being surrounded — the anti-melee tool casters lack), **Arcane Bomb** (delayed).
- **CHA** — buffs/debuffs first, only ~4 damage moves but they must clear the free attack. The
  control suite is the best-designed thing in the pool — keep it all. ⚠️ Differentiate the duplicate
  atkBuff/atkDebuff pairs into single-target-strong vs team-wide-weak. New: **PASSIVE Captain's
  Order** (aura), **Rally**, **Dirge**, **Crowd Surge** (push — a *defensive* use of a debuff stat).

### Mechanics

**Already in the engine, authored by nothing:** ground zones (`spatial.zone`), cone/line AoE
(`area.shape`), grab (`pull`), push, root, fade, blink — plus **`castTime`** (wind-up, so heavy
moves are punishable) and **`range`**, both in the `Move` type and used by **0 of 90** moves.

**Genuinely new:** **delayed detonation** (only possible because the field has continuous time, and
*dodgeable* — the first real reaction counterplay), **auras** (what makes passives interesting),
**channelled** (reuses cast-rooting), **mark** (amplify next hit — a `vulnerable` variant).

### Combos

Existing: Bloodletter ← bleed · Cinderburst ← burn · Siren's Call ← fear · Mind Crush ← doom.

New: **Shatter** (← stun/freeze) · **Defenceless** (← silence, mana-drain payoff) · **Wake-up call**
(← sleep; it breaks on hit so you get exactly one shot) · **Marked** · and **Dragged** ⭐ — Seize
pulls a target in and your melee focus it: **positional, not keyword**, the first combo the turn
engine could never have expressed.

Combos are deliberately cross-line and cross-stat, so they reward the multi-class pairs the game
already generates.

---

## 4. Built so far

### P1 — authoring axes (commit `4fe69bf`)

- **`Move.statScale`** — per-ability coefficient in `power × (1 + stat × scale)`, replacing the flat
  `/320`. Wired into `strike()` **and** its `estimateDamage()` mirror (they must match or kill-checks
  and `worthSpending` misjudge finishers). `defaultStatScale(learnLevel)` seeds it only.
- **`Move.mana`** — authored MP cost wins over the derived formula.
- ⚠️ **`STAT_SCALE_LOW` is pinned at the OLD 1/320 so the change only ever ADDS.** A first cut used
  1/420 and silently nerfed every low/mid move — and since `learnedMoves` gates by stat, mid-game
  monsters can only equip low/mid moves, so the whole mid-game got weaker (damage/fight 28.9k→27.3k).
  **Progression must pay by lifting the top, not lowering the bottom.** HIGH is 1/150.
- ⚠️ **Field-only by nature, so goldens did NOT move**: `battle.ts` uses a different curve
  (`power × hits × (atk/40)^0.8 × 0.5`), not a linear stat coefficient. The accepted recapture comes
  when **P4 changes `power`**.

**Result — progression now pays in all six stats** (it previously failed in all six), and the gap
**widens with investment**. At stat 900, starter → capstone: STR 44→86 (1.97×) · INT 32→57 (1.81×) ·
CHA 28→53 (1.91×) · WIS 15→48 (3.28×) · DEX 48→64 (1.34×) · CON 44→52 (1.20×). **DEX/CON lag the
2.5× target — per-ability tuning in P4.**

### P2 — eight of nine inert effects + CC DR (commit `eb9bbec`)

`ward` (absorb pool, soaks before health) · `guard` (flat DR after the multipliers, floored at 1 so
never true immunity) · `thorns` (reflect per hit taken, on any hit — what makes it an answer to a
ranged focus) · `cleanse` · `dodgeBuff`/`accBuff` (percentage **points** in the accuracy roll) ·
`hpRegenBuff` · **`firstStrikeMult`** → ⚠️ keys off `actedThisRound` in the turn engine and a
continuous field has **no rounds**, so it became "target hasn't attacked yet" (`hasAttacked`) — an
*opening-burst* reward.

`mods` was **extended** rather than growing six parallel timers, so expiry stays in one place; the
new accumulators **sum** (flat/points) rather than multiply.

**CC diminishing returns** — 100/75/50/25/immune, 3s reset, **global**. Global on purpose: mixing a
silence with a charm gets no discount, which is what caps the lockout build. CON resists control
natively (a floor on the meter). Cleanse grants ~1.2s immunity but ⚠️ **does not reset the meter**,
or cleansing your own ally becomes a DR-wipe. `CONTROL_STATUSES` deliberately excludes DoTs —
poison/burn/bleed leave you playing, so metering them would let a DoT kit burn away the protection
that exists to cap *lockout*.

⚠️ **The chooser had to learn to VALUE these** — they scored zero, the actual reason nobody ever cast
one. Every score is **situational** (ward/guard/thorns/dodge scale with heat on the target): a flat
value turns a defensive cooldown into a tic, which this engine has shipped twice.

**Result: 12 of 15 formerly-dead moves now get cast.** The 3 that don't are correct — `Clarity` is a
pure cleanse with nothing to cleanse; `Insight`/`Focus Aim` are bare +10/+12 accuracy scoring **7.8
against a `UTILITY_FLOOR` of 8**. Not padded to pass a test; they earn their slots in P4 with riders.

Also: mana-by-role and the 4th slot shipped just before this pass — see §6.

---

## 5. Remaining

| phase | work |
|---|---|
| **P2b** | **`spreadStatus`** — held back deliberately. Most likely effect to spiral once AoE is real; the codebase records **Ember being rejected** as a carrier because adding a spread moved three goldens including two winner flips. Build and sim alone. |
| **P3** | **Class kit table** — per-class identity/keywords/statuses, mapped to the stat pair it emerges from, with a **have vs need** gap list. The pass's contract, and the one thing tested strictly. |
| **P4** | **Rework + author the pool** (may grow), incl. **passives** and re-authoring the 50 signatures. ⚠️ Then **recapture the 12 goldens** in their own commit. |
| **P5** | **Mana retune for four slots.** |
| **P6** | **Class identity on the field + flanking.** |
| **P7** | **Movement/displacement + per-move ranges**; merge the 18 `fieldMoves` into the pool; then Shadowstep/Disengage/Stealth. |
| **P8** | **Sweep + tests + verification.** |

### Traps already identified

- ⚠️ **`chooseLoadout` knows nothing about lines.** It ranks "best per stat", so it will draft one
  move from each of three lines and every generated monster — i.e. every rival — will read as
  incoherent mush, leaving the line structure meaningful only for hand-built player loadouts. It
  needs line-awareness ("prefer moves sharing a line with what's already picked").
- ⚠️ **Passives must be excluded** from `chooseMove`/`bestUtility`, from `reachOf` (or a passive's
  channel sets the unit's stand-off distance — the exact bug that parked bruisers outside their own
  swing), and from `basicAttackFor`'s channel pick; `validate.ts` must not count them as damage moves.
- ⚠️ **The AI must score CC by its POST-DR duration**, or monsters spend stuns on saturated targets
  for nothing.
- ⚠️ **`validate.ts:54-60` caps signature power at the pool ceiling for its shape** — re-pricing the
  pool re-caps the signatures automatically. Route signature strength through **stat scaling**, the
  axis that isn't capped.
- **Zones and delayed detonation change fight *shape*, not just damage** — they pull units off
  positions, and this engine has repeatedly shown movement changes have surprising second-order
  effects. Own sim pass.
- **Root is strong in a continuous engine** — it counters kiting, diving and grabs at once. Short
  durations, DEX/INT only.

---

## 6. Measured baselines (for tuning against)

Harness scripts live in the session scratchpad — `sweep.ts` (duration/travel/kills/resolved),
`castmix.ts` (basic vs ability share), `mpuse.ts` (mana pressure), `whymove.ts`
(cast/pace/approach/block split), plus the pool audits. 12 fights = 4 matchups × 3 seeds, `train:850`.

| stage | duration | travel/unit | resolved <55s | notes |
|---|---|---|---|---|
| pre-engagement-rework | 58.5s | 119.1 | 2/12 | out-of-range 76.3%, casting 9.9% |
| after backpedal penalty | — | 80 | — | the pursuit-equilibrium fix |
| after usable basic + Block | — | 52 | — | casting 14.2% |
| after Tank-as-anchor | 45.7s | 28.2 | **7/12** | out-of-range 41.8% |
| after stat-tiered free attack | 66.3s | 47 | 0/12 | filler correctly weak → nothing carried damage |
| after mana-by-role | 50.2s | 36.5 | 4/12 | basic share 76%→53% |
| after 4th slot | 66.9s | 37.8 | 1/12 | can't-afford-cheapest 35%→**56%** |
| **after P1 (statScale)** | 66.9s | 37.8 | 1/12 | non-regressive; progression added |
| **after P2 (effects real)** | 68.0s | 43.1 | 0/12 | ⚠️ defence being real makes fights longer |

**Acceptance targets**: resolve **≥8/12** before sudden death · duration **30–45s** · ability share
of casts **>60%** · mana starvation **<20%** · travel/unit near **28–37**.

⚠️ The current 0/12 is expected mid-pass: the free attack is correctly weak and defence is now real,
so **nothing carries the damage**. The counterweight is P4's damage curve and P5's mana pass. Median
ability DPS is 7.7 and Cleave — the best move these monsters have — is 11.9, which is why.

---

## 7. Standing rules that apply

- **Balance iteratively**: nudge one value, sim, read, adjust. The sim is the arbiter (CLAUDE.md).
- **Units are not uniform**: `atkBuff`/`pierce`/`execute` are **fractions**; `dodgeBuff`/`accBuff`/
  `accDebuff`/`defBuff` are percentage **points**.
- **Everything stays on `3doverhal`.** The main game is not replaced until tamerengine is complete
  (M7). The 12 goldens move exactly once, deliberately, in P4.
