import { describe, it, expect } from "vitest";
import {
  getRel, bumpStatus, bumpMight, leadsOf, bumpMightAll, realmOf,
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
