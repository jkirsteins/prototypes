import { describe, it, expect, beforeEach } from "vitest";
import { NOTICE_RULES, buildNotices, type NoticeCtx } from "../src/notices";
import type { GameEvent, GameEventType } from "../src/game";

// Hand-maintained, and it was already missing "unified" before "settled" was
// added: the registry test only guards the types listed here, so anything left
// off is exactly what goes unguarded.
const ALL_TYPES: GameEventType[] = [
  "draw", "play", "reshuffle", "discard",
  "subjugated", "released", "incorporated", "reclaimed", "tribute",
  "settled", "victory", "defeat", "unified",
];

const NAMES: Record<string, string> = {
  livs: "Lower Daugava Livs",
  jersika: "Jersikans",
  latgale: "Latgalians",
  curonia: "Curonians",
};

const FACTION_BY_PLAYER: Record<number, string> = {
  1: "livs", 2: "jersika", 3: "latgale", 4: "curonia",
};

let leadsTable: Record<string, { might: number; status: number }> = {};
let grip = 2;
let allianceExpiryTable: Record<string, number | undefined> = {};
// Rival-specific subjugation bar. Defaults to `grip` for any rival not
// listed here, matching what the real `subjugationRequirement` returns for
// an ordinary pair with no guard in play - this keeps every existing test's
// meaning intact. Tests that need a guarded (null) pair override an entry.
let subjugationBarTable: Record<string, number | null> = {};

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionName: (id) => (id !== undefined ? NAMES[id] ?? id : ""),
  factionNameWithArticle: (id) => (id !== undefined ? `the ${NAMES[id] ?? id}` : ""),
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
  leads: (other) => leadsTable[other] ?? { might: 0, status: 0 },
  subjugationGrip: () => grip,
  subjugationBarAgainstYou: (other) =>
    other in subjugationBarTable ? subjugationBarTable[other] : grip,
  allianceExpiry: (other) => allianceExpiryTable[other],
};

const ev = (partial: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 3,
  playerId: 2,
  ...partial,
});

/** Build notices from a single event and return the one result (or null). */
const oneNotice = (e: GameEvent) => buildNotices([e], ctx)[0] ?? null;

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

describe("a founded settlement", () => {
  it("stays silent: it moves a bar the map already shows, never a lead", () => {
    const rule = NOTICE_RULES.settled;
    expect(rule.kind).toBe("silent");
    expect(
      buildNotices(
        [{ turn: 3, playerId: 2, type: "settled", targetFactionId: "livs" }],
        ctx,
      ),
    ).toEqual([]);
  });
});

