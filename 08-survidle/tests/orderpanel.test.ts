import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { BODY_SENTENCE, bodyRowOf } from "../src/sim/bodyorder";
import { newGame } from "../src/sim/newgame";
import { addOrder, judgeOrders, pinOrderByHand } from "../src/sim/orders";
import { ordersHtml, taskHtml } from "../src/ui/panels";
import { css } from "./css";

/** A cabin with nothing to build it from: a row that reads blocked wherever it is ranked, which is what a pin needs to hold the list. */
const CABIN = { task: "build" as const, arg: "cabin", until: { kind: "once" as const }, deliver: "leave" as const, where: "nearest" as const };
const STICKS = { task: "sticks" as const, until: { kind: "forever" as const }, deliver: "camp" as const, where: "nearest" as const };

describe("the order panel", () => {
  it("every row but the body's carries the pin, and it says which state it is in and what that costs", () => {
    const { state, world } = newGame(1);
    const o = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    const off = ordersHtml(state, world, cal);
    expect(off).toContain(`data-act="order-pin" data-id="${o.id}"`);
    expect(off).toContain("do this first");
    expect(off).not.toContain("holds the list");

    o.pinned = true;
    const on = ordersHtml(state, world, cal);
    expect(on).toContain("doing this first - holds the list");
    // The state is on the button as well as in its words: a pin is a switch,
    // and a switch that looks the same either way is the confusion itself.
    expect(on).toMatch(new RegExp(`class="mini on" data-act="order-pin" data-id="${o.id}"`));
  });

  it("an ordinary row carries rank, pin and remove; the body's row carries rank alone", () => {
    const { state, world } = newGame(1);
    const o = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const body = bodyRowOf(state, world)!;
    const html = ordersHtml(state, world, calendar(state.minute, state.startDoy));

    for (const act of ["order-up", "order-down", "order-pin", "order-remove"]) {
      expect(html, act).toContain(`data-act="${act}" data-id="${o.id}"`);
    }
    expect(html).toContain(`data-act="order-down" data-id="${body.id}"`);
    expect(html).not.toContain(`data-act="order-remove" data-id="${body.id}"`);
    expect(html).not.toContain(`data-act="order-pin" data-id="${body.id}"`);
  });

  it("the body row shows the need it is serving as its step, on the row rather than loose above the list", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, STICKS, "grind");
    const body = bodyRowOf(state, world)!;
    // Seed 3's camp holds no water, so a thirst there is a walk to the shore -
    // a need whose step takes the survivor's feet and so claims the row's own
    // minute. The skin is emptied each minute so the thirst does not end in a
    // mouthful before the row has had one.
    for (let i = 0; i < 40 && state.intent?.orderId !== body.id; i++) {
      state.player.water = 0;
      advance(state, world, 1);
    }
    expect(state.intent?.orderId).toBe(body.id);
    const html = ordersHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain(BODY_SENTENCE);
    expect(html).toMatch(/drink|water/i);
    // One place, not two: the loose wait line above the list is the
    // scheduler's own wait and says nothing while the body has the minute.
    expect(html).not.toContain("Waiting at camp");
  });

  it("a pinned row holding the list raises a banner naming the row, the reason and the way out", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, CABIN, "job");
    const sticks = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    // Unpinned, the cabin is passed over and the sticks run: nothing is held.
    expect(ordersHtml(state, world, cal)).not.toContain("The list is held up by");
    expect(judgeOrders(state, world, cal).work?.id).toBe(sticks.id);

    blocked.pinned = true;
    const held = ordersHtml(state, world, cal);
    expect(judgeOrders(state, world, cal).blockedBy?.id).toBe(blocked.id);
    expect(held).toContain("The list is held up by");
    expect(held).toContain("Unpin it");
    // The reason the row itself gives is the reason the banner gives.
    expect(held).toContain(blocked.skipped);
    expect(blocked.skipped.length).toBeGreaterThan(0);
  });

  it("unpinning through the door clears the banner and lets the list run again", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, CABIN, "job");
    const sticks = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    pinOrderByHand(state, world, cal, new Rng(state.rng), blocked.id);
    expect(blocked.pinned).toBe(true);
    expect(ordersHtml(state, world, cal)).toContain("The list is held up by");

    pinOrderByHand(state, world, cal, new Rng(state.rng), blocked.id);
    expect(blocked.pinned).toBe(false);
    expect(ordersHtml(state, world, cal)).not.toContain("The list is held up by");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(sticks.id);
  });

  it("the body's row cannot be pinned: the list never goes past it", () => {
    const { state, world } = newGame(1);
    advance(state, world, 1);
    const body = bodyRowOf(state, world)!;
    pinOrderByHand(state, world, calendar(state.minute, state.startDoy), new Rng(state.rng), body.id);
    expect(body.pinned).toBeUndefined();
  });

  it("the landing rule heads the list, and the heading says orders only when orders were given", () => {
    const { state, world } = newGame(1);
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    // The body's row is on every list, so counting rows cannot tell a list of
    // orders from a camp nobody has ordered anything at.
    const html = taskHtml(state, world, cal);
    expect(html).toContain("<h2>Doing</h2>");
    expect(html).toContain(BODY_SENTENCE);
    expect(html).toContain("A click goes to the top. A standing order goes to the bottom.");
    // The rule sits above every row, which is where a player looks for a row
    // they have just given and cannot find.
    expect(html.indexOf("A click goes to the top")).toBeLessThan(html.indexOf('class="order'));

    addOrder(state, world, STICKS, "grind");
    expect(taskHtml(state, world, cal)).toContain("<h2>Orders</h2>");
  });

  it("the care rows and the held banner have their own marks in the stylesheet", () => {
    expect(css).toContain("#task .order.care");
    expect(css).toContain("#task .held");
    expect(css).toContain("#task .rule");
  });
});
