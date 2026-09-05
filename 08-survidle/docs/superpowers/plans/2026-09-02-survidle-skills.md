# Survidle Skills, Mastery and Pools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six skills with levels, per-action mastery, mastery pools with checkpoint perks, and soft level gates, all measured in minutes of work.

**Architecture:** One new module `src/sim/skills.ts` owns the tables, curves, the per-minute `train` hook, and the multiplier functions (`speedFactor`, `wearFactor`, `oddsFactor`, `yieldFactor`, `gap`). The rest of the sim reads those multipliers at the points where it already computes pace, odds, wear and yield. `availableTasks` decorates each option with its mastery and recommendation, and the panels render them.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom (already configured). No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-02-survidle-skills-design.md`. Read it first; every number below comes from it.

## Global Constraints

- Every quantity is real: experience is minutes, levels are hours behind the tool. No abstract "XP" numbers appear in UI text; the panel shows hours.
- Skill level cap 50, `level = min(50, 1 + floor(sqrt(minutes / 120)))`. Mastery cap 99, `masteryLevel = min(99, 1 + floor(sqrt(minutes / 15)))`. Pool capacity 6,000 minutes per mastery key.
- Gates are soft: a button is never greyed for level.
- All work is in `08-survidle/`. Run `npm test`, `npx tsc --noEmit` and `npm run build` there before every commit. Stage with explicit paths, never `git add -A`.
- Writing style in code comments, log lines and docs: no em dashes, no unicode arrows or fancy quotes. Comments explain, they do not chronicle (no "added", no dates).
- Log lines follow the existing voice: short, plain, second person. Level-ups are `Woodcraft 5.` in the good colour.

---

## File map

| file | responsibility |
|------|----------------|
| `src/sim/skills.ts` (new) | skill ids and names, mastery keys, curves, `newSkills`, `skillOf`, `masteryKey`, `train`, `gap`, `speedFactor`, `wearFactor`, `oddsFactor`, `injuryChance`, `yieldFactor`, `effectiveNeeds`, `chopSticks`, `huntExtras` |
| `src/sim/types.ts` | `SkillId`, `SkillState`, `skills` on `GameState` |
| `src/sim/newgame.ts`, `src/sim/save.ts` | fresh skills; old saves filled |
| `src/sim/tasks.ts` | call `train` per minute; read the multipliers in `stepTask`, `huntOdds`, completions; decorate options in `availableTasks` |
| `src/sim/player.ts` | `workSpeed` takes the task's factor |
| `src/ui/panels.ts` | `skillsHtml`, mastery bar and recommendation in `optHtml`, best skill on the death screen |
| `index.html`, `src/main.ts`, `src/style.css` | the Skills panel section, its render call, the `.warn` and pool-tick styles |
| `tests/skills.test.ts` (new) | curves, training, effects, gates, extras, pool, save |
| `tests/ui.test.ts` | panel and button rendering |
| `docs/README.md` | a Skills bullet |

---

### Task 1: Skill tables, curves and state

**Files:**
- Create: `src/sim/skills.ts`
- Modify: `src/sim/types.ts` (after the `RunStats` interface, and `GameState`)
- Modify: `src/sim/newgame.ts:14-50`
- Modify: `src/sim/save.ts` (`fillDefaults`)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `SkillId`, `SkillState`, `SKILL_IDS`, `SKILL_NAMES`, `MASTERY_KEYS`, `newSkills()`, `level(minutes)`, `levelMinutes(L)`, `masteryLevel(minutes)`, `masteryMinutes(M)`, `poolCapacity(skill)`, `poolShare(state, skill)`, `skillLevel(state, skill)`, `masteryOf(state, skill, key)`, `skillOf(id, arg?)`, `masteryKey(state, world, id, arg?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/skills.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import {
  level, levelMinutes, MASTERY_KEYS, masteryKey, masteryLevel, masteryMinutes, newSkills,
  poolCapacity, SKILL_IDS, skillOf,
} from "../src/sim/skills";

describe("skill curves", () => {
  it("skill level is hours squared: 1 at 0, 2 at 2 h, 10 at 162 h, capped at 50", () => {
    expect(level(0)).toBe(1);
    expect(level(119)).toBe(1);
    expect(level(120)).toBe(2);
    expect(level(9720)).toBe(10);
    expect(level(9719)).toBe(9);
    expect(level(1e9)).toBe(50);
    expect(levelMinutes(10)).toBe(9720);
  });

  it("mastery level is a gentler curve: 20 at 90.25 h, capped at 99", () => {
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(5415)).toBe(20);
    expect(masteryLevel(5414)).toBe(19);
    expect(masteryLevel(1e9)).toBe(99);
    expect(masteryMinutes(20)).toBe(5415);
  });

  it("a pool holds 100 hours per mastery key", () => {
    expect(poolCapacity("fishing")).toBe(6000);
    expect(poolCapacity("woodcraft")).toBe(6 * 6000);
    expect(MASTERY_KEYS.hunting).toEqual(["hunt:hare", "hunt:grouse", "hunt:deer", "hunt:elk", "snare"]);
    expect(MASTERY_KEYS.crafting).toContain("craft:hideBlanket");
    expect(MASTERY_KEYS.building).toContain("build:boughBed");
    expect(MASTERY_KEYS.building).not.toContain("build:snare");
  });
});

