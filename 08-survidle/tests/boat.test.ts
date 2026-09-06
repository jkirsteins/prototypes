import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { START_DOY } from "../src/sim/calendar";
import { beginAgain, land, nextBoat, nextBoatDate, pickCandidate } from "../src/sim/landing";
import { newGame, newWorld } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";

function dead(seed = 17, days = 5) {
  const g = newGame(seed);
  advance(g.state, g.world, days * 1440);
  if (!g.state.dead) die(g.state, "froze", regionAt(g.world, g.state.player.region).name);
  return g;
}

describe("the first boat", () => {
  it("opens a new world on the landing screen with three aboard on 1 April, and a week later per boat", () => {
    const { state } = newWorld(17);
    expect(state.landing).not.toBeNull();
    expect(state.landing!.candidates).toHaveLength(3);
    expect(state.landing!.date).toEqual({ year: 1, doy: START_DOY });
    expect(state.landing!.oldCamp).toBeNull();
    expect(state.landing!.name).toEqual(state.landing!.candidates[0].name);
    expect(state.survivors).toHaveLength(1);
    expect(state.log).toEqual([]);
    const later = newWorld(17, 1);
    expect(later.state.landing!.date).toEqual({ year: 1, doy: START_DOY + 7 });
    expect(later.state.startDoy).toBe(START_DOY + 7);
    expect(later.state.landing!.candidates.map((c) => c.name)).not.toEqual(state.landing!.candidates.map((c) => c.name));
    expect(later.world.start).toBe(newWorld(17).world.start);
  });

  it("lands the chosen card's person under the name in the field, replacing the placeholder", () => {
    const { state, world } = newWorld(17);
    pickCandidate(state, 2);
    expect(state.landing!.name).toEqual(state.landing!.candidates[2].name);
    const chosen = state.landing!.candidates[2];
    state.landing!.name = { first: "Ilze", last: "Berg" };
    land(state, world);
    expect(state.landing).toBeNull();
    expect(state.survivors).toHaveLength(1);
    expect(current(state).index).toBe(1);
    expect(current(state).name).toEqual({ first: "Ilze", last: "Berg" });
    expect(current(state).person).toEqual(chosen.person);
    expect(current(state).gapDays).toBe(0);
    expect(state.log[0].text).toContain("1 April.");
    expect(state.player.health).toBe(100);
  });
});

describe("the heir's boat", () => {
  it("rolls three candidates at begin again, and the next boat is a week on with the world run and three new people", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    const l = state.landing!;
    expect(l.candidates).toHaveLength(3);
    expect(l.boat).toBe(0);
    const before = { date: { ...l.date }, gap: l.gapDays, names: l.candidates.map((c) => c.name) };
    const st = regionState(state, world, state.player.region);
    const age = st.structureAge;
    nextBoat(state, world);
    expect(l.boat).toBe(1);
    expect(l.gapDays).toBe(before.gap + 7);
    expect(l.date.doy).toBe(before.date.doy + 7);
    expect(state.startDoy).toBe(before.date.doy + 7);
    expect(state.minute).toBe(0);
    expect(l.candidates.map((c) => c.name)).not.toEqual(before.names);
    expect(l.chosen).toBe(0);
    expect(l.name).toEqual(l.candidates[0].name);
    expect(st.structureAge).toBe(age);
  });

  it("jumps to May when the week crosses the coast's close", () => {
    expect(nextBoatDate({ year: 1, doy: 290 })).toEqual({ date: { year: 1, doy: 297 }, added: 7 });
    expect(nextBoatDate({ year: 1, doy: 300 })).toEqual({ date: { year: 2, doy: 125 }, added: 190 });
    const { state, world } = newGame(17, 200);
    advance(state, world, 1440);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    expect(state.landing!.date.doy).toBe(291);
    nextBoat(state, world);
    nextBoat(state, world);
    nextBoat(state, world);
    expect(state.landing!.date).toEqual({ year: 2, doy: 125 });
    expect(state.year).toBe(2);
    expect(state.landing!.boat).toBe(3);
  });

  it("lands as the chosen candidate, and a person given explicitly stands in for the card", () => {
    const { state, world } = dead();
    beginAgain(state, world);
    pickCandidate(state, 1);
    const chosen = state.landing!.candidates[1];
    land(state, world);
    expect(current(state).index).toBe(2);
    expect(current(state).name).toEqual(chosen.name);
    expect(current(state).person).toEqual(chosen.person);
    const again = dead(19);
    beginAgain(again.state, again.world);
    const median = { ...again.state.landing!.candidates[0].person, axes: { strength: 0 as const, build: 0 as const, hands: 0 as const, eyes: 0 as const }, quirks: [] };
    land(again.state, again.world, { first: "Ilze", last: "Berg" }, median);
    expect(current(again.state).person).toEqual(median);
    expect(current(again.state).name).toEqual({ first: "Ilze", last: "Berg" });
  });
});
