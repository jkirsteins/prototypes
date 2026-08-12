# One transition queue, one presentation intake

2026-08-11. The turn-start replay, the score floats, the card flights and the
round summary are four systems that each re-derive "what should the player be
shown" from a diff of `game.log`, with four different gates and two different
cursors. This replaces them with one intake, one classifier and one queue.

## What is actually broken

Measured in a browser against the running game, not inferred.

- **The resolved-march ghost prints a green `+1`.** `flashMarchResolution`
  (src/main.ts:1711) labels the ghost `+${amount}` and
  `.clash-flash.clash-good .clash-label` (src/style.css:1514) fills it
  `#2e7d32`. A raid landing produced a `clash-label` reading `+1` at
  `rgb(46, 125, 50)` at the same instant as the replay label reading
  `Raid lands here (Defense 7 -> 6 (-1))`. One fact, two numbers, opposite
  signs, opposite colours.
- **Score floats are drawn at decision time and animated at queue time.**
  `floatScoreMarks` (src/main.ts:1032) appends the `<text>` nodes to the live
  SVG immediately and pushes a step that only animates them later. Timeline
  from one End turn: at 108ms five `-1` marks were in the DOM at opacity 1
  with zero animations running; they held still until 1826ms and cleared at
  2938ms. For 1.7 seconds the map carried five stale marks belonging to other
  lands' raids, on top of the one event the replay was isolating.
- **The floats have no audience gate and no animate gate.** Those five marks
  were grey-on-grey raids with nothing of the player's at either end.
  `floatScoreMarks` iterates every fresh event and skips only indices the
  replay claimed, and it runs outside the `animate` flag. On a `?turns=8`
  boot, which paints `animate: false` precisely so history is not re-enacted,
  74 floats appeared at once and held the map for a full second.
- **Arrows have no identity.** `renderArrowScene` opens with
  `host.replaceChildren()` (src/arrow-scene.ts:214), so every arrow is
  destroyed and recreated on every `refresh()`. One End turn produced 190
  arrow add/remove mutations. Nothing can fade because nothing survives a
  frame.
- **A rival declaring an attack on you is shown by nothing.** `declareMarch`
  (src/game.ts:2036) deliberately emits no event; the only record is the
  `play` event, which `REPLAY_RULES.play` passes over. A CPU aiming a raid at
  your land gives you no camera, no label, no sound, and an arrow that pops
  into being on the next repaint.
- **The continuation gate is half a gate.** `settleTurn` (src/hud.ts:2108)
  waits on `animations.busy()` only when a round summary is parked. A round
  that queues replay steps but raises no summary fires its continuation
  immediately, so `stepAiChain` mutates the board while the replay is still on
  the queue.

### The one root cause

There is no single answer to "what does the player get shown for this event".

| surface | gate | cursor |
|---|---|---|
| log lines (`renderLog`) | `isObservable` | `renderedEvents` |
| flights and sounds (`animateEvents`) | local seat, keyed on event *type* | renderLog's |
| camera, label, ghost, badge walk (`queueReplay`) | `REPLAY_RULES.applies` | renderLog's |
| score floats (`floatScoreMarks`) | none | `floatedEvents`, its own |
| round summary | `isNoticeWorthy` | renderLog's |

The replay and the floats coordinate only through `replayedIndices`, a
module-global set of absolute log indices written in `queueReplay` and read in
`floatScoreMarks`. It is correct only while `floatedEvents === renderedEvents`,
and when they diverge it does not fail loudly: it suppresses the wrong event's
mark. The 74-float boot is that divergence (`renderedEvents` at 238,
`floatedEvents` at 0).

The exhaustive-record discipline this codebase uses well covers
*classification* and not *dispatch*, which is why a fourth surface could be
added answering the same question differently and nothing complained. There
are no tests touching `floatScoreMarks`, `floatFor`, `floatedEvents` or
`replayedIndices`, and `src/main.ts` has no test file at all.

## Shape

### 1. A transition is the unit, and there is one queue of them

    interface Transition {
      /** The state after this transition. */
      next: GameState;
      /** Exactly the events this transition appended, in order. */
      events: GameEvent[];
      /** History: commit it, present nothing. A boot, a deal, a rejoin. */
      settled: boolean;
    }

`src/transitions.ts` owns the queue AND the state. Nothing else holds an
assignable binding to `game` - see section 2.

#### The displayed state lags the transition

