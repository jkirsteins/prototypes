import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

function run(f: ReturnType<typeof createFighter>, ms: number) {
  for (let t = 0; t < ms; t += TICK) tickFighter(f, TICK);
}

describe("discrete steps", () => {
  test("advance moves exactly stepDistance toward facing, then pauses, then idles", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    expect(applyIntent(f, "advance")).toBe("accepted");
    expect(f.state.kind).toBe("step");
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance, 5);
    expect(f.state.kind).toBe("pause");
    run(f, WEAPONS.longsword.stancePause + TICK);
    expect(f.state.kind).toBe("idle");
  });

  test("retreat moves away from facing", () => {
    const f = createFighter(600, -1, WEAPONS.rapier);
    applyIntent(f, "retreat");
    run(f, WEAPONS.rapier.stepDuration + TICK);
    expect(f.x).toBeCloseTo(600 + WEAPONS.rapier.stepDistance, 5);
  });

  test("a step fired from the buffer emits stepStart; a direct step does not", () => {
    // Direct steps are observed by the engine at intent acceptance; only the
    // buffer path is invisible from outside, so only it emits an event.
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(applyIntent(f, "advance")).toBe("buffered");
    const seen: string[] = [];
    const ms = WEAPONS.longsword.stepDuration + WEAPONS.longsword.stancePause + 2 * TICK;
    for (let t = 0; t < ms; t += TICK) {
      for (const e of tickFighter(f, TICK)) seen.push(e.type);
    }
    expect(f.state.kind).toBe("step"); // buffered advance fired
    expect(seen.filter((t) => t === "stepStart")).toHaveLength(1);
  });

  test("input during a step is buffered (one slot) and fires after the pause", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(applyIntent(f, "advance")).toBe("buffered");
    expect(applyIntent(f, "retreat")).toBe("buffered"); // overwrites the slot
    run(f, WEAPONS.longsword.stepDuration + WEAPONS.longsword.stancePause + 2 * TICK);
    expect(f.state.kind).toBe("step"); // buffered retreat fired
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance - WEAPONS.longsword.stepDistance, 5);
  });
});
