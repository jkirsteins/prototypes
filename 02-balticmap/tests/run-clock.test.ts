import { describe, expect, it } from "vitest";
import { createRunClock, formatElapsed } from "../src/run-clock";

/** A hand-driven clock, so a test measures what it says rather than what the
 *  machine happened to take. */
function fakeNow(): { at(ms: number): void; read(): number } {
  let t = 0;
  return { at: (ms) => { t = ms; }, read: () => t };
}

describe("createRunClock", () => {
  it("counts only the time the run was in play", () => {
    const now = fakeNow();
    const clock = createRunClock(now.read);
    now.at(1000);
    clock.sample("deck-building");
    now.at(5000);
    clock.sample("playing");
    now.at(9000);
    expect(clock.elapsedMs()).toBe(4000);
  });

  it("keeps running while the phase stays playing", () => {
    const now = fakeNow();
    const clock = createRunClock(now.read);
    clock.sample("playing");
    now.at(2000);
    // Repeated samples must not re-open the stretch, or every repaint would
    // reset the count to zero.
    clock.sample("playing");
    now.at(3000);
    expect(clock.elapsedMs()).toBe(3000);
  });

  it("holds the total still once the run has ended", () => {
    const now = fakeNow();
    const clock = createRunClock(now.read);
    clock.sample("playing");
    now.at(7000);
    clock.sample("victory");
    now.at(60_000);
    expect(clock.elapsedMs()).toBe(7000);
  });

  it("sums both halves of a run played on, and leaves out the pause", () => {
    const now = fakeNow();
    const clock = createRunClock(now.read);
    clock.sample("playing");
    now.at(10_000);
    clock.sample("victory");
    // The player reads the postmortem for a minute before deciding.
    now.at(70_000);
    clock.sample("playing");
    now.at(75_000);
    clock.sample("victory");
    expect(clock.elapsedMs()).toBe(15_000);
  });

  it("zeroes on any phase before a run has begun", () => {
    for (const phase of ["main-menu", "deck-building", "pick-faction"] as const) {
      const now = fakeNow();
      const clock = createRunClock(now.read);
      clock.sample("playing");
      now.at(30_000);
      clock.sample("defeat");
      clock.sample(phase);
      expect(clock.elapsedMs()).toBe(0);
    }
  });

  it("reads zero before anything has been sampled", () => {
    expect(createRunClock(fakeNow().read).elapsedMs()).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("says seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(999)).toBe("0s");
    expect(formatElapsed(47_000)).toBe("47s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("says minutes and seconds under an hour", () => {
    expect(formatElapsed(60_000)).toBe("1m 0s");
    expect(formatElapsed(192_000)).toBe("3m 12s");
    expect(formatElapsed(3_599_999)).toBe("59m 59s");
  });

  it("drops the seconds past an hour, and pads the minutes", () => {
    expect(formatElapsed(3_600_000)).toBe("1h 00m");
    expect(formatElapsed(3_600_000 + 4 * 60_000)).toBe("1h 04m");
    expect(formatElapsed(2 * 3_600_000 + 47 * 60_000 + 30_000)).toBe("2h 47m");
  });

  it("clamps a negative to nothing rather than reading backwards", () => {
    expect(formatElapsed(-5000)).toBe("0s");
  });
});