**The state on screen stays `previous` for the whole of a transition, and
`next` is committed when its beats have finished.** Classification receives
both, so a beat knows what moved without the map having shown it.

This is the rule that makes "a beat that has not run has drawn nothing" true.
Committing first and presenting afterwards is precisely today's bug: the badge
opens showing the outcome of an event the player has not been shown, which is
why `walkBadgeScore` has to step the number backwards before walking it
forwards. With the commit deferred, the badge is already showing `before` and
the beat simply walks it to `after`. The backwards step goes away.

The transition's lifecycle, in order, and this is the whole contract. The
classifier returns every beat in one `Beat[]`; the lifecycle partitions them by
kind and runs each kind at its own stage.

1. **Transient beats.** The `map` and `hud` beats, one at a time, on the
   animation queue, against the board as it stood.
2. **Commit.** `next` becomes the displayed state; every persistent layer
   repaints.
3. **Questions.** Each `ask` beat re-frames its land, raises its modal, and
   waits for the answer.
4. **Summary.** Build any round summary from `NOTICE_RULES` over this
   transition's events and show it; wait for dismissal if it blocks.
5. **Ending.** If this transition ended the run, cue its jingle and raise the
   postmortem.
6. **Complete.** The next transition may start.

**Questions are after the commit, and that is a correctness requirement rather
than a matter of taste.** A conquest question is *about* state that exists only
in `next` - `pendingTransfers` is written by `takeLand` - and its answer is a
`transferDefense` decision that `commitDecision` validates against the state
accessor. Raised at stage 1, the modal would ask about a conquest the accessor
still says has not happened, and the answer would be refused. The camera
property today's `queueTransferQuestion` has is kept by the beat carrying its
polygon and stage 3 re-framing it, so the question still follows the picture of
the thing it is asking about.

Stages 4 and 5 are what fold the round summary and the ending into this queue
instead of leaving them owned by a second scheduler and by a repaint. The "AI
behind the modal" problem stops being a rule `settleTurn` has to remember and
becomes a stage nothing can run past.

**The ending is a stage and not a phase reader.** Today `cueEndingIfAny` fires
from `refresh` off the committed phase, and `hud.update` shows the postmortem
whenever the phase is `victory` or `defeat` - so with the commit at stage 2 the
ending screen would rise over questions and beats still to come, and "View the
map" behind it would show a board with raids still standing on it. So the
postmortem stops being derived from `phase` in `hud.update` and is raised by
stage 5, and `cueEndingIfAny` moves off `refresh` to the same place. A run that
ended is shown its ending once everything that ended it has been seen.

A `settled` transition skips stages 1 and 4 and runs 2, 3, 5, 6 - it presents
nothing and shows no round summary, since it was never watched happen, but it
still runs `ask`: a state nobody watched happen still owes its questions, and a
seat owing an unasked one can neither play a card nor end its turn. So a guest
rejoining a finished game is shown the ending immediately, with no history
re-enacted, but a guest rejoining mid-conquest is asked the question the
connection dropped before it landed.

**One consequence worth naming: `submit` never blocks.** A beat may itself
produce a transition - an `ask` beat's answer commits a `transferDefense`
decision - and that transition is simply enqueued behind the current one. The
ask beat then releases and the round carries on. Nothing waits on anything a
later transition will produce, so an `ask` cannot deadlock the transition that
raised it. The defenders arrive as their own beat in their own transition,
which is also the honest picture of what happened.

**And the arrow layer is why the commit does not pop.** The retained scene is
keyed by march id (section 6), so a `march-declared` beat inserts the arrow
under the key `march:<id>` and fades it in; when step 2 repaints from `next`,
that key is already present and is re-laid-out rather than re-created. The
commit stops the state disagreeing with the screen; it does not redraw it.

**The host's AI chain and the guest's update stream become the same loop.** On
the host, entries are produced by `oneAiSeat`; on a guest, by arriving `update`
messages; on any screen, by the local player's own committed decision. That is
what makes the guest not a branch at the call site, the same doctrine
`commitDecision` already establishes for decisions.

This lives in its own module and not in `src/main.ts` deliberately: `main.ts`
has no test file, and the ordering rules here are exactly what a test must
pin. `main.ts` keeps the wiring and the DOM.

### 2. Three producers, one intake

There is no pretence that everything arrives through one mutator. Network
updates are a real second producer and a snapshot is a real third, so the
intake takes all three explicitly:

