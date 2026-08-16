import { describe, it, expect, beforeEach } from "vitest";
import {
  NOTICE_RULES, ROUND_SUMMARY_TITLE, buildRoundSummary, resolveTitle, type NoticeCtx,
} from "../src/notices";
import { plainText, type NameLookup } from "../src/rich-text";
import type { GameEvent, GameEventType } from "../src/game";

// Hand-maintained, and the old roster's copy was already missing "unified"
// before "settled" was added: the registry test only guards the types listed
// here, so anything left off is exactly what goes unguarded.
const ALL_TYPES: GameEventType[] = [
  "draw", "play", "reshuffle", "discard",
  "subjugated", "released", "incorporated", "tribute",
  "settled",
  "healed", "disease-spread", "plagued", "winds-shifted",
  "march-resolved", "march-lapsed",
  "harvest-earned", "harvest-picked",
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

/** Post-batch defense per polygon - the truth walkStandings runs backwards
 *  from. Absent = pristine 600, the DEFAULT_DEFENSE_MAX convention. */
let defenseTable: Record<string, number> = {};
/** Post-batch disease stacks, polygon -> owner -> count. */
let diseaseTable: Record<string, Record<string, number>> = {};
/** What counts as the human's FULL realm - the home always, vassals when a
 *  test says so. */
let humanRealm = new Set(["livs"]);
/** Whether the human's HOME subjugation gate stands open right now. */
let gateOpen = false;

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
  defense: (polygon) => defenseTable[polygon] ?? 600,
  defenseMax: () => 600,
  diseaseOf: (polygon, owner) => diseaseTable[polygon]?.[owner] ?? 0,
  inHumanRealm: (polygon) => humanRealm.has(polygon),
  homeGateOpen: () => gateOpen,
};

const resetCtx = (): void => {
  defenseTable = {};
  diseaseTable = {};
  humanRealm = new Set(["livs"]);
  gateOpen = false;
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

  /** Not a ban on new critical rules - a requirement that adding one is a
   *  deliberate edit here rather than a side effect somewhere else. */
  it("names every critical rule in the registry", () => {
    const critical = ALL_TYPES.filter((t) => {
      const rule = NOTICE_RULES[t];
      return rule.kind === "modal" && rule.critical !== undefined;
    });
    // `play` is here only for the actor arm - a bodyguard stopping YOUR blade.
    // `march-resolved` and `plagued` fire only when the hit left the home gate
    // open. The order is ALL_TYPES' order, not the registry's.
    expect(critical).toEqual([
      "play", "subjugated", "released", "plagued",
      "march-resolved",
      "harvest-earned",
    ]);
  });

  it("is null for every silent event type", () => {
    const silent: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "discard", playerId: 1, cardId: "raid" }),
      ev({ type: "healed", targetFactionId: "livs", amount: 50 }),
      ev({ type: "incorporated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", wealth: 2 }),
      ev({ type: "settled", targetFactionId: "livs" }),
      ev({ type: "harvest-picked", playerId: 1, cardId: "hillfort" }),
      ev({ type: "victory", playerId: 1 }),
      ev({ type: "defeat", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "unified", overlordFactionId: "jersika" }),
      ev({ type: "surrendered", playerId: 1 }),
    ];
    expect(buildRoundSummary(silent, ctx)).toBeNull();
  });
});

