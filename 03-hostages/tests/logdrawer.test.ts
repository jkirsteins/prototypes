import { describe, it, expect, beforeEach } from "vitest";
import { createLogDrawer } from "../src/ui/logdrawer";
import { newRun, chooseOpening } from "../src/game";

beforeEach(() => {
  document.body.innerHTML = "";
});

function started() {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

describe("log drawer", () => {
  it("appends one entry per event", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log);
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("accumulates across calls rather than replacing", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log.slice(0, 2));
    drawer.append(state.log.slice(2));
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("marks which side each entry belongs to", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log);
    const sides = [...drawer.root.querySelectorAll(".log-entry")].map(
      (n) => (n as HTMLElement).dataset.side,
    );
    expect(sides).toEqual(state.log.map((e) => e.side));
  });

  it("inserts a separator when the turn number changes", () => {
    const drawer = createLogDrawer();
    const state = started();
    const bumped = state.log.map((e, i) => ({ ...e, turn: i < 2 ? 1 : 2 }));
    drawer.append(bumped);
    expect(drawer.root.querySelectorAll(".log-turn")).toHaveLength(2);
  });

  it("collapses and expands", () => {
    const drawer = createLogDrawer();
    const toggle = drawer.root.querySelector<HTMLButtonElement>(".log-toggle");
    expect(drawer.root.classList.contains("collapsed")).toBe(false);
    toggle?.click();
    expect(drawer.root.classList.contains("collapsed")).toBe(true);
    toggle?.click();
    expect(drawer.root.classList.contains("collapsed")).toBe(false);
  });

  it("empties on clear", () => {
    const drawer = createLogDrawer();
    drawer.append(started().log);
    drawer.clear();
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(0);
  });

  it("scrolls to the newest entry after appending", () => {
    // happy-dom performs no layout, so scrollHeight is permanently 0 and a
    // naive assertion would pass against code that never touched scrollTop.
    // Stub the getter to a distinctive value so only real code can produce it.
    const stubbed = 4242;
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollHeight", {
      configurable: true,
      get: () => stubbed,
    });
    try {
      const drawer = createLogDrawer();
      document.body.append(drawer.root);
      drawer.append(started().log);
      const entries = drawer.root.querySelector<HTMLElement>(".log-entries");
      expect(entries?.scrollTop).toBe(stubbed);
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollHeight", original);
    }
  });
});
