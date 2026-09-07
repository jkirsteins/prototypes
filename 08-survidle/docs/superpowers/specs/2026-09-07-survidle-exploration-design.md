# Survidle: you may only walk where you know the way

A survivor stands eight regions from camp on a new game, having walked
out along the shore. "Walk to camp" offers an exact route and an exact
number of minutes. The route threads four regions the survivor has never
laid eyes on, around the far side of a lake nobody has seen, and it is
optimal. The game found it with A* over the true terrain grid.

`findRoute` (`src/world/route.ts:40`) has never read `state.discovered`.
The fog gates one thing only - the map will not let you click a region at
discovery 0 as a destination (`src/ui/map.ts:402`) - and gates nothing
about the ground in between. Sight, distance, ETA and every plan the
runner makes are computed against a world the survivor cannot see.

This spec makes knowledge a precondition of movement, and makes finding
out a thing you spend hours on.

Extends `2026-09-05-survidle-siting-design.md` (camp cells and the map)
and `2026-09-07-survidle-night-light-design.md` (illuminance is what the
eye has to work with). It moves numbers in every gate; section 8 says
which and why that is expected rather than a regression.

## Decisions confirmed with the author

- **Unknown ground is not routable, and not a destination.** Not to walk
  through, not to walk to. The only way into it is an explicit
  exploration.
- **Knowledge has two grades, and they are the same mechanism.** A thread
  of cells you have walked is a corridor; a region whose cells are all
  known is mapped. The grade is not a flag - it is how much of the
  region you know, and both fall out of one per-cell record.
- **Sight unlocks cells, not regions.** What the eye reaches from where
  you stand becomes known ground in the next region along. What it
  cannot resolve stays the region-level glimpse that names a place
  without opening it.
- **Exploration is aimed by name: "Explore Stensund".** You can aim at a
  place you can name, and you can name a place you have glimpsed.
- **Mapping is a skill, and it opens no orders.** Wayfinding is the
  seventh skill, practised by exploring and by searching a way home.
  What it buys is a wider view and safety: an unpractised explorer
  reads less country from the same walking, and gets hurt. It never
  becomes a standing order, so the runner never explores unasked.
- **The journal routes.** An heir inherits the ancestor's cells as
  known-but-dim, and may walk them.
- **When there is no known way home, walk-to-camp is unavailable and
  says so.** "Search a way home" is offered beside it: exploration
  aimed at camp, repeated, with no ETA and no guarantee. Starving out
  there is the honest outcome.
- **Everything the survivor decides routes on knowledge.** The runner,
  the forecaster, the Ahead panel, target selection. World-truth
  routing stays only where the world, not the person, is deciding:
  region generation, camp siting, animal movement.

## 1. Knowledge is per cell

`GameState` gains one field beside `discovered`:

```ts
/** Cells whose ground is known: walked, seen from close enough, or mapped. */
mapped: Record<number, 1 | 3>;   // 1 known, 3 dim (the journal's, not this life's)
```

It is the game's and not the person's, the same as `discovered` and
unlike `player.known` (the shore reads, which an heir must redo). It
demotes to dim at a landing, alongside the region fog
(`landing.ts demoteFog`).

Three writers, and no others:

1. **Walking.** Every cell the survivor stands in is marked, in
   `position.ts` beside the existing `enterRegion` call.
2. **Sight.** Section 2.
3. **Exploration.** Section 3, which is only sight with a purpose.

A region's fog level is now derived, not stored:

    known cells / region cells = 0      unknown, black, cannot be aimed at
                               (0, 1)   walked into: a corridor and its edges
                                1       mapped

`discovered` keeps its present job and loses routing: it records that a
place has been *named* - entered, or glimpsed at a distance too great to
map. A region at discovery SEEN with no mapped cells is exactly what
"Explore Stensund" needs and is not permitted to walk into blind.

### Storage

A mapped region is about 200 cells (`LATTICE` 14, `CELL_KM` 0.3, so
roughly 4 km across). A long life touches tens of regions, and a
`Record<number, 1>` of ten thousand keys is 70 kB of save. Store it per
region as a bitmask over that region's own `cells` array, base64'd:
about 34 characters for a fully mapped region. The in-memory form is a
`Uint8Array` per touched region, built on load.

## 2. Sight

New module `src/sim/sight.ts`. One function is the interface:

```ts
seeFrom(state, world, cal, cell): void   // marks what the eye reaches
```

Called on entering a cell, and on the hour while standing still.

The range is what a standing eye can actually resolve ground at, set by
the vantage and cut short by what is in the way:

- **Closed spruce** - 50 m. You know the cell you are in and no more.
- **Pine and birch** - 150 m, so the ring of neighbours.
- **Bog, meadow, rock, ice and open water** - the horizon of a 1.7 m eye
  over flat ground, 4.7 km, which is 15 cells.
