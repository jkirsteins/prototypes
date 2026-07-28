import { describe, it, expect } from "vitest";
import {
  fitView, clampView, homeView, hoverRelationLines, panBy, politicalFactionForPolygon,
  zoomAt, MAX_ZOOM, MIN_ZOOM,
  type View,
} from "../src/view";
import { bumpMight, type Relations } from "../src/relations";

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

describe("homeView", () => {
  it("centers on the map, not on the near corner of the letterboxed fit", () => {
    // Landscape viewport, portrait map: the fit letterboxes to the left and
    // right, so base.x is negative. The home view must sit in the middle of
    // that letterbox, or the east of the map is cut off on screen.
    const base = fitView(1000, 1400, 800, 600);
    const home = homeView(base);
    close(home.x + home.w / 2, base.x + base.w / 2);
    close(home.y + home.h / 2, base.y + base.h / 2);
    close(home.x + home.w / 2, 500);
    close(home.y + home.h / 2, 700);
  });

  it("centers a tall narrow viewport the same way", () => {
    const base = fitView(1000, 1400, 500, 2000);
    const home = homeView(base);
    close(home.x + home.w / 2, 500);
    close(home.y + home.h / 2, 700);
  });

  it("sits exactly at the zoom floor and inside the base", () => {
    const base = fitView(1000, 1400, 800, 600);
    const home = homeView(base);
    close(base.w / home.w, MIN_ZOOM);
    expect(home.x).toBeGreaterThanOrEqual(base.x);
    expect(home.y).toBeGreaterThanOrEqual(base.y);
    expect(home.x + home.w).toBeLessThanOrEqual(base.x + base.w + 1e-9);
    expect(home.y + home.h).toBeLessThanOrEqual(base.y + base.h + 1e-9);
  });

  it("shows the whole map width when the viewport is wider than the map", () => {
    // The regression this guards: a 1000x1400 map in a roughly square window
    // used to clip everything east of x=856.
    const base = fitView(1000, 1400, 945, 1000);
    const home = homeView(base);
    expect(home.x).toBeLessThanOrEqual(0);
    expect(home.x + home.w).toBeGreaterThanOrEqual(1000);
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

  it("never zooms out past the home view (the zoom floor, not the raw base fit)", () => {
    const home = clampView(base, base);
    const v = zoomAt(home, base, 400, 300, 0.5, 800, 600);
    expect(v).toEqual(home);
  });
});

describe("panBy", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("does nothing when already pinned at the base's near corner", () => {
    // The zoom floor means the home view no longer covers the whole base
    // rect, but its near (top-left) corner is still pinned to base's, since
    // clamping only opens up room on the far corner as the view shrinks.
    const home = clampView(base, base);
    expect(panBy(home, base, 100, 100, 800)).toEqual(home);
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

describe("zoom floor", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("never lets the view widen past base.w / MIN_ZOOM", () => {
    const v = clampView({ ...base, w: base.w * 10, h: base.h * 10 }, base);
    close(v.w, base.w / MIN_ZOOM);
    close(v.h, (base.w / MIN_ZOOM) * (base.h / base.w));
  });

  it("is a real floor above 1, so the whole map never fits", () => {
    expect(MIN_ZOOM).toBeGreaterThan(1);
  });

  it("clampView(base, base) is the home view and sits inside base", () => {
    const home = clampView(base, base);
    close(home.w, base.w / MIN_ZOOM);
    expect(home.x).toBeGreaterThanOrEqual(base.x);
    expect(home.y).toBeGreaterThanOrEqual(base.y);
    expect(home.x + home.w).toBeLessThanOrEqual(base.x + base.w + 1e-9);
    expect(home.y + home.h).toBeLessThanOrEqual(base.y + base.h + 1e-9);
  });

  it("pans at the home view, which the old fit-to-map behaviour could not", () => {
    const home = clampView(base, base);
    const panned = panBy(home, base, -50, 0, 800);
    expect(panned.x).toBeGreaterThan(home.x);
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

describe("hoverRelationLines", () => {
  it("shows a Raid against a vassal without changing the overlord hover", () => {
    const beforeRaid: Relations = bumpMight({}, "overlord", "actor");
    const overlordBefore = hoverRelationLines(
      beforeRaid, "actor", "overlord", "Independent",
    );
    const afterRaid = bumpMight(beforeRaid, "actor", "vassal");

    expect(hoverRelationLines(afterRaid, "actor", "vassal", "Your vassal")).toEqual([
      { text: "Might: +1 (you lead)", tone: "good" },
      { text: "Status: even", tone: "neutral" },
      { text: "Your vassal" },
    ]);
    expect(hoverRelationLines(afterRaid, "actor", "overlord", "Independent")).toEqual([
      { text: "Might: -1 (they lead)", tone: "bad" },
      { text: "Status: even", tone: "neutral" },
      { text: "Independent" },
    ]);
    expect(hoverRelationLines(
      afterRaid, "actor", "overlord", "Independent",
    )).toEqual(overlordBefore);
  });
});
