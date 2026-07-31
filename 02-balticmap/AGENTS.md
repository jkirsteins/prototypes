# AGENTS.md

Baltic Tribes. Plain TypeScript + Vite, no framework, imperative DOM. `npm test`
and `npm run build` must both pass before committing. Verify in a browser through
the root dev server at `http://127.0.0.1:4173/prototypes/` - not this prototype's
own bare root; see the repo `AGENTS.md` for why.

Specs and plans live in `docs/superpowers/`. Read the relevant one before
changing the code it describes.

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

`tests/naming-convention.test.ts` is what enforces it, because prose did not
work - the same lesson `POLICY_COVERAGE` records in the repo `AGENTS.md`. It
drives every event type through the log and the round summary and fails if any
plain-text segment contains a card name from `CARDS` or a faction name from
`src/data/map.json`.

## The AI's round is one modal, one line per event

Do not add a second modal, and do not restore the three-paragraph notice format.
One `Continue`. One line per notice-worthy event: what card, who did it, and the
standing it moved, as `(Status +1 -> 0)`. Rules consequences that are not tied to
one event - the Pay tribute injection, the shrunk-realm subjugation bar - go in
the footer block under the list, deduplicated, not appended to a line.

**Standing numbers are always the human's signed lead over the other side**,
positive = you lead, formatted by `formatLead` in `src/view.ts`. This is the same
convention as the map badges, the hover tooltip and the scoreboard.

## The activity log says what happened, and never hides your own turn

The log carries the same numbers, from the same walk. `renderLog` runs
`walkStandings` over the fresh batch through `walkCtxOf` - the identical context
`buildRoundSummary` uses - and `impactText` renders one event's slice as the
`(Might +1 -> 2)` suffix. The modal and the log therefore cannot quote different
numbers for the same event, and a test asserts they do not. A card that moves no
track gets no suffix: its name is a hoverable segment that already says what it
does.

Two things this deliberately does not do. The suffix is **not** a `Segment` and
does not live in `eventSegments`: the postmortem log renders those segments over
a whole finished game, with no batch to walk, which is also why the `garrisoned`
line keeps its own "+N Might against all" inline and `impactText` returns null
for it. And the "Targeting me" filter never hides an entry tagged `.log-mine` -
what you played or discarded, and the events your play caused. A filter that
removes the line you just made is a filter that lies about your own turn. The
automatic garrison tick and the reshuffle are excluded from `.log-mine`: you did
not choose them, they fire every round, and they are the noise the filter exists
to remove.

## A dark box states its own text colour

`.deck-screen` and the notice overlays are dark; the deck picker's card boxes and
the buttons on top of them are light. Text that declares no colour inherits the
browser default black, which is invisible on the dark half. So: a container with a
dark background declares `color`, and a class shared between a light box and a dark
one is scoped to each rather than left to inherit.

This shipped. `.ds-pack-card` was cloned from the light `.ds-card`, took the dark
background and left the `color` behind, so every revealed card's title was black on
`#1b1710`. Its "already known" tag, the pack count and the "Click to open" hint had
the same hole.

Which is also the reading rule for screenshots: when you take one, read the text in
it before moving on. The browser passes over the pack overlay missed this because
the screenshot was checked for layout and never read.

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

The repo `AGENTS.md` card rule applies: a `POLICY_COVERAGE` branch, a discovery
route, then play it. Also add a `NOTICE_RULES` entry for any new `GameEventType`
- the exhaustive `Record` will refuse to compile until you decide modal or
silent and write down why - and record `amount`/`track` on any event that moves
a relation counter, or the before/after standings silently drift.
