import { describe, it, expect } from "vitest";
import { pact, settledOnce, siteCaps } from "./helpers";
import {
  INCORPORATE_RAMP, PASSIVE_PER_LANDS, POACH_CHANCE, PROWESS_PER_REDUCTION,
  REVOLT_BASE_THRESHOLD, SEAT_BAR_BONUS, SEAT_RAID_BONUS,
  SUBJUGATE_THRESHOLD, annexedLandsOf, borderStrength, cardBlockReason,
  gripPartsOn, handBlockReason,
  incorporationChance, passiveFortifyFor, prowessReductionFor, raidGainFor,
  raidYield,
  isCardPlayable, loyaltyKey, overlordGrip, playableSet, poachSurchargeOn,
  reachOf, respiteExpiry, revoltRequirement, seatOf, sharedNeighboursOf,
  subjugationChance, subjugationGripOn, subjugationRaceFor,
  subjugationRequirement, targetEligibilityFor, threatsTo, validTargetsFor,
  wealthIncomeFor,
  type RulesView,
} from "../src/playability";
import { TRIBUTE_CARDS } from "../src/cards";
import { allianceKey, bumpMight, type Relations } from "../src/relations";

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
    guards: {},
    omens: {},
    diplomacyBoost: [],
    loyalty: {},
    liveRevolts: [],
    hostages: {},
    wealth: {},
    respites: {},
    siteCaps: siteCaps(ORDER),
    settlements: {},
    booms: {},
    prowess: {},
    seats: {},
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
    // beta holds gamma: two lands, so the bar doubles.
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
    // the actor's own liege - anywhere in the chain - can never be taken
    expect(
      subjugationRequirement(view({ overlords: new Map([["alpha", "beta"]]) }), "alpha", "beta"),
    ).toBeNull();
  });

  it("answers for a vassal actor aiming at a non-liege", () => {
    const v = view({ overlords: new Map([["alpha", "delta"]]) });
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(SUBJUGATE_THRESHOLD);
  });

  it("counts the whole pyramid: vassals of vassals and their annexations", () => {
    // beta holds gamma, gamma holds delta, delta has annexed epsilon,
    // and a settlement stands founded in delta.
    const v = view({
      factionIds: ["alpha", "beta", "gamma", "delta", "epsilon"],
      overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]),
      incorporated: { epsilon: "delta" },
      settlements: { delta: 1 },
    });
    // 4 lands (beta, gamma, delta, epsilon): 2 each, +1 settlement.
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(9);
  });

  it("agrees with the number the block reason reports", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    const entry = targetEligibilityFor(v, "alpha", "subjugate")
      .find((e) => e.factionId === "beta");
    const reason =
      entry?.state === "blocked"
        ? entry.reasons.find((r) => r.code === "insufficient-lead")
        : undefined;
    expect(reason?.code === "insufficient-lead" ? reason.required : null)
      .toEqual(subjugationRequirement(v, "alpha", "beta"));
  });
});

describe("vassal actors", () => {
  it("a vassal may Subjugate a free faction in reach", () => {
    // alpha is delta's vassal; alpha leads beta enough to take it
    const v = view({
      overlords: new Map([["alpha", "delta"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(validTargetsFor(v, "alpha", "subjugate")).toContain("beta");
  });

  it("a vassal may Incorporate its own vassal", () => {
    // gamma -> beta -> alpha: beta is a mid-lord digesting gamma
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      loyalty: { [loyaltyKey("gamma", "beta")]: INCORPORATE_RAMP },
    });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
  });

  it("no faction in the actor's own overlord chain is subjugable (liege)", () => {
    // gamma -> beta -> alpha; gamma has crushing leads over both. A full
    // graph, so the transitive liege is in reach and the refusal is the
    // liege rule rather than distance.
    const v = view({
      adjacency: {
        alpha: ["beta", "gamma", "delta"], beta: ["alpha", "gamma", "delta"],
        gamma: ["alpha", "beta", "delta"], delta: ["alpha", "beta", "gamma"],
      },
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      relations: {
        ...mightLead("gamma", "beta", 50),
        ...mightLead("gamma", "alpha", 50),
      },
    });
    const entries = targetEligibilityFor(v, "gamma", "subjugate");
    for (const liege of ["beta", "alpha"]) {
      const entry = entries.find((e) => e.factionId === liege);
      expect(entry?.state).toBe("blocked");
      if (entry?.state === "blocked") {
        expect(entry.reasons.map((r) => r.code)).toContain("liege");
      }
    }
    expect(subjugationRequirement(v, "gamma", "beta")).toBeNull();
    expect(subjugationRequirement(v, "gamma", "alpha")).toBeNull();
  });

  it("a lord may poach its own grand-vassal, flattening the pyramid", () => {
    // gamma -> beta -> alpha: alpha aims at gamma, which is beta's vassal
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      relations: mightLead("alpha", "gamma", 20),
    });
    expect(validTargetsFor(v, "alpha", "subjugate")).toContain("gamma");
    expect(subjugationChance(v, "gamma")).toBe(POACH_CHANCE);
  });

  it("a vassal with the lead now appears among threats", () => {
    // beta is alpha's vassal but leads gamma; adjacency puts gamma in reach
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      relations: mightLead("beta", "gamma", 2),
    });
    expect(threatsTo(v, "gamma").map((t) => t.factionId)).toContain("beta");
  });
});

describe("full-realm reach", () => {
  it("reach extends through a vassal's vassal", () => {
    // gamma -> beta -> alpha on the line map: gamma's border is alpha's now
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(reachOf(v, "alpha").has("delta")).toBe(true);
  });

  it("borderStrength counts bordering lands from the whole pyramid", () => {
    // delta -> gamma -> beta, and alpha touches beta AND the grand-vassal
    // delta: the direct realm gives 1 bordering land, the pyramid gives 2.
    const v = view({
      adjacency: {
        alpha: ["beta", "delta"], beta: ["alpha", "gamma"],
        gamma: ["beta", "delta"], delta: ["gamma", "alpha"],
      },
      overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]),
    });
    expect(borderStrength(v, "beta", "alpha")).toBe(2);
  });

  it("a pact never buys a lead over the ally's grand-vassal", () => {
    // delta -> gamma -> beta; alpha allies beta, and delta borders alpha
    const v = view({
      adjacency: {
        alpha: ["beta", "delta"], beta: ["alpha", "gamma"],
        gamma: ["beta", "delta"], delta: ["gamma", "alpha"],
      },
      overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]),
    });
    expect(sharedNeighboursOf(v, "alpha", "beta")).toEqual([]);
  });

  it("Found a settlement reaches a grand-vassal's land", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(validTargetsFor(v, "alpha", "found-settlement")).toContain("gamma");
  });
});

