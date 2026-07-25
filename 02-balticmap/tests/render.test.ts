// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per land with data-id, faction color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(20);
    expect(regionPaths.size).toBe(20);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonianConfederacy = data.factions.find(
      (f) => f.id === "curonian-confederacy",
    )!;
    expect(kursa.getAttribute("fill")).toBe(curonianConfederacy.color);
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
    expect(settlementDots.size).toBe(data.settlements.length);
    expect(svg.querySelectorAll("circle.settlement").length).toBe(
      data.settlements.length,
    );
    expect(svg.querySelectorAll("text.settlement-label").length).toBe(
      data.settlements.length,
    );
    const daugmale = settlementDots.get("daugmale")!;
    expect(daugmale.getAttribute("data-settlement-id")).toBe("daugmale");
    const s = data.settlements.find((x) => x.id === "daugmale")!;
    expect(daugmale.getAttribute("cx")).toBe(String(s.x));
    expect(daugmale.getAttribute("cy")).toBe(String(s.y));
    expect(svg.querySelectorAll("text.label-river").length).toBe(
      data.labels.filter((l) => l.kind === "river").length,
    );
  });

  it("adds the attribution line to the container", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")!.textContent).toBe(
      data.attribution,
    );
  });
});
