/** Who answers for a seat, and the loop that plays the ones nobody does.
 *
 *  Not a `net-` module on purpose: the questions here have the same answers
 *  in a solo game, where every seat but one is an AI and there is no wire at
 *  all. `src/net-protocol.ts` owns what crosses between two machines; this
 *  owns what a screen does with the seats in front of it, and it is pure so
 *  a test can drive it without a DOM.
 */
import { aiTakeTurn } from "./ai";
import type { Rng } from "./cards";
import { advance, type GameState } from "./game";

/** The seats a screen can tell apart. `remoteSeat` is the other human's, and
 *  it is null in a solo game and on a guest - a guest runs no seat but its
 *  own, so the host's seat is not a thing it is ever waiting on locally. */
export interface Seats {
  localSeat: number;
  remoteSeat: number | null;
}

export type Controller = "local" | "remote" | "ai";

/** Who decides this seat's turn. The one reader of "is this mine", so a
 *  surface asking whether to lock input, to run the AI chain or to draw a
 *  waiting line all get the same answer from one place. */
export function controllerOf(seat: number, seats: Seats): Controller {
  if (seat === seats.localSeat) return "local";
  if (seats.remoteSeat !== null && seat === seats.remoteSeat) return "remote";
  return "ai";
}

/** A stalled chain is a hung game, and a hung game says nothing about why.
 *  The bound is far above any real turn order - it exists so a rule that
 *  stopped advancing shows up in the console instead of freezing the tab. */
const MAX_AI_TURNS = 1000;

/** Plays every seat nobody is sitting at, until a human is on turn or the
 *  run ends. Handed the state rather than reading one, so the screen's
 *  animation and status work stays in `src/main.ts` and the turn-order half
 *  is testable on its own. */
export function runAiSeats(
  state: GameState, rng: Rng, seats: Seats,
): GameState {
  let out = state;
  let turns = 0;
  while (out.phase === "playing" && controllerOf(out.current, seats) === "ai") {
    if (++turns > MAX_AI_TURNS) {
      console.error("AI chain stalled - breaking");
      break;
    }
    out = advance(aiTakeTurn(out, rng), rng);
  }
  return out;
}
