# Survidle baseline implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The seven baseline fixes and the reference player from the spec, so a camp set up by orders holds from 1 April to 1 December on four seeds while the tab is closed.

**Architecture:** Tools become countable items so spares are stock; water and ice become pile items whose capacity is the vessels lying at camp; three new tasks (`fill`, `iceHole`, `hang`) make water and drying orderable; the runner's need order and provisioning change; splitting waits for dry ground; the start filter wants a shore and an outcrop. `src/sim/reference.ts` holds the reference order list and a headless runner, `scripts/reference.ts` prints its verdict, and a fast vitest keeps the list honest.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom), vite-node for scripts. All commands run from `08-survidle/`.

**Spec:** `docs/superpowers/specs/2026-09-03-survidle-baseline-design.md`. Read it first; every task below cites its section.

## Global Constraints

- Every quantity is real: litres, kilograms, minutes. No abstract points.
- No em dashes, no unicode arrows or fancy quotes in any text, code or commit message. Hyphens and ASCII only.
- Comments explain, never chronicle: no "was X, now Y", no dates.
- `npm test` must stay fast (under a few seconds). Anything slow goes behind its own script.
- `npm test` and `npm run build` must pass before every commit. Run `npx biome lint <files>` from the repo root on changed files.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`.
- Log lines are plain sentences. The reasons a task gives (`why`) are lowercase fragments like the existing ones: "needs an axe", "walk to camp".
- Save version becomes 4; a version 3 file must still load.
- The runner adds no safety nets beyond what the spec names.

## File map

| file | change |
|---|---|
| `src/sim/types.ts` | `CountItem` gains `ToolId`; `KgItem` gains `water`, `ice`; `TaskId` gains `fill`, `iceHole`, `hang`; `RegionState.iceHole` |
| `src/sim/items.ts` | tool kilos and names in `ITEM_KG`/`ITEM_NAMES`; `Recipe.out` loses `tool`; tool recipes yield items; water and ice |
| `src/sim/inventory.ts` | `takeUp`, `toolNear`, `wearTool(state, ...)` with spare take-up; `produce` never pockets water |
| `src/sim/water.ts` | vessel constants, `campWaterCapacity`, `campWaterRoom`, `pourVessels`, `drink` from camp water, `waterSource` with the ice hole |
| `src/sim/hazards.ts` | camp water freezes |
| `src/sim/camp.ts` | camp ice thaws by a fed fire; the ice hole skins over at 04:00 |
| `src/sim/tasks.ts` | `toolFor`, take-up in `beginTask`; `fill`, `iceHole`, `hang` checks and effects; split waits for dry weather; `thaw` thaws camp ice |
| `src/sim/intent.ts` | `yieldItem`/`yieldItems` for the new tasks; `packCarries` for fill; `dropEverything` pours and keeps arrows; fill opens the hole; GERUNDs |
| `src/sim/orders.ts` | a water keep past capacity is skipped with its reason |
| `src/sim/body.ts` | need order; `canFeed`; thirsty step drinks camp water, lights the fire to melt; provisioning pockets arrows |
| `src/sim/skills.ts` | skill and mastery keys for the new tasks |
| `src/sim/save.ts` | version 4, `iceHole` default |
| `src/sim/regionstate.ts` | `iceHole: null` |
| `src/sim/actions.ts` | `itemLabel` says litres; `loadRack` stays as the hang effect |
| `src/world/gen.ts` | `findStart` wants shore and outcrop; exports `startRing` |
| `src/ui/panels.ts`, `src/main.ts` | the rack button becomes the hang task; camp water in the Camp panel; new tasks in the Do panel |
| `src/sim/reference.ts` | `REFERENCE_ORDERS`, `runReference` |
| `scripts/reference.ts` | prints per-seed verdicts, exit 1 on a failure |
| `package.json` | `"reference": "vite-node scripts/reference.ts"` |
| `tests/tools.test.ts`, `tests/water.test.ts`, `tests/fill.test.ts`, `tests/needs.test.ts`, `tests/hang.test.ts`, `tests/start.test.ts`, `tests/reference.test.ts` | new |
| `README.md` | camp water, spares, the hang task, `npm run reference` |

Existing test helpers to copy from `tests/body.test.ts`: `until(g, pred, max)` advances a minute at a time; `felling()` sets up a run on seed 17. `calendar(0)` is 1 April 06:00 in run terms; `START_MINUTE_OF_DAY` is exported from `src/sim/calendar.ts`.

---

### Task 1: Tools as items

Spec section 1 and section 9.

**Files:**
- Modify: `src/sim/types.ts:20-27` (CountItem), `src/sim/items.ts` (ITEM_KG, ITEM_NAMES, Recipe, RECIPES), `src/sim/inventory.ts:205-223`, `src/sim/tasks.ts` (check tool tests, beginTask, craft effect, wearTool calls), `src/sim/save.ts:15-30`
- Test: `tests/tools.test.ts`

**Interfaces:**
- Produces: `takeUp(state: GameState, world: World, id: ToolId): boolean` in `inventory.ts`; `toolNear(p: Player, id: ToolId, invs: Inventory[]): boolean`; `wearTool(state: GameState, id: ToolId, n: number): boolean` (breaks -> true; a spare in the pack is taken up first and logged); `toolFor(id: TaskId, arg?: string): ToolId | null` in `tasks.ts`.
- `RECIPES[x].out` is `{ item, qty }` or `{ clothing }`; `yieldItem("craft", "axe")` returns `"axe"`.

- [ ] **Step 1: Write the failing tests**

`tests/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem } from "../src/sim/intent";
import { addItem, hasTool, pile, qty, takeUp, tool, wearTool } from "../src/sim/inventory";
import { ITEM_KG, RECIPES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { addOrder, keepTarget } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, check } from "../src/sim/tasks";

const cal = calendar(0);

