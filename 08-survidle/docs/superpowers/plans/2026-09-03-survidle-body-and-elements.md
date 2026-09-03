# Survidle Body and Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the body water, ice to fall through, clothing that gets wet and feet that freeze, wood that will not burn, smoke that kills a sleeper, storms, and exhaustion that ruins the work, so that surviving alone is as hard as the north is.

**Architecture:** One mechanic per module: `water.ts` (reserve, drinking, vessels, melting), `clothing.ts` (per-garment wetness, drying, frostbite), `fire.ts` (wet wood, weather on the fire, spread, smoke), `hazards.ts` (the hourly rolls that need an rng), with `ice` in `weather.ts` and `route.ts`. `stepPlayer`, `stepCamp` and `hourlyEvents` compose them; warmth stays the single integrator, every mechanic contributing a felt-temperature term or a health drain. The runner in `body.ts` gains four behaviours and never more.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom, already configured. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-body-and-elements-design.md`. Read it first; every number below comes from it. Roadmap: `2026-09-03-survidle-realism-roadmap.md`.

## Global Constraints

- Every quantity is real: litres, kilograms, degrees Celsius, minutes, kilometres, percent. No abstract points.
- Every new harm has a log warning before it and a named death: `thirst`, `smoke`, `drowned` join `DeathCause`.
- The runner never plans around a new threat beyond spec section 5: shelter from a storm, bank the fire when leaving camp, drink when thirsty, head home before dark in winter. It never gathers, never refuses an intent.
- Build on the committed tree. Another session's torch work (`Player.torch`, `lightTorch`, `firelit`) is in flight on this branch; start this plan after it is committed, and if `git status` shows uncommitted files in `08-survidle/src` that are not yours, stop and report.
- All work is in `08-survidle/`. Run `npm test`, `npx tsc --noEmit` and `npm run build` there before every commit; biome is not installed in the worktree, run `../../../../node_modules/.bin/biome lint src tests` from `08-survidle/`. Stage with explicit paths, never `git add -A`.
- Every commit message ends with these two trailer lines:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TGFWX8xrXdeUmKMgAdy5rB`
- Writing style in code, comments, log lines and docs: no em dashes, no unicode arrows or fancy quotes; only characters typable on a keyboard. Comments explain, never chronicle. Log lines are short, plain, second person.
- Keep `npm test` under a few seconds. Long scenarios run through `advance` in one call where the assertion allows.
- Most seeds start with the camp cell on forest terrain; seeds 17 (bog camp) and 19 (meadow camp) have the forest 0.6 km away. Seed 42's region has a shore spot. Name the seed's reason in any test that depends on it.

---

## File map

| file | responsibility |
|------|----------------|
| `src/sim/types.ts` | new fields on `Player`, `Garment`, `Tool`, `Weather`, `RegionState`; new `TaskId`, `ToolId`, `RecipeId`, `ItemId` members; `DeathCause` additions |
| `src/sim/newgame.ts`, `src/sim/save.ts`, `src/sim/regionstate.ts` | starting values and `fillDefaults` for every new field |
| `src/sim/water.ts` (new) | `WATER_FULL`, loss rates, `stepWater`, `waterSource`, `drink`, `fillVessels`, `autoDrink`, vessel freezing |
| `src/sim/clothing.ts` (new) | garment materials, `stepGarments`, `wetFactor`, `coldFeet`, `coldHands`, frostbite timers and effects |
| `src/sim/fire.ts` (new) | wet wood, `fireWarms`, weather on lighting and burning, `bankFire`, spread, smoke |
| `src/sim/hazards.ts` (new) | the hourly rolls: frostbite, vessel freezing, spread, ice under foot; called from `hourlyEvents` |
| `src/sim/weather.ts` | ice thickness, dry days, storms in the daily roll and `stepWeather` |
| `src/world/route.ts` | `IceMode`, water passable over ice |
| `src/sim/player.ts` | composes the modules in `feltTemperature`, `stepPlayer`, `workSpeed`, `baseWalkSpeed`; `Drains` and `causeFrom` |
| `src/sim/tasks.ts` | `melt`, `thaw`, `lightIndoors`; `light` in rain; `split` wet yield; `chop` and `fish` in a storm; ice in `walkTarget` and `stepWalk` |
| `src/sim/skills.ts` | exhaustion and frostbite in `oddsFactor`, `craftSuccess` |
| `src/sim/camp.ts` | wet wood drying, fire burn with wet fuel, `logsWet`, `unattended`, smoke level |
| `src/sim/events.ts` | calls `hourlyHazards` |
| `src/sim/advance.ts` | `autoDrink`, storm warning and forcing |
| `src/sim/body.ts`, `src/sim/intent.ts` | thirsty, storm and home needs; banking the fire in `walkTo` |
| `src/sim/items.ts` | vessels in `TOOLS`, two recipes, `wetFirewood`, garment materials |
| `src/ui/bars.ts`, `src/ui/panels.ts`, `src/ui/map.ts`, `src/main.ts`, `src/style.css` | water bar, garment wet bars and cold tags, split fuel bar, clock storm and ice, ice glyph, thin-ice button, drink and fill buttons, auto-drink toggle |
| `tests/water.test.ts`, `tests/clothing.test.ts`, `tests/fire.test.ts`, `tests/ice.test.ts`, `tests/storm.test.ts` (new); `tests/player.test.ts`, `tests/weather.test.ts`, `tests/body.test.ts`, `tests/ui.test.ts`, `tests/advance-save.test.ts` | as named per task |
| `docs/README.md` | the new dangers |

---

### Task 1: State, starting values and save defaults

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/newgame.ts`, `src/sim/save.ts`, `src/sim/regionstate.ts`, `src/sim/player.ts` (`die`), `src/sim/items.ts` (`CLOTHING` materials)
- Test: `tests/advance-save.test.ts`, `tests/weather.test.ts` (the `w()` helper)

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export type ToolId = "axe" | "knife" | "bow" | "fishingSpear" | "fireDrill" | "needle" | "barkBucket" | "waterskin";
  export interface Tool { id: ToolId; durability: number; /** water carried, vessels only */ litres?: number; frozen?: boolean }
  export interface Garment { id: ClothingId; durability: number; /** 0 dry to 100 soaked */ wet?: number }
  export type CountItem = ... (unchanged); export type KgItem = ... | "wetFirewood";
  export type TaskId = ... | "melt" | "thaw" | "lightIndoors";
  export type RecipeId = ... | "barkBucket" | "waterskin";
  export type DeathCause = "starved" | "froze" | "wolves" | "sickness" | "thirst" | "smoke" | "drowned";
  // Player gains:
  water: number; autoDrink: boolean; frostbite: { feet: number; hands: number }; toes: boolean; fingers: boolean;
  // Weather gains:
  storm: { from: number; until: number; warned: boolean } | null; dryDays: number; wetDay: boolean; iceCm: number;
  // RegionState gains:
  fire: { lit: boolean; fuelKg: number; wetKg: number; indoors: boolean; unattended: number };
  smoke: number; logsWet: number; structures.hearth: boolean;
  ```
- `CLOTHING` entries gain `material: "wool" | "hide"` (leather boots count as hide).
- Task ids `melt`, `thaw`, `lightIndoors` need arms in every exhaustive switch (`checkFresh`, `complete`, `activityOf`, `CAMP_TASKS`); this task adds placeholder arms that return a not-ok option ("not yet") so tsc passes; Tasks 3 and 8 replace them.

- [ ] **Step 1: Write the failing tests**

In `tests/advance-save.test.ts`, extend "round-trips the whole state" (or add beside it):

```ts
  it("a new game starts with the new body fields, and an old save gets them filled", () => {
    const { state } = newGame(8);
    expect(state.player.water).toBe(2.5);
    expect(state.player.autoDrink).toBe(true);
    expect(state.player.frostbite).toEqual({ feet: 0, hands: 0 });
    expect(state.weather.iceCm).toBe(0);
    expect(state.weather.storm).toBeNull();
    const st = state.regions[state.player.region];
    expect(st.fire).toEqual({ lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0 });
    expect(st.smoke).toBe(0);
    expect(st.structures.hearth).toBe(false);
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.water;
    delete raw.state.player.frostbite;
    delete raw.state.weather.iceCm;
    delete raw.state.weather.storm;
    delete raw.state.regions[state.player.region].fire.wetKg;
    delete raw.state.regions[state.player.region].smoke;
    delete raw.state.regions[state.player.region].structures.hearth;
    const back = deserialize(JSON.stringify(raw))!.state;
    expect(back.player.water).toBe(2.5);
    expect(back.player.frostbite).toEqual({ feet: 0, hands: 0 });
    expect(back.weather.iceCm).toBe(0);
    expect(back.weather.storm).toBeNull();
    expect(back.regions[state.player.region].fire.wetKg).toBe(0);
    expect(back.regions[state.player.region].smoke).toBe(0);
    expect(back.regions[state.player.region].structures.hearth).toBe(false);
  });
```

In `tests/weather.test.ts`, the helper becomes:

```ts
function w(over: Partial<Weather> = {}): Weather {
  return { precip: "none", clear: true, offset: 0, snowCm: 0, rolledDay: -1, storm: null, dryDays: 0, wetDay: false, iceCm: 0, ...over };
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/advance-save.test.ts tests/weather.test.ts`
Expected: FAIL: `water` is undefined; the weather helper does not compile until the type has the fields.

- [ ] **Step 3: Types**

In `src/sim/types.ts` apply the Interfaces block above. `KgItem` gains `"wetFirewood"`. `Weather.storm`'s `warned` records that the one-hour warning was logged.

- [ ] **Step 4: Starting values and defaults**

`src/sim/newgame.ts`, in the player literal: `water: 2.5, autoDrink: true, frostbite: { feet: 0, hands: 0 }, toes: false, fingers: false,`; weather literal: `storm: null, dryDays: 0, wetDay: false, iceCm: 0`.

`src/sim/regionstate.ts` `newRegionState`: `fire: { lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0 }`, `smoke: 0`, `logsWet: 1440`, `structures.hearth: false`.

`src/sim/save.ts` `fillDefaults`:

```ts
function fillDefaults(state: GameState): void {
  state.skills ??= newSkills();
  state.intent ??= null;
  // Hauling was a stored plan once; an intent restarts from anywhere, so a saved plan is simply forgotten.
  delete (state as unknown as Record<string, unknown>).plan;
  const p = state.player;
  p.torch ??= { lit: false, minutes: 0 };
  p.water ??= 2.5;
  p.autoDrink ??= true;
  p.frostbite ??= { feet: 0, hands: 0 };
  p.toes ??= false;
  p.fingers ??= false;
  const w = state.weather;
  w.storm ??= null;
  w.dryDays ??= 0;
  w.wetDay ??= false;
  w.iceCm ??= 0;
  for (const st of Object.values(state.regions)) {
    st.structures.boughBed ??= false;
    st.structures.hearth ??= false;
    st.boughBedAge ??= 0;
    st.fire.wetKg ??= 0;
    st.fire.indoors ??= false;
    st.fire.unattended ??= 0;
    st.smoke ??= 0;
    st.logsWet ??= 1440;
  }
}
```

`src/sim/items.ts`: `ITEM_KG.wetFirewood = 1`, `ITEM_NAMES.wetFirewood = "wet firewood"`, add to `KG_ITEMS`; each `CLOTHING` entry gains `material`: wool for woolCoat, woolTrousers, woolHat; hide for leatherBoots, hideCoat, hideTrousers, hideBoots, furHat, furMittens, hideBlanket. The `CLOTHING` record type gains `material: "wool" | "hide"`.

`src/sim/player.ts` `die`: add `thirst: "Thirst took you.", smoke: "The smoke took you in your sleep.", drowned: "The ice gave way. The lake kept you."`. `src/ui/panels.ts` `deathHtml`'s cause map gets the same three lines.

