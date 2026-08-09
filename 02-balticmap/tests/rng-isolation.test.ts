import { describe, it, expect } from "vitest";
import {
  advance, chooseBuild, newGame, pickFaction, startGame, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import {
  SIM_ADJACENCY, SIM_DEFENSE_MAX, SIM_ETHNICITIES, SIM_FACTION_IDS,
  SIM_SITE_CAPS, naiveHumanTurn, seededRng,
} from "../src/sim";
import { BASELINE_FACTION } from "./baseline-config";

/** A short seeded run on the shipped map. Everything that consumes the one
 *  rng stream - the strategy roll per AI seat, every shuffle, every
 *  auto-resolved harvest - runs through here. */
function playTo(seed: number, turnCap: number): GameState {
  const rng = seededRng(seed);
  let state = pickFaction(
    chooseBuild(
      startGame(newGame(
        SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, SIM_SITE_CAPS,
        SIM_DEFENSE_MAX,
      )),
      "warpath",
      // The same stream `pickFaction` goes on to draw from, which is what
      // makes the terrain roll part of the run's contract rather than a
      // side channel of its own.
      rng,
    ),
    BASELINE_FACTION,
    rng,
  );
  while (state.phase === "playing" && state.turn <= turnCap) {
    const next =
      state.current === 0 ? naiveHumanTurn(state, rng) : aiTakeTurn(state, rng);
    if (!next.playedThisTurn) throw new Error(`stuck turn ${state.turn}`);
    state = next.phase === "playing" ? advance(next, rng) : next;
  }
  return state;
}

describe("rng isolation", () => {
  // What this test can and cannot do. It runs the SAME code twice, so an
  // added or reordered draw shifts both runs identically and the suite stays
  // green: it catches nondeterminism - a Date.now, a Math.random, a Set
  // iteration order - and nothing else. Keeping the draws where they are is a
  // structural discipline, stated at `applyPending` in src/game.ts, not
  // something a replay can enforce.
  //
  // The order they happen in, for the reader rather than for the assertion:
  // `chooseBuild` rolls the ground first, one draw per eligible land plus a
  // second only where that one passed, because the faction picker it opens
  // has to say what a land is before the player picks one; then `pickFaction`
  // draws once to split the acting rivals between the two builds and shuffles
  // each seat's deck; the quiet set is a rule rather than a roll; ruler naming
  // is a pure hash and must never cost a draw; a harvest draws exactly once,
  // and only where the choice was `random`.
  it("the same seed replays the identical game, log for log", () => {
    for (const seed of [1, 7]) {
      const a = playTo(seed, 40);
      const b = playTo(seed, 40);
      expect(b.log, `seed ${seed}`).toEqual(a.log);
      expect(b.defense, `seed ${seed}`).toEqual(a.defense);
      expect(b.disease, `seed ${seed}`).toEqual(a.disease);
      expect(b.overlords, `seed ${seed}`).toEqual(a.overlords);
      expect(b.rulers, `seed ${seed}`).toEqual(a.rulers);
      expect(
        b.players.map((p) => ({ deck: p.deck, hand: p.hand, discard: p.discard })),
        `seed ${seed}`,
      ).toEqual(
        a.players.map((p) => ({ deck: p.deck, hand: p.hand, discard: p.discard })),
      );
      // Sanity: the run actually played out rather than ending on turn 1.
      expect(a.log.filter((e) => e.type === "play").length).toBeGreaterThan(10);
    }
  });
});
