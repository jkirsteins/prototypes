import { describe, it, expect } from "vitest";
import {
  META_STORAGE_KEY, applyPack, bankRun, buildPlayerDeck, collectedCount,
  initialMeta, loadMeta, memoryStorage, pendingPacks, resetMeta, saveMeta,
} from "../src/meta";
import { ACQUIRABLE_CARDS, DECK_SIZE } from "../src/cards";

const rec = (over: Partial<ReturnType<typeof initialMeta>> = {}) => ({
  ...initialMeta(), ...over,
});

describe("storage round-trip", () => {
  it("starts you knowing turnips plus Raid, Subjugate and Fortify", () => {
    expect(loadMeta(memoryStorage())).toEqual({
      knownCards: ["grow-crops", "raid", "subjugate", "fortify"],
      xp: 0, turnipsGrown: 0, packsOpened: 0,
    });
  });

  it("save/load round-trips under the exact key", () => {
    const s = memoryStorage();
    const m = rec({ knownCards: [...initialMeta().knownCards, "alliance"], xp: 90, turnipsGrown: 12, packsOpened: 2 });
    saveMeta(s, m);
    expect(s.getItem(META_STORAGE_KEY)).not.toBeNull();
    expect(loadMeta(s)).toEqual(m);
  });

  it("falls back silently on corrupt data", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, "{not json");
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify({ knownCards: "nope" }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("falls back on an old witnessing-era record", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("rejects negative or non-numeric counters", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify(rec({ xp: -5 })));
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify(rec({ turnipsGrown: "lots" })));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("prunes unknown ids and re-adds the starting cards", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["alliance", "gone-card", "pay-tribute"],
      xp: 10, turnipsGrown: 0, packsOpened: 0,
    }));
    expect(loadMeta(s).knownCards).toEqual([
      "grow-crops", "raid", "subjugate", "fortify", "alliance",
    ]);
  });

  it("resetMeta wipes storage and returns the initial record", () => {
    const s = memoryStorage();
    saveMeta(s, rec({ xp: 500 }));
    expect(resetMeta(s)).toEqual(initialMeta());
    expect(s.getItem(META_STORAGE_KEY)).toBeNull();
  });
});

describe("pendingPacks", () => {
  it("is zero on a fresh record", () => {
    expect(pendingPacks(initialMeta())).toBe(0);
  });

  it("counts XP levels not yet opened", () => {
    expect(pendingPacks(rec({ xp: 25 }))).toBe(1);
    expect(pendingPacks(rec({ xp: 75 }))).toBe(2);
    expect(pendingPacks(rec({ xp: 75, packsOpened: 2 }))).toBe(0);
  });

  it("adds hidden turnip milestone packs on top of XP levels", () => {
    expect(pendingPacks(rec({ xp: 25, turnipsGrown: 10 }))).toBe(2);
    expect(pendingPacks(rec({ xp: 0, turnipsGrown: 100 }))).toBe(2);
  });

  it("never goes negative if packsOpened somehow runs ahead", () => {
    expect(pendingPacks(rec({ xp: 0, packsOpened: 3 }))).toBe(0);
  });
});

describe("bankRun", () => {
  it("adds a run's XP and turnips to the lifetime totals", () => {
    const next = bankRun(rec({ xp: 30, turnipsGrown: 4 }), 45, 3);
    expect(next.xp).toBe(75);
    expect(next.turnipsGrown).toBe(7);
  });

  it("ignores a nonsense run total rather than corrupting progress", () => {
    const before = rec({ xp: 30 });
    expect(bankRun(before, Number.NaN, 0).xp).toBe(30);
    expect(bankRun(before, -10, 0).xp).toBe(30);
  });
});

describe("applyPack", () => {
  it("learns new cards, counts the pack, and flags what was new", () => {
    const before = initialMeta();
    const { meta, results } = applyPack(before, ["alliance", "bodyguard"]);
    expect(meta.knownCards).toContain("alliance");
    expect(meta.knownCards).toContain("bodyguard");
    expect(meta.packsOpened).toBe(1);
    expect(results).toEqual([
      { id: "alliance", isNew: true }, { id: "bodyguard", isNew: true },
    ]);
  });

  it("marks a duplicate as already known without adding it twice", () => {
    const { meta } = applyPack(initialMeta(), ["alliance", "alliance"]);
    expect(meta.knownCards.filter((id) => id === "alliance")).toHaveLength(1);
    const { results } = applyPack(meta, ["alliance", "bodyguard"]);
    expect(results).toEqual([
      { id: "alliance", isNew: false }, { id: "bodyguard", isNew: true },
    ]);
  });

  it("flags the second copy inside one pack as already known", () => {
    const { results } = applyPack(initialMeta(), ["alliance", "alliance"]);
    expect(results).toEqual([
      { id: "alliance", isNew: true }, { id: "alliance", isNew: false },
    ]);
  });

  it("counts an empty pack as opened so it cannot loop forever", () => {
    expect(applyPack(initialMeta(), []).meta.packsOpened).toBe(1);
  });
});

describe("collectedCount", () => {
  it("counts only acquirable cards, not the ones you start with", () => {
    expect(collectedCount(initialMeta())).toBe(0);
    const { meta } = applyPack(initialMeta(), ["alliance", "bodyguard"]);
    expect(collectedCount(meta)).toBe(2);
    expect(ACQUIRABLE_CARDS).toHaveLength(9);
  });
});

describe("buildPlayerDeck", () => {
  it("fills to DECK_SIZE with turnips and drops unknown picks", () => {
    const deck = buildPlayerDeck(
      ["grow-crops", "raid", "subjugate"], ["raid", "alliance", "raid"],
    );
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter((id) => id === "raid")).toHaveLength(1);
    expect(deck).not.toContain("alliance");
    expect(deck.filter((id) => id === "grow-crops")).toHaveLength(DECK_SIZE - 1);
  });
});
