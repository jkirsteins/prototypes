/**
 * One fire to a cell.
 *
 * A pit and a field fire are the same cell's fire: the pit is not built
 * over a burning field fire, a field fire is not lit beside a pit, a pit
 * is not ordered twice, and the row that builds it is not drawn once it
 * stands (items.ts, oneOfAKind).
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { addOrder, ordersHere } from "../src/sim/orders";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { isWorkOrder } from "../src/sim/types";
import { paneHtml } from "./pane";
import { siteCamp } from "./siting-helpers";
import { neighbourLandCell } from "./siting-helpers";

function camped(seed = 3) {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  return { state, world, st, cal: calendar(state.minute, state.startDoy) };
}

describe("one fire to a cell", () => {
  it("does not build the pit over a burning field fire", () => {
    const { state, world, cal } = camped();
    expect(check(state, world, cal, "build", "firePit").ok).toBe(true);
    state.player.fieldFire = { cell: cellOf(state, world), fuelKg: 3 };
    const o = check(state, world, cal, "build", "firePit");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("a fire is burning here");
  });

  it("does not light a field fire beside a pit at a camp given up", () => {
    const { state, world, st, cal } = camped();
    const old = neighbourLandCell(world, st.campCell!);
    siteFor(st, old).structures.firePit = true;
    placeAt(state, world, old);
    state.player.pack.items.firewood = 2;
    const o = check(state, world, cal, "light");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("a fire site stands here");
  });

  it("orders the pit once", () => {
    const { state, world } = camped();
    const first = addOrder(state, world, { task: "build", arg: "firePit", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const second = addOrder(state, world, { task: "build", arg: "firePit", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(second).toBe(first);
    expect(ordersHere(state, world).filter((o) => isWorkOrder(o) && o.req.task === "build")).toHaveLength(1);
    // A vedbod is a count, so a second one is a second vedbod: the same
    // click again, which is the one row counted up.
    const shed = addOrder(state, world, { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(ordersHere(state, world).filter((o) => isWorkOrder(o) && o.req.arg === "vedbod")).toHaveLength(1);
    expect(shed.req.until).toEqual({ kind: "once", n: 2 });
  });

  it("stops drawing the build row once the pit stands", () => {
    const { state, world, st, cal } = camped();
    expect(paneHtml(state, world, cal, "build", "firePit")).toContain("Build fire site");
    siteFor(st, st.campCell!).structures.firePit = true;
    expect(paneHtml(state, world, cal, "build", "firePit")).not.toContain("Build fire site");
  });
});
