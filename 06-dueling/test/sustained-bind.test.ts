import { describe, expect, test } from "vitest";
import { TICK } from "../src/combat/fighter";
import { canBind } from "../src/combat/contact";
import { BIND_MS, BIND_RECOVERY_MS, createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent, WeaponId } from "../src/combat/types";

/**
 * TODO-6-sustained-bind.md: contact between two bind-capable weapons stops
 * resolving instantly and becomes a 500ms held beat - a shared BindState on
 * the duel with one clock, a contact snapshot, and a neutral symmetric
 * exit. Every pairing involving a rapier keeps the deflection path bit for
 * bit.
 */

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

/** LS defender (side 0) holds a guard; the AI-side LS cut arrives into it. */
function parryBindDuel(): { d: Duel; evs: DuelEvent[] } {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1180;
  let evs = runMs(d, TICK, "parry", null); // cold press, held: covers low inside
  evs = evs.concat(runMs(d, 600)); // guard formed and settled
  evs = evs.concat(runMs(d, 1600, null, "thrust")); // low inside, into the guard
  return { d, evs };
}

describe("capability: bindability is emergent from blade properties, never a flag", () => {
  test("stiffness is the declared physical property, and the longsword is the stiffer", () => {
    expect(WEAPONS.longsword.bladeStiffness).toBeGreaterThan(WEAPONS.rapier.bladeStiffness);
    expect(WEAPONS.rapier.bladeStiffness).toBeGreaterThan(0);
  });

  test("matched steel sustains, mismatched steel cannot - derived, symmetric", () => {
    // The rule, not a table: a contact sustains when neither blade can
    // simply overpower the other's lateral hold, i.e. the stiffnesses are
    // within a band of each other. Two longswords lock; two rapiers lock
    // (evenly matched, if whippier steel); a rapier against a longsword is
    // blown off line and the contact deflects. Future swords slot in by
    // their stiffness alone.
    expect(canBind(WEAPONS.longsword, WEAPONS.longsword)).toBe(true);
    expect(canBind(WEAPONS.rapier, WEAPONS.rapier)).toBe(true);
    expect(canBind(WEAPONS.longsword, WEAPONS.rapier)).toBe(false);
    expect(canBind(WEAPONS.rapier, WEAPONS.longsword)).toBe(false);
  });

  test("longsword parried by longsword binds, and the bind is a logged outcome event", () => {
    const { d, evs } = parryBindDuel();
    expect(evs.filter((e) => e.kind === "bind").length).toBe(1);
    expect(evs.some((e) => e.kind === "met")).toBe(false); // replaced, not layered
    expect(evs.some((e) => e.kind === "parried")).toBe(false); // the attack never resolves
    expect(d.log.filter((e) => e.kind === "bind").length).toBe(1); // in the activity log
  });

  test("rapier against rapier also binds: matched steel, weaker but even", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, "parry", null);
    evs = evs.concat(runMs(d, 600));
    let bound = false;
    for (let t = 0; t < 1800 && !bound; t += TICK) {
      evs = evs.concat(tickDuel(d, null, t === 0 ? "thrust" : null));
      if (d.bind !== null) bound = true;
    }
    expect(bound).toBe(true);
    expect(evs.some((e) => e.kind === "bind")).toBe(true);
    expect(evs.some((e) => e.kind === "parried")).toBe(false);
  });

  test("mixed pairings keep the deflection path: met, parried event, penalty, no bind", () => {
    const pairs: Array<[WeaponId, WeaponId]> = [
      ["longsword", "rapier"],
      ["rapier", "longsword"],
    ];
    for (const [pw, ew] of pairs) {
      const d = createDuel(WEAPONS[pw], WEAPONS[ew]);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      let evs = runMs(d, TICK, "parry", null);
      evs = evs.concat(runMs(d, 600));
      evs = evs.concat(runMs(d, 1800, null, "thrust"));
      expect(d.bind).toBe(null);
      expect(evs.some((e) => e.kind === "bind")).toBe(false);
      expect(evs.some((e) => e.kind === "met" && e.side === 1)).toBe(true);
      expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
      const s = d.f[1].state;
      if (s.kind === "attack") {
        const t = d.f[1].weapon.attacks.thrust;
        expect(s.timeline.recoveryEnd).toBe(s.timeline.recoveryStart + t.recovery + d.f[1].weapon.parriedPenalty);
      }
    }
  });
});

