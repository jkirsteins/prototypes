import { describe, it, expect } from "vitest";
import { defenseMaxAll, siteCaps } from "./helpers";
import {
  ESCAPE_RESPITE_TURNS, INCORPORATE_REALM_GATE, SETTLEMENT_BASE_CAP,
  attackDamageFor, omensMultiplier, attackReach, borderPolygonsOf,
  cardBlockReason, failureRiskOf, freeSettlementsIn, freeSitesIn,
  greatRaidMarches,
  handBlockReason, handLimitFor, holdsGuard, incorporateRealmGate,
  isCardPlayable, MAX_HAND, MIN_HAND,
  greatRaidPool, greatRaidSpends,
  marchHopsTo,
  marchSourcesAgainst, marchSourcesFor, marchTargetsFrom, miasmaHeld, omensHeld,
  spendCeilingOn,
  outbreakPolygons, plagueDamageOn, plagueMultiplier, playableSet, reachOf,
  respiteExpiry, settlementAllowance, settlementsIn, subjugationGateOn,
  targetEligibilityFor, validTargetsFor, wealthIncomeFor, wealthOf,
  type RulesView,
} from "../src/playability";
import { OPENING_HAND } from "../src/game";
import { CARDS, TRIBUTE_CARDS } from "../src/cards";
import { RAID_LEADERSHIP } from "../src/abilities";
import { SUBJUGATION_GATE } from "../src/defense";

const ORDER = ["alpha", "beta", "gamma", "delta"];
const LINE_ADJ = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};
const FULL_ADJ = Object.fromEntries(
  ORDER.map((id) => [id, ORDER.filter((o) => o !== id)]),
);

function view(partial: Partial<RulesView> = {}): RulesView {
  return {
    overlords: new Map(),
    incorporated: {},
    adjacency: LINE_ADJ,
    factionIds: ORDER,
    passives: {},
    turn: 1,
    guards: {},
    omens: {},
    siteCaps: siteCaps(ORDER),
    settlements: {},
    settlementsSpent: {},
    wealth: {},
    respites: {},
    leadership: {},
    leaderAbilities: {},
    // Every faction leads by default: a vacancy is the exception a test asks
    // for by name, not the fixture's resting state.
    leaders: Object.fromEntries(ORDER.map((id) => [id, true])),
    defense: {},
    defenseMax: defenseMaxAll(ORDER),
    disease: {},
    miasma: {},
    turnips: {},
    marches: {},
    claims: {},
    armies: {},
    ...partial,
  };
}

/** The gate line on a 600 polygon. The share is zero, so the line is zero:
 *  a land falls when its defenses are gone and not a point sooner. Derived
 *  rather than written out, so moving the dial moves the tests with it. */
const GATE = Math.floor(SUBJUGATION_GATE * 600);

describe("attackReach", () => {
  it("is the polygons bordering the realm for a lone faction", () => {
    expect(attackReach(view(), "alpha")).toEqual(new Set(["beta"]));
    expect(attackReach(view(), "beta")).toEqual(new Set(["alpha", "gamma"]));
  });

  it("includes the actor's own vassal - a lord may raid to hold the gate", () => {
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(attackReach(v, "alpha")).toEqual(new Set(["beta", "gamma"]));
    expect(validTargetsFor(v, "alpha", "raid")).toContain("beta");
  });

  it("includes a grand-vassal - the pyramid's members ride along", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(attackReach(v, "alpha")).toEqual(new Set(["beta", "gamma", "delta"]));
  });

  it("includes a vassal's own annexed land", () => {
    // beta answers to alpha and has annexed delta: delta is under alpha's
    // realm but not held outright, so the lord may still batter it.
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      incorporated: { delta: "beta" },
    });
    expect(attackReach(v, "alpha")).toEqual(new Set(["beta", "gamma", "delta"]));
  });

  it("excludes what the actor holds outright - its own annexations", () => {
    const v = view({ incorporated: { beta: "alpha" } });
    expect(attackReach(v, "alpha")).toEqual(new Set(["gamma"]));
    expect(validTargetsFor(v, "alpha", "raid")).not.toContain("beta");
  });
});

describe("borderPolygonsOf", () => {
  it("names the polygons themselves, never the annexer - attacks hit polygons", () => {
    const v = view({ incorporated: { gamma: "delta" } });
    expect(borderPolygonsOf(v, "beta")).toEqual(new Set(["alpha", "gamma"]));
    // The contrast: the faction-reach question resolves the same land to its
    // owner, because Subjugate aims at whoever holds it.
    expect(reachOf(v, "beta")).toEqual(new Set(["alpha", "delta"]));
  });

  it("walks the full realm, so a grand-vassal's border counts", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(borderPolygonsOf(v, "alpha")).toEqual(new Set(["delta"]));
  });
});

