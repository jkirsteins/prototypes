# Survidle Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A survivor may only walk over ground they know, and finding out
new ground is an act they spend hours on.

**Architecture:** Knowledge becomes a per-cell record (`state.mapped`)
written by walking, by sight and by exploring. A second A* (`knownRoute`)
refuses unknown cells, and every caller where the survivor is the one
deciding switches to it. Exploration is a new direct move (`explore`,
never an order) that walks a sweep of vantage points through a named
region. Wayfinding is the seventh skill and opens no orders: it buys a
shorter sweep and a whole ankle.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-survidle-exploration-design.md`

## Global Constraints

- **No magic numbers.** Every constant is a real quantity with its source
  written beside it. A number that reads wrong is corrected, never bent
  to make a gate green.
- **Comments explain, never chronicle.** No dates, no "was X now Y", no
  reference to this plan or to what the code used to do.
- **`npm test` and `npm run build` must both pass before every commit.**
  From `08-survidle/`. Lint with `npm run lint` from the repo root.
- **Stage with explicit paths under `08-survidle/`.** Never `git add -A`;
  other sessions work in this repo.
- **One risk model per hazard.** Thin ice keeps `fallChance` /
  `fallThrough`; exploration's injury roll never touches water or ice.
- **World-truth routing stays world-truth.** `findRoute` keeps its
  present callers in `world/gen.ts`, `camp.ts` siting and animal
  movement. Only what the survivor decides moves to `knownRoute`.

---

### Task 1: The mapped-cells record

**Files:**
- Create: `src/sim/mapped.ts`
- Modify: `src/sim/types.ts` (add `mapped` to `GameState`)
- Modify: `src/sim/newgame.ts` (initialise), `src/sim/save.ts` (migrate)
- Modify: `src/sim/landing.ts` (`demoteFog` also dims cells)
- Test: `tests/mapped.test.ts`

**Interfaces:**
- Produces:
  - `isKnown(state, cell): boolean`
  - `markKnown(state, cell): void` - marks 1, bumps the generation
  - `knownShare(state, world, region): number` - 0..1
  - `knowledgeGen(): number` - route-cache stamp
  - `dimAll(state): void` - every 1 becomes 3
  - `mapRegion(state, world, region): void` - marks every cell of it

- [ ] **Step 1: Write the failing test**

```ts
// tests/mapped.test.ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { dimAll, isKnown, knownShare, knowledgeGen, mapRegion, markKnown } from "../src/sim/mapped";

describe("mapped cells", () => {
  it("marks, dims and counts a region's share", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const cells = world.regions.get(region)!.cells;
    const fresh = cells.find((c) => !isKnown(state, c))!;
    const g0 = knowledgeGen();
    markKnown(state, fresh);
    expect(isKnown(state, fresh)).toBe(true);
    expect(knowledgeGen()).toBeGreaterThan(g0);
    mapRegion(state, world, region);
    expect(knownShare(state, world, region)).toBe(1);
    dimAll(state);
    // Dim ground is still known ground: an heir may walk the journal.
    expect(isKnown(state, fresh)).toBe(true);
    expect(state.mapped[fresh]).toBe(3);
  });
});
```

Use whichever seed helper `tests/` already exports rather than a bare
`1` if there is one.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/mapped.test.ts`
Expected: FAIL, cannot resolve `../src/sim/mapped`.

- [ ] **Step 3: Add the field**

In `src/sim/types.ts`, beside `discovered`:

```ts
/** Ground whose walking is known: 1 this life's, 3 the journal's. Absent means unknown. */
mapped: Record<number, 1 | 3>;
```

- [ ] **Step 4: Write the module**