describe("what trains what", () => {
  it("maps every task to a skill and a mastery key, and walks to nothing", () => {
    const { state, world } = newGame(3);
    expect(skillOf("chop")).toBe("woodcraft");
    expect(skillOf("build", "snare")).toBe("hunting");
    expect(skillOf("build", "cabin")).toBe("building");
    expect(skillOf("cook")).toBe("building");
    expect(skillOf("walk")).toBeNull();
    expect(skillOf("sleep")).toBeNull();
    placeAtSpot(state, world, state.player.region, "forest");
    expect(masteryKey(state, world, "chop")).toMatch(/^chop:(spruce|pine|birch)$/);
    expect(masteryKey(state, world, "hunt", "elk")).toBe("hunt:elk");
    expect(masteryKey(state, world, "build", "snare")).toBe("snare");
    expect(masteryKey(state, world, "cook")).toBe("cook:rawMeat");
    expect(masteryKey(state, world, "walk", "spot:camp")).toBeNull();
  });

  it("a fresh run has every skill at zero, and an old save is filled the same way", () => {
    const { state } = newGame(3);
    for (const id of SKILL_IDS) expect(state.skills[id]).toEqual({ xp: 0, mastery: {}, pool: 0 });
    const raw = JSON.parse(serialize(state, 1));
    delete raw.state.skills;
    const file = deserialize(JSON.stringify(raw));
    expect(file!.state.skills).toEqual(newSkills());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL, "Failed to resolve import ../src/sim/skills".

- [ ] **Step 3: Add the types**

In `src/sim/types.ts`, after `export interface RunStats { ... }`:

```ts
export type SkillId = "woodcraft" | "foraging" | "hunting" | "fishing" | "crafting" | "building";

/** Practice, in minutes. A level is a count of hours behind the tool. */
export interface SkillState {
  /** Minutes of work at the skill's tasks. */
  xp: number;
  /** Minutes of work per mastery key ("chop:spruce", "hunt:elk", "craft:bow"). */
  mastery: Record<string, number>;
  /** Minutes in the mastery pool, capped at the skill's capacity. */
  pool: number;
}
```

In `GameState`, after `stats: RunStats;`:

```ts
  skills: Record<SkillId, SkillState>;
```

- [ ] **Step 4: Create `src/sim/skills.ts`**

```ts
/**
 * Skills are practice. Every minute at a task is a minute in its skill, in
 * that action's mastery and in the skill's pool; a level is a count of
 * hours. What a level buys is what practice buys: speed, odds, less waste.
 */
import type { World } from "../world/gen";
import { RECIPE_IDS, STRUCTURE_IDS } from "./items";
import { hereTerrain } from "./position";
import type { GameState, SkillId, SkillState, TaskId } from "./types";

export const SKILL_IDS: SkillId[] = ["woodcraft", "foraging", "hunting", "fishing", "crafting", "building"];

export const SKILL_NAMES: Record<SkillId, string> = {
  woodcraft: "Woodcraft", foraging: "Foraging", hunting: "Hunting",
  fishing: "Fishing", crafting: "Crafting", building: "Building",
};

/** The actions each skill owns; the pool's capacity is 100 hours per key. */
export const MASTERY_KEYS: Record<SkillId, string[]> = {
  woodcraft: ["chop:spruce", "chop:pine", "chop:birch", "sticks", "bark", "split"],
  foraging: ["berries", "stone"],
  hunting: ["hunt:hare", "hunt:grouse", "hunt:deer", "hunt:elk", "snare"],
  fishing: ["fish"],
  crafting: [...RECIPE_IDS.map((r) => `craft:${r}`), "repair", "sharpen"],
  building: [...STRUCTURE_IDS.filter((s) => s !== "snare").map((s) => `build:${s}`), "light", "cook:rawMeat", "cook:fish"],
};

export const SKILL_CAP = 50;
export const MASTERY_CAP = 99;
/** Level L needs 2 (L-1)^2 hours: 120 (L-1)^2 minutes. */
export const SKILL_LEVEL_MINUTES = 120;
/** Mastery M needs 0.25 (M-1)^2 hours: 15 (M-1)^2 minutes. */
export const MASTERY_LEVEL_MINUTES = 15;
export const POOL_MINUTES_PER_KEY = 100 * 60;

export function newSkills(): Record<SkillId, SkillState> {
  const out = {} as Record<SkillId, SkillState>;
  for (const id of SKILL_IDS) out[id] = { xp: 0, mastery: {}, pool: 0 };
  return out;
}

export function level(minutes: number): number {
  return Math.min(SKILL_CAP, 1 + Math.floor(Math.sqrt(Math.max(0, minutes) / SKILL_LEVEL_MINUTES)));
}

export function levelMinutes(l: number): number {
  return SKILL_LEVEL_MINUTES * (l - 1) ** 2;
}

export function masteryLevel(minutes: number): number {
  return Math.min(MASTERY_CAP, 1 + Math.floor(Math.sqrt(Math.max(0, minutes) / MASTERY_LEVEL_MINUTES)));
}

export function masteryMinutes(m: number): number {
  return MASTERY_LEVEL_MINUTES * (m - 1) ** 2;
}

export function poolCapacity(skill: SkillId): number {
  return POOL_MINUTES_PER_KEY * MASTERY_KEYS[skill].length;
}

export function poolShare(state: GameState, skill: SkillId): number {
  return state.skills[skill].pool / poolCapacity(skill);
}

export function skillLevel(state: GameState, skill: SkillId): number {
  return level(state.skills[skill].xp);
}

export function masteryOf(state: GameState, skill: SkillId, key: string): number {
  return masteryLevel(state.skills[skill].mastery[key] ?? 0);
}

/** The skill a task trains, or null for walks and waits. */
export function skillOf(id: TaskId, arg?: string): SkillId | null {
  switch (id) {
    case "chop": case "sticks": case "bark": case "split": return "woodcraft";
    case "berries": case "stone": return "foraging";
    case "hunt": return "hunting";
    case "build": return arg === "snare" ? "hunting" : "building";
    case "fish": return "fishing";
    case "craft": case "repair": case "sharpen": return "crafting";
    case "light": case "cook": return "building";
    default: return null;
  }
}

/** The mastery key a task trains here and now; felling keys on the ground under foot. */
export function masteryKey(state: GameState, world: World, id: TaskId, arg?: string): string | null {
  switch (id) {
    case "chop": return `chop:${hereTerrain(state, world)}`;
    case "sticks": case "bark": case "split": case "berries": case "stone":
    case "fish": case "repair": case "sharpen": case "light":
      return id;
    case "hunt": return `hunt:${arg}`;
    case "build": return arg === "snare" ? "snare" : `build:${arg}`;
    case "craft": return `craft:${arg}`;
    case "cook": return `cook:${arg ?? "rawMeat"}`;
    default: return null;
  }
}
```

- [ ] **Step 5: Fresh runs and old saves**

In `src/sim/newgame.ts`, import `newSkills` from `./skills` and add `skills: newSkills(),` after `stats: { ... },`.

In `src/sim/save.ts`, import `newSkills` from `./skills` and add to `fillDefaults`, before the region loop:

```ts
  state.skills ??= newSkills();
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/skills.test.ts && npx tsc --noEmit`
Expected: PASS, 5 tests. `tsc` clean. If `tsc` complains about `hereTerrain` returning a terrain that is not spruce, pine or birch, that is fine: the key is a string.

- [ ] **Step 7: Run the whole suite and commit**

Run: `npx vitest run`
Expected: all pass (the round-trip save test still passes because `skills` is part of the state).

```bash
git add src/sim/skills.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts tests/skills.test.ts
git commit -m "feat(survidle): six skills with levels in hours, mastery keys and pools, in the state"
```

---

### Task 2: Training every minute

**Files:**
- Modify: `src/sim/skills.ts` (add `train`)
- Modify: `src/sim/tasks.ts:487-508` (`stepTask`)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `train(state, world, dt)`, reading `state.task`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, adding to the imports `Rng` from `../src/rng`, `calendar` from `../src/sim/calendar`, `addItem` from `../src/sim/inventory`, `regionState` from `../src/sim/regionstate`, `startTask, stepTask, stopTask` from `../src/sim/tasks`, and `skillLevel, masteryOf` from `../src/sim/skills`:

```ts
type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number) {
  const rng = new Rng(1);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("training", () => {
  it("an hour of felling is an hour of Woodcraft, of that tree kind, and of the pool", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    startTask(state, world, cal, "chop");
    run(g, 30);
    expect(state.skills.woodcraft.xp).toBe(30);
    expect(state.skills.woodcraft.mastery[key]).toBe(30);
    expect(state.skills.woodcraft.pool).toBe(30);
    expect(state.skills.hunting.xp).toBe(0);
  });

  it("walking trains nothing", () => {
    const g = newGame(3);
    const { state, world } = g;
    startTask(state, world, cal, "walk", "spot:forest");
    run(g, 5);
    for (const id of SKILL_IDS) expect(state.skills[id].xp).toBe(0);
  });

  it("a felling set aside keeps the minutes it earned", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 20);
    stopTask(state, world);
    expect(state.skills.woodcraft.xp).toBe(20);
  });

  it("logs the level-up as the hours cross", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.skills.woodcraft.xp = 119;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 2);
    expect(skillLevel(state, "woodcraft")).toBe(2);
    expect(state.log.filter((e) => e.text === "Woodcraft 2.")).toHaveLength(1);
  });

  it("the pool stops at capacity", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.skills.fishing.pool = 6000 - 1;
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    startTask(state, world, cal, "fish");
    run(g, 5);
    expect(state.skills.fishing.pool).toBe(6000);
  });
});
```

If the seed 3 start region has no shore spot, the fishing test cannot place the player; pick a seed whose start has one by checking `regionAt(world, world.start).spots` in a scratch script, and use that seed for that one test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: the five training tests FAIL with xp 0 (nothing trains yet).

- [ ] **Step 3: Add `train` to `src/sim/skills.ts`**

Add `import { log } from "./log";` and:

```ts
/** One minute at the current task: skill, mastery and pool each gain it. Called from stepTask. */
export function train(state: GameState, world: World, dt: number): void {
  const t = state.task;
  if (!t) return;
  const skill = skillOf(t.id, t.arg);
  if (!skill) return;
  const key = masteryKey(state, world, t.id, t.arg);
  if (!key) return;
  const s = state.skills[skill];
  const before = level(s.xp);
  s.xp += dt;
  const after = level(s.xp);
  if (after > before) log(state, `${SKILL_NAMES[skill]} ${after}.`, "good");
  s.mastery[key] = (s.mastery[key] ?? 0) + dt;
  s.pool = Math.min(poolCapacity(skill), s.pool + dt);
}
```

- [ ] **Step 4: Call it from `stepTask`**

In `src/sim/tasks.ts`, import `train` from `./skills`, and in `stepTask` change:

```ts
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state) : 1;
  t.progress += dt * pace;
```

to:

```ts
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state) : 1;
  train(state, world, dt);
  t.progress += dt * pace;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/skills.test.ts && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/skills.ts src/sim/tasks.ts tests/skills.test.ts
git commit -m "feat(survidle): every minute at a task trains its skill, its mastery and its pool"
```

---

### Task 3: Effects of level, mastery and pool on speed, odds and wear

**Files:**
- Modify: `src/sim/skills.ts` (add `speedFactor`, `wearFactor`, `oddsFactor`, `RECOMMENDED`, `gap`)
- Modify: `src/sim/player.ts:83-90` (`workSpeed`)
- Modify: `src/sim/tasks.ts` (`huntOdds` signature and its four call sites; `wearTool` calls in `complete`)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Consumes: Task 1 lookups.
- Produces: `speedFactor(state, world, id, arg?)`, `wearFactor(state, world, id, arg?)`, `oddsFactor(state, world, species)`, `gap(state, key)`, `RECOMMENDED: Record<string, { skill: SkillId; level: number }>`. `huntOdds(state, world, cal, density, species)` replaces `huntOdds(state, cal, density, def)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, importing `huntOdds` from `../src/sim/tasks`, `workSpeed` from `../src/sim/player`, `tool` from `../src/sim/inventory`, `ANIMALS` from `../src/sim/items`, `regionDensity` from `../src/sim/animals`, and `levelMinutes, gap, speedFactor` from `../src/sim/skills`:

```ts
describe("effects", () => {
  it("Woodcraft 11 fells 10% faster than Woodcraft 1", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const slow = workSpeed(state, world);
    state.skills.woodcraft.xp = levelMinutes(11);
    expect(workSpeed(state, world)).toBeCloseTo(slow * 1.1, 6);
  });

  it("Hunting 11 has 10% better odds; Fishing reads its own skill", () => {
    const { state, world } = newGame(3);
    const d = regionDensity(state, world, state.player.region, "hare", cal);
    const base = huntOdds(state, world, cal, d, "hare");
    state.skills.hunting.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, d, "hare")).toBeCloseTo(base * 1.1, 6);
    const df = regionDensity(state, world, state.player.region, "fish", cal);
    const fish = huntOdds(state, world, cal, df, "fish");
    state.skills.fishing.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, df, "fish")).toBeCloseTo(fish * 1.1, 6);
  });

  it("Crafting 11 wears the needle 10% less", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 2);
    for (const g2 of state.player.clothing) g2.durability = 50;
    state.skills.crafting.xp = levelMinutes(11);
    startTask(state, world, cal, "repair");
    run(g, 400);
    expect(state.task).toBeNull();
    // Mending wears the needle by 2 at Crafting 1; 1.8 here.
    expect(tool(state.player, "needle")!.durability).toBeCloseTo(98.2, 6);
  });

  it("mastery adds a quarter percent per level on that action alone", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(41);
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    expect(speedFactor(state, world, "sticks")).toBeCloseTo(1, 6);
  });

  it("pool checkpoints: 10% gives x1.05, 50% replaces it with x1.10, 25% halves wear, 95% ends it", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const cap = poolCapacity("woodcraft");
    state.skills.woodcraft.pool = cap * 0.1;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.05, 6);
    state.skills.woodcraft.pool = cap * 0.5;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    state.skills.woodcraft.pool = cap * 0.25;
    expect(wearFactor(state, world, "chop")).toBeCloseTo(0.5, 6);
    state.skills.woodcraft.pool = cap * 0.95;
    expect(wearFactor(state, world, "chop")).toBe(0);
  });
});

