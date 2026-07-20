# Bestiary — The 30 Base Monsters

> **Canon:** Every monster is a **fully intelligent, sapient creature**. They speak, reason, form
> bonds, and **choose** to compete on the **Tamer Circuit** — the ladder of licences from Wood to Tamer
> Elite. A Tamer is a *partner*, not an owner: the Tamer provides training, care, and food; the monster
> brings its own ambition. Nobody is forced into the ring.
>
> **The Intelligence stat is *arcane* intellect** — a creature's aptitude for elemental magic — **not**
> its sapience. A Warrior with INT 10 is every bit as thoughtful, willful, and clever as a Wizard with
> INT 900; it simply channels no elemental power. Never read a low INT as "dumb."
>
> **Class is a title, not an identity — and this bestiary doesn't list one.** A monster isn't "born" a
> Warrior or a Sage. Its class is just the current label for whichever two stats happen to be highest
> right now (`classForStats()`), re-evaluated fresh from training, never stored. Every species has a
> *natural lean* (its training aptitude: one stat trains fastest, one second-fastest, one slowest) that
> makes certain classes the path of least resistance — but that's a weighting, not a lock. Any species
> can be trained toward any class; it's just faster or slower depending on what the individual is
> naturally suited to. Because of this, entries below never name a class — only the species' fixed
> traits (body, elemental affinity, appearance) and its individual history. What a given monster becomes
> is a story about *that monster*, not its species. (Class also determines battle tactics — see
> CLAUDE.md item 4 — keyed off current stats at fight time, same as the label.)

Each entry: **species · common name · training (major/flaw)**, an **Appearance** line (reference for
sprite/concept art — not yet built; every species currently shares one 16×16 silhouette per body type,
tinted by a per-species hue, per `src/sprites.ts`), and a backstory.

**Every body type carries its own theme** — a shared condition or event that the five individual
backstories within it each answer in their own way. Mammals were displaced and are finding renewed
purpose; Avians were scattered by scarcity and are finding their way home; Marsupials never had a home to
begin with and built a culture around that; Aquatics are surfacing from a long stillness; Insectoids are
watching an old order decline as a new one quietly rises; Reptilians have simply been waiting, patient
beyond reckoning, for a reason good enough to finally move.

This covers the **30 base species** — 6 body types × 5 each. The 15 exclusive species (Draconic,
Abyssal, Mythical) aren't in this pass.

---

## Mammals — *sturdy, grounded; minor STR; resist 💧 Water, weak to 💨 Air*
### Bio: Displacement & Renewed Purpose

The land the mammals once held — cliffs, mountain roads, forests, prides — has been steadily reshaped:
roads paved, timber felled, territories fragmented, packs scattered. Every mammal below has lost the
place or role that once defined them. None of them are still looking backward. Each has found, or is
still hunting for, a reason to matter again.

### Kongrath — silverback gorilla · minor only
**Appearance:** Broad, heavy-shouldered silverback with a wide grey saddle of fur across his back and
forearms like tree trunks. Knuckles callused from a lifetime of ground-slams; still, watchful eyes that
rarely need to blink first.

Kongrath grew up the biggest, quietest member of a wandering troupe of smaller, mismatched creatures who'd
banded together for safety on the road between towns. He never asked to be their protector — he just
happened to be the one nothing dared approach twice. When the troupe finally scattered, each finding their
own place in the world, Kongrath found he missed having something worth standing between. He joined the
Circuit looking for the same thing he always had: someone worth guarding, even if this time it's only his
own reputation. Every **Chest Beat** is the same warning he used to give circling predators, and every
**Silverback Rampage** is thrown for teammates who, for once, get to watch instead of hide.

### Aegisox — armoured ox · major CON / flaw DEX
**Appearance:** Massive, square-shouldered ox plated in weathered iron-grey hide that folds like natural
armor. Broad flat horns, deep-set patient eyes, and the slow deliberate weight of something built to not
be moved.

For most of her life Aegisox was the guardian of a mountain caravan road, standing immovable between
bandits and the travellers who paid in gratitude and grain. When the road was finally paved and the
caravans traded their oxen for engines, she found herself a wall with nothing to defend. She took her
endless patience and her **Ironclad** stance to the Circuit, reasoning that in the arena, at least, a
wall still has worth. Stoic and protective, she fights to shield her teammates more than to win.

