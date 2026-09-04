import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { abandon, DEATH_LINES, die } from "../src/sim/player";
import { current, hasEvent, noteNight, record, worldDate } from "../src/sim/record";
import { enterRegion, regionState } from "../src/sim/regionstate";
import { startTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";

describe("the life record", () => {
  it("starts a new game with one survivor, landed on the start day of year 1", () => {
    const { state } = newGame(8);
    expect(state.survivors).toHaveLength(1);
    const rec = current(state);
    expect(rec.index).toBe(1);
    expect(rec.landed).toEqual({ year: 1, doy: 90 });
    expect(rec.gapDays).toBe(0);
    expect(rec.events).toEqual([]);
    expect(rec.died).toBeNull();
    expect(state.year).toBe(1);
  });

  it("gives a world date for any minute of the life, stepping the year past 31 December", () => {
    const { state } = newGame(8, 360);
    expect(worldDate(state, 0)).toEqual({ year: 1, doy: 360 });
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 2, doy: 5 });
    state.year = 3;
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 4, doy: 5 });
  });
});

describe("the record's seams", () => {
  it("stamps day and date on an event", () => {
    const { state } = newGame(8);
    // Set the clock directly rather than advancing it: an idle body left
    // running three full days with no orders can freeze before minute 4320
    // arrives, which is a property of the sim, not of what record() stamps.
    state.minute = 3 * 1440;
    record(state, { kind: "storm" });
    const e = current(state).events[0];
    expect(e.kind).toBe("storm");
    expect(e.day).toBe(4);
    expect(e.date).toEqual({ year: 1, doy: 93 });
  });

  it("records a region entered once and a build finished", () => {
    const { state, world } = newGame(8);
    const r = regionAt(world, state.player.region);
    const other = r.neighbours[0].id;
    enterRegion(state, world, other);
    expect(hasEvent(state, (e) => e.kind === "entered" && e.region === regionAt(world, other).name)).toBe(true);
    enterRegion(state, world, other);
    expect(current(state).events.filter((e) => e.kind === "entered").length).toBe(1);
    // A build finished: the fire pit, from stone laid at camp.
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "stone", 6);
    startTask(state, world, calendar(0), "build", "firePit");
    advance(state, world, 60);
    expect(hasEvent(state, (e) => e.kind === "built" && e.structure === "firePit")).toBe(true);
  });

  it("keeps the worst night as one running minimum", () => {
    const { state } = newGame(8);
    noteNight(state, 40, false);
    noteNight(state, 25, true);
    noteNight(state, 30, false);
    expect(current(state).worst).toEqual({ day: 1, warmth: 25, wolves: true });
  });

  it("fills the died block at death with what was in hand", () => {
    const { state, world } = newGame(8);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "firewood", 6);
    addItem(pile(state, st.campCell), "driedMeat", 0.4);
    die(state, "froze", regionAt(world, state.player.region).name);
    const d = current(state).died!;
    expect(d.cause).toBe("froze");
    expect(d.day).toBe(1);
    expect(d.kmFromCamp).toBe(0);
    expect(d.packFoodKg).toBeCloseTo(1, 3);
    expect(d.campFirewoodKg).toBe(6);
    expect(d.campFoodKcal).toBeGreaterThan(0);
    expect(d.region).toBe(regionAt(world, state.player.region).name);
  });

  it("abandoning is a death called gave up, recorded", () => {
    const { state } = newGame(8);
    abandon(state);
    expect(state.dead!.cause).toBe("gaveUp");
    expect(hasEvent(state, (e) => e.kind === "abandoned")).toBe(true);
    expect(state.log[state.log.length - 1].text).toBe(DEATH_LINES.gaveUp);
  });
});
