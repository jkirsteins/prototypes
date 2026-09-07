# Survidle Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game's mechanics legible: a modal the first time this
survivor opens a rung, a welcome that adapts to who just landed, and four
rules that already run start saying what they do.

**Architecture:** The sim owns the queue and the copy and never touches
the DOM, the rule `src/sim/cues.ts` already follows. `src/sim/skills.ts`
already detects every rung crossing and gains a three-line queue push.
`src/sim/teach.ts` holds the tables and the welcome's lines. A new
`src/ui/teachpanel.ts` renders both overlays and builds the live example
from the Do panel's own rows. `src/main.ts` gains two entries on its
overlay chain and a real pause on the frame gate.

**Tech Stack:** TypeScript, Vite, vitest, happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-survidle-legibility-design.md`

## Global Constraints

- Working directory is `08-survidle`. Run every command from there.
- `npm test` and `npm run build` must both pass before any commit.
  `npm run build` is `tsc` then `vite build`.
- Stage with explicit paths scoped to `08-survidle`. **Never `git add -A`**
  - sibling sessions work in this repo at the same time.
- No em dashes and no non-typable unicode anywhere, in code, copy or
  commit messages. Use `-`, `->`, `"`, `...`.
- Comments explain, never chronicle: no dates, no "before/after", no
  reference to what the code used to do.
- Panels are morphed, not reassigned (`setPanel` diffs). Never put a
  moving number in a bar's inline width; `tests/churn.test.ts` holds that
  line.
- Copy is in the game's voice: plain, concrete, no exclamation marks, no
  second-person cheerleading. `{You}` / `{your}` templating is for log
  lines only (`src/sim/voice.ts`); overlay copy is written directly.
- The five rungs are `job | grind | keep | condition | pace`, at levels
  `3 | 5 | 10 | 15 | 20` (`RUNG_LEVEL` in `src/sim/skills.ts`). Do not
  restate those numbers as literals anywhere; read the table.

---

### Task 1: The queue, per survivor

The state machine, with nothing rendering it yet. `Rung` moves to
`types.ts` so `GameState` can name it, and `skills.ts` re-exports it so
every existing import keeps working.

**Files:**
- Modify: `src/sim/types.ts` (the `Rung` type; two `GameState` fields)
- Modify: `src/sim/skills.ts` (re-export `Rung`; `teachOnce`,
  `markTaught`; call them from `train` and `carrySkills`)
- Create: `src/sim/teach.ts` (`resetTeaching` only, for now)
- Modify: `src/sim/newgame.ts:104-121` (the state literal)
- Modify: `src/sim/save.ts` (`fillDefaults`)
- Modify: `src/sim/landing.ts:254` (`land`)
- Test: `tests/teach.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Rung = OrderKind | "condition" | "pace"` from `src/sim/types.ts`
  - `GameState.taught: Partial<Record<Rung, true>>`
  - `GameState.teachQueue: Rung[]`
  - `teachOnce(state: GameState, r: Rung): void` from `src/sim/skills.ts`
  - `markTaught(state: GameState, r: Rung): void` from `src/sim/skills.ts`
  - `resetTeaching(state: GameState): void` from `src/sim/teach.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/teach.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { resetTeaching } from "../src/sim/teach";
import { levelMinutes, markTaught, RUNG_LEVEL, teachOnce } from "../src/sim/skills";
import { load, save } from "../src/sim/save";

describe("the teaching queue", () => {
  it("queues a rung once, however many skills open it", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    teachOnce(state, "job");
    expect(state.teachQueue).toEqual(["job"]);
    expect(state.taught.job).toBe(true);
  });

  it("keeps the order the rungs were earned in", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    teachOnce(state, "grind");
    expect(state.teachQueue).toEqual(["job", "grind"]);
  });

  it("never queues a rung the survivor landed already holding", () => {
    const { state } = newGame(17);
    markTaught(state, "job");
    teachOnce(state, "job");
    expect(state.teachQueue).toEqual([]);
    expect(state.taught.job).toBe(true);
  });

  it("clears both fields, so the next survivor learns for themselves", () => {
    const { state } = newGame(17);
    teachOnce(state, "job");
    resetTeaching(state);
    expect(state.taught).toEqual({});
    expect(state.teachQueue).toEqual([]);
  });

  it("carries the queue through a save, so a rung earned with the tab shut is still waiting", () => {
    const { state } = newGame(17);
    teachOnce(state, "keep");
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    save(state, storage);
    const back = load(storage)!.state;
    expect(back.teachQueue).toEqual(["keep"]);
    expect(back.taught.keep).toBe(true);
  });

  it("gives a save written without the fields an empty queue rather than undefined", () => {
    const { state } = newGame(17);
    // A save from before this item has neither field.
    const older = JSON.parse(JSON.stringify(state));
    older.taught = undefined;
    older.teachQueue = undefined;
    const store = new Map<string, string>([["survidle.save", JSON.stringify({ v: 1, state: older })]]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    const back = load(storage);
    expect(back?.state.taught).toEqual({});
    expect(back?.state.teachQueue).toEqual([]);
  });

  it("queues the rung a skill crosses by practice", () => {
    const { state } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.job) - 1;
    // One minute of felling carries Woodcraft over the jobs rung.
    state.task = { id: "chop", arg: undefined } as typeof state.task;
    expect(RUNG_LEVEL.job).toBeGreaterThan(1);
  });
});
```