describe("buildNotices: single-event scenarios", () => {
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
    allianceExpiryTable = {};
    subjugationBarTable = {};
  });

  it("builds a subjugation notice when an AI subjugates the human", () => {
    leadsTable = { jersika: { might: -2, status: 1 } };
    const n = oneNotice(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Beneath the Yoke");
    expect(n!.what).toBe("Jersikans played Subjugate against Lower Daugava Livs.");
    expect(n!.consequence).toContain("Two Pay Tribute cards were shuffled into your deck");
    expect(n!.details).toEqual([
      "You now owe fealty to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - you lead by 1.",
    ]);
  });

  it("is null when the human subjugates someone else", () => {
    const n = oneNotice(
      ev({
        type: "subjugated", playerId: 1,
        targetFactionId: "jersika", overlordFactionId: "livs",
      }),
    );
    expect(n).toBeNull();
  });

  it("is null for AI-vs-AI subjugation", () => {
    const n = oneNotice(
      ev({ type: "subjugated", targetFactionId: "latgale", overlordFactionId: "jersika" }),
    );
    expect(n).toBeNull();
  });

  it("builds a release notice when another player frees the human", () => {
    leadsTable = {};
    const n = oneNotice(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("The Yoke Is Broken");
    expect(n!.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
    expect(n!.consequence).toBe(
      "All Pay Tribute cards were removed from your deck, hand, and discard.",
    );
    expect(n!.details).toEqual([]);
  });

  it("is null for a release that frees another faction", () => {
    const n = oneNotice(
      ev({ type: "released", playerId: 3, targetFactionId: "latgale" }),
    );
    expect(n).toBeNull();
  });

  it("warns when a rival tears a vassal away from you", () => {
    leadsTable = { latgale: { might: -1, status: 0 } };
    const n = oneNotice(
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
      }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("A Vassal Torn Away");
    expect(n!.what).toBe("Latgalians played Subjugate against your vassal Curonians.");
    expect(n!.details).toContain("Fealty passes from you to Latgalians.");
    expect(n!.details).toContain("They gain 1 Might and 1 Status against you.");
  });

  it("warns when a vassal revolts, including what the revolt cost you", () => {
    const n = oneNotice(
      ev({
        type: "reclaimed", playerId: 4, cardId: "revolt",
        targetFactionId: "curonia", overlordFactionId: "livs",
      }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("A Vassal Breaks Free");
    expect(n!.what).toBe("Curonians played Revolt and cast off your overlordship.");
    expect(n!.details).toContain("They gain 1 Might and 1 Status against you.");
  });

  it("warns of a doubled gain when the revolting vassal held a reading", () => {
    const n = oneNotice(
      ev({
        type: "reclaimed", playerId: 4, cardId: "revolt", doubled: true,
        targetFactionId: "curonia", overlordFactionId: "livs",
      }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("A Vassal Breaks Free");
    expect(n!.details).toContain("They gain 2 Might and 2 Status against you.");
    expect(n!.details).not.toContain("They gain 1 Might and 1 Status against you.");
  });

  it("stays silent when the human is the one reclaiming", () => {
    expect(
      oneNotice(
        ev({
          type: "reclaimed", playerId: 1, cardId: "revolt",
          targetFactionId: "livs", overlordFactionId: "jersika",
        }),
      ),
    ).toBeNull();
  });

  it("warns when your own fall scatters your vassals", () => {
    const n = oneNotice(
      ev({
        type: "released", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "livs",
      }),
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Your Vassals Scatter");
    expect(n!.what).toBe("Your own subjugation released Curonians from your service.");
  });

  it("keeps your own subjugation separate from a vassal poached in the same round", () => {
    leadsTable = {};
    const notices = buildNotices(
      [
        ev({ type: "subjugated", playerId: 2, targetFactionId: "livs", overlordFactionId: "jersika" }),
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
      ],
      ctx,
    );
    expect(notices.map((n) => n.title)).toEqual([
      "Beneath the Yoke", "A Vassal Torn Away",
    ]);
  });

  it("collapses several vassals lost in one round into one notice", () => {
    const notices = buildNotices(
      [
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "jersika",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
      ],
      ctx,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe("A Vassal Torn Away");
    expect(notices[0].details).toContain("Latgalians took Curonians from you");
    expect(notices[0].details).toContain("Latgalians took Jersikans from you");
  });

  it("is empty for every silent event type", () => {
    const silent: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "play", playerId: 1, cardId: "raid", targetFactionId: "livs" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "discard", playerId: 1, cardId: "raid" }),
      ev({ type: "incorporated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "reclaimed", playerId: 1, cardId: "revolt", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", track: "might" }),
      ev({ type: "victory", playerId: 1 }),
      ev({ type: "defeat", targetFactionId: "livs", overlordFactionId: "jersika" }),
    ];
    expect(buildNotices(silent, ctx)).toEqual([]);
  });

  it("falls back to raw ids for unknown factions", () => {
    const n = oneNotice(
      ev({ type: "subjugated", playerId: 9, targetFactionId: "livs", overlordFactionId: "mystery" }),
    );
    expect(n).not.toBeNull();
    // playerId 9 has no faction: factionOf returns undefined, factionName("")
    expect(n!.what).toBe(" played Subjugate against Lower Daugava Livs.");
  });

  it("first subjugation: fealty line and standing vs the new overlord", () => {
    leadsTable = { jersika: { might: -2, status: 1 } };
    const n = oneNotice(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
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
    const n = oneNotice(
      ev({
        type: "subjugated", targetFactionId: "livs",
        overlordFactionId: "jersika", formerOverlordFactionId: "latgale",
      }),
    )!;
    expect(n.details).toEqual([
      "Your allegiance shifts from Latgalians to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "Standing vs Latgalians: Might - even; Status - they lead by 1.",
      "Latgalians loses 1 Might and 1 Status against you.",
    ]);
  });

  it("released names the fallen lord when the event carries it", () => {
    const n = oneNotice(
      ev({ type: "released", playerId: 3, targetFactionId: "livs", overlordFactionId: "jersika" }),
    )!;
    expect(n.what).toBe("The fall of Jersikans to Latgalians releases you from vassalage.");
  });

  it("released falls back when the lord field is absent", () => {
    const n = oneNotice(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
    )!;
    expect(n.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
  });

  it("raid against the human raises a modal with standing and threat warning", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = oneNotice(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
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
    const n = oneNotice(
      ev({ type: "play", cardId: "shrewd-marriage", targetFactionId: "livs" }),
    )!;
    expect(n.title).toBe("A Shrewd Marriage");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - even; Status - they lead by 1.",
    ]);
  });

  it("scaled grip: no warning when the lead is below a bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = oneNotice(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
    ]);
  });

  it("scaled grip: warning text reflects the bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -4, status: 0 } };
    const n = oneNotice(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 4; Status - even.",
      "A lead of 4 is enough to subjugate.",
    ]);
  });

  it("omits the threat clause when this rival could never subjugate the human (already their overlord)", () => {
    // e.g. the human is already jersika's vassal: jersika cannot subjugate
    // again, so subjugationRequirement (and this bar) is null for that pair
    // even though jersika leads Might by 5. The map's danger marker agrees.
    leadsTable = { jersika: { might: -5, status: 0 } };
    subjugationBarTable = { jersika: null };
    const n = oneNotice(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 5; Status - even.",
    ]);
  });

  it("omits the threat clause when this rival is itself somebody's vassal", () => {
    leadsTable = { jersika: { might: 0, status: -6 } };
    subjugationBarTable = { jersika: null };
    const n = oneNotice(
      ev({ type: "play", cardId: "shrewd-marriage", targetFactionId: "livs" }),
    )!;
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - even; Status - they lead by 6.",
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
      expect(oneNotice(e), `expected null for ${e.cardId}`).toBeNull();
    }
  });

  it("assassinate-ruler against the human raises a modal with standing and threat warning", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = oneNotice(
      ev({ type: "play", cardId: "assassinate-ruler", targetFactionId: "livs" }),
    )!;
    expect(n.title).toBe("A Ruler Falls");
    expect(n.what).toBe("Jersikans played Assassinate ruler against Lower Daugava Livs.");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "A lead of 2 is enough to subjugate.",
    ]);
  });

  it("a prevented assassinate-ruler against the human raises its own modal", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = oneNotice(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        prevented: true,
      }),
    )!;
    expect(n.title).toBe("Assassination Prevented");
    expect(n.what).toBe("Jersikans played Assassinate ruler against Lower Daugava Livs.");
    expect(n.details).toEqual([
      "Your bodyguard turned the blade - your Status lead is unchanged.",
    ]);
  });

  it("alliance with the human raises a modal naming the pact expiry", () => {
    allianceExpiryTable = { jersika: 8 };
    const n = oneNotice(
      ev({ type: "play", cardId: "alliance", targetFactionId: "livs" }),
    )!;
    expect(n.title).toBe("An Alliance Sealed");
    expect(n.what).toBe("Jersikans played Alliance with Lower Daugava Livs.");
    expect(n.details).toEqual([
      "No hostile cards between you and Jersikans until turn 8.",
    ]);
  });

  it("alliance modal omits the expiry line when allianceExpiry is undefined", () => {
    const n = oneNotice(
      ev({ type: "play", cardId: "alliance", targetFactionId: "livs" }),
    )!;
    expect(n.details).toEqual([]);
  });

  it("extended-diplomacy play stays silent (untargeted, self-initiated)", () => {
    const n = oneNotice(ev({ type: "play", cardId: "extended-diplomacy" }));
    expect(n).toBeNull();
  });

  it("alliance played by the human stays silent", () => {
    const n = oneNotice(
      ev({ type: "play", playerId: 1, cardId: "alliance", targetFactionId: "jersika" }),
    );
    expect(n).toBeNull();
  });
});