describe("entry", () => {
  test("both fighters enter the bind marker on the bind tick, exactly one bind event", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, "parry", null);
    evs = evs.concat(runMs(d, 600));
    let metTickSeen = false;
    for (let t = 0; t < 1600 && !metTickSeen; t += TICK) {
      const out = tickDuel(d, null, t === 0 ? "thrust" : null);
      evs = evs.concat(out);
      if (out.some((e) => e.kind === "bind")) {
        metTickSeen = true;
        expect(d.f[0].state.kind).toBe("bind");
        expect(d.f[1].state.kind).toBe("bind");
        expect(d.bind).not.toBe(null);
        expect(d.bind?.t).toBe(0);
      }
    }
    expect(metTickSeen).toBe(true);
    expect(evs.filter((e) => e.kind === "bind").length).toBe(1);
    expect(evs.some((e) => e.kind === "met")).toBe(false); // replaced, not layered
  });

  test("the snapshot records the strike's progress and the guard's settled clock", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180; // gap 180 of the LS 200 reach
    runMs(d, TICK, "parry", null);
    runMs(d, 600); // guard held; settledMs now ~380 (600 - rise 220)
    let entered = false;
    for (let t = 0; t < 1600 && !entered; t += TICK) {
      tickDuel(d, null, t === 0 ? "thrust" : null);
      if (d.bind !== null) entered = true;
    }
    const bind = d.bind;
    if (bind === null) throw new Error("no bind");
    // Side 1 was the striker: contact latches when extension covers the
    // gap, so progress is at least gap/reach and within a tick of it.
    const c1 = bind.contact[1];
    if (c1.kind !== "strike") throw new Error("side 1 should be the strike");
    expect(c1.progress).toBeGreaterThanOrEqual(180 / 200);
    expect(c1.progress).toBeLessThan(180 / 200 + 0.2);
    // Side 0 was the guard: its covered line had stood since the rise
    // completed, ~380ms before the attack even began, plus the attack's
    // whole approach to contact.
    const c0 = bind.contact[0];
    if (c0.kind !== "guard") throw new Error("side 0 should be the guard");
    expect(c0.settledMs).toBeGreaterThan(300);
    // The line is the contact line, side axis included.
    expect(bind.line).toEqual({ height: "low", side: "inside" });
  });

  test("two crossing longsword thrusts bind with two strike contacts", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    // Simultaneous: the player travels 320..450 and stands delivered to
    // 580; the telegraphed AI travel begins at 500, into standing steel.
    let evs: DuelEvent[] = [];
    let ia: Intent | null = "thrust";
    let ib: Intent | null = "thrust";
    for (let t = 0; t < 1400 && d.bind === null; t += TICK) {
      evs = evs.concat(tickDuel(d, ia, ib));
      ia = null;
      ib = null;
    }
    const bind = d.bind;
    if (bind === null) throw new Error("no bind from the crossing");
    expect(bind.contact[0].kind).toBe("strike");
    expect(bind.contact[1].kind).toBe("strike");
    // The standing blade is fully through its travel; the arriving one has
    // barely begun - the snapshot keeps that asymmetry for firmness later.
    const [c0, c1] = bind.contact;
    if (c0.kind !== "strike" || c1.kind !== "strike") throw new Error("unreachable");
    expect(c0.progress).toBe(1);
    expect(c1.progress).toBeLessThan(0.2);
    evs = evs.concat(runMs(d, 1000));
    expect(evs.filter((e) => e.kind === "bind").length).toBe(1); // a crossing is ONE bind
    expect(evs.some((e) => e.kind === "met")).toBe(false);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
    expect(evs.some((e) => e.kind === "parried")).toBe(false);
  });
});

