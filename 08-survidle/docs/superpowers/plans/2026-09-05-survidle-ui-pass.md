# The UI Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Do panel chooses the order kind per row instead of a global strip, folds and filters, the right column reads as a check-in with columns that scroll inside themselves, the page fits a phone, and `docs/ux.md` is the rule every later browser pass is checked against.

**Architecture:** The order strip's four fields on `UiState` become a per-row choice that lives only while a row is open; `stripRequest` becomes `rowRequest(choice, id, arg)` with the same output. The Do panel's renderer moves into `src/ui/dopanel.ts` with pure helpers for the filter, the folds and the far-rows fold. Layout is CSS and the section order in `index.html`; the phone layout is one media query plus a legend the map renders and CSS shows only without hover. Nothing in the sim changes.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom. Run from `08-survidle/`.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-ui-pass-design.md`

## Global Constraints

- Work on `main` in the primary clone, pre-approved. Stage by explicit path under `08-survidle/`; never `git add -A`; never `git stash`. Other sessions commit docs concurrently; another item's implementer may be editing `src/main.ts`'s beacon wiring: read `src/main.ts` fresh before each edit and keep hunks small.
- A row's plain click stays "once" and gives the same order it gives today. `rowRequest` with the default choice equals today's `stripRequest` with a default strip. `NOT_ORDERS` tasks ignore the choice.
- The kinds a row's skill has not earned are greyed with the level and hours text the strip's `stripSentence`/`orderGate` already produce; the wording stays.
- Local storage key for the folds: `survidle.ui`. Filter matching is case-insensitive substring on the row label only.
- Right column order in `index.html`: task, forecast, log, actions, inventory, journal. Phone breakpoint 700px. Touch rules under `@media (hover: none)`.
- No em dashes and no non-typable unicode; comments explain, never chronicle.
- Every commit: `npm test` green, `npx tsc --noEmit` clean, `npm run build` ok. Commit messages end with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.

---

### Task 1: The kind per row, and the strip goes

**Files:**
- Modify: `src/ui/render.ts` (`UiState`, `newUiState`, `commitStripN`, `stripRequest` -> `rowRequest`, the `setPanel` focus guard)
- Modify: `src/ui/panels.ts` (`stripSentence`, `intentRowHtml`, `stripHtml`, `doHtml`; the advanced list's `optHtml` is unchanged)
- Modify: `src/main.ts` (cases `intent`, `strip`, the `data-strip-n` input/change listeners; new cases `row-more`, `row-kind`, `row-deliver`, `row-where`)
- Test: `tests/ui.test.ts` (the strip tests become row tests)

**Interfaces:**
- Produces: `RowChoice = { until: "once" | "times" | "campHas" | "keep" | "forever"; n: number; deliver: "leave" | "camp"; where: "nearest" | SpotId }`; `UiState.open: { id: TaskId; arg: string } | null`; `UiState.choice: RowChoice`; `defaultChoice(): RowChoice`; `rowRequest(choice: RowChoice, id: TaskId, arg: string | undefined): { req: IntentRequest; kind: OrderKind }`; `commitChoiceN(ui, value)`.
- Removed: `UiState.until/n/deliver/where`, `stripRequest`, `commitStripN`, `stripHtml`, the `strip` click case and its markup.

- [ ] **Step 1: Read first**

`src/ui/render.ts` whole; `src/ui/panels.ts` lines 470 to 540 (`stripSentence`, `intentRowHtml`, `stripHtml`, `doHtml`); `src/sim/ladder.ts` (`orderGate`, `Gate`, `NOT_ORDERS`, `withinLadder`); `src/main.ts` `onClick` and the two `data-strip-n` listeners near its end; `tests/ui.test.ts` for every test that names `stripRequest`, `until`, `deliver`, `where` or `data-strip`.

- [ ] **Step 2: Write the failing tests**

In `tests/ui.test.ts`, replace each `stripRequest(ui, ...)` test with the same assertions through `rowRequest(choice, ...)`, building `choice` as `{ ...defaultChoice(), until: "keep", n: 4 }` and the like; keep every expected `req`/`kind` value exactly as it was. Add:

```ts
describe("the kind per row", () => {
  it("the default choice is once, leave, nearest, and rowRequest with it is the plain click", () => {
    expect(defaultChoice()).toEqual({ until: "once", n: 10, deliver: "leave", where: "nearest" });
    expect(rowRequest(defaultChoice(), "sticks", undefined)).toEqual({ req: { task: "sticks", arg: undefined, until: { kind: "once" }, deliver: "leave", where: "nearest" }, kind: "job" });
  });

  it("a NOT_ORDERS task ignores the choice", () => {
    const r = rowRequest({ ...defaultChoice(), until: "keep", n: 3 }, "rest", undefined);
    expect(r.kind).toBe("job");
    expect(r.req.until).toEqual({ kind: "once" });
  });

  it("the open row renders the four kinds, greys the unearned ones with the level text, and other rows render no expansion", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const ui = newUiState();
    ui.open = { id: "fish", arg: "any" };
    const html = doHtml(state, world, cal, ui);
    const open = html.slice(html.indexOf('data-opt="intent:fish:any"'));
    expect(open).toContain('data-act="row-kind"');
    for (const k of ["times", "campHas", "keep", "forever"]) expect(open).toContain(`data-until="${k}"`);
    // Fishing at level 1 has not earned a keep: the keep button is greyed and says what it needs.
    expect(open).toMatch(/data-until="keep"[^>]*class="[^"]*off[^"]*"/);
    expect(open).toMatch(/needs .* \d/);
    expect(open).toContain('data-strip-n');
    expect(open).toContain('data-act="row-deliver"');
    const closed = html.slice(html.indexOf('data-opt="intent:sticks:"'), html.indexOf('data-opt="intent:sticks:"') + 600);
    expect(closed).not.toContain('data-act="row-kind"');
    expect(closed).toContain('data-act="row-more"');
  });

  it("no strip: the panel has no data-strip kind buttons and no strip sentence", () => {
    const { state, world } = newGame(17);
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), newUiState());
    expect(html).not.toContain('data-act="strip"');
    expect(html).not.toContain("data-strip=");
  });
});
```

Adjust the selectors to the markup you write in Step 4, keeping each assertion's meaning. Read the current `intentRowHtml` first so the `data-opt` attribute the test slices on is the one it renders.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL on missing `rowRequest`/`defaultChoice`, and on the expansion markup.

- [ ] **Step 4: render.ts**

```ts
export interface RowChoice { until: "once" | "times" | "campHas" | "keep" | "forever"; n: number; deliver: "leave" | "camp"; where: "nearest" | SpotId }
export function defaultChoice(): RowChoice { return { until: "once", n: 10, deliver: "leave", where: "nearest" }; }
```

`UiState`: remove `until`, `n`, `deliver`, `where`; add `/** The Do row whose kinds are open, or null. */ open: { id: TaskId; arg: string } | null;` and `/** The open row's choice; reset when another row opens. */ choice: RowChoice;`. `newUiState` sets `open: null, choice: defaultChoice()`. `commitStripN(ui, value)` becomes `commitChoiceN(ui, value)` writing `ui.choice.n`. `stripRequest` becomes:

```ts
/**
 * The order a click on an open row's kind gives: what main.ts hands to
 * giveOrder. A NOT_ORDERS task (night, rest, sleep, a runner step) ignores
 * the choice: it is a move the Do panel starts directly, not something the
 * ladder gates, so it is always the once job the click means.
 */
