import { describe, it, expect } from "vitest";
import {
  SUBJUGATE_THRESHOLD, borderStrength, isCardPlayable, playableSet, subjugationGripOn,
  subjugationRequirement, targetEligibilityFor, threatsTo, validTargetsFor,
  type RulesView,
} from "../src/playability";
import { allianceKey, bumpMight, bumpStatus, type Relations } from "../src/relations";

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
    alliances: {},
    turn: 1,
    bodyguards: [],
    omens: [],
    ...partial,
  };
}

/** relations where actor leads target by n might */
function mightLead(actor: string, target: string, n: number): Relations {
  let rel: Relations = {};
  for (let i = 0; i < n; i++) rel = bumpMight(rel, actor, target);
  return rel;
}

describe("subjugationRequirement", () => {
  it("is 2 per land of the target's realm", () => {
    const v = view();
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(SUBJUGATE_THRESHOLD);
  });

  it("counts the target's vassals, which is what surprises players", () => {
    // beta holds gamma: two lands, so the bar doubles from 2 to 4.
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(4);
  });

  it("counts lands the target has incorporated", () => {
    const v = view({ incorporated: { gamma: "beta" } });
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(4);
  });

  it("is null where Subjugate could never apply", () => {
    expect(subjugationRequirement(view(), "alpha", "alpha")).toBeNull();
    expect(
      subjugationRequirement(view({ incorporated: { beta: "gamma" } }), "alpha", "beta"),
    ).toBeNull();
    expect(
      subjugationRequirement(view({ overlords: new Map([["beta", "alpha"]]) }), "alpha", "beta"),
    ).toBeNull();
    expect(
      subjugationRequirement(view({ overlords: new Map([["alpha", "delta"]]) }), "alpha", "beta"),
    ).toBeNull();
  });

  it("agrees with the number the block reason reports", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    const entry = targetEligibilityFor(v, "alpha", "subjugate")
      .find((e) => e.factionId === "beta");
    const reason =
      entry?.state === "blocked"
        ? entry.reasons.find((r) => r.code === "insufficient-lead")
        : undefined;
    expect(reason?.code === "insufficient-lead" ? reason.requiredLead : null)
      .toBe(subjugationRequirement(v, "alpha", "beta"));
  });
});

describe("subjugationGripOn", () => {
  it("is 2 per land of the faction's realm, with no eligibility guards", () => {
    // beta holds gamma: two lands.
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(subjugationGripOn(v, "beta")).toBe(4);
    expect(subjugationGripOn(v, "alpha")).toBe(2);
  });

  it("is the number subjugationRequirement quotes when the pair is legal", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(subjugationGripOn(v, "beta"));
  });
});

describe("targetEligibilityFor", () => {
  it("keeps another overlord's vassal as its own Raid candidate", () => {
    const v = view({ overlords: new Map([["gamma", "delta"]]) });
    expect(targetEligibilityFor(v, "beta", "raid")).toContainEqual({
      state: "available",
      factionId: "gamma",
    });
  });

  it("reports every visible Subjugate blocker in stable order", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 9 };
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      alliances,
      turn: 4,
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "alliance", expiresTurn: 9 },
        {
          code: "insufficient-lead",
          requiredLead: 2,
          mightLead: 0,
          statusLead: 0,
          realmSize: 1,
        },
      ],
    });
  });

  it("reports scaled Subjugate values", () => {
    let relations: Relations = {};
    relations = bumpMight(relations, "beta", "gamma");
    const v = view({
      relations,
      incorporated: { alpha: "gamma" },
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{
        code: "insufficient-lead",
        requiredLead: 4,
        mightLead: 1,
        statusLead: 0,
        realmSize: 2,
      }],
    });
  });

  it("omits faraway factions as irrelevant candidates", () => {
    const result = targetEligibilityFor(view(), "beta", "subjugate");
    expect(result.find((entry) => entry.factionId === "delta")?.state)
      .toBe("irrelevant");
  });
});

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

  it("incorporate excludes a vassal allied with its overlord while the pact holds", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 5 };
    const allied = view({
      overlords: new Map([["gamma", "beta"]]), alliances, turn: 4,
    });
    expect(validTargetsFor(allied, "beta", "incorporate")).toEqual([]);
    const expired = view({
      overlords: new Map([["gamma", "beta"]]), alliances, turn: 5,
    });
    expect(validTargetsFor(expired, "beta", "incorporate")).toEqual(["gamma"]);
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
      alliances: {},
      turn: 1,
      bodyguards: [],
      omens: [],
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
      alliances: {},
      turn: 1,
      bodyguards: [],
      omens: [],
    };
    let rel: Relations = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "me", "target");
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).not.toContain("target");
    rel = bumpMight(rel, "me", "target"); // lead 4 = 2 x realm size 2
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).toContain("target");
  });

});

