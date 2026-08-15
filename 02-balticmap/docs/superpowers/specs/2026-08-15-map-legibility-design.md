# Legibility in the grey middle

At turn 1 the Baltic map is 26 lands, of which 5 play and 21 are quiet. The 21
are painted one flat grey and then faded to 22.5%, and the only thing separating
one from the next is a 0.8-unit line that is faded to 22.5% along with them. The
grey middle reads as one undifferentiated mass with no internal borders at all.

Nothing was deleted to get here. Every cartographic treatment this map has ever
grown is still in the tree and still correct. What happened is that all of them
were built at the REALM level, and then a later change moved 21 of 26 lands out
of the realm level into a flat grey that has only the day-one land line.

## What is actually wrong, in three parts

**1. The dim fades the stroke.** `.region.dimmed { opacity: 0.225 }` is element
opacity, so it takes the land's border down with its fill. Compositing
`UNOWNED_FILL` (`#c3bfb6`) at 0.225 over the `#e8eef2` sea, and the `#7a6a55`
line over that:

| | declared | as rendered |
| --- | --- | --- |
| quiet fill | `#c3bfb6` | `#e0e4e5` |
| its border | `#7a6a55` at 0.8 wide | `#c9c6c2` |

A hairline at roughly 3% contrast against the fill it is meant to bound.

`.region.dimmed.in-play { opacity: 0.72 }` is the same complaint one class over,
already answered once: its comment records that at 0.225 four rival players were
indistinguishable from the 21 lands that never take a turn. The quiet lands
never got the same treatment.

**2. The dim inverted a relationship the code claims to maintain.** The doc
comment on `UNOWNED_FILL` says it is "darker than the off-map neighbour grey, so
the coast still reads as the edge of the world". After the dim, quiet PLAYABLE
ground renders `#e0e4e5` while `.neighbor` off-map filler is a flat `#d9d9d9`.
The playable land is lighter than the scenery. That is the "Finnic lands" and
"Lands of Rus'" masses sitting at the same visual weight as lands you can raid.

**3. Every cartographic treatment is gated on realms of 2+, and at turn 1 there
are none.** `src/main.ts` has `if (regions.length < 2) continue;` above the lot:

| treatment | what it draws |
| --- | --- |
| `.ru-band` + `.ru-casing` | the cased double line: a 5-wide realm-coloured band under a 2-wide `#fdfaf4` casing, so two touching realms are always parted by pale |
| `.realm-edge` masked copies | a land's state stroke painted only on the realm's outer edge |
| `.region.realm-member` | pale dashed seam for subdivisions inside a realm |
| `.realm-outline`, `.realm-hover-halo` | realm band and hover halo |

Meanwhile `.region { stroke: #7a6a55; stroke-width: 0.8 }` is byte-identical to
the first commit that ever drew this map, through every cartography pass since.
It was adequate while it separated two different pastels. It became the only
separator, and was never revisited.

## What is deliberately NOT changing

The flat grey stays. Its comment states the case and the case still holds:
twenty-one peoples' hues, none of them playing, was the map describing a game
that was not happening. Giving quiet lands a muted trace of their people's
colour was considered and rejected here.

The consequence is the whole shape of this design: **separation is carried 100%
by the border treatment**, because the fills of 21 adjacent lands are literally
one colour. That is a harder constraint than it sounds, and it is why the answer
is a casing rather than a heavier line.

## The design

### Quiet lands are not dimmed

A quiet land is taxed twice today: flattened to `UNOWNED_FILL` and then faded.
The grey already says "not a player"; the dim adds nothing to that sentence and
costs the map its ground.

So `grey` lands do not take `.dimmed` (`applyOwnership` in `src/main.ts`). Two
things fall out for one condition:

- `UNOWNED_FILL` renders opaque `#c3bfb6`, darker than `.neighbor`'s `#d9d9d9`,
  restoring the relationship its own comment claims. Playable ground reads
  heavier than scenery again.
- `.dimmed` reverts to meaning what it was built for, which is "held, but not
  yours", among lands that have real hues.

### The dim fades fills, not strokes

```css
.region.dimmed         { fill-opacity: 0.225; }
.region.dimmed.in-play { fill-opacity: 0.72; }
```

