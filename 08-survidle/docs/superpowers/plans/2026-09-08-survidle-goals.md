# Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-world ladder of named destinations - shown one at a time in the opening, widening to two and then three - that tells the player what is worth reaching and never how to reach it.

**Architecture:** A new sim module `src/sim/goals.ts` owns a fixed ladder of `GoalDef`s and a `deed()` entry point. Three existing seams emit deeds - the task-completion switch, the camp unload, and the daily roll - and nothing else in the sim knows goals exist. A new `src/ui/goalpanel.ts` draws the always-visible panel and the completion overlay, the latter reusing the rung-moment pattern in `src/ui/teachpanel.ts` exactly.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-goals-design.md` - read it before Task 1. Its "Why" section is the reason the titles are worded as they are, and Task 1's guard test exists to defend it.

## Global Constraints

- **Working directory is the worktree**: `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/goals/08-survidle`. Branch `survidle/goals`. Never `cd` to the main checkout.
- **A goal title names an outcome and never a route.** No title may name a crafted intermediate. This is note [279] of the 2026-09-07 playtest and it is enforced by a test in Task 1.
- **Stage with explicit paths.** Several sessions work in this repo. Never `git add -A`.
- **No em dashes and no non-typable characters** in code, comments, commit messages or UI copy. Use `-`, `->`, `"`, `...`.
- **Comments explain, they do not chronicle.** No dates, no "changed from", no before/after.
- **Both gates pass before every commit**: `npm test` and `npm run build`.
- **Panel markup carries no unrounded float.** `tests/churn.test.ts` is the gate; a moving value goes on a named element written each frame - the pattern `src/ui/bars.ts` uses - never into the markup string. The goal panel writes its own, in `goalpanel.ts`, so the panel owns both halves of its drawing.
- **Goals are world-scoped.** `newPerson()` and `resetTeaching()` must not touch `state.goals`.

---

### Task 1: The ladder, its state, and its guards

**Files:**
- Create: `src/sim/goals.ts`
- Modify: `src/sim/types.ts` (add the `goals` field to `GameState`)
- Modify: `src/sim/save.ts` (one line in `fillDefaults`)
- Modify: `src/sim/newgame.ts` (initialise `state.goals` where a world is made)
- Test: `tests/goals.test.ts`

**Interfaces:**
- Consumes: `Season`, `TaskId`, `StructureId`, `ItemId`, `GameState` from `src/sim/types.ts`; `Calendar` from `src/sim/calendar.ts`.
- Produces, and Tasks 2-4 rely on these names exactly:
  - `type GoalId`
  - `type Deed`
  - `interface GoalDef { id; title; target; unit?; credit }`
  - `const GOALS: GoalDef[]`
  - `const SEASON_ORDER: GoalId[]`
  - `function newGoals(season: Season): GoalState`
  - `function goalDef(id: GoalId): GoalDef`
  - `function activeGoals(state: GameState, cal: Calendar): GoalId[]`
  - `function goalDeed(state: GameState, d: Deed): GoalId[]`

- [ ] **Step 1: Write the failing test**

