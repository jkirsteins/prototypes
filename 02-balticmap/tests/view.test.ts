import { describe, it, expect } from "vitest";
import {
  clampView, frameRectOf, holderOf, leadClass, panBy,
  politicalFactionForPolygon, realmHoldingLine, relationshipLine,
  standingChangeText, standingsFor,
  viewBoundsOf, visibleRectOf,
  withArticle,
  zoomAt, DEFAULT_RING, MAX_ZOOM,
} from "../src/view";
import { plainText, type NameLookup } from "../src/rich-text";

/** relationshipLine returns Segment[], never a string - plainText is the one
 *  legitimate way to compare it against prose in a test. Upper-cased so the
 *  expected strings below read the same as they did when the function still
 *  built plain text itself. */
const nameLookup: NameLookup = {
  factionName: (id) => id.toUpperCase(),
  isPlaceName: () => false,
};

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

// fitView, homeView and MIN_ZOOM are retired: viewBoundsOf answers the three
// questions they used to blur together (see "view bounds" below), and every
// zoomAt/panBy test now clamps against a ViewBounds rather than a bare View.

describe("zoomAt", () => {
  const map = { width: 1000, height: 1400, margin: 2000 };
  const b = viewBoundsOf(map, 800, 600);

  it("keeps the point under the cursor fixed", () => {
    const px = 200, py = 150;
    const before = {
      x: b.home.x + (px / 800) * b.home.w,
      y: b.home.y + (py / 600) * b.home.h,
    };
    const v = zoomAt(b.home, b, px, py, 2, 800, 600);
    close(v.x + (px / 800) * v.w, before.x);
    close(v.y + (py / 600) * v.h, before.y);
    close(b.home.w / v.w, 2);
  });

  it("never zooms in past MAX_ZOOM", () => {
    let v = b.home;
    for (let i = 0; i < 20; i++) v = zoomAt(v, b, 400, 300, 2, 800, 600);
    close(v.w, b.minW);
  });

  it("at max zoom, a further zoom-in moves nothing", () => {
    // One exact jump to the ceiling: the view keeps clearance on every side,
    // so any spurious origin shift is visible rather than clamped away.
    const v = zoomAt(b.home, b, 400, 300, MAX_ZOOM, 800, 600);
    close(v.w, b.minW);
    const again = zoomAt(v, b, 700, 500, 2, 800, 600);
    close(again.x, v.x);
    close(again.y, v.y);
    close(again.w, v.w);
    close(again.h, v.h);
  });

  it("at the floor, a further zoom-out moves nothing", () => {
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    const v = zoomAt(floor, b, 700, 100, 0.5, 800, 600);
    expect(v).toEqual(floor);
  });
});

describe("panBy", () => {
  const map = { width: 1000, height: 1400, margin: 2000 };
  const b = viewBoundsOf(map, 800, 600);

  it("moves opposite to cursor delta when zoomed in", () => {
    const zoomed = zoomAt(b.home, b, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, b, -100, 0, 800);
    const unitsPerPx = zoomed.w / 800;
    close(panned.x, zoomed.x + 100 * unitsPerPx);
    close(panned.y, zoomed.y);
  });

  it("clamps at the frame's edge plus the pan allowance, not the painted rect", () => {
    // The pan bound used to be the painted rect (`outer`), which is exactly
    // what the frame now exists to hide: a drag that reached it put blank
    // margin on screen. It clamps against `frame` padded by `panAllowance`
    // instead, a tighter box entirely inside `outer`.
    const zoomed = zoomAt(b.home, b, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, b, 1e9, 1e9, 800);
    close(panned.x, b.frame.x - b.panAllowance);
    close(panned.y, b.frame.y - b.panAllowance);
    expect(panned.x).toBeGreaterThan(b.outer.x);
    expect(panned.y).toBeGreaterThan(b.outer.y);
  });
});

