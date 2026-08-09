import { describe, expect, it } from "vitest";
import {
  GUARD_POSTED, GUARD_RISK, cardBlockLine, cardModifierLines, cardRiskLine,
  defenseBreakdown, diseaseBreakdown, explainTargetEligibility,
  plaguePreviewLines, respiteLines, riskLines, settlementBlock,
  targetImpactLines, targetOddsLines,
} from "../src/target-explanations";
import { CARDS, GUARDS } from "../src/cards";
import type { TooltipLine } from "../src/panel";
import {
  failureRiskOf,
  type RulesView, type TargetEligibility,
} from "../src/playability";

const nameOf = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1);

/** These cases are about eligibility wording, not about odds. The risk band has
 *  its own describe below, driven through `targetOddsLines` with a real view. */
const noRisk = (): string[] => [];

const ORDER = ["alpha", "beta", "gamma", "delta"];

/** A four-polygon line: alpha - beta - gamma - delta. Every polygon defaults
 *  to a pristine 60 defense (absent key = at max, the src/defense.ts
 *  convention) - roomy on purpose, well above the shipped map's 2..18, so a
 *  heal and a raid both quote a number the cap has not already swallowed. */
const v = (partial: Partial<RulesView> = {}): RulesView => ({
  overlords: new Map(), incorporated: {},
  adjacency: {
    alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
    delta: ["gamma"],
  },
  factionIds: ORDER, passives: {}, turn: 1, guards: {}, omens: {},
  siteCaps: {}, settlements: {}, wealth: {}, respites: {}, leadership: {},
  defense: {},
  defenseMax: Object.fromEntries(ORDER.map((id) => [id, 60])),
  disease: {}, miasma: {}, turnips: {},
  marches: {}, armies: {},
  ...partial,
});

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

  it("omits irrelevant candidates", () => {
    expect(explainTargetEligibility([
      { state: "irrelevant", factionId: "delta" },
    ], nameOf, noRisk)).toEqual([]);
  });

  it("quotes both gate numbers - together they are the decision", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "gamma",
      reasons: [{ code: "gate-closed", defense: 480, required: 150 }],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Gamma",
      "Their home defenses stand at 480; subjugation opens at 150 or less.",
    ]);
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
        { code: "at-full-defense" },
        { code: "already-vassal" },
        { code: "liege" },
        { code: "incorporated" },
        { code: "self" },
        { code: "not-your-vassal" },
      ],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Beta",
      "Defenses already stand at full strength.",
      "Already your vassal.",
      "You owe them fealty, directly or through your lords.",
      "Already incorporated.",
      "You cannot target yourself.",
      "Not your vassal.",
    ]);
  });

  it("formats the settlement blockers, allowance and dots alike", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [
        { code: "needs-population", have: 2, allowance: 2 },
        { code: "no-free-site" },
      ],
    }], nameOf, noRisk)[0]?.lines).toEqual([
      "Beta",
      "2 settlements here already, and your people support 2.",
      "No room for another settlement.",
    ]);
  });

  it("appends annotation lines to available targets only", () => {
    const entries: TargetEligibility[] = [
      { state: "available", factionId: "alpha" },
      { state: "blocked", factionId: "beta", reasons: [{ code: "self" }] },
    ];
    const out = explainTargetEligibility(entries, (id) => id, noRisk, () => ["-150 Defense"]);
    expect(out[0].lines).toEqual(["alpha", "Available.", "-150 Defense"]);
    expect(out[1].lines).not.toContain("-150 Defense");
  });

  it("annotates nothing when no annotator is given", () => {
    const entries: TargetEligibility[] = [{ state: "available", factionId: "alpha" }];
    expect(explainTargetEligibility(entries, (id) => id, noRisk)[0].lines)
      .toEqual(["alpha", "Available."]);
  });
});

describe("cardBlockLine", () => {
  it("has one line for every block reason the rules can raise", () => {
    expect(cardBlockLine({ code: "forced-first" }))
      .toBe("A forced card must be played first.");
    expect(cardBlockLine({ code: "needs-overlord" }))
      .toBe("Only while you are somebody's vassal.");
    expect(cardBlockLine({ code: "already-held" }))
      .toBe("You are already holding an unspent one.");
    expect(cardBlockLine({ code: "no-disease" }))
      .toBe("No disease stacks stand anywhere for this to work on.");
    expect(cardBlockLine({ code: "at-full-defense" }))
      .toBe("Every land of your realm already stands at full defense.");
    expect(cardBlockLine({ code: "no-target" }))
      .toBe("Nothing in reach is a legal target.");
    expect(cardBlockLine({ code: "unavailable" }))
      .toBe("Not playable now.");
  });

  it("quotes both numbers of the affordability block - income arrives every turn", () => {
    expect(cardBlockLine({ code: "cannot-afford", cost: 2, held: 1 }))
      .toBe("Needs 2 wealth; you hold 1.");
  });

  it("quotes both numbers of the realm gate, singular and plural", () => {
    expect(cardBlockLine({ code: "realm-too-small", required: 4, held: 2 }))
      .toBe("Your realm holds 2 of the 4 lands needed.");
    expect(cardBlockLine({ code: "realm-too-small", required: 1, held: 0 }))
      .toBe("Your realm holds 0 of the 1 land needed.");
  });
});

