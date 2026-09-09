# Natural wildlife encounters

Run the prototype's dev server and use the three URLs below. Reloading a seeded
URL starts that world over. These playthroughs use normal generation, landing,
simulation, map clicks, and visibility. They do not place an animal, change a
detection roll, or use the development fixture commands.

## Visible startle: seed 19

Open [seed 19](http://127.0.0.1:5173/prototypes/08/?seed=19).

1. Keep the first survivor, Egle Jankauskaite, and click **Land**.
2. Click **Begin**, then **Continue** on the Goals dialog.
3. At default zoom, find `@`. A `d` stands in the adjacent rock cell to its
   left.
4. Click that `d` as soon as the map opens, around 08:00. This orders an
   ordinary 300 m walk west.
5. Watch for `!` and departure, then open **Log**.

The herd normally reacts around 08:09 and logs:

> A roe deer herd startles and bounds over the rocks.

The `!` belongs over the departing `d`, not over `@`. The herd travels through
elapsed game time rather than relocating when the reaction fires.

Evidence: [initial deer](startle-shots/natural-seed-19-initial.png) and
[visible startle](startle-shots/natural-seed-19-startle.png).

## Heard-only startle: seed 9 in late November

Open [seed 9 on 25 November](http://127.0.0.1:5173/prototypes/08/?seed=9&day=328).
The existing `day` URL parameter selects a start date for testing seasons; it
does not directly override wildlife, weather, positions, or encounter rolls.
The equivalent all-UI setup is seed 9 followed by **wait for the next boat**
34 times.

1. Keep Gudrun Holst and click **Land** at Tjuvmo.
2. Click **Begin**, then **Continue**.
3. At default zoom, click the pine `T` immediately east of `@` around 08:01.
   This orders an ordinary 300 m walk east.
4. Watch and listen while the survivor enters the dark pine.

Around 08:04, after roughly 100 m, an anonymous heard `!` appears while no
animal glyph is visible. The log reads:

> Hooves crash away through the pine to the east.

The low November light is important. In bright daylight, an ungulate close
enough for the current 190-230 m hearing ranges is also within the map's
cell-level visible ring, so an observed departure correctly becomes seen.

Evidence: [heard-only startle](startle-shots/natural-seed-9-heard.png).

## Visible ordinary travel without a startle: seed 3

Open [seed 3](http://127.0.0.1:5173/prototypes/08/?seed=3).

1. Keep Dalia Petrauskaite and click **Land** at Steinskog.
2. Click **Begin**, then **Continue**.
3. Zoom in twice and give no walking or work order.
4. Watch the `d` northeast of `@`.

The deer travels continuously southward at 30 m per game minute, crosses into
the cell immediately east around 08:08, and finishes its first segment around
08:18. Its alarm and escape episode remain zero. There is no `!` and no
departure log. This is the control proving that proximity and ordinary travel
do not themselves imply a startle.

Evidence: [travel start](startle-shots/natural-seed-3-travel-start.png) and
[arrival](startle-shots/natural-seed-3-travel-end.png).

## What was verified

On 9 September 2026, all three cases were replayed in headless Chrome through
the landing dialogs and normal map interaction. The browser gate also traces
one complete escape segment with timestamped position samples, checks gait
speed and monotonic progress, and preserves the same animal DOM node through a
cell crossing. No page exceptions were recorded.

The fixture suite separately covers forest, open, bog, snow, blocked edges,
reduced motion, mute, zoom changes, cue deduplication, and hidden-subject
non-disclosure. Fixtures are controlled coverage, not substitutes for the
three natural playthroughs above.

What would look wrong: the listed animal is absent after a fresh reload, the
heard-only case reveals an animal glyph, ordinary seed 3 travel produces a cue,
a marker appears before the approach, one departure creates duplicate markers
or log entries, an animal moves through water, or a heard-only marker discloses
a stable identity or route.
