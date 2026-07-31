// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap, darkenColor } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per land with data-id, faction color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(26);
    expect(regionPaths.size).toBe(26);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonians = data.factions.find(
      (f) => f.id === "curonian-confederacy",
    )!;
    expect(kursa.getAttribute("fill")).toBe(curonians.color);
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
    for (const kind of ["people", "people-minor", "neighbor", "river"]) {
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

    // An authored locked site keeps its name, so it gets a label.
    const named = data.settlements.find((x) => x.id === "otepaa")!;
    revealSettlement(named);
    expect(dots()).toBe(before.dots + 1);
    expect(labels()).toBe(before.labels + 1);
    expect(settlementDots.get("otepaa")!.classList.contains("settlement-founded"))
      .toBe(true);

    // A baked growth site has no name, so it gets a dot and no label - the map
    // invents no place names.
    const unnamed = data.settlements.find((x) => !x.unlocked && x.name === "")!;
    revealSettlement(unnamed);
    expect(dots()).toBe(before.dots + 2);
    expect(labels()).toBe(before.labels + 1);

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

    // the hover halo hides its inner edges behind the region fills
    expect(groups).toContain("realm-hover-halo");
    expect(groups.indexOf("realm-hover-halo")).toBeLessThan(groups.indexOf("regions"));

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

  it("tags people labels with data-people and collects them in peopleLabels", () => {
    const container = document.createElement("div");
    const { svg, peopleLabels } = renderMap(data, container);
    const peopleLabelKinds = data.labels.filter(
      (l) => l.kind === "people" || l.kind === "people-minor",
    );
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
