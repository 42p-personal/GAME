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
| Jab | 40 | 5 | 1 | – | 95% | 12 | Enemy | Quick light melee hit. |
| Guard | 40 | 6 | 3 | – | 100% | – | Self | Brace against the next hits (guard +8). |
| Power Strike | 90 | 12 | 2 | – | 90% | 26 | Enemy | Heavy single-target blow. |
| War Cry | 120 | 6 | 5 | 3 | 100% | – | Self | Battle fury: +15% damage. |
| Cleave | 160 | 9 | 3 | – | 85% | 20 | All enemies | Sweeping hit that splashes all foes. |
| Crushing Blow | 200 | 11 | 3 | 3 | 85% | 24 | Enemy | Dents armour: target −4 mitigation. |
| Flurry of Blows | 240 | 12 | 3 | – | 90% | 9 | Enemy | Rapid combination, 2–4 strikes. |
| Sunder Armor | 330 | 13 | 4 | 3 | 85% | 28 | Enemy | Shatters defence: target −8 mitigation. |
| Bracer | 380 | 6 | 4 | – | 100% | – | Self | A hard defensive set (guard +14). |
| Reckless Slam 🔥 | 430 | 20 | 4 | – | 85% | 44 | Enemy | Scorching haymaker; 10% recoil to self. |
| Berserk | 540 | 6 | 6 | 3 | 100% | – | Self | Sees red: +30% damage. |
| Earthshaker ⛰️ | 650 | 12 | 5 | – | 80% | 26 | All enemies | Ground-splitting AoE, 30% chance to stun 1 turn. |
| Rampage | 780 | 29 | 5 | – | 85% | 16 | Enemy | Relentless assault, 3–5 strikes. |
| Executioner | 850 | 15 | 4 | – | 90% | 34 | Enemy | Brutal finisher: 1.5× damage vs foes below 35% HP. |
| Titanfall | 920 | 27 | 6 | – | 80% | 60 | Enemy | Colossal blow, 30% pierce. |

## DEX — precision, poison, multi-hit, execute finishers

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Sling | 40 | 5 | 1 | – | 95% | 10 | Enemy | Light ranged shot. |
| Sidestep | 40 | 6 | 4 | 2 | 100% | – | Self | Footwork: +8% dodge. |
| Piercing Shot | 90 | 8 | 2 | – | 90% | 18 | Enemy | Venom-tipped shot; 60% chance to Poison (3 turns). |
| Focus Aim | 120 | 6 | 5 | 3 | 100% | – | Self | Steady breathing: +10% accuracy. |
| Twin Shot | 160 | 10 | 2 | – | 90% | 11 | Enemy | Two quick shots. |
| Pin Down | 200 | 7 | 3 | 3 | 88% | 16 | Enemy | Suppressing fire: target −10% accuracy. |
| Blur | 240 | 6 | 5 | 3 | 100% | – | Self | A blur of motion: +14% dodge. |
| Snipe | 330 | 15 | 3 | – | 82% | 34 | Enemy | Slow, punishing shot, 25% pierce. |
| Needle Storm 💧 | 380 | 8 | 3 | – | 85% | 18 | All enemies | A driving spray of needles across all foes. |
| Riposte | 430 | 6 | 4 | 2 | 100% | – | Self | Defensive stance (guard +8, dodge +6%). |
| Hunter's Mark | 540 | 6 | 4 | 3 | 100% | – | Enemy | Marks the prey: target −10 mitigation. |
| Rain of Arrows 💨 | 650 | 13 | 4 | – | 82% | 28 | All enemies | A sustained volley riding the wind. |
| Shadow Barrage | 780 | 26 | 5 | – | 88% | 13 | Enemy | Storm of strikes from cover, 3–6 hits. |
| Heartseeker | 850 | 17 | 4 | – | 92% | 38 | Enemy | Seeks the faltering: 1.5× damage vs foes below 40% HP. |
| Deadeye | 920 | 23 | 6 | – | 95% | 52 | Enemy | The perfect shot: 50% pierce. |

