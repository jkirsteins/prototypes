# Phone audit, 2026-09-18

A read of the whole page at 390 by 844 with touch emulation (headless
Chromium, `deviceScaleFactor` 2, `(pointer: coarse)` and `(hover: none)`
both true), seed 42 on day 200, from the landing through the check-in,
the map, the Do pane, settings and the catalog. The page is one
responsive layout - `@media (max-width: 700px)` folds the three columns
into one and orders the sections, `@media (hover: none)` grows every
control to 40px and lets a tap open the glyph tooltip -
not a phone URL of its own; the phone check-in page the roadmap names is
still unbuilt and waits for item P. Shots in `docs/phone-audit-shots/`.

## Found and fixed

1. **The board showed the empty west of the world, never the survivor.**
   `.grid` carried `margin: 0 auto`, and an auto margin beats the
   container's `place-items: center`; once the board (792px) is wider
   than the panel (352px) the margin resolves to zero and the board pins
   to the left. The survivor, the middle column, sat 200px off the right
   edge. On top of that, `#map` was 50vh with a 300px legend inside it,
   which left the board a 94px strip. Now `.scroll-x` sizes both tracks
   `minmax(0, 1fr)`, `.grid` has no auto margin, and under 700px the
   board is a page of the right slot (Map, Alerts, Weather; the map the
   default) with 70vh of its own.
   `before-map.png` against `after-map.png`; a tap on a cell now opens
   the tooltip (`after-map-tap.png`).
2. **The boat's three cards were 40px each over 200px of person.**
   `.card { flex: 1 1 0 }` in a column shares the row's height three
   ways. `flex: none` under 700px. `before-landing.png` against
   `after-landing.png`.
3. **The Weather | Alerts tabs sat at the top of the page, three panels
   above the panel they switch.** `#rightpages` and `#alerts` had no
   `order` and fell to 0. Both are 3 now, beside `#weather`.
4. **Settings ran its labels together on one line, checkboxes 40px tall
   and floating away from their words.** Each label is its own flex row
   under 700px, and a checkbox is 22px with the label as the thumb's
   target. `before-settings.png` against `after-settings.png`.

`tests/layout.test.ts`, "the phone", holds each of the four to its one
declaration.

## Reads well as it is

The stocks strip in two rows of two; the check-in (task line, the
survivor's bars, weather, If you leave, the queue) in one screen and a
half, every button thumb height (none under 40px on the whole page); the
Do pane with its purposes as a strip above the rows; the opportunity
catalog at six rows a page; the stock panel and the manual as overlays;
the sync banner over the top of the page with `take over` and `refresh`
at thumb height (`docs/sync-shots/02-phone-held.png`). No horizontal
scroll anywhere (`scrollWidth` 390), and the page throws nothing.

## Left as found, for a later pass

- ~~The legend is 300px between the board and the Do pane~~ Decided the
  same day, twice: first folded behind a button, then removed outright at
  every width - a tap on a cell names its ground, and the desktop never
  showed it either. The board is a page of the right slot, first of Map,
  Alerts, Weather, and takes 70vh.
- ~~The page is 3,600px tall~~ Shorter by a third the same day: the map
  and the queue are pages of the right slot beside the alerts and the
  weather (Map, Queue, Alerts, Weather; the manual and the settings are
  links in the footer), and If-you-leave is not shown on a phone.
  Skills, ten bars of four lines, are still the long tail at the foot.
  The activity strip sits directly over the tabs and the Queue tab's foot
  carries the running task's bar (`after-task-running.png`).
- **The Camp tab was one run of lines** - the fire's state, its two
  buttons and its fuel bar on one row, then "fire site", the yard, and
  four rosters with nothing between them. It is four groups under small
  headings now - Fire, Standing, Stores, About - one fact to a line, the
  fire's setting on a row of its own, what stands as a list
  (`after-camp-tab.png`). Every string the tests read is unchanged.
- **Tab rows wrap** (Journal onto a second line; Exploration and Mastery
  in the catalog). Readable; a scrolling row would be tidier.
- **Small type**: several readings are 10 to 11px (`.mini`, `.dim`, the
  skill sub-lines, `.wx-rate`). Legible at 2x on a dark ground but under
  the 12px most phone guidance wants for body text.
- **The map tooltip opens over the legend**, not over the board, since it
  is anchored below the panel; readable, but a first-time reader looks
  at the cell they tapped.