Create `tests/goals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { activeGoals, goalDeed, goalDef, GOALS, newGoals, SEASON_ORDER } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { RECIPES, RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { TASK_IDS } from "../src/sim/types";

const cal = calendar(0);

/**
 * Crafted intermediates: naming one in a goal's title would hand the player
 * the route, which is the thing the whole subsystem exists not to do. The
 * goal's own object is fair - "firewood" is where you are going, "cordage"
 * is how you get there.
 */
const ROUTE_WORDS = [
  "cordage", "fire drill", "drill", "stone knife", "knife", "whetstone",
  "bone needle", "needle", "wedge", "flaked axe", "stone axe", "torch",
  "bow", "arrow", "fishing spear", "bark", "stick", "log",
];

describe("the goal ladder", () => {
  it("holds out one goal in the opening and starts with the firewood", () => {
    const { state } = newGame(3);
    expect(activeGoals(state, cal)).toEqual(["firewood"]);
  });

  it("widens to two once the fire and food chain is behind it", () => {
    const { state } = newGame(3);
    for (const id of ["firewood", "fire", "cook"] as const) state.goals.done[id] = true;
    expect(activeGoals(state, cal)).toEqual(["bed", "roof"]);
  });

  it("widens to three once the camp jobs run in parallel", () => {
    const { state } = newGame(3);
    for (const g of GOALS.slice(0, 5)) state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual(["water", "snare", "store"]);
  });

  it("never shows more than the seasons can fill, and never narrows", () => {
    const { state } = newGame(3);
    for (const g of GOALS.slice(0, 7)) state.goals.done[g.id] = true;
    const active = activeGoals(state, cal);
    // One worked goal left and the whole tail behind it, which is one slot.
    expect(active[0]).toBe("store");
    expect(active.length).toBe(2);
    expect(SEASON_ORDER).toContain(active[1]);
  });

  it("shows at most one season, and it is the next one due", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id)) state.goals.done[g.id] = true;
    // A day in January: winter now, so the spring is what is next due.
    const jan = calendar(0, 0);
    expect(jan.season).toBe("winter");
    expect(activeGoals(state, jan)).toEqual(["spring"]);
  });

  it("moves to the summer once the spring has been seen", () => {
    const { state } = newGame(3);
    for (const g of GOALS) if (!SEASON_ORDER.includes(g.id)) state.goals.done[g.id] = true;
    state.goals.done.spring = true;
    expect(activeGoals(state, calendar(0, 0))).toEqual(["summer"]);
  });

  it("shows nothing at all once every goal is reached", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(activeGoals(state, cal)).toEqual([]);
  });
});

describe("goal guards", () => {
  it("credits every goal by a deed the game actually emits", () => {
    for (const g of GOALS) {
      const emitted = [
        ...TASK_IDS.map((id) => ({ kind: "task", id }) as const),
        ...STRUCTURE_IDS.map((s) => ({ kind: "built", structure: s }) as const),
        ...SEASON_ORDER.map((s) => ({ kind: "season", season: s }) as const),
        { kind: "lit" } as const,
        { kind: "delivered", item: "firewood", kg: 99 } as const,
        { kind: "delivered", item: "wetFirewood", kg: 99 } as const,
      ];
      expect(emitted.some((d) => g.credit(d) > 0), `${g.id} is unreachable`).toBe(true);
    }
  });

  it("never names a route in a title", () => {
    for (const g of GOALS) {
      const t = g.title.toLowerCase();
      for (const w of ROUTE_WORDS) {
        expect(t.includes(w), `"${g.title}" names the route word "${w}"`).toBe(false);
      }
    }
  });

  it("gives every recipe a chance to stay secret: no title is a recipe name", () => {
    const names = RECIPE_IDS.map((r) => RECIPES[r].name.toLowerCase());
    for (const g of GOALS) expect(names).not.toContain(g.title.toLowerCase());
  });

  it("uses only ASCII the user can type", () => {
    for (const g of GOALS) expect(g.title).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("goals are the world's, not a life's", () => {
  it("advances on a deed and not on a state a survivor inherited", () => {
    const { state } = newGame(3);
    // Standing in a camp whose fire is already burning is not lighting one.
    expect(state.goals.done.fire).toBeUndefined();
    // A light whose tinder failed emits the task and no "lit": no credit.
    expect(goalDeed(state, { kind: "task", id: "light" })).toEqual([]);
    expect(goalDeed(state, { kind: "lit" })).toEqual(["fire"]);
    expect(state.goals.done.fire).toBe(true);
  });

  it("counts the kilos this survivor carried in, so an inherited pile moves nothing", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "delivered", item: "firewood", kg: 4 })).toEqual([]);
    expect(state.goals.progress.firewood).toBeCloseTo(4);
    expect(goalDeed(state, { kind: "delivered", item: "wetFirewood", kg: 6 })).toEqual(["firewood"]);
    expect(state.goals.done.firewood).toBe(true);
  });

  it("never hands the same goal out twice", () => {
    const { state } = newGame(3);
    state.goals.done.fire = true;
    expect(goalDeed(state, { kind: "lit" })).toEqual([]);
  });

  it("queues each completion for its congratulation", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    expect(state.goals.queue).toEqual(["firewood"]);
  });

  it("gives a goal reached before it was asked for its credit anyway", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "built", structure: "turfHut" })).toEqual(["roof"]);
  });

  it("keeps a counted goal's progress across a death", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 6 });
    // What a landing does to the person half; the world half is untouched.
    expect(state.goals.progress.firewood).toBeCloseTo(6);
  });

  it("gives every goal a definition", () => {
    for (const g of GOALS) expect(goalDef(g.id)).toBe(g);
  });

  it("starts a world with an empty ladder standing in the season it landed in", () => {
    const g = newGoals("winter");
    expect(g.done).toEqual({});
    expect(g.progress).toEqual({});
    expect(g.queue).toEqual([]);
    expect(g.lastSeason).toBe("winter");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- goals`
Expected: FAIL - `Failed to resolve import "../src/sim/goals"`.

- [ ] **Step 3: Add the state field**

In `src/sim/types.ts`, beside the existing `manualSeen` field on `GameState`, add:

```ts
  /**
   * The world's goals: what has been reached here, how far the counted ones
   * have got, and which completions are waiting to be congratulated. The
   * world's rather than a survivor's - an heir inherits the ladder's
   * position the way they inherit the camp - so newPerson and resetTeaching
   * leave it alone.
   */
  goals: GoalState;
```

And above `GameState`, the shape itself:

