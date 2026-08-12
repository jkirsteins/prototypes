import type { Crossing, Pt } from "./borders";
import { pointAlong, spearFor, spearPolygon } from "./arrows";
import { runAnimation } from "./animate";

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
    why: "A march that has already landed, fading on the border it crossed. Drawn in a layer of its own because its lifetime is the beat's rather than the board's - it outlives the state it was drawn from; what keeps it from being read against the living is that the beat hides them while it runs.",
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

/** How long an arrow takes to arrive, to leave, and to cross to a new lane.
 *
 *  Handed to `runAnimation`, which reports when each is really over. None of
 *  these numbers may be copied into a second timer set to the same length. */
export const ARROW_MOTION_MS = { enter: 220, exit: 260, lane: 200 };

/** Far enough for a lane move to be worth showing. Below it the arrow is
 *  standing where it stood and a slide would be a twitch. */
const LANE_MOVE_MIN = 0.5;

const setAttrs = (
  el: Element, attrs: Record<string, string | number>,
): void => {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
};

const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K,
): SVGElementTagNameMap[K] =>
  document.createElementNS(NS, name) as SVGElementTagNameMap[K];

/** One arrow the host is holding between renders. */
interface HeldArrow {
  el: SVGGElement;
  /** What the element was built as. A kind decides the element's whole shape,
   *  so a key that changes kind is a different arrow wearing the same name. */
  kind: ArrowKind;
  /** Where its lane's tail sat last render, so a lane that moves is crossed
   *  rather than jumped. */
  ax: number;
  ay: number;
  /** The fade and the slide running on it. One of each at most: a second
   *  animation of the same property would fight the first for the element. */
  fade: { cancel(): void } | null;
  slide: { cancel(): void } | null;
}

interface Scene {
  /** The arrows on screen, by the caller's key. A key leaves this the instant
   *  its arrow starts to go, never when the fade ends. */
  held: Map<string, HeldArrow>;
  /** The corpses still fading. They answer to no key any more, and the layout
   *  steps over them rather than counting them as arrows in place. */
  leaving: Set<ChildNode>;
}

/** What each host is holding, per host and not per module: the live arrows and
 *  a beat's resolutions are two scenes, and a key drawn in one says nothing
 *  about the other. */
const SCENES = new WeakMap<SVGGElement, Scene>();

/** Every arrow on the map, drawn from a description of what is happening.
 *
 *  Retained by key rather than rebuilt: an arrow that is still in flight is
 *  the SAME element from one render to the next, so it can fade in when it is
 *  declared, cross to its new lane when the border it shares gets busier, and
 *  fade out when it lands. Rebuilt whole, nothing survived a frame and nothing
 *  could be animated at all - and a repaint that changed no arrow still tore
 *  every one of them off the map and put them back.
 *
 *  The returned map is what is on the board NOW. A corpse mid-fade is in the
 *  host and in no map: it is a picture of what just happened, and nothing may
 *  bind behaviour to it. */
export function renderArrowScene(
  host: SVGGElement, specs: readonly ArrowSpec[], ctx: SceneCtx,
): Map<string, SVGGElement> {
  const scene = SCENES.get(host)
    ?? { held: new Map<string, HeldArrow>(), leaving: new Set<ChildNode>() };
  SCENES.set(host, scene);
  const drawn = new Map<string, SVGGElement>();
  const ordered: SVGGElement[] = [];
  const entered: HeldArrow[] = [];
  const draw = (spec: ArrowSpec, lane: Lane): void => {
    const held = place(scene, host, spec, lane);
    if (held === null) return;
    drawn.set(spec.id, held.el);
    ordered.push(held.el);
    if (held.el.parentNode !== host) entered.push(held);
  };
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
    for (const lane of lanes) draw(group[lane.index], lane);
  }
  for (const spec of free) {
    // `at` and `freeAnchor` are read the same way whether the caller aimed a
    // point or is only naming a land - the anchor is the one thing a free
    // arrow always needs, so there is nothing for a second arm to branch on.
    const start = ctx.freeAnchor(spec.from);
    const end = spec.at;
    if (start === null || end === undefined) continue;
    draw(spec, {
      index: 0, width: blockWidthFor(0),
      ax: start.x, ay: start.y, bx: end.x, by: end.y,
    });
  }
  for (const [key, held] of [...scene.held]) {
    if (drawn.has(key)) continue;
    // Dropped AT ONCE, before the fade is even started: the key is free the
    // moment its arrow begins to leave, so an arrow declared again over the
    // same border is handed a fresh element rather than the corpse of the one
    // that just went.
    scene.held.delete(key);
    retire(scene, host, held);
  }
  arrange(host, ordered, scene);
  for (const held of entered) enter(held);
  return drawn;
}

/** Puts one arrow where the lane says, reusing the element already standing
 *  there. Returns it still detached when it is new: the enter fade waits until
 *  `arrange` has put it in the host, because what it fades UP to is whatever
 *  the stylesheet gives it once it is in the tree. */
