# First Producers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reading water, the basket trap, the turf hut and the water trough, in that order, so a camp makes food without its survivor, holds a fire under a roof that outlasts a season, and keeps a week of water; plus the capability coverage test.

**Architecture:** Four new task ids and two new structures ride the existing seams: `check`/`complete` in `tasks.ts` for legality and effect, `dailyCamp` for the trap's dawn draws and the hut's decay, `shelterBonus`/`sheltered`/the roof tests for the hut's warmth, `campWaterCapacity` for the trough. Observations are a per-person map on `Player`. The trap remembers its own species list so it keeps drawing with nobody home. A new `capabilities.ts` table is asserted both ways against `RECOMMENDED`, `STRUCTURES`, `RECIPES` and `RUNG_LEVEL`.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom for UI tests). No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-first-producers-design.md`

## Global Constraints

- All paths below are relative to `08-survidle/`. Run every command from that directory. Branch: `survidle/heir-walks-home` (already checked out in the main checkout at `/Users/janis.kirsteins/Projects/prototypes`).
- `npm test` must pass and `npx tsc --noEmit` must pass before every commit. Keep `npm test` fast: no test runs more than a few hundred game days.
- No em dashes, no unicode arrows, quotes or ellipses in code, comments, docs or UI text. Plain `-`, `"`, `...`.
- Comments explain, never chronicle: no dates, no "before/after" in code comments.
- Every quantity stays real: kilos, kcal, litres, minutes. No abstract points.
- Stage commits with explicit paths under `08-survidle/` only. Never `git add -A`. Commit messages in the repo's style: `feat(survidle): ...`, `test(survidle): ...`, `docs(survidle): ...`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.
- The pre-commit hook runs biome lint and `tsc --noEmit` for the prototype; it checks the working tree, so do not leave a sibling file broken when you commit.
- Three spec deviations the plan takes and the implementer must not undo:
  1. The basket trap is a **count item** (`CountItem`, like `snare`), not a `Tool`. The spec's "a tool with no durability" is exactly what a count item is here; a `Tool` would need durability and take-up rules for nothing.
  2. The trap **remembers its species list**: `RegionState.trap` is `{ cell, kg, fish: Species[] }`. Observations die with the person, so a trap drawing "from the trap cell's observation" would stop the day its setter died. The list is written at set time from the same function the read uses.
  3. `Exposure.cabin` is renamed `walled` as the spec says; nothing else in the body model changes.
- Existing tests that assert the exact shape of `structures` or the length and order of `REFERENCE_ORDERS` will fail as fields and lines are added. Update those expectations in the task that adds the field or line, never by loosening the assertion.

## File structure

New:
- `src/sim/knowledge.ts` - observations: `shoreFish`, `readShore`, `isRead`, `readCells`, `readLine`.
- `src/sim/capabilities.ts` - the capability table and its key kinds.
- `tests/read.test.ts`, `tests/trap.test.ts`, `tests/hut.test.ts`, `tests/trough.test.ts`, `tests/capabilities.test.ts`.

Modified:
- `src/sim/types.ts` - `TaskId` and `TASK_IDS`, `StructureId`, `RecipeId`, `CountItem`, `Observation`, `Player.known`, `RegionState.trap` and structures, `DecayingId`.
- `src/sim/items.ts` - item rows, recipe, structures, life days, mend, trap and trough constants.
- `src/sim/species.ts` - `lie` per fish.
- `src/sim/skills.ts` - `skillOf`, `masteryKey`, `MASTERY_KEYS`, `RECOMMENDED`.
- `src/sim/ledger.ts`, `src/sim/tables.ts` - the `trap` source and the late-August passive row.
- `src/sim/save.ts` - version 6 and its defaults.
- `src/sim/regionstate.ts`, `src/sim/newgame.ts` - defaults.
- `src/sim/tasks.ts` - the three tasks, the roof helper, the hut in light and mend, `READ_ODDS`.
- `src/sim/intent.ts` - grounds, `resolveCell`, `yieldItem`.
- `src/sim/camp.ts` - trap draws and ice, decay over `DECAYING`.
- `src/sim/fire.ts`, `src/sim/player.ts`, `src/sim/body.ts`, `src/sim/clothing.ts` - the hut's roof, warmth and `walled`.
- `src/sim/water.ts`, `src/sim/hazards.ts` - the trough's litres.
- `src/sim/reference.ts`, `scripts/reference.ts`, `src/sim/horizon.ts` - list lines, kitted camp, found line, rows 4 and 5.
- `src/ui/panels.ts`, `src/ui/map.ts`, `src/style.css` - the read, the trap, the hut, the trough.
- `tests/reference.test.ts`, `tests/horizon.test.ts`, `tests/tasks.test.ts` and any test asserting structure shape.
- Docs: the roadmap, the spine spec, the idle curve spec's file name reference.

---