```ts
export interface GoalState {
  done: Partial<Record<GoalId, true>>;
  progress: Partial<Record<GoalId, number>>;
  /** Completions not yet shown, drained by the overlay one batch at a time. */
  queue: GoalId[];
  /** The season the last daily roll stood in: a turnover is this differing from now. */
  lastSeason: Season;
}
```

`GoalId` is defined in `src/sim/goals.ts`, which imports from `types.ts`, so `types.ts` must not import it back. Declare the union in `types.ts` instead and re-export it from `goals.ts`:

```ts
export type GoalId =
  | "firewood" | "fire" | "cook" | "bed" | "roof" | "water" | "snare" | "store"
  | "spring" | "summer" | "autumn" | "winter";
```

- [ ] **Step 4: Write the module**

Create `src/sim/goals.ts`:

```ts
/**
 * The goal ladder: what the world is asked to reach, in order, one at a
 * time in the opening and more later. A goal names an outcome and never a
 * route - the player is told a fire is worth having and left to find out
 * that lighting one has parts, because finding that out is the game.
 *
 * Goals belong to the world and not to a life, and they advance on deeds
 * rather than on state. An heir who lands to a lit fire has not lit one.
 */
import type { Calendar } from "./calendar";
import type { GameState, GoalId, GoalState, ItemId, Season, StructureId, TaskId } from "./types";

export type { GoalId } from "./types";

/** Something this survivor did. The only thing that moves a goal. */
export type Deed =
  | { kind: "task"; id: TaskId; arg?: string }
  | { kind: "delivered"; item: ItemId; kg: number }
  | { kind: "built"; structure: StructureId }
  /** The tinder caught. A light that failed is not a fire lit. */
  | { kind: "lit" }
  | { kind: "season"; season: Season };

export interface GoalDef {
  id: GoalId;
  /** The whole of what the player is told. There is deliberately no second line. */
  title: string;
  /** 1 for a one-shot; the count or the kilos for a counted goal. */
  target: number;
  /** What a counted goal prints beside its figure; absent on a one-shot, which draws no bar. */
  unit?: string;
  /** What this deed contributes, in the goal's own unit. 0 when unrelated. */
  credit: (d: Deed) => number;
}

const task = (...ids: TaskId[]) => (d: Deed) => (d.kind === "task" && ids.includes(d.id) ? 1 : 0);
const built = (...ids: StructureId[]) => (d: Deed) => (d.kind === "built" && ids.includes(d.structure) ? 1 : 0);
const season = (s: Season) => (d: Deed) => (d.kind === "season" && d.season === s ? 1 : 0);

/** The kilos of firewood in a delivery, wet or dry: the goal is the carrying. */
const firewoodKg = (d: Deed) => (d.kind === "delivered" && (d.item === "firewood" || d.item === "wetFirewood") ? d.kg : 0);

export const GOALS: GoalDef[] = [
  { id: "firewood", title: "Bring 10 kg of firewood back to camp", target: 10, unit: "kg", credit: firewoodKg },
  { id: "fire", title: "Light a fire", target: 1, credit: (d) => (d.kind === "lit" ? 1 : 0) },
  { id: "cook", title: "Cook something over it", target: 1, credit: task("cook") },
  { id: "bed", title: "Get off the cold ground", target: 1, credit: built("boughBed") },
  { id: "roof", title: "Put a roof over your head", target: 1, credit: built("leanTo", "turfHut", "snowShelter") },
  { id: "water", title: "Keep water at camp", target: 1, credit: built("waterStore", "seep") },
  { id: "snare", title: "Set a snare", target: 1, credit: built("snare") },
  { id: "store", title: "Put food by for later", target: 1, credit: task("hang") },
  { id: "spring", title: "Live to see the spring", target: 1, credit: season("spring") },
  { id: "summer", title: "Live to see the summer", target: 1, credit: season("summer") },
  { id: "autumn", title: "Live to see the autumn", target: 1, credit: season("autumn") },
  { id: "winter", title: "Live to see the winter", target: 1, credit: season("winter") },
];

/** The seasons in the order they arrive, which is how the tail takes its turn. */
export const SEASON_ORDER: GoalId[] = ["spring", "summer", "autumn", "winter"];

const BY_ID = new Map(GOALS.map((g) => [g.id, g]));

export function goalDef(id: GoalId): GoalDef {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`no such goal: ${id}`);
  return g;
}

export function newGoals(s: Season): GoalState {
  return { done: {}, progress: {}, queue: [], lastSeason: s };
}

/**
 * How many goals are held out at once. One through the fire and food
 * chain, where the player has the fewest tools and the least idea what
 * matters; two from the point the goals stop being a chain, three once
 * they are wholly parallel jobs competing for the same materials.
 */
function width(firstOpen: number): number {
  if (firstOpen >= 5) return 3;
  if (firstOpen >= 3) return 2;
  return 1;
}

/** The next season to arrive that has not been seen here, or null when all four have. */
function nextSeason(state: GameState, cal: Calendar): GoalId | null {
  const now = SEASON_ORDER.indexOf(cal.season as GoalId);
  for (let i = 1; i <= SEASON_ORDER.length; i++) {
    const id = SEASON_ORDER[(now + i) % SEASON_ORDER.length];
    if (!state.goals.done[id]) return id;
  }
  return null;
}

/**
 * What the panel holds out: the first N incomplete goals, with the whole
 * seasonal tail collapsed into one slot. Three lines saying "keep living"
 * is one line.
 */
export function activeGoals(state: GameState, cal: Calendar): GoalId[] {
  const open = GOALS.filter((g) => !state.goals.done[g.id]);
  if (open.length === 0) return [];
  const n = width(GOALS.findIndex((g) => g.id === open[0].id));
  const out: GoalId[] = [];
  let seasonTaken = false;
  for (const g of open) {
    if (out.length >= n) break;
    if (SEASON_ORDER.includes(g.id)) {
      if (seasonTaken) continue;
      seasonTaken = true;
      const s = nextSeason(state, cal);
      if (s) out.push(s);
      continue;
    }
    out.push(g.id);
  }
  return out;
}

/**
 * Credits a deed against every goal still open and returns the ones it
 * finished, queued for their congratulation. A goal reached before the
 * ladder got round to asking still counts: nobody should be told to build
 * a turf hut twice.
 */
export function goalDeed(state: GameState, d: Deed): GoalId[] {
  const finished: GoalId[] = [];
  for (const g of GOALS) {
    if (state.goals.done[g.id]) continue;
    const c = g.credit(d);
    if (c <= 0) continue;
    const at = (state.goals.progress[g.id] ?? 0) + c;
    state.goals.progress[g.id] = at;
    if (at + 1e-9 >= g.target) {
      state.goals.done[g.id] = true;
      state.goals.queue.push(g.id);
      finished.push(g.id);
    }
  }
  return finished;
}
```

