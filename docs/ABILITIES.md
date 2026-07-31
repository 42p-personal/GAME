# The Ability Pool

> **Generated — do not hand-edit.** `npx tsx tools/genabilities.ts` rewrites this
> file from `src/moves.ts`. It went stale once by being written by hand; a
> reference maintained alongside 137 authored moves will always lose that race.

**137 abilities** across six stats and **18 lines**. A line is a group to
draw from, not a track you commit to — `CLASS_LINES` gives a class affinity for three
of them, and `chooseLoadout` multiplies affine moves by 1.35 so off-line picks stay
reachable.

Reading the numbers:

- **pwr** is the MID-POINT of a damage range, not a fixed number; **±** is the spread.
- **scale** is `statScale` — damage is `pwr × (1 + stat × scale)`, so a high-scaling
  move rewards training the stat rather than just having the move.
- **mp** prices EFFECTIVENESS, not power. `Blood Price` is cheap because it is paid
  for in blood.
- **rng** is field reach in world units (the arena is 40 × 22).
- AoE damage is judged at THREE targets, never one — `aoeFalloff` is
  −5%/extra target, floored at 40%, so three bodies is ×2.70 of a single hit.
- **Bold** keywords are HARD control (they take an action away).

## Which lines a class draws from

| class | lines |
|---|---|
| Tank | Guardian · Warden · Warcry |
| Warrior | Duelist · Bloodrage · Bulwark |
| Rogue | Assassin · Venomcraft · Duelist |
| Ranger | Volley · Assassin · Elementalist |
| Sage | Mender · Siphon · Hexer |
| Wizard | Hexer · Elementalist · Disruptor |
| Spellsword | Arcanist · Elementalist · Bulwark |
| Spellshield | Guardian · Bulwark · Mender |
| Captain | Captain · Warcry · Duelist |
| Orator | Demagogue · Enchanter · Disruptor |
| Bard | Captain · Enchanter · Volley |
| Evoker | Elementalist · Arcanist · Volley |
| Skirmisher | Bloodrage · Duelist · Assassin |
| Stalker | Assassin · Venomcraft · Siphon |
| Swashbuckler | Volley · Assassin · Demagogue |
| Shaman | Mender · Disruptor · Guardian |
| Mystic | Mender · Siphon · Venomcraft |
| Herald | Captain · Demagogue · Warcry |

## STR

23 abilities · lines: Bloodrage · Duelist · Warcry

### Bloodrage

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Scrap** | damage/melee | 14 | ±15% | 1/320 | 4 | 1 | 95 | 2.5 | — |
| 120 | **Enrage** | buff/support | — | — | — | 14 | 5 | 100 | 5.1 | atk + |
| 240 | **Blood Price** | damage/melee | 39 | ±20% | 1/240 | 10 | 3 | 90 | 2.5 | recoil |
| 380 | **Reckless Slam** | damage/melee | 63 | ±25% | 1/205 | 26 | 4 | 85 | 2.5 | recoil, move |
| 540 | **Last Stand** | buff/support | — | — | — | 30 | 7 | 100 | 5.1 | atk +, def + |
| 700 | **Blood Fury** | damage/melee | 46 | ±30% | 1/153 | 24 | 3 | 88 | 2.5 | hp scaling |
| 920 | **Titanfall** | damage/melee | 127 | ±25% | 1/130 | 52 | 6 | 80 | 2.5 | pierce, recoil, move, push |

- **Scrap** — A cheap, scrappy swing — what you throw while the rage builds.
- **Enrage** — Works itself into a fury: +20% damage for 3 rounds.
- **Blood Price** — Swung with everything, including what it costs you. Cheap in mana because it is paid for in blood.
- **Reckless Slam** — A scorching, reckless haymaker; it burns the arm that throws it.
- **Last Stand** — Digs in and stops retreating: +30% damage and +10 mitigation for 3 rounds.
- **Blood Fury** — Feeble while it is still whole, and terrifying once it is not — this blow feeds on its own wounds.
- **Titanfall** — Colossal blow that partly ignores defence; 15% recoil.

