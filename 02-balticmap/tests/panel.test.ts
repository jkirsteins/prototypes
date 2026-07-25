// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createPanel, createTooltip, formatPopulation, formatFactionType, tooltipText, settlementTooltipText } from "../src/panel";
import type { Faction, People, Region, Settlement } from "../src/types";

const peoples: People[] = [
  { id: "latgalians", name: "Latgalians", color: "#e5b28e" },
  { id: "livs", name: "Livs", color: "#a8c8cf" },
];

const factions: Faction[] = [
  {
    id: "talavians", name: "Talavians", ethnicity: "latgalians",
    type: "chiefdom", color: "#e5b28e",
  },
  {
    id: "jersikans", name: "Jersikans", ethnicity: "latgalians",
    type: "principality", color: "#cd9468",
  },
];

const talava: Region = {
  id: "talava",
  name: "Tālava",
  peoples: ["latgalians", "livs"],
  faction: "talavians",
  population: 30000,
  cohesion: "high",
  maxSettlements: 3,
  adjacent: [],
  flavor: "Latgalian land on the upper Gauja.",
  places: ["Beverīna", "Trikāta"],
  path: "M0 0Z",
};

const jersika: Region = {
  id: "jersika",
  name: "Jersika",
  peoples: ["latgalians"],
  faction: "jersikans",
  population: 35000,
  cohesion: "high",
  maxSettlements: 4,
  adjacent: [],
  flavor: "A principality on the Daugava.",
  places: ["Koknese"],
  path: "M0 0Z",
};

const settlements: Settlement[] = [
  {
    id: "trikata", name: "Trikāta", note: "Latgalian chief's fort.",
    land: "talava", unlocked: true, x: 10, y: 20,
  },
  {
    id: "jersika-town", name: "Jersika", note: "Seat of the princes.",
    land: "jersika", unlocked: true, x: 30, y: 40,
  },
];

describe("panel", () => {
  it("is hidden initially, shows land details on show()", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples, factions, settlements);
    const root = container.querySelector(".panel")!;
    expect(root.classList.contains("hidden")).toBe(true);

    panel.show(talava);
    expect(root.classList.contains("hidden")).toBe(false);
    expect(container.querySelector(".panel-name")!.textContent).toBe("Tālava");
    expect(container.querySelector(".panel-faction")!.textContent).toBe(
      "Faction: Talavians (chiefdom)",
    );
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
    const panel = createPanel(container, () => {}, peoples, factions, settlements);
    panel.show(jersika);
    expect(container.querySelector(".panel-peoples")!.textContent).toBe(
      "Latgalians",
    );
  });

  it("invokes onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const panel = createPanel(container, onClose, peoples, factions, settlements);
    panel.show(talava);
    (container.querySelector(".panel-close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the settlements line with the unlocked settlement and slot cap", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples, factions, settlements);
    panel.show(talava);
    expect(container.querySelector(".panel-settlements")!.textContent).toBe(
      "Settlements: Trikāta (1/3)",
    );
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

  it("builds a two-line tooltip with name, faction, band, and cohesion", () => {
    expect(tooltipText(talava, factions[0])).toBe(
      "Tālava\nTalavians - ~30k - high cohesion",
    );
    expect(tooltipText(jersika, factions[1])).toBe(
      "Jersika\nJersikans - ~35k - high cohesion",
    );
  });

  it("formats faction types with spaces", () => {
    expect(formatFactionType("regional-confederacy")).toBe(
      "regional confederacy",
    );
    expect(formatFactionType("county")).toBe("county");
  });

  it("settlementTooltipText shows name and note", () => {
    const s = {
      id: "daugmale", name: "Daugmale", note: "Great Liv hillfort.",
      land: "livzeme", unlocked: true, x: 100, y: 200,
    };
    expect(settlementTooltipText(s)).toBe("Daugmale\nGreat Liv hillfort.");
  });
});
