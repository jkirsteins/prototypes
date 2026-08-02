import { realmRootOf, type Incorporated, type Overlords } from "./relations";
import type { TrackBars } from "./playability";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 8;

/** The most zoomed-out view allowed, as a factor of the whole-map fit.
 *  Above 1 the whole map never fits on screen and the player pans instead,
 *  so lands keep their size as the map grows. Measured against the map
 *  before the Prussian lands were added: extending it shrank every land to
 *  0.840 of its old canvas size, so 1.3 leaves them 9 percent larger than
 *  they were rather than 16 percent smaller. */
export const MIN_ZOOM = 1.3;

/** How many contenders the scoreboard ranks. The human gets a further row when
 *  they fall outside it, so the board can show one more than this. */
export const SCOREBOARD_ROWS = 3;

/** One row of the victory scoreboard. */
export interface StandingRow {
  factionId: string;
  lands: number;
  needed: number;
  /** Whole percent of the way to victory, floored, capped at 100. */
  percent: number;
  isHuman: boolean;
  /** Standing Might per turn this realm earns from its annexed lands. Only
   *  ever set for the human's own row: a rival's garrison strength is not
   *  something the player is told outright, they read it off the Might lead. */
  passivePerTurn?: number;
}

/** The scoreboard: the top three contenders, plus the human's own row when the
 *  human is outside that three. Four rows at most.
 *
 *  Three rather than the full 26: a complete ranking is noise, but a single
 *  leader hides the shape of the endgame. Two rivals within a land of each
 *  other is a different board from one runaway, and that difference is what
 *  tells a player whether to attack the front or wait.
 *
 *  Only factions that could actually win are ranked, which is the same test the
 *  victory check applies - not incorporated. A vassal stays in the ranking
 *  because the rules let one win.
 *
 *  Ties on land count resolve by `factionIds` order: `contenders` is built by
 *  filtering `factionIds`, and `sort` is stable, so equal realms keep a fixed
 *  order and the board does not reshuffle itself from one turn to the next. */
export function standingsFor(args: {
  factionIds: string[];
  humanFactionId: string | undefined;
  realmSize(factionId: string): number;
  incorporated: Incorporated;
  needed: number;
  passiveFor(factionId: string): number;
}): StandingRow[] {
  const { factionIds, humanFactionId, realmSize, incorporated, needed } = args;
  const pct = (lands: number): number =>
    Math.min(100, Math.floor((lands / needed) * 100));
  const row = (factionId: string): StandingRow => ({
    factionId,
    lands: realmSize(factionId),
    needed,
    percent: pct(realmSize(factionId)),
    isHuman: factionId === humanFactionId,
    ...(factionId === humanFactionId
      ? { passivePerTurn: args.passiveFor(factionId) }
      : {}),
  });
  const contenders = factionIds.filter((f) => !(f in incorporated));
  if (contenders.length === 0) return [];
  const top = [...contenders]
    .sort((a, b) => realmSize(b) - realmSize(a))
    .slice(0, SCOREBOARD_ROWS);
  const rows = top.map(row);
  if (humanFactionId !== undefined && !top.includes(humanFactionId)) {
    rows.push(row(humanFactionId));
  }
  return rows;
}

export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}

/** "A", "A and B", "A, B and C". Plain text, not segments: these tooltip lines
 *  have always been plain (`Vassal of ${name}` above it), and the segment rule
 *  in AGENTS.md governs the prose that renders through `renderSegments`. */
function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** How a polygon stands to the human, from the polygon's OWN faction id.
 *
 *  Pass the polygon's own faction, never the politically resolved one: an
 *  incorporated land resolves to its absorber, whose own `incorporated` entry
 *  is empty, so resolving first makes the absorption invisible and the land
 *  reads as independent. Leads still come from the resolved faction - an
 *  absorbed land has no relations of its own - but its allegiance does not.
 *
 *  Null when the land answers to nobody. The map hover shows this line only
 *  when somebody holds the land, so it needs the absence as a value rather
 *  than as a string it would have to compare against. */
