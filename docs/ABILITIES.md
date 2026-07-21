# Abilities — The 90-Move Pool

15 skills per stat (STR/DEX/CON/WIS/INT/CHA), learned automatically once that stat crosses the listed
threshold (`LEARN_LADDER`, `src/moves.ts`). Every skill costs MP — Attack and Block are the only free
actions. A monster equips 3 at a time via the Ability Selection UI (`AbilitySelector`, `src/App.tsx`);
the rest sit in its learned pool, swappable any time outside an active tournament week.

**Nothing lasts "for the fight" anymore.** Every buff and debuff is round-limited (see the Dur column)
and expires on its own — re-casting the same move refreshes its remaining duration rather than stacking a
second copy. Cooldowns are tuned so a buff/debuff can't stay up permanently; there's always real
downtime between windows.

**Columns:** Lvl = stat threshold to learn · MP = mana cost (`monster.ts:manaCost`, derived from power/
hits, not authored directly) · CD = cooldown in turns · Dur = rounds a buff/debuff stays active (blank =
not a duration effect — guard/ward/heal/cleanse resolve instantly or as a resource pool) · Acc = accuracy
% · Pwr = base power (per hit, for multi-hit moves) · Target = who it can hit.

---

## Design philosophy — each stat is a distinct kit, not just a colour

- **STR** — highest raw hits, a couple of recoil attacks (capped at 15%), **self buffs only**, one
  Fire-elemental attack (Reckless Slam) and one Earth-elemental attack (Earthshaker).
- **DEX** — poison + precision, heavy on multi-hit, **self buffs only**, one Air-elemental attack
  (Rain of Arrows) and one Water-elemental attack (Needle Storm).
- **CON** — the **only** stat that grants shields (ward) or armour (defBuff); it taunts (forces the
  target to attack the taunter — inert until team battles exist, but the flag is live); some self-heal;
  very few party buffs (currently none); self-cleanse.
- **WIS** — heavy mana regen and mana burn; healing reaches an ally (Tranquility), not just the self; a
  handful of self-buffs plus one team-wide regen buff (Attunement); one party-wide cleanse (Spirit Ward).
- **INT** — all four elements represented across its 15 moves; a mix of AoE and single-target; **zero
  buffs, zero healing** — pure elemental damage, full stop.
- **CHA** — buffs land on the user's whole team; debuffs land on the enemy's whole team. No self-only or
  single-target buff/debuff moves in the pool — CHA is built to swing group fights, not solo ones.

---

## STR — bruising, armour-breaking, high-risk finishers

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Jab | 40 | 10 | 1 | – | 95% | 12 | Enemy | Quick light melee hit. |
| Guard | 40 | 12 | 3 | – | 100% | – | Self | Brace against the next hits. |
| Power Strike | 90 | 28 | 2 | – | 90% | 30 | Enemy | Heavy single-target blow; 5% recoil. |
| War Cry | 120 | 12 | 5 | 3 | 100% | – | Self | Battle fury: +15% damage for 3 rounds. |
| Cleave | 160 | 18 | 3 | – | 85% | 20 | All enemies | Sweeping hit that splashes all foes. |
| Rending Blow | 200 | 22 | 3 | 3 | 85% | 24 | Enemy | Dents armour for 3 rounds; 50% chance to cause Bleed. |
| Flurry of Blows | 240 | 24 | 3 | – | 90% | 9 | Enemy | A rapid combination, 2–4 strikes. |
| Bonebreaker | 330 | 26 | 4 | 3 | 85% | 28 | Enemy | Shatters defence for 3 rounds; 40% chance to leave the target Vulnerable. |
| Bracer | 380 | 12 | 4 | – | 100% | – | Self | A hard defensive set. |
| Reckless Slam 🔥 | 430 | 44 | 4 | – | 85% | 48 | Enemy | A scorching, reckless haymaker; 10% recoil. |
| Berserk | 540 | 12 | 6 | 3 | 100% | – | Self | Sees red: +30% damage for 3 rounds. |
| Earthshaker ⛰️ | 650 | 24 | 5 | 1 | 80% | 26 | All enemies | Ground-splitting AoE with a stun chance. |
| Bloodletter | 780 | 36 | 5 | – | 85% | 10 | Enemy | A weak flurry, 3–5 strikes, unless the target is Bleeding — then 2.5× and drains the wound. |
| Executioner | 850 | 30 | 4 | – | 90% | 34 | Enemy | Brutal finisher: 1.5× vs weakened foes. |
| Titanfall | 920 | 62 | 6 | – | 80% | 68 | Enemy | Colossal blow that partly ignores defence; 15% recoil. |

