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

describe("focusOn", () => {
  it("with no frame clock, jumps to the clamped center and reports done once", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { svg, handle } = setup();
    const onDone = vi.fn();
    const pt = { x: data.width / 2 + 60, y: data.height / 2 + 40 };
    handle.focusOn(pt, onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
    const [x, y, w, h] = viewBoxOf(svg);
    expect(x).toBeCloseTo(pt.x - w / 2, 4);
    expect(y).toBeCloseTo(pt.y - h / 2, 4);
    // Pan only: the zoom is the player's.
    const { home } = viewBoundsOf(data, data.width, data.height);
    expect(w).toBeCloseTo(home.w, 6);
    expect(h).toBeCloseTo(home.h, 6);
  });

  it("clamps a target off the edge instead of gliding into blank margin", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { svg, handle } = setup();
    const bounds = viewBoundsOf(data, data.width, data.height);
    // Far outside the map, so the clamp is the only thing that can stop it.
    handle.focusOn({ x: -5000, y: -5000 }, vi.fn());
    const [x, y, w, h] = viewBoxOf(svg);
    expect(x).toBeCloseTo(clampView({ x: -5000 - w / 2, y: -5000 - h / 2, w, h }, bounds).x, 4);
    expect(y).toBeCloseTo(clampView({ x: -5000 - w / 2, y: -5000 - h / 2, w, h }, bounds).y, 4);
    expect(x).toBeGreaterThan(-5000);
    expect(y).toBeGreaterThan(-5000);
  });

  it("glides through the middle and lands centered, one done", () => {
    const clock = stubFrameClock();
    const { svg, handle } = setup();
    const onDone = vi.fn();
    const [x0] = viewBoxOf(svg);
    const pt = { x: data.width / 2 + 120, y: data.height / 2 + 80 };
    handle.focusOn(pt, onDone);
    // The glide lands on the CLAMPED center - a target near the edge stops
    // at the map's bound, exactly as a hand pan would.
    const bounds = viewBoundsOf(data, data.width, data.height);
    const { home } = bounds;
    const target = clampView(
      { x: pt.x - home.w / 2, y: pt.y - home.h / 2, w: home.w, h: home.h },
      bounds,
    );
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
    const onDone = vi.fn();
    const pt = { x: data.width / 2 + 120, y: data.height / 2 + 80 };
    handle.focusOn(pt, onDone);
    clock.step(150);
    const [xMid] = viewBoxOf(svg);
    svg.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(onDone).toHaveBeenCalledTimes(1);
    // The view stays where the player took it, no jump to the target.
    const [xAfter, , wAfter] = viewBoxOf(svg);
    expect(xAfter).toBeCloseTo(xMid, 6);
    expect(xAfter).not.toBeCloseTo(pt.x - wAfter / 2, 4);
    // Late frames from the cancelled glide must not move the camera.
    clock.step(400);
    expect(viewBoxOf(svg)[0]).toBeCloseTo(xMid, 6);
  });
});
