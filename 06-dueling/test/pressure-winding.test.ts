import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { canBind } from "../src/combat/contact";
import {
  BIND_ADVANTAGE_MS, BIND_LOSS_MS, GUARD_SETTLE_MS, createDuel, firmness, tickDuel,
} from "../src/combat/engine";
import {
  BIND_TIME_LIMIT_MS, CONTROL_GAIN, DRIFT_GRACE_MS, PULSE_COMMIT_BASE_MS,
  PULSE_RECOVERY_BASE_MS, YIELD_FAIL_PENALTY, YIELD_FAIL_RECOVERY_MS,
  YIELD_ZONE_MAX, YIELD_ZONE_MIN,
  YIELD_MEMORY_MS,
  bindTimerFrac, createBindContest, deriveInitialBindControl, derivePressurePulse,
  deriveYieldDuration, deriveYieldZone,
  applyBindInputs, incomingForce, netBindForce, startPress, startYield, tickBindContest,
  yieldThreat,
  pulseForce,
  yieldOpportunity,
} from "../src/combat/bind";
import { WEAPONS, bindTimeline, parryableMs } from "../src/combat/weapons";
import type { BindState } from "../src/combat/bind";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { BindContact, Intent, WeaponProfile } from "../src/combat/types";

/**
 * DONE-7-pressure-and-winding.md, control-contest revision: the bind is a
 * visible tug over one shared control value. Pressure pulses (committed
 * force curves) move it; a committed yield can turn sufficient incoming
 * force into a win; a calm-time drift toward the entry initiative resolves
 * abandoned binds. No hidden state, no neutral exit, no weapon-ID branch.
 */

const LS = WEAPONS.longsword;

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

/** LS mirror crossing: the player's delivered thrust stands in the line
 *  and the AI-side telegraphed thrust arrives into it -> bind. (A parried
 *  blade never binds since the force-into-force revision; the crossing
 *  is the one door in.) The player enters standing (firmness 1), the
 *  arriving blade soft, so the entry leans hard toward the player. */
function enterBind(x1 = 1180): Duel {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = x1;
  let ia: Intent | null = "thrust";
  let ib: Intent | null = "thrust";
  for (let t = 0; t < 1600; t += TICK) {
    tickDuel(d, ia, ib);
    ia = null;
    ib = null;
    if (d.bind !== null) return d;
  }
  throw new Error("no bind formed");
}

/** A constructed contest for unit-level ticking, outside any duel. */
function fixtureBind(
  w0: WeaponProfile = LS,
  w1: WeaponProfile = LS,
  opts?: { control?: number; contact?: [BindContact, BindContact] },
): BindState {
  const contact: [BindContact, BindContact] =
    opts?.contact ?? [{ kind: "guard", settledMs: 400 }, { kind: "strike", progress: 0.9 }];
  const firm: [number, number] = [firmness(contact[0], w0), firmness(contact[1], w1)];
  const bind: BindState = {
    t: 0,
    line: { height: "low", side: "inside" },
    contact,
    firmness: firm,
    ...createBindContest(contact, firm, [w0, w1], 1),
  };
  if (opts?.control !== undefined) bind.control = opts.control;
  return bind;
}

/** Ticks the fixture ms forward (or to a winner), returning the last result. */
function tickMs(bind: BindState, ms: number) {
  let last = { winner: null as 0 | 1 | null, cause: null as "pressure" | "yield" | null, yieldFails: [] as Array<{ side: 0 | 1 }> };
  const fails: typeof last.yieldFails = [];
  for (let t = 0; t < ms; t += TICK) {
    last = tickBindContest(bind, TICK);
    fails.push(...last.yieldFails);
    if (last.winner !== null) break;
  }
  return { ...last, yieldFails: fails };
}

describe("firmness is a pure function of the snapshot", () => {
  test("a strike's firmness is its progress: soft at the start, hard near arrival", () => {
    expect(firmness({ kind: "strike", progress: 0.03 }, LS)).toBeCloseTo(0.03, 5);
    expect(firmness({ kind: "strike", progress: 0.97 }, LS)).toBeCloseTo(0.97, 5);
    expect(firmness({ kind: "strike", progress: 1 }, LS)).toBe(1);
  });
  test("a guard's firmness is its settled time over GUARD_SETTLE_MS, capped", () => {
    expect(firmness({ kind: "guard", settledMs: TICK }, LS)).toBeCloseTo(TICK / GUARD_SETTLE_MS, 5);
    expect(firmness({ kind: "guard", settledMs: GUARD_SETTLE_MS }, LS)).toBe(1);
    expect(firmness({ kind: "guard", settledMs: 4000 }, LS)).toBe(1);
    expect(firmness({ kind: "guard", settledMs: 0 }, LS)).toBe(0);
  });
});