### Duelist

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Power Strike** | damage/melee | 26 | ±10% | 1/295 | 16 | 2 | 90 | 3 | recoil, move |
| 200 | **Sunder** | debuff/melee | 16 | ±10% | 1/253 | 14 | 3 | 90 | 3 | def − |
| 260 | **Riposte** | buff/support | — | — | — | 18 | 4 | 100 | 6 | thorns, def + |
| 300 | **Headbutt** | damage/melee | 33 | ±15% | 1/223 | 16 | 3 | 90 | 3 | **stun** |
| 330 | **Bonebreaker** | damage/melee | 38 | ±15% | 1/216 | 22 | 4 | 85 | 3 | vulnerable, def − |
| 480 | **Rend** | damage/melee | 34 | ±15% | 1/185 | 18 | 3 | 85 | 3 | bleed |
| 780 | **Bloodletter** | damage/melee | 18 | ±35% | 1/144 | 30 | 5 | 85 | 3 | multi-hit, detonate |
| 850 | **Executioner** | damage/melee | 64 | ±10% | 1/136 | 28 | 4 | 90 | 3 | execute, detonate, move, backstab |

- **Power Strike** — A heavy, committed blow, thrown exactly where it was aimed.
- **Sunder** — Splits the guard rather than the body: −12 mitigation for 3 rounds. The setup STR never had.
- **Riposte** — Takes the blow to answer it: returns 10 damage on every hit for 2 rounds.
- **Headbutt** — Short, ugly, and it rings their bell.
- **Bonebreaker** — Shatters defence and leaves them open — the opener Executioner is waiting on.
- **Rend** — Opens a wound that keeps opening. Bleed here; Bonebreaker handles armour.
- **Bloodletter** — A weak flurry, 3–5 strikes — unless the target is Bleeding, and then it drinks the wound.
- **Executioner** — The closing blow: brutal against the weakened, and devastating against the Vulnerable.

### Warcry

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Guard** | buff/support | — | — | — | 6 | 3 | 100 | 6.9 | guard |
| 160 | **Cleave** | damage/melee | 30 | ±20% | 1/267 | 22 | 3 | 85 | 3.4 | cone AoE |
| 220 | **Intimidate** | debuff/voice | — | — | — | 20 | 5 | 95 | 6.3 | **fear**, atk −, circle AoE |
| 400 | **Challenge** | debuff/voice | — | — | — | 16 | 4 | 100 | 6.3 | taunt, atk − |
| 560 | **Bracer** | buff/support | — | — | — | 20 | 4 | 100 | 6.9 | guard |
| 600 | **Whirlwind** | damage/melee | 51 | ±20% | 1/166 | 34 | 4 | 88 | 3.4 | circle AoE |
| 650 | **Earthshaker** | damage/melee | 66 | ±25% | 1/159 | 40 | 5 | 80 | 3.4 | **stun**, circle AoE, push, slow |
| 820 | **Warlord's Roar** | buff/support | — | — | — | 44 | 6 | 100 | 6 | atk +, acc + |

- **Guard** — Brace against the next hits.
- **Cleave** — A horizontal sweep through everything in front of it — weak into one body, brutal into three.
- **Intimidate** — A roar with a body behind it: the nearest of them break and run.
- **Challenge** — Singles one out and dares it. It comes for you, and it swings softer for the insult.
- **Bracer** — A hard defensive set — Guard is the cheap answer, this is the committed one.
- **Whirlwind** — Spins through everything within reach. Pure volume, no rider.
- **Earthshaker** — A shockwave that fells whatever is standing near it.
- **Warlord's Roar** — STR's one team buff, and of course it is a shout: the whole line hits harder and truer for 3 rounds.

## DEX

23 abilities · lines: Assassin · Venomcraft · Volley

### Assassin

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 120 | **Shadowstep** | damage/ranged | 46 | ±15% | 1/282 | 16 | 4 | 92 | 5.6 | move, backstab |
| 200 | **Ambush** | damage/ranged | 42 | ±20% | 1/253 | 18 | 3 | 92 | 5.6 | first strike |
| 300 | **Vanish** | buff/support | — | — | — | 22 | 6 | 100 | 4.2 | dodge +, fade |
| 340 | **Smoke Bomb** | debuff/ranged | — | — | — | 20 | 5 | 100 | 5.6 | blind, acc −, circle AoE, fade |
| 420 | **Hamstring** | damage/ranged | 51 | ±15% | 1/196 | 16 | 3 | 90 | 5.6 | root |
| 600 | **Throat Cut** | damage/ranged | 80 | ±10% | 1/166 | 30 | 5 | 90 | 5.6 | **silence** |
| 850 | **Heartseeker** | damage/ranged | 39 | ±30% | 1/136 | 26 | 4 | 92 | 5.6 | multi-hit, execute |

