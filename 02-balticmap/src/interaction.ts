import type { MapData, Region, Settlement } from "./types";
import { fitView, clampView, homeView, panBy, zoomAt, type View } from "./view";
import { initialState, withHover, withClick, type SelectionState } from "./state";

export interface InteractionCallbacks {
  onHover(region: Region | null, clientX: number, clientY: number): void;
  onSelect(region: Region | null): void;
  onHoverSettlement(
    settlement: Settlement | null,
    clientX: number,
    clientY: number,
  ): void;
  /** Return true to consume the click (e.g. during faction picking):
   *  selection state is left untouched and onSelect does not fire. */
  interceptClick?(regionId: string | null): boolean;
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
  // The home view is the most zoomed-out the player may go, which is closer
  // than the whole-map fit - see MIN_ZOOM - and centered on the map.
  let view: View = homeView(base);

  function apply(): void {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  apply();

  window.addEventListener("resize", () => {
    const home = homeView(base);
    const wasAtHome =
      view.x === home.x && view.y === home.y &&
      view.w === home.w && view.h === home.h;
    base = fitView(data.width, data.height, vpW(), vpH());
    view = wasAtHome ? homeView(base) : clampView(view, base);
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

  // Delegated rather than bound per dot: a settlement founded in play is added
  // to the map after this runs, and a per-dot listener would leave exactly those
  // dots with no tooltip - the ones a player most needs explained.
  const settlementById = new Map(data.settlements.map((s) => [s.id, s]));
  const dotUnder = (e: Event): string | undefined =>
    (e.target as Element | null)?.closest?.("[data-settlement-id]")
      ?.getAttribute("data-settlement-id") ?? undefined;
  svg.addEventListener("pointerover", (e) => {
    const id = dotUnder(e);
    const s = id === undefined ? undefined : settlementById.get(id);
    if (s === undefined) return;
    const me = e as MouseEvent;
    cb.onHoverSettlement(s, me.clientX, me.clientY);
  });
  svg.addEventListener("pointerout", (e) => {
    if (dotUnder(e) === undefined) return;
    cb.onHoverSettlement(null, 0, 0);
  });

  let down: { x: number; y: number; pointerId: number | undefined } | null = null;
  let dragged = false;

  function endDrag(): void {
    down = null;
    dragged = false;
    svg.classList.remove("dragging");
  }

  svg.addEventListener("pointerdown", (e) => {
    if ((e as PointerEvent).button !== 0) return;
    const me = e as MouseEvent;
    const pe = e as PointerEvent;
    down = { x: me.clientX, y: me.clientY, pointerId: pe.pointerId };
    dragged = false;
  });

  svg.addEventListener("pointermove", (e) => {
    if (!down) return;
    if ((e as MouseEvent).buttons === 0) {
      endDrag();
      return;
    }
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
    if ((e.target as Element).closest?.("[data-settlement-id]")) return;
    const target = (e.target as Element).closest?.("[data-id]") ?? null;
    const id = target?.getAttribute("data-id") ?? null;
    if (cb.interceptClick?.(id)) return;
    state = withClick(state, id);
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