describe("entry: the starting position derives from both snapshots", () => {
  test("even entries start at zero; a lead leans the start toward its win", () => {
    expect(deriveInitialBindControl([1, 1], [LS, LS])).toBe(0);
    // Side 0 firmer: control starts negative (toward side 0's win at -1).
    expect(deriveInitialBindControl([1, 0.9], [LS, LS])).toBeCloseTo(-0.05, 5);
    expect(deriveInitialBindControl([0.9, 1], [LS, LS])).toBeCloseTo(0.05, 5);
    // The cap keeps every start outside both danger zones.
    expect(deriveInitialBindControl([1, 0.05], [LS, LS])).toBeCloseTo(-0.35, 5);
    expect(deriveInitialBindControl([0, 1], [LS, LS])).toBeCloseTo(0.35, 5);
  });

  test("a standing blade against an arriving one enters leaning toward the stander", () => {
    const d = enterBind();
    const b = d.bind;
    if (b === null) throw new Error("unreachable");
    expect(b.firmness[0]).toBe(1); // fully through its travel, standing
    expect(b.firmness[1]).toBeLessThan(0.2); // barely begun
    expect(b.control).toBeLessThan(-0.3);
    expect(b.control).toBeGreaterThanOrEqual(-0.35); // the entry cap
    expect(b.action[0].kind).toBe("ready");
    expect(b.action[1].kind).toBe("ready");
  });

  test("zones, pulses and yield numbers derive for every pairing canBind sustains", () => {
    const ws = Object.values(WEAPONS);
    let pairings = 0;
    for (const a of ws) {
      for (const b of ws) {
        if (!canBind(a, b)) continue;
        pairings++;
        const zone = deriveYieldZone(a, b);
        expect(zone).toBeGreaterThanOrEqual(YIELD_ZONE_MIN);
        expect(zone).toBeLessThanOrEqual(YIELD_ZONE_MAX);
        const pulse = derivePressurePulse(a);
        expect(pulse.commitMs).toBeCloseTo(PULSE_COMMIT_BASE_MS / a.bindHandling, 5);
        expect(pulse.peakForce).toBe(a.bindAuthority);
        expect(pulse.recoveryMs).toBeCloseTo((PULSE_RECOVERY_BASE_MS * a.bindAuthority) / a.bindHandling, 5);
        expect(deriveYieldDuration(a)).toBeGreaterThan(0);

      }
    }
    expect(pairings).toBeGreaterThan(0);
  });

  test("a new weapon gets its whole bind game from its numbers - no branch to add", () => {
    // A hypothetical sword: middling authority, quick hands, stiff enough
    // to bind its mirror. Every derivation must accept it as-is.
    const saber: WeaponProfile = {
      ...LS, id: LS.id, name: "Saber-like",
      bladeStiffness: 0.8, bindAuthority: 0.8, bindHandling: 1.0, rotationalControl: 0.9,
    };
    expect(canBind(saber, saber)).toBe(true);
    const bind = fixtureBind(saber, saber, { control: 0 });
    expect(startPress(bind, 0)).toBe(true);
    tickMs(bind, 400);
    expect(bind.control).toBeLessThan(0); // one uncontested pulse moved it
  });
});

describe("pressure", () => {
  test("one uncontested pulse moves control toward the presser's win, on the sine curve", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    expect(startPress(bind, 0)).toBe(true);
    const pulse = derivePressurePulse(LS);
    // Mid-commit: gathering, no force yet, control unmoved.
    tickMs(bind, pulse.commitMs / 2);
    expect(netBindForce(bind.action)).toBe(0);
    expect(bind.control).toBe(0);
    // Mid-active: the sine's crest.
    tickMs(bind, pulse.commitMs / 2 + pulse.activeMs / 2);
    expect(pulseForce(bind.action[0])).toBeGreaterThan(0.9 * pulse.peakForce);
    // Pulse done: control moved a meaningful step toward -1, not to it.
    tickMs(bind, pulse.activeMs / 2 + TICK);
    const expected = -CONTROL_GAIN * (2 / Math.PI) * pulse.peakForce * (pulse.activeMs / 1000);
    expect(bind.control).toBeLessThan(-0.05);
    expect(bind.control).toBeCloseTo(expected, 1);
  });

  test("the beat is exclusive: the first press claims it, the counter-press loses its turn", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    expect(startPress(bind, 0)).toBe(true); // first press claims the beat
    expect(startPress(bind, 1)).toBe(false); // a moment behind: turn LOST
    expect(bind.action[1].kind).toBe("ready");
    expect(bind.pending[1]).toBe(null); // lost outright, never queued
    // The claimed shove moves the marker whole - nothing cancels it.
    tickMs(bind, 400);
    expect(bind.control).toBeLessThan(-0.05);
    // The answer window: the other side claims once the beat is free, and
    // the marker swings back - a visible tug, not a frozen wiggle.
    const afterA = bind.control;
    expect(startPress(bind, 1)).toBe(true);
    tickMs(bind, 400);
    expect(bind.control).toBeGreaterThan(afterA + 0.05);
  });

  test("contested same-tick presses alternate: no side owns the race", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    applyBindInputs(bind, ["press", "press"]);
    const first = bind.lastClaimant;
    expect(first).not.toBe(null);
    // Run the pulse out, contest again: the beat goes the other way.
    tickMs(bind, 300);
    applyBindInputs(bind, ["press", "press"]);
    expect(bind.lastClaimant).toBe(1 - (first as 0 | 1));
  });

  test("commitment is real: refusals mid-action, and only the last GRACED tap fires at readiness", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    const pulse = derivePressurePulse(LS);
    startPress(bind, 0);
    expect(startYield(bind, 0)).toBe(false); // mid-commit: committed is committed
    expect(startPress(bind, 0)).toBe(false);
    tickMs(bind, pulse.commitMs + pulse.activeMs / 2);
    expect(bind.action[0].kind).toBe("pressActive");
    // Those early taps aged past the grace long before readiness: nothing
    // fires by itself.
    tickMs(bind, pulse.activeMs / 2 + pulse.recoveryMs + 2 * TICK);
    expect(bind.action[0].kind).toBe("ready");
    expect(bind.pending[0]).toBe(null);
    // A tap inside the grace fires the moment the track is ready - and
    // the slot holds ONE input, the last one wins.
    startPress(bind, 0);
    tickMs(bind, pulse.commitMs + pulse.activeMs + pulse.recoveryMs / 2);
    expect(startPress(bind, 0)).toBe(false); // mid-recovery: queued
    expect(startYield(bind, 0)).toBe(false); // replaces the queued press
    tickMs(bind, pulse.recoveryMs / 2 + 2 * TICK);
    expect(bind.action[0].kind).toBe("yielding"); // the LAST tap fired, once
  });

  test("the grace slot: an early tap expires, a late tap fires at readiness, never a train", () => {
    const d = enterBind();
    if (d.bind === null) throw new Error("unreachable");
    runMs(d, TICK, "press", null);
    expect(d.bind?.action[0].kind).toBe("pressCommit");
    // A tap this early in the cycle ages past the grace before readiness:
    // it expires, and nothing fires by itself.
    runMs(d, TICK, "press", null);
    const pulse = derivePressurePulse(LS);
    const cycle = pulse.commitMs + pulse.activeMs + pulse.recoveryMs;
    runMs(d, cycle + 3 * TICK);
    if (d.bind === null) throw new Error("resolved early");
    expect(d.bind.action[0].kind).toBe("ready");
    expect(d.bind.pending[0]).toBe(null);
    expect(d.f[0].buffered).toBe(null); // the body's buffer stays out of binds
    // A tap late in the cycle rides the grace into the next pulse: the
    // mash stays fluid instead of eating misaligned inputs.
    runMs(d, TICK, "press", null);
    runMs(d, cycle - 60);
    runMs(d, TICK, "press", null); // mid-recovery: queued
    runMs(d, 70);
    if (d.bind !== null) {
      const k = d.bind.action[0].kind;
      expect(k === "pressCommit" || k === "pressActive").toBe(true); // fired at readiness
    }
  });

  test("no normal combat intent exits a bind", () => {
    const d = enterBind();
    const xs = [d.f[0].x, d.f[1].x];
    for (const intent of ["advance", "retreat", "void", "parry", "feint", "stanceUp"] as Intent[]) {
      runMs(d, TICK, intent, intent);
      expect(d.f[0].state.kind).toBe("bind");
      expect(d.f[1].state.kind).toBe("bind");
      expect(d.f[0].buffered).toBe(null);
      expect(d.f[1].buffered).toBe(null);
    }
    expect([d.f[0].x, d.f[1].x]).toEqual(xs);
  });
});

