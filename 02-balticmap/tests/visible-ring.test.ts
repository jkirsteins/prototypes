import { describe, it, expect } from "vitest";
import { REGIONS, type RegionId } from "../src/regions";
import { VISIBLE_RING } from "../src/view";
import type { MapData } from "../src/types";

/** Guards the fix this file is named for: the surround's hole is
 *  `visibleRectOf` now (VISIBLE_RING past the canvas), not the canvas
 *  itself, so a rebake that drops a neighbour country - the way the Baltic
 *  map's south edge once showed a phantom sea where Ukraine belongs - would
 *  otherwise ship silently. This samples the same rings a browser pass would,
 *  in pure JS against the baked path data, so it runs as part of `npm test`
 *  rather than needing a browser. */

type Edge = "north" | "south" | "east" | "west";

/** Parses an SVG path built only from M/L/Z commands - the only ones
 *  geoPath ever emits for this data (see scripts/prepare-data.mjs and
 *  scripts/prepare-iberia.mjs, both straight-line polygons, no curves) -
 *  into its rings of [x, y] points. */
function ringsOf(d: string): [number, number][][] {
  return d
    .split("M")
    .filter((s) => s.length > 0)
    .map((seg) => {
      const clean = seg.endsWith("Z") ? seg.slice(0, -1) : seg;
      return clean.split("L").map((pt) => {
        const [x, y] = pt.split(",").map(Number);
        return [x, y] as [number, number];
      });
    });
}

interface Shape {
  ring: [number, number][];
  x0: number; y0: number; x1: number; y1: number;
}

function shapesOf(data: MapData): Shape[] {
  const shapes: Shape[] = [];
  for (const r of [...data.regions, ...data.neighbors]) {
    for (const ring of ringsOf(r.path)) {
      if (ring.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      shapes.push({ ring, x0, y0, x1, y1 });
    }
  }
  return shapes;
}

/** Standard ray-cast point-in-polygon, bbox-prefiltered for speed against the
 *  thousands of rings a country like Russia or Sweden carries. Coverage here
 *  is "inside ANY ring" rather than a proper nonzero-winding union, so a hole
 *  ring could in principle read as covered - but no baked hole sits anywhere
 *  near a coastline this test samples (holes are small inland slivers), so
 *  the simplification cannot mask a real coastal gap. */
function covered(px: number, py: number, shapes: Shape[]): boolean {
  for (const s of shapes) {
    if (px < s.x0 || px > s.x1 || py < s.y0 || py > s.y1) continue;
    const ring = s.ring;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      const hit = yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function edgePoint(
  edge: Edge, rect: { x: number; y: number; w: number; h: number }, t: number,
): [number, number] {
  switch (edge) {
    case "north": return [rect.x + t * rect.w, rect.y];
    case "south": return [rect.x + t * rect.w, rect.y + rect.h];
    case "west": return [rect.x, rect.y + t * rect.h];
    case "east": return [rect.x + rect.w, rect.y + t * rect.h];
  }
}

function ringRectOf(data: MapData, ring: number) {
  return {
    x: -data.width * ring, y: -data.height * ring,
    w: data.width * (1 + 2 * ring), h: data.height * (1 + 2 * ring),
  };
}

const SAMPLES = 300;

function uncoveredCount(
  edge: Edge, data: MapData, ring: number, shapes: Shape[],
): number {
  const rect = ringRectOf(data, ring);
  let n = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const [px, py] = edgePoint(edge, rect, t);
    if (!covered(px, py, shapes)) n++;
  }
  return n;
}

// Which edges of each region's canvas are land at the visible ring - read off
// a probe of the baked data, the same one that measured the Baltic map's
// south-edge phantom sea in the first place. The Baltic map's south and east
// close to 0% uncovered at every ring once the bake reaches Ukraine, Czechia
// and Slovakia (its north and west stay open because those are the real
// Baltic and North Sea). Iberia has no edge that clean: it is a peninsula, so
// every edge carries a real stretch of open sea, even the one - north - that
// also borders France. Iberia therefore carries no entry here; its own
// north-edge check is a narrower, regression-shaped assertion below rather
// than a whole-edge one.
const LAND_EDGES: Readonly<Record<RegionId, readonly Edge[]>> = {
  baltic: ["south", "east"],
  iberia: [],
};

describe("the visible ring shows real geography, not a phantom sea", () => {
  for (const [id, edges] of Object.entries(LAND_EDGES) as [
    RegionId, readonly Edge[],
  ][]) {
    if (edges.length === 0) continue;
    const data = REGIONS[id].map;
    const shapes = shapesOf(data);
    for (const edge of edges) {
      it(`${id}: the ${edge} edge is fully covered at VISIBLE_RING`, () => {
        expect(uncoveredCount(edge, data, VISIBLE_RING, shapes)).toBe(0);
      });
    }
  }

  // Iberia's north edge mixes the open Atlantic (west of France) with the
  // French border itself (east of it), so it cannot pin 0% uncovered the way
  // the Baltic map's south and east do - a fair chunk of it is genuinely sea
  // at every ring. What the bake promises instead is that the STRETCH which
  // already read as land at the canvas edge (ring 0, the old surround's own
  // hole) still reads as land once the surround's hole opens out to
  // VISIBLE_RING - the underlying bake is untouched by this change, so
  // nothing at that stretch should regress into a gap.
  it("iberia: the land stretch of the north edge does not regress at VISIBLE_RING", () => {
    const data = REGIONS.iberia.map;
    const shapes = shapesOf(data);
    const coveredAtCanvas: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const px = t * data.width;
      if (covered(px, 0, shapes)) coveredAtCanvas.push(i);
    }
    // Sanity: there IS a land stretch to protect - a regression test that
    // silently passed over an empty set would prove nothing.
    expect(coveredAtCanvas.length).toBeGreaterThan(0);
    const rect = ringRectOf(data, VISIBLE_RING);
    for (const i of coveredAtCanvas) {
      const t = i / (SAMPLES - 1);
      const px = t * data.width; // same x as the ring-0 sample, just further north
      expect(covered(px, rect.y, shapes), `x=${px.toFixed(0)}`).toBe(true);
    }
  });
});
