import { describe, it, expect } from "vitest";
import {
  SUBJUGATE_THRESHOLD, isCardPlayable, playableSet, validTargetsFor,
  type RulesView,
} from "../src/playability";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";

const ORDER = ["alpha", "beta", "gamma", "delta"];
const LINE_ADJ = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};

function view(partial: Partial<RulesView> = {}): RulesView {
  return {
    relations: {},
    overlords: new Map(),
    incorporated: {},
    adjacency: LINE_ADJ,
    factionIds: ORDER,
    ...partial,
  };
}

/** relations where actor leads target by n might */
function mightLead(actor: string, target: string, n: number): Relations {
  let rel: Relations = {};
  for (let i = 0; i < n; i++) rel = bumpMight(rel, actor, target);
  return rel;
}

describe("validTargetsFor", () => {
  it("raid and marriage reach adjacency; raid excludes the overlord, marriage includes it", () => {
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha"]);
    expect(validTargetsFor(v, "beta", "shrewd-marriage")).toEqual(["alpha", "gamma"]);
  });

  it("marriage adds a non-adjacent overlord", () => {
    // delta subjugated by alpha (not adjacent to delta's realm)
    const v = view({ overlords: new Map([["delta", "alpha"]]) });
    expect(validTargetsFor(v, "delta", "shrewd-marriage")).toEqual(["alpha", "gamma"]);
    expect(validTargetsFor(v, "delta", "raid")).toEqual(["gamma"]);
  });

  it("subjugate requires a lead of SUBJUGATE_THRESHOLD on either track", () => {
    expect(SUBJUGATE_THRESHOLD).toBe(2);
    const v1 = view({ relations: mightLead("beta", "gamma", 1) });
    expect(validTargetsFor(v1, "beta", "subjugate")).toEqual([]);
    const v2 = view({ relations: mightLead("beta", "gamma", 2) });
    expect(validTargetsFor(v2, "beta", "subjugate")).toEqual(["gamma"]);
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha");
    expect(validTargetsFor(view({ relations: rel }), "beta", "subjugate")).toEqual(["alpha"]);
  });

  it("subjugate excludes own vassals, incorporated lands, and is dead while subjugated", () => {
    const rel = mightLead("beta", "gamma", 2);
    const own = view({ relations: rel, overlords: new Map([["gamma", "beta"]]) });
    expect(validTargetsFor(own, "beta", "subjugate")).toEqual([]);
    const inc = view({ relations: rel, incorporated: { gamma: "delta" } });
    expect(validTargetsFor(inc, "beta", "subjugate")).toEqual([]);
    const sub = view({ relations: rel, overlords: new Map([["beta", "alpha"]]) });
    expect(validTargetsFor(sub, "beta", "subjugate")).toEqual([]);
  });

  it("incorporate targets own vassals only, dead while subjugated", () => {
    const v = view({ overlords: new Map([["gamma", "beta"], ["alpha", "delta"]]) });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
    const sub = view({
      overlords: new Map([["gamma", "beta"], ["beta", "alpha"]]),
    });
    expect(validTargetsFor(sub, "beta", "incorporate")).toEqual([]);
  });

  it("a vassal's neighbors extend the realm's reach", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha", "gamma", "delta"]);
  });

  it("incorporated factions are never targets but extend reach", () => {
    const v = view({ incorporated: { gamma: "beta" } });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha", "delta"]);
  });

  it("vassals and poach targets stay raidable; incorporated lands are not", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { alpha: "delta" },
    });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["gamma", "delta"]);
  });
});

