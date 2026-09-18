/**
 * A care row that has the minute says when the rows under it can run.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { bodyRowOf } from "../src/sim/bodyorder";
import { newGame } from "../src/sim/newgame";
import { updateBars } from "../src/ui/bars";
import { queueHtml } from "../src/ui/panels";

describe("the Self-care ETA", () => {
  it("counts the live care step down on its own row and is blank otherwise", () => {
    const { state, world } = newGame(3);
    const cal = calendar(state.minute, state.startDoy);
    const row = bodyRowOf(state, world)!;
    document.body.innerHTML = `<div id="orders">${queueHtml(state, world, cal)}</div><div class="bar readout task"><div class="fill" data-bar="task"></div><span class="lbl"><span data-val="task"></span><span data-pct="task"></span></span></div>`;
    const eta = document.querySelector<HTMLElement>('[data-eta="body"]')!;
    expect(eta).not.toBeNull();
    updateBars(state, world, document);
    expect(eta.textContent).toBe("");
    state.intent = { mode: "care", care: "body", need: "spent", orderId: row.id, step: "resting" };
    state.task = { id: "rest", arg: undefined, progress: 10, duration: 40, repeat: false };
    updateBars(state, world, document);
    expect(eta.textContent).toBe("frees the rows below in 30 s");
    expect(document.querySelector<HTMLElement>('[data-eta="camp"]')!.textContent).toBe("");
    state.task = null;
    updateBars(state, world, document);
    expect(eta.textContent).toBe("");
  });
});
