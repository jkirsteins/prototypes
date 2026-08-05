import { describe, expect, it } from "vitest";
import { createDuelist, handleEvent, tick } from "../src/duel/states";
import { CLIPS, POSE_T, pickPose } from "../src/duel/poses";
import type { Duelist } from "../src/duel/states";

const atElapsed = (attack: "cut" | "thrust", elapsedMs: number): Duelist => {
  const d = createDuelist();
  handleEvent(d, attack);
  tick(d, elapsedMs);
  return d;
};

describe("pickPose", () => {
  it("idles loop from timeMs, everything else is held", () => {
    const d = createDuelist();
    const p = pickPose(d, 12345);
    expect(p.clip).toBe("gsIdle");
    expect(p.mode).toBe("loop");
    expect(p.clipTime).toBeCloseTo((12.345) % CLIPS.gsIdle.durationS);
    expect(pickPose(d, 0).clipTime).toBe(0);
  });

  it("windup: low until rise midpoint, high until riseEnd, then the still beat", () => {
    expect(pickPose(atElapsed("cut", 299), 0).clipTime).toBe(POSE_T.slash.windupLow);
    expect(pickPose(atElapsed("cut", 301), 0).clipTime).toBe(POSE_T.slash.windupHigh);
    expect(pickPose(atElapsed("cut", 650), 0).clipTime).toBe(POSE_T.slash.still);
  });

  it("strike: travelling retained AT parryableUntil, delivered after (06 frames.ts:156)", () => {
    // cut timeline: strikeStart 700, parryableUntil 890
    expect(pickPose(atElapsed("cut", 890), 0).clipTime).toBe(POSE_T.slash.travelling);
    expect(pickPose(atElapsed("cut", 891), 0).clipTime).toBe(POSE_T.slash.delivered);
    // thrust: strikeStart 500, parryableUntil 630
    expect(pickPose(atElapsed("thrust", 630), 0).clipTime).toBe(POSE_T.stab.travelling);
    expect(pickPose(atElapsed("thrust", 631), 0).clipTime).toBe(POSE_T.stab.delivered);
  });

  it("recovery scrubs its range and never exceeds it", () => {
    const early = pickPose(atElapsed("cut", 1081), 0).clipTime;
    const late = pickPose(atElapsed("cut", 1499), 0).clipTime;
    expect(early).toBeGreaterThanOrEqual(POSE_T.slash.recoveryStart);
    expect(late).toBeLessThanOrEqual(POSE_T.slash.recoveryEnd);
    expect(late).toBeGreaterThan(early);
  });

  it("parry rises then forms at PARRY_FORM_MS; death clamps at its end", () => {
    const d = createDuelist();
    handleEvent(d, "parryDown");
    tick(d, 100);
    expect(pickPose(d, 0).clipTime).toBe(POSE_T.block.rise);
    tick(d, 100); // 200 > 180
    expect(pickPose(d, 0).clipTime).toBe(POSE_T.block.formed);
    handleEvent(d, "reset");
    handleEvent(d, "death");
    tick(d, 5000);
    expect(pickPose(d, 0).clipTime).toBeCloseTo(POSE_T.death.end);
  });

  it("bind freezes the slash contact; every pick is a real clip", () => {
    const d = createDuelist();
    handleEvent(d, "bind");
    const p = pickPose(d, 0);
    expect(p).toEqual({ clip: "gsSlash", clipTime: POSE_T.bindContact, mode: "held" });
    for (const name of Object.keys(CLIPS)) expect(CLIPS[name as keyof typeof CLIPS].durationS).toBeGreaterThan(0);
  });
});