describe("tools as items", () => {
  it("a tool recipe yields a countable item, so a keep on it stays a keep", () => {
    expect(RECIPES.axe.out).toEqual({ item: "axe", qty: 1 });
    expect(yieldItem("craft", "axe")).toBe("axe");
    expect(ITEM_KG.axe).toBe(1.5);
    const { state, world } = newGame(17);
    const o = addOrder(state, world, { task: "craft", arg: "axe", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(keepTarget(o)).toEqual({ item: "axe", qty: 1 });
  });

  it("a broken axe with a spare in the pack is replaced at once", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    tool(p, "axe")!.durability = 1;
    addItem(p.pack, "axe", 1);
    expect(wearTool(state, "axe", 5)).toBe(true);
    expect(hasTool(p, "axe")).toBe(true);
    expect(tool(p, "axe")!.durability).toBe(100);
    expect(qty(p.pack, "axe")).toBe(0);
    expect(state.log.at(-1)?.text).toBe("The axe has broken; you take up the spare.");
  });

  it("a broken axe with no spare is gone", () => {
    const { state } = newGame(17);
    tool(state.player, "axe")!.durability = 1;
    expect(wearTool(state, "axe", 5)).toBe(true);
    expect(hasTool(state.player, "axe")).toBe(false);
  });

  it("a spare on the ground is taken up when a task needing it starts there", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.tools = [];
    const camp = regionState(state, world, p.region).campCell;
    placeAt(state, world, camp);
    addItem(pile(state, camp), "log", 1);
    expect(check(state, world, cal, "split").ok).toBe(false);
    addItem(pile(state, camp), "axe", 1);
    expect(check(state, world, cal, "split").ok).toBe(true);
    expect(beginTask(state, world, cal, "split")).toBe(true);
    expect(hasTool(p, "axe")).toBe(true);
    expect(qty(pile(state, camp), "axe")).toBe(0);
  });

  it("a vessel taken up is empty and thawed", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "barkBucket", 1);
    expect(takeUp(state, world, "barkBucket")).toBe(true);
    expect(tool(state.player, "barkBucket")).toEqual({ id: "barkBucket", durability: 100, litres: 0, frozen: false });
  });

  it("crafting a tool you hold makes a spare; one you lack is taken up", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    const camp = regionState(state, world, p.region).campCell;
    placeAt(state, world, camp);
    addItem(p.pack, "stone", 2);
    addItem(p.pack, "stick", 1);
    addItem(p.pack, "cordage", 1);
    expect(beginTask(state, world, cal, "craft", "knife")).toBe(true);
    advance(state, world, 60);
    expect(hasTool(p, "knife")).toBe(true);
    expect(qty(p.pack, "knife")).toBe(0);
    addItem(p.pack, "stone", 2);
    addItem(p.pack, "stick", 1);
    addItem(p.pack, "cordage", 1);
    expect(beginTask(state, world, cal, "craft", "knife")).toBe(true);
    advance(state, world, 60);
    expect(qty(p.pack, "knife")).toBe(1);
  });

  it("saves are version 4 and a version 3 file still loads", () => {
    const { state } = newGame(17);
    const raw = JSON.parse(serialize(state));
    expect(raw.version).toBe(4);
    raw.version = 3;
    expect(deserialize(JSON.stringify(raw))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/tools.test.ts`
Expected: FAIL (type errors on `takeUp`, `wearTool(state, ...)`, `RECIPES.axe.out.item`).

- [ ] **Step 3: Types and items**

`src/sim/types.ts`: change `CountItem` to

```ts
/** Items counted in pieces. A tool not in hand is one of these. */
export type CountItem =
  | "log" | "stick" | "bark" | "cordage" | "stone" | "bone" | "sinew"
  | "snare" | "arrow" | "torch"
  | ToolId;
```

`src/sim/items.ts`:
- `ITEM_KG`: add `axe: 1.5, knife: 0.2, bow: 0.8, fishingSpear: 1.0, fireDrill: 0.3, needle: 0.01, barkBucket: 0.3, waterskin: 0.4`.
- `ITEM_NAMES`: add `axe: "axes", knife: "knives", bow: "bows", fishingSpear: "fishing spears", fireDrill: "fire drills", needle: "bone needles", barkBucket: "bark buckets", waterskin: "waterskins"`.
- `Recipe.out` becomes `{ clothing?: ClothingId; item?: ItemId; qty?: number }`.
- Every recipe with `out: { tool: X }` becomes `out: { item: X, qty: 1 }` (knife, fireDrill, bow, fishingSpear, needle, axe, barkBucket, waterskin).
- `TOOL_IDS` export: `export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];`

- [ ] **Step 4: Inventory: take up, tool near, wear with a spare**

In `src/sim/inventory.ts` replace `wearTool` and add below `hasTool`:

```ts
/** A tool in hand, or one lying in any of these inventories waiting to be taken up. */
export function toolNear(p: Player, id: ToolId, invs: Inventory[]): boolean {
  return hasTool(p, id) || totalQty(invs, id) > 0;
}

/** A fresh tool: full durability, and a vessel starts empty and thawed. */
function freshTool(id: ToolId): Tool {
  return TOOLS[id].litres !== undefined ? { id, durability: 100, litres: 0, frozen: false } : { id, durability: 100 };
}

/**
 * Takes one of this tool out of the pack, else off the ground under foot,
 * into the hands at full durability. False when there is none in reach. A
 * tool in hand is never put down, so durability never lives in a pile.
 */
export function takeUp(state: GameState, world: World, id: ToolId): boolean {
  const p = state.player;
  for (const inv of [p.pack, herePile(state, world)]) {
    if (removeItem(inv, id, 1) < 1) continue;
    p.tools = p.tools.filter((t) => t.id !== id);
    p.tools.push(freshTool(id));
    return true;
  }
  return false;
}

/** Wears a tool by n points; returns true if it broke. A spare in the pack is taken up in the same breath. */
export function wearTool(state: GameState, id: ToolId, n: number): boolean {
  const p = state.player;
  const t = tool(p, id);
  if (!t) return false;
  t.durability -= n;
  if (t.durability > 0) return false;
  p.tools = p.tools.filter((x) => x !== t);
  if (removeItem(p.pack, id, 1) >= 1) {
    p.tools.push(freshTool(id));
    log(state, `The ${TOOLS[id].name} has broken; you take up the spare.`);
  }
  return true;
}
```

Import `log` from `./log` and `Tool` from `./types`. `takeUp` calls `herePile`, defined earlier in the same file.

- [ ] **Step 5: Tasks: the tool a task needs, checks, take-up, craft**

In `src/sim/tasks.ts` add after `WORK_TASKS`:

```ts
/** The tool a task swings, or null. What check looks for in reach and beginTask takes up. */
export function toolFor(id: TaskId, arg?: string): ToolId | null {
  switch (id) {
    case "chop": case "split": return "axe";
    case "hunt": return "bow";
    case "fish": return "fishingSpear";
    case "craft": return RECIPES[arg as RecipeId]?.tool ?? null;
    case "repair": return "needle";
    case "light": case "lightIndoors": return "fireDrill";
    default: return null;
  }
}
```

In `checkFresh`, replace each tool test with `toolNear(p, X, invs)`:
- chop: `if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };`
- split: same.
- hunt (both branches): `toolNear(p, "bow", invs)`.
- fish (both branches): `toolNear(p, "fishingSpear", invs)`.
- craft: `if (rec.tool && !toolNear(p, rec.tool, invs))`.
- repair: `toolNear(p, "needle", invs)`.
- light: `toolNear(p, "fireDrill", invs)`. `lightIndoors` shares the light check; follow the same line there if it has its own.
- `sharpen` and `lightTorch` keep `tool`/`hasTool`: a spare axe is not sharpened and a torch lights from any drill in hand.

In `beginTask`, after `const o = check(...); if (!o.ok) return false;` and before `setAside`:

```ts
  const need = toolFor(id, arg);
  if (need && !hasTool(state.player, need)) takeUp(state, world, need);
```

In `complete`, case `"craft"`: delete the `if (rec.out.tool) { ... }` branch. The item branch becomes:

```ts
      } else if (rec.out.item) {
        const item = rec.out.item;
        produce(state, world, item, rec.out.qty ?? 1);
        if (item in TOOLS) {
          if (hasTool(p, item as ToolId)) log(state, `You have a spare ${rec.name}.`, "good");
          else if (takeUp(state, world, item as ToolId)) log(state, `You have a ${rec.name}.`, "good");
        }
      }
```

Change every `wearTool(p, ...)` in `tasks.ts` to `wearTool(state, ...)` (eight sites: chop, hunt, fish, craft twice, repair, light, lightTorch). Import `takeUp`, `toolNear` from `./inventory`; `ToolId` from `./types`.

`src/sim/save.ts`: `SaveFile.version: 4`, `serialize` writes 4, `deserialize` accepts `file?.version !== 3 && file?.version !== 4` as the reject test.

- [ ] **Step 6: Run the tests, the whole suite, typecheck**

Run: `npx vitest run tests/tools.test.ts && npm test && npm run typecheck`
Expected: PASS. If `tests/camp.test.ts` or `tests/tasks.test.ts` call `wearTool(p, ...)` or read `RECIPES.x.out.tool`, update them to the new shape; they are asserting the same behaviour.

- [ ] **Step 7: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src 08-survidle/tests)
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/inventory.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/save.ts 08-survidle/tests
git commit -m "feat(survidle): a tool not in hand is a countable item; a spare is taken up when the tool breaks or the work starts"
```

(`cd ..` is only for the root lint; every other command runs in `08-survidle/`. Git paths are relative to the repo root because the worktree root is one level up.)

---

### Task 2: Water and ice at camp

Spec sections 2.1, 2.3, and the pour of 2.2. No new tasks yet; this task makes the stock exist, freeze, thaw and be drunk.

**Files:**
- Modify: `src/sim/types.ts:24-26`, `src/sim/items.ts` (ITEM_KG, KG_ITEMS, ITEM_NAMES), `src/sim/actions.ts:98-101`, `src/sim/inventory.ts:167-176`, `src/sim/water.ts`, `src/sim/hazards.ts:102-121`, `src/sim/camp.ts:16-66`, `src/sim/tasks.ts` (thaw effect), `src/sim/intent.ts:271-275` (dropEverything pours)
- Test: `tests/water.test.ts`

