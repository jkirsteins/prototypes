/**
 * Whether a practised wayfinder's exploring sweep is actually faster,
 * measured across every one of seeds 1..12 rather than a single seed
 * picked because it happens to show the claimed order (task 6's fix
 * review; full method and table in
 * .superpowers/sdd/2026-09-07-survidle-exploration/task-6-report.md).
 * Sweeping 12 seeds at two levels each is real simulated minutes, most of
 * a minute of wall-clock time, so it sits behind `npm run test:slow`
 * rather than taxing every commit; tests/wayfinding.test.ts keeps the
 * cheap checks (the skill itself, its rungs, the injury roll) over the
 * same machinery.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../../src/rng";
import { calendar } from "../../src/sim/calendar";
import { newGame } from "../../src/sim/newgame";
import { placeAt } from "../../src/sim/position";
import { levelMinutes } from "../../src/sim/skills";
import { startTask, stepTask } from "../../src/sim/tasks";
import { cellAt, neighbours, regionAt, type World } from "../../src/world/gen";

/**
 * A cell of nbId bordering homeId: a foothold to teleport onto and sweep
 * from, revealing only what sight from the border itself gives rather than
 * a whole region from a central camp. Landing's own "a neighbour already
 * partly seen" toehold (the one tests/wayfinding.test.ts and
 * tests/explore.test.ts use) exists for only 2 of seeds 1..12, not enough
 * to measure a median over.
 */
function borderCell(world: World, homeId: number, nbId: number): number | null {
  for (const cell of regionAt(world, nbId).cells) {
    if (neighbours(world, cell).some((n) => cellAt(world, n).region === homeId)) return cell;
  }
  return null;
}

/** Sweeps the home region's first neighbour from its own border, at the given wayfinding level; real elapsed minutes. */
function sweepMinutes(seed: number, level: number, cap = 2000): number {
  const g = newGame(seed);
  const { state, world } = g;
  const home = regionAt(world, state.player.region);
  const nb = home.neighbours[0]!;
  const cell = borderCell(world, home.id, nb.id)!;
  placeAt(state, world, cell);
  if (level > 1) state.skills.wayfinding.xp = levelMinutes(level);
  startTask(state, world, calendar(state.minute), "explore", `region:${nb.id}`);
  const rng = new Rng(1);
  let minutes = 0;
  for (; minutes < cap && state.task; minutes++) stepTask(state, world, calendar(state.minute), rng, 1);
  if (state.task) throw new Error(`seed ${seed} no longer finishes within the cap - the reference seed set needs a second look`);
  return minutes;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

describe("wayfinding vantage speed", () => {
  it(
    "does not reliably shorten the sweep, measured across all of seeds 1..12",
    () => {
      // A seed picked because level 10 happens to sweep it faster is a
      // flattering test, not evidence: measured instead over every one of
      // seeds 1..12, no hunting, teleporting the survivor to the border of
      // home's first neighbour (again a fixed rule, not a per-seed filter)
      // and sweeping it at level 1 vs level 10. Every one of the 12 now
      // finishes (exploreRoute may cross the region's own unmapped ground,
      // and pickVantage never repeats a cell already stood at this sweep -
      // both fixed a real stall this same measurement first turned up: an
      // eternal two-cell ping-pong, since a spruce cell's sight range is 0,
      // so its only unseen neighbour could never become known enough to
      // route to under the old known-only rule). Full table in the task-6
      // report named above.
      //
      // The honest finding, with the stall gone and all 12 seeds counted:
      // level 10 was faster on 4, slower on 6, unchanged on 2, and the
      // median rose (403 -> 456.5 minutes). Weighing more candidates by
      // opened-per-minute makes each leg's own pick locally better, but
      // that does not add up to a shorter whole-region sweep - the greedy
      // sequence of locally-best legs can still leave the frontier worse
      // off for the legs after it. Per the coordinator's ruling this needs
      // a frontier-aware pick, a design call, not a further score tweak,
      // and is not fixed here - this test pins the measured reality rather
      // than asserting the speed claim the code does not yet deliver.
      const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
      const level1 = seeds.map((s) => sweepMinutes(s, 1));
      const level10 = seeds.map((s) => sweepMinutes(s, 10));
      const faster = level10.filter((m, i) => m < level1[i]).length;
      const slower = level10.filter((m, i) => m > level1[i]).length;
      const unchanged = level10.filter((m, i) => m === level1[i]).length;
      expect(faster).toBe(4);
      expect(slower).toBe(6);
      expect(unchanged).toBe(2);
      expect(median(level10)).toBeGreaterThan(median(level1));
    },
    120000,
  );
});
