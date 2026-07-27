import { describe, it, expect } from "vitest";
import { NOTICE_RULES, noticeFor, type NoticeCtx } from "../src/notices";
import type { GameEvent, GameEventType } from "../src/game";

const ALL_TYPES: GameEventType[] = [
  "draw", "play", "reshuffle", "discard",
  "subjugated", "released", "incorporated", "reclaimed", "tribute",
  "victory", "defeat",
];

const NAMES: Record<string, string> = {
  livs: "Lower Daugava Livs",
  jersika: "Jersikans",
  latgale: "Latgalians",
};

const FACTION_BY_PLAYER: Record<number, string> = {
  1: "livs", 2: "jersika", 3: "latgale",
};

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionName: (id) => (id !== undefined ? NAMES[id] ?? id : ""),
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
};

const ev = (partial: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 3,
  playerId: 2,
  ...partial,
});

describe("NOTICE_RULES registry", () => {
  it("has an explicit rule for every event type", () => {
    for (const t of ALL_TYPES) {
      expect(NOTICE_RULES[t], `missing rule for ${t}`).toBeDefined();
    }
  });

  it("every silent rule carries a non-empty reason", () => {
    for (const t of ALL_TYPES) {
      const rule = NOTICE_RULES[t];
      if (rule.kind === "silent") {
        expect(rule.reason.length, `empty reason for ${t}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("noticeFor", () => {
  it("builds a subjugation notice when an AI subjugates the human", () => {
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Beneath the Yoke");
    expect(n!.what).toBe("Jersikans played Subjugate against Lower Daugava Livs.");
    expect(n!.flavor).toContain("Jersikans name the tribute");
    expect(n!.consequence).toContain("Two Pay Tribute cards were shuffled into your deck");
  });

  it("is null when the human subjugates someone else", () => {
    const n = noticeFor(
      ev({
        type: "subjugated", playerId: 1,
        targetFactionId: "jersika", overlordFactionId: "livs",
      }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("is null for AI-vs-AI subjugation", () => {
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "latgale", overlordFactionId: "jersika" }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("builds a release notice when another player frees the human", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
      ctx,
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("The Yoke Is Broken");
    expect(n!.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
    expect(n!.flavor).toBe(
      "The lord you paid is lord no longer. No riders come for tribute " +
      "this season - you stand free.",
    );
    expect(n!.consequence).toBe(
      "All Pay Tribute cards were removed from your deck, hand, and discard.",
    );
  });

  it("is null for a release that frees another faction", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "latgale" }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("is null for every silent event type", () => {
    const silent: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "discard", playerId: 1, cardId: "raid" }),
      ev({ type: "incorporated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "reclaimed", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", track: "might" }),
      ev({ type: "victory", playerId: 1 }),
      ev({ type: "defeat", targetFactionId: "livs", overlordFactionId: "jersika" }),
    ];
    for (const e of silent) {
      expect(noticeFor(e, ctx), `expected null for ${e.type}`).toBeNull();
    }
  });

  it("falls back to raw ids for unknown factions", () => {
    const n = noticeFor(
      ev({ type: "subjugated", playerId: 9, targetFactionId: "livs", overlordFactionId: "mystery" }),
      ctx,
    );
    expect(n).not.toBeNull();
    // playerId 9 has no faction: factionOf returns undefined, factionName("")
    expect(n!.what).toBe(" played Subjugate against Lower Daugava Livs.");
  });
});