describe("found a settlement", () => {
  it("offers every land of the realm with a free, unsettled site", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { delta: "beta" },
      siteCaps: siteCaps(["beta", "gamma", "delta"]),
    });
    expect(validTargetsFor(v, "beta", "found-settlement"))
      .toEqual(["beta", "gamma", "delta"]);
  });

  it("leaves lands outside the realm irrelevant, not blocked", () => {
    const entries = targetEligibilityFor(view(), "beta", "found-settlement");
    expect(entries.find((e) => e.factionId === "alpha")?.state).toBe("irrelevant");
    expect(entries.find((e) => e.factionId === "beta")?.state).toBe("available");
  });

  it("blocks a land at its allowance and a land with no site, by reason", () => {
    // One site authored and one settlement founded: the map has nothing left
    // to draw, so this is `no-free-site` rather than a population problem, and
    // no boom could ever help.
    const v = view({ siteCaps: siteCaps(["beta"]), settlements: { beta: 1 } });
    expect(targetEligibilityFor(v, "beta", "found-settlement")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "no-free-site" }],
    });
    const w = view({ siteCaps: {} });
    expect(targetEligibilityFor(w, "beta", "found-settlement")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "no-free-site" }],
    });
    // Room on the map, but the land already holds the two its people support.
    const x = view({
      siteCaps: siteCaps(["beta"], 3), settlements: { beta: 1 },
    });
    expect(targetEligibilityFor(x, "beta", "found-settlement")).toContainEqual({
      state: "blocked",
      factionId: "beta",
      reasons: [{ code: "needs-population", have: 2, allowance: 2 }],
    });
  });

  it("lifts the allowance block by one per held Population boom", () => {
    const at = (booms: number) =>
      view({
        siteCaps: siteCaps(["beta"], 5), settlements: { beta: 1 },
        booms: { beta: booms },
      });
    expect(validTargetsFor(at(0), "beta", "found-settlement")).toEqual([]);
    expect(validTargetsFor(at(1), "beta", "found-settlement")).toEqual(["beta"]);
    // Two settlements standing and two booms held: the allowance is 4, so the
    // land is legal, and would still be legal one settlement later.
    const deeper = view({
      siteCaps: siteCaps(["beta"], 5), settlements: { beta: 2 },
      booms: { beta: 2 },
    });
    expect(validTargetsFor(deeper, "beta", "found-settlement")).toEqual(["beta"]);
  });

  it("is a boom-holder's own allowance, not the land's owner's", () => {
    // beta plays the card on its vassal gamma's land. The allowance that
    // matters is beta's, because beta is the one settling.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      siteCaps: siteCaps(["beta", "gamma"], 4),
      settlements: { gamma: 1 },
      booms: { gamma: 3 },
    });
    expect(validTargetsFor(v, "beta", "found-settlement")).toEqual(["beta"]);
    expect(validTargetsFor({ ...v, booms: { beta: 1 } }, "beta", "found-settlement"))
      .toEqual(["beta", "gamma"]);
  });

  it("is unplayable when every land of the realm is blocked", () => {
    expect(isCardPlayable(view({ siteCaps: {} }), "beta", "found-settlement"))
      .toBe(false);
    expect(
      isCardPlayable(
        view({ siteCaps: siteCaps(["beta"]), settlements: { beta: 1 } }),
        "beta", "found-settlement",
      ),
    ).toBe(false);
    // Solvent and unblocked: playable. The default view is broke, and a
    // costed card is refused there before any land is asked - see below.
    expect(
      isCardPlayable(view({ wealth: { beta: 1 } }), "beta", "found-settlement"),
    ).toBe(true);
  });

  it("is refused before any land question while the treasury is short", () => {
    expect(cardBlockReason(view(), "beta", "found-settlement"))
      .toEqual({ code: "cannot-afford", cost: 1, held: 0 });
  });

  it("is not blocked by a pact with the land being settled", () => {
    // A pact blocks hostile cards. Settling your own vassal's land is not one,
    // and a vassal you allied with would otherwise become unbuildable.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      alliances: { [allianceKey("beta", "gamma")]: pact(9) },
      turn: 4,
    });
    expect(validTargetsFor(v, "beta", "found-settlement")).toContain("gamma");
  });

  it("is playable while subjugated - a vassal may still build", () => {
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(validTargetsFor(v, "beta", "found-settlement")).toEqual(["beta"]);
  });
});

describe("gripPartsOn", () => {
  it("adds one per settlement in the realm on top of two per land", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      settlements: settledOnce(["beta", "gamma"]),
    });
    // Two settlements raise the bar to 6.
    expect(gripPartsOn(v, "beta"))
      .toEqual({ lands: 2, settlements: 2, seat: 0, might: 6 });
    expect(subjugationGripOn(v, "beta")).toBe(6);
    expect(subjugationRequirement(v, "alpha", "beta")).toBe(6);
  });

  it("ignores settlements outside the realm", () => {
    const v = view({ settlements: settledOnce(["alpha", "gamma"]) });
    expect(gripPartsOn(v, "beta"))
      .toEqual({ lands: 1, settlements: 0, seat: 0, might: 2 });
  });

  it("reports the settlements behind an insufficient-lead block", () => {
    const v = view({ settlements: settledOnce(["gamma"]) });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{
        code: "insufficient-lead",
        required: 3,
        lead: 0,
        realmSize: 1,
        settlements: 1,
        poachSurcharge: 0,
        prowessReduction: 0,
      }],
    });
  });

  it("counts a settlement toward the threat a vassal poses to its lord", () => {
    // The lord's realm includes the vassal's land, so a settlement founded
    // there raises the lord's own bar too.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      settlements: settledOnce(["gamma"]),
    });
    expect(subjugationGripOn(v, "beta")).toBe(5);
  });
});

