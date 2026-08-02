import { describe, expect, test } from "vitest";
import { AI_REACTION_MS, aiDecide, createAiState } from "../src/combat/ai";
import { TICK } from "../src/combat/fighter";
import { createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { AiMode } from "../src/combat/ai";
import type { Duel } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

function runWithAi(d: Duel, mode: AiMode, ms: number, playerIntent: Intent | null = null) {
  const ai = createAiState();
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    const ib = aiDecide(d, mode, ai, TICK);
    evs.push(...tickDuel(d, playerIntent, ib));
    playerIntent = null;
  }
  return evs;
}

test("mode 0 never acts", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 60;
  runWithAi(d, 0, 2000);
  expect(d.f[1].state.kind).toBe("idle");
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("mode 1 parries after the reaction delay, never attacks or moves", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 80; // narrow for longsword
  const startX = d.f[1].x;
  const evs = runWithAi(d, 1, 3000, "cut");
  expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
  expect(d.f[1].x).toBe(startX);
  expect(d.log.filter((e) => e.side === 1 && e.kind === "attackStart")).toEqual([]);
});

test("mode 2 attacks when the player is in its measure, never advances", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 100; // narrow for rapier (reach 115)
  const startX = d.f[1].x;
  const evs = runWithAi(d, 2, 4000);
  expect(evs.some((e) => e.kind === "attackStart" && e.side === 1)).toBe(true);
  expect(d.f[1].x).toBe(startX);
});

test("mode 2 stays quiet out of measure", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier); // gap 300, out for both
  runWithAi(d, 2, 2000);
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("determinism: identical runs produce identical logs", () => {
  const script = (d: Duel) => {
    const ai = createAiState();
    for (let i = 0; i < Math.floor(5000 / TICK); i++) {
      const ia: Intent | null = i === 30 ? "advance" : i === 60 ? "thrust" : i === 200 ? "void" : null;
      tickDuel(d, ia, aiDecide(d, 2, ai, TICK));
    }
    return d.log.map((e) => `${e.time.toFixed(3)}|${e.side}|${e.kind}|${e.text}`);
  };
  const a = script(createDuel(WEAPONS.longsword, WEAPONS.rapier));
  const b = script(createDuel(WEAPONS.longsword, WEAPONS.rapier));
  expect(a).toEqual(b);
});
