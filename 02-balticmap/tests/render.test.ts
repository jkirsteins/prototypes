// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per land with data-id, people color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(15);
    expect(regionPaths.size).toBe(15);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonians = data.peoples.find((p) => p.id === "curonians")!;
    expect(kursa.getAttribute("fill")).toBe(curonians.color);
  });

  it("fills by the FIRST people when a land has several", () => {
    const container = document.createElement("div");
    const { regionPaths } = renderMap(data, container);
    const zemgale = regionPaths.get("zemgale-selija")!;
    const semigallians = data.peoples.find((p) => p.id === "semigallians")!;
    expect(zemgale.getAttribute("fill")).toBe(semigallians.color);
  });

  it("renders neighbors beneath regions and labels by kind", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.neighbor").length).toBe(
      data.neighbors.length,
    );
    for (const kind of ["people", "people-minor", "neighbor", "title", "subtitle"]) {
      const expected = data.labels.filter((l) => l.kind === kind);
      const rendered = svg.querySelectorAll(`text.label-${kind}`);
      expect(rendered.length).toBe(expected.length);
    }
    const title = svg.querySelector("text.label-title")!;
    expect(title.textContent).toBe("Anno Domini 1184");
    const groups = Array.from(svg.querySelectorAll("g"));
    const neighborIdx = groups.findIndex((g) => g.classList.contains("neighbors"));
    const regionIdx = groups.findIndex((g) => g.classList.contains("regions"));
    expect(neighborIdx).toBeGreaterThanOrEqual(0);
    expect(neighborIdx).toBeLessThan(regionIdx);
  });

  it("adds the attribution line to the container", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")!.textContent).toBe(
      data.attribution,
    );
  });
});
