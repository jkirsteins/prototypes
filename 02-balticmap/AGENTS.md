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
- `march=jersikans>selonians;semigallian-confederacy>selonians` - declare an
  attack already in flight, `from>to` per arrow. Declared through the real
  rules, so a source with no free army or a target it does not border is
  dropped rather than conjured, and the damage is whatever a Raid out of that
  land would actually deal.

**Every polygon id above is the land's own FACTION id**, not the region id -
`selonians`, not `selija`. The two id spaces are different words for the same
land ("Selija" the land, "Selonians" the people) and only the faction id is
what `factionIds`, `defense`, `armies` and `marches` are keyed by. This
section used to show `defense=selija:100`, which silently parsed and then
dropped: `applyBootParams` skips a clause naming no known faction, so a wrong
id boots a perfectly ordinary game and says nothing.
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
  (`freeArmiesFor` - a march holds one of its source's until it lands). A
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
  the board.

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

## Every visible sequence goes through one queue

`animations` in `src/animate.ts` is a module singleton, and everything the
player watches is pushed onto it: the turn-start draw, the played card's
flight, the march-resolution flashes, the harvest reveal. One step at a time,
in the order asked for, nothing overlapping - which is the whole point, because
two sequences drawn at once are two sequences the player cannot read.

The queue is why "is anything flying?" is not the same question as "is anything
still to be drawn?". A card asked for while an earlier step is running has not
flown yet, and a gate that only counted live flights would release the turn
over a card still in the player's hand. Count what is QUEUED as well - see
`playPending` in `src/hud.ts`. A step that throws releases the queue rather
than wedging the game, and `clear()` drops what has not started while leaving
the running step to clean up its own DOM.

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