describe("soft gates", () => {
  it("elk at Hunting 1 is one try in 128 of the base odds", () => {
    const { state, world } = newGame(3);
    expect(gap(state, "hunt:elk")).toBe(7);
    const d = regionDensity(state, world, state.player.region, "elk", cal);
    state.skills.hunting.xp = levelMinutes(8);
    const atLevel = huntOdds(state, world, cal, d, "elk");
    state.skills.hunting.xp = 0;
    expect(huntOdds(state, world, cal, d, "elk")).toBeCloseTo((atLevel / 1.07) / 128, 9);
  });

  it("a cabin at Building 4 goes at 1 / 1.3^6 of the pace", () => {
    const { state, world } = newGame(3);
    state.skills.building.xp = levelMinutes(4);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.03 / 1.3 ** 6, 6);
    state.skills.building.xp = levelMinutes(10);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.09, 6);
  });
});
```

Add `wearFactor` to the skills import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL. `workSpeed` takes one argument today; `huntOdds` has the old signature; `speedFactor`, `wearFactor`, `gap` do not exist.

- [ ] **Step 3: Add the multipliers to `src/sim/skills.ts`**

```ts
/** Recommended levels. Under them the odds are punished; over them nothing extra. */
export const RECOMMENDED: Record<string, { skill: SkillId; level: number }> = {
  "hunt:deer": { skill: "hunting", level: 4 },
  "hunt:elk": { skill: "hunting", level: 8 },
  "craft:bow": { skill: "crafting", level: 5 },
  "craft:hideBlanket": { skill: "crafting", level: 6 },
  "craft:hideCoat": { skill: "crafting", level: 8 },
  "craft:hideTrousers": { skill: "crafting", level: 8 },
  "craft:hideBoots": { skill: "crafting", level: 8 },
  "build:cabin": { skill: "building", level: 10 },
};

/** Levels short of the recommendation for a mastery key; 0 when there is none or you are there. */
export function gap(state: GameState, key: string): number {
  const rec = RECOMMENDED[key];
  if (!rec) return 0;
  return Math.max(0, rec.level - skillLevel(state, rec.skill));
}

function skillBonus(state: GameState, skill: SkillId): number {
  return 0.01 * (skillLevel(state, skill) - 1);
}

/** Work pace multiplier for a task: skill, mastery, pool, and the build slowdown under level. */
export function speedFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  const key = masteryKey(state, world, id, arg);
  let f = 1 + skillBonus(state, skill);
  if (key) f *= 1 + 0.0025 * (masteryOf(state, skill, key) - 1);
  const share = poolShare(state, skill);
  if (share >= 0.5) f *= 1.1;
  else if (share >= 0.1) f *= 1.05;
  if (id === "build" && key) f /= 1.3 ** gap(state, key);
  return f;
}