- [ ] **Step 5: Initialise the field where a world is made**

In `src/sim/newgame.ts`, import `newGoals` from `./goals` and set `state.goals` in the same place the other world-half fields are set (beside `spine`, `manualSeen`). Find where the initial `GameState` object literal is built and add:

```ts
    goals: newGoals(calendar(0, startDoy).season),
```

Read the surrounding code first: if the literal names its fields, match its style; do NOT add it inside `newPerson`, which is the person half and must leave goals alone.

- [ ] **Step 6: Default it for old saves**

In `src/sim/save.ts`, in `fillDefaults`, beside `state.manualSeen ??= false;`:

```ts
  // A save from before the ladder starts at its top, standing in the season
  // it is in, so the load itself credits nothing. Under-crediting beats
  // inferring a history from state, which is the inference goals exist to avoid.
  state.goals ??= newGoals(calendar(state.minute, state.startDoy).season);
```

Import `newGoals` from `./goals`. `calendar` is already imported in `save.ts`, and a `Calendar` carries its own `season`, so no other import is needed.

- [ ] **Step 7: Run the tests**

Run: `npm test -- goals`
Expected: PASS, all cases.

- [ ] **Step 8: Run both gates**

Run: `npm test && npm run build`
Expected: both pass. If `tsc` complains that `GoalId` is used in `types.ts` before its declaration, move the `GoalId` union above `GoalState`.

- [ ] **Step 9: Commit**

```bash
git add src/sim/goals.ts src/sim/types.ts src/sim/save.ts src/sim/newgame.ts tests/goals.test.ts
git commit -m "feat(survidle): a goal says where to go, and the world remembers reaching it"
```

---

### Task 2: The three seams that emit deeds

**Files:**
- Modify: `src/sim/tasks.ts` (the `complete()` switch, around line 1710)
- Modify: `src/sim/intent.ts` (`dropEverything`, around line 427)
- Modify: `src/sim/advance.ts` (the daily roll, around line 108)
- Test: `tests/goals-deeds.test.ts`

**Interfaces:**
- Consumes: `goalDeed`, `type Deed` from `src/sim/goals.ts` (Task 1).
- Produces: nothing new. After this task, playing the game moves the ladder.

- [ ] **Step 1: Write the failing test**

