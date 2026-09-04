# Survidle delegation ladder implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automation is earned per skill: a once job is always allowed, jobs with a count or a target come at level 3, grinds at 5, keeps at 10; the reference player plays by hand until then; and three scripted set-ups measure how long a camp holds at each stage.

**Architecture:** A new `src/sim/ladder.ts` owns the gate (`orderGate`), the normalised kind an order is added as (`normalizeOrder`), the stand-in a player gives when the true kind is shut (`withinLadder`) and the gated door (`giveOrder`). `addOrder` stays the raw mutator and gains a rank. `train` in `skills.ts` logs each rung as it opens. The Do panel greys gated rows with the reason and the skills panel shows the rungs. `src/sim/reference.ts` gains a player script that ticks hourly, and `src/sim/horizon.ts` with `scripts/horizon.ts` runs the three stage set-ups.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom), vite-node for scripts. All commands run from `08-survidle/`.

**Spec:** `docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md`, sections 2 and 3. Read it first; every task below cites its section. The roadmap's "The delegation ladder" section says where this sits.

## Global Constraints

- Every quantity is real: minutes, hours, litres. No abstract points.
- No em dashes, no unicode arrows or fancy quotes in any text, code or commit message. Hyphens and ASCII only.
- Comments explain, never chronicle: no "was X, now Y", no dates.
- `npm test` must stay fast (under a few seconds). Runs to death go behind scripts; a test runs at most a few game days.
- `npm test` and `npm run build` must pass before every commit. Run `npx biome lint <files>` from the repo root on changed files.
- Stage with explicit paths under `08-survidle/` (and `biome.json` at the root in Task 5). Never `git add -A`.
- Log lines are plain sentences. Reasons (`why`) are lowercase fragments like the existing ones: "keeps at Woodcraft 10, you are 2".
- The level formula (`SKILL_LEVEL_MINUTES`, `level`, `levelMinutes`) and `RECOMMENDED` do not change (spec 2.1).
- No save format change: nothing here adds state. The gate reads the level at the moment of giving (spec 2.2).
- Commit messages follow the branch's style: `feat(survidle): ...` / `test(survidle): ...`, with the Co-Authored-By and Claude-Session trailers the session uses.

## File map

| file | change |
|---|---|
| `src/sim/types.ts` | `TASK_IDS` runtime list beside `TaskId` |
| `src/sim/skills.ts` | `RUNG_LEVEL`, `RUNG_WORD`, `RUNG_ORDER`; `train` logs a rung as it opens |
| `src/sim/ladder.ts` | new: `gateSkill`, `NOT_ORDERS`, `normalizeOrder`, `orderGate`, `withinLadder`, `giveOrder` |
| `src/sim/orders.ts` | `addOrder` uses `normalizeOrder` and takes a `rank` |
| `src/ui/render.ts` | `stripRequest(ui, id, arg)`: the strip as an `IntentRequest` and kind |
| `src/ui/panels.ts` | gated Do rows greyed with the reason; rungs line in the skills panel |
| `src/style.css` | `.skill .rungs` |
| `src/main.ts` | the intent click goes through `giveOrder` via `stripRequest`; no `addOrder` import |
| `biome.json` (repo root) | `08-survidle/src/main.ts` may not import `addOrder` from `./sim/orders` |
| `src/sim/reference.ts` | `kitOut` exported; `ReferencePlayer` script; `setUpReference` adds no orders; `runReference` ticks hourly |
| `src/sim/horizon.ts` | new: `HORIZON_STAGES`, `setSkillLevel`, `setUpStage`, `runStage` |
| `scripts/horizon.ts` | new: prints the stage table; `npm run horizon` |
| `package.json` | `"horizon": "vite-node scripts/horizon.ts"` |
| `tests/ladder.test.ts` | new |
| `tests/horizon.test.ts` | new |
| `tests/orders.test.ts`, `tests/reference.test.ts`, `tests/ui.test.ts`, `tests/skills.test.ts` | updated |

Import direction, to avoid cycles: `skills.ts` owns the rung constants and imports nothing new. `ladder.ts` imports `skills.ts`, `intent.ts` (`yieldItem`) and `orders.ts` (`addOrder`). `orders.ts` imports `ladder.ts` for `normalizeOrder` only; `ladder.ts` imports `addOrder` from `orders.ts`, and both uses are inside functions, so the cycle is safe at module load. `reference.ts` and `horizon.ts` import `ladder.ts`.

---

### Task 1: The rung constants and the task id list

**Files:**
- Modify: `src/sim/types.ts` (after the `TaskId` type, around line 71)
- Modify: `src/sim/skills.ts` (after `SKILL_CAP`, around line 30)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `TASK_IDS: TaskId[]` in `types.ts`; `RUNG_LEVEL: Record<OrderKind, number>`, `RUNG_WORD: Record<OrderKind, string>`, `RUNG_ORDER: OrderKind[]` in `skills.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, inside a new describe at the end of the file:

```ts
import { TASK_IDS } from "../src/sim/types";
import { RUNG_LEVEL, RUNG_ORDER, RUNG_WORD } from "../src/sim/skills";

describe("the rungs", () => {
  it("jobs open at 3, grinds at 5, keeps at 10, in that order", () => {
    expect(RUNG_LEVEL).toEqual({ job: 3, grind: 5, keep: 10 });
    expect(RUNG_ORDER).toEqual(["job", "grind", "keep"]);
    expect(RUNG_WORD).toEqual({ job: "jobs", grind: "grinds", keep: "keeps" });
  });

  it("TASK_IDS lists every task once", () => {
    expect(new Set(TASK_IDS).size).toBe(TASK_IDS.length);
    for (const id of ["chop", "haul", "fill", "wait", "sleep", "night", "melt", "thaw"]) expect(TASK_IDS).toContain(id);
    expect(TASK_IDS.length).toBe(27);
  });
});
```

Put the two imports at the top of the file with the others.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts -t "the rungs"`
Expected: FAIL, `TASK_IDS` and `RUNG_LEVEL` are not exported.

- [ ] **Step 3: Add the list and the constants**

In `src/sim/types.ts`, directly after the `TaskId` union:

```ts
/** Every task, for tables that must cover them all. Keep in step with TaskId. */
export const TASK_IDS: TaskId[] = [
  "chop", "sticks", "bark", "stone", "berries", "split",
  "hunt", "fish", "cook", "craft", "repair", "sharpen", "build",
  "light", "lightTorch", "melt", "thaw", "lightIndoors", "fill", "iceHole", "hang",
  "travel", "walk", "haul", "night", "wait", "rest", "sleep",
];
```

In `src/sim/skills.ts`, after `export const SKILL_CAP = 50;`, and add `OrderKind` to the type import from `./types`:

```ts
/**
 * The delegation ladder (idle curve spec, section 2): the level a skill
 * must reach before its orders may be given as each kind. A once job is
 * the manual rung and is never gated.
 */
export const RUNG_LEVEL: Record<OrderKind, number> = { job: 3, grind: 5, keep: 10 };
export const RUNG_WORD: Record<OrderKind, string> = { job: "jobs", grind: "grinds", keep: "keeps" };
/** Crude before smart: the order the rungs open in. */
export const RUNG_ORDER: OrderKind[] = ["job", "grind", "keep"];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/skills.test.ts -t "the rungs"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/skills.ts 08-survidle/tests/skills.test.ts
git commit -m "feat(survidle): the rung levels and a runtime list of every task"
```

---

### Task 2: The ladder module: gate skill, normalised kind, the gate

**Files:**
- Create: `src/sim/ladder.ts`
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Consumes: `skillOf`, `skillLevel`, `SKILL_NAMES`, `RUNG_LEVEL`, `RUNG_WORD` from `./skills`; `yieldItem` from `./intent`; `TASK_IDS` from `./types`.
- Produces:
  - `gateSkill(task: TaskId, arg?: string): SkillId | null`
  - `NOT_ORDERS: TaskId[]`
  - `normalizeOrder(req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind }`
  - `type Gate = { ok: true } | { ok: false; why: string; skill: SkillId; level: number; at: number }`
  - `orderGate(state: GameState, req: IntentRequest, kind: OrderKind): Gate`

