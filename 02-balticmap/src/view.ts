export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 8;

/** Smallest view that covers the whole map, centered, with the viewport's aspect. */
export function fitView(mapW: number, mapH: number, vpW: number, vpH: number): View {
  const unitsPerPx = Math.max(mapW / vpW, mapH / vpH);
  const w = vpW * unitsPerPx;
  const h = vpH * unitsPerPx;
  return { x: (mapW - w) / 2, y: (mapH - h) / 2, w, h };
}

/** Clamp zoom to [1x, MAX_ZOOM] relative to base and keep the view inside base. */
export function clampView(view: View, base: View): View {
  const w = Math.min(Math.max(view.w, base.w / MAX_ZOOM), base.w);
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
