# Map scale and surroundings - design

2026-08-10. Approved in brainstorming; this document records the design. It
builds on the multi-region design of the same date.

## The problem

Three complaints, one cause.

The default view crops the playable map. On a 1440x749 window Iberia opens
1700 units wide showing 885 of the map's 1150 height, so the whole north
coast - Asturias, Galicia's shore, Pamplona - is off screen at the moment the
player is asked to choose a land. The Baltic map crops the same way.

The zoom floor stops too close. `MIN_ZOOM = 1.3` deliberately made the whole
map never fit, so there is no view in which a player can see their realm in
the world.

And there is no world to see. Geometry is baked 1200 units past the canvas,
but the Baltic map's neighbour list is five countries and Iberia's is two, so
zooming out mostly reveals the flat sea rectangle.

## The zoom model

Three views, each defined by a rule rather than a per-map number, so a third
region inherits the behaviour:

- **The painted rect** is the canvas outset by `MapData.margin` on every side.
  It is exactly what the sea rectangle and the neighbour geometry cover, and
  it becomes the pan and zoom bound. Today's bound is the canvas *fit*, which
  is why a landscape window can already pan into the margin a little.
- **The default view** (`homeView`) is the whole canvas fitted to the
  viewport, then widened by a **ring** of `DEFAULT_RING` (0.12 to start).
  Every land is therefore always visible on load, inside a band of unplayable
  ground. The ring is the one number tuned by eye in Chrome.
- **The floor** is the largest viewport-shaped view that fits *inside* the
  painted rect. Not the smallest view that covers it: a view wider than the
  painted rect would show unpainted page either side of the sea.