- [ ] **Step 1: Write the failing tests**

Create `tests/ladder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gateSkill, NOT_ORDERS, normalizeOrder, orderGate } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { levelMinutes, SKILL_IDS } from "../src/sim/skills";
import { TASK_IDS, type IntentRequest, type SkillId } from "../src/sim/types";

const req = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string): IntentRequest =>
  ({ task, arg, until, deliver: "camp", where: "nearest" });

function setLevel(state: ReturnType<typeof newGame>["state"], skill: SkillId, l: number): void {
  state.skills[skill].xp = levelMinutes(l);
}

describe("the gate skill", () => {
  it("a task that trains a skill gates on it; haul gates on woodcraft; melt and thaw on building", () => {
    expect(gateSkill("chop")).toBe("woodcraft");
    expect(gateSkill("build", "snare")).toBe("hunting");
    expect(gateSkill("haul")).toBe("woodcraft");
    expect(gateSkill("melt")).toBe("building");
    expect(gateSkill("thaw")).toBe("building");
  });

  it("every task that can be ordered has a gate skill, the way every card has a policy branch", () => {
    for (const id of TASK_IDS) {
      if (NOT_ORDERS.includes(id)) continue;
      expect(gateSkill(id), id).not.toBeNull();
    }
  });

  it("the runner's own steps and the moves are not orders", () => {
    expect(NOT_ORDERS).toEqual(["walk", "travel", "wait", "rest", "sleep", "night"]);
  });
});

describe("the normalised kind", () => {
  it("a keep of something countable stays a keep; a grind is forever", () => {
    expect(normalizeOrder(req("split", { kind: "campHas", qty: 40 }), "keep")).toEqual({ req: req("split", { kind: "campHas", qty: 40 }), kind: "keep" });
    expect(normalizeOrder(req("chop", { kind: "once" }), "grind")).toEqual({ req: req("chop", { kind: "forever" }), kind: "grind" });
  });

  it("a keep or a camp-has of something uncountable is a once job, except keep it lit", () => {
    expect(normalizeOrder(req("build", { kind: "campHas", qty: 1 }, "cabin"), "keep")).toEqual({ req: req("build", { kind: "once" }, "cabin"), kind: "job" });
    expect(normalizeOrder(req("build", { kind: "campHas", qty: 1 }, "cabin"), "job")).toEqual({ req: req("build", { kind: "once" }, "cabin"), kind: "job" });
    expect(normalizeOrder(req("light", { kind: "campHas", qty: 1 }), "keep").kind).toBe("keep");
  });
});

describe("the gate", () => {
  it("a once job is open at level 1 in every skill", () => {
    const { state } = newGame(3);
    expect(orderGate(state, req("chop", { kind: "once" }), "job")).toEqual({ ok: true });
    expect(orderGate(state, req("fill", { kind: "once" }), "job")).toEqual({ ok: true });
    expect(orderGate(state, req("hunt", { kind: "once" }, "any"), "job")).toEqual({ ok: true });
  });

  it("jobs with a count or a target at 3, grinds at 5, keeps at 10, per skill", () => {
    const { state } = newGame(3);
    const times = req("chop", { kind: "times", n: 5 });
    const has = req("split", { kind: "campHas", qty: 40 });
    const grind = req("chop", { kind: "forever" });
    expect(orderGate(state, times, "job")).toEqual({ ok: false, why: "jobs at Woodcraft 3, you are 1", skill: "woodcraft", level: 1, at: 3 });
    setLevel(state, "woodcraft", 3);
    expect(orderGate(state, times, "job")).toEqual({ ok: true });
    expect(orderGate(state, has, "job")).toEqual({ ok: true });
    expect(orderGate(state, grind, "grind")).toEqual({ ok: false, why: "grinds at Woodcraft 5, you are 3", skill: "woodcraft", level: 3, at: 5 });
    expect(orderGate(state, has, "keep")).toEqual({ ok: false, why: "keeps at Woodcraft 10, you are 3", skill: "woodcraft", level: 3, at: 10 });
    setLevel(state, "woodcraft", 5);
    expect(orderGate(state, grind, "grind")).toEqual({ ok: true });
    setLevel(state, "woodcraft", 10);
    expect(orderGate(state, has, "keep")).toEqual({ ok: true });
    // another skill is still at 1
    expect(orderGate(state, req("fill", { kind: "campHas", qty: 2 }), "keep").ok).toBe(false);
  });

  it("the gate reads the kind after the fallback: build a cabin as a keep is a once job and open", () => {
    const { state } = newGame(3);
    expect(orderGate(state, req("build", { kind: "campHas", qty: 1 }, "cabin"), "keep")).toEqual({ ok: true });
  });

  it("keep it lit is a keep, gated on building", () => {
    const { state } = newGame(3);
    const g = orderGate(state, req("light", { kind: "campHas", qty: 1 }), "keep");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.why).toBe("keeps at Building 10, you are 1");
  });

  it("every skill has the same three levels", () => {
    const { state } = newGame(3);
    for (const skill of SKILL_IDS) {
      setLevel(state, skill, 10);
    }
    for (const t of [req("berries", { kind: "campHas", qty: 2 }), req("fish", { kind: "campHas", qty: 1 }, "any"), req("craft", { kind: "campHas", qty: 4 }, "cordage"), req("hang", { kind: "campHas", qty: 10 })]) {
      expect(orderGate(state, t, "keep"), t.task).toEqual({ ok: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ladder.test.ts`
Expected: FAIL, cannot find module `../src/sim/ladder`.

- [ ] **Step 3: Write the module**

Create `src/sim/ladder.ts`:

```ts
/**
 * The delegation ladder (idle curve spec, section 2). A once job is the
 * manual rung: one unit of work, then it drops off the list, and it is
 * never gated. Jobs with a count or a camp-has target, grinds and keeps
 * are earned per skill, at RUNG_LEVEL. The gate reads the level at the
 * moment an order is given, on the kind the order is actually added as.
 */
import { yieldItem } from "./intent";
import { RUNG_LEVEL, RUNG_WORD, SKILL_NAMES, skillLevel, skillOf } from "./skills";
import type { GameState, IntentRequest, OrderKind, SkillId, TaskId } from "./types";

/** Tasks that train no skill but can still be ordered take the skill of the work they serve. */
const GATE_SKILL: Partial<Record<TaskId, SkillId>> = { haul: "woodcraft", melt: "building", thaw: "building" };

/** Never orders: the runner's own steps, and the moves the Do panel starts directly. */
export const NOT_ORDERS: TaskId[] = ["walk", "travel", "wait", "rest", "sleep", "night"];

/** The skill whose level gates orders for this task, or null for a task that is never an order. */
export function gateSkill(task: TaskId, arg?: string): SkillId | null {
  return skillOf(task, arg) ?? GATE_SKILL[task] ?? null;
}

/**
 * The kind an order is added as. A keep or a camp-has without a countable
 * yield is a once job; a grind is always forever. "Keep it lit" is the one
 * keep exempt from the fallback: light has no stock to count, but the fire
 * going out is itself the thing worth watching for.
 */
export function normalizeOrder(req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const lightKeep = kind === "keep" && req.task === "light";
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg) && !lightKeep) {
    return { req: { ...req, until: { kind: "once" } }, kind: "job" };
  }
  if (kind === "grind") return { req: { ...req, until: { kind: "forever" } }, kind: "grind" };
  return { req, kind };
}

export type Gate = { ok: true } | { ok: false; why: string; skill: SkillId; level: number; at: number };

/** Whether this order may be given now, and if not, which level opens it. */
export function orderGate(state: GameState, req: IntentRequest, kind: OrderKind): Gate {
  const n = normalizeOrder(req, kind);
  if (n.kind === "job" && n.req.until.kind === "once") return { ok: true };
  const skill = gateSkill(n.req.task, n.req.arg);
  if (!skill) throw new Error(`${n.req.task} has no gate skill and cannot be an order`);
  const level = skillLevel(state, skill);
  const at = RUNG_LEVEL[n.kind];
  if (level >= at) return { ok: true };
  return { ok: false, why: `${RUNG_WORD[n.kind]} at ${SKILL_NAMES[skill]} ${at}, you are ${level}`, skill, level, at };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/ladder.ts 08-survidle/tests/ladder.test.ts)
git add 08-survidle/src/sim/ladder.ts 08-survidle/tests/ladder.test.ts
git commit -m "feat(survidle): the ladder's gate, and the kind an order is added as"
```

