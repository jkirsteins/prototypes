# Survidle: the UI rules

The rules every browser pass checks against. Nothing here is a test; a
browser pass reads the page and confirms each rule by eye. Where a rule
does have a test, the test is named, because the two check different
things: a test can see that a node survived a redraw and cannot see that
the page flickered.

The information hierarchy and the identity rules come from
`docs/superpowers/specs/2026-09-07-survidle-ui-overhaul-design.md`; the
rest predate it.

## Left is info, middle is interactive, right is the queue

One rule decides where anything new goes.

- **Left** is what you read: the body, the camp, what is worn, the skills,
  and what happens if you leave. Read-only, with one written exception -
  the away slider, which only changes what is being read beside it.
- **Middle** is what you act through: the map you point at and click, the
  work you can stop, and the tabbed panes you choose from.
- **Right** is the queue. Nothing else goes there.

A browser pass confirms nothing interactive has appeared in the left
column but that slider, and nothing but Orders in the right.
`tests/layout.test.ts` holds the same rule against `index.html`.

## Nothing off the screen at 1440 by 900

The check-in - the bars, Doing with its bar, the ways out, and the Do
pane - must be visible without scrolling the body. A browser pass loads
the page at a 1440 by 900 viewport and confirms `#task`, `#panes` and the
left column's bars sit inside the first screenful. Scrolling inside a
column, or inside the Do pane's item list, does not count as the body
scrolling.

## The Do pane holds what the run has revealed, and hides nothing in it

A subtab holds a handful of rows per purpose rather than a folded list of
everything. Nothing sits behind a "more (N)": a row a survivor cannot
start yet still shows and says why.

A row appears when the opportunity that names it is discovered, and from
that moment it is always visible. What a run has not reached is not drawn
at all - because a list of refusals for work the player has no concept of
is the long list the overhaul set out to kill. Measured before this
changed: day 1 drew 84 rows, 12 could be started, and Make offered 22
recipes of which none could be made.

Revealed is not startable, and the difference is the point. A row may
still be blocked on the season, on the place, on materials, or on a step
that is itself on screen, and each of those blocks teaches something: the
year, the ground, the shopping list, the order of operations. What is
gated is the block that teaches nothing: a row that needs a tool is drawn
only while the survivor holds the tool, whatever the world already knows.
A knife recipe appears with stone in hand; knife work appears with the
knife. That is possession and not discovery, and it is a life's, not the
world's - an heir inherits what the world knows and not what the dead
survivor carried.

Waiting is not a goal. An opportunity that is met by the clock alone - a
season, a drink the self-care row takes on its own - is an FYI: told once
in the field notes with its note, complete the moment it is told, never
current, and never standing in front of a later rung.

A browser pass confirms every purpose of every subtab that draws rows
draws rows, that the filter box searches across all of them rather than
only the pane in front, and that the filter cannot reach a row the panes
will not draw. `tests/purpose.test.ts` holds every row to having exactly
one home and every home to having at least one row;
`tests/reveal.test.ts` holds every row to naming exactly one opportunity
that exists, and the reveal graph to having no cycle.

## A Do row is two lines, and says less when it can

A row you can do says its name and how long. A row you cannot says why.
The detail is under `more`. A browser pass flags a row that wraps to three
lines, or a startable row carrying prose on its face.

## Nothing is taken away by a redraw

The hardest rule, and the one most easily broken by a later change.

`tests/identity.test.ts` and the churn budget in `tests/churn.test.ts`
cover node identity and redraw counts. They cannot see flicker, so a
browser pass additionally confirms, by eye:

- Sweeping the pointer across the map does not flicker the tooltip, and
  the tooltip never lingers on a cell the pointer has left.
- Scrolling the Do pane's item list, then letting the game run a minute,
  leaves the scroll where it was.
- Switching to Log and back leaves the Do pane at the same subtab, the
  same purpose and the same scroll position.
- Typing in the filter never loses the caret, and pressing the mouse down
  on a row and releasing on it still counts as a click.

The rules underneath, for whoever is changing this code rather than
checking it:

- Every structural container carries an `id` or a `data-*`, because
  `keyOf` answers null without one and `morphChildren` then matches by
  position - right for a layout div that never moves, wrong for anything
  whose siblings come and go.
- `#doitems` is the Do pane's only scroll container and is never replaced.
- All four panes exist at once; switching sets `hidden`. A pane rendered
  on demand is a pane whose scroll position starts again every time.
- `innerHTML` is assigned in exactly one place, `setPanel`, plus the map
  legend written once at startup. `tests/innerhtml.test.ts` enforces it.
- No per-frame value is in any panel's markup. Bar widths and the
  tooltip's position are written onto elements by `src/ui/bars.ts`.

## The map's tooltip is verified visually, and works without a pointer

The tooltip is translucent, so it must stay legible over every terrain
colour and in both lighting states. A browser pass checks that by eye at
both widths - a test can only see that its text is right.

At `390x844x3,mobile,touch`, a tap opens it, its buttons are thumb
reachable, and its close button dismisses it without walking anywhere. A
desktop window resized to 390 never trips `(hover: none)` and would pass
a check that never ran, so the pass uses touch emulation.

## The board is centred on the survivor at every width

The survivor is the middle glyph and the board is wider than a phone, so
`.scroll-x` must centre the board in both axes and `.grid` must carry no
auto margin: an auto margin beats the container's alignment and, once the
board overflows, resolves to zero and pins the board to its left edge. On
2026-09-18 that showed a phone the empty west of the world. Under 700px
the board also has a height of its own rather than what the legend leaves
of 50vh. A browser pass at 390 confirms the `@` is in the middle of the
visible board; `tests/layout.test.ts` holds the declarations.
`docs/phone-audit-2026-09-18.md` is the audit that found it.

## Buttons reachable by thumb at 390 wide

Under the phone breakpoint, buttons and inputs are at least 40 pixels
tall, per the `@media (hover: none)` rule. The map's legend sits behind
the same rule, standing in for the glyph tooltips a touch device has no
hover to trigger. Since the rule only trips on a real touch device, a
browser pass checks this with touch emulation, not a resized desktop
window.

## The activity queue is strictly top to bottom

Every row follows the same rule, including Camp maintenance and Self-care.
The first ready row runs. A row set to `on block: skip` is passed over when
it cannot run. A row set to `on block: stop` stops every row below it. Those
rows carry a compact `blocked` label; their position already shows what is
ahead of them.

The queue contains every same-region action the survivor will perform.
When an action needs another cell, it places an exact once-only Walk
immediately before itself. A direct map click creates the same kind of Walk
at the top. The central strip shows the active row's current task and its
only progress bar.

## Event logs put the newest entry first

The Log pane and the event list shown after time away both render their
newest event at the top. Storage remains chronological so simulation and
save behavior do not depend on presentation order.

## Every browser pass runs at both widths and says so

A browser pass is not done at one width. It runs the page at 1440 by 900
and again at 390 wide with touch emulation, and its record - the Built
paragraph, or wherever the pass is written up - names both widths it ran
at. A pass that only ran one width has not checked this page.