Placeholder arms so every switch compiles: in `tasks.ts` `checkFresh` add `case "melt": case "thaw": case "lightIndoors": return opt({ group: "camp", label: id, ok: false, why: "not yet" });` and in `complete` add the three ids to the no-op list; in `player.ts` `activityOf` add them to the `"rest"` line and to `CAMP_TASKS`. Any other exhaustive switch tsc names gets the same treatment.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd 08-survidle && git add src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/sim/regionstate.ts src/sim/player.ts src/sim/items.ts src/sim/tasks.ts src/ui/panels.ts tests/advance-save.test.ts tests/weather.test.ts
git commit -m "feat(survidle): the state for water, wet clothing, frostbite, wet wood, smoke, storms and ice"
```

---

### Task 2: The water reserve

**Files:**
- Create: `src/sim/water.ts`
- Modify: `src/sim/player.ts` (`Drains`, `stepPlayer`, `workSpeed`, `causeFrom`), `src/sim/advance.ts`, `src/ui/bars.ts`, `src/ui/panels.ts` (`statsHtml`, `instantHtml`), `src/main.ts`
- Test: `tests/water.test.ts` (new), `tests/player.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const WATER_FULL = 3.0, THIRSTY_L = 1.0, ICE_SHORE_CM = 2, THIRST_DRAIN_PER_HOUR = 4;
  export function waterLossPerHour(state: GameState, felt: number): number
  /** Lowers the reserve for dt minutes; returns the health drain for the minute (0 unless empty). */
  export function stepWater(state: GameState, felt: number, dt: number): number
  export function waterSource(state: GameState, world: World): boolean
  export function vesselLitres(p: Player): number
  export function drink(state: GameState, world: World): boolean
  export function fillVessels(state: GameState, world: World): number
  export function autoDrink(state: GameState, world: World): void
  ```
- `Drains` gains `thirst`; `causeFrom` picks the largest of four.

- [ ] **Step 1: Write the failing tests**

Create `tests/water.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { causeFrom, stepPlayer, workSpeed } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { drink, THIRSTY_L, WATER_FULL, waterLossPerHour, waterSource } from "../src/sim/water";

describe("water", () => {
  it("loses a tenth of a litre an hour idle and more working, cold or hot", () => {
    const { state, world } = newGame(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(0.1, 6);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    expect(waterLossPerHour(state, 10)).toBeCloseTo(0.35, 6);
    expect(waterLossPerHour(state, -15)).toBeCloseTo(0.35 * 1.3, 6);
    expect(waterLossPerHour(state, 25)).toBeCloseTo(0.35 * 1.3, 6);
    state.task = null;
    const w0 = state.player.water;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 10, 1);
    expect(w0 - state.player.water).toBeCloseTo(0.1, 2);
  });

  it("thirst slows the work, then drains health at 4 an hour, and names the death", () => {
    const { state, world } = newGame(1);
    state.player.autoDrink = false;
    state.player.water = THIRSTY_L - 0.01;
    expect(workSpeed(state, world)).toBeCloseTo(0.8, 6);
    state.player.water = 0;
    const h0 = state.player.health;
    let drains = { starve: 0, cold: 0, sick: 0, thirst: 0 };
    for (let m = 0; m < 60; m++) drains = stepPlayer(state, world, 15, 1);
    expect(h0 - state.player.health).toBeCloseTo(4, 1);
    expect(causeFrom(drains)).toBe("thirst");
    expect(state.log.some((e) => e.text === "You are thirsty.")).toBe(true);
  });

  it("drinks at a shore and not away from water; auto-drink keeps the reserve up while the tab runs", () => {
    const g = newGame(42);
    const { state, world } = g;
    state.player.water = 0.5;
    expect(waterSource(state, world)).toBe(false);
    expect(drink(state, world)).toBe(false);
    placeAtSpot(state, world, state.player.region, "shore");
    expect(waterSource(state, world)).toBe(true);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(WATER_FULL);
    state.player.water = 0.9;
    advance(state, world, 1);
    expect(state.player.water).toBe(WATER_FULL);
  });

  it("a shore under two centimetres of ice still gives water; thicker is iced over", () => {
    const { state, world } = newGame(42);
    placeAtSpot(state, world, state.player.region, "shore");
    state.weather.iceCm = 1.9;
    expect(waterSource(state, world)).toBe(true);
    state.weather.iceCm = 2;
    expect(waterSource(state, world)).toBe(false);
  });

  it("a working day without drinking ends thirsty and, left alone, dead of thirst before starvation", () => {
    const { state, world } = newGame(17);
    state.player.autoDrink = false;
    state.player.autoEat = false;
    state.player.pack.items.driedMeat = 5;
    advance(state, world, 1440 * 4);
    expect(state.dead?.cause).toBe("thirst");
  });
});
```

Seed 42's start region has a shore spot (see Global Constraints); if `placeAtSpot` throws, pick another seed with one and say so.

Append to `tests/player.test.ts` nothing; the existing kcal and starvation tests must still pass with the new `Drains` shape (they compare fields, not the object).

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/water.test.ts`
Expected: FAIL: `../src/sim/water` does not exist.

- [ ] **Step 3: water.ts**

```ts
/**
 * Water: a reserve in litres beside the kilocalories. You drink where the
 * water is, or from a vessel you filled there; a shore under ice gives
 * nothing, and snow is water only at a fire (tasks.ts, melt).
 */
import { PACK_COMFORTABLE_KG } from "../units";
import type { World } from "../world/gen";
import { carried } from "./inventory";
import { TOOLS } from "./items";
import { type Activity, activityOf } from "./player";
import { cellOf, watersideCell } from "./position";
import type { GameState, Player } from "./types";

export const WATER_FULL = 3.0;
export const THIRSTY_L = 1.0;
/** Ice this thick closes the shore. */
export const ICE_SHORE_CM = 2;
export const THIRST_DRAIN_PER_HOUR = 4;
/** Vessels freeze below this ambient when the body is still and no fire is by. */
export const FREEZE_C = -5;

const LOSS_PER_HOUR: Record<Activity, number> = { sleep: 0.1, rest: 0.1, light: 0.15, walk: 0.25, heavy: 0.35 };

export function waterLossPerHour(state: GameState, felt: number): number {
  const p = state.player;
  let a = activityOf(state.task);
  if (a === "walk" && carried(p) > PACK_COMFORTABLE_KG) a = "heavy";
  let l = LOSS_PER_HOUR[a];
  if (felt > 20 || felt < -10) l *= 1.3;
  if (p.sick > 0) l *= 1.2;
  return l;
}

/** Lowers the reserve for dt minutes and returns the health drain for the same minutes: nothing until it is empty. */
export function stepWater(state: GameState, felt: number, dt: number): number {
  const p = state.player;
  p.water = Math.max(0, p.water - (waterLossPerHour(state, felt) / 60) * dt);
  return p.water <= 0 ? (THIRST_DRAIN_PER_HOUR / 60) * dt : 0;
}

/** Open water under foot: a waterside cell with the shore not iced over. */
export function waterSource(state: GameState, world: World): boolean {
  return watersideCell(world, cellOf(state, world)) && state.weather.iceCm < ICE_SHORE_CM;
}

export function vesselLitres(p: Player): number {
  let l = 0;
  for (const t of p.tools) if (!t.frozen) l += t.litres ?? 0;
  return l;
}

/** Fills the body from a vessel first, then the source under foot. False when neither has water. */
export function drink(state: GameState, world: World): boolean {
  const p = state.player;
  let want = WATER_FULL - p.water;
  if (want <= 1e-9) return false;
  for (const t of p.tools) {
    if (want <= 1e-9) break;
    if (t.frozen || !(t.litres ?? 0)) continue;
    const take = Math.min(want, t.litres!);
    t.litres! -= take;
    want -= take;
  }
  if (want > 1e-9 && waterSource(state, world)) want = 0;
  if (want === WATER_FULL - p.water) return false;
  p.water = WATER_FULL - want;
  return true;
}

/** Fills every vessel at a source. Returns litres added. */
export function fillVessels(state: GameState, world: World): number {
  if (!waterSource(state, world)) return 0;
  let added = 0;
  for (const t of state.player.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    added += holds - (t.litres ?? 0);
    t.litres = holds;
    t.frozen = false;
  }
  return added;
}

/** Drinks at the thirsty line when a vessel or the shore allows, like auto-eat. */
export function autoDrink(state: GameState, world: World): void {
  const p = state.player;
  if (!p.autoDrink || p.water >= THIRSTY_L) return;
  drink(state, world);
}
```

`TOOLS` needs an optional `litres` on its entry type; Task 3 fills the vessel entries, this task adds the field to the type only (`{ name: string; kg: number; litres?: number }`).

- [ ] **Step 4: Compose in player.ts and advance.ts**

`player.ts`:

```ts
export interface Drains { starve: number; cold: number; sick: number; thirst: number }
```

In `stepPlayer`, after the kcal block: `const thirst = stepWater(state, felt, dt);`. In the health block: `const drains: Drains = { starve: 0, cold: 0, sick: 0, thirst };` and `total` sums all four. Regeneration also requires `p.water > THIRSTY_L`. Add the warning: `warn(state, "thirst", p.water < THIRSTY_L, "You are thirsty.");`.

`workSpeed`: `if (p.water < THIRSTY_L) f *= 0.8;`.

`causeFrom`:

```ts
export function causeFrom(d: Drains): DeathCause {
  const worst = (Object.entries(d) as [keyof Drains, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return { starve: "starved", cold: "froze", sick: "sickness", thirst: "thirst" }[worst];
}
```

`carried()` in inventory.ts adds each tool's `litres ?? 0` kilograms.

`advance.ts`: after `autoEat(state, world, rng);` add `autoDrink(state, world);`.

- [ ] **Step 5: UI**

`bars.ts`: `setBar("water", p.water / WATER_FULL, `${p.water.toFixed(1)} l`, root);`. `panels.ts` `statsHtml`: `${bar("water", "water", "Water")}` after Food; tag `thirsty` when under `THIRSTY_L`; a third mini toggle `auto-drink`. `instantHtml`: a `drink` button when `waterSource` or `vesselLitres > 0` and water under full, a `fill` button when at a source and a vessel is not full. `main.ts` cases: `"drink"` calls `drink`, `"fill"` calls `fillVessels`, `"toggle-drink"` flips `autoDrink`. `style.css`: `.bar.water .fill { background: #3b7dd8; }` beside the other bars.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. If the four-day scenario dies of cold first, raise the starting warmth for that test to 100 and put the player under a cabin (`st.structures.cabin = true`), keeping the point: thirst before starvation.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/sim/water.ts src/sim/player.ts src/sim/advance.ts src/sim/inventory.ts src/sim/items.ts src/ui/bars.ts src/ui/panels.ts src/main.ts src/style.css tests/water.test.ts
git commit -m "feat(survidle): a water reserve, drunk at the shore; thirst slows the work and then kills"
```

---

### Task 3: Vessels, melting snow, thawing

**Files:**
- Modify: `src/sim/items.ts` (`TOOLS`, `RECIPES`), `src/sim/tasks.ts` (`melt`, `thaw` cases, craft completion for vessels), `src/sim/water.ts` (freezing), `src/sim/hazards.ts` (new, first rule), `src/sim/events.ts`, `src/ui/panels.ts` (`INTENT_GROUPS`), `src/sim/intent.ts` (`CAMP_BOUND`)
- Test: `tests/water.test.ts`

**Interfaces:**
- `TOOLS.barkBucket = { name: "bark bucket", kg: 0.3, litres: 2 }`, `TOOLS.waterskin = { name: "waterskin", kg: 0.4, litres: 3 }`.
- `RECIPES.barkBucket = { name: "bark bucket", needs: [{ item: "bark", qty: 4 }, { item: "cordage", qty: 1 }], tool: "knife", minutes: 20, out: { tool: "barkBucket" } }`, `RECIPES.waterskin = { name: "waterskin", needs: [{ item: "hide", qty: 1 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 60, out: { tool: "waterskin" } }`.
- Tasks: `melt` (camp, "Melt snow", 15 min, needs a lit fire at camp with at least 1 kg dry fuel and `snowCm >= 1`; on completion `fire.fuelKg -= 1` and 1.0 l goes to the body then the vessels), `thaw` (camp, "Thaw the water", 10 min, needs a lit fire and a frozen vessel; on completion every vessel unfreezes). Both repeatable, both `activityOf` rest, both in `CAMP_TASKS` and `CAMP_BOUND`; `skillOf` null.
- `hazards.ts` exports `hourlyHazards(state, world, cal, ambient, rng)`; this task's rule: vessel freezing and the bucket splitting.

- [ ] **Step 1: Write the failing tests**

Append to `tests/water.test.ts`:

```ts
describe("vessels and snow", () => {
  it("a bark bucket carries two litres from the shore and is drunk from anywhere", () => {
    const { state, world } = newGame(42);
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 0 });
    placeAtSpot(state, world, state.player.region, "shore");
    expect(fillVessels(state, world)).toBe(2);
    placeAtSpot(state, world, state.player.region, "camp");
    state.player.water = 0.5;
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBeCloseTo(2.5, 6);
    expect(state.player.tools.find((t) => t.id === "barkBucket")!.litres).toBeCloseTo(0, 6);
  });

  it("melting snow at the fire costs a kilo of wood a litre; thawing frees a frozen vessel", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    state.weather.snowCm = 5;
    state.player.water = 1;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 1, frozen: true });
    expect(check(state, world, cal, "melt").ok).toBe(true);
    startTask(state, world, cal, "melt");
    advance(state, world, 20);
    expect(state.player.water).toBeCloseTo(2, 6);
    expect(st.fire.fuelKg).toBeCloseTo(10 - 1 - (3 / 60) * 20, 1);
    expect(check(state, world, cal, "thaw").ok).toBe(true);
    startTask(state, world, cal, "thaw");
    advance(state, world, 15);
    expect(state.player.tools.find((t) => t.id === "barkBucket")!.frozen).toBe(false);
    state.weather.snowCm = 0;
    expect(check(state, world, cal, "melt").why).toBe("no snow to melt");
  });

  it("water in a still pack freezes at -5 and a full bucket may split", () => {
    const { state, world } = newGame(17);
    state.player.tools.push({ id: "waterskin", durability: 100, litres: 3 });
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 });
    state.player.energy = 100;
    state.task = null;
    const rng = new Rng(3);
    for (let h = 0; h < 6; h++) hourlyHazards(state, world, cal, -8, rng);
    const skin = state.player.tools.find((t) => t.id === "waterskin")!;
    expect(skin.frozen).toBe(true);
    expect(vesselLitres(state.player)).toBe(0);
    const bucket = state.player.tools.find((t) => t.id === "barkBucket");
    // Six freezing hours at one-in-three: the bucket split (gone) or froze whole; never a drinkable one left.
    expect(bucket === undefined || bucket.frozen === true).toBe(true);
  });
});
```

Imports to add: `fillVessels, vesselLitres` from water, `check, startTask` from tasks, `regionState`, `calendar` (`const cal = calendar(0)`), `Rng`, `hourlyHazards` from `../src/sim/hazards`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/water.test.ts`
Expected: FAIL: `hazards` does not exist; `melt` returns "not yet".

