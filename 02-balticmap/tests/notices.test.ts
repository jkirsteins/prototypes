import { describe, it, expect, beforeEach } from "vitest";
import {
  NOTICE_RULES, ROUND_SUMMARY_TITLE, buildRoundSummary, type NoticeCtx,
} from "../src/notices";
import { plainText, type NameLookup } from "../src/rich-text";
import type { GameEvent, GameEventType } from "../src/game";

// Hand-maintained, and it was already missing "unified" before "settled" was
// added: the registry test only guards the types listed here, so anything left
// off is exactly what goes unguarded.
const ALL_TYPES: GameEventType[] = [
  "draw", "play", "reshuffle", "discard",
  "subjugated", "released", "incorporated", "reclaimed", "tribute",
  "settled", "seeded", "garrisoned",
  "subjugate-failed", "incorporate-failed",
  "victory", "defeat", "unified", "surrendered",
];

const NAMES: Record<string, string> = {
  livs: "Lower Daugava Livs",
  jersika: "Jersikans",
  latgale: "Latgalians",
  curonia: "Curonians",
};

const nameLookup: NameLookup = {
  factionName: (id) => NAMES[id] ?? id,
  isPlaceName: () => false,
};

const FACTION_BY_PLAYER: Record<number, string> = {
  1: "livs", 2: "jersika", 3: "latgale", 4: "curonia",
};

let leadsTable: Record<string, { might: number; status: number }> = {};
let grip = 2;
// The Might bar when a settlement has raised it above the Status one. Null
// keeps the two equal, which is every case that predates the split.
let mightGrip: number | null = null;
let allianceExpiryTable: Record<string, number | undefined> = {};
// Rival-specific subjugation bar. Defaults to `grip` for any rival not
// listed here, matching what the real `subjugationRequirement` returns for
// an ordinary pair with no guard in play - this keeps every existing test's
// meaning intact. Tests that need a guarded (null) pair override an entry.
let subjugationBarTable: Record<string, number | null> = {};

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
  leads: (other) => leadsTable[other] ?? { might: 0, status: 0 },
  // The bars diverge only where a settlement has been founded, so these
  // helpers take one number and mirror it onto both tracks. The tests that
  // care about the split set `mightGrip` instead.
  subjugationGrip: () => ({ might: mightGrip ?? grip, status: grip }),
  subjugationBarAgainstYou: (other) => {
    const bar = other in subjugationBarTable ? subjugationBarTable[other] : grip;
    return bar === null ? null : { might: mightGrip ?? bar, status: bar };
  },
  allianceExpiry: (other) => allianceExpiryTable[other],
};

const ev = (partial: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 3,
  playerId: 2,
  ...partial,
});

/** Build a round summary from a single event. */
const oneSummary = (e: GameEvent) => buildRoundSummary([e], ctx);

/** The rendered text of summary line `i`, plain-text for assertions. */
const lineText = (s: ReturnType<typeof oneSummary>, i = 0): string =>
  plainText(s!.lines[i].text, nameLookup);

const footnoteTexts = (s: ReturnType<typeof oneSummary>): string[] =>
  s!.footnotes.map((f) => plainText(f, nameLookup));

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
      buildRoundSummary(
        [{ turn: 3, playerId: 2, type: "settled", targetFactionId: "livs" }],
        ctx,
      ),
    ).toBeNull();
  });
});

