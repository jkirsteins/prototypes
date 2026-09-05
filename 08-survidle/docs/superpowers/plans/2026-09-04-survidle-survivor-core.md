# Survivor Loop Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The world is what is saved; a death is a chapter; the next survivor lands months later in the same world with a written life to read.

**Architecture:** One version 5 save keeps the world and a list of life records. Death keeps the file. "Begin again" lays the pack down, runs the sim with nobody home for the gap, rebases the clock, demotes fog to dim, re-initialises the person and shows a landing screen with a name. A pure selector turns a record into an epitaph and a cemetery entry. Structure decay and a season spine run in the daily tick, alive or not.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom for UI tests). No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-04-survidle-survivor-core-design.md`

## Global Constraints

- All paths below are relative to `08-survidle/`. Run every command from that directory.
- `npm test` must pass and `npm run build` must pass before every commit. Keep `npm test` fast: no test runs more than a few hundred game days.
- No em dashes, no unicode arrows, quotes or ellipses in code, comments, docs or UI text. Plain `-`, `"`, `...`.
- Comments explain, never chronicle: no dates, no "before/after" in code comments.
- Every quantity stays real: kilos, kcal, km, days. No abstract points.
- `state.log` stays a scrolling window (`LOG_CAP` 300). Nothing new reads it for history; history is the life record.
- Stage commits with explicit paths under `08-survidle/` only. Never `git add -A`. Commit messages in the repo's style: `feat(survidle): ...`, `test(survidle): ...`, `docs(survidle): ...`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- A spec deviation the plan takes and the implementer must not undo: tools in piles have no durability in this codebase (`takeUp` gives a fresh tool). The spec's 4.3 rust rule is therefore NOT built here; the pack laid down at death goes into the pile as items, and the rust rule lands with the corpse run. Task 11 writes this into the roadmap.
- A second one: `dailyCamp` already regrows forest wood slowly; that runs during the gap as it runs while alive. The spec's "wood counts stay" means no new regrowth rule, not that the existing one is switched off.

## File structure

New:
- `src/sim/record.ts` - life record: `newRecord`, `current`, `worldDate`, `record`, `noteNight`, `fillDied`.
- `src/sim/names.ts` - name pools, `rollName`, `nameTaken`, `fmtName`.
- `src/sim/epitaph.ts` - `epitaph`, `entry`, `since` over a `LifeRecord`.
- `src/sim/spine.ts` - the eight thresholds, `expectedDoy`, `stepSpine`, `nextThreshold`.
- `src/sim/landing.ts` - `COAST_OPEN_FROM/TO`, `landingDate`, `landingCell`, `layDownPack`, `beginAgain`, `land`, `demoteFog`.
- `tests/record.test.ts`, `tests/names.test.ts`, `tests/epitaph.test.ts`, `tests/nobody.test.ts`, `tests/decay.test.ts`, `tests/landing.test.ts`, `tests/spine.test.ts`, `tests/survivor-ui.test.ts`.

Modified:
- `src/sim/types.ts` - `WorldDate`, `ThresholdId`, `LifeEvent`, `Died`, `LifeRecord`, `Landing`, `GameState` fields, `DeathCause` gains `"gaveUp"`, `TaskId` gains `"mend"`, `RegionState.structureAge`.
- `src/sim/save.ts` - version 5, migration, dead saves kept.
- `src/sim/newgame.ts` - `newPerson` split out.
- `src/sim/advance.ts` - nobody mode, `Presence`, daily spine and forecast tick.
- `src/sim/camp.ts`, `src/sim/hazards.ts`, `src/sim/events.ts`, `src/sim/animals.ts` - take a `Presence | null`.
- `src/sim/player.ts` - `die` fills the died block; `abandon`.
- `src/sim/tasks.ts` - record seams, the `mend` task.
- `src/sim/regionstate.ts` - `DIM`, `structureAge` default.
- `src/sim/reference.ts`, `scripts/reference.ts` - heir mode.
- `src/ui/panels.ts`, `src/ui/map.ts`, `src/ui/render.ts`, `src/main.ts`, `index.html`, `src/style.css`.

---

### Task 1: Types, the version 5 save, and the person split

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/save.ts`
- Modify: `src/sim/newgame.ts`
- Create: `src/sim/record.ts` (the record shape and `worldDate` only; seams come in Task 3)
- Test: `tests/advance-save.test.ts` (add cases), `tests/record.test.ts`

**Interfaces:**
- Produces in `types.ts`:

```ts
export interface WorldDate { year: number; doy: number }
export type ThresholdId = "berries" | "rut" | "firstFrost" | "lakeFreeze" | "firstSnow" | "dark" | "coldSnap" | "iceOut";
export type LifeEventBody =
  | { kind: "threshold"; id: ThresholdId }
  | { kind: "firstKill"; species: Species }
  | { kind: "built"; structure: StructureId }
  | { kind: "entered"; region: string }
  | { kind: "toolWorn"; tool: ToolId }
  | { kind: "frostbite"; part: "toes" | "fingers" }
  | { kind: "storm" }
  | { kind: "repaired"; structure: StructureId }
  | { kind: "abandoned" };
export type LifeEvent = LifeEventBody & { day: number; date: WorldDate };
export interface Died {
  day: number; date: WorldDate; cause: DeathCause; region: string;
  kmFromCamp: number; packFoodKg: number; campFoodKcal: number; campFirewoodKg: number;
  after: { threshold: ThresholdId; nights: number } | null;
}
export interface LifeRecord {
  name: { first: string; last: string };
  index: number;
  landed: WorldDate;
  gapDays: number;
  events: LifeEvent[];
  worst: { day: number; warmth: number; wolves: boolean } | null;
  forecast: (number | null)[];
  died: Died | null;
}
export interface Landing {
  cell: number; region: number; date: WorldDate; gapDays: number;
  name: { first: string; last: string };
}
```
  `GameState` gains `survivors: LifeRecord[]; year: number; landing: Landing | null; spine: { fired: Partial<Record<ThresholdId, number>>; announced: Partial<Record<ThresholdId, number>> }`. `DeathCause` gains `"gaveUp"`. `RegionState` gains `structureAge: Partial<Record<"leanTo" | "dryingRack", number>>`.
- Produces in `record.ts`: `newRecord(index: number, name, landed: WorldDate, gapDays: number): LifeRecord`, `current(state): LifeRecord`, `worldDate(state, minute = state.minute): WorldDate`.
- Produces in `newgame.ts`: `newPerson(state: GameState, world: World, cell: number, region: number): void` that fills the person fields of an existing state; `newGame` calls it. `START_KCAL`, `ARRIVAL_DRIED_MEAT_KG` stay exported.
- Produces in `save.ts`: `SaveFile.version: 5`; `deserialize` accepts 3, 4 and 5; `saveGame` keeps a dead save.

- [ ] **Step 1: Write the failing tests**

Append to `tests/advance-save.test.ts` inside a new `describe("the world save", ...)`:

```ts
import { current, worldDate } from "../src/sim/record";

describe("the world save", () => {
  it("keeps the file when the survivor is dead", () => {
    const store = new MemStorage();
    const { state } = newGame(8);
    state.dead = { cause: "froze", minute: state.minute };
    saveGame(state, store);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(store)!.state.dead!.cause).toBe("froze");
  });

  it("writes version 5 and reads 4 by wrapping the survivor as the first of the world", () => {
    const { state } = newGame(8);
    expect(JSON.parse(serialize(state)).version).toBe(5);
    const v4 = JSON.parse(serialize(state)) as { version: number; savedAt: number; state: Record<string, unknown> };
    v4.version = 4;
    delete v4.state.survivors;
    delete v4.state.year;
    delete v4.state.landing;
    delete v4.state.spine;
    const file = deserialize(JSON.stringify(v4))!;
    expect(file.state.year).toBe(1);
    expect(file.state.landing).toBeNull();
    expect(file.state.survivors).toHaveLength(1);
    expect(file.state.survivors[0].index).toBe(1);
    expect(file.state.survivors[0].name.first.length).toBeGreaterThan(0);
    expect(file.state.survivors[0].landed).toEqual({ year: 1, doy: file.state.startDoy });
    expect(file.state.spine).toEqual({ fired: {}, announced: {} });
    for (const st of Object.values(file.state.regions)) expect(st.structureAge).toEqual({});
  });
});
```

Create `tests/record.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { current, worldDate } from "../src/sim/record";