- [ ] **Step 3: Items and recipes**

In `items.ts` add the two `TOOLS` entries and the two `RECIPES` entries from Interfaces. `RECIPE_IDS` is derived from the record, so the UI lists them.

In `tasks.ts` `complete`'s `craft` branch, tool output already replaces a tool of the same id; a vessel starts `{ id, durability: 100, litres: 0, frozen: false }`: set those two fields when `TOOLS[rec.out.tool].litres` is defined.

- [ ] **Step 4: The two tasks**

Replace the placeholder arms in `checkFresh`:

```ts
    case "melt": {
      const o = needCamp(opt({ group: "camp", label: "Melt snow", detail: "1 kg of the fire's wood for a litre", duration: 15, repeatable: true }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (st.fire.fuelKg < 1) return { ...o, ok: false, why: "the fire is too low" };
      if (state.weather.snowCm < 1) return { ...o, ok: false, why: "no snow to melt" };
      return o;
    }
    case "thaw": {
      const o = needCamp(opt({ group: "camp", label: "Thaw the water", detail: "a frozen vessel by the fire", duration: 10 }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (!p.tools.some((t) => t.frozen)) return { ...o, ok: false, why: "nothing is frozen" };
      return o;
    }
```

and in `complete`:

```ts
    case "melt": {
      st.fire.fuelKg -= 1;
      let l = 1.0;
      const drinkL = Math.min(l, WATER_FULL - p.water);
      p.water += drinkL;
      l -= drinkL;
      for (const t of p.tools) {
        const holds = TOOLS[t.id].litres ?? 0;
        if (!holds || l <= 1e-9) continue;
        const room = holds - (t.litres ?? 0);
        const put = Math.min(room, l);
        t.litres = (t.litres ?? 0) + put;
        t.frozen = false;
        l -= put;
      }
      return;
    }
    case "thaw": {
      for (const t of p.tools) if (t.frozen) t.frozen = false;
      return;
    }
```

`activityOf`: both `"rest"`; `CAMP_TASKS` includes both; `intent.ts` `CAMP_BOUND` includes both; `panels.ts` `INTENT_GROUPS` Camp gains `{ id: "melt" }, { id: "thaw" }` after `light`.

- [ ] **Step 5: hazards.ts and freezing**

```ts
/**
 * The hourly rolls that need a die: what the weather does to your things
 * and your body over an hour. Called from hourlyEvents.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { TOOLS } from "./items";
import { log } from "./log";
import { activityOf } from "./player";
import { atCamp } from "./position";
import { regionState } from "./regionstate";
import type { GameState } from "./types";
import { FREEZE_C } from "./water";

export function hourlyHazards(state: GameState, world: World, cal: Calendar, ambient: number, rng: Rng): void {
  freezeVessels(state, world, ambient, rng);
}

/** A still pack in frost: the water in it freezes; a bark bucket more than half full may split. */
function freezeVessels(state: GameState, world: World, ambient: number, rng: Rng): void {
  const p = state.player;
  if (ambient >= FREEZE_C) return;
  const a = activityOf(state.task);
  if (a === "walk" || a === "heavy" || a === "light") return;
  const st = regionState(state, world, p.region);
  if (atCamp(state, world) && st.fire.lit) return;
  for (const t of [...p.tools]) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds || !(t.litres ?? 0) || t.frozen) continue;
    t.frozen = true;
    if (t.id === "barkBucket" && t.litres! > holds / 2 && rng.chance(1 / 3)) {
      p.tools = p.tools.filter((x) => x !== t);
      log(state, "The bucket has split in the frost.", "bad");
    }
  }
}
```

`events.ts` `hourlyEvents` gains an `ambient` parameter (advance passes it) and calls `hourlyHazards(state, world, cal, ambient, rng)` at its end. `cal` is unused by the first rule; later tasks use it.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/sim/items.ts src/sim/tasks.ts src/sim/water.ts src/sim/hazards.ts src/sim/events.ts src/sim/advance.ts src/sim/player.ts src/sim/intent.ts src/ui/panels.ts tests/water.test.ts
git commit -m "feat(survidle): a bark bucket and a waterskin carry water; snow melts at the fire and vessels freeze in a still pack"
```

---

### Task 4: Ice

**Files:**
- Modify: `src/sim/weather.ts`, `src/world/route.ts`, `src/sim/tasks.ts` (`walkTarget`, `check` walk case, `stepWalk`, `stepTask` passes rng), `src/sim/hazards.ts`, `src/ui/map.ts`, `src/ui/panels.ts` (`clockHtml`, `regionHtml`), `src/style.css`
- Test: `tests/ice.test.ts` (new), `tests/weather.test.ts`

**Interfaces:**
- `weather.ts`: `export const ICE_THIN_CM = 5, ICE_SAFE_CM = 15; export function iceMode(w: Weather): IceMode` ("safe" at or above 15, "none" below 5, "thin" between; callers that want to cross thin ice ask for it explicitly). The daily roll grows `iceCm` by `0.5 * -mean` when the day's mean (`seasonalMean(dayOfYear) + offset`) is below 0 and melts `2 * mean` above, floor 0.
- `route.ts`: `export type IceMode = "none" | "safe" | "thin"; export const ICE_SPEED = 0.8; findRoute(world, from, to, ice: IceMode = "none")`; cache key includes the mode; water cells have speed `ICE_SPEED` when `ice !== "none"`. `routeMinutes(world, path, baseKmh, ice = "none")` uses the same speed for water. `passable(t, ice = "none")`.
- `tasks.ts`: a walk argument may end in `:thin` (`cell:123:thin`, `spot:forest:thin`); `walkTarget` strips it and returns `thin: true`; the walk check routes with `thin ? "thin" : iceMode(weather) === "safe" ? "safe" : "none"`; `Route` gains `ice: IceMode`; `stepWalk(state, world, cal, rng, dt)` rolls the fall on every water cell entered while `iceCm < ICE_SAFE_CM`.
- `hazards.ts`: standing on a water cell with `iceCm < ICE_THIN_CM` rolls the fall once an hour.

- [ ] **Step 1: Write the failing tests**

Create `tests/ice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { iceMode, stepWeather } from "../src/sim/weather";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";

/** A water cell in the player's region and a land cell beside it. */
function shoreAndWater(g: ReturnType<typeof newGame>) {
  const { state, world } = g;
  const r = regionAt(world, state.player.region);
  for (const c of r.cells) {
    if (cellAt(world, c).terrain !== "water") continue;
    for (const d of [1, -1, world.w, -world.w]) {
      const n = c + d;
      if (n >= 0 && n < world.w * world.h && cellAt(world, n).terrain !== "water") return { water: c, land: n };
    }
  }
  throw new Error("no shore in this region");
}

