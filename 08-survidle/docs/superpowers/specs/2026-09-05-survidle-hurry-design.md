# Survidle: hurrying the work you chose by hand

The one scale, one real second to one game minute, is the idle bargain:
the standing orders run at it, and day 30 is a real-time commitment.
It also makes an interactive session slow. A felling you asked for by
hand is fifty seconds of watching a bar, and a session of a dozen such
choices is ten minutes of waiting for the price of two of play.

This spec lets the clock run faster through work the player chose in
the moment, and nothing else. An immediate action, a once order or an
advanced single action, is hurried on its own from start to end. A
standing or counted order is hurried a little at a time by clicking its
row in the list, with a cooldown, so a player at the keyboard can lean
on it and a player who is not cannot. Body needs, the runner's waiting,
sleep and everything done while away run at the one scale as before.

Extends `2026-09-02-survidle-design.md` (the one scale, the Doing panel)
and `2026-09-03-survidle-standing-orders-design.md` (order kinds, the
runner, the list).

## 1. What is hurried

The sim does not know the hurry exists. Every frame, the hurry decides
how many extra game minutes the frame carries, and `advance` receives the
frame's own minutes plus those. Offline catch-up is by wall clock as
today and never sees a hurry; a reload mid-hurry starts unhurried.

Three states, read from the game state every frame by `hurryKind`:

- **auto**: the work in hand is an immediate action. That is a live task
  with either no intent (a raw single action under the advanced toggle),
  an intent with no order behind it that is not `wait` (haul and night
  by hand, or a task resumed with "finish"), or an intent serving an
  order whose `until` is `once`. In every case the intent, if any, is
  serving no body need.
- **click**: the work in hand serves an order whose `until` is `times`,
  `campHas` or `forever`, and the intent is serving no body need.
- **none**: everything else. No task; the runner waiting; an intent
  serving a body need (sleep, storm, cold, hungry, thirsty, snares,
  spent, home); dead; the landing screen; the away report open.

The rule under the three is the one the player was given: what you
chose in the moment is hurried, what you left running is not. A body
need inside a once order is the body's, not the player's, so a once
felling that turns into a walk home for the night slows back to the one
scale at the turn.

## 2. The two curves

Rates are multipliers on the one scale: at 6x a real second is six game
minutes. Everything below is in real seconds.

**Auto** ramps in and cuts out. While the kind is `auto`, the rate is

    m(t) = 1 + (PEAK - 1) * ease(t / RAMP_S)

where `t` is how long the kind has been `auto` without a break, `ease(u)`
is the raised cosine `(1 - cos(pi u)) / 2` for `u` in `[0, 1]` and 1
after, `PEAK` is 6 and `RAMP_S` is 2. When the kind stops being `auto`
the rate is 1 again on the next frame; there is no ease-out, because an
ease-out after the end would hurry whatever came next, and a drop in
rate is not visible on the map. `t` resets to 0 when the kind changes,
so a once order whose runner turns to a body need and back ramps in
again.

The extra minutes a frame carries are the integral of `m - 1` over the
frame, in closed form:

    E(u) = (u - sin(pi u) / pi) / 2        for u <= 1
    E(u) = 1/2 + (u - 1)                   for u > 1
    extra = (PEAK - 1) * RAMP_S * (E(t1 / RAMP_S) - E(t0 / RAMP_S))

so the minutes delivered do not depend on the frame rate.

**Click** is a pulse. A click when the kind is `click` and no pulse is
running starts one. The pulse delivers `PULSE_MIN` extra game minutes
over `PULSE_S` real seconds under a raised cosine:

    rate(u) = 1 + (PULSE_MIN / PULSE_S) * (1 - cos(2 pi u)),  u in [0, 1]
    F(u) = u - sin(2 pi u) / (2 pi)
    extra over a frame = PULSE_MIN * (F(u1) - F(u0)),  u clamped to [0, 1]

`PULSE_S` is `1 / 1.5` (0.667 s) and `PULSE_MIN` is `(PEAK - 1) * PULSE_S`
(3.33 min), so a player clicking one and a half times a second averages
the auto rate, 6x, and one who clicks slower gets less. The peak of one
pulse is `1 + 2 * PULSE_MIN / PULSE_S`, 11x. A click while a pulse runs
is refused: the cooldown is the pulse itself. Pulses do not stack.

A pulse ends on its own after `PULSE_S`, or at once when the kind stops
being `click`: the order it was clicked on is no longer the one served,
because it was met, removed, reranked, or the runner turned to a body
need. The remainder is forfeited. It is the row that was clicked, not
the list: a pulse belongs to the order id it started under and ends if
the live order id changes, even to another `click` order.

## 3. State

Presentation state, on `UiState`, never saved:

```ts
hurry: {
  /** Real seconds the kind has been "auto" without a break. */
  held: number;
  /** The running pulse, or null. */
  pulse: { orderId: number; at: number } | null;   // at: real seconds in
  /** The rate at the end of the last frame, for the clock line. 1 when unhurried. */
  rate: number;
}
```

`src/ui/hurry.ts` holds the kind, the curves and the frame step:

```ts
export type HurryKind = "auto" | "click" | "none";
export function hurryKind(state: GameState, world: World): HurryKind;
/** Advances the hurry by one frame of dtSec and returns the extra game minutes it carries. */
export function hurryFrame(h: HurryState, kind: HurryKind, liveOrderId: number | null, dtSec: number): number;
/** Starts a pulse if one may start; returns whether it did. */
export function hurryClick(h: HurryState, kind: HurryKind, liveOrderId: number | null): boolean;
```

`hurryFrame` also sets `h.rate` to the instantaneous rate at the end of
the frame, so the readout lags the sim by at most one frame.

The frame loop in `main.ts`, in the branch that advances by `dtSec`:

```ts
const extra = hurryFrame(ui.hurry, hurryKind(state, world), state.intent?.orderId ?? null, dtSec);
advance(state, world, dtSec * GAME_MINUTES_PER_REAL_SECOND * speed + extra);
```

The `speed` test aid scales the frame's own minutes and not the hurry;
the hurry is a game feature and the aid is not. The catch-up branch
(`dtSec > 30`) does not call `hurryFrame`; the away report resets the
hurry to unhurried, as does `fresh`, death and the landing screen by
the kind being `none`.

## 4. What the player sees

- **The row.** In the Orders list, the live row of a `click` order gets
  `data-act="hurry"` on its head and the title "Click to hurry it: 3
  minutes in a moment, then wait for the bar". Under its task bar sits a
  second, thinner bar, `bar hurry`, fill id `bar-hurry`, that is full
  the moment a pulse starts and drains to empty as it ends. The head is
  the click target, not the whole row, so the up, down and remove
  buttons keep their meaning. The row of a `once` order and the head of
  a raw action carry nothing: they are hurried without being asked.
- **The clock line.** `1 s = 1 game min` becomes `1 s = 6 game min` at
  the peak of an auto hurry and `1 s = 11 game min` at the peak of a
  pulse, the number rounded to a whole minute, and it climbs and falls
  with the curve. `clockHtml` takes the rate as an argument, default 1.
  The span gets the class `hurrying` while the rate is above 1, drawn
  in the accent colour, so the readout is noticed when it moves.
- **Both times on a button** stay as they are: they say what the work
  costs at the one scale, and the hurry is how fast that cost is paid
  while you watch.

Click handling in `main.ts`: `case "hurry"` calls `hurryClick` with the
current kind and live order id. The bar fill is written every frame from
`ui.hurry.pulse` by `updateHurryBar(ui.hurry)` in `bars.ts`, beside the
task bar, so the list's markup does not churn during a pulse.

## 5. Tests

`tests/hurry.test.ts`:

- The auto curve: from `held = 0`, frames of 0.1 s, 0.25 s and 1 s give
  the same total extra minutes over the first `RAMP_S` seconds as one
  frame of `RAMP_S`, `(PEAK - 1) * RAMP_S / 2`; after the ramp a frame
  of `d` seconds carries `(PEAK - 1) * d`; `rate` reads `PEAK` after
  the ramp and 1 the frame after the kind stops being `auto`, and
  `held` is 0 again.
- The pulse: a click starts one and a second click during it is
  refused; frames that partition `PULSE_S` any way sum to `PULSE_MIN`;
  the frame after it ends carries nothing and a click is accepted
  again; a pulse started under order 3 is dropped, with `pulse` null
  and no further minutes, when the live order id becomes 4, even
  though the kind is still `click`.
- `hurryKind` on a real game: a new game with no task is `none`; a raw
  `chop` under startTask is `auto`; a once order, after one minute of
  `advance` so the runner has taken it, is `auto`; a `times` order is
  `click`; a `forever` grind is `click`; the runner waiting is `none`;
  an intent with `need` set to `sleep` is `none`; dead is `none`.
- The frame arithmetic: `hurryFrame` with kind `none` returns 0 and
  leaves the state alone.

`tests/ui.test.ts`: the live row of a `times` order has
`.head[data-act="hurry"]` and a `.bar.hurry`; the live row of a `once`
order has neither; `clockHtml` with rate 6 prints `1 s = 6 game min`
in a span with class `hurrying`, and with the default prints
`1 s = 1 game min` without it.

## 6. Docs

`docs/README.md`, "The one scale": after the scale, a paragraph: "Work
you choose in the moment runs faster while you watch: a once order or
a single advanced action runs at up to 6x from start to end, and a
standing or counted order goes 3 minutes ahead each time you click its
row, one click per two-thirds of a second. Body needs, the runner's
waiting, and everything done while you are away run at the one scale."

## 7. What to look at in the browser

- Give "Fell a tree, once". The clock line climbs 1, 2, 4, 6 over two
  seconds and the felling is over in about ten. The moment it ends the
  line reads 1 again.
- Give "Gather sticks, 5 times". Nothing changes until the row's head is
  clicked; then the thin bar fills and drains in under a second, the
  clock line spikes to 11 and falls, and a click during the drain does
  nothing. Clicking steadily reads about 6 on average.
- Let a once order run into the evening: when the runner turns to the
  walk home the line drops to 1 and stays there through the night.
- A pulse mid-way when the order is removed with `x`: the bar goes with
  the row and the line reads 1.

What would look wrong: the line staying above 1 after a task ends (an
ease-out leaked into the next thing); a pulse surviving a reranking; the
list re-rendering every frame during a pulse (the bar is written by id,
not by markup); the once row showing a bar or a click target.