export function rowRequest(choice: RowChoice, id: TaskId, arg: string | undefined): { req: IntentRequest; kind: OrderKind } {
  if (NOT_ORDERS.includes(id)) return { req: { task: id, arg, until: { kind: "once" }, deliver: choice.deliver, where: choice.where }, kind: "job" };
  const kind: OrderKind = choice.until === "keep" ? "keep" : choice.until === "forever" ? "grind" : "job";
  const until: UntilChoice = choice.until === "times" ? { kind: "times", n: choice.n }
    : choice.until === "campHas" || choice.until === "keep" ? { kind: "campHas", qty: choice.n }
    : choice.until === "forever" ? { kind: "forever" }
    : { kind: "once" };
  return { req: { task: id, arg, until, deliver: choice.deliver, where: choice.where }, kind };
}
```

The `setPanel` guard keeps `data-strip-n` (the expansion's number field carries that attribute) and adds `data-do` (Task 2's filter box): `focused.hasAttribute("data-strip-n") || focused.hasAttribute("data-name") || focused.hasAttribute("data-do")`.

- [ ] **Step 5: panels.ts**

Delete `stripHtml` and `stripSentence`. `intentRowHtml(o, gate, ui, state, world)` renders the row as today for the plain click (a once job), plus a `<button class="mini" data-act="row-more" data-id data-arg>more</button>` (reading "less" when this row is `ui.open`). When the row is `ui.open`, append an expansion `<div class="expand">` containing:

- four kind buttons `<button class="mini${earned ? "" : " off"}" data-act="row-kind" data-id data-arg data-until="times|campHas|keep|forever" title="...">N times | until camp has N | keep camp at N | forever</button>`; `earned` and the greyed text come from `orderGate(state, rowRequest({ ...ui.choice, until }, id, arg).req, kindOf(until))` the same way the strip's shut rows read the gate today, with the small print `needs <skill> <level>, about <hours> h` in the words `stripSentence` produced (lift that text-building into a small helper before deleting `stripSentence`);
- the number field `<input type="number" min="1" data-strip-n value="${ui.choice.n}">` shown when the choice's kind takes N;
- `<button class="mini" data-act="row-deliver" data-id data-arg>${ui.choice.deliver === "camp" ? "bring to camp" : "leave where it is"}</button>` toggling;
- when the task has a where (the strip offered one for gathers and hunts: reuse the same condition), `<select data-act="row-where" data-id data-arg>` with `nearest` and the region's spots (labels as the strip labelled them, with live km from the survivor as `stripHtml` computed).

`doHtml` passes `ui` into `intentRowHtml` and drops the `stripHtml(...)` call.

- [ ] **Step 6: main.ts**

- `case "intent"`: `const { req, kind } = rowRequest(defaultChoice(), id, arg)` (the plain click; unchanged behaviour).
- New `case "row-more"`: if `ui.open` is this row, `ui.open = null`; else `ui.open = { id, arg: target.dataset.arg ?? "" }; ui.choice = defaultChoice();`.
- New `case "row-kind"`: `ui.choice.until = target.dataset.until as RowChoice["until"]`; if the button is not `off`: `const { req, kind } = rowRequest(ui.choice, id, arg); giveOrder(...)` as the `intent` case does; then `ui.open = null`.
- New `case "row-deliver"`: toggle `ui.choice.deliver`.
- The `change` listener: `if (el.matches("[data-act=row-where]")) ui.choice.where = el.value as RowChoice["where"]`; the `data-strip-n` listeners call `commitChoiceN`.
- Delete `case "strip"` and the `case "advanced"` stays.
- `FORECAST_ACTS` gains `"row-kind"` (it adds an order).

- [ ] **Step 7: Run everything and commit**

Run: `npx vitest run tests/ui.test.ts && npm test && npx tsc --noEmit && npm run build | tail -3`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/ui/render.ts 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): the order kind is chosen per Do row, and the strip that shut the panel goes"
```

