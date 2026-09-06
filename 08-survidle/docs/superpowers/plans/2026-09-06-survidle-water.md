# Survidle Water Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first survivor's camp is the shore they land on; fetching water is one trip with one vessel by a method the order names; a seep dug on wet ground is a per-cell water source with a pool and a refill; and the rule "an order names one method" is applied to the water and fire rows.

**Architecture:** World gen sites the start camp on a shore cell and the shore spot next to it. The `fill` task gains a method argument (`shore`, `hole`, `seep`) the way a hunt carries its species, and the intent runner's melt fallback and hole-first clause come out; the reference list chooses the winter method in the open through `wantOpen`. Seeps live in a new `src/sim/seep.ts` keyed by cell in `state.seeps`, and every drink or fill draws only what a source holds through one `sourceLitres` reading.

**Tech Stack:** TypeScript, Vite, Vitest (`npm test` from `08-survidle/`), vite-node scripts (`npm run reference`, `npm run horizon`, `npm run year`).

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-water-design.md`

## Global Constraints

- Work on `main` directly, from `/Users/janis.kirsteins/Projects/prototypes/08-survidle`. Stage with explicit paths under `08-survidle/`. Never `git add -A`.
- Run `npm test` (fast suite) and `npx tsc --noEmit` before every commit. The pre-commit hook runs biome and tsc.
- No em dashes and no non-typable characters anywhere: hyphens, straight quotes, `...`.
- Every quantity stays real: litres, litres an hour, minutes, days. Constants named in one place.
- Comments explain, never chronicle: no dates, no "was X, now Y".
- Commit messages: `type(survidle): sentence in lower case`, ending with the two trailers below.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM
```

**Two deviations from the spec's wording, both recorded here so the spec's next edit can adopt them:**

1. Section 1 says the first camp is chosen "the way an heir's landing cell is chosen ... seeded from the world seed". This plan takes the shore cell nearest the centroid instead. A seed already decides the world, so a seeded draw among shore cells adds nothing but a second rng stream; and the spec's own fallback is the nearest shore.
2. Section 3 says the dig's ground is "a new spot kind `wet`". This plan special-cases `resolveCell` for `build seep` (nearest wet cell with no seep, by route), the way `setTrap` and `emptyTrap` are already special-cased, instead of adding a `SpotId`. A new spot kind would appear in every region's places list and the where-select, which the spec does not ask for.

The spec's survey also says the three waterless starts come from `looksLikeStart` sampling a box. Measured at ae85e1f they are the start search's fallback at ring 40 (`world.startRing === 40` on seeds 24, 35, 36): no lattice cell passed the exact filter, so the anchor region was used. Task 1 fixes the fallback and corrects the spec.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/world/gen.ts` | start camp on a shore, shore spot beside it, a fallback start that has a shore |
| `src/sim/seep.ts` (new) | seep classes, table, ground rule, per-cell state, the tick (refill, freeze, thaw, drought, silt), re-dig clock |
| `src/sim/water.ts` | `sourceLitres`, `drawSource`; `drink` and `fillVessels` draw what a source holds |
| `src/sim/tasks.ts` | `fill` by method, `build seep`, `mend seep`, the fetch trip's vessel, the fire rows split |
| `src/sim/intent.ts` | fallback removed; melt as a keep; `build seep` and `fill seep` placement |
| `src/sim/body.ts` | thirsty step ranks sources by what they hold, waits at a seep; fire step prefers indoors |
| `src/sim/reference.ts` | the list's water and fire wants by method; `wantOpen` chooses in the open |
| `src/sim/capabilities.ts` | the seep's producer row |
| `src/sim/types.ts`, `src/sim/save.ts`, `src/sim/newgame.ts` | `state.seeps`, `StructureId` gains `seep` |
| `src/sim/items.ts` | the seep's structure definition |
| `src/ui/dopanel.ts`, `src/ui/render.ts`, `src/main.ts` | three fetch rows, camp delivery by default for fetch and melt |
| `src/ui/panels.ts`, `src/sim/camp.ts` | the water line, the region water list, "seep possible" in the site report |
| `src/ui/map.ts`, `src/style.css` | the seep mark |
| `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` | the ruling, the build order, item notes, the measured paragraph |

---

### Task 1: The first camp is a shore cell, and every start has one

**Files:**
- Modify: `src/world/gen.ts` (`buildRegion` around line 119, `placeSpots` around line 166, `findStart` around line 258)
- Modify: `docs/superpowers/specs/2026-09-05-survidle-water-design.md` (the survey's cause and section 1's second paragraph)
- Test: `tests/world.test.ts`

**Interfaces:**
- Produces: `RegionDef.campCell` is a shore cell whenever the region has one; `spotOf(r, "shore")` is the shore cell nearest the camp by route, never the camp cell; `world.startRing < 40` on every seed 1 to 40.

- [ ] **Step 1: Write the failing tests**

Append to `tests/world.test.ts` inside `describe("world generation", ...)`:

```ts
  it("sites the camp on a shore cell and the shore spot beside it, on every reference seed and the three that used to fall back", () => {
    for (const seed of [17, 19, 42, 79, 24, 35, 36]) {
      const w = generateWorld(seed);
      const r = regionAt(w, w.start);
      expect(w.startRing, `seed ${seed}`).toBeLessThan(40);
      const camp = cellAt(w, r.campCell);
      expect(camp.terrain, `seed ${seed}`).not.toBe("water");
      const beside = neighbours(w, r.campCell).some((n) => cellAt(w, n).terrain === "water");
      expect(beside, `seed ${seed} camp beside water`).toBe(true);
      const shore = r.spots.find((s) => s.id === "shore")!;
      expect(shore, `seed ${seed} shore spot`).toBeDefined();
      expect(shore.cell).not.toBe(r.campCell);
      expect(shore.km).toBeLessThanOrEqual(0.6);
      expect(new Set(r.spots.map((s) => s.cell)).size).toBe(r.spots.length);
    }
  });
```

Add `neighbours` to the import from `../src/world/gen`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/world.test.ts -t "sites the camp"`
Expected: FAIL on `startRing` for seed 24 (40) or on `beside` for seed 17.

- [ ] **Step 3: Site the camp on a shore and the shore spot beside it**

In `src/world/gen.ts`, `buildRegion`: replace the `campCell` line

```ts
  const campCell = nearestCell(world, cells, cx, cy, (c) => passable(c.terrain)) ?? cells[0];
```

with

```ts
  // Camp is the shore cell nearest the centroid: a survivor camps by the water,
  // and the centroid is only where the region's middle happens to be. A region
  // with no shore keeps the centroid camp.
  const onShore = isShore(world);
  const campCell = nearestCell(world, cells, cx, cy, onShore)
    ?? nearestCell(world, cells, cx, cy, (c) => passable(c.terrain))
    ?? cells[0];
```

`isShore` is declared below `buildRegion` as a `const`; move its declaration (the three lines starting `/** Fishing happens from land beside water. */`) above `buildRegion` so it is initialised before use.

In `placeSpots`, the `wants` table: change the shore entry so the shore spot is the nearest shore cell to the camp rather than a scaled walk:

```ts
    // The camp stands on the shore, so the shore spot is the next shore cell along: the
    // fishing place a minute away, never the camp's own cell.
    { id: "shore", pick: isShore(world), km: 0, share: r.frac.water },
```

The candidate loop already skips `idx === r.campCell`, and with `km: 0` the six nearest by straight line are routed and the shortest route wins.

In `findStart`, replace the fallback at the end of the function:

```ts
  const fallback = { id: ay * LATTICE_W + ax, ring: 40 };
  STARTS.set(world.seed, fallback);
  return fallback;
```

with a second, relaxed spiral that still insists on water:

```ts
  // No lattice cell passed the exact filter: take the nearest region that at least
  // has a shore, since a start with no water is not a start. The anchor itself only
  // if even that fails.
  for (let ring = 0; ring < 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        const id = ly * LATTICE_W + lx;
        const r = regionAt(world, id);
        if (r.landCells >= 120 && hasSpot(r, "shore")) {
          const found = { id, ring: 39 };
          STARTS.set(world.seed, found);
          return found;
        }
      }
    }
  }
  const fallback = { id: ay * LATTICE_W + ax, ring: 40 };
  STARTS.set(world.seed, fallback);
  return fallback;
```

- [ ] **Step 4: Run the world tests**

Run: `npx vitest run tests/world.test.ts`
Expected: PASS, including the existing "puts every spot on a real cell" test (the shore spot's `km` is its route length, unchanged in kind).

- [ ] **Step 5: Run the whole fast suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Tests that use `placeAtSpot(state, world, region, "shore")` keep working because the spot still exists. If a test pinned a walk time from camp to the shore, update the number and say so in the commit.

- [ ] **Step 6: Correct the spec**

In `docs/superpowers/specs/2026-09-05-survidle-water-design.md`, replace in the survey paragraph

```
three (seeds
24, 35, 36) have no open water in the region at all, because
`looksLikeStart` samples a 3x3 lattice box around the region and not the
region itself.
```

with

```
three (seeds
24, 35, 36) have no open water in the region at all, because the start
search found no lattice cell passing its filter within 40 rings and fell
back to the anchor region (`world.startRing` reads 40 on all three).
```

and replace section 1's second paragraph (`looksLikeStart` gains a second pass ...) with

```
`findStart`'s fallback changes: when no lattice cell passes the exact
filter, a second spiral takes the nearest region with at least 120 land
cells and a shore, and the anchor is used only if that fails too. The
box sampler stays as the cheap first filter.
```

Also replace in section 1's first paragraph "a shore cell of that region chosen by the same rule as `landingCell`, restricted to the region's own cells, seeded from the world seed so a seed always lands the same way, and falling back to the shore cell nearest the centroid" with "the shore cell nearest the centroid, which a seed fixes as surely as a draw would".

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/world/gen.ts 08-survidle/tests/world.test.ts 08-survidle/docs/superpowers/specs/2026-09-05-survidle-water-design.md
git commit -m "feat(survidle): the first camp is the shore cell nearest the region's middle, the shore spot is the next shore cell along, and a start with no water is never chosen"
```

---

### Task 2: The fill task names its method, and the runner's fallbacks come out

**Files:**
- Modify: `src/sim/tasks.ts` (`case "fill"` in `checkFresh` around line 334; `case "fill"` in `complete` around line 1276; `availableTasks` around line 690)
- Modify: `src/sim/intent.ts` (`meltInsteadOk`, `fetchAllowance`, `intentOption`, `startIntent`, `workStep`)
- Modify: `src/sim/types.ts` (a `FillMethod` type)
- Test: `tests/fill.test.ts`

**Interfaces:**
- Produces: `type FillMethod = "shore" | "hole" | "seep"` in `types.ts`; `check(state, world, cal, "fill", method)` where a missing method reads as `"shore"`; `fetchAllowance(state, world, task, arg, why)` without the calendar again.
- Consumes: nothing new.

- [ ] **Step 1: Rewrite the fill tests**

In `tests/fill.test.ts`, change the four tests below and delete the `describe("the fill keep in winter", ...)` block entirely (Task 4 writes its replacement).

Replace `it("on a frozen shore the fill opens an ice hole first, and the hole is gone at dawn", ...)` with:

```ts
  it("the hole order cuts an ice hole first on a frozen shore, fills, and the hole is gone at dawn", () => {
    const { g, state, world, st, camp } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "iceHole", undefined, shore.cell).ok).toBe(true);
    const o = addOrder(state, world, { task: "fill", arg: "hole", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(until(g, () => { state.weather.iceCm = 10; return st.iceHole !== null; }, 4000)).toBe(true);
    expect(st.iceHole!.cell).toBe(shore.cell);
    placeAt(state, world, shore.cell);
    expect(waterSource(state, world)).toBe(true);
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
    expect(until(g, () => st.iceHole === null, 1500)).toBe(true);
    expect(state.log.some((l) => l.text === "The ice hole has skinned over.")).toBe(true);
  });

  it("the shore order on a frozen shore waits with 'iced over' and never cuts or melts", () => {
    const { state, world, st } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 20;
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    const o = check(state, world, cal, "fill", "shore", shore.cell);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("iced over");
    addOrder(state, world, { task: "fill", arg: "shore", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    const fuel = st.fire.fuelKg;
    advance(state, world, 180);
    expect(st.iceHole).toBeNull();
    expect(st.fire.fuelKg).toBeCloseTo(fuel - 3 * 3, 0);
    expect(qty(pile(state, st.campCell), "water")).toBe(0);
  });
```

(The fuel check reads the open fire's 3 kg an hour over three hours and no melt's kilo on top; use `toBeLessThanOrEqual(fuel - 8)` and `toBeGreaterThanOrEqual(fuel - 10)` if the burn rate makes the exact number brittle.)

Replace `it("a manual fill on a frozen shore cuts the hole itself, then fills the vessel", ...)` with:

```ts
  it("a manual hole fill on a frozen shore cuts the hole itself, then fills the vessel", () => {
    const { state, world } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    expect(beginTask(state, world, cal, "fill", "hole")).toBe(true);
    expect(state.task?.duration).toBe(25);
    advance(state, world, 25);
    const st = regionState(state, world, state.player.region);
    expect(st.iceHole?.cell).toBe(shore.cell);
    expect(vesselLitres(state.player)).toBeCloseTo(vesselLitresCapacity(state.player), 5);
  });
```

Replace `it("with no axe in reach a frozen shore blocks the fill and says so", ...)` with:

```ts
  it("the hole order needs an axe, and is not offered on an open shore", () => {
    const { state, world } = waterCamp();
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "fill", "hole", shore.cell).why).toBe("the shore is open, no hole needed");
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 10;
    const o = check(state, world, cal, "fill", "hole", shore.cell);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("needs an axe");
  });

  it("a fill with no method reads as the shore, so an old order still runs", () => {
    const { state, world } = waterCamp();
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "fill", undefined, shore.cell).label).toBe("Fetch water from the shore");
  });
