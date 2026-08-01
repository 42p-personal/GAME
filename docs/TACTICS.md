# Tactics — the standing orders, what they do, and what actually works

`Tactics` (`src/core.ts`) parameterises the AI **side-agnostically**: the same fields
drive the player's orders and rival `GAMEPLANS`. A scouted plan is the one actually
fought.

⚠️ **That is true of the TURN engine. It was not true of the FIELD engine** — the one
M7 is moving the game to. `tools/tactics.ts` audits which fields the field engine
reads at all; run it after touching anything here.

```bash
npx tsx tools/tactics.ts
```

⚠️ **The audit counts MENTIONS, not firing.** An incidental reference launders a dead
field as a live one — a stray `!u.m.tactics?.openerIds` clause in an unrelated
condition once made the tool report `openerIds` as wired. A field dropping off the
dead list means the engine *reads* it, nothing more. Prove it FIRES separately:
build two teams differing only in that field and count the casts it should change.
`healPolicy` is the only one with that evidence (the trio golden moved).

---

## Status

| tactic | what it does | state |
|---|---|---|
| `temperament` | aggressive / balanced / cautious — the master dial on how far a monster commits | ✅ live, 19 refs |
| `targetPriority` | who to attack: weakest / casters / tanks / marked | ✅ live — **now reaches melee too** |
| `preserve` | below a HP threshold, play to survive — block, drop self-harm moves | ✅ live |
| `formation` | `keep` the deployed slot, or `tight`/`spread` and drift with the team | ✅ **live, built** (replaced `spacing`) |
| `commit` | `dive` past the enemy front line, or `hold` and refuse to over-extend | ✅ live |
| `healPolicy` | `triage` holds a restore until an ally is ≤55% HP; `steady` fires when up | ✅ live, **verified** |
| `useCover` | prefer ground where an obstacle breaks enemy line of sight | ✅ live |
| `manaPolicy` | see below — **needs rework** | ⚠️ wired, unverified, wrong semantics |
| `ccPriority` | lead with hard control before committing to damage | ⚠️ wired, unverified |
| `openerIds` | scripted opening sequence, up to 2 equipped moves, played in order | ❌ **dead — should work** |
| `openerId` | legacy single opener, superseded by `openerIds` | ❌ dead — **delete** |
| `engageRange` | skirmish at max reach / brawl close / hold position | ❌ **remove** |
| `comboDiscipline` | hold `bonusVsStatus` payoffs until the setup status is on the target | ❌ **remove** |

---

## Decisions taken (2026-08-01)

### REMOVE `engageRange`
Superseded. `CLASS_BASIC` now authors a reach band per class and `reachOf` takes the
shorter of best weapon and class basic, so where a monster stands is decided by what
it is holding rather than by an order. The tactic had **one** reference left in the
field engine and no longer expresses anything the engine does not already decide
better.

### REMOVE `comboDiscipline`
⚠️ **The combo is the PLAYER'S choice, not an order.** Picking a `bonusVsStatus` payoff
alongside its setup status is itself the decision; a monster holding both should
prefer to combo without being told. Delete the field and make the preference
unconditional in the picker.

### FIX `manaPolicy` — currently wrong
Two settings only:

- **`burst`** — spend freely, no reserve.
- **`conserve`** — hold **30%** of max MP until the target is **below 50% HP**, then
  spend it on the **biggest spell**.

⚠️ **What is shipped does NOT do this.** It gates on the reserve alone with no HP
condition, so a `conserve` unit dumps its reserve into the dearest move the moment it
is the dearest move — regardless of whether the target is nearly dead. The reserve is
supposed to be a *finisher fund*: held through the healthy phase, released for the
kill. Rewrite the gate in `chooseMove` around `target.hp / target.maxHp < 0.5`.

⚠️ Earlier still, the FIRST version blocked any cast dipping below the reserve, so the
30% was never spent at all and a `conserve` unit ended fights holding mana. Both
errors are the same mistake: treating a reserve as untouchable rather than as saved
for a moment.