describe("marching: sources, targets and armies", () => {
  /** One march out of `from`, holding that land's army. */
  const outFrom = (from: string, to: string, over = {}) => ({
    "1": {
      id: 1, actor: from, from, to, cardId: "raid", damage: 4,
      holdsArmy: true, declared: 1, expiry: 2, ...over,
    },
  });

  it("names the realm lands with a free army that border something in reach", () => {
    // The line alpha - beta - gamma - delta. beta borders both ends.
    expect(marchSourcesFor(view(), "beta")).toEqual(["beta"]);
    expect(marchSourcesFor(view({ overlords: new Map([["gamma", "beta"]]) }), "beta"))
      .toEqual(["beta", "gamma"]);
  });

  it("drops a land whose army is already out on a march", () => {
    // At the default 600 ceiling beta already fields 200 armies; shrink it to
    // exactly one army's worth so a single march can actually exhaust it.
    const v = view({
      marches: outFrom("beta", "alpha"),
      defenseMax: defenseMaxAll(ORDER, 3),
    });
    expect(marchSourcesFor(v, "beta")).toEqual([]);
    // A second army on the same land puts it back.
    expect(marchSourcesFor(view({ ...v, armies: { beta: 2 } }), "beta"))
      .toEqual(["beta"]);
  });

  it("drops a land with no defense left to pay for the arrow", () => {
    // A raid card spends its source 1:1, so a land holding nothing has no
    // raid in it - stated as legality rather than as a 0 STR arrow.
    expect(marchSourcesFor(view({ defense: { beta: 0 } }), "beta")).toEqual([]);
    // One point is enough: the ceiling rounds up, so the last point is
    // always spendable and a card is never dead in the hand.
    expect(marchSourcesFor(view({ defense: { beta: 1 } }), "beta"))
      .toEqual(["beta"]);
  });

  it("names each raid card's own ceiling out of a land", () => {
    const v = view({ defense: { beta: 5 } });
    expect(spendCeilingOn(v, "raid", "beta")).toBe(3); // half, rounded up
    expect(spendCeilingOn(v, "strong-raid", "beta")).toBe(5); // all of it
    expect(spendCeilingOn(v, "great-raid", "beta")).toBe(5);
  });

  it("pools a great raid's fan and divides the pool between it", () => {
    // beta holds gamma, and both border delta on the line.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      adjacency: {
        alpha: ["beta"], beta: ["alpha", "gamma", "delta"],
        gamma: ["beta", "delta"], delta: ["beta", "gamma"],
      },
      defense: { beta: 6, gamma: 3 },
    });
    expect(greatRaidPool(v, "beta", "delta")).toBe(9);
    expect(greatRaidSpends(v, "beta", "delta", 6).map((m) => [m.from, m.spend]))
      .toEqual([["beta", 3], ["gamma", 3]]);
    // gamma stops at its own 3 and beta keeps climbing.
    expect(greatRaidSpends(v, "beta", "delta", 9).map((m) => [m.from, m.spend]))
      .toEqual([["beta", 6], ["gamma", 3]]);
  });

  it("keeps a land that can pay nothing out of the great raid fan", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      adjacency: {
        alpha: ["beta"], beta: ["alpha", "gamma", "delta"],
        gamma: ["beta", "delta"], delta: ["beta", "gamma"],
      },
      defense: { beta: 6, gamma: 0 },
    });
    expect(greatRaidMarches(v, "beta", "delta").map((m) => m.from))
      .toEqual(["beta"]);
    // Which is what keeps the pool at least one point per arrow.
    expect(greatRaidPool(v, "beta", "delta")).toBe(6);
  });

  it("aims an army at everything in reach it can walk to", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    // beta borders alpha and its own vassal gamma, and may batter either -
    // and delta, two lands down the line, is a march of two turns rather than
    // somewhere out of the question.
    expect(marchTargetsFrom(v, "beta", "beta"))
      .toEqual(["alpha", "gamma", "delta"]);
    // The vassal's own army reaches delta next door and alpha the long way,
    // but not gamma itself: no land marches at itself.
    expect(marchTargetsFrom(v, "beta", "gamma")).toEqual(["alpha", "delta"]);
    expect(marchSourcesAgainst(v, "beta", "delta")).toEqual(["beta", "gamma"]);
    expect(marchSourcesAgainst(v, "beta", "gamma")).toEqual(["beta"]);
  });

  it("blocks a raid target no free army borders, and says which refusal it is", () => {
    const v = view({
      marches: outFrom("beta", "alpha"),
      defenseMax: defenseMaxAll(ORDER, 3),
    });
    const alpha = targetEligibilityFor(v, "beta", "raid")
      .find((e) => e.factionId === "alpha")!;
    expect(alpha).toEqual({
      state: "blocked", factionId: "alpha", reasons: [{ code: "no-army" }],
    });
    // And at the card level it is `no-army`, not `no-target`: alpha is still
    // in reach, there is simply nothing left to send.
    expect(cardBlockReason(v, "beta", "raid")).toEqual({ code: "no-army" });
    expect(cardBlockReason(v, "beta", "great-raid")).toEqual({ code: "no-army" });
  });

  it("sends one arrow from every realm land bordering the target", () => {
    // The line alpha - beta - gamma - delta. Only beta borders alpha.
    expect(greatRaidMarches(view(), "beta", "alpha")).toEqual([
      { from: "beta", to: "alpha", holdsArmy: true },
    ]);
  });

  it("musters every neighbour of the target, each spending its own army", () => {
    // beta holds gamma as a vassal, and on the full map both border delta.
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      adjacency: FULL_ADJ,
    });
    expect(greatRaidMarches(v, "beta", "delta")).toEqual([
      { from: "beta", to: "delta", holdsArmy: true },
      { from: "gamma", to: "delta", holdsArmy: true },
    ]);
  });
});

describe("a march reaches past the border", () => {
  // one - two - three - four - five in a line, with one holding two, three
  // and four as vassals. The vassals are there to put the far end of the
  // chain in REACH - a lord may batter its own vassals, and the land past
  // them borders the realm - so that distance is the only thing left deciding
  // what an army standing in `one` may be aimed at.
  const CHAIN = ["one", "two", "three", "four", "five"];
  const CHAIN_ADJ = {
    one: ["two"],
    two: ["one", "three"],
    three: ["two", "four"],
    four: ["three", "five"],
    five: ["four"],
  };
  const chain = (extra: Partial<RulesView> = {}) =>
    view({
      factionIds: CHAIN,
      adjacency: CHAIN_ADJ,
      defenseMax: defenseMaxAll(CHAIN),
      siteCaps: siteCaps(CHAIN),
      leaders: Object.fromEntries(CHAIN.map((id) => [id, true])),
      overlords: new Map([["two", "one"], ["three", "one"], ["four", "one"]]),
      ...extra,
    });

  it("offers a land two hops away", () => {
    expect(marchTargetsFrom(chain(), "one", "one")).toContain("three");
  });

  it("counts the bound inclusively - three hops is a march, four is not", () => {
    expect(marchTargetsFrom(chain(), "one", "one")).toContain("four");
    expect(marchTargetsFrom(chain(), "one", "one")).not.toContain("five");
    // And `five` is refused for the distance alone: it is in reach, and an
    // army standing next door may still be aimed at it.
    expect(attackReach(chain(), "one")).toContain("five");
    expect(marchTargetsFrom(chain(), "one", "four")).toContain("five");
  });

  it("is one question, so the source list and the target list agree", () => {
    // `marchSourcesAgainst` is the other door into the same decision - the
    // target-first flow - and a land it refuses is a land the aim would offer
    // and the play then reject.
    expect(marchSourcesAgainst(chain(), "one", "four")).toContain("one");
    expect(marchSourcesAgainst(chain(), "one", "five")).not.toContain("one");
    expect(marchHopsTo(chain(), "one", "four")).toBe(3);
    expect(marchHopsTo(chain(), "one", "five")).toBeNull();
    // No land marches at itself, whatever the graph says about the distance.
    expect(marchHopsTo(chain(), "one", "one")).toBeNull();
  });

  it("does not call a distant target armyless when a source can reach it", () => {
    // Every vassal's army is already out, so `one` is the realm's only source
    // and the far end of the chain is three hops from it. The per-target block
    // reason is the third door into the same decision, and a land the aim
    // offers must not be a land the hover calls armyless.
    const v = chain({ armies: { two: 0, three: 0, four: 0 } });
    expect(marchSourcesFor(v, "one")).toEqual(["one"]);
    const four = targetEligibilityFor(v, "one", "raid")
      .find((e) => e.factionId === "four")!;
    expect(four).toEqual({ state: "available", factionId: "four" });
  });

  it("still refuses a peer of the actor's own realm, however close", () => {
    // The realm rule is not a distance rule and widening reach must not have
    // quietly become a way around it. beta answers to alpha and holds gamma;
    // delta answers to alpha as well, so it is beta's SIBLING - two hops off
    // along the line, in beta's reach, and still not something beta may hit.
    const v = view({
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "beta"], ["delta", "alpha"],
      ]),
    });
    expect(attackReach(v, "beta")).toContain("delta");
    expect(marchHopsTo(v, "beta", "delta")).toBe(2);
    expect(marchTargetsFrom(v, "beta", "beta")).not.toContain("delta");
    // Its own vassal, one hop off, is still fair game - downward is upkeep.
    expect(marchTargetsFrom(v, "beta", "beta")).toContain("gamma");
  });
});

