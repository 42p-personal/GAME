# Pathfinding — design plan

**Status:** planning. **Change freeze in effect** on `src/tamerengine/` while this is
agreed. Stage 3 is **DECIDED** (§5: A + F on independent cooldowns); stages 0–2 and
the instrument order are settled; nothing is built yet. **Branch:** `3doverhal`.

The goal, in the user's words: *monsters that navigate around obstacles, use them to
their advantage, and — ideally — a support running around a pillar to escape an
assassin.*

---

## 1. What is actually wrong

`src/tamerengine/engine.ts:1533` — `stepToward()` — is the **entire** navigation
system:

```
aim straight at the goal
  → try the full step
  → else slide along x
  → else slide along y
  → else a fixed perpendicular nudge
```

No A*, no navmesh, no waypoints, and **no memory between ticks**. Every tick
re-decides from scratch, so a unit slides left, the goal vector shifts a degree, and
it slides back right. Cover is not something a monster understands; it is something it
bumps into.

### The measurement — BASELINE (`npx tsx tools/navdiag.ts`)

⚠️ **Built first, before any fix.** These are the numbers Stage 0 and Stage 1 are
graded on. `sweep40` reported Titan's Rest at an ordinary-looking 38/40 while a third
of its unit-fights were inert, so nothing here gets graded on `resolved`.

| arena | size | resolved | **deadlocked** | stuck% | of which cover | wander |
|---|---|---:|---:|---:|---:|---:|
| Dustbowl | 34×20 | 37/40 | **0**/240 | 1.3% | 100% | 2.16 |
| The Ossuary | 48×26 | 30/40 | **3**/240 | 37.6% | 100% | 2.48 |
| Titan's Rest | 64×34 | 0/40 | **80**/240 | 56.6% | 100% | 3.31 |

Three things the first hand-probe got wrong or could not see:

- **It is not two units, it is all six.** The probe read one seed and found Zarok and
  Sylix. Across 40 fights every slot on Titan's Rest deadlocks in some of them —
  A0 16×, B1 18×, A1 13×, B0 13×, A2 11×, B2 9×. It is a property of the arena, not of
  two unlucky spawns.
- **The Ossuary was hiding it.** 30/40 resolved looks merely mediocre; 37.6% of all
  movement attempts failing does not.
- **⚠️ `of which cover` is 100% on all three arenas.** Every stuck tick, everywhere, is
  against an obstacle. That is an unusually clean attribution: there is no second,
  unrelated cause to hunt, and Stages 0–1 are aimed at the whole problem rather than
  part of it.

**The two bugs separate exactly as designed.** Dustbowl has ~no deadlock (1.3% stuck)
but still wanders 2.16× — chronic without catastrophic. A single blended "navigation
health" number would have hidden that; two numbers show a map can be fine at one and
bad at the other.

### The original single-seed probe

Per-unit, from the three arena dumps. `frozen` = ticks where the unit moved < 0.02
units; `hugging` = ticks spent within 1.2 units of an obstacle; `wander` = path length
÷ net displacement.

| arena | unit | alive | frozen | hugging | path | net | wander |
|---|---|---:|---:|---:|---:|---:|---:|
| Titan's Rest | **A2 Zarok** | 750 | **100%** | **100%** | **0.0** | **0.0** | — |
| Titan's Rest | **B1 Sylix** | 750 | **100%** | **100%** | **0.0** | **0.0** | — |
| Titan's Rest | A3 Bruus | 623 | 24% | 2% | 111 | 29.4 | 3.8× |
| The Ossuary | A2 Zarok | 209 | 61% | **92%** | 11 | 8.2 | 1.3× |
| Dustbowl | A2 Zarok | 148 | 40% | 53% | 22 | 4.6 | **4.7×** |

⚠️ `frozen%` **alone is not the metric** — 40–86% is normal and healthy (casting,
standing in range, blocked by an ally). The signal is `frozen` **and** `hugging`
together.

### Two distinct bugs, not one

**Bug 1 — spawn-inside-obstacle is a permanent deadlock.** Zarok and Sylix never move
once, across all 750 ticks. `tryMove` rejects any position inside an inflated
obstacle; a unit that *starts* inside one has every candidate rejected, including the
perpendicular escape nudge. There is no push-out. Two units — one per side — are
inert dead weight for the whole fight, which is the real reason Titan's Rest resolves
0/40.

