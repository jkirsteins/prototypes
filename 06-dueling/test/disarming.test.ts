import { describe, expect, test } from "vitest";
import { aiDecide, createAiState } from "../src/combat/ai";
import { createDuel, tickDuel } from "../src/combat/engine";
import {
  BIND_ADVANTAGE_MS,
  BIND_LOSS_MS,
  DISARM_FIRM_MS,
  DISARM_SOFT_MS,
  TICK,
  disarmDurationMs,
} from "../src/combat/fighter";
import { openingPromptText } from "../src/render/draw";
import { WEAPONS, bindTimeline } from "../src/combat/weapons";
import { canBind } from "../src/combat/contact";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

/**
 * The disarm (disarming spec): the advantage's second conversion, the
 * thrust's guaranteed twin. The grip prices the strip's DURATION, never
 * its outcome; the resist does not exist; the duel ends bloodlessly.
 */

/** A longsword-mirror bind side `winner` wins by the calm drift: the
 *  winner's thrust flies first (firm, standing), the loser's arrives 9
 *  ticks late (soft) - the lead leans the entry and the drift resolves
 *  it decisively with both fighters passive. */
function wonBind(winner: 0 | 1, gap = 180): { d: Duel; grip: number; breakTick: number } {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1000 + gap;
  let grip = 0;
  for (let tick = 0; tick < 600; tick++) {
    const first: Intent | null = tick === 0 ? "thrust" : null;
    const late: Intent | null = tick === 9 ? "thrust" : null;
    const [ia, ib] = winner === 0 ? [first, late] : [late, first];
    const evs = tickDuel(d, ia, ib);
    if (d.bind !== null) grip = d.bind.firmness[1 - winner];
    if (evs.some((e) => e.kind === "bindBreak" && e.side === winner)) {
      return { d, grip, breakTick: tick };
    }
  }
  throw new Error("no bind win");
}

describe("the twin invariant", () => {
  test("the slowest strip from the advantage's last tick resolves inside the exposure, beside the thrust's guarantee", () => {
    // Both conversions are TIME guarantees, pinned together: if either
    // margin closes, the promise of the opening is a lie.
    expect(BIND_ADVANTAGE_MS + DISARM_FIRM_MS).toBeLessThanOrEqual(BIND_LOSS_MS - TICK);
    for (const w of Object.values(WEAPONS)) {
      if (!canBind(w, w)) continue;
      expect(BIND_ADVANTAGE_MS + bindTimeline(w).strikeEnd).toBeLessThanOrEqual(BIND_LOSS_MS);
    }
  });

  test("the duration derivation is shared and grip-linear", () => {
    expect(disarmDurationMs(0)).toBe(DISARM_SOFT_MS);
    expect(disarmDurationMs(1)).toBe(DISARM_FIRM_MS);
    expect(disarmDurationMs(0.5)).toBeCloseTo((DISARM_SOFT_MS + DISARM_FIRM_MS) / 2, 6);
  });
});