- **Local mutation.** Capture `log.length`, run the engine call, submit
  `{ next, events: next.log.slice(before), settled: false }`.
- **A guest `update` message.** The protocol already carries exactly the right
  thing: `newEvents` and `logFrom` (src/net-protocol.ts:70-71). Submit
  `{ next: deserialized, events: msg.newEvents, settled: false }`.
- **A `start` or `snapshot` message, and the boot path.** Submit
  `{ next, events: [], settled: true }`. Settled history presents nothing and
  the cursor jumps, which is what `animate: false` was reaching for and
  failing to hold.

**The enforcement is ownership, not lint.** Biome's `noRestrictedImports` can
forbid `src/main.ts` from importing the engine mutators, and it already does -
but it cannot forbid an assignment to a local `let game`. So `main.ts` stops
holding one. `src/transitions.ts` owns the state and exposes exactly three
things: a read accessor for the displayed state, `submit(transition)`, and
`replaceSettled(state)` for the snapshot and boot paths. With no assignable
binding in `main.ts`, there is no path that appends events without presenting
them, and that is a fact about the module boundary rather than a rule somebody
has to keep.

#### `replaceSettled` cancels, it does not merely clear

A snapshot can arrive while a beat is mid-flight, and that beat's completion
callback still holds the `next` it was going to commit. Clearing the pending
queue is not enough: the running beat finishes half a second later and commits
a state from before the snapshot, over the snapshot. The buffer cap's collapse
(section 8) has exactly the same shape and the same risk.

So `replaceSettled(state)`, in order:

1. Bumps a **generation token**. Every transition captures the generation it
   started under and every callback checks it, so a completion from a
   superseded generation is inert - it neither commits nor advances the queue.
2. Cancels the running animation through the queue's own `clear()` and the
   `cancel()` the flight already exposes, so the DOM it owns is cleaned up by
   its own path rather than abandoned.
3. Drops every pending transition and tears down presentation UI that outlives
   a step: a raised question, a parked summary, any transient arrow.
4. Commits `state` immediately and repaints.

The generation token is the load-bearing half. Cancellation is best-effort -
an animation can report finished a tick after being cancelled - so correctness
has to come from the callback checking whether it still speaks for the current
run, not from having successfully stopped it.

**The test:** a snapshot arrives while a beat is stalled; release the stalled
beat afterwards and assert the displayed state is the snapshot's and never the
superseded transition's `next`.

### 3. The classifier answers one question and returns a list

`src/presentation.ts`. `PRESENTATION_RULES` is exhaustive over `GameEventType`
in the `NOTICE_RULES` shape:

    type PresentationRule =
      | { kind: "presented"; beats(e: GameEvent, ctx: PresentCtx): Beat[] }
      | { kind: "never"; reason: string };

    type Beat =
      | { kind: "map"; polygon: string; label: Segment[]; sound: SoundName | null;
          badges: BadgeWalk[];
          /** Arrows this beat takes off the board. They exit plain: a fade
           *  out and no label. See "retiring is not resolving" below. */
          retires: number[];
          /** The one arrow that SHOWS the outcome, when there is an outcome
           *  to show. Derived from the event, not from any march. */
          resolution?: ResolutionArrow }
      | { kind: "hud"; motion: "draw" | "play" | "pulse" | "reveal";
          cardId?: string; sound: SoundName | null }
      | { kind: "ask"; question: TransferQuestion };

    /** One badge stepping from the score it HAD to the score it has. */
    interface BadgeWalk { polygon: string; track: "defense" | "disease";
                          before: number; after: number }

    /** The resultant force of one resolution, drawn for the length of the
     *  beat and then gone. Its own key in the retained scene, so it is packed
     *  along the border beside whatever else is still standing there. */
    interface ResolutionArrow {
      /** Transition and event, never a march id: this arrow is not any of the
       *  marches that produced it. */
      key: string;
      /** Winner at loser, which may be the opposite of either arrow that
       *  retired. */
      from: string; to: string;
      /** What actually got through, which is neither side's declared damage. */
      strength: number;
      label: string;
      tone: "ours" | "hostile" | "other";
    }

**A list, not a category.** One event can owe both a HUD beat and a map beat -
your own Raid flies its card *and* puts an arrow on a border. `beats()`
returning `[]` is the event-level answer "not for this screen"; `kind: "never"`
is the type-level answer with the written sentence, which is the discipline
`REPLAY_RULES` already keeps.

