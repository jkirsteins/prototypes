import { describe, it, expect } from "vitest";
import {
  initialRulers, replaceRuler, rulerNameFor, rulerOf,
} from "../src/rulers";
import raw from "../src/data/map.json";
import pools from "../src/data/ruler-names.json";
import type { MapData } from "../src/types";

const data = raw as MapData;
const POOLS = pools as Record<string, string[]>;

describe("ruler name pools", () => {
  it("covers every ethnicity on the map", () => {
    for (const faction of data.factions) {
      expect(POOLS[faction.ethnicity], `pool for ${faction.ethnicity}`).toBeDefined();
    }
    expect(POOLS.generic).toBeDefined();
  });

  it("holds at least twice as many names as the ethnicity has factions", () => {
    // Setup must never start near exhaustion. The Estonians bind, with eight.
    const counts = new Map<string, number>();
    for (const f of data.factions) {
      counts.set(f.ethnicity, (counts.get(f.ethnicity) ?? 0) + 1);
    }
    for (const [ethnicity, count] of counts) {
      expect(POOLS[ethnicity].length, `pool for ${ethnicity}`).toBeGreaterThanOrEqual(count * 2);
    }
  });

  it("has no duplicate names inside a pool", () => {
    for (const [ethnicity, names] of Object.entries(POOLS)) {
      expect(new Set(names).size, `pool for ${ethnicity}`).toBe(names.length);
    }
  });
});

describe("initialRulers", () => {
  const factionIds = data.factions.map((f) => f.id);
  const ethnicities = Object.fromEntries(
    data.factions.map((f) => [f.id, f.ethnicity]),
  );

  it("seats a ruler for every faction", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    for (const id of factionIds) {
      expect(rulerOf(rulers, id).name.length).toBeGreaterThan(0);
      expect(rulerOf(rulers, id).since).toBe(1);
    }
  });

  it("gives every faction a distinct name, across ethnicities too", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    const names = Object.values(rulers).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("draws from the faction's own ethnicity pool", () => {
    const rulers = initialRulers(factionIds, ethnicities);
    expect(POOLS.livs).toContain(rulerOf(rulers, "lower-daugava-livs").name);
    expect(POOLS.estonians).toContain(rulerOf(rulers, "ugandians").name);
  });

  it("is deterministic - no rng, so the same world always seats the same rulers", () => {
    expect(initialRulers(factionIds, ethnicities)).toEqual(
      initialRulers(factionIds, ethnicities),
    );
  });

  it("falls back to the generic pool for a faction with no ethnicity", () => {
    const rulers = initialRulers(["alpha", "beta"]);
    expect(POOLS.generic).toContain(rulerOf(rulers, "alpha").name);
    expect(rulerOf(rulers, "alpha").name).not.toBe(rulerOf(rulers, "beta").name);
  });
});

describe("rulerOf", () => {
  it("throws rather than leaking undefined into the interface", () => {
    expect(() => rulerOf({}, "nobody")).toThrow(/nobody/);
  });
});

describe("replaceRuler", () => {
  const ethnicities = { alpha: "livs", beta: "livs" };

  it("seats a different ruler and reports both names", () => {
    const before = initialRulers(["alpha", "beta"], ethnicities);
    const out = replaceRuler(before, ethnicities, "alpha", 12);
    expect(out.killed).toBe(rulerOf(before, "alpha").name);
    expect(out.successor).not.toBe(out.killed);
    expect(rulerOf(out.rulers, "alpha").name).toBe(out.successor);
    expect(rulerOf(out.rulers, "alpha").since).toBe(12);
  });

  it("leaves every other faction untouched", () => {
    const before = initialRulers(["alpha", "beta"], ethnicities);
    const out = replaceRuler(before, ethnicities, "alpha", 12);
    expect(out.rulers.beta).toBe(before.beta);
  });

  it("never seats a name a living ruler already holds", () => {
    let rulers = initialRulers(["alpha", "beta"], ethnicities);
    for (let turn = 2; turn < 40; turn++) {
      rulers = replaceRuler(rulers, ethnicities, "alpha", turn).rulers;
      const names = Object.values(rulers).map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("takes a patronymic once the pool is spent", () => {
    // One faction per name in the pool leaves nothing free, so the successor
    // must be distinguished the way the chronicles do it.
    const pool = POOLS.livs;
    const ids = pool.map((_, i) => `f${i}`);
    const eth = Object.fromEntries(ids.map((id) => [id, "livs"]));
    const rulers = initialRulers(ids, eth);
    const out = replaceRuler(rulers, eth, "f0", 5);
    expect(out.successor).toMatch(/^.+, son of .+$/);
    const names = Object.values(out.rulers).map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("rulerNameFor", () => {
  it("gives different factions of one ethnicity different names at setup", () => {
    const taken = new Set<string>();
    const a = rulerNameFor("alpha", "livs", 0, taken);
    taken.add(a);
    expect(rulerNameFor("beta", "livs", 0, taken)).not.toBe(a);
  });
});
