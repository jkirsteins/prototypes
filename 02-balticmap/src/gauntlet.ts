/** The run's shape: pick a bordering target, duel it while the rest of the
 *  world stands still, then let the whole world take one turn, then pick
 *  again.
 *
 *  This module owns the CYCLE and nothing else. Who acts is still one
 *  question, `takesNoTurn` in src/game.ts, which asks `outsideTheDuel` here;
 *  what a candidate is worth, and the modal that offers it, are the screen's.
 */

import { LAND_GROWTH } from "./defense";
import { DEFENSIVE_TERRAIN, hasPassive } from "./passives";
import {
  aimsWithinOwnRealm, attackReach, marchHopsTo, type RulesView,
} from "./playability";
import { fullRealmOf, type Incorporated, type Overlords } from "./relations";

/** Where the run is in the gauntlet cycle. One field rather than three
 *  booleans, because the three states are exclusive and a reader that has to
 *  combine flags is a reader that will combine them wrongly.
 *
 *  Plain values only. It rides on `GameState` and therefore crosses the wire,
 *  and `src/net-codec.ts` is what proves that rather than this sentence. */
export type Gauntlet =
  /** The player's realm and `enemy`'s realm act; nobody else does.
   *
   *  **A duel has no clock.** It is decided by ground changing hands and by
   *  nothing else: the enemy's own land coming to the player's realm, or the
   *  player's `staked` land going to the enemy's. There used to be a
   *  `DUEL_TURNS` backstop, and what replaced it is the stake - a duel is a
   *  race between two named polygons rather than an open war, so it converges
   *  on a fact about the board instead of on a number running out.
   *
   *  `staked` is the land the player put up when they answered the offer, and
   *  `null` for a realm that held exactly one land at the time - there is
   *  nothing to bet there that is not the run itself, and a rule that bets the
   *  run on turn 1 is a rule that ends runs on turn 1.
   *
   *  `decided` is written by `duelDecidedBy` at the moment the ground moves,
   *  and read at the round wrap. A field rather than a log walk because the
   *  moment of the move is the only moment the question has a straight answer:
   *  read back a round later, "the enemy took my stake" and "I took the
   *  enemy's home" both look like one realm standing inside the other. Null
   *  while the duel runs. */
  | {
      kind: "duel";
      enemy: string;
      staked: string | null;
      decided: DuelOutcome | null;
    }
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
  for (const polygon of attackReach(view, human)) {
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

/** A land has just changed hands: the duel is decided if that land was one of
 *  the two the fight is ABOUT, and it moved to the other side.
 *
 *  Exactly two polygons, which is the whole of the stake rule. The enemy's own
 *  land coming to the player's realm wins it; the player's staked land going
 *  to the enemy's realm loses it. Every other capture during a duel is an
 *  ordinary capture: a raid on the enemy's vassal, a third party's arrow
 *  landing at the wrap, a lord disciplining its own. They move the board and
 *  they do not end the fight, because the fight was declared over two named
 *  lands and a player who bet one of them is owed a duel that ends on it.
 *
 *  Asked at the moment the allegiance moves, and never afterwards, because
 *  that is the only moment the question has a straight answer. Read back off
 *  the board a round later, "the enemy took my stake" and "I took the enemy's
 *  home" both look like one realm standing inside the other, and a log walk
 *  would have to reconstruct who was on which side before each line. Here,
 *  `overlords` and `incorporated` are still the ones the land moved out of.
 *
 *  It records the outcome rather than ending the duel here: the cycle turns at
 *  the round wrap and nowhere else, so a conquest mid-round leaves the round
 *  it happened in intact.
 *
 *  A duel already decided is not re-decided. Both lands can move in one round
 *  - the enemy takes the stake at its turn start, the player's own arrow lands
 *  on the enemy at theirs - and the first answer stands, because that is the
 *  one the round the player watched actually produced. */
export function duelDecidedBy(
  g: Gauntlet,
  human: string | null,
  land: string,
  taker: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Gauntlet {
  if (g.kind !== "duel" || human === null || g.decided !== null) return g;
  const mine = fullRealmOf(human, overlords, incorporated);
  const theirs = fullRealmOf(g.enemy, overlords, incorporated);
  if (land === g.enemy && mine.has(taker)) return { ...g, decided: "won" };
  if (g.staked !== null && land === g.staked && theirs.has(taker)) {
    return { ...g, decided: "lost" };
  }
  return g;
}

/** Whether the fight has lost one of its two ends, so nothing can decide it
 *  any more.
 *
 *  Not a third way to lose and not a clock in disguise: it is the answer to
 *  "the thing this duel was about has stopped existing". Two shapes reach it,
 *  and with no clock behind them either would otherwise be a duel that runs
 *  for the rest of the run.
 *
 *  - The enemy is ANNEXED, by anybody. An absorbed people has no seat, takes
 *    no turn and can lose no land, so there is nobody left to beat. A vassal
 *    is deliberately not this case: an enemy that swore to somebody else still
 *    holds its own land and still acts, so that duel goes on.
 *  - The STAKE has left the player's realm without the enemy taking it - a
 *    third party's arrow landing at the wrap, a staked vassal winning its
 *    independence. The bet cannot be settled once what was wagered is gone.
 *
 *  A duel that is already decided is left alone: the ground moved, and what
 *  the board looks like afterwards does not get to relabel it. */
export function duelVoided(
  g: Gauntlet,
  human: string | null,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  if (g.kind !== "duel" || human === null || g.decided !== null) return false;
  if (incorporated[g.enemy] !== undefined) return true;
  if (g.staked === null) return false;
  return !fullRealmOf(human, overlords, incorporated).has(g.staked);
}

/** The lands the player may put up against `enemy`: members of their own realm
 *  that stand within marching distance of it.
 *
 *  `marchHopsTo` and not a fourth spelling of distance - the aim, the source
 *  list and this all ask how far an army walks, and a stake the player's own
 *  arrows cannot reach would be a bet on a fight happening somewhere else.
 *  `fullRealmOf` and not the lands held outright, per the realm-sizes rule: a
 *  lord marches out of its vassals' lands, so a vassal's border land is as
 *  much a front as the lord's own. Staking one is a real risk on top of the
 *  ordinary one - a vassal that wins its independence takes the wager off the
 *  table (`duelVoided`) - and that is a decision rather than a trap, because
 *  the player can read the gate on the same map.
 *
 *  Returned in map order, so the offer reads the same way twice and a replay
 *  of one seed lists the same lands in the same order. */
export function duelStakes(
  view: RulesView, human: string, enemy: string,
): string[] {
  const realm = fullRealmOf(human, view.overlords, view.incorporated);
  return view.factionIds.filter(
    (land) => realm.has(land) && marchHopsTo(view, land, enemy) !== null,
  );
}

/** The cycle, turned once. Called at the round wrap and nowhere else, so
 *  every transition happens between rounds and a round is never half scoped.
 *
 *  - `duel` -> `world-tick` once the fight is settled: ground has moved
 *    between the two named lands (`duelDecidedBy`), or the fight has lost one
 *    of its ends (`duelVoided`). There is no clock - see the `duel` arm. The
 *    tick is over by the NEXT wrap - `view.turn + 1` - which is one whole
 *    unscoped round, this one, and is the behaviour this arm always had.
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
    const over =
      g.decided !== null ||
      duelVoided(g, human, view.overlords, view.incorporated);
    return over ? { kind: "world-tick", until: view.turn + 1 } : g;
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

/** How a duel ended.
 *
 *  Three answers and not two, because the difference between them is the whole
 *  of what the player is owed at the end of a fight: the enemy's ground came
 *  home (`won`), the staked land went the other way (`lost`), or the fight
 *  lost one of its two ends before either happened (`void`). A single "it is
 *  over" would be the silence this exists to end, one sentence later.
 *
 *  `void` is the rare one and is never the player's doing - see `duelVoided`. */
export type DuelOutcome = "won" | "lost" | "void";

