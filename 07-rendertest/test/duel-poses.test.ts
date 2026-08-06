import { describe, expect, it } from "vitest";
import { createDuelist, handleEvent, tick } from "../src/duel/states";
import { CLIPS, POSE_T, WARP, pickPose } from "../src/duel/poses";
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

  it("attack anchors land on the timeline marks (cut)", () => {
    // cut timeline: rise 0..600, beat to 700, parryable to 890, strike
    // ends 1080, recovery ends 1500
    expect(pickPose(atElapsed("cut", 0), 0).clipTime).toBeCloseTo(WARP.slash.start);
    expect(pickPose(atElapsed("cut", 600), 0).clipTime).toBeCloseTo(WARP.slash.beatIn);
    expect(pickPose(atElapsed("cut", 700), 0).clipTime).toBeCloseTo(WARP.slash.still);
    expect(pickPose(atElapsed("cut", 890), 0).clipTime).toBeCloseTo(WARP.slash.midArc);
    expect(pickPose(atElapsed("cut", 1080), 0).clipTime).toBeCloseTo(WARP.slash.delivered);
    expect(pickPose(atElapsed("cut", 1499), 0).clipTime).toBeLessThanOrEqual(WARP.slash.end);
  });

  it("attack anchors land on the timeline marks (thrust)", () => {
    // thrust timeline: rise 0..440, beat to 500, parryable to 630, strike
    // ends 760, recovery ends 1060
    expect(pickPose(atElapsed("thrust", 0), 0).clipTime).toBeCloseTo(WARP.stab.start);
    expect(pickPose(atElapsed("thrust", 440), 0).clipTime).toBeCloseTo(WARP.stab.beatIn);
    expect(pickPose(atElapsed("thrust", 500), 0).clipTime).toBeCloseTo(WARP.stab.still);
    expect(pickPose(atElapsed("thrust", 630), 0).clipTime).toBeCloseTo(WARP.stab.midArc);
    expect(pickPose(atElapsed("thrust", 760), 0).clipTime).toBeCloseTo(WARP.stab.delivered);
  });

  it("attacks play every frame in order: monotonic clip time, no jumps", () => {
    for (const [attack, warp, marks] of [
      ["cut", WARP.slash, [0, 600, 700, 890, 1080, 1500]],
      ["thrust", WARP.stab, [0, 440, 500, 630, 760, 1060]],
    ] as const) {
      const endMs = marks[marks.length - 1];
      // The largest allowed 10 ms advance is the fastest warp segment's
      // speed; anything bigger is a skip, not a speed-up.
      let maxRate = 0;
      const clips = [warp.start, warp.beatIn, warp.still, warp.midArc, warp.delivered, warp.end];
      for (let i = 1; i < clips.length; i += 1) {
        maxRate = Math.max(maxRate, (clips[i] - clips[i - 1]) / ((marks[i] - marks[i - 1]) / 1000));
      }
      let prev = pickPose(atElapsed(attack, 0), 0).clipTime;
      for (let ms = 10; ms < endMs; ms += 10) {
        const now = pickPose(atElapsed(attack, ms), 0).clipTime;
        expect(now).toBeGreaterThanOrEqual(prev);
        expect(now - prev).toBeLessThanOrEqual(maxRate * 0.011);
        prev = now;
      }
      // anchors strictly ascend, so the whole segment is played in order
      for (let i = 1; i < clips.length; i += 1) expect(clips[i]).toBeGreaterThan(clips[i - 1]);
    }
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

  it("settle blends the finished pose into the idle, weights summing to 1", () => {
    const d = createDuelist();
    handleEvent(d, "cut");
    tick(d, 1500); // attack completes into settle
    expect(d.state.kind).toBe("settle");
    tick(d, 75); // halfway through SETTLE_MS 150
    const p = pickPose(d, 4321);
    expect(p.clip).toBe("gsIdle");
    expect(p.mode).toBe("loop");
    expect(p.blend?.clip).toBe("gsSlash");
    expect(p.blend?.clipTime).toBeCloseTo(WARP.slash.end);
    expect(p.blend?.weight).toBeCloseTo(0.5);
    // at the very start of the settle the finished pose still dominates
    const d2 = createDuelist();
    handleEvent(d2, "hitstun");
    tick(d2, 351); // expiry enters settle at t 0: the finished pose still fully dominates
    const p2 = pickPose(d2, 0);
    expect(p2.blend?.clip).toBe("gsImpact");
    expect(p2.blend?.weight).toBeCloseTo(1);
  });

  it("bind freezes the slash contact; every pick is a real clip", () => {
    const d = createDuelist();
    handleEvent(d, "bind");
    const p = pickPose(d, 0);
    expect(p).toEqual({ clip: "gsSlash", clipTime: POSE_T.bindContact, mode: "held" });
    for (const name of Object.keys(CLIPS)) expect(CLIPS[name as keyof typeof CLIPS].durationS).toBeGreaterThan(0);
  });
});