export function relationshipLine(
  polygonFactionId: string,
  humanFactionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
  factionName: (id: string) => string,
): string | null {
  const owner = incorporated[polygonFactionId];
  const lord = overlords.get(polygonFactionId);
  // The chain can run deeper than one link. Name the direct lord and, when
  // the chain's root is somebody further up, the root - the two ends are what
  // the player can act on; spelling every middle link is noise.
  const ultimately = (of: string): string => {
    const root = realmRootOf(of, overlords, incorporated);
    const direct = overlords.get(of);
    if (direct === undefined || root === direct) return "";
    return root === humanFactionId
      ? ", ultimately your vassal"
      : `, ultimately a vassal of ${factionName(root)}`;
  };
  if (owner === humanFactionId) return "Part of your realm (incorporated)";
  if (owner !== undefined) {
    // Follow the chain. Every land of a vassal's realm carries the overlord's
    // stripes, so naming only the absorber leaves the stripes unexplained and
    // makes one realm read as two unrelated stories.
    const ownersLord = overlords.get(owner);
    const suffix =
      ownersLord === undefined
        ? ""
        : ownersLord === humanFactionId
          ? ", itself your vassal"
          : `, itself a vassal of ${factionName(ownersLord)}`;
    return `Incorporated into ${factionName(owner)}${suffix}${ultimately(owner)}`;
  }
  // Who this land holds, on top of who holds it. Without it the fealty only
  // ever read one way: a vassal's hover named its lord while the lord's own
  // hover said nothing back, so the land carrying the stripes everybody else
  // wears was the one land that never explained them. The human is left out -
  // "Your overlord" below already says that better than a name in a list would.
  const held = [...overlords]
    .filter(([v, l]) => l === polygonFactionId && v !== humanFactionId && !(v in incorporated))
    .map(([v]) => factionName(v))
    .sort();
  const holds = held.length > 0 ? `overlord of ${andList(held)}` : null;
  if (lord === humanFactionId) {
    return holds === null ? "Your vassal" : `Your vassal, ${holds}`;
  }
  if (overlords.get(humanFactionId) === polygonFactionId) {
    // The human is deliberately absent from `held`, so this reads as "yours and
    // theirs" rather than repeating you back at yourself.
    return holds === null ? "Your overlord" : `Your overlord, and ${holds}`;
  }
  if (lord === undefined) {
    return holds === null ? null : capitalize(holds);
  }
  return holds === null
    ? `Vassal of ${factionName(lord)}${ultimately(polygonFactionId)}`
    : `Vassal of ${factionName(lord)}${ultimately(polygonFactionId)}, ${holds}`;
}

/** Is this land a vassal of the human's that is holding a live Revolt? The card
 *  sits in its deck, hand or discard from the turn it sows Seeds of revolt
 *  until it plays it, and `liveRevolts` is how the rules already track that -
 *  Seeds of revolt reads the same list to refuse sowing a second one.
 *
 *  Only the human's DIRECT vassals. A rival's restive vassal is not the
 *  player's business and would fill the map with other people's problems, and
 *  a vassal of your vassal walks out on them, not on you.
 *
 *  Here rather than in main.ts, where the map badge and the hover both want it,
 *  because a predicate the tests cannot reach is a predicate nobody checks. */
