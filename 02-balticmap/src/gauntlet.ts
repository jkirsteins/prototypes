/** The run's shape: pick a bordering target, duel it while the rest of the
 *  world stands still, then let the whole world take one turn, then pick
 *  again.
 *
 *  This module owns the CYCLE and nothing else. Who acts is still one
 *  question, `takesNoTurn` in src/game.ts, which asks `outsideTheDuel` here;
 *  what a candidate is worth, and the modal that offers it, are the screen's.
 */

import { LAND_GROWTH } from "./defense";
import type { GameEvent } from "./game";
import { DEFENSIVE_TERRAIN, hasPassive } from "./passives";
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

/** How many further settlement sites a land has to author before beating it
 *  is worth GROWTH rather than anything else.
 *
 *  Four picks out four lands of twenty-six on the Baltic map and five of
 *  twenty-four on the Iberian, so the biggest prize is rare on both maps
 *  without either needing a threshold of its own. */
export const BIG_LAND_SITES = 4;

/** Defense carried home from beating a land whose ground did the defending.
 *  Two, so it is worth a little more than a Fortify and a great deal less
 *  than a duel spent healing. */
export const DUEL_DEFENSE_REWARD = 2;

/** Coins carried home from beating anybody else. Three buys three settlements
 *  at Found a settlement's price, which is the plainest thing a treasury is
 *  for. */
export const DUEL_WEALTH_REWARD = 3;

/** What beating a land pays. Derived from what the land IS, never rolled, so
 *  the map teaches its own logic: a big land is worth growing into, hill
 *  country teaches how hill country is held, and everywhere else pays coin.
 *
 *  `amount` rides on the reward rather than being looked up again by whoever
 *  cashes it - see `rewardFor`. */
export type DuelReward =
  | { kind: "growth"; amount: number }
  | { kind: "defense"; amount: number }
  | { kind: "wealth"; amount: number };

/** What beating `land` is worth - the ONE answer, read by the picker that
 *  promises it and by the wrap that pays it.
 *
 *  Two readers and one function, the `SINGLE_LAND_HEAL` rule: a preview that
 *  promises what the play will not do is the bug, and the only way two
 *  surfaces cannot promise different things is for there to be nothing for
 *  them to disagree about.
 *
 *  The order of the three arms is what makes them exclusive. Size first, so a
 *  big land in hill country is worth growing into rather than fortifying -
 *  the rarer prize wins the tie, and there is exactly one tie to lose. */
export function rewardFor(
  view: Pick<RulesView, "siteCaps" | "passives">, land: string,
): DuelReward {
  if ((view.siteCaps[land] ?? 0) >= BIG_LAND_SITES) {
    return { kind: "growth", amount: LAND_GROWTH };
  }
  if (DEFENSIVE_TERRAIN.some((id) => hasPassive(view.passives, land, id))) {
    return { kind: "defense", amount: DUEL_DEFENSE_REWARD };
  }
  return { kind: "wealth", amount: DUEL_WEALTH_REWARD };
}

/** One line saying what a reward does, in the picker and nowhere else.
 *
 *  Plain text and not `Segment[]`, which is not a hole in the naming rule: it
 *  names no card and no faction. Where the spoils LAND is "your home" rather
 *  than the land's name on purpose - the offer is read before the fight, and
 *  a realm can lose or gain its home while the duel runs. */
export function rewardLine(reward: DuelReward): string {
  switch (reward.kind) {
    case "growth":
      return `Your home land grows by ${reward.amount} - ceiling and defense alike.`;
    case "defense":
      return `Your home land is fortified by ${reward.amount} defense.`;
    case "wealth":
      return `${reward.amount} wealth for the treasury.`;
  }
}

/** Whether the duel now ending was WON - the human's realm took a land off
 *  the enemy's, rather than the clock running out or the enemy taking one.
 *
 *  Read off the LOG, because `until` cannot say: `duelDecidedBy` ends a duel
 *  by pulling `until` in to the turn the land moved, so a duel decided by a
 *  conquest and one decided by the clock arrive here in the same shape. That
 *  is the trade the single field buys, and this is the reader that pays for
 *  it.
 *
 *  It looks at ONE turn - `until` itself - and that is exact rather than
 *  approximate. A land moving between the two realms pulls `until` in to its
 *  own turn, so no cross-realm conquest can sit earlier in a duel that is
 *  still running; and a duel that ran its clock out ends at the wrap onto
 *  `until`, before any of that round is played. Either way the deciding line,
 *  if there is one, carries that turn number.
 *
 *  The direction is read off the two realms AS THEY NOW STAND, which survives
 *  the conquest that ended the duel. The taker is still in the realm it took
 *  for; the land it took is no longer in the realm it came from, so the side
 *  it LEFT is read off `formerOverlordFactionId` - or off the land itself,
 *  since a land nobody held is its own root and `fullRealmOf` includes it.
 *
 *  `log` must include the events of the batch being written, not just
 *  `state.log`: a conquest at the human's own turn start is decided and swept
 *  in the same `beginTurn`, so the deciding line has not been appended yet. */
export function duelWon(
  g: Gauntlet,
  human: string | null,
  log: readonly GameEvent[],
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  if (g.kind !== "duel" || human === null) return false;
  const mine = fullRealmOf(human, overlords, incorporated);
  const theirs = fullRealmOf(g.enemy, overlords, incorporated);
  for (const e of log) {
    if (e.type !== "subjugated" || e.turn !== g.until) continue;
    const taker = e.overlordFactionId;
    const land = e.targetFactionId;
    if (taker === undefined || land === undefined) continue;
    if (!mine.has(taker)) continue;
    if (theirs.has(e.formerOverlordFactionId ?? land)) return true;
  }
  return false;
}
