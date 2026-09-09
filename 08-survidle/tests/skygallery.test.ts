import { describe, expect, it } from "vitest";
import { shouldAnimateMotion, SKY_CASES } from "../src/skygallery";

describe("the live sky gallery", () => {
  it("includes an accelerated clear-night galaxy motion preview", () => {
    const motion = SKY_CASES.find((sky) => sky.name === "galaxy-motion");
    expect(motion?.motionMinutesPerSecond).toBe(30);
    expect(motion?.weather).toMatchObject({ clear: true, precip: "none" });
    expect(motion?.doy).toBeGreaterThan(235);
  });

  it("keeps automated captures still before the gallery starts", () => {
    expect(shouldAnimateMotion("", false)).toBe(true);
    expect(shouldAnimateMotion("?still=1", false)).toBe(false);
    expect(shouldAnimateMotion("", true)).toBe(false);
  });
});