describe("subjugationGateOn and the zero line", () => {
  it("quotes the current defense against the gate line", () => {
    expect(subjugationGateOn(view(), "beta"))
      .toEqual({ defense: 600, required: GATE, open: false });
    expect(subjugationGateOn(view({ defense: { beta: 0 } }), "beta"))
      .toEqual({ defense: 0, required: GATE, open: true });
  });

  it("opens only at the line and stays shut one point above", () => {
    expect(subjugationGateOn(view({ defense: { beta: GATE } }), "beta").open)
      .toBe(true);
    expect(subjugationGateOn(view({ defense: { beta: GATE + 1 } }), "beta").open)
      .toBe(false);
  });

  it("is the same line at every ceiling - a land falls when it is flattened", () => {
    // The gate is a share of the ceiling, and the share is zero, so a big land
    // is no easier to take standing than a small one.
    const v = (max: number, d: number) =>
      view({ defenseMax: defenseMaxAll(ORDER, max), defense: { beta: d } });
    for (const max of [610, 600, 2]) {
      expect(subjugationGateOn(v(max, 0), "beta"), `${max}`)
        .toEqual({ defense: 0, required: 0, open: true });
      expect(subjugationGateOn(v(max, 1), "beta").open, `${max}`).toBe(false);
    }
  });

  it("is the same boundary Subjugate targeting answers to", () => {
    const at = (d: number) => view({ defense: { gamma: d } });
    expect(validTargetsFor(at(GATE), "beta", "subjugate")).toContain("gamma");
    expect(validTargetsFor(at(GATE + 1), "beta", "subjugate")).toEqual([]);
  });
});

describe("subjugate eligibility", () => {
  it("reports gate-closed with both numbers of the decision", () => {
    expect(targetEligibilityFor(view(), "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{ code: "gate-closed", defense: 600, required: GATE }],
    });
  });

  it("keeps factions out of reach irrelevant, not blocked", () => {
    const result = targetEligibilityFor(view(), "beta", "subjugate");
    expect(result.find((e) => e.factionId === "delta")?.state).toBe("irrelevant");
  });

  it("lists the respite before the gate - a time gate outranks a buildable one", () => {
    // The hover quotes only the FIRST reason, so this order is a promise.
    const v = view({ respites: { gamma: 5 }, turn: 2 });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "respite", expiresTurn: 5 },
        { code: "gate-closed", defense: 600, required: GATE },
      ],
    });
  });

  it("the respite alone blocks an open gate, and lifts at expiry", () => {
    const v = view({
      defense: { gamma: 0 }, respites: { gamma: 5 }, turn: 2,
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{ code: "respite", expiresTurn: 5 }],
    });
    expect(validTargetsFor({ ...v, turn: 5 }, "beta", "subjugate"))
      .toContain("gamma");
  });

  it("gates only subjugate; raid and assassinate ignore the respite", () => {
    const v = view({ respites: { gamma: 5 }, turn: 2 });
    expect(validTargetsFor(v, "beta", "raid")).toContain("gamma");
    expect(validTargetsFor(v, "beta", "assassinate-ruler")).toContain("gamma");
  });

  it("no faction in the actor's own overlord chain is subjugable (liege)", () => {
    // gamma -> beta -> alpha, full graph so both lieges are in reach, and
    // both gates stand open so the refusal is the liege rule alone.
    const v = view({
      adjacency: FULL_ADJ,
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      defense: { alpha: 0, beta: 0 },
    });
    for (const liege of ["beta", "alpha"]) {
      expect(targetEligibilityFor(v, "gamma", "subjugate")).toContainEqual({
        state: "blocked", factionId: liege, reasons: [{ code: "liege" }],
      });
    }
  });

  it("refuses the actor's own vassal as already held", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      defense: { beta: 0 },
    });
    expect(targetEligibilityFor(v, "alpha", "subjugate")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "already-vassal" }],
    });
  });

  it("allows poaching another lord's vassal through an open gate", () => {
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      defense: { gamma: 0 },
    });
    expect(validTargetsFor(v, "beta", "subjugate")).toContain("gamma");
  });

  it("marks the actor itself blocked as self when its own land is in reach", () => {
    // Annexing beta resolves alpha's border back to alpha, so the self rule
    // has to answer rather than the reach filter.
    const v = view({ incorporated: { beta: "alpha" }, defense: { alpha: 0 } });
    expect(targetEligibilityFor(v, "alpha", "subjugate")).toContainEqual({
      state: "blocked", factionId: "alpha", reasons: [{ code: "self" }],
    });
  });

  it("a vassal may Subjugate a free faction - only its liege is off-limits", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      defense: { gamma: 0 },
    });
    expect(validTargetsFor(v, "beta", "subjugate")).toContain("gamma");
  });
});