### Task 1: Types, tables, items, the version 6 save

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/items.ts`, `src/sim/species.ts`, `src/sim/ledger.ts`, `src/sim/tables.ts`, `src/sim/save.ts`, `src/sim/regionstate.ts`, `src/sim/newgame.ts`, `src/sim/skills.ts`
- Test: `tests/advance-save.test.ts` (add a case), `tests/tables.test.ts` (add a case), `tests/items.test.ts` (create if absent; otherwise add to `tests/inventory.test.ts`)

**Interfaces:**
- Produces in `types.ts`:
  - `TaskId` gains `"read" | "setTrap" | "emptyTrap"`; `TASK_IDS` lists them after `"hang"`.
  - `StructureId` gains `"turfHut" | "waterStore"`.
  - `RecipeId` gains `"basketTrap"`; `CountItem` gains `"basketTrap"`.
  - `export interface Observation { minute: number; fish: Species[] }`.
  - `Player.known: Record<number, Observation>` (cell index keyed).
  - `export type DecayingId = "leanTo" | "dryingRack" | "turfHut"`; `RegionState.structureAge: Partial<Record<DecayingId, number>>`.
  - `RegionState.structures` gains `turfHut: boolean; waterStore: boolean`.
  - `RegionState.trap: { cell: number; kg: number; fish: Species[] } | null`.
- Produces in `items.ts`:
  - `ITEM_KG.basketTrap = 2`, `ITEM_NAMES.basketTrap = "basket traps"`.
  - `RECIPES.basketTrap = { name: "basket trap", needs: [{ item: "stick", qty: 6 }, { item: "cordage", qty: 3 }], tool: "knife", minutes: 60, out: { item: "basketTrap", qty: 1 } }`.
  - `STRUCTURES.turfHut = { name: "turf hut", needs: [{ item: "log", qty: 4 }, { item: "stick", qty: 20 }, { item: "bark", qty: 40 }, { item: "cordage", qty: 4 }], minutes: 1200, desc: "Poles and a low earth wall under a bark roof, a smoke hole over the hearth. Warm, dry, and a fire inside is allowed." }`.
  - `STRUCTURES.waterStore = { name: "water trough", needs: [{ item: "log", qty: 1 }, { item: "bark", qty: 8 }, { item: "cordage", qty: 2 }], minutes: 180, desc: "A hollowed log lined with bark. Holds 20 litres at camp." }`.
  - `STRUCTURE_LIFE_DAYS: Record<DecayingId, number> = { leanTo: 90, dryingRack: 90, turfHut: 540 }`.
  - `MEND: Record<DecayingId, ...>` gains `turfHut: { needs: [{ item: "bark", qty: 20 }], minutes: 120 }`.
  - `export const DECAYING: DecayingId[] = ["leanTo", "dryingRack", "turfHut"]`.
  - `export const TRAP_HOLD_KG = 5`, `export const TRAP_ODDS = 0.5`, `export const WATER_STORE_L = 20`.
- Produces in `species.ts`: `SpeciesDef.lie?: string` and a `lie` on every fish: perch "along the reeds", roach "in the shallows", pike "in the reeds", whitefish "off the point", char "in the deep water", trout "at the inflow", burbot "on the bottom", cod "off the rocks", saithe "off the rocks" (and any other fish in the table: give it "off the point").
- Produces in `ledger.ts`: `YieldSource` gains `"trap"`; `YIELD_SOURCES` lists it after `"fish"`; `emptyYield()` returns `trap: 0`.
- Produces in `tables.ts`: `SOURCE_ROWS.trap = ["passiveFishing"]`; `LATE_AUGUST.rows.passiveFishing = row(band(100, 400), band(400, 1000))`.
- Produces in `skills.ts`: `skillOf` returns `"fishing"` for `read`, `setTrap`, `emptyTrap`; `masteryKey` returns `"read"` for `read` and `"trap"` for `setTrap` and `emptyTrap`; `MASTERY_KEYS.fishing` gains `"read"` and `"trap"`; `RECOMMENDED` gains `read: { fishing, 3 }`, `"craft:basketTrap": { fishing, 5 }`, `"build:turfHut": { building, 5 }`, `"build:waterStore": { building, 3 }`.
- Produces in `save.ts`: version 6, loads 3 to 6, defaults below.

- [ ] **Step 1: Write the failing tests**

Append to `tests/advance-save.test.ts`:

```ts
describe("the version 6 save", () => {
  it("writes version 6 and fills the producers' fields into an older save", () => {
    const { state } = newGame(8);
    const text = serialize(state);
    expect(JSON.parse(text).version).toBe(6);
    const old = JSON.parse(text);
    old.version = 5;
    delete old.state.player.known;
    for (const st of Object.values(old.state.regions) as Record<string, unknown>[]) {
      delete (st.structures as Record<string, unknown>).turfHut;
      delete (st.structures as Record<string, unknown>).waterStore;
      delete st.trap;
    }
    old.state.ledger = [{ day: 1, yield: { fish: 0, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 0, burn: { base: 0, activity: 0, walk: 0, cold: 0, sick: 0 }, sleepMin: 0, workMin: 0 }];
    const file = deserialize(JSON.stringify(old))!;
    expect(file).not.toBeNull();
    expect(file.state.player.known).toEqual({});
    for (const st of Object.values(file.state.regions)) {
      expect(st.structures.turfHut).toBe(false);
      expect(st.structures.waterStore).toBe(false);
      expect(st.trap).toBeNull();
    }
    expect(file.state.ledger[0].yield.trap).toBe(0);
  });
});
```

(Import `serialize` and `deserialize` from `../src/sim/save` if the file does not already.)

Append to `tests/tables.test.ts`:

```ts
it("the trap answers to the passive fishing row, which late August now splits out", () => {
  expect(SOURCE_ROWS.trap).toEqual(["passiveFishing"]);
  expect(LATE_AUGUST.rows.passiveFishing).toEqual({ beginner: { lo: 100, hi: 400 }, experienced: { lo: 400, hi: 1000 } });
  expect(sourceBand(LATE_AUGUST, "trap", "beginner")).toEqual({ lo: 100, hi: 400 });
  expect(YIELD_SOURCES).toContain("trap");
  expect(emptyYield().trap).toBe(0);
});
```

(Import `SOURCE_ROWS`, `LATE_AUGUST`, `sourceBand` from `../src/sim/tables` and `YIELD_SOURCES`, `emptyYield` from `../src/sim/ledger`.)

Append to `tests/inventory.test.ts`:

```ts
describe("the producers' rows", () => {
  it("has the basket trap, the turf hut and the water trough with their costs", () => {
    expect(ITEM_KG.basketTrap).toBe(2);
    expect(RECIPES.basketTrap.needs).toEqual([{ item: "stick", qty: 6 }, { item: "cordage", qty: 3 }]);
    expect(RECIPES.basketTrap.tool).toBe("knife");
    expect(STRUCTURES.turfHut.minutes).toBe(1200);
    expect(STRUCTURES.turfHut.needs).toEqual([{ item: "log", qty: 4 }, { item: "stick", qty: 20 }, { item: "bark", qty: 40 }, { item: "cordage", qty: 4 }]);
    expect(STRUCTURES.waterStore.needs).toEqual([{ item: "log", qty: 1 }, { item: "bark", qty: 8 }, { item: "cordage", qty: 2 }]);
    expect(STRUCTURE_LIFE_DAYS.turfHut).toBe(540);
    expect(MEND.turfHut).toEqual({ needs: [{ item: "bark", qty: 20 }], minutes: 120 });
    expect(DECAYING).toEqual(["leanTo", "dryingRack", "turfHut"]);
    expect(TRAP_HOLD_KG).toBe(5);
    expect(WATER_STORE_L).toBe(20);
    for (const s of fishSpecies()) expect(SPECIES_DEFS[s].lie).toBeTruthy();
    expect(RECOMMENDED.read).toEqual({ skill: "fishing", level: 3 });
    expect(RECOMMENDED["craft:basketTrap"]).toEqual({ skill: "fishing", level: 5 });
    expect(RECOMMENDED["build:turfHut"]).toEqual({ skill: "building", level: 5 });
    expect(RECOMMENDED["build:waterStore"]).toEqual({ skill: "building", level: 3 });
    expect(skillOf("read")).toBe("fishing");
    expect(masteryKey(newGame(8).state, newGame(8).world, "emptyTrap")).toBe("trap");
  });
});
```

(Imports: `ITEM_KG, RECIPES, STRUCTURES, STRUCTURE_LIFE_DAYS, MEND, DECAYING, TRAP_HOLD_KG, WATER_STORE_L` from `../src/sim/items`; `fishSpecies, SPECIES_DEFS` from `../src/sim/species`; `RECOMMENDED, skillOf, masteryKey` from `../src/sim/skills`; `newGame` from `../src/sim/newgame`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/advance-save.test.ts tests/tables.test.ts tests/inventory.test.ts`. Expected: FAIL on missing exports and fields.

- [ ] **Step 3: Types**

In `src/sim/types.ts`:

```ts
export type StructureId = "firePit" | "leanTo" | "cabin" | "dryingRack" | "snare" | "boughBed" | "turfHut" | "waterStore";
/** Structures the weather takes down unless they are mended. */
export type DecayingId = "leanTo" | "dryingRack" | "turfHut";
```

Add `"basketTrap"` to the `RecipeId` union (after `"waterskin"`) and to `CountItem` (after `"torch"`). Add to `TaskId` after `"hang"`: `| "read" | "setTrap" | "emptyTrap"` and the same three strings to `TASK_IDS` after `"hang"`.

Add after `Garment`:

```ts
/** What an hour's watching told a survivor about one shore: which fish this water holds. Dies with the person. */
export interface Observation { minute: number; fish: Species[] }
```

In `Player`, after `workHours`: `/** Shores this survivor has read, by cell. */ known: Record<number, Observation>;`

In `RegionState`: `structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; snares: number; boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean };`, `structureAge: Partial<Record<DecayingId, number>>;` and after `iceHole`:

```ts
  /** The basket trap set in this region's water: where, the live fish in it, and the species that shore holds. */
  trap: { cell: number; kg: number; fish: Species[] } | null;
```

- [ ] **Step 4: Items, species, ledger, tables, skills, defaults**

`src/sim/items.ts`: add the rows from Interfaces. Import `DecayingId` from `./types`. Replace the `STRUCTURE_LIFE_DAYS` and `MEND` types with `Record<DecayingId, ...>` and add:

```ts
/** The structures the weather takes down, in the order the panel lists them. */
export const DECAYING: DecayingId[] = ["leanTo", "dryingRack", "turfHut"];
/** Live fish a basket trap holds before it stops catching. */
export const TRAP_HOLD_KG = 5;
/** A trap's draw against a fish's own odds: a basket in the shallows is half a spear in a good hand. */
export const TRAP_ODDS = 0.5;
/** Litres the water trough holds at camp. */
export const WATER_STORE_L = 20;
```

Add `MEND.turfHut` and `STRUCTURE_LIFE_DAYS.turfHut`.

`src/sim/species.ts`: add `lie?: string;` to `SpeciesDef` with the doc comment `/** Where this fish lies off a shore, as the read names it. */`, let the `fish` factory pass `extra.lie` through (`...(extra.lie ? { lie: extra.lie } : {})`, the `extra` type widened with `lie?: string`), and give every fish its lie in the table.

`src/sim/ledger.ts`: `export type YieldSource = "fish" | "trap" | "snare" | "hunt" | "berries" | "kit";` and the list and `emptyYield` to match.

`src/sim/tables.ts`: `SOURCE_ROWS.trap = ["passiveFishing"]` and the late-August row. Update the comment above `LATE_AUGUST`: "Its fishing row folds hook and net; the passive row is the trap's share of the water, split out so the trap is measured on its own."

`src/sim/skills.ts`: `skillOf`: `case "fish": case "read": case "setTrap": case "emptyTrap": return "fishing";`. `masteryKey`: `case "read": return "read"; case "setTrap": case "emptyTrap": return "trap";`. `MASTERY_KEYS.fishing: [...fishSpecies().map((s) => \`fish:${s}\`), "read", "trap"]`. `RECOMMENDED` gains the four entries.

`src/sim/regionstate.ts` `newRegionState`: `structures` gains `turfHut: false, waterStore: false`; add `trap: null,` after `iceHole: null`.

`src/sim/newgame.ts` `newPerson`: add `known: {},` after `workHours`.

`src/sim/save.ts`: `version: 6` in the interface and `serialize`; `deserialize` accepts 3, 4, 5 and 6. In `fillDefaults`:

```ts
  state.player.known ??= {};
  for (const st of Object.values(state.regions)) {
    st.structureAge ??= {};
    st.structures.turfHut ??= false;
    st.structures.waterStore ??= false;
    st.trap ??= null;
  }
  for (const d of state.ledger) d.yield.trap ??= 0;
```

(replacing the existing one-line `structureAge` loop).

- [ ] **Step 5: Run the whole suite and fix shape assertions**

Run: `npm test`. Any test that asserts `structures` with `toEqual` needs `turfHut: false, waterStore: false` added; any test listing `YIELD_SOURCES` or `emptyYield()` exactly needs `trap`. `tests/tasks.test.ts` "offers every kind of task" does not list the new ids yet (Task 2 and 3 add them). Then `npx tsc --noEmit`. Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/species.ts 08-survidle/src/sim/ledger.ts 08-survidle/src/sim/tables.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/regionstate.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/skills.ts 08-survidle/tests
git commit -m "feat(survidle): the producers' rows - basket trap, turf hut, water trough, the trap's ledger source and the version 6 save"
```

---

### Task 2: Reading water

**Files:**
- Create: `src/sim/knowledge.ts`
- Modify: `src/sim/tasks.ts`, `src/sim/intent.ts`, `src/ui/panels.ts`
- Test: `tests/read.test.ts`, `tests/tasks.test.ts` (the "every kind of task" list gains `read`)

**Interfaces:**
- Produces in `knowledge.ts`:
  - `shoreFish(world: World, region: RegionDef, cell: number): Species[]` - the fish with capacity in `region` whose water matches `cell` (`watersideCell(world, cell, waterOf(s) ?? "any")`), in catalogue order.
  - `readShore(state: GameState, world: World, cell: number): Observation` - writes and returns `state.player.known[cell] = { minute: state.minute, fish }`.
  - `isRead(state: GameState, cell: number): boolean`.
  - `readCells(state: GameState, world: World, region: number): number[]` - the read cells of this region, those with at least one fish first, nearest to camp first within each group (`kmBetween(world, cell, campCell)`).
  - `readLine(state: GameState, world: World, cal: Calendar, cell: number): string` - "You read the water at Hareskog: perch along the reeds, whitefish off the point; the burbot are on the bottom, away until October." or "You read the water at Hareskog: nothing lives in this water." The region's name is the place; each present fish is `"${name} ${lie}"`; each absent one is `"the ${name} are ${lie}, ${absence}"` after a semicolon.
- Produces in `tasks.ts`: `export const READ_ODDS = 1.5`. `check` case `"read"`: `ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Read the water", detail: "an hour watching this shore: what lives in it and where it lies", duration: 60, repeatable: false }))`, then `if (state.weather.iceCm >= ICE_SHORE_CM) why "the water is under ice"`, then `if (isRead(state, at)) why "you have read this water"`. `complete` case `"read"`: `readShore(state, world, here); log(state, readLine(...), "good")`. `huntOdds`: after the storm line, `if (SPECIES_DEFS[species].kind === "fish" && isRead(state, cellOf(state, world))) odds *= READ_ODDS;`. `candidates` for `"fish"` at a read cell keeps only species in the observation. `read` joins `LOCATED` and `WORK_TASKS`; `availableTasks` pushes `check(..., "read")` right after the fish rows.
- Produces in `intent.ts`: `GROUND_OF.read = "shore"`. `yieldItem("read")` stays null (default).
- Produces in `panels.ts`: `rosterHtml` gains, after the four lines, `<div>Shore read: ...</div>` per read cell with fish in this region: `"${name} ${lie}"` joined by ", ", built by a new exported `readHtml(state, world, cal, id)`; nothing when no shore is read.

- [ ] **Step 1: Write the failing tests**

Create `tests/read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { isRead, readCells, readLine, readShore, shoreFish } from "../src/sim/knowledge";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { fishSpecies, SPECIES_DEFS, waterOf } from "../src/sim/species";
import { availableTasks, check, huntOdds, READ_ODDS, startTask } from "../src/sim/tasks";
import { ICE_SHORE_CM } from "../src/sim/water";
import { regionAt, spotOf } from "../src/world/gen";
import { cellOf, watersideCell } from "../src/sim/position";
import { regionDensity } from "../src/sim/animals";
import { readHtml } from "../src/ui/panels";

const cal = calendar(0);

/** Seed 4's start region has a lake; the player is put on its shore spot. */
function atShore() {
  const g = newGame(4);
  placeAtSpot(g.state, g.world, g.state.player.region, "shore");
  return { ...g, cell: cellOf(g.state, g.world), r: regionAt(g.world, g.state.player.region) };
}

describe("reading water", () => {
  it("is an hour at a waterside cell, once, and needs open water", () => {
    const { state, world, cell } = atShore();
    const o = check(state, world, cal, "read");
    expect(o).toMatchObject({ ok: true, duration: 60, label: "Read the water" });
    expect(availableTasks(state, world, cal).some((t) => t.id === "read")).toBe(true);
    state.weather.iceCm = ICE_SHORE_CM;
    expect(check(state, world, cal, "read")).toMatchObject({ ok: false, why: "the water is under ice" });
    state.weather.iceCm = 0;
    expect(startTask(state, world, cal, "read")).toBe(true);
    advance(state, world, 60);
    expect(isRead(state, cell)).toBe(true);
    expect(check(state, world, cal, "read")).toMatchObject({ ok: false, why: "you have read this water" });
  });

  it("writes the fish of this water, not the other kind of water, and says where each lies", () => {
    const { state, world, cell, r } = atShore();
    const fish = shoreFish(world, r, cell);
    expect(fish.length).toBeGreaterThan(0);
    for (const s of fish) expect(watersideCell(world, cell, waterOf(s) ?? "any")).toBe(true);
    for (const s of fishSpecies()) if (r.capacity[s] && !watersideCell(world, cell, waterOf(s) ?? "any")) expect(fish).not.toContain(s);
    const obs = readShore(state, world, cell);
    expect(obs.fish).toEqual(fish);
    expect(state.player.known[cell]).toBe(obs);
    const line = readLine(state, world, cal, cell);
    expect(line.startsWith(`You read the water at ${r.name}:`)).toBe(true);
    expect(line).toContain(SPECIES_DEFS[fish[0]].lie!);
  });

  it("a read shore fishes at one and a half times the odds; an unread one as before", () => {
    const { state, world, cell, r } = atShore();
    const s = shoreFish(world, r, cell)[0];
    const st = regionState(state, world, state.player.region);
    st.pop[s] = Math.max(st.pop[s] ?? 0, 5);
    const d = regionDensity(state, world, state.player.region, s, cal);
    const before = huntOdds(state, world, cal, d, s);
    readShore(state, world, cell);
    expect(huntOdds(state, world, cal, d, s)).toBeCloseTo(Math.min(0.95, before * READ_ODDS), 9);
    expect(READ_ODDS).toBe(1.5);
  });

  it("lists the region's read shores with fish first and nearest first, and the card shows them", () => {
    const { state, world, cell, r } = atShore();
    expect(readCells(state, world, state.player.region)).toEqual([]);
    expect(readHtml(state, world, cal, state.player.region)).toBe("");
    readShore(state, world, cell);
    expect(readCells(state, world, state.player.region)).toEqual([cell]);
    expect(readHtml(state, world, cal, state.player.region)).toContain("Shore read:");
  });

  it("dies with the person: a new person starts with nothing read", () => {
    const { state, world, cell } = atShore();
    readShore(state, world, cell);
    const fresh = newGame(4);
    expect(fresh.state.player.known).toEqual({});
    expect(state.player.known[cell]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/read.test.ts`. Expected: FAIL, `knowledge` module not found.

- [ ] **Step 3: Write knowledge.ts**

```ts
/**
 * What a survivor knows about the water. A read is an hour at a shore and
 * writes which fish this water holds and where each lies; it is the
 * person's, not the world's, so an heir reads again. The trap and, later,
 * the net set only where a shore is read.
 */
import { type RegionDef, regionAt, type World } from "../world/gen";
import { absence } from "./animals";
import type { Calendar } from "./calendar";
import { kmBetween, watersideCell } from "./position";
import { fishSpecies, type Species, SPECIES_DEFS, waterOf } from "./species";
import type { GameState, Observation } from "./types";

/** The fish with capacity in this region whose water this cell touches, in catalogue order. */
export function shoreFish(world: World, region: RegionDef, cell: number): Species[] {
  return fishSpecies().filter((s) => region.capacity[s] && watersideCell(world, cell, waterOf(s) ?? "any"));
}

export function readShore(state: GameState, world: World, cell: number): Observation {
  const region = regionAt(world, world.cells[cell].region);
  const obs: Observation = { minute: state.minute, fish: shoreFish(world, region, cell) };
  state.player.known[cell] = obs;
  return obs;
}

export function isRead(state: GameState, cell: number): boolean {
  return state.player.known[cell] !== undefined;
}

/** This region's read cells: those with fish first, then nearest the camp first. */
export function readCells(state: GameState, world: World, region: number): number[] {
  const camp = state.regions[region]?.campCell ?? regionAt(world, region).campCell;
  return Object.keys(state.player.known)
    .map(Number)
    .filter((c) => world.cells[c].region === region)
    .sort((a, b) => {
      const fa = state.player.known[a].fish.length > 0 ? 0 : 1;
      const fb = state.player.known[b].fish.length > 0 ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (kmBetween(world, a, camp) ?? 0) - (kmBetween(world, b, camp) ?? 0);
    });
}

/** The log line a read writes: present fish with their lies, absent ones with their reason after a semicolon. */
export function readLine(state: GameState, world: World, cal: Calendar, cell: number): string {
  const name = regionAt(world, world.cells[cell].region).name;
  const obs = state.player.known[cell];
  if (!obs || obs.fish.length === 0) return `You read the water at ${name}: nothing lives in this water.`;
  const here: string[] = [];
  const away: string[] = [];
  for (const s of obs.fish) {
    const def = SPECIES_DEFS[s];
    const gone = absence(def, cal, state.weather.iceCm);
    if (gone) away.push(`the ${def.name} are ${def.lie}, ${gone}`);
    else here.push(`${def.name} ${def.lie}`);
  }
  return `You read the water at ${name}: ${[here.join(", "), away.join(", ")].filter(Boolean).join("; ")}.`;
}
```

Check how a cell's region is read elsewhere (`cellAt(world, idx).region` in `world/cells.ts`); use that helper instead of `world.cells[cell].region` if `World` has no `cells` array of that shape.

- [ ] **Step 4: The task, the odds, the candidates, the ground, the card**

`src/sim/tasks.ts`: import `isRead, readLine, readShore` from `./knowledge`. Add `"read"` to `LOCATED` and `WORK_TASKS`. `export const READ_ODDS = 1.5;` with the comment `/** A read shore's odds over an unread one: knowing where the fish lie is worth half again. */`. Add the `check` case (Interfaces) beside `"fish"`; the `complete` case:

```ts
    case "read": {
      const here = cellOf(state, world);
      readShore(state, world, here);
      log(state, readLine(state, world, cal, here), "good");
      return;
    }
```

`huntOdds`: `if (SPECIES_DEFS[species].kind === "fish" && isRead(state, cellOf(state, world))) odds *= READ_ODDS;` before the `Math.min(0.95, odds)`. `candidates`: after computing `pool`, `const obs = id === "fish" ? state.player.known[at] : undefined;` and inside the loop `if (obs && !obs.fish.includes(s)) continue;`. `availableTasks`: `out.push(check(state, world, cal, "read"));` after the fish rows. Add `"read"` to the list in `tests/tasks.test.ts` "offers every kind of task".

`src/sim/intent.ts`: `GROUND_OF` gains `read: "shore"`.

`src/ui/panels.ts`: import `readCells` from `../sim/knowledge`; add

```ts
/** The shores of this region the survivor has read, each with what lies where. Empty when none is. */
export function readHtml(state: GameState, world: World, cal: Calendar, id: number): string {
  return readCells(state, world, id)
    .filter((c) => state.player.known[c].fish.length > 0)
    .map((c) => `<div>Shore read: ${state.player.known[c].fish.map((s) => `${SPECIES_DEFS[s].name} ${SPECIES_DEFS[s].lie}`).join(", ")}</div>`)
    .join("");
}
```

and append `readHtml(state, world, id, cal)`'s result to what `rosterHtml` returns (match the argument order you declare).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/read.test.ts tests/tasks.test.ts && npx tsc --noEmit`. Expected: PASS. Then `npm test`.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/knowledge.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/read.test.ts 08-survidle/tests/tasks.test.ts
git commit -m "feat(survidle): reading water - an hour at a shore says what lives in it and where, and a read shore fishes better"
```

---

### Task 3: The basket trap

**Files:**
- Modify: `src/sim/tasks.ts`, `src/sim/intent.ts`, `src/sim/camp.ts`, `src/ui/panels.ts`, `src/ui/map.ts`, `src/style.css`
- Test: `tests/trap.test.ts`, `tests/tasks.test.ts` (list gains `setTrap`, `emptyTrap`)

**Interfaces:**
- Produces in `tasks.ts`:
  - `check` case `"setTrap"`: `ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Set the trap", detail: "stakes and the basket in the shallows; catches while you are elsewhere", duration: 20 }))`; then in order: `st.trap` set -> `why: \`the trap is set at ${whereIs(state, world, st.trap.cell)} already\``; `state.weather.iceCm >= ICE_SHORE_CM` -> `"the water is under ice"`; `!isRead(state, at)` -> `"read the water first"`; `state.player.known[at].fish.length === 0` -> `"nothing lives in this water"`; `!kitInReach(state, world, "basketTrap", invs)` -> `"needs a basket trap"`.
  - `complete` case `"setTrap"`: consume one `basketTrap` from `invs` (use the same `consume(invs, [{ item: "basketTrap", qty: 1 }])` the snare build uses), `st.trap = { cell: here, kg: 0, fish: [...state.player.known[here].fish] }`, log `"The trap is set at X."` (X from `whereIs`), `state.stats.structures++`.
  - `check` case `"emptyTrap"`: `opt({ group: "hunt", label: "Empty the trap", detail: st.trap ? \`${st.trap.kg.toFixed(1)} kg of fish in it\` : "", duration: 15 })`; `!st.trap` -> `"no trap set here"`; `at !== st.trap.cell` -> `\`walk to the trap at ${whereIs(state, world, st.trap.cell)}\``; `st.trap.kg <= 1e-9` -> `"the trap is empty"`.
  - `complete` case `"emptyTrap"`: `const kg = st.trap!.kg; st.trap!.kg = 0; produce(state, world, "fish", kg); creditYield(state, "trap", kg * FOODS.cookedFish.kcalPerKg); state.stats.animals++; log(state, \`You empty the trap: ${kg.toFixed(1)} kg of fish.\`, "good")`.
  - Both in `WORK_TASKS`; neither in `LOCATED` or `CARRIED`. `availableTasks` pushes both after `read`.
- Produces in `intent.ts`: `GROUND_OF.setTrap = "shore"`; `yieldItem("emptyTrap")` is `"fish"`; `resolveCell`: before the `ground` lookup, `if (task === "emptyTrap" && st.trap) return { cell: st.trap.cell, note: "" };` and `if (task === "setTrap") { const cells = readCells(state, world, state.player.region).filter((c) => state.player.known[c].fish.length > 0); if (cells.length) return { cell: cells[0], note: "" }; }` (falls through to the shore spot when nothing is read, where `check` says "read the water first").
- Produces in `camp.ts`: `export function trapDraws(level: number): number` = `Math.min(8, 4 + Math.floor(Math.max(0, level - 5) / 5))`; `export function trapFactor(mastery: number): number` = `mastery >= 50 ? 5 / 3 : mastery >= 20 ? 4 / 3 : 1`; in `dailyCamp`, per region after the snares block:

```ts
    if (st.trap) {
      if (state.weather.iceCm >= ICE_SHORE_CM) {
        log(state, `The ice has taken the trap at ${r.name}.`, "bad");
        st.trap = null;
      } else if (st.trap.kg < TRAP_HOLD_KG) {
        const draws = who ? trapDraws(skillLevel(state, "fishing")) : 4;
        const factor = who ? trapFactor(masteryOf(state, "fishing", "trap")) : 1;
        const kgFactor = who ? yieldFactor(state, "fishing") : 1;
        const present = st.trap.fish.filter((s) => popOf(st, s) >= 1 && !absence(SPECIES_DEFS[s], cal, state.weather.iceCm));
        for (let i = 0; i < draws && present.length && st.trap.kg < TRAP_HOLD_KG; i++) {
          const s = present[rng.int(present.length)];
          const d = regionDensity(state, world, id, s, cal);
          if (!rng.chance(d * SPECIES_DEFS[s].hunt!.odds * TRAP_ODDS * factor)) continue;
          st.pop[s] = popOf(st, s) - 1;
          st.trap.kg = Math.min(TRAP_HOLD_KG, st.trap.kg + (SPECIES_DEFS[s].yields?.meatKg ?? 0) * kgFactor);
        }
      }
    }
```

  `who` is null with nobody home, which is when the base rate applies: the spec's rule. (Check `Rng` for an integer draw method; if it has only `chance` and `next`, use `Math.floor(rng.next() * present.length)` or whatever the codebase's uniform draw is called.)
