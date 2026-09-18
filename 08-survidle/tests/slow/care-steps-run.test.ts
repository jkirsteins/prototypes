/**
 * A care step with no task under it is a stall.
 *
 * The strip prints the step's words and the bar is the task; a step the
 * task refuses leaves words and no bar, and the survivor stands still. One
 * such stall killed a thirsty survivor beside a brook (playtest 2026-09-17,
 * finding 15). This holds every fallback the body has, present and future,
 * to the same rule: run the reference survivor and fail on any run of
 * minutes where a care intent stands with nothing running.
 *
 * Two days of the reference survivor cost about twenty seconds a seed, most
 * of it the sim itself, so this lives in the slow suite (`npm run
 * test:slow`): run it when the body's steps change. The rules it holds are
 * also unit tests in tests/bodyorder-claims.test.ts, which the gate runs.
 */
import { expect, it } from "vitest";
import { advance } from "../../src/sim/advance";
import { OPENING_TICK_MINUTES, setUpReference } from "../../src/sim/reference";

const SEEDS = [3, 17, 79];
const DAYS = 2;
/** A want answered on the spot can leave the claim standing for the minute it took; two in a row is nobody doing anything. */
const STALL_MINUTES = 2;

it.each(SEEDS)("never leaves a care claim standing with no task under it (seed %i)", (seed) => {
  const ref = setUpReference(seed);
  const { state } = ref;
  let streak = 0;
  const stalls: string[] = [];
  for (let m = 0; m < DAYS * 1440 && !state.dead; m++) {
    // The reference player looks at the list on its own tick; the minutes
    // between are the sim's alone, which is where a stall would show.
    if (m % OPENING_TICK_MINUTES === 0) ref.player.tick(state, ref.world);
    advance(state, ref.world, 1);
    const it = state.intent;
    if (it && it.mode === "care" && !state.task) {
      streak++;
      if (streak === STALL_MINUTES) stalls.push(`minute ${state.minute}: ${it.need}, "${it.step}"`);
    } else streak = 0;
  }
  expect(stalls, stalls.join("\n")).toEqual([]);
});
