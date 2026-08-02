import { describe, expect, test } from "vitest";
import { pickFrame } from "../src/render/frames";
import { createFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

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

  test("cut holds frame 2 through the whole transition beat", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    f.state = { kind: "attack", attack: "cut", phase: "beat", t: 1, recoveryMs: 420, tell: false };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordAttack", frame: 2 });
    f.state.t = WEAPONS.longsword.attacks.cut.beat - 1;
    expect(pickFrame(f, 0).frame).toBe(2);
  });

  test("thrust strike walks frames 3..5 of the stab sheet", () => {
    const f = createFighter(300, 1, WEAPONS.rapier);
    const strike = WEAPONS.rapier.attacks.thrust.strike;
    f.state = { kind: "attack", attack: "thrust", phase: "strike", t: 0, recoveryMs: 260, tell: false };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordStab", frame: 3 });
    f.state.t = strike - 1;
    expect(pickFrame(f, 0).frame).toBe(5);
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