- **Shadowstep** — Steps through the shadow behind them. The only reliable way past a front line.
- **Ambush** — Devastating on someone who has not swung yet — worthless once they have seen you.
- **Vanish** — Gone. Attackers lose interest and swing at whoever is left.
- **Smoke Bomb** — Blinds everything close and covers the exit — the setup Ambush wants.
- **Hamstring** — Cuts the leg out from under them. They keep fighting; they stop leaving.
- **Throat Cut** — Quiet, precise, and it ends the casting. What the Assassin line exists to do.
- **Heartseeker** — Two or three finding strikes, lethal against anything already failing.

### Venomcraft

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Piercing Shot** | damage/ranged | 26 | ±20% | 1/295 | 14 | 2 | 90 | 8 | poison, multi-hit, contagion |
| 180 | **Toxin Stack** | damage/ranged | 29 | ±15% | 1/260 | 10 | 2 | 92 | 8 | poison |
| 280 | **Twin Fangs** | damage/ranged | 19 | ±25% | 1/229 | 14 | 2 | 90 | 8 | bleed, multi-hit |
| 400 | **Paralytic Dart** | damage/ranged | 58 | ±15% | 1/200 | 22 | 4 | 90 | 8 | **stun** |
| 560 | **Virulence** | damage/ranged | 56 | ±20% | 1/172 | 20 | 5 | 90 | 8 | detonate |
| 740 | **Plague Shot** | damage/ranged | 49 | ±20% | 1/148 | 34 | 5 | 85 | 8 | poison, contagion, circle AoE |

- **Piercing Shot** — One or two venom-tipped shots, and the venom may pass to a neighbour.
- **Toxin Stack** — A cheap second dose. Poison is the point; the dart barely matters.
- **Twin Fangs** — Two quick shots that open a wound — bleed here, poison everywhere else in the line.
- **Paralytic Dart** — DEX's one hard control: a neurotoxin that drops them where they stand.
- **Virulence** — Feeble on clean blood, ruinous on poisoned — the payoff the whole line builds toward.
- **Plague Shot** — Poison that jumps between bodies. It rewards an enemy that stands together.

### Volley

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Sling** | damage/ranged | 14 | ±30% | 1/320 | 5 | 1 | 95 | 10.4 | multi-hit |
| 40 | **Sidestep** | buff/support | — | — | — | 8 | 4 | 100 | 7.8 | dodge + |
| 160 | **Acrobatics** | buff/support | — | — | — | 12 | 4 | 100 | 7.8 | dodge + |
| 240 | **Focus Aim** | buff/support | — | — | — | 14 | 5 | 100 | 7.8 | acc + |
| 330 | **Pin Down** | damage/ranged | 51 | ±15% | 1/216 | 18 | 3 | 88 | 10.4 | pull, root |
| 470 | **Gambler's Volley** | damage/ranged | 11 | ±50% | 1/187 | 20 | 3 | 85 | 8 | multi-hit |
| 500 | **Ricochet** | damage/ranged | 37 | ±30% | 1/181 | 26 | 4 | 88 | 10.4 | multi-hit, circle AoE |
| 650 | **Rain of Arrows** | damage/ranged | 56 | ±25% | 1/159 | 34 | 5 | 85 | 10.4 | circle AoE, push |
| 680 | **Pinning Volley** | damage/ranged | 52 | ±20% | 1/155 | 32 | 5 | 88 | 10.4 | circle AoE, root |
| 920 | **Deadeye** | damage/ranged | 142 | ±5% | 1/130 | 44 | 6 | 95 | 10.4 | — |

- **Sling** — One or two quick shots. Cheap enough to throw all day.
- **Sidestep** — Footwork. Small, cheap, and always available.
- **Acrobatics** — A tumbling, weaving burst — almost untouchable, but only for a moment.
- **Focus Aim** — Steadies the breathing. The gambler choosing, briefly, not to gamble.
- **Pin Down** — Suppressing fire that drags them out of position and holds them there.
- **Gambler's Volley** — Everything in the quiver, all at once, aimed roughly. Anywhere from a scratch to a slaughter.
- **Ricochet** — One shot, several bodies. It bounces, and it does not much care whose.
- **Rain of Arrows** — A bombardment onto a chosen patch of ground — it punishes standing together.
- **Pinning Volley** — Nails several of them to the spot at once.
- **Deadeye** — One shot. It goes exactly where it was sent.