### Maneleo — lion pride-leader · major CHA / flaw CON
**Appearance:** Golden-maned lion with a scarred muzzle and proud, upright bearing. The mane is kept
immaculate despite the scars — he carries himself like he's still being watched by a pride that no
longer exists.

Maneleo ruled a pride until a younger, faster challenger drove him out. Tradition said he should slink
off to die in exile; Maneleo refused. He entered the Circuit to rebuild his name from nothing and, more
importantly, to gather a new pride — a team of monsters who'll stand and roar at his side. Every
**Rallying Roar** is a small act of defiance against the day he was cast out.

### Grivvel — wolverine · major DEX / flaw CHA
**Appearance:** Compact, wiry-muscled wolverine with matted dark-brown fur, permanently bared teeth, and
fresh scratches he never bothers to let heal. Low, aggressive stance — always coiled, never relaxed.

The frostwoods Grivvel once ranged alone for miles shrank a little more every winter — warmer seasons,
hungrier rivals, a logging road cut straight through his old territory — until there wasn't enough wild
left to call his. He didn't leave; the wild left him. He arrived at the Circuit half out of desperation
and stayed because it's the first place in years with honest boundaries, drawn on purpose instead of
eaten away season by season. Sharp-tongued and always half a step from a fight, he's quick to bleed an
opponent with **Rend**, and quicker to pick the next one before the last has cooled — some restlessness,
it turns out, doesn't go away just because you've finally found somewhere to stand.

### Ursath — great bear · major WIS / flaw INT
**Appearance:** Enormous shaggy brown bear, slow-moving, with claw-scarred forepaws and a calm, unhurried
gaze. Fur matted from long hibernations; moves like a landslide that hasn't started yet.

Ursath slept through a long winter and woke to find his forest felled and paved. Slow to anger but utterly
immovable once roused, he wanders the Circuit for two reasons he keeps to himself: half in search of some
quiet place that might become a new home, and half for the simple, honest satisfaction of a **Titan's
Maul** landing true. The oldest fighters speak of him gently. He never rushes; he never has to.

---

## Avians — *swift, keen; minor WIS; resist 💨 Air, weak to 💧 Water*
### Bio: Scarcity, Migration, and the Long Way Back

Years of drought and shrinking hunting grounds forced the old flightways further from home than they'd
ever gone, scattering a generation of flocks across half a continent. The old grounds are recovering
now. Some are finally flying back. Some never really wanted to.

### Pinguox — penguin · major CON
**Appearance:** Stocky, torpedo-shaped body in sharp black-and-white countershading, flippers folded
tight, a determined waddle that breaks into a sprint the instant the ice gives way to water.

Pinguox was born mid-trek, in a generation that never saw the ancestral colony her parents fled when the
ice sheet first fractured beneath them. She taught herself to dive using whatever floe or harbor wall the
colony passed through, chasing a perfect, unanswerable **Death from Above** with no one left to teach her
the old way properly. Word has finally reached the colony that the ice has reformed, and she's making the
long trek home for the first time in her life — testing every plunge of the journey on the Circuit along
the way. Aloof and exacting, she regards most opponents as practice — until one survives her strike, and
then she regards them with something close to love.

### Strixil — scholar owl · major INT / flaw STR
**Appearance:** Round-faced owl with soft grey-brown plumage and oversized amber eyes. Wears her feathers
like a scholar's robe, perpetually still except for a slow, deliberate blink.

When the drought scattered her flock to the four winds, Strixil was one of the few who stayed, reasoning
that someone needed to keep the old roost's knowledge alive for whoever eventually found their way back.
She spent the empty years studying combat the way others study old texts, with nothing but her own
patience for company. Now the flock is trickling home in twos and threes, and she's become the reluctant
archivist they all quietly rely on. Calm and quietly formidable, she'd rather out-think a foe and fuel her
team's magic with **Wellspring** than trade blows.

### Balaenix — shoebill · major STR / flaw CHA
**Appearance:** Tall grey stork with an enormous, clog-shaped bill and pale, unblinking eyes. Stands
utterly motionless for hours, broken only by a slow, deliberate head-tilt.

