# The idle layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the camp's stocks, their real caps and the direction they are moving legible at a glance, and add one covered store with one expansion rung so the pattern is proved rather than asserted.

**Architecture:** A full-width `#stocks` toolbar above the three columns reads four groups (wood, food, water, pack) from a group table, each with its held quantity, its real cap where one exists, and a projected rate assembled from signed causes the simulation already computes. Three new simulation rules back it: a covered wood store (the vedbod), dry firewood re-wetting in rain when it is over cover, and a camp yard in square metres that every structure occupies a share of.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-survidle-idle-layer-design.md`

## Global Constraints

- No em dashes and no non-typable characters in any output, code, comment or copy. Use `-`, `->`, `"`, `'`, `...`.
- Comments explain, never chronicle: no dates, no "before/after", no history in code comments.
- No magic numbers. Every quantity traces to a real-world anchor or to a constant already in the tree. A wrong number is corrected on its anchor, never bent to pass a gate.
- Panels render through `setPanel` on the existing ten-times-a-second clock. No bar width in markup; `src/ui/bars.ts` writes widths. Every per-frame writer compares before it writes.
- `npm test` and `npm run build` must both pass before every commit. The pre-commit hook runs `biome lint` on staged files plus `tsc --noEmit` for the prototype.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`: sibling sessions share this repo.
- The word "clearing" is taken: since PR 14 it means a felled-out stand under succession (`src/world/groundchange.ts`). The camp's space is the **yard**.
- Rates are stated per game hour internally. `1 game hour = 1 real minute` and `1 game minute = 1 real second`, so the unit switch changes words and the decimal point, never the model.
- The slow suite (`tests/slow/`) is not run during this work. One gate reading is taken at the end, in Task 12.

---

### Task 1: The rate component and the units setting

**Files:**
- Create: `src/ui/display-settings.ts`
- Create: `src/ui/rate.ts`
- Modify: `src/ui/travel.ts` (its saver clobbers sibling keys)
- Modify: `index.html` (settings panel), `src/main.ts` (load, reflect, change handler)
- Test: `tests/rate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RateDisplay = "game" | "real"`, `DEFAULT_RATE_DISPLAY`, `formatRate(perGameHour: number, unit: string, display: RateDisplay): string`, `loadRateDisplay(storage?: Storage): RateDisplay`, `saveRateDisplay(d: RateDisplay, storage?: Storage): void`, and `readDisplay()` / `writeDisplay(patch)` in `display-settings.ts`. `UiState` gains `rateDisplay: RateDisplay`.

- [ ] **Step 1: Write the failing test**

Create `tests/rate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_DISPLAY, formatRate, loadRateDisplay, saveRateDisplay } from "../src/ui/rate";
import { loadTravelDisplay, saveTravelDisplay } from "../src/ui/travel";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as unknown as Storage;
}

describe("the rate component", () => {
  it("says the same number in game time and prints the real reading beside it", () => {
    // 20 kg a game hour is 20 kg per real minute: the same digits, other words.
    expect(formatRate(20, "kg", "game")).toBe("20 kg/h (20 kg per real min)");
  });

  it("says the per-second reading in real time, which is the per-game-minute one", () => {
    expect(formatRate(20, "kg", "real")).toBe("0.33 kg/s (20 kg/h in the north)");
  });

  it("signs a fall and a rise, and says nothing is moving as nothing", () => {
    expect(formatRate(-3, "kg", "game")).toBe("-3 kg/h (-3 kg per real min)");
    expect(formatRate(0, "kg", "game")).toBe("steady");
  });

  it("remembers the choice and does not wipe the travel setting beside it", () => {
    const storage = memoryStorage();
    expect(loadRateDisplay(storage)).toBe(DEFAULT_RATE_DISPLAY);
    saveTravelDisplay("both", storage);
    saveRateDisplay("real", storage);
    expect(loadRateDisplay(storage)).toBe("real");
    expect(loadTravelDisplay(storage)).toBe("both");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/rate.test.ts`
Expected: FAIL, cannot resolve `../src/ui/rate`.

- [ ] **Step 3: Write `src/ui/display-settings.ts`**

```ts
/**
 * The one object every display preference lives in. Each preference used to
 * write the whole key, so saving one wiped its neighbours; reading and
 * merging here is what stops that happening again as more are added.
 */
export const DISPLAY_SETTINGS_KEY = "survidle.display";

export type DisplaySettings = Record<string, unknown>;

export function readDisplay(storage: Storage = localStorage): DisplaySettings {
  try {
    const value = JSON.parse(storage.getItem(DISPLAY_SETTINGS_KEY) ?? "{}") as unknown;
    return typeof value === "object" && value !== null ? (value as DisplaySettings) : {};
  } catch {
    return {};
  }
}

export function writeDisplay(patch: DisplaySettings, storage: Storage = localStorage): void {
  try {
    storage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ ...readDisplay(storage), ...patch }));
  } catch {
    // The choice still lasts for this page when storage is unavailable.
  }
}
```

- [ ] **Step 4: Write `src/ui/rate.ts`**

```ts
import { readDisplay, writeDisplay } from "./display-settings";

/**
 * Which clock a rate is read on. The scale is exact in both directions -
 * a game hour is a real minute, a game minute a real second - so the
 * setting changes the words and the decimal point and never the model.
 */
export type RateDisplay = "game" | "real";
export const DEFAULT_RATE_DISPLAY: RateDisplay = "game";

/** Two decimals under ten, none above: a rate is an estimate and reads worse with false precision. */
function num(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(2));
  return String(rounded);
}

export function formatRate(perGameHour: number, unit: string, display: RateDisplay): string {
  if (Math.abs(perGameHour) < 0.005) return "steady";
  const perGameMinute = perGameHour / 60;
  const game = `${num(perGameHour)} ${unit}/h`;
  const real = `${num(perGameMinute)} ${unit}/s`;
  return display === "real"
    ? `${real} (${game} in the north)`
    : `${game} (${num(perGameHour)} ${unit} per real min)`;
}

export function loadRateDisplay(storage: Storage = localStorage): RateDisplay {
  const value = readDisplay(storage).rates;
  return value === "game" || value === "real" ? value : DEFAULT_RATE_DISPLAY;
}

export function saveRateDisplay(display: RateDisplay, storage: Storage = localStorage): void {
  writeDisplay({ rates: display }, storage);
}
```

- [ ] **Step 5: Make `travel.ts` share the object**

Replace its storage functions and its key export, leaving `formatTravel` and the types untouched:

```ts
import { readDisplay, writeDisplay } from "./display-settings";

export { DISPLAY_SETTINGS_KEY } from "./display-settings";

export function loadTravelDisplay(storage: Storage = localStorage): TravelDisplay {
  const value = readDisplay(storage).travel;
  return value === "distance" || value === "time" || value === "both" ? value : DEFAULT_TRAVEL_DISPLAY;
}

