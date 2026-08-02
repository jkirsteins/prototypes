import { describe, expect, test } from "vitest";
import { ATTACK_FRAMES, pickFrame } from "../src/render/frames";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS, attackTimeline } from "../src/combat/weapons";
import { SHEETS } from "../src/render/sheets";
import type { AttackKind, WeaponId } from "../src/combat/types";

describe("pickFrame maps fighter state to sheet frames", () => {
  test("idle loops the sword idle sheet, speed scaled by weapon animSpeed", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    const a = pickFrame(f, 0);
    expect(a.sheet).toBe("swordIdle");
    expect(a.frame).toBe(0);
    // one idle frame lasts 125 / animSpeed ms
    const later = pickFrame(f, 125 / WEAPONS.longsword.animSpeed + 1);
    expect(later.frame).toBe(1);
  });

  test("cut holds frame 2 through the pre-strike stillness", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    const tl = attackTimeline(WEAPONS.longsword, "cut", 0);
    f.state = { kind: "attack", attack: "cut", phase: "windup", elapsedMs: tl.riseEnd + 1, timeline: tl, met: false };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordAttack", frame: 2 });
    f.state.elapsedMs = tl.strikeStart - 1;
    expect(pickFrame(f, 0).frame).toBe(2);
  });

  test("the strike frame flips exactly when the blade stops being meetable", () => {
    // The animation IS the parry window: travelling frame while the blade
    // can be met, delivered frame once it cannot.
    for (const [id, attack] of [
      ["rapier", "thrust"],
      ["longsword", "cut"],
    ] as Array<[WeaponId, AttackKind]>) {
      const w = WEAPONS[id];
      const plan = ATTACK_FRAMES[attack];
      const f = createFighter(300, 1, w);
      const tl = attackTimeline(w, attack, 0);
      f.state = { kind: "attack", attack, phase: "strike", elapsedMs: tl.strikeStart, timeline: tl, met: false };
      expect(pickFrame(f, 0)).toMatchObject({ sheet: plan.sheet, frame: plan.strike[0] });
      f.state.elapsedMs = tl.parryableUntil - 1;
      expect(pickFrame(f, 0).frame).toBe(plan.strike[0]);
      f.state.elapsedMs = tl.parryableUntil + 1;
      expect(pickFrame(f, 0).frame).toBe(plan.strike[1]);
      // Strike ends on the delivered pose: the sword is where it landed.
      f.state.elapsedMs = tl.strikeEnd - 1;
      expect(pickFrame(f, 0).frame).toBe(plan.strike[1]);
    }
  });

  test("visual and mechanic agree on every tick of every strike", () => {
    // Walk real accumulated ticks (float drift included): on every tick of
    // the strike phase, the travelling frame must be shown exactly when the
    // engine would still accept a met blade. One comparison, both sides.
    for (const id of ["longsword", "rapier"] as WeaponId[]) {
      for (const attack of ["cut", "thrust"] as AttackKind[]) {
        const w = WEAPONS[id];
        const plan = ATTACK_FRAMES[attack];
        const f = createFighter(300, 1, w);
        applyIntent(f, attack);
        for (let i = 0; i < 200; i++) {
          tickFighter(f, TICK);
          const s = f.state;
          if (s.kind !== "attack") break;
          if (s.phase !== "strike") continue;
          const meetable = s.elapsedMs <= s.timeline.parryableUntil;
          const travelling = pickFrame(f, 0).frame === plan.strike[0];
          expect(travelling).toBe(meetable);
        }
      }
    }
  });

  test("every plan's frames exist in its sheet and run in order", () => {
    for (const plan of Object.values(ATTACK_FRAMES)) {
      const last = SHEETS[plan.sheet].frames - 1;
      const seq = [...plan.windup, plan.beat, ...plan.strike, ...plan.recovery];
      expect(Math.max(...seq)).toBeLessThanOrEqual(last);
      expect(Math.min(...seq)).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
      // The delivered pose must be the strike's last frame and the recovery's
      // first must follow it, or the sword would jump at the lands-instant.
      expect(plan.recovery[0]).toBeGreaterThanOrEqual(plan.strike[1]);
    }
  });

  test("dead clamps to the last death frame", () => {
    const f = createFighter(300, -1, WEAPONS.longsword);
    f.state = { kind: "dead", t: 99999 };
    const p = pickFrame(f, 0);
    expect(p).toMatchObject({ sheet: "death", frame: 9, flip: true });
  });

  test("step maps t across the run sheet", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    f.state = { kind: "step", dir: 1, t: 0 };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordRun", frame: 0 });
    f.state.t = WEAPONS.longsword.stepDuration - 1;
    expect(pickFrame(f, 0).frame).toBe(7);
  });
});
