import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DETAIL_LAYERS, ALL_DETAIL_CLASSES, GROUP_LABEL_CLASS, GROUP_LABEL_PX,
  GROUP_LABEL_SELECTOR, MIN_LABEL_PX, detailClassesAt,
} from "../src/map-detail";

/** The font-size declared for `selector` in style.css, or null. */
function cssFontPx(selector: string): number | null {
  const css = readFileSync("src/style.css", "utf8");
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  const block = css.slice(at, css.indexOf("}", at));
  const m = block.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  return m === null ? null : Number(m[1]);
}

describe("detail ladder", () => {
  it("declares each layer's size once, in the stylesheet", () => {
    for (const layer of DETAIL_LAYERS) {
      expect(cssFontPx(layer.selector), layer.selector).toBe(layer.fontPx);
    }
    expect(cssFontPx(GROUP_LABEL_SELECTOR)).toBe(GROUP_LABEL_PX);
  });

  it("layers are ascending by size, which is the order they drop out", () => {
    const sizes = DETAIL_LAYERS.map((l) => l.fontPx);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(DETAIL_LAYERS.map((l) => l.hideClass)).size)
      .toBe(DETAIL_LAYERS.length);
  });

  it("hides a layer exactly below its own legibility scale", () => {
    for (const layer of DETAIL_LAYERS) {
      const at = (layer.minPx ?? MIN_LABEL_PX) / layer.fontPx;
      expect(detailClassesAt(at * 1.001)).not.toContain(layer.hideClass);
      expect(detailClassesAt(at * 0.999)).toContain(layer.hideClass);
    }
  });

  it("gives the people layer its own, higher floor", () => {
    // An area heading stops doing its job well before it becomes illegible,
    // so its threshold cannot be the shared MIN_LABEL_PX - see the doc
    // comment on DetailLayer.minPx.
    const people = DETAIL_LAYERS.find((l) => l.selector === ".label-people")!;
    expect(people.minPx).toBe(12);
    expect(people.minPx).toBeGreaterThan(MIN_LABEL_PX);
  });

  it("swaps people labels for group labels at both maps' real scales", () => {
    // Pinned to the numbers a Chrome pass actually measured (see the
    // 2026-08-10 fix report): the default view of each map keeps people
    // labels and hides the group heading; the zoom floor of each map does
    // the opposite. A regression here is exactly "the swap went dead again".
    const cases: Array<[name: string, scale: number, peopleVisible: boolean]> = [
      ["baltic default", 0.478, true],
      ["iberia default", 0.582, true],
      ["baltic floor", 0.288, false],
      ["iberia floor", 0.267, false],
    ];
    for (const [name, scale, peopleVisible] of cases) {
      const on = detailClassesAt(scale);
      expect(on.includes("hide-people-labels"), name).toBe(!peopleVisible);
      expect(on.includes(GROUP_LABEL_CLASS), name).toBe(!peopleVisible);
    }
  });

  it("drops the smallest text first and the largest last", () => {
    const counts = [2, 1, 0.5, 0.4, 0.3, 0.2, 0.1]
      .map((s) => detailClassesAt(s).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(detailClassesAt(2)).toEqual([]);
  });

  it("group labels are shown exactly when the people labels are gone", () => {
    const people = DETAIL_LAYERS.find((l) => l.selector === ".label-people")!;
    for (const scale of [2, 1, 0.5, 0.35, 0.26, 0.2, 0.1, 0.05]) {
      const on = detailClassesAt(scale);
      expect(on.includes(GROUP_LABEL_CLASS), `scale ${scale}`)
        .toBe(on.includes(people.hideClass));
    }
  });

  it("every class it can return is in ALL_DETAIL_CLASSES", () => {
    for (const scale of [4, 1, 0.5, 0.3, 0.2, 0.05, 0.001]) {
      for (const c of detailClassesAt(scale)) {
        expect(ALL_DETAIL_CLASSES).toContain(c);
      }
    }
  });
});
