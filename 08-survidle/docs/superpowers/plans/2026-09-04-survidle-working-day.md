# Survidle working day implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The intent runner rests by the fire after ten hours of task work a day; the reference list sets snares on day two; the April gate is re-measured and the roadmap says what was pulled forward and what the deaths name next.

**Architecture:** A new body need `"spent"` in `src/sim/body.ts` reads the ledger's `workMin` for today against `Player.workHours` (default 10, saved, no UI), marks `Player.restUntil` at the next dawn, and takes the camp step the cold need uses. The sleep clause gains "night and spent". `REFERENCE_ORDERS` in `src/sim/reference.ts` is reordered. A final task runs the three scripts and writes the roadmap.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom), vite-node for scripts. All commands run from `08-survidle/`.

**Spec:** `docs/superpowers/specs/2026-09-04-survidle-working-day-design.md`. Read it first; every task cites its section.

## Global Constraints

- Every quantity is real: hours, minutes, kcal. No abstract points.
- No em dashes, no unicode arrows or fancy quotes in any text, code, doc or commit message. Hyphens and ASCII only.
- Comments explain, never chronicle: no "was X, now Y", no dates in code or roadmap prose.
- `npm test` must stay under ten seconds (it is at 9.1 s). The day-long runner test is one run of one seed, alone in its file.
- `npm test` and `npm run build` pass before every commit; `npx biome lint <files>` from the repo root is clean on changed files.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`.
- Manual clicks (`startTask` from the Do panel) get no need: the working day lives in the intent runner only (spec 1.3).
- The collapse threshold (20), the bedtime threshold (60 at night), the sleep cap, the burn constants, the gate, the bands and the survivor rows do not move.
- Commit messages: `feat(survidle): ...` / `test(survidle): ...` / `docs(survidle): ...`, ending with the trailers:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_016XmwXXtHhPcM1pmVbpCyhR`.

## File map

| file | change |
|---|---|
| `src/sim/types.ts` | `BodyNeed` gains `"spent"`; `Player.workHours`, `Player.restUntil?` |
| `src/sim/body.ts` | `WORK_HOURS_DEFAULT`, `spentNow`; `currentNeed` reads it; `campStep` takes `"spent"` |
| `src/sim/newgame.ts`, `src/sim/save.ts` | `workHours: WORK_HOURS_DEFAULT` and its save default |
| `src/sim/reference.ts` | `REFERENCE_ORDERS` reordered; the doc comment says why |
| `tests/workday.test.ts` | new |
| `tests/reference.test.ts` | the list-order tests |
| `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` | the measured paragraph; the build order |

---

### Task 1: The working day

Spec 1.1 to 1.3.

**Files:**
- Modify: `src/sim/types.ts` (`BodyNeed` at line 162; `Player` after `berriesToday`)
- Modify: `src/sim/body.ts` (constants after `PROVISION_KG`; `currentNeed`; `campStep`)
- Modify: `src/sim/newgame.ts` (player literal), `src/sim/save.ts` (`fillDefaults`, beside `berriesToday`)
- Test: `tests/workday.test.ts` (new)

