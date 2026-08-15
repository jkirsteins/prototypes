# An arrow lands where it says, and can be seen doing it

Two complaints about the same layer, from the same pass over the map.

**An arrow overshoots the land it is aimed at.** A raid out of the Lower
Daugava Livs into Jersika is drawn crossing the border and then crossing
Jersika as well: the head and both barbs come out the far side and stand on
Selonian ground, so the arrow reads as an attack on the wrong land. Jersika is
20.7 units deep along that border's normal and the arrowhead reaches 34.

**A quarrel between two rivals is close to invisible.** Every arrow that is
neither yours nor aimed at you rests at 45% opacity, filled with the actor's
own land colour, which is a colour out of the same pale palette the map paints
land in. Measured against the grey most lands carry, that composites to a
contrast ratio of 1.01. What another faction is about to do to the land you are
about to attack is half of that decision, and the map is whispering it.

Part one is the geometry, part two the legibility. They are one change because
they are one subsystem and one browser pass would have to check both.

# Part one: an arrow stops inside the land it is aimed at

Nothing is wrong with the border. `crossingBetween` finds it exactly, and the
normal points the right way. What is missing is that no part of the layout ever
asks whether the land it is reaching into is that deep.

This adds the question, in the two places that can answer it: where the block
of arrows is centred, and how far each arrow in it reaches.

## The invariant

**An arrow's tip is inside the land it aims at, and its base is inside the land
it leaves.**

Everything below serves that one sentence, and it holds outright: over every
ordered land adjacency of both maps, drawn as a 1, 2 and 3 arrow block, no
lane's tip is off its target, no lane's base is off its source, and neither end
of any lane stands on a third land.

Nothing below changes an arrow's width, its lane order, its identity across
renders, or which border it crosses. A lane's position ALONG its border does
move, and section 3 says why.

## What is wrong now, measured

`layoutLanes` in `src/arrow-scene.ts` places every arrow at two constants off
the crossing: `LAYOUT.tailDepth` (30) back into the source and
`LAYOUT.headDepth` (34) forward into the target, along `Crossing.normal`, from
`Crossing.at`. And `borderCrossing` in `src/borders.ts` picks `at` as the
shared border vertex nearest the border's centroid, which is a statement about
where the middle of the frontier is and says nothing about what is behind it.

Ray-casting the normal at every ordered land adjacency on both maps, and
counting the ones where a single centred arrow overruns one end or the other:

| map | ordered land adjacencies | overruns | of those, near-zero room |
|---|---|---|---|
| Baltic | 106 | 28 | 18 |
| Iberia | 100 | 34 | 32 |

The near-zero ones are worse than the reported case. The centroid-nearest
vertex often lands on a pinch or a spur, where a point one unit off the border
along the normal is inside neither land: `sakalans -> talavians` measures 0 in
both directions, `barcelonans -> urgellians` 4.4. Those arrows have been
standing in a notch rather than crossing a frontier.

So this is not one bad polygon. It is a missing constraint, and it is missing
on a quarter to a third of every frontier on both maps.

## 1. `reach`, in `src/borders.ts`

```ts
reach(from: Pt, dir: Pt, rings: Pt[][], want: number, inset: number): number
```

How far from `from` along `dir` an arrow may go and still end on that land,
never more than `want`, and `-1` where there is no such distance. It intersects
the line with every ring edge, finds the FIRST run of land along the ray, and
returns that run's end less `inset` - or `want` where the run outlasts `want`.

Four things about it are load-bearing.

- **Exact intersections, not a sampled walk.** The shapes this exists to detect
  are slivers, and a walk in 1-unit steps steps over them. It is the same
  argument that made `sharedVertices` a set intersection rather than a
  proximity search.
- **The FIRST run of land, and not the last.** An arrow crosses a border and
  stops in the body of land it enters; a later run is on the far side of a gap,
  which is ground this arrow is not aimed at. This is not a subtlety. On
  `dainava | galinda` the ray leaves Galinda at 21.8 and clips it again for a
  tenth of a unit at 33.9, and backing off from THAT run's end by the inset
  puts the tip at 32 - in the gap, standing on Suduva. Measured over both maps,
  this single choice is the whole of the residual: last-run leaves 8 lanes
  ending on a land they are not about and 14 ending on no land at all,
  first-run leaves none.