describe("guard prose", () => {
  it("has prose for every guard, in both places a player meets one", () => {
    // Two tables, one per surface. A second guard that reached the rules and
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

  it("renders a FailureRisk as the warning plus the spend line", () => {
    expect(riskLines({ kind: "hidden", because: "bodyguard" })).toEqual([
      "A posted bodyguard would turn this aside, and you cannot tell in advance.",
      "A failed attempt still spends the card.",
    ]);
  });
});

describe("targetOddsLines", () => {
  it("says nothing for a card that cannot fail", () => {
    expect(targetOddsLines(v(), "alpha", "raid", "beta")).toEqual([]);
    // Subjugate and Incorporate never roll: their gates grey the card out in
    // advance, so a play that starts cannot come back with nothing.
    const vassal = v({ overlords: new Map([["gamma", "alpha"]]) });
    expect(targetOddsLines(vassal, "alpha", "subjugate", "gamma")).toEqual([]);
    expect(targetOddsLines(vassal, "alpha", "incorporate", "gamma")).toEqual([]);
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
    // Identically whether or not the guard is actually posted: reading
    // `view.guards` here would turn the warning into a detector.
    expect(targetOddsLines(v({ guards: { bodyguard: ["beta"] } }), "alpha", "assassinate-ruler", "beta"))
      .toEqual(warning);
  });
});

describe("cardRiskLine", () => {
  it("names the failure mode of the one card that has one", () => {
    expect(cardRiskLine("assassinate-ruler")).toContain("bodyguard");
    expect(cardRiskLine("assassinate-ruler")).toContain("Can fail");
  });

  it("stays silent for a card the rules can never refuse", () => {
    for (const id of [
      "raid", "great-raid", "grow-crops", "hillfort", "harvest-feast",
      "subjugate", "incorporate", "plague", "foul-winds", "bodyguard",
    ]) {
      expect(cardRiskLine(id), id).toBeNull();
    }
  });

  /** The band and the rules must agree on WHICH cards can fail, or the tip
   *  either warns about a certainty or stays quiet about a gamble. Driven off
   *  CARDS so a twentieth card is covered the day it is added. */
  it("covers exactly the cards failureRiskOf answers for", () => {
    const view = v({ overlords: new Map([["gamma", "beta"]]) });
    const fallible = Object.keys(CARDS).filter((id) =>
      ORDER.some((target) => failureRiskOf(view, "alpha", id, target) !== null),
    );
    expect(fallible.filter((id) => cardRiskLine(id) === null)).toEqual([]);
    expect(Object.keys(CARDS).filter((id) => cardRiskLine(id) !== null).sort())
      .toEqual(fallible.sort());
  });
});

describe("cardModifierLines", () => {
  const none = { omens: {}, miasma: {}, guards: {} };

  it("says nothing when no modifier is active", () => {
    expect(cardModifierLines(none, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "plague")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "bodyguard")).toEqual([]);
  });

  it("marks an attack card while a reading is held, at its real multiple", () => {
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "raid"))
      .toEqual(["Favourable omens: this attack counts double."]);
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "great-raid"))
      .toEqual(["Favourable omens: this attack counts double."]);
    expect(cardModifierLines({ ...none, omens: { alpha: 2 } }, "alpha", "raid"))
      .toEqual(["Favourable omens: this attack counts quadruple."]);
    expect(cardModifierLines({ ...none, omens: { alpha: 3 } }, "alpha", "raid"))
      .toEqual(["Favourable omens: this attack counts x8."]);
  });

  it("leaves a card omens cannot double unmarked", () => {
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "subjugate"))
      .toEqual([]);
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "plague"))
      .toEqual([]);
  });

  it("tells a held reading what a second one would be worth", () => {
    // The only route by which a player discovers readings stack at all: the
    // card text describes one, and a second is legal so there is no block line.
    expect(cardModifierLines({ ...none, omens: { alpha: 1 } }, "alpha", "favourable-omens"))
      .toEqual([
        "1 reading already in hand: another makes the next attack count quadruple.",
      ]);
    expect(cardModifierLines({ ...none, omens: { alpha: 2 } }, "alpha", "favourable-omens"))
      .toEqual([
        "2 readings already in hand: another makes the next attack count x8.",
      ]);
  });

  it("marks a Plague while miasma is gathered, and prices a second Miasma", () => {
    expect(cardModifierLines({ ...none, miasma: { alpha: 1 } }, "alpha", "plague"))
      .toEqual(["Miasma: each of your stacks counts double."]);
    expect(cardModifierLines({ ...none, miasma: { alpha: 2 } }, "alpha", "plague"))
      .toEqual(["Miasma: each of your stacks counts quadruple."]);
    expect(cardModifierLines({ ...none, miasma: { alpha: 1 } }, "alpha", "miasma"))
      .toEqual([
        "1 reading already gathered: another makes the next plague count quadruple.",
      ]);
  });

  it("shows a held guard in the hand, from GUARD_POSTED", () => {
    for (const guardId of Object.keys(GUARDS)) {
      expect(cardModifierLines({ ...none, guards: { [guardId]: ["alpha"] } }, "alpha", guardId))
        .toEqual([GUARD_POSTED[guardId]]);
      // and not for somebody else's
      expect(cardModifierLines({ ...none, guards: { [guardId]: ["beta"] } }, "alpha", guardId))
        .toEqual([]);
    }
  });

  it("ignores another faction's modifiers", () => {
    const rivals = { omens: { beta: 1 }, miasma: { beta: 2 }, guards: { bodyguard: ["beta"] } };
    expect(cardModifierLines(rivals, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(rivals, "alpha", "plague")).toEqual([]);
    expect(cardModifierLines(rivals, "alpha", "bodyguard")).toEqual([]);
  });
});

