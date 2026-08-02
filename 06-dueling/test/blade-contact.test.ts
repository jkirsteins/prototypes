import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter } from "../src/combat/fighter";
import { bladesCross, extension, parryMeetsAttack } from "../src/combat/contact";
import { createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS, parryableMs } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Fighter } from "../src/combat/fighter";
import type { AttackKind, Intent, WeaponProfile } from "../src/combat/types";

/**
 * TODO-3-blade-contact.md: a strike is a blade moving. extension() locates
 * it; bladesCross makes two travelling blades on one line meet; the met cue
 * fires on the contact tick, once per contact.
 */

/** A fighter mid-attack with the clock set to `elapsed`, at `height`. */
function attacker(w: WeaponProfile, kind: AttackKind, elapsed: number, height: "high" | "low" = "low"): Fighter {
  const f = createFighter(0, 1, w);
  applyIntent(f, kind);
  const s = f.state;
  if (s.kind !== "attack") throw new Error("unreachable");
  s.height = height;
  s.elapsedMs = elapsed;
  if (elapsed >= s.timeline.strikeStart && elapsed <= s.timeline.strikeEnd) s.phase = "strike";
  else if (elapsed > s.timeline.strikeEnd) s.phase = "recovery";
  return f;
}

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

describe("extension: where the blade is", () => {
  test("zero through the windup, zero at strikeStart, full reach at parryableUntil, held through the delivered half", () => {
    for (const w of Object.values(WEAPONS)) {
      for (const kind of ["cut", "thrust"] as const) {
        const t = w.attacks[kind];
        const strikeStart = t.windup + t.beat;
        expect(extension(attacker(w, kind, strikeStart - 1))).toBe(0); // windup
        expect(extension(attacker(w, kind, strikeStart))).toBe(0); // travel begins
        const mid = strikeStart + parryableMs(t) / 2;
        expect(extension(attacker(w, kind, mid))).toBeCloseTo(w.reach / 2, 5);
        expect(extension(attacker(w, kind, strikeStart + parryableMs(t)))).toBe(w.reach);
        expect(extension(attacker(w, kind, strikeStart + t.strike - 1))).toBe(w.reach); // delivered
      }
    }
  });

  test("zero for anything that is not an attacking strike", () => {
    const f = createFighter(0, 1, WEAPONS.longsword);
    expect(extension(f)).toBe(0);
    applyIntent(f, "parry");
    expect(extension(f)).toBe(0); // a guard is a position, not a reach
  });
});

describe("bladesCross: conditions falsified independently", () => {
  const w = WEAPONS.longsword;
  const t = w.attacks.thrust;
  const full = t.windup + t.beat + parryableMs(t); // full extension instant

  test("all hold: two full-extension thrusts on one line at a coverable gap", () => {
    const a = attacker(w, "thrust", full);
    const b = attacker(w, "thrust", full);
    expect(bladesCross(a, b, 2 * w.reach - 10)).toBe(true);
  });
  test("symmetric in its arguments", () => {
    for (const [ea, eb, gap] of [
      [full, full, 390], [full - 60, full, 250], [full, t.windup + t.beat + 10, 120],
    ] as const) {
      const a = attacker(w, "thrust", ea);
      const b = attacker(w, "thrust", eb);
      expect(bladesCross(a, b, gap)).toBe(bladesCross(b, a, gap));
    }
  });
  test("a travelling blade meets a delivered one still standing in its strike", () => {
    const a = attacker(w, "thrust", full + TICK + 1); // delivered, strike not yet over
    const b = attacker(w, "thrust", full - 20); // still travelling
    expect(bladesCross(a, b, 100)).toBe(true);
  });
  test("motion alone fails: two delivered blades never clash", () => {
    const a = attacker(w, "thrust", full + TICK + 1);
    const b = attacker(w, "thrust", full + TICK + 1);
    expect(bladesCross(a, b, 100)).toBe(false);
  });
  test("presence alone fails: a blade past its strike is gone from the line", () => {
    const a = attacker(w, "thrust", t.windup + t.beat + t.strike + 1); // recovery
    const b = attacker(w, "thrust", full - 20);
    expect(bladesCross(a, b, 100)).toBe(false);
  });
  test("travel alone fails: one blade is still winding up", () => {
    const a = attacker(w, "thrust", t.windup - 10);
    const b = attacker(w, "thrust", full);
    expect(bladesCross(a, b, 100)).toBe(false);
  });
  test("height alone fails", () => {
    const a = attacker(w, "thrust", full, "high");
    const b = attacker(w, "thrust", full, "low");
    expect(bladesCross(a, b, 100)).toBe(false);
  });
  test("side alone fails: a cut and a thrust pass each other", () => {
    const a = attacker(w, "cut", w.attacks.cut.windup + w.attacks.cut.beat + parryableMs(w.attacks.cut));
    const b = attacker(w, "thrust", full);
    expect(bladesCross(a, b, 100)).toBe(false);
  });
  test("distance alone fails: the tips have not covered the gap", () => {
    const early = t.windup + t.beat + parryableMs(t) * 0.25; // quarter extension each
    const a = attacker(w, "thrust", early);
    const b = attacker(w, "thrust", early);
    expect(bladesCross(a, b, w.reach)).toBe(false); // 0.25r + 0.25r < r
  });
  test("an inside cut crosses a thrust: the fixture completes the no-inference proof", () => {
    const fixture: WeaponProfile = structuredClone(WEAPONS.longsword);
    fixture.attacks.cut.side = "inside";
    const ct = fixture.attacks.cut;
    const a = attacker(fixture, "cut", ct.windup + ct.beat + parryableMs(ct));
    const b = attacker(w, "thrust", full);
    expect(bladesCross(a, b, 100)).toBe(true);
  });
});

