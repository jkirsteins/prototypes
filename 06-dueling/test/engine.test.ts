import { describe, expect, test } from "vitest";
import { applyIntent, TICK } from "../src/combat/fighter";
import { ARENA, MIN_GAP, createDuel, gapOf, parryMeetsAttack, tickDuel } from "../src/combat/engine";
import { WEAPONS, parryableMs } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { AttackKind, Intent, WeaponId } from "../src/combat/types";

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null) {
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

function closeTo(d: Duel, gap: number) {
  // Teleport for test setup: keep fighter 1 in place, move fighter 0.
  d.f[0].x = d.f[1].x - gap;
}

describe("attack resolution", () => {
  test("hit: strike inside reach against an idle defender kills", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    closeTo(d, 160); // inside longsword reach 200
    const evs = runMs(d, 3000, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.over).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("whiff: void opens the distance, attacker recovery is extended, counter lands", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    // 150: inside rapier reach (240); after the void it is 250 (rapier whiffs);
    // one longsword advance brings it to 190, inside longsword reach (200).
    closeTo(d, 150);
    // Fighter 0 (rapier) thrusts; fighter 1 (longsword) voids immediately.
    let evs = runMs(d, TICK, "thrust", "void");
    const t = WEAPONS.rapier.attacks.thrust;
    // run until just past strikeEnd
    evs = evs.concat(runMs(d, t.windup + t.beat + t.strike + 2 * TICK));
    expect(evs.some((e) => e.kind === "whiff" && e.side === 0)).toBe(true);
    expect(d.over).toBe(false);
    // Nachreisen: longsword advances once and thrusts, starting right after its void ends.
    const evs2 = runMs(d, 60, null, "advance");
    const evs3 = runMs(d, 2000, null, "thrust");
    const all = evs.concat(evs2, evs3);
    expect(all.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(d.winner).toBe(1);
  });

  test("parried: attacker eats the penalty, defender counters (dui tempi)", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 180); // inside both reaches
    // Rapier thrusts; longsword presses early enough that the guard's rise
    // completes as the strike begins (a press at the commit itself would be
    // a guard forming over a wound).
    const t = WEAPONS.rapier.attacks.thrust;
    let evs = runMs(d, TICK, "thrust", null);
    const strikeAt = t.windup + t.beat;
    const press = strikeAt - WEAPONS.longsword.parryRiseMs;
    evs = evs.concat(runMs(d, press - TICK));
    evs = evs.concat(runMs(d, TICK, null, "parry"));
    evs = evs.concat(runMs(d, strikeAt - press + t.strike + 2 * TICK));
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    // dui tempi: defender thrusts immediately after the parry resolves
    const evs2 = runMs(d, 2000, null, "thrust");
    expect(evs2.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
  });

  describe("the parryable interval", () => {
    /** Runs one exchange with the defender's guard raised `offset` ms after the attack starts. */
    const outcome = (atk: WeaponId, def: WeaponId, kind: AttackKind, offset: number) => {
      const d = createDuel(WEAPONS[atk], WEAPONS[def]);
      closeTo(d, 180); // inside both reaches
      // Elapsed time after tick i is (i + 1) * TICK, so this is the tick on
      // which the guard is up at `offset` ms into the attack.
      const pressTick = Math.max(0, Math.round(offset / TICK) - 1);
      for (let i = 0; i < 300; i++) {
        const evs = tickDuel(d, i === 0 ? kind : null, i === pressTick ? "parry" : null);
        for (const e of evs) {
          if (e.kind === "parried" || e.kind === "hit" || e.kind === "whiff") return e.kind;
          // Matched steel: the stop is a bind since sustained-bind, its
          // own logged outcome event at the same contact instant the
          // deflection fired before. The interval rules are unchanged.
          if (e.kind === "bind") return "parried";
        }
      }
      return "none";
    };

    const cases: Array<[WeaponId, WeaponId, AttackKind]> = [
      ["rapier", "longsword", "thrust"],
      ["longsword", "rapier", "cut"],
      ["longsword", "longsword", "thrust"],
      ["rapier", "rapier", "cut"],
    ];

    test("one rule for every weapon: a press one rise before the deadline always works", () => {
      // The learnable grammar. The guard must be FORMED while the blade
      // still travels, so the last viable press is parryableUntil minus the
      // defender's rise - one rule, every weapon pair.
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        const deadline = strikeAt + parryableMs(t) - WEAPONS[def].parryRiseMs;
        expect(outcome(atk, def, kind, deadline - 2 * TICK)).toBe("parried");
      }
    });

    test("the guard may go up early, or exactly one rise before the commit", () => {
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        const early = strikeAt - WEAPONS[def].parryRiseMs - 100; // early press: latched, no expiry
        const formedAtCommit = strikeAt - WEAPONS[def].parryRiseMs;
        expect(outcome(atk, def, kind, Math.max(0, early))).toBe("parried");
        expect(outcome(atk, def, kind, Math.max(0, formedAtCommit))).toBe("parried");
      }
    });

    test("once the blade is delivered it cannot be met", () => {
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        expect(outcome(atk, def, kind, strikeAt + parryableMs(t) + 40)).toBe("hit");
      }
    });

    test("a guard latched to a visible slow cut waits it out and meets it", () => {
      // Longsword cut: 520ms of preparation against a rapier guard whose
      // window (390ms) would once have lapsed first. The press latches
      // onto the visible attack and waits - the timed window prices only
      // predictive cold presses.
      expect(outcome("longsword", "rapier", "cut", 0)).toBe("parried");
    });
  });

  describe("parryMeetsAttack: each condition falsified independently", () => {
    // The single site deciding blade contact. These are the contract any
    // future line-coverage logic must keep passing: with two conditions
    // held true, the third alone decides.
    const setup = (elapsedOffset: number, gap: number, defenderParries: boolean) => {
      const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
      closeTo(d, gap);
      applyIntent(d.f[0], "thrust");
      const s = d.f[0].state;
      if (s.kind !== "attack") throw new Error("unreachable");
      s.phase = "strike";
      s.elapsedMs = s.timeline.strikeStart + elapsedOffset;
      if (defenderParries) {
        applyIntent(d.f[1], "parry");
        // A formed guard: the rise condition has its own falsification
        // tests in parry-rise.test.ts; here it is held true.
        const p = d.f[1].parry;
        if (p !== null) {
          p.phase = "held";
          p.phaseDurationMs = 0;
          p.settledMs = 200;
        }
      }
      return d;
    };
    const t = WEAPONS.rapier.attacks.thrust;

    test("all three hold: the blade is met", () => {
      const d = setup(parryableMs(t) - 1, 180, true);
      expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(true);
    });
    test("timing alone fails: the blade is already delivered", () => {
      // Past the grace tick that covers boundary quantization.
      const d = setup(parryableMs(t) + TICK + 1, 180, true);
      expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
    });
    test("reach alone fails: nothing to meet out of measure", () => {
      const d = setup(parryableMs(t) - 1, WEAPONS.rapier.reach + 10, true);
      expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
    });
    test("contact alone fails: no parry raised", () => {
      const d = setup(parryableMs(t) - 1, 180, false);
      expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
    });
    test("phase alone fails: a windup is not meetable even in measure", () => {
      const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
      closeTo(d, 180);
      applyIntent(d.f[0], "thrust");
      applyIntent(d.f[1], "parry");
      expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
    });
  });

  test("rule D: a parry raised before a step still meets the blade mid-step", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 180);
    const t = WEAPONS.rapier.attacks.thrust;
    const strikeAt = t.windup + t.beat;
    // Guard raised at once (its rise needs the lead), then a step timed so
    // the feet are mid-travel when the blade arrives at the guard - the
    // arrival is parryableUntil, and the step must straddle it.
    const raiseTick = 1;
    const arriveAt = strikeAt + parryableMs(t);
    const stepTick = Math.round((arriveAt - WEAPONS.longsword.stepDuration / 2) / TICK);
    const evs: DuelEvent[] = [];
    let steppingAtMet = false;
    for (let i = 0; i < 300 && !evs.some((e) => e.kind === "parried"); i++) {
      const ib: Intent | null = i === raiseTick ? "parry" : i === stepTick ? "retreat" : null;
      const tick = tickDuel(d, i === 0 ? "thrust" : null, ib);
      if (tick.some((e) => e.kind === "met")) steppingAtMet = d.f[1].state.kind === "step";
      evs.push(...tick);
    }
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    expect(steppingAtMet).toBe(true); // the guard rode the step to the contact
  });

  test("a feinted attack is never meetable and never resolves", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    closeTo(d, 160);
    let evs = runMs(d, TICK, "cut", null);
    evs = evs.concat(runMs(d, 5 * TICK)); // a few windup ticks
    evs = evs.concat(runMs(d, TICK, "feint", "parry")); // cancel as the dummy guards
    const feint = evs.find((e) => e.kind === "feint");
    expect(feint).toBeDefined();
    expect(d.log.some((e) => e.kind === "feint")).toBe(true); // a real action, logged
    // Run past where the strike would have resolved: no swing, no outcome.
    evs = evs.concat(runMs(d, 1500));
    for (const kind of ["swing", "hit", "parried", "whiff", "met"] as const) {
      expect(evs.filter((e) => e.kind === kind && e.side === 0)).toEqual([]);
    }
    expect(d.over).toBe(false);
  });

  test("mutual strikeEnd on the same tick is a draw - when the blades pass on different sides", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    closeTo(d, 160);
    // A cut (outside) against a thrust (inside): the blades never touch,
    // and both strikes resolving on one tick is the earned double. Two
    // same-line thrusts can no longer double this way - they cross and
    // clang instead, which is blade-contact working as specified. The cut
    // resolves at 900; inject the thrust 320ms later so both end together.
    applyIntent(d.f[0], "cut");
    for (let i = 0; i * TICK < 320; i++) tickDuel(d, null, null);
    applyIntent(d.f[1], "thrust");
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, null, null);
    expect(d.log.some((e) => e.kind === "met")).toBe(false);
    expect(d.over).toBe(true);
    expect(d.winner).toBe("draw");
  });
});

