// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  ARROW_EMPHASIS, ARROW_KINDS, ARROW_MOTION_MS, LAYOUT, blockWidthFor,
  borderKeyOf, emphasisFor, laneWidthFor, layoutLanes, renderArrowScene,
  unitWidthFor, type ArrowCues, type ArrowSpec, type Rect, type SceneCtx,
} from "../src/arrow-scene";
import {
  ARROW_DEPTHS, crossingBetween, type Crossing, type Station,
} from "../src/borders";

/** A station table for a straight border, one station every `gap` units of
 *  tangent, all with the same room. */
const stationsFor = (
  into: number, out: number, count = 9, gap = 12,
): Station[] =>
  Array.from({ length: count }, (_, i) => {
    const s = (i - (count - 1) / 2) * gap;
    return { at: { x: 0, y: s }, s, into, out };
  });

/** A border running up the y axis at x=0, with "across" pointing at +x. */
const FLAT: Crossing = {
  at: { x: 0, y: 0 },
  tangent: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  span: 200,
  sea: false,
  gap: 0,
  stations: stationsFor(ARROW_DEPTHS.head, ARROW_DEPTHS.tail),
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

describe("unitWidthFor", () => {
  it("gives a solitary arrow its border's whole block", () => {
    // The point of the scale being map-wide: an arrow sharing the map with
    // nothing is relative only to itself, so it is drawn exactly as wide as
    // it was when a lone arrow simply took the block.
    const wide = unitWidthFor([{ span: 200, strengths: [1] }]);
    expect(laneWidthFor(1, wide)).toBeCloseTo(blockWidthFor(200), 6);
    const narrow = unitWidthFor([{ span: 40, strengths: [1] }]);
    expect(laneWidthFor(1, narrow)).toBeCloseTo(blockWidthFor(40), 6);
  });

  it("sizes a lone strong arrow by its block, not by its strength", () => {
    // Nothing on screen to be compared against, so the whole block is its own
    // whatever it carries - the same answer the share rule gave.
    const unit = unitWidthFor([{ span: 200, strengths: [9] }]);
    expect(laneWidthFor(9, unit)).toBeCloseTo(blockWidthFor(200), 6);
  });

  it("draws equal strengths equally however wide their borders are", () => {
    // The bug this rule exists for: two 1 STR arrows, one alone on a broad
    // frontier and one on a cramped border, read as different strengths
    // because each took its own block.
    const unit = unitWidthFor([
      { span: 300, strengths: [1] },
      { span: 40, strengths: [1] },
    ]);
    expect(laneWidthFor(1, unit)).toBeCloseTo(laneWidthFor(1, unit), 6);
    // And the pair is sized by the tighter of the two, so neither overruns.
    expect(laneWidthFor(1, unit)).toBeCloseTo(blockWidthFor(40), 6);
  });

  it("keeps the strength ratio across different borders", () => {
    // 4 STR is twice a Raid - the square root, so width reads as area and a
    // 16 STR arrow is four Raids rather than sixteen.
    const unit = unitWidthFor([
      { span: 300, strengths: [1] },
      { span: 300, strengths: [4] },
    ]);
    expect(laneWidthFor(4, unit) / laneWidthFor(1, unit)).toBeCloseTo(2, 6);
    expect(laneWidthFor(16, unit) / laneWidthFor(1, unit)).toBeCloseTo(4, 6);
  });

  it("fits the block of the busiest border it is given", () => {
    const unit = unitWidthFor([{ span: 300, strengths: [1, 1, 1] }]);
    const block = [1, 1, 1].reduce((s, v) => s + laneWidthFor(v, unit), 0);
    expect(block).toBeCloseTo(blockWidthFor(300), 6);
  });

  it("overruns rather than shrinking every arrow past reading", () => {
    // The trade `blockMin` already makes for the ground, applied to the
    // scale: an arrow nobody can see is worse than a block wider than the
    // border it crosses.
    const unit = unitWidthFor([{ span: 10, strengths: [1, 1, 1, 1, 1, 1] }]);
    expect(unit).toBe(LAYOUT.laneMin);
    expect(laneWidthFor(1, unit)).toBe(LAYOUT.laneMin);
  });

  it("ignores a border carrying nothing, and an empty map", () => {
    expect(unitWidthFor([])).toBe(LAYOUT.blockMax);
    expect(unitWidthFor([{ span: 10, strengths: [] }])).toBe(LAYOUT.blockMax);
  });

  it("never returns a negative width for a strength that is not one", () => {
    const unit = unitWidthFor([{ span: 200, strengths: [0, -3] }]);
    expect(laneWidthFor(0, unit)).toBeGreaterThan(0);
    expect(laneWidthFor(-3, unit)).toBeGreaterThan(0);
  });
});

describe("layoutLanes", () => {
  /** The scale a border gets when it is the only one on the map. */
  const aloneOn = (cross: Crossing, strengths: number[]): number =>
    unitWidthFor([{ span: cross.span, strengths }]);

  it("packs lanes edge to edge, centred on the crossing", () => {
    const unit = aloneOn(FLAT, [1, 1]);
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ], unit);
    const total = blockWidthFor(FLAT.span);
    expect(lanes[0].width + lanes[1].width).toBeCloseTo(total, 6);
    // Centres are symmetric about the crossing point on the tangent axis.
    expect(lanes[0].ay + lanes[1].ay).toBeCloseTo(0, 6);
  });

  it("runs a forward lane along the normal and a backward one against it", () => {
    const [fwd, back] = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: false },
    ], aloneOn(FLAT, [1, 1]));
    expect(fwd.bx).toBeGreaterThan(fwd.ax);
    expect(back.bx).toBeLessThan(back.ax);
  });

  it("starts inside the origin and ends inside the target", () => {
    const [lane] = layoutLanes(
      FLAT, [{ strength: 1, forward: true }], aloneOn(FLAT, [1]),
    );
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.head, 6);
  });

  it("reaches only as far as its station has room", () => {
    const shallow: Crossing = { ...FLAT, stations: stationsFor(20, ARROW_DEPTHS.tail) };
    const [lane] = layoutLanes(
      shallow, [{ strength: 1, forward: true }], aloneOn(shallow, [1]),
    );
    expect(lane.bx).toBeCloseTo(20, 6);
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
  });

  it("reads a backward lane's room the other way round", () => {
    // `into` is room in the second land, so a lane running back into the FIRST
    // land is bounded by `out` at its head.
    const lopsided: Crossing = { ...FLAT, stations: stationsFor(30, 15) };
    const [lane] = layoutLanes(
      lopsided, [{ strength: 1, forward: false }], aloneOn(lopsided, [1]),
    );
    expect(lane.ax - lane.bx).toBeCloseTo(15 + 30, 6);
    expect(lane.bx).toBeCloseTo(-15, 6);
  });

  it("floors a station too shallow to draw on", () => {
    const pinch: Crossing = { ...FLAT, stations: stationsFor(3, 4) };
    const [lane] = layoutLanes(
      pinch, [{ strength: 1, forward: true }], aloneOn(pinch, [1]),
    );
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.min, 6);
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.min, 6);
  });

  it("gives each lane of a block its own station", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
      { strength: 1, forward: true },
    ], aloneOn(FLAT, [1, 1, 1]));
    const seen = lanes.map((l) => l.ay);
    expect(new Set(seen).size).toBe(3);
    // In order along the border, which is declaration order.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("deals the stations out along the border, in declaration order", () => {
    // Lane 0 is offset furthest from the only two roomy stations, so a search
    // that made each lane come after its neighbour would strand it. Both are
    // used, and they are handed out in border order.
    const two: Crossing = {
      ...FLAT,
      stations: [
        { at: { x: 0, y: -6 }, s: -6, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
        { at: { x: 0, y: 6 }, s: 6, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
      ],
    };
    const lanes = layoutLanes(two, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ], aloneOn(two, [1, 1]));
    expect(lanes.map((l) => l.ay)).toEqual([-6, 6]);
  });

  it("skips a station that cannot be crossed", () => {
    const holed: Crossing = {
      ...FLAT,
      stations: [
        { at: { x: 0, y: -12 }, s: -12, into: -1, out: -1 },
        { at: { x: 0, y: 0 }, s: 0, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
        { at: { x: 0, y: 12 }, s: 12, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
      ],
    };
    const lanes = layoutLanes(holed, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ], aloneOn(holed, [1, 1]));
    expect(lanes.map((l) => l.ay)).toEqual([0, 12]);
  });

  it("falls back to the tangent where a crossing has no stations", () => {
    const bare: Crossing = { ...FLAT, stations: [] };
    const [lane] = layoutLanes(
      bare, [{ strength: 1, forward: true }], aloneOn(bare, [1]),
    );
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.head, 6);
  });

  it("spans the water on a sea crossing instead of standing in it", () => {
    const across = 100 / 2 + ARROW_DEPTHS.seaClearance;
    const strait: Crossing = {
      ...FLAT, sea: true, gap: 100,
      stations: [{ at: { x: 0, y: 0 }, s: 0, into: across, out: across }],
    };
    const [lane] = layoutLanes(
      strait, [{ strength: 1, forward: true }], aloneOn(strait, [1]),
    );
    expect(lane.bx - lane.ax).toBeCloseTo(100 + ARROW_DEPTHS.seaClearance * 2, 6);
  });

  it("spans the water on every lane of a sea block", () => {
    // Through the REAL crossing, because the station table a strait is given
    // is half of what makes this work and a hand-built one here would be
    // checking the test's own copy of it. An attack and the counter answering
    // it is the commonest block on the map: with a single station the counter
    // found none, fell back to the land depths, and was drawn as a full-length
    // arrow in the middle of the sea with neither end on a coast.
    const west = [[
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 60 }, { x: 0, y: 60 },
    ]];
    const east = [[
      { x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 60 }, { x: 40, y: 60 },
    ]];
    const strait = crossingBetween(west, east);
    expect(strait.sea).toBe(true);
    const want = strait.gap + ARROW_DEPTHS.seaClearance * 2;
    for (const shape of [[true, false], [true, false, true]]) {
      const items = shape.map((forward) => ({ strength: 1, forward }));
      const lanes = layoutLanes(strait, items, aloneOn(strait, items.map(() => 1)));
      expect(lanes).toHaveLength(shape.length);
      for (const lane of lanes) {
        expect(Math.hypot(lane.bx - lane.ax, lane.by - lane.ay)).toBeCloseTo(want, 6);
      }
      // And each on its own place along the water, not stacked at the middle.
      expect(new Set(lanes.map((l) => l.ay)).size).toBe(shape.length);
    }
  });

  it("keeps two lanes at least their own widths apart along the border", () => {
    // Stations half a unit apart, which is what this map's borders really look
    // like where the outline is finely cut. Taking the free station nearest
    // each lane's own offset and nothing else put two arrows closer together
    // than their own widths on 364 of 848 lane pairs, the worst 24 units into
    // each other - two arrows drawn on top of one another on a border the
    // block is supposed to be packed along.
    const crowded: Crossing = {
      ...FLAT,
      stations: Array.from({ length: 241 }, (_, i) => {
        const s = (i - 120) * 0.5;
        return { at: { x: 0, y: s }, s, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail };
      }),
    };
    const lanes = layoutLanes(crowded, [
      { strength: 1, forward: true }, { strength: 1, forward: false },
      { strength: 1, forward: true },
    ], aloneOn(crowded, [1, 1, 1]));
    const centre = (lane: typeof lanes[number]): number => (lane.ay + lane.by) / 2;
    for (let i = 1; i < lanes.length; i++) {
      const apart = Math.abs(centre(lanes[i]) - centre(lanes[i - 1]));
      expect(apart).toBeGreaterThanOrEqual(
        (lanes[i].width + lanes[i - 1].width) / 2 - 1e-9,
      );
    }
  });

  it("keeps the caller's order", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 3, forward: true }, { strength: 1, forward: false },
      { strength: 2, forward: true },
    ], aloneOn(FLAT, [3, 1, 2]));
    expect(lanes.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(lanes[0].width).toBeGreaterThan(lanes[2].width);
  });

  it("takes its width from the scale, not from its own border", () => {
    // A wide border laid out at a scale some cramped border elsewhere set:
    // the block shrinks with the map rather than filling the ground it has.
    const tight = unitWidthFor([
      { span: FLAT.span, strengths: [1] }, { span: 30, strengths: [1, 1] },
    ]);
    const [lane] = layoutLanes(
      FLAT, [{ strength: 1, forward: true }], tight,
    );
    expect(lane.width).toBeLessThan(blockWidthFor(FLAT.span));
    expect(lane.width).toBeCloseTo(laneWidthFor(1, tight), 6);
  });
});