describe("subjugationGripOn", () => {
  it("is 2 per land, with no eligibility guards", () => {
    // beta holds gamma: two lands.
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(subjugationGripOn(v, "beta")).toBe(4);
    expect(subjugationGripOn(v, "alpha")).toBe(2);
  });

  it("is the number subjugationRequirement quotes when the pair is legal", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    expect(subjugationRequirement(v, "alpha", "beta"))
      .toEqual(subjugationGripOn(v, "beta"));
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
    const alliances = { [allianceKey("beta", "gamma")]: pact(9) };
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
          required: 2,
          lead: 0,
          realmSize: 1,
          settlements: 0,
          poachSurcharge: 0,
          prowessReduction: 0,
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
        required: 4,
        lead: 1,
        realmSize: 2,
        settlements: 0,
        poachSurcharge: 0,
        prowessReduction: 0,
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
  it("raid reaches adjacency and excludes the overlord", () => {
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha"]);
  });

  it("raid does not reach a non-adjacent overlord", () => {
    // delta subjugated by alpha (not adjacent to delta's realm)
    const v = view({ overlords: new Map([["delta", "alpha"]]) });
    expect(validTargetsFor(v, "delta", "raid")).toEqual(["gamma"]);
  });

  it("subjugate requires a Might lead of 2 per land", () => {
    expect(SUBJUGATE_THRESHOLD).toBe(2);
    const v1 = view({ relations: mightLead("beta", "gamma", 1) });
    expect(validTargetsFor(v1, "beta", "subjugate")).toEqual([]);
    const v2 = view({ relations: mightLead("beta", "gamma", 2) });
    expect(validTargetsFor(v2, "beta", "subjugate")).toEqual(["gamma"]);
  });

  it("subjugate excludes own vassals and incorporated lands, but not a vassal actor", () => {
    const rel = mightLead("beta", "gamma", 2);
    const own = view({ relations: rel, overlords: new Map([["gamma", "beta"]]) });
    expect(validTargetsFor(own, "beta", "subjugate")).toEqual([]);
    const inc = view({ relations: rel, incorporated: { gamma: "delta" } });
    expect(validTargetsFor(inc, "beta", "subjugate")).toEqual([]);
    // a vassal actor plays it like anyone else - only its liege is off-limits
    const sub = view({ relations: rel, overlords: new Map([["beta", "alpha"]]) });
    expect(validTargetsFor(sub, "beta", "subjugate")).toEqual(["gamma"]);
  });

  it("incorporate targets own vassals only, mid-lords included", () => {
    const v = view({ overlords: new Map([["gamma", "beta"], ["alpha", "delta"]]) });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
    // a mid-lord digests its own vassal even while owing fealty above
    const sub = view({
      overlords: new Map([["gamma", "beta"], ["beta", "alpha"]]),
    });
    expect(validTargetsFor(sub, "beta", "incorporate")).toEqual(["gamma"]);
  });

  it("incorporate excludes a vassal allied with its overlord while the pact holds", () => {
    const alliances = { [allianceKey("beta", "gamma")]: pact(5) };
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
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    for (const id of TRIBUTE_CARDS) {
      expect(isCardPlayable(free, "beta", id)).toBe(false);
      expect(isCardPlayable(sub, "beta", id)).toBe(true);
    }
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
    const set = playableSet(sub, "beta", ["raid", "pay-military-tribute", "grow-crops"]);
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
    const set = playableSet(view(), "beta", ["pay-military-tribute"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0] });
  });

  it("a dead hand degrades to discard mode by default", () => {
    const set = playableSet(view(), "beta", ["subjugate", "incorporate"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0, 1] });
  });

  it("with discards off, a dead hand stays in play mode with nothing to click", () => {
    const set = playableSet(view(), "beta", ["subjugate", "incorporate"], {
      discards: false,
    });
    expect(set).toEqual({ mode: "play", cardIndexes: [] });
  });

  it("with discards off, a forced tribute hand still monopolizes on the forced indexes", () => {
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const set = playableSet(
      sub, "beta", ["raid", "pay-military-tribute", "grow-crops"],
      { discards: false },
    );
    expect(set).toEqual({ mode: "play", cardIndexes: [1] });
  });

  it("with discards off, a playable hand is unchanged", () => {
    const set = playableSet(view(), "beta", ["subjugate", "grow-crops", "raid"], {
      discards: false,
    });
    expect(set).toEqual({ mode: "play", cardIndexes: [1, 2] });
  });
});

describe("handBlockReason", () => {
  it("a dead hand blocks nothing by default: discards are on the table", () => {
    expect(handBlockReason(view(), "beta", ["revolt"], "revolt")).toBeNull();
  });

  it("with discards off, a dead hand quotes the card's own reason instead", () => {
    const reason = handBlockReason(view(), "beta", ["revolt"], "revolt", {
      discards: false,
    });
    expect(reason).toEqual(cardBlockReason(view(), "beta", "revolt"));
    expect(reason).not.toBeNull();
  });

  it("with discards off, a playable card is still unblocked", () => {
    const hand = ["subjugate", "grow-crops", "raid"];
    const reason = handBlockReason(view(), "beta", hand, "grow-crops", {
      discards: false,
    });
    expect(reason).toBeNull();
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
      respites: {},
      adjacency: { me: ["deadland"], deadland: ["me", "owner"], owner: ["deadland"] },
      factionIds: ["me", "deadland", "owner"],
      loyalty: {},
      liveRevolts: [],
      hostages: {},
      wealth: {},
      alliances: {},
      turn: 1,
      guards: {},
      omens: {},
      diplomacyBoost: [],
      siteCaps: {},
      settlements: {},
      booms: {},
      prowess: {}, seats: {},
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
      respites: {},
      adjacency: { me: ["target"], target: ["me"], land: ["me"] },
      factionIds: ["me", "target", "land"],
      loyalty: {},
      liveRevolts: [],
      hostages: {},
      wealth: {},
      alliances: {},
      turn: 1,
      guards: {},
      omens: {},
      diplomacyBoost: [],
      siteCaps: {},
      settlements: {},
      booms: {},
      prowess: {}, seats: {},
    };
    let rel: Relations = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "me", "target");
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).not.toContain("target");
    rel = bumpMight(rel, "me", "target"); // lead 4 = 2 x realm size 2
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).toContain("target");
  });

});