- **Fell** - the same eye, higher up. Range grows as the horizon
  formula gives it, `3.57 * sqrt(h_metres)` km, with `h` from the
  elevation field (`terrain.ts fieldsAt`, `e` mapped to metres by the
  published spine height, written down where the constant lives).

A ray from the vantage stops at the first cell whose canopy blocks it, so
seeing far across a lake does not map the forest on its far shore, and a
fell top maps the valley it looks down into but not what is behind the
next ridge.

Light scales the range by the same log-lux factor the night penalty uses
(`light.ts`). At full dark, sight is the cell underfoot. **Walking at
night maps nothing**, which gives the torch and the moon a second job
and makes exploring after dusk pointless rather than forbidden.

`body().sightReach` (currently 0/1/2 regions) becomes a multiplier on
range: poor eyes 0.5, ordinary 1, sharp 1.5. Its present job - writing
region fog to neighbours and their neighbours - is kept as the
*naming* rule, unchanged: you can still see that a place is there from
further than you can map it.

## 3. Exploration

One new order, aimed by name:

    Explore Stensund        - a region you can name, adjacent to known ground

It is a real walk, not an abstract timer. The survivor routes to the
nearest known cell on the region's edge, then walks a sweep through the
region's unknown cells, `seeFrom` marking as they go. Terrain sets the
minutes exactly as it does for any other walk: a spruce region is mapped
by walking nearly all of it, a bog or fell region falls open in a few
long looks. **No exploration constant is invented.** The cost is the
walk, and a bad region costs what a bad region costs - roughly a
half-day for closed forest, an hour or two for open ground.

It is interruptible like any other walk, and interruption is where the
two grades come from: a survivor who turns back halfway leaves a real
blot of known cells and stands in a real place. If that blot reaches the
far side, ordinary routing can now cross the region by it. There is no
separate "cross" order and no corridor flag - a corridor is what a
half-finished exploration looks like.

Completion (every cell known) sets the region VISITED and, if the
author wants it, is where the region's shores and spots become
listable - that is already `enterRegion`'s job and needs only its
trigger moved.

### Search a way home

Offered on the Do panel exactly when `knownRoute(here, campCell)` is
null. It explores the unmapped neighbour whose centre lies most nearly
toward camp, then repeats, until a route exists or the survivor dies.
No ETA is shown, because none is knowable. The runner adds no safety
net here, consistent with the rule that away is riskier: the runner adds no
safety net a hand player would not have.

## 4. Wayfinding, the seventh skill

Mapping is practice, and it joins `SKILL_IDS` as `wayfinding`
("Wayfinding"), with mastery keys `explore` and `searchHome`. Minutes
spent exploring or searching a way home are its practice minutes;
ordinary walking is not.

**Exploration is a once order and only a once order.** There is no
"Explore, forever", no counted explore job, no keep. A survivor left to
themselves does not wander into country nobody has seen - going to look
is the player's act, taken while watching, every time. A once order is
open at any level (`2026-09-07-survidle-order-ladder-design.md`: a once job is
always open), so
wayfinding gates nothing.

That makes it the one skill off the order ladder: its rungs open no
order kinds, because it has no standing form to open. It is worth
saying plainly here rather than leaving the next reader to wonder
whether a rung was forgotten.

What the levels buy instead is a wider view and a whole ankle.

- **A wider view.** Level multiplies `sightRangeCells`, from 1 at level
  1 to 1.5 at level 20 - the ladder's last rung, and so what this game
  calls fully practised. The 1.5 is not invented: it is exactly what
  being born sharp-eyed is worth in the same function, so practice is
  worth as much as the quirk and no more. It applies to any walk, not
  only to exploring: a wayfinder notices the country they pass through.
- **Not a shorter sweep.** This was specced as speed and measured
  instead. The sweep ends only when the region is wholly known, so its
  length is a covering tour, and two models of "faster with level" both
  failed on the numbers: weighing more candidate vantages made the tour
  *longer* (a higher level walks across the region for a marginally
  better view - median 403 to 456 minutes over twelve seeds), and the
  wider view changes nothing (median 502 at levels 1, 10 and 20 alike),
  because sight range is set by the canopy and a multiplier cannot beat
  a spruce stand. So the honest claim is the one above: a wayfinder
  learns more country from the same walking, and mapping one region
  end to end costs what the ground costs, at every level. The measured
  tables are in the build's task-6 report.
- **Safety.** Unknown ground taken badly hurts you, through the
  machinery that already exists: `p.injured` in minutes, which slows
  every kind of work to 0.7 while it lasts (`player.ts:175`) and heals
  down by the minute. An exploration sweep rolls against injury per
  hour on ground that deserves it - fell, rock and bog, where a person
  reading the country wrong turns an ankle or goes into a hole - and
  the chance falls toward nothing as the level rises. Water and ice are
  not part of this: thin ice already has `fallChance` and
  `fallThrough`, and one risk model per hazard is the rule.