---

### Task 3: `addOrder` uses the normalised kind and takes a rank; `giveOrder` is the gated door

**Files:**
- Modify: `src/sim/orders.ts:27-47` (`addOrder`)
- Modify: `src/sim/ladder.ts` (append `giveOrder`)
- Test: `tests/orders.test.ts`, `tests/ladder.test.ts`

**Interfaces:**
- Consumes: `normalizeOrder`, `orderGate` (Task 2).
- Produces:
  - `addOrder(state, world, req, kind, rank?: number): Order` - unchanged behaviour when `rank` is omitted (appends); with `rank`, inserts at that index, clamped to the list's length. Ungated: the raw mutator.
  - `giveOrder(state, world, req, kind, rank?: number): Order` in `ladder.ts` - throws `Error(gate.why)` when the gate is shut, else `addOrder`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts`, at the end of the file:

```ts
describe("rank", () => {
  const sticks: IntentRequest = { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" };
  const bark: IntentRequest = { task: "bark", until: { kind: "once" }, deliver: "camp", where: "nearest" };
  const stone: IntentRequest = { task: "stone", until: { kind: "once" }, deliver: "camp", where: "nearest" };

  it("without a rank an order is appended", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, sticks, "job");
    addOrder(state, world, bark, "job");
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["sticks", "bark"]);
  });

  it("with a rank it is inserted there, and a rank past the end appends", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, sticks, "job");
    addOrder(state, world, bark, "job");
    addOrder(state, world, stone, "job", 0);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["stone", "sticks", "bark"]);
    addOrder(state, world, { ...stone, task: "berries" }, "job", 99);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["stone", "sticks", "bark", "berries"]);
    addOrder(state, world, { ...stone, task: "chop" }, "job", 2);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["stone", "sticks", "chop", "bark", "berries"]);
  });
});
```

Append to `tests/ladder.test.ts` (add `giveOrder` to the import from `../src/sim/ladder`, and `ordersHere` from `../src/sim/orders`):

```ts
describe("giving an order", () => {
  it("a shut gate throws with the reason and adds nothing", () => {
    const { state, world } = newGame(3);
    expect(() => giveOrder(state, world, req("split", { kind: "campHas", qty: 40 }), "keep")).toThrow("keeps at Woodcraft 10, you are 1");
    expect(ordersHere(state, world)).toEqual([]);
  });

  it("an open gate adds the order at the rank given", () => {
    const { state, world } = newGame(3);
    giveOrder(state, world, req("sticks", { kind: "once" }), "job");
    setLevel(state, "woodcraft", 10);
    const o = giveOrder(state, world, req("split", { kind: "campHas", qty: 40 }), "keep", 0);
    expect(o.kind).toBe("keep");
    expect(ordersHere(state, world).map((x) => x.req.task)).toEqual(["split", "sticks"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/orders.test.ts -t rank tests/ladder.test.ts -t "giving an order"`
Expected: FAIL: the rank is ignored (the list reads `["sticks", "bark", "stone"]`), and `giveOrder` is not exported.

- [ ] **Step 3: Rewrite `addOrder` and add `giveOrder`**

In `src/sim/orders.ts`, replace the `addOrder` function and its comment with:

```ts
/**
 * Appends, or inserts at `rank` when one is given. The kind and the until
 * are the normalised ones (see normalizeOrder in ladder.ts). This is the
 * raw mutator: the Do panel and the player script go through giveOrder,
 * which reads the ladder's gate first.
 */
export function addOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind, rank?: number): Order {
  const st = regionState(state, world, state.player.region);
  const n = normalizeOrder(req, kind);
  const o: Order = { id: st.nextOrderId++, kind: n.kind, req: n.req, done: 0, minutes: 0, skipped: "" };
  st.orders.splice(rank === undefined ? st.orders.length : Math.min(rank, st.orders.length), 0, o);
  return o;
}
```

Add `import { normalizeOrder } from "./ladder";` to the imports of `orders.ts` (alphabetical, after `./items` if present, else after `./intent`). Remove `yieldItem` from the `./intent` import only if it is now unused there (it is still used by `keepTarget` and `orderSentence`, so keep it).

Append to `src/sim/ladder.ts`:

```ts
import type { World } from "../world/gen";
import { addOrder } from "./orders";
import type { Order } from "./types";

/** The door the Do panel and the player script use: the gate, then addOrder. */
export function giveOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind, rank?: number): Order {
  const gate = orderGate(state, req, kind);
  if (!gate.ok) throw new Error(gate.why);
  return addOrder(state, world, req, kind, rank);
}
```

Move the three imports up to the top of the file with the others (Biome wants imports first). `Order` joins the existing type import from `./types`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. Every existing `addOrder` call keeps its behaviour: the fallback to a once job and the forever grind are now in `normalizeOrder`, with the same inputs and outputs.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/orders.ts 08-survidle/src/sim/ladder.ts 08-survidle/tests/orders.test.ts 08-survidle/tests/ladder.test.ts)
git add 08-survidle/src/sim/orders.ts 08-survidle/src/sim/ladder.ts 08-survidle/tests/orders.test.ts 08-survidle/tests/ladder.test.ts
git commit -m "feat(survidle): addOrder takes a rank, and giveOrder is the gated door"
```

---

### Task 4: The stand-in a player gives when the true kind is shut

**Files:**
- Modify: `src/sim/ladder.ts` (append `withinLadder`, `GRIND_STAND_IN`)
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Produces: `withinLadder(state, req, kind): { req: IntentRequest; kind: OrderKind }` and `GRIND_STAND_IN = 5`. Spec 2.5: a keep is a keep at 10, a camp-has job at 3, a once job below; a grind is a grind at 5, a five-times job at 3, a once job below; a job with a count or a target is itself at 3 and a once job below; a once job is itself.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ladder.test.ts` (add `GRIND_STAND_IN, withinLadder` to the ladder import):

```ts
describe("the stand-in for a shut kind", () => {
  const keep = req("split", { kind: "campHas", qty: 40 });
  const grind = req("chop", { kind: "forever" });
  const times = req("chop", { kind: "times", n: 3 });
  const once = req("chop", { kind: "once" });

  it("at level 1 everything is a once job", () => {
    const { state } = newGame(3);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: { ...keep, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, grind, "grind")).toEqual({ req: { ...grind, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, times, "job")).toEqual({ req: { ...times, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, once, "job")).toEqual({ req: once, kind: "job" });
  });

  it("at 3 a keep is a camp-has job to the same target and a grind is a five-times job", () => {
    const { state } = newGame(3);
    setLevel(state, "woodcraft", 3);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: keep, kind: "job" });
    expect(withinLadder(state, grind, "grind")).toEqual({ req: { ...grind, until: { kind: "times", n: GRIND_STAND_IN } }, kind: "job" });
    expect(withinLadder(state, times, "job")).toEqual({ req: times, kind: "job" });
    expect(GRIND_STAND_IN).toBe(5);
  });

  it("at 5 a grind is itself and a keep is still a job; at 10 a keep is a keep", () => {
    const { state } = newGame(3);
    setLevel(state, "woodcraft", 5);
    expect(withinLadder(state, grind, "grind")).toEqual({ req: grind, kind: "grind" });
    expect(withinLadder(state, keep, "keep").kind).toBe("job");
    setLevel(state, "woodcraft", 10);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: keep, kind: "keep" });
  });

  it("keep it lit below building 10 is light once", () => {
    const { state } = newGame(3);
    const lit = req("light", { kind: "campHas", qty: 1 });
    expect(withinLadder(state, lit, "keep")).toEqual({ req: { ...lit, until: { kind: "once" } }, kind: "job" });
    setLevel(state, "building", 3);
    expect(withinLadder(state, lit, "keep")).toEqual({ req: { ...lit, until: { kind: "once" } }, kind: "job" });
    setLevel(state, "building", 10);
    expect(withinLadder(state, lit, "keep")).toEqual({ req: lit, kind: "keep" });
  });

  it("the stand-in always passes the gate", () => {
    const { state } = newGame(3);
    for (const l of [1, 3, 5, 10]) {
      setLevel(state, "woodcraft", l);
      for (const [r, k] of [[keep, "keep"], [grind, "grind"], [times, "job"], [once, "job"]] as const) {
        const s = withinLadder(state, r, k);
        expect(orderGate(state, s.req, s.kind), `${k} at ${l}`).toEqual({ ok: true });
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ladder.test.ts -t "stand-in"`
Expected: FAIL, `withinLadder` is not exported.

- [ ] **Step 3: Write `withinLadder`**

Append to `src/sim/ladder.ts`:

```ts
/** Trees a player fells per click when the grind is shut but a count is open. */
export const GRIND_STAND_IN = 5;

/**
 * What a player gives instead when the kind they want is shut: the best
 * kind the skill has earned, aimed at the same target. A keep is a keep at
 * 10, a camp-has job at 3, a once job below; a grind is itself at 5, a
 * GRIND_STAND_IN-times job at 3, a once job below; a counted job is itself
 * at 3 and a once job below. The player script and the stage set-ups use
 * it; the Do panel shows the gate instead and lets the player choose.
 */
export function withinLadder(state: GameState, req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const n = normalizeOrder(req, kind);
  if (orderGate(state, n.req, n.kind).ok) return n;
  const level = skillLevel(state, gateSkill(n.req.task, n.req.arg)!);
  const once = { req: { ...n.req, until: { kind: "once" as const } }, kind: "job" as const };
  if (level < RUNG_LEVEL.job) return once;
  if (n.kind === "grind") return { req: { ...n.req, until: { kind: "times", n: GRIND_STAND_IN } }, kind: "job" };
  // A keep, at 3 or 5: the same target as a job that drops off when met.
  // "Keep it lit" has nothing to count and falls to light once.
  return normalizeOrder({ ...n.req, until: n.req.until.kind === "campHas" ? n.req.until : { kind: "once" } }, "job");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/ladder.ts 08-survidle/tests/ladder.test.ts)
git add 08-survidle/src/sim/ladder.ts 08-survidle/tests/ladder.test.ts
git commit -m "feat(survidle): the stand-in a player gives when the kind they want is shut"
```

---

### Task 5: The rung log lines

**Files:**
- Modify: `src/sim/skills.ts:300-323` (`train`)
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Consumes: `RUNG_LEVEL`, `RUNG_ORDER`, `RUNG_WORD` (Task 1).
- Produces: `RUNG_LINE: Record<OrderKind, (skill: string) => string>` exported from `skills.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ladder.test.ts` (add `RUNG_LINE` to the skills import, and `import { train } from "../src/sim/skills"` - `train` is already exported; add `import { placeAtSpot } from "../src/sim/position"` and `import { startTask } from "../src/sim/tasks"` and `import { calendar } from "../src/sim/calendar"` and `import { Rng } from "../src/rng"`):

```ts
describe("the rung log lines", () => {
  it("each rung is announced once as the level crosses it, after the level line", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, calendar(state.minute), "sticks", undefined, false, new Rng(1))).toBe(true);
    state.skills.woodcraft.xp = levelMinutes(3) - 1;
    train(state, world, 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain("Woodcraft 3.");
    expect(texts).toContain(RUNG_LINE.job("Woodcraft"));
    expect(texts.indexOf("Woodcraft 3.")).toBeLessThan(texts.indexOf(RUNG_LINE.job("Woodcraft")));
    train(state, world, 1);
    expect(state.log.filter((e) => e.text === RUNG_LINE.job("Woodcraft")).length).toBe(1);
  });

  it("a jump across two rungs announces both", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, calendar(state.minute), "sticks", undefined, false, new Rng(1))).toBe(true);
    state.skills.woodcraft.xp = levelMinutes(3) - 1;
    train(state, world, levelMinutes(5) - levelMinutes(3) + 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain(RUNG_LINE.job("Woodcraft"));
    expect(texts).toContain(RUNG_LINE.grind("Woodcraft"));
    expect(texts).not.toContain(RUNG_LINE.keep("Woodcraft"));
  });

  it("the lines name the kind and the skill", () => {
    expect(RUNG_LINE.job("Woodcraft")).toBe("You know woodcraft well enough to set a task and walk away: jobs with a count or a target from Woodcraft.");
    expect(RUNG_LINE.grind("Fishing")).toBe("Fishing is second nature now: grinds, work that never ends, from Fishing.");
    expect(RUNG_LINE.keep("Building")).toBe("You keep count of building without thinking: keeps from Building.");
  });
});
```

If `startTask` needs a tool or ground `sticks` lacks at the forest spot on seed 3, swap the task for one the existing `tests/skills.test.ts` starts in its `train` tests and keep the rest.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ladder.test.ts -t "rung log"`
Expected: FAIL, `RUNG_LINE` is not exported.

- [ ] **Step 3: Add the lines and log them**

In `src/sim/skills.ts`, after `RUNG_ORDER`:

```ts
/** What the log says as each rung opens, once per skill per survivor. */
export const RUNG_LINE: Record<OrderKind, (skill: string) => string> = {
  job: (s) => `You know ${s.toLowerCase()} well enough to set a task and walk away: jobs with a count or a target from ${s}.`,
  grind: (s) => `${s} is second nature now: grinds, work that never ends, from ${s}.`,
  keep: (s) => `You keep count of ${s.toLowerCase()} without thinking: keeps from ${s}.`,
};
```

In `train`, replace

```ts
  if (after > before) log(state, `${SKILL_NAMES[skill]} ${after}.`, "good");
```

with

```ts
  if (after > before) {
    log(state, `${SKILL_NAMES[skill]} ${after}.`, "good");
    // Once per survivor by construction: a level is crossed once, and the heir is a new state.
    for (const k of RUNG_ORDER) if (before < RUNG_LEVEL[k] && after >= RUNG_LEVEL[k]) log(state, RUNG_LINE[k](SKILL_NAMES[skill]), "good");
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ladder.test.ts tests/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/skills.ts 08-survidle/tests/ladder.test.ts)
git add 08-survidle/src/sim/skills.ts 08-survidle/tests/ladder.test.ts
git commit -m "feat(survidle): the log names each rung as it opens"
```

---

### Task 6: The Do panel greys a shut kind, and main gives orders through the door

**Files:**
- Modify: `src/ui/render.ts` (append `stripRequest`)
- Modify: `src/ui/panels.ts:431-467` (`intentRowHtml`, `doHtml`)
- Modify: `src/main.ts:220-227` (the `intent` case) and its imports
- Modify: `biome.json` at the repo root (an override for `08-survidle/src/main.ts`)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `orderGate`, `giveOrder` (Tasks 2 and 3), `Gate`.
- Produces: `stripRequest(ui: UiState, id: TaskId, arg: string | undefined): { req: IntentRequest; kind: OrderKind }` in `render.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui.test.ts` (add `import { stripRequest } from "../src/ui/render"` alongside the existing render import, and `levelMinutes` is already imported):

```ts
describe("the Do panel and the ladder", () => {
  it("the strip's settings become a request and a kind", () => {
    const ui = { ...newUiState(), until: "keep" as const, n: 40, deliver: "camp" as const, where: "nearest" as const };
    expect(stripRequest(ui, "split", undefined)).toEqual({ req: { task: "split", arg: undefined, until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, kind: "keep" });
    expect(stripRequest({ ...ui, until: "forever" }, "chop", undefined).kind).toBe("grind");
    expect(stripRequest({ ...ui, until: "times", n: 3 }, "chop", undefined)).toMatchObject({ req: { until: { kind: "times", n: 3 } }, kind: "job" });
    expect(stripRequest({ ...ui, until: "once" }, "chop", undefined)).toMatchObject({ req: { until: { kind: "once" } }, kind: "job" });
    expect(stripRequest({ ...ui, until: "campHas", n: 8 }, "stone", undefined)).toMatchObject({ req: { until: { kind: "campHas", qty: 8 } }, kind: "job" });
  });

  it("a shut kind greys the row with the reason and no button; once is never greyed", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    const keep = { ...newUiState(), until: "keep" as const, n: 40 };
    let html = doHtml(state, world, cal, keep);
    const row = html.slice(html.indexOf('data-opt="intent:split:"'), html.indexOf("</div>", html.indexOf('data-opt="intent:split:"')));
    expect(row).toContain("keeps at Woodcraft 10, you are 1");
    expect(row).not.toContain("<button");
    expect(row).toContain("opt off");
    html = doHtml(state, world, cal, { ...newUiState(), until: "once" });
    expect(html.slice(html.indexOf('data-opt="intent:split:"'), html.indexOf("</div>", html.indexOf('data-opt="intent:split:"')))).not.toContain("keeps at");
    state.skills.woodcraft.xp = levelMinutes(10);
    html = doHtml(state, world, cal, keep);
    expect(html.slice(html.indexOf('data-opt="intent:split:"'), html.indexOf("</div>", html.indexOf('data-opt="intent:split:"')))).not.toContain("keeps at");
  });

  it("every gated row still carries its data-opt, so nothing is hidden", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    const open = doHtml(state, world, cal, { ...newUiState(), until: "once" });
    const shut = doHtml(state, world, cal, { ...newUiState(), until: "keep", n: 5 });
    const opts = (h: string) => [...h.matchAll(/data-opt="intent:[^"]*"/g)].map((m) => m[0]).sort();
    expect(opts(shut)).toEqual(opts(open));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui.test.ts -t "the Do panel and the ladder"`
Expected: FAIL, `stripRequest` is not exported.

- [ ] **Step 3: Add `stripRequest`, the greyed row, and route main through the door**

Append to `src/ui/render.ts` (add `import type { IntentRequest, OrderKind, TaskId, UntilChoice } from "../sim/types";`, merging with the existing type import from `../sim/types`):

```ts
/** The strip's settings as the order a click on a Do row gives: what main.ts hands to giveOrder. */
export function stripRequest(ui: UiState, id: TaskId, arg: string | undefined): { req: IntentRequest; kind: OrderKind } {
  const kind: OrderKind = ui.until === "keep" ? "keep" : ui.until === "forever" ? "grind" : "job";
  const until: UntilChoice = ui.until === "times" ? { kind: "times", n: ui.n }
    : ui.until === "campHas" || ui.until === "keep" ? { kind: "campHas", qty: ui.n }
    : ui.until === "forever" ? { kind: "forever" }
    : { kind: "once" };
  return { req: { task: id, arg, until, deliver: ui.deliver, where: ui.where }, kind };
}
```

In `src/ui/panels.ts`:

Change `intentRowHtml` to take the gate:

```ts
function intentRowHtml(o: TaskOption, extra: string, gate: Gate): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(o.recommended.text)}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  const detail = [o.detail, extra].filter(Boolean).join("; ");
  // A shut rung is the promise of the rung, not a hidden row: the same data-opt, the reason, and nothing to click.
  if (!gate.ok) {
    return `<div class="opt off" data-opt="intent:${o.id}:${esc(arg)}"><span class="act">${esc(o.label)}${rec}<small>${esc(gate.why)}</small>${bar}</span></div>`;
  }
  if (!o.ok) {
    return `<div class="opt off" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}" title="Add it anyway; it waits until it can start">${esc(o.label)}${rec}<small>${esc(o.why)}${detail ? ` - ${esc(detail)}` : ""}</small>${bar}</button></div>`;
  }
  const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const line = [time, detail].filter(Boolean).join("; ");
  return `<div class="opt" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${esc(line)}</small>${bar}</button></div>`;
}
```

In `doHtml`, the rows line becomes:

```ts
    const rows = g.items.map(({ id, arg }) => {
      const { req, kind } = stripRequest(ui, id, arg);
      return intentRowHtml(withProgression(state, world, intentOption(state, world, cal, id, arg, ui.where)), stripSentence(ui, id, arg), orderGate(state, req, kind));
    }).join("");
