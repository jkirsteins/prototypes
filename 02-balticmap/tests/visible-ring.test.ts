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
// every edge carries a real stretch of open sea - which is why its own checks
// live in LAND_SPANS below, a sub-range of an edge rather than the whole of
// it.
const LAND_EDGES: Readonly<Record<RegionId, readonly Edge[]>> = {
  baltic: ["south", "east"],
  iberia: [],
};

// A LAND-side stretch of one edge, [from, to] in the same 0..1 t used to walk
// the edge elsewhere in this file. Asserted covered ABSOLUTELY (0 uncovered
// samples), the same standard LAND_EDGES holds a whole edge to - a regression
// check ("still whatever ring 0 already showed") is what this file used to
// run for Iberia, and it passed clean through the northeast-corner phantom
// sea this fault report is about: ring 0 was ALSO uncovered out there, so
// "no new gap versus ring 0" proved nothing. The spans below sit a few
// samples in from the true land/sea line on both ends (see the comment by
// each region), so the margin does not itself become the flaky edge.
interface LandSpan { edge: Edge; from: number; to: number; }
const LAND_SPANS: Readonly<Record<RegionId, readonly LandSpan[]>> = {
  baltic: [],
  // France, Switzerland and Germany close the top of the canvas from about
  // 51% along the north edge to the northeast corner, and continue down the
  // east edge for the first 15% or so before the Mediterranean opens up -
  // together the exact stretch that used to read as a phantom sea (France's
  // baked polygon ended around x=1809 of the 1400-wide canvas, well short of
  // the ring). The small gap earlier on the north edge (around t=0.48) is a
  // real bay in the French Atlantic coast, not a border - left out on
  // purpose, so this span starts past it.
  iberia: [
    { edge: "north", from: 0.55, to: 1.0 },
    { edge: "east", from: 0.0, to: 0.15 },
  ],
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

  for (const [id, spans] of Object.entries(LAND_SPANS) as [
    RegionId, readonly LandSpan[],
  ][]) {
    const data = REGIONS[id].map;
    const shapes = shapesOf(data);
    const rect = ringRectOf(data, VISIBLE_RING);
    for (const span of spans) {
      it(
        `${id}: the ${span.edge} edge is fully covered from t=${span.from} to ` +
          `t=${span.to} at VISIBLE_RING`,
        () => {
          const SPAN_SAMPLES = 100;
          let uncovered = 0;
          for (let i = 0; i < SPAN_SAMPLES; i++) {
            const t = span.from + (i / (SPAN_SAMPLES - 1)) * (span.to - span.from);
            const [px, py] = edgePoint(span.edge, rect, t);
            if (!covered(px, py, shapes)) uncovered++;
          }
          expect(uncovered).toBe(0);
        },
      );
    }
  }
});
