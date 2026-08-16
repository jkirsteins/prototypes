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

/** How many acts a run has. Three, and each closes with a boss: an elevated
 *  neighbour, a stronger one, and then a power that does not stand on the map
 *  at all. */
export const ACTS = 3;

/** How much of the map an act's realm must hold before the act's boss is
 *  summoned.
 *
 *  Thirds of the BAR rather than literals, so the boundaries cannot rot when
 *  the map changes: the 26-land Baltic map gives 5 / 9 / 13 and Iberia's 24
 *  gives 4 / 8 / 12. One expression rather than three constants, because three
 *  would be three places for the last act's exit to stop meaning "the bar".
 *
 *  The bar is passed IN and never read here, per the one-bar rule in
 *  AGENTS.md: `winSizeFor` is the only thing allowed to answer what a faction
 *  is playing for, and a second reader of `victoryRealmSize` is a second bar
 *  that disagrees the moment somebody plays on.
 *
 *  Two clamps, and both are about small maps rather than about taste. The LAST
 *  act's exit is the bar exactly, never a third of it rounded anywhere, so the
 *  run's final fight and the run's own bar cannot drift apart. And an earlier
 *  act's exit is at least `act + 1`, because a run opens holding one land: at
 *  a three-land bar the plain third is 1, which summons act 1's boss before
 *  the player has taken anything and skips the act it was supposed to close.
 *  The six-land fixture in tests/gauntlet.test.ts is exactly that map, which
 *  is how this was found rather than shipped. */
export function actExitSize(act: number, bar: number): number {
  if (act >= ACTS) return bar;
  return Math.min(bar, Math.max(act + 1, Math.ceil((bar * act) / ACTS)));
}

/** What a rest before a boss may hand the player. Three, one of each currency
 *  the run already pays in - so the rest is a bigger version of a reward the
 *  player has been reading all game rather than a fourth vocabulary.
 *
 *  Plain string ids: they ride on `GameState` inside the `rest` arm and cross
 *  the wire, and `src/net-codec.ts` is what proves that. */
export type Boon = "mend" | "growth" | "card";

/** Every land of the realm back to its ceiling. The strongest of the three and
 *  deliberately so: it is the one that answers "the boss is about to hit me",
 *  and a rest that could not undo a bad act would be a rest in name. */
export const BOON_MEND = "mend";

/** What the growth boon adds to the home land's ceiling. Three, against a won
 *  duel's one: a rest happens at most twice a run before the last boss, and a
 *  boon worth the same as an ordinary duel would not read as a reward for
 *  clearing an act. */
export const BOON_GROWTH_AMOUNT = 3;

/** One line saying what a boon does, in the rest modal and nowhere else.
 *
 *  Plain text and not `Segment[]` - it names no card and no faction. The card
 *  boon is the one that WOULD name one, which is why its line says "from your
 *  build" rather than the card's name: the modal renders that name as a
 *  segment beside this sentence, off the id the offer carries. */
export function boonLine(boon: Boon): string {
  switch (boon) {
    case "mend":
      return "Every land of your realm is restored to its ceiling.";
    case "growth":
      return `Your home land grows by ${BOON_GROWTH_AMOUNT} - ceiling and defense alike.`;
    case "card":
      return "One more card from your build, shuffled into your deck.";
  }
}

/** The name a boon goes by on the rest modal. A table rather than a sentence
 *  inside the renderer, the `PASSIVES` shape: the id is what crosses the wire
 *  and the title is what the player reads, and one of them may be renamed
 *  without touching the other. */
export const BOON_TITLES: Record<Boon, string> = {
  mend: "Mend the realm",
  growth: "Grow your seat",
  card: "One more card",
};

/** Which boons a rest may offer.
 *
 *  Two are always on the table: mending and growing are about the board, and
 *  the board always exists. The card boon is offered only when the player's
 *  own build still has something to give - `buildOffer` in src/harvest.ts,
 *  asked by the caller and handed in as a boolean rather than imported here,
 *  because this module knows about the cycle and a seat's piles are the
 *  harvest's.
 *
 *  An offer of two is a real offer and not a degraded one, which is why there
 *  is no filler third: a rest that padded itself with something worthless
 *  would teach the player to stop reading it. */
