// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMap, darkenColor } from "../src/map-render";
import { frameRectOf, visibleRectOf } from "../src/view";
import type { MapData } from "../src/types";
import raw from "../src/data/baltic.json";

const data = raw as MapData;

/** Whether `selector`'s block in style.css declares `property: value`.
 *  jsdom/happy-dom never loads the stylesheet, so pointer-events - which is
 *  set purely by class, not by attribute - can only be checked at the source. */
function cssDeclares(selector: string, property: string, value: string): boolean {
  const css = readFileSync("src/style.css", "utf8");
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return false;
  const block = css.slice(at, css.indexOf("}", at));
  return new RegExp(`${property}:\\s*${value}\\b`).test(block);
}

describe("renderMap", () => {
  it("renders one path per land with data-id, faction color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    // `.land-fill` and not `.region`: every land also has a stroke-only
    // `.land-edge` copy carrying `.region`, so the bare class counts both.
    const paths = svg.querySelectorAll("path.region.land-fill");
    expect(paths.length).toBe(26);
    expect(regionPaths.size).toBe(26);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonians = data.factions.find(
      (f) => f.id === "curonian-confederacy",
    )!;
    expect(kursa.getAttribute("fill")).toBe(curonians.color);
  });

  // The border is drawn by copies above the fills, never by the fill element:
  // a casing has to sit above the fill it bounds and the dark line above the
  // casing. The one thing that must not cross onto a copy is `land-fill`,
  // which is what the stroke suppression in style.css hangs off - a copy
  // carrying it draws no outline and the land loses its border entirely.
  it("gives every land a casing and a line copy, and no copy is a land-fill", () => {
    const container = document.createElement("div");
    const { svg, landCasingPaths, landEdgePaths } = renderMap(data, container);
    expect(landCasingPaths.size).toBe(26);
    expect(landEdgePaths.size).toBe(26);
    expect(svg.querySelectorAll("path.land-casing").length).toBe(26);
    for (const edge of landEdgePaths.values()) {
      expect(edge.classList.contains("region")).toBe(true);
      expect(edge.classList.contains("land-fill")).toBe(false);
    }
    for (const casing of landCasingPaths.values()) {
      expect(casing.classList.contains("region")).toBe(false);
    }
  });

  // Document order is paint order in SVG, so this IS the casing: pale under
  // dark. Reversed, the halo covers the line it exists to set off.
  it("paints casings under lines, and both above the fills", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    const groups = [...svg.querySelectorAll("g")].map((g) => g.getAttribute("class"));
    expect(groups.indexOf("regions")).toBeLessThan(groups.indexOf("land-casings"));
    expect(groups.indexOf("land-casings")).toBeLessThan(groups.indexOf("land-edges"));
  });

  it("gives same-ethnicity lands different faction fills", () => {
    const container = document.createElement("div");
    const { regionPaths } = renderMap(data, container);
    const fill = (id: string) => regionPaths.get(id)!.getAttribute("fill");
    expect(fill("ravala")).not.toBe(fill("virumaa"));
    expect(fill("ravala")).toBe(
      data.factions.find((f) => f.id === "ravalans")!.color,
    );
    expect(fill("zemgale")).toBe(
      data.factions.find((f) => f.id === "semigallian-confederacy")!.color,
    );
  });

  it("renders neighbors beneath regions and labels by kind", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.neighbor").length).toBe(
      data.neighbors.length,
    );
    for (const kind of ["people", "neighbor", "river"]) {
      const expected = data.labels.filter((l) => l.kind === kind);
      const rendered = svg.querySelectorAll(`text.label-${kind}`);
      expect(rendered.length).toBe(expected.length);
    }
    const groups = Array.from(svg.querySelectorAll("g"));
    const neighborIdx = groups.findIndex((g) => g.classList.contains("neighbors"));
    const regionIdx = groups.findIndex((g) => g.classList.contains("regions"));
    expect(neighborIdx).toBeGreaterThanOrEqual(0);
    expect(neighborIdx).toBeLessThan(regionIdx);
  });

  // Zoomed far out, the baked neighbours and the sea rect behind them run out
  // before the painted margin does, and what is left over reads as ocean and
  // stray coastline where there is none - see the comment on `surround` in
  // map-render.ts. The surround hides everything past the CANVAS - not just
  // past the frame - under one fully opaque shape, so the ring `frameRectOf`
  // describes is a matte rather than a narrower peek at the same bake, and
  // the frame marks its own edge, a tenth further out, on top of that.
  it("hides everything past the visible ring with an opaque surround, frames the visible ring plus a matte band, and draws both above the labels, pointer-inert", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);

    const children = Array.from(svg.children);
    const surround = children.find((c) => c.classList.contains("map-surround"));
    const frame = children.find((c) => c.classList.contains("map-frame"));
    expect(surround).toBeTruthy();
    expect(frame).toBeTruthy();

    // Two subpaths under evenodd - the painted rect and, punched through it,
    // the VISIBLE rect (canvas plus VISIBLE_RING) - or the surround would
    // hide baked geography it must not touch.
    expect(surround!.getAttribute("fill-rule")).toBe("evenodd");
    const visible = visibleRectOf(data);
    expect(surround!.getAttribute("d")).toContain(
      `M ${visible.x} ${visible.y} H ${visible.x + visible.w} ` +
        `V ${visible.y + visible.h} H ${visible.x} Z`,
    );

    // The frame sits a ring further out than the hole the surround punches -
    // the matte between the two, not more of the bake.
    const frameRect = frameRectOf(data);
    expect(frame!.getAttribute("x")).toBe(String(frameRect.x));
    expect(frame!.getAttribute("y")).toBe(String(frameRect.y));
    expect(frame!.getAttribute("width")).toBe(String(frameRect.w));
    expect(frame!.getAttribute("height")).toBe(String(frameRect.h));

    // Neither element may take the pointer - jsdom/happy-dom never loads the
    // stylesheet, so this is checked at the source rather than by computed style.
    expect(cssDeclares(".map-surround", "pointer-events", "none")).toBe(true);
    expect(cssDeclares(".map-frame", "pointer-events", "none")).toBe(true);

    // Above every layer this render builds, the labels group included: a
    // group label baked past the visible ring (SCANDINAVIA on this map sits
    // in the matte band between VISIBLE_RING and FRAME_RING) must be hidden
    // by the surround rather than drawn over it.
    const idx = (cls: string) => children.findIndex((c) => c.classList.contains(cls));
    const labelsIdx = idx("labels");
    expect(idx("map-surround")).toBeGreaterThan(labelsIdx);
    expect(idx("map-frame")).toBeGreaterThan(idx("map-surround"));
  });

  it("renders rivers above regions and below settlements and labels", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.river").length).toBe(data.rivers.length);
    expect(svg.querySelectorAll("path.river-major").length).toBe(
      data.rivers.filter((r) => r.major).length,
    );
    const groups = Array.from(svg.querySelectorAll("g")).map((g) => g.getAttribute("class"));
    expect(groups.indexOf("regions")).toBeLessThan(groups.indexOf("rivers"));
    expect(groups.indexOf("rivers")).toBeLessThan(groups.indexOf("settlements"));
    expect(groups.indexOf("settlements")).toBeLessThan(groups.indexOf("labels"));
  });

  it("renders settlement dots and labels", () => {
    const container = document.createElement("div");
    const { svg, settlementDots } = renderMap(data, container);
    const unlocked = data.settlements.filter((s) => s.unlocked);
    expect(unlocked.length).toBeLessThan(data.settlements.length);
    expect(settlementDots.size).toBe(unlocked.length);
    expect(svg.querySelectorAll("circle.settlement").length).toBe(unlocked.length);
    expect(svg.querySelectorAll("text.settlement-label").length).toBe(unlocked.length);
    expect(settlementDots.has("ikskile")).toBe(false);
    const daugmale = settlementDots.get("daugmale")!;
    expect(daugmale.getAttribute("data-settlement-id")).toBe("daugmale");
    const s = data.settlements.find((x) => x.id === "daugmale")!;
    expect(daugmale.getAttribute("cx")).toBe(String(s.x));
    expect(daugmale.getAttribute("cy")).toBe(String(s.y));
    expect(svg.querySelectorAll("text.label-river").length).toBe(
      data.labels.filter((l) => l.kind === "river").length,
    );
  });

  it("reveals a founded settlement, labels only a named one, and clears them", () => {
    const container = document.createElement("div");
    const { svg, settlementDots, revealSettlement, clearFoundedSettlements } =
      renderMap(data, container);
    const dots = () => svg.querySelectorAll("circle.settlement").length;
    const labels = () => svg.querySelectorAll("text.settlement-label").length;
    const before = { dots: dots(), labels: labels() };

    // Every locked site is a named place, so revealing one draws a dot and a
    // label both - there is no nameless dot left to draw bare.
    const named = data.settlements.find((x) => x.id === "otepaa")!;
    revealSettlement(named);
    expect(dots()).toBe(before.dots + 1);
    expect(labels()).toBe(before.labels + 1);
    expect(settlementDots.get("otepaa")!.classList.contains("settlement-founded"))
      .toBe(true);

    const second = data.settlements.find((x) => x.id === "upyte")!;
    revealSettlement(second);
    expect(dots()).toBe(before.dots + 2);
    expect(labels()).toBe(before.labels + 2);

    revealSettlement(named); // idempotent: driven from state every refresh
    expect(dots()).toBe(before.dots + 2);

    clearFoundedSettlements();
    expect(dots()).toBe(before.dots);
    expect(labels()).toBe(before.labels);
    expect(settlementDots.has("otepaa")).toBe(false);
    expect(settlementDots.has("daugmale")).toBe(true); // untouched
  });

  it("exposes the vassal overlay group and one stripe pattern per faction", () => {
    const container = document.createElement("div");
    const { svg, vassalOverlayGroup } = renderMap(data, container);
    expect(svg.contains(vassalOverlayGroup)).toBe(true);
    expect(vassalOverlayGroup.classList.contains("vassal-overlay")).toBe(true);

    const groups = Array.from(svg.querySelectorAll("g")).map((g) => g.getAttribute("class"));
    expect(groups.indexOf("regions")).toBeLessThan(groups.indexOf("vassal-overlay"));
    expect(groups.indexOf("vassal-overlay")).toBeLessThan(groups.indexOf("rivers"));

    // the hover halo masks away everything inside the realm, and still sits
    // under the region fills so a land's own stroke reads over it
    expect(groups).toContain("realm-hover-halo");
    expect(groups.indexOf("realm-hover-halo")).toBeLessThan(groups.indexOf("regions"));

    // the state strokes of a realm's members ride ABOVE the fills, since they
    // replace the stroke those members are no longer allowed to draw themselves
    expect(groups).toContain("realm-edges");
    expect(groups.indexOf("regions")).toBeLessThan(groups.indexOf("realm-edges"));

    // the always-on realm band works the same way, and sits under the hover
    // halo so a hover always outranks it
    expect(groups).toContain("realm-union");
    expect(groups.indexOf("realm-union")).toBeLessThan(groups.indexOf("regions"));
    expect(groups.indexOf("realm-outline")).toBeLessThan(groups.indexOf("realm-union"));
    expect(groups.indexOf("realm-union")).toBeLessThan(groups.indexOf("realm-hover-halo"));

    const patterns = svg.querySelectorAll("defs pattern[id^='vassal-stripes-']");
    expect(patterns.length).toBe(data.factions.length);
    for (const f of data.factions) {
      const pattern = svg.querySelector(`defs pattern#vassal-stripes-${f.id}`);
      expect(pattern).not.toBeNull();
      const rect = pattern!.querySelector("rect")!;
      expect(rect.getAttribute("fill")).toBe(f.color);
    }
  });

  /** A realm's outline is ONE masked path over every member, not one stroked
   *  path per member. The per-member version drew the seams between a realm's
   *  own lands, twice over - once from each side - because it relied on the
   *  region fills above to cover them and those fills are translucent. */
  describe("outerOutline", () => {
    const twoRegions = () => {
      const container = document.createElement("div");
      const result = renderMap(data, container);
      const [a, b] = data.regions;
      const p = result.outerOutline(
        result.realmUnionGroup, "test-mask", [a.path, b.path],
      );
      return { ...result, p, a, b };
    };

    it("draws one path holding every member, not one path each", () => {
      const { realmUnionGroup, p, a, b } = twoRegions();
      // direct children only: the mask holds a path of its own, one level down
      const drawn = [...realmUnionGroup.children]
        .filter((c) => c.tagName.toLowerCase() === "path");
      expect(drawn).toHaveLength(1);
      expect(p.getAttribute("d")).toBe(`${a.path} ${b.path}`);
    });

    it("masks the realm's own interior, so its inner seams are not drawn", () => {
      const { realmUnionGroup, p, a, b } = twoRegions();
      expect(p.getAttribute("mask")).toBe("url(#test-mask)");
      const mask = realmUnionGroup.querySelector("mask#test-mask")!;
      const hide = mask.querySelector("path")!;
      expect(hide.getAttribute("d")).toBe(`${a.path} ${b.path}`);
      // no fill-rule: two members can overlap (Selija and Jersika share two
      // scraps of the Daugava bank split) and evenodd would reopen them
      expect(hide.getAttribute("fill-rule")).toBeNull();
    });

    /** The bug this pins shipped and hid for two changes. A mask sits inside
     *  the group it serves, so `.realm-union path { fill: none }` - written for
     *  that group's own shapes - reached into the mask, blanked the black shape
     *  it hides with, and turned every mask in the group into a no-op that
     *  showed everything. Nothing looked broken; the seams just stayed. An
     *  inline fill outranks any author rule, so the mask cannot be switched off
     *  by a stylesheet that has never heard of it. */
    it("puts the mask's fills inline, out of reach of the host group's rules", () => {
      const { realmUnionGroup } = twoRegions();
      const mask = realmUnionGroup.querySelector("mask#test-mask")!;
      const show = mask.querySelector("rect") as SVGRectElement;
      const hide = mask.querySelector("path") as SVGPathElement;
      expect(show.style.fill).not.toBe("");
      expect(hide.style.fill).not.toBe("");
      // and NOT as attributes, which any descendant rule outranks
      expect(show.getAttribute("fill")).toBeNull();
      expect(hide.getAttribute("fill")).toBeNull();
    });

    /** A realm on the map's edge strokes outward past it, so a mask stopping at
     *  the map box would clip its own outline away. */
    it("covers map plus margin, the same box as the sea", () => {
      const { realmUnionGroup } = twoRegions();
      const mask = realmUnionGroup.querySelector("mask#test-mask")!;
      expect(mask.getAttribute("maskUnits")).toBe("userSpaceOnUse");
      expect(mask.getAttribute("x")).toBe(String(-data.margin));
      expect(mask.getAttribute("width")).toBe(String(data.width + 2 * data.margin));
      expect(mask.getAttribute("height")).toBe(String(data.height + 2 * data.margin));
    });

    /** The mask lives in the group, not <defs>, so clearing the group on a
     *  refresh cannot leave it behind referencing a path that is gone. */
    it("puts the mask in the group it draws into", () => {
      const { realmUnionGroup, svg } = twoRegions();
      expect(realmUnionGroup.querySelector("mask#test-mask")).not.toBeNull();
      expect(svg.querySelector("defs mask")).toBeNull();
      realmUnionGroup.replaceChildren();
      expect(svg.querySelector("#test-mask")).toBeNull();
    });
  });

  it("tags people labels with data-people and collects them in peopleLabels", () => {
    const container = document.createElement("div");
    const { svg, peopleLabels } = renderMap(data, container);
    const peopleLabelKinds = data.labels.filter((l) => l.kind === "people");
    for (const l of peopleLabelKinds) {
      const people = data.peoples.find((p) => p.name.toUpperCase() === l.text);
      expect(people).toBeDefined();
    }
    // Every people should have at least one matching label (all ten match today).
    for (const p of data.peoples) {
      expect(peopleLabels.has(p.id)).toBe(true);
      const labels = peopleLabels.get(p.id)!;
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.getAttribute("data-people")).toBe(p.id);
        expect(svg.contains(label)).toBe(true);
      }
    }
  });

  it("renders no attribution line (internal prototype)", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")).toBeNull();
  });
});

describe("darkenColor", () => {
  it("halves each channel and floors it", () => {
    expect(darkenColor("#ffffff", 0.5)).toBe("#7f7f7f");
  });

  it("computes each channel with Math.floor for an arbitrary faction color", () => {
    expect(darkenColor("#c8b98a", 0.55)).toBe("#6e654b");
  });

  it("always pads each channel to 2 hex digits", () => {
    expect(darkenColor("#101010", 0.05)).toBe("#000000");
  });
});
