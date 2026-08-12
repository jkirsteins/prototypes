// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseBuild, pickFaction,
  type GameEvent, type GameState,
} from "../src/game";
import type { Rng } from "../src/cards";
import { memoryStorage } from "../src/meta";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

// The same fake-timer discipline as tests/hud.test.ts, for the same reason:
// every update may queue draw flights on the shared singleton queue, and
// under real timers they leak across tests.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runAllTimers();
    vi.useRealTimers();
  }
});

function playing(): GameState {
  const g = pickFaction(
    chooseBuild(startGame(newGame(FACTIONS)), "warpath", seededRng(1)),
    "beta", seededRng(1),
  );
  return { ...g, passives: {} };
}

const subjugatedYou: GameEvent = {
  turn: 1, playerId: 2, type: "subjugated",
  targetFactionId: "beta", overlordFactionId: "alpha",
  via: "claim", cardId: "subjugate",
};

/** The presentation the transition queue runs BEFORE this repaint is not the
 *  HUD's any more, so a summary raised here is by construction the round's
 *  epilogue. What the HUD still owes is the other half of that gate: nothing
 *  may resolve the next round while the modal about the last one is on
 *  screen. */
describe("the round summary and the continuation behind it", () => {
  it("raises the modal on the repaint that carries the round", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cb: HudCallbacks = { onNewGame: vi.fn(), onPlayCard: vi.fn() };
    const hud = createHud(container, cb, new Map([
      ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
    ]), undefined, memoryStorage());

    const g = playing();
    hud.update(g);
    vi.runAllTimers(); // settle the deal's own draw flights
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(overlay.textContent).toContain("Subjugate");
  });

  it("holds a continuation while the modal is up and releases it on dismiss", () => {
    // The AI must not take its turns behind a modal about the turn before it.
    // The summary here is raised straight from the repaint rather than parked,
    // which is the shape every round has now that the replay runs before the
    // commit - so the hold cannot be a property of parking alone.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cb: HudCallbacks = { onNewGame: vi.fn(), onPlayCard: vi.fn() };
    const hud = createHud(container, cb, new Map([
      ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
    ]), undefined, memoryStorage());

    const g = playing();
    hud.update(g);
    vi.runAllTimers();
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    expect(overlay.classList.contains("hidden")).toBe(false);

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();

    // Scoped to the summary's own overlay: the harvest offer's Cancel button
    // wears the same class.
    (overlay.querySelector(".notice-continue") as HTMLElement).click();
    expect(overlay.classList.contains("hidden")).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
