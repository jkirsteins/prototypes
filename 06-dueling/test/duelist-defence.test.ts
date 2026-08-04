import { describe, expect, test } from "vitest";
import { aiDecide, createAiState } from "../src/combat/ai";
import { ARENA, createDuel, tickDuel } from "../src/combat/engine";
import { TICK, createFighter, guardFormationMs, lineOf } from "../src/combat/fighter";
import { WEAPONS, attackTimeline } from "../src/combat/weapons";
import type { Intent, Line } from "../src/combat/types";

/**
 * The duelist-defence policy (spec §4, §5): the four-answer menu, the
 * delayed line read, the honest downgrade, the release lifecycle, and the
 * feasibility matrix - computed through guardFormationMs, the same
 * function the engine's parry acceptance runs, so what the tests believe
 * a guard costs can never drift from what the engine charges.
 */

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

describe("the matrix, recomputed (preparation-and-readiness §4)", () => {
  /**
   * Verdict and MARGIN per entry, computed through guardFormationMs - the
   * same function the parry acceptance and the live policy run - against
   * the resting-line relations {same, wrongHeight, wrongSide} at the
   * reaction band's floor, mean and ceiling. Margins are pinned so a
   * future retune that flips or tightens an entry fails visibly; the
   * within-tick entries (P10, P0, P5, -10) are deliberate - reactions are
   * drawn from a continuous band, so a small margin at a probe point only
   * says where inside the band the flip point sits, and the engine is
   * deterministic (the boundary tick-ordering pin lives in
   * preparation-readiness.test.ts). No branch on weapon names anywhere.
   */
  test("verdicts and margins at floor, mean and ceiling, pinned", () => {
    const LATS = [200, 310, 420];
    const matrix: Record<string, string> = {};
    for (const def of ["longsword", "rapier"] as const) {
      for (const atk of ["longsword", "rapier"] as const) {
        for (const kind of ["cut", "thrust"] as const) {
          const deadline = attackTimeline(WEAPONS[atk], kind).parryableUntil;
          for (const rel of ["same", "wrongHeight", "wrongSide"] as const) {
            const f = createFighter(0, 1, WEAPONS[def]);
            const aim: Line = {
              height: rel === "wrongHeight" ? "high" : f.height,
              side: rel === "wrongSide" ? "outside" : f.guardSide,
            };
            const formation = guardFormationMs(f, aim);
            matrix[`${def} vs ${atk} ${kind} ${rel}`] = LATS.map((lat) => {
              const m = deadline - (lat + formation);
              return `${m >= 0 ? "P" : "-"}${m}`;
            }).join(" ");
          }
        }
      }
    }
    expect(matrix).toEqual({
      "longsword vs longsword cut same": "P580 P470 P360",
      "longsword vs longsword cut wrongHeight": "P390 P280 P170",
      "longsword vs longsword cut wrongSide": "P570 P460 P350",
      "longsword vs longsword thrust same": "P320 P210 P100",
      "longsword vs longsword thrust wrongHeight": "P130 P20 --90",
      "longsword vs longsword thrust wrongSide": "P310 P200 P90",
      "longsword vs rapier cut same": "P380 P270 P160",
      "longsword vs rapier cut wrongHeight": "P190 P80 --30",
      "longsword vs rapier cut wrongSide": "P370 P260 P150",
      "longsword vs rapier thrust same": "P200 P90 --20",
      "longsword vs rapier thrust wrongHeight": "P10 --100 --210",
      "longsword vs rapier thrust wrongSide": "P190 P80 --30",
      "rapier vs longsword cut same": "P605 P495 P385",
      "rapier vs longsword cut wrongHeight": "P420 P310 P200",
      "rapier vs longsword cut wrongSide": "P590 P480 P370",
      "rapier vs longsword thrust same": "P345 P235 P125",
      "rapier vs longsword thrust wrongHeight": "P160 P50 --60",
      "rapier vs longsword thrust wrongSide": "P330 P220 P110",
      "rapier vs rapier cut same": "P405 P295 P185",
      "rapier vs rapier cut wrongHeight": "P220 P110 P0",
      "rapier vs rapier cut wrongSide": "P390 P280 P170",
      "rapier vs rapier thrust same": "P225 P115 P5",
      "rapier vs rapier thrust wrongHeight": "P40 --70 --180",
      "rapier vs rapier thrust wrongSide": "P210 P100 --10",
    });
  });

  test("same-line readiness target: every attack parryable at floor and mean, for every pairing", () => {
    for (const def of ["longsword", "rapier"] as const) {
      for (const atk of ["longsword", "rapier"] as const) {
        for (const kind of ["cut", "thrust"] as const) {
          const deadline = attackTimeline(WEAPONS[atk], kind).parryableUntil;
          const f = createFighter(0, 1, WEAPONS[def]);
          const formation = guardFormationMs(f, { height: f.height, side: f.guardSide });
          for (const lat of [200, 310]) {
            expect(lat + formation, `${def} vs ${atk} ${kind} at ${lat}`).toBeLessThanOrEqual(deadline);
          }
        }
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

  test("no doomed press, ever: any guard the duelist starts can still form in time", () => {
    // Under readiness the same-line rapier thrust IS answerable on most
    // draws, so "never parries the thrust" stopped being true - the
    // surviving universal is the downgrade rule itself: whenever the
    // duelist presses, the engine's own arithmetic says the guard forms
    // before the visible attack's parryableUntil; infeasible cases step
    // back instead.
    for (let seed = 1; seed <= 40; seed++) {
      const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
      d.f[1].x = ARENA.right;
      d.f[0].x = ARENA.right - 140;
      const ai = createAiState(seed);
      ai.cooldown = 5000;
      let ia: Intent | null = "thrust";
      for (let tick = 0; tick < 90; tick++) {
        const ib = aiDecide(d, 3, ai, TICK);
        const os = d.f[0].state;
        if (ib === "parry" && os.kind === "attack") {
          const aim = ai.threat?.line ?? lineOf(d.f[0]);
          expect(os.elapsedMs + guardFormationMs(d.f[1], aim)).toBeLessThanOrEqual(
            os.timeline.parryableUntil,
          );
        }
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
