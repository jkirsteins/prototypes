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
  /** Return true to take a PRESS before it becomes a pan - what aiming a raid
   *  by dragging needs, since the same gesture otherwise drags the map. The
   *  caller owns the pointer until it comes back up. */
  interceptPress?(regionId: string | null, e: PointerEvent): boolean;
}

export interface InteractionHandle {
  deselect(): void;
  /** Map coordinates for a screen point: what a drag needs to draw anything
   *  in the map's own 1000x1400 space while the pointer moves. */
  toMapPoint(clientX: number, clientY: number): { x: number; y: number };
}

/** The land at a screen point, looking THROUGH everything drawn on top of the
 *  map: the arrows, their strength labels, the badges, the settlement dots.
 *
 *  Those layers are drawn OVER the lands, not instead of them, and none of
 *  them is a land - so asking what the pointer is literally on top of answers
 *  "no land" for a wide band of every polygon, while the player is plainly
 *  pointing at one.
 *
 *  **The one spelling, and it takes a POINT rather than an event on purpose.**
 *  Every surface that has to answer "which land is the player indicating"
 *  reads it here - the click that plays a card, the press that pins a land,
 *  and the aim preview that promises where the arrow will go. Those three
 *  disagreeing is not a cosmetic bug: the preview marked one land and the
 *  click played at another, so a raid landed somewhere the player was never
 *  shown. A resolver that only worked on an event could not be reached by the
 *  hover, which is exactly how the two drifted apart. */
export function landAtPoint(clientX: number, clientY: number): string | null {
  // Optional calls throughout: happy-dom implements neither hit-testing API,
  // and this resolving to "no land" under the test environment is correct -
  // there is no layout there to hit-test against. The browser pass is what
  // asserts the looking-through, per the rule in AGENTS.md.
  const top = document.elementFromPoint?.(clientX, clientY) ?? null;
  const direct = top?.closest?.("[data-id]") ?? null;
  if (direct !== null) return direct.getAttribute("data-id");
  // The first thing under the pointer that is a land AND says which one. The
  // realm-edge copies carry `.region` too and carry no id - they are an
  // outline OF a land, not the land - so matching on the class alone found
  // one of those and answered "no land".
  const beneath = document
    .elementsFromPoint?.(clientX, clientY)
    ?.find((el) => el.classList.contains("region") && el.hasAttribute("data-id"));
  return beneath?.getAttribute("data-id") ?? null;
}

/** Pointer travel past which a press is a pan rather than a click. Exported
 *  so anything that swallows a click on top of the map - the counterable
 *  march arrows in src/main.ts - reads "was that a drag?" the same way this
 *  file does, instead of keeping a second copy of the number. */
export const DRAG_THRESHOLD_PX = 5;
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
    // The pointer's real position, even on the way OUT. A leave still says
    // where the pointer is, and a listener that resolves the land itself -
    // the aim preview, which looks through the arrows the hover cannot -
    // would otherwise be handed (0, 0) and answer for the top-left corner.
    el.addEventListener("pointerleave", (e) => {
      state = withHover(state, null);
      el.classList.remove("hovered");
      const me = e as MouseEvent;
      cb.onHover(null, me.clientX, me.clientY);
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
    // A caller may take the press outright - aiming a raid by dragging. The
    // pan never starts, so the map stays still under the arrow being drawn.
    const under = (e.target as Element | null)?.closest?.("[data-id]");
    if (cb.interceptPress?.(under?.getAttribute("data-id") ?? null, pe) === true) {
      return;
    }
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
    // Left button only. `pointerup` fires for every button, so without this a
    // right click selected a land as well as doing whatever it was aimed at -
    // and right click is a game input now, not a second way to click.
    if ((e as PointerEvent).button !== 0) return;
    const wasDrag = dragged;
    endDrag();
    if (wasDrag) return;
    if ((e.target as Element).closest?.("[data-settlement-id]")) return;
    const id = landUnder(e as PointerEvent);
    if (cb.interceptClick?.(id)) return;
    state = withClick(state, id);
    applySelection();
  });

  /** The land a press lands on. The event's own target FIRST - the browser has
   *  already hit-tested it, and asking for a second one at the same point is
   *  both redundant and a different question in a test environment with no
   *  layout. Falls through to `landAtPoint` for the press that landed on
   *  something drawn over the map: an arrow, its strength label, a badge. */
  const landUnder = (e: PointerEvent): string | null => {
    const direct = (e.target as Element).closest?.("[data-id]") ?? null;
    if (direct !== null) return direct.getAttribute("data-id");
    return landAtPoint(e.clientX, e.clientY);
  };

  svg.addEventListener("pointercancel", endDrag);

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = WHEEL_ZOOM_BASE ** -e.deltaY;
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
    toMapPoint(clientX: number, clientY: number) {
      const box = svg.getBoundingClientRect();
      return {
        x: view.x + ((clientX - box.left) / box.width) * view.w,
        y: view.y + ((clientY - box.top) / box.height) * view.h,
      };
    },
    deselect() {
      state = withClick(state, state.selected);
      applySelection();
    },
  };
}