```

- [ ] **Step 2: Run the fill tests to verify they fail**

Run: `npx vitest run tests/fill.test.ts`
Expected: FAIL on labels and the "iced over" reason.

- [ ] **Step 3: The method type and the fill check**

In `src/sim/types.ts`, under `TaskId`:

```ts
/** How a fill gets its water: the order names one and never picks another. A missing method is the shore. */
export type FillMethod = "shore" | "hole" | "seep";
export const FILL_METHODS: FillMethod[] = ["shore", "hole", "seep"];
```

In `src/sim/tasks.ts`, replace the whole `case "fill": { ... }` in `checkFresh` with (the `seep` branch is filled in by Task 7; until then it returns "no seep dug"):

```ts
    case "fill": {
      const method = (arg ?? "shore") as FillMethod;
      const holds = vesselLitresCapacity(p) + totalQty(invs, "barkBucket") * TOOLS.barkBucket.litres! + totalQty(invs, "waterskin") * TOOLS.waterskin.litres!;
      const label = method === "hole" ? "Cut an ice hole and fetch water" : method === "seep" ? "Fetch water from the seep" : "Fetch water from the shore";
      const base = opt({ group: "camp", label, detail: "one vessel", duration: 5, repeatable: true });
      if (method === "seep") return { ...base, ok: false, why: "no seep dug" };
      const o = ground(watersideCell(world, at), "shore", "water", base);
      if (!o.ok) return o;
      if (holds <= 0) return { ...o, ok: false, why: "needs a vessel" };
      // fillVessels tops every carried vessel off in one call, so a vessel already at
      // capacity has nothing left to gain from another cycle; without this the task
      // repeats forever at the shore instead of walking the full vessel home to pour.
      if (vesselLitresCapacity(p) > 0 && vesselLitres(p) >= vesselLitresCapacity(p) - 1e-9) {
        const homeSt = regionState(state, world, p.region);
        const camp = pile(state, homeSt.campCell);
        const why = campWaterRoom(camp, homeSt) > 0 ? "the vessels are full" : "camp is full";
        return { ...o, ok: false, why };
      }
      const iced = state.weather.iceCm >= ICE_SHORE_CM && !iceHoleOpen(state, at);
      if (method === "shore") return iced ? { ...o, ok: false, why: "iced over" } : o;
      if (state.weather.iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open, no hole needed" };
      if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };
      return iced ? { ...o, detail: `${o.detail}; cuts the hole first, wearing the axe`, duration: 25 } : o;
    }
```

Import `FillMethod` from `./types`.

In `complete`, `case "fill"`:

```ts
    case "fill": {
      if (arg === "hole" && !waterSource(state, world) && state.weather.iceCm >= ICE_SHORE_CM) cutIceHole(state, world);
      const added = fillVessels(state, world);
      if (added > 1e-9) log(state, `You fill ${added.toFixed(1)} litres.`);
      return;
    }
```

In `availableTasks`, replace `out.push(check(state, world, cal, "fill"));` with

```ts
  for (const m of FILL_METHODS) out.push(check(state, world, cal, "fill", m));
```

importing `FILL_METHODS` from `./types`.

- [ ] **Step 4: Take the fallback and the hole-first clause out of the intent runner**

In `src/sim/intent.ts`:

1. Delete `meltInsteadOk` and its doc comment.
2. `fetchAllowance` loses its `cal` parameter and its first line (`if (meltInsteadOk(...)) return ...`). Its doc comment becomes:

```ts
/**
 * A build blocked at its own cell for want of materials gets one allowance:
 * something it needs sits elsewhere in the region and can be walked to. Only
 * when that is the actual reason it is blocked - "already built here" or
 * "build the fire pit first" get no allowance, fetching would not help
 * either. A delivery, not a second method: an order names one method and
 * waits when that method is shut. The one place this is decided, so
 * intentOption and startIntent never disagree about whether the button may
 * be pressed.
 */
