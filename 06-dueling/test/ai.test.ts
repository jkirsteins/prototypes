import { describe, expect, test } from "vitest";
import {
  AI_REACTION_BASE_MS, AI_REACTION_JITTER_MS, DRILL_INTERVAL_MS, DUELIST_JITTER,
  aiDecide, createAiState, drawReaction, duelistCooldown,
} from "../src/combat/ai";
import { TICK, applyIntent, tickFighter } from "../src/combat/fighter";
import { createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { AiMode } from "../src/combat/ai";
import type { Duel } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

function runWithAi(d: Duel, mode: AiMode, ms: number, playerIntent: Intent | null = null, seed?: number) {
  const ai = createAiState(seed);
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    const ib = aiDecide(d, mode, ai, TICK);
    evs.push(...tickDuel(d, playerIntent, ib));
    playerIntent = null;
  }
  return evs;
}

describe("the reaction is a seeded draw, not a constant", () => {
  const lo = AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[0];
  const hi = AI_REACTION_BASE_MS + AI_REACTION_JITTER_MS[1];

  test("every draw lands inside the declared band, and the band is 200-420", () => {
    expect(lo).toBe(200);
    expect(hi).toBe(420);
    const ai = createAiState(0xfeed);
    const draws = Array.from({ length: 200 }, () => drawReaction(ai));
    for (const r of draws) {
      expect(r).toBeGreaterThanOrEqual(lo);
      expect(r).toBeLessThanOrEqual(hi);
    }
    expect(new Set(draws.map((r) => Math.round(r))).size).toBeGreaterThan(20); // jitter is real
  });

  test("the same seed draws the same reactions; a different seed differs", () => {
    const a = createAiState(11);
    const b = createAiState(11);
    const c = createAiState(12);
    const sa = Array.from({ length: 10 }, () => drawReaction(a));
    const sb = Array.from({ length: 10 }, () => drawReaction(b));
    const sc = Array.from({ length: 10 }, () => drawReaction(c));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  test("mode 1 presses only after its drawn reaction - never inside 200ms, varying by seed", () => {
    const delays = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
      d.f[0].x = d.f[1].x - 160;
      const evs = runWithAi(d, 1, 3000, "cut", seed);
      const start = evs.find((e) => e.kind === "attackStart" && e.side === 0);
      const press = evs.find((e) => e.kind === "parry" && e.side === 1);
      if (!start || !press) throw new Error("no exchange");
      const delay = press.time - start.time;
      expect(delay).toBeGreaterThanOrEqual(lo);
      expect(delay).toBeLessThanOrEqual(hi + 2 * TICK);
      delays.add(Math.round(delay));
    }
    expect(delays.size).toBeGreaterThan(1); // the jitter reaches behavior
  });
});

test("mode 0 never acts", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 140;
  runWithAi(d, 0, 2000);
  expect(d.f[1].state.kind).toBe("ready");
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("mode 1 parries after the reaction delay, never attacks or moves", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 160; // narrow for longsword
  const startX = d.f[1].x;
  const evs = runWithAi(d, 1, 3000, "cut");
  expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
  expect(d.f[1].x).toBe(startX);
  expect(d.log.filter((e) => e.side === 1 && e.kind === "attackStart")).toEqual([]);
});

test("mode 1 ignores attacks launched from out of measure", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 260; // beyond longsword reach 200: the cut cannot land
  const evs = runWithAi(d, 1, 3000, "cut");
  expect(evs.some((e) => e.kind === "parry" && e.side === 1)).toBe(false);
  expect(evs.some((e) => e.kind === "whiff" && e.side === 0)).toBe(true);
});

test("mode 2 attacks when the player is in its measure, never advances", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 220; // narrow for rapier (reach 240)
  const startX = d.f[1].x;
  const evs = runWithAi(d, 2, 4000);
  expect(evs.some((e) => e.kind === "attackStart" && e.side === 1)).toBe(true);
  expect(d.f[1].x).toBe(startX);
});

test("mode 2 stays quiet out of measure", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier); // gap 600, out for both
  runWithAi(d, 2, 2000);
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("mode 3 decisions: advance to narrow, attack off cooldown, retreat on it", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier); // side 1 is the rapier
  const ai = createAiState();
  // gap 600: out of measure -> approach
  expect(aiDecide(d, 3, ai, TICK)).toBe("advance");
  // wide measure (240 < 270 <= 290): still approaching
  d.f[0].x = d.f[1].x - 270;
  expect(aiDecide(d, 3, ai, TICK)).toBe("advance");
  // narrow measure (220 <= 240), cooldown ready -> commit to a strike. The
  // drawn height may differ from the stance, in which case the visible
  // tell is a stance move first; follow the plan through to the attack.
  d.f[0].x = d.f[1].x - 220;
  let intent = aiDecide(d, 3, ai, TICK);
  expect(ai.cooldown).toBeGreaterThan(0); // the decision burned the cooldown
  for (let i = 0; i < 60 && intent !== "thrust" && intent !== "cut"; i++) {
    if (intent !== null) applyIntent(d.f[1], intent);
    tickFighter(d.f[1], TICK);
    intent = aiDecide(d, 3, ai, TICK);
  }
  expect(["thrust", "cut"]).toContain(intent);
  // narrow measure, cooldown running -> back off
  expect(aiDecide(d, 3, ai, TICK)).toBe("retreat");
});

