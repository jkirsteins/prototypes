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
    expect(f.state.kind).toBe("idle");
  });
});

describe("parry", () => {
  test("parry lasts parryWindow, then cooldown blocks re-entry", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    expect(applyIntent(f, "parry")).toBe("accepted");
    run(f, WEAPONS.rapier.parryWindow + TICK);
    expect(f.state.kind).toBe("idle");
    expect(applyIntent(f, "parry")).toBe("ignored"); // cooling down
    run(f, WEAPONS.rapier.parryCooldown + TICK);
    expect(applyIntent(f, "parry")).toBe("accepted");
  });
});

describe("hitstun", () => {
  test("hitstun leads to dead and emits died", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    f.state = { kind: "hitstun", t: 0 };
    const events = run(f, HIT_STUN_MS + 2 * TICK);
    expect(f.state.kind).toBe("dead");
    expect(events.some((e) => e.type === "died")).toBe(true);
  });
});