describe("yield", () => {
  test("outside the zone it always commits, fails, costs the penalty and a recovery", () => {
    const bind = fixtureBind(LS, LS, { control: 0.2 });
    expect(startYield(bind, 0)).toBe(true); // never silently ignored
    const r = tickMs(bind, deriveYieldDuration(LS) + 2 * TICK);
    expect(r.winner).toBe(null);
    expect(r.yieldFails.length).toBe(1);
    expect(r.yieldFails[0].side).toBe(0);
    expect(bind.control).toBeCloseTo(0.2 + YIELD_FAIL_PENALTY, 5);
    expect(bind.action[0].kind).toBe("yieldFailRecover");
    expect(startYield(bind, 0)).toBe(false); // the recovery is the cost
    tickMs(bind, YIELD_FAIL_RECOVERY_MS);
    expect(bind.action[0].kind).toBe("ready");
  });

  test("outside the zone even a fresh remembered push does not make it succeed", () => {
    const bind = fixtureBind(LS, LS, { control: 0.3 });
    bind.sinceForce[0] = 0; // their push just passed: catchable force exists
    startYield(bind, 0);
    const r = tickMs(bind, deriveYieldDuration(LS) + 2 * TICK);
    // Plenty to turn - position, not force, is what failed.
    expect(r.winner).toBe(null);
    expect(r.yieldFails.length).toBe(1);
  });

  test("in the zone without incoming pressure the yield starves: shallow fails survive, deep fails lose", () => {
    // At the zone's shallow edge the penalty jolt hurts but stays short
    // of the endpoint: the yielder recovers, deeper in danger.
    const zone = deriveYieldZone(LS, LS);
    const shallow = fixtureBind(LS, LS, { control: 1 - zone + 0.01 });
    expect(yieldOpportunity(shallow, 0)).toBe(false); // in the zone, but nothing to turn
    startYield(shallow, 0);
    const r1 = tickMs(shallow, deriveYieldDuration(LS) + 2 * TICK);
    expect(r1.yieldFails.length).toBe(1);
    expect(r1.winner).toBe(null);
    expect(shallow.control).toBeCloseTo(1 - zone + 0.01 + YIELD_FAIL_PENALTY, 5);
    expect(shallow.action[0].kind).toBe("yieldFailRecover");
    // Deep in the zone the same starved fail crosses the endpoint: the
    // bind is lost outright, a pressure win for the opponent.
    const deep = fixtureBind(LS, LS, { control: 0.9 });
    startYield(deep, 0);
    const r2 = tickMs(deep, deriveYieldDuration(LS) + 2 * TICK);
    expect(r2.yieldFails.length).toBe(1);
    expect(r2.winner).toBe(1);
    expect(r2.cause).toBe("pressure");
  });

  test("their beat dooms a fresh K; the gap after it is the catch", () => {
    // During their claimed beat the window is dark - they pressed first -
    // and a K anyway COMMITS the doomed rotation: deep in the zone, the
    // fail's jolt loses the bind outright. (A blocked K that cost nothing
    // could be spammed until it landed in a gap, and the yield would be a
    // guaranteed answer to pressure again.)
    const doomed = fixtureBind(LS, LS, { control: 0.85 });
    const pulse = derivePressurePulse(LS);
    doomed.action[1] = { kind: "pressActive", t: pulse.activeMs / 4, pulse };
    expect(yieldThreat(doomed, 0)).toBe(true); // force to turn exists...
    expect(yieldOpportunity(doomed, 0)).toBe(false); // ...but the beat is theirs
    expect(startYield(doomed, 0)).toBe(true); // committed regardless
    const r1 = tickMs(doomed, deriveYieldDuration(LS) + 2 * TICK);
    expect(r1.winner).toBe(1);
    expect(r1.cause).toBe("pressure");
    // The beat frees into their recovery: the spent force is still on
    // the blade (memory) and the TIMED K catches it.
    const gap = fixtureBind(LS, LS, { control: 0.85 });
    gap.action[1] = { kind: "pressRecover", t: 0, durationMs: pulse.recoveryMs };
    gap.sinceForce[0] = 0;
    expect(yieldOpportunity(gap, 0)).toBe(true);
    expect(startYield(gap, 0)).toBe(true);
    const r2 = tickMs(gap, deriveYieldDuration(LS) + 2 * TICK);
    expect(r2.winner).toBe(0);
    expect(r2.cause).toBe("yield");
  });

  test("the window has memory: a push stays catchable briefly after its force passes", () => {
    // At tap tempo the raw force flickers at 5Hz - an unhittable strobe
    // if the window were instantaneous. The memory keeps the band SOLID
    // while the opponent genuinely presses, and lets it go dark only
    // when they genuinely stop.
    const bind = fixtureBind(LS, LS, { control: 0.85 });
    startPress(bind, 1);
    const pulse = derivePressurePulse(LS);
    tickMs(bind, pulse.commitMs + pulse.activeMs + TICK);
    expect(incomingForce(netBindForce(bind.action), 0)).toBe(0); // the pulse is spent
    expect(yieldOpportunity(bind, 0)).toBe(true); // but its push is still on the blade
    tickMs(bind, YIELD_MEMORY_MS + 2 * TICK);
    expect(yieldOpportunity(bind, 0)).toBe(false); // genuinely stopped: window gone
  });

  test("a K mid-own-recovery rides the grace and still catches: the eaten-input death is gone", () => {
    // The reported bug: tap-warring, then pressing K in the zone - the K
    // landed during the player's own recovery, vanished silently, and
    // the endpoint arrived. Now it queues, fires at readiness, and the
    // memory-lit window makes the catch.
    const bind = fixtureBind(LS, LS, { control: 0.85 });
    startPress(bind, 0); // the player's own tap claims the beat: busy through its cycle
    // The enemy mashes throughout, claiming the beat the moment it frees,
    // so real force is mid-flow when the player's queued K fires.
    for (let t = 0; t < 180; t += TICK) {
      startPress(bind, 1);
      tickMs(bind, TICK);
    }
    expect(startYield(bind, 0)).toBe(false); // own recovery: queued, not eaten
    // The pending K waits out the enemy's claimed beat too, and fires in
    // the first gap - the enemy's own recovery - within its grace.
    let r = tickMs(bind, TICK);
    let guard = 0;
    while (r.winner === null && guard++ < 100) {
      startPress(bind, 1); // the enemy keeps mashing
      r = tickMs(bind, TICK);
    }
    expect(r.winner).toBe(0);
    expect(r.cause).toBe("yield");
  });

  test("the catch is decided at the press: the memory expiring mid-motion does not spoil it", () => {
    // Snapshot rule: the blade caught the remembered push at the press;
    // nothing that happens during the turning motion un-catches it.
    const bind = fixtureBind(LS, LS, { control: 0.85 });
    bind.sinceForce[0] = YIELD_MEMORY_MS - TICK; // the window's last moment
    expect(yieldOpportunity(bind, 0)).toBe(true);
    startYield(bind, 0);
    const r = tickMs(bind, deriveYieldDuration(LS) + 2 * TICK);
    expect(r.winner).toBe(0);
    expect(r.cause).toBe("yield");
  });

  test("the lit band is an honest promise: lit at the press means the yield wins", () => {
    const pulse = derivePressurePulse(LS);
    for (const control of [0.75, 0.85, 0.92]) {
      for (const frac of [0, 0.25, 0.5, 0.9]) {
        const bind = fixtureBind(LS, LS, { control });
        bind.action[1] = { kind: "pressActive", t: pulse.activeMs * frac, pulse };
        const lit = yieldOpportunity(bind, 0);
        startYield(bind, 0);
        const r = tickMs(bind, deriveYieldDuration(LS) + 4 * TICK);
        expect(r.winner === 0).toBe(lit);
      }
    }
  });

  test("too late: the endpoint arrives mid-yield and the presser wins", () => {
    // Deep enough that a mashing opponent crosses the last sliver before
    // the turning motion completes - the catch was real, the race lost.
    const bind = fixtureBind(LS, LS, { control: 0.995 });
    bind.sinceForce[0] = 0; // caught in the gap, on remembered force
    expect(yieldOpportunity(bind, 0)).toBe(true);
    startYield(bind, 0);
    let r = tickMs(bind, TICK);
    let guard = 0;
    while (r.winner === null && guard++ < 100) {
      startPress(bind, 1); // refused while committed: an honest mash
      r = tickMs(bind, TICK);
    }
    expect(r.winner).toBe(1);
    expect(r.cause).toBe("pressure");
  });
});