**Interfaces:**
- Produces in `water.ts`: `VESSELS: ToolId[]`; `campWaterCapacity(inv: Inventory): number`; `campWaterRoom(inv: Inventory): number`; `pourVessels(p: Player, inv: Inventory): number` (litres poured); `campPileHere(state, world): Inventory | null` (the camp pile when standing on this region's camp cell).
- `drink(state, world)` also drinks camp water under foot.

- [ ] **Step 1: Write the failing tests**

`tests/water.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { hourlyHazards } from "../src/sim/hazards";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { itemLabel } from "../src/sim/actions";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { campWaterCapacity, drink, pourVessels } from "../src/sim/water";

const cal = calendar(0);

function atCamp(seed = 17) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  return { g, state, world, st, camp: pile(state, st.campCell) };
}

describe("water at camp", () => {
  it("capacity is the vessels lying at camp, and a pour stops at the cap", () => {
    const { state, world, camp } = atCamp();
    expect(campWaterCapacity(camp)).toBe(0);
    addItem(camp, "barkBucket", 1);
    addItem(camp, "waterskin", 1);
    expect(campWaterCapacity(camp)).toBe(5);
    addItem(state.player.pack, "waterskin", 1);
    takeUp(state, world, "waterskin");
    state.player.tools.find((t) => t.id === "waterskin")!.litres = 3;
    addItem(camp, "water", 4);
    expect(pourVessels(state.player, camp)).toBe(1);
    expect(qty(camp, "water")).toBe(5);
    expect(state.player.tools.find((t) => t.id === "waterskin")!.litres).toBe(2);
    expect(itemLabel("water", 5)).toBe("5.0 l water");
  });

  it("standing at camp, you drink the camp water", () => {
    const { state, world, camp } = atCamp();
    state.player.water = 1;
    addItem(camp, "barkBucket", 1);
    addItem(camp, "water", 2);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(3);
    expect(qty(camp, "water")).toBe(0);
  });

  it("camp water freezes without a fire under -5 C and thaws by a fed fire", () => {
    const { state, world, st, camp } = atCamp();
    // Under half the capacity, so no bucket rolls a split and the numbers are exact.
    addItem(camp, "barkBucket", 2);
    addItem(camp, "water", 1.5);
    hourlyHazards(state, world, cal, -8, -8, new Rng(1));
    expect(qty(camp, "water")).toBe(0);
    expect(qty(camp, "ice")).toBeCloseTo(1.5, 5);
    expect(qty(camp, "barkBucket")).toBe(2);
    expect(state.log.some((l) => l.text === "The water at camp has frozen.")).toBe(true);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    // Two litres an hour: half an hour thaws one.
    advance(state, world, 30);
    expect(qty(camp, "ice")).toBeCloseTo(0.5, 2);
    expect(qty(camp, "water")).toBeCloseTo(1, 2);
  });

  it("a fire at camp keeps the water from freezing", () => {
    const { state, world, st, camp } = atCamp();
    addItem(camp, "barkBucket", 1);
    addItem(camp, "water", 2);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    hourlyHazards(state, world, cal, -8, -8, new Rng(1));
    expect(qty(camp, "water")).toBe(2);
  });

  it("water is never pocketed: produce puts it on the ground", () => {
    const { state, world } = atCamp();
    expect(produce(state, world, "water", 1)).toBe("pile");
  });
});
```

Add `produce` to the `../src/sim/inventory` import line.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/water.test.ts`
Expected: FAIL on missing exports.

- [ ] **Step 3: Items and labels**

`src/sim/types.ts`: `KgItem` gains `| "water" | "ice"` with the comment `/** Litres, at a kilo a litre; only ever in a pile. */` on the line.
`src/sim/items.ts`: `ITEM_KG` add `water: 1, ice: 1`; `KG_ITEMS` add both; `ITEM_NAMES` add `water: "water", ice: "ice"`.
`src/sim/actions.ts` `itemLabel`:

```ts
export function itemLabel(item: ItemId, q: number): string {
  if (item === "water" || item === "ice") return `${q.toFixed(1)} l ${ITEM_NAMES[item]}`;
  if (ITEM_KG[item] === 1) return `${q >= 10 ? Math.round(q) : q.toFixed(1)} kg ${ITEM_NAMES[item]}`;
  return `${Math.round(q)} ${ITEM_NAMES[item]}`;
}
```

`src/sim/inventory.ts` `produce`: the pack condition becomes `item !== "log" && item !== "water" && item !== "ice" && weight(...) <= ...`.

- [ ] **Step 4: water.ts**

Add to `src/sim/water.ts`:

```ts
/** What holds water when it is left at camp. */
export const VESSELS: ToolId[] = ["barkBucket", "waterskin"];
/** Litres an hour a fed fire thaws at camp. */
export const THAW_L_PER_HOUR = 2;

/** Litres the vessels lying in this pile can hold between them. */
export function campWaterCapacity(inv: Inventory): number {
  let l = 0;
  for (const v of VESSELS) l += qty(inv, v) * (TOOLS[v].litres ?? 0);
  return l;
}

/** Room left in this pile's vessels: capacity less the water and ice already in them. */
export function campWaterRoom(inv: Inventory): number {
  return Math.max(0, campWaterCapacity(inv) - qty(inv, "water") - qty(inv, "ice"));
}

/** Empties the carried vessels into the pile's vessels as far as they have room. Returns litres poured. */
export function pourVessels(p: Player, inv: Inventory): number {
  let room = campWaterRoom(inv);
  let poured = 0;
  for (const t of p.tools) {
    if (room <= 1e-9) break;
    if (t.frozen || !(t.litres ?? 0)) continue;
    const put = Math.min(room, t.litres!);
    t.litres! -= put;
    room -= put;
    poured += put;
  }
  if (poured > 1e-9) addItem(inv, "water", poured);
  return poured;
}

/** This region's camp pile, when standing on its camp cell; null anywhere else. */
export function campPileHere(state: GameState, world: World): Inventory | null {
  const st = state.regions[state.player.region];
  if (!st || cellOf(state, world) !== st.campCell) return null;
  return pile(state, st.campCell);
}
```

In `drink`, after the vessel loop and before the source line:

```ts
  const camp = want > 1e-9 ? campPileHere(state, world) : null;
  if (camp) {
    const take = Math.min(want, qty(camp, "water"));
    removeItem(camp, "water", take);
    want -= take;
  }
```

Imports: `addItem, pile, qty, removeItem` from `./inventory`, `Inventory, ToolId` types. `regionState` is not used here on purpose: reading `state.regions` directly avoids creating a region state from a pure query.

- [ ] **Step 5: Freezing at camp**

In `src/sim/hazards.ts`, add a second function and call it from `hourlyHazards` right after `freezeVessels`: `freezeCamps(state, world, ambient, rng)`. It has none of `freezeVessels`'s activity guard, because the water at camp freezes whether or not its owner is walking somewhere:

```ts
/** Water left at camp in frost with no fire: it freezes, and a full bucket may split. */
function freezeCamps(state: GameState, world: World, ambient: number, rng: Rng): void {
  if (ambient >= FREEZE_C) return;
  const p = state.player;
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    if (st.fire.lit) continue;
    const camp = state.piles[st.campCell];
    if (!camp) continue;
    const litres = qty(camp, "water");
    if (litres <= 1e-9) continue;
    removeItem(camp, "water", litres);
    addItem(camp, "ice", litres);
    // Each bucket at camp rolls the split a carried one does, and takes its share of the ice with it.
    const buckets = qty(camp, "barkBucket");
    const full = litres > campWaterCapacity(camp) / 2;
    for (let i = 0; i < buckets; i++) {
      if (!full || !rng.chance(1 / 3)) continue;
      removeItem(camp, "barkBucket", 1);
      removeItem(camp, "ice", Math.min(TOOLS.barkBucket.litres!, qty(camp, "ice")));
      log(state, id === p.region ? "A bucket at camp has split in the frost." : `A bucket at camp in ${regionAt(world, id).name} has split in the frost.`, "bad");
    }
    log(state, id === p.region ? "The water at camp has frozen." : `The water at camp in ${regionAt(world, id).name} has frozen.`, "bad");
  }
}
```

Imports: `addItem, qty, removeItem` from `./inventory`, `campWaterCapacity` from `./water`.

- [ ] **Step 6: Thawing at camp**

In `src/sim/camp.ts` `stepCamp`, inside the `for` over touched regions, after the rack block:

```ts
    // A bucket of ice by a fed fire thaws itself; nobody has to tend it.
    if (st.fire.lit && st.fire.fuelKg > 0) {
      const campPile = state.piles[st.campCell];
      const ice = campPile ? qty(campPile, "ice") : 0;
      if (campPile && ice > 1e-9) {
        const melt = Math.min(ice, (THAW_L_PER_HOUR / 60) * dt);
        removeItem(campPile, "ice", melt);
        addItem(campPile, "water", melt);
        if (ice - melt <= 1e-9) log(state, mine ? "The ice at camp has thawed." : `The ice at camp in ${name()} has thawed.`, "good");
      }
    }
```

In `src/sim/tasks.ts` `complete` case `"thaw"`: after thawing the carried vessels add

```ts
      const camp = campPileHere(state, world);
      if (camp) {
        const ice = qty(camp, "ice");
        removeItem(camp, "ice", ice);
        addItem(camp, "water", ice);
      }