## CON

23 abilities · lines: Warden · Guardian · Bulwark

### Warden

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 140 | **Body Slam** | damage/melee | 19 | ±20% | 1/274 | 14 | 2 | 90 | 3.4 | **knockback**, move, push |
| 160 | **Seize** | damage/melee | 17 | ±15% | 1/267 | 14 | 3 | 90 | 3.4 | pull, root |
| 240 | **Shield Wall** | control/support | — | — | — | 30 | 6 | 100 | 6.9 | guard, zone |
| 300 | **Quagmire Stomp** | damage/melee | 23 | ±20% | 1/223 | 30 | 5 | 85 | 3.4 | **knockback**, circle AoE, slow |
| 380 | **Barricade** | control/support | — | — | — | 26 | 6 | 100 | 6.9 | def +, zone |
| 460 | **Tremor** | damage/melee | 23 | ±20% | 1/189 | 28 | 4 | 88 | 3.4 | circle AoE, slow |
| 520 | **Zone of Control** | control/support | — | — | — | 28 | 5 | 100 | 6.9 | thorns, zone |
| 620 | **Crushing Grip** | damage/melee | 34 | ±15% | 1/163 | 26 | 4 | 90 | 3.4 | root |
| 700 | **Earthen Grasp** | damage/melee | 25 | ±15% | 1/153 | 36 | 6 | 85 | 3.4 | circle AoE, root |

- **Body Slam** — Throws its bulk into them and sends them reeling.
- **Seize** — Clamps on and hauls them in. They can still fight; they cannot leave.
- **Shield Wall** — Plants a wall and holds it: +14 mitigation, and the ground around it becomes a slog.
- **Quagmire Stomp** — Churns the footing out from under the whole line.
- **Barricade** — Throws up cover and settles in behind it — the crossing in front becomes slow and costly.
- **Tremor** — The ground shudders. Everything nearby is slowed and staggered.
- **Zone of Control** — Nothing moves well beside it, and everything that tries gets clipped.
- **Crushing Grip** — Takes hold and squeezes. It is not going anywhere while this lasts.
- **Earthen Grasp** — Stone closes on every ankle in reach. The Warden capstone: nobody leaves.

### Guardian

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Taunt** | debuff/support | — | — | — | 10 | 4 | 100 | 6 | atk −, taunt |
| 120 | **Barbed Carapace** | buff/support | — | — | — | 24 | 5 | 100 | 6 | def +, thorns |
| 200 | **Steady Vigil** | buff/support | 20 | ±15% | 1/253 | 18 | 4 | 100 | 6 | hp regen |
| 340 | **Interpose** | buff/support | — | — | — | 24 | 5 | 100 | 6 | ward, def + |
| 650 | **Bulwark's Challenge** | debuff/support | — | — | — | 40 | 6 | 100 | 6 | guard, taunt, circle AoE |
| 760 | **Aegis of the Fallen** | buff/support | — | — | — | 48 | 7 | 100 | 6 | ward, def + |

- **Taunt** — Enrages one of them into coming for you, and swinging softer for it.
- **Barbed Carapace** — The whole line bristles: +4 mitigation and 6 damage returned on every hit.
- **Steady Vigil** — Stands over a wounded ally: heals, then keeps healing.
- **Interpose** — Steps in front of an ally: a 34 HP shield and +8 mitigation, put where it is needed rather than kept.
- **Bulwark's Challenge** — Plants its feet and roars: massive guard, and the WHOLE enemy team comes for it.
- **Aegis of the Fallen** — A shield over every ally at once — 45 HP of absorb each, and armour under it.

### Bulwark

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Brace** | buff/support | — | — | — | 5 | 2 | 100 | 5.1 | guard |
| 240 | **Bastion** | buff/support | — | — | — | 16 | 4 | 100 | 5.1 | ward |
| 280 | **Overrun** | damage/melee | 24 | ±20% | 1/229 | 18 | 3 | 88 | 2.5 | **knockback**, move, push |
| 380 | **Shell Slam** | damage/melee | 28 | ±20% | 1/205 | 22 | 3 | 85 | 2.5 | recoil, hp scaling |
| 430 | **Fortify** | buff/support | — | — | — | 44 | 5 | 100 | 5.1 | ward |
| 600 | **Retaliate** | buff/support | — | — | — | 22 | 4 | 100 | 5.1 | thorns, def + |
| 780 | **Vital Surge** | buff/support | 50 | ±15% | 1/144 | 34 | 6 | 100 | 5.1 | cleanse |
| 850 | **Colossus Crash** | damage/melee | 45 | ±20% | 1/136 | 32 | 5 | 85 | 2.5 | guard, %max HP, spend ward, move, push |