## DEX — precision, poison, multi-hit, execute finishers

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Sling | 40 | 14 | 1 | – | 95% | 10 | Enemy | One or two quick shots. |
| Sidestep | 40 | 12 | 4 | 2 | 100% | – | Self | Footwork: +8% dodge for 2 rounds. |
| Piercing Shot | 90 | 24 | 2 | 3 | 90% | 18 | Enemy | One or two venom-tipped shots; 45% chance to Poison. |
| Focus Aim | 120 | 12 | 5 | 3 | 100% | – | Self | Steady breathing: +10% accuracy for 3 rounds. |
| Twin Fangs | 160 | 20 | 2 | 3 | 90% | 11 | Enemy | Two quick shots; 30% chance to cause Bleed. |
| Pin Down | 200 | 14 | 3 | 3 | 88% | 16 | Enemy | Suppressing fire: target aims worse for 3 rounds. |
| Blur | 240 | 12 | 5 | 3 | 100% | – | Self | A blur of motion: +14% dodge for 3 rounds. |
| Snipe | 330 | 30 | 3 | – | 82% | 34 | Enemy | Slow, punishing shot through armour. |
| Needle Storm 💧 | 380 | 16 | 3 | – | 85% | 18 | All enemies | A driving spray of needles across all foes. |
| Fleetfoot Riposte | 430 | 12 | 4 | 2 | 100% | – | Self | Defensive stance with an answer ready (dodge +6% for 2 rounds); acts first next round. |
| Marked for the Pack | 540 | 12 | 4 | 3 | 100% | – | Enemy | Marks the prey for the whole team: takes more damage and is left Vulnerable for 3 rounds. |
| Rain of Arrows 💨 | 650 | 26 | 4 | 2 | 82% | 28 | All enemies | A sustained volley riding the wind; 20% chance to drive each foe back (acts last). |
| Shadow Barrage | 780 | 52 | 5 | – | 88% | 13 | Enemy | A storm of strikes from cover, 3–6 hits. |
| Heartseeker | 850 | 86 | 4 | – | 92% | 38 | Enemy | A homing volley, 2–3 shots, 1.5× vs weakened foes. |
| Deadeye | 920 | 46 | 6 | – | 95% | 52 | Enemy | The perfect shot: half of defence ignored; 1.5× and drains the wound if the target is Bleeding. |

## CON — the only shields/armour, taunt, sustain

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Brace | 40 | 12 | 2 | – | 100% | – | Self | Small flat damage reduction until next action. |
| Second Wind | 40 | 12 | 3 | – | 100% | 16 | Self | Catch a breath: heal a little HP. |
| Taunt | 90 | 12 | 4 | 3 | 100% | – | Enemy | Enrages and forces the target to attack the taunter for 3 rounds (−10% damage while enraged). |
| Barbed Carapace | 120 | 12 | 5 | 3 | 100% | – | Self | Hardened, spiked hide: +4 mitigation and reflects 6 damage per hit for 3 rounds. |
| Body Slam | 160 | 18 | 2 | 2 | 90% | 20 | Enemy | Throws its bulk into the target; 40% chance to send it reeling — knocked back, it acts last. |
| Steady Vigil | 200 | 16 | 4 | 3 | 100% | 20 | Self | Knit flesh: solid heal, then +5 HP regen/turn for 3 rounds. |
| Bulwark | 240 | 12 | 4 | – | 100% | – | Self | Raise a 25 HP absorb shield. |
| Purge | 330 | 12 | 4 | – | 100% | 10 | Self | Shrug off ailments and mend a little. |
| Shell Slam | 380 | 24 | 3 | – | 85% | 26 | Enemy | Full-body crash; slight recoil. |
| Fortify | 430 | 12 | 5 | – | 100% | – | Self | Raise a 40 HP absorb shield. |
| Stone Wall | 540 | 12 | 6 | 3 | 100% | – | Self | Living rampart: +8 mitigation for 3 rounds. |
| Bulwark's Challenge | 650 | 12 | 6 | 2 | 100% | – | All enemies | Plants its feet and roars a challenge: massive guard, and forces the WHOLE enemy team to attack it for 2 rounds. |
| Vital Surge | 780 | 36 | 6 | – | 100% | 46 | Self | Big heal + cleanse ailments. |
| Colossus Crash | 850 | 32 | 5 | – | 85% | 36 | Enemy | Crushing advance that braces after the hit; extra damage scaled off the target's own max HP. |
| Undying | 920 | 56 | 8 | – | 100% | 70 | Self | Refuses to fall: massive recovery. |

🛡 = the only ward-granting moves in the whole pool; defBuff (Iron Skin, Stone Wall) is likewise
CON-exclusive. 🎯 = the pool's taunt/aggro-forcing move.

