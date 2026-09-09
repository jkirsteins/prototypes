/**
 * Whether a practised wayfinder materially changes an exploring sweep,
 * measured across every one of seeds 1..12 rather than a single seed
 * picked because it happens to show the claimed order (task 6's fix
 * review; full method, table and history in
 * .superpowers/sdd/2026-09-07-survidle-exploration/task-6-report.md).
 * Sweeping 12 seeds at three levels each is real simulated minutes, real
 * wall-clock time, so it sits behind `npm run test:slow` rather than
 * taxing every commit; tests/wayfinding.test.ts keeps the cheap checks
 * (the skill itself, its rungs, the injury roll, and sightRangeCells
 * itself growing with level) over the same machinery.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../../src/rng";
import { calendar } from "../../src/sim/calendar";
import { newGame } from "../../src/sim/newgame";
import { placeAt } from "../../src/sim/position";
import { levelMinutes } from "../../src/sim/skills";
import { startTask, stepTask } from "../../src/sim/tasks";
import type { GameState } from "../../src/sim/types";
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
function sweepMinutes(state: GameState, world: World, level: number, cap = 2000): number {
  const home = regionAt(world, state.player.region);
  const nb = home.neighbours[0]!;
  const cell = borderCell(world, home.id, nb.id)!;
  placeAt(state, world, cell);
  if (level > 1) state.skills.wayfinding.xp = levelMinutes(level);
  startTask(state, world, calendar(state.minute), "explore", `region:${nb.id}`);
  const rng = new Rng(1);
  let minutes = 0;
  for (; minutes < cap && state.task; minutes++) stepTask(state, world, calendar(state.minute), rng, 1);
  if (state.task) throw new Error(`seed ${state.seed} no longer finishes within the cap - the reference seed set needs a second look`);
  return minutes;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

describe("wayfinding vantage speed", () => {
  it(
    "keeps median sweep time within five percent through level 20, measured across all of seeds 1..12",
    () => {
      // A seed picked because level 10 happens to sweep it faster is a
      // flattering test, not evidence: measured instead over every one of
      // seeds 1..12, no hunting, teleporting the survivor to the border of
      // home's first neighbour (a fixed rule, not a per-seed filter) and
      // sweeping it at level 1, level 10 and level 20. Full table and
      // history (the candidate-count model this replaced, the stall its
      // predecessor had to fix first, and the SKILL_CAP-scaled multiplier
      // this table itself disproved) in the task-6 report:
      // .superpowers/sdd/2026-09-07-survidle-exploration/task-6-report.md.
      //
      // The model: not "weigh more candidates" (that made the tour longer
      // with level - measured, not guessed) but "a practised eye reads
      // more ground from the same vantage" - wayfinding multiplies
      // sightRangeCells, 1x at level 1 rising to 1.5x by level 20
      // (RUNG_LEVEL.pace, the last rung - "fully practised" in this
      // game's own terms - not the skill cap of 50, which a level rarely
      // reaches and which is why the first cut of this table showed
      // nothing: level 10 of 50 is only a 1.09x multiplier). 1.5x is the
      // same ceiling the sharp-eyes quirk already gets: practice earns
      // what a gift gives for free, not more. pickVantage does not look
      // at level at all; it weighs every reachable candidate, always, by
      // opened-per-minute.
      //
      // Terrain-aware viewsheds make the route changes mixed: a wider eye
      // can expose useful ground or reorder a discrete vantage choice onto
      // a longer leg. The 12-seed medians after that model landed were 370,
      // 374.5 and 369.5 minutes at levels 1, 10 and 20. That is still no
      // material sweep-speed effect, not a promise that a skilled median
      // can never be half a minute shorter. Five percent keeps this as a
      // calibration tripwire in both directions without rejecting the
      // intended terrain-aware visibility model.
      const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
      const runs = seeds.map((seed) => {
        const game = newGame(seed);
        return [1, 10, 20].map((level) => sweepMinutes(structuredClone(game.state), game.world, level));
      });
      const level1 = runs.map((run) => run[0]);
      const level10 = runs.map((run) => run[1]);
      const level20 = runs.map((run) => run[2]);
      const report = JSON.stringify({ level1, level10, level20 });
      // Sight itself is real and grows (asserted directly, cheaply, in
      // tests/wayfinding.test.ts); this slow probe guards the aggregate
      // route effect rather than requiring every discrete route to agree.
      const baseline = median(level1);
      expect(Math.abs(median(level10) - baseline) / baseline, report).toBeLessThanOrEqual(0.05);
      expect(Math.abs(median(level20) - baseline) / baseline, report).toBeLessThanOrEqual(0.05);
    },
    600000,
  );
});