describe("crossings in real duels", () => {
  test("two simultaneous thrusts on one line clash: both parried, nobody dies, one met event", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    const evs = runMs(d, 1400, "thrust", "thrust");
    expect(evs.filter((e) => e.kind === "met").length).toBe(1);
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
    expect(d.over).toBe(false);
    // Both paid their own parried penalty: recoveries are the extended ones.
    for (const side of [0, 1] as const) {
      const s = d.f[side].state;
      if (s.kind !== "attack") continue;
      const t = d.f[side].weapon.attacks.thrust;
      expect(s.timeline.recoveryEnd).toBe(s.timeline.recoveryStart + t.recovery + d.f[side].weapon.parriedPenalty);
    }
  });

  test("the crossing's met fires when the extensions cover the gap, before either parryableUntil", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180; // gap 180, well under the 440 sum
    const evs = runMs(d, 1400, "thrust", "thrust");
    const met = evs.find((e) => e.kind === "met");
    if (met === undefined) throw new Error("no met");
    // Telegraphed rapier thrust travels 400..510; LS thrust travels 320..450.
    // Overlap starts at 400; extensions cover 180 shortly after. The cue must
    // land inside the overlap, strictly before the earliest parryableUntil.
    expect(met.time).toBeGreaterThanOrEqual(400);
    expect(met.time).toBeLessThan(450);
  });

  test("the contact tick moves with the gap: closer fighters clash earlier", () => {
    // Longsword vs the telegraphed rapier: travel windows overlap 400..450,
    // so the crossing instant is decided by the gap alone. (A longsword
    // mirror would not clash at all - its telegraph pushes the AI's travel
    // fully past the player's, which is itself the disjoint-tempo rule.)
    const metAt = (gap: number): number => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
      d.f[0].x = 1000;
      d.f[1].x = 1000 + gap;
      const evs = runMs(d, 1600, "thrust", "thrust");
      const met = evs.find((e) => e.kind === "met");
      if (met === undefined) throw new Error(`no met at gap ${gap}`);
      return met.time;
    };
    const ticks = [metAt(140), metAt(200), metAt(280)];
    expect(ticks[0]).toBeLessThan(ticks[1]);
    expect(ticks[1]).toBeLessThan(ticks[2]);
  });

  test("a reactive counter now crosses: pressed a full reaction after the attack starts", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    // The AI thrust becomes visible at 0; the player answers at 250 - the
    // human budget. The player's travel begins at 570, inside the AI
    // blade's delivered-but-standing strike (ends 620): steel in the line.
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, 250 - TICK));
    evs = evs.concat(runMs(d, 1400, "thrust", null));
    expect(evs.filter((e) => e.kind === "met").length).toBe(1);
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(d.over).toBe(false);
  });

  test("two thrusts at wide measure cross mid-air: steel rings, nobody can be wounded", () => {
    // The reach SUM covers wide gaps: extended blades genuinely cross out
    // where neither could reach flesh. Steel that met steel ended on steel -
    // both resolve parried, never whiff, or the clash the simulation
    // sounded would be contradicted by a "misses" line.
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1290; // wide for both (LS reach 200, rapier 240), under the 440 sum
    const evs = runMs(d, 1600, "thrust", "thrust");
    expect(evs.filter((e) => e.kind === "met").length).toBe(1);
    expect(evs.some((e) => e.kind === "whiff")).toBe(false);
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
    expect(d.over).toBe(false);
  });

  test("disjoint travel windows do not clash: the earlier blade resolves alone", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    // Steel stands in the line for the WHOLE strike now, so disjoint means
    // the later travel starts after the earlier strikeEnd (620): side 0's
    // thrust launched at 420 travels 680..790, into empty air where side
    // 1's blade used to be.
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, 420 - TICK));
    evs = evs.concat(runMs(d, 1200, "thrust", null));
    expect(evs.some((e) => e.kind === "met")).toBe(false);
    // Side 1 resolves first and kills side 0 mid-attack.
    expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(d.winner).toBe(1);
  });

  test("a cut and a thrust at one height pass and double-kill when they resolve together", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1190; // inside both reaches
    // LS cut resolves at 900. The AI rapier thrust (telegraph 140) resolves
    // 620 after launch: launch it at 280 so both strikes end on one tick.
    let evs = runMs(d, TICK, "cut", null);
    evs = evs.concat(runMs(d, 280 - TICK));
    evs = evs.concat(runMs(d, 1000, null, "thrust"));
    expect(evs.some((e) => e.kind === "met")).toBe(false); // different sides: no steel
    expect(evs.some((e) => e.kind === "draw")).toBe(true);
    expect(d.winner).toBe("draw");
  });
});

