import { describe, expect, test } from "vitest";
import { AI_REACTION_BASE_MS, AI_REACTION_JITTER_MS, PLAYER_REACTION_MS, aiDecide, createAiState } from "../src/combat/ai";
import { TICK, applyIntent, createFighter, guardEffective, lineOf, tickFighter } from "../src/combat/fighter";
import { createDuel, gapOf, parryMeetsAttack, tickDuel } from "../src/combat/engine";
import type { Duel } from "../src/combat/engine";
import { WEAPONS, parryableMs } from "../src/combat/weapons";
import { lineLabel } from "../src/render/draw";
import { renderHelpHtml } from "../src/ui/help";
import type { Fighter } from "../src/combat/fighter";
import type { AttackKind, WeaponProfile } from "../src/combat/types";

/**
 * TODO-2-attack-lines.md: a line is a pair (height, side). Height is a held
 * stance moved with the arrows over heightChangeMs; side is declared per
 * attack. A parry covers one complete snapshotted line - height and side
 * must both match - with the side inferred from the visible threat and its
 * coverage simulated, never instant.
 */

const ws = Object.values(WEAPONS);

describe("invariants", () => {
  test("standing on the wrong height must cost something: heightChangeMs > firmUpMs", () => {
    for (const w of ws) expect(w.heightChangeMs).toBeGreaterThan(w.firmUpMs);
  });
  // (The old sideChangeMs < rise invariant died with the rise itself:
  // under preparation-and-readiness the wrong-side press is decided by
  // guardFormationMs's max, and sideChangeMs may legitimately exceed the
  // firm-up.)

  test("the reaction matrix: from the right stance everything is answerable, from the wrong one everything except the rapier thrust", () => {
    // Pure arithmetic over WEAPONS, per TODO-2 §4.1: telegraphed attacks,
    // press at PLAYER_REACTION_MS, guard effective at max(press + rise,
    // react + heightChange). A retune that breaks the pattern fails here.
    for (const def of ws) {
      for (const atk of ws) {
        for (const kind of ["cut", "thrust"] as const) {
          const t = atk.attacks[kind];
          const deadline = t.windup + t.beat + parryableMs(t);
          const rightStance = PLAYER_REACTION_MS + def.firmUpMs;
          const wrongStance = PLAYER_REACTION_MS + def.heightChangeMs;
          expect(rightStance).toBeLessThanOrEqual(deadline); // always answerable in stance
          const answerable = wrongStance <= deadline;
          const isRapierThrust = atk.id === "rapier" && kind === "thrust";
          expect(answerable).toBe(!isRapierThrust);
        }
      }
    }
  });
});

describe("the stance track", () => {
  test("fighters start at low; an arrow moves the stance over heightChangeMs", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    expect(f.height).toBe("low");
    expect(applyIntent(f, "stanceUp")).toBe("accepted");
    expect(f.height).toBe("low"); // still the old value: in motion covers nothing
    expect(f.heightTo).toBe("high");
    for (let t = 0; t < WEAPONS.longsword.heightChangeMs + TICK; t += TICK) tickFighter(f, TICK);
    expect(f.height).toBe("high");
    expect(f.heightTo).toBe(null);
  });

  test("arrows are refused while committed - except where they mean something else", () => {
    const w = WEAPONS.longsword;
    // During a windup an arrow is not a stance change: it is the height
    // redirect (line-feints). The body still never re-aims a committed void.
    const a = createFighter(400, 1, w);
    applyIntent(a, "cut");
    expect(applyIntent(a, "stanceUp")).toBe("accepted");
    const as = a.state;
    if (as.kind !== "attack") throw new Error("unreachable");
    expect(as.redirected).toBe(true);
    const v = createFighter(400, 1, w);
    applyIntent(v, "void");
    expect(applyIntent(v, "stanceUp")).toBe("ignored");
    // A just-pressed, still-forming guard refuses the shift; the formed
    // guard's shift is line-feints' business.
    const g = createFighter(400, 1, w);
    applyIntent(g, "parry");
    expect(applyIntent(g, "stanceUp")).toBe("ignored");
    // But accepted while settling after a step.
    const h = createFighter(400, 1, w);
    applyIntent(h, "advance");
    for (let t = 0; t < w.stepDuration + TICK; t += TICK) tickFighter(h, TICK);
    expect(h.stepRecoveryMs).toBeGreaterThan(0);
    expect(applyIntent(h, "stanceUp")).toBe("accepted");
  });

  test("an attack snapshots its launch height; the stance moving later does not steer it", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "cut");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    expect(s.height).toBe("low");
    f.height = "high"; // future mechanics (a redirect) may move the fighter; the snapshot holds
    expect(lineOf(f).height).toBe("low");
  });
});

