import { describe, it, expect } from "vitest";
import { MODAL_ROLES, buildNotice } from "../src/notices";
import type { EventKind, GameEvent } from "../src/types";
import { snapshot } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

const ALL_KINDS: EventKind[] = [
  "scene", "turn", "lead", "answer", "decline", "effect", "coercion",
  "surrender", "recover", "haulUp", "pass", "discard", "draw",
  "reshuffle", "outcome",
];

function evt(kind: EventKind, over: Partial<GameEvent> = {}): GameEvent {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return {
    turn: 1,
    side: "convict",
    kind,
    text: "",
    deltas: [],
    vitals: snapshot(state),
    piles: { player: { deck: 0, discard: 0, hand: [] }, convict: { deck: 0, discard: 0, hand: 0 } },
    ...over,
  };
}

describe("MODAL_ROLES", () => {
  it("assigns a role to every event kind and nothing else", () => {
    expect(Object.keys(MODAL_ROLES).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("gives every silent kind a written reason", () => {
    for (const [kind, rule] of Object.entries(MODAL_ROLES)) {
      if (rule.role !== "silent") continue;
      expect(rule.reason.length, `${kind} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("keeps routine bookkeeping silent", () => {
    for (const kind of ["draw", "reshuffle", "discard", "pass", "turn", "scene", "outcome"] as const) {
      expect(MODAL_ROLES[kind].role).toBe("silent");
    }
  });

  it("headlines the two things that can open a box", () => {
    expect(MODAL_ROLES.lead.role).toBe("headline");
    expect(MODAL_ROLES.surrender.role).toBe("headline");
  });
});

describe("buildNotice", () => {
  it("returns null when the segment has no headline", () => {
    expect(buildNotice([evt("turn"), evt("draw"), evt("pass")], [])).toBeNull();
  });

  it("returns null for an empty segment", () => {
    expect(buildNotice([], [])).toBeNull();
  });

  it("titles the box with the headline card and names what he played", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "knifeToHerThroat" }),
      evt("decline", { side: "player", text: "You take it." }),
    ];
    const notice = buildNotice(segment, []);
    expect(notice?.title).toBe("Knife to Her Throat");
    expect(notice?.what).toContain("He plays");
    expect(notice?.what).toContain("You had no answer for it.");
  });

  it("names the card you answered with", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "knifeToHerThroat" }),
      evt("answer", { side: "player", cardId: "takeItForHer" }),
    ];
    expect(buildNotice(segment, [])?.what).toContain("Take It For Her");
  });

  it("carries the headline card's flavor line", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    expect(buildNotice(segment, [])?.flavor.length).toBeGreaterThan(0);
  });

  it("renders the vitals changes as rows", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    const notice = buildNotice(segment, [
      { field: "playerVigor", from: 6, to: 4 },
      { field: "range", from: "away", to: "near" },
    ]);
    expect(notice?.rows).toEqual(["Your vigor 6 -> 4", "He is close"]);
  });

  it("says so plainly when the exchange changed nothing", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    const notice = buildNotice(segment, []);
    expect(notice?.rows).toEqual([]);
    expect(notice?.what).toContain("Nothing came of it.");
  });

  it("folds coercion detail into the what line", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "whereIsIt" }),
      evt("coercion", { text: "He got what he wanted. He does not need to ask again." }),
    ];
    expect(buildNotice(segment, [])?.what).toContain("He got what he wanted.");
  });

  it("builds a surrender box headlined by the secret", () => {
    const segment = [evt("surrender", { side: "player", cardId: "secretSafe" })];
    const notice = buildNotice(segment, [{ field: "secretsLeft", from: 3, to: 2 }]);
    expect(notice?.title).toBe("You Give Him Something");
    expect(notice?.what).toContain("The safe is behind the headboard");
    expect(notice?.rows).toEqual(["Secrets left 3 -> 2"]);
  });

  it("uses the first headline when a segment somehow holds two", () => {
    const segment = [evt("lead", { cardId: "backhand" }), evt("lead", { cardId: "whereIsIt" })];
    expect(buildNotice(segment, [])?.title).toBe("Backhand");
  });

  it("produces copy free of em dashes and unicode arrows", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "knifeToHerThroat" })];
    const n = buildNotice(segment, [{ field: "wifeVigor", from: 4, to: 2 }]);
    const all = [n?.title, n?.what, n?.flavor, ...(n?.rows ?? [])].join(" ");
    expect(all).not.toMatch(/[—→←…•]/);
  });
});