describe("the bind's rhythm is simulated, not input-driven", () => {
  test("the pulse thud fires when the shove's force lands, never on the keypress, and is unlogged", () => {
    const d = enterBind();
    if (d.bind === null) throw new Error("unreachable");
    const pulse = derivePressurePulse(LS);
    const pressEvs = runMs(d, TICK, "press", null);
    expect(pressEvs.some((e) => e.kind === "pulse")).toBe(false); // the keypress is silent
    // The commit is the gathering; the thud lands when force does.
    const evs: DuelEvent[] = [];
    let ticks = 0;
    while (!evs.some((e) => e.kind === "pulse") && ticks++ < 20) evs.push(...runMs(d, TICK));
    const thud = evs.find((e) => e.kind === "pulse");
    expect(thud).toBeDefined();
    if (!thud) throw new Error("unreachable");
    // The press tick itself already ran one dt of the commit, so the
    // force lands one tick earlier than a naive ceil from the press.
    expect(ticks).toBe(Math.ceil(pulse.commitMs / TICK) - 1);
    expect(thud.side).toBe(0);
    expect(d.log.some((e) => e.kind === "pulse")).toBe(false); // presentation-only
  });
});

describe("anti-stall drift", () => {
  test("two passive fighters resolve toward the entry initiative, by pressure", () => {
    const d = enterBind();
    if (d.bind === null) throw new Error("unreachable");
    expect(d.bind.leadSign).toBe(-1); // the settled guard entered with the lead
    const evs = runMs(d, 6000);
    expect(d.bind).toBe(null);
    expect(evs.filter((e) => e.kind === "bindBreak").length).toBe(1);
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.f[0].bindAdvantageMs).toBeGreaterThanOrEqual(0); // decayed by now, was seeded
    expect(evs.some((e) => e.kind === "bindBreak" && e.side === 0)).toBe(true);
  });

  test("the drift runs on calm time: an acting fighter suppresses it", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    // Passive: calm accrues past the grace and the drift moves control.
    tickMs(bind, DRIFT_GRACE_MS + 400);
    const drifted = bind.control;
    expect(drifted).toBeLessThan(0); // leadSign -1: toward the guard's win
    // A pulse resets the calm clock: right after it, no drift component.
    startPress(bind, 1);
    const before = bind.control;
    tickMs(bind, derivePressurePulse(LS).commitMs / 2);
    // Mid-commit: no force yet, and no drift either (calm was reset).
    expect(bind.control).toBeCloseTo(before, 8);
  });

  test("equal leads fall through the documented tie cascade", () => {
    const contact: [BindContact, BindContact] =
      [{ kind: "strike", progress: 1 }, { kind: "strike", progress: 1 }];
    // Leads equal, progress equal: the terminal fact is which blade
    // completed the contact (the bind event's carrier).
    const c = createBindContest(contact, [1, 1], [LS, LS], 1);
    expect(c.leadSign).toBe(0);
    expect(c.tieSign).toBe(1);
    const bind: BindState = {
      t: 0, line: { height: "low", side: "inside" }, contact, firmness: [1, 1], ...c,
    };
    const r = tickMs(bind, 8000);
    expect(r.winner).toBe(1);
    // But a force having existed takes precedence over the entry fact:
    // side 0 pulses once, then both sit - the drift follows that force.
    const bind2: BindState = {
      t: 0, line: { height: "low", side: "inside" }, contact, firmness: [1, 1],
      ...createBindContest(contact, [1, 1], [LS, LS], 1),
    };
    startPress(bind2, 0);
    const r2 = tickMs(bind2, 10000);
    expect(r2.winner).toBe(0);
  });
});

