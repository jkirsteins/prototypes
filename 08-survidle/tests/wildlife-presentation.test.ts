import { describe, expect, it } from "vitest";
import * as map from "../src/ui/map";
import type { MapModel } from "../src/ui/mapcanvas";

describe("fine wildlife marks", () => {
  it("draws an exact-position colored glyph without covering terrain with rectangles", () => {
    const commands: { name: string; args: unknown[] }[] = [];
    const context = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, name) => (...args: unknown[]) => commands.push({ name: String(name), args }),
      set: (_target, name, value) => { commands.push({ name: String(name), args: [value] }); return true; },
    });
    const model: MapModel = {
      cols: 1, rows: 1, px: 11, line: 14, font: 12, x0: 0, y0: 0, z: 1,
      gridClasses: [], night: false, season: "summer", glyphs: [],
      walk: { behind: [], ahead: [] }, startles: [],
      marks: [{ id: 1, x: 7.5, y: 8.5, glyph: "E", bg: "#f8c96e", fg: "#000000" }],
    };
    const draw = (map as unknown as { drawMarks?: (ctx: CanvasRenderingContext2D, model: MapModel, now: number, frozen: boolean) => void }).drawMarks;
    expect(draw).toBeTypeOf("function");
    draw!(context, model, 1000, true);
    expect(commands.filter((c) => c.name === "fillRect")).toEqual([]);
    expect(commands.find((c) => c.name === "fillText")?.args).toEqual(["E", 7.5, 8.5]);
    expect(commands.find((c) => c.name === "fillStyle")?.args).toEqual(["#f8c96e"]);
  });
});
