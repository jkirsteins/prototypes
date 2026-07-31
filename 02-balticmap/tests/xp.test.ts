import { describe, it, expect } from "vitest";
import {
  TURNIP_MILESTONES_BASE, XP_TABLE, levelForXp, runTurnips, runXp,
  turnipMilestone, turnipPacksEarned, xpForEvent, xpThresholdForLevel,
} from "../src/xp";
import type { GameEvent } from "../src/game";

const ev = (e: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 1, playerId: 1, ...e,
});

describe("xpForEvent", () => {
  it("gives every event type a decided value", () => {
    // The Record<GameEventType, number> type is the real guard - this only
    // proves the table is populated with finite numbers.
    for (const v of Object.values(XP_TABLE)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("pays the base value for an event that moves no counter", () => {
    expect(xpForEvent(ev({ type: "play", cardId: "grow-crops" }))).toBe(1);
    expect(xpForEvent(ev({ type: "settled" }))).toBe(3);
  });

  it("scales with how far a tracked event moved the counter", () => {
    // A 4-point Raid is worth more than a 1-point one: base 1 + amount.
    expect(xpForEvent(ev({ type: "play", cardId: "raid", track: "might", amount: 4 }))).toBe(5);
    expect(xpForEvent(ev({ type: "play", cardId: "raid", track: "might", amount: 1 }))).toBe(2);
  });

  it("pays nothing for forced or automatic events", () => {
    expect(xpForEvent(ev({ type: "tribute", track: "might", amount: 1 }))).toBe(0);
    expect(xpForEvent(ev({ type: "garrisoned" }))).toBe(0);
    expect(xpForEvent(ev({ type: "draw", cardId: "raid" }))).toBe(0);
    expect(xpForEvent(ev({ type: "discard", cardId: "raid" }))).toBe(0);
  });
});

describe("runXp / runTurnips", () => {
  it("counts only the human's events", () => {
    const log: GameEvent[] = [
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "raid", playerId: 2, track: "might", amount: 9 }),
      ev({ type: "subjugated" }),
    ];
    expect(runXp(log)).toBe(1 + 4);
  });

  it("counts the human's turnips and nobody else's", () => {
    const log: GameEvent[] = [
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "grow-crops", playerId: 3 }),
      ev({ type: "draw", cardId: "grow-crops" }),
    ];
    expect(runTurnips(log)).toBe(2);
  });
});

describe("level curve", () => {
  it("uses triangular thresholds", () => {
    expect(xpThresholdForLevel(1)).toBe(25);
    expect(xpThresholdForLevel(2)).toBe(75);
    expect(xpThresholdForLevel(3)).toBe(150);
    expect(xpThresholdForLevel(4)).toBe(250);
    expect(xpThresholdForLevel(5)).toBe(375);
  });

  it("levels on crossing a threshold, not before", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(24)).toBe(0);
    expect(levelForXp(25)).toBe(1);
    expect(levelForXp(74)).toBe(1);
    expect(levelForXp(75)).toBe(2);
    expect(levelForXp(10_000)).toBe(27);
  });
});

describe("turnip milestones", () => {
  it("lists the explicit milestones, then doubles forever", () => {
    expect(TURNIP_MILESTONES_BASE).toEqual([10, 100, 1000, 5000, 10000]);
    expect(turnipMilestone(0)).toBe(10);
    expect(turnipMilestone(4)).toBe(10_000);
    expect(turnipMilestone(5)).toBe(20_000);
    expect(turnipMilestone(6)).toBe(40_000);
    expect(turnipMilestone(7)).toBe(80_000);
  });

  it("earns one pack per milestone crossed", () => {
    expect(turnipPacksEarned(0)).toBe(0);
    expect(turnipPacksEarned(9)).toBe(0);
    expect(turnipPacksEarned(10)).toBe(1);
    expect(turnipPacksEarned(99)).toBe(1);
    expect(turnipPacksEarned(100)).toBe(2);
    expect(turnipPacksEarned(10_000)).toBe(5);
    expect(turnipPacksEarned(20_000)).toBe(6);
  });
});