## CON — the only shields/armour, taunt, sustain

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Brace | 40 | 6 | 2 | – | 100% | – | Self | Small flat damage reduction until next action. |
| Second Wind | 40 | 6 | 3 | – | 100% | 16 | Self | Catch a breath: heal a little HP. |
| Taunt 🎯 | 90 | 6 | 4 | 3 | 100% | – | Enemy | Enrages and **forces the target to attack the taunter** (−10% damage while enraged). |
| Iron Skin | 120 | 6 | 5 | 3 | 100% | – | Self | Hardened hide: +4 mitigation. |
| Body Slam | 160 | 9 | 2 | – | 90% | 20 | Enemy | Throws its bulk into the target. |
| Regenerate | 200 | 8 | 4 | – | 100% | 20 | Self | Knit flesh: solid heal. |
| Bulwark 🛡 | 240 | 6 | 4 | – | 100% | – | Self | Raises a 25 HP absorb shield. |
| Purge | 330 | 6 | 4 | – | 100% | 10 | Self | Shrugs off ailments (cleanse) and mends a little. |
| Shell Slam | 380 | 12 | 3 | – | 85% | 26 | Enemy | Full-body crash; 10% recoil to self. |
| Fortify 🛡 | 430 | 6 | 5 | – | 100% | – | Self | Raises a 40 HP absorb shield. |
| Stone Wall | 540 | 6 | 6 | 3 | 100% | – | Self | Living rampart: +8 mitigation. |
| Last Stand | 650 | 6 | 6 | – | 100% | – | Self | Plants the feet: massive guard (+20) until next action. |
| Vital Surge | 780 | 18 | 6 | – | 100% | 46 | Self | Big heal + cleanse ailments. |
| Juggernaut | 850 | 16 | 5 | – | 85% | 36 | Enemy | Crushing advance that braces after the hit (guard +10). |
| Undying | 920 | 28 | 8 | – | 100% | 70 | Self | Refuses to fall: massive recovery. |

🛡 = the only ward-granting moves in the whole pool; defBuff (Iron Skin, Stone Wall) is likewise
CON-exclusive. 🎯 = the pool's taunt/aggro-forcing move.

## WIS — mana warfare, ally healing, party cleanse

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Focus | 40 | 6 | 4 | 3 | 100% | – | Self | Centre the mind: +2 mana regen. |
| Mend | 40 | 6 | 3 | – | 100% | 14 | Self | Soothing focus: heal a little HP. |
| Mana Sap | 90 | 4 | 2 | – | 92% | 8 | Enemy | Light hit that drains 10 MP from the target. |
| Clarity | 120 | 6 | 3 | – | 100% | – | Self | A clear mind: removes ailments (cleanse). |
| Serenity | 160 | 6 | 5 | 3 | 100% | – | Self | Calm flow: +6% dodge, +2 regen. |
| Mind Spike | 200 | 8 | 2 | – | 90% | 18 | Enemy | Psychic jab that burns 13 MP. |
| Attunement | 240 | 6 | 4 | 3 | 100% | – | Team | Links the team's focus: everyone regains more mana. |
| Insight | 330 | 6 | 5 | 3 | 100% | – | Self | Reads the fight: +12% accuracy. |
| Drain Spirit | 380 | 9 | 4 | – | 88% | 20 | Enemy | Drains 15 MP and heals the caster 30% of damage. |
| Tranquility 🤝 | 430 | 13 | 5 | – | 100% | 32 | Ally | Deep restorative calm channelled into an ally: strong heal. |
| Null Field | 540 | 6 | 5 | 3 | 95% | – | Enemy | Dampening field: target −15% damage. |
| Spirit Ward 🤝 | 650 | 6 | 6 | 3 | 100% | – | Team | Clears the whole team's ailments + steadies their focus. |
| Mind Crush | 780 | 16 | 5 | – | 85% | 36 | Enemy | Heavy psychic blow; burns 25 MP. |
| Providence | 850 | 6 | 7 | 4 | 100% | – | Self | Sees what comes: +12% dodge and +12% accuracy. |
| Ascendance | 920 | 6 | 8 | 4 | 100% | – | Self | Transcendent state: +25% damage, +4 regen. |

🤝 = WIS's two party-reaching moves — Tranquility heals a single ally, Spirit Ward is the pool's
party-wide cleanse.

## INT — all four elements, zero buffs, zero healing

