import { describe, expect, it } from "vitest";
import { LONGSWORD } from "../src/duel/timings";
import { SETTLE_MS, createDuelist, handleEvent, tick } from "../src/duel/states";
import type { DuelState } from "../src/duel/states";

describe("duel state machine", () => {
  it("steps forward 60 cm over 260 ms then settles into ready", () => {
    const d = createDuelist();
    handleEvent(d, "stepFwd");
    expect(d.state.kind).toBe("step");
    tick(d, 130);
    expect(d.x).toBeCloseTo(30);
    tick(d, 130);
    expect(d.x).toBeCloseTo(60);
    tick(d, 1);
    expect(d.state.kind).toBe("settle");
    tick(d, SETTLE_MS);
    expect(d.state.kind).toBe("ready");
  });

  it("steps are facing-relative and voids hop backward 100 cm", () => {
    const d = createDuelist();
    handleEvent(d, "flip");
    expect(d.facing).toBe(-1);
    handleEvent(d, "stepFwd");
    tick(d, 260);
    expect(d.x).toBeCloseTo(-60);
    tick(d, 1);
    handleEvent(d, "void");
    tick(d, 320);
    expect(d.x).toBeCloseTo(-60 + 100); // void moves against facing
  });

  it("attacks walk windup -> strike -> recovery -> settle on 06's marks", () => {
    const d = createDuelist();
    handleEvent(d, "cut");
    if (d.state.kind !== "attack") throw new Error("not attacking");
    expect(d.state.phase).toBe("windup");
    tick(d, 700); // riseEnd 600 + beat 100 = strikeStart
    expect(d.state.kind === "attack" && d.state.phase).toBe("strike");
    tick(d, 380); // strikeEnd 1080
    expect(d.state.kind === "attack" && d.state.phase).toBe("recovery");
    tick(d, 420); // recoveryEnd 1500
    // the wind-down carries the finished attack frozen at its end, and a
    // new input may launch straight out of it
    const settled = d.state as DuelState;
    if (settled.kind === "settle" && settled.prior.kind === "attack") {
      expect(settled.prior.elapsedMs).toBe(1500);
    } else throw new Error("settle should carry the finished attack");
    handleEvent(d, "thrust");
    expect((d.state as DuelState).kind).toBe("attack");
  });

  it("ignores movement events mid-attack, honors reset from anywhere", () => {
    const d = createDuelist();
    handleEvent(d, "cut");
    handleEvent(d, "stepFwd");
    expect(d.state.kind).toBe("attack");
    handleEvent(d, "reset");
    expect(d.state.kind).toBe("ready");
    handleEvent(d, "death");
    expect(d.state.kind).toBe("dead");
    tick(d, 5000);
    expect(d.state.kind).toBe("dead"); // death holds
    handleEvent(d, "reset");
    expect(d.state.kind).toBe("ready");
  });

  it("parry forms while held and settles on release; hitstun expires into settle", () => {
    const d = createDuelist();
    handleEvent(d, "parryDown");
    expect(d.state.kind).toBe("parry");
    tick(d, 500);
    expect(d.state.kind).toBe("parry"); // held, does not expire
    handleEvent(d, "parryUp");
    expect(d.state.kind).toBe("settle");
    tick(d, SETTLE_MS);
    handleEvent(d, "hitstun");
    tick(d, 350);
    tick(d, 1);
    expect(d.state.kind).toBe("settle");
    tick(d, SETTLE_MS);
    expect(d.state.kind).toBe("ready");
  });

  it("clamps x to the piste bounds", () => {
    const d = createDuelist();
    for (let i = 0; i < 20; i++) { handleEvent(d, "stepFwd"); tick(d, 261); }
    expect(d.x).toBeLessThanOrEqual(400);
    expect(LONGSWORD.stepDistanceCm).toBe(60); // guard against constant drift
  });
});