/** Tool wear multiplier for a task: Crafting's level, and the pool's 25% and 95% perks. */
export function wearFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  let f = skill === "crafting" ? 1 - skillBonus(state, skill) : 1;
  const share = poolShare(state, skill);
  if (share >= 0.95) f = 0;
  else if (share >= 0.25) f *= 0.5;
  void world;
  return f;
}

/** Odds multiplier for a hunt or a cast: the skill's level, halved per level short of the recommendation. */
export function oddsFactor(state: GameState, species: string): number {
  const skill: SkillId = species === "fish" ? "fishing" : "hunting";
  const key = species === "fish" ? "fish" : `hunt:${species}`;
  return (1 + skillBonus(state, skill)) * 0.5 ** gap(state, key);
}
```

Remove the `void world;` line and the `world` parameter from `wearFactor` only if Task 5 does not need it; Task 5 does (the axe on a mastered tree kind), so keep the parameter and the `void` until then.

- [ ] **Step 4: Thread the factors into the sim**

In `src/sim/player.ts`, add `import type { World } from "../world/gen";` if not present (it is), import `speedFactor` from `./skills`, and change `workSpeed`:

```ts
/** Work goes slower when exhausted or hurt, and faster with practice. */
export function workSpeed(state: GameState, world: World): number {
  const p = state.player;
  let f = 1;
  if (p.energy < 20) f *= 0.5;
  if (p.injured > 0) f *= 0.7;
  const t = state.task;
  if (t) f *= speedFactor(state, world, t.id, t.arg);
  return f;
}
```

In `src/sim/tasks.ts`:

1. `stepTask`: `workSpeed(state)` becomes `workSpeed(state, world)`.
2. `huntOdds` becomes:

```ts
export function huntOdds(state: GameState, world: World, cal: Calendar, density: number, species: Species): number {
  const def = ANIMALS[species];
  let odds = density * def.odds * oddsFactor(state, species);
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  return Math.min(0.95, odds);
}
```

   Import `oddsFactor, wearFactor` from `./skills`. Update the four call sites: in `check` for `hunt` (`huntOdds(state, world, cal, d, s)`) and `fish` (`huntOdds(state, world, cal, d, "fish")`), and in `complete` for `hunt` and `fish` the same. `void world` in `wearFactor` stays until Task 5.
3. Wear calls in `complete`:

```ts
      if (wearTool(p, "axe", wearFactor(state, world, "chop"))) log(state, "The axe head splits on the last stroke. It is done for.", "bad");
```

   and likewise `wearTool(p, "bow", wearFactor(state, world, "hunt", s))`, `wearTool(p, "fishingSpear", wearFactor(state, world, "fish"))`, `wearTool(p, rec.tool, wearFactor(state, world, "craft", rid))`, `wearTool(p, "needle", 2 * wearFactor(state, world, "repair"))`, `wearTool(p, "fireDrill", 2 * wearFactor(state, world, "light"))`.

`wearTool` already subtracts a fractional `n`; with `n = 0` it subtracts nothing and returns false.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. If `tests/animals.test.ts` or `tests/tasks.test.ts` call `workSpeed` or `huntOdds` with the old shape, update those calls to the new signatures; the expectations do not change because every new factor is 1 at level 1.

- [ ] **Step 6: Commit**

```bash
git add src/sim/skills.ts src/sim/player.ts src/sim/tasks.ts tests/skills.test.ts tests/tasks.test.ts tests/animals.test.ts
git commit -m "feat(survidle): levels, mastery and pools speed work, raise odds and spare tools; soft gates halve odds per level short"
```

---

### Task 4: Backfire under level: injury on hunts, spoiled crafts

**Files:**
- Modify: `src/sim/skills.ts` (add `injuryChance`, `craftSuccess`)
- Modify: `src/sim/tasks.ts` (`complete` for `hunt` and `craft`)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `injuryChance(state, species)`, `craftSuccess(state, recipe)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, importing `injuryChance, craftSuccess` from `../src/sim/skills` and `qty, hasTool` from `../src/sim/inventory`:

```ts
describe("backfire under level", () => {
  it("elk at Hunting 1 hurts you 85% of the time; deer at Hunting 2, 20%", () => {
    const { state } = newGame(3);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.85, 9);
    state.skills.hunting.xp = levelMinutes(2);
    expect(injuryChance(state, "deer")).toBeCloseTo(0.2, 9);
    state.skills.hunting.xp = levelMinutes(8);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.15, 9);
    expect(injuryChance(state, "hare")).toBe(0);
  });

  it("a bow at Crafting 1 comes out one time in 16; a failure spoils half the materials", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 / 16, 9);
    state.player.tools.push({ id: "knife", durability: 100 });
    addItem(state.player.pack, "log", 1);
    addItem(state.player.pack, "cordage", 3);
    startTask(state, world, cal, "craft", "bow");
    // Seed 1's first roll in run() is above 1/16, so this attempt fails.
    run(g, 400);
    expect(state.task).toBeNull();
    expect(hasTool(state.player, "bow")).toBe(false);
    expect(qty(state.player.pack, "log")).toBe(0);
    expect(qty(state.player.pack, "cordage")).toBe(2);
    expect(state.log.some((e) => e.text.startsWith("The bow is spoiled"))).toBe(true);
  });
});
```

If the seeded roll happens to succeed, assert the opposite branch instead, or set `state.skills.crafting.xp = 0` and add cordage so a second attempt can run; the point is one deterministic failure. Check `Rng` in `src/rng.ts` for how `chance` draws so the comment stays true.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL, `injuryChance` and `craftSuccess` are not exported.

- [ ] **Step 3: Add the two functions to `src/sim/skills.ts`**

Import `ANIMALS, type Recipe, RECIPES` from `./items` and `Species`, `RecipeId` from `./types`:

```ts
/** Chance the animal hurts you: its own, plus ten points per level short. */
export function injuryChance(state: GameState, species: Species): number {
  return Math.min(1, ANIMALS[species].injury + 0.1 * gap(state, `hunt:${species}`));
}

/** Chance a piece comes out: halved per level short of the recommendation. */
export function craftSuccess(state: GameState, recipe: RecipeId): number {
  return 0.5 ** gap(state, `craft:${recipe}`);
}

/** Half of each need, for a spoiled attempt: counts rounded up, kilograms exact. */
export function spoiledNeeds(needs: Need[]): Need[] {
  return needs.map((n) => ({ ...n, qty: KG_ITEMS.has(n.item) ? n.qty / 2 : Math.ceil(n.qty / 2) }));
}
```

Kilogram items are the ones in `KG_ITEMS` (import it and `type Need` from `./items`); a count of 1 stays 1, since `consume` cannot take half a stick.

- [ ] **Step 4: Use them in `complete`**

In `src/sim/tasks.ts`, `complete`, case `hunt`: replace

```ts
        if (def.injury && rng.chance(def.injury)) {
```

with

```ts
        const injury = injuryChance(state, s);
        if (injury > 0 && rng.chance(injury)) {
```

Case `craft`: after the `canConsume` guard and before `consume(invs, rec.needs)`, insert:

```ts
      if (!rng.chance(craftSuccess(state, rid))) {
        const lost = spoiledNeeds(rec.needs);
        consume(invs, lost);
        if (rec.tool) wearTool(p, rec.tool, wearFactor(state, world, "craft", rid));
        log(state, `The ${rec.name} is spoiled: ${needsList(lost)} wasted.`, "bad");
        return;
      }
```

