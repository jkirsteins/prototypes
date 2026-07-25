import { describe, it, expect } from "vitest";
import { initialState, withHover, withClick } from "../src/state";

describe("selection state", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({ hovered: null, selected: null });
  });

  it("tracks hover without touching selection", () => {
    const s = withHover(withClick(initialState, "kursa"), "ravala");
    expect(s).toEqual({ hovered: "ravala", selected: "kursa" });
    expect(withHover(s, null).hovered).toBeNull();
  });

  it("click selects, clicking another region switches", () => {
    const a = withClick(initialState, "kursa");
    expect(a.selected).toBe("kursa");
    expect(withClick(a, "dainava").selected).toBe("dainava");
  });

  it("clicking the selected region or the background deselects", () => {
    const a = withClick(initialState, "kursa");
    expect(withClick(a, "kursa").selected).toBeNull();
    expect(withClick(a, null).selected).toBeNull();
  });
});
