# Fire Keeping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fire becomes something you start once and keep. Embers hold it between feedings, rekindling from them needs no drill, three goals name the keeping without explaining it, and goal 1 starts crediting the gather instead of the delivery.

**Architecture:** One additive field on the region's fire (`embers`, minutes of ember life) rather than a three-valued `lit`, so all fourteen existing `fire.lit` reads stay correct untouched. The fire step drops a spent fire to embers instead of killing it; the light task reads embers and rekindles cheaply. Goals ride on new deeds emitted where the fire's run starts and ends.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-fire-keeping-design.md` - read it before Task 1. Its "Why" section carries the arithmetic that motivates the whole change, and its rejected-shape note explains why one goal is worded as it is.

## Global Constraints

- **Working directory**: `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/fire/08-survidle`. Branch `survidle/fire-keeping`. Never `cd` to the main checkout.
- **Both gates pass before every commit**: `npm test` and `npm run build`. Baseline is 113 files / 1234 tests, all green.
- **No em dashes and no non-typable unicode** anywhere - code, comments, commit messages, UI copy. Use `-`, `->`, `"`, `'`, `...`.
- **Comments explain, they never chronicle.** No dates, no "changed from", no before/after.
- **Stage with explicit paths.** Never `git add -A`; several sessions work in this repo.
- **A goal title names an outcome and never a route.** `tests/goals.test.ts` enforces this against the real recipe, structure, tool and item vocabularies. Do not weaken that guard to fit a title; change the title.
- **Every new deed seam gets a mutation check**: delete the emission, watch a test fail, restore, and check `git diff` is clean before committing. The goals branch shipped four unpinned seams because its coverage test synthesised deeds by hand. Do not repeat that.
- **Numbers are real-north, not dials.** `EMBER_MINUTES` is eight hours because banked coals hold eight to twelve; if a balance gate moves, report the reading rather than bending the number.
- `npm run lint` is a silent no-op in this worktree (biome.json excludes `**/.claude`). Use `../node_modules/.bin/biome lint <paths>`.
- Commit trailers:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019fGCeqzJ2JV4pkDZ48mogM
  ```

---

### Task 1: Embers

**Files:**
- Modify: `src/sim/types.ts` (three fields on `RegionState["fire"]`)
- Modify: `src/sim/fire.ts` (constants, `emberWarmth`)
- Modify: `src/sim/camp.ts` (the fire step)
- Modify: `src/sim/light.ts` (ember glow)
- Modify: `src/sim/save.ts` (defaults for old saves)
- Modify: `src/sim/regionstate.ts` (a new region's fire)
- Test: `tests/embers.test.ts`

**Interfaces produced (Tasks 2-3 depend on these names):**
- `EMBER_MINUTES`, `EMBER_WARMTH`, `EMBER_LUX` in `src/sim/fire.ts`
- `st.fire.embers: number`, `st.fire.litSince: number | null`, `st.fire.rainHeld: number`
- `hasEmbers(fire): boolean` in `src/sim/fire.ts`

- [ ] **Step 1: Read first**

Read `src/sim/camp.ts`'s `stepCamp` (the `if (st.fire.lit)` block), `src/sim/fire.ts` (`fireWarmth`, `roofed`, `burnPerHour`), and `src/sim/light.ts` around line 135 where `CAMP_FIRE_LUX` is added. Note that `CAMP_FIRE_LUX` is 20 and `NIGHT_WORK`'s handwork tier needs 200 - firelight never sufficed for craft, so do not claim embers take that away.

- [ ] **Step 2: Write the failing test**

Create `tests/embers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { EMBER_MINUTES, hasEmbers } from "../src/sim/fire";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";

/** A lit fire at camp with a known fuel load and nobody to auto-feed it. */
function litCamp(seed = 3, fuelKg = 1) {
  const { state, world } = newGame(seed);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  st.structures.firePit = true;
  st.fire.lit = true;
  st.fire.fuelKg = fuelKg;
  st.fire.wetKg = 0;
  st.fire.litSince = state.minute;
  state.player.autoFeed = false;
  return { state, world, st };
}

