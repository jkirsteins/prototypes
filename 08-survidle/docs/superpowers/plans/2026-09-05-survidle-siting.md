# Siting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Camp becomes a chosen cell: a "make camp here" task moves the region's camp cell while nothing stands at the old one, the region says what a cell offers, the reads that still used the generated camp read the live one, and the map marks the camp always.

**Architecture:** `RegionState.campCell` is already the run-time truth for nearly every reader; this item adds one task that writes it, one helper (`canMoveCamp`) that says when, one pure report (`siteReport`) over walk minutes to the region's spots, one accessor (`campCellOf`) that the three stale display reads switch to, and one map glyph. The generated cell stays the default so the reference player, the horizon and the heirs are unchanged.

**Tech Stack:** TypeScript, Vite, vitest. Run from `08-survidle/`.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-siting-design.md`

## Global Constraints

- Work on `main` in the primary clone, pre-approved. Stage by explicit path under `08-survidle/`; never `git add -A`; never `git stash`. Other sessions commit docs concurrently; read `src/main.ts` and `src/ui/panels.ts` fresh before editing (the UI pass may have moved the Do panel's renderer into `src/ui/dopanel.ts`; if `intentGroups` lives there, edit it there).
- `makeCamp`: 20 minutes, activity "light", no tool, no skill, group "camp", in `NOT_ORDERS`. Legal off the camp cell on passable land in the current region while `canMoveCamp` holds. Completion sets `regionState(...).campCell`, updates a live intent's `campCell`, logs "You make camp here.".
- `canMoveCamp` reasons, verbatim: "the <structure name> stands there" (the first structure flag that is true, snares excepted), "the fire is banked there", "<N> kg lie at the old camp, carry them first".
- The reference player, the horizon and `runHeir` outcomes are unchanged (the existing pins in tests must not move).
- No em dashes and no non-typable unicode; comments explain, never chronicle.
- Every commit: `npm test` green, `npx tsc --noEmit` clean, `npm run build` ok. Commit messages end with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.

---

### Task 1: canMoveCamp, campCellOf, and the stale reads

**Files:**
- Modify: `src/sim/camp.ts` (`canMoveCamp`), `src/sim/position.ts` (`campCellOf`, `spotHere`, `describeWhere`), `src/sim/tasks.ts` (`whereIs` if it maps the camp cell to "camp"), `src/ui/panels.ts` (`regionHtml`'s overview distances)
- Test: `tests/siting.test.ts`

**Interfaces:**
- Produces: `canMoveCamp(state, world): { ok: true } | { ok: false; why: string }` (camp.ts); `campCellOf(state, world, region = state.player.region): number` (position.ts).

- [ ] **Step 1: Read first**

`src/sim/position.ts` (`atCamp`, `spotHere`, `describeWhere`, `kmBetween`); `src/sim/regionstate.ts` (`regionState`); `src/sim/types.ts` (`RegionState.structures`, `fire`); `src/sim/inventory.ts` (`pile`, `weight`); `src/ui/panels.ts` `regionHtml` (the overview list's `fmtKm(s.km)` "from camp" line, near line 242); `src/sim/tasks.ts` `whereIs`.

- [ ] **Step 2: Write the failing tests**

Create `tests/siting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canMoveCamp } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { campCellOf, describeWhere, spotHere } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";

describe("moving the camp is allowed while nothing stands at it", () => {
  it("is ok on a fresh game, and names the structure, the banked fire or the pile that blocks it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    expect(canMoveCamp(state, world)).toEqual({ ok: true });
    st.structures.firePit = true;
    expect(canMoveCamp(state, world)).toEqual({ ok: false, why: "the fire pit stands there" });
    st.structures.firePit = false;
    st.fire.fuelKg = 2;
    expect(canMoveCamp(state, world)).toEqual({ ok: false, why: "the fire is banked there" });
    st.fire.fuelKg = 0;
    addItem(pile(state, st.campCell), "stick", 30);
    expect(canMoveCamp(state, world).ok).toBe(false);
    expect((canMoveCamp(state, world) as { why: string }).why).toMatch(/^\d+(\.\d)? kg lie at the old camp, carry them first$/);
    st.structures.snares = 3;
    pile(state, st.campCell).stick = 0;
    expect(canMoveCamp(state, world)).toEqual({ ok: true });
  });
});

