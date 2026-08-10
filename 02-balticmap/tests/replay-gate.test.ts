// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseBuild, pickFaction,
  type GameEvent, type GameState,
} from "../src/game";
import type { Rng } from "../src/cards";
import { memoryStorage } from "../src/meta";
import { animations } from "../src/animate";

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

describe("the summary parks behind the replay", () => {
  it("holds the modal while replay steps run, and raises it when the queue drains", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let release: (() => void) | null = null;
    const cb: HudCallbacks = {
      onNewGame: vi.fn(),
      onPlayCard: vi.fn(),
      replayRound(fresh) {
        if (!fresh.some((e) => e.type === "subjugated")) return 0;
        animations.push((done) => {
          release = done;
        });
        return 1;
      },
    };
    const hud = createHud(container, cb, new Map([
      ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
    ]), undefined, memoryStorage());

    const g = playing();
    hud.update(g);
    vi.runAllTimers(); // settle the deal's own draw flights

    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    vi.runAllTimers(); // drains everything except the held replay step
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    expect(release).not.toBeNull();
    expect(overlay.classList.contains("hidden")).toBe(true);

    release!();
    // The queue drained: settleTurn's idle waiter raises the parked summary.
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(overlay.textContent).toContain("Subjugate");
  });

  it("raises the modal synchronously when the replay queued nothing", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cb: HudCallbacks = {
      onNewGame: vi.fn(),
      onPlayCard: vi.fn(),
      replayRound: () => 0,
    };
    const hud = createHud(container, cb, new Map([
      ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
    ]), undefined, memoryStorage());

    const g = playing();
    hud.update(g);
    vi.runAllTimers();
    hud.update({ ...g, log: [...g.log, subjugatedYou] });
    const overlay = container.querySelector(".notice-overlay") as HTMLElement;
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});
