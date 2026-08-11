import type { Crossing, Pt } from "./borders";
import { pointAlong, spearFor, spearPolygon } from "./arrows";

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

/** What kind of thing an arrow IS. Not a per-caller distinction: the scene
 *  draws marches, claims, aim previews and the ghosts of resolved marches
 *  through one path, and a kind is the only place their differences live. */
export type ArrowKind = "march" | "claim" | "aim" | "ghost";

export interface ArrowKindDef {
  /** A filled spear, or the dashed demand a claim is drawn as. */
  shape: "spear" | "demand";
  className: string;
  /** The class its label carries. Per kind rather than per caller: a label's
   *  size and colour are part of what the arrow IS, and a literal at the draw
   *  site answers for one kind and silently mis-styles the next one added. */
  labelClass: string;
  /** Why this kind is drawn the way it is. */
  why: string;
}

/** Exhaustive, the `NOTICE_RULES` shape: a new kind of arrow does not compile
 *  until somebody says what it looks like and why. */
export const ARROW_KINDS: Record<ArrowKind, ArrowKindDef> = {
  march: {
    shape: "spear", className: "march-arrow", labelClass: "march-strength",
    why: "An army in flight. The widest thing on its border if it is the strongest.",
  },
  claim: {
    shape: "demand", className: "claim-arrow", labelClass: "claim-label",
    why: "Nobody is marching, so it is dashed with a ring for a head - but it is a real declared thing on the board, so it takes a lane like everything else.",
  },
  aim: {
    shape: "spear", className: "aim-arrow", labelClass: "march-strength",
    why: "The arrow a play would declare, at the width it will really have: it is packed into its border's block with the arrows already crossing it, so the preview IS the board the play is about to make. Laid out on its own it took the whole block and was drawn over the raid it was answering, which is the commonest aim there is.",
  },
  ghost: {
    shape: "spear", className: "clash-flash", labelClass: "clash-label",
    why: "A march that has already landed, fading on the border it crossed. Drawn alone in a layer of its own, so a live rebuild cannot wipe it halfway through the one thing the replay is showing; what keeps it from being read against the living is that the replay hides them while it runs.",
  },
};

export interface ArrowSpec {
  /** The caller's handle. Behaviour is bound to the group this returns, so an
   *  id has to be stable for as long as the arrow is. */
  id: string;
  kind: ArrowKind;
  /** Faction ids. `to` may be empty where `at` is given. */
  from: string;
  to: string;
  /** A point to aim at instead of a land, for a drag over open map. */
  at?: Pt;
  /** What the lane split divides. A claim carries 1: it has no strength of
   *  its own and is one declared thing. */
  strength: number;
  tone: "hostile" | "ours" | "other";
  /** A rival's own colour, for tone "other". */
  fill?: string;
  label?: string;
  /** Where the label sits along the arrow, as a fraction from tail to tip,
   *  overriding the kind's own station. For the one label whose POSITION is
   *  information: a clash's leftover damage sits where the two forces met, and
   *  a fixed station would put every clash label in the same place whoever gave
   *  ground. */
  labelAt?: number;
  chip?: { order: number; clash: boolean };
  /** A claim already answered, drawn faded. */
  doomed?: boolean;
  /** Written onto the group, for the hover, the pin and the counter click. */
  dataset?: Record<string, string>;
}

export interface SceneCtx {
  /** The border between two lands, or null where there is none to draw on. */
  crossingFor(from: string, to: string): Crossing | null;
  /** Where an arrow with no target starts. */
  freeAnchor(from: string): Pt | null;
}

/** One border, whichever way it is crossed. */
export function borderKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const NS = "http://www.w3.org/2000/svg";

/** Where the strength sits along the shaft. Three stations cycled by lane, so
 *  two neighbours never sit level with each other: an arrow is short, and two
 *  labels at the same height across adjacent lanes overlap. */
const LABEL_STATIONS = [0.26, 0.5, 0.74];

/** Past the head, where a claim's one-word label goes. Over 1 on purpose: the
 *  word is wider than the arrow, so it stands in the land being demanded. */
const CLAIM_LABEL_STATION = 1.18;

/** Below this the shaft carries the bare number. Safe only because the ordinal
 *  chip sits behind the tail: the shaft carries exactly one number, so there
 *  is nothing for a bare number to be confused with. */
const BARE_NUMBER_WIDTH = 24;

const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Every arrow on the map, drawn from a description of what is happening.
 *
 *  Rebuilt whole: a march store this small is cheaper to redraw than to diff,
 *  and a stale arrow is a lie about what is coming. */
