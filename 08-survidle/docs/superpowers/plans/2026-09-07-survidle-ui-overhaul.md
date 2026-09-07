# Survidle UI overhaul implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the survidle interface so the action space is scannable
rather than buried, without teaching the player any answer they could
discover.

**Architecture:** Three columns with one stated rule - left is info,
middle is interactive, right is the queue. The HERE panel is deleted and
its box becomes a tab container (Do / Log / Pack / Journal); the Do tab
carries the existing five groups as subtabs, each split into purpose
groups on the left and items on the right. The map gains a translucent
tooltip and takes over travel. Everything is rendered through the
existing morphing renderer, and node identity is guarded by tests.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom. No new
dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-survidle-ui-overhaul-design.md`

## Global Constraints

- **Work in the worktree** `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/survidle-ui-overhaul`,
  prototype directory `08-survidle`. A sibling session holds uncommitted
  edits to `main.ts`, `dopanel.ts`, `panels.ts`, `render.ts`, `bars.ts`,
  `map.ts`, `style.css` on `main` in the shared checkout. Never `cd` to
  the shared checkout.
- **A worktree has no `node_modules`.** Task 0 installs them. `npm test`
  and `npm run build` cannot run before it.
- **Stage with explicit paths.** Never `git add -A`; several sessions
  share this repo.
- **`npm test` and `npm run build` must both pass before every commit.**
  `npm test` is `vitest run --exclude 'tests/slow/**'`; `npm run build`
  is `tsc && vite build`.
- **Never use `innerHTML` outside `src/ui/render.ts`.** Task 2 adds the
  test that enforces it. `main.ts`'s startup write of the map legend is
  the one named exemption.
- **Never put a per-frame value in panel markup.** Bar widths and tooltip
  coordinates are written onto elements by `src/ui/bars.ts`; the markup
  never mentions them. `morphAttrs` leaves `style` alone for exactly this
  reason.
- **Comments explain, they never chronicle.** No dates, no "previously",
  no before/after in code comments.
- **No em dashes and no non-typable characters** in any file. Use `-`,
  `->`, `"`, `...`. The one exception is section 9 item 4's Norwegian
  characters, which are the point of that task.
- **Discoverability, not instruction.** No task may add text that teaches
  how to achieve something. Naming what blocks a row is allowed; naming
  the recipe that would unblock it is not.

---

## Phase 1 - guards and data

### Task 0: Install, and confirm the baseline is green

**Files:**
- Modify: none

- [ ] **Step 1: Install dependencies in the worktree**

```bash
cd 08-survidle && npm install
```

- [ ] **Step 2: Confirm the baseline passes before anything changes**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS. If anything is red here it is red on `main` and is not
this plan's doing - report it and stop rather than fixing it silently.

- [ ] **Step 3: Record the churn baseline**

Run: `cd 08-survidle && npx vitest run tests/churn.test.ts --reporter verbose`
Expected: PASS. Note the printed counts; later tasks compare against
them.

No commit - nothing changed.

---

### Task 1: The `innerHTML` guard

Written first so it protects every task after it.

**Files:**
- Create: `08-survidle/tests/innerhtml.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. A test only.

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The morphing renderer is what keeps a scroll position, a caret and the
 * button under the pointer alive across a redraw. One hand-rolled
 * assignment to innerHTML throws all of that away for the panel it is in,
 * silently, and reads like ordinary code. So there is exactly one place
 * allowed to write it.
 */
const ALLOWED = new Set(["render.ts"]);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : [],
  );
}

describe("innerHTML has one home", () => {
  it("nothing under src/ui assigns innerHTML except the renderer", () => {
    const offenders = filesUnder("src/ui")
      .filter((f) => !ALLOWED.has(f.split("/").pop() as string))
      .filter((f) => /\.innerHTML\s*=/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("main.ts assigns it once, for the legend written at startup", () => {
    const hits = readFileSync("src/main.ts", "utf8").match(/\.innerHTML\s*=/g) ?? [];
    expect(hits.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd 08-survidle && npx vitest run tests/innerhtml.test.ts`
Expected: PASS. This one starts green on purpose - it is a ratchet, not a
discovery. If it starts red, the offender it names is pre-existing; fix
that offender in this task before continuing.

- [ ] **Step 3: Commit**

```bash
git add 08-survidle/tests/innerhtml.test.ts
git commit -m "test(survidle): innerHTML has one home, and a test that says so"
```

---

### Task 2: Purpose groups as data, with a coverage test

Pure data and one lookup. No UI. This is what every later Do task reads.

**Files:**
- Create: `08-survidle/src/ui/purpose.ts`
- Create: `08-survidle/tests/purpose.test.ts`

**Interfaces:**
- Consumes: `TaskId` from `../sim/types`; `intentGroups` from `./dopanel`.
- Produces:
  - `export type SubtabId = "Gather" | "Hunt" | "Camp" | "Make" | "Build"`
  - `export const SUBTABS: SubtabId[]`
  - `export const PURPOSES: Record<SubtabId, string[]>` - the left pane's
    entries, in display order
  - `export function rowKey(id: TaskId, arg?: string): string` - `"roots"`,
    `"craft:knife"`, `"build:leanTo"`, `"hunt:elk"`
  - `export function purposeOf(id: TaskId, arg?: string): string | null`
  - `export function subtabOf(id: TaskId, arg?: string): SubtabId | null`

- [ ] **Step 1: Write the failing coverage test**

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { intentGroups } from "../src/ui/dopanel";
import { PURPOSES, purposeOf, SUBTABS, subtabOf } from "../src/ui/purpose";
import { regionAt } from "../src/world/gen";

/**
 * Every row the Do panel can draw has exactly one purpose, and every
 * purpose has at least one row. A row with no purpose would render into no
 * pane and simply be gone; prose did not stop that happening to the AI
 * policy in 02-balticmap and it will not stop it here.
 */
