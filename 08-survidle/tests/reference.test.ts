import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { pile, qty } from "../src/sim/inventory";
import { ordersHere } from "../src/sim/orders";
import { REFERENCE_ORDERS, setUpReference } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";

describe("the reference player", () => {
  it("every order is added as the kind it names", () => {
    const { state, world } = setUpReference(17);
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    list.forEach((o, i) => {
      expect(o.kind, `order ${i + 1}`).toBe(REFERENCE_ORDERS[i].kind);
    });
  });

  it("the knife, fire drill, fishing spear and bow are made once; the axe keep stays, for the spare", () => {
    for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) {
      const o = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(o.kind, id).toBe("job");
      expect(o.req.until.kind, id).toBe("once");
    }
    const axe = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "axe")!;
    expect(axe.kind).toBe("keep");
  });

  it("holds three days on seed 17 and has water at camp", () => {
    const { state, world } = setUpReference(17);
    advance(state, world, 3 * 1440);
    expect(state.dead).toBeNull();
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
    expect(calendar(state.minute).day).toBe(4);
  });
});
