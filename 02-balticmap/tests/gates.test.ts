/** The one table that says when the local player may act.
 *
 *  Untestable while it lived in `src/main.ts`, which is why it now does not:
 *  "the handlers and the controls read the same rule" was a claim nobody could
 *  check, and the rule drifted until a fully live hand swallowed every click.
 */
import { describe, it, expect } from "vitest";
import {
  actionBlock, shouldAskPick, shouldReask,
  type PlayerAction, type ReaskFacts, type ScreenFacts,
} from "../src/gates";
import {
  chooseBuild, chooseRules, newGame, pickFaction, startGame, type GameState,
} from "../src/game";
import { seededRng } from "../src/rng";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function playing(): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseRules(g, { turn: "unlimited", hand: "keep" });
  g = chooseBuild(g, "warpath", seededRng(1));
  return pickFaction(g, "alpha", seededRng(3));
}

const CLEAR: ScreenFacts = {
  busy: false, harvestOpen: false, transferOwed: false, pickOwed: false,
  localTurn: true,
};

const ACTIONS: PlayerAction[] =
  ["play", "end-turn", "surrender", "keep-playing", "map"];

describe("actionBlock", () => {
  it("lets an ordinary turn do everything but withdraw a victory", () => {
    const g = playing();
    expect(actionBlock("play", g, CLEAR)).toBeNull();
    expect(actionBlock("end-turn", g, CLEAR)).toBeNull();
    expect(actionBlock("map", g, CLEAR)).toBeNull();
    expect(actionBlock("surrender", g, CLEAR)).toBeNull();
    // No victory to keep playing past.
    expect(actionBlock("keep-playing", g, CLEAR)).toMatch(/not won/);
  });

  it("blocks everything while the screen is busy", () => {
    const g = playing();
    for (const a of ACTIONS) {
      expect(actionBlock(a, g, { ...CLEAR, busy: true })).toMatch(/resolving/);
    }
  });

  it("an owed conquest stops play but NOT the two ways out", () => {
    // The regression this exists for. Folded into one predicate, an owed
    // conquest took Surrender and Keep playing with it - and a victory won BY
    // a conquest always owes one, so the button that hands the board back was
    // dead in exactly the case it exists for. A gate that removes the controls
    // for escaping it is a trap, not a gate.
    const g = playing();
    const owed = { ...CLEAR, transferOwed: true };
    expect(actionBlock("play", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("end-turn", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("map", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("surrender", g, owed)).toBeNull();

    const won: GameState = { ...g, phase: "victory" };
    expect(actionBlock("keep-playing", won, owed)).toBeNull();
  });

  it("a harvest offer owns the input, conceding included", () => {
    // Unlike the conquest question this one is cancellable, so there is a way
    // out of it that is not the Surrender button.
    const g = playing();
    const open = { ...CLEAR, harvestOpen: true };
    expect(actionBlock("play", g, open)).toMatch(/question on screen/);
    expect(actionBlock("surrender", g, open)).toMatch(/harvest/);
  });

  it("refuses in-play actions off turn, and never mixes that up with busy", () => {
    const g = playing();
    const away = { ...CLEAR, localTurn: false };
    expect(actionBlock("play", g, away)).toMatch(/not your turn/);
    expect(actionBlock("end-turn", g, away)).toMatch(/not your turn/);
    // The map is still readable on somebody else's turn - pinning a land to
    // filter the log is not an action on the board.
    expect(actionBlock("map", g, away)).toBeNull();
  });

  it("gives every action an answer, so a new one cannot be forgotten", () => {
    const g = playing();
    for (const a of ACTIONS) {
      // Either a reason or null, never undefined: an exhaustive switch with no
      // `default` is what makes a missing arm a compile error, and this is the
      // runtime half of the same promise.
      expect(actionBlock(a, g, CLEAR)).not.toBeUndefined();
    }
  });
});

describe("shouldReask", () => {
  const IDLE: ReaskFacts = {
    overlayOpen: false, awaitingWire: false, transferOwed: true,
    pickOwed: false,
  };

  it("puts an owed conquest back on screen when nothing is asking it", () => {
    // The safety net. Every other route to the modal runs once - a
    // transition's `ask` stage, and the boot tail - so an answer lost any way
    // at all left the question owed AND unaskable, and a seat owing one can
    // neither play a card nor end its turn, so no later `ask` ran to notice.
    expect(shouldReask(playing(), IDLE)).toBe(true);
  });

  it("stays quiet when nothing is owed", () => {
    expect(shouldReask(playing(), { ...IDLE, transferOwed: false })).toBe(false);
  });

  it("does not raise a second copy over the one already up", () => {
    expect(shouldReask(playing(), { ...IDLE, overlayOpen: true })).toBe(false);
  });

  it("does not re-ask a guest's question while its answer is on the wire", () => {
    // The replica still carries the conquest: the host has popped its queue
    // and this screen has not seen the update yet. Asking again here is how a
    // second answer went into a conquest the player was never shown.
    expect(shouldReask(playing(), { ...IDLE, awaitingWire: true })).toBe(false);
  });

  it("asks nothing once the run is over", () => {
    // There is no board left to move defenders on, and the postmortem is what
    // the player should be looking at. `keep-playing` is what brings the
    // question back.
    const won: GameState = { ...playing(), phase: "victory" };
    expect(shouldReask(won, IDLE)).toBe(false);
  });
});

describe("an owed duel pick", () => {
  const owed: ScreenFacts = { ...CLEAR, pickOwed: true };

  it("stops the turn, and leaves the two ways out alone", () => {
    // In the gate rather than beside it, the rule the docked-hand regression
    // wrote down: a term the renderer cannot read is a card that draws live
    // and swallows the click. Surrender stays open for the same reason it
    // survives a conquest - a gate that removes the way out is a trap.
    const g = playing();
    expect(actionBlock("play", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("end-turn", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("map", g, owed)).toMatch(/question on screen/);
    expect(actionBlock("surrender", g, owed)).toBeNull();
  });
});

describe("shouldAskPick", () => {
  const IDLE: ReaskFacts = {
    overlayOpen: false, awaitingWire: false, transferOwed: false,
    pickOwed: true,
  };

  it("puts the offer on screen when the board is between duels", () => {
    expect(shouldAskPick(playing(), IDLE)).toBe(true);
  });

  it("stands down for a conquest, which shares the overlay and comes first", () => {
    // That question is about the board just shown and holds a transition
    // stage open; this one is about the round after next. Two modals, one
    // overlay, so the order is the whole of which is seen.
    expect(shouldAskPick(playing(), { ...IDLE, transferOwed: true })).toBe(false);
  });

  it("raises nothing over a modal already up, or across a wire", () => {
    expect(shouldAskPick(playing(), { ...IDLE, overlayOpen: true })).toBe(false);
    expect(shouldAskPick(playing(), { ...IDLE, awaitingWire: true })).toBe(false);
  });

  it("asks nobody who does not answer it", () => {
    // `pickOwed` folds in `decidedHere`: the run holds one gauntlet, so a
    // second person is never shown a question whose answer has nowhere to go.
    expect(shouldAskPick(playing(), { ...IDLE, pickOwed: false })).toBe(false);
  });

  it("asks nothing once the run is over", () => {
    const won: GameState = { ...playing(), phase: "victory" };
    expect(shouldAskPick(won, IDLE)).toBe(false);
  });
});