Create `tests/goals-deeds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("deeds reach the ladder", () => {
  it("credits the fire when this survivor lights one", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    state.goals.done.firewood = true;
    placeAt(state, world, st.campCell);
    // Everything a light needs, so the deed is the only thing under test.
    st.structures.firePit = true;
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, o.duration + 1);
    // Lighting can fail on the weather, and a failed light credits nothing:
    // the two must agree either way.
    expect(state.goals.done.fire ?? false).toBe(st.fire.lit);
  });

  it("does not credit the fire to a survivor who only found one burning", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    advance(state, world, 60);
    expect(state.goals.done.fire).toBeUndefined();
  });

  it("credits the firewood a survivor unloads at camp, and not the pile already there", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "firewood", 40);
    advance(state, world, 120);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("credits a season only when the calendar turns over into it", () => {
    const { state, world } = newGame(3);
    for (const id of ["firewood", "fire", "cook", "bed", "roof", "water", "snare", "store"] as const) {
      state.goals.done[id] = true;
    }
    const before = state.goals.lastSeason;
    // A landing does not credit the season it lands in.
    advance(state, world, 60);
    expect(state.goals.done[before as "winter"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- goals-deeds`
Expected: FAIL - the fire case, because nothing emits a deed yet.

- [ ] **Step 3: Emit the task deed**

In `src/sim/tasks.ts`, find `function complete(state, world, cal, rng, id, arg)`. Import `goalDeed` from `./goals`. Wrap the body so every completed task emits one deed, without touching any branch. Rename the existing function to `completeTask` and add a thin wrapper with the original name:

```ts
/**
 * Every finished task, and the one place goals hear about it. The switch
 * below is untouched: a deed is what happened, not a special case inside
 * whatever happened.
 */
function complete(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string): void {
  completeTask(state, world, cal, rng, id, arg);
  goalDeed(state, { kind: "task", id, arg });
}
```

Do NOT change any `case` in the switch. The `build` case already records `{ kind: "built", structure: sid }` to the life record; add the goal deed beside that existing `record(...)` call so a structure emits both:

```ts
      goalDeed(state, { kind: "built", structure: sid });
```

Place it immediately after the existing `if (!hasEvent(...)) record(state, { kind: "built", structure: sid });` line, outside the `if`, so a second hut still credits a goal the first one did not reach.

The `light` and `lightIndoors` case needs the same treatment for the opposite
reason: it can fail, and the wrapper cannot see that it did. In that case, on
the line immediately after `st.fire.lit = true;`, add:

```ts
      goalDeed(state, { kind: "lit" });
```

The early `return` on "The tinder will not catch." is then the whole guard: a
failed lighting emits the task deed and no `lit`, and credits nothing.

- [ ] **Step 4: Emit the delivery deed**

In `src/sim/intent.ts`, in `dropEverything`, the loop already captures what each `transfer` moved. Import `goalDeed` from `./goals` and credit only what lands on the home camp cell:

```ts
function dropEverything(state: GameState, world: World): boolean {
  const from = state.player.pack;
  const here = cellOf(state, world);
  const to = pile(state, here);
  const keep = new Set(orderKit(state));
  const atHome = state.intent?.campCell === here;
  let moved = false;
  for (const { item, qty: q } of listItems(from)) {
    if (keep.has(item)) continue;
    const kg = transfer(from, to, item, q);
    if (kg > 1e-9) {
      moved = true;
      // What this survivor carried in, which is the only thing a goal counts.
      if (atHome) goalDeed(state, { kind: "delivered", item, kg });
    }
  }
  if (atHome) moved = pourVessels(state.player, to, regionState(state, world, state.player.region)) > 1e-9 || moved;
  return moved;
}
```

Note this preserves the existing behaviour exactly: the old code computed `atHome` inline as `state.intent?.campCell === here` for `pourVessels`, and the loop's `moved` semantics are unchanged.

- [ ] **Step 5: Emit the season deed**

In `src/sim/advance.ts`, import `goalDeed` from `./goals`. In the daily-roll block:

```ts
  if (cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR) {
    state.lastDay = cal.dayIndex;
    dailyAnimals(state, world, cal, rng, who);
    dailyCamp(state, world, cal, rng, who);
    stepSpine(state, cal, who);
    // A season is reached by living into it. Landing inside one is not
    // reaching it, which is why the turnover and not the reading is the deed.
    const season = cal.season;
    if (season !== state.goals.lastSeason) {
      state.goals.lastSeason = season;
      if (!nobody) goalDeed(state, { kind: "season", season });
    }
    if (!nobody) current(state).forecast.push(null);
  }
```

The `!nobody` guard matters: the months between two survivors run with `nobody: true`, and nobody is alive to have lived to see anything. `lastSeason` still advances, so the gap does not hand a free season to the heir.

- [ ] **Step 6: Run the tests**

Run: `npm test -- goals-deeds`
Expected: PASS.

- [ ] **Step 7: Run both gates**

Run: `npm test && npm run build`
Expected: both pass. `tests/churn.test.ts`, `tests/advance-save.test.ts` and the intent tests all exercise these seams - if any goes red, the wrapper changed behaviour and must be fixed, not the test.

- [ ] **Step 8: Commit**

```bash
git add src/sim/tasks.ts src/sim/intent.ts src/sim/advance.ts tests/goals-deeds.test.ts
git commit -m "feat(survidle): the ladder hears what the survivor did, not what the camp holds"
```