describe("the attempt, end to end", () => {
  test("I converts the advantage: guaranteed strip, atomic resolution, one sound", () => {
    const { d, grip } = wonBind(0);
    expect(d.f[0].bindAdvantageMs).toBeGreaterThan(0);
    expect(d.f[0].bindAdvantageGrip).toBeCloseTo(grip, 6);
    const x0 = [d.f[0].x, d.f[1].x];
    let evs: DuelEvent[] = tickDuel(d, "disarm", null);
    expect(d.f[0].state.kind).toBe("disarming");
    expect(d.f[0].bindAdvantageMs).toBe(0); // consumed
    if (d.disarm === null) throw new Error("no attempt");
    expect(d.disarm.durationMs).toBeCloseTo(disarmDurationMs(grip), 6);
    // The victim mashes parry every tick: there is no resist, and the
    // strip lands regardless.
    for (let i = 0; i < 60 && !d.over; i++) evs = evs.concat(tickDuel(d, null, "parry"));
    expect(evs.filter((e) => e.kind === "disarmed").length).toBe(1);
    expect(evs.some((e) => e.kind === "hit" || e.kind === "kill")).toBe(false);
    expect(d.over).toBe(true);
    expect(d.winner).toBe(0);
    expect(d.outcome).toBe("disarm");
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.f[1].state.kind).toBe("disarmed");
    // Frozen at the contact gap throughout.
    expect([d.f[0].x, d.f[1].x]).toEqual(x0);
  });

  test("the victim goes exposed -> disarmed, never through ready, and the pose survives", () => {
    const { d } = wonBind(0);
    tickDuel(d, "disarm", null);
    const kinds = new Set<string>();
    while (!d.over) {
      kinds.add(d.f[1].state.kind);
      tickDuel(d, null, null);
    }
    expect(kinds).toEqual(new Set(["exposed"]));
    const vs = d.f[1].state;
    if (vs.kind !== "disarmed") throw new Error("not disarmed");
    expect(vs.contact).toBeDefined(); // the held pose, carried into the terminal state
  });

  test("disarming is committed and disarmed is terminal: no intent does anything", () => {
    const { d } = wonBind(0);
    tickDuel(d, "disarm", null);
    tickDuel(d, "cut", null);
    expect(d.f[0].state.kind).toBe("disarming"); // committed: nothing accepted
    while (!d.over) tickDuel(d, null, null);
    const after = tickDuel(d, "thrust", "thrust");
    expect(after.length).toBe(0); // the duel is over: no events follow
    expect(d.f[1].state.kind).toBe("disarmed");
  });

  test("I is inert outside the advantage, in every state", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    const evs = tickDuel(d, "disarm", null); // ready, no advantage
    expect(evs.length).toBe(0);
    expect(d.f[0].state.kind).toBe("ready");
    expect(d.disarm).toBe(null);
    tickDuel(d, "advance", null);
    const evs2 = tickDuel(d, "disarm", null); // mid-step
    expect(evs2.filter((e) => e.kind !== "step").length).toBe(0);
    expect(d.disarm).toBe(null);
  });

  test("kill and draw endings populate the outcome field too", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1160;
    for (let i = 0; i < 200 && !d.over; i++) tickDuel(d, i === 0 ? "thrust" : null, null);
    expect(d.outcome).toBe("kill");
  });
});