describe("incorporate eligibility", () => {
  it("offers own vassals and blocks everything else as not-your-vassal", () => {
    const v = view({ overlords: new Map([["gamma", "beta"], ["alpha", "delta"]]) });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
    expect(targetEligibilityFor(v, "beta", "incorporate")).toContainEqual({
      state: "blocked", factionId: "delta",
      reasons: [{ code: "not-your-vassal" }],
    });
  });

  it("blocks the actor itself and an annexed land, each with its own reason first", () => {
    const v = view({ incorporated: { gamma: "delta" } });
    const entries = targetEligibilityFor(v, "beta", "incorporate");
    expect(entries).toContainEqual({
      state: "blocked", factionId: "beta",
      reasons: [{ code: "self" }, { code: "not-your-vassal" }],
    });
    expect(entries).toContainEqual({
      state: "blocked", factionId: "gamma",
      reasons: [{ code: "incorporated" }, { code: "not-your-vassal" }],
    });
  });

  it("a mid-lord may digest its own vassal while owing fealty above", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"], ["beta", "alpha"]]),
    });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
  });
});

describe("incorporateRealmGate", () => {
  it("counts the FULL realm against the constant", () => {
    expect(INCORPORATE_REALM_GATE).toBe(4);
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      incorporated: { delta: "gamma" },
    });
    expect(incorporateRealmGate(v, "alpha")).toEqual({ required: 4, held: 4 });
  });

  it("blocks the card as realm-too-small below the gate, before any target question", () => {
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(validTargetsFor(v, "alpha", "incorporate")).toEqual(["beta"]);
    expect(cardBlockReason(v, "alpha", "incorporate"))
      .toEqual({ code: "realm-too-small", required: 4, held: 2 });
    expect(isCardPlayable(v, "alpha", "incorporate")).toBe(false);
  });

  it("falls through to no-target at the gate with no vassal to digest", () => {
    const v = view({
      incorporated: { beta: "alpha", gamma: "alpha", delta: "alpha" },
    });
    expect(cardBlockReason(v, "alpha", "incorporate"))
      .toEqual({ code: "no-target" });
  });
});

describe("hillfort", () => {
  it("targets the actor's own full realm, blocked at full defense", () => {
    const whole = targetEligibilityFor(view(), "beta", "hillfort");
    expect(whole.find((e) => e.factionId === "beta")).toEqual({
      state: "blocked", factionId: "beta",
      reasons: [{ code: "at-full-defense" }],
    });
    expect(whole.find((e) => e.factionId === "alpha")?.state).toBe("irrelevant");
    expect(cardBlockReason(view(), "beta", "hillfort"))
      .toEqual({ code: "no-target" });
  });

  it("offers a damaged polygon, a vassal's included", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      defense: { gamma: 400 },
    });
    expect(validTargetsFor(v, "beta", "hillfort")).toEqual(["gamma"]);
  });
});

describe("harvest-feast", () => {
  it("is dead while the whole realm stands at full defense", () => {
    expect(cardBlockReason(view(), "beta", "harvest-feast"))
      .toEqual({ code: "at-full-defense" });
  });

  it("is playable while any realm polygon is damaged, a vassal's included", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      defense: { gamma: 500 },
    });
    expect(cardBlockReason(v, "beta", "harvest-feast")).toBeNull();
    // A rival's damage lifts nothing: the realm is what the heal reaches.
    expect(cardBlockReason(view({ defense: { delta: 100 } }), "beta", "harvest-feast"))
      .toEqual({ code: "at-full-defense" });
  });
});

describe("found a settlement", () => {
  it("asks its wealth cost before any land question", () => {
    expect(cardBlockReason(view(), "beta", "found-settlement"))
      .toEqual({ code: "cannot-afford", cost: 1, held: 0 });
    expect(
      cardBlockReason(view({ wealth: { beta: 1 } }), "beta", "found-settlement"),
    ).toBeNull();
  });

  it("targets inward: the realm's lands, lands outside irrelevant", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { delta: "beta" },
      wealth: { beta: 1 },
    });
    expect(validTargetsFor(v, "beta", "found-settlement"))
      .toEqual(["beta", "gamma", "delta"]);
    expect(
      targetEligibilityFor(v, "beta", "found-settlement")
        .find((e) => e.factionId === "alpha")?.state,
    ).toBe("irrelevant");
  });

  it("no-free-site when the map has nothing left to draw", () => {
    // One site authored and one founded: no growth could ever help, so this
    // is no-free-site rather than a population problem.
    const v = view({ siteCaps: siteCaps(["beta"]), settlements: { beta: 1 } });
    expect(targetEligibilityFor(v, "beta", "found-settlement")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "no-free-site" }],
    });
    const w = view({ siteCaps: {} });
    expect(targetEligibilityFor(w, "beta", "found-settlement")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "no-free-site" }],
    });
  });

  it("needs-population when the land holds the flat allowance of two", () => {
    expect(settlementAllowance()).toBe(SETTLEMENT_BASE_CAP);
    const v = view({
      siteCaps: siteCaps(["beta"], 3), settlements: { beta: 1 },
    });
    expect(settlementsIn(v, "beta")).toBe(2);
    expect(freeSitesIn(v, "beta")).toBe(2);
    expect(targetEligibilityFor(v, "beta", "found-settlement")).toContainEqual({
      state: "blocked",
      factionId: "beta",
      reasons: [{ code: "needs-population", have: 2, allowance: 2 }],
    });
  });
});

describe("a fortify's settlement bound", () => {
  /** A damaged beta, so the heal has somewhere to land and the only question
   *  left is whether a settlement is free to answer it. */
  const damaged = (partial: Partial<RulesView> = {}): RulesView =>
    view({ defense: { beta: 1 }, ...partial });

  it("counts the settlements a land has not been fortified from", () => {
    const v = damaged({ settlements: { beta: 1 } });
    expect(settlementsIn(v, "beta")).toBe(2);
    expect(freeSettlementsIn(v, "beta")).toBe(2);
    expect(freeSettlementsIn(damaged({ settlementsSpent: { beta: 1 } }), "beta"))
      .toBe(0);
    // Floored, like `freeArmiesOn`: a land counted after its settlements were
    // taken from under it reads as exhausted rather than negative.
    expect(freeSettlementsIn(damaged({ settlementsSpent: { beta: 5 } }), "beta"))
      .toBe(0);
  });

  it("blocks the target whose settlements have answered, and says which refusal", () => {
    const v = damaged({ settlementsSpent: { beta: 1 } });
    expect(targetEligibilityFor(v, "beta", "fortify")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "no-settlement" }],
    });
    // At the card level too, and NOT `no-target`: beta is still a land that
    // wants the heal - it is the settlement that is out, and it comes back.
    expect(cardBlockReason(v, "beta", "fortify"))
      .toEqual({ code: "no-settlement" });
    expect(cardBlockReason(v, "beta", "strong-fortify"))
      .toEqual({ code: "no-settlement" });
  });

  it("still says no-target when the realm simply has nothing to heal", () => {
    // Every land at its ceiling: the settlements are all free, and the card is
    // dead for a different reason. The two refusals must not be confused - one
    // is fixed by waiting a turn and the other by taking damage.
    const v = view({ settlementsSpent: {} });
    expect(cardBlockReason(v, "beta", "fortify")).toEqual({ code: "no-target" });
  });

  it("leaves Hillfort alone - it carries no keyword and costs no settlement", () => {
    const v = damaged({ settlementsSpent: { beta: 9 } });
    expect(cardBlockReason(v, "beta", "hillfort")).toBeNull();
    expect(validTargetsFor(v, "beta", "hillfort")).toEqual(["beta"]);
  });

  it("narrows a re-opened turn to the fortifies still legal", () => {
    // The repeat gate and the settlement bound meeting: the turn is open for
    // the fortify keyword, and the hand is narrowed to the ones the board
    // still allows. A spent land empties the set, which is what ends the run.
    const open = damaged({ settlements: { beta: 1 } });
    expect(
      playableSet(open, "beta", ["fortify", "strong-fortify", "raid"], {
        repeatOnly: "fortify",
      }),
    ).toEqual({ mode: "play", cardIndexes: [0, 1] });
    const out = damaged({ settlementsSpent: { beta: 1 } });
    expect(
      playableSet(out, "beta", ["fortify", "strong-fortify", "raid"], {
        repeatOnly: "fortify",
      }),
    ).toEqual({ mode: "play", cardIndexes: [] });
  });
});

