// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderMap } from "../src/map-render";
import { attachInteraction, landAtPoint } from "../src/interaction";
import { fitView, homeView } from "../src/view";
import type { MapData } from "../src/types";
import raw from "../src/data/baltic.json";

const data = raw as MapData;

function setup(interceptClick?: (id: string | null) => boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths, settlementDots, revealSettlement } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const onHoverSettlement = vi.fn();
  const handle = attachInteraction(svg, regionPaths, data, {
    onHover,
    onSelect,
    onHoverSettlement,
    interceptClick,
  });
  return {
    svg, regionPaths, settlementDots, revealSettlement,
    onHover, onSelect, onHoverSettlement, handle,
  };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, ...init });

describe("attachInteraction", () => {
  it("sets the initial viewBox to the home view, not the whole-map fit", () => {
    // The zoom floor (MIN_ZOOM) means the player starts closer than a full
    // fit of the map, so lands keep their size as the map grows - see
    // src/view.ts.
    const { svg } = setup();
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const base = fitView(data.width, data.height, data.width, data.height);
    const home = homeView(base);
    expect(w).toBeCloseTo(home.w, 6);
    expect(h).toBeCloseTo(home.h, 6);
    expect(x).toBeCloseTo(home.x, 6);
    expect(y).toBeCloseTo(home.y, 6);
    expect(w).toBeLessThan(data.width);
    expect(h).toBeLessThan(data.height);
  });

  it("hover toggles the hovered class and fires onHover", () => {
    const { regionPaths, onHover } = setup();
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerenter", { clientX: 5, clientY: 7 }));
    expect(el.classList.contains("hovered")).toBe(true);
    expect(onHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "kursa", name: "Kursa" }), 5, 7,
    );
    // A leave carries the pointer's real position too. The aim preview
    // resolves the land from the POINT, looking through the arrows and dots
    // the per-path hover cannot see, so a leave reporting (0, 0) had it
    // answering for the top-left corner of the window.
    el.dispatchEvent(mouse("pointerleave", { clientX: 11, clientY: 13 }));
    expect(el.classList.contains("hovered")).toBe(false);
    expect(onHover).toHaveBeenLastCalledWith(null, 11, 13);
  });

  it("click on a region selects it; clicking again deselects", () => {
    const { regionPaths, onSelect } = setup();
    const el = regionPaths.get("dainava")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "dainava" }),
    );
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("a click on another region while one is selected only deselects", () => {
    const { regionPaths, onSelect } = setup();
    const a = regionPaths.get("dainava")!;
    const b = regionPaths.get("ravala")!;
    const click = (el: SVGPathElement) => {
      el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
      el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    };
    click(a);
    click(b);
    expect(a.classList.contains("selected")).toBe(false);
    expect(b.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    // The second click on it is the one that selects.
    click(b);
    expect(b.classList.contains("selected")).toBe(true);
  });

  it("a drag beyond the threshold pans and does not select", () => {
    const { svg, regionPaths, onSelect } = setup();
    const el = regionPaths.get("ravala")!;
    const before = svg.getAttribute("viewBox");
    el.dispatchEvent(mouse("pointerdown", { clientX: 100, clientY: 100 }));
    el.dispatchEvent(mouse("pointermove", { clientX: 160, clientY: 100, buttons: 1 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 160, clientY: 100 }));
    expect(onSelect).not.toHaveBeenCalled();
    // The home view is centered rather than pinned to a corner, so there is
    // room to pan in both directions and the drag moves the view west.
    const x = Number(svg.getAttribute("viewBox")!.split(" ")[0]);
    expect(x).toBeLessThan(Number(before!.split(" ")[0]));
  });

  it("deselect() clears the selection and fires onSelect(null)", () => {
    const { regionPaths, onSelect, handle } = setup();
    const el = regionPaths.get("livzeme")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    handle.deselect();
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("hovering a settlement dot fires onHoverSettlement with the settlement", () => {
    // pointerover/pointerout, not enter/leave: the handler is delegated on the
    // svg so a dot added mid-game gets a tooltip too, and only the bubbling
    // pair reaches a delegated listener.
    const { settlementDots, onHoverSettlement } = setup();
    const dot = settlementDots.get("daugmale")!;
    dot.dispatchEvent(mouse("pointerover", { clientX: 3, clientY: 4 }));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "daugmale", name: "Daugmale" }), 3, 4,
    );
    dot.dispatchEvent(mouse("pointerout"));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(null, 0, 0);
  });

  it("gives a dot revealed mid-game the same tooltip", () => {
    // The regression this delegation exists for: a settlement founded in play
    // is created after attachInteraction ran.
    const { svg, revealSettlement, onHoverSettlement } = setup();
    const locked = data.settlements.find((s) => !s.unlocked)!;
    revealSettlement(locked);
    const dot = svg.querySelector(
      `[data-settlement-id="${locked.id}"]`,
    ) as SVGCircleElement;
    dot.dispatchEvent(mouse("pointerover", { clientX: 5, clientY: 6 }));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: locked.id }), 5, 6,
    );
  });

  it("clicking a settlement dot does not change the selection", () => {
    const { regionPaths, settlementDots, onSelect } = setup();
    const region = regionPaths.get("livzeme")!;
    region.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    region.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(region.classList.contains("selected")).toBe(true);
    const dot = settlementDots.get("daugmale")!;
    dot.dispatchEvent(mouse("pointerdown", { clientX: 12, clientY: 12 }));
    dot.dispatchEvent(mouse("pointerup", { clientX: 12, clientY: 12 }));
    expect(region.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "livzeme" }),
    );
  });

  it("interceptClick returning true consumes the click: no selection", () => {
    const intercept = vi.fn(() => true);
    const { regionPaths, onSelect } = setup(intercept);
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(intercept).toHaveBeenCalledWith("kursa");
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("interceptClick returning false lets selection proceed", () => {
    const intercept = vi.fn(() => false);
    const { regionPaths, onSelect } = setup(intercept);
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "kursa" }));
  });

  /** The press still resolves through the event's own target, which is the hit
   *  test the browser already did. Only a press that landed on something drawn
   *  OVER the map - an arrow, its strength label, a badge - reaches the
   *  coordinate lookup, and that one is the browser pass's to assert. */
  it("resolves a press from the event target, without a second hit test", () => {
    const elementFromPoint = vi.fn();
    const elementsFromPoint = vi.fn(() => []);
    Object.assign(document, { elementFromPoint, elementsFromPoint });
    try {
      const intercept = vi.fn(() => true);
      const { regionPaths } = setup(intercept);
      const el = regionPaths.get("kursa")!;
      el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
      el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
      expect(intercept).toHaveBeenCalledWith("kursa");
      expect(elementFromPoint).not.toHaveBeenCalled();
      expect(elementsFromPoint).not.toHaveBeenCalled();
    } finally {
      Object.assign(document, {
        elementFromPoint: undefined, elementsFromPoint: undefined,
      });
    }
  });
});

