import { describe, expect, it } from "vitest";
import { pact, settledOnce, } from "./helpers";
import {
  GUARD_POSTED, GUARD_RISK, cardModifierLines, cardRiskLine,
  explainTargetEligibility, pactBoostLines, respiteLines, settlementBlock,
  subjugationBreakdown, targetImpactLines, targetOddsLines,
} from "../src/target-explanations";
import { CARDS, GUARDS } from "../src/cards";
import { bumpMight, type Relations } from "../src/relations";
import { standingChangeText } from "../src/view";
import type { TooltipLine } from "../src/panel";
import {
  INCORPORATE_RAMP, failureRiskOf, loyaltyKey,
  type RulesView, type TargetEligibility,
} from "../src/playability";

const nameOf = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1);

/** These cases are about eligibility wording, not about odds. The risk band has
 *  its own describe below, driven through `targetOddsLines` with a real view. */
const noRisk = (): string[] => [];

describe("explainTargetEligibility", () => {
  it("labels an available candidate", () => {
    expect(explainTargetEligibility([
      { state: "available", factionId: "beta" },
    ], nameOf, noRisk)).toEqual([{
      factionId: "beta",
      available: true,
      risk: [],
      lines: ["Beta", "Available."],
    }]);
  });

  it("preserves multiple blocker order and formats scaled lead values", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "alliance", expiresTurn: 12 },
        {
          code: "insufficient-lead",
          required: 4,
          lead: 1,
          realmSize: 2,
          settlements: 0,
          poachSurcharge: 0,
          prowessReduction: 0,
        },
      ],
    }], nameOf, noRisk)).toEqual([{
      factionId: "gamma",
      available: false,
      risk: [],
      lines: [
        "Gamma",
        "Blocked by Alliance until turn 12.",
        "Need a Might lead of 4 because their realm has 2 lands.",
        "Current lead: Might 1.",
      ],
    }]);
  });

  it("uses singular copy for a one-land realm", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "alpha",
      reasons: [{
        code: "insufficient-lead",
        required: 2,
        lead: 0,
        realmSize: 1,
        settlements: 0,
        poachSurcharge: 0,
        prowessReduction: 0,
      }],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Alpha",
      "Need a Might lead of 2 because their realm has 1 land.",
      "Current lead: Might 0.",
    ]);
  });

  it("omits irrelevant candidates", () => {
    expect(explainTargetEligibility([
      { state: "irrelevant", factionId: "delta" },
    ], nameOf, noRisk)).toEqual([]);
  });

  it("formats the respite blocker", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [{ code: "respite", expiresTurn: 7 }],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Beta",
      "Escaped vassalage recently; cannot be subjugated until turn 7.",
    ]);
  });

  it("formats each relationship and identity blocker", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [
        { code: "already-vassal" },
        { code: "liege" },
        { code: "overlord-prohibited" },
        { code: "incorporated" },
        { code: "self" },
        { code: "not-your-vassal" },
      ],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Beta",
      "Already your vassal.",
      "You owe them fealty, directly or through your lords.",
      "You cannot target your overlord.",
      "Already incorporated.",
      "You cannot target yourself.",
      "Not your vassal.",
    ]);
  });

  it("appends annotation lines to available targets only", () => {
    const entries: TargetEligibility[] = [
      { state: "available", factionId: "alpha" },
      { state: "blocked", factionId: "beta", reasons: [{ code: "self" }] },
    ];
    const out = explainTargetEligibility(entries, (id) => id, noRisk, () => ["+3 Might"]);
    expect(out[0].lines).toEqual(["alpha", "Available.", "+3 Might"]);
    expect(out[1].lines).not.toContain("+3 Might");
  });

  it("annotates nothing when no annotator is given", () => {
    const entries: TargetEligibility[] = [{ state: "available", factionId: "alpha" }];
    expect(explainTargetEligibility(entries, (id) => id, noRisk)[0].lines)
      .toEqual(["alpha", "Available."]);
  });
});