describe("buildRoundSummary: single-event scenarios", () => {
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
    mightGrip = null;
    allianceExpiryTable = {};
    subjugationBarTable = {};
  });

  it("has the fixed round title", () => {
    const s = oneSummary(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
    )!;
    expect(s.title).toBe(ROUND_SUMMARY_TITLE);
  });

  it("builds a subjugation line when an AI subjugates the human", () => {
    const s = oneSummary(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
    )!;
    expect(lineText(s)).toBe("Subjugate by Jersikans - you owe fealty to them");
    expect(footnoteTexts(s)).toEqual([
      "Pay military tribute and Pay status tribute were shuffled into your deck. While either is in hand it must be played first.",
    ]);
  });

  it("is null when the human subjugates someone else", () => {
    expect(
      oneSummary(
        ev({
          type: "subjugated", playerId: 1,
          targetFactionId: "jersika", overlordFactionId: "livs",
        }),
      ),
    ).toBeNull();
  });

  it("is null for AI-vs-AI subjugation", () => {
    expect(
      oneSummary(
        ev({ type: "subjugated", targetFactionId: "latgale", overlordFactionId: "jersika" }),
      ),
    ).toBeNull();
  });

  it("builds a release line when another player frees the human", () => {
    const s = oneSummary(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
    )!;
    expect(lineText(s)).toBe("The fall of your overlord to Latgalians released you from vassalage");
    expect(footnoteTexts(s)).toEqual([
      "Pay military tribute and Pay status tribute were removed from your deck, hand and discard.",
    ]);
  });

  it("is null for a release that frees another faction", () => {
    expect(
      oneSummary(ev({ type: "released", playerId: 3, targetFactionId: "latgale" })),
    ).toBeNull();
  });

  it("warns when a rival tears a vassal away from you", () => {
    const s = oneSummary(
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
      }),
    )!;
    expect(lineText(s)).toBe("Subjugate by Latgalians took your vassal Curonians");
    expect(footnoteTexts(s)[0]).toContain("Your realm is smaller");
  });

  it("warns when a vassal revolts", () => {
    const s = oneSummary(
      ev({
        type: "reclaimed", playerId: 4, cardId: "revolt",
        targetFactionId: "curonia", overlordFactionId: "livs", amount: 1,
      }),
    )!;
    expect(lineText(s)).toBe("Revolt by Curonians cast off your overlordship");
    expect(footnoteTexts(s)[0]).toContain("Your realm is smaller");
  });

  it("a doubled revolt reports the doubled swing in its changes", () => {
    // The rebel (curonia) gains against its former lord (the human), doubled -
    // the human's own lead over curonia drops by 2 on both tracks.
    leadsTable = { curonia: { might: -2, status: -2 } }; // post-batch: now trailing
    const s = oneSummary(
      ev({
        type: "reclaimed", playerId: 4, cardId: "revolt", doubled: true,
        targetFactionId: "curonia", overlordFactionId: "livs", amount: 2,
      }),
    )!;
    expect(s.lines[0].changes).toEqual([
      { factionId: "curonia", track: "might", before: 0, after: -2 },
      { factionId: "curonia", track: "status", before: 0, after: -2 },
    ]);
  });

  it("stays silent when the human is the one reclaiming", () => {
    expect(
      oneSummary(
        ev({
          type: "reclaimed", playerId: 1, cardId: "revolt",
          targetFactionId: "livs", overlordFactionId: "jersika", amount: 1,
        }),
      ),
    ).toBeNull();
  });

  it("warns when your own fall scatters your vassals", () => {
    const s = oneSummary(
      ev({
        type: "released", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "livs",
      }),
    )!;
    expect(lineText(s)).toBe("Your subjugation released Curonians from your service");
    // no Pay Tribute footnote - that consequence belongs to the "subjugated"
    // notice for the same round, not this side-effect
    expect(s.footnotes).toEqual([]);
  });

  it("keeps your own subjugation separate from a vassal poached in the same round", () => {
    const s = buildRoundSummary(
      [
        ev({ type: "subjugated", playerId: 2, targetFactionId: "livs", overlordFactionId: "jersika" }),
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
      ],
      ctx,
    )!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Subjugate by Jersikans - you owe fealty to them");
    expect(lineText(s, 1)).toBe("Subjugate by Latgalians took your vassal Curonians");
  });

  it("lists several vassals lost in one round as separate lines - a ledger, not a nag", () => {
    const s = buildRoundSummary(
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
    )!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Subjugate by Latgalians took your vassal Curonians");
    expect(lineText(s, 1)).toBe("Subjugate by Latgalians took your vassal Jersikans");
    // the realm-shrunk footnote is the same warning twice - deduplicated to one
    expect(s.footnotes).toHaveLength(1);
  });

  it("is null for every silent event type", () => {
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
    expect(buildRoundSummary(silent, ctx)).toBeNull();
  });

  it("falls back to a blank actor when the faction cannot be resolved", () => {
    const s = oneSummary(
      ev({ type: "subjugated", playerId: 9, targetFactionId: "livs", overlordFactionId: "mystery" }),
    )!;
    // playerId 9 has no faction: factionOf returns undefined -> faction("")
    expect(lineText(s)).toBe("Subjugate by  - you owe fealty to them");
  });

  it("poach: allegiance shift, and changes read against the former lord", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 },
      latgale: { might: 0, status: -1 },
    };
    const s = oneSummary(
      ev({
        type: "subjugated", targetFactionId: "livs",
        overlordFactionId: "jersika", formerOverlordFactionId: "latgale",
      }),
    )!;
    expect(lineText(s)).toBe("Subjugate by Jersikans - your allegiance shifts from Latgalians to them");
    expect(s.lines[0].changes).toEqual([
      { factionId: "latgale", track: "might", before: -1, after: 0 },
      { factionId: "latgale", track: "status", before: -2, after: -1 },
    ]);
  });

  it("released names the fallen lord when the event carries it", () => {
    const s = oneSummary(
      ev({ type: "released", playerId: 3, targetFactionId: "livs", overlordFactionId: "jersika" }),
    )!;
    expect(lineText(s)).toBe("The fall of Jersikans to Latgalians released you from vassalage");
  });

  it("raid against the human names the card and the actor, and reports the Might swing", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const s = oneSummary(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
    )!;
    expect(lineText(s)).toBe("Raid played against you by Jersikans");
    expect(s.lines[0].changes).toEqual([
      { factionId: "jersika", track: "might", before: 0, after: -2 },
    ]);
    expect(footnoteTexts(s)).toEqual(["the Jersikans can subjugate you at a lead of 2."]);
  });

  it("marriage against the human reports the Status swing, no threat footnote below threshold", () => {
    leadsTable = { jersika: { might: 0, status: -1 } };
    const s = oneSummary(
      ev({ type: "play", cardId: "shrewd-marriage", targetFactionId: "livs", amount: 1, track: "status" }),
    )!;
    expect(lineText(s)).toBe("Shrewd marriage played against you by Jersikans");
    expect(s.lines[0].changes).toEqual([
      { factionId: "jersika", track: "status", before: 0, after: -1 },
    ]);
    expect(footnoteTexts(s)).toEqual([]);
  });

  it("scaled grip: no threat footnote when the lead is below a bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -2, status: 0 } };
    const s = oneSummary(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
    )!;
    expect(footnoteTexts(s)).toEqual([]);
  });

  it("scaled grip: threat footnote text reflects the bumped-up threshold", () => {
    grip = 4;
    leadsTable = { jersika: { might: -4, status: 0 } };
    const s = oneSummary(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", amount: 4, track: "might" }),
    )!;
    expect(footnoteTexts(s)).toEqual(["the Jersikans can subjugate you at a lead of 4."]);
  });

  it("omits the threat footnote when this rival could never subjugate the human (already their overlord)", () => {
    leadsTable = { jersika: { might: -5, status: 0 } };
    subjugationBarTable = { jersika: null };
    const s = oneSummary(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", amount: 5, track: "might" }),
    )!;
    expect(footnoteTexts(s)).toEqual([]);
  });

  it("play lines do not fire for own plays, AI-vs-AI, or other cards", () => {
    for (const e of [
      ev({ type: "play", playerId: 1, cardId: "raid", targetFactionId: "jersika" }),
      ev({ type: "play", cardId: "raid", targetFactionId: "latgale" }),
      ev({ type: "play", cardId: "subjugate", targetFactionId: "livs" }),
      ev({ type: "play", cardId: "fortify" }),
      ev({ type: "play", cardId: "grow-crops" }),
    ]) {
      expect(oneSummary(e), `expected null for ${e.cardId}`).toBeNull();
    }
  });

  it("assassinate-ruler against the human resets the Status lead to 0", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    // amount is the ACTOR's (jersika's) own Status lead over the human before
    // the reset - here jersika led by 2, so the human's own lead was -2.
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs", amount: 2,
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler - by Jersikans");
    expect(s.lines[0].changes).toEqual([
      { factionId: "jersika", track: "status", before: -2, after: 0 },
    ]);
    expect(footnoteTexts(s)).toEqual(["the Jersikans can subjugate you at a lead of 2."]);
  });

  it("a prevented assassinate-ruler against the human names the actor and moves nothing", () => {
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        prevented: true,
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler by Jersikans - your bodyguard turned the blade");
    expect(s.lines[0].changes).toEqual([]);
  });

  it("alliance with the human names the pact expiry", () => {
    allianceExpiryTable = { jersika: 8 };
    const s = oneSummary(
      ev({ type: "play", cardId: "alliance", targetFactionId: "livs" }),
    )!;
    expect(lineText(s)).toBe("Alliance sealed with you by Jersikans, until turn 8");
  });

  it("alliance line omits the expiry clause when allianceExpiry is undefined", () => {
    const s = oneSummary(
      ev({ type: "play", cardId: "alliance", targetFactionId: "livs" }),
    )!;
    expect(lineText(s)).toBe("Alliance sealed with you by Jersikans");
  });

  it("extended-diplomacy play stays silent (untargeted, self-initiated)", () => {
    expect(oneSummary(ev({ type: "play", cardId: "extended-diplomacy" }))).toBeNull();
  });

  it("alliance played by the human stays silent", () => {
    expect(
      oneSummary(ev({ type: "play", playerId: 1, cardId: "alliance", targetFactionId: "jersika" })),
    ).toBeNull();
  });
});

