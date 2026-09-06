# Before the round: the axe and the survivor, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land roadmap item J (the axe and the wood without one) and the first half of item I (the survivor), then prepare the tester round, on branch `worktree-survivor` in one PR.

**Architecture:** J adds two axe ids and a whetstone to the tool roster, an edge that blunts instead of a durability that breaks, two firewood methods that need no axe, and the list wants that pick between them. I adds a `Person` on the life record with a `person.ts` module that derives every body number from four grades, a landing with three candidates, a card and a face renderer in `src/ui`, and a `voice.ts` that renders templated log lines in second or third person. The round's prep is documentation.

**Tech Stack:** TypeScript, Vite, vitest (`npm test`, fast suite), inline SVG for the face, no new runtime dependency unless the face fallback is taken.

**Spec:** `docs/superpowers/specs/2026-09-06-survidle-survivor-design.md`. Every number below is the spec's; when this plan and the spec differ, the spec wins.

## Global Constraints

- Every test in `npm test` stays green at every commit; `npm run typecheck` and the repo-root `npm run lint` pass before each commit (the pre-commit hook runs both on staged files).
- Stage with explicit paths under `08-survidle/`; never `git add -A`.
- No em dashes, no non-ASCII characters in code, docs or strings.
- Comments explain, never chronicle: no dates, no "before/after" in code comments.
- `derived(medianPerson(sex))` must equal today's constants exactly, so every reference gate keeps its numbers. `tests/reference.test.ts` is the guard.
- The rng streams the sim draws from do not change: candidates roll from `derive(seed, 700 + index * 16 + boat)`, never from `state.rng`.
- The voice task (I7) runs last among code tasks, after `git fetch && git rebase origin/main`.
- Commit messages follow the repo's style: `feat(survidle): <what changed, in a sentence>`, trailer lines as the session instructs.
- Work from `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/survivor/08-survidle`.

---

# Part J: the axe and the wood without one

### Task J1: Three axe ids and the edge

**Files:**
- Modify: `src/sim/types.ts:46` (`ToolId`), `src/sim/items.ts:8-30,53-63` (weights, names, `TOOLS`), `src/sim/inventory.ts:206-253`, `src/sim/tasks.ts:95-107,296-320,368-380,478-484,1047-1058,1226-1231`, `src/sim/body.ts:198`, `src/sim/reference.ts:174-179`, `src/sim/soundscape.ts:152`, `src/sim/save.ts` (nothing: old `axe` stays iron)
- Test: `tests/axes.test.ts`

**Interfaces:**
- Produces: `AXES: ToolId[]`, `axeInHand(p: Player): Tool | undefined`, `axeNear(p: Player, invs: Inventory[]): boolean`, `AXE_WEAR: Record<"axe" | "stoneAxe" | "flakedAxe", number>` in `inventory.ts`; `edgeFactor(state): number` in `tasks.ts` (the duration multiplier `(2 - edge / 100)`, times 1.5 for a flaked axe).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/axes.test.ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { axeInHand, axeNear, freshTool, pile, wearTool } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { current } from "../src/sim/record";
import { check } from "../src/sim/tasks";