describe("the life record", () => {
  it("starts a new game with one survivor, landed on the start day of year 1", () => {
    const { state } = newGame(8);
    expect(state.survivors).toHaveLength(1);
    const rec = current(state);
    expect(rec.index).toBe(1);
    expect(rec.landed).toEqual({ year: 1, doy: 90 });
    expect(rec.gapDays).toBe(0);
    expect(rec.events).toEqual([]);
    expect(rec.died).toBeNull();
    expect(state.year).toBe(1);
  });

  it("gives a world date for any minute of the life, stepping the year past 31 December", () => {
    const { state } = newGame(8, 360);
    expect(worldDate(state, 0)).toEqual({ year: 1, doy: 360 });
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 2, doy: 5 });
    state.year = 3;
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 4, doy: 5 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/record.test.ts tests/advance-save.test.ts`
Expected: FAIL, `record` module not found and `survivors` undefined.

- [ ] **Step 3: Add the types**

In `src/sim/types.ts`, add the interfaces from the Interfaces block above next to `LogEntry`. Add `"gaveUp"` to `DeathCause`. Add to `GameState`:

```ts
  /** Every survivor of this world, the living one last. */
  survivors: LifeRecord[];
  /** World year the current survivor landed in, 1 for the first. */
  year: number;
  /** Set between "Begin again" and the name being confirmed. */
  landing: Landing | null;
  /** The season spine's memory: the year each threshold last fired and was last announced. */
  spine: { fired: Partial<Record<ThresholdId, number>>; announced: Partial<Record<ThresholdId, number>> };
```

Add to `RegionState`: `structureAge: Partial<Record<"leanTo" | "dryingRack", number>>;` with the doc comment "Minutes since the lean-to and the rack were built or mended; each falls after a season." `ToolId` is exported from `items.ts`; import it with `import type`.

- [ ] **Step 4: Write record.ts (shape and dates only)**

```ts
/**
 * The life record: what a survivor did, kept per survivor in the world save
 * and uncapped, unlike the log. The journal, the epitaph and the away
 * report read it; nothing reads the log for history.
 */
import { calendar } from "./calendar";
import type { GameState, LifeRecord, WorldDate } from "./types";

export function newRecord(index: number, name: LifeRecord["name"], landed: WorldDate, gapDays: number): LifeRecord {
  return { name, index, landed, gapDays, events: [], worst: null, forecast: [], died: null };
}

/** The living survivor's record: the last in the list. */
export function current(state: GameState): LifeRecord {
  return state.survivors[state.survivors.length - 1];
}

/** The world date of a minute of this life: the landing year plus however many year ends the day index crossed. */
export function worldDate(state: GameState, minute = state.minute): WorldDate {
  const cal = calendar(minute, state.startDoy);
  return { year: state.year + Math.floor((state.startDoy + cal.dayIndex) / 365), doy: cal.dayOfYear };
}
```

- [ ] **Step 5: Split newPerson out of newGame and seed the first record**

In `src/sim/newgame.ts`, move the `player`, `task`, `log`, `dead`, `stats`, `skills`, `paused`, `route`, `intent`, `ledger` initialisation into:

```ts
/** Fills the person half of a state: the body, its kit, its skills and its empty log. The world half is untouched. */
export function newPerson(state: GameState, world: World, cell: number, region: number): void {
  const pack = emptyInventory();
  addItem(pack, "driedMeat", ARRIVAL_DRIED_MEAT_KG);
  state.player = {
    x: (cell % world.w) + 0.5,
    y: Math.floor(cell / world.w) + 0.5,
    region,
    // ... every field exactly as newGame sets it today ...
  };
  state.task = null;
  state.log = [];
  state.dead = null;
  state.stats = { trees: 0, animals: 0, structures: 0, km: 0 };
  state.skills = newSkills();
  state.paused = {};
  state.route = null;
  state.intent = null;
  state.ledger = [];
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
}
```

`newGame` builds the state with the world fields, `survivors: [newRecord(1, rollName(new Rng(derive(seed, 7)), []), { year: 1, doy: startDoy }, 0)]`, `year: 1`, `landing: null`, `spine: { fired: {}, announced: {} }`, then calls `newPerson(state, world, start.campCell, world.start)`, `enterRegion`, and logs the first line as today. `rollName` does not exist until Task 2: for this task, use a placeholder `{ first: "First", last: "Survivor" }` and leave a `// Task 2 replaces this` comment that Task 2 removes.

- [ ] **Step 6: Version 5 in save.ts**

`SaveFile.version: 5`; `serialize` writes 5; `deserialize` accepts 3, 4 and 5. In `fillDefaults` add:

```ts
  state.year ??= 1;
  state.landing ??= null;
  state.spine ??= { fired: {}, announced: {} };
  // A save from before the world was the thing saved: its survivor becomes the first of the world, recorded from now.
  state.survivors ??= [newRecord(1, { first: "First", last: "Survivor" }, { year: 1, doy: state.startDoy }, 0)];
  for (const st of Object.values(state.regions)) st.structureAge ??= {};
```

(Task 2 swaps the placeholder name for a rolled one.) `saveGame`: remove the `if (state.dead) { removeItem; return }` branch. Add `structureAge: {}` to `newRegionState` in `regionstate.ts`.

- [ ] **Step 7: Run the tests and the whole suite**

Run: `npx vitest run tests/record.test.ts tests/advance-save.test.ts` then `npm test` and `npm run build`.
Expected: all PASS. If a test elsewhere asserted that a dead save is removed, update that test to assert it is kept.

- [ ] **Step 8: Commit**

```bash
git add src/sim/types.ts src/sim/save.ts src/sim/newgame.ts src/sim/record.ts src/sim/regionstate.ts tests/advance-save.test.ts tests/record.test.ts
git commit -m "feat(survidle): the save is the world - version 5 keeps a dead survivor and a list of life records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Names

**Files:**
- Create: `src/sim/names.ts`
- Modify: `src/sim/newgame.ts`, `src/sim/save.ts` (replace the placeholder name)
- Test: `tests/names.test.ts`

**Interfaces:**
- Produces: `rollName(rng: Rng, taken: { first: string; last: string }[]): { first: string; last: string }`, `nameTaken(name, taken): boolean`, `fmtName(name): string` ("Eirik Kalnins"), `FIRST_NAMES: string[]`, `LAST_NAMES: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { FIRST_NAMES, fmtName, LAST_NAMES, nameTaken, rollName } from "../src/sim/names";

describe("names", () => {
  it("draws from pools that mix Scandinavian and Baltic names", () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(FIRST_NAMES).toContain("Eirik");
    expect(FIRST_NAMES).toContain("Janis");
    expect(LAST_NAMES).toContain("Kalnins");
    expect(LAST_NAMES).toContain("Berg");
  });

  it("is deterministic per rng and never offers a taken name", () => {
    const a = rollName(new Rng(5), []);
    const b = rollName(new Rng(5), []);
    expect(a).toEqual(b);
    const c = rollName(new Rng(5), [a]);
    expect(nameTaken(c, [a])).toBe(false);
    expect(fmtName(a)).toBe(`${a.first} ${a.last}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/names.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write names.ts**

```ts
/**
 * Survivor names: first and last names from Scandinavian and Baltic pools,
 * combined freely, so a Norwegian first name may carry a Latvian surname.
 * Plain ASCII spellings, since the UI and the epitaph are typed text.
 */
import type { Rng } from "../rng";

export const FIRST_NAMES = [
  // Norwegian, Swedish, Danish, Finnish
  "Eirik", "Sigrid", "Ingrid", "Bjorn", "Astrid", "Leif", "Solveig", "Torvald", "Ragnhild", "Halvard",
  "Gunnar", "Helga", "Sven", "Kari", "Olav", "Liv", "Arne", "Tove", "Aino", "Eero", "Kaisa", "Mikko",
  "Tuula", "Veikko", "Sanna", "Matti", "Ilkka", "Riikka", "Jorunn", "Sten",
  // Latvian, Lithuanian, Estonian
  "Janis", "Ilze", "Andris", "Liga", "Maris", "Dace", "Juris", "Inese", "Valdis", "Rasa",
  "Jonas", "Egle", "Vytas", "Ruta", "Kazys", "Aldona", "Mart", "Kadri", "Toomas", "Liis", "Priit", "Anu",
];

export const LAST_NAMES = [
  "Berg", "Dahl", "Haugen", "Lund", "Nygard", "Solberg", "Strand", "Vik", "Bakke", "Moen",
  "Lindqvist", "Nyman", "Sjoberg", "Holm", "Ek", "Aalto", "Koskinen", "Niemi", "Salo", "Virtanen",
  "Kalnins", "Berzins", "Ozols", "Liepa", "Krumins", "Balodis", "Zarins", "Vitols", "Eglitis", "Dzenis",
  "Kazlauskas", "Petrauskas", "Jankauskas", "Zukauskas", "Butkus", "Urbonas", "Tamm", "Saar", "Sepp", "Magi", "Kask", "Kukk",
];

export function nameTaken(name: { first: string; last: string }, taken: { first: string; last: string }[]): boolean {
  return taken.some((t) => t.first === name.first && t.last === name.last);
}

/** A name not used in this world yet. The pools are far larger than any lineage, so the loop is short. */
export function rollName(rng: Rng, taken: { first: string; last: string }[]): { first: string; last: string } {
  for (let i = 0; i < 100; i++) {
    const name = { first: FIRST_NAMES[rng.int(FIRST_NAMES.length)], last: LAST_NAMES[rng.int(LAST_NAMES.length)] };
    if (!nameTaken(name, taken)) return name;
  }
  return { first: FIRST_NAMES[rng.int(FIRST_NAMES.length)], last: `${LAST_NAMES[rng.int(LAST_NAMES.length)]} the younger` };
}

export function fmtName(name: { first: string; last: string }): string {
  return `${name.first} ${name.last}`;
}
```

Check `Rng` has `int(n)` (it does: `rng.int(121)` in weather.ts).

- [ ] **Step 4: Replace the placeholders**

In `newgame.ts`: `rollName(new Rng(derive(seed, 7)), [])` (import `Rng` from `../rng` and `derive` is already imported there). In `save.ts` `fillDefaults`: `rollName(new Rng(derive(state.seed, 7)), [])`. Remove the "Task 2 replaces this" comments.

- [ ] **Step 5: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS.

```bash
git add src/sim/names.ts src/sim/newgame.ts src/sim/save.ts tests/names.test.ts
git commit -m "feat(survidle): survivors have names, rolled from Scandinavian and Baltic pools and never repeated in a world

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The record's seams, the died block, and abandon as a death

**Files:**
- Modify: `src/sim/record.ts`, `src/sim/player.ts`, `src/sim/tasks.ts`, `src/sim/regionstate.ts`, `src/sim/hazards.ts`, `src/sim/events.ts`, `src/sim/inventory.ts`, `src/sim/advance.ts`, `src/main.ts`, `src/ui/panels.ts` (only `DEATH_LINES` use)
- Test: `tests/record.test.ts`

**Interfaces:**
- Produces in `record.ts`:
  - `record(state: GameState, ev: LifeEventBody): void` - appends with `day` and `date` filled from `state.minute`.
  - `hasEvent(state, pred: (e: LifeEvent) => boolean): boolean`.
  - `noteNight(state: GameState, warmth: number, wolves: boolean): void` - keeps the running minimum on `current(state).worst` (lower warmth wins; wolves flag sticks to the night it was noted).
  - `fillDied(state: GameState, cause: DeathCause): void` - builds `Died` from state alone.
  - `abandon(state: GameState): void` - `record(state, { kind: "abandoned" })` then `die(state, "gaveUp")`. Lives in `player.ts` beside `die` to avoid an import cycle.
- `die(state, cause)` calls `fillDied` before logging. `DEATH_LINES.gaveUp = "You sat down by the cold fire and did not get up."`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/record.test.ts`:

```ts
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { abandon, DEATH_LINES, die } from "../src/sim/player";
import { enterRegion, regionState } from "../src/sim/regionstate";
import { startTask } from "../src/sim/tasks";
import { fillDied, hasEvent, noteNight, record } from "../src/sim/record";

describe("the record's seams", () => {
  it("stamps day and date on an event", () => {
    const { state } = newGame(8);
    advance(state, world0(state), 3 * 1440);
    record(state, { kind: "storm" });
    const e = current(state).events[0];
    expect(e.kind).toBe("storm");
    expect(e.day).toBe(4);
    expect(e.date).toEqual({ year: 1, doy: 93 });
  });

  it("records a region entered once and a build finished", () => {
    const { state, world } = newGame(8);
    const r = regionAt(world, state.player.region);
    const other = r.neighbours[0].id;
    enterRegion(state, world, other);
    expect(hasEvent(state, (e) => e.kind === "entered" && e.region === regionAt(world, other).name)).toBe(true);
    enterRegion(state, world, other);
    expect(current(state).events.filter((e) => e.kind === "entered").length).toBe(1);
    // A build finished: the fire pit, from stone laid at camp.
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "stone", 6);
    startTask(state, world, calendar(0), "build", "firePit");
    advance(state, world, 60);
    expect(hasEvent(state, (e) => e.kind === "built" && e.structure === "firePit")).toBe(true);
  });

  it("keeps the worst night as one running minimum", () => {
    const { state } = newGame(8);
    noteNight(state, 40, false);
    noteNight(state, 25, true);
    noteNight(state, 30, false);
    expect(current(state).worst).toEqual({ day: 1, warmth: 25, wolves: true });
  });

  it("fills the died block at death with what was in hand", () => {
    const { state, world } = newGame(8);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "firewood", 6);
    addItem(pile(state, st.campCell), "driedMeat", 0.4);
    die(state, "froze", regionAt(world, state.player.region).name);
    const d = current(state).died!;
    expect(d.cause).toBe("froze");
    expect(d.day).toBe(1);
    expect(d.kmFromCamp).toBe(0);
    expect(d.packFoodKg).toBeCloseTo(1, 3);
    expect(d.campFirewoodKg).toBe(6);
    expect(d.campFoodKcal).toBeGreaterThan(0);
    expect(d.region).toBe(regionAt(world, state.player.region).name);
  });

  it("abandoning is a death called gave up, recorded", () => {
    const { state } = newGame(8);
    abandon(state);
    expect(state.dead!.cause).toBe("gaveUp");
    expect(hasEvent(state, (e) => e.kind === "abandoned")).toBe(true);
    expect(state.log[state.log.length - 1].text).toBe(DEATH_LINES.gaveUp);
  });
});

function world0(state: ReturnType<typeof newGame>["state"]) { return newGame(state.seed).world; }
```

(Import `regionAt` from `../src/world/gen`. The first test uses `world0` only to have a world; simpler is to destructure `{ state, world }` and use it; do that.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/record.test.ts`. Expected: FAIL on missing exports.

- [ ] **Step 3: Implement record.ts additions**

```ts
import { CELL_KM } from "../units";
import { WORLD_W } from "../world/terrain";
import { FOODS, type FoodId } from "./items";
import { qty, weight } from "./inventory";
import type { DeathCause, Died, GameState, LifeEvent, LifeEventBody } from "./types";

export function record(state: GameState, ev: LifeEventBody): void {
  const cal = calendar(state.minute, state.startDoy);
  current(state).events.push({ ...ev, day: cal.day, date: worldDate(state) });
}

export function hasEvent(state: GameState, pred: (e: LifeEvent) => boolean): boolean {
  return current(state).events.some(pred);
}

/** The coldest hour of any night so far; wolves stick to the night that set the minimum. */
export function noteNight(state: GameState, warmth: number, wolves: boolean): void {
  const rec = current(state);
  const day = calendar(state.minute, state.startDoy).day;
  if (!rec.worst || warmth < rec.worst.warmth) rec.worst = { day, warmth: Math.round(warmth), wolves };
  else if (wolves && rec.worst.day === day) rec.worst.wolves = true;
}

function packFoodKg(state: GameState): number {
  let kg = 0;
  for (const f of Object.keys(FOODS) as FoodId[]) kg += qty(state.player.pack, f);
  return kg;
}

export function fillDied(state: GameState, cause: DeathCause, regionName: string): void {
  const p = state.player;
  const cal = calendar(state.minute, state.startDoy);
  const st = state.regions[p.region];
  const camp = st ? state.piles[st.campCell] : undefined;
  let campFoodKcal = 0;
  if (camp) for (const f of Object.keys(FOODS) as FoodId[]) campFoodKcal += qty(camp, f) * FOODS[f].kcalPerKg;
  const km = st ? Math.hypot(p.x - ((st.campCell % WORLD_W) + 0.5), p.y - (Math.floor(st.campCell / WORLD_W) + 0.5)) * CELL_KM : 0;
  const rec = current(state);
  const last = [...rec.events].reverse().find((e) => e.kind === "threshold");
  rec.died = {
    day: cal.day, date: worldDate(state), cause, region: regionName,
    kmFromCamp: Math.round(km * 10) / 10, packFoodKg: Math.round(packFoodKg(state) * 100) / 100,
    campFoodKcal: Math.round(campFoodKcal), campFirewoodKg: camp ? Math.round(qty(camp, "firewood")) : 0,
    after: last && last.kind === "threshold" ? { threshold: last.id, nights: cal.day - last.day } : null,
  };
}
```

`record.ts` has no world, so the region name comes in as a parameter: `die(state, cause, regionName = "")` passes it through. Every caller of `die` with a world in hand passes `regionAt(world, state.player.region).name`; there are three (`advance.ts`, `events.ts`, `hazards.ts`). `player.ts` imports nothing of the world, and stays that way.

- [ ] **Step 4: The seams**

- `player.ts`: `DEATH_LINES.gaveUp`; `die(state, cause, regionName = "")` calls `fillDied(state, cause, regionName)` before `log`. Add `export function abandon(state: GameState, regionName = ""): void { record(state, { kind: "abandoned" }); die(state, "gaveUp", regionName); }`.
- `advance.ts`: `die(state, causeFrom(drains), regionAt(world, state.player.region).name)`. Also in `step`, when `ev.precipStopped` fires and `state.weather.storm === null` and a storm was running at the previous step, `record(state, { kind: "storm" })`: implement as `const hadStorm = state.weather.storm !== null;` before `stepWeather`, and after it `if (hadStorm && state.weather.storm === null && !state.dead) record(state, { kind: "storm" })`.
- `events.ts`: the wolves `die(...)` passes the region name; after the wolves block, at night, `noteNight(state, p.warmth, wolvesTonight)` where `wolvesTonight` is true when the attack fired this hour.
- `hazards.ts` `frostbite`: where `p.toes = true` add `record(state, { kind: "frostbite", part: "toes" })`; same for fingers.
- `inventory.ts` `wearTool`: when the tool breaks (`t.durability <= 0`), `record(state, { kind: "toolWorn", tool: id })` before the spare logic. `inventory.ts` importing `record.ts` which imports `inventory.ts`: to avoid the cycle, put the `record` call in `tasks.ts` at each `wearTool(...)` true branch instead (chop, hunt, fish, light) - four sites, each `if (wearTool(...)) { record(state, { kind: "toolWorn", tool: "axe" }); ... }`.
- `tasks.ts` finish: `"hunt"` and `"fish"` success: `if (!hasEvent(state, (e) => e.kind === "firstKill" && e.species === s)) record(state, { kind: "firstKill", species: s });`. `"build"` (not snare): `record(state, { kind: "built", structure: sid })`.
- `regionstate.ts` `enterRegion`: when `before !== VISITED`, `record(state, { kind: "entered", region: r.name })` guarded by `state.minute > 0 || true` - simply always when `before !== VISITED` and `state.survivors?.length` (a state under construction in `newGame` calls `enterRegion` before... no: `newGame` sets `survivors` before `enterRegion`, so no guard needed; but do not record the start region, since the heir's landing region should be recorded: rule is `if (before !== VISITED && state.minute > 0)` matches the log line; use the same condition.
- `main.ts` `"abandon-yes"`: `abandon(state, regionAt(world, state.player.region).name)` instead of `clearSave(); fresh();`. `deathHtml` stays for now (Task 9 replaces it) but must not crash on `gaveUp`: `DEATH_LINES` covers it.

- [ ] **Step 5: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS.

```bash
git add src/sim/record.ts src/sim/player.ts src/sim/tasks.ts src/sim/regionstate.ts src/sim/hazards.ts src/sim/events.ts src/sim/advance.ts src/main.ts tests/record.test.ts
git commit -m "feat(survidle): the life record takes its events at the seams, the died block at death, and abandoning is a death called gave up

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The selector - epitaph, entry, since

**Files:**
- Create: `src/sim/epitaph.ts`
- Test: `tests/epitaph.test.ts`

**Interfaces:**
- Produces: `epitaph(rec: LifeRecord): string`, `entry(rec: LifeRecord): string[]`, `since(rec: LifeRecord, day: number): string`, `fmtWorldDate(d: WorldDate): string` ("24 July, year 2"), `THRESHOLD_NAMES: Record<ThresholdId, string>` ("first frost", ...).
- Consumes: `LifeRecord`, `fmtName`, `DEATH_LINES` is NOT used here; causes get their own past-tense clause table `CAUSE_CLAUSE: Record<DeathCause, string>`: starved "Starved", froze "Died of cold", wolves "Killed by wolves", sickness "Died of fever", thirst "Died of thirst", smoke "Smothered by smoke in sleep", drowned "Went through the ice", gaveUp "Gave up".

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { entry, epitaph, since } from "../src/sim/epitaph";
import { newRecord } from "../src/sim/record";
import { runReference } from "../src/sim/reference";
import type { LifeRecord } from "../src/sim/types";

function rec(): LifeRecord {
  const r = newRecord(1, { first: "Eirik", last: "Kalnins" }, { year: 1, doy: 90 }, 0);
  r.events.push({ kind: "entered", region: "Hareskog", day: 1, date: { year: 1, doy: 90 } });
  r.events.push({ kind: "built", structure: "firePit", day: 2, date: { year: 1, doy: 91 } });
  r.events.push({ kind: "firstKill", species: "hare", day: 5, date: { year: 1, doy: 94 } });
  r.events.push({ kind: "threshold", id: "firstFrost", day: 83, date: { year: 1, doy: 172 } });
  r.worst = { day: 84, warmth: 12, wolves: true };
  r.died = {
    day: 87, date: { year: 1, doy: 176 }, cause: "froze", region: "Hareskog", kmFromCamp: 2.1,
    packFoodKg: 0.4, campFoodKcal: 0, campFirewoodKg: 6, after: { threshold: "firstFrost", nights: 4 },
  };
  return r;
}

describe("the epitaph", () => {
  it("is one line of real quantities", () => {
    expect(epitaph(rec())).toBe(
      "Eirik Kalnins. Day 87. Died of cold on the fourth night after the first frost, 2.1 km from camp, with 400 g of dried meat in the pack and 6 kg of firewood at camp.",
    );
  });

  it("says at camp and on day N when there is nothing else to say", () => {
    const r = rec();
    r.died = { ...r.died!, kmFromCamp: 0.1, after: null, packFoodKg: 0, campFirewoodKg: 0 };
    expect(epitaph(r)).toBe("Eirik Kalnins. Day 87. Died of cold at camp, with nothing in the pack and no firewood at camp.");
  });

  it("writes the entry in date order, at most twelve lines, keeping the epitaph and the cause", () => {
    const lines = entry(rec());
    expect(lines[0]).toBe(epitaph(rec()));
    expect(lines).toContain("Day 5. First mountain hare.");
    expect(lines).toContain("Day 83. First frost.");
    expect(lines).toContain("Day 84. The worst night: warmth 12, wolves at the fire.");
    expect(lines[lines.length - 1]).toBe("Day 87. Died of cold.");
    expect(lines.length).toBeLessThanOrEqual(12);
  });

  it("says what happened since a day, for the away report", () => {
    expect(since(rec(), 80)).toBe("First frost on day 83; the worst night on day 84.");
    expect(since(rec(), 88)).toBe("Nothing worth telling.");
  });

  it("is a living survivor's entry without a tombstone line", () => {
    const r = rec();
    r.died = null;
    expect(entry(r)[0]).toBe("Eirik Kalnins. Landed 1 April, year 1.");
  });

  it("is deterministic for the reference seeds", () => {
    // Inline snapshots fill themselves on the first run; a later change to the sim that moves a death shows here.
    expect(epitaph(runReference(17, 60).record)).toMatchInlineSnapshot();
    expect(epitaph(runReference(19, 60).record)).toMatchInlineSnapshot();
  });
});
```

`runReference` does not return the record yet: add `record: LifeRecord` to `ReferenceReport` (it is `current(state)` at the end). Do that in this task, in `reference.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/epitaph.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write epitaph.ts**

```ts
/**
 * The selector: the same fixed list of notable events writes the tombstone
 * line, the cemetery entry and the away report's "what happened" line, so
 * the check-in loop and the survivor loop tell one story. Pure over a
 * record; templates over real quantities, no adjectives, no generated prose.
 */
import { fmtName } from "./names";
import { SPECIES_DEFS } from "./species";
import { STRUCTURES } from "./items";
import type { DeathCause, LifeEvent, LifeRecord, ThresholdId, WorldDate } from "./types";

export const THRESHOLD_NAMES: Record<ThresholdId, string> = {
  berries: "the berries", rut: "the rut", firstFrost: "the first frost", lakeFreeze: "the lake freeze",
  firstSnow: "the first snow", dark: "the dark", coldSnap: "the cold snap", iceOut: "ice-out",
};

const CAUSE_CLAUSE: Record<DeathCause, string> = {
  starved: "Starved", froze: "Died of cold", wolves: "Killed by wolves", sickness: "Died of fever",
  thirst: "Died of thirst", smoke: "Smothered by smoke in sleep", drowned: "Went through the ice", gaveUp: "Gave up",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function fmtWorldDate(d: WorldDate): string {
  let m = 0;
  let day = d.doy;
  while (day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m++; }
  return `${day + 1} ${MONTHS[m]}, year ${d.year}`;
}

const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
function nth(n: number): string { return ORDINAL[n] ?? `${n}th`; }

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function foodClause(kg: number): string {
  if (kg <= 0) return "nothing in the pack";
  return kg < 1 ? `${Math.round(kg * 1000)} g of dried meat in the pack` : `${Math.round(kg * 10) / 10} kg of food in the pack`;
}

export function epitaph(rec: LifeRecord): string {
  const d = rec.died;
  if (!d) return `${fmtName(rec.name)}. Landed ${fmtWorldDate(rec.landed)}.`;
  const when = d.after ? ` on the ${nth(d.after.nights)} night after ${THRESHOLD_NAMES[d.after.threshold]}` : "";
  const where = d.kmFromCamp < 0.2 ? "at camp" : `${d.kmFromCamp} km from camp`;
  const wood = d.campFirewoodKg > 0 ? `${d.campFirewoodKg} kg of firewood at camp` : "no firewood at camp";
  return `${fmtName(rec.name)}. Day ${d.day}. ${CAUSE_CLAUSE[d.cause]}${when}, ${where}, with ${foodClause(d.packFoodKg)} and ${wood}.`;
}

function eventLine(e: LifeEvent): string | null {
  switch (e.kind) {
    case "threshold": return `Day ${e.day}. ${cap(THRESHOLD_NAMES[e.id].replace(/^the /, ""))}.`;
    case "firstKill": return `Day ${e.day}. First ${SPECIES_DEFS[e.species].name}.`;
    case "built": return `Day ${e.day}. Built the ${STRUCTURES[e.structure].name}.`;
    case "repaired": return `Day ${e.day}. Mended the ${STRUCTURES[e.structure].name}.`;
    case "toolWorn": return `Day ${e.day}. The ${e.tool} wore out.`;
    case "frostbite": return `Day ${e.day}. Lost ${e.part} to frostbite.`;
    case "storm": return `Day ${e.day}. A storm passed.`;
    case "abandoned": return null;
    case "entered": return null;
  }
}

/** The dozen lines: the tombstone, the notable events in date order, the worst night, the cause. */
export function entry(rec: LifeRecord): string[] {
  const head = epitaph(rec);
  const middle: { day: number; text: string }[] = [];
  for (const e of rec.events) {
    const t = eventLine(e);
    if (t) middle.push({ day: e.day, text: t });
  }
  if (rec.worst) middle.push({ day: rec.worst.day, text: `Day ${rec.worst.day}. The worst night: warmth ${rec.worst.warmth}${rec.worst.wolves ? ", wolves at the fire" : ""}.` });
  middle.sort((a, b) => a.day - b.day);
  const tail = rec.died ? [`Day ${rec.died.day}. ${CAUSE_CLAUSE[rec.died.cause]}.`] : [];
  const room = 12 - 1 - tail.length;
  // Oldest lines drop from the middle, never the ends: the first three and the last three of a life stay.
  let kept = middle.map((m) => m.text);
  while (kept.length > room) kept = [...kept.slice(0, 3), ...kept.slice(4)];
  return [head, ...kept, ...tail];
}

/** One sentence of what happened on or after `day`, for the away report. */
export function since(rec: LifeRecord, day: number): string {
  const parts: string[] = [];
  for (const e of rec.events) {
    if (e.day < day) continue;
    const t = eventLine(e);
    if (t) parts.push(t.replace(/^Day (\d+)\. (.*)\.$/, (_m, d, s) => `${s.charAt(0).toLowerCase()}${s.slice(1)} on day ${d}`));
  }
  if (rec.worst && rec.worst.day >= day) parts.push(`the worst night on day ${rec.worst.day}`);
  if (!parts.length) return "Nothing worth telling.";
  return cap(parts.join("; ")) + ".";
}
```

Check `STRUCTURES[e.structure].name` for `"snare"` reads "set a snare"; `built` is never recorded for snares (Task 3), so it does not arise. The `entry` "Landed" head for a living record must format `fmtWorldDate({year:1, doy:90})` as "1 April, year 1": check the test expectation against the month arithmetic (doy 90 is 1 April in this calendar: 31+28+31 = 90).

- [ ] **Step 4: Add `record` to the reference report**

In `reference.ts` `ReferenceReport` add `record: LifeRecord;` and return `record: current(state)` from `runReference`.

- [ ] **Step 5: Run the tests twice (the inline snapshots fill on the first run), then the suite, build, commit**

Run: `npx vitest run tests/epitaph.test.ts` (fills the snapshots), then again (they hold), then `npm test && npm run build`.

```bash
git add src/sim/epitaph.ts src/sim/reference.ts tests/epitaph.test.ts
git commit -m "feat(survidle): the selector writes the epitaph, the cemetery entry and the away line from the life record

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The world with nobody home

**Files:**
- Modify: `src/sim/advance.ts`, `src/sim/camp.ts`, `src/sim/hazards.ts`, `src/sim/events.ts`, `src/sim/animals.ts`
- Test: `tests/nobody.test.ts`

**Interfaces:**
- Produces in `advance.ts`: `export interface Presence { region: number; atCamp: boolean }` and `advance(state, world, dtMinutes, opts: { nobody?: boolean } = {})`. In nobody mode `step` runs only the world half and ignores `state.dead`.
- `stepCamp(state, world, ambient, dt, who: Presence | null)`; `dailyCamp(state, world, cal, rng, who: Presence | null)`; `dailyAnimals(state, world, cal, rng, who: Presence | null)`.
- `hazards.ts` splits: `hourlyHazards(state, world, cal, ambient, felt, rng)` keeps `freezeVessels` and `frostbite` (the person); new `export function hourlyWorld(state, world, cal, ambient, rng, who: Presence | null)` runs `freezeCamps` and `spread`.
- `events.ts` `hourlyEvents` stays the person's (sickness, wolves, `hourlyHazards`, `noteNight`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";

/** A player nobody may touch: any read throws, so a world function that still reaches for the body fails loudly. */
function forbidPlayer(state: ReturnType<typeof newGame>["state"]) {
  state.player = new Proxy(state.player, { get(_t, key) { throw new Error(`nobody mode read player.${String(key)}`); } });
}

describe("nobody home", () => {
  it("runs the world half only and never reads the player", () => {
    const { state, world } = newGame(8);
    kitOut(state, world);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 6;
    st.rack.kg = 3;
    st.snareCatch.count = 2;
    st.structures.snares = 2;
    state.player.autoFeed = true;
    state.dead = { cause: "froze", minute: state.minute };
    forbidPlayer(state);
    advance(state, world, 90 * 1440, { nobody: true });
    expect(state.minute).toBeCloseTo(90 * 1440, 3);
    expect(st.fire.lit).toBe(false);
    expect(st.rack.kg).toBe(0);
    expect(st.snareCatch.count).toBe(0);
  });

  it("does nothing in nobody mode that a dead flag would stop while alive", () => {
    const { state, world } = newGame(8);
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 60);
    expect(state.minute).toBe(0);
    advance(state, world, 60, { nobody: true });
    expect(state.minute).toBe(60);
  });

  it("freezes the water at camp over a winter gap, with the bucket rolling its split", () => {
    const { state, world } = newGame(8, 280);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "barkBucket", 3);
    addItem(pile(state, st.campCell), "water", 30);
    state.dead = { cause: "froze", minute: state.minute };
    forbidPlayer(state);
    advance(state, world, 120 * 1440, { nobody: true });
    expect(qty(pile(state, st.campCell), "water")).toBe(0);
    expect(qty(pile(state, st.campCell), "ice")).toBeGreaterThan(0);
    // The split is a one-in-three roll per bucket on the freezing hour; deterministic per seed, so assert only that the rule ran.
    expect(qty(pile(state, st.campCell), "barkBucket")).toBeLessThanOrEqual(3);
  });
});
```

The third test's freeze runs on the first freezing hour with no fire; `freezeCamps` turns the water to ice then, and rolls each bucket once.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/nobody.test.ts`. Expected: FAIL, the proxy throws from `stepCamp`.

- [ ] **Step 3: Thread Presence through the world half**

`advance.ts`:

```ts
export interface Presence { region: number; atCamp: boolean }

export function advance(state: GameState, world: World, dtMinutes: number, opts: { nobody?: boolean } = {}): void {
  const nobody = opts.nobody ?? false;
  if (state.dead && !nobody) return;
  let left = dtMinutes;
  const rng = new Rng(state.rng);
  while (left > 1e-9 && (nobody || !state.dead)) {
    const dt = Math.min(MAX_STEP, left);
    left -= dt;
    step(state, world, rng, dt, nobody);
  }
  state.rng = rng.s;
}

function step(state: GameState, world: World, rng: Rng, dt: number, nobody: boolean): void {
  state.minute += dt;
  const cal = calendar(state.minute, state.startDoy);
  const hadStorm = state.weather.storm !== null;
  const ev = stepWeather(state.weather, cal, rng, dt, state.minute);
  const ambient = ambientTemperature(cal, state.weather);
  if (!nobody) {
    // weather log lines as today
    if (hadStorm && state.weather.storm === null) record(state, { kind: "storm" });
  }
  const who: Presence | null = nobody ? null : { region: state.player.region, atCamp: atCamp(state, world) };
  let drains: Drains | null = null;
  if (!nobody) {
    stepTask(state, world, cal, rng, dt);
    runOrders(state, world, cal, rng);
    runIntent(state, world, cal, rng);
    if (!state.task && state.player.energy < EXHAUSTED && beginTask(state, world, cal, "sleep")) log(state, "Too tired to stand, you sleep where you are.");
  }
  stepCamp(state, world, ambient, dt, who);
  if (!nobody) {
    drains = stepPlayer(state, world, ambient, dt);
    autoEat(state, world, rng);
    autoDrink(state, world);
    iceUnderFoot(state, world, rng);
  }
  const hour = Math.floor(state.minute / 60);
  if (hour > state.lastHour) {
    state.lastHour = hour;
    hourlyWorld(state, world, cal, ambient, rng, who);
    if (!nobody) hourlyEvents(state, world, cal, ambient, feltTemperature(state, world, ambient), rng);
  }
  if (cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR) {
    state.lastDay = cal.dayIndex;
    dailyAnimals(state, world, cal, rng, who);
    dailyCamp(state, world, cal, rng, who);
  }
  if (!nobody && drains && state.player.health <= 0 && !state.dead) die(state, causeFrom(drains), regionAt(world, state.player.region).name);
}
```

`Drains` is the type `stepPlayer` returns; import or infer it. `atCamp` is in `position.ts`.

`camp.ts` `stepCamp(state, world, ambient, dt, who)`: replace `const p = state.player` uses: `mine = who !== null && id === who.region`; `atCampHere = mine && who!.atCamp`; auto-feed `if (... && atCampHere && state.player.autoFeed)` (safe: only evaluated when `who` is non-null); the pack aging line runs only `if (who)`. In the piles loop, the "at X" wording uses `who?.region`. `dailyCamp(..., who)`: the ice hole log `if (who && id === who.region)`. `animals.ts` `dailyAnimals(..., who)`: `const here = who?.region ?? -1` and every use of `state.player` in it goes through `here` or is skipped when `who` is null (read the function; it uses the player's region for the absence notice only).

`hazards.ts`: move `freezeCamps` and `spread` into `hourlyWorld(state, world, cal, ambient, rng, who)`; their `state.player.region` reads become `who?.region`. `hourlyHazards` keeps `freezeVessels` and `frostbite`.

- [ ] **Step 4: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS. The existing camp and hazards tests call `stepCamp`/`dailyCamp` directly: give them `{ region: state.player.region, atCamp: true }` or the real `atCamp(state, world)` as the last argument.

```bash
git add src/sim/advance.ts src/sim/camp.ts src/sim/hazards.ts src/sim/events.ts src/sim/animals.ts tests/nobody.test.ts tests/camp.test.ts
git commit -m "feat(survidle): the world runs with nobody home - advance's nobody mode steps weather, camps, piles and animals and never the body

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Add any other test file whose call signature changed to the `git add`.)

---

### Task 6: Structure decay and the mend task

**Files:**
- Modify: `src/sim/items.ts`, `src/sim/camp.ts`, `src/sim/tasks.ts`, `src/sim/types.ts` (TaskId), `src/ui/panels.ts` (camp panel line), `src/sim/intent.ts` (GERUND), `src/sim/orders.ts` (COUNT_WORDS)
- Test: `tests/decay.test.ts`

**Interfaces:**
- `items.ts`: `export const STRUCTURE_LIFE_DAYS: Partial<Record<StructureId, number>> = { leanTo: 90, dryingRack: 90 }`, `export const MEND: Record<"leanTo" | "dryingRack", { needs: Need[]; minutes: number }> = { leanTo: { needs: [{ item: "stick", qty: 2 }], minutes: 60 }, dryingRack: { needs: [{ item: "cordage", qty: 1 }], minutes: 60 } }`.
- `camp.ts`: `export function needsMending(st: RegionState, id: "leanTo" | "dryingRack"): boolean` - true past two thirds of life.
- `TaskId` gains `"mend"` with `arg` the structure id; a camp task in the `camp` group, label "Mend the lean-to" / "Mend the drying rack".

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { needsMending } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { hasEvent } from "../src/sim/record";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";

function camp(seed = 8) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  st.structures.firePit = true;
  st.structures.leanTo = true;
  st.structures.dryingRack = true;
  st.structures.cabin = true;
  return { ...g, st };
}

describe("structure decay", () => {
  it("drops the lean-to and the rack after a season and keeps the cabin and the fire pit", () => {
    const { state, world, st } = camp();
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 89 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(true);
    advance(state, world, 2 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(false);
    expect(st.structures.dryingRack).toBe(false);
    expect(st.structures.cabin).toBe(true);
    expect(st.structures.firePit).toBe(true);
    advance(state, world, 300 * 1440, { nobody: true });
    expect(st.structures.cabin).toBe(true);
  });

  it("loses what hung on the rack when it rots", () => {
    const { state, world, st } = camp();
    st.rack.kg = 3;
    state.weather.precip = "heavy";
    st.structureAge.dryingRack = 91 * 1440;
    advance(state, world, 1440, { nobody: true });
    expect(st.structures.dryingRack).toBe(false);
    expect(st.rack.kg).toBe(0);
  });

  it("asks for mending past two thirds, and mending resets the age and is recorded", () => {
    const { state, world, st } = camp();
    st.structureAge.leanTo = 61 * 1440;
    expect(needsMending(st, "leanTo")).toBe(true);
    addItem(pile(state, st.campCell), "stick", 2);
    const o = check(state, world, calendar(0), "mend", "leanTo");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    startTask(state, world, calendar(0), "mend", "leanTo");
    advance(state, world, 120);
    expect(st.structureAge.leanTo).toBeLessThan(2 * 1440);
    expect(needsMending(st, "leanTo")).toBe(false);
    expect(hasEvent(state, (e) => e.kind === "repaired" && e.structure === "leanTo")).toBe(true);
  });

  it("does not offer mending for a structure that stands fresh", () => {
    const { state, world } = camp();
    expect(check(state, world, calendar(0), "mend", "leanTo").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/decay.test.ts`. Expected: FAIL.

- [ ] **Step 3: The daily decay rule**

In `dailyCamp` (`camp.ts`), inside the region loop, after the bough bed block:

```ts
    for (const sid of ["leanTo", "dryingRack"] as const) {
      if (!st.structures[sid]) continue;
      st.structureAge[sid] = (st.structureAge[sid] ?? 0) + 1440;
      if (st.structureAge[sid]! < STRUCTURE_LIFE_DAYS[sid]! * 1440) continue;
      st.structures[sid] = false;
      delete st.structureAge[sid];
      if (sid === "dryingRack") { st.rack.kg = 0; st.rack.dried = 0; }
      log(state, sid === "leanTo" ? `The lean-to at ${r.name} has fallen in.` : `The rack at ${r.name} has rotted through.`, "bad");
    }
```

and

```ts
/** Past two thirds of its life a lean-to needs re-roofing and a rack relashing; the camp panel says so. */
export function needsMending(st: RegionState, id: "leanTo" | "dryingRack"): boolean {
  return st.structures[id] && (st.structureAge[id] ?? 0) >= (STRUCTURE_LIFE_DAYS[id]! * 1440 * 2) / 3;
}
```

In `tasks.ts` `finish` for `"build"`: after `st.structures[sid] = true`, `if (sid === "leanTo" || sid === "dryingRack") st.structureAge[sid] = 0;`.

- [ ] **Step 4: The mend task**

`types.ts`: add `"mend"` to `TaskId` and `TASK_IDS`. `tasks.ts`: add `"mend"` to `WORK_TASKS`; `toolFor` returns null for it. In `checkFresh`:

```ts
    case "mend": {
      const sid = arg as "leanTo" | "dryingRack";
      const def = MEND[sid];
      const name = STRUCTURES[sid].name;
      const o = needCamp(opt({ group: "camp", label: `Mend the ${name}`, detail: `${needsList(def.needs)}; ${sid === "leanTo" ? "re-roof it for another season" : "relash it for another season"}`, duration: def.minutes, repeatable: false }));
      if (!o.ok) return o;
      if (!st.structures[sid]) return { ...o, ok: false, why: `no ${name} here` };
      if (!needsMending(st, sid)) return { ...o, ok: false, why: "stands well enough" };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
```

In `finish`:

```ts
    case "mend": {
      const sid = arg as "leanTo" | "dryingRack";
      consume(invs, MEND[sid].needs);
      st.structureAge[sid] = 0;
      record(state, { kind: "repaired", structure: sid });
      log(state, `The ${STRUCTURES[sid].name} is mended.`, "good");
      return;
    }
```

`availableTasks`: `for (const sid of ["leanTo", "dryingRack"] as const) out.push(check(state, world, cal, "mend", sid));`. The skill it trains: wherever `"build"` maps to `building` for practice minutes (grep `"build"` in `skills.ts`/`tasks.ts` for the skill table) add `"mend"` the same way. `intent.ts` `GERUND`: `mend: (arg) => `mending the ${STRUCTURES[arg as StructureId].name}``. `orders.ts` `COUNT_WORDS`: `mend: ["mend", "mends"]`.

`panels.ts` camp panel (`regionHtml`, the `built` list): `if (st.structures.leanTo) built.push(needsMending(st, "leanTo") ? "lean-to (needs re-roofing)" : "lean-to");` and the same for the rack with "(needs relashing)".

- [ ] **Step 5: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS. `tests/ui.test.ts` "everything in the catalogue has a button" may need `mend` in its expectations; make the mend buttons appear only when `needsMending` is true, and add a case there that sets the age and finds the button.

```bash
git add src/sim/items.ts src/sim/camp.ts src/sim/tasks.ts src/sim/types.ts src/sim/intent.ts src/sim/orders.ts src/ui/panels.ts tests/decay.test.ts tests/ui.test.ts
git commit -m "feat(survidle): a lean-to and a rack last a season and can be mended - structure decay is a live rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The gap, the landing and the dim map

**Files:**
- Modify: `src/sim/calendar.ts` (`COAST_OPEN_FROM/TO`), `src/sim/regionstate.ts` (`DIM`), `src/ui/map.ts`
- Create: `src/sim/landing.ts`
- Test: `tests/landing.test.ts`

**Interfaces:**
- `calendar.ts`: `export const COAST_OPEN_FROM = 124; export const COAST_OPEN_TO = 306;` with the derivation in the comment, and `export function coastOpen(doy: number): boolean`.
- `landing.ts`:
  - `landingDate(death: WorldDate): { date: WorldDate; gapDays: number }` - rule 4.1.
  - `landingCell(world: World, oldCamp: number, seed: number, index: number): number` - shore cell 3 to 20 km from the old camp, else nearest shore.
  - `layDownPack(state: GameState, world: World): void` - every pack item and stack into the pile at the death cell; tools into the pile as items; the pack emptied.
  - `demoteFog(state: GameState): void` - every discovered region to `DIM`.
  - `beginAgain(state: GameState, world: World): void` - the whole of 4.2 plus `state.landing` set with a rolled name; the state is then in the landing phase.
  - `land(state: GameState, world: World, name?: { first: string; last: string }): void` - confirms: pushes the record, calls `newPerson`, `enterRegion`, logs the first line, clears `landing`.
  - `bearing(world: World, from: number, to: number): string` - one of the eight winds, "north-east".
- `regionstate.ts`: `export const DIM = 3;` `discovery` returns `0 | 1 | 2 | 3`; `enterRegion` from DIM logs `Known ground: ${r.name}, from the journal.`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { COAST_OPEN_FROM, COAST_OPEN_TO, coastOpen } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { beginAgain, land, landingCell, landingDate } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { DIM, discovery, regionState } from "../src/sim/regionstate";
import { seasonalMean } from "../src/sim/weather";
import { CELL_KM } from "../src/units";
import { cellAt, neighbours, regionAt } from "../src/world/gen";

describe("the gap", () => {
  it("opens the coast a month after the mean crosses zero in spring and closes when it crosses in autumn", () => {
    const spring = [...Array(365).keys()].find((d) => seasonalMean(d) >= 0)!;
    const autumn = [...Array(365).keys()].find((d) => d > 200 && seasonalMean(d) < 0)!;
    expect(COAST_OPEN_FROM).toBe(spring + 30);
    expect(COAST_OPEN_TO).toBe(autumn);
    expect(coastOpen(COAST_OPEN_FROM)).toBe(true);
    expect(coastOpen(COAST_OPEN_TO)).toBe(false);
  });

  it("lands a season after a spring death, and the next May after an autumn one", () => {
    expect(landingDate({ year: 1, doy: 114 })).toEqual({ date: { year: 1, doy: 204 }, gapDays: 90 });
    expect(landingDate({ year: 1, doy: 243 })).toEqual({ date: { year: 2, doy: 124 }, gapDays: 246 });
    expect(landingDate({ year: 1, doy: 292 })).toEqual({ date: { year: 2, doy: 124 }, gapDays: 197 });
  });
});

describe("the landing", () => {
  it("picks a shore cell 3 to 20 km from the old camp, the same one every time", () => {
    for (const seed of [17, 19, 42, 79]) {
      const { state, world } = newGame(seed);
      const camp = regionState(state, world, state.player.region).campCell;
      const a = landingCell(world, camp, seed, 2);
      expect(landingCell(world, camp, seed, 2)).toBe(a);
      const c = cellAt(world, a);
      expect(c.terrain).not.toBe("water");
      expect(neighbours(world, a).some((n) => cellAt(world, n).terrain === "water")).toBe(true);
      const cc = cellAt(world, camp);
      const km = Math.hypot(c.x - cc.x, c.y - cc.y) * CELL_KM;
      expect(km).toBeGreaterThanOrEqual(3);
      expect(km).toBeLessThanOrEqual(20);
    }
  });

  it("begins again: the pack lies where the body fell, the world has run the gap, the fog is dim, the clock is the landing's", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    addItem(pile(state, st.campCell), "firewood", 10);
    advance(state, world, 20 * 1440);
    const deathCell = Math.floor(state.player.y) * world.w + Math.floor(state.player.x);
    die(state, "froze", regionAt(world, state.player.region).name);
    const packMeat = qty(state.player.pack, "driedMeat");
    beginAgain(state, world);
    expect(state.landing).not.toBeNull();
    expect(state.landing!.gapDays).toBe(90);
    expect(state.landing!.date).toEqual({ year: 1, doy: 200 });
    expect(state.minute).toBe(0);
    expect(state.startDoy).toBe(200);
    expect(state.year).toBe(1);
    expect(st.structures.leanTo).toBe(false);
    expect(st.structures.firePit).toBe(true);
    expect(qty(pile(state, st.campCell), "firewood")).toBe(10);
    expect(packMeat === 0 || qty(pile(state, deathCell), "driedMeat") === 0).toBe(true);
    for (const id of Object.keys(state.discovered)) expect(discovery(state, Number(id))).toBe(DIM);
    expect(state.survivors).toHaveLength(1);
    expect(state.landing!.name.first.length).toBeGreaterThan(0);
  });

  it("lands: a second survivor with a fresh body, the first log line pointing at the old camp", () => {
    const { state, world } = newGame(17);
    advance(state, world, 5 * 1440);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.landing).toBeNull();
    expect(state.dead).toBeNull();
    expect(state.survivors).toHaveLength(2);
    expect(current(state).name).toEqual({ first: "Ilze", last: "Berg" });
    expect(current(state).index).toBe(2);
    expect(current(state).gapDays).toBe(90);
    expect(state.player.health).toBe(100);
    expect(state.log[0].text).toMatch(/^\d+ July, year 1\. Ninety days after .* died\. You land at .* The old camp at .* lies \d+ km [a-z-]+\.$/);
  });
});
```

The dried meat check: the arrival meat is in the pack at death only if uneaten; either it is in the pile or it spoiled over 90 days (dried meat is not a perishable stack, so it stays): tighten to `expect(qty(pile(state, deathCell), "driedMeat")).toBeCloseTo(packMeat, 3)` once the implementer confirms dried meat is a plain kg item (it is: `ITEM_NAMES.driedMeat`, not in `PERISHABLES`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/landing.test.ts`. Expected: FAIL.

- [ ] **Step 3: calendar.ts**

```ts
/**
 * The open coast, the days a boat can land: a month after the air's mean
 * crosses 0 C in spring, since the sea lags the air, until the day it
 * crosses back in autumn, since no boat runs into freeze-up. With the
 * mean as weather.ts has it: 4 May to 2 November.
 */
export const COAST_OPEN_FROM = 124;
export const COAST_OPEN_TO = 306;
export function coastOpen(doy: number): boolean { return doy >= COAST_OPEN_FROM && doy < COAST_OPEN_TO; }
```

- [ ] **Step 4: landing.ts**

```ts
/**
 * Between two survivors: the gap, the world run with nobody home, the
 * heir's shore and the name screen. The first survivor keeps the start
 * search; every heir lands near the last camp.
 */
import { derive, Rng } from "../rng";
import { CELL_KM } from "../units";
import { cellAt, neighbours, regionOf, type World } from "../world/cells";
import { passable } from "../world/route";
import { regionAt } from "../world/gen";
import { advance } from "./advance";
import { calendar, coastOpen, fmtDate, START_DOY } from "./calendar";
import { addItem, pile, qty } from "./inventory";
import { ITEM_KG, type ItemId } from "./items";
import { log } from "./log";
import { fmtName, rollName } from "./names";
import { newPerson } from "./newgame";
import { current, newRecord, worldDate } from "./record";
import { DIM, enterRegion, regionState } from "./regionstate";
import { fmtWorldDate } from "./epitaph";
import type { GameState, WorldDate } from "./types";

export const GAP_MIN_DAYS = 90;
export const LANDING_MIN_KM = 3;
export const LANDING_MAX_KM = 20;

export function landingDate(death: WorldDate): { date: WorldDate; gapDays: number } {
  let { year, doy } = death;
  let gapDays = 0;
  const stepDay = () => { doy += 1; gapDays += 1; if (doy >= 365) { doy = 0; year += 1; } };
  for (let i = 0; i < GAP_MIN_DAYS; i++) stepDay();
  while (!coastOpen(doy)) stepDay();
  return { date: { year, doy }, gapDays };
}

function isShore(world: World, idx: number): boolean {
  const c = cellAt(world, idx);
  return passable(c.terrain) && neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
}

export function landingCell(world: World, oldCamp: number, seed: number, index: number): number {
  const cc = cellAt(world, oldCamp);
  const r = Math.ceil(LANDING_MAX_KM / CELL_KM);
  const band: number[] = [];
  let nearest = -1;
  let nearestD = Number.POSITIVE_INFINITY;
  for (let y = Math.max(0, cc.y - r); y <= Math.min(world.h - 1, cc.y + r); y++) {
    for (let x = Math.max(0, cc.x - r); x <= Math.min(world.w - 1, cc.x + r); x++) {
      const idx = y * world.w + x;
      if (!isShore(world, idx)) continue;
      const km = Math.hypot(x - cc.x, y - cc.y) * CELL_KM;
      if (km >= LANDING_MIN_KM && km <= LANDING_MAX_KM) band.push(idx);
      if (km < nearestD && idx !== oldCamp) { nearestD = km; nearest = idx; }
    }
  }
  if (band.length) return band[new Rng(derive(seed, 1000 + index)).int(band.length)];
  return nearest >= 0 ? nearest : oldCamp;
}

/** The pack goes down where the body fell: every count, every kilo, every stack, and the tools as items. */
export function layDownPack(state: GameState, world: World): void {
  const p = state.player;
  const cell = Math.floor(p.y) * world.w + Math.floor(p.x);
  const to = pile(state, cell);
  for (const k of Object.keys(p.pack.items) as ItemId[]) {
    const n = p.pack.items[k] ?? 0;
    if (n > 0) addItem(to, k, n);
    delete p.pack.items[k];
  }
  for (const [k, stacks] of Object.entries(p.pack.stacks)) {
    for (const s of stacks ?? []) { to.stacks[k as keyof typeof to.stacks] ??= []; to.stacks[k as keyof typeof to.stacks]!.push({ ...s }); }
    delete p.pack.stacks[k as keyof typeof p.pack.stacks];
  }
  for (const t of p.tools) addItem(to, t.id, 1);
  p.tools = [];
}

export function demoteFog(state: GameState): void {
  for (const id of Object.keys(state.discovered)) state.discovered[Number(id)] = DIM;
}

const WINDS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
export function bearing(world: World, from: number, to: number): string {
  const a = cellAt(world, from);
  const b = cellAt(world, to);
  // Screen y grows downward, so south is +y.
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return WINDS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Runs the gap and sets the landing phase. The state must be dead. */
export function beginAgain(state: GameState, world: World): void {
  if (!state.dead || state.landing) return;
  const death = worldDate(state, state.dead.minute);
  const { date, gapDays } = landingDate(death);
  const oldCamp = regionState(state, world, state.player.region).campCell;
  layDownPack(state, world);
  // To 08:00 of the landing day: minute 0 of a day index is 08:00 in this calendar.
  const deathIndex = calendar(state.dead.minute, state.startDoy).dayIndex;
  const target = (deathIndex + gapDays) * 1440;
  advance(state, world, target - state.minute, { nobody: true });
  // Rebase: the heir's life starts at minute 0 on the landing day.
  const landedYear = worldDate(state).year;
  state.year = landedYear;
  state.startDoy = date.doy;
  state.minute = 0;
  state.lastHour = 0;
  state.lastDay = 0;
  state.weather.rolledDay = 0;
  state.weather.storm = null;
  for (const st of Object.values(state.regions)) st.iceHole = null;
  demoteFog(state);
  const cell = landingCell(world, oldCamp, state.seed, state.survivors.length + 1);
  const name = rollName(new Rng(derive(state.seed, 500 + state.survivors.length)), state.survivors.map((s) => s.name));
  state.landing = { cell, region: regionOf(world, cell % world.w, Math.floor(cell / world.w)), date, gapDays, name };
}

export function rerollName(state: GameState): void {
  if (!state.landing) return;
  const rng = new Rng(state.rng);
  state.landing.name = rollName(rng, [...state.survivors.map((s) => s.name), state.landing.name]);
  state.rng = rng.s;
}

const NUMBER_WORDS: Record<number, string> = { 90: "Ninety" };
function daysInWords(n: number): string { return NUMBER_WORDS[n] ?? String(n); }

/** Confirms the name and starts the heir's run. */
export function land(state: GameState, world: World, name = state.landing?.name): void {
  const l = state.landing;
  if (!l || !name) return;
  const last = current(state);
  const oldCamp = regionState(state, world, state.player.region).campCell;
  state.survivors.push(newRecord(state.survivors.length + 1, name, l.date, l.gapDays));
  newPerson(state, world, l.cell, l.region);
  state.landing = null;
  enterRegion(state, world, l.region);
  const cc = cellAt(world, oldCamp);
  const lc = cellAt(world, l.cell);
  const km = Math.round(Math.hypot(cc.x - lc.x, cc.y - lc.y) * CELL_KM);
  const oldName = regionAt(world, cellAt(world, oldCamp).region).name;
  state.log = [];
  log(state, `${fmtWorldDate(l.date)}. ${daysInWords(l.gapDays)} days after ${fmtName(last.name)} died. You land at ${regionAt(world, l.region).name} with an axe, wool on your back and a kilo of dried meat. The old camp at ${oldName} lies ${km} km ${bearing(world, l.cell, oldCamp)}.`);
}
```

`daysInWords`: spell out with a small table for 90 and otherwise the numeral; the test's regex accepts "Ninety" only for the 90 case it builds. `newPerson` and `enterRegion` both write log lines: `newPerson` must not log (the first line is the landing's or `newGame`'s); `enterRegion` at `state.minute === 0` does not log. `regionOf` in `world/cells.ts` takes `(world, x, y)`. `discovered`'s type is `Record<number, 1 | 2>`: widen it to `1 | 2 | 3` in `types.ts` and drop the cast.

- [ ] **Step 5: regionstate.ts and map.ts**

`regionstate.ts`: `export const DIM = 3;` `discovery(...)`: `0 | 1 | 2 | 3`. `enterRegion`: the log line becomes `if (before !== VISITED && state.minute > 0) log(state, before === DIM ? `Known ground: ${r.name}, from the journal.` : `New ground: ${r.name}.`, "good");` and the record call stays for `before !== VISITED`.

`map.ts`: in the cell loop, `if (seen === SEEN || seen === DIM) cls.push("dim");` and the title: `seen === VISITED ? name : seen === DIM ? (world.regions.get(reg)?.name ?? "known once") : "seen from a distance"`. The pile glyph and light sources: `pileGlyphs` and `visitedCamps` filter on `VISITED`, so a dim region shows no piles and no fire, which is what the spec wants. Check `seenAt` is built from `discovery` so `3` reaches the loop.

- [ ] **Step 6: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS.

```bash
git add src/sim/calendar.ts src/sim/landing.ts src/sim/regionstate.ts src/sim/types.ts src/ui/map.ts tests/landing.test.ts
git commit -m "feat(survidle): begin again - the gap runs with nobody home, the heir lands on a shore near the old camp, and the map goes dim

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The season spine and the forecast field

**Files:**
- Create: `src/sim/spine.ts`
- Modify: `src/sim/advance.ts` (daily tick), `src/sim/tasks.ts` (export `BERRY_FROM_DOY`)
- Test: `tests/spine.test.ts`

**Interfaces:**
- `spine.ts`:
  - `export const THRESHOLDS: ThresholdId[]` in year order: berries, rut, firstFrost, firstSnow, lakeFreeze, dark, coldSnap, iceOut.
  - `export const ASKS_FOR: Record<ThresholdId, string>`.
  - `export function expectedDoy(id: ThresholdId): number`.
  - `export function stepSpine(state: GameState, cal: Calendar, ev: { coldSnap: boolean }, who: Presence | null): void` - called once a day from the daily tick; also takes the day's cold snap flag, which `advance` collects from `stepWeather` between daily ticks (`state.spine` gains no field for it: keep a `coldSnapToday` boolean on the `step` closure by storing it on `state.weather`? No: add `snapPending: boolean` nowhere; instead detect the cold snap in the spine by the weather itself: `cal.season === "winter" && state.weather.offset < -8`, the same test `stepWeather` uses).
  - `export function nextThreshold(state: GameState, cal: Calendar): { id: ThresholdId; inDays: number } `.
- `tasks.ts`: `export const BERRY_FROM_DOY = 195; export const BERRY_TO_DOY = 288;` and `berrySeason` uses them.
- `advance.ts` daily tick, alive or not: `stepSpine(state, cal, who)`; alive only: `current(state).forecast.push(null)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { current } from "../src/sim/record";
import { expectedDoy, nextThreshold, THRESHOLDS } from "../src/sim/spine";

describe("the season spine", () => {
  it("expects the thresholds in year order from the curve", () => {
    expect(expectedDoy("berries")).toBe(195);
    expect(expectedDoy("rut")).toBe(263);
    const order = ["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark"] as const;
    for (let i = 1; i < order.length; i++) expect(expectedDoy(order[i])).toBeGreaterThan(expectedDoy(order[i - 1]));
    expect(expectedDoy("coldSnap")).toBeLessThan(60);
    expect(expectedDoy("iceOut")).toBeGreaterThan(expectedDoy("coldSnap"));
    expect(expectedDoy("iceOut")).toBeLessThan(150);
  });

  it("fires each threshold once, in order, over a year with nobody home", () => {
    const { state, world } = newGame(17);
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 430 * 1440, { nobody: true });
    const fired = THRESHOLDS.filter((id) => state.spine.fired[id] !== undefined);
    expect(fired).toEqual(["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark", "coldSnap", "iceOut"]);
    expect(state.spine.fired.coldSnap).toBe(2);
    expect(state.spine.fired.berries).toBe(1);
  });

  it("announces a week ahead and records the arrival for a living survivor", () => {
    const { state, world } = newGame(17, 185);
    advance(state, world, 6 * 1440);
    expect(state.log.some((e) => e.text.startsWith("The berries are near."))).toBe(true);
    expect(current(state).events.some((e) => e.kind === "threshold")).toBe(false);
    advance(state, world, 6 * 1440);
    expect(current(state).events.some((e) => e.kind === "threshold" && e.id === "berries")).toBe(true);
    expect(state.log.some((e) => e.text.startsWith("The berries. Day "))).toBe(true);
  });

  it("names the next threshold and its distance", () => {
    const { state } = newGame(17, 100);
    const n = nextThreshold(state, calendar(0, 100));
    expect(n.id).toBe("berries");
    expect(n.inDays).toBe(95);
  });

  it("pushes one forecast slot per day of a life", () => {
    const { state, world } = newGame(17);
    advance(state, world, 3 * 1440);
    expect(current(state).forecast).toEqual([null, null, null]);
  });
});
```

The living test starts 4 July (doy 185) with autoEat on; six days is safe. If the runner dies of thirst before day 12 on seed 17 from that date, give the player water: `state.player.water = 50` is not a field cap; simpler is `state.player.autoDrink = true` with a bucket: use `kitOut(state, world)` from `reference.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/spine.test.ts`. Expected: FAIL.

- [ ] **Step 3: spine.ts**

```ts
/**
 * The season spine: eight thresholds a year the journal is written
 * against and the goals list will key to. Each has a detector on the
 * world, an expected day from the curve, a line a week ahead and a line
 * when it arrives. Runs daily, alive or not; with nobody home it only
 * keeps the memory current, so the heir's year starts right.
 */
import { type Calendar, daylight } from "./calendar";
import { log } from "./log";
import { record } from "./record";
import { MIDSUMMER_DOY } from "./tables";
import { BERRY_FROM_DOY } from "./tasks";
import type { GameState, ThresholdId } from "./types";
import { ICE_SHORE_CM } from "./water";
import { seasonalMean } from "./weather";
import type { Presence } from "./advance";

export const THRESHOLDS: ThresholdId[] = ["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark", "coldSnap", "iceOut"];
export const RUT_DOY = 263;
export const DARK_HOURS = 6;
const AHEAD_DAYS = 7;

export const NAMES: Record<ThresholdId, string> = {
  berries: "The berries", rut: "The rut", firstFrost: "First frost", firstSnow: "First snow",
  lakeFreeze: "The lake freezes", dark: "The dark", coldSnap: "The cold snap", iceOut: "Ice-out",
};

export const ASKS_FOR: Record<ThresholdId, string> = {
  berries: "Pick while they last; dry what you cannot eat.",
  rut: "Elk are on the move and dangerous; the bow and the spear are worth the most now.",
  firstFrost: "The berries stop; be under a roof with dry wood.",
  firstSnow: "Tracks show; wood gets wet; the walk costs more.",
  lakeFreeze: "Open water closes; a hole cut by axe is the water now.",
  dark: "Short days; work by the fire, and wood for the long nights.",
  coldSnap: "The coldest nights; a fire through every one, and stay in.",
  iceOut: "Open water again; the boat season begins.",
};

function firstDoy(from: number, pred: (doy: number) => boolean): number {
  for (let i = 0; i < 365; i++) { const d = (from + i) % 365; if (pred(d)) return d; }
  return from;
}

/** Where the curve puts each threshold in an ordinary year; the detectors say when it really comes. */
export function expectedDoy(id: ThresholdId): number {
  switch (id) {
    case "berries": return BERRY_FROM_DOY;
    case "rut": return RUT_DOY;
    // A clear night sits 4 C under the mean and a cold day another 4 under that.
    case "firstFrost": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 8);
    case "firstSnow": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 4);
    // Ice needs the mean itself under zero, and a few days of it for the shore to bear.
    case "lakeFreeze": return firstDoy(MIDSUMMER_DOY, (d) => seasonalMean(d) < 0) + 3;
    case "dark": return firstDoy(MIDSUMMER_DOY, (d) => daylight(d) < DARK_HOURS);
    case "coldSnap": return 15;
    // The mean back above zero, then the winter's ice melting at twice the mean a day.
    case "iceOut": return firstDoy(0, (d) => seasonalMean(d) >= 0) + 25;
  }
}

function detect(id: ThresholdId, state: GameState, cal: Calendar): boolean {
  const w = state.weather;
  const doy = cal.dayOfYear;
  const afterMidsummer = doy >= MIDSUMMER_DOY;
  switch (id) {
    case "berries": return doy >= BERRY_FROM_DOY && doy < MIDSUMMER_DOY + 120;
    case "rut": return doy >= RUT_DOY && doy < RUT_DOY + 60;
    case "firstFrost": return afterMidsummer && seasonalMean(doy) + w.offset - 4 < 0;
    case "firstSnow": return afterMidsummer && w.snowCm > 0;
    case "lakeFreeze": return afterMidsummer && w.iceCm >= ICE_SHORE_CM;
    case "dark": return daylight(doy) < DARK_HOURS;
    case "coldSnap": return cal.season === "winter" && w.offset < -8;
    case "iceOut": return state.spine.fired.coldSnap !== undefined && !afterMidsummer && w.iceCm <= 0 && doy > 30;
  }
}

/**
 * The year a threshold is counted against: the calendar year for most, and
 * for the cold snap and ice-out the year of the January, so a snap in
 * December and one in January are the same winter and fire once.
 */
function yearOf(state: GameState, cal: Calendar, id: ThresholdId): number {
  const y = state.year + Math.floor((state.startDoy + cal.dayIndex) / 365);
  const winterKeyed = id === "coldSnap" || id === "iceOut";
  return winterKeyed && cal.dayOfYear >= MIDSUMMER_DOY ? y + 1 : y;
}

export function stepSpine(state: GameState, cal: Calendar, who: Presence | null): void {
  for (const id of THRESHOLDS) {
    const year = yearOf(state, cal, id);
    if (state.spine.fired[id] === year) continue;
    if (detect(id, state, cal)) {
      state.spine.fired[id] = year;
      if (who) {
        log(state, `${NAMES[id]}. Day ${cal.day}.`, "good");
        record(state, { kind: "threshold", id });
      }
      continue;
    }
    const exp = expectedDoy(id);
    const inDays = ((exp - cal.dayOfYear) % 365 + 365) % 365;
    if (who && inDays > 0 && inDays <= AHEAD_DAYS && state.spine.announced[id] !== year) {
      state.spine.announced[id] = year;
      log(state, `${NAMES[id]} ${NAMES[id].startsWith("The ") ? "are" : "is"} near. ${ASKS_FOR[id]}`);
    }
  }
}

/** The next threshold not yet fired this year, by expected date, and how far off it is; negative when overdue. */
export function nextThreshold(state: GameState, cal: Calendar): { id: ThresholdId; inDays: number } {
  let best: { id: ThresholdId; inDays: number } | null = null;
  for (const id of THRESHOLDS) {
    if (state.spine.fired[id] === yearOf(state, cal, id)) continue;
    // No ice goes out before a winter has made it.
    if (id === "iceOut" && state.spine.fired.coldSnap === undefined) continue;
    const inDays = ((expectedDoy(id) - cal.dayOfYear) % 365 + 365) % 365;
    if (!best || inDays < best.inDays) best = { id, inDays };
  }
  return best ?? { id: "berries", inDays: ((expectedDoy("berries") - cal.dayOfYear) % 365 + 365) % 365 };
}
```

The "are near" grammar: "The berries are near.", "The rut is near." - handle by a per-threshold verb: `berries` plural, the rest singular. Simplest: a `PLURAL: Set<ThresholdId> = new Set(["berries"])`. The test expects "The berries are near." exactly.

The `coldSnap` fired-year expectation in the test (`2`): a run from 1 April year 1 sees its first winter's snap in December of year 1 or January of year 2, and `yearOf` keys both to year 2, the year of the January. The `iceOut` detector needs `fired.coldSnap` set, then spring ice gone, and keys to the same winter, so both fire once. 430 days from 1 April reaches mid-May of year 2, past the ice-out the curve expects around day 120. Good. The `berries` window ends at `MIDSUMMER_DOY + 120` (day 302) so a landing in August still fires it; the heir landing after the berries began gets the event on landing day, which is right: they are in season.

- [ ] **Step 4: advance.ts daily tick and tasks.ts constants**

In `step`'s daily block, after `dailyCamp`: `stepSpine(state, cal, who); if (!nobody) current(state).forecast.push(null);`. In `tasks.ts`: `export const BERRY_FROM_DOY = 195; export const BERRY_TO_DOY = 288;` used by `berrySeason`. Import cycle check: `spine.ts` imports `tasks.ts` for one constant; move `BERRY_FROM_DOY`/`BERRY_TO_DOY` into `tables.ts` instead if `tasks.ts` importing back would cycle (`tasks.ts` does not import `spine.ts`, so either is fine; prefer `tables.ts` beside `MIDSUMMER_DOY`).

- [ ] **Step 5: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS.

```bash
git add src/sim/spine.ts src/sim/advance.ts src/sim/tasks.ts src/sim/tables.ts tests/spine.test.ts
git commit -m "feat(survidle): the season spine - eight thresholds a year, announced a week ahead, named on arrival, recorded

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The tombstone, the landing screen, the cemetery, the journal, the away line

**Files:**
- Modify: `src/ui/panels.ts`, `src/ui/render.ts`, `src/main.ts`, `index.html`, `src/style.css`
- Test: `tests/survivor-ui.test.ts`

**Interfaces:**
- `panels.ts` exports: `tombstoneHtml(state, world): string` (replaces `deathHtml`; keep `deathHtml` as an alias export for one release to keep `ui.test.ts` compiling, or update that test), `landingHtml(state, world): string`, `cemeteryHtml(state, ui): string`, `journalHtml(state, cal): string`; `awayHtml(away, realSeconds, capped, sinceLine: string)`.
- `render.ts` `UiState` gains `cemetery: boolean`, `cemeteryOpen: number | null` (survivor index whose entry is open), `confirmLeave: boolean`, `awayFromDay: number`.
- `main.ts` actions: `begin-again`, `reroll-name`, `land`, `cemetery`, `cemetery-open` (data-index), `cemetery-close`, `leave-world`, `leave-world-no`, `leave-world-yes`. A name `<input data-name>` commits on `input` to `state.landing.name` by splitting on the first space (`first` is everything before it, `last` everything after; a single word is `first` with the rolled `last` kept).
- Overlay precedence in `render`: `ui.cemetery` first, then `ui.away`, then `state.landing`, then `state.dead`. `catchUp` in `boot` and `frame` records `ui.awayFromDay = calendar(state.minute, state.startDoy).day` before advancing.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { epitaph } from "../src/sim/epitaph";
import { beginAgain, land } from "../src/sim/landing";
import { fmtName } from "../src/sim/names";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { cemeteryHtml, journalHtml, landingHtml, tombstoneHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";

function dead() {
  const g = newGame(17);
  advance(g.state, g.world, 3 * 1440);
  die(g.state, "froze", regionAt(g.world, g.state.player.region).name);
  return g;
}

describe("the tombstone", () => {
  it("shows the name, the epitaph, the entry, the next boat and Begin again, and no line about the save", () => {
    const { state, world } = dead();
    const html = tombstoneHtml(state, world);
    expect(html).toContain(fmtName(current(state).name));
    expect(html).toContain(epitaph(current(state)));
    expect(html).toMatch(/The next boat lands in July, year 1\./);
    expect(html).toContain('data-act="begin-again"');
    expect(html).toContain('data-act="cemetery"');
    expect(html).not.toContain("The save is gone");
  });
});

describe("the landing screen", () => {
  it("shows the date, the gap, the prefilled name, a reroll and Land", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    const html = landingHtml(state, world);
    expect(html).toContain("year 1");
    expect(html).toContain("Ninety days after");
    expect(html).toContain(`value="${fmtName(state.landing!.name)}"`);
    expect(html).toContain('data-act="reroll-name"');
    expect(html).toContain('data-act="land"');
  });
});

describe("the cemetery and the journal", () => {
  it("lists survivors newest first under their epitaphs, with leave this world behind a confirm", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    advance(state, world, 1440);
    die(state, "starved", regionAt(world, state.player.region).name);
    const ui = { ...newUiState(), cemetery: true };
    const html = cemeteryHtml(state, ui);
    const first = html.indexOf("Ilze Berg");
    const second = html.indexOf(fmtName(state.survivors[0].name));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('data-act="leave-world"');
    expect(html).not.toContain('data-act="leave-world-yes"');
    expect(cemeteryHtml(state, { ...ui, confirmLeave: true })).toContain('data-act="leave-world-yes"');
    expect(cemeteryHtml(state, { ...ui, cemeteryOpen: 1 })).toContain(epitaph(state.survivors[0]));
  });

  it("the journal opens with the season panel and the current life, then the ancestors", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    land(state, world);
    const html = journalHtml(state, calendar(state.minute, state.startDoy));
    expect(html).toContain("Next:");
    expect(html).toContain(fmtName(current(state).name));
    expect(html).toContain(fmtName(state.survivors[0].name));
    expect(html).toContain('data-act="cemetery"');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/survivor-ui.test.ts`. Expected: FAIL.

- [ ] **Step 3: panels.ts**

```ts
export function tombstoneHtml(state: GameState, world: World): string {
  const rec = current(state);
  const next = landingDate(worldDate(state, state.dead!.minute)).date;
  const lines = entry(rec);
  return `<div class="box">
<h1>${esc(fmtName(rec.name))}</h1>
<p>${esc(epitaph(rec))}</p>
<div class="entries">${lines.slice(1).map((l) => `<div class="e">${esc(l)}</div>`).join("")}</div>
<p>The next boat lands in ${esc(monthOf(next))}, year ${next.year}.</p>
<button class="act" data-act="begin-again">Begin again</button>
<button class="mini" data-act="cemetery">cemetery</button>
</div>`;
}

export function landingHtml(state: GameState, world: World): string {
  const l = state.landing!;
  const last = current(state);
  return `<div class="box">
<h1>${esc(fmtWorldDate(l.date))}</h1>
<p>${esc(daysInWords(l.gapDays))} days after ${esc(fmtName(last.name))} died. A boat puts you ashore at ${esc(regionAt(world, l.region).name)}.</p>
<p><label>Your name <input data-name value="${esc(fmtName(l.name))}" /></label> <button class="mini" data-act="reroll-name">another name</button></p>
<button class="act" data-act="land">Land</button>
</div>`;
}

export function cemeteryHtml(state: GameState, ui: UiState): string {
  const rows = [...state.survivors].reverse().map((s) => {
    const open = ui.cemeteryOpen === s.index;
    const lines = open ? `<div class="entries">${entry(s).slice(1).map((l) => `<div class="e">${esc(l)}</div>`).join("")}</div>` : "";
    return `<div class="grave"><button class="mini" data-act="cemetery-open" data-index="${s.index}">${esc(epitaph(s))}</button>${lines}</div>`;
  });
  const leave = ui.confirmLeave
    ? `<button class="mini danger" data-act="leave-world-yes">Leave this world for good? Yes, everyone here is forgotten</button> <button class="mini" data-act="leave-world-no">no</button>`
    : `<button class="mini" data-act="leave-world">leave this world</button>`;
  return `<div class="box">
<h1>Cemetery</h1>
${rows.join("")}
<p>${leave}</p>
<button class="act" data-act="cemetery-close">Close</button>
</div>`;
}

export function journalHtml(state: GameState, cal: Calendar): string {
  const n = nextThreshold(state, cal);
  const when = n.inDays > 0 ? `expected in ${n.inDays} days` : "any day now";
  const season = `<div class="season"><b>Next: ${esc(NAMES[n.id])}</b>, ${when}. ${esc(ASKS_FOR[n.id])}</div>`;
  const mine = entry(current(state));
  const ancestors = state.survivors.slice(0, -1).reverse().map((s) => `<div class="e"><button class="mini" data-act="cemetery-open" data-index="${s.index}">${esc(fmtName(s.name))}</button> ${esc(epitaph(s).slice(fmtName(s.name).length + 2))}</div>`);
  return `<h2>Journal</h2>${season}<div class="entries">${mine.map((l) => `<div class="e">${esc(l)}</div>`).join("")}</div>${ancestors.length ? `<h3>Before you</h3><div class="entries">${ancestors.join("")}</div>` : ""}<button class="mini" data-act="cemetery">cemetery</button>`;
}
```

`monthOf(d: WorldDate)` is `export function monthOfDoy(doy: number): string` in `epitaph.ts`, the month name from the same `MONTHS` table `fmtWorldDate` uses; `daysInWords` is exported from `landing.ts` (Task 7 defines it there; export it). `cemetery-open` from the journal should also set `ui.cemetery = true`. `awayHtml(away, realSeconds, capped, sinceLine)`: insert `<p>${esc(sinceLine)}</p>` under the title. In `regionHtml`, the `abandon` button block stays.

- [ ] **Step 4: render.ts, main.ts, index.html, style.css**

`UiState`: `cemetery: false, cemeteryOpen: null, confirmLeave: false, awayFromDay: 1`. `index.html`: add `<section id="journal" class="panel"></section>` after `log`. `main.ts` `render`: `setPanel("journal", journalHtml(state, cal));` and the overlay:

```ts
  if (ui.cemetery) { setPanel("overlay", cemeteryHtml(state, ui)); overlay.hidden = false; }
  else if (ui.away) { setPanel("overlay", awayHtml(ui.away, awayInfo?.seconds ?? 0, awayInfo?.capped ?? false, since(current(state), ui.awayFromDay))); overlay.hidden = false; }
  else if (state.landing) { setPanel("overlay", landingHtml(state, world)); overlay.hidden = false; }
  else if (state.dead) { setPanel("overlay", tombstoneHtml(state, world)); overlay.hidden = false; }
  else overlay.hidden = true;
```

Before each `catchUp` call: `ui.awayFromDay = calendar(state.minute, state.startDoy).day`. `boot`: skip `catchUp` when `saved.state.dead || saved.state.landing`. `frame`: the clock only advances when `!state.dead && !state.landing && !ui.away`. `onClick` cases:

```ts
    case "begin-again": beginAgain(state, world); break;
    case "reroll-name": rerollName(state); break;
    case "land": land(state, world); break;
    case "cemetery": ui.cemetery = true; ui.confirmLeave = false; break;
    case "cemetery-open": ui.cemetery = true; ui.cemeteryOpen = Number(target.dataset.index); break;
    case "cemetery-close": ui.cemetery = false; ui.cemeteryOpen = null; ui.confirmLeave = false; break;
    case "leave-world": ui.confirmLeave = true; break;
    case "leave-world-no": ui.confirmLeave = false; break;
    case "leave-world-yes": ui.cemetery = false; ui.confirmLeave = false; clearSave(); fresh(); break;
```

The `input` listener: `if (el.matches("[data-name]") && state.landing) { const t = el.value.trim(); const i = t.indexOf(" "); state.landing.name = i < 0 ? { first: t || state.landing.name.first, last: state.landing.name.last } : { first: t.slice(0, i), last: t.slice(i + 1).trim() }; }`. `setPanel` already refuses to redraw a panel while a field in it has focus; check that the overlay counts, and if not, add `[data-name]` to its focus check. `sounds.frame`'s "playing" flag adds `&& !state.landing`.

`style.css`: `.grave { margin: 4px 0; } .season { margin-bottom: 6px; } #overlay .box input[data-name] { width: 14em; }`.

Remove `deathHtml`; update `tests/ui.test.ts` imports to `tombstoneHtml` where it referenced `deathHtml`.

- [ ] **Step 5: Run tests, build, commit**

Run: `npm test && npm run build`. Expected: PASS.

```bash
git add src/ui/panels.ts src/ui/render.ts src/main.ts index.html src/style.css src/sim/landing.ts tests/survivor-ui.test.ts tests/ui.test.ts
git commit -m "feat(survidle): the tombstone, the landing screen with a name, the cemetery, the journal and the away report's what-happened line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The reference player's heir mode

**Files:**
- Modify: `src/sim/reference.ts`, `scripts/reference.ts`
- Test: `tests/reference.test.ts`

**Interfaces:**
- `reference.ts`: `measure(ref: { state; world; player }, days: number): ReferenceReport` extracted from `runReference` (which becomes `measure(setUpReference(...), days)`), and

```ts
export interface HeirReport {
  seed: number;
  first: ReferenceReport;
  gapDays: number;
  landed: WorldDate;
  found: { structures: string[]; campFoodKcal: number; campFirewoodKg: number; snares: number; kmToOldCamp: number };
  heir: ReferenceReport;
}
export function runHeir(seed: number, days: number): HeirReport;
```

`runHeir`: `measure` the first life to its death (cap `days`); if it did not die, `heir` is the same report and `gapDays` 0 (the report says so); else `beginAgain`, `land` with the rolled name, `found` read from the old camp's region state and pile, then `measure` again with a fresh `ReferencePlayer` for up to `days`. The heir's gate is `gateFor(state.startDoy, false)`, which reads first snow for a landing from July on, per the roadmap's late-August gate.

- `scripts/reference.ts`: `--heir` runs `runHeir` per seed after the from-scratch block and prints: the first life's outcome, the gap and landing date, what the heir found, the heir's checkpoints and pass line. The heir's pass counts toward its own "heir passed N of M" line and not the exit code.

- [ ] **Step 1: Write the failing test**

Append to `tests/reference.test.ts`:

```ts
import { runHeir } from "../src/sim/reference";
import { coastOpen } from "../src/sim/calendar";

describe("the heir", () => {
  it("runs two lives on seed 17 and lands the heir in the open season near the old camp", () => {
    const r = runHeir(17, 70);
    expect(r.first.outcome.kind).toBe("died");
    expect(r.gapDays).toBeGreaterThanOrEqual(90);
    expect(coastOpen(r.landed.doy)).toBe(true);
    expect(r.found.kmToOldCamp).toBeGreaterThanOrEqual(3);
    expect(r.found.kmToOldCamp).toBeLessThanOrEqual(20);
    expect(r.heir.record.index).toBe(2);
    expect(r.heir.checkpoints.length).toBeGreaterThan(0);
  }, 30000);
});
```

Seed 17's April reference run dies around day 48 (roadmap measurement), inside 70 days. If `measure` for 70 days plus a 90-day gap plus a 70-day heir takes over a few seconds, the test is still under the 30 s budget; if it exceeds 5 s, move it behind `npm run test:slow` (add the script: `vitest run tests/reference-heir.test.ts` in its own file) and say so in the commit message.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/reference.test.ts`. Expected: FAIL, `runHeir` missing.

- [ ] **Step 3: Implement**

In `reference.ts`, rename the body of `runReference` to `export function measure(ref, days)` taking the prepared `ref`; `runReference` becomes:

```ts
export function runReference(seed: number, days: number, opts: { kitted?: boolean; startDoy?: number } = {}): ReferenceReport {
  return measure(setUpReference(seed, opts.kitted ?? false, opts.startDoy ?? START_DOY), days);
}
```

`measure` reads `gateFor(ref.state.startDoy, kitted)`: pass `kitted` as a third parameter with default false. Then:

```ts
export function runHeir(seed: number, days: number): HeirReport {
  const ref = setUpReference(seed);
  const first = measure(ref, days);
  const { state, world } = ref;
  if (!state.dead) return { seed, first, gapDays: 0, landed: current(state).landed, found: { structures: [], campFoodKcal: 0, campFirewoodKg: 0, snares: 0, kmToOldCamp: 0 }, heir: first };
  const oldRegion = state.player.region;
  const oldSt = regionState(state, world, oldRegion);
  beginAgain(state, world);
  land(state, world);
  const camp = pile(state, oldSt.campCell);
  const structures = (["firePit", "leanTo", "cabin", "dryingRack", "boughBed", "hearth"] as const).filter((s) => oldSt.structures[s]);
  const lc = cellAt(world, state.landing ? state.landing.cell : cellOf(state, world));
  const cc = cellAt(world, oldSt.campCell);
  const found = {
    structures: [...structures], campFoodKcal: Math.round(campFoodKcalAt(state, camp)), campFirewoodKg: Math.round(qty(camp, "firewood")),
    snares: oldSt.structures.snares, kmToOldCamp: Math.round(Math.hypot(lc.x - cc.x, lc.y - cc.y) * CELL_KM * 10) / 10,
  };
  const heirRef = { state, world, player: new ReferencePlayer() };
  const heir = measure(heirRef, days);
  return { seed, first, gapDays: current(state).gapDays, landed: current(state).landed, found, heir };
}
```

`campFoodKcalAt(state, inv)` is `campFoodKcal` refactored to take the pile; keep `campFoodKcal(state, world)` calling it. The landing cell: read it before `land` clears `state.landing`.

`scripts/reference.ts`: parse `--heir`; after the from-scratch blocks and the kitted ones:

```ts
if (heir) {
  let heirPassed = 0;
  for (const seed of seeds) {
    const r = runHeir(seed, days);
    console.log(`seed ${seed} (heir): first life ${outcomeText(r.first)}; gap ${r.gapDays} days; landed ${fmtWorldDate(r.landed)}, ${r.found.kmToOldCamp} km from the old camp`);
    console.log(`  found: ${r.found.structures.join(", ") || "nothing standing"}; ${r.found.snares} snares; ${r.found.campFoodKcal} kcal and ${r.found.campFirewoodKg} kg of firewood at camp`);
    printCheckpoints(r.heir);
    console.log(`  heir: ${passLine(r.heir)}`);
    if (r.heir.passed) heirPassed++;
  }
  console.log(`heir passed ${heirPassed} of ${seeds.length}`);
}
```

with `outcomeText`, `printCheckpoints`, `passLine` factored out of `runBlock`. Update the script's header comment with the `--heir` flag.

- [ ] **Step 4: Run tests, build, and the script once**

Run: `npm test && npm run build`, then `npx vite-node scripts/reference.ts --heir 17 19 42 79 250` and keep the output: Task 11 writes it into the roadmap.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts scripts/reference.ts tests/reference.test.ts
git commit -m "feat(survidle): the reference player runs an heir - two lives per seed, the gap between, what the heir found at the old camp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Roadmap bookkeeping and the browser pass

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`, `docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md`, `docs/README.md` (if it lists panels or the save)

This task is documentation and verification; no code unless the browser pass finds a defect, in which case fix it under its own test and commit.

- [ ] **Step 1: The roadmap**

In the build-order paragraph, `F's core (...)` gains `built)` in the style of the others. In the F section's core paragraph add a "Built:" line pointing at the spec and this plan. Under it add a measured paragraph from Task 10's `--heir` output: per seed, the first death, the gap, the landing date, what the heir found, the heir's death or gate, and the heir pass count. Add the deviation from Global Constraints: tools laid down at death keep no durability, so the rust rule waits for the corpse run (the death site item under "the rest of F"); say it there so the corpse-run spec picks it up. In the idle curve spec's sequencing list, mark item 3 built.

- [ ] **Step 2: The browser pass**

Follow spec section 11 in Chrome via the dev server (`npm run dev`, page at `http://127.0.0.1:5173/prototypes/08/?seed=17&speed=200`): run to a death (or `window.survidle.state.player.health = 0` after a few game days to force one, then `window.survidle.advance(1)`), read the tombstone and its entry, press Begin again, reroll the name twice, type one, Land, open the journal and read the ancestor's line, walk toward the old camp by the first log line's direction and find the fire pit standing with the lean-to gone, see the journal's "Next:" line, then in the same world abandon and find "Gave up" in the cemetery. Note what looked wrong. Stop the dev server after.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md
git commit -m "docs(survidle): F core built - the roadmap marks it, carries the heir measurement, and hands the rust rule to the corpse run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
