import { describe, expect, test } from "vitest";
import {
  AI_REACTION_BASE_MS,
  AI_REACTION_JITTER_MS,
  aiDecide,
  createAiState,
} from "../src/combat/ai";
import { ARENA, createDuel, tickDuel } from "../src/combat/engine";
import { TICK, createFighter, guardFormationMs } from "../src/combat/fighter";
import { WEAPONS, attackTimeline } from "../src/combat/weapons";
import type { Intent, WeaponId } from "../src/combat/types";

/**
 * The duelist-defence policy (spec §4, §5): the four-answer menu, the
 * delayed line read, the honest downgrade, the release lifecycle, and the
 * feasibility matrix - computed through guardFormationMs, the same
 * function the engine's parry acceptance runs, so what the tests believe
 * a guard costs can never drift from what the engine charges.
 */

const FLOOR = AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[0];
const MEAN = AI_REACTION_BASE_MS + (AI_REACTION_JITTER_MS[0] + AI_REACTION_JITTER_MS[1]) / 2;

/** The cornered-duelist fixture: the retire pulse has nowhere to go, so
 *  the gap the scenario sets is the gap the exchange is fought at. */
function corneredDuel(gap: number, mode: 3 | 4, seed: number) {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[1].x = ARENA.right;
  d.f[0].x = ARENA.right - gap;
  const ai = createAiState(seed);
  ai.cooldown = 5000; // keep its own attack pulse out of the exchange
  return { d, ai, mode };
}

describe("the feasibility matrix, computed not asserted (spec §5)", () => {
  /**
   * For every (defender, attacker, attack, stance, latency): can a guard
   * formed in reaction meet the attack? Player attacks carry no telegraph.
   * A wrong stance pays the full height travel (concurrent with the rise,
   * via guardFormationMs) plus one tick for the stance intent that must
   * precede the press.
   */
  function answerable(
    def: WeaponId,
    atk: WeaponId,
    kind: "cut" | "thrust",
    stanceRight: boolean,
    latencyMs: number,
  ): boolean {
    const f = createFighter(0, 1, WEAPONS[def]);
    const aim = { height: stanceRight ? f.height : "high", side: f.guardSide } as const;
    const formation = guardFormationMs(f, aim) + (stanceRight ? 0 : TICK);
    return latencyMs + formation <= attackTimeline(WEAPONS[atk], kind, 0).parryableUntil;
  }

  test("the matrix at the reaction floor and mean, pinned", () => {
    const matrix: Record<string, boolean> = {};
    for (const def of ["longsword", "rapier"] as const) {
      for (const atk of ["longsword", "rapier"] as const) {
        for (const kind of ["cut", "thrust"] as const) {
          for (const stance of ["right", "wrong"] as const) {
            for (const [label, lat] of [["floor", FLOOR], ["mean", MEAN]] as const) {
              matrix[`${def} vs ${atk} ${kind} ${stance} ${label}`] =
                answerable(def, atk, kind, stance === "right", lat);
            }
          }
        }
      }
    }
    expect(matrix).toEqual({
      "longsword vs longsword cut right floor": true,
      "longsword vs longsword cut right mean": true,
      "longsword vs longsword cut wrong floor": true,
      "longsword vs longsword cut wrong mean": true,
      // The knife-edge the spec keeps deliberately: a floor draw catches
      // the slowest thrust by 30ms; a typical read does not.
      "longsword vs longsword thrust right floor": true,
      "longsword vs longsword thrust right mean": false,
      "longsword vs longsword thrust wrong floor": false,
      "longsword vs longsword thrust wrong mean": false,
      "longsword vs rapier cut right floor": true,
      "longsword vs rapier cut right mean": true,
      "longsword vs rapier cut wrong floor": true,
      "longsword vs rapier cut wrong mean": false,
      "longsword vs rapier thrust right floor": false,
      "longsword vs rapier thrust right mean": false,
      "longsword vs rapier thrust wrong floor": false,
      "longsword vs rapier thrust wrong mean": false,
      "rapier vs longsword cut right floor": true,
      "rapier vs longsword cut right mean": true,
      "rapier vs longsword cut wrong floor": true,
      "rapier vs longsword cut wrong mean": true,
      "rapier vs longsword thrust right floor": true,
      "rapier vs longsword thrust right mean": false,
      "rapier vs longsword thrust wrong floor": false,
      "rapier vs longsword thrust wrong mean": false,
      "rapier vs rapier cut right floor": true,
      "rapier vs rapier cut right mean": true,
      "rapier vs rapier cut wrong floor": true,
      "rapier vs rapier cut wrong mean": false,
      "rapier vs rapier thrust right floor": false,
      "rapier vs rapier thrust right mean": false,
      "rapier vs rapier thrust wrong floor": false,
      "rapier vs rapier thrust wrong mean": false,
    });
  });

  test("invariant: every pairing keeps an attack unanswerable at the mean; every cut answers at the floor", () => {
    for (const def of ["longsword", "rapier"] as const) {
      for (const atk of ["longsword", "rapier"] as const) {
        const unanswerable = (["cut", "thrust"] as const).some(
          (k) => !answerable(def, atk, k, true, MEAN),
        );
        expect(unanswerable, `${def} vs ${atk}`).toBe(true);
        expect(answerable(def, atk, "cut", true, FLOOR), `${def} vs ${atk} cut`).toBe(true);
      }
    }
  });
});

