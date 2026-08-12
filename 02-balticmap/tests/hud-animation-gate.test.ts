// @vitest-environment happy-dom
//
// A dedicated file: module mocks are per-file, and every other HUD test
// needs the real flyCard. This one exists to prove the two halves of the turn
// gate: Hud.afterPlayAnimation - that the human's turn ends when their card
// lands and not before, and that it ends even if a flight's onDone is somehow
// lost (the element got GC'd oddly, a listener threw, whatever) - and the
// transition lifecycle above it, which is what holds the round while a beat
// nobody played is still on the animation queue.
//
// `flyCard` is replaced with a flight that never reports itself finished
// unless a test says so; the REAL animation queue is kept, because the order
// it imposes is half of what the gate has to answer for.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Every stalled flight's onDone, in the order they were started. Hoisted so
 *  the mock factory can reach it, and drained between tests: the queue is a
 *  module singleton and a step that never releases would wedge the next
 *  test's queue rather than fail it. */
const { stalled } = vi.hoisted(() => ({ stalled: [] as (() => void)[] }));

vi.mock("../src/animate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/animate")>()),
  flyCard: vi.fn((
    _container: unknown, _className: unknown, _label: unknown,
    _from: unknown, _stages: unknown, onDone?: () => void,
  ) => {
    if (onDone !== undefined) stalled.push(onDone);
    return {
      el: document.createElement("div"), totalMs: 1420, cancel: vi.fn(),
    };
  }),
  runAnimation: vi.fn((
    _el: unknown, _frames: unknown, _ms: unknown, onDone?: () => void,
  ) => {
    if (onDone !== undefined) stalled.push(onDone);
    return { cancel: vi.fn() };
  }),
}));

import { animations } from "../src/animate";
import { createTransitionQueue, type Transition } from "../src/transitions";
import { createHud, type Hud, type HudCallbacks } from "../src/hud";
import { presentHudBeats } from "./helpers";
import {
  newGame, startGame, chooseBuild, pickFaction, playCard, beginTurn,
  type GameState,
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

/** The stalled flight's own total, as the mocked `flyCard` reports it, plus
 *  the slack `afterPlayAnimation` adds. The watchdog derives its deadline from
 *  the flight, never from a duration copied by hand, so this is what a test
 *  has to wait out. */
const STALLED_FLIGHT_MS = 1420;
const WATCHDOG_SLACK_MS = 500;

function hudOn(container: HTMLElement) {
  const cb: HudCallbacks = { onNewGame: vi.fn(), onPlayCard: vi.fn() };
  return createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
  ]));
}

function hosted() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, hud: hudOn(container) };
}

/** A move being SHOWN, the way `src/main.ts` shows one: the beats its batch
 *  earns and then the paint that commits it. `from` is the log length before
 *  the move. A bare `hud.update` flies nothing - a card in the air is a beat. */
function show(hud: Hud, g: GameState, from: number): void {
  presentHudBeats(hud, g, g.log.slice(from));
  hud.update(g);
}

