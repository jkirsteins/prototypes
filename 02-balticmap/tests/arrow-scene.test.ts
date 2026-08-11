// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  ARROW_KINDS, LAYOUT, blockWidthFor, borderKeyOf, laneWidths, layoutLanes,
  renderArrowScene,
  type ArrowSpec, type SceneCtx,
} from "../src/arrow-scene";
import type { Crossing } from "../src/borders";

/** A border running up the y axis at x=0, with "across" pointing at +x. */
const FLAT: Crossing = {
  at: { x: 0, y: 0 },
  tangent: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  span: 200,
  sea: false,
  gap: 0,
};

describe("blockWidthFor", () => {
  it("takes its share of the border", () => {
    expect(blockWidthFor(100)).toBeCloseTo(55, 6);
  });

  it("caps a wide border and floors a tiny one", () => {
    expect(blockWidthFor(1000)).toBe(LAYOUT.blockMax);
    expect(blockWidthFor(4)).toBe(LAYOUT.blockMin);
  });
});

describe("laneWidths", () => {
  it("gives one arrow the whole block whatever its strength", () => {
    expect(laneWidths([1], 90)).toEqual([90]);
    expect(laneWidths([7], 90)).toEqual([90]);
  });

  it("splits by strength share", () => {
    const [a, b] = laneWidths([2, 1], 90);
    expect(a).toBeCloseTo(60, 6);
    expect(b).toBeCloseTo(30, 6);
  });

  it("raises a lane to the floor and shrinks the others to pay for it", () => {
    const widths = laneWidths([9, 1], 60);
    expect(widths[1]).toBeCloseTo(LAYOUT.laneMin, 6);
    expect(widths[0] + widths[1]).toBeCloseTo(60, 6);
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it("shares evenly when the block is narrow", () => {
    const widths = laneWidths([1, 1, 1, 1, 1, 1], 30);
    expect(widths.every((w) => Math.abs(w - 5) < 1e-6)).toBe(true);
  });

  it("never returns a negative width", () => {
    for (const w of laneWidths([50, 1, 1, 1], 30)) expect(w).toBeGreaterThan(0);
  });

  it("returns an empty array for no lanes", () => {
    expect(laneWidths([], 90)).toEqual([]);
  });

  it("splits evenly when all strengths are zero", () => {
    const [a, b] = laneWidths([0, 0], 90);
    expect(a).toBeCloseTo(45, 6);
    expect(b).toBeCloseTo(45, 6);
  });
});

describe("layoutLanes", () => {
  it("packs lanes edge to edge, centred on the crossing", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ]);
    const total = blockWidthFor(FLAT.span);
    expect(lanes[0].width + lanes[1].width).toBeCloseTo(total, 6);
    // Centres are symmetric about the crossing point on the tangent axis.
    expect(lanes[0].ay + lanes[1].ay).toBeCloseTo(0, 6);
  });

  it("runs a forward lane along the normal and a backward one against it", () => {
    const [fwd, back] = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: false },
    ]);
    expect(fwd.bx).toBeGreaterThan(fwd.ax);
    expect(back.bx).toBeLessThan(back.ax);
  });

  it("starts inside the origin and ends inside the target", () => {
    const [lane] = layoutLanes(FLAT, [{ strength: 1, forward: true }]);
    expect(lane.ax).toBeCloseTo(-LAYOUT.tailDepth, 6);
    expect(lane.bx).toBeCloseTo(LAYOUT.headDepth, 6);
  });

  it("spans the water on a sea crossing instead of standing in it", () => {
    const strait: Crossing = { ...FLAT, sea: true, gap: 100 };
    const [lane] = layoutLanes(strait, [{ strength: 1, forward: true }]);
    expect(lane.bx - lane.ax).toBeCloseTo(100 + LAYOUT.seaClearance * 2, 6);
  });

  it("keeps the caller's order", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 3, forward: true }, { strength: 1, forward: false },
      { strength: 2, forward: true },
    ]);
    expect(lanes.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(lanes[0].width).toBeGreaterThan(lanes[2].width);
  });
});

