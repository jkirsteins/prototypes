# Unified Travel Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every route-cost display one browser-wide distance/time/both preference, expose an action's actual initial walk separately from its work duration, and replace generated camp-spot estimates with truthful cell possibilities.

**Architecture:** A pure `src/ui/travel.ts` module owns the browser preference and text formatter. Simulation option resolution attaches a structured `initialWalk` preview to `TaskOption`, including the special material-fetch leg, and rendering receives the selected display explicitly. Existing positional distance text remains outside this system.

**Tech Stack:** TypeScript, Vite, Vitest, string-template UI, localStorage

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-travel-estimates-design.md`

## Global Constraints

- The browser preference has exactly `distance`, `time`, and `both`; default is `distance`.
- The preference is browser-wide and must never enter `GameState` or the game save.
- Only route-cost estimates use the preference. Work durations, countdowns, statistics, map scale, straight-line orientation, `km to go`, and `km from camp` stay unchanged.
- Action rows describe the initial walk only. They do not predict delivery, repeat trips, or future body movement.
- The generated forest, shore, and heath camp estimates are removed everywhere.
- Cell possibility labels describe stable environmental capabilities only. Currently the only label is `seep possible`.
- All output and source additions use ASCII characters only.

---

### Task 1: Browser travel preference and pure formatter

**Files:**
- Create: `src/ui/travel.ts`
- Create: `tests/travel-display.test.ts`
- Modify: `index.html:63-76`
- Modify: `src/ui/render.ts:10-52,128-136`
- Modify: `src/main.ts:80-110,180-240,680-730`
- Modify: `tests/layout.test.ts:113-130`

**Interfaces:**
- Produces: `type TravelDisplay = "distance" | "time" | "both"`
- Produces: `DEFAULT_TRAVEL_DISPLAY: TravelDisplay`
- Produces: `loadTravelDisplay(storage?: Storage): TravelDisplay`
- Produces: `saveTravelDisplay(display: TravelDisplay, storage?: Storage): void`
- Produces: `formatTravel(km: number, minutes: number, display: TravelDisplay): string`
- Produces: `UiState.travelDisplay: TravelDisplay`

- [ ] **Step 1: Write failing formatter and storage tests**

Create `tests/travel-display.test.ts` with an in-memory `Storage` matching
`tests/audio-settings.test.ts`, then add:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL_DISPLAY,
  formatTravel,
  loadTravelDisplay,
  saveTravelDisplay,
} from "../src/ui/travel";

describe("travel display", () => {
  it("formats one route in all three modes", () => {
    expect(formatTravel(3.34, 66, "distance")).toBe("3.3 km");
    expect(formatTravel(3.34, 66, "time")).toBe("1 h 6 min");
    expect(formatTravel(3.34, 66, "both")).toBe("3.3 km, 1 h 6 min");
  });

  it("defaults safely and persists browser-wide", () => {
    const storage = memory();
    expect(DEFAULT_TRAVEL_DISPLAY).toBe("distance");
    expect(loadTravelDisplay(storage)).toBe("distance");
    saveTravelDisplay("time", storage);
    expect(loadTravelDisplay(storage)).toBe("time");
    storage.setItem("survidle.display", JSON.stringify({ travel: "nonsense" }));
    expect(loadTravelDisplay(storage)).toBe("distance");
    storage.setItem("survidle.display", "{bad json");
    expect(loadTravelDisplay(storage)).toBe("distance");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/travel-display.test.ts`

Expected: FAIL because `../src/ui/travel` does not exist.

- [ ] **Step 3: Implement the pure formatter and browser persistence**

Create `src/ui/travel.ts`:

```ts
import { fmtDuration, fmtKm } from "../units";

export type TravelDisplay = "distance" | "time" | "both";
export const DEFAULT_TRAVEL_DISPLAY: TravelDisplay = "distance";
export const DISPLAY_SETTINGS_KEY = "survidle.display";

export function formatTravel(km: number, minutes: number, display: TravelDisplay): string {
  const distance = fmtKm(km);
  const time = fmtDuration(minutes);
  if (display === "time") return time;
  if (display === "both") return `${distance}, ${time}`;
  return distance;
}

export function loadTravelDisplay(storage: Storage = localStorage): TravelDisplay {
  try {
    const value = (JSON.parse(storage.getItem(DISPLAY_SETTINGS_KEY) ?? "{}") as { travel?: unknown }).travel;
    return value === "distance" || value === "time" || value === "both" ? value : DEFAULT_TRAVEL_DISPLAY;
  } catch {
    return DEFAULT_TRAVEL_DISPLAY;
  }
}

export function saveTravelDisplay(display: TravelDisplay, storage: Storage = localStorage): void {
  try {
    storage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ travel: display }));
  } catch {
    // A browser that refuses storage still keeps the choice for this page load.
  }
}
```

- [ ] **Step 4: Put the preference in UI state and Settings**

Add `travelDisplay: TravelDisplay` to `UiState`, initialize it with
`DEFAULT_TRAVEL_DISPLAY`, then overwrite it once in `main.ts`:

```ts
const ui = newUiState();
ui.travelDisplay = loadTravelDisplay(localStorage);
```

Add this static control under Sound in `index.html`:

```html
<label>Travel estimates
  <select data-display="travel">
    <option value="distance">distance</option>
    <option value="time">time</option>
    <option value="both">distance and time</option>
  </select>
</label>
```

In `render()`, keep the selected option synchronized without rebuilding the
static settings DOM:

```ts
const travelSelect = document.querySelector<HTMLSelectElement>("[data-display=travel]");
if (travelSelect && travelSelect.value !== ui.travelDisplay) travelSelect.value = ui.travelDisplay;
```

In the existing `change` listener, handle the select before row controls:

```ts
if (el.matches("[data-display=travel]")) {
  const value = el.value;
  if (value === "distance" || value === "time" || value === "both") {
    ui.travelDisplay = value;
    saveTravelDisplay(value, localStorage);
    lastTipKey = "";
    render();
  }
  return;
}
```

Extend `tests/layout.test.ts` to assert that the Settings subtree contains one
`data-display="travel"` select and the three values.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/travel-display.test.ts tests/layout.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the preference component**

```bash
git add index.html src/main.ts src/ui/render.ts src/ui/travel.ts tests/layout.test.ts tests/travel-display.test.ts
git commit -m "feat: add travel estimate preference"
```

---

### Task 2: Structured initial-walk preview

**Files:**
- Modify: `src/sim/tasks.ts:58-90`
- Modify: `src/sim/intent.ts:120-275`
- Modify: `tests/intent.test.ts:180-210,390-455`

**Interfaces:**
- Produces: `interface InitialWalk { cell: number; destination: string; nearest: boolean; km: number; minutes: number }`
- Produces: `TaskOption.initialWalk?: InitialWalk`
- Consumes: existing `resolveCell`, `fetchSources`, `check("walk")`, `kmBetween`, `groundOf`, and `SPOT_WORDS`

- [ ] **Step 1: Write failing initial-walk tests**

Add tests under the existing resolved-cell describe block in
`tests/intent.test.ts`:

```ts
it("previews the first walk separately from felling time", () => {
  const { state, world } = newGame(3);
  siteCamp(state, world);
  placeAtSpot(state, world, state.player.region, "heath");
  const o = intentOption(state, world, cal, "chop", "spruce", "nearest");
  expect(o.duration).toBeGreaterThan(0);
  expect(o.initialWalk).toMatchObject({ destination: "spruce forest", nearest: true });
  expect(o.initialWalk!.km).toBeGreaterThan(0);
  expect(o.initialWalk!.minutes).toBeGreaterThan(0);
});

it("has no initial walk on usable ground", () => {
  const { state, world } = newGame(3);
  siteCamp(state, world);
  placeAtSpot(state, world, state.player.region, "forest");
  expect(intentOption(state, world, cal, "chop", undefined, "nearest").initialWalk).toBeUndefined();
});

it("marks a selected place as explicit", () => {
  const { state, world } = newGame(3);
  siteCamp(state, world);
  placeAtSpot(state, world, state.player.region, "heath");
  const o = intentOption(state, world, cal, "chop", undefined, "forest");
  expect(o.initialWalk).toMatchObject({ destination: "the forest", nearest: false });
});
```