const BALTIC = { width: 1000, height: 1400, margin: 2000 };
const IBERIA = { width: 1400, height: 1150, margin: 2000 };
const VIEWPORTS: [number, number][] = [[1440, 749], [800, 1200], [1000, 1000]];

const covers = (v: { x: number; y: number; w: number; h: number },
                m: { width: number; height: number }) =>
  v.x <= 0 && v.y <= 0 && v.x + v.w >= m.width && v.y + v.h >= m.height;

describe("view bounds", () => {
  it("opens on the whole canvas plus a ring, on any viewport", () => {
    for (const map of [BALTIC, IBERIA]) {
      for (const [vpW, vpH] of VIEWPORTS) {
        const b = viewBoundsOf(map, vpW, vpH);
        expect(covers(b.home, map), `${map.width} @ ${vpW}x${vpH}`).toBe(true);
        // The ring is real: the home view is wider than the exact fit.
        const fitW = Math.max(map.width, map.height / (vpH / vpW));
        expect(b.home.w).toBeGreaterThan(fitW * 1.05);
        expect(b.home.w).toBeCloseTo(Math.min(fitW * (1 + DEFAULT_RING), b.maxW), 5);
      }
    }
  });

  it("the floor never exceeds the painted rect", () => {
    // Retired: "and touches it on one axis" - that held under the OLD rule,
    // where the painted rect was the only ceiling. Now the frame-derived cap
    // (see the "capped floor" describe block below) can pull the floor in
    // well short of the painted edge, on a viewport shape where the frame
    // itself is the binding factor rather than `outer`.
    for (const map of [BALTIC, IBERIA]) {
      for (const [vpW, vpH] of VIEWPORTS) {
        const b = viewBoundsOf(map, vpW, vpH);
        const maxH = b.maxW * b.aspect;
        expect(b.maxW).toBeLessThanOrEqual(b.outer.w + 1e-9);
        expect(maxH).toBeLessThanOrEqual(b.outer.h + 1e-9);
      }
    }
  });

  it("zooms out at least twice as far as the old 1.3 floor did", () => {
    // The retired rule: widest view = (smallest rect COVERING the canvas) / 1.3.
    for (const map of [BALTIC, IBERIA]) {
      const [vpW, vpH] = [1440, 749];
      const b = viewBoundsOf(map, vpW, vpH);
      const oldWidest = Math.max(map.width, map.height / (vpH / vpW)) / 1.3;
      expect(b.maxW / oldWidest).toBeGreaterThanOrEqual(2);
    }
  });

  it("the zoom-in ceiling is measured against the default, not the floor", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    expect(b.minW).toBeCloseTo(b.home.w / MAX_ZOOM, 5);
  });

  it("clamping keeps every view inside the painted rect", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    for (const v of [
      { x: -99999, y: -99999, w: b.home.w, h: b.home.h },
      { x: 99999, y: 99999, w: b.home.w, h: b.home.h },
      { x: 0, y: 0, w: 1e9, h: 1e9 },
      { x: 0, y: 0, w: 1e-9, h: 1e-9 },
    ]) {
      const c = clampView(v, b);
      expect(c.w).toBeGreaterThanOrEqual(b.minW - 1e-9);
      expect(c.w).toBeLessThanOrEqual(b.maxW + 1e-9);
      expect(c.x).toBeGreaterThanOrEqual(b.outer.x - 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(b.outer.y - 1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(b.outer.x + b.outer.w + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(b.outer.y + b.outer.h + 1e-9);
    }
  });

  it("a wheel tick at the floor pans nothing sideways", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    const out = zoomAt(floor, b, 700, 400, 0.9, 1440, 749);
    expect(out).toEqual(floor);
  });

  it("panning at the floor cannot move it past the edge on the binding axis", () => {
    // At this viewport IBERIA's floor equals the painted-rect ceiling
    // (maxW === outer.w), and that view is far wider than frame.w plus
    // twice the pan allowance - so clampAxisToFrame centres the x axis
    // rather than clamping it, and a centred axis answers every pan request
    // with the same value regardless of the requested position.
    const b = viewBoundsOf(IBERIA, 1440, 749);
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    expect(panBy(floor, b, 200, 0, 1440)).toEqual(floor);
  });
});

