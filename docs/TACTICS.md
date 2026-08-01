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
| `spacing` | `spread` against AoE, `tight` to focus-fire | ✅ live |
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
- ⚠️ **An unexplained golden.** The `trio` field golden moved when `manaPolicy`'s
  reserve rule changed, and absent `manaPolicy` should be a no-op — that golden sets
  none. Recaptured on instruction, not because the cause was understood. Chase it
  before trusting the constant.
