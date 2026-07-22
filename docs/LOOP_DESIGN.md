# Monster Tamer — Closing the Fun Loop

> Design doc from the 2026-07-22 critique. Turns the game from a rich *box of systems*
> into a *loop worth repeating*. Companion to `docs/TACTICS_DISCLOSURE.md` (the tactics
> layer this builds on) and `docs/GAME_DESIGN.md` (original design).

---

## The problem, in one line

The game has enormous mechanical breadth and one genuinely clever core idea (emergent
classes), but the central loop has three broken links: **you can't see that your tactics
mattered** (battles pre-simulate and replay opaquely), **your effort evaporates** (monsters
age out at 4–6 years with no legacy), and **there's no reason to climb** (the ladder is a
number, not a destination). Between-competition weeks are also repetitive (feed → train →
advance, with no variance).

## The target loop

Every system below serves one arrow of this loop:

```
  SCOUT ───────► ADAPT ───────► COMPETE ───────► READ RESULT ───────► PROGRESS ───────► RETURN
  read a real    tactics /      round-robin      "you won            trainer level +   sharper monster,
  gameplan       loadout /      cup, replayed    BECAUSE…"           bloodline         rival one notch
                 training /                                                            stronger
                 breeding
```

Missing arrows today: **Scout** (rivals have no readable gameplan), **Read Result** (no
causal report), **Progress** (no meta-progression / legacy), **Return** (no rival). This
doc adds those four and gives the weeks texture with an event framework.

## Design pillars

1. **Event framework** — connective tissue; the highest-reuse system. Carries rival
   challenges, illness, sponsors, off-ladder moves, and the eventual excursion minigame.
2. **Rival system** — a named, persistent, rubber-banded rival trainer who climbs alongside
   you and gives the ladder a face and an ending.
3. **Rival gameplans + scouting reveal** — rivals run *readable* team archetypes through the
   existing tactics system; scouting reveals the archetype + a counter-hint. This is the
   front half of the causality loop (TFM/FM-style scouting).
4. **Causal battle report** — a post-battle readout that attributes the outcome to the orders
   you gave. The back half of the causality loop. Cheapest, highest perceived-depth upgrade.
5. **Meta-progression** — a persistent **trainer/ranch level** (the ranch is the meta
   character, monsters are the runs) + **bloodline inheritance** via real breeding depth.
   Fixes "effort evaporates."

### Deferred (noted, out of scope for these phases)

- **Goal gradient → achievements.** Milestone goals that unlock *new play* are folded into a
  future achievements system, not built standalone.
- **Economy rebalance.** Deliberately last: the systems below add gold sinks (lifespan elixir,
  event costs, breeding) and sources (event payouts, rival matches) that the economy must be
  balanced *against*, so one pass after they land.
- **Lifespan elixir.** A rare, expensive, once-per-monster `+1 year` item. A good gold sink and
  a bittersweet choice, but a *secondary* system — do not let it trivialise the lifespan
  pressure that gives the game stakes. Slots into Phase 5 / the economy pass.

---

## System specs

Concrete data models and integration points. Phases below reference these.

### A. Event framework

A weekly incident that mostly presents a **choice with a trade-off**, not just a number.

```ts
// core.ts
interface GameEvent {
  id: string
  title: string
  body: string                       // flavour + the stakes
  weight: (g, c) => number           // 0 = ineligible; higher = more likely
  choices: EventChoice[]             // 1 = a pure "happening"; 2–3 = a real decision
}
interface EventChoice {
  label: string
  apply: (g, careerId) => GameState  // mutates gold / career stats / flags, returns new state
  note?: string                      // one-line preview of the consequence
}
```

- **Where it fires:** in `town.ts:advanceWeek`, after feeding + activity, before the tournament
  step. Roll once per week against a seeded rng (`g.seed:week:event`) so it's deterministic and
  replay-safe. Target frequency ~1 in 2–3 weeks (an `EVENT_CHANCE` + a "no event" weighted entry).
- **Weighting by state:** low happiness → more misbehaviour events; higher license → bigger
  sponsor offers; injured monster → illness/recovery events.
- **Starter event set:** Sponsor offer (gold vs. skipped training), Illness (rest / pay infirmary
  / push through at a penalty), Breakthrough (next drill doubled), Wandering teacher (learn an
  off-ladder move for a fee/happiness), Festival week (excursion ×2 / town happiness), Temperament
  flare (low-happiness monster loses stamina; high-happiness finds gold), **Rival challenge**
  (Phase 2 — an off-calendar grudge match).