Balaenix hatched in a wetland the flock abandoned mid-scattering, and — unlike the rest — never really
wanted to leave. While the flock finally resettles the recovered roosts, she's discovered that stillness
suits her better than any migration ever did. She can stand motionless in silt for hours, a patience the
rest of the flock never had time to learn, and treats the arena as one long, glorious wait for the single
perfect opening. The crowd holds its breath right along with her, and the instant of a **Sudden Reckoning**
is the only homecoming she's interested in. Unnerving and unhurried, she competes for the sheer certainty
of an ambush that never misses.

### Corvaan — raven · minor only
**Appearance:** Glossy black raven with a mischievous tilt to the head and a beak that seems to smirk. A
stolen glint of trinkets — a chain, a ring — tangled permanently in his neck feathers.

During the long scattering, Corvaan learned to make a home out of nowhere in particular — picking up a
trinket here, a stolen spellbook there, from every strange territory the flock blew through. Now that the
old roost is calling everyone back, he's discovered he doesn't much want to go. He collects reputation
instead of a nest these days, competing to be known as the cleverest, most theatrical caster on the
Circuit. Every **Doomcaw** is delivered with a showman's flourish and just a hint of menace, and not even
the smallest bit of homesickness.

### Larkessa — songlark · major CHA / flaw INT
**Appearance:** Warm amber-and-cream songbird with a puffed, theatrical chest and a wide expressive throat
built for volume. Feathers ruffle like a performer taking a bow.

During the scattering, Larkessa's voice became something more than talent — flung far enough on the wind,
her call helped separated flockmates find each other across half a continent of empty sky. Now the old
roost is full again, and she still can't stop singing to a crowd; the applause reminds her that every one
of those voices made it home. She found the roar of a tournament crowd and knew she'd found her true
audience at last, and lifts the teammates who sing along with her **Anthem of Glory** — warm, dramatic,
and always playing to the back row, the way a rallying call always has to.

---

## Marsupials — *charismatic, agile; minor CHA; resist ⛰️ Earth, weak to 🔥 Fire*
### Bio: The Itinerant Fair

Marsupial country burns easily and often — dry brush, quick winds, unpredictable seasons — so nobody in
this family ever built anything meant to last. Marsupial culture is portable: traveling troupes, fairs
that assemble and vanish and reassemble somewhere else, a sense of home built from company kept rather
than ground held.

### Bruxaroo — boxing kangaroo · major STR / flaw INT
**Appearance:** Broad-chested red kangaroo with taped forepaws, bandage-wrapped like a boxer's. Confident
grin, thick tail planted like a third leg mid-stance.

Bruxaroo made his name in the staged exhibition bouts of the outback fairground circuit — crowd-pleasing,
choreographed, and, he eventually admitted, hollow. He came to the Circuit hungry for the real thing:
genuine competition, genuine glory, and the honest thud of a **Knockout Combo** that wasn't rehearsed.
Boisterous and big-hearted, he's always up for one more round, at whatever fairground the world sets up
next.

### Koalio — crooning koala · major CON / flaw STR
**Appearance:** Round, soft grey koala with heavy-lidded sleepy eyes and huge tufted ears. Moves slow,
speaks slower, always looks one breath from a lullaby.

Koalio has traveled with more fairground troupes than he can name, drifting from one gathering to the
next the way every marsupial eventually learns to once the brush country turns too dry to stay put. Slow
and unhurried, he's become a familiar stranger wherever the fair sets up, delivering every thought like a
lullaby. He entered the Circuit to prove a quiet thesis: that gentleness can win. He would genuinely
rather sing an opponent into a peaceful **Dreamsong** than strike them, and the fact that this often *is*
how he wins delights him to no end. Serene, persuasive, and far more dangerous than he looks.

### Quokkade — quokka · minor only
**Appearance:** Small, round-cheeked quokka with a permanent wide grin and bright inquisitive eyes.
Bounces rather than walks, practically vibrating with cheer.

The single most relentlessly cheerful creature the fair circuit has ever produced, Quokkade competes for
the crowds, the friendships, and above all the party after every match — she throws the same **Festival**
in whatever field the troupe has pitched camp, win or lose. Sunny and nimble, she's beaten fighters twice
her size simply because they couldn't bring themselves to take her seriously until it was too late.

### Sylvaglide — sugar glider · major WIS
**Appearance:** Tiny grey glider with huge dark eyes and a stretched membrane between limbs like a small
cape. Perpetually crouched, as if about to leap.