describe("isCardPlayable", () => {
  it("grow-crops and fortify always; tribute only while subjugated", () => {
    const free = view();
    expect(isCardPlayable(free, "beta", "grow-crops")).toBe(true);
    expect(isCardPlayable(free, "beta", "fortify")).toBe(true);
    expect(isCardPlayable(free, "beta", "pay-tribute")).toBe(false);
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(isCardPlayable(sub, "beta", "pay-tribute")).toBe(true);
  });

  it("reclaim needs subjugation AND the overlord's lead below 2 on both tracks", () => {
    const base = { overlords: new Map([["beta", "alpha"]]) };
    expect(isCardPlayable(view(), "beta", "reclaim-independence")).toBe(false);
    expect(
      isCardPlayable(view({ ...base, relations: mightLead("alpha", "beta", 2) }),
        "beta", "reclaim-independence"),
    ).toBe(false);
    expect(
      isCardPlayable(view({ ...base, relations: mightLead("alpha", "beta", 1) }),
        "beta", "reclaim-independence"),
    ).toBe(true);
    expect(
      isCardPlayable(view(base), "beta", "reclaim-independence"),
    ).toBe(true);
  });

  it("targeted cards are playable iff a target exists", () => {
    expect(isCardPlayable(view(), "beta", "raid")).toBe(true);
    expect(isCardPlayable(view(), "beta", "subjugate")).toBe(false);
    expect(isCardPlayable(view(), "beta", "incorporate")).toBe(false);
  });
});

describe("playableSet", () => {
  it("forced tribute overrides everything else", () => {
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const set = playableSet(sub, "beta", ["raid", "pay-tribute", "grow-crops"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1] });
  });

  it("returns the playable indexes in hand order", () => {
    const set = playableSet(view(), "beta", ["subjugate", "grow-crops", "raid"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1, 2] });
  });

  it("falls back to discard mode over the whole hand", () => {
    const set = playableSet(view(), "beta", ["subjugate", "incorporate"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0, 1] });
  });

  it("a stale tribute in a free hand is not forced and not playable", () => {
    const set = playableSet(view(), "beta", ["pay-tribute"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0] });
  });
});

describe("reach through incorporated lands and scaled thresholds", () => {
  it("adjacency to an incorporated land grants reach to its owner", () => {
    // map: me -adjacent- deadland; deadland incorporated into owner;
    // owner's home NOT adjacent to me. Raid targets must include owner,
    // never deadland.
    const v: RulesView = {
      relations: {},
      overlords: new Map(),
      incorporated: { deadland: "owner" },
      adjacency: { me: ["deadland"], deadland: ["me", "owner"], owner: ["deadland"] },
      factionIds: ["me", "deadland", "owner"],
    };
    const targets = validTargetsFor(v, "me", "raid");
    expect(targets).toContain("owner");
    expect(targets).not.toContain("deadland");
  });

  it("subjugate threshold scales with the target realm size", () => {
    // target owns one incorporated land -> realm size 2 -> needs lead 4
    const base: RulesView = {
      relations: {},
      overlords: new Map(),
      incorporated: { land: "target" },
      adjacency: { me: ["target"], target: ["me"], land: ["me"] },
      factionIds: ["me", "target", "land"],
    };
    let rel: Relations = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "me", "target");
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).not.toContain("target");
    rel = bumpMight(rel, "me", "target"); // lead 4 = 2 x realm size 2
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).toContain("target");
  });

  it("reclaim scales with the overlord realm size", () => {
    // overlord realm size 2 -> grip threshold 4: leads of 3 still reclaimable
    const v: RulesView = {
      relations: {},
      overlords: new Map([["me", "lord"]]),
      incorporated: { land: "lord" },
      adjacency: { me: ["lord"], lord: ["me"], land: ["me"] },
      factionIds: ["me", "lord", "land"],
    };
    let rel: Relations = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "lord", "me");
    expect(isCardPlayable({ ...v, relations: rel }, "me", "reclaim-independence")).toBe(true);
    rel = bumpMight(rel, "lord", "me"); // lead 4 meets the scaled grip
    expect(isCardPlayable({ ...v, relations: rel }, "me", "reclaim-independence")).toBe(false);
  });
});
