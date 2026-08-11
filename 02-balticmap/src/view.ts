import {
  fullRealmOf, realmRootOf, type Incorporated, type Overlords,
} from "./relations";
import { faction, t, type Segment } from "./segments";
import type { StandingChange } from "./standings";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far past the exact whole-map fit the default view sits, so every land
 *  is on screen inside a band of the ground around it. */
export const DEFAULT_RING = 0.12;
export const MAX_ZOOM = 8;

/** How far real baked geography is shown past the canvas, as a fraction of
 *  the canvas's own width and height on every side. This is the surround's
 *  hole now (see `visibleRectOf`), not the canvas itself - so it is the one
 *  number that decides how much of the map's baked ground the player ever
 *  sees beyond the playable lands themselves. Measured clean on the Baltic
 *  map's south and east edges (0% uncovered) after the neighbour bake in
 *  scripts/prepare-data.mjs picked up Ukraine, Czechia, Slovakia, Hungary,
 *  Austria and Moldova; see docs/superpowers for the probe that pinned it. */
export const VISIBLE_RING = 0.3;

/** The canvas outset by `VISIBLE_RING` on every side - what the surround
 *  leaves a hole over. Exported for the same reason `frameRectOf` is: the
 *  renderer punches this hole and the view rules must not spell the same
 *  rect a second way. */
export function visibleRectOf(map: { width: number; height: number }): View {
  const rw = map.width * VISIBLE_RING;
  const rh = map.height * VISIBLE_RING;
  return { x: -rw, y: -rh, w: map.width + 2 * rw, h: map.height + 2 * rh };
}

/** How far the frame sits past the canvas, as a fraction of the canvas's own
 *  width and height on every side. Past `VISIBLE_RING` (with a thin matte
 *  band between the two), so the frame reads as a deliberate border around
 *  real surrounding geography rather than as the edge of the bake itself. */
export const FRAME_RING = 0.35;

/** The most background the player may ever see beyond the frame, in screen
 *  pixels, on the axis the frame binds - see the doc comment on `maxW` for
 *  which axis that is. */
export const MAX_SURROUND_PX = 200;

/** The canvas outset by `FRAME_RING` on every side. Exported so the renderer
 *  (the hole it knocks out of the opaque surround, and the stroke that marks
 *  the edge) and the view rules (the zoom-out floor, the pan bound) answer
 *  the same question once - two spellings of this rect is how they drift. */
export function frameRectOf(map: { width: number; height: number }): View {
  const rw = map.width * FRAME_RING;
  const rh = map.height * FRAME_RING;
  return { x: -rw, y: -rh, w: map.width + 2 * rw, h: map.height + 2 * rh };
}

/** One row of the victory scoreboard. */
export interface StandingRow {
  factionId: string;
  lands: number;
  needed: number;
  /** Whole percent of the way to victory, floored, capped at 100. */
  percent: number;
  isHuman: boolean;
}

/** The scoreboard: one row per faction that ACTS, best realm first.
 *
 *  Every player fits now - five of them, not twenty-six factions - so there is
 *  no top-N cut and no separate row for a human who fell outside it. A land
 *  that takes no turns gets no row: it is ground to be taken, not a
 *  contender, and twenty-one rows of 1/13 would bury the five that matter.
 *
 *  Only factions that could actually win are ranked, which is the same test
 *  the victory check applies - not incorporated. A vassal stays in the
 *  ranking because the rules let one win.
 *
 *  Ties on land count resolve by seat order: `acting` arrives in seat order
 *  and `sort` is stable, so equal realms keep a fixed order and the board does
 *  not reshuffle itself from one turn to the next. */
