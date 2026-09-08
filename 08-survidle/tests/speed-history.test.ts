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
});