describe("the parry clash arrives with the blade", () => {
  /** Formed guard from the start; one attack; return the met event time. */
  function metTime(gap: number): number {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1000 + gap;
    let evs = runMs(d, TICK, null, "parry"); // cold press: covers inside, thrust side
    evs = evs.concat(runMs(d, 1200, "thrust", null));
    const met = evs.find((e) => e.kind === "met");
    if (met === undefined) throw new Error(`no met at gap ${gap}`);
    return met.time;
  }

  test("at close range the blade arrives at the guard early in its travel", () => {
    const t = WEAPONS.rapier.attacks.thrust;
    const strikeStart = t.windup + t.beat; // tell-free player thrust
    // gap 140 (above MIN_GAP's 130) of reach 240: arrival at ~58% of travel.
    const close = metTime(140);
    expect(close).toBeGreaterThan(strikeStart);
    // At maximum range the old parryable-interval boundary is the limiting
    // case, give or take the acceptance tick and the crossing tick.
    const far = metTime(WEAPONS.rapier.reach);
    expect(far).toBeGreaterThanOrEqual(strikeStart + parryableMs(t));
    expect(far).toBeLessThanOrEqual(strikeStart + parryableMs(t) + 3 * TICK);
    expect(close).toBeLessThanOrEqual(far - 2 * TICK);
  });

  test("a guard formed after the blade's arrival still latches, on its effective tick", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1120; // arrival early in the travel
    const t = WEAPONS.rapier.attacks.thrust;
    const strikeStart = t.windup + t.beat;
    // Press so the guard becomes effective inside the travel but after arrival.
    const press = strikeStart + parryableMs(t) - WEAPONS.longsword.parryRiseMs - 2 * TICK;
    let evs = runMs(d, TICK, "thrust", null);
    evs = evs.concat(runMs(d, press - TICK));
    evs = evs.concat(runMs(d, TICK, null, "parry"));
    evs = evs.concat(runMs(d, 800));
    expect(evs.some((e) => e.kind === "met")).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
  });
});

describe("parryMeetsAttack: the travel condition", () => {
  test("a blade that has not yet covered the gap is not meetable, all else holding", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1200; // gap 200 of reach 240: arrival at 5/6 of the travel
    const t = WEAPONS.rapier.attacks.thrust;
    applyIntent(d.f[0], "thrust");
    const s = d.f[0].state;
    if (s.kind !== "attack") throw new Error("unreachable");
    s.phase = "strike";
    applyIntent(d.f[1], "parry");
    const p = d.f[1].parry;
    if (p !== null) {
      p.phase = "held";
      p.phaseDurationMs = 0;
      p.settledMs = 200;
    }
    s.elapsedMs = s.timeline.strikeStart + parryableMs(t) * 0.5; // extension 120 < 200
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
    s.elapsedMs = s.timeline.strikeStart + parryableMs(t) * 0.9; // extension 216 >= 200
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(true);
  });
});
