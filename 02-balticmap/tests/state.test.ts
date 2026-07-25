import { describe, it, expect } from "vitest";
import { initialState, withHover, withClick } from "../src/state";

describe("selection state", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({ hovered: null, selected: null });
  });

  it("tracks hover without touching selection", () => {
    const s = withHover(withClick(initialState, "LV003"), "EE001");
    expect(s).toEqual({ hovered: "EE001", selected: "LV003" });
    expect(withHover(s, null).hovered).toBeNull();
  });

  it("click selects, clicking another region switches", () => {
    const a = withClick(initialState, "LV003");
    expect(a.selected).toBe("LV003");
    expect(withClick(a, "LT001").selected).toBe("LT001");
  });

  it("clicking the selected region or the background deselects", () => {
    const a = withClick(initialState, "LV003");
    expect(withClick(a, "LV003").selected).toBeNull();
    expect(withClick(a, null).selected).toBeNull();
  });
});