describe("ice", () => {
  it("grows on cold days, melts on warm ones, and opens routes over water", () => {
    const { state, world } = newGame(42);
    const w = state.weather;
    const rng = new Rng(1);
    // Fourteen days at -10: half a centimetre per degree per day.
    for (let d = 1; d <= 14; d++) {
      w.rolledDay = d - 1;
      w.offset = -10 - (3 + 12 * Math.cos((2 * Math.PI * (1 - 200)) / 365));
      stepWeather(w, calendar(d * 1440 + 8 * 60), rng, 1);
    }
    expect(w.iceCm).toBeGreaterThanOrEqual(15);
    expect(iceMode(w)).toBe("safe");
    const { water, land } = shoreAndWater({ state, world });
    expect(findRoute(world, land, water)).toBeNull();
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    w.iceCm = 8;
    expect(iceMode(w)).toBe("thin");
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    w.iceCm = 4;
    expect(iceMode(w)).toBe("none");
  });

  it("a walk onto thin ice may go through: most drown, the rest crawl out soaked on the shore", () => {
    const drowned: boolean[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(42);
      const { state, world } = g;
      state.weather.iceCm = 5;
      const { water, land } = shoreAndWater(g);
      placeAt(state, world, land);
      const cal = calendar(state.minute);
      expect(check(state, world, cal, "walk", `cell:${water}`).ok).toBe(false);
      expect(check(state, world, cal, "walk", `cell:${water}:thin`).ok).toBe(true);
      startTask(state, world, cal, "walk", `cell:${water}:thin`);
      const rng = new Rng(seed);
      for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, rng, 1);
      if (state.dead) {
        expect(state.dead.cause).toBe("drowned");
        drowned.push(true);
      } else if (state.log.some((e) => e.text.startsWith("Through the ice"))) {
        expect(state.player.wetness).toBe(100);
        expect(state.player.clothing.every((c) => c.wet === 100)).toBe(true);
        expect(cellAt(world, cellOf(state, world)).terrain).not.toBe("water");
        drowned.push(false);
      }
    }
    // Ten percent per cell at 5 cm across twelve tries: at least one fall, and drowning is the likelier end.
    expect(drowned.length).toBeGreaterThan(0);
  });

  it("safe ice crossed, then melted, leaves no way back", () => {
    const g = newGame(42);
    const { state, world } = g;
    state.weather.iceCm = 16;
    const { water, land } = shoreAndWater(g);
    placeAt(state, world, land);
    const cal = calendar(state.minute);
    startTask(state, world, cal, "walk", `cell:${water}`);
    const rng = new Rng(1);
    for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(cellOf(state, world)).toBe(water);
    state.weather.iceCm = 3;
    expect(check(state, world, cal, "walk", `cell:${land}`).why).toBe("no way there on foot");
    // Standing on water with the ice gone rolls the fall hourly.
    advance(state, world, 60 * 12);
    expect(state.dead !== null || state.log.some((e) => e.text.startsWith("Through the ice"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/ice.test.ts`
Expected: FAIL: `iceMode` is not exported; `findRoute` ignores the fourth argument.

- [ ] **Step 3: Weather and routing**

`weather.ts`: at the daily roll, before the offset is re-rolled, update the ice from the day just ended:

```ts
export const ICE_THIN_CM = 5;
export const ICE_SAFE_CM = 15;

export function iceMode(w: Weather): IceMode {
  if (w.iceCm >= ICE_SAFE_CM) return "safe";
  if (w.iceCm >= ICE_THIN_CM) return "thin";
  return "none";
}

/** Yesterday's mean sets today's ice: half a centimetre per freezing degree, two per thawing one. */
function stepIce(w: Weather, cal: Calendar): void {
  const mean = seasonalMean(cal.dayOfYear) + w.offset;
  if (mean < 0) w.iceCm += 0.5 * -mean;
  else w.iceCm = Math.max(0, w.iceCm - 2 * mean);
}
```

called as the first line inside the `if (cal.dayIndex > w.rolledDay && cal.hour >= cal.sunrise)` block, before the new offset is drawn. Import `IceMode` from route.

`route.ts`:

```ts
export type IceMode = "none" | "safe" | "thin";
/** Walking on ice relative to open forest. */
export const ICE_SPEED = 0.8;

export function passable(t: Terrain, ice: IceMode = "none"): boolean {
  return speedOf(t, ice) > 0;
}

export function speedOf(t: Terrain, ice: IceMode): number {
  if (t === "water") return ice === "none" ? 0 : ICE_SPEED;
  return TERRAIN_SPEED[t];
}
```

`findRoute(world, from, to, ice: IceMode = "none")` uses key `${from}>${to}>${ice}` and passes `ice` to `astar`, which fills `speed[...] = speedOf(terrainOf(...), ice)` and checks the goal with `passable(..., ice)`. `routeMinutes(world, path, baseKmh, ice: IceMode = "none")` uses `speedOf`. `walkSpeed` in player.ts takes the route's mode for water cells: add an optional `ice` argument defaulting to `"none"` and use `speedOf`.

- [ ] **Step 4: Walks over ice and the fall**

`types.ts` `Route` gains `ice: IceMode`. `tasks.ts`:

- `walkTarget` returns `{ cell, label, thin }`: split the arg on `:`; a trailing `thin` sets `thin: true` and is removed before the kind and value are read.
- `check`'s walk case: `const ice: IceMode = target.thin ? "thin" : iceMode(state.weather) === "safe" ? "safe" : "none"; const route = findRoute(world, from, target.cell, ice);` and `routeMinutes(world, route, v, ice)`. When `target.thin` but `iceMode` is not `"thin"`, return `why: "the ice is not thin here"` (either open water or safe ice, where the plain walk applies). A thin walk's detail ends with `; thin ice, ${Math.round(fallChance(state.weather.iceCm) * 100)}% per crossing cell`.
- `beginTask` stores `state.route = { target, path, label, ice }`.
- `stepWalk(state, world, cal, rng, dt)`: when a cell is entered (both the whole-cell and the fractional branch call `setRegion`; use the whole-cell branch, where `route.path.shift()` happens), if `cellAt(world, cell).terrain === "water"` and `state.weather.iceCm < ICE_SAFE_CM`, roll `rng.chance(fallChance(state.weather.iceCm))`; on a fall call `fallThrough(state, world, rng, lastLand)` and return. Track `lastLand`: the last non-water cell the player stood on, kept on `Route` as `lastLand: number`, updated as cells are entered. Warn once per thin crossing: "The ice is thin here." when the first water cell is entered with `iceCm < ICE_SAFE_CM`.

```ts
/** Chance per thin-ice cell of going through: ten percent at 5 cm, one at 14. */
export function fallChance(iceCm: number): number {
  return Math.max(0, ((ICE_SAFE_CM - iceCm) / 10) * 0.1);
}

/** Through the ice: three in five drown; the rest crawl out onto the last land, soaked and cold, the walk over. */
export function fallThrough(state: GameState, world: World, rng: Rng, land: number): void {
  const p = state.player;
  if (rng.chance(0.6)) {
    die(state, "drowned");
    return;
  }
  placeAt(state, world, land);
  p.wetness = 100;
  for (const g of p.clothing) g.wet = 100;
  p.warmth = Math.max(0, p.warmth - 30);
  p.energy = Math.max(0, p.energy - 20);
  state.route = null;
  state.task = null;
  state.intent = null;
  log(state, "Through the ice. You crawl out soaked and shaking.", "bad");
}
```

`stepTask` passes its `rng` into `stepWalk`. `die` is imported from player.

`hazards.ts`: `iceUnderFoot(state, world, rng)`: if the cell under foot is water and `iceCm < ICE_THIN_CM`, `fallThrough(state, world, rng, nearestLand)` where the nearest land is the first non-water neighbour (`neighbours` from gen), else the cell itself (the player stays and rolls again next hour).

- [ ] **Step 5: UI**

`map.ts`: after `glyph = GLYPH[t];` add `if (t === "water" && iceMode(state.weather) !== "none") { glyph = "="; cls.push(iceMode(state.weather) === "safe" ? "ice-safe" : "ice-thin"); }`. `style.css`: `.c.ice-thin { color: #6d8a9c; } .c.ice-safe { color: #cfe6f0; }`. The legend line gains `= ice`.

`panels.ts` `clockHtml`: `${state.weather.iceCm >= 1 ? `<span>ice ${Math.round(state.weather.iceCm)} cm</span>` : ""}`. `regionHtml`: for each spot, when `iceMode(state.weather) === "thin"`, compute `check(..., "walk", `spot:${s.id}:thin`)`; if ok and its duration is under the plain walk's (or the plain walk is not ok), add a second button `across the ice (${Math.round(state.weather.iceCm)} cm, thin)` with the fall chance in its title. Same for the go button on a selected region with `region:${id}:thin`.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. The existing walk tests pass unchanged because the default mode is "none" until `iceCm` reaches 15, and a new game has 0.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/sim/weather.ts src/world/route.ts src/sim/tasks.ts src/sim/types.ts src/sim/player.ts src/sim/hazards.ts src/ui/map.ts src/ui/panels.ts src/style.css tests/ice.test.ts
git commit -m "feat(survidle): lakes freeze; thin ice can be crossed and can take you; safe ice is a road until it melts"
```

---

### Task 5: Clothing gets wet and dries

**Files:**
- Create: `src/sim/clothing.ts`
- Modify: `src/sim/player.ts` (`insulation`, `stepPlayer` wetness and wear), `src/ui/panels.ts` (`gearHtml`), `src/style.css`
- Test: `tests/clothing.test.ts` (new), `tests/player.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const OUTER: ReadonlySet<ClothingSlot>   // coat, hat, boots, mittens
  export function garmentWet(g: Garment): number  // g.wet ?? 0
  /** Insulation kept at this wetness: wool half at soaked, hide a third. */
  export function wetFactor(g: Garment): number
  export interface Exposure { raining: boolean; heavy: boolean; snowing: boolean; roof: boolean; cabin: boolean; fireAtCamp: boolean; bedded: boolean; storm: boolean }
  export function stepGarments(state: GameState, x: Exposure, dt: number): void
  /** Mean soaking of coat and trousers, 0..1: how much of the rain reaches the skin. */
  export function skinExposure(state: GameState): number
  ```
- `insulation()` multiplies each garment's insulation by `wetFactor`.

- [ ] **Step 1: Write the failing tests**

Create `tests/clothing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { garmentWet, skinExposure, stepGarments, wetFactor } from "../src/sim/clothing";
import { newGame } from "../src/sim/newgame";
import { insulation, stepPlayer } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";

const dry = { raining: false, heavy: false, snowing: false, roof: false, cabin: false, fireAtCamp: false, bedded: false, storm: false };

describe("wet clothing", () => {
  it("rain soaks the outer layer first, and a soaked wool coat keeps half its warmth", () => {
    const { state } = newGame(1);
    const ins0 = insulation(state);
    for (let m = 0; m < 60; m++) stepGarments(state, { ...dry, raining: true }, 1);
    const coat = state.player.clothing.find((g) => g.id === "woolCoat")!;
    const trousers = state.player.clothing.find((g) => g.id === "woolTrousers")!;
    expect(garmentWet(coat)).toBe(60);
    expect(garmentWet(trousers)).toBe(30);
    expect(wetFactor({ id: "woolCoat", durability: 100, wet: 100 })).toBeCloseTo(0.5, 6);
    expect(wetFactor({ id: "hideCoat", durability: 100, wet: 100 })).toBeCloseTo(0.33, 2);
    expect(insulation(state)).toBeLessThan(ins0);
  });

  it("dries fastest by the fire, slowly under a roof or in dry weather, not at all in rain", () => {
    const { state } = newGame(1);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, roof: true, fireAtCamp: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(80, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(95, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBe(100);
  });

  it("the skin stays dry under a dry coat, and wet gear wears half again as fast", () => {
    const { state, world } = newGame(1);
    expect(skinExposure(state)).toBe(0);
    state.weather.precip = "light";
    for (let m = 0; m < 30; m++) stepPlayer(state, world, 10, 1);
    expect(state.player.wetness).toBeLessThan(5);
    const d0 = state.player.clothing[0].durability;
    for (const g of state.player.clothing) g.wet = 100;
    state.weather.precip = "none";
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 10, 1);
    const wetWear = d0 - state.player.clothing[0].durability;
    const { state: s2, world: w2 } = newGame(1);
    const e0 = s2.player.clothing[0].durability;
    for (let m = 0; m < 60; m++) stepPlayer(s2, w2, 10, 1);
    expect(wetWear).toBeCloseTo((e0 - s2.player.clothing[0].durability) * 1.5, 3);
  });
});
```

If the seed-1 camp has a lean-to or the start is under a roof, the exposure fixture will differ; a new game has no structures, so it is in the open.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/clothing.test.ts`
Expected: FAIL: `../src/sim/clothing` does not exist.

- [ ] **Step 3: clothing.ts**

```ts
/**
 * Clothing that gets wet garment by garment. Rain finds the outer layer
 * first; a soaked coat is half a coat; nothing dries in the rain, little
 * dries in the open, and the fire dries everything.
 */
import { clamp } from "../units";
import { CLOTHING, type ClothingSlot } from "./items";
import type { GameState, Garment } from "./types";
import { SNOW_DAMP_MAX } from "./player";

export const OUTER: ReadonlySet<ClothingSlot> = new Set<ClothingSlot>(["coat", "hat", "boots", "mittens"]);

export interface Exposure {
  raining: boolean;
  heavy: boolean;
  snowing: boolean;
  roof: boolean;
  cabin: boolean;
  fireAtCamp: boolean;
  bedded: boolean;
  storm: boolean;
}

export function garmentWet(g: Garment): number {
  return g.wet ?? 0;
}

/** Share of insulation a garment keeps at its wetness. */
export function wetFactor(g: Garment): number {
  const def = CLOTHING[g.id];
  if (def.slot === "blanket") return 1;
  const loss = def.material === "wool" ? 0.5 : 0.67;
  return 1 - loss * (garmentWet(g) / 100);
}

/** Wetting rate per minute for the outer layer in this exposure; zero when dry or indoors. */
function wetRate(x: Exposure): number {
  if (!x.raining || x.cabin) return 0;
  let r = x.heavy ? 2 : 1;
  if (x.snowing) r *= 0.25;
  if (x.roof) r *= 0.5;
  if (x.storm) r *= 2;
  return r;
}

function dryRate(x: Exposure): number {
  if (x.raining) return 0;
  if (x.fireAtCamp && x.roof) return 20 / 60;
  if (x.fireAtCamp) return 20 / 60;
  return 5 / 60;
}

/** Wets or dries every garment for dt minutes. */
export function stepGarments(state: GameState, x: Exposure, dt: number): void {
  const wet = wetRate(x);
  const dry = dryRate(x);
  for (const g of state.player.clothing) {
    const slot = CLOTHING[g.id].slot;
    if (slot === "blanket" && !x.bedded) continue;
    if (wet > 0) {
      const share = OUTER.has(slot) ? 1 : slot === "trousers" ? 0.5 : 0.5;
      const cap = x.snowing ? SNOW_DAMP_MAX : 100;
      g.wet = clamp(garmentWet(g) + wet * share * dt, 0, Math.max(garmentWet(g), cap));
    } else {
      g.wet = clamp(garmentWet(g) - dry * dt, 0, 100);
    }
  }
}

/** How much of the rain reaches the skin: the mean soaking of coat and trousers. */
export function skinExposure(state: GameState): number {
  const layers = state.player.clothing.filter((g) => {
    const s = CLOTHING[g.id].slot;
    return s === "coat" || s === "trousers";
  });
  if (!layers.length) return 1;
  return layers.reduce((a, g) => a + garmentWet(g) / 100, 0) / layers.length;
}
```

Note the test expects dry weather in the open at 5 an hour and by the fire 20: `dryRate` returns `5/60` for both roof and open dry weather, which the table in spec 2.1 allows (both are 5). Under a roof in rain the rate is 0 because `x.raining` is true; the spec's "under a roof" row is for dry hours under it.

- [ ] **Step 4: Compose in player.ts**

`insulation`: `sum += CLOTHING[g.id].insulation * clamp(g.durability, 0, 100) / 100 * wetFactor(g)`.

In `stepPlayer`, build the exposure once:

```ts
  const x: Exposure = {
    raining: w.precip !== "none", heavy: w.precip === "heavy", snowing: w.precip !== "none" && ambient <= 0,
    roof, cabin: !!cabin, fireAtCamp: r.fire.lit && camp && campTask, bedded: bedded(state.task),
    storm: w.storm !== null && state.minute >= w.storm.from && state.minute < w.storm.until,
  };
  stepGarments(state, x, dt);
```

The body wetness block multiplies its `wet` rate by `skinExposure(state)`; the clothing-wear block multiplies `wear` by 1.5 for a garment with `garmentWet(g) > 50`.

- [ ] **Step 5: UI**

`gearHtml`: each garment line gets `wetBar(g)` after `durBar`: a `.bar.wet` with the fill at `garmentWet(g)` percent and the word `wet` (over 50) or `soaked` (over 80) in the label. `style.css`: `.bar.wet .fill { background: #3b7dd8; opacity: .7 }`, height as `.bar.dur`.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. `tests/player.test.ts` "survives the first day" and the bedding tests still pass; if a felt-temperature assertion shifts because the starting garments are dry (factor 1), nothing changes.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/sim/clothing.ts src/sim/player.ts src/ui/panels.ts src/style.css tests/clothing.test.ts
git commit -m "feat(survidle): clothing gets wet garment by garment, loses its warmth, and dries by the fire"
```

---

### Task 6: Frostbite

**Files:**
- Modify: `src/sim/clothing.ts`, `src/sim/hazards.ts`, `src/sim/player.ts` (`stepPlayer` countdown and warnings, `baseWalkSpeed`, `workSpeed`), `src/sim/skills.ts` (`oddsFactor`, `craftSuccess`), `src/ui/panels.ts` (`statsHtml` tags, `gearHtml` cold marks)
- Test: `tests/clothing.test.ts`

**Interfaces:**
- `clothing.ts`:
  ```ts
  export const FROSTBITE_MINUTES = 3 * 1440;
  export function coldFeet(state: GameState, felt: number): boolean   // felt < 0 and boots wet > 50, worn < 25, or none
  export function coldHands(state: GameState, felt: number): boolean  // felt < -10 and no mittens or mittens wet > 50
  export function frostbiteChance(felt: number): number               // 0.02 from -5 down to -15, 0.06 under -15, 0 above -5
  export function frostbitten(state: GameState): { feet: boolean; hands: boolean }
  ```
- `hazards.ts` rolls it hourly; `stepPlayer` counts it down only while under a roof with a lit fire at camp; `baseWalkSpeed` times 0.6 (feet) and 0.85 (toes); `workSpeed` times 0.7 for heavy work with feet; `oddsFactor` times 0.5 with hands and 0.9 with fingers; `craftSuccess` halved with hands and times 0.9 with fingers.

- [ ] **Step 1: Write the failing tests**

Append to `tests/clothing.test.ts`:

```ts
describe("frostbite", () => {
  it("wet boots in frost freeze the feet within a night; a fire under a roof heals them; a second time costs toes", () => {
    const { state, world } = newGame(17);
    const boots = state.player.clothing.find((g) => CLOTHING[g.id].slot === "boots")!;
    boots.wet = 80;
    expect(coldFeet(state, -8)).toBe(true);
    boots.wet = 0;
    expect(coldFeet(state, -8)).toBe(false);
    boots.wet = 80;
    const rng = new Rng(2);
    let hours = 0;
    while (state.player.frostbite.feet === 0 && hours < 200) {
      hourlyHazards(state, world, calendar(0), -12, rng);
      hours++;
    }
    expect(state.player.frostbite.feet).toBe(3 * 1440);
    expect(hours).toBeLessThan(120);
    expect(state.log.some((e) => e.text === "Your feet are numb.")).toBe(true);
    expect(baseWalkSpeed(state, calendar(0), state.weather)).toBeCloseTo(3 * 0.6, 6);
    // In the open nothing heals.
    for (let m = 0; m < 600; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.frostbite.feet).toBe(3 * 1440);
    // Under a roof by a fire it counts down.
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    placeAtSpot(state, world, state.player.region, "camp");
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 600; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.frostbite.feet).toBe(3 * 1440 - 600);
    // A second bite while the first holds is for good.
    state.player.frostbite.feet = 100;
    boots.wet = 80;
    placeAtSpot(state, world, state.player.region, "forest");
    state.task = null;
    for (let h = 0; h < 200 && !state.player.toes; h++) hourlyHazards(state, world, calendar(0), -20, rng);
    expect(state.player.toes).toBe(true);
    state.player.frostbite.feet = 0;
    expect(baseWalkSpeed(state, calendar(0), state.weather)).toBeCloseTo(3 * 0.85, 6);
  });

  it("frostbitten hands halve the odds of the bow and the craft", () => {
    const { state } = newGame(1);
    const o0 = oddsFactor(state, "hare");
    const c0 = craftSuccess(state, "cordage");
    state.player.frostbite.hands = 1000;
    expect(oddsFactor(state, "hare")).toBeCloseTo(o0 * 0.5, 6);
    expect(craftSuccess(state, "cordage")).toBeCloseTo(c0 * 0.5, 6);
  });
});
```

Imports: `CLOTHING` from items, `coldFeet` from clothing, `Rng`, `hourlyHazards`, `calendar`, `baseWalkSpeed`, `placeAtSpot`, `oddsFactor, craftSuccess` from skills.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/clothing.test.ts`
Expected: FAIL: `coldFeet` is not exported.

- [ ] **Step 3: Implement**

`clothing.ts` additions:

```ts
export const FROSTBITE_MINUTES = 3 * 1440;

function slotGarment(state: GameState, slot: ClothingSlot): Garment | undefined {
  return state.player.clothing.find((g) => CLOTHING[g.id].slot === slot);
}

export function coldFeet(state: GameState, felt: number): boolean {
  if (felt >= 0) return false;
  const boots = slotGarment(state, "boots");
  return !boots || garmentWet(boots) > 50 || boots.durability < 25;
}

export function coldHands(state: GameState, felt: number): boolean {
  if (felt >= -10) return false;
  const mittens = slotGarment(state, "mittens");
  return !mittens || garmentWet(mittens) > 50;
}

/** Chance per hour of frostbite for a cold extremity at this felt temperature. */
export function frostbiteChance(felt: number): number {
  if (felt > -5) return 0;
  return felt < -15 ? 0.06 : 0.02;
}

export function frostbitten(state: GameState): { feet: boolean; hands: boolean } {
  return { feet: state.player.frostbite.feet > 0, hands: state.player.frostbite.hands > 0 };
}
```

`hazards.ts`: `hourlyHazards` gains `felt` (advance computes it via `feltTemperature` and passes it) and calls:

```ts
function frostbite(state: GameState, felt: number, rng: Rng): void {
  const p = state.player;
  const chance = frostbiteChance(felt);
  if (chance <= 0) return;
  if (coldFeet(state, felt) && rng.chance(chance)) {
    if (p.frostbite.feet > 0 && !p.toes) {
      p.toes = true;
      log(state, "You will not get those toes back.", "bad");
    }
    p.frostbite.feet = FROSTBITE_MINUTES;
    log(state, "Your feet are numb.", "bad");
  }
  if (coldHands(state, felt) && rng.chance(chance)) {
    if (p.frostbite.hands > 0 && !p.fingers) {
      p.fingers = true;
      log(state, "You will not get those fingers back.", "bad");
    }
    p.frostbite.hands = FROSTBITE_MINUTES;
    log(state, "You cannot feel your fingers.", "bad");
  }
}
```

The `hourlyEvents` signature becomes `(state, world, cal, ambient, felt, rng)`; `advance` passes both.

`player.ts`: in `stepPlayer`'s status countdown, frostbite counts down only when `roof && r.fire.lit && camp`: `if (roof && r.fire.lit) { p.frostbite.feet = Math.max(0, p.frostbite.feet - dt); p.frostbite.hands = ... }`. `baseWalkSpeed`: `if (p.frostbite.feet > 0) v *= 0.6; if (p.toes) v *= 0.85;`. `workSpeed`: `if (p.frostbite.feet > 0 && activityOf(state.task) === "heavy") f *= 0.7;`. `skills.ts` `oddsFactor`: multiply by 0.5 when `state.player.frostbite.hands > 0` and 0.9 when `state.player.fingers`; `craftSuccess`: the same two factors on the returned chance.

`panels.ts` `statsHtml` tags: `frostbitten feet, N h` and `frostbitten hands, N h` in the bad colour; `gearHtml`: boots line gets `feet cold` in the warn class when `coldFeet(state, felt)` (statsHtml already has `felt`; pass it into `gearHtml`), mittens likewise.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/clothing.ts src/sim/hazards.ts src/sim/events.ts src/sim/advance.ts src/sim/player.ts src/sim/skills.ts src/ui/panels.ts tests/clothing.test.ts
git commit -m "feat(survidle): wet feet in frost mean frostbite; it heals by a fire under a roof, or costs toes"
```

---

### Task 7: Wet wood, and fire in the weather

**Files:**
- Create: `src/sim/fire.ts`
- Modify: `src/sim/camp.ts` (`stepCamp`, `feedFire`), `src/sim/tasks.ts` (`split` yield, `light` in rain), `src/sim/player.ts` (`feltTemperature` fire term), `src/sim/actions.ts` (`addFirewood`), `src/ui/bars.ts`, `src/ui/panels.ts` (`regionHtml` fire line)
- Test: `tests/fire.test.ts` (new)

**Interfaces:**
- `fire.ts`:
  ```ts
  export const WET_AFTER_RAIN_MINUTES = 6 * 60;
  export function fuelTotal(fire: RegionState["fire"]): number          // fuelKg + wetKg
  export function smoky(fire: RegionState["fire"]): boolean             // wetKg > fuelKg / 2
  /** The fire's felt-temperature bonus for someone at camp: 15 at a camp task, 7 otherwise, halved when smoky. */
  export function fireWarmth(fire: RegionState["fire"], campTask: boolean): number
  export function burnPerHour(w: Weather, ambient: number, roofOverPit: boolean): number   // 3, 4.5 light rain or snow, 6 heavy rain, 3 under a roof
  export function lightingInRain(w: Weather, ambient: number, roofOverPit: boolean): { minutes: number; failChance: number; blocked: string | null }
  export function splitIsWet(state: GameState, world: World): boolean  // raining here, or region.logsWet < WET_AFTER_RAIN_MINUTES
  export function dryWood(state: GameState, world: World, dt: number): void   // per pile and pack, per spec 3.1 rates
  ```
- `feedFire` takes dry firewood first, then wet, into `wetKg`; the burn removes from both in the ratio held.

- [ ] **Step 1: Write the failing tests**

Create `tests/fire.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { feedFire } from "../src/sim/camp";
import { burnPerHour, fireWarmth, lightingInRain, smoky } from "../src/sim/fire";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { feltTemperature } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("wet wood", () => {
  it("logs split in rain, or within six hours of it, give wet firewood, which dries by a fire and not in rain", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "log", 2);
    state.weather.precip = "light";
    startTask(state, world, cal, "split");
    advance(state, world, 20);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(20);
    state.weather.precip = "none";
    st.logsWet = 2 * 60;
    startTask(state, world, cal, "split");
    advance(state, world, 20);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(40);
    // Dries at 2 kg an hour by a lit fire; not at all once it rains again.
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    const before = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    advance(state, world, 60);
    const after = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    expect(before - after).toBeCloseTo(2, 0);
    state.weather.precip = "heavy";
    advance(state, world, 60);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(after, 0);
  });

  it("wet wood on the fire halves its warmth and the fire is smoky", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    addItem(state.player.pack, "firewood", 5);
    addItem(state.player.pack, "wetFirewood", 20);
    feedFire(state, world, state.player.region, 30);
    expect(st.fire.fuelKg).toBe(5);
    expect(st.fire.wetKg).toBe(20);
    expect(smoky(st.fire)).toBe(true);
    expect(fireWarmth(st.fire, true)).toBe(7.5);
    const felt = feltTemperature(state, world, 0);
    st.fire.wetKg = 0;
    expect(feltTemperature(state, world, 0) - felt).toBeCloseTo(7.5, 6);
  });

  it("rain fights the fire: slower lighting that can fail, a faster burn, and heavy rain puts a low fire out", () => {
    const { state, world } = newGame(3);
    const w = state.weather;
    expect(burnPerHour(w, 5, false)).toBe(3);
    w.precip = "light";
    expect(burnPerHour(w, 5, false)).toBe(4.5);
    expect(lightingInRain(w, 5, false)).toEqual({ minutes: 20, failChance: 1 / 3, blocked: null });
    w.precip = "heavy";
    expect(burnPerHour(w, 5, false)).toBe(6);
    expect(lightingInRain(w, 5, false).blocked).toBe("too wet to light");
    expect(lightingInRain(w, 5, true).blocked).toBeNull();
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 1.5;
    advance(state, world, 1);
    expect(st.fire.lit).toBe(false);
    // Lighting in light rain: a third of tries fail and cost the wood either way.
    w.precip = "light";
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    let fails = 0;
    for (let seed = 1; seed <= 12; seed++) {
      st.fire.lit = false;
      addItem(state.player.pack, "firewood", 1);
      const o = check(state, world, cal, "light");
      expect(o.duration).toBe(20);
      startTask(state, world, cal, "light");
      const rng = new Rng(seed);
      for (let m = 0; m < 25 && state.task; m++) stepTask(state, world, cal, rng, 1);
      if (!st.fire.lit) fails++;
      st.fire.fuelKg = 0;
    }
    expect(fails).toBeGreaterThan(0);
    expect(fails).toBeLessThan(12);
    expect(qty(state.player.pack, "firewood")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/fire.test.ts`
Expected: FAIL: `../src/sim/fire` does not exist.

- [ ] **Step 3: fire.ts**

```ts
/**
 * Fire against the weather: wood that is wet will not warm you, rain that
 * will not let you light and eats what you lit. Every rule here is a number
 * the fire step in camp.ts, the light task and the felt temperature read.
 */
import type { World } from "../world/gen";
import { pile, qty, removeItem, addItem } from "./inventory";
import { cellOf } from "./position";
import { regionState, touchedRegions } from "./regionstate";
import type { GameState, RegionState, Weather } from "./types";

export const WET_AFTER_RAIN_MINUTES = 6 * 60;
const BURN_KG_PER_HOUR = 3;

export function fuelTotal(fire: RegionState["fire"]): number {
  return fire.fuelKg + fire.wetKg;
}

/** More wet than dry on the fire: it smokes and gives half the heat. */
export function smoky(fire: RegionState["fire"]): boolean {
  return fire.wetKg > fire.fuelKg / 2;
}

export function fireWarmth(fire: RegionState["fire"], campTask: boolean): number {
  if (!fire.lit) return 0;
  const full = campTask ? 15 : 7;
  return smoky(fire) ? full / 2 : full;
}

/** Fuel the fire eats per hour in this weather; a roof over the pit keeps the rain off. */
export function burnPerHour(w: Weather, ambient: number, roofOverPit: boolean): number {
  if (w.precip === "none" || roofOverPit) return BURN_KG_PER_HOUR;
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return 6;
  return 4.5;
}

/** What rain does to lighting: longer, chancy, or not at all. */
export function lightingInRain(w: Weather, ambient: number, roofOverPit: boolean): { minutes: number; failChance: number; blocked: string | null } {
  if (w.precip === "none" || roofOverPit) return { minutes: 10, failChance: 0, blocked: null };
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return { minutes: 20, failChance: 1 / 3, blocked: "too wet to light" };
  return { minutes: 20, failChance: 1 / 3, blocked: null };
}

/** True when a log split here and now comes out wet: rain, or rain within six hours. */
export function splitIsWet(state: GameState, world: World): boolean {
  if (state.weather.precip !== "none") return true;
  return regionState(state, world, state.player.region).logsWet < WET_AFTER_RAIN_MINUTES;
}

/** Wet firewood drying: fast by the fire or under a roof at camp, slow in dry weather, not in rain. */
export function dryWood(state: GameState, world: World, dt: number): void {
  const w = state.weather;
  if (w.precip !== "none") return;
  const p = state.player;
  const here = cellOf(state, world);
  const dryAt = (inv: ReturnType<typeof pile>, perHour: number) => {
    const wet = qty(inv, "wetFirewood");
    if (wet <= 1e-9) return;
    const moved = removeItem(inv, "wetFirewood", Math.min(wet, (perHour / 60) * dt));
    addItem(inv, "firewood", moved);
  };
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const campRate = st.fire.lit || st.structures.leanTo || st.structures.cabin ? 2 : 0.5;
    if (state.piles[st.campCell]) dryAt(state.piles[st.campCell], campRate);
  }
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv) continue;
    const isCamp = touchedRegions(state).some((id) => state.regions[id].campCell === cell);
    if (!isCamp) dryAt(inv, 0.5);
  }
  dryAt(p.pack, here >= 0 ? 0.5 : 0);
}
```

- [ ] **Step 4: Compose**

`camp.ts` `stepCamp`: `logsWet` per touched region: `st.logsWet = state.weather.precip !== "none" ? 0 : st.logsWet + dt`. The burn: `const roof = st.structures.leanTo || st.structures.cabin; const perMin = burnPerHour(state.weather, ambient, roof) / 60; const total = fuelTotal(st.fire); if (total > 0) { const share = st.fire.wetKg / total; st.fire.wetKg = Math.max(0, st.fire.wetKg - perMin * dt * share); st.fire.fuelKg = Math.max(0, st.fire.fuelKg - perMin * dt * (1 - share)); }`. The auto-feed check reads `fuelTotal`. Going out: `if (fuelTotal(st.fire) <= 0 || (state.weather.precip === "heavy" && ambient > 0 && !roof && fuelTotal(st.fire) < 2))` then out, both kinds zeroed. Call `dryWood(state, world, dt)` after the region loop.

`feedFire(state, world, region, wantKg)`: room is `FIRE_MAX_KG - fuelTotal`; take `firewood` first from pack and camp pile into `fuelKg`, then `wetFirewood` into `wetKg`. `firewoodAt` counts dry only.

`tasks.ts` `split` completion: `produce(state, world, splitIsWet(state, world) ? "wetFirewood" : "firewood", ITEM_KG.log)`. `light` check: `const lr = lightingInRain(state.weather, ambientTemperature(cal, state.weather), st.structures.leanTo || st.structures.cabin); if (lr.blocked) return { ...o, ok: false, why: lr.blocked }; duration lr.minutes`, detail adds "; one in three fails in the rain" when `failChance > 0`. `light` completion: consume the firewood and wear the drill as today, then `if (lr.failChance > 0 && rng.chance(lr.failChance)) { log(state, "The tinder will not catch.", "bad"); return; }` before lighting.

`player.ts` `feltTemperature`: replace `if (r.fire.lit && camp) felt += campTask ? 15 : 7;` with `if (camp) felt += fireWarmth(r.fire, campTask);`.

`actions.ts` `addFirewood` and the UI feed button count dry plus wet within reach.

UI: `bars.ts` fire bar shows `fuelTotal` with the text `${fuelKg} kg dry, ${wetKg} kg wet` when wet is over 0; `panels.ts` region fire line adds `, smoking` when `smoky`.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. The body tests' fire fixtures set `fuelKg` directly and stay valid.

- [ ] **Step 6: Commit**

```bash
cd 08-survidle && git add src/sim/fire.ts src/sim/camp.ts src/sim/tasks.ts src/sim/player.ts src/sim/actions.ts src/ui/bars.ts src/ui/panels.ts tests/fire.test.ts
git commit -m "feat(survidle): wet wood smokes and gives half the heat; rain slows the lighting and eats the fire"
```

---

### Task 8: Fire spreading, the hearth rule, smoke and carbon monoxide

**Files:**
- Modify: `src/sim/fire.ts`, `src/sim/hazards.ts`, `src/sim/camp.ts`, `src/sim/weather.ts` (`dryDays`), `src/sim/tasks.ts` (`lightIndoors`), `src/sim/player.ts` (`feltTemperature`, `stepPlayer` smoke drain, `workSpeed`), `src/sim/skills.ts` (`oddsFactor` coughing), `src/sim/body.ts` (`campCanWarm`), `src/sim/advance.ts`, `src/ui/panels.ts`
- Test: `tests/fire.test.ts`

**Interfaces:**
- `fire.ts`:
  ```ts
  export const SPREAD_FUEL_KG = 12, SPREAD_UNATTENDED_MINUTES = 120, DRY_DAYS = 3, SPREAD_PER_HOUR = 0.02;
  export function fireSeason(cal: Calendar): boolean       // summer, or month 9
  export function groundDry(w: Weather, cal: Calendar): boolean   // fireSeason and dryDays >= 3
  /** True when the fire at this camp warms the people at it: any fire outdoors, indoors only with a hearth or lit indoors. */
  export function fireWarms(st: RegionState): boolean
  export const SMOKE_COUGH = 40, SMOKE_DEADLY = 60, SMOKE_RISE_PER_HOUR = 20, SMOKE_FALL_PER_HOUR = 30, SMOKE_DRAIN_PER_HOUR = 25;
  export function stepSmoke(st: RegionState, atCamp: boolean, dt: number): void
  ```
- `Weather.dryDays` counts days since rain (incremented at the roll when `wetDay` is false; `wetDay` set when precipitation starts and cleared at the roll).
- Task `lightIndoors`: group camp, "Light a fire indoors", 10 min, only when a cabin stands, no hearth, fire not lit, drill and 1 kg dry firewood in reach; detail "no smoke hole: the cabin will fill with smoke"; completion as `light` plus `fire.indoors = true`. `light` sets `indoors = false`; a fire that goes out clears it.
- `Drains` gains `smoke`; cause `"smoke"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fire.test.ts`:

```ts
describe("spread and smoke", () => {
  it("a big fire left alone on dry August ground spreads within a day; a banked one does not", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.minute = (200 - 91) * 1440;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    state.weather.dryDays = 4;
    state.player.autoFeed = false;
    placeAtSpot(state, world, state.player.region, "forest");
    const wood0 = st.wood;
    advance(state, world, 1440);
    expect(st.wood).toBeLessThan(wood0);
    expect(st.structures.leanTo).toBe(false);
    expect(st.fire.lit).toBe(false);
    expect(state.log.some((e) => e.text.startsWith("Smoke on the wind"))).toBe(true);
    const h = newGame(3);
    const st2 = regionState(h.state, h.world, h.state.player.region);
    h.state.minute = (200 - 91) * 1440;
    st2.structures.firePit = true;
    st2.fire.lit = true;
    st2.fire.fuelKg = 6;
    h.state.weather.dryDays = 4;
    placeAtSpot(h.state, h.world, h.state.player.region, "forest");
    advance(h.state, h.world, 1440);
    expect(h.state.log.some((e) => e.text.startsWith("Smoke on the wind"))).toBe(false);
  });

  it("a cabin gets no fire warmth without a hearth; a fire lit indoors warms, smokes, and kills a sleeper", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.cabin = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    const cold = feltTemperature(state, world, 0);
    st.structures.hearth = true;
    expect(feltTemperature(state, world, 0) - cold).toBe(15);
    st.structures.hearth = false;
    st.fire.lit = false;
    state.task = null;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "firewood", 30);
    expect(check(state, world, cal, "lightIndoors").ok).toBe(true);
    expect(check(state, world, cal, "lightIndoors").detail).toContain("fill with smoke");
    startTask(state, world, cal, "lightIndoors");
    advance(state, world, 15);
    expect(st.fire.indoors).toBe(true);
    feedFire(state, world, state.player.region, 30);
    state.player.autoFeed = true;
    advance(state, world, 150);
    expect(st.smoke).toBeGreaterThan(40);
    expect(state.log.some((e) => e.text === "The fire is smoking the place out.")).toBe(true);
    state.player.energy = 30;
    startTask(state, world, cal, "sleep");
    const h0 = state.player.health;
    advance(state, world, 240);
    expect(state.log.some((e) => e.text === "The air is thick. You wake coughing.")).toBe(true);
    expect(state.player.health).toBeLessThan(h0 - 50);
    advance(state, world, 240);
    expect(state.dead?.cause).toBe("smoke");
  });
});
```

`feltTemperature` is imported from player already in this file.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/fire.test.ts`
Expected: FAIL: `lightIndoors` returns "not yet"; no spread.

- [ ] **Step 3: Implement**

`fire.ts` additions:

```ts
export const SPREAD_FUEL_KG = 12;
export const SPREAD_UNATTENDED_MINUTES = 120;
export const DRY_DAYS = 3;
export const SPREAD_PER_HOUR = 0.02;

export function fireSeason(cal: Calendar): boolean {
  return cal.season === "summer" || cal.month === 9;
}

export function groundDry(w: Weather, cal: Calendar): boolean {
  return fireSeason(cal) && w.dryDays >= DRY_DAYS;
}

/** A fire outdoors warms camp; a fire in a closed cabin only through a hearth, or when it was lit inside and is filling the room. */
export function fireWarms(st: RegionState): boolean {
  if (!st.fire.lit) return false;
  if (!st.structures.cabin) return true;
  return st.structures.hearth || st.fire.indoors;
}

export const SMOKE_COUGH = 40;
export const SMOKE_DEADLY = 60;
export const SMOKE_RISE_PER_HOUR = 20;
export const SMOKE_FALL_PER_HOUR = 30;
export const SMOKE_DRAIN_PER_HOUR = 25;

/** Smoke in a closed cabin: rises with an indoor fire and no hearth, clears otherwise. */
export function stepSmoke(st: RegionState, atCamp: boolean, dt: number): void {
  const filling = st.fire.lit && st.fire.indoors && !st.structures.hearth && atCamp;
  if (filling) {
    const rate = smoky(st.fire) ? SMOKE_RISE_PER_HOUR * 1.5 : SMOKE_RISE_PER_HOUR;
    st.smoke = Math.min(100, st.smoke + (rate / 60) * dt);
  } else {
    st.smoke = Math.max(0, st.smoke - (SMOKE_FALL_PER_HOUR / 60) * dt);
  }
}
```

`feltTemperature`: `if (camp && fireWarms(r)) felt += fireWarmth(r.fire, campTask);`.

`camp.ts` `stepCamp`: per region, `st.fire.unattended = st.fire.lit && !(mine && atCamp(state, world)) ? st.fire.unattended + dt : 0;` and `stepSmoke(st, mine && atCamp(state, world), dt)`; when a fire goes out, `indoors = false`, `unattended = 0`.

`weather.ts`: on `precipStarted`, `w.wetDay = true`; at the daily roll, `w.dryDays = w.wetDay ? 0 : w.dryDays + 1; w.wetDay = false;`.

`hazards.ts`, hourly:

```ts
function spread(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (!groundDry(state.weather, cal)) return;
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    if (!st.fire.lit || fuelTotal(st.fire) <= SPREAD_FUEL_KG || st.fire.unattended < SPREAD_UNATTENDED_MINUTES) continue;
    if (!rng.chance(SPREAD_PER_HOUR)) continue;
    st.wood = Math.max(0, st.wood - (10 + Math.floor(rng.next() * 21)));
    st.structures.leanTo = false;
    st.structures.boughBed = false;
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.indoors = false;
    log(state, `Smoke on the wind. The fire has spread from camp${id === state.player.region ? "" : ` at ${regionAt(world, id).name}`}.`, "bad");
  }
}
```

(`rng.next()` is whatever the `Rng` class exposes for a unit float; use its existing method name.) Also the warning: in `advance`, once per crossing, "The ground is tinder dry." when `groundDry` becomes true (a `warn` in `stepPlayer` keyed `dry`).

`tasks.ts` `lightIndoors` check: `needCamp`, requires `st.structures.cabin`, `!st.structures.hearth` ("there is a hearth: light it there" when there is one, which routes to `light` in sub-project 2), `!st.fire.lit`, drill, 1 kg dry firewood; label "Light a fire indoors", detail "no smoke hole: the cabin will fill with smoke", duration 10. Completion: as `light`, then `st.fire.indoors = true`. `light`'s completion sets `st.fire.indoors = false`. `activityOf` rest; `CAMP_TASKS`; `CAMP_BOUND`; `INTENT_GROUPS` Camp gains `{ id: "lightIndoors" }`; `skillOf` returns "building" for it like `light`, `masteryKey` returns `"light"`.

`player.ts` `stepPlayer`: `const cough = camp && r.smoke > SMOKE_COUGH;` and `workSpeed` times 0.7 when the player is at camp with smoke over 40 (read the region in `workSpeed`); `oddsFactor` times 0.5 under the same condition (pass `world` or compute in `huntOdds`, which has `state` and can read the region: put it in `huntOdds` in tasks.ts as `if (atCamp && smoke > SMOKE_COUGH) odds *= 0.5`). Smoke drain: `if (camp && state.task?.id === "sleep" && r.smoke > SMOKE_DEADLY) drains.smoke = (SMOKE_DRAIN_PER_HOUR / 60) * dt;` with a `warn(state, "co", <that condition>, "The air is thick. You wake coughing.")`. `warn(state, "smoke", camp && r.smoke > SMOKE_COUGH, "The fire is smoking the place out.")`. `Drains` gains `smoke`; `causeFrom` maps it to `"smoke"`.

`body.ts` `campCanWarm`: `if (fireWarms(st) || st.structures.leanTo || st.structures.cabin) return true;` and `fireStep` returns null when a cabin stands without a hearth and the pit's fire would not warm (the pit still lights outdoors; it warms a lean-to, not a cabin: keep `fireStep` as is, since the pit fire warms anyone at camp not in a cabin; the cabin's `shelterBonus` 15 already makes it the warmest place). No other runner change.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. If the spread test does not fire in 24 hours at 2 percent an hour with the seeded rng, run it to 48 hours; the point is the banked comparison.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/fire.ts src/sim/hazards.ts src/sim/camp.ts src/sim/weather.ts src/sim/tasks.ts src/sim/player.ts src/sim/skills.ts src/sim/body.ts src/sim/intent.ts src/sim/advance.ts src/ui/panels.ts tests/fire.test.ts
git commit -m "feat(survidle): a fire left on dry ground spreads; a fire in a closed cabin without a hearth smokes and kills a sleeper"
```

---

### Task 9: Storms, burn by ground, exhaustion on the odds

**Files:**
- Modify: `src/sim/weather.ts` (storm roll and forcing), `src/sim/advance.ts` (the warning), `src/sim/player.ts` (`feltTemperature` wind, `stepPlayer` burn and rest), `src/sim/tasks.ts` (`huntOdds`, `chop` and `fish` refusals, axe injury), `src/sim/skills.ts` (`oddsFactor`, `craftSuccess`), `src/ui/panels.ts` (`clockHtml`)
- Test: `tests/storm.test.ts` (new), `tests/player.test.ts`

**Interfaces:**
- `weather.ts`: `export function stormNow(w: Weather, minute: number): boolean; export function stormComing(w: Weather, minute: number): boolean` (from minus 60 up to from). The daily roll: chance 0.04 spring and autumn, 0.08 winter, 0.02 summer; `storm = { from: minute + 60 + rng.next() * 120, until: from + 360 + rng.next() * 720, warned: false }`. `stepWeather` forces `precip = "heavy"` while `stormNow` and marks `precipStarted` the minute it begins; when a storm ends, precipitation stops.
- `advance`: when `stormComing` and not `warned`, log "The sky is closing in from the west." (bad) and set `warned`.
- `feltTemperature`: minus 6 while `stormNow`. `stepGarments` exposure `storm` true. `huntOdds` times 0.5 in a storm. `chop` and `fish` checks refuse with "too rough".
- Burn: walking `300 / speedOf(hereTerrain, route ice)` per hour, doubled in deep snow, plus 50 overloaded. Exhaustion: `huntOdds` times 0.75 under energy 30 and 0.5 under 20; `craftSuccess` `1 - min(1, 2 * (1 - s))` under 20; axe injury 1, 2, 3 percent by the same bands; `rest` under 20 restores 4 an hour.

- [ ] **Step 1: Write the failing tests**

Create `tests/storm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { craftSuccess } from "../src/sim/skills";
import { check, huntOdds } from "../src/sim/tasks";
import { stepWeather, stormNow } from "../src/sim/weather";

const cal = calendar(0);

describe("storms", () => {
  it("a storm is announced an hour ahead, then it blows: heavy rain, six degrees of wind, half the odds, no felling or fishing", () => {
    const { state, world } = newGame(17);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 6 * 60, warned: false };
    advance(state, world, 1);
    expect(state.log.some((e) => e.text === "The sky is closing in from the west.")).toBe(true);
    const calm = feltTemperature(state, world, 5);
    advance(state, world, 60);
    expect(stormNow(state.weather, state.minute)).toBe(true);
    expect(state.weather.precip).toBe("heavy");
    expect(feltTemperature(state, world, 5)).toBeLessThan(calm - 5);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, calendar(state.minute), "chop").why).toBe("too rough");
    const d = 0.5;
    const odds = huntOdds(state, calendar(state.minute), d, "hare");
    advance(state, world, 6 * 60);
    expect(stormNow(state.weather, state.minute)).toBe(false);
    expect(huntOdds(state, calendar(state.minute), d, "hare")).toBeGreaterThan(odds * 1.5);
  });

  it("storm days come from the daily roll a few times a season", () => {
    const { state } = newGame(17);
    const w = state.weather;
    const rng = new Rng(5);
    let storms = 0;
    for (let d = 1; d <= 365; d++) {
      w.rolledDay = d - 1;
      const before = w.storm;
      stepWeather(w, calendar(d * 1440 + 8 * 60), rng, 1);
      if (w.storm && w.storm !== before) storms++;
    }
    expect(storms).toBeGreaterThan(5);
    expect(storms).toBeLessThan(40);
  });
});