- **Brace** — Small, cheap, always there.
- **Bastion** — Raise a 25 HP absorb shield. Fortify is the version for everyone else.
- **Overrun** — Charges straight through: damage and a shove, paid for with momentum.
- **Shell Slam** — Hits hardest while the shell is whole, and fades as its own health fails.
- **Fortify** — A 40 HP absorb shield on every ally. Uncapped reach, priced in mana.
- **Retaliate** — Answers everything: 16 damage returned per hit for 2 rounds.
- **Vital Surge** — Shrugs it all off and knits shut. CON heals ITSELF; healing others is WIS.
- **Colossus Crash** — A crushing advance that braces after the blow; the bigger they are, the more it takes.

## WIS

22 abilities · lines: Disruptor · Mender · Siphon

### Disruptor

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 200 | **Silencing Spike** | damage/support | 22 | ±15% | 1/253 | 18 | 2 | 90 | 6.9 | **silence**, mana burn |
| 300 | **Wither** | damage/support | 23 | ±15% | 1/223 | 20 | 4 | 90 | 6.9 | lifesteal, mana burn |
| 320 | **Null Field** | control/support | — | — | — | 34 | 6 | 100 | 6.9 | mp regen, zone |
| 380 | **Enfeeble** | debuff/support | — | — | — | 22 | 4 | 95 | 6.9 | atk −, acc − |
| 420 | **Hush** | control/support | — | — | — | 18 | 4 | 95 | 6.9 | **silence** |
| 540 | **Field of Doom** | debuff/support | — | — | — | 26 | 5 | 95 | 6.9 | doom, atk − |
| 700 | **Dread Whisper** | debuff/support | — | — | — | 28 | 5 | 95 | 6.9 | **fear** |
| 780 | **Mind Crush** | damage/support | 50 | ±15% | 1/144 | 34 | 5 | 85 | 6.9 | mana burn, detonate |

- **Silencing Spike** — A psychic jab that drinks 13 MP and can close the throat entirely.
- **Wither** — Saps them round on round and feeds you what it takes.
- **Null Field** — A patch of dead air. Nothing casts well inside it, including what walks in.
- **Enfeeble** — They hit softer and they miss more. The Disruptor pressure debuff.
- **Hush** — No damage, no flourish — just silence, reliably, for three rounds.
- **Field of Doom** — A dampening field, and a clock. Mind Crush knows what to do with the clock.
- **Dread Whisper** — WIS's one hard control: a word in the ear, and they run.
- **Mind Crush** — A heavy psychic blow that detonates their Doom early. The payoff.

### Mender

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Mend** | buff/support | 16 | ±15% | 1/320 | 8 | 3 | 100 | 6 | — |
| 120 | **Clarity** | buff/support | — | — | — | 12 | 3 | 100 | 6 | cleanse |
| 260 | **Renewal** | buff/support | 8 | ±15% | 1/234 | 18 | 4 | 100 | 6 | hp regen |
| 430 | **Tranquility** | buff/support | 34 | ±15% | 1/194 | 26 | 5 | 100 | 6 | — |
| 560 | **Rebuke** | damage/support | 37 | ±20% | 1/172 | 24 | 4 | 90 | 6 | — |
| 650 | **Ward Against Ruin** | buff/support | 20 | ±15% | 1/159 | 46 | 7 | 100 | 6 | cleanse, mp regen |

- **Mend** — Soothing focus, given to somebody else. WIS is the only stat that can.
- **Clarity** — Clears an ally's head — confusion, charm, fear, all of it.
- **Renewal** — Not a burst but a tide: 8 HP a round for four rounds.
- **Tranquility** — Deep restorative calm channelled into one ally.
- **Rebuke** — The healer answers back. A mender is not the same thing as a bystander.
- **Ward Against Ruin** — Clears the whole team's ailments and mends 20 HP each. The Mender capstone.

