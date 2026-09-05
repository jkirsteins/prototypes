# Survidle: the walk drawn as a line, and a mark on camp

While the survivor walks, the map tints the cells still to be walked and
shows nothing of the cells already walked. A tinted band is not a path:
at the close zoom it is a fat yellow smear beside the `@`, at the coarse
zooms it collapses to a blotch, and once the walk is under way there is
no way to see where it began. This spec draws every walk as a line
through the glyph centres, solid ahead of the survivor and dashed behind,
whatever started the walk. It also marks the current region's camp with
an `x` whenever the survivor is not standing on it, so home is on the
map before it has a fire or a roof.

Extends `2026-09-02-survidle-design.md` (the map, routes) and
`2026-09-03-survidle-light-and-colour-design.md` (section 1.2, where the
route tint became an overlay; that overlay goes away here).

## 1. What is drawn

A walk is a `walk` or `travel` task with a `Route`. Every walk goes
through `beginTask`, which computes the route once, so the line is the
same whether a button, the order runner, the body's walk home or the
heir's walk started it. The line lives exactly as long as the route:
arrival, stopping by hand and a fall through the ice each set the route
to null, and the line goes with it. Nothing persists after the walk; this
is not a trail of the day.

Two polylines, both through glyph centres:

- **Ahead**, solid: from the survivor's glyph through every remaining
  route cell to the target.
- **Behind**, dashed and dimmer: from the cell the walk started on
  through every cell already passed to the survivor's glyph.

They meet at the survivor's glyph, under the `@` marker. The join is the
glyph centre, not the survivor's fractional position inside the cell; the
map is glyphs, and a line that slid across a glyph between frames would
draw the eye for nothing.

The tinted route cells (`.rt`) are removed. Two encodings of one fact is
noise, and the band was the problem.

## 2. State: the route remembers what it walked

`Route` gains one field:

```ts
export interface Route {
  target: number;
  path: number[];
  /** Cells this walk has left behind, the start cell first. */
  walked: number[];
  label: string;
  ice: IceMode;
  lastLand: number;
}
```

- `beginTask` sets `walked: [from]` when it creates the route.
- `stepWalk` pushes each cell it shifts off `path` onto `walked`, in the
  same statement, so the two can never disagree.
- Invariant, for the life of a route: `walked[0]` is the start cell and
  `walked.concat(path)` is the start cell followed by the route as first
  found. `stepWalk` may cross several cells in one minute; the invariant
  holds after each.
- Save migration in `save.ts`, beside the existing `lastLand` line:
  `state.route.walked ??= []`. An old save mid-walk draws its behind line
  from the survivor onward from load, which is the truth: nothing is
  known of where it began.

Nothing else reads `walked`. `routeKm`, `routeMinutes`, `describeWhere`
and the walk bar keep reading `path`, which still means what it meant.

## 3. Rendering: an SVG overlay on the grid

`mapHtml` appends one element to the grid, after `<i class="shade">`
and before the closing tag:

```html
<svg class="walk" viewBox="0 0 72 36" preserveAspectRatio="none">
  <polyline class="walk-behind" points="..."/>
  <polyline class="walk-ahead" points="..."/>
</svg>
```

- The viewBox is in glyphs (`VIEW_W` by `VIEW_H`), so a route cell maps
  to the point `((c.x - x0) / z + 0.5, (c.y - y0) / z + 0.5)` and the
  drawing is the same code at every zoom. `preserveAspectRatio="none"`
  stretches it over the 11 by 14 px cells.
- Points are computed without the on-screen bounds check `toGlyph`
  applies. A behind line longer than the view runs off the edge and the
  SVG clips it; dropping off-screen points would instead join the two
  visible ends with a false straight segment.
- Consecutive cells that land in the same glyph collapse to one point,
  so at the coarse zooms the line is a clean run rather than a hundred
  points on top of each other. A polyline with one point draws nothing,
  which is what a walk that has not yet left its first glyph or a walk
  smaller than one glyph should show.
- The behind polyline is emitted first, so where the two overlap at the
  join the solid ahead stroke is on top.
- When there is no route the `<svg>` is still emitted, empty, so the map
  markup has one shape and the CSS never has to consider its absence.

Styles, in `style.css` where `.rt` was:

```css
/* Your walk: a line through the glyph centres, solid ahead, dashed behind. */
.grid .walk { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
.grid .walk polyline { fill: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.grid .walk .walk-ahead { stroke: rgba(230, 194, 41, 0.9); stroke-width: 2px; }
.grid .walk .walk-behind { stroke: rgba(230, 194, 41, 0.45); stroke-width: 1.5px; stroke-dasharray: 3 3; }
```

`vector-effect: non-scaling-stroke` keeps the stroke in screen pixels
under the stretched viewBox; without it the horizontal and vertical
strokes would be different widths.

Stacking: the overlay has no `z-index` and sits after the shade in the
DOM, so it is above the night shade and below the `@` marker (`z-index:
1`) and the fire glow (`z-index: 2`). The `@` stays on top of the join;
the line is visible at night; the light-of-the-hour tint in `.grid::after`
lays over it like everything else.

