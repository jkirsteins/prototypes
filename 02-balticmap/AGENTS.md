# AGENTS.md

Petty Kingdoms. Plain TypeScript + Vite, no framework, imperative DOM. The map
is switchable: the region registry is `src/regions.ts`, the active one is
resolved at boot from the region pref (the Regions page) and the `region=`
boot param (`baltic` or `iberia`). `npm test`
and `npm run build` must both pass before committing. Verify in a browser
through this prototype's own dev server (`npm run dev` from this directory) at
`http://127.0.0.1:5173/prototypes/02/` - the `base` in `vite.config.ts`, not the
bare root. There is no root dev server; the repo `AGENTS.md` says why.

`npm test` deliberately excludes `tests/sim.test.ts` and
`tests/scenarios.test.ts` - the balance suites, which are minutes rather than
seconds. `npm run balance` is theirs, and the repo rule is that balance
evidence is produced on demand.

Specs and plans live in `docs/superpowers/`. Read the relevant one before
changing the code it describes.

## A browser check boots straight into the state it checks

Query params replay the real transitions, so checking something is one
navigation and the same URL gives the same run every time:

    http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&build=warpath&turns=5&defense=selonians:1

- `seed=N` - seeds the rng.
- `build=warpath|pestilence` - the build screen's pick. Omit for warpath.
- `screen=deck` - stops on the build screen instead of picking for you. The
  one stop that must be asked for: `chooseBuild` runs whether or not `build=`
  was named, so nothing else leaves the phase at `deck-building`.
- `faction=id` - a **faction** id, not a region id (`selonians`, not `selija`).
- `turns=N` - plays N rounds with the AI policy on every seat that takes turns,
  yours included, then hands back on your turn. It goes through `aiTakeTurn`,
  so a fast-forwarded turn plays a repeat the same way a live one would.
- `hand=a,b,c` - replaces your hand.
- `defense=selonians:1;jersikans:0` - polygon defense overrides, clamped
  into [0, max]; a value at or above max deletes the key (absent = pristine).
  The ceilings are small - 2 to 18 across the map - so the useful numbers here
  are single digits, and `defense=x:0` is a land one army walks into.
- `disease=selonians:jersikans:3` - `polygon:owner:count` stacks.
- `leadership=selonians:100` - ruler leadership overrides.
- `armies=selonians:3` - armies stationed per polygon, clamped at 0. Absent
  means the default of one.
- `settlements=selonians:1` - settlements FOUNDED per polygon, clamped to the
  dots the map still authors for that land. The count matches the store, not
  the map: every land already stands on one, so `selonians:1` is a land
  holding two - and two is what a land needs to take two fortifies in a turn.
  Nothing is spent by booting; `settlementsSpent` starts empty.
- `march=jersikans>selonians;semigallian-confederacy>selonians:3` - declare an
  attack already in flight, `from>to` per arrow, with an optional `:N` for how
  much defense the raid tears out of its source. Declared through the real
  rules, so a source with no free army, no defense to spend, or a target it
  does not border is dropped rather than conjured. The amount is clamped into
  `[1, the source's ceiling]` and DEFAULTS to 1, so a URL written before a
  raid's strength was a choice still means what it always meant. Marches are
  declared last, after `defense=`, and the spend lands on top of it:
  `defense=selonians:5&march=selonians>jersikans:3` boots Selonians at 2 with
  a 3 STR arrow in flight.

**Every polygon id above is the land's own FACTION id**, not the region id -
`selonians`, not `selija`. The two id spaces are different words for the same
land ("Selija" the land, "Selonians" the people) and only the faction id is
what `factionIds`, `defense`, `armies` and `marches` are keyed by. This
section used to show `defense=selija:100`, which silently parsed and then
dropped: `applyBootParams` skips a clause naming no known faction, so a wrong
id boots a perfectly ordinary game and says nothing.
- `realm=N` - how many lands the human's realm holds, clamped into
  `[1, the roster]`. The lands are ANNEXED, in map order, skipping your own:
  vassals would read the same on the scoreboard and then come apart while you
  watched, since a booted vassal wins its independence at its own turn start,
  and an annexed land is also out of the turn order so `realm=25` is a check
  that runs rather than twenty-four AI turns a round. Each land is taken out of
  whatever realm it already answered to - a land counted under two roots lets a
  RIVAL cross the bar and end the booted run before the state under test is on
  screen. **The one boot param that names no ids**: the states it exists to
  reach are "half the map" and "all of it", and a twenty-five-id URL is not a
  check anybody writes.
- `turnips=N` - the human's turnip counter, clamped under the threshold. The
  threshold is the land's own (`turnipThresholdFor`, the army divisor rounded
  the other way), so it is 1 on Pilsotas and 6 on Eastern Aukstaitija rather
  than one number for the map.
- `wealth=N` - the human faction's treasury.
- `rules=turn:unlimited` - rule picks, `axis:option` pairs separated by `;`.
  An unknown axis or option is dropped; an omitted axis keeps its default.
  The pick also seeds the booted page's rules preference. A pre-flip URL
  naming the retired `copies` axis still boots - the unknown-axis rule drops
  it, and `rel=`, `deck=`, `known=` and `xp=` are simply not boot keys any
  more.
- `popups=off` - sets the existing "Show popups" log pref.
- `region=baltic|iberia` - which map the booted page plays on; it seeds the
  booted page's region preference the way `rules=` seeds the rules pick. An
  unknown value is dropped rather than defaulted, same as everything else in
  this list - a wrong id here must not silently boot a perfectly ordinary game
  on the wrong map.

`src/boot-params.ts` owns them, with the ordering rules and their
consequences in its doc comments; `tests/boot-params.test.ts` pins the
behaviour. The properties to preserve: a URL naming no boot param parses to
`null`, so a player's page is untouched; a booted run uses memory storage, so
it neither reads nor writes the player's saved preferences; overrides apply
AFTER the fast-forward, so the number means the store as it stands; and every
numeric override is clamped, because a URL is the same attack surface as a
hand-edited record.

**There is deliberately no `window` handle on the game state.** A browser pass
asserts what the player can see; state assertions belong in vitest. A refresh
is a clean start - the run is not persisted, and the way back is the URL.

## A status is the only difference between a land that plays and one that does not

Every faction on the active region's map has a seat, a deck and a ruler's
chair. Five of them act; the rest carry the passive status `keeps-to-itself`,
and that status is the entire difference. `playsTurns` in `src/passives.ts` is
the one question the turn loop asks, so a quiet land can be raided, subjugated,
poached, healed and incorporated by the rules that already exist, and taking
it strips the status - its people wake up as their new lord's vassal, holding
the deck they were dealt.

Two things ride on the same fact rather than on conditions written down twice:
a quiet land raids a neighbour about one round in four (`RESTLESS_RAID_CHANCE`,
resolved at the round wrap), and it stops the moment somebody takes it, because
the raid asks for the status and capture takes the status off.

Passive statuses are defined once, region-agnostic, as a table in
`src/passives.ts` - the quiet set, the two terrain statuses and the burden -
plus one hook each. Which lands can roll which terrain, and which carry the
burden from turn 1, is region data instead: `terrainEligibility` and
`bureaucracyLands` on each entry of `REGIONS` in `src/regions.ts`.
`strippedOnCapture` is the axis that keeps "describes the ground" apart from
"describes a land nobody holds". **A status does not ship until the land hover
names it**: a rule the player cannot see is a rule that reads as the game
cheating.

## A land with no leader takes no turn

`pickFaction` seats a ruler on the acting factions alone (`vacateRulers`), and
a vacant chair nobody sits in is what `advance` passes over. The gate is on
ACTING, not on holding: a land somebody has taken still has no leader, and a
leaderless faction takes no land - a restless raid out of the grey middle is a
raid, not a conquest.

Because a leaderless actor never gets a `beginTurn` of its own, anything that
resolves at the actor's turn start is swept at the round wrap instead, or its
arrow would stand on the map for the rest of the game.

**Unless a PERSON is sitting there.** `takesNoTurn` in `src/game.ts` asks
three questions in an order that is load-bearing. An annexed people is passed
over whoever was playing them - a person whose realm has been swallowed is out
of the run, and exempting them would leave the table waiting on a turn that
can never come. Otherwise a leaderless faction is passed over UNLESS
`isHumanFaction` says somebody is playing it, because a player skipped forever
is not a rule, it is a hung game. A leaderless person still takes no land;
that gate is `hasRuler` at the capture sites and is untouched.

The human arm belongs in `takesNoTurn` and not in `advance`, because the sweep
above reads the same predicate. Spelled in `advance` alone it exempted the
first seat from the skip while the sweep still resolved a second person's
marches at somebody else's turn start.

## The player is a set of seats, and only one of them owns the phase

`GameState.humanSeats` is the seats a PERSON plays. Two questions ride on it
and they are not the same question, the `realmOf` / `fullRealmOf` split one
level down:

- **"Is a person playing this faction"** is `isHumanFaction`, and it is
  plural. It decides who is ASKED rather than automated - the conquest
  question in `takeLand` - and whose chair stays warm without a chief.
- **"Whose ending is on screen"** is `humanSeats[0]` alone. There is one
  `phase` field and two people cannot hold different ones, so it speaks for
  the host's seat and a second person's screen maps it for itself
  (`guestPhaseView` in `src/net-protocol.ts`).