const NS = "http://www.w3.org/2000/svg";

const ctx: SceneCtx = {
  crossingFor: (from, to) => ({
    at: { x: 0, y: 0 },
    tangent: { x: 0, y: 1 },
    // Every pair in these tests crosses west to east, and back the other way
    // when the caller names them the other way round.
    normal: from < to ? { x: 1, y: 0 } : { x: -1, y: 0 },
    span: 200, sea: false, gap: 0,
  }),
  freeAnchor: () => ({ x: -100, y: 0 }),
};

const march = (id: string, from: string, to: string, strength: number): ArrowSpec => ({
  id, kind: "march", from, to, strength, tone: "hostile", label: `${strength} STR`,
});

describe("borderKeyOf", () => {
  it("names one border whichever way it is crossed", () => {
    expect(borderKeyOf("a", "b")).toBe(borderKeyOf("b", "a"));
  });
});

describe("ARROW_KINDS", () => {
  it("classifies every kind and says why", () => {
    for (const def of Object.values(ARROW_KINDS)) {
      expect(def.className.length).toBeGreaterThan(0);
      expect(def.why.length).toBeGreaterThan(20);
    }
  });
});

describe("renderArrowScene", () => {
  it("draws one group per spec, keyed by id", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 2), march("m2", "b", "a", 1),
    ], ctx);
    expect(drawn.size).toBe(2);
    expect(drawn.get("m1")?.querySelector("polygon")).not.toBeNull();
    expect(host.children).toHaveLength(2);
  });

  it("gives the stronger arrow the wider lane on the same border", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 3), march("m2", "b", "a", 1),
    ], ctx);
    const spread = (id: string): number => {
      const pts = (drawn.get(id)?.querySelector("polygon")
        ?.getAttribute("points") ?? "")
        .split(" ").map((p) => Number(p.split(",")[1]));
      return Math.max(...pts) - Math.min(...pts);
    };
    expect(spread("m1")).toBeGreaterThan(spread("m2"));
  });

  it("rebuilds from nothing, so a stale arrow cannot survive", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    renderArrowScene(host, [march("m2", "a", "b", 1)], ctx);
    expect(host.children).toHaveLength(1);
  });

  it("carries the caller's dataset onto the group", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      ...march("m1", "a", "b", 1), dataset: { actor: "a", target: "b", from: "a" },
    }], ctx);
    expect(drawn.get("m1")?.dataset.actor).toBe("a");
  });

  it("draws a claim as a demand, with no polygon and no strength", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      id: "c1", kind: "claim", from: "a", to: "b", strength: 1,
      tone: "other", label: "SUBJUGATE",
    }], ctx);
    const g = drawn.get("c1");
    expect(g?.querySelector("polygon")).toBeNull();
    expect(g?.querySelector("line")).not.toBeNull();
    expect(g?.querySelector("circle")).not.toBeNull();
  });

  it("packs a claim into the same block as the raids beside it", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 1),
      { id: "c1", kind: "claim", from: "a", to: "b", strength: 1, tone: "other" },
    ], ctx);
    const y = (id: string): number =>
      Number(drawn.get(id)?.querySelector("line, polygon")
        ?.getAttribute("y1") ?? NaN);
    // Two lanes on one border sit at different offsets along the tangent.
    expect(host.children).toHaveLength(2);
    expect(y("c1")).not.toBe(0);
  });

  it("draws a free-aimed spec to its own point", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      id: "aim", kind: "aim", from: "a", to: "", at: { x: 40, y: 40 },
      strength: 2, tone: "ours",
    }], ctx);
    expect(drawn.get("aim")?.querySelector("polygon")).not.toBeNull();
  });

  it("skips a spec whose lands have no crossing rather than drawing NaN", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const none: SceneCtx = { crossingFor: () => null, freeAnchor: () => null };
    const drawn = renderArrowScene(host, [march("m1", "a", "b", 1)], none);
    expect(drawn.size).toBe(0);
    expect(host.children).toHaveLength(0);
  });
});