function place(
  scene: Scene, host: SVGGElement, spec: ArrowSpec, lane: Lane,
): HeldArrow | null {
  const held = scene.held.get(spec.id);
  let kept: HeldArrow | null = null;
  if (held !== undefined) {
    // Never the aim preview: it re-packs on every pointer move and has to
    // track the cursor, so it is rebuilt and carries no transition at all.
    //
    // And never an element the host has stopped owning. A layer emptied from
    // outside - a run ending, a beat clearing its ghosts - leaves nothing to
    // update in place, and dressing a detached node draws an arrow nobody
    // sees.
    const reusable = spec.kind !== "aim" && held.kind === spec.kind
      && held.el.parentNode === host;
    if (reusable) kept = held;
    else {
      // Replaced, not retired: something is taking this key's place in the
      // same breath, and two arrows for one key is one arrow too many.
      scene.held.delete(spec.id);
      discard(scene, held);
    }
  }
  const el = kept?.el ?? svgEl("g");
  if (!dressArrow(el, spec, lane)) {
    // Nothing to draw at this width. An arrow already standing goes the way
    // any departing arrow goes rather than blinking out.
    if (kept !== null) {
      scene.held.delete(spec.id);
      retire(scene, host, kept);
    }
    return null;
  }
  if (kept === null) {
    const fresh: HeldArrow = {
      el, kind: spec.kind, ax: lane.ax, ay: lane.ay, fade: null, slide: null,
    };
    scene.held.set(spec.id, fresh);
    return fresh;
  }
  const dx = kept.ax - lane.ax;
  const dy = kept.ay - lane.ay;
  kept.ax = lane.ax;
  kept.ay = lane.ay;
  if (Math.hypot(dx, dy) >= LANE_MOVE_MIN) {
    kept.slide?.cancel();
    kept.slide = transition(el, [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: "translate(0px, 0px)" },
    ], ARROW_MOTION_MS.lane);
  }
  return kept;
}

/** Runs one transition and hands the element back to the stylesheet when it is
 *  over.
 *
 *  A filled animation outranks every rule in the stylesheet for as long as it
 *  is alive, and an arrow's opacity is the stylesheet's business - a rival's
 *  quarrel rests at 0.45, the focus dim at 0.12, the arrows behind a live aim
 *  at 0.75. An enter fade left filling would pin all three at whatever it
 *  ended on. */
function transition(
  el: Element, frames: Keyframe[], ms: number, onDone?: () => void,
): { cancel(): void } {
  const handle = runAnimation(el, frames, ms, () => {
    handle.cancel();
    onDone?.();
  });
  return handle;
}

/** The opacity the stylesheet gives this arrow, which is what a fade in ends
 *  on and what a fade out starts from. Read off the element rather than
 *  assumed to be 1: fading a rival's 0.45 arrow up to full and dropping it
 *  back is a flash on every arrow that is not the player's own. */
function restingOpacity(el: Element): number {
  const raw = getComputedStyle(el).opacity;
  const value = Number(raw);
  return raw !== "" && Number.isFinite(value) ? value : 1;
}

function enter(held: HeldArrow): void {
  // The aim preview arrives without one: it is under the cursor already.
  if (held.kind === "aim") return;
  held.fade?.cancel();
  held.fade = transition(
    held.el,
    [{ opacity: 0 }, { opacity: restingOpacity(held.el) }],
    ARROW_MOTION_MS.enter,
  );
}

/** An arrow that is no longer on the board: it fades where it stood and is
 *  taken out when the fade reports itself finished, never on a second clock. */
function retire(scene: Scene, host: SVGGElement, held: HeldArrow): void {
  if (held.kind === "aim" || held.el.parentNode !== host) {
    discard(scene, held);
    return;
  }
  held.slide?.cancel();
  held.fade?.cancel();
  const el = held.el;
  // Out of hit-testing at once. A corpse answers to no key, so a click or a
  // hover it took would be about an arrow that is no longer there. Inline
  // because `.march-arrow` claims `pointer-events: auto` from the stylesheet.
  el.style.pointerEvents = "none";
  scene.leaving.add(el);
  held.fade = transition(
    el, [{ opacity: restingOpacity(el) }, { opacity: 0 }],
    ARROW_MOTION_MS.exit,
    () => {
      scene.leaving.delete(el);
      el.remove();
    },
  );
}

/** Gone now, with nothing to watch: an arrow being replaced in the same render,
 *  or one whose host was emptied under it. */
function discard(scene: Scene, held: HeldArrow): void {
  held.slide?.cancel();
  held.fade?.cancel();
  scene.leaving.delete(held.el);
  held.el.remove();
}

/** Puts the host's children in the order the specs were given in, which is
 *  z-order: a claim is declared after the spears on its border so it is drawn
 *  over them, and the aim preview after everything.
 *
 *  Only what is out of place is touched, and the corpses are stepped over
 *  rather than counted - an arrow standing still through a repaint must not
 *  move in the DOM, or it is a new element again in all but name. */