describe("a parry covers one complete snapshotted line", () => {
  /** Attacker mid-strike in the meetable half; defender's guard formed, covering `covered`. */
  function setup(
    atkHeight: "high" | "low", kind: AttackKind,
    covered: { height: "high" | "low"; side: "inside" | "outside" },
  ) {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    applyIntent(d.f[0], kind);
    const s = d.f[0].state;
    if (s.kind !== "attack") throw new Error("unreachable");
    s.phase = "strike";
    s.elapsedMs = s.timeline.parryableUntil; // arrived: extension is full reach
    s.height = atkHeight;
    d.f[1].height = covered.height;
    applyIntent(d.f[1], "parry", { targetSide: covered.side });
    const p = d.f[1].parry;
    if (p !== null) {
      p.phase = "held";
      p.phaseMs = 0;
      p.phaseDurationMs = 0;
      p.settledMs = 200; // formed well before any deadline the tests probe
    }
    return d;
  }

  // The exhaustive coverage table from the spec. A thrust is inside, so the
  // guard's covered side decides it even at the right height.
  test("same height, same side: parried", () => {
    const d = setup("high", "thrust", { height: "high", side: "inside" });
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(true);
  });
  test("same height, different side: hit", () => {
    const d = setup("high", "thrust", { height: "high", side: "outside" });
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
  });
  test("different height, same side: hit", () => {
    const d = setup("high", "thrust", { height: "low", side: "inside" });
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
  });
  test("different height, different side: hit", () => {
    const d = setup("high", "thrust", { height: "low", side: "outside" });
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(false);
  });
  test("the cut is outside: a guard covering outside meets it", () => {
    const d = setup("low", "cut", { height: "low", side: "outside" });
    expect(parryMeetsAttack(d.f[0], d.f[1], gapOf(d))).toBe(true);
  });
});

describe("the press infers the side; the engine supplies the visible attack", () => {
  test("a parry pressed against a visible cut targets outside; against a thrust, inside", () => {
    for (const [kind, side] of [["cut", "outside"], ["thrust", "inside"]] as const) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      tickDuel(d, kind, null); // the attack becomes visible (windup)
      tickDuel(d, null, "parry"); // the press infers from what is visible
      expect(d.f[1].parry?.targetLine.side).toBe(side);
    }
  });

  test("a cold press falls back to guardSide, initially inside, and persists", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    tickDuel(d, null, "parry");
    expect(d.f[1].parry?.targetLine.side).toBe("inside");
    // Cover outside once (visible cut), let the travel complete, drop the guard.
    const d2 = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d2.f[0].x = 1000;
    d2.f[1].x = 1500; // visible, but out of reach: the guard runs its full window
    tickDuel(d2, "cut", null);
    tickDuel(d2, null, "parry");
    // The press latched onto the visible (out-of-reach) cut. Under the
    // held guard the whiff only clears the latch - the guard stands until
    // released - so release explicitly, then wait out the recovery.
    for (let t = 0; t < 1000; t += TICK) tickDuel(d2, null, null);
    tickDuel(d2, null, "parryRelease");
    for (let t = 0; t < WEAPONS.longsword.parryRecoveryMs + 2 * TICK; t += TICK) tickDuel(d2, null, null);
    tickDuel(d2, null, "parry"); // next cold press covers where the guard last stood
    expect(d2.f[1].parry?.targetLine.side).toBe("outside");
  });

  test("side coverage is simulated: a fixture where the rotation outlasts the rise", () => {
    // Shipping weapons keep sideChangeMs < firmUpMs, so the rise gates a
    // press. The three-way max is still real logic: falsify it with a
    // fixture whose rotation is slower than its rise.
    const fixture: WeaponProfile = structuredClone(WEAPONS.longsword);
    fixture.firmUpMs = 100;
    fixture.sideChangeMs = 200;
    const f = createFighter(400, 1, fixture);
    applyIntent(f, "parry", { targetSide: "outside" }); // guardSide is inside: travel needed
    for (let t = 0; t < 100 + TICK; t += TICK) tickFighter(f, TICK);
    expect(f.parry?.visibleMs).toBeGreaterThanOrEqual(fixture.firmUpMs);
    expect(guardEffective(f)).toBe(false); // risen, but the blade is still crossing
    for (let t = 0; t < 100 + 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(guardEffective(f)).toBe(true);
    expect(f.guardSide).toBe("outside"); // the travel's completion moved the standing side
  });
});