- **Whether the ray STARTS on the land is asked of `pointInRings`**, the
  predicate the rest of the file already uses; the edge hits only say where
  that changes. Two point-in-polygon rules disagreeing about the same map is
  how a measurement and the test that checks it end up contradicting each
  other.
- **`-1` is a real answer and not an error**, and it covers two cases: the land
  is not reached within `want`, and the run is too short to stand in - shorter
  than the inset, so there is no point on it to put a tip. Both mean the same
  thing to the caller. It is what makes "this place on the border cannot be
  crossed" a thing the layout can see and step around,
  rather than a length it has to guess at.

Pure numbers, no DOM, for the reason the rest of that file is: `getBBox()` is a
stub under happy-dom, so this is where the shape can be checked.

## 2. A border is a table of stations, measured once

`Crossing` gains `stations`, built inside `borderCrossing`:

```ts
interface Station {
  at: Pt;        // a real shared vertex
  s: number;     // its projection on the tangent, so lanes can be placed by offset
  into: number;  // reach along the normal, into the second land, -1 for nowhere
  out: number;   // reach against the normal, into the first land
}
```

The shared vertices are sorted by their projection on the tangent and sampled
down to at most 32, and each survivor is measured once against both lands with
`reach`. This is where the geometry stays: `src/arrow-scene.ts` never sees a
polygon, and the numbers it needs are already on the crossing it is handed.

`Crossing.at` becomes **the roomiest station**, scored `min(into, out)` and
tie-broken toward the border's centroid so the block still sits near the middle
of the frontier. That single change is most of the visible win: it takes the
overrunning centred arrows from 28 to 2 on the Baltic map and 34 to 2 on
Iberia.

The sampling cap is what keeps this cheap. A border can share 183 vertices, and
measuring all of them against two thousand edges twice over would be paid on
every first paint of a border. Both maps' 206 adjacencies build in about 300 ms
total, which is also what makes the all-pairs test worth running.

The orientation vote keeps its current probe point - the centroid-nearest
vertex - so the behaviour `tests/borders.test.ts` validates across all 103
adjacencies is untouched. The station scores are computed under the settled
normal and are incidentally a check on it: a wrong sign scores `-1` at every
station in both directions.

## 3. A lane stands at a station and reaches exactly as far as it has room

`layoutLanes` stops computing `at + tangent * offset` and stands each lane on a
station, in two passes:

1. **Which stations.** Each lane in turn takes the free station nearest its
   offset, among those with at least `LAYOUT.depthMin` of room BOTH ways. A
   station is taken at most once, so no two arrows stack.
2. **Which lane gets which.** The chosen stations are sorted along the tangent
   and handed out in declaration order.

The second pass is one line and it buys the whole ordering rule back. Searching
under a "must come after the last one" constraint instead - the obvious single
pass - forces a lane onto a worse station when its neighbour has taken the good
one, and that costs 2 lanes of 1,236 ending on the wrong land. Choosing freely
and then dealing the results out in order costs nothing: it is the same SET of
stations, so the same arrows are drawn in the same places, and only which arrow
stands where changes. Measured: 6 lanes came out in the wrong order along the
border before the sort, and none after it.

The lane's `head` is its station's `into` and its `tail` is its `out`.

**Why the lane centre moves at all.** The tangent is a straight global fit and
the border bends under it, so a lane 24 units off centre is routinely not on
the border - it is inside one of the two lands, and no length of arrow drawn
from there crosses anything. Measured over the same 1,236 lane cases, with the
same `reach`: keeping the lane centres on the tangent line and only clamping
their depths leaves 81 lanes with an end off the land it belongs on. Standing
them on stations leaves none.

On a straight border every station lies on the tangent line anyway and nothing
moves. On a bent one the block follows the frontier, which is what an arrow
crossing that frontier should have been doing.

A strait keeps its single station at the midpoint of the narrowest crossing,
with `into` and `out` of `gap / 2 + seaClearance`, so nothing about sea
crossings changes.

## 4. When no station qualifies