describe("the menu (spec §4.2)", () => {
  test("all four answers occur across seeds, and thresholds match the weights", () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 60; seed++) {
      const { d, ai } = corneredDuel(140, 3, seed);
      let answer: string | null = null;
      let ia: Intent | null = "cut";
      for (let tick = 0; tick < 120 && answer === null; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        if (ai.threat?.answer) answer = ai.threat.answer;
        tickDuel(d, ia, ib);
        ia = null;
        if (d.over) break;
      }
      if (answer !== null) {
        seen.set(answer, (seen.get(answer) ?? 0) + 1);
        // The answer is a pure function of the roll (before downgrades
        // rewrite it, which only guard->retreat does and the first
        // reading precedes execution).
        const th = ai.threat;
        if (th !== null && answer !== "retreat") {
          const expected =
            th.roll < 0.4 ? "guard" : th.roll < 0.6 ? "retreat" : th.roll < 0.75 ? "counter" : "stand";
          expect(answer).toBe(expected);
        }
      }
    }
    expect(new Set(seen.keys())).toEqual(new Set(["guard", "retreat", "counter", "stand"]));
  });

  test("no parry intent is ever emitted while a parry is already up, and none while attacking", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { d, ai } = corneredDuel(140, 3, seed);
      for (let tick = 0; tick < 400; tick++) {
        // A noisy player: attack, feint, attack again.
        const ia: Intent | null =
          tick === 0 ? "cut" : tick === 20 ? "feint" : tick === 45 ? "thrust" : tick === 90 ? "cut" : null;
        const ib = aiDecide(d, 3, ai, TICK);
        if (ib === "parry") expect(d.f[1].parry).toBeNull();
        if (d.f[1].state.kind === "attack") {
          expect(ib === "parry" || ib === "retreat").toBe(false);
        }
        tickDuel(d, ia, ib);
        if (d.over) break;
      }
    }
  });
});