`MIN_ZOOM` retires. Its doc comment ("the whole map never fits on screen and
the player pans instead") states the behaviour this design removes, so it must
not survive as a constant nobody reads.

`MAX_ZOOM` keeps its value of 8 and its meaning, but its reference point has
to move. Today `clampW` measures both bounds against `base`, and `base` is
about to grow from the canvas fit to the painted rect - which would silently
deepen the zoom-in limit by the same factor the floor gained, putting the
closest view about 2.4x nearer than it is today. So the narrowest view is
`defaultView.w / MAX_ZOOM`, and the widest is the floor. The two bounds stop
sharing a reference, which is the whole change: one is anchored to the map the
player plays on, the other to the ground it sits in.

`fitView` currently assumes an origin of (0, 0). It gains a rect-taking form
so the painted rect - origin (-margin, -margin) - can be fitted by the same
code that fits the canvas.

Both maps re-bake at `margin: 2000`. On a 1440x749 window that gives:

| | default today | default new | floor new | floor vs today |
|---|---|---|---|---|
| Baltic | 2070 wide | 3014 wide | 5000 wide | 2.4x |
| Iberia | 1700 wide | 2476 wide | 5400 wide | 3.2x |

Both clear the "at least 2x more zoomed out" requirement measured against
today's floor. 1570 would be the bare minimum for the Baltic map; 2000 rounds
up and leaves room for the surroundings to be worth looking at.

## The label ladder

Every label is SVG text in map space, so its size on screen is
`authoredFontSize * scale`, where `scale` is viewport pixels per map unit.
That makes one rule enough:

**A label is drawn while it would render at least `MIN_LABEL_PX` CSS pixels,
and not below.** `MIN_LABEL_PX` is 8 - the value the Chrome pass tunes if 8
proves wrong, and the only number the whole ladder rests on.

Sorted by authored size, that produces the ladder for free, outermost first:
settlement names (12px) go, then river names (16px), then the defense badges
(18px), then the people labels (30px). No per-label threshold to hand-tune or
drift.

The badges follow the same rule deliberately. At the floor the playable map is
a fifth of the screen width; twenty-six counter-scaled badges over it would be
precisely the mush the other labels are being removed to avoid. Ownership
shading and realm outlines carry the political read at that depth.

**Where the sizes live.** The font sizes stay in `src/style.css`, which is
their only current spelling, and the layer table in TypeScript names the CSS
class and the scale below which that class hides. A test parses `style.css`
for each named class's `font-size` and asserts the paired threshold still
means `MIN_LABEL_PX`, so the two cannot drift apart silently. This is the
`RESHUFFLE_PULSE_MS` lesson in AGENTS.md - a number hand-copied between CSS
and TS had already gone out of sync once.

**Mechanism.** `attachInteraction` computes `scale` on every view change and
writes one `data-detail` attribute on the `<svg>`; CSS hides layers by
attribute. The tier boundaries ARE the sorted thresholds, so the attribute is
"how many layers are still legible" rather than a second set of numbers.

## The swap

A new `LabelKind`, `group`, authored at 64px and shown by the **inverse**
rule: visible only while the people labels are not. The map is
therefore never wordless - zoom out and per-people labels give way to a few
big ones; zoom in and they trade back. Classic atlas behaviour, and the reason
the ladder is a swap rather than a fade to nothing.

Authored per region, in the bake beside the existing labels:

- **Baltic**: `FINNIC PEOPLES` across the north, `THE BALTS` across the
  south; `SCANDINAVIA`, `RUS'`, `POLAND` in the surrounding ground.
- **Iberia**: `AL-ANDALUS` across the south, `THE CHRISTIAN NORTH` across the
  top; `FRANCIA`, `THE MAGHREB` outside.

The existing `neighbor` labels (Lands of Rus', Mazovians, FRANCIA, MAGHREB)
keep their present size and mid-zoom role.

**A `group` label may sit outside the canvas**, which nothing does today:
`tests/data.test.ts` asserts every label is within `[0, width] x [0, height]`.
That bound widens to the painted rect for labels, and stays the canvas for
settlements - a settlement outside the playable map would be a site nobody can
reach.

## The surrounding geography

Both bakes extend `CLIP_MARGIN` to 2000 and lengthen their neighbour lists.
The Baltic map regains Denmark (dropped once for being off-canvas at the old
frame) and gains Norway and Germany, with more of Poland, Rus' and Belarus
arriving for free from the wider clip. Iberia gains Algeria and Tunisia, much
more of France, and Corsica and Sardinia.

Drawn in the existing grey unplayable style, under everything, never
interactive. Both scripts already warn when a listed neighbour contributes no
path, which is what keeps a hopeful country code from silently doing nothing.

**Size budget.** `baltic.json` is 986 KB and `iberia.json` 464 KB today, and
both ship in every build. A larger clip and more countries will grow them; the
budget is **2.5 MB per region**, checked by a test so it cannot creep. If a
bake exceeds it, the fix is coarser coordinates for neighbour geometry
(`geoPath.digits(0)`, grey context nobody measures) rather than dropping a
country and leaving a straight cut through land.

## Testing

- Unit: the three view rules (default contains the whole canvas plus the ring;
  the floor fits inside the painted rect and reaches it on the limiting axis;
  clamping keeps every view inside the painted rect) over both regions and
  several viewport aspects, portrait and landscape.
- Unit: `detailFor(scale)` at each boundary, including that `group` labels and
  people labels are never both visible and never both hidden.
- Guard: the CSS/TS font-size agreement described above.
- Data: label bounds widened to the painted rect; every region authors at
  least one `group` label; `margin` is 2000; the per-region size budget.
- E2E in Chrome, both regions: the default view shows every land with a band
  around it; zooming to the floor swaps the people labels for the group ones
  and drops settlements, rivers and badges; zooming back in restores them;
  and the labels present at each tier are read, not just counted - nothing
  collides, nothing is stranded over the wrong ground.

## Out of scope

- Counter-scaling any layer to a constant screen size.
- Per-region tuning of the ring or the thresholds; one rule serves both.
- Any change to card rules, AI or balance.