describe("buildRoundSummary: batch grouping", () => {
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
    mightGrip = null;
    allianceExpiryTable = {};
    subjugationBarTable = {};
  });

  it("lists 3 raids by different actors as 3 lines in one summary, not 3 modals", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 }, // qualifies: max(2, 0) >= grip(2)
      latgale: { might: 0, status: -1 }, // below grip
      curonia: { might: 1, status: 1 }, // human leads both
    };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "raid", targetFactionId: "livs", amount: 1, track: "might" }),
      ev({ turn: 3, playerId: 4, type: "play", cardId: "raid", targetFactionId: "livs", amount: 1, track: "might" }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(3);
    expect(s.lines.map((l) => plainText(l.text, nameLookup))).toEqual([
      "Raid played against you by Jersikans",
      "Raid played against you by Latgalians",
      "Raid played against you by Curonians",
    ]);
    // each line's own Might swing, not the round's total
    expect(s.lines.map((l) => l.changes[0].after)).toEqual([-2, 0, 1]);
    expect(footnoteTexts(s)).toEqual(["the Jersikans can subjugate you at a lead of 2."]);
  });

  it("puts a raid and a marriage in one summary, in log order", () => {
    leadsTable = { jersika: { might: -2, status: 0 }, latgale: { might: 0, status: -1 } };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "shrewd-marriage", targetFactionId: "livs", amount: 1, track: "status" }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Raid played against you by Jersikans");
    expect(lineText(s, 1)).toBe("Shrewd marriage played against you by Latgalians");
  });

  it("lists 2 assassinate-ruler plays by different actors as 2 lines", () => {
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler", targetFactionId: "livs", amount: 2 }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "assassinate-ruler", targetFactionId: "livs", amount: -1 }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Assassinate ruler - by Jersikans");
    expect(lineText(s, 1)).toBe("Assassinate ruler - by Latgalians");
  });

  it("groups 2 prevented assassinate-ruler plays as their own lines, separate from a landed one", () => {
    const events: GameEvent[] = [
      ev({
        turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs", prevented: true,
      }),
      ev({
        turn: 2, playerId: 3, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "livs", amount: 1,
      }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toContain("your bodyguard turned the blade");
    expect(lineText(s, 1)).toBe("Assassinate ruler - by Latgalians");
  });

  it("lists 2 alliances sealed in one round as 2 lines", () => {
    allianceExpiryTable = { jersika: 6, latgale: 11 };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "alliance", targetFactionId: "livs" }),
      ev({ turn: 2, playerId: 3, type: "play", cardId: "alliance", targetFactionId: "livs" }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Alliance sealed with you by Jersikans, until turn 6");
    expect(lineText(s, 1)).toBe("Alliance sealed with you by Latgalians, until turn 11");
  });

  it("lists a fealty-then-poach chain as two lines, one Pay Tribute footnote", () => {
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
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Subjugate by Jersikans - you owe fealty to them");
    expect(lineText(s, 1)).toBe("Subjugate by Latgalians - your allegiance shifts from Jersikans to them");
    expect(footnoteTexts(s)).toEqual([
      "Pay military tribute and Pay status tribute were shuffled into your deck. While either is in hand it must be played first.",
    ]);
  });

  it("lists 2 releases in one round as 2 lines, one Pay Tribute removal footnote", () => {
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 3, type: "released", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ turn: 2, playerId: 4, type: "released", targetFactionId: "livs" }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("The fall of Jersikans to Latgalians released you from vassalage");
    expect(lineText(s, 1)).toBe("The fall of your overlord to Curonians released you from vassalage");
    expect(footnoteTexts(s)).toEqual([
      "Pay military tribute and Pay status tribute were removed from your deck, hand and discard.",
    ]);
  });

  it("is null for silent events even in a batch", () => {
    const events: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", track: "might" }),
    ];
    expect(buildRoundSummary(events, ctx)).toBeNull();
  });

  it("a silent rival Fortify shifts the before of that rival's later Raid, in the same round", () => {
    // jersika Fortifies (+1 Might over everyone, including the human - silent,
    // no line of its own), then Raids the human for 2 more in the same round.
    // The Raid line's "before" must already reflect the Fortify.
    leadsTable = { jersika: { might: -3, status: 0 } }; // post-batch: -1 (fortify) + -2 (raid)
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "fortify", amount: 1, track: "might" }),
      ev({ turn: 2, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(1); // Fortify itself never produces a line
    expect(s.lines[0].changes).toEqual([
      { factionId: "jersika", track: "might", before: -1, after: -3 },
    ]);
  });

  it("the human's own trailing garrison does not corrupt the raid line above it", () => {
    // A rival raids the human for 2 Might, then the human's own beginTurn
    // garrison (the last event of every AI batch) adds 1 Might back.
    leadsTable = { jersika: { might: -1, status: 0 } }; // -2 (raid) + 1 (garrison)
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "livs", amount: 2, track: "might" }),
      { turn: 1, playerId: 1, type: "garrisoned", targetFactionId: "livs", amount: 1 },
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(1); // the human's own garrison is silent
    expect(s.lines[0].changes).toEqual([
      { factionId: "jersika", track: "might", before: 0, after: -2 },
    ]);
  });
});

