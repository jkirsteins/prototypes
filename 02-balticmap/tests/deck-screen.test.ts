// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";
import { BUILDS, CARDS, NEUTRAL_POOL, startingDeck } from "../src/cards";
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

const tiles = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>(".ds-builds .ds-build")];

describe("createDeckScreen", () => {
  it("is hidden until shown, then offers the one build a player may pick", () => {
    // Pestilence is played by the AI seats and is not offered here until its
    // cards have had a pass of their own - a build nobody can pick is still a
    // build the player meets on the board.
    const { container, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update(view());
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    expect(tiles(container)).toHaveLength(1);
    expect(tiles(container)[0].querySelector(".ds-build-blurb")?.textContent)
      .toContain("raids that scale with your ruler's leadership");
  });

  it("names every card of the build on its tile - this is where the pool is learnt", () => {
    const { container, screen } = setup();
    screen.update(view());
    const lines = tiles(container)[0].querySelectorAll(".ds-build-card");
    expect(lines).toHaveLength(BUILDS.warpath.length);
    expect([...lines].map((l) => l.querySelector("strong")?.textContent))
      .toEqual(BUILDS.warpath.map((id) => CARDS[id].name));
    // Every named card carries its rules text, not just its name.
    for (const line of lines) {
      expect(line.querySelector(".ds-card-text")!.textContent!.length)
        .toBeGreaterThan(0);
    }
  });

  it("carries no card heading of its own - the build is not a card", () => {
    // `.ds-card-name` is the heading a CARD line uses, so a build name in one
    // read as a card called Warpath sitting above the real ones.
    const { container, screen } = setup();
    screen.update(view());
    expect(container.querySelectorAll(".ds-builds .ds-card-name")).toHaveLength(0);
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

  it("marks the tile selected only while the view names its build", () => {
    const { container, screen } = setup();
    screen.update(view({ build: "pestilence" }));
    expect(tiles(container)[0].classList.contains("selected")).toBe(false);
    screen.update(view({ build: "warpath" }));
    expect(tiles(container)[0].classList.contains("selected")).toBe(true);
  });

  it("reports a tile click so the pick is remembered even if the player leaves", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ build: "pestilence" }));
    tiles(container)[0].click();
    expect(cb.onBuildChange).toHaveBeenCalledWith("warpath");
    expect(tiles(container)[0].classList.contains("selected")).toBe(true);
  });

  it("starts with the selected build", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith("warpath");
    // A view carrying a build with no tile still starts on that build: the
    // screen reports what it was told, and only a click changes it.
    screen.update(view({ build: "pestilence" }));
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenLastCalledWith("pestilence");
    tiles(container)[0].click();
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenLastCalledWith("warpath");
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
    // One name per axis, and no alternative: the options live in the modal.
    const summary = q(container, ".ds-rules-summary").textContent ?? "";
    expect(summary).toBe("One card per turn, Keep your hand");
    expect(summary).not.toContain("Unlimited plays");
    expect(summary).not.toContain("Discard at turn's end");
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
    expect(q(container, ".ds-rules-summary").textContent)
      .toBe("Unlimited plays, Keep your hand");
    expect(radio.checked).toBe(true);
  });

  it("locks the radios read-only for a guest, and says whose rules they are", () => {
    // A guest plays the HOST's rules - one engine, and it is the host's. The
    // options stay visible: the guest still needs to know what it is about to
    // play under.
    const { container, screen } = setup();
    screen.update(view({ rulesLocked: true }));
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "One card per turn, Keep your hand (set by the host)",
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
