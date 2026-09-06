import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile, qty, tool } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { addOrder, chooseOrder, ordersHere } from "../src/sim/orders";
import { cellOf, placeAt, placeAtSpot, spotHere, watersideCell } from "../src/sim/position";
import { availableTasks, beginTask, check, drawSpecies, MEND_AT, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { fishSpecies, huntedLand, SPECIES_DEFS, type Species, waterOf } from "../src/sim/species";
import { spotOf } from "../src/world/gen";
import { findRoute, routeKm } from "../src/world/route";
import { regionState } from "../src/sim/regionstate";
import { rosterHtml } from "../src/ui/panels";
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
    expect(state.log.some((e) => e.text.includes("{You} {stop}"))).toBe(true);
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

  it("the route remembers every cell it walked, the start first, so the whole walk is the route as first found", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = regionAt(world, state.player.region);
    const forest = spotOf(r, "forest")!;
    const start = cellOf(state, world);
    const whole = [start, ...findRoute(world, start, forest.cell)!];
    startTask(state, world, cal, "walk", "spot:forest");
    expect(state.route!.walked).toEqual([start]);
    let steps = 0;
    while (state.route && steps++ < 2000) {
      run(g, 3);
      if (!state.route) break;
      expect(state.route.walked[0]).toBe(start);
      expect(state.route.walked.concat(state.route.path)).toEqual(whole);
    }
    expect(state.route).toBeNull();
    expect(spotHere(state, world)).toBe("forest");
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
    expect(state.log.some((e) => e.text.includes(`{You} {reach} ${regionAt(world, nb.id).name}`))).toBe(true);
  });

  it("crafts through the chain: cordage, a fire drill that needs no knife, then the knife itself", () => {
    const g = newGame(3);
    const { state, world } = g;
    addItem(state.player.pack, "bark", 6);
    addItem(state.player.pack, "stone", 2);
    addItem(state.player.pack, "stick", 3);
    expect(check(state, world, cal, "craft", "knife").ok).toBe(false);
    startTask(state, world, cal, "craft", "cordage");
    done(g);
    expect(qty(state.player.pack, "cordage")).toBe(1);
    // A hand drill is a stick spun on a board; the arrival axe notches the board.
    expect(check(state, world, cal, "craft", "fireDrill").ok).toBe(true);
    startTask(state, world, cal, "craft", "fireDrill");
    done(g);
    expect(tool(state.player, "fireDrill")).toBeDefined();
    startTask(state, world, cal, "craft", "cordage");
    done(g);
    startTask(state, world, cal, "craft", "knife");
    done(g);
    expect(tool(state.player, "knife")).toBeDefined();
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
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "read", "setTrap", "emptyTrap", "cook", "craft", "repair", "sharpen", "build", "light", "walk", "haul", "rest", "sleep", "travel"]) {
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
    // Only species with capacity here have rows. Read is a hunt-group row with no species of its own.
    const r = regionAt(g.world, g.state.player.region);
    for (const o of rows) if (o.arg && o.arg !== "any") expect(r.capacity[o.arg as Species]).toBeGreaterThan(0);
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

describe("away for the season", () => {
  // Seed 5's region 1865 is a coast with a lake shore, mallard on the lake and bear in its forest,
  // which the start regions have not got. Change it if the map changes, with the reason here.
  const REGION = 1865;
  function armedAt(seed: number, cell: number) {
    const g = newGame(seed);
    g.state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false }, { id: "fishingSpear", durability: 100, litres: 0, frozen: false });
    addItem(g.state.player.pack, "arrow", 10);
    placeAt(g.state, g.world, cell);
    return g;
  }
  function lakeShore(world: G["world"]): number {
    const cell = regionAt(world, REGION).cells.find((c) => cellAt(world, c).terrain !== "water" && watersideCell(world, c, "lake"));
    expect(cell).toBeDefined();
    return cell!;
  }

  it("a migrant gone for the year is away, not merely scarce", () => {
    const world = newGame(5).world;
    const g = armedAt(5, lakeShore(world));
    const { state } = g;
    const october = calendar(1440 * 200);
    // The flock decays by a tenth a day, so weeks after it left the numbers still say there are mallard here.
    expect(regionState(state, g.world, REGION).pop.mallard!).toBeGreaterThan(1);
    const o = check(state, g.world, october, "hunt", "mallard");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("gone until April");
    // June, the same shore: the row is the ordinary one again.
    expect(check(state, g.world, calendar(1440 * 70), "hunt", "mallard").ok).toBe(true);
  });

  it("a denned bear says so in its own word", () => {
    const world = newGame(5).world;
    const forest = spotOf(regionAt(world, REGION), "forest")!.cell;
    const g = armedAt(5, forest);
    const january = calendar(1440 * 275);
    const o = check(g.state, g.world, january, "hunt", "bear");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("denned until April");
  });

  it("ice takes the lake birds off the row and leaves the fish under it", () => {
    const world = newGame(5).world;
    const g = armedAt(5, lakeShore(world));
    const { state } = g;
    const june = calendar(1440 * 70);
    state.weather.iceCm = 10;
    const duck = check(state, g.world, june, "hunt", "mallard");
    expect(duck.ok).toBe(false);
    expect(duck.why).toBe("the lake is frozen");
    // Fish are reached through the ice, however thick it is.
    state.weather.iceCm = 30;
    const perch = check(state, g.world, june, "fish", "perch");
    expect(perch.ok).toBe(true);
    expect(perch.why).toBe("");
  });

  it("the card and the row say the same thing about an absent species", () => {
    const world = newGame(5).world;
    const g = armedAt(5, lakeShore(world));
    const october = calendar(1440 * 200);
    const html = rosterHtml(g.state, g.world, REGION, october);
    expect(html).toContain("mallard gone until April");
    expect(check(g.state, g.world, october, "hunt", "mallard").why).toBe("gone until April");
  });

  it("a hunt for anything counts only the kinds that can be met, and a cast only this water's", () => {
    const world = newGame(5).world;
    const g = armedAt(5, lakeShore(world));
    const { state } = g;
    const june = calendar(1440 * 70);
    const kinds = (o: { detail: string }) => Number(o.detail.match(/(\d+) kinds? here/)![1]);
    const summer = kinds(check(state, g.world, june, "hunt", "any"));
    // In January the migrants are away and the count says so.
    const january = kinds(check(state, g.world, calendar(1440 * 275), "hunt", "any"));
    expect(january).toBeLessThan(summer);
    // The lake shore counts lake fish; the region's sea fish are no comfort there.
    const st = regionState(state, g.world, REGION);
    for (const s of fishSpecies()) if (waterOf(s) === "lake") st.pop[s] = 0;
    const cast = check(state, g.world, june, "fish", "any");
    expect(cast.ok).toBe(false);
    expect(cast.why).toBe("nothing bites here");
  });
});

