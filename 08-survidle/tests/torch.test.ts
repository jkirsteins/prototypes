import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { hourlyEvents } from "../src/sim/events";
import { addItem, qty, tool } from "../src/sim/inventory";
import { ITEM_KG, RECIPES, TORCH_BURN_MINUTES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { baseWalkSpeed, firelit, stepPlayer } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { MASTERY_KEYS, masteryKey, skillOf } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { statsHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";

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