export function restiveVassalOf(
  polygonFactionId: string,
  humanFactionId: string,
  overlords: Overlords,
  liveRevolts: readonly string[],
): boolean {
  return (
    overlords.get(polygonFactionId) === humanFactionId &&
    liveRevolts.includes(polygonFactionId)
  );
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

/** One track for a map badge: "M+2" on its own, "M+2/4" against a bar to
 *  clear. Zero is unsigned; the bar is omitted when no requirement applies. */
export function formatLead(
  label: string,
  n: number,
  required?: number | null,
): string {
  const value = n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`;
  return required == null
    ? `${label}${value}`
    : `${label}${value}/${required}`;
}

/** "Might +1 -> 0" for the round summary: both numbers are the human's signed
 *  lead over the other side, direction included - the same convention as the
 *  map badges and the scoreboard. ASCII "->", never a unicode arrow: nothing
 *  in this codebase uses one. */
export function standingChangeText(c: { track: "might" | "status"; before: number; after: number }): string {
  const label = c.track === "might" ? "Might" : "Status";
  return `${label} ${formatLead("", c.before)} -> ${formatLead("", c.after)}`;
}

/** The sign colour of a standing value: positive is yours to press, negative is
 *  theirs, zero is neither. One scale for the map badges, the activity log, the
 *  round summary and the hover, so a number never changes meaning by moving
 *  between them. The classes only name the tone - each surface declares what
 *  the tone looks like against its own background. */
export function leadClass(n: number): string {
  return n > 0 ? "lead-good" : n < 0 ? "lead-bad" : "lead-even";
}

/** How to say a pair of per-track bars in one clause. Collapses to a single
 *  number while nothing is built, which is the common case and the shorter
 *  read: the bars only diverge once a settlement raises the Might one. */
export function barPhrase(bars: TrackBars): string {
  return bars.might === bars.status
    ? `${bars.might}`
    : `${bars.might} in Might or ${bars.status} in Status`;
}

/** Smallest view that covers the whole map, centered, with the viewport's aspect. */
export function fitView(mapW: number, mapH: number, vpW: number, vpH: number): View {
  const unitsPerPx = Math.max(mapW / vpW, mapH / vpH);
  const w = vpW * unitsPerPx;
  const h = vpH * unitsPerPx;
  return { x: (mapW - w) / 2, y: (mapH - h) / 2, w, h };
}

/** Clamp zoom to [MIN_ZOOM, MAX_ZOOM] relative to base and keep the view
 *  inside base. */
export function clampView(view: View, base: View): View {
  const w = Math.min(Math.max(view.w, base.w / MAX_ZOOM), base.w / MIN_ZOOM);
  const h = w * (base.h / base.w);
  const x = Math.min(Math.max(view.x, base.x), base.x + base.w - w);
  const y = Math.min(Math.max(view.y, base.y), base.y + base.h - h);
  return { x, y, w, h };
}

/** The starting view: the zoom floor, centered on the map.
 *
 *  Centering has to be explicit. `clampView(base, base)` shrinks the view to
 *  the floor but leaves its top-left pinned to base's, and base's top-left is
 *  the corner of the letterboxed fit - negative on the axis that does not
 *  bind. In a window wider than the map's aspect that pinned the view against
 *  the west sea and cut the eastern lands off screen. */
export function homeView(base: View): View {
  const w = base.w / MIN_ZOOM;
  const h = base.h / MIN_ZOOM;
  return clampView(
    { x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2, w, h },
    base,
  );
}

export function panBy(view: View, base: View, dxPx: number, dyPx: number, vpW: number): View {
  const unitsPerPx = view.w / vpW;
  return clampView(
    { ...view, x: view.x - dxPx * unitsPerPx, y: view.y - dyPx * unitsPerPx },
    base,
  );
}

/** factor > 1 zooms in; (px, py) is the cursor position in viewport pixels. */
export function zoomAt(
  view: View,
  base: View,
  px: number,
  py: number,
  factor: number,
  vpW: number,
  vpH: number,
): View {
  const cx = view.x + (px / vpW) * view.w;
  const cy = view.y + (py / vpH) * view.h;
  const w = view.w / factor;
  const h = view.h / factor;
  return clampView(
    { x: cx - (px / vpW) * w, y: cy - (py / vpH) * h, w, h },
    base,
  );
}
