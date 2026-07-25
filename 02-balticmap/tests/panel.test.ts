// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createPanel, createTooltip, formatPopulation, tooltipText } from "../src/panel";
import type { People, Region } from "../src/types";

const peoples: People[] = [
  { id: "latgalians", name: "Latgalians", color: "#e5b28e" },
  { id: "livs", name: "Livs", color: "#a8c8cf" },
];

const talava: Region = {
  id: "talava",
  name: "Tālava",
  peoples: ["latgalians", "livs"],
  population: 30000,
  cohesion: "high",
  flavor: "Latgalian land on the upper Gauja.",
  places: ["Beverīna", "Trikāta"],
  path: "M0 0Z",
};

const jersika: Region = {
  id: "jersika",
  name: "Jersika",
  peoples: ["latgalians"],
  population: 35000,
  cohesion: "high",
  flavor: "A principality on the Daugava.",
  places: ["Koknese"],
  path: "M0 0Z",
};

describe("panel", () => {
  it("is hidden initially, shows land details on show()", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples);
    const root = container.querySelector(".panel")!;
    expect(root.classList.contains("hidden")).toBe(true);

    panel.show(talava);
    expect(root.classList.contains("hidden")).toBe(false);
    expect(container.querySelector(".panel-name")!.textContent).toBe("Tālava");
    expect(container.querySelector(".panel-peoples")!.textContent).toBe(
      "Predominantly Latgalians, with Livs",
    );
    expect(container.querySelector(".panel-population")!.textContent).toBe(
      "Population: ~30k",
    );
    expect(container.querySelector(".panel-cohesion")!.textContent).toBe(
      "Cohesion: high",
    );
    expect(container.querySelector(".panel-flavor")!.textContent).toBe(
      "Latgalian land on the upper Gauja.",
    );
    expect(container.querySelector(".panel-places")!.textContent).toBe(
      "Notable places: Beverīna, Trikāta",
    );

    panel.hide();
    expect(root.classList.contains("hidden")).toBe(true);
  });

  it("names a single people plainly, without 'Predominantly'", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples);
    panel.show(jersika);
    expect(container.querySelector(".panel-peoples")!.textContent).toBe(
      "Latgalians",
    );
  });

  it("invokes onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const panel = createPanel(container, onClose, peoples);
    panel.show(talava);
    (container.querySelector(".panel-close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("tooltip", () => {
  it("shows text near the cursor and hides", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    expect(el.classList.contains("hidden")).toBe(true);

    tooltip.show("Kursa", 100, 200);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kursa");
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });
});

describe("population helpers", () => {
  it("formats populations as 5k-rounded bands", () => {
    expect(formatPopulation(30000)).toBe("~30k");
    expect(formatPopulation(45000)).toBe("~45k");
    expect(formatPopulation(150000)).toBe("~150k");
  });

  it("builds a two-line tooltip with name, band, and cohesion", () => {
    expect(tooltipText(talava)).toBe("Tālava\n~30k - high cohesion");
    expect(tooltipText(jersika)).toBe("Jersika\n~35k - high cohesion");
  });
});
