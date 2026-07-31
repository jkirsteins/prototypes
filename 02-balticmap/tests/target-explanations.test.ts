import { describe, expect, it } from "vitest";
import {
  cardModifierLines,
  explainTargetEligibility, subjugationBreakdown, targetImpactLines,
  targetOddsLines,
} from "../src/target-explanations";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";
import { standingChangeText } from "../src/view";
import type { TooltipLine } from "../src/panel";
import {
  INCORPORATE_RAMP, loyaltyKey,
  type RulesView, type TargetEligibility,
} from "../src/playability";

const nameOf = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1);

describe("explainTargetEligibility", () => {
  it("labels an available candidate", () => {
    expect(explainTargetEligibility([
      { state: "available", factionId: "beta" },
    ], nameOf)).toEqual([{
      factionId: "beta",
      available: true,
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
          required: { might: 4, status: 4 },
          mightLead: 1,
          statusLead: 0,
          realmSize: 2,
          settlements: 0,
          poachSurcharge: 0,
        },
      ],
    }], nameOf)).toEqual([{
      factionId: "gamma",
      available: false,
      lines: [
        "Gamma",
        "Blocked by Alliance until turn 12.",
        "Need a Might or Status lead of 4 because their realm has 2 lands.",
        "Current leads: Might 1, Status 0.",
      ],
    }]);
  });

  it("uses singular copy for a one-land realm", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "alpha",
      reasons: [{
        code: "insufficient-lead",
        required: { might: 2, status: 2 },
        mightLead: 0,
        statusLead: 1,
        realmSize: 1,
        settlements: 0,
        poachSurcharge: 0,
      }],
    }], nameOf)[0]?.lines).toEqual([
      "Alpha",
      "Need a Might or Status lead of 2 because their realm has 1 land.",
      "Current leads: Might 0, Status 1.",
    ]);
  });

  it("omits irrelevant candidates", () => {
    expect(explainTargetEligibility([
      { state: "irrelevant", factionId: "delta" },
    ], nameOf)).toEqual([]);
  });

  it("formats each relationship and identity blocker", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [
        { code: "already-vassal" },
        { code: "actor-subjugated" },
        { code: "overlord-prohibited" },
        { code: "incorporated" },
        { code: "self" },
        { code: "not-your-vassal" },
      ],
    }], nameOf)[0]?.lines).toEqual([
      "Beta",
      "Already your vassal.",
      "Unavailable while you are subjugated.",
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
    const out = explainTargetEligibility(entries, (id) => id, () => ["+3 Might"]);
    expect(out[0].lines).toEqual(["alpha", "Available.", "+3 Might"]);
    expect(out[1].lines).not.toContain("+3 Might");
  });

  it("annotates nothing when no annotator is given", () => {
    const entries: TargetEligibility[] = [{ state: "available", factionId: "alpha" }];
    expect(explainTargetEligibility(entries, (id) => id)[0].lines)
      .toEqual(["alpha", "Available."]);
  });
});

describe("cardModifierLines", () => {
  const none = { omens: [], diplomacyBoost: [], bodyguards: [] };

  it("says nothing when no modifier is active", () => {
    expect(cardModifierLines(none, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "bodyguard")).toEqual([]);
  });

  it("marks a doublable card while a reading is held", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts double."]);
    expect(cardModifierLines(v, "alpha", "pay-military-tribute"))
      .toEqual(["Favourable omens: this card counts double."]);
  });

  it("leaves a card with nothing to double unmarked", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "subjugate")).toEqual([]);
  });

  it("says a reading is already in hand", () => {
    expect(cardModifierLines({ ...none, omens: ["alpha"] }, "alpha", "favourable-omens"))
      .toEqual(["A reading is already in hand."]);
  });

  it("says an Alliance will run long", () => {
    expect(
      cardModifierLines({ ...none, diplomacyBoost: ["alpha"] }, "alpha", "alliance"),
    ).toEqual(["Extended diplomacy: this Alliance lasts 10 turns."]);
  });

  it("says a bodyguard is already posted", () => {
    expect(cardModifierLines({ ...none, bodyguards: ["alpha"] }, "alpha", "bodyguard"))
      .toEqual(["A bodyguard is already posted."]);
  });

  it("ignores another faction's modifiers", () => {
    const v = { omens: ["beta"], diplomacyBoost: ["beta"], bodyguards: ["beta"] };
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
    factionIds: ORDER, alliances: {}, turn: 1, bodyguards: [], omens: [],
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], sites: [], settled: [],
    ...partial,
  });

  it("says nothing for a card that cannot fail", () => {
    expect(targetOddsLines(v(), "alpha", "raid", "beta")).toEqual([]);
    // a free faction is a certain take, so Subjugate stays silent too
    expect(targetOddsLines(v(), "alpha", "subjugate", "beta")).toEqual([]);
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
});

