# Survidle: the UI pass

The roadmap's item of that name, before the tester round: a tester who
knows what they want finds it in one look, nothing a check-in needs is
off the screen, and the page fits a phone. Nothing in the simulation
changes; the Do panel's rows still come from `availableTasks` and the
orders still go through `giveOrder`.

What the page is today, measured in `src/style.css` and `index.html`:
three columns of 300px, at least 560px, and 420px, one breakpoint at
1300px to two columns and none below, a map of 72 glyphs at 11px, and a
right column that stacks Doing, Ahead, Do, Inventory, Log and Journal in
that order, so the log sits under sixty to seventy Do rows. The order
strip (`ui.until`, `ui.n`, `ui.deliver`, `ui.where` on `UiState`, read
by `stripRequest`) is a mode: every Do row renders shut when its skill
has not earned the strip's kind.

## Decisions taken by the author's pre-approval

- **The kind is chosen per row, and the strip goes.** A row's plain click
  is "once", as it reads. A "more" control on the row expands it in place
  with the other kinds for that row alone: N times, until camp has N,
  keep camp at N, forever, with the bring-it and where choices beside
  them. Kinds the row's skill has not earned are greyed with the level
  and the hours to it, the way the skills panel words it, so the promise
  of the rung stays beside what can be done now. One row is open at a
  time; `ui.open` holds which. `stripRequest` becomes `rowRequest(choice,
  id, arg)` over the row's own choice, with the same output. Passed over:
  keeping the strip as a default the row can override, which keeps the
  mode and its shut rows.
- **Fold and filter.** Each Do group is a fold that remembers its state
  in local storage (`survidle.ui`). A text box at the top of the panel
  narrows rows by label as you type. Rows that cannot start and whose
  skill is more than one level short fold under a "more (N)" line per
  group. Within the Make group, what can be made now lists first. Passed
  over: a search that matches small print too, which returns most of the
  panel for "wood".
- **The right column is a check-in, in order.** Doing (with the order
  list), Ahead, the Log slice, then Do, Inventory and Journal. Each column
  is the viewport's height and scrolls inside itself; the Do panel's list
  scrolls inside its own box; the log keeps its fixed slice. At 1440 by
  900 the bars, Doing, the order list, Ahead and the log's first lines
  are on screen without scrolling. The away report is an overlay and
  already on screen. Passed over: a fourth column, which the map's width
  forbids.
- **One column under 700px.** Doing first, then Ahead, then the map in a
  horizontal scroll box scrolled to the survivor on each rebuild, then
  the rest. Buttons at least 40px tall on touch. The glyph tooltips the
  map gives on hover move into a legend line under the map on devices
  without hover (`@media (hover: none)`), since touch has no hover; the
  zoom keys already have buttons. Passed over: a separate phone page,
  which would fork the panels.
- **The guidelines page is `docs/ux.md`** and every browser pass from now
  on runs at 1440 by 900 and at 390 wide against it. Passed over: a
  paragraph in the README, which no pass would be checked against.

## 1. The kind per row

`UiState` loses `until`, `n`, `deliver`, `where` and gains
`open: { id: TaskId; arg: string } | null` and `choice: RowChoice` where
`RowChoice = { until: "once" | "times" | "campHas" | "keep" | "forever"; n: number; deliver: "leave" | "camp"; where: "nearest" | SpotId }`,
reset to `{ until: "once", n: 10, deliver: "leave", where: "nearest" }`
whenever a different row opens. `rowRequest(choice, id, arg)` in
`src/ui/render.ts` is `stripRequest` with the choice passed in; the
`NOT_ORDERS` rule is unchanged.