export function renderArrowScene(
  host: SVGGElement, specs: readonly ArrowSpec[], ctx: SceneCtx,
): Map<string, SVGGElement> {
  host.replaceChildren();
  const drawn = new Map<string, SVGGElement>();
  const byBorder = new Map<string, ArrowSpec[]>();
  const free: ArrowSpec[] = [];
  for (const spec of specs) {
    if (spec.to === "" || spec.at !== undefined) {
      free.push(spec);
      continue;
    }
    const key = borderKeyOf(spec.from, spec.to);
    byBorder.set(key, [...(byBorder.get(key) ?? []), spec]);
  }
  for (const group of byBorder.values()) {
    const first = group[0];
    // The crossing is fetched in the border key's own canonical order, not in
    // whichever order the group's specs happened to arrive - `crossingFor`'s
    // normal is directional in the order it is called with, so a frame
    // anchored to the array-first spec would flip for every arrow on this
    // border the moment the higher-sorting land was named first.
    const [a, b] = borderKeyOf(first.from, first.to).split("|");
    const cross = ctx.crossingFor(a, b);
    if (cross === null) continue;
    const lanes = layoutLanes(
      cross,
      group.map((s) => ({ strength: s.strength, forward: s.from === a })),
    );
    for (const lane of lanes) {
      const g = drawArrow(group[lane.index], lane);
      if (g === null) continue;
      host.appendChild(g);
      drawn.set(group[lane.index].id, g);
    }
  }
  for (const spec of free) {
    // `at` and `freeAnchor` are read the same way whether the caller aimed a
    // point or is only naming a land - the anchor is the one thing a free
    // arrow always needs, so there is nothing for a second arm to branch on.
    const start = ctx.freeAnchor(spec.from);
    const end = spec.at;
    if (start === null || end === undefined) continue;
    const lane = {
      index: 0, width: blockWidthFor(0),
      ax: start.x, ay: start.y, bx: end.x, by: end.y,
    };
    const g = drawArrow(spec, lane);
    if (g === null) continue;
    host.appendChild(g);
    drawn.set(spec.id, g);
  }
  return drawn;
}

function drawArrow(spec: ArrowSpec, lane: Lane): SVGGElement | null {
  const def = ARROW_KINDS[spec.kind];
  const g = svgEl("g");
  g.classList.add(def.className, `march-${spec.tone}`);
  if (spec.doomed === true) g.classList.add("claim-doomed");
  for (const [k, v] of Object.entries(spec.dataset ?? {})) g.dataset[k] = v;

  if (def.shape === "spear") {
    const points = spearPolygon(
      lane.ax, lane.ay, lane.bx, lane.by, spearFor(lane.width),
    );
    if (points === "") return null;
    const poly = svgEl("polygon", { points });
    if (spec.fill !== undefined) poly.setAttribute("fill", spec.fill);
    g.appendChild(poly);
  } else {
    const len = Math.hypot(lane.bx - lane.ax, lane.by - lane.ay);
    if (len === 0) return null;
    const ux = (lane.bx - lane.ax) / len;
    const uy = (lane.by - lane.ay) / len;
    g.appendChild(svgEl("line", {
      x1: lane.ax, y1: lane.ay, x2: lane.bx - ux * 8, y2: lane.by - uy * 8,
    }));
    // A ring rather than a barb: a claim arrives and demands, it does not
    // strike, and the two must not be told apart by squinting at a dash.
    const ring = svgEl("circle", {
      cx: lane.bx - ux * 4, cy: lane.by - uy * 4, r: 6,
    });
    ring.classList.add("claim-head");
    g.appendChild(ring);
  }

  if (spec.label !== undefined) {
    const station = spec.kind === "claim"
      // The one label that is a word rather than a number, and wider than the
      // arrow it belongs to: past the head, in the land being demanded.
      ? CLAIM_LABEL_STATION
      : LABEL_STATIONS[lane.index % LABEL_STATIONS.length];
    const at = pointAlong(
      lane.ax, lane.ay, lane.bx, lane.by, spec.labelAt ?? station,
    );
    const text = svgEl("text", { x: at.x, y: at.y });
    text.classList.add(def.labelClass);
    if (spec.kind !== "claim") text.setAttribute("dominant-baseline", "middle");
    text.textContent = spec.kind !== "claim" && lane.width < BARE_NUMBER_WIDTH
      ? spec.label.replace(/ STR$/, "")
      : spec.label;
    g.appendChild(text);
  }

  if (spec.chip !== undefined) {
    // Behind the tail, outside the block. On the shaft the chips collide as
    // soon as a border carries three arrows, and a chip over the head reads
    // as part of the arrowhead.
    const at = pointAlong(
      lane.ax, lane.ay, lane.bx, lane.by,
      -0.18 - (lane.index % LABEL_STATIONS.length) * 0.14,
    );
    const label = spec.chip.clash
      ? `${ordinal(spec.chip.order)} - clash` : ordinal(spec.chip.order);
    const width = 12 + label.length * 5.6;
    const chip = svgEl("g");
    chip.classList.add("march-order");
    const bg = svgEl("rect", {
      x: at.x - width / 2, y: at.y - 9, width, height: 15, rx: 7.5,
    });
    bg.classList.add("march-order-bg");
    const text = svgEl("text", { x: at.x, y: at.y + 2 });
    text.classList.add("march-order-text");
    text.textContent = label;
    chip.append(bg, text);
    g.appendChild(chip);
  }
  return g;
}

/** "1st", "2nd", "3rd", "4th" - the landing order in words, so the number can
 *  never be read as a strength. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