describe("cardBlockReason", () => {
  it("keeps the always-legal cards always legal", () => {
    for (const id of [
      "grow-crops", "favourable-omens", "miasma", "war-council",
      "turnip-harvest",
    ]) {
      expect(cardBlockReason(view(), "beta", id), id).toBeNull();
      const sub = view({ overlords: new Map([["beta", "alpha"]]) });
      expect(cardBlockReason(sub, "beta", id), id).toBeNull();
    }
  });

  it("refuses a war council to a seat with nobody in the chair", () => {
    // `playCard` reads the actor's ruler through `rulerOf`, which throws on a
    // vacant chair. It was unreachable prose while every leaderless land took
    // no turn - a duel enemy fights chief or no chief now, and it crashed the
    // run on a card its own hand called playable.
    const vacant = view({ leaders: {} });
    expect(cardBlockReason(vacant, "beta", "war-council"))
      .toEqual({ code: "no-ruler" });
    // Nothing else in the always-legal set cares who is sitting there.
    for (const id of ["grow-crops", "favourable-omens", "miasma"]) {
      expect(cardBlockReason(vacant, "beta", id), id).toBeNull();
    }
    // The rule is `CardDef.needsRuler` and not the card's name, so it is in
    // the wire fingerprint with every other legality dial.
    expect(CARDS["war-council"].needsRuler).toBe(true);
  });

  it("tribute needs an overlord and is legal only as a vassal", () => {
    for (const id of TRIBUTE_CARDS) {
      expect(cardBlockReason(view(), "beta", id))
        .toEqual({ code: "needs-overlord" });
      const sub = view({ overlords: new Map([["beta", "alpha"]]) });
      expect(cardBlockReason(sub, "beta", id)).toBeNull();
    }
  });

  it("a guard is one unspent copy at a time, per faction", () => {
    expect(cardBlockReason(view(), "beta", "bodyguard")).toBeNull();
    expect(
      cardBlockReason(view({ guards: { bodyguard: ["beta"] } }), "beta", "bodyguard"),
    ).toEqual({ code: "already-held" });
    expect(holdsGuard(view({ guards: { bodyguard: ["beta"] } }), "beta", "bodyguard"))
      .toBe(true);
    // another faction's guard does not block beta
    expect(
      cardBlockReason(view({ guards: { bodyguard: ["gamma"] } }), "beta", "bodyguard"),
    ).toBeNull();
  });

  it("great raid needs a border and a whole-map realm has none", () => {
    expect(cardBlockReason(view(), "alpha", "great-raid")).toBeNull();
    const all = view({
      incorporated: { beta: "alpha", gamma: "alpha", delta: "alpha" },
    });
    expect(cardBlockReason(all, "alpha", "great-raid"))
      .toEqual({ code: "no-target" });
  });

  it("raid is no-target once nothing borders the realm and no vassal remains", () => {
    const all = view({
      incorporated: { beta: "alpha", gamma: "alpha", delta: "alpha" },
    });
    expect(cardBlockReason(all, "alpha", "raid")).toEqual({ code: "no-target" });
  });

  it("plague needs the actor's OWN stacks - a rival's do not count", () => {
    expect(cardBlockReason(view(), "beta", "plague"))
      .toEqual({ code: "no-disease" });
    const theirs = view({ disease: { gamma: { delta: 3 } } });
    expect(cardBlockReason(theirs, "beta", "plague"))
      .toEqual({ code: "no-disease" });
    const own = view({ disease: { gamma: { beta: 1 } } });
    expect(cardBlockReason(own, "beta", "plague")).toBeNull();
  });

  it("foul winds needs any stacks at all, whoever owns them", () => {
    expect(cardBlockReason(view(), "beta", "foul-winds"))
      .toEqual({ code: "no-disease" });
    const theirs = view({ disease: { gamma: { delta: 3 } } });
    expect(cardBlockReason(theirs, "beta", "foul-winds")).toBeNull();
  });

  it("plague counts only the stacks it may actually burn", () => {
    // beta answers to alpha, so a hostile card may not strike alpha. Stacks
    // that all sit on a peer of the actor's own realm are stacks the play
    // would leave exactly where they are - `playCard` skips them - so the
    // card is dead in hand rather than a turn spent on nothing.
    const vassal = view({
      overlords: new Map([["beta", "alpha"]]),
      disease: { alpha: { beta: 2 } },
    });
    expect(cardBlockReason(vassal, "beta", "plague"))
      .toEqual({ code: "no-disease" });
    // Downward is upkeep, and a plague on your own vassal burns.
    const lord = view({
      overlords: new Map([["gamma", "beta"]]),
      disease: { gamma: { beta: 2 } },
    });
    expect(cardBlockReason(lord, "beta", "plague")).toBeNull();
  });

  it("foul winds counts only the stacks the winds may actually reach", () => {
    const vassal = view({
      overlords: new Map([["beta", "alpha"]]),
      disease: { alpha: { gamma: 3 } },
    });
    expect(cardBlockReason(vassal, "beta", "foul-winds"))
      .toEqual({ code: "no-disease" });
    // And stacks the actor already owns move to nobody: the play would shift
    // nothing, which is the same dead card by another route.
    const own = view({ disease: { gamma: { beta: 3 } } });
    expect(cardBlockReason(own, "beta", "foul-winds"))
      .toEqual({ code: "no-disease" });
  });

  it("great raid stays legal when the only target left is the actor's vassal", () => {
    // The whole map under alpha, with beta held as a vassal rather than
    // annexed: nothing borders the realm, and the one thing alpha may still
    // strike is its own vassal - which is how the gate is held shut.
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      incorporated: { gamma: "alpha", delta: "alpha" },
    });
    expect(attackReach(v, "alpha")).toEqual(new Set(["beta"]));
    expect(greatRaidMarches(v, "alpha", "beta").length).toBeGreaterThan(0);
    expect(cardBlockReason(v, "alpha", "great-raid")).toBeNull();
    // The single raid already reads this reach; the two must agree.
    expect(cardBlockReason(v, "alpha", "raid")).toBeNull();
  });

  it("subjugate is no-target while every gate in reach is shut", () => {
    expect(cardBlockReason(view(), "beta", "subjugate"))
      .toEqual({ code: "no-target" });
  });

  it("an unknown card is unavailable", () => {
    expect(cardBlockReason(view(), "beta", "no-such-card"))
      .toEqual({ code: "unavailable" });
  });
});