const NS = "http://www.w3.org/2000/svg";

const ctx: SceneCtx = {
  crossingFor: (from, to) => ({
    at: { x: 0, y: 0 },
    // A station every 12 units of tangent, roomy on both sides, so the render
    // tests exercise the real station path - several lanes sharing a border
    // still find their own place - rather than the tangent fallback.
    stations: stationsFor(ARROW_DEPTHS.head, ARROW_DEPTHS.tail),
    tangent: { x: 0, y: 1 },
    // Every pair in these tests crosses west to east, and back the other way
    // when the caller names them the other way round.
    normal: from < to ? { x: 1, y: 0 } : { x: -1, y: 0 },
    span: 200, sea: false, gap: 0,
  }),
  freeAnchor: () => ({ x: -100, y: 0 }),
};

/** How much of two boxes lies in both, which is the whole question a chip
 *  standing clear of a badge is asking. */
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

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
      expect(def.labelClass.length).toBeGreaterThan(0);
      expect(def.why.length).toBeGreaterThan(20);
    }
  });
});

describe("emphasisFor", () => {
  const cues = (over: Partial<ArrowCues> = {}): ArrowCues => ({
    live: false, anyFocus: false, onFocus: false,
    pinnedOut: false, aiming: false, atAimTarget: false, ...over,
  });

  it("leaves an arrow nothing is being asked about at full", () => {
    expect(emphasisFor(cues())).toBe("full");
  });

  it("fades every arrow but the one under the pointer", () => {
    expect(emphasisFor(cues({ anyFocus: true }))).toBe("faded");
    expect(emphasisFor(cues({ anyFocus: true, onFocus: true }))).toBe("full");
  });

  it("dims what a pin is not about", () => {
    expect(emphasisFor(cues({ pinnedOut: true }))).toBe("dimmed");
  });

  it("puts an aim ahead of nothing and a pin ahead of an aim", () => {
    // Starting an aim must not un-dim what the pin put away.
    expect(emphasisFor(cues({ pinnedOut: true, aiming: true }))).toBe("dimmed");
    expect(emphasisFor(cues({ aiming: true }))).toBe("back");
  });

  it("keeps an arrow landing where the player is aiming at full", () => {
    expect(emphasisFor(cues({ aiming: true, atAimTarget: true }))).toBe("full");
  });

  it("never quietens the arrow a beat is about, or the aim itself", () => {
    expect(emphasisFor(cues({ live: true, anyFocus: true }))).toBe("full");
    expect(emphasisFor(cues({ live: true, pinnedOut: true, aiming: true }))).toBe("full");
  });

  it("names a class for every emphasis and no two the same", () => {
    const names = Object.values(ARROW_EMPHASIS).map((e) => e.className);
    expect(new Set(names).size).toBe(names.length);
    for (const e of Object.values(ARROW_EMPHASIS)) {
      expect(e.why.length).toBeGreaterThan(20);
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

  it("keeps each arrow's own direction whichever spec the border's group lists first", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    // The b->a spec is listed FIRST here on purpose: a frame anchored to
    // whichever spec happens to be array-first, rather than to the border's
    // own canonical pair, hands every arrow on this border a normal facing
    // the wrong way the moment the higher-sorting land is named first.
    const drawn = renderArrowScene(host, [
      march("m2", "b", "a", 1), march("m1", "a", "b", 1),
    ], ctx);
    const pointAt = (id: string, i: number): number =>
      Number((drawn.get(id)?.querySelector("polygon")
        ?.getAttribute("points") ?? "").split(" ")[i]?.split(",")[0]);
    const tail = (id: string): number => pointAt(id, 0);
    const tip = (id: string): number => pointAt(id, 3);
    // ctx's normal runs a->b, so the a->b arrow's tip sits further along it
    // (a higher x) than its tail, and the b->a arrow's tip sits further
    // against it (a lower x) than its tail.
    expect(tip("m1")).toBeGreaterThan(tail("m1"));
    expect(tip("m2")).toBeLessThan(tail("m2"));
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

  it("says what is on the board now, never what is still fading off it", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    const drawn = renderArrowScene(host, [march("m2", "a", "b", 1)], ctx);
    expect([...drawn.keys()]).toEqual(["m2"]);
  });

  it("says when an arrow lands, and only where that is not tomorrow", () => {
    // Every arrow used to land next turn, so "lands in 1" is the reading a
    // player already has and printing it everywhere would bury the one arrow
    // that is genuinely days away.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("soon", "a", "b", 1), arrivesIn: 1 },
      { ...march("far", "b", "a", 1), arrivesIn: 3 },
    ], ctx);
    const chip = (id: string): string | null =>
      drawn.get(id)?.querySelector(".march-order-text")?.textContent ?? null;
    expect(chip("soon")).toBeNull();
    expect(chip("far")).toBe("lands in 3");
  });

  it("keeps the landing order and the arrival on ONE chip behind the tail", () => {
    // Two badges behind the tail collide on any border carrying three arrows,
    // which is the reason the ordinal is not on the shaft to begin with. And
    // nothing about the arrival may reach the shaft: the shaft carries exactly
    // one number, which is what makes the bare "1 STR" form readable.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      {
        ...march("m1", "a", "b", 1),
        chip: { order: 2, clash: false }, arrivesIn: 3,
      },
    ], ctx);
    const g = drawn.get("m1")!;
    expect(g.querySelectorAll(".march-order")).toHaveLength(1);
    expect(g.querySelector(".march-order-text")?.textContent)
      .toBe("2nd - lands in 3");
    expect(g.querySelector(".march-strength")?.textContent).toBe("1 STR");
  });

  it("steps the chip out from under what the map has already drawn", () => {
    // The station behind the tail points into the land the army marched out
    // of, which is where that land's defense badge sits: on the deployed
    // build `lands in 2` lost 15 of its 27 text pixels to a `1/3` badge. The
    // obstacle here IS the box the chip takes when nothing is in its way, so
    // a chip that did not move would be wholly covered by it.
    const spec: ArrowSpec = { ...march("m1", "a", "b", 1), arrivesIn: 3 };
    const chipBoxOf = (host: SVGGElement): Rect => {
      const bg = host.querySelector(".march-order-bg")!;
      const num = (name: string) => Number(bg.getAttribute(name));
      return {
        x: num("x"), y: num("y"), w: num("width"), h: num("height"),
      };
    };
    const open = document.createElementNS(NS, "g") as SVGGElement;
    renderArrowScene(open, [spec], ctx);
    const under = chipBoxOf(open);

    const blocked = document.createElementNS(NS, "g") as SVGGElement;
    renderArrowScene(blocked, [spec], { ...ctx, keepOut: () => [under] });
    const moved = chipBoxOf(blocked);
    expect(overlap(moved, under)).toBe(0);
    // Moved, not shrunk or dropped: the sentence the stage exists to deliver
    // is still there and still says the same thing.
    expect(blocked.querySelector(".march-order-text")?.textContent)
      .toBe("lands in 3");
    expect(moved.w).toBe(under.w);
  });

  it("takes the least-covered station when nothing is clear", () => {
    // A keep-out the size of the county cannot be dodged. The chip must still
    // land somewhere fixed - a chip that jittered between renders would be
    // worse than one under a badge - and somewhere no worse than the base.
    const spec: ArrowSpec = { ...march("m1", "a", "b", 1), arrivesIn: 3 };
    const everywhere: Rect = { x: -1000, y: -1000, w: 2000, h: 2000 };
    const boxes: Rect[] = [];
    for (let i = 0; i < 2; i++) {
      const host = document.createElementNS(NS, "g") as SVGGElement;
      renderArrowScene(host, [spec], { ...ctx, keepOut: () => [everywhere] });
      const bg = host.querySelector(".march-order-bg")!;
      boxes.push({
        x: Number(bg.getAttribute("x")), y: Number(bg.getAttribute("y")),
        w: Number(bg.getAttribute("width")),
        h: Number(bg.getAttribute("height")),
      });
    }
    expect(boxes[0]).toEqual(boxes[1]);
  });

  it("marks an army walking overland, and leaves a strait crossing alone", () => {
    // Two lands three hops apart share no vertex, so the crossing they get is
    // the one built for a strait. The arrow must not read as a sea crossing:
    // the dashed casing is the only difference, so the shape, the colour and
    // the width still say whose army it is and how strong.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("far", "a", "b", 1), overland: true },
      march("near", "b", "a", 1),
    ], ctx);
    expect(drawn.get("far")?.classList.contains("march-overland")).toBe(true);
    expect(drawn.get("near")?.classList.contains("march-overland")).toBe(false);
    // Same spear either way - the cue is the casing and nothing else.
    expect(drawn.get("far")?.querySelector("polygon")).not.toBeNull();
  });

  it("dresses a brand new arrow with the emphasis that decides how loud it is", () => {
    // The class has to be on the element the render that CREATES it, because
    // the enter fade rises to the opacity that element has once it is in the
    // tree. An emphasis applied by a later pass is one the fade was never told
    // about, and the arrow drops to it in the one frame the fade ends on.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("m1", "a", "b", 1), emphasis: "dimmed" },
      { ...march("m2", "b", "a", 1), emphasis: "faded" },
    ], ctx);
    expect(drawn.get("m1")?.classList.contains("arrow-dim")).toBe(true);
    expect(drawn.get("m2")?.classList.contains("arrow-faded")).toBe(true);
    // And off again with the spec that stops asking for it, the same way every
    // other class in the whole-attribute write goes.
    const again = renderArrowScene(host, [
      march("m1", "a", "b", 1), march("m2", "b", "a", 1),
    ], ctx);
    expect(again.get("m1")?.classList.contains("arrow-dim")).toBe(false);
    expect(again.get("m2")?.classList.contains("arrow-faded")).toBe(false);
  });

  it("writes the emphasis onto the arrow", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("m1", "a", "b", 1), emphasis: "dimmed" },
    ], ctx);
    expect(drawn.get("m1")?.getAttribute("class"))
      .toContain(ARROW_EMPHASIS.dimmed.className);
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

  /** Every y a polygon touches. `ctx` lays its lanes out along y, so the span
   *  between these is the width of the lane the arrow was given. */
  const ys = (g: SVGGElement | undefined): number[] =>
    (g?.querySelector("polygon")?.getAttribute("points") ?? "")
      .split(" ").filter(Boolean).map((p) => Number(p.split(",")[1]));

  it("packs an aim preview into the block beside the arrow it answers", () => {
    // The commonest aim there is: answering an incoming raid back down the
    // border it came over. Drawn in a scene of its own the preview took the
    // whole block and was painted on top of that raid.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const alone = renderArrowScene(host, [{
      id: "aim", kind: "aim", from: "b", to: "a", strength: 1, tone: "ours",
    }], ctx);
    const wholeBlock = ys(alone.get("aim"));
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 1),
      { id: "aim", kind: "aim", from: "b", to: "a", strength: 1, tone: "ours" },
    ], ctx);
    const raid = ys(drawn.get("m1"));
    const aim = ys(drawn.get("aim"));
    expect(raid).not.toHaveLength(0);
    expect(aim).not.toHaveLength(0);
    // Beside, not over: neither polygon reaches into the other's lane.
    expect(Math.max(...raid)).toBeLessThanOrEqual(Math.min(...aim));
    // And narrower than the same preview drawn with the border to itself.
    const span = (v: number[]): number => Math.max(...v) - Math.min(...v);
    expect(span(aim)).toBeLessThan(span(wholeBlock));
  });

  it("draws a free-aimed spec to its own point", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      id: "aim", kind: "aim", from: "a", to: "", at: { x: 40, y: 40 },
      strength: 2, tone: "ours",
    }], ctx);
    expect(drawn.get("aim")?.querySelector("polygon")).not.toBeNull();
  });

  /** The label's x, which is what `labelAt` moves: `ctx`'s normal runs along
   *  x, so a fraction from tail to tip reads straight off that coordinate. */
  const labelX = (g: SVGGElement | undefined): number =>
    Number(g?.querySelector("text")?.getAttribute("x") ?? NaN);

  it("puts a label at the fraction the spec asks for", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const at = (labelAt: number): number => {
      const drawn = renderArrowScene(host, [{
        ...march("m1", "a", "b", 1), label: "+1", labelAt,
      }], ctx);
      return labelX(drawn.get("m1"));
    };
    // Nearer the tail against nearer the tip, on an arrow running along +x.
    expect(at(0.15)).toBeLessThan(at(0.85));
  });

  it("keeps the kind's own station when no fraction is asked for", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const plain = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    const station = labelX(plain.get("m1"));
    const moved = renderArrowScene(host, [{
      ...march("m1", "a", "b", 1), labelAt: 0.95,
    }], ctx);
    expect(Number.isNaN(station)).toBe(false);
    expect(labelX(moved.get("m1"))).not.toBeCloseTo(station, 6);
  });

  it("labels each kind in its own class, so a clash is not styled as a strength", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("m1", "a", "b", 1) },
      { id: "g1", kind: "ghost", from: "a", to: "b", strength: 1,
        tone: "ours", label: "+1", labelAt: 0.5 },
    ], ctx);
    expect(drawn.get("m1")?.querySelector("text")?.getAttribute("class"))
      .toBe(ARROW_KINDS.march.labelClass);
    expect(drawn.get("g1")?.querySelector("text")?.getAttribute("class"))
      .toBe(ARROW_KINDS.ghost.labelClass);
  });

  it("packs what a landing left beside the arrows still crossing there", () => {
    // The resolution is a lane in the same block, not a layer over it: a
    // border carrying a demand while a march lands on it shows both, side by
    // side, and neither is drawn on top of the other.
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 1),
      { id: "resolution:3:7:b", kind: "ghost", from: "b", to: "a",
        strength: 2, tone: "hostile", label: "2/2 DMG", labelAt: 0.85 },
    ], ctx);
    const live = ys(drawn.get("m1"));
    const left = ys(drawn.get("resolution:3:7:b"));
    expect(live).not.toHaveLength(0);
    expect(left).not.toHaveLength(0);
    expect(Math.max(...live)).toBeLessThanOrEqual(Math.min(...left));
  });

  it("draws one arrow for a key however many specs claim it", () => {
    vi.useFakeTimers();
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 1), march("m1", "a", "b", 2),
    ], ctx);
    expect(drawn.size).toBe(1);
    expect(host.children).toHaveLength(1);
    // And the one drawn is the one the scene is holding. A second element for
    // the same key would be in neither the retained map nor the leaving set,
    // so nothing would ever take it off the map again.
    renderArrowScene(host, [], ctx);
    vi.advanceTimersByTime(ARROW_MOTION_MS.exit + 1);
    expect(host.children).toHaveLength(0);
    vi.useRealTimers();
  });

  it("skips a spec whose lands have no crossing rather than drawing NaN", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const none: SceneCtx = { crossingFor: () => null, freeAnchor: () => null };
    const drawn = renderArrowScene(host, [march("m1", "a", "b", 1)], none);
    expect(drawn.size).toBe(0);
    expect(host.children).toHaveLength(0);
  });
});

