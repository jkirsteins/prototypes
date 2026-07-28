import { describe, it, expect, beforeEach } from "vitest";
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

let leadsTable: Record<string, { might: number; status: number }> = {};
let grip = 2;

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionName: (id) => (id !== undefined ? NAMES[id] ?? id : ""),
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
  leads: (other) => leadsTable[other] ?? { might: 0, status: 0 },
  subjugationGrip: () => grip,
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
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
  });

  it("builds a subjugation notice when an AI subjugates the human", () => {
    leadsTable = { jersika: { might: -2, status: 1 } };
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Beneath the Yoke");
    expect(n!.what).toBe("Jersikans played Subjugate against Lower Daugava Livs.");
    expect(n!.flavor).toBe(
      "Armed riders gather before your halls. Your elders count spears, " +
      "then bow their heads. The victors name the tribute; you will pay it.",
    );
    expect(n!.consequence).toContain("Two Pay Tribute cards were shuffled into your deck");
    expect(n!.details).toEqual([
      "You now owe fealty to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - you lead by 1.",
    ]);
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
    leadsTable = {};
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
    expect(n!.details).toEqual([]);
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
      ev({ type: "play", playerId: 1, cardId: "raid", targetFactionId: "livs" }),
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

  it("first subjugation: fealty line and standing vs the new overlord", () => {
    leadsTable = { jersika: { might: -2, status: 1 } };
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "You now owe fealty to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - you lead by 1.",
    ]);
  });

  it("poach: allegiance shift and standing vs both lords", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 },
      latgale: { might: 0, status: -1 },
    };
    const n = noticeFor(
      ev({
        type: "subjugated", targetFactionId: "livs",
        overlordFactionId: "jersika", formerOverlordFactionId: "latgale",
      }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "Your allegiance shifts from Latgalians to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "Standing vs Latgalians: Might - even; Status - they lead by 1.",
    ]);
  });

  it("released names the fallen lord when the event carries it", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    )!;
    expect(n.what).toBe("The fall of Jersikans to Latgalians releases you from vassalage.");
  });

  it("released falls back when the lord field is absent", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
  });

  it("raid against the human raises a modal with standing and threat warning", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.title).toBe("Raided");
    expect(n.what).toBe("Jersikans played Raid against Lower Daugava Livs.");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "A lead of 2 is enough to subjugate.",
    ]);
  });

  it("marriage against the human raises a modal without warning below threshold", () => {
    leadsTable = { jersika: { might: 0, status: -1 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "shrewd-marriage", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.title).toBe("A Shrewd Marriage");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - even; Status - they lead by 1.",
    ]);
  });

  it("scaled grip: no warning when the lead is below a bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
    ]);
  });

  it("scaled grip: warning text reflects the bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -4, status: 0 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 4; Status - even.",
      "A lead of 4 is enough to subjugate.",
    ]);
  });

  it("play modals do not fire for own plays, AI-vs-AI, or other cards", () => {
    for (const e of [
      ev({ type: "play", playerId: 1, cardId: "raid", targetFactionId: "jersika" }),
      ev({ type: "play", cardId: "raid", targetFactionId: "latgale" }),
      ev({ type: "play", cardId: "subjugate", targetFactionId: "livs" }),
      ev({ type: "play", cardId: "fortify" }),
      ev({ type: "play", cardId: "grow-crops" }),
    ]) {
      expect(noticeFor(e, ctx), `expected null for ${e.cardId}`).toBeNull();
    }
  });
});