describe("the body at work", () => {
  it("walking the fell burns twice what the forest does, and deep snow doubles it again", () => {
    const { state, world } = newGame(17);
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    const burnOn = (terrain: "spruce" | "fell", snow: number) => {
      const r = { ...state, weather: { ...state.weather, snowCm: snow } } as typeof state;
      // stepPlayer reads the ground under foot; stand the player on it.
      return burnForTerrain(r, world, terrain);
    };
    expect(burnOn("fell", 0)).toBeCloseTo(burnOn("spruce", 0) * 2, 0);
    expect(burnOn("spruce", 40)).toBeCloseTo(burnOn("spruce", 0) * 2, 0);
  });

  it("spent, the bow misses more, the craft spoils more, and rest gives less back", () => {
    const { state, world } = newGame(1);
    const o = huntOdds(state, cal, 0.5, "hare");
    const c = craftSuccess(state, "bow");
    state.player.energy = 25;
    expect(huntOdds(state, cal, 0.5, "hare")).toBeCloseTo(o * 0.75, 6);
    state.player.energy = 15;
    expect(huntOdds(state, cal, 0.5, "hare")).toBeCloseTo(o * 0.5, 6);
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 - Math.min(1, 2 * (1 - c)), 6);
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    const e0 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(state.player.energy - e0).toBeCloseTo(4, 1);
  });
});
```

`burnForTerrain(state, world, terrain)` is a test helper you write in the same file: find a cell of that terrain in the player's region (`regionAt(world, region).cells` with `cellAt(world, c).terrain`), `placeAt` the player there, run 60 one-minute `stepPlayer` calls at ambient 15, and return the kcal lost. If the start region has no fell, walk the region list (`world.regions`) for one that has, and place there. Keep the helper honest: no mocking of the ground.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/storm.test.ts`
Expected: FAIL: `stormNow` is not exported.

