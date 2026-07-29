import {
  leadsOf, type Incorporated, type Overlords, type Relations,
} from "./relations";
import { SUBJUGATE_THRESHOLD } from "./playability";
import type { TooltipLine } from "./panel";

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

export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}

/** How a polygon stands to the human, from the polygon's OWN faction id.
 *
 *  Pass the polygon's own faction, never the politically resolved one: an
 *  incorporated land resolves to its absorber, whose own `incorporated` entry
 *  is empty, so resolving first makes the absorption invisible and the land
 *  reads as independent. Leads still come from the resolved faction - an
 *  absorbed land has no relations of its own - but its allegiance does not. */
export function relationshipLine(
  polygonFactionId: string,
  humanFactionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
  factionName: (id: string) => string,
): string {
  const owner = incorporated[polygonFactionId];
  const lord = overlords.get(polygonFactionId);
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
    return `Incorporated into ${factionName(owner)}${suffix}`;
  }
  if (lord === humanFactionId) return "Your vassal";
  if (overlords.get(humanFactionId) === polygonFactionId) return "Your overlord";
  if (lord === undefined) return "Independent";
  return `Vassal of ${factionName(lord)}`;
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

/** Which subjugation bar a track is racing toward. The bars are asymmetric -
 *  each counts the realm of the side being taken - so a badge showing both
 *  tracks against the player's bar quotes the wrong number the moment the
 *  enemy is the one leading. The sign of the lead already says who is
 *  running, so it also says whose bar applies. Null where the leading side
 *  could never subjugate the other, and the track shows no denominator. */
export function barFor(
  lead: number,
  yourBar: number | null,
  theirBar: number | null,
): number | null {
  return lead < 0 ? theirBar : yourBar;
}

/** The two Subjugate bars for a hovered pair, from `subjugationRequirement`
 *  called in both directions. Either is null where Subjugate could never
 *  apply that way round, and the matching lines lose their denominator. */
export interface SubjugationBars {
  yours: number | null;
  theirs: number | null;
}

/** Tone always says who leads, never whether a bar is cleared - the same
 *  classes color the map badges. Each track is measured against the bar of
 *  whichever side leads it, so a track they lead quotes their bar. */
export function hoverRelationLines(
  relations: Relations,
  humanFactionId: string,
  hoveredFactionId: string,
  relationship: string,
  bars: SubjugationBars = { yours: null, theirs: null },
): TooltipLine[] {
  const tone = (n: number) => (n > 0 ? "good" : n < 0 ? "bad" : "neutral");
  const delta = (label: string, n: number): TooltipLine => {
    const bar = barFor(n, bars.yours, bars.theirs);
    if (bar !== null) {
      const suffix = n > 0 ? " (you lead)" : n < 0 ? " (they lead)" : "";
      return { text: `${label}: ${formatLead("", n, bar)}${suffix}`, tone: tone(n) };
    }
    return n === 0
      ? { text: `${label}: even`, tone: "neutral" }
      : {
          text: `${label}: ${formatLead("", n)} (${n > 0 ? "you" : "they"} lead)`,
          tone: tone(n),
        };
  };
  const landsIn = (bar: number) => bar / SUBJUGATE_THRESHOLD;
  const landsWord = (n: number) => `${n} ${n === 1 ? "land" : "lands"}`;
  const yours = leadsOf(relations, humanFactionId, hoveredFactionId);
  const theyLead = yours.might < 0 || yours.status < 0;
  return [
    delta("Might", yours.might),
    delta("Status", yours.status),
    ...(bars.yours === null
      ? []
      : [
          {
            text:
              `Subjugate needs a lead of ${bars.yours} - their realm has ` +
              `${landsWord(landsIn(bars.yours))}.`,
            tone: "neutral" as const,
          },
        ]),
    ...(bars.theirs === null || !theyLead
      ? []
      : [
          {
            text:
              `They need a lead of ${bars.theirs} to subjugate you - your realm has ` +
              `${landsWord(landsIn(bars.theirs))}.`,
            tone: "neutral" as const,
          },
        ]),
    { text: relationship },
  ];
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
