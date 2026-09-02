import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile, qty, tool } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot, spotHere } from "../src/sim/position";
import { availableTasks, check, runPlan, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { spotOf } from "../src/world/gen";
import { findRoute, routeKm } from "../src/world/route";

type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number, seed = 1) {
  const rng = new Rng(seed);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
/** Steps until the task ends, in case the pace is not what the caller assumed. */
function done(g: G, max = 2000) {
  const rng = new Rng(1);
  for (let i = 0; i < max && g.state.task; i++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("tasks", () => {
  it("felling a tree needs forest under foot and an axe, and leaves logs on this cell", () => {
    const g = newGame(3);
    const { state, world } = g;
    // Stand on ground that is not forest: no felling there.
    const r = world.regions[state.player.region];
    const bare = r.cells.find((c) => ["meadow", "bog", "rock", "fell"].includes(world.cells[c].terrain))!;
    placeAt(state, world, bare);
    expect(check(state, world, cal, "chop").ok).toBe(false);
    expect(check(state, world, cal, "chop").why).toContain("forest");
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, cal, "chop").ok).toBe(true);
    const wood0 = state.regions[state.player.region].wood;
    expect(startTask(state, world, cal, "chop")).toBe(true);
    done(g);
    expect(qty(herePile(state, world), "log")).toBe(4);
    expect(qty(state.player.pack, "stick")).toBe(4);
    expect(state.regions[state.player.region].wood).toBe(wood0 - 1);
    expect(tool(state.player, "axe")!.durability).toBe(99);
    expect(state.stats.trees).toBe(1);
  });

  it("repeats until it cannot", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    state.regions[state.player.region].wood = 2;
    startTask(state, world, cal, "chop", undefined, true);
    run(g, 200);
    expect(state.task).toBeNull();
    expect(qty(herePile(state, world), "log")).toBe(8);
    expect(state.log.some((e) => e.text.includes("You stop"))).toBe(true);
  });

  it("walks along a route at the speed of the ground and arrives at the spot", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = world.regions[state.player.region];
    const forest = spotOf(r, "forest")!;
    const walk = check(state, world, cal, "walk", "spot:forest");
    expect(walk.ok).toBe(true);
    const route = findRoute(world, cellOf(state, world), forest.cell)!;
    expect(routeKm(route)).toBeCloseTo(forest.km, 1);
    startTask(state, world, cal, "walk", "spot:forest");
    expect(state.route?.path.length).toBe(route.length);
    done(g);
    expect(spotHere(state, world)).toBe("forest");
    expect(state.route).toBeNull();
    expect(state.stats.km).toBeCloseTo(forest.km, 1);
  });

  it("a stopped walk leaves you on the way, and the next walk starts from there", () => {
    const g = newGame(3);
    const { state, world } = g;
    // The farthest spot, so half the way is several cells.
    const r = world.regions[state.player.region];
    const far = r.spots.reduce((a, b) => (b.km > a.km ? b : a));
    const start = cellOf(state, world);
    startTask(state, world, cal, "walk", `spot:${far.id}`);
    const total = state.task!.duration;
    run(g, Math.floor(total / 2));
    stopTask(state, world);
    const mid = cellOf(state, world);
    expect(mid).not.toBe(start);
    expect(mid).not.toBe(far.cell);
    expect(state.route).toBeNull();
    expect(Object.keys(state.paused)).toHaveLength(0);
    const rest = check(state, world, cal, "walk", `spot:${far.id}`);
    expect(rest.duration).toBeLessThan(total * 0.75);
    startTask(state, world, cal, "walk", `spot:${far.id}`);
    done(g);
    expect(cellOf(state, world)).toBe(far.cell);
  });

  it("travels to a neighbouring region's camp and can go anywhere with a route", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = world.regions[state.player.region];
    const nb = r.neighbours[0];
    const go = check(state, world, cal, "travel", `region:${nb.id}`);
    expect(go.ok).toBe(true);
    expect(go.duration).toBeGreaterThan(20);
    startTask(state, world, cal, "travel", `region:${nb.id}`);
    done(g, 5000);
    expect(state.player.region).toBe(nb.id);
    expect(cellOf(state, world)).toBe(world.regions[nb.id].campCell);
    expect(state.log.some((e) => e.text.includes(`You reach ${world.regions[nb.id].name}`))).toBe(true);
  });

  it("hauling is a plan: load, walk to camp, drop, walk back, until the pile is bare", () => {
    const g = newGame(3);
    const { state, world } = g;
    const region = state.player.region;
    placeAtSpot(state, world, region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 3);
    addItem(herePile(state, world), "stick", 10);
    const haul = check(state, world, cal, "haul");
    expect(haul.ok).toBe(true);
    expect(startTask(state, world, cal, "haul", undefined, true)).toBe(true);
    expect(state.plan?.name).toBe("Haul to camp");
    expect(state.task?.id).toBe("walk");
    expect(qty(state.player.pack, "log")).toBe(1);
    // Run until the plan finishes.
    const rng = new Rng(1);
    for (let i = 0; i < 5000 && (state.plan || state.task); i++) {
      stepTask(state, world, calendar(state.minute), rng, 1);
      // advance() does this each minute.
      if (!state.task) runPlan(state, world, calendar(state.minute));
    }
    const camp = pile(state, state.regions[region].campCell);
    expect(qty(camp, "log")).toBe(3);
    expect(qty(camp, "stick")).toBe(10);
    expect(qty(pile(state, forestCell), "log")).toBe(0);
    expect(state.plan).toBeNull();
    expect(state.log.some((e) => e.text.includes("Haul to camp: done"))).toBe(true);
  });

  it("stopping mid-haul keeps the load on your back and you on the way", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 2);
    startTask(state, world, cal, "haul", undefined, true);
    // Walk until the first cell boundary is crossed, then stop.
    for (let i = 0; i < 200 && cellOf(state, world) === forestCell; i++) run(g, 1);
    stopTask(state, world);
    expect(state.plan).toBeNull();
    expect(qty(state.player.pack, "log")).toBe(1);
    expect(cellOf(state, world)).not.toBe(forestCell);
    expect(state.route).toBeNull();
    // The other log still lies where it was, and going back for it is an ordinary walk.
    expect(qty(pile(state, forestCell), "log")).toBe(1);
    expect(check(state, world, cal, "walk", `cell:${forestCell}`).ok).toBe(true);
  });

  it("crafts through the chain: cordage, knife, fire drill", () => {
    const g = newGame(3);
    const { state, world } = g;
    addItem(state.player.pack, "bark", 3);
    addItem(state.player.pack, "stone", 2);
    addItem(state.player.pack, "stick", 3);
    expect(check(state, world, cal, "craft", "knife").ok).toBe(false);
    startTask(state, world, cal, "craft", "cordage");
    done(g);
    expect(qty(state.player.pack, "cordage")).toBe(1);
    expect(check(state, world, cal, "craft", "fireDrill").why).toContain("knife");
    startTask(state, world, cal, "craft", "knife");
    done(g);
    expect(tool(state.player, "knife")).toBeDefined();
    addItem(state.player.pack, "cordage", 1);
    startTask(state, world, cal, "craft", "fireDrill");
    done(g);
    expect(tool(state.player, "fireDrill")).toBeDefined();
  });

  it("builds a fire pit at camp, lights it and cooks", () => {
    const g = newGame(3);
    const { state, world } = g;
    addItem(herePile(state, world), "stone", 6);
    addItem(state.player.pack, "firewood", 3);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "rawMeat", 2);
    expect(check(state, world, cal, "light").why).toContain("fire pit");
    startTask(state, world, cal, "build", "firePit");
    expect(qty(herePile(state, world), "stone")).toBe(0);
    done(g);
    const st = state.regions[state.player.region];
    expect(st.structures.firePit).toBe(true);
    startTask(state, world, cal, "light");
    done(g);
    expect(st.fire.lit).toBe(true);
    startTask(state, world, cal, "cook", "rawMeat", true);
    done(g);
    expect(qty(state.player.pack, "cookedMeat")).toBeCloseTo(2);
  });

  it("keeps build progress when stopped", () => {
    const g = newGame(3);
    const { state, world } = g;
    addItem(herePile(state, world), "stick", 8);
    addItem(herePile(state, world), "log", 4);
    addItem(herePile(state, world), "cordage", 2);
    startTask(state, world, cal, "build", "leanTo");
    run(g, 100);
    stopTask(state, world);
    const st = state.regions[state.player.region];
    expect(st.build.leanTo).toBeGreaterThan(99);
    const again = check(state, world, cal, "build", "leanTo");
    expect(again.ok).toBe(true);
    expect(again.duration).toBeCloseTo(140, 0);
    startTask(state, world, cal, "build", "leanTo");
    done(g);
    expect(st.structures.leanTo).toBe(true);
  });

  it("hunts deer in the forest with a bow and eventually succeeds", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 40);
    state.regions[state.player.region].pop.deer = world.regions[state.player.region].capacity.deer;
    expect(check(state, world, cal, "hunt", "deer").ok).toBe(true);
    startTask(state, world, cal, "hunt", "deer", true);
    run(g, 180 * 12, 9);
    expect(state.stats.animals).toBeGreaterThan(0);
    expect(qty(state.player.pack, "rawMeat") + qty(herePile(state, world), "rawMeat")).toBeGreaterThan(0);
  });

  it("offers every kind of task somewhere in the list, legal or not", () => {
    const { state, world } = newGame(3);
    const ids = new Set(availableTasks(state, world, calendar(0)).map((o) => o.id));
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook", "craft", "repair", "sharpen", "build", "light", "walk", "haul", "rest", "sleep", "travel"]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });
});
