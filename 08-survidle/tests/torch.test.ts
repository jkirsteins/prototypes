import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { ITEM_KG, RECIPES, TORCH_BURN_MINUTES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import { MASTERY_KEYS } from "../src/sim/skills";
import { startTask, stepTask } from "../src/sim/tasks";

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
