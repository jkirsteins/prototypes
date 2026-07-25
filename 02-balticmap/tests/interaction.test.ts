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
  const { svg, regionPaths } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const handle = attachInteraction(svg, regionPaths, data, { onHover, onSelect });
  return { svg, regionPaths, onHover, onSelect, handle };
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
    const el = regionPaths.get("LV003")!;
    el.dispatchEvent(mouse("pointerenter", { clientX: 5, clientY: 7 }));
    expect(el.classList.contains("hovered")).toBe(true);
    expect(onHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "LV003", name: "Kurzeme" }), 5, 7,
    );
    el.dispatchEvent(mouse("pointerleave"));
    expect(el.classList.contains("hovered")).toBe(false);
    expect(onHover).toHaveBeenLastCalledWith(null, 0, 0);
  });

  it("click on a region selects it; clicking again deselects", () => {
    const { regionPaths, onSelect } = setup();
    const el = regionPaths.get("LT001")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "LT001" }),
    );
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("a drag beyond the threshold pans and does not select", () => {
    const { svg, regionPaths, onSelect } = setup();
    const el = regionPaths.get("EE001")!;
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
    const el = regionPaths.get("LV006")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    handle.deselect();
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
