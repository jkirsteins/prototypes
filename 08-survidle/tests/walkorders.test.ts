import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { addOrder, judgeOrders, ordersHere } from "../src/sim/orders";
import { cellOf, placeAtSpot } from "../src/sim/position";
import { COLLAPSE_RECOVERED_AT } from "../src/sim/sleep";
import { insertWalkAtTop, isWalkOrder } from "../src/sim/walkorders";
import { siteCamp } from "./siting-helpers";
import { Rng } from "../src/rng";
import { cellAt, neighbours } from "../src/world/gen";

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

  it("holds a collapsed explicit walk until recovery instead of retrying it after every sleep chunk", () => {
    const { state, world } = newGame(3);
    mapRegion(state, world, state.player.region);
    const from = cellOf(state, world);
    const target = neighbours(world, from).find((cell) => cellAt(world, cell).terrain !== "water")!;
    const walk = insertWalkAtTop(state, world, target);
    state.player.energy = 25;
    state.player.sleeping = { collapsed: true };

    expect(startIntent(state, world, calendar(state.minute), new Rng(1), walk.req, walk.id)).toBe(false);
    expect(state.task).toBeNull();
    judgeOrders(state, world, calendar(state.minute));
    expect(walk.skipped).toBe("too exhausted");

    state.player.energy = COLLAPSE_RECOVERED_AT;
    expect(startIntent(state, world, calendar(state.minute), new Rng(1), walk.req, walk.id)).toBe(true);
    expect(state.task?.id).toBe("walk");
  });

  it("finishes collapse recovery before retrying an explicit walk", () => {
    const { state, world } = newGame(3);
    mapRegion(state, world, state.player.region);
    const from = cellOf(state, world);
    const target = neighbours(world, from).find((cell) => cellAt(world, cell).terrain !== "water")!;
    insertWalkAtTop(state, world, target);
    state.player.energy = 20;
    state.player.sleepDebt = 0;

    let resumedAt: number | null = null;
    for (let minute = 0; minute < 1000 && ordersHere(state, world).some(isWalkOrder); minute++) {
      advance(state, world, 1);
      if (state.task?.id === "walk" && resumedAt === null) resumedAt = state.player.energy;
    }

    expect(resumedAt).not.toBeNull();
    expect(resumedAt!).toBeGreaterThanOrEqual(COLLAPSE_RECOVERED_AT - 0.2);
    expect(ordersHere(state, world).some(isWalkOrder)).toBe(false);
  });
});