Extend the existing remote-material build fixture near the `fetchAllowance`
tests to assert that `initialWalk.cell` is the source pile, not camp.

- [ ] **Step 2: Run the intent tests and verify the missing-field failure**

Run: `npx vitest run tests/intent.test.ts`

Expected: FAIL because `TaskOption.initialWalk` is undefined for remote work.

- [ ] **Step 3: Add the structured type and preserve fetch structure**

In `src/sim/tasks.ts` add:

```ts
export interface InitialWalk {
  cell: number;
  destination: string;
  nearest: boolean;
  km: number;
  minutes: number;
}
```

Add `initialWalk?: InitialWalk` to `TaskOption`.

Change `fetchAllowance` to return its selected source cell as data:

```ts
type FetchAllowance = { ok: boolean; detail: string; source: number | null };
```

Every false branch returns `source: null`; the successful branch returns
`source: src.cell`. Keep its current detail wording unchanged.

- [ ] **Step 4: Build the preview from the same resolved first leg**

Add a private helper in `src/sim/intent.ts` that:

1. Receives task, arg, requested `where`, resolved work cell, and optional
   fetch source.
2. Chooses fetch source first, otherwise the resolved work cell.
3. Returns undefined when that cell equals `cellOf(state, world)`.
4. Calls `check(state, world, cal, "walk", `cell:${target}`)` and
   `kmBetween(...)` with `walkableIce(state.weather)`.
5. Returns undefined when the route is unavailable.
6. Names fetch cells with `whereIs`; camp-bound cells as `camp`; explicit spot
   choices with `SPOT_WORDS[where]`; named trees as `${arg} forest`; other
   automatic ground through `SPOT_WORDS[groundOf(task, arg)]` with a leading
   `the ` removed so the result reads `nearest forest`, not `nearest the
   forest`.
7. Sets `nearest` only for automatically resolved work ground, never camp,
   fetch sources, or an explicit place.

Attach the result in both successful `intentOption` paths:

```ts
const allowance = fetchAllowance(state, world, task, arg, o.why);
const initialWalk = previewInitialWalk(state, world, cal, task, arg, where, cell, allowance.source);
if (o.ok) return { ...o, initialWalk };
return allowance.ok ? { ...o, ok: true, why: "", detail: allowance.detail, initialWalk } : o;
```

Update `startIntent` to read `allowance.ok` from the structured return without
changing runtime movement.

- [ ] **Step 5: Run the focused intent tests**

Run: `npx vitest run tests/intent.test.ts`

Expected: PASS, including existing targeting and material-fetch tests.

- [ ] **Step 6: Commit the simulation preview**

```bash
git add src/sim/tasks.ts src/sim/intent.ts tests/intent.test.ts
git commit -m "feat: expose initial action walks"
```

---

### Task 3: Use the component on every route-cost surface

**Files:**
- Modify: `src/ui/dopanel.ts:300-455,541-565`
- Modify: `src/ui/panels.ts:250-365,750-775`
- Modify: `src/ui/tip.ts:110-165`
- Modify: `src/style.css:760-820`
- Modify: `src/main.ts:180-225`
- Modify: `tests/dopanel.test.ts`
- Modify: `tests/tip.test.ts`
- Modify: `tests/travel-ui.test.ts`
- Modify: `tests/siting.test.ts`
- Modify: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `formatTravel(km, minutes, display)` from Task 1
- Consumes: `TaskOption.initialWalk` from Task 2
- Changes render signatures that do not already receive `UiState` to accept
  `TravelDisplay`, with `DEFAULT_TRAVEL_DISPLAY` as the default for existing
  pure callers

- [ ] **Step 1: Write failing rendering tests for all three modes**

Add focused assertions:

```ts
const distance = placesHtml(state, world, cal, "distance");
const time = placesHtml(state, world, cal, "time");
const both = placesHtml(state, world, cal, "both");
expect(distance).toMatch(/\d+\.\d km/);
expect(time).toMatch(/\d+ min|\d+ h/);
expect(both).toMatch(/\d+\.\d km, .*min|\d+\.\d km, .* h/);
```