This is load-bearing past the region itself. The `.realm-edge` copies carry
`.dimmed` verbatim, so under element opacity a dimmed realm member's copy fades
too; and the copy is the only thing painting that land's border. `fill-opacity`
is inert on a `fill: none` copy, so one property fixes both surfaces.

### Every land's outline is a copy, and it is cased

The casing must sit ABOVE the fill, because an opaque fill hides anything
beneath it. The dark line must sit above the casing. `.region` carries fill and
stroke on one element, so its stroke would end up underneath. Therefore the
outline leaves the fill element.

New layering between `regionsGroup` and the existing `realmEdgeGroup`:

```
regionsGroup      .region        fill only, stroke: none
landCasingGroup   .land-casing   static pale, one per land, no state
landEdgeGroup     .region .land-edge   the dark line, carries state
realmEdgeGroup    .region .realm-edge  masked copy, realm members only (unchanged)
```

Starting values, to be settled in the browser pass rather than argued here:
casing `#f2ece0` at 2.4, line `#7a6a55` at 1.0. Deliberately NOT
"darker and fatter": across 26 lands a heavy line reads as a colouring book. The
contrast comes from the pale halo, which makes a boundary read as a gap between
two tiles rather than a line drawn on one surface. This is the technique
`.ru-casing` already uses one level up, applied one level down.

**The state stroke rules do not move.** The copies carry the region's classes
verbatim, which is already how `.realm-edge` works, so every state stroke
(`.hovered`, `.selected`, `.owned`, `.realm-hover`, `.vassal-hover`,
`.holder-hover`, `.target-valid`, `.target-invalid`, `.aim-target`, the
`arrow-focused` pair) lands on the copy untouched. One rule is added to take the
stroke off the fill element:

```css
.region:not(.land-edge):not(.realm-edge) { stroke: none !important; }
```

**The casing carries no state.** It is a plain path with `.land-casing` and none
of the region's classes, so the `realmEdgeObserver` does not touch it and there
is nothing per-paint to keep in sync. A casing is a cartographic constant, not a
cue. When a land is hovered or owned its heavier darker stroke simply covers more
of the casing, which is self-correcting and wants no rule. The one thing that
does vary is WHICH lands have one, and that is decided where the realm layers are
already rebuilt, in the same pass that computes `seamed`, rather than by the
observer.

**Realm members keep both copies.** The unmasked `.land-edge` draws the pale
dashed seam over that land's whole outline; the masked `.realm-edge` draws the
state stroke on the realm's outer edge only. That is exactly today's arrangement,
with the unmasked half moved off the fill element. The seam rule is re-scoped to
`.region.realm-member.land-edge:not(.realm-edge)`.

Note, against an earlier claim made while designing this: **B does not delete the
`!important` on the seam rule.** The hack exists because one element has to draw
a seam while every state rule of equal specificity wants to draw something else,
and moving that element from the fill to a copy does not change it. What B buys
is one border mechanism instead of two, and the only layering in which a casing
can exist at all.

Casings are suppressed on realm members: their outer edge already gets
`.ru-casing` from the realm band, and their inner seams are subdivisions rather
than frontiers.

### Why not the cheaper shape

The alternative considered was to leave `.region` stroking and put the casing on
a layer below `regionsGroup`, with quiet fills made opaque. It fails on
`.dimmed.in-play` rival lands, which stay translucent by design, so a casing
beneath them shows through as mud. It also leaves two border mechanisms on one
map, which is the drift this codebase keeps writing tests against.

## Verification

`npm test` and `npm run build`, then a browser pass at
`http://127.0.0.1:5173/prototypes/02/`, which is where this has to be judged.
The boot URL for the state in question, a fresh board with the grey middle at
its widest:

    http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&build=warpath

Read the screenshot rather than glancing at it, per the dark-box rule: the
question is whether two adjacent quiet lands are told apart, and whether the
`.neighbor` masses now sit BEHIND the playable ground rather than beside it.

What would look wrong:

- A casing visible as a pale outline around each land rather than as a gap
  between two of them, which means it is too wide or too light.
- Full-strength borders across 21 lands reading as busy. If so the line colour
  lightens, not the opacity, because opacity is what this change exists to stop
  using.
- A hovered or owned land whose stroke no longer appears, which means the
  `:not(.land-edge)` scoping took the stroke off the copy as well as the fill.
- A realm member drawing its dashed seam twice, or drawing a casing along a seam.
