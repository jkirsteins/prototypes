# Hostages - UX refactor design

Prototype 03. The rules work; the presentation does not. This design replaces the
text-dump duel screen with a card table: clear turn boundaries, deck and discard
piles you can see, cards that move, and one modal that reports what he just did to
you.

Nothing in this document changes the rules. Card effects, legality, the AI and the
win/loss conditions are untouched.

## 1. The problem

`src/ui/duel.ts` renders a single vertical column: a banner, a row of stat chips, an
18rem scrolling log, and a stack of full-width buttons carrying each card's name,
rules text, flavor text and - when illegal - the reason. Every action calls
`clear(root)` and rebuilds all of it.

Two consequences:

- **Turns are invisible.** One click of `playerLead` resolves your lead, his answer,
  his draw, his discard and his lead, then hands you back input. All of that arrives
  as a batch of new log lines. Nothing marks where your turn ended and his began, and
  nothing distinguishes what you caused from what he did.
- **Animation is impossible.** Every element is destroyed and recreated on each
  render, so no element persists long enough to move.

The deck and discard piles are not represented at all. The three secrets - the thing
that loses the run - exist only as a `Secrets left 3` chip.

## 2. One event stream, not two

`LogEntry` is already most of an event: it carries `turn`, `side`, `kind`, `cardId`,
`text` and `deltas`. Rather than adding a parallel `state.events` that can drift from
`state.log`, `state.log` is promoted to *the* event stream. `LogEntry` is renamed
`GameEvent` and `LogKind` becomes `EventKind`.

Three additions:

**New kinds.** `draw` and `reshuffle`, emitted from `deck.ts`. And `turn`, a marker
emitted at the top of `convictTurn()` and `startPlayerTurn()`. The `turn` marker is
what makes turns legible - it drives the banner, the turn separators in the log
drawer, and the segment boundaries the modal aggregates over.

Because `deck.ts` currently takes a `Pile` and an `RngState` rather than the whole
state, `drawCard` and `discardCard` gain an optional event sink parameter: a callback
the caller supplies to record what happened. `game.ts` passes one that pushes onto
`state.log`; existing `deck.test.ts` callers pass nothing and keep working.

**A `vitals` snapshot on every event.** A flat object captured at emit time:

```ts
export interface Vitals {
  playerWill: number;
  playerVigor: number;
  wifeVigor: number;
  convictWill: number;
  convictVigor: number;
  bound: boolean;
  toppled: boolean;
  zone: Zone;
  range: Range;
  weaponDown: boolean;
  offBalance: boolean;
  distracted: number;
  incapacitated: boolean;
  secretsLeft: number;
}
```

Fourteen fields, cheap to copy. With a snapshot on every event, the diff over any
segment is first-vs-last - no need to thread structured deltas through `effects.ts`,
whose string-building stays exactly as it is.

**Nothing else in the engine changes.** `game.ts` still resolves your lead, his
answer and his whole turn in one synchronous call. The UI animates the resulting
slice of events. No new asynchrony enters the rules.

### `src/vitals.ts`

```ts
export function snapshot(state: GameState): Vitals;
export function diff(before: Vitals, after: Vitals): VitalsChange[];
export function lines(changes: VitalsChange[]): string[];
```

`VitalsChange` is a discriminated union over the fourteen fields, so `lines` can
phrase each one properly: `Your vigor 6 -> 4`, `Her vigor 4 -> 2`,
`Your hands are free`, `He is distracted (2)`. Pure functions, no DOM.

## 3. The modal, enforced by the type system

`src/notices.ts` carries an exhaustive `Record<EventKind, ModalRole>`. Adding an
event kind is a compile error until someone decides what it does:

```ts
export type ModalRole =
  | { role: "headline" }            // names the box
  | { role: "detail" }              // folds into the open box
  | { role: "silent"; reason: string };
```

All fifteen kinds, with no gaps:

| Kind | Role | Reason if silent |
| --- | --- | --- |
| `lead` | headline | |
| `surrender` | headline | |
| `answer` | detail | |
| `decline` | detail | |
| `effect` | detail | |
| `coercion` | detail | |
| `recover` | detail | |
| `haulUp` | detail | |
| `draw` | silent | routine; the deck pile animates it |
| `reshuffle` | silent | routine; the pile pulses |
| `discard` | silent | routine; visible in the log |
| `pass` | silent | nothing happened; the banner says whose turn it is |
| `turn` | silent | structural marker, not an occurrence |
| `scene` | silent | the opening event has its own screen |
| `outcome` | silent | the ending screen covers it |

The role is a property of the kind, not of who acted - a `lead` is a headline whether
you or he played it. Your own leads never reach a box because the triggers below
never open a segment on your turn, not because the role differs.

Silence is enforced-silent, never accidental: the `reason` string is required and
tested for non-emptiness.

```ts
export function buildNotice(segment: GameEvent[], changes: VitalsChange[]): Notice | null;
```

`Notice` mirrors 02's shape - `title`, `what`, `flavor`, and here a `rows: string[]`
of vitals lines instead of a single `consequence`.

### When it fires

Two triggers, and only two:

1. **A convict-initiated exchange resolves.** The segment runs from his `turn` marker
   through the resolution of his lead. Because his lead is emitted at the end of one
   input slice and resolves in the next (you answer it in between), the segment
   spans two slices; the driver holds the open segment across the boundary and
   closes it when the resolution arrives.
2. **A secret leaves you.** Its own box, because it is the one irreversible thing in
   the run.

No box on your own turn. Your lead is on screen already - you chose it, it flies to
the center, his answer meets it, the numbers pop. A modal for a result you caused
costs a click and adds nothing.

## 4. The table