function fetchAllowance(state: GameState, world: World, task: TaskId, arg: string | undefined, why: string): { ok: boolean; detail: string } {
```

3. Update the two call sites in `intentOption` and `startIntent` to drop `cal`.
4. In `workStep`, replace

```ts
  let o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
  const rawWhy = o?.why ?? "";
  // The melt allowance ... (whole comment)
  if (it.task === "fill" && o && !o.ok) {
    const fa = fetchAllowance(state, world, cal, it.task, it.arg, rawWhy);
    if (fa.ok) o = { ...o, ok: true, why: "", detail: fa.detail };
  }
```

with

```ts
  const o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
```

5. Delete the whole block from `// A fill on a frozen shore cuts its hole first, judged at the shore itself` down to the closing `}` before `if (here !== it.cell) return walkTo(...)`. The hole order's own `complete("fill", "hole")` cuts the hole.
6. Remove `campMeltReady` and `fireStep` from the `./body` import if nothing else in the file uses them, and `waterSource` from the `./water` import likewise.

- [ ] **Step 5: Run the fill tests and the suite**

Run: `npx vitest run tests/fill.test.ts && npm test && npx tsc --noEmit`
Expected: fill tests PASS. `tests/needs.test.ts` still passes (the body's thirsty step keeps its melt). `tests/reference.test.ts` may fail on the winter list until Task 4; if it does, note it and go on, Task 4 fixes it. `tests/intent.test.ts` fetch tests PASS with the shorter `fetchAllowance`.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/types.ts 08-survidle/tests/fill.test.ts
git commit -m "feat(survidle): a fill names its method - from the shore, through an ice hole it cuts, or from the seep - and the intent runner no longer cuts a hole or melts snow behind an order's back"
```

---

### Task 3: One vessel per trip, the emptiest, with the litres on the row

**Files:**
- Modify: `src/sim/water.ts` (new `tripVessel`, `tripLitres`)
- Modify: `src/sim/tasks.ts` (`beginTask`'s fill branch around line 740; the fill row's detail)
- Test: `tests/fill.test.ts`

**Interfaces:**
- Produces: `tripVessel(state, world): { id: ToolId; inHand: boolean; room: number } | null`; `tripLitres(state, world): number`; `takeUpTripVessel(state, world): void`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fill.test.ts` inside `describe("the fill task", ...)`:

```ts
  it("the trip takes up the vessel with the most room, and a partly full one only when it is alone", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    // A half full skin in hand, an empty bucket in the pile: the bucket has more room.
    state.player.tools.push({ ...freshTool("waterskin"), litres: 2.5 });
    addItem(pile(state, st.campCell), "barkBucket", 1);
    expect(tripVessel(state, world)).toEqual({ id: "barkBucket", inHand: false, room: 2 });
    expect(tripLitres(state, world)).toBeCloseTo(2.5, 5);
    takeUpTripVessel(state, world);
    expect(state.player.tools.some((t) => t.id === "barkBucket")).toBe(true);
    expect(state.player.tools.find((t) => t.id === "waterskin")!.litres).toBe(2.5);
  });

  it("with only a partly full vessel anywhere, the trip takes it", () => {
    const g = newGame(17);
    const { state, world } = g;
    addItem(state.player.pack, "waterskin", 1);
    takeUp(state, world, "waterskin");
    state.player.tools.find((t) => t.id === "waterskin")!.litres = 1;
    expect(tripVessel(state, world)).toEqual({ id: "waterskin", inHand: true, room: 2 });
    expect(tripLitres(state, world)).toBe(2);
  });

  it("the row's small print names the litres the trip adds and the vessel", () => {
    const { state, world } = waterCamp();
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "fill", "shore", shore.cell).detail).toMatch(/^2\.0 l, the bark bucket/);
  });
```

Import `freshTool` from `../src/sim/inventory` and `takeUpTripVessel, tripLitres, tripVessel` from `../src/sim/water`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/fill.test.ts -t "trip"`
Expected: FAIL, `tripVessel` is not exported.

- [ ] **Step 3: The trip's vessel**

In `src/sim/water.ts`, after `VESSELS`:

```ts
/**
 * The one vessel a fetch takes: in hand, in the pack or in the pile under
 * foot, the one with the most room. A partly full vessel is chosen only when
 * it is the only vessel there, which the room ordering gives for free. A
 * vessel of a kind already in hand is the one in hand, since tools are one
 * per kind and taking up another would drop it. Null when there is none.
 */
export function tripVessel(state: GameState, world: World): { id: ToolId; inHand: boolean; room: number } | null {
  const p = state.player;
  const here = pile(state, cellOf(state, world));
  let best: { id: ToolId; inHand: boolean; room: number } | null = null;
  for (const t of p.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    const room = t.frozen ? 0 : holds - (t.litres ?? 0);
    if (!best || room > best.room) best = { id: t.id, inHand: true, room };
  }
  for (const v of VESSELS) {
    if (p.tools.some((t) => t.id === v)) continue;
    if (qty(p.pack, v) + qty(here, v) < 1) continue;
    const room = TOOLS[v].litres!;
    if (!best || room > best.room) best = { id: v, inHand: false, room };
  }
  return best;
}

/** Litres a fetch would add: the room in every vessel that will be in hand once the trip's vessel is taken up. */
export function tripLitres(state: GameState, world: World): number {
  const p = state.player;
  let l = 0;
  for (const t of p.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (holds && !t.frozen) l += holds - (t.litres ?? 0);
  }
  const v = tripVessel(state, world);
  if (v && !v.inHand) l += v.room;
  return l;
}

/** Takes the trip's vessel up when it is not in hand yet. */
export function takeUpTripVessel(state: GameState, world: World): void {
  const v = tripVessel(state, world);
  if (v && !v.inHand) takeUp(state, world, v.id);
}
```

Add `takeUp` to the import from `./inventory` (it is exported there) and `ToolId` is already imported.

In `src/sim/tasks.ts`, `beginTask`, replace

```ts
    if (id === "fill") {
      if (vesselLitresCapacity(state.player) <= 0 && !takeUp(state, world, "barkBucket")) takeUp(state, world, "waterskin");
    } else takeUp(state, world, need);
```

with

```ts
    if (id === "fill") takeUpTripVessel(state, world);
    else takeUp(state, world, need);
```

and in `checkFresh`'s fill case, after `if (holds <= 0) return ...needs a vessel`, set the detail:

```ts
      const v = tripVessel(state, world);
      const litres = tripLitres(state, world);
      const named = v ? `, the ${TOOLS[v.id].name}` : "";
      const o2 = { ...o, detail: `${litres.toFixed(1)} l${named}` };
```

and use `o2` instead of `o` in every return below it in that case. Import `takeUpTripVessel, tripLitres, tripVessel` from `./water`.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/fill.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. If `beginTask`'s `hasTool(state.player, need)` guard skips the branch when a bucket is already in hand, move the `takeUpTripVessel` call above the `if (need && !hasTool(...))` block, guarded by `if (id === "fill")`, so a fuller vessel in the pile is still preferred.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/water.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/fill.test.ts
git commit -m "feat(survidle): a fetch takes up the vessel with the most room and its row says the litres one trip adds"
```

---

### Task 4: Melt snow as a keep, and the reference list's winter wants

**Files:**
- Modify: `src/sim/intent.ts` (`yieldItem`, `yieldItems`, `packCarries`, and every other `it.task === "fill"` case)
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, `wantOpen`)
- Test: `tests/fill.test.ts`, `tests/reference.test.ts`

**Interfaces:**
- Produces: `yieldItem("melt") === "water"`; `wantOpen` opens `fill hole` with an axe on an iced shore, `melt` without one, and `fill shore` on an open shore.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fill.test.ts`:

```ts
describe("the winter methods", () => {
  it("a melt keep fills the vessel at the fire and pours it at camp", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.tools.push(freshTool("barkBucket"));
    addItem(pile(state, st.campCell), "barkBucket", 1);
    state.weather.iceCm = ICE_SHORE_CM;
    state.weather.snowCm = 20;
    expect(yieldItem("melt")).toBe("water");
    const o = addOrder(state, world, { task: "melt", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    advance(state, world, 180);
    expect(qty(pile(state, st.campCell), "water")).toBeGreaterThan(0);
    expect(st.iceHole).toBeNull();
  });
});
```

Import `ICE_SHORE_CM` from `../src/sim/water` if not already imported.

Append to `tests/reference.test.ts`:

```ts
  it("names the water method: the shore keep in summer, the hole keep with an axe on ice, the melt keep without one", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const shore = REFERENCE_ORDERS.find((w) => w.req.task === "fill" && w.req.arg === "shore" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    const hole = REFERENCE_ORDERS.find((w) => w.req.task === "fill" && w.req.arg === "hole" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    const melt = REFERENCE_ORDERS.find((w) => w.req.task === "melt" && w.req.until.kind === "campHas" && w.req.until.qty === 2)!;
    expect(shore.kind).toBe("keep");
    expect(hole.kind).toBe("keep");
    expect(melt.kind).toBe("keep");
    const cal = calendar(0, 90);
    expect(wantOpen(state, shore, cal)).toBe(true);
    expect(wantOpen(state, hole, cal)).toBe(false);
    expect(wantOpen(state, melt, cal)).toBe(false);
    state.weather.iceCm = ICE_SHORE_CM;
    expect(wantOpen(state, shore, cal)).toBe(false);
    expect(wantOpen(state, hole, cal)).toBe(true);
    expect(wantOpen(state, melt, cal)).toBe(false);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    expect(wantOpen(state, hole, cal)).toBe(false);
    expect(wantOpen(state, melt, cal)).toBe(true);
    addItem(pile(state, st.campCell), "axe", 1);
    expect(wantOpen(state, hole, cal)).toBe(true);
    expect(wantOpen(state, melt, cal)).toBe(false);
  });
```

Add the imports the file lacks: `regionState` from `../src/sim/regionstate`, `addItem, pile` from `../src/sim/inventory`, `ICE_SHORE_CM` from `../src/sim/water`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/fill.test.ts -t "winter methods" && npx vitest run tests/reference.test.ts -t "water method"`
Expected: FAIL: `yieldItem("melt")` is null; the list has no `fill shore` want.

- [ ] **Step 3: Melt yields water and delivers like a fill**

In `src/sim/intent.ts`:

- `yieldItem`: add `case "melt": return "water";`
- `yieldItems`: change `if (task === "fill") return ["water"];` to `if (task === "fill" || task === "melt") return ["water"];` and its comment to "A fill's or a melt's litres never sit in the pack as an item; packCarries reads the vessels instead."
- `packCarries`: change `if (it.task === "fill") {` to `if (it.task === "fill" || it.task === "melt") {`.
- Search the file for every remaining `it.task === "fill"` and `task === "fill"` (there is one in `resolveCell` for the ice hole cell, which stays fill-only) and extend the delivery-related ones (`deliveryPending`, `loadFull` if they special-case fill) to melt in the same way.

Melt is already in `CAMP_BOUND` and `GATE_SKILL` (building), so a melt keep is placed at camp and gated like the trough's fill.

- [ ] **Step 4: The list's wants and `wantOpen`**

In `src/sim/reference.ts`, `REFERENCE_ORDERS`: replace `keep("fill", 2),` with

```ts
  keep("fill", 2, "shore"),
  keep("fill", 2, "hole"),
  keep("melt", 2),
```

and `keep("fill", 20),` with

```ts
  keep("fill", 20, "shore"),
  keep("fill", 20, "hole"),
  keep("melt", 20),
```

Add above `wantOpen`:

```ts
/** The home shore is under ice: a shore fetch is shut and the winter methods are the question. */
function shoreIced(state: GameState): boolean {
  return state.weather.iceCm >= ICE_SHORE_CM;
}

/** An axe in hand, in the pack or in the camp pile: what a competent player would carry to the shore in winter. */
function axeInReach(state: GameState, world: World): boolean {
  if (hasTool(state.player, "axe")) return true;
  const st = regionState(state, world, state.player.region);
  return qty(state.player.pack, "axe") >= 1 || qty(pile(state, st.campCell), "axe") >= 1;
}
```

and in `wantOpen` (it needs `world`; change its signature to `wantOpen(state, world, w, cal)` and update the two callers in this file and the test file):

```ts
  // Water by method, chosen here in the open rather than by a fallback inside the
  // intent: the shore while it is open, the hole with an axe once it ices, the fire's
  // melt only when no axe is in reach.
  if (w.req.task === "fill" && w.req.arg === "shore") return !shoreIced(state);
  if (w.req.task === "fill" && w.req.arg === "hole") return shoreIced(state) && axeInReach(state, world);
  if (w.req.task === "melt") return shoreIced(state) && !axeInReach(state, world);
```

Import `ICE_SHORE_CM` from `./water`, `hasTool, pile, qty` from `./inventory`, `regionState` from `./regionstate` as needed. Update the doc comment above `REFERENCE_ORDERS` where it says "water at the top, waiting for its bucket" to "water at the top by three methods, of which wantOpen opens the one the season and the axe allow".

Update the existing `wantOpen` test ("opens the 400 kg firewood keep ...") and the new one to pass `world`.

- [ ] **Step 5: Run the tests, the suite and typecheck**

Run: `npx vitest run tests/fill.test.ts tests/reference.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. If the year loop's "withdraws the woodpile" test reads list positions by index, adjust the index for the two added wants at the top.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/intent.ts 08-survidle/src/sim/reference.ts 08-survidle/tests/fill.test.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): melt snow is a keep that pours its litres at camp, and the reference list opens the shore, hole or melt want in the open by the ice and the axe"
```

---

### Task 5: The Do panel's fetch rows and camp delivery by default

**Files:**
- Modify: `src/ui/dopanel.ts` (`intentGroups` Camp items)
- Modify: `src/ui/render.ts` (`defaultChoiceFor`)
- Modify: `src/main.ts` (the `intent` and `row-more` click cases)
- Test: `tests/dopanel.test.ts`

**Interfaces:**
- Produces: `defaultChoiceFor(id: TaskId): RowChoice` in `render.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/dopanel.test.ts`:

```ts
describe("the fetch rows", () => {
  it("the Camp group lists a fetch row per method and a plain click brings the water to camp", () => {
    const { world } = newGame(17);
    const r = regionAt(world, world.start);
    const camp = intentGroups(r).find((g) => g.label === "Camp")!;
    const fills = camp.items.filter((i) => i.id === "fill").map((i) => i.arg);
    expect(fills).toEqual(["shore", "hole", "seep"]);
    expect(rowRequest(defaultChoiceFor("fill"), "fill", "shore").req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("melt"), "melt", undefined).req.deliver).toBe("camp");
    expect(rowRequest(defaultChoiceFor("chop"), "chop", undefined).req.deliver).toBe("leave");
  });
});
```

Import `intentGroups` from `../src/ui/dopanel`, `defaultChoiceFor` from `../src/ui/render`, `regionAt` from `../src/world/gen`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/dopanel.test.ts -t "fetch rows"`
Expected: FAIL, `defaultChoiceFor` is not exported.

- [ ] **Step 3: The rows and the default**

In `src/ui/dopanel.ts`, `intentGroups`, Camp items: replace `{ id: "fill" }` with `{ id: "fill", arg: "shore" }, { id: "fill", arg: "hole" }, { id: "fill", arg: "seep" }`.

In `src/ui/render.ts`, after `defaultChoice`:

```ts
/** A row's plain-click choice: a fetch or a melt brings its water to camp, everything else leaves its yield where it is. */
export function defaultChoiceFor(id: TaskId): RowChoice {
  return { ...defaultChoice(), deliver: id === "fill" || id === "melt" ? "camp" : "leave" };
}
```

Import `TaskId` there if it is not.

In `src/main.ts`: in `case "intent"` replace `rowRequest(defaultChoice(), ...)` with `rowRequest(defaultChoiceFor(target.dataset.id as TaskId), ...)`; in `case "row-more"` replace `ui.choice = defaultChoice();` with `ui.choice = defaultChoiceFor(id);`. Import `defaultChoiceFor` beside `defaultChoice`.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/dopanel.test.ts && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/dopanel.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/tests/dopanel.test.ts
git commit -m "feat(survidle): the Do panel offers fetch water from the shore, through an ice hole and from the seep as three rows, and a plain click on a fetch or a melt brings the water to camp"
```

---

### Task 6: The seep module: ground, state, tick

**Files:**
- Create: `src/sim/seep.ts`
- Modify: `src/sim/types.ts` (`GameState.seeps`), `src/sim/newgame.ts`, `src/sim/save.ts`, `src/sim/advance.ts`
- Test: `tests/seep.test.ts` (new), `tests/advance-save.test.ts`

**Interfaces:**
- Produces:
  - `type SeepClass = "bog" | "damp"`; `SEEP: Record<SeepClass, { poolL: number; refillLPerHour: number }>`; `SEEP_DRY_DAYS = 14`; `SEEP_LIFE_DAYS = 365`
  - `interface Seep { class: SeepClass; litres: number; ice: number; dug: number }`; `GameState.seeps: Record<number, Seep>`
  - `seepGround(world, cell): SeepClass | null`
  - `seepStopped(state, world, cell, ambient): "frozen" | "drought" | "silted" | null`
  - `seepNeedsRedig(state, seep): boolean`
  - `stepSeeps(state, world, ambient, dt): void`
  - `nearestSeep(state, world, from, pred): number | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/seep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { SEEP, SEEP_DRY_DAYS, SEEP_LIFE_DAYS, seepGround, seepNeedsRedig, seepStopped, stepSeeps } from "../src/sim/seep";
import { FREEZE_C } from "../src/sim/water";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";

/** The first cell in the start region and its neighbours matching the terrain test. */
function findCell(world: World, ok: (t: string, nb: string[]) => boolean): number {
  const r = regionAt(world, world.start);
  for (const c of r.cells) {
    const nb = neighbours(world, c).map((n) => cellAt(world, n).terrain);
    if (ok(cellAt(world, c).terrain, nb)) return c;
  }
  throw new Error("no such cell in the start region");
}

describe("seep ground", () => {
  it("is bog on a bog, damp in spruce or on the bog's margin, and nothing on pine, rock, fell or a shore", () => {
    const { world } = newGame(17);
    const bog = findCell(world, (t, nb) => t === "bog" && !nb.includes("water"));
    const spruce = findCell(world, (t, nb) => t === "spruce" && !nb.includes("water"));
    const pine = findCell(world, (t, nb) => t === "pine" && !nb.includes("water"));
    const shore = findCell(world, (t, nb) => t !== "water" && nb.includes("water"));
    expect(seepGround(world, bog)).toBe("bog");
    expect(seepGround(world, spruce)).toBe("damp");
    expect(seepGround(world, pine)).toBeNull();
    expect(seepGround(world, shore)).toBeNull();
  });
});

describe("a seep", () => {
  function dug(seed = 17) {
    const g = newGame(seed);
    const { state, world } = g;
    const cell = findCell(world, (t, nb) => t === "bog" && !nb.includes("water"));
    state.seeps[cell] = { class: "bog", litres: 0, ice: 0, dug: state.minute };
    return { ...g, cell };
  }

  it("refills at its class rate and stops at the pool", () => {
    const { state, world, cell } = dug();
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBeCloseTo(SEEP.bog.refillLPerHour, 5);
    stepSeeps(state, world, 10, 60 * 24);
    expect(state.seeps[cell].litres).toBe(SEEP.bog.poolL);
  });

  it("freezes in place under the freezing line with no fire on its cell, and thaws by one", () => {
    const { state, world, cell } = dug();
    state.seeps[cell].litres = 4;
    stepSeeps(state, world, FREEZE_C - 1, 60);
    expect(state.seeps[cell].litres).toBe(0);
    expect(state.seeps[cell].ice).toBe(4);
    expect(seepStopped(state, world, cell, FREEZE_C - 1)).toBe("frozen");
    stepSeeps(state, world, 2, 60);
    expect(state.seeps[cell].ice).toBeCloseTo(2, 5);
    expect(state.seeps[cell].litres).toBeGreaterThan(2);
  });

  it("stops refilling after the dry spell and starts again with rain", () => {
    const { state, world, cell } = dug();
    state.weather.dryDays = SEEP_DRY_DAYS;
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBe(0);
    expect(seepStopped(state, world, cell, 10)).toBe("drought");
    state.weather.dryDays = 0;
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBeGreaterThan(0);
  });

  it("wants re-digging past two thirds of a year and silts up past a year", () => {
    const { state, world, cell } = dug();
    state.minute = Math.ceil((SEEP_LIFE_DAYS * 1440 * 2) / 3);
    expect(seepNeedsRedig(state, state.seeps[cell])).toBe(true);
    expect(seepStopped(state, world, cell, 10)).toBeNull();
    state.minute = SEEP_LIFE_DAYS * 1440;
    expect(seepStopped(state, world, cell, 10)).toBe("silted");
    stepSeeps(state, world, 10, 60);
    expect(state.seeps[cell].litres).toBe(0);
  });

  it("ticks with the world, and an old save loads with no seeps", () => {
    const { state, world, cell } = dug();
    placeAt(state, world, regionState(state, world, state.player.region).campCell);
    advance(state, world, 60);
    expect(state.seeps[cell].litres).toBeGreaterThan(0);
    const raw = JSON.parse(serialize(state));
    delete raw.state.seeps;
    expect(deserialize(JSON.stringify(raw))!.state.seeps).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/seep.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: The module and the state**

Create `src/sim/seep.ts`:

```ts
/**
 * A seep: a knee-deep hole dug to groundwater on wet ground. It holds a pool
 * and refills at the ground's own rate; drinking and filling draw only what
 * is in it (water.ts). It freezes in place in frost unless a fed fire burns
 * on its own cell, stops in a long dry spell, and silts up after a year
 * unless re-dug. One per cell, kept in state.seeps by cell like the piles.
 */
import { cellAt, neighbours, type World } from "../world/gen";
import { cellOf } from "./position";
import { regionState } from "./regionstate";
import type { GameState, Seep, SeepClass } from "./types";
import { FREEZE_C, THAW_L_PER_HOUR } from "./water";
import { straightKm } from "./position";

/** Pool and sustained yield of a hole half a metre across, knee deep: saturated peat, and damp forest soil. */
export const SEEP: Record<SeepClass, { poolL: number; refillLPerHour: number }> = {
  bog: { poolL: 10, refillLPerHour: 3 },
  damp: { poolL: 10, refillLPerHour: 1 },
};
/** Days without rain before the water table drops under a hand-dug hole; the fire's tinder count is too short for a water table. */
export const SEEP_DRY_DAYS = 14;
/** The walls slump in the thaw and the hole silts up: a year, then a re-dig. */
export const SEEP_LIFE_DAYS = 365;

/** The ground class a seep would have here, or null where none can be dug: dry ground, rock, fell, water, or a shore cell where the shore is the water. */
export function seepGround(world: World, cell: number): SeepClass | null {
  const c = cellAt(world, cell);
  if (c.terrain === "water" || c.terrain === "rock" || c.terrain === "fell" || c.terrain === "pine") return null;
  const nb = neighbours(world, cell).map((n) => cellAt(world, n).terrain);
  if (nb.includes("water")) return null;
  if (c.terrain === "bog") return "bog";
  if (c.terrain === "spruce") return "damp";
  if ((c.terrain === "meadow" || c.terrain === "birch") && nb.includes("bog")) return "damp";
  return null;
}

/** A fed fire burning on this very cell: the one thing that keeps a seep open in frost. */
function fireOnCell(state: GameState, world: World, cell: number): boolean {
  const st = state.regions[cellAt(world, cell).region];
  return !!st && st.campCell === cell && st.fire.lit && st.fire.fuelKg > 0;
}

/** Why a seep is not refilling right now, or null when it is. */
export function seepStopped(state: GameState, world: World, cell: number, ambient: number): "frozen" | "drought" | "silted" | null {
  const s = state.seeps[cell];
  if (!s) return null;
  if (state.minute - s.dug >= SEEP_LIFE_DAYS * 1440) return "silted";
  if (ambient < FREEZE_C && !fireOnCell(state, world, cell)) return "frozen";
  if (state.weather.dryDays >= SEEP_DRY_DAYS) return "drought";
  return null;
}

/** Past two thirds of its life the re-dig row shows, as a lean-to's re-roofing does. */
export function seepNeedsRedig(state: GameState, s: Seep): boolean {
  return state.minute - s.dug >= (SEEP_LIFE_DAYS * 1440 * 2) / 3;
}

/** Every seep's minute: refill, or freeze in place, or thaw by the fire or the spring air. */
export function stepSeeps(state: GameState, world: World, ambient: number, dt: number): void {
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    const s = state.seeps[cell];
    const why = seepStopped(state, world, cell, ambient);
    if (why === "frozen") {
      s.ice += s.litres;
      s.litres = 0;
      continue;
    }
    if (s.ice > 1e-9 && (ambient > 0 || fireOnCell(state, world, cell))) {
      const melt = Math.min(s.ice, (THAW_L_PER_HOUR / 60) * dt);
      s.ice -= melt;
      s.litres += melt;
    }
    if (why !== null) continue;
    const pool = SEEP[s.class].poolL;
    s.litres = Math.min(pool - s.ice, s.litres + (SEEP[s.class].refillLPerHour / 60) * dt);
  }
}

/** The nearest seep in the survivor's region passing pred, by straight line; null when none does. */
export function nearestSeep(state: GameState, world: World, from: number, pred: (s: Seep, cell: number) => boolean): number | null {
  const region = state.player.region;
  let best: number | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    if (cellAt(world, cell).region !== region || !pred(state.seeps[cell], cell)) continue;
    const km = straightKm(world, from, cell);
    if (km < bestKm) { bestKm = km; best = cell; }
  }
  return best;
}
```

`straightKm` and `cellOf` come from `./position` (check `straightKm` is exported there; `body.ts` uses it). Drop the unused `cellOf` and `regionState` imports if they are not needed.

In `src/sim/types.ts`, beside `RegionState`:

```ts
/** Where a seep's water comes from: saturated peat, or damp ground. */
export type SeepClass = "bog" | "damp";
/** A seep dug on a cell: its ground, the liquid and frozen litres in it (at most the pool between them), and the minute it was last dug. */
export interface Seep { class: SeepClass; litres: number; ice: number; dug: number }
```

and in `GameState`, after `piles`:

```ts
  /** Seeps by the cell they are dug on. */
  seeps: Record<number, Seep>;
```

In `src/sim/newgame.ts`, in the `state` literal after `piles: {},` add `seeps: {},`.

In `src/sim/save.ts`, `fillDefaults`, add `state.seeps ??= {};` beside the `state.player.known ??= {};` line.

In `src/sim/advance.ts`, import `stepSeeps` from `./seep` and call it right after `stepCamp(state, world, ambient, dt, who);`:

```ts
  stepSeeps(state, world, ambient, dt);
```

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/seep.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. Fix any import path or a `straightKm` not exported (export it from `position.ts` if so).

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/seep.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/advance.ts 08-survidle/tests/seep.test.ts
git commit -m "feat(survidle): a seep is a per-cell pool on wet ground that refills at the ground's rate, freezes without a fire on its cell, stops in a dry spell and silts up in a year"
```

---

### Task 7: Drinking and filling draw what a source holds, and the seep row

**Files:**
- Modify: `src/sim/water.ts` (`sourceLitres`, `drawSource`, `waterSource`, `drink`, `fillVessels`)
- Modify: `src/sim/tasks.ts` (the `seep` branch of `case "fill"`)
- Modify: `src/sim/intent.ts` (`resolveCell` for `fill seep`)
- Test: `tests/seep.test.ts`, `tests/fill.test.ts`

**Interfaces:**
- Produces: `sourceLitres(state, world, cell?): number` (Infinity at open water or an open hole, the seep's liquid litres on its cell, else 0); `waterSource` is `sourceLitres > 0`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/seep.test.ts`:

```ts
describe("drinking from a seep", () => {
  it("a drink takes the pool and no more, and a fill leaves with what the pool had", () => {
    const g = newGame(17);
    const { state, world } = g;
    const cell = findCell(world, (t, nb) => t === "bog" && !nb.includes("water"));
    state.seeps[cell] = { class: "bog", litres: 2, ice: 0, dug: state.minute };
    placeAt(state, world, cell);
    state.player.water = 0.5;
    expect(sourceLitres(state, world)).toBe(2);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBeCloseTo(2.5, 5);
    expect(state.seeps[cell].litres).toBe(0);
    state.seeps[cell].litres = 2;
    state.player.tools.push(freshTool("waterskin"));
    expect(fillVessels(state, world)).toBeCloseTo(2, 5);
    expect(state.seeps[cell].litres).toBe(0);
    expect(waterSource(state, world)).toBe(false);
  });

  it("the seep row goes to the nearest seep that holds water, and is greyed with why when none does", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.player.tools.push(freshTool("barkBucket"));
    expect(check(state, world, cal, "fill", "seep").why).toBe("no seep dug");
    const cell = findCell(world, (t, nb) => t === "bog" && !nb.includes("water"));
    state.seeps[cell] = { class: "bog", litres: 0, ice: 0, dug: state.minute };
    expect(resolveCell(state, world, cal, "fill", "seep", "nearest").cell).toBe(cell);
    expect(check(state, world, cal, "fill", "seep", cell).why).toBe("the seep is empty");
    state.seeps[cell].ice = 3;
    expect(check(state, world, cal, "fill", "seep", cell).why).toBe("the seep is frozen");
    state.seeps[cell].ice = 0;
    state.seeps[cell].litres = 5;
    const o = check(state, world, cal, "fill", "seep", cell);
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Fetch water from the seep");
  });
});
```

Add imports: `calendar` from `../src/sim/calendar` (`const cal = calendar(0);`), `freshTool` from `../src/sim/inventory`, `resolveCell` from `../src/sim/intent`, `check` from `../src/sim/tasks`, `drink, fillVessels, sourceLitres, waterSource` from `../src/sim/water`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/seep.test.ts -t "drinking"`
Expected: FAIL, `sourceLitres` is not exported.

- [ ] **Step 3: One reading of what a source holds**

In `src/sim/water.ts`, replace `waterSource` with:

```ts
/** Litres a source under foot could give: endless at open water or an open ice hole, the seep's liquid pool on its cell, nothing elsewhere. */
export function sourceLitres(state: GameState, world: World, cell = cellOf(state, world)): number {
  if (watersideCell(world, cell) && (state.weather.iceCm < ICE_SHORE_CM || iceHoleOpen(state, cell))) return Number.POSITIVE_INFINITY;
  const s = state.seeps[cell];
  return s ? s.litres : 0;
}

/** Water under foot to drink from or fill at. */
export function waterSource(state: GameState, world: World): boolean {
  return sourceLitres(state, world) > 1e-9;
}

/** Takes litres out of the source under foot; open water is not counted down. */
function drawSource(state: GameState, world: World, litres: number): void {
  const s = state.seeps[cellOf(state, world)];
  if (s) s.litres = Math.max(0, s.litres - litres);
}
```

In `drink`, replace `if (want > 1e-9 && waterSource(state, world)) want = 0;` with:

```ts
  if (want > 1e-9) {
    const take = Math.min(want, sourceLitres(state, world));
    if (take > 1e-9) {
      drawSource(state, world, take);
      want -= take;
    }
  }
```

In `fillVessels`, replace the body with:

```ts
export function fillVessels(state: GameState, world: World): number {
  let avail = sourceLitres(state, world);
  if (avail <= 1e-9) return 0;
  let added = 0;
  for (const t of state.player.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    const put = Math.min(holds - (t.litres ?? 0), avail);
    if (put <= 1e-9) continue;
    t.litres = (t.litres ?? 0) + put;
    t.frozen = false;
    added += put;
    avail -= put;
  }
  drawSource(state, world, added);
  return added;
}
```

(A frozen vessel at a source used to be thawed by the fill; keep `t.frozen = false` only when something was put in, as above, since an empty frozen vessel gets water put in and is thereby not frozen.)

- [ ] **Step 4: The seep row**

In `src/sim/tasks.ts`, `case "fill"`, replace `if (method === "seep") return { ...base, ok: false, why: "no seep dug" };` with:

```ts
      if (method === "seep") {
        if (holds <= 0) return { ...base, ok: false, why: "needs a vessel" };
        const s = state.seeps[at];
        if (!s) return { ...base, ok: false, why: Object.keys(state.seeps).some((k) => cellAt(world, Number(k)).region === p.region) ? "walk to the seep" : "no seep dug" };
        if (vesselLitresCapacity(p) > 0 && vesselLitres(p) >= vesselLitresCapacity(p) - 1e-9) {
          const homeSt = regionState(state, world, p.region);
          const why = campWaterRoom(pile(state, homeSt.campCell), homeSt) > 0 ? "the vessels are full" : "camp is full";
          return { ...base, ok: false, why };
        }
        if (s.litres <= 1e-9) return { ...base, ok: false, why: s.ice > 1e-9 ? "the seep is frozen" : "the seep is empty" };
        const v = tripVessel(state, world);
        const litres = Math.min(tripLitres(state, world), s.litres);
        return { ...base, detail: `${litres.toFixed(1)} l${v ? `, the ${TOOLS[v.id].name}` : ""}, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l in the seep` };
      }
```

Import `SEEP` from `./seep`.

In `src/sim/intent.ts`, `resolveCell`, before `const ground = groundOf(task, arg);`:

```ts
  if (task === "fill" && arg === "seep") {
    // The nearest seep holding water; failing that the nearest seep, whose row says why it is shut.
    const withWater = nearestSeep(state, world, here, (s) => s.litres > 1e-9);
    const any = withWater ?? nearestSeep(state, world, here, () => true);
    return { cell: any ?? here, note: "" };
  }
```

Import `nearestSeep` from `./seep`. `groundOf("fill", "seep")` must return null rather than `"shore"`: in `groundOf`, add before the `GROUND_OF` lookup:

```ts
  if (task === "fill" && arg === "seep") return null;
```

- [ ] **Step 5: Run the tests and the suite**

Run: `npx vitest run tests/seep.test.ts tests/fill.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. `tests/needs.test.ts` and `tests/body.test.ts` still pass since `waterSource` reads the same at the shore.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/water.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/tests/seep.test.ts
git commit -m "feat(survidle): a drink or a fill draws what the source holds - endless at the shore, the pool at a seep - and fetch water from the seep goes to the nearest seep with water in it"
```

---

### Task 8: Dig a seep, re-dig it, mark it, and its capability row

**Files:**
- Modify: `src/sim/types.ts` (`StructureId` gains `"seep"`)
- Modify: `src/sim/items.ts` (`STRUCTURES.seep`)
- Modify: `src/sim/tasks.ts` (`case "build"` and `case "mend"` in `checkFresh`; `case "build"` and `case "mend"` in `complete`; `availableTasks`)
- Modify: `src/sim/intent.ts` (`resolveCell` for `build seep`)
- Modify: `src/sim/capabilities.ts`, `src/ui/map.ts`, `src/style.css`
- Test: `tests/seep.test.ts`, `tests/capabilities.test.ts` (runs as is)

**Interfaces:**
- Produces: `check(state, world, cal, "build", "seep")`, `check(state, world, cal, "mend", "seep")`, `MARKS.seep`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/seep.test.ts`:

```ts
describe("digging a seep", () => {
  function ready(seed = 17) {
    const g = newGame(seed);
    const { state, world } = g;
    const cell = findCell(world, (t, nb) => t === "bog" && !nb.includes("water"));
    placeAt(state, world, cell);
    state.player.tools.push(freshTool("barkBucket"));
    addItem(state.player.pack, "stick", 4);
    return { ...g, cell };
  }

  it("is legal on wet ground with sticks and a bucket, refused on dry ground, on a shore, and where one stands", () => {
    const { state, world, cell } = ready();
    const o = check(state, world, cal, "build", "seep");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Dig a seep");
    expect(o.detail).toMatch(/10 l pool, \+3 l\/h/);
    const pine = findCell(world, (t, nb) => t === "pine" && !nb.includes("water"));
    expect(check(state, world, cal, "build", "seep", pine).why).toBe("dry ground");
    const shore = findCell(world, (t, nb) => t !== "water" && nb.includes("water"));
    expect(check(state, world, cal, "build", "seep", shore).why).toBe("the shore is here");
    state.seeps[cell] = { class: "bog", litres: 0, ice: 0, dug: 0 };
    expect(check(state, world, cal, "build", "seep").why).toBe("a seep is here already");
  });

  it("four hours of digging leave a seep on the cell with an empty pool, and a second one on the next bog cell is its own", () => {
    const { state, world, cell } = ready();
    expect(startTask(state, world, cal, "build", "seep")).toBe(true);
    expect(state.task?.duration).toBe(240);
    advance(state, world, 240);
    expect(state.seeps[cell]).toMatchObject({ class: "bog", ice: 0 });
    expect(state.seeps[cell].litres).toBeLessThan(1);
    expect(qty(state.player.pack, "stick")).toBe(0);
    const next = neighbours(world, cell).find((n) => seepGround(world, n) !== null && !state.seeps[n]);
    if (next !== undefined) {
      placeAt(state, world, next);
      addItem(state.player.pack, "stick", 4);
      expect(check(state, world, cal, "build", "seep").ok).toBe(true);
    }
  });

  it("the dig order walks to the nearest wet cell without a seep", () => {
    const { state, world, cell } = ready();
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    const target = resolveCell(state, world, cal, "build", "seep", "nearest").cell;
    expect(seepGround(world, target)).not.toBeNull();
    expect(state.seeps[target]).toBeUndefined();
    expect(cellAt(world, target).region).toBe(state.player.region);
    expect(cell).toBeDefined();
  });

  it("re-digging is offered on the seep's cell past two thirds of its life and resets its clock", () => {
    const { state, world, cell } = ready();
    state.seeps[cell] = { class: "bog", litres: 3, ice: 0, dug: 0 };
    expect(check(state, world, cal, "mend", "seep").why).toBe("holds well enough");
    state.minute = SEEP_LIFE_DAYS * 1440;
    const o = check(state, world, cal, "mend", "seep");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Re-dig the seep");
    startTask(state, world, cal, "mend", "seep");
    advance(state, world, 60);
    expect(state.seeps[cell].dug).toBeGreaterThanOrEqual(SEEP_LIFE_DAYS * 1440);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    expect(check(state, world, cal, "mend", "seep").why).toBe("no seep here");
  });

  it("is marked on the map and has a producer row", () => {
    expect(MARKS.seep).toEqual({ glyph: "s", cls: "mk-seep", label: "seep" });
    expect(PRODUCERS).toContain("seep");
  });
});
```

Add imports: `addItem, qty` from `../src/sim/inventory`, `startTask` from `../src/sim/tasks`, `MARKS` from `../src/ui/map`, `PRODUCERS` from `../src/sim/capabilities`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/seep.test.ts -t "digging"`
Expected: FAIL, `build seep` has no definition.

- [ ] **Step 3: The structure, the dig, the re-dig**

In `src/sim/types.ts`: `export type StructureId = "firePit" | "leanTo" | "cabin" | "dryingRack" | "snare" | "boughBed" | "turfHut" | "waterStore" | "seep";`

In `src/sim/items.ts`, `STRUCTURES`, add:

```ts
  seep: { name: "seep", needs: [{ item: "stick", qty: 4 }], minutes: 240, desc: "A knee-deep hole to groundwater on wet ground. Fills on its own; freezes without a fire beside it." },
```

In `src/sim/tasks.ts`, `case "build"` in `checkFresh`, after `const o = opt(...)` and the snare branch, add before `if (!camp) return ...`:

```ts
      if (sid === "seep") {
        const cls = seepGround(world, at);
        const o2 = { ...o, label: "Dig a seep", detail: cls
          ? `4 sticks and a bucket to bail; ${SEEP[cls].poolL} l pool, +${SEEP[cls].refillLPerHour} l/h`
          : "wet ground only: bog, spruce, or meadow and birch beside a bog" };
        if (!cls) return { ...o2, ok: false, why: watersideCell(world, at) ? "the shore is here" : "dry ground" };
        if (state.seeps[at]) return { ...o2, ok: false, why: "a seep is here already" };
        if (vesselLitresCapacity(p) <= 0 && !kitInReach(state, world, "barkBucket", invs) && !kitInReach(state, world, "waterskin", invs)) return { ...o2, ok: false, why: "needs a vessel to bail with" };
        if (done > 0) return { ...o2, detail: `${Math.round((done / def.minutes) * 100)}% dug` };
        if (!canConsume(invs, def.needs)) return { ...o2, ok: false, why: "needs 4 sticks" };
        return o2;
      }
```

`case "mend"` in `checkFresh`: add at the top of the case, before `const sid = arg as DecayingId;`:

```ts
      if (arg === "seep") {
        const o = opt({ group: "camp", label: "Re-dig the seep", detail: "an hour with the bucket; another year", duration: 60 });
        const s = state.seeps[at];
        if (!s) return { ...o, ok: false, why: "no seep here" };
        if (!seepNeedsRedig(state, s)) return { ...o, ok: false, why: "holds well enough" };
        return o;
      }
```

In `complete`, `case "build"`: add a branch for the seep before the `else`:

```ts
      if (sid === "snare") {
        ...unchanged
      } else if (sid === "seep") {
        const here = cellOf(state, world);
        state.seeps[here] = { class: seepGround(world, here)!, litres: 0, ice: 0, dug: state.minute };
        delete st.build[sid];
      } else {
        ...unchanged
      }
```

and change the log line's word for a seep: `log(state, `The ${STRUCTURES[sid].name} is ${sid === "snare" ? "set" : sid === "seep" ? "dug" : "finished"}.`, "good");`.

In `complete`, `case "mend"`: add at the top:

```ts
      if (arg === "seep") {
        const s = state.seeps[cellOf(state, world)];
        if (s) s.dug = state.minute;
        log(state, "You dig the seep out again.", "good");
        return;
      }
```

In `availableTasks`: after the `DECAYING` mend loop add `out.push(check(state, world, cal, "mend", "seep"));`.

Import `SEEP, seepGround, seepNeedsRedig` from `./seep`.

TypeScript: `st.structures[sid]` in the build check's `if (st.structures[sid]) return already built` and in the completion's else branch are reached only after the `snare` and `seep` returns, so `sid` is narrowed and the index still typechecks. `beginTask`'s material consumption and `st.build[sid] = 0.001` work for the seep as for any structure. The `mend` row in `Do` comes through `availableTasks`; `intentGroups` does not list mends, which matches the decaying structures today.

In `src/sim/intent.ts`, `resolveCell`, next to the `setTrap` special case:

```ts
  if (task === "build" && arg === "seep") {
    // The nearest wet cell with no seep on it, by straight line then a route check.
    const r0 = regionAt(world, state.player.region);
    const cells = r0.cells
      .filter((c) => seepGround(world, c) !== null && !state.seeps[c])
      .sort((a, b) => straightKm(world, here, a) - straightKm(world, here, b));
    for (const c of cells.slice(0, 8)) if (findRoute(world, here, c)) return { cell: c, note: "" };
    return { cell: here, note: "" };
  }
```

Import `seepGround` from `./seep`, `straightKm` from `./position`, `findRoute` from `../world/route`. Also make `groundOf("build", "seep")` return null (the `GROUND_OF` table has no build entry, and the snare line returns "heath" only for the snare, so this already holds; add a test line if in doubt).

In `src/sim/capabilities.ts`: `PRODUCERS` gains `"seep"`, and `CAPABILITIES` gains, after the water trough row:

```ts
  {
    id: "seep",
    keys: ["build:seep"],
    tier: "structure",
    receives: ["woodcraft"],
    producer: true,
    gives: "water that comes on its own: a pool at a bog or in damp forest, for a camp with no shore",
    limits: "the ground's litres an hour, frost without a fire on its cell, a dry fortnight, a re-dig each year",
  },
```

Check the `CapabilityRow` type's `tier` accepts `"structure"` (the fire pit row uses it).

In `src/ui/map.ts`, `MARKS` gains `seep: { glyph: "s", cls: "mk-seep", label: "seep" },` and the placement loop, after the trap loop:

```ts
  for (const k of Object.keys(state.seeps)) {
    const g = toGlyph(Number(k));
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.seep);
  }
```

In `src/style.css`, beside the trap lines:

```css
.grid .c.mk-seep { color: #0c0f14; background: #6fa8dc; }
#map .legend b.mk-seep { color: #6fa8dc; }
```

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/seep.test.ts tests/capabilities.test.ts tests/skills.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. `skills.ts` line 28 builds the building skill's practice list from `STRUCTURE_IDS`, so `build:seep` trains building without a change. If `tests/ui.test.ts` or `tests/siting.test.ts` count map marks or legend entries, update the count.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/capabilities.ts 08-survidle/src/ui/map.ts 08-survidle/src/style.css 08-survidle/tests/seep.test.ts
git commit -m "feat(survidle): dig a seep on wet ground - four hours, four sticks and a bucket to bail - re-dig it once a year, and see it on the map"
```

---

### Task 9: The thirsty step ranks sources by what they hold and waits at a seep

**Files:**
- Modify: `src/sim/body.ts` (`canQuench`, `thirstyStep`, a new `waterOptions`)
- Test: `tests/needs.test.ts`

**Interfaces:**
- Consumes: `sourceLitres`, `nearestSeep`, `SEEP` from Task 6 and 7.

- [ ] **Step 1: Write the failing tests**

Append to `tests/needs.test.ts` (inside the describe that holds the thirst tests; use its `felling()` helper and `until`):

```ts
  it("thirsty with an empty seep near and an open shore farther walks to the shore", () => {
    const { g, state, world } = felling();
    const p = state.player;
    const here = cellOf(state, world);
    const seepCell = neighbours(world, here).find((n) => seepGround(world, n) !== null) ?? null;
    if (seepCell === null) return;
    state.seeps[seepCell] = { class: "bog", litres: 0, ice: 0, dug: state.minute };
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    advance(state, world, 1);
    expect(state.route?.target).not.toBe(seepCell);
  });

  it("thirsty with a full seep near and the shore iced with no axe walks to the seep and drinks", () => {
    const { g, state, world } = felling();
    const p = state.player;
    p.tools = p.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const here = cellOf(state, world);
    const seepCell = neighbours(world, here).find((n) => seepGround(world, n) !== null) ?? null;
    if (seepCell === null) return;
    state.seeps[seepCell] = { class: "bog", litres: 5, ice: 0, dug: state.minute };
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => p.water > 1, 120)).toBe(true);
    expect(state.seeps[seepCell].litres).toBeLessThan(5);
  });

  it("thirsty with only a trickling seep waits beside it, drinking as it fills", () => {
    const { g, state, world } = felling();
    const p = state.player;
    p.tools = p.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const here = cellOf(state, world);
    const seepCell = neighbours(world, here).find((n) => seepGround(world, n) !== null) ?? null;
    if (seepCell === null) return;
    state.seeps[seepCell] = { class: "bog", litres: 0.2, ice: 0, dug: state.minute };
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => state.intent?.step === "waiting at the seep", 60)).toBe(true);
    expect(until(g, () => p.water > 1, 240)).toBe(true);
  });
```

Import `seepGround` from `../src/sim/seep`, `neighbours` from `../src/world/gen`, `cellOf` from `../src/sim/position`. The `if (seepCell === null) return;` guards keep the test honest on a seed whose felling cell has no wet neighbour; run once with a `console.log(seepCell)` to confirm seed 17's felling cell has one, and if it does not, pick the wet cell with `findCell` as in `tests/seep.test.ts` and `placeAt` the survivor beside it before setting thirst.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/needs.test.ts -t "seep"`
Expected: FAIL: no "waiting at the seep" step; the full-seep case may pass by accident through `drink` if the seep is under foot, which is why the seep is a neighbour.

- [ ] **Step 3: The ranking**

In `src/sim/body.ts`, replace `canQuench` and `thirstyStep` with:

```ts
/** A place to walk to for water and what a walk there would give: endless at the shore or an open hole, the pool at a seep, the pile's litres at camp. */
interface WaterOption { cell: number; litres: number; km: number; why: string }

/** Every source in reach of a walk, nearest first; the cell under foot is excluded, since drink() already tried it. */
function waterOptions(state: GameState, world: World, cal: Calendar): WaterOption[] {
  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  const out: WaterOption[] = [];
  const shore = shoreForWater(state, world, cal);
  if (shore !== null) out.push({ cell: shore, litres: Number.POSITIVE_INFINITY, km: straightKm(world, here, shore), why: " for water" });
  if (campWaterReady(state, world, cal) && st.campCell !== here) {
    out.push({ cell: st.campCell, litres: qty(pile(state, st.campCell), "water"), km: straightKm(world, here, st.campCell), why: " for water" });
  }
  const r = regionAt(world, state.player.region);
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    if (cell === here || cellAt(world, cell).region !== r.id) continue;
    if (!check(state, world, cal, "walk", `cell:${cell}`).ok) continue;
    out.push({ cell, litres: state.seeps[cell].litres, km: straightKm(world, here, cell), why: " for the seep" });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Whether thirst can actually be done anything about here and now; gates the need the way campCanWarm gates cold. */
function canQuench(state: GameState, world: World, cal: Calendar): boolean {
  return vesselLitres(state.player) > 0
    || waterSource(state, world)
    || waterOptions(state, world, cal).some((o) => o.litres > 1e-9)
    || iceHoleSite(state, world, cal) !== null
    || campMeltReady(state, world, cal)
    || Object.keys(state.seeps).some((k) => cellAt(world, Number(k)).region === state.player.region);
}

/**
 * Drink in reach; else the nearest source that would put the reserve back over
 * the thirsty line; else cut an ice hole; else wait at the fullest seep,
 * drinking as it fills; else melt snow at the fire, last because it burns the
 * woodpile. The body's own choice among sources, which an order never makes.
 */
function thirstyStep(state: GameState, world: World, cal: Calendar): Step | null {
  if (drink(state, world)) return null;
  const p = state.player;
  const here = cellOf(state, world);
  const need = Math.max(0.1, THIRSTY_L - p.water);
  const options = waterOptions(state, world, cal);
  const enough = options.find((o) => o.litres >= need);
  if (enough) return walkStep(state, world, enough.cell, enough.why);
  const site = iceHoleSite(state, world, cal);
  if (site !== null) {
    if (site !== here) return walkStep(state, world, site, " to open an ice hole");
    return { id: "iceHole", step: "opening an ice hole" };
  }
  const seepHere = state.seeps[here];
  if (seepHere && seepStopped(state, world, here, ambientTemperature(cal, state.weather)) !== "frozen") {
    return { id: "rest", step: "waiting at the seep" };
  }
  const seeps = options.filter((o) => o.why === " for the seep" && state.seeps[o.cell].ice <= 1e-9);
  if (seeps.length) {
    const fullest = seeps.reduce((a, b) => (b.litres > a.litres ? b : a));
    return walkStep(state, world, fullest.cell, " to wait at the seep");
  }
  const st = regionState(state, world, p.region);
  const atCamp = here === st.campCell;
  if (campMeltReady(state, world, cal)) {
    if (!atCamp) return walkStep(state, world, st.campCell, " for water");
    // The cold step's fire, for the same reason: no fire, no melt.
    const fs = fireStep(state, world, cal, st.campCell);
    if (fs) return fs;
    return { id: "melt", step: "melting snow" };
  }
  return null;
}
```

Imports: `straightKm` from `./position`, `seepStopped` from `./seep`, `ambientTemperature` from `./weather` (already imported), `cellAt` from `../world/gen`. Delete the old `campWaterReady` call order comment if it no longer reads true. `waitingStep` is a `rest`, which the ledger credits as idle, and auto-drink drinks from the seep under foot each minute the need holds.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/needs.test.ts tests/body.test.ts && npm test && npx tsc --noEmit`
Expected: PASS, including "thirsty at camp with the fire out and snow down: light the fire, then melt" (no seep, no shore: melt is still reached) and "thirsty away from camp with camp water at home walks home for it" (camp water is an option with enough litres).

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/tests/needs.test.ts
git commit -m "feat(survidle): a thirsty body goes to the nearest water that would satisfy it, a seep counted by its pool, and waits beside a trickling seep before it burns wood to melt snow"
```

---

### Task 10: The water line, the region's water list, and "seep possible" in the site report

**Files:**
- Modify: `src/sim/camp.ts` (`SiteReport`, `siteReport`, `siteLine`)
- Create: `src/ui/water.ts` (`waterLineHtml`, `waterListHtml`)
- Modify: `src/ui/panels.ts` (`regionHtml`: a `water` row in the Here section)
- Test: `tests/water-ui.test.ts` (new), `tests/siting.test.ts`

**Interfaces:**
- Produces: `waterLine(state, world, cal): string` (plain text), `waterList(state, world, cal): string` (plain text); the panels wrap them.

- [ ] **Step 1: Write the failing tests**

Create `tests/water-ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { siteLine, siteReport } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { seepGround } from "../src/sim/seep";
import { waterLine, waterList } from "../src/ui/water";
import { cellAt, neighbours, regionAt } from "../src/world/gen";

const cal = calendar(0);

function wetCell(world: ReturnType<typeof newGame>["world"]): number {
  const r = regionAt(world, world.start);
  const c = r.cells.find((c) => seepGround(world, c) !== null);
  if (c === undefined) throw new Error("no wet cell");
  return c;
}

describe("the water line", () => {
  it("reads the shore, the ice, the hole, the seep, wet ground and nothing", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    expect(waterLine(state, world, cal)).toBe("shore, endless");
    state.weather.iceCm = 10;
    expect(waterLine(state, world, cal)).toBe("iced over; an axe opens an ice hole");
    st.iceHole = { cell: st.campCell, minute: 0 };
    expect(waterLine(state, world, cal)).toBe("ice hole, open until morning");
    st.iceHole = null;
    state.weather.iceCm = 0;
    addItem(pile(state, st.campCell), "barkBucket", 2);
    addItem(pile(state, st.campCell), "water", 3);
    expect(waterLine(state, world, cal)).toBe("3.0 of 4.0 l at camp; shore, endless");
    const wet = wetCell(world);
    placeAt(state, world, wet);
    const cls = seepGround(world, wet)!;
    expect(waterLine(state, world, cal)).toBe(`none; a seep is possible here, 10 l, +${cls === "bog" ? 3 : 1} l/h`);
    state.seeps[wet] = { class: cls, litres: 6, ice: 0, dug: state.minute };
    expect(waterLine(state, world, cal)).toBe(`seep, 6.0 of 10 l, +${cls === "bog" ? 3 : 1} l/h`);
    state.weather.dryDays = 14;
    expect(waterLine(state, world, cal)).toBe("seep, 6.0 of 10 l, +0 l/h, drought");
    state.weather.dryDays = 0;
    state.seeps[wet].ice = 2;
    state.seeps[wet].litres = 4;
    expect(waterLine(state, world, cal)).toMatch(/^seep, 4\.0 of 10 l, \+\d l\/h, 2\.0 l frozen$/);
    const dry = regionAt(world, world.start).cells.find((c) => cellAt(world, c).terrain === "pine" && !neighbours(world, c).some((n) => cellAt(world, n).terrain === "water"));
    if (dry !== undefined) {
      placeAt(state, world, dry);
      expect(waterLine(state, world, cal)).toBe("none");
    }
  });

  it("the region's water list names the nearest of each kind with its walk, and says when there is none", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    expect(waterList(state, world, cal)).toMatch(/^shore \d+ min, endless$/);
    const wet = wetCell(world);
    state.seeps[wet] = { class: seepGround(world, wet)!, litres: 6, ice: 0, dug: state.minute };
    addItem(pile(state, st.campCell), "barkBucket", 1);
    addItem(pile(state, st.campCell), "water", 1.5);
    const list = waterList(state, world, cal);
    expect(list).toMatch(/shore \d+ min, endless/);
    expect(list).toMatch(/seep \d+ min, 6\.0 of 10 l/);
    expect(list).toMatch(/camp water 1\.5 l, \d+ min/);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    state.weather.snowCm = 10;
    expect(waterList(state, world, cal)).toMatch(/snow at the fire, 1 l per 15 min and 1 kg wood/);
  });

  it("the site report says when a seep is possible", () => {
    const { state, world } = newGame(17);
    const wet = wetCell(world);
    expect(siteLine(siteReport(state, world, wet))).toMatch(/, seep possible$/);
    const st = regionState(state, world, state.player.region);
    expect(siteLine(siteReport(state, world, st.campCell))).not.toMatch(/seep possible/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/water-ui.test.ts`
Expected: FAIL, module `src/ui/water` not found.

- [ ] **Step 3: The lines**

Create `src/ui/water.ts`:

```ts
/**
 * What the cell under foot offers to drink, and the region's water by kind:
 * the two readings that let a player weigh a shore against a seep against
 * a kilo of wood a litre. Plain text; panels.ts wraps it.
 */
import { regionAt, type World } from "../world/gen";
import type { Calendar } from "../sim/calendar";
import { fmtDuration } from "../units";
import { pile, qty } from "../sim/inventory";
import { baseWalkSpeed } from "../sim/player";
import { cellOf, watersideCell } from "../sim/position";
import { regionState } from "../sim/regionstate";
import { SEEP, seepGround, seepStopped } from "../sim/seep";
import type { GameState } from "../sim/types";
import { campWaterCapacity, ICE_SHORE_CM, iceHoleOpen } from "../sim/water";
import { ambientTemperature, walkableIce } from "../sim/weather";
import { findRoute, routeMinutes } from "../world/route";
import { check } from "../sim/tasks";

/** "+3 l/h", or "+0 l/h, frozen" and the like when the seep is stopped. */
function rateText(state: GameState, world: World, cell: number, cal: Calendar): string {
  const s = state.seeps[cell];
  const why = seepStopped(state, world, cell, ambientTemperature(cal, state.weather));
  return why ? `+0 l/h, ${why}` : `+${SEEP[s.class].refillLPerHour} l/h`;
}

function seepText(state: GameState, world: World, cell: number, cal: Calendar): string {
  const s = state.seeps[cell];
  const frozen = s.ice > 1e-9 ? `, ${s.ice.toFixed(1)} l frozen` : "";
  return `seep, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l, ${rateText(state, world, cell, cal)}${frozen}`;
}

/** The water line for the cell under foot: what is here, or "none" and whether a seep could be dug. */
export function waterLine(state: GameState, world: World, cal: Calendar): string {
  const cell = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  const parts: string[] = [];
  if (cell === st.campCell) {
    const camp = pile(state, st.campCell);
    const cap = campWaterCapacity(camp, st);
    if (cap > 0 || qty(camp, "water") > 1e-9) parts.push(`${qty(camp, "water").toFixed(1)} of ${cap.toFixed(1)} l at camp`);
  }
  if (watersideCell(world, cell)) {
    if (state.weather.iceCm < ICE_SHORE_CM) parts.push("shore, endless");
    else if (iceHoleOpen(state, cell)) parts.push("ice hole, open until morning");
    else parts.push("iced over; an axe opens an ice hole");
  } else if (state.seeps[cell]) {
    parts.push(seepText(state, world, cell, cal));
  } else {
    const cls = seepGround(world, cell);
    if (cls && parts.length === 0) parts.push(`none; a seep is possible here, ${SEEP[cls].poolL} l, +${SEEP[cls].refillLPerHour} l/h`);
    else if (cls) parts.push(`a seep is possible here, ${SEEP[cls].poolL} l, +${SEEP[cls].refillLPerHour} l/h`);
  }
  return parts.length ? parts.join("; ") : "none";
}

/** Minutes to walk from here to a cell over the ice a walk button would cross, or null with no way. */
function walkMinutes(state: GameState, world: World, cal: Calendar, to: number): number | null {
  const ice = walkableIce(state.weather);
  const route = findRoute(world, cellOf(state, world), to, ice);
  if (!route) return null;
  return Math.round(routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather), ice));
}

/** The nearest of each kind of water in the region from where the survivor stands, with its walk; "no water in this region" when there is none. */
export function waterList(state: GameState, world: World, cal: Calendar): string {
  const here = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const parts: string[] = [];
  const shores = r.cells.filter((c) => watersideCell(world, c));
  const nearestShore = shores.map((c) => ({ c, m: walkMinutes(state, world, cal, c) })).filter((x) => x.m !== null).sort((a, b) => a.m! - b.m!)[0];
  if (nearestShore) {
    if (state.weather.iceCm < ICE_SHORE_CM) parts.push(`shore ${nearestShore.m} min, endless`);
    else if (st.iceHole) parts.push(`ice hole ${walkMinutes(state, world, cal, st.iceHole.cell) ?? "?"} min, open until morning`);
    else parts.push(`shore ${nearestShore.m} min, iced over`);
  }
  const seeps = Object.keys(state.seeps).map(Number).filter((c) => regionAt(world, state.player.region).cells.includes(c))
    .map((c) => ({ c, m: walkMinutes(state, world, cal, c) })).filter((x) => x.m !== null).sort((a, b) => a.m! - b.m!)[0];
  if (seeps) {
    const s = state.seeps[seeps.c];
    parts.push(`seep ${seeps.m} min, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l`);
  }
  const campL = qty(pile(state, st.campCell), "water");
  if (campL > 1e-9) parts.push(`camp water ${campL.toFixed(1)} l, ${here === st.campCell ? 0 : (walkMinutes(state, world, cal, st.campCell) ?? "?")} min`);
  if (st.fire.lit && st.fire.fuelKg >= 1 && state.weather.snowCm >= 1) parts.push("snow at the fire, 1 l per 15 min and 1 kg wood");
  return parts.length ? parts.join("; ") : "no water in this region";
}
```

Drop the `check` and `fmtDuration` imports if unused. The melt line's numbers are the melt task's own (15 minutes, 1 kg, 1 litre); if `tasks.ts` names them as constants, read them from there rather than repeating.

In `src/sim/camp.ts`: `SiteReport` gains `seep: SeepClass | null`; `siteReport` sets `seep: seepGround(world, cell)`; `siteLine` appends `, seep possible` when `r.seep` is set:

```ts
export function siteLine(r: SiteReport): string {
  const parts = r.spots.map((s) => (s.minutes === null ? `${s.id} no way` : `${s.id} ${s.minutes}`));
  return `${parts.join(", ")} min${r.seep ? ", seep possible" : ""}`;
}
```

Import `seepGround` and `SeepClass`. In `tests/siting.test.ts`, the `siteLine` test builds a `SiteReport` literal: add `seep: null` to it.

In `src/ui/panels.ts`, `regionHtml`, add after the `places` row of the `<dl>` when `here`:

```ts
${here ? `<dt>water</dt><dd>${esc(waterLine(state, world, cal))}<br><small>${esc(waterList(state, world, cal))}</small></dd>` : ""}
```

Import `waterLine, waterList` from `./water`.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/water-ui.test.ts tests/siting.test.ts tests/ui.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. Check `src/ui/water.ts` imports cause no cycle (`tasks.ts` is not imported there once `check` is dropped).

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/water.ts 08-survidle/src/ui/panels.ts 08-survidle/src/sim/camp.ts 08-survidle/tests/water-ui.test.ts 08-survidle/tests/siting.test.ts
git commit -m "feat(survidle): the Here section says what the cell under foot has to drink and how fast it comes back, lists the region's water by kind with its walk, and the site report says when a seep is possible"
```

---

### Task 11: The fire rows split: the pit fire, and the fire indoors

**Files:**
- Modify: `src/sim/tasks.ts` (`case "light"` and `case "lightIndoors"` in `checkFresh`; the shared completion)
- Modify: `src/sim/body.ts` (`fireStep`)
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, `wantOpen`)
- Modify: `src/sim/orders.ts` (lines 58, 84, 101), `src/sim/ladder.ts` (line 32), `src/ui/dopanel.ts` (line 90)
- Test: `tests/fire.test.ts`, `tests/reference.test.ts`

**Interfaces:**
- Produces: `light` never sets `fire.indoors`; `lightIndoors` is legal in a hut or a cabin, with or without a hearth; `keep("lightIndoors", 1)` in the list, opened by `wantOpen` once a hut or a hearth stands.

- [ ] **Step 1: Rewrite the fire tests**

In `tests/fire.test.ts`, in the test "a cabin with a hearth burns 0.8 kg an hour ...": replace the two lines

```ts
    expect(check(state, world, cal, "lightIndoors").ok).toBe(false);
    startTask(state, world, cal, "light");
```

with

```ts
    expect(check(state, world, cal, "lightIndoors").detail).toBe("at the hearth");
    startTask(state, world, cal, "lightIndoors");
```

and its comment to "The fire indoors is the row that lays a cabin's hearth fire; the plain light is the pit outside." Rename the test to "a cabin with a hearth burns 0.8 kg an hour and holds the room at 10 C, with the fire indoors laying the hearth fire".

Replace the test "lighting the fire with a hut standing puts it under the smoke hole" with:

```ts
  it("the plain light is the pit fire even with a hut standing; the fire indoors goes under the smoke hole", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.turfHut = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 10);
    expect(check(state, world, cal, "light").detail).not.toMatch(/smoke hole/);
    startTask(state, world, cal, "light");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(false);
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    expect(check(state, world, cal, "lightIndoors").detail).toBe("under the smoke hole");
    startTask(state, world, cal, "lightIndoors");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(true);
  });