**Scope: transient presentation only.** Log observability (`isObservable`) and
round-summary policy (`NOTICE_RULES` / `isNoticeWorthy`) answer different
questions - what is in the permanent record, and what deserves a modal - and
stay where they are. `PRESENTATION_RULES` replaces `REPLAY_RULES`, `floatFor`
and `animateEvents`' implicit type-keyed rules, and nothing else.

**Beats hold descriptions, not DOM.** A beat that has not run has drawn
nothing. That kills the frozen-float class of bug structurally rather than
patching it, and it is why the float subsystem can be deleted outright: the
badge walk (`walkBadgeScore`) becomes the universal way a score change is
shown, which is what the game wants anyway.

### 4. One audience gate

`involvesLocalSeats(e, view)` replaces `ownCause`, `worthTheCamera`, the
float's absent gate and `animateEvents`' local-seat test. An event is presented
when a seat **this screen plays** is at either end, or has an arrow or demand
standing between it and the land (`linked`, kept - a land regrowing under your
incoming arrow changes what that arrow will do, and the arrow is yours), or
when the screen owes an answer about it.

Per-screen and not per-human. `humanSeats` is plural and a guest's screen plays
one of them; the existing `isHumanFaction` / `humanSeats[0]` split already says
which question is which.

### 5. Marches get stable identity, and the events name it

This is what makes keyed arrow rendering honest. Today the arrow's key is
`${from}>${to}#${slot}` where `slot` is the first FREE index
(src/marches.ts:117), so an id is recycled the moment an arrow clears - keying
on it would morph one arrow into another. And `resolveMarches` clears the whole
axis at once (src/game.ts:1558) while emitting one event per engagement, so
departures and events do not correspond one to one: a clash retires two arrows
and emits one `march-resolved`.

- `March` gains `id: number`. `GameState.nextMarchId: number` allocates it in
  `addMarch`. Deterministic and a plain number, so `net-codec`'s compile-time
  check passes and the wire carries it for free.
- New event type `march-declared`, carrying `marchId`, both ends, the card and
  the strength. It must be added to `EVENT_SOUNDS`, `NOTICE_RULES`,
  `PRESENTATION_RULES` and `nestsUnderItsPlay` - each will refuse to compile
  until it is - and it **bumps `PROTOCOL_VERSION`** (src/net-protocol.ts:13)
  from 5 to 6. A new event type changes the wire schema even though no card
  behaviour moves and `cardRulesHash` is untouched. That is deliberate protocol
  evolution and the version bump is how two builds decline to shake hands over
  it.
- `march-resolved` and `march-lapsed` carry `marchIds: number[]`, plural
  because a standoff spends both sides.

#### A resolution must be reconstructible from its own event

`ResolutionArrow` is derived entirely from the `march-resolved` event, so the
event has to carry everything the arrow needs - and today it does not. `clash`
is present only when the landing was contested (`src/game.ts:1650`), and
`amount` is the defense actually moved, floored at what the land had standing.
A 3-strength raid onto a land holding 1 records `amount: 1` and nothing about
the 3, so the label would read `1/1 DMG` for a blow that was three times that.
The existing ghost already gets this wrong in a way nobody has noticed: it
falls back to `e.clash?.incoming ?? 1` (`src/main.ts:1723`), so **every**
uncontested landing is drawn one unit wide whatever its strength.

So `march-resolved` states the force aimed at the loser unconditionally,
including uncontested landings and arrivals that moved nothing. Rather than
adding a second field beside `clash.incoming` and pinning the two together with
a test - which is the duplication this whole spec exists to remove - `clash` is
replaced by two fields:

- `incoming: number` - the strength aimed at the loser. Present on every
  `march-resolved` **that an army caused**, which is every one carrying
  `marchIds`, including uncontested landings and arrivals that moved nothing.
- `counter?: number` - what the loser mustered against it. Present exactly when
  the landing was contested, so it is now the contested discriminant.

The one `march-resolved` with no `incoming` is a Subjugate demand coming due:
`landClaims` reports through the same event type, and a demand is not an army -
it clears no march and throws no strength. That event is `metNothing` by
construction, and `metNothing` draws no resolution arrow, so nothing is left
unreconstructible. The invariant to hold is therefore "every `march-resolved`
carrying `marchIds` carries `incoming`", and that is what the test pins.