describe("assassination lines name rulers", () => {
  it("names the ruler who died and the one who follows", () => {
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        targetRuler: "Kaupo", successorRuler: "Dabrelis", amount: 1,
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler took Kaupo; Dabrelis now leads you - by Jersikans");
  });

  it("names the ruler the bodyguard saved", () => {
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        targetRuler: "Kaupo", prevented: true,
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler by Jersikans - your bodyguard turned the blade");
  });
});

describe("seeds of revolt", () => {
  it("warns when your OWN vassal starts preparing a revolt", () => {
    // The only way to learn this: you cannot see a vassal's deck. Without the
    // notice the Incorporate race is invisible, and the odds on the card are a
    // readout rather than a decision.
    const s = oneSummary(ev({
      type: "seeded", playerId: 2,
      targetFactionId: "jersika", overlordFactionId: "livs",
    }))!;
    expect(lineText(s)).toBe("Jersikans is preparing a revolt against you");
    expect(footnoteTexts(s)[0]).toContain("Revolt is in their deck now");
  });

  it("collapses several vassals sowing in the same round into one line", () => {
    const s = buildRoundSummary(
      [
        ev({ turn: 1, playerId: 2, type: "seeded", targetFactionId: "jersika", overlordFactionId: "livs" }),
        ev({ turn: 1, playerId: 3, type: "seeded", targetFactionId: "latgale", overlordFactionId: "livs" }),
      ],
      ctx,
    )!;
    expect(s.lines).toHaveLength(1);
    expect(lineText(s)).toBe("Jersikans and Latgalians are preparing a revolt against you");
  });

  it("says nothing about a rival's vassal sowing, which nobody can observe", () => {
    expect(oneSummary(ev({
      type: "seeded", playerId: 3,
      targetFactionId: "latgale", overlordFactionId: "curonia",
    }))).toBeNull();
  });

  it("says nothing when the human sows their own", () => {
    expect(oneSummary(ev({
      type: "seeded", playerId: 1,
      targetFactionId: "livs", overlordFactionId: "jersika",
    }))).toBeNull();
  });
});