```

and in the `thaw` check, "nothing is frozen" only when neither a vessel nor camp ice is frozen: `if (!p.tools.some((t) => t.frozen) && qty(pile(state, st.campCell), "ice") <= 1e-9)`.

- [ ] **Step 7: Pour on unloading**

In `src/sim/intent.ts` `dropEverything`:

```ts
function dropEverything(state: GameState, world: World): void {
  const from = state.player.pack;
  const here = cellOf(state, world);
  const to = pile(state, here);
  for (const { item, qty: q } of listItems(from)) transfer(from, to, item, q);
  // Unloading at the home camp empties the vessels too, as far as the vessels at camp have room.
  if (state.intent?.campCell === here) pourVessels(state.player, to);
}
```

- [ ] **Step 8: Run, typecheck, lint, commit**

Run: `npx vitest run tests/water.test.ts && npm test && npm run typecheck`
Expected: PASS.

```bash
git add 08-survidle/src 08-survidle/tests/water.test.ts
git commit -m "feat(survidle): water and ice are stock at camp, held by the vessels left there; it freezes without a fire and thaws by one"
```

---

### Task 3: The fill task and the ice hole

Spec sections 2.2 and 2.4. After this, "fill vessels, keep camp at 4 litres of water, bringing it to camp" is an order the runner serves, and it opens an ice hole when the shore is frozen.

**Files:**
- Modify: `src/sim/types.ts:64-68` (TaskId), `src/sim/types.ts:181-205` (RegionState), `src/sim/regionstate.ts:19-35`, `src/sim/save.ts` (fillDefaults), `src/sim/water.ts:42-44` (waterSource), `src/sim/tasks.ts` (checks, effects, toolFor, WORK_TASKS, availableTasks), `src/sim/intent.ts` (GROUND_OF, yieldItem, yieldItems, packCarries, workStep, GERUND), `src/sim/orders.ts:135-160` (chooseOrder), `src/sim/camp.ts` (dailyCamp), `src/sim/skills.ts:87-110`, `src/ui/panels.ts` (intentGroups Camp list)
- Test: `tests/fill.test.ts`

**Interfaces:**
- `TaskId` gains `"fill" | "iceHole"`.
- `RegionState.iceHole: { cell: number; minute: number } | null`.
- `iceHoleOpen(state: GameState, world: World, cell: number): boolean` in `water.ts`; `waterSource` is true on an open hole's cell whatever the ice.
- `yieldItem("fill")` is `"water"`; `yieldItems("fill")` is `["water"]`.

- [ ] **Step 1: Write the failing tests**

`tests/fill.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem } from "../src/sim/intent";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder, chooseOrder, orderMet, runOrders } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { waterSource } from "../src/sim/water";
import { regionAt, spotOf } from "../src/world/gen";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** Seed 17's start has a shore. Two buckets: one in hand, one at camp. */
function waterCamp(seed = 17) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  const camp = pile(state, st.campCell);
  addItem(camp, "barkBucket", 1);
  addItem(state.player.pack, "barkBucket", 1);
  takeUp(state, world, "barkBucket");
  addItem(state.player.pack, "driedMeat", 3);
  return { g, state, world, st, camp };
}

describe("the fill task", () => {
  it("fills at open water, and its yield for orders is water", () => {
    const { state, world } = waterCamp();
    expect(yieldItem("fill")).toBe("water");
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    const o = check(state, world, cal, "fill");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(5);
  });

  it("a water keep fills at the shore, walks home, pours, and is met", () => {
    const { g, state, world, camp } = waterCamp();
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
  });

  it("a keep past the camp's capacity is skipped with the reason, not looped", () => {
    const { state, world, camp } = waterCamp();
    addItem(camp, "water", 2);
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 6 }, deliver: "camp", where: "nearest" }, "keep");
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(o.skipped).toBe("camp holds 2 litres; more vessels at camp would hold more");
  });

  it("on a frozen shore the fill opens an ice hole first, and the hole is gone at dawn", () => {
    const { g, state, world, st, camp } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "iceHole", undefined, shore.cell).ok).toBe(true);
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    // The dawn roll melts April ice at 2 cm a degree of mean; pin it so the shore stays shut for the test.
    expect(until(g, () => { state.weather.iceCm = 10; return st.iceHole !== null; }, 4000)).toBe(true);
    expect(st.iceHole!.cell).toBe(shore.cell);
    placeAt(state, world, shore.cell);
    expect(waterSource(state, world)).toBe(true);
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
    // The daily tick runs at 04:00; from 1 April 06:00 that is under a day away.
    expect(until(g, () => st.iceHole === null, 1500)).toBe(true);
    expect(state.log.some((l) => l.text === "The ice hole has skinned over.")).toBe(true);
  });

  it("with no axe in reach a frozen shore blocks the fill and says so", () => {
    const { state, world } = waterCamp();
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 10;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    const o = check(state, world, cal, "fill", undefined, shore.cell);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("iced over; needs an axe for an ice hole");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/fill.test.ts`
Expected: FAIL.

- [ ] **Step 3: State shape**

`src/sim/types.ts`: `TaskId` gains `"fill" | "iceHole"` on the camp line. `RegionState` gains

```ts
  /** An ice hole cut at the shore: where, and when. Cleared at the dawn tick, when it has skinned over. */
  iceHole: { cell: number; minute: number } | null;
```

`src/sim/regionstate.ts` `newRegionState`: `iceHole: null,`. `src/sim/save.ts` `fillDefaults` region loop: `st.iceHole ??= null;`.

- [ ] **Step 4: water.ts: the hole is a source**

```ts
/** The hole at this cell is open: cut today and not yet skinned over by the dawn tick. */
export function iceHoleOpen(state: GameState, cell: number): boolean {
  const st = state.regions[state.player.region];
  return st?.iceHole?.cell === cell;
}

/** Open water under foot: a waterside cell with the shore not iced over, or an ice hole cut here. */
export function waterSource(state: GameState, world: World): boolean {
  const cell = cellOf(state, world);
  if (!watersideCell(world, cell)) return false;
  return state.weather.iceCm < ICE_SHORE_CM || iceHoleOpen(state, cell);
}
```

- [ ] **Step 5: The two task checks and effects**

In `src/sim/tasks.ts` `checkFresh`, add before `case "hunt"`:

```ts
    case "fill": {
      const holds = vesselLitresCapacity(p) + totalQty(invs, "barkBucket") * TOOLS.barkBucket.litres! + totalQty(invs, "waterskin") * TOOLS.waterskin.litres!;
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Fill vessels", detail: "every vessel in hand, from open water", duration: 5, repeatable: true }));
      if (!o.ok) return o;
      if (holds <= 0) return { ...o, ok: false, why: "needs a vessel" };
      if (state.weather.iceCm >= ICE_SHORE_CM && !iceHoleOpen(state, at)) {
        if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "iced over; needs an axe for an ice hole" };
        return { ...o, detail: `${o.detail}; opens an ice hole first`, duration: 25 };
      }
      return o;
    }
    case "iceHole": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Open an ice hole", detail: "20 minutes with the axe; skins over by morning", duration: 20 }));
      if (!o.ok) return o;
      if (state.weather.iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open" };
      if (iceHoleOpen(state, at)) return { ...o, ok: false, why: "already open here" };
      if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };
      return o;
    }
```

The `holds` line counts vessels in reach because the take-up in `beginTask` will pick one up; `toolFor` gets `case "fill": return "barkBucket";` and, in `beginTask`, the fill take-up tries the bucket and then the waterskin:

```ts
  const need = toolFor(id, arg);
  if (need && !hasTool(state.player, need)) {
    if (id === "fill") {
      if (vesselLitresCapacity(state.player) <= 0 && !takeUp(state, world, "barkBucket")) takeUp(state, world, "waterskin");
    } else takeUp(state, world, need);
  }
```

Add to `water.ts`: `export function vesselLitresCapacity(p: Player): number { let l = 0; for (const t of p.tools) l += TOOLS[t.id].litres ?? 0; return l; }`. Add `"iceHole"` to `toolFor` returning `"axe"`.

`complete`:

```ts
    case "fill": {
      const added = fillVessels(state, world);
      if (added > 1e-9) log(state, `You fill ${added.toFixed(1)} litres.`);
      return;
    }
    case "iceHole": {
      wearTool(state, "axe", wearFactor(state, world, "chop"));
      st.iceHole = { cell: cellOf(state, world), minute: state.minute };
      log(state, "You cut a hole in the ice.");
      return;
    }
```

`WORK_TASKS` gains `"fill", "iceHole"`. `LOCATED` gains `"iceHole"` (a half-cut hole stays at its shore). `availableTasks` pushes `check(state, world, cal, "fill")` and `check(state, world, cal, "iceHole")` after `thaw`'s group. Imports: `iceHoleOpen`, `fillVessels`, `vesselLitresCapacity` from `./water`.

`src/sim/skills.ts` `skillOf`: `case "fill": case "iceHole": return "foraging";` and `masteryKey`: `case "fill": case "iceHole": return id;`.

- [ ] **Step 6: The intent side**

`src/sim/intent.ts`:
- `GROUND_OF` gains `fill: "shore", iceHole: "shore"`.
- `resolveCell`: before the `groundOf` lookup add: a fill goes to the open hole when there is one:

```ts
  if (task === "fill" && st.iceHole && state.weather.iceCm >= ICE_SHORE_CM) return { cell: st.iceHole.cell, note: "" };