Spelling both as one `humanSeat` is what gave the two humans different rules.
A conquest asked the host how many defenders to send and moved half out of the
guest's land without asking; an assassinated guest was passed over for the
rest of the run; an annexed one was given no ending at all, no turn and
nothing on screen to say why.

So the test to apply to a new reader is which question it is asking. If the
answer decides what a PERSON is offered, it is `isHumanFaction`. If it decides
what `phase` says, it is `humanSeats[0]`.

## The guest is never a branch at the call site

Every decision the local player makes while a game is in play - a card played,
a card discarded, a turn handed over, a harvest boon picked, defenders sent
with a conquest, a run given up - is a `Decision` in `src/decisions.ts`, and
`commitDecision` is the only thing in the app that knows whether this screen
is the host, the guest or alone. A handler builds the decision and hands it
over. It does not ask what `net.role` is, and it cannot: the root `biome.json`
forbids `src/main.ts` from importing `playCard`, `discardCard`, `endTurn`,
`transferDefense` or `surrender` at all, so there is no local path around the
router for a new decision to forget the guest on.

`DECISION_ROUTES` is an exhaustive `Record<DecisionKind, Route>`, the
`NOTICE_RULES` shape: a new decision does not compile until it either names
the `NetAction` it crosses the wire as, or says in a sentence why it is the
host's alone. `decidedHere` is the only reader of that second answer, so the
surface that RAISES a question - the harvest modal, the transfer modal, the
Surrender button - is gated by the same table that routes the answer, and a
person is never shown a question whose answer has nowhere to go.

The host's own play goes through `applyNetAction`, the same call the guest's
action arrives at. One engine call, two transports: a `sourceId` or a harvest
pick cannot reach one seat's play and not the other's.

This is a router and not a convention because the convention rotted with every
test green. The shape was `if (net.role === "guest") { send(...); return; }
game = playCard(...)`, at seven call sites, and it drifted in both directions
at once. `openHarvestModal` sat one line below a guest's early return, so a
guest holding a Turnip harvest never chose its boon - the host picked for them
and the log named a card they had not asked for, on the strength of a comment
claiming a guest holds no harvest, which the turnip bar had stopped being true
of. `autoAimIfOnlyOne` carried a guest branch nothing could reach, because its
only caller was inside the host half. And `askTransferIfPending` was in
neither branch: it read the conquest question off replicated state without
asking whose it was, so the guest raised the host's modal and answered it into
a copy the next update threw away.

The scope is decisions IN PLAY. The lobby's faction pick is three-way at its
call site on purpose - the host holds a pick, the guest sends one, a solo game
deals on the click - and that is the one role branch left in `src/main.ts`
that changes state. Everything else that reads the role there is presentation:
who the other human is, whose rules the picker shows, what `.net-guest` hides.

Two things the router cannot do for you, so each is its own guard:

- **A replica is the host's state, field for field.** `src/net-codec.ts` is a
  spread and one `Map` repair, so a new field crosses for free - unless it is
  a `Map`, a `Set` or a `Date`, which stringify to `{}` and take a rule with
  them. `SerializedGameState` is checked at COMPILE time and the error names
  the field; `tests/net-codec.test.ts` walks a real mid-game state as well,
  for the nested case and the `any` a type says nothing about.
- **A card's BEHAVIOUR is the handshake, not its name.** `cardRulesHash` folds
  in every field of `CardDef` that `CARD_FIELD_KIND` calls behaviour, plus the
  tables a card's rules are spread across, gathered in `CARD_RULES`. Prose is
  left out deliberately: refusing a lobby over a reworded sentence teaches the
  player nothing. The hash used to be `Object.keys(CARDS)`, and three commits
  changed damage, a price and legality without changing one id - two builds
  shook hands and then disagreed about what the player's own card was about to
  do.

`tests/two-seat.test.ts` drives both seats through the real sessions, the real
deal and the real router. A test that keeps its own copy of what the app does
is a test that passes while the app is broken: `tests/net-pipe.test.ts` kept
copies of the deal and the AI chain, and both went on passing across forty
commits during which the app's wiring quietly stopped matching them.

## An arrow crosses the border, and there is one thing that draws it

Every arrow on the map - a march in flight, a subjugation demanded, the
preview under an armed card, the ghost of a march that just landed - is an
`ArrowSpec` handed to `renderArrowScene` in `src/arrow-scene.ts`. There is no
march-arrow code and aim-preview code; there is one scene with four kinds in
it, and `ARROW_KINDS` is exhaustive, so a fifth does not compile until
somebody says what it looks like and why.

The root `biome.json` forbids `src/main.ts` from importing `spearPolygon`,
`spearFor` and `SPEAR` from `src/arrows.ts` at all, the same way it forbids
the engine's mutators: there is no local path to put an arrow on the map that
could forget the border, the lane or the ghost beside it.

**The border is in the map data already.** Adjacent regions share EXACT
vertices, so `crossingBetween` in `src/borders.ts` is a set intersection, not
a geometry search. Five things about it are load-bearing:

- **A border is a table of measured STATIONS**, up to 32 real vertices sampled
  along it, each measured once for how much room `reach` finds into both
  lands. `reach` itself takes the FIRST run of land along the ray, capped at
  `want` and backed off by `inset`, and answers `-1` for a place an arrow
  cannot stand at all - never reached, or a run too short to stand in: an
  arrow crosses a border and stops in the body of the land it enters, and a
  later run is across a gap, on ground the arrow was never aimed at.
  `Crossing.at` is the roomiest station - never a computed point, and no
  longer the vertex nearest the border's centroid - and a lane STANDS on a
  station rather than at an offset along the tangent, because the tangent is a
  global fit to the whole border and the border bends locally under it: an
  offset measured along that line is routinely off the border altogether,
  sitting inside one of the two lands rather than on the line between them.
  Measured: the old tangent-offset scheme left 50 of 1,236 lanes with an end
  on the wrong land; standing lanes on stations instead cut that to 8, and it
  is 0 today - `tests/borders.test.ts` asserts it across every adjacency on
  both maps rather than allow-listing what is left.
- **Each lane takes the nearest FREE station its neighbours leave it room
  on**, among those where both `into` and `out` clear `ARROW_DEPTHS.min` -
  never one an earlier lane in the same block has already taken, and never one
  closer along the border to a station this block has taken than the two
  lanes' half-widths. Stations here are routinely a fraction of a unit apart,
  so nearest-to-my-own-offset alone drew 364 of 848 lane pairs closer together
  than their own widths, the worst 24 units into each other. Where the border
  offers no station that far off, the lane takes the nearest crossable one
  anyway and the two overlap: correctness outranks packing, and a search made
  to come after its neighbour unconditionally left 2 of 1,236 lanes with an
  end on the wrong land. It is a greedy pass and not an optimal packing, so
  128 pairs still overlap: most are ground the border does not have - the
  overrun `blockMin` already trades for - and about 10 are the anchoring, one
  lane taking the station nearest its OWN offset with no regard for where that
  leaves the lanes after it. Every measurement of it so far used equal
  strengths; a block of unequal widths leaks more, and the doc comment on
  `stationsForBlock` says where to look. The stations a block ends up on are
  then dealt out along the border in DECLARATION order, so the search decides
  WHICH stations a block occupies and the second pass decides which arrow
  stands on which of them, without disturbing the order the arrows were
  declared in.
- **An arrow's depth is the room its own station has**, floored at
  `ARROW_DEPTHS.min` so a cramped station still reads as an arrow instead of
  overrunning the ground it stands on. The depths live in `src/borders.ts` as
  `ARROW_DEPTHS`, not in `LAYOUT` (`src/arrow-scene.ts`), because how deep an
  arrow may stand is a question about the ground, and the ground is what
  `src/borders.ts` measures.
- **The normal's direction is decided by a vote**, four probe distances in
  and out of both lands. The tangent is a global fit to the whole border and
  the border is locally bent under it, so one probe is ambiguous on 7 of the
  103 adjacencies these two maps have. `tests/borders.test.ts` walks every
  pair on both maps, which is the test that would notice.
- **A strait is not a border.** Two lands that share no vertex face each
  other across water - Saaremaa and the Balearics, four ordered pairs per
  map - and their arrows SPAN the water instead of standing in the middle of
  it. It gets a station table like any other crossing, laid along the water
  rather than measured off a border it does not have, every station carrying
  `gap / 2 + seaClearance` both ways: open water is equally good everywhere,
  and one station per crossing is what let the second arrow of a block find
  none and be drawn at the LAND depths, a 64-unit arrow standing in the sea
  with neither end on a coast. The table is what keeps `layoutLanes` one rule
  rather than a sea arm beside a land one.

**Width is strength MAP-WIDE, and the scale is one number per render.**
`width = unit * sqrt(strength)`, where `unitWidthFor` picks the `unit` once
for the whole scene: the most generous one every border can afford, the
smallest of `blockWidthFor(span) / sum of sqrt(strength) on that border`.
Position is still declaration order along the border, and direction does not
sort them - an answering raid stands beside the attack it answers, in the
order the two were declared. Packed edge to edge as far as the ground allows:
a lane stands on a station rather than at an exact offset, so the packing is
the separation rule in the station bullet above, and where a block is wider
than the crossable ground it stands on the border overruns rather than
thinning the arrows past reading.

Three things follow, and each is the reason for a part of the rule:

- **A solitary arrow takes its whole block, exactly as it always did.** It
  shares the map with nothing, so it is relative only to itself and the min is
  its own border's capacity. This is why the scale is a min over borders
  rather than a constant width per point of strength: a fixed `26 * sqrt`
  would have shrunk every quiet board's lone raid to a quarter of what the
  player is used to for no gain, since there was nothing to compare it with.
