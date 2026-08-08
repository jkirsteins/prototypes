// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";
import { BUILDS, NEUTRAL_POOL, startingDeck } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = {
    onStart: vi.fn(), onBuildChange: vi.fn(),
    onShowTip: vi.fn(), onHideTip: vi.fn(), onRulesChange: vi.fn(),
  };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

const view = (over: Record<string, unknown> = {}) => ({
  visible: true, build: "warpath", rules: DEFAULT_RULES, ...over,
}) as Parameters<ReturnType<typeof createDeckScreen>["update"]>[0];

const tileOf = (container: HTMLElement, title: string): HTMLElement =>
  [...container.querySelectorAll<HTMLElement>(".ds-builds .ds-build")]
    .find((t) => t.querySelector(".ds-card-name")?.textContent === title)!;

describe("createDeckScreen", () => {
  it("is hidden until shown, then offers the two builds", () => {
    const { container, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update(view());
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    const tiles = [...container.querySelectorAll(".ds-builds .ds-build")];
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.querySelector(".ds-card-name")?.textContent))
      .toEqual(["Warpath", "Pestilence"]);
  });

  it("names every card of a build on its tile - this is where the pool is learnt", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(container.querySelectorAll(".ds-builds .ds-build")[0]
      ?.querySelectorAll(".ds-build-card")).toHaveLength(BUILDS.warpath.length);
    expect(container.querySelectorAll(".ds-builds .ds-build")[1]
      ?.querySelectorAll(".ds-build-card")).toHaveLength(BUILDS.pestilence.length);
    // Every named card carries its rules text, not just its name.
    for (const line of container.querySelectorAll(".ds-build-card")) {
      expect(line.querySelector(".ds-card-text")!.textContent!.length)
        .toBeGreaterThan(0);
    }
  });

  it("states the starting deck size and the shared neutral pool", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-label").textContent).toContain(
      `the same ${startingDeck().length} cards`,
    );
    const neutrals = q(container, ".ds-neutrals").textContent ?? "";
    expect(NEUTRAL_POOL.length).toBeGreaterThan(0);
    // The neutral line names every neutral card - both builds harvest from it.
    expect(neutrals).toContain("Hillfort");
    expect(neutrals).toContain("Subjugate");
  });

  it("marks the view's build selected, and only it", () => {
    const { container, screen } = setup();
    screen.update(view({ build: "pestilence" }));
    expect(tileOf(container, "Pestilence").classList.contains("selected")).toBe(true);
    expect(tileOf(container, "Warpath").classList.contains("selected")).toBe(false);
    screen.update(view({ build: "warpath" }));
    expect(tileOf(container, "Warpath").classList.contains("selected")).toBe(true);
    expect(tileOf(container, "Pestilence").classList.contains("selected")).toBe(false);
  });

  it("reports a tile click so the pick is remembered even if the player leaves", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    tileOf(container, "Pestilence").click();
    expect(cb.onBuildChange).toHaveBeenCalledWith("pestilence");
    expect(tileOf(container, "Pestilence").classList.contains("selected")).toBe(true);
  });

  it("starts with the selected build", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith("warpath");
    tileOf(container, "Pestilence").click();
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenLastCalledWith("pestilence");
  });

  it("keeps the start button and the rules row out of the build tiles", () => {
    const { container, screen } = setup();
    screen.update(view());
    const row = q(container, ".ds-builds");
    expect(row.contains(q(container, ".ds-start"))).toBe(false);
    expect(row.contains(q(container, ".ds-rules-row"))).toBe(false);
  });

  it("clears the shared tooltip when the screen goes away under the cursor", () => {
    // The tip is coordinate-driven and outlives its tile: a card reference
    // hovered as the screen closes never fires mouseleave, and the tip
    // strands over the map.
    const { cb, screen } = setup();
    screen.update(view());
    screen.update(view({ visible: false }));
    expect(cb.onHideTip).toHaveBeenCalled();
  });
});

describe("rules picker", () => {
  it("summarizes the current pick and keeps the options out of the screen", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-rules-summary").textContent).toBe("One card per turn");
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("opens the modal from the button and closes it on Done", () => {
    const { container, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(false);
    q(container, ".ds-rules-done").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("reports a radio pick and reflects the updated view", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    const radio = container.querySelector(
      'input[name="ds-rules-turn"][value="unlimited"]',
    ) as HTMLInputElement;
    radio.click();
    expect(cb.onRulesChange).toHaveBeenCalledWith({
      ...DEFAULT_RULES, turn: "unlimited",
    });
    screen.update(view({ rules: { ...DEFAULT_RULES, turn: "unlimited" } }));
    expect(q(container, ".ds-rules-summary").textContent).toBe("Unlimited plays");
    expect(radio.checked).toBe(true);
  });

  it("locks the radios read-only for a guest, and says whose rules they are", () => {
    // A guest plays the HOST's rules - one engine, and it is the host's. The
    // options stay visible: the guest still needs to know what it is about to
    // play under.
    const { container, screen } = setup();
    screen.update(view({ rulesLocked: true }));
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "One card per turn (set by the host)",
    );
    for (const input of container.querySelectorAll<HTMLInputElement>(
      ".ds-rules-overlay input",
    )) {
      expect(input.disabled).toBe(true);
    }
    // And unlocked again when the view says so.
    screen.update(view({ rulesLocked: false }));
    for (const input of container.querySelectorAll<HTMLInputElement>(
      ".ds-rules-overlay input",
    )) {
      expect(input.disabled).toBe(false);
    }
  });
});