```

- `yieldItem`: `case "fill": return "water";`. `yieldItems`: `if (task === "fill") return ["water"];` (the pack never holds water; packCarries handles fill below).
- `packCarries`: at the top, `if (it.task === "fill") return vesselLitres(state.player) > 0 && campWaterRoom(pile(state, it.campCell)) > 0;`.
- `workStep`: after the walk-to-cell line (`if (here !== it.cell) return walkTo(...)`) and before the `night` line:

```ts
  // A fill on a frozen shore cuts its hole first; the fill follows next minute.
  if (it.task === "fill" && !waterSource(state, world) && check(state, world, cal, "iceHole").ok) {
    takeStep(state, world, cal, { id: "iceHole", step: "cutting an ice hole" }, rng);
    return undefined;
  }
```

- `GERUND`: `fill: () => "filling vessels", iceHole: () => "cutting an ice hole"`.
- Imports: `campWaterRoom, vesselLitres, waterSource, ICE_SHORE_CM` from `./water`.

`src/sim/orders.ts` `chooseOrder`, inside the loop after the `orderMet` block and before `intentOption`:

```ts
    const keep = keepTarget(o);
    if (keep?.item === "water") {
      const camp = pile(state, regionState(state, world, state.player.region).campCell);
      const cap = campWaterCapacity(camp);
      if (cap < keep.qty && qty(camp, "water") + qty(camp, "ice") >= cap - 1e-9) {
        markSkipped(state, world, cal, o, `camp holds ${cap % 1 === 0 ? cap : cap.toFixed(1)} litres; more vessels at camp would hold more`);
        continue;
      }
    }
```

`src/sim/camp.ts` `dailyCamp`, inside the region loop:

```ts
    if (st.iceHole) {
      st.iceHole = null;
      if (id === state.player.region) log(state, "The ice hole has skinned over.");
    }
```

`src/ui/panels.ts` `intentGroups` Camp list: add `{ id: "fill" }, { id: "iceHole" }` after `{ id: "thaw" }`.

- [ ] **Step 7: Run, typecheck, lint, commit**

Run: `npx vitest run tests/fill.test.ts && npm test && npm run typecheck`
Expected: PASS. If the keep test never meets, print `state.log` and `state.intent?.step` in the failing test to see where the runner stalls; the usual culprits are `packCarries` (must be true only with water in hand and room at camp) and the pour in `dropEverything` (must fire at the intent's `campCell`).

```bash
git add 08-survidle/src 08-survidle/tests/fill.test.ts
git commit -m "feat(survidle): fill vessels is a task with water as its yield, so a keep can hold camp water; a frozen shore gets an ice hole that skins over by morning"
```

---

### Task 4: Thirst before hunger, and a thirst that lights the fire

Spec sections 2.5 and 3.

**Files:**
- Modify: `src/sim/body.ts:37-53` (currentNeed), `src/sim/body.ts:95-138` (shoreForWater, campMeltReady, canQuench, thirstyStep), `src/sim/body.ts:221-230` (hungryStep stays; add canFeed)
- Test: `tests/needs.test.ts`

**Interfaces:**
- `currentNeed` order: sleep, storm, cold (campCanWarm), thirsty (canQuench), hungry (canFeed), home.
- `canFeed(state, world, cal, it): boolean` exported for tests.

- [ ] **Step 1: Write the failing tests**

`tests/needs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { canFeed, currentNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** A forever felling on seed 17 from camp, pack emptied of food. */
function felling() {
  const g = newGame(17);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  state.player.pack.items.driedMeat = 0;
  startIntent(state, world, cal, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
  return { g, state, world, st };
}

describe("the need order", () => {
  it("hungry with no food anywhere yields to a thirst with water in reach", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 0.5;
    addItem(p.pack, "barkBucket", 1);
    takeUp(state, world, "barkBucket");
    p.tools.find((t) => t.id === "barkBucket")!.litres = 2;
    expect(canFeed(state, world, cal, state.intent!)).toBe(false);
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
  });

  it("both in reach: thirst first, then hunger", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 0.5;
    addItem(p.pack, "driedMeat", 1);
    addItem(p.pack, "barkBucket", 1);
    takeUp(state, world, "barkBucket");
    p.tools.find((t) => t.id === "barkBucket")!.litres = 2;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    p.water = 3;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("hungry");
  });

  it("hungry with no food and no water in reach is no need at all", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 3;
    expect(currentNeed(state, world, cal, state.intent!)).toBeNull();
  });

  it("thirsty at camp with the fire out and snow down: light the fire, then melt", () => {
    const { g, state, world, st } = felling();
    const p = state.player;
    placeAt(state, world, st.campCell);
    state.weather.iceCm = 10;
    state.weather.snowCm = 20;
    st.structures.firePit = true;
    addItem(p.pack, "fireDrill", 1);
    takeUp(state, world, "fireDrill");
    addItem(pile(state, st.campCell), "firewood", 10);
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => st.fire.lit, 120)).toBe(true);
    expect(until(g, () => p.water > 1, 120)).toBe(true);
  });

  it("thirsty away from camp with camp water at home walks home for it", () => {
    const { g, state, world, st } = felling();
    const p = state.player;
    state.weather.iceCm = 10;
    addItem(pile(state, st.campCell), "barkBucket", 1);
    addItem(pile(state, st.campCell), "water", 2);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => p.water > 1, 600)).toBe(true);
    expect(qty(pile(state, st.campCell), "water")).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/needs.test.ts`
Expected: FAIL (`canFeed` missing; order wrong).

- [ ] **Step 3: body.ts**

`currentNeed` tail becomes:

```ts
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (p.water < THIRSTY_L && canQuench(state, world, cal)) return "thirsty";
  if (p.kcal < HUNGRY_UNDER && canFeed(state, world, cal, it)) return "hungry";
  if (homeBeforeDark(state, world, cal, it)) return "home";
  return null;