Import `craftSuccess, injuryChance, spoiledNeeds` from `./skills`. `needsList` is the existing helper in the same file.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. The existing hunt tests use hare and grouse at level 1, which have no recommendation, so their injury chance is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/sim/skills.ts src/sim/tasks.ts tests/skills.test.ts
git commit -m "feat(survidle): trying above your level can hurt you or spoil the piece"
```

---

### Task 5: Mastery extras at 20 and 50

**Files:**
- Modify: `src/sim/skills.ts` (add `EXTRAS`, `chopSticks`, `huntExtras`, `fishKg`, `effectiveNeeds`; extend `train` and `wearFactor`)
- Modify: `src/sim/tasks.ts` (`check` craft, `complete` for chop, hunt, fish, craft)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `EXTRAS: Record<string, { at20: string; at50: string }>`, `chopSticks(state, world)`, `huntExtras(state, species): { hideKg: number; bone: number; sinew: number; injuryFactor: number }`, `fishKg(state)`, `effectiveNeeds(state, recipe)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, importing `chopSticks, effectiveNeeds, EXTRAS, fishKg, huntExtras, wearFactor` (some already imported) from `../src/sim/skills` and `herePile` from `../src/sim/inventory`:

```ts
describe("mastery extras", () => {
  it("spruce felling at mastery 20 gives a fifth stick; at 50 the axe keeps its edge on spruce", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    expect(chopSticks(state, world)).toBe(4);
    state.skills.woodcraft.mastery[key] = masteryMinutes(20);
    expect(chopSticks(state, world)).toBe(5);
    expect(wearFactor(state, world, "chop")).toBe(1);
    state.skills.woodcraft.mastery[key] = masteryMinutes(50);
    expect(wearFactor(state, world, "chop")).toBe(0);
    startTask(state, world, cal, "chop");
    run(g, 200);
    expect(qty(state.player.pack, "stick")).toBe(5);
  });

  it("a hare at mastery 20 keeps its hide whole; at 50 a bone more", () => {
    const { state } = newGame(3);
    expect(huntExtras(state, "hare")).toEqual({ hideKg: 0.2, bone: 1, sinew: 0, injuryFactor: 1 });
    state.skills.hunting.mastery["hunt:hare"] = masteryMinutes(20);
    expect(huntExtras(state, "hare").hideKg).toBe(0.3);
    state.skills.hunting.mastery["hunt:hare"] = masteryMinutes(50);
    expect(huntExtras(state, "hare").bone).toBe(2);
  });

  it("deer and elk: a sinew more at 20, half the injury at 50", () => {
    const { state } = newGame(3);
    state.skills.hunting.xp = levelMinutes(8);
    state.skills.hunting.mastery["hunt:elk"] = masteryMinutes(20);
    expect(huntExtras(state, "elk").sinew).toBe(7);
    state.skills.hunting.mastery["hunt:elk"] = masteryMinutes(50);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.075, 9);
  });

  it("fish: 0.9 kg per catch at 20, 1.2 at 50", () => {
    const { state } = newGame(3);
    expect(fishKg(state)).toBeCloseTo(0.7, 9);
    state.skills.fishing.mastery.fish = masteryMinutes(20);
    expect(fishKg(state)).toBeCloseTo(0.9, 9);
    state.skills.fishing.mastery.fish = masteryMinutes(50);
    expect(fishKg(state)).toBeCloseTo(1.2, 9);
  });

  it("hide and fur recipes: one sinew fewer at 20, a tenth less hide at 50", () => {
    const { state } = newGame(3);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 6 }, { item: "sinew", qty: 2 }]);
    state.skills.crafting.mastery["craft:hideCoat"] = masteryMinutes(20);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 6 }, { item: "sinew", qty: 1 }]);
    state.skills.crafting.mastery["craft:hideCoat"] = masteryMinutes(50);
    expect(effectiveNeeds(state, "hideCoat")).toEqual([{ item: "hide", qty: 5.5 }, { item: "sinew", qty: 1 }]);
    state.skills.crafting.mastery["craft:furHat"] = masteryMinutes(20);
    // A need that drops to zero is left out rather than listed as 0.
    expect(effectiveNeeds(state, "furHat")).toEqual([{ item: "hide", qty: 1 }]);
    expect(effectiveNeeds(state, "cordage")).toEqual([{ item: "bark", qty: 3 }]);
  });

  it("crossing 20 logs the extra", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(20) - 1;
    startTask(state, world, cal, "chop");
    run(g, 2);
    expect(state.log.some((e) => e.text.includes("mastery 20") && e.text.includes(EXTRAS["chop:spruce"].at20))).toBe(true);
  });
});
```

The last test assumes the seed 3 forest spot is spruce; if `key` is `chop:pine` or `chop:birch`, use `EXTRAS[key]` in the expectation instead of the literal.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL, the functions are not exported.

- [ ] **Step 3: Add the extras to `src/sim/skills.ts`**

```ts
/** The concrete extras, at mastery 20 and 50, by key; a key not here is speed only. */
export const EXTRAS: Record<string, { at20: string; at50: string }> = {
  "chop:spruce": { at20: "an extra stick per tree", at50: "the axe keeps its edge on spruce" },
  "chop:pine": { at20: "an extra stick per tree", at50: "the axe keeps its edge on pine" },
  "chop:birch": { at20: "an extra stick per tree", at50: "the axe keeps its edge on birch" },
  "hunt:hare": { at20: "the hide comes off whole, 0.3 kg", at50: "a bone more" },
  "hunt:deer": { at20: "a sinew more", at50: "half the chance of a hurt" },
  "hunt:elk": { at20: "a sinew more", at50: "half the chance of a hurt" },
  fish: { at20: "0.9 kg per catch", at50: "1.2 kg per catch" },
  "craft:hideCoat": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideTrousers": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBoots": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBlanket": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:furHat": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:furMittens": { at20: "one sinew fewer", at50: "a tenth less hide" },
};

/** A readable name for a mastery key, for log lines: "Spruce felling", "Elk hunting", "Hide coat". */
export function keyName(key: string): string {
  const [kind, arg] = key.split(":");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (kind === "chop") return `${cap(arg)} felling`;
  if (kind === "hunt") return `${cap(ANIMALS[arg as Species].name)} hunting`;
  if (kind === "craft") return cap(RECIPES[arg as RecipeId].name);
  if (kind === "build") return cap(STRUCTURES[arg as StructureId].name);
  if (kind === "cook") return `Cooking ${ITEM_NAMES[arg as ItemId]}`;
  return cap(kind);
}

export function chopSticks(state: GameState, world: World): number {
  return 4 + (masteryOf(state, "woodcraft", masteryKey(state, world, "chop")!) >= 20 ? 1 : 0);
}

export function huntExtras(state: GameState, species: Species): { hideKg: number; bone: number; sinew: number; injuryFactor: number } {
  const def = ANIMALS[species];
  const m = masteryOf(state, "hunting", `hunt:${species}`);
  const out = { hideKg: def.hideKg, bone: def.bone, sinew: def.sinew, injuryFactor: 1 };
  if (species === "hare") {
    if (m >= 20) out.hideKg = 0.3;
    if (m >= 50) out.bone += 1;
  } else if (species === "deer" || species === "elk") {
    if (m >= 20) out.sinew += 1;
    if (m >= 50) out.injuryFactor = 0.5;
  }
  return out;
}

export function fishKg(state: GameState): number {
  const m = masteryOf(state, "fishing", "fish");
  return ANIMALS.fish.meatKg + (m >= 50 ? 0.5 : m >= 20 ? 0.2 : 0);
}

/** A recipe's needs after mastery: hide and fur pieces want one sinew fewer at 20 and a tenth less hide at 50. */
export function effectiveNeeds(state: GameState, recipe: RecipeId): Need[] {
  const rec = RECIPES[recipe];
  if (!EXTRAS[`craft:${recipe}`]) return rec.needs;
  const m = masteryOf(state, "crafting", `craft:${recipe}`);
  return rec.needs
    .map((n) => {
      if (n.item === "sinew" && m >= 20) return { ...n, qty: n.qty - 1 };
      if (n.item === "hide" && m >= 50) return { ...n, qty: Math.round((n.qty * 0.9) * 2) / 2 };
      return n;
    })
    .filter((n) => n.qty > 0);
}
```

