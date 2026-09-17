import { afterEach, describe, expect, it, vi } from "vitest";
import { boardStamp, drawBoard, releaseBoard, type MapModel } from "../src/ui/mapcanvas";

afterEach(() => { releaseBoard(); vi.restoreAllMocks(); });

describe("static canvas redraw budget", () => {
  it("does not redraw for animation-only frames, but redraws after ground or pixel density changes", () => {
    const context = new Proxy({} as CanvasRenderingContext2D, {
      get: () => () => {}, set: () => true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
    const model: MapModel = {
      cols: 1, rows: 1, px: 11, line: 14, font: 12, x0: 0, y0: 0, z: 6,
      gridClasses: [], night: false, season: "summer", glyphs: [],
      walk: { behind: [], ahead: [] }, startles: [], marks: [],
    };
    expect(drawBoard(model, "known-ground")).toBe(true);
    const stamp = boardStamp();
    for (let frame = 0; frame < 120; frame++) expect(drawBoard(model, "known-ground")).toBe(false);
    expect(boardStamp()).toBe(stamp);
    expect(drawBoard(model, "new-known-ground")).toBe(true);
    expect(boardStamp()).toBe(stamp + 1);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    expect(drawBoard(model, "new-known-ground")).toBe(true);
    expect(boardStamp()).toBe(stamp + 2);
  });
});