export function standingsFor(args: {
  acting: string[];
  humanFactionId: string | undefined;
  realmSize(factionId: string): number;
  incorporated: Incorporated;
  /** Per faction, and shaped like `realmSize` beside it for the same reason:
   *  one number cannot serve a board where a player holding out for the whole
   *  map is ranked against rivals who still need only half. */
  needed(factionId: string): number;
}): StandingRow[] {
  const { acting, humanFactionId, realmSize, incorporated, needed } = args;
  const pct = (lands: number, bar: number): number =>
    Math.min(100, Math.floor((lands / bar) * 100));
  return acting
    .filter((f) => !(f in incorporated))
    .sort((a, b) => realmSize(b) - realmSize(a))
    .map((factionId) => ({
      factionId,
      lands: realmSize(factionId),
      needed: needed(factionId),
      percent: pct(realmSize(factionId), needed(factionId)),
      isHuman: factionId === humanFactionId,
    }));
}

export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}

/** "A", "A and B", "A, B and C" over faction NODES. Its own spelling rather
 *  than `joinSegments` from rich-text.ts: that module imports this one for
 *  `withArticle`, and reaching back would close a cycle for four lines of
 *  comma. */
function andFactions(ids: string[]): Segment[] {
  return ids.flatMap((id, i) => {
    if (i === 0) return [faction(id)];
    return [t(i === ids.length - 1 ? " and " : ", "), faction(id)];
  });
}

/** Every land under this one, named - vassals to any depth and everything
 *  anyone in the pyramid has annexed. Null when it holds nothing.
 *
 *  `fullRealmOf`, because this answers "how much of the map comes with it",
 *  which is the `fullRealmOf` question the AGENTS.md rule names: the scoreboard
 *  and the win condition will count exactly this set.
 *
 *  For the faction picker, where a region may open with realms already standing
 *  and nothing else on that screen says so - the ownership fills, the union
 *  outlines and the vassal stripes are all gated on the game being in play, so
 *  a map showing twenty-four separate colours would let somebody choose between
 *  a realm of five and a land of one without being told which was which. The
 *  in-play hover needs no such line: by then the realm is drawn. */
