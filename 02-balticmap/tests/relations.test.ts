import { describe, it, expect } from "vitest";
import {
  getRel, bumpStatus, bumpMight, leadsOf, bumpMightAll, realmOf,
  levelStatus, allianceKey, allianceActive,
  type Relations,
} from "../src/relations";

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

describe("realmOf", () => {
  it("is self + vassals + incorporated lands", () => {
    const o = new Map([["beta", "alpha"]]);
    expect(realmOf("alpha", o, { gamma: "alpha" }).sort()).toEqual(
      ["alpha", "beta", "gamma"],
    );
    expect(realmOf("delta", o, { gamma: "alpha" })).toEqual(["delta"]);
  });
});

describe("leadsOf", () => {
  it("returns per-track margins, negative when behind", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpStatus(rel, "beta", "alpha");
    expect(leadsOf(rel, "alpha", "beta")).toEqual({ status: -1, might: 2 });
    expect(leadsOf(rel, "beta", "alpha")).toEqual({ status: 1, might: -2 });
    expect(leadsOf({}, "alpha", "beta")).toEqual({ status: 0, might: 0 });
  });
});

describe("bumpMightAll", () => {
  it("bumps might toward every listed faction, immutably", () => {
    const rel: Relations = {};
    const out = bumpMightAll(rel, "alpha", ["beta", "gamma"]);
    expect(rel).toEqual({});
    expect(getRel(out, "alpha", "beta").might).toBe(1);
    expect(getRel(out, "alpha", "gamma").might).toBe(1);
    expect(getRel(out, "alpha", "delta").might).toBe(0);
    expect(getRel(out, "beta", "alpha").might).toBe(0);
  });

  it("with an empty list returns the same reference", () => {
    const rel: Relations = {};
    expect(bumpMightAll(rel, "alpha", [])).toBe(rel);
  });
});

describe("levelStatus", () => {
  it("raises both directions' status to the max of the two; might untouched", () => {
    let rel: Relations = {};
    rel = bumpStatus(rel, "alpha", "beta");
    rel = bumpStatus(rel, "alpha", "beta");
    rel = bumpStatus(rel, "alpha", "beta"); // alpha leads beta by 3 status
    rel = bumpMight(rel, "beta", "alpha");
    const out = levelStatus(rel, "alpha", "beta");
    expect(getRel(out, "alpha", "beta").status).toBe(3);
    expect(getRel(out, "beta", "alpha").status).toBe(3);
    expect(leadsOf(out, "alpha", "beta").status).toBe(0);
    expect(getRel(out, "beta", "alpha").might).toBe(1); // untouched
    expect(rel).not.toBe(out); // immutable
  });

  it("is a no-op (same reference) when already even", () => {
    const rel: Relations = {};
    expect(levelStatus(rel, "alpha", "beta")).toBe(rel);
  });
});

describe("alliance helpers", () => {
  it("allianceKey sorts the pair so order does not matter", () => {
    expect(allianceKey("beta", "alpha")).toBe(allianceKey("alpha", "beta"));
    expect(allianceKey("alpha", "beta")).toBe("alpha|beta");
  });

  it("allianceActive is true only before the recorded expiry turn", () => {
    const alliances = { [allianceKey("alpha", "beta")]: 5 };
    expect(allianceActive({ alliances, turn: 4 }, "alpha", "beta")).toBe(true);
    expect(allianceActive({ alliances, turn: 4 }, "beta", "alpha")).toBe(true); // symmetric
    expect(allianceActive({ alliances, turn: 5 }, "alpha", "beta")).toBe(false);
    expect(allianceActive({ alliances: {}, turn: 1 }, "alpha", "beta")).toBe(false);
  });
});
