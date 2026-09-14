/**
 * Proves the live-pile index (inventory.ts's pileCells) picks exactly the
 * cells the old full scan of state.piles would have picked, at every point
 * across a mutating run, in varied weather. `oldDryWood`, `oldWetWood` and
 * `oldSpoilPiles` below are verbatim copies of fire.ts/camp.ts before the
 * index existed, kept local to this file so the fix can be checked against
 * the exact algorithm it replaced rather than against itself.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { cellAt, type World } from "../src/world/gen";
import {
  addItem, ageStacks, pile, pileCells, qty, removeItem, tidyPiles, TRACE_KG,
} from "../src/sim/inventory";
import { dryWood, RAIN_WET_KG_PER_HOUR, wetWood } from "../src/sim/fire";
import { coveredWoodKg, spoilPiles, woodOnHandKg } from "../src/sim/camp";
import { campSite, regionState, touchedRegions } from "../src/sim/regionstate";
import { localWeather } from "../src/sim/weather";
import { BARK_DRY_RATIO } from "../src/sim/items";
import { PERISHABLES, type GameState, type Inventory, type ItemId } from "../src/sim/types";
import type { Presence } from "../src/sim/advance";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere, testRain } from "./weather-helpers";

// --- verbatim copies of the pre-index, scan-every-pile implementation ---

function oldDryBudget(invs: Inventory[], perHour: number, dt: number, from: ItemId = "wetFirewood", to: ItemId = "firewood", ratio = 1): void {
  let budget = (perHour / 60) * dt;
  for (const inv of invs) {
    if (budget <= 1e-9) break;
    const have = qty(inv, from);
    if (have <= 1e-9) continue;
    const moved = removeItem(inv, from, Math.min(have, budget));
    addItem(inv, to, moved / ratio);
    budget -= moved;
  }
}

function oldDryWood(state: GameState, dt: number, who: Presence | null, world: World): void {
  const dryAt = (cell?: number) => localWeather(state, world, cell).precip === "none";
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    if (st.campCell === null) continue;
    const dry = dryAt(st.campCell);
    const site = campSite(st);
    const sheltered = st.fire.lit || site?.structures.cabin || site?.structures.turfHut || (site?.woodsheds ?? 0) > 0;
    const perHour = sheltered ? 2 : site?.structures.leanTo ? (dry ? 2 : 0) : dry ? 0.5 : 0;
    if (perHour <= 0) continue;
    const campPile = state.piles[st.campCell];
    const atThisCamp = who !== null && id === who.region && who.atCamp && !state.player.fieldFire;
    const invs = [campPile, atThisCamp ? state.player.pack : undefined].filter((x): x is Inventory => x !== undefined);
    oldDryBudget(invs, perHour, dt);
    oldDryBudget(invs, perHour, dt, "freshBark", "driedBark", BARK_DRY_RATIO);
  }
  if (who && state.player.fieldFire) {
    oldDryBudget([state.player.pack], 2, dt);
    oldDryBudget([state.player.pack], 2, dt, "freshBark", "driedBark", BARK_DRY_RATIO);
  }
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv || qty(inv, "wetFirewood") <= TRACE_KG) continue;
    if (!dryAt(cell)) continue;
    const isCampPile = touchedRegions(state).some((id) => state.regions[id].campCell === cell);
    if (!isCampPile) oldDryBudget([inv], 0.5, dt);
  }
  if (who && !who.atCamp && !state.player.fieldFire && dryAt()) {
    oldDryBudget([state.player.pack], 0.5, dt);
    oldDryBudget([state.player.pack], 0.5, dt, "freshBark", "driedBark", BARK_DRY_RATIO);
  }
}

function oldWetWood(state: GameState, world: World, dt: number): void {
  for (const key of Object.keys(state.piles)) {
    const cell = Number(key);
    const inv = state.piles[cell];
    if (!inv || qty(inv, "firewood") <= TRACE_KG) continue;
    if (localWeather(state, world, cell).precip === "none") continue;
    const st = regionState(state, world, cellAt(world, cell).region);
    const covered = cell === st.campCell ? coveredWoodKg(campSite(st)) : 0;
    const exposed = Math.max(0, woodOnHandKg(inv) - covered);
    if (exposed <= TRACE_KG) continue;
    const wetted = Math.min(qty(inv, "firewood"), exposed, (RAIN_WET_KG_PER_HOUR / 60) * dt);
    if (wetted <= TRACE_KG) continue;
    removeItem(inv, "firewood", wetted);
    addItem(inv, "wetFirewood", wetted);
    st.wettedKg += wetted;
  }
}

function oldSpoilPiles(state: GameState, world: World, dt: number): void {
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv || !PERISHABLES.some((id) => inv.stacks[id]?.length)) continue;
    ageStacks(inv, dt, localWeather(state, world, cell).temperatureC);
  }
}

// --- scene setup ---

function ringCells(world: World, center: number, count: number): number[] {
  const { w, h } = world;
  const cx = center % w;
  const cy = Math.floor(center / w);
  const out: number[] = [];
  outer: for (let ring = 1; ring < 400; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const cell = y * w + x;
        if (cell === center) continue;
        out.push(cell);
        if (out.length >= count) break outer;
      }
    }
  }
  return out;
}

/** Every stack this scene's piles are seeded with: dry only, wet only, perishable only, all three mixed, an irrelevant stone/bark pile, and one firewood amount below TRACE_KG that no loop should ever act on. */
const SEED_CATEGORIES: ((inv: Inventory) => void)[] = [
  (inv) => addItem(inv, "firewood", 4),
  (inv) => addItem(inv, "wetFirewood", 3),
  (inv) => addItem(inv, "rawMeat", 2),
  (inv) => {
    addItem(inv, "firewood", 2);
    addItem(inv, "wetFirewood", 1);
    addItem(inv, "berries", 1);
  },
  (inv) => {
    addItem(inv, "stone", 3);
    addItem(inv, "bark", 2);
  },
  (inv) => addItem(inv, "firewood", TRACE_KG / 2),
];