Imports needed: `ANIMALS, ITEM_NAMES, type Need, RECIPES, STRUCTURES` from `./items`; `ItemId, RecipeId, Species, StructureId` from `./types`.

Change `injuryChance` to apply the mastery factor:

```ts
export function injuryChance(state: GameState, species: Species): number {
  const base = ANIMALS[species].injury + 0.1 * gap(state, `hunt:${species}`);
  return Math.min(1, base * huntExtras(state, species).injuryFactor);
}
```

Change `wearFactor` so a mastered tree kind spares the axe, and drop the `void world`:

```ts
export function wearFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  let f = skill === "crafting" ? 1 - skillBonus(state, skill) : 1;
  const share = poolShare(state, skill);
  if (share >= 0.95) f = 0;
  else if (share >= 0.25) f *= 0.5;
  if (id === "chop" && masteryOf(state, skill, masteryKey(state, world, id)!) >= 50) f = 0;
  return f;
}
```

Extend `train` to log an extra as it is reached. Replace the mastery line with:

```ts
  const mBefore = masteryLevel(s.mastery[key] ?? 0);
  s.mastery[key] = (s.mastery[key] ?? 0) + dt;
  const mAfter = masteryLevel(s.mastery[key]);
  const extra = EXTRAS[key];
  if (extra) {
    if (mBefore < 20 && mAfter >= 20) log(state, `${keyName(key)} mastery 20: ${extra.at20}.`, "good");
    if (mBefore < 50 && mAfter >= 50) log(state, `${keyName(key)} mastery 50: ${extra.at50}.`, "good");
  }
```

- [ ] **Step 4: Use the extras in `src/sim/tasks.ts`**

Import `chopSticks, effectiveNeeds, fishKg, huntExtras` from `./skills`.

- `check`, case `craft`: use `effectiveNeeds(state, arg as RecipeId)` in place of `rec.needs` for both the `needsList` detail and the `canConsume` check.
- `complete`, case `chop`: `produce(state, world, "stick", chopSticks(state, world));`
- `complete`, case `hunt`, inside the success branch: replace the three `def.hideKg`, `def.bone`, `def.sinew` lines with:

```ts
        const x = huntExtras(state, s);
        if (x.hideKg) produce(state, world, "hide", x.hideKg);
        if (x.bone) produce(state, world, "bone", x.bone);
        if (x.sinew) produce(state, world, "sinew", x.sinew);
```

- `complete`, case `fish`: `const kg = fishKg(state);` then `produce(state, world, "fish", kg);` and the log `A fish, ${kg.toFixed(1)} kg.`. In `check` case `fish`, the detail becomes `${fishKg(state).toFixed(1)} kg per catch; about ...`.
- `complete`, case `craft`: `const needs = effectiveNeeds(state, rid);` and use `needs` in the `canConsume` guard, the `consume`, and the `spoiledNeeds(needs)` call.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS. The existing "felling a tree" test in `tests/tasks.test.ts` still expects 4 sticks at mastery 1.

- [ ] **Step 6: Commit**

```bash
git add src/sim/skills.ts src/sim/tasks.ts tests/skills.test.ts
git commit -m "feat(survidle): mastery 20 and 50 give a stick, a whole hide, a sinew, a bigger fish, a spared tool"
```

---

### Task 6: Pool yield perks for Foraging and Fishing

