/**
 * Whether a practised wayfinder's exploring sweep is actually faster,
 * measured across every one of seeds 1..12 rather than a single seed
 * picked because it happens to show the claimed order (task 6's fix
 * review; full method, table and history in
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
    "does not shorten the sweep at level 10, measured across all of seeds 1..12",
    () => {
      // A seed picked because level 10 happens to sweep it faster is a
      // flattering test, not evidence: measured instead over every one of
      // seeds 1..12, no hunting, teleporting the survivor to the border of
      // home's first neighbour (a fixed rule, not a per-seed filter) and
      // sweeping it at level 1 vs level 10. Full table and history (the
      // candidate-count model this replaced, and the stall it and its
      // predecessor both had to fix first) in the task-6 report:
      // .superpowers/sdd/2026-09-07-survidle-exploration/task-6-report.md.
      //
      // The model here is not "weigh more candidates" (that made the tour
      // longer with level - a real, measured finding, not a guess) but "a
      // practised eye reads more ground from the same vantage": wayfinding
      // multiplies sightRangeCells, 1x at level 1 up to 1.5x at the skill
      // cap (SKILL_CAP, 50) - the same ceiling the sharp-eyes quirk already
      // gets, so practice earns what a gift gives for free and no more.
      // pickVantage no longer looks at level at all; it weighs every
      // reachable candidate, always.
      //
      // The honest finding at level 10 specifically: the sweep does not
      // shorten. Level 10 is only 9/49 of the way from 1x to 1.5x (roughly
      // +9%), and pickVantage's score scales every candidate by the same
      // factor, so which candidate ranks best rarely changes - confirmed
      // directly: the leg-by-leg sequence walked is byte-for-byte
      // identical at level 1 and level 10 on every seed checked. The wider
      // eye at each step (verified directly against sightRangeCells - it
      // is real, and grows correctly with level) does not reveal enough
      // extra ground to cut a single leg from an already-adequate path.
      // Every one of the 12 seeds comes back with the same minutes at both
      // levels, so level10 and level1 are asserted equal outright rather
      // than "the median falls" - median equality follows from every pair
      // being equal, not a coincidence of the aggregate. Per the
      // coordinator's instruction this is reported and stopped on rather
      // than chased to a level where the multiplier is large enough to
      // show something - that would be hunting a favourable reading
      // instead of answering the one asked for.
      const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
      const level1 = seeds.map((s) => sweepMinutes(s, 1));
      const level10 = seeds.map((s) => sweepMinutes(s, 10));
      expect(level10).toEqual(level1);
      expect(median(level10)).toBe(median(level1));
    },
    120000,
  );
});
