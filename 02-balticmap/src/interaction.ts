import type { MapData, Region } from "./types";
import { fitView, clampView, panBy, zoomAt, type View } from "./view";
import { initialState, withHover, withClick, type SelectionState } from "./state";

export interface InteractionCallbacks {
  onHover(region: Region | null, clientX: number, clientY: number): void;
  onSelect(region: Region | null): void;
}

export interface InteractionHandle {
  deselect(): void;
}

const DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_BASE = 1.0015;

export function attachInteraction(
  svg: SVGSVGElement,
  regionPaths: Map<string, SVGPathElement>,
  data: MapData,
  cb: InteractionCallbacks,
): InteractionHandle {
  const byId = new Map(data.regions.map((r) => [r.id, r]));
  let state: SelectionState = initialState;

  const vpW = () => svg.clientWidth || data.width;
  const vpH = () => svg.clientHeight || data.height;

  let base: View = fitView(data.width, data.height, vpW(), vpH());
  let view: View = base;

  function apply(): void {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  apply();

  window.addEventListener("resize", () => {
    base = fitView(data.width, data.height, vpW(), vpH());
    view = clampView(view, base);
    apply();
  });

  function applySelection(): void {
    for (const [id, el] of regionPaths) {
      el.classList.toggle("selected", id === state.selected);
    }
    cb.onSelect(state.selected ? byId.get(state.selected)! : null);
  }

  for (const [id, el] of regionPaths) {
    el.addEventListener("pointerenter", (e) => {
      state = withHover(state, id);
      el.classList.add("hovered");
      const me = e as MouseEvent;
      cb.onHover(byId.get(id)!, me.clientX, me.clientY);
    });
    el.addEventListener("pointerleave", () => {
      state = withHover(state, null);
      el.classList.remove("hovered");
      cb.onHover(null, 0, 0);
    });
  }

  let down: { x: number; y: number; pointerId: number | undefined } | null = null;
  let dragged = false;

  function endDrag(): void {
    down = null;
    dragged = false;
    svg.classList.remove("dragging");
  }

  svg.addEventListener("pointerdown", (e) => {
    const me = e as MouseEvent;
    const pe = e as PointerEvent;
    down = { x: me.clientX, y: me.clientY, pointerId: pe.pointerId };
    dragged = false;
  });

  svg.addEventListener("pointermove", (e) => {
    if (!down) return;
    const me = e as MouseEvent;
    const dx = me.clientX - down.x;
    const dy = me.clientY - down.y;
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragged = true;
    if (typeof down.pointerId === "number" && typeof svg.setPointerCapture === "function") {
      try {
        svg.setPointerCapture(down.pointerId);
      } catch {
        // capture is best-effort; drag still works without it
      }
    }
    svg.classList.add("dragging");
    view = panBy(view, base, dx, dy, vpW());
    down = { x: me.clientX, y: me.clientY, pointerId: down.pointerId };
    apply();
  });

  svg.addEventListener("pointerup", (e) => {
    const wasDrag = dragged;
    endDrag();
    if (wasDrag) return;
    const target = (e.target as Element).closest?.("[data-id]") ?? null;
    state = withClick(state, target?.getAttribute("data-id") ?? null);
    applySelection();
  });

  svg.addEventListener("pointercancel", endDrag);

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.pow(WHEEL_ZOOM_BASE, -e.deltaY);
      view = zoomAt(
        view, base,
        e.clientX - rect.left, e.clientY - rect.top,
        factor, vpW(), vpH(),
      );
      apply();
    },
    { passive: false },
  );

  return {
    deselect() {
      state = withClick(state, state.selected);
      applySelection();
    },
  };
}