```

Update the doc comment on the function and the file header to "sleep, storm, cold, thirst, hunger". Add:

```ts
/** Whether hunger can be answered: safe food in the pack, or at camp with a walk there open. A hunger nothing can answer masks nothing. */
export function canFeed(state: GameState, world: World, cal: Calendar, it: Intent): boolean {
  const p = state.player;
  if (AUTO_EAT_ORDER.some((f) => qty(p.pack, f) > 1e-9)) return true;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => qty(camp, f) > 1e-9)) return false;
  return cellOf(state, world) === it.campCell || check(state, world, cal, "walk", `cell:${it.campCell}`).ok;
}
```

`shoreForWater`: the iced case returns the open hole when a walk there can start:

```ts
function shoreForWater(state: GameState, world: World, cal: Calendar): number | null {
  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  if (state.weather.iceCm >= ICE_SHORE_CM) {
    const hole = st.iceHole?.cell;
    if (hole === undefined || hole === here) return null;
    return check(state, world, cal, "walk", `cell:${hole}`).ok ? hole : null;
  }
  ... (the existing candidate loop unchanged)
}
```

Add `campWaterReady`: camp pile holds water and camp is under foot or a walk there can start:

```ts
/** Camp water in reach: litres in the camp pile, and camp under foot or a walk there open. */
function campWaterReady(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (qty(pile(state, st.campCell), "water") <= 1e-9) return false;
  return cellOf(state, world) === st.campCell || check(state, world, cal, "walk", `cell:${st.campCell}`).ok;
}
```

`campMeltReady` no longer requires the fire to be lit: a fire step waiting at camp counts:

```ts
function campMeltReady(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (state.weather.snowCm < 1) return false;
  if (!st.fire.lit && fireStep(state, world, cal, st.campCell) === null) return false;
  return cellOf(state, world) === st.campCell
    ? !st.fire.lit || check(state, world, cal, "melt").ok
    : check(state, world, cal, "walk", `cell:${st.campCell}`).ok;
}
```

`canQuench` adds `|| campWaterReady(state, world, cal)`.

`thirstyStep`:

```ts
function thirstyStep(state: GameState, world: World, cal: Calendar): Step | null {
  if (drink(state, world)) return null;
  const shoreCell = shoreForWater(state, world, cal);
  if (shoreCell !== null) return walkStep(state, world, shoreCell, " for water");
  const st = regionState(state, world, state.player.region);
  const atCamp = cellOf(state, world) === st.campCell;
  if (campWaterReady(state, world, cal)) return atCamp ? null : walkStep(state, world, st.campCell, " for water");
  if (campMeltReady(state, world, cal)) {
    if (!atCamp) return walkStep(state, world, st.campCell, " for water");
    // The cold step's fire, for the same reason: no fire, no melt.
    const fs = fireStep(state, world, cal, st.campCell);
    if (fs) return fs;
    return { id: "melt", step: "melting snow" };
  }
  return null;
}
```

`drink` already takes camp water under foot, so `campWaterReady` at camp returns null after `drink` succeeded; the `atCamp ? null` branch only catches the ice-only case, which then falls to the fire and the `thaw` in `stepCamp`.

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npx vitest run tests/needs.test.ts tests/body.test.ts && npm test && npm run typecheck`
Expected: PASS. `tests/body.test.ts` has tests on hunger and thirst ordering from the intents build; if one asserts "hungry" wins with no food in reach, that assertion is the bug this task fixes: change it to expect "thirsty" or null and say so in the commit.

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/tests/needs.test.ts 08-survidle/tests/body.test.ts
git commit -m "feat(survidle): a need with no remedy yields to one that has one; thirst outranks hunger, and a thirsty body lights the fire it melts snow at"
```

---

### Task 5: Arrows stay in the pack

Spec section 4.

**Files:**
- Modify: `src/sim/body.ts:231-255` (provision), `src/sim/intent.ts` (dropEverything)
- Test: `tests/needs.test.ts` (add a describe)

- [ ] **Step 1: Write the failing test**

Append to `tests/needs.test.ts`:

```ts
describe("arrows in the pack", () => {
  it("a bow hunt keeps its arrows through an unloading at camp, and provisioning pockets them", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(p.pack, "bow", 1);
    takeUp(state, world, "bow");
    addItem(pile(state, st.campCell), "arrow", 12);
    addItem(pile(state, st.campCell), "driedMeat", 2);
    startIntent(state, world, cal, new Rng(1), { task: "hunt", arg: "any", until: { kind: "campHas", qty: 3 }, deliver: "camp", where: "nearest" });
    expect(qty(p.pack, "arrow")).toBe(10);
    // Meat in the pack meets the promise, so the runner walks home and unloads; the arrows must not go with the meat.
    expect(until(g, () => state.task?.id === "hunt", 600)).toBe(true);
    addItem(p.pack, "rawMeat", 5);
    state.task = null;
    expect(until(g, () => qty(pile(state, st.campCell), "rawMeat") >= 5, 1500)).toBe(true);
    expect(qty(p.pack, "arrow")).toBe(10);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/needs.test.ts -t "arrows"`
Expected: FAIL (arrows are 0 after unloading, or never pocketed).

- [ ] **Step 3: Provision and keep**

`src/sim/body.ts`, add above `provision`:

```ts
/** Arrows a bow hunt carries out of camp. */
export const ARROWS_TO_CARRY = 10;

/** What the live order needs in the pack beside food: arrows for a bow hunt. Nothing else yet. */
export function orderKit(state: GameState): ItemId[] {
  const it = state.intent;
  if (it?.task === "hunt" && hasTool(state.player, "bow")) return ["arrow"];
  return [];
}
```

At the end of `provision`, before the vessel line:

```ts
  if (orderKit(state).includes("arrow")) {
    const want = ARROWS_TO_CARRY - qty(pack, "arrow");
    if (want > 0) transfer(camp, pack, "arrow", Math.min(want, qty(camp, "arrow")));
  }
```

`src/sim/intent.ts` `dropEverything`: skip the kit:

```ts
  const keep = new Set(orderKit(state));
  for (const { item, qty: q } of listItems(from)) if (!keep.has(item)) transfer(from, to, item, q);
```

Import `orderKit` from `./body`. Also call `provision` when a hunt intent starts at camp: in `startIntent`, after `state.intent = {...}` and before `runIntent`, add `provision(state, world);` (provision already checks it is at the intent's camp cell and returns otherwise). The existing hunt check reads arrows from the pack only, so the pocketing has to happen before the first check runs.

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npx vitest run tests/needs.test.ts tests/intent.test.ts && npm test && npm run typecheck`
Expected: PASS.

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/src/sim/intent.ts 08-survidle/tests/needs.test.ts
git commit -m "feat(survidle): a bow hunt pockets ten arrows at camp and keeps them through an unloading"
```

---

### Task 6: Splitting waits for dry weather

Spec section 5.

**Files:**
- Modify: `src/sim/tasks.ts:268-273` (split check)
- Test: `tests/fire.test.ts` (add a describe)

- [ ] **Step 1: Write the failing test**

Append to `tests/fire.test.ts` (it already imports `newGame`, `calendar`, `check` or equivalents; add what is missing):

```ts
describe("splitting waits for dry weather", () => {
  it("is blocked in rain and for six hours after, then allowed", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "log", 2);
    state.weather.precip = "light";
    expect(check(state, world, calendar(0), "split")).toMatchObject({ ok: false, why: "waiting for dry weather" });
    state.weather.precip = "none";
    st.logsWet = 60;
    expect(check(state, world, calendar(0), "split").ok).toBe(false);
    st.logsWet = 6 * 60;
    expect(check(state, world, calendar(0), "split").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/fire.test.ts -t "dry weather"`
Expected: FAIL (ok is true in rain).

- [ ] **Step 3: The check**

In `checkFresh` case `"split"`, after the log test:

```ts
      if (splitIsWet(state, world)) return { ...o, ok: false, why: "waiting for dry weather" };
```

`splitIsWet` is already imported. Leave the `complete` branch as it is: a split that began dry and finished wet still comes out wet.

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npm test && npm run typecheck`
Expected: PASS. A test in `tests/fire.test.ts` or `tests/orders.test.ts` that splits in rain to produce wet firewood now has to set `precip` after the split starts, or seed wet firewood with `addItem`; adjust it that way, not by weakening the rule.

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/tests/fire.test.ts
git commit -m "feat(survidle): a log is not split in rain or in the six hours after; the keep's row says it waits for dry weather"
```

---

### Task 7: The rack as a task

Spec section 6. The instant "hang raw meat" button becomes the `hang` task, and "hang meat, keep camp at 10 kg dried meat" is a keep.

**Files:**
- Modify: `src/sim/types.ts` (TaskId), `src/sim/tasks.ts` (check, complete, WORK_TASKS, availableTasks), `src/sim/intent.ts` (CAMP_BOUND, yieldItem, yieldItems, GERUND), `src/sim/skills.ts`, `src/ui/panels.ts:347-380` (instantHtml) and `intentGroups`, `src/main.ts:175-177`
- Test: `tests/hang.test.ts`

**Interfaces:**
- `TaskId` gains `"hang"`. `yieldItem("hang")` is `"driedMeat"`; `yieldItems("hang")` is `[]`.
- `loadRack(state, world)` in `actions.ts` stays and is the effect.

- [ ] **Step 1: Write the failing tests**

`tests/hang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem, yieldItems } from "../src/sim/intent";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder, orderMet } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { beginTask, check } from "../src/sim/tasks";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function rackCamp() {
  const g = newGame(17);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  st.structures.dryingRack = true;
  addItem(state.player.pack, "driedMeat", 3);
  return { g, state, world, st, camp: pile(state, st.campCell) };
}

describe("hanging meat is a task", () => {
  it("needs the rack, raw meat and room; takes five minutes a kilo for what fits", () => {
    const { state, world, st, camp } = rackCamp();
    st.structures.dryingRack = false;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "needs a drying rack" });
    st.structures.dryingRack = true;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "no raw meat here" });
    addItem(camp, "rawMeat", 9);
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: true, duration: 30 });
    st.rack.kg = 6;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "the rack is full" });
  });

  it("the task moves what fits onto the rack over its minutes", () => {
    const { state, world, st, camp } = rackCamp();
    addItem(camp, "rawMeat", 9);
    expect(beginTask(state, world, cal, "hang")).toBe(true);
    advance(state, world, 10);
    expect(st.rack.kg).toBe(0);
    advance(state, world, 25);
    expect(st.rack.kg).toBe(6);
    expect(qty(camp, "rawMeat")).toBe(3);
  });

  it("a keep on dried meat is met when the rack drops it into the pile", () => {
    const { g, state, world, st, camp } = rackCamp();
    expect(yieldItem("hang")).toBe("driedMeat");
    expect(yieldItems("hang")).toEqual([]);
    addItem(camp, "rawMeat", 6);
    state.weather.precip = "none";
    const o = addOrder(state, world, { task: "hang", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(until(g, () => st.rack.kg === 6, 200)).toBe(true);
    // Two dry days; the weather may rain, so allow four.
    expect(until(g, () => orderMet(state, world, o, true), 4 * 1440)).toBe(true);
    expect(qty(camp, "driedMeat")).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/hang.test.ts`
Expected: FAIL.

- [ ] **Step 3: The task**

`src/sim/types.ts`: `TaskId` gains `"hang"` on the camp line.

`src/sim/tasks.ts` `checkFresh`, next to `split`:

```ts
    case "hang": {
      const raw = totalQty(invs, "rawMeat");
      const room = RACK_MAX_KG - st.rack.kg;
      const kg = Math.min(raw, room);
      const o = needCamp(opt({ group: "camp", label: "Hang meat to dry", detail: `5 minutes a kilo; ${RACK_MAX_KG} kg on the rack, two dry days`, duration: Math.max(1, Math.round(5 * kg)), repeatable: false }));
      if (!o.ok) return o;
      if (!st.structures.dryingRack) return { ...o, ok: false, why: "needs a drying rack" };
      if (raw <= 1e-9) return { ...o, ok: false, why: "no raw meat here" };
      if (room <= 1e-9) return { ...o, ok: false, why: "the rack is full" };
      return o;
    }
```

`complete`: `case "hang": { const kg = loadRack(state, world); if (kg > 0) log(state, \`You hang ${kg.toFixed(1)} kg of meat to dry.\`); return; }`. Import `loadRack` from `./actions` (check for an import cycle: `actions.ts` imports from `tasks.ts`? It does not today; if it does, move `loadRack` into `camp.ts`).

`WORK_TASKS` gains `"hang"`. `availableTasks` pushes `check(state, world, cal, "hang")` after `split`. `RACK_MAX_KG` is exported from `./items`.

`src/sim/intent.ts`: `CAMP_BOUND` gains `"hang"`; `yieldItem`: `case "hang": return "driedMeat";`; `yieldItems`: `if (task === "hang") return [];` before the generic line; `GERUND`: `hang: () => "hanging meat to dry"`.

`src/sim/skills.ts`: `skillOf` `case "hang":` joins the `cook` line (building); `masteryKey` `case "hang":` joins the plain-id list.

- [ ] **Step 4: The panel**

`src/ui/panels.ts` `instantHtml`: delete the `rack` constant and its place in the returned string; update the doc comment to "The eat / add firewood buttons". `intentGroups` Camp list: add `{ id: "hang" }` after `{ id: "split" }`.
`src/main.ts`: delete `case "rack":` and the `loadRack` import if nothing else uses it.
`tests/ui.test.ts`: if a test clicks `data-act="rack"`, change it to start the `hang` task via the Do panel's task button (`data-act="task" data-id="hang"`) and assert `state.task?.id === "hang"`.

- [ ] **Step 5: Run, typecheck, lint, commit**

Run: `npx vitest run tests/hang.test.ts tests/ui.test.ts && npm test && npm run typecheck`
Expected: PASS.

```bash
git add 08-survidle/src 08-survidle/tests/hang.test.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): hanging meat is a task with dried meat as its yield, so a keep can dry the deer"
```

---

### Task 8: A start with a shore and an outcrop

Spec section 7.

**Files:**
- Modify: `src/world/gen.ts:208-232` (findStart)
- Test: `tests/start.test.ts`

**Interfaces:**
- `findStart` stays private; `World` gains `startRing: number` (the ring the search stopped at, 40 for the fallback) beside `start`.

- [ ] **Step 1: Write the failing test**

`tests/start.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateWorld, hasSpot, regionAt } from "../src/world/gen";

describe("the start", () => {
  it("has a shore and an outcrop on every reference seed and the first dozen", () => {
    const fallen: number[] = [];
    for (const seed of [17, 19, 42, 79, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const world = generateWorld(seed);
      const r = regionAt(world, world.start);
      expect(hasSpot(r, "shore"), `seed ${seed} shore`).toBe(true);
      expect(hasSpot(r, "outcrop"), `seed ${seed} outcrop`).toBe(true);
      if (world.startRing >= 40) fallen.push(seed);
    }
    expect(fallen).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/start.test.ts`
Expected: FAIL on seed 3 or another.

- [ ] **Step 3: The filter**

In `src/world/gen.ts`, `findStart` returns `{ id, ring }`; the filter line becomes

```ts
        if (r.forest >= 0.45 && r.landCells >= 120 && r.frac.water < 0.15 && r.spots.length >= 3
          && hasSpot(r, "shore") && hasSpot(r, "outcrop")) return { id, ring };
```

and the fallback `return { id: ay * LATTICE_W + ax, ring: 40 }`. The caller sets `world.start = s.id; world.startRing = s.ring;`. Add `startRing: number` to the `World` interface with the comment `/** Rings of the lattice the start search walked; 40 means the fallback anchor. */`. Update the function's doc comment: "mostly forest, with a shore for water and an outcrop for stone within it".

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npx vitest run tests/start.test.ts && npm test && npm run typecheck`
Expected: PASS, and the suite still under a few seconds. If this test alone takes over two seconds, cut the seed list to the four reference seeds plus 3 and say so in the commit; the script in Task 9 sweeps the rest.

Tests that rely on seed 3's or seed 17's old start (the memory note says seed 17 is "bog camp, forest 0.6 km away" and seed 3's start "has no water") may move: `tests/body.test.ts`, `tests/intent.test.ts`, `tests/orders.test.ts`. Read each failure; if it asserts a spot distance or that a spot is missing, re-derive the value from the new start rather than pinning the old world.

```bash
git add 08-survidle/src/world/gen.ts 08-survidle/tests
git commit -m "feat(survidle): a run starts where there is a shore and an outcrop, so the first camp has water and the first tool chain has stone"
```

---

### Task 9: The reference player

Spec section 8.

**Files:**
- Create: `src/sim/reference.ts`, `scripts/reference.ts`
- Modify: `package.json` (scripts)
- Test: `tests/reference.test.ts`

**Interfaces:**
- `REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[]` in order.
- `setUpReference(seed: number): { state: GameState; world: World }` adds the list at the start camp.
- `runReference(seed: number, days: number): ReferenceReport` where

```ts
export interface ReferenceReport {
  seed: number;
  startRing: number;
  /** Day, kcal, water, warmth, health and camp stocks at each checkpoint reached. */
  checkpoints: { day: number; kcal: number; water: number; warmth: number; health: number; stocks: Record<string, number>; tools: string[] }[];
  outcome: { kind: "died"; day: number; cause: DeathCause } | { kind: "reached"; day: number };
  passed: boolean;
}
```

- [ ] **Step 1: Write the failing test**

`tests/reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { pile, qty } from "../src/sim/inventory";
import { ordersHere } from "../src/sim/orders";
import { REFERENCE_ORDERS, setUpReference } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";

describe("the reference player", () => {
  it("every order is added as the kind it names", () => {
    const { state, world } = setUpReference(17);
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    list.forEach((o, i) => expect(o.kind, `order ${i + 1}`).toBe(REFERENCE_ORDERS[i].kind));
  });

  it("holds three days on seed 17 and has water at camp", () => {
    const { state, world } = setUpReference(17);
    advance(state, world, 3 * 1440);
    expect(state.dead).toBeNull();
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
    expect(calendar(state.minute).day).toBe(4);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: src/sim/reference.ts**

```ts
/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (reaches 1 December on four
 * seeds) and, later, the survivor loop's instrument. The list is ordered
 * as the tool chain is, because the runner never gathers a prerequisite on
 * its own: the knife before the drill, the buckets before the water keep
 * can be met, and the water keep at the top so it is served first.
 */
import { advance } from "./advance";
import { calendar } from "./calendar";
import { listItems, pile } from "./inventory";
import { TOOLS } from "./items";
import { newGame } from "./newgame";
import { addOrder } from "./orders";
import { regionState } from "./regionstate";
import type { DeathCause, GameState, IntentRequest, OrderKind } from "./types";
import type { World } from "../world/gen";

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest" }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until, deliver, where: "nearest" }, kind: "job" });

export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 4),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 20),
  job("bark", { kind: "campHas", qty: 12 }),
  job("craft", { kind: "campHas", qty: 6 }, "cordage"),
  keep("craft", 1, "knife"),
  keep("craft", 1, "fireDrill"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("build", { kind: "once" }, "firePit"),
  keep("split", 40),
  keep("craft", 1, "fishingSpear"),
  keep("fish", 4, "any"),
  keep("hunt", 6, "any"),
  keep("hang", 10),
  keep("craft", 1, "axe"),
  job("build", { kind: "once" }, "leanTo"),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/** The reference seeds, and the day 1 December falls on from a 1 April start. */
export const REFERENCE_SEEDS = [17, 19, 42, 79];
export const DECEMBER_DAY = 245;
const CHECKPOINT_DAYS = [30, 90, DECEMBER_DAY];

export function setUpReference(seed: number): { state: GameState; world: World } {
  const g = newGame(seed);
  for (const o of REFERENCE_ORDERS) addOrder(g.state, g.world, o.req, o.kind);
  return g;
}

export interface ReferenceReport {
  seed: number;
  startRing: number;
  checkpoints: { day: number; kcal: number; water: number; warmth: number; health: number; stocks: Record<string, number>; tools: string[] }[];
  outcome: { kind: "died"; day: number; cause: DeathCause } | { kind: "reached"; day: number };
  passed: boolean;
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  return {
    day, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
  };
}

/** Runs the set-up a day at a time for `days` days or until death, whichever is first. */
export function runReference(seed: number, days: number): ReferenceReport {
  const { state, world } = setUpReference(seed);
  const checkpoints: ReferenceReport["checkpoints"] = [];
  for (let d = 1; d <= days && !state.dead; d++) {
    advance(state, world, 1440);
    const day = calendar(state.minute).day;
    if (CHECKPOINT_DAYS.includes(day)) checkpoints.push(checkpoint(state, world, day));
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute).day;
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  return { seed, startRing: world.startRing, checkpoints, outcome, passed: !state.dead && day >= DECEMBER_DAY };
}
```

If `calendar(state.minute).day` at a checkpoint lands a day late because `advance` starts at 06:00, compare on `>=` with a `seen` set instead of `includes`; the test in Step 1 pins day 4 after three days, which settles the arithmetic.

- [ ] **Step 4: scripts/reference.ts and package.json**

```ts
/**
 * The reference player's verdict: one block per seed, then passed N of M.
 * Run: npm run reference, or npx vite-node scripts/reference.ts 17 19 42 79 250
 * (seeds, then days). Exit code 1 when any seed fails.
 */
import { DECEMBER_DAY, REFERENCE_SEEDS, runReference } from "../src/sim/reference";

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const days = args.length >= 2 ? args[args.length - 1] : 250;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

let passed = 0;
for (const seed of seeds) {
  const t0 = performance.now();
  const r = runReference(seed, days);
  console.log(`seed ${seed}: start found at ring ${r.startRing}`);
  for (const c of r.checkpoints) {
    const stocks = Object.entries(c.stocks).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
    console.log(`  day ${c.day}: kcal ${c.kcal}, water ${c.water} l, warmth ${c.warmth}, health ${c.health}; camp: ${stocks}; tools: ${c.tools.join(", ") || "none"}`);
  }
  if (r.outcome.kind === "died") console.log(`  died day ${r.outcome.day}, ${r.outcome.cause}`);
  else console.log(`  reached ${r.outcome.day >= DECEMBER_DAY ? "1 December" : `day ${r.outcome.day}`}, day ${r.outcome.day}`);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.passed) passed++;
}
console.log(`passed ${passed} of ${seeds.length}`);
process.exit(passed === seeds.length ? 0 : 1);
```

`package.json` scripts: add `"reference": "vite-node scripts/reference.ts"`.

- [ ] **Step 5: Run the test, then the script**

Run: `npx vitest run tests/reference.test.ts && npm test && npm run typecheck`
Expected: PASS.

Run: `npm run reference`
Expected: four blocks and a verdict. This is the gate. Read every "died" line with its cause and find it in the log by rerunning that seed in a scratch script that prints `state.log` around the death minute. Then:

- The order list is wrong (a keep ranked so it starves the chain, a target too high for the season): fix `REFERENCE_ORDERS` and rerun.
- A rule kills a camp with its needs in reach (water at camp but the runner did not drink it, a tool in the pile never taken up, a keep that never fires): that is a baseline bug in Tasks 1 to 8. Fix it there with a test, and rerun.
- A rule gap outside the seven (something new): stop, write it up in the spec as an eighth item with the evidence, and ask before building it.

Do not weaken the pass criterion. Do not add a safety net to the runner.

- [ ] **Step 6: Lint and commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/scripts/reference.ts 08-survidle/package.json 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): the reference player: a day-one order list run headless, its verdict per seed, and the gate that it reaches 1 December"
```

Commit the script even if the gate is still red, with the verdict in the commit body; the fixes that turn it green are their own commits.

---

### Task 10: The Camp panel, the README and the browser pass

Spec section 10, and the roadmap's rule that every sub-project ships with its browser pass.

**Files:**
- Modify: `src/ui/panels.ts:238-262` (the Camp panel's built line), `README.md`
- Test: `tests/ui.test.ts` (one assertion)

- [ ] **Step 1: The camp water line**

In `src/ui/panels.ts`, where the Camp panel builds `rack` (about line 245), add beside it:

```ts
  const campPile = pile(state, st.campCell);
  const cap = campWaterCapacity(campPile);
  const water = cap > 0 || qty(campPile, "water") + qty(campPile, "ice") > 0
    ? `<div>water: ${qty(campPile, "water").toFixed(1)} of ${cap.toFixed(1)} l${qty(campPile, "ice") > 0 ? `, ${qty(campPile, "ice").toFixed(1)} l frozen` : ""}${st.iceHole ? ", ice hole open" : ""}</div>`
    : "";
```

and append `${water}` after `${rack}` in the `built` row. Import `campWaterCapacity` from `../sim/water` and `pile` from `../sim/inventory`.

Add to `tests/ui.test.ts` (the built line is rendered by `regionHtml`, already imported there):

```ts
  it("the region panel shows camp water against its capacity", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "barkBucket", 2);
    addItem(pile(state, st.campCell), "water", 3);
    const html = regionHtml(state, world, cal, newUiState());
    expect(html).toContain("water: 3.0 of 4.0 l");
  });
```

- [ ] **Step 2: README**

In `README.md`:
- "How it plays" gets, after the Carrying bullet: a **Water at camp** bullet: buckets and waterskins left in the camp pile hold water, "fill vessels, keep camp at 4 litres" carries it home, it freezes without a fire and thaws by one, and an ice hole cut with the axe on a frozen shore is open until morning.
- The Camp bullet: "hang meat to dry" is a task and a keep on dried meat.
- A **Spares** sentence under Skills or Camp: a tool recipe yields a spare that is taken up when the one in hand breaks; "keep camp at 1 axe" is how the axe is never the end of the run.
- Development: `npm run reference` runs the reference player on four seeds (about ten seconds) and is the baseline's gate; not part of `npm test`.
- "Where the numbers live": `src/sim/reference.ts`: the reference player's order list and checkpoints.

- [ ] **Step 3: Full suite, build, lint**

Run: `npm test && npm run build && (cd .. && npx biome lint 08-survidle)`
Expected: PASS, build clean.

- [ ] **Step 4: The browser pass**

Run `npm run dev` and open `http://127.0.0.1:5173/prototypes/08/?seed=17&speed=60`. Walk through, and note what you saw in the commit body:

1. Craft a bark bucket twice; the second is a spare in the pack. Drop one at camp: the Camp panel shows "water: 0.0 of 2.0 l".
2. Add the order "Fill vessels, keep camp at 4 litres, bringing it to camp"; the row shows "camp holds 2 litres; more vessels at camp would hold more" once 2 litres are in.
3. Let the run reach December at speed 60; with the shore iced, the fill order shows "cutting an ice hole", the hole is logged, and the dawn line "The ice hole has skinned over." appears.
4. On a night under -5 C with the fire out: "The water at camp has frozen."; light the fire: "The ice at camp has thawed." within the hour.
5. Build a rack, hunt or gift raw meat, add "Hang meat to dry, keep camp at 10 kg dried meat": the runner hangs, the rack drops dried meat two dry days later.
6. Wear the axe to breaking (fell trees with `window.survidle.state.player.tools[0].durability = 2`) with a spare in the pack: "The axe has broken; you take up the spare."

Stop the dev server. Anything that looked wrong is a fix in the task it belongs to, with a test.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/panels.ts 08-survidle/README.md 08-survidle/tests/ui.test.ts
git commit -m "docs(survidle): the Camp panel shows water against its capacity; the README knows camp water, spares, the hang task and the reference player"
```

---

## Done when

- All ten tasks are committed on `worktree-survidle`.
- `npm test`, `npm run typecheck`, `npm run build` pass; root `npx biome lint 08-survidle` is clean.
- `npm run reference` prints "passed 4 of 4", or the commit body of Task 9 says which seed fails, why, and what the spec's eighth item would be.
- The browser pass in Task 10 is recorded in its commit body.
