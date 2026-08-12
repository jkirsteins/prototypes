/** The lobby and turn-order transitions `main.ts` still makes locally.
 *
 *  `src/decisions.ts` is the one door for everything the LOCAL PLAYER decides
 *  in play - a card, a discard, a turn handed over. This is its sibling for
 *  the moves that are not decisions at all: nobody sends `advance` or
 *  `pickFaction` over the wire, they are the screen carrying its own state
 *  forward or through the lobby. The root `biome.json` bans `main.ts` from
 *  importing `playCard`, `discardCard`, `endTurn`, `transferDefense` and
 *  `surrender` from `./game` so a decision cannot skip `commitDecision`; the
 *  same rule bans `advance`, `startGame`, `chooseBuild`, `chooseRules`,
 *  `pickFaction` and `applyBootParams`, because a call to any of them
 *  appends events to a `GameState` without presenting it - the same hole,
 *  one door shut here instead.
 *
 *  Each export is shaped so `main.ts` can hand it straight to `apply`
 *  (`(g: GameState) => GameState`), currying whatever else the move needs
 *  ahead of the state it is applied to. `bootGame` is the one exception: the
 *  boot path runs before the transition queue exists, at module scope, and
 *  its result is folded into the queue's initial state rather than submitted
 *  as a move - see the comment on `initialGame` in `main.ts`. */
import {
  advance, chooseBuild, chooseRules, pickFaction, startGame,
  type GameState,
} from "./game";
import type { Rng, Strategy } from "./cards";
import { applyBootParams, type BootParams } from "./boot-params";
import type { RuleSelections } from "./rules";

/** Runs the fast-forward, then folds every store override on top - the whole
 *  of what a `?seed=...` URL does before the queue exists to present it. */
export function bootGame(
  state: GameState, params: BootParams, rng: Rng,
): GameState {
  return applyBootParams(state, params, rng);
}

/** Main menu to the deck screen. Takes no extra argument, so it is already
 *  the shape `apply` wants and also the shape a fresh game is put through
 *  before its first transition, at `startStagingRun`. */
export function startGameMove(state: GameState): GameState {
  return startGame(state);
}

/** The build screen's pick, on top of whatever rules were chosen alongside
 *  it. The two calls are always made together - a build without its ruleset
 *  is a screen the player never sees - so this is the one place they are
 *  composed, rather than at each call site that stages a build. */
export function chooseBuildMove(
  rules: RuleSelections, build: Strategy, rng: Rng,
): (state: GameState) => GameState {
  return (state) => chooseBuild(chooseRules(state, rules), build, rng);
}

/** The land clicked on the faction-pick screen. */
export function pickFactionMove(
  factionId: string, rng: Rng,
): (state: GameState) => GameState {
  return (state) => pickFaction(state, factionId, rng);
}

/** The turn-order step run after every human action and after every guest's
 *  action lands on the host - see `afterHumanAction` and `onGuestAction`. */
export function advanceMove(rng: Rng): (state: GameState) => GameState {
  return (state) => advance(state, rng);
}
