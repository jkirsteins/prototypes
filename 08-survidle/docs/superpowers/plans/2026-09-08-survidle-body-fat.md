# The body's fat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fat cap with a floor, a settling range and an asymmetric appetite, so a survivor can starve at a real boundary and fatten in a good autumn.

**Architecture:** Four landmarks derived per body from lean mass and sex replace `fatFull`. `starvation()` re-bases onto the lower landmark so a lean survivor is not counted as starved. `autoEat`'s single threshold splits into a hunger line (when eating begins) and a satiety target (when it stops), both functions of the reserve, responding hard below the lower landmark and gently above the upper one. Fat joins body mass, and a sparse `ON_THE_FEET` table says which tasks pay for carrying it.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-body-fat-design.md`

## Global Constraints

- **Run from `08-survidle/`.** `npm test` must pass before every commit; `npx tsc --noEmit` must be clean.
- **Never `git add -A`.** Stage explicit paths under `08-survidle/`. Other sessions work in this repo concurrently.
- **Comments explain, never chronicle.** No dates, no "changed from", no before/after in code comments.
- **No magic numbers.** Every constant carries a comment saying what it represents. The landmark fractions are *game parameters* and their comment must say so - they must not claim to be measured human constants.
- **Balance readings are measured, never assumed.** `npm run reference` (April), `npm run year`, `npm run december` are the instruments. Never withdraw a correct rule to keep a gate green.
- **A fresh worktree needs `npm install` at the worktree root** (`.claude/worktrees/bodyfat`), not only in `08-survidle`, or the pre-commit hook cannot find biome.
- **`FAT_KCAL_PER_KG = 9000`** (`src/sim/player.ts:97`) is the one conversion between the fat reserve's kilocalories and kilograms. Never inline 9000.

## Landmark starting values

These are the values Task 1 introduces. **They are a starting point for the calibration in Task 12, not findings.** Body-fat shares of total mass:

| | floor | lower | typical | upper |
|---|---|---|---|---|
| male | 4% | 8% | 14% | 20% |
| female | 11% | 15% | 24% | 33% |

Median total mass at `typical`: male 72 kg, female 62 kg. Both sexes sit at exactly 50% of their own `lower`..`upper` span. A median male at `typical` weighs 72.00 kg, which is today's `MEDIAN_MASS_KG`, so the reference body's `baseBurn` is unchanged by the mass split.

Projected consequence, for Task 12 to confirm or reject: usable reserve (`typical` down to `floor`) is 67,500 kcal male and 81,506 kcal female, a ratio of 1.21x; because burn scales with mass, fasting survival is about **1.40x** in a woman's favour. That equals the `build` axis's own span and sits at the edge of the design goal that sex read as flavour. If Task 12's readings confirm it, narrowing the gap is a landmark change, not a mechanism change.

---

### Task 1: The four landmarks

