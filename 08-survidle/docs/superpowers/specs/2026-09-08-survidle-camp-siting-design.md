# Survidle: camp siting, and what a camp is

A camp is a place you keep. A shelter is a roof. Today the game does not
tell those apart: every structure is a boolean on `RegionState`, and every
one of them only works when you stand on `campCell`. This spec separates
them, lets the player choose where to live, and lets a camp be left behind
without vanishing.

## What the code does today, surveyed at main 11692a3

`RegionState.campCell` starts as the generated `RegionDef.campCell` and is
moved by the `makeCamp` task (`src/sim/tasks.ts:2114`). One camp per region
is already the rule and the Do panel's confirm says so
(`src/ui/dopanel.ts:445`). `canMoveCamp` (`src/sim/camp.ts:296`) blocks the
move once any structure stands, a fire is lit or banked, or a kilo lies in
the camp pile - so in practice the camp is sited once, before the fire site
is dug, and is then fixed for the run.

Structures are flags on `RegionState.structures`, read in 72 places across
18 files. `feltTemp` (`src/sim/player.ts:140-160`) grants a roof, a snow
floor, a bough bed or fire warmth only while `camp` is true, meaning the
survivor stands on `campCell`. So a shelter has no existence apart from the
camp, and a region can hold exactly one built place.

The first survivor lands on a shore cell chosen by `landingCell`
(`src/sim/landing.ts`) and inherits the generated camp without ever
choosing it. Entering a region does not map its cells; sight does.

Measured on seeds 3, 17 and 19: a region is 185-206 cells, 17-19 km2, some
4.2 km across. Every spot in a region is 4-28 minutes' walk from its camp.
A neighbouring region's camp is 47-104 minutes, unloaded, on dry ground, in
daylight. That is why an outlying shelter inside your own region is dead
content and a bivouac is not part of this work.

## Decisions taken by the author

- **A site is a built cell; the camp is which site is home.** `RegionState`
  gains `sites: Record<number, Site>`. A `Site` holds what belongs to a
  place: the structure flags, `racks`, `boughBedAge`, `meltDays`,
  `structureAge` and `build` progress. A site exists as soon as anything is
  built on the cell. `campCell` stops meaning "where the structures are"
  and means "which of my sites is home". Passed over: keeping structures
  regional and letting only the camp move, which cannot answer what happens
  to a lean-to you walk away from.
- **What stays on the region:** `wood`, `pop`, `orders`, the snares and
  `snareCatch` (they stand on the heath), the trap and `iceHole` (the
  shore), the seeps, `logsWet` - and `fire`, `rack` and `smoke`, which need
  a person and therefore belong to whichever cell is currently camp.
- **The trough needs no work.** `waterStore` only raises the water capacity
  of the pile at its cell (`src/sim/water.ts:153`), and piles are already
  keyed by cell. Stored water stays where it stands for free.
- **Siting is free and nothing teleports.** `canMoveCamp` is deleted.
  "Make camp here" is legal on any passable land cell of the current region
  that is not already the camp. On a move: the pile stays at the old cell;
  the fire goes out and its banked fuel drops into the old cell's pile as
  firewood; the rack drops its load into that pile as raw meat and its
  drying progress is lost; the old cell keeps every structure standing on
  it and its trough keeps its water. Passed over: carrying the pile with
  the camp, which teleports stock.
- **The confirm dialog inverts.** It stops saying why you cannot move and
  starts listing what you leave behind.
- **A roof warms you wherever it stands.** `feltTemp`, `roofed`,
  `shelterBonus` and `burnPerHour` stop asking "am I at camp" and ask what
  stands on the cell under the survivor. Sleeping in an abandoned lean-to
  shelters you.
- **A fire belongs to the camp.** You cannot light one at an old site; it
  is a cold roof. Still worth reaching in a storm, and if you want a fire
  there, make camp there again. Passed over: a fire per site, which gives
  one person two hearths to tend and makes `stepCamp` run per site.
- **Decay gets no new rule.** Structures fall on the clock they already
  have (`STRUCTURE_LIFE_DAYS`), and `needsMending` already says when. Stop
  visiting, stop mending, it falls. Ruins that outlast the fall go to
  `docs/roadmap-additions.md` beside burn scars: they want the same three
  decisions - what lasts, how long, and whether it survives a life.