- Produces in the UI: the camp panel lists `trap at <where>: <kg> kg` (or `trap at <where>: empty`); the map marks the trap cell `T` with class `mk-trap`, and `mapKey` includes `${r.trap ? "T" : ""}` per region; `.mk-trap` styled like `.mk-shelter` in `src/style.css`.

- [ ] **Step 1: Write the failing tests**

Create `tests/trap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { trapDraws, trapFactor } from "../src/sim/camp";
import { resolveCell, yieldItem } from "../src/sim/intent";
import { addItem, pile, qty } from "../src/sim/inventory";
import { TRAP_HOLD_KG } from "../src/sim/items";
import { readShore } from "../src/sim/knowledge";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { SPECIES_DEFS } from "../src/sim/species";
import { check, startTask } from "../src/sim/tasks";
import { ICE_SHORE_CM } from "../src/sim/water";
import { regionAt } from "../src/world/gen";

const cal = calendar(0);

/** Seed 4's start region has a lake: the player on its shore, the shore read, a basket in the pack, and the lake full of fish. */
function readyToSet() {
  const g = newGame(4);
  placeAtSpot(g.state, g.world, g.state.player.region, "shore");
  const cell = cellOf(g.state, g.world);
  const obs = readShore(g.state, g.world, cell);
  const st = regionState(g.state, g.world, g.state.player.region);
  for (const s of obs.fish) st.pop[s] = 50;
  addItem(g.state.player.pack, "basketTrap", 1);
  return { ...g, cell, st, obs };
}

function setTrap(g: ReturnType<typeof readyToSet>) {
  expect(startTask(g.state, g.world, cal, "setTrap")).toBe(true);
  advance(g.state, g.world, 20);
  expect(g.st.trap).not.toBeNull();
}

describe("the basket trap", () => {
  it("sets at a read shore with fish and a basket in reach, once per region", () => {
    const g = readyToSet();
    const { state, world, cell, st } = g;
    expect(check(state, world, cal, "setTrap")).toMatchObject({ ok: true, duration: 20 });
    setTrap(g);
    expect(st.trap).toMatchObject({ cell, kg: 0 });
    expect(st.trap!.fish).toEqual(g.obs.fish);
    expect(qty(state.player.pack, "basketTrap")).toBe(0);
    expect(check(state, world, cal, "setTrap").why).toMatch(/already/);
  });

  it("refuses an unread shore, an empty water, ice, and no basket, in that order of reasons", () => {
    const g = newGame(4);
    placeAtSpot(g.state, g.world, g.state.player.region, "shore");
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "read the water first" });
    const cell = cellOf(g.state, g.world);
    readShore(g.state, g.world, cell);
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "needs a basket trap" });
    g.state.player.known[cell].fish = [];
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "nothing lives in this water" });
    g.state.weather.iceCm = ICE_SHORE_CM;
    expect(check(g.state, g.world, cal, "setTrap")).toMatchObject({ ok: false, why: "the water is under ice" });
  });

  it("draws at dawn, stops at the hold, and the rate steps with level and mastery", () => {
    const g = readyToSet();
    setTrap(g);
    advance(g.state, g.world, 10 * 1440);
    expect(g.st.trap!.kg).toBeGreaterThan(0);
    expect(g.st.trap!.kg).toBeLessThanOrEqual(TRAP_HOLD_KG);
    g.st.trap!.kg = TRAP_HOLD_KG;
    advance(g.state, g.world, 3 * 1440);
    expect(g.st.trap!.kg).toBe(TRAP_HOLD_KG);
    expect(trapDraws(5)).toBe(4);
    expect(trapDraws(10)).toBe(5);
    expect(trapDraws(25)).toBe(8);
    expect(trapDraws(40)).toBe(8);
    expect(trapFactor(0)).toBe(1);
    expect(trapFactor(20)).toBeCloseTo(4 / 3, 9);
    expect(trapFactor(50)).toBeCloseTo(5 / 3, 9);
  });

  it("keeps drawing with nobody home, at the base rate", () => {
    const g = readyToSet();
    setTrap(g);
    g.state.dead = { cause: "starved", minute: g.state.minute };
    advance(g.state, g.world, 10 * 1440, { nobody: true });
    expect(g.st.trap!.kg).toBeGreaterThan(0);
  });

  it("empties at the trap cell into the pack as raw fish and credits the trap source", () => {
    const g = readyToSet();
    setTrap(g);
    g.st.trap!.kg = 1.2;
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    expect(check(g.state, g.world, cal, "emptyTrap").why).toMatch(/^walk to the trap/);
    expect(resolveCell(g.state, g.world, cal, "emptyTrap", undefined, "nearest").cell).toBe(g.cell);
    placeAt(g.state, g.world, g.cell);
    expect(check(g.state, g.world, cal, "emptyTrap")).toMatchObject({ ok: true, duration: 15 });
    expect(startTask(g.state, g.world, cal, "emptyTrap")).toBe(true);
    advance(g.state, g.world, 15);
    expect(g.st.trap!.kg).toBe(0);
    expect(qty(g.state.player.pack, "fish")).toBeCloseTo(1.2, 6);
    expect(today(g.state).yield.trap).toBeCloseTo(1200, 6);
    expect(check(g.state, g.world, cal, "emptyTrap")).toMatchObject({ ok: false, why: "the trap is empty" });
    expect(yieldItem("emptyTrap")).toBe("fish");
  });

  it("the ice takes it, and says so", () => {
    const g = readyToSet();
    setTrap(g);
    g.state.weather.iceCm = ICE_SHORE_CM;
    advance(g.state, g.world, 1440);
    expect(g.st.trap).toBeNull();
    expect(g.state.log.some((l) => l.text.includes("The ice has taken the trap"))).toBe(true);
  });

  it("an intent to set the trap goes to the nearest read shore with fish", () => {
    const g = readyToSet();
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    expect(resolveCell(g.state, g.world, cal, "setTrap", undefined, "nearest").cell).toBe(g.cell);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/trap.test.ts`. Expected: FAIL on missing exports.