**Interfaces:**
- Consumes: `today(state)` from `ledger.ts` (`workMin` per day); `minutesUntilDawn(minute, startDoy)` from `calendar.ts`; `log` from `log.ts`; `kitOut` from `reference.ts` and `addOrder` from `orders.ts` in the test.
- Produces: `WORK_HOURS_DEFAULT = 10` and `spentNow(state): boolean` exported from `body.ts`; `Player.workHours: number`, `Player.restUntil?: number`; `BodyNeed` includes `"spent"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/workday.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { spentNow, WORK_HOURS_DEFAULT } from "../src/sim/body";
import { calendar, minutesUntilDawn, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { kitOut } from "../src/sim/reference";
import { deserialize, serialize } from "../src/sim/save";
import { startTask } from "../src/sim/tasks";

const LINE = "A day's work done. You rest by the fire.";

/** A kitted camp on seed 17 with one endless felling grind, the survivor fresh at 08:00. */
function felling() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  g.state.player.energy = 100;
  addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  return g;
}

describe("the working day", () => {
  it("is ten hours by default, on a new game and on a save without it", () => {
    const { state } = newGame(1);
    expect(WORK_HOURS_DEFAULT).toBe(10);
    expect(state.player.workHours).toBe(10);
    expect(state.player.restUntil).toBeUndefined();
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.workHours;
    expect(deserialize(JSON.stringify(raw))!.state.player.workHours).toBe(10);
  });

  it("a runner on a felling grind stops at ten hours, rests by the fire until dawn, and sleeps at nightfall", () => {
    const { state, world } = felling();
    // To 23:59 on day 1, an hour at a time, watching for the need.
    let sawSpent = false;
    let sawRest = false;
    for (let h = 0; h < 16; h++) {
      advance(state, world, 60);
      if (state.intent?.need === "spent") {
        sawSpent = true;
        if (state.task?.id === "rest") sawRest = true;
      }
    }
    expect(sawSpent).toBe(true);
    expect(sawRest).toBe(true);
    const day1 = state.ledger.find((d) => d.day === 1)!;
    expect(day1.workMin).toBeGreaterThanOrEqual(state.player.workHours * 60);
    expect(day1.workMin).toBeLessThan(state.player.workHours * 60 + 60);
    expect(state.log.filter((e) => e.text === LINE).length).toBe(1);
    // Nightfall: asleep whatever the energy, with the marker still set.
    expect(calendar(state.minute).isNight).toBe(true);
    expect(state.task?.id).toBe("sleep");
    expect(state.player.restUntil).toBeDefined();
  });

  it("the marker points at the next dawn, and clears there so the runner works again", () => {
    const { state, world } = felling();
    advance(state, world, 15 * 60);
    const until = state.player.restUntil!;
    expect(until).toBeGreaterThan(state.minute);
    // Dawn is where minutesUntilDawn said it was when the marker was set: at or before the sunrise after it.
    const dawnCal = calendar(until);
    expect(Math.abs(dawnCal.hour - dawnCal.sunrise)).toBeLessThan(0.02);
    // Step to an hour past that dawn: marker gone, day 2's count fresh, and the grind back on.
    advance(state, world, until - state.minute + 60);
    expect(state.player.restUntil).toBeUndefined();
    expect(spentNow(state)).toBe(false);
    expect(today(state).workMin).toBeLessThan(120);
    expect(state.intent?.need ?? null).not.toBe("spent");
    expect(state.task).not.toBeNull();
    expect(["chop", "walk", "travel", "haul", "split"]).toContain(state.task!.id);
  });

  it("spentNow sets the marker once at the cap and logs once", () => {
    const { state } = newGame(1);
    today(state).workMin = state.player.workHours * 60;
    expect(spentNow(state)).toBe(true);
    const until = state.player.restUntil!;
    expect(until).toBe(state.minute + minutesUntilDawn(state.minute, state.startDoy));
    expect(spentNow(state)).toBe(true);
    expect(state.player.restUntil).toBe(until);
    expect(state.log.filter((e) => e.text === LINE).length).toBe(1);
    state.minute = until;
    expect(spentNow(state)).toBe(false);
    expect(state.player.restUntil).toBeUndefined();
  });

  it("a chop started by hand has no intent and keeps going past ten hours", () => {
    const { state, world } = newGame(17);
    kitOut(state, world);
    state.player.energy = 100;
    today(state).workMin = 11 * 60;
    const cal = calendar(state.minute);
    expect(startTask(state, world, cal, "chop", undefined, true)).toBe(true);
    expect(state.intent).toBeNull();
    advance(state, world, 30);
    expect(state.task?.id).toBe("chop");
    expect(state.player.restUntil).toBeUndefined();
    expect(START_MINUTE_OF_DAY).toBe(480);
  });
});
```

If `startTask`'s signature differs from `(state, world, cal, id, arg, repeat)`, read it in `tasks.ts` and call it as it is; the point is the manual path main.ts uses (`case "task"` in `src/main.ts` calls `startTask`). If seed 17's felling walks far enough that ten hours of work do not fit before 23:59, drive with `advance(state, world, 60)` for up to 16 hours as written and, if `sawSpent` is still false, check the ledger's `workMin` at midnight: the test's premise is a day with over ten hours of work, and the report says what the seed did.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/workday.test.ts`
Expected: FAIL: `WORK_HOURS_DEFAULT` and `spentNow` are not exported; `workHours` is undefined.

- [ ] **Step 3: The types, the default and the save**

`src/sim/types.ts`:

```ts
export type BodyNeed = "sleep" | "storm" | "cold" | "hungry" | "thirsty" | "spent" | "home";
```

and in `Player`, after `berriesToday`:

```ts
  /** Hours of task work a day before the body calls it a day and rests by the fire; a default the panel may expose later. */
  workHours: number;
  /** Set when the day's work is done: the minute of the next dawn, until which the runner rests. */
  restUntil?: number;