---

### Task 2: Fold and filter

**Files:**
- Create: `src/ui/dopanel.ts`
- Modify: `src/ui/panels.ts` (`doHtml`, `intentGroups`, `intentRowHtml` and their helpers move to dopanel.ts; panels.ts re-exports nothing, main.ts imports from dopanel), `src/ui/render.ts` (`UiState.filter`, `UiState.moreOpen`), `src/main.ts` (cases `fold`, `more`; the filter box's `input` listener), `src/style.css` (`.fold`, `.more`)
- Test: `tests/dopanel.test.ts`

**Interfaces:**
- Produces: `FOLD_KEY = "survidle.ui"`; `loadFolds(storage): Record<string, boolean>`; `saveFold(storage, group: string, open: boolean)`; `filterRows<T extends { label: string }>(rows: T[], text: string): T[]`; `splitFar(rows: TaskOption[], state): { near: TaskOption[]; far: TaskOption[] }` (far = cannot start now and the row's skill is more than one level under its recommended level; read `TaskOption`'s fields for the recommended level and the skill, as `withProgression` fills them); `makeFirst(rows)` (startable first, stable); `UiState.filter: string`, `UiState.moreOpen: string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { filterRows, FOLD_KEY, loadFolds, makeFirst, saveFold, splitFar } from "../src/ui/dopanel";

function memory(): Storage { /* the Map-backed stub as in tests/beacon.test.ts */ }

describe("fold and filter", () => {
  it("folds round-trip through storage and default open", () => {
    const s = memory();
    expect(loadFolds(s)).toEqual({});
    saveFold(s, "camp", false);
    expect(loadFolds(s)).toEqual({ camp: false });
    expect(JSON.parse(s.getItem(FOLD_KEY)!)).toEqual({ camp: false });
  });
  it("the filter narrows by label, case-insensitive, and an empty filter keeps everything", () => {
    const rows = [{ label: "Gather sticks" }, { label: "Strip bark" }, { label: "Fell a tree" }];
    expect(filterRows(rows, "STICK").map((r) => r.label)).toEqual(["Gather sticks"]);
    expect(filterRows(rows, "  ").length).toBe(3);
  });
  it("far rows are those that cannot start and sit more than a level short; Make lists startable first", () => {
    // Build two TaskOption-shaped rows by hand from availableTasks on a new game: one startable, one gated two levels away.
    // Read TaskOption in src/sim/tasks.ts for the field names (ok/why, and the progression fields withProgression fills) and assert splitFar and makeFirst on them.
  });
});
```

Fill the third test from the real `TaskOption` shape; it must assert on real rows from `availableTasks(state, world, cal)` on seed 17 (find one row that cannot start with its skill two levels short, e.g. a craft at Crafting 1 recommended 3), not on hand-made objects.

- [ ] **Step 2: Implement dopanel.ts**

Move `doHtml`, `intentGroups`, `intentRowHtml` and the kind-text helper from panels.ts into `src/ui/dopanel.ts` (imports adjusted; panels.ts keeps everything else). Add the helpers:

```ts
export const FOLD_KEY = "survidle.ui";
export function loadFolds(storage: Storage): Record<string, boolean> {
  try { return JSON.parse(storage.getItem(FOLD_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
export function saveFold(storage: Storage, group: string, open: boolean): void {
  storage.setItem(FOLD_KEY, JSON.stringify({ ...loadFolds(storage), [group]: open }));
}
export function filterRows<T extends { label: string }>(rows: T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  return q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
}
```

`splitFar` and `makeFirst` per the interface above, reading the fields `withProgression` sets on a `TaskOption`. `doHtml(state, world, cal, ui, folds)`: a filter box `<input data-do="filter" placeholder="filter" value="${esc(ui.filter)}">` at the top; per group, a heading `<h3 data-act="fold" data-group="${label}">` with a fold mark; when `folds[label] === false` the heading only; else the group's rows filtered by `ui.filter`, `splitFar` applied, the near rows (Make group: `makeFirst`) then, when far rows exist, either a `<button class="mini" data-act="more" data-group>more (${far.length})</button>` or the far rows when `ui.moreOpen` includes the group. Groups with no rows after the filter are left out.

- [ ] **Step 3: main.ts and style**

`render()` passes `loadFolds(localStorage)` (read once per render is fine). Cases: `fold` toggles `saveFold(localStorage, group, !(folds[group] ?? true))`; `more` pushes the group onto `ui.moreOpen`. An `input` listener on `[data-do=filter]` sets `ui.filter` and calls `render()`. `style.css`: `#actions .rows { max-height: 50vh; overflow-y: auto; }` around the groups (wrap them in `<div class="rows">`), `h3[data-act=fold] { cursor: pointer }`.

- [ ] **Step 4: Run everything and commit**

Run: `npx vitest run tests/dopanel.test.ts tests/ui.test.ts && npm test && npx tsc --noEmit && npm run build | tail -3`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/ui/dopanel.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/dopanel.test.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): the Do panel folds its groups, filters by label, and tucks the far rows under more"
```

---

### Task 3: Columns, the check-in order, the phone

**Files:**
- Modify: `index.html` (right column order; the map's scroll wrapper; the legend container), `src/style.css`, `src/ui/map.ts` (`legendHtml`), `src/main.ts` (scroll the map wrapper to the survivor after a rebuild)
- Test: `tests/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legendHtml } from "../src/ui/map";