- [ ] **Step 3: Tasks, intent, camp, UI**

Implement the Interfaces above. In `camp.ts` import `TRAP_HOLD_KG, TRAP_ODDS` from `./items`, `absence` from `./animals`, `SPECIES_DEFS` from `./species`, `masteryOf, skillLevel, yieldFactor` from `./skills`, `ICE_SHORE_CM` from `./water`. Watch for an import cycle: `skills.ts` must not import `camp.ts`; it does not today. In `tasks.ts` import `isRead, readCells` as needed and `whereIs` is local. In `tests/tasks.test.ts` "offers every kind of task", add `"setTrap"` and `"emptyTrap"`.

Panels: in the `built` list after the snares line, `if (st.trap) built.push(\`trap at ${esc(whereIs(state, world, st.trap.cell))}: ${st.trap.kg > 0 ? \`${st.trap.kg.toFixed(1)} kg\` : "empty"}\`);`. Map: in `mapHtml` after the camp markers loop, for each `[id, r]` of `state.regions` with `r.trap`, `markerAt.set(toGlyph(r.trap.cell), { glyph: "T", cls: "mk-trap" })` when the glyph index is `>= 0` and not already a marker; `mapKey` marks string gains `${r.trap ? "T" : ""}`. CSS: copy `.mk-shelter`'s rule for `.mk-trap`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/trap.test.ts tests/tasks.test.ts tests/ui.test.ts && npx tsc --noEmit`, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/camp.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/map.ts 08-survidle/src/style.css 08-survidle/tests/trap.test.ts 08-survidle/tests/tasks.test.ts
git commit -m "feat(survidle): the basket trap - set at a read shore, it draws at dawn, holds five kilos alive, and the ice takes it"
```

---

### Task 4: The turf hut

**Files:**
- Modify: `src/sim/fire.ts`, `src/sim/player.ts`, `src/sim/body.ts`, `src/sim/clothing.ts`, `src/sim/tasks.ts`, `src/sim/camp.ts`, `src/ui/panels.ts`, `src/ui/map.ts`
- Test: `tests/hut.test.ts`, `tests/decay.test.ts` (one case), and any test that builds `Exposure` literals with `cabin:`

**Interfaces:**
- Produces in `fire.ts`: `export function roofed(st: RegionState): boolean` = `st.structures.leanTo || st.structures.cabin || st.structures.turfHut`, used by `splitSheltered`, by `dryWood`'s `sheltered` (`st.fire.lit || st.structures.cabin || st.structures.turfHut` for the all-weather rate; the lean-to keeps its dry-weather-only rate), by `body.ts:302` and by the two `roof` locals in `tasks.ts` (`light` check and `light`/`lightIndoors` complete). `fireWarms` is unchanged (a hut without a cabin already returns true; with both, the cabin's rule stands). `stepSmoke`: `filling` gains `&& !st.structures.turfHut` with the comment `// The hut has a smoke hole; a camp with one never fills.`
- Produces in `player.ts`: `shelterBonus` returns 15 cabin, 10 hut, 5 lean-to; `sheltered` includes `turfHut`; the exposure local `cabin` becomes `walled = roof && (r.structures.cabin || r.structures.turfHut)` and `x.walled`; the wetness line reads `!x.walled`.
- Produces in `clothing.ts`: `Exposure.walled` replaces `cabin`; `wetRate` and `dryRate` read `x.walled`.
- Produces in `tasks.ts`: build check: `if ((sid === "cabin" || sid === "turfHut") && !st.structures.firePit) why "build the fire pit first"`; build complete resets `structureAge` for every `DecayingId` (`if (sid === "leanTo" || sid === "dryingRack" || sid === "turfHut")`); `lightIndoors` check: `if (!st.structures.cabin && !st.structures.turfHut) why "needs a cabin or a turf hut"`, the hearth refusal only when there is a cabin and a hearth, and `detail` is `"under the smoke hole"` when a hut stands, else the cabin's warning; `mend` check and complete take `DecayingId` and the label for the hut is `"Re-roof the hut"` with detail `"20 bark; a new roof for another year and a half"`; `availableTasks` loops `DECAYING` for mend.
- Produces in `camp.ts`: the decay loop runs over `DECAYING`; the messages: lean-to "has fallen in", rack "has rotted through", hut `\`The roof of the hut at ${r.name} has come down.\``; a fallen hut clears `st.fire.indoors = false`. `needsMending(st, id: DecayingId)`.
- Produces in the UI: `built` lists `turf hut` / `turf hut (needs re-roofing)`; the map's shelter glyph counts `turfHut` in both `mapKey` and `markerAt`.

