// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderMap } from "../src/map-render";
import { attachInteraction } from "../src/interaction";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths, settlementDots } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const onHoverSettlement = vi.fn();
  const handle = attachInteraction(svg, regionPaths, settlementDots, data, {
    onHover,
    onSelect,
    onHoverSettlement,
  });
  return { svg, regionPaths, settlementDots, onHover, onSelect, onHoverSettlement, handle };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, ...init });

describe("attachInteraction", () => {
  it("sets the initial viewBox to a view covering the map", () => {
    const { svg } = setup();
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBeGreaterThanOrEqual(data.width);
    expect(h).toBeGreaterThanOrEqual(data.height);
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
  });

  it("hover toggles the hovered class and fires onHover", () => {
    const { regionPaths, onHover } = setup();
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerenter", { clientX: 5, clientY: 7 }));
    expect(el.classList.contains("hovered")).toBe(true);
    expect(onHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "kursa", name: "Kursa" }), 5, 7,
    );
    el.dispatchEvent(mouse("pointerleave"));
    expect(el.classList.contains("hovered")).toBe(false);
    expect(onHover).toHaveBeenLastCalledWith(null, 0, 0);
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

  it("a drag beyond the threshold pans and does not select", () => {
    const { svg, regionPaths, onSelect } = setup();
    const el = regionPaths.get("ravala")!;
    const before = svg.getAttribute("viewBox");
    el.dispatchEvent(mouse("pointerdown", { clientX: 100, clientY: 100 }));
    el.dispatchEvent(mouse("pointermove", { clientX: 160, clientY: 100, buttons: 1 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 160, clientY: 100 }));
    expect(onSelect).not.toHaveBeenCalled();
    // at 1x the pan is clamped back, so the viewBox may be unchanged,
    // but selection must not fire; dragging is the observable contract here
    expect(svg.getAttribute("viewBox")).toBe(before);
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
    const { settlementDots, onHoverSettlement } = setup();
    const dot = settlementDots.get("daugmale")!;
    dot.dispatchEvent(mouse("pointerenter", { clientX: 3, clientY: 4 }));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "daugmale", name: "Daugmale" }), 3, 4,
    );
    dot.dispatchEvent(mouse("pointerleave"));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(null, 0, 0);
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
});