describe("targetImpactLines", () => {
  const ORDER = ["alpha", "beta", "gamma", "delta"];
  const v = (partial: Partial<RulesView> = {}): RulesView => ({
    relations: {}, overlords: new Map(), incorporated: {},
    adjacency: {
      alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta"], delta: [],
    },
    factionIds: ORDER, alliances: {}, turn: 1, bodyguards: [], omens: [],
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], sites: [], settled: [],
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
    const shared = standingChangeText({ track: "might", before: -2, after: -1 });
    expect(shared).toBe("Might -2 -> -1");
    expect(row.text).toBe(`Might (${shared.slice("Might ".length)})`);
  });

  it("doubles a held reading, and says which number is the reading's", () => {
    const view = v({ omens: ["alpha"] });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("+2 Might (0 -> +2, doubled)");
    expect(shown(targetImpactLines(view, "alpha", "shrewd-marriage", "beta"))[1])
      .toBe("+2 Status (0 -> +2, doubled)");
  });

  it("shows an Assassinate as the levelling it is, never as a gain", () => {
    const view = v({
      relations: bumpStatus(bumpStatus({}, "alpha", "beta"), "alpha", "beta"),
    });
    expect(shown(targetImpactLines(view, "alpha", "assassinate-ruler", "beta"))[1])
      .toBe("-2 Status (+2 -> 0)");
  });

  it("does not leak that the target has a bodyguard posted", () => {
    const view = v({ bodyguards: ["beta"] });
    expect(shown(targetImpactLines(view, "alpha", "assassinate-ruler", "beta"))[1])
      .toBe("0 Status (0 -> 0)");
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
    const view = v({ sites: ["alpha"] });
    expect(shown(targetImpactLines(view, "alpha", "found-settlement", "alpha")))
      .toEqual([
        "If Found a settlement played here:",
        "-- +1 to the lead others need to subjugate you.",
      ]);
  });

  it("keeps a refusal one red line, with no block heading over it", () => {
    const view = v({ alliances: { "alpha|beta": 12 } });
    expect(targetImpactLines(view, "alpha", "raid", "beta")).toEqual([
      { text: "Blocked by Alliance until turn 12.", tone: "bad" },
    ]);
  });

  it("names the shortfall when the lead is the only thing missing", () => {
    const view = v({ incorporated: { gamma: "beta" } });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta")[0].text).toBe(
      "Need a Might or Status lead of 4 because their realm has 2 lands.",
    );
  });

  it("drops the shortfall line when the breakdown below already itemises it", () => {
    const view = v({ incorporated: { gamma: "beta" } });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta", true)).toEqual([]);
    // Only that one reason is dropped: an Alliance still has to be said.
    const allied = v({ alliances: { "alpha|beta": 12 } });
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
    factionIds: ORDER, alliances: {}, turn: 1, bodyguards: [], omens: [],
    diplomacyBoost: [], loyalty: {}, liveRevolts: [], sites: [], settled: [],
    ...partial,
  });

  /** relations where actor leads target by n on a track */
  const lead = (
    track: "might" | "status", actor: string, target: string, n: number,
  ): Relations => {
    let rel: Relations = {};
    const bump = track === "might" ? bumpMight : bumpStatus;
    for (let i = 0; i < n; i++) rel = bump(rel, actor, target);
    return rel;
  };

  it("gives each track its own block, headed with the badge's own figure", () => {
    const view = v({ relations: lead("might", "alpha", "beta", 1) });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +1/2. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "2", text: "from realm size (1 land)" },
      { text: "Status 0/2. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "2", text: "from realm size (1 land)" },
    ]);
  });

  it("itemises realm size, settlements and overlord support", () => {
    // beta holds gamma (2 lands), gamma is settled, and beta is delta's vassal
    // with a hold of 2, so the surcharge is ceil(2/2) = 1.
    let relations = lead("might", "alpha", "beta", 2);
    relations = bumpMight(relations, "delta", "beta");
    relations = bumpMight(relations, "delta", "beta");
    const view = v({
      overlords: new Map([["gamma", "beta"], ["beta", "delta"]]),
      settled: ["gamma"],
      relations,
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +2/6. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
      { amount: "+1", text: "from 1 settlement" },
      { amount: "+1", text: "from their overlord's support" },
      { text: "Status 0/5. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
      { amount: "+1", text: "from their overlord's support" },
    ]);
  });

  it("makes each column add up to the heading above it", () => {
    // The reason every track gets its own block: one shared column summed to
    // neither bar, and a "(Might only)" note was all that carried the split.
    const view = v({
      overlords: new Map([["gamma", "beta"]]),
      settled: ["gamma"],
      relations: lead("might", "alpha", "beta", 1),
    });
    const lines = subjugationBreakdown(view, "alpha", "beta");
    const sum = (from: number, to: number): number =>
      lines.slice(from, to).reduce((n, l) => n + Number(l.amount), 0);
    expect(lines[0].text).toBe("Might +1/5. Opponent's thresholds:");
    expect(sum(1, 3)).toBe(5);
    expect(lines[3].text).toBe("Status 0/4. Opponent's thresholds:");
    expect(sum(4, 5)).toBe(4);
  });

  it("itemises your own realm, and warns, on a track they are the ones racing", () => {
    // alpha leads Might over beta; beta leads Status over alpha. Each block
    // counts the realm of whoever would be taken on that track.
    let relations = lead("might", "alpha", "beta", 2);
    relations = bumpStatus(relations, "beta", "alpha");
    const view = v({
      overlords: new Map([["gamma", "beta"], ["delta", "alpha"]]),
      relations,
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([
      { text: "Might +2/4. Opponent's thresholds:", tone: "good", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
      { text: "Status -1/4. Your thresholds:", tone: "bad", blockStart: true },
      { amount: "4", text: "from realm size (2 lands)" },
    ]);
  });

  // The possessive is the whole point of this case: the surcharge belongs to
  // the human's own overlord, on a tooltip titled with a rival's name.
  it("prices your own overlord's hold into the threshold they race", () => {
    let relations = lead("might", "beta", "alpha", 2);
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

  it("drops a track whose leading side could never subjugate the other", () => {
    // alpha is gamma's vassal, so alpha's own bar is null. Status sits at a
    // dead-even 0, which ties to alpha's (null) bar - no denominator on the
    // badge, so no block here either.
    const view = v({
      overlords: new Map([["alpha", "gamma"]]),
      relations: lead("might", "beta", "alpha", 1),
    });
    expect(subjugationBreakdown(view, "alpha", "beta").map((l) => l.text))
      .toEqual(["Might -1/2. Your thresholds:", "from realm size (1 land)"]);
  });

  it("says nothing about a faction inside your own realm", () => {
    const view = v({
      overlords: new Map([["beta", "alpha"]]),
      relations: lead("might", "alpha", "beta", 2),
    });
    expect(subjugationBreakdown(view, "alpha", "beta")).toEqual([]);
  });

  it("says nothing when nothing stands between you, which is the badge's gate", () => {
    expect(subjugationBreakdown(v(), "alpha", "beta")).toEqual([]);
  });

  it("still explains the thresholds under a pact, which only suspends them", () => {
    const view = v({ alliances: { "alpha|beta": 6 } });
    expect(subjugationBreakdown(view, "alpha", "beta").map((l) => l.text)).toEqual([
      "Might 0/2. Opponent's thresholds:",
      "from realm size (1 land)",
      "Status 0/2. Opponent's thresholds:",
      "from realm size (1 land)",
    ]);
  });

  it("counts settlements in the plural, and never on the Status track", () => {
    const view = v({
      overlords: new Map([["gamma", "beta"]]),
      settled: ["beta", "gamma"],
      relations: lead("might", "alpha", "beta", 1),
    });
    const lines = subjugationBreakdown(view, "alpha", "beta");
    expect(lines).toContainEqual({ amount: "+2", text: "from 2 settlements" });
    // Exactly one settlement row across both blocks: Status gets none.
    expect(lines.filter((l) => l.text.includes("settlement"))).toHaveLength(1);
  });
});
