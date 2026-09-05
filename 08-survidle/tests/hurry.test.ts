import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { die } from "../src/sim/player";
import { startTask } from "../src/sim/tasks";
import { hurryClick, hurryFrame, hurryKind, newHurry, PEAK, PULSE_MIN, PULSE_S, pulseLeft, RAMP_S } from "../src/ui/hurry";

const cal = calendar(0);

/** Runs frames of the given lengths and returns the extra minutes they carried. */
function frames(h: ReturnType<typeof newHurry>, kind: "auto" | "click" | "none", live: number | null, lengths: number[]): number {
  return lengths.reduce((sum, d) => sum + hurryFrame(h, kind, live, d), 0);
}

describe("the auto ramp", () => {
  it("carries the same minutes over the ramp however the frames fall, and the full rate after it", () => {
    const whole = (PEAK - 1) * RAMP_S / 2;
    const one = frames(newHurry(), "auto", null, [RAMP_S]);
    const fine = frames(newHurry(), "auto", null, new Array(20).fill(RAMP_S / 20));
    const mixed = frames(newHurry(), "auto", null, [0.1, 0.25, 1, RAMP_S - 1.35]);
    expect(one).toBeCloseTo(whole, 9);
    expect(fine).toBeCloseTo(whole, 9);
    expect(mixed).toBeCloseTo(whole, 9);
    const h = newHurry();
    frames(h, "auto", null, [RAMP_S]);
    expect(h.rate).toBeCloseTo(PEAK, 9);
    expect(hurryFrame(h, "auto", null, 0.5)).toBeCloseTo((PEAK - 1) * 0.5, 9);
  });

  it("reads 1 the frame after the kind breaks, and starts the climb over", () => {
    const h = newHurry();
    frames(h, "auto", null, [RAMP_S]);
    expect(hurryFrame(h, "none", null, 0.1)).toBe(0);
    expect(h.rate).toBe(1);
    expect(h.held).toBe(0);
    const again = hurryFrame(h, "auto", null, 0.1);
    expect(again).toBeLessThan((PEAK - 1) * 0.1 * 0.05);
    expect(h.rate).toBeGreaterThan(1);
    expect(h.rate).toBeLessThan(1.2);
  });

  it("with nothing to hurry a frame carries nothing and leaves the state alone", () => {
    const h = newHurry();
    expect(hurryFrame(h, "none", null, 1)).toBe(0);
    expect(h).toEqual(newHurry());
  });
});

describe("the pulse", () => {
  it("starts on a click, refuses a second while it runs, and sums to its minutes however the frames fall", () => {
    const h = newHurry();
    expect(hurryClick(h, "click", 3)).toBe(true);
    expect(pulseLeft(h)).toBe(1);
    expect(hurryClick(h, "click", 3)).toBe(false);
    const got = frames(h, "click", 3, [PULSE_S / 3, PULSE_S / 7, PULSE_S / 2, PULSE_S]);
    expect(got).toBeCloseTo(PULSE_MIN, 9);
    expect(h.pulse).toBeNull();
    expect(pulseLeft(h)).toBe(0);
    expect(hurryFrame(h, "click", 3, 0.2)).toBe(0);
    expect(h.rate).toBe(1);
    expect(hurryClick(h, "click", 3)).toBe(true);
    const fine = frames(h, "click", 3, new Array(50).fill(PULSE_S / 50));
    expect(fine).toBeCloseTo(PULSE_MIN, 9);
  });

  it("clicking as fast as the pulse allows averages the auto rate", () => {
    expect(PULSE_MIN / PULSE_S).toBeCloseTo(PEAK - 1, 9);
  });

  it("peaks in the middle and reads 1 at the ends", () => {
    const h = newHurry();
    hurryClick(h, "click", 3);
    hurryFrame(h, "click", 3, PULSE_S / 2);
    expect(h.rate).toBeCloseTo(1 + (2 * PULSE_MIN) / PULSE_S, 9);
  });

  it("is dropped, minutes forfeited, when its order stops being the one served", () => {
    const h = newHurry();
    hurryClick(h, "click", 3);
    const first = hurryFrame(h, "click", 3, PULSE_S / 4);
    expect(first).toBeGreaterThan(0);
    expect(hurryFrame(h, "click", 4, PULSE_S / 4)).toBe(0);
    expect(h.pulse).toBeNull();
    expect(h.rate).toBe(1);
    hurryClick(h, "click", 4);
    expect(hurryFrame(h, "none", 4, PULSE_S / 4)).toBe(0);
    expect(h.pulse).toBeNull();
  });

  it("cannot start without a live click order", () => {
    const h = newHurry();
    expect(hurryClick(h, "auto", null)).toBe(false);
    expect(hurryClick(h, "none", 3)).toBe(false);
    expect(hurryClick(h, "click", null)).toBe(false);
  });
});

describe("what is hurried", () => {
  it("a raw task by hand is auto, and nothing at all is none", () => {
    const { state, world } = newGame(3);
    expect(hurryKind(state)).toBe("none");
    startTask(state, world, cal, "walk", "spot:forest", false, new Rng(1));
    expect(state.task?.id).toBe("walk");
    expect(hurryKind(state)).toBe("auto");
  });

  it("a once order is auto, a counted or standing order is clicked, and the runner waiting is none", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).not.toBeNull();
    expect(hurryKind(state)).toBe("auto");
    const g2 = newGame(3);
    addOrder(g2.state, g2.world, { task: "sticks", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" }, "job");
    advance(g2.state, g2.world, 1);
    expect(g2.state.intent?.orderId).not.toBeNull();
    expect(hurryKind(g2.state)).toBe("click");
    const g3 = newGame(3);
    addOrder(g3.state, g3.world, { task: "sticks", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, "grind");
    advance(g3.state, g3.world, 1);
    expect(hurryKind(g3.state)).toBe("click");
    const g4 = newGame(3);
    addItem(herePile(g4.state, g4.world), "firewood", 50);
    addOrder(g4.state, g4.world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    advance(g4.state, g4.world, 1);
    expect(g4.state.intent?.task).toBe("wait");
    expect(hurryKind(g4.state)).toBe("none");
  });

  it("a hand-started intent is auto, a body need is none, and so is death", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(hurryKind(state)).toBe("auto");
    state.intent!.need = "sleep";
    expect(hurryKind(state)).toBe("none");
    state.intent!.need = null;
    expect(hurryKind(state)).toBe("auto");
    die(state, "froze");
    expect(hurryKind(state)).toBe("none");
  });
});