describe("cardModifierLines", () => {
  const none = { omens: {}, diplomacyBoost: [], guards: {}, booms: {} };

  it("says nothing when no modifier is active", () => {
    expect(cardModifierLines(none, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "bodyguard")).toEqual([]);
  });

  it("marks a doublable card while a reading is held", () => {
    const v = { ...none, omens: { alpha: 1 } };
    expect(cardModifierLines(v, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts double."]);
    expect(cardModifierLines(v, "alpha", "pay-military-tribute"))
      .toEqual(["Favourable omens: this card counts double."]);
  });

  it("names the multiple a stack is worth, not just that one is held", () => {
    expect(cardModifierLines({ ...none, omens: { alpha: 2 } }, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts quadruple."]);
    expect(cardModifierLines({ ...none, omens: { alpha: 3 } }, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts x8."]);
  });

  it("leaves a card with nothing to double unmarked", () => {
    const v = { ...none, omens: { alpha: 1 } };
    expect(cardModifierLines(v, "alpha", "subjugate")).toEqual([]);
  });

  it("tells a held reading what a second one would be worth", () => {
    // The only route by which a player discovers readings stack at all: the
    // card text describes one, and a second is legal so there is no block line.
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "favourable-omens"))
      .toEqual([
        "1 reading already in hand: another makes the next gain count quadruple.",
      ]);
    expect(cardModifierLines({ ...none, omens: { alpha: 2 } }, "alpha", "favourable-omens"))
      .toEqual([
        "2 readings already in hand: another makes the next gain count x8.",
      ]);
  });

  it("says an Alliance will run long", () => {
    expect(
      cardModifierLines({ ...none, diplomacyBoost: ["alpha"] }, "alpha", "alliance"),
    ).toEqual(["Extended diplomacy: this Alliance lasts 10 turns."]);
  });

  it("says a bodyguard is already posted", () => {
    expect(cardModifierLines({ ...none, guards: { bodyguard: ["alpha"] } }, "alpha", "bodyguard"))
      .toEqual(["A bodyguard is already posted."]);
  });

  it("ignores another faction's modifiers", () => {
    const v = { omens: { beta: 1 }, diplomacyBoost: ["beta"], guards: { bodyguard: ["beta"] }, booms: {} };
    expect(cardModifierLines(v, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "bodyguard")).toEqual([]);
  });
});

describe("targetOddsLines", () => {
  const ORDER = ["alpha", "beta", "gamma"];
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {},
    adjacency: { alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta"] },
    factionIds: ORDER, alliances: {}, turn: 1, guards: {}, omens: {},
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  it("says nothing for a card that cannot fail", () => {
    expect(targetOddsLines(v(), "alpha", "raid", "beta")).toEqual([]);
    // a free faction is a certain take, so Subjugate stays silent too
    expect(targetOddsLines(v(), "alpha", "subjugate", "beta")).toEqual([]);
  });

  /** Not a roll, and it still has to be said. A guard is the one way a play can
   *  come back with nothing that the player cannot see coming at all, which
   *  makes it the one that most needs saying before they commit. */
  it("warns that a blade can be turned aside, on every target alike", () => {
    const warning = [
      "A posted bodyguard would turn this aside, and you cannot tell in advance.",
      "A failed attempt still spends the card.",
    ];
    expect(targetOddsLines(v(), "alpha", "assassinate-ruler", "beta"))
      .toEqual(warning);
    expect(targetOddsLines(v({ guards: { bodyguard: ["beta"] } }), "alpha", "assassinate-ruler", "beta"))
      .toEqual(warning);
  });

  it("warns before a coin-flip poach, and that the card is spent either way", () => {
    const view = v({ overlords: new Map([["gamma", "beta"]]) });
    expect(targetOddsLines(view, "alpha", "subjugate", "gamma")).toEqual([
      "50% chance to succeed - they already have an overlord.",
      "A failed attempt still spends the card.",
    ]);
  });

  it("quotes the Incorporate odds and the turns behind them", () => {
    const view = v({
      overlords: new Map([["gamma", "alpha"]]),
      loyalty: { [loyaltyKey("gamma", "alpha")]: 1 },
    });
    expect(targetOddsLines(view, "alpha", "incorporate", "gamma")).toEqual([
      `20% chance to succeed - held 1 of the ${INCORPORATE_RAMP} turns needed.`,
      "A failed attempt still spends the card.",
    ]);
  });

  it("still states the odds once they are certain, rather than going quiet", () => {
    // Silence would be ambiguous: the player cannot tell "certain" from
    // "this card does not roll" if a sure thing prints nothing.
    const view = v({
      overlords: new Map([["gamma", "alpha"]]),
      loyalty: { [loyaltyKey("gamma", "alpha")]: INCORPORATE_RAMP },
    });
    expect(targetOddsLines(view, "alpha", "incorporate", "gamma")).toEqual([
      `Certain: held ${INCORPORATE_RAMP} turns, ${INCORPORATE_RAMP} needed.`,
    ]);
  });

  it("counts a single turn held as one turn", () => {
    const view = v({
      overlords: new Map([["gamma", "alpha"]]),
      loyalty: { [loyaltyKey("gamma", "alpha")]: 1 },
    });
    // Reaches the "Certain" branch only at INCORPORATE_RAMP, so pin the plural
    // where the number is actually printed as a noun phrase.
    expect(targetOddsLines({ ...view, loyalty: {} }, "alpha", "incorporate", "gamma")[0])
      .toBe(`0% chance to succeed - held 0 of the ${INCORPORATE_RAMP} turns needed.`);
  });
});

describe("cardRiskLine", () => {
  /** The card-level statement exists because the per-target one is not enough:
   *  Subjugate is a coin flip on one candidate and a certainty on the next, so
   *  a player reading only the candidate lines meets the rule once, by
   *  accident, on whichever land they happened to hover. */
  it("names the failure mode of every card that has one", () => {
    expect(cardRiskLine("subjugate")).toContain("Can fail");
    expect(cardRiskLine("subjugate")).toContain("50%");
    expect(cardRiskLine("incorporate")).toContain("Can fail");
    expect(cardRiskLine("assassinate-ruler")).toContain("bodyguard");
  });

  it("warns about the guard on every card one can turn aside", () => {
    // Each guarded card names its own guard in ordinary English rather than
    // the card - the naming rule in AGENTS.md.
    expect(cardRiskLine("alliance")).toContain("wary");
    for (const guarded of Object.values(GUARDS)) {
      expect(cardRiskLine(guarded), `${guarded} has no risk line`)
        .toContain("Can fail");
    }
  });

  it("has prose for every guard, in both places a player meets one", () => {
    // Two tables, one per surface. A fourth guard that reached the rules and
    // not these would warn about the wrong card, or render `undefined`.
    for (const guardId of Object.keys(GUARDS)) {
      expect(GUARD_RISK[guardId], `${guardId} has no risk wording`)
        .toBeTypeOf("string");
      expect(GUARD_POSTED[guardId], `${guardId} has no posted wording`)
        .toBeTypeOf("string");
      // Lowercase common nouns: the capitalized name is the card, and these
      // are plain text with no segment to point at.
      for (const c of Object.values(CARDS)) {
        expect(GUARD_RISK[guardId]).not.toContain(c.name);
        expect(GUARD_POSTED[guardId]).not.toContain(c.name);
      }
    }
  });

  it("shows a held guard and a held boom in the hand", () => {
    const none = { omens: {}, diplomacyBoost: [], guards: {}, booms: {} };
    for (const guardId of Object.keys(GUARDS)) {
      expect(cardModifierLines({ ...none, guards: { [guardId]: ["alpha"] } }, "alpha", guardId))
        .toEqual([GUARD_POSTED[guardId]]);
      // and not for somebody else's
      expect(cardModifierLines({ ...none, guards: { [guardId]: ["beta"] } }, "alpha", guardId))
        .toEqual([]);
    }
    // Booms state the allowance, which is the number a blocked land quotes
    // back - the only route by which a player learns they stack.
    expect(cardModifierLines({ ...none, booms: { alpha: 2 } }, "alpha", "found-settlement"))
      .toEqual(["2 population booms held: your people support 4 settlements in a land."]);
    expect(cardModifierLines({ ...none, booms: { alpha: 1 } }, "alpha", "population-boom"))
      .toEqual(["1 population boom held: your people support 3 settlements in a land."]);
    expect(cardModifierLines({ ...none, booms: { alpha: 1 } }, "alpha", "raid")).toEqual([]);
  });

  it("says what is missing and what fixes it on a land at its allowance", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [{ code: "needs-population", have: 2, allowance: 2 }],
    }], nameOf, noRisk)[0].lines).toEqual([
      "Beta",
      "2 settlements here already, and your people support 2.",
      "A Population boom raises that by one.",
    ]);
  });

  it("stays silent for a card the rules can never refuse", () => {
    for (const id of ["raid", "grow-crops", "fortify", "a-feast", "population-boom"]) {
      expect(cardRiskLine(id)).toBeNull();
    }
  });

  /** The band and the rules must agree on WHICH cards can fail, or the tip
   *  either warns about a certainty or stays quiet about a gamble. Driven off
   *  CARDS so a fifteenth card is covered the day it is added. */
  it("covers exactly the cards failureRiskOf answers for", () => {
    const ids = ["alpha", "beta", "gamma"];
    const view: RulesView = {
      relations: {}, overlords: new Map([["gamma", "beta"]]), incorporated: {},
      adjacency: { alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta"] },
      factionIds: ids, alliances: {}, turn: 1, guards: {}, omens: {},
      diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
      respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
      prowess: {},
    };
    const fallible = Object.keys(CARDS).filter((id) =>
      ids.some((target) => failureRiskOf(view, "alpha", id, target) !== null),
    );
    expect(fallible.filter((id) => cardRiskLine(id) === null)).toEqual([]);
    expect(Object.keys(CARDS).filter((id) => cardRiskLine(id) !== null).sort())
      .toEqual(fallible.sort());
  });
});

describe("targetImpactLines", () => {
  const ORDER = ["alpha", "beta", "gamma", "delta"];
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {},
    adjacency: {
      alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta"], delta: [],
    },
    factionIds: ORDER, alliances: {}, turn: 1, guards: {}, omens: {},
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  /** The block as a reader sees it: the heading, then "amount text" per row. */
  const shown = (lines: TooltipLine[]): string[] =>
    lines.map((l) => (l.amount === undefined ? l.text : `${l.amount} ${l.text}`));

  it("says nothing for a card that takes no target", () => {
    expect(targetImpactLines(v(), "alpha", "fortify", "beta")).toEqual([]);
  });

  it("heads the block with the card, then a row per effect", () => {
    expect(shown(targetImpactLines(v(), "alpha", "raid", "beta")))
      .toEqual(["If Raid played here:", "+1 Might (0 -> +1)"]);
    expect(targetImpactLines(v(), "alpha", "raid", "beta")[0].blockStart).toBe(true);
  });

  it("gives the whole block one colour, so it scans as the card's own", () => {
    // Not red or green: on the threshold blocks those mean which realm is
    // being counted, and inside these rows they mean the sign of a value.
    for (const line of targetImpactLines(v(), "alpha", "raid", "beta")) {
      expect(line.tone).toBe("info");
    }
    for (const line of targetImpactLines(v(), "alpha", "alliance", "beta")) {
      expect(line.tone).toBe("info");
    }
  });

  it("walks from the lead already standing, signed", () => {
    const view = v({ relations: bumpMight({}, "alpha", "beta") });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("+1 Might (+1 -> +2)");
  });

  it("colours each value by its own sign, never the line by its outcome", () => {
    // A Raid from -2 to -1 is progress, but neither number is good news. The
    // whole-line green this replaced said it was.
    const view = v({
      relations: bumpMight(bumpMight({}, "beta", "alpha"), "beta", "alpha"),
    });
    const row = targetImpactLines(view, "alpha", "raid", "beta")[1];
    expect(row.spans).toEqual([
      { text: "Might (" },
      { text: "-2", lead: -2 },
      { text: " -> " },
      { text: "-1", lead: -1 },
      { text: ")" },
    ]);
    // Inside the brackets it is the shared phrasing verbatim - same numbers,
    // same arrow, same signing - so the hover, the activity log and the round
    // summary cannot quote one change three ways. Only the brackets are the
    // hover's own, and they are there because the row opens with a figure.
    const shared = standingChangeText({ before: -2, after: -1 });
    expect(shared).toBe("Might -2 -> -1");
    expect(row.text).toBe(`Might (${shared.slice("Might ".length)})`);
  });

  it("doubles a held reading, and says which number is the reading's", () => {
    const view = v({ omens: { alpha: 1 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("+2 Might (0 -> +2, doubled)");
  });

  it("quotes a stack at its real multiple before it is aimed", () => {
    const view = v({ omens: { alpha: 2 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("+4 Might (0 -> +4, quadrupled)");
  });

  it("shows an Assassinate as the levelling it is, never as a gain", () => {
    const view = v({
      relations: bumpMight(bumpMight({}, "alpha", "beta"), "alpha", "beta"),
    });
    expect(shown(targetImpactLines(view, "alpha", "assassinate-ruler", "beta"))[1])
      .toBe("-2 Might (+2 -> 0)");
  });

  /** The block warns that a guard could turn the blade aside, so it now says
   *  the word "bodyguard" on every target - which is exactly when it would
   *  become a detector if it ever said it on only the guarded ones. Compares
   *  the WHOLE block rather than one row: a leak would arrive as an extra line,
   *  and an assertion pinned to an index would step straight over it. */
  it("does not leak that the target has a bodyguard posted", () => {
    const guarded = shown(
      targetImpactLines(v({ guards: { bodyguard: ["beta"] } }), "alpha", "assassinate-ruler", "beta"),
    );
    const unguarded = shown(
      targetImpactLines(v(), "alpha", "assassinate-ruler", "beta"),
    );
    expect(guarded).toEqual(unguarded);
    expect(guarded[1]).toBe("0 Might (0 -> 0)");
    expect(guarded).toContain(
      "-- A posted bodyguard would turn this aside, and you cannot tell in advance.",
    );
  });

  it("marks an effect that is not a number rather than leaving the column blank", () => {
    const lead = bumpMight(bumpMight({}, "alpha", "beta"), "alpha", "beta");
    expect(shown(targetImpactLines(v({ relations: lead }), "alpha", "subjugate", "beta")))
      .toEqual(["If Subjugate played here:", "-- Becomes your vassal."]);
    const poach = v({
      relations: lead, overlords: new Map([["beta", "gamma"]]),
    });
    expect(shown(targetImpactLines(poach, "alpha", "subjugate", "beta"))[1])
      .toBe("-- 50% chance to succeed - they already have an overlord.");
  });

  it("counts the turns an Alliance would run, boost included", () => {
    expect(shown(targetImpactLines(v(), "alpha", "alliance", "beta"))[1])
      .toBe("-- No hostile cards between you for 5 turns.");
    const boosted = v({ diplomacyBoost: ["alpha"] });
    expect(shown(targetImpactLines(boosted, "alpha", "alliance", "beta"))[1])
      .toBe("-- No hostile cards between you for 10 turns.");
  });

  it("says what a settlement buys, on your own land", () => {
    const view = v({ siteCaps: { alpha: 1 } });
    expect(shown(targetImpactLines(view, "alpha", "found-settlement", "alpha")))
      .toEqual([
        "If Found a settlement played here:",
        "-- +1 to the Might lead others need to subjugate you.",
      ]);
  });

  it("keeps a refusal one red line, with no block heading over it", () => {
    const view = v({ alliances: { "alpha|beta": pact(12) } });
    expect(targetImpactLines(view, "alpha", "raid", "beta")).toEqual([
      { text: "Blocked by Alliance until turn 12.", tone: "bad" },
    ]);
  });

  it("names the shortfall when the lead is the only thing missing", () => {
    const view = v({ incorporated: { gamma: "beta" } });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta")[0].text).toBe(
      "Need a Might lead of 4 because their realm has 2 lands.",
    );
  });

  it("drops the shortfall line when the breakdown below already itemises it", () => {
    const view = v({ incorporated: { gamma: "beta" } });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta", true)).toEqual([]);
    // Only that one reason is dropped: an Alliance still has to be said.
    const allied = v({ alliances: { "alpha|beta": pact(12) } });
    expect(targetImpactLines(allied, "alpha", "raid", "beta", true)).toHaveLength(1);
  });

  it("says out of reach rather than going quiet on a land it cannot touch", () => {
    expect(targetImpactLines(v(), "alpha", "raid", "delta")).toEqual([
      { text: "Out of reach.", tone: "bad" },
    ]);
  });

  it("does not tell you your own land is out of reach", () => {
    // A realm never borders itself, so your own land lands in the same
    // "irrelevant" bucket as a land across the map.
    expect(targetImpactLines(v(), "alpha", "raid", "alpha")).toEqual([
      { text: "Your own land.", tone: "bad" },
    ]);
    // ...and a land you have annexed resolves to you, so it says the same.
    const view = v({ incorporated: { beta: "alpha" } });
    expect(targetImpactLines(view, "alpha", "raid", "alpha")[0].text)
      .toBe("Your own land.");
  });

  it("says the inward card's own version of out of reach", () => {
    expect(targetImpactLines(v(), "alpha", "found-settlement", "beta")).toEqual([
      { text: "Not in your realm.", tone: "bad" },
    ]);
  });
});

describe("subjugationBreakdown", () => {
  const ORDER = ["alpha", "beta", "gamma", "delta"];
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {},
    adjacency: {
      alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
      delta: ["gamma"],
    },
    factionIds: ORDER, alliances: {}, turn: 1, guards: {}, omens: {},
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  /** relations where actor leads target by n */
  const lead = (actor: string, target: string, n: number): Relations => {
    let rel: Relations = {};
    for (let i = 0; i < n; i++) rel = bumpMight(rel, actor, target);
    return rel;
  };

  it("heads the block with the badge's own figure", () => {
    const view = v({ relations: lead("alpha", "beta", 1) });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +1/2. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "2", text: "from realm size (1 land)" },
    ]);
  });

  it("itemises realm size, settlements and overlord support", () => {
    // beta holds gamma (2 lands), gamma is settled, and beta is delta's vassal
    // with a hold of 2, so the surcharge is ceil(2/2) = 1.
    let relations = lead("alpha", "beta", 2);
    relations = bumpMight(relations, "delta", "beta");
    relations = bumpMight(relations, "delta", "beta");
    const view = v({
      overlords: new Map([["gamma", "beta"], ["beta", "delta"]]),
      settlements: settledOnce(["gamma"]),
      relations,
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +2/6. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
      { amount: "+1", text: "from 1 settlement" },
      { amount: "+1", text: "from their overlord's support" },
    ]);
  });

  it("makes the column add up to the heading above it", () => {
    const view = v({
      overlords: new Map([["gamma", "beta"]]),
      settlements: settledOnce(["gamma"]),
      relations: lead("alpha", "beta", 1),
    });
    const lines = subjugationBreakdown(view, "alpha", "beta");
    const sum = (from: number, to: number): number =>
      lines.slice(from, to).reduce((n, l) => n + Number(l.amount), 0);
    expect(lines[0].text).toBe("Might +1/5. Opponent's thresholds:");
    expect(sum(1, 3)).toBe(5);
  });

  it("itemises your ruler's prowess as a cut, and the column still sums", () => {
    const view = v({
      relations: lead("alpha", "beta", 1),
      prowess: { alpha: 4 },
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +1/1. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "2", text: "from realm size (1 land)" },
      { amount: "-1", text: "for your ruler's prowess" },
    ]);
  });

  // The mirrored possessive: on a "Your thresholds" block the prowess named
  // is the rival ruler's, the one doing the taking.
  it("itemises a proven rival's cut into the threshold you race", () => {
    const view = v({
      relations: lead("beta", "alpha", 1),
      prowess: { beta: 4 },
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might -1/1. Your thresholds:", tone: "bad", blockStart: true },
      { amount: "2", text: "from realm size (1 land)" },
      { amount: "-1", text: "for their ruler's prowess" },
    ]);
  });

  it("itemises your own realm, and warns, when they are the ones racing", () => {
    // beta leads Might over alpha, so the block counts the human's realm.
    const view = v({
      overlords: new Map([["gamma", "beta"], ["delta", "alpha"]]),
      relations: lead("beta", "alpha", 1),
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might -1/4. Your thresholds:", tone: "bad", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
    ]);
  });

  // The possessive is the whole point of this case: the surcharge belongs to
  // the human's own overlord, on a tooltip titled with a rival's name.
  it("prices your own overlord's hold into the threshold they race", () => {
    let relations = lead("beta", "alpha", 2);
    relations = bumpMight(relations, "gamma", "alpha");
    relations = bumpMight(relations, "gamma", "alpha");
    relations = bumpMight(relations, "gamma", "alpha");
    const view = v({
      overlords: new Map([["alpha", "gamma"], ["delta", "alpha"]]),
      relations,
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might -2/6. Your thresholds:", tone: "bad", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
      { amount: "+2", text: "from your overlord's support" },
    ]);
  });

  it("still shows a grand-liege's race - a lord may poach its own grand-vassal", () => {
    // beta is alpha's grand-liege (alpha -> gamma -> beta). Might, where beta
    // leads, shows the human's own bar.
    const view = v({
      overlords: new Map([["alpha", "gamma"], ["gamma", "beta"]]),
      relations: lead("beta", "alpha", 1),
    });
    expect(subjugationBreakdown(view, "alpha", "beta").map((l) => l.text))
      .toEqual(["Might -1/2. Your thresholds:", "from realm size (1 land)"]);
  });

  it("says nothing about a faction inside your own realm", () => {
    const view = v({
      overlords: new Map([["beta", "alpha"]]),
      relations: lead("alpha", "beta", 2),
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([]);
  });

  it("says nothing when nothing stands between you, which is the badge's gate", () => {
    expect(subjugationBreakdown(v(), "alpha", "beta")).toEqual([]);
  });

  it("still explains the threshold under a pact, which only suspends it", () => {
    const view = v({ alliances: { "alpha|beta": pact(6) } });
    expect(subjugationBreakdown(view, "alpha", "beta").map((l) => l.text)).toEqual([
      "Might 0/2. Opponent's thresholds:",
      "from realm size (1 land)",
    ]);
  });

  it("counts settlements in the plural", () => {
    const view = v({
      overlords: new Map([["gamma", "beta"]]),
      settlements: settledOnce(["beta", "gamma"]),
      relations: lead("alpha", "beta", 1),
    });
    const lines = subjugationBreakdown(view, "alpha", "beta");
    expect(lines).toContainEqual({ amount: "+2", text: "from 2 settlements" });
    expect(lines.filter((l) => l.text.includes("settlement"))).toHaveLength(1);
  });
});

describe("pactBoostLines", () => {
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {}, adjacency: {},
    factionIds: ["alpha", "beta", "gamma", "delta"], alliances: {}, turn: 1,
    guards: {}, omens: {}, diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  it("marks a shared neighbour's temporary Might in amber, with its expiry", () => {
    const view = v({ alliances: { "alpha|beta": pact(6, ["gamma"]) } });
    expect(pactBoostLines(view, "alpha", "gamma")).toEqual([
      { text: "Your alliance adds +1 Might against them until turn 6",
        tone: "info" },
    ]);
    // The bonus is symmetric, so the ally's own hover carries the same line.
    expect(pactBoostLines(view, "beta", "gamma")).toHaveLength(1);
  });

  it("gives each live pact its own line and expiry", () => {
    const view = v({
      alliances: {
        "alpha|beta": pact(6, ["gamma"]),
        "alpha|delta": pact(9, ["gamma"]),
      },
    });
    expect(pactBoostLines(view, "alpha", "gamma").map((l) => l.text)).toEqual([
      "Your alliance adds +1 Might against them until turn 6",
      "Your alliance adds +1 Might against them until turn 9",
    ]);
  });

  it("says nothing once lapsed, off the frozen list, or about a pact of somebody else's", () => {
    const alliances = { "alpha|beta": pact(6, ["gamma"]) };
    expect(pactBoostLines(v({ alliances, turn: 6 }), "alpha", "gamma")).toEqual([]);
    expect(pactBoostLines(v({ alliances }), "alpha", "delta")).toEqual([]);
    expect(pactBoostLines(v({ alliances }), "delta", "gamma")).toEqual([]);
    // The ally is never on the frozen list, so their own hover keeps the green
    // pact line and never this one.
    expect(pactBoostLines(v({ alliances }), "alpha", "beta")).toEqual([]);
  });
});

describe("respiteLines", () => {
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {},
    adjacency: { alpha: ["beta"], beta: ["alpha"] },
    factionIds: ["alpha", "beta"], alliances: {}, turn: 1, guards: {},
    omens: {}, diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  it("amber note on a protected rival, green on the human's own land", () => {
    expect(respiteLines(v({ respites: { beta: 6 }, turn: 4 }), "alpha", "beta")).toEqual([
      { text: "Escaped vassalage recently: none may subjugate them until turn 6",
        tone: "info" },
    ]);
    expect(respiteLines(v({ respites: { alpha: 6 }, turn: 4 }), "alpha", "alpha")).toEqual([
      { text: "You escaped vassalage recently: none may subjugate you until turn 6",
        tone: "good" },
    ]);
  });

  it("says nothing once the clock has run out, or with no respite at all", () => {
    expect(respiteLines(v({ respites: { beta: 6 }, turn: 6 }), "alpha", "beta")).toEqual([]);
    expect(respiteLines(v(), "alpha", "beta")).toEqual([]);
  });

  it("is the single line an armed Subjugate shows at a protected target", () => {
    let relations: Relations = {};
    relations = bumpMight(bumpMight(relations, "alpha", "beta"), "alpha", "beta");
    const view = v({ relations, respites: { beta: 6 }, turn: 4 });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta", false)).toEqual([
      { text: "Escaped vassalage recently; cannot be subjugated until turn 6.",
        tone: "bad" },
    ]);
  });
});

describe("settlementBlock", () => {
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {}, adjacency: {},
    factionIds: ["alpha", "beta"], alliances: {}, turn: 1, guards: {},
    omens: {}, diplomacyBoost: [], loyalty: {}, liveRevolts: [], hostages: {},
    respites: {}, wealth: {}, siteCaps: {}, settlements: {}, booms: {},
    prowess: {},
    ...partial,
  });

  it("counts the settlement every land starts with, against its authored cap", () => {
    expect(settlementBlock(v({ siteCaps: { alpha: 6 } }), "alpha")).toEqual([
      { text: "Settlements", blockStart: true },
      { amount: "1/7", text: "on this land" },
    ]);
  });

  it("moves with each founding while the cap stays put", () => {
    const view = v({ siteCaps: { alpha: 6 }, settlements: { alpha: 2 } });
    expect(settlementBlock(view, "alpha")[1].amount).toBe("3/7");
  });

  it("reads 1/1 for a land the map authors no further site for", () => {
    expect(settlementBlock(v(), "alpha")[1].amount).toBe("1/1");
  });

  it("answers for the land asked about, not its neighbour", () => {
    const view = v({
      siteCaps: { alpha: 6, beta: 1 }, settlements: { alpha: 2 },
    });
    expect(settlementBlock(view, "beta")[1].amount).toBe("1/2");
  });

  it("ignores booms, which raise the allowance and not the land's capacity", () => {
    // The distinction the block's wording rests on: holding three booms lets
    // alpha's people support five settlements in a land, but this land is still
    // only authored for two. `sat-settlement` is where the allowance is said.
    const view = v({ siteCaps: { alpha: 1 }, booms: { alpha: 3 } });
    expect(settlementBlock(view, "alpha")[1].amount).toBe("1/2");
  });
});
