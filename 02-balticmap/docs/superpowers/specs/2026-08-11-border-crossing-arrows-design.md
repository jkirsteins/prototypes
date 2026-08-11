# Border-crossing arrows

A march arrow runs from a town in one land to a town in the next. Several towns
sit close to the border they are nearest, so a thin arrow between two of them
says almost nothing about which border an army is crossing, and on a long bent
land it runs diagonally across ground the army never touches. Jersikans into
Talavians is the worst of them: the arrow leaves Jersika, crosses the whole of
Talava and stops at Trikata, nowhere near where the two lands meet.

This replaces that with an arrow that crosses the border in the middle: short,
fat, starting a little inside the land the army leaves and ending a little
inside the land it is aimed at. Several arrows across one border stand side by
side and split the available width by strength.

It also folds every arrow the map draws into one subsystem. There is no march
arrow, claim arrow, aim-preview arrow and resolution ghost with four copies of
the geometry; there is one scene with four kinds in it.

Confirmed against real map data and a rendered proof of concept before this was
written. The measurements below are from that pass.

## The border is in the data already

Adjacent regions in `src/data/baltic.json` and `src/data/iberia.json` share
exact vertices: the paths were cut from one topology, so the shared border is a
set intersection rather than a geometry search. Jersika and Talava share 207
vertices to three decimal places.

`src/borders.ts` is the new pure module.

- `ringsOf(path)` parses a region `path` into closed rings. A list, not one
  ring: ten Baltic and eighteen Iberian regions have several subpaths, being
  islands, enclaves and lakes.
- `crossingBetween(a, b)` returns `{ at, tangent, normal, span }`:
  - **shared vertices** are `vertsOf(a)` intersected with `vertsOf(b)`, hashed
    at three decimals;
  - **`at`** is the shared vertex nearest their centroid. A real border vertex,
    never a computed point, so the crossing is always ON the border even where
    it bends. The centroid itself is up to 33 units off the border at the worst
    pair measured (Jersika | Talava), which is why the vertex is taken and the
    centroid is only used to find it;
  - **`tangent`** is the principal axis of the shared set, and **`span`** its
    extent along that axis. Measured across every adjacency: 11 to 308 units,
    median 109;
  - **`normal`** is the tangent's perpendicular, its sign chosen by probing
    `at + n*d` for d in {6, 12, 24, 40} and counting how many probes land inside
    b, against the same count for the other sign inside a. **This vote is
    load-bearing and not caution**: a single probe at one distance is ambiguous
    on 7 of the 103 pairs, because the principal axis is a global fit and the
    border is locally bent under it. The vote resolves 103 of 103 on both maps
    with no ties.

Two lands that share no vertex at all are the sea crossings, and there are
exactly four of them: Saaremaa to Kursa and to Laanemaa, the Balearics to
Todmir and to Valencia. There, `at` is the midpoint of the closest pair of
points between the two polygons - the narrowest part of the strait - with
`normal` along that pair and `gap` its length.

Crossings are cached per unordered pair. `(b, a)` is `(a, b)` with the normal
flipped, so it is never computed twice.

## One arrow subsystem

`src/arrow-scene.ts` is the only thing in the app that draws an arrow. Callers
describe what they want and get back the groups by id:

```ts
interface ArrowSpec {
  id: string;                      // the caller's handle, for binding behaviour
  kind: ArrowKind;                 // "march" | "claim" | "aim" | "ghost"
  from: string; to: string;        // faction ids...
  at?: { x: number; y: number };   // ...or a free endpoint, for an aim drag
  strength: number;                // what the lane split divides
  tone: "hostile" | "ours" | "other";
  fill?: string;                   // a rival's own colour, for tone "other"
  label?: string;
  chip?: { order: number; clash: boolean };
}
```

`ARROW_KINDS` is an exhaustive `Record<ArrowKind, ArrowKindDef>` in the
`NOTICE_RULES` shape: shape (spear or dashed demand), class, whether the kind
takes a lane, and a sentence saying why. A new kind does not compile until
somebody classifies it.

**Enforced the way the decision router is enforced.** `biome.json` already
forbids `src/main.ts` from importing the engine's mutators; a second
`noRestrictedImports` entry forbids it from importing `spearPolygon`,
`insetSegment`, `offsetSegment` and `scaleSpear` from `./arrows`. There is then
no path to put an arrow on the map except through the scene, and a fifth kind
of arrow cannot quietly grow its own geometry beside the other four.

The primitives stay in `src/arrows.ts` and stay pure. The scene is what knows
about borders, lanes and the DOM.

## Width is strength, position is declaration order

Per border, over every spec crossing it in BOTH directions:

1. `W = clamp(span * 0.55, 30, 96)`. A share of the border so a wide frontier
   affords a wide block, capped so a lone arrow on a 308-unit border is not
   absurd, and floored so two lands that barely touch still get something
   readable. The floor is deliberately allowed to overrun a tiny border: an
   arrow nobody can see is worse than an arrow slightly wider than the ground
   it crosses.
2. Each lane takes `abs(strength) / sum(strengths)` of W. Two out and one back
   is 66% and 33%. One arrow of any strength takes all of W.
3. A lane below `LANE_MIN` (14) is raised to it and the surplus taken
   proportionally from the lanes above the floor. Strength share stops being
   exact once anything hits the floor, and the block stays inside W.
4. Lanes are packed edge to edge in declaration order along `tangent`, centred
   on `at`. Direction does not sort them: an answering raid stands beside the
   attack it answers, in the order the two were declared.
5. Each arrow runs along `normal`, 30 units inside its origin to 34 units
   inside its target, pointed by which side its `from` is on. The spear's
   proportions scale to its lane, so the barbs fill the lane: fat and short by
   construction rather than by a constant.

The aim preview is a spec like any other, weighted by the armed card's own
`attackDamageFor(...).damage`, so a player aiming sees the arrow at the width
it will really have and the block re-packs as they aim.

A claim carries no strength of its own and is weighted 1. It is a real declared
thing standing on the board, so it packs into the block with everything else
rather than being drawn over it.

**A strait is not a border.** A sea crossing has no line to cross, so its
arrows span the water instead: `gap / 2 + 16` either side of the midpoint. The
first version drew the standard short block, which left an arrow stranded in
open water between the Balearics and Todmir touching neither land.

## What the arrows carry

A short arrow has little shaft, and three or four lanes have little room
between them. The proof of concept made this concrete: rotating labels along
the shaft is unreadable at map zoom, and ordinal chips left on the shaft
collide as soon as a border carries three arrows.

- **Strength stays on the shaft, horizontal**, staggered across three stations
  along each arrow's own axis (0.26, 0.5, 0.74, cycled by lane) so no two
  neighbours sit level with each other.
- **The ordinal chip sits behind the tail**, outside the block, staggered the
  same way. It is still the arrow's own label, just not on top of it.
- **A lane under 24 units wide carries the bare number** rather than "3 STR".
  This is a deliberate narrowing of the existing rule that a bare digit cannot
  be told apart from an ordinal. It holds only because the ordinal has left the
  shaft: the shaft now carries exactly one number, and there is nothing for a
  bare number to be confused with. `CLAUDE.md` says the old thing and gets
  updated in the same change.
- **A claim's label goes past the head**, in the target land. It is the one
  arrow whose label is a word rather than a number, and "SUBJUGATE" is wider
  than the arrow it belongs to.

The map's colours are untouched: red for an arrow into your realm, gold for
yours, the rival's own colour faded for a quarrel that is neither.

## The ghost is laid out with the living

`flashMarchResolution` currently rebuilds its fading arrow from the event with
its own anchors, laid out independently of whatever else is on the map. As a
spec in the same scene it is packed into the same block, so a fade can no
longer be drawn across a live spear.

A ghost group is kept across a live rebuild rather than restarted: it is a
picture of what was, and moving it mid-fade would be a lie told twice. In
practice the two rarely coexist, since `svg.replaying` already hides live
arrows while the turn-start replay runs.

`marchAnchors` and the town anchors survive for exactly one caller: the
free-drag aim preview toward a pointer that is not over a legal land. That is
the only arrow in the game with no border to cross.

## Tests

- `tests/borders.test.ts` - the crossing lies on both polygons, the normal
  points into the target, the span matches the shared extent, multi-ring
  regions parse, and a sea crossing falls back to the strait.
- **A data test over every adjacency in both regions**: a crossing exists and
  its orientation is unambiguous. This pins the assumption the whole design
  rests on, and it is the test that would have caught the single-probe
  orientation being ambiguous on seven pairs.
- `tests/arrow-layout.test.ts` - the strength split, the floor and the shrink
  it takes out of the lanes above it, edge-to-edge packing, declaration order,
  and one arrow taking all of W.
- `tests/arrows.test.ts` keeps the spear and segment primitives as they are.

## Numbers

Opening values, all tuned by eye in a browser pass rather than derived:

| Constant | Value | What it is |
| --- | --- | --- |
| `BLOCK_SHARE` | 0.55 | share of the border extent the block may use |
| `BLOCK_MIN` / `BLOCK_MAX` | 30 / 96 | the clamp on that share |
| `LANE_MIN` | 14 | narrowest a single arrow may be drawn |
| `TAIL_DEPTH` | 30 | how far the arrow starts inside its origin |
| `HEAD_DEPTH` | 34 | how far the head reaches inside its target |
| `SEA_CLEARANCE` | 16 | how far past the coast a sea crossing reaches |
