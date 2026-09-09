import { describe, expect, it } from "vitest";
import { newSpeedHistory, sampleSpeed, SPEED_WINDOW_MS, speedAreaPath } from "../src/ui/speed-history";

describe("speed history", () => {
  it("retains the one-minute window anchor and maps 1x to the bottom and 6x to the top", () => {
    const history = newSpeedHistory();
    sampleSpeed(history, 0, 1);
    sampleSpeed(history, 30_000, 6);
    sampleSpeed(history, SPEED_WINDOW_MS + 1_000, 1);
    expect(history.samples[0].at).toBe(0);
    expect(history.samples[1].at).toBe(30_000);
    const path = speedAreaPath(history.samples, SPEED_WINDOW_MS + 1_000, 100, 20);
    expect(path).toContain("0.00");
    expect(path).toContain("20.00");
  });

  it("fills the footer immediately from its left edge", () => {
    const path = speedAreaPath([{ at: 60_000, rate: 1 }], 60_000, 100, 20);
    expect(path).toBe("M 0 20 L 0 20.00 L 100.00 20.00 L 100 20 Z");
  });

  it("draws acceleration upward and joins samples with slopes", () => {
    const samples = [
      { at: 0, rate: 1 },
      { at: 30_000, rate: 6 },
      { at: 60_000, rate: 1 },
    ];
    expect(speedAreaPath(samples, 60_000, 100, 20)).toBe(
      "M 0 20 L 0 20.00 L 50.00 0.00 L 100.00 20.00 L 100 20 Z",
    );
  });
});