- [ ] **Step 3: Implement**

`weather.ts`:

```ts
export function stormNow(w: Weather, minute: number): boolean {
  return w.storm !== null && minute >= w.storm.from && minute < w.storm.until;
}

export function stormComing(w: Weather, minute: number): boolean {
  return w.storm !== null && minute >= w.storm.from - 60 && minute < w.storm.from;
}

const STORM_CHANCE: Record<Season, number> = { spring: 0.04, summer: 0.02, autumn: 0.04, winter: 0.08 };
```

In the daily roll: `if (!w.storm && rng.chance(STORM_CHANCE[cal.season])) { const from = minute + 60 + rng.next() * 120; w.storm = { from, until: from + 360 + rng.next() * 720, warned: false }; }` where `minute` is passed into `stepWeather` (add a `minute` parameter; `advance` passes `state.minute`; the tests above call `stepWeather(w, cal, rng, 1)` today, so give `minute` a default of `cal.dayIndex * 1440 + cal.hour * 60`). In the precipitation block: `if (stormNow(w, minute)) { if (w.precip !== "heavy") { w.precip = "heavy"; ev.precipStarted = true; } } else if (w.storm && minute >= w.storm.until) { w.storm = null; if (w.precip !== "none") { w.precip = "none"; ev.precipStopped = true; } }` before the ordinary start and stop rolls.

