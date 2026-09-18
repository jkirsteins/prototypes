import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { addOrder, judgeOrders, ordersHere, removeOrderByHand } from "../src/sim/orders";
import { cellOf, placeAtSpot } from "../src/sim/position";
import { RESTED_AT } from "../src/sim/sleep";
import { insertWalkAtTop, isWalkOrder } from "../src/sim/walkorders";
import { siteCamp } from "./siting-helpers";
import { Rng } from "../src/rng";
import { cellAt, neighbours, regionAt } from "../src/world/gen";
import { walkableNeighbour } from "./world-facts";
import { passable } from "../src/world/route";
import { regionState } from "../src/sim/regionstate";

describe("visible walk orders", () => {
  it("puts an explicit exact-cell walk at the top and repurposes it for a later click", () => {
    const { state, world } = newGame(3);
    mapRegion(state, world, state.player.region);
    const first = cellOf(state, world) + 1;
    const second = cellOf(state, world) + 2;
    const row = insertWalkAtTop(state, world, first);
    expect(row.req.until).toEqual({ kind: "dismissed" });
    insertWalkAtTop(state, world, second);
    const walks = ordersHere(state, world).filter(isWalkOrder);
    expect(walks).toHaveLength(1);
    expect(walks[0].id).toBe(row.id);
    expect(walks[0].req.where).toEqual({ cell: second });
    expect(ordersHere(state, world)[0].id).toBe(walks[0].id);
  });

  it("walks there and stays, resting where it stands, until the row is struck off", () => {
    const { state, world } = newGame(3);
    mapRegion(state, world, state.player.region);
    const from = cellOf(state, world);
    const target = neighbours(world, from).find((cell) => cellAt(world, cell).terrain !== "water")!;
    const row = insertWalkAtTop(state, world, target);
    let arrived: number | null = null;
    for (let minute = 0; minute < 300 && arrived === null; minute++) {
      advance(state, world, 1);
      if (cellOf(state, world) === target) arrived = state.minute;
    }
    expect(arrived).not.toBeNull();
    advance(state, world, 3);
    // Still there, still on the list, and resting under the row's own name.
    expect(cellOf(state, world)).toBe(target);
    expect(ordersHere(state, world)[0].id).toBe(row.id);
    expect(state.task?.id).toBe("rest");
    expect(state.intent?.orderId).toBe(row.id);
    expect(state.intent?.step).toContain("staying here");
    // Struck off the way the x does it: the stay ends with the row.
    removeOrderByHand(state, world, calendar(state.minute, state.startDoy), new Rng(1), row.id);
    advance(state, world, 2);
    expect(ordersHere(state, world).some(isWalkOrder)).toBe(false);
    expect(state.intent?.orderId ?? null).not.toBe(row.id);
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
    state.player.collapsed = true;
    state.player.bodyNeed = "spent";

    expect(startIntent(state, world, calendar(state.minute), new Rng(1), walk.req, walk.id)).toBe(false);
    expect(state.task).toBeNull();
    judgeOrders(state, world, calendar(state.minute));
    // The collapse gate names itself and the line it is waiting for, so the
    // skipped row does not read as the list being broken.
    expect(walk.skipped).toBe(`resting to ${RESTED_AT} Stamina after a collapse`);

    state.player.energy = RESTED_AT;
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
    for (let minute = 0; minute < 1000 && cellOf(state, world) !== target; minute++) {
      advance(state, world, 1);
      if (state.task?.id === "walk" && resumedAt === null) resumedAt = state.player.energy;
    }

    expect(resumedAt).not.toBeNull();
    expect(resumedAt!).toBeGreaterThanOrEqual(RESTED_AT - 0.2);
    // Arrived, and the row stays with the survivor until it is struck off.
    expect(cellOf(state, world)).toBe(target);
    expect(ordersHere(state, world).some(isWalkOrder)).toBe(true);
  });

  it("keeps a cross-region walk owned by, and moves it from its source queue to the destination's on arrival", () => {
    const { state, world } = newGame(3);
    const source = state.player.region;
    // A neighbour with ground to walk to: a region's neighbours include the far
    // side of any water it borders, and those hold no passable cell at all.
    const destination = walkableNeighbour(world, source);
    mapRegion(state, world, source);
    mapRegion(state, world, destination);
    const target = regionAt(world, destination).cells.find((cell) => passable(cellAt(world, cell).terrain));
    if (target === undefined) throw new Error("neighbour has no passable cell");
    const order = insertWalkAtTop(state, world, target);
    const sourceState = regionState(state, world, source);
    expect(startIntent(state, world, calendar(state.minute), new Rng(1), order.req, order.id)).toBe(true);

    for (let minute = 0; minute < 6000 && sourceState.orders.some((row) => row.id === order.id); minute++) advance(state, world, 1);

    expect(state.player.region).toBe(destination);
    expect(sourceState.orders.some((row) => row.id === order.id)).toBe(false);
    // The staying is read from the list of the region the survivor is in,
    // so that is where the row now lives, on top, with the stay under it.
    expect(ordersHere(state, world)[0]?.id).toBe(order.id);
    advance(state, world, 2);
    expect(state.intent?.orderId).toBe(order.id);
    expect(state.task?.id).toBe("rest");
  });
});
