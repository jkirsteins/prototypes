import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile, qty, tool } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot, spotHere, watersideCell } from "../src/sim/position";
import { availableTasks, beginTask, check, drawSpecies, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { fishSpecies, huntedLand, SPECIES_DEFS, type Species, waterOf } from "../src/sim/species";
import { spotOf } from "../src/world/gen";
import { findRoute, routeKm } from "../src/world/route";
import { regionState } from "../src/sim/regionstate";
import { cellAt, regionAt } from "../src/world/gen";

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
    const r = regionAt(world, state.player.region);
    const bare = r.cells.find((c) => ["meadow", "bog", "rock", "fell"].includes(cellAt(world, c).terrain))!;
    placeAt(state, world, bare);
    expect(check(state, world, cal, "chop").ok).toBe(false);
    expect(check(state, world, cal, "chop").why).toContain("forest");
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, cal, "chop").ok).toBe(true);
    const wood0 = regionState(state, world, state.player.region).wood;
    expect(startTask(state, world, cal, "chop")).toBe(true);
    done(g);
    expect(qty(herePile(state, world), "log")).toBe(4);
    expect(qty(state.player.pack, "stick")).toBe(4);
    expect(regionState(state, world, state.player.region).wood).toBe(wood0 - 1);
    expect(tool(state.player, "axe")!.durability).toBe(99);
    expect(state.stats.trees).toBe(1);
  });

  it("repeats until it cannot", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    regionState(state, world, state.player.region).wood = 2;
    startTask(state, world, cal, "chop", undefined, true);
    run(g, 200);
    expect(state.task).toBeNull();
    expect(qty(herePile(state, world), "log")).toBe(8);
    expect(state.log.some((e) => e.text.includes("You stop"))).toBe(true);
  });

  it("walks along a route at the speed of the ground and arrives at the spot", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = regionAt(world, state.player.region);
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
    const r = regionAt(world, state.player.region);
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
    const r = regionAt(world, state.player.region);
    const nb = r.neighbours[0];
    const go = check(state, world, cal, "travel", `region:${nb.id}`);
    expect(go.ok).toBe(true);
    expect(go.duration).toBeGreaterThan(20);
    startTask(state, world, cal, "travel", `region:${nb.id}`);
    done(g, 5000);
    expect(state.player.region).toBe(nb.id);
    expect(cellOf(state, world)).toBe(regionAt(world, nb.id).campCell);
    expect(state.log.some((e) => e.text.includes(`You reach ${regionAt(world, nb.id).name}`))).toBe(true);
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
    const st = regionState(state, world, state.player.region);
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
    const st = regionState(state, world, state.player.region);
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
    regionState(state, world, state.player.region).pop.deer = regionAt(world, state.player.region).capacity.deer;
    expect(check(state, world, cal, "hunt", "deer").ok).toBe(true);
    startTask(state, world, cal, "hunt", "deer", true);
    run(g, 180 * 12, 9);
    expect(state.stats.animals).toBeGreaterThan(0);
    expect(qty(state.player.pack, "rawMeat") + qty(herePile(state, world), "rawMeat")).toBeGreaterThan(0);
  });

  it("haul is not repeatable: nothing in the advanced list offers it a loop button", () => {
    const { state, world } = newGame(3);
    addItem(herePile(state, world), "log", 1);
    expect(check(state, world, cal, "haul").repeatable).toBe(false);
  });

  it("offers every kind of task somewhere in the list, legal or not", () => {
    // Seed 4: a starting region with a lake, so the list has a fishing row at all.
    const { state, world } = newGame(4);
    const ids = new Set(availableTasks(state, world, calendar(0)).map((o) => o.id));
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook", "craft", "repair", "sharpen", "build", "light", "walk", "haul", "rest", "sleep", "travel"]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });

  it("legality can be judged at a cell you do not stand on", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = regionAt(world, state.player.region);
    const forest = spotOf(r, "forest")!;
    placeAtSpot(state, world, state.player.region, "heath");
    // From heath, felling is illegal here but legal at the forest.
    expect(check(state, world, cal, "chop").ok).toBe(false);
    const there = check(state, world, cal, "chop", undefined, forest.cell);
    expect(there.ok).toBe(true);
    expect(there.duration).toBeGreaterThan(0);
    // Splitting reads the pile at that cell, not the one under foot.
    addItem(pile(state, forest.cell), "log", 1);
    expect(check(state, world, cal, "split").ok).toBe(false);
    expect(check(state, world, cal, "split", undefined, forest.cell).ok).toBe(true);
    // A share set aside at that cell shows up from anywhere.
    placeAt(state, world, forest.cell);
    startTask(state, world, cal, "chop");
    run(g, 30);
    stopTask(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    expect(check(state, world, cal, "chop", undefined, forest.cell).resume).toBeCloseTo(0.5, 2);
  });

  it("beginTask leaves an intent in place; startTask and stopTask clear it", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const intent = { task: "chop" as const, cell: cellOf(state, world), campCell: regionState(state, world, state.player.region).campCell, until: { kind: "forever" as const }, deliver: "leave" as const, done: 0, step: "", need: null, orderId: null, windDown: false };
    state.intent = { ...intent };
    expect(beginTask(state, world, cal, "chop")).toBe(true);
    expect(state.intent).not.toBeNull();
    done(g);
    expect(state.intent!.done).toBe(1);
    expect(startTask(state, world, cal, "sticks")).toBe(true);
    expect(state.intent).toBeNull();
    state.intent = { ...intent };
    stopTask(state, world);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
  });

  it("night is not a task you can start; a sleep under a night intent counts as its completion", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(startTask(state, world, cal, "night")).toBe(false);
    state.intent = { task: "night", cell: cellOf(state, world), campCell: cellOf(state, world), until: { kind: "once" }, deliver: "leave", done: 0, step: "", need: "sleep", orderId: null, windDown: false };
    expect(beginTask(state, world, cal, "sleep")).toBe(true);
    done(g);
    expect(state.intent!.done).toBe(1);
    expect(state.intent!.need).toBeNull();
  });
});