In `tests/tip.test.ts`, choose one reachable known cell and assert the route
line changes across the three explicit display arguments while its heading
still contains the compact straight-line `km` orientation.

In `tests/dopanel.test.ts`, render a remote felling row and assert:

```ts
expect(html).toContain("will walk to nearest forest");
expect(html).toMatch(/will walk to nearest forest - \d+\.\d km/);
expect(html).toContain("1 h");
```

Render again in `time` mode and assert the travel line changes while the `1 h`
work line remains.

Add a haul fixture to `tests/ui.test.ts` that checks its travel portion changes
between distance and time modes and never shows both in distance mode.

- [ ] **Step 2: Run the focused UI tests and verify signature/output failures**

Run:

```bash
npx vitest run tests/dopanel.test.ts tests/tip.test.ts tests/travel-ui.test.ts tests/siting.test.ts tests/ui.test.ts
```

Expected: FAIL because render functions do not accept or use the display and
action rows do not render `initialWalk`.

- [ ] **Step 3: Thread the display through rendering**

Add a final argument defaulted to `DEFAULT_TRAVEL_DISPLAY` on:

```ts
placesHtml(state, world, cal, display)
wayIntoHtml(state, world, cal, region, offersOnly, display)
travelHtml(state, world, cal, display)
inventoryHtml(state, world, cal, display)
tipHtml(state, world, cal, cell, display)
```

`doHtml` already receives `UiState`, so it reads `ui.travelDisplay` rather than
accepting the same state twice. Pass `ui.travelDisplay` from every other
`main.ts` call. Pass `display` through nested calls such as `placesHtml ->
wayIntoHtml`, `tipHtml -> wayIntoHtml`, and `inventoryHtml -> haulHtml`.

Include `ui.travelDisplay` in the tooltip redraw key, either as a new argument
to `tipKey` or in the key assembled by `main.ts`, so changing Settings updates
a stationary tooltip.

- [ ] **Step 4: Replace local route strings with `formatTravel`**

Replace the Places `fmtKm + fmtDuration` string, known-region `fmtDuration`,
tooltip route pair, expanded place-choice `fmtKm`, move-camp `fmtKm`, and haul
route cost with `formatTravel`.

For haul, calculate `oneWayKm` with `kmBetween` from the current cell to the
live camp using `walkableIce(state.weather)`, then use a comparable round trip:

```ts
const routeKmTotal = oneWayKm * 2;
const estimate = formatTravel(routeKmTotal, o.duration, display);
```

Keep load size, pile size, and interruption text outside the formatter. Do not
change `describeWhere`, `whereIs`, active route text, map scale, or statistics.

- [ ] **Step 5: Render the action's dedicated initial-walk line**

In `intentRowHtml`, below the ordinary duration line:

```ts
const initial = o.initialWalk;
const walk = initial
  ? `<small class="initial-walk">will walk to ${initial.nearest ? "nearest " : ""}${esc(initial.destination)} - ${esc(formatTravel(initial.km, initial.minutes, ui.travelDisplay))}</small>`
  : "";
```

Read `ui.travelDisplay` in `rowWhereHtml`, the move-camp confirmation, and
`intentRowHtml`. Keep the work-duration line exactly as it is. Add a scoped
`.initial-walk { display: block; }` rule beside the existing Do-row secondary
text so the travel sentence cannot collapse onto the work-duration line.

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
npx vitest run tests/dopanel.test.ts tests/tip.test.ts tests/travel-ui.test.ts tests/siting.test.ts tests/ui.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit unified rendering**

```bash
git add src/main.ts src/style.css src/ui/dopanel.ts src/ui/panels.ts src/ui/tip.ts tests/dopanel.test.ts tests/tip.test.ts tests/travel-ui.test.ts tests/siting.test.ts tests/ui.test.ts
git commit -m "feat: unify route cost displays"
```

---

### Task 4: Replace generated camp estimates with cell possibilities

**Files:**
- Modify: `src/sim/camp.ts:360-395`
- Modify: `src/sim/tasks.ts:940-948`
- Modify: `src/ui/tip.ts:150-165`
- Modify: `tests/siting.test.ts:360-455`
- Modify: `tests/seep.test.ts`

