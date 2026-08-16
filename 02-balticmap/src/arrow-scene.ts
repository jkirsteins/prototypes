import {
  ARROW_DEPTHS, stationRoom, type Crossing, type Pt, type Station,
} from "./borders";
import { pointAlong, spearFor, spearPolygon } from "./arrows";
import { runAnimation } from "./animate";

/** How an arrow is sized on the border it crosses. Depth lives in
 *  `ARROW_DEPTHS` (`src/borders.ts`) instead, alongside the stations it is
 *  measured against - the ground decides how deep an arrow may stand, and
 *  the scene only fits its width into whatever the ground allows.
 *
 *  Opening values tuned by eye against the map's own scale, not derived. The
 *  map is 1000x1400 user units and a land is roughly 200 across, so a block
 *  of this width is a band standing on the frontier rather than a shape the
 *  size of the land behind it. */
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
};

/** What one border has room for: the whole block of arrows crossing it. This
 *  is the GROUND's capacity and nothing to do with what is crossing - it is
 *  what the scale below is fitted into. */
export function blockWidthFor(span: number): number {
  return Math.max(
    LAYOUT.blockMin, Math.min(LAYOUT.blockMax, span * LAYOUT.blockShare),
  );
}

/** How much width one arrow ASKS for, before the scale is applied.
 *
 *  The square root, so width reads as area: 4 STR is twice a Raid rather than
 *  four times it. Strength is not bounded at 2 - `attackDamageFor` is
 *  `(base + leadership) * omens`, so a war leader holding a few War councils
 *  can send 16 - and anything linear draws that arrow wider than the land it
 *  crosses. Negative and zero are clamped away: this is a width, and a spec
 *  that carries no strength (a claim is `1` by convention) still takes a lane. */
function demandOf(strength: number): number {
  return Math.sqrt(Math.max(strength, 0));
}

/** The width of a 1 STR arrow THIS RENDER, and thereby of every arrow: one
 *  number for the whole map, so `width = unit * sqrt(strength)` everywhere.
 *
 *  **Comparability is a map-wide property and it is only owed to the arrows on
 *  screen together.** Two arrows the player can see at once must be the width
 *  their strengths say, wherever on the map they stand; an arrow that shares
 *  the map with nothing is relative only to itself and may be as large as its
 *  own border allows. So the unit is the most generous one EVERY border can
 *  afford - the smallest of `capacity / demand` over all of them - and a single
 *  arrow on the map is therefore drawn at exactly its own block, the width it
 *  had when the block was split by share alone.
 *
 *  It moves as the board does, which is the deliberate half of the trade: the
 *  same 1 STR raid is narrower on a turn when a cramped border is carrying
 *  three arrows than on a turn when it is not. Widths are read against each
 *  other on one screen, never against a remembered arrow from last turn, and
 *  buying the second would mean a lone raid the size of a Raid on a busy
 *  border - which is the shrunken map this replaced.
 *
 *  Floored at `laneMin`: past that the block overruns its border rather than
 *  every arrow on the map becoming unreadable, the trade `blockMin` already
 *  makes for the ground. No ceiling is needed - `blockWidthFor` has one. */
export function unitWidthFor(
  borders: readonly { span: number; strengths: readonly number[] }[],
): number {
  let unit = LAYOUT.blockMax;
  for (const border of borders) {
    const demand = border.strengths.reduce((s, v) => s + demandOf(v), 0);
    if (demand <= 0) continue;
    unit = Math.min(unit, blockWidthFor(border.span) / demand);
  }
  return Math.max(LAYOUT.laneMin, unit);
}

/** One arrow's width at the render's scale. */
export function laneWidthFor(strength: number, unit: number): number {
  return Math.max(LAYOUT.laneMin, unit * demandOf(strength));
}

export interface Lane {
  /** The caller's own order, which is declaration order. */
  index: number;
  width: number;
  ax: number; ay: number;
  bx: number; by: number;
}