The screen is built once and mutated in place. This is the structural UI change:
`table.ts` constructs the DOM on entry to the duel, and `update(state)` writes text
and toggles classes on nodes that persist across turns.

```
+------------------------------------------------+
|  HIM   WILL 6  VIG 3       taken from you:     |
|  near / knife up  [#][#][#]  [WHERE]  [##] [==]|
+------------------------------------------------+
|              -- HE LEADS --                    |
|      [ his lead ]  X  [ your answer ]          |
+------------------------------------------------+
|  YOU  WILL 6  VIG 6 bound    WIFE  VIG 4       |
|  what he wants: [SAFE] [NAMES] [ x ]           |
+------------------------------------------------+
| [##]8   / [c][c][c][c][c] \           [==]5    |
+------------------------------------------------+
```

Modules under `src/ui/`, none over ~150 lines:

| File | Responsibility |
| --- | --- |
| `table.ts` | builds the shell once, coordinates the parts, owns `update(state)` |
| `plates.ts` | the three stat panels, the scene line, the condition flags |
| `piles.ts` | stacked card backs with counts, both sides |
| `hand.ts` | the fan, hover-raise detail panel, unplayable treatment |
| `secrets.ts` | your face-up row and his taken row |
| `logdrawer.ts` | the right-edge collapsible drawer |
| `notice.ts` | the modal and its queue |
| `beats.ts` | the animation driver (section 5) |
| `animate.ts` | `flyCard`, ported from 02 |

`duel.ts` shrinks to the coordinator that wires these to `Actions`.

### Piles

Both sides show a deck and a discard as stacked card backs with a count beneath,
using 02's `pileLayers(n)` approach - layer count scales with pile size so the stack
visibly thins as the deck drains. His hand shows as face-down backs, count only.

### Cards

The face carries the card name and a compressed rules line. That line is **derived
from `card.effects`**, not authored: a `summarize(card: CardDef): string` in
`content/cards.ts` turning `{kind: "damage", target: "convict", amount: 2}` into
`-2 vig`. Forty hand-written summary strings would go stale the first time an effect
changed; a derived one cannot.

Hovering or focusing a card raises it and opens a detail panel with the full `rules`
text, the `flavor` line, the `requires` clause phrased in prose, and - when the card
is not legal right now - the reason from `Legality`.

Unplayable cards stay in the fan at their position, dimmed and desaturated and not
clickable, with the reason on hover. They are not hidden and not reordered: learning
which state gates which card is the game's teaching loop, and a hand that reshuffles
itself every turn destroys the player's spatial memory of it.

### Secrets

Three face-up cards pinned beside your stat plate under `what he wants:`. When one is
given up it flies across the table to a `taken from you:` row on his side and stays
there. The loss condition becomes a row you watch drain rather than a counter you
read.

## 5. Beats

`src/ui/beats.ts` owns the sequence. After every action the driver takes
`state.log.slice(rendered)`, maps each event to an animation, runs them on a timer
chain with input locked, then shows a notice if one is due, then unlocks.

| Event | Animation | ms |
| --- | --- | --- |
| `lead` | card flies from hand (or his side) to center | 250 |
| `answer` | answering card flies in to meet the lead | 200 |
| `effect` | numbers pop on the plates, changed flags flash | 200 |
| exchange end | both center cards slide to their discards | 200 |
| `draw` | card back flies deck -> hand | 180 |
| `surrender` | secret flies across to his taken row | 300 |
| `reshuffle` | discard pulses and folds into the deck | 200 |
| `discard` | card slides hand -> discard | 180 |

A full between-turns chain lands around 1.3s. There is no skip control and no speed
setting: the chain is short enough that interrupting it is not worth the UI surface.
All timings live in one exported constants block so they can be tuned in one place
once it is running.

`flyCard` is ported from 02's `animate.ts` unchanged, including its reason for
existing: timing is driven by `setTimeout` rather than `transitionend`, because
happy-dom never fires transition events and a dropped event would leak the element.

Input is locked for the duration by a single `busy` flag that disables the hand and
swallows clicks. The notice modal, if any, opens when the chain drains; input
unlocks when it is dismissed.

## 6. Testing

New test files:

- `vitals.test.ts` - snapshot captures every field; diff detects each kind of change
  and nothing else; `lines` phrases each change correctly
- `notices.test.ts` - every `EventKind` has a role (exhaustiveness); every `silent`
  rule carries a non-empty reason; a convict exchange segment produces the expected
  box; a player-led segment produces none; surrender produces its own
- `beats.test.ts` - fake timers; events animate in emission order; input is locked
  during the chain; the notice opens before input unlocks; the chain always drains
- `animate.test.ts` - `flyCard` removes its element and fires `onDone` after the last
  stage, with no leak when stages are empty

`ui.test.ts` is rewritten against the new structure - it currently asserts against
`renderDuel`'s full-rebuild output, which no longer exists.

The engine suites (`game`, `effects`, `legality`, `ai`, `integration`, `log`,
`deck` - about 1400 lines) keep passing untouched **except** where they assert on
`state.log` length or index into it, since `draw`, `reshuffle` and `turn` events now
appear in the stream. Those edits are mechanical: assert on filtered kinds rather
than raw indices, which is more robust anyway.

`npm test` and `npm run build` must both pass before commit, per the repo
convention.

## 7. Out of scope

- No rules changes, no new cards, no rebalancing, no new archetypes or relations.
- Title, opening-event and ending screens keep their content and copy; they get only
  enough CSS to sit alongside the new table without looking like a different app.
- Desktop-first. Below roughly 900px the table stacks vertically and the log drawer
  starts collapsed; no separate mobile layout is designed.
- No sound, no card art. Cards are typography and borders.