describe("playableSet", () => {
  it("forced tribute monopolizes the set", () => {
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const set = playableSet(sub, "beta", ["raid", "pay-military-tribute", "grow-crops"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1] });
  });

  it("returns the playable indexes in hand order", () => {
    const set = playableSet(view(), "beta", ["subjugate", "grow-crops", "raid"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1, 2] });
  });

  it("a stale tribute in a free hand is neither forced nor playable", () => {
    const set = playableSet(view(), "beta", ["pay-military-tribute"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0] });
  });

  it("repeatOnly narrows the set to that card, whatever else is legal", () => {
    const set = playableSet(view(), "beta", ["raid", "grow-crops", "raid"],
      { repeatOnly: "raid" });
    expect(set).toEqual({ mode: "play", cardIndexes: [0, 2] });
  });

  it("repeatOnly outranks the forced tribute - the turn is already spent", () => {
    // The forced card monopolizes a turn that has yet to be spent. This one
    // has been, and the play that spent it re-opened the turn for its own
    // kind only, so the tribute waits for the next turn like anything else.
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const hand = ["raid", "pay-military-tribute"];
    expect(playableSet(sub, "beta", hand, { repeatOnly: "raid" }))
      .toEqual({ mode: "play", cardIndexes: [0] });
    expect(playableSet(sub, "beta", hand))
      .toEqual({ mode: "play", cardIndexes: [1] });
  });

  it("repeatOnly still asks ordinary legality of the repeat card", () => {
    // No free army anywhere: the copy in hand is the right card and still
    // cannot be played, which is what ends the run.
    const stuck = view({ marches: { "1": {
      id: 1, actor: "beta", from: "beta", to: "alpha", cardId: "raid",
      damage: 1, holdsArmy: true, declared: 1, expiry: 2,
    } }, armies: { beta: 1 } });
    expect(playableSet(stuck, "beta", ["raid", "grow-crops"],
      { repeatOnly: "raid" })).toEqual({ mode: "play", cardIndexes: [] });
  });

  it("a spent turn is never offered a discard, however dead the hand", () => {
    // The forced discard is how a turn that has done NOTHING gets moving. A
    // turn already spent by the play that re-opened it has nothing to unstick,
    // so an empty play set here means "end your turn", not "bin a card".
    expect(playableSet(view(), "beta", ["subjugate"], { repeatOnly: "raid" }))
      .toEqual({ mode: "play", cardIndexes: [] });
  });

  it("a repeatOnly of null is the ordinary open turn", () => {
    expect(playableSet(view(), "beta", ["grow-crops"], { repeatOnly: null }))
      .toEqual(playableSet(view(), "beta", ["grow-crops"]));
  });

  it("a dead hand degrades to discard mode over the whole hand, unconditionally", () => {
    // There is no rules knob to turn this off any more: a hand that refills
    // to a fixed size never changes on its own, so a seat holding only dead
    // cards needs a way out under every rule set - see the doc comment on
    // playableSet in src/playability.ts.
    const set = playableSet(view(), "beta", ["subjugate", "incorporate"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0, 1] });
  });
});

describe("handBlockReason", () => {
  it("still quotes a card's own reason even though the hand could be discarded", () => {
    // Discard mode answers "what may I send to the discard", not "was this
    // particular card legal" - cardBlockReason still answers that question,
    // and the mode test in playableSet is what keeps the two from blurring.
    expect(handBlockReason(view(), "beta", ["subjugate"], "subjugate"))
      .toEqual({ code: "no-target" });
  });

  it("a card locked out by the re-opened turn reads turn-spent", () => {
    const hand = ["raid", "grow-crops"];
    expect(handBlockReason(view(), "beta", hand, "grow-crops",
      { repeatOnly: "raid" })).toEqual({ code: "turn-spent" });
    expect(handBlockReason(view(), "beta", hand, "raid",
      { repeatOnly: "raid" })).toBeNull();
    // The card's own reason still outranks it: what the player has to fix is
    // the board, not the turn.
    expect(handBlockReason(view(), "beta", ["raid", "subjugate"], "subjugate",
      { repeatOnly: "raid" })).toEqual({ code: "no-target" });
  });

  it("a playable card locked out by the forced tribute reads forced-first", () => {
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const hand = ["pay-military-tribute", "raid"];
    expect(handBlockReason(sub, "beta", hand, "raid"))
      .toEqual({ code: "forced-first" });
    expect(handBlockReason(sub, "beta", hand, "pay-military-tribute")).toBeNull();
  });
});