describe("alliances", () => {
  it("blocks hostile targeted cards both directions while active", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 10 };
    const v = view({ alliances, turn: 1 });
    expect(validTargetsFor(v, "beta", "raid")).not.toContain("gamma");
    expect(validTargetsFor(v, "gamma", "raid")).not.toContain("beta");
    expect(validTargetsFor(v, "beta", "shrewd-marriage")).not.toContain("gamma");
    expect(validTargetsFor(v, "gamma", "shrewd-marriage")).not.toContain("beta");
    expect(validTargetsFor(v, "beta", "assassinate-ruler")).not.toContain("gamma");
    expect(validTargetsFor(v, "gamma", "assassinate-ruler")).not.toContain("beta");
    const rel = mightLead("beta", "gamma", 2);
    expect(
      validTargetsFor({ ...v, relations: rel }, "beta", "subjugate"),
    ).not.toContain("gamma");
  });

  it("assassinate-ruler and raid share the same reach rule (excludes the actor's overlord)", () => {
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha"]);
    expect(validTargetsFor(v, "beta", "assassinate-ruler")).toEqual(["alpha"]);
  });

  it("expires at turn >= expiry, freeing both sides again", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 5 };
    const stillActive = view({ alliances, turn: 4 });
    expect(validTargetsFor(stillActive, "beta", "raid")).not.toContain("gamma");
    const expired = view({ alliances, turn: 5 });
    expect(validTargetsFor(expired, "beta", "raid")).toContain("gamma");
  });

  it("alliance targets reach like marriage (overlord always courtable) and allow renewal targeting existing allies", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 10 };
    const v = view({ overlords: new Map([["delta", "alpha"]]), alliances, turn: 1 });
    // delta's overlord alpha is courtable though not adjacent to delta's realm
    expect(validTargetsFor(v, "delta", "alliance")).toContain("alpha");
    // beta is already allied with gamma: re-targeting gamma renews the pact,
    // so it remains a valid alliance target rather than being excluded.
    expect(validTargetsFor(view({ alliances, turn: 1 }), "beta", "alliance")).toContain("gamma");
    expect(validTargetsFor(view({ alliances, turn: 1 }), "beta", "alliance")).toContain("alpha");
  });

  it("extended-diplomacy is always playable, like grow-crops/fortify", () => {
    expect(isCardPlayable(view(), "beta", "extended-diplomacy")).toBe(true);
  });
});

describe("bodyguard", () => {
  it("playable only when the actor is not already guarded (no stacking)", () => {
    expect(isCardPlayable(view({ bodyguards: [] }), "beta", "bodyguard")).toBe(true);
    expect(isCardPlayable(view({ bodyguards: ["beta"] }), "beta", "bodyguard")).toBe(false);
    // another faction's guard does not block beta
    expect(isCardPlayable(view({ bodyguards: ["gamma"] }), "beta", "bodyguard")).toBe(true);
  });
});

