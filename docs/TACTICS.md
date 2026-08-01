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
| `targetPriority` | who to attack: weakest / nearest / biggest threat | ✅ live |
| `preserve` | below a HP threshold, play to survive — block, drop self-harm moves | ✅ live |
| `spacing` | `spread` against AoE, `tight` to focus-fire | ✅ live — **folds into `formation`** |
| `commit` | `dive` past the enemy front line, or `hold` and refuse to over-extend | ✅ live |
| `formation` | `keep` (hold the deployed shape) or `break` (ignore it and hunt) | 🔵 **new — designed below** |
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
| `formation` | keep the deployed shape, or break it and hunt — see below |
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

## `formation` — the order that unlocks the assassin

Replaces `spacing`. Two settings, the second nesting the old spacing choice:

- **`keep`** — loosely hold the shape it was deployed in.
  - **`tight`** / **`loose`** — the former `spacing`, live only under `keep`.
- **`break`** — ignore the shape entirely and hunt `targetPriority`.

The intent is a monster that leaves the wall and goes for the enemy back line, and
the trade that buys it: it arrives alone, out of heal range, with nothing between it
and the enemy front.

### ⚠️ THREE THINGS THE ENGINE DOES NOT CURRENTLY DO

**1. `targetPriority` IS DEAD ON EVERY MELEE UNIT.** `decide.ts:206` returns the
NEAREST enemy and returns *before* the scoring loop that `priorityBias` lives in, so
a melee monster never reads its target order at all. The knife assassin the whole
idea is built around (Assassin line reach 2.4–2.8) is melee. **The blocker on
"assassins charge the back line" is not formation — it is this early return.**

⚠️ And the early return is CORRECT as a default. Its own comment says why: letting
melee chase value across the map "is exactly what made melee race around the map",
one of the worst behaviours this engine has had. So do not simply delete it.

✅ **That makes `formation` the right gate.** `break` is the player OPTING IN to
cross-map melee hunting, monster by monster, having accepted the cost. The default
stays nearest-target. The tactic is not just a positioning toggle — it is the
permission slip that makes melee target orders legal.

**2. There is no formation to keep.** `autoDeployByRole` / `placeA` / `placeB` set
positions at t=0 and are never read again. What holds a team together afterwards is
the cohesion pull in `desiredGoal` (`decide.ts:431`), which drags the goal toward the
**live ally centroid** — a blob that drifts, not a shape. `keep` needs each unit's
deploy offset stored *relative to its team's deploy centroid* and the pull aimed at
`centroid + offset` instead. That is a genuine upgrade in its own right: the tank
stays front-left and the healer back-right, instead of everyone collapsing inward.

**3. `spacing` was never formation.** `spacingRadius` is a personal-space radius —
how close allies stand — and nothing else. Folding it under `keep` as `tight`/`loose`
is honest about that: it is the *density* of a shape that `keep` is now maintaining.

### Engine sites

| behaviour | site | change |
|---|---|---|
| melee ignores target orders | `decide.ts:206` `pickTarget` | early return gated on `formation !== 'break'` |
| shape-keeping | `decide.ts:431` cohesion pull | aim at `centroid + deployOffset`, not bare centroid |
| break = loner | same | `break` zeroes the pull (and should lower `cohesion` in `traitsFor`) |
| density | `decide.ts:319` `spacingRadius` | read `formation === 'keep' ? tight/loose : base` |
| deploy offsets | `FieldUnit` | new field, captured once from `placeA`/`placeB` |

### ⚠️ Open: does `break` beat the team's `commit: hold`?

They collide. `commit` is a TEAM order capping how far past halfway a unit will go
(`commitLimit`); `break` is a MONSTER order to dive the back line. **Recommendation:
`commit` stays authoritative.** A team told to hold the line should not have one
monster silently overrule it — that is the counterplay to over-extension, and if a
per-monster order can void it the team screen stops meaning anything. `break` then
reads as "freelance *within* the leash", and a player who wants the true dive sets
`commit: dive` as well. Two orders agreeing is a legitimate combo; one order
cancelling another is a bug the player cannot see.

### ⚠️ The team screen is now three items

`temperament`, `commit`, `healPolicy`. Thin, and `commit` is the closest neighbour to
`formation` — watch that the two do not read as the same control to a player. If it
does not survive contact, the answer is probably to merge `commit` INTO `formation`
rather than to pad the team screen out.

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
- `formation` built: deploy offsets on `FieldUnit`, the melee gate, the cohesion
  rework, `spacing` folded in as `tight`/`loose` under `keep`.
- ⚠️ **Sim `break` before shipping it.** A monster that crosses the field alone is
  the shape this engine has historically balanced WORST — melee measured 100% deaths
  alone and 81% beside a second front-liner. `break` deliberately re-creates the
  losing case, so it needs to cost the enemy something real or it is a trap option.
  Measure it as a paired A/B on one composition with one monster switched, not as a
  sweep — a sweep will drown a single unit's behaviour in team noise.
- ⚠️ **An unexplained golden.** The `trio` field golden moved when `manaPolicy`'s
  reserve rule changed, and absent `manaPolicy` should be a no-op — that golden sets
  none. Recaptured on instruction, not because the cause was understood. Chase it
  before trusting the constant.