describe("the max rule: rise and height travel do not add", () => {
  test("a parry pressed mid-transition is effective only at the arrival, and covers the new height", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(400, 1, w);
    applyIntent(f, "stanceUp");
    // Press the parry right at the transition's start: the rise (220)
    // completes well before the arrival (300), so the arrival gates it.
    const press = 2 * TICK;
    let t = 0;
    for (; t < press; t += TICK) tickFighter(f, TICK);
    applyIntent(f, "parry");
    // Just before the transition arrives: rise done, but still not effective.
    for (; t < w.heightChangeMs - 2 * TICK; t += TICK) tickFighter(f, TICK);
    if (f.parry === null) throw new Error("parry lost");
    expect(f.parry.visibleMs).toBeGreaterThanOrEqual(w.firmUpMs);
    expect(guardEffective(f)).toBe(false); // a stance in motion covers nothing
    for (; t < w.heightChangeMs + 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(guardEffective(f)).toBe(true);
    expect(f.height).toBe("high");
  });
});

describe("no inference from the attack kind", () => {
  test("a fixture weapon may declare an inside cut, and lineOf reports it", () => {
    const fixture: WeaponProfile = structuredClone(WEAPONS.longsword);
    fixture.attacks.cut.side = "inside";
    const f = createFighter(400, 1, fixture);
    applyIntent(f, "cut");
    expect(lineOf(f)).toEqual({ height: "low", side: "inside" });
  });

  test("the shipping declarations: thrust inside, cut outside", () => {
    for (const w of ws) {
      expect(w.attacks.thrust.side).toBe("inside");
      expect(w.attacks.cut.side).toBe("outside");
    }
  });
});

