import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

function run(f: ReturnType<typeof createFighter>, ms: number) {
  for (let t = 0; t < ms; t += TICK) tickFighter(f, TICK);
}

describe("discrete steps", () => {
  test("advance moves exactly stepDistance toward facing, then settles, then frees up", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    expect(applyIntent(f, "advance")).toBe("accepted");
    expect(f.state.kind).toBe("step");
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance, 5);
    expect(f.state.kind).toBe("ready");
    expect(f.stepRecoveryMs).toBeGreaterThan(0); // settling: new actions buffer
    expect(applyIntent(f, "advance")).toBe("buffered");
    f.buffered = null;
    run(f, WEAPONS.longsword.stepRecoveryMs + TICK);
    expect(f.stepRecoveryMs).toBe(0);
    expect(applyIntent(f, "advance")).toBe("accepted");
  });

  test("retreat moves away from facing", () => {
    const f = createFighter(600, -1, WEAPONS.rapier);
    applyIntent(f, "retreat");
    run(f, WEAPONS.rapier.stepDuration + TICK);
    expect(f.x).toBeCloseTo(600 + WEAPONS.rapier.stepDistance, 5);
  });

  test("footfall fires when the foot lands, not when the step starts", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    // Mid-travel: no sound yet.
    const early: string[] = [];
    for (let t = 0; t < WEAPONS.longsword.stepDuration - 2 * TICK; t += TICK) {
      for (const e of tickFighter(f, TICK)) early.push(e.type);
    }
    expect(early).not.toContain("footfall");
    // The landing tick carries the event.
    const late: string[] = [];
    for (let t = 0; t < 4 * TICK; t += TICK) {
      for (const e of tickFighter(f, TICK)) late.push(e.type);
    }
    expect(late.filter((t) => t === "footfall")).toHaveLength(1);
  });

  test("a buffered step lands its own footfall", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(applyIntent(f, "advance")).toBe("buffered");
    const seen: string[] = [];
    const cycle = WEAPONS.longsword.stepDuration + WEAPONS.longsword.stepRecoveryMs;
    for (let t = 0; t < 2 * cycle + 4 * TICK; t += TICK) {
      for (const e of tickFighter(f, TICK)) seen.push(e.type);
    }
    expect(seen.filter((t) => t === "footfall")).toHaveLength(2);
  });

  test("input during a step is buffered (one slot) and fires after the settle", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(applyIntent(f, "advance")).toBe("buffered");
    expect(applyIntent(f, "retreat")).toBe("buffered"); // overwrites the slot
    run(f, WEAPONS.longsword.stepDuration + WEAPONS.longsword.stepRecoveryMs + 2 * TICK);
    expect(f.state.kind).toBe("step"); // buffered retreat fired
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance - WEAPONS.longsword.stepDistance, 5);
  });
});

describe("settle timer boundaries (the off-by-one-tick hiding places)", () => {
  test("the step's overrun is carried into the settle, keeping the cycle exact", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(300, 1, w);
    applyIntent(f, "advance");
    applyIntent(f, "advance"); // buffered chain
    // The full cycle in whole ticks, mirroring the engine's own two-segment
    // clock: the step accumulates up, then the settle counts down from the
    // seeded remainder. A single straight accumulation (or Math.ceil of the
    // ideal ratio) rounds differently when the cycle lands exactly on a
    // tick multiple (350ms = 21 ideal ticks), and misses by one.
    let t = 0;
    let cycleTicks = 0;
    while (t < w.stepDuration) { t += TICK; cycleTicks++; }
    let remaining = w.stepRecoveryMs - (t - w.stepDuration);
    while (remaining > 0) { remaining = Math.max(0, remaining - TICK); cycleTicks++; }
    for (let i = 0; i < cycleTicks - 1; i++) tickFighter(f, TICK);
    expect(f.buffered).toBe("advance"); // not yet
    tickFighter(f, TICK);
    expect(f.buffered).toBe(null); // flushed on the exact cycle tick
    expect(f.state.kind).toBe("step");
  });

  test("one oversized dt crosses step end, spends the settle, and flushes", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(300, 1, w);
    applyIntent(f, "advance");
    applyIntent(f, "cut"); // buffered
    // A single giant tick: travel + whole settle inside one call.
    tickFighter(f, w.stepDuration + w.stepRecoveryMs + 1);
    expect(f.x).toBeCloseTo(300 + w.stepDistance, 5); // clamped: never overshoots
    expect(f.state.kind).toBe("attack"); // buffer flushed in the same call
  });

  test("a parry raised mid-settle strands the buffer, exactly as the pause-interrupt did", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(300, 1, w);
    applyIntent(f, "advance");
    applyIntent(f, "advance"); // buffered
    run(f, w.stepDuration + TICK);
    expect(f.stepRecoveryMs).toBeGreaterThan(0);
    expect(applyIntent(f, "parry")).toBe("accepted");
    // The settle expires while the guard is up: no flush from inside parry.
    run(f, w.parryWindowMs + 2 * TICK);
    expect(f.state.kind).toBe("ready");
    expect(f.buffered).toBe("advance"); // still waiting; keyup clears it in play
  });
});
