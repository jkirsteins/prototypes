import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { axeInHand, axeNear, freshTool, pile, wearTool } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { check } from "../src/sim/tasks";

describe("three axes", () => {
  it("prefers iron over the celt over the flaked axe in hand", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("flakedAxe"), freshTool("stoneAxe"), freshTool("axe")];
    expect(axeInHand(state.player)!.id).toBe("axe");
    state.player.tools = [freshTool("flakedAxe"), freshTool("stoneAxe")];
    expect(axeInHand(state.player)!.id).toBe("stoneAxe");
    state.player.tools = [];
    expect(axeInHand(state.player)).toBeUndefined();
  });

  it("wears each head at its factor and keeps iron and the celt at zero", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("axe")];
    expect(wearTool(state, "axe", 150)).toBe(false);
    expect(state.player.tools[0].durability).toBe(0);
    state.player.tools = [freshTool("stoneAxe")];
    wearTool(state, "stoneAxe", 10);
    expect(state.player.tools[0].durability).toBe(85);
    state.player.tools = [freshTool("flakedAxe")];
    wearTool(state, "flakedAxe", 10);
    expect(state.player.tools[0].durability).toBe(60);
    expect(wearTool(state, "flakedAxe", 20)).toBe(true);
    expect(state.player.tools).toHaveLength(0);
  });

  it("fells twice as slow at edge 0 and half again as slow with a flaked axe", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "forest");
    const cal = calendar(state.minute, state.startDoy);
    const sharp = check(state, world, cal, "chop").duration;
    state.player.tools[0].durability = 50;
    expect(check(state, world, cal, "chop").duration).toBeCloseTo(sharp);
    state.player.tools[0].durability = 0;
    expect(check(state, world, cal, "chop").duration).toBeCloseTo(sharp * 2);
    state.player.tools = [freshTool("flakedAxe")];
    expect(check(state, world, cal, "chop").duration).toBeCloseTo(sharp * 1.5);
  });

  it("logs the blunt line once per cycle at edge 25", () => {
    const { state } = newGame(17);
    state.player.tools = [freshTool("axe")];
    wearTool(state, "axe", 76);
    wearTool(state, "axe", 5);
    expect(state.log.filter((e) => e.text.includes("blunt")).length).toBe(1);
  });

  it("sees an axe of any kind in the camp pile", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    const camp = pile(state, state.regions[state.player.region].campCell);
    expect(axeNear(state.player, [camp])).toBe(false);
    camp.items.flakedAxe = 1;
    expect(axeNear(state.player, [camp])).toBe(true);
    placeAtSpot(state, world, state.player.region, "forest");
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "chop").why).toBe("needs an axe");
  });
});