/** frameRectOf/visibleRectOf multiply by a fractional ring (0.35, 0.3), which
 *  is not always float-exact - close() rather than toEqual keeps the test
 *  honest about the ring's math instead of pinning a rounding artifact. */
const closeRect = (
  r: { x: number; y: number; w: number; h: number },
  expected: { x: number; y: number; w: number; h: number },
) => {
  close(r.x, expected.x);
  close(r.y, expected.y);
  close(r.w, expected.w);
  close(r.h, expected.h);
};

describe("frameRectOf", () => {
  it("outsets the canvas by FRAME_RING on every side", () => {
    closeRect(frameRectOf(BALTIC), { x: -350, y: -490, w: 1700, h: 2380 });
  });

  it("scales with the canvas, not a fixed number of map units", () => {
    closeRect(frameRectOf(IBERIA), { x: -490, y: -402.5, w: 2380, h: 1955 });
  });
});

describe("visibleRectOf", () => {
  it("outsets the canvas by VISIBLE_RING on every side, inside frameRectOf", () => {
    const visible = visibleRectOf(BALTIC);
    closeRect(visible, { x: -300, y: -420, w: 1600, h: 2240 });
    const frame = frameRectOf(BALTIC);
    expect(visible.x).toBeGreaterThan(frame.x);
    expect(visible.y).toBeGreaterThan(frame.y);
    expect(visible.x + visible.w).toBeLessThan(frame.x + frame.w);
    expect(visible.y + visible.h).toBeLessThan(frame.y + frame.h);
  });

  it("scales with the canvas, not a fixed number of map units", () => {
    closeRect(visibleRectOf(IBERIA), { x: -420, y: -345, w: 2240, h: 1840 });
  });
});

describe("the capped floor", () => {
  it("never exceeds the painted-rect floor, even where the frame-derived cap is looser", () => {
    // At 1440x749 the painted rect is the tighter of the two for both maps -
    // pinned by the numbers below - so this line only proves the clamp does
    // not accidentally WIDEN the floor past `outer` when the frame-derived
    // candidate comes out bigger.
    for (const map of [BALTIC, IBERIA]) {
      const b = viewBoundsOf(map, 1440, 749);
      const paintedMaxW = Math.min(b.outer.w, b.outer.h / b.aspect);
      expect(b.maxW).toBeLessThanOrEqual(paintedMaxW + 1e-9);
    }
  });

  it("pulls the floor in on a viewport shape where the frame - not the painted rect - binds", () => {
    // A squarer viewport than 1440x749 leaves the painted rect's own margin
    // (2000 on every side) far looser than 200px of frame-relative surround,
    // so here the frame-derived cap is the one that actually decides maxW.
    for (const map of [BALTIC, IBERIA]) {
      const b = viewBoundsOf(map, 1000, 1000);
      const paintedMaxW = Math.min(b.outer.w, b.outer.h / b.aspect);
      expect(b.maxW).toBeLessThan(paintedMaxW - 1);
    }
  });

  it("pins the numbers for both maps at 1440x749", () => {
    // A regression pin, not a re-derivation: if either the frame ring or the
    // 200px surround budget moves, this is meant to catch it.
    const baltic = viewBoundsOf(BALTIC, 1440, 749);
    close(baltic.maxW, 5000);
    const iberia = viewBoundsOf(IBERIA, 1440, 749);
    close(iberia.maxW, 5400);
  });

  it("falls back to the painted-rect ceiling when the binding axis is too small for the surround budget", () => {
    // vpH = 400 makes the divisor (vpH - 2*MAX_SURROUND_PX) exactly zero on
    // the axis BALTIC's portrait frame binds on at this aspect; anything at
    // or below that must fall back rather than divide by zero or go negative.
    const atGuard = viewBoundsOf(BALTIC, 1440, 400);
    const paintedMaxW = Math.min(atGuard.outer.w, atGuard.outer.h / atGuard.aspect);
    close(atGuard.maxW, paintedMaxW);

    const wellBelow = viewBoundsOf(BALTIC, 1440, 200);
    const paintedMaxW2 = Math.min(wellBelow.outer.w, wellBelow.outer.h / wellBelow.aspect);
    close(wellBelow.maxW, paintedMaxW2);
  });
});