/** A game with the human seat holding one harmless card, ready to play it. */
function ready(): GameState {
  const g = pickFaction(
    chooseBuild(startGame(newGame(FACTIONS)), "warpath", seededRng(1)),
    "beta", seededRng(1),
  );
  // Two cards against a one-land refill target of three (`handLimitFor`), so
  // the beginTurn below logs exactly one draw and the tests have a single
  // flight to queue a play behind. The deal itself is silent, and a seat that
  // opens already at its target would draw nothing at all.
  const p0 = { ...g.players[0], hand: ["grow-crops", "grow-crops"] };
  return beginTurn({ ...g, players: [p0, ...g.players.slice(1)] }, seededRng(1));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Let every stalled flight finish, so the shared queue drains rather than
  // carrying a wedged step into the next test. Releasing one may start the
  // next, which stalls in turn - hence the loop.
  while (stalled.length > 0) stalled.shift()!();
  animations.clear();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("afterPlayAnimation watchdog", () => {
  it("fires the continuation even when the flight's onDone is never called", () => {
    const { hud } = hosted();
    let g = ready();
    // The opening draw is not animated here: it would sit at the head of the
    // queue and the play behind it is not what this test is about. The queued
    // case has a test of its own below.
    hud.update(g, { animate: false });
    const before = g.log.length;
    g = playCard(g, 0, seededRng(1));
    show(hud, g, before); // the mocked play flight is now in the air forever

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.advanceTimersByTime(STALLED_FLIGHT_MS + WATCHDOG_SLACK_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("holds the turn while the play is still queued behind an earlier animation", () => {
    // The turn must not be handed over between the click and the card leaving
    // the hand. This turn's own draw is still in the air, so the play has been
    // asked for and not yet drawn - the window a bare `liveFlights` check
    // reads as "the card has landed".
    const { hud } = hosted();
    let g = ready();
    show(hud, g, 0); // opening draw: started, and it does not finish
    const queuedBefore = stalled.length;
    const before = g.log.length;
    g = playCard(g, 0, seededRng(1));
    show(hud, g, before); // the play queues BEHIND the stalled draw
    expect(stalled).toHaveLength(queuedBefore); // it has not started

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    // Well past what a play flight takes, and past the watchdog it would have
    // armed had it started: nothing has been handed over.
    vi.advanceTimersByTime(10 * (STALLED_FLIGHT_MS + WATCHDOG_SLACK_MS));
    expect(fn).not.toHaveBeenCalled();

    // The draw lands, the play finally flies, and its own watchdog takes over.
    stalled.shift()!();
    vi.advanceTimersByTime(STALLED_FLIGHT_MS + WATCHDOG_SLACK_MS);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("fires at once when nothing flew - a forced discard animates nothing", () => {
    const { hud } = hosted();
    hud.update(ready(), { animate: false });

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    expect(fn).not.toHaveBeenCalled(); // never inside its own call
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("holds the next transition while a beat is queued, though no card flew", () => {
    // The case a play-flight gate can never cover, and the one the old
    // continuation got wrong: a beat nobody played - a turn-start replay step,
    // the opening draw - is on the animation queue, and no card of the
    // player's is in the air. Asked of the queue rather than of the flights,
    // the next move waits; asked of the flights alone it starts at once and
    // resolves the round over a replay still being drawn.
    //
    // The stages are the two lines `src/main.ts` gives them: stage 1 queues
    // this move's beats and reports itself done when the queue drains, and
    // stage 4 waits for the played card. Everything else is the real
    // animation queue and the real HUD.
    const { hud } = hosted();
    const started: number[] = [];
    const turnOf = (t: Transition) =>
      (t.next as unknown as { turn: number }).turn;
    const q = createTransitionQueue({ turn: 1 } as unknown as GameState, {
      present: (t, done) => { started.push(turnOf(t)); animations.onIdle(done); },
      commit: () => {},
      ask: (_t, done) => done(),
      summary: (_t, done) => hud.afterPlayAnimation(done),
      ending: (_t, done) => done(),
      teardown: () => {},
    });
    const tr = (turn: number): Transition =>
      ({ next: { turn } as unknown as GameState, events: [], settled: false });

    const opening = ready();
    show(hud, opening, 0); // the opening draw: a beat, and no play in the air
    q.submit(tr(2));
    q.submit(tr(3));
    vi.advanceTimersByTime(10 * (STALLED_FLIGHT_MS + WATCHDOG_SLACK_MS));
    expect(started).toEqual([2]);

    stalled.shift()!(); // the draw lands, and the queue drains behind it
    vi.advanceTimersByTime(1); // afterPlayAnimation's own macrotask
    expect(started).toEqual([2, 3]);
  });

  it("releases a play still queued when a world arrives whole and the run goes on", () => {
    // The exchange path - a snapshot, a rejoin, a buffer past the cap - throws
    // the animation queue away while the state it commits is still "playing",
    // so nothing about the phase releases the waiter the way an ending does.
    // A play QUEUED and not yet started is the case that bites: its step goes
    // with the queue, and if the count of plays waiting on that queue does not
    // go with it, `afterPlayAnimation` is a callback that never fires - the
    // turn gate stays shut, `busy()` stays true, and the whole screen is
    // locked with nothing on it saying why.
    const { hud } = hosted();
    let g = ready();
    show(hud, g, 0); // the opening draw: started, and it does not finish
    const queuedBefore = stalled.length;
    const before = g.log.length;
    g = playCard(g, 0, seededRng(1));
    show(hud, g, before); // the play queues BEHIND the draw
    expect(stalled).toHaveLength(queuedBefore); // it has not started

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    const q = createTransitionQueue(g, {
      present: (_t, done) => done(),
      commit: () => {},
      ask: (_t, done) => done(),
      summary: (_t, done) => hud.afterPlayAnimation(done),
      ending: (_t, done) => done(),
      teardown: () => hud.dropFlights(),
    });
    q.replaceSettled(g); // history arriving whole, and the run goes on

    expect(fn).toHaveBeenCalledOnce();
    // And the world that replaced it can be shown: a move submitted after the
    // exchange must not be held open by the play the exchange threw away.
    const shown = vi.fn();
    q.submit({ next: g, events: [], settled: false });
    q.onIdle(shown);
    vi.advanceTimersByTime(1); // afterPlayAnimation's own macrotask
    expect(shown).toHaveBeenCalledOnce();
    expect(q.busy()).toBe(false);
  });

  it("releases a run that ended while a play was still queued", () => {
    // A run that ended must not leave the caller waiting on a card that will
    // now never be drawn.
    const { hud } = hosted();
    let g = ready();
    show(hud, g, 0);
    const before = g.log.length;
    g = playCard(g, 0, seededRng(1));
    show(hud, g, before);
    const fn = vi.fn();
    hud.afterPlayAnimation(fn);

    hud.update({ ...g, phase: "defeat" });
    expect(fn).toHaveBeenCalledOnce();
  });
});