Before writing, confirm the exact signatures of `save` and `load` in
`src/sim/save.ts` and the storage key they use, and adjust the two
storage tests to match. If `save` takes no storage argument, use the
happy-dom `localStorage` the other save tests use; read
`tests/advance-save.test.ts` for the pattern this repo already has and
follow it rather than inventing a second one. Delete the last test above
(`queues the rung a skill crosses by practice`) and rewrite it in Step 7
against the real `train` call; it is a placeholder for the shape only and
must not ship as written.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/teach.test.ts
```

Expected: FAIL, `resetTeaching` and `teachOnce` are not exported.

- [ ] **Step 3: Move `Rung` into `types.ts`**

In `src/sim/types.ts`, beside `OrderKind`, add:

```ts
/** What an order may say: its kind, and past the keep, the conditions and the pace it may carry. */
export type Rung = OrderKind | "condition" | "pace";
```

In `src/sim/skills.ts`, delete the local `export type Rung = ...` line and
replace it with a re-export beside the other exports, so every file that
imports `Rung` from `skills` keeps working:

```ts
export type { Rung } from "./types";
```

Add `Rung` to the existing `import type { ... } from "./types"` list in
`skills.ts` so the file's own `Record<Rung, ...>` tables still resolve.

- [ ] **Step 4: Add the two fields**

In `src/sim/types.ts`, at the end of `GameState`, after `manualSeen`:

```ts
  /**
   * The rungs this survivor has been shown a moment for, and the ones
   * earned but not yet shown. Per survivor, not per world: a moment is
   * about what this life can newly reach, so both are cleared on a
   * landing. A rung an heir lands already holding is marked here without
   * being queued - the welcome names those instead.
   */
  taught: Partial<Record<Rung, true>>;
  teachQueue: Rung[];
```

In `src/sim/newgame.ts`, in the state literal after `manualSeen: false,`:

```ts
    taught: {},
    teachQueue: [],
```

In `src/sim/save.ts`, in `fillDefaults`, after `state.manualSeen ??= false;`:

```ts
  state.taught ??= {};
  state.teachQueue ??= [];
```

- [ ] **Step 5: Write the queue helpers**

In `src/sim/skills.ts`, directly under `RUNG_LINE`:

```ts
/**
 * Queues a rung's moment the first time this survivor opens it by
 * practice. The log line beside the call is written on every unlock, in
 * every skill; only the moment is once, and marking it here rather than
 * when the modal closes is what makes two skills crossing the same rung
 * inside one offline catch-up queue it once.
 */
export function teachOnce(state: GameState, r: Rung): void {
  if (state.taught[r]) return;
  state.taught[r] = true;
  state.teachQueue.push(r);
}

/** A rung the survivor landed already holding: known, so never a moment. The welcome names it instead. */
export function markTaught(state: GameState, r: Rung): void {
  state.taught[r] = true;
}
```

Create `src/sim/teach.ts`:

```ts
/**
 * The teaching layer: what the game stops to explain, and when. The sim
 * names the moment and writes its words; whoever is listening draws it,
 * the same division src/sim/cues.ts keeps for sound.
 */
import type { GameState } from "./types";

/** A new survivor learns for themselves: a moment is about what this life can newly reach. */
export function resetTeaching(state: GameState): void {
  state.taught = {};
  state.teachQueue = [];
}
```

- [ ] **Step 6: Reset on every landing**

In `src/sim/landing.ts`, in `land`, immediately after the
`if (!l || !name) return;` guard, before either branch:

```ts
  // Both branches land a new survivor, and a moment is theirs alone.
  // Ahead of carrySkills below, so the rungs a carried level opens are
  // marked known against an empty slate rather than a dead person's.
  resetTeaching(state);
```

Add `import { resetTeaching } from "./teach";` to the imports.

- [ ] **Step 7: Wire the two unlock sites**

In `src/sim/skills.ts`, in `train`, the existing loop becomes:

```ts
    for (const k of RUNG_ORDER) {
      if (before < RUNG_LEVEL[k] && after >= RUNG_LEVEL[k]) {
        log(state, RUNG_LINE[k](SKILL_NAMES[skill]), "good");
        teachOnce(state, k);
      }
    }
```

In `carrySkills`, the existing loop becomes:

```ts
    // A rung carried in is a rung the survivor lands knowing: the log says so
    // and the welcome names it, but it is never stopped for.
    for (const k of RUNG_ORDER) {
      if (l >= RUNG_LEVEL[k]) {
        log(state, RUNG_LINE[k](SKILL_NAMES[id]), "good");
        markTaught(state, k);
      }
    }
```

Now replace the placeholder test from Step 1 with a real one:

```ts
  it("queues a rung the moment practice crosses it, and only then", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.job) - 1;
    state.task = { id: "chop", arg: "spruce", fraction: 0, cell: 0, minutes: 0 } as unknown as GameState["task"];
    train(state, world, 2);
    expect(state.teachQueue).toEqual(["job"]);
  });

  it("leaves the queue empty for an heir, however many rungs they carry", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.grind);
    const rec = current(state);
    rec.skills = { ...rec.skills, woodcraft: state.skills.woodcraft.xp * 8 };
    resetTeaching(state);
    carrySkills(state, rec);
    expect(state.teachQueue).toEqual([]);
    expect(state.taught.job).toBe(true);
    expect(state.taught.grind).toBe(true);
  });
