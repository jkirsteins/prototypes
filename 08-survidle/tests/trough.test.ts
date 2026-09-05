import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { WATER_STORE_L } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { campWaterCapacity, campWaterRoom, pourVessels } from "../src/sim/water";
import { regionHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";

const cal = calendar(0);

function camp(seed = 4) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  placeAt(g.state, g.world, st.campCell);
  const camp = pile(g.state, st.campCell);
  addItem(camp, "log", 1); addItem(camp, "bark", 8); addItem(camp, "cordage", 2);
  return { ...g, st, camp };
}

describe("the water trough", () => {
  it("builds at camp in three hours and adds twenty litres to what the camp holds", () => {
    const { state, world, st, camp: inv } = camp();
    expect(campWaterCapacity(inv, st)).toBe(0);
    expect(check(state, world, cal, "build", "waterStore")).toMatchObject({ ok: true, duration: 180 });
    expect(startTask(state, world, cal, "build", "waterStore")).toBe(true);
    advance(state, world, 180 * 2);
    expect(st.structures.waterStore).toBe(true);
    expect(campWaterCapacity(inv, st)).toBe(WATER_STORE_L);
    addItem(inv, "barkBucket", 1);
    expect(campWaterCapacity(inv, st)).toBe(WATER_STORE_L + 2);
    expect(campWaterCapacity(inv)).toBe(2);
  });

  it("takes what the vessels pour until it is full", () => {
    const { state, st, camp: inv } = camp();
    st.structures.waterStore = true;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 }, { id: "barkBucket", durability: 100, litres: 2 });
    expect(campWaterRoom(inv, st)).toBe(WATER_STORE_L);
    expect(pourVessels(state.player, inv, st)).toBe(4);
    expect(qty(inv, "water")).toBe(4);
    expect(campWaterRoom(inv, st)).toBe(WATER_STORE_L - 4);
  });

  it("lets a fill keep hold more water at camp than the vessels alone could", () => {
    const { state, world, st, camp: inv } = camp();
    st.structures.waterStore = true;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 0 }, { id: "barkBucket", durability: 100, litres: 0 });
    addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 20 }, deliver: "camp", where: "nearest" }, "job");
    advance(state, world, 2 * 1440);
    expect(qty(inv, "water") + qty(inv, "ice")).toBeGreaterThan(4);
  });

  it("shows on the camp panel as capacity", () => {
    const { state, world, st } = camp();
    st.structures.waterStore = true;
    const html = regionHtml(state, world, cal, newUiState());
    expect(html).toContain("water trough");
    expect(html).toContain(`of ${WATER_STORE_L.toFixed(1)} l`);
  });
});
