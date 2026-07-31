import { describe, it, expect } from "vitest";
import {
  fitView, clampView, formatLead, holderOf, homeView, panBy,
  politicalFactionForPolygon, relationshipLine, restiveVassalOf, standingsFor,
  withArticle,
  zoomAt, MAX_ZOOM, MIN_ZOOM,
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

describe("formatLead", () => {
  it("signs the lead and leaves plain zero unsigned", () => {
    expect(formatLead("M", 2)).toBe("M+2");
    expect(formatLead("M", -1)).toBe("M-1");
    expect(formatLead("S", 0)).toBe("S0");
  });

  it("appends the bar to clear when a requirement applies, on both tracks", () => {
    expect(formatLead("M", 2, 4)).toBe("M+2/4");
    expect(formatLead("S", 0, 4)).toBe("S0/4");
    expect(formatLead("M", -1, 2)).toBe("M-1/2");
  });

  it("omits the bar when no requirement applies", () => {
    expect(formatLead("M", 2, null)).toBe("M+2");
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

/** The map badge and the hover both ask this, and neither could be tested where
 *  it used to live (main.ts). A vassal holding a live Revolt is the one thing
 *  inside your own realm worth a mark: the card ends your overlordship whenever
 *  it surfaces, and the only word of it was a single modal on the turn it was
 *  sown - which a player with popups muted never saw at all. */
describe("restiveVassalOf", () => {
  const restive = (
    polygon: string,
    overlords: [string, string][],
    liveRevolts: string[],
  ) => restiveVassalOf(polygon, "me", new Map(overlords), liveRevolts);

  it("marks a vassal of yours that is holding a live Revolt", () => {
    expect(restive("zemgale", [["zemgale", "me"]], ["zemgale"])).toBe(true);
  });

  it("leaves a quiet vassal alone", () => {
    expect(restive("zemgale", [["zemgale", "me"]], [])).toBe(false);
  });

  /** Somebody else's restive vassal is not the player's business, and marking
   *  them would fill the map with other people's problems. */
  it("ignores a rival's restive vassal", () => {
    expect(restive("zemgale", [["zemgale", "lietuva"]], ["zemgale"])).toBe(false);
  });

  /** A vassal of your vassal walks out on THEM, not on you, so the mark belongs
   *  on the land that will actually leave your realm. */
  it("ignores a vassal of your vassal", () => {
    expect(
      restive("zemgale", [["zemgale", "lietuva"], ["lietuva", "me"]], ["zemgale"]),
    ).toBe(false);
  });

  it("says nothing about a free faction holding one", () => {
    expect(restive("zemgale", [], ["zemgale"])).toBe(false);
  });
});

describe("relationshipLine", () => {
  const name = (id: string) => id.toUpperCase();
  const line = (
    polygonFaction: string,
    overlords: [string, string][] = [],
    incorporated: Record<string, string> = {},
  ) =>
    relationshipLine(polygonFaction, "me", new Map(overlords), incorporated, name);

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
});

// The direction-picking cases that lived here as `barFor` moved to
// tests/playability.test.ts with `subjugationRaceFor`, which owns that rule now.

describe("standingsFor", () => {
  const base = {
    factionIds: ["a", "b", "c"],
    incorporated: {} as Record<string, string>,
    needed: 15,
    passiveFor: () => 0,
  };

  it("ranks the top three, biggest first", () => {
    const rows = standingsFor({
      ...base,
      factionIds: ["a", "b", "c", "d", "e"],
      humanFactionId: "a",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "d", "b"]);
    expect(rows[0]).toMatchObject({
      factionId: "a", lands: 14, needed: 15, percent: 93, isHuman: true,
    });
  });

  it("ranks everyone when fewer than three contenders exist", () => {
    const rows = standingsFor({
      ...base,
      factionIds: ["a", "b"],
      humanFactionId: "a",
      realmSize: (f) => ({ a: 4, b: 2 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "b"]);
  });

  it("adds the human as a fourth row when they are outside the top three", () => {
    const rows = standingsFor({
      ...base,
      factionIds: ["a", "b", "c", "d", "e"],
      humanFactionId: "e",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows.map((r) => r.factionId)).toEqual(["a", "d", "b", "e"]);
    expect(rows.slice(0, 3).every((r) => !r.isHuman)).toBe(true);
    expect(rows[3]).toMatchObject({ factionId: "e", lands: 1, isHuman: true });
  });

  it("does not repeat the human when they are already ranked", () => {
    const rows = standingsFor({
      ...base,
      factionIds: ["a", "b", "c", "d", "e"],
      humanFactionId: "b",
      realmSize: (f) => ({ a: 14, b: 9, c: 2, d: 11, e: 1 })[f] ?? 0,
    });
    expect(rows).toHaveLength(3);
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
      factionIds: ["a", "b", "c", "d"],
      humanFactionId: "c",
      realmSize: (f: string) => ({ a: 9, b: 9, c: 2, d: 9 })[f] ?? 0,
    };
    expect(standingsFor(args).map((r) => r.factionId)).toEqual(["a", "b", "d", "c"]);
    expect(standingsFor(args).map((r) => r.factionId)).toEqual(["a", "b", "d", "c"]);
  });

  it("reports the passive garrison rate only on the human's own row", () => {
    const rows = standingsFor({
      ...base,
      humanFactionId: "c",
      realmSize: (f) => ({ a: 14, b: 9, c: 5 })[f] ?? 0,
      passiveFor: (f) => (f === "c" ? 2 : 3),
    });
    const you = rows.find((r) => r.isHuman)!;
    expect(you.passivePerTurn).toBe(2);
    // A rival's garrison strength is never stated outright - the player reads
    // it off the Might lead instead.
    for (const r of rows.filter((x) => !x.isHuman)) {
      expect(r.passivePerTurn).toBeUndefined();
    }
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
