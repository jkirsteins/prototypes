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

    tooltip.show("Kursa", 100, 200);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kursa");
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });

  it("flips to the other side of the cursor rather than off the window", () => {
    // happy-dom measures every element as 0, so the size has to be stubbed -
    // without it the flip can never trigger and the test would pass on a
    // tooltip that still runs off the edge.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    Object.defineProperty(el, "offsetWidth", { value: 280 });
    Object.defineProperty(el, "offsetHeight", { value: 60 });

    tooltip.showLines([{ text: "Zemgale (Semigallians)" }], 100, 200);
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    // Near the far corner it goes above and to the left of the cursor instead.
    tooltip.showLines(
      [{ text: "Zemgale (Semigallians)" }],
      window.innerWidth - 20,
      window.innerHeight - 20,
    );
    expect(el.style.left).toBe(`${window.innerWidth - 20 - 12 - 280}px`);
    expect(el.style.top).toBe(`${window.innerHeight - 20 - 12 - 60}px`);
  });

  it("gives an amount its own column, because the tip collapses padded spaces", () => {
    // .tooltip is white-space: pre-line, so a space-padded column would not
    // align. The amount has to be its own element or the breakdown is ragged.
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ amount: "+1", text: "a settlement (Might only)" }], 0, 0);
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

    tooltip.showLines([{ text: "Out of reach.", tone: "bad" }], 0, 0);
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
    ])], 0, 0);
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

    tooltip.showLines([{ text: "Might +1/2" }], 100, 200);
    tooltip.redraw([{ text: "Might +2/2" }]);
    expect(el.textContent).toBe("Might +2/2");
    expect(el.classList.contains("hidden")).toBe(false);
    // Placed from the cursor it was opened at, not from 0,0.
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    tooltip.redraw([{ text: "should not appear" }]);
    expect(el.classList.contains("hidden")).toBe(true);
    expect(el.textContent).toBe("Might +2/2");
  });

  it("keeps the tone on the row when an amount is present", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;

    tooltip.showLines([{ amount: "=", text: "6", tone: "bad" }], 0, 0);
    const row = el.querySelector(".tooltip-line") as HTMLElement;
    expect(row.classList.contains("tone-bad")).toBe(true);
  });

  it("never leaves the near edge either, when the flip would overshoot it", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    Object.defineProperty(el, "offsetWidth", { value: 280 });
    Object.defineProperty(el, "offsetHeight", { value: 60 });

    // A cursor near the left edge of a window too narrow for the tip: flipping
    // would put it at a negative left, so it clamps to the margin.
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 200, configurable: true });
    try {
      tooltip.showLines([{ text: "x" }], 10, 10);
      expect(el.style.left).toBe("4px");
    } finally {
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    }
  });
});