`mapKey` needs no change. It already carries the survivor's cell and the
route's `path.length`, and `walked` grows by exactly what `path` loses,
so every change to the line already changes the key.

The legend key `underlined: something lies there` gets a sibling:
`line: your walk, solid ahead, dashed behind`, drawn as a short inline
sample of the ahead stroke so the legend shows the mark it names.

## 4. The camp marker

A camp shows on the map only once it has something on it: `F` while the
fire is lit, `H` once there is a roof. A day-one camp with a cold pit and
no roof is an unmarked cell, and the survivor who walks two kilometres
from it to the shore has nothing on the map that says where home is.

The current region's camp gets a marker of its own, `x`, class
`mk-camp`, whenever the survivor's glyph is not the camp's glyph. The
rules, in the order `mapHtml` already applies markers:

- `F` and `H` take precedence, as today: they are the camp, better
  marked. `x` is set only where the camp glyph has no marker yet.
- The survivor's glyph takes precedence over everything; when the two
  share a glyph there is no camp to point at. That is what "near" means:
  one glyph, so 300 m at the close zoom and the whole neighbourhood at
  the whole-north zoom.
- Only the current region's camp. Orders belong to a camp and the walk
  home goes to this region's camp, so this is the one that means "home".
  Other visited regions' camps keep showing through `F` and `H` as today.
- The marker is drawn whether or not a walk is under way.

Style, beside the other markers:

```css
.grid .c.mk-camp { color: #e6c229; background: #3a3210; }
```

The same hue as the `@` at a quarter of its weight, so the eye pairs
the two without mistaking one for the other. Title: `camp, <region
name>`. Legend: `x camp` beside `@ you`.

`mapKey` needs no change yet: the survivor's cell (which fixes the
region) and the zoom are in it, and the marker is a function of those
two and the region's camp cell, read from the region state. That cell
does not move today. When 3's siting makes it a chosen cell, it joins
the key and nothing else about the marker changes.

## 5. Tests

- `ui.test.ts`: a new game shows no `.mk-camp` (the survivor stands on
  the camp). Walk one cell away with `placeAt`: exactly one `.mk-camp`,
  on the camp cell's glyph, with the region's name in its title. Light
  the fire: the glyph is `.mk-fire` and there is no `.mk-camp`. At the
  whole-north zoom, one cell away: no `.mk-camp`, since the two share a
  glyph.
- `tasks.test.ts`: start a walk to the forest, advance a few minutes at a
  time until it ends; after every advance `route.walked[0]` is the start
  cell and `route.walked.concat(route.path)` equals the start cell plus
  the route `findRoute` returns for the same ends. On arrival the route
  is null.
- `save.test.ts` (or wherever the `lastLand` migration is tested): a
  saved route without `walked` loads with `walked` equal to `[]`.
- `ui.test.ts`, replacing the `.c.rt` assertion: after `startTask(...,
  "walk", "spot:forest")` the map has no `.c.rt`, one `polyline.walk-ahead`
  whose point count is the number of distinct glyphs along
  `[here, ...path]`, and one `polyline.walk-behind` with a single point.
  Advance until at least two cells are passed: the behind polyline has
  as many points as distinct glyphs along `[...walked, here]`. Stop the
  walk: both polylines are empty.
- `light.test.ts`: `.grid .c.rt` leaves the list of overlay selectors
  that must set no background; the rule no longer exists.

## 6. Docs

`docs/README.md`, the "You are a point on the map" bullet: "the remaining
route is highlighted while you walk" becomes "your walk is drawn as a
line, solid ahead of you and dashed behind, and it goes when the walk
ends".

## 7. What to look at in the browser

Start a walk to the outcrop and watch it at all four zooms. What should
be true:

- A line runs from the `@` to the target, around the lake if the route
  goes around, and a dashed line grows behind the `@` back to camp as
  the walk goes on. Both meet under the `@`.
- Stop the walk: both lines vanish and the `@` stands where it was.
- Give a `keep camp at 4 litres` order with empty vessels and let the
  runner take the walk to the shore: the same line, without a button
  having been pressed.
- At night the line is visible over the shade and the fire rings still
  glow over it.
- At the whole-north zoom a region-hop walk is a short line or nothing;
  no blotch.
- On day one, before the fire is lit, walk to the shore: a yellow `x`
  stays on the camp cell the whole way and the ahead line ends on the
  shore, not on it. Walk back: the `x` goes when the `@` lands on it.
  Light the fire: `F` where the `x` was.

What would look wrong: a straight segment jumping across the view where
the behind line leaves the screen and re-enters (points were dropped
instead of clipped); the line sliding inside a glyph as the survivor
crosses a cell (the fractional position was used); a line still showing
after a fall through the ice; the `@` hidden under the join; an `x`
beside an `F` or `H`, or an `x` in a region you are not in.
