// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderMap } from "../src/map-render";
import { attachInteraction } from "../src/interaction";
import { clampView, viewBoundsOf } from "../src/view";
import type { MapData } from "../src/types";
import raw from "../src/data/baltic.json";

const data = raw as MapData;

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths } = renderMap(data, container);
  const handle = attachInteraction(svg, regionPaths, data, {
    onHover: vi.fn(),
    onSelect: vi.fn(),
    onHoverSettlement: vi.fn(),
  });
  return { svg, handle };
}

const viewBoxOf = (svg: SVGSVGElement) =>
  svg.getAttribute("viewBox")!.split(" ").map(Number);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A hand-stepped frame clock, so the glide is driven deterministically
 *  rather than waited on. The production path is identical code; only the
 *  scheduler is ours. */
function stubFrameClock() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queue = [];
  });
  vi.stubGlobal("performance", { now: () => now });
  return {
    step(ms: number): void {
      now += ms;
      const cbs = queue;
      queue = [];
      for (const cb of cbs) cb(now);
    },
  };
}

/** Zooms the view in hard, so a land really can be off screen. The default
 *  view is the whole map plus a ring - every land is visible in it, which is
 *  exactly when focusOn is supposed to hold still.
 *
 *  Through the real wheel handler, so the view this leaves behind is one the
 *  player could have reached. The rect stub is happy-dom's gap rather than
 *  the code's: it reports no layout box at all, and the handler's
 *  `clientX - rect.left` then lands NaN in the viewBox. */
function zoomIn(svg: SVGSVGElement): void {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: data.width, height: data.height }) as DOMRect;
  const wheel = new WheelEvent("wheel", { bubbles: true, deltaY: -1200 });
  // happy-dom's WheelEvent drops the pointer coordinates its MouseEvent
  // keeps, and the handler's `clientX - rect.left` then puts NaN in the
  // viewBox. Both this and the rect above are the environment's gaps, not
  // the code's - a real wheel carries all three.
  Object.defineProperty(wheel, "clientX", { value: data.width / 2 });
  Object.defineProperty(wheel, "clientY", { value: data.height / 2 });
  svg.dispatchEvent(wheel);
}

/** A point far outside the current view, so focusOn has something to do. */
const offScreenPoint = (svg: SVGSVGElement) => {
  const [x, y, w, h] = viewBoxOf(svg);
  return { x: x + w * 3, y: y + h * 3 };
};

describe("focusOn", () => {
  it("holds still for a point already comfortably on screen", () => {
    // The whole-map default view: every land is visible, so there is nothing
    // to bring on screen and the camera must not drift to centre each one.
    const { svg, handle } = setup();
    const before = svg.getAttribute("viewBox");
    const onDone = vi.fn();
    handle.focusOn({ x: data.width / 2, y: data.height / 2 }, onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(svg.getAttribute("viewBox")).toBe(before);
  });

  it("with no frame clock, jumps to the clamped centre and reports done once", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { svg, handle } = setup();
    zoomIn(svg);
    const [, , w0, h0] = viewBoxOf(svg);
    const pt = offScreenPoint(svg);
    const onDone = vi.fn();
    handle.focusOn(pt, onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    const bounds = viewBoundsOf(data, data.width, data.height);
    const target = clampView({ x: pt.x - w0 / 2, y: pt.y - h0 / 2, w: w0, h: h0 }, bounds);
    const [x, y, w, h] = viewBoxOf(svg);
    expect(x).toBeCloseTo(target.x, 4);
    expect(y).toBeCloseTo(target.y, 4);
    // Pan only: the zoom is the player's and the glide never touches it.
    expect(w).toBeCloseTo(w0, 6);
    expect(h).toBeCloseTo(h0, 6);
  });

  it("clamps a target off the map instead of gliding into blank margin", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { svg, handle } = setup();
    zoomIn(svg);
    handle.focusOn({ x: -50000, y: -50000 }, vi.fn());
    const [x, y] = viewBoxOf(svg);
    expect(x).toBeGreaterThan(-50000);
    expect(y).toBeGreaterThan(-50000);
  });

  it("glides through the middle and lands centred, one done", () => {
    const clock = stubFrameClock();
    const { svg, handle } = setup();
    zoomIn(svg);
    const [x0, , w0, h0] = viewBoxOf(svg);
    const pt = offScreenPoint(svg);
    const onDone = vi.fn();
    handle.focusOn(pt, onDone);
    const bounds = viewBoundsOf(data, data.width, data.height);
    const target = clampView({ x: pt.x - w0 / 2, y: pt.y - h0 / 2, w: w0, h: h0 }, bounds);
    clock.step(200);
    const [xMid] = viewBoxOf(svg);
    expect(xMid).toBeGreaterThan(Math.min(x0, target.x));
    expect(xMid).toBeLessThan(Math.max(x0, target.x));
    expect(onDone).not.toHaveBeenCalled();
    clock.step(300);
    clock.step(20);
    const [xEnd, yEnd] = viewBoxOf(svg);
    expect(xEnd).toBeCloseTo(target.x, 4);
    expect(yEnd).toBeCloseTo(target.y, 4);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a pointer press cancels the glide where it stands, still reporting done", () => {
    const clock = stubFrameClock();
    const { svg, handle } = setup();
    zoomIn(svg);
    const onDone = vi.fn();
    handle.focusOn(offScreenPoint(svg), onDone);
    clock.step(150);
    const [xMid] = viewBoxOf(svg);
    svg.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(onDone).toHaveBeenCalledTimes(1);
    // The view stays where the player took it, no jump to the target.
    expect(viewBoxOf(svg)[0]).toBeCloseTo(xMid, 6);
    // Late frames from the cancelled glide must not move the camera.
    clock.step(400);
    expect(viewBoxOf(svg)[0]).toBeCloseTo(xMid, 6);
  });
});