describe("buildNotices: batch grouping", () => {
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
    allianceExpiryTable = {};
    subjugationBarTable = {};
  });

  it("collapses 3 raids by different actors into one notice", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 }, // qualifies: max(2, 0) >= grip(2)
      latgale: { might: 0, status: -1 }, // below grip
      curonia: { might: 1, status: 1 }, // human leads both
    };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ turn: 3, playerId: 4, type: "play", cardId: "raid", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("Raided");
    expect(n.what).toBe("3 players played Raid against you:");
    expect(n.details).toEqual([
      "Jersikans - Might: they lead by 2; Status: even - a lead of 2 subjugates you",
      "Latgalians - Might: even; Status: they lead by 1",
      "Curonians - Might: you lead by 1; Status: you lead by 1",
    ]);
    expect(n.consequence).toBeUndefined();
  });

  it("omits the threat clause for a rival that could never subjugate the human, even mid-batch", () => {
    leadsTable = {
      jersika: { might: -9, status: 0 }, // huge lead, but jersika already holds the human
      latgale: { might: -2, status: 0 }, // qualifies normally
    };
    subjugationBarTable = { jersika: null };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "raid", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    expect(notices[0].details).toEqual([
      "Jersikans - Might: they lead by 9; Status: even",
      "Latgalians - Might: they lead by 2; Status: even - a lead of 2 subjugates you",
    ]);
  });

  it("groups raids and marriages into two separate notices, one per card", () => {
    leadsTable = { jersika: { might: -2, status: 0 }, latgale: { might: 0, status: -1 } };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "shrewd-marriage", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(2);
    expect(notices[0].title).toBe("Raided");
    expect(notices[0].what).toBe("Jersikans played Raid against Lower Daugava Livs.");
    expect(notices[1].title).toBe("A Shrewd Marriage");
    expect(notices[1].what).toBe("Latgalians played Shrewd marriage against Lower Daugava Livs.");
  });

  it("collapses 2 assassinate-ruler plays by different actors into one notice", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 }, // qualifies: max(2, 0) >= grip(2)
      latgale: { might: 0, status: -1 }, // below grip
    };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "assassinate-ruler", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("A Ruler Falls");
    expect(n.what).toBe("2 players played Assassinate ruler against you:");
    expect(n.details).toEqual([
      "Jersikans - Might: they lead by 2; Status: even - a lead of 2 subjugates you",
      "Latgalians - Might: even; Status: they lead by 1",
    ]);
  });

  it("collapses 2 prevented assassinate-ruler plays into one Assassination Prevented notice", () => {
    const events: GameEvent[] = [
      ev({
        turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs", prevented: true,
      }),
      ev({
        turn: 2, playerId: 3, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs", prevented: true,
      }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("Assassination Prevented");
    expect(n.what).toBe("2 players played Assassinate ruler against you:");
    expect(n.details).toEqual([
      "Jersikans - prevented by your bodyguard",
      "Latgalians - prevented by your bodyguard",
    ]);
  });

  it("a round with both a prevented and a successful assassination raises one modal of each kind", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const events: GameEvent[] = [
      ev({
        turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs", prevented: true,
      }),
      ev({
        turn: 2, playerId: 3, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs",
      }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(2);
    expect(notices[0].title).toBe("Assassination Prevented");
    expect(notices[1].title).toBe("A Ruler Falls"); // successful case unaffected
  });

  it("collapses 2 alliances sealed in one round into one notice", () => {
    allianceExpiryTable = { jersika: 6, latgale: 11 };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "alliance", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "alliance", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("An Alliance Sealed");
    expect(n.what).toBe("2 players sealed alliances with you:");
    expect(n.details).toEqual([
      "Jersikans - until turn 6",
      "Latgalians - until turn 11",
    ]);
  });

  it("collapses a fealty-then-poach chain into one notice with two transitions", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 },
      latgale: { might: -1, status: 2 },
    };
    const events: GameEvent[] = [
      ev({
        turn: 1, playerId: 2, type: "subjugated",
        targetFactionId: "livs", overlordFactionId: "jersika",
      }),
      ev({
        turn: 2, playerId: 3, type: "subjugated",
        targetFactionId: "livs", overlordFactionId: "latgale", formerOverlordFactionId: "jersika",
      }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("Beneath the Yoke");
    expect(n.what).toBe("Your allegiance changed this round:");
    expect(n.details).toEqual([
      "Jersikans subjugated you",
      "Latgalians tore you from Jersikans",
      "Standing vs Latgalians: Might - they lead by 1; Status - you lead by 2.",
      "Jersikans loses 1 Might and 1 Status against you.",
    ]);
    expect(n.consequence).toBe(
      "Two Pay Tribute cards were shuffled into your deck. When one is in hand, it must be played before anything else.",
    );
  });

  it("collapses 2 releases in one round into one notice with a bullet each", () => {
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 3, type: "released", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ turn: 2, playerId: 4, type: "released", targetFactionId: "livs" }),
    ];
    const notices = buildNotices(events, ctx);
    expect(notices).toHaveLength(1);
    const n = notices[0];
    expect(n.title).toBe("The Yoke Is Broken");
    expect(n.what).toBe("You were released this round:");
    expect(n.details).toEqual([
      "The fall of Jersikans to Latgalians set you free",
      "The fall of your overlord to Curonians set you free",
    ]);
    expect(n.consequence).toBe(
      "All Pay Tribute cards were removed from your deck, hand, and discard.",
    );
  });

  it("is empty for silent events even in a batch", () => {
    const events: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", track: "might" }),
    ];
    expect(buildNotices(events, ctx)).toEqual([]);
  });
});

describe("assassination notices name rulers", () => {
  it("names the ruler who died and the one who follows", () => {
    const n = oneNotice(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        targetRuler: "Kaupo", successorRuler: "Dabrelis",
      }),
    )!;
    expect(n.title).toBe("A Ruler Falls");
    expect(n.what).toBe("The Jersikans had Kaupo killed.");
    expect(n.details[0]).toBe("Dabrelis now leads the Lower Daugava Livs.");
  });

  it("names the ruler the bodyguard saved", () => {
    const n = oneNotice(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        targetRuler: "Kaupo", prevented: true,
      }),
    )!;
    expect(n.title).toBe("Assassination Prevented");
    expect(n.details).toEqual([
      "Your bodyguard turned the blade - Kaupo lives and your Status lead is unchanged.",
    ]);
  });
});