- **The generated camp stops being a camp.** `RegionDef.campCell` becomes a
  suggestion the site report can point at. A region that has never been
  sited has no camp. Passed over: every region silently owning a camp the
  player never chose, which is today's behaviour and the reason siting
  never felt like a decision.
- **The first survivor lands with no camp.** The landing region is fully
  mapped on arrival, so the choice is readable. The Do panel opens with
  "Make camp here" and its site report, and the goals ladder's first rung
  becomes choosing where to live. Until it is sited the runner sleeps where
  the survivor stands, a branch `campStep` already has.
- **Heirs get no separate rule.** An heir lands in a region with no camp
  while the ancestor's camp stands an hour away in another region, already
  known and already home if they walk to it. They may make camp where they
  land instead. This falls out of the rules above rather than needing a
  case of its own.

## The model

```ts
interface Site {
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean;
                boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean;
                snowShelter: boolean };
  racks: number;
  boughBedAge: number;
  meltDays: number;
  structureAge: Partial<Record<DecayingId, number>>;
  build: Partial<Record<StructureId, number>>;
}
```

`RegionState.structures`, `racks`, `boughBedAge`, `meltDays`,
`structureAge` and `build` are removed and replaced by
`sites: Record<number, Site>` plus `campCell: number | null`. `snares`
leaves `structures` and becomes `RegionState.snares: number`, since snares
stand on the heath and never belonged to the camp cell.

Two accessors carry the 72 read sites:

- `siteAt(st, cell): Site | null` - what stands on a cell, read only,
  never creating.
- `campSite(st): Site | null` - the site at `campCell`, null before siting.

A third, `siteFor(st, cell): Site`, creates on first build. Nothing else
creates a site.

## Data flow

- **Building** writes to `siteFor(st, cellOf(player))`, not to the region.
  A build is legal on the camp cell as today; whether a structure may be
  raised away from camp is unchanged from today's legality checks, which
  all require the camp cell. This spec does not open building elsewhere, so
  every site but the current camp is a camp the survivor moved away from.
- **Warmth** reads `siteAt(st, cellOf(player))`. No site, no roof.
- **`stepCamp` and `dailyCamp`** iterate `touchedRegions`, then each
  region's sites for the per-site clocks (`structureAge`, `boughBedAge`,
  `meltDays`), and the region once for fire, rack, smoke, snares and trap.
- **`makeCamp`** sets `st.campCell`, empties the fire into the old cell's
  pile, empties the rack into it, and logs what was left.
- **`campScore` and `oldCampRegion`** (`src/sim/landing.ts`) score the camp
  site rather than the region.
- **`canMoveCamp`** is deleted along with `STRUCTURE_WORD`.
- **The goals ladder** gains a first rung, "Choose where to live", which
  needs a deed `makeCamp` does not emit today. `goalDeed(state, { kind:
  "sited" })` in the task's completion, credited by the new goal. The life
  record still gets no event, as the siting spec decided.

## Migration

`migrate` in `src/sim/save.ts` turns each region's flat structures into a
single site at its `campCell`, moving `racks`, `boughBedAge`, `meltDays`,
`structureAge` and `build` with them, and lifting `structures.snares` to
`st.snares`. A region whose old structures were all false and whose build
progress was empty gets `campCell: null` and no sites, matching a region
that was touched but never lived in.

## Testing

- A site keeps its structures when the camp moves away, and the old cell
  still shelters a survivor who sleeps there.
- A move leaves the pile, drops the fire's fuel and the rack's load into
  the old cell's pile, and loses the drying progress.
- A region with no camp: camp-addressed tasks say so rather than
  addressing the generated cell, and the runner sleeps where it stands.
- The heir lands with no camp in the landing region and the ancestor's
  camp still stands in its own.
- The migration turns a pre-sites save into one site at the old camp with
  every age preserved.
- Snares still catch with no camp sited.

## Gates

The reference player's opening gains a walk and 20 minutes, which moves
the goldens. The April, winter, year and lineage gates must be re-derived
against this branch, not assumed to hold. `npm test` plus a browser pass
is the gate; the balance suite runs only on an explicit ask.
