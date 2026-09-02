import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile, qty, tool } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { availableTasks, check, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { spotKm } from "../src/world/gen";

function run(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], minutes: number, seed = 1) {
  const rng = new Rng(seed);
  for (let m = 0; m < minutes; m++) stepTask(state, world, calendar(state.minute), rng, 1);
}

describe("tasks", () => {
  it("felling a tree needs the forest, an axe, and leaves logs on the ground", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    expect(check(state, world, cal, "chop").ok).toBe(false);
    expect(check(state, world, cal, "chop").why).toContain("forest");
    state.player.spot = "forest";
    expect(check(state, world, cal, "chop").ok).toBe(true);
    const wood0 = state.regions[state.player.region].wood;
    expect(startTask(state, world, cal, "chop")).toBe(true);
    run(state, world, 60);
    expect(state.task).toBeNull();
    expect(qty(herePile(state), "log")).toBe(4);
    expect(qty(state.player.pack, "stick")).toBe(4);
    expect(state.regions[state.player.region].wood).toBe(wood0 - 1);
    expect(tool(state.player, "axe")!.durability).toBe(99);
    expect(state.stats.trees).toBe(1);
  });

  it("repeats until it cannot", () => {
    const { state, world } = newGame(3);
    state.player.spot = "forest";
    state.regions[state.player.region].wood = 2;
    startTask(state, world, calendar(0), "chop", undefined, true);
    run(state, world, 200);
    expect(state.task).toBeNull();
    expect(qty(herePile(state), "log")).toBe(8);
    expect(state.log.some((e) => e.text.includes("You stop"))).toBe(true);
  });

  it("walks between spots and travels between regions at a realistic pace", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    const r = world.regions[state.player.region];
    const walk = check(state, world, cal, "walk", "forest");
    expect(walk.ok).toBe(true);
    expect(walk.duration).toBeCloseTo((spotKm(r, "forest") / 3.0) * 60, 3);
    startTask(state, world, cal, "walk", "forest");
    run(state, world, Math.ceil(walk.duration));
    expect(state.player.spot).toBe("forest");

    const nb = r.neighbours[0];
    const travel = check(state, world, calendar(state.minute), "travel", String(nb.id));
    expect(travel.ok).toBe(true);
    const expectedKm = nb.km + spotKm(r, "forest");
    expect(travel.duration).toBeCloseTo((expectedKm / 3.0) * 60, 3);
    startTask(state, world, calendar(state.minute), "travel", String(nb.id));
    run(state, world, Math.ceil(travel.duration));
    expect(state.player.region).toBe(nb.id);
    expect(state.player.spot).toBe("camp");
    expect(state.stats.km).toBeCloseTo(spotKm(r, "forest") + expectedKm, 3);
  });

  it("hauls up to 35 kg per round trip to camp", () => {
    const { state, world } = newGame(3);
    state.player.spot = "forest";
    addItem(herePile(state), "log", 3);
    addItem(herePile(state), "stick", 10);
    const cal = calendar(0);
    const haul = check(state, world, cal, "haul");
    expect(haul.ok).toBe(true);
    startTask(state, world, cal, "haul", undefined, true);
    run(state, world, Math.ceil(haul.duration) + 1);
    const camp = pile(state, state.player.region, "camp");
    expect(qty(camp, "log")).toBe(1);
    expect(qty(camp, "stick")).toBe(10);
    expect(state.player.spot).toBe("forest");
    expect(state.task?.id).toBe("haul");
  });

  it("crafts through the chain: cordage, knife, fire drill", () => {
    const { state, world } = newGame(3);
    addItem(state.player.pack, "bark", 3);
    addItem(state.player.pack, "stone", 2);
    addItem(state.player.pack, "stick", 3);
    const cal = calendar(0);
    expect(check(state, world, cal, "craft", "knife").ok).toBe(false);
    startTask(state, world, cal, "craft", "cordage");
    run(state, world, 20);
    expect(qty(state.player.pack, "cordage")).toBe(1);
    expect(check(state, world, cal, "craft", "fireDrill").why).toContain("knife");
    startTask(state, world, cal, "craft", "knife");
    run(state, world, 45);
    expect(tool(state.player, "knife")).toBeDefined();
    addItem(state.player.pack, "cordage", 1);
    startTask(state, world, cal, "craft", "fireDrill");
    run(state, world, 30);
    expect(tool(state.player, "fireDrill")).toBeDefined();
  });

  it("builds a fire pit, lights it and cooks", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    addItem(herePile(state), "stone", 6);
    addItem(state.player.pack, "firewood", 3);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "rawMeat", 2);
    expect(check(state, world, cal, "light").why).toContain("fire pit");
    startTask(state, world, cal, "build", "firePit");
    expect(qty(herePile(state), "stone")).toBe(0);
    run(state, world, 30);
    const st = state.regions[state.player.region];
    expect(st.structures.firePit).toBe(true);
    startTask(state, world, cal, "light");
    run(state, world, 10);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.fuelKg).toBe(1);
    startTask(state, world, cal, "cook", "rawMeat", true);
    run(state, world, 21);
    expect(qty(state.player.pack, "cookedMeat")).toBeCloseTo(2);
    expect(state.task).toBeNull();
  });

  it("keeps build progress when stopped", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    addItem(herePile(state), "stick", 8);
    addItem(herePile(state), "log", 4);
    addItem(herePile(state), "cordage", 2);
    startTask(state, world, cal, "build", "leanTo");
    run(state, world, 100);
    stopTask(state);
    const st = state.regions[state.player.region];
    expect(st.build.leanTo).toBeGreaterThan(99);
    const again = check(state, world, cal, "build", "leanTo");
    expect(again.ok).toBe(true);
    expect(again.duration).toBeCloseTo(140, 0);
    startTask(state, world, cal, "build", "leanTo");
    run(state, world, 141);
    expect(st.structures.leanTo).toBe(true);
  });

  it("hunts deer with a bow and arrows and eventually succeeds", () => {
    const { state, world } = newGame(3);
    state.player.spot = "forest";
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 40);
    state.regions[state.player.region].pop.deer = world.regions[state.player.region].capacity.deer;
    const cal = calendar(0);
    expect(check(state, world, cal, "hunt", "deer").ok).toBe(true);
    startTask(state, world, cal, "hunt", "deer", true);
    run(state, world, 180 * 12, 9);
    expect(state.stats.animals).toBeGreaterThan(0);
    expect(qty(state.player.pack, "rawMeat") + qty(herePile(state), "rawMeat")).toBeGreaterThan(0);
  });

  it("offers every kind of task somewhere in the list, legal or not", () => {
    const { state, world } = newGame(3);
    const ids = new Set(availableTasks(state, world, calendar(0)).map((o) => o.id));
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook", "craft", "repair", "sharpen", "build", "light", "walk", "haul", "rest", "sleep", "travel"]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });
});