The lane takes the roomiest station that is still free anyway, and the depths
are floored at `LAYOUT.depthMin` (12), with `inset` 2. A place with four units
of land behind it is still a better place to stand than a point picked off a
straight line, so the fallback is a worse station and never a different rule. This is the trade
`LAYOUT.blockMin` already states in the same object: an arrow nobody can see is
worse than one slightly wider than the ground it crosses.

Measured, the fallback never has to lie: because a station qualifies only when
it has 12 units both ways, **no lane on either map is drawn past a floor that
its station could not pay for**, and no block on either map runs out of
qualifying stations. Both arms are there for a map that has not been drawn
yet.

## Measurements

Every ordered land adjacency on both maps - 206 of them - drawn as a 1, 2 and 3
arrow block, 1,236 lanes in all:

| | value |
|---|---|
| total arrow length, median | 64 (full: 30 + 34) |
| p5 | 51.9 |
| min | 29.1 |
| **lanes with an end on a land that is neither source nor target** | **0** |
| **lanes with an end off its own land at all** | **0** |
| lanes sharing a station with a neighbour | 0 |
| lanes out of declaration order along the border | 0 |
| build time, both maps | 305 ms |

Nothing is excluded and nothing is on a known-exceptions list. Three earlier
versions of this design left a residual - 50 lanes, then 14, then 8 - and each
time the residual turned out to be a defect in the measurement or the
assignment rather than a place the map cannot be drawn: last-run `reach`
accounted for the 8, and the come-after-your-neighbour station search for the
last 2. The test asserts zero, so a map that cannot meet it fails rather than
being added to a list.

## What does not change

- **Width, and therefore comparability.** `unitWidthFor` and `laneWidthFor` are
  untouched: an arrow is still `unit * sqrt(strength)` map-wide. This half of
  the spec moves ends along the axis and lane centres along the border, and
  nothing about how wide anything is.
- **Lane order.** Declaration order, direction not sorting them. Stations are
  assigned in that order and each is taken once, so two arrows never stack.
- **Identity.** The scene is retained and keyed by the caller's id. A station
  change moves an arrow's `points`, which is what `place` already animates.
- **The four kinds.** March, claim, aim and ghost all go through `layoutLanes`,
  so all four are fixed by the same change and none of them learns about it.
- **`SceneCtx`.** The room is measured where the rings already are, inside
  `borderCrossing`, so the scene still asks the map for exactly two things: a
  border, and an anchor for an arrow that crosses none.

## Tests for part one

`tests/borders.test.ts` already walks every pair on both maps, which is where
the new assertions belong, beside the normal-direction one they are siblings
of:

- for every ordered land adjacency, drawn as a 1, 2 and 3 arrow block, every
  lane's tip is inside its target, every lane's base is inside its source, and
  neither end stands on a third land. Zero exceptions and no allow-list: the
  three residuals this design went through were each a defect in it, and a list
  is where a fourth would have gone to be forgotten;
- every station on every border has `into` and `out` that are either `-1` or a
  distance at which `pointInRings` agrees the point is on that land. This is
  the measurement checked against the map by the predicate the rest of the file
  uses, and it is what stops `reach` and the test above drifting apart;
- no two lanes of one block share a station, and the lanes come out in
  declaration order along the border.

`tests/arrow-scene.test.ts` covers the layout arithmetic on synthetic
crossings: a lane whose station has 20 units of room comes back 20 long on that
side, a lane with full room comes back at `headDepth`, a block with one
qualifying station falls back to `Crossing.at` and floors at `depthMin`, and a
sea crossing still spans its gap.

## Rejected in part one

- **Clip the arrow to the target polygon in SVG.** Robust and needs no
  geometry, and it cuts the arrowhead in half at the border. A headless arrow
  says less than an overlong one.
- **A local normal per lane**, fitted to the border's own direction at that
  station rather than the global principal axis. Built and measured: it is
  WORSE - 24 lanes with an end on the wrong land against 8, and the p5 arrow
  length drops from 58.3 to 46. The map's border vertices are dense and the
  local direction between three of them is noisy, which is the reason the
  tangent is a global fit in the first place.
- **One depth per border rather than per station.** Uniform arrow lengths on a
  border, bought by dragging every lane down to the worst one, which on
  `aragon | pamplona` means 5.2 units of arrow.
