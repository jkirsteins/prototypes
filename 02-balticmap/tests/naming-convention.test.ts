import { describe, it, expect } from "vitest";
import { eventSegments } from "../src/hud";
import { buildRoundSummary, type NoticeCtx } from "../src/notices";
import { plainText, type NameLookup, type Segment } from "../src/rich-text";
import type { GameEvent, GameEventType, GameState } from "../src/game";
import { CARDS } from "../src/cards";
import rawData from "../src/data/map.json";
import type { MapData } from "../src/types";

/** The naming rule in AGENTS.md, enforced. Prose did not work: `cardName`
 *  was written twice (src/hud.ts, src/deck-screen.ts) and src/notices.ts
 *  hardcoded the literals "Raid" and "Shrewd marriage", which then could not
 *  follow a rename in src/cards.ts. POLICY_COVERAGE (the AI-branch guard in
 *  the repo's balticmap card rule) is the precedent for this: a Record forced
 *  prose to become a test.
 *
 *  This drives an EXHAUSTIVE sample of every GameEventType (the human as
 *  actor and as target) through both text producers - the activity/postmortem
 *  log (`eventSegments`) and the round summary (`buildRoundSummary`) - and
 *  fails if any plain-text segment contains a card name from CARDS or a
 *  faction name/id from the map data. */

const data = rawData as MapData;
const H = data.factions[0].id;
const RIVAL = data.factions[1].id;

const state = {
  players: [
    { id: 1, factionId: H },
    { id: 2, factionId: RIVAL },
  ],
} as unknown as GameState;

const playEvents: GameEvent[] = [];
for (const c of Object.values(CARDS)) {
  const base = { turn: 1, cardId: c.id };
  playEvents.push({
    ...base, playerId: 1, type: "play",
    ...(c.targeted ? { targetFactionId: RIVAL } : {}),
  });
  playEvents.push({
    ...base, playerId: 2, type: "play",
    ...(c.targeted ? { targetFactionId: H } : {}),
  });
  if (c.id === "assassinate-ruler") {
    playEvents.push({
      ...base, playerId: 2, type: "play", targetFactionId: H,
      prevented: true, targetRuler: "Someruler",
    });
    playEvents.push({
      ...base, playerId: 1, type: "play", targetFactionId: RIVAL,
      targetRuler: "Someruler", successorRuler: "Somesuccessor",
    });
    // The human's own blade turned aside - the one own play that raises a
    // modal, so the one own play whose summary lines the naming rule must see.
    playEvents.push({
      ...base, playerId: 1, type: "play", targetFactionId: RIVAL,
      prevented: true, targetRuler: "Someruler",
    });
  }
}

/** Exhaustive: a new GameEventType is a compile error here until it gets a
 *  sample, same guarantee NOTICE_RULES gives at the registry level. */