describe("during: one clock, frozen bodies", () => {
  function enterBind(): { d: Duel; entryTime: number } {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    runMs(d, TICK, "parry", null);
    runMs(d, 600);
    for (let t = 0; t < 1600; t += TICK) {
      tickDuel(d, null, t === 0 ? "thrust" : null);
      if (d.bind !== null) return { d, entryTime: d.time };
    }
    throw new Error("no bind formed");
  }

  test("x is frozen and no intent is accepted while bound", () => {
    const { d } = enterBind();
    const xs = [d.f[0].x, d.f[1].x];
    const evs = runMs(d, 200, "advance", "cut");
    expect([d.f[0].x, d.f[1].x]).toEqual(xs);
    expect(d.f[0].state.kind).toBe("bind");
    expect(d.f[1].state.kind).toBe("bind");
    expect(d.f[0].buffered).toBe(null); // not even buffered
    expect(evs).toEqual([]); // nothing sounds, logs or resolves inside
  });

  test("nothing resolves out of a bind: no strikeEnd events, no whiff, parried or hit", () => {
    const { d } = enterBind();
    const evs = runMs(d, BIND_MS - 2 * TICK);
    expect(evs.some((e) => e.kind === "whiff" || e.kind === "parried" || e.kind === "hit")).toBe(false);
  });

  test("the guard is consumed at entry although the key never came up", () => {
    const { d } = enterBind();
    expect(d.f[0].parry).toBe(null);
    // Not charged yet: the recovery is charged at exit, where it is felt.
    expect(d.f[0].parryRecoveryMs).toBe(0);
    runMs(d, BIND_MS);
    expect(d.f[0].parry).toBe(null); // no re-formed guard without a fresh press
  });

  test("both exit to ready on the tick the shared clock crosses BIND_MS, recoveries seeded", () => {
    const { d } = enterBind();
    let ticks = 0;
    while (d.bind !== null && ticks < 60) {
      runMs(d, TICK);
      ticks++;
    }
    expect(d.bind).toBe(null);
    expect(ticks).toBe(Math.ceil(BIND_MS / TICK));
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.f[1].state.kind).toBe("ready");
    // Both seed the shared bind recovery; the defender also pays the spent
    // guard, in full, on this tick - not decayed by the bind.
    expect(d.f[0].stepRecoveryMs).toBe(BIND_RECOVERY_MS);
    expect(d.f[1].stepRecoveryMs).toBe(BIND_RECOVERY_MS);
    expect(d.f[0].parryRecoveryMs).toBe(WEAPONS.longsword.parryRecoveryMs);
    expect(d.f[1].parryRecoveryMs).toBe(0); // the striker spent no guard
  });

  test("a bound attack never resolves: exit leaves the attacker clean of its discarded timeline", () => {
    const { d } = enterBind();
    const evs = runMs(d, BIND_MS + 20 * TICK);
    expect(evs.some((e) => e.kind === "parried" || e.kind === "whiff" || e.kind === "hit")).toBe(false);
    expect(d.f[1].state.kind).toBe("ready");
  });
});

describe("presentation stays out of the simulation", () => {
  test("the strain oscillation is renderer-only: pure in d.time, opposite in phase", async () => {
    // The simulation knows nothing of the offset - it lives in draw and
    // reads the duel clock, so the golden replay projection (which never
    // touches the renderer) is its determinism gate. This pins the shape:
    // equal magnitude, opposite sign, pure in time.
    const { bindStrainOffset } = await import("../src/render/draw");
    for (const t of [0, 133, 987.5, 5000]) {
      expect(bindStrainOffset(t, 1)).toBe(-bindStrainOffset(t, 0));
      expect(bindStrainOffset(t, 0)).toBe(bindStrainOffset(t, 0)); // pure
    }
  });
});
