// @vitest-environment happy-dom
//
// A dedicated file: module mocks are per-file, and every other HUD test
// needs the real flyCard. This one exists solely to prove the last-resort
// net in Hud.afterPlayAnimation - if a flight's onDone is somehow lost (the
// element got GC'd oddly, a listener threw, whatever), the human's turn
// still ends instead of hanging forever.
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/animate", () => ({
  flyCard: vi.fn(() => ({ el: document.createElement("div"), totalMs: 1420, cancel: vi.fn() })),
  runAnimation: vi.fn(() => ({ cancel: vi.fn() })),
}));

import { createHud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseBuild, pickFaction, playCard,
} from "../src/game";
import type { Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

describe("afterPlayAnimation watchdog", () => {
  it("fires the continuation even when the flight's onDone is never called", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const cb: HudCallbacks = { onNewGame: vi.fn(), onPlayCard: vi.fn() };
    const hud = createHud(container, cb, new Map([
      ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
    ]));

    let g = pickFaction(chooseBuild(startGame(newGame(FACTIONS)), "warpath"), "beta", seededRng(1));
    hud.update(g); // opening draw - the mocked flyCard never resolves it either
    const p0 = { ...g.players[0], hand: ["grow-crops"] };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    g = playCard(g, 0, seededRng(1));
    hud.update(g); // the mocked play flight is now "in the air" forever

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.advanceTimersByTime(1420 + 500 - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