**Files:**
- Modify: `src/sim/person.ts`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface FatLandmarks { floor: number; lower: number; typical: number; upper: number }` and `fatLandmarks(p: Person): FatLandmarks`, all four in kilocalories. Also `Derived.leanKg: number`. Exported from `src/sim/person.ts`.

- [ ] **Step 1: Write the failing test**

Add to `tests/fat.test.ts`:

```ts
describe("the fat landmarks", () => {
  it("are strictly ordered for every build and both sexes", () => {
    for (const sex of ["m", "f"] as const) {
      for (const build of [-2, -1, 0, 1, 2] as const) {
        const p: Person = { sex, axes: { strength: 0, build, hands: 0, eyes: 0 }, quirks: [], face: 0 };
        const l = fatLandmarks(p);
        expect(l.floor).toBeGreaterThan(0);
        expect(l.lower).toBeGreaterThan(l.floor);
        expect(l.typical).toBeGreaterThan(l.lower);
        expect(l.upper).toBeGreaterThan(l.typical);
      }
    }
  });

  it("puts a woman's floor at a larger share of her mass than a man's", () => {
    const share = (sex: "m" | "f") => {
      const p: Person = { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
      const l = fatLandmarks(p);
      const d = derived(p);
      const floorKg = l.floor / FAT_KCAL_PER_KG;
      return floorKg / (d.leanKg + floorKg);
    };
    expect(share("f")).toBeGreaterThan(share("m") * 2);
  });

  it("stands both sexes at the same place in their own settling zone", () => {
    const place = (sex: "m" | "f") => {
      const l = fatLandmarks({ sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 });
      return (l.typical - l.lower) / (l.upper - l.lower);
    };
    expect(place("f")).toBeCloseTo(place("m"), 2);
  });

  it("weighs a median man at his typical reserve at the reference mass", () => {
    const p: Person = { sex: "m", axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
    const l = fatLandmarks(p);
    expect(derived(p).leanKg + l.typical / FAT_KCAL_PER_KG).toBeCloseTo(MEDIAN_MASS_KG, 1);
  });
});
```

Imports needed at the top of `tests/fat.test.ts`: `derived`, `fatLandmarks`, `MEDIAN_MASS_KG` from `../src/sim/person`, `FAT_KCAL_PER_KG` from `../src/sim/player`, and `type Person` from `../src/sim/types`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "fat landmarks"`
Expected: FAIL - `fatLandmarks` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/person.ts`, add above `derived()`:

```ts
/**
 * Median total mass at the typical reserve, in kilos, by sex. The male figure
 * is MEDIAN_MASS_KG, so a median man at his typical reserve weighs what the
 * burn equations have always been scaled against.
 */
const MEDIAN_TOTAL_KG: Record<Sex, number> = { m: MEDIAN_MASS_KG, f: 62 };

/**
 * The four levels the fat reserve is read against, as shares of total body
 * mass. Game parameters, not measured human constants: where a real body's
 * intervention points sit varies too much between individuals to assert, so
 * these are placed to give the play the design wants and are settled by the
 * balance runs. Ordered floor < lower < typical < upper.
 *
 * floor is essential fat, the reserve that is structure rather than fuel, and
 * the boundary a body dies at. lower is where starvation begins to tell.
 * typical is where a survivor lands and the middle of the range fat drifts
 * in. upper is where appetite starts to argue back - no ceiling follows it.
 *
 * A woman's floor is a much larger share than a man's, which is the one thing
 * here taken from physiology as a shape rather than a value.
 */
const FAT_SHARES: Record<Sex, { floor: number; lower: number; typical: number; upper: number }> = {
  m: { floor: 0.04, lower: 0.08, typical: 0.14, upper: 0.2 },
  f: { floor: 0.11, lower: 0.15, typical: 0.24, upper: 0.33 },
};

export interface FatLandmarks {
  /** Death: essential fat, in kcal. */
  floor: number;
  /** starvation() is 1 here and 0 above, in kcal. */
  lower: number;
  /** Where a survivor lands, in kcal. */
  typical: number;
  /** Where appetite begins to argue back, in kcal. */
  upper: number;
}

/** Fat in kcal at a share of total mass, given lean mass: a share f of the total means f/(1-f) of the lean. */
function fatAt(leanKg: number, share: number): number {
  return leanKg * (share / (1 - share)) * FAT_KCAL_PER_KG;
}

/** The four levels this body's reserve is read against. */
export function fatLandmarks(p: Person): FatLandmarks {
  const lean = derived(p).leanKg;
  const s = FAT_SHARES[p.sex];
  return { floor: fatAt(lean, s.floor), lower: fatAt(lean, s.lower), typical: fatAt(lean, s.typical), upper: fatAt(lean, s.upper) };
}
```

In `Derived`, replace `massKg: number;` with:

```ts
  /** Lean mass in kilos: frame and muscle, without the fat reserve. */
  leanKg: number;
```

In `derived()`, replace the `const massKg = ...` line and the `massKg,` field with:

```ts
  const leanKg = MEDIAN_TOTAL_KG[p.sex] * (1 - FAT_SHARES[p.sex].typical) * (1 + (6 / MEDIAN_MASS_KG) * b);
```

and the field `leanKg,`. Keep `fatFull` and `baseBurn` as they are for now - Task 2 moves `baseBurn` and Task 5 deletes `fatFull`. `fatFull` and `baseBurn` currently read `massKg`; change both to read `leanKg` so the file compiles, which leaves a median male's numbers unchanged.

Add `FAT_KCAL_PER_KG` to the existing `./player` import, and `type Sex` to the `./types` import if not already present.

Fix `person.ts:145`'s evidence string, which reads `d.massKg`, to `${Math.round(d.leanKg)} kg lean`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/person.ts tests/fat.test.ts
git commit -m "feat(survidle): the reserve gets four landmarks and the body gets lean mass"
```

---

### Task 2: Total mass includes the reserve

**Files:**
- Modify: `src/sim/person.ts`, `src/sim/player.ts`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `Derived.leanKg` and `FatLandmarks` from Task 1.
- Produces: `bodyMassKg(state: GameState): number` and `massFactor(state: GameState): number` exported from `src/sim/person.ts`. `massFactor` is total mass over `MEDIAN_MASS_KG`, the multiplier every mass-scaled burn uses.

- [ ] **Step 1: Write the failing test**

```ts
describe("body mass", () => {
  it("counts the fat reserve, so a fatter body weighs more and burns more at rest", () => {
    const { state, world } = newGame(1);
    const lean = body(state).leanKg;
    state.player.fat = 0;
    expect(bodyMassKg(state)).toBeCloseTo(lean, 6);
    state.player.fat = 9 * FAT_KCAL_PER_KG;
    expect(bodyMassKg(state)).toBeCloseTo(lean + 9, 6);

    // Resting burn tracks total mass.
    state.player.fat = 0;
    state.task = null;
    const k0 = state.player.kcal;
    state.player.kcal = 3000;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const thin = 3000 - state.player.kcal;
    state.player.fat = 20 * FAT_KCAL_PER_KG;
    state.player.kcal = 3000;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const fat = 3000 - state.player.kcal;
    expect(fat).toBeGreaterThan(thin);
    void k0;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "body mass"`
Expected: FAIL - `bodyMassKg` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/person.ts`:

```ts
/** What the body weighs right now: its frame and muscle, plus the reserve it is carrying. */
export function bodyMassKg(state: GameState): number {
  return body(state).leanKg + state.player.fat / FAT_KCAL_PER_KG;
}

/**
 * Total mass against the reference body, the multiplier every mass-scaled
 * burn uses. Resting costs more for a heavier body, and so does work that
 * moves it.
 */
export function massFactor(state: GameState): number {
  return bodyMassKg(state) / MEDIAN_MASS_KG;
}
```

`Derived.baseBurn` can no longer be a function of `Person` alone, because it must see the reserve. In `derived()`, leave `baseBurn` scaled by lean mass only, and in `src/sim/player.ts`'s `stepPlayer`, replace

```ts
  const base = d.baseBurn * eats;
```

with

```ts
  // The reserve is mass the body carries everywhere, so resting costs more for a body that has one.
  const base = BASE_KCAL_PER_HOUR * massFactor(state) * eats;
```

Import `massFactor` from `./person` in `player.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/person.ts src/sim/player.ts tests/fat.test.ts
git commit -m "feat(survidle): the reserve is mass the body carries"
```

---

### Task 3: Starvation is read from the lower landmark

**Files:**
- Modify: `src/sim/player.ts`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `fatLandmarks` from Task 1.
- Produces: `starvation(state)` keeps its signature and its 0..1 range; only its reference changes.

- [ ] **Step 1: Write the failing test**

```ts
describe("starvation", () => {
  it("is nothing at the lower landmark and above, and total at the floor", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.typical;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.lower;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.upper * 2;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.floor;
    expect(starvation(state)).toBe(1);
    state.player.fat = 0;
    expect(starvation(state)).toBe(1);
  });

  it("rises without a step between the two", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const mid = (l.lower + l.floor) / 2;
    state.player.fat = mid;
    const s = starvation(state);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    state.player.fat = mid - 1000;
    expect(starvation(state)).toBeGreaterThan(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "starvation"`
Expected: FAIL - at `typical` the old `1 - fat/fatFull` returns a non-zero number.

- [ ] **Step 3: Write minimal implementation**

Replace `starvation()` in `src/sim/player.ts`:

```ts
/**
 * How far the body has fallen into its failing range: nothing at the lower
 * landmark and above, total at the floor it dies on. A naturally lean body
 * sitting in its settling zone is not starving and reads zero, which is what
 * makes this safe to feed to warmth, work speed and the body's own words.
 */
export function starvation(state: GameState): number {
  const l = fatLandmarks(current(state).person);
  return clamp((l.lower - state.player.fat) / (l.lower - l.floor), 0, 1);
}
```

Import `fatLandmarks` from `./person` and `current` from `./record` if not already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts tests/fat.test.ts
git commit -m "feat(survidle): starvation is measured from the failing range, not the whole tank"
```

---

### Task 4: Death is at the floor

**Files:**
- Modify: `src/sim/player.ts:408`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `fatLandmarks` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
describe("the floor", () => {
  it("starts the body dying at essential fat, not at nothing", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.kcal = 0;
    state.player.fat = l.floor - 1;
    const h0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeLessThan(h0);
  });

  it("does not start it dying while the reserve is still above the floor", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.kcal = 0;
    state.player.fat = l.floor + 20000;
    const h0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeCloseTo(h0, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "the floor"`
Expected: FAIL on the first - health holds, because the old test is `p.fat <= 0`.

- [ ] **Step 3: Write minimal implementation**

In `stepPlayer`, replace:

```ts
  if (p.kcal <= 0 && p.fat <= 0) drains.starve = 2 * h;
```

with:

```ts
  // The floor is essential fat: structure, not fuel. A body at it is dying,
  // however much weight is still on it.
  if (p.kcal <= 0 && p.fat <= fatLandmarks(current(state).person).floor) drains.starve = 2 * h;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts tests/fat.test.ts
git commit -m "feat(survidle): a body dies at essential fat, not at an empty tank"
```

---

### Task 5: The body's words track the failing range

**Files:**
- Modify: `src/sim/player.ts:424-426`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `starvation` from Task 3, which is now the only reference the warnings need.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
describe("the body's words about its reserve", () => {
  it("says nothing while the body sits in its settling zone", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.typical;
    state.player.kcal = KCAL_FULL;
    const before = state.log.length;
    for (let m = 0; m < 120; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const said = state.log.slice(before).map((e) => e.text);
    expect(said.some((t) => /thin|ribs|wasting|starving/i.test(t))).toBe(false);
  });

  it("says them in order as the reserve falls toward the floor", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const seen: string[] = [];
    for (const share of [0.7, 0.4, 0.1]) {
      state.player.fat = l.floor + (l.lower - l.floor) * share;
      state.player.kcal = KCAL_FULL;
      const before = state.log.length;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
      seen.push(...state.log.slice(before).map((e) => e.text));
    }
    expect(seen.some((t) => /thin/i.test(t))).toBe(true);
    expect(seen.some((t) => /ribs/i.test(t))).toBe(true);
    expect(seen.some((t) => /wasting/i.test(t))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "the body's words"`
Expected: FAIL - at `typical` the old `FAT_THIN * fatFull` test already fires.

- [ ] **Step 3: Write minimal implementation**

Replace the three constants and the three warnings in `src/sim/player.ts`:

```ts
/** How far into the failing range - lower landmark down to the floor - each word waits for. */
const FAT_THIN = 0.25;
const FAT_RIBS = 0.5;
const FAT_WASTING = 0.75;
```

```ts
  // The words track the failing range, so a lean body in its settling zone is
  // not told its ribs show.
  const failing = starvation(state);
  warn(state, "thin", failing > FAT_THIN, "{You} {are} getting thin.");
  warn(state, "ribs", failing > FAT_RIBS, "{Your} ribs show.");
  warn(state, "wasting", failing > FAT_WASTING, "{You} {are} wasting away.");
```

The `starving` warning at `player.ts:423` already reads `starvation(state) >= 0.5` and needs no change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts tests/fat.test.ts
git commit -m "feat(survidle): thin, ribs and wasting read the failing range"
```

---

### Task 6: The ceiling goes

**Files:**
- Modify: `src/sim/person.ts`, `src/sim/player.ts`, `src/sim/actions.ts`, `src/sim/newgame.ts`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `fatLandmarks` from Task 1.
- Produces: `FAT_FULL` and `Derived.fatFull` no longer exist. Any later task referencing them is wrong.

- [ ] **Step 1: Write the failing test**

```ts
describe("no ceiling", () => {
  it("lets a body eat past its upper landmark and keep going", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.upper;
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "fat", 20);
    for (let i = 0; i < 40; i++) eat(state, world, "fat", new Rng(1));
    expect(state.player.fat).toBeGreaterThan(l.upper * 1.2);
  });

  it("lands a new survivor at the typical reserve", () => {
    const { state } = newGame(1);
    expect(state.player.fat).toBeCloseTo(fatLandmarks(current(state).person).typical, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "no ceiling"`
Expected: FAIL - fat is clamped at `fatFull`, and a new survivor starts at it.

- [ ] **Step 3: Write minimal implementation**

`src/sim/actions.ts`, in `eat()`:

```ts
  } else {
    p.kcal = KCAL_FULL;
    // No ceiling: what the stomach cannot hold is put on as fat, and a body
    // has nowhere it stops accepting it. Appetite is what argues, not a wall.
    p.fat += gain - room;
  }
```

`src/sim/player.ts`, in `stepPlayer`:

```ts
  if (shortfall > 0) p.fat = Math.max(0, p.fat - shortfall);
```

`src/sim/newgame.ts`: replace `fat: d.fatFull,` with `fat: fatLandmarks(p).typical,` and import `fatLandmarks` from `./person`. (`p` here is the `Person` the record is built from; if the local name differs, use whichever identifier holds it.)

`src/sim/person.ts`: delete the `fatFull` field from `Derived` and the `fatFull:` line from `derived()`.

`src/sim/player.ts`: delete `export const FAT_FULL = 80000;` and its doc comment.

`src/sim/save.ts:163` reads `p.fat ??= FAT_FULL;`. Replace with `p.fat ??= fatLandmarks(current(state).person).typical;` if `state` is in scope there, otherwise take the person the surrounding function already has.

Fix every remaining reference the compiler reports. `tests/fat.test.ts` and `tests/reference.test.ts` both import `FAT_FULL`; the reference one is handled in Task 11, so for now change its import to a local constant equal to the median male's `typical - floor` span and leave a comment pointing at Task 11.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/person.ts src/sim/player.ts src/sim/actions.ts src/sim/newgame.ts src/sim/save.ts tests/
git commit -m "feat(survidle): the reserve has no lid"
```

---

### Task 7: Hunger and satiety are two numbers

**Files:**
- Modify: `src/sim/actions.ts`
- Test: `tests/hunger.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SATIETY_BASE: number` exported from `src/sim/actions.ts`, and `autoEat` now eats up to a target rather than to the hunger line. `HUNGRY_LINE` keeps its name, its value and its export.

- [ ] **Step 1: Write the failing test**

Add to `tests/hunger.test.ts`:

```ts
describe("hunger and satiety", () => {
  it("eats past the line it started at, up to the satiety target", () => {
    const { state, world } = newGame(1);
    state.player.kcal = HUNGRY_LINE - 1;
    addItem(state.player.pack, "driedMeat", 5);
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(HUNGRY_LINE + 100);
    expect(state.player.kcal).toBeLessThanOrEqual(KCAL_FULL);
  });

  it("banks the surplus as fat when a deep larder meets a full stomach", () => {
    const { state, world } = newGame(1);
    const fat0 = state.player.fat;
    // A season of plenty: the pack never empties and the body never goes without.
    for (let m = 0; m < 30 * 1440; m++) {
      for (const f of ["driedMeat", "cookedOilyFish", "cookedRoots", "fat"] as const) addItem(state.player.pack, f, 1);
      advance(state, world, 1);
    }
    expect(state.player.fat).toBeGreaterThan(fat0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hunger.test.ts -t "hunger and satiety"`
Expected: FAIL on both - eating stops the instant it clears `HUNGRY_LINE`, so it never passes it by 100 and never banks fat.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/actions.ts`, below `HUNGRY_LINE`:

```ts
/**
 * The reserve a meal is eaten up to. The gap between this and HUNGRY_LINE is
 * what a meal is: the line answers when eating begins, this answers when it
 * stops, and holding them apart is what lets a good day put weight on. Task 8
 * makes both of these move with the reserve; this is the settling zone's value.
 */
export const SATIETY_BASE = 2600;
```

In `autoEat`, change the loop's condition from the hunger line to the target, and gate entry on the line:

```ts
  if (p.kcal >= HUNGRY_LINE) {
    warn(state, "hungry", false, "");
    return;
  }
  const eaten = new Map<FoodId, number>();
  let guard = 0;
  while (p.kcal < SATIETY_BASE && guard++ < 200) {
```

Everything else in `autoEat` is unchanged, including the coalesced meal line and the `warn` at the end.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hunger.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/actions.ts tests/hunger.test.ts
git commit -m "feat(survidle): a meal is the gap between hunger and satiety"
```

---

### Task 8: Appetite answers the reserve, asymmetrically

**Files:**
- Modify: `src/sim/actions.ts`
- Test: `tests/hunger.test.ts`

**Interfaces:**
- Consumes: `fatLandmarks` (Task 1), `SATIETY_BASE` (Task 7).
- Produces: `hungerLine(state: GameState): number` and `satietyTarget(state: GameState): number`, both exported from `src/sim/actions.ts`. `HUNGRY_LINE` remains exported as the settling zone's baseline; `hungerLine()` is what `autoEat` and the UI read.

- [ ] **Step 1: Write the failing test**

```ts
describe("appetite answers the reserve", () => {
  const at = (fat: number) => {
    const { state } = newGame(1);
    state.player.fat = fat;
    return { hunger: hungerLine(state), satiety: satietyTarget(state) };
  };

  it("is flat across the settling zone", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const a = at(l.lower + (l.typical - l.lower) / 2);
    const b = at(l.typical);
    expect(a.hunger).toBeCloseTo(b.hunger, 6);
    expect(a.satiety).toBeCloseTo(b.satiety, 6);
    expect(b.hunger).toBeCloseTo(HUNGRY_LINE, 6);
    expect(b.satiety).toBeCloseTo(SATIETY_BASE, 6);
  });

  it("eats sooner and further below the lower landmark", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const norm = at(l.typical);
    const lean = at(l.floor + (l.lower - l.floor) * 0.2);
    expect(lean.hunger).toBeGreaterThan(norm.hunger);
    expect(lean.satiety).toBeGreaterThan(norm.satiety);
  });

  it("argues back above the upper landmark, and only gently", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const norm = at(l.typical);
    const stout = at(l.upper * 1.5);
    expect(stout.hunger).toBeLessThan(norm.hunger);
    expect(stout.satiety).toBeLessThan(norm.satiety);
    // Weak by design: the brake against gain is nothing like the drive to regain.
    const drop = norm.satiety - stout.satiety;
    const rise = at(l.floor + (l.lower - l.floor) * 0.2).satiety - norm.satiety;
    expect(rise).toBeGreaterThan(drop * 2);
  });

  it("still lets a very stout body gain on rich food", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.upper * 1.5;
    const fat0 = state.player.fat;
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "fat", 20);
    for (let i = 0; i < 20; i++) eat(state, world, "fat", new Rng(1));
    expect(state.player.fat).toBeGreaterThan(fat0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hunger.test.ts -t "appetite answers"`
Expected: FAIL - `hungerLine` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/actions.ts`:

```ts
/**
 * How far hunger climbs when the reserve is spent, as a share of the gap
 * between the baseline and a full stomach. The drive to regain lost fat is
 * the strong half of the body's answer.
 */
const HUNGER_RISE = 1;
/**
 * How far appetite falls once the reserve is past the upper landmark, as a
 * share of the same gap. Deliberately a fraction of the rise: a body fights
 * to get fat back and is only nudged out of keeping it, so a good autumn can
 * still put weight on.
 */
const HUNGER_FALL = 0.25;
/** The reserve, in multiples of the settling zone's width above the upper landmark, at which the fall is fully in. */
const FALL_SPAN = 1;

/**
 * Where appetite sits for the reserve the body is carrying, as a share:
 * +1 fully hungry, 0 the settling zone, -1 fully sated. Flat across the
 * settling zone, steep below the lower landmark, gentle above the upper one.
 */
function appetite(state: GameState): number {
  const l = fatLandmarks(current(state).person);
  const fat = state.player.fat;
  if (fat < l.lower) {
    // Square it, so the drive is mild just under the landmark and fierce near the floor.
    const into = clamp((l.lower - fat) / (l.lower - l.floor), 0, 1);
    return into * into;
  }
  if (fat > l.upper) return -clamp((fat - l.upper) / ((l.upper - l.lower) * FALL_SPAN), 0, 1);
  return 0;
}

/** The reserve at which this body decides to eat. Drawn on the Food bar. */
export function hungerLine(state: GameState): number {
  const a = appetite(state);
  const span = KCAL_FULL - HUNGRY_LINE;
  return HUNGRY_LINE + span * (a >= 0 ? a * HUNGER_RISE : a * HUNGER_FALL);
}

/** The reserve a meal is eaten up to. */
export function satietyTarget(state: GameState): number {
  const a = appetite(state);
  const span = KCAL_FULL - SATIETY_BASE;
  return SATIETY_BASE + (a >= 0 ? span * a * HUNGER_RISE : (SATIETY_BASE - HUNGRY_LINE) * a * HUNGER_FALL);
}
```

In `autoEat`, replace the two constants with the two functions:

```ts
  const line = hungerLine(state);
  if (p.kcal >= line) {
    warn(state, "hungry", false, "");
    return;
  }
  const target = satietyTarget(state);
  ...
  while (p.kcal < target && guard++ < 200) {
```

and the closing `warn` reads `p.kcal < line`.

`src/sim/body.ts:103` reads `p.kcal < HUNGRY_LINE` for the runner's "hungry" need. Change it to `p.kcal < hungerLine(state)` so the runner and auto-eat agree on when the body is hungry.

Import `clamp` from `../units`, `fatLandmarks` from `./person` and `current` from `./record` in `actions.ts` if not already present.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hunger.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/actions.ts src/sim/body.ts tests/hunger.test.ts
git commit -m "feat(survidle): appetite argues hard for a lost reserve and softly against a large one"
```

---

### Task 9: Work that moves the body pays for it

**Files:**
- Modify: `src/sim/player.ts`
- Test: `tests/fat.test.ts`

**Interfaces:**
- Consumes: `massFactor` from Task 2.
- Produces: `ON_THE_FEET: Partial<Record<TaskId, number>>` exported from `src/sim/player.ts`.

- [ ] **Step 1: Write the failing test**

```ts
describe("carrying the reserve", () => {
  const walkHour = (fatKg: number) => {
    const { state, world } = newGame(17);
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    state.player.fat = fatKg * FAT_KCAL_PER_KG;
    state.player.kcal = KCAL_FULL;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    return KCAL_FULL - state.player.kcal;
  };

  it("costs a heavier body more to walk an hour", () => {
    expect(walkHour(20)).toBeGreaterThan(walkHour(5) * 1.05);
  });

  it("does not slow it down", () => {
    const { state, world } = newGame(17);
    state.player.fat = 5 * FAT_KCAL_PER_KG;
    const thin = baseWalkSpeed(state, calendar(0), state.weather, 0);
    state.player.fat = 25 * FAT_KCAL_PER_KG;
    expect(baseWalkSpeed(state, calendar(0), state.weather, 0)).toBeCloseTo(thin, 6);
  });

  it("leaves work done standing still alone", () => {
    const craftHour = (fatKg: number) => {
      const { state, world } = newGame(17);
      state.task = { id: "craft", progress: 0, duration: 60, repeat: false };
      state.player.fat = fatKg * FAT_KCAL_PER_KG;
      state.player.kcal = KCAL_FULL;
      for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
      return KCAL_FULL - state.player.kcal;
    };
    // Resting burn still rises with mass; the work above it does not.
    const heavy = craftHour(20), light = craftHour(5);
    expect(heavy - light).toBeLessThan(walkHour(20) - walkHour(5));
  });

  it("still charges more for a carried kilo than for a kilo of the body", () => {
    const { state, world } = newGame(17);
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    const perKgBody = (walkHour(20) - walkHour(5)) / 15;
    state.player.fat = 5 * FAT_KCAL_PER_KG;
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "log", 3);
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const loaded = KCAL_FULL - state.player.kcal;
    expect((loaded - walkHour(5)) / Math.max(1, weight(state.player.pack))).toBeGreaterThan(perKgBody);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fat.test.ts -t "carrying the reserve"`
Expected: FAIL on the first - the walk bucket has no mass term, so 20 kg and 5 kg of fat walk for the same cost above base.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/player.ts`:

```ts
/**
 * The share of a task's work above base that is the body being moved, and so
 * scales with total mass. Walking is all of it. A task absent from this table
 * does not scale with mass at all - work done standing in one place costs
 * what it costs whoever is doing it, and a heavier body pays for its reserve
 * through the resting burn instead.
 *
 * Same convention as NIGHT_WORK in light.ts: absence means the effect does
 * not apply.
 */
export const ON_THE_FEET: Partial<Record<TaskId, number>> = {
  walk: 1, travel: 1, haul: 1, explore: 1, searchHome: 1,
  hunt: 0.6, berries: 0.4, roots: 0.4, sticks: 0.4, deadwood: 0.4, seaweed: 0.4, stone: 0.4,
};
```

In `stepPlayer`, scale the locomotion cost by mass **before** the load term is added, so a carried kilo keeps its own, steeper price:

```ts
  if (a === "walk") {
    burn = WALK_KCAL_PER_HOUR / Math.max(0.25, speedOf(hereTerrain(state, world), state.route?.ice ?? "none"));
    if (w.snowCm > DEEP_SNOW_CM) burn *= 2;
    // Moving the body costs what the body weighs. The load below is charged
    // separately and more steeply: a pack on the back is carried far less
    // efficiently than the body carrying it.
    burn *= massFactor(state);
    if (carried(p) > d.packHardKg) burn += LOAD_KCAL_PER_HOUR.hard;
    else if (carried(p) > d.packComfortableKg) burn += LOAD_KCAL_PER_HOUR.comfortable;
  } else {
    burn = KCAL_PER_HOUR[a];
  }
```

and apply the table to the work above base:

```ts
  const eats = hasQuirk(state, "bigEater") ? BIG_EATER_BURN : 1;
  // Work that moves the body scales with what the body weighs; the rest is effort, and strength is the axis for that.
  const feet = a === "walk" ? 0 : (state.task && ON_THE_FEET[state.task.id]) || 0;
  const above = (burn - BASE_KCAL_PER_HOUR) * d.workBurn * eats * (1 + (massFactor(state) - 1) * feet);
```

The walk branch already carries its mass factor, hence the `a === "walk" ? 0` guard - it must not be charged twice.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fat.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts tests/fat.test.ts
git commit -m "feat(survidle): a walked hour costs what the body weighs"
```

---

### Task 10: The bars say where the floor and the line are

**Files:**
- Modify: `src/ui/bars.ts`, `src/ui/panels.ts`, `src/style.css`
- Test: `tests/churn.test.ts` (must keep passing), `tests/ui.test.ts`

**Interfaces:**
- Consumes: `hungerLine` (Task 8), `fatLandmarks` (Task 1).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui.test.ts`:

```ts
describe("the body's bars", () => {
  it("draws the Fat bar against the upper landmark and marks the floor", () => {
    const { state, world } = newGame(1);
    const root = render(statsHtml(state, world, calendar(state.minute, state.startDoy), 5, newUiState()));
    const fat = root.querySelector("#bar-fat")!.parentElement!;
    const mark = fat.querySelector(".mark") as HTMLElement | null;
    expect(mark).not.toBeNull();
    const l = fatLandmarks(current(state).person);
    expect(Number.parseFloat(mark!.style.left)).toBeCloseTo((l.floor / l.upper) * 100, 0);
  });

  it("moves the Food bar's mark with the hunger line", () => {
    const { state, world } = newGame(1);
    const cal = calendar(state.minute, state.startDoy);
    const l = fatLandmarks(current(state).person);
    const markAt = () => {
      const root = render(statsHtml(state, world, cal, 5, newUiState()));
      const m = root.querySelector("#bar-kcal")!.parentElement!.querySelector(".mark") as HTMLElement;
      return Number.parseFloat(m.style.left);
    };
    state.player.fat = l.typical;
    const normal = markAt();
    state.player.fat = l.floor + (l.lower - l.floor) * 0.2;
    expect(markAt()).toBeGreaterThan(normal);
  });
});
```

`render` here is whatever helper `tests/ui.test.ts` already uses to turn a markup string into a DOM node; reuse it rather than adding another.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui.test.ts -t "the body's bars"`
Expected: FAIL - the Fat bar has no mark, and the Food bar's mark is a constant.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/panels.ts`'s `statsHtml`, the two bars become:

```ts
${bar("kcal", "kcal", "Food", hungerLine(state) / KCAL_FULL)}
${bar("fat", "fat", "Fat", fatLandmarks(current(state).person).floor / fatLandmarks(current(state).person).upper)}
```

Hoist the landmarks to a local `const marks = fatLandmarks(current(state).person);` above the return and use `marks.floor / marks.upper`, so they are computed once.

In `src/ui/bars.ts`, the Fat bar's fill is drawn against `upper` rather than a cap:

```ts
  const marks = fatLandmarks(current(state).person);
  // No maximum exists, so the bar reads against the upper landmark and simply
  // fills at that point: being off the end of the Fat bar is a good problem.
  setBar("fat", p.fat / marks.upper, `${(p.fat / FAT_KCAL_PER_KG).toFixed(1)} kg`, root);
```

and the Food bar's `low` class reads the live line:

```ts
  kcalBar?.classList.toggle("low", p.kcal < hungerLine(state));
```

The Food bar's mark is now a moving value, so it must not be written into the markup on every frame - that is what the churn budget forbids. Move it: `bar()` keeps its `markAt` parameter for the Fat bar's fixed floor, and the Food bar's mark gains `data-mark="hunger"` with no inline `left`, written each frame in `updateBars`:

```ts
  const hungerMark = root.querySelector<HTMLElement>('[data-mark="hunger"]');
  if (hungerMark) hungerMark.style.left = `${((hungerLine(state) / KCAL_FULL) * 100).toFixed(1)}%`;
```

Adjust `bar()` to take either a fixed share or a mark name:

```ts
function bar(id: string, cls: string, label: string, mark?: number | { name: string }): string {
  const m = mark === undefined ? ""
    : typeof mark === "number"
      ? `<div class="mark" style="left:${(mark * 100).toFixed(1)}%" title="eats here"></div>`
      : `<div class="mark" data-mark="${mark.name}" title="eats here"></div>`;
  return `<div class="bar ${cls}"><div class="fill" id="bar-${id}"></div>${m}<span class="lbl"><span>${label}</span><b id="val-${id}"></b></span></div>`;
}
```

so the Food bar is `bar("kcal", "kcal", "Food", { name: "hunger" })` and the Fat bar passes its number. Update the test in Step 1 accordingly if it reads `style.left` on the Food bar - it must read it after `updateBars` has run.

The Fat bar's mark wants its own title: give `bar()`'s object form an optional title, or set `title="dies here"` on the Fat bar's mark by passing the title through. Keep it to one small change; do not add a second bar helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui.test.ts tests/churn.test.ts && npx tsc --noEmit`
Expected: PASS. The churn test is the gate here - if it goes red, a moving value reached the markup.

- [ ] **Step 5: Commit**

```bash
git add src/ui/bars.ts src/ui/panels.ts src/style.css tests/ui.test.ts
git commit -m "feat(survidle): the Fat bar says where the floor is and the meal line moves with appetite"
```

---

### Task 11: The April gate is re-derived

**Files:**
- Modify: `src/sim/reference.ts`, `tests/reference.test.ts`
- Test: `tests/reference.test.ts`

**Interfaces:**
- Consumes: `fatLandmarks` (Task 1).
- Produces: `REFERENCE_TARGET_DAY` keeps its name and its derived character.

- [ ] **Step 1: Write the failing test**

```ts
it("the April target is the day a beginner eating the least and burning the most reaches the floor", () => {
  const median = medianPerson("m");
  const l = fatLandmarks(median);
  // Only the reserve above essential fat is fuel; the floor is structure.
  const reserve = (l.typical - l.floor) + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg;
  const deficit = BURN.day.hi - APRIL.rows.total!.beginner.lo;
  expect(REFERENCE_TARGET_DAY).toBe(Math.floor(reserve / deficit));
});
```

Delete the old `expect(REFERENCE_TARGET_DAY).toBe(19)` line - the value is derived and Task 12 records what it becomes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reference.test.ts -t "April target"`
Expected: FAIL - `REFERENCE_TARGET_DAY` is still derived from `FAT_FULL`.

- [ ] **Step 3: Write minimal implementation**

In `src/sim/reference.ts`:

```ts
/**
 * The April gate (spec 7.1): the day a beginner who eats the least the tables
 * allow and burns the most reaches essential fat. Derived, so it moves when
 * the burn band, the reserve or the kit moves and not otherwise. Only the
 * reserve above the floor is fuel - the floor itself is structure, and a body
 * is dying by the time it reaches it.
 */
export const REFERENCE_TARGET_DAY = Math.floor(
  (() => {
    const l = fatLandmarks(medianPerson("m"));
    return l.typical - l.floor + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg;
  })() / (BURN.day.hi - APRIL.rows.total!.beginner.lo),
);
```

Import `fatLandmarks` and `medianPerson` from `./person`; drop the `FAT_FULL` import.

The test at `tests/reference.test.ts` "a capped run does not double the checkpoint" pins a seed that must be alive at the target day. If it fails, find a reference seed that is and update it with a comment saying which, exactly as the existing comment there does. Do not weaken the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reference.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts tests/reference.test.ts
git commit -m "feat(survidle): the April gate counts the fuel, not the structure"
```

---

### Task 12: The calibration pass

**Files:**
- Modify: `src/sim/person.ts` (the `FAT_SHARES` values only), `tests/epitaph.test.ts` (snapshots)
- Create: `docs/superpowers/plans/2026-09-08-survidle-body-fat-readings.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the settled landmark values and the recorded gate readings.

This task has no TDD cycle - it is measurement, and the numbers are its output.

- [ ] **Step 1: Take the full suite and fix what the change legitimately moved**

Run: `npm test`
The epitaph inline snapshots will have moved, because the deaths have. Update them with `npx vitest run tests/epitaph.test.ts -u`, then **rewrite the prose comment above them** so it describes the deaths that now happen. A comment that chronicles the old deaths is worse than none.

- [ ] **Step 2: Take the three gate readings**

```bash
npm run reference   # April
npm run year
npm run december    # winter
```

Record for each: how many seeds of five passed, and for every seed its death day and cause.

- [ ] **Step 3: Take the same three readings on main, for comparison**

```bash
git worktree add --detach /private/tmp/survidle-fatbase main
ln -s "$PWD/node_modules" /private/tmp/survidle-fatbase/08-survidle/node_modules
cd /private/tmp/survidle-fatbase/08-survidle && npm run reference && npm run year && npm run december
```

Remove the worktree afterwards with `git worktree remove --force /private/tmp/survidle-fatbase`.

- [ ] **Step 4: Write the readings down**

Create `docs/superpowers/plans/2026-09-08-survidle-body-fat-readings.md` with a before/after table per gate, per seed, and a paragraph naming which movements are the reserve, which are the walking mass term, and which are runs diverging. Do not tune anything before this document exists.

- [ ] **Step 5: Settle the landmarks**

The one number the plan predicted and could not verify: fasting survival about **1.40x** in a woman's favour, equal to the `build` axis's own span. Read it off the runs. If it holds and reads as a dominant pick rather than as flavour, narrow it by moving `FAT_SHARES` - raising the male `typical`, lowering the female `typical`, or both - and re-take the readings. Change the landmarks, never the mechanism, and never to make a gate green.

- [ ] **Step 6: Commit**

```bash
git add src/sim/person.ts tests/epitaph.test.ts docs/superpowers/plans/2026-09-08-survidle-body-fat-readings.md
git commit -m "test(survidle): the body's fat, measured"
```

---

## Self-Review

**Spec coverage.** Four landmarks - Task 1. Sex-specific floor - Task 1. `starvation()` re-based - Task 3. Death at the floor - Task 4. Cap removed, no upper clamp, survivor starts at `typical` - Task 5. thin/ribs/wasting re-based - Task 6. Hunger/satiety split - Task 7. Asymmetric nonlinear response, moving mark - Tasks 8 and 10. Fat in body mass - Task 2. `ON_THE_FEET` per-task table, walk mass term, load kept separate, speed untouched - Task 9. Fat bar reference and floor mark - Task 10. `REFERENCE_TARGET_DAY` re-derived - Task 11. Gates measured and landmarks settled - Task 12. Deposition stays 1:1 - no task, correctly: it is the current behaviour and the spec keeps it.

**Spec sections with no task, deliberately.** Open question 2, the "eat your fill" order, is out of scope by the spec's own wording. The survivor card saying nothing about sex needs no task - it already says nothing.

**Type consistency.** `fatLandmarks(p: Person): FatLandmarks` is used identically in Tasks 3, 4, 5, 6, 8, 10 and 11. `Derived.massKg` becomes `Derived.leanKg` in Task 1 and every later reader uses `leanKg`. `massFactor(state)` is defined in Task 2 and consumed in Tasks 2 and 9. `SATIETY_BASE` is introduced in Task 7 and read by `satietyTarget` in Task 8. `hungerLine(state)` is introduced in Task 8 and read in Tasks 8, 9's neighbours and 10. `FAT_FULL` and `fatFull` are deleted in Task 5 and referenced by no later task.

**Ordering.** Nothing is deleted before its replacement exists: the landmarks (1) precede every re-basing (3, 4, 5), and all of them precede the deletion of the cap (6). By the time Task 6 removes `fatFull`, its only remaining readers are the two clamps and the new-game value that Task 6 itself replaces.
