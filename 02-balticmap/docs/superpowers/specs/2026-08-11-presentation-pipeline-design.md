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
      /** History: apply it, present nothing. A boot, a deal, a rejoin. */
      settled: boolean;
    }

`src/transitions.ts` owns a queue of these. It applies one, presents its
beats, waits for the animation queue to drain, then applies the next. Nothing
else in the app assigns `game`.

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

The root `biome.json` already forbids `src/main.ts` from importing the engine
mutators. The same mechanism forbids any assignment to `game` outside the
transition queue, so there is no path that appends events without presenting
them.

### 3. The classifier answers one question and returns a list

`src/presentation.ts`. `PRESENTATION_RULES` is exhaustive over `GameEventType`
in the `NOTICE_RULES` shape:

    type PresentationRule =
      | { kind: "presented"; beats(e: GameEvent, ctx: PresentCtx): Beat[] }
      | { kind: "never"; reason: string };

    type Beat =
      | { kind: "map"; polygon: string; label: Segment[]; sound: SoundName | null;
          badges: BadgeWalk[]; ghosts: GhostArrow[] }
      | { kind: "hud"; motion: "draw" | "play" | "pulse" | "reveal";
          cardId?: string; sound: SoundName | null }
      | { kind: "ask"; question: TransferQuestion };

    /** One badge stepping from the score it HAD to the score it has. */
    interface BadgeWalk { polygon: string; track: "defense" | "disease";
                          before: number; after: number }
    /** One arrow retiring, and what its exit says. */
    interface GhostArrow { marchId: number; label: string;
                           tone: "ours" | "hostile" | "other" }

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

**The invariant, and it is a test:** the set of march ids that left the store
across a transition equals the union of the ids named by that transition's
events. The presenter can then draw a ghost for exactly the arrows an event
retired, and an arrow vanishing with nothing to explain it becomes a failing
test rather than a silent hole. If the engine today drops an arrow without an
event, this invariant is what will surface it, and fixing that is part of the
work.

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

A resolved march is then an arrow whose key departed, so **its exit is the
ghost** - driven by the beat, which knows which ids retired and what to say
about them. This deletes `flashMarchResolution`'s manual rebuild, the separate
`ghostGroup` layer, and the `svg.replaying { display: none }` rule, all three
of which existed only because a live rebuild used to wipe a mid-fade ghost.
With identity, a rebuild wipes nothing.

Per the decision on screen: the ghost's label is neutral ink and reads
`1/3 DMG` - what got through out of what was thrown, with the word so the
number is not mistaken for a score. No green, no red, no leading sign.

### 7. The continuation gate

**Invariant: no continuation may mutate the next state while any presentation
beat from the current transition is pending.** `afterPlayAnimation` is
broadened and renamed to `afterPresentation`, waiting on the animation queue
draining as well as on live flights, rather than only when a summary is parked.

`tests/hud-animation-gate.test.ts:150` ("fires at once when nothing flew") is
not wrong and stays: it queues no beat. The regression to add is the case it
never covered - no card flies, but a non-play beat is on the queue, and the
continuation must wait.

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

- A `start` or `snapshot` message **clears the buffer** and jumps. It is
  settled history by definition, and a rejoining guest must not be made to
  watch what it missed.
- The buffer is **capped**. Past the cap it collapses to the newest transition
  and presents nothing, exactly as a snapshot does. A player who was not
  looking gets the current board rather than a five-minute replay, and the lag
  cannot grow without bound.

  This is the one place the "never skipped" rule is deliberately given up, and
  it is given up wholesale rather than piecemeal: the buffer collapses to a
  settled state, so the guest is never shown a partial or out-of-order
  sequence. Skipping some of a round while presenting the rest would be worse
  than skipping all of it. The cap is a number in `src/transitions.ts` with
  this reasoning beside it.

## What this deletes

`floatScoreMarks`, `floatFor`, `queueFloats`, `floatedEvents`,
`replayedIndices`, `FLOAT_MS`, `.score-float` and its two colour rules;
`flashMarchResolution` and `ghostGroup`; `svg.replaying`'s arrow-hiding rule
and the `clash-good`/`clash-bad` colours; `askTransferIfPending`'s duplicate
path and the `replayActive` flag it needs; `REPLAY_RULES` (folded into
`PRESENTATION_RULES`).

`hud.update`'s `animate` flag is not deleted but re-sourced: it stops being a
per-call-site opinion and becomes `Transition.settled`, threaded to the readers
that still need it - the log's `log-new` highlight and the reveal flash. The
bug was never the flag, it was that only some surfaces consulted it.

## Order of work

The dependencies are real and not obvious, so the plan should follow them:

1. March identity and the `march-declared` event, with the protocol bump. Every
   later piece names march ids.
2. `src/transitions.ts`: the queue and the three intakes, with the host chain
   and local decisions moved onto it. Guest intake still presents nothing.
3. `src/presentation.ts`: the classifier and the audience gate, replacing
   `REPLAY_RULES` and deleting the float subsystem.
4. Keyed arrow rendering with enter and exit, and the ghost as an exit.
5. The continuation gate, broadened and renamed.
6. Guest buffering and the cap.

Steps 1 and 2 are each shippable on their own and leave the game working.

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
- The queue never applies transition N+1 while any beat of N is pending, on
  the host chain and on the guest buffer.
- The march-identity invariant of section 5.
- The continuation regression of section 7.
- A guest `snapshot` clears the buffer and presents nothing; the cap collapses
  rather than backing up.

## What would look wrong in play

An arrow appearing or vanishing without a fade. A number in green or red
anywhere on a polygon. A badge showing an outcome before the beat that
explains it. A rival's raid arriving at your land with no camera, no sound and
no arrow you saw fly. The AI taking its turn behind an animation of the turn
before it. A guest watching a round arrive already finished, or watching five
minutes of history after a tab-out.
