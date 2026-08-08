# AGENTS.md

Baltic Tribes. Plain TypeScript + Vite, no framework, imperative DOM. `npm test`
and `npm run build` must both pass before committing. Verify in a browser through
the root dev server at `http://127.0.0.1:4173/prototypes/` - not this prototype's
own bare root; see the repo `AGENTS.md` for why.

Specs and plans live in `docs/superpowers/`. Read the relevant one before
changing the code it describes.

## A browser check boots straight into the state it checks

Query params replay the real transitions, so checking something is one
navigation and the same URL gives the same run every time:

    http://127.0.0.1:4173/prototypes/02/?seed=7&faction=selonians&build=warpath&turns=5&defense=selija:100

- `seed=N` - seeds the rng.
- `build=warpath|pestilence` - the build screen's pick. Omit for warpath.
- `screen=deck` - stops on the build screen instead of picking for you. The
  one stop that must be asked for: `chooseBuild` runs whether or not `build=`
  was named, so nothing else leaves the phase at `deck-building`.
- `faction=id` - a **faction** id, not a region id (`selonians`, not `selija`).
- `turns=N` - plays N rounds with the AI policy on every seat, then hands back
  on your turn.
- `hand=a,b,c` - replaces your hand.
- `defense=selija:100;talava:0` - polygon defense overrides, clamped into
  [0, max]; a value at or above max deletes the key (absent = pristine).
  Polygon ids are the land's own faction id.
- `disease=talava:selonians:3` - `polygon:owner:count` stacks.
- `leadership=selonians:100` - ruler leadership overrides.
- `turnips=N` - the human's turnip counter, clamped under the threshold (5).
- `wealth=N` - the human faction's treasury.
- `rules=turn:unlimited` - rule picks, `axis:option` pairs separated by `;`.
  An unknown axis or option is dropped; an omitted axis keeps its default.
  The pick also seeds the booted page's rules preference. A pre-flip URL
  naming the retired `copies` axis still boots - the unknown-axis rule drops
  it, and `rel=`, `deck=`, `known=` and `xp=` are simply not boot keys any
  more.
- `popups=off` - sets the existing "Show popups" log pref.

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
does and where Selonians are - in a game with 14 cards and 30-odd factions, on a
modal that appears once and is dismissed.

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
`src/data/map.json`.

## The AI's round is one modal, one line per event

Do not add a second modal, and do not restore the three-paragraph notice format.
One `Continue`. One line per notice-worthy event: what card, who did it, and the
score it moved, as `(Defense -150 -> 450)` or `(Disease +1 -> 3)`. Rules
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
`(Defense -150 -> 450)` suffix. The modal and the log therefore cannot quote
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
  that scales with "the realm" uses: `reachOf`, `attackReach` and
  `borderPolygonsOf` in `src/playability.ts` - taking a lord takes its whole
  pyramid, and a grand-vassal's border is the pyramid's border.

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

A card marked `secret: true` needs two more things checked, because neither is
a type error. It must **move no score** - `impactText` prints the
`(Defense -150 -> 450)` suffix beside the line whatever the name says, and a
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