- **UI:** a modal on the feeding/stable screen (reuse the in-app modal component from item -90,
  not `window.confirm`). A pure "happening" auto-dismisses into the weekly digest.
- **Save:** `GameState` gains nothing persistent unless a choice sets a flag; events resolve
  within the week. Any new flag needs a `sanitizeAndMigrate` default.

### B. Rival system

```ts
// core.ts
interface Rival {
  id: string
  name: string
  archetype: TeamGameplan            // see spec C
  personality: 'aggressive' | 'cagey' | 'flashy'
  licenseIndex: number               // rubber-banded toward the player's
  record: { wins: number; losses: number }   // head-to-head vs the player
}
// town.ts GameState
rivals: Rival[]                      // 1 primary at new-game; optionally a circuit of 4–5
```

- **Generation:** one primary rival at `newGame`. Rubber-band `licenseIndex` toward the player's
  highest each season so they stay a credible threat (never trivially behind/ahead).
- **Appearance:** injected as one of the rival teams in a share of the player's cups
  (`generateRivalTeamsForTournament` gains an optional "seat this rival here" hook), so the same
  face recurs instead of anonymous "Rival Team 3."
- **Head-to-head:** update `record` whenever a player-vs-rival match resolves; surface it on the
  scout panel and pre-match preamble ("Rex has beaten you 3 of your last 4").
- **Season arc:** the year-end / Tamer Elite showdown is the *ending beat* the ladder lacks.
- **Optional depth:** a `rivals[]` circuit of 4–5 recurring named trainers, each a distinct
  archetype, so gameplan-scouting has characters to remember.
- **Save:** `rivals` defaults to `[]` in migration; absent = regenerate a primary on next load.

### C. Rival gameplans + scouting reveal

```ts
// core.ts
type TeamGameplan = 'rushdown' | 'bulwark' | 'attrition' | 'focusfire' | 'zone'

interface GameplanInfo {
  name: string
  tell: string                       // the composition that signals it
  counter: string                    // the scout counter-hint shown to the player
  toTactics: (team) => { tactics: Tactics; marks?; formationSort? }  // how the AI plays it
}
```

| Gameplan | Composition tell | Plays as |
|---|---|---|
| Rushdown | high DEX/STR, no support | aggressive temperament, focus weakest |
| Bulwark | 2+ tanks, protect orders | cautious, guards its carry |
| Attrition | poison/bleed/healblock kit | stalls, out-sustains |
| Focus-fire | mark orders, high burst | assassinates one target round 1 |
| Zone | AoE casters back-row | punishes clumped formations |

- **Rivals run gameplans through the existing tactics plumbing** — populate the rival team's
  `Monster.tactics` / `PendingTournament.marks` / formation sort from the archetype, then the
  battle engine already applies them. **No separate rival AI.** (Today rivals only use
  `CLASS_PERSONALITY`; this layers a team-level plan on top.)
- **Assignment:** `generateRivalTeam` picks an archetype that fits the rolled composition (or
  rolls a target archetype first, then composes toward it — cleaner and makes the field varied).
- **Scouting reveal:** extend the paid scout tiers (item -15) with the archetype + `counter`
  hint. This is the FM/TFM "info you act on" — scouting stops being trivia and becomes the
  adaptation puzzle.
- **Balance guard:** rival gameplans must not make the field unwinnable at-league; keep the
  existing `RIVAL_BAND_MIN/MAX` strength band — the archetype changes *how* they fight, not how
  strong they are.

### D. Causal battle report

The data already exists in the `BattleEvent` stream (incl. the per-round `snap` with HP + live
statuses from item -69). This is a **pure analysis + presentation** pass, no engine rewrite.

```ts
// battleReport.ts (new)
analyzeBattle(events, tactics, marks, protectId, openerId, teamA, teamB): BattleReport

interface BattleReport {
  turningPoint: { round: number; text: string }
  tacticOutcomes: { label: string; fired: boolean; detail: string }[]  // ✓/✗ per order
  keyMoments: string[]               // 2–3 narrated beats
  counterRead?: string               // your gameplan vs theirs (needs C)
}
```

- **Turning point:** track team HP-fraction differential per `snap`; the round with the largest
  swing toward the winner is the decider. Narrate it.
- **Tactic outcomes:** you know the orders. Scan events — did the marked monster get focused
  before it died? did the protect-guardian's taunt fire when its ward-target dropped below the
  threshold? did the scripted opener land its combo? Emit ✓/✗ + one detail each.
- **Counter-read:** compare player gameplan vs. rival archetype (once C exists): "You ran
  Bulwark into their Attrition — healblock shut down your sustain."
