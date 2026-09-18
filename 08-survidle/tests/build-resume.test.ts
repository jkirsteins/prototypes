/**
 * A build set aside comes back with its bar where the work stopped.
 *
 * The minutes live on the camp site (setAside); a resumed build used to
 * start at zero over the remainder, and the player could not tell it had
 * resumed. Setting it aside again banks only what came after.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { beginTask, setAside } from "../src/sim/tasks";
import { siteCamp } from "./siting-helpers";

describe("a resumed build", () => {
  it("starts its bar at the minutes already banked, and banks only the new minutes when set aside again", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    const camp = pile(state, st.campCell!);
    addItem(camp, "log", 6); addItem(camp, "stick", 12); addItem(camp, "bark", 20); addItem(camp, "cordage", 3);
    state.player.water = 3; state.player.kcal = 3000; state.player.energy = 90; state.player.sleepDebt = 0;
    while (calendar(state.minute, state.startDoy).hour < 9) state.minute++;
    const cal = () => calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal(), "build", "vedbod")).toBe(true);
    const total = state.task!.duration;
    expect(state.task!.carried).toBeUndefined();
    advance(state, world, 60);
    const done = state.task!.progress;
    expect(done).toBeGreaterThan(0);
    setAside(state, world);
    const site = siteFor(st, st.campCell!);
    expect(site.build.vedbod).toBeCloseTo(done, 2);
    expect(beginTask(state, world, cal(), "build", "vedbod")).toBe(true);
    // Resumed: the same whole, the bar at the banked share, materials not paid twice.
    expect(state.task!.duration).toBeCloseTo(total, 2);
    expect(state.task!.progress).toBeCloseTo(done, 2);
    expect(state.task!.carried).toBeCloseTo(done, 2);
    expect(camp.items.log ?? 0).toBe(0);
    advance(state, world, 30);
    const later = state.task!.progress;
    setAside(state, world);
    expect(site.build.vedbod).toBeCloseTo(later, 2);
    expect(site.build.vedbod!).toBeLessThan(done * 2);
  });
});