```

`src/sim/newgame.ts`: `workHours: WORK_HOURS_DEFAULT,` in the player literal, importing `WORK_HOURS_DEFAULT` from `./body`. If that import makes a cycle at module load (`body.ts` imports `tasks.ts` which imports ... `newgame.ts`? It should not; `newgame.ts` is a leaf that imports `regionstate`, `skills`, `weather`, `ledger`, `items`, `calendar`), fall back to defining `WORK_HOURS_DEFAULT` in `types.ts`-adjacent `units.ts` and re-exporting it from `body.ts`.

`src/sim/save.ts` `fillDefaults`, beside `p.berriesToday ??= ...`: `p.workHours ??= WORK_HOURS_DEFAULT;`.

- [ ] **Step 4: The need**

In `src/sim/body.ts`, after `const PROVISIONS`:

```ts
/** Hours of task work a day before the body calls it a day: a camp-builder's working day, with the evening by the fire. */
export const WORK_HOURS_DEFAULT = 10;

/**
 * A day's work is done. The ledger already counts every minute awake on a
 * task other than rest, wait, night or sleep, so the runner reads the same
 * number the report prints. The first time the count reaches the working
 * day, the marker is set to the next dawn and the log says so once; it
 * holds until then and clears itself, and the day roll starts the count
 * again. The marker lives on the player, not the intent, so an order
 * switching intents in the evening does not start the day over.
 */
