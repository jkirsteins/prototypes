# An arrow stops inside the land it is aimed at

A raid out of the Lower Daugava Livs into Jersika is drawn crossing the border
and then crossing Jersika as well: the head and both barbs come out the far
side and stand on Selonian ground, so the arrow reads as an attack on the wrong
land. Jersika is 20.7 units deep along that border's normal and the arrowhead
reaches 34.

Nothing is wrong with the border. `crossingBetween` finds it exactly, and the
normal points the right way. What is missing is that no part of the layout ever
asks whether the land it is reaching into is that deep.

This spec adds the question, in the two places that can answer it: where the
block of arrows is centred, and how far each arrow in it reaches.

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