describe("presentation events follow the simulation, not the input", () => {
  test("met fires when the blade arrives at the guard, not when the parry is pressed", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 180);
    const t = WEAPONS.rapier.attacks.thrust;
    const strikeAt = t.windup + t.beat;
    // The blade arrives when its extension covers the gap: 180 of the
    // rapier's 240 reach is 3/4 of the travelling half.
    const arriveAt = strikeAt + (180 / WEAPONS.rapier.reach) * parryableMs(t);
    // Guard goes up immediately - the rise (220ms) completes just before the
    // strike begins (260ms) - and contact must still wait for the blade to
    // get there, another 3/4 of the travelling half after that.
    const pressTick = 1;
    const pressTime = (pressTick + 1) * TICK;
    const evs: DuelEvent[] = [];
    for (let i = 0; i < 300 && !evs.some((e) => e.kind === "parried"); i++) {
      evs.push(...tickDuel(d, i === 0 ? "thrust" : null, i === pressTick ? "parry" : null));
    }
    const met = evs.find((e) => e.kind === "met");
    const parried = evs.find((e) => e.kind === "parried");
    expect(met).toBeDefined();
    expect(parried).toBeDefined();
    if (!met || !parried) throw new Error("unreachable");
    expect(met.time).toBeGreaterThan(pressTime + TICK); // not the press tick
    expect(met.time).toBeGreaterThanOrEqual(arriveAt);
    expect(met.time).toBeLessThan(arriveAt + 2 * TICK);
    expect(met.time).toBeLessThan(parried.time); // before resolution
    expect(d.log.some((e) => e.kind === "met")).toBe(false);
  });

  test("bind fires at the contact tick - the blade's arrival at the guard, not the press", () => {
    // The matched-steel twin of the met test above: same contact instant,
    // a different outcome event. One sound - the bind REPLACES the met,
    // never layers on it - and it is logged, unlike the met.
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    closeTo(d, 180);
    const t = WEAPONS.longsword.attacks.thrust;
    const strikeAt = t.windup + t.beat; // player side: no telegraph
    const arriveAt = strikeAt + (180 / WEAPONS.longsword.reach) * parryableMs(t);
    const pressTick = 1; // rise (220ms) completes before the strike (320ms)
    const pressTime = (pressTick + 1) * TICK;
    const evs: DuelEvent[] = [];
    for (let i = 0; i < 300 && !evs.some((e) => e.kind === "bind"); i++) {
      evs.push(...tickDuel(d, i === 0 ? "thrust" : null, i === pressTick ? "parry" : null));
    }
    const bind = evs.find((e) => e.kind === "bind");
    expect(bind).toBeDefined();
    if (!bind) throw new Error("unreachable");
    expect(evs.some((e) => e.kind === "met")).toBe(false);
    expect(bind.time).toBeGreaterThan(pressTime + TICK); // not the press tick
    expect(bind.time).toBeGreaterThanOrEqual(arriveAt);
    expect(bind.time).toBeLessThan(arriveAt + 2 * TICK);
    expect(d.log.filter((e) => e.kind === "bind").length).toBe(1); // logged outcome
  });

  test("swing fires when the blade starts travelling; a miss still whooshes then whiffs", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    // Out of measure: the swing must sound anyway, the whiff resolves later.
    const t = WEAPONS.longsword.attacks.cut;
    const strikeAt = t.windup + t.beat;
    const evs: DuelEvent[] = [];
    for (let i = 0; i < 300 && !evs.some((e) => e.kind === "whiff"); i++) {
      evs.push(...tickDuel(d, i === 0 ? "cut" : null, null));
    }
    const swing = evs.find((e) => e.kind === "swing");
    const whiff = evs.find((e) => e.kind === "whiff");
    expect(swing).toBeDefined();
    expect(whiff).toBeDefined();
    if (!swing || !whiff) throw new Error("unreachable");
    expect(swing.time).toBeGreaterThanOrEqual(strikeAt);
    expect(swing.time).toBeLessThan(strikeAt + 2 * TICK);
    expect(swing.time).toBeLessThan(whiff.time);
    expect(d.log.some((e) => e.kind === "swing")).toBe(false);
  });

  test("windup fires the tick the blade starts rising, carries its duration, unlogged", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    // Player attacks carry no tell: the rise begins at acceptance.
    const evs = tickDuel(d, "cut", null);
    const w = evs.find((e) => e.kind === "windup");
    expect(w).toBeDefined();
    if (!w) throw new Error("unreachable");
    expect(w.side).toBe(0);
    expect(w.ms).toBe(WEAPONS.longsword.attacks.cut.windup);
    expect(d.log.some((e) => e.kind === "windup")).toBe(false);
  });

  test("a telegraphed attack rises only after the telegraphMs", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const evs: DuelEvent[] = [];
    const pre = WEAPONS.rapier.telegraphMs;
    for (let i = 0; i < 60 && !evs.some((e) => e.kind === "windup"); i++) {
      evs.push(...tickDuel(d, null, i === 0 ? "thrust" : null));
    }
    const w = evs.find((e) => e.kind === "windup");
    expect(w).toBeDefined();
    if (!w) throw new Error("unreachable");
    expect(w.time).toBeGreaterThanOrEqual(pre);
    expect(w.time).toBeLessThan(pre + 2 * TICK);
    expect(w.ms).toBe(WEAPONS.rapier.attacks.thrust.windup);
  });

  test("a buffered attack rises when the buffer fires, not when it was pressed", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const w = WEAPONS.longsword;
    const flushAt = w.stepDuration + w.stepRecoveryMs;
    tickDuel(d, "advance", null);
    const evs: DuelEvent[] = tickDuel(d, "cut", null); // buffered mid-step
    expect(evs.some((e) => e.kind === "windup")).toBe(false);
    for (let t = 2 * TICK; t < flushAt + 3 * TICK; t += TICK) {
      evs.push(...tickDuel(d, null, null));
    }
    const rise = evs.find((e) => e.kind === "windup");
    expect(rise).toBeDefined();
    if (!rise) throw new Error("unreachable");
    expect(rise.time).toBeGreaterThanOrEqual(flushAt);
  });

  test("a step event fires when the foot lands, never at acceptance, and is unlogged", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const w = WEAPONS.longsword;
    expect(tickDuel(d, "advance", null).some((e) => e.kind === "step")).toBe(false);
    let steps = 0;
    for (let t = TICK; t < w.stepDuration + 2 * TICK; t += TICK) {
      steps += tickDuel(d, null, null).filter((e) => e.kind === "step" && e.side === 0).length;
    }
    expect(steps).toBe(1);
    expect(d.log.some((e) => e.kind === "step")).toBe(false);
  });

  test("a held advance chains steps through the buffer, one landing per step", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const w = WEAPONS.longsword;
    // Two full step+pause cycles: the second step starts inside flushBuffer,
    // bypassing the engine's acceptance chain, and must still land audibly.
    const ms = 2 * (w.stepDuration + w.stepRecoveryMs) + 100;
    let steps = 0;
    for (let t = 0; t < ms; t += TICK) {
      steps += tickDuel(d, "advance", null).filter((e) => e.kind === "step" && e.side === 0).length;
    }
    expect(steps).toBeGreaterThanOrEqual(2);
  });

  test("a void hop lands a step event when it finishes", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const w = WEAPONS.longsword;
    expect(tickDuel(d, "void", null).some((e) => e.kind === "step")).toBe(false);
    let landings = 0;
    for (let t = TICK; t < w.voidDuration + 2 * TICK; t += TICK) {
      landings += tickDuel(d, null, null).filter((e) => e.kind === "step" && e.side === 0).length;
    }
    expect(landings).toBe(1);
  });
});

describe("positions", () => {
  test("fighters never overlap closer than MIN_GAP", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, "advance", "advance");
    expect(gapOf(d)).toBeGreaterThanOrEqual(MIN_GAP - 0.001);
  });

  test("MIN_GAP holds every tick even when a fighter is pinned at the arena wall", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    // Fighter 0 starts against the left wall; sustained retreat+advance
    // pressure keeps pushing it into the wall while fighter 1 closes in.
    d.f[0].x = 130;
    d.f[1].x = 190;
    for (let i = 0; i < 300; i++) {
      tickDuel(d, "retreat", "advance");
      expect(gapOf(d)).toBeGreaterThanOrEqual(MIN_GAP - 0.001);
      expect(d.f[0].x).toBeGreaterThanOrEqual(ARENA.left);
      expect(d.f[0].x).toBeLessThanOrEqual(ARENA.right);
      expect(d.f[1].x).toBeGreaterThanOrEqual(ARENA.left);
      expect(d.f[1].x).toBeLessThanOrEqual(ARENA.right);
    }
  });
});