```

Add `import { orderGate, type Gate } from "../sim/ladder";` and add `stripRequest` to the existing `import { esc, type UiState } from "./render";` in `panels.ts`.

In `src/main.ts`, the `intent` case becomes:

```ts
    case "intent": {
      const { req, kind } = stripRequest(ui, target.dataset.id as TaskId, target.dataset.arg || undefined);
      // The row is greyed with no button when the gate is shut; this is the belt to that brace.
      if (orderGate(state, req, kind).ok) giveOrder(state, world, req, kind);
      break;
    }
```

and the `finish` case's `addOrder(...)` call becomes `giveOrder(...)` with the same arguments (a once job, never gated). Change the import `import { addOrder, moveOrder, removeOrder } from "./sim/orders";` to `import { moveOrder, removeOrder } from "./sim/orders";`, add `import { giveOrder, orderGate } from "./sim/ladder";`, and add `stripRequest` to the `./ui/render` import. Remove `OrderKind` and `UntilChoice` from main's type imports if nothing else there uses them.

In `biome.json` at the repo root, add to the `overrides` array, after the `02-balticmap/src/main.ts` entry:

```json
    {
      "includes": ["08-survidle/src/main.ts"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "./sim/orders": {
                    "importNames": ["addOrder"],
                    "message": "An order the player gives goes through giveOrder in src/sim/ladder.ts, which reads the delegation ladder's gate first. addOrder is the raw mutator for tests and the stage set-ups."
                  }
                }
              }
            }
          }
        }
      }
    }