The two shapes that were read off `clash`'s presence are re-expressed against
`counter`, and both get clearer for it: `metNothing` becomes "no `amount` and
no `counter`", and a standoff becomes "`counter` present and no `amount`". The
readers to move are `metNothing` (`src/game.ts:915`), the three arms in
`src/notices.ts` (400, 417, 430), `src/hud.ts:517`, and the construction sites
at `src/game.ts:1072`, `1222`, `1577` and `1650`. The four readers in
`src/main.ts` are inside `flashMarchResolution`, which this work deletes.

**The invariant, and it is a test:** across a **non-settled** transition, the
set of march ids that left the store is a SUBSET of the ids named by that
transition's `march-resolved` and `march-lapsed` events. Not equality: a
`march-declared` in the same batch names an id of its own, through the
singular `marchId`, for an arrow that just arrived rather than one that left,
and unioning it in would let a declaration stand in for a departure it has
nothing to do with. An arrow vanishing with nothing to explain it becomes a
failing test rather than a silent hole. If the engine today drops an arrow
without an event, this invariant is what will surface it, and fixing that is
part of the work.

Scoped to non-settled deliberately. A snapshot replaces the whole board,
`marches` included, and carries no departure events because nothing departed -
the board was exchanged. Holding settled transitions to this invariant would
make every rejoin a failure, and the presenter draws nothing for them anyway.

### 6. Arrows are rendered by key with enter and exit

`renderArrowScene` keeps its layout maths and gains a retained
`Map<string, SVGGElement>`:

- a key not present last render fades in;
- a key gone this render fades out and is removed when the animation reports
  itself finished, and is dropped from the map at once so a re-added key
  cannot collide with a corpse;
- a surviving key animates to its new lane rather than being rebuilt.

The aim preview opts out of the transition: it re-packs on every pointer move
and must track the cursor.

#### Retiring is not resolving

A departed arrow is **not** the resolution ghost, and conflating the two is
wrong for the case the whole march-identity work exists for. A clash retires
two arrows and produces one resolution whose strength is neither side's
declared damage and whose direction - winner at loser - may be the opposite of
either arrow that left. Three departures on one axis can produce one event.
There is no arrow on the board whose exit tells that story.

So the beat drives two separate things:

- **`retires: number[]`** takes those keys out of the scene. They exit plain:
  a fade out, no result label, nothing claiming to be the outcome.
- **`resolution?: ResolutionArrow`** puts ONE transient arrow into the same
  retained scene, keyed by transition and event rather than by any march,
  derived entirely from the `march-resolved` event. It is packed along the
  border beside whatever else still stands there, exactly as a live arrow is,
  and it leaves when the beat ends.

Because it lives in the same retained scene, this still deletes
`flashMarchResolution`'s manual rebuild, the separate `ghostGroup` layer, and
the `svg.replaying { display: none }` rule - all three existed only because a
live rebuild used to wipe a mid-fade ghost, and with identity a rebuild wipes
nothing.

Per the decision on screen: the resolution arrow's label is neutral ink and
reads `1/3 DMG` - what got through out of what was thrown, with the word so
the number is not mistaken for a score. No green, no red, no leading sign.

### 7. The continuation gate becomes the lifecycle

**Invariant: no continuation may mutate the next state while any presentation
beat from the current transition is pending.**

This is not a repair to `settleTurn`; it is what the lifecycle in section 1
already says, so the invariant is held by the shape rather than by a flag. A
continuation is just "the next transition may start", which is step 5, and
nothing can reach step 5 without passing steps 1 through 4.

`afterPlayAnimation` therefore does not survive as a mechanism. Its ONE
remaining job is the flight watchdog - the last-resort deadline derived from
`Flight.totalMs` that stops a dropped `onfinish` wedging the game forever -
and that moves onto the queue's own step, where it guards every beat rather
than only a card flight. `hud.ts` stops owning turn control.

`tests/hud-animation-gate.test.ts:150` ("fires at once when nothing flew") is
not wrong and its behaviour is preserved: a transition with no beats runs its
lifecycle straight through. The regression to add is the case it never
covered - no card flies, but a non-play beat is on the queue, and the next
transition must wait.

### 8. Multiplayer: same sequence, never overlapped, never skipped

The requirement is **not** that both screens stay synchronized in real time.
It is that each screen presents the same authoritative sequence without
overlapping or skipping it. Real-time synchrony buys nothing a player can
perceive, since neither screen shows the other's camera, and an acknowledgement
would make the host's turn loop depend on network liveness - a guest that tabs
away or drops would stall everybody.

