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
  aimsWithinOwnRealm, borderPolygonsOf, type RulesView,
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
   *  one.
   *
   *  `until` is the turn the tick is over BY, the same shape a duel's is, and
   *  it is what makes "one round" mean one round from wherever the tick was
   *  entered. It was left out on the reasoning that a tick is entered at a
   *  round wrap and left at the next, so the distance between two visits to
   *  the same line IS one round. That is true of a duel retiring - the wrap
   *  is where it happens - and false of a DECLINE, which is answered
   *  mid-round, on the player's own turn, just after the wrap that would end
   *  the tick. The offer therefore came back at the player's very next turn:
   *  eleven straight turns of the same four tiles were watched, the price a
   *  decline is supposed to cost was never paid, and the modal read as a nag.
   *
   *  A plain number, so nothing in `src/net-codec.ts` changes. */
  | { kind: "world-tick"; until: number }
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
 *  `borderPolygonsOf` and `aimsWithinOwnRealm` are the game's spelling of
 *  "who may I attack" and this is not a fourth one - the targeting pass, the
 *  march aim, the disease surfaces and this all ask the same two questions,
 *  so a candidate the picker offers is a land the player's cards can actually
 *  be aimed at.
 *
 *  Two things it does on top, and both are about the duel rather than about
 *  legality. A polygon is resolved to the faction that POLITICALLY holds it
 *  (`incorporated[p] ?? p`), the same resolution `reachOf` and card targeting
 *  make, because an annexed land never acts and a duel with one would be a
 *  duel with nobody. And the actor's own realm is dropped: a border polygon
 *  can be a land the realm annexed at one remove, and a duel against a land
 *  already inside your own outline would scope the turn loop to one realm and
 *  freeze the map.
 *
 *  Returned in map order (`factionIds`) rather than in reach order, so the
 *  offer reads the same way twice and a replay of the same seed lists the
 *  same lands in the same order.
 *
 *  **A land with a CHIEF is preferred, and the preference is a filter rather
 *  than a sort.** A duel is the fight the run is built around, and one against
 *  a land that never answers is twenty rounds of the map standing still.
 *
 *  The filter can only prefer what the border holds, which is why it is not
 *  the whole answer and never was: with five acting seats on a twenty-six land
 *  map every neighbour was quiet, and 41.6% of duels were chiefless with this
 *  filter working exactly as written. The lever was the seeding - see
 *  `QUIET_LANDS` in src/game.ts - and it is 0.0% now.
 *
 *  It does NOT refuse a chiefless candidate outright: the border is what it
 *  is, and a realm hemmed in entirely by quiet lands must still be offered a
 *  fight rather than an empty modal. Rare, not gone: 2 of 9195 duels over 468
 *  sweep runs. What makes that offer worth taking is
 *  the other half of the same rule - a duel enemy acts chief or no chief
 *  (`duelStanding`), and beating a chiefless one absorbs it outright
 *  (`absorbsDuelEnemy`). */
export function duelCandidates(view: RulesView, human: string): string[] {
  const realm = fullRealmOf(human, view.overlords, view.incorporated);
  const offered = new Set<string>();
  for (const polygon of borderPolygonsOf(view, human)) {
    // "raid" and not a card the player is holding: this asks whether the land
    // is somebody the realm may fight at all, which is a fact about the
    // hostile keyword and the map, not about a hand.
    if (aimsWithinOwnRealm(view, human, "raid", polygon)) continue;
    offered.add(view.incorporated[polygon] ?? polygon);
  }
  const all = view.factionIds.filter(
    (id) => offered.has(id) && !realm.has(id),
  );
  const led = all.filter((id) => view.leaders[id] === true);
  return led.length > 0 ? led : all;
}

/** Which side of a RUNNING duel this faction stands on, or null when no duel
 *  is running and when nobody is playing this board at all (`human === null`,
 *  a world simulation).
 *
 *  One walk of the two realms and three answers, because the turn loop asks
 *  two questions about a duel and they are the same question read twice: a
 *  faction on NEITHER side is stilled for the duel's length, and a faction on
 *  the ENEMY side acts whether or not anybody leads it. Two predicates would
 *  be two walks that could disagree about which realm a land is in.
 *
 *  Both sides are `fullRealmOf` and not `realmOf`, per the realm-sizes rule:
 *  taking a lord takes its whole pyramid, so a grand-vassal is as much a part
 *  of the fight as the lord that answers for it. A duel scoped to one fealty
 *  link would leave half of each side standing still while its lord fought.
 *
 *  The human's own side wins the tie. A land inside both realms is not a
 *  shape the rules produce, and reading it as the player's own is the answer
 *  that keeps the player's seat playing. */
export function duelStanding(
  g: Gauntlet,
  human: string | null,
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): "mine" | "theirs" | "outside" | null {
  if (g.kind !== "duel" || human === null) return null;
  if (fullRealmOf(human, overlords, incorporated).has(factionId)) return "mine";
  if (fullRealmOf(g.enemy, overlords, incorporated).has(factionId)) {
    return "theirs";
  }
  return "outside";
}