- **The square root, so width reads as AREA.** 4 STR is twice a Raid, 16 STR
  is four. Strength is not bounded at 2 - `attackDamageFor` is
  `(base + leadership) * omens` - so anything linear draws a war leader's raid
  wider than the land it crosses.
- **Comparability is owed within a frame and not across turns.** The unit
  moves as the board does: the same Raid is narrower on a turn when some
  cramped border is carrying three arrows. Widths are read against each other
  on one screen, never against a remembered arrow from last turn, and the
  alternative buys that memory at the price of the bullet above.

The block is the SUM of its lanes rather than a size the border hands down, so
the ground decides where a block is centred and - at one remove, through the
scale - how wide it may grow. Past `laneMin` the scale stops shrinking and the
block overruns its border instead, the same trade `blockMin` already makes:
an arrow nobody can see is worse than one wider than the ground it crosses.

It was per-border share first, `clamp(span * 0.55, 30, 96)` split by strength,
and the failure is what a share rule always does: a lone 1 STR raid on a broad
frontier was drawn at 96 while a 1 STR raid sharing a cramped border was drawn
at 15, and the map said one of them was six times the army.

The strength is "1 STR" wherever the lane has room for it, and the bare
number below `BARE_NUMBER_WIDTH`. The bare number is safe only because the
landing-order chip sits BEHIND the tail rather than on the shaft: the shaft
carries exactly one number, and there is nothing left for a digit to be
confused with. Put an ordinal back on the shaft and the "1 STR" form has to
come back with it.

**The scene is retained, so nothing on it appears or vanishes.** An arrow is
the SAME element from one render to the next, keyed by the caller's id
(`march:<id>`, `claim:<key>`, `resolution:<turn>:<ids>:<from>`, `aim`): it
fades in when it is declared, slides to its new lane when the border it
crosses gets busier, and fades out where it stood when it goes. The aim
preview is the one opt-out - it re-packs on every pointer move and has to
track the cursor. The lane slides are ADDITIVE and are never cancelled: one
slide carries one lane change down to zero, so a second lane change composes
with the first instead of snapping the arrow back to where it started.

**Including the end of the run**, which is the one path that used to cut them
off the map: a victory, a defeat, a unification, a surrender and New game all
reach `paintArrows` with no run in play, and it hands the scene an EMPTY SPEC
LIST rather than emptying the layer, so the arrows fade out under whatever is
rising over the map. Emptying the layer instead is a blink the player sees -
the postmortem is two stages behind the commit that ends the run, and the map
is visible around both.

**The ghost is laid out with the living, and that is what a beat needs.**
What a landing left on the border is a `kind: "ghost"` spec in the same scene
as every live arrow, so it takes a lane in the same block. It states its own
fill (`src/main.ts`: gold, red or a neutral brown, by `tone`) rather than
leaving it to `.march-arrow`'s CSS - which a ghost, drawn as `.clash-flash`,
does not even claim - because a ghost is the one arrow on the map its beat is
actually about.

**A faction colour used as a MARK goes through `inkFor`.** A rival's arrow
(tone `other`) is filled with `arrowInkFor` in `src/main.ts`, which darkens
the faction's own colour (`inkFor` in `src/map-render.ts`) until it reaches a
3:1 contrast against the map's unowned fill, memoised per faction since the
search inside `inkFor` walks up to a hundred steps. The map's palette is pale
by design, so a faction colour used raw as a mark on it reads at about
1.05:1 - not a mark at all. Used as a LAND's fill instead, a faction colour
stays exactly as authored: `inkFor` is for something drawn ON the map, never
for the ground itself.

**The casing is a screen-constant stroke.** `.march-arrow polygon` sets
`vector-effect: non-scaling-stroke` on its `#fdfaf4` outline, so its width is
screen pixels rather than map units: the default view is a 2508-unit viewBox
on a roughly 1440px element, and a casing measured in map units would be a
line well under a pixel wide at exactly the zoom the game is played at -
present in the markup and invisible on screen. Paired with the ink rule
above: the ink handles a pale land behind the arrow and the casing handles a
dark one, so whichever ground an arrow crosses, one of the two contrasts
with it.

**An arrow arrives and leaves on the beat that explains it, never at the
repaint behind it.** The displayed state lags the whole transition, so on its
own it is wrong at BOTH ends of a beat, and a beat therefore names every arrow
it moves. `Beat.declares` is the march this beat's declaration created,
standing on its border as the sentence announcing it is read; `Beat.retires`
names the marches whose arrows this beat takes off the board, and they exit
PLAIN - a fade, no label, nothing claiming to be the outcome - while
`Beat.resolutions` are what say what got through. A clash retires two arrows
and leaves a force that is neither of theirs, so no arrow's own exit could
have told that story.

`drawnMarches` in `src/main.ts` is the one answer to "what is on the board",
and it is why every repaint in between agrees with the beat: the state's
marches, plus what `beatDeclared` is holding ahead of the commit, minus what
`beatRetired` has taken off. The declarations and the retirements outlive the
beat and the resolutions do not, because the commit's state owns the first two
and never the third. All of it is ids, so the arrow a beat stands on a border
and the arrow the commit paints from the state are the SAME `march:<id>`
element and the scene keeps it - the arrow does not fade in twice.

Left to the state alone a declared arrow waits for the commit, which waits
behind every beat of the move: a round of raids read as one label at a time
and then a burst of arrows, none of them attached to the sentence that
announced it. What still arrives in a burst is exactly what the player was
told nothing about - the round-wrap restless raids between quiet lands, which
`involvesLocalSeats` gives no beat because they are none of the player's
business. An arrow with no notification belongs to the board repaint; an
arrow with one belongs to its beat.

Nothing is hidden while a beat runs. The rule that hid every live arrow for
the length of one, a separate ghost layer, and a hand-built ghost scene all
existed because a live rebuild used to wipe a mid-fade ghost - and with
identity a rebuild wipes nothing. A march this move declared cannot stand over
the landing of the one before it, because it is on screen only from its own
beat onward.

**Everything that decides how an arrow LOOKS is on its spec.** How loud an
arrow is drawn is exactly one field, `ArrowSpec.emphasis` (`full`, `back`,
`dimmed` or `faded`), chosen once by `emphasisFor` from what the hover, the
pin and a live aim have to say (`ArrowCues`) and written as a single class
through `ARROW_EMPHASIS` - replacing the `faded` and `dimmed` booleans this
used to be two of, and the four CSS rules on the same property that raced by
specificity to decide between them: it had already produced a "faded" rival
arrow drawn BRIGHTER than an unfaded one, and starting an aim raised every
pin-dimmed arrow back up. `dressArrow` states an arrow's whole class
attribute, which is what stops a stale cue surviving a render - the surfaces
that own the hover and the pin repaint rather than write on the elements, and
`paintArrows` derives every arrow's `emphasis` from the same dataset those two
questions were always answered from. No pass after the paint touches an
arrow's OPACITY, which is what makes the ordering impossible to get wrong.
Two classes are still written afterwards - `march-counterable` on an
answerable arrow and `aim-valid` on the preview - and both are safe only
because neither declares an opacity. Give either one and it must move onto the
spec with the emphasis.

A ghost and the aim preview answer `live` first and are always `full`: an
arrow standing for the beat on screen, or the arrow a play is about to make,
is never pushed back by a question about something else. An arrow landing
where the player is aiming answers `atAimTarget` and stays `full` too, ahead
of the plain `back` a live aim gives every other arrow on the map.

**A pin does not survive an interaction**, and it takes two calls to say so,
because the two moments are not the same moment. `onPlayCard` deselects the
instant a card is ARMED, which is the one that closes the aim case: arming
commits nothing, so `decide` is not reached until a target has been chosen,
and the whole window in between is exactly when an aim is live. `decide()` -
the one place this screen turns a `Decision` into a state change - clears the
pin for every decision kind except `end-turn`, which keeps it deliberately so
the round about to run can still be read through the log filter afterward;
that arm is what covers a call site that arms nothing, the way an arrow's own
counter click plays a raid straight through `decide` with no card ever set as
`armed`. Together they are the cross-cutting rule the section above leans on:
`emphasisFor` never has to arbitrate a pin against a live aim, because a pin
cannot still be standing once an aim exists. The two used to be sorted out
after the fact instead, and they could not both be right - a card armed while
a land was pinned left the pin's dim and the aim's own back-step disagreeing
about the same arrow. A new
decision handler that reintroduces a stale pin is exactly the failure this
closes.

It was a pass after the paint twice, and it failed differently each time.
Written by the surfaces themselves, a repaint while a land was pinned
un-dimmed the entire map, because the hover's early return on an unchanged
focus meant nothing put it back. Re-applied at the end of the paint instead,
the dim landed AFTER `enter` had already read what the new arrow's resting
opacity was: an arrow declared while a land was pinned faded up to full over
220ms and then dropped to 0.16 in one frame. **An arrow's fade rises to the
opacity the stylesheet gives it, so anything that changes that opacity has to
be on the element before the fade is started.**

That closes the cues KNOWN AT CREATION and not the ones that change under a
running fade. `enter` bakes the resting opacity into a keyframe and nothing
re-aims a fade already in flight, so taking a pin or moving the pointer onto
another arrow during those 220ms still steps the opacity when the fade ends -
up to 0.84 in the pin case. The window is small and the fix, if it is ever
worth it, is to re-aim a live `held.fade` in `place` when a kept arrow's
`emphasis` has changed.