- [ ] **Step 1: Write the failing tests**

Create `tests/hut.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { needsMending } from "../src/sim/camp";
import { fireWarms, roofed, splitSheltered, stepSmoke } from "../src/sim/fire";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { shelterBonus, sheltered } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";

const cal = calendar(0);

function campWithPit(seed = 8) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  st.structures.firePit = true;
  const camp = pile(g.state, st.campCell);
  addItem(camp, "log", 4); addItem(camp, "stick", 20); addItem(camp, "bark", 40); addItem(camp, "cordage", 4);
  return { ...g, st, camp };
}

describe("the turf hut", () => {
  it("builds at camp after the fire pit, twenty hours, and stands as a roof", () => {
    const { state, world, st } = campWithPit();
    st.structures.firePit = false;
    expect(check(state, world, cal, "build", "turfHut")).toMatchObject({ ok: false, why: "build the fire pit first" });
    st.structures.firePit = true;
    expect(check(state, world, cal, "build", "turfHut")).toMatchObject({ ok: true, duration: 1200 });
    expect(startTask(state, world, cal, "build", "turfHut")).toBe(true);
    advance(state, world, 1200 * 2);
    expect(st.structures.turfHut).toBe(true);
    expect(st.structureAge.turfHut).toBeGreaterThanOrEqual(0);
    expect(roofed(st)).toBe(true);
    expect(splitSheltered(state, world, st.campCell)).toBe(true);
    expect(sheltered(state, world)).toBe(true);
  });

  it("is ten degrees of shelter, between the lean-to and the cabin", () => {
    const { st } = campWithPit();
    expect(shelterBonus(st)).toBe(0);
    st.structures.leanTo = true;
    expect(shelterBonus(st)).toBe(5);
    st.structures.turfHut = true;
    expect(shelterBonus(st)).toBe(10);
    st.structures.cabin = true;
    expect(shelterBonus(st)).toBe(15);
  });

  it("allows a fire indoors that warms and never fills the hut with smoke", () => {
    const { state, world, st } = campWithPit();
    st.structures.turfHut = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, cal, "lightIndoors");
    expect(o).toMatchObject({ ok: true, detail: "under the smoke hole" });
    st.fire.lit = true;
    st.fire.indoors = true;
    st.fire.fuelKg = 5;
    expect(fireWarms(st)).toBe(true);
    stepSmoke(st, true, 6 * 60);
    expect(st.smoke).toBe(0);
  });

  it("keeps the rain off like a cabin", () => {
    const { state, world, st } = campWithPit();
    st.structures.turfHut = true;
    state.weather.precip = "heavy";
    state.player.wetness = 0;
    advance(state, world, 120);
    expect(state.player.wetness).toBe(0);
  });

  it("needs re-roofing past a year, comes down after a year and a half, and a mend resets it", () => {
    const { state, world, st, camp } = campWithPit();
    st.structures.turfHut = true;
    st.structureAge.turfHut = 0;
    expect(needsMending(st, "turfHut")).toBe(false);
    st.structureAge.turfHut = 361 * 1440;
    expect(needsMending(st, "turfHut")).toBe(true);
    const m = check(state, world, cal, "mend", "turfHut");
    expect(m).toMatchObject({ ok: true, label: "Re-roof the hut", duration: 120 });
    addItem(camp, "bark", 20);
    expect(startTask(state, world, cal, "mend", "turfHut")).toBe(true);
    advance(state, world, 120 * 2);
    expect(st.structureAge.turfHut).toBeLessThan(10 * 1440);
    st.structureAge.turfHut = 541 * 1440;
    st.fire.indoors = true;
    state.dead = { cause: "starved", minute: state.minute };
    advance(state, world, 1440, { nobody: true });
    expect(st.structures.turfHut).toBe(false);
    expect(st.fire.indoors).toBe(false);
    expect(state.log.some((l) => l.text.includes("The roof of the hut"))).toBe(true);
  });
});
```