- **The punishment for being hurt out there is emergent.** Nothing in
  the injury says "and now the walk home is worse". It is worse because
  the survivor is four regions out, works at 0.7, and still has to
  walk. The far exploration is the dangerous one because of where it
  is, not because a number says far is riskier.

The carry (`CARRY_SHARE`, a quarter of the ancestor's minutes) applies
here like everywhere else, so a line of survivors gets better at
finding its way, and the stranded landing of section 7 softens across
generations without any rule being written for it.

## 5. Routing

`route.ts` gains one function; `findRoute` is untouched.

```ts
knownRoute(state, world, from, to, ice, avoidFell): number[] | null
```

Same A*, one extra test in the neighbour loop: a cell not in `mapped` is
impassable. `from` outside knowledge is legal (an heir lands where they
land); `to` outside knowledge returns null.

The existing cache is keyed `from>to>ice` for the life of a world and
cannot hold knowledge-aware routes. `knownRoute` takes its own cache
keyed by a knowledge generation counter bumped on every newly known
cell, so a route found before a hill was climbed is not served after.

### Who changes over

Knowledge-aware (the survivor deciding):

- `position.ts kmTo`, `kmBetween` as used for the survivor
- `tasks.ts:814`, `:833`, `:1097` - target selection and the walk home
- `body.ts:149` - the body's own walk to camp
- `intent.ts:186` - already a routability probe, now the right one
- `ui/water.ts:57`, the map's route preview, the Ahead panel
- `forecast.ts` / `forecaster.ts` / `forecast.worker.ts` - the forecast
  must not see the far side of the map either

World-truth (`findRoute`, unchanged):

- `world/gen.ts:196` - region generation
- `camp.ts:317` - camp siting scores the ground, not the survivor's map
- animal movement and anything else the world does with nobody watching

A target that is unreachable on known ground is not offered; the order
that wanted it shows the standard blocked reason, "no way you know".

## 6. The map

Fog is drawn per cell rather than per region. At zoom levels where a
glyph samples many cells (`map.ts sampleBlock`), the block takes the
share known and draws unknown, dim or lit accordingly, so a corridor
reads as a thread through black rather than opening the whole polygon.

A region at discovery SEEN with no mapped cells draws as named black:
its label is available, its ground is not. Clicking it offers "Explore",
never "Walk here".

## 7. The first hour

A new game starts on the start region's `campCell` with that region
entered (`newgame.ts:123`). Under this spec that region is *named*, not
mapped: the survivor knows where they are standing and what the eye
reaches from it. The first day's foraging is confined to what sight has
opened, and widens as they walk. This is the intended shape and is a
real change to the opening minutes - see section 9.

An heir lands in fresh country with the ancestor's cells dim. If the
landing shore touches nothing the ancestor knew - across water, which
`landingCell` permits - there is no way home and "Search a way home" is
the whole of the early game. The author has accepted this outcome
explicitly.

## 8. Tests

- A route may not pass through an unmapped cell. Construct knowledge as
  a corridor, assert the route follows it and is longer than the
  world-truth route.
- Walking marks cells; sight marks cells; night marks only the cell
  underfoot.
- Sight does not reach through spruce, and does reach across a lake.
- An interrupted exploration leaves a partial region that is crossable
  iff the blot spans it.
- Walk-to-camp is unavailable, with its reason, when no known route
  exists; "search a way home" appears in exactly that case.
- The heir's dim cells route; a landing with no touching dim cell has no
  route home.
- Save round-trip of the bitmask, including a region mapped in one life
  and dimmed in the next.
- The knowledge generation invalidates a cached route.

## 9. What this moves

Every gate measures through routing, so all of them move, and a red
gate here is the spec working rather than a regression
(a gate measures the sim; it is not a
thing to keep green by bending a rule):

- **April** - the opening is narrower until the first regions are
  mapped, and mapping costs hours that used to be foraging.
- **Year and winter at L20** - long-range targets the runner used to
  reach are gated behind exploration the runner never does. A standing
  order that wants a far shore blocks until the player has been to look
  themselves. This is the largest behavioural change in the spec: the
  away run can only work the country the player has opened by hand, and
  how far that reaches by month is the number to watch.
- **Lineage** - heir landings that used to walk home in an afternoon
  may not have a route at all.

Re-measure after the build, and treat the numbers as a new baseline
rather than tuning the fog to restore the old ones.

## Open questions for the author

1. **How badly does a blocked away run read?** Since nothing explores
   unattended, a long absence stops working the moment its order wants
   ground the player never opened. The order says why and waits, which
   is honest, but a player who leaves for eight hours may come back to
   a survivor who did half of what was asked. The lever, if it reads
   badly, is which orders may fall back to known ground rather than
   block outright.
2. **Does mapping decay?** The journal dims across a death. Within one
   life, knowledge is permanent. Snow changing the ground under it is a
   separate question and probably not worth opening.
3. **The elevation-to-metres constant.** The horizon formula needs a
   real height for the fell spine. It should be written down with its
   source rather than fitted to a sight range that felt right.
