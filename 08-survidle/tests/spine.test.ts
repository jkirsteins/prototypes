import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { current } from "../src/sim/record";
import { regionState } from "../src/sim/regionstate";
import { expectedDoy, nextThreshold, stepSpine, THRESHOLDS } from "../src/sim/spine";

describe("the season spine", () => {
  it("expects the thresholds in year order from the curve", () => {
    expect(expectedDoy("berries")).toBe(195);
    expect(expectedDoy("rut")).toBe(263);
    const order = ["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark"] as const;
    for (let i = 1; i < order.length; i++) expect(expectedDoy(order[i])).toBeGreaterThan(expectedDoy(order[i - 1]));
    expect(expectedDoy("coldSnap")).toBeLessThan(60);
    expect(expectedDoy("iceOut")).toBeGreaterThan(expectedDoy("coldSnap"));
    expect(expectedDoy("iceOut")).toBeLessThan(150);
  });

  it("fires each threshold once, in order, over a year with nobody home", () => {
    const { state, world } = newGame(17);
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 430 * 1440, { nobody: true });
    const fired = THRESHOLDS.filter((id) => state.spine.fired[id] !== undefined);
    expect(fired).toEqual(["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark", "coldSnap", "iceOut"]);
    expect(state.spine.fired.coldSnap).toBe(2);
    expect(state.spine.fired.berries).toBe(1);
  });

  // Driving this through advance() over the full 12 days would need a
  // survivor that manages its own water and shelter; a bare kitOut does
  // not (seed 17 from doy 185 dies of thirst by day 2, and dies of cold by
  // day 8 even with camp water stocked by hand, for want of a lean-to
  // nobody builds). Calling stepSpine directly on the two days that matter
  // exercises the same log and record lines without that confound.
  it("announces a week ahead and records the arrival for a living survivor", () => {
    const { state } = newGame(17, 185);
    const who = { region: state.player.region, atCamp: true };
    stepSpine(state, calendar(5 * 1440, state.startDoy), who);
    expect(state.log.some((e) => e.text.startsWith("The berries are near."))).toBe(true);
    expect(current(state).events.some((e) => e.kind === "threshold")).toBe(false);
    stepSpine(state, calendar(10 * 1440, state.startDoy), who);
    expect(current(state).events.some((e) => e.kind === "threshold" && e.id === "berries")).toBe(true);
    expect(state.log.some((e) => e.text.startsWith("The berries. Day "))).toBe(true);
  });

  it("names the next threshold and its distance", () => {
    const { state } = newGame(17, 100);
    const n = nextThreshold(state, calendar(0, 100));
    expect(n.id).toBe("berries");
    expect(n.inDays).toBe(95);
  });

  it("pushes one forecast slot per day of a life", () => {
    const { state, world } = newGame(17);
    // A bare arrival kit has no water; stock camp so three idle days are
    // about the forecast field, not a thirst death cutting the run short.
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "water", 20);
    advance(state, world, 3 * 1440);
    expect(state.dead).toBeFalsy();
    expect(current(state).forecast).toEqual([null, null, null]);
  });
});