describe("three axes", () => {
  it("prefers iron over the celt over the flaked axe in hand", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("flakedAxe"), freshTool("stoneAxe"), freshTool("axe")];
    expect(axeInHand(state.player)!.id).toBe("axe");
    state.player.tools = [freshTool("flakedAxe"), freshTool("stoneAxe")];
    expect(axeInHand(state.player)!.id).toBe("stoneAxe");
  });

  it("wears each head at its factor and keeps iron and the celt at zero", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("axe")];
    expect(wearTool(state, "axe", 150)).toBe(false);
    expect(state.player.tools[0].durability).toBe(0);
    state.player.tools = [freshTool("stoneAxe")];
    wearTool(state, "stoneAxe", 10);
    expect(state.player.tools[0].durability).toBe(85);
    state.player.tools = [freshTool("flakedAxe")];
    wearTool(state, "flakedAxe", 10);
    expect(state.player.tools[0].durability).toBe(60);
    expect(wearTool(state, "flakedAxe", 20)).toBe(true);
    expect(state.player.tools).toHaveLength(0);
  });

  it("fells twice as slow at edge 0 and half again as slow with a flaked axe", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, "forest");
    const cal = calendar(state.minute, state.startDoy);
    const sharp = check(state, world, cal, "chop").duration;
    state.player.tools[0].durability = 0;
    expect(check(state, world, cal, "chop").duration).toBeCloseTo(sharp * 2);
    state.player.tools = [freshTool("flakedAxe")];
    expect(check(state, world, cal, "chop").duration).toBeCloseTo(sharp * 1.5);
  });

  it("logs the blunt line once per cycle at edge 25", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("axe")];
    wearTool(state, "axe", 76);
    wearTool(state, "axe", 5);
    expect(state.log.filter((e) => e.text.includes("blunt")).length).toBe(1);
  });

  it("sees an axe of any kind in the camp pile", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    const st = state.regions[state.player.region];
    const camp = pile(state, st.campCell);
    camp.items.flakedAxe = 1;
    expect(axeNear(state.player, [camp])).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/axes.test.ts`
Expected: FAIL, `freshTool("flakedAxe")` is a type error and `axeInHand` is not exported.

- [ ] **Step 3: Add the ids, weights, names and the wear table**

In `types.ts`: `export type ToolId = "axe" | "stoneAxe" | "flakedAxe" | "knife" | ... | "whetstone";` (add `whetstone` now so J2 does not touch the union again). `CountItem` must include the same ids; find where `axe` is listed as a count item and add the three.

In `items.ts`: `ITEM_KG` adds `stoneAxe: 1.4, flakedAxe: 1.2, whetstone: 0.5, wedge: 0.3`; `ITEM_NAMES` adds `stoneAxe: "stone axes", flakedAxe: "flaked axes", whetstone: "whetstones", wedge: "wedges"`; `TOOLS` adds `stoneAxe: { name: "stone axe", kg: 1.4 }, flakedAxe: { name: "flaked axe", kg: 1.2 }, whetstone: { name: "whetstone", kg: 0.5 }`; `TOOLS.axe.name` becomes `"iron axe"`.

In `inventory.ts`:

```ts
/** Every axe, best first: the iron one holds its edge longest and the flaked one shatters. */
export const AXES: ToolId[] = ["axe", "stoneAxe", "flakedAxe"];
/** How fast each head blunts against the iron axe's rate. */
export const AXE_WEAR: Partial<Record<ToolId, number>> = { axe: 1, stoneAxe: 1.5, flakedAxe: 4 };
export function axeInHand(p: Player): Tool | undefined {
  for (const id of AXES) { const t = tool(p, id); if (t) return t; }
  return undefined;
}
export function axeNear(p: Player, invs: Inventory[]): boolean {
  return AXES.some((id) => toolNear(p, id, invs));
}
```

`wearTool` becomes: multiply `n` by `AXE_WEAR[id] ?? 1`; then for `id === "axe" || id === "stoneAxe"`: `const before = t.durability; t.durability = Math.max(0, t.durability - n); if (before > 25 && t.durability <= 25) log(state, "The axe is blunt; it wants honing."); return false;`. Every other id keeps today's path (the flaked axe is removed at 0 with the spare rule).

- [ ] **Step 4: Route every axe read through the helpers**

`tasks.ts`: `toolFor` returns `"axe"` for chop, split and iceHole today; change those lines so `beginTask` takes up the best axe near: replace `else if (need && !hasTool(state.player, need)) takeUp(state, world, need);` with a branch: when `need === "axe"`, `if (!axeInHand(state.player)) for (const id of AXES) if (takeUp(state, world, id)) break;`. The four `toolNear(p, "axe", invs)` reads at lines 300, 319, 371, 379 become `axeNear(p, invs)`. The chop and split options multiply `duration` by `edgeFactor(state)`:

```ts
/** Felling and splitting slow as the edge goes: twice as long at 0, and a flaked axe is half again as slow at any edge. */
export function edgeFactor(state: GameState): number {
  const axe = axeInHand(state.player);
  if (!axe) return 1;
  const f = 2 - axe.durability / 100;
  return axe.id === "flakedAxe" ? f * 1.5 : f;
}
```

The chop completion's `wearTool(state, "axe", ...)` becomes `wearTool(state, axe.id, ...)` with `const axe = axeInHand(p)!;`, and the `toolWorn` record and "The axe head splits" line fire only when `wearTool` returns true (only the flaked axe can), with the line "The flaked axe shatters on the stroke." The iceHole and butchering wear (`grep -n 'wearTool(state, "axe"' src/sim/tasks.ts`) go the same way. `sharpen`'s `tool(p, "axe")` at lines 480 and 1228 becomes `axeInHand(p)`.

`body.ts:198`: `hasTool(state.player, "axe")` becomes `axeInHand(state.player) !== undefined`. `reference.ts:175-179` `axeInReach`: `if (axeInHand(state.player)) return true; return AXES.some((id) => qty(state.player.pack, id) >= 1 || qty(pile(state, st.campCell), id) >= 1);`. `soundscape.ts:152` `KNAPPED` gains `"flakedAxe"` and `"stoneAxe"` (the recipe ids of J6; add them when J6 lands, leave a note). `intent.ts` `GERUND.sharpen` stays.

- [ ] **Step 5: Run the tests and the whole suite**

Run: `npx vitest run tests/axes.test.ts && npm test`
Expected: PASS; the whole suite green (an existing test that asserts "The axe head splits" or the axe breaking must be updated to the new rule: `grep -rn "head splits\|done for" tests/`).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && (cd ../.. && npm run lint)
git add src/sim/types.ts src/sim/items.ts src/sim/inventory.ts src/sim/tasks.ts src/sim/body.ts src/sim/reference.ts src/sim/soundscape.ts tests/axes.test.ts
git commit -m "feat(survidle): three axes with an edge - the iron axe and the celt blunt and stay, the flaked axe shatters, felling slows as the edge goes"
```

### Task J2: The whetstone and honing

**Files:**
- Modify: `src/sim/types.ts:77-90` (`TaskId`, `TASK_IDS`), `src/sim/items.ts:92-118` (recipe `whetstone`), `src/sim/tasks.ts` (row `hone`, completion, `CARRIED`, `WORK_TASKS`, the `sharpen` label), `src/sim/intent.ts:34,502` (`CAMP_BOUND`, `GERUND`), `src/sim/skills.ts:23-29` (`MASTERY_KEYS.crafting` adds `"hone"`), `src/sim/orders.ts` (`COUNT_WORDS` if it lists sharpen)
- Test: `tests/hone.test.ts`

**Interfaces:**
- Produces: task id `hone`; recipe id `whetstone` (add to `RecipeId`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/hone.test.ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, freshTool, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { beginTask, check, stepTask } from "../src/sim/tasks";

function run(state, world, minutes) { for (let i = 0; i < minutes; i++) stepTask(state, world, 1, new Rng(1)); }

describe("hone", () => {
  it("needs a whetstone and refuses a sharp enough axe", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "hone").why).toBe("needs a whetstone");
    state.player.tools.push(freshTool("whetstone"));
    expect(check(state, world, cal, "hone").why).toBe("sharp enough");
    state.player.tools[0].durability = 40;
    expect(check(state, world, cal, "hone").ok).toBe(true);
  });

  it("restores the edge in ten minutes and wears the whetstone one", () => {
    const { state, world } = newGame(17);
    state.player.tools[0].durability = 40;
    state.player.tools.push(freshTool("whetstone"));
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "hone")).toBe(true);
    expect(state.task!.duration).toBe(10);
    run(state, world, 10);
    expect(state.player.tools[0].durability).toBe(100);
    expect(state.player.tools[1].durability).toBe(99);
  });

  it("still sharpens on a stone for +30", () => {
    const { state, world } = newGame(17);
    state.player.tools[0].durability = 40;
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "sharpen").label).toBe("Sharpen the axe on a stone");
    beginTask(state, world, cal, "sharpen");
    run(state, world, 15);
    expect(state.player.tools[0].durability).toBe(70);
    expect(qty(state.player.pack, "stone")).toBe(0);
  });

  it("makes a whetstone from one stone in thirty minutes with no tool", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "craft", "whetstone");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(30);
  });
});
```

Check the real name of the per-minute task stepper (`grep -n "^export function step" src/sim/tasks.ts src/sim/advance.ts`) and use it; `advance(state, world, minutes)` is the fallback.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/hone.test.ts`. Expected: FAIL on `"hone"` not a `TaskId`.

- [ ] **Step 3: Implement**

`types.ts`: add `"hone"` to `TaskId` and `TASK_IDS`; add `"whetstone"` to `RecipeId`. `items.ts`: `whetstone: { name: "whetstone", needs: [{ item: "stone", qty: 1 }], minutes: 30, out: { item: "whetstone", qty: 1 } }`. `tasks.ts` `check`:

```ts
case "hone": {
  const o = opt({ group: "camp", label: "Hone the axe", detail: "ten minutes on the whetstone; the edge back to full", duration: 10 });
  const axe = axeInHand(p);
  if (!axe) return { ...o, ok: false, why: "no axe" };
  if (!toolNear(p, "whetstone", invs)) return { ...o, ok: false, why: "needs a whetstone" };
  if (axe.durability >= 70) return { ...o, ok: false, why: "sharp enough" };
  return o;
}
```

`toolFor("hone")` returns `"whetstone"` so `beginTask` takes it up. Completion: `const axe = axeInHand(p); if (axe) axe.durability = 100; wearTool(state, "whetstone", 1);`. The `sharpen` row's label becomes "Sharpen the axe on a stone", detail "1 stone; the edge +30". Add `"hone"` to `CARRIED`, `WORK_TASKS`, `availableTasks` (beside line 725's `sharpen` push), `intent.ts` `CAMP_BOUND` and `GERUND` (`hone: () => "honing the axe"`), `skills.ts` `MASTERY_KEYS.crafting`, and `skillOf`/`masteryKey` switch cases beside `sharpen` in `skills.ts:108-126`. `KNAPPED` in `soundscape.ts`: leave.

- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
npx vitest run tests/hone.test.ts && npm test && npm run typecheck && (cd ../.. && npm run lint)
git add src/sim/types.ts src/sim/items.ts src/sim/tasks.ts src/sim/intent.ts src/sim/skills.ts tests/hone.test.ts
git commit -m "feat(survidle): the whetstone and honing - ten minutes bring the edge back to full and spend nothing, and the stone sharpen stays for a camp with no whetstone"
```

### Task J3: The axe lost through the ice

**Files:**
- Modify: `src/sim/tasks.ts:950-967` (`fallThrough`), `src/sim/types.ts:300-310` (`LifeEventBody` gains `{ kind: "toolLost"; tool: ToolId }`), `src/sim/epitaph.ts:80-95` (`eventLine`: `case "toolLost": return \`Day ${e.day}. The ${e.tool} was lost.\`;` using `TOOLS[e.tool].name`)
- Test: `tests/axes.test.ts` (add a describe)

- [ ] **Step 1: Failing test**