**Interfaces:**
- Produces: `cellPossibilities(world: World, cell: number): string[]`
- Removes: `SiteReport.spots`, `siteReport`, and generated-spot minute formatting
- Consumes: existing `seepGround(world, cell)`

- [ ] **Step 1: Replace old site-report expectations with failing possibility tests**

Delete tests asserting that site reports list generated spots and route across
ice. Add:

```ts
describe("cell possibilities", () => {
  it("names seep ground and invents no other possibilities", () => {
    const { world } = newGame(17);
    const wet = regionAt(world, 0).cells.find((cell) => seepGround(world, cell));
    const dry = regionAt(world, 0).cells.find((cell) => !seepGround(world, cell));
    expect(wet).toBeDefined();
    expect(dry).toBeDefined();
    expect(cellPossibilities(world, wet!)).toEqual(["seep possible"]);
    expect(cellPossibilities(world, dry!)).toEqual([]);
  });
});
```

Update tooltip assertions so wet cells contain `seep possible`, dry cells have
no `possible` line, and neither output contains `as a camp`, `forest`, `shore`,
or `heath` as a generated travel summary.

Update Make camp row tests so its detail contains `seep possible` on seep
ground and is empty on dry ground.

- [ ] **Step 2: Run the focused tests and verify old output fails them**

Run: `npx vitest run tests/siting.test.ts tests/seep.test.ts tests/tip.test.ts`

Expected: FAIL because `siteReport` still emits generated spot minutes and the
tooltip still prefixes them with `as a camp`.

- [ ] **Step 3: Implement stable cell possibilities**

Replace `SiteReport`, `siteReport`, and `siteLine` with:

```ts
export function cellPossibilities(world: World, cell: number): string[] {
  return seepGround(world, cell) ? ["seep possible"] : [];
}
```

In the Make camp task option:

```ts
return { ...o, detail: cellPossibilities(world, at).join(", ") };
```

In the tooltip:

```ts
const possibilities = cellPossibilities(world, cell);
if (possibilities.length) lines.push(`<div class="dim">${esc(possibilities.join(", "))}</div>`);
```

Remove imports made unused by deleting route-based site reports. Do not add
inventory-, skill-, or weather-dependent labels.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run tests/siting.test.ts tests/seep.test.ts tests/tip.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit cell possibilities**

```bash
git add src/sim/camp.ts src/sim/tasks.ts src/ui/tip.ts tests/siting.test.ts tests/seep.test.ts tests/tip.test.ts
git commit -m "fix: show truthful cell possibilities"
```

---

### Task 5: Full verification and browser pass

**Files:**
- Modify only if verification reveals a defect in files already listed above

**Interfaces:**
- Consumes all prior tasks
- Produces a verified implementation with no new interface

- [ ] **Step 1: Run the complete fast test suite**

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: `tsc` and `vite build` both exit 0.

- [ ] **Step 3: Run the repository lint gate**

From the repository root, run:

```bash
npm run lint -- 08-survidle/src 08-survidle/tests
```

Expected: zero Biome errors.

- [ ] **Step 4: Perform the browser pass**

Run `npm run dev`, open
`http://127.0.0.1:5173/prototypes/08/?seed=17`, and verify:

1. Hover a reachable remote cell. The heading keeps compact straight-line
   orientation and the next line is routed distance only.
2. Open Settings and switch to time. Tooltip, Places, region travel, expanded
   place choices, move-camp confirmation, haul, and action initial-walk lines
   change together.
3. Switch to both. The same surfaces show `distance, time` in that order.
4. Reload. The selected mode persists. Start or clear a run and verify it still
   persists.
5. Find remote felling. Its work line remains `1 h`; its separate line says it
   will walk to nearest forest and matches the route that begins on click.
6. Stand on usable forest. The felling initial-walk line disappears.
7. Hover seep-capable ground. It says `seep possible` with no generated forest,
   shore, or heath estimate. Hover dry ground and verify no empty possibility
   line appears.

Stop the dev server after the pass.

- [ ] **Step 5: Commit any verification corrections**

If Step 1-4 required corrections, stage only the corrected Survidle files and
commit them with a message naming the corrected behavior. If no correction was
needed, make no empty commit.