**Files:**
- Modify: `src/sim/skills.ts` (add `yieldFactor`)
- Modify: `src/sim/tasks.ts` (`complete` for berries, stone, fish)
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `yieldFactor(state, skill)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, importing `yieldFactor`:

```ts
describe("pool yield perks", () => {
  it("Foraging and Fishing get x1.2 at 25% and x1.5 at 95%; other skills stay at 1", () => {
    const { state } = newGame(3);
    expect(yieldFactor(state, "foraging")).toBe(1);
    state.skills.foraging.pool = poolCapacity("foraging") * 0.25;
    expect(yieldFactor(state, "foraging")).toBe(1.2);
    state.skills.foraging.pool = poolCapacity("foraging") * 0.95;
    expect(yieldFactor(state, "foraging")).toBe(1.5);
    state.skills.woodcraft.pool = poolCapacity("woodcraft");
    expect(yieldFactor(state, "woodcraft")).toBe(1);
  });

  it("stone at a full pool is 5 per gather instead of 3, berries 1.5 kg instead of 1", () => {
    const { state } = newGame(3);
    state.skills.foraging.pool = poolCapacity("foraging");
    expect(Math.round(3 * yieldFactor(state, "foraging"))).toBe(5);
    expect(1 * yieldFactor(state, "foraging")).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL, `yieldFactor` is not exported.

- [ ] **Step 3: Add `yieldFactor` and use it**

In `src/sim/skills.ts`:

```ts
/** Foraging and Fishing have no tool to spare, so their pool perks are yield. */
export function yieldFactor(state: GameState, skill: SkillId): number {
  if (skill !== "foraging" && skill !== "fishing") return 1;
  const share = poolShare(state, skill);
  return share >= 0.95 ? 1.5 : share >= 0.25 ? 1.2 : 1;
}
```

In `src/sim/tasks.ts`, `complete`:

- `stone`: `produce(state, world, "stone", Math.round(3 * yieldFactor(state, "foraging")));`
- `berries`: `produce(state, world, "berries", 1 * yieldFactor(state, "foraging"));`
- `fish`: `const kg = fishKg(state) * yieldFactor(state, "fishing");`

Also in `check`, case `fish`, use the same product for the detail. Import `yieldFactor`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/skills.ts src/sim/tasks.ts tests/skills.test.ts
git commit -m "feat(survidle): a full Foraging or Fishing pool yields more"
```

---

### Task 7: Buttons show mastery and recommendations

**Files:**
- Modify: `src/sim/tasks.ts` (`TaskOption`, `availableTasks`)
- Modify: `src/ui/panels.ts:187-197` (`optHtml`)
- Modify: `src/style.css` (`.warn`, `.bar.mastery`)
- Test: `tests/ui.test.ts`, `tests/skills.test.ts`

**Interfaces:**
- Produces: on `TaskOption`, `mastery?: { level: number; share: number }` and `recommended?: { text: string; under: boolean }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/skills.test.ts`, importing `availableTasks` from `../src/sim/tasks`:

```ts
describe("options carry progression", () => {
  it("every trainable option has a mastery level and share; walks have none", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    state.skills.woodcraft.mastery[masteryKey(state, world, "chop")!] = masteryMinutes(3) + 7;
    const opts = availableTasks(state, world, cal);
    const chop = opts.find((o) => o.id === "chop")!;
    expect(chop.mastery!.level).toBe(3);
    expect(chop.mastery!.share).toBeCloseTo(7 / (masteryMinutes(4) - masteryMinutes(3)), 9);
    expect(opts.find((o) => o.id === "walk")!.mastery).toBeUndefined();
  });

  it("a recommendation reads on the button, and says when you are under it", () => {
    const { state, world } = newGame(3);
    const elk = availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "elk")!;
    expect(elk.recommended).toEqual({ text: "Hunting 8", under: true });
    expect(elk.detail).toContain("Hunting 8");
    const cabin = availableTasks(state, world, cal).find((o) => o.id === "build" && o.arg === "cabin")!;
    expect(cabin.detail).toContain("at Building 1 this takes 10.6x as long");
    state.player.tools.push({ id: "knife", durability: 100 });
    const bow = availableTasks(state, world, cal).find((o) => o.id === "craft" && o.arg === "bow")!;
    expect(bow.detail).toContain("6% chance it comes out");
    state.skills.hunting.xp = levelMinutes(8);
    expect(availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "elk")!.recommended!.under).toBe(false);
    expect(availableTasks(state, world, cal).find((o) => o.id === "hunt" && o.arg === "hare")!.recommended).toBeUndefined();
  });
});
```

Append to `tests/ui.test.ts`, inside the `reachability` describe (which has `html` for a fresh run):

```ts
  it("every option that trains carries a mastery bar; a hunt under level carries the warning", () => {
    expect(html).toMatch(/data-opt="chop:"[^]*?bar mastery/);
    expect(html).not.toMatch(/data-opt="walk:spot:forest"[^]*?bar mastery[^]*?data-opt="haul/);
    expect(html).toMatch(/data-opt="hunt:elk"[^]*?<small class="warn">Hunting 8<\/small>/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts tests/ui.test.ts`
Expected: FAIL, `mastery` and `recommended` are undefined and the markup is absent.

- [ ] **Step 3: Decorate options in `availableTasks`**

In `src/sim/tasks.ts`, extend `TaskOption`:

```ts
  /** Mastery of this action, and the share of the way to the next mastery level. */
  mastery?: { level: number; share: number };
  /** The recommended level, and whether you are under it. */
  recommended?: { text: string; under: boolean };
```

Add a helper below `availableTasks`:

```ts
/** Adds what practice says about an option: its mastery, and the level it is meant for. */
function withProgression(state: GameState, world: World, o: TaskOption): TaskOption {
  const skill = skillOf(o.id, o.arg);
  const key = skill ? masteryKey(state, world, o.id, o.arg) : null;
  if (!skill || !key) return o;
  const minutes = state.skills[skill].mastery[key] ?? 0;
  const m = masteryLevel(minutes);
  const span = masteryMinutes(m + 1) - masteryMinutes(m);
  const out: TaskOption = { ...o, mastery: { level: m, share: m >= MASTERY_CAP ? 1 : (minutes - masteryMinutes(m)) / span } };
  const rec = RECOMMENDED[key];
  if (!rec) return out;
  const g = gap(state, key);
  out.recommended = { text: `${SKILL_NAMES[rec.skill]} ${rec.level}`, under: g > 0 };
  const parts = [out.recommended.text];
  if (g > 0 && o.id === "craft") parts.push(`${Math.round(craftSuccess(state, o.arg as RecipeId) * 100)}% chance it comes out`);
  if (g > 0 && o.id === "build") parts.push(`at ${SKILL_NAMES.building} ${skillLevel(state, "building")} this takes ${(1.3 ** g).toFixed(1)}x as long`);
  out.detail = out.detail ? `${out.detail}; ${parts.join("; ")}` : parts.join("; ");
  return out;
}
```

Import `gap, MASTERY_CAP, masteryLevel, masteryMinutes, RECOMMENDED, SKILL_NAMES, skillLevel, craftSuccess` from `./skills` (add to the existing import). Change the end of `availableTasks` from `return out;` to `return out.map((o) => withProgression(state, world, o));`.

`1.3 ** 9` is 10.604, so "10.6x" at Building 1; `0.5 ** 4` is 0.0625, so "6% chance".

- [ ] **Step 4: Render in `optHtml`**

In `src/ui/panels.ts`, add a helper next to `durBar`:

```ts
function masteryBar(m: { level: number; share: number }): string {
  return `<div class="bar mastery" title="mastery ${m.level}"><div class="fill" style="width:${Math.round(m.share * 100)}%"></div><span class="lbl"><span>mastery ${m.level}</span></span></div>`;
}
```

Change `optHtml` so both branches carry the recommendation and the bar. The recommendation text is already inside `detail`; render it once more as a marked span only when under, so the colour finds it:

```ts
function optHtml(o: TaskOption): string {
  const arg = o.arg ?? "";
  const rec = o.recommended?.under ? `<small class="warn">${esc(o.recommended.text)}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  if (!o.ok) {
    return `<div class="opt off" data-opt="${o.id}:${esc(arg)}"><span class="act">${esc(o.label)}${rec}<small>${esc(o.why)}${o.detail ? ` - ${esc(o.detail)}` : ""}</small>${bar}</span></div>`;
  }
  const time = `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}`;
  const rep = o.repeatable
    ? `<button class="rep" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}" data-repeat="1" title="Keep doing it until it cannot continue">loop</button>`
    : "";
  return `<div class="opt" data-opt="${o.id}:${esc(arg)}"><button class="act" data-act="task" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${time}${o.detail ? `; ${esc(o.detail)}` : ""}</small>${bar}</button>${rep}</div>`;
}
```

- [ ] **Step 5: Style**

In `src/style.css`, after `.bar.low .fill { ... }`:

```css
.bar.mastery { height: 10px; margin: 4px 0 0; }
.bar.mastery .fill { background: #4b6a8f; }
.bar.mastery .lbl { font-size: 9px; line-height: 8px; }
.warn { color: var(--bad); margin-left: 6px; }
```

Check that `.opt .act small` rules do not force the `.warn` small onto its own line; if they do (look for `display: block` on `small` under `.opt`), give `.warn` `display: inline`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sim/tasks.ts src/ui/panels.ts src/style.css tests/skills.test.ts tests/ui.test.ts
git commit -m "feat(survidle): every button shows its mastery, and the level it is meant for"
```

---

### Task 8: The Skills panel and the death screen

**Files:**
- Modify: `src/ui/panels.ts` (add `skillsHtml`; extend `deathHtml`)
- Modify: `index.html:13` (add the section)
- Modify: `src/main.ts:68` (render it)
- Modify: `src/style.css` (pool ticks)
- Test: `tests/ui.test.ts`

**Interfaces:**
- Produces: `skillsHtml(state)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui.test.ts`, in the `panels` describe (add `skillsHtml` to the panels import, and `levelMinutes, poolCapacity` from `../src/sim/skills`):

```ts
  it("skills panel lists six rows with level, hours to next, pool share and active perks", () => {
    const { state, world } = newGame(21);
    state.skills.woodcraft.xp = levelMinutes(7) + 60;
    state.skills.woodcraft.pool = poolCapacity("woodcraft") * 0.3;
    const h = skillsHtml(state);
    expect(h).toContain("Woodcraft");
    expect(h).toContain("Fishing");
    expect((h.match(/class="skill"/g) ?? []).length).toBe(6);
    // Level 8 needs 98 h; level 7 had 72; one hour in, 25 h to go.
    expect(h).toContain("25 h to 8");
    expect(h).toContain("pool 30%");
    expect(h).toContain("half the tool wear");
    expect(h).toContain("5% faster");
    void world;
  });

  it("death screen names the best skill", () => {
    const { state, world } = newGame(21);
    state.skills.hunting.xp = levelMinutes(12);
    state.dead = { cause: "froze", minute: state.minute };
    setPanel("overlay", deathHtml(state, world, calendar(state.minute)));
    expect(document.querySelector("#overlay")!.textContent).toContain("Hunting 12");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL, `skillsHtml` is not exported.

- [ ] **Step 3: Write `skillsHtml` and extend `deathHtml`**

In `src/ui/panels.ts`, import `level, levelMinutes, poolShare, SKILL_CAP, SKILL_IDS, SKILL_NAMES, skillLevel, yieldFactor` from `../sim/skills` and add:

```ts
/** What the pool is giving right now, in words. */
function poolPerks(share: number, skill: SkillId): string[] {
  const out: string[] = [];
  if (share >= 0.5) out.push("10% faster");
  else if (share >= 0.1) out.push("5% faster");
  const yieldSkill = skill === "foraging" || skill === "fishing";
  if (share >= 0.95) out.push(yieldSkill ? "half again the yield" : "no tool wear");
  else if (share >= 0.25) out.push(yieldSkill ? "a fifth more yield" : "half the tool wear");
  return out;
}

export function skillsHtml(state: GameState): string {
  const rows = SKILL_IDS.map((id) => {
    const s = state.skills[id];
    const l = level(s.xp);
    const next = l >= SKILL_CAP ? null : levelMinutes(l + 1);
    const from = levelMinutes(l);
    const share = next ? (s.xp - from) / (next - from) : 1;
    const toNext = next ? `${fmtDuration(next - s.xp)} to ${l + 1}` : "at the cap";
    const pool = poolShare(state, id);
    const perks = poolPerks(pool, id);
    return `<div class="skill"><div class="line"><b>${SKILL_NAMES[id]}</b> <span class="lvl">${l}</span><span class="r">${toNext}</span></div>
<div class="bar dur"><div class="fill" style="width:${Math.round(share * 100)}%"></div></div>
<div class="bar pool"><div class="fill" style="width:${Math.round(pool * 100)}%"></div><i style="left:10%"></i><i style="left:25%"></i><i style="left:50%"></i><i style="left:95%"></i><span class="lbl"><span>pool ${Math.round(pool * 100)}%</span></span></div>
${perks.length ? `<div class="good"><small>${perks.join(", ")}</small></div>` : ""}</div>`;
  });
  return `<h2>Skills</h2>${rows.join("")}`;
}
```

`fmtDuration` is already imported from `../units`; check it prints minutes as `25 h` for 1500 minutes (it prints `1 h 40 min` for 100 in the task bar, so 1500 gives `25 h`). Import `type SkillId` from `../sim/types`.

In `deathHtml`, after the stats paragraph add:

```ts
<p>${bestSkill(state)}</p>
```

with, near the other helpers:

```ts
function bestSkill(state: GameState): string {
  const best = SKILL_IDS.map((id) => ({ id, l: skillLevel(state, id) })).sort((a, b) => b.l - a.l)[0];
  return `Best skill: ${SKILL_NAMES[best.id]} ${best.l}.`;
}
```

- [ ] **Step 4: Mount the panel**

In `index.html`, after `<section id="gear" class="panel"></section>`:

```html
        <section id="skills" class="panel"></section>
```

In `src/main.ts`, after `setPanel("gear", gearHtml(state));`:

```ts
  setPanel("skills", skillsHtml(state));
```

and add `skillsHtml` to the import from `./ui/panels`.

In `src/style.css`, after the mastery rules:

```css
.skill { margin: 6px 0 10px; }
.skill .lvl { color: var(--accent); font-weight: bold; margin-left: 4px; }
.skill .r { float: right; color: var(--dim); font-size: 12px; }
.bar.pool { height: 10px; margin: 2px 0 2px; }
.bar.pool .fill { background: #8a6a2f; }
.bar.pool i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
.bar.pool .lbl { font-size: 9px; line-height: 8px; }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, build clean. The `panels` describe's `beforeEach` builds its own DOM; `skillsHtml` is called directly, so no `#skills` element is needed there.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels.ts src/main.ts index.html src/style.css tests/ui.test.ts
git commit -m "feat(survidle): a Skills panel with level, hours to next, pool and perks; the death screen names the best skill"
```

---

### Task 9: Docs, browser pass, wrap-up

**Files:**
- Modify: `docs/README.md` (a Skills bullet under "How it plays", and the "Where the numbers live" list)
- Modify: `docs/superpowers/specs/2026-09-02-survidle-design.md` (one line pointing at the skills spec, under the opening paragraph)

- [ ] **Step 1: README**

Under "How it plays", after the Bedding bullet:

```markdown
- **Skills.** Every minute at a task is a minute of practice in one of six
  skills (Woodcraft, Foraging, Hunting, Fishing, Crafting, Building) and in
  that action's mastery. A level is hours behind the tool: 2 h to level 2,
  162 h to 10, 722 h to 20. Each level is 1% faster, and 1% better odds for
  hunting and fishing, 1% less tool wear for crafting. Mastery adds a
  quarter percent per level on that one action, with a concrete extra at
  20 and 50. Every mastery minute also fills the skill's pool; at 10, 25,
  50 and 95 percent it gives skill-wide perks. Gates are soft: a button
  says "Hunting 8" and stays live, but under it the odds halve per level
  short and an elk can hurt you; a craft under level can spoil the piece.
```

Under "Where the numbers live":

```markdown
- `src/sim/skills.ts`: the level curves, recommended levels, mastery extras and pool perks.
```

In the design spec, after its opening paragraph, add:

```markdown
Skills, mastery and pools are specified in `2026-09-02-survidle-skills-design.md`.
```

- [ ] **Step 2: Browser pass**

Start the dev server from `08-survidle` (`npm run dev`; read the port from its output, 5173 may be taken). If the Chrome extension is connected use it; otherwise the headless CDP fallback in the memory note `headless-chrome-cdp-fallback` (write a `launch.sh` and a `cdp.mjs` in the scratchpad; the Bash guard in a worktree session refuses heredocs and paths with spaces). Open `?seed=7` and check:

1. The Skills panel shows six rows at level 1, "2 h to 2", "pool 0%".
2. Gather tab: "Fell a tree" carries a "mastery 1" bar. Hunt tab: "Hunt elk" shows "Hunting 8" in red and a small percentage.
3. Give 12 sticks, walk to the forest, fell a tree through the button, advance with `survidle.advance(15)` in a loop until the task ends; the Woodcraft row's hours to next drop and its pool rises.
4. Set `survidle.state.skills.woodcraft.xp = 119`, fell again; the log shows "Woodcraft 2." in green and the row reads level 2.
5. Set `survidle.state.skills.building.xp` to level 10's minutes and check the cabin button no longer carries the warning.
6. Screenshot the left column and the Do panel; the mastery bar must not push the loop button out of line.

Stop the server and your own Chrome (kill only the process with your scratchpad profile path).

- [ ] **Step 3: Full gate and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build` and from the repo root `npx biome lint 08-survidle/src 08-survidle/tests`.
Expected: all clean.

```bash
git add docs/README.md docs/superpowers/specs/2026-09-02-survidle-design.md
git commit -m "docs(survidle): skills, mastery and pools in the README"
```

Report: what was built, the browser observations, and the two numbers to watch in play (how fast the first levels come, and whether an elk at Hunting 3 feels like a gamble or a wall).