export function boonsFor(canTakeCard: boolean): Boon[] {
  return canTakeCard ? ["mend", "growth", "card"] : ["mend", "growth"];
}

/** Where the run is in the gauntlet cycle. One field rather than four
 *  booleans, because the states are exclusive and a reader that has to combine
 *  flags is a reader that will combine them wrongly.
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
   *  `staked` is the land the player put up when they answered the offer.
   *  ALWAYS a land, including on the one-land realm a run opens with: it was
   *  nullable first, on the reasoning that a realm holding only its home has
   *  nothing to bet that is not the run itself, and that was wrong twice over.
   *  Losing your home is VASSALAGE and not defeat - the existing ladder, with
   *  the independence gate as the way back - so the bet was never the run. And
   *  a duel with nothing staked can only be won, so the first duel of every
   *  run had one ending: measured on a real 44-turn run, the opening duel was
   *  still running at the end, no duel had ever settled, and the whole cycle
   *  had stalled while the land count won the game anyway.
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
      staked: string;
      decided: DuelOutcome | null;
      /** Whether this is the fight that closes the act. A boss duel pays the
       *  act forward when it is won, and losing one ends the run - see
       *  `endingFor` in src/game.ts. A flag rather than "the enemy equals the
       *  act's boss", because the boss is chosen once when the act's exit is
       *  reached and the border can move under it afterwards. */
      boss: boolean;
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
  | {
      kind: "picking";
      candidates: string[];
      /** Whether `candidates` is the act's boss rather than the border.
       *
       *  A boss offer is FROZEN: the wrap re-reads an ordinary offer every
       *  round, because a world tick can move the border under a list computed
       *  a round ago, and re-reading a boss offer would quietly swap the enemy
       *  the prophecy named. It also has no decline - the act does not close
       *  until the boss is fought, and a modal offering a way past it would be
       *  a way past the act. */
      boss: boolean;
    }
  /** The breath before a boss. A boon is owed and the act's `boss` is already
   *  chosen and elevated, so the prophecy that named it and the fight that
   *  follows cannot disagree about who it is.
   *
   *  Like `picking`, nothing in the ENGINE blocks on this: an unanswered rest
   *  leaves the world unscoped exactly as an unanswered pick does, because a
   *  reducer that refuses to advance until a question is answered hangs every
   *  caller with nobody to ask. Holding the SCREEN is `inputLocked`'s job. */
  | { kind: "rest"; boss: string; boons: Boon[] };

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
  if (land === g.staked && theirs.has(taker)) return { ...g, decided: "lost" };
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
 *  - A BOSS offer is held rather than re-read, and a `rest` is held outright.
 *    Both are questions already put to the player about a fight already named,
 *    and a wrap that recomputed either would swap the enemy the prophecy
 *    promised while the modal quoting it was still on screen.
 *
 *  There is no `picking` -> `duel` arm here, and that asymmetry is
 *  deliberate: a person decides that one, and a wrap that could decide it for
 *  them would be the engine answering its own question. The same goes for
 *  `rest` -> `picking`, which `pickBoon` answers.
 *
 *  Summoning the act's boss is NOT here either, and for a third version of the
 *  same reason: it reads the realm against the bar, which is `winSizeFor`'s
 *  question about a board this module is deliberately not given. `beginTurn`
 *  asks it, one line after this returns. */
export function gauntletAtRoundWrap(
  g: Gauntlet, view: RulesView, human: string | null,
): Gauntlet {
  if (g.kind === "duel") {
    const over =
      g.decided !== null ||
      duelVoided(g, human, view.overlords, view.incorporated);
    return over ? { kind: "world-tick", until: view.turn + 1 } : g;
  }
  if (g.kind === "rest") return g;
  if (g.kind === "world-tick" && view.turn < g.until) return g;
  if (g.kind === "picking" && g.boss) return g;
  const candidates = human === null ? [] : duelCandidates(view, human);
  if (g.kind === "picking" && sameList(g.candidates, candidates)) return g;
  return { kind: "picking", candidates, boss: false };
}