Tiny body, enormous ambition. Sylvaglide grew up the smallest member of a fair too used to moving fast to
wait for stragglers, and learned early that the only way to keep up was to fly. She entered the Circuit to
prove that the smallest competitor in the bracket can still soar clean over the biggest, raining hits from
above in a dizzying **Skydance**. Bold and acrobatic, she's spent her whole career being underestimated —
which is, she's found, an excellent place to attack from.

### Tazzik — Tasmanian devil · major DEX / flaw CON
**Appearance:** Stocky black-furred devil with a wide fanged jaw, patchy scars, and a constant low snarl.
Restless and twitchy — always mid-fidget.

Every fair Tazzik has ever traveled with has learned to read the signs and start packing a little early —
he's a whirlwind of teeth and temper with more energy than any one gathering can hold for long. He fights
because the arena is the only place that can absorb the full snarling storm of his **Tasmanian Fury**
without someone getting hurt who didn't sign up for it, or a fair having to move on ahead of schedule.
Loud, ferocious, and — though he'd never admit it — fiercely loyal to the rare opponent who can weather
his storm and grin back.

---

## Aquatics — *wise, ancient; minor INT; resist 🔥 Fire, weak to ⛰️ Earth*
### Bio: The Deep Stirs

For longer than anyone above the waves can measure, the deep trenches kept to themselves — vast, patient,
undisturbed. Something is changing. The depths are stirring, and one by one, the oldest and newest of the
aquatic world alike are finding their way to the surface for the first time in generations.

### Maelurk — octopus · minor only
**Appearance:** Deep-purple octopus with luminous ink-blue rune markings along each of eight arms. Drifts
rather than walks, arms in constant idle motion.

Maelurk was one of the first to feel the trenches stir, and unlike most of his kind he swam straight
toward the strangeness instead of away from it. He surfaced for no better reason than curiosity — the
surface world simply *looked interesting* — and stayed for the Circuit, delighted by the chance to test
eight-armed reach against creatures utterly unlike anything in his trenches. Inquisitive and
cheerfully alien, he treats each **Abyssal Grasp** less as an attack than as an experiment he's very much
enjoying.

### Nautilux — nautilus · major CON / flaw STR
**Appearance:** Spiral-shelled nautilus in banded cream and rust stripes, ancient and weathered. Slow,
deliberate, shell catching light like polished stone.

Nautilux has drifted through a thousand tides and weathered every one, including whatever is moving in
the deep dark now. She surfaced not to conquer but to *endure*, taking a slow, deep pride in being the
**Pearl Barrier** no storm — old or new — has ever broken. Timeless and gentle, she measures victory in
the teammates still standing behind her at the final bell.

### Carcharun — reef shark · major STR / flaw CHA
**Appearance:** Ancient grey reef shark, countless pale scars crossing weathered skin. Patrols in slow,
deliberate figure-eights, eyes calm and unreadable.

The oldest competitor in the Circuit's records, Carcharun surfaced long before anyone spoke of the
trenches stirring, and has watched entire leagues rise, crumble, and be rebuilt since. He returns each
season not to climb — he's climbed it all — but to mentor the young monsters now following him up from
the dark, and to remind an impatient Circuit that patience outlasts power. His **Ancient Tide** has
turned more hopeless matches than anyone can count. Kindly, unhurried, and universally respected, despite —
or perhaps because of — the countless scars.

### Mantaris — manta ray · major DEX / flaw CON
**Appearance:** Vast, graceful black-and-white ray, wing-like fins rippling in slow figure-eights,
cephalic lobes curled like a crown. A trailing remora or two never far behind.

Mantaris was one of the first in the deep to feel it — a stirring in the old dark trenches, faint as
current, that no one else could quite explain. Instead of retreating deeper like his kin, he glided
straight up to the surface and then onto the Circuit, hooked on the hush of a crowd the way others crave
calm water. Flashy and unhurried at once, he's a showman who turns every **Tidal Wingsweep** into a slow,
sweeping performance before the strike ever lands.

### Lanterix — lanternfish · major WIS / flaw DEX
**Appearance:** Small, dark, deep-sea fish with a glowing lure dangling above a wide, needle-toothed
mouth. Skin faintly bioluminescent along both flanks, flickering when agitated.

