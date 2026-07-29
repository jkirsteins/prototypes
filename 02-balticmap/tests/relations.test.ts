import { describe, it, expect } from "vitest";
import {
  getRel, bumpStatus, bumpMight, leadsOf, bumpMightAll, realmOf,
  levelStatus, allianceKey, allianceActive, bumpMightBy, bumpStatusBy, bumpMightAllBy,
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

describe("amount-taking bumps", () => {
  it("adds the given amount in one step", () => {
    const rel = bumpMightBy({}, "alpha", "beta", 3);
    expect(getRel(rel, "alpha", "beta").might).toBe(3);
    expect(getRel(rel, "alpha", "beta").status).toBe(0);
  });

  it("accumulates onto an existing counter", () => {
    const rel = bumpMightBy(bumpMight({}, "alpha", "beta"), "alpha", "beta", 2);
    expect(getRel(rel, "alpha", "beta").might).toBe(3);
  });

  it("bumps status the same way, leaving might alone", () => {
    const rel = bumpStatusBy({}, "alpha", "beta", 4);
    expect(getRel(rel, "alpha", "beta")).toEqual({ status: 4, might: 0 });
  });

  it("is a no-op for zero, rather than writing an empty entry", () => {
    // A zero amount must not materialise a key: `getRel` treats a missing key
    // as 0/0, and a spurious entry would make two equal boards compare unequal
    // in the simulation's reproducibility check.
    expect(bumpMightBy({}, "alpha", "beta", 0)).toEqual({});
  });

  it("bumps every other faction by the amount", () => {
    const rel = bumpMightAllBy({}, "alpha", ["beta", "gamma"], 2);
    expect(getRel(rel, "alpha", "beta").might).toBe(2);
    expect(getRel(rel, "alpha", "gamma").might).toBe(2);
  });

  it("keeps the +1 helpers behaving exactly as before", () => {
    expect(bumpMight({}, "alpha", "beta")).toEqual(bumpMightBy({}, "alpha", "beta", 1));
    expect(bumpStatus({}, "alpha", "beta")).toEqual(bumpStatusBy({}, "alpha", "beta", 1));
    expect(bumpMightAll({}, "alpha", ["beta"])).toEqual(
      bumpMightAllBy({}, "alpha", ["beta"], 1),
    );
  });
});