describe("the guard answer (spec §4.2.1)", () => {
  /** Find a seed whose first threat rolls guard (roll < 0.4). */
  function guardSeed(from: number): number {
    for (let seed = from; seed < from + 200; seed++) {
      const { d, ai } = corneredDuel(140, 3, seed);
      let ia: Intent | null = "cut";
      for (let tick = 0; tick < 60; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        tickDuel(d, ia, ib);
        ia = null;
        if (ai.threat !== null) break;
      }
      if (ai.threat !== null && ai.threat.roll < 0.4) return seed;
    }
    throw new Error("no guard seed found");
  }

  test("a young redirect is invisible: the decision reads the pre-lie height", () => {
    const seed = guardSeed(1);
    const { d, ai } = corneredDuel(140, 3, seed);
    // The player cuts low, then redirects HIGH mid-windup at 100ms. Every
    // reaction draw exceeds 100ms, so at the decision tick the lie is
    // always younger than the reaction: the threat line the policy reads
    // must still be the original low - even though the attack visibly
    // flies high. (What the duelist then DOES with that read may honestly
    // downgrade: the redirect also rewrites parryableUntil earlier.)
    let ia: Intent | null = "cut";
    for (let tick = 0; tick < 60; tick++) {
      const ib = aiDecide(d, 3, ai, TICK);
      tickDuel(d, ia, ib);
      ia = tick === 5 ? "stanceUp" : null; // redirect fires at 100ms
      if (ai.threat?.answered) break;
      if (d.over) break;
    }
    const os = d.f[0].state;
    expect(os.kind === "attack" && os.height).toBe("high"); // the lie is real
    expect(ai.threat?.answered).toBe(true);
    expect(ai.threat?.line?.height).toBe("low"); // the read lags it
  });

  test("an unanswerable threat downgrades to retreat, never a doomed press", () => {
    // A rapier thrust is unanswerable at any latency (the matrix above):
    // every guard roll must downgrade - the duelist steps, never presses.
    for (let seed = 1; seed <= 40; seed++) {
      const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
      d.f[1].x = ARENA.right;
      d.f[0].x = ARENA.right - 140;
      const ai = createAiState(seed);
      ai.cooldown = 5000;
      let ia: Intent | null = "thrust";
      for (let tick = 0; tick < 60; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        expect(ib).not.toBe("parry");
        tickDuel(d, ia, ib);
        ia = null;
        if (d.over) break;
      }
    }
  });

  test("the guard comes down after the exchange: mode 1's release lifecycle", () => {
    // A feinted cut leaves an answered guard standing with nothing to
    // meet; the duelist releases it after a reaction, paying the input
    // lifecycle like anyone else.
    let exercised = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { d, ai } = corneredDuel(140, 3, seed);
      let sawParry = false;
      let sawRelease = false;
      let ia: Intent | null = "cut";
      for (let tick = 0; tick < 200; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        if (ib === "parry") sawParry = true;
        if (ib === "parryRelease") sawRelease = true;
        tickDuel(d, ia, ib);
        ia = tick === 26 ? "feint" : null;
        if (d.over) break;
      }
      if (sawParry) {
        expect(sawRelease).toBe(true);
        exercised++;
      }
    }
    expect(exercised).toBeGreaterThan(0);
  });
});

describe("the counter and the bind door (spec §1, §4.3)", () => {
  test("chasing into the standing counter crosses steel and binds", () => {
    // The §1 arithmetic: the counter never crosses the attack it answers,
    // but its delivered blade stands in the line - a player who feints
    // and then chases crosses it. Across seeds, some counter draws must
    // produce exactly that bind; mode 4 pins the counter's height so the
    // chase's line matches deterministically.
    let counters = 0;
    let binds = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { d, ai } = corneredDuel(140, 4, seed);
      let ia: Intent | null = "cut";
      for (let tick = 0; tick < 200; tick++) {
        const ib = aiDecide(d, 4, ai, TICK);
        if (ai.threat?.answer === "counter") counters++;
        const events = tickDuel(d, ia, ib);
        if (events.some((e) => e.kind === "bind")) {
          binds++;
          break;
        }
        ia = tick === 26 ? "feint" : tick === 39 ? "cut" : null;
        if (d.over) break;
      }
    }
    expect(counters).toBeGreaterThan(0);
    expect(binds).toBeGreaterThan(0);
  });

  test("stand lets a plan decided before the threat proceed: committed is committed", () => {
    // Seed search: a pulse plan drawn before the player's attack, and a
    // stand roll after it - the planned attack must still be thrown.
    let exercised = 0;
    for (let seed = 1; seed <= 80 && exercised === 0; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = d.f[1].x - 140;
      const ai = createAiState(seed);
      // cooldown 0: the pulse draws its plan on tick 0, before the cut.
      let ia: Intent | null = null;
      let threw = false;
      for (let tick = 0; tick < 120; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        if (tick === 1) ia = "cut";
        if (
          ai.threat?.answer === "stand" &&
          (ib === "cut" || ib === "thrust")
        ) {
          threw = true;
        }
        tickDuel(d, ia, ib);
        ia = null;
        if (d.over) break;
      }
      if (threw) exercised++;
    }
    expect(exercised).toBeGreaterThan(0);
  });
});
