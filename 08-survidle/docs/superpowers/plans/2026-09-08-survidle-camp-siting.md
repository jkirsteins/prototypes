# Camp Siting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a camp a place the player chooses, separate a shelter (a roof on a cell) from a camp (the one cell per region that is home), and let a camp be left behind without vanishing.

**Architecture:** Structures move off `RegionState` and onto a per-cell `Site` record held in `RegionState.sites`. `campCell` stops meaning "where the structures are" and becomes "which site is home", and may be null for a region never lived in. Warmth reads the site under the survivor's feet, so an abandoned lean-to still shelters. Siting becomes free: nothing teleports, the pile stays, the fire goes out into the old cell's pile.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-camp-siting-design.md`

## Global Constraints

- Repo rules in `/Users/janis.kirsteins/Projects/prototypes/CLAUDE.md` apply. Work only inside `08-survidle`. Stage with explicit paths; never `git add -A`.
- `npm test` and `npm run build` must both pass before every commit. The pre-commit hook runs biome lint on staged files plus `tsc --noEmit`.
- No em dashes and no non-typable unicode in any output, code comment or log string. Use `-`, `->`, `"`, `'`, `...`.
- Comments explain, never chronicle: no dates, no "before/after", no reference to this plan or to what the code used to do.
- No magic numbers. This work introduces no new balance constants; if one seems needed, stop and ask.
- Prose in the game's voice: `{You}`, `{your}` templates in log lines, lower case after a colon, no exclamation marks.
- The spec says the siting goal needs a new `sited` deed. That is wrong and this plan corrects it: `goalDeed(state, { kind: "task", id, arg })` already fires for every completed task at `src/sim/tasks.ts:1718`, so the goal credits `task("makeCamp")` and no new `Deed` kind is added.

---

### Task 1: The Site record, the accessors, and the save migration

Pure refactor. No behaviour changes. Every structure read goes through an accessor that returns the camp's site, so the game plays exactly as before and the whole suite stays green.

**Files:**
- Modify: `src/sim/types.ts` (the `RegionState` interface, around line 292-310)
- Modify: `src/sim/regionstate.ts:24-48` (`newRegionState`)
- Create: nothing; the accessors live in `src/sim/regionstate.ts` beside `regionState`
- Modify: `src/sim/save.ts:216-231` (`migrate`)
- Modify: every file reading `structures.`, `.racks`, `.boughBedAge`, `.meltDays`, `.structureAge`, `.build[` - `src/sim/camp.ts`, `src/sim/tasks.ts`, `src/sim/player.ts`, `src/sim/fire.ts`, `src/sim/body.ts`, `src/sim/reference.ts`, `src/sim/horizon.ts`, `src/sim/hazards.ts`, `src/sim/water.ts`, `src/sim/soundscape.ts`, `src/sim/orders.ts`, `src/sim/capabilities.ts`, `src/sim/actions.ts`, `src/sim/landing.ts`, `src/ui/panels.ts`, `src/ui/map.ts`
- Test: `tests/sites.test.ts` (new), plus mechanical updates to the 34 test files that touch those fields

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Site { structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean; snowShelter: boolean }; racks: number; boughBedAge: number; meltDays: number; structureAge: Partial<Record<DecayingId, number>>; build: Partial<Record<StructureId, number>> }` exported from `src/sim/types.ts`
  - `RegionState.sites: Record<number, Site>` and `RegionState.snares: number`
  - `newSite(): Site` from `src/sim/regionstate.ts`
  - `siteAt(st: RegionState, cell: number): Site | null` from `src/sim/regionstate.ts` - read only, never creates
  - `campSite(st: RegionState): Site` from `src/sim/regionstate.ts` - the site at `campCell`, creating it if absent (Task 4 makes this nullable)
  - `siteFor(st: RegionState, cell: number): Site` from `src/sim/regionstate.ts` - creates on first build

- [ ] **Step 1: Write the failing test**

Create `tests/sites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { campSite, newSite, regionState, siteAt, siteFor } from "../src/sim/regionstate";

