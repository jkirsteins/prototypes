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

  it("click selects when nothing is selected", () => {
    expect(withClick(initialState, "kursa").selected).toBe("kursa");
  });

  it("any click while something is selected clears it, and only that", () => {
    // Including a click on a different region: selecting it takes a second
    // click, so a stray one cannot slide the pin off what is being read.
    const a = withClick(initialState, "kursa");
    expect(withClick(a, "dainava").selected).toBeNull();
    expect(withClick(a, "kursa").selected).toBeNull();
    expect(withClick(a, null).selected).toBeNull();
    expect(withClick(withClick(a, "dainava"), "dainava").selected).toBe("dainava");
  });
});
