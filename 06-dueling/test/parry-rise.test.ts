import { describe, expect, test } from "vitest";
import { AI_REACTION_MS, aiDecide, createAiState } from "../src/combat/ai";
import { TICK, applyIntent, createFighter, guardEffective, tickFighter } from "../src/combat/fighter";
import { createDuel, gapOf, parryMeetsAttack, tickDuel } from "../src/combat/engine";
import { WEAPONS, parryableMs } from "../src/combat/weapons";
import { pickFrame } from "../src/render/frames";
import { renderHelpHtml } from "../src/ui/help";
import type { AttackKind, WeaponId } from "../src/combat/types";

/**
 * TODO-1-parry-rise.md: the guard is visible from the press and effective
 * only after parryRiseMs. The engine-level tests drive real duels tick by
 * tick; nothing pokes parry.t by hand except the boundary tests, which pin
 * the exact tick the rise completes.
 */

const ws = Object.values(WEAPONS);

describe("invariants", () => {
  test("the rise keeps every guard readable: parryRiseMs >= AI_REACTION_MS", () => {
    for (const w of ws) expect(w.parryRiseMs).toBeGreaterThanOrEqual(AI_REACTION_MS);
  });

});

describe("guardEffective", () => {
  test("false while rising, true from the tick the rise completes", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    expect(guardEffective(f)).toBe(false); // no parry at all
    applyIntent(f, "parry");
    expect(guardEffective(f)).toBe(false); // visible, not yet formed
    let t = 0;
    for (; t < WEAPONS.longsword.parryRiseMs - 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(guardEffective(f)).toBe(false);
    for (; t < WEAPONS.longsword.parryRiseMs + 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(guardEffective(f)).toBe(true);
  });
});

describe("parryMeetsAttack: the rise condition, falsified independently", () => {
  /** Attacker mid-strike inside the parryable interval, defender's parry at tRise. */
  function setup(parryT: number) {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    const t = WEAPONS.rapier.attacks.thrust;
    const tl = {
      riseStart: 0, riseEnd: t.windup,
      strikeStart: t.windup + t.beat,
      parryableUntil: t.windup + t.beat + parryableMs(t),
      strikeEnd: t.windup + t.beat + t.strike,
      recoveryStart: t.windup + t.beat + t.strike,
      recoveryEnd: t.windup + t.beat + t.strike + t.recovery,
    };
    d.f[0].state = {
      kind: "attack", attack: "thrust", phase: "strike",
      // At parryableUntil the extension is full reach: arrived at the guard.
      elapsedMs: tl.parryableUntil, timeline: tl, height: "low", met: false, redirected: false, redirectedAtMs: null,
    };
    applyIntent(d.f[1], "parry");
    const p = d.f[1].parry;
    if (p !== null) {
      const rise = WEAPONS.longsword.parryRiseMs;
      if (parryT >= rise) {
        p.phase = "held";
        p.phaseMs = 0;
        p.phaseDurationMs = 0;
        p.settledMs = parryT - rise;
      } else {
        p.phaseMs = parryT;
      }
    }
    return d;
  }

  test("a still-rising guard does not meet, all other conditions holding", () => {
    const d = setup(WEAPONS.longsword.parryRiseMs - 1);
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
  });

  test("a formed guard meets, one tick past the rise", () => {
    const d = setup(WEAPONS.longsword.parryRiseMs);
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(true);
  });
});

describe("the rise changes what a press timing is worth (full duels)", () => {
  /** Longsword cut from side 0 (no telegraph); defender presses parry at pressMs. */
  function outcome(pressMs: number): "parried" | "hit" | "none" {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    const t = WEAPONS.longsword.attacks.cut;
    const pressTick = Math.round(pressMs / TICK);
    const evs = [];
    for (let i = 0; i * TICK < t.windup + t.beat + t.strike + 3 * TICK; i++) {
      evs.push(...tickDuel(d, i === 0 ? "cut" : null, i === pressTick ? "parry" : null));
    }
    if (evs.some((e) => e.kind === "parried")) return "parried";
    if (evs.some((e) => e.kind === "hit")) return "hit";
    return "none";
  }

  const t = WEAPONS.longsword.attacks.cut;
  const strikeAt = t.windup + t.beat;
  const rise = WEAPONS.longsword.parryRiseMs;

  test("an early press still parries: the guard is formed before the blade travels", () => {
    expect(outcome(strikeAt - rise - 60)).toBe("parried");
  });

  test("the last viable press is parryableUntil minus the rise", () => {
    expect(outcome(strikeAt + parryableMs(t) - rise - 2 * TICK)).toBe("parried");
  });

  test("a press after that deadline is a guard that forms too late: hit", () => {
    // Instantaneous parries made this press a save; the rise makes it a death.
    expect(outcome(strikeAt + parryableMs(t) - rise + 2 * TICK)).toBe("hit");
  });
});

describe("mode 1 coverage: what the dummy can still answer on reaction", () => {
  /**
   * Player attacks carry no telegraph, so the dummy has windup+beat of
   * visible preparation. The rapier thrust (260ms) is too fast for any
   * reactive guard to form - the one documented failure, TODO-1 §5.1.
   */
  const table: Array<{ def: WeaponId; atk: WeaponId; kind: AttackKind; result: "parried" | "hit" }> = [
    { def: "longsword", atk: "longsword", kind: "cut", result: "parried" },
    { def: "longsword", atk: "longsword", kind: "thrust", result: "parried" },
    { def: "longsword", atk: "rapier", kind: "cut", result: "parried" },
    { def: "longsword", atk: "rapier", kind: "thrust", result: "hit" },
    { def: "rapier", atk: "longsword", kind: "cut", result: "parried" },
    { def: "rapier", atk: "longsword", kind: "thrust", result: "parried" },
    { def: "rapier", atk: "rapier", kind: "cut", result: "parried" },
    { def: "rapier", atk: "rapier", kind: "thrust", result: "hit" },
  ];

  for (const row of table) {
    test(`${row.atk} ${row.kind} against a ${row.def} dummy: ${row.result}`, () => {
      const d = createDuel(WEAPONS[row.atk], WEAPONS[row.def]);
      d.f[0].x = 1000;
      d.f[1].x = 1000 + Math.min(WEAPONS[row.atk].reach, WEAPONS[row.def].reach) - 20;
      const ai = createAiState(1);
      const t = WEAPONS[row.atk].attacks[row.kind];
      const evs = [];
      for (let i = 0; i * TICK < t.windup + t.beat + t.strike + 3 * TICK; i++) {
        const ib = aiDecide(d, 1, ai, TICK);
        evs.push(...tickDuel(d, i === 0 ? row.kind : null, ib));
      }
      const got = evs.some((e) => e.kind === "parried") ? "parried" : evs.some((e) => e.kind === "hit") ? "hit" : "none";
      expect(got).toBe(row.result);
    });
  }
});

describe("presentation: the rise is drawn, not just simulated", () => {
  test("pickFrame holds the travelling pose while rising, the set pose once formed", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "parry");
    if (f.parry === null) throw new Error("parry not raised");
    expect(pickFrame(f, 0)).toEqual({ sheet: "swordAttack", frame: 1, flip: false }); // rising
    f.parry.phase = "held";
    expect(pickFrame(f, 0)).toEqual({ sheet: "swordAttack", frame: 2, flip: false });
  });

  test("the help panel cites each weapon's shipping rise", () => {
    const html = renderHelpHtml();
    for (const w of ws) expect(html).toContain(`${w.parryRiseMs}ms`);
  });
});