```ts
describe("the axe through the ice", () => {
  it("is lost one time in two on a survived fall, and the record says so", () => {
    const { state, world } = newGame(17);
    const land = state.regions[state.player.region].campCell;
    // Rng(3): first draw survives (over 0.6 is a drowning, so pick a seed whose first next() < 0.6 and second < 0.5).
    fallThrough(state, world, new Rng(5), land);
    expect(state.dead).toBeNull();
    expect(axeInHand(state.player)).toBeUndefined();
    expect(current(state).events.some((e) => e.kind === "toolLost" && e.tool === "axe")).toBe(true);
    expect(state.log.some((e) => e.text.includes("bottom"))).toBe(true);
  });
});
```

Find a seed by printing `new Rng(s).next()` twice for s in 1..20 and pick one with the first under 0.6 and the second under 0.5; write the seed and the two draws in a comment.

- [ ] **Step 2: Implement**

In `fallThrough`, after `p.energy = ...` and before the log line:

```ts
const axe = axeInHand(p);
if (axe && rng.chance(0.5)) {
  p.tools = p.tools.filter((t) => t !== axe);
  record(state, { kind: "toolLost", tool: axe.id });
  log(state, `The ${TOOLS[axe.id].name} went to the bottom and stayed there.`, "bad");
}
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/axes.test.ts tests/epitaph.test.ts && npm test && npm run typecheck && (cd ../.. && npm run lint)
git add src/sim/tasks.ts src/sim/types.ts src/sim/epitaph.ts tests/axes.test.ts
git commit -m "feat(survidle): an axe goes to the bottom one time in two when the ice gives way, and the record keeps the loss"
```

### Task J4: Dead wood

**Files:**
- Modify: `src/sim/types.ts` (`TaskId` `deadwood`), `src/sim/tasks.ts` (`LOCATED`, `WORK_TASKS`, row, completion, `availableTasks` beside chop), `src/sim/skills.ts` (`MASTERY_KEYS.woodcraft` adds `"deadwood"`, `skillOf` and `masteryKey` cases), `src/sim/intent.ts` (`GERUND.deadwood`), `src/sim/orders.ts` (`COUNT_WORDS.deadwood: ["load", "loads"]`)
- Test: `tests/deadwood.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("dead wood", () => {
  it("gathers 10 kg of firewood in an hour with no tool and draws the stock an eighth", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    placeAtSpot(state, world, "forest");
    const st = state.regions[state.player.region];
    const wood = st.wood;
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "deadwood");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    beginTask(state, world, cal, "deadwood");
    run(state, world, 60);
    expect(qty(state.player.pack, "firewood")).toBeCloseTo(10);
    expect(st.wood).toBeCloseTo(wood - 0.125);
  });
  it("comes out wet in rain and refuses a picked-clean forest", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, "forest");
    state.weather.precip = "light";
    const cal = calendar(state.minute, state.startDoy);
    beginTask(state, world, cal, "deadwood");
    run(state, world, 60);
    expect(qty(state.player.pack, "wetFirewood")).toBeCloseTo(10);
    state.regions[state.player.region].wood = 0.1;
    expect(check(state, world, cal, "deadwood").why).toBe("the forest is picked clean");
  });
});
```

- [ ] **Step 2: Implement**

Row: `ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Gather dead wood", detail: "10 kg of firewood off the forest floor; no axe", duration: 60, repeatable: true }))`, then `if (st.wood < 0.125) return { ...o, ok: false, why: "the forest is picked clean" };`. Completion: `st.wood -= 0.125; produce(state, world, splitIsWet(state, world) ? "wetFirewood" : "firewood", 10);`. The chop row's "nothing left worth felling" check stays.

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): dead wood - an hour on the forest floor is 10 kg of firewood with no axe, drawn from the felling stock"
```

### Task J5: Wedges

**Files:**
- Modify: `src/sim/types.ts` (`CountItem` `wedge`, `RecipeId` `wedges`, `TaskId` `splitWedges`), `src/sim/items.ts` (recipe `wedges`), `src/sim/tasks.ts` (row and completion beside `split`, `LOCATED`, `WORK_TASKS`, `availableTasks`), `src/sim/intent.ts` (`CAMP_BOUND`, `GERUND`), `src/sim/skills.ts` (`MASTERY_KEYS.woodcraft` adds `"splitWedges"`; cases), `src/sim/orders.ts` (`COUNT_WORDS`)
- Test: `tests/wedges.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("wedges", () => {
  it("are two from two sticks with a knife in twenty minutes", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stick", 2);
    state.player.tools.push(freshTool("knife"));
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "craft", "wedges").duration).toBe(20);
    beginTask(state, world, cal, "craft", "wedges");
    run(state, world, 20);
    expect(qty(state.player.pack, "wedge")).toBe(2);
  });
  it("split a log in 45 minutes into 20 kg, and one split in ten breaks a wedge", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    const camp = pile(state, state.regions[state.player.region].campCell);
    addItem(camp, "log", 1);
    addItem(camp, "wedge", 2);
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "splitWedges");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(45);
    beginTask(state, world, cal, "splitWedges");
    run(state, world, 45); // stepper seeded so the break does not roll
    expect(qty(camp, "firewood") + qty(state.player.pack, "firewood")).toBeCloseTo(20);
    addItem(camp, "wedge", -1);
    expect(check(state, world, cal, "splitWedges").why).toBe("needs two wedges");
  });
});
```

- [ ] **Step 2: Implement**

Recipe: `wedges: { name: "wedges x2", needs: [{ item: "stick", qty: 2 }], tool: "knife", minutes: 20, out: { item: "wedge", qty: 2 } }`. Row: like `split` with label "Split a log with wedges", detail "one log into 20 kg of firewood, driven with a stick; a third the axe's pace", duration 45, `if (totalQty(invs, "wedge") < 2) return { ...o, ok: false, why: "needs two wedges" };` and the same log and dry-weather checks. Completion: as `split`, then `if (rng.chance(0.1)) { consume(invs, [{ item: "wedge", qty: 1 }]); log(state, "A wedge splits along the grain.", "bad"); }`.

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): wedges - two from a knife and two sticks, and a log split with them at a third the axe's pace, a wedge breaking one split in ten"
```

### Task J6: Two stone axe recipes

**Files:**
- Modify: `src/sim/types.ts` (`RecipeId`: `axe` becomes `stoneAxe`, add `flakedAxe`), `src/sim/items.ts:102`, `src/sim/skills.ts:144` (`"craft:stoneAxe": { skill: "crafting", level: 5 }`), `src/sim/save.ts` (`fillDefaults`: rename mastery key `craft:axe` to `craft:stoneAxe` in `state.skills.crafting.mastery`, and any order or task with `arg === "axe"` under `craft` to `stoneAxe`), `src/sim/soundscape.ts:152` (`KNAPPED` adds both), `src/sim/reference.ts:137` (temporary: `keep("craft", 1, "stoneAxe")`; J7 finishes the list)
- Test: `tests/axes.test.ts` (recipes describe), `tests/advance-save.test.ts` (a v6 save with `craft:axe` mastery loads as `craft:stoneAxe`)

- [ ] **Step 1: Failing tests**

```ts
describe("stone axe recipes", () => {
  it("flakes an axe in ninety minutes at no tier and grinds a celt in twenty hours at Crafting 5 with the whetstone", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stone", 3); addItem(state.player.pack, "stick", 2); addItem(state.player.pack, "cordage", 4);
    state.player.tools.push(freshTool("knife"), freshTool("whetstone"));
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "craft", "flakedAxe").duration).toBe(90);
    const celt = check(state, world, cal, "craft", "stoneAxe");
    expect(celt.duration).toBe(1200);
    expect(celt.recommended?.short).toBe(4);
  });
});
```

- [ ] **Step 2: Implement**

