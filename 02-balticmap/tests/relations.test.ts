import { describe, it, expect } from "vitest";
import {
  getRel, bumpStatus, bumpMight, leadOf, computeOverlords, realmOf,
  validTargets, type Relations,
} from "../src/relations";

const ORDER = ["alpha", "beta", "gamma", "delta"];
const ALL_ADJ = Object.fromEntries(
  ORDER.map((id) => [id, ORDER.filter((o) => o !== id)]),
);

describe("relation storage", () => {
  it("defaults missing pairs to 0/0", () => {
    expect(getRel({}, "alpha", "beta")).toEqual({ status: 0, might: 0 });
  });

  it("bumps are directional and do not mutate the input", () => {
    const rel: Relations = {};
    const r1 = bumpMight(rel, "alpha", "beta");
    const r2 = bumpStatus(r1, "alpha", "beta");
    expect(rel).toEqual({});
    expect(getRel(r2, "alpha", "beta")).toEqual({ status: 1, might: 1 });
    expect(getRel(r2, "beta", "alpha")).toEqual({ status: 0, might: 0 });
  });
});

describe("leadOf", () => {
  it("is the best margin across the two tracks", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta"); // alpha might 1
    rel = bumpStatus(rel, "beta", "alpha"); // beta status 1
    rel = bumpStatus(rel, "beta", "alpha"); // beta status 2
    expect(leadOf(rel, "alpha", "beta")).toBe(1); // might 1-0
    expect(leadOf(rel, "beta", "alpha")).toBe(2); // status 2-0
  });

  it("is <= 0 when nothing distinguishes the pair", () => {
    expect(leadOf({}, "alpha", "beta")).toBe(0);
  });
});

describe("computeOverlords", () => {
  it("a positive lead on either track subjugates", () => {
    const rel = bumpMight({}, "alpha", "beta");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.has("alpha")).toBe(false);
  });

  it("the biggest lead wins a contested target", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "gamma", "beta");
    rel = bumpMight(rel, "gamma", "beta"); // gamma lead 2 > alpha lead 1
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("gamma");
  });

  it("equal leads fall back to faction order", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "gamma", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
  });

  it("a subjugated faction holds no vassals: its vassals are released", () => {
    let rel: Relations = {};
    // alpha leads beta by 2 (processed first), gamma leads alpha by 1
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "gamma", "alpha");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.get("alpha")).toBe("gamma");
    // alpha kept beta because gamma's smaller lead was processed after -
    // now flip the magnitudes so the release path runs:
    let rel2: Relations = {};
    rel2 = bumpMight(rel2, "alpha", "beta"); // alpha -> beta lead 1
    rel2 = bumpMight(rel2, "gamma", "alpha");
    rel2 = bumpMight(rel2, "gamma", "alpha"); // gamma -> alpha lead 2, first
    const o2 = computeOverlords(rel2, {}, ORDER);
    expect(o2.get("alpha")).toBe("gamma");
    expect(o2.has("beta")).toBe(false); // alpha is subjugated, cannot keep beta
  });

  it("mutual leads: the larger lead wins, the loser gets nothing", () => {
    let rel: Relations = {};
    rel = bumpStatus(rel, "alpha", "beta");
    rel = bumpStatus(rel, "alpha", "beta"); // alpha status lead 2
    rel = bumpMight(rel, "beta", "alpha"); // beta might lead 1
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.has("alpha")).toBe(false);
  });

  it("incorporated factions are outside the computation entirely", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "beta", "gamma");
    const o = computeOverlords(rel, { beta: "alpha" }, ORDER);
    expect(o.has("beta")).toBe(false);
    expect(o.has("gamma")).toBe(false); // beta's lead does not count either
  });
});

describe("realmOf", () => {
  it("is self + vassals + incorporated lands", () => {
    const rel = bumpMight({}, "alpha", "beta");
    const o = computeOverlords(rel, { gamma: "alpha" }, ORDER);
    expect(realmOf("alpha", o, { gamma: "alpha" }).sort()).toEqual(
      ["alpha", "beta", "gamma"],
    );
    expect(realmOf("delta", o, { gamma: "alpha" })).toEqual(["delta"]);
  });
});

describe("validTargets", () => {
  const LINE_ADJ = {
    alpha: ["beta"],
    beta: ["alpha", "gamma"],
    gamma: ["beta", "delta"],
    delta: ["gamma"],
  };

  it("raid/shrewd-marriage reach only factions adjacent to the realm", () => {
    const o = computeOverlords({}, {}, ORDER);
    expect(validTargets("beta", "raid", o, {}, LINE_ADJ, ORDER)).toEqual(
      ["alpha", "gamma"],
    );
    expect(
      validTargets("beta", "shrewd-marriage", o, {}, LINE_ADJ, ORDER),
    ).toEqual(["alpha", "gamma"]);
  });

  it("a vassal's neighbors extend the realm's reach", () => {
    const rel = bumpMight({}, "beta", "gamma"); // gamma is beta's vassal
    const o = computeOverlords(rel, {}, ORDER);
    expect(validTargets("beta", "raid", o, {}, LINE_ADJ, ORDER)).toEqual(
      ["alpha", "gamma", "delta"], // own vassal gamma stays targetable
    );
  });

  it("incorporated factions are never targets but extend reach", () => {
    const o = computeOverlords({}, { gamma: "beta" }, ORDER);
    expect(validTargets("beta", "raid", o, { gamma: "beta" }, LINE_ADJ, ORDER))
      .toEqual(["alpha", "delta"]);
  });

  it("incorporate targets exactly the player's current vassals", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "beta", "gamma");
    rel = bumpMight(rel, "alpha", "delta"); // some other overlord's vassal
    const o = computeOverlords(rel, {}, ORDER);
    expect(validTargets("beta", "incorporate", o, {}, LINE_ADJ, ORDER))
      .toEqual(["gamma"]);
    expect(validTargets("gamma", "incorporate", o, {}, LINE_ADJ, ORDER))
      .toEqual([]);
  });

  it("untargeted cards have no targets", () => {
    const o = computeOverlords({}, {}, ORDER);
    expect(validTargets("beta", "grow-crops", o, {}, ALL_ADJ, ORDER)).toEqual([]);
  });
});
