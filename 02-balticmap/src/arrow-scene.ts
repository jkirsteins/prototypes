import type { Crossing } from "./borders";

/** How an arrow is sized and placed on the border it crosses.
 *
 *  Opening values tuned by eye against the map's own scale, not derived. The
 *  map is 1000x1400 user units and a land is roughly 200 across, so a 64-unit
 *  arrow is a short step over the frontier rather than a march across a
 *  country. */
export const LAYOUT = {
  /** Share of the border's extent the whole block of arrows may occupy. */
  blockShare: 0.55,
  /** Floored so two lands that barely touch still get a readable arrow, even
   *  though the block then overruns the border. An arrow nobody can see is
   *  worse than one slightly wider than the ground it crosses. */
  blockMin: 30,
  /** Capped so a lone arrow on the map's widest frontier is not absurd. */
  blockMax: 96,
  /** Narrowest a single arrow may be drawn. */
  laneMin: 14,
  /** How far the arrow starts inside the land it leaves. */
  tailDepth: 30,
  /** How far the head reaches inside the land it is aimed at. */
  headDepth: 34,
  /** How far past each coast an arrow across water reaches. */
  seaClearance: 16,
};

export function blockWidthFor(span: number): number {
  return Math.max(
    LAYOUT.blockMin, Math.min(LAYOUT.blockMax, span * LAYOUT.blockShare),
  );
}

/** Each arrow's width, as its share of the block by strength.
 *
 *  A lane below the floor is raised to it and the surplus taken proportionally
 *  from the lanes above the floor. The floor never exceeds the even share
 *  (floor = Math.min(laneMin, even)), so there is always a pool above the floor
 *  to draw the surplus from and the block stays inside `total`. */
export function laneWidths(strengths: readonly number[], total: number): number[] {
  if (strengths.length === 0) return [];
  const even = total / strengths.length;
  const floor = Math.min(LAYOUT.laneMin, even);
  const sum = strengths.reduce((s, v) => s + Math.abs(v), 0);
  if (sum <= 0) return strengths.map(() => even);
  let widths = strengths.map((v) => (Math.abs(v) / sum) * total);
  // Bounded: each pass either fixes every short lane or finds nothing to take
  // from, and the number of lanes on one border is small.
  for (let pass = 0; pass < strengths.length; pass++) {
    const short = widths.map((w) => w < floor - 1e-9);
    if (!short.some(Boolean)) break;
    const owed = widths.reduce((s, w, i) => s + (short[i] ? floor - w : 0), 0);
    const pool = widths.reduce((s, w, i) => s + (short[i] ? 0 : w - floor), 0);
    widths = widths.map((w, i) =>
      short[i] ? floor : w - ((w - floor) / pool) * owed,
    );
  }
  return widths;
}

export interface Lane {
  /** The caller's own order, which is declaration order. */
  index: number;
  width: number;
  ax: number; ay: number;
  bx: number; by: number;
}

/** Every arrow crossing one border, side by side along it.
 *
 *  Direction does not sort them: an answering raid stands beside the attack it
 *  answers, in the order the two were declared. */
export function layoutLanes(
  cross: Crossing, items: readonly { strength: number; forward: boolean }[],
): Lane[] {
  const total = blockWidthFor(cross.span);
  const widths = laneWidths(items.map((i) => i.strength), total);
  // A strait is not a border: there is no line to cross, so the arrow spans
  // the water rather than standing in the middle of it.
  const tail = cross.sea ? cross.gap / 2 + LAYOUT.seaClearance : LAYOUT.tailDepth;
  const head = cross.sea ? cross.gap / 2 + LAYOUT.seaClearance : LAYOUT.headDepth;
  const out: Lane[] = [];
  let cursor = -total / 2;
  for (let i = 0; i < items.length; i++) {
    const width = widths[i];
    const centre = cursor + width / 2;
    cursor += width;
    const cx = cross.at.x + cross.tangent.x * centre;
    const cy = cross.at.y + cross.tangent.y * centre;
    const dir = items[i].forward ? 1 : -1;
    const nx = cross.normal.x * dir;
    const ny = cross.normal.y * dir;
    out.push({
      index: i, width,
      ax: cx - nx * tail, ay: cy - ny * tail,
      bx: cx + nx * head, by: cy + ny * head,
    });
  }
  return out;
}