describe("every Do row has exactly one purpose", () => {
  const { state, world } = newGame(21);
  const rows = intentGroups(regionAt(world, state.player.region)).flatMap((g) => g.items);

  it("no row falls through", () => {
    const homeless = rows.filter((r) => purposeOf(r.id, r.arg) === null).map((r) => `${r.id}:${r.arg ?? ""}`);
    expect(homeless).toEqual([]);
  });

  it("every row's purpose is one its subtab offers", () => {
    const wrong = rows
      .filter((r) => {
        const sub = subtabOf(r.id, r.arg);
        return sub === null || !PURPOSES[sub].includes(purposeOf(r.id, r.arg) as string);
      })
      .map((r) => `${r.id}:${r.arg ?? ""}`);
    expect(wrong).toEqual([]);
  });

  it("no purpose pane is empty", () => {
    const empty = SUBTABS.flatMap((s) =>
      PURPOSES[s]
        .filter((p) => !rows.some((r) => subtabOf(r.id, r.arg) === s && purposeOf(r.id, r.arg) === p))
        .map((p) => `${s}/${p}`),
    );
    expect(empty).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/purpose.test.ts`
Expected: FAIL - cannot resolve `../src/ui/purpose`.

- [ ] **Step 3: Write `src/ui/purpose.ts`**

Assignments are section 5 of the spec, verbatim. `makeCamp` is in Build,
not Camp - it is siting, not a chore.

```ts
import type { TaskId } from "../sim/types";

export type SubtabId = "Gather" | "Hunt" | "Camp" | "Make" | "Build";

export const SUBTABS: SubtabId[] = ["Gather", "Hunt", "Camp", "Make", "Build"];

/** The left pane's entries per subtab, in the order they are shown. */
export const PURPOSES: Record<SubtabId, string[]> = {
  Gather: ["Fuel", "Food", "Material"],
  Hunt: ["Food", "Traps", "Scout"],
  Camp: ["Fire", "Fuel", "Food", "Water", "Rest", "Tools"],
  Make: ["Fire", "Tools", "Hunting", "Clothing", "Water"],
  Build: ["Site", "Fire", "Shelter", "Water", "Food"],
};

/**
 * A row's name in this table: its task id, or `id:arg` where one task
 * covers many rows. Keyed the way dopanel.ts's VOCABULARY is keyed, so
 * the two tables read the same and can be checked against each other.
 */
export function rowKey(id: TaskId, arg?: string): string {
  return arg ? `${id}:${arg}` : id;
}

/**
 * Where each row lives. A row belongs to exactly one purpose, chosen by
 * what a player wants it for first: inner bark is food before it is
 * cordage stock, so it is Food, and bark is Material.
 *
 * An `id:arg` entry wins over a bare `id`, which is how every hunt
 * species, every cook and every fill share one line.
 */
const HOME: Record<string, [SubtabId, string]> = {
  // Gather
  chop: ["Gather", "Fuel"], deadwood: ["Gather", "Fuel"], sticks: ["Gather", "Fuel"],
  berries: ["Gather", "Food"], eggs: ["Gather", "Food"], roots: ["Gather", "Food"],
  seaweed: ["Gather", "Food"], innerBark: ["Gather", "Food"], tapSap: ["Gather", "Food"],
  bark: ["Gather", "Material"], stone: ["Gather", "Material"],
  // Hunt
  hunt: ["Hunt", "Food"], fish: ["Hunt", "Food"], emptyTrap: ["Hunt", "Food"],
  setTrap: ["Hunt", "Traps"], read: ["Hunt", "Scout"],
  // Camp
  light: ["Camp", "Fire"], lightIndoors: ["Camp", "Fire"], lightTorch: ["Camp", "Fire"],
  split: ["Camp", "Fuel"], splitWedges: ["Camp", "Fuel"],
  cook: ["Camp", "Food"], hang: ["Camp", "Food"], crack: ["Camp", "Food"], grindBark: ["Camp", "Food"],
  melt: ["Camp", "Water"], thaw: ["Camp", "Water"], fill: ["Camp", "Water"], iceHole: ["Camp", "Water"],
  night: ["Camp", "Rest"], rest: ["Camp", "Rest"], sleep: ["Camp", "Rest"],
  repair: ["Camp", "Tools"], sharpen: ["Camp", "Tools"], hone: ["Camp", "Tools"],
  // Make
  "craft:fireDrill": ["Make", "Fire"], "craft:torch": ["Make", "Fire"],
  "craft:knife": ["Make", "Tools"], "craft:flakedAxe": ["Make", "Tools"],
  "craft:stoneAxe": ["Make", "Tools"], "craft:whetstone": ["Make", "Tools"],
  "craft:wedges": ["Make", "Tools"], "craft:needle": ["Make", "Tools"],
  "craft:cordage": ["Make", "Tools"],
  "craft:bow": ["Make", "Hunting"], "craft:arrows": ["Make", "Hunting"],
  "craft:fishingSpear": ["Make", "Hunting"], "craft:snare": ["Make", "Hunting"],
  "craft:basketTrap": ["Make", "Hunting"],
  "craft:hideCoat": ["Make", "Clothing"], "craft:hideTrousers": ["Make", "Clothing"],
  "craft:hideBoots": ["Make", "Clothing"], "craft:furHat": ["Make", "Clothing"],
  "craft:furMittens": ["Make", "Clothing"], "craft:hideBlanket": ["Make", "Clothing"],
  "craft:barkBucket": ["Make", "Water"], "craft:waterskin": ["Make", "Water"],
  // Build
  makeCamp: ["Build", "Site"],
  "build:firePit": ["Build", "Fire"],
  "build:leanTo": ["Build", "Shelter"], "build:cabin": ["Build", "Shelter"],
  "build:turfHut": ["Build", "Shelter"], "build:snowShelter": ["Build", "Shelter"],
  "build:boughBed": ["Build", "Shelter"],
  "build:seep": ["Build", "Water"], "build:waterStore": ["Build", "Water"],
  "build:dryingRack": ["Build", "Food"], "build:snare": ["Build", "Food"],
};

function home(id: TaskId, arg?: string): [SubtabId, string] | null {
  return HOME[rowKey(id, arg)] ?? HOME[id] ?? null;
}

export function purposeOf(id: TaskId, arg?: string): string | null {
  return home(id, arg)?.[1] ?? null;
}

export function subtabOf(id: TaskId, arg?: string): SubtabId | null {
  return home(id, arg)?.[0] ?? null;
}
```

- [ ] **Step 4: Run the test**

Run: `cd 08-survidle && npx vitest run tests/purpose.test.ts`
Expected: PASS. If a row is homeless, add it to `HOME` - do not weaken
the test.

- [ ] **Step 5: Full suite and build**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/purpose.ts 08-survidle/tests/purpose.test.ts
git commit -m "feat(survidle): every Do row has exactly one purpose, and a test that says so"
```

---

## Phase 2 - the frame

### Task 3: The board's new shape

`index.html` and the grid only. Panels move; none of them changes what it
draws yet, so the game keeps working throughout.

**Files:**
- Modify: `08-survidle/index.html`
- Modify: `08-survidle/src/style.css:35-42` (`#app` grid), and the phone
  breakpoints at `:525` and `:546`
- Modify: `08-survidle/tests/layout.test.ts`

**Interfaces:**
- Produces: the element ids every later task mounts into - `#camp`,
  `#panes`, `#panetabs`, `#pane-do`, `#pane-log`, `#pane-pack`,
  `#pane-journal`, `#dosubs`, `#dopurposes`, `#doitems`, `#maptip`.

- [ ] **Step 1: Rewrite the layout test for the new shape**

```ts
it("left is info, middle is interactive, right is the queue", () => {
  const html = readFileSync("index.html", "utf8");
  const at = (id: string) => html.indexOf(`id="${id}"`);
  // Left: you, your camp, what is coming. Read-only but for the away slider.
  for (const id of ["stats", "camp", "gear", "skills", "forecast"]) expect(at(id)).toBeGreaterThan(0);
  // Middle: the map you click, the work you can stop, the list you choose from.
  const mid = html.slice(at("center"), at("right"));
  for (const id of ["clock", "map", "task", "panes"]) expect(mid).toContain(`id="${id}"`);
  // Right: the queue and nothing else.
  const right = html.slice(at("right"));
  expect(right).toContain('id="orders"');
  for (const id of ["log", "inventory", "journal", "actions"]) expect(right).not.toContain(`id="${id}"`);
});

it("all four panes exist at once, three of them hidden", () => {
  const html = readFileSync("index.html", "utf8");
  for (const id of ["pane-do", "pane-log", "pane-pack", "pane-journal"]) {
    expect(html).toContain(`id="${id}"`);
  }
  // Rendering a pane on demand would destroy the other three and their
  // scroll offsets, which is the complaint this whole pass answers.
  expect((html.match(/id="pane-[a-z]+"[^>]*hidden/g) ?? []).length).toBe(3);
});

it("the Do pane's only scroll container is the item pane", () => {
  const html = readFileSync("index.html", "utf8");
  for (const id of ["dosubs", "dopurposes", "doitems"]) expect(html).toContain(`id="${id}"`);
});

it("the tooltip is in the markup, hidden, so it is never created or destroyed", () => {
  const html = readFileSync("index.html", "utf8");
  const tip = html.indexOf('id="maptip"');
  expect(tip).toBeGreaterThan(0);
  expect(html.slice(tip, html.indexOf(">", tip))).toContain("hidden");
});
```

Delete the old "the right column is a check-in" test - the right column
is no longer a check-in, and leaving a test asserting the old order would
fail for the right reason but read like a bug.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/layout.test.ts`
Expected: FAIL on every new assertion.

- [ ] **Step 3: Rewrite `index.html`'s `#app`**

```html
<div id="app">
  <aside id="left" class="col">
    <section id="stats" class="panel"></section>
    <section id="camp" class="panel"></section>
    <section id="gear" class="panel"></section>
    <section id="skills" class="panel"></section>
    <section id="forecast" class="panel"></section>
  </aside>
  <main id="center" class="col">
    <section id="clock" class="panel"></section>
    <section id="map" class="panel">
      <div id="mapdyn"></div>
      <div id="maptip" hidden></div>
      <div class="legend"></div>
    </section>
    <section id="task" class="panel"></section>
    <section id="panes" class="panel">
      <div id="panetabs"></div>
      <div id="pane-do">
        <input type="search" data-do="filter" placeholder="filter" />
        <div id="dosubs"></div>
        <div class="dosplit">
          <div id="dopurposes"></div>
          <div id="doitems"></div>
        </div>
      </div>
      <div id="pane-log" hidden><div id="log"></div></div>
      <div id="pane-pack" hidden><div id="inventory"></div></div>
      <div id="pane-journal" hidden><div id="journal"></div></div>
    </section>
  </main>
  <aside id="right" class="col">
    <section id="orders" class="panel"></section>
  </aside>
</div>
```

The away slider's `<div id="away">` moves inside the left column's
`#forecast`; Task 12 merges the two, so for now leave the slider markup
where it is and only move it in the DOM.

- [ ] **Step 4: Widen the middle in `style.css`**

```css
#app {
  display: grid;
  grid-template-columns: 300px minmax(680px, 1fr) 260px;
  gap: 10px;
  padding: 10px;
  flex: 1;
  min-height: 0;
}

/* The Do pane's split: purposes choose, items scroll. Only the item pane
   scrolls, so it is the only element whose scrollTop there is to lose. */
.dosplit { display: flex; min-height: 0; flex: 1; }
#dopurposes { width: 120px; border-right: 1px solid var(--line); flex: none; }
#doitems { flex: 1; overflow-y: auto; min-width: 0; padding-left: 8px; }
```

Update the two phone breakpoints so `.dosplit` stacks under 1fr and
`#dopurposes` becomes a horizontal strip.

- [ ] **Step 5: Point `main.ts` at the moved ids**

`setPanel("region", ...)` is deleted in Task 8; until then it targets an
element that no longer exists and returns false harmlessly. Rename
`setPanel("task", ...)`'s target usage only if the id changed - it did
not. Add `setPanel("orders", ...)` fed by the queue half of `taskHtml`
in Task 11; for now `#orders` stays empty and `#task` holds both.

- [ ] **Step 6: Run the test and the suite**

Run: `cd 08-survidle && npx vitest run tests/layout.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/index.html 08-survidle/src/style.css 08-survidle/tests/layout.test.ts 08-survidle/src/main.ts
git commit -m "refactor(survidle): left is info, middle is interactive, right is the queue"
```

---

### Task 4: The tabs, and what they remember

**Files:**
- Create: `08-survidle/src/ui/panes.ts`
- Modify: `08-survidle/src/ui/render.ts` (`UiState`, `newUiState`)
- Modify: `08-survidle/src/main.ts` (the `pane` and `subtab` click cases)
- Create: `08-survidle/tests/panes.test.ts`

**Interfaces:**
- Consumes: `SubtabId`, `SUBTABS`, `PURPOSES` from `./purpose`.
- Produces:
  - `export type PaneId = "do" | "log" | "pack" | "journal"`
  - `export interface Panes { pane: PaneId; subtab: SubtabId; purpose: string }`
  - `export const PANES_KEY = "survidle.panes"`
  - `export function loadPanes(storage: Storage): Panes`
  - `export function savePanes(storage: Storage, p: Panes): void`
  - `export function paneTabsHtml(p: Panes): string`
  - `export function subtabsHtml(p: Panes): string`
  - `export function purposesHtml(p: Panes, counts: Record<string, number>): string`
- `UiState` gains `panes: Panes` and loses `tab: TaskGroup` and
  `advanced: boolean` (Task 7 removes their last readers; until then keep
  both and delete in Task 7).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadPanes, PANES_KEY, savePanes } from "../src/ui/panes";

class Mem implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe("the panes remember where the player was", () => {
  it("a fresh player lands on Do, Gather, its first purpose", () => {
    expect(loadPanes(new Mem())).toEqual({ pane: "do", subtab: "Gather", purpose: "Fuel" });
  });

  it("a choice survives a reload", () => {
    const s = new Mem();
    savePanes(s, { pane: "do", subtab: "Camp", purpose: "Water" });
    expect(loadPanes(s)).toEqual({ pane: "do", subtab: "Camp", purpose: "Water" });
  });

  it("a purpose the subtab does not offer falls back rather than showing nothing", () => {
    const s = new Mem();
    s.setItem(PANES_KEY, JSON.stringify({ pane: "do", subtab: "Gather", purpose: "Clothing" }));
    expect(loadPanes(s).purpose).toBe("Fuel");
  });

  it("rubbish in storage is not fatal", () => {
    const s = new Mem();
    s.setItem(PANES_KEY, "{oh no");
    expect(loadPanes(s).pane).toBe("do");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/panes.test.ts`
Expected: FAIL - cannot resolve `../src/ui/panes`.

- [ ] **Step 3: Write `src/ui/panes.ts`**

```ts
import { PURPOSES, type SubtabId, SUBTABS } from "./purpose";
import { esc } from "./render";

export type PaneId = "do" | "log" | "pack" | "journal";
export const PANE_IDS: PaneId[] = ["do", "log", "pack", "journal"];
const PANE_LABEL: Record<PaneId, string> = { do: "Do", log: "Log", pack: "Pack", journal: "Journal" };

export interface Panes { pane: PaneId; subtab: SubtabId; purpose: string }

export const PANES_KEY = "survidle.panes";

function fallback(): Panes {
  return { pane: "do", subtab: "Gather", purpose: PURPOSES.Gather[0] };
}

/** What a reload returns to, clamped: a stored pane naming a subtab or a purpose that no longer exists reads as the default rather than an empty pane. */
export function loadPanes(storage: Storage): Panes {
  const def = fallback();
  try {
    const p = JSON.parse(storage.getItem(PANES_KEY) ?? "{}") as Partial<Panes>;
    const pane = PANE_IDS.includes(p.pane as PaneId) ? (p.pane as PaneId) : def.pane;
    const subtab = SUBTABS.includes(p.subtab as SubtabId) ? (p.subtab as SubtabId) : def.subtab;
    const purpose = PURPOSES[subtab].includes(p.purpose as string) ? (p.purpose as string) : PURPOSES[subtab][0];
    return { pane, subtab, purpose };
  } catch {
    return def;
  }
}

export function savePanes(storage: Storage, p: Panes): void {
  storage.setItem(PANES_KEY, JSON.stringify(p));
}

export function paneTabsHtml(p: Panes): string {
  return PANE_IDS
    .map((id) => `<button class="tab${id === p.pane ? " on" : ""}" data-act="pane" data-pane="${id}">${PANE_LABEL[id]}</button>`)
    .join("");
}

export function subtabsHtml(p: Panes): string {
  return SUBTABS
    .map((s) => `<button class="sub${s === p.subtab ? " on" : ""}" data-act="subtab" data-subtab="${s}">${esc(s)}</button>`)
    .join("");
}

/** The left pane, each purpose carrying how many rows it holds so an empty one reads as empty rather than as a mistake. */
export function purposesHtml(p: Panes, counts: Record<string, number>): string {
  return PURPOSES[p.subtab]
    .map((q) => `<button class="grp${q === p.purpose ? " on" : ""}" data-act="purpose" data-purpose="${esc(q)}">${esc(q)} <small>${counts[q] ?? 0}</small></button>`)
    .join("");
}
```

- [ ] **Step 4: Wire the clicks and the hiding in `main.ts`**

```ts
case "pane":
  ui.panes = { ...ui.panes, pane: target.dataset.pane as PaneId };
  savePanes(localStorage, ui.panes);
  break;
case "subtab": {
  const subtab = target.dataset.subtab as SubtabId;
  // A subtab's own first purpose, since the one showing may not exist here.
  ui.panes = { ...ui.panes, subtab, purpose: PURPOSES[subtab][0] };
  savePanes(localStorage, ui.panes);
  break;
}
case "purpose":
  ui.panes = { ...ui.panes, purpose: target.dataset.purpose as string };
  savePanes(localStorage, ui.panes);
  break;
```

And in the render function, toggle visibility with `hidden` rather than
rendering on demand, so three panes keep their scroll while one is shown:

```ts
for (const id of PANE_IDS) {
  const el = document.getElementById(`pane-${id}`);
  if (el) el.hidden = id !== ui.panes.pane;
}
setPanel("panetabs", paneTabsHtml(ui.panes));
setPanel("dosubs", subtabsHtml(ui.panes));
```

- [ ] **Step 5: Run the test, the suite and the build**

Run: `cd 08-survidle && npx vitest run tests/panes.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/panes.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/tests/panes.test.ts
git commit -m "feat(survidle): four panes, three hidden, and they remember where you were"
```

---

### Task 5: The identity harness

Written before the Do split so the split is built against it. Every
assertion here holds **today** - the morphing renderer already earns
them - which is what makes it a guard: it is green before Task 6 starts
and must still be green after.

**Files:**
- Create: `08-survidle/tests/identity.test.ts`

**Interfaces:**
- Consumes: `setPanel`, `resetPanels` from `../src/ui/render`; `doHtml`
  from `../src/ui/dopanel` at its **current** signature
  (`doHtml(state, world, cal, ui, folds)`). Task 6 drops the fifth
  argument and updates the call site here.
- Produces: nothing importable.

- [ ] **Step 1: Write the test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { doHtml } from "../src/ui/dopanel";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";

/**
 * Scroll offset is a DOM property, not an attribute. It is not in the
 * markup, so morphing cannot put it back - it survives if and only if the
 * scrolling element is never replaced. These tests hold the renderer to
 * that, because the failure is invisible in a screenshot and obvious to
 * the person whose place in the list just vanished.
 */
describe("a redraw takes nothing away", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);

  beforeEach(() => {
    resetPanels();
    document.body.innerHTML = `<div id="doitems"></div>`;
  });

  function draw(ui: ReturnType<typeof newUiState>) {
    setPanel("doitems", doHtml(state, world, cal, ui, {}));
  }

  it("the item pane is the same node across every redraw", () => {
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems");
    ui.filter = "fire";
    draw(ui);
    ui.filter = "";
    draw(ui);
    expect(document.getElementById("doitems")).toBe(pane);
  });

  it("a row present before and after is the same node", () => {
    const ui = newUiState();
    draw(ui);
    const before = document.querySelector('[data-opt^="intent:deadwood"]');
    expect(before).not.toBeNull();
    // A row must survive its neighbours disappearing and coming back.
    ui.filter = "wood";
    draw(ui);
    ui.filter = "";
    draw(ui);
    expect(document.querySelector('[data-opt^="intent:deadwood"]')).toBe(before);
  });

  it("a scroll position survives a redraw", () => {
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems") as HTMLElement;
    pane.scrollTop = 120;
    ui.filter = "wood";
    draw(ui);
    expect(pane.scrollTop).toBe(120);
  });

  it("every container in the pane carries a key morphChildren can find it by", () => {
    // keyOf names a node by its id or its data-* attributes; a node with
    // neither is matched by position, which is wrong for anything whose
    // siblings come and go.
    const ui = newUiState();
    draw(ui);
    const pane = document.getElementById("doitems") as HTMLElement;
    for (const el of [...pane.children]) {
      const keyed = el.id !== "" || Object.keys((el as HTMLElement).dataset).length > 0;
      expect(keyed, `unkeyed container: ${el.outerHTML.slice(0, 80)}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd 08-survidle && npx vitest run tests/identity.test.ts`
Expected: PASS. If the fourth test fails, `doHtml` is already emitting an
unkeyed wrapper - give it an `id` or a `data-*` now, before Task 6 builds
on top of it.

- [ ] **Step 3: Run the suite and the build**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 08-survidle/tests/identity.test.ts
git commit -m "test(survidle): a redraw takes nothing away"
```

---

### Task 6: The Do split

The largest task. `doHtml` stops emitting groups and folds and starts
emitting a purpose pane plus an item pane.

**Files:**
- Modify: `08-survidle/src/ui/dopanel.ts` (`doHtml`, `groupHtml`,
  `searchHtml`; delete `loadFolds`, `saveFold`, `FOLD_KEY`, `splitFar`'s
  "more (N)" behaviour)
- Modify: `08-survidle/src/main.ts` (drop the `fold` and `more` cases,
  feed the two new panels)
- Modify: `08-survidle/tests/dopanel.test.ts`
- Modify: `08-survidle/tests/identity.test.ts` - drop the now-removed
  fifth argument from the `doHtml` call, and add the subtab and purpose
  case below

**Interfaces:**
- Consumes: `PURPOSES`, `purposeOf`, `subtabOf` from `./purpose`;
  `purposesHtml` from `./panes`.
- Produces:
  - `export function doHtml(state, world, cal, ui): string` - the item
    pane's contents only. **The `folds` parameter is gone.**
  - `export function doPurposesHtml(state, world, cal, ui): string` - the
    left pane, with counts.

- [ ] **Step 1: Write the failing behaviour test**

```ts
it("a purpose shows its own rows and no others", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  ui.panes = { ...ui.panes, subtab: "Gather", purpose: "Food" };
  const html = doHtml(state, world, cal, ui);
  expect(html).toContain("intent:roots:");
  expect(html).not.toContain("intent:deadwood:");
});

it("Camp is no longer one heap", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  ui.panes = { ...ui.panes, subtab: "Camp", purpose: "Water" };
  const html = doHtml(state, world, cal, ui);
  expect(html).toContain("intent:melt:");
  expect(html).not.toContain("intent:sharpen:");
});

it("a filter searches every subtab, not the one showing", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  ui.panes = { ...ui.panes, subtab: "Gather", purpose: "Fuel" };
  ui.filter = "cook";
  // Cooking is in Camp/Food; a search that only looked where the player
  // was standing is the search that sent him looking by hand.
  expect(doHtml(state, world, cal, ui)).toContain("intent:cook:");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/dopanel.test.ts`
Expected: FAIL - `doHtml` still takes `folds` and emits groups.

- [ ] **Step 3: Rewrite `doHtml`**

```ts
/** The rows of one subtab and purpose, built at the open row's chosen spot. */
function paneRows(state: GameState, world: World, cal: Calendar, ui: UiState): TaskOption[] {
  const r = regionAt(world, state.player.region);
  return intentGroups(r)
    .flatMap((g) => g.items)
    .filter((i) => subtabOf(i.id, i.arg) === ui.panes.subtab && purposeOf(i.id, i.arg) === ui.panes.purpose)
    .map(({ id, arg }) => {
      const argKey = arg ?? "";
      const open = ui.open !== null && ui.open.id === id && ui.open.arg === argKey;
      return withProgression(state, world, intentOption(state, world, cal, id, arg, open ? ui.choice.where : "nearest"));
    });
}

/** How many rows each purpose of the showing subtab holds, for the left pane's counts. */
export function doPurposesHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const r = regionAt(world, state.player.region);
  const counts: Record<string, number> = {};
  for (const q of PURPOSES[ui.panes.subtab]) counts[q] = 0;
  for (const i of intentGroups(r).flatMap((g) => g.items)) {
    if (subtabOf(i.id, i.arg) !== ui.panes.subtab) continue;
    const q = purposeOf(i.id, i.arg);
    if (q !== null && q in counts) counts[q]++;
  }
  return purposesHtml(ui.panes, counts);
}

export function doHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  // A filter takes over the pane and searches every subtab: an answer left
  // shut inside a purpose the reader is not looking at is not an answer.
  const rows = ui.filter.trim() ? null : paneRows(state, world, cal, ui);
  return rows === null
    ? searchHtml(state, world, cal, ui)
    : rows.map((o) => intentRowHtml(o, ui, state, world)).join("");
}
```

`searchHtml` keeps its ranked two-section shape and loses its `.grp`
wrapper's fold heading. Delete `groupHtml`, `FOLD_KEY`, `loadFolds`,
`saveFold`, `splitFar` and the `more (N)` machinery; delete
`ui.folds` and `ui.moreOpen` from `UiState`.

- [ ] **Step 4: Feed the two panels from `main.ts`**

```ts
setPanel("dopurposes", doPurposesHtml(state, world, cal, ui));
setPanel("doitems", doHtml(state, world, cal, ui));
```

Remove the `fold` and `more` cases from `onClick` and the
`loadFolds(localStorage)` call at startup.

- [ ] **Step 5: Extend the identity harness to the split**

Task 5's `draw` helper loses its `{}` argument, and one case is added -
the one this task could break:

```ts
it("the item pane is the same node across subtab and purpose changes", () => {
  const ui = newUiState();
  draw(ui);
  const pane = document.getElementById("doitems");
  ui.panes = { ...ui.panes, subtab: "Camp", purpose: "Water" };
  draw(ui);
  ui.panes = { ...ui.panes, subtab: "Gather", purpose: "Fuel" };
  draw(ui);
  expect(document.getElementById("doitems")).toBe(pane);
});
```

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npx vitest run tests/dopanel.test.ts tests/identity.test.ts && npm test && npm run build`
Expected: PASS, all five identity cases included.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/ui/dopanel.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/tests/dopanel.test.ts 08-survidle/tests/identity.test.ts
git commit -m "feat(survidle): the Do pane splits by purpose, and the item pane keeps its place"
```

---

### Task 7: The row says less, and the advanced panel goes

**Files:**
- Modify: `08-survidle/src/ui/dopanel.ts` (`intentRowHtml`)
- Modify: `08-survidle/src/ui/panels.ts` (delete `actionsHtml` and
  `optHtml`; keep `instantHtml`, which Task 11 moves)
- Modify: `08-survidle/src/ui/render.ts` (delete `tab` and `advanced`)
- Modify: `08-survidle/src/main.ts` (delete the `tab` and `advanced` cases)
- Modify: `08-survidle/tests/dopanel.test.ts`, `08-survidle/tests/ui.test.ts`

**Interfaces:**
- Produces: no signature changes. `actionsHtml` and `optHtml` cease to
  exist; every importer must drop them.

- [ ] **Step 1: Write the failing test**

```ts
it("a row you can do says its name and how long, and no more", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  ui.panes = { ...ui.panes, subtab: "Gather", purpose: "Fuel" };
  const row = doHtml(state, world, cal, ui);
  const line = row.slice(row.indexOf("intent:deadwood"));
  expect(line).toContain("1 h");
  // The prose detail moved into `more`; it is not deleted, it is out of the scan.
  expect(line.slice(0, line.indexOf("</button>"))).not.toContain("forest floor");
});

it("a row you cannot do says why, which is the whole reason it is there", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();
  ui.panes = { ...ui.panes, subtab: "Camp", purpose: "Fire" };
  const html = doHtml(state, world, cal, ui);
  const light = html.slice(html.indexOf("intent:light:"));
  expect(light.slice(0, light.indexOf("</button>"))).toMatch(/needs|no |without/i);
});

it("the advanced panel is gone", async () => {
  const panels = await import("../src/ui/panels");
  expect("actionsHtml" in panels).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/dopanel.test.ts`
Expected: FAIL - the detail line is still on the row, `actionsHtml` still
exports.

- [ ] **Step 3: Simplify the row**

In `intentRowHtml`, an ok row's small print becomes the duration alone;
the detail joins `rowExpandHtml`'s expansion. A blocked row keeps
`o.why` and `o.detail` - a blocked row's job is to say what it needs. The
mastery bar and the producer `gives` line stay on both.

```ts
// A row you can do says its name and how long. Everything else it might
// say is a sentence a reader has to parse mid-scan, and the scan is the
// thing this panel is for. The detail is one click away, under `more`.
const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
```

and in `rowExpandHtml`, lead the expansion with the detail:

```ts
const detail = o.detail ? `<div class="detail"><small>${esc(plain(o.detail))}</small></div>` : "";
return `${detail}<div class="expand">...`;
```

- [ ] **Step 4: Delete `actionsHtml`, `optHtml`, `ui.tab`, `ui.advanced`**

Remove the `advanced` toggle from `doHtml`'s tail, the `tab` and
`advanced` cases from `onClick`, and the `GROUPS` const in `panels.ts` if
nothing else reads it. `tests/ui.test.ts`'s `allActions` helper reads
`actionsHtml`; rewrite it to walk `intentGroups` directly.

The coverage test from Task 2 is what proves nothing was only reachable
through the deleted panel: if a task had no purpose it would already have
failed there.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/dopanel.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/tests/dopanel.test.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): a row you can do says its name, a row you cannot says why"
```

---

## Phase 3 - the world

### Task 8: HERE dies, the Camp box is born

**Files:**
- Modify: `08-survidle/src/ui/panels.ts` (delete `regionHtml`; add
  `campHtml`)
- Modify: `08-survidle/src/main.ts`
- Modify: `08-survidle/tests/churn.test.ts` (drop `region`, add `camp`)
- Modify: `08-survidle/tests/ui.test.ts`, `08-survidle/tests/water-ui.test.ts`
  and any other importer of `regionHtml`
- Create: `08-survidle/tests/camp.ui.test.ts`

**Interfaces:**
- Consumes: `regionState`, `CAPABILITIES`, `standingHere`.
- Produces:
  - `export function campHtml(state: GameState, world: World): string`
- `regionHtml` and `rosterHtml` cease to exist. `readHtml` survives -
  Task 9's tooltip calls it for water tiles.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { campHtml } from "../src/ui/panels";

describe("the camp says what it is doing without being asked", () => {
  it("a cold fire says cold, where it cannot be missed", () => {
    const { state, world } = newGame(21);
    // Lighting the fire produced a delightful animation; losing it produced
    // silence. An idle game must be loudest when a thing the player built stops.
    expect(campHtml(state, world)).toMatch(/cold|no fire/i);
  });

  it("what a producer is limited by is on screen, not in a table nobody reads", () => {
    const { state, world } = newGame(21);
    const st = state.regions[state.player.region];
    st.structures.dryingRack = true;
    expect(campHtml(state, world)).toContain("rack");
  });

  it("the region prose is gone", async () => {
    const panels = await import("../src/ui/panels");
    expect("regionHtml" in panels).toBe(false);
    expect("rosterHtml" in panels).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/camp.ui.test.ts`
Expected: FAIL - `campHtml` does not exist.

- [ ] **Step 3: Write `campHtml`, delete `regionHtml`**

`campHtml` takes the `built`, `fire`, `rack`, `water` and `limits` blocks
out of `regionHtml` unchanged, plus the camp pile's weight, and drops
everything else. The `land`, `trees`, `animals` and `places` blocks are
**deleted, not moved** - the Do rows are the only inventory of what the
ground offers now, and Task 9's tooltip carries the per-cell part.

```ts
/**
 * What the camp is doing while you look elsewhere: whether the fire is
 * lit and what it has left to burn, what stands here, what is lying
 * here, and what each producer is limited by - the reason a camp that
 * makes its own food still runs out.
 */
export function campHtml(state: GameState, world: World): string {
  // built / fire / rack / water / limits, lifted from regionHtml unchanged
}
```

- [ ] **Step 4: Rewire and fix importers**

`setPanel("region", regionHtml(...))` becomes
`setPanel("camp", campHtml(state, world))`. Update the churn budget map:
drop `region`, add `camp: 5`.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/tests/camp.ui.test.ts 08-survidle/tests/churn.test.ts 08-survidle/tests/ui.test.ts 08-survidle/tests/water-ui.test.ts
git commit -m "feat(survidle): the region prose goes, the camp says what it is doing"
```

---

### Task 9: The map's tooltip

The riskiest task in the plan. Read section 11 of the spec before
starting.

**Files:**
- Create: `08-survidle/src/ui/tip.ts`
- Modify: `08-survidle/src/ui/map.ts` (add `cellFromPoint`)
- Modify: `08-survidle/src/ui/bars.ts` (add `placeTip`)
- Modify: `08-survidle/src/ui/render.ts` (`UiState.hover`)
- Modify: `08-survidle/src/main.ts` (pointer listeners)
- Modify: `08-survidle/src/style.css`
- Modify: `08-survidle/tests/churn.test.ts`
- Create: `08-survidle/tests/tip.test.ts`

**Interfaces:**
- Consumes: `viewOrigin`, `levelAt`, `LEVELS` from `./map`; `readHtml`,
  `siteLine`, `siteReport` from `./panels`.
- Produces:
  - `export function cellFromPoint(world, state, ui, x: number, y: number): number | null`
    in `map.ts` - `x`/`y` are offsets within `#mapdyn`
  - `export function tipKey(state, world, cell: number): string`
  - `export function tipHtml(state, world, cal, cell: number): string`
  - `export function placeTip(el: HTMLElement, x: number, y: number): void`
    in `bars.ts`
  - `UiState.hover: number | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellFromPoint } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { tipHtml, tipKey } from "../src/ui/tip";

describe("the map says what is under the pointer", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const ui = newUiState();

  it("a point on the board resolves to a cell", () => {
    expect(cellFromPoint(world, state, ui, 0, 0)).not.toBeNull();
  });

  it("a point off the board resolves to nothing rather than to cell zero", () => {
    expect(cellFromPoint(world, state, ui, -50, -50)).toBeNull();
  });

  it("the tooltip names the ground, the walk and what lies there", () => {
    const cell = cellFromPoint(world, state, ui, 10, 10) as number;
    const html = tipHtml(state, world, cal, cell);
    expect(html).toMatch(/km|m\b|here/);
  });

  it("the tooltip carries its walk button, so a tap can act without a second gesture", () => {
    const cell = cellFromPoint(world, state, ui, 40, 40) as number;
    expect(tipHtml(state, world, cal, cell)).toContain('data-act="task"');
  });

  it("the tooltip carries a close, because a touch device has no way to stop hovering", () => {
    const cell = cellFromPoint(world, state, ui, 40, 40) as number;
    expect(tipHtml(state, world, cal, cell)).toContain('data-act="tip-close"');
  });

  it("its key does not move with the pointer, only with the cell", () => {
    const a = cellFromPoint(world, state, ui, 10, 10) as number;
    expect(tipKey(state, world, a)).toBe(tipKey(state, world, a));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/tip.test.ts`
Expected: FAIL - neither module exports these.

- [ ] **Step 3: Write `cellFromPoint` in `map.ts`**

Derived from where the pointer is, never from per-element enter and
leave. A glyph replaced under the pointer fires `enter`; a glyph detached
under it never fires `leave`.

```ts
/**
 * The cell under a point inside the map board, or null when the point is
 * off it. Read from the pointer's own position rather than from a glyph's
 * enter and leave: a glyph replaced under the pointer fires an enter and
 * a glyph detached under it never fires a leave, so hover state derived
 * from those events gets stuck and this cannot.
 */
export function cellFromPoint(world: World, state: GameState, ui: UiState, x: number, y: number): number | null {
  const l = levelAt(ui.zoom);
  const col = Math.floor(x / l.px);
  const row = Math.floor(y / l.line);
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return null;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  return cellAt(world, x0 + col * l.cells, y0 + row * l.cells);
}
```

- [ ] **Step 4: Write `src/ui/tip.ts`**

```ts
/**
 * What the ground under the pointer is, and what can be done about it.
 *
 * Only what is genuinely per-cell: the terrain, the walk, the spot, what
 * lies there, the marks, what it would be as a camp, and on water what
 * has been read of it. Everything the old HERE panel said about the whole
 * region is either a Do row now or gone.
 */
export function tipKey(state: GameState, world: World, cell: number): string { /* cell, terrain, pile weight, marks, camp cell */ }

export function tipHtml(state: GameState, world: World, cal: Calendar, cell: number): string {
  // terrain, distance and walk time, spot name, pile, marks,
  // siteLine(siteReport(state, world, cell)), readHtml on water,
  // a walk button, and a close.
}
```

- [ ] **Step 5: Write `placeTip` in `bars.ts`**

**Coordinates never enter the markup.** A pointer moves many times a
second; a tooltip whose position were in the panel string would change
that string on every mousemove and put the map's redraw budget through
the floor. `morphAttrs` leaves `style` alone precisely so this can be
written directly.

```ts
/** Puts the tooltip beside the pointer, clamped inside the board. Written each move, never rendered. */
export function placeTip(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${x + 14}px`;
  el.style.top = `${y + 14}px`;
}
```

- [ ] **Step 6: Wire it in `main.ts`**

```ts
const board = document.getElementById("mapdyn")!;
const tip = document.getElementById("maptip")!;

// pointermove covers mouse, pen and touch-drag with one listener.
board.addEventListener("pointermove", (ev) => {
  const r = board.getBoundingClientRect();
  ui.hover = cellFromPoint(world, state, ui, ev.clientX - r.left, ev.clientY - r.top);
  placeTip(tip, ev.clientX - r.left, ev.clientY - r.top);
});
board.addEventListener("pointerleave", () => { ui.hover = null; });
```

and in the render function, guarded by its key so it redraws only when
the cell changes:

```ts
tip.hidden = ui.hover === null;
if (ui.hover !== null) {
  const key = tipKey(state, world, ui.hover);
  if (key !== lastTipKey) {
    lastTipKey = key;
    setPanel("maptip", tipHtml(state, world, cal, ui.hover));
  }
}
```

Add the `tip-close` case to `onClick`: `ui.hover = null`.

- [ ] **Step 7: Style it**

```css
/* Translucent so the ground it describes stays visible under it, and
   never a hit target - a tooltip that eats the pointer moves itself. */
#maptip {
  position: absolute;
  z-index: 5;
  max-width: 320px;
  padding: 6px 9px;
  background: rgba(12, 15, 20, 0.88);
  border: 1px solid var(--line);
  backdrop-filter: blur(2px);
  pointer-events: none;
}
/* Except its buttons, which are the whole point on a touch device. */
#maptip button { pointer-events: auto; }
@media (hover: none) { #maptip button { min-height: 40px; } }
```

- [ ] **Step 8: Add the pointer sweep to the churn test**

The test that catches coordinates leaking into markup.

```ts
it("sweeping the pointer does not redraw the map", () => {
  const { state, world } = newGame(21);
  const ui = newUiState();
  const cal = calendar(state.minute, state.startDoy);
  const still = `${mapKey(state, world, ui, cal)}|${mapHtml(world, state, ui, cal)}`;
  let changed = 0;
  for (let f = 0; f < FRAMES; f++) {
    ui.hover = cellFromPoint(world, state, ui, (f * 7) % 300, (f * 11) % 200);
    const now = `${mapKey(state, world, ui, cal)}|${mapHtml(world, state, ui, cal)}`;
    if (now !== still) changed++;
  }
  // The hovered cell is not the map's business. If this fails, the tooltip
  // has leaked into the map's markup or its key.
  expect(changed).toBe(0);
});
```

Add `maptip: 5` to `BUDGET` and include it in `panels()`.

- [ ] **Step 9: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add 08-survidle/src/ui/tip.ts 08-survidle/src/ui/map.ts 08-survidle/src/ui/bars.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/tip.test.ts 08-survidle/tests/churn.test.ts
git commit -m "feat(survidle): the map says what is under the pointer, and the pointer never redraws it"
```

---

### Task 10: Travel lives on the map

**Files:**
- Modify: `08-survidle/src/ui/map.ts` (a `travelHtml` corner stack)
- Modify: `08-survidle/index.html` (`#maptravel` inside `#map`)
- Modify: `08-survidle/src/main.ts`
- Modify: `08-survidle/src/style.css`
- Create: `08-survidle/tests/travel-ui.test.ts`

**Interfaces:**
- Consumes: `neighbours` from `../world/gen`; `check` from `../sim/tasks`.
- Produces:
  - `export function travelHtml(state, world, cal): string` in `map.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("the corner stack lists neighbours and only neighbours", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const html = travelHtml(state, world, cal);
  const listed = [...html.matchAll(/data-arg="region:(\d+)"/g)].map((m) => Number(m[1]));
  const nb = regionAt(world, state.player.region).neighbours.map((n) => n.id);
  expect([...listed].sort()).toEqual([...nb].sort());
});

it("a region you cannot reach says so rather than offering a button that fails", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  expect(travelHtml(state, world, cal)).not.toContain("undefined");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/travel-ui.test.ts`
Expected: FAIL - `travelHtml` does not exist.

- [ ] **Step 3: Write `travelHtml`**

Lifted from `regionHtml`'s deleted `travel` block, one entry per
neighbour, each with its duration or the reason it is shut.

- [ ] **Step 4: Mount, style and render**

`<div id="maptravel"></div>` inside `#map`, positioned absolute in a
corner; `setPanel("maptravel", travelHtml(state, world, cal))`; add
`maptravel: 5` to the churn budget.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/map.ts 08-survidle/index.html 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/travel-ui.test.ts 08-survidle/tests/churn.test.ts
git commit -m "feat(survidle): travel is a corner of the map, neighbours only"
```

---

## Phase 4 - now and ahead

### Task 11: Doing moves to the middle, and eating moves with it

**Files:**
- Modify: `08-survidle/src/ui/panels.ts` (`taskHtml` splits into
  `doingHtml` and `ordersHtml`)
- Modify: `08-survidle/src/main.ts`
- Modify: `08-survidle/tests/churn.test.ts`
- Modify: `08-survidle/tests/ui.test.ts`

**Interfaces:**
- Produces:
  - `export function doingHtml(state, world, cal): string` - the live work,
    its bar, the next step, the stop button, and `instantHtml`
  - `export function ordersHtml(state, world, cal): string` - **exported
    now**, the queue alone, for `#orders`
- `taskHtml` ceases to exist.

- [ ] **Step 1: Write the failing test**

```ts
it("Doing names the step after this one, so a filling bar never lies", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  startTask(state, world, cal, "deadwood", undefined, false, new Rng(state.rng));
  // One order runs several steps - walk, work, walk back - so a bar
  // finishing does not mean the order is done.
  expect(doingHtml(state, world, cal)).toMatch(/then/i);
});

it("eating is not behind a tab", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  // Left in the Do pane it would vanish the moment a player opened Log,
  // which is a regression on a control that answers a body's need.
  expect(doingHtml(state, world, cal)).toContain('data-act="eat"');
});

it("the queue is on its own, for its own column", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  expect(ordersHtml(state, world, cal)).not.toContain('data-act="eat"');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/ui.test.ts -t "Doing"`
Expected: FAIL - `doingHtml` does not exist.

- [ ] **Step 3: Split `taskHtml`**

`doingHtml` keeps the head, the task bar, the hurry bar, the set-aside
list and `instantHtml`, and gains the next-step line read from the
intent's remaining steps. `ordersHtml` becomes exported and keeps the
ranked rows and their up/down/x buttons - **its behaviour is untouched;
the queue pass owns that.**

- [ ] **Step 4: Render both**

```ts
setPanel("task", doingHtml(state, world, cal));
setPanel("orders", ordersHtml(state, world, cal));
```

Budget: `task: MINUTE`, add `orders: MINUTE`.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/tests/ui.test.ts 08-survidle/tests/churn.test.ts
git commit -m "feat(survidle): Doing sits under the map, says what is next, and carries eating"
```

---

### Task 12: One horizon, the slider's

**Files:**
- Modify: `08-survidle/src/sim/forecast.ts` (`horizons`)
- Modify: `08-survidle/src/sim/forecaster.ts` if it enumerates horizon ids
- Modify: `08-survidle/src/ui/panels.ts` (`forecastHtml`)
- Modify: `08-survidle/index.html` (the away slider into `#forecast`)
- Modify: `08-survidle/tests/forecast.test.ts`, `08-survidle/tests/horizon.test.ts`,
  `08-survidle/tests/dial.test.ts`

**Interfaces:**
- Produces: `horizons(state)` returns **one** row, id `away`. `HorizonId`
  narrows to `"away"`.

- [ ] **Step 1: Write the failing test**

```ts
it("there is one horizon and the slider is it", () => {
  const { state } = newGame(21);
  state.awayHours = 8;
  const h = horizons(state);
  expect(h.length).toBe(1);
  // One real second is one game minute, so eight hours away is twenty game
  // days - further than the month row it replaces.
  expect(h[0].minutes).toBe(8 * 3600);
});

it("the panel says leaving, not working", () => {
  const { state } = newGame(21);
  state.awayHours = 8;
  // He read "away up to 24 hours" as how long the survivor works.
  const html = forecastHtml(emptyView(), state);
  expect(html).toMatch(/if you leave/i);
  expect(html).not.toMatch(/away up to/i);
});

it("the days the hours buy are named, since that is the number that matters", () => {
  const { state } = newGame(21);
  state.awayHours = 8;
  expect(forecastHtml(emptyView(), state)).toContain("20 days");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/forecast.test.ts`
Expected: FAIL - four horizons, old wording.

- [ ] **Step 3: Cut `horizons` to one, reword `forecastHtml`**

```ts
/**
 * One horizon: the stretch the slider names. A real second is a game
 * minute, so the dial's 1 to 24 hours spans two and a half to sixty game
 * days, and the fixed tonight, week and month rows it replaces all sit
 * inside it.
 */
export function horizons(state: GameState): Horizon[] {
  return [{ id: "away", minutes: state.awayHours * 3600 * GAME_MINUTES_PER_REAL_SECOND }];
}
```

`forecastHtml` renders the slider and the row as one sentence: `If you
leave for <slider> h (N days) - <forecastRowText>`.

- [ ] **Step 4: Move the slider markup into `#forecast`**

Delete `<div id="away">`; `forecastHtml` emits the range input with the
same `data-away="hours"` attribute so `main.ts`'s existing `input`
listener keeps working. Move the `how to survive` and `settings` buttons
to the clock strip in the middle - they are controls and the left column
is read-only but for the slider.

- [ ] **Step 5: Run everything**

Run: `cd 08-survidle && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/forecast.ts 08-survidle/src/sim/forecaster.ts 08-survidle/src/ui/panels.ts 08-survidle/index.html 08-survidle/tests/forecast.test.ts 08-survidle/tests/horizon.test.ts 08-survidle/tests/dial.test.ts
git commit -m "feat(survidle): one horizon, the slider's, and it says leaving rather than working"
```

---

## Phase 5 - the cheap tier

### Task 13: Events, not only state

**Files:**
- Modify: `08-survidle/src/sim/body.ts` or wherever auto-eat fires
- Modify: `08-survidle/src/sim/fire.ts`
- Modify: `08-survidle/tests/events.test.ts`

**Interfaces:** none new. Log lines only.

- [ ] **Step 1: Write the failing test**

```ts
it("the body eating is an event, not a setting you could have read", () => {
  const { state, world } = newGame(21);
  // auto-eat: on was legible on screen the whole time he spent four notes
  // unable to tell whether his survivor was eating.
  state.player.kcal = 0;
  addItem(pile(state, cellOf(state, world)), "driedMeat", 1);
  advance(state, world, 10);
  expect(state.log.some((l) => /ate|eats/i.test(l.text))).toBe(true);
});

it("a fire going out says so", () => {
  const { state, world } = newGame(21);
  const st = state.regions[state.player.region];
  st.structures.firePit = true;
  st.fire.lit = true;
  st.fire.fuel = [];
  advance(state, world, 60);
  expect(state.log.some((l) => /fire.*(out|died|cold)/i.test(l.text))).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/events.test.ts`
Expected: FAIL - neither writes a line.

- [ ] **Step 3: Write the two lines**

One line when the body eats, naming what and how much. One when the fire
goes out. Both through the existing log path, not a new mechanism.

- [ ] **Step 4: Run everything, then commit**

Run: `cd 08-survidle && npm test && npm run build`

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/src/sim/fire.ts 08-survidle/tests/events.test.ts
git commit -m "feat(survidle): the body eating and the fire dying are events, not silences"
```

---

### Task 14: A blocked row names its cause

**Files:**
- Modify: `08-survidle/src/ui/panels.ts` (`ordersHtml`'s second line)
- Modify: `08-survidle/tests/orders.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

```ts
it("a waiting order says what it waits for", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  addOrder(state, { task: "berries", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  const html = ordersHtml(state, world, cal);
  // Cordage already says "waiting until first light", so the machinery
  // exists; it is applied to one row and not the rest.
  const row = html.slice(html.indexOf("1."));
  expect(row).not.toMatch(/>waiting</);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts`
Expected: FAIL - the row prints the bare word.

- [ ] **Step 3: Name the cause**

Replace the bare `waiting` with the reason the order is not running,
taken from the same check that produced "waiting until first light". No
queue behaviour changes - only what the row prints.

- [ ] **Step 4: Run everything, then commit**

```bash
git add 08-survidle/src/ui/panels.ts 08-survidle/tests/orders.test.ts
git commit -m "fix(survidle): every waiting order says what it is waiting for"
```

---

### Task 15: The words

Seven small fixes in one task - each is a line, and splitting them would
buy seven review cycles for no reviewer benefit.

**Files:**
- Modify: `08-survidle/src/world/gen.ts` or wherever region names live
  (Norwegian characters)
- Modify: `08-survidle/src/sim/items.ts` ("missing N stone")
- Modify: `08-survidle/src/sim/orders.ts` ("Make snare")
- Modify: `08-survidle/src/sim/tasks.ts:490` (the Dig roots line)
- Modify: `08-survidle/src/ui/panels.ts` (log order, landing kit, the
  reroll button, per-item pack weights)
- Modify: `08-survidle/tests/names.test.ts`, `08-survidle/tests/list.test.ts`,
  `08-survidle/tests/landing.test.ts`, `08-survidle/tests/inventory.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("the names are Norwegian", () => {
  // A plain a where an aa belongs is pronounced wrong by a native speaker.
  const { world } = newGame(21);
  const names = world.regions.map((r) => r.name).join(" ");
  expect(names).toMatch(/[åøæÅØÆ]/);
});

it("missing means missing", () => {
  // "missing 2 stone" while holding 4 stone: the number was the recipe total.
  const { state, world } = newGame(21);
  addItem(pile(state, cellOf(state, world)), "stone", 4);
  const line = needLine(state, world, "build", "firePit");
  expect(line).not.toMatch(/missing 4/);
});

it("a queued snare is an act, not a thing", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  addOrder(state, { task: "craft", arg: "snare", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  expect(ordersHtml(state, world, cal)).toContain("Make snare");
});

it("the log reads oldest first", () => {
  const { state, world } = newGame(21);
  advance(state, world, 600);
  const html = logHtml(state);
  const first = state.log[0].text;
  const last = state.log[state.log.length - 1].text;
  expect(html.indexOf(first)).toBeLessThan(html.indexOf(last));
});

it("the landing says what you came with", () => {
  const { state, world } = newGame(21);
  expect(landingHtml(state, world)).toMatch(/axe/i);
});

it("the reroll button says it rerolls", () => {
  const { state, world } = newGame(21);
  // The only explanation was a title tooltip, and he went a whole run
  // without finding it.
  const html = landingHtml(state, world);
  const btn = html.slice(html.indexOf("next boat"));
  expect(btn.slice(0, btn.indexOf("</button>"))).toMatch(/three|new|other|reroll/i);
});

it("the pack says what each thing weighs", () => {
  const { state, world } = newGame(21);
  addItem(state.player.pack, "firewood", 5);
  // A total with no breakdown cannot be reasoned about.
  expect(inventoryHtml(state, world)).toMatch(/firewood[^<]*<[^>]*>[^<]*kg/);
});

it("Dig roots says one thing per clause", () => {
  // Three unrelated jobs in one semicolon chain produced three misreadings,
  // including his not knowing roots were food.
  const { state, world } = newGame(21);
  const cal = calendar(state.minute, state.startDoy);
  const o = intentOption(state, world, cal, "roots", undefined, "nearest");
  expect((o.detail ?? "").split(";").length).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd 08-survidle && npm test`
Expected: FAIL on each.

- [ ] **Step 3: Make each pass**

Note the Norwegian test writes the characters as escapes so this plan
stays ASCII; the source files carry the real characters, which is the
point of the fix. Check `src/style.css`'s font stack renders them.

- [ ] **Step 4: Run everything, then commit**

```bash
git add 08-survidle/src 08-survidle/tests
git commit -m "fix(survidle): the words - Norwegian names, missing means missing, and six more"
```

---

## Phase 6 - closing

### Task 16: The rules, written down

**Files:**
- Modify: `08-survidle/docs/ux.md`
- Modify: `08-survidle/docs/README.md` if it describes the old layout

- [ ] **Step 1: Rewrite `docs/ux.md`**

Delete "A list past a dozen rows has a fold and a filter" - the purpose
split replaces the fold. Add, from spec section 12: the three-column
rule, the tooltip's visual and touch checks, and the four
nothing-is-taken-away checks.

- [ ] **Step 2: Commit**

```bash
git add 08-survidle/docs/ux.md 08-survidle/docs/README.md
git commit -m "docs(survidle): the UI rules a browser pass now checks"
```

---

### Task 17: The browser pass

Not a test. Judgement, at two widths, and the record says both.

**Files:**
- Modify: `08-survidle/docs/playtest-2026-09-07.md` (Appendix A statuses
  gain commit hashes)

- [ ] **Step 1: Run the dev server**

```bash
cd 08-survidle && npm run dev
```
The page is at `http://127.0.0.1:5173/prototypes/08/`, not at `/`.

- [ ] **Step 2: Check at 1440 by 900**

- Nothing off screen; the check-in above the fold.
- Sweeping the pointer across the map does not flicker the tooltip, and
  the tooltip never lingers on a cell the pointer has left.
- Scroll the item pane, let the game run a minute: the scroll holds.
- Switch to Log and back: same subtab, same purpose, same scroll.
- Type in the filter: the caret is never lost.
- Press the mouse down on a row and release on it: still a click.
- The tooltip is legible over every terrain colour, day and night.

- [ ] **Step 3: Check at 390 wide with touch emulation**

In the DevTools browser, `emulate` with `390x844x3,mobile,touch` - a
desktop window resized to 390 never trips `(hover: none)` and would pass
a check that never ran.

- Tap a map cell: the tooltip opens, its buttons are thumb-reachable, its
  close dismisses it without walking anywhere.
- The purpose strip and the subtabs are reachable and hittable.

- [ ] **Step 4: Stop the server, record the pass**

Write the result into Appendix A of the playtest report - which findings
are now closed, and the commit that closed each. Name **both widths** in
the record; a pass that ran one width has not checked this page.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/docs/playtest-2026-09-07.md
git commit -m "docs(survidle): the browser pass, at 1440 by 900 and at 390 with touch"
```

---

## Self-review notes

Checked against the spec, section by section:

- Section 2 (hierarchy) - Task 3, guarded by `layout.test.ts`.
- Section 4 (tabs, HERE dies) - Tasks 3, 4, 8.
- Section 5 (subtabs, split, purposes, row, instant, advanced) - Tasks 2,
  6, 7, 11.
- Section 6 (map) - Tasks 9, 10.
- Section 7 (Doing, forecast) - Tasks 11, 12.
- Section 8 (Camp box) - Task 8.
- Section 9 (cheap tier, ten items) - Tasks 13, 14, 15.
- Section 10 (out of scope) - no task, by design. **Nothing in this plan
  touches queue ordering, cancellation or blocking semantics.** Task 14
  changes what an order row prints and nothing else.
- Section 11 (identity, scroll, churn) - Tasks 1, 5, 6, 9, and the four
  browser checks in Task 17.
- Section 12 (browser pass rules) - Tasks 16, 17.
- Section 13 (traceability) - Task 17 step 4.

Two things a reviewer should watch:

1. **Task 9 is the risky one.** If the pointer sweep in step 8 fails, the
   tooltip has leaked into the map's markup or its key, and the fix is to
   take it out - not to raise the budget.
2. **Task 6 deletes the fold machinery.** `docs/ux.md` asserts folds
   exist; Task 16 is what makes the docs agree, and it must not be
   skipped.
