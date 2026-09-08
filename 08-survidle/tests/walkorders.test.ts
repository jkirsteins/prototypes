import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { addOrder, ordersHere } from "../src/sim/orders";
import { cellOf, placeAtSpot } from "../src/sim/position";
import { insertWalkAtTop, isWalkOrder } from "../src/sim/walkorders";
import { siteCamp } from "./siting-helpers";

describe("visible walk orders", () => {
  it("puts an explicit exact-cell walk at the top and replaces an older walk", () => {
    const { state, world } = newGame(3);
    mapRegion(state, world, state.player.region);
    const first = cellOf(state, world) + 1;
    const second = cellOf(state, world) + 2;
    insertWalkAtTop(state, world, first);
    insertWalkAtTop(state, world, second);
    const walks = ordersHere(state, world).filter(isWalkOrder);
    expect(walks).toHaveLength(1);
    expect(walks[0].req.where).toEqual({ cell: second });
    expect(ordersHere(state, world)[0].id).toBe(walks[0].id);
  });

  it("keeps movement required by a standing order inside that order", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    mapRegion(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "heath");
    addOrder(state, world, { task: "deadwood", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 1);
    expect(ordersHere(state, world).some(isWalkOrder)).toBe(false);
    expect(state.task?.id).toBe("walk");
  });
});