- **Render:** a "Battle Report" card in `arena.tsx` after the replay, above the existing
  per-monster summary table (shared by 1v1 and team layouts).
- **Also:** make a few tactics *punchier* so there's a real effect to report — bias toward
  fewer, bigger, legible levers (formation-style) over 6% additive nudges.

### E. Meta-progression

**Trainer / Ranch level** — the persistent meta character.

```ts
// town.ts GameState
trainerXp: number
trainerLevel: number                 // derived; unlocks below
```
- XP from cups won, monsters raised to retirement, (later) achievements.
- **Unlocks change play, not just numbers:** barn capacity, new drills, ranch facilities (a gym
  → higher training yield, a faster infirmary), a higher *starting* license for new monsters.
- Every monster's short life now feeds a permanent account — the roguelite frame.

**Bloodline inheritance** — real breeding depth, replacing the `average −10%` stub.

```ts
// core.ts
interface Genome {
  species: string                    // from one parent; fusion-species for cross-body pairs
  aptitudes: AuthoredAptitude        // major/minor/flaw mixed from both parents
  innatePool: string[]               // inherits ONE innate from each parent's pool
  potential: number                  // stat-ceiling multiplier — the heritable "star rating"
  signatureMove?: string             // small chance to pass a parent's best move down
}
```
- **`potential` is the hook:** a bred baby's potential = `avg(parents) + smallBreedingBonus`, so a
  carefully-bred line *exceeds* wild-caught ceilings after a few generations. The stable literally
  gets better stock over time.
- **Retirement → stud:** a retired champion becomes a breeding parent (not just frozen/fused
  away), so its life seeds the next generation.
- Pairs with trainer-level unlocks (better market, more barn slots) for long-term pull.

**Hall of Fame with live perks** (optional, same phase) — enshrined champions grant small
stable-wide passives (a HoF Bard → +1 starting happiness for all future monsters). Retirement
becomes a reward, not a loss.

---

## Implementation phases

Sequenced by dependency. Each phase is independently shippable through the standard
preview→main→deploy pipeline, and must land `tsc` + `npm run build` + `npm test` (goldens) clean.

### Phase 0 — Foundations (do inside Phase 1)

- **`GameState` migration discipline:** every new field (`rivals`, `trainerXp`, event flags)
  needs a `sanitizeAndMigrate` default in `App.tsx`. Absent = sensible default, never a crash.
- **RNG discipline:** all new randomness uses seeded `mulberry32(hashString(g.seed:week:...))`.
  Anything touching `previewWeekEffects` must be mirrored exactly in `applyWeek` (lock-step).
  Anything touching monster *generation* rng shifts the golden battle tests — recapture
  deliberately, never by accident (see the `NORMAL_FOODS` fix, item after -42).

### Phase 1 — Event framework  ★ build first

**Why first:** connective tissue. Rival challenges, illness, sponsors, off-ladder moves, and the
excursion minigame all hang off it.

- **Ships:** the `GameEvent`/`EventChoice` model; the weekly roll in `advanceWeek` (seeded,
  ~1-in-2–3, state-weighted); an in-app event modal; a starter set of 5–6 events (sponsor,
  illness, breakthrough, wandering teacher, festival, temperament flare). *Not* the rival
  challenge yet (needs Phase 2).
- **Files:** `core.ts` (types + `EVENTS` table), `town.ts` (`rollWeeklyEvent`, `advanceWeek`
  hook, any choice mutators), `App.tsx` (event modal + wiring into the feeding/stable flow),
  `game.ts` if a choice touches career state, `validate.ts` (assert every event's weights/choices
  are well-formed).
- **Verify:** seeded sim proving events fire at the expected cadence and each choice mutates state
  correctly + deterministically; a `previewWeekEffects` check if any event can alter the planned
  week; browser pass triggering an event and taking each branch; goldens untouched (battles not
  affected).
- **Done when:** weeks visibly vary, events are deterministic/replay-safe, no console errors.

### Phase 2 — Rival system

**Depends on:** Phase 1 (rival challenge = an event).

- **Ships:** `Rival` model; primary-rival generation at `newGame`; rubber-banded license;
  head-to-head record; rival seated into a share of the player's cups; a "rival challenge" event;
  pre-match / preamble surfacing of the record. Optionally the 4–5-trainer circuit.
- **Files:** `core.ts` (`Rival`), `town.ts` (`generateRivals`, `GameState.rivals`, seat-in-cup
  hook in `generateRivalTeamsForTournament`, record updates in `resolveTournament`), `App.tsx`
  (rival on scout/preamble screens + challenge event UI), `sanitizeAndMigrate` default `[]`.
