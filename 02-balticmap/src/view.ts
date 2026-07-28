import { leadsOf, type Incorporated, type Relations } from "./relations";
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
 *  so lands keep their size as the map grows. */
export const MIN_ZOOM = 1.3;

export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}

export function hoverRelationLines(
  relations: Relations,
  humanFactionId: string,
  hoveredFactionId: string,
  relationship: string,
): TooltipLine[] {
  const delta = (label: string, n: number): TooltipLine =>
    n > 0
      ? { text: `${label}: +${n} (you lead)`, tone: "good" }
      : n < 0
        ? { text: `${label}: ${n} (they lead)`, tone: "bad" }
        : { text: `${label}: even`, tone: "neutral" };
  const yours = leadsOf(relations, humanFactionId, hoveredFactionId);
  return [
    delta("Might", yours.might),
    delta("Status", yours.status),
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