- **Keep the lane centres on the tangent and only clamp the depths.** This was
  the first design and the measurement retired it: 50 lanes of 1,236 with an
  end on the wrong land, because a lane offset along a straight line off a bent
  border is not standing on the border at all.
- **Move the arrow off the border entirely, town to town.** That is what this
  system replaced, for the reasons in the 2026-08-11 border-crossing spec.

# Part two: a rival's quarrel is something you can see

## What is wrong now, measured

Booted a board carrying nine rival-vs-rival marches and read the rendered DOM.
Every one of them: `opacity: 0.45` from `.march-arrow.march-other`, filled with
`factionById.get(m.actor).color` - the actor's LAND colour, unmodified.
`#a8c8cf`, `#e2eecd`, `#d7e5bb`, `#e8d18b`.

Against `UNOWNED_FILL` (`#c3bfb6`), which is what every land nobody plays is
painted, those composite to:

| faction ink | today (0.45) | at full opacity |
|---|---|---|
| Lower Daugava Livs `#a8c8cf` | 1.01 | 1.03 |
| Semigallians `#e8d18b` | 1.09 | 1.22 |
| Osilians `#e2eecd` | 1.21 | 1.52 |
| Ugandians `#8fb06d` | 1.14 | 1.33 |

**Removing the fade is not the fix.** It moves the Livs arrow - the one in the
report - from 1.01 to 1.03. The fill is drawn from the same pale palette the
map paints land in, so it cannot contrast with land. For comparison, the
hostile red `#992f27` reads 4.10 against the same grey.

**And the casing does not cover for it at the zoom the game is played at.**
`.march-arrow polygon` carries a 1.2 user-unit white stroke. The default view
is a 2508.8-unit viewBox on a 1440 px element, so one unit is 0.57 px and the
casing is a 0.69 px line. It delineates the shape when the player has zoomed
in, which is why the arrows look fine in a close screenshot and disappear on
the map.

Four variants were rendered and compared at whole-map zoom: as-is, fade
removed, fade removed plus a screen-constant casing, and fade removed plus
darkened ink. Only the last reads.

## 5. Quiet is a colour, not a fade

`.march-arrow.march-other { opacity: 0.45 }` goes. A rival's arrow rests at
full opacity like every other arrow, and the hierarchy between "at you",
"yours" and "theirs" moves onto hue, where the saturated red and gold already
carry it.

This is the rule the stylesheet already applies one layer down, to the lands
themselves: fading leaves the hue in and dissolves the silhouette, repainting
keeps the silhouette and takes the identity. The arrows were doing the thing
that comment rejects.

## 6. A rival's fill is ink, not the land's own tint

`inkFor(colour)` darkens a faction colour until it reads 3:1 against
`UNOWNED_FILL`, and `paintArrows` uses it for the `other` tone instead of the
raw colour. It belongs beside `darkenColor` and `brightenColor` in
`src/map-render.ts`, and the vassal stripes are the precedent: they already
darken a faction colour by half before using it as a mark rather than a fill.

Across the 50 factions of both maps the factor lands between 0.44 and 0.94 -
an already-dark faction barely moves, a pale one moves a long way, which is the
whole point of a target rather than a constant.

**What this costs, stated plainly.** The exact shade stops being the faction's
own. The hue family survives, so the northern greens still look northern and
Prussia's blue is still blue, but two factions of one people are closer
together than before. They were never far apart: the two closest Baltic faction
colours differ by 6.4 in RGB, which no player was distinguishing on a 30-unit
arrow. Whose army it is is read off the arrow's ends, its dataset-driven hover
and the log; the hue says roughly which people, and is worth having only if it
can be seen at all.

Hostile red and your own gold are hand-picked constants and stay as they are.
The rule is applied where the DATA drives the colour, which is the 50 land
colours nobody chose with an arrow in mind.

## 7. The casing stops vanishing at map zoom

`vector-effect: non-scaling-stroke` on `.march-arrow polygon`, at about 1.6 px.

The ink handles pale ground; the near-white casing handles dark ground, which
the acting factions' own fills are - the darkest is `#5f7aa3` on the Baltic map
and `#96625e` on Iberia, and a dark ink alone would be as invisible there as a
pale one is on the grey. One of the two contrasts with anything an arrow can
stand on.

