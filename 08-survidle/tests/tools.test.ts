import { describe, expect, it } from "vitest";
import { itemLabel } from "../src/sim/actions";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem } from "../src/sim/intent";
import { addItem, hasTool, pile, qty, takeUp, tool, wearTool } from "../src/sim/inventory";
import { ITEM_KG, RECIPES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { addOrder, keepTarget } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, check } from "../src/sim/tasks";

const cal = calendar(0);

describe("tools as items", () => {
  it("a tool recipe yields a countable item, so a keep on it stays a keep", () => {
    expect(RECIPES.axe.out).toEqual({ item: "axe", qty: 1 });
    expect(yieldItem("craft", "axe")).toBe("axe");
    expect(ITEM_KG.axe).toBe(1.5);
    const { state, world } = newGame(17);
    const o = addOrder(state, world, { task: "craft", arg: "axe", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(keepTarget(o)).toEqual({ item: "axe", qty: 1 });
  });

  it("a broken axe with a spare in the pack is replaced at once", () => {
    const { state } = newGame(17);
    const p = state.player;
    tool(p, "axe")!.durability = 1;
    addItem(p.pack, "axe", 1);
    expect(wearTool(state, "axe", 5)).toBe(true);
    expect(hasTool(p, "axe")).toBe(true);
    expect(tool(p, "axe")!.durability).toBe(100);
    expect(qty(p.pack, "axe")).toBe(0);
    expect(state.log.at(-1)?.text).toBe("The axe has broken; you take up the spare.");
  });

  it("a broken axe with no spare is gone", () => {
    const { state } = newGame(17);
    tool(state.player, "axe")!.durability = 1;
    expect(wearTool(state, "axe", 5)).toBe(true);
    expect(hasTool(state.player, "axe")).toBe(false);
  });

  it("a spare on the ground is taken up when a task needing it starts there", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.tools = [];
    const camp = regionState(state, world, p.region).campCell;
    placeAt(state, world, camp);
    addItem(pile(state, camp), "log", 1);
    expect(check(state, world, cal, "split").ok).toBe(false);
    addItem(pile(state, camp), "axe", 1);
    expect(check(state, world, cal, "split").ok).toBe(true);
    expect(beginTask(state, world, cal, "split")).toBe(true);
    expect(hasTool(p, "axe")).toBe(true);
    expect(qty(pile(state, camp), "axe")).toBe(0);
  });

  it("a vessel taken up is empty and thawed", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "barkBucket", 1);
    expect(takeUp(state, world, "barkBucket")).toBe(true);
    expect(tool(state.player, "barkBucket")).toEqual({ id: "barkBucket", durability: 100, litres: 0, frozen: false });
  });

  it("crafting a tool you hold makes a spare; one you lack is taken up", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    const camp = regionState(state, world, p.region).campCell;
    placeAt(state, world, camp);
    addItem(p.pack, "stone", 2);
    addItem(p.pack, "stick", 1);
    addItem(p.pack, "cordage", 1);
    expect(beginTask(state, world, cal, "craft", "knife")).toBe(true);
    advance(state, world, 60);
    expect(hasTool(p, "knife")).toBe(true);
    expect(qty(p.pack, "knife")).toBe(0);
    addItem(p.pack, "stone", 2);
    addItem(p.pack, "stick", 1);
    addItem(p.pack, "cordage", 1);
    expect(beginTask(state, world, cal, "craft", "knife")).toBe(true);
    advance(state, world, 60);
    expect(qty(p.pack, "knife")).toBe(1);
  });

  it("a count item at 1 kg apiece is still counted, not weighed", () => {
    expect(ITEM_KG.fishingSpear).toBe(1.0);
    expect(itemLabel("fishingSpear", 1)).toBe("1 fishing spears");
  });

  it("saves are version 6 and a version 3 file still loads", () => {
    const { state } = newGame(17);
    const raw = JSON.parse(serialize(state));
    expect(raw.version).toBe(6);
    raw.version = 3;
    expect(deserialize(JSON.stringify(raw))).not.toBeNull();
  });
});
