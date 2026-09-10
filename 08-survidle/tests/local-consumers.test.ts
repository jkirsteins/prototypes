import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { calendar } from "../src/sim/calendar";
import { fearsFell, shunsShore } from "../src/sim/fears";
import { illuminance, attemptOdds } from "../src/sim/light";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { debtFallHalved } from "../src/sim/sleep";
import { regionAt } from "../src/world/gen";
import { testAtmosphere } from "./weather-helpers";
import { ensureGround } from "../src/sim/weather";

afterEach(() => vi.restoreAllMocks());

function localFixture() {
  const { state, world } = newGame(42, 15);
  const here = cellOf(state, world);
  const other = regionAt(world, state.player.region).neighbours[0].id;
  const remote = regionAt(world, other).campCell;
  ensureGround(state, world, state.player.region).snowCm = 0;
  ensureGround(state, world, other).snowCm = 0;
  const base = testAtmosphere();
  vi.spyOn(climate, "sampleAtmosphere").mockImplementation((_w, _world, _minute, x, y) =>
    y * world.w + x === remote ? { ...base, cloud: 1, precipMmPerHour: 10, rainMmPerHour: 10, precip: "rain", windKmh: 40 } : { ...base });
  // Deliberately contradict the local readings: live consumers must ignore this facade.
  state.weather.clear = false;
  state.weather.storm = { id: 1, source: "synthetic", kind: "rain", from: 0, until: 9999, warned: true };
  return { state, world, here, remote };
}

describe("cell-local weather consumers", () => {
  it("reads fell and shore fears at the requested work cell", () => {
    const { state, world, here, remote } = localFixture();
    state.survivors.at(-1)!.person.quirks = ["coastBorn", "forestBorn"];
    expect(fearsFell(state, world, here)).toBe(false);
    expect(fearsFell(state, world, remote)).toBe(true);
    expect(shunsShore(state, world, here)).toBe(false);
    expect(shunsShore(state, world, remote)).toBe(true);
  });

  it("uses the work cell's cloud and snow for illuminance and task odds", () => {
    const { state, world, here, remote } = localFixture();
    const cal = calendar(16 * 60, 15);
    expect(illuminance(state, world, cal, remote)).toBeLessThan(illuminance(state, world, cal, here));
    expect(attemptOdds(state, world, cal, "craft", remote)).toBeLessThan(attemptOdds(state, world, cal, "craft", here));
  });

  it("halves sleep recovery only where the sleeper is in the storm", () => {
    const { state, world, here, remote } = localFixture();
    state.survivors.at(-1)!.person.quirks = ["sleepsLight"];
    expect(debtFallHalved(state, world, here)).toBe(false);
    expect(debtFallHalved(state, world, remote)).toBe(true);
  });
});
