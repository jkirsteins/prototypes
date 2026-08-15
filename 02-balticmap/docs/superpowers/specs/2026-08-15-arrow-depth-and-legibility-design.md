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

Everything below serves that one sentence. Nothing below changes an arrow's
width, its lane order, its identity across renders, or which border it crosses.

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
never more than `want`. It intersects the line with every ring edge, walks the
inside-intervals in order, and returns the end of the last run of land that
starts within `want`, less `inset`.

Three things about it are load-bearing.

- **Exact intersections, not a sampled walk.** The shapes this exists to detect
  are slivers, and a walk in 1-unit steps steps over them. It is the same
  argument that made `sharedVertices` a set intersection rather than a
  proximity search.
- **It answers for a point that is NOT on the border.** A lane centre is
  offset along a straight fitted tangent while the border bends under it, so a
  lane centre routinely sits a little inside one land or the other rather than
  on the line between them. Walking intervals rather than measuring a first
  exit from an assumed-inside start is what makes the answer right from either
  side.
- **If the ray meets no land at all, the caller keeps its default depth.** The
  clamp only ever shortens, and never to nothing. A measurement that finds
  nothing is the map data saying something the layout cannot fix, and drawing
  no arrow there would hide a march the player has to answer.

Pure numbers, no DOM, for the reason the rest of that file is: `getBBox()` is a
stub under happy-dom, so this is where the shape can be checked.

## 2. The crossing is placed where there is room for it

`borderCrossing` keeps its centroid, its principal-axis tangent, its span and
its orientation vote unchanged. Only the choice of `at` moves: instead of the
shared vertex nearest the centroid, it is the vertex scoring highest on

```
min(reach(v, normal, b, headDepth, inset), reach(v, -normal, a, tailDepth, inset))
```

capped at what an arrow actually wants, so a cavernous land does not outscore a
merely sufficient one, and tie-broken by distance to the centroid so the block
still sits near the middle of the frontier wherever several vertices are good
enough.

**The orientation vote keeps its current probe point** - the centroid-nearest
vertex - so the behaviour `tests/borders.test.ts` validates across all 103
adjacencies is untouched. The room score is computed under the settled normal,
and is incidentally a second check on it: a wrong sign scores near zero at
every vertex in both directions, because the ray would be running out of one
land and along the outside of the other.

This one change does most of the visible work. Scored over both maps, it takes
the Baltic overruns from 28 to 2 and the Iberian from 34 to 2, and the worst
survivor has 30.3 of the 34 units it wants - a 4-unit poke nobody sees.

## 3. Each lane is clamped to the ground under it

`layoutLanes` computes, per lane rather than per border:

```
head = reach(laneCentre,  n, intoRings, headWant, inset)
tail = reach(laneCentre, -n, outRings,  tailWant, inset)
```

where `headWant` and `tailWant` are today's `LAYOUT.headDepth` /
`LAYOUT.tailDepth` on land and today's `gap/2 + seaClearance` across water. A
strait goes through the same call, which is also how a narrow island stops
being overshot by the arrow that lands on it.

**Per lane and not per border**, because the outer lane of a block is standing
somewhere the middle one is not: the tangent is straight and the border is
not. One number per border would have to be the worst lane's, and on
`aragonese <-> pamplonese` that would drag both arrows down to 5.2 units to
protect one of them.

The rings come from the scene's context. `SceneCtx` grows one method beside
`crossingFor`:

```ts
ringsFor(faction: string): Pt[][] | null
```

`src/main.ts` already parses every land's rings once into `ringsByFaction`, so
this is a lookup, not new work. A land the map does not know returns `null` and
the arrow keeps its default depths, per the fallback above.

## 4. The floor, and the precedent it follows

Below a readable minimum an arrow keeps that minimum and overruns the land.
`LAYOUT.depthMin` is 12, applied to each end separately, and `inset` is 2. This
is the trade `LAYOUT.blockMin` already states in the same object: an arrow
nobody can see is worse than one slightly wider than the ground it crosses.

Measured over 1,236 lane cases - every ordered adjacency on both maps, drawn as
a 1, 2 and 3 arrow block - the floor is reached twice, on the two directions of
one Iberian border:

| map | median total length | p5 by block size | min |
|---|---|---|---|
| Baltic | 64 (full) | 64 / 60.9 / 57.9 | 32.8 |
| Iberia | 64 (full) | 64 / 52.7 / 61.0 | 5.2 |

Full length is 64 (30 + 34), and the min column is what the measurement asks
for before the floor is applied: the two collapsed lanes are drawn at 24 and
overrun by 8 to 10 units at their ends. The median lane is unaffected on both
maps; the ones that shorten shorten because the land really is thin where they
stand.

## What does not change

- **Width, and therefore comparability.** `unitWidthFor` and `laneWidthFor` are
  untouched: an arrow is still `unit * sqrt(strength)` map-wide. This spec
  moves ends along the axis and nothing across it.
- **Lane order and position along the border.** Declaration order, packed edge
  to edge, direction not sorting them.
- **Identity.** The scene is retained and keyed by the caller's id. A clamp
  changes an arrow's `points`, which is what `place` already animates.
- **The four kinds.** March, claim, aim and ghost all go through `layoutLanes`,
  so all four are fixed by the same change and none of them learns about it.

## Tests

`tests/borders.test.ts` already walks every pair on both maps, which is where
the new assertion belongs, beside the normal-direction one it is a sibling of:

- for every ordered land adjacency, drawn as a 1, 2 and 3 arrow block, every
  tip is inside its target's rings and every base inside its source's;
- the exceptions are the lanes on the floor, named individually, so a new map
  that adds a third one has to be looked at rather than silently joining a
  count;
- `reach` returns `want` unchanged where the ray meets no land, so the
  fallback is pinned rather than assumed.

`tests/arrow-scene.test.ts` covers the layout arithmetic: a lane whose target
is shallower than `headDepth` comes back shorter, a lane with room comes back
at full depth, and a sea crossing still spans its gap.

## Rejected

- **Clip the arrow to the target polygon in SVG.** Robust and needs no
  geometry, and it cuts the arrowhead in half at the border. A headless arrow
  says less than an overlong one.
- **One clamp per border rather than per lane.** Uniform arrow lengths on a
  border, bought by dragging every lane down to the worst one. The measurement
  above says that costs 59 units on the pair it is meant to protect.
- **Lay the lanes along the border polyline instead of a straight tangent.**
  This is the deeper fix for the same bend: each lane centre would be genuinely
  on the border with its own local normal. It is also a rewrite of lane layout,
  which the map-wide width scale has just been fitted onto, and the per-lane
  clamp already delivers the invariant without it. Worth revisiting only if
  arrows on bent borders start reading as crossing at the wrong angle, which is
  a different complaint from this one.
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