describe("landAtPoint", () => {
  /** happy-dom implements neither hit-testing API, and answering "no land" is
   *  the right degradation: there is no layout here to hit-test against. What
   *  must NOT happen is a throw, which would take the whole click path with
   *  it - the browser is not the only place this runs. */
  it("answers no land where the environment cannot hit-test", () => {
    expect(landAtPoint(10, 10)).toBeNull();
  });

  it("looks through what is drawn over a land to the land itself", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { regionPaths } = renderMap(data, container);
    const land = regionPaths.get("kursa")!;
    // An arrow, standing in for everything the map draws on top: it takes the
    // pointer and carries no id, so the direct answer is "no land".
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    Object.assign(document, {
      elementFromPoint: () => arrow,
      elementsFromPoint: () => [arrow, land],
    });
    try {
      expect(landAtPoint(10, 10)).toBe("kursa");
    } finally {
      Object.assign(document, {
        elementFromPoint: undefined, elementsFromPoint: undefined,
      });
    }
  });

  it("skips a realm-edge copy, which is an outline OF a land and not the land", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { regionPaths } = renderMap(data, container);
    const land = regionPaths.get("kursa")!;
    // The edge copies carry `.region` and no id - matching on the class alone
    // found one of those and answered "no land".
    const edge = document.createElementNS("http://www.w3.org/2000/svg", "path");
    edge.classList.add("region", "realm-edge");
    Object.assign(document, {
      elementFromPoint: () => edge,
      elementsFromPoint: () => [edge, land],
    });
    try {
      expect(landAtPoint(10, 10)).toBe("kursa");
    } finally {
      Object.assign(document, {
        elementFromPoint: undefined, elementsFromPoint: undefined,
      });
    }
  });
});