describe("seatOf", () => {
  it("returns the seat land while the owner holds it outright", () => {
    expect(seatOf(view({ seats: { alpha: "alpha" } }), "alpha")).toBe("alpha");
    const v = view({ seats: { alpha: "beta" }, incorporated: { beta: "alpha" } });
    expect(seatOf(v, "alpha")).toBe("beta");
  });

  it("is undefined with no seat placed", () => {
    expect(seatOf(view(), "alpha")).toBeUndefined();
  });

  it("goes inert when the seat land is no longer directly held", () => {
    // beta was alpha's annexed seat land; the annexation record now names gamma.
    const v = view({ seats: { alpha: "beta" }, incorporated: { beta: "gamma" } });
    expect(seatOf(v, "alpha")).toBeUndefined();
  });

  it("goes inert while the owner is somebody's vassal", () => {
    const v = view({
      seats: { alpha: "alpha" },
      overlords: new Map([["alpha", "beta"]]),
    });
    expect(seatOf(v, "alpha")).toBeUndefined();
  });
});

describe("the seat on the subjugation bar", () => {
  it("adds SEAT_BAR_BONUS to the owner's bar, itemised as its own part", () => {
    const v = view({ seats: { beta: "beta" } });
    const parts = gripPartsOn(v, "beta");
    expect(parts.seat).toBe(SEAT_BAR_BONUS);
    expect(parts.might).toBe(SUBJUGATE_THRESHOLD + SEAT_BAR_BONUS);
    expect(subjugationRequirement(v, "alpha", "beta"))
      .toBe(SUBJUGATE_THRESHOLD + SEAT_BAR_BONUS);
  });

  it("adds nothing for an inert seat", () => {
    const v = view({
      seats: { beta: "gamma" },
      incorporated: { gamma: "delta" },
    });
    expect(gripPartsOn(v, "beta").seat).toBe(0);
    expect(gripPartsOn(v, "beta").might).toBe(SUBJUGATE_THRESHOLD);
  });

  it("guards the owner alone, never the owner's vassals", () => {
    const v = view({
      seats: { beta: "beta" },
      overlords: new Map([["gamma", "beta"]]),
    });
    expect(gripPartsOn(v, "gamma").seat).toBe(0);
  });
});

describe("the seat on raids", () => {
  it("adds SEAT_RAID_BONUS when the target neighbours the seat land", () => {
    // alpha's seat on its own land; beta is adjacent to alpha.
    const v = view({ seats: { alpha: "alpha" } });
    const { gain } = raidGainFor(v, "alpha", "beta");
    expect(gain).toBe(raidYield(1) + SEAT_RAID_BONUS);
  });

  it("adds nothing against a target away from the seat", () => {
    // alpha-beta-gamma line: alpha's seat touches only beta, and annexing
    // beta is what puts gamma in reach. One border land, no seat bonus.
    const v = view({
      seats: { alpha: "alpha" },
      incorporated: { beta: "alpha" },
    });
    const { gain } = raidGainFor(v, "alpha", "gamma");
    expect(gain).toBe(raidYield(1));
  });

  it("resolves the seat's neighbours through incorporated lands", () => {
    // delta's only border with alpha's seat runs through gamma, which delta
    // has annexed: the rider must still see delta as a neighbour.
    const v = view({
      seats: { alpha: "beta" },
      incorporated: { beta: "alpha", gamma: "delta" },
    });
    const { gain } = raidGainFor(v, "alpha", "delta");
    expect(gain).toBe(raidYield(1) + SEAT_RAID_BONUS);
  });

  it("stays flat under a Favourable omens reading", () => {
    const v = view({ seats: { alpha: "alpha" }, omens: { alpha: 1 } });
    const { gain, multiplier } = raidGainFor(v, "alpha", "beta");
    expect(multiplier).toBe(2);
    expect(gain).toBe(raidYield(1) * 2 + SEAT_RAID_BONUS);
  });
});

describe("seat-of-power targeting", () => {
  it("offers the actor's own land and annexed lands, never a vassal's", () => {
    const v = view({
      incorporated: { beta: "alpha" },
      overlords: new Map([["gamma", "alpha"]]),
      wealth: { alpha: 1 },
    });
    expect(validTargetsFor(v, "alpha", "seat-of-power")).toEqual(["alpha", "beta"]);
  });

  it("blocks the land the seat already stands on", () => {
    const v = view({
      seats: { alpha: "alpha" },
      incorporated: { beta: "alpha" },
      wealth: { alpha: 1 },
    });
    expect(validTargetsFor(v, "alpha", "seat-of-power")).toEqual(["beta"]);
    const entry = targetEligibilityFor(v, "alpha", "seat-of-power")
      .find((e) => e.factionId === "alpha");
    expect(entry?.state).toBe("blocked");
    if (entry?.state === "blocked") {
      expect(entry.reasons.map((r) => r.code)).toContain("already-seat");
    }
  });

  it("is a dead card while the actor is a vassal", () => {
    const v = view({
      overlords: new Map([["alpha", "delta"]]),
      wealth: { alpha: 1 },
    });
    expect(cardBlockReason(v, "alpha", "seat-of-power"))
      .toEqual({ code: "vassal-no-seat" });
  });

  it("asks its wealth cost before anything else", () => {
    expect(cardBlockReason(view(), "alpha", "seat-of-power"))
      .toEqual({ code: "cannot-afford", cost: 1, held: 0 });
  });
});

describe("wealthIncomeFor", () => {
  it("pays a fresh one-land faction exactly 1 a turn", () => {
    expect(wealthIncomeFor(view(), "alpha")).toBe(1);
  });

  it("pays nothing extra for annexed lands", () => {
    const v = view({ incorporated: { beta: "alpha", gamma: "alpha" } });
    expect(wealthIncomeFor(v, "alpha")).toBe(1);
  });

  it("adds 1 per settlement founded anywhere in the incorporated realm", () => {
    const v = view({
      incorporated: { beta: "alpha" },
      settlements: { alpha: 1, beta: 2 },
    });
    expect(wealthIncomeFor(v, "alpha")).toBe(4);
  });

  it("never counts a vassal's lands or settlements", () => {
    const v = view({
      overlords: new Map([["gamma", "alpha"]]),
      settlements: { gamma: 5 },
    });
    expect(wealthIncomeFor(v, "alpha")).toBe(1);
  });
});

