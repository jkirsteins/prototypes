/** How long the player has actually been playing this run, in wall-clock
 *  time, for the one line the ending overlay puts under the result.
 *
 *  Deliberately NOT on `GameState`, for three separate reasons and any one of
 *  them would be enough. A `Date` field is a compile error in src/net-codec.ts
 *  (it stringifies to `{}` on the wire). An epoch NUMBER would cross the wire
 *  fine and then be wrong in a subtler way - the guest would be shown the
 *  host's stopwatch read against its own clock, skew and all. And a wall-clock
 *  read inside the reducer is exactly the nondeterminism
 *  tests/rng-isolation.test.ts exists to keep out of the engine: two replays
 *  of one seed would stop agreeing.
 *
 *  It is a module of its own rather than three lines in src/main.ts because a
 *  rule with no test is a rule that rots, and because the formatting and the
 *  measuring are one subject - a duration's spelling belongs beside what
 *  measured it.
 *
 *  A leaf, like src/timed.ts: it imports one TYPE, which erases, so the DOM
 *  layer can reach it without a cycle. */
import type { GamePhase } from "./game";

export interface RunClock {
  /** Told the phase on every repaint. See the doc on `createRunClock`. */
  sample(phase: GamePhase): void;
  /** Time spent with the run in play, this run, closed stretches plus any
   *  stretch still running. */
  elapsedMs(): number;
}

/** A clock driven by the PHASE alone, sampled on every repaint.
 *
 *  Keyed off the phase and not off the New game click, because that click is
 *  not the only door into a run: a guest's run starts when the host's snapshot
 *  arrives, and a `?turns=` boot starts on the boot path. A reset hung on one
 *  door would have the other counting from page load.
 *
 *  It sums STRETCHES rather than reading one start stamp, which is what makes
 *  playing on come out right for free: `playing -> victory -> playing ->
 *  victory` adds both halves and leaves out the time spent reading the first
 *  postmortem, which nobody spent playing.
 *
 *  `now` is injected so a test can drive it without waiting. */
export function createRunClock(now: () => number = Date.now): RunClock {
  /** Milliseconds banked from stretches that have ended. */
  let banked = 0;
  /** When the running stretch began, or null when the run is not in play. */
  let openedAt: number | null = null;

  const close = (): void => {
    if (openedAt === null) return;
    banked += Math.max(0, now() - openedAt);
    openedAt = null;
  };

  return {
    sample(phase) {
      switch (phase) {
        case "playing":
          if (openedAt === null) openedAt = now();
          return;
        // An ending holds the total still: the overlay reads a number that
        // stops moving while the player reads it, and playing on re-opens a
        // second stretch rather than restarting the first.
        case "victory":
        case "defeat":
          close();
          return;
        // Nothing has been played yet, so there is nothing to carry: this is
        // where a fresh run - or a fresh screen on the way into one - zeroes.
        case "main-menu":
        case "deck-building":
        case "pick-faction":
          close();
          banked = 0;
          return;
      }
    },
    elapsedMs() {
      return openedAt === null ? banked : banked + Math.max(0, now() - openedAt);
    },
  };
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** A duration the player reads once: `"47s"`, `"3m 12s"`, `"1h 04m"`.
 *
 *  Seconds are dropped past an hour because at that length they are noise -
 *  nobody reads "1h 04m 07s" as anything the "07s" was part of. Minutes are
 *  padded there and only there, so the two halves of an hours reading line up
 *  as a clock does. Negatives clamp to 0: a duration is not a direction. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  if (total >= HOUR_MS) {
    const hours = Math.floor(total / HOUR_MS);
    const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  const minutes = Math.floor(total / MINUTE_MS);
  const seconds = Math.floor((total % MINUTE_MS) / SECOND_MS);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}
