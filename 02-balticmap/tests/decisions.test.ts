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
    const result = commitDecision(deps, { kind: "transfer", from: "alpha", to: "beta", amount: 10 });
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
    const result = commitDecision(deps, { kind: "transfer", from: "alpha", to: "beta", amount: 3 });
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
    const result = commitDecision(deps, { kind: "transfer", from: "alpha", to: "beta", amount: -1 });
    expect(result.outcome).toBe("refused");
    expect(result).toMatchObject({ reason: expect.stringMatching(/number/) });
    expect(applied).toHaveLength(0);
  });
});

describe("commitDecision - the duel pick", () => {
  /** The offer a fresh deal opens on. `pickFaction` reaches the first round
   *  wrap, which is what fills it. */
  const offerOf = (g: GameState): string[] =>
    g.gauntlet.kind === "picking" ? g.gauntlet.candidates : [];

  it("opens a duel against a land the offer holds", () => {
    const state = freshGame();
    const enemy = offerOf(state)[0];
    expect(enemy).toBeDefined();
    const { deps, applied, sent } = soloDeps(state);
    const result = commitDecision(deps, { kind: "pick-duel", enemyId: enemy });
    expect(result).toEqual({ outcome: "applied", settle: "action" });
    expect(applied[0].gauntlet).toMatchObject({ kind: "duel", enemy });
    // Host-only: nothing crosses the wire, and the sentence saying why is the
    // route's own.
    expect(sent).toHaveLength(0);
  });

  it("takes declining as an answer, on the same kind", () => {
    // One kind, one question. Split in two, a screen could route the answer
    // the player reaches for when the whole offer is worth ignoring
    // differently from the one that picks a fight.
    const { deps, applied } = soloDeps(freshGame());
    const result = commitDecision(deps, { kind: "pick-duel", enemyId: null });
    expect(result).toEqual({ outcome: "applied", settle: "action" });
    // `turn + 2`: a decline is answered mid-round, so a tick ending at the
    // next wrap would be over before an unscoped round had run.
    expect(applied[0].gauntlet)
      .toEqual({ kind: "world-tick", until: applied[0].turn + 2 });
  });

  it("refuses a land the offer does not hold", () => {
    // The engine returns its input, which is what `commitDecision` reads as
    // refused - so a stale modal cannot scope the turn loop to a faction
    // nobody may fight.
    const { deps, applied } = soloDeps(freshGame());
    const result = commitDecision(deps, { kind: "pick-duel", enemyId: "alpha" });
    expect(result.outcome).toBe("refused");
    expect(applied).toHaveLength(0);
  });

  it("is refused outright on a guest, which is never shown it", () => {
    const state = freshGame();
    const enemy = offerOf(state)[0];
    const { deps, applied, sent } = soloDeps(state);
    const result = commitDecision(
      { ...deps, role: "guest" }, { kind: "pick-duel", enemyId: enemy },
    );
    expect(result.outcome).toBe("refused");
    expect(result).toMatchObject({ reason: expect.stringMatching(/gauntlet/) });
    expect(applied).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