describe("the bind clock", () => {
  test("an active stalemate expires at BIND_TIME_LIMIT_MS; play on the expiry tick still wins first", () => {
    // Both sides pulse in lockstep: forces cancel exactly, calm never
    // accrues, the drift never fires - only the clock can end this.
    const bind = fixtureBind(LS, LS, { control: 0 });
    let expired = false;
    for (let t = 0; t < BIND_TIME_LIMIT_MS + 200 && !expired; t += TICK) {
      if (bind.action[0].kind === "ready") startPress(bind, 0);
      if (bind.action[1].kind === "ready") startPress(bind, 1);
      const r = tickBindContest(bind, TICK);
      expect(r.winner).toBe(null);
      expired = r.expired;
    }
    expect(expired).toBe(true);
    expect(bind.t).toBeGreaterThanOrEqual(BIND_TIME_LIMIT_MS);
    expect(bind.t).toBeLessThan(BIND_TIME_LIMIT_MS + 2 * TICK);
    // Alternating claimed beats swing the marker but net nothing: at
    // expiry it sits within one shove of even, never near an endpoint.
    expect(Math.abs(bind.control)).toBeLessThan(0.15);
  });

  test("the HUD's timer fraction is a pure read of the clock", () => {
    const bind = fixtureBind(LS, LS, { control: 0 });
    expect(bindTimerFrac(bind)).toBe(1);
    bind.t = BIND_TIME_LIMIT_MS / 2;
    expect(bindTimerFrac(bind)).toBeCloseTo(0.5, 5);
    bind.t = BIND_TIME_LIMIT_MS + 50;
    expect(bindTimerFrac(bind)).toBe(0);
  });

  test("expiry breaks neutral: both are shoved apart, nobody wins", () => {
    const d = enterBind();
    const gap0 = Math.abs(d.f[0].x - d.f[1].x);
    const evs: DuelEvent[] = [];
    let guard = 0;
    // Both mash pressure whenever free: the engine-level active stalemate.
    while (d.bind !== null && guard++ < 400) {
      const ia: Intent | null = d.bind.action[0].kind === "ready" ? "press" : null;
      const ib: Intent | null = d.bind.action[1].kind === "ready" ? "press" : null;
      evs.push(...runMs(d, TICK, ia, ib));
    }
    expect(d.bind).toBe(null);
    // Neutral: no ring, no winner's advantage, no loser's exposure - the
    // shove-apart is an involuntary retreat step through the normal step
    // machinery, so the fighters visibly separate.
    expect(evs.some((e) => e.kind === "bindBreak")).toBe(false);
    expect(d.f[0].bindAdvantageMs).toBe(0);
    expect(d.f[1].bindAdvantageMs).toBe(0);
    expect(d.f[0].state.kind).toBe("step");
    expect(d.f[1].state.kind).toBe("step");
    runMs(d, LS.stepDuration + 2 * TICK);
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.f[1].state.kind).toBe("ready");
    const gap1 = Math.abs(d.f[0].x - d.f[1].x);
    expect(gap1).toBeCloseTo(gap0 + 2 * LS.stepDistance, 0);
    // A crossing involves no guards: nobody is charged a parry recovery.
    expect(d.f[0].parryRecoveryMs).toBe(0);
  });
});