## WIS — mana warfare, ally healing, party cleanse

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Focus | 40 | 12 | 4 | 3 | 100% | – | Self | Centre the mind: +2 mana regen for 3 rounds. |
| Mend | 40 | 12 | 3 | – | 100% | 14 | Self | Soothing focus: heal a little HP. |
| Mana Sap | 90 | 8 | 2 | – | 92% | 8 | Enemy | Light hit that drinks 10 MP from the target. |
| Clarity | 120 | 12 | 3 | – | 100% | – | Self | A clear mind: remove ailments. |
| Serenity | 160 | 12 | 5 | 3 | 100% | – | Self | Calm flow: +6% dodge, +2 regen for 3 rounds. |
| Silencing Spike | 200 | 16 | 2 | 2 | 90% | 18 | Enemy | Psychic jab that burns 13 MP; 25% chance to Silence. |
| Attunement | 240 | 12 | 4 | 3 | 100% | – | Team | Links the team's focus: everyone regains more mana for 3 rounds. |
| Insight | 330 | 12 | 5 | 3 | 100% | – | Self | Read the fight: +12% accuracy for 3 rounds. |
| Drain Spirit | 380 | 18 | 4 | – | 88% | 20 | Enemy | Drinks 15 MP and heals for part of the damage. |
| Tranquility | 430 | 26 | 5 | – | 100% | 32 | Ally | Deep restorative calm channelled into an ally: strong heal. |
| Field of Doom | 540 | 12 | 5 | 3 | 95% | – | Enemy | Dampening field: target deals −15% damage for 3 rounds; 28% chance to seal its Doom. |
| Ward Against Ruin | 650 | 12 | 6 | 3 | 100% | – | Team | Clears the whole team's ailments — confusion, charm, doom, silence, sleep, healblock, all of it — and steadies their focus for 3 rounds. |
| Mind Crush | 780 | 32 | 5 | – | 85% | 36 | Enemy | Heavy psychic blow; burns 25 MP. 1.6× and detonates the target's Doom early if it has one. |
| Providence | 850 | 12 | 7 | 4 | 100% | – | Self | Sees what comes: +12% dodge and accuracy for 4 rounds. |
| Ascendance | 920 | 12 | 8 | 4 | 100% | – | Self | Transcendent state: +25% damage, +4 regen for 4 rounds. |

🤝 = WIS's two party-reaching moves — Tranquility heals a single ally, Spirit Ward is the pool's
party-wide cleanse.

## INT — all four elements, zero buffs, zero healing

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Spark 💨 | 40 | 10 | 1 | – | 95% | 12 | Enemy | Small air bolt. |
| Ember 🔥 | 40 | 10 | 2 | 3 | 90% | 12 | Enemy | Minor fire; 40% chance to Burn. |
| Frost Shard 💧 | 90 | 16 | 2 | – | 90% | 18 | Enemy | Icy dart. |
| Fracturing Stones ⛰️ | 120 | 14 | 2 | 3 | 90% | 16 | Enemy | A stinging barrage of stone shards; 30% chance to crack their guard, leaving them Vulnerable. |
| Thunderclap 💨 | 160 | 18 | 3 | – | 88% | 20 | Enemy | Lightning hit; 1.35× damage if this monster acted before the target this round. |
| Cinderburst 🔥 | 200 | 26 | 3 | – | 88% | 28 | Enemy | Solid single-target fire burst; 1.5× and snuffs the flame if the target is already Burning. |
| Stone Spear ⛰️ | 240 | 28 | 3 | – | 85% | 30 | Enemy | Earth lance that punches through defence. |
| Static Chain 💨 | 330 | 22 | 4 | 2 | 85% | 24 | All enemies | Bolt that arcs across all foes; 20% chance to leave each Vulnerable. |
| Mana Leech | 380 | 16 | 3 | – | 88% | 18 | Enemy | Arcane siphon: burns MP, heals the caster. |
| Inferno 🔥 | 430 | 24 | 4 | 3 | 82% | 26 | All enemies | Fire AoE; 25% chance to Burn. |
| Glacial Prison 💧 | 540 | 28 | 5 | 1 | 85% | 30 | Enemy | Entombs in ice, 25% stun chance. |
| Deep Freeze 💧 | 650 | 28 | 5 | – | 80% | 32 | All enemies | Freezing AoE storm that punches through frozen armour. |
| Void Lance | 780 | 40 | 5 | – | 85% | 44 | Enemy | Pure void: half of defence ignored. |
| Arcane Overload | 850 | 46 | 6 | – | 85% | 52 | Enemy | Overchannelled blast; the caster burns too. |
| World Ender ⛰️ | 920 | 50 | 7 | – | 78% | 56 | All enemies | Massive earth AoE nuke; extra damage to each target scaled off its own max HP. |

Element coverage: Air ×3 (Spark, Shock, Chain Lightning), Fire ×3 (Ember, Fireball, Inferno),
Water ×3 (Frost Shard, Glacial Prison, Blizzard), Earth ×3 (Pebble Storm, Stone Spear, Meteor).

