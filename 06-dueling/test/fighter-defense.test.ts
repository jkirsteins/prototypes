import { describe, expect, test } from "vitest";
import { HIT_STUN_MS, TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

function run(f: ReturnType<typeof createFighter>, ms: number) {
  const out = [];
  for (let t = 0; t < ms; t += TICK) out.push(...tickFighter(f, TICK));
  return out;
}

describe("void", () => {
  test("moves backward voidDistance over voidDuration, committed throughout", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "void");
    expect(f.state.kind).toBe("void");
    expect(applyIntent(f, "cut")).toBe("ignored"); // committed
    run(f, WEAPONS.longsword.voidDuration + TICK);
    expect(f.x).toBeCloseTo(400 - WEAPONS.longsword.voidDistance, 5);
    expect(f.state.kind).toBe("ready");
  });

  test("facing=-1 voids backward for its facing (forward in world space)", () => {
    const f = createFighter(400, -1, WEAPONS.rapier);
    applyIntent(f, "void");
    expect(f.state.kind).toBe("void");
    run(f, WEAPONS.rapier.voidDuration + TICK);
    expect(f.x).toBeCloseTo(400 + WEAPONS.rapier.voidDistance, 5);
    expect(f.state.kind).toBe("ready");
  });
});

describe("parry", () => {
  test("the guard has no timer: it stands until released, then recovery gates re-entry", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    expect(applyIntent(f, "parry")).toBe("accepted");
    expect(f.parry).not.toBe(null);
    expect(f.state.kind).toBe("ready"); // the body stays free: parallel track
    run(f, 2000); // far past any window that ever existed
    expect(f.parry).not.toBe(null);
    expect(applyIntent(f, "parryRelease")).toBe("accepted");
    expect(f.parry).toBe(null);
    expect(applyIntent(f, "parry")).toBe("ignored"); // cooling down
    run(f, WEAPONS.rapier.parryRecoveryMs + TICK);
    expect(applyIntent(f, "parry")).toBe("accepted");
  });

  test("rule D: a raised parry persists through a step, but cannot be raised mid-step", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(400, 1, w);
    expect(applyIntent(f, "parry")).toBe("accepted");
    expect(applyIntent(f, "advance")).toBe("accepted"); // stepping does not drop it
    expect(f.state.kind).toBe("step");
    expect(f.parry).not.toBe(null);
    run(f, 3 * TICK);
    expect(f.parry).not.toBe(null); // still up mid-step
    // A second parry press mid-step is ignored, not queued.
    expect(applyIntent(f, "parry")).toBe("ignored");
  });

  test("attacking or voiding out of a raised parry drops it at full recovery cost", () => {
    for (const intent of ["cut", "void"] as const) {
      const f = createFighter(400, 1, WEAPONS.longsword);
      applyIntent(f, "parry");
      expect(applyIntent(f, intent)).toBe("accepted");
      expect(f.parry).toBe(null);
      expect(f.parryRecoveryMs).toBe(WEAPONS.longsword.parryRecoveryMs);
    }
  });
});

describe("parry is reactive, never queued", () => {
  test("a parry during a step is ignored, not buffered into a late guard", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(f.state.kind).toBe("step");
    expect(applyIntent(f, "parry")).toBe("ignored");
    expect(f.buffered).toBe(null);
    run(f, WEAPONS.longsword.stepDuration + WEAPONS.longsword.stepRecoveryMs + 2 * TICK);
    expect(f.state.kind).toBe("ready"); // no phantom parry fired on completion
    expect(f.parryRecoveryMs).toBe(0); // and no cooldown burned
  });

  test("a parry may go up during the settle after a step", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.state.kind).toBe("ready");
    expect(f.stepRecoveryMs).toBeGreaterThan(0); // still settling
    expect(applyIntent(f, "parry")).toBe("accepted"); // the timer does not gate the parry
    expect(f.parry).not.toBe(null);
  });
});

describe("hitstun", () => {
  test("hitstun leads to dead and emits died", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    f.state = { kind: "hitstun", t: 0 };
    const events = run(f, HIT_STUN_MS + 2 * TICK);
    expect(f.state.kind).toBe("dead");
    const diedEvents = events.filter((e) => e.type === "died");
    expect(diedEvents.length).toBe(1);
  });
});
