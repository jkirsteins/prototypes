import { describe, it, expect } from "vitest";
import { eventSegments } from "../src/hud";
import { buildRoundSummary, type NoticeCtx } from "../src/notices";
import { cardTextSegments, plainText, type NameLookup, type Segment } from "../src/rich-text";
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
  // The tail of an arrow. Only a march play carries one, but the sample is
  // built for every card so the rule is checked on the FIELD rather than on
  // the two ids that happen to set it today - a new card that sends an army
  // is covered without touching this file.
  playEvents.push({
    ...base, playerId: 2, type: "play", sourceFactionId: RIVAL,
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
  // One per route, because the route decides the segment the line opens with:
  // a card for the two that arrive, a status for the one that does not.
  subjugated: [
    {
      turn: 1, playerId: 2, type: "subjugated", targetFactionId: H,
      overlordFactionId: RIVAL, via: "conquest", cardId: "raid",
    },
    {
      turn: 1, playerId: 1, type: "subjugated", targetFactionId: RIVAL,
      overlordFactionId: H, via: "claim", cardId: "subjugate",
    },
    {
      turn: 1, playerId: 2, type: "subjugated", targetFactionId: H,
      overlordFactionId: RIVAL, formerOverlordFactionId: H,
      via: "passive", passiveId: "no-successor",
    },
    { turn: 1, playerId: 2, type: "subjugated", targetFactionId: H, overlordFactionId: RIVAL },
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
  independence: [
    // Fired from beginTurn with the FREED seat's own playerId - both sides.
    { turn: 1, playerId: 1, type: "independence", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 2, type: "independence", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  tribute: [
    {
      turn: 1, playerId: 1, type: "tribute",
      targetFactionId: H, overlordFactionId: RIVAL, wealth: 1,
    },
    {
      turn: 1, playerId: 2, type: "tribute",
      targetFactionId: RIVAL, overlordFactionId: H, wealth: 1,
    },
  ],
  settled: [
    { turn: 1, playerId: 1, type: "settled", targetFactionId: H },
    { turn: 1, playerId: 2, type: "settled", targetFactionId: RIVAL },
  ],
  "march-resolved": [
    // Both directions, and both the uncontested landing and the clash - the
    // two read as different sentences, so both must be swept.
    {
      turn: 2, playerId: 2, type: "march-resolved", cardId: "raid",
      targetFactionId: H, sourceFactionId: RIVAL, amount: 4,
    },
    {
      turn: 2, playerId: 1, type: "march-resolved", cardId: "raid",
      targetFactionId: RIVAL, sourceFactionId: H, amount: 4,
    },
    {
      turn: 2, playerId: 2, type: "march-resolved", cardId: "great-raid",
      targetFactionId: H, sourceFactionId: RIVAL, amount: 2,
      clash: { incoming: 6, counter: 4 },
    },
    {
      turn: 2, playerId: 2, type: "march-resolved", cardId: "raid",
      targetFactionId: RIVAL, sourceFactionId: H, amount: 2,
      clash: { incoming: 4, counter: 6 },
    },
    // No cardId: the "An attack" fallback line has to sweep too.
    {
      turn: 2, playerId: 2, type: "march-resolved",
      targetFactionId: H, sourceFactionId: RIVAL, amount: 4,
    },
  ],
  "march-lapsed": [
    {
      turn: 2, playerId: 1, type: "march-lapsed", cardId: "raid",
      targetFactionId: RIVAL, sourceFactionId: H,
    },
    {
      turn: 2, playerId: 2, type: "march-lapsed", cardId: "great-raid",
      targetFactionId: H, sourceFactionId: RIVAL,
    },
  ],
  healed: [
    { turn: 1, playerId: 1, type: "healed", cardId: "hillfort", targetFactionId: H, amount: 150 },
    { turn: 1, playerId: 2, type: "healed", cardId: "harvest-feast", targetFactionId: RIVAL, amount: 50 },
  ],
  "passive-fired": [
    { turn: 1, playerId: 1, type: "passive-fired", targetFactionId: H, passiveId: "wild-lands" },
    { turn: 1, playerId: 2, type: "passive-fired", targetFactionId: RIVAL, passiveId: "keeps-to-itself" },
    { turn: 1, playerId: 2, type: "passive-fired", targetFactionId: RIVAL, passiveId: "no-successor" },
  ],
  transferred: [
    { turn: 1, playerId: 1, type: "transferred", targetFactionId: H, sourceFactionId: RIVAL, amount: 1 },
    { turn: 1, playerId: 2, type: "transferred", targetFactionId: RIVAL, sourceFactionId: H, amount: 1 },
  ],
  "disease-spread": [
    { turn: 1, playerId: 2, type: "disease-spread", cardId: "spread-disease", targetFactionId: H, amount: 1 },
    { turn: 1, playerId: 1, type: "disease-spread", cardId: "localized-outbreak", targetFactionId: RIVAL, amount: 1 },
  ],
  plagued: [
    { turn: 1, playerId: 2, type: "plagued", cardId: "plague", targetFactionId: H, amount: 200 },
    { turn: 1, playerId: 1, type: "plagued", cardId: "plague", targetFactionId: RIVAL, amount: 100 },
  ],
  "winds-shifted": [
    { turn: 1, playerId: 2, type: "winds-shifted", cardId: "foul-winds", targetFactionId: H, amount: 2 },
    { turn: 1, playerId: 1, type: "winds-shifted", cardId: "foul-winds", targetFactionId: RIVAL, amount: 1 },
  ],
  // The harvest events fire per seat now, so each line gets both sides and
  // the sentences never lean on who earned it.
  "harvest-earned": [
    { turn: 1, playerId: 1, type: "harvest-earned", cardId: "turnip-harvest" },
    { turn: 1, playerId: 2, type: "harvest-earned", cardId: "turnip-harvest" },
  ],
  "harvest-picked": [
    { turn: 1, playerId: 1, type: "harvest-picked", cardId: "hillfort" },
    { turn: 1, playerId: 2, type: "harvest-picked", cardId: "subjugate" },
  ],
  "harvest-burned": [
    { turn: 1, playerId: 1, type: "harvest-burned", cardId: "hillfort" },
    { turn: 1, playerId: 2, type: "harvest-burned", cardId: "subjugate" },
  ],
  victory: [{ turn: 1, playerId: 1, type: "victory" }],
  defeat: [{ turn: 1, playerId: 1, type: "defeat", targetFactionId: H, overlordFactionId: RIVAL }],
  unified: [{ turn: 1, playerId: 1, type: "unified", overlordFactionId: RIVAL }],
  surrendered: [{ turn: 1, playerId: 1, type: "surrendered" }],
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
  defense: () => 300,
  defenseMax: () => 600,
  diseaseOf: () => 1,
  inHumanRealm: (polygon) => polygon === H,
  // Open, so the gate footnote's own prose is swept along with the lines.
  homeGateOpen: () => true,
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
  // Rules text is prose too: a card the text names must be a segment, or the
  // deck screen and the empower picker render it inert. A card without
  // textSegments sweeps as one plain run, so a future cross-reference left as
  // text fails here.
  for (const id of Object.keys(CARDS)) out.push(cardTextSegments(id));
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

    // A play is silent now - the damage consequence carries the summary line.
    const summary = buildRoundSummary(
      [{ turn: 1, playerId: 2, type: "march-resolved", cardId: "raid", targetFactionId: H, amount: 150 }],
      ctx,
    )!;
    expect(summary.lines[0].text.some((s) => s.kind === "card" && s.cardId === "raid")).toBe(true);
    expect(summary.lines[0].text.some((s) => s.kind === "faction")).toBe(true);
  });
});