describe("damage to the human's realm", () => {
  beforeEach(resetCtx);

  it("a rival's raid on the home names the card, the actor and the defense it moved", () => {
    defenseTable = { livs: 450 };
    const s = oneSummary(
      ev({
        type: "march-resolved", cardId: "raid", targetFactionId: "livs",
        sourceFactionId: "jersika", amount: 150,
      }),
    )!;
    expect(s.title).toBe(ROUND_SUMMARY_TITLE);
    expect(lineText(s)).toBe("Raid out of Jersikans fell on your home defenses");
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "defense", before: 600, after: 450 },
    ]);
    expect(s.lines[0].tone).toBe("bad");
  });

  it("a hit on a vassal's land inside the realm names the land", () => {
    humanRealm = new Set(["livs", "curonia"]);
    defenseTable = { curonia: 525 };
    const s = oneSummary(
      ev({
        type: "march-resolved", cardId: "great-raid", targetFactionId: "curonia",
        sourceFactionId: "jersika", amount: 75,
      }),
    )!;
    expect(lineText(s)).toBe(
      "Great raid out of Jersikans fell on Curonians in your realm",
    );
    expect(s.lines[0].changes).toEqual([
      { polygon: "curonia", track: "defense", before: 600, after: 525 },
    ]);
  });

  it("falls back to 'An attack' when the event names no card", () => {
    const s = oneSummary(
      ev({
        type: "march-resolved", targetFactionId: "livs",
        sourceFactionId: "jersika", amount: 150,
      }),
    )!;
    expect(lineText(s)).toBe("An attack out of Jersikans fell on your home defenses");
  });

  it("stays silent for the human's own attacks and for hits outside the realm", () => {
    for (const e of [
      ev({ type: "march-resolved", playerId: 1, cardId: "raid", targetFactionId: "jersika", amount: 150 }),
      ev({ type: "march-resolved", cardId: "raid", targetFactionId: "latgale", amount: 150 }),
    ]) {
      expect(oneSummary(e), `expected null for ${e.targetFactionId}`).toBeNull();
    }
  });

  it("a plague on the realm reads as a hit through the damaged wording", () => {
    defenseTable = { livs: 300 };
    const s = oneSummary(
      ev({ type: "plagued", cardId: "plague", targetFactionId: "livs", amount: 300 }),
    )!;
    expect(lineText(s)).toBe("Plague by Jersikans battered your home defenses");
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "defense", before: 600, after: 300 },
    ]);
  });

  it("chains two hits on the same polygon backwards from the post-batch score", () => {
    defenseTable = { livs: 300 };
    const s = buildRoundSummary([
      ev({ turn: 1, playerId: 2, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
      ev({ turn: 2, playerId: 3, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
    ], ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "defense", before: 600, after: 450 },
    ]);
    expect(s.lines[1].changes).toEqual([
      { polygon: "livs", track: "defense", before: 450, after: 300 },
    ]);
  });

  /** The walk must step over silent events too: a heal is never a line, but
   *  it moves the score the shown line's before has to account for. */
  it("a silent heal between two hits keeps the shown numbers honest", () => {
    defenseTable = { livs: 200 };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 2, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
      ev({ turn: 1, playerId: 1, type: "healed", cardId: "hillfort", targetFactionId: "livs", amount: 100 }),
      ev({ turn: 2, playerId: 3, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
    ];
    const s = buildRoundSummary(events, ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "defense", before: 400, after: 250 },
    ]);
    expect(s.lines[1].changes).toEqual([
      { polygon: "livs", track: "defense", before: 350, after: 200 },
    ]);
  });

  it("warns 'Your defenses are broken' when a hit on the home left the gate open", () => {
    gateOpen = true;
    defenseTable = { livs: 100 };
    const e = ev({ type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 });
    const rule = NOTICE_RULES["march-resolved"];
    if (rule.kind !== "modal") throw new Error("march-resolved must be modal");
    expect(rule.critical!(e, ctx)).toBe("Your defenses are broken");
    const s = oneSummary(e)!;
    expect(footnoteTexts(s)).toEqual([
      "Your home defenses are at or under a quarter of their strength: " +
        "any rival in reach can subjugate you.",
    ]);
  });

  it("does not mark a hit critical while the gate holds, and raises no footnote", () => {
    const e = ev({ type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 });
    const rule = NOTICE_RULES["march-resolved"];
    if (rule.kind !== "modal") throw new Error("march-resolved must be modal");
    expect(rule.critical!(e, ctx)).toBeNull();
    expect(footnoteTexts(oneSummary(e))).toEqual([]);
  });

  it("a hit on a vassal's land is never critical - the gate is about the HOME", () => {
    gateOpen = true;
    humanRealm = new Set(["livs", "curonia"]);
    const e = ev({ type: "march-resolved", cardId: "raid", targetFactionId: "curonia", amount: 150 });
    const rule = NOTICE_RULES["march-resolved"];
    if (rule.kind !== "modal") throw new Error("march-resolved must be modal");
    expect(rule.critical!(e, ctx)).toBeNull();
  });

  /** Two hits, one warning: the gate footnote compares rendered shape, so the
   *  same text from two events - or from a march group AND a plagued group -
   *  collapses to one. */
  it("deduplicates the gate footnote across events and across event types", () => {
    gateOpen = true;
    defenseTable = { livs: 0 };
    const s = buildRoundSummary([
      ev({ turn: 1, playerId: 2, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
      ev({ turn: 2, playerId: 3, type: "plagued", cardId: "plague", targetFactionId: "livs", amount: 200 }),
    ], ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(s.footnotes).toHaveLength(1);
  });

  it("the broken-gate hit pierces a muted popup, with the same numbers as unmuted", () => {
    gateOpen = true;
    defenseTable = { livs: 100 };
    const events: GameEvent[] = [
      ev({ turn: 1, playerId: 1, type: "healed", cardId: "hillfort", targetFactionId: "livs", amount: 50 }),
      ev({ turn: 2, playerId: 2, type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
    ];
    const full = buildRoundSummary(events, ctx)!;
    const muted = buildRoundSummary(events, ctx, { criticalOnly: true })!;
    expect(muted.title).toBe("Your defenses are broken");
    expect(muted.lines).toHaveLength(1);
    // The grouping is filtered, never the walk's input: the silent heal still
    // shifts the surviving line's before exactly as it does unmuted.
    expect(muted.lines[0].changes).toEqual(full.lines[0].changes);
    expect(muted.lines[0].changes).toEqual([
      { polygon: "livs", track: "defense", before: 250, after: 100 },
    ]);
  });
});

describe("disease on the human's realm", () => {
  beforeEach(resetCtx);

  it("a rival's stack on the home is a line with the stack it gained", () => {
    diseaseTable = { livs: { jersika: 1 } };
    const s = oneSummary(
      ev({ type: "disease-spread", cardId: "spread-disease", targetFactionId: "livs", amount: 1 }),
    )!;
    expect(lineText(s)).toBe("Spread disease by Jersikans set disease on your home");
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "disease", owner: "jersika", before: 0, after: 1 },
    ]);
    expect(footnoteTexts(s)).toEqual([
      "Stacks sit harmless until a Plague cashes them - 100 damage each, all at once.",
    ]);
  });

  it("names the land when the stack lands on a vassal's polygon in the realm", () => {
    humanRealm = new Set(["livs", "curonia"]);
    diseaseTable = { curonia: { jersika: 2 } };
    const s = oneSummary(
      ev({ type: "disease-spread", cardId: "localized-outbreak", targetFactionId: "curonia", amount: 1 }),
    )!;
    expect(lineText(s)).toBe(
      "Localized outbreak by Jersikans set disease on Curonians in your realm",
    );
    expect(s.lines[0].changes).toEqual([
      { polygon: "curonia", track: "disease", owner: "jersika", before: 1, after: 2 },
    ]);
  });

  it("stays silent for stacks outside the realm and for the human's own", () => {
    for (const e of [
      ev({ type: "disease-spread", cardId: "spread-disease", targetFactionId: "latgale", amount: 1 }),
      ev({ type: "disease-spread", playerId: 1, cardId: "spread-disease", targetFactionId: "jersika", amount: 1 }),
    ]) {
      expect(oneSummary(e)).toBeNull();
    }
  });

  it("a foul winds claim on realm stacks is the same news as a fresh stack", () => {
    diseaseTable = { livs: { jersika: 3 } };
    const s = oneSummary(
      ev({ type: "winds-shifted", cardId: "foul-winds", targetFactionId: "livs", amount: 3 }),
    )!;
    expect(lineText(s)).toBe("Foul winds by Jersikans claimed the disease on your home");
    expect(s.lines[0].changes).toEqual([
      { polygon: "livs", track: "disease", owner: "jersika", before: 0, after: 3 },
    ]);
  });

  it("winds on a realm member's land name the land", () => {
    humanRealm = new Set(["livs", "curonia"]);
    diseaseTable = { curonia: { jersika: 2 } };
    const s = oneSummary(
      ev({ type: "winds-shifted", cardId: "foul-winds", targetFactionId: "curonia", amount: 2 }),
    )!;
    expect(lineText(s)).toBe(
      "Foul winds by Jersikans claimed the disease on Curonians in your realm",
    );
  });

  it("neither disease line pierces a mute - stacks sit harmless until cashed", () => {
    diseaseTable = { livs: { jersika: 1 } };
    const events: GameEvent[] = [
      ev({ type: "disease-spread", cardId: "spread-disease", targetFactionId: "livs", amount: 1 }),
      ev({ type: "winds-shifted", cardId: "foul-winds", targetFactionId: "livs", amount: 1 }),
    ];
    expect(buildRoundSummary(events, ctx)).not.toBeNull();
    expect(buildRoundSummary(events, ctx, { criticalOnly: true })).toBeNull();
  });
});

describe("the assassination modal", () => {
  beforeEach(resetCtx);

  it("names the ruler who died and the one who follows", () => {
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        targetRuler: "Kaupo", successorRuler: "Dabrelis",
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler took Kaupo; Dabrelis now leads you - by Jersikans");
    expect(s.lines[0].tone).toBe("bad");
  });

  it("a prevented blade against the human names the actor and moves nothing", () => {
    const s = oneSummary(
      ev({
        type: "play", cardId: "assassinate-ruler", targetFactionId: "livs",
        prevented: true,
      }),
    )!;
    expect(lineText(s)).toBe("Assassinate ruler by Jersikans - your bodyguard turned the blade");
    expect(s.lines[0].changes).toEqual([]);
    expect(s.lines[0].tone).toBe("good");
  });

  it("stays silent for every other card's play - the consequences carry the lines", () => {
    for (const e of [
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ type: "play", cardId: "subjugate", targetFactionId: "livs" }),
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", playerId: 1, cardId: "assassinate-ruler", targetFactionId: "jersika" }),
    ]) {
      expect(oneSummary(e), `expected null for ${e.cardId}`).toBeNull();
    }
  });

  describe("the fizzle - your own blade turned", () => {
    const fizzle: GameEvent = {
      turn: 12, playerId: 1, type: "play",
      cardId: "assassinate-ruler", targetFactionId: "curonia", prevented: true,
    };

    it("is the one own-play the modal raises, as the actor arm", () => {
      const s = buildRoundSummary([fizzle], ctx)!;
      expect(lineText(s)).toBe(
        "Assassinate ruler spent on Curonians - a bodyguard turned the blade",
      );
      expect(s.lines[0].changes).toEqual([]);
      expect(s.lines[0].tone).toBe("bad");
    });

    it("is critical: the board cannot tell the player their card is gone", () => {
      const rule = NOTICE_RULES.play;
      if (rule.kind !== "modal") throw new Error("play must be modal");
      expect(rule.critical!(fizzle, ctx)).toBe("A bodyguard stopped you");
    });

    it("says their guard is spent, in the footer", () => {
      const s = buildRoundSummary([fizzle], ctx)!;
      expect(footnoteTexts(s).join(" ")).toMatch(/bodyguard is spent/i);
    });

    /** A batch made only of your own turn is not "Opponents' turns" - it is
     *  raised while your card is still in the air, before any rival has moved.
     *  The heading follows what the batch IS, not whether popups are muted. */
    it("never heads your own wasted turn as the opponents' round", () => {
      expect(buildRoundSummary([fizzle], ctx)!.title).toBe("A bodyguard stopped you");
      // But a batch that also carries a rival's doing is a round summary again.
      const mixed = [
        fizzle,
        ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }),
      ];
      expect(buildRoundSummary(mixed, ctx)!.title).toBe(ROUND_SUMMARY_TITLE);
    });

    it("a landed blade of your own raises nothing - the actor arm is fizzle-only", () => {
      expect(buildRoundSummary([{
        turn: 12, playerId: 1, type: "play",
        cardId: "assassinate-ruler", targetFactionId: "curonia",
      }], ctx)).toBeNull();
    });

    it("a rival's prevented blade against you is not critical - your guard held", () => {
      const rule = NOTICE_RULES.play;
      if (rule.kind !== "modal") throw new Error("play must be modal");
      expect(rule.critical!(
        ev({ type: "play", cardId: "assassinate-ruler", targetFactionId: "livs", prevented: true }),
        ctx,
      )).toBeNull();
    });

    it("groups a fizzle and a landed blade separately", () => {
      const s = buildRoundSummary([
        fizzle,
        ev({ type: "play", cardId: "assassinate-ruler", targetFactionId: "livs" }),
      ], ctx)!;
      expect(s.lines).toHaveLength(2);
      expect(lineText(s, 0)).toContain("a bodyguard turned the blade");
      expect(lineText(s, 1)).toBe("Assassinate ruler - by Jersikans");
    });
  });
});

