/**
 * Whether a practised wayfinder's exploring sweep is actually faster,
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
    "does not shorten the sweep, even at level 20 (fully practised), measured across all of seeds 1..12",
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
      // The honest finding, now at the multiplier's own full strength
      // (level 20, confirmed a real 1.5x by tests/wayfinding.test.ts's
      // own direct sightRangeCells check): the sweep still does not
      // shorten. pickVantage's score scales every candidate by the same
      // wayfinding factor in a given call, so which candidate ranks best
      // rarely changes - confirmed directly: the leg-by-leg sequence
      // walked is byte-for-byte identical between level 1 and level 20 on
      // most seeds checked, and where a Math.floor() boundary does flip a
      // pick (one of three seeds spot-checked), the result was not
      // shorter. The wider eye at each step is real and does widen what
      // gets marked known along the way, but not by enough to cut a leg
      // from an already-adequate path. So: wayfinding buys a real, wider
      // view and a real, fading injury risk, but not a measurably shorter
      // sweep - reported here as measured, at the level meant to answer
      // "does the effect exist at all," and stopped on rather than tuned
      // further to manufacture a fall that is not there.
      const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
      const level1 = seeds.map((s) => sweepMinutes(s, 1));
      const level10 = seeds.map((s) => sweepMinutes(s, 10));
      const level20 = seeds.map((s) => sweepMinutes(s, 20));
      // Sight itself is real and grows (asserted directly, cheaply, in
      // tests/wayfinding.test.ts); what this measures is whether that
      // wider eye ever adds up to fewer minutes walked, and it does not,
      // even at full practice.
      expect(median(level10)).not.toBeLessThan(median(level1));
      expect(median(level20)).not.toBeLessThan(median(level1));
    },
    120000,
  );
});
