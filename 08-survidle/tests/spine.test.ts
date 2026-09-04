import { describe, expect, it } from "vitest";
import { RECIPES, STRUCTURES } from "../src/sim/items";
import { RECOMMENDED, RUNG_LEVEL, SKILL_IDS } from "../src/sim/skills";
import { CAPABILITIES, capability, PRODUCER_STRUCTURES, UNLOCKING_STRUCTURES } from "../src/sim/spine";
import type { OrderKind } from "../src/sim/types";

/** A species is content under a class, never a tier: the spine does not list it. */
const isSpecies = (key: string) => key.startsWith("hunt:") || key.startsWith("fish:");

describe("the coverage of the spine", () => {
  it("every declared tier has a row, and no species does", () => {
    for (const key of Object.keys(RECOMMENDED)) {
      if (isSpecies(key)) {
        expect(capability(key), key).toBeUndefined();
        continue;
      }
      expect(capability(key), key).toBeDefined();
      expect(capability(key)!.tier, key).toBe(RECOMMENDED[key].level);
      expect(capability(key)!.skill, key).toBe(RECOMMENDED[key].skill);
    }
  });

  it("every delegation rung has a row at its gate level", () => {
    for (const kind of Object.keys(RUNG_LEVEL) as OrderKind[]) {
      const row = capability(`rung:${kind}`);
      expect(row, kind).toBeDefined();
      expect(row!.tier, kind).toBe(RUNG_LEVEL[kind]);
      expect(row!.skill).toBe("all");
    }
  });

  it("every producer and every capability-unlocking structure has a row; a producer says so", () => {
    for (const id of PRODUCER_STRUCTURES) {
      expect(STRUCTURES[id], id).toBeDefined();
      const row = capability(`build:${id}`);
      expect(row, id).toBeDefined();
      expect(row!.producer, id).toBe(true);
    }
    for (const id of UNLOCKING_STRUCTURES) {
      expect(STRUCTURES[id], id).toBeDefined();
      expect(capability(`build:${id}`), id).toBeDefined();
    }
    for (const row of CAPABILITIES) {
      if (row.producer) expect(PRODUCER_STRUCTURES.map((s) => `build:${s}`), row.key).toContain(row.key);
    }
  });

  it("every row's key names something in the tree", () => {
    for (const row of CAPABILITIES) {
      const [kind, arg] = row.key.split(":");
      if (kind === "craft") expect(RECIPES[arg as keyof typeof RECIPES], row.key).toBeDefined();
      else if (kind === "build") expect(STRUCTURES[arg as keyof typeof STRUCTURES], row.key).toBeDefined();
      else if (kind === "rung") expect(RUNG_LEVEL[arg as OrderKind], row.key).toBeDefined();
      else throw new Error(`${row.key}: not a recipe, a structure or a rung`);
    }
  });
});

describe("the two-way rule", () => {
  it("every row receives from a skill other than its own, or says why it stands alone", () => {
    for (const row of CAPABILITIES) {
      if ("alone" in row.receives) {
        expect(row.receives.alone.length, row.key).toBeGreaterThan(0);
        continue;
      }
      expect(row.receives.length, row.key).toBeGreaterThan(0);
      for (const s of row.receives) {
        expect(SKILL_IDS, row.key).toContain(s);
        expect(s, `${row.key} receives from its own skill`).not.toBe(row.skill);
      }
    }
  });

  it("every row gives something and leaves something limiting", () => {
    for (const row of CAPABILITIES) {
      expect(row.gives.length, row.key).toBeGreaterThan(0);
      expect(row.leaves.length, row.key).toBeGreaterThan(0);
    }
  });

  it("only the fire and the rungs stand alone", () => {
    const alone = CAPABILITIES.filter((c) => "alone" in c.receives).map((c) => c.key).sort();
    expect(alone).toEqual(["build:firePit", "craft:fireDrill", "rung:grind", "rung:job", "rung:keep"]);
  });

  it("a row whose best name is a percent is not a row", () => {
    for (const row of CAPABILITIES) expect(row.name, row.key).not.toMatch(/[+-]?\d+\s*%/);
  });
});