describe("a spent fire", () => {
  it("falls to embers rather than going out", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(st.fire.lit).toBe(false);
    expect(hasEmbers(st.fire)).toBe(true);
  });

  it("is only truly out once the embers are spent", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    advance(state, world, EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    expect(st.fire.embers).toBe(0);
  });

  it("keeps its run open through the embers and closes it when they die", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(st.fire.litSince).not.toBe(null);
    advance(state, world, EMBER_MINUTES + 60);
    expect(st.fire.litSince).toBe(null);
  });

  it("loses its embers faster in the rain with nothing over it", () => {
    const dry = litCamp();
    advance(dry.state, dry.world, 120);
    const dryLeft = dry.st.fire.embers;

    const wet = litCamp();
    wet.state.weather.precip = "light";
    advance(wet.state, wet.world, 120);
    expect(wet.st.fire.embers).toBeLessThan(dryLeft);
  });

  it("leaves no embers when heavy rain drowns it", () => {
    const { state, world, st } = litCamp(3, 1.5);
    state.weather.precip = "heavy";
    // drownedLow wants above-freezing rain, no roof and under 2 kg on the fire.
    advance(state, world, 30);
    if (!st.fire.lit) {
      expect(hasEmbers(st.fire)).toBe(false);
    }
  });
});