describe("sites", () => {
  it("a fresh region has no sites and no structures anywhere", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(Object.keys(st.sites)).toHaveLength(0);
    expect(siteAt(st, st.campCell)).toBeNull();
    expect(st.snares).toBe(0);
  });

  it("siteFor creates once and returns the same record", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const a = siteFor(st, st.campCell);
    a.structures.firePit = true;
    const b = siteFor(st, st.campCell);
    expect(b).toBe(a);
    expect(siteAt(st, st.campCell)!.structures.firePit).toBe(true);
    expect(Object.keys(st.sites)).toHaveLength(1);
  });

  it("siteAt never creates", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(siteAt(st, st.campCell + 1)).toBeNull();
    expect(Object.keys(st.sites)).toHaveLength(0);
  });

  it("campSite reads the camp cell", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    campSite(st).structures.leanTo = true;
    expect(siteAt(st, st.campCell)!.structures.leanTo).toBe(true);
  });

  it("newSite starts blank", () => {
    const s = newSite();
    expect(s.structures.firePit).toBe(false);
    expect(s.racks).toBe(0);
    expect(s.structureAge).toEqual({});
    expect(s.build).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - `regionstate` has no export `siteAt` / `campSite` / `siteFor` / `newSite`.

- [ ] **Step 3: Add the Site type to `src/sim/types.ts`**

Add above `RegionState`:

```ts
/**
 * What stands on one cell. A site comes into being when something is built
 * there and outlives the camp moving away, so a lean-to left behind still
 * keeps the rain off whoever sleeps under it.
 */
export interface Site {
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean; snowShelter: boolean };
  /** Drying racks standing here, 0 to MAX_RACKS; structures.dryingRack is true while any stands. */
  racks: number;
  /** Minutes since the bough bed was laid; boughs go flat and brown after four days. */
  boughBedAge: number;
  /** Days in a row with a mean above freezing; a snow shelter slumps at SNOW_MELT_DAYS. */
  meltDays: number;
  /** Minutes since each decaying structure was built or mended; each falls after its life span. */
  structureAge: Partial<Record<DecayingId, number>>;
  /** Build progress in minutes, per structure, kept between visits. */
  build: Partial<Record<StructureId, number>>;
}
```

In `RegionState`, delete the `structures`, `racks`, `boughBedAge`, `meltDays`, `structureAge` and `build` fields and add:

```ts
  /** What stands on each built cell of this region, keyed by cell. */
  sites: Record<number, Site>;
  /** Snares set on this region's heath. They stand away from any camp, so they are the region's, not a site's. */
  snares: number;
```

Leave `campCell: number` alone; Task 4 makes it nullable. Update its doc comment to: `/** The cell that is home: where the fire burns, the rack dries and the runner walks back to. */`

- [ ] **Step 4: Add the accessors to `src/sim/regionstate.ts`**

```ts
export function newSite(): Site {
  return {
    structures: { firePit: false, leanTo: false, cabin: false, dryingRack: false, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false },
    racks: 0,
    boughBedAge: 0,
    meltDays: 0,
    structureAge: {},
    build: {},
  };
}

/** What stands on a cell, or null. Read only: asking must never be what builds a site. */
export function siteAt(st: RegionState, cell: number): Site | null {
  return st.sites[cell] ?? null;
}

/** The site at a cell, raised blank if nothing stands there yet. The one call that creates. */
export function siteFor(st: RegionState, cell: number): Site {
  return (st.sites[cell] ??= newSite());
}

/** What stands at the camp. */
export function campSite(st: RegionState): Site {
  return siteFor(st, st.campCell);
}
```

In `newRegionState`, replace the six deleted fields with `sites: {},` and `snares: 0,`.

- [ ] **Step 5: Run the new test**

Run: `npm test -- tests/sites.test.ts`
Expected: PASS. `npm run build` will still fail; that is Step 6's job.

- [ ] **Step 6: Move every read onto an accessor**

Work file by file, running `npx tsc --noEmit` after each to find the next. The rule for each site:

- A read or write that means "the camp" becomes `campSite(st).structures.X`, `campSite(st).racks`, and so on. This is the great majority.
- `st.structures.snares` becomes `st.snares` (`src/sim/tasks.ts:738,2007`, `src/sim/orders.ts:243`, `src/sim/capabilities.ts:213`, `src/sim/landing.ts` `campScore`).
- Functions that already take a `RegionState` only to read structures should take a `Site` instead where every caller has one to hand. Specifically:
  - `roofed(st: RegionState)` in `src/sim/fire.ts:75` becomes `roofed(site: Site | null)`, returning false for null.
  - `shelterBonus`, `roofBonus` and `sheltered` in `src/sim/player.ts:50-65` take `Site | null` on the same rule.
  - `burnPerHour(w, ambient, st)` in `src/sim/fire.ts:119` keeps its `RegionState` (it reads `st.fire`) and calls `campSite(st)` internally.
  - `stepSmoke(st, atCamp, dt)` keeps its `RegionState` and calls `campSite(st)` internally.
  - `needsMending(st, id)` in `src/sim/camp.ts:270` becomes `needsMending(site: Site, id: DecayingId)`.
  - `rackCapacity(st)` in `src/sim/camp.ts:135` becomes `rackCapacity(site: Site)`.
- `src/ui/map.ts:294,326` reads structures for the shelter glyph. Use `campSite(r)` for now; Task 6 draws left-behind sites.
- `src/sim/hazards.ts:53-55` (a storm taking the lean-to) acts on the camp: `campSite(st)`.
- `src/sim/horizon.ts:57-58` and `src/sim/reference.ts` kit the camp: `campSite(st)`.

Do not change behaviour anywhere. Every `campSite(st)` returns the one site there is.

- [ ] **Step 7: Move the test files onto the accessors**

The same rule, mechanically, across the 34 test files that read these fields (`grep -rl "structures\.\|\.racks\b\|boughBedAge\|meltDays\|structureAge\|\.build\[" tests`). A test that wrote `st.structures.firePit = true` writes `campSite(st).structures.firePit = true` and imports `campSite` from `../src/sim/regionstate`. A test that wrote `st.structures.snares` writes `st.snares`.

- [ ] **Step 8: Write the migration**

In `migrate` (`src/sim/save.ts`), inside the existing `for (const st of Object.values(state.regions))` loop, replace the `st.structures.*` and age defaults with a lift of the old flat shape:

```ts
    // A save from before sites kept one camp's worth of structures flat on the region.
    const flat = st as unknown as { structures?: Record<string, number | boolean>; racks?: number; boughBedAge?: number; meltDays?: number; structureAge?: Partial<Record<DecayingId, number>>; build?: Partial<Record<StructureId, number>> };
    if (flat.structures) {
      const site = newSite();
      const old = flat.structures;
      site.structures.firePit = Boolean(old.firePit);
      site.structures.leanTo = Boolean(old.leanTo);
      site.structures.cabin = Boolean(old.cabin);
      site.structures.dryingRack = Boolean(old.dryingRack);
      site.structures.boughBed = Boolean(old.boughBed);
      site.structures.hearth = Boolean(old.hearth);
      site.structures.turfHut = Boolean(old.turfHut);
      site.structures.waterStore = Boolean(old.waterStore);
      site.structures.snowShelter = Boolean(old.snowShelter);
      site.racks = flat.racks ?? 0;
      site.boughBedAge = flat.boughBedAge ?? 0;
      site.meltDays = flat.meltDays ?? 0;
      site.structureAge = flat.structureAge ?? {};
      site.build = flat.build ?? {};
      st.snares = Number(old.snares ?? 0);
      st.sites = {};
      // A region touched but never lived in gets no site, the same as one raised today.
      const lived = Object.values(site.structures).some(Boolean) || Object.keys(site.build).length > 0;
      if (lived) st.sites[st.campCell] = site;
      delete flat.structures;
      delete flat.racks;
      delete flat.boughBedAge;
      delete flat.meltDays;
      delete flat.structureAge;
      delete flat.build;
    }
    st.sites ??= {};
    st.snares ??= 0;
```

- [ ] **Step 9: Test the migration**

Add to `tests/sites.test.ts`:

```ts
import { migrate } from "../src/sim/save";
```

(If `migrate` is not exported, export it; `tests/advance-save.test.ts` shows the existing save-test pattern - follow whichever entry point it uses.)

```ts
  it("lifts a pre-sites save into one site at the old camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    delete st.snares;
    st.structures = { firePit: true, leanTo: true, cabin: false, dryingRack: true, snares: 3, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.racks = 2;
    st.boughBedAge = 0;
    st.meltDays = 0;
    st.structureAge = { leanTo: 5000, dryingRack: 100 };
    st.build = { turfHut: 60 };
    migrate(state);
    const live = regionState(state, world, state.player.region);
    const site = siteAt(live, live.campCell)!;
    expect(site.structures.firePit).toBe(true);
    expect(site.structures.leanTo).toBe(true);
    expect(site.racks).toBe(2);
    expect(site.structureAge.leanTo).toBe(5000);
    expect(site.build.turfHut).toBe(60);
    expect(live.snares).toBe(3);
    expect((live as unknown as Record<string, unknown>).structures).toBeUndefined();
  });

  it("a touched but unlived region migrates to no site", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.build = {};
    migrate(state);
    expect(Object.keys(regionState(state, world, state.player.region).sites)).toHaveLength(0);
  });
```

- [ ] **Step 10: Run everything**

Run: `npm test && npm run build`
Expected: PASS, with no test's expectations changed - only the field paths they read.

- [ ] **Step 11: Commit**

```bash
git add src/sim/types.ts src/sim/regionstate.ts src/sim/save.ts src/sim/camp.ts src/sim/tasks.ts src/sim/player.ts src/sim/fire.ts src/sim/body.ts src/sim/reference.ts src/sim/horizon.ts src/sim/hazards.ts src/sim/water.ts src/sim/soundscape.ts src/sim/orders.ts src/sim/capabilities.ts src/sim/actions.ts src/sim/landing.ts src/ui/panels.ts src/ui/map.ts tests/
git commit -m "refactor(survidle): what stands somewhere belongs to the cell, not the region"
```

---

### Task 2: Per-site clocks

`stepCamp` and `dailyCamp` currently run one region's structures. Now they run every site the region holds, so a lean-to left behind ages and falls on its own clock. The fire, rack, smoke, snares and trap stay regional and keep running at the camp.

**Files:**
- Modify: `src/sim/camp.ts` (`stepCamp` around line 26, `dailyCamp` around line 156)
- Test: `tests/sites.test.ts`

**Interfaces:**
- Consumes: `siteAt`, `siteFor`, `campSite`, `Site` from Task 1.
- Produces: no new exports. `dailyCamp` and `stepCamp` keep their signatures.

- [ ] **Step 1: Write the failing test**

```ts
  it("a site away from the camp ages and falls on its own clock", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    const site = siteFor(st, away);
    site.structures.leanTo = true;
    site.structureAge.leanTo = STRUCTURE_LIFE_DAYS.leanTo * 1440 - 1440;
    const cal = calendar(state.minute, state.startDoy);
    dailyCamp(state, world, cal, new Rng(1), { region: state.player.region, atCamp: true });
    expect(siteAt(st, away)!.structures.leanTo).toBe(false);
    expect(state.log.some((e) => e.text.includes("fallen in"))).toBe(true);
  });

  it("a bough bed away from the camp goes flat on its own clock", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    const site = siteFor(st, away);
    site.structures.boughBed = true;
    site.boughBedAge = BOUGH_BED_DAYS * 1440 - 1440;
    dailyCamp(state, world, calendar(state.minute, state.startDoy), new Rng(1), { region: state.player.region, atCamp: true });
    expect(siteAt(st, away)!.structures.boughBed).toBe(false);
  });
```

Imports needed: `Rng` from `../src/rng`, `calendar` from `../src/sim/calendar`, `dailyCamp` from `../src/sim/camp`, `BOUGH_BED_DAYS` and `STRUCTURE_LIFE_DAYS` from `../src/sim/items`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - the lean-to away from camp is still standing, because `dailyCamp` only aged the camp's site.

- [ ] **Step 3: Loop the sites in `dailyCamp`**

Inside the existing `for (const id of touchedRegions(state))` loop, replace the bough-bed, snow-shelter and `DECAYING` blocks with one pass over `Object.entries(st.sites)`. Keep the log lines and the `FALLS` table exactly as they are; the only change is which record they read and write.

The rack's teardown when a `dryingRack` falls (`st.rack.kg = 0; st.rack.dried = 0;`) only applies when the falling rack is the camp's, since `st.rack` is the camp's load. Guard it with `Number(cell) === st.campCell`. Likewise `if (sid === "turfHut") st.fire.indoors = false;`.

Snares read `st.snares` rather than `st.structures.snares`.

- [ ] **Step 4: Point `stepCamp` at the camp's site**

`stepCamp` reads structures only through `roofed` and `burnPerHour`, both of which Task 1 pointed at the camp. Nothing structural to change here; confirm with a read of the function and leave it alone if so.

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/camp.ts tests/sites.test.ts
git commit -m "feat(survidle): every built cell runs its own clock, not just the camp's"
```

---

### Task 3: A roof warms you wherever it stands

Warmth stops asking "am I at camp" and asks what stands on the cell under the survivor.

**Files:**
- Modify: `src/sim/player.ts:45-70` (`roofBonus`, `shelterBonus`, `sheltered`) and `:130-170` (`feltTemp`)
- Modify: `src/sim/fire.ts:74-77` (`roofed`)
- Test: `tests/sites.test.ts`

**Interfaces:**
- Consumes: `siteAt` from Task 1; `roofed(site: Site | null)` and `shelterBonus(site: Site | null)` as re-signed in Task 1 Step 6.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
  it("an abandoned lean-to shelters whoever sleeps under it", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    siteFor(st, away).structures.leanTo = true;
    placeAt(state, world, away);
    state.task = { id: "sleep", arg: undefined, left: 60, progress: 0 } as GameState["task"];
    const under = feltTemp(state, world, 0);
    placeAt(state, world, st.campCell);
    const open = feltTemp(state, world, 0);
    expect(under).toBeGreaterThan(open);
  });

  it("bare ground gives no roof", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const bare = st.campCell + 2;
    placeAt(state, world, bare);
    state.task = { id: "sleep", arg: undefined, left: 60, progress: 0 } as GameState["task"];
    expect(feltTemp(state, world, 0)).toBe(feltTemp(state, world, 0));
    expect(siteAt(st, bare)).toBeNull();
  });
```

Check the exact shape of `state.task` in an existing test (`tests/body.test.ts` or `tests/bedding.test.ts`) and copy it rather than inventing fields. Import `placeAt` from `../src/sim/position` and `feltTemp` from `../src/sim/player`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - `under` equals `open`, because `feltTemp` only grants a roof at the camp.

- [ ] **Step 3: Read the site under the feet**

In `feltTemp`, replace the `camp && campTask` guards on the shelter terms with a site read:

```ts
  // A roof is a roof wherever it stands: the camp's, or one the survivor
  // moved away from and has walked back into out of the rain.
  const here = siteAt(r, cellOf(state, world));
```

`indoors`, `inSnow`, `shelterBonus` and the bough bed then read `here` rather than `r.structures`, and keep their `campTask` guard, which is about what the body is doing and not about where it is. Fire warmth keeps its `camp` guard: the fire is the camp's.

`roofed(site)` and `shelterBonus(site)` return false and 0 for a null site, so bare ground behaves exactly as it does today.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run build`
Expected: PASS. Watch the sleep, bedding, winter and December suites in particular - if any moves, read why before changing a number.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts src/sim/fire.ts tests/sites.test.ts
git commit -m "feat(survidle): a roof keeps the rain off wherever it stands"
```

---

### Task 4: Siting is free, and nothing teleports

`canMoveCamp` goes. Making camp elsewhere leaves the old site standing, tips the fire's fuel and the rack's load into the old cell's pile, and says what was left.

**Files:**
- Modify: `src/sim/camp.ts` - delete `canMoveCamp` and `STRUCTURE_WORD` (lines 273-310)
- Modify: `src/sim/tasks.ts:873-880` (the `makeCamp` legality) and `:2114-2121` (the `makeCamp` completion)
- Modify: `src/ui/dopanel.ts:437-446` (the confirm dialog)
- Modify: `src/ui/panels.ts:385` (the move offer)
- Test: `tests/sites.test.ts`, and any test asserting a blocked move (`grep -rn "canMoveCamp\|stands there\|banked there\|lie at the old camp" tests`)

**Interfaces:**
- Consumes: `siteFor`, `siteAt`, `campSite` from Task 1.
- Produces: `leaveCamp(state: GameState, world: World): void` exported from `src/sim/camp.ts` - empties the fire and the rack into the current camp cell's pile. Called by the `makeCamp` completion before `campCell` moves.

- [ ] **Step 1: Write the failing test**

```ts
  it("making camp elsewhere leaves the site, the pile, the fuel and the rack's load behind", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const old = st.campCell;
    const site = siteFor(st, old);
    site.structures.firePit = true;
    site.structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 4;
    st.fire.wetKg = 1;
    st.rack.kg = 3;
    st.rack.dried = 500;
    addItem(pile(state, old), "stone", 2);
    const away = old + 1;
    placeAt(state, world, away);
    run(state, world, "makeCamp");
    expect(st.campCell).toBe(away);
    expect(siteAt(st, old)!.structures.leanTo).toBe(true);
    expect(siteAt(st, away)).toBeNull();
    expect(st.fire.lit).toBe(false);
    expect(st.rack.kg).toBe(0);
    expect(st.rack.dried).toBe(0);
    expect(qty(pile(state, old), "firewood")).toBeCloseTo(4);
    expect(qty(pile(state, old), "wetFirewood")).toBeCloseTo(1);
    expect(qty(pile(state, old), "rawMeat")).toBeCloseTo(3);
    expect(qty(pile(state, old), "stone")).toBe(2);
    expect(qty(pile(state, away), "firewood")).toBe(0);
  });

  it("a camp with a hut on it can still be moved", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    campSite(st).structures.turfHut = true;
    addItem(pile(state, st.campCell), "stone", 5);
    st.fire.lit = true;
    st.fire.fuelKg = 2;
    placeAt(state, world, st.campCell + 1);
    expect(check(state, world, calendar(state.minute, state.startDoy), "makeCamp").ok).toBe(true);
  });
```

`run` here means "complete the task": use whatever helper the existing task tests use to finish a task (see `tests/camp.test.ts` or `tests/firesite.test.ts` for the pattern - it may be `startTask` plus `advance`). Do not invent one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - the move is refused ("the lean-to stands there").

- [ ] **Step 3: Delete `canMoveCamp` and `STRUCTURE_WORD`**

Remove both from `src/sim/camp.ts` along with the now-unused `weight` import if nothing else uses it. Remove the call in `src/sim/tasks.ts:877-878` and the one in `src/ui/panels.ts:385`.

- [ ] **Step 4: Write `leaveCamp`**

In `src/sim/camp.ts`:

```ts
/**
 * What a camp leaves when the survivor moves on. Nothing travels: the fuel
 * comes off the fire and the meat off the rack into the pile at the cell
 * they stood on, and the survivor may walk back for them.
 */
export function leaveCamp(state: GameState, world: World): void {
  const st = regionState(state, world, state.player.region);
  const old = pile(state, st.campCell);
  const dry = st.fire.fuelKg;
  const wet = st.fire.wetKg;
  const meat = st.rack.kg;
  if (dry > 1e-9) addItem(old, "firewood", dry);
  if (wet > 1e-9) addItem(old, "wetFirewood", wet);
  if (meat > 1e-9) addItem(old, "rawMeat", meat);
  st.fire.lit = false;
  st.fire.fuelKg = 0;
  st.fire.wetKg = 0;
  st.fire.indoors = false;
  st.fire.unattended = 0;
  st.smoke = 0;
  st.rack.kg = 0;
  st.rack.dried = 0;
}
```

- [ ] **Step 5: Call it from the `makeCamp` completion**

`src/sim/tasks.ts:2114`:

```ts
    case "makeCamp": {
      const here = cellOf(state, world);
      const left = leftBehind(state, world);
      leaveCamp(state, world);
      st.campCell = here;
      if (state.intent) state.intent.campCell = here;
      log(state, left ? `{You} {make} camp here. ${left}` : "{You} {make} camp here.");
      return;
    }
```

`leftBehind` is a small local helper in `tasks.ts` returning a sentence naming what stays at the old cell, or `""`: the standing structures by their `STRUCTURES[id].name`, and the kilos in the old pile after `leaveCamp` would have tipped into it. Compose it in the game's voice, for example `The lean-to and 12 kg stay at the old camp.` Build it before `leaveCamp` runs so the fire's fuel is counted in the kilos.

- [ ] **Step 6: Invert the confirm dialog**

`src/ui/dopanel.ts:437-446`. The question stays "Move camp here?"; the small print stops explaining the one-camp rule and starts naming what is left behind - the same sentence `leftBehind` composes, plus the distance already computed. Keep the two buttons and their `data-act` values unchanged so `main.ts` needs no edit.

- [ ] **Step 7: Run the tests**

Run: `npm test && npm run build`
Expected: PASS. Any test asserting the old refusal reasons must be rewritten to assert the move now succeeds and what it leaves - not deleted.

- [ ] **Step 8: Commit**

```bash
git add src/sim/camp.ts src/sim/tasks.ts src/ui/dopanel.ts src/ui/panels.ts tests/
git commit -m "feat(survidle): a camp may be left, and nothing it held travels with you"
```

---

### Task 5: A region may have no camp

`campCell` becomes nullable. The generated `RegionDef.campCell` stops being a camp and becomes a suggestion.

**Files:**
- Modify: `src/sim/types.ts` (`RegionState.campCell: number | null`)
- Modify: `src/sim/regionstate.ts:27` (`campCell: null`)
- Modify: `src/sim/position.ts:28-35` (`campCellOf`), `:75` (`spotHere`), `:81` (`atCamp`), `:152`
- Modify: `src/sim/camp.ts`, `src/sim/tasks.ts`, `src/sim/body.ts` (`campStep`, `fireStep`), `src/sim/intent.ts`, `src/ui/panels.ts`, `src/ui/map.ts` - every `campCell` reader
- Modify: `src/sim/save.ts` migration - a pre-sites save keeps its camp
- Test: `tests/sites.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: `campCellOf(state, world, region?): number | null` - the same function, now nullable.

- [ ] **Step 1: Write the failing test**

```ts
  it("a region never lived in has no camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(st.campCell).toBeNull();
    expect(campCellOf(state, world)).toBeNull();
    expect(atCamp(state, world)).toBe(false);
  });

  it("camp work says there is no camp yet", () => {
    const { state, world } = newGame(2);
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "night");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("no camp");
  });

  it("making camp gives the region its first camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const here = cellOf(state, world);
    run(state, world, "makeCamp");
    expect(st.campCell).toBe(here);
    expect(atCamp(state, world)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - `campCell` is the generated cell.

- [ ] **Step 3: Make it nullable and fix the compiler's list**

Set `campCell: number | null` in `types.ts` and `campCell: null` in `newRegionState`. Then run `npx tsc --noEmit` and work the list. The rules:

- `campCellOf` returns `state.regions[region]?.campCell ?? null`. It no longer falls back to `regionAt(world, region).campCell`.
- `atCamp` is false with no camp.
- Camp-addressed task legality (`night`, `wait`, `hang`, `haul`, `melt`, `thaw`, `fill`, `light`, `lightIndoors`, and every `build` that needs the camp cell) returns `{ ok: false, why: "no camp here yet" }` when `campCellOf` is null. Use one shared guard rather than nine copies.
- `makeCamp` legality drops the `at === campCellOf(...)` check to `campCellOf(...) !== null && at === campCellOf(...)`.
- `campStep` and `campCanWarm` in `src/sim/body.ts` treat a null camp as "no way to camp": the runner sleeps or rests where it stands, using the branch that already exists at `src/sim/body.ts:388-395`.
- `campSite(st)` becomes `Site | null`, returning null with no camp. Its callers already handle null after Task 3; fix any that do not.
- `siteReport` / `siteLine` are unaffected.
- `oldCampRegion` and `campScore` in `src/sim/landing.ts` skip regions with a null camp.
- `visitedCamps` in `src/ui/map.ts` skips them too.
- In `migrate`, a save from before this task has a number in `campCell`; leave it. Only `newRegionState` starts null.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run build`
Expected: many failures in suites that assumed a camp exists. Each one is fixed by having the test site a camp first (`run(state, world, "makeCamp")` or setting `st.campCell` directly, whichever the test's style prefers) - not by restoring the fallback.

- [ ] **Step 5: Commit**

```bash
git add src/sim tests/ src/ui
git commit -m "feat(survidle): a region has no camp until somebody makes one"
```

---

### Task 6: The landing chooses where to live

The landing region is mapped on arrival, the goals ladder opens with the choice, and the map marks every site.

**Files:**
- Modify: `src/sim/landing.ts` (`land`, both branches)
- Modify: `src/sim/goals.ts:48-52` (the `GOALS` list)
- Modify: `src/ui/map.ts:322-330` (`visitedCamps` and the marker loop)
- Modify: `src/sim/reference.ts:705-722` (the kit sites its camp explicitly)
- Test: `tests/sites.test.ts`, `tests/goals-deeds.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: goal id `"site"` added to the `GoalId` union in `src/sim/goals.ts`.

- [ ] **Step 1: Write the failing test**

```ts
  it("the first survivor lands with the region mapped and no camp", () => {
    const { state, world } = newGame(2);
    expect(regionState(state, world, state.player.region).campCell).toBeNull();
    expect(knownShare(state, world, state.player.region)).toBe(1);
  });

  it("the first goal is choosing where to live", () => {
    const { state, world } = newGame(2);
    expect(GOALS[0].id).toBe("site");
    expect(goalDeed(state, { kind: "task", id: "makeCamp" })).toContain("site");
  });
```

Import `knownShare` from `../src/sim/mapped`, `GOALS` and `goalDeed` from `../src/sim/goals`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sites.test.ts`
Expected: FAIL - the region is not mapped and there is no `site` goal.

- [ ] **Step 3: Map the landing region**

In `land` (`src/sim/landing.ts`), after `enterRegion(state, world, l.region)` in both branches, call `mapRegion(state, world, l.region)`. Import it from `./mapped`. Add a short comment saying why: a camp is chosen, and a choice needs the ground in front of you.

The opening log lines lose their claim about waking at a camp if they make one - read them and adjust only if they now say something untrue.

- [ ] **Step 4: Add the goal**

At the head of `GOALS`:

```ts
  { id: "site", title: "Choose where to live", target: 1, credit: task("makeCamp") },
```

Add `"site"` to the `GoalId` union. Check `src/ui/goalpanel.ts` and `tests/goalpanel.test.ts` for anything that assumes the first goal is `firewood`.

- [ ] **Step 5: Mark every site on the map**

`visitedCamps` yields one entry per region. Replace it with one entry per site: the camp cell gets today's fire / shelter / camp glyph rule, a site that is not the camp gets `MARKS.shelter` when it has a roof and `MARKS.camp` otherwise. Update the `marks` cache key at `src/ui/map.ts:294` to include each region's site cells, or the map will not redraw when a camp moves.

- [ ] **Step 6: Site the reference player's camp**

`kit` in `src/sim/reference.ts` sets structures on the camp. Have it set `st.campCell` to the region's generated `RegionDef.campCell` first, so the kit still stands somewhere, then build as before. The reference player's opening script must make camp as its first act.

- [ ] **Step 7: Run the tests**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sim/landing.ts src/sim/goals.ts src/sim/reference.ts src/ui/map.ts tests/
git commit -m "feat(survidle): a survivor lands on ground they can read and chooses where to live"
```

---

### Task 7: The site report in front of the choice, and the gates re-derived

**Files:**
- Modify: `src/ui/panels.ts:295-390` (the region panel's Here section)
- Test: `tests/panels.test.ts` or the nearest existing panel suite
- Modify: whichever gate scripts `package.json` names (`npm run december`, the April / winter / year / lineage gates)

**Interfaces:**
- Consumes: `siteReport`, `siteLine` from `src/sim/camp.ts` - unchanged from today.

- [ ] **Step 1: Show the report before there is a camp**

The Here section shows the site report when the survivor stands off the camp. With no camp at all it must show it wherever they stand, since every cell is a candidate. Change the condition from "not at the camp" to "not at the camp, or there is no camp".

- [ ] **Step 2: Write the panel test**

Assert that with a null camp the Here section contains the site line, and that the region overview does not print "from camp" distances against a camp that does not exist.

- [ ] **Step 3: Run the tests**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Re-derive the gates**

Run each gate script this repo has and record the readings. Do not adjust any constant to make a gate pass - the spec and `docs/` are explicit that a gate measures the sim. Report the numbers, name any that moved, and say why.

- [ ] **Step 5: Browser pass**

Serve the prototype (`npm run dev`, then `http://127.0.0.1:5173/prototypes/08/`) and play the opening by hand: land, read the site line on two or three cells, make camp, build a lean-to, move the camp, walk back and sleep under the old lean-to. Confirm the log says what was left behind and the map marks both cells. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels.ts tests/
git commit -m "feat(survidle): the ground says what it offers before the camp is set"
```

---

## Notes for the executor

- Task 1 is a large mechanical diff (roughly 72 source references and 187 in tests). It changes no behaviour: if a game-logic test's expectations change, something went wrong - stop and look rather than updating the expectation.
- Tasks 3, 5 and 6 will move gate readings. That is expected. Record them; do not tune constants to restore them.
- If a step turns out to rest on a wrong reading of the code, stop and say so rather than improvising a different design.