A Do row renders as today for its plain click (a once job through
`rowRequest` with the default choice). A "more" mini button on the row
sets `ui.open` to that row. The open row renders an expansion under its
label: the kinds as buttons (N times, until camp has N, keep camp at N,
forever) with a number field for N, a deliver toggle (bring to camp /
leave where it is) and a where select (nearest, or the region's spots)
where the task has a where; the kinds the row's skill has not earned
(`withinLadder` from `sim/ladder.ts`, as the strip used) are greyed with
"needs <skill> <level>, about <hours> h" in the small print the skills
panel already words. Clicking an earned kind gives the order through
`rowRequest` with the expansion's choice and closes the row. The
`data-strip` handlers in main.ts and the strip markup go; the `commitStripN`
clamp stays as the number field's.

The `setPanel` guard that skipped a rewrite while the strip's number
field had focus keeps working for the expansion's number field, which
carries the same `data-strip-n` attribute.

## 2. Fold and filter

`src/ui/dopanel.ts` (new; `actionsHtml` moves there from panels.ts with
the row helpers it uses, so panels.ts shrinks):

- `foldState(storage)` and `saveFold(storage, groupId, open)`: a record
  of group id to open flag under `survidle.ui`; every group open by
  default.
- A filter box at the top of the panel (`<input data-do="filter">`), its
  value kept in `ui.filter`; rows whose label does not contain the
  filter (case-insensitive) are left out; group headings whose rows are
  all filtered out are left out; an empty filter shows everything.
- Per group, rows that cannot start now and whose skill is more than one
  level under the row's recommended level fold under a "more (N)" line
  that opens them for that render; `ui.moreOpen` holds the group ids
  opened. Rows that can start or are within a level stay visible.
- In the Make group, rows that can start now list before rows that
  cannot, both keeping their original order otherwise.
- The tabs stay as the group headings; a heading click folds its group.

The `setPanel` guard also skips the rewrite while the filter box has
focus (`data-do="filter"` joins the focused-input check), so typing is
not interrupted; the panel re-renders on the next frame after blur, and
the filter is applied through `ui.filter` on each keystroke by a
`keyup` handler that calls `render()` once.

## 3. Columns that scroll inside themselves

`src/style.css`:

- `#app { height: 100vh; }` and `.col { overflow-y: auto; }` so each
  column scrolls inside itself; the body never scrolls horizontally.
- `#actions .rows { max-height: 50vh; overflow-y: auto; }` around the Do
  panel's rows, so the panel scrolls inside its box.
- The log keeps `#log .entries { max-height: 320px }`.

`index.html`'s right column order: `#task`, `#forecast`, `#log`,
`#actions`, `#inventory`, `#journal`.

## 4. The phone layout

`@media (max-width: 700px)`: `#app` is one column; the order is `#task`,
`#forecast`, `#map` in a `.scroll-x` wrapper (`overflow-x: auto`), then
`#stats`, `#actions`, `#inventory`, `#log`, `#region`, `#gear`,
`#skills`, `#journal`, `#clock`, the settings panels last. The map's
wrapper is scrolled so the survivor's glyph is centred on each map
rebuild (`mapHtml` already knows the survivor's column; main.ts sets
`scrollLeft` after `setPanel("map", ...)` returns true). Buttons and
inputs get `min-height: 40px` under `@media (hover: none)`, and the
legend line under the map (`#map .legend`) lists the terrain letters
with their names and the survivor and camp glyphs, rendered only under
`(hover: none)` by CSS (present in the markup always, hidden otherwise).

## 5. docs/ux.md

A page of rules the browser pass checks: nothing is pushed off the
screen at 1440 by 900 (the bars, Doing, the order list, Ahead and the
log's first lines visible without scrolling); a list past a dozen rows
has a fold and a filter; the check-in fits above the fold; a Do row is
two lines, label and small print, with its bar; buttons reachable by
thumb on a phone; every browser pass runs at 1440 by 900 and at 390 wide
and says so in its record. The README's development section points at
it.

## 6. Tests

- `rowRequest` gives the same output `stripRequest` gave for each kind;
  `NOT_ORDERS` tasks ignore the choice.
- The open row renders the four kinds, greys the unearned ones with the
  level and hours text, and a click on an earned kind produces an order
  (through the existing `giveOrder` path in a DOM test that dispatches the
  click) and closes the row.
- The filter narrows rows by label and drops empty groups; the fold state
  round-trips through storage; folded groups render their heading only;
  the "more (N)" count matches the rows it hides; Make lists startable
  rows first.
- The legend lists every terrain letter the map draws.
- `index.html` has the right column in the check-in order (a test reads
  the file and asserts the id order).
- CSS is not unit tested; the browser pass at both widths is its check.

## 7. The browser pass

Chrome at 1440 by 900 on seed 17: the bars, Doing, the order list, Ahead
and the log are on screen with no scrolling; the Do panel scrolls inside
its box; a row's "more" opens the kinds and a keep on a row whose skill
is under the rung is greyed with the level; the filter "stick" leaves the
stick rows; a group folds and stays folded over a reload. At 390 wide:
one column, Doing first, the map scrolls sideways centred on the
survivor, the legend shows, buttons are thumb-sized, nothing overflows
the body horizontally. The record of the pass names both widths.

## 8. What this does not do

- Change any task, order, or the ladder's rungs.
- Redesign the map's glyphs or colours.
- The save sync, the tester link, or any panel content beyond the Do
  panel's shape and the columns' order.