/** The scene keeps its arrows between renders, which is what lets one fade in
 *  when it is declared and out when it lands. happy-dom has no WAAPI, so
 *  `runAnimation` falls back to a timer of exactly `ARROW_MOTION_MS` - these
 *  drive that timer rather than waiting on a wall clock. */
describe("renderArrowScene identity", () => {
  const aim = (): ArrowSpec => ({
    id: "aim", kind: "aim", from: "b", to: "a", strength: 1, tone: "ours",
  });

  it("hands back the same element for a key it drew last render", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const first = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    const again = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    expect(again.get("m1")).toBe(first.get("m1"));
    expect(host.children).toHaveLength(1);
  });

  it("touches no node at all on a repaint that changes nothing", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    document.body.appendChild(host);
    renderArrowScene(host, [
      march("m1", "a", "b", 2), march("m2", "b", "a", 1),
      { id: "c1", kind: "claim", from: "a", to: "c", strength: 1,
        tone: "other", label: "SUBJUGATE" },
    ], ctx);
    // Attributes as well as children. Watching the child list alone, this
    // passes while every attribute on every arrow is rewritten every frame -
    // which is most of what an arrow is, and exactly what retaining the
    // element was for.
    const seen = new MutationObserver(() => {});
    seen.observe(host, { childList: true, subtree: true, attributes: true });
    renderArrowScene(host, [
      march("m1", "a", "b", 2), march("m2", "b", "a", 1),
      { id: "c1", kind: "claim", from: "a", to: "c", strength: 1,
        tone: "other", label: "SUBJUGATE" },
    ], ctx);
    // Every arrow on the map used to be torn down and rebuilt here, which is
    // why nothing on it could fade.
    expect(seen.takeRecords()).toEqual([]);
    seen.disconnect();
    host.remove();
  });

  it("moves a surviving arrow into its new lane rather than rebuilding it", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const alone = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    const el = alone.get("m1");
    const poly = el?.querySelector("polygon");
    const wholeBlock = poly?.getAttribute("points");
    const shared = renderArrowScene(host, [
      march("m1", "a", "b", 1), march("m2", "b", "a", 1),
    ], ctx);
    expect(shared.get("m1")).toBe(el);
    expect(el?.querySelector("polygon")).toBe(poly);
    expect(poly?.getAttribute("points")).not.toBe(wholeBlock);
  });

  it("keeps a departed arrow until its fade reports itself finished", () => {
    vi.useFakeTimers();
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const el = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    renderArrowScene(host, [], ctx);
    // Not gone the moment the state stopped naming it: a march that vanished
    // on the frame it landed is the thing this whole scene exists to stop.
    expect(host.contains(el as Node)).toBe(true);
    vi.advanceTimersByTime(ARROW_MOTION_MS.exit - 1);
    expect(host.contains(el as Node)).toBe(true);
    vi.advanceTimersByTime(2);
    expect(host.contains(el as Node)).toBe(false);
    vi.useRealTimers();
  });

  it("gives a key that comes back a fresh arrow, not the corpse still fading", () => {
    vi.useFakeTimers();
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const gone = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    renderArrowScene(host, [], ctx);
    const back = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    expect(back).not.toBe(gone);
    expect(host.contains(gone as Node)).toBe(true);
    // The corpse's own fade ends and takes the corpse - and nothing else.
    vi.advanceTimersByTime(ARROW_MOTION_MS.exit + 1);
    expect(host.contains(gone as Node)).toBe(false);
    expect(host.contains(back as Node)).toBe(true);
    expect(renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1"))
      .toBe(back);
    vi.useRealTimers();
  });

  it("rebuilds the aim preview, with no transition either way", () => {
    vi.useFakeTimers();
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const first = renderArrowScene(host, [aim()], ctx).get("aim");
    const second = renderArrowScene(host, [aim()], ctx).get("aim");
    // It re-packs on every pointer move and has to track the cursor, so it is
    // built anew and the one it replaces goes at once rather than fading.
    expect(second).not.toBe(first);
    expect(host.contains(first as Node)).toBe(false);
    expect(host.children).toHaveLength(1);
    renderArrowScene(host, [], ctx);
    expect(host.contains(second as Node)).toBe(false);
    expect(host.children).toHaveLength(0);
    vi.useRealTimers();
  });

  it("packs the aim beside a surviving arrow without disturbing it", () => {
    vi.useFakeTimers();
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const raid = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    const withAim = renderArrowScene(host, [march("m1", "a", "b", 1), aim()], ctx);
    expect(withAim.get("m1")).toBe(raid);
    // The preview is appended after the arrows it shares the border with, so
    // it is drawn over them.
    expect(host.children[1]).toBe(withAim.get("aim"));
    vi.useRealTimers();
  });

  it("rebuilds a key whose host was emptied from outside", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const first = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    // A run ending clears the layer without telling the scene. What is left
    // is a detached element, and updating it would draw an arrow nobody sees.
    host.replaceChildren();
    const again = renderArrowScene(host, [march("m1", "a", "b", 1)], ctx).get("m1");
    expect(again).not.toBe(first);
    expect(host.children).toHaveLength(1);
  });
});
