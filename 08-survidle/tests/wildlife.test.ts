import { describe, expect, it } from "vitest";
import { SPECIES_DEFS, SPECIES_IDS, type Habitat, type Species } from "../src/sim/species";
import { generateWorld, regionAt, speciesHere, waterKindOf, type RegionDef, type World } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { rangeNoise, wildlifeCapacity } from "../src/world/wildlife";

/** The seeds and the lattice stride the per-region tests walk. Building a region is the slow part of this file, so the sample is as coarse as the assertions allow. */
const SEEDS = [1, 2, 3];
const STRIDE = 15;

const worlds = new Map<number, World>();
function worldFor(seed: number): World {
  let w = worlds.get(seed);
  if (!w) {
    w = generateWorld(seed);
    worlds.set(seed, w);
  }
  return w;
}

/** A sample of regions across the map: every stride-th lattice cell. Kept, and the world with it, so a wider sample reuses what a coarse one already built. */
const samples = new Map<string, RegionDef[]>();
function sample(seed: number, stride = STRIDE): RegionDef[] {
  const key = `${seed}:${stride}`;
  let out = samples.get(key);
  if (!out) {
    const world = worldFor(seed);
    out = [];
    for (let ly = 0; ly < LATTICE_H; ly += stride) for (let lx = 0; lx < LATTICE_W; lx += stride) out.push(regionAt(world, ly * LATTICE_W + lx));
    samples.set(key, out);
  }
  return out;
}

describe("wildlife capacity", () => {
  it("range noise is spread so that a range of r covers about r of the country", () => {
    let over65 = 0;
    let over10 = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const u = rangeNoise(7, i % 30, (i * 37) % 1800, (i * 91) % 1300);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      if (u >= 0.65) over65++;
      if (u >= 0.1) over10++;
    }
    expect(over65 / n).toBeGreaterThan(0.25);
    expect(over65 / n).toBeLessThan(0.45);
    expect(over10 / n).toBeGreaterThan(0.85);
    expect(over10 / n).toBeLessThan(0.97);
  });

  it("is area times habitat, absent below half an animal or outside the range", () => {
    const shares: Record<Habitat, number> = { fell: 0, rock: 0, bog: 0, spruce: 1, pine: 0, birch: 0, meadow: 0, lake: 0, sea: 0 };
    const cap = wildlifeCapacity(1, 16, shares, 100, 100);
    // Squirrels at 12 per km2 of spruce on 16 km2, times the heart factor 0.5..1.5.
    if (cap.squirrel !== undefined) {
      expect(cap.squirrel).toBeGreaterThanOrEqual(16 * 12 * 0.5 - 1e-9);
      expect(cap.squirrel).toBeLessThanOrEqual(16 * 12 * 1.5 + 1e-9);
    }
    expect(cap.perch).toBeUndefined();
    expect(cap.ptarmigan).toBeUndefined();
    expect(cap.eider).toBeUndefined();
    // Beavers need birch or meadow besides the lake.
    const lakeOnly = { ...shares, spruce: 0.5, lake: 0.5 };
    expect(wildlifeCapacity(1, 16, lakeOnly, 100, 100).beaver).toBeUndefined();
  });

  it("every species lives somewhere and is missing from somewhere suitable", () => {
    const suitable = (r: RegionDef, s: Species) => Object.entries(SPECIES_DEFS[s].habitat).some(([h, per]) => (h === "lake" ? r.lake : h === "sea" ? r.sea : r.frac[h as Exclude<Habitat, "lake" | "sea">]) * per * r.area >= 0.5);
    const present: Record<string, number> = {};
    const gaps: Record<string, number> = {};
    for (const seed of SEEDS) {
      for (const r of sample(seed)) {
        for (const s of SPECIES_IDS) {
          if (r.capacity[s]) present[s] = (present[s] ?? 0) + 1;
          else if (suitable(r, s)) gaps[s] = (gaps[s] ?? 0) + 1;
        }
      }
    }
    for (const s of SPECIES_IDS) {
      expect(present[s] ?? 0, `${s} present`).toBeGreaterThan(0);
      if (SPECIES_DEFS[s].range < 1) expect(gaps[s] ?? 0, `${s} absent from suitable`).toBeGreaterThan(0);
    }
  });

  it("keeps woodland birds off the fell and lake fish out of the sea", () => {
    for (const seed of SEEDS) {
      for (const r of sample(seed)) {
        if (r.frac.fell >= 0.8) for (const s of ["capercaillie", "hazelGrouse", "cuckoo", "squirrel", "perch", "pike"] as Species[]) expect(r.capacity[s], `${s} on fell`).toBeUndefined();
        if (r.sea > 0 && r.lake === 0) expect(r.capacity.perch, "perch in the sea").toBeUndefined();
        if (r.frac.water === 0) for (const s of ["perch", "cod", "mallard", "loon"] as Species[]) expect(r.capacity[s], `${s} with no water`).toBeUndefined();
        expect(r.lake + r.sea).toBeCloseTo(r.frac.water, 9);
        for (const s of speciesHere(r)) expect(Number.isFinite(r.capacity[s]!)).toBe(true);
      }
    }
  });

  it("tells sea from lake water", () => {
    const world = generateWorld(42);
    expect(waterKindOf(world, 0)).toBe("sea");
    const r = regionAt(world, world.start);
    const land = r.cells.find((c) => waterKindOf(world, c) === null);
    expect(land).toBeDefined();
  });
});
