/** When the local player may start each of the things they can start.
 *
 *  Its own module, and pure, for one reason: this table is read by the
 *  handlers in `src/main.ts` AND by the controls in `src/hud.ts`, and a rule
 *  those two can disagree about is the rule that produced a hand which
 *  rendered live, hovered, lifted, and silently swallowed every click. Left in
 *  `src/main.ts` it would be untestable - nothing loads that module - and
 *  "both sides read the same table" would be a claim rather than a check.
 */
import { turnOpen, type GameState } from "./game";

/** Everything the local player can START. Exhaustive, so a new one does not
 *  compile until somebody says when it is allowed. */
export type PlayerAction =
  | "play" | "end-turn" | "surrender" | "keep-playing" | "map";

/** What the table cannot work out for itself: the screen's own state.
 *
 *  Handed in rather than read, which is the whole point of the split. Both of
 *  these live in `src/main.ts` as module state, and neither is derivable from
 *  `GameState` - so a surface that consults them privately can refuse an
 *  action whose control it has already drawn as live. Putting them in the
 *  argument list is what stops that being possible. */
export interface ScreenFacts {
  /** A transition is showing a move, an animation is running, the wire owes an
   *  answer, or the other human holds the turn. */
  busy: boolean;
  /** The harvest offer is up and owns the input. */
  harvestOpen: boolean;
  /** A conquest of the local seat's is waiting for its defenders. */
  transferOwed: boolean;
  /** The run is between duels and THIS screen is the one that answers which
   *  fight comes next. False on a guest, whose answer would have nowhere to
   *  go - see the `pick-duel` route. */
  pickOwed: boolean;
  /** The seat on turn is the one this screen plays. */
  localTurn: boolean;
}

/** Why `action` cannot be started, or null if it can.
 *
 *  An exhaustive switch with no `default`, the `NOTICE_RULES` shape.
 *
 *  Two actions are deliberately NOT blocked by an owed conquest, and that is
 *  the reason this is a table rather than one boolean. Folding every reason
 *  into a single predicate made Keep playing dead in precisely the case it
 *  exists for - a victory read at a turn start is usually a victory won BY a
 *  conquest, so its defender question is owed exactly when the button matters
 *  - and took away Surrender, which is the way OUT of a stuck run. A gate that
 *  removes the controls for escaping it is not a gate, it is a trap. */
export function actionBlock(
  action: PlayerAction, state: GameState, facts: ScreenFacts,
): string | null {
  if (facts.busy) return "the round is still resolving";
  // The pick joins the two questions already here rather than being spelled
  // beside them at a call site: a hand that renders live and swallows the
  // click is what a term the renderer cannot read produces, every time.
  const owed = facts.harvestOpen || facts.transferOwed || facts.pickOwed
    ? "answer the question on screen first"
    : null;
  switch (action) {
    case "play":
      if (!facts.localTurn) return "it is not your turn";
      if (!turnOpen(state)) return "your turn is spent";
      return owed;
    case "end-turn":
      return facts.localTurn ? owed : "it is not your turn";
    case "map":
      return owed;
    case "surrender":
      // A harvest offer owns the input while it is up; an owed conquest must
      // not also take the control that ends the run.
      if (state.phase !== "playing") return "the run has ended";
      return facts.harvestOpen ? "answer the harvest offer first" : null;
    case "keep-playing":
      // This decision is what hands the board back AND puts the owed conquest
      // question on screen - the `ask` stage stood down on it while the run
      // was over. Blocking on that question would be blocking the only thing
      // that can resolve it.
      return state.phase !== "victory" ? "the run is not won" : null;
  }
}

/** What `shouldReask` needs to know. Deliberately NOT `ScreenFacts`: this asks
 *  about the overlay actually on screen and about the wire, neither of which
 *  the action table cares about. */
export interface ReaskFacts {
  /** Any question is already on screen - they share one overlay. */
  overlayOpen: boolean;
  /** A guest's answer is out on the wire and the replica still carries the
   *  question it answered. */
  awaitingWire: boolean;
  /** A conquest of the local seat's is waiting, and this screen has not given
   *  up on it. */
  transferOwed: boolean;
  /** The run is between duels and this screen answers the pick -
   *  `ScreenFacts.pickOwed`, the same fact, computed once by the caller so the
   *  lock and the modal cannot disagree about whether a pick is owed. */
  pickOwed: boolean;
}

/** Whether an owed question should be put back on screen now.
 *
 *  The one reconciliation in the app, and the reason it exists is that every
 *  other route to the conquest modal is a one-shot - the `ask` stage of a
 *  transition, and the boot tail - and neither runs again on its own. So any
 *  way of losing an answer left the question owed and unaskable, and because a
 *  seat owing one can neither play a card nor end its turn, no later `ask`
 *  stage ever ran to notice. A state nobody can act on has to be able to fix
 *  itself.
 *
 *  Called when both queues have gone idle: if a question is owed at THAT
 *  moment with nothing asking it, something already went wrong. */
export function shouldReask(state: GameState, facts: ReaskFacts): boolean {
  if (state.phase !== "playing") return false;
  // Already being put to the player, or already answered and in flight to the
  // host - the second is the case a guest's replica cannot tell apart from
  // unanswered, since the host has popped its queue and this screen has not
  // seen the update yet.
  if (facts.overlayOpen || facts.awaitingWire) return false;
  return facts.transferOwed;
}

/** Whether the duel picker should be on screen now.
 *
 *  Not folded into `shouldReask`, because it is not a reconciliation: the pick
 *  has no one-shot route to lose. `picking` is a STATE the engine holds until
 *  somebody answers, so "should it be up" is simply read off the board every
 *  time the screen settles, and asking twice is impossible - the second ask
 *  finds the overlay already open.
 *
 *  It queues BEHIND the conquest question deliberately. That one is about the
 *  board the player was just shown and holds a transition stage open until it
 *  is answered; this one is about the round after next. Two modals share one
 *  overlay, so the order is the whole of which is seen first. */
export function shouldAskPick(state: GameState, facts: ReaskFacts): boolean {
  if (state.phase !== "playing") return false;
  if (facts.overlayOpen || facts.awaitingWire) return false;
  if (facts.transferOwed) return false;
  return facts.pickOwed;
}