describe("the AI conversion (disarming §5)", () => {
  /** Side 1 wins a bind with mode-3/4 policy live; returns the duel run
   *  to the bindBreak plus the ai state, stopping exactly on the break
   *  tick so the transfer has not happened yet. */
  function aiWonBind(seed: number, mode: 3 | 4 = 3, gap = 180) {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1000 + gap;
    const ai = createAiState(seed);
    ai.cooldown = 10000; // the pulse stays out; the scripted thrust enters the bind
    let plan: string | null = null;
    for (let tick = 0; tick < 900; tick++) {
      const ib = tick === 0 ? "thrust" : aiDecide(d, mode, ai, TICK);
      const ia: Intent | null = tick === 9 ? "thrust" : null;
      const evs = tickDuel(d, ia, ib);
      if (ai.bind !== null && plan === null) plan = ai.bind.conversionPlan;
      if (evs.some((e) => e.kind === "bindBreak")) {
        const winner = evs.find((e) => e.kind === "bindBreak")?.side;
        return { d, ai, plan, winner, breakTick: tick };
      }
    }
    throw new Error("no resolution");
  }

  test("the plan survives the teardown and owns the output until it fires, in modes 3 and 4", () => {
    for (const mode of [3, 4] as const) {
      let exercised = 0;
      for (let seed = 1; seed <= 12 && exercised < 3; seed++) {
        const r = aiWonBind(seed, mode);
        if (r.winner !== 1) continue; // this seed's contest went the other way
        exercised++;
        // The first decide after the teardown transfers the entry plan.
        const intents: Array<Intent | null> = [];
        let fired: Intent | null = null;
        for (let i = 0; i < 30 && fired === null; i++) {
          const ib = aiDecide(r.d, mode, r.ai, TICK);
          if (ib !== null) fired = ib;
          else intents.push(ib);
          tickDuel(r.d, null, ib);
          if (r.d.over) break;
        }
        // Between victory and dueAt: silence - no pulse step, no attack,
        // nothing that would consume the advantage under the plan.
        expect(intents.every((i) => i === null)).toBe(true);
        if (fired !== null && r.plan !== null) {
          const expected = r.plan === "withdraw" ? "retreat" : r.plan;
          expect(fired).toBe(expected);
        }
      }
      expect(exercised).toBeGreaterThan(0);
    }
  });

  test("a lost bind leaves no conversion", () => {
    // The AI enters firm (the aiWonBind shape), but the player MASHES
    // pressure inside the bind and shoves it out anyway - across seeds
    // the mash wins most contests, and a won-by-the-player bind must
    // leave the AI's entry-drawn plan unread.
    let exercised = 0;
    for (let seed = 1; seed <= 12 && exercised === 0; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      const ai = createAiState(seed);
      ai.cooldown = 10000;
      for (let tick = 0; tick < 900; tick++) {
        const ib = tick === 0 ? "thrust" : aiDecide(d, 3, ai, TICK);
        let ia: Intent | null = tick === 9 ? "thrust" : null;
        if (d.bind !== null && tick % 8 === 0) ia = "cut"; // the mash
        const evs = tickDuel(d, ia, ib);
        const brk = evs.find((e) => e.kind === "bindBreak");
        if (brk !== undefined) {
          if (brk.side !== 0) break; // the AI held this seed: try another
          aiDecide(d, 3, ai, TICK); // the teardown decide
          expect(ai.conversion).toBe(null);
          exercised++;
          break;
        }
        if (d.over) break;
      }
    }
    expect(exercised).toBe(1);
  });

  test("the mix is real: all three plans occur, and delays sit inside the band", () => {
    const plans = new Set<string>();
    for (let seed = 1; seed <= 40 && plans.size < 3; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      const ai = createAiState(seed);
      ai.cooldown = 10000;
      for (let tick = 0; tick < 120 && ai.bind === null; tick++) {
        const ib = tick === 0 ? "thrust" : aiDecide(d, 3, ai, TICK);
        tickDuel(d, tick === 9 ? "thrust" : null, ib);
      }
      if (ai.bind !== null) {
        plans.add(ai.bind.conversionPlan);
        expect(ai.bind.conversionDelayMs).toBeGreaterThanOrEqual(0);
        expect(ai.bind.conversionDelayMs).toBeLessThanOrEqual(60);
      }
    }
    expect(plans).toEqual(new Set(["thrust", "disarm", "withdraw"]));
  });

  test("a wide bind never plans the thrust: the reach gate reads the frozen entry gap", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1300; // beyond thrust reach (200); the crossing still binds
      const ai = createAiState(seed);
      ai.cooldown = 10000;
      for (let tick = 0; tick < 200 && ai.bind === null; tick++) {
        const ib = tick === 0 ? "thrust" : aiDecide(d, 3, ai, TICK);
        tickDuel(d, tick === 9 ? "thrust" : null, ib);
      }
      if (ai.bind === null) throw new Error(`no bind at seed ${seed}`);
      expect(ai.bind.conversionPlan).not.toBe("thrust");
    }
  });
});

describe("the prompt teaches both conversions (disarming §4.2)", () => {
  test("in reach: both keys; too wide: the disarm alone", () => {
    const inReach = openingPromptText(true);
    expect(inReach).toContain("K");
    expect(inReach).toContain("I");
    const wide = openingPromptText(false);
    expect(wide).toContain("I");
    expect(wide).not.toContain("K kills");
  });
});
