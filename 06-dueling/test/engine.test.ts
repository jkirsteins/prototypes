import { describe, expect, test } from "vitest";
import { applyIntent, TICK } from "../src/combat/fighter";
import { ARENA, MIN_GAP, createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS, parryableMs } from "../src/combat/weapons";
import type { Duel } from "../src/combat/engine";
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
    // Rapier thrusts; longsword meets the blade as the strike commits.
    const t = WEAPONS.rapier.attacks.thrust;
    let evs = runMs(d, TICK, "thrust", null);
    const strikeAt = t.windup + t.beat;
    evs = evs.concat(runMs(d, strikeAt - TICK));
    evs = evs.concat(runMs(d, TICK, null, "parry"));
    evs = evs.concat(runMs(d, t.strike + 2 * TICK));
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

    test("one rule for every weapon: meeting the blade as it commits always works", () => {
      // The learnable grammar. Under the old instant-based resolution this
      // press succeeded for fast attacks and failed for slow ones.
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        expect(outcome(atk, def, kind, strikeAt)).toBe("parried");
      }
    });

    test("the guard may go up early, while the blade still travels, or anywhere between", () => {
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        const early = strikeAt - WEAPONS[def].parryWindow / 2;
        const late = strikeAt + parryableMs(t) - 30;
        expect(outcome(atk, def, kind, Math.max(0, early))).toBe("parried");
        expect(outcome(atk, def, kind, late)).toBe("parried");
      }
    });

    test("once the blade is delivered it cannot be met", () => {
      for (const [atk, def, kind] of cases) {
        const t = WEAPONS[atk].attacks[kind];
        const strikeAt = t.windup + t.beat;
        expect(outcome(atk, def, kind, strikeAt + parryableMs(t) + 40)).toBe("hit");
      }
    });

    test("a guard raised too early expires before the blade commits", () => {
      // Longsword cut: 520ms of preparation against a 200ms rapier guard.
      expect(outcome("longsword", "rapier", "cut", 0)).toBe("hit");
    });
  });

  test("mutual strikeEnd on the same tick is a draw", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    closeTo(d, 160);
    // Symmetric no-tell attacks injected directly so both strikeEnds land
    // on the same tick (a tell-carrying "thrust" intent through tickDuel
    // would make side 1 strike 180ms later than side 0, and side 0's kill
    // would end the duel before side 1 lands).
    applyIntent(d.f[0], "thrust");
    applyIntent(d.f[1], "thrust");
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, null, null);
    // identical weapons, same-tick thrusts: both land
    expect(d.over).toBe(true);
    expect(d.winner).toBe("draw");
  });
});

describe("met events", () => {
  test("met fires at blade contact, before parried resolves, and is never logged", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 180);
    const t = WEAPONS.rapier.attacks.thrust;
    const strikeAt = t.windup + t.beat;
    const kinds: string[] = [];
    let ticks = 0;
    for (let i = 0; i < 300 && !kinds.includes("parried"); i++, ticks++) {
      const ib = (i + 1) * TICK >= strikeAt && !kinds.includes("met") ? "parry" : null;
      kinds.push(...tickDuel(d, i === 0 ? "thrust" : null, ib).map((e) => e.kind));
    }
    const metAt = kinds.indexOf("met");
    const parriedAt = kinds.indexOf("parried");
    expect(metAt).toBeGreaterThanOrEqual(0);
    expect(parriedAt).toBeGreaterThan(metAt);
    expect(d.log.some((e) => e.kind === "met")).toBe(false);
  });
});

describe("step events", () => {
  test("an accepted advance returns a step event but never logs it", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const evs = tickDuel(d, "advance", null);
    expect(evs.some((e) => e.kind === "step" && e.side === 0)).toBe(true);
    expect(d.log.some((e) => e.kind === "step")).toBe(false);
  });

  test("a held advance chains steps through the buffer, one event per step", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const w = WEAPONS.longsword;
    // Long enough for two full step+pause cycles: the second step starts
    // inside flushBuffer, which bypasses the engine's acceptance chain.
    const ms = 2 * (w.stepDuration + w.stancePause) + 100;
    let steps = 0;
    for (let t = 0; t < ms; t += TICK) {
      for (const e of tickDuel(d, "advance", null)) {
        if (e.kind === "step" && e.side === 0) steps++;
      }
    }
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(d.log.some((e) => e.kind === "step")).toBe(false);
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