describe("alliances", () => {
  it("blocks hostile targeted cards both directions while active", () => {
    const alliances = { [allianceKey("beta", "gamma")]: pact(10) };
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
    const alliances = { [allianceKey("beta", "gamma")]: pact(5) };
    const stillActive = view({ alliances, turn: 4 });
    expect(validTargetsFor(stillActive, "beta", "raid")).not.toContain("gamma");
    const expired = view({ alliances, turn: 5 });
    expect(validTargetsFor(expired, "beta", "raid")).toContain("gamma");
  });

  it("alliance targets reach like marriage (overlord always courtable) and allow renewal targeting existing allies", () => {
    const alliances = { [allianceKey("beta", "gamma")]: pact(10) };
    const v = view({ overlords: new Map([["delta", "alpha"]]), alliances, turn: 1 });
    // delta's overlord alpha is courtable though not adjacent to delta's realm
    expect(validTargetsFor(v, "delta", "alliance")).toContain("alpha");
    // beta is already allied with gamma: re-targeting gamma renews the pact,
    // so it remains a valid alliance target rather than being excluded.
    expect(validTargetsFor(view({ alliances, turn: 1 }), "beta", "alliance")).toContain("gamma");
    expect(validTargetsFor(view({ alliances, turn: 1 }), "beta", "alliance")).toContain("alpha");
  });
});

describe("post-escape respite", () => {
  it("blocks subjugate with the respite reason while the clock runs", () => {
    const v = view({
      relations: mightLead("beta", "gamma", 2),
      respites: { gamma: 4 },
      turn: 2,
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{ code: "respite", expiresTurn: 4 }],
    });
    expect(validTargetsFor({ ...v, turn: 4 }, "beta", "subjugate")).toContain("gamma");
  });

  it("gates only subjugate; every other card at the escapee stays legal", () => {
    const v = view({ respites: { gamma: 4 }, turn: 2 });
    expect(validTargetsFor(v, "beta", "raid")).toContain("gamma");
    expect(validTargetsFor(v, "beta", "alliance")).toContain("gamma");
    expect(validTargetsFor(v, "beta", "assassinate-ruler")).toContain("gamma");
  });

  it("lists the respite after an alliance and before the lead", () => {
    // The hover quotes only the first reason, so this order is a promise: the
    // longer-lived pact wins the line, and a time gate outranks a buildable
    // lead.
    const alliances = { [allianceKey("beta", "gamma")]: pact(9) };
    const v = view({ alliances, respites: { gamma: 4 }, turn: 2 });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "alliance", expiresTurn: 9 },
        { code: "respite", expiresTurn: 4 },
        {
          code: "insufficient-lead",
          required: 2,
          lead: 0,
          realmSize: 1,
          settlements: 0,
          poachSurcharge: 0,
          prowessReduction: 0,
        },
      ],
    });
  });

  it("threatsTo goes quiet for a protected subject and wakes at expiry", () => {
    const v = view({
      relations: mightLead("beta", "gamma", 2),
      respites: { gamma: 4 },
      turn: 2,
    });
    expect(threatsTo(v, "gamma")).toEqual([]);
    expect(threatsTo({ ...v, turn: 4 }, "gamma").map((t) => t.factionId))
      .toContain("beta");
  });

  it("subjugationRaceFor keeps danger through a respite", () => {
    // The alliance precedent: the bars and the mark are what will apply once
    // the clock lapses, contextualized by the badge countdown, not hidden.
    const v = view({
      relations: mightLead("beta", "alpha", 2),
      respites: { alpha: 4 },
      turn: 2,
    });
    expect(subjugationRaceFor(v, "alpha", "beta").danger).toBe(true);
  });

  it("respiteExpiry answers only while the clock runs", () => {
    expect(respiteExpiry(view({ respites: { beta: 5 }, turn: 4 }), "beta")).toBe(5);
    expect(respiteExpiry(view({ respites: { beta: 5 }, turn: 5 }), "beta")).toBeUndefined();
    expect(respiteExpiry(view(), "beta")).toBeUndefined();
  });
});