describe("a failed poach", () => {
  it("tells you your vassal held, since nothing on the map changed", () => {
    const s = oneSummary(ev({
      type: "subjugate-failed", playerId: 3,
      targetFactionId: "jersika",
      overlordFactionId: "latgale", formerOverlordFactionId: "livs",
    }))!;
    expect(lineText(s)).toBe("Latgalians failed to take Jersikans from you");
  });

  it("stays quiet about failed poaches between other factions", () => {
    expect(oneSummary(ev({
      type: "subjugate-failed", playerId: 3,
      targetFactionId: "jersika",
      overlordFactionId: "latgale", formerOverlordFactionId: "curonia",
    }))).toBeNull();
  });
});

describe("failed attempts against the player", () => {
  it("tells the player a rival tried to prise them away and missed", () => {
    // The human is curonia's vassal; jersika (player 2) reached for them.
    const e: GameEvent = {
      turn: 9, playerId: 2, type: "subjugate-failed",
      targetFactionId: "livs",
      overlordFactionId: "jersika",
      formerOverlordFactionId: "curonia",
    };
    const s = buildRoundSummary([e], ctx)!;
    expect(lineText(s)).toBe("Jersikans failed to take you from Curonians");
    expect(footnoteTexts(s)[0]).toContain("card is spent");
  });

  it("keeps the vassal-held wording when the human is the lord who held on", () => {
    const e: GameEvent = {
      turn: 9, playerId: 2, type: "subjugate-failed",
      targetFactionId: "latgale",
      overlordFactionId: "jersika",
      formerOverlordFactionId: "livs",
    };
    const s = buildRoundSummary([e], ctx)!;
    expect(lineText(s)).toBe("Jersikans failed to take Latgalians from you");
  });

  it("tells the player their overlord failed to annex them", () => {
    const e: GameEvent = {
      turn: 12, playerId: 3, type: "incorporate-failed",
      targetFactionId: "livs",
      overlordFactionId: "latgale",
    };
    const s = buildRoundSummary([e], ctx)!;
    expect(lineText(s)).toBe("Latgalians failed to absorb your realm permanently");
    // The actionable part: staying a vassal improves their next roll.
    expect(footnoteTexts(s)[0]).toContain("longer you stay their vassal");
  });

  it("stays silent on the human's own failed roll", () => {
    const own: GameEvent = {
      turn: 12, playerId: 1, type: "incorporate-failed",
      targetFactionId: "latgale", overlordFactionId: "livs",
    };
    expect(buildRoundSummary([own], ctx)).toBeNull();
  });

  it("says nothing about a failure between two rivals", () => {
    const between: GameEvent = {
      turn: 12, playerId: 2, type: "incorporate-failed",
      targetFactionId: "curonia", overlordFactionId: "jersika",
    };
    expect(buildRoundSummary([between], ctx)).toBeNull();
  });

  it("never interrupts for a garrison gain - it fires every turn", () => {
    const e: GameEvent = {
      turn: 5, playerId: 2, type: "garrisoned",
      targetFactionId: "jersika", amount: 3,
    };
    expect(buildRoundSummary([e], ctx)).toBeNull();
    expect(NOTICE_RULES.garrisoned.kind).toBe("silent");
  });
});