### MAKE `openerIds` WORK
Ten UI references — a player builds a scripted opening and the field engine ignores
it entirely. ⚠️ This is the only one of the five that is **not** a scoring nudge: it
needs per-unit sequence state (which opener index this monster has played), so it
cannot be done as a multiplier in `chooseMove` the way `ccPriority` was.

---

## Two screens: TEAM tactics and MONSTER tactics

The orders split by **what they are a decision about**. A team order is a plan for
the side — it should read the same for every monster on it. A monster order is that
individual's own behaviour, and two monsters on one team should routinely differ.

### Team tactics — one setting for the side

| tactic | why it belongs to the team |
|---|---|
| `temperament` | how hard the SIDE commits; mixing it per monster produces a team fighting two plans at once |
| `commit` | dive or hold — whether the side over-extends together |
| `healPolicy` | triage or steady is a plan for the team's whole mana pool, not one healer's habit |

⚠️ **`spacing` LEFT this screen.** It was listed here on the reasoning that a
formation is meaningless if half the team disagrees. That reasoning survives — the
SHAPE is still a team artefact, drawn on the deploy screen — but *adherence to it*
is the interesting decision and it is per monster. See `formation` below.

### Monster tactics — per individual

| tactic | why it belongs to the monster |
|---|---|
| `ccPriority` | only meaningful on a monster that HAS hard control; nonsense as a team-wide toggle |
| `manaPolicy` | a nuker holds its reserve, a filler-caster should not — the opposite orders on one team is correct play |
| `useCover` | a back-liner hugs the pillar, the wall in front of it must not |
| `preserve` | when THIS monster gives up on the fight and plays to live; a per-monster risk appetite |
| `formation` | one monster can hold its slot while another fans out — see below |
| `targetPriority` | see below — the one that gains the most from being per-monster |

⚠️ **`targetPriority` becomes an enemy PICKER, not a rule.** Today it is an abstract
preference (weakest / nearest / biggest threat). Per monster, against a scouted
field, it should let the player name *which enemy* this monster goes for — which is
what makes scouting worth paying for. A scouted cup already reveals the rival's
`TeamGameplan`; naming the enemy healer and pointing two monsters at it is the
payoff that turns scouting from information into a decision.

