/** Where two lands meet, read off the map's own polygons.
 *
 *  Adjacent regions in the map data share EXACT vertices - the paths were cut
 *  from one topology - so a shared border is a set intersection rather than a
 *  geometry search. Jersika and Talava share 207 of them.
 *
 *  Pure numbers, no DOM, for the reason `src/arrows.ts` is: `getBBox()` is a
 *  stub under happy-dom, so this is where the shape can actually be checked. */

export interface Pt { x: number; y: number }

/** Every closed ring of a region's `path`. A list rather than one ring: ten
 *  Baltic and eighteen Iberian regions are drawn as several subpaths, being
 *  islands, enclaves and lakes, and a border can run along any of them. */
export function ringsOf(path: string): Pt[][] {
  const out: Pt[][] = [];
  for (const sub of path.split("M").slice(1)) {
    const pts: Pt[] = [];
    for (const m of sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      pts.push({ x: Number(m[1]), y: Number(m[2]) });
    }
    // Two points are a line, not a ring, and no border runs along one.
    if (pts.length > 2) out.push(pts);
  }
  return out;
}

/** Three decimals, which is what the map data carries. A tolerance wider than
 *  the data's own precision would start matching vertices that are merely
 *  near each other, and "near" across a strait is a different question. */
function keyOf(p: Pt): string {
  return `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
}

/** The vertices two lands hold in common, in the first land's own order. */
export function sharedVertices(a: Pt[][], b: Pt[][]): Pt[] {
  const inB = new Set<string>();
  for (const ring of b) for (const p of ring) inB.add(keyOf(p));
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const ring of a) {
    for (const p of ring) {
      const k = keyOf(p);
      if (!inB.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