/** Whether the duel scope leaves this faction out - it stands in neither
 *  realm, so it takes no turn until the duel ends.
 *
 *  False whenever no duel is running, and false when nobody is playing this
 *  board at all (`human === null`, a world simulation): a scope with no side
 *  to be on would freeze every seat, and `advance` throws when it runs out of
 *  seats rather than spinning. `duelStanding` above answers both of those
 *  with `null`, which is why this is one comparison. */
export function outsideTheDuel(
  g: Gauntlet,
  human: string | null,
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  return duelStanding(g, human, factionId, overlords, incorporated) ===
    "outside";
}

/** Whether beating this land ABSORBS it - annexed outright - rather than
 *  making it a vassal that may one day leave.
 *
 *  The whole remaining difference between a duel enemy with a chief and one
 *  without. A people who follow somebody swear to their conqueror; a people
 *  who follow nobody are simply taken. It is also what stops "a chiefless
 *  enemy is RARE" (`duelCandidates`) from reading as "a chiefless enemy is
 *  WORSE": the prize for fighting a quiet land is a permanent one.
 *
 *  Narrow on purpose, and the asymmetry it leaves is not an accident. A
 *  leaderless land taken outside a duel still gets a chief seated on it and
 *  becomes a vassal - that is what wakes the map, since every quiet land is
 *  leaderless and universal absorption would mean a conquest never wakes
 *  anybody. Only the land the duel was declared against is absorbed, and only
 *  by the side that declared it.
 *
 *  `leaderless` is passed in rather than read here: this module knows about
 *  the cycle and the two realms, and `GameState.rulers` is the turn loop's. */
export function absorbsDuelEnemy(
  g: Gauntlet,
  human: string | null,
  land: string,
  taker: string,
  leaderless: boolean,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  if (g.kind !== "duel" || human === null) return false;
  if (land !== g.enemy || !leaderless) return false;
  return fullRealmOf(human, overlords, incorporated).has(taker);
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
 *    `duelDecidedBy`). The tick is over by the NEXT wrap - `view.turn + 1` -
 *    which is one whole unscoped round, this one, and is the behaviour this
 *    arm always had, now written down rather than implied.
 *  - `world-tick` -> `picking`, once the tick's own `until` has come. Asked
 *    the same way a duel's is, because a tick entered from `declineDuel`
 *    starts mid-round and one entered here starts at a wrap, and "one round"
 *    has to mean the same thing to both.
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
    return view.turn >= g.until
      ? { kind: "world-tick", until: view.turn + 1 }
      : g;
  }
  if (g.kind === "world-tick" && view.turn < g.until) return g;
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

/** How a duel that is retiring at this wrap ended.
 *
 *  Three answers and not two, because the difference between them is the whole
 *  of what the player is owed at the end of a fight: a land came off the enemy
 *  (`won`), a land went the other way (`lost`), or twenty rounds passed and
 *  neither happened (`lapsed`). A single "it is over" would be the silence
 *  this exists to end, one sentence later. */
export type DuelOutcome = "won" | "lost" | "lapsed";

/** How the duel now ending turned out - a land off the enemy's realm, a land
 *  lost to it, or the clock simply running out.
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
 *  A win outranks a loss in the one turn that could carry both lines, because
 *  the reward is owed for a land taken and nothing is owed for one lost. The
 *  scope is small - both would have to land on the same turn - and the arm
 *  that pays is the one the offer promised.
 *
 *  `log` must include the events of the batch being written, not just
 *  `state.log`: a conquest at the human's own turn start is decided and swept
 *  in the same `beginTurn`, so the deciding line has not been appended yet. */
export function duelOutcome(
  g: Gauntlet,
  human: string | null,
  log: readonly GameEvent[],
  overlords: Overlords,
  incorporated: Incorporated,
): DuelOutcome {
  if (g.kind !== "duel" || human === null) return "lapsed";
  const mine = fullRealmOf(human, overlords, incorporated);
  const theirs = fullRealmOf(g.enemy, overlords, incorporated);
  let lost = false;
  for (const e of log) {
    // Both allegiance lines, because a duel can be won either way round: a
    // chiefless enemy is ABSORBED rather than sworn (`absorbsDuelEnemy`) and
    // says so with an `incorporated` line. Reading only `subjugated` would
    // have made every won duel against a quiet land read as a lapsed one -
    // no spoils, and the offer's promise silently broken. The Incorporate
    // card writes the same line and cannot be mistaken for this: it aims at
    // the actor's own vassal, so both ends sit on one side and neither arm
    // below fires.
    if (e.type !== "subjugated" && e.type !== "incorporated") continue;
    if (e.turn !== g.until) continue;
    const taker = e.overlordFactionId;
    const land = e.targetFactionId;
    if (taker === undefined || land === undefined) continue;
    // The side the land LEFT, which is what makes this a cross-realm move
    // rather than housekeeping inside one realm.
    const from = e.formerOverlordFactionId ?? land;
    if (mine.has(taker) && theirs.has(from)) return "won";
    // Mirrored, and the sets are read the same way round: a home land taken
    // off the human leaves the human a vassal of the enemy, so `theirs` holds
    // the taker while `mine` still holds the human's own root.
    if (theirs.has(taker) && mine.has(from)) lost = true;
  }
  return lost ? "lost" : "lapsed";
}