describe("the camp reads follow the live cell", () => {
  it("campCellOf, spotHere, describeWhere and atCamp read regionState's camp, not the generated one", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const generated = st.campCell;
    expect(campCellOf(state, world)).toBe(generated);
    expect(spotHere(state, world)).toBe("camp");
    // Move the camp one passable cell over and stand on it.
    const next = generated + 1;
    st.campCell = next;
    state.player.x = next % world.width; state.player.y = Math.floor(next / world.width);
    expect(campCellOf(state, world)).toBe(next);
    expect(spotHere(state, world)).toBe("camp");
    expect(describeWhere(state, world)).toMatch(/at camp|0(\.0)? km from camp/);
    state.player.x = generated % world.width; state.player.y = Math.floor(generated / world.width);
    expect(spotHere(state, world)).not.toBe("camp");
  });
});
```

Check `world.width` and the player position fields (`state.player.x/y` or a cell index) in `src/sim/types.ts` and `src/sim/position.ts` (`cellOf`, `placeAt`), and use the real ones; if `generated + 1` is water or another region, pick a neighbouring passable cell with the helpers position.ts already has (`passable`, `cellAt`). Adjust the `describeWhere` expectation to its real wording for standing at camp.

- [ ] **Step 3: Implement**

`src/sim/position.ts`:

```ts
/** The camp as the run has it: the region state's cell, which a chosen camp moves, never the generated default. */
export function campCellOf(state: GameState, world: World, region = state.player.region): number {
  return regionState(state, world, region).campCell;
}
```

`spotHere`: if `cellOf(state, world) === campCellOf(state, world)` return `"camp"`; otherwise match the region's spots excluding the `"camp"` entry. `describeWhere`: the "km from camp" distance reads `campCellOf(...)`. `whereIs` in tasks.ts: the same rule if it maps cells to spot ids. `regionHtml`: for a region with state, each spot's distance is `kmBetween(world, campCellOf(state, world, id), s.cell)`; without state, `s.km`.

`src/sim/camp.ts`:

```ts
const STRUCTURE_WORD: Record<string, string> = { firePit: "fire pit", leanTo: "lean-to", cabin: "cabin", dryingRack: "drying rack", boughBed: "bough bed", hearth: "hearth", turfHut: "turf hut", waterStore: "water trough" };

/** Whether the camp may be moved: nothing built at it (snares stand on the heath), no fire banked, nothing lying in its pile. */
export function canMoveCamp(state: GameState, world: World): { ok: true } | { ok: false; why: string } {
  const st = regionState(state, world, state.player.region);
  for (const [k, word] of Object.entries(STRUCTURE_WORD)) if ((st.structures as Record<string, unknown>)[k] === true) return { ok: false, why: `the ${word} stands there` };
  if (st.fire.lit || st.fire.fuelKg > 0) return { ok: false, why: "the fire is banked there" };
  const kg = weight(pile(state, st.campCell));
  if (kg > 1e-9) return { ok: false, why: `${Math.round(kg * 10) / 10} kg lie at the old camp, carry them first` };
  return { ok: true };
}
```

Use the structure names the UI already prints (grep `STRUCTURES` in `src/sim/items.ts` for a `name` field and read from it instead of the table above if it exists).

- [ ] **Step 4: Run, commit**

Run: `npx vitest run tests/siting.test.ts && npm test && npx tsc --noEmit`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/camp.ts 08-survidle/src/sim/position.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/siting.test.ts
git commit -m "feat(survidle): the camp reads follow the region's cell, and canMoveCamp says what holds the camp where it is"
```

---

### Task 2: The task and the report

