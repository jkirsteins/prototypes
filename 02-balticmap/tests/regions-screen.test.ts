// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createRegionsScreen } from "../src/regions-screen";
import { REGIONS } from "../src/regions";

describe("regions screen", () => {
  it("shows one tile per region with name, era, blurb and a preview", () => {
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick: () => {}, onClose: () => {},
    });
    const tiles = el.querySelectorAll(".rs-tile");
    expect(tiles.length).toBe(Object.keys(REGIONS).length);
    for (const region of Object.values(REGIONS)) {
      expect(el.textContent).toContain(region.name);
      expect(el.textContent).toContain(region.era);
    }
    // The preview is real geometry, not a screenshot: one svg per tile,
    // holding that region's polygon paths.
    for (const tile of tiles) {
      expect(tile.querySelectorAll("svg path").length).toBeGreaterThan(10);
    }
    // The active tile says so and does not re-pick.
    expect(el.querySelector(".rs-tile.active")?.textContent).toContain("Active");
  });

  it("picking the inactive tile calls onPick with its id", () => {
    const onPick = vi.fn();
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick, onClose: () => {},
    });
    const inactive = [...el.querySelectorAll(".rs-tile")]
      .find((t) => !t.classList.contains("active"))!;
    (inactive as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith("iberia");
  });

  it("the active tile does not fire onPick, and Back closes", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick, onClose,
    });
    (el.querySelector(".rs-tile.active") as HTMLElement).click();
    expect(onPick).not.toHaveBeenCalled();
    (el.querySelector(".rs-back") as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