- **Verify:** sim confirming the rival recurs across a season and the record updates correctly;
  rubber-band keeps them within band of the player; browser pass seeing the same named rival
  twice; goldens untouched.
- **Done when:** the ladder has a recurring face and a tracked grudge.

### Phase 3 — Rival gameplans + scouting reveal

**Depends on:** Phase 2 (rivals exist) + the existing tactics system.

- **Ships:** `TeamGameplan` archetypes + `GameplanInfo` table; `generateRivalTeam` assigns an
  archetype and populates the team's `tactics`/`marks`/formation from it; the scout panel reveals
  the archetype + counter-hint at a scout tier.
- **Files:** `core.ts` (`TeamGameplan`, `GAMEPLANS`), `town.ts` (archetype assignment in team
  gen, scout-tier extension), `battle.ts` (none if the tactics plumbing already applies — verify),
  `App.tsx` (`ScoutReport` shows gameplan + counter), `validate.ts` (every archetype maps to a
  legal tactics config; band-strength unaffected).
- **Verify:** sims showing each archetype visibly changes rival play (focus-fire opens on a
  back-row caster; bulwark stalls; attrition out-sustains) while staying inside `RIVAL_BAND`;
  the at-league win-rate stays fair; browser pass scouting a gameplan and countering it; capture
  fresh goldens **only** for any deliberate engine change (there shouldn't be one — this reuses
  tactics).
- **Done when:** scouting → adapting → winning-because-you-adapted is a real, legible puzzle.

### Phase 4 — Causal battle report

**Depends on:** Phase 3 (counter-read wants archetypes; the rest is standalone and could even
precede Phase 3 if you want the cheap win sooner).

- **Ships:** `analyzeBattle` → `BattleReport`; the report card in `arena.tsx`; punchier tactic
  tuning where effects are too subtle to report.
- **Files:** `battleReport.ts` (new, pure), `arena.tsx` (render), `battle.ts` (only if a tactic
  needs a bigger, more legible effect — recapture goldens if so).
- **Verify:** unit-style checks on `analyzeBattle` over seeded battles (turning-point picks the
  real swing round; tactic ✓/✗ matches what the event stream shows; mark/protect/opener detection
  correct); browser pass reading the report after a cup; add a `battleReport.test.ts`.
- **Done when:** every prep decision is *visibly* causal after the fight.

### Phase 5 — Meta-progression (trainer level + bloodline)

**Depends on:** nothing structurally, but most valuable after 1–4 give the loop its shape.

- **Ships:** `trainerXp`/`trainerLevel` + XP sources + play-changing unlocks; the `Genome`
  breeding model replacing the fusion stub, with heritable `potential` that climbs over
  generations; retirement→stud; optionally Hall-of-Fame live perks. (Lifespan elixir can ride
  along here as a Ranch Shop item, but keep it rare/expensive.)
- **Files:** `town.ts` (trainer XP/level, unlock gating, breeding rewrite in the Lab, HoF),
  `game.ts` (`newCareer` reads a `Genome`; potential → stat ceilings), `core.ts` (`Genome`),
  `App.tsx` (trainer-level UI, breeding UI, HoF screen), `validate.ts` (breeding math sane,
  potential bounded), `sanitizeAndMigrate` defaults.
- **Verify:** sim breeding several generations and confirming `potential` climbs (and is bounded);
  trainer-level unlocks gate correctly; retirement seeds a stud; browser pass through a full
  breed → raise → the baby exceeds a wild-caught ceiling; goldens untouched unless generation rng
  changed (recapture deliberately if so).
- **Done when:** a monster's life leaves a permanent mark and the stable measurably improves.

### Later (own passes, not these phases)

- **Achievements** (absorbs the goal-gradient work).
- **Economy rebalance** (one pass, after the above change the money flows).
- **Excursion minigame** (a Phase-1 event slot, fleshed out).

---

## Cross-cutting checklist (every phase)

- [ ] `npx tsc --noEmit` clean, `npm run build` clean, `npm test` 12/12 green (goldens moving =
      an intended engine change → recapture on purpose, never silently).
- [ ] Any new `GameState`/`Career` field has a `sanitizeAndMigrate` default; old saves load.
- [ ] `previewWeekEffects` mirrors `applyWeek` byte-for-byte for anything touching the weekly tick.
- [ ] New randomness is seeded + deterministic (replay-safe).
- [ ] `validateDesign()` extended where a new invariant exists, so it's enforced not eyeballed.
- [ ] Browser pass with zero console errors before commit.
- [ ] Ship via preview → main → manual `npm run deploy` (git builds still EBADPLATFORM).