describe("the layout", () => {
  it("the right column is a check-in: task, forecast, log, then actions, inventory, journal", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const right = html.slice(html.indexOf('id="right"'));
    const order = ["task", "forecast", "log", "actions", "inventory", "journal"].map((id) => right.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("the legend names every terrain letter the map draws, and the survivor and camp marks", () => {
    const html = legendHtml();
    for (const letter of ["T", "A", "n", "~", "."]) expect(html).toContain(`<b>${letter}</b>`);
    expect(html).toContain("<b>@</b>");
  });
});
```

Read `src/ui/map.ts` for the terrain-to-glyph table and use its letters in the test (the five above are a guess to replace with the real set).

- [ ] **Step 2: Implement**

`index.html`: reorder the right column's sections to task, forecast, log, actions, inventory, journal; wrap `#map`'s grid in `<div class="scroll-x">` (inside the section, around the element `mapHtml` fills) and add `<div class="legend"></div>` after it, filled by `legendHtml()` once at boot (static content).

`src/ui/map.ts`: `export function legendHtml(): string` listing each terrain glyph and name from the table the map draws with, plus `@ you` and the fire, shelter and (after siting) camp marks, as `<span><b>T</b> forest</span>` items.

`src/style.css`:

```css
#app { height: 100vh; }
.col { overflow-y: auto; }
#actions .rows { max-height: 50vh; overflow-y: auto; }
.scroll-x { overflow-x: auto; }
#map .legend { display: none; }
@media (hover: none) {
  #map .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  button, input, select { min-height: 40px; }
}
@media (max-width: 700px) {
  #app { grid-template-columns: 1fr; height: auto; }
  .col { overflow-y: visible; }
  #right { order: 1; } #left { order: 2; } /* adjust to the column ids index.html uses */
  /* within the columns, the section order becomes: task, forecast, map, then the rest; use `order` on the sections or move #map into the right column at this width with `display: contents` on the columns and `order` on each section */
}
```

Choose one of the two phone mechanisms (`display: contents` on `.col` with `order` per section is the simplest that gives task, forecast, map first) and say which in the report. `main.ts`: after `setPanel("map", ...)` returns true, scroll `.scroll-x` so the survivor's glyph column is centred (`mapHtml` knows the survivor's column; expose it or compute from the glyph's `data-you` attribute if the map marks it, else add such an attribute).

- [ ] **Step 3: Run everything and commit**

Run: `npx vitest run tests/layout.test.ts && npm test && npx tsc --noEmit && npm run build | tail -3`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/index.html 08-survidle/src/style.css 08-survidle/src/ui/map.ts 08-survidle/src/main.ts 08-survidle/tests/layout.test.ts
git commit -m "feat(survidle): the columns scroll inside themselves, the right column reads as a check-in, and the page fits a phone"
```

---

### Task 4: docs/ux.md and the markers

**Files:**
- Create: `docs/ux.md`
- Modify: `docs/README.md` (a pointer under Development), `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build-order sentence for the UI pass gains "; built"; a "Built" paragraph at the end of "### The UI pass")

- [ ] **Step 1: docs/ux.md**

The rules from the spec's section 5, each as a short paragraph with how a browser pass checks it: nothing off the screen at 1440 by 900 (name the panels that must be visible); a list past a dozen rows has a fold and a filter; the check-in fits above the fold; a Do row is two lines with its bar; buttons reachable by thumb at 390 wide; every browser pass runs at both widths and its record says so.

- [ ] **Step 2: README and roadmap**

README, under Development after the dev-server lines: "Every browser pass runs at 1440 by 900 and at 390 wide against `docs/ux.md`." Roadmap: the build-order sentence and a Built paragraph naming what shipped (the kind per row, fold and filter, the column order, the phone layout, the legend, `docs/ux.md`), with the browser pass's reading left for the controller.

- [ ] **Step 3: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/docs/ux.md 08-survidle/docs/README.md 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the UI pass built - docs/ux.md is the rule every browser pass checks, the roadmap marks it"
```