### Siphon

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Mana Sap** | damage/support | 16 | ±15% | 1/295 | 8 | 2 | 92 | 5.1 | mana burn |
| 140 | **Mind Spike** | damage/support | 19 | ±15% | 1/274 | 8 | 2 | 92 | 5.1 | — |
| 160 | **Serenity** | buff/support | — | — | — | 12 | 5 | 100 | 5.1 | mp regen, dodge + |
| 240 | **Attunement** | buff/support | — | — | — | 30 | 4 | 100 | 5.1 | mp regen |
| 380 | **Drain Spirit** | damage/support | 29 | ±15% | 1/205 | 20 | 4 | 88 | 5.1 | mana burn, lifesteal |
| 600 | **Spirit Siphon** | damage/support | 43 | ±20% | 1/166 | 30 | 5 | 88 | 5.1 | mana burn, lifesteal |
| 820 | **Judgement** | damage/support | 65 | ±20% | 1/139 | 38 | 6 | 88 | 5.1 | — |
| 850 | **Providence** | buff/support | 12 | ±15% | 1/136 | 40 | 7 | 100 | 5.1 | cleanse, hp regen |

- **Mana Sap** — Drinks 14 MP straight out of them. Once the worst move in the game; now a real theft.
- **Mind Spike** — A cheap psychic jab — the filler WIS never had and could never afford.
- **Serenity** — Calm flow. The one self-regen — the other three were the same move wearing hats.
- **Attunement** — Links the team's focus: everyone regains mana faster. Distinct from Serenity by REACH.
- **Drain Spirit** — Takes both at once — their mana, and a share of their blood.
- **Spirit Siphon** — Holds on and drains, HP and MP together, for as long as it lasts.
- **Judgement** — A real capstone HIT rather than one more aura. WIS can end things too.
- **Providence** — Sees what is coming: clears the team and steadies it. Restoration — empowerment is CHA.

## INT

23 abilities · lines: Hexer · Elementalist · Arcanist

### Hexer

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Ember** | damage/magic | 15 | ±20% | 1/320 | 6 | 2 | 90 | 6.3 | burn |
| 120 | **Fracturing Stones** | damage/magic | 26 | ±20% | 1/282 | 14 | 2 | 90 | 6.3 | vulnerable |
| 200 | **Cinderburst** | damage/magic | 40 | ±15% | 1/253 | 20 | 3 | 88 | 6.3 | detonate |
| 280 | **Sap Will** | debuff/magic | — | — | — | 18 | 4 | 95 | 6.3 | atk − |
| 340 | **Arcane Bomb** | damage/magic | 54 | ±20% | 1/214 | 26 | 4 | 88 | 6.3 | detonate, circle AoE |
| 480 | **Curse of Ruin** | debuff/magic | — | — | — | 24 | 5 | 95 | 6.3 | def − |
| 700 | **Detonate** | damage/magic | 55 | ±25% | 1/153 | 38 | 5 | 85 | 6.3 | detonate, circle AoE |

- **Ember** — Minor fire, and it catches. The cheapest way to start a stack.
- **Fracturing Stones** — A stinging barrage that cracks the guard. The second stack type.
- **Cinderburst** — Solid on its own, and it snuffs a Burn for far more. The first detonator.
- **Sap Will** — Drains the will to strike: −22% damage for 3 rounds. INT could not do this at all before.
- **Arcane Bomb** — A charge left ticking on them — devastating on anything already cracked open.
- **Curse of Ruin** — Unpicks whatever is holding them together: −14 mitigation from EVERY source of damage.
- **Detonate** — Sets off everything still burning, on everyone at once. The Hexer capstone.

### Elementalist

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Frost Shard** | damage/magic | 25 | ±20% | 1/295 | 12 | 2 | 90 | 7 | — |
| 160 | **Rime Bind** | damage/magic | 37 | ±15% | 1/267 | 16 | 3 | 90 | 7 | root |
| 280 | **Frost Nova** | damage/magic | 34 | ±20% | 1/229 | 26 | 4 | 85 | 7 | circle AoE, slow |
| 400 | **Firewall** | control/magic | — | — | — | 30 | 5 | 100 | 7 | zone |
| 430 | **Inferno** | damage/magic | 48 | ±25% | 1/194 | 32 | 4 | 82 | 7 | burn, circle AoE |
| 560 | **Seismic Crush** | damage/magic | 58 | ±25% | 1/172 | 38 | 5 | 82 | 7 | **stun**, circle AoE |
| 920 | **World Ender** | damage/magic | 119 | ±30% | 1/130 | 56 | 7 | 78 | 7 | %max HP, circle AoE |

