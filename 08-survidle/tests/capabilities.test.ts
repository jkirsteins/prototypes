import { describe, expect, it } from "vitest";
import { CAPABILITIES, type CapabilityKey, NOT_TIERS, PRODUCERS } from "../src/sim/capabilities";
import { RECIPES, STRUCTURE_IDS, STRUCTURES } from "../src/sim/items";
import { RECOMMENDED, RUNG_LEVEL } from "../src/sim/skills";

const keys = new Set(CAPABILITIES.flatMap((r) => r.keys));

describe("the capability spine's coverage", () => {
  it("every key a row names exists in the code", () => {
    for (const k of keys) {
      const [kind, ...rest] = k.split(":");
      const name = rest.join(":");
      if (kind === "rec") expect(RECOMMENDED[name], k).toBeDefined();
      else if (kind === "build") expect(STRUCTURES[name as keyof typeof STRUCTURES], k).toBeDefined();
      else if (kind === "craft") expect(RECIPES[name as keyof typeof RECIPES], k).toBeDefined();
      else if (kind === "rung") expect(RUNG_LEVEL[name as keyof typeof RUNG_LEVEL], k).toBeDefined();
      else throw new Error(`unknown key kind ${k}`);
    }
  });

  it("every recommended level that names a capability has a row; species are content beneath one", () => {
    for (const k of Object.keys(RECOMMENDED)) {
      if (k.startsWith("hunt:") || k.startsWith("fish:")) continue;
      expect(keys.has(`rec:${k}`), k).toBe(true);
    }
  });

  it("every structure that unlocks a capability has a row", () => {
    for (const id of STRUCTURE_IDS) {
      if (NOT_TIERS.includes(id)) continue;
      expect(keys.has(`build:${id}`), id).toBe(true);
    }
  });

  it("every delegation rung has a row", () => {
    for (const kind of Object.keys(RUNG_LEVEL)) expect(keys.has(`rung:${kind}` as CapabilityKey), kind).toBe(true);
  });

  it("the producers are exactly the rows marked producer", () => {
    const marked = CAPABILITIES.filter((r) => r.producer).map((r) => r.id).sort();
    expect(marked).toEqual([...PRODUCERS].sort());
  });

  it("every row connects systems or says why it stands alone, and none is a percent", () => {
    for (const r of CAPABILITIES) {
      if (!r.alone) expect(r.receives.length, r.id).toBeGreaterThan(0);
      if (typeof r.tier === "object") expect(r.receives, r.id).not.toContain(r.tier.skill);
      expect(r.gives, r.id).not.toContain("%");
      expect(r.id.length, r.id).toBeGreaterThan(2);
    }
  });
});
