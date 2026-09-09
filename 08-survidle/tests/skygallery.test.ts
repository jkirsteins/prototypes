import { describe, expect, it } from "vitest";
import { MOTION_RENDER_INTERVAL_MS, shouldAnimateMotion, SKY_CASES } from "../src/skygallery";

describe("the live sky gallery", () => {
  it("includes an accelerated clear-night galaxy motion preview", () => {
    const motion = SKY_CASES.find((sky) => sky.name === "galaxy-motion");
    expect(motion?.motionMinutesPerSecond).toBe(30);
    expect(motion?.weather).toMatchObject({ clear: true, precip: "none" });
    expect(motion?.doy).toBeGreaterThan(235);
  });

  it("holds two later September frames for visual motion comparison", () => {
    expect(SKY_CASES.find((sky) => sky.name === "galaxy-midnight")).toMatchObject({
      hour: 0.5,
      doy: 243,
      weather: { clear: true, precip: "none" },
    });
    expect(SKY_CASES.find((sky) => sky.name === "galaxy-predawn")).toMatchObject({
      hour: 4.5,
      doy: 243,
      weather: { clear: true, precip: "none" },
    });
  });

  it("keeps automated captures still before the gallery starts", () => {
    expect(shouldAnimateMotion("", false)).toBe(true);
    expect(shouldAnimateMotion("?still=1", false)).toBe(false);
    expect(shouldAnimateMotion("", true)).toBe(false);
  });

  it("throttles the accelerated preview to a lightweight animation cadence", () => {
    expect(MOTION_RENDER_INTERVAL_MS).toBeGreaterThanOrEqual(100);
  });
});
