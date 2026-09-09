import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { BODY_SENTENCE, bodyRowOf } from "../src/sim/bodyorder";
import { newGame } from "../src/sim/newgame";
import { addOrder, judgeOrders, pinOrderByHand } from "../src/sim/orders";
import { ordersHtml, queueHtml } from "../src/ui/panels";
import { css } from "./css";

/** A cabin with nothing to build it from: a row that reads blocked wherever it is ranked, which is what a pin needs to hold the list. */
const CABIN = { task: "build" as const, arg: "cabin", until: { kind: "once" as const }, deliver: "leave" as const, where: "nearest" as const };
const STICKS = { task: "sticks" as const, until: { kind: "forever" as const }, deliver: "camp" as const, where: "nearest" as const };

describe("the order panel", () => {
  it("names whether a blocked row stops or skips the rows below it", () => {
    const { state, world } = newGame(1);
    const o = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    const off = ordersHtml(state, world, cal);
    expect(off).toContain(`data-act="order-pin" data-id="${o.id}"`);
    expect(off).toContain("on block: skip");

    o.pinned = true;
    const on = ordersHtml(state, world, cal);
    expect(on).toContain("on block: stop");
  });

  it("an ordinary row carries available rank controls, pin and remove; the body's row carries rank alone", () => {
    const { state, world } = newGame(1);
    const o = addOrder(state, world, STICKS, "grind");
    advance(state, world, 1);
    const body = bodyRowOf(state, world)!;
    const html = ordersHtml(state, world, calendar(state.minute, state.startDoy));

    for (const act of ["order-up", "order-pin", "order-remove"]) {
      expect(html, act).toContain(`data-act="${act}" data-id="${o.id}"`);
    }
    expect(html).not.toContain(`data-act="order-down" data-id="${o.id}"`);
    expect(html).toContain(`data-act="order-down" data-id="${body.id}"`);
    expect(html).not.toContain(`data-act="order-remove" data-id="${body.id}"`);
    expect(html).not.toContain(`data-act="order-pin" data-id="${body.id}"`);
  });

  it("the body row stays concise while its current need is shown in the main activity strip", () => {
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
    expect(html).not.toMatch(/drink|water/i);
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
    expect(ordersHtml(state, world, cal)).not.toContain("Queue stopped at");
    expect(judgeOrders(state, world, cal).work?.id).toBe(sticks.id);

    pinOrderByHand(state, world, cal, new Rng(state.rng), blocked.id);
    const held = ordersHtml(state, world, cal);
    expect(judgeOrders(state, world, cal).blockedBy?.id).toBe(blocked.id);
    expect(held).toContain("Queue stopped at");
    expect(held).toContain(">blocked</span>");
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
    expect(ordersHtml(state, world, cal)).toContain("Queue stopped at");

    pinOrderByHand(state, world, cal, new Rng(state.rng), blocked.id);
    expect(blocked.pinned).toBe(false);
    expect(ordersHtml(state, world, cal)).not.toContain("Queue stopped at");
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

  it("is named once and counts only what was ordered, and explains nothing about itself", () => {
    const { state, world } = newGame(1);
    advance(state, world, 1);
    const cal = calendar(state.minute, state.startDoy);

    // The body's row is on every list, so counting rows cannot tell a list of
    // orders from a camp nobody has ordered anything at: no count until one
    // is given.
    const html = queueHtml(state, world, cal);
    expect(html).toContain("<h2>Activity queue</h2>");
    expect(html).toContain(BODY_SENTENCE);
    // Nothing in the UI explains the UI. A sentence saying how the list runs
    // is the interface talking about itself instead of about the run.
    expect(html).not.toMatch(/goes to the top|run in turn|while you are away/);

    addOrder(state, world, STICKS, "grind");
    expect(queueHtml(state, world, cal)).toContain('<h2>Activity queue <span class="r">1</span></h2>');
  });

  it("the care rows and the held banner have their own marks in the stylesheet, in the column that draws them", () => {
    // The rows are drawn in the queue's own column. A rule written for #task
    // alone matched nothing there, and the queue lost its rank marks, its
    // banner and its landing rule without a test noticing.
    expect(css).toContain("#orders .order.care");
    expect(css).toContain("#orders .held");
    expect(css).toContain("#orders .rule");
  });
});