/** Which stations a block of lanes stands on, in the order the lanes were
 *  declared. Shorter than the lane list where the border cannot offer one per
 *  lane; the caller falls back to the tangent for the rest.
 *
 *  Three preferences in a fixed order, and the order is the whole rule.
 *
 *  A lane wants a station it can cross AND one far enough along the border
 *  from every station this block has already taken to fit both arrows beside
 *  each other - half of its own width plus half of its neighbour's. Stations
 *  on this map are routinely a fraction of a unit apart, so nearest-to-my-own-
 *  offset alone put two lanes closer together than their own widths on 364 of
 *  848 lane pairs, the worst pair 24 units into each other: arrows drawn one
 *  on top of the other on a border the block was supposed to be packed along.
 *
 *  Failing that it takes the crossable station nearest its offset anyway, and
 *  failing THAT the roomiest free one, because correctness outranks packing: a
 *  lane must land somewhere it can actually cross from, and a search made to
 *  come after its neighbour unconditionally left 2 of 1,236 lanes with an end
 *  on the wrong land. Two arrows too close together is a picture that reads
 *  badly; one arrow ending on a land it is not about is a picture that lies.
 *
 *  **This is a greedy pass and not an optimal packing**, and the difference is
 *  measurable. 128 of the 1,648 lane pairs still overlap. Most of them are
 *  ground the border does not have - its crossable stations span less than the
 *  lanes need between them, which is the overrun `blockMin` already trades
 *  for - but about 10 are the anchoring: the first lane takes the station
 *  nearest its OWN offset without regard for where that leaves the lanes after
 *  it, and a block shifted a station along would have fitted. `jarvamaa`
 *  against `laanemaa` is one, its lanes 12.75 apart where they want 15, on
 *  stations spanning 20.4.
 *
 *  And every measurement of this rule so far has been made with equal
 *  strengths. A block whose lanes are different widths leaks more - 62 pairs
 *  across both maps overlap on borders that had the room - because the width
 *  a station was chosen against is the width of the lane that chose it, and
 *  the block is dealt out along the border afterwards. That is where to look
 *  first if this ever has to be tightened.
 *
 *  The chosen stations are then dealt out along the border, which costs
 *  nothing: it is the same SET, so the same arrows stand in the same places
 *  and only which arrow stands where changes. */
function stationsForBlock(
  cross: Crossing, offsets: readonly number[], widths: readonly number[],
): Station[] {
  const base = cross.at.x * cross.tangent.x + cross.at.y * cross.tangent.y;
  const taken = new Set<number>();
  const chosen: { station: Station; width: number }[] = [];
  // Both ways, because an arrow has two ends and the short one is not always
  // the end aimed at the target.
  const crossable = (st: Station): boolean =>
    st.into >= ARROW_DEPTHS.min && st.out >= ARROW_DEPTHS.min;
  for (let lane = 0; lane < offsets.length; lane++) {
    const want = base + offsets[lane];
    const width = widths[lane];
    const clear = (st: Station): boolean => chosen.every(
      (other) => Math.abs(st.s - other.station.s) >= (width + other.width) / 2,
    );
    const nearest = (ok: (st: Station) => boolean): number => {
      let found = -1;
      let bestGap = Number.POSITIVE_INFINITY;
      for (let i = 0; i < cross.stations.length; i++) {
        if (taken.has(i) || !ok(cross.stations[i])) continue;
        const gap = Math.abs(cross.stations[i].s - want);
        if (gap < bestGap) {
          bestGap = gap;
          found = i;
        }
      }
      return found;
    };
    let index = nearest((st) => crossable(st) && clear(st));
    if (index < 0) index = nearest(crossable);
    if (index < 0) {
      // Nothing free on this border can take an arrow of the minimum depth.
      // The roomiest free station is still the best place to stand, and the
      // floor in `layoutLanes` decides what gets overrun. Measured, no station
      // table on either map is cramped enough to reach this on a land border,
      // and a sea crossing cannot reach it at all - every one of its stations
      // is `gap / 2 + seaClearance`, which clears the floor by construction.
      // What DOES reach it is a block with more lanes than the border has
      // stations: everything free has been taken, this stays -1, and the block
      // comes back short.
      let bestRoom = -1;
      for (let i = 0; i < cross.stations.length; i++) {
        if (taken.has(i)) continue;
        const room = stationRoom(cross.stations[i]);
        if (room > bestRoom) {
          bestRoom = room;
          index = i;
        }
      }
    }
    if (index < 0) break;
    taken.add(index);
    chosen.push({ station: cross.stations[index], width });
  }
  return chosen.map((c) => c.station).sort((p, q) => p.s - q.s);
}

