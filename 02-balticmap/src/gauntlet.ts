/** The run's shape: pick a bordering target, duel it while the rest of the
 *  world stands still, then let the whole world take one turn, then pick
 *  again.
 *
 *  This module owns the CYCLE and nothing else. Who acts is still one
 *  question, `takesNoTurn` in src/game.ts, which asks `outsideTheDuel` here;
 *  what a candidate is worth, and the modal that offers it, are the screen's.
 */

import {
  aimsWithinOwnRealm, attackReach, type RulesView,
} from "./playability";
import { fullRealmOf, type Incorporated, type Overlords } from "./relations";

/** How many rounds a duel may run before it ends itself.
 *
 *  The backstop and not the common case: a duel ends the moment a land moves
 *  between the two realms, and that is what usually ends one. The cap exists
 *  so a duel nobody can win still ends - the pre-refactor game stalled at a
 *  median of 110 turns, and a scope with no clock on it would put that back
 *  one duel at a time. */
export const DUEL_TURNS = 20;

/** Where the run is in the gauntlet cycle. One field rather than three
 *  booleans, because the three states are exclusive and a reader that has to
 *  combine flags is a reader that will combine them wrongly.
 *
 *  Plain values only. It rides on `GameState` and therefore crosses the wire,
 *  and `src/net-codec.ts` is what proves that rather than this sentence. */
export type Gauntlet =
  /** The player's realm and `enemy`'s realm act; nobody else does.
   *
   *  `until` is the turn this duel is over BY, and it is the WHOLE of the
   *  ending. A land changing hands between the two realms pulls it in to the
   *  turn that happened on (`duelDecidedBy`), so the clock running out and a
   *  land being taken are ONE comparison at the round wrap. The alternative
   *  is a second field saying "decided", and the two would eventually
   *  disagree about which round a duel ended in. Which of the two endings it
   *  was, when somebody needs to know, is in the log - the reward is owed for
   *  a land taken from the enemy, and only the log says whether one was. */
  | { kind: "duel"; enemy: string; until: number }
  /** Exactly one unscoped round: every seat that would ever take a turn takes
   *  one. Carries no turn number because it does not need one - it is entered
   *  at a round wrap and left at the next, so "one round" is the distance
   *  between two visits to the same line. */
  | { kind: "world-tick" }
  /** A pick is owed. `candidates` is an OFFER: the border is not a to-do
   *  list, and some neighbours are meant to be ignorable.
   *
   *  Nothing in the ENGINE blocks on this. An unanswered pick leaves the
   *  world unscoped, exactly as it was before the gauntlet existed, because a
   *  reducer that refuses to advance until a question is answered is a
   *  reducer that hangs every caller with nobody to ask - the sim, a
   *  `?turns=` boot, a test. Holding the SCREEN while the question stands is
   *  `inputLocked`'s job, and it already does that for the harvest boon and
   *  the conquest's defenders. */
  | { kind: "picking"; candidates: string[] };

/** The factions the human may open a duel against: a bordering realm it may
 *  legally attack.
 *
 *  `attackReach` and `aimsWithinOwnRealm` are the game's spelling of "who may
 *  I attack" and this is not a fourth one - the targeting pass, the march
 *  aim, the disease surfaces and this all ask the same two questions, so a
 *  candidate the picker offers is a land the player's cards can actually be
 *  aimed at.
 *
 *  Two things it does on top, and both are about the duel rather than about
 *  legality. A polygon is resolved to the faction that POLITICALLY holds it
 *  (`incorporated[p] ?? p`), the same resolution `reachOf` and card targeting
 *  make, because an annexed land never acts and a duel with one would be a
 *  duel with nobody. And the actor's own realm is dropped: `attackReach`
 *  deliberately includes a lord's own vassals so vassalage can be kept, but a
 *  duel against a land already inside your own outline would scope the turn
 *  loop to one realm and freeze the map.
 *
 *  Returned in map order (`factionIds`) rather than in reach order, so the
 *  offer reads the same way twice and a replay of the same seed lists the
 *  same lands in the same order. */
export function duelCandidates(view: RulesView, human: string): string[] {
  const realm = fullRealmOf(human, view.overlords, view.incorporated);
  const offered = new Set<string>();
  for (const polygon of attackReach(view, human)) {
    // "raid" and not a card the player is holding: this asks whether the land
    // is somebody the realm may fight at all, which is a fact about the
    // hostile keyword and the map, not about a hand.
    if (aimsWithinOwnRealm(view, human, "raid", polygon)) continue;
    offered.add(view.incorporated[polygon] ?? polygon);
  }
  return view.factionIds.filter((id) => offered.has(id) && !realm.has(id));
}

