// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { createTooltip, settlementTooltipText, spanLine } from "../src/panel";
import type { Settlement } from "../src/types";

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

describe("settlementTooltipText", () => {
  it("names the place on the first line and says what it is on the second", () => {
    expect(settlementTooltipText(settlements[0]))
      .toBe("Trikāta\nLatgalian chief's fort.");
    expect(settlementTooltipText(settlements[1]))
      .toBe("Jersika\nSeat of the princes.");
  });
});

describe("tooltip", () => {
  it("shows text near the cursor and hides", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    expect(el.classList.contains("hidden")).toBe(true);

    tooltip.show("Kursa");
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kursa");
    // Parked at the left edge (the CSS class), never under the pointer -
    // src/style.css positions .tip-left with a fixed margin, so there is no
    // pixel offset left for the JS side to set.
    expect(el.style.left).toBe("");
    expect(el.style.top).toBe("");
    expect(el.classList.contains("tip-left")).toBe(true);
    expect(el.classList.contains("tip-right")).toBe(false);

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });

  it("parks at the left edge, wherever the cursor is", () => {
    // The right side belongs to the activity log. A tip that crossed over to
    // dodge the cursor covered it, so it does not.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ text: "Zemgale (Semigallians)" }]);
    expect(el.classList.contains("tip-left")).toBe(true);
    expect(el.classList.contains("tip-right")).toBe(false);
  });

  it("opens below the pinned land panel, which parks at the same edge", () => {
    // Both are the same dark box at the same left edge. Without this the tip
    // opens on top of the panel and the two read as one broken readout.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ text: "Zemgale (Semigallians)" }]);
    expect(el.style.top).toBe("");

    tooltip.clearTop(412);
    expect(el.style.top).toBe("412px");

    // And back to its own resting height when the pin is cleared.
    tooltip.clearTop(null);
    expect(el.style.top).toBe("");
  });

  it("gives an amount its own column, because the tip collapses padded spaces", () => {
    // .tooltip is white-space: pre-line, so a space-padded column would not
    // align. The amount has to be its own element or the breakdown is ragged.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ amount: "+1", text: "a settlement (Might only)" }]);
    const row = el.querySelector(".tooltip-line") as HTMLElement;
    expect(row.classList.contains("has-amount")).toBe(true);
    expect(row.querySelector(".tooltip-amount")?.textContent).toBe("+1");
    expect(row.querySelector(".tooltip-text")?.textContent)
      .toBe("a settlement (Might only)");
    // The row still reads as one sentence, which is what the placement and the
    // existing text assertions rely on.
    expect(row.textContent).toBe("+1a settlement (Might only)");
  });

  it("leaves a line with no amount a single text node", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ text: "Out of reach.", tone: "bad" }]);
    const row = el.querySelector(".tooltip-line") as HTMLElement;
    expect(row.classList.contains("has-amount")).toBe(false);
    expect(row.querySelector(".tooltip-amount")).toBeNull();
    expect(row.textContent).toBe("Out of reach.");
  });

  it("colours a standing value by its own sign, inside the line", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([spanLine([
      { text: "Might " },
      { text: "-2", lead: -2 },
      { text: " -> " },
      { text: "-1", lead: -1 },
    ])]);
    const values = [...el.querySelectorAll(".tooltip-value")];
    expect(values.map((v) => v.textContent)).toEqual(["-2", "-1"]);
    expect(values.every((v) => v.classList.contains("lead-bad"))).toBe(true);
    // The line still reads as one sentence for anything checking textContent.
    expect(el.textContent).toBe("Might -2 -> -1");
  });

  it("redraws in place when the state behind it moves, and not while hidden", () => {
    // The tip stays up through a card being played and the AI answering, so
    // every number on it goes stale unless something re-renders it.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ text: "Might +1/2" }]);
    tooltip.redraw([{ text: "Might +2/2" }]);
    expect(el.textContent).toBe("Might +2/2");
    expect(el.classList.contains("hidden")).toBe(false);
    // Still parked where it was, and a redraw does not move it.
    expect(el.classList.contains("tip-left")).toBe(true);
    expect(el.classList.contains("tip-right")).toBe(false);

    tooltip.hide();
    tooltip.redraw([{ text: "should not appear" }]);
    expect(el.classList.contains("hidden")).toBe(true);
    expect(el.textContent).toBe("Might +2/2");
  });

  it("keeps the tone on the row when an amount is present", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ amount: "=", text: "6", tone: "bad" }]);
    const row = el.querySelector(".tooltip-line") as HTMLElement;
    expect(row.classList.contains("tone-bad")).toBe(true);
  });

  it("still parks cleanly on the edge in a window too narrow for the old flip math", () => {
    // The margin used to be JS clamp arithmetic against a measured tip width;
    // it is now a fixed margin in the .tip-left CSS rule (see src/style.css),
    // so a narrow window can never push it off-screen and there is nothing
    // left for `place` to compute or clamp.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 200, configurable: true });
    try {
      tooltip.showLines([{ text: "x" }]);
      expect(el.classList.contains("tip-left")).toBe(true);
      expect(el.style.left).toBe("");
    } finally {
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    }
  });
});