So: **no wire acknowledgement.** The host simulates freely and pushes as it
does. The guest buffers arriving transitions and applies each only after its
own queue has drained, presenting them one at a time. Input stays locked while
the buffer is non-empty, which is the rule the host already applies to itself
during its own chain.

Two rules keep the buffer honest:

- A `start` or `snapshot` message goes through `replaceSettled` and therefore
  **cancels rather than clears** - generation token, running beat made inert,
  presentation UI torn down. It is settled history by definition, and a
  rejoining guest must not be made to watch what it missed, nor have a beat
  from before the snapshot commit over it a moment later.
- The buffer is **capped at 12 transitions**, and past the cap it collapses to
  the newest and presents nothing, exactly as a snapshot does. Twelve because a
  transition is roughly one seat's turn and five factions act, so a round is
  about six: the cap is two rounds behind, which is as far as a player can drift
  and still recognise the board when the animation catches up. A player who was
  not looking gets the current board rather than a five-minute replay, and the
  lag cannot grow without bound.

  This is the one place the "never skipped" rule is deliberately given up, and
  it is given up wholesale rather than piecemeal: the collapse goes through
  `replaceSettled`, cancellation and all, so the guest is never shown a partial
  or out-of-order sequence and no superseded beat can commit behind it.
  Skipping some of a round while presenting the rest would be worse than
  skipping all of it. The cap is a number in `src/transitions.ts` with this
  reasoning beside it.

## What this deletes

`floatScoreMarks`, `floatFor`, `queueFloats`, `floatedEvents`,
`replayedIndices`, `FLOAT_MS`, `.score-float` and its two colour rules;
`flashMarchResolution` and `ghostGroup`; `svg.replaying`'s arrow-hiding rule
and the `clash-good`/`clash-bad` colours; `askTransferIfPending`'s duplicate
path and the `replayActive` flag it needs; `REPLAY_RULES` (folded into
`PRESENTATION_RULES`); `walkBadgeScore`'s backwards step, which the deferred
commit makes unnecessary.

`cueEndingIfAny` and the postmortem's `phase` derivation in `hud.update` are
not deleted but move: both become stage 5 of the lifecycle, so an ending is
raised by the transition that caused it rather than by whichever repaint first
notices the phase.

**`settleTurn`, `pendingSummary` and `idleSettleArmed` go too.** They are the
second scheduler: a hand-rolled state machine that parks the summary, re-arms
on `animations.onIdle`, and guards against two waiters racing. Every one of
those jobs is a numbered step of the transition lifecycle in section 1, and
the bug in section "What is actually broken" is precisely a case that state
machine does not cover. Replacing it rather than repairing it is the point -
the three variables exist to coordinate two schedulers, and after this there
is one.

`hud.update`'s `animate` flag is not deleted but re-sourced: it stops being a
per-call-site opinion and becomes `Transition.settled`, threaded to the readers
that still need it - the log's `log-new` highlight and the reveal flash. The
bug was never the flag, it was that only some surfaces consulted it.

## Carried out of step 1

Step 1 is done. Three things it deliberately left for a later step, recorded
here because this document is what the next plan is written from:

- **The postmortem log prints what the activity log suppresses.** `pmLog` in
  `src/hud.ts` filters `state.log` with its own `e.type !== "draw"` test rather
  than through `isObservable`, so a finished run's postmortem still prints the
  `march-declared` line under the play that caused it. Defensible - the
  postmortem is deliberately more revealing, and it un-hides secret cards on
  the same call - but it is a second observability rule, and the next surface
  that wants "a real event with no line" has to remember both. Whoever touches
  the postmortem next should either give it its own exhaustive table or write
  down that its filter is a permanent rule of its own.
- **Two branches in `resolveMarches` clear a march and emit no event**, and are
  unreachable only by arithmetic: the uncontested arm of the guard at the top
  of the engagement loop, and `if (moved <= 0) continue;` below it. Both need a
  march of damage 0 or a `damageAfterTerrain` of 0, and neither can happen with
  the current attack cards. A zero-damage or fully-absorbed attack would drop
  an arrow with nothing to explain it. No guard was added - the departure
  invariant test is what would catch it, and speculative code for an
  unreachable case was explicitly rejected during step 1.
