import { describe, expect, test } from "vitest";
import { TICK } from "../src/combat/fighter";
import { canBind } from "../src/combat/contact";
import { createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent, WeaponId } from "../src/combat/types";

/**
 * DONE-6-sustained-bind.md, force-into-force revision: contact persists
 * only where two ATTACKS cross in matched steel - two bodies driving
 * force into the contact, which is what the bind's pressure contest is
 * made of. A parried blade ALWAYS deflects, matched steel or not: a
 * guard receives and sheds force, adding none of its own, so the two
 * defensive modes stay distinct - parry to deflect, counter-attack into
 * the blade to seize it. The bind's decision (control, pressure, yield,
 * resolution) belongs to pressure-and-winding and its test file.
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

/** Mirror crossing: the player's delivered thrust stands in the line and
 *  the AI-side telegraphed thrust arrives into it. */
function crossingDuel(w: WeaponId = "longsword"): { d: Duel; evs: DuelEvent[] } {
  const d = createDuel(WEAPONS[w], WEAPONS[w]);
  d.f[0].x = 1000;
  d.f[1].x = 1180;
  let evs: DuelEvent[] = [];
  let ia: Intent | null = "thrust";
  let ib: Intent | null = "thrust";
  for (let t = 0; t < 1600 && d.bind === null; t += TICK) {
    evs = evs.concat(tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return { d, evs };
}

/** LS mirror parry: side 0's held guard meets side 1's thrust. */
function parryDuel(): { d: Duel; evs: DuelEvent[] } {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1180;
  let evs = runMs(d, TICK, "parry", null); // cold press, held: covers low inside
  evs = evs.concat(runMs(d, 600)); // guard formed and settled
  evs = evs.concat(runMs(d, 1600, null, "thrust"));
  return { d, evs };
}

describe("capability: only force into force binds, and only in matched steel", () => {
  test("stiffness is the declared physical property, and the longsword is the stiffer", () => {
    expect(WEAPONS.longsword.bladeStiffness).toBeGreaterThan(WEAPONS.rapier.bladeStiffness);
    expect(WEAPONS.rapier.bladeStiffness).toBeGreaterThan(0);
  });

  test("canBind stays the pairwise stiffness derivation", () => {
    expect(canBind(WEAPONS.longsword, WEAPONS.longsword)).toBe(true);
    expect(canBind(WEAPONS.rapier, WEAPONS.rapier)).toBe(true);
    expect(canBind(WEAPONS.longsword, WEAPONS.rapier)).toBe(false);
    expect(canBind(WEAPONS.rapier, WEAPONS.longsword)).toBe(false);
  });

  test("a parried blade always deflects - matched steel included: met, parried, penalty, no bind", () => {
    const { d, evs } = parryDuel();
    expect(d.bind).toBe(null);
    expect(evs.some((e) => e.kind === "bind")).toBe(false);
    expect(evs.some((e) => e.kind === "met" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    const s = d.f[1].state;
    if (s.kind === "attack") {
      const t = d.f[1].weapon.attacks.thrust;
      expect(s.timeline.recoveryEnd).toBe(s.timeline.recoveryStart + t.recovery + d.f[1].weapon.parriedPenalty);
    }
  });

  test("a matched crossing locks: the bind is a logged outcome event, replacing the met", () => {
    const { d, evs } = crossingDuel();
    expect(d.bind).not.toBe(null);
    expect(evs.filter((e) => e.kind === "bind").length).toBe(1); // a crossing is ONE bind
    expect(evs.some((e) => e.kind === "met")).toBe(false); // replaced, not layered
    expect(evs.some((e) => e.kind === "hit" || e.kind === "parried")).toBe(false);
    expect(d.log.filter((e) => e.kind === "bind").length).toBe(1); // in the activity log
  });

  test("the rapier mirror crossing also binds: matched steel, weaker but even", () => {
    const { d, evs } = crossingDuel("rapier");
    expect(d.bind).not.toBe(null);
    expect(evs.some((e) => e.kind === "bind")).toBe(true);
    expect(evs.some((e) => e.kind === "parried")).toBe(false);
  });

  test("a mixed crossing keeps the deflection: met once, no bind", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs: DuelEvent[] = [];
    let ia: Intent | null = "thrust";
    let ib: Intent | null = "thrust";
    for (let t = 0; t < 1600; t += TICK) {
      evs = evs.concat(tickDuel(d, ia, ib));
      ia = null;
      ib = null;
    }
    expect(d.bind).toBe(null);
    expect(evs.some((e) => e.kind === "bind")).toBe(false);
    expect(evs.filter((e) => e.kind === "met").length).toBe(1);
  });
});

describe("entry", () => {
  test("both fighters enter the bind marker on the crossing tick, exactly one bind event", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs: DuelEvent[] = [];
    let ia: Intent | null = "thrust";
    let ib: Intent | null = "thrust";
    let entered = false;
    for (let t = 0; t < 1600 && !entered; t += TICK) {
      const out = tickDuel(d, ia, ib);
      ia = null;
      ib = null;
      evs = evs.concat(out);
      if (out.some((e) => e.kind === "bind")) {
        entered = true;
        expect(d.f[0].state.kind).toBe("bind");
        expect(d.f[1].state.kind).toBe("bind");
        expect(d.bind).not.toBe(null);
        expect(d.bind?.t).toBe(0);
      }
    }
    expect(entered).toBe(true);
    expect(evs.filter((e) => e.kind === "bind").length).toBe(1);
    expect(evs.some((e) => e.kind === "met")).toBe(false);
  });

  test("the snapshot keeps the crossing's asymmetry: the standing blade firm, the arriving one soft", () => {
    const { d } = crossingDuel();
    const bind = d.bind;
    if (bind === null) throw new Error("no bind");
    expect(bind.contact[0].kind).toBe("strike");
    expect(bind.contact[1].kind).toBe("strike");
    const [c0, c1] = bind.contact;
    if (c0.kind !== "strike" || c1.kind !== "strike") throw new Error("unreachable");
    // The player's blade is fully through its travel and standing; the
    // telegraphed one has barely begun - firmness later reads exactly this.
    expect(c0.progress).toBe(1);
    expect(c1.progress).toBeLessThan(0.2);
    // The line is the shared contact line, side axis included.
    expect(bind.line).toEqual({ height: "low", side: "inside" });
  });
});

describe("during: one clock, frozen bodies", () => {
  test("x is frozen and no body intent is accepted while bound", () => {
    const { d } = crossingDuel();
    const xs = [d.f[0].x, d.f[1].x];
    // Movement and defence intents: seized with the body. (The attack
    // keys start bind actions - pressure-and-winding's tests own those.)
    const evs = runMs(d, 200, "advance", "parry");
    expect([d.f[0].x, d.f[1].x]).toEqual(xs);
    expect(d.f[0].state.kind).toBe("bind");
    expect(d.f[1].state.kind).toBe("bind");
    expect(d.f[0].buffered).toBe(null); // not even buffered
    expect(evs).toEqual([]); // nothing sounds, logs or resolves inside
  });

  test("nothing resolves out of a bind: no strikeEnd events, no whiff, parried or hit", () => {
    const { d } = crossingDuel();
    const evs = runMs(d, 400);
    expect(evs.some((e) => e.kind === "whiff" || e.kind === "parried" || e.kind === "hit")).toBe(false);
  });

  test("an untouched bind still resolves decisively, toward the standing blade's lead", () => {
    // No neutral exit exists: with both fighters passive, the calm drift
    // resolves the contest toward the entry initiative - here the
    // standing (firm) blade, side 0. No guards were involved, so no
    // parry recovery is charged on anyone.
    const { d } = crossingDuel();
    const evs: DuelEvent[] = [];
    let guard = 0;
    while (d.bind !== null && guard++ < 400) evs.push(...runMs(d, TICK));
    expect(d.bind).toBe(null);
    expect(evs.filter((e) => e.kind === "bindBreak").length).toBe(1);
    expect(evs.some((e) => e.kind === "bindBreak" && e.side === 0)).toBe(true);
    expect(d.f[0].state.kind).toBe("ready"); // the winner
    expect(d.f[0].bindAdvantageMs).toBeGreaterThan(0);
    expect(d.f[1].state.kind).toBe("exposed"); // the loser
    expect(d.f[0].parryRecoveryMs).toBe(0);
    expect(d.f[1].parryRecoveryMs).toBe(0);
  });

  test("a bound attack never resolves: the discarded timelines never fire", () => {
    const { d } = crossingDuel();
    const evs: DuelEvent[] = [];
    let guard = 0;
    while (d.bind !== null && guard++ < 400) evs.push(...runMs(d, TICK));
    evs.push(...runMs(d, 20 * TICK));
    expect(evs.some((e) => e.kind === "parried" || e.kind === "whiff" || e.kind === "hit")).toBe(false);
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
      expect(bindStrainOffset(t, 1)).toBeCloseTo(-bindStrainOffset(t, 0), 12);
      expect(bindStrainOffset(t, 0)).toBe(bindStrainOffset(t, 0)); // pure
    }
  });
});