describe("mend clothing", () => {
  it("waits until the most worn piece is at or under MEND_AT, so a patch never buys less than its hide", () => {
    const { state, world } = newGame(8);
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 1);
    for (const g of state.player.clothing) g.durability = MEND_AT + 1;
    const greyed = check(state, world, cal, "repair");
    expect(greyed.ok).toBe(false);
    expect(greyed.why).toBe("nothing worn enough to mend");
    state.player.clothing[0].durability = MEND_AT;
    expect(check(state, world, cal, "repair").ok).toBe(true);
  });

  it("a repair grind on the list is skipped while nothing is worn enough, and chosen once a piece is", () => {
    // The grind may only sit above the hut group because the mend's own
    // legality shuts it between wearings; a grind that always ran there would
    // starve every keep below it.
    const { state, world } = newGame(8);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(pile(state, st.campCell), "hide", 1);
    addOrder(state, world, { task: "repair", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    for (const g of state.player.clothing) g.durability = MEND_AT + 1;
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(ordersHere(state, world)[0].skipped).toBe("nothing worn enough to mend");
    state.player.clothing[0].durability = MEND_AT;
    expect(chooseOrder(state, world, cal)?.req.task).toBe("repair");
    expect(ordersHere(state, world)[0].skipped).toBe("");
  });
});
