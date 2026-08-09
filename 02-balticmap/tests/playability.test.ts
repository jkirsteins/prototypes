import { describe, it, expect } from "vitest";
import { defenseMaxAll, siteCaps } from "./helpers";
import {
  ESCAPE_RESPITE_TURNS, INCORPORATE_REALM_GATE, SETTLEMENT_BASE_CAP,
  attackDamageFor, omensMultiplier, attackReach, borderPolygonsOf,
  cardBlockReason, failureRiskOf, freeSitesIn, greatRaidMarches,
  handBlockReason, holdsGuard, incorporateRealmGate, isCardPlayable,
  marchSourcesAgainst, marchSourcesFor, marchTargetsFrom, miasmaHeld, omensHeld,
  outbreakPolygons, plagueDamageOn, plagueMultiplier, playableSet, reachOf,
  respiteExpiry, settlementAllowance, settlementsIn, subjugationGateOn,
  targetEligibilityFor, validTargetsFor, wealthIncomeFor, wealthOf,
  type RulesView,
} from "../src/playability";
import { TRIBUTE_CARDS } from "../src/cards";
import { GREAT_RAID_DAMAGE, RAID_DAMAGE, SUBJUGATION_GATE } from "../src/defense";

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

/** The gate line on a 600 polygon: floor(0.25 * 600). */
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
    [`${from}>${to}#0`]: {
      actor: from, from, to, cardId: "raid", damage: 4,
      holdsArmy: true, expiry: 2, ...over,
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

  it("aims an army only at what its own land borders", () => {
    const v = view({ overlords: new Map([["gamma", "beta"]]) });
    // beta borders alpha and its own vassal gamma, and may batter either.
    expect(marchTargetsFrom(v, "beta", "beta")).toEqual(["alpha", "gamma"]);
    // The vassal's own army reaches delta - and not gamma itself: no land
    // borders itself, so holding a vassal down takes an army from next door.
    expect(marchTargetsFrom(v, "beta", "gamma")).toEqual(["delta"]);
    expect(marchSourcesAgainst(v, "beta", "delta")).toEqual(["gamma"]);
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

describe("subjugationGateOn and the 25% boundary", () => {
  it("quotes the current defense against the floored gate line", () => {
    expect(subjugationGateOn(view(), "beta"))
      .toEqual({ defense: 600, required: GATE, open: false });
    expect(subjugationGateOn(view({ defense: { beta: 90 } }), "beta"))
      .toEqual({ defense: 90, required: GATE, open: true });
  });

  it("opens at exactly 25% and stays shut one point above", () => {
    expect(subjugationGateOn(view({ defense: { beta: GATE } }), "beta").open)
      .toBe(true);
    expect(subjugationGateOn(view({ defense: { beta: GATE + 1 } }), "beta").open)
      .toBe(false);
  });

  it("floors an odd ceiling, so the printed line is the legal line", () => {
    const v = (d: number) =>
      view({ defenseMax: defenseMaxAll(ORDER, 610), defense: { beta: d } });
    // floor(0.25 * 610) = 152
    expect(subjugationGateOn(v(152), "beta"))
      .toEqual({ defense: 152, required: 152, open: true });
    expect(subjugationGateOn(v(153), "beta").open).toBe(false);
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
      defense: { gamma: 100 }, respites: { gamma: 5 }, turn: 2,
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
      defense: { alpha: 100, beta: 100 },
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
      defense: { beta: 100 },
    });
    expect(targetEligibilityFor(v, "alpha", "subjugate")).toContainEqual({
      state: "blocked", factionId: "beta", reasons: [{ code: "already-vassal" }],
    });
  });

  it("allows poaching another lord's vassal through an open gate", () => {
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      defense: { gamma: 100 },
    });
    expect(validTargetsFor(v, "beta", "subjugate")).toContain("gamma");
  });

  it("marks the actor itself blocked as self when its own land is in reach", () => {
    // Annexing beta resolves alpha's border back to alpha, so the self rule
    // has to answer rather than the reach filter.
    const v = view({ incorporated: { beta: "alpha" }, defense: { alpha: 100 } });
    expect(targetEligibilityFor(v, "alpha", "subjugate")).toContainEqual({
      state: "blocked", factionId: "alpha", reasons: [{ code: "self" }],
    });
  });

  it("a vassal may Subjugate a free faction - only its liege is off-limits", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      defense: { gamma: 100 },
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
    const stuck = view({ marches: { "beta>alpha#0": {
      actor: "beta", from: "beta", to: "alpha", cardId: "raid",
      damage: 1, holdsArmy: true, expiry: 2,
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
  it("is base plus leadership, doubled per held omens reading", () => {
    expect(attackDamageFor(view(), "alpha", "raid"))
      .toEqual({ damage: RAID_DAMAGE, multiplier: 1 });
    const led = view({ leadership: { alpha: 50 } });
    expect(attackDamageFor(led, "alpha", "raid").damage).toBe(RAID_DAMAGE + 50);
    const read = view({ leadership: { alpha: 50 }, omens: { alpha: 2 } });
    expect(attackDamageFor(read, "alpha", "raid"))
      .toEqual({ damage: (RAID_DAMAGE + 50) * 4, multiplier: 4 });
  });

  it("great raid uses its own base under the same formula", () => {
    const v = view({ leadership: { alpha: 50 }, omens: { alpha: 1 } });
    expect(attackDamageFor(v, "alpha", "great-raid"))
      .toEqual({ damage: (GREAT_RAID_DAMAGE + 50) * 2, multiplier: 2 });
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

describe("targetEligibilityFor on untargeted cards", () => {
  it("marks every faction irrelevant", () => {
    for (const entry of targetEligibilityFor(view(), "beta", "great-raid")) {
      expect(entry.state).toBe("irrelevant");
    }
  });
});
