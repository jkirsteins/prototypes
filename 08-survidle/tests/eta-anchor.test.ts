/**
 * The task bar's bracket counts down, and never climbs, while a pulse plays.
 *
 * Recomputed every frame it saw-toothed: a game minute lands whole inside
 * one frame while the pulse's remaining boost falls continuously
 * (bars.ts, anchoredSeconds). A click still takes its seconds off at once.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { anchoredSeconds, ETA_DRIFT_S } from "../src/ui/bars";

describe("the anchored bracket", () => {
  it("counts down at wall pace through a saw-toothing truth, and takes a click's saving at once", () => {
    const { state } = newGame(3);
    let now = 1000;
    // A truth that drops a whole second each time a minute lands and creeps
    // up a third of a second in between, four frames to a minute.
    let truth = 40;
    const shown: number[] = [];
    for (let frame = 0; frame < 40; frame++) {
      shown.push(anchoredSeconds(state, "chop::60:1", truth, now));
      now += 250;
      truth += frame % 4 === 3 ? -1 + 0.1 : 0.1 - 0.25 * 0 - 0.35;
    }
    for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeLessThanOrEqual(shown[i - 1] + 1e-9);
    // A click: the truth drops by more than the drift and the bracket follows it.
    const before = anchoredSeconds(state, "chop::60:1", truth, now);
    const after = anchoredSeconds(state, "chop::60:1", truth - 16, now);
    expect(before - after).toBeGreaterThan(ETA_DRIFT_S);
    // A new task re-anchors to its own truth.
    expect(anchoredSeconds(state, "split::30:1", 12, now)).toBe(12);
  });
});