---

### Task 3: The panel

**Files:**
- Create: `src/ui/goalpanel.ts`
- Modify: `index.html` (a `#goals` section at the top of `#center`)
- Modify: `src/main.ts` (one `setPanel` call)
- Modify: `src/style.css` (the panel's own rules)
- Test: `tests/goalpanel.test.ts`

**Interfaces:**
- Consumes: `activeGoals`, `goalDef`, `GOALS` from `src/sim/goals.ts` (Task 1).
- Produces: `function goalsHtml(state: GameState, cal: Calendar): string` and `function updateGoalBars(state: GameState, cal: Calendar, root?: ParentNode): void`, both used by Task 4 and by `main.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/goalpanel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { GOALS, goalDeed } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { goalsHtml, updateGoalBars } from "../src/ui/goalpanel";

const cal = calendar(0);

describe("the goal panel", () => {
  it("shows the opening goal by name", () => {
    const { state } = newGame(3);
    expect(goalsHtml(state, cal)).toContain("Bring 10 kg of firewood back to camp");
  });

  it("shows nothing once the ladder is finished, so the panel can collapse", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(goalsHtml(state, cal)).toBe("");
  });

  it("keeps the moving figure out of the markup, so the panel does not redraw on it", () => {
    const { state } = newGame(3);
    const before = goalsHtml(state, cal);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 4.237 });
    expect(goalsHtml(state, cal)).toBe(before);
    expect(before).not.toMatch(/\d+\.\d+%/);
  });

  it("writes the figure and the fill onto the named elements each frame", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 4 });
    document.body.innerHTML = `<div id="goals">${goalsHtml(state, cal)}</div>`;
    updateGoalBars(state, cal);
    expect(document.querySelector<HTMLElement>("#val-goal-firewood")!.textContent).toBe("4 / 10 kg");
    expect(document.querySelector<HTMLElement>("#bar-goal-firewood")!.style.width).toBe("40.0%");
  });

  it("draws no bar on a goal that is simply done or not done", () => {
    const { state } = newGame(3);
    state.goals.done.firewood = true;
    const html = goalsHtml(state, cal);
    expect(html).toContain("Light a fire");
    expect(html).not.toContain("bar-goal-fire");
  });

  it("escapes nothing it does not have to, and never leaks a tag", () => {
    const { state } = newGame(3);
    expect(goalsHtml(state, cal)).not.toContain("<script");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- goalpanel`
Expected: FAIL - `Failed to resolve import "../src/ui/goalpanel"`.

- [ ] **Step 3: Write the panel**

Create `src/ui/goalpanel.ts`:

```ts
/**
 * The goal panel and its congratulation. The panel is the one thing on
 * the page that says what is worth doing next, so it sits above the clock
 * and never scrolls away; the overlay is the rung moment's shape, because
 * a goal reached and a rung opened are the same kind of event to a reader.
 */
import type { Calendar } from "../sim/calendar";
import { activeGoals, goalDef, type GoalId } from "../sim/goals";
import type { GameState } from "../sim/types";
import { esc } from "./render";

/** The element ids a goal's fill and figure are written to each frame. */
function barId(id: GoalId): string {
  return `goal-${id}`;
}

function rowHtml(state: GameState, id: GoalId): string {
  const g = goalDef(id);
  const title = `<div class="goal-title">${esc(g.title)}</div>`;
  // A one-shot has nothing to watch: it is done or it is not.
  if (g.target <= 1) return `<li class="goal">${title}</li>`;
  const b = barId(id);
  return `<li class="goal">${title}<div class="bar"><div class="fill" id="bar-${b}"></div></div><span class="dim" id="val-${b}"></span></li>`;
}

/**
 * The panel's markup. Empty once every goal is reached, which lets the
 * section collapse rather than stand there holding a congratulation
 * nobody asked to keep.
 */
export function goalsHtml(state: GameState, cal: Calendar): string {
  const active = activeGoals(state, cal);
  if (active.length === 0) return "";
  const word = active.length > 1 ? "Your goals" : "Your goal";
  return `<h2>${word}</h2><ul class="goals">${active.map((id) => rowHtml(state, id)).join("")}</ul>`;
}

/**
 * The counted goals' figures, written each frame rather than built into
 * the markup: a kilo count that climbs with every armful would redraw the
 * panel on every frame it moved.
 */
export function updateGoalBars(state: GameState, cal: Calendar, root: ParentNode = document): void {
  for (const id of activeGoals(state, cal)) {
    const g = goalDef(id);
    if (g.target <= 1) continue;
    const at = state.goals.progress[id] ?? 0;
    const b = barId(id);
    const fill = root.querySelector<HTMLElement>(`#bar-${b}`);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (at / g.target) * 100)).toFixed(1)}%`;
    const val = root.querySelector<HTMLElement>(`#val-${b}`);
    const text = `${Math.round(at)} / ${g.target}${g.unit ? ` ${g.unit}` : ""}`;
    if (val && val.textContent !== text) val.textContent = text;
  }
}
```

- [ ] **Step 4: Add the section to the page**

In `index.html`, inside `<main id="center" class="col">`, immediately BEFORE `<section id="clock" class="panel"></section>`:

```html
        <section id="goals" class="panel"></section>