describe("targetImpactLines", () => {
  /** The block as a reader sees it: the heading, then "amount text" per row. */
  const shown = (lines: TooltipLine[]): string[] =>
    lines.map((l) => (l.amount === undefined ? l.text : `${l.amount} ${l.text}`));

  it("says nothing for a card that takes no target", () => {
    expect(targetImpactLines(v(), "alpha", "great-raid", "beta")).toEqual([]);
    expect(targetImpactLines(v(), "alpha", "plague", "beta")).toEqual([]);
  });

  it("heads the block with the card, then the defense move it would deal", () => {
    expect(shown(targetImpactLines(v(), "alpha", "raid", "beta")))
      .toEqual(["If Raid played here:", "-1 Defense (60 -> 59)"]);
    expect(targetImpactLines(v(), "alpha", "raid", "beta")[0].blockStart).toBe(true);
  });

  it("gives the whole block one colour, so it scans as the card's own", () => {
    for (const line of targetImpactLines(v(), "alpha", "raid", "beta")) {
      expect(line.tone).toBe("info");
    }
  });

  it("floors the landing point at zero, the same clamp the resolution applies", () => {
    const view = v({ defense: { beta: 0 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("-1 Defense (0 -> 0)");
  });

  it("adds the ruler's leadership into the quoted damage", () => {
    const view = v({ leadership: { alpha: 5 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("-6 Defense (60 -> 54)");
  });

  it("doubles a held reading, and says which word is the reading's", () => {
    const view = v({ omens: { alpha: 1 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("-2 Defense (60 -> 58, doubled)");
  });

  it("quotes a stack at its real multiple before it is aimed", () => {
    const view = v({ omens: { alpha: 2 } });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta"))[1])
      .toBe("-4 Defense (60 -> 56, quadrupled)");
  });

  it("previews a Hillfort as the heal it is, capped at what the land once held", () => {
    const view = v({ defense: { alpha: 40 } });
    expect(shown(targetImpactLines(view, "alpha", "hillfort", "alpha")))
      .toEqual(["If Hillfort played here:", "+15 Defense (40 -> 55)"]);
    const nearFull = v({ defense: { alpha: 50 } });
    expect(shown(targetImpactLines(nearFull, "alpha", "hillfort", "alpha"))[1])
      .toBe("+15 Defense (50 -> 60)");
  });

  it("previews a disease stack as your own count there, +1", () => {
    expect(shown(targetImpactLines(v(), "alpha", "spread-disease", "beta")))
      .toEqual(["If Spread disease played here:", "+1 Disease (0 -> 1)"]);
    const seeded = v({ disease: { beta: { alpha: 2 } } });
    expect(shown(targetImpactLines(seeded, "alpha", "spread-disease", "beta"))[1])
      .toBe("+1 Disease (2 -> 3)");
  });

  it("previews an outbreak by its splash count, realm lands excluded", () => {
    // beta's neighbours are alpha and gamma; alpha is the actor's own realm,
    // so the splash is gamma alone.
    expect(shown(targetImpactLines(v(), "alpha", "localized-outbreak", "beta"))[1])
      .toBe("-- +1 of your disease on each of its 1 neighbour.");
  });

  it("marks an effect that is not a number rather than leaving the column blank", () => {
    const open = v({ defense: { beta: 10 } });
    expect(shown(targetImpactLines(open, "alpha", "subjugate", "beta")))
      .toEqual(["If Subjugate played here:", "-- Becomes your vassal."]);
    const vassal = v({
      overlords: new Map([["beta", "alpha"], ["gamma", "alpha"], ["delta", "gamma"]]),
    });
    expect(shown(targetImpactLines(vassal, "alpha", "incorporate", "beta"))[1])
      .toBe("-- Absorbed into your realm.");
  });

  /** The block warns that a guard could turn the blade aside, so it says the
   *  word "bodyguard" on every target - which is exactly when it would become
   *  a detector if it ever said it on only the guarded ones. Compares the
   *  WHOLE block rather than one row: a leak would arrive as an extra line,
   *  and an assertion pinned to an index would step straight over it. */
  it("does not leak that the target has a bodyguard posted", () => {
    const guarded = shown(
      targetImpactLines(v({ guards: { bodyguard: ["beta"] } }), "alpha", "assassinate-ruler", "beta"),
    );
    const unguarded = shown(
      targetImpactLines(v(), "alpha", "assassinate-ruler", "beta"),
    );
    expect(guarded).toEqual(unguarded);
    expect(guarded[1]).toBe("-- Their ruler dies; the successor starts with no leadership.");
    expect(guarded).toContain(
      "-- A posted bodyguard would turn this aside, and you cannot tell in advance.",
    );
  });

  it("says what a settlement buys, on your own land", () => {
    const view = v({ siteCaps: { alpha: 1 }, wealth: { alpha: 1 } });
    expect(shown(targetImpactLines(view, "alpha", "found-settlement", "alpha")))
      .toEqual([
        "If Found a settlement played here:",
        "-- +1 wealth a turn to whoever holds this land's realm.",
      ]);
  });

  it("keeps a refusal one red line, with no block heading over it", () => {
    const view = v({ defense: { beta: 200 } });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta")).toEqual([
      { text: "Their home defenses stand at 60; subjugation opens at 15 or less.", tone: "bad" },
    ]);
  });

  it("quotes only the FIRST reason - the one to fix first", () => {
    // gamma escaped vassalage AND its gate is closed: the respite outranks the
    // gate, because nothing the actor plays can lift a time gate. beta is
    // alpha's vassal so gamma sits on the realm's border at all.
    const view = v({
      overlords: new Map([["beta", "alpha"]]),
      respites: { gamma: 7 }, turn: 5,
    });
    expect(targetImpactLines(view, "alpha", "subjugate", "gamma")).toEqual([
      { text: "Escaped vassalage recently; cannot be subjugated until turn 7.", tone: "bad" },
    ]);
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
  });

  it("says the inward card's own version of out of reach", () => {
    expect(targetImpactLines(v(), "alpha", "found-settlement", "beta")).toEqual([
      { text: "Not in your realm.", tone: "bad" },
    ]);
    expect(targetImpactLines(v(), "alpha", "hillfort", "beta")).toEqual([
      { text: "Not in your realm.", tone: "bad" },
    ]);
  });

  it("a lord may raid its own vassal - the aim previews rather than refusing", () => {
    const view = v({ overlords: new Map([["beta", "alpha"]]) });
    expect(shown(targetImpactLines(view, "alpha", "raid", "beta")))
      .toEqual(["If Raid played here:", "-1 Defense (60 -> 59)"]);
  });
});

describe("defenseBreakdown", () => {
  it("quotes the standing defense over its max and the gate line", () => {
    const view = v({ defense: { beta: 48 } });
    expect(defenseBreakdown(view, "beta", false)).toEqual([
      { text: "Defenses", blockStart: true },
      { amount: "48/60", text: "standing" },
      { amount: "15", text: "or less opens subjugation" },
    ]);
  });

  it("shouts when the gate stands open", () => {
    const view = v({ defense: { beta: 15 } });
    expect(defenseBreakdown(view, "beta", false)[1]).toEqual({
      amount: "15/60", text: "standing - the gate is OPEN", tone: "bad",
    });
  });

  it("adds the independence line only on a vassal's home", () => {
    const view = v({ defense: { beta: 300 } });
    const asVassal = defenseBreakdown(view, "beta", true);
    expect(asVassal[3]).toEqual({
      amount: "45", text: "or more regains independence at their turn",
    });
    expect(defenseBreakdown(view, "beta", false)).toHaveLength(3);
  });

  it("reads the polygon's own max, not the default", () => {
    const view = v({ defenseMax: { beta: 200 }, defense: { beta: 50 } });
    expect(defenseBreakdown(view, "beta", true)).toEqual([
      { text: "Defenses", blockStart: true },
      { amount: "50/200", text: "standing - the gate is OPEN", tone: "bad" },
      { amount: "50", text: "or less opens subjugation" },
      { amount: "150", text: "or more regains independence at their turn" },
    ]);
  });
});

describe("diseaseBreakdown", () => {
  it("lists one row per owner with stacks, in faction order", () => {
    const view = v({ disease: { beta: { gamma: 2, alpha: 1 } } });
    expect(diseaseBreakdown(view, "beta", nameOf)).toEqual([
      { text: "Disease", blockStart: true },
      { amount: "1", text: "disease held by Alpha" },
      { amount: "2", text: "disease held by Gamma" },
    ]);
  });

  it("says nothing for a clean polygon, or one whose counts are all zero", () => {
    expect(diseaseBreakdown(v(), "beta", nameOf)).toEqual([]);
    expect(diseaseBreakdown(v({ disease: { beta: { alpha: 0 } } }), "beta", nameOf))
      .toEqual([]);
  });
});

describe("plaguePreviewLines", () => {
  it("totals the damage across every land holding your stacks", () => {
    const view = v({ disease: { beta: { alpha: 2 }, gamma: { alpha: 1 } } });
    expect(plaguePreviewLines(view, "alpha")).toEqual([
      "Would deal 30 damage across 2 lands.",
    ]);
  });

  it("counts only what the defense can absorb, and only your own stacks", () => {
    // 3 stacks promise 300, but beta stands at 100 - the preview quotes the
    // real movement, the same clamp the resolution applies. gamma's stacks on
    // beta are somebody else's and feed nothing.
    const view = v({
      disease: { beta: { alpha: 3, gamma: 5 } },
      defense: { beta: 20 },
    });
    expect(plaguePreviewLines(view, "alpha")).toEqual([
      "Would deal 20 damage across 1 land.",
    ]);
  });

  it("multiplies by gathered miasma", () => {
    const view = v({ disease: { beta: { alpha: 2 } }, miasma: { alpha: 1 } });
    expect(plaguePreviewLines(view, "alpha")).toEqual([
      "Would deal 40 damage across 1 land.",
    ]);
  });

  it("says nothing while no land holds your stacks", () => {
    expect(plaguePreviewLines(v(), "alpha")).toEqual([]);
    expect(plaguePreviewLines(v({ disease: { beta: { gamma: 1 } } }), "alpha"))
      .toEqual([]);
  });
});

describe("respiteLines", () => {
  it("amber note on a protected rival, green on the human's own land", () => {
    expect(respiteLines({ respites: { beta: 6 }, turn: 4 }, "alpha", "beta")).toEqual([
      { text: "Escaped vassalage recently: none may subjugate them until turn 6",
        tone: "info" },
    ]);
    expect(respiteLines({ respites: { alpha: 6 }, turn: 4 }, "alpha", "alpha")).toEqual([
      { text: "You escaped vassalage recently: none may subjugate you until turn 6",
        tone: "good" },
    ]);
  });

  it("says nothing once the clock has run out, or with no respite at all", () => {
    expect(respiteLines({ respites: { beta: 6 }, turn: 6 }, "alpha", "beta")).toEqual([]);
    expect(respiteLines({ respites: {}, turn: 1 }, "alpha", "beta")).toEqual([]);
  });

  it("is the single line an armed Subjugate shows at a protected target", () => {
    // The gate is open - beta could be taken - but the respite outranks it.
    const view = v({ defense: { beta: 100 }, respites: { beta: 6 }, turn: 4 });
    expect(targetImpactLines(view, "alpha", "subjugate", "beta")).toEqual([
      { text: "Escaped vassalage recently; cannot be subjugated until turn 6.",
        tone: "bad" },
    ]);
  });
});

describe("settlementBlock", () => {
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
});