This does not reopen the argument in `src/arrows.ts` for a filled polygon over
a stroked line with a `marker-end`. The SHAPE stays a polygon at every zoom;
only its outline stops being drawn in map units.

## 8. One opacity per arrow, stated on the spec

`ArrowSpec.emphasis` replaces the `faded` and `dimmed` booleans:

| emphasis | opacity | when |
|---|---|---|
| `faded` | 0.12 | the pointer rests on another arrow |
| `dimmed` | 0.16 | a pin holds on a realm this arrow is no business of |
| `back` | 0.75 | an aim is live and this arrow does not end where it points |
| `full` | 1 | everything else |

`paintArrows` decides it in exactly that order, and `dressArrow` writes one
class of four. Today four rules set `opacity` on the same element and CSS
specificity picks the winner. That has already produced one documented bug - the
comment at style.css:1179 records a faded rival arrow coming out BRIGHTER than
an unfaded one - and it still misfires: `.march-arrows.aiming .march-arrow`
scores (0,3,0) against `.march-arrow.arrow-dim`'s (0,2,0), so starting an aim
brings every pin-dimmed arrow back up to 0.75.

Exactly one class, chosen in code, cannot race. It is also what the file's own
rule already asks for: an arrow's `enter` fade rises to the opacity the
stylesheet gives it, so the resting opacity has to be decided before the
element is in the tree, which is why `faded` and `dimmed` are on the spec in the
first place. This finishes that job rather than starting a new one.

## 9. Aiming lifts the arrows that end where you are aiming

While an aim is live, an arrow whose target is the land under the aim gets
`full`; every other arrow gets `back`. `paintArrows` already knows the aim's
target - it builds the `aim` spec from it - and already runs on every pointer
move, because the preview re-packs into its border's block on each one.

This is the reported case answered directly: choosing whether to send an army
at a land is exactly when what else is flying at that land matters, and the
blanket dim was pushing that information away at the moment it was wanted.

## What does not change in part two

- **The claim's violet.** A demand is a different kind of thing from a raid and
  does not borrow the red/gold/neutral scale, so `inkFor` is not applied to it.
- **The strength label colours.** `.march-other .march-strength` stays
  `#5b4f3d`; it stops being washed out because the group it sits in stops being
  faded, and it carries its own white halo already.
- **The pin and hover dims.** 0.16 and 0.12 are deliberate get-out-of-the-way
  states on a map that has gone grey around the thing being studied. Only where
  they are decided moves.

One comment does have to be restated: the ghost's fill is stated in
`src/main.ts` partly because a ghost inheriting `.march-arrow`'s rules would
pick up a rival arrow's 0.45. Half of that reason is being deleted, so the
comment has to say what is left - a ghost is the one arrow on the map its beat
is about, and it states its own ink so the beat is never quieter than the board
behind it.

## Tests for part two

- `inkFor` reaches the target for every faction colour on both maps. A
  data-driven property with 50 cases, which is what makes it a test rather than
  an eyeball: a new region file with a pale palette fails here rather than in a
  screenshot nobody reads.
- `emphasis` is exhaustive over its four values with one class each, the
  `ARROW_KINDS` shape, and the ordering is asserted directly: aim plus pin
  resolves to `dimmed`, hover plus aim to `faded`.
- An arrow ending at the aim's target renders `full` while its neighbour on the
  same border renders `back`.
- The naming and presentation suites are untouched by this half - no strings
  and no beats move.

## Rejected in part two

- **One neutral ink for every rival.** Guaranteed legible and one colour to
  tune, and it throws away the hue family entirely. Keeping a darkened faction
  colour costs nothing and still says which people this is.
- **Raise the opacity and keep the raw faction colour.** Measured above: the
  Livs arrow goes from 1.01 to 1.03. It is the change that looks like the fix
  and is not one.
- **A screen-constant casing alone, raw fill kept.** Rendered and compared: a
  near-white outline on a near-white map is a weak line. It is worth having for
  dark ground, which is why it is in the design, but it does not carry the
  common case on its own.
- **A second, brighter tone for "a rival is attacking the land you are looking
  at".** That is a fifth arrow colour to explain, and the aim lift in part 9
  answers the same need with a state the player is already in.