- **Frost Shard** — An icy dart. The frost line opens here.
- **Rime Bind** — Ice climbs the legs and sets. It can still cast; it is going nowhere.
- **Frost Nova** — A ring of hoarfrost bursts outward — the anti-melee tool casters never had.
- **Firewall** — A burning line laid across the ground. Not a hit — a place they should not walk.
- **Inferno** — Fire across the whole position, and much of it keeps burning.
- **Seismic Crush** — The ground itself comes up. Damage AND a stun on everything standing on it.
- **World Ender** — The largest thing in the game, and it hurts the biggest of them most.

### Arcanist

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Spark** | damage/magic | 17 | ±15% | 1/320 | 5 | 1 | 95 | 7.7 | — |
| 180 | **Phase Step** | buff/support | — | — | — | 14 | 4 | 100 | 6.6 | dodge +, move |
| 250 | **Mirror Image** | buff/support | — | — | — | 20 | 5 | 100 | 6.6 | dodge + |
| 330 | **Static Chain** | damage/magic | 42 | ±20% | 1/216 | 28 | 4 | 85 | 7.7 | vulnerable, line AoE, slow |
| 380 | **Mana Leech** | damage/magic | 48 | ±15% | 1/205 | 22 | 3 | 88 | 7.7 | mana burn, lifesteal, move |
| 560 | **Unmake** | debuff/magic | — | — | — | 26 | 5 | 95 | 7.7 | spend ward, acc − |
| 640 | **Displace** | damage/magic | 54 | ±15% | 1/160 | 26 | 4 | 90 | 7.7 | move, push, root |
| 780 | **Void Lance** | damage/magic | 97 | ±10% | 1/144 | 38 | 5 | 85 | 7.7 | pierce, move, backstab |
| 850 | **Arcane Overload** | damage/magic | 114 | ±30% | 1/136 | 44 | 6 | 85 | 7.7 | recoil |

- **Spark** — A small air bolt, cheap enough to throw between everything else.
- **Phase Step** — Steps out of the world and back a few paces away — through cover, if need be.
- **Mirror Image** — Shimmering duplicates. Attacks keep finding the wrong one.
- **Static Chain** — A bolt that leaps body to body along a line, weakening as it goes.
- **Mana Leech** — Siphons and steps away in the same motion. WIS steals better; this one escapes.
- **Unmake** — Strips the shield off them and leaves their aim shaking.
- **Displace** — Teleports the TARGET — rips a diver out of your back line and pins it where it lands.
- **Void Lance** — Pure void. Half of everything they are wearing simply does not apply.
- **Arcane Overload** — Overchannelled past what the caster can hold. It burns them too.

## CHA

23 abilities · lines: Enchanter · Captain · Demagogue

### Enchanter

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 40 | **Discord** | damage/voice | 13 | ±20% | 1/320 | 8 | 2 | 90 | 5 | blind |
| 160 | **Screech** | damage/voice | 13 | ±20% | 1/267 | 22 | 3 | 85 | 5 | **fear**, circle AoE |
| 380 | **Sonic Boom** | damage/voice | 30 | ±20% | 1/205 | 26 | 4 | 85 | 5 | **confusion**, contagion, push |
| 430 | **Lullaby** | control/voice | — | — | — | 24 | 5 | 85 | 5 | **sleep**, contagion, slow |
| 650 | **Cacophony** | damage/voice | 30 | ±25% | 1/159 | 36 | 5 | 82 | 5 | **charm**, circle AoE |
| 820 | **Mass Hysteria** | control/voice | — | — | — | 52 | 7 | 88 | 5 | **fear**, contagion, circle AoE |

- **Discord** — A jarring note that leaves them swinging at afterimages.
- **Screech** — A sound that routs. Hard control across a whole line.
- **Sonic Boom** — A heavy burst, and the disorientation carries to whoever stood too close.
- **Lullaby** — Sings them to actual sleep — a free hit, but any damage wakes them. Drowsiness is catching.
- **Cacophony** — A charmed foe turns on its own team. The best status in the game, and the rarest.
- **Mass Hysteria** — The whole enemy line breaks at once. The Enchanter capstone: nobody gets a turn.

