import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rateReach, rungTable, tierTable, TIERS, wallTable } from "../scripts/curve-table";
import { levelMinutes } from "../src/sim/skills";

/** The idle curve spec's pacing tables are regenerated from the code's level curve and must appear verbatim; see scripts/curve-table.ts. */
const SPEC = join(process.cwd(), "docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md");

describe("the idle curve's tables derive from the code curve", () => {
  const spec = readFileSync(SPEC, "utf8");
  it("the rung table (2.1)", () => expect(spec).toContain(rungTable()));
  it("the skill-wall table (5.1)", () => expect(spec).toContain(wallTable()));
  it("the tier table (5.4)", () => expect(spec).toContain(tierTable()));
  it("the rate ladder's reach (5.3) is written as the curve gives it", () => {
    expect(spec).toContain(`runs about ${rateReach().join(", ")}`);
  });
  it("the curve is the one the spec names: 2 (L-1)^2 hours", () => {
    for (const l of TIERS) expect(levelMinutes(l) / 60).toBe(2 * (l - 1) ** 2);
  });
});
