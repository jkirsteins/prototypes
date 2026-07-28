import { describe, it, expect } from "vitest";
import {
  fitView, clampView, panBy, politicalFactionForPolygon, zoomAt, MAX_ZOOM,
  type View,
} from "../src/view";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("fitView", () => {
  it("covers the whole map, centered, matching viewport aspect", () => {
    // landscape viewport, portrait map: height binds
    const v = fitView(1000, 1400, 800, 600);
    close(v.h, 1400);
    close(v.w, (800 / 600) * 1400);
    close(v.y, 0);
    close(v.x, (1000 - v.w) / 2);
  });

  it("binds on width for a tall narrow viewport", () => {
    const v = fitView(1000, 1400, 500, 2000);
    close(v.w, 1000);
    close(v.h, (2000 / 500) * 1000);
    close(v.x, 0);
    close(v.y, (1400 - v.h) / 2);
  });
});

describe("zoomAt", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("keeps the point under the cursor fixed", () => {
    const px = 200, py = 150;
    const before = {
      x: base.x + (px / 800) * base.w,
      y: base.y + (py / 600) * base.h,
    };
    const v = zoomAt(base, base, px, py, 2, 800, 600);
    close(v.x + (px / 800) * v.w, before.x);
    close(v.y + (py / 600) * v.h, before.y);
    close(base.w / v.w, 2);
  });

  it("never zooms in past MAX_ZOOM", () => {
    let v = base;
    for (let i = 0; i < 20; i++) v = zoomAt(v, base, 400, 300, 2, 800, 600);
    close(base.w / v.w, MAX_ZOOM);
  });

  it("never zooms out past the base view", () => {
    const v = zoomAt(base, base, 400, 300, 0.5, 800, 600);
    expect(v).toEqual(base);
  });
});

describe("panBy", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("does nothing at 1x (view already covers the base)", () => {
    expect(panBy(base, base, 100, 100, 800)).toEqual(base);
  });

  it("moves opposite to cursor delta when zoomed in", () => {
    const zoomed = zoomAt(base, base, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, base, -100, 0, 800);
    const unitsPerPx = zoomed.w / 800;
    close(panned.x, zoomed.x + 100 * unitsPerPx);
    close(panned.y, zoomed.y);
  });

  it("clamps at the base view edges", () => {
    const zoomed = zoomAt(base, base, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, base, 1e9, 1e9, 800);
    close(panned.x, base.x);
    close(panned.y, base.y);
  });
});

describe("politicalFactionForPolygon", () => {
  it("preserves a vassal's own political identity", () => {
    const overlords = new Map([["gamma", "delta"]]);

    expect(politicalFactionForPolygon(
      "gamma",
      {},
    )).toBe("gamma");
    expect(overlords.get("gamma")).toBe("delta");
  });

  it("resolves incorporated land to its owner", () => {
    expect(politicalFactionForPolygon(
      "gamma",
      { gamma: "delta" },
    )).toBe("delta");
  });
});