`advance.ts` `step`: after `stepWeather`, `if (state.weather.storm && !state.weather.storm.warned && stormComing(state.weather, state.minute)) { state.weather.storm.warned = true; log(state, "The sky is closing in from the west.", "bad"); }`.

`player.ts`: `feltTemperature` subtracts 6 when `stormNow(state.weather, state.minute)`. `stepPlayer` burn:

```ts
  let burn = KCAL_PER_HOUR[a];
  if (a === "walk") {
    burn = 300 / Math.max(0.25, speedOf(hereTerrain(state, world), state.route?.ice ?? "none"));
    if (w.snowCm > DEEP_SNOW_CM) burn *= 2;
    if (carried(p) > PACK_COMFORTABLE_KG) burn += 50;
  }
```

and the energy line: `a === "rest" && state.task?.id === "rest" ? (p.energy < 20 ? 4 : 6)`.

`tasks.ts` `huntOdds`: `if (stormNow(state.weather, state.minute)) odds *= 0.5; if (state.player.energy < 20) odds *= 0.5; else if (state.player.energy < 30) odds *= 0.75;`. `chop` and `fish` checks: `if (stormNow(state.weather, state.minute)) return { ...o, ok: false, why: "too rough" };` after the ground check. The axe injury in `chop` completion: `const injury = p.energy < 20 ? 0.03 : p.energy < 30 ? 0.02 : 0.01;`.

`skills.ts` `craftSuccess`: `let s = 0.5 ** gap(...) * handFactors; if (state.player.energy < 20) s = 1 - Math.min(1, 2 * (1 - s)); return s;`.

