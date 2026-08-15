/** Where two lands meet, read off the map's own polygons.
 *
 *  Adjacent regions in the map data share EXACT vertices - the paths were cut
 *  from one topology - so a shared border is a set intersection rather than a
 *  geometry search. Jersika and Talava share 183 of them.
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

export interface Crossing {
  /** A vertex OF the border, never a computed point: the centroid of a bent
   *  border sits off it by up to 33 units on this map, so the nearest shared
   *  vertex to that centroid is what an arrow is placed on. */
  at: Pt;
  /** Unit vector along the border, the axis lanes are laid out on. */
  tangent: Pt;
  /** Unit vector from the first land into the second. */
  normal: Pt;
  /** How much border there is along `tangent`. 11 to 308 units on the Baltic
   *  map, 10.2 to 351.4 on Iberia. */
  span: number;
  /** True where the two lands share no vertex at all. */
  sea: boolean;
  /** The width of the water on a sea crossing, 0 otherwise. */
  gap: number;
}

/** Ray casting, counting every ring: a region drawn as several subpaths is
 *  inside any of them. */
export function pointInRings(p: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if ((a.y > p.y) !== (b.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (p.x < x) inside = !inside;
      }
    }
  }
  return inside;
}

/** How deep an arrow may go into a land, and how far past a coast it reaches
 *  across water. Here rather than in `src/arrow-scene.ts` because the depth of
 *  an arrow is a question about the GROUND, and the ground is measured on this
 *  side: a station is built with these numbers as its ceiling, and the scene is
 *  handed the answer rather than the polygons. */
export const ARROW_DEPTHS = {
  head: 34,
  tail: 30,
  seaClearance: 16,
  /** Shortest an arrow's half may be drawn. Below this it stops reading as an
   *  arrow, so the ground gets overrun instead - the trade `LAYOUT.blockMin`
   *  already makes for width. */
  min: 12,
  /** How far short of the far edge a tip stops, so it stands ON the land
   *  rather than exactly on its outline. */
  inset: 2,
};

/** Nudge off the start point before casting. A station sits exactly on a
 *  border vertex, which is on the outline of both lands, and a ray cast from
 *  exactly there is a coin toss on which side it starts. */
const RAY_EPS = 0.01;

/** How far from `from` along `dir` an arrow may go and still END on this land,
 *  capped at `want` and backed off by `inset`. `-1` where the ray meets the
 *  land nowhere inside `want`.
 *
 *  `dir` must be a unit vector: the returned number is a distance in the map's
 *  own user units, which is what the caller places an arrow with.
 *
 *  Exact edge intersections rather than a sampled walk, because the shapes this
 *  exists to detect are slivers and a walk in whole units steps straight over
 *  them - the same argument that makes `sharedVertices` a set intersection
 *  rather than a proximity search.
 *
 *  Whether the ray STARTS on the land is asked of `pointInRings` and not of the
 *  parity of the hits: the hits say where inside-ness CHANGES, and two
 *  point-in-polygon rules disagreeing about the same map is how a measurement
 *  and the test that checks it end up contradicting each other.
 *
 *  When the ray already starts on the land, where this run of land BEGAN sits
 *  behind `from`, not at it, so a second probe looks backward along `dir` for
 *  that edge. Without it, a station planted deep inside a wide land and one
 *  planted on a sliver too narrow for the inset read the same from where the
 *  ray stands - both are simply "on" with nothing entering ahead of them -
 *  and only the true run length tells the two apart.
 *
 *  `-1` is a real answer rather than an error. It is what lets the layout see
 *  that a place on the border cannot be crossed and step around it, instead of
 *  guessing a length there. */
export function reach(
  from: Pt, dir: Pt, rings: Pt[][], want: number, inset: number,
): number {
  const start = { x: from.x + dir.x * RAY_EPS, y: from.y + dir.y * RAY_EPS };
  const hits: number[] = [];
  let behind = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dir.x * ey - dir.y * ex;
      if (den === 0) continue;
      const t = ((a.x - start.x) * ey - (a.y - start.y) * ex) / den;
      const u = ((a.x - start.x) * dir.y - (a.y - start.y) * dir.x) / den;
      // `u < 1` and not `<= 1`: a vertex belongs to exactly one of the two
      // edges that meet there, or every corner is counted twice and the
      // inside-outside walk below flips itself back.
      if (u < 0 || u >= 1) continue;
      if (t > 0 && t <= want) hits.push(t);
      // The nearest edge behind `start`: a candidate for where an already-on
      // run of land began.
      else if (t < 0 && t > behind) behind = t;
    }
  }
  hits.sort((p, q) => p - q);
  let on = pointInRings(start, rings);
  let entered = on ? (behind > Number.NEGATIVE_INFINITY ? behind : 0) : -1;
  let left = -1;
  for (const t of hits) {
    if (on) {
      left = t;
      break;
    }
    entered = t;
    on = true;
  }
  // Never on this land inside `want`.
  if (!on) return -1;
  // The run outlasts `want`: nothing to back away from, so the arrow gets the
  // whole depth it asked for.
  if (left < 0) return want;
  const tip = Math.min(want, left + RAY_EPS - inset);
  // A run shorter than the inset. There is land here and nowhere on it to put
  // a tip, which to the caller is the same answer as no land at all.
  return tip <= entered ? -1 : Math.max(0, tip);
}

