import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { current } from "../src/sim/record";
import { regionState } from "../src/sim/regionstate";
import { expectedDoy, nextThreshold, stepSpine, THRESHOLDS } from "../src/sim/spine";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

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
    siteCamp(state, world);
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 430 * 1440, { nobody: true });
    // Six of the eight are what a year at this landing reaches. The cold snap
    // wants -20 C at the cell and a sea-level coast never sees it, so the snap
    // and the ice-out that waits behind it are driven below on the same
    // detector, with the air pushed under the line rather than the world moved.
    const reached = THRESHOLDS.filter((id) => state.spine.fired[id] !== undefined);
    expect(reached).toEqual(["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark"]);
    expect(state.spine.fired.berries).toBe(1);

    const snapDay = calendar(314 * 1440, state.startDoy);
    expect(snapDay.season).toBe("winter");
    state.weather.offset = -30;
    state.weather.iceCm = 20;
    stepSpine(state, snapDay, null);
    const snapYear = state.spine.fired.coldSnap;
    expect(snapYear).toBeDefined();
    // Once a winter: the same snap a day later is the same winter's.
    stepSpine(state, calendar(315 * 1440, state.startDoy), null);
    expect(state.spine.fired.coldSnap).toBe(snapYear);
    // Ice-out waits for the snap and for the water to open.
    state.weather.iceCm = 0;
    stepSpine(state, calendar(330 * 1440, state.startDoy), null);
    expect(state.spine.fired.iceOut).toBeDefined();
    expect(THRESHOLDS.filter((id) => state.spine.fired[id] !== undefined))
      .toEqual(["berries", "rut", "firstFrost", "firstSnow", "lakeFreeze", "dark", "coldSnap", "iceOut"]);
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
    state.minute = 5 * 1440;
    stepSpine(state, calendar(state.minute, state.startDoy), who);
    expect(state.log.some((e) => e.text.startsWith("The berries are near."))).toBe(true);
    expect(current(state).events.some((e) => e.kind === "threshold")).toBe(false);
    state.minute = 10 * 1440;
    const arrival = calendar(state.minute, state.startDoy);
    stepSpine(state, arrival, who);
    const fired = current(state).events.find((e) => e.kind === "threshold" && e.id === "berries");
    expect(fired?.day).toBe(arrival.day);
    expect(state.log.some((e) => e.text.startsWith("The berries. Day "))).toBe(true);
  });

  it("names the next threshold and its distance", () => {
    const { state } = newGame(17, 100);
    const n = nextThreshold(state, calendar(0, 100));
    expect(n.id).toBe("berries");
    expect(n.inDays).toBe(95);
  });

  it("pushes one forecast slot per day of a life", () => {
    testAtmosphere();
    const { state, world } = newGame(17);
    siteCamp(state, world);
    // A bare arrival kit has no water; stock camp so three idle days are
    // about the forecast field, not a thirst death cutting the run short.
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "water", 20);
    advance(state, world, 3 * 1440);
    expect(state.dead).toBeFalsy();
    expect(current(state).forecast).toEqual([null, null, null]);
  });
});