`panels.ts` `clockHtml`: `${state.weather.storm && stormNow(...) ? `<span class="bad">storm, ${fmtDuration(state.weather.storm.until - state.minute)} left</span>` : ""}` and `${groundDry(state.weather, cal) ? `<span class="bad">tinder dry</span>` : ""}`.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. `tests/player.test.ts` "burns about 100 kcal per idle hour and more when chopping" is unaffected (chopping is heavy, not walking). The weather tests' month-long precipitation test may now include a storm; its assertions are about starts and stops and still hold.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/weather.ts src/sim/advance.ts src/sim/player.ts src/sim/tasks.ts src/sim/skills.ts src/ui/panels.ts tests/storm.test.ts
git commit -m "feat(survidle): storms announced an hour ahead; walking burns by the ground; exhaustion spoils the odds"
```

---

### Task 10: The runner: thirst, storm, home before dark, banking the fire

**Files:**
- Modify: `src/sim/types.ts` (`BodyNeed`), `src/sim/body.ts`, `src/sim/intent.ts` (`walkTo`), `src/sim/fire.ts` (`bankFire`)
- Test: `tests/body.test.ts`

**Interfaces:**
- `BodyNeed = "sleep" | "storm" | "cold" | "hungry" | "thirsty" | "home"` in that priority after sleep: storm, cold, hungry, thirsty, home.
- `body.ts`: `currentNeed` returns `"storm"` while `stormComing` or `stormNow`; `"thirsty"` under `THIRSTY_L`; `"home"` in winter by day when `sunset` minus now is at most the walk to camp plus 15 minutes. `bodyStep` for storm: walk to camp, feed the fire to 12 kg from dry wood in reach (instant), then `rest` "waiting out the storm" (or the sleep need takes over); for thirsty: `drink` in reach (instant, null), else walk to the region's shore spot when `waterSource` would be true there, else walk to camp and `melt` when a fire burns there and snow lies, else null; for home: walk to camp, then `rest` "in before dark".
- `fire.ts`: `export function bankFire(state, world, region): number` lowers a lit fire over 6 kg to 6 kg, dry surplus back to the camp pile as firewood and wet as wet firewood; returns kg banked. `walkTo` calls it when leaving the home camp.

- [ ] **Step 1: Write the failing tests**

Append to `tests/body.test.ts`:

```ts
describe("the runner in the elements", () => {
  it("drinks from a vessel, else walks to the shore, else melts snow at the fire", () => {
    const { g, state, world, camp } = felling(42);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.water = 0.8;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 });
    advance(state, world, 1);
    expect(state.player.water).toBeGreaterThan(2.5);
    expect(state.task?.id).toBe("chop");
    state.player.tools = state.player.tools.filter((t) => t.id !== "barkBucket");
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    expect(state.intent?.step).toBe("walking to the shore for water");
    expect(until(g, () => state.player.water >= 3)).toBe(true);
    // Iced over: melt at camp instead, when a fire burns there.
    state.weather.iceCm = 4;
    state.weather.snowCm = 5;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.water = 0.8;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    advance(state, world, 1);
    expect(state.intent?.step).toBe("walking to camp for water");
    expect(until(g, () => state.task?.id === "melt")).toBe(true);
  });

  it("a storm sends it home, keeps the fire fed, and it waits under the roof until the storm passes", () => {
    const { g, state, world, camp } = felling(17);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 4;
    addItem(pile(state, camp), "firewood", 20);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 4 * 60, warned: false };
    advance(state, world, 1);
    expect(state.intent?.need).toBe("storm");
    expect(state.intent?.step).toBe("walking to camp before the storm");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(st.fire.fuelKg).toBeGreaterThanOrEqual(12);
    expect(state.intent?.step).toBe("waiting out the storm");
    expect(until(g, () => state.intent?.need !== "storm", 600)).toBe(true);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
  });

  it("in winter it leaves the work so as to be at camp by sunset", () => {
    const { g, state, world, camp } = felling(17);
    state.minute = 280 * 1440;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    const c = calendar(state.minute);
    expect(c.season).toBe("winter");
    let arrivedAt = -1;
    until(g, () => {
      if (cellOf(state, world) === camp && arrivedAt < 0) arrivedAt = calendar(state.minute).hour;
      return arrivedAt >= 0;
    }, 900);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(arrivedAt).toBeLessThanOrEqual(calendar(state.minute).sunset + 0.05);
    expect(state.intent?.need === "home" || state.intent?.need === "sleep").toBe(true);
  });

  it("banks a big fire before walking off camp", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.task?.id).toBe("walk");
    expect(st.fire.fuelKg).toBeCloseTo(6, 6);
    expect(qty(pile(state, st.campCell), "firewood")).toBeCloseTo(24, 6);
  });
});
```

`felling(seed)` is the helper already in that file. Imports: `addItem, pile, qty` from inventory.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/body.test.ts`
Expected: FAIL: `need` never becomes "thirsty".

- [ ] **Step 3: Implement**

`types.ts`: `export type BodyNeed = "sleep" | "storm" | "cold" | "hungry" | "thirsty" | "home";`.

`fire.ts`:

```ts
export const BANKED_KG = 6;

/** Lets a lit fire down to a few kilos before you leave it; the surplus goes back on the pile. */
export function bankFire(state: GameState, world: World, region: number): number {
  const st = regionState(state, world, region);
  if (!st.fire.lit) return 0;
  const total = fuelTotal(st.fire);
  if (total <= BANKED_KG) return 0;
  const surplus = total - BANKED_KG;
  const wetShare = st.fire.wetKg / total;
  const wet = surplus * wetShare;
  const dry = surplus - wet;
  st.fire.wetKg -= wet;
  st.fire.fuelKg -= dry;
  const to = pile(state, st.campCell);
  if (dry > 1e-9) addItem(to, "firewood", dry);
  if (wet > 1e-9) addItem(to, "wetFirewood", wet);
  return surplus;
}
```

`intent.ts` `walkTo`: after `if (here === it.campCell) provision(state, world);` add `if (here === it.campCell && cell !== it.campCell) bankFire(state, world, state.player.region);`.

`body.ts`:

```ts
export function currentNeed(state: GameState, world: World, cal: Calendar, it: Intent): BodyNeed | null {
  const p = state.player;
  const sleep = it.need === "sleep"
    || p.energy <= SLEEP_AT
    || (cal.isNight && p.energy < NIGHT_SLEEP_UNDER)
    || (it.task === "night" && it.done < 1);
  if (sleep) return "sleep";
  if (stormComing(state.weather, state.minute) || stormNow(state.weather, state.minute)) return "storm";
  if (p.warmth >= WARM_AT) it.coldSpent = false;
  const cold = !it.coldSpent && (p.warmth < COLD_UNDER || (it.need === "cold" && p.warmth < WARM_AT));
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (p.kcal < HUNGRY_UNDER) return "hungry";
  if (p.water < THIRSTY_L) return "thirsty";
  if (homeBeforeDark(state, world, cal)) return "home";
  return null;
}

/** Winter days are short: leave the work so as to reach camp by sunset. */
function homeBeforeDark(state: GameState, world: World, cal: Calendar): boolean {
  if (cal.season !== "winter" || cal.isNight) return false;
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here === st.campCell) return (cal.sunset - cal.hour) * 60 <= 15;
  const route = findRoute(world, here, st.campCell, iceMode(state.weather) === "safe" ? "safe" : "none");
  if (!route) return false;
  const minutes = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather));
  return (cal.sunset - cal.hour) * 60 <= minutes + 15;
}
```

`bodyStep`:

```ts
export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent, need: BodyNeed): Step | null {
  switch (need) {
    case "hungry": return hungryStep(state, world, cal, rng, it);
    case "thirsty": return thirstyStep(state, world, cal, it);
    case "storm": return stormStep(state, world, cal, it);
    case "home": return homeStep(state, world, cal);
    default: return campStep(state, world, cal, it, need);
  }
}

function thirstyStep(state: GameState, world: World, cal: Calendar, it: Intent): Step | null {
  if (drink(state, world)) return null;
  const r = regionAt(world, state.player.region);
  const shore = spotOf(r, "shore");
  if (shore && state.weather.iceCm < ICE_SHORE_CM && shore.cell !== cellOf(state, world) && check(state, world, cal, "walk", `cell:${shore.cell}`).ok) {
    return walkStep(state, world, shore.cell, " for water");
  }
  const st = regionState(state, world, state.player.region);
  if (st.fire.lit && state.weather.snowCm >= 1) {
    if (cellOf(state, world) !== st.campCell) {
      return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " for water") : null;
    }
    return check(state, world, cal, "melt").ok ? { id: "melt", step: "melting snow" } : null;
  }
  return null;
}

function stormStep(state: GameState, world: World, cal: Calendar, it: Intent): Step | null {
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before the storm") : null;
  }
  if (st.fire.lit && fuelTotal(st.fire) < SPREAD_FUEL_KG) feedFire(state, world, state.player.region, SPREAD_FUEL_KG - fuelTotal(st.fire));
  return { id: "rest", step: "waiting out the storm" };
}

function homeStep(state: GameState, world: World, cal: Calendar): Step | null {
  const st = regionState(state, world, state.player.region);
  if (cellOf(state, world) !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before dark") : null;
  }
  return { id: "rest", step: "in before dark" };
}
```

`walkStep(..., " for water")` yields "walking to the shore for water" because `whereIs` names the shore spot "the shore"; the camp cell gives "walking to camp for water".

`stepTask`'s `coldSpent` logic keys on `need === "cold"` and is untouched; a storm rest never sets it.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. If seed 42's shore is the camp cell itself, the thirst test's first walk will not happen; pick a seed whose shore spot is not the camp and say so in the test.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/types.ts src/sim/body.ts src/sim/intent.ts src/sim/fire.ts tests/body.test.ts
git commit -m "feat(survidle): the runner drinks, shelters from a storm, is home before dark in winter, and banks the fire it leaves"
```

---

### Task 11: The death screen, the README, and a browser pass

**Files:**
- Modify: `src/ui/panels.ts` (`deathHtml`), `docs/README.md`, the spec's decision list if anything drifted
- Test: `tests/ui.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/ui.test.ts`:

```ts
  it("the death screen tells the last three lines before the end", () => {
    const { state, world } = newGame(3);
    state.log.push({ minute: 100, text: "You are thirsty.", kind: "bad" });
    state.log.push({ minute: 200, text: "You are starving.", kind: "bad" });
    state.log.push({ minute: 300, text: "The shore is iced over.", kind: "bad" });
    state.dead = { cause: "thirst", minute: 301 };
    const html = deathHtml(state, world, calendar(301));
    expect(html).toContain("Thirst took you.");
    expect(html).toMatch(/You are thirsty\..*You are starving\..*The shore is iced over\./s);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/ui.test.ts`
Expected: FAIL: the death screen has no story lines.

- [ ] **Step 3: Implement**

`deathHtml`: after the cause paragraph, `<div class="entries">` with the last three log entries whose minute is at or before `d.minute`, excluding the death line itself, rendered with `fmtLogTime` like the log panel.

`docs/README.md`, under "How it plays", a new bullet after "Body":

```markdown
- **The elements.** Water is a reserve like food: drink at a shore, carry it
  in a bark bucket or a waterskin, melt snow at the fire in winter for a kilo
  of wood a litre. Lakes freeze; thin ice is a shortcut that can take you,
  safe ice is a road until it melts and strands you. Clothing gets wet
  garment by garment and a soaked coat is half a coat; wet boots in frost
  are frostbite, which heals only by a fire under a roof and can cost toes.
  Wood split in rain is wet wood that smokes and gives half the heat; rain
  makes lighting chancy and eats the fire. A fire left big on dry August
  ground can spread. A fire inside a closed cabin without a hearth fills it
  with smoke and can kill you in your sleep. Storms are announced an hour
  ahead. Spent, you miss more, spoil more and recover slower. The runner
  drinks, shelters from a storm, is home before dark in winter and banks
  the fire it leaves, and nothing more.
```

and in "Where the numbers live": `water.ts`, `clothing.ts`, `fire.ts`, `hazards.ts` one line each.

- [ ] **Step 4: Browser pass**

`npm run dev -- --port 5177 --strictPort` from `08-survidle/`, open `http://127.0.0.1:5177/prototypes/08/?seed=17&speed=60` in Chrome (the `mcp__chrome-devtools__*` tools, or the extension). Check: the Water bar drains and auto-drink at a shore refills it; garment wet bars rise in rain (force `state.weather.precip = "heavy"` from the console) and fall by a fire; the fuel bar shows wet wood; force a storm (`state.weather.storm = { from: state.minute + 60, until: state.minute + 300, warned: false }`) during a felling intent and watch the runner walk home, feed the fire and wait it out; set `state.weather.iceCm = 8` and confirm the map's `=` glyphs and the "across the ice" button. Record what you saw in the report; stop the server.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/ui/panels.ts docs/README.md tests/ui.test.ts
git commit -m "docs(survidle): the elements in the README, and a death screen that tells the last three lines"
```

---

## Self-review against the spec

- 1.1 to 1.5 water, drinking, melting, vessels, the runner's thirst: Tasks 2, 3, 10.
- 1.6 ice: Task 4.
- 2.1 per-garment wetness, 2.2 frostbite: Tasks 5, 6.
- 3.1 wet wood, 3.2 fire and weather: Task 7. 3.3 spread, 3.4 smoke: Task 8. 3.5 storms: Task 9.
- 4.1 burn by ground, 4.2 exhaustion, 4.3 warnings and deaths: Task 9 (burn, odds), warnings spread across Tasks 2, 4, 6, 8, 9, deaths in Task 1 and the story lines in Task 11.
- 5 the runner: Task 10.
- 6 UI: Tasks 2, 4, 5, 6, 7, 9, 11.
- 7 persistence: Task 1.
- 8 tests: each task; the browser pass in Task 11.
- 9 out of scope: nothing here builds the hearth, woodshed or covered pit; `structures.hearth` is a field with a rule, not a build.
