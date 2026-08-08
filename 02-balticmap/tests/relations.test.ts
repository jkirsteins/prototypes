import { describe, it, expect } from "vitest";
import {
  realmOf, realmRootOf, fullRealmOf, overlordChainOf, incorporatedRealmOf,
} from "../src/relations";

describe("realmOf", () => {
  it("is self + vassals + incorporated lands", () => {
    const o = new Map([["beta", "alpha"]]);
    expect(realmOf("alpha", o, { gamma: "alpha" }).sort()).toEqual(
      ["alpha", "beta", "gamma"],
    );
    expect(realmOf("delta", o, { gamma: "alpha" })).toEqual(["delta"]);
  });
});

describe("realmRootOf", () => {
  it("walks a land to its holder, then that holder to its overlord", () => {
    const o = new Map([["beta", "alpha"]]);
    const inc = { gamma: "beta" };
    expect(realmRootOf("alpha", o, inc)).toBe("alpha"); // already the root
    expect(realmRootOf("beta", o, inc)).toBe("alpha"); // a vassal
    expect(realmRootOf("gamma", o, inc)).toBe("alpha"); // a vassal's land
    expect(realmRootOf("delta", o, inc)).toBe("delta"); // unattached
  });

  it("follows the chain to the top, through an incorporated land's owner", () => {
    const o = new Map([["gamma", "beta"], ["beta", "alpha"]]);
    expect(realmRootOf("gamma", o, {})).toBe("alpha");
    // an incorporated land resolves to its owner once, then climbs
    expect(realmRootOf("delta", o, { delta: "gamma" })).toBe("alpha");
    expect(realmRootOf("alpha", o, {})).toBe("alpha");
  });
});

describe("overlordChainOf", () => {
  it("lists ancestors nearest first and is empty for a free faction", () => {
    const o = new Map([["gamma", "beta"], ["beta", "alpha"]]);
    expect(overlordChainOf("gamma", o)).toEqual(["beta", "alpha"]);
    expect(overlordChainOf("beta", o)).toEqual(["alpha"]);
    expect(overlordChainOf("alpha", o)).toEqual([]);
  });
});

describe("fullRealmOf", () => {
  it("adds a vassal's own incorporated lands, which realmOf misses", () => {
    const o = new Map([["beta", "alpha"]]);
    const inc = { gamma: "beta" };
    // realmOf only walks one level out: gamma is beta's, not alpha's
    expect(realmOf("alpha", o, inc).sort()).toEqual(["alpha", "beta"]);
    expect([...fullRealmOf("alpha", o, inc)].sort()).toEqual(
      ["alpha", "beta", "gamma"],
    );
  });

  it("is just the faction itself when it holds nothing", () => {
    expect([...fullRealmOf("delta", new Map(), {})]).toEqual(["delta"]);
  });

  it("walks chains of vassalage to any depth, with each member's annexations", () => {
    // delta -> gamma -> beta -> alpha, and gamma has annexed epsilon
    const o = new Map([
      ["beta", "alpha"], ["gamma", "beta"], ["delta", "gamma"],
    ]);
    const inc = { epsilon: "gamma" };
    expect([...fullRealmOf("alpha", o, inc)].sort()).toEqual(
      ["alpha", "beta", "delta", "epsilon", "gamma"],
    );
    // a mid-lord's own realm is its subtree, not its lord's
    expect([...fullRealmOf("beta", o, inc)].sort()).toEqual(
      ["beta", "delta", "epsilon", "gamma"],
    );
  });
});

describe("incorporatedRealmOf", () => {
  it("is self + incorporated lands, never vassals or their annexations", () => {
    const inc = { gamma: "alpha", epsilon: "beta" };
    // with beta alpha's vassal, beta and its annexation epsilon both stay out
    expect([...incorporatedRealmOf("alpha", inc)].sort()).toEqual(
      ["alpha", "gamma"],
    );
    expect([...incorporatedRealmOf("beta", inc)].sort()).toEqual(
      ["beta", "epsilon"],
    );
    expect([...incorporatedRealmOf("delta", inc)]).toEqual(["delta"]);
  });
});