```

- [ ] **Step 5: Style it**

In `src/style.css`, add near the other panel rules:

```css
/* An empty ladder collapses rather than leaving a titled box with nothing in it. */
#goals:empty { display: none; }
#goals .goals { list-style: none; margin: 0; padding: 0; }
#goals .goal { margin: 0.35rem 0; }
#goals .goal-title { font-weight: 600; }
```

Read the surrounding file first and match its existing conventions for bars and panel spacing rather than inventing new ones. If `.bar` and `.fill` already have rules that work, add nothing for them.

- [ ] **Step 6: Wire it into the frame**

In `src/main.ts`:
- import `{ goalsHtml, updateGoalBars }` from `./ui/goalpanel`
- beside the other `setPanel` calls, before `setPanel("clock", ...)`:

```ts
  setPanel("goals", goalsHtml(state, cal));
```

- beside the existing `updateBars(state, world)` call:

```ts
  updateGoalBars(state, cal);
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- goalpanel`
Expected: PASS.

- [ ] **Step 8: Run both gates plus the churn budget**

Run: `npm test && npm run build`
Expected: both pass, `tests/churn.test.ts` included. If churn goes red on `goals`, a moving value reached the markup: move it to `updateGoalBars`.

- [ ] **Step 9: Commit**

```bash
git add src/ui/goalpanel.ts src/main.ts index.html src/style.css tests/goalpanel.test.ts
git commit -m "feat(survidle): the goal stands above the clock and does not scroll away"
```

---

### Task 4: The congratulation

**Files:**
- Modify: `src/ui/goalpanel.ts` (add `goalMomentToOpen` and `goalDoneHtml`)
- Modify: `src/ui/render.ts` (`UiState.goalsDone`)
- Modify: `src/main.ts` (the overlay chain, the drain, the dismiss, the pause)
- Test: `tests/goalpanel.test.ts` (extend)

**Interfaces:**
- Consumes: `activeGoals`, `goalDef` from `src/sim/goals.ts`; `UiState` from `src/ui/render.ts`.
- Produces:
  - `function goalMomentToOpen(state: GameState, ui: UiState): GoalId[] | null`
  - `function goalDoneHtml(state: GameState, cal: Calendar, done: GoalId[]): string`

- [ ] **Step 1: Write the failing test**

Append to `tests/goalpanel.test.ts`:

```ts
import { goalDoneHtml, goalMomentToOpen } from "../src/ui/goalpanel";
import { newUiState } from "../src/ui/render";