⚠️ **`openerIds` is unassigned.** A scripted opening is per-monster by nature (it
names that monster's own equipped moves), so it belongs on the MONSTER screen — but
it is still unbuilt, so place it when it is built rather than reserving space now.

⚠️ **Splitting the screens is a UI change over a SHARED data model.** `Tactics` stays
one interface; the two screens are two views onto it. Do NOT fork the type — the
whole reason a scouted plan is the one actually fought is that rival `GAMEPLANS` and
player orders write the same fields.

---

## `formation` — SHIPPED

Replaced `spacing`. One control, three choices:

| option | behaviour |
|---|---|
| `keep` | hold the SLOT it deployed in, relative to the team as the team advances |
| `tight` | no slot — drift with the team and clump up (focus-fire, AoE bait) |
| `spread` | no slot — drift with the team but fan out (AoE insurance) |

### What `keep` actually does

The anchor is **`live ally centroid + this unit's deploy offset`**, blended into the
goal at `FORMATION_KEEP_PULL` (0.55), coached by temperament like every other
spatial order.

⚠️ **THE ANCHOR IS RELATIVE, NOT ABSOLUTE.** Pinning to the literal deploy point is
a formation that never leaves the start line — at a 0.55 blend nothing would ever
reach the enemy and every fight would run to sudden death. `tactics.test.ts` pins
this directly: a straggler whose team has advanced is pulled FORWARD, not back to
spawn.

⚠️ **BOTH CENTROIDS OVER THE SAME LIVE SET, both including self.** Hold the deploy
centroid over the original six and a team down to two keeps standing in the gaps
where its dead used to be, politely spread out for an enemy that is now
concentrated. Taking them over *different* sets offsets the whole formation by the
difference.

⚠️ **`deployPos` is stamped AFTER the obstacle nudge**, not before — a slot inside a
rock is one the unit spends the whole fight failing to stand on.

⚠️ **`keep` takes the BASE spacing radius**, not a third density setting. Under
`keep` the density was already drawn on the deploy screen, so a multiplier on top
would be a second, invisible order fighting the slot the unit is being pulled
toward. Density is a choice only when there is no slot to hold.

### Measured — `tools/formation.ts`

⚠️ **MIRRORED PAIRS, NOT A WIN RATE AGAINST A FIXED FOE.** The compositions are not
symmetric, so "the keeping team won 60%" would mostly measure whether template A
beats template B. Every fight runs both ways round and the score is how often the
ORDERED side won, which cancels the matchup out. Sign test, 160 fights each:

| order | ordered side W–L | p | median duration | range |
|---|---|---|---|---|
| `keep` | 74–86 | 0.34 | 22.7s (plain 22.3s) | 7.6–66.9s |
| `tight` | 82–78 | 0.75 | 21.4s | 7.4–58.9s |
| `spread` | 73–87 | 0.27 | 23.4s | **9.7–256.8s** |

✅ **All three are win-rate neutral, which is the RIGHT result for a tactic** — a
style choice, not a power choice. They visibly change the fights (durations and
outcomes both move) without any one being correct.

⚠️ **But `spread` has a 256.8s tail**, against a 48.0s worst case unordered — one
fight nearly ran the 300s cap out. That is PRE-EXISTING (`spacing: 'spread'` used
the same ×2.6 radius) and had simply never been measured. A team ordered to fan out
can fail to concentrate enough damage to close a fight at all. Left as-is because
it is a real cost of a real choice, but it is the first thing to look at if the
grind complaint comes back.

### ⚠️ No `break` option — designed and rejected

A third setting, "ignore the formation and hunt `targetPriority`", was designed for
diving an enemy back line and then cut. Two reasons, both worth keeping written
down so it is not re-proposed:

1. **It re-creates by order the one shape this engine balances worst.** Melee
   measured 100% deaths alone against 81% beside a second front-liner — same
   monsters, different team. A monster crossing the field solo IS that case.
2. **It needed the melee nearest-target early return opened up.**
   `decide.ts:pickTarget` returns the nearest enemy for melee and returns BEFORE
   the scoring loop `priorityBias` lives in — so `targetPriority` is currently dead
   on every melee unit, including the knife assassin the idea rested on. That guard
   is correct as a default; its own comment records that value-chasing "is exactly
   what made melee race around the map".

✅ Note (2) is now FIXED — see below. Note (1) still stands on its own.

---

## `targetPriority` — from rule to picker

Today: four abstract preferences, applied as a **nudge, not an override**
(`priorityBias`, +0.30–0.50 into a score that reaches ~5) — deliberately, so a target
order coaches rather than mind-controls.

- `weakest` — bias by missing HP
- `casters` — bias support-role enemies
- `tanks` — bias by maxHp (⚠️ also *lowers* predation in `traitsFor`)
- `focus` — bias whoever carries `Monster.marked`

⚠️ **`focus` + `marked` IS ALREADY THE PICKER, at team scale.** `town.ts:2352` sets
`marked` on exactly ONE enemy at scout time and the whole side prioritises it. So the
per-monster picker is a *generalisation of shipped plumbing*, not new machinery:
`marked: boolean` on the enemy becomes a `targetId` on the chooser.

### ✅ FIXED: the order now reaches melee

`pickTarget` returned the nearest enemy for melee and returned **before** the
scoring loop `priorityBias` lives in, so `targetPriority` did nothing at all on a
melee monster — most of the roster. Set in the UI, set by three `GAMEPLANS`,
silently discarded.

⚠️ **The fix is NOT to score melee like ranged.** Value-chasing across open ground
is the failure that branch exists to prevent. The order is spent as a **bounded
distance discount** instead: a prioritised enemy counts as up to
`MELEE_PRIORITY_SLACK` (10) × `priorityBias` world units nearer than it is — 3.0–5.0
units, against deploy hexes 2.6 apart. That is one to two ranks: far enough to step
around a front-liner onto the marked healer behind it, nowhere near far enough to
cross a 40-unit field. `tactics.test.ts` pins BOTH halves — it takes the mark at 15,
and refuses it at 30.

It also pays for the reach honestly: standing next to someone you are not hitting is
free damage for them.

**Measured — `tools/priority.ts`**, mirrored pairs, 119 fights where the defender
actually fields a support (⚠️ fights without one would dilute a real effect toward
zero with fights the order cannot express):

| slack | support died | median time to that kill |
|---|---|---|
| 0 (melee deaf) | 73/119 | 14.4s |
| 4 | 72/119 | 13.9s |
| 6 | 70/119 | 13.9s |
| 8 | 77/119 | 13.7s |
| **10 (shipped)** | 73/119 | **12.9s** |

*(plain, no order: 68/119 at 15.7s.)*

Monotone on time, noise on the count: ordering `casters` does not change **whether**
their support dies, it changes **when** — and the melee half of the order is worth
about half of that. Fights where the order was already obeyed by the ranged units
were carrying it alone.

⚠️ **The `trio` golden moved 27.6s → 23.6s and this time the cause IS understood** —
goldens set `DEFAULT_TACTICS`, whose `targetPriority` is `weakest`, so melee now
finishes wounded bodies. The 40-matchup sweep saw NOTHING because `tools/comps.ts`
monsters carry no tactics at all; see `docs/BALANCING.md`.

### Proposed shape

```
targetPriority: 'weakest' | 'casters' | 'tanks' | 'focus' | { enemyId: string }
```

- Named enemy resolves to a bias like `focus`'s, and falls back to `weakest` when
  that enemy is dead or was never in the fight.
- ⚠️ **It must survive not scouting.** A named enemy is only offerable when the field
  is known; unscouted cups and the ranch's standing orders must still produce a legal
  value. Keep the four abstract options as the always-available set.
- ⚠️ **Keep it a bias.** Raising it to an override would undo the diveThreat /
  isolation / focus-fire reads that make the field engine look coordinated, and would
  make every monster on a team walk past a live threat to reach one named body.
  A `break`-formation monster is where a *stronger* bias belongs — that is what the
  player traded position for.

### Why this makes scouting pay

Scouting already reveals the rival `TeamGameplan`. It currently buys ONE kill order
for the whole side. Per monster it buys a plan: two bodies on their healer, the
assassin `break`ing onto their artillery, the wall holding formation in front. That
is information becoming a decision, which is the thing scouting has never quite done.

---

## Constants

| constant | value | file |
|---|---|---|
| `TRIAGE_AT` | 0.55 | `tamerengine/types.ts` |
| `MANA_RESERVE` | 0.30 | `tamerengine/types.ts` |
| `CC_PRIORITY_BONUS` | 1.8 | `tamerengine/types.ts` |

⚠️ `CC_PRIORITY_BONUS` is a **multiplier, not an override** — control still has to be
worth casting, so a 10-power stun does not beat a finisher on a nearly-dead target.
It is also gated on the target not already being under hard control, or the order
spends every stun re-stunning someone helpless.

---

## Open

- `manaPolicy` rewritten to the finisher-fund rule above, then fire-checked.
- `ccPriority` fire-checked — wired, never proven to change a cast.
- `openerIds` implemented with per-unit sequence state.
- `engageRange` and `comboDiscipline` deleted from `Tactics`, `GAMEPLANS`,
  `TacticsPanel`, and any saves migration.
- Split `TacticsPanel` into TEAM and MONSTER screens per the section above —
  two views over one `Tactics` type, not two types.
- `targetPriority` reworked from an abstract rule into a scouted-enemy picker.
- ⚠️ **`targetPriority` is dead on melee** — `decide.ts:pickTarget` returns before
  `priorityBias` is ever read. Fix this BEFORE building the picker, or the picker
  ships dead on half the roster.
- ⚠️ **An unexplained golden.** The `trio` field golden moved when `manaPolicy`'s
  reserve rule changed, and absent `manaPolicy` should be a no-op — that golden sets
  none. Recaptured on instruction, not because the cause was understood. Chase it
  before trusting the constant.