/** Whether the duel scope leaves this faction out - it stands in neither
 *  realm, so it takes no turn until the duel ends.
 *
 *  False whenever no duel is running, and false when nobody is playing this
 *  board at all (`human === null`, a world simulation): a scope with no side
 *  to be on would freeze every seat, and `advance` throws when it runs out of
 *  seats rather than spinning.
 *
 *  Both sides are `fullRealmOf` and not `realmOf`, per the realm-sizes rule:
 *  taking a lord takes its whole pyramid, so a grand-vassal is as much a part
 *  of the fight as the lord that answers for it. A duel scoped to one fealty
 *  link would leave half of each side standing still while its lord fought. */
export function outsideTheDuel(
  g: Gauntlet,
  human: string | null,
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  if (g.kind !== "duel" || human === null) return false;
  if (fullRealmOf(human, overlords, incorporated).has(factionId)) return false;
  return !fullRealmOf(g.enemy, overlords, incorporated).has(factionId);
}

/** A land has just changed hands: the duel ends if it moved BETWEEN the two
 *  realms, in either direction.
 *
 *  Asked at the moment the allegiance moves, and never afterwards, because
 *  that is the only moment the question has a straight answer. Read back off
 *  the board a round later, "the enemy took my home" and "I took the enemy's
 *  home" both look like one realm standing inside the other, and a log walk
 *  would have to reconstruct who was on which side before each line. Here,
 *  `overlords` and `incorporated` are still the ones the land moved out of.
 *
 *  Either direction, and that is the point rather than a nicety. A duel that
 *  ended only on the player's own conquest would trap a losing player inside
 *  the scope that is beating them, for as many rounds as the clock has left.
 *
 *  A land taken from somebody OUTSIDE both realms does not end the duel -
 *  neither side gave anything up, so the fight the player picked is still
 *  running.
 *
 *  It ends the duel by pulling `until` in rather than by ending it here: the
 *  cycle turns at the round wrap and nowhere else, so a conquest mid-round
 *  leaves the round it happened in intact. */
export function duelDecidedBy(
  g: Gauntlet,
  human: string | null,
  land: string,
  taker: string,
  overlords: Overlords,
  incorporated: Incorporated,
  turn: number,
): Gauntlet {
  if (g.kind !== "duel" || human === null) return g;
  const mine = fullRealmOf(human, overlords, incorporated);
  const theirs = fullRealmOf(g.enemy, overlords, incorporated);
  const side = (f: string): "mine" | "theirs" | null =>
    mine.has(f) ? "mine" : theirs.has(f) ? "theirs" : null;
  const from = side(land);
  const to = side(taker);
  if (from === null || to === null || from === to) return g;
  return { ...g, until: Math.min(g.until, turn) };
}

/** The cycle, turned once. Called at the round wrap and nowhere else, so
 *  every transition happens between rounds and a round is never half scoped.
 *
 *  - `duel` -> `world-tick` once `until` has come, which is both endings:
 *    the clock, and a land having moved between the two realms (see
 *    `duelDecidedBy`).
 *  - `world-tick` -> `picking`, after the one unscoped round that ran between
 *    this visit and the last.
 *  - `picking` -> `picking`, with the candidates re-read off the board. It
 *    does NOT wait: the answer arrives through `pickDuel`, mid-round, from
 *    the screen. Re-reading matters because the offer is stale otherwise - a
 *    world tick can move the border under a list computed a round ago.
 *
 *  There is no `picking` -> `duel` arm here, and that asymmetry is
 *  deliberate: a person decides that one, and a wrap that could decide it for
 *  them would be the engine answering its own question. */
export function gauntletAtRoundWrap(
  g: Gauntlet, view: RulesView, human: string | null,
): Gauntlet {
  if (g.kind === "duel") {
    return view.turn >= g.until ? { kind: "world-tick" } : g;
  }
  const candidates = human === null ? [] : duelCandidates(view, human);
  if (g.kind === "picking" && sameList(g.candidates, candidates)) return g;
  return { kind: "picking", candidates };
}

/** Identity is worth keeping on a state that crosses the wire: a fresh
 *  `picking` every round is a replica diff every round, saying nothing. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
