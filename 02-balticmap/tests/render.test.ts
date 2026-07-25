// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap, regionFill } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per region with data-id, fill, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(21);
    expect(regionPaths.size).toBe(21);
    const kurzeme = regionPaths.get("LV003")!;
    expect(kurzeme.getAttribute("data-id")).toBe("LV003");
    expect(kurzeme.getAttribute("fill")).toBe(regionFill("LV", 0));
  });

  it("renders neighbors beneath regions and country labels", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.neighbor").length).toBe(data.neighbors.length);
    const labels = Array.from(svg.querySelectorAll("text.country-label"));
    expect(labels.map((l) => l.textContent).sort()).toEqual([
      "ESTONIA", "LATVIA", "LITHUANIA",
    ]);
    // neighbors group comes before regions group in document order
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

  it("assigns distinct fills within a country", () => {
    const lt = Array.from({ length: 10 }, (_, i) => regionFill("LT", i));
    expect(new Set(lt).size).toBe(10);
  });
});
