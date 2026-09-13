import { isKnown } from "../src/sim/mapped";
import { describe, expect, it, vi } from "vitest";
import { huntCandidates, bestHuntCell, noteFailedHunt, noteHuntSign } from "../src/sim/hunting";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import * as position from "../src/sim/position";
import { calendar } from "../src/sim/calendar";
import { cellAt, regionAt } from "../src/world/gen";
import { parentKey, parentXY } from "../src/world/spatial";

describe("bounded fine hunting candidates", () => {
  it("retains every terrain-parent representative, named spot and local evidence patch deterministically", () => {
    const { state, world } = newGame(17);
    const region = regionAt(world, state.player.region);
    const here = cellOf(state, world);
    const normal = huntCandidates(state, world, [region]);
    const omitted = region.cells.filter(cell => !normal.includes(cell) && cellAt(world, cell).terrain !== "water");
    expect(omitted.length).toBeGreaterThan(2);
    noteHuntSign(state, omitted[0], "hare");
    noteFailedHunt(state, omitted[1], "hare");
    state.huntPressure[omitted[2]] = 0.5;
    const candidates = huntCandidates(state, world, [region]);
    expect(candidates).toContain(here);
    for (const spot of region.spots) expect(candidates).toContain(spot.cell);
    for (const cell of omitted.slice(0, 3)) expect(candidates).toContain(cell);
    const nearest = new Map<string, number>();
    const distance = (cell: number) => (cell % world.w - here % world.w) ** 2 + (Math.floor(cell / world.w) - Math.floor(here / world.w)) ** 2;
    for (const cell of region.cells) {
      const terrain = cellAt(world, cell).terrain;
      if (!isKnown(state, cell) || terrain === "water") continue;
      const parent = parentXY(cell);
      const key = `${parentKey(parent.x, parent.y)}:${terrain}`;
      const best = nearest.get(key);
      if (best === undefined || distance(cell) < distance(best) || (distance(cell) === distance(best) && cell < best)) nearest.set(key, cell);
    }
    for (const cell of nearest.values()) expect(candidates).toContain(cell);
    expect(candidates.length).toBeLessThanOrEqual(nearest.size + region.spots.length + 4);
    expect(candidates).toEqual(huntCandidates(state, world, [region]));
  });

  it("routes each exact pair once per deterministic ranking pass", () => {
    const { state, world } = newGame(17);
    const candidates = huntCandidates(state, world, [regionAt(world, state.player.region)]);
    const distance = vi.spyOn(position, "kmBetween");
    const start = performance.now();
    try {
      const selected = bestHuntCell(state, world, calendar(state.minute, state.startDoy));
      expect(candidates).toContain(selected);
      expect(distance.mock.calls.length).toBeLessThanOrEqual(candidates.length * 2);
      expect(new Set(distance.mock.calls.map(args => `${args[2]}:${args[3]}`)).size).toBe(distance.mock.calls.length);
      expect(performance.now() - start).toBeLessThan(5000);
      expect(bestHuntCell(state, world, calendar(state.minute, state.startDoy))).toBe(selected);
    } finally { distance.mockRestore(); }
  });
});