test("mode 3 jitter: waits vary within the declared band, never below the floor", () => {
  const floor = duelistCooldown(WEAPONS.rapier);
  const waits = new Set<number>();
  const attacks = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const ai = createAiState(seed);
    d.f[0].x = d.f[1].x - 220; // narrow for the rapier
    // The first decision may be a stance move toward the planned height;
    // the planned attack is then still pending on the AiState.
    const chosen = aiDecide(d, 3, ai, TICK);
    if (chosen === "cut" || chosen === "thrust") attacks.add(chosen);
    else if (ai.plan !== null) attacks.add(ai.plan.attack);
    waits.add(ai.cooldown);
    expect(ai.cooldown).toBeGreaterThanOrEqual(floor);
    expect(ai.cooldown).toBeLessThanOrEqual(floor * (1 + DUELIST_JITTER));
  }
  expect(waits.size).toBeGreaterThan(5); // genuinely varying, not a constant
  expect(attacks).toEqual(new Set(["thrust", "cut"])); // both attacks reachable
});

test("mode 2 keeps its fixed beat and strict alternation despite the shared rng", () => {
  const runs = [1, 2, 3].map((seed) => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    const ai = createAiState(seed);
    d.f[0].x = d.f[1].x - 220;
    const picks: Array<Intent | null> = [];
    for (let i = 0; i < Math.floor(9000 / TICK); i++) {
      const intent = aiDecide(d, 2, ai, TICK);
      if (intent !== null) picks.push(intent);
      tickDuel(d, null, null);
      if (d.over) break;
    }
    return picks;
  });
  // Drill dummy is seed-independent: same order, same beat, every time.
  expect(runs[1]).toEqual(runs[0]);
  expect(runs[2]).toEqual(runs[0]);
  expect(runs[0].slice(0, 2)).toEqual(["thrust", "cut"]);
});

test("mode 3 cycle floor outlasts every weapon's worst-case thrust commitment", () => {
  // If this fails, the duelist's retreat can never fire and the
  // approach-strike-retire pulse silently disappears.
  for (const w of Object.values(WEAPONS)) {
    const t = w.attacks.thrust;
    const whiffCommit = t.windup + t.beat + t.strike + t.recovery * w.whiffRecoveryFactor;
    expect(duelistCooldown(w)).toBeGreaterThan(whiffCommit);
  }
});

test("drill interval exceeds every attack's whiff commitment (steady onset beat)", () => {
  // The mode-2 metronome only keeps time if no attack is still committed
  // when the next beat arrives; otherwise onsets silently drift.
  for (const w of Object.values(WEAPONS)) {
    for (const t of Object.values(w.attacks)) {
      const whiffCommit = t.windup + t.beat + t.strike + t.recovery * w.whiffRecoveryFactor;
      expect(DRILL_INTERVAL_MS).toBeGreaterThan(whiffCommit);
    }
  }
});

test("mode 3 crosses the gap and kills an idle opponent", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier); // gap 600, out for both
  const startX = d.f[1].x;
  const evs = runWithAi(d, 3, 8000);
  expect(d.f[1].x).not.toBe(startX); // it moved
  expect(evs.some((e) => e.kind === "attackStart" && e.side === 1)).toBe(true);
  expect(d.over).toBe(true);
  expect(d.winner).toBe(1);
});

describe("reproducibility", () => {
  const script = (d: Duel, mode: AiMode, seed: number) => {
    const ai = createAiState(seed);
    for (let i = 0; i < Math.floor(9000 / TICK); i++) {
      const ia: Intent | null = i === 30 ? "advance" : i === 60 ? "thrust" : i === 200 ? "void" : null;
      tickDuel(d, ia, aiDecide(d, mode, ai, TICK));
    }
    return d.log.map((e) => `${e.time.toFixed(3)}|${e.side}|${e.kind}|${e.text}`);
  };
  const run = (mode: AiMode, seed: number) =>
    script(createDuel(WEAPONS.longsword, WEAPONS.rapier), mode, seed);

  test("same seed and inputs replay a fight exactly", () => {
    expect(run(3, 12345)).toEqual(run(3, 12345));
    expect(run(2, 7)).toEqual(run(2, 7));
  });

  test("different seeds give the duelist a different fight", () => {
    // Jitter has to actually change something, or it is decoration.
    const seeds = [1, 2, 3, 4, 5, 6].map((s) => run(3, s).join("\n"));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});