```

- [ ] **Step 4: Run the tests, the build and the lint**

Run: `npm test && npm run build && (cd .. && npx biome lint 08-survidle/src/main.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/render.ts)`
Expected: all PASS. Then confirm the ban bites: temporarily add `import { addOrder } from "./sim/orders";` to `main.ts`, run the lint, see the error with the message above, and remove it again.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/render.ts 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/tests/ui.test.ts biome.json
git commit -m "feat(survidle): the Do panel greys a shut rung with its reason, and main gives orders through the door"
```

---

### Task 7: The skills panel shows the rungs

**Files:**
- Modify: `src/ui/panels.ts:111-127` (`skillsHtml`)
- Modify: `src/style.css` (after line 106)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `RUNG_LEVEL`, `RUNG_ORDER`, `RUNG_WORD` from `../sim/skills`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui.test.ts`:

```ts
describe("the skills panel and the rungs", () => {
  it("lists the three rungs per skill, marks the earned ones, and says how far the next is", () => {
    const { state } = newGame(21);
    let html = skillsHtml(state);
    const wood = html.slice(html.indexOf("<b>Woodcraft</b>"), html.indexOf("<b>Foraging</b>"));
    expect(wood).toContain('<span class="">jobs 3');
    expect(wood).toContain("jobs 3, 8 h to go");
    expect(wood).toContain('<span class="">grinds 5</span>');
    expect(wood).toContain('<span class="">keeps 10</span>');
    state.skills.woodcraft.xp = levelMinutes(5) + 60;
    html = skillsHtml(state);
    const wood5 = html.slice(html.indexOf("<b>Woodcraft</b>"), html.indexOf("<b>Foraging</b>"));
    expect(wood5).toContain('<span class="on">jobs 3</span>');
    expect(wood5).toContain('<span class="on">grinds 5</span>');
    expect(wood5).toContain("keeps 10, 5 d 9 h to go");
  });
});
```

The remaining time for keeps at woodcraft 5 plus one hour is `levelMinutes(10) - levelMinutes(5) - 60 = 7740` minutes, which `fmtDuration` in `src/units.ts` prints as `5 d 9 h` (129 hours, and past 48 hours it prints days and hours). At level 1, `levelMinutes(3) = 480` prints as `8 h`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ui.test.ts -t "skills panel and the rungs"`
Expected: FAIL, no `jobs 3` in the output.