export function realmHoldingLine(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Segment[] | null {
  const under = [...fullRealmOf(factionId, overlords, incorporated)]
    .filter((id) => id !== factionId)
    .sort();
  if (under.length === 0) return null;
  return [t("Brings with it "), ...andFactions(under)];
}

/** How a polygon stands to the human, from the polygon's OWN faction id.
 *
 *  Pass the polygon's own faction, never the politically resolved one: an
 *  incorporated land resolves to its absorber, whose own `incorporated` entry
 *  is empty, so resolving first makes the absorption invisible and the land
 *  reads as independent. Leads still come from the resolved faction - an
 *  absorbed land has no relations of its own - but its allegiance does not.
 *
 *  `humanFactionId` is null for a hover with no seat behind it - the faction
 *  picker's, on a map that opens with realms already standing. Every "yours"
 *  branch below is an equality against it, so null simply spells the same
 *  fealty in the third person, which is the one thing the picker can honestly
 *  say. A second function for it would be the same sentences twice.
 *
 *  Null when the land answers to nobody. The map hover shows this line only
 *  when somebody holds the land, so it needs the absence as a value rather
 *  than as a string it would have to compare against. */
export function relationshipLine(
  polygonFactionId: string,
  humanFactionId: string | null,
  overlords: Overlords,
  incorporated: Incorporated,
): Segment[] | null {
  const owner = incorporated[polygonFactionId];
  const lord = overlords.get(polygonFactionId);
  // The chain can run deeper than one link. Name the direct lord and, when
  // the chain's root is somebody further up, the root - the two ends are what
  // the player can act on; spelling every middle link is noise.
  const ultimately = (of: string): Segment[] => {
    const root = realmRootOf(of, overlords, incorporated);
    const direct = overlords.get(of);
    if (direct === undefined || root === direct) return [];
    return root === humanFactionId
      ? [t(", ultimately your vassal")]
      : [t(", ultimately a vassal of "), faction(root)];
  };
  if (owner === humanFactionId) return [t("Part of your realm (incorporated)")];
  if (owner !== undefined) {
    // Follow the chain. Every land of a vassal's realm carries the overlord's
    // stripes, so naming only the absorber leaves the stripes unexplained and
    // makes one realm read as two unrelated stories.
    const ownersLord = overlords.get(owner);
    const suffix: Segment[] =
      ownersLord === undefined
        ? []
        : ownersLord === humanFactionId
          ? [t(", itself your vassal")]
          : [t(", itself a vassal of "), faction(ownersLord)];
    return [
      t("Incorporated into "), faction(owner), ...suffix, ...ultimately(owner),
    ];
  }
  // Who this land holds, on top of who holds it. Without it the fealty only
  // ever read one way: a vassal's hover named its lord while the lord's own
  // hover said nothing back, so the land carrying the stripes everybody else
  // wears was the one land that never explained them. The human is left out -
  // "Your overlord" below already says that better than a name in a list would.
  const held = [...overlords]
    .filter(([v, l]) => l === polygonFactionId && v !== humanFactionId && !(v in incorporated))
    .map(([v]) => v)
    .sort();
  const holds: Segment[] | null =
    held.length > 0
      ? [t("overlord of "), ...andFactions(held)]
      : null;
  if (lord === humanFactionId) {
    return holds === null ? [t("Your vassal")] : [t("Your vassal, "), ...holds];
  }
  if (
    humanFactionId !== null &&
    overlords.get(humanFactionId) === polygonFactionId
  ) {
    // The human is deliberately absent from `held`, so this reads as "yours and
    // theirs" rather than repeating you back at yourself.
    return holds === null
      ? [t("Your overlord")]
      : [t("Your overlord, and "), ...holds];
  }
  if (lord === undefined) {
    // Capitalized by hand: the run starts with a common noun here and with a
    // name everywhere else, and a name is a node whose text nobody may edit.
    return holds === null ? null : [t("Overlord of "), ...holds.slice(1)];
  }
  return [
    t("Vassal of "), faction(lord), ...ultimately(polygonFactionId),
    ...(holds === null ? [] : [t(", "), ...holds]),
  ];
}

/** The faction whose OWN polygon holds this land: the realm that absorbed it,
 *  or the overlord it owes fealty to. Null when it answers to nobody.
 *
 *  Deliberately the immediate holder, not the top of the chain: hovering a
 *  land marks one polygon - who took this - while the tooltip spells out any
 *  further fealty above it. */
export function holderOf(
  polygonFactionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string | null {
  return incorporated[polygonFactionId] ?? overlords.get(polygonFactionId) ?? null;
}

/** "the Ugandians", but "Lietuva" - the one faction named for a land rather
 *  than a people takes no article. Both the activity log and the notices use
 *  this, so the two surfaces cannot drift apart. */
export function withArticle(name: string, placeName: boolean): string {
  return placeName ? name : `the ${name}`;
}

/** "Defense 6 -> 5 (-1)" / "Disease 2 -> 3 (+1)" for the round summary and
 *  the activity log: where the score stood, where it landed, and the movement
 *  in brackets. One spelling for both surfaces, so they cannot quote different
 *  numbers for the same event. ASCII "->", never a unicode arrow: nothing in
 *  this codebase uses one.
 *
 *  The arrow used to run from the DELTA to the after ("Defense -1 -> 5"),
 *  which reads as a score that went from -1 to 5. Nobody noticed while every
 *  number was a round hundred and the delta was obviously not a score; a
 *  "-0.75 -> 0.75" on the smaller scale made it plain that the arrow was
 *  pointing between two different kinds of thing. */
export function standingChangeText(c: StandingChange): string {
  const delta = c.after - c.before;
  const signed = delta > 0 ? `+${delta}` : `${delta}`;
  const track = c.track === "defense" ? "Defense" : "Disease";
  return `${track} ${c.before} -> ${c.after} (${signed})`;
}

/** The tone of a score movement as the HUMAN reads it: their polygon losing
 *  defense is bad, a rival's losing it is pressure working. The caller says
 *  whose side the moved score sits on; the classes only name the tone - each
 *  surface declares what the tone looks like against its own background. */
export function leadClass(delta: number): string {
  return delta > 0 ? "lead-good" : delta < 0 ? "lead-bad" : "lead-even";
}

/** Everything a view is allowed to be, for one map in one viewport.
 *
 *  `base` used to answer all three questions at once - what may be panned
 *  over, how wide a view may get, how narrow. They have different answers
 *  now: the widest view is bounded by the painted ground and the narrowest by
 *  the map the player plays on, so a deeper floor must not silently deepen
 *  the ceiling too. */
export interface ViewBounds {
  /** The painted rect: canvas plus margin. What baked ground exists to be
   *  drawn at all - the outright ceiling `maxW` may never exceed, even where
   *  the frame-derived cap below would allow more. */
  outer: View;
  /** The canvas outset by FRAME_RING - see `frameRectOf`. What the surround
   *  leaves a hole over, and what the zoom-out floor and the pan bound are
   *  measured against instead of `outer`: the painted margin exists to hide
   *  baking seams, not to be a place the player can zoom or pan out into. */
  frame: View;
  /** Widest allowed view width. Ordinarily the width at which `frame` is
   *  fully visible with at most `MAX_SURROUND_PX` of background beyond it on
   *  each side of the axis `frame` binds on - vertical for a portrait frame
   *  in a landscape viewport, since that is the axis with no slack left once
   *  `frame`'s own shape is fit into the viewport's. The other axis is
   *  whatever width that implies, which can be far more than
   *  `MAX_SURROUND_PX` of background - wide empty bands either side of a
   *  portrait plate in a landscape window - and that is accepted rather than
   *  fought, because a portrait frame cannot fill a landscape viewport
   *  without either cropping content or doing exactly that.
   *
   *  Never past `outer`: on a viewport shape where the frame-derived number
   *  would be LARGER than the old painted-rect ceiling, `outer` wins, so this
   *  field only ever pulls the floor in from the painted-rect number, never
   *  out past it. */
  maxW: number;
  /** Narrowest allowed view width: the default view over MAX_ZOOM. */
  minW: number;
  /** Viewport aspect as height over width. */
  aspect: number;
  /** What a fresh load shows: the whole canvas plus DEFAULT_RING, centered. */
  home: View;
  /** Map units equivalent to `MAX_SURROUND_PX` screen pixels at this view's
   *  own zoomed-out floor (`maxW`). The pan bound pads `frame` by this on
   *  each axis - see `clampAxisToFrame` - rather than by a live per-frame
   *  conversion, so a fixed budget survives a zoom change mid-pan instead of
   *  loosening as the player zooms in. */
  panAllowance: number;
}

/** Clamp a view's origin into `outer`, leaving its size untouched. Used only
 *  for the default view's centering now - the general pan clamp below
 *  answers a different question (frame plus a fixed allowance, not the whole
 *  painted rect) because the two used to be the same rect and a pan could
 *  then coast into a field of blank margin the surround exists to hide. */
function clampInto(view: View, outer: View): View {
  const x = Math.min(Math.max(view.x, outer.x), outer.x + outer.w - view.w);
  const y = Math.min(Math.max(view.y, outer.y), outer.y + outer.h - view.h);
  return { ...view, x, y };
}

/** Clamp one axis into `[start - allowance, start + size + allowance - extent]`
 *  - except when `extent` (the view's own size on this axis) does not fit
 *  even with the allowance added on both sides. There is nothing out there to
 *  pan to in that case, so the axis centres on the bound instead of pinning
 *  to whichever edge `pos` happens to be closest to; a plain clamp would give
 *  the wide-empty-bands axis (see `ViewBounds.maxW`) an arbitrary lopsided
 *  rest position rather than the symmetric one the player actually sees at
 *  the default view. */
function clampAxisToFrame(
  pos: number, extent: number, start: number, size: number, allowance: number,
): number {
  if (extent > size + 2 * allowance) return start + size / 2 - extent / 2;
  const lo = start - allowance;
  const hi = start + size + allowance - extent;
  return Math.min(Math.max(pos, lo), hi);
}

/** The view rules for one map in one viewport: the frame (pan and zoom-out
 *  bound, padded by a small allowance), the default view (whole canvas plus
 *  a ring, centered), and the zoom-in ceiling (the default over MAX_ZOOM, not
 *  the floor - see the doc comment on `ViewBounds`). */
export function viewBoundsOf(
  map: { width: number; height: number; margin: number },
  vpW: number, vpH: number,
): ViewBounds {
  const aspect = vpH / vpW;
  const outer: View = {
    x: -map.margin, y: -map.margin,
    w: map.width + 2 * map.margin, h: map.height + 2 * map.margin,
  };
  const paintedMaxW = Math.min(outer.w, outer.h / aspect);

  const frame = frameRectOf(map);
  // Whether fitting frame's own shape into the viewport's shape leaves no
  // slack vertically (true) or horizontally (false) - the same comparison
  // `fitW` below makes for the canvas, just against `frame` instead.
  const verticalBinds = frame.h / aspect >= frame.w;
  const surroundSpan = 2 * MAX_SURROUND_PX;
  // Guarded: below this many pixels on the binding axis, the divisor would
  // be zero or negative - a window too small for a 200px margin on both
  // sides to mean anything - so the frame-derived cap is skipped and the
  // painted-rect ceiling stands alone.
  const frameMaxW = verticalBinds
    ? vpH > surroundSpan ? (frame.h * vpW) / (vpH - surroundSpan) : null
    : vpW > surroundSpan ? (frame.w * vpW) / (vpW - surroundSpan) : null;
  // Only ever pulls the floor IN: a viewport shape where the frame-derived
  // number comes out bigger than the painted rect leaves the old ceiling
  // standing, per the doc comment on `ViewBounds.maxW`.
  const maxW = frameMaxW === null ? paintedMaxW : Math.min(paintedMaxW, frameMaxW);
  const panAllowance = (MAX_SURROUND_PX * maxW) / vpW;

  // Smallest viewport-shaped rect that COVERS the canvas, then the ring.
  const fitW = Math.max(map.width, map.height / aspect);
  const homeW = Math.min(fitW * (1 + DEFAULT_RING), maxW);
  const homeH = homeW * aspect;
  const home = clampInto(
    {
      x: map.width / 2 - homeW / 2, y: map.height / 2 - homeH / 2,
      w: homeW, h: homeH,
    },
    outer,
  );
  return { outer, frame, maxW, minW: homeW / MAX_ZOOM, aspect, home, panAllowance };
}

/** The one statement of the zoom bounds: a view width no narrower than
 *  `b.minW` and no wider than `b.maxW`. */
function clampW(w: number, b: ViewBounds): number {
  return Math.min(Math.max(w, b.minW), b.maxW);
}

/** Clamp zoom to [minW, maxW] and keep the view within `frame` plus
 *  `panAllowance` on each axis - never the whole painted rect, or a pan could
 *  coast out past the frame into the blank ground the surround exists to
 *  hide. */
export function clampView(view: View, b: ViewBounds): View {
  const w = clampW(view.w, b);
  const h = w * b.aspect;
  const x = clampAxisToFrame(view.x, w, b.frame.x, b.frame.w, b.panAllowance);
  const y = clampAxisToFrame(view.y, h, b.frame.y, b.frame.h, b.panAllowance);
  return { x, y, w, h };
}

export function panBy(view: View, b: ViewBounds, dxPx: number, dyPx: number, vpW: number): View {
  const unitsPerPx = view.w / vpW;
  return clampView(
    { ...view, x: view.x - dxPx * unitsPerPx, y: view.y - dyPx * unitsPerPx },
    b,
  );
}

/** factor > 1 zooms in; (px, py) is the cursor position in viewport pixels. */
export function zoomAt(
  view: View,
  b: ViewBounds,
  px: number,
  py: number,
  factor: number,
  vpW: number,
  vpH: number,
): View {
  const cx = view.x + (px / vpW) * view.w;
  const cy = view.y + (py / vpH) * view.h;
  // Clamp the width BEFORE deriving the origin. Derived from the unclamped
  // width, the origin keeps the cursor point fixed for a zoom the width clamp
  // then refuses - at the ceiling every wheel tick became a sideways pan.
  const w = clampW(view.w / factor, b);
  const h = w * b.aspect;
  return clampView(
    { x: cx - (px / vpW) * w, y: cy - (py / vpH) * h, w, h },
    b,
  );
}