**The aim preview shares the block with the arrows already crossing it.**
`kind: "aim"` is a spec in the same scene as every live arrow (`src/main.ts`,
in the list handed to `renderArrowScene`), so it is packed and re-packed on
every pointer move exactly the way a real declare would be. The commonest aim
in the game is a counter back down a border that already carries the arrow it
answers, and a preview laid out as if it stood alone took the whole block and
was drawn on top of that arrow, with only its barbs showing.

## A raid is as strong as the land behind it is willing to bleed

An attack card has no damage of its own. It spends the defense of the land its
army marches out of, 1:1, and the arrow lands for what was spent - so raiding
hard leaves that border land soft, and the softness is on the map for every
rival to read. `RAID_SPEND_FRACTION` in `src/defense.ts` is how deep each card
may dig into its source's CURRENT defense: a Raid reaches half of it rounded
up, a Strong raid and a Great raid all of it. `spendCeilingFor` is the one
reader, and `spendCeilingOn` in `src/playability.ts` is the one place the
question "how much could this land pay" is answered - legality, the aim
preview, the slider's bound, the engine's clamp and the host's re-clamp of a
guest's action all call it.

Four things are load-bearing:

- **The minimum is 1, stated as legality.** A land with nothing left to spend
  is not a legal source (`marchSourcesFor`), rather than a source that sends a
  0 STR arrow. An arrow on the map is a promise of damage, and one existing
  only to soak a counter would be a second thing arrows mean.
- **The ceiling reads CURRENT and never maximum.** A land already wounded
  raids more feebly, which is what makes a successful counter-raid worth more
  than the point it took off the score.
- **The spend is gone, and it is spent at DECLARATION.** `declareMarch` takes
  it off the source the moment the arrow appears, which is why the number
  printed on the arrow is a promise: it was already paid. Fortify, Hillfort
  and the harvest heal are the way back. `STRONG_BONUS` no longer reaches
  raids - Strong raid's identity is its row in the fraction table.
- **Favourable omens doubles the arrow and not the price.** `attackDamageFor`
  takes the spend where a flat per-card number used to sit and is otherwise
  unchanged, so a reading is free force worth holding rather than a discount
  worth spending, and a leader's raid prowess still adds flat.

**Great raid draws on ONE pool.** The player names a total and `allocateSpend`
divides it between the fan, water-filling in fan order: everyone climbs
together, a land that hits its own cap stops taking points while the others
keep climbing. It is written as the round-robin loop it describes rather than
as a division and a remainder, because the slider drags one point at a time -
raising the total by 1 must add 1 to exactly one row and leave the others
where they stand, or the tally re-shuffles under a player reading it. The
pool's floor is the fan's size, one point per arrow: a Great raid sent for
less than that would be a Raid played at a Great raid's price, which is what a
caller with no opinion would otherwise get.

**The amount is asked after the target click, and it rides the `play`
decision.** `askSpend` in `src/main.ts` raises the slider and `spend` is a
field on the decision rather than a `DecisionKind` of its own - the amount is
settled before anything is committed, so it is part of playing the card and
the router does not learn a fifth thing. A guest raises its own slider and
sends its number, exactly as it does with the source. Unlike the transfer
offer this overlay CANCELS: nothing has happened yet.

A missing or out-of-range `spend` is CLAMPED into `[MIN_RAID_SPEND, ceiling]`
rather than refused, at `playCard` and again at the wire. Every caller that
names none means the same thing by it - the sim, a fast-forward, an older
build, a replayed URL - and "as little as the card allows" is the safe reading.

**The preview quotes the ceiling and says "up to".** `attackImpactOn` answers
what the card COULD take off a land if it spent everything, because the amount
is not chosen until after the click; a preview quoting the least the card can
do would be describing a play nobody is making. The aim arrow's width is the
same ceiling, for the same reason - the preview goes into the real lane
packing, so it shows the widest block the play could make.

**`levied` is the log line for it**, a `GameEventType` of its own. Nothing
existing describes a land losing defense to its own side's play: `plagued` and
`march-resolved` both mean "somebody did this to you", and borrowing either
would tell the player their own land was attacked by the raid they chose to
send. One event per land, so a Great raid across three lands levies three
times and each badge walks its own number. It is silent in `NOTICE_RULES` (a
modal telling you what you just decided teaches nothing) and `framed` in
`PRESENTATION_RULES`, which gives the player's own levy a badge walk and no
camera through the `causedHere` arm.

The AI's rule is `raidSpendFor` in `src/ai.ts`, and the ORDER of its three
arms is load-bearing: a conquest is paid for wherever the source stands
(`defense + 1`, and not a point more); failing that, a frontier land spends
the minimum rather than being gutted to soften a land it cannot take; failing
that, an interior land spends its ceiling. Read the other way round, a branch
that had already picked a target it could overwhelm would send an arrow too
small to take it. The restless raid out of a quiet land spends the minimum,
deliberately: it raids every fourth round and never heals on purpose, so a
ceiling spend would sink the grey middle toward 0 while nobody watched.

The 2026-08-15 raid-spend doc in docs/superpowers/specs has the full
reasoning.

## The hand is the realm's, and it is a floor rather than a ceiling

`handLimitFor` in `src/playability.ts` is how many cards a turn refills to: one
more card per 1.5 lands held, from `MIN_HAND` (3) up to `MAX_HAND` (7), written
as `2 * lands / 3` so no float lands on a game rule.

    lands  1  2  3  4  5  6  7  8  9+
    hand   3  3  4  4  5  6  6  7  7

It lives beside `wealthIncomeFor` and `freeArmiesFor` because it is the same
kind of number - what the realm is worth at one of the game's dials - and it
counts `fullRealmOf`, per the realm-sizes rule below: this is a number the
player can read off the scoreboard one chip over.

Three things about it are load-bearing:

- **It is a refill TARGET, not a cap.** Nothing in the game discards down, so a
  realm carved back to two lands holds whatever it was holding and simply draws
  nothing until it has played back under the number. Adding a discard-down
  would mean asking the player WHICH cards, which is a decision and a modal;
  the `hand: "sweep"` rule already corrects a fat hand at turn's end for anyone
  who wants that.
- **`OPENING_HAND` is `MIN_HAND`.** A seat on its first land is dealt exactly
  its target, so turn 1 draws nothing and logs no `draw`. Several tests read
  that way round - if the two constants are ever pulled apart, the opening
  animation tests are the ones that notice, and `tests/playability.test.ts`
  pins the tie deliberately.
- **`beginTurn` reads the LOCAL `overlords`, not the snapshot.** The escape at
  the top of the turn and the marches that land below it both move the realm
  before the refill runs, and a land taken moments ago is a land the hand it
  deals with should count.

The number is written down in exactly one place the player can see: the
`status-hand` chip in the HUD, with the rule in its hover. The rules picker
deliberately promises NO hand size on either turn option, and a test holds it
to that - it used to say "refills to 4", pinned against the old constant, and
any number written there now would be a promise the game breaks by the third
land.

## A won run can be played on, and the bar moves once

Winning at half the map is an offer, not a full stop. The postmortem's third
button (`keep-playing` in `DECISION_ROUTES`) hands the run back with the
player's own bar raised to the whole map; reaching that ends it for real, and
the offer is not made twice.

- **`winSizeFor` is the bar, and it is the only one.** `victoryRealmSize` is
  where every faction STARTS, and nothing outside `winSizeFor` may call it - a
  second caller is a second bar, and the two disagree the moment somebody
  plays on. The win condition, the scoreboard and the concede line all read
  `winSizeFor`, so the number the player is shown and the number the engine
  applies cannot drift. It derives the human from the board rather than taking
  one, because the caller that would get that wrong is the scoreboard: its
  human is `localPlayerId`, which on a GUEST screen is the guest's seat and not
  the seat the raised bar belongs to.
- **`GameState.playingOn` is state, not a screen flag**, because a guest holds
  a replica and its scoreboard has to quote the bar the host's engine is
  applying. A boolean and not a seventh `GamePhase`: the phase genuinely is
  "playing" again, and a second playing-phase would have to be answered by
  every reader of `phase` in the app, all of them the same way. One-way -
  nothing clears it, or a player could choose when to win.
- **Playing on is a real risk.** Every rival's bar stays at half, so at exactly
  half the map a rival can still unify and end the run in defeat, and being
  incorporated still loses - the defeat arm of `endingFor` is deliberately not
  conditioned on any of this. The log then holds the first `victory` above the
  loss, which is the honest record of a run the player chose to extend. That
  risk is the whole reason the offer is a decision rather than a formality.
- **The second victory is the same ending, not a new one.** It reuses the
  `victory` type with `GameEvent.playOn` set, so nothing that asks "did the
  human win" has to learn two answers. The flag is read off the EVENT and never
  off `GameState.playingOn`: the state describes the run as it now stands, so a
  line reading it would go back and relabel the first victory - honestly won at
  half the map - as a whole-map conquest.
- **The run clock is deliberately not in the state.** `src/run-clock.ts` sums
  the stretches the phase spent in play and `HudCallbacks.elapsedMs` carries the
  total to the overlay. A `Date` field is a compile error in `src/net-codec.ts`;
  an epoch number would cross the wire and show the guest the HOST's stopwatch;
  and a wall-clock read inside the reducer is the nondeterminism
  `tests/rng-isolation.test.ts` exists to keep out. It is keyed off the phase
  and not off the New game click because that click is not the only door into a
  run - a guest's starts at the host's snapshot and a `?turns=` boot on the boot
  path - and summing stretches is also what makes a played-on run come out
  right: both halves counted, the postmortem read in between left out.