- **Arrow keys are already free of collisions.** Marches key as `"1"`, `"2"`,
  claims as `claim:...`, plus `aim` and `ghost`, so the `march:<id>` namespacing
  section 6 wants is a rename and nothing more.

## Order of work

The dependencies are real and not obvious, so the plan should follow them:

1. ~~March identity, the `march-declared` event, the `clash` split into
   `incoming` and `counter`, and the protocol bump.~~ **Done.** Every later
   piece names march ids, and the resolution arrow needs `incoming` before it
   can be drawn. See "Carried out of step 1" above.
2. `src/transitions.ts`: the queue, the owned state, the generation token and
   the three intakes, with the deferred commit and the full six-stage
   lifecycle - questions, summary and ending included, so `settleTurn` is
   retired here rather than left to be repaired twice. The host chain and local
   decisions move onto it; the guest intake still presents nothing. `main.ts`
   loses its assignable `game`, and the postmortem stops being derived from
   `phase`.
3. `src/presentation.ts`: the classifier and the audience gate, replacing
   `REPLAY_RULES` and deleting the float subsystem.
4. Keyed arrow rendering with enter and exit, plus the transient resolution
   arrow.
5. Guest buffering and the cap.

Steps 1 and 2 are each shippable on their own and leave the game working.
Step 2 is the largest and is where the behaviour actually changes; it is worth
its own browser pass before step 3 goes on top of it.

## What must not change

- Card behaviour, and therefore `cardRulesHash`. Nothing here touches a
  damage number, a price or a legality rule.
- The rule that a march resolves at the **attacker's** next turn start
  (`lapsedMarchesOf`, src/game.ts:1502). Confirmed as the wanted rule: the
  counter window is the whole round, which is what makes the counter-click on
  an arrow meaningful.
- `NOTICE_RULES`, `isObservable`, the round summary's content and the log's.
- The rich-text rule: every label is segments, never a template literal.
- The rule that no animation duration is re-derived into a second timer.

## Testing

`src/transitions.ts` and `src/presentation.ts` are separate modules precisely
so these can be written, since `src/main.ts` cannot be tested today.

- `PRESENTATION_RULES` exhaustive, every `never` carrying a reason, every label
  built from segments (the `tests/replay.test.ts` shape, carried over).
- The audience gate from both seats of a two-seat game.
- **The displayed state lags:** while a transition's beats are pending, the
  read accessor still answers `previous` - the badge, the ownership and the
  arrow set all still read the board the player was last shown. This is the
  test that would have caught the bug this whole spec exists to fix.
- The lifecycle runs in order and nothing skips: beats, commit, questions,
  summary, ending, complete. Including the case that has no summary, which is
  where `settleTurn` fails today.
- **A question sees the committed state.** An `ask` beat raised for a conquest
  can have its `transferDefense` answer accepted - the regression for the
  stage-1 ordering, which `commitDecision` would have refused.
- An `ask` beat whose answer submits a transition releases, and that
  transition lands after the current one rather than deadlocking it.
- **The ending comes last.** A transition that ends the run raises no
  postmortem until its beats, questions and summary are done, and the board
  behind "View the map" has no march still standing on it.
- **A snapshot during a stalled beat wins.** Release the stalled beat after the
  snapshot lands and assert the displayed state is the snapshot's, never the
  superseded transition's `next`. The same for a buffer-cap collapse.
- `march-resolved` always carries `incoming`, including an uncontested landing
  and one that moved nothing, so a `ResolutionArrow` is reconstructible from
  the event alone. A 3-strength raid onto a land holding 1 reads `1/3 DMG`.
- The march-identity invariant of section 5.
- A clash retires two arrows and draws one resolution arrow, pointing winner
  at loser, with a strength that is neither declared damage.
- The continuation regression of section 7.
- A guest `snapshot` clears the buffer and presents nothing; a buffer past 12
  collapses rather than backing up.

## What would look wrong in play

An arrow appearing or vanishing without a fade. A number in green or red
anywhere on a polygon. A badge showing an outcome before the beat that
explains it. A rival's raid arriving at your land with no camera, no sound and
no arrow you saw fly. The AI taking its turn behind an animation of the turn
before it. A guest watching a round arrive already finished, or watching five
minutes of history after a tab-out. A postmortem rising over a raid still
landing, or "View the map" behind one showing arrows that never resolved. A
conquest question that refuses the answer you give it. An uncontested raid
drawn one unit wide whatever its strength.