```ts
// src/sim/mapped.ts
/**
 * What ground the survivor can walk. Region fog says which places have a
 * name; this says which cells have been walked, seen close enough to
 * read, or mapped. A route may only cross what is in here.
 */
import { regionAt, type World } from "../world/gen";
import type { GameState } from "./types";

// A cache stamp for knownRoute, not game state: it never goes into the save.
let generation = 1;

export function knowledgeGen(): number {
  return generation;
}

export function isKnown(state: GameState, cell: number): boolean {
  return state.mapped[cell] !== undefined;
}

export function markKnown(state: GameState, cell: number): void {
  if (state.mapped[cell] === 1) return;
  state.mapped[cell] = 1;
  generation++;
}

export function mapRegion(state: GameState, world: World, region: number): void {
  for (const c of regionAt(world, region).cells) markKnown(state, c);
}

export function knownShare(state: GameState, world: World, region: number): number {
  const cells = regionAt(world, region).cells;
  if (!cells.length) return 1;
  let n = 0;
  for (const c of cells) if (isKnown(state, c)) n++;
  return n / cells.length;
}

/** The journal: what a dead survivor knew, the heir has read rather than walked. */
export function dimAll(state: GameState): void {
  for (const k of Object.keys(state.mapped)) state.mapped[Number(k)] = 3;
  generation++;
}
```

- [ ] **Step 5: Initialise and migrate**

`newgame.ts`: `mapped: {}` in the state literal, beside `discovered`.
The start region is *named*, not mapped: `enterRegion` still runs, and
sight (Task 2) opens what the first vantage reaches.

`save.ts`: a save from before this has only region fog. Everything its
survivor entered or read of is ground they could walk, so a load opens
those regions whole rather than stranding them where they stand:

```ts
if (!state.mapped) {
  state.mapped = {};
  for (const [id, d] of Object.entries(state.discovered)) {
    if (d === SEEN) continue;
    for (const c of regionAt(world, Number(id)).cells) state.mapped[c] = d === DIM ? 3 : 1;
  }
}
```

The defaults pass may not have `world` in hand. If it does not, put this
where `fillPopulations` is called after a load, which does.

`landing.ts demoteFog`: call `dimAll(state)` alongside the region loop.

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/mapped.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite and commit**

```bash
npm test
git add src/sim/mapped.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/sim/landing.ts tests/mapped.test.ts
git commit -m "feat(survidle): ground the survivor has walked is recorded cell by cell"
```

---

### Task 2: Sight writes cells

**Files:**
- Create: `src/sim/sight.ts`
- Modify: `src/sim/position.ts` (`placeAt`), `src/sim/tasks.ts` (`stepWalk`,
  on entering a cell), `src/sim/advance.ts` (the hourly block)
- Test: `tests/sight.test.ts`

**Interfaces:**
- Consumes: `markKnown` (Task 1), `illuminance` (`src/sim/light.ts`)
- Produces: `seeFrom(state, world, cal, cell): void`,
  `sightRangeCells(state, world, cal, cell): number`

**Numbers, with their sources:**
- A standing eye is 1.7 m; the geometric horizon is `3.57 * sqrt(h_m)`
  km, so 4.65 km over flat open ground. Cells are 300 m (`CELL_KM`), so
  15 cells.
- Closed spruce: 50 m of visibility, so the cell underfoot only.
- Pine and birch: 150 m, so the ring of neighbours.
- Fell and rock: the same formula at the vantage's own height. The
  elevation field (`terrain.ts fieldsAt().e`) is 0..1 with the fell
  threshold at 0.84; the coastal spine this world is drawn from rises to
  about 1200 m, so `metres = e * 1200`. Write that beside the constant -
  it is the one number in this build worth arguing with.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sight.test.ts