- [ ] **Step 3: Add the rungs line**

In `skillsHtml`, add before the `return` inside the map:

```ts
    let nextShown = false;
    const rungs = RUNG_ORDER.map((k) => {
      const at = RUNG_LEVEL[k];
      if (l >= at) return `<span class="on">${RUNG_WORD[k]} ${at}</span>`;
      // Only the next shut rung says how far it is; the ones past it read as marks.
      const toGo = nextShown ? "" : `, ${fmtDuration(levelMinutes(at) - s.xp)} to go`;
      nextShown = true;
      return `<span class="">${RUNG_WORD[k]} ${at}${toGo}</span>`;
    }).join(" ");
```

and add `<div class="rungs"><small>${rungs}</small></div>` as the last line of the row's template, before the closing `</div>`. Import `RUNG_LEVEL, RUNG_ORDER, RUNG_WORD` from `../sim/skills`.

In `src/style.css`, after `.skill .r { ... }`:

```css
.skill .rungs span { color: var(--dim); margin-right: 8px; }
.skill .rungs span.on { color: var(--accent); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ui.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/ui/panels.ts)
git add 08-survidle/src/ui/panels.ts 08-survidle/src/style.css 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): the skills panel marks the rungs and how far the next one is"
```

---

### Task 8: The reference player plays by hand until the rungs open

