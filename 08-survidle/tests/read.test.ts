import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { isRead, readCells, readLine, readShore, shoreFish } from "../src/sim/knowledge";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { fishSpecies, SPECIES_DEFS, waterOf } from "../src/sim/species";
import { availableTasks, check, huntOdds, READ_ODDS, startTask } from "../src/sim/tasks";
import { ICE_SHORE_CM } from "../src/sim/water";
import { regionAt } from "../src/world/gen";
import { cellOf, watersideCell } from "../src/sim/position";
import { regionDensity } from "../src/sim/animals";
import { readHtml } from "../src/ui/panels";

const cal = calendar(0);

/** Seed 4's start region has a lake; the player is put on its shore spot. */
function atShore() {
  const g = newGame(4);
  placeAtSpot(g.state, g.world, g.state.player.region, "shore");
  return { ...g, cell: cellOf(g.state, g.world), r: regionAt(g.world, g.state.player.region) };
}

describe("reading water", () => {
  it("is an hour at a waterside cell, once, and needs open water", () => {
    const { state, world, cell } = atShore();
    const o = check(state, world, cal, "read");
    expect(o).toMatchObject({ ok: true, duration: 60, label: "Read the water" });
    expect(availableTasks(state, world, cal).some((t) => t.id === "read")).toBe(true);
    state.weather.iceCm = ICE_SHORE_CM;
    expect(check(state, world, cal, "read")).toMatchObject({ ok: false, why: "the water is under ice" });
    state.weather.iceCm = 0;
    expect(startTask(state, world, cal, "read")).toBe(true);
    advance(state, world, 60);
    expect(isRead(state, cell)).toBe(true);
    expect(check(state, world, cal, "read")).toMatchObject({ ok: false, why: "{you} {have} read this water" });
  });

  it("writes the fish of this water, not the other kind of water, and says where each lies", () => {
    const { state, world, cell, r } = atShore();
    const fish = shoreFish(world, r, cell);
    expect(fish.length).toBeGreaterThan(0);
    for (const s of fish) expect(watersideCell(world, cell, waterOf(s) ?? "any")).toBe(true);
    for (const s of fishSpecies()) if (r.capacity[s] && !watersideCell(world, cell, waterOf(s) ?? "any")) expect(fish).not.toContain(s);
    const obs = readShore(state, world, cell);
    expect(obs.fish).toEqual(fish);
    expect(state.player.known[cell]).toBe(obs);
    const line = readLine(state, world, cal, cell);
    expect(line.startsWith(`{You} {read} the water at ${r.name}:`)).toBe(true);
    expect(line).toContain(SPECIES_DEFS[fish[0]].lie!);
  });

  it("a read shore fishes at one and a half times the odds; an unread one as before", () => {
    const { state, world, cell, r } = atShore();
    const s = shoreFish(world, r, cell)[0];
    const st = regionState(state, world, state.player.region);
    st.pop[s] = Math.max(st.pop[s] ?? 0, 5);
    const d = regionDensity(state, world, state.player.region, s, cal);
    const before = huntOdds(state, world, cal, d, s);
    readShore(state, world, cell);
    expect(huntOdds(state, world, cal, d, s)).toBeCloseTo(Math.min(0.95, before * READ_ODDS), 9);
    expect(READ_ODDS).toBe(1.5);
  });

  it("lists the region's read shores with fish first and nearest first, and the card shows them", () => {
    const { state, world, cell } = atShore();
    expect(readCells(state, world, state.player.region)).toEqual([]);
    expect(readHtml(state, world, state.player.region)).toBe("");
    readShore(state, world, cell);
    expect(readCells(state, world, state.player.region)).toEqual([cell]);
    expect(readHtml(state, world, state.player.region)).toContain("Shore read:");
  });

  it("dies with the person: a new person starts with nothing read", () => {
    const { state, world, cell } = atShore();
    readShore(state, world, cell);
    const fresh = newGame(4);
    expect(fresh.state.player.known).toEqual({});
    expect(state.player.known[cell]).toBeDefined();
  });
});