describe("the congratulation", () => {
  it("opens on a queued completion", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    expect(goalMomentToOpen(state, ui)).toBe(null);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood"]);
  });

  it("queues behind a rung moment, which is the larger event", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    ui.teach = "job";
    expect(goalMomentToOpen(state, ui)).toBe(null);
  });

  it("waits out the landing, the tombstone and the away report", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    const ui = newUiState();
    ui.welcome = true;
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.welcome = false;
    state.dead = { cause: "froze", minute: 0 };
    expect(goalMomentToOpen(state, ui)).toBe(null);
  });

  it("gathers a catch-up's completions into one screen rather than a stack", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    goalDeed(state, { kind: "built", structure: "boughBed" });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood", "bed"]);
  });

  it("names what was done and where to go next", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 20 });
    const html = goalDoneHtml(state, cal, ["firewood"]);
    expect(html).toContain("Bring 10 kg of firewood back to camp");
    expect(html).toContain("Light a fire");
    expect(html).toContain("goal-close");
  });

  it("introduces nothing when the ladder is finished", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    const html = goalDoneHtml(state, cal, ["winter"]);
    expect(html).toContain("Live to see the winter");
    expect(html).not.toContain("Next");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- goalpanel`
Expected: FAIL - `goalMomentToOpen` is not exported.

- [ ] **Step 3: Add the moment to `src/ui/goalpanel.ts`**

```ts
import type { UiState } from "./render";

/**
 * The completions waiting to be shown, or null while something larger is
 * open. A rung is the bigger event and is not pre-empted by a goal that
 * finished in the same minute; a landing, a death and an away report all
 * come first for the same reason.
 */
export function goalMomentToOpen(state: GameState, ui: UiState): GoalId[] | null {
  if (ui.goalsDone || ui.teach || ui.welcome || ui.manual || ui.cemetery || ui.away || state.landing || state.dead) return null;
  return state.goals.queue.length > 0 ? [...state.goals.queue] : null;
}

/**
 * The congratulation. Everything finished since the last one is named on
 * the one screen, and the goals now standing are introduced under it, so
 * a single dismissal leaves the player knowing where to walk.
 */
export function goalDoneHtml(state: GameState, cal: Calendar, done: GoalId[]): string {
  const word = done.length > 1 ? "Goals reached" : "Goal reached";
  const met = done.map((id) => `<p class="example">${esc(goalDef(id).title)}</p>`).join("");
  const next = activeGoals(state, cal);
  const ahead = next.length === 0
    ? `<p class="dim">That is the last of them. What you do here now is yours to choose.</p>`
    : `<p class="dim">Next:</p>${next.map((id) => `<p class="example">${esc(goalDef(id).title)}</p>`).join("")}`;
  return `<div class="box teach">
<h1>${word}</h1>
${met}
${ahead}
<button data-act="goal-close">On</button>
</div>`;
}
```

- [ ] **Step 4: Add the UI field**

In `src/ui/render.ts`, in the `UiState` interface beside `teach`:

```ts
  /** The completions whose congratulation is open, drained from state.goals.queue. */
  goalsDone: GoalId[] | null;
```

Import `GoalId` from `../sim/types`. In `newUiState()`, add `goalsDone: null,` to the returned literal.

- [ ] **Step 5: Wire the overlay**

In `src/main.ts`:

- import `{ goalDoneHtml, goalMomentToOpen, goalsHtml, updateGoalBars }` from `./ui/goalpanel`
- in the overlay chain, add a branch AFTER the `ui.teach` branch and before the final `else`:

```ts
  } else if (ui.goalsDone) {
    setPanel("overlay", goalDoneHtml(state, cal, ui.goalsDone));
    overlay.hidden = false;
```

- beside the existing `if (momentToOpen(state, ui)) ui.teach = state.teachQueue.shift()!;`:

```ts
  const reached = goalMomentToOpen(state, ui);
  if (reached) {
    ui.goalsDone = reached;
    state.goals.queue = [];
  }
```

- in the action switch, beside `case "teach-close":`:

```ts
    case "goal-close":
      ui.goalsDone = null;
      // The same bump the rung moment's dismiss does: the minutes the
      // screen was open were paused, not spent away.
      lastReal = performance.now();
      break;
```

- add `ui.goalsDone` to BOTH the frame guards that pause the world while an overlay is open, so time does not run under the congratulation:

```ts
  if (!state.dead && !state.landing && !ui.away && !ui.teach && !ui.welcome && !ui.goalsDone) {
```

and

```ts
  } else if (ui.away || ui.teach || ui.welcome || ui.goalsDone) {
```

Read both lines in context before editing; they are around lines 215 and 230.

- [ ] **Step 6: Run the tests**

Run: `npm test -- goalpanel`
Expected: PASS.

- [ ] **Step 7: Run both gates**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/ui/goalpanel.ts src/ui/render.ts src/main.ts tests/goalpanel.test.ts
git commit -m "feat(survidle): reaching a goal is said out loud, and names the next one"
```

---

### Task 5: Verification in the real page

**Files:** none changed unless a fault is found.

- [ ] **Step 1: Both gates, whole suite**

Run: `npm test && npm run build`
Expected: green. Record the counts.

- [ ] **Step 2: Lint**

Run: `cd /Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/goals && npm run lint`
Expected: clean for `08-survidle`. Fix anything it names in the new files.

- [ ] **Step 3: Drive the fire chain in a browser**

Start the dev server from the prototype directory: `npm run dev`, and open
`http://127.0.0.1:5173/prototypes/08/?seed=1000010` - the playtest's own seed.

Check, and write down what you actually saw rather than what you expected:
1. The goal panel is above the clock on load and reads "Bring 10 kg of firewood back to camp".
2. Its bar and figure move as wood comes into camp, and the figure is a whole number.
3. Reaching it raises the congratulation, which names it and introduces "Light a fire".
4. Dismissing it leaves the panel reading "Light a fire", with no bar.
5. The world is paused while the congratulation is open.

Stop the server when done.

- [ ] **Step 4: Report**

Report to the user: gate results, what the browser pass showed, and anything
that looked wrong. Do not commit a fix without saying what it was.

---

## Notes for the executor

**One refinement this plan makes to the spec, deliberately.** The spec left open
whether a deed credits a goal that is not yet active. This plan credits every
open goal, active or not, and queues its congratulation. The alternative - only
crediting the active ones - would ask a player who built a turf hut early to
build a second one, which is 1200 minutes of work to satisfy a bookkeeping rule.
If the user disagrees, the change is one `continue` in `goalDeed`.

**What must not drift.** A goal never highlights a task row, never filters the Do
list and never queues an order. All three are the route arriving by another door,
and the whole subsystem exists to withhold it.
