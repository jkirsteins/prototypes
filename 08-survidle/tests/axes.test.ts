import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { addItem, axeInHand, axeNear, freshTool, pile, wearTool } from "../src/sim/inventory";
import { deserialize, serialize } from "../src/sim/save";
import { gap } from "../src/sim/skills";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { check, fallThrough } from "../src/sim/tasks";
import { Rng } from "../src/rng";
import { current } from "../src/sim/record";

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

describe("stone axe recipes", () => {
  it("flakes an axe in ninety minutes at no tier and grinds a celt in twenty hours at Crafting 5 with the whetstone", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stone", 3);
    addItem(state.player.pack, "stick", 2);
    addItem(state.player.pack, "cordage", 4);
    state.player.tools.push(freshTool("knife"), freshTool("whetstone"));
    const cal = calendar(state.minute, state.startDoy);
    const flaked = check(state, world, cal, "craft", "flakedAxe");
    expect(flaked.ok).toBe(true);
    expect(flaked.duration).toBe(90);
    expect(flaked.recommended).toBeUndefined();
    const celt = check(state, world, cal, "craft", "stoneAxe");
    expect(celt.ok).toBe(true);
    expect(celt.duration).toBe(1200);
    expect(gap(state, "craft:stoneAxe")).toBe(4);
    state.player.tools = state.player.tools.filter((t) => t.id !== "whetstone");
    expect(check(state, world, cal, "craft", "stoneAxe").why).toBe("needs a whetstone");
  });

  it("carries an old save's axe mastery over to the celt", () => {
    const { state } = newGame(17);
    state.skills.crafting.mastery["craft:axe"] = 300;
    const back = deserialize(serialize(state));
    expect(back!.state.skills.crafting.mastery["craft:axe"]).toBeUndefined();
    expect(back!.state.skills.crafting.mastery["craft:stoneAxe"]).toBe(300);
  });
});

describe("the axe through the ice", () => {
  it("is lost one time in two on a survived fall, and the record says so", () => {
    // Rng(1) draws 0.627 then 0.003: the fall is survived (0.6 and over) and the axe goes (under 0.5).
    const { state, world } = newGame(17);
    const land = state.regions[state.player.region].campCell;
    fallThrough(state, world, new Rng(1), land);
    expect(state.dead).toBeNull();
    expect(axeInHand(state.player)).toBeUndefined();
    expect(current(state).events.some((e) => e.kind === "toolLost" && e.tool === "axe")).toBe(true);
    expect(state.log.some((e) => e.text.includes("bottom"))).toBe(true);
  });

  it("stays in hand the other time", () => {
    // Rng(5) draws 0.690 then 0.773: survived, and the axe holds.
    const { state, world } = newGame(17);
    const land = state.regions[state.player.region].campCell;
    fallThrough(state, world, new Rng(5), land);
    expect(state.dead).toBeNull();
    expect(axeInHand(state.player)!.id).toBe("axe");
  });
});