Lanterix grew up in true darkness, far below where the stirring first began, with nothing but his own
glow for company. He surfaced to carry that deep-sea light into the open — the only creature down there
who ever thought to follow it up instead of hiding from what it might attract. Every **Abyssal Flare** is
a small piece of the abyss trailing him into the light. Quiet and watchful, he still flinches at open
water, and still refuses to go home.

---

## Insectoids — *tireless, chitinous; minor CON; resist ⛰️ Earth, weak to 💧 Water*
### Bio: Decline & New Nests

The old colonies are dwindling — hives grown so efficient they no longer need their queens, guardians who
outlived the thing they guarded, solitary lineages thinning out one generation at a time. But scattered
reports keep surfacing of new nests, young and small, appearing in territories no one seeded them. The
insectoid world isn't dying. It's changing hands.

### Scarabrute — colossal beetle · minor only
**Appearance:** Massive iron-black beetle with a thick, ridged carapace like riveted plate armor. Slow,
ponderous, built like a moving fortress.

For a hundred years Scarabrute was the load-bearing keystone of a dam his colony engineered, wedged
shell-first into the gap and holding back an entire river with nothing but patience and armor. When the
colony finally finished their work and moved on without him, he found himself a wall with no river left to
hold. The Circuit is the only place that can still hit him as hard as that river did, and he lumbers into
every match grateful for the impact. Unshakeable and quietly content, he measures a good fight not by
whether he wins but by whether his **Fortress Carapace** actually felt the blow.

### Mantevoke — mantis · major STR / flaw INT
**Appearance:** Lean, jade-green mantis with folded blade-forearms and an utterly still posture. Only
moves in one sudden, final motion.

Mantevoke spent a decade as the unmoving guardian of a temple garden that fewer and fewer visitors bother
to find anymore — the order that built it is fading, and he may be one of the last of his line still
holding the old discipline. Stillness became his art, and eventually his philosophy: a fight, he came to
believe, is already decided before the first strike is thrown — the rest is just formality. He entered
the Circuit to test whether that discipline still means anything in a world that's stopped watching, and
lets his **Scything Execution** do all his talking. Patient, precise, and unsettlingly calm, he has never
once needed a second cut.

### Arachnyx — web-weaver spider · major WIS / flaw DEX
**Appearance:** Pale violet spider with too many eyes glowing faint blue, half-hidden in strands of
silk. Rarely fully visible — always partly veiled in web.

Arachnyx has never once left her lair to fight anyone — opponents are escorted in, every match played on
her web, by her rules. Lately, though, reports have reached her of new webs appearing in territories that
have been empty for a generation, spun by broods nobody seeded, and for the first time in her long
solitary life she's found herself curious about the wider insectoid world instead of dismissive of it. She
still regards footwork as a confession that a fighter didn't prepare properly, and finishes most matches
with a **Silken Cataclysm** before her opponent even realizes they walked into one. Cold, meticulous, and
— lately — a little less certain that isolation is the only way to live.

### Vespera — wasp queen · major CHA / flaw STR
**Appearance:** Regal golden-and-black wasp with an ornate, oversized abdomen and a commanding, still
posture. A faint hum follows her, as if a hive rides just behind.

Vespera built a hive so vast and so well-organized that it eventually stopped needing her orders at all —
every wasp knew its purpose without being told, and her throne became ceremonial rather than functional.
Her hive is, by the Circuit's reckoning, exactly the kind of self-sufficient new order the old colonies
are quietly giving way to — she just happens to be the queen who lived to see her own kind's future arrive
early. She entered the Circuit chasing the one feeling her perfect hive could no longer give her: being
needed. Ten thousand loyal wings follow her into the arena regardless, answering a **Swarm Decree** she
almost feels guilty giving. Regal, a little melancholy, and utterly commanding when she speaks.

### Odonatra — dragonfly · major DEX / flaw WIS
**Appearance:** Slender, iridescent teal dragonfly with four blurred wings and huge compound eyes. Never
fully still — a shimmer of motion even at rest.

Odonatra hatched in one of the new nests that have been quietly appearing where the old insectoid
territories fell empty — young, fast, and utterly unbothered by whatever came before her. She flew through
a tournament arena entirely by accident, chasing a gnat through what she assumed was empty ground, and
dodged an entire flurry of attacks on her way back out without ever slowing down. She came back the next
season specifically to do it on purpose, unleashing a **Thousand-Lens Volley** that has genuinely never
missed. Four wings, four directions, no patience, and not one ounce of the old world's nostalgia — to her,
decline is just a story the elders tell.