describe("resolution and the reward", () => {
  /** Presses whenever ready until the bind resolves; the dummy holds. */
  function winAsPlayer(x1 = 1190): Duel {
    const d = enterBind(x1);
    let guard = 0;
    while (d.bind !== null && guard++ < 600) {
      const ia: Intent | null = d.bind.action[0].kind === "ready" ? "press" : null;
      runMs(d, TICK, ia, null);
    }
    if (d.bind !== null) throw new Error("bind never resolved");
    if (d.f[0].bindAdvantageMs <= 0) throw new Error("player did not win");
    return d;
  }

  test("pressure reaching the endpoint wins: advantage, exposure, one bindBreak on that tick", () => {
    const d = enterBind();
    const evs: DuelEvent[] = [];
    let guard = 0;
    const pressTicks: number[] = [];
    while (d.bind !== null && guard++ < 600) {
      const ia: Intent | null = d.bind.action[0].kind === "ready" ? "press" : null;
      if (ia !== null) pressTicks.push(d.time);
      evs.push(...runMs(d, TICK, ia, null));
    }
    const brk = evs.filter((e) => e.kind === "bindBreak");
    expect(brk.length).toBe(1);
    expect(brk[0].side).toBe(0);
    expect(brk[0].text).toContain("presses through");
    // The ring lands on the resolution tick the simulation reached, never
    // on a keypress tick: the last press was a full integration earlier.
    expect(brk[0].time).toBeGreaterThan(pressTicks[pressTicks.length - 1]);
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.f[0].bindAdvantageMs).toBe(BIND_ADVANTAGE_MS);
    expect(d.f[1].state.kind).toBe("exposed");
    // A crossing involves no guards: no parry recovery on either side.
    expect(d.f[0].parryRecoveryMs).toBe(0);
    expect(d.f[1].parryRecoveryMs).toBe(0);
  });

  test("a successful yield enters the same reward: bind win, not duel win", () => {
    const d = enterBind();
    if (d.bind === null) throw new Error("unreachable");
    // Force the contest to the player's danger edge, feed a whole pulse,
    // then catch its spent force in the GAP - the beat locks the yield
    // while the pulse itself runs.
    d.bind.control = 0.85;
    runMs(d, TICK, null, "press");
    const pulse = derivePressurePulse(LS);
    runMs(d, pulse.commitMs + pulse.activeMs + TICK);
    if (d.bind === null) throw new Error("resolved early");
    expect(yieldOpportunity(d.bind, 0)).toBe(true); // their recovery: the window
    const evs: DuelEvent[] = [];
    evs.push(...runMs(d, TICK, "yield", null));
    let guard = 0;
    while (d.bind !== null && guard++ < 200) evs.push(...runMs(d, TICK));
    const brk = evs.filter((e) => e.kind === "bindBreak");
    expect(brk.length).toBe(1);
    expect(brk[0].side).toBe(0);
    expect(brk[0].text).toContain("yields and turns");
    expect(d.over).toBe(false); // a bind win, never the duel
    expect(d.f[0].bindAdvantageMs).toBe(BIND_ADVANTAGE_MS);
    expect(d.f[1].state.kind).toBe("exposed");
  });

  test("a failed yield is logged with its numbers - the lost bind explains itself", () => {
    const d = enterBind();
    const evs = runMs(d, deriveYieldDuration(LS) + 3 * TICK, "yield", null);
    const yf = evs.find((e) => e.kind === "yieldFail");
    expect(yf).toBeDefined();
    if (!yf) throw new Error("unreachable");
    expect(yf.side).toBe(0);
    expect(yf.text).toContain("yields into nothing");
    expect(d.log.some((e) => e.kind === "yieldFail")).toBe(true);
  });

  test("the loser is exposed: no intents, exactly BIND_LOSS_MS, then ready", () => {
    const d = winAsPlayer();
    expect(d.f[1].state.kind).toBe("exposed");
    runMs(d, 5 * TICK, null, "cut");
    expect(d.f[1].state.kind).toBe("exposed"); // refused
    expect(d.f[1].buffered).toBe(null);
    let ticks = 5;
    while (d.f[1].state.kind === "exposed" && ticks < 40) {
      runMs(d, TICK);
      ticks++;
    }
    expect(d.f[1].state.kind).toBe("ready");
    expect(ticks).toBe(Math.ceil(BIND_LOSS_MS / TICK));
  });

  test("the immediate thrust kills inside the exposure", () => {
    const d = winAsPlayer();
    const evs = runMs(d, 600, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("the advantage is honest to its last tick: a thrust launched just inside it still kills", () => {
    const d = winAsPlayer();
    runMs(d, BIND_ADVANTAGE_MS - 3 * TICK); // hesitate almost the whole window
    const evs = runMs(d, 800, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("after the advantage expires the thrust is a normal attack; the loser comes back and escapes it", () => {
    const d = winAsPlayer();
    runMs(d, BIND_ADVANTAGE_MS + 2 * TICK); // admire the opening until it lapses
    let voided = false;
    const evs: DuelEvent[] = [];
    let ia: Intent | null = "thrust";
    for (let t = 0; t < 2000; t += TICK) {
      let ib: Intent | null = null;
      if (!voided && d.f[1].state.kind === "ready") {
        ib = "void";
        voided = true;
      }
      evs.push(...tickDuel(d, ia, ib));
      ia = null;
    }
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
    expect(d.over).toBe(false);
  });

  test("the advantage decays; on its last positive tick the thrust still launches from the bind", () => {
    const f = createFighter(400, 1, LS);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    for (let t = 0; t + TICK < BIND_ADVANTAGE_MS; t += TICK) tickFighter(f, TICK);
    expect(f.bindAdvantageMs).toBeGreaterThan(0);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("refused");
    expect(s.timeline.strikeStart).toBe(0); // bindTimeline
    expect(f.bindAdvantageMs).toBe(0); // consumed
  });

  test("expired, the same thrust launches on the normal timeline", () => {
    const f = createFighter(400, 1, LS);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    for (let t = 0; t < BIND_ADVANTAGE_MS + 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(f.bindAdvantageMs).toBe(0);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("refused");
    expect(s.timeline.strikeStart).toBe(LS.attacks.thrust.windup + LS.attacks.thrust.beat);
  });

  test("every other accepted intent clears the advantage and proceeds normally", () => {
    const intents: Intent[] = ["cut", "advance", "void", "parry"];
    for (const intent of intents) {
      const f = createFighter(400, 1, LS);
      f.bindAdvantageMs = BIND_ADVANTAGE_MS;
      const r = applyIntent(f, intent);
      expect(r).toBe("accepted");
      expect(f.bindAdvantageMs).toBe(0);
      if (intent === "cut") {
        const s = f.state;
        if (s.kind !== "attack") throw new Error("unreachable");
        expect(s.timeline.strikeStart).toBe(LS.attacks.cut.windup + LS.attacks.cut.beat); // full price
      }
    }
    const f = createFighter(400, 1, LS);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    expect(applyIntent(f, "parryRelease")).toBe("ignored");
    expect(f.bindAdvantageMs).toBe(BIND_ADVANTAGE_MS);
  });
});

describe("bindTimeline and its cues", () => {
  test("every mark before strikeStart is zero; strike and recovery are the thrust's own", () => {
    for (const w of Object.values(WEAPONS)) {
      const tl = bindTimeline(w);
      const t = w.attacks.thrust;
      expect(tl.riseStart).toBe(0);
      expect(tl.riseEnd).toBe(0);
      expect(tl.strikeStart).toBe(0);
      expect(tl.parryableUntil).toBe(parryableMs(t));
      expect(tl.strikeEnd).toBe(t.strike);
      expect(tl.recoveryEnd).toBe(t.strike + t.recovery);
    }
  });

  test("no windup event, one swing, one outcome sound - in the simulation, at its instants", () => {
    const d = enterBind();
    let guard = 0;
    while (d.bind !== null && guard++ < 600) {
      const ia: Intent | null = d.bind.action[0].kind === "ready" ? "press" : null;
      runMs(d, TICK, ia, null);
    }
    const evs = runMs(d, 600, "thrust", null);
    expect(evs.some((e) => e.kind === "windup" && e.side === 0)).toBe(false);
    expect(evs.filter((e) => e.kind === "swing" && e.side === 0).length).toBe(1);
    expect(evs.filter((e) => e.kind === "hit" && e.side === 0).length).toBe(1);
  });

  test("the reward arithmetic holds for every pairing canBind sustains", () => {
    const ws = Object.values(WEAPONS);
    let pairings = 0;
    for (const a of ws) {
      for (const b of ws) {
        if (!canBind(a, b)) continue;
        pairings++;
        // The timer's HONESTY, per pairing: a thrust launched on the
        // advantage's last tick still resolves inside the exposure.
        expect(BIND_ADVANTAGE_MS + bindTimeline(a).strikeEnd).toBeLessThanOrEqual(BIND_LOSS_MS);
        expect(BIND_ADVANTAGE_MS + bindTimeline(b).strikeEnd).toBeLessThanOrEqual(BIND_LOSS_MS);
      }
    }
    expect(pairings).toBeGreaterThan(0);
  });
});

describe("the HUD reads live simulation state", () => {
  test("prompt, side status, headline and bands are pure reads of the contest", async () => {
    const { bindHeadline, bindPrompt, bindSideStatus } = await import("../src/render/draw");
    const bind = fixtureBind(LS, LS, { control: 0 });
    expect(bindPrompt(false, false)).toContain("J");
    expect(bindPrompt(false, false)).toContain("K");
    expect(bindHeadline(bind)).toBe("BIND: NEUTRAL");
    expect(bindSideStatus(bind, 0).label).toBe("READY");
    expect(bindSideStatus(bind, 1).label).toBe("HOLDING");
    // A player pulse: the headline flips as the force turns real.
    startPress(bind, 0);
    expect(bindSideStatus(bind, 0).label).toBe("PRESSING");
    expect(bindSideStatus(bind, 0).recovery).not.toBe(null);
    const pulse = derivePressurePulse(LS);
    tickMs(bind, pulse.commitMs + pulse.activeMs / 2);
    expect(bindHeadline(bind)).toBe("BIND: PLAYER PRESSURE");
    tickMs(bind, pulse.activeMs / 2 + TICK);
    expect(bindSideStatus(bind, 0).label).toBe("PRESS RECOVERY");
    expect(bindSideStatus(bind, 1).label).toBe("HOLDING");
    // During the opponent's claimed beat, "READY" would lie: both verbs
    // are locked out, and the bar tracks their claim for the timed answer.
    const hot = fixtureBind(LS, LS, { control: 0.85 });
    expect(bindSideStatus(hot, 0).label).toBe("READY"); // no force to turn
    hot.action[1] = { kind: "pressActive", t: pulse.activeMs / 2, pulse };
    expect(yieldOpportunity(hot, 0)).toBe(false); // the beat is theirs
    const blocked = bindSideStatus(hot, 0);
    expect(blocked.label).toBe("THEIR BEAT");
    expect(blocked.recovery).toBeGreaterThan(0);
    expect(blocked.recovery).toBeLessThan(1);
    // The beat frees into their recovery: the spent force is the window.
    hot.action[1] = { kind: "pressRecover", t: 0, durationMs: pulse.recoveryMs };
    hot.sinceForce[0] = 0;
    expect(yieldOpportunity(hot, 0)).toBe(true);
    expect(bindSideStatus(hot, 0).label).toBe("YIELD NOW");
    expect(bindPrompt(true, false)).toContain("YIELD NOW");
    // Feeding the opponent's window: the line teaches the pivot.
    expect(bindPrompt(false, true)).toContain("SPACE your taps");
    expect(bindPrompt(true, true)).toContain("YIELD NOW"); // own window outranks
    // The instruction line NEVER swaps to a status readout: whatever the
    // player's action, it still teaches the keys.
    expect(bindPrompt(false, false)).toContain("J presses");
    startYield(hot, 0);
    expect(bindSideStatus(hot, 0).label).toBe("YIELDING");
  });

  test("the bar maps to the world: pressure pushes the marker the way the presser faces", async () => {
    const { bindMarkerOffset } = await import("../src/render/draw");
    // Standard arrangement: the enemy stands right, faces left (-1).
    // Enemy progress (control toward +1) renders toward the PLAYER's side
    // (negative = left): their pressure pushes the marker into you.
    expect(bindMarkerOffset(0.6, -1)).toBeLessThan(0);
    // Player progress renders toward the enemy's side.
    expect(bindMarkerOffset(-0.6, -1)).toBeGreaterThan(0);
    // If the fighters ever stood swapped, the mapping follows the world.
    expect(bindMarkerOffset(0.6, 1)).toBeGreaterThan(0);
    expect(bindMarkerOffset(-0.6, 1)).toBeLessThan(0);
  });

  test("the strain offset stays renderer-only: pure, opposite in phase", async () => {
    const { bindStrainOffset } = await import("../src/render/draw");
    for (const t of [0, 133, 987.5, 5000]) {
      expect(bindStrainOffset(t, 1)).toBeCloseTo(-bindStrainOffset(t, 0), 12);
      expect(bindStrainOffset(t, 0)).toBe(bindStrainOffset(t, 0)); // pure
    }
  });
});

describe("AI in the bind", () => {
  test("same seed, same fight: the duelist's bind play replays exactly", async () => {
    const { aiDecide, createAiState } = await import("../src/combat/ai");
    const play = (): string => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      const ai = createAiState(21);
      const lines: string[] = [];
      for (let tick = 0; tick < 1200; tick++) {
        const ia: Intent | null = tick === 40 ? "parry" : null;
        const evs = tickDuel(d, ia, aiDecide(d, 3, ai, TICK));
        lines.push(JSON.stringify(evs.map((e) => ({ k: e.kind, s: e.side, t: e.time }))));
        if (d.over) break;
      }
      return lines.join("\n");
    };
    expect(play()).toBe(play());
  });

  test("the AI reads a delayed buffer: no bind decision inside its reaction floor", async () => {
    const { AI_REACTION_BASE_MS, AI_REACTION_JITTER_MS, aiDecide, createAiState } = await import("../src/combat/ai");
    const floor = AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[0];
    for (let seed = 1; seed <= 8; seed++) {
      const d = enterBind();
      const ai = createAiState(seed);
      let t = 0;
      let firstIntentAt: number | null = null;
      while (t < 1000 && d.bind !== null) {
        const ib = aiDecide(d, 3, ai, TICK);
        if (ib !== null && firstIntentAt === null) firstIntentAt = d.bind.t;
        tickDuel(d, null, ib);
        t += TICK;
      }
      // Whatever the intent, it waited for an observation at least the
      // reaction floor old - never the current tick.
      if (firstIntentAt !== null) expect(firstIntentAt).toBeGreaterThanOrEqual(floor);
    }
  });

  test("across seeds the duelist presses, holds, and yields into real pressure", async () => {
    const { aiDecide, createAiState } = await import("../src/combat/ai");
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
      const d = enterBind();
      if (d.bind === null) throw new Error("unreachable");
      // Start the contest already near the AI's danger zone so the
      // pressing player creates real yield windows inside the run.
      d.bind.control = -0.55;
      const ai = createAiState(seed);
      let heldWhileReady = false;
      let lastPress = Number.NEGATIVE_INFINITY;
      for (let tick = 0; tick < 500 && d.bind !== null; tick++) {
        // The player leans on the bind with SPACED pulses - the rhythm a
        // yield can actually be timed against - driving control into the
        // AI's danger zone without instantly finishing it.
        let ia: Intent | null = null;
        if (d.bind.action[0].kind === "ready" && d.bind.t - lastPress >= 1100) {
          ia = "press";
          lastPress = d.bind.t;
        }
        const ib = aiDecide(d, 3, ai, TICK);
        if (ib === "press") seen.add("press");
        if (ib === "yield") seen.add("yield");
        if (ib === null && d.bind !== null && d.bind.action[1].kind === "ready" && d.bind.t > 300) heldWhileReady = true;
        tickDuel(d, ia, ib);
        if (d.over) break;
      }
      if (heldWhileReady) seen.add("hold");
    }
    expect(seen).toEqual(new Set(["press", "hold", "yield"]));
  });
});