| Move | Lvl | MP | CD | Acc | Pwr | Elem | Target | Effect |
|---|--:|--:|--:|--:|--:|:--:|---|---|
| Spark | 40 | 5 | 1 | 95% | 12 | 💨 Air | Enemy | Small air bolt. |
| Ember | 40 | 5 | 2 | 90% | 12 | 🔥 Fire | Enemy | Minor fire; 70% chance to Burn (3 turns). |
| Frost Shard | 90 | 8 | 2 | 90% | 18 | 💧 Water | Enemy | Icy dart. |
| Pebble Storm | 120 | 7 | 2 | 90% | 16 | ⛰️ Earth | Enemy | A stinging barrage of stone shards. |
| Shock | 160 | 9 | 3 | 88% | 20 | 💨 Air | Enemy | Lightning hit, 30% chance to stun 1 turn. |
| Fireball | 200 | 13 | 3 | 88% | 28 | 🔥 Fire | Enemy | Solid single-target fire burst. |
| Stone Spear | 240 | 14 | 3 | 85% | 30 | ⛰️ Earth | Enemy | Earth lance, 25% pierce. |
| Chain Lightning | 330 | 11 | 4 | 85% | 24 | 💨 Air | All enemies | Bolt that arcs across all foes. |
| Mana Leech | 380 | 8 | 3 | 88% | 18 | – | Enemy | Arcane siphon: burns 12 MP, heals caster 25% of damage. |
| Inferno | 430 | 12 | 4 | 82% | 26 | 🔥 Fire | All enemies | Fire AoE; 60% chance to Burn (3 turns). |
| Glacial Prison | 540 | 14 | 5 | 85% | 30 | 💧 Water | Enemy | Entombs in ice, 40% chance to stun 1 turn. |
| Blizzard | 650 | 14 | 5 | 80% | 32 | 💧 Water | All enemies | Freezing AoE storm. |
| Void Lance | 780 | 20 | 5 | 85% | 44 | – | Enemy | Pure void: 50% pierce. |
| Arcane Overload | 850 | 23 | 6 | 85% | 52 | – | Enemy | Overchannelled blast; 15% recoil to self. |
| Meteor | 920 | 25 | 7 | 78% | 56 | ⛰️ Earth | All enemies | Massive earth AoE nuke. |

Element coverage: Air ×3 (Spark, Shock, Chain Lightning), Fire ×3 (Ember, Fireball, Inferno),
Water ×3 (Frost Shard, Glacial Prison, Blizzard), Earth ×3 (Pebble Storm, Stone Spear, Meteor).

## CHA — party buffs, enemy-party debuffs, control, lifesteal

| Move | Lvl | MP | CD | Dur | Acc | Pwr | Target | Effect |
|---|--:|--:|--:|--:|--:|--:|---|---|
| Taunt Cry | 40 | 5 | 1 | – | 95% | 10 | Enemy | Light voice damage + minor aggro. |
| Discord | 40 | 5 | 2 | – | 90% | 11 | Enemy | Jarring note; 70% chance to Blind (3 turns). |
| Rallying Song | 90 | 6 | 4 | 3 | 100% | – | Team | Stirring tune: team +10% damage. |
| Mockery | 120 | 6 | 4 | 3 | 95% | – | All enemies | Cutting jeer: enemy team −12% damage. |
| Screech | 160 | 6 | 3 | – | 85% | 14 | All enemies | Voice AoE, 30% chance to inflict Fear (1 turn). |
| Captivate | 200 | 7 | 3 | – | 88% | 16 | Enemy | Feeds on adoration: heals 40% of damage dealt. |
| Anthem | 240 | 6 | 5 | 3 | 100% | – | Team | Steadying anthem: team +5% dodge, +2 regen. |
| Demoralize | 330 | 6 | 5 | 3 | 90% | – | All enemies | Breaks the spirit: enemy team −20% damage. |
| Sonic Boom | 380 | 14 | 3 | – | 85% | 30 | Enemy | Heavy single-target voice burst. |
| Lullaby | 430 | 6 | 5 | – | 80% | – | Enemy | Sings the target toward sleep: 50% chance to stun 2 turns. |
| Standing Ovation | 540 | 6 | 6 | 3 | 100% | – | Team | Feeds on applause: team +18% damage, +8% accuracy. |
| Cacophony | 650 | 12 | 5 | – | 82% | 26 | All enemies | Voice AoE, 40% chance to inflict Confusion (2 turns). |
| Siren's Call | 780 | 15 | 5 | – | 85% | 34 | Enemy | Irresistible song that burns 15 MP. |
| Showstopper | 850 | 18 | 5 | – | 88% | 40 | Enemy | The closing number: 1.5× damage vs foes below 35% HP. |
| Crescendo | 920 | 23 | 7 | – | 80% | 52 | All enemies | Massive voice AoE finisher. |

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