`flakedAxe: { name: "flaked axe", needs: [{ item: "stone", qty: 2 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "knife", minutes: 90, out: { item: "flakedAxe", qty: 1 } }` and `stoneAxe: { name: "stone axe", needs: [{ item: "stone", qty: 1 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "whetstone", minutes: 1200, out: { item: "stoneAxe", qty: 1 } }`. The craft row's "needs a X" text uses `TOOLS[rec.tool].name`. Migration in `fillDefaults`: `const m = state.skills.crafting.mastery as Record<string, unknown>; if (m["craft:axe"] !== undefined) { m["craft:stoneAxe"] = m["craft:axe"]; delete m["craft:axe"]; }` and the same rename for `state.task`, `state.intent`, paused keys and orders where `task === "craft" && arg === "axe"` (reuse the `renameArg` pattern at `save.ts:79-100`).

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): a flaked axe in ninety minutes and a ground celt in twenty hours at Crafting 5, the old axe recipe renamed and old saves' mastery carried over"
```

### Task J7: Stone, wedges and dead wood in the list

**Files:**
- Modify: `src/sim/reference.ts:106-160,181-200` (the list, `wantOpen`), `src/sim/reference.ts` header comment
- Test: `tests/reference.test.ts` (the existing gate assertions stay), `tests/list.test.ts` (new)

- [ ] **Step 1: Failing tests**

```ts
describe("the list after J", () => {
  it("keeps stone, hones after the knife, and picks the firewood method by the axe in reach", () => {
    const tasks = REFERENCE_ORDERS.map((w) => `${w.req.task}:${w.req.arg ?? ""}:${w.kind}`);
    expect(tasks).toContain("stone::keep");
    expect(tasks.indexOf("craft:whetstone:job")).toBeGreaterThan(tasks.indexOf("craft:knife:job"));
    expect(tasks.indexOf("hone::grind")).toBeGreaterThan(tasks.indexOf("craft:whetstone:job"));
    expect(tasks.indexOf("splitWedges::keep")).toBeGreaterThan(tasks.indexOf("split::keep"));
    expect(tasks.indexOf("deadwood::keep")).toBeGreaterThan(tasks.indexOf("splitWedges::keep"));
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const w = (t: string) => REFERENCE_ORDERS.find((x) => `${x.req.task}:${x.req.arg ?? ""}:${x.kind}` === t)!;
    expect(wantOpen(state, world, w("split::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, w("deadwood::keep"), cal)).toBe(false);
    state.player.tools = [];
    expect(wantOpen(state, world, w("split::keep"), cal)).toBe(false);
    expect(wantOpen(state, world, w("splitWedges::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, w("deadwood::keep"), cal)).toBe(true);
    expect(wantOpen(state, world, w("craft:flakedAxe:keep"), cal)).toBe(true);
    expect(wantOpen(state, world, w("craft:stoneAxe:keep"), cal)).toBe(false);
    setSkillLevel(state, "crafting", 5);
    expect(wantOpen(state, world, w("craft:stoneAxe:keep"), cal)).toBe(true);
  });
});
```

`setSkillLevel` lives in `horizon.ts` (see `horizon.ts:65`); import it from there.

- [ ] **Step 2: Implement the list**

Replace `job("stone", { kind: "campHas", qty: 8 })` with `keep("stone", 8)`. After `job("craft", { kind: "once" }, "knife")` insert `job("craft", { kind: "once" }, "whetstone")`, `{ req: { task: "hone", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" }`, `keep("craft", 2, "wedges")` (a keep on recipe `wedges` counts `wedge` at camp: check how `keep("craft", 8, "cordage")` counts and follow it: `orderMet` reads `campHas` of the recipe's `out.item`). After `keep("split", 60)`: `keep("splitWedges", 60)`, `keep("deadwood", 60)`; after `keep("split", 400)`: `keep("splitWedges", 400)`, `keep("deadwood", 400)`. Replace `keep("craft", 1, "axe")` with `keep("craft", 1, "stoneAxe")` and add `keep("craft", 1, "flakedAxe")` right after. In `wantOpen` add, before the water rules:

```ts
// Firewood by method: the axe while one is in reach, wedges and dead wood when none is.
if (w.req.task === "split") return axeInReach(state, world) && seasonOpen;   // seasonOpen is whatever the 400 keep checks today; keep that logic for the 400 rows
if (w.req.task === "splitWedges" || w.req.task === "deadwood") return !axeInReach(state, world);
if (w.req.task === "craft" && w.req.arg === "stoneAxe") return skillLevel(state, "crafting") >= 5;
if (w.req.task === "craft" && w.req.arg === "flakedAxe") return skillLevel(state, "crafting") < 5 && !axeInReach(state, world);
```

Read how the 400 kg keep's season rule is applied today (`reference.ts:340-370`) and keep the two new 400 rows under the same rule. Update the header comment to explain the three methods and the hone grind.

- [ ] **Step 3: Run the fast suite and the reference gate**

```bash
npx vitest run tests/list.test.ts tests/reference.test.ts && npm test
```

Expected: green. If `tests/reference.test.ts` asserts a golden of the list or the April readings that moved, read the failure: the April gate must stay 4 of 4; a moved day is acceptable, a red gate is not.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(survidle): the list keeps stone, hones on the whetstone, and splits with wedges or gathers dead wood when no axe is in reach"
```

### Task J8: The year probe and J's readings

- [ ] **Step 1: Run the probe in the background**

```bash
(npm run year -- --level=20 > /tmp/claude-501/year-l20.txt 2>&1; npm run year -- --winter > /tmp/claude-501/year-winter.txt 2>&1) &
```

Continue with Part I while it runs (a quarter of an hour or more).

- [ ] **Step 2: Record**

When it finishes, read both files. In the roadmap's J section add a "**Built.**" paragraph: what landed (the five parts), the level-20 readings per seed (day and cause) against the before (208 thirst, 187 starved, 197 thirst, 211 thirst), the winter gate, and the browser pass line from the spec's section 9 once run (Part R). Mark the build order line "J ... built". Commit with `docs(survidle): J built and measured - ...`.

# Part I: the survivor

### Task I1: The person, the names and the save

**Files:**
- Create: `src/sim/person.ts`
- Modify: `src/sim/types.ts:330-350` (`Person`, `LifeRecord.person`, `LogEntry.away?`), `src/sim/names.ts`, `src/sim/record.ts:14` (`newRecord(index, name, landed, gapDays, person)`), `src/sim/newgame.ts`, `src/sim/landing.ts:190-200` (record creation passes a person; the candidate roll lands in I4), `src/sim/save.ts:24-40,47-60` (version 7, migration)
- Test: `tests/person.test.ts`, `tests/names.test.ts`, `tests/advance-save.test.ts`

**Interfaces:**
- Produces in `person.ts`: `type Grade`, `type QuirkId`, `interface Person`, `medianPerson(sex): Person`, `rollCandidates(seed, index, boat, taken): Candidate[]` (returns `{ name, person }[]` of three), `derived(person): Derived` where `Derived = { packComfortableKg; packHardKg; workHours; workBurn; massKg; fatFull; baseBurn; comfortC; spoilFactor; wearFactor; sightReach; dayOdds }`, `gradeLines(person): string[]` (four lines), `quirkLine(q): string`, `quirkFear(q): string | null`, `hasQuirk(state, q): boolean`, `personOf(state): Person` (the current record's), `QUIRKS: QuirkId[]`.
- Produces in `names.ts`: `WOMEN`, `MEN`, `LAST_NAMES: (string | { m: string; f: string })[]`, `rollName(rng, sex, taken)`, `sexOfName(first): "f" | "m" | null`.

- [ ] **Step 1: Failing tests**

```ts
// tests/person.test.ts
import { describe, expect, it } from "vitest";
import { derived, medianPerson, rollCandidates } from "../src/sim/person";
import { PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../src/units";
import { WORK_HOURS_DEFAULT } from "../src/sim/body";
import { BASE_KCAL_PER_HOUR, COMFORT_C, FAT_FULL } from "../src/sim/player";

describe("the person", () => {
  it("rolls the same three twice and never coast-born with forest-born", () => {
    const a = rollCandidates(17, 1, 0, []);
    const b = rollCandidates(17, 1, 0, []);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const c of a) {
      expect(c.person.quirks.length).toBeGreaterThanOrEqual(1);
      expect(c.person.quirks.length).toBeLessThanOrEqual(2);
      expect(c.person.quirks.includes("coastBorn") && c.person.quirks.includes("forestBorn")).toBe(false);
    }
    expect(rollCandidates(17, 1, 1, [])).not.toEqual(a);
  });
  it("spreads grades one, two, three, two, one in nine", () => {
    const counts = [0, 0, 0, 0, 0];
    for (let s = 0; s < 3000; s++) for (const c of rollCandidates(s, 1, 0, [])) counts[c.person.axes.strength + 2]++;
    const n = 9000;
    for (const [i, share] of [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9].entries()) expect(Math.abs(counts[i] / n - share)).toBeLessThan(0.02);
  });
  it("derives today's numbers from the median", () => {
    const d = derived(medianPerson("f"));
    expect(d.packComfortableKg).toBe(PACK_COMFORTABLE_KG);
    expect(d.packHardKg).toBe(PACK_HARD_KG);
    expect(d.workHours).toBe(WORK_HOURS_DEFAULT);
    expect(d.workBurn).toBe(1);
    expect(d.massKg).toBe(72);
    expect(d.fatFull).toBe(FAT_FULL);
    expect(d.baseBurn).toBe(BASE_KCAL_PER_HOUR);
    expect(d.comfortC).toBe(COMFORT_C);
    expect(d.spoilFactor).toBe(1);
    expect(d.wearFactor).toBe(1);
    expect(d.sightReach).toBe(1);
    expect(d.dayOdds).toBe(1);
  });
  it("derives the table's ends", () => {
    const p = medianPerson("m");
    const top = derived({ ...p, axes: { strength: 2, build: 2, hands: 2, eyes: 2 } });
    expect(top.packComfortableKg).toBe(30); expect(top.packHardKg).toBe(42); expect(top.workHours).toBe(12);
    expect(top.workBurn).toBeCloseTo(1.1); expect(top.massKg).toBe(84); expect(top.fatFull).toBeCloseTo(93333.33, 1);
    expect(top.baseBurn).toBeCloseTo(81.67, 1); expect(top.comfortC).toBe(3); expect(top.spoilFactor).toBeCloseTo(0.6);
    expect(top.wearFactor).toBeCloseTo(0.8); expect(top.sightReach).toBe(2); expect(top.dayOdds).toBeCloseTo(1.2);
    const low = derived({ ...p, axes: { strength: -2, build: -2, hands: -2, eyes: -2 } });
    expect(low.packComfortableKg).toBe(20); expect(low.packHardKg).toBe(28); expect(low.workHours).toBe(8);
    expect(low.massKg).toBe(60); expect(low.comfortC).toBe(7); expect(low.spoilFactor).toBeCloseTo(1.4);
    expect(low.sightReach).toBe(0); expect(low.dayOdds).toBeCloseTo(0.8);
  });
});
```

Names tests, added to `tests/names.test.ts`: a woman rolled 200 times never gets "Kalnins" and gets "Kalnina" at least once; a man never "Kalnina"; `sexOfName("Aino")` is "f", `sexOfName("Eirik")` is "m", `sexOfName("Zed")` is null. Save test in `tests/advance-save.test.ts`: a serialised version 6 file (take an existing v6 fixture in that file or build one by serialising and editing `version`) loads with `state.survivors[0].person` equal to `medianPerson(sexOfName(first) ?? "m")` with `face` the index.

- [ ] **Step 2: Implement `person.ts`**

```ts
/**
 * The person: four grades and a quirk or two, rolled per candidate and kept
 * on the life record. Every number the grades set is a real quantity read
 * through derived(); the median person is today's survivor exactly.
 */
import { derive, Rng } from "../rng";
import { PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../units";
import { WORK_HOURS_DEFAULT } from "./body";
import { rollName, sexOfName } from "./names";
import { BASE_KCAL_PER_HOUR, COMFORT_C, FAT_FULL } from "./player";
import { current } from "./record";
import type { Candidate, GameState, Person, QuirkId } from "./types";

export const QUIRKS: QuirkId[] = ["coastBorn", "forestBorn", "sleepsLight", "bigEater", "steadyByTheFire"];
export const MEDIAN_MASS_KG = 72;

export function medianPerson(sex: "f" | "m"): Person {
  return { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
}

function grade(rng: Rng): Grade { return (rng.int(3) + rng.int(3) - 2) as Grade; }

export function rollCandidates(seed: number, index: number, boat: number, taken: { first: string; last: string }[]): Candidate[] {
  const rng = new Rng(derive(seed, 700 + index * 16 + boat));
  const out: Candidate[] = [];
  for (let i = 0; i < 3; i++) {
    const sex = rng.int(2) === 0 ? "f" : "m";
    const name = rollName(rng, sex, [...taken, ...out.map((c) => c.name)]);
    const axes = { strength: grade(rng), build: grade(rng), hands: grade(rng), eyes: grade(rng) };
    const n = rng.int(3) === 0 ? 2 : 1;
    const pool = [...QUIRKS];
    const quirks: QuirkId[] = [];
    for (let k = 0; k < n; k++) {
      const q = pool.splice(rng.int(pool.length), 1)[0];
      const clash = (q === "coastBorn" && quirks.includes("forestBorn")) || (q === "forestBorn" && quirks.includes("coastBorn"));
      if (!clash) quirks.push(q);
    }
    out.push({ name, person: { sex, axes, quirks, face: rng.int(2 ** 31) } });
  }
  return out;
}

export interface Derived { packComfortableKg: number; packHardKg: number; workHours: number; workBurn: number; massKg: number; fatFull: number; baseBurn: number; comfortC: number; spoilFactor: number; wearFactor: number; sightReach: 0 | 1 | 2; dayOdds: number }

export function derived(p: Person): Derived {
  const { strength: s, build: b, hands: h, eyes: e } = p.axes;
  const massKg = MEDIAN_MASS_KG + 6 * b;
  return {
    packComfortableKg: PACK_COMFORTABLE_KG + 2.5 * s, packHardKg: PACK_HARD_KG + 3.5 * s,
    workHours: WORK_HOURS_DEFAULT + s, workBurn: 1 + 0.05 * s,
    massKg, fatFull: (FAT_FULL * massKg) / MEDIAN_MASS_KG, baseBurn: (BASE_KCAL_PER_HOUR * massKg) / MEDIAN_MASS_KG,
    comfortC: COMFORT_C - b, spoilFactor: 1 - 0.2 * h, wearFactor: 1 - 0.1 * h,
    sightReach: e <= -1 ? 0 : e >= 1 ? 2 : 1, dayOdds: 1 + 0.1 * e,
  };
}

export function personOf(state: GameState): Person { return current(state).person; }
export function hasQuirk(state: GameState, q: QuirkId): boolean { return personOf(state).quirks.includes(q); }
```

Watch the import cycle: `player.ts` and `body.ts` will import `person.ts` in I2, and `person.ts` imports their constants. Move `FAT_FULL`, `BASE_KCAL_PER_HOUR`, `COMFORT_C` and `WORK_HOURS_DEFAULT` reads into `person.ts` as its own constants only if vitest reports a cycle at runtime (a `const` read at call time inside a function is safe; a top-level read is not). `derived` reads them inside the function, so the cycle is safe.

Add the words: `gradeLines(p)` returns the four strings from the spec's 11.1 table (`HOURS_WORDS = ["eight", "nine", "ten", "eleven", "twelve"]`, `kg(x)` printing `22.5 kg` and `25 kg`), `quirkLine(q)` and `quirkFear(q)` from section 12's card lines (fear: coastBorn "the fell in cloud", forestBorn "the open shore in a storm", others null).

`names.ts`: split the first-name array into `WOMEN` (Sigrid, Ingrid, Astrid, Solveig, Ragnhild, Helga, Kari, Liv, Tove, Aino, Kaisa, Tuula, Sanna, Riikka, Jorunn, Ilze, Liga, Dace, Inese, Rasa, Egle, Ruta, Aldona, Kadri, Liis, Anu) and `MEN` (the rest); `LAST_NAMES` entries with pairs per the spec's 10.3; `rollName(rng, sex, taken)` draws from the sex's list and takes `typeof l === "string" ? l : l[sex]`; keep `fmtName`, `nameTaken`. `sexOfName(first)` looks both lists up. Update the two existing callers (`newgame.ts`, `landing.ts`, `save.ts`) to pass a sex: `newgame.ts` rolls the sex from the same rng first (`const rng = new Rng(derive(seed, 7)); const sex = rng.int(2) === 0 ? "f" : "m";`) and the record gets `medianPerson(sex)` (this moves the existing name draws by one; `tests/names.test.ts` and any golden that names a survivor by seed must be re-pinned; the reference gate does not read names).

`types.ts`: `Person`, `Candidate`, `Grade`, `QuirkId`; `LifeRecord.person: Person`; `LogEntry.away?: true`. `record.ts`: `newRecord(index, name, landed, gapDays, person)`. `save.ts`: `SaveFile.version: 7`, accept 3 to 7, and in `fillDefaults` for each record: `s.person ??= { ...medianPerson(sexOfName(s.name.first) ?? (s.index % 2 ? "m" : "f")), face: s.index };`.

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/person.test.ts tests/names.test.ts tests/advance-save.test.ts && npm test && npm run typecheck && (cd ../.. && npm run lint)
git add src/sim/person.ts src/sim/types.ts src/sim/names.ts src/sim/record.ts src/sim/newgame.ts src/sim/landing.ts src/sim/save.ts tests/person.test.ts tests/names.test.ts tests/advance-save.test.ts
git commit -m "feat(survidle): the person - four grades rolled two dice minus four, a quirk or two, a sex with paired Latvian and Lithuanian surnames, the median as today's survivor, on the record and in the save"
```

### Task I2: The axes at their seams

**Files:**
- Modify: `src/sim/inventory.ts:165-175`, `src/sim/actions.ts:110`, `src/sim/intent.ts:318,338,383,469`, `src/sim/body.ts:409-425`, `src/sim/player.ts:160-170,240-300,101-110,347-350`, `src/sim/water.ts` (any `PACK_*` read), `src/sim/tasks.ts:598`, `src/ui/panels.ts` (any `PACK_*` read), `src/sim/newgame.ts:60` (`workHours`, `fat`), `src/sim/skills.ts:272-318` (`craftSuccess`, `wearFactor`), `src/sim/regionstate.ts:80-92` (`enterRegion`), `src/sim/tasks.ts:645-658` (`huntOdds`)
- Test: `tests/axes-body.test.ts`

- [ ] **Step 1: Failing tests** (per the spec's section 17 `axes` bullet; build the state with `newGame(17, undefined, { ...medianPerson("m"), axes: {...} })` after I2 adds the `person` parameter to `newGame`, which this task does first)

```ts
it("walks 28 kg at full speed at +2 strength and works twelve hours", () => {
  const strong = newGame(17, undefined, { ...medianPerson("m"), axes: { strength: 2, build: 0, hands: 0, eyes: 0 } });
  const median = newGame(17);
  addItem(strong.state.player.pack, "firewood", 28); addItem(median.state.player.pack, "firewood", 28);
  const cal = calendar(0, START_DOY);
  expect(walkSpeed(strong.state, strong.world, cal)).toBeGreaterThan(walkSpeed(median.state, median.world, cal));
  expect(strong.state.player.workHours).toBe(12);
});
```

(`walkSpeed` is whatever `player.ts:160-170` exports; read it.) Add the fat, base burn, comfort, spoil, sight and hunt-odds assertions from section 17.

- [ ] **Step 2: Implement**

`newGame(seed, startDoy = START_DOY, person?: Person)`: the record gets `person ?? medianPerson(sex)`; `newPerson(state, world, cell, region)` reads `personOf(state)` after the record exists (in `newGame` push the record before `newPerson`; it already does) and sets `fat: derived(p).fatFull`, `workHours: derived(p).workHours`. Add `export function body(state): Derived { return derived(personOf(state)); }` in `person.ts` and use it at each seam:

- `PACK_COMFORTABLE_KG` reads become `body(state).packComfortableKg`; `PACK_HARD_KG` reads `body(state).packHardKg`. Where a function has no `state` (check each; `inventory.ts:165` `stow` has `state`), thread it.
- `player.ts` burn: `burn = KCAL_PER_HOUR[a]` then `const above = burn - BASE_KCAL_PER_HOUR;` becomes: base bucket `d.baseBurn * h`, activity `above * d.workBurn * h` (walk the same). `starvation(p)` and the fat warnings read `fatFull` through a `fatFull(state)` helper instead of `FAT_FULL`; `warmthTarget(felt)` gains a `comfortC` parameter with default `COMFORT_C`, and its caller passes `body(state).comfortC`.
- `skills.ts` `craftSuccess`: after `let f = 0.5 ** gap(...)`, `f = 1 - Math.min(1, (1 - f) * body(state).spoilFactor);` before the cold and tired doublings. `wearFactor`: multiply the result by `body(state).wearFactor`.
- `regionstate.ts` `enterRegion`: `const reach = body(state).sightReach; if (reach >= 1) for nb of r.neighbours: SEEN; if (reach >= 2) for each nb's neighbours: SEEN if undiscovered`.
- `tasks.ts` `huntOdds`: `if (!cal.isNight) odds *= body(state).dayOdds;`.

Every existing test keeps passing because the median derives today's numbers; the `landing.ts` heir record uses the median until I4.

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): the grades reach the body - load, working day, burn, fat and comfort by strength and build, spoil and wear by hands, sight and day odds by eyes"
```

### Task I3: The five quirks

**Files:**
- Modify: `src/sim/regionstate.ts` (coast-born reads shores on entry: call `readShore` for each shore cell of the region; find the region's cells via `readCells`/`shoreFish` helpers in `knowledge.ts:38`), `src/world/route.ts:26` (`passable(t, ice, avoidFell = false)` and `findRoute(world, from, to, ice, avoidFell)`), `src/sim/tasks.ts` (the walk row and `beginTask` pass `avoidFell = hasQuirk(state, "coastBorn") && !state.weather.clear`; a task whose site cell is fell refuses "will not go up on the fell in this cloud"; a shore-spot task refuses "will not work the open shore in this storm" for forest-born during `stormNow`), `src/sim/skills.ts:170` (`gap`: forest-born minus 2 for `hunt:` keys whose species' `hunt.spot === "forest"`), `src/sim/events.ts:26-40` (sleeps light), `src/sim/player.ts:282` (storm night energy halved for sleeps light; every bucket x1.1 for big eater), `src/sim/tasks.ts:773` (`beginTask` duration x0.9 for big eater), `src/sim/fire.ts:119` (`lightingInRain(w, ambient, roofOverPit, steady = false)`, callers pass `hasQuirk(state, "steadyByTheFire")`)
- Test: `tests/quirks.test.ts`, the five tests from spec section 12

- [ ] **Step 1: Failing tests** (one `it` per quirk, each building `newGame(17, undefined, { ...medianPerson("m"), quirks: [q] })` beside the median and asserting the spec's number)

- [ ] **Step 2: Implement each seam as listed; commit**

```bash
git commit -m "feat(survidle): five quirks - coast-born and forest-born with their fears, sleeps light, big eater, steady by the fire, each a seam and a test"
```

### Task I4: The boat

**Files:**
- Modify: `src/sim/types.ts:342-352` (`Landing`), `src/sim/landing.ts` (`beginAgain` rolls candidates, `nextBoat`, `land` reads `chosen`, first-survivor landing; `rerollName` removed), `src/sim/newgame.ts` (`newWorld(seed, boat = 0)`), `src/sim/reference.ts` (`runHeir`: replace candidates with one median), `src/main.ts:97-145,290-312` (`fresh` uses `newWorld`, actions `pick-candidate`, `next-boat`, `land`), `src/ui/panels.ts:543-552` (`landingHtml` lists three candidates as plain blocks with name and `gradeLines`; the card replaces this in I6), `src/ui/render.ts` (`UiState` unchanged)
- Test: `tests/boat.test.ts` (spec section 17 `boat` bullet), `tests/landing.test.ts` updated where it used `rerollName` or `landing.name`

- [ ] **Step 1: Failing tests** (from the spec: `newWorld(17)` opens in landing with three candidates on doy `START_DOY`; `newWorld(17, 1)` on `START_DOY + 7` with different names; heir `nextBoat` adds 7 to `gapDays` and ages `structureAge` by 7; a death on doy 300 then `nextBoat` lands on doy 125 next year; `land` with `chosen = 2` puts candidate 2's name and person on the record)

- [ ] **Step 2: Implement**

`Landing` per the spec's 13.1. `beginAgain`: `candidates: rollCandidates(state.seed, index, 0, taken)`, `boat: 0`, `chosen: 0`. `nextBoat(state, world)`:

```ts
export function nextBoat(state: GameState, world: World): void {
  const l = state.landing;
  if (!l) return;
  const from = { ...l.date };
  let { year, doy } = from; let added = 0;
  const step = () => { doy += 1; added += 1; if (doy >= 365) { doy = 0; year += 1; } };
  for (let i = 0; i < 7; i++) step();
  while (!coastOpen(doy)) step();
  advance(state, world, added * 1440, { nobody: true });
  state.year = worldDate(state).year; state.startDoy = doy; state.minute = 0; state.lastHour = 0; state.lastDay = 0;
  state.weather.rolledDay = 0; state.weather.storm = null;
  for (const st of Object.values(state.regions)) st.iceHole = null;
  state.log = [];
  l.date = { year, doy }; l.gapDays += added; l.boat += 1; l.chosen = 0;
  l.candidates = rollCandidates(state.seed, state.survivors.length + 1, l.boat, state.survivors.map((s) => s.name));
}
```

Check `worldDate` after the rebase gives the right year (the heir's `beginAgain` sets `state.year` from `worldDate` before rebasing; do the same order). For the first survivor (`state.survivors.length === 0`) `main.ts` calls `newWorld(seed, boat + 1)` instead. `newWorld` in `newgame.ts` builds via `newGame(seed, START_DOY + 7 * boat)`, then `state.survivors = []`, `state.landing = { cell: start.campCell, region: world.start, date: { year: 1, doy: START_DOY + 7 * boat }, gapDays: 0, candidates: rollCandidates(seed, 1, boat, []), boat, chosen: 0, oldCamp: null }`, `state.log = []`. `land(state, world, typedName?)`: `const c = l.candidates[l.chosen]; const name = typedName?.trim() ? parse(typedName) : c.name;` (the name field's parse: split on the last space into first and last; a single word is the first name with the candidate's surname); push `newRecord(index, name, l.date, l.gapDays, c.person)`; `newPerson`; for the first survivor log the 1 April line (moved from `newGame`, which keeps writing it for the direct path only when `survivors.length === 1` at creation, so scripts and tests still see it), else the heir line as today. `main.ts`: `fresh()` uses `newWorld`; actions: `pick-candidate` sets `state.landing.chosen = Number(target.dataset.index)`; `next-boat`; `land` reads the input as today. Remove `rerollName` and its action.

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): the boat - three candidates on the landing screen for the first survivor and every heir, next boat a week later with the world run on, the chosen one landed"
```

### Task I5: The face

**Files:**
- Create: `src/ui/face.ts`, `src/ui/faces-page.ts` (the `?faces=1` page)
- Modify: `src/main.ts:47-60` (when `params.get("faces")` is set, render the page into `#app` and stop), `src/style.css` (`.face svg { image-rendering: pixelated; }`, sizes)
- Test: `tests/face.test.ts`

**Interfaces:**
- Produces: `FACE_SIZE: 8 | 12`, `facePixels(person, size): string[][]` (rows of colour keys, `size` rows of `size`), `faceSvg(person, px: number): string`.

- [ ] **Step 1: Failing tests** (spec 17 `face`: every hair x beard x eyes x jaw combination for both sexes yields `size` rows of `size` cells each a mirror of itself; two seeds differ; one seed twice equal; a woman's rows never contain the beard key `B`)

- [ ] **Step 2: Implement**

Templates as strings, one per row, four characters per row for the left half, characters: `.` background, `S` skin, `H` hair, `E` eye, `L` line, `B` beard, `W` eye white. Layers compose left half then mirror. Example (8 rows, 4 columns, the left half) for the base head with a narrow jaw:

```
....
.SSS
SSSS
SSSS
SSSS
.SSS
..SS
....
```

Hair short: rows 0-1 `.HHH` / `HHHH` painted over skin where `H`; long: rows 0-5 column 0 `H`; braided (women): long plus row 6 column 0 `H`; cropped: row 0 `..HH`; bald: nothing. Eyes plain: row 3 `..E.` painted; wide and bright: row 3 `.WE.`; narrow: row 3 `..L.`. Jaw wide: rows 5-6 become `SSSS` / `.SSS`. Beard short: row 6 `..BB`; full: rows 5-6 `.BBB` / `.BBB`. The 12-size set is the same shapes scaled by drawing each 8-row template into 12 rows with the head one row taller at the top and bottom and a wider mid; write it as its own set of strings rather than scaling. Palette from the face seed: `new Rng(person.face)` picks skin from `["#e8c39e", "#d4a373", "#b07d4f"]`, hair from `["#2b1d14", "#6b4423", "#d9b86a", "#a4402a"]`, eye from `["#2f4f6f", "#4b6b3a", "#3b2a1a"]`, line `"#1a1410"`, background from `["#3b4652", "#2f4a3d", "#232b4a"]`, white `"#f2efe6"`. `faceSvg` emits `<svg class="face" viewBox="0 0 S S" width=px height=px shape-rendering="crispEdges">` with one `<rect>` per cell (skip background cells; fill the background with one rect first). The page: 24 women and 24 men over the three eye grades and two jaw grades at both sizes, each face captioned with its template picks, rendered at 8x scale.

- [ ] **Step 3: Look at it and send the screenshots**

Run the dev server (`npm run dev` in the background), open `http://127.0.0.1:5173/prototypes/08/?faces=1` in Chrome through the DevTools MCP, screenshot the page, judge each face by shape and colour, adjust the templates until a face reads as a person at 8x8, then screenshot one woman's and one man's face at 8x scale and send both with `SendUserFile`. If after three rounds of template edits 8x8 does not read, set `FACE_SIZE = 12`; if 12 does not read either, take the spec's library fallback (add `pixel-avatar-lib` to dependencies, render once per face to a data URL through a hidden canvas, and note the switch in the roadmap's Built line).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(survidle): the face - an 8x8 mirrored portrait from the person, hair and beard by the seed, eyes and jaw by the grades, and a self-test page at ?faces=1"
```

### Task I6: The card

**Files:**
- Create: `src/ui/card.ts`
- Modify: `src/sim/epitaph.ts` (`stories(rec): string[]`, `since(rec, day, name?)`), `src/ui/panels.ts:83` (stats header), `:528-579` (tombstone, landing cards, cemetery, journal), `:587-600` (away report face), `src/main.ts` (`copy-card` action: `navigator.clipboard.writeText(cardText(...))` with the textarea fallback and a "copied" flash held in `ui.copied` for two seconds), `src/ui/render.ts` (`UiState.copied?: number`), `src/style.css` (`.card`, `.cards` row that stacks under 700px, `.card.chosen`)
- Test: `tests/card.test.ts`

- [ ] **Step 1: Failing tests** (spec 17 `card`: `cardText` for `rollCandidates(17, 1, 0, [])[0]` against a golden string pinned on the first run; `stories` on a record with a wolves night, an elk first kill, a lean-to built and a storm returns the wolves night, the elk and the lean-to oldest first; `cardHtml` stripped of tags and collapsed whitespace equals `cardText`)

- [ ] **Step 2: Implement**

`card.ts`: `cardLines(person, name, extra?: { day; know: string; fear: string; lost: string; stories: string[] }): { title: string; lines: string[] }` and the two renderers over it; `cardHtml` puts `faceSvg(person, 64)` first. `stories(rec)` in `epitaph.ts` ranks per section 14 with a `rank(e)` function over `LifeEvent` kinds and the worst-night pseudo line. Journal: `cardHtml` with the extras (know from `state.skills` levels at 3 and up and `Object.keys(state.player.known).length`; fear from `quirkFear`; lost from `p.toes`, `p.fingers`, `toolWorn` and `toolLost` events). Landing: three `cardHtml` in a `.cards` row, each wrapped in a button `data-act="pick-candidate" data-index`, the chosen with class `chosen`; the name input prefilled from the chosen candidate; "next boat (a week later, N Month)" button. Stats header: `<h2>${faceSvg(p, 24)} ${first} <span class="r">day N</span></h2>`. Tombstone and opened graves: the card and a copy button. Away report: `faceSvg` before the since line.

- [ ] **Step 3: Run, commit**

```bash
git commit -m "feat(survidle): the card - face, name, grades and quirks on the landing screen, the journal with what they know, fear and lost and three stories, the tombstone and the cemetery, with a copy button"
```

### Task I7: The voice

Run first: `git fetch origin && git rebase origin/main`, resolve, `npm test`.

**Files:**
- Create: `src/sim/voice.ts`
- Modify: every file in the spec's 15.1 list (`grep -rln "\b[Yy]ou\b\|\b[Yy]our\b" src/sim src/ui src/main.ts`), `src/sim/save.ts:195-225` (`catchUp` marks entries), `src/ui/panels.ts:511-516,587-600` (`logHtml`, `awayHtml` render through `voice`), `src/sim/epitaph.ts` (`since(rec, day, name?)`)
- Test: `tests/voice.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { voice } from "../src/sim/voice";
it("renders second and third person from one template", () => {
  expect(voice("{You} {reach} Grey Shore.", null)).toBe("You reach Grey Shore.");
  expect(voice("{You} {reach} Grey Shore.", "Veikko")).toBe("Veikko reaches Grey Shore.");
  expect(voice("{You} {are} thirsty.", "Aino")).toBe("Aino is thirsty.");
  expect(voice("{Your} ribs show.", "Aino")).toBe("Aino's ribs show.");
  expect(voice("Too tired to stand, {you} {sleep} where {you} {are}.", "Veikko")).toBe("Too tired to stand, Veikko sleeps where Veikko is.");
  expect(voice("{You} {crawl} out soaked.", "Aino")).toBe("Aino crawls out soaked.");
  expect(voice("{You} {empty} the trap.", "Aino")).toBe("Aino empties the trap.");
  expect(voice("{You} {fix} the roof.", "Aino")).toBe("Aino fixes the roof.");
  expect(voice("{You} {have} an axe.", "Aino")).toBe("Aino has an axe.");
});
it("has no bare you in any log string", () => {
  const files = globSync("src/{sim,ui}/**/*.ts").concat(["src/main.ts"]);
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/log\(\s*state\s*,\s*(`[^`]*`|"[^"]*")/g)) if (/\b[Yy]our?\b/.test(m[1])) bad.push(`${f}: ${m[1].slice(0, 60)}`);
    for (const m of src.matchAll(/^\s+\w+: "([^"]*)",?$/gm)) if (src.includes("DEATH_LINES") && /\b[Yy]our?\b/.test(m[1])) bad.push(`${f}: ${m[1]}`);
  }
  expect(bad).toEqual([]);
});
it("marks catch-up entries and renders them by name", () => { /* newGame(17); catchUp for an hour; expect every new entry .away === true; awayHtml(...) contains no "You " in those entries */ });
```

Use `fs.readdirSync` recursion or `import { globSync } from "node:fs"` (Node 22 has `fs.globSync`; check the Node version, fall back to a small walker).

- [ ] **Step 2: Implement `voice.ts`**

```ts
const IRREGULAR: Record<string, string> = { are: "is", have: "has", do: "does", were: "was" };
function third(verb: string): string {
  if (IRREGULAR[verb]) return IRREGULAR[verb];
  if (/(s|sh|ch|x|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}
/** Fills a templated line in second person (name null) or third person by name. */
export function voice(text: string, name: string | null): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_m, tok: string) => {
    switch (tok) {
      case "You": return name ?? "You";
      case "you": return name ?? "you";
      case "Your": return name ? `${name}'s` : "Your";
      case "your": return name ? `${name}'s` : "your";
      default: return name ? third(tok) : tok;
    }
  });
}
```

Then convert every log string (the scan test names each one) to a template; `DEATH_LINES` too. `catchUp`: after `advance`, `for (const e of state.log.slice(before)) if (e.minute > firstMinute) e.away = true;`. `logHtml` and `awayHtml` render `voice(e.text, e.away ? current(state).name.first : null)` (pass the name into `awayHtml`). The away report's "You are now in" becomes `voice("{You} {are} now in ...", name)`; `since(rec, day, name)` prefixes the sentence with the name when given.

- [ ] **Step 3: Run everything, commit**

```bash
npm test && npm run typecheck && (cd ../.. && npm run lint)
git commit -m "feat(survidle): the voice - every log line a template, rendered as you while the player is here and by name for what happened while they were away"
```

# Part R: the round

### Task R1: Docs, the browser pass and the roadmap

- [ ] **Step 1: `docs/testing.md`** gains the three sections of spec section 18 (the invite, the survey, the pre-round pass), written out in full.
- [ ] **Step 2: `docs/README.md`**: `?faces=1` under debug parameters; the boat under "How it plays"; the axes, the whetstone and dead wood under "Where the numbers live".
- [ ] **Step 3: Browser pass** at 1440x900 and 390 wide with touch emulation, following spec sections 9 and 19, in Chrome via the DevTools MCP. Fix what it finds; record both widths.
- [ ] **Step 4: Roadmap**: J's Built paragraph (from J8), I's Built paragraph (what landed, the face verdict and size, the browser pass line at both widths), the build order line marking both built with pointers to the spec and this plan, and I's "the second with the rest of F, after it" left as is.
- [ ] **Step 5: Commit** `docs(survidle): J and the survivor's first half built - ...`.

### Task R2: The PR

- [ ] `git push -u origin worktree-survivor`; `gh pr create` with a body summarising the spec's decisions and the readings; the merge waits on the author's approval of the face screenshots.