describe("embers against a lit fire", () => {
  it("warm less and light less", async () => {
    const { fireWarmth, EMBER_WARMTH, EMBER_LUX } = await import("../src/sim/fire");
    const { CAMP_FIRE_LUX } = await import("../src/sim/light");
    const lit = { lit: true, fuelKg: 10, wetKg: 0, indoors: false, unattended: 0, embers: 0, litSince: 0, rainHeld: 0 };
    expect(EMBER_WARMTH).toBeLessThan(fireWarmth(lit, false));
    expect(EMBER_LUX).toBeLessThan(CAMP_FIRE_LUX);
  });

  it("glow under the band that finds wood in the dark, so a banked fire is no place to forage", async () => {
    const { EMBER_LUX } = await import("../src/sim/fire");
    const { NIGHT_WORK } = await import("../src/sim/light");
    expect(EMBER_LUX).toBeLessThan(NIGHT_WORK.deadwood!.needLux);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- embers`
Expected: FAIL - `hasEmbers` is not exported.

- [ ] **Step 4: Widen the fire's shape**

In `src/sim/types.ts`, the `fire` field on `RegionState` becomes:

```ts
  fire: {
    lit: boolean; fuelKg: number; wetKg: number; indoors: boolean; unattended: number;
    /** Minutes of ember life left once the flame is gone. Embers are not lit. */
    embers: number;
    /** Minute this fire was last lit from cold; null once the embers die. A run of keeping is measured from it. */
    litSince: number | null;
    /** Minutes of rain this fire has come through without dying. */
    rainHeld: number;
  };
```

- [ ] **Step 5: Add the constants and the helper**

In `src/sim/fire.ts`:

```ts
/**
 * How long banked coals stay alive: Kochanski and the Swedish handbook both
 * put a banked fire at eight to twelve hours, which is how a household kept
 * fire overnight before matches. The low end, since nothing here rakes ash
 * over the fire deliberately.
 */
export const EMBER_MINUTES = 8 * 60;
/** Rain with nothing over the pit eats coals at this multiple. */
export const EMBER_RAIN_RATE = 2;
/** What coals are worth to a body beside them, against a lit fire's 7. */
export const EMBER_WARMTH = 2;
/** The glow off coals, against a lit fire's 20: under every tier of NIGHT_WORK. */
export const EMBER_LUX = 2;

export function hasEmbers(fire: RegionState["fire"]): boolean {
  return !fire.lit && fire.embers > 0;
}
```

- [ ] **Step 6: Drop a spent fire to embers**

In `src/sim/camp.ts`'s `stepCamp`, the block that currently kills the fire becomes:

```ts
      const outOfFuel = fuelTotal(st.fire) <= 0;
      const drownedLow = state.weather.precip === "heavy" && ambient > 0 && !roof && fuelTotal(st.fire) < 2;
      if (outOfFuel || drownedLow) {
        st.fire.fuelKg = 0;
        st.fire.wetKg = 0;
        st.fire.lit = false;
        st.fire.indoors = false;
        // Rain that beat the fire beat the coals with it; a fire that simply
        // ate its wood leaves them, which is how a night is got through.
        st.fire.embers = drownedLow ? 0 : EMBER_MINUTES;
        if (st.fire.embers <= 0) st.fire.litSince = null;
        log(state, mine
          ? (st.fire.embers > 0 ? "The flames are down to coals." : "The fire has gone out.")
          : `The fire at ${name()} has gone out.`, "bad");
      }
```

and, outside that `if (st.fire.lit)` block, embers burn down on their own:

```ts
    if (!st.fire.lit && st.fire.embers > 0) {
      const wet = state.weather.precip !== "none" && !roofed(st) ? EMBER_RAIN_RATE : 1;
      st.fire.embers = Math.max(0, st.fire.embers - dt * wet);
      if (st.fire.embers === 0) {
        st.fire.litSince = null;
        log(state, mine ? "The last of the coals goes grey." : `The fire at ${name()} is dead.`, "bad");
      }
    }
```

Read the surrounding code before editing: `roof` is computed inside the lit branch, so the ember block needs its own `roofed(st)` call. Keep `st.fire.unattended` behaving as it does.

- [ ] **Step 7: Warmth and glow**

In `src/sim/fire.ts`, `fireWarmth` returns `EMBER_WARMTH` for a fire with embers instead of 0. In `src/sim/light.ts` at the `CAMP_FIRE_LUX` line, add `EMBER_LUX` for a camp whose fire has embers:

```ts
  for (const c of visitedCamps(state)) {
    if (c.cell !== cell) continue;
    if (c.st.fire.lit) lux += CAMP_FIRE_LUX;
    else if (hasEmbers(c.st.fire)) lux += EMBER_LUX;
  }
```

- [ ] **Step 8: Defaults**

New regions (`src/sim/regionstate.ts`) start `embers: 0, litSince: null, rainHeld: 0`. In `src/sim/save.ts`'s `fillDefaults`, give every region's fire the same, so an old save loads without embers rather than with `undefined` arithmetic. Find how `fillDefaults` already walks `state.regions` and follow it.

- [ ] **Step 9: Run the tests, then both gates**

Run: `npm test -- embers`, then `npm test && npm run build`.
Expected: all green. `tests/fire.test.ts`, `tests/firesite.test.ts` and the winter tests exercise this code - if one goes red, the change altered behaviour and the code is what needs fixing.

- [ ] **Step 10: Commit**

```bash
git add src/sim/types.ts src/sim/fire.ts src/sim/camp.ts src/sim/light.ts src/sim/save.ts src/sim/regionstate.ts tests/embers.test.ts
git commit -m "feat(survidle): a fire that eats its wood goes to coals, not out"
```

---

### Task 2: Rekindling

**Files:**
- Modify: `src/sim/tasks.ts` (the `light` option and its `complete` case)
- Test: `tests/embers.test.ts` (extend)

**Interfaces:**
- Consumes: `hasEmbers`, `EMBER_MINUTES` from Task 1.
- Produces: a `{ kind: "rekindled" }` deed is NOT added here - Task 3 owns the goal deeds. This task only changes what lighting costs.

- [ ] **Step 1: Write the failing test**

Append to `tests/embers.test.ts`:

```ts
describe("rekindling", () => {
  it("takes no drill and cannot fail, however hard it is raining", () => {
    const { state, world, st } = litCamp();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    const before = state.player.tools.find((t) => t.id === "fireDrill")!.durability;
    state.weather.precip = "heavy";
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "light")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(st.fire.lit).toBe(true);
    expect(state.player.tools.find((t) => t.id === "fireDrill")!.durability).toBe(before);
  });

  it("still needs the drill when the coals are dead", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.ok).toBe(false);
    expect(o.why).toMatch(/drill/i);
  });
});
```

Add the imports this needs at the top of the file: `addItem` from `../src/sim/inventory`, `calendar` from `../src/sim/calendar`, `check` and `startTask` from `../src/sim/tasks`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- embers`
Expected: FAIL - the light still needs a drill and can still fail.

- [ ] **Step 3: Make lighting read the embers**

In `src/sim/tasks.ts`, find the `light` case in the option builder (it checks for a fire drill and calls `lightingInRain`) and the `light`/`lightIndoors` case in `complete`. In both:

- when `hasEmbers(st.fire)`, the drill is not required and not worn, `lightingInRain`'s failure roll is skipped, and the duration is short (use `EMBER_RELIGHT_MINUTES = 5`, a new constant beside the other fire numbers in `fire.ts`)
- when there are no embers, everything behaves exactly as it does now

On success, clear `st.fire.embers` to 0 and set `st.fire.lit = true`. Leave `litSince` alone if it is already set - the run continues; set it to `state.minute` only when it is null.

Do not change the label or detail text to announce embers as a mechanism. If the row's detail already names its cost, letting it read a shorter time is enough.

- [ ] **Step 4: Run the tests and both gates**

Run: `npm test -- embers`, then `npm test && npm run build`.
Expected: green, including the existing failed-lighting test in `tests/goals-deeds.test.ts`, which must still pass because a cold fire is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tasks.ts src/sim/fire.ts tests/embers.test.ts
git commit -m "feat(survidle): coals take a breath and a stick, not a drill"
```

---

### Task 3: The three fire goals

**Files:**
- Modify: `src/sim/types.ts` (three `GoalId`s)
- Modify: `src/sim/goals.ts` (the ladder, two deed kinds)
- Modify: `src/sim/camp.ts` (emit the deeds)
- Test: `tests/goals-fire.test.ts`

**Interfaces:**
- Consumes: `goalDeed`, `Deed`, `GOALS` from `src/sim/goals.ts`; `hasEmbers`, `litSince`, `rainHeld` from Task 1.
- Produces: goal ids `keptNight`, `keptDays`, `keptRain` in the ladder.

- [ ] **Step 1: Read the existing ladder**

Read `src/sim/goals.ts` end to end. Note that `GoalId` is declared in `types.ts` and re-exported, that `activeGoals` widens at index 3 and 5, and that `tests/goals.test.ts` has a guard asserting no title names a route word derived from the real vocabularies. Your three titles must pass it.

- [ ] **Step 2: Write the failing test**

Create `tests/goals-fire.test.ts` covering, with real `advance()` runs rather than synthesised deeds:

- a fire lit before dusk and still alive at dawn credits `keptNight`; one that dies at 03:00 credits nothing
- a fire alive across seventy-two hours credits `keptDays`; a run broken on day two credits nothing and restarts the count
- a fire that comes through twenty-four hours of rain credits `keptRain`; rain that stops short credits nothing
- embers count as alive for all three

Write real assertions with real numbers; do not assert a restatement of the implementation.

- [ ] **Step 3: Run it and watch it fail**

Run: `npm test -- goals-fire`

- [ ] **Step 4: Add the deeds and the goals**

Two new `Deed` kinds in `src/sim/goals.ts`:

```ts
  | { kind: "keptNight" }
  | { kind: "keptFor"; minutes: number }
  | { kind: "keptRain"; minutes: number }
```

Three entries in `GOALS`, at the positions the spec names - after `cook`, after `bed`, and after `roof`:

```ts
  { id: "keptNight", title: "Keep a fire alive overnight", target: 1, credit: (d) => (d.kind === "keptNight" ? 1 : 0) },
  { id: "keptDays", title: "Keep a fire burning for three days without letting it go out", target: 1, credit: (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0) },
  { id: "keptRain", title: "Keep a fire through a day of rain", target: 1, credit: (d) => (d.kind === "keptRain" && d.minutes >= 24 * 60 ? 1 : 0) },
```

with `export const KEPT_DAYS = 3;` beside them.

Check the widening indices in `activeGoals` still put one goal at a time through the opening chain - three inserted goals shift every index after them, and the constants 3 and 5 in `width()` are positional. Re-derive them from the ladder rather than leaving the literals, or update them and say what you chose.

- [ ] **Step 5: Emit the deeds**

In `src/sim/camp.ts`'s `stepCamp`, where the fire's state is already being stepped:

- `keptFor`: when the fire is alive (lit or embers) and `litSince !== null`, emit `{ kind: "keptFor", minutes: state.minute - st.fire.litSince }` once a day rather than every tick, and only for the player's own region.
- `keptRain`: accumulate `st.fire.rainHeld` by `dt` while the fire is alive and it is raining; reset it to 0 when the fire dies; emit `{ kind: "keptRain", minutes: st.fire.rainHeld }` alongside.
- `keptNight`: emit `{ kind: "keptNight" }` at the dawn roll when the fire was alive continuously since dusk. Read the calendar's `sunset`/`sunrise` rather than a fixed span - a Norwegian April night and a December night differ by hours.

All three are the player's own region only: `mine && atCampHere` is too strict (the player may be away and come home to a live fire, which is the point), so gate on `mine` alone and think about whether that is right. Say what you chose in your report.

- [ ] **Step 6: Mutation-check every seam**

For each of the three deeds: delete its emission, run `npm test -- goals-fire`, confirm a test fails, restore, and confirm `git diff` is clean. Record which you did in your report. A seam you did not mutation-check is a seam that is not pinned.

- [ ] **Step 7: Both gates, then commit**

```bash
git add src/sim/types.ts src/sim/goals.ts src/sim/camp.ts tests/goals-fire.test.ts
git commit -m "feat(survidle): the ladder asks for a fire kept, not a fire lit again"
```

---

### Task 4: Goal 1 credits the gather

**Files:**
- Modify: `src/sim/goals.ts` (title and credit)
- Modify: `src/sim/actions.ts`, `src/sim/intent.ts` (remove the delivery seams, if nothing else needs them)
- Test: `tests/goals.test.ts`, `tests/goals-deeds.test.ts` (update)

- [ ] **Step 1: Find what produces firewood**

Read the `deadwood` and `split` cases in `src/sim/tasks.ts`'s `complete` - both call `produce(state, world, "firewood" | "wetFirewood", ...)`. That is the moment to credit: it has a definite time and cannot be replayed by moving items between piles.

- [ ] **Step 2: Write the failing test**

Update `tests/goals-deeds.test.ts` so that:

- gathering dead wood credits goal 1 by the kilos produced
- carrying firewood into camp and dropping it credits nothing
- taking firewood out of the camp pile and putting it back credits nothing

and update `tests/goals.test.ts`'s firewood expectations to the new title and credit.

- [ ] **Step 3: Change the credit**

In `src/sim/goals.ts`: the title becomes `Gather ${FIREWOOD_KG} kg of firewood`, and `credit` reads a `{ kind: "gathered"; item: ItemId; kg: number }` deed instead of `delivered`.

- [ ] **Step 4: Emit it, and remove what is now dead**

Emit `gathered` where firewood is produced. Then check whether anything still reads the `delivered` deed: if nothing does, remove it from the `Deed` union and remove its emissions from `src/sim/actions.ts` (`drop`, `dropAll`) and `src/sim/intent.ts` (`dropEverything`), along with the comment documenting the accepted over-credit, which no longer describes anything. **If something does still read it, keep it and say what in your report.**

- [ ] **Step 5: Mutation-check, both gates, commit**

Delete the `gathered` emission, confirm a test fails, restore, confirm `git diff` clean.

```bash
git add src/sim/goals.ts src/sim/actions.ts src/sim/intent.ts src/sim/tasks.ts tests/goals.test.ts tests/goals-deeds.test.ts
git commit -m "feat(survidle): the firewood goal counts the gathering, which cannot be faked"
```

---

### Task 5: Verification and balance

- [ ] **Step 1: Both gates and the slow suite**

`npm test`, `npm run build`, `npm run test:slow`. Record counts.

- [ ] **Step 2: Lint**

`../node_modules/.bin/biome lint` on every touched file.

- [ ] **Step 3: Balance, against the recorded baseline**

Run `npm run year` and `npm run december`. The pre-change baseline is at `/tmp/fire-baseline-year.log` and `/tmp/fire-baseline-dec.log`. Compare and report:
- firewood at camp on 1 December, 1 January and 1 April
- whether the survivor is alive at day 366
- any gate that moved

**Report the readings. Do not change `EMBER_MINUTES` to make a gate pass.**

- [ ] **Step 4: Browser pass**

Drive the real page and confirm a fire falling to coals reads as coals rather than as out, and that relighting from coals is quick. See the memory note on planting a save: the app overwrites `localStorage` on `pagehide`, so plant from a non-app URL on the same origin, and stamp `savedAt` to now or the away report will be the overlay on top.

---

### Task 6: Embers on screen

Added after the plan was first written. A tended fire passes through coals every
night, so this is the routine state and not an exception - and shown nowhere, a
banked fire is pixel-identical to a dead one. Run this AFTER Task 2.

**Files:**
- Modify: `src/ui/panels.ts` (the HERE panel's fire line, around line 352)
- Modify: `src/ui/map.ts` (`lightSources`, `MARKS`, the marker choice)
- Modify: `src/ui/bars.ts` (the fuel bar's text at embers)
- Modify: `src/style.css` (a coals mark, a banked glow)
- Test: `tests/emberui.test.ts`

**Interfaces:**
- Consumes: `hasEmbers`, `EMBER_MINUTES` from Task 1.
- Produces: nothing other tasks read.

- [ ] **Step 1: Read first**

`src/ui/panels.ts` around line 352 - the fire line is a two-way choice today,
`burning` (with `smoky` as a modifier) or `cold`. `src/ui/map.ts`:
`lightSources` returns `{cell, reach}` with reach 2 when fuel is at or above
`FIRE_LOW_KG` and 1 below it; `litRings` turns that into `.lit-0/-1/-2` classes,
and `.grid.night .c.lit-0` in `src/style.css` carries the pulse. `MARKS.fire` is
the `F` glyph.

- [ ] **Step 2: Write the failing test**

Create `tests/emberui.test.ts` asserting, against a real state driven to embers
by `advance()` rather than a hand-built literal:

- the HERE panel's fire line reads a third word for coals - not `burning`, not `cold`
- `lightSources` still includes an ember camp, at reach 0, so the cell itself is
  lit and the rings are not
- a dead fire (no embers) is in neither: no mark, no light source
- the fuel bar's text at embers does not read `0.0 kg`, which is what a dead fire reads

Write the assertions against what the functions return, not against a
reimplementation of them.

- [ ] **Step 3: The panel word**

The fire line becomes a three-way choice. `burning` and `cold` keep their exact
current words and classes; coals sit between them with the dim-but-not-dead
treatment. Say how long the coals have left if it reads naturally in the line's
existing shape - `fmtDuration` is already imported in that file's neighbourhood -
but do not restructure the line to fit it in.

- [ ] **Step 4: The map**

`lightSources` gains ember camps at `reach: 0`. Add a `coals` entry to `MARKS`
with its own glyph and label, and pick it where `MARKS.fire` is picked when the
fire has embers instead. Keep `F` for a lit fire; the coals glyph should read as
the same thing banked rather than as an unrelated symbol.

- [ ] **Step 5: The bar and the style**

In `src/ui/bars.ts`, the fuel text at embers says what the state is rather than
`0.0 kg`. Remember the churn budget (`tests/churn.test.ts`): a value that moves
every tick belongs in the per-frame text, which is where this already is, not in
panel markup.

In `src/style.css`, give the coals mark a colour dimmer than `.mk-fire`'s
`#b8431a`, and let a reach-0 ember source pulse slower and fainter than a lit
fire's `.lit-0`. The night fire drew the strongest reaction of the whole
playtest - bank it, do not kill it.

- [ ] **Step 6: Tests, both gates, commit**

`npm test -- emberui`, then `npm test && npm run build`. `tests/churn.test.ts`
and the map tests both exercise this code.

```bash
git add src/ui/panels.ts src/ui/map.ts src/ui/bars.ts src/style.css tests/emberui.test.ts
git commit -m "feat(survidle): a banked fire looks banked, not dead"
```