describe("the per-axis pan/centre rule", () => {
  it("centres the axis the view is far wider than, and leaves the other clamped", () => {
    // At 1440x749 BALTIC's floor (a portrait frame in a landscape viewport)
    // is far wider than frame.w + 2*panAllowance horizontally - nothing out
    // there to pan to, so x always answers with the centred value - while
    // vertically the floor sits inside frame.h + 2*panAllowance, so y is a
    // real clamp with room to move.
    const b = viewBoundsOf(BALTIC, 1440, 749);
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    expect(floor.w).toBeGreaterThan(b.frame.w + 2 * b.panAllowance);
    close(floor.x, b.frame.x + b.frame.w / 2 - floor.w / 2);

    const pannedRight = panBy(floor, b, -99999, 0, 1440);
    const pannedLeft = panBy(floor, b, 99999, 0, 1440);
    close(pannedRight.x, floor.x);
    close(pannedLeft.x, floor.x);

    // The floor already sits at the top of its own y range (clamped there by
    // `clampView` itself, since the oversized seed view this test starts
    // from pins every axis to whichever bound it overshot) - so the axis
    // having real slack shows up as a pan TOWARD the other bound moving it,
    // not as an already-maxed-out direction refusing to move further.
    const pannedUp = panBy(floor, b, 0, 99999, 1440);
    expect(pannedUp.y).toBeLessThan(floor.y);
  });
});

describe("standingChangeText", () => {
  /** One spelling for the modal and the log suffix: where the score stood,
   *  where it landed, and the movement in brackets. ASCII "->", never a
   *  unicode arrow. */
  it("formats a defense drop as its landing point and signed delta", () => {
    expect(
      standingChangeText({ polygon: "selija", track: "defense", before: 6, after: 5 }),
    ).toBe("Defense 6 -> 5 (-1)");
  });

  it("signs a heal positively", () => {
    expect(
      standingChangeText({ polygon: "selija", track: "defense", before: 5, after: 6 }),
    ).toBe("Defense 5 -> 6 (+1)");
  });

  it("formats disease stacks on the same shape", () => {
    expect(
      standingChangeText({
        polygon: "selija", track: "disease", owner: "selonians", before: 2, after: 3,
      }),
    ).toBe("Disease 2 -> 3 (+1)");
  });

  it("leaves a zero delta unsigned", () => {
    expect(
      standingChangeText({ polygon: "selija", track: "defense", before: 6, after: 6 }),
    ).toBe("Defense 6 -> 6 (0)");
  });
});

describe("leadClass", () => {
  it("names the tone of a movement, not its colour", () => {
    expect(leadClass(2)).toBe("lead-good");
    expect(leadClass(-1)).toBe("lead-bad");
    expect(leadClass(0)).toBe("lead-even");
  });
});