**Files:**
- Modify: `src/sim/reference.ts` (export `kitOut`; add `OPENING_TICK_MINUTES`, `ReferencePlayer`; `setUpReference` adds no orders and returns the player; `runReference` ticks hourly)
- Modify: `scripts/reference.ts` (no change needed unless `runReference`'s signature changes; it does not)
- Test: `tests/reference.test.ts`

**Interfaces:**
- Consumes: `withinLadder`, `giveOrder` (Tasks 3 and 4); `orderMet`, `ordersHere` from `./orders`.
- Produces:
  - `OPENING_TICK_MINUTES = 60`
  - `class ReferencePlayer { constructor(wants = REFERENCE_ORDERS); tick(state, world): void }`
  - `setUpReference(seed, kitted = false): { state; world; player: ReferencePlayer }`
  - `stepReference(ref: { state; world; player }, minutes: number): void` - ticks the player then advances, in `OPENING_TICK_MINUTES` chunks.
  - `runReference(seed, days, kitted = false): ReferenceReport` unchanged signature.
  - `kitOut` exported.

- [ ] **Step 1: Write the failing tests**

Replace the first test of `tests/reference.test.ts` ("every order is added as the kind it names") and the third ("holds three days on seed 17") with these, and add the imports they need (`stepReference`, `OPENING_TICK_MINUTES`, `ReferencePlayer` from `../src/sim/reference`; `levelMinutes` from `../src/sim/skills`; `newGame` from `../src/sim/newgame`):

```ts
  it("at level 1 the first tick gives every want as a once job, ranked as the list", () => {
    const { state, world, player } = setUpReference(17);
    expect(ordersHere(state, world)).toEqual([]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    list.forEach((o, i) => {
      expect(o.kind, `order ${i + 1}`).toBe("job");
      expect(o.req.until.kind, `order ${i + 1}`).toBe("once");
      expect(o.req.task, `order ${i + 1}`).toBe(REFERENCE_ORDERS[i].req.task);
    });
  });

  it("a want whose stand-in dropped off is given again while unmet, and a finished true job is not", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "craft", until: { kind: "once" }, arg: "cordage", deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player.tick(state, world);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["sticks", "craft"]);
    // The stand-ins run to completion and drop off.
    stepReference({ state, world, player }, 6 * 60);
    // The sticks keep is unmet while camp has under half of 10, so it is standing again; the cordage job finished and is not.
    const tasks = ordersHere(state, world).map((o) => o.req.task);
    expect(tasks.filter((t) => t === "craft")).toEqual([]);
    const st = regionState(state, world, state.player.region);
    const have = qty(pile(state, st.campCell), "sticks");
    if (have < 5) expect(tasks).toContain("sticks");
    else expect(tasks).not.toContain("sticks");
  });

  it("the stand-in follows the level: a keep given at woodcraft 10 is a keep, ranked where the want sits", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(10);
    const player = new ReferencePlayer([
      { req: { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, kind: "keep" },
    ]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.map((o) => [o.req.task, o.kind])).toEqual([["fill", "job"], ["split", "keep"]]);
    expect(list[0].req.until.kind).toBe("once");
  });

  it("holds three days on seed 17 with the player ticking hourly, and has water at camp", () => {
    const ref = setUpReference(17);
    stepReference(ref, 3 * 1440);
    expect(ref.state.dead).toBeNull();
    const camp = pile(ref.state, regionState(ref.state, ref.world, ref.state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
    expect(calendar(ref.state.minute).day).toBe(4);
    expect(OPENING_TICK_MINUTES).toBe(60);
  });
```

Keep the remaining tests (the knife/axe kinds, the gate boundary) as they are.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL, `setUpReference` returns no `player` and `stepReference` is not exported.

- [ ] **Step 3: Write the player script**

In `src/sim/reference.ts`:

Replace the imports `import { addOrder } from "./orders";` with `import { orderMet, ordersHere } from "./orders";` and add `import { giveOrder, withinLadder } from "./ladder";` and `Order` to the type import.

Change `function kitOut` to `export function kitOut`.

Replace `setUpReference` and `runReference` with:

```ts
/** How often the player script looks at the list: the cost of playing by hand is the idle time between looks. */
export const OPENING_TICK_MINUTES = 60;

/**
 * The player script (idle curve spec, section 2.5): the reference list is
 * what a competent player wants, and this gives each want as the best
 * kind the skill has earned, ranked where the want sits. A stand-in that
 * drops off is given again when the want is unmet; a want given as its
 * own kind that drops off is a finished job and is never given twice, or
 * the knife would be made again. A keep given as a keep stays for good.
 */
export class ReferencePlayer {
  /** Order id per want index, for the orders still on the list. */
  private given = new Map<number, number>();
  /** Whether the standing order for a want is its own kind (true) or a stand-in (false). */
  private trueKind = new Map<number, boolean>();
  private finished = new Set<number>();

  constructor(readonly wants: { req: IntentRequest; kind: OrderKind }[] = REFERENCE_ORDERS) {}

  tick(state: GameState, world: World): void {
    const list = ordersHere(state, world);
    for (const [i, id] of [...this.given]) {
      if (list.some((o) => o.id === id)) continue;
      if (this.trueKind.get(i)) this.finished.add(i);
      this.given.delete(i);
      this.trueKind.delete(i);
    }
    for (let i = 0; i < this.wants.length; i++) {
      if (this.finished.has(i) || this.given.has(i)) continue;
      const w = this.wants[i];
      const probe: Order = { id: -1, kind: w.kind, req: w.req, done: 0, minutes: 0, skipped: "" };
      if (orderMet(state, world, probe, false)) continue;
      const best = withinLadder(state, w.req, w.kind);
      const standIn = best.kind !== w.kind || best.req.until.kind !== w.req.until.kind;
      let rank = 0;
      for (const j of this.given.keys()) if (j < i) rank++;
      const o = giveOrder(state, world, best.req, best.kind, rank);
      this.given.set(i, o.id);
      this.trueKind.set(i, !standIn);
    }
  }
}

export function setUpReference(seed: number, kitted = false): { state: GameState; world: World; player: ReferencePlayer } {
  const g = newGame(seed);
  if (kitted) kitOut(g.state, g.world);
  return { ...g, player: new ReferencePlayer() };
}

/** Advances `minutes`, the player looking at the list every OPENING_TICK_MINUTES. */
export function stepReference(ref: { state: GameState; world: World; player: ReferencePlayer }, minutes: number): void {
  let left = minutes;
  while (left > 0 && !ref.state.dead) {
    ref.player.tick(ref.state, ref.world);
    const dt = Math.min(OPENING_TICK_MINUTES, left);
    advance(ref.state, ref.world, dt);
    left -= dt;
  }
}
```

and in `runReference`, replace

```ts
  const { state, world } = setUpReference(seed, kitted);
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  for (let d = 1; d <= days && !state.dead; d++) {
    advance(state, world, 1440);
```

with

```ts
  const ref = setUpReference(seed, kitted);
  const { state, world } = ref;
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
```

Update the module comment at the top of `reference.ts`: after "worked with the arrival axe alone; then the knife and what it unlocks." add "The list is the wants; the player script below gives each as the best kind the skill has earned, since a from-scratch survivor has only once jobs until a skill reaches 3 and no keeps for weeks."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reference.test.ts`
Expected: PASS. If "holds three days" fails because the by-hand player dies of thirst on seed 17 inside three days, that is a finding for the April gate rather than a bug in the script: check that the fill want is given as a once job at the top of the list on every tick it is unmet (log `ordersHere` after the first few ticks), and if it is, report the death day and cause in the commit message and let Task 10 carry it.

- [ ] **Step 5: Run the reference script on all four seeds**

Run: `npm run reference`
Expected: prints one block per seed and `passed N of 4`. Record N and each seed's outcome; they go in the commit message and in Task 10's report. The gate is `REFERENCE_TARGET_DAY = 21`; it is allowed to be red here, since the calibration pass follows and this is the number it starts from.

- [ ] **Step 6: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts)
git add 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): the reference player plays by hand until the rungs open

npm run reference: passed N of 4 (seed 17: ..., 19: ..., 42: ..., 79: ...)."
```

---

### Task 9: The three horizon stages

**Files:**
- Create: `src/sim/horizon.ts`
- Create: `scripts/horizon.ts`
- Modify: `package.json` (scripts)
- Test: `tests/horizon.test.ts`

**Interfaces:**
- Consumes: `kitOut`, `REFERENCE_ORDERS`, `REFERENCE_SEEDS` from `./reference`; `withinLadder` from `./ladder`; `addOrder` from `./orders` (the raw mutator: the set-up is a stage, not a player); `levelMinutes`, `SKILL_IDS` from `./skills`.
- Produces:
  - `interface HorizonStage { id: "manual" | "grinds" | "keeps"; label: string; levels: Partial<Record<SkillId, number>>; band: [number, number] }`
  - `HORIZON_STAGES: HorizonStage[]`
  - `setSkillLevel(state, skill, level): void`
  - `setUpStage(seed, stage): { state; world }`
  - `runStage(seed, stage, maxDays): { seed; stage: HorizonStage["id"]; days: number; capped: boolean; cause: DeathCause | null; inBand: boolean }` - `days` is whole game days held before death (death day minus one), or `maxDays` with `capped` when still alive.

- [ ] **Step 1: Write the failing tests**

Create `tests/horizon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HORIZON_STAGES, runStage, setSkillLevel, setUpStage } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { REFERENCE_ORDERS } from "../src/sim/reference";
import { SKILL_IDS, skillLevel } from "../src/sim/skills";

const stage = (id: string) => HORIZON_STAGES.find((s) => s.id === id)!;

describe("the horizon stages", () => {
  it("three stages, each a skill profile with a band in game days", () => {
    expect(HORIZON_STAGES.map((s) => s.id)).toEqual(["manual", "grinds", "keeps"]);
    expect(stage("manual").levels).toEqual({});
    for (const s of SKILL_IDS) expect(stage("grinds").levels[s]).toBe(5);
    expect(stage("keeps").levels).toEqual({ woodcraft: 10, building: 10, foraging: 5, hunting: 5, fishing: 5, crafting: 5 });
    expect(stage("manual").band).toEqual([0, 2]);
    expect(stage("grinds").band).toEqual([1, 2]);
    expect(stage("keeps").band).toEqual([3, 5]);
  });

  it("setSkillLevel puts a skill exactly at a level", () => {
    const { state } = newGame(17);
    setSkillLevel(state, "fishing", 7);
    expect(skillLevel(state, "fishing")).toBe(7);
    setSkillLevel(state, "fishing", 1);
    expect(skillLevel(state, "fishing")).toBe(1);
  });

  it("the manual stage is every want as a once job on a stocked camp", () => {
    const { state, world } = setUpStage(17, stage("manual"));
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    for (const o of list) {
      expect(o.kind).toBe("job");
      expect(o.req.until.kind).toBe("once");
    }
    expect(state.player.tools.some((t) => t.id === "knife")).toBe(true);
  });

  it("the grinds stage has the chop grind, camp-has jobs for the keeps, and no keep", () => {
    const { state, world } = setUpStage(17, stage("grinds"));
    const list = ordersHere(state, world);
    expect(list.some((o) => o.kind === "keep")).toBe(false);
    expect(list.at(-1)).toMatchObject({ kind: "grind", req: { task: "chop" } });
    const fill = list.find((o) => o.req.task === "fill")!;
    expect(fill).toMatchObject({ kind: "job", req: { until: { kind: "campHas", qty: 2 } } });
  });

  it("the keeps stage keeps wood and fire and gives water as a job", () => {
    const { state, world } = setUpStage(17, stage("keeps"));
    const list = ordersHere(state, world);
    expect(list.find((o) => o.req.task === "split")!.kind).toBe("keep");
    expect(list.find((o) => o.req.task === "light")!.kind).toBe("keep");
    expect(list.find((o) => o.req.task === "fill")!.kind).toBe("job");
    expect(list.find((o) => o.req.task === "hunt")!.kind).toBe("job");
  });

  it("a manual camp holds under three days on seed 17, and the report says so", () => {
    const r = runStage(17, stage("manual"), 6);
    expect(r.capped).toBe(false);
    expect(r.days).toBeLessThan(3);
    expect(r.cause).not.toBeNull();
    expect(r.inBand).toBe(r.days >= 0 && r.days <= 2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/horizon.test.ts`
Expected: FAIL, cannot find module `../src/sim/horizon`.

- [ ] **Step 3: Write the module and the script**

Create `src/sim/horizon.ts`:

```ts
/**
 * The horizon curve (idle curve spec, section 3): how long a camp holds
 * without the player, per stage. A stage is a skill profile on a stocked
 * camp; its list is the reference wants, each given once as the best kind
 * that profile has earned, and no player script, since the player is
 * away. The day of the first death is the horizon. The bands are steered
 * by, not hit, and are provisional until the calibration pass.
 */
import type { World } from "../world/gen";
import { advance } from "./advance";
import { calendar } from "./calendar";
import { withinLadder } from "./ladder";
import { newGame } from "./newgame";
import { addOrder } from "./orders";
import { kitOut, REFERENCE_ORDERS } from "./reference";
import { levelMinutes, SKILL_IDS } from "./skills";
import type { DeathCause, GameState, SkillId } from "./types";

export interface HorizonStage {
  id: "manual" | "grinds" | "keeps";
  label: string;
  /** Level per skill; a skill not named is at 1. */
  levels: Partial<Record<SkillId, number>>;
  /** Whole game days the camp should hold, inclusive. */
  band: [number, number];
}

const ALL_AT_5: Partial<Record<SkillId, number>> = Object.fromEntries(SKILL_IDS.map((s) => [s, 5]));

export const HORIZON_STAGES: HorizonStage[] = [
  { id: "manual", label: "manual only", levels: {}, band: [0, 2] },
  { id: "grinds", label: "jobs and grinds", levels: ALL_AT_5, band: [1, 2] },
  { id: "keeps", label: "keeps in woodcraft and building", levels: { ...ALL_AT_5, woodcraft: 10, building: 10 }, band: [3, 5] },
];

export function setSkillLevel(state: GameState, skill: SkillId, level: number): void {
  state.skills[skill].xp = levelMinutes(level);
}

/** A stocked camp at the stage's levels, the wants given once as what those levels allow. */
export function setUpStage(seed: number, stage: HorizonStage): { state: GameState; world: World } {
  const g = newGame(seed);
  kitOut(g.state, g.world);
  for (const s of SKILL_IDS) setSkillLevel(g.state, s, stage.levels[s] ?? 1);
  for (const w of REFERENCE_ORDERS) {
    const best = withinLadder(g.state, w.req, w.kind);
    addOrder(g.state, g.world, best.req, best.kind);
  }
  return g;
}

export interface StageReport {
  seed: number;
  stage: HorizonStage["id"];
  /** Whole game days held before the death, or maxDays when still alive. */
  days: number;
  capped: boolean;
  cause: DeathCause | null;
  inBand: boolean;
}

export function runStage(seed: number, stage: HorizonStage, maxDays: number): StageReport {
  const { state, world } = setUpStage(seed, stage);
  for (let d = 1; d <= maxDays && !state.dead; d++) advance(state, world, 1440);
  const days = state.dead ? calendar(state.dead.minute).day - 1 : maxDays;
  const inBand = !state.dead ? days >= stage.band[0] : days >= stage.band[0] && days <= stage.band[1];
  return { seed, stage: stage.id, days, capped: !state.dead, cause: state.dead?.cause ?? null, inBand };
}
```

Create `scripts/horizon.ts`:

```ts
/**
 * The horizon checks: how long a stocked camp holds at each stage of the
 * ladder, on the reference seeds. Run: npm run horizon, or
 * npx vite-node scripts/horizon.ts 17 19 42 79 30 (seeds, then max days).
 * A stage outside its band is a finding, not a failure: the bands are
 * provisional until the calibration pass, so the exit code is always 0.
 */
import { HORIZON_STAGES, runStage } from "../src/sim/horizon";
import { REFERENCE_SEEDS } from "../src/sim/reference";

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const maxDays = args.length >= 2 ? args[args.length - 1] : 30;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

console.log("stage                              seed  held      cause                 band   verdict");
for (const stage of HORIZON_STAGES) {
  for (const seed of seeds) {
    const r = runStage(seed, stage, maxDays);
    const held = r.capped ? `${r.days}+ d` : `${r.days} d`;
    const cause = r.cause ?? "alive";
    const verdict = r.inBand ? "in band" : r.days < stage.band[0] ? "under" : "over";
    console.log(`${stage.label.padEnd(34)} ${String(seed).padEnd(5)} ${held.padEnd(9)} ${cause.padEnd(21)} ${`${stage.band[0]}-${stage.band[1]}`.padEnd(6)} ${verdict}`);
  }
}
console.log("(provisional until the calibration pass)");
```

In `package.json`, add `"horizon": "vite-node scripts/horizon.ts"` after the `reference` script.

- [ ] **Step 4: Run the tests to verify they pass, then the script**

Run: `npx vitest run tests/horizon.test.ts && npm run horizon`
Expected: tests PASS; the script prints twelve rows and the provisional line. Record the rows: they go in the commit message and in Task 10's report. If the `keeps` stage on some seed runs to the 30-day cap, that is a finding (the band says 3 to 5), not a bug; the calibration pass and the spec's bands are the place to reconcile it.

- [ ] **Step 5: Lint and commit**

```bash
(cd .. && npx biome lint 08-survidle/src/sim/horizon.ts 08-survidle/scripts/horizon.ts 08-survidle/tests/horizon.test.ts)
git add 08-survidle/src/sim/horizon.ts 08-survidle/scripts/horizon.ts 08-survidle/tests/horizon.test.ts 08-survidle/package.json
git commit -m "feat(survidle): the three horizon stages, and a script that reads how long each holds

npm run horizon: <paste the twelve rows>"
```

---

### Task 10: The browser pass, the roadmap's numbers, and the report

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` ("The delegation ladder" section: the measured numbers)
- Modify: `docs/README.md`: the strip paragraph (around line 24, "camp has N, keep camp at N, or forever") gains a sentence that jobs with a count or a target open at level 3 in the task's skill, grinds at 5 and keeps at 10, and a once job is always open; the Skills bullet (around line 126) gains a sentence that the panel marks the three rungs.

- [ ] **Step 1: The browser pass**

Start the dev server from `08-survidle/` with `npm run dev` and open `http://127.0.0.1:5173/prototypes/08/?seed=17`. Check, and note anything that looks wrong:

1. The Do panel with the strip at "keep camp at N": every row is greyed with "keeps at <Skill> 10, you are 1" and has no button. Switch the strip to "once": the rows are live. Switch to "N times": greyed with "jobs at <Skill> 3, you are 1".
2. Click a few once jobs (sticks, bark, fill). Each runs one unit and drops off the list.
3. The skills panel shows three rung marks per skill, "jobs 3, N h to go" first.
4. Use `?seed=17` and the speed control to run until Woodcraft reaches 3 (about a working day of woodcraft). The log shows "Woodcraft 3." then the jobs line. The Do panel's "N times" rows for chop, sticks, bark and split are live; foraging rows are still greyed.
5. Reload (the save keeps the level) and confirm the gate reads the saved level.

Stop the server when done.

- [ ] **Step 2: Write the numbers into the roadmap**

In the roadmap's "The delegation ladder" section, after the paragraph that ends "and are re-run then.", add a short paragraph: "Measured on landing (npm run reference, npm run horizon): the from-scratch reference player with the hourly script passes N of 4 on the April gate (deaths: ...); the stages hold: manual ..., jobs and grinds ..., keeps ... days on seeds 17, 19, 42 and 79." with the actual numbers from Tasks 8 and 9. Do not change the bands; a stage outside its band is a finding for the calibration pass, and say so in the same paragraph if one is.

- [ ] **Step 3: Run everything once more**

Run: `npm test && npm run build && (cd .. && npm run lint)`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/README.md
git commit -m "docs(survidle): the ladder's measured numbers, and what the browser pass showed"
```

- [ ] **Step 5: Report**

End with: the April gate's pass count and each seed's death day and cause under the by-hand script, the twelve horizon rows, whatever the browser pass showed, and what to play: start a fresh survivor, try to give a keep, watch the reason, earn Woodcraft 3 by hand and see the jobs open. What would look wrong: a keep accepted at level 1; a greyed row that hides its task; a rung line logged twice; the reference player idling with an unmet want at the top of its list.

---

## Self-review against the spec

- 2.1 the rungs and their levels: Task 1 (constants), Task 2 (the gate), Task 7 (the panel). The level formula untouched: Global Constraints.
- 2.2 which skill gates an order, haul on woodcraft, coverage over `TASK_IDS`, the gate on the kind after the fallback, the gate on adding not running: Task 2; the "order once added stays" rule needs no code, since nothing re-checks.
- 2.3 the greyed rows with the reason, nothing hidden, the rung marks, the log line once per rung per skill per survivor: Tasks 6, 7, 5.
- 2.4 the carry: waits on F; nothing to build. The gate reads the level, so a carried level opens the rung by construction.
- 2.5 the player script, the hourly tick as the cost of playing by hand, the kitted variant as the same script on a stocked camp: Task 8.
- 2.6 tests: `giveOrder` refuses and accepts (Task 3), once at level 1 (Task 2), haul and coverage (Task 2), the stand-in at 1, 3, 5, 10 (Task 4), the rung line once (Task 5), the reference player from scratch on four seeds (Task 8, the script; the vitest covers three days on one seed to stay fast).
- 3 the first three horizon checks as skill profiles on a stocked camp, provisional: Task 9; the last two rows wait on F and the producers.
- Sequencing (spec 7): this is the item before the calibration pass; Task 10 writes the numbers the pass starts from.