/** Every arrow crossing one border, side by side along it, at the render's
 *  own scale (`unitWidthFor`).
 *
 *  The block is the SUM of what its arrows are owed rather than a size the
 *  border hands down: the ground decides where the block is centred and, at
 *  one remove through the scale, how wide it may grow - but an arrow's width
 *  is its strength and is the same on every border of the map.
 *
 *  Direction does not sort them: an answering raid stands beside the attack it
 *  answers, in the order the two were declared.
 *
 *  **A lane stands on a station rather than on a straight line.** The tangent
 *  is a global fit and the border bends under it, so a lane offset along that
 *  line is routinely not on the border at all - it is inside one of the two
 *  lands, and no length of arrow drawn from there crosses anything. On a
 *  straight border every station lies on the tangent anyway and nothing moves;
 *  on a bent one the block follows the frontier, which is what an arrow
 *  crossing that frontier should be doing. */
export function layoutLanes(
  cross: Crossing,
  items: readonly { strength: number; forward: boolean }[],
  unit: number,
): Lane[] {
  const widths = items.map((i) => laneWidthFor(i.strength, unit));
  const total = widths.reduce((s, w) => s + w, 0);
  const offsets: number[] = [];
  let cursor = -total / 2;
  for (const width of widths) {
    offsets.push(cursor + width / 2);
    cursor += width;
  }
  const stations = stationsForBlock(cross, offsets, widths);
  const out: Lane[] = [];
  for (let i = 0; i < items.length; i++) {
    const width = widths[i];
    const offset = offsets[i];
    const found = stations[i] ?? null;
    const centre = found?.at ?? {
      x: cross.at.x + cross.tangent.x * offset,
      y: cross.at.y + cross.tangent.y * offset,
    };
    const forward = items[i].forward;
    // A station's `into` is room in the SECOND land whichever way the arrow
    // runs, so a backward lane reads the two the other way round.
    const ahead = found === null
      ? ARROW_DEPTHS.head
      : forward ? found.into : found.out;
    const behind = found === null
      ? ARROW_DEPTHS.tail
      : forward ? found.out : found.into;
    const head = Math.max(ahead, ARROW_DEPTHS.min);
    const tail = Math.max(behind, ARROW_DEPTHS.min);
    const dir = forward ? 1 : -1;
    const nx = cross.normal.x * dir;
    const ny = cross.normal.y * dir;
    out.push({
      index: i, width,
      ax: centre.x - nx * tail, ay: centre.y - ny * tail,
      bx: centre.x + nx * head, by: centre.y + ny * head,
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
    why: "What a march left on the border it crossed, standing for the length of the beat that explains it. Keyed by the landing rather than by any march - a clash retires two arrows and leaves a force that is neither of them - and packed in the same block as the arrows still crossing that border, so it takes a lane beside them instead of being drawn over them.",
  },
};

/** How loud an arrow is drawn. Exactly one applies, chosen in `emphasisFor`.
 *
 *  A scale and not a set of flags, because opacity is one property: it was
 *  four CSS rules on the same element resolved by specificity, which had
 *  already produced a "faded" rival arrow drawn BRIGHTER than an unfaded one,
 *  and starting an aim raised every pin-dimmed arrow back up. What an arrow
 *  looks like is decided here, once, and written as one class. */
export type ArrowEmphasis = "full" | "back" | "dimmed" | "faded";

export const ARROW_EMPHASIS: Record<ArrowEmphasis, {
  className: string;
  why: string;
}> = {
  full: {
    className: "arrow-full",
    why: "Nothing is narrowing the map, or this arrow is the thing being asked about: the one under the pointer, the one landing where the player is aiming, the aim itself, or the landing a beat is explaining.",
  },
  back: {
    className: "arrow-back",
    why: "An aim is live and this arrow is not part of it. Slightly back, because the thing being chosen is the map - but never away, because what is already flying at a land is half of the decision to send an army there.",
  },
  dimmed: {
    className: "arrow-dim",
    why: "A pin has narrowed the map to one realm and this arrow is no business of it. Faint rather than hidden: the board still has to read as a whole while one land is studied.",
  },
  faded: {
    className: "arrow-faded",
    why: "The pointer is resting on another arrow, and that arrow's two lands own the screen for as long as it does.",
  },
};

/** What every surface that can quieten an arrow has to say about it. */
export interface ArrowCues {
  /** A ghost or the aim preview: something happening right now, never
   *  quietened by a question about something else. */
  live: boolean;
  anyFocus: boolean;
  onFocus: boolean;
  pinnedOut: boolean;
  aiming: boolean;
  atAimTarget: boolean;
}

/** The one answer, in one order. A pin beats an aim: the pin is a narrowing the
 *  player asked for and holds, the aim is a question they are in the middle
 *  of.
 *
 *  The two never actually arrive together - the caller (`src/main.ts`) clears
 *  a pin the moment a card is armed or played, so `pinnedOut` and `aiming`
 *  are never both true in practice. The ordering still resolves them as if
 *  they could: `emphasisFor` is a pure function of its cues and answers the
 *  question it is asked, whether or not the caller can currently produce it -
 *  the alternative is a contract that is only honest for the inputs one
 *  caller happens to send today. */
export function emphasisFor(cues: ArrowCues): ArrowEmphasis {
  if (cues.live) return "full";
  if (cues.anyFocus) return cues.onFocus ? "full" : "faded";
  if (cues.pinnedOut) return "dimmed";
  if (cues.aiming) return cues.atAimTarget ? "full" : "back";
  return "full";
}

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
  /** What the width says, through `laneWidthFor`. A claim carries 1: it has no
   *  strength of its own and is one declared thing, so it is drawn at the
   *  width of a single army - which nothing can misread, because its label is
   *  the word SUBJUGATE and never a number. */
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
  /** Turns until this arrow lands, printed on the chip behind the tail.
   *
   *  Left off below `MIN_SHOWN_ARRIVAL`. An army now takes a turn for every
   *  land it crosses, so an arrow standing on a border says nothing about when
   *  it gets there and a three-turn march looks exactly like tomorrow's raid.
   *
   *  On the CHIP and never on the shaft: the shaft carries exactly one number
   *  - see `BARE_NUMBER_WIDTH` - and a second one on it turns the bare "1 STR"
   *  form back into a guess. */
  arrivesIn?: number;
  /** A claim already answered, drawn faded. */
  doomed?: boolean;
  /** This army is walking OVERLAND past lands in between, rather than standing
   *  on a shared border or facing its target across water.
   *
   *  `crossingBetween` has one answer for "these two share no vertex" and it
   *  is a strait, because until an army could march more than one land that
   *  was the only way two lands with no border between them could be at war.
   *  A two- or three-hop march is the other way, and drawn as a strait the
   *  picture says the army is crossing water when it is crossing Latgale.
   *
   *  A dashed casing, `.march-overland` in src/style.css: same shape, same
   *  colour, same width, so whose army it is and how strong stay exactly as
   *  legible - it is the SOLIDITY of the line that says whether the army is on
   *  a frontier or still on the road. It declares no opacity, for the reason
   *  `march-counterable` may not. */
  overland?: boolean;
  /** How loud this arrow is drawn, decided by `emphasisFor` from what the
   *  hover, the pin and a live aim have to say about it.
   *
   *  Carried HERE rather than written onto the element afterwards, because
   *  `dressArrow` states an arrow's whole class attribute and `enter` fades a
   *  new arrow up to the opacity the stylesheet gives it once it is in the
   *  tree. A cue applied after the paint is a cue the fade was not told about:
   *  the arrow rose to full over 220ms and dropped to the dim in the single
   *  frame the fade ended on. */
  emphasis?: ArrowEmphasis;
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

/** The soonest arrival worth printing. Landing next turn is what an arrow used
 *  to mean and is still what most of them mean, so "lands in 1" on every arrow
 *  on the board would be noise over the one case the player has to notice: an
 *  army that is not there yet. */
const MIN_SHOWN_ARRIVAL = 2;

/** How long an arrow takes to arrive, to leave, and to cross to a new lane.
 *
 *  Handed to `runAnimation`, which reports when each is really over. None of
 *  these numbers may be copied into a second timer set to the same length. */
export const ARROW_MOTION_MS = { enter: 220, exit: 260, lane: 200 };

/** Far enough for a lane move to be worth showing. Below it the arrow is
 *  standing where it stood and a slide would be a twitch. */
const LANE_MOVE_MIN = 0.5;

/** Writes an attribute only where it would change.
 *
 *  Every write is guarded, not only the ones that were expensive: a repaint
 *  that changes nothing must touch NOTHING, and an attribute set to the value
 *  it already holds is still a mutation to anything watching the element - a
 *  browser's style invalidation as much as a `MutationObserver`. Retaining the
 *  arrow buys nothing if its whole surface is rewritten under it every
 *  frame. */
const setAttr = (el: Element, name: string, value: string | number): void => {
  const next = String(value);
  if (el.getAttribute(name) !== next) el.setAttribute(name, next);
};

const dropAttr = (el: Element, name: string): void => {
  if (el.hasAttribute(name)) el.removeAttribute(name);
};

const setAttrs = (
  el: Element, attrs: Record<string, string | number>,
): void => {
  for (const [k, v] of Object.entries(attrs)) setAttr(el, k, v);
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
  /** The fade running on it, and at most one: opacity is animated as a
   *  REPLACEMENT, so a second fade would fight the first for the element. The
   *  lane slides are held by nobody - they are additive corrections that each
   *  rest at zero and take themselves off when they finish. */
  fade: { cancel(): void } | null;
}

interface Scene {
  /** The arrows on screen, by the caller's key. A key leaves this the instant
   *  its arrow starts to go, never when the fade ends. */
  held: Map<string, HeldArrow>;
  /** The corpses still fading. They answer to no key any more, and the layout
   *  steps over them rather than counting them as arrows in place. */
  leaving: Set<ChildNode>;
}

/** What each host is holding, per host and not per module: a key means an
 *  arrow in the layer it was drawn into, and says nothing about any other
 *  layer a caller may keep. */
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
    // One arrow per key, and the FIRST spec wins. A key names an element, so a
    // second spec claiming one already drawn this render would hand back an
    // element in neither the retained map nor the leaving set - stranded in the
    // host with nothing left that could ever take it out again.
    if (drawn.has(spec.id)) return;
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
  // Every border resolved BEFORE anything is laid out, because the scale is a
  // fact about the whole map: an arrow's width is decided by what else is on
  // screen with it, so no lane can be placed until every border has said what
  // it is carrying. This is the only reason the render is two passes.
  const crossings: { group: ArrowSpec[]; cross: Crossing; a: string }[] = [];
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
    crossings.push({ group, cross, a });
  }
  // The free arrows are left out of this deliberately: they cross no border,
  // so there is no ground for them to overrun and nothing they could make the
  // rest of the map narrower for.
  const unit = unitWidthFor(crossings.map(({ group, cross }) => ({
    span: cross.span, strengths: group.map((s) => s.strength),
  })));
  for (const { group, cross, a } of crossings) {
    const lanes = layoutLanes(
      cross,
      group.map((s) => ({ strength: s.strength, forward: s.from === a })),
      unit,
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
    // At the render's own scale, like every arrow that DID find a border: a
    // drag over open map is the same play at the same strength, and a fixed
    // width here would have the preview change size the moment it found one.
    draw(spec, {
      index: 0, width: laneWidthFor(spec.strength, unit),
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
      el, kind: spec.kind, ax: lane.ax, ay: lane.ay, fade: null,
    };
    scene.held.set(spec.id, fresh);
    return fresh;
  }
  const dx = kept.ax - lane.ax;
  const dy = kept.ay - lane.ay;
  kept.ax = lane.ax;
  kept.ay = lane.ay;
  if (Math.hypot(dx, dy) >= LANE_MOVE_MIN) {
    // ADDITIVE, and whatever is still sliding is left to finish rather than
    // cancelled. Each slide carries exactly one lane change, from the offset
    // that change left the arrow at down to zero, so several in flight sum to
    // the whole correction and every one of them rests at nothing. Cancelled
    // instead, a slide interrupted by a second lane change took its own offset
    // off the element in one frame - the arrow snapped back to where it had
    // been before the lane it was leaving - because the replacement is
    // computed from lane to lane and knows nothing of where the element
    // visually stands. Reachable by dragging an aim across two borders, which
    // re-packs the block under it on every pointer move.
    transition(el, [
      { transform: `translate(${dx}px, ${dy}px)`, composite: "add" },
      { transform: "translate(0px, 0px)", composite: "add" },
    ], ARROW_MOTION_MS.lane);
  }
  return kept;
}

/** Runs one transition and hands the element back to the stylesheet when it is
 *  over.
 *
 *  A filled animation outranks every rule in the stylesheet for as long as it
 *  is alive, and an arrow's opacity is the stylesheet's business - full,
 *  dimmed, faded or back, whatever its `emphasis` class declares. An enter
 *  fade left filling would pin it at whatever it ended on. */
function transition(
  el: Element, frames: Keyframe[], ms: number, onDone?: () => void,
): { cancel(): void } {
  const handle = runAnimation(el, frames, ms, () => {
    handle.cancel();
    onDone?.();
  });
  return handle;
}

/** The opacity the element shows RIGHT NOW, which is a fade running on it if
 *  one is, and otherwise the one the stylesheet gives it.
 *
 *  Which of the two a caller gets is decided by when it asks: a filled
 *  animation outranks the stylesheet while it is alive, so `enter` cancels its
 *  own fade before asking and gets the resting value, and `retire` asks before
 *  cancelling and gets the value on screen.
 *
 *  Read off the element rather than assumed to be 1 either way: fading an
 *  already-dimmed arrow up to full and dropping it back down is a flash on
 *  every arrow whose resting opacity is not full, and an arrow retired while
 *  it is still arriving - a counter declared and the turn ended behind it -
 *  would be snapped up to full before being faded out. */
function currentOpacity(el: Element): number {
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
    [{ opacity: 0 }, { opacity: currentOpacity(held.el) }],
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
  // Where it is NOW, read before the fade that may be putting it there is
  // cancelled: an arrow told to leave while it is still arriving carries on
  // from the opacity it had reached rather than being pulled up to full first.
  const from = currentOpacity(held.el);
  held.fade?.cancel();
  const el = held.el;
  // Out of hit-testing at once. A corpse answers to no key, so a click or a
  // hover it took would be about an arrow that is no longer there. Inline
  // because `.march-arrow` claims `pointer-events: auto` from the stylesheet.
  el.style.pointerEvents = "none";
  scene.leaving.add(el);
  held.fade = transition(
    el, [{ opacity: from }, { opacity: 0 }],
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
  for (const [k, v] of Object.entries(data)) {
    if (g.dataset[k] !== v) g.dataset[k] = v;
  }
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
    setAttr(poly, "points", points);
    if (spec.fill !== undefined) setAttr(poly, "fill", spec.fill);
    else dropAttr(poly, "fill");
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
    setAttr(ring, "class", "claim-head");
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
    setAttr(text, "class", def.labelClass);
    if (spec.kind !== "claim") setAttr(text, "dominant-baseline", "middle");
    else dropAttr(text, "dominant-baseline");
    const words = spec.kind !== "claim" && lane.width < BARE_NUMBER_WIDTH
      ? spec.label.replace(/ STR$/, "")
      : spec.label;
    if (text.textContent !== words) text.textContent = words;
  }

  const chipLabel = chipTextFor(spec);
  if (chipLabel !== null) {
    // Behind the tail, outside the block. On the shaft the chips collide as
    // soon as a border carries three arrows, and a chip over the head reads
    // as part of the arrowhead.
    const at = pointAlong(
      lane.ax, lane.ay, lane.bx, lane.by,
      -0.18 - (lane.index % LABEL_STATIONS.length) * 0.14,
    );
    const label = chipLabel;
    const width = 12 + label.length * 5.6;
    const chip = ensure(g, used++, "g");
    setAttr(chip, "class", "march-order");
    const bg = ensure(chip, 0, "rect");
    setAttrs(bg, {
      x: at.x - width / 2, y: at.y - 9, width, height: 15, rx: 7.5,
    });
    setAttr(bg, "class", "march-order-bg");
    const text = ensure(chip, 1, "text");
    setAttrs(text, { x: at.x, y: at.y + 2 });
    setAttr(text, "class", "march-order-text");
    if (text.textContent !== label) text.textContent = label;
    trim(chip, 2);
  }
  trim(g, used);

  // Set whole rather than toggled, so a class another surface put on the arrow
  // - the counter cue, the aim's own validity - is gone by the time that
  // surface is asked again. An arrow's classes say what it IS this render,
  // which is why every cue that decides how the arrow LOOKS is on the spec:
  // there is nothing left for a later pass to add, and so nothing the enter
  // fade can be aimed past.
  const classes = [def.className, `march-${spec.tone}`];
  if (spec.doomed === true) classes.push("claim-doomed");
  if (spec.overland === true) classes.push("march-overland");
  classes.push(ARROW_EMPHASIS[spec.emphasis ?? "full"].className);
  setAttr(g, "class", classes.join(" "));
  applyDataset(g, spec.dataset ?? {});
  return true;
}

/** Everything the chip behind the tail says, or null where it would say
 *  nothing: where this arrow comes in the race for its target, whether it is
 *  locked in a clash, and how far off its own arrival is.
 *
 *  One chip carrying all of it rather than a second badge beside it. They sit
 *  behind the tail, outside the block, and two of them there would collide on
 *  any border carrying three arrows - which is the reason the ordinal is not
 *  on the shaft in the first place. Every number here is spelled with a word
 *  next to it, so nothing on the chip can be read as a strength. */
function chipTextFor(spec: ArrowSpec): string | null {
  const parts: string[] = [];
  if (spec.chip !== undefined) {
    parts.push(spec.chip.clash
      ? `${ordinal(spec.chip.order)} - clash` : ordinal(spec.chip.order));
  }
  if (spec.arrivesIn !== undefined && spec.arrivesIn >= MIN_SHOWN_ARRIVAL) {
    parts.push(`lands in ${spec.arrivesIn}`);
  }
  return parts.length === 0 ? null : parts.join(" - ");
}

/** "1st", "2nd", "3rd", "4th" - the landing order in words, so the number can
 *  never be read as a strength. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