const SAMPLES: Record<GameEventType, GameEvent[]> = {
  draw: [
    { turn: 1, playerId: 1, type: "draw", cardId: "raid" },
    { turn: 1, playerId: 2, type: "draw", cardId: "raid" },
  ],
  play: playEvents,
  reshuffle: [
    { turn: 1, playerId: 1, type: "reshuffle" },
    { turn: 1, playerId: 2, type: "reshuffle" },
  ],
  discard: [
    { turn: 1, playerId: 1, type: "discard", cardId: "raid" },
    { turn: 1, playerId: 2, type: "discard", cardId: "raid" },
  ],
  subjugated: [
    { turn: 1, playerId: 2, type: "subjugated", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "subjugated", targetFactionId: RIVAL, overlordFactionId: H },
    {
      turn: 1, playerId: 2, type: "subjugated", targetFactionId: H,
      overlordFactionId: RIVAL, formerOverlordFactionId: H,
    },
  ],
  released: [
    { turn: 1, playerId: 2, type: "released", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "released", targetFactionId: RIVAL, overlordFactionId: H },
    { turn: 1, playerId: 2, type: "released", targetFactionId: H },
  ],
  incorporated: [
    { turn: 1, playerId: 2, type: "incorporated", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "incorporated", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  reclaimed: [
    {
      turn: 1, playerId: 1, type: "reclaimed", cardId: "revolt",
      targetFactionId: H, overlordFactionId: RIVAL, amount: 1,
    },
    {
      turn: 1, playerId: 2, type: "reclaimed", cardId: "revolt",
      targetFactionId: RIVAL, overlordFactionId: H, amount: 1, readings: 1,
    },
  ],
  tribute: [
    {
      turn: 1, playerId: 1, type: "tribute",
      targetFactionId: H, overlordFactionId: RIVAL, amount: 1,
    },
    {
      turn: 1, playerId: 2, type: "tribute",
      targetFactionId: RIVAL, overlordFactionId: H, amount: 1,
    },
  ],
  settled: [
    { turn: 1, playerId: 1, type: "settled", targetFactionId: H },
    { turn: 1, playerId: 2, type: "settled", targetFactionId: RIVAL },
  ],
  "seat-moved": [
    { turn: 1, playerId: 1, type: "seat-moved", targetFactionId: H },
    { turn: 1, playerId: 2, type: "seat-moved", targetFactionId: RIVAL },
  ],
  "seat-lost": [
    { turn: 1, playerId: 1, type: "seat-lost", targetFactionId: H },
    { turn: 1, playerId: 2, type: "seat-lost", targetFactionId: RIVAL },
  ],
  seeded: [
    { turn: 1, playerId: 2, type: "seeded", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "seeded", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  garrisoned: [
    { turn: 1, playerId: 1, type: "garrisoned", targetFactionId: H, amount: 1 },
    { turn: 1, playerId: 2, type: "garrisoned", targetFactionId: RIVAL, amount: 1 },
  ],
  "pact-lapsed": [
    // Both orderings, because the two id fields are symmetric here and the
    // notice picks the human's ally out of whichever slot they are not in.
    {
      turn: 1, playerId: 1, type: "pact-lapsed", targetFactionId: H,
      overlordFactionId: RIVAL, amount: 1, pactAgainst: [],
    },
    {
      turn: 1, playerId: 2, type: "pact-lapsed", targetFactionId: RIVAL,
      overlordFactionId: H, amount: 1, pactAgainst: [],
    },
  ],
  "hostage-taken": [
    { turn: 1, playerId: 2, type: "hostage-taken", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "hostage-taken", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  "hostage-returned": [
    { turn: 1, playerId: 1, type: "hostage-returned", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 2, type: "hostage-returned", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  "subjugate-failed": [
    {
      turn: 1, playerId: 2, type: "subjugate-failed",
      targetFactionId: H, overlordFactionId: RIVAL, formerOverlordFactionId: H,
    },
    {
      turn: 1, playerId: 1, type: "subjugate-failed",
      targetFactionId: RIVAL, overlordFactionId: H, formerOverlordFactionId: RIVAL,
    },
    // No former overlord, from both sides. Unreachable while only a poach can
    // miss, but neither sentence may lean on that: both build a "from X"
    // clause around a field that is only sometimes set.
    {
      turn: 1, playerId: 1, type: "subjugate-failed",
      targetFactionId: RIVAL, overlordFactionId: H,
    },
    {
      turn: 1, playerId: 2, type: "subjugate-failed",
      targetFactionId: H, overlordFactionId: RIVAL,
    },
  ],
  "incorporate-failed": [
    { turn: 1, playerId: 2, type: "incorporate-failed", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "incorporate-failed", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  victory: [{ turn: 1, playerId: 1, type: "victory" }],
  defeat: [{ turn: 1, playerId: 1, type: "defeat", targetFactionId: H, overlordFactionId: RIVAL }],
  unified: [{ turn: 1, playerId: 1, type: "unified", overlordFactionId: RIVAL }],
  surrendered: [{ turn: 1, playerId: 1, type: "surrendered" }],
  stranded: [
    { turn: 1, playerId: 1, type: "stranded", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 2, type: "stranded", targetFactionId: H, overlordFactionId: RIVAL },
  ],
};

/** Enough of a lookup to flatten segments back to a sentence. The verb sweep
 *  below reads the whole line, not its segments, because agreement is a
 *  property of how the words sit next to each other. */
const names: NameLookup = {
  factionName: (id) => data.factions.find((f) => f.id === id)?.name ?? id,
  isPlaceName: () => false,
};

const ALL_SAMPLE_EVENTS: GameEvent[] = (Object.keys(SAMPLES) as GameEventType[])
  .flatMap((type) => SAMPLES[type]);

const ctx: NoticeCtx = {
  humanFactionId: H,
  factionOf: (playerId) => (playerId === 1 ? H : playerId === 2 ? RIVAL : undefined),
  leads: () => 0,
  subjugationGrip: () => 2,
  subjugationBarAgainstYou: () => 2,
  allianceExpiry: () => 10,
};

function collectSegmentLists(): Segment[][] {
  const out: Segment[][] = [];
  for (const type of Object.keys(SAMPLES) as GameEventType[]) {
    for (const e of SAMPLES[type]) out.push(eventSegments(e, state));
  }
  const summary = buildRoundSummary(ALL_SAMPLE_EVENTS, ctx);
  if (summary !== null) {
    for (const line of summary.lines) out.push(line.text);
    for (const footnote of summary.footnotes) out.push(footnote);
  }
  return out;
}

// Ruler names are neither cards nor factions: they are stamped onto events at
// log time, have no hover target, and are deliberately out of scope (see
// AGENTS.md and the "deferred" scope note in the plan this shipped from).
// "Someruler"/"Somesuccessor" above must not collide with real vocabulary,
// which the test below would itself catch if they ever did.

describe("naming convention: no card or faction name as raw text", () => {
  const cardNames = Object.values(CARDS).map((c) => c.name);
  const factionNames = data.factions.map((f) => f.name);
  const factionIds = data.factions.map((f) => f.id);
  const forbidden = [...cardNames, ...factionNames, ...factionIds];

  it("has a non-trivial vocabulary to check against", () => {
    // guards against a data-loading bug making this test vacuously pass
    expect(cardNames.length).toBeGreaterThan(10);
    expect(factionNames.length).toBeGreaterThan(10);
  });

  it("never leaks a card or faction name into a plain-text segment", () => {
    const leaks: string[] = [];
    for (const segs of collectSegmentLists()) {
      for (const seg of segs) {
        if (seg.kind !== "text") continue;
        for (const name of forbidden) {
          if (name.length > 0 && seg.text.includes(name)) {
            leaks.push(`"${name}" leaked into text segment "${seg.text}"`);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  /** "You fails to prise Curonians from Nadruvians" shipped, because
   *  `actorSegments` yielded "You" and the verb beside it was written in third
   *  person only. Every sample is driven with the human as actor and again with
   *  a rival, and no correct sentence in this game reads "You <verb>s".
   *
   *  `\bYou ` and not `You` so "Your garrisons stand watch" is not a false
   *  positive: the possessive is a different word. If a legitimate line ever
   *  needs an s-final word straight after "You", it goes in an allowlist here
   *  with a note - it does not loosen the pattern.
   */
  it("never disagrees a verb with a You subject", () => {
    const disagreements: string[] = [];
    for (const type of Object.keys(SAMPLES) as GameEventType[]) {
      for (const sample of SAMPLES[type]) {
        for (const playerId of [1, 2]) {
          const text = plainText(eventSegments({ ...sample, playerId }, state), names);
          if (/\bYou [a-z]+s\b/.test(text)) disagreements.push(text);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  /** A faction segment with no id renders as nothing, so a clause built around
   *  one that may be absent ends the sentence on its preposition. This shipped
   *  visibly as "You fail to prise Dainavians from" - caught by reading a
   *  screenshot, which is the rule in AGENTS.md and the reason it is a rule. */
  it("never ends a line on a dangling preposition", () => {
    const dangles = (text: string): boolean =>
      /\b(from|to|into|against|by|on|of|with)$/.test(text.trim());
    const dangling: string[] = [];
    for (const type of Object.keys(SAMPLES) as GameEventType[]) {
      for (const sample of SAMPLES[type]) {
        for (const playerId of [1, 2]) {
          const e = { ...sample, playerId };
          const text = plainText(eventSegments(e, state), names);
          if (dangles(text)) dangling.push(text);
          // The summary says the same events in its own words and has the same
          // hole, so it is swept too rather than trusted to differ.
          const summary = buildRoundSummary([e], ctx);
          for (const line of summary?.lines ?? []) {
            const s = plainText(line.text, names);
            if (dangles(s)) dangling.push(s);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it("does not pass vacuously - the verb sweep would catch a disagreement", () => {
    // The regex has to actually fire, or the sweep above is a no-op that would
    // sit there passing while the bug it exists for walked straight past it.
    expect(/\bYou [a-z]+s\b/.test("You fails to prise Curonians")).toBe(true);
    expect(/\bYou [a-z]+s\b/.test("Your garrisons stand watch")).toBe(false);
    expect(/\bYou [a-z]+s\b/.test("You fail to prise Curonians")).toBe(false);
  });

  /** A secret play is the one line that deliberately names no card, and the
   *  sweep above can only ever say it did not leak one. That is a weaker claim
   *  than the property being bought - a line reading "Alpha played" would pass
   *  the sweep too - so the property is stated here directly, in both
   *  directions: hidden from a rival, named for the player who played it. */
  it("hides a secret card from a rival's line and names it on your own", () => {
    const secret = Object.values(CARDS).filter((c) => c.secret);
    expect(secret.length).toBeGreaterThan(0);
    for (const c of secret) {
      const base = { turn: 1, type: "play", cardId: c.id } as const;
      const theirs = plainText(eventSegments({ ...base, playerId: 2 }, state), names);
      expect(theirs).toContain("a secret card");
      for (const other of Object.values(CARDS)) {
        expect(theirs, `${c.id} leaked ${other.name}`).not.toContain(other.name);
      }
      // Revealed, and in the player's own line, the card is a segment again -
      // a node they can point at, exactly as the naming rule requires.
      for (const segs of [
        eventSegments({ ...base, playerId: 2 }, state, true),
        eventSegments({ ...base, playerId: 1 }, state),
      ]) {
        expect(segs.some((s) => s.kind === "card" && s.cardId === c.id)).toBe(true);
      }
    }
  });

  it("does not pass vacuously - a raid line actually carries a card and a faction segment", () => {
    const raidByHuman = playEvents.find(
      (e) => e.cardId === "raid" && e.playerId === 1,
    )!;
    const segs = eventSegments(raidByHuman, state);
    expect(segs.some((s) => s.kind === "card" && s.cardId === "raid")).toBe(true);
    expect(segs.some((s) => s.kind === "faction" && s.factionId === RIVAL)).toBe(true);

    const summary = buildRoundSummary(
      [{ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: H, amount: 1 }],
      ctx,
    )!;
    expect(summary.lines[0].text.some((s) => s.kind === "card" && s.cardId === "raid")).toBe(true);
    expect(summary.lines[0].text.some((s) => s.kind === "faction")).toBe(true);
  });
});
