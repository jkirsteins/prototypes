import { expect, test } from "vitest";
import { aiDecide, createAiState } from "../src/combat/ai";
import { TICK } from "../src/combat/fighter";
import { createDuel, tickDuel } from "../src/combat/engine";
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
  d.f[0].x = d.f[1].x - 140;
  runWithAi(d, 0, 2000);
  expect(d.f[1].state.kind).toBe("idle");
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
  // narrow measure (220 <= 240), cooldown ready -> strike
  d.f[0].x = d.f[1].x - 220;
  expect(aiDecide(d, 3, ai, TICK)).toBe("thrust");
  // narrow measure, cooldown running -> back off
  expect(ai.cooldown).toBeGreaterThan(0);
  expect(aiDecide(d, 3, ai, TICK)).toBe("retreat");
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
