import { describe, it, expect } from "vitest";
import { eventSegments } from "../src/hud";
import { buildRoundSummary, type NoticeCtx } from "../src/notices";
import type { Segment } from "../src/rich-text";
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
      targetFactionId: RIVAL, overlordFactionId: H, amount: 1, doubled: true,
    },
  ],
  tribute: [
    {
      turn: 1, playerId: 1, type: "tribute",
      targetFactionId: H, overlordFactionId: RIVAL, track: "might", amount: 1,
    },
    {
      turn: 1, playerId: 2, type: "tribute",
      targetFactionId: RIVAL, overlordFactionId: H, track: "status", amount: 1,
    },
  ],
  settled: [
    { turn: 1, playerId: 1, type: "settled", targetFactionId: H },
    { turn: 1, playerId: 2, type: "settled", targetFactionId: RIVAL },
  ],
  seeded: [
    { turn: 1, playerId: 2, type: "seeded", targetFactionId: H, overlordFactionId: RIVAL },
    { turn: 1, playerId: 1, type: "seeded", targetFactionId: RIVAL, overlordFactionId: H },
  ],
  garrisoned: [
    { turn: 1, playerId: 1, type: "garrisoned", targetFactionId: H, amount: 1 },
    { turn: 1, playerId: 2, type: "garrisoned", targetFactionId: RIVAL, amount: 1 },
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

const ALL_SAMPLE_EVENTS: GameEvent[] = (Object.keys(SAMPLES) as GameEventType[])
  .flatMap((type) => SAMPLES[type]);

const ctx: NoticeCtx = {
  humanFactionId: H,
  factionOf: (playerId) => (playerId === 1 ? H : playerId === 2 ? RIVAL : undefined),
  leads: () => ({ might: 0, status: 0 }),
  subjugationGrip: () => ({ might: 2, status: 2 }),
  subjugationBarAgainstYou: () => ({ might: 2, status: 2 }),
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

  it("does not pass vacuously - a raid line actually carries a card and a faction segment", () => {
    const raidByHuman = playEvents.find(
      (e) => e.cardId === "raid" && e.playerId === 1,
    )!;
    const segs = eventSegments(raidByHuman, state);
    expect(segs.some((s) => s.kind === "card" && s.cardId === "raid")).toBe(true);
    expect(segs.some((s) => s.kind === "faction" && s.factionId === RIVAL)).toBe(true);

    const summary = buildRoundSummary(
      [{ turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: H, amount: 1, track: "might" }],
      ctx,
    )!;
    expect(summary.lines[0].text.some((s) => s.kind === "card" && s.cardId === "raid")).toBe(true);
    expect(summary.lines[0].text.some((s) => s.kind === "faction")).toBe(true);
  });
});
