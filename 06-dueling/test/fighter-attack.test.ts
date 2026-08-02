import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";
import type { FighterEvent } from "../src/combat/fighter";

describe("attack cascade", () => {
  test("player thrust: windup -> strike -> recovery -> idle, phase times per profile", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    const t = WEAPONS.rapier.attacks.thrust;
    applyIntent(f, "thrust");
    expect(f.state).toMatchObject({ kind: "attack", phase: "windup" });

    const phases: string[] = [];
    let strikeEndAt = -1;
    let elapsed = 0;
    for (let i = 0; i < 2000 / TICK; i++) {
      const evs: FighterEvent[] = tickFighter(f, TICK);
      elapsed += TICK;
      if (f.state.kind === "attack" && phases[phases.length - 1] !== f.state.phase) {
        phases.push(f.state.phase);
      }
      if (evs.some((e) => e.type === "strikeEnd")) strikeEndAt = elapsed;
      if (f.state.kind === "ready") break;
    }
    expect(phases).toEqual(["windup", "strike", "recovery"]);
    // strikeEnd fires at windup + beat + strike (within one tick)
    expect(strikeEndAt).toBeGreaterThanOrEqual(t.windup + t.beat + t.strike - TICK);
    expect(strikeEndAt).toBeLessThanOrEqual(t.windup + t.beat + t.strike + TICK);
    expect(f.state.kind).toBe("ready");
  });

  test("a windup bonus stretches the telegraph without touching the strike", () => {
    const f = createFighter(400, -1, WEAPONS.longsword);
    const bonus = WEAPONS.longsword.telegraphMs;
    applyIntent(f, "cut", { windupBonusMs: bonus });
    expect(f.state).toMatchObject({ kind: "attack", phase: "windup" });
    if (f.state.kind !== "attack") throw new Error("unreachable");
    const t = WEAPONS.longsword.attacks.cut;
    expect(f.state.timeline.riseStart).toBe(bonus);
    expect(f.state.timeline.strikeStart).toBe(bonus + t.windup + t.beat);
    expect(f.state.timeline.strikeEnd - f.state.timeline.strikeStart).toBe(t.strike);
  });

  test("attacks cannot be cancelled once started", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "cut");
    expect(applyIntent(f, "void")).toBe("ignored");
    expect(applyIntent(f, "retreat")).toBe("ignored");
  });

  test("engine can extend recovery on strikeEnd (whiff simulation)", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    const t = WEAPONS.rapier.attacks.thrust;
    applyIntent(f, "thrust");
    let extended = false;
    let elapsed = 0;
    let idleAt = -1;
    for (let i = 0; i < 3000 / TICK; i++) {
      const evs = tickFighter(f, TICK);
      elapsed += TICK;
      if (evs.some((e) => e.type === "strikeEnd") && f.state.kind === "attack") {
        // Replace the timeline atomically, as the engine does on a whiff.
        const tl = f.state.timeline;
        f.state.timeline = {
          ...tl,
          recoveryEnd: tl.recoveryStart + t.recovery * WEAPONS.rapier.whiffRecoveryFactor,
        };
        extended = true;
      }
      if (f.state.kind === "ready") { idleAt = elapsed; break; }
    }
    expect(extended).toBe(true);
    const expected = t.windup + t.beat + t.strike + t.recovery * WEAPONS.rapier.whiffRecoveryFactor;
    expect(idleAt).toBeGreaterThanOrEqual(expected - 2 * TICK);
    expect(idleAt).toBeLessThanOrEqual(expected + 2 * TICK);
  });
});