export function spentNow(state: GameState): boolean {
  const p = state.player;
  if (p.restUntil !== undefined) {
    if (state.minute < p.restUntil) return true;
    p.restUntil = undefined;
  }
  if (today(state).workMin < p.workHours * 60) return false;
  p.restUntil = state.minute + minutesUntilDawn(state.minute, state.startDoy);
  log(state, "A day's work done. You rest by the fire.");
  return true;
}
```

with `today` imported from `./ledger` and `minutesUntilDawn` from `./calendar` (the file imports `Calendar` as a type already; add the value import).

`currentNeed` becomes:

```ts
export function currentNeed(state: GameState, world: World, cal: Calendar, it: Intent): BodyNeed | null {
  const p = state.player;
  const spent = spentNow(state);
  // A spent body goes to bed at nightfall whatever its energy: an evening by
  // the fire gives back enough to carry it past the night clause otherwise.
  const sleep = it.need === "sleep"
    || p.energy <= SLEEP_AT
    || (cal.isNight && (p.energy < NIGHT_SLEEP_UNDER || spent))
    || (it.task === "night" && it.done < 1);
  if (sleep) return "sleep";
  if (stormComing(state.weather, state.minute) || stormNow(state.weather, state.minute)) return "storm";
  // Warm again: whatever a spent rest gave up on is worth trying afresh next time it turns cold.
  if (p.warmth >= WARM_AT) it.coldSpent = false;
  const cold = !it.coldSpent && (p.warmth < COLD_UNDER || (it.need === "cold" && p.warmth < WARM_AT));
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (p.water < THIRSTY_L && canQuench(state, world, cal)) return "thirsty";
  if (p.kcal < HUNGRY_UNDER && canFeed(state, world, cal, it)) return "hungry";
  if (spent) return "spent";
  if (homeBeforeDark(state, world, cal, it)) return "home";
  return null;
}
```

`campStep` takes `need: "sleep" | "cold" | "spent"`:

```ts
function campStep(state: GameState, world: World, cal: Calendar, it: Intent, need: "sleep" | "cold" | "spent"): Step {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const here = cellOf(state, world);
  if (here !== st.campCell) {
    const why = need === "sleep" ? " for the night" : need === "cold" ? " to warm up" : " for the evening";
    if (check(state, world, cal, "walk", `cell:${st.campCell}`).ok) return walkStep(state, world, st.campCell, why);
    const s: Step = need === "sleep"
      ? { id: "sleep", step: "sleeping where you stand; no way to camp" }
      : need === "cold"
        ? { id: "rest", step: "resting to warm up; no way to camp" }
        : { id: "rest", step: "resting after the day's work; no way to camp" };
    if (!isRunning(state, s) && need === "sleep") log(state, "No way to camp from here. You sleep where you are.", "bad");
    return s;
  }
  const fs = fireStep(state, world, cal, st.campCell);
  if (fs) return fs;
  if (need === "sleep") {
    const s: Step = { id: "sleep", step: "sleeping" };
    if (!isRunning(state, s) && st.campCell !== it.campCell) log(state, `You turn in at camp in ${regionAt(world, p.region).name}.`);
    return s;
  }
  if (need === "cold") return { id: "rest", step: st.fire.lit ? "warming up by the fire" : "resting to warm up" };
  return { id: "rest", step: st.fire.lit ? "resting by the fire after the day's work" : "resting after the day's work" };
}
```

`bodyStep`'s `default` already routes `"spent"` to `campStep`; the type widening is all it needs. Check `tasks.ts` around line 813 to 822: the rest-completion judgement is keyed on `it.need === "cold"` and so leaves a spent rest alone; a completed rest under `"spent"` simply rests again next minute because the need still holds.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/workday.test.ts tests/body.test.ts tests/needs.test.ts tests/intent.test.ts tests/horizon.test.ts`, then `npm test` (note the runtime), `npm run build`, biome.
Expected: PASS. If an existing body or needs test now sees `"spent"` where it expected null (a test that drives a runner past ten hours of work), the test's premise changed: set `state.player.workHours = 24` in that test's set-up with a one-line comment saying the test is about the other need, and say so in the report.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/tests/workday.test.ts
git commit -m "feat(survidle): a day's work done - the runner rests by the fire after ten hours and sleeps at nightfall"
```

(add any test file touched in Step 5.)

---

### Task 2: Food on day two

Spec 2. The reference list reordered, with its fallback measured.

**Files:**
- Modify: `src/sim/reference.ts:52-81` (`REFERENCE_ORDERS` and its doc comment)
- Test: `tests/reference.test.ts`

**Interfaces:**
- Produces: `REFERENCE_ORDERS` in the spec's order. The count is unchanged (27 entries).

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, replace the test "the list keeps two kilos of berries at camp, after the cook keeps and before the rack" with:

```ts
  it("a competent day two: the knife and the snares right after the fire is lit, before the felling", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const at = (s: string) => tasks.findIndex((t) => t.startsWith(s));
    expect(at("light::keep")).toBeGreaterThan(-1);
    expect(at("craft:knife:job:once")).toBe(at("light::keep") + 1);
    expect(at("craft:snare:keep")).toBe(at("craft:knife:job:once") + 1);
    expect(at("build:snare:job:times")).toBe(at("craft:snare:keep") + 1);
    expect(at("chop::keep")).toBe(at("build:snare:job:times") + 1);
    expect(at("build:leanTo:job:once")).toBeGreaterThan(at("chop::keep"));
  });

  it("the fish keep follows the cook keeps and comes before the berries keep and the rack", () => {
    const tasks = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}`);
    const cook = tasks.lastIndexOf("cook:");
    expect(tasks[cook - 1]).toBe("cook:fish");
    expect(tasks[cook + 1]).toBe("fish:any");
    expect(tasks[cook + 2]).toBe("berries:");
    expect(tasks[cook + 3]).toBe("build:dryingRack");
    expect(REFERENCE_ORDERS.length).toBe(27);
  });
```

Other tests in that file that assert the list's order by index (search for `REFERENCE_ORDERS[` and `findIndex`) are read and updated to the new order; the "knife, fire drill, fishing spear and bow are made once; the axe keep stays" test does not depend on position and stays.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Reorder the list**

`REFERENCE_ORDERS` becomes:

```ts
export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 4, "cordage"),
  job("build", { kind: "once" }, "firePit"),
  job("craft", { kind: "once" }, "fireDrill"),
  keep("light", 1),
  job("craft", { kind: "once" }, "knife"),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  keep("chop", 4),
  keep("split", 60),
  job("build", { kind: "once" }, "leanTo"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("craft", { kind: "once" }, "fishingSpear"),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  keep("fish", 1, "any"),
  keep("berries", 2),
  job("build", { kind: "once" }, "dryingRack"),
  keep("hang", 10),
  job("craft", { kind: "once" }, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("craft", 1, "axe"),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];
```

Rewrite the sentences of the doc comment above it that describe the old placement of the snares ("The snare craft and its five-times build sit above the fish keep too, right after the hang keep ...") to say: the knife and the snares come the moment the fire is lit, before a tree is felled, because a competent day two sets snares - the knife is two stone, a stick and a cordage, each snare a stick and two cordage, and five snares where hares live are the beginner's whole small-game band for a few minutes of work; the fish keep sits right after the cook keeps so the spear is used the day it exists. Keep the rest of the comment.

- [ ] **Step 4: Run the tests, then the measurement that decides the fallback**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts tests/ladder.test.ts tests/workday.test.ts`, then `npm test`, `npm run build`, biome.
Expected: PASS. The day-on-a-checkpoint-day fixture in `tests/reference.test.ts` (seed 11 dying on `REFERENCE_TARGET_DAY`) may move again; if it does, find a seed that dies on the gate day with a short script (`runReference(seed, 30)` over seeds 1 to 120, printing those whose outcome day equals `REFERENCE_TARGET_DAY`) and re-seed it, with the comment saying only why the seed is used.

Then run the April gate once: `npm run reference > <scratch>/april-reorder.txt` (a couple of minutes; foreground, generous timeout; `<scratch>` is the session scratchpad's `runs` directory). Read the four seeds' death days and causes. The pass's April run had one cold death (seed 79, day 16). If two or more seeds now die of cold, or the cold death comes earlier than day 16, apply the fallback: move `job("craft", { kind: "once" }, "knife")` back to after the lean-to (its old place) and put the two snare entries right after it, update the two tests above to that order (knife after lean-to; snares right after the knife; chop keep right after the light keep), re-run the suite and the April gate once more, and say in the report which order stands and why, with both runs' death lines.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): the reference player sets snares on day two, before a tree is felled"
```

---

### Task 3: Measure, record, and read the deaths

Spec 3. Docs only, plus the runs.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the calibration section's end; the build-order paragraph under "The eight sub-projects, in order"; the "What the north yields" bullet "The runner sleeps six to twelve hours a day" if it still reads as unmeasured)

- [ ] **Step 1: The runs**

```
npm run reference > <scratch>/april-workday.txt
npm run reference -- --kitted 17 19 42 79 60 > <scratch>/kitted-workday.txt
npm run horizon > <scratch>/horizon-workday.txt
```

Read each: per seed the death day and cause (or the gate line), the day-26 (or death) week block's burn buckets, work hours and sleep hours, the yield per source; the twelve horizon rows.

- [ ] **Step 2: The roadmap**

At the end of "The calibration pass" section (after the horizon paragraph that begins "`npm run horizon` after the pass"), add a paragraph in the section's voice headed by what was pulled forward: "Pulled forward after the pass: the working day and snares on day two (`2026-09-04-survidle-working-day-design.md`)." Then the numbers: the four-seed April week (base, work with activity and walk, cold, total, work hours, sleep hours) against the pass's after-sleep week (base 1,680, work 2,260, cold 202, 4,141, 13.0 h, 8.7 h); the yields per source where any seed has one; the gate's standing per seed with the food clause; the kitted standing; the horizon rows and how many sit in band, and what ends them. Then the stop rule's reading, in one sentence: green and F core is next; or starvation still, so the basket trap is pulled forward; or thirst, so item 3's water storage is.

In the build-order paragraph under "The eight sub-projects, in order", after "then the calibration pass (...; built)", insert: "then the working day and snares on day two (the section of that name in the calibration pass: a spent body rests by the fire after ten hours, and the reference list sets snares before it fells a tree; built)". If the stop rule pulled the trap or the water storage, add that as the next step in the same sentence, marked "next", and take it out of its later position with a clause saying it was pulled forward and why.

Search the section for "Task 6" or any plan-task number and remove it if one is found.

- [ ] **Step 3: Commit**

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the working day measured, the gates' standing, and what the deaths pull forward next"
```

---

## Self-review against the spec

- 1.1 the number: Task 1 (field, default, save).
- 1.2 the need, the marker, the log, the step, the nightfall sleep: Task 1.
- 1.3 manual untouched: Task 1's last test; the horizon and forecast inherit by construction (the horizon test file runs the same runner).
- 2 the list order and its fallback: Task 2, with the measurement that decides the fallback inside the task.
- 3 measure, record, stop rule, build order: Task 3.
- 4 tests: Tasks 1 and 2.
- 5 out of scope: nothing here touches the gate, the bands, the trap or a panel.
