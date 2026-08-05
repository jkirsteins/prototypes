import { describe, expect, it } from "vitest";
import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, PARRYABLE_FRACTION, attackTimeline } from "../src/duel/timings";

describe("timings mirror 06's longsword", () => {
  it("copies the attack numbers verbatim", () => {
    expect(LONGSWORD.attacks.cut).toEqual({ windup: 600, beat: 100, strike: 380, recovery: 420 });
    expect(LONGSWORD.attacks.thrust).toEqual({ windup: 440, beat: 60, strike: 260, recovery: 300 });
    expect(LONGSWORD.reachCm).toBe(200);
    expect(LONGSWORD.stepDistanceCm).toBe(60);
    expect(LONGSWORD.stepDurationMs).toBe(260);
    expect(LONGSWORD.voidDistanceCm).toBe(100);
    expect(LONGSWORD.voidDurationMs).toBe(320);
    expect(PARRYABLE_FRACTION).toBe(0.5);
    expect(HIT_STUN_MS).toBe(350);
    expect(DEATH_ANIM_MS).toBe(900);
  });

  it("builds the cut timeline exactly as 06's attackTimeline", () => {
    const tl = attackTimeline(LONGSWORD, "cut");
    expect(tl).toEqual({
      riseStart: 0, riseEnd: 600, strikeStart: 700,
      parryableUntil: 890, strikeEnd: 1080,
      recoveryStart: 1080, recoveryEnd: 1500,
    });
  });

  it("builds the thrust timeline", () => {
    const tl = attackTimeline(LONGSWORD, "thrust");
    expect(tl).toEqual({
      riseStart: 0, riseEnd: 440, strikeStart: 500,
      parryableUntil: 630, strikeEnd: 760,
      recoveryStart: 760, recoveryEnd: 1060,
    });
  });
});
