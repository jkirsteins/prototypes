# Survidle Terrain Colour, Firelight and Torch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every terrain tile carries its colour as a dark background; at night a lit camp fire or a carried torch glows on the map with a CSS flicker; the torch is a crafted, consumable light with two real effects.

**Architecture:** Section 1 is CSS plus a stylesheet test. Section 2 moves the night darkening from a grid-wide filter to a `shade` layer so lit cells can sit above it, and adds a small pure function in `map.ts` that turns light sources into ring classes. Section 3 adds the torch through the existing item, recipe, task, player-step and skills tables; the map then reads the torch as a second light source.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom (already configured). No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-light-and-colour-design.md`. Read it first; every colour and number below comes from it.

## Global Constraints

- Terrain backgrounds exactly: spruce `#0b1f11`, pine `#0e2415`, birch `#1a2a12`, meadow `#171f0f`, bog `#0b221f`, rock `#1a1c20`, fell `#22252b`; water keeps `#0a1633`. Glyph colours unchanged. Snow keeps its uniform `#121a26` on non-water cells.
- Highlights `.cur`, `.sel`, `.rt` become inset box-shadows of the same colour and alpha; none of the three sets a `background`.
- Night darkening is a `shade` child of the grid with `opacity: calc(1 - var(--bright))`; `filter: brightness()` is gone from `.grid`; `saturate(var(--sat))` stays; the `::after` tint stays.
- Light sources: a visited region's lit fire at its camp cell, reach 2 if `fuelKg >= FIRE_LOW_KG` (3), else 1; a lit torch at the player's cell, reach 1. Rings by Chebyshev distance, ring 2 minus its four corners. Nearer ring wins. Only while `cal.isNight`. Zoom 1 cell per glyph: rings 0..2; 3 cells: ring 0 only; coarser: none (the `F` marker pulses instead).
- Classes `lit-0`, `lit-1`, `lit-2`; every lit cell has an inline `--fd` negative delay from a hash of its index. Fog cells are never lit.
- Colours: `lit-0` flame `#ff7a1a` to `#ffb84d`; `lit-1` overlay `rgba(255,140,40)` alpha 0.35 to 0.55 with glyph `#ffd9a0`; `lit-2` overlay `rgba(255,120,30)` alpha 0.12 to 0.22. One keyframe `flicker`, 1.1 s, alternate, ease-in-out, infinite.
- Torch: count item, 0.4 kg, "torches". Recipe 1 stick, 2 bark, 20 min, no tool. `TORCH_BURN_MINUTES = 60`. Light at a lit camp fire in 1 min, or with the fire drill in 10 min (drill wears 1); refusals: "needs a torch", "a torch is already burning", "needs a fire or a fire drill". Log "The torch catches." on lighting and "The torch gutters out." when done. Trains Building under `lightTorch`.
- Effects: no night walking penalty while lit; the hourly wolf roll skips a player with a lit torch or beside their own lit camp fire. Nothing else.
- Every quantity in the sim is real; UI text shows minutes and hours.
- All work is in `08-survidle/`. Run `npx vitest run`, `npx tsc --noEmit` (`noUnusedLocals`/`noUnusedParameters` on) and `npm run build` there, and `npm run lint` from the repository root, before every commit. Stage with explicit paths, never `git add -A`.
- Writing style: no em dashes, no unicode arrows or fancy quotes, in code, comments, docs and log lines. Comments explain, they never chronicle.

---

## File map

| file | responsibility |
|------|----------------|
| `src/style.css` | terrain backgrounds, highlight box-shadows, the `shade` layer, `lit-*` rules and `flicker` |
| `src/ui/map.ts` | `lightSources`, `litRings`, `flickerDelay`; `lit-` classes and `--fd` in `mapHtml`; the `shade` child; map key additions |
| `src/sim/types.ts` | `torch` in `CountItem` and `RecipeId`; `lightTorch` in `TaskId`; `Player.torch` |
| `src/sim/items.ts` | torch weight, name, recipe, `TORCH_BURN_MINUTES` |
| `src/sim/newgame.ts`, `src/sim/save.ts` | the unlit torch on a fresh run and on load |
| `src/sim/skills.ts` | `lightTorch` in `MASTERY_KEYS.building`, `skillOf`, `masteryKey` |
| `src/sim/tasks.ts` | `lightTorch` in `check`, `complete`, `CARRIED`, `WORK_TASKS`, `availableTasks` |
| `src/sim/player.ts` | `firelit`, the burn in `stepPlayer`, the night rule in `baseWalkSpeed`, `lightTorch` as a rest activity and camp task |
| `src/sim/events.ts` | the wolf skip |
| `src/ui/panels.ts` | the torch tag in `statsHtml` |
| `tests/light.test.ts` (new) | stylesheet rules, the shade, the rings |
| `tests/torch.test.ts` (new) | recipe, lighting, burning, effects, save |
| `tests/ui.test.ts` | the `lightTorch` button in the reachability list |
| `docs/README.md` | the torch under Camp; the colours under the map |