The rain test assumes the player stands at camp doing a camp task (idle counts, `isCampTask(null)` is true). If wetness still rises because the player is not at the camp cell, place them with `placeAt(state, world, st.campCell)` first.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/hut.test.ts`. Expected: FAIL on `roofed` missing and `shelterBonus` returning 0 for the hut.

- [ ] **Step 3: Implement**

Follow the Interfaces. The `Exposure` rename touches every literal that builds one (grep `cabin:` in `src/sim` and `tests`); rename the field, not the meaning. In `camp.ts` replace the two-id loop with:

```ts
    for (const sid of DECAYING) {
      if (!st.structures[sid]) continue;
      st.structureAge[sid] = (st.structureAge[sid] ?? 0) + 1440;
      if (st.structureAge[sid]! < STRUCTURE_LIFE_DAYS[sid] * 1440) continue;
      st.structures[sid] = false;
      delete st.structureAge[sid];
      if (sid === "dryingRack") { st.rack.kg = 0; st.rack.dried = 0; }
      if (sid === "turfHut") st.fire.indoors = false;
      log(state, FALLS[sid](r.name), "bad");
    }
```

with `const FALLS: Record<DecayingId, (name: string) => string> = { leanTo: (n) => \`The lean-to at ${n} has fallen in.\`, dryingRack: (n) => \`The rack at ${n} has rotted through.\`, turfHut: (n) => \`The roof of the hut at ${n} has come down.\` };` above `dailyCamp`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/hut.test.ts tests/decay.test.ts tests/clothing.test.ts tests/fire.test.ts tests/light.test.ts && npx tsc --noEmit`, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/fire.ts 08-survidle/src/sim/player.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/clothing.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/camp.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/map.ts 08-survidle/tests
git commit -m "feat(survidle): the turf hut - ten degrees under a bark roof, a fire inside under the smoke hole, re-roofed every year and a half"
```

---

### Task 5: The water trough

**Files:**
- Modify: `src/sim/water.ts`, `src/sim/hazards.ts`, `src/sim/tasks.ts`, `src/sim/intent.ts`, `src/ui/panels.ts`
- Test: `tests/trough.test.ts`, `tests/water.test.ts` and `tests/fill.test.ts` (call-site signatures)

**Interfaces:**
- Produces in `water.ts`: `campWaterCapacity(inv: Inventory, st?: Pick<RegionState, "structures">): number` adds `WATER_STORE_L` when `st?.structures.waterStore`; `campWaterRoom(inv, st?)` and `pourVessels(p, inv, st?)` take and pass the same. Every caller in `src/sim` and `src/ui` passes the region state it already has (`hazards.ts` `freezeCamps`, `tasks.ts` `fill` check, `intent.ts` delivery, `panels.ts` water line). A caller with no region state at hand passes nothing and gets the vessels alone, which is the old behaviour.
- Produces in the UI: the camp panel's water line reads `water: 12.0 of 22.0 l` when the trough stands.

- [ ] **Step 1: Write the failing tests**

Create `tests/trough.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { WATER_STORE_L } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { campWaterCapacity, campWaterRoom, pourVessels } from "../src/sim/water";
import { campHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";

const cal = calendar(0);

function camp(seed = 4) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  placeAt(g.state, g.world, st.campCell);
  const camp = pile(g.state, st.campCell);
  addItem(camp, "log", 1); addItem(camp, "bark", 8); addItem(camp, "cordage", 2);
  return { ...g, st, camp };
}

describe("the water trough", () => {
  it("builds at camp in three hours and adds twenty litres to what the camp holds", () => {
    const { state, world, st, camp: inv } = camp();
    expect(campWaterCapacity(inv, st)).toBe(0);
    expect(check(state, world, cal, "build", "waterStore")).toMatchObject({ ok: true, duration: 180 });
    expect(startTask(state, world, cal, "build", "waterStore")).toBe(true);
    advance(state, world, 180 * 2);
    expect(st.structures.waterStore).toBe(true);
    expect(campWaterCapacity(inv, st)).toBe(WATER_STORE_L);
    addItem(inv, "barkBucket", 1);
    expect(campWaterCapacity(inv, st)).toBe(WATER_STORE_L + 2);
    expect(campWaterCapacity(inv)).toBe(2);
  });

  it("takes what the vessels pour until it is full", () => {
    const { state, st, camp: inv } = camp();
    st.structures.waterStore = true;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 }, { id: "barkBucket", durability: 100, litres: 2 });
    expect(campWaterRoom(inv, st)).toBe(WATER_STORE_L);
    expect(pourVessels(state.player, inv, st)).toBe(4);
    expect(qty(inv, "water")).toBe(4);
    expect(campWaterRoom(inv, st)).toBe(WATER_STORE_L - 4);
  });

  it("lets a fill keep hold more water at camp than the vessels alone could", () => {
    const { state, world, st, camp: inv } = camp();
    st.structures.waterStore = true;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 0 }, { id: "barkBucket", durability: 100, litres: 0 });
    addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 20 }, deliver: "camp", where: "nearest" }, "job");
    advance(state, world, 2 * 1440);
    expect(qty(inv, "water") + qty(inv, "ice")).toBeGreaterThan(4);
  });

  it("shows on the camp panel as capacity", () => {
    const { state, world, st } = camp();
    st.structures.waterStore = true;
    const html = campHtml(state, world, cal, newUiState());
    expect(html).toContain("water trough");
    expect(html).toContain(`of ${WATER_STORE_L.toFixed(1)} l`);
  });
});
```

(The fill keep test assumes a job at "campHas 20" is legal at level 1 by the ladder's stand-in rule; if `addOrder` refuses it, give it as `withinLadder(state, req, "keep").req` the way `setUpStage` does. If `campHtml` has another name in `panels.ts`, use the function that renders the camp block; `tests/ui.test.ts` shows which.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/trough.test.ts`. Expected: FAIL, capacity ignores the trough.

- [ ] **Step 3: Implement**

`water.ts`:

```ts
/** Litres the vessels lying in this pile can hold between them, plus the trough when this camp has one. */
export function campWaterCapacity(inv: Inventory, st?: Pick<RegionState, "structures">): number {
  let l = 0;
  for (const v of VESSELS) l += qty(inv, v) * (TOOLS[v].litres ?? 0);
  if (st?.structures.waterStore) l += WATER_STORE_L;
  return l;
}
```

Thread `st` through `campWaterRoom` and `pourVessels`, and through every caller (grep `campWaterCapacity\|campWaterRoom\|pourVessels` in `src` and `tests`). The panel's `built` list adds `water trough` when `st.structures.waterStore`, and its water line passes `st`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/trough.test.ts tests/water.test.ts tests/fill.test.ts tests/ice.test.ts && npx tsc --noEmit`, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/water.ts 08-survidle/src/sim/hazards.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/ui/panels.ts 08-survidle/tests
git commit -m "feat(survidle): the water trough - twenty litres at camp, so a fill keep is a stock and not a trip"
```

---

### Task 6: The reference list, the kitted camp, the heir's found line and horizon rows 4 and 5

**Files:**
- Modify: `src/sim/reference.ts`, `scripts/reference.ts`, `src/sim/horizon.ts`
- Test: `tests/reference.test.ts`, `tests/horizon.test.ts`

**Interfaces:**
- Produces in `reference.ts`:
  - `REFERENCE_ORDERS` gains, in place: after `job("craft", once, "fishingSpear")`: `job("read", { kind: "once" })`, `job("craft", { kind: "once" }, "basketTrap")`, `job("setTrap", { kind: "once" })`; directly before `keep("fish", 1, "any")`: `keep("emptyTrap", 1)`; after `keep("hang", 10)` and before `job("craft", once, "bow")`: `job("bark", { kind: "campHas", qty: 40 })`, `job("build", { kind: "once" }, "turfHut")`, `job("build", { kind: "once" }, "waterStore")`, `keep("fill", 20)`. The list is 35 long. The doc comment above it gains one sentence per insertion, in the voice it has: the shore is read the day the spear exists and the trap follows; empty above fish as cook sits above fish; twenty hours of roof once food runs, before the hunt; the trough after the hut, and the top fill keep stays.
  - `kitOut` gains: `st.structures.turfHut = true; st.structures.waterStore = true;` and a trap at the region's shore spot when it has one with fish: `const shore = spotOf(regionAt(world, p.region), "shore"); if (shore) { const fish = shoreFish(world, regionAt(world, p.region), shore.cell); if (fish.length) { state.player.known[shore.cell] = { minute: 0, fish }; st.trap = { cell: shore.cell, kg: 0, fish }; } }`.
  - `HeirReport.found.trapKg: number | null` (null when no trap stands); `runHeir` fills it from `oldSt.trap`, and `structures` includes `"turfHut"` and `"waterStore"` in its filter list.
- Produces in `scripts/reference.ts`: the found line reads `found: firePit, turfHut; 5 snares; trap with 3.2 kg; 0 kcal and 60 kg of firewood at camp` (`no trap` when null).
- Produces in `horizon.ts`: `HorizonStage.id` union gains `"producers" | "stocked"`; `HorizonStage` gains `built?: ("turfHut" | "waterStore" | "trap")[]` and `stocks?: Partial<Record<"driedMeat" | "water" | "firewood", number>>`; two new stages:

```ts
  { id: "producers", label: "trap, hut and trough at keeps", levels: { ...ALL_AT_5, fishing: 10, building: 10 }, band: [10, 20], built: ["turfHut", "waterStore", "trap"] },
  { id: "stocked", label: "the same, stocked", levels: { ...ALL_AT_5, fishing: 10, building: 10 }, band: [20, 60], built: ["turfHut", "waterStore", "trap"], stocks: { driedMeat: 10, water: 20, firewood: 200 } },
```

  `setUpStage` applies `built` (the hut and trough flags; the trap as `kitOut` sets it, so factor that trap block into `export function kitTrap(state, world): void` in `reference.ts` and call it from both) and `stocks` (`addItem(camp, item, n)` for each; water needs the trough for room but `addItem` bypasses room, which is the point of a stocked camp). `kitOut` itself no longer sets the hut, trough or trap: the kitted diagnostic gets them through the reference script's flag only if the spec asks; it does (section 7: "The kitted camp gains the trap ... the hut and the trough"), so `kitOut` calls `kitTrap` and sets the two flags, and `setUpStage` for the first three stages must then clear them: simpler is `kitOut(state, world, producers = true)` with the first three stages passing `false`. Do that.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, update the fish-keep test:

```ts
  it("the trap's empty keep sits above the fish keep, which follows the cook keeps", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}`);
    const cook = tasks.lastIndexOf("cook:");
    expect(tasks[cook - 1]).toBe("cook:fish");
    expect(tasks[cook + 1]).toBe("emptyTrap:");
    expect(tasks[cook + 2]).toBe("fish:any");
    expect(tasks[cook + 3]).toBe("berries:");
    expect(tasks[cook + 4]).toBe("build:dryingRack");
    const spear = tasks.indexOf("craft:fishingSpear");
    expect(tasks.slice(spear + 1, spear + 4)).toEqual(["read:", "craft:basketTrap", "setTrap:"]);
    const hang = tasks.indexOf("hang:");
    expect(tasks.slice(hang + 1, hang + 5)).toEqual(["bark:", "build:turfHut", "build:waterStore", "fill:"]);
    expect(tasks[hang + 5]).toBe("craft:bow");
    expect(REFERENCE_ORDERS.length).toBe(35);
  });
```

and add to the heir block:

```ts
  it("reports the trap's kilos and the new structures in the found line", () => {
    const r = runHeir(17, 60);
    expect(r.found).toHaveProperty("trapKg");
    expect(r.found.trapKg === null || r.found.trapKg >= 0).toBe(true);
  }, 30000);
```

In `tests/horizon.test.ts`, the first test's id list becomes `["manual", "grinds", "keeps", "producers", "stocked"]` and add:

```ts
  it("the producers stages stand the hut, the trough and a trap on the kitted camp, and the stocked one adds stores", () => {
    const { state, world } = setUpStage(17, stage("producers"));
    const st = regionState(state, world, state.player.region);
    expect(st.structures.turfHut).toBe(true);
    expect(st.structures.waterStore).toBe(true);
    expect(stage("producers").band).toEqual([10, 20]);
    expect(stage("stocked").band).toEqual([20, 60]);
    const s2 = setUpStage(17, stage("stocked"));
    const camp = pile(s2.state, regionState(s2.state, s2.world, s2.state.player.region).campCell);
    expect(qty(camp, "driedMeat")).toBeGreaterThanOrEqual(10);
    expect(qty(camp, "water")).toBeGreaterThanOrEqual(20);
    expect(qty(camp, "firewood")).toBeGreaterThanOrEqual(200);
    const manual = setUpStage(17, stage("manual"));
    expect(regionState(manual.state, manual.world, manual.state.player.region).structures.turfHut).toBe(false);
  });
```

(Import `pile, qty` from `../src/sim/inventory` and `regionState` from `../src/sim/regionstate`.) Whether seed 17's start region has a shore with fish decides `st.trap`; assert it only if `spotOf(regionAt(world, region), "shore")` exists and `shoreFish` there is non-empty.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`. Expected: FAIL on the list length and the missing stages.

- [ ] **Step 3: Implement**

As in Interfaces. In `scripts/reference.ts`:

```ts
    const trap = r.found.trapKg === null ? "no trap" : `trap with ${r.found.trapKg.toFixed(1)} kg`;
    console.log(`  found: ${r.found.structures.join(", ") || "nothing standing"}; ${r.found.snares} snares; ${trap}; ${r.found.campFoodKcal} kcal and ${r.found.campFirewoodKg} kg of firewood at camp`);
```

- [ ] **Step 4: Run the tests and the measurements**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts && npx tsc --noEmit && npm test`. Then:

```bash
npm run reference 2>&1 | tail -3
npx vite-node scripts/reference.ts --heir 17 19 42 79 250 2>&1 | grep -E "^seed|found|reached|heir:|heir passed"
npm run horizon 2>&1 | grep -E "^(stage|trap|the same)"
```

Record the three outputs in the commit message body: the April gate line, the four heir lines with their causes, and the two new horizon rows. These numbers go into the roadmap in Task 8; do not tune anything here.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/scripts/reference.ts 08-survidle/src/sim/horizon.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/horizon.test.ts
git commit -m "feat(survidle): the reference list reads the shore, sets and empties the trap, roofs the hut and fills the trough; horizon rows 4 and 5"
```

---

### Task 7: The capability coverage test

**Files:**
- Create: `src/sim/capabilities.ts`, `tests/capabilities.test.ts`

**Interfaces:**
- Produces in `capabilities.ts`:

```ts
export type CapabilityKey = `rec:${string}` | `build:${StructureId}` | `craft:${RecipeId}` | `rung:${OrderKind}`;
export interface CapabilityRow {
  /** The name a player remembers. */
  id: string;
  /** What the row stands for in code: a RECOMMENDED key, a structure, a recipe with no recommended level, a delegation rung. */
  keys: CapabilityKey[];
  /** The skill the tier sits on, or "structure" or "rung". */
  tier: { skill: SkillId; level: number } | "structure" | "rung";
  /** Skills outside its own it takes from; empty only with `alone`. */
  receives: SkillId[];
  gives: string;
  limits: string;
  alone?: string;
  producer?: true;
}
export const NOT_TIERS: StructureId[] = ["boughBed"];
export const PRODUCERS: string[] = ["snares", "drying rack", "basket trap", "water trough"];
export const CAPABILITIES: CapabilityRow[];
```

  The rows, with `id` exactly as listed (the test matches `PRODUCERS` by `id`): "jobs, grinds and keeps" (`rung:job`, `rung:grind`, `rung:keep`; tier "rung"; `alone: "the rungs are how any skill delegates; they receive nothing and give the horizon"`); "fire pit" (`build:firePit`; structure; receives ["foraging"]; gives "a fire: warmth, cooking, light, drying"; limits "firewood"); "lean-to" (`build:leanTo`; receives ["woodcraft"]; gives "+5 C and half the wetting; a roof over the pit"; limits "a season, then re-roofing"); "cabin" (`rec:build:cabin`, `build:cabin`; tier building 10; receives ["woodcraft", "foraging"]; gives "+15 C, and the hearth, storehouse, cellar and smokehouse attach here"; limits "sixty hours, a winter's firewood"); "drying rack" (`build:dryingRack`; receives ["woodcraft", "hunting", "fishing"]; producer; gives "meat that keeps: 3 kg into 1"; limits "6 kg at a time, two dry days"); "snares" (`build:snare`, `craft:snare`; tier hunting 1; receives ["woodcraft", "crafting"]; producer; gives "food while working; fur, bone and sinew"; limits "checking them, the fox, five a region"); "bone needle" (`craft:needle`; tier crafting 1; receives ["hunting"]; gives "tailored clothing, the waterskin"; limits "the first kill comes first"); "bow" (`rec:craft:bow`; tier crafting 5; receives ["woodcraft", "hunting"]; gives "roe deer and elk"; limits "arrows, sinew, a lumpy larder"); "tailored hide clothing" (`rec:craft:hideCoat`, `rec:craft:hideTrousers`, `rec:craft:hideBoots`, `rec:craft:hideBlanket`; tier crafting 8; receives ["hunting"]; gives "winter under hide"; limits "wear, mending, a deer every eight days"); "reading water" (`rec:read`; tier fishing 3; receives ["hunting"] with the comment that D's species table is Hunting's; gives "the shore says what it holds and where; a read shore fishes better; where to set a trap"; limits "nothing passive yet"); "basket trap" (`rec:craft:basketTrap`, `craft:basketTrap`; tier fishing 5; receives ["woodcraft", "crafting"]; producer; gives "passive fish: the first food a camp makes without you"; limits "emptying, the rack's 6 kg, the ice"); "turf hut" (`rec:build:turfHut`, `build:turfHut`; tier building 5; receives ["woodcraft", "foraging"]; gives "a fire inside and a first winter; +10 C"; limits "re-roofing in a year and a half"); "water trough" (`rec:build:waterStore`, `build:waterStore`; tier building 3; receives ["woodcraft"]; producer; gives "a week of water at camp"; limits "the walk to fill it").
- The test (`tests/capabilities.test.ts`) asserts:
  1. Every key exists: `rec:` keys in `RECOMMENDED`; `build:` keys in `STRUCTURES`; `craft:` keys in `RECIPES`; `rung:` keys in `RUNG_LEVEL`.
  2. Every `RECOMMENDED` key not starting with `hunt:` or `fish:` appears as `rec:<key>` in some row.
  3. Every `STRUCTURE_IDS` entry not in `NOT_TIERS` appears as `build:<id>` in some row.
  4. Every `OrderKind` in `RUNG_LEVEL` appears as `rung:<kind>`.
  5. `PRODUCERS` equals the set of row ids with `producer`, both ways.
  6. Every row has `receives.length > 0` or a non-empty `alone`; a row's own skill (its `tier.skill`) is not in `receives`; `gives` contains no `%`.
  7. Every recipe with a `RECOMMENDED` entry appears via `rec:`; recipes without one are not required (content beneath tiers).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CAPABILITIES, NOT_TIERS, PRODUCERS } from "../src/sim/capabilities";
import { RECIPES, STRUCTURE_IDS, STRUCTURES } from "../src/sim/items";
import { RECOMMENDED, RUNG_LEVEL } from "../src/sim/skills";

const keys = new Set(CAPABILITIES.flatMap((r) => r.keys));

describe("the capability spine's coverage", () => {
  it("every key a row names exists in the code", () => {
    for (const k of keys) {
      const [kind, ...rest] = k.split(":");
      const name = rest.join(":");
      if (kind === "rec") expect(RECOMMENDED[name], k).toBeDefined();
      else if (kind === "build") expect(STRUCTURES[name as keyof typeof STRUCTURES], k).toBeDefined();
      else if (kind === "craft") expect(RECIPES[name as keyof typeof RECIPES], k).toBeDefined();
      else if (kind === "rung") expect(RUNG_LEVEL[name as keyof typeof RUNG_LEVEL], k).toBeDefined();
      else throw new Error(`unknown key kind ${k}`);
    }
  });

  it("every recommended level that names a capability has a row; species are content beneath one", () => {
    for (const k of Object.keys(RECOMMENDED)) {
      if (k.startsWith("hunt:") || k.startsWith("fish:")) continue;
      expect(keys.has(`rec:${k}`), k).toBe(true);
    }
  });

  it("every structure that unlocks a capability has a row", () => {
    for (const id of STRUCTURE_IDS) {
      if (NOT_TIERS.includes(id)) continue;
      expect(keys.has(`build:${id}`), id).toBe(true);
    }
  });

  it("every delegation rung has a row", () => {
    for (const kind of Object.keys(RUNG_LEVEL)) expect(keys.has(`rung:${kind}`), kind).toBe(true);
  });

  it("the producers are exactly the rows marked producer", () => {
    const marked = CAPABILITIES.filter((r) => r.producer).map((r) => r.id).sort();
    expect(marked).toEqual([...PRODUCERS].sort());
  });

  it("every row connects systems or says why it stands alone, and none is a percent", () => {
    for (const r of CAPABILITIES) {
      if (!r.alone) expect(r.receives.length, r.id).toBeGreaterThan(0);
      if (typeof r.tier === "object") expect(r.receives, r.id).not.toContain(r.tier.skill);
      expect(r.gives, r.id).not.toContain("%");
      expect(r.id.length, r.id).toBeGreaterThan(2);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/capabilities.test.ts`. Expected: FAIL, module missing.

- [ ] **Step 3: Write capabilities.ts**

The header comment: "The capability spine (spec 2026-09-04-survidle-capability-spine-design.md, section 5), as data: one row per built capability, asserted both ways against the recommended levels, the structures, the recipes and the rungs. A row is something the survivor can newly do, recognise, make, automate or survive; it names what it receives from outside its skill, what it gives, and what it leaves limiting. Species and mastery extras are content beneath rows and are not here." Then the types and rows from Interfaces.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/capabilities.test.ts && npx tsc --noEmit && npm test`. Expected: PASS. If a `RECOMMENDED` key exists that the row list above did not anticipate, add a row for it rather than an exemption.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/capabilities.ts 08-survidle/tests/capabilities.test.ts
git commit -m "test(survidle): the capability spine's coverage - every tier, producer, rung and unlocking structure has a row, and every row a thing in the code"
```

---

### Task 8: Docs: the roadmap's order and measurement, the spine table, the file name

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`, `docs/superpowers/specs/2026-09-04-survidle-capability-spine-design.md`, `docs/superpowers/specs/2026-09-05-survidle-first-producers-design.md`

- [ ] **Step 1: The roadmap's build-order paragraph**

In "The eight sub-projects, in order", replace `then the first producers and\nstocks (C's basket trap, and 3's water storage and turf hut, pulled out\nof their items)` with `then the first producers and\nstocks (C's reading water and basket trap, then 3's turf hut, then 3's\nwater store, pulled out of their items, in that order because the heirs\ndie of food before any snow falls and cold sits under band until it does;\nbuilt)`. In "Why the first producers come before B", after the sentence ending "months past where any run ends today.", add: "Inside the slot the trap goes first and the hut second: F's heirs, walking home, starve in September with cold under band, so the trap is what moves the heir gate and the hut is what carries the survivor past it into the snow. The trough is third; no heir was thirsty."

- [ ] **Step 2: The measurement**

After the F row's paragraph that ends "the turf hut is what carries the survivor past it into the snow.", add a paragraph beginning "Measured with the producers in (`2026-09-05-survidle-first-producers-design.md`):" and give, from Task 6's outputs: the April gate line, each seed's heir with what it found (structures, trap kilos, firewood) and its outcome, the heir passed N of 4 line, and the two horizon rows with their verdicts. Numbers exactly as printed, no rounding of your own. End with one sentence on what the deaths now say, in the roadmap's voice, and what that names as next: if starvation still ends the heirs before the snow with the trap's row in band, say the rack's 6 kg and spoilage are the measured limit and the smokehouse's turn has come by the rhythm rule; if cold ends them past the snow, say the hut is standing and E's clothing is next; if the gate is green, say so and that B is next as ordered.

- [ ] **Step 3: The spine table and the file name**

In the spine spec's table, the rows "reading water", "basket trap", "water storage", "turf hut": their owner column ends with `; built`. In its section 5, replace `` `src/sim/spine.ts` holds a `CAPABILITIES` table `` with `` `src/sim/capabilities.ts` holds the `CAPABILITIES` table `` and `` `tests/spine.test.ts` `` with `` `tests/capabilities.test.ts` `` (the season spine kept the first name).

- [ ] **Step 4: Check the roadmap test and commit**

Run: `npx vitest run tests/curve-table.test.ts` (it asserts the idle curve's tables verbatim; the roadmap edit must not touch that spec). Then:

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/superpowers/specs/2026-09-04-survidle-capability-spine-design.md
git commit -m "docs(survidle): the producers slot is built - the order inside it, the heir measurement with the trap standing, and the spine rows marked"
```

---

### Task 9: The browser pass (controller, not a subagent)

Run by the session controller in Chrome, after Tasks 1 to 8 are merged on the branch, per the spec's section 9. Start the dev server from `08-survidle` (`npm run dev`), open `http://127.0.0.1:5173/prototypes/08/?seed=17`, and at speed: reach the spear, Read the water at the shore and see the line, craft and set the trap, come back the next morning to the kilos in the camp panel, empty it and cook; build the hut and light a fire indoors, watch the smoke stay at nothing; build the trough and give "keep camp at 20 litres"; die, begin again, walk home and read the found line with the trap's kilos on the landing log. Keep the console clean. Write the two or three findings into the roadmap's measurement paragraph as one sentence each, and stop the server.

## Self-review against the spec

- Section 3 (reading water): Task 2. Observation on the person, `lie` words in Task 1, `READ_ODDS` 1.5, "any" cast narrowed, once job with shore ground, no keep.
- Section 4 (trap): Task 3, plus the recipe, item and constants in Task 1 and the ledger source and late-August row in Task 1. The species list lives on the trap (deviation 2). Ice, cap, empty, credit, nobody-home base rate, resolveCell to the trap cell and to the nearest read shore.
- Section 5 (hut): Task 4. Row and life days in Task 1; warmth, roof, walled, fire inside, smoke, decay, mend, map and panel.
- Section 6 (trough): Task 5. Row in Task 1; capacity, room, pour, panel. Freezing is the existing pile rule, untouched.
- Section 7 (list, rows, reports): Task 6. 35 lines; kitted camp; found line; horizon rows 4 and 5.
- Section 8 (save): Task 1.
- Section 9 (UI and browser pass): panels and map in Tasks 2 to 5; Task 9.
- Section 10 (coverage test): Task 7. File name corrected in Task 8.
- Section 11 (docs): Task 8.
- Section 13 (done): Task 6's measurements and Task 8's paragraph; the browser pass in Task 9.