function buildScene(seed: number, pileCount: number) {
  testAtmosphere();
  const { state, world } = newGame(seed);
  const camp = siteCamp(state, world);
  const cells = ringCells(world, camp, pileCount);
  cells.forEach((cell, i) => {
    SEED_CATEGORIES[i % SEED_CATEGORIES.length](pile(state, cell));
  });
  return { state, world, camp, cells };
}

/** Applies the same manual pile edit (a haul, a drop, a carcass dressed onto the ground) to both parallel states, so mid-run mutation is exercised identically on each side. */
function editBothPiles(oldState: GameState, newState: GameState, cell: number, edit: (inv: Inventory) => void): void {
  edit(pile(oldState, cell));
  edit(pile(newState, cell));
}

describe("the live-pile index reproduces the full-scan result", () => {
  it("keeps dryWood, wetWood and spoilPiles identical to the pre-index scan across a mutating, multi-weather run", () => {
    const { state: seedState, world, cells } = buildScene(21, 48);
    // Two independent runs from the same starting piles: state.piles is
    // plain JSON-shaped data (save/load round-trips it the same way), so a
    // structured clone gives each run its own object identity - which also
    // means the new run's live index has to build itself from a state it
    // has never seen, the same as a state coming back from a save file.
    const oldState = structuredClone(seedState);
    const newState = structuredClone(seedState);
    const who: Presence = { region: newState.player.region, atCamp: true };

    function tick(dt: number): void {
      oldDryWood(oldState, dt, who, world);
      oldWetWood(oldState, world, dt);
      oldSpoilPiles(oldState, world, dt);
      dryWood(newState, dt, who, world);
      wetWood(newState, world, dt);
      spoilPiles(newState, world, dt, who);
    }

    // Dry spell.
    testAtmosphere();
    for (let i = 0; i < 8; i++) tick(30);

    // A haul mid-run: firewood dropped onto a cell that started irrelevant
    // (stone-only), and a carcass dressed onto another. Applied identically
    // to both runs, the same way produce/transfer/hauling would.
    const stoneCell = cells[4];
    const irrelevantCell = cells[10] ?? cells[4];
    editBothPiles(oldState, newState, stoneCell, (inv) => addItem(inv, "firewood", 5));
    editBothPiles(oldState, newState, irrelevantCell, (inv) => addItem(inv, "rawMeat", 3));

    // Rain: wets exposed firewood, dries nothing.
    testRain(3, 6);
    for (let i = 0; i < 8; i++) tick(30);

    // Fully empty a pile that had firewood, so it drops out of every
    // category and (once tidied) out of state.piles entirely.
    const emptied = cells[0];
    editBothPiles(oldState, newState, emptied, (inv) => {
      removeItem(inv, "firewood", qty(inv, "firewood"));
      removeItem(inv, "wetFirewood", qty(inv, "wetFirewood"));
    });

    // A hard freeze with snow: drying resumes, spoilage rate halves.
    testRain(4, -8);
    for (let i = 0; i < 8; i++) tick(30);

    tidyPiles(oldState);
    tidyPiles(newState);

    expect(newState.piles).toEqual(oldState.piles);
    for (const id of touchedRegions(newState)) {
      expect(newState.regions[id].wettedKg).toBeCloseTo(oldState.regions[id].wettedKg, 9);
    }
    expect(newState.player.pack).toEqual(oldState.player.pack);
  });

  it("keeps pileCells for every category exactly in step with a fresh scan of state.piles, checkpoint by checkpoint", () => {
    const { state, world, cells } = buildScene(21, 60);
    const who: Presence = { region: state.player.region, atCamp: true };

    function groundTruth(category: "firewood" | "wetFirewood" | "perishable"): number[] {
      const out: number[] = [];
      for (const k of Object.keys(state.piles)) {
        const cell = Number(k);
        const inv = state.piles[cell];
        if (!inv) continue;
        const has = category === "perishable"
          ? PERISHABLES.some((id) => inv.stacks[id]?.length)
          : qty(inv, category) > TRACE_KG;
        if (has) out.push(cell);
      }
      return out.sort((a, b) => a - b);
    }

    function checkAllCategories(label: string): void {
      for (const category of ["firewood", "wetFirewood", "perishable"] as const) {
        expect(pileCells(state, category), `${label}: ${category}`).toEqual(groundTruth(category));
      }
    }

    checkAllCategories("seeded");
    testAtmosphere();
    dryWood(state, 20, who, world);
    wetWood(state, world, 20);
    spoilPiles(state, world, 20, who);
    checkAllCategories("after a dry tick");

    testRain(3, 5);
    dryWood(state, 20, who, world);
    wetWood(state, world, 20);
    spoilPiles(state, world, 20, who);
    checkAllCategories("after a rain tick");

    // Cells not previously in any category: adding firewood must join the
    // wood index, adding a perishable must join the perishable index.
    const untouchedA = cells[cells.length - 1];
    const untouchedB = cells[cells.length - 2];
    addItem(pile(state, untouchedA), "firewood", 2);
    addItem(pile(state, untouchedB), "berries", 1);
    checkAllCategories("after adding to previously irrelevant cells");

    // Draining a cell to nothing must drop it from the category it left.
    const firewoodCell = cells[0];
    removeItem(pile(state, firewoodCell), "firewood", qty(pile(state, firewoodCell), "firewood"));
    checkAllCategories("after draining a cell's firewood to zero");

    tidyPiles(state);
    checkAllCategories("after tidyPiles sweeps empty piles");
  });
});