describe("critical events pierce a muted popup", () => {
  beforeEach(() => {
    leadsTable = {};
    grip = 2;
    mightGrip = null;
    subjugationBarTable = {};
    allianceExpiryTable = {};
  });

  /** Being made someone's vassal is the one thing the mute may not swallow:
   *  it takes away what the player is allowed to do next. */
  it("marks only the human's own subjugation critical", () => {
    const rule = NOTICE_RULES.subjugated;
    if (rule.kind !== "modal") throw new Error("subjugated must be modal");
    expect(rule.critical).toBeDefined();

    const becameVassal = ev({
      type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
    });
    // Returns the modal title, not a bare true: a rule cannot pierce the mute
    // without saying what happened.
    expect(rule.critical!(becameVassal, ctx)).toBe("You were subjugated");
  });

  it("does not mark a poached vassal critical - the realm shrank, the player did not", () => {
    const rule = NOTICE_RULES.subjugated;
    if (rule.kind !== "modal") throw new Error("subjugated must be modal");
    const lostAVassal = ev({
      type: "subjugated", playerId: 3, targetFactionId: "curonia",
      overlordFactionId: "latgale", formerOverlordFactionId: "livs",
    });
    expect(rule.critical!(lostAVassal, ctx)).toBeNull();
  });

  it("is the only critical rule in the registry", () => {
    const critical = ALL_TYPES.filter((t) => {
      const rule = NOTICE_RULES[t];
      return rule.kind === "modal" && rule.critical !== undefined;
    });
    expect(critical).toEqual(["subjugated"]);
  });

  it("criticalOnly keeps the subjugation and drops everything else", () => {
    const events: GameEvent[] = [
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", track: "might", amount: 2 }),
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
    ];
    const full = buildRoundSummary(events, ctx);
    const muted = buildRoundSummary(events, ctx, { criticalOnly: true });
    expect(full!.lines.length).toBeGreaterThan(muted!.lines.length);
    expect(muted!.lines).toHaveLength(1);
    expect(lineText(muted)).toContain("Jersikans");
  });

  it("titles the muted modal after what happened, not the round", () => {
    const muted = buildRoundSummary(
      [ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" })],
      ctx, { criticalOnly: true },
    );
    expect(muted!.title).toBe("You were subjugated");
  });

  it("keeps the round heading when popups are on, subjugation or not", () => {
    const full = buildRoundSummary(
      [ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" })],
      ctx,
    );
    expect(full!.title).toBe(ROUND_SUMMARY_TITLE);
  });

  it("keeps the subjugation's own Pay tribute footnote when muted", () => {
    const muted = buildRoundSummary(
      [ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" })],
      ctx, { criticalOnly: true },
    );
    expect(footnoteTexts(muted).join(" ")).toMatch(/tribute/i);
  });

  it("stays silent when a muted round holds nothing critical", () => {
    const events: GameEvent[] = [
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", track: "might", amount: 2 }),
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
      }),
    ];
    expect(buildRoundSummary(events, ctx)).not.toBeNull();
    expect(buildRoundSummary(events, ctx, { criticalOnly: true })).toBeNull();
  });

  /** The standings walk must still see the whole batch. Filtering the input
   *  array instead of the grouping would make a surviving line's
   *  before -> after numbers count only the events that survived. */
  it("reports the same standing numbers muted as unmuted", () => {
    const events: GameEvent[] = [
      ev({ type: "play", cardId: "raid", targetFactionId: "livs", track: "might", amount: 3 }),
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
    ];
    const full = buildRoundSummary(events, ctx);
    const muted = buildRoundSummary(events, ctx, { criticalOnly: true });
    const fullTexts = full!.lines.map((l) => plainText(l.text, nameLookup));
    const subjLine = fullTexts.find((t) => /fealty/.test(t));
    expect(subjLine, `no subjugation line in ${JSON.stringify(fullTexts)}`)
      .toBeDefined();
    expect(plainText(muted!.lines[0].text, nameLookup)).toBe(subjLine);
  });
});