describe("borderStrength", () => {
  it("counts one for a lone faction touching the target", () => {
    expect(borderStrength(view(), "alpha", "beta")).toBe(1);
  });

  it("counts the actor's vassals that touch the target", () => {
    // alpha holds gamma as a vassal. alpha touches beta, gamma touches beta.
    const v = view({ overlords: new Map([["gamma", "alpha"]]) });
    expect(borderStrength(v, "alpha", "beta")).toBe(2);
  });

  it("counts lands the actor has incorporated", () => {
    const v = view({ incorporated: { gamma: "alpha" } });
    expect(borderStrength(v, "alpha", "beta")).toBe(2);
  });

  it("counts lands the target has incorporated as the target", () => {
    // beta is dead land owned by gamma, so alpha's border with beta is a
    // border with gamma.
    const v = view({ incorporated: { beta: "gamma" } });
    expect(borderStrength(v, "alpha", "gamma")).toBe(1);
  });

  it("does not count the target's vassals as the target", () => {
    // beta is gamma's vassal, not gamma's land. alpha touches beta only, so
    // alpha has no border with gamma at all - which is also why Raid on gamma
    // is not legal here.
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(borderStrength(v, "alpha", "gamma")).toBe(0);
    expect(validTargetsFor(v, "alpha", "raid")).not.toContain("gamma");
  });

  it("never yields 0 for a target Raid actually allows", () => {
    // The invariant the whole design leans on: legality and the gain are
    // derived from one adjacency resolution, so they cannot disagree.
    const v = view({
      overlords: new Map([["gamma", "alpha"]]),
      incorporated: { delta: "beta" },
    });
    for (const actor of ORDER) {
      for (const target of validTargetsFor(v, actor, "raid")) {
        expect(borderStrength(v, actor, target)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("favourable-omens legality", () => {
  it("is playable when no reading is held", () => {
    expect(isCardPlayable(view(), "alpha", "favourable-omens")).toBe(true);
  });

  it("is not playable while a reading is already held", () => {
    expect(
      isCardPlayable(view({ omens: ["alpha"] }), "alpha", "favourable-omens"),
    ).toBe(false);
  });

  it("is unaffected by another faction's reading", () => {
    expect(
      isCardPlayable(view({ omens: ["beta"] }), "alpha", "favourable-omens"),
    ).toBe(true);
  });
});

describe("threatsTo", () => {
  it("reports a faction that can subjugate now at shortfall 0 or less", () => {
    // alpha and beta are adjacent; beta's realm is 1 land, so the bar is 2.
    // gamma is also adjacent to beta and so is also a threat, just a distant
    // one: threatsTo reports everyone who COULD take beta given enough lead,
    // and leaves the filtering to its callers. alpha sorts first on shortfall.
    const v = view({ relations: mightLead("alpha", "beta", 2) });
    const threats = threatsTo(v, "beta");
    expect(threats[0]).toMatchObject({ factionId: "alpha", shortfall: 0 });
    expect(threats.map((t) => t.factionId)).toEqual(["alpha", "gamma"]);
  });

  it("reports how much lead a threat still needs, per track", () => {
    const v = view({ relations: mightLead("alpha", "beta", 1) });
    const [t] = threatsTo(v, "beta");
    expect(t.shortfall).toBe(1);
    expect(t.mightShortfall).toBe(1);
    expect(t.statusShortfall).toBe(SUBJUGATE_THRESHOLD);
  });

  it("counts a faction with no lead at all as a threat needing the full bar", () => {
    expect(threatsTo(view(), "beta").map((t) => t.factionId)).toEqual([
      "alpha", "gamma",
    ]);
  });

  it("ignores factions out of reach", () => {
    // delta is two steps from beta on the line map
    expect(threatsTo(view(), "beta").map((t) => t.factionId)).not.toContain("delta");
  });

  it("ignores a faction whose pact with this one is still active", () => {
    const v = view({ alliances: { [allianceKey("alpha", "beta")]: 10 }, turn: 1 });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("ignores a subjugated faction, which cannot subjugate anyone", () => {
    const v = view({ overlords: new Map([["alpha", "delta"]]) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("ignores this faction's own overlord, which already holds it", () => {
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("sorts by shortfall, then by faction order", () => {
    // gamma is 1 short, alpha is 2 short: gamma first despite sorting later
    const v = view({ relations: mightLead("gamma", "beta", 1) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).toEqual(["gamma", "alpha"]);
  });

  it("scales with the threatened faction's own realm", () => {
    // beta holds gamma: 2 lands, so the bar doubles and a lead of 2 is short
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(threatsTo(v, "beta")[0].shortfall).toBe(2);
  });
});
