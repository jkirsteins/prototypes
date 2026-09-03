import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, check } from "../src/sim/tasks";

const cal = calendar(0);

describe("the order record", () => {
  it("a new region has an empty list and ids start at 1", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
  });

  it("a save without orders loads with empty lists, and a live intent without an order is manual", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      delete st.orders;
      delete st.nextOrderId;
    }
    delete raw.state.intent.orderId;
    delete raw.state.intent.windDown;
    const file = deserialize(JSON.stringify(raw))!;
    const st = file.state.regions[file.state.player.region];
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
    expect(file.state.intent?.orderId).toBeNull();
    expect(file.state.intent?.windDown).toBe(false);
  });

  it("a manual intent starts with no order and no wind-down", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(state.intent?.windDown).toBe(false);
  });

  it("waiting at camp is an option the runner can name but a task no one can start by hand", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "wait");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Wait at camp");
    expect(beginTask(state, world, cal, "wait")).toBe(false);
    expect(state.task).toBeNull();
  });
});
