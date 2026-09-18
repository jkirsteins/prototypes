/**
 * The body sites an ice hole where the cut will actually start.
 *
 * iceHoleSite once accepted any waterside cell, the cut itself only a lake,
 * the sea or a river. Beside a brook the thirsty step said "opening an ice
 * hole" every minute with no task under it, and the survivor stood there.
 */
import { expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { iceHoleSite } from "../src/sim/body";
import { AXES } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, watersideCell } from "../src/sim/position";
import { check } from "../src/sim/tasks";
import { ensureGround } from "../src/sim/weather";
import { regionAt } from "../src/world/gen";

it("never names a cell the ice-hole task refuses, brook-side cells included", () => {
  let sited = 0;
  let brookSide = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { state, world } = newGame(seed);
    state.player.tools.push({ id: AXES[0], durability: 100 });
    ensureGround(state, world, state.player.region).iceCm = 10;
    const cal = calendar(state.minute, state.startDoy);
    const region = regionAt(world, state.player.region);
    const brooks = region.cells.filter((c) => watersideCell(world, c) && !watersideCell(world, c, "fishing")).slice(0, 4);
    for (const cell of [cellOf(state, world), ...brooks]) {
      placeAt(state, world, cell);
      const site = iceHoleSite(state, world, cal);
      if (site === null) continue;
      sited++;
      if (brooks.includes(cell)) brookSide++;
      expect(check(state, world, cal, "iceHole", undefined, site).ok, `seed ${seed} at ${cell}`).toBe(true);
    }
  }
  expect(sited).toBeGreaterThan(0);
  expect(brookSide).toBeGreaterThan(0);
});