```

Read `tests/carry.test.ts` for how that suite builds a `LifeRecord` with
skill minutes on it and copy that construction rather than the sketch
above, so the two suites agree on how an ancestor is made. The assertions
are what matter: an heir's queue is empty and the carried rungs are
marked.

- [ ] **Step 8: Run the tests and the build**

```bash
npx vitest run tests/teach.test.ts tests/carry.test.ts
npm test
npm run build
```

Expected: all pass. `tests/carry.test.ts` already asserts the rung lines
are logged on a carry; that must still hold, because the log line did not
move.

- [ ] **Step 9: Commit**

```bash
git add src/sim/types.ts src/sim/skills.ts src/sim/teach.ts src/sim/newgame.ts src/sim/save.ts src/sim/landing.ts tests/teach.test.ts
git commit -m "feat(survidle): a survivor's own reckoning of what they have learned to ask for"
```

---

### Task 2: The concept moment

The five moments, their live example, and the overlay that shows them one
at a time behind everything else.

**Files:**
- Modify: `src/sim/teach.ts` (`CONCEPTS`)
- Create: `src/ui/teachpanel.ts` (`exampleFor`, `conceptHtml`)
- Modify: `src/ui/render.ts` (`UiState.teach`, `newUiState`)
- Modify: `src/main.ts` (overlay chain, frame gate, `teach-close`)
- Modify: `src/style.css` (the box)
- Test: `tests/teach.test.ts`

**Interfaces:**
- Consumes: `Rung`, `GameState.teachQueue`, `resetTeaching` (Task 1).
- Produces:
  - `CONCEPTS: Record<Rung, { title: string; lines: string[] }>` from
    `src/sim/teach.ts`
  - `exampleFor(state: GameState, world: World, cal: Calendar, r: Rung): string | null`
    from `src/ui/teachpanel.ts`
  - `conceptHtml(state: GameState, world: World, cal: Calendar, r: Rung): string`
    from `src/ui/teachpanel.ts`
  - `UiState.teach: Rung | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/teach.test.ts`:

```ts
describe("a concept moment", () => {
  it("has an entry for every rung, so a rung cannot open into silence", () => {
    for (const r of RUNG_ORDER) {
      expect(CONCEPTS[r].title.length).toBeGreaterThan(0);
      expect(CONCEPTS[r].lines.length).toBeGreaterThan(0);
    }
  });

  it("names the concept, not the skill: the skill's own line is the log's", () => {
    for (const r of RUNG_ORDER) {
      const text = CONCEPTS[r].lines.join(" ");
      for (const name of Object.values(SKILL_NAMES)) expect(text).not.toContain(name);
    }
  });

  it("builds an example a player could actually give, as the order list would print it", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.grind);
    const ex = exampleFor(state, world, cal, "grind");
    expect(ex).not.toBeNull();
    expect(ex).toMatch(/forever/);
  });

  it("shows prose alone rather than inventing an example when no row is startable", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    // No skill has reached the pace rung, so no row can carry one.
    expect(exampleFor(state, world, cal, "pace")).toBeNull();
  });

  it("never throws for any rung, at any level", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    for (const r of RUNG_ORDER) {
      for (const xp of [0, levelMinutes(RUNG_LEVEL.pace)]) {
        state.skills.woodcraft.xp = xp;
        expect(() => exampleFor(state, world, cal, r)).not.toThrow();
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/teach.test.ts
```

Expected: FAIL, `CONCEPTS` and `exampleFor` are not exported.

- [ ] **Step 3: Write the copy**

In `src/sim/teach.ts`:

```ts
/**
 * What each rung is, in the concept's own terms. The skill that opened it
 * is the log line's business (RUNG_LINE in skills.ts, written on every
 * unlock in every skill); these lines are shown once per survivor and
 * must read the same whichever skill got there first.
 */
export const CONCEPTS: Record<Rung, { title: string; lines: string[] }> = {
  job: {
    title: "Jobs",
    lines: [
      "Until now every piece of work was a click of yours: one job, done once, watched.",
      "A skill practised this far keeps count for you. Say how many, or say what camp should end up holding, and walk away.",
    ],
  },
  grind: {
    title: "Grinds",
    lines: [
      "A grind is work that never ends.",
      "It takes every hour the list leaves free and never drops off, so it is what you put under everything else: the wood that keeps coming in while the real jobs get done.",
    ],
  },
  keep: {
    title: "Keeps",
    lines: [
      "A keep watches a pile instead of counting the work.",
      "Name what camp should hold and it goes quiet when the pile is there and starts again when it drops. It reads the stored forms too, so meat on the rack counts against meat kept.",
    ],
  },
  condition: {
    title: "Conditions",
    lines: [
      "An order can now say when, not only what.",
      "A season it runs in, a stock line it waits behind, the level a keep restarts at, a count to make each day. Work that waits for its moment costs nothing while it waits.",
    ],
  },
  pace: {
    title: "Pace",
    lines: [
      "An order can now carry a date.",
      "A keep can be due by a month, held at its figure after it, or spent by the season's close. This is how a winter is stocked in summer without you counting the days.",
    ],
  },
};
```

- [ ] **Step 4: Build the example and the box**

Create `src/ui/teachpanel.ts`:

```ts
/**
 * The two overlays that teach: the moment a rung opens, and the welcome a
 * survivor lands to. Both take their words from src/sim/teach.ts and their
 * examples from the Do panel's own rows, so a moment can never promise an
 * order the panel would not give.
 */
import type { Calendar } from "../sim/calendar";
import { intentOption } from "../sim/intent";
import { orderGate } from "../sim/ladder";
import { orderSentence } from "../sim/orders";
import { RUNG_LEVEL, SKILL_IDS, skillLevel } from "../sim/skills";
import { CONCEPTS } from "../sim/teach";
import type { GameState, Order, Rung, SkillId, TaskId } from "../sim/types";
import { regionAt, type World } from "../world/gen";
import { intentGroups } from "./dopanel";
import { esc, defaultChoiceFor, rowRequest, type RowChoice } from "./render";

/** The kind a rung's example is given as: the rung's own, or for a condition and a pace the keep they are laid on. */
const EXAMPLE_UNTIL: Record<Rung, RowChoice["until"]> = {
  job: "times", grind: "forever", keep: "keep", condition: "keep", pace: "keep",
};

/**
 * One order this survivor could give right now, printed the way the order
 * list would print it. Built from a real row and run through the real
 * gate, so an example is never an order the panel would refuse. Null when
 * nothing on the panel can carry the rung, and the moment then shows its
 * prose alone rather than inventing work.
 */
export function exampleFor(state: GameState, world: World, cal: Calendar, r: Rung): string | null {
  const ready = new Set<SkillId>(SKILL_IDS.filter((s) => skillLevel(state, s) >= RUNG_LEVEL[r]));
  if (!ready.size) return null;
  for (const g of intentGroups(regionAt(world, state.player.region))) {
    for (const { id, arg } of g.items) {
      const o = intentOption(state, world, cal, id as TaskId, arg, "nearest");
      if (!o.ok) continue;
      const choice: RowChoice = { ...defaultChoiceFor(id as TaskId), until: EXAMPLE_UNTIL[r], n: 10 };
      const { req, kind } = rowRequest(choice, id as TaskId, arg);
      if (!orderGate(state, req, kind).ok) continue;
      const order: Order = { id: -1, kind, req, done: 0, minutes: 0, skipped: "" };
      return orderSentence(state, world, cal, order);
    }
  }
  return null;
}

export function conceptHtml(state: GameState, world: World, cal: Calendar, r: Rung): string {
  const c = CONCEPTS[r];
  const example = exampleFor(state, world, cal, r);
  const shown = example
    ? `<p class="dim">You could now say:</p><p class="example">${esc(example)}</p>`
    : "";
  return `<div class="box teach">
<h1>${esc(c.title)}</h1>
${c.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
${shown}
<button class="act" data-act="teach-close">Got it</button>
</div>`;
}
```

`defaultChoiceFor` and `rowRequest` are already exported from
`src/ui/render.ts`; confirm the import list compiles and add `RowChoice`
to the type imports if it is not already exported as a type.

Note the condition and pace rows: `rowRequest` builds their `when` block
from the row's fields, which an example has none of. Both examples are
therefore a plain keep, and their prose carries what the rung adds. That
is deliberate: a keep the player can really give beats a sentence they
cannot.

- [ ] **Step 5: Add the UI state and the overlay**

In `src/ui/render.ts`, in `UiState` beside `manual`:

```ts
  /** The rung whose moment is open, drained from state.teachQueue. */
  teach: Rung | null;
```

and in `newUiState`, add `teach: null,` to the literal. Import `Rung`
from `../sim/types`.

In `src/main.ts`, in `render`, the overlay chain gains a branch **after**
the `state.dead` branch and before the `else`:

```ts
  } else if (ui.teach) {
    setPanel("overlay", conceptHtml(state, world, cal, ui.teach));
    overlay.hidden = false;
```

Read the surrounding block first: `cal` must already be in scope there.
If it is not, compute it the way the other panels in `render` do rather
than threading a new argument.

- [ ] **Step 6: Drain the queue and pause the clock**

In `src/main.ts`, in `frame`, replace the gate:

```ts
  if (!state.dead && !state.landing && !ui.away && !ui.teach) {
```

and in the `else if (ui.away)` branch's neighbourhood add:

```ts
  } else if (ui.teach) {
    // An open moment holds the game still. Without the bump, a modal left
    // open past thirty seconds trips the catch-up branch above and the
    // player dismisses it into an away report they never earned.
    lastReal = now;
  }
```

Still in `frame`, before `render()`, drain one at a time:

```ts
  // One moment at a time, and never over a landing, a tombstone or an away
  // report: those overlays win the chain in render(), so a rung earned under
  // them waits in the queue until they are gone.
  if (!ui.teach && !ui.away && !ui.manual && !state.landing && !state.dead && state.teachQueue.length) {
    ui.teach = state.teachQueue.shift()!;
  }
```

In `onClick`, beside `manual-close`:

```ts
    case "teach-close":
      ui.teach = null;
      lastReal = performance.now();
      break;
```

The `lastReal` bump matches what `dismiss` already does for the away
report, and is what keeps a long-open moment from being read as time
spent away.

- [ ] **Step 7: Style the box**

In `src/style.css`, beside the `#overlay .box.manual` rules:

```css
#overlay .box.teach { max-width: 460px; }
#overlay .box.teach p { margin: 6px 0; }
#overlay .box.teach .example {
  font-weight: 600;
  padding: 8px 10px;
  border-left: 3px solid var(--accent);
  margin: 4px 0 0;
}
```

Confirm `--accent` is the variable this sheet already uses for the accent
colour; if it carries another name, use that one rather than adding a
second.

- [ ] **Step 8: Run the tests and the build**

```bash
npx vitest run tests/teach.test.ts
npm test
npm run build
```

Expected: all pass, `tests/churn.test.ts` included.

- [ ] **Step 9: Commit**

```bash
git add src/sim/teach.ts src/ui/teachpanel.ts src/ui/render.ts src/main.ts src/style.css tests/teach.test.ts
git commit -m "feat(survidle): the game stops once when it changes shape, and shows an order you could now give"
```

---

### Task 3: The welcome

**Files:**
- Modify: `src/sim/teach.ts` (`TIPS`, `tipFor`, `welcomeLines`)
- Modify: `src/ui/teachpanel.ts` (`welcomeHtml`)
- Modify: `src/ui/render.ts` (`UiState.welcome`)
- Modify: `src/main.ts` (the `land` case, overlay chain, frame gate)
- Test: `tests/teach.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces:
  - `TIPS: string[]` from `src/sim/teach.ts`
  - `tipFor(seed: number, index: number): string` from `src/sim/teach.ts`
  - `welcomeLines(state: GameState): { held: string[]; body: string[] }`
    from `src/sim/teach.ts`
  - `welcomeHtml(state: GameState, cal: Calendar): string` from
    `src/ui/teachpanel.ts`
  - `UiState.welcome: boolean`

- [ ] **Step 1: Write the failing tests**

Append to `tests/teach.test.ts`:

```ts
describe("the welcome", () => {
  it("tells a fresh survivor everything is theirs to click", () => {
    const { state } = newGame(17);
    const w = welcomeLines(state);
    expect(w.body.join(" ")).toMatch(/one at a time/);
    expect(w.held).toEqual([]);
  });

  it("names what an heir landed holding, and the rung it already opens", () => {
    const { state } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(RUNG_LEVEL.grind);
    state.skills.building.xp = levelMinutes(RUNG_LEVEL.job);
    const w = welcomeLines(state);
    expect(w.held).toContain(`${SKILL_NAMES.woodcraft} ${RUNG_LEVEL.grind}`);
    expect(w.held).toContain(`${SKILL_NAMES.building} ${RUNG_LEVEL.job}`);
    expect(w.body.join(" ")).toContain(RUNG_WORD.grind);
  });

  it("gives a landing the same tip every time, and never the last one twice", () => {
    expect(tipFor(17, 3)).toBe(tipFor(17, 3));
    for (let i = 1; i < TIPS.length + 3; i++) expect(tipFor(17, i)).not.toBe(tipFor(17, i - 1));
  });

  it("keeps every tip to one line the box can lay out", () => {
    for (const t of TIPS) expect(t.length).toBeLessThanOrEqual(140);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/teach.test.ts
```

Expected: FAIL, `welcomeLines`, `tipFor` and `TIPS` are not exported.

- [ ] **Step 3: Write the tips and the lines**

In `src/sim/teach.ts`, adding the imports it needs from `./skills`:

```ts
/**
 * One rule a landing puts in front of the player. Every line is something
 * the tables or the manual already establish and the game nowhere says
 * out loud at the moment it matters. A landing shows one, so a player on
 * their sixth survivor still meets a rule they had not noticed, at no
 * cost in clicks.
 */
export const TIPS: string[] = [
  "A hare alone starves you. You need fat: marrow, oily fish, eggs and roe in their season.",
  "Wet clothes in the cold kill in hours. Dry them by the fire before you sleep, not after.",
  "A deer is weeks of food that rots in a day unless you dry it, and its fat rots in three unless you render it.",
  "Two litres is a day's water. A trough at camp holds a week of it and saves the walk.",
  "Dead wood off the forest floor is firewood by hand. A fire never needed the axe.",
  "A trap in the water works while you sleep. It is the first food a camp makes without you.",
  "The axe is honed, not used up. A whetstone brings the edge back for nothing.",
  "Berries are a season and then they are gone. Dry what you cannot eat.",
  "Walking after dark without a torch is slow going, and slow going in the cold is how people die.",
  "A once order starts the moment you click it, whatever the body says. That is yours to judge.",
];

/**
 * The tip a landing shows: fixed for that landing, so a reload shows the
 * same one and a test can name it, and stepped on when it would repeat
 * the last landing's.
 */
export function tipFor(seed: number, index: number): string {
  const at = (n: number) => Math.abs(seed + n) % TIPS.length;
  const here = at(index);
  return TIPS[here === at(index - 1) && index > 0 ? (here + 1) % TIPS.length : here];
}

/**
 * What the welcome says about the survivor standing there: the skills they
 * landed holding, and what those already let them ask for. The heir's
 * paragraph and the fresh one are the same question answered against a
 * different slate, so there is one place to change either.
 */
export function welcomeLines(state: GameState): { held: string[]; body: string[] } {
  const held = SKILL_IDS.filter((s) => skillLevel(state, s) >= 2).map((s) => `${SKILL_NAMES[s]} ${skillLevel(state, s)}`);
  if (!held.length) {
    return {
      held,
      body: [
        "You land knowing nothing. Every job is yours to click, one at a time.",
        `Practise a skill to ${RUNG_LEVEL.job} and it starts keeping count for you; past that it takes longer and longer orders, up to work planned by the calendar.`,
      ],
    };
  }
  const top = [...RUNG_ORDER].reverse().find((r) => SKILL_IDS.some((s) => skillLevel(state, s) >= RUNG_LEVEL[r]));
  const body = [`You land carrying what came down to you: ${held.join(", ")}.`];
  if (top) body.push(`That already takes ${RUNG_WORD[top]} from you. Everything else is by hand until you have practised it yourself.`);
  else body.push("None of it is yet enough to set work down and walk away. That comes with practice.");
  return { held, body };
}
```

`welcomeLines` reads the live `state.skills`, which `carrySkills` has
already written by the time the welcome is shown, so it needs no
knowledge of the ancestor.

- [ ] **Step 4: Render it**

In `src/ui/teachpanel.ts`:

```ts
export function welcomeHtml(state: GameState, cal: Calendar): string {
  const rec = current(state);
  const { body } = welcomeLines(state);
  const skills = SKILL_IDS.map((s) => `<span class="tag">${esc(SKILL_NAMES[s])} ${skillLevel(state, s)}</span>`).join("");
  const tip = tipFor(state.seed, state.survivors.length);
  return `<div class="box teach welcome">
<h1>${esc(fmtName(rec.name))}</h1>
<p class="dim">${esc(fmtDate(cal))}, day ${cal.day}.</p>
${body.map((l) => `<p>${esc(l)}</p>`).join("")}
<div class="statuses">${skills}</div>
<p>${esc(MANUAL_SECTIONS[0].lines.slice(0, 2).join(" "))}</p>
<p class="example">${esc(tip)}</p>
<button class="act" data-act="welcome-close">Begin</button>
</div>`;
}
```

Add the imports it needs: `current` from `../sim/record`, `fmtName` from
`../sim/names`, `fmtDate` from `../sim/calendar`, `SKILL_NAMES` from
`../sim/skills`, `MANUAL_SECTIONS` from `../sim/manual`, and `TIPS`'s
neighbours `tipFor` and `welcomeLines` from `../sim/teach`.

Taking the first two lines from `MANUAL_SECTIONS[0]` rather than retyping
them keeps the welcome and the manual saying the same thing about the
first days; there is one place to change that advice.

Add to `src/style.css`:

```css
#overlay .box.teach.welcome { max-width: 520px; }
#overlay .box.teach .statuses { margin: 10px 0; }
```

- [ ] **Step 5: Fire it on every landing**

In `src/ui/render.ts`, in `UiState`:

```ts
  /** The landing's welcome is open. */
  welcome: boolean;
```

and `welcome: false,` in `newUiState`.

In `src/main.ts`, in the `land` case, after the manual line:

```ts
      // Every landing gets its welcome, fresh survivor or heir; on a world's
      // first the manual leads and this waits behind it in the chain.
      if (wasLanding && state.landing === null) ui.welcome = true;
```

In `render`'s overlay chain, between the `state.dead` branch and the
`ui.teach` branch:

```ts
  } else if (ui.welcome) {
    setPanel("overlay", welcomeHtml(state, cal));
    overlay.hidden = false;
```

In `frame`, add `&& !ui.welcome` to the gate and a `lastReal = now` arm
for it beside `ui.teach`'s, and add `!ui.welcome` to the drain condition
so a moment never opens under the welcome.

In `onClick`:

```ts
    case "welcome-close":
      ui.welcome = false;
      lastReal = performance.now();
      break;
```

`newGame` does not run `land`, so a brand new world opened from the
splash reaches the welcome through the same `land` case the landing
screen's button fires. Verify this by starting a fresh world in Task 8's
browser pass; if a path exists that skips `land`, set `ui.welcome` there
too rather than moving the flag into the sim.

- [ ] **Step 6: Run the tests and the build**

```bash
npx vitest run tests/teach.test.ts
npm test
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/sim/teach.ts src/ui/teachpanel.ts src/ui/render.ts src/main.ts src/style.css tests/teach.test.ts
git commit -m "feat(survidle): a survivor lands to what they know, what it lets them ask for, and one rule of the north"
```

---

### Task 4: What the gap costs

`withProgression` spells out the craft and build gap and says nothing for
hunt and fish, where `gap` is halving the odds and adding injury.

**Files:**
- Modify: `src/sim/tasks.ts:997-1011` (`withProgression`)
- Test: `tests/teach.test.ts` or a new `tests/gap.test.ts`, whichever the
  repo's existing split suggests after reading `tests/hunt.test.ts`

**Interfaces:**
- Consumes: `oddsFactor`, `injuryChance`, `gap`, `RECOMMENDED` from
  `src/sim/skills.ts`, all already exported.
- Produces: no new exports. `TaskOption.detail` and
  `TaskOption.recommended.text` gain content.

- [ ] **Step 1: Write the failing test**

```ts
describe("what a row under its level costs", () => {
  it("tells a hunter the odds and the danger, not just the number", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const o = withProgression(state, world, intentOption(state, world, cal, "hunt", "elk", "nearest"));
    expect(o.recommended?.under).toBe(true);
    expect(o.recommended?.text).toMatch(/you are 1/);
    expect(o.detail).toMatch(/odds/);
    expect(o.detail).toMatch(/turns on you/);
  });

  it("tells an angler the odds, and promises no injury fishing has no rule for", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const fish = SPECIES_DEFS;
    // Pick a fish this region holds whose recommended level is above 1.
    const o = withProgression(state, world, intentOption(state, world, cal, "fish", "pike", "nearest"));
    if (o.recommended?.under) {
      expect(o.detail).toMatch(/odds/);
      expect(o.detail).not.toMatch(/turns on you/);
    }
  });

  it("says nothing extra once you are at the level", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    state.skills.hunting.xp = levelMinutes(50);
    const o = withProgression(state, world, intentOption(state, world, cal, "hunt", "elk", "nearest"));
    expect(o.recommended?.under).toBe(false);
    expect(o.recommended?.text).not.toMatch(/you are/);
  });
});
```

Before writing, check which species the seed 17 start region actually
holds by reading `regionAt(world, state.player.region).capacity`, and use
one of those rather than assuming elk and pike are present. A row for a
species the region does not hold is never built.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/gap.test.ts
```

Expected: FAIL, `detail` carries nothing about odds.

- [ ] **Step 3: Implement**

In `src/sim/tasks.ts`, `withProgression`, replace the recommended block:

```ts
  const g = gap(state, key);
  // Under the level the row says what the shortfall costs, not only the
  // number it wants: the gap is halving the odds and adding injury whether
  // or not anything says so.
  out.recommended = {
    text: g > 0 ? `${SKILL_NAMES[rec.skill]} ${rec.level}, you are ${skillLevel(state, rec.skill)}` : `${SKILL_NAMES[rec.skill]} ${rec.level}`,
    under: g > 0,
    short: g,
  };
  const parts: string[] = [];
  if (g > 0 && o.id === "craft") parts.push(`${Math.round(craftSuccess(state, o.arg as RecipeId) * 100)}% chance it comes out`);
  if (g > 0 && o.id === "build") parts.push(`at ${SKILL_NAMES.building} ${skillLevel(state, "building")} this takes ${(1.3 ** g).toFixed(1)}x as long`);
  if (g > 0 && (o.id === "hunt" || o.id === "fish") && o.arg && o.arg !== "any") {
    const s = o.arg as Species;
    // 0.5 per level short, the same factor oddsFactor applies, said as the
    // share of what a hunter at the level would get.
    parts.push(`${shareWord(0.5 ** g)} the odds`);
    if (o.id === "hunt") {
      const hurt = Math.round(injuryChance(state, s) * 100);
      if (hurt > 0) parts.push(`${hurt}% chance it turns on you`);
    }
  }
```

and add a helper beside it:

```ts
/** A fraction under one in words a player reads faster than a decimal: "half", "a quarter", "an eighth". */
function shareWord(f: number): string {
  const named: Record<string, string> = { "0.5": "half", "0.25": "a quarter", "0.125": "an eighth", "0.0625": "a sixteenth" };
  return named[String(f)] ?? `${Math.round(f * 100)}% of`;
}
```

Add `injuryChance`, `skillLevel` and `Species` to the file's imports if
they are not already there.

- [ ] **Step 4: Run the tests and the build**

```bash
npx vitest run tests/gap.test.ts
npm test
npm run build
```

Watch for a golden or churn test that pins a row's rendered text: if one
breaks, read whether the new wording is what it should now say and update
the golden, rather than trimming the wording to fit an old assertion.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tasks.ts tests/gap.test.ts
git commit -m "feat(survidle): a row under its level says what the shortfall costs in odds and in blood"
```

---

### Task 5: Producers say what they make and what stops them

`src/sim/capabilities.ts` carries finished copy no panel reads.

**Files:**
- Modify: `src/sim/capabilities.ts` (`capabilityFor`)
- Modify: `src/ui/dopanel.ts` (`intentRowHtml`)
- Modify: `src/ui/panels.ts` (`regionHtml`, the `built` block)
- Test: `tests/capabilities.test.ts`

**Interfaces:**
- Consumes: `CAPABILITIES`, `CapabilityRow` (already exported).
- Produces:
  - `capabilityFor(id: TaskId, arg: string | undefined): CapabilityRow | null`
    from `src/sim/capabilities.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/capabilities.test.ts`:

```ts
describe("what a capability tells the panel", () => {
  it("finds a row from the task and argument the Do panel builds", () => {
    expect(capabilityFor("build", "basketTrap")?.id).toBe("basket trap");
    expect(capabilityFor("craft", "snare")?.id).toBe("snares");
    expect(capabilityFor("chop", undefined)).toBeNull();
  });

  it("reaches every producer, so none of them is a structure the game never explains", () => {
    for (const row of CAPABILITIES.filter((c) => c.producer)) {
      const found = row.keys.some((k) => {
        const [kind, arg] = k.split(":");
        return (kind === "build" || kind === "craft") && capabilityFor(kind as TaskId, arg) === row;
      });
      expect(found, `${row.id} is a producer no Do row can reach`).toBe(true);
    }
  });

  it("gives every producer something to say on both sides", () => {
    for (const row of CAPABILITIES.filter((c) => c.producer)) {
      expect(row.gives.length).toBeGreaterThan(0);
      expect(row.limits.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/capabilities.test.ts
```

Expected: FAIL, `capabilityFor` is not exported.

- [ ] **Step 3: Implement the lookup**

In `src/sim/capabilities.ts`:

```ts
/**
 * The capability a Do row stands for, by the key it would carry. Only
 * build and craft rows have one: a capability is a thing that comes to
 * stand at camp, not an hour of work.
 */
export function capabilityFor(id: TaskId, arg: string | undefined): CapabilityRow | null {
  if (!arg || (id !== "build" && id !== "craft")) return null;
  const key = `${id}:${arg}`;
  return CAPABILITIES.find((c) => c.keys.some((k) => k === key)) ?? null;
}
```

Add `TaskId` to the file's type imports.

- [ ] **Step 4: Say it on the row**

In `src/ui/dopanel.ts`, `intentRowHtml`, after `rec` is built:

```ts
  // A producer is a thing that works while you do not, which is the whole
  // shape of the game and which no row said until now.
  const cap = capabilityFor(o.id, o.arg);
  const gives = cap?.producer ? `<small class="gives">${esc(cap.gives)}</small>` : "";
```

and put `${gives}` into both returned strings, immediately after `${bar}`
inside the `<button>`, in the blocked branch and the startable one alike.
A producer under its level is exactly the row a player most needs the
promise on.

Add to `src/style.css`:

```css
.opt .gives { display: block; color: var(--good); }
```

Confirm `--good` is this sheet's name for the positive colour before
using it.

- [ ] **Step 5: Say it in the region panel**

In `src/ui/panels.ts`, `regionHtml`, after the `built` array is filled:

```ts
  // What each producer standing here is limited by: the reason a camp that
  // makes its own food still runs out.
  const limits = CAPABILITIES.filter((c) => c.producer && standingHere(st, c))
    .map((c) => `<div><small>${esc(c.id)}: ${esc(c.limits)}</small></div>`)
    .join("");
```

and add `${limits}` inside the `built` `<dd>`, after `${water}`.

Write `standingHere` beside `regionHtml` in `panels.ts`, reading the same
`st.structures` fields the `built` list above it already reads:

```ts
/** Whether this capability's structure stands at this camp, by the structure key it names. */
function standingHere(st: RegionState, c: CapabilityRow): boolean {
  for (const k of c.keys) {
    const [kind, arg] = k.split(":");
    if (kind !== "build") continue;
    if (arg === "snare") return st.structures.snares > 0;
    if (arg === "seep") return Object.keys(st).length > 0 && st.structures.seep === true;
    if (arg === "basketTrap") return st.trap !== null;
    if (st.structures[arg as keyof typeof st.structures]) return true;
  }
  return false;
}
```

Read `RegionState` in `src/sim/types.ts` before writing this and correct
each arm against the fields that actually exist: a seep may live in
`state.seeps` keyed by cell rather than on the region, and the trap's
field is `st.trap`. The test in Step 6 is what pins it.

- [ ] **Step 6: Test that the panel says it**

```ts
it("names a standing producer's limit in the region panel", () => {
  const { state, world } = newGame(17);
  const cal = calendar(state.minute, state.startDoy);
  const st = regionState(state, world, state.player.region);
  st.structures.dryingRack = true;
  const html = regionHtml(state, world, cal, newUiState());
  expect(html).toContain("40 kg a rack");
});
```

Put this in `tests/capabilities.test.ts` beside the others, or in
`tests/layout.test.ts` if that is where rendered-panel assertions already
live; read both and follow the existing split.

- [ ] **Step 7: Run the tests and the build**

```bash
npx vitest run tests/capabilities.test.ts
npm test
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/sim/capabilities.ts src/ui/dopanel.ts src/ui/panels.ts src/style.css tests/capabilities.test.ts
git commit -m "feat(survidle): a producer says what it makes without you, and what will still stop it"
```

---

### Task 6: Which orders are yours and which are the runner's

**Files:**
- Modify: `src/ui/dopanel.ts` (`rowExpandHtml`)
- Modify: `src/style.css`
- Test: `tests/dopanel.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `tests/dopanel.test.ts`, following that file's existing way of
building an open row:

```ts
it("marks where the player's own orders end and the runner's begin", () => {
  const { state, world } = newGame(17);
  const cal = calendar(state.minute, state.startDoy);
  const ui = { ...newUiState(), open: { id: "chop" as TaskId, arg: "" } };
  const html = doHtml(state, world, cal, ui);
  expect(html).toContain("starts now");
  expect(html).toContain("the runner's");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/dopanel.test.ts
```

Expected: FAIL, neither phrase is in the markup.

- [ ] **Step 3: Implement**

In `src/ui/dopanel.ts`, `rowExpandHtml`, split the kinds map so the
divider falls after `once`:

```ts
  const kinds: RowChoice["until"][] = ["once", "times", "daily", "campHas", "keep", "forever"];
  const button = (k: RowChoice["until"]) => {
    const { req, kind } = rowRequest({ ...ui.choice, until: k }, o.id, arg);
    const gate = orderGate(state, req, kind);
    const label = esc(kindLabel(o.id, arg, k, ui.choice.n));
    const needs = gate.ok ? "" : `<small>${esc(kindNeeds(state, gate))}</small>`;
    return `<span class="kind"><button data-act="row-kind" data-id="${o.id}" data-arg="${esc(arg)}" data-until="${k}" class="mini${gate.ok ? "" : " off"}" title="${label}">${label}</button>${needs}</span>`;
  };
  // A once order is the player's own: it goes to the top of the list and
  // starts on the click. Every other kind is handed to the runner, which
  // serves it in its own time and around the body's needs.
  const buttons = `${button(kinds[0])}<small class="handoff">starts now; the rest are the runner's</small>${kinds.slice(1).map(button).join("")}`;
```

Add to `src/style.css`:

```css
.expand .handoff { display: block; color: var(--dim); margin: 2px 0 4px; }
```

Confirm `--dim` against the sheet's own variable names.

- [ ] **Step 4: Run the tests and the build**

```bash
npx vitest run tests/dopanel.test.ts
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/dopanel.ts src/style.css tests/dopanel.test.ts
git commit -m "feat(survidle): the row says which orders you keep and which you hand over"
```

---

### Task 7: The hurry and the carry, said out loud

The hurry is a `title` attribute today, which a touch device never shows
and a mouse user never hovers. The quarter carry is learned by dying.

**Files:**
- Modify: `src/ui/panels.ts` (`ordersHtml`, `tombstoneHtml`)
- Modify: `src/style.css`
- Test: `tests/hurry.test.ts`, `tests/layout.test.ts`

**Interfaces:**
- Consumes: `CARRY_SHARE` from `src/sim/skills.ts` (already exported),
  `hurryKind`, `PULSE_MIN` (already imported by `panels.ts`).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

```ts
it("says on the row that clicking hurries it, where a tooltip cannot be seen", () => {
  // Build a state with a standing order running, the way tests/hurry.test.ts does.
  const html = taskHtml(state, world, cal);
  expect(html).toContain("click to hurry");
});

it("says on the tombstone what the next survivor keeps", () => {
  const html = tombstoneHtml(state, world, newUiState());
  expect(html).toMatch(/quarter/);
});
```

Read `tests/hurry.test.ts` for how it puts a standing order into the
running state and reuse that setup rather than building a second one.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/hurry.test.ts tests/layout.test.ts
```

- [ ] **Step 3: Implement**

In `src/ui/panels.ts`, `ordersHtml`, the `head` for a clickable row keeps
its title and gains visible words:

```ts
    const head = clicks
      ? `<div class="head hurry" data-act="hurry" title="Click to hurry it: ${Math.round(PULSE_MIN)} minutes in a moment, then wait for the bar"><span class="hint">click to hurry</span>`
      : `<div class="head">`;
```

In `tombstoneHtml`, before the "next boat" paragraph:

```ts
<p class="dim">The next survivor carries ${esc(shareWord(CARRY_SHARE))} of what ${esc(rec.name.first)} knew, and none of the practice at any one thing.</p>
```

`shareWord` here is the same helper Task 4 added to `src/sim/tasks.ts`.
Rather than importing a UI concern out of `tasks.ts`, move that helper
into `src/units.ts` in this task, export it, and update Task 4's call
site to import it from there. `src/units.ts` is already where this repo
puts "a number, said the way a person says it".

- [ ] **Step 4: Run the tests and the build**

```bash
npx vitest run tests/hurry.test.ts tests/layout.test.ts
npm test
npm run build
```

`tests/churn.test.ts` may flag the new span on the live row; the span is
static markup with no moving number in it, so if churn complains, read
why before changing anything.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels.ts src/units.ts src/sim/tasks.ts src/style.css tests/hurry.test.ts tests/layout.test.ts
git commit -m "feat(survidle): the hurry stops being a tooltip and the tombstone says what carries over"
```

---

### Task 8: The browser pass and the docs

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`
  (a Built paragraph)
- Modify: `docs/superpowers/specs/2026-09-07-survidle-legibility-design.md`
  (a Built paragraph)

- [ ] **Step 1: Run the whole suite and the build**

```bash
npm test
npm run build
npm run lint
```

From the repo root for lint. All three must pass before the browser pass
is worth running.

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

The page is at `http://127.0.0.1:5173/prototypes/08/`, not at `/`.
Stop the server when the pass is done.

- [ ] **Step 3: The pass at 1440 by 900**

In the DevTools browser, on seed 17, confirm and record each:

1. A fresh world's first landing shows the manual, then the welcome; the
   welcome names six skills at 1 and says every job is yours to click.
2. The clock in the header does not advance while the welcome is open,
   and does advance after Begin.
3. Dismissing the welcome after more than thirty seconds does **not**
   produce an away report.
4. Setting `state.skills.woodcraft.xp` past `levelMinutes(3)` in the
   console and letting a minute of felling run opens the Jobs moment,
   with an example sentence that reads like an order the list would print.
5. Got it closes it, and the same rung does not fire again.
6. A hunt row under its level reads its odds and its injury chance.
7. A basket trap row reads its gives line.
8. An open row shows the once/runner divider.

- [ ] **Step 4: The pass at 390 wide**

Re-run steps 1, 4, 6 and 8 with touch emulation
(`390x844x3,mobile,touch` in the DevTools browser, not a resized desktop
window, or the `(hover: none)` rules never trip). Confirm the two
overlays fit without the body scrolling sideways and that Got it and
Begin are at least 40 pixels tall.

- [ ] **Step 5: Write it up**

Add a **Built** paragraph to the legibility spec saying what was built,
what the browser pass read, and **both widths it ran at** - a pass that
names one width has not checked the page, per `docs/ux.md`.

Add a short **Built** note to the roadmap's UI section pointing at the
legibility spec.

In `docs/README.md`, under "How it plays", add two sentences: that a rung
opening stops the game once to say what it now lets you ask for, and that
a landing shows what the survivor knows and one rule of the north.

- [ ] **Step 6: Commit**

```bash
git add docs/README.md docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md docs/superpowers/specs/2026-09-07-survidle-legibility-design.md
git commit -m "docs(survidle): what the legibility pass built, and the two widths it was read at"
```

---

## Self-Review

**Spec coverage.** Section 3 (the layer) is Task 1. Section 4 (overlay
order and the pause) is Tasks 2 and 3. Section 5 (the welcome) is Task 3.
Section 6 (a concept moment) is Task 2. Section 7.1 is Task 4, 7.2 is
Task 5, 7.3 is Task 6, 7.4 is Task 7. Section 8's unit tests are spread
across the task that owns each behaviour, its coverage tests are in Tasks
2 and 5, and its browser pass is Task 8.

**Type consistency.** `Rung` is the one name for the five concepts;
`Concept` from the spec's prose is not used as an identifier anywhere.
`teachOnce` and `markTaught` live in `skills.ts` and `resetTeaching` in
`teach.ts`, which is what keeps `skills.ts` from importing `teach.ts` and
making a cycle - `teach.ts` imports `skills.ts` freely, and `landing.ts`
imports `teach.ts`. `exampleFor` and both `*Html` functions are in
`src/ui/teachpanel.ts` because they read the Do panel's rows, which the
sim must not.

**Known soft spots, flagged rather than papered over.** Three places
where this plan tells the implementer to read the code and correct the
sketch rather than trusting it: the `save`/`load` signature in Task 1
Step 1, `standingHere`'s arms against the real `RegionState` in Task 5
Step 5, and which species seed 17's start region actually holds in Task 4
Step 1. Each has a test that pins the right answer.