describe("sight", () => {
  it("reads far over open ground and nothing through closed spruce", () => {
    // Scan a reference seed's start region for a meadow-or-bog cell and a
    // spruce cell. From the open vantage, a cell ten cells away along a
    // line of open ground is known; from the spruce vantage, only the
    // cell underfoot is. Name the seed in a comment.
  });

  it("maps nothing at night", () => {
    // The same open vantage at 02:00 in December: only the cell underfoot.
  });

  it("stops at the first blocking canopy", () => {
    // A ray crossing water and then meeting spruce: the water cells are
    // known, the ground behind the spruce is not.
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/sight.test.ts`

- [ ] **Step 3: Write the module**

```ts
// src/sim/sight.ts
/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short; the dark takes it away. Marks cells, never regions.
 */
```

`sightRangeCells` is the vantage's base range from the table above,
times the light factor - reuse `light.ts`'s existing log-lux helper
rather than writing a second curve - times `body(state).sightReach`
mapped to 0.5 / 1 / 1.5.

`seeFrom` marches a ray toward every cell on that radius, marking each
cell it passes and stopping when it enters a cell whose canopy blocks:
spruce always, pine and birch past 150 m from the vantage.

- [ ] **Step 4: Hook it up**

- `position.ts placeAt` - after `setRegion`.
- `tasks.ts stepWalk` - in the `km >= distKm` branch, after the existing
  `setRegion` call, so every cell fully entered looks around.
- `advance.ts`'s hourly block - `seeFrom(state, world, cal, cellOf(state, world))`,
  so standing still still sees.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/sight.test.ts && npm test`

Sight changes nothing about what is *done*, so a moved golden hash is a
finding to explain before it is re-recorded.

- [ ] **Step 6: Commit**

```bash
git add src/sim/sight.ts src/sim/position.ts src/sim/tasks.ts src/sim/advance.ts tests/sight.test.ts
git commit -m "feat(survidle): the eye opens ground, as far as the vantage allows and the dark permits"
```

---

### Task 3: knownRoute

**Files:**
- Modify: `src/world/route.ts`
- Test: `tests/route.test.ts` (extend)

**Interfaces:**
- Consumes: `isKnown`, `knowledgeGen` (Task 1)
- Produces: `knownRoute(state, world, from, to, ice?, avoidFell?): number[] | null`

- [ ] **Step 1: Write the failing test**

```ts
it("will not leave known ground, and takes the long way round rather than cross the dark", () => {
  // Mark an L-shaped corridor of known cells from the survivor to a
  // target two regions off, leaving the straight line unknown.
  // Assert: findRoute is shorter; every cell of knownRoute is known;
  // a target with no known corridor returns null.
});

it("serves a fresh route once new ground is known", () => {
  // knownRoute(a, b) is null; markKnown the missing cells; knownRoute(a, b)
  // is not null. The cache must not hold the stale null.
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

Copy `astar`'s neighbour test and add one clause: a cell not in
`state.mapped` is impassable. `from` outside knowledge is legal - an
heir lands where they land - and `to` outside knowledge returns null
before the search. The cache key carries `knowledgeGen()`.

Do not touch `findRoute`.

- [ ] **Step 4: Run, then commit**

```bash
npm test
git add src/world/route.ts tests/route.test.ts
git commit -m "feat(survidle): a route may not leave the ground you know"
```

---

### Task 4: The survivor routes on knowledge

**Files:**
- Modify: `src/sim/position.ts` (`kmTo`, `kmBetween`), `src/sim/tasks.ts`
  (the travel/walk option, the haul route, `beginTask`'s route),
  `src/sim/body.ts` (the walk home), `src/sim/intent.ts` (the routability
  probe), `src/ui/water.ts`, `src/sim/forecast.ts`, `forecaster.ts`,
  `forecast.worker.ts`
- Leave alone: `src/world/gen.ts`, `src/sim/camp.ts` siting - the world
  decides those, not the survivor
- Test: `tests/knownrouting.test.ts`

**Interfaces:**
- Consumes: `knownRoute` (Task 3)

- [ ] **Step 1: Write the failing test**

```ts
it("offers no walk to a place there is no known way to", () => {
  // A fresh game: check(state, world, cal, "travel", `region:${far}`) is
  // not ok, and why reads "no way you know".
});

it("keeps camp siting on the world's own ground", () => {
  // Siting scores a cell the survivor has never seen, unchanged.
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Switch the callers**

Every listed site takes `state` and calls `knownRoute`. One blocked
reason, used everywhere, so the player learns it once: `"no way you know"`.

The forecaster runs on a worker and may not hold the live state: send
the mapped record across with the rest of the snapshot rather than
letting the worker route on world truth.

- [ ] **Step 4: Run the full suite**

Run: `npm test`

Expect real failures. Read each one. A test that set up a far walk
should now open the ground first (`mapRegion`) - that is the test being
brought up to date. A test that fails because the *runner* cannot reach
its work is a finding for the report, not a test to loosen.

- [ ] **Step 5: Commit**

```bash
git add src/sim src/ui tests
git commit -m "feat(survidle): what the survivor decides, they decide on the map they have"
```

---

### Task 5: The explore move

**Files:**
- Modify: `src/sim/types.ts` (`TaskId`, `TASK_IDS`), `src/sim/ladder.ts`
  (`NOT_ORDERS`), `src/sim/tasks.ts` (option, `beginTask`, `stepExplore`,
  the `walkAlong` extraction), `src/sim/player.ts` (activity),
  `src/sim/soundscape.ts`
- Test: `tests/explore.test.ts`

**Interfaces:**
- Consumes: `seeFrom` (Task 2), `knownRoute` (Task 3), `knownShare`,
  `mapRegion` (Task 1)
- Produces: task id `"explore"`, arg `region:<id>`

**The sweep.** Exploration is a walk with a moving target. Extract the
movement loop of `stepWalk` into

```ts
/** Walks the current route by dt minutes. Returns true when the leg is finished. */
function walkAlong(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): boolean
```

used by both `stepWalk` and `stepExplore`, so the ice roll, the region
change and the sight call live in one place. This is a refactor with a
golden-replay gate: run the replay tests before and after and account
for any change.

`stepExplore` walks the leg; when it finishes it picks the next vantage
and sets a new `state.route`. The task ends when the region's
`knownShare` is 1, or when the player stops it.

**Choosing a vantage:** the candidates are the region's cells that are
passable, reachable by `knownRoute` from where the survivor stands, and
adjacent to at least one unknown cell of the region. The best is
whichever would open the most unknown ground - `sightRangeCells` there,
squared, estimates that well enough without ray-marching every
candidate. How many candidates are weighed is the wayfinding level's
business (Task 6); until then, weigh them all.

- [ ] **Step 1: Write the failing test**

```ts
it("maps a region by walking it, and the minutes are the ground's", () => {
  // Explore a neighbouring region on a reference seed. knownShare goes
  // 0 -> 1; the elapsed minutes match routeMinutes over the legs actually
  // walked (no invented constant); the survivor stands inside it at the end.
});

it("leaves a crossable corridor when it is stopped halfway", () => {
  // Stop the sweep mid-region: knownShare is in (0, 1), and if the blot
  // spans the region, knownRoute can now cross it.
});

it("is never an order", () => {
  expect(NOT_ORDERS).toContain("explore");
  // and no order button for it appears on the Do panel
});

it("refuses a region with no name", () => {
  // discovery 0: not ok, why is "{you} {know} nothing of that country"
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

Option, beside `travel` in `tasks.ts`:

```ts
case "explore": {
  const target = walkTarget(state, world, arg ?? "");
  const o = opt({ group: "move", label: `Explore ${target?.label ?? "?"}`, detail: "", repeatable: false });
  if (!target) return { ...o, ok: false, why: "no such place" };
  const region = cellAt(world, target.cell).region;
  if (discovery(state, region) === 0) return { ...o, ok: false, why: "{you} {know} nothing of that country" };
  if (knownShare(state, world, region) >= 1) return { ...o, ok: false, why: "{you} {know} that country" };
  // No duration is promised: how long it takes is how long the ground takes.
  return { ...o, duration: 0, detail: "as long as the ground takes" };
}
```

`TASK_IDS` gains `"explore"`; `NOT_ORDERS` gains it too, and that is the
whole of "it is never an order". `player.ts` maps it to the `walk`
activity and the soundscape gives it footsteps.

- [ ] **Step 4: Run the suite and the golden replays**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/sim src/ui tests
git commit -m "feat(survidle): going to look is work, and the ground says how much"
```

---

### Task 6: Wayfinding

**Files:**
- Modify: `src/sim/types.ts` (`SkillId`), `src/sim/skills.ts`
  (`SKILL_IDS`, `SKILL_NAMES`, `MASTERY_KEYS`, `skillOf`, `masteryKey`,
  the rung logging in `train` and `carrySkills`), `src/sim/tasks.ts`
  (vantage count, injury roll)
- Test: `tests/wayfinding.test.ts`

**Interfaces:**
- Consumes: the explore task (Task 5)
- Produces: skill id `"wayfinding"`, mastery keys `explore`, `searchHome`,
  `opensOrders(skill): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it("practises by exploring and not by walking", () => {
  // Walk a route: wayfinding xp unchanged. Explore: xp grows by the minutes.
});

it("opens no orders, and logs no rung it does not have", () => {
  // Level wayfinding past every RUNG_LEVEL: no rung line is logged for
  // Wayfinding, and no order button appears for exploring.
});

it("weighs more vantages with level, so the sweep gets shorter", () => {
  // Same seed and region at wayfinding 1 vs 10: the level-10 sweep walks
  // fewer minutes. Assert the order, not a constant.
});

it("hurts a novice on bad ground and rarely a master", () => {
  // Explore a fell/rock/bog region at level 1 with a fixed rng: injured
  // minutes are set. At level 20 over the same rolls: not set.
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

- `SKILL_IDS` gains `"wayfinding"`, `SKILL_NAMES` `"Wayfinding"`,
  `MASTERY_KEYS.wayfinding = ["explore", "searchHome"]`.
- `skillOf("explore")` returns `"wayfinding"`; `masteryKey` returns
  `"explore"`, and `"searchHome"` for the search in Task 7.
- **The rung lines must not fire for wayfinding.** `train` and
  `carrySkills` both log `RUNG_ORDER` on a level crossing. Add one
  exported predicate - `opensOrders(skill)` - and skip the logging when
  it is false, rather than testing the id in two places. Its comment
  says wayfinding is the skill with no standing form.
- **Vantage count by level:** sort the candidates by how much each would
  open, consider `1 + level` of them, take the best considered. At level
  1 that is the first candidate found; at 20 it is very near the best.
  The saving is emergent - no minutes are subtracted anywhere.
- **Injury:** per hour of exploring, on `fell`, `rock` or `bog` under
  foot, roll `exploreInjuryChance(level)`, falling from a novice's real
  risk toward nothing. Set `p.injured` in minutes the way `events.ts`
  does for the wolves, log it "bad", and `record(...)` it. Water and ice
  roll nothing: thin ice already has `fallChance`.

- [ ] **Step 4: Run, then commit**

```bash
npm test
git add src/sim tests
git commit -m "feat(survidle): wayfinding - the practised eye reads the country faster, and keeps its ankles"
```

---

### Task 7: No way home

**Files:**
- Modify: `src/sim/tasks.ts` (the walk-to-camp option, a new `searchHome`
  move), `src/sim/body.ts` (the body's own walk home), `src/ui/panels.ts`
  or `src/ui/dopanel.ts` (the button)
- Test: `tests/wayhome.test.ts`

**Interfaces:**
- Consumes: the explore move (Task 5), `knownRoute` (Task 3)
- Produces: task id `"searchHome"`

- [ ] **Step 1: Write the failing test**

```ts
it("says why there is no way home, and offers the search instead", () => {
  // A survivor on ground with no known corridor to camp: walk-to-camp is
  // not ok, why is "no way you know", and check(..., "searchHome") is ok.
});

it("searches toward camp and stops when a route opens", () => {
  // It explores the neighbour whose centre lies nearest camp, and the
  // task ends the moment knownRoute(here, camp) is non-null.
});

it("the body does not walk home over ground it does not know", () => {
  // body.ts's own walk home finds no route and the survivor stays put
  // rather than crossing the dark.
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

`searchHome` is `explore` with its target chosen for it: the unmapped
region whose centre lies most nearly toward `campCellOf`. It repeats
until `knownRoute(here, camp)` is non-null or the survivor dies. No
duration is shown, because none is knowable - the detail line says so in
words. It joins `NOT_ORDERS` like `explore`.

The runner adds no safety net. If the survivor starves out there, they
starve.

- [ ] **Step 4: Run, then commit**

```bash
npm test
git add src/sim src/ui tests
git commit -m "feat(survidle): with no way home, there is only looking for one"
```

---

### Task 8: The map draws cells

**Files:**
- Modify: `src/ui/map.ts` (`blockInfo`, `seenAt`, the glyph loop, the
  cache key), `src/ui/panels.ts` (the region panel's buttons)
- Test: `tests/ui.test.ts` (extend)

**Interfaces:**
- Consumes: `isKnown`, `knownShare`, `knowledgeGen` (Task 1)

- [ ] **Step 1: Write the failing test**

```ts
it("draws a corridor as a thread, not an open polygon", () => {
  // A line of known cells inside an otherwise unknown region: the grid
  // has fog glyphs in that region and terrain glyphs along the thread.
});

it("names black ground it has heard of, and offers Explore rather than Go", () => {
  // A region at discovery SEEN with no mapped cells: fog glyphs whose
  // title carries the region name, and a button reading "Explore <name>".
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement**

`blockInfo` returns the block's knowledge rather than the region's
discovery: 0 unknown, 1 dim (the journal's), 2 known. Where a block
samples many cells, take the share known and call the block known only
if most of its cells are - a corridor must read as a thread, not as an
opened region.

The glyph loop draws fog for an unknown cell, and its title carries the
region's name when the region is named (`discovery > 0`), so the player
can tell "somewhere I have heard of" from "nothing at all".
`data-act="select"` stays on any named region, known or not: selecting
is what puts the Explore button on the panel.

The map's cache key must include `knowledgeGen()`, or the map will not
redraw as ground opens.

- [ ] **Step 4: Run, then commit**

```bash
npm test
git add src/ui tests
git commit -m "feat(survidle): the map shows the ground you know, cell by cell"
```

---

### Task 9: Measure, and write down what moved

**Files:**
- Modify: `docs/README.md` (the fog and exploration paragraphs)

- [ ] **Step 1: Run the gates**

```bash
npm test
npm run build
npm run balance
```

Then the standing gates (April, winter, year at L20, lineage), each by
its own script. Record the readings for the report - not in a code
comment.

- [ ] **Step 2: Read the year gate honestly**

The away run can now only work country the player opened by hand. If the
year gate at L20 falls, that is this spec's largest known cost and the
number to report, not a thing to fix by loosening the fog. The lever, if
one is wanted, is which orders may fall back to known ground rather than
block - and that is the author's call, not the implementer's.

- [ ] **Step 3: Update the README**

Two paragraphs, in the existing voice: unknown ground cannot be walked,
and exploration is something you do while watching.

- [ ] **Step 4: Commit and push**

```bash
git add docs
git commit -m "docs(survidle): the map you have is the map you walk"
git push -u origin worktree-exploration
```

---

## Self-review

**Spec coverage:** section 1 -> Task 1; section 2 -> Task 2; section 3 ->
Tasks 5 and 7; section 4 -> Task 6; section 5 -> Tasks 3 and 4; section 6
-> Task 8; section 7 (the first hour, the heir's landing) -> Tasks 1 and
7; section 8 (tests) -> distributed, every listed test has a home;
section 9 (what this moves) -> Task 9.

**Known gap, deliberate:** the elevation-to-metres constant is fixed in
Task 2 with its reasoning beside it, and is the one number here a
reviewer should argue with. The spec's open question about a blocked
away run stays open: nothing in this plan decides it.