/** The neighbour an act closes with, or null when the border offers nobody.
 *
 *  Four preferences, in order.
 *
 *  **`prefer` outranks everything**, and it is how the last act gets the fight
 *  it is for: a power summoned from beyond the frame is appended to the roster
 *  and would otherwise lose map order to every led neighbour on the border. It
 *  is a preference and not an override, so a power the realm cannot yet reach
 *  - no landing held - is passed over and the act closes on a neighbour
 *  instead, which is a player fighting their way to the coast rather than an
 *  act that cannot end.
 *
 *  **A champion still standing keeps the job.** A boss duel that was lost or
 *  voided leaves the enemy elevated, and the act is summoned again at the next
 *  wrap - so without this the retry would raise a SECOND champion and leave
 *  the first one carrying a boss's ceiling for the rest of the run. The act's
 *  fight is meant to be the same fight until somebody wins it, and the
 *  escalation is `elevateBoss` running again on the same land rather than the
 *  map filling up with half-fought bosses.
 *
 *  Then the first CHIEFED candidate in map order, falling back to the first of
 *  any: `duelCandidates` already prefers a chief as a filter, so that part is
 *  the same preference read once more rather than a second rule about who is
 *  worth fighting. Deterministic throughout, so a seeded replay names the same
 *  boss.
 *
 *  Null is a real answer and not a failure. A realm that borders nothing it may
 *  fight cannot be handed a boss, so the act simply does not close yet - the
 *  same shape an empty offer already has, and the ordinary picker keeps
 *  running until the border gives it somebody. */
export function bossFor(
  view: RulesView, human: string, prefer: string | null = null,
): string | null {
  const candidates = duelCandidates(view, human);
  if (prefer !== null && candidates.includes(prefer)) return prefer;
  const standing = candidates.find(
    (id) => hasPassive(view.passives, id, "regional-leader"),
  );
  const led = candidates.find((id) => view.leaders[id] === true);
  return standing ?? led ?? candidates[0] ?? null;
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

/** What an act's champion adds to its own ceiling, per act. Two, three and
 *  six over a run: enough that the third boss is a different kind of problem
 *  from the first, and not so much that a realm which has been winning cannot
 *  crack it.
 *
 *  Ceiling and not current defense, because the heal that comes with it takes
 *  the land to the ceiling anyway - and a ceiling is what the player can READ
 *  off the badge before committing to the fight. */
export const BOSS_CEILING_PER_ACT = 2;

/** Extra raids shuffled into an act champion's deck, per act. One, two, three:
 *  a boss that only defends is a boss the player can starve out, and the
 *  cheapest way to make it answer is to give it more of what its own build
 *  already does. No new cards, so no `POLICY_COVERAGE` branch and no discovery
 *  route are owed - the AI already has a branch for a raid. */
export const BOSS_RAIDS_PER_ACT = 1;

/** The leadership an act's champion's chief is given, per act.
 *
 *  It is what makes `war-leader` mean anything: the ability adds the leader's
 *  LEADERSHIP to every raid they send, and a chief seated at 0 with the
 *  ability holds a rule that does nothing. Granting one without the other was
 *  the first version, and the boss raided for exactly as much as its
 *  neighbours did. */
export const BOSS_LEADERSHIP_PER_ACT = 1;

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
  view: Pick<RulesView, "siteCaps" | "passives">, land: string, act = 1,
): DuelReward {
  // The act SCALES what a win is worth, and the same number scales what a boss
  // brings to the fight (`BOSS_CEILING_PER_ACT`). A ramp that only tightened
  // would be a run that gets steadily worse to be in; the two together are
  // what make a later duel a bigger fight rather than a slower one.
  const scale = Math.max(1, act);
  if ((view.siteCaps[land] ?? 0) >= BIG_LAND_SITES) {
    return { kind: "growth", amount: LAND_GROWTH * scale };
  }
  if (DEFENSIVE_TERRAIN.some((id) => hasPassive(view.passives, land, id))) {
    return { kind: "defense", amount: DUEL_DEFENSE_REWARD * scale };
  }
  return { kind: "wealth", amount: DUEL_WEALTH_REWARD * scale };
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