describe("subjugation and release roles", () => {
  beforeEach(resetCtx);

  it("builds a fealty line when a rival subjugates the human", () => {
    const s = oneSummary(
      ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }),
    )!;
    expect(lineText(s)).toBe("Subjugate by Jersikans - you owe fealty to them");
    expect(footnoteTexts(s)).toEqual([
      "Pay tribute was shuffled into your deck. While it is in hand it must be played first.",
    ]);
  });

  it("poach of the human: allegiance shift, read off the former lord's field", () => {
    const s = oneSummary(
      ev({
        type: "subjugated", targetFactionId: "livs",
        overlordFactionId: "jersika", formerOverlordFactionId: "latgale",
        via: "claim", cardId: "subjugate",
      }),
    )!;
    expect(lineText(s)).toBe(
      "Subjugate by Jersikans - your allegiance shifts from Latgalians to them",
    );
  });

  it("warns when a rival tears a vassal away from you", () => {
    const s = oneSummary(
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        via: "claim", cardId: "subjugate",
      }),
    )!;
    expect(lineText(s)).toBe("Subjugate by Latgalians took your vassal Curonians");
    // The tribute injection is the vassal's problem, not the old lord's.
    expect(s.footnotes).toEqual([]);
  });

  // The bug this set exists for: every one of these used to say "Subjugate",
  // a card withdrawn from every pool, whatever had actually taken the land.
  describe("names what actually took the land", () => {
    const lostVassal = (cause: Partial<GameEvent>): string => lineText(oneSummary(
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        ...cause,
      }),
    )!);

    it("names the card that walked the army in", () => {
      expect(lostVassal({ via: "conquest", cardId: "great-raid" })).toBe(
        "Great raid by Latgalians took your vassal Curonians",
      );
    });

    it("names the card that made the demand", () => {
      expect(lostVassal({ via: "claim", cardId: "subjugate" })).toBe(
        "Subjugate by Latgalians took your vassal Curonians",
      );
    });

    it("names the status when a status handed the land over", () => {
      // The killing IS the taking, and the rule that says so is the status -
      // which is the segment the player can point at to read it.
      expect(lostVassal({ via: "passive", passiveId: "no-successor" })).toBe(
        "No successor by Latgalians took your vassal Curonians",
      );
    });

    it("names no card at all when the route was not recorded", () => {
      expect(lostVassal({})).toBe(
        "A conquest by Latgalians took your vassal Curonians",
      );
    });

    it("splits two routes in one round into two lines", () => {
      const s = buildRoundSummary([
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
          via: "conquest", cardId: "raid",
        }),
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "jersika",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
          via: "claim", cardId: "subjugate",
        }),
      ], ctx)!;
      expect(s.lines).toHaveLength(2);
      expect(lineText(s, 0)).toBe("Raid by Latgalians took your vassal Curonians");
      expect(lineText(s, 1)).toBe(
        "Subjugate by Latgalians took your vassal Jersikans",
      );
    });
  });

  it("is null when the human subjugates someone, and for AI-vs-AI", () => {
    for (const e of [
      ev({ type: "subjugated", playerId: 1, targetFactionId: "jersika", overlordFactionId: "livs" }),
      ev({ type: "subjugated", targetFactionId: "latgale", overlordFactionId: "jersika" }),
    ]) {
      expect(oneSummary(e)).toBeNull();
    }
  });

  it("keeps your own subjugation separate from a vassal poached in the same round", () => {
    const s = buildRoundSummary([
      ev({
        type: "subjugated", playerId: 2, targetFactionId: "livs",
        overlordFactionId: "jersika", via: "claim", cardId: "subjugate",
      }),
      ev({
        type: "subjugated", playerId: 3, targetFactionId: "curonia",
        overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        via: "claim", cardId: "subjugate",
      }),
    ], ctx)!;
    expect(s.lines).toHaveLength(2);
    expect(lineText(s, 0)).toBe("Subjugate by Jersikans - you owe fealty to them");
    expect(lineText(s, 1)).toBe("Subjugate by Latgalians took your vassal Curonians");
  });

  it("builds a release line when another player fells the human's overlord", () => {
    const s = oneSummary(
      ev({ type: "released", playerId: 3, targetFactionId: "livs", overlordFactionId: "jersika" }),
    )!;
    expect(lineText(s)).toBe(
      "The fall of Jersikans to Latgalians released you from vassalage, and none may subjugate you until turn 5",
    );
    expect(footnoteTexts(s)).toEqual([
      "Pay tribute was removed from your deck, hand and discard.",
    ]);
  });

  it("falls back to 'your overlord' when the release names no lord", () => {
    const s = oneSummary(
      ev({ type: "released", playerId: 4, targetFactionId: "livs" }),
    )!;
    expect(lineText(s)).toBe(
      "The fall of your overlord to Curonians released you from vassalage, and none may subjugate you until turn 5",
    );
  });

  it("collapses your scattered vassals into one release line naming them all", () => {
    const s = buildRoundSummary([
      ev({ type: "released", playerId: 3, targetFactionId: "curonia", overlordFactionId: "livs" }),
      ev({ type: "released", playerId: 3, targetFactionId: "jersika", overlordFactionId: "livs" }),
    ], ctx)!;
    expect(s.lines).toHaveLength(1);
    expect(lineText(s)).toBe(
      "Your subjugation released Curonians and Jersikans from your service; " +
        "none may subjugate them until turn 5",
    );
    expect(s.footnotes).toEqual([]);
  });

  describe("critical titles pierce a muted popup", () => {
    it("marks only the human's own subjugation 'You were subjugated'", () => {
      const rule = NOTICE_RULES.subjugated;
      if (rule.kind !== "modal") throw new Error("subjugated must be modal");
      expect(rule.critical!(
        ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }), ctx,
      )).toBe("You were subjugated");
      expect(resolveTitle(rule.critical!(
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }), ctx,
      )!, 1)).toBe("A vassal was lost");
    });

    it("marks both sides of a release critical", () => {
      const rule = NOTICE_RULES.released;
      if (rule.kind !== "modal") throw new Error("released must be modal");
      expect(rule.critical!(
        ev({ type: "released", targetFactionId: "livs", overlordFactionId: "jersika" }), ctx,
      )).toBe("Your overlord fell");
      expect(resolveTitle(rule.critical!(
        ev({ type: "released", targetFactionId: "latgale", overlordFactionId: "livs" }), ctx,
      )!, 1)).toBe("A vassal was lost");
    });

    /** The bug the family mechanism exists for. `critical` sees one event at a
     *  time, so its heading cannot know how many of its kind the round holds -
     *  and a poach and a release are not even the same rule. Two vassals left
     *  the realm; the heading must not say one. */
    it("counts a poached vassal and a released one as two losses in the heading", () => {
      const events: GameEvent[] = [
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
        ev({
          type: "released", playerId: 2,
          targetFactionId: "jersika", overlordFactionId: "livs",
        }),
      ];
      const muted = buildRoundSummary(events, ctx, { criticalOnly: true })!;
      expect(muted.title).toBe("You lost 2 vassals");
      expect(muted.lines).toHaveLength(2);
    });

    it("keeps the singular heading when exactly one vassal is lost", () => {
      const one = ev({
        type: "released", playerId: 4,
        targetFactionId: "curonia", overlordFactionId: "livs",
      });
      expect(buildRoundSummary([one], ctx, { criticalOnly: true })!.title)
        .toBe("A vassal was lost");
    });

    /** What the player IS still outranks what they LOST, however many they
     *  lost - the count decides the wording, never which title wins. */
    it("still prefers your own subjugation over any number of lost vassals", () => {
      const events: GameEvent[] = [
        ev({
          type: "subjugated", playerId: 3, targetFactionId: "curonia",
          overlordFactionId: "latgale", formerOverlordFactionId: "livs",
        }),
        ev({
          type: "released", playerId: 2,
          targetFactionId: "jersika", overlordFactionId: "livs",
        }),
        ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }),
      ];
      expect(buildRoundSummary(events, ctx, { criticalOnly: true })!.title)
        .toBe("You were subjugated");
    });

    /** Two `self` titles can compete, and role alone cannot order them. The
     *  heading is the standing the player wakes up in, so the LAST one wins. */
    it("titles a muted round after where the player ended, not where they passed through", () => {
      const freed = ev({
        type: "released", playerId: 2,
        targetFactionId: "livs", overlordFactionId: "jersika",
      });
      const taken = ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "latgale",
      });
      expect(buildRoundSummary([freed, taken], ctx, { criticalOnly: true })!.title)
        .toBe("You were subjugated");
      expect(buildRoundSummary([taken, freed], ctx, { criticalOnly: true })!.title)
        .toBe("Your overlord fell");
    });

    /** Being subjugated frees your whole realm in the same breath. This once
     *  shipped telling a muted player only that they owed fealty, and never
     *  that they had nothing left. */
    it("keeps the scattered vassals beside your own subjugation when muted", () => {
      const events: GameEvent[] = [
        ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }),
        ev({ type: "released", targetFactionId: "latgale", overlordFactionId: "livs" }),
        ev({ type: "released", targetFactionId: "curonia", overlordFactionId: "livs" }),
      ];
      const muted = buildRoundSummary(events, ctx, { criticalOnly: true })!;
      expect(muted.title).toBe("You were subjugated");
      expect(muted.lines).toHaveLength(2);
      const scattered = plainText(muted.lines[1].text, nameLookup);
      expect(scattered).toContain("Latgalians");
      expect(scattered).toContain("Curonians");
    });

    it("criticalOnly keeps the subjugation and drops the round's other news", () => {
      const events: GameEvent[] = [
        ev({ type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
        ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      }),
      ];
      const full = buildRoundSummary(events, ctx)!;
      const muted = buildRoundSummary(events, ctx, { criticalOnly: true })!;
      expect(full.lines.length).toBeGreaterThan(muted.lines.length);
      expect(muted.lines).toHaveLength(1);
      expect(muted.title).toBe("You were subjugated");
      expect(footnoteTexts(muted).join(" ")).toMatch(/tribute/i);
    });

    it("keeps the round heading when popups are on, subjugation or not", () => {
      const full = buildRoundSummary(
        [ev({
        type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika",
        via: "claim", cardId: "subjugate",
      })],
        ctx,
      )!;
      expect(full.title).toBe(ROUND_SUMMARY_TITLE);
    });

    it("stays silent when a muted round holds nothing critical", () => {
      const events: GameEvent[] = [
        ev({ type: "march-resolved", cardId: "raid", targetFactionId: "livs", amount: 150 }),
        ev({ type: "disease-spread", cardId: "spread-disease", targetFactionId: "livs", amount: 1 }),
      ];
      expect(buildRoundSummary(events, ctx)).not.toBeNull();
      expect(buildRoundSummary(events, ctx, { criticalOnly: true })).toBeNull();
    });
  });
});

