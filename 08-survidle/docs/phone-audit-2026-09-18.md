# Phone audit, 2026-09-18

A read of the whole page at 390 by 844 with touch emulation (headless
Chromium, `deviceScaleFactor` 2, `(pointer: coarse)` and `(hover: none)`
both true), seed 42 on day 200, from the landing through the check-in,
the map, the Do pane, settings and the catalog. The page is one
responsive layout - `@media (max-width: 700px)` folds the three columns
into one and orders the sections, `@media (hover: none)` grows every
control to 40px and shows the legend in place of the glyph tooltips -
not a phone URL of its own; the phone check-in page the roadmap names is
still unbuilt and waits for item P. Shots in `docs/phone-audit-shots/`.

## Found and fixed

1. **The board showed the empty west of the world, never the survivor.**
   `.grid` carried `margin: 0 auto`, and an auto margin beats the
   container's `place-items: center`; once the board (792px) is wider
   than the panel (352px) the margin resolves to zero and the board pins
   to the left. The survivor, the middle column, sat 200px off the right
   edge. On top of that, `#map` was 50vh with the 300px legend inside it,
   which left the board a 94px strip. Now `.scroll-x` sizes both tracks
   `minmax(0, 1fr)`, `.grid` has no auto margin, and under 700px the
   board has a height of its own (55vh) with the legend following it.
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

- **The legend is 300px between the board and the Do pane** on every
  phone check-in. It stands in for the hover tooltips, and a tap on a
  cell now gives the tooltip anyway; folding it behind a `legend` toggle
  would give the check-in its screen back. A design call, not made here.
- **The page is 3,600px tall**: skills alone are ten bars of four lines.
  The check-in order puts what matters first, so this is a scroll rather
  than a fault; the phone page in the roadmap is the answer.
- **Tab rows wrap** (Journal onto a second line; Exploration and Mastery
  in the catalog). Readable; a scrolling row would be tidier.
- **Small type**: several readings are 10 to 11px (`.mini`, `.dim`, the
  skill sub-lines, `.wx-rate`). Legible at 2x on a dark ground but under
  the 12px most phone guidance wants for body text.
- **The map tooltip opens over the legend**, not over the board, since it
  is anchored below the panel; readable, but a first-time reader looks
  at the cell they tapped.