function arrange(
  host: SVGGElement, ordered: readonly SVGGElement[], scene: Scene,
): void {
  let at: ChildNode | null = host.firstChild;
  for (const el of ordered) {
    while (at !== null && at !== el && scene.leaving.has(at)) {
      at = at.nextSibling;
    }
    if (at === el) {
      at = el.nextSibling;
      continue;
    }
    host.insertBefore(el, at);
  }
}

/** The child at `index`, reused when it is already that kind of node.
 *
 *  Addressed by position because an arrow's parts are a fixed list: the shape,
 *  then the label, then the landing-order chip. A render that changes nothing
 *  must add and remove no nodes at all - the whole point of retaining the
 *  arrow is lost if its insides are rebuilt underneath it. */
function ensure<K extends keyof SVGElementTagNameMap>(
  parent: Element, index: number, name: K,
): SVGElementTagNameMap[K] {
  const at = parent.children[index];
  if (at !== undefined && at.tagName === name) {
    return at as SVGElementTagNameMap[K];
  }
  const made = svgEl(name);
  if (at === undefined) parent.appendChild(made);
  else parent.replaceChild(made, at);
  return made;
}

/** Drops whatever a previous render left past the parts this one used. */
function trim(parent: Element, used: number): void {
  while (parent.children.length > used) parent.lastElementChild?.remove();
}

/** The dataset the spec asks for, and nothing a previous render left behind. */
function applyDataset(g: SVGGElement, data: Record<string, string>): void {
  for (const name of g.getAttributeNames()) {
    if (!name.startsWith("data-")) continue;
    const key = name.slice(5).replace(/-([a-z])/g, (_, c: string) =>
      c.toUpperCase());
    if (!(key in data)) g.removeAttribute(name);
  }
  for (const [k, v] of Object.entries(data)) g.dataset[k] = v;
}

/** Draws the spec into the group, whether the group is new or has been
 *  standing there for twenty renders. False where the geometry is degenerate,
 *  and then nothing has been touched. */
function dressArrow(g: SVGGElement, spec: ArrowSpec, lane: Lane): boolean {
  const def = ARROW_KINDS[spec.kind];
  let used = 0;
  if (def.shape === "spear") {
    const points = spearPolygon(
      lane.ax, lane.ay, lane.bx, lane.by, spearFor(lane.width),
    );
    if (points === "") return false;
    const poly = ensure(g, used++, "polygon");
    poly.setAttribute("points", points);
    if (spec.fill !== undefined) poly.setAttribute("fill", spec.fill);
    else poly.removeAttribute("fill");
  } else {
    const len = Math.hypot(lane.bx - lane.ax, lane.by - lane.ay);
    if (len === 0) return false;
    const ux = (lane.bx - lane.ax) / len;
    const uy = (lane.by - lane.ay) / len;
    setAttrs(ensure(g, used++, "line"), {
      x1: lane.ax, y1: lane.ay, x2: lane.bx - ux * 8, y2: lane.by - uy * 8,
    });
    // A ring rather than a barb: a claim arrives and demands, it does not
    // strike, and the two must not be told apart by squinting at a dash.
    const ring = ensure(g, used++, "circle");
    setAttrs(ring, { cx: lane.bx - ux * 4, cy: lane.by - uy * 4, r: 6 });
    ring.setAttribute("class", "claim-head");
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
    const text = ensure(g, used++, "text");
    setAttrs(text, { x: at.x, y: at.y });
    text.setAttribute("class", def.labelClass);
    if (spec.kind !== "claim") text.setAttribute("dominant-baseline", "middle");
    else text.removeAttribute("dominant-baseline");
    const words = spec.kind !== "claim" && lane.width < BARE_NUMBER_WIDTH
      ? spec.label.replace(/ STR$/, "")
      : spec.label;
    if (text.textContent !== words) text.textContent = words;
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
    const chip = ensure(g, used++, "g");
    chip.setAttribute("class", "march-order");
    const bg = ensure(chip, 0, "rect");
    setAttrs(bg, {
      x: at.x - width / 2, y: at.y - 9, width, height: 15, rx: 7.5,
    });
    bg.setAttribute("class", "march-order-bg");
    const text = ensure(chip, 1, "text");
    setAttrs(text, { x: at.x, y: at.y + 2 });
    text.setAttribute("class", "march-order-text");
    if (text.textContent !== label) text.textContent = label;
    trim(chip, 2);
  }
  trim(g, used);

  // Set whole rather than toggled, so a class another surface put on the arrow
  // - the counter cue, the aim's own validity - is gone by the time that
  // surface is asked again. An arrow's classes say what it IS this render.
  const classes = [def.className, `march-${spec.tone}`];
  if (spec.doomed === true) classes.push("claim-doomed");
  g.setAttribute("class", classes.join(" "));
  applyDataset(g, spec.dataset ?? {});
  return true;
}

/** "1st", "2nd", "3rd", "4th" - the landing order in words, so the number can
 *  never be read as a strength. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