## CHA — party buffs, enemy-party debuffs, control, lifesteal

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Taunt Cry | 40 | 10 | 1 | – | 95% | 10 | Enemy | Light voice damage + minor aggro. |
| Discord | 40 | 10 | 2 | 3 | 90% | 11 | Enemy | Jarring note; 45% chance to Blind. |
| Rallying Song | 90 | 12 | 4 | 3 | 100% | – | Team | Stirring tune: team +10% damage for 3 rounds. |
| Grand Mockery | 120 | 12 | 4 | 3 | 95% | – | All enemies | Cutting jeer: enemy team −12% damage for 3 rounds; 20% chance their wounds won't close. |
| Screech | 160 | 12 | 3 | 2 | 85% | 14 | All enemies | Voice AoE; 20% chance to inflict Fear for 2 rounds. |
| Captivate | 200 | 14 | 3 | – | 88% | 16 | Enemy | Feeds on adoration: heals 40% of damage. |
| Battle Hymn | 240 | 12 | 5 | 3 | 100% | – | Team | Steadying anthem: team +5% dodge, +2 regen for 3 rounds — and the whole team acts first next round. |
| Demoralize | 330 | 12 | 5 | 3 | 90% | – | All enemies | Breaks the spirit: enemy team −20% damage for 3 rounds. |
| Sonic Boom | 380 | 28 | 3 | 2 | 85% | 30 | Enemy | Heavy single-target voice burst; 35% chance to Confuse — a confused foe may strike itself. |
| Lullaby | 430 | 12 | 5 | 3 | 80% | – | Enemy | Sings the target to actual sleep — 35% chance; a stray hit will wake it. |
| Standing Ovation | 540 | 12 | 6 | 3 | 100% | – | Team | Feeds on applause: team +18% damage, +8% accuracy, +3 HP regen/turn for 3 rounds. |
| Cacophony | 650 | 24 | 5 | 2 | 82% | 26 | All enemies | Voice AoE; 15% chance to Charm — a charmed foe turns on its own team. |
| Siren's Call | 780 | 30 | 5 | – | 85% | 34 | Enemy | Irresistible song that scatters focus (burns MP); 1.5× and shatters their courage if they're Afraid. |
| Showstopper | 850 | 36 | 5 | – | 88% | 40 | Enemy | The closing number: 1.5× vs weakened foes. |
| Crescendo | 920 | 46 | 7 | – | 80% | 52 | All enemies | Massive voice AoE finisher. |

Every CHA buff targets **Team** and every CHA debuff targets **All enemies** — no self-only or
single-enemy buff/debuff moves in the pool. CHA is the group-fight stat.

---

## What changed in this pass (2026-07-20)

- **Nothing lasts "for the fight" anymore.** Every buff/debuff carries an explicit `duration` (rounds)
  and expires; cooldowns were retuned so effects can't stay up permanently. Re-casting refreshes the
  timer instead of being blocked (previously a battle-long buff could only ever be cast once).
- **Reckless Slam**: recoil 20% → **10%**, and picked up the Fire element.
- **Taunt**: now carries `tauntForce` — forces the target to attack the taunter. Inert in today's 1v1
  sim (there's only one possible target already) but wired through and ready for team battles.
- **Mana Sap vs. Mind Spike rebalanced**: Mind Spike (level 200) was burning less MP (8) than the much
  earlier Mana Sap (level 90, 10 MP burn) — backwards for a higher-level move. Mind Spike now burns 13.
- **STR/DEX gained elemental attacks** (Reckless Slam/Earthshaker → Fire/Earth; Needle Storm/Rain of
  Arrows → Water/Air) — previously all 30 of their moves were non-elemental.
- **CON is now the sole granter of ward and defBuff** ("shields and armour"). Anthem (CHA) lost its
  defBuff and gained a dodge buff instead; Barrier/Spirit Ward (WIS) lost their ward — Barrier became
  Attunement (team regen buff), Spirit Ward became a party-wide cleanse.
- **INT lost its one buff** (Arcane Focus, atkBuff) — replaced by Pebble Storm, an Earth-elemental
  attack, so INT is purely damage with zero buffs and zero healing.
- **CHA's single-target debuffs became party-wide**: Mockery and Demoralize now hit All enemies, not
  one. Standing Ovation moved from a self-buff to a team-buff, so no CHA buff is self-only anymore.
- **WIS gained party reach**: Tranquility now targets an ally instead of self; Spirit Ward became the
  pool's party-wide cleanse.

A full numeric rebalance beyond these structural fixes (power curves, accuracy tuning, MP costs) is
still open — this pass fixed the identified inconsistency (Mana Sap/Mind Spike) and the structural
violations of the stat-identity rules above, not a wholesale pass on every number.