**Files:**
- Modify: `src/sim/types.ts` (`TaskId` gains `"makeCamp"`), `src/sim/tasks.ts` (definition, `check`, completion), `src/sim/ladder.ts` (`NOT_ORDERS` gains `"makeCamp"`), `src/sim/camp.ts` (`siteReport`, `siteLine`), `src/ui/panels.ts` (`regionHtml`'s Here section) and the Do panel's `intentGroups` (panels.ts or dopanel.ts) Camp group
- Test: `tests/siting.test.ts` (append)

**Interfaces:**
- Produces: `siteReport(state, world, cell): { terrain: string; spots: { id: SpotId; minutes: number | null }[]; ices: boolean }`; `siteLine(report): string`.

- [ ] **Step 1: Read first**

`src/sim/tasks.ts`: how a task is defined (its table entry: label, group, minutes, activity, tool, skill), how `check` gates a camp chore (e.g. `split` or `melt`), how completion runs (`complete` or the `finish` branch for `build`), and how `availableTasks` lists a task with a `why` when it cannot start; `src/sim/ledger.ts` `creditTime` is already called by the step for any task. `src/world/route.ts` (`findRoute`, `routeMinutes`), `src/sim/player.ts` (`baseWalkSpeed`), `src/world/gen.ts` (`spotOf`, `RegionDef.spots`, the terrain names table), `src/sim/water.ts` (`ICE_SHORE_CM`).

- [ ] **Step 2: Write the failing tests**

Append:

```ts
import { siteLine, siteReport } from "../src/sim/camp";
import { availableTasks, beginTask } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { advance } from "../src/sim/advance";

describe("make camp here", () => {
  it("is not offered on the camp cell, is offered one land cell away, moves the camp on completion and logs it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(false);
    const next = /* a neighbouring passable land cell, as in Task 1's test */;
    /* stand on next */
    expect(availableTasks(state, world, cal).some((o) => o.id === "makeCamp" && o.ok)).toBe(true);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "makeCamp")).toBe(true);
    advance(state, world, 25);
    expect(st.campCell).toBe(next);
    expect(state.log.some((e) => e.text === "You make camp here.")).toBe(true);
  });

  it("a live intent's camp follows the move", () => {
    // Give an order (addOrder with a sticks keep), advance a minute so state.intent exists, then make camp one cell over and assert state.intent.campCell equals the new cell.
  });

  it("the site report lists every spot but camp with walk minutes, and says the water ices", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const r = siteReport(state, world, st.campCell);
    const region = regionAt(world, state.player.region);
    expect(r.spots.map((s) => s.id).sort()).toEqual(region.spots.filter((s) => s.id !== "camp").map((s) => s.id).sort());
    expect(r.spots.some((s) => s.minutes !== null && s.minutes > 0)).toBe(true);
    expect(r.ices).toBe(region.spots.some((s) => s.id === "shore"));
    const line = siteLine(r);
    for (const s of r.spots) expect(line).toContain(s.id);
    if (r.ices) expect(line).toContain("ices over in winter");
  });
});
```

Fill the two placeholders with the same neighbouring-cell helper Task 1's test used, and the order set-up with `addOrder` from `src/sim/orders.ts`.

- [ ] **Step 3: Implement**

`types.ts`: add `"makeCamp"` to `TaskId`. `ladder.ts`: add it to `NOT_ORDERS`. `tasks.ts`: the definition (label "Make camp here", group "camp", 20 minutes, activity "light", no tool, no skill); in `check`, the case: `here === campCellOf(state, world)` -> not ok, "this is the camp"; not passable land in the current region -> not ok, "not here"; `canMoveCamp` not ok -> its why; else ok with `detail: siteLine(siteReport(state, world, here))`. On completion: `const st = regionState(...); st.campCell = here; if (state.intent) state.intent.campCell = here; log(state, "You make camp here.");`.

`camp.ts`:

```ts
export interface SiteReport { terrain: string; spots: { id: SpotId; minutes: number | null }[]; ices: boolean }

/** What a cell offers as a camp: the ground under foot, the walk to each of the region's spots from it, and whether the water ices. */
export function siteReport(state: GameState, world: World, cell: number): SiteReport {
  const r = regionAt(world, state.player.region);
  const cal = calendar(state.minute, state.startDoy);
  const speed = baseWalkSpeed(state, cal, state.weather);
  const spots = r.spots.filter((s) => s.id !== "camp").map((s) => {
    const route = findRoute(world, cell, s.cell, "none");
    return { id: s.id, minutes: route ? Math.round(routeMinutes(world, route, speed, "none")) : null };
  });
  return { terrain: terrainName(cellAt(world, cell).terrain), spots, ices: r.spots.some((s) => s.id === "shore") };
}

export function siteLine(r: SiteReport): string {
  const parts = r.spots.map((s) => `${s.id} ${s.minutes === null ? "no way" : `${s.minutes} min`}`);
  return `${parts.join(", ")}${r.ices ? "; ices over in winter" : ""}`;
}
```

Use the real names of the route helpers and the terrain-name lookup the map uses; if `findRoute`'s ice argument has another shape, follow it.

`regionHtml`: when the survivor is in the region and `cellOf(state, world) !== campCellOf(state, world)`, add under Here: `<div class="kv"><span>as a camp</span><span>${esc(siteLine(siteReport(state, world, cellOf(state, world))))}</span></div>` (match the panel's existing key-value markup). The Do panel's Camp group (`intentGroups`) gains `{ id: "makeCamp" }` first in the list; since it is a `NOT_ORDERS` task the kind-per-row expansion (if the UI pass has landed) offers nothing for it.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run tests/siting.test.ts tests/reference.test.ts tests/epitaph.test.ts && npm test && npx tsc --noEmit && npm run build | tail -3`
The reference and epitaph pins must not move (nothing in the harness makes camp).

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/ladder.ts 08-survidle/src/sim/camp.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/siting.test.ts
# plus 08-survidle/src/ui/dopanel.ts if intentGroups lives there
git commit -m "feat(survidle): make camp here - the region says what a cell offers, and the camp moves while nothing holds it"
```

---

### Task 3: The map mark and the docs

**Files:**
- Modify: `src/ui/map.ts` (the camp glyph), `src/style.css` (`.mk-camp`), `docs/README.md` (a line under How it plays about choosing the camp), `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build-order sentence for siting gains "; built"; a "Built" paragraph after the Siting paragraph in section 3)
- Test: `tests/siting.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import { mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";

it("the map marks the camp with x until a fire or shelter glyph takes the cell, and the mark follows a move", () => {
  const { state, world } = newGame(17);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  expect(mapHtml(world, state, ui, cal)).toContain("mk-camp");
  const st = regionState(state, world, state.player.region);
  st.fire.lit = true;
  st.fire.fuelKg = 5;
  expect(mapHtml(world, state, ui, cal)).not.toContain("mk-camp");
});
```

- [ ] **Step 2: Implement**

In `mapHtml`, where `visitedCamps()` places the fire ("F", `mk-fire`) or shelter ("H", `mk-shelter`) glyph, add the third case: neither holds -> `"x"` with class `mk-camp`. `style.css`: `.mk-camp { color: <the shelter mark's colour>; opacity: .7; }`. If Task 3 of the UI pass has landed, add `x camp` to `legendHtml`.

- [ ] **Step 3: Docs**

README, under How it plays where camp is first mentioned: "Camp is the cell the run lives around. It starts at the region's centre; walk to a better cell and make camp there while nothing stands at the old one, and the region panel says what the cell offers first." Roadmap: the build-order sentence "3's siting (camp as a chosen cell, pulled out of 3 the way the hut and the trough were)" gains "; built" inside the parentheses; after the **Siting.** paragraph in section 3 add a paragraph starting "**Built.**" naming what shipped (the task and its three reasons, the site report, the reads that now follow the cell, the x mark) and leaving the browser pass reading to the controller.

- [ ] **Step 4: Run, commit**

Run: `npx vitest run tests/siting.test.ts && npm test && npx tsc --noEmit && npm run build | tail -3`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/ui/map.ts 08-survidle/src/style.css 08-survidle/tests/siting.test.ts 08-survidle/docs/README.md 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "feat(survidle): the map marks the camp, and the roadmap marks siting built"
```