describe("AI heights", () => {
  /** The passive target dies to the first landed attack; a drill needs it standing back up. */
  function revive(d: Duel): void {
    d.over = false;
    d.winner = null;
    if (d.f[0].state.kind === "hitstun" || d.f[0].state.kind === "dead") {
      d.f[0].state = { kind: "ready" };
    }
  }

  test("mode 3 spreads attacks across both heights, never more than two in a row", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const ai = createAiState(0x5eed);
    const heights: string[] = [];
    for (let i = 0; i < 60_000 / TICK && heights.length < 12; i++) {
      const ib = aiDecide(d, 3, ai, TICK);
      // Keep the target passive and standing: stand in range, revive on death.
      d.f[0].x = d.f[1].x - 180;
      tickDuel(d, null, ib);
      revive(d);
      const s = d.f[1].state;
      if ((ib === "cut" || ib === "thrust") && s.kind === "attack") heights.push(s.height);
    }
    expect(heights.length).toBeGreaterThanOrEqual(6);
    expect(new Set(heights).size).toBe(2); // both heights occur
    for (let i = 2; i < heights.length; i++) {
      expect(heights[i] === heights[i - 1] && heights[i - 1] === heights[i - 2]).toBe(false);
    }
  });

  test("mode 3 never attacks while its stance is in motion", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const ai = createAiState(0xbeef);
    for (let i = 0; i < 30_000 / TICK; i++) {
      const ib = aiDecide(d, 3, ai, TICK);
      if (ib === "cut" || ib === "thrust") {
        expect(d.f[1].heightTo).toBe(null);
      }
      d.f[0].x = d.f[1].x - 180;
      tickDuel(d, null, ib);
      if (d.over) break;
    }
  });

  test("mode 2 drills all four lines in a fixed cycle", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const ai = createAiState(1);
    const lines: string[] = [];
    for (let i = 0; i < 120_000 / TICK && lines.length < 4; i++) {
      const ib = aiDecide(d, 2, ai, TICK);
      d.f[0].x = d.f[1].x - 180;
      tickDuel(d, null, ib);
      revive(d);
      const s = d.f[1].state;
      if ((ib === "cut" || ib === "thrust") && s.kind === "attack") {
        lines.push(`${s.height}-${d.f[1].weapon.attacks[s.attack].side}`);
      }
    }
    expect(new Set(lines).size).toBe(4); // high/low x inside/outside all drilled
  });

  test("mode 1 moves its stance to the incoming height, then parries the slow cut", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    // The player attacks from a moved stance: the dummy starts wrong.
    d.f[0].height = "high";
    const ai = createAiState(7);
    const evs = [];
    for (let i = 0; i * TICK < 2000; i++) {
      const ib = aiDecide(d, 1, ai, TICK);
      evs.push(...tickDuel(d, i === 0 ? "cut" : null, ib));
      if (d.over) break;
    }
    // Two longswords: the successful stop is a bind since sustained-bind,
    // its own logged outcome event - the dummy's answer landing.
    expect(evs.some((e) => e.kind === "parried")).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });

  test("mode 1 from the wrong stance answers the longsword thrust only on a sharp read", () => {
    // preparation-and-readiness: the wrong-height answer costs the stance
    // travel (300ms), so the folded thrust (deadline 630) is caught by a
    // floor read - stance at 200, arrived 500, pressed a tick later,
    // formed ~627: a deliberate 3ms squeak the deterministic engine
    // resolves the same way every run - and NOT by a slow read.
    const run = (reactionMs: number) => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      d.f[0].height = "high";
      const ai = createAiState(7);
      ai.reactionMs = reactionMs;
      const evs = [];
      for (let i = 0; i * TICK < 2000; i++) {
        const ib = aiDecide(d, 1, ai, TICK);
        evs.push(...tickDuel(d, i === 0 ? "thrust" : null, ib));
        if (d.over) break;
      }
      return evs;
    };
    const slow = run(AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[1]);
    expect(slow.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    const sharp = run(AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[0]);
    expect(sharp.some((e) => e.kind === "parried" || e.kind === "bind")).toBe(true);
  });
});

describe("presentation: row 3 names the line", () => {
  const f = (): Fighter => createFighter(400, 1, WEAPONS.longsword);

  test("an attack shows its line", () => {
    const a = f();
    applyIntent(a, "cut");
    expect(lineLabel(a)).toBe("LOW OUTSIDE (attack)");
  });

  test("a parry shows its complete covered line, both axes", () => {
    const a = f();
    applyIntent(a, "parry", { targetSide: "outside" });
    expect(lineLabel(a)).toBe("LOW OUTSIDE (parry)");
  });

  test("a stance shows itself, and its motion", () => {
    const a = f();
    expect(lineLabel(a)).toBe("READY: LOW INSIDE");
    applyIntent(a, "stanceUp");
    expect(lineLabel(a)).toBe("LOW to HIGH (stance)");
  });

  test("the full enum renders: a fixture at middle", () => {
    const a = f();
    a.height = "middle";
    expect(lineLabel(a)).toBe("READY: MIDDLE INSIDE");
  });

  test("the help panel cites heightChangeMs and the coverage rule", () => {
    const html = renderHelpHtml();
    for (const w of ws) expect(html).toContain(`${w.heightChangeMs}ms`);
    expect(html.toLowerCase()).toContain("height");
  });
});