export function saveTravelDisplay(display: TravelDisplay, storage: Storage = localStorage): void {
  writeDisplay({ travel: display }, storage);
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/rate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Add the setting to the page**

In `index.html`, directly after the cloud-shadows label:

```html
      <label>rates read in
        <select data-display="rates">
          <option value="game">game time (per hour)</option>
          <option value="real">real time (per second)</option>
        </select>
      </label>
```

In `src/main.ts`: import `loadRateDisplay, saveRateDisplay` from `./ui/rate`; beside `ui.cloudShadows = loadCloudShadows(localStorage);` add `ui.rateDisplay = loadRateDisplay(localStorage);`; beside the cloud-shadows reflection in the render pass add

```ts
  const rates = document.querySelector<HTMLSelectElement>("[data-display=rates]");
  if (rates && rates.value !== ui.rateDisplay) rates.value = ui.rateDisplay;
```

and in the change handler, beside the cloud-shadows branch:

```ts
  if (el.matches("[data-display=rates]")) {
    ui.rateDisplay = (el as unknown as HTMLSelectElement).value as RateDisplay;
    saveRateDisplay(ui.rateDisplay, localStorage);
    render();
    return;
  }
```

Add `rateDisplay: RateDisplay` to `UiState` where `cloudShadows` is declared, and its default beside the other ui defaults.

- [ ] **Step 8: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/ui/display-settings.ts src/ui/rate.ts src/ui/travel.ts src/main.ts index.html tests/rate.test.ts
git commit -m "feat(survidle): one component for a rate, read on either clock"
```

---

### Task 2: Covered wood, and the vedbod that raises it

**Files:**
- Modify: `src/sim/types.ts` (`StructureId`, `Site`), `src/sim/items.ts` (`STRUCTURES`, cover constants), `src/sim/camp.ts` (`coveredWoodKg`), `src/sim/fire.ts` (`dryWood`, `splitSheltered`), `src/sim/save.ts` (migration), `src/sim/capabilities.ts` (a row)
- Test: `tests/vedbod.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Site.woodsheds: number`; `COVER_M3`, `STACKED_KG_PER_M3`, `VEDBOD_M3` in `items.ts`; `coveredWoodKg(site: Site | null): number` and `woodOnHandKg(inv: Inventory): number` in `camp.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/vedbod.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { coveredWoodKg, woodOnHandKg } from "../src/sim/camp";
import { addItem, emptyInventory } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";

describe("covered wood", () => {
  it("an open camp covers nothing, and a roof covers what its dry space holds", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    expect(coveredWoodKg(site)).toBe(0);
    site.structures.leanTo = true;
    expect(coveredWoodKg(site)).toBe(175);
    site.structures.cabin = true;
    expect(coveredWoodKg(site)).toBe(875);
  });

  it("each vedbod adds its own stack, so cover is what stands added up", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const site = siteFor(regionState(state, world, state.player.region), regionState(state, world, state.player.region).campCell!);
    site.woodsheds = 2;
    expect(coveredWoodKg(site)).toBe(2100);
  });

  it("wood on hand counts the wet with the dry and the sticks at their weight, and leaves logs in the yard", () => {
    const inv = emptyInventory();
    addItem(inv, "firewood", 10);
    addItem(inv, "wetFirewood", 4);
    addItem(inv, "stick", 8);
    addItem(inv, "log", 3);
    expect(woodOnHandKg(inv)).toBe(18);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/vedbod.test.ts`
Expected: FAIL, `coveredWoodKg` is not exported.

- [ ] **Step 3: Add the type fields**

In `src/sim/types.ts`, extend `StructureId` with `"vedbod"` and add to `Site`, beside `racks`:

```ts
  /** Woodsheds standing here. Nothing caps the count: materials, labour, upkeep and the yard do. */
  woodsheds: number;
```

- [ ] **Step 4: Add the structure and the cover anchors**

In `src/sim/items.ts`, inside `STRUCTURES`:

```ts
  vedbod: { name: "vedbod", needs: [{ item: "log", qty: 6 }, { item: "stick", qty: 12 }, { item: "bark", qty: 20 }, { item: "cordage", qty: 3 }], minutes: 300, desc: "A roof on posts over an open stack. Holds 1,050 kg of firewood dry, and dries wet wood under it in any weather." },
```

and beside the other stores:

```ts
/** Air-dry birch, stacked: a stacked cubic metre weighs this much. */
export const STACKED_KG_PER_M3 = 350;
/**
 * Dry space each roof gives a woodstack, in stacked cubic metres. A lean-to
 * spares the strip beside the sleeper, a hut the wall behind the hearth, a
 * cabin a corner of the floor; a vedbod is nothing but the stack.
 */
export const COVER_M3: Partial<Record<StructureId, number>> = { leanTo: 0.5, turfHut: 1, cabin: 2, vedbod: 3 };
```

Add `vedbod` to `STRUCTURE_LIFE_DAYS` at the turf hut's 540 days, to `DECAYING`, to `MEND` as `{ needs: [{ item: "bark", qty: 20 }], minutes: 120 }`, and extend `DecayingId` in `types.ts` with `"vedbod"`.

- [ ] **Step 5: Write the readings in `src/sim/camp.ts`**

```ts
/** Firewood this camp can keep out of the rain: every roof that stands, and every vedbod, added up. */
export function coveredWoodKg(site: Site | null): number {
  if (!site) return 0;
  let m3 = 0;
  for (const id of Object.keys(COVER_M3) as StructureId[]) {
    if (id === "vedbod") m3 += COVER_M3.vedbod! * site.woodsheds;
    else if (site.structures[id as keyof Site["structures"]]) m3 += COVER_M3[id]!;
  }
  return m3 * STACKED_KG_PER_M3;
}

/**
 * Wood a stack holds, in kilos. Sticks count at their weight because they
 * stack and burn; logs do not, because a shed holds split wood and round
 * timber lies in the yard.
 */
export function woodOnHandKg(inv: Inventory): number {
  return qty(inv, "firewood") + qty(inv, "wetFirewood") + qty(inv, "stick") * ITEM_KG.stick;
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/vedbod.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Let the shed shelter and dry**

In `src/sim/fire.ts`, `splitSheltered` gains the shed, since it is a roof:

```ts
export function splitSheltered(state: GameState, world: World, at: number): boolean {
  const st = regionState(state, world, cellAt(world, at).region);
  const site = campSite(st);
  return at === st.campCell && (roofed(site) || (site?.woodsheds ?? 0) > 0);
}
```

and in `dryWood`, the shed joins the list that dries at 2 kg an hour whatever the weather:

```ts
    const sheltered = st.fire.lit || site?.structures.cabin || site?.structures.turfHut || (site?.woodsheds ?? 0) > 0;
```

- [ ] **Step 8: Migrate saves and complete the build**

In `src/sim/save.ts`, where sites are normalised, add `site.woodsheds ??= 0;`.
In `src/sim/tasks.ts`, in the build completion branch beside the rack's line:

```ts
          if (sid === "vedbod") site.woodsheds++;
```

Note the rack's own line sets `structures.dryingRack`; a vedbod has no boolean, only the count, so it must not be written into `site.structures`. Guard the generic `site.structures[sid] = true;` assignment with `if (sid !== "vedbod")`.

In `src/sim/capabilities.ts`, add a row for `build:vedbod` with `producer: false` and `limits: "the yard it stands on, and re-roofing in a year and a half"`.

- [ ] **Step 9: Add the shelter test**

Append to `tests/vedbod.test.ts`:

```ts
import { addItem as add, pile, qty } from "../src/sim/inventory";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { testAtmosphere, testRain } from "./weather-helpers";

describe("the vedbod as a roof", () => {
  it("dries wet firewood at the sheltered rate while it rains", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    add(pile(state, st.campCell!), "wetFirewood", 10);
    testRain(1);
    advance(state, world, 60);
    // Two kilos an hour, the rate a cabin or a lit fire gives, in the rain.
    expect(qty(pile(state, st.campCell!), "firewood")).toBeCloseTo(2, 4);
  });
});
```

- [ ] **Step 10: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass. If a save or camp-panel test fails on the new `woodsheds` field, give the fixture its `0` rather than making the field optional.

- [ ] **Step 11: Commit**

```bash
git add src/sim/types.ts src/sim/items.ts src/sim/camp.ts src/sim/fire.ts src/sim/save.ts src/sim/tasks.ts src/sim/capabilities.ts tests/vedbod.test.ts
git commit -m "feat(survidle): a roof over the woodstack, and what each roof covers"
```

---

### Task 3: Rain on the uncovered stack

**Files:**
- Modify: `src/sim/fire.ts` (`wetWood`), `src/sim/advance.ts` (call it beside `dryWood`), `src/sim/types.ts` (`RegionState.wettedKg`), `src/sim/camp.ts` (`dailyCamp` reports it), `src/sim/save.ts` (migration)
- Test: `tests/vedbod.test.ts` (append)

**Interfaces:**
- Consumes: `coveredWoodKg`, `woodOnHandKg` from Task 2.
- Produces: `RAIN_WET_KG_PER_HOUR` and `wetWood(state, world, dt, who)` in `fire.ts`; `RegionState.wettedKg: number`, the day's total for the log line.

- [ ] **Step 1: Write the failing test**

Append to `tests/vedbod.test.ts`:

```ts
describe("rain on the stack", () => {
  it("wets only the share over cover, at the outer layer's rate", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.leanTo = true;   // covers 175 kg
    add(pile(state, st.campCell!), "firewood", 178);
    testRain(1);
    advance(state, world, 60);
    // Three kilos stood out in the rain; one hour takes one kilo of it.
    expect(qty(pile(state, st.campCell!), "wetFirewood")).toBeCloseTo(1, 4);
  });

  it("leaves a covered stack alone, and leaves sticks alone", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    add(pile(state, st.campCell!), "firewood", 40);
    add(pile(state, st.campCell!), "stick", 20);
    testRain(1);
    advance(state, world, 120);
    expect(qty(pile(state, st.campCell!), "wetFirewood")).toBe(0);
    expect(qty(pile(state, st.campCell!), "stick")).toBe(20);
  });

  it("wets a field pile, which can have no cover at all", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const away = regionState(state, world, state.player.region).campCell! + 1;
    add(pile(state, away), "firewood", 30);
    testRain(1);
    advance(state, world, 60);
    expect(qty(pile(state, away), "wetFirewood")).toBeCloseTo(1, 4);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/vedbod.test.ts -t "rain on the stack"`
Expected: FAIL, the wet firewood stays at 0 because nothing wets it.

- [ ] **Step 3: Write the rule**

In `src/sim/fire.ts`, beside `dryWood`:

```ts
/**
 * Rain reaches the outer layer of a stack, and the outer layer is much the
 * same size whatever the stack, so this does not grow with the pile. What
 * it is bounded by is the wood standing out in the weather: cover keeps its
 * own share dry, and a pile out in the field has no cover to have.
 */
export const RAIN_WET_KG_PER_HOUR = 1;

export function wetWood(state: GameState, world: World, dt: number): void {
  for (const key of Object.keys(state.piles)) {
    const cell = Number(key);
    const inv = state.piles[cell];
    if (!inv || qty(inv, "firewood") <= TRACE_KG) continue;
    if (localWeather(state, world, cell).precip === "none") continue;
    const st = regionState(state, world, cellAt(world, cell).region);
    const covered = cell === st.campCell ? coveredWoodKg(campSite(st)) : 0;
    const exposed = Math.max(0, woodOnHandKg(inv) - covered);
    if (exposed <= TRACE_KG) continue;
    const wetted = Math.min(qty(inv, "firewood"), exposed, (RAIN_WET_KG_PER_HOUR / 60) * dt);
    if (wetted <= TRACE_KG) continue;
    removeItem(inv, "firewood", wetted);
    addItem(inv, "wetFirewood", wetted);
    st.wettedKg += wetted;
  }
}
```

Sticks are untouched: there is no wet stick, and a stick is joinery rather than fuel.

- [ ] **Step 4: Call it**

In `src/sim/advance.ts`, on the line that calls `dryWood`, call `wetWood(state, world, dt)` immediately after it. Drying first and wetting second means an hour of rain by a lit fire is a wash rather than a loss for the covered share, which is what a fire under a roof actually does.

Add `wettedKg: number` to `RegionState` in `types.ts`, `wettedKg: 0` to the fresh state in `src/sim/regionstate.ts`, and `st.wettedKg ??= 0;` to the migration in `save.ts`.

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/vedbod.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Say it once a day, not once a minute**

In `dailyCamp` in `src/sim/camp.ts`, at the end:

```ts
  // A cap that costs something has to say so, and the away report reads the
  // log: once a day with the day's total, never once a minute.
  if (st.wettedKg >= 1) log(state, `${fmtKg(st.wettedKg)} of firewood stood out in the rain and is wet through.`, "bad");
  st.wettedKg = 0;
```

- [ ] **Step 7: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass. Fire and wet-wood tests that assumed dry wood stays dry in rain are now wrong in their premise: give the fixture cover, or assert the new loss, rather than weakening the rule.

- [ ] **Step 8: Commit**

```bash
git add src/sim/fire.ts src/sim/advance.ts src/sim/types.ts src/sim/regionstate.ts src/sim/camp.ts src/sim/save.ts tests/vedbod.test.ts
git commit -m "feat(survidle): wood left out of the rain is what a roof is for"
```

---

### Task 4: The yard

**Files:**
- Create: `src/sim/yard.ts`
- Modify: `src/sim/types.ts` (`Site.yardM2`, `TaskId`), `src/sim/tasks.ts` (the build check, the widen task), `src/sim/save.ts` (migration)
- Test: `tests/yard.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1 to 3.
- Produces: `FOOTPRINT_M2`, `YARD_START_M2`, `yardUsed(site: Site): number`, `yardFree(site: Site): number`, `clearM2PerHour(terrain: Terrain, snowCm: number): number`, `widenMinutes(state, world, at, m2): number`.

- [ ] **Step 1: Write the failing test**

Create `tests/yard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { clearM2PerHour, FOOTPRINT_M2, YARD_START_M2, yardFree, yardUsed } from "../src/sim/yard";
import { siteCamp } from "./siting-helpers";

describe("the yard", () => {
  it("counts what stands on the ground and nothing that does not", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.firePit = true;      // 4
    site.structures.leanTo = true;       // 6
    site.structures.boughBed = true;     // inside the lean-to, no ground of its own
    site.racks = 2;                      // 4 each
    site.woodsheds = 1;                  // 6
    expect(yardUsed(site)).toBe(24);
    expect(yardFree(site)).toBe(YARD_START_M2 - 24);
  });

  it("reads its clearing rate off the fire site's own minutes", () => {
    // The fire site is 4 m2: 20 minutes on meadow, 30 under spruce, 60 on peat.
    expect(clearM2PerHour("meadow", 0)).toBe(12);
    expect(clearM2PerHour("spruce", 0)).toBe(8);
    expect(clearM2PerHour("bog", 0)).toBe(4);
  });

  it("blocks a build that does not fit and says how much ground it wants", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.yardM2 = FOOTPRINT_M2.cabin! - 1;
    const o = check(state, world, calendar(state.minute, state.startDoy), "build", "cabin");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("yard");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/yard.test.ts`
Expected: FAIL, cannot resolve `../src/sim/yard`.

- [ ] **Step 3: Write `src/sim/yard.ts`**

```ts
import { fireSiteMinutes } from "./fire";
import type { Site, StructureId, Terrain } from "./types";

/**
 * Ground each thing takes in the camp's yard. A bough bed is inside
 * something, snares are out on the heath, hanging meat is a use of the rack
 * rather than a thing on the ground, and a heap of timber waiting on a build
 * is not a kept store, so none of them is here.
 */
export const FOOTPRINT_M2: Partial<Record<StructureId, number>> = {
  firePit: 4, waterStore: 1, dryingRack: 4, leanTo: 6, vedbod: 6, snowShelter: 6, turfHut: 12, cabin: 25,
};

/** The patch a landing camp has: a fire site, a lean-to, a rack and a trough, with a little spare. */
export const YARD_START_M2 = 30;

/** The fire site's own square metres, the area its minutes buy. */
export const FIRE_SITE_M2 = 4;

export function yardUsed(site: Site): number {
  let m2 = 0;
  for (const id of Object.keys(FOOTPRINT_M2) as StructureId[]) {
    if (id === "vedbod") m2 += FOOTPRINT_M2.vedbod! * site.woodsheds;
    else if (id === "dryingRack") m2 += FOOTPRINT_M2.dryingRack! * site.racks;
    else if (site.structures[id as keyof Site["structures"]]) m2 += FOOTPRINT_M2[id]!;
  }
  return m2;
}

export function yardFree(site: Site): number {
  return Math.max(0, site.yardM2 - yardUsed(site));
}

/**
 * What an hour of clearing opens, read off the fire site rather than named
 * again here: the site is FIRE_SITE_M2 of ground, and fireSiteMinutes is
 * what this ground charges for it. Duff scraped back under spruce is half
 * the meadow's rate, peat a quarter of it, and deep snow the same as peat.
 */
export function clearM2PerHour(terrain: Terrain, snowCm: number): number {
  return (FIRE_SITE_M2 / fireSiteMinutes(terrain, snowCm)) * 60;
}
```

`fireSiteMinutes(terrain, snowCm)` is already exported from `fire.ts` and is
the only thing this file needs from it.

- [ ] **Step 4: Add the field and the migration**

`Site` gains, beside `woodsheds`:

```ts
  /** Cleared ground at this camp, in square metres; every structure standing here takes its share. */
  yardM2: number;
```

In `save.ts`, after the site is normalised:

```ts
  // A camp from before the yard keeps everything it built: the yard is at
  // least what stands on it, so no save is left holding an impossible camp.
  site.yardM2 ??= Math.max(YARD_START_M2, yardUsed(site));
```

New sites start at `YARD_START_M2` in `regionstate.ts`.

- [ ] **Step 5: Block the build that does not fit**

In `src/sim/tasks.ts`, in the `build` check after the snare and seep branches:

```ts
      const wants = FOOTPRINT_M2[sid] ?? 0;
      if (wants > 0 && site && yardFree(site) < wants) {
        return { ...o, ok: false, why: `needs ${wants} m2 of yard, ${Math.round(yardFree(site))} free` };
      }
```

- [ ] **Step 6: Add the widening task**

Add `"widenYard"` to `TaskId` in `types.ts`. In the `check` switch:

```ts
    case "widenYard": {
      const st2 = regionState(state, world, state.player.region);
      const rate = clearM2PerHour(cellAt(world, at).terrain, localWeather(state, world, at).snowCm);
      const o = opt({ group: "build", label: "Widen the yard", detail: `${WIDEN_M2} m2 of cleared ground, ${Math.round(rate)} m2 an hour on this ground`, duration: (WIDEN_M2 / rate) * 60, repeatable: true });
      if (st2.campCell === null) return { ...o, ok: false, why: "no camp here" };
      if (at !== st2.campCell) return { ...o, ok: false, why: "at camp" };
      return o;
    }
```

with `export const WIDEN_M2 = 10;` beside the task (fifty minutes on meadow, two and a half hours on peat), and in the perform switch:

```ts
    case "widenYard": {
      siteFor(st, st.campCell!).yardM2 += WIDEN_M2;
      log(state, `{You} {clear} another ${WIDEN_M2} square metres of yard.`, "good");
      return;
    }
```

`cellAt` and `localWeather` are already imported in `tasks.ts`; `buildMinutes`
reads the fire site's ground the same way on line 187.

- [ ] **Step 7: Test the migration, because an old camp must stay possible**

Append to `tests/yard.test.ts`:

```ts
describe("a camp from before the yard", () => {
  it("keeps everything it built, because its yard is at least what stands on it", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.cabin = true;
    site.structures.firePit = true;
    site.racks = 2;
    // What a save written before the field carries.
    delete (site as Partial<typeof site>).yardM2;
    const revived = JSON.parse(JSON.stringify({ ...state })) as typeof state;
    migrateSites(revived);
    const after = revived.regions[state.player.region].sites[st.campCell!];
    expect(after.yardM2).toBeGreaterThanOrEqual(yardUsed(after));
  });
});
```

Call whatever `save.ts` exports for its per-site normalisation; if that work is
inline in the load function rather than a named export, extract it to
`migrateSites(state)` and export it, since a rule this test has to reach is a
rule worth naming.

- [ ] **Step 8: Run the test**

Run: `npx vitest run tests/yard.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 10: Commit**

```bash
git add src/sim/yard.ts src/sim/types.ts src/sim/tasks.ts src/sim/save.ts src/sim/regionstate.ts tests/yard.test.ts
git commit -m "feat(survidle): a camp holds what its cleared ground holds"
```

---

### Task 5: The causes behind a rate

**Files:**
- Create: `src/sim/rates.ts`
- Modify: `src/sim/types.ts` (`StockGroupId`)
- Test: `tests/rates.test.ts`

**Interfaces:**
- Consumes: `coveredWoodKg`, `woodOnHandKg` (Task 2), `RAIN_WET_KG_PER_HOUR` (Task 3).
- Produces: `StockGroupId = "wood" | "food" | "water" | "pack"`; `interface StockCause { label: string; perHour: number; note?: string }`; `stockCauses(state, world, cal): Record<StockGroupId, StockCause[]>`; `TASK_YIELD: Partial<Record<TaskId, { item: ItemId; qty: (state, world) => number }>>`.

- [ ] **Step 1: Write the failing test**

Create `tests/rates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { stockCauses } from "../src/sim/rates";
import { regionState, siteFor } from "../src/sim/regionstate";
import { startTask } from "../src/sim/tasks";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const sum = (causes: { perHour: number }[]) => causes.reduce((a, c) => a + c.perHour, 0);

describe("the causes behind a rate", () => {
  it("a lit fire is a fall in the wood group, at the rate it actually burns", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    const fire = causes.find((c) => c.label === "fire");
    expect(fire).toBeDefined();
    expect(fire!.perHour).toBeLessThan(0);
  });

  it("splitting is a rise in the wood group, at the yield its own task declares", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "log", 2);
    startTask(state, world, calendar(state.minute, state.startDoy), "split");
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    expect(sum(causes)).toBeGreaterThan(0);
  });

  it("counts nothing for a task that declares no yield", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startTask(state, world, calendar(state.minute, state.startDoy), "rest");
    expect(stockCauses(state, world, calendar(state.minute, state.startDoy)).wood).toEqual([]);
  });

  it("the body is a fall in food and in water, whatever else is happening", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    advance(state, world, 10);
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy));
    expect(sum(causes.food)).toBeLessThan(0);
    expect(sum(causes.water)).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/rates.test.ts`
Expected: FAIL, cannot resolve `../src/sim/rates`.

- [ ] **Step 3: Write `src/sim/rates.ts`**

The file holds three things: the yield table, the cause type, and the assembler. The yield table declares only the wood tasks, and every other task contributes nothing rather than guessing.

```ts
/**
 * What the stocks are doing, as a list of signed causes rather than one
 * number. A player who reads "+0.33 kg/min" and cannot see the fire inside
 * it has been given a number to trust rather than a reading to use.
 *
 * Only causes the simulation can answer exactly are in here. A task with no
 * declared yield contributes nothing, and the panel says what it counted, so
 * the estimate is never a guess wearing a reading's clothes.
 */
export interface StockCause {
  label: string;
  /** Signed, in the group's own unit, per game hour. */
  perHour: number;
  /** The reading behind it, where one makes the number legible. */
  note?: string;
}

/** The tasks that declare what they make. Wood only: the group whose rate is worth projecting. */
export const TASK_YIELD: Partial<Record<TaskId, (state: GameState, world: World) => { kg: number }>> = {
  chop: (state, world) => ({ kg: 4 * ITEM_KG.log + chopSticks(state, world) * ITEM_KG.stick }),
  split: () => ({ kg: ITEM_KG.log }),
  splitWedges: () => ({ kg: ITEM_KG.log }),
  deadwood: () => ({ kg: DEADWOOD_KG }),
  sticks: () => ({ kg: 6 * ITEM_KG.stick }),
};

export function stockCauses(state: GameState, world: World, cal: Calendar): Record<StockGroupId, StockCause[]> {
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  const wood: StockCause[] = [];

  const it = state.intent;
  const yielder = it ? TASK_YIELD[it.task] : undefined;
  if (it && yielder) {
    const minutes = Math.max(1, it.total);
    wood.push({ label: TASK_WORDS[it.task] ?? it.task, perHour: (yielder(state, world).kg / minutes) * 60 });
  }

  if (st.fire.lit) {
    const ambient = localWeather(state, world, st.campCell ?? cellOf(state, world)).temperatureC;
    const burn = burnPerHour(state.weather, ambient, st);
    wood.push({ label: "fire", perHour: -burn, note: `${burn.toFixed(1)} kg/h at ${Math.round(ambient)} C` });
  }

  const campPile = pileAt(state, st.campCell);
  const exposed = Math.max(0, woodOnHandKg(campPile) - coveredWoodKg(site));
  if (exposed > 0 && localWeather(state, world, st.campCell ?? cellOf(state, world)).precip !== "none") {
    wood.push({ label: "rain on the open stack", perHour: -RAIN_WET_KG_PER_HOUR, note: `${Math.round(exposed)} kg stands out` });
  }

  // The burn the body has actually booked today, per hour of it. The ledger
  // is the one place that number lives, so reading it here cannot disagree
  // with what the year run and the journal print.
  const led = today(state);
  const hoursToday = Math.max(1 / 60, (state.minute % 1440) / 60);
  const burnedToday = led.burn.base + led.burn.activity + led.burn.walk + led.burn.cold + led.burn.sick;
  const kcalPerHour = burnedToday / hoursToday;
  const food: StockCause[] = [{ label: "the body", perHour: -kcalPerHour / kcalPerPersonDay(state), note: `${Math.round(kcalPerHour * 24)} kcal a day` }];

  const felt = feltTemperature(state, world, localWeather(state, world, cellOf(state, world)).temperatureC);
  const water: StockCause[] = [{ label: "the body", perHour: -waterLossPerHour(state, felt) }];

  return { wood, food, water, pack: [] };
}
```

Three readings are borrowed rather than recomputed, and that is the point:
`today(state)` from `src/sim/ledger.ts` is where the burn is already booked,
`waterLossPerHour(state, felt)` from `src/sim/water.ts` is the litres the body
is losing this minute, and `feltTemperature` from `src/sim/player.ts` is what
that rate reads. Two burn figures that can disagree is the failure being
avoided here.

`kcalPerPersonDay(state)` converts the food group into person-days: the
survivor's own daily burn, `kcalPerHour * 24`, floored at a sane day so a
sleeping survivor does not make the larder read as a year. Define it in this
file and export it, because Task 6 needs the same divisor for the held figure
and the two must agree.

`TASK_WORDS` is a small `Partial<Record<TaskId, string>>` in this file, naming
only the five tasks in `TASK_YIELD`: "felling", "splitting", "splitting",
"gathering dead wood", "gathering sticks".

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/rates.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/sim/rates.ts src/sim/types.ts tests/rates.test.ts
git commit -m "feat(survidle): a rate as the causes it is made of"
```

---

### Task 6: The group table

**Files:**
- Create: `src/ui/stocks.ts`
- Test: `tests/stocks.test.ts`

**Interfaces:**
- Consumes: `StockGroupId` (Task 5), `coveredWoodKg` and `woodOnHandKg` (Task 2), `campWaterCapacity` from `src/sim/water.ts`, `PACK_COMFORTABLE_KG` from `src/units.ts`.
- Produces: `interface StockGroup { id: StockGroupId; label: string; members: ItemId[]; unit: "kg" | "l" | "days" }`, `GROUPS: StockGroup[]`, `groupHeld(state, world, g): number`, `groupCap(state, world, g): number | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/stocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ITEM_KG } from "../src/sim/items";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { GROUPS, groupCap, groupHeld } from "../src/ui/stocks";
import { siteCamp } from "./siting-helpers";

describe("the group table", () => {
  it("names only what it surfaces, so a new item changes nothing", () => {
    const named = new Set(GROUPS.flatMap((g) => g.members));
    expect(named.has("firewood")).toBe(true);
    // Most of the item list is deliberately not on the toolbar.
    expect((Object.keys(ITEM_KG) as ItemId[]).some((id) => !named.has(id))).toBe(true);
  });

  it("adds a group's members up in the camp's own pile", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    addItem(pile(state, st.campCell!), "stick", 4);
    const wood = GROUPS.find((g) => g.id === "wood")!;
    expect(groupHeld(state, world, wood)).toBe(14);
  });

  it("reads the wood cap off what stands, and gives the food group no cap", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    expect(groupCap(state, world, GROUPS.find((g) => g.id === "wood")!)).toBe(1050);
    expect(groupCap(state, world, GROUPS.find((g) => g.id === "food")!)).toBeNull();
  });
});
```

`items.ts` exports no `ITEM_IDS`, so the test reads
`Object.keys(ITEM_KG) as ItemId[]`; import `ITEM_KG` rather than adding an
export to `items.ts` for a test's sake.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/stocks.test.ts`
Expected: FAIL, cannot resolve `../src/ui/stocks`.

- [ ] **Step 3: Write `src/ui/stocks.ts`**

```ts
/**
 * What the toolbar shows, and nothing about how it looks.
 *
 * An item no group names simply does not appear, so adding one to items.ts
 * can never break the bar and promoting one to it is a line in this table.
 * The caps here are the simulation's own: the roofs a camp has raised, the
 * litres its vessels hold, the kilos a back can carry. None is invented.
 */
export interface StockGroup {
  id: StockGroupId;
  label: string;
  members: ItemId[];
  unit: "kg" | "l" | "days";
}

export const GROUPS: StockGroup[] = [
  { id: "wood", label: "Wood", members: ["firewood", "wetFirewood", "stick", "log"], unit: "kg" },
  { id: "food", label: "Food", members: FOOD_IDS, unit: "days" },
  { id: "water", label: "Water", members: ["water", "ice"], unit: "l" },
  { id: "pack", label: "Pack", members: [], unit: "kg" },
];
```

`FOOD_IDS` is `Object.keys(FOODS) as FoodId[]`, taken from the `FOODS` table
in `items.ts`, so a new food joins the group by being a food.

```ts
/** What the camp holds of a group, in the group's own unit. */
export function groupHeld(state: GameState, world: World, g: StockGroup): number {
  const st = regionState(state, world, state.player.region);
  const inv = pileAt(state, st.campCell);
  if (g.id === "pack") return weight(state.player.pack);
  if (g.id === "wood") return woodOnHandKg(inv);
  if (g.id === "water") return qty(inv, "water") + qty(inv, "ice");
  // Food is person-days rather than kilos, because a kilo of fat and a kilo
  // of berries are not the same larder. The divisor is the survivor's own
  // burn, the one Task 5 reads off the ledger.
  let kcal = 0;
  for (const item of g.members) kcal += qty(inv, item) * (FOODS[item as FoodId]?.kcalPerKg ?? 0);
  return kcal / kcalPerPersonDay(state);
}

/** The cap, where the simulation has a real one, and null where it has none. */
export function groupCap(state: GameState, world: World, g: StockGroup): number | null {
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  if (g.id === "wood") return coveredWoodKg(site);
  if (g.id === "water") return campWaterCapacity(pileAt(state, st.campCell), site);
  if (g.id === "pack") return PACK_COMFORTABLE_KG;
  return null;
}

/** Why a group is at its cap, and the one thing that raises it. Empty when it is not. */
export function capReason(state: GameState, world: World, g: StockGroup): string {
  const cap = groupCap(state, world, g);
  if (cap === null || groupHeld(state, world, g) < cap) return "";
  if (g.id === "wood") return "over cover it takes the rain; a vedbod holds 1,050 kg more";
  if (g.id === "water") return "the vessels are full; a water trough holds 20 l more";
  return "the pack is at what a back carries comfortably";
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/stocks.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the suite and the build, then commit**

```bash
npm test && npm run build
git add src/ui/stocks.ts tests/stocks.test.ts
git commit -m "feat(survidle): the groups the toolbar reads, and their real caps"
```

---

### Task 7: The toolbar

**Files:**
- Modify: `index.html` (the `#stocks` strip), `src/style.css`, `src/main.ts` (render), `src/ui/stocks.ts` (`stocksHtml`)
- Test: `tests/stocks.test.ts` (append), `tests/churn.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1, 5 and 6.
- Produces: `stocksHtml(state, world, cal, ui): string`.

- [ ] **Step 1: Write the failing test**

Append to `tests/stocks.test.ts`:

```ts
describe("the toolbar", () => {
  it("says each group's held figure, and its cap only where one is real", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    siteFor(st, st.campCell!).woodsheds = 1;
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    expect(html).toContain("Wood");
    expect(html).toContain("12");
    expect(html).toContain("1050");
    expect(html).toContain("Food");
  });

  it("writes no width into the markup, because bars.ts owns widths", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    expect(html).not.toContain("width:");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/stocks.test.ts -t "the toolbar"`
Expected: FAIL, `stocksHtml` is not exported.

- [ ] **Step 3: Write `stocksHtml`**

```ts
/** A group's held figure in its own unit, with no false precision on a rate's worth of digits. */
function held(value: number, unit: StockGroup["unit"]): string {
  if (unit === "days") return `${value.toFixed(1)} days`;
  if (unit === "l") return `${value.toFixed(1)} l`;
  return value >= 10 ? `${Math.round(value)} kg` : `${value.toFixed(1)} kg`;
}

/**
 * The strip across the top: what the camp holds, what it can hold, and
 * which way each is going. One string, so setPanel morphs it and a still
 * minute rewrites nothing.
 */
export function stocksHtml(state: GameState, world: World, cal: Calendar, ui: Pick<UiState, "rateDisplay">): string {
  const causes = stockCauses(state, world, cal);
  const cells = GROUPS.map((g) => {
    const cap = groupCap(state, world, g);
    const amount = held(groupHeld(state, world, g), g.unit);
    const of = cap === null ? "" : ` <span class="dim">of ${held(cap, g.unit)}</span>`;
    const perHour = causes[g.id].reduce((a, c) => a + c.perHour, 0);
    const rate = formatRate(perHour, g.unit === "days" ? "days" : g.unit, ui.rateDisplay);
    const sign = perHour > 0 ? "good" : perHour < 0 ? "bad" : "dim";
    return `<button type="button" class="stock" data-stock="${g.id}" aria-expanded="false"><span class="lbl">${esc(g.label)}</span> <b>${amount}</b>${of} <span class="${sign}">${esc(rate)}</span></button>`;
  }).join("");
  return cells;
}
```

The cell is a `button` so it is reachable by keyboard and tappable on a phone
without a second code path; `data-stock` is what Task 8 hangs the panel off.
The signature takes a narrow `Pick` rather than the whole `UiState` so a test
can call it with an object literal.

- [ ] **Step 4: Put the strip on the page**

In `index.html`, immediately before `<div id="app">`:

```html
    <!-- Stocks span the page above the columns: what the camp holds, what it
         can hold, and which way each is moving. The map's own inventory strip
         answers a different question and stays where it is. -->
    <div id="stocks"></div>
```

In `src/main.ts`, in the render pass beside the other `setPanel` calls:

```ts
  setPanel("stocks", stocksHtml(state, world, cal, ui));
```

- [ ] **Step 5: Style it**

In `src/style.css`, after the `#mapinventory` block: a flex row, `gap`, the same panel background and border as the columns, group cells that do not wrap their own label, and at `max-width: 480px` a wrap to two rows. Follow the variables already in the file (`--dim`, `--text`) and add no new colour.

- [ ] **Step 6: Add the churn assertion**

In `tests/churn.test.ts`, add `stocks` to whatever list of panel ids the file already walks, so a still minute rewrites nothing. If the file tests panels by calling their html functions twice and comparing, do the same for `stocksHtml`.

- [ ] **Step 7: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add index.html src/style.css src/main.ts src/ui/stocks.ts tests/stocks.test.ts tests/churn.test.ts
git commit -m "feat(survidle): a strip across the top for what the camp holds"
```

---

### Task 8: The expanded panel, the stand, and what is coming

**Files:**
- Modify: `src/ui/stocks.ts`, `src/style.css`, `src/main.ts` (open and close on hover, focus and tap)
- Test: `tests/stocks.test.ts` (append)

**Interfaces:**
- Consumes: Task 7; `woodPatchLeft`, `woodPatchFull` and `woodLeft` from `src/sim/stocks.ts`.
- Produces: `stockPanelHtml(state, world, cal, ui, group: StockGroupId): string`; `UiState.stockOpen: StockGroupId | null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/stocks.test.ts`:

```ts
describe("the expanded group", () => {
  it("lists the members, the causes, and what the stand has left", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    addItem(pile(state, st.campCell!), "stick", 4);
    const html = stockPanelHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" }, "wood");
    expect(html).toContain("firewood");
    expect(html).toContain("sticks");
    expect(html).toContain("this patch");
  });

  it("says what the work in hand has not banked yet", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "log", 1);
    startTask(state, world, calendar(state.minute, state.startDoy), "split");
    const html = stockPanelHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" }, "wood");
    expect(html).toContain("coming");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/stocks.test.ts -t "the expanded group"`
Expected: FAIL, `stockPanelHtml` is not exported.

- [ ] **Step 3: Write `stockPanelHtml`**

```ts
/**
 * One group, opened. The members it is made of, the signed causes behind
 * its rate, what the work in hand has not banked yet, and - for wood - the
 * stand the store is coming out of.
 *
 * The last line names what the sum counted, because a projection that does
 * not say what it left out is a number to trust rather than a reading to use.
 */
export function stockPanelHtml(state: GameState, world: World, cal: Calendar, ui: Pick<UiState, "rateDisplay">, id: StockGroupId): string {
  const g = GROUPS.find((x) => x.id === id)!;
  const st = regionState(state, world, state.player.region);
  const inv = pileAt(state, st.campCell);

  const members = g.members
    .filter((item) => qty(inv, item) > TRACE_KG)
    .map((item) => esc(itemLabel(item, qty(inv, item))))
    .join(", ");

  const causes = stockCauses(state, world, cal)[id];
  const unit = g.unit === "days" ? "days" : g.unit;
  const rows = causes
    .map((c) => `<div class="cause"><span>${esc(c.label)}</span><span>${esc(formatRate(c.perHour, unit, ui.rateDisplay))}</span>${c.note ? `<small class="dim">${esc(c.note)}</small>` : ""}</div>`)
    .join("");
  const sum = causes.reduce((a, c) => a + c.perHour, 0);

  // What the work in hand will bank when it ends: the task's own yield less
  // the share of it already run. Felling banks four logs at the end of an
  // hour, so this is the task bar read in kilograms.
  const it = state.intent;
  const yielder = it && id === "wood" ? TASK_YIELD[it.task] : undefined;
  const left = it && yielder ? yielder(state, world).kg * (1 - Math.min(1, it.done / Math.max(1, it.total))) : 0;
  const coming = left > TRACE_KG ? `<div class="dim">${esc(fmtKg(left))} coming from the work in hand</div>` : "";

  // Felling draws one patch down and succeeds the ground to a clearing when
  // it is empty. The store going up and the stand going down are one act.
  const here = cellOf(state, world);
  const stand = id === "wood"
    ? `<div class="dim">this patch: ${Math.round(woodPatchLeft(st, world, here))} stems left of ${Math.round(woodPatchFull(world, here))}. This region: ${Math.round(woodLeft(st, world, state.player.region))}.</div>`
    : "";

  const reason = capReason(state, world, g);
  const at = reason ? `<div class="bad">at its cap: ${esc(reason)}</div>` : "";

  return `<div class="stockpanel" data-stockpanel="${id}">
<div><b>${esc(g.label)}</b> ${members ? esc(members) : '<span class="dim">nothing here</span>'}</div>
${at}${rows}
<div class="sum"><b>${esc(formatRate(sum, unit, ui.rateDisplay))}</b></div>
${coming}${stand}
<small class="dim">Counts the work in hand, the fire, the producers, the body and the weather. Nothing else.</small>
</div>`;
}
```

`it.done` and `it.total` are the intent's own progress fields; use whatever
the activity strip in `panels.ts` already reads for the task bar rather than
new ones.

- [ ] **Step 4: Open and close it**

`UiState.stockOpen: StockGroupId | null`, defaulting to `null`. In `main.ts`, a `pointerover` and `focusin` on `[data-stock]` sets it, `pointerout` and `focusout` clear it, and a `click` toggles it so a phone can tap. Follow the map tip's existing pattern: one element that is shown and hidden rather than created and destroyed.

- [ ] **Step 5: Run the suite and the build, then commit**

```bash
npm test && npm run build
git add src/ui/stocks.ts src/style.css src/main.ts tests/stocks.test.ts
git commit -m "feat(survidle): open a group and read what is inside the number"
```

---

### Task 9: The camp sheet

**Files:**
- Modify: `src/ui/panels.ts` (`campHtml`)
- Test: `tests/campbox.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1 to 6.
- Produces: nothing new; `campHtml` gains store lines, producer rates and the yard line.

- [ ] **Step 1: Write the failing test**

Append to `tests/campbox.test.ts`:

```ts
describe("the camp sheet", () => {
  it("says the woodpile against its cover, and what is lossy about it", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    addItem(pile(state, st.campCell!), "firewood", 30);
    const html = campHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("1050");
    expect(html).toContain("30");
  });

  it("says the yard, used against cleared", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).toContain("m2");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/campbox.test.ts -t "the camp sheet"`
Expected: FAIL on the missing cover and yard text.

- [ ] **Step 3: Re-lay `campHtml`**

Keep every line it already has and add three, after the existing rack and
water lines:

```ts
  // A store line says what it holds, what it can hold, and what it loses,
  // because every cap here is lossy rather than merely full.
  const woodKg = woodOnHandKg(campPile);
  const covered = coveredWoodKg(site);
  const exposed = Math.max(0, woodKg - covered);
  const wood = woodKg > 0 || covered > 0
    ? `<div>wood: ${fmtKg(woodKg)} of ${fmtKg(covered)} covered${exposed > 0 ? `, <span class="bad">${fmtKg(exposed)} out in the weather</span>` : ""}</div>`
    : "";

  const yard = site ? `<div>yard: ${Math.round(yardUsed(site))} of ${Math.round(site.yardM2)} m2</div>` : "";
```

and give each producer already listed from `PRODUCERS` its rate through the
same `formatRate` component the toolbar uses, so the two cannot read
differently. Insert `${wood}` after `${rack}` and `${yard}` after `${heap}` in
the returned string.

- [ ] **Step 4: Run the suite and the build, then commit**

```bash
npm test && npm run build
git add src/ui/panels.ts tests/campbox.test.ts
git commit -m "feat(survidle): the camp sheet reads its stores and its producers"
```

---

### Task 10: A planned build says what it is waiting for

**Files:**
- Modify: `src/sim/orders.ts` or `src/sim/tasks.ts` (whichever places an order), `src/ui/panels.ts` (`campHtml`)
- Test: `tests/yard.test.ts` (append)

**Interfaces:**
- Consumes: Task 4's yard blocker text.
- Produces: `Site.build[sid]` created at order placement rather than at task start.

- [ ] **Step 1: Write the failing test**

Append to `tests/yard.test.ts`:

```ts
describe("a planned build", () => {
  it("stands on the camp sheet with its blockers before any work is done", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    orderByHand(state, world, cal, new Rng(1), { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: regionState(state, world, state.player.region).campCell! } }, "job");
    const html = campHtml(state, world, cal);
    expect(html).toContain("vedbod");
    expect(html).toContain("planned");
    expect(html).toContain("logs");
  });
});
```

Match `orderByHand`'s real signature as `src/main.ts` calls it; copy that call rather than inventing arguments.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/yard.test.ts -t "a planned build"`
Expected: FAIL, the camp sheet says nothing about a build nobody has started.

- [ ] **Step 3: Create the entry at placement**

Where a build order is placed, before it is queued:

```ts
  // A build the player has asked for is a thing the camp is waiting on, not
  // a row in a list. Writing the site entry at placement rather than at the
  // first minute of work is what lets the camp sheet say so, and it is what
  // a heir inherits: the predecessor's intent, with the ground it wanted.
  if (req.task === "build" && req.arg && FOOTPRINT_M2[req.arg as StructureId] !== undefined) {
    const st = regionState(state, world, state.player.region);
    if (st.campCell !== null) {
      const site = siteFor(st, st.campCell);
      site.build[req.arg as StructureId] ??= 0;
    }
  }
```

`Site.build` already keeps progress between visits, so the only change is when
the entry appears. Guard every existing reader of `site.build` that treated a
present entry as "work has started": a zero now means planned. The list in
`campHtml` is built from `Object.keys(site.build)` and already filters on
`> 0`; widen that filter to `>= 0` and split the wording:

```ts
  const planned = site
    ? (Object.keys(site.build) as StructureId[]).map((k) => {
        const done = site.build[k] ?? 0;
        const total = buildMinutes(state, world, k, st.campCell!);
        const short = shortOf([campPile, state.player.pack], STRUCTURES[k].needs);
        const wants = FOOTPRINT_M2[k] ?? 0;
        const noRoom = wants > 0 && yardFree(site) < wants ? `${wants} m2 of yard, ${Math.round(yardFree(site))} free` : "";
        const blockers = [...short.map((n) => `${n.qty} ${ITEM_NAMES[n.item]}`), noRoom].filter(Boolean).join(", ");
        const state_ = done > 0 ? `${Math.round((done / total) * 100)}% built` : "planned";
        return `${STRUCTURES[k].name}, ${state_}${blockers ? `: needs ${blockers}` : ""}`;
      })
    : [];
```

and use `planned` where `unfinished` is used today.

- [ ] **Step 4: Run the suite and the build, then commit**

```bash
npm test && npm run build
git add src/sim/tasks.ts src/sim/orders.ts src/ui/panels.ts tests/yard.test.ts
git commit -m "feat(survidle): a build that is only planned still says what it wants"
```

---

### Task 11: The caps say what they did while you were away

**Files:**
- Modify: `src/sim/camp.ts` (`dailyCamp`, `stepCamp`)
- Test: `tests/away-caps.test.ts`

**Interfaces:**
- Consumes: Task 3's daily wetted line.
- Produces: log lines at the cap moments, which the away panel already reads.

- [ ] **Step 1: Write the failing test**

Create `tests/away-caps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

describe("caps that cost something say so", () => {
  it("a full rack is a line in the log, once, not once a minute", () => {
    testAtmosphere();
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.dryingRack = true;
    site.racks = 1;
    st.rack.kg = 40;
    addItem(pile(state, st.campCell!), "rawMeat", 20);
    advance(state, world, 2 * 1440);
    const lines = state.log.filter((e) => e.text.includes("rack"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/away-caps.test.ts`
Expected: FAIL, nothing says the rack is full.

- [ ] **Step 3: Write the lines**

In `dailyCamp`, beside the wetted line from Task 3:

```ts
  // Caps here lose rather than merely fill, and the away report reads the
  // log, so a cap that cost something says so once a day. Never in stepCamp:
  // a line a minute is not a report, it is noise.
  const site = campSite(st);
  const campPile = pileAt(state, st.campCell);
  if (site?.structures.dryingRack && st.rack.kg >= rackCapacity(site) - TRACE_KG && qty(campPile, "rawMeat") > 0) {
    log(state, `The rack is full, and ${fmtKg(qty(campPile, "rawMeat"))} of raw meat waits its turn.`, "bad");
  }
  if (qty(campPile, "ice") > 0 && !st.fire.lit) {
    log(state, `${qty(campPile, "ice").toFixed(1)} l of water froze in the vessels.`, "bad");
  }
  if (st.snareCatch.count > 0 && st.snareCatch.age >= SNARE_CATCH_MAX_AGE) {
    log(state, "The snares have not been checked, and what they caught is gone.", "bad");
  }
```

Match `st.snareCatch`'s real field names as `campHtml` and `stepCamp` read
them; if the age is kept elsewhere, read it from there rather than adding a
second clock.

The away panel needs no change: `catchUp` marks every entry written while the tab was closed, and `awayHtml` already prints them.

- [ ] **Step 4: Run the suite and the build, then commit**

```bash
npm test && npm run build
git add src/sim/camp.ts tests/away-caps.test.ts
git commit -m "feat(survidle): a cap that cost something says so, once a day"
```

---

### Task 12: The browser pass, the gate reading, and the docs

**Files:**
- Modify: `docs/README.md`, `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (item P's status and the log-rot line)

**Interfaces:** none.

- [ ] **Step 1: Read the winter gate before judging it**

Run: `npm run year -- --winter`
Record every seed's outcome verbatim in the commit message for the docs. This is the reading for the re-wetting rule. If it has moved, that is a reading about a rule the simulation was missing, not a reason to weaken the rule: gates measure the sim.

- [ ] **Step 2: Browser pass at 1440 by 900**

Run `npm run dev`, open `http://127.0.0.1:5173/prototypes/08/`, and check against `docs/ux.md`: the strip spans the page above the columns, the four groups read, hovering one opens its panel with members, causes and the stand, the units setting swaps both readings, and the map's own inventory strip is untouched. Stop the server when done.

- [ ] **Step 3: Browser pass at 390 wide**

The same run at 390: the groups wrap to two rows, the panel opens on a tap, and nothing scrolls sideways.

- [ ] **Step 4: Write the docs**

In `docs/README.md`: a bullet under "How it plays" for the stocks strip and the units setting; the vedbod in the Camp bullet with its capacity and what it dries; the yard in the Camp bullet with its clearing rate; and in "Where the numbers live", `src/sim/rates.ts`, `src/sim/yard.ts` and `src/ui/stocks.ts`.

In the roadmap, mark item P parts 3 and the taken half of part 2 as built, and add the log-rot line from the spec's section 9 as its own roadmap item.

- [ ] **Step 5: Commit**

```bash
git add docs/README.md docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the stocks strip, the vedbod and the yard"
```

- [ ] **Step 6: Report**

Report to the user: what was built, the winter gate reading before and after, what the browser pass showed, and what to play to judge it - a spring camp with no roof through a wet week, watching the wood group; then a vedbod, and the same week again.