describe("withArticle", () => {
  it("prefixes 'the' for an ordinary faction name", () => {
    expect(withArticle("Ugandians", false)).toBe("the Ugandians");
  });

  it("leaves a place name bare, with no article", () => {
    expect(withArticle("Lietuva", true)).toBe("Lietuva");
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

describe("holderOf", () => {
  const held = (
    polygonFaction: string,
    overlords: [string, string][] = [],
    incorporated: Record<string, string> = {},
  ) => holderOf(polygonFaction, new Map(overlords), incorporated);

  it("points a vassal at its overlord", () => {
    expect(held("zemgale", [["zemgale", "lietuva"]])).toBe("lietuva");
  });

  it("points an absorbed land at the realm that took it", () => {
    expect(held("semba", [], { semba: "nadruvians" })).toBe("nadruvians");
  });

  it("names the immediate holder, not the top of the chain", () => {
    // Semba answers to Nadruvians directly; the tooltip carries the rest of
    // the chain, so the map marks one polygon rather than a whole hierarchy.
    expect(held("semba", [["nadruvians", "natangians"]], { semba: "nadruvians" }))
      .toBe("nadruvians");
  });

  it("is null for a land that answers to nobody", () => {
    expect(held("zemgale")).toBeNull();
  });
});

describe("relationshipLine", () => {
  const line = (
    polygonFaction: string,
    overlords: [string, string][] = [],
    incorporated: Record<string, string> = {},
  ) => {
    const segs = relationshipLine(polygonFaction, "me", new Map(overlords), incorporated);
    return segs === null ? null : plainText(segs, nameLookup);
  };

  it("names the realm that absorbed the land, from the land's own id", () => {
    // The regression: callers used to pass the politically-resolved faction,
    // so incorporated[f] was never set and an absorbed land read "Independent".
    expect(line("zemgale", [], { zemgale: "lietuva" })).toBe("Incorporated into LIETUVA");
  });

  it("follows the chain when the absorbing realm is itself a vassal", () => {
    // The confusion this fixes: every land of a vassal's realm is striped in
    // the overlord's colour, but an absorbed land used to name only its
    // absorber, so neighbouring polygons of one realm read as two stories.
    expect(line("semba", [["nadruvians", "natangians"]], { semba: "nadruvians" }))
      .toBe("Incorporated into NADRUVIANS, itself a vassal of NATANGIANS");
  });

  it("says so in the second person when that realm is your vassal", () => {
    expect(line("semba", [["nadruvians", "me"]], { semba: "nadruvians" }))
      .toBe("Incorporated into NADRUVIANS, itself your vassal");
  });

  it("leaves a free absorber unqualified", () => {
    expect(line("semba", [], { semba: "nadruvians" }))
      .toBe("Incorporated into NADRUVIANS");
  });

  it("calls out the human's own absorbed lands", () => {
    expect(line("zemgale", [], { zemgale: "me" })).toBe("Part of your realm (incorporated)");
  });

  it("names the overlord of a subjugated land", () => {
    expect(line("zemgale", [["zemgale", "lietuva"]])).toBe("Vassal of LIETUVA");
  });

  it("names the direct lord and the chain's root, nothing between", () => {
    expect(line("zemgale", [
      ["zemgale", "lietuva"], ["lietuva", "kursa"], ["kursa", "sudovians"],
    ])).toBe("Vassal of LIETUVA, ultimately a vassal of SUDOVIANS");
  });

  it("says so when the chain's root is the human", () => {
    expect(line("zemgale", [["zemgale", "lietuva"], ["lietuva", "me"]]))
      .toBe("Vassal of LIETUVA, ultimately your vassal");
  });

  it("adds the chain's root to an absorbed land's story", () => {
    expect(line(
      "semba",
      [["nadruvians", "natangians"], ["natangians", "sudovians"]],
      { semba: "nadruvians" },
    )).toBe(
      "Incorporated into NADRUVIANS, itself a vassal of NATANGIANS, " +
        "ultimately a vassal of SUDOVIANS",
    );
  });

  it("keeps the human's own relationships in the second person", () => {
    expect(line("zemgale", [["zemgale", "me"]])).toBe("Your vassal");
    expect(line("lietuva", [["me", "lietuva"]])).toBe("Your overlord");
  });

  /** The fealty used to read one way only: a vassal's hover named its lord,
   *  while the lord - the land whose colour every vassal wears in stripes - was
   *  the one land whose hover said nothing at all. */
  it("names the vassals a rival holds", () => {
    expect(line("lietuva", [["zemgale", "lietuva"]])).toBe("Overlord of ZEMGALE");
    expect(line("lietuva", [["zemgale", "lietuva"], ["kursa", "lietuva"]]))
      .toBe("Overlord of KURSA and ZEMGALE");
  });

  it("says both halves when a land is held and holds", () => {
    expect(line("lietuva", [["lietuva", "sudovians"], ["zemgale", "lietuva"]]))
      .toBe("Vassal of SUDOVIANS, overlord of ZEMGALE");
    expect(line("lietuva", [["lietuva", "me"], ["zemgale", "lietuva"]]))
      .toBe("Your vassal, overlord of ZEMGALE");
  });

  /** The human is left out of the list: "Your overlord" says it better than
   *  the player's own faction name repeated back at them would. */
  it("keeps the human out of its own overlord's vassal list", () => {
    expect(line("lietuva", [["me", "lietuva"]])).toBe("Your overlord");
    expect(line("lietuva", [["me", "lietuva"], ["zemgale", "lietuva"]]))
      .toBe("Your overlord, and overlord of ZEMGALE");
  });

  /** An absorbed land is not a vassal any more; the entry in `overlords` can
   *  outlive the subjugation, as "prefers absorption over a stale vassal entry"
   *  below already records for the other direction. */
  it("does not count an absorbed land among the vassals", () => {
    expect(line("lietuva", [["zemgale", "lietuva"]], { zemgale: "lietuva" }))
      .toBeNull();
  });

  it("says nothing at all when nobody holds it", () => {
    // Null rather than "Independent": the map hover shows this line only when
    // there is a holder to name, and the panel supplies its own wording.
    expect(line("zemgale")).toBeNull();
  });

  it("prefers absorption over a stale vassal entry", () => {
    expect(line("zemgale", [["zemgale", "lietuva"]], { zemgale: "lietuva" }))
      .toBe("Incorporated into LIETUVA");
  });

  /** The faction picker has no seat behind it - a region may open with realms
   *  already standing, and nobody has been dealt anything yet. Null spells the
   *  same fealty in the third person rather than needing a second function. */
  it("spells fealty impersonally when there is no human seat", () => {
    const impersonal = (
      polygonFaction: string,
      overlords: [string, string][] = [],
      incorporated: Record<string, string> = {},
    ) => {
      const segs = relationshipLine(
        polygonFaction, null, new Map(overlords), incorporated,
      );
      return segs === null ? null : plainText(segs, nameLookup);
    };
    // The three shapes that would otherwise have said "your": a vassal, an
    // overlord, and the land the (absent) human would have answered to.
    expect(impersonal("zemgale", [["zemgale", "me"]])).toBe("Vassal of ME");
    expect(impersonal("lietuva", [["me", "lietuva"]])).toBe("Overlord of ME");
    expect(impersonal("zemgale", [], { zemgale: "me" }))
      .toBe("Incorporated into ME");
    expect(impersonal("zemgale")).toBeNull();
  });
});

describe("realmHoldingLine", () => {
  const holds = (
    factionId: string,
    overlords: [string, string][] = [],
    incorporated: Record<string, string> = {},
  ) => {
    const segs = realmHoldingLine(factionId, new Map(overlords), incorporated);
    return segs === null ? null : plainText(segs, nameLookup);
  };

  it("says nothing for a land that holds nothing", () => {
    expect(holds("lietuva")).toBeNull();
    expect(holds("lietuva", [["lietuva", "zemgale"]])).toBeNull();
  });

  it("names every land under it, both kinds and to any depth", () => {
    // `fullRealmOf`, not `realmOf`: the picker is answering "how much of the
    // map comes with this", which is the count the scoreboard and the win
    // condition will apply - so a vassal's vassal and a vassal's annexation
    // both belong in the sentence.
    expect(holds("lietuva", [["zemgale", "lietuva"]], { kursa: "lietuva" }))
      .toBe("Brings with it KURSA and ZEMGALE");
    expect(
      holds("lietuva", [["zemgale", "lietuva"], ["kursa", "zemgale"]]),
    ).toBe("Brings with it KURSA and ZEMGALE");
  });
});

// The direction-picking cases that lived here as `barFor` moved to
// tests/playability.test.ts with `subjugationRaceFor`, which owns that rule now.

describe("standingsFor", () => {
  // `acting`, not `factionIds`: five seats act now, not twenty-six factions,
  // so every acting faction gets a row - there is no top-N cut and no bolted-on
  // row for a human who falls outside it, per the doc comment on the source.
  const base = {
    acting: ["a", "b", "c"],
    incorporated: {} as Record<string, string>,
    needed: () => 15,
  };

  it("ranks every acting faction, biggest realm first", () => {
    const rows = standingsFor({
      ...base,
      acting: ["a", "b", "c", "d", "e"],
      humanFactionId: "a",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "d", "b", "c", "e"]);
    expect(rows[0]).toMatchObject({
      factionId: "a", lands: 14, needed: 15, percent: 93, isHuman: true,
    });
  });

  it("ranks everyone when only two contenders act", () => {
    const rows = standingsFor({
      ...base,
      acting: ["a", "b"],
      humanFactionId: "a",
      realmSize: (f) => ({ a: 4, b: 2 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "b"]);
  });

  it("flags the human wherever their realm ranks, not only near the top", () => {
    const rows = standingsFor({
      ...base,
      acting: ["a", "b", "c", "d", "e"],
      humanFactionId: "e",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "d", "b", "c", "e"]);
    expect(rows.slice(0, 4).every((r) => !r.isHuman)).toBe(true);
    expect(rows[4]).toMatchObject({ factionId: "e", lands: 1, isHuman: true });
  });

  it("lists every acting faction exactly once, the human included", () => {
    const rows = standingsFor({
      ...base,
      acting: ["a", "b", "c", "d", "e"],
      humanFactionId: "b",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.isHuman)).toHaveLength(1);
  });

  it("never ranks an incorporated faction", () => {
    // `a` is the biggest realm but has been absorbed, so it cannot win.
    const rows = standingsFor({
      ...base,
      incorporated: { a: "b" },
      humanFactionId: "c",
      realmSize: (f) => ({ a: 14, b: 9, c: 2 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).not.toContain("a");
    expect(rows[0].factionId).toBe("b");
  });

  it("caps the percentage at 100 rather than reporting 106%", () => {
    const rows = standingsFor({
      ...base,
      humanFactionId: "a",
      realmSize: () => 16,
    });
    expect(rows[0].percent).toBe(100);
  });

  it("breaks land-count ties stably, so the board does not reshuffle", () => {
    const args = {
      ...base,
      acting: ["a", "b", "c", "d"],
      humanFactionId: "c",
      realmSize: (f: string) => ({ a: 9, b: 9, c: 2, d: 9 })[f] ?? 0,
    };
    expect(standingsFor(args).map((r) => r.factionId)).toEqual(["a", "b", "d", "c"]);
    expect(standingsFor(args).map((r) => r.factionId)).toEqual(["a", "b", "d", "c"]);
  });

  it("gives each faction its own bar, so one row can be held to a harder one", () => {
    // What a run played on looks like on the scoreboard: the player is out
    // for the whole map while every rival still needs half, and the row that
    // was at 100% drops back rather than staying pinned there.
    const rows = standingsFor({
      ...base,
      humanFactionId: "a",
      realmSize: (f) => ({ a: 15, b: 6, c: 3 })[f] ?? 0,
      needed: (f) => (f === "a" ? 30 : 15),
    });
    expect(rows.map((r) => [r.factionId, r.lands, r.needed, r.percent])).toEqual([
      ["a", 15, 30, 50],
      ["b", 6, 15, 40],
      ["c", 3, 15, 20],
    ]);
  });

  it("returns nothing when every faction has been absorbed", () => {
    expect(
      standingsFor({
        ...base,
        incorporated: { a: "x", b: "x", c: "x" },
        humanFactionId: "a",
        realmSize: () => 1,
      }),
    ).toEqual([]);
  });
});