### Captain

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 90 | **Rallying Song** | buff/support | — | — | — | 18 | 4 | 100 | 6 | atk + |
| 140 | **Bravura** | buff/support | — | — | — | 16 | 4 | 100 | 6 | ward, dodge + |
| 180 | **Anthem of Iron** | buff/support | — | — | — | 24 | 5 | 100 | 6 | atk +, def + |
| 260 | **Inspire** | buff/support | — | — | — | 16 | 4 | 100 | 6 | atk +, acc + |
| 300 | **Battle Hymn** | buff/support | — | — | — | 26 | 5 | 100 | 6 | haste, dodge +, mp regen |
| 420 | **Fanfare** | buff/support | — | — | — | 32 | 5 | 100 | 6 | acc + |
| 470 | **Hymn of Shields** | buff/support | — | — | — | 38 | 6 | 100 | 6 | ward, guard |
| 540 | **Standing Ovation** | buff/support | — | — | — | 42 | 6 | 100 | 6 | atk +, acc +, hp regen |
| 880 | **Triumph** | buff/support | — | — | — | 56 | 8 | 100 | 6 | atk +, acc +, dodge + |

- **Rallying Song** — A stirring tune: the whole team hits harder for 3 rounds.
- **Bravura** — Performs straight through the danger. The bard can look after itself.
- **Anthem of Iron** — Hit harder and hold together — attack and armour in one song.
- **Inspire** — Everything poured into ONE ally. Focused, and cheaper than lifting everyone.
- **Battle Hymn** — A steadying anthem — and the whole team moves first.
- **Fanfare** — Team accuracy, sharply. Nothing else in the game hands out aim like this.
- **Hymn of Shields** — A hymn that armours everyone who can hear it, the singer included.
- **Standing Ovation** — Feeds on applause and hands it straight back to the team.
- **Triumph** — The empowerment capstone: everything at once, for two rounds only.

### Demagogue

| lv | ability | type | pwr | ± | scale | mp | cd | acc | rng | keywords |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 120 | **Grand Mockery** | debuff/voice | — | — | — | 22 | 4 | 95 | 6.1 | healblock, atk −, circle AoE |
| 200 | **Captivate** | damage/voice | 18 | ±20% | 1/253 | 14 | 3 | 88 | 6.1 | lifesteal, slow |
| 330 | **Demoralize** | debuff/voice | — | — | — | 30 | 5 | 90 | 6.1 | atk −, circle AoE |
| 440 | **Crowd Surge** | debuff/voice | 14 | ±20% | 1/192 | 24 | 4 | 90 | 6.1 | acc −, circle AoE, push |
| 520 | **Dirge** | debuff/voice | — | — | — | 34 | 6 | 95 | 6.1 | healblock, circle AoE |
| 780 | **Siren's Call** | damage/voice | 28 | ±20% | 1/144 | 32 | 5 | 85 | 5.5 | mana burn, detonate |
| 850 | **Showstopper** | damage/voice | 47 | ±15% | 1/136 | 36 | 5 | 88 | 6.1 | execute |
| 920 | **Crescendo** | damage/voice | 57 | ±25% | 1/130 | 50 | 7 | 80 | 6.1 | circle AoE |

- **Grand Mockery** — A cutting jeer: they hit softer, and some of them stop closing.
- **Captivate** — Feeds on adoration and gives nothing back.
- **Demoralize** — Breaks the spirit outright. Deeper than Mockery, and that is the whole difference.
- **Crowd Surge** — Shoves the whole enemy line backwards. A DEFENSIVE use of a debuff stat.
- **Dirge** — While it plays, nothing on that side closes a wound.
- **Siren's Call** — An irresistible song that scatters focus — and shatters the courage of the Afraid.
- **Showstopper** — The closing number, and it closes them.
- **Crescendo** — A voice AoE finisher. CHA damage exists — it is just rare, and it is late.

## Totals

| | count |
|---|---:|
| abilities | 137 |
| lines | 18 |
| hard control | 17 |
| area effects | 28 |
| damage moves | 75 |
| STR | 23 |
| DEX | 23 |
| CON | 23 |
| WIS | 22 |
| INT | 23 |
| CHA | 23 |

---

⚠️ **Elements are removed from the game.** Body types no longer carry a resist/weak
pair and no move carries an element. The INT line named *Elementalist* is unrelated
and stays. See `CLAUDE.md`.