/** How far out the orientation vote probes. Four distances rather than one,
 *  and this is load-bearing: `tangent` is a GLOBAL fit to the whole border and
 *  the border is locally bent under it, so a single probe is ambiguous on 7 of
 *  the 103 adjacencies these maps have. The vote resolves all 103. */
const PROBES = [6, 12, 24, 40];

/** The span a sea crossing lays its lanes along. There is no border to
 *  measure, so this is a constant rather than a number read off the map. */
const SEA_SPAN = 70;

export function crossingBetween(a: Pt[][], b: Pt[][]): Crossing {
  const shared = sharedVertices(a, b);
  if (shared.length >= 2) return borderCrossing(shared, a, b);
  if (shared.length === 1) return singleVertexCrossing(shared[0], a, b);
  return straitCrossing(a, b);
}

function borderCrossing(shared: Pt[], a: Pt[][], b: Pt[][]): Crossing {
  const n = shared.length;
  const cx = shared.reduce((s, p) => s + p.x, 0) / n;
  const cy = shared.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of shared) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  // The principal axis of the shared set. Robust where a strict walk of
  // contiguous vertices is not: a border can be broken into many short runs
  // and still be one frontier.
  const th = 0.5 * Math.atan2((2 * sxy) / n, (sxx - syy) / n);
  const tangent = { x: Math.cos(th), y: Math.sin(th) };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let at = shared[0];
  let best = Number.POSITIVE_INFINITY;
  for (const p of shared) {
    const t = (p.x - cx) * tangent.x + (p.y - cy) * tangent.y;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < best) {
      best = d;
      at = p;
    }
  }
  const nx = -tangent.y;
  const ny = tangent.x;
  const score = (sign: 1 | -1): number => {
    let s = 0;
    for (const d of PROBES) {
      if (pointInRings({ x: at.x + nx * d * sign, y: at.y + ny * d * sign }, b)) s++;
      if (pointInRings({ x: at.x - nx * d * sign, y: at.y - ny * d * sign }, a)) s++;
    }
    return s;
  };
  const sign: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
  return {
    at,
    tangent,
    normal: { x: nx * sign, y: ny * sign },
    span: hi - lo,
    sea: false,
    gap: 0,
  };
}

/** A single shared vertex is a real border touch, not water. The normal is the
 *  direction from one land's centroid to the other's, since there is no border
 *  chain to fit a tangent to. */
function singleVertexCrossing(at: Pt, a: Pt[][], b: Pt[][]): Crossing {
  let ax = 0;
  let ay = 0;
  let aCount = 0;
  for (const ring of a) {
    for (const p of ring) {
      ax += p.x;
      ay += p.y;
      aCount++;
    }
  }
  ax /= aCount;
  ay /= aCount;
  let bx = 0;
  let by = 0;
  let bCount = 0;
  for (const ring of b) {
    for (const p of ring) {
      bx += p.x;
      by += p.y;
      bCount++;
    }
  }
  bx /= bCount;
  by /= bCount;
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy) || 1;
  const normal = { x: dx / d, y: dy / d };
  return {
    at,
    tangent: { x: -normal.y, y: normal.x },
    normal,
    span: 0,
    sea: false,
    gap: 0,
  };
}

/** No shared vertex means no border: these two lands face each other across
 *  water. The narrowest part of the strait is where a crossing goes. */
function straitCrossing(a: Pt[][], b: Pt[][]): Crossing {
  let pa = a[0][0];
  let pb = b[0][0];
  let best = Number.POSITIVE_INFINITY;
  for (const ringA of a) {
    for (const p of ringA) {
      for (const ringB of b) {
        for (const q of ringB) {
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (d < best) {
            best = d;
            pa = p;
            pb = q;
          }
        }
      }
    }
  }
  let dx = pb.x - pa.x;
  let dy = pb.y - pa.y;
  const gap = Math.hypot(dx, dy);
  if (gap === 0) {
    let ax = 0;
    let ay = 0;
    let aCount = 0;
    for (const ring of a) {
      for (const p of ring) {
        ax += p.x;
        ay += p.y;
        aCount++;
      }
    }
    ax /= aCount;
    ay /= aCount;
    let bx = 0;
    let by = 0;
    let bCount = 0;
    for (const ring of b) {
      for (const p of ring) {
        bx += p.x;
        by += p.y;
        bCount++;
      }
    }
    bx /= bCount;
    by /= bCount;
    dx = bx - ax;
    dy = by - ay;
  }
  const d = Math.hypot(dx, dy) || 1;
  const normal = { x: dx / d, y: dy / d };
  return {
    at: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
    tangent: { x: -normal.y, y: normal.x },
    normal,
    span: SEA_SPAN,
    sea: true,
    gap: gap || 1,
  };
}
