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

const releasedYou: GameEvent = {
  turn: 1, playerId: 3, type: "released", targetFactionId: "beta",
};

function hosted() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = { onNewGame: vi.fn(), onPlayCard: vi.fn() };
  const hud = createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
  ]), undefined, memoryStorage());
  return { container, hud };
}

/** The presentation the transition queue runs BEFORE the commit is not the
 *  HUD's any more, so a summary raised at stage 4 is by construction the
 *  round's epilogue. What the HUD still owes is the other half of that gate:
 *  the stage stays held while the modal is on screen, so nothing resolves the
 *  next round behind a modal about the last one. */
describe("the round summary and the stage behind it", () => {
  it("shows nothing on the repaint, and everything on the raise", () => {
    const { container, hud } = hosted();
    const g = playing();
    hud.update(g);
    vi.runAllTimers(); // settle the deal's own draw flights
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    // A repaint happens several times per move: the beats' own paint, the
    // commit, and every hover in between. None of them may interrupt.
    expect(overlay.classList.contains("hidden")).toBe(true);

    expect(hud.raiseRoundSummary(() => {})).toBe(true);
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(overlay.textContent).toContain("Subjugate");
  });

  it("holds the stage while the modal is up and releases it on dismiss", () => {
    // The AI must not take its turns behind a modal about the turn before it.
    const { container, hud } = hosted();
    const g = playing();
    hud.update(g);
    vi.runAllTimers();
    hud.update({ ...g, log: [...g.log, subjugatedYou] });

    const done = vi.fn();
    hud.raiseRoundSummary(done);
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    expect(overlay.classList.contains("hidden")).toBe(false);
    vi.runAllTimers();
    expect(done).not.toHaveBeenCalled();

    // Scoped to the summary's own overlay: the harvest offer's Cancel button
    // wears the same class.
    (overlay.querySelector(".notice-continue") as HTMLElement).click();
    expect(overlay.classList.contains("hidden")).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("is one modal for a round that arrived as several moves", () => {
    // The shape a round actually has: the advance, then a transition per
    // acting seat, each with its own commit. A modal per commit would either
    // ask the player to dismiss one for every seat or - which is what
    // happened while the repaint raised it - let the last silently replace
    // the first.
    const { container, hud } = hosted();
    const g = playing();
    hud.update(g);
    vi.runAllTimers();
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    hud.update({ ...g, log: [...g.log, subjugatedYou, releasedYou] });

    expect(hud.raiseRoundSummary(() => {})).toBe(true);
    const lines = [...container.querySelectorAll(".notice-line")]
      .map((el) => el.textContent ?? "");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Subjugate");
    expect(lines[1]).toContain("released you");
  });

  it("never replaces what is on screen, and never drops what arrived under it", () => {
    // The failure this rules out: news arriving while the player is reading
    // the modal, silently rewriting it or vanishing. A repaint under a raised
    // modal folds its batch in for the NEXT one and touches the one up.
    const { container, hud } = hosted();
    const g = playing();
    hud.update(g);
    vi.runAllTimers();
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    const read = vi.fn();
    expect(hud.raiseRoundSummary(read)).toBe(true);
    const lines = () => [...container.querySelectorAll(".notice-line")]
      .map((el) => el.textContent ?? "");
    expect(lines()).toHaveLength(1);

    hud.update({ ...g, log: [...g.log, subjugatedYou, releasedYou] });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain("Subjugate");

    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    (overlay.querySelector(".notice-continue") as HTMLElement).click();
    expect(read).toHaveBeenCalledTimes(1);
    // What arrived while it was up is owed the next modal rather than lost.
    expect(hud.raiseRoundSummary(() => {})).toBe(true);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain("released you");
  });
});