describe("anything", () => {
  function armed(g: G) {
    g.state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false }, { id: "fishingSpear", durability: 100, litres: 0, frozen: false });
    addItem(g.state.player.pack, "arrow", 10);
  }

  it("offers Hunt anything and Fish for anything ahead of the species rows", () => {
    const g = newGame(3);
    const rows = availableTasks(g.state, g.world, cal).filter((o) => o.group === "hunt");
    expect(rows[0]).toMatchObject({ id: "hunt", arg: "any", label: "Hunt anything" });
    const fishAt = rows.findIndex((o) => o.id === "fish");
    expect(rows[fishAt]).toMatchObject({ id: "fish", arg: "any", label: "Fish for anything" });
    // Only species with capacity here have rows.
    const r = regionAt(g.world, g.state.player.region);
    for (const o of rows) if (o.arg !== "any") expect(r.capacity[o.arg as Species]).toBeGreaterThan(0);
  });

  it("draws only from species about, on ground that suits them", () => {
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    placeAtSpot(state, world, state.player.region, "forest");
    const at = cellOf(state, world);
    const st = regionState(state, world, state.player.region);
    const rng = new Rng(9);
    for (let i = 0; i < 50; i++) {
      const s = drawSpecies(state, world, cal, rng, "hunt", at)!;
      expect(huntedLand()).toContain(s);
      expect(SPECIES_DEFS[s].hunt!.spot).toBe("forest");
      expect(st.pop[s]!).toBeGreaterThanOrEqual(1);
    }
    for (const s of huntedLand()) st.pop[s] = 0;
    expect(drawSpecies(state, world, cal, rng, "hunt", at)).toBeNull();
    expect(check(state, world, cal, "hunt", "any").why).toBe("nothing about");
  });

  it("starts as the species drawn, trains it, and draws again on repeat", () => {
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, cal, "hunt", "any", true, new Rng(5))).toBe(true);
    const first = state.task!;
    expect(first.any).toBe(true);
    expect(first.arg).not.toBe("any");
    expect(huntedLand()).toContain(first.arg);
    expect(first.duration).toBe(SPECIES_DEFS[first.arg as Species].hunt!.minutes);
    expect(state.log.at(-1)!.text).toMatch(/^Fresh sign: /);
    const rng = new Rng(1);
    for (let m = 0; m < first.duration + 1 && state.task === first; m++) stepTask(state, world, cal, rng, 1);
    expect(state.skills.hunting.mastery[`hunt:${first.arg}`]).toBeGreaterThan(0);
    expect(state.task?.any).toBe(true);
  });

  it("fishing for anything at a sea shore never lands a lake fish", () => {
    // No start region touches the sea: findStart wants forest, land and little water, and the
    // coast lies far northwest of where it looks, so no seed puts the player on one. Seed 3's
    // region 1865 is a coast with both a lake shore and a sea shore; change it if the map
    // changes, with the reason here.
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    const r = regionAt(world, 1865);
    const sea = r.cells.find((c) => cellAt(world, c).terrain !== "water" && watersideCell(world, c, "sea") && !watersideCell(world, c, "lake"));
    expect(sea).toBeDefined();
    expect(watersideCell(world, sea!, "lake")).toBe(false);
    placeAt(state, world, sea!);
    const st = regionState(state, world, state.player.region);
    // Lake fish are about in this region: a draw that ignored the water would land one.
    expect(fishSpecies().some((s) => waterOf(s) === "lake" && (st.pop[s] ?? 0) >= 1)).toBe(true);
    const rng = new Rng(2);
    for (let i = 0; i < 30; i++) {
      const s = drawSpecies(state, world, cal, rng, "fish", sea!);
      if (s) expect(SPECIES_DEFS[s].habitat.sea).toBeDefined();
    }
  });

  it("an intent for a named species that adopts a running \"anything\" hunt still counts the kill", () => {
    const g = newGame(3);
    const { state, world } = g;
    armed(g);
    placeAtSpot(state, world, state.player.region, "heath");
    expect(startIntent(state, world, cal, new Rng(1), { task: "hunt", arg: "hare", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    expect(state.task).toMatchObject({ id: "hunt", arg: "hare" });
    // Stand in for a task adopted from an already-running "anything" hunt that drew hare.
    state.task = { ...state.task!, any: true };
    done(g);
    expect(state.intent).not.toBeNull();
    expect(state.intent!.done).toBe(1);
  });
});
