import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { aiDecide, createAiState } from "../src/combat/ai";
import { ARENA, createDuel, parryMeetsAttack, tickDuel } from "../src/combat/engine";
import { TICK, applyIntent, createFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";
import { lineLabel } from "../src/render/draw";
import type { DuelEvent } from "../src/combat/engine";
import type { AttackKind, Intent, WeaponId } from "../src/combat/types";

/**
 * preparation-and-readiness: one simulation for both fighters, and guard
 * formation from the resting line. The acceptance criterion is the
 * three-layer thrust parry-ability litmus (§7); the recomputed matrix
 * itself lives in duelist-defence.test.ts.
 */

describe("the doctrine: timeline symmetry (§1)", () => {
  test("same weapon, same attack: byte-identical timelines whichever side throws it", () => {
    for (const w of ["longsword", "rapier"] as const) {
      for (const kind of ["cut", "thrust"] as const) {
        const a = createFighter(1000, 1, WEAPONS[w]);
        const b = createFighter(1180, -1, WEAPONS[w]);
        applyIntent(a, kind);
        applyIntent(b, kind);
        if (a.state.kind !== "attack" || b.state.kind !== "attack") throw new Error("unreachable");
        expect(a.state.timeline).toEqual(b.state.timeline);
      }
    }
  });

  test("controller swap: same attack and parry intent ticks, same contact outcome and times", () => {
    // Both sides scripted, no AI policy in the loop - this compares the
    // physics alone. Attack at tick 0, parry pressed at tick 18 (300ms),
    // ownership swapped between runs: the outcome events must mirror
    // exactly, or parry-ability depends on who holds the controller.
    for (const w of ["longsword", "rapier"] as const) {
      for (const kind of ["cut", "thrust"] as const) {
        const run = (attacker: 0 | 1): Array<{ kind: string; time: number }> => {
          const d = createDuel(WEAPONS[w], WEAPONS[w]);
          d.f[0].x = 1000;
          d.f[1].x = 1180;
          const out: Array<{ kind: string; time: number }> = [];
          for (let tick = 0; tick < 200; tick++) {
            const atkIntent: Intent | null = tick === 0 ? kind : null;
            const defIntent: Intent | null = tick === 18 ? "parry" : null;
            const [ia, ib] = attacker === 0 ? [atkIntent, defIntent] : [defIntent, atkIntent];
            for (const e of tickDuel(d, ia, ib)) {
              if (e.kind === "parried" || e.kind === "hit" || e.kind === "whiff" || e.kind === "met" || e.kind === "bind") {
                out.push({ kind: e.kind, time: e.time });
              }
            }
            if (d.over) break;
          }
          return out;
        };
        expect(run(0), `${w} ${kind}`).toEqual(run(1));
        expect(run(0).length, `${w} ${kind} produced contact`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the litmus, layer 1: physics via mode 1 (§7)", () => {
  function dummyExchange(
    atk: WeaponId,
    def: WeaponId,
    kind: AttackKind,
    seed: number,
    defHeight: "low" | "high" = "low",
  ): { evs: DuelEvent[]; reaction: number } {
    const d = createDuel(WEAPONS[atk], WEAPONS[def]);
    d.f[0].x = 1000;
    d.f[1].x = 1000 + Math.min(WEAPONS[atk].reach, WEAPONS[def].reach) - 20;
    d.f[1].height = defHeight;
    const ai = createAiState(seed);
    const reaction = ai.reactionMs;
    const t = WEAPONS[atk].attacks[kind];
    const evs: DuelEvent[] = [];
    for (let i = 0; i * TICK < t.windup + t.beat + t.strike + 5 * TICK; i++) {
      const ib = aiDecide(d, 1, ai, TICK);
      evs.push(...tickDuel(d, i === 0 ? kind : null, ib));
      if (d.over) break;
    }
    return { evs, reaction };
  }
  const met = (evs: DuelEvent[]) => evs.some((e) => e.kind === "parried" || e.kind === "bind");

  test("the longsword same-line thrust is parried across the whole reaction band", () => {
    // Deadline 630 vs worst cost 420 + 110: every draw fits.
    for (let seed = 1; seed <= 12; seed++) {
      expect(met(dummyExchange("longsword", "longsword", "thrust", seed).evs)).toBe(true);
      expect(met(dummyExchange("longsword", "rapier", "thrust", seed).evs)).toBe(true);
    }
  });

  test("longsword defender vs same-line rapier thrust: parried up to a 400ms draw, missed above", () => {
    // 510 - 110 = 400. The engine presses on the first tick AFTER the
    // drawn reaction, so draws inside one tick of the cutoff go either
    // way by quantization - the strip [385, 400] is left unasserted.
    let parried = 0;
    let hit = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { evs, reaction } = dummyExchange("rapier", "longsword", "thrust", seed);
      if (reaction <= 385) {
        expect(met(evs), `seed ${seed} reaction ${reaction}`).toBe(true);
        parried++;
      } else if (reaction > 400) {
        expect(met(evs), `seed ${seed} reaction ${reaction}`).toBe(false);
        hit++;
      }
    }
    expect(parried).toBeGreaterThan(0);
    expect(hit).toBeGreaterThan(0); // both sides of the band edge exercised
  });

  test("rapier defender vs same-line rapier thrust: parried except where quantization eats the 5ms ceiling margin", () => {
    // Model: 510 - 85 = 425 >= every draw, so the matrix says P across
    // the band (P5 at the ceiling). Engine: the press lands on the first
    // TICK after the draw, so the last press that forms in time is
    // 416.7ms - draws in (416.7, 420] miss, a strip too thin to hit by
    // seed luck. Seeded draws below it must all parry; the strip itself
    // is pinned by construction.
    for (let seed = 1; seed <= 30; seed++) {
      const { evs, reaction } = dummyExchange("rapier", "rapier", "thrust", seed);
      if (reaction <= 415) {
        expect(met(evs), `seed ${seed} reaction ${reaction}`).toBe(true);
      }
    }
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1000 + WEAPONS.rapier.reach - 20;
    const ai = createAiState(1);
    ai.reactionMs = 419; // inside the strip: press at 433, formed 518 > 510
    const evs: DuelEvent[] = [];
    const t = WEAPONS.rapier.attacks.thrust;
    for (let i = 0; i * TICK < t.windup + t.beat + t.strike + 5 * TICK; i++) {
      const ib = aiDecide(d, 1, ai, TICK);
      evs.push(...tickDuel(d, i === 0 ? "thrust" : null, ib));
      if (d.over) break;
    }
    expect(met(evs)).toBe(false);
  });

  test("the wrong-height rapier thrust is never met by a reactively formed guard", () => {
    // The matrix's floor entry says P10 - but mode 1 must issue the
    // stance intent one tick before the press can aim the travel, and
    // that tick eats the 10ms margin: the engine's sequential reality is
    // strictly harsher than the concurrent model, never kinder.
    for (let seed = 1; seed <= 20; seed++) {
      expect(met(dummyExchange("rapier", "longsword", "thrust", seed, "high").evs)).toBe(false);
    }
  });
});

describe("the litmus, layer 3: the policy band (§7)", () => {
  test("a same-line thrust against a ready duelist ends on steel in a wide band - nonzero, not dominant", () => {
    // Drift alarm, not a tuning lock: the physics must reach live play
    // through the menu (guard weight 0.40) without freezing the weights.
    let steel = 0;
    const total = 80;
    for (let seed = 1; seed <= total; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[1].x = ARENA.right; // cornered: the retire step cannot open the gap
      d.f[0].x = ARENA.right - 160;
      const ai = createAiState(seed);
      ai.cooldown = 5000;
      let ia: Intent | null = "thrust";
      for (let t = 0; t < 2000; t += TICK) {
        const ib = aiDecide(d, 3, ai, TICK);
        const evs = tickDuel(d, ia, ib);
        if (evs.some((e) => e.kind === "parried" || e.kind === "bind")) {
          steel++;
          break;
        }
        ia = null;
        if (d.over) break;
      }
    }
    expect(steel / total).toBeGreaterThan(0.15);
    expect(steel / total).toBeLessThan(0.7);
  });
});

describe("the boundary is deterministic (§4)", () => {
  test("a guard formed exactly at the deadline instant still meets the blade", () => {
    // The engine's own convention at a zero margin, pinned: contact
    // demands settledMs >= the attacker's overshoot past parryableUntil,
    // so EQUALITY meets. The matrix's P0 entry and the engine agree.
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    applyIntent(d.f[0], "cut");
    const s = d.f[0].state;
    if (s.kind !== "attack") throw new Error("unreachable");
    s.phase = "strike";
    s.elapsedMs = s.timeline.parryableUntil + 10; // one overshot read
    applyIntent(d.f[1], "parry", { targetSide: "outside" });
    const p = d.f[1].parry;
    if (p === null) throw new Error("no parry");
    p.phase = "held";
    p.phaseDurationMs = 0;
    p.settledMs = 10; // formed EXACTLY at the deadline instant
    expect(parryMeetsAttack(d.f[0], d.f[1], 180)).toBe(true);
    p.settledMs = 9.9; // formed a breath after it
    expect(parryMeetsAttack(d.f[0], d.f[1], 180)).toBe(false);
  });
});

describe("the resting line is readable (§6)", () => {
  test("row 3 shows READY with height AND side whenever no guard is up", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    expect(lineLabel(f)).toBe("READY: LOW INSIDE");
    f.guardSide = "outside";
    expect(lineLabel(f)).toBe("READY: LOW OUTSIDE");
    f.height = "high";
    expect(lineLabel(f)).toBe("READY: HIGH OUTSIDE");
    applyIntent(f, "parry");
    expect(lineLabel(f)).not.toContain("READY"); // a guard is its own label
  });
});

describe("the rename sweep (§3, §7)", () => {
  test("the old rise property is gone from src and tests", () => {
    const gone = ["parryRise", "Ms"].join(""); // split so this file passes its own sweep
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.name.endsWith(".ts")) {
          expect(readFileSync(full, "utf8").includes(gone), full).toBe(false);
        }
      }
    };
    scan(join(__dirname, "../src"));
    scan(__dirname);
  });
});