```

Append to `tests/reference.test.ts`:

```ts
  it("keeps the pit fire lit until a hut or a hearth stands, then the fire indoors", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const pit = REFERENCE_ORDERS.find((w) => w.req.task === "light")!;
    const indoors = REFERENCE_ORDERS.find((w) => w.req.task === "lightIndoors")!;
    expect(pit.kind).toBe("keep");
    expect(indoors.kind).toBe("keep");
    const cal = calendar(0, 90);
    expect(wantOpen(state, world, pit, cal)).toBe(true);
    expect(wantOpen(state, world, indoors, cal)).toBe(false);
    st.structures.turfHut = true;
    expect(wantOpen(state, world, pit, cal)).toBe(false);
    expect(wantOpen(state, world, indoors, cal)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/fire.test.ts tests/reference.test.ts`
Expected: FAIL on `fire.indoors` after the plain light with a hut, and on the missing `lightIndoors` want.

- [ ] **Step 3: The split**

In `src/sim/tasks.ts`, `case "light"`: delete the line `if (st.structures.turfHut && !st.structures.cabin) return { ...o, detail: `${o.detail}; under the smoke hole` };` and change the label to `"Light the fire at the pit"` with detail unchanged.

`case "lightIndoors"`: replace the detail expression and the hearth refusal:

```ts
      const o = needCamp(opt({
        group: "camp", label: "Light a fire indoors",
        detail: st.structures.cabin && st.structures.hearth ? "at the hearth" : st.structures.turfHut && !st.structures.cabin ? "under the smoke hole" : "no smoke hole: the cabin will fill with smoke",
        duration: 10,
      }));
      if (!o.ok) return o;
      if (!st.structures.cabin && !st.structures.turfHut) return { ...o, ok: false, why: "needs a cabin or a turf hut" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
```

(the `there is a hearth: light it there` line is gone.)

In `complete`, the shared `case "light": case "lightIndoors":` block: replace the `st.fire.indoors = ...` line and its comment with:

```ts
      // The row names the method: the pit fire is outdoors whatever stands, the fire indoors is indoors.
      st.fire.indoors = id === "lightIndoors";
```

In `src/sim/body.ts`, `fireStep`: before the `light` check add

```ts
  if (check(state, world, cal, "lightIndoors", undefined, at).ok) return { id: "lightIndoors", step: "lighting the fire indoors" };
```

This is the body's reflex and may choose; a cabin with no hearth is still `lightIndoors`-legal with its smoke warning, so guard it: only prefer indoors when `st.structures.turfHut || st.structures.hearth`.

In `src/sim/reference.ts`: after `keep("light", 1),` add `keep("lightIndoors", 1),`; in `wantOpen`:

```ts
  // The fire by method: the pit until a hut or a hearth stands, the fire indoors after.
  if (w.req.task === "light" || w.req.task === "lightIndoors") {
    const st = regionState(state, world, state.player.region);
    const indoors = st.structures.turfHut || (st.structures.cabin && st.structures.hearth);
    return w.req.task === "lightIndoors" ? indoors : !indoors;
  }
```

Then every `task === "light"` special case that means "the keep it lit keep" extends to `lightIndoors`: `src/sim/orders.ts` line 58 (`keepTarget`), line 84 (`orderMet`'s `return st.fire.lit`), line 101 (the sentence "keep it lit"); `src/sim/ladder.ts` line 32 (`lightKeep`); `src/ui/dopanel.ts` line 90 (`kindLabel`'s "keep it lit"). Write each as `(task === "light" || task === "lightIndoors")`.

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run tests/fire.test.ts tests/reference.test.ts tests/orders.test.ts tests/ladder.test.ts && npm test && npx tsc --noEmit`
Expected: PASS. `tests/needs.test.ts` "thirsty at camp with the fire out and snow down" lights the pit (no hut) and still passes.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/reference.ts 08-survidle/src/sim/orders.ts 08-survidle/src/sim/ladder.ts 08-survidle/src/ui/dopanel.ts 08-survidle/tests/fire.test.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): the pit fire and the fire indoors are two rows - the plain light never goes indoors on its own, and the reference list keeps the indoors fire once a hut or a hearth stands"
```

---

### Task 12: The browser pass

**Files:**
- No code unless the pass finds something; a fix goes in its own commit with a test.

- [ ] **Step 1: Start the dev server**

Run from `08-survidle/`: `npm run dev` (background). Open `http://127.0.0.1:5173/prototypes/08/?seed=17` in Chrome via DevTools MCP at 1440 wide. Note the survidle gotcha: `?seed=` restarts on reload, and the pagehide save overwrites a backdated save.

- [ ] **Step 2: Walk the spec's section 7**

- The survivor starts on a shore; the Here section's water row reads "shore, endless".
- Do > Camp shows "Fetch water from the shore", "Cut an ice hole and fetch water" (greyed "the shore is open, no hole needed") and "Fetch water from the seep" (greyed "no seep dug"). Craft a bark bucket or use the kit; click the shore row; the camp reading rises after the trip.
- Walk to a bog cell (the map's `"` glyph, or the region's places); the water row reads "none; a seep is possible here, 10 l, +3 l/h". Gather 4 sticks, dig the seep; the `s` mark shows on the map with a legend entry; the water row shows the pool filling.
- Click "drink" there; the pool drops. Dig a second seep on the next bog cell; it has its own mark. Digging on the first cell again is refused with "a seep is here already".
- Set the season to winter if the dial allows, or use the away dial to reach December: the shore row greys "iced over", the hole row is offered with the axe wear in its small print, and the water row reads "iced over; an axe opens an ice hole". With a hut standing, "Light the fire at the pit" and "Light a fire indoors" both show.

- [ ] **Step 3: Record**

Write what was seen into the roadmap paragraph of Task 13 (three sentences, what read what). Stop the dev server.

---

### Task 13: Roadmap edits and the spec's record

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`
- Modify: `docs/superpowers/specs/2026-09-05-survidle-water-design.md` (a "Built" paragraph at the end of each section, in the siting spec's style)

- [ ] **Step 1: The ruling**

In the roadmap's "Rules that hold across all eight" section, after the bullet "Intents never plan around a new threat on the player's behalf; they carry it out and report. The player prepares, or does not." add:

```
- An order names one method. The Do panel is the list of methods, and
  the choice between them is the player's or the reference list's, made
  in the open where a test reads it, never a fallback inside the intent
  runner. "Hunt anything" and "fish anything" are the two exceptions,
  since what comes past is not chosen; the body's own needs may choose
  among sources, since they are reflexes and not orders; a delivery leg
  is not a method. A row may be collapsed again only when play shows
  the split is a chore, and this document records the decision. The
  water spec (`2026-09-05-survidle-water-design.md`, section 0) is where
  the rule was written, on the fill row that had three methods behind
  one button.
```

- [ ] **Step 2: The build order**

In the build-order paragraph (around line 289, "then the winter loop, three runner and list rules ..."), insert before "then the winter loop":

```
then water (`2026-09-05-survidle-water-design.md`, plan
`2026-09-06-survidle-water.md`: the first camp on the shore it lands on,
fetch water by a named method with the year loop's melt fallback taken
out in favour of the list's own winter wants, the seep as a per-cell
producer on wet ground, the water line, and the pit fire and the fire
indoors as two rows; built, readings under F), placed here because the
tables audit's opening flag, winter thirst at a camp holding an axe, was
read at a camp 25 to 55 minutes from its water,
```

- [ ] **Step 3: Item notes**

- Item 2 (Rivers), at the end of its "Water" bullet: "Springs belong here too when they land: a point where groundwater comes out on its own at the foot of a slope, placed from the moisture and elevation fields, running water that never freezes, and a third owner of winter water beside the ice hole and camp storage, which is why they wait."
- Item 3 (Camp build-out), after the "Built." paragraph of siting: a "**The seep.** Built in the water spec ..." paragraph of three or four sentences: per cell on wet ground, its table by class, what stops it, the re-dig, and that the runner's thirsty step counts it by its pool.
- Item 5, the line "Water is not treated. Drinking from a lake carries no risk; boiling it (hot stones in a bark bucket) is a disease rule for 5." add: "A seep's water is the water that rule would apply to first: turbid, tannin-stained on a bog."
- The UI pass section: a note "The keep order's default litres should follow camp capacity once a trough stands; today's 4 litre default is a bucket's worth."
- The idle-loop paragraph that names thirst first (around line 244, "water at camp, the thirst priority"): add "and, for a camp with no shore, the seep".

- [ ] **Step 4: The "Measured with the landing camp" paragraph**

Under the F section, right after the year loop's "Measured with the year loop" paragraphs, add a paragraph headed the same way, to be filled by Task 14's numbers. Leave the sentence frame in place now:

```
Measured with the landing camp (`2026-09-05-survidle-water-design.md`,
built 2026-09-06 on main, head <sha>). The same six runs as the year
loop's closing set, on the same four seeds: ...
```

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the roadmap carries the one-method ruling, places the water work before the winter loop, and notes springs, the seep, boiling and the keep's default litres where they belong"
```

---

### Task 14: The re-measure

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the paragraph from Task 13)
- Modify: `docs/superpowers/specs/2026-09-05-survidle-water-design.md` (a "Measured" paragraph under section 6)

- [ ] **Step 1: Run the six probes, in the background, one at a time**

From `08-survidle/`, each with a 15 minute timeout, output to the scratchpad:

```bash
npm run reference > /tmp/ref.txt 2>&1
npm run horizon > /tmp/horizon.txt 2>&1
npm run year > /tmp/year20.txt 2>&1
npm run year -- --level=10 > /tmp/year10.txt 2>&1
npm run year -- --fresh > /tmp/yearfresh.txt 2>&1
npm run year -- --winter > /tmp/winter.txt 2>&1
```

(Use the session scratchpad directory rather than `/tmp`.) The reference and horizon runs take minutes each; the year runs longer.

- [ ] **Step 2: Read the numbers beside the year loop's closing set**

The "before" (year loop at 9deac2c): April gate 4 of 4 at day 26, then starving on days 52, 55, 39, 46; heir trend 2 of 4; year gate 0 of 4 at level 20 (68 starved, 245 froze, 218, 229 starved), at level 10 (82, 214 thirst, 177, 102), fresh (52, 55, 39, 46); winter gate 0 of 4 (23 and 34 thirst, 6 and 8 froze).

Write the "after" under the same gate names: the day and the cause per seed, and each gate's count. Name what moved and what did not. A thirst death that stays in the winter gate is the indoor 1.3 factor's reading and is flagged for the tables audit as such. A gate that got harder is a finding: write it, do not bend a number.

- [ ] **Step 3: Record**

Fill the roadmap paragraph from Task 13 with the readings and the browser pass's three sentences, and add a "Measured." paragraph under the spec's section 6 pointing at it. Update the spec's "Curve" expectation sentence if the reading contradicts it, saying so plainly.

- [ ] **Step 4: Run the suite once more and commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/superpowers/specs/2026-09-05-survidle-water-design.md
git commit -m "docs(survidle): the water work as built and measured - the six probe runs beside the year loop's, what the landing camp moved, and what it did not"
```

---

## Self-review

**Spec coverage.** Section 0 (the rule): Task 2 removes the fallback, Task 13 writes the ruling. Section 1: Task 1. Section 2: Tasks 2, 3, 4, 5. Section 3: Tasks 6, 7, 8, 9 (ground, task, state, refill, drinking, runner, upkeep, map, capability, the seep row). Section 4: Task 10. Section 4b: Task 11. Section 5's test list: each bullet has a test in Tasks 1 to 11; the "reference: wantOpen ..." bullet is Tasks 4 and 11; "save: an old save without seeps" is Task 6. Section 6: Task 14. Section 7: Task 12. Section 8: Task 13. Section 9 stays out.

**Placeholders.** Task 13 step 4 deliberately leaves `<sha>` and `...` in a sentence frame that Task 14 fills; every other step carries its content.

**Type consistency.** `FillMethod` and `FILL_METHODS` (Task 2) are used by Tasks 5 and 7. `Seep`, `SeepClass`, `state.seeps` (Task 6) are used by Tasks 7 to 10. `sourceLitres`, `drawSource`, `waterSource` (Task 7) are used by Task 9 and 10. `tripVessel`, `tripLitres`, `takeUpTripVessel` (Task 3) are used by Task 7's seep row. `wantOpen(state, world, w, cal)` changes signature in Task 4 and is used with `world` in Task 11's test. `nearestSeep`, `seepStopped`, `seepNeedsRedig`, `SEEP` (Task 6) are used by Tasks 7 to 10. `MARKS.seep` (Task 8) is asserted in Task 8's test.