describe("bodyguard", () => {
  it("playable only when the actor is not already guarded (no stacking)", () => {
    expect(isCardPlayable(view({ guards: {} }), "beta", "bodyguard")).toBe(true);
    expect(isCardPlayable(view({ guards: { bodyguard: ["beta"] } }), "beta", "bodyguard")).toBe(false);
    // another faction's guard does not block beta
    expect(isCardPlayable(view({ guards: { bodyguard: ["gamma"] } }), "beta", "bodyguard")).toBe(true);
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

  it("is still playable while a reading is held: readings stack", () => {
    expect(
      isCardPlayable(view({ omens: { alpha: 1 } }), "alpha", "favourable-omens"),
    ).toBe(true);
    expect(
      isCardPlayable(view({ omens: { alpha: 3 } }), "alpha", "favourable-omens"),
    ).toBe(true);
  });

  it("is unaffected by another faction's reading", () => {
    expect(
      isCardPlayable(view({ omens: { beta: 1 } }), "alpha", "favourable-omens"),
    ).toBe(true);
  });
});

describe("extended-diplomacy legality", () => {
  it("is playable when no boost is held", () => {
    expect(isCardPlayable(view(), "alpha", "extended-diplomacy")).toBe(true);
  });

  it("is not playable while a boost is already held", () => {
    expect(
      isCardPlayable(view({ diplomacyBoost: ["alpha"] }), "alpha", "extended-diplomacy"),
    ).toBe(false);
  });

  it("is unaffected by another faction's boost", () => {
    expect(
      isCardPlayable(view({ diplomacyBoost: ["beta"] }), "alpha", "extended-diplomacy"),
    ).toBe(true);
  });
});

describe("subjugationRaceFor", () => {
  // alpha is the human throughout. The direction-picking cases below were
  // `barFor` unit tests in tests/view.test.ts before this function absorbed
  // that rule.
  it("quotes your bar when you lead", () => {
    // beta holds gamma, so beta's realm is 2 lands and the bar you face is 4.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      relations: mightLead("alpha", "beta", 3),
    });
    const race = subjugationRaceFor(v, "alpha", "beta");
    expect(race).toMatchObject({ lead: 3, bar: 4, takenFactionId: "beta" });
  });

  it("quotes their bar when they lead, because the bars are not symmetric", () => {
    // Their bar counts YOUR realm: alpha holds delta, so it is 4, not beta's 2.
    // A badge that quoted your bar here told the player they were about to be
    // taken when they were not.
    const v = view({
      overlords: new Map([["delta", "alpha"]]),
      relations: mightLead("beta", "alpha", 3),
    });
    const race = subjugationRaceFor(v, "alpha", "beta");
    expect(race).toMatchObject({ lead: -3, bar: 4, takenFactionId: "alpha" });
  });

  it("adds a settlement to the bar", () => {
    const v = view({
      settlements: settledOnce(["beta"]),
      relations: mightLead("alpha", "beta", 1),
    });
    expect(subjugationRaceFor(v, "alpha", "beta").bar).toBe(3);
  });

  it("still shows a bar while you are somebody's vassal - vassals can take too", () => {
    const v = view({
      overlords: new Map([["alpha", "gamma"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(subjugationRaceFor(v, "alpha", "beta").bar).toBe(2);
  });

  it("has no bar against your own vassal", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(subjugationRaceFor(v, "alpha", "beta").bar).toBeNull();
  });

  it("is quiet only when no lead and no pact stand between you", () => {
    expect(subjugationRaceFor(view(), "alpha", "beta").quiet).toBe(true);
    const led = view({ relations: mightLead("alpha", "beta", 1) });
    expect(subjugationRaceFor(led, "alpha", "beta").quiet).toBe(false);
    // A pact keeps an otherwise dead-even pair loud: the badge shows its "A5"
    // and the hover has something to explain.
    const allied = view({ alliances: { [allianceKey("alpha", "beta")]: pact(6) } });
    const race = subjugationRaceFor(allied, "alpha", "beta");
    expect(race.allied).toBe(true);
    expect(race.quiet).toBe(false);
    // A live pact term inside a dead-even lead is the same kind of loud: gamma
    // raided alpha to -1 and alpha's pact bought it back to 0, and that 0
    // falls back to -1 when the pact lapses. It must keep its badge.
    const boosted = view({
      relations: mightLead("gamma", "alpha", 1),
      alliances: { [allianceKey("alpha", "beta")]: pact(6, ["gamma"]) },
    });
    const boostedRace = subjugationRaceFor(boosted, "alpha", "gamma");
    expect(boostedRace.lead).toBe(0);
    expect(boostedRace.quiet).toBe(false);
    // Their pact against you is between you just the same.
    const theirs = view({
      relations: mightLead("alpha", "gamma", 1),
      alliances: { [allianceKey("gamma", "beta")]: pact(6, ["alpha"]) },
    });
    expect(subjugationRaceFor(theirs, "alpha", "gamma").quiet).toBe(false);
  });

  it("flags danger once their lead has cleared its bar", () => {
    const v = view({ relations: mightLead("beta", "alpha", 2) });
    expect(subjugationRaceFor(v, "alpha", "beta").danger).toBe(true);
    const short = view({ relations: mightLead("beta", "alpha", 1) });
    expect(subjugationRaceFor(short, "alpha", "beta").danger).toBe(false);
  });

  it("flags danger from a vassal rival, but never from your own liege", () => {
    // beta is gamma's vassal and leads alpha by 9: vassals can Subjugate, so
    // that lead is a real threat now (a poach, but a threat).
    const rival = view({
      overlords: new Map([["beta", "gamma"]]),
      relations: mightLead("beta", "alpha", 9),
    });
    expect(subjugationRaceFor(rival, "alpha", "beta").danger).toBe(true);
    // your own lord already holds you - whatever its lead, taking you is not
    // a play it can make, so no danger mark.
    const liege = view({
      overlords: new Map([["alpha", "beta"]]),
      relations: mightLead("beta", "alpha", 9),
    });
    expect(subjugationRaceFor(liege, "alpha", "beta").danger).toBe(false);
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

  it("reports how much lead a threat still needs", () => {
    const v = view({ relations: mightLead("alpha", "beta", 1) });
    const [t] = threatsTo(v, "beta");
    expect(t.shortfall).toBe(1);
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
    const v = view({ alliances: { [allianceKey("alpha", "beta")]: pact(10) }, turn: 1 });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("counts a subjugated faction - vassals can subjugate now", () => {
    const v = view({ overlords: new Map([["alpha", "delta"]]) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).toContain("alpha");
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

describe("seeds of revolt", () => {
  it("is playable only while a vassal", () => {
    expect(isCardPlayable(view(), "beta", "seeds-of-revolt")).toBe(false);
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(isCardPlayable(v, "beta", "seeds-of-revolt")).toBe(true);
  });

  it("refuses to sow a second Revolt while one is live", () => {
    // Without this the card would stack escapes, and a free faction sowing
    // would put a Revolt into an idle hand - the pre-load it exists to remove.
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      liveRevolts: ["beta"],
      hostages: {},
    });
    expect(isCardPlayable(v, "beta", "seeds-of-revolt")).toBe(false);
  });
});

describe("poach surcharge", () => {
  it("is zero against a faction with no overlord", () => {
    expect(poachSurchargeOn(view(), "beta")).toBe(0);
    expect(subjugationRequirement(view(), "alpha", "beta"))
      .toEqual(subjugationGripOn(view(), "beta"));
  });

  it("adds half the incumbent's grip, rounded up", () => {
    // delta leads its vassal gamma by 3 might, so a poacher pays ceil(3/2) = 2
    // on top of each base bar.
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      relations: mightLead("delta", "gamma", 3),
    });
    expect(overlordGrip(v, "gamma")).toBe(3);
    expect(poachSurchargeOn(v, "gamma")).toBe(2);
    expect(subjugationRequirement(v, "beta", "gamma")).toBe(4);
  });

  it("names the surcharge in the block reason so the bar is explicable", () => {
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      relations: mightLead("delta", "gamma", 3),
    });
    const entry = targetEligibilityFor(v, "beta", "subjugate")
      .find((e) => e.factionId === "gamma");
    const reason = entry?.state === "blocked"
      ? entry.reasons.find((r) => r.code === "insufficient-lead")
      : undefined;
    expect(reason).toMatchObject({ required: 4, poachSurcharge: 2 });
  });
});

describe("the two rolls", () => {
  it("makes taking a free faction certain and poaching a coin flip", () => {
    expect(subjugationChance(view(), "beta")).toBe(1);
    const v = view({ overlords: new Map([["gamma", "delta"]]) });
    expect(subjugationChance(v, "gamma")).toBe(POACH_CHANCE);
  });

  it("ramps the Incorporate odds linearly to certainty, then clamps", () => {
    const at = (turns: number): number =>
      incorporationChance(
        view({ loyalty: { [loyaltyKey("gamma", "beta")]: turns } }),
        "beta", "gamma",
      );
    expect(at(0)).toBe(0);
    expect(at(INCORPORATE_RAMP)).toBe(1);
    expect(at(INCORPORATE_RAMP * 3)).toBe(1); // clamped, never above 1
    expect(at(1)).toBeCloseTo(1 / INCORPORATE_RAMP);
  });
});

describe("raidYield", () => {
  it("is triangular in border width, and unchanged for a single border land", () => {
    expect(raidYield(0)).toBe(0);
    // 1 is the early-game case: nearly every faction holds one land, so the
    // convexity must not touch it.
    expect(raidYield(1)).toBe(1);
    expect(raidYield(2)).toBe(3);
    expect(raidYield(3)).toBe(6);
    expect(raidYield(5)).toBe(15);
    expect(raidYield(6)).toBe(21);
  });

  it("grows faster than linearly, which is the whole point", () => {
    // A doubled border is worth more than double: this is what lets a large
    // realm out-accumulate a peer, since a lead is a pairwise difference and
    // every other gain card is a flat +1.
    expect(raidYield(6)).toBeGreaterThan(2 * raidYield(3));
  });
});

describe("passiveFortifyFor", () => {
  const annexedTo = (lord: string, lands: string[]) =>
    Object.fromEntries(lands.map((l) => [l, lord]));

  it("is zero below the threshold and floors above it", () => {
    expect(passiveFortifyFor(view(), "alpha")).toBe(0);
    expect(
      passiveFortifyFor(view({ incorporated: annexedTo("alpha", ["beta"]) }), "alpha"),
    ).toBe(0);
    expect(
      passiveFortifyFor(
        view({ incorporated: annexedTo("alpha", ["beta", "gamma", "delta"]) }),
        "alpha",
      ),
    ).toBe(0);
  });

  it("grants one per PASSIVE_PER_LANDS annexed lands", () => {
    const lands = ["b", "c", "d", "e", "f", "g", "h", "i"];
    const at = (n: number) =>
      passiveFortifyFor(
        view({ incorporated: annexedTo("alpha", lands.slice(0, n)) }),
        "alpha",
      );
    expect(at(PASSIVE_PER_LANDS)).toBe(1);
    expect(at(PASSIVE_PER_LANDS * 2)).toBe(2);
  });

  it("counts only the asking faction's own annexations", () => {
    const v = view({
      incorporated: {
        ...annexedTo("alpha", ["b", "c", "d", "e"]),
        ...annexedTo("beta", ["f", "g"]),
      },
    });
    expect(passiveFortifyFor(v, "alpha")).toBe(1);
    expect(passiveFortifyFor(v, "beta")).toBe(0);
  });

  it("agrees with annexedLandsOf", () => {
    const v = view({ incorporated: annexedTo("alpha", ["b", "c", "d", "e", "f"]) });
    expect(annexedLandsOf(v, "alpha")).toBe(5);
    expect(passiveFortifyFor(v, "alpha")).toBe(
      Math.floor(5 / PASSIVE_PER_LANDS),
    );
  });
});

describe("take hostage", () => {
  const restive = (hostages: Record<string, number> = {}): RulesView =>
    view({
      overlords: new Map([["beta", "alpha"]]),
      // The revolt gate is met (lead 2 against a two-land realm), so these
      // tests exercise the hostage lock alone.
      relations: mightLead("beta", "alpha", 2),
      liveRevolts: ["beta"],
      hostages,
    });

  it("targets exactly your own restive vassals", () => {
    expect(validTargetsFor(restive(), "alpha", "take-hostage")).toEqual(["beta"]);
    // A vassal with no Revolt sown has nothing to lock.
    const quiet = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(targetEligibilityFor(quiet, "alpha", "take-hostage")[1]).toMatchObject({
      state: "blocked", reasons: [{ code: "no-revolt" }],
    });
    // A free faction - or somebody else's vassal - is not yours to take from.
    const free = view({ liveRevolts: ["beta"] });
    expect(targetEligibilityFor(free, "alpha", "take-hostage")[1]).toMatchObject({
      state: "blocked", reasons: [{ code: "not-your-vassal" }],
    });
  });

  it("refuses a second hostage while one is held", () => {
    const v = restive({ beta: 2 });
    expect(targetEligibilityFor(v, "alpha", "take-hostage")[1]).toMatchObject({
      state: "blocked", reasons: [{ code: "hostage-already-held" }],
    });
    expect(validTargetsFor(v, "alpha", "take-hostage")).toEqual([]);
  });

  it("locks the vassal's Revolt while the debt is owed, quoting the count", () => {
    expect(cardBlockReason(restive({ beta: 1 }), "beta", "revolt")).toEqual({
      code: "hostage-held", remaining: 1,
    });
    // No hostage: a vassal's Revolt is as playable as it ever was.
    expect(cardBlockReason(restive(), "beta", "revolt")).toBeNull();
    // The lock never outlives vassalage: hostages entries are deleted on every
    // exit (see playCard), so this pairing cannot arise - but the rule alone
    // must still answer for a free faction, and it answers needs-overlord.
    expect(cardBlockReason(view({ hostages: { beta: 1 } }), "beta", "revolt"))
      .toEqual({ code: "needs-overlord" });
  });
});

describe("revolt lead gate", () => {
  const vassal = (partial: Partial<RulesView> = {}): RulesView =>
    view({ overlords: new Map([["beta", "alpha"]]), ...partial });

  it("requires a lead of REVOLT_BASE_THRESHOLD minus the lord's full realm", () => {
    // alpha's realm is alpha + beta: required 2, and beta stands at 0.
    expect(revoltRequirement(vassal(), "beta")).toBe(REVOLT_BASE_THRESHOLD - 2);
    expect(cardBlockReason(vassal(), "beta", "revolt")).toEqual({
      code: "revolt-lead", required: 2, lead: 0,
    });
    // Free factions have no requirement - and no revolt at all.
    expect(revoltRequirement(view(), "beta")).toBeNull();
  });

  it("meeting the requirement exactly opens the gate", () => {
    const at = vassal({ relations: mightLead("beta", "alpha", 2) });
    expect(cardBlockReason(at, "beta", "revolt")).toBeNull();
    const below = vassal({ relations: mightLead("beta", "alpha", 1) });
    expect(cardBlockReason(below, "beta", "revolt")).toEqual({
      code: "revolt-lead", required: 2, lead: 1,
    });
  });

  it("counts the lord's whole pyramid and annexations, to any depth", () => {
    // alpha holds beta, beta holds gamma, alpha annexed delta: realm 4.
    const v = vassal({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      incorporated: { delta: "alpha" },
    });
    expect(revoltRequirement(v, "beta")).toBe(0);
    expect(cardBlockReason(v, "beta", "revolt")).toBeNull();
    // The grand-vassal answers to beta, whose own realm is only beta + gamma.
    expect(revoltRequirement(v, "gamma")).toBe(2);
  });

  it("past four lands the requirement is negative: a deficit still clears it", () => {
    const v = vassal({
      incorporated: { b: "alpha", c: "alpha", d: "alpha" }, // realm 5
      relations: mightLead("alpha", "beta", 1), // beta stands at -1
    });
    expect(revoltRequirement(v, "beta")).toBe(-1);
    expect(cardBlockReason(v, "beta", "revolt")).toBeNull();
    const gripped = vassal({
      incorporated: { b: "alpha", c: "alpha", d: "alpha" },
      relations: mightLead("alpha", "beta", 2), // beta stands at -2
    });
    expect(cardBlockReason(gripped, "beta", "revolt")).toEqual({
      code: "revolt-lead", required: -1, lead: -2,
    });
  });

  it("a live pact naming the lord feeds the gate, with no store bump", () => {
    const v = vassal({
      alliances: { [allianceKey("beta", "gamma")]: pact(9, ["alpha"]) },
    });
    expect(cardBlockReason(v, "beta", "revolt")).toEqual({
      code: "revolt-lead", required: 2, lead: 1, // the pact's +1, store empty
    });
    const enough = vassal({
      relations: mightLead("beta", "alpha", 1),
      alliances: { [allianceKey("beta", "gamma")]: pact(9, ["alpha"]) },
    });
    expect(cardBlockReason(enough, "beta", "revolt")).toBeNull();
  });

  it("the lord's standing seat is no extra term on the gate", () => {
    // The seat guards the ruler against subjugation (SEAT_BAR_BONUS in
    // gripPartsOn), not its hold over vassals - a deliberate non-interaction.
    const seated = vassal({
      seats: { alpha: "alpha" },
      relations: mightLead("beta", "alpha", 2),
    });
    expect(seatOf(seated, "alpha")).toBe("alpha");
    expect(revoltRequirement(seated, "beta")).toBe(2);
    expect(cardBlockReason(seated, "beta", "revolt")).toBeNull();
  });

  it("a hostage outranks the gate", () => {
    const v = vassal({ hostages: { beta: 2 } });
    expect(cardBlockReason(v, "beta", "revolt")).toEqual({
      code: "hostage-held", remaining: 2,
    });
  });
});

describe("ruler prowess lowers the bar", () => {
  it("converts levels to bar points at PROWESS_PER_REDUCTION apiece", () => {
    for (const [levels, cut] of [[0, 0], [3, 0], [4, 1], [7, 1], [8, 2]]) {
      expect(prowessReductionFor(view({ prowess: { beta: levels } }), "beta"))
        .toBe(cut);
    }
    // absent means unproven, the projection contract with prowessByFaction
    expect(prowessReductionFor(view(), "beta")).toBe(0);
    expect(PROWESS_PER_REDUCTION).toBe(4);
  });

  it("is scoped to the actor: only the proven ruler's bar drops", () => {
    const v = view({ prowess: { beta: PROWESS_PER_REDUCTION } });
    expect(subjugationRequirement(v, "beta", "gamma")).toBe(SUBJUGATE_THRESHOLD - 1);
    expect(subjugationRequirement(v, "alpha", "gamma")).toBe(SUBJUGATE_THRESHOLD);
    // and the bar itself is a fact about the target alone, untouched
    expect(subjugationGripOn(v, "gamma")).toBe(SUBJUGATE_THRESHOLD);
  });

  it("never lets the bar fall below 1", () => {
    const v = view({ prowess: { beta: 3 * PROWESS_PER_REDUCTION } });
    expect(subjugationRequirement(v, "beta", "gamma")).toBe(1);
  });

  it("quotes the EFFECTIVE reduction in the insufficient-lead reason", () => {
    // Two levels of cut asked, one delivered: the 1-land bar of 2 clamps at 1.
    const v = view({ prowess: { beta: 2 * PROWESS_PER_REDUCTION } });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{
        code: "insufficient-lead",
        required: 1,
        lead: 0,
        realmSize: 1,
        settlements: 0,
        poachSurcharge: 0,
        prowessReduction: 1,
      }],
    });
  });

  it("flips the map badge to danger at a lead the raw bar refuses", () => {
    const relations = mightLead("gamma", "beta", 1);
    const raw = subjugationRaceFor(view({ relations }), "beta", "gamma");
    expect(raw.danger).toBe(false);
    const proven = subjugationRaceFor(
      view({ relations, prowess: { gamma: PROWESS_PER_REDUCTION } }),
      "beta", "gamma",
    );
    expect(proven.bar).toBe(SUBJUGATE_THRESHOLD - 1);
    expect(proven.danger).toBe(true);
  });

  it("reaches threatsTo, so guard cases see the reduced bar", () => {
    const relations = mightLead("gamma", "beta", 1);
    const v = view({ relations, prowess: { gamma: PROWESS_PER_REDUCTION } });
    const threat = threatsTo(v, "beta").find((t) => t.factionId === "gamma");
    expect(threat?.shortfall).toBe(0);
  });
});