describe("the turnip harvest", () => {
  beforeEach(resetCtx);

  it("a harvest earned is a modal for the local player, and critical", () => {
    const rule = NOTICE_RULES["harvest-earned"];
    expect(rule.kind).toBe("modal");
    if (rule.kind !== "modal") return;
    const e = ev({ type: "harvest-earned", playerId: 1, cardId: "turnip-harvest" });
    expect(rule.appliesToHuman(e, ctx)).toBe(true);
    expect(rule.critical?.(e, ctx)).toBe("A harvest is ready");
    const s = oneSummary(e)!;
    expect(lineText(s)).toBe(
      "Your turnip patch pays off - a Turnip harvest is shuffled into your deck",
    );
    expect(s.lines[0].tone).toBe("good");
  });

  it("pierces a muted popup - a card just entered the player's deck", () => {
    const s = buildRoundSummary(
      [ev({ type: "harvest-earned", playerId: 1, cardId: "turnip-harvest" })],
      ctx,
      { criticalOnly: true },
    )!;
    expect(s.title).toBe("A harvest is ready");
  });

  it("a rival's harvest is its own business", () => {
    expect(oneSummary(
      ev({ type: "harvest-earned", playerId: 2, cardId: "turnip-harvest" }),
    )).toBeNull();
  });

  it("the pick the player made themselves stays silent", () => {
    expect(NOTICE_RULES["harvest-picked"].kind).toBe("silent");
    expect(oneSummary(
      ev({ type: "harvest-picked", playerId: 1, cardId: "hillfort" }),
    )).toBeNull();
  });
});

describe("actor fallbacks", () => {
  beforeEach(resetCtx);

  it("falls back to a blank actor when the faction cannot be resolved", () => {
    const s = oneSummary(
      ev({
        type: "subjugated", playerId: 9, targetFactionId: "livs",
        overlordFactionId: "mystery", via: "claim", cardId: "subjugate",
      }),
    )!;
    // playerId 9 has no faction: factionOf returns undefined -> faction("")
    expect(lineText(s)).toBe("Subjugate by  - you owe fealty to them");
  });
});