---

### Task 1: Terrain backgrounds and highlight overlays

**Files:**
- Modify: `src/style.css` (the `.grid .c.t-*` rules, `.grid .c.rt`, `.grid .c.cur`, `.grid .c.sel`)
- Create: `tests/light.test.ts`

**Interfaces:**
- Produces: nothing in code; the stylesheet test helper `rule(selector)` used by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/light.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

/** The declaration block of the first rule whose selector list is exactly `selector`. */
export function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe("terrain colour", () => {
  const backgrounds: Record<string, string> = {
    water: "#0a1633", spruce: "#0b1f11", pine: "#0e2415", birch: "#1a2a12",
    meadow: "#171f0f", bog: "#0b221f", rock: "#1a1c20", fell: "#22252b",
  };

  it("every terrain glyph sits on a dark background of its own hue", () => {
    for (const [t, bg] of Object.entries(backgrounds)) {
      expect(rule(`.grid .c.t-${t}`)).toContain(`background: ${bg}`);
    }
  });

  it("the region and route highlights are overlays, not backgrounds", () => {
    for (const sel of [".grid .c.cur", ".grid .c.sel", ".grid .c.rt"]) {
      const body = rule(sel);
      expect(body).toContain("box-shadow: inset 0 0 0 20px");
      expect(body).not.toContain("background");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/light.test.ts`
Expected: FAIL, the spruce rule has no `background`, and `.grid .c.rt` contains `background`.

- [ ] **Step 3: Change the stylesheet**

In `src/style.css` replace the eight terrain colour rules with:

```css
.grid .c.t-water { color: #3a6fd8; background: #0a1633; }
.grid .c.t-spruce { color: #1f8f3a; background: #0b1f11; }
.grid .c.t-pine { color: #3fbf5a; background: #0e2415; }
.grid .c.t-birch { color: #9be36a; background: #1a2a12; }
.grid .c.t-meadow { color: #6f9a3c; background: #171f0f; }
.grid .c.t-bog { color: #2f9f8f; background: #0b221f; }
.grid .c.t-rock { color: #7a7f88; background: #1a1c20; }
.grid .c.t-fell { color: #b9bec8; background: #22252b; }
```

Replace the three highlight rules, keeping their positions in the file (the route rule sits near the fog rules, the region rules after the border rules) so the cascade order stays `rt`, then `cur`, then `sel`:

```css
.grid .c.rt { box-shadow: inset 0 0 0 20px rgba(230, 194, 41, 0.22); }
```

```css
.grid .c.cur { box-shadow: inset 0 0 0 20px rgba(255, 255, 255, 0.07); }
```

```css
.grid .c.sel { box-shadow: inset 0 0 0 20px rgba(230, 194, 41, 0.18); }
```

The snow rule `.grid.snow .c:not(.t-water) { background: #121a26; }` stays and still wins over the terrain backgrounds by specificity.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/light.test.ts && npx vitest run`
Expected: PASS; the whole suite still passes.

- [ ] **Step 5: Look at it**

Run `npm run dev` from `08-survidle` (read the port from its output), open `?seed=7`, and check the map reads as coloured ground with the current region still outlined and highlighted. Stop the server. If a colour looks wrong, note it in the report; do not retune without saying so.

- [ ] **Step 6: Commit**

```bash
git add src/style.css tests/light.test.ts
git commit -m "feat(survidle): every terrain tile carries its colour as a dark background"
```

---

### Task 2: The shade layer

**Files:**
- Modify: `src/style.css` (the `.grid` rule; a new `.grid .shade` rule)
- Modify: `src/ui/map.ts` (`mapHtml`, the closing of the grid)
- Test: `tests/light.test.ts`

**Interfaces:**
- Produces: the grid's last child `<i class="shade"></i>`; `.grid` no longer declares `brightness(`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/light.test.ts` (add imports `calendar` from `../src/sim/calendar`, `newGame` from `../src/sim/newgame`, `mapHtml` from `../src/ui/map`, `newUiState, setPanel, resetPanels` from `../src/ui/render`, `updateSky` from `../src/ui/sky`, and `beforeEach` from vitest):

```ts
describe("night shade", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
  });

  it("the grid darkens through a shade layer, not a brightness filter", () => {
    expect(rule(".grid")).not.toContain("brightness(");
    expect(rule(".grid")).toContain("saturate(var(--sat))");
    expect(rule(".grid .shade")).toContain("opacity: calc(1 - var(--bright))");
  });

  it("the map carries one shade element and the sky still sets its brightness", () => {
    const { state, world } = newGame(21);
    const night = calendar(16 * 60);
    setPanel("map", mapHtml(world, state, newUiState(), night));
    expect(document.querySelectorAll("#map .grid .shade").length).toBe(1);
    updateSky(state, night, -5);
    expect(document.querySelector<HTMLElement>("#map .grid")!.style.getPropertyValue("--bright")).toBe("0.550");
  });
});
```

`updateSky` also positions the sun and moon; with no sky markup in the DOM its `setAttr` calls find nothing and do nothing, so the map is enough here.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/light.test.ts`
Expected: FAIL, `.grid` contains `brightness(` and there is no `.shade` rule or element.

- [ ] **Step 3: Change the grid**

In `src/style.css`, in the `.grid` rule, change `filter: brightness(var(--bright)) saturate(var(--sat));` to `filter: saturate(var(--sat));`. Directly after the `.grid` rule add:

```css
/* Night: a black sheet over the ground whose opacity is the sky's darkness. Lit cells rise above it. */
.grid .shade {
  position: absolute; inset: 0; pointer-events: none;
  background: #000;
  opacity: calc(1 - var(--bright));
  transition: opacity 0.5s linear;
}
```

In `src/ui/map.ts`, in `mapHtml`, change `parts.push("</div>");` after the cell loop to:

```ts
  parts.push(`<i class="shade"></i></div>`);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. The existing map test counting `#map .c` spans still passes because the shade is an `<i>`, not a `.c`.

- [ ] **Step 5: Look at it**

Dev server, `?seed=7`, then in the console `survidle.advance(600)` to reach night. The map should look as dark as before. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/style.css src/ui/map.ts tests/light.test.ts
git commit -m "feat(survidle): night darkens the map through a shade the firelight can rise above"
```

---

### Task 3: Firelight from the camp fire

**Files:**
- Modify: `src/ui/map.ts` (new `lightSources`, `litRings`, `flickerDelay`; `mapHtml`; `mapKey`)
- Modify: `src/style.css` (the `lit-*` rules, `flicker`, the distant fire pulse)
- Test: `tests/light.test.ts`

**Interfaces:**
- Produces: `lightSources(state, world): { cell: number; reach: number }[]`, `litRings(sources, toGlyph, z): Map<number, number>`, `flickerDelay(i): string`. Task 7 adds the torch to `lightSources`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/light.test.ts` (add imports `regionState` from `../src/sim/regionstate`, `placeAtSpot` from `../src/sim/position`, `mapKey` from `../src/ui/map`):

```ts
describe("firelight", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
  });
  const night = calendar(16 * 60);
  const day = calendar(4 * 60);
  const lit = (cls: string) => document.querySelectorAll(`#map .c.${cls}`).length;
  const draw = (state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], cal = night, zoom = 0) =>
    setPanel("map", mapHtml(world, state, { ...newUiState(), zoom }, cal));

  it("a full fire lights the camp glyph and two rings around it, corners cut", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    draw(state, world);
    expect(lit("lit-0")).toBe(1);
    expect(lit("lit-1")).toBe(8);
    expect(lit("lit-2")).toBe(12);
    expect(document.querySelector("#map .c.lit-0.mk-player")).not.toBeNull();
    expect(document.querySelectorAll("#map .c[style*='--fd:-']").length).toBe(21);
  });

  it("a low fire lights one ring; a cold fire none; daylight none", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 2;
    draw(state, world);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(9);
    draw(state, world, day);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(0);
    expect(document.querySelector("#map .grid.night")).toBeNull();
    st.fire.lit = false;
    draw(state, world);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(0);
  });

  it("at three cells per glyph only the source glyph glows", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    draw(state, world, night, 1);
    expect(lit("lit-0")).toBe(1);
    expect(lit("lit-1") + lit("lit-2")).toBe(0);
  });

  it("your fire glows from the forest too, and the key changes when it burns low", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    placeAtSpot(state, world, state.player.region, "forest");
    const k1 = mapKey(state, world, newUiState(), night);
    draw(state, world);
    expect(document.querySelector("#map .c.lit-0.mk-fire")).not.toBeNull();
    st.fire.fuelKg = 2;
    expect(mapKey(state, world, newUiState(), night)).not.toBe(k1);
  });

  it("the flicker rules and the delay are what the stylesheet expects", () => {
    expect(rule(".grid.night .c.lit-0")).toContain("animation: flicker");
    expect(rule(".grid .c.lit-1::after, .grid .c.lit-2::after")).toContain("z-index: 2");
    expect(css).toContain("@keyframes flicker");
    expect(rule(".grid.night .c.mk-fire")).toContain("animation: flicker");
  });
});
```

The forest test assumes seed 21's forest spot lies within two glyphs of the viewport edge of the camp, which it does at 72 by 36 glyphs; the camp is at the view's centre and the forest is under 1 km away.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/light.test.ts`
Expected: FAIL, no `lit-` classes are rendered.

- [ ] **Step 3: Light sources and rings in `src/ui/map.ts`**

Add `import { FIRE_LOW_KG } from "../sim/items";` and, after `blockInfo`:

```ts
export interface LightSource { cell: number; reach: number }

/** Where light is on the map tonight: every visited camp's lit fire, two rings when it is well fed, one when low. */
export function lightSources(state: GameState, world: World): LightSource[] {
  const out: LightSource[] = [];
  for (const [idText, st] of Object.entries(state.regions)) {
    if (!st.fire.lit || discovery(state, Number(idText)) !== VISITED) continue;
    out.push({ cell: st.campCell, reach: st.fire.fuelKg >= FIRE_LOW_KG ? 2 : 1 });
  }
  void world;
  return out;
}

/**
 * Ring per lit glyph: 0 is the source, 1 and 2 the squares around it with
 * ring 2's corners cut so the glow is round. A glyph reached twice takes
 * the nearer ring. Rings shrink with zoom: whole at one cell per glyph,
 * the source alone at three, nothing beyond.
 */
export function litRings(sources: LightSource[], toGlyph: (cell: number) => number, z: number): Map<number, number> {
  const rings = new Map<number, number>();
  const reachAt = z === 1 ? 2 : z === 3 ? 0 : -1;
  if (reachAt < 0) return rings;
  for (const s of sources) {
    const g = toGlyph(s.cell);
    if (g < 0) continue;
    const reach = Math.min(s.reach, reachAt);
    const gx = g % VIEW_W;
    const gy = Math.floor(g / VIEW_W);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d === 2 && Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) continue;
        const i = y * VIEW_W + x;
        const prev = rings.get(i);
        if (prev === undefined || d < prev) rings.set(i, d);
      }
    }
  }
  return rings;
}

/** A negative animation delay under 1.1 s, fixed per glyph index, so neighbouring flames are out of step. */
export function flickerDelay(i: number): string {
  return `-${(((i * 2654435761) >>> 0) % 1100) / 1000}s`;
}
```

The `void world;` line goes when Task 7 reads the player's cell. In `mapHtml`, after `pileGlyphs` is built:

```ts
  const rings = cal.isNight ? litRings(lightSources(state, world), toGlyph, z) : new Map<number, number>();
```

In the cell loop, declare `let style = "";` beside `let title = "";`, and inside the `else` branch (a seen cell), after the pile check:

```ts
      const ring = rings.get(i);
      if (ring !== undefined) {
        cls.push(`lit-${ring}`);
        style = ` style="--fd:${flickerDelay(i)}"`;
      }
```

Change the span to `parts.push(\`<span class="${cls.join(" ")}"${act}${style} title="${esc(title)}">...\`)`.

In `mapKey`, change the marks so a low fire reads differently: `${r.fire.lit ? (r.fire.fuelKg >= FIRE_LOW_KG ? "F" : "f") : ""}`.

- [ ] **Step 4: Style in `src/style.css`**

After the last marker rule (`.grid .c.mk-shelter`), so that these win the cascade over the terrain colours and the marker backgrounds, which share their specificity:

```css
/* Firelight. Lit cells rise above the shade and the tint; ring overlays paint over the ground's own colour. */
@keyframes flicker { from { background-color: var(--f0); } to { background-color: var(--f1); } }
.grid.night .c.mk-fire {
  --f0: #b8431a; --f1: #ff9a3a;
  animation: flicker 1.1s ease-in-out infinite alternate;
}
.grid.night .c.lit-0 {
  position: relative; z-index: 2;
  --f0: #ff7a1a; --f1: #ffb84d;
  animation: flicker 1.1s ease-in-out infinite alternate;
  animation-delay: var(--fd, 0s);
}
.grid .c.lit-1, .grid .c.lit-2 { position: relative; }
.grid .c.lit-1 { color: #ffd9a0; }
.grid .c.lit-1::after, .grid .c.lit-2::after {
  content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  animation: flicker 1.1s ease-in-out infinite alternate;
  animation-delay: var(--fd, 0s);
}
.grid .c.lit-1::after { --f0: rgba(255, 140, 40, 0.35); --f1: rgba(255, 140, 40, 0.55); }
.grid .c.lit-2::after { --f0: rgba(255, 120, 30, 0.12); --f1: rgba(255, 120, 30, 0.22); }
```

Order matters twice: `.grid.night .c.lit-0` comes after `.grid.night .c.mk-fire` so a fire's own cell flames rather than pulses, and `.grid .c.lit-1` comes after every `.grid .c.t-*` rule so the firelit glyph colour wins. The ring cells keep `z-index` auto so the cell itself stays under the shade; only its `::after` (z-index 2) rises above the shade and the tint, which is why ring 2 does not look like a square of daylight. `lit-` classes are only emitted at night, so the ring rules need no `.night` scope.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS. The `rule()` helper matches `.grid .c.lit-1::after, .grid .c.lit-2::after` as a selector list literally; keep that selector text exactly.

- [ ] **Step 6: Look at it**

Dev server, `?seed=7`. In the console: `const s = survidle.state; const r = s.regions[s.player.region]; r.structures.firePit = true; r.fire.lit = true; r.fire.fuelKg = 10; survidle.advance(600)`. At night the camp glyph should flame and two uneven rings glow. Zoom out once: only the `@` flames. Zoom out again: the `F` marker pulses. Walk to the forest (`Walk to the forest`) and look back at the camp. Stop the server. Report what you saw; if the rings look like a bright square rather than a glow, say so.

- [ ] **Step 7: Commit**

```bash
git add src/ui/map.ts src/style.css tests/light.test.ts
git commit -m "feat(survidle): a lit fire glows on the map at night, two rings when fed, one when low"
```

---

### Task 4: The torch as an item and a state

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/items.ts`, `src/sim/newgame.ts`, `src/sim/save.ts`
- Create: `tests/torch.test.ts`

**Interfaces:**
- Produces: `ItemId` `torch`; `RecipeId` `torch`; `Player.torch: { lit: boolean; minutes: number }`; `TORCH_BURN_MINUTES`. The `lightTorch` task id and its skill entries are Task 5's, so that `tsc` stays green at this commit (adding a `TaskId` without its `switch` cases breaks `checkFresh`).

- [ ] **Step 1: Write the failing tests**

Create `tests/torch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { ITEM_KG, RECIPES, TORCH_BURN_MINUTES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import { MASTERY_KEYS, masteryKey, skillOf } from "../src/sim/skills";
import { startTask, stepTask } from "../src/sim/tasks";

type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number) {
  const rng = new Rng(1);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("torch, the item", () => {
  it("is a 0.4 kg count item made from a stick and two bark in twenty minutes", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(ITEM_KG.torch).toBe(0.4);
    expect(RECIPES.torch).toEqual({ name: "torch", needs: [{ item: "stick", qty: 1 }, { item: "bark", qty: 2 }], minutes: 20, out: { item: "torch", qty: 1 } });
    addItem(state.player.pack, "stick", 1);
    addItem(state.player.pack, "bark", 2);
    expect(startTask(state, world, cal, "craft", "torch")).toBe(true);
    run(g, 60);
    expect(qty(state.player.pack, "torch")).toBe(1);
    expect(TORCH_BURN_MINUTES).toBe(60);
  });

  it("starts unlit, joins Crafting's mastery keys, and an old save loads with it unlit", () => {
    const { state } = newGame(3);
    expect(state.player.torch).toEqual({ lit: false, minutes: 0 });
    expect(MASTERY_KEYS.crafting).toContain("craft:torch");
    const raw = JSON.parse(serialize(state, 1));
    delete raw.state.player.torch;
    const file = deserialize(JSON.stringify(raw));
    expect(file!.state.player.torch).toEqual({ lit: false, minutes: 0 });
  });
});
```

The import line for skills is `import { MASTERY_KEYS } from "../src/sim/skills";` at this task; Task 5 widens it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/torch.test.ts`
Expected: FAIL, `TORCH_BURN_MINUTES` is not exported and `RECIPES.torch` is undefined.

- [ ] **Step 3: Types**

In `src/sim/types.ts`: add `| "torch"` to `CountItem`; add `| "torch"` to `RecipeId` after `"axe"`; in `Player`, after `tools: Tool[];`:

```ts
  /** A torch in hand: lit, and the minutes of burn left. */
  torch: { lit: boolean; minutes: number };
```

- [ ] **Step 4: Items**

In `src/sim/items.ts`: `ITEM_KG` gains `torch: 0.4`; `ITEM_NAMES` gains `torch: "torches"`; `RECIPES` gains, after `axe`:

```ts
  torch: { name: "torch", needs: [{ item: "stick", qty: 1 }, { item: "bark", qty: 2 }], minutes: 20, out: { item: "torch", qty: 1 } },
```

and after `SNARE_CATCH_MAX_AGE`:

```ts
/** Minutes a torch burns once lit; there is no putting it out. */
export const TORCH_BURN_MINUTES = 60;
```

- [ ] **Step 5: Fresh runs and saves**

`src/sim/newgame.ts`: in the player literal after `tools: [...]`, add `torch: { lit: false, minutes: 0 },`.

`src/sim/save.ts`, in `fillDefaults`, before the region loop: `state.player.torch ??= { lit: false, minutes: 0 };`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. `tsc` points at every `Record<ItemId, ...>` missing `torch` until `ITEM_KG` and `ITEM_NAMES` have it. The reachability test in `tests/ui.test.ts` ("every recipe") passes by itself because it iterates `RECIPE_IDS`, and `craft:torch` joins `MASTERY_KEYS.crafting` the same way.

- [ ] **Step 7: Commit**

```bash
git add src/sim/types.ts src/sim/items.ts src/sim/newgame.ts src/sim/save.ts tests/torch.test.ts
git commit -m "feat(survidle): a torch is a stick and two bark, carried unlit"
```

---

### Task 5: Lighting and burning a torch

**Files:**
- Modify: `src/sim/types.ts` (`TaskId`)
- Modify: `src/sim/skills.ts` (`MASTERY_KEYS.building`, `skillOf`, `masteryKey`)
- Modify: `src/sim/tasks.ts` (`CARRIED`, `WORK_TASKS`, `checkFresh`, `availableTasks`, `complete`)
- Modify: `src/sim/player.ts` (`CAMP_TASKS`, `activityOf`, `stepPlayer`)
- Modify: `src/ui/panels.ts` (`statsHtml`)
- Modify: `tests/ui.test.ts` (the camp task list)
- Test: `tests/torch.test.ts`

**Interfaces:**
- Consumes: Task 4's `Player.torch` and `TORCH_BURN_MINUTES`.
- Produces: `TaskId` `lightTorch`; the task in `check`/`complete`; `lightTorch` in `MASTERY_KEYS.building`, `skillOf` and `masteryKey`; `player.torch` set on completion; the burn in `stepPlayer`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/torch.test.ts` (add imports `check` from `../src/sim/tasks`, `stepPlayer` from `../src/sim/player`, `regionState` from `../src/sim/regionstate`, `placeAtSpot` from `../src/sim/position`, `tool` from `../src/sim/inventory`, `statsHtml` from `../src/ui/panels`, `newUiState` from `../src/ui/render`, and widen the skills import to `MASTERY_KEYS, masteryKey, skillOf`):

```ts
describe("lighting a torch", () => {
  it("is Building's work under its own mastery key", () => {
    const { state, world } = newGame(3);
    expect(MASTERY_KEYS.building).toContain("lightTorch");
    expect(skillOf("lightTorch")).toBe("building");
    expect(masteryKey(state, world, "lightTorch")).toBe("lightTorch");
  });

  it("takes a minute at a lit fire, ten with the drill, and is refused without either", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    expect(check(state, world, cal, "lightTorch").why).toBe("needs a torch");
    addItem(state.player.pack, "torch", 2);
    expect(check(state, world, cal, "lightTorch").why).toBe("needs a fire or a fire drill");
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    const atFire = check(state, world, cal, "lightTorch");
    expect(atFire.ok).toBe(true);
    expect(atFire.duration).toBe(1);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, cal, "lightTorch").why).toBe("needs a fire or a fire drill");
    state.player.tools.push({ id: "fireDrill", durability: 50 });
    const withDrill = check(state, world, cal, "lightTorch");
    expect(withDrill.ok).toBe(true);
    expect(withDrill.duration).toBe(10);
    state.player.torch = { lit: true, minutes: 30 };
    expect(check(state, world, cal, "lightTorch").why).toBe("a torch is already burning");
  });

  it("consumes the torch, wears the drill away from the fire, and burns for an hour", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "torch", 1);
    state.player.tools.push({ id: "fireDrill", durability: 50 });
    expect(startTask(state, world, cal, "lightTorch")).toBe(true);
    run(g, 40);
    expect(state.task).toBeNull();
    expect(qty(state.player.pack, "torch")).toBe(0);
    expect(tool(state.player, "fireDrill")!.durability).toBe(49);
    expect(state.player.torch).toEqual({ lit: true, minutes: TORCH_BURN_MINUTES });
    expect(state.log.some((e) => e.text === "The torch catches.")).toBe(true);
    for (let m = 0; m < 59; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.torch).toEqual({ lit: true, minutes: 1 });
    for (let m = 0; m < 5; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.torch).toEqual({ lit: false, minutes: 0 });
    expect(state.log.filter((e) => e.text === "The torch gutters out.")).toHaveLength(1);
  });

  it("lit from the fire, the drill is spared", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    addItem(state.player.pack, "torch", 1);
    state.player.tools.push({ id: "fireDrill", durability: 50 });
    startTask(state, world, cal, "lightTorch");
    run(g, 5);
    expect(tool(state.player, "fireDrill")!.durability).toBe(50);
    expect(state.player.torch.lit).toBe(true);
  });

  it("shows as a tag while it burns", () => {
    const { state, world } = newGame(3);
    const html = () => statsHtml(state, world, cal, 5, newUiState());
    expect(html()).not.toContain("torch lit");
    state.player.torch = { lit: true, minutes: 42 };
    expect(html()).toContain("torch lit, 42 min");
  });
});
```

In `tests/ui.test.ts`, in "every gather, camp and move task", add `"lightTorch"` to the id list after `"light"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/torch.test.ts tests/ui.test.ts`
Expected: FAIL, `check` for `lightTorch` throws or returns no `why`, and the reachability list lacks the button.

- [ ] **Step 3: The task id, its skill, and the task in `src/sim/tasks.ts`**

In `src/sim/types.ts` add `| "lightTorch"` to `TaskId` after `"light"`. In `src/sim/skills.ts`: in `MASTERY_KEYS.building` add `"lightTorch"` after `"light"`; in `skillOf` add `case "lightTorch":` beside `case "light":`; in `masteryKey` add `case "lightTorch":` to the group that returns `id`. `tsc` now points at every `switch` over `TaskId` that lacks the new case; the rest of this task supplies them.

In `src/sim/tasks.ts` add `"lightTorch"` to `CARRIED` and to `WORK_TASKS`. Import `TORCH_BURN_MINUTES` from `./items`. In `checkFresh`, after the `light` case:

```ts
    case "lightTorch": {
      const o = opt({ group: "camp", label: "Light a torch", detail: "burns 1 h; no night penalty on foot, and wolves keep off", duration: 1 });
      if (p.torch.lit) return { ...o, ok: false, why: "a torch is already burning" };
      if (totalQty(invs, "torch") < 1) return { ...o, ok: false, why: "needs a torch" };
      if (camp && st.fire.lit) return { ...o, detail: `${o.detail}; lit from the fire` };
      if (hasTool(p, "fireDrill")) return { ...o, duration: 10, detail: `${o.detail}; with the fire drill` };
      return { ...o, ok: false, why: "needs a fire or a fire drill" };
    }
```

In `availableTasks`, after `out.push(check(state, world, cal, "light"));` add `out.push(check(state, world, cal, "lightTorch"));`.

In `complete`, after the `light` case:

```ts
    case "lightTorch": {
      consume(invs, [{ item: "torch", qty: 1 }]);
      if (!(atCamp(state, world) && st.fire.lit)) wearTool(p, "fireDrill", wearFactor(state, world, "lightTorch"));
      p.torch = { lit: true, minutes: TORCH_BURN_MINUTES };
      log(state, "The torch catches.", "good");
      return;
    }
```

- [ ] **Step 4: The body in `src/sim/player.ts`**

Add `"lightTorch"` to `CAMP_TASKS`. In `activityOf`, add `case "lightTorch":` to the group returning `"rest"`. In `stepPlayer`, after the statuses tick down (`if (p.injured > 0) ...`):

```ts
  // A torch burns whatever you do, and there is no saving the stub.
  if (p.torch.lit) {
    p.torch.minutes = Math.max(0, p.torch.minutes - dt);
    if (p.torch.minutes === 0) {
      p.torch.lit = false;
      log(state, "The torch gutters out.");
    }
  }
```

- [ ] **Step 5: The tag in `src/ui/panels.ts`**

In `statsHtml`, after the `injured` tag: `if (p.torch.lit) tags.push(\`<span class="tag">torch lit, ${fmtDuration(p.torch.minutes)}</span>\`);`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sim/types.ts src/sim/skills.ts src/sim/tasks.ts src/sim/player.ts src/ui/panels.ts tests/torch.test.ts tests/ui.test.ts
git commit -m "feat(survidle): light a torch from the fire or with the drill; it burns an hour"
```

---

### Task 6: What a torch does

**Files:**
- Modify: `src/sim/player.ts` (`firelit`, `baseWalkSpeed`)
- Modify: `src/sim/events.ts` (the wolf roll)
- Test: `tests/torch.test.ts`

**Interfaces:**
- Produces: `firelit(state, world): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/torch.test.ts` (add imports `hourlyEvents` from `../src/sim/events`, `baseWalkSpeed, firelit` from `../src/sim/player`):

```ts
describe("what a torch does", () => {
  it("takes the night off your feet: 3.0 km/h with it, 2.25 without, 3.0 by day either way", () => {
    const { state } = newGame(1);
    const day = calendar(4 * 60);
    const night = calendar(16 * 60);
    const clear = { ...state.weather, snowCm: 0 };
    expect(baseWalkSpeed(state, night, clear, 5)).toBeCloseTo(2.25);
    state.player.torch = { lit: true, minutes: 30 };
    expect(baseWalkSpeed(state, night, clear, 5)).toBeCloseTo(3.0);
    expect(baseWalkSpeed(state, day, clear, 5)).toBeCloseTo(3.0);
  });

  it("keeps the wolves off, as does your own lit fire", () => {
    const { state, world } = newGame(2);
    const rng = new Rng(11);
    const hits = () => {
      let n = 0;
      for (let i = 0; i < 500; i++) {
        state.player.health = 100;
        hourlyEvents(state, world, calendar(16 * 60), rng);
        if (state.player.health < 100) n++;
      }
      return n;
    };
    expect(firelit(state, world)).toBe(false);
    expect(hits()).toBeGreaterThan(0);
    state.player.torch = { lit: true, minutes: 30 };
    expect(firelit(state, world)).toBe(true);
    expect(hits()).toBe(0);
    state.player.torch = { lit: false, minutes: 0 };
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    expect(firelit(state, world)).toBe(true);
    expect(hits()).toBe(0);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(firelit(state, world)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/torch.test.ts`
Expected: FAIL, `firelit` is not exported and the night speed is 2.25 with the torch.

- [ ] **Step 3: Implement**

In `src/sim/player.ts`, after `sheltered`:

```ts
/** True with a lit torch in hand or beside your own lit fire: the light wolves keep away from. */
export function firelit(state: GameState, world: World): boolean {
  if (state.player.torch.lit) return true;
  const r = regionState(state, world, state.player.region);
  return atCamp(state, world) && r.fire.lit;
}
```

In `baseWalkSpeed`, change `if (cal.isNight) v *= 0.75;` to `if (cal.isNight && !state.player.torch.lit) v *= 0.75;`.

In `src/sim/events.ts`, import `firelit` beside `sheltered` and change the wolf condition to `if (cal.isNight && !sheltered(state, world) && !firelit(state, world)) {`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. The existing wolves test in `tests/camp.test.ts` still passes: its fire is not lit.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts src/sim/events.ts tests/torch.test.ts
git commit -m "feat(survidle): a lit torch takes the night off your feet and keeps the wolves off"
```

---

### Task 7: The torch on the map, docs, browser pass

**Files:**
- Modify: `src/ui/map.ts` (`lightSources`, `mapKey`)
- Modify: `docs/README.md`
- Test: `tests/light.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the `firelight` describe in `tests/light.test.ts`:

```ts
  it("a torch in hand lights one ring wherever you stand, and the key knows it", () => {
    const { state, world } = newGame(21);
    placeAtSpot(state, world, state.player.region, "forest");
    const k1 = mapKey(state, world, newUiState(), night);
    state.player.torch = { lit: true, minutes: 30 };
    expect(mapKey(state, world, newUiState(), night)).not.toBe(k1);
    draw(state, world);
    expect(lit("lit-0")).toBe(1);
    expect(lit("lit-1")).toBe(8);
    expect(lit("lit-2")).toBe(0);
    expect(document.querySelector("#map .c.lit-0.mk-player")).not.toBeNull();
  });

  it("standing on your fire with a torch lit, no cell is lit twice", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    state.player.torch = { lit: true, minutes: 30 };
    draw(state, world);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(21);
    expect(document.querySelectorAll("#map .c.lit-0.lit-1, #map .c.lit-1.lit-2, #map .c.lit-0.lit-2").length).toBe(0);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/light.test.ts`
Expected: FAIL, the torch lights nothing.

- [ ] **Step 3: Implement**

In `src/ui/map.ts`, in `lightSources`, replace `void world;` with:

```ts
  if (state.player.torch.lit) out.push({ cell: cellOf(state, world), reach: 1 });
```

In `mapKey`, add `|${state.player.torch.lit ? "T" : ""}` to the key string.

- [ ] **Step 4: README**

In `docs/README.md`, under "How it plays", after the Camp bullet:

```markdown
- **Light.** Every tile carries its ground's colour as a dark background.
  At night a lit fire glows on the map, two rings when it is fed and one
  when it burns low, and you can see your own camp from the next valley.
  A torch (1 stick, 2 bark, 20 minutes; lit at a fire in a minute or with
  the fire drill in ten) burns for an hour, lights one ring around you,
  takes the night penalty off your walking, and keeps the wolves off.
```

Under "Where the numbers live": `- \`src/ui/map.ts\`: light sources and the rings they light.`

- [ ] **Step 5: Run the gate**

From `08-survidle`: `npx vitest run && npx tsc --noEmit && npm run build`. From the worktree root: `npm run lint` (0 errors for `08-survidle`; warnings in other prototypes are pre-existing).

- [ ] **Step 6: Browser pass**

Start the dev server from `08-survidle` (read its port). If the Chrome extension is connected, use it; otherwise the headless CDP fallback described in the memory note `headless-chrome-cdp-fallback` (a `launch.sh` and `cdp.mjs` written with the Write tool; run lint from the repo root, never from inside the prototype). Open `?seed=7` and check, writing down the text you read:

1. By day: every ground glyph has a coloured background; the current region is still outlined and lightly highlighted; a route highlights when you walk.
2. Console: `const s = survidle.state; const r = s.regions[s.player.region]; r.structures.firePit = true; r.fire.lit = true; r.fire.fuelKg = 10; survidle.advance(600)`. At night the camp glyph flames and two uneven rings glow; the rest of the map is as dark as before. Screenshot.
3. `r.fire.fuelKg = 2`: one ring after the next render.
4. Zoom out once: only the source glyph. Zoom out twice: the `F` marker pulses.
5. Give a torch and a drill: `s.player.pack.items.torch = 1; s.player.tools.push({ id: "fireDrill", durability: 100 })`, walk to the forest, Camp tab, "Light a torch", advance through it. One ring around `@` in the forest, "torch lit, NN min" under the bars, and the camp fire still glowing behind you. Screenshot.
6. Walk at night with and without the torch and compare the walk button's minutes for the same route.

Stop the server and your own Chrome (kill only the process with your scratchpad profile path).

- [ ] **Step 7: Commit**

```bash
git add src/ui/map.ts docs/README.md tests/light.test.ts
git commit -m "feat(survidle): a torch in hand lights the map around you"
```

Report what was built, the browser observations with the screenshot paths, and anything that looked wrong.