---

## Reptilians — *patient, cold-blooded; minor DEX; resist 🔥 Fire, weak to 💨 Air*
### Bio: The Long Wait Ends

Reptiles measure time on a scale nothing else in this bestiary can match — decades of stillness are
nothing to them. Every reptile below has been waiting, patient beyond reckoning, for a reason good enough
to finally move. The Circuit turned out to be that reason.

### Crocmaw — river crocodile · major STR / flaw WIS
**Appearance:** Massive, algae-green crocodile with a scarred armored hide and eyes barely above the
waterline. Low, ambush-still, terrifyingly fast once it finally moves.

Crocmaw waited so long, so motionless, in the same bend of the same river that regional maps eventually
marked him down as a sandbar. Boats moored against his back. Herons nested on his snout. Decades passed
without him so much as blinking — until word of the Circuit reached his stretch of water, and for the first
time in a generation, Crocmaw moved. The arena floor still shakes when he does, and his **Jawbreaker Vice**
closes with the same patient inevitability that let him become a landmark in the first place. Silent,
ancient, and terrifyingly sudden once provoked.

### Iguanor — crested iguana · major INT / flaw CON
**Appearance:** Vivid emerald-and-orange iguana with a tall, sail-like crest running the length of his
spine. Postures and displays constantly — magnificent and self-assured.

Iguanor never deposed a rival, never conquered a territory — a warband simply formed around him one
afternoon because he happened to be sunning himself magnificently on the best rock in the valley, and then
it just... waited. For years. He let it, mostly out of vanity, but the crown he never technically earned
bothers him more than he lets on. He entered the Circuit to finally prove, blow for blow, that the loyalty
he inspired all that idle time was deserved and not just aesthetic, punctuating every win with a **Banner
of Scales** display he's been quietly practicing his whole patient life. Vain, magnetic, and more insecure
than his posture ever admits.

### Serpwyn — hooded cobra · major WIS / flaw STR
**Appearance:** Slender grey-blue cobra with a wide ceremonial hood marked in pale, faded symbols.
Unnervingly still, with an unblinking gaze.

For forty seasons Serpwyn read the futures of champions from the safety of a temple alcove, watching
visions of tournaments she never entered herself. Eventually the question became too loud to ignore: was
prophecy easier from the outside looking in, or from inside the arena itself? She stepped down from the
alcove to find out. She has never once been surprised by an opponent — not their opening move, not their
desperate last gambit, not the moment they realize her **Serpent's Prophecy** already accounted for all of
it. Unblinking, unhurried, and quietly certain of everything before it happens.

### Geckari — gecko wall-runner · minor only
**Appearance:** Small, mottled brown-green gecko with oversized adhesive toe-pads and quick, darting eyes.
Always poised at an odd angle, like it's about to run up a wall.

Geckari grew up broke and obsessed, scaling the outer walls of every arena on the Circuit to watch matches
for free from ledges and gutters nobody else could reach — for years, patiently, before he ever had a way
in. He knows every surface of every venue better than the tamers who own them: which beam creaks, which
cornice holds weight, which shadow is deep enough to vanish into. When he finally saved enough to enter as
a competitor himself, he fought the only way he knew how: from angles nobody thinks to defend, closing
every match with a **Ceiling Ambush** that starts from somewhere the crowd was never watching. Scrappy,
resourceful, and always one step sideways of where you expect him.

### Tortavos — ancient tortoise · major CON / flaw INT
**Appearance:** Huge, moss-covered tortoise with a cracked, stone-like shell etched in faded runes. Moves
so slowly it seems to barely move at all.

Tortavos signed up for the Circuit exactly two hundred years ago, filled out the paperwork, and set off
toward the nearest registration office at his own pace. He arrived last spring, entirely unbothered by the
wait, mildly curious whether the same officials were still working there (they were not). Time simply moves
differently inside his shell, unhurried and thick as amber, and opponents who try to rush him tend to
discover that the hard way — usually somewhere around the moment his **Aeon Shell** slows the whole arena
down to match his patience. Serene, immovable, and in absolutely no rush to prove anything to anyone.