> ⚠️ **This was self-inflicted, and the lesson is worth more than the bug.** The first
> `mapProblems` rejected any obstacle inside a deployment band. All three maps failed,
> and that was read as a miscalibrated check ("cover near spawn is a design choice,
> and `mirror()` already guarantees fairness") — so it was relaxed to a 15% crowding
> threshold. The *conclusion* was wrong because the *hazard* was misidentified: the
> danger was never fairness, it was spawn-deadlock. **"When many things fail a check,
> suspect the check" is a heuristic, not a law** — it says look at the check, not
> assume it is wrong. Restore the strict guard.

**Bug 2 — no pathfinding.** Chronic rather than catastrophic: 4.7× wander on
Dustbowl, 92% cover-hugging on Ossuary. Units reach their goal eventually, by
scraping along geometry.

### What this reverses

An earlier commit (`a27f774`) attributed Titan's 0/40 to *small obstacles breaking
line of sight, so a shooter re-acquires forever*. That was a plausible story fitted to
an isolation table, and it is **wrong**. The isolation result itself still holds —
rubble breaks the map, the massif does not — but the mechanism is spawn-deadlock plus
wall-scraping, not a LoS dance. The small blocks are lethal because they are small
enough to sit **inside a deployment band**; the massif is harmless because it is dead
centre where nobody spawns.

---

## 2. Stage 0 — bugs, not features

Cheapest work, largest single win, and it is all correctness.

- **Push-out at spawn.** Any unit initialised inside an inflated obstacle is moved to
  the nearest free point before tick 1.
- **Restore the strict deployment-band guard** in `maps.ts` as a hard error. Cover
  inside a spawn band is not a style choice; it is a deadlock.
- **No terminal blocked state.** "All four `tryMove` candidates rejected" must be
  impossible to remain in — escalate to a scan of headings rather than one fixed
  perpendicular.

**Acceptance:** `stuck%` (frozen **and** hugging) → ~0 on all three arenas. Expect
Titan's Rest to move sharply off 0/40 on this stage alone.

---

## 3. Stage 1 — real pathfinding

Obstacles are axis-aligned boxes and they never move: the easy case. **The shortest
path in a box world only ever bends at box corners.**

**Recommended: visibility graph + A*.**

- Build once per battle from the arena's obstacles (they are static), so it is not
  per-tick work.
- Nodes = obstacle corners inflated by unit radius, plus start and goal.
- 3–7 obstacles ≈ 28 nodes. Trivial to search.
- Hand `stepToward` the **next waypoint** instead of the raw goal.

The layering is the point: a **global path layer** picks the waypoint; the **existing
local steering layer** keeps doing separation, backpedal and collision-slide. No
rewrite of what already works.

**Cheaper first cut, if wanted:** commit-to-a-side wall-following with hysteresis —
when blocked, choose the tangent nearer the goal **once** and hold it for K ticks or
until the goal is in line of sight. That kills the oscillation, which is the actual
failure mode, without a graph. ⚠️ But it does **not** unlock Stage 2 — you cannot ask
"where should I stand so the assassin cannot see me" without a path cost to candidate
points.

---

## 4. Stage 2 — cover as a resource

Only reachable once Stage 1 exists.

- **Break LoS to flee.** A hurt support scores candidate points around nearby cover on
  *does this block the threat's line to me*, not merely *is this away from them*. That
  is running around a pillar.
- **Peek.** Ranged units prefer standing where they hold LoS to the target while the
  nearest melee threat has no *short path* to them. Path length, not straight-line
  distance — this is why it needs Stage 1.
- **Cut-off pursuit.** The assassin paths to the interception point around the pillar
  rather than chasing the support's current position. ⚠️ **This is the single change
  that makes the behaviour read as intelligent rather than as a conga line** — and see
  §5, it is also what makes the retreat budget a real bound.

---

## 5. Stage 3 — bounding retreat (the open decision)

⚠️ **"A support escapes the assassin" and "fights resolve" are in direct tension.** If
breaking LoS is free, a support kites forever and the sim returns to 0/40 — the same
symptom as today with a brand-new cause, which will read as a regression of the thing
Stage 0 just fixed. **Decide the cost before building the behaviour.**

### ⚠️ First: two behaviours, not one

| | what it is | cadence | current mechanism |
|---|---|---|---|
| **Micro-kiting** | a ranged unit shuffling back to hold range | continuous | `KITE_MAX` 1.2s / `KITE_REFILL` 0.5 + 0.6× backpedal |
| **Retreat** | a discrete break of contact and reposition | 2–3 per fight | **does not exist** |

A cooldown belongs on **retreat**. Putting one on micro-kiting makes archers walk into
melee. The existing 1.2s budget is not a small version of retreat — it is a different
system, and it stays as it is.

### The options

| | mechanism | tune cost | legibility | risk |
|---|---|---|---|---|
| **A. Cooldown** | one Fall Back per N seconds | **1 number** | high — a visible event | binary; can be spent early |
| **B. Stamina** | drain while retreating, refill when safe | 2 numbers | low — invisible continuous state | is what produced the pursuit equilibrium that needed the backpedal hack |
| **C. Charges per fight** | N retreats, no refill | 1 number | highest | nothing left late in a long fight |
| **D. Escalating cost** | each retreat costs more | 2 numbers | medium | elegant, opaque |
| **E. Diminishing effect** | each retreat moves you less | 2 numbers | low | reads as the unit silently degrading |
| **F. Make it an ability** | Disengage / Shadowstep: MP + slot + cooldown | **0 new systems** | high | only monsters that drafted it can do it |

### DECIDED — **A and F, on independent cooldowns**

Both tiers ship. A monster therefore has **two escapes**, and the ability does *not*
consume the baseline cooldown. That is deliberate: it creates the two-beat moment
(*caught → Disengage → still caught → Fall Back*) and keeps the ability strictly
premium rather than a sidegrade.

- **A — Fall Back.** Universal, ~15s cooldown, trigger-gated. Ordinary movement speed.
- **F — an ability.** Own cooldown, MP cost, occupies a loadout slot. **Faster to its
  destination**, which is the whole reason to draft it.

**Suggested mechanic for Fall Back, using a lever that already exists:** for its ~2s
duration it **suspends the 0.6× `BACKPEDAL_MULT` penalty**. That is what separates a
retreat from ordinary kiting — the unit genuinely outruns its pursuer for two seconds
— and it needs no new speed constant.

#### The three ability flavours map onto vocabulary the engine already has

`core.ts:300` already carries the exact distinction, and its comment already states
it: *"`dash` crosses the ground and IS blocked by cover; `blink` is instantaneous and
ignores it — that difference is the whole reason to want a blink."*

```ts
move?: { kind: 'dash' | 'blink'; to: 'target' | 'behindTarget' | 'awayFromTarget' | 'ally'; maxRange: number }
```

| flavour | encoding | respects geometry? | range | needs Stage 1? |
|---|---|---|---|---|
| **Disengage** | `dash`, `awayFromTarget`, short `maxRange` | yes | shortest | **no** — short enough for a straight-line check |
| **Dash** | `dash`, longer `maxRange` | yes — blocked by cover | medium | **YES** — must follow a path or it runs into a wall |
| **Teleport** | `blink` | **no** — ignores cover entirely | longest | **no** — ignores geometry by definition |

⚠️ **This inverts the obvious build order.** Disengage and Teleport need no
pathfinding at all and could ship before Stage 1; **Dash is the one that depends on
it**, because a ground-crossing leap without a path just accelerates into the nearest
obstacle. `sp.move` is already implemented (`engine.ts:432`), so the ability tier is
closer to working than the baseline tier is.

`fade` (drop off the targeting radar, `core.ts:313`) is a **fourth** escape flavour
that is not movement at all, and it composes: fade + reposition is a genuine vanish.
Worth holding back as a later tier rather than shipping alongside these.

#### ⚠️ Teleport is the one that can break the bound

Cut-off pursuit (§4) is what converts a cooldown into a real limit — and **it does not
apply to `blink`**, which ignores the geometry the interception is computed over. A
blink with generous range and a modest cooldown produces an unkillable support, which
is the §5 failure in its purest form. Price it hardest: longest cooldown, highest MP,
and consider a cast time so it can be reacted to. Do not let its `maxRange` be tuned
casually.

#### DECIDED — a short shared **escape lockout**

The two cooldowns stay independent, **plus** using either escape puts the other on a
short lockout. One symmetric constant, **4–6s**, starting at 5.

⚠️ **The hazard was never "two escapes in a fight" — it is "two escapes in two
seconds".** Two escapes across a 45s fight is the premium build working as intended.
Two inside one window is what makes an assassin's commitment unanswerable: it lands,
the support Disengages, it re-closes, the support instantly Falls Back, and it has
spent eight seconds achieving nothing. **No value of the 15s cooldown catches that**,
because the whole burst happens inside a single window — which is exactly why a second,
much shorter constant is the right shape rather than a bigger version of the first.

Sizing: a Disengage buys ~2s of separation and an assassin needs ~2s to re-close and
land, so ~5s lets roughly one full exchange resolve between escapes. Under ~3s it is
decorative; over ~8s it collapses the two tiers into one and the ability stops being a
separate system.

It also improves the drama rather than taxing it. `Disengage → instantly Fall Back` is
a double-tap that reads as the support shrugging off the engagement. `Disengage →
assassin re-closes → Fall Back` is a chase with a middle, and the lockout is what
creates the middle.

⚠️ **Symmetric, and one number, to start.** The tempting refinement is for Fall Back to
impose a shorter lockout than the ability does, since Fall Back is the weaker option.
That is probably right eventually, but it is two numbers interacting with two cooldowns
and a trigger — and the standing rule is one value at a time. Start symmetric, sim,
split only if the data asks.

#### ⚠️ Sim the combined budget, not the baseline

Two independent cooldowns means the escape budget per fight is *baseline + ability*.
The acceptance run must use a support **with the ability drafted** — testing baseline
Fall Back alone will look fine and ship an unkillable premium build.

### Why A, and why F (recorded rationale)

**A** because a cooldown is the only option on that list the **player can see and plan
around**, and it reuses a concept the game already teaches on every ability. One
number to sim-tune. Retreat becomes an event in the battle report rather than a
continuous drift nobody can observe.

**F** on top because it costs no new machinery: `spatial.ts` already carries `fade`,
`dash` and `blink`, and *Shadowstep / Disengage / Stealth* is already on the roadmap.
Those become the **good** retreat — further, cheaper, or off-cooldown — bought with MP
and a loadout slot. Escape becomes a **build decision** rather than a universal
entitlement, which is a far healthier place for it to live, and it gives the ability
pool a real reason to carry movement.

**Gate on a trigger, not only a timer** — HP under ~40%, or a melee threat within ~3
units while in a back-line role. Without a trigger, units burn the cooldown wandering
at full health.

**Starting numbers**, to be moved one at a time against the sim:

- retreat cooldown **15–20s** (≈2 uses in a 45s fight)
- committed retreat duration **~2s**
- keep the 0.6× backpedal penalty and `KITE_MAX` exactly as they are

### ⚠️ The pursuer must be allowed to win

A cooldown alone does **not** guarantee resolution. If the assassin follows the
support's current position rather than cutting it off, the support wins every lap
whatever its budget. Stage 2's cut-off pathing is what converts the cooldown into a
real bound.

**The acceptance test is therefore not "can the support escape".** It is: *does the
support buy ~4 seconds and then die anyway?* A retreat that always works is the same
bug as a retreat that never works.

---

## 6. Stage 4 — measurement

⚠️ **None of the current instruments can see any of this.** `sweep40` reported a
healthy 38/40 while two units were frozen solid for an entire fight. New metrics
first, then changes.

- **`stuck%`** — frozen **and** hugging cover. Target ~0. The Stage 0 gate.
- **`wander`** — path ÷ net displacement. Target < ~1.5 on all three arenas.
- **`escape success`** — seconds a fleeing support survives with cover available vs
  without. Must be **positive but bounded**; unbounded is the §5 failure.
- **`min escape gap`** — the shortest interval between two escapes by the same unit.
  ⚠️ Sharper than "escapes per fight", which is blunt: it is the BACK-TO-BACK pair that
  breaks a fight, not the total. The lockout puts a floor under this directly, so the
  metric and the mechanism check each other.
- **per-arena resolved** — `tools/mapsweep.ts` already does this.

The three arenas become the regression suite. **Titan's Rest is the gate:** it is kept
deliberately broken and it is the sharpest reproduction of the problem — do not fix it
by deleting the rubble.

⚠️ The **field goldens will move**, deliberately, and should be recaptured in their own
commit once Stage 1 lands.

---

## 7. Order of work

| stage | content | gate |
|---|---|---|
| **0** | push-out, strict band guard, no terminal block | `stuck%` → ~0 |
| **4a** | `stuck%` + `wander` instruments | must precede 0 to prove it |
| **1** | visibility graph + A*, waypoints into `stepToward` | `wander` < 1.5; goldens recaptured |
| **2** | LoS-break flight, peek, cut-off pursuit | escape success positive |
| **3a** | Fall Back: ~15s cooldown, trigger, backpedal suspended, ~5s shared lockout | resolved ≥ baseline; `min escape gap` ≥ lockout |
| **3b** | Disengage + Teleport (no Stage 1 dependency) | escape bounded **with the ability drafted** |
| **3c** | Dash (needs Stage 1) | wander unchanged; no dashing into cover |

**Stage 4a genuinely comes first.** Building Stage 0 without the instrument means
grading the fix on `resolved`, which is exactly the number that already hid the bug.

## 8. Knock-ons

- Map geometry becomes a real design surface — chokepoints and pillars start meaning
  something, which makes the arena set content rather than scenery.
- Stage 1 is the **prerequisite** for the deferred `spatial.ts` movement abilities;
  Shadowstep and Disengage cannot be built sensibly on wall-sliding.
- `FIELD_W`/`FIELD_H` are already `let` with `setFieldSize`, so per-arena work is
  unblocked.
