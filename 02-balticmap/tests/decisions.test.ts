/** The router's own rules, driven directly rather than through a screen.
 *
 *  `tests/two-seat.test.ts` covers the two transports; this covers what
 *  `commitDecision` does with an answer BEFORE either of them - which seat it
 *  is answering for, and what it hands back when the rules will not take it.
 *  Both were only ever exercised through `src/main.ts`, which no test loads.
 */
import { describe, it, expect } from "vitest";
import {
  chooseBuild, newGame, pickFaction, startGame, type GameState,
} from "../src/game";
import { commitDecision, type DecisionDeps } from "../src/decisions";
import { seededRng } from "../src/rng";
import type { NetAction } from "../src/net-protocol";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function freshGame(): GameState {
  const rng = seededRng(3);
  let g = startGame(newGame(FACTIONS));
  g = chooseBuild(g, "warpath", seededRng(1));
  return pickFaction(g, "alpha", rng);
}

/** A solo screen's deps, with the two sinks recorded so a test can see
 *  whether the decision reached the world at all. */
function soloDeps(state: GameState) {
  const applied: GameState[] = [];
  const sent: NetAction[] = [];
  const deps: DecisionDeps = {
    role: "solo",
    localSeat: 0,
    state,
    rng: seededRng(7),
    send: (a) => void sent.push(a),
    apply: (next) => void applied.push(next),
    pushUpdate: () => {},
  };
  return { deps, applied, sent };
}

describe("commitDecision - the conquest transfer", () => {
  it("answers the LOCAL seat's conquest even when another seat holds the turn", () => {
    // The bug this exists for: the answer used to be applied against
    // `state.current` while the modal had been raised for the local seat. On
    // every ordinary path they are the same seat, so the mismatch only shows
    // up once the board has moved under an open question - and then the pop
    // names a faction with no queue, the state comes back untouched, and
    // `commitDecision` reports "refused" for a perfectly good answer. The
    // question is then owed for ever with nothing on screen saying so.
    const base = freshGame();
    const state: GameState = {
      ...base,
      current: 1,
      defenseMax: { alpha: 40, beta: 40 },
      defense: { alpha: 40, beta: 0 },
      pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    };
    const { deps, applied } = soloDeps(state);
    const result = commitDecision(deps, { kind: "transfer", amount: 10 });
    expect(result).toEqual({ outcome: "applied", settle: "repaint" });
    expect(applied).toHaveLength(1);
    expect(applied[0].pendingTransfers).toEqual({});
    expect(applied[0].defense.alpha).toBe(30);
    expect(applied[0].defense.beta).toBe(10);
  });

  it("leaves the queue intact and NAMES the reason when nothing is owed", () => {
    // A caller cannot re-raise a question it was not told it still owes.
    // `askTransfer` reads this result to decide whether to clear its latch, so
    // the generic "the rules refused that move" is not enough: the whole
    // failure was a refusal nobody could tell apart from success.
    const state = freshGame();
    const { deps, applied } = soloDeps(state);
    const result = commitDecision(deps, { kind: "transfer", amount: 3 });
    expect(result.outcome).toBe("refused");
    expect(result).toMatchObject({ reason: expect.stringMatching(/conquest/) });
    expect(applied).toHaveLength(0);
    expect(state.pendingTransfers).toEqual({});
  });

  it("still refuses an amount that is not a number of defenders", () => {
    const base = freshGame();
    const state: GameState = {
      ...base,
      pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    };
    const { deps, applied } = soloDeps(state);
    const result = commitDecision(deps, { kind: "transfer", amount: -1 });
    expect(result.outcome).toBe("refused");
    expect(result).toMatchObject({ reason: expect.stringMatching(/number/) });
    expect(applied).toHaveLength(0);
  });
});
