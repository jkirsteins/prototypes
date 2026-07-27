import { describe, it, expect } from "vitest";
import {
  META_STORAGE_KEY, buildPlayerDeck, initialMeta, loadMeta, memoryStorage,
  mergeSeen, resetMeta, saveMeta, unlockCard,
} from "../src/meta";
import { DECK_SIZE } from "../src/cards";

describe("storage round-trip", () => {
  it("loads the initial record when storage is empty", () => {
    expect(loadMeta(memoryStorage())).toEqual({
      knownCards: ["grow-crops"], seenPool: [],
    });
  });

  it("save/load round-trips under the exact key", () => {
    const s = memoryStorage();
    saveMeta(s, { knownCards: ["grow-crops", "raid"], seenPool: ["fortify"] });
    expect(s.getItem(META_STORAGE_KEY)).not.toBeNull();
    expect(loadMeta(s)).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("falls back silently on corrupt data", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, "{not json");
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify({ knownCards: "nope" }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("prunes unknown and non-deck-buildable ids, keeps grow-crops known", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["raid", "gone-card", "pay-tribute"],
      seenPool: ["fortify", "raid", "also-gone"],
    }));
    // raid stays known; pool drops already-known raid and unknown ids
    expect(loadMeta(s)).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("resetMeta wipes storage and returns the initial record", () => {
    const s = memoryStorage();
    saveMeta(s, { knownCards: ["grow-crops", "raid"], seenPool: [] });
    expect(resetMeta(s)).toEqual(initialMeta());
    expect(s.getItem(META_STORAGE_KEY)).toBeNull();
  });
});

describe("unlockCard", () => {
  it("moves a pooled card to known", () => {
    const m = { knownCards: ["grow-crops"], seenPool: ["raid", "fortify"] };
    expect(unlockCard(m, "raid")).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("returns the same reference when the card is not in the pool", () => {
    const m = { knownCards: ["grow-crops"], seenPool: [] };
    expect(unlockCard(m, "raid")).toBe(m);
  });
});

describe("mergeSeen", () => {
  it("adds unlockable candidates, skipping known/pooled/non-buildable", () => {
    const m = { knownCards: ["grow-crops", "raid"], seenPool: ["fortify"] };
    const out = mergeSeen(m, ["raid", "fortify", "subjugate", "pay-tribute", "grow-crops", "nope"]);
    expect(out).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify", "subjugate"],
    });
  });

  it("returns the same reference when nothing is new", () => {
    const m = { knownCards: ["grow-crops"], seenPool: ["raid"] };
    expect(mergeSeen(m, ["raid", "grow-crops"])).toBe(m);
  });
});

describe("buildPlayerDeck", () => {
  it("fills with grow-crops to exactly DECK_SIZE", () => {
    const deck = buildPlayerDeck(["grow-crops", "raid"], ["raid"]);
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter((c) => c === "raid")).toHaveLength(1);
    expect(deck.filter((c) => c === "grow-crops")).toHaveLength(DECK_SIZE - 1);
  });

  it("enforces known-only, max 1 each, and drops basics from the selection", () => {
    const deck = buildPlayerDeck(
      ["grow-crops", "raid"],
      ["raid", "raid", "subjugate", "grow-crops", "pay-tribute"],
    );
    expect(deck.filter((c) => c === "raid")).toHaveLength(1);
    expect(deck.filter((c) => c === "subjugate")).toHaveLength(0);
    expect(deck.filter((c) => c === "pay-tribute")).toHaveLength(0);
    expect(deck).toHaveLength(DECK_SIZE);
  });

  it("empty selection yields an all-grow-crops deck", () => {
    expect(buildPlayerDeck(["grow-crops"], [])).toEqual(
      Array.from({ length: DECK_SIZE }, () => "grow-crops"),
    );
  });
});