describe("attackDamageFor", () => {
  // Leadership is not universal: it counts only where the ruler holds an
  // ability that boosts the card's own keyword. A people who never learned to
  // fight behind a chief get nothing from one, however hardened the chief is.
  const warLeader = { alpha: [RAID_LEADERSHIP] };

  it("is the spend plus a war leader's leadership, doubled per held reading", () => {
    expect(attackDamageFor(view(), "alpha", "raid", 3))
      .toEqual({ damage: 3, multiplier: 1 });
    // Leadership with no ability behind it moves nothing.
    const unled = view({ leadership: { alpha: 50 } });
    expect(attackDamageFor(unled, "alpha", "raid", 3).damage).toBe(3);
    const led = view({ leadership: { alpha: 50 }, leaderAbilities: warLeader });
    expect(attackDamageFor(led, "alpha", "raid", 3).damage).toBe(3 + 50);
    const read = view({
      leadership: { alpha: 50 }, leaderAbilities: warLeader, omens: { alpha: 2 },
    });
    expect(attackDamageFor(read, "alpha", "raid", 3))
      .toEqual({ damage: (3 + 50) * 4, multiplier: 4 });
  });

  it("doubles the arrow and not the price", () => {
    // A reading is free force: the land pays what it spends whatever the
    // multiplier, so what a reading is worth is the arrow it doubles.
    const read = view({ omens: { alpha: 1 } });
    expect(attackDamageFor(read, "alpha", "raid", 3).damage).toBe(6);
  });

  it("great raid reads the same formula, per arrow", () => {
    const v = view({
      leadership: { alpha: 50 }, leaderAbilities: warLeader, omens: { alpha: 1 },
    });
    expect(attackDamageFor(v, "alpha", "great-raid", 1))
      .toEqual({ damage: (1 + 50) * 2, multiplier: 2 });
  });

  it("omens multiply only attack cards", () => {
    const v = view({ omens: { alpha: 3 } });
    expect(omensMultiplier(v, "alpha", "raid")).toBe(8);
    expect(omensMultiplier(v, "alpha", "plague")).toBe(1);
    expect(omensHeld(v, "alpha")).toBe(3);
    expect(omensHeld(v, "beta")).toBe(0);
  });
});

describe("plagueDamageOn", () => {
  it("is 1 per OWN stack, doubled per miasma reading", () => {
    const v = view({
      disease: { beta: { alpha: 3, gamma: 2 } },
      miasma: { alpha: 1 },
    });
    expect(plagueDamageOn(v, "alpha", "beta")).toBe(6);
    // gamma's own two stacks feed gamma's plague, unscaled
    expect(plagueDamageOn(v, "gamma", "beta")).toBe(2);
    expect(plagueDamageOn(v, "alpha", "gamma")).toBe(0);
    expect(plagueMultiplier(v, "alpha")).toBe(2);
    expect(miasmaHeld(v, "alpha")).toBe(1);
  });
});

describe("outbreakPolygons", () => {
  it("splashes every neighbour of the target except the actor's own realm", () => {
    expect(outbreakPolygons(view(), "alpha", "gamma")).toEqual(["beta", "delta"]);
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(outbreakPolygons(v, "alpha", "gamma")).toEqual(["delta"]);
  });
});

describe("post-escape respite bookkeeping", () => {
  it("respiteExpiry answers only while the clock runs", () => {
    expect(ESCAPE_RESPITE_TURNS).toBe(2);
    expect(respiteExpiry(view({ respites: { beta: 5 }, turn: 4 }), "beta")).toBe(5);
    expect(respiteExpiry(view({ respites: { beta: 5 }, turn: 5 }), "beta"))
      .toBeUndefined();
    expect(respiteExpiry(view(), "beta")).toBeUndefined();
  });
});

describe("failureRiskOf", () => {
  it("warns unconditionally on a guarded card, never reading the guard lists", () => {
    // Reading `view.guards` here would turn the warning into a detector for
    // which rivals spent a guard - so the risk is quoted whether or not the
    // target actually holds one.
    const bare = failureRiskOf(view(), "alpha", "assassinate-ruler", "beta");
    expect(bare).toEqual({ kind: "hidden", because: "bodyguard" });
    const held = failureRiskOf(
      view({ guards: { bodyguard: ["beta"] } }),
      "alpha", "assassinate-ruler", "beta",
    );
    expect(held).toEqual(bare);
    expect(failureRiskOf(view(), "alpha", "raid", "beta")).toBeNull();
  });
});

describe("wealth", () => {
  it("wealthOf reads absent as broke", () => {
    expect(wealthOf(view(), "alpha")).toBe(0);
    expect(wealthOf(view({ wealth: { alpha: 3 } }), "alpha")).toBe(3);
  });

  it("income is 1 plus 1 per settlement founded in the incorporated realm", () => {
    expect(wealthIncomeFor(view(), "alpha")).toBe(1);
    const v = view({
      incorporated: { beta: "alpha" },
      settlements: { alpha: 1, beta: 2 },
    });
    expect(wealthIncomeFor(v, "alpha")).toBe(4);
  });

  it("never counts a vassal's lands or settlements - tribute is that channel", () => {
    const v = view({
      overlords: new Map([["gamma", "alpha"]]),
      settlements: { gamma: 5 },
    });
    expect(wealthIncomeFor(v, "alpha")).toBe(1);
  });
});

describe("handLimitFor", () => {
  /** A realm of exactly `n` lands under alpha, built out of annexations so the
   *  walk has something to count past the four ids the fixture ships with. */
  function realmOf(n: number) {
    const incorporated: Record<string, string> = {};
    for (let i = 1; i < n; i++) incorporated[`land-${i}`] = "alpha";
    return { overlords: new Map(), incorporated };
  }

  it("walks the curve: one more card per 1.5 lands, floored and capped", () => {
    const expected = [3, 3, 4, 4, 5, 6, 6, 7, 7, 7, 7, 7];
    expected.forEach((hand, i) => {
      expect(handLimitFor(realmOf(i + 1), "alpha")).toBe(hand);
    });
  });

  it("clamps at both ends", () => {
    // Nothing held at all is still a playable hand, and a realm that has eaten
    // the map still stops at MAX_HAND.
    expect(handLimitFor({ overlords: new Map(), incorporated: {} }, "nobody"))
      .toBe(MIN_HAND);
    expect(handLimitFor(realmOf(40), "alpha")).toBe(MAX_HAND);
  });

  it("counts the FULL realm - a vassal's own vassals and annexations", () => {
    // beta answers to alpha, gamma answers to beta, and gamma annexed delta.
    // Walked one level alpha holds 2 lands and a hand of 3; walked to depth it
    // holds 4 and a hand of 4, which is the number beside its score.
    const deep = {
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      incorporated: { delta: "gamma" },
    };
    expect(handLimitFor(deep, "alpha")).toBe(4);
  });

  it("is the size the deal opens on, so a first turn draws nothing", () => {
    expect(OPENING_HAND).toBe(MIN_HAND);
  });
});