## Nothing ends itself

A turn ends when the player says so, on both rule axes (`RULE_AXES` in
`src/rules.ts`: `turn` is one card or unlimited, `hand` keeps what is left over
or sweeps it). What a card leaves behind is a separate question from what it
does:

- **A repeating keyword** (`KeywordDef.repeats` in `src/cards.ts`) re-opens the
  spent turn for another card of THAT CLASS, and nothing else. The play spends
  the turn's allowance the way every card does; `GameState.repeatGroup` carries
  which keyword, and `turnAccepts` is the only reader. A class, not a copy: a
  Raid may be followed by a Strong raid or a Great raid, because all three
  carry the `raid` keyword. Nothing outside those two knows the rule exists,
  and neither knows which card is carrying it, so a new repeating card is one
  keyword.

  **What stops the run is ordinary legality, and a repeating class must
  therefore have something to run out of.** A raid runs out of armies
  (`freeArmiesFor` - a march holds one of its source's until it lands) AND of
  defense, per the raid-spend rule below: two raids out of one land in a turn
  compete for the same purse as well as the same armies, and whichever runs
  dry first closes the run. A
  fortify runs out of settlements: `KeywordDef.spendsSettlement` calls on one
  settlement of the land it heals, counted by `freeSettlementsIn` against
  `GameState.settlementsSpent` and handed back wholesale by `beginTurn`. The
  limit is the board, not a count of plays - which is why a repeat with no such
  bound must not ship. A heal that ran out of nothing would be bounded only by
  the hand.

  Two cards, one bound: Fortify and Strong fortify both spend exactly one
  settlement, so a land holding one takes one fortify a turn whichever card it
  was. Hillfort is a single-land heal carrying no keyword at all - it costs
  nothing and repeats nothing, and that asymmetry is the point of keeping the
  rule on the class rather than on `SINGLE_LAND_HEALS`.
- A **claim** is a Subjugate in flight: the play declares it, and it answers at
  the ACTOR's next turn. The land may close its gate in the meantime, somebody
  else's army may break the claim, and the demand lapses. The same rule as a
  march arrow, for the same reason - an allegiance that changed the instant a
  card hit the table gave nobody a chance to see it coming.
- A **capture** is an army arriving with more force than the land has left
  standing: `capturesOnArrival` in `src/defense.ts`, and it is one predicate
  read by the resolution and by the hover preview. Strictly more - a blow that
  exactly flattens a land leaves it at 0 and its own, and the next arrival
  walks in, which is what keeps two raids on one land worth timing. A land
  already at 0 is the same rule and not a case beside it: anything that reaches
  it deals at least 1, and 1 exceeds nothing.

  The question is about the BLOW, not about how broken the land is, which is
  what makes it a different door from `SUBJUGATION_GATE`. A Subjugate claim
  asks the gate; an army asks whether it got through. Both gates still refuse a
  conquest to a faction with no ruler, so a restless raid out of the grey
  middle breaks a land without taking it.

  The taker is then asked how much defense to send with the conquest
  (`pendingTransfers` / `transferDefense`); a seat nobody is sitting at moves
  half on the spot. 0 is a real answer. Keyed by FACTION, because every person
  is asked and one slot would have let one of them hold the only question on
  the board - and a QUEUE per faction, because a turn can take more than one
  land. Three conquests owe three questions, answered in the order the lands
  fell; one slot per faction asked about the first and dropped the other two,
  which then sent no defenders and said nothing about it.

  **The answer NAMES the conquest it answers, and is applied for the seat that
  was ASKED.** Both halves are the same lesson. `transferDefense` takes
  `from`/`to` and refuses a front that does not match; the `transfer` action
  and the `transfer` decision carry the pair; `applyNetAction` requires the
  acting seat rather than deriving it from `state.current`.

  Unnamed, an answer meant "the front of somebody's queue", so one applied to a
  board that moved underneath it landed on a different conquest or on none -
  and landing on none returns the input state, which `commitDecision` reads as
  `RULES_REFUSED`. A refusal that cannot be told from success is a question
  that stays owed with nothing able to notice. The old comment on the action
  said naming the pair was "only a second chance to disagree"; the reverse is
  true, and a disagreement that can be SEEN is one the screen recovers from.

  **`onTurn` on each `NET_ACTION_RULES` entry is what keeps the seat honest.**
  Play, discard and end-turn reach the engine through calls that act on
  `state.current` and take no seat, so `validateRules` refuses those kinds
  unless the acting seat IS `state.current` - by the time the engine reads the
  board the two cannot differ. The conquest answer is the one kind that is not
  a move made on a turn, which is why it alone takes the seat, and why the
  blanket turn guard moved out of `validateAction`: applied to all four it
  refused a guest's answer whenever the board moved under its modal.

  `commitDecision` runs `validateRules` on the solo and host paths too. The
  guest had that check and the local seat had none, so the only answer a local
  caller could get out of a move the rules would not take was the generic
  `RULES_REFUSED` - and only where the engine happened to refuse by returning
  its input.

  **And a question owed with nothing asking it raises itself.** `shouldReask`
  in `src/gates.ts`, wired through `refreshWhenSettled`, is the one
  reconciliation in the app. Every other route to the modal is a one-shot - the
  `ask` stage and the boot tail - so any way of losing an answer left the
  conquest owed and unaskable, and the gate then refused every play and every
  end of turn, which is what stopped a later transition ever running to notice.
  That is a seat with no way out and nothing on screen: a real run reached it
  at turn 62 by taking two lands in one turn, answering the first question, and
  never being shown the second.

  **An `ask` stage that finds the modal already up WAITS on it.**
  `transferOnScreen` names the question being put to the player and
  `transferWaiters` holds the stages queued behind it. The old latch released
  those stages immediately, which gave up the rule two paragraphs down - that
  nothing resolves behind an unanswered conquest - and, because it was never
  cleared on a lost answer, suppressed the question for the rest of the run.

  **`abandonedTransfers` is the floor under all of it.** Three refused answers
  and the screen stops counting that conquest, logs loudly, and hands the board
  back. The defenders never move, which is worse than answering and far better
  than a dead run - and the run is not persisted, so a dead run is the whole
  run. It should now be unreachable, since a named answer can only be refused
  when the front is a DIFFERENT conquest and the next raise reads that new
  front. It is there anyway, because "unreachable by construction" is exactly
  what was believed about the arrangement that produced the dead seat.

  **The turn-62 trigger itself was never reproduced**, and that is worth
  saying rather than leaving a future reader to assume the wrong-faction pop
  above was it. The chain was driven hard afterwards - two conquests in one
  turn through the real `ask` stage, and boot-path chains of six to eleven
  questions across a dozen seeds - and it held every time, on the code as it
  stood. So the reconciliation is not decoration on a known cause: it is the
  guard that makes the failure recoverable whatever the cause turns out to be,
  and it is the reason the class is closed even though one instance is not
  explained. If it ever fires in earnest, `askTransfer`'s `console.error` is
  the thing to go looking for.

  **Arrivals resolve ONE AT A TIME, each against the board the last one
  left.** `resolveMarches` takes an `onArrival` sink and calls it at the
  moment a capture is decided, so the conquest - and the defenders it moves
  in - are on the board before the next arrow is judged. They used to be
  collected and applied in a second pass, which meant every blow landed
  before any land changed hands: the log read as all the damage and then all
  the conquests, and the replay walked the round twice.

  **A second arrow of your own is SPENT, and lands nothing.** When this
  actor's own earlier arrow took the land moments ago, the arrow is spent: an
  army does not sack what its own side has just moved defenders into. It
  still gets its arrival line, so the player can see where it went, and no
  damage rides on it. `COMBAT_RULES.spentArrival` names the rule so two
  deploys cannot disagree about it silently.

  Asked of `takenHere` - the lands THIS resolution changed hands - and never
  of the actor's realm, because **a raid at a vassal you already held is a
  real play**: keeping its defenses under the independence gate is what
  vassal upkeep is. Only the land that changed hands between the arrow
  leaving and arriving is exempt.

  This one was tried the other way first - the surplus spending what it had
  left on the defenders the conquest moved in - and the reason it is not that
  is worth keeping: it made over-committing arrows at one land actively
  self-harming rather than merely wasteful, which is a punishment for a
  misjudgement the player cannot see coming when they declare.

  **The window to reinforce a conquest is between turns, and it is real.**
  A capture at your turn start raises its transfer question inside that
  turn's replay, so the defenders are in before you play a card - and long
  before a rival's arrow, which resolves at that rival's own turn start. Two
  factions' arrivals never both land in one pass with a conquest among them:
  the round-wrap sweep covers only the seats that take no turn, and those are
  the leaderless ones, which `applyArrival`'s ruler gate refuses a conquest
  to anyway.

  **The arrival is ONE line, and the caller pushes it** - `arrival` in
  `beginTurn`, immediately before `takeLand`, never inside it. Two reasons, and
  both bite: the line has to stand next to the submission it causes, which
  `takeLand` cannot guarantee once captures are applied after every axis has
  landed; and the blow lands whether or not the conquest is allowed, so a
  capture the ruler gate refuses still owes the player its damage line. The
  line carries `amount` when the same blow moved a score - no `amount` and no
  `clash` is `metNothing`, the shape that reads "reaches".

## The harvest is five answers, and the milestones are a table

The Turnip harvest offers five ways to spend it (`HarvestChoice` in
`src/harvest.ts`): grow a land, take a card from your own build, take one from
everything the game knows sight unseen, burn a card out of your piles for good,
or take nothing. Thinning a ten-card deck is a real play, which is why `skip`
and `destroy` are not consolation prizes. The offer IS the discovery route for
deck-buildable cards, so `buildOffer` and `randomPool` decide what a seat can
ever meet.

`MILESTONES` in `src/milestones.ts` is a standing race every faction runs at
once - subjugate 5 different lands, muster 8 armies, hold 5 lands, found 3
settlements, grow 3 times, plague 5 lands. Progress is READ off the state and
the log, never accumulated into a store, which is why "a wide realm" is the
only one that can go down. A store would be a third copy of what the board and
the log already hold, and the first to drift.

## Never interpolate a card or faction name into a string

Every place the game names a card ("Shrewd marriage") or a faction
("Selonians") in player-facing prose, that name is a **segment**, not text.
Build the sentence with `t()`, `card()` and `faction()` from `src/rich-text.ts`
and hand the array to `renderSegments`. Do not build the sentence with a
template literal and `textContent`.

The reason is not tidiness. A name rendered as a segment is a node the player
can point at: a card name shows what the card does, and a faction name lights up
that faction's realm on the map, exactly as hovering its land does. A name baked
into a string is inert, and the player is left to remember what "Shrewd marriage"
does and where Selonians are - in a game with a score of cards and 26 factions,
on a modal that appears once and is dismissed.

This rule exists because the flat-string version shipped first and rotted in the
obvious ways within a week: `cardName` was written twice, once in `src/hud.ts`
and once in `src/deck-screen.ts`; `src/notices.ts` gave up and hardcoded the
literals `"Raid"` and `"Shrewd marriage"` in two places, which then could not
follow a rename in `src/cards.ts`; and `factionNameWithArticle` had to grow a
`capitalize()` helper purely because names were being concatenated at the start
of a sentence.

Two consequences worth stating outright:

- **Write lines so a faction name never opens a sentence.** "Shrewd marriage
  played against you by Selonians" reads better than "Selonians played Shrewd
  marriage against you" *and* removes the article/capitalization problem, since
  the article form ("the Selonians") is only ever needed mid-sentence.

  **The beat labels are the one surface exempt from this**, and deliberately:
  a `PRESENTATION_RULES` label is one sentence about one move, read in a second
  and gone, with no line above it to say whose move it was. So it goes actor
  first, active voice - "Jersikans takes Selonians", never "Taken by
  Jersikans" - and the article form is not wanted at the front of one. Nothing
  else about the rule is relaxed there: every name is still a segment, and
  `tests/presentation.test.ts` fails a label that bakes one into text or that
  points at its land ("here", "this land") instead of naming it.
- **Lowercase the common noun.** If you need the word "alliance" as an ordinary
  English word, write it lowercase. The capitalized "Alliance" is the card and
  must be a `card("alliance")` segment. The convention test enforces exactly this.

The one log line that names no card is not an exception to any of this. A secret
card's play (`CardDef.secret`, below) renders as plain `t(" a secret card")`
because there is no name in it to point at - and the moment the card is revealed
it is a `card()` segment again on that same line. Nothing in "a secret card" can
fall behind a rename in `src/cards.ts`.

`tests/naming-convention.test.ts` is what enforces it, because prose did not
work - the same lesson `POLICY_COVERAGE` records in the repo `AGENTS.md`. It
drives every event type through the log and the round summary and fails if any
plain-text segment contains a card name from `CARDS` or a faction name from
`src/data/baltic.json`.

## The AI's round is one modal, one line per event

Do not add a second modal, and do not restore the three-paragraph notice format.
One `Continue`. One line per notice-worthy event: what card, who did it, and the
score it moved, as `(Defense -1 -> 5)` or `(Disease +1 -> 3)`. Rules
consequences that are not tied to one event - the Pay tribute injection, the
open home gate - go in the footer block under the list, deduplicated, not
appended to a line.

**Score numbers belong to the polygon the line names** - a defense before ->
after on the damaged land's own line, formatted by `standingChangeText` in
`src/view.ts`. This is the same convention as the map badges and the hover
tooltip.

**One modal per ROUND, and a round is several moves.** Each acting seat is its
own transition with its own commit, so `hud.update` FOLDS its batch into
`roundEvents` and raises nothing; `raiseRoundSummary` builds the one summary
from all of it. It is called by stage 4 of the transition that hands the map
back to a person (`handsBackToAPerson` in `src/main.ts`) and its `onDismiss` is
that stage's `done`, so nothing resolves behind a modal about the round before
it and no later batch can silently replace an earlier one. That replacement is
what a repaint-raised modal did: five seats acted, the fifth overwrote the
first, and only the last seat's news was ever read. The numbers still match the
log, because the walk runs backwards from the state at raise time over exactly
this batch - a whole AI round, which is the batch `tests/standings.test.ts`
checks against the real stores.

## The activity log says what happened, and never hides your own turn

The log carries the same numbers, from the same walk. `renderLog` runs
`walkStandings` over the fresh batch through `walkCtxOf` - the identical context
`buildRoundSummary` uses - and `impactText` renders one event's slice as the
`(Defense -1 -> 5)` suffix. The modal and the log therefore cannot quote
different numbers for the same event, and a test asserts they do not. A card
that moves no score gets no suffix: its name is a hoverable segment that
already says what it does. War council and tribute are the two suffixes that
come off the event rather than the walk - leadership lives on the ruler and
coins move no walked score.

Two things this deliberately does not do. The suffix is **not** a `Segment` and
does not live in `eventSegments`: the postmortem log renders those segments over
a whole finished game, with no batch to walk. And the "Targeting me" filter
never hides an entry tagged `.log-mine` - what you played or discarded, and the
events your play caused. A filter that removes the line you just made is a
filter that lies about your own turn. The reshuffle and the independence gate
are excluded from `.log-mine`: you did not choose them - an independence's
`playerId` is only the seat whose turn-start clock noticed the recovered
defenses - and they are the noise the filter exists to remove.

Pinning a land filters the log to that realm: the pinned faction plus the
lands incorporated into it (`incorporatedRealmOf`), never vassals - a vassal
acts on its own and is watched by pinning it, which is also why a click on an
incorporated land pins the owner and a click on a vassal pins the vassal
(`pinnedFactionId` in src/main.ts, the same `politicalFactionForPolygon` card
targeting uses). While the pin holds, the checkbox row reads "Filtered to X"
and the "Targeting me" pref is suspended by CSS, untouched in storage
(`applyRealmFilter` in src/hud.ts). The same `.log-mine` exemption applies,
and a play and its consequences show or hide as one unit - any line of the
batch naming a member keeps the whole batch, the indented-under-nothing rule
again.

## A consequence is indented under the play that caused it

`playCard` builds one batch per play, the `play` event first and everything that
play caused pushed onto it, and no other caller opens a batch with a `play`. So
"caused by this play" is exactly "not first in a batch that starts with a play",
and `appendEvents` reads it off the batch's shape into `consequence` - the same
choke point that stamps `actorRuler`. Do not set it in a card branch. Fourteen
branches restating the same fact is the drift the `amount` rule above already
warns about.

`nestsUnderItsPlay` decides which event types nest, as an exhaustive switch with
no `default`, so a new `GameEventType` stops compiling until somebody classifies
it. Endings (`victory`, `defeat`, `unified`) are excluded on purpose: a play can
win the run, but the run's last line is a headline, not a sub-item.

The "Targeting me" filter must never show a consequence indented under nothing.
A rival's Great raid is not aimed at you, so its `play` is neither notice-worthy
nor `.log-mine`, while the `damaged` it landed on your polygon is - `renderLog`
therefore tags the play `.notice-cause` and the filter exempts it. Any new
reason for the filter to hide a line has to answer the same question.

## Two realm sizes, and only one of them is a score

`src/relations.ts` spells "F's realm" twice, and the two are not
interchangeable:

- `realmOf` is what F holds **directly** - itself, its vassals, the lands it
  incorporated. One level out. This is wanted only where one fealty link is
  the subject: the vassal stripe overlay in `src/main.ts` (stripes show who a
  land DIRECTLY answers to) and the Incorporate scoring in `src/ai.ts`
  (digestion keeps the target's annexations and frees its vassals, so the
  direct holding is what turns permanent).
- `fullRealmOf` is **every land under F**: chains of vassalage walked to any
  depth - vassals may Subjugate, so a vassal can have vassals - plus each
  member's own annexations. This is the answer to "how much of the map is
  theirs", so it is what the scoreboard, the win condition, the postmortem,
  the ownership shading and the hover halo count. It is also what every rule
  that scales with "the realm" uses: `reachOf`, `attackReach`,
  `borderPolygonsOf` and `handLimitFor` in `src/playability.ts` - taking a lord
  takes its whole pyramid, and a grand-vassal's border is the pyramid's border.

The flat version shipped and rotted exactly where you would expect. At turn 35
the scoreboard read `You 3/15 lands` while four polygons sat inside the player's
realm. The fourth was Jersika, annexed by the Eastern Aukštaitians, who were the
player's vassal. Four things drew it as theirs - the union outline and its seam
removal, the hover halo, the vassal stripes in their own colour, and the hover
line "Incorporated into Eastern Aukštaitians, itself your vassal" - while the
score and the win condition walked one level and refused to count it.

So the test to apply to a new caller is not "which function exists" but **which
question is being asked**. If the answer is a number the player can check
against the map, it is `fullRealmOf`. Getting this wrong is not a rounding
error: it silently moved the win condition, and it put a land inside a player's
own outline that their score would not count.

## A card's rules are read in the column, never over the map

There is ONE `.card-panel`, in `hud-left`, for the whole hand. Which card it is
about is one rule in `shownCardIndex`: the card under the pointer or the
keyboard, else the armed card, else none - so the card being aimed keeps its
rules text and its target list up while the pointer is out on the map, and no
card's text ever stands on the lands being chosen between. Hover outranks
armed deliberately: a player may still want to read another card in the fan,
and letting go of it returns the panel to the card the map is asking about.

Three things about it are load-bearing:

- **It rebuilds, it does not linger.** The block reason, the modifiers, the
  odds and the target list are all answers about the board AS IT STANDS, so
  `renderHand` and `setArmed` both end in `renderCardPanel`. `scrollTop`
  survives a rebuild of the same card and resets on a different one.
- **`renderHand` clears the hovered index.** A replacement under the pointer
  gets a fresh `pointerenter`, but a detached element never gets its
  `pointerleave` - an index held across a re-render is how the panel ends up
  describing a card that has been played.
- **The panel counts its own hover.** It was a child of the card button, so
  reaching for its scrollbar kept `.card:hover` true. In the column it has to
  hold itself open, or a panel long enough to need scrolling closes the moment
  somebody reaches for it. It also stops its own clicks: it is over the map
  now, and a click that fell through would pin the land underneath.

An untargeted card needs no case: the click plays it, the hand re-renders
without it, the hover clears, the panel closes. The `disabled` attribute the
fan puts on a dead hand does not suppress `pointerenter` in Chrome, which is
what lets a player still read their cards while the AI round resolves.

The 2026-08-15 docked-card-panel spec in docs/superpowers/specs has the
reasoning, including why the right edge was not available.

## A dark box states its own text colour

`.deck-screen` and the notice overlays are dark; the build tiles and the
buttons on top of them are light. Text that declares no colour inherits the
browser default black, which is invisible on the dark half. So: a container
with a dark background declares `color`, and a class shared between a light
box and a dark one is scoped to each rather than left to inherit.

This shipped, in the meta era: a dark card box cloned from a light one left
the `color` behind, and every revealed card's title was black on `#1b1710`.

Which is also the reading rule for screenshots: when you take one, read the
text in it before moving on. That pass missed the black-on-dark hole because
the screenshot was checked for layout and never read.

## The build screen states everything, and the actions stay outside the scroll

Each build tile (`.ds-build` in `src/style.css`) carries every card of its
build with full rules text, so the choice is read at a glance rather than
hovered card by card - the deck picker's rule, carried over. The tile row
(`.ds-builds`) is the scroll region on a short window, and **everything the
player acts on stays outside it** - the rules row and Choose your lands. The
bug this guards against was that button clipped off the bottom of a short
window with `#app` at `overflow: hidden`, i.e. unreachable.

## The human's turn ends when their card lands, not when they click

`afterHumanAction` must not resolve AI turns until the played card has finished
flying. Input is locked for the whole of that window: no second play, no map
clicks. `Hud.afterPlayAnimation` owns the timing and always fires - once - even
when nothing flew (a forced discard animates nothing) and even if the flight
somehow never reports itself finished.

**"May the player act" is a TABLE, and it lives outside this app.**
`actionBlock` in `src/gates.ts` answers it for every `PlayerAction` - play,
end-turn, surrender, keep-playing, map - as an exhaustive switch with no
`default`, and it is read by the handler that performs each action AND by the
control that offers it. `src/main.ts` supplies the screen's own state as
`ScreenFacts`; `src/hud.ts` asks through one `actionBlocked(action)` callback
and derives `HudAction` from `PlayerAction`, so the two cannot drift into
disagreeing about what exists.

**Its own pure module, and that is the point.** Nothing loads `src/main.ts` in
a test, so a rule living there is a rule nobody can check - and "the handlers
and the controls read the same thing" is exactly the claim that had rotted.
`tests/gates.test.ts` now checks it, and `tests/hud.test.ts` checks that each
control's `disabled` tracks the callback.

**The rule that makes it hold: anything the HUD cannot derive from `GameState`
must be behind the table.** `screenBusy` (a transition showing a move, an
animation running, the wire owed an answer, the other human on turn) and the
questions this screen has raised itself (`pendingHarvest`, an owed conquest)
are all module state in `src/main.ts`. Spelled at the call sites - which is
where the last two were, on `onPlayCard`, `onEndTurn` and the keydown handler -
the renderer draws from four terms while the click is refused on six. At turn
62 of a real run every card rendered playable, hovered, lifted, and did nothing
when pressed: no modal, no message, no line in the log, and no way back, since
nothing is persisted. Terms the HUD CAN derive - whose turn it is, whether the
turn is open - are computed on both sides from the same state and cannot
disagree about anything unseen.

**A table and not one boolean, because two actions must NOT be blocked by an
owed conquest.** Folding every reason into a single predicate was tried and it
made Keep playing dead in precisely the case it exists for - a victory read at
a turn start is usually a victory won BY a conquest, so the defender question
is owed exactly when that button matters - and it took Surrender with it. A
gate that removes the controls for escaping a stuck run is not a gate, it is a
trap.

The one thing a derived answer costs, and it is a real cost: a paint made
while it is blocked draws a locked screen, and nothing repaints when it clears
on its own. So every path out of the locked window repaints on its way out -
`finishChain` and `afterHumanPlay` both wait for the animation queue to drain
and then `refresh`. A stage of the lifecycle that leaves the screen locked with
no repaint behind it is a hand that stays greyed until the player hovers
something. The two question terms are not owned by a queue, so they owe their
paints by hand: `openHarvestModal` repaints on the way IN and its `onCancel` on
the way out, and the conquest question is raised inside the `ask` stage, which
has already painted twice behind it.

## Every visible sequence goes through one queue

`animations` in `src/animate.ts` is a module singleton, and everything the
player watches is pushed onto it: the turn-start draw, the played card's
flight, the turn-start replay's steps, the harvest reveal. One step at a time,
in the order asked for, nothing overlapping - which is the whole point, because
two sequences drawn at once are two sequences the player cannot read.

The queue is why "is anything flying?" is not the same question as "is anything
still to be drawn?". A card asked for while an earlier step is running has not
flown yet, and a gate that only counted live flights would release the turn
over a card still in the player's hand. Count what is QUEUED as well - see
`playPending` in `src/hud.ts`. A step that throws releases the queue rather
than wedging the game, and `clear()` drops what has not started while leaving
the running step to clean up its own DOM.

## The round replays itself at the player's turn start

Everything that resolved while the player was not holding the map is SHOWN,
one thing at a time, before the round-summary modal: the camera glides to the
land (`focusOn` on `InteractionHandle` - pan only, cancelled by any pointer or
wheel input), a label fades in and out, the event's sound plays. Each event is
one step on the `animations` queue, so nothing overlaps.

**The replay is stage 1 of the transition that carried the events**
(`present` in `src/main.ts`'s `stages`, and `queueBeats` below it), so it runs
against the board the player was last shown and the commit that repaints that
board waits behind it. Everything it reads comes off the transition rather than
off the displayed state - the events, the realm, the arrows still standing, the
standings walk - because the state those events land in is not the one under
the map yet. That ordering is what makes the round summary the round's
epilogue rather than a cover over it: the summary is stage 4, raised after
`commit` and `ask` have both run, so by the time it rises the camera has
already finished visiting everything it is about. It parks only behind the
local seat's own card flight (`hud.afterPlayAnimation`), and its `done` does
not fire until the player dismisses it - which holds `ending` and every
transition queued behind this one for as long as the modal is on screen.

`PRESENTATION_RULES` in `src/presentation.ts` is the classification,
exhaustive over `GameEventType` in the `NOTICE_RULES` shape: a type is either
`presented` (returning the beats one of its events earns) or `never` with a
sentence saying why and where its sound plays instead. Labels are segments,
never template literals - the rich-text rule applies to this surface too, and
`tests/presentation.test.ts` checks it.

**A label names both ends and points at neither.** It is a banner centred over
the whole map, not a tag pinned to the polygon, so "here" and "this land" named
nothing the player could resolve - the only thing tying the sentence to a place
was a glow the camera does not always move for. Every label therefore states
who was acted on (`landOf`, the land the beat is about, which every one of them
names) and who did it, actor first. The instigator is not always the seat that
moved: a land changing hands names its new lord, an army names the land it set
out from, and a status firing names the status, because those are what the
player watched happen. Two labels name one party on purpose - a realm building
or mending on its own ground (`onItsOwn`), and a standoff, whose two ends are
the axis's own SORTED ends and where naming either one the attacker would be
right by alphabetic accident. The score suffix beside a label is
`changeImpact` over the beat's own badge walks, which are one event's slice of
the same walk the log renders its suffixes from, so the two cannot quote
different numbers. Who earns a beat is ONE audience gate,
`involvesLocalSeats`: a seat this screen plays did it or stands at either end
of it, it lands on a land the screen has a LINE to - the realm, plus whatever
stands at the far end of an arrow or a demand between them and it
(`linkedLands`) - or the screen owes an answer about it. A line, not a reach:
this was realm-plus-`attackReach` and it walked the camera around a wide ring
of business that was none of the player's. A wild land mending itself matters
while an arrow of yours is in the air toward it, because it changes what that
arrow will do; the same land mending itself with nothing between you is a log
line.

**A score change is shown by the badge walk and by nothing else.** There is no
coloured number rising off a polygon anywhere in the game: `floatScoreMarks`
and its half of the bookkeeping are deleted, because two ways of showing one
fact is two gates, and the one that got skipped was the one with a gate on
it - the floats had none, and on a paint that presents nothing 74 of them
appeared at once. A beat that moved a score carries `BadgeWalk`s and walks
them. A consequence of the player's OWN play (`causedHere`) earns no beat at
all when it moved no score - nothing to walk and nothing to say - and earns
the badge walk alone when it did: no camera, no glow, no label, because the
player is already looking at the land they aimed at and a badge is drawn as
though it had always been that number. The one gap is a caused beat on a land
`renderThreatBadges` draws no badge for at all (annexed, full defense,
disease-free): the number has nowhere to move there, so the sentence that
would otherwise have been dropped is raised instead, as `causedLabel` -
`effectiveBeatLabel` is the one reader, asked once in `src/main.ts` at the
moment the beat runs, because whether the badge exists is a DOM fact the
classifier itself does not have.

**The beat shows one event, and the map shows nothing else that moves.** The
land is lit for the length of the beat (`.replay-focus`, a filter glow rather
than a stroke, because `.region.realm-member` declares its seam !important),
and its badge is walked from the score it HAD to the score it has. Without the
mark a label was a sentence about nowhere, since the camera holds still for
anything already on screen; without the badge walk the number had been showing
the outcome since before the player was shown the event.

The arrows are the one thing on the map a beat does NOT quieten: nothing is
hidden while one runs. What the beat takes off the board is exactly the
marches it retires (`Beat.retires`, subtracted from the drawn arrows by
`beatRetired` in `src/main.ts`), and what it stands on the border in their
place is a lane in the same block as the arrows still crossing there - so the
landing is told apart from the board around it by where it stands rather than
by everything else being taken away. The board the player was last shown stays
on screen under the explanation of what just happened to it, which is the
arrow rule five hundred lines above: an arrow fades in when it is declared and
out when it goes, and never blinks.

**The AI chain is walked a seat at a time.** `oneAiSeat` plays exactly one
seat and `stepAiChain` in `src/main.ts` submits what it did as one transition
- `runAiSeats` is the same loop for callers that want the whole round at once,
built on the same function so the two cannot drift. A round resolved in one
statement and replayed afterwards was the right sequence of events drawn over
the wrong board: arrows declared two turns later stood on the map while a raid
from before them was still landing.

**The seat after this one is submitted by the waiter this one arms**
(`transitions.onIdle`), never by an animation callback and never by a timer.
One seat is one transition, and a transition does not finish until everything
it owed the player has been shown - so "the next seat may move" is exactly
"the queue has drained", and nothing has to remember to hold it back. The
queue starts a waiter's own transition as a sibling iteration of its drain
loop, which is what keeps a round of seats that animate nothing a loop rather
than a stack as deep as the round is long.

**A conquest question is stage 3, ask, raised after the commit.** By the time
it runs, the transition's `present` stage has already shown the land being
taken, so the modal follows the picture of the thing it asks about rather than
landing over it. It cannot be raised any earlier than the commit: the answer is
a `transferDefense` decision validated against the state it is applied to, and
before the commit that state still says the conquest has not happened, so the
defenders would silently never move.

**Nothing resolves behind that modal because the stage itself will not finish
without an answer.** `ask`'s `done` is the callback `askTransfer` hands to
`hud.showTransferOffer`'s `onConfirm` - it does not fire on its own, so
`summary` and `ending` cannot run and the queue cannot start the next
transition until the local seat answers, `transitions.busy()` (folded into
`inputLocked`) staying true across the whole wait. The one arrival the stage
cannot cover is the state a page BOOTS on: it is folded into the queue's
initial state ahead of any transition, `?turns=` included, so it owes an `ask`
nobody has run for it. `localTransferPending()` is that same rule spelled out
explicitly at `onPlayCard` and `onEndTurn`, and at the boot path itself, which
calls `askTransfer` by hand once the page has painted - because there, for
once, there is no stage to ask it.

An arrival that `metNothing` is passed over here for the reason
`NOTICE_RULES` passes it over: the `subjugated` it caused names the same card
and says what became of the land, so replaying both would send the camera to
one polygon twice for one arrival. Which is also why a standoff is asked as
"a `clash` and no `amount`" rather than "no `amount`" - the two shapes differ
only in the `clash`, and conflating them called an army that walked into an
empty land a raid that had been answered.

The 2026-08-10 resolution-replay doc in docs/superpowers has the full
reasoning, including why the old concurrent clash flash became sequential.

## Sound is one table, one gesture-gated engine

`src/audio-manifest.ts` is pure data: `SOUNDS` (name -> file under
`public/audio/`, all CC0, provenance in that directory's manifest.md, mp3
because Safari decodes no Vorbis) and `EVENT_SOUNDS`, exhaustive over
`GameEventType` - a null is a decision whose reason lives in
`PRESENTATION_RULES`, either as a `never` reason or as a rule that names its
own sound.
`src/audio.ts` builds the `AudioContext` only inside `unlock()`, wired to the
first pointerdown/keydown in `src/main.ts`; every other call no-ops without a
context, which is why the test suite needs no audio mocks and why nothing
audio may be constructed at module load or in `createHud`. A missing file
degrades to silence with one console warning, never a throw. The mute
checkbox rides `MetaStorage` under `AUDIO_PREFS_KEY` - its own key, not a
`LogPrefs` field, because the boot path replaces the whole `LOG_PREFS_KEY`
record. Where a sound cues from: every beat cues its own inside its queue step, the
map beats and the card motions alike; the local seat's events that earn NO
beat cue in `cueUnpresented` at the commit; endings cue on the phase change in
`cueEndingIfAny`, off the LOCAL seat's `guestPhaseView`-mapped phase.

## Never re-derive an animation's duration

Game logic waits on the animation reporting itself finished, never on a second
timer set to the same number. `src/animate.ts` drives flights with the Web
Animations API and gives callers a callback (`onDone`) and, at most, a `totalMs`
to derive a last-resort deadline from - never a duration to copy into a second
`setTimeout`.

This rule exists because the codebase already had two instances of the drift it
prevents: `RESHUFFLE_PULSE_MS = 450` in `src/hud.ts` was a hand-copy of
`animation: pile-pulse 400ms` in `src/style.css`, and the two had already gone out
of sync; and `animateDraw` un-hid the drawn card on a hardcoded `DRAW_MS + 40`
instead of on the flight it was shadowing. Both were fixed by making the
animation itself the source of truth.

## Card changes

The repo `AGENTS.md` card rule applies: a `POLICY_COVERAGE` branch, a
discovery route, then play it. The harvest pool IS the discovery route now: a
deck-buildable card belongs to `BUILDS` or falls into `NEUTRAL_POOL` (derived,
in `src/cards.ts`), and either way every seat can reach it through the offer.
Also add a `NOTICE_RULES` entry for any new `GameEventType` - the exhaustive
`Record` will refuse to compile until you decide modal or silent and write
down why - and record `amount` on any event that moves a defense score or a
disease stack, or the before/after suffixes silently drift.

A card-behaviour change also moves the wire fingerprint, which is the point:
two deploys whose damage tables differ must not shake hands. A new field on
`CardDef` is classified by `CARD_FIELD_KIND`, and a new TABLE a card's
behaviour is read out of joins `CARD_RULES` in the same change - `cardRulesHash`
covers exactly what those two name.

**A card that belongs to a class joins the class's set, and every surface asks
what the card IS.** `ATTACK_CARDS`, `MARCH_CARDS`, `SINGLE_LAND_HEALS`,
`INWARD_CARDS` and `KEYWORDS` (with `keywordHas`) are those sets, in
`src/cards.ts` - and a rule that reaches a class of cards belongs on a keyword
flag rather than on a set of its own, so the card says which classes it is in
and the class says what that means. A
surface that names a card by literal answers for one member and not the class,
and the failure is silent: Strong raid shipped never asking the player which
land its army left from, and three of the four inward cards resolved a click
politically, which on an incorporated land aimed at the annexer's home rather
than the land under the cursor. Heal amounts are the same rule one level down -
`SINGLE_LAND_HEAL` in `src/defense.ts` is read by the play AND by the hover, so
the preview cannot promise what the card will not do.

A card marked `secret: true` needs two more things checked, because neither is
a type error. It must **move no score** - `impactText` prints the
`(Defense -1 -> 5)` suffix beside the line whatever the name says, and a
suffix names the card in all but words. And it must have a **reveal clause**
in `revealedSecrets` (src/hud.ts) saying when the card stops being secret, or
it is hidden forever and the log will contradict what the player has plainly
seen happen. Both live in the doc comment on `CardDef.secret`; the 2026-08-01
secret-cards design doc has the reasoning. The secret set is pinned to the
GUARDS identity in `tests/cards.test.ts` so it cannot grow without somebody
reading this.

Rarity is suspended for this roster: every card is `common`, hand-tagged, per
the 2026-08-08 defense-score design. `npm run rarity` is not run until the
later balance pass; the tier table stays in `src/cards.ts` for when it
resumes.