describe("targetEligibilityFor on untargeted cards", () => {
  it("marks every faction irrelevant", () => {
    // A Great raid is aimed now - it names the land its neighbours all raid -
    // so the untargeted case has to be asked of a card that really takes none.
    for (const entry of targetEligibilityFor(view(), "beta", "war-council")) {
      expect(entry.state).toBe("irrelevant");
    }
  });
});

describe("a hostile card may never be aimed at your own realm's peers", () => {
  /** alpha - beta - gamma - delta on a line, with alpha lord of beta, beta
   *  lord of gamma. So gamma answers to beta AND, through beta, to alpha. */
  const pyramid = (extra: Partial<RulesView> = {}) =>
    view({
      adjacency: FULL_ADJ,
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      ...extra,
    });

  /** The same pyramid with delta ALSO directly under alpha, so beta and delta
   *  are siblings: one root, neither under the other. delta is reused rather
   *  than a fifth id invented, because `ORDER` is what `FULL_ADJ` and
   *  `factionIds` are built from and every other fixture here keeps its own
   *  `overlords`. */
  const siblings = (extra: Partial<RulesView> = {}) =>
    view({
      adjacency: FULL_ADJ,
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "beta"], ["delta", "alpha"],
      ]),
      ...extra,
    });

  const HOSTILE = [
    "raid", "strong-raid", "great-raid", "spread-disease",
    "localized-outbreak", "assassinate-ruler", "subjugate",
  ];

  it("blocks every hostile card of a vassal aimed at its direct lord", () => {
    const v = pyramid();
    for (const cardId of HOSTILE) {
      expect(validTargetsFor(v, "beta", cardId)).not.toContain("alpha");
    }
  });

  it("blocks a grand-vassal aimed at either lord above it", () => {
    const v = pyramid();
    for (const cardId of HOSTILE) {
      expect(validTargetsFor(v, "gamma", cardId)).not.toContain("beta");
      expect(validTargetsFor(v, "gamma", cardId)).not.toContain("alpha");
    }
  });

  it("blocks a vassal aimed at its sibling under the same lord", () => {
    const v = siblings();
    for (const cardId of HOSTILE) {
      expect(validTargetsFor(v, "beta", cardId)).not.toContain("delta");
      expect(validTargetsFor(v, "delta", cardId)).not.toContain("beta");
    }
  });

  it("blocks a grand-vassal aimed at its lord's sibling", () => {
    // gamma is under beta is under alpha; delta is under alpha. Same pyramid,
    // no line of fealty between them, and an arrow between them is still the
    // bloc fighting itself.
    expect(validTargetsFor(siblings(), "gamma", "raid")).not.toContain("delta");
  });

  it("leaves DOWNWARD alone - holding your own vassals down is upkeep", () => {
    // A lord keeps its own vassals in reach, which is what holds them under
    // the independence gate. Closing this would end vassalage as a decision.
    const v = pyramid();
    expect(validTargetsFor(v, "alpha", "raid")).toContain("beta");
    expect(validTargetsFor(v, "alpha", "raid")).toContain("gamma");
    expect(validTargetsFor(v, "beta", "raid")).toContain("gamma");
  });

  it("leaves a stranger alone - the rule is the realm, not a truce", () => {
    // delta is nobody's vassal here, so it is not in gamma's pyramid at all.
    expect(validTargetsFor(pyramid(), "gamma", "raid")).toContain("delta");
  });

  it("blocks a lord's ANNEXED land too - an annexation is its annexer", () => {
    // delta is alpha's outright, so raiding delta is raiding alpha.
    const v = pyramid({ incorporated: { delta: "alpha" } });
    expect(validTargetsFor(v, "beta", "raid")).not.toContain("delta");
    expect(validTargetsFor(v, "gamma", "raid")).not.toContain("delta");
  });

  it("says why, so the hover is not a silent refusal", () => {
    const v = pyramid();
    const blocked = targetEligibilityFor(v, "beta", "raid")
      .find((e) => e.factionId === "alpha");
    expect(blocked).toMatchObject({
      state: "blocked", reasons: [{ code: "liege" }],
    });
  });

  it("keeps a NON-hostile card aimed wherever it always was", () => {
    // Incorporate and the heals are the control: the rule is the keyword, not
    // "anything pointed at a lord". The heal needs a land under its ceiling to
    // have anything to aim at at all.
    const v = pyramid({ defense: { beta: 100 } });
    expect(validTargetsFor(v, "beta", "fortify")).toContain("beta");
    expect(validTargetsFor(v, "alpha", "incorporate")).toContain("beta");
  });

  it("narrows the two-step march aim, not just the one-step target list", () => {
    // The source-then-target flow reads `marchTargetsFrom`, which is a second
    // door into the same decision - a rule enforced at one door is no rule.
    const v = pyramid({ armies: { gamma: 3 } });
    expect(marchTargetsFrom(v, "gamma", "gamma", "raid")).not.toContain("beta");
    expect(marchTargetsFrom(v, "gamma", "gamma", "raid")).toContain("delta");
  });
});

describe("Localized outbreak's splash and the pyramid", () => {
  it("skips a lord standing next to a legal target", () => {
    // The card is aimed at ONE polygon and lands on its neighbours, so a legal
    // aim at a fellow vassal can splash onto the lord beside it - the keyword
    // defeated by geometry rather than by a rule.
    const v = view({
      adjacency: FULL_ADJ,
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(outbreakPolygons(v, "gamma", "delta")).not.toContain("alpha");
    expect(outbreakPolygons(v, "gamma", "delta")).not.toContain("beta");
    // A free faction's splash is untouched: third parties are the card's text.
    expect(outbreakPolygons(v, "delta", "gamma")).toContain("alpha");
  });
});

describe("a card with nothing left to aim at says so", () => {
  it("calls a vassal's raid no-target when its only neighbour is its lord", () => {
    // On the LINE, alpha's only neighbour is beta. Made beta's vassal, alpha
    // has nowhere its raid may go - and the card must SAY that rather than
    // read as playable and then refuse every land on the map.
    const v = view({ overlords: new Map([["alpha", "beta"]]) });
    expect(validTargetsFor(v, "alpha", "raid")).toEqual([]);
    expect(cardBlockReason(v, "alpha", "raid")).toEqual({ code: "no-target" });
    expect(cardBlockReason(v, "alpha", "great-raid")).toEqual({ code: "no-target" });
    expect(isCardPlayable(v, "alpha", "raid")).toBe(false);
    expect(marchSourcesFor(v, "alpha")).toEqual([]);
  });
});
