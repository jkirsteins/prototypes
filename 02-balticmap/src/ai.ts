import { CARDS, isTributeCard, type Rng } from "./cards";
import { fullRealmOf, realmOf } from "./relations";
import {
  capturesOnArrival, defenseMaxOf, defenseOf,
  MIN_RAID_SPEND, PLAGUE_DAMAGE_PER_STACK, SUBJUGATION_GATE,
  WAR_COUNCIL_LEADERSHIP,
} from "./defense";
import {
  attackDamageFor, attackImpactOn, borderPolygonsOf,
  foulWindsTargetsOf, greatRaidMarches, holdsGuard, marchHopsTo,
  marchSourcesAgainst, plagueMultiplier, plagueTargetsOf, playableSet,
  spendCeilingOn, validTargetsFor, type RulesView,
} from "./playability";
import { axesOf } from "./marches";
import { damageAfterTerrain, hasPassive } from "./passives";
import {
  discardCard, endTurn, playCard, repeatOnlyOf, turnOpen, viewOf,
  type GameState,
} from "./game";

export type AiAction =
  /** `sourceId` is Raid's tail - the land the army marches out of. Omitted by
   *  every other card, and by a Raid whose branch has no opinion, in which
   *  case `playCard` takes the first legal source in faction order.
   *
   *  `spend` is how much of that land's defense the raid tears out, which is
   *  the arrow's whole strength. Omitted the same way and clamped the same
   *  way - `playCard` reads a missing one as the minimum. */
  | {
      type: "play"; cardIndex: number; targetId?: string; sourceId?: string;
      spend?: number;
    }
  | { type: "discard"; cardIndex: number };

/** Which branch of `chooseAction` decides each card. Keyed on every id in
 *  CARDS, not only the deck-buildable ones: tribute is injection-only yet
 *  reaches hands and has a real branch, so keying on `deckBuildable` would
 *  leave the most forced card in the game unguarded.
 *
 *  A card with no branch here fails a test rather than passing review. That
 *  is deliberate: falling through to the first playable card is not AI
 *  support - see the card rule in AGENTS.md and the 27.7% fallthrough
 *  measurement that put it there. */
export const POLICY_COVERAGE: Record<string, string> = {
  "pay-military-tribute": "1: forced tribute",
  "subjugate":
    "2B: subjugate any faction whose gate is open, quiet lands included - a " +
    "land that takes no turns is a faction in reach like any other; the pick " +
    "among open gates is the biggest full realm, ties by faction order. The " +
    "card is withdrawn from every pool, so the branch stands unreached",
  "incorporate": "3: incorporate the best permanent gain net of freed vassals",
  "assassinate-ruler":
    "4: kill the ruler of a land carrying No successor in reach, which takes " +
    "it outright; else the highest leadership in reach, bodyguard risk unknown",
  "hillfort": "5: repair the realm's worst polygon while it sits under half",
  "harvest-feast": "5: repair the realm, the realm-wide arm",
  "fortify":
    "5: repair the realm - the weaker of the two single-land heals, taken " +
    "when no Hillfort is in hand. Repeats: step 5 walks the damaged lands " +
    "worst-first, so once a land's settlements are called on the re-opened " +
    "turn aims the next fortify at the next land down",
  "strong-raid":
    "2A/5A/6W/11W: the same branches Raid uses - `marchPick` covers both, and " +
    "the AI reaches for whichever of the two is in hand",
  "strong-fortify":
    "5: repair the realm - preferred over Fortify where both are held, " +
    "since it is the same play for one settlement and one more point. " +
    "Repeats with Fortify: same keyword, so either may follow either",
  "raid":
    "2A: take a land in reach this raid overwhelms - one it deals more to " +
    "than it has standing, its defenses gone included - the biggest realm " +
    "first, discounted by how many turns the army walks (`travelFactor`); " +
    "5A: counter a march that would break one of our lands, or that we out-" +
    "muscle; 6W: finish an opening a single raid can open; " +
    "11W: build toward the nearest gate, near counted in TURNS as well as " +
    "points - `gateCandidates` divides the gap by the same discount. Source: " +
    "the land the counter must leave from, else the one whose own defenses " +
    "best survive being counter-raided back, and that pick is what decides " +
    "how far the arrow walks and so how far the target is discounted",
  "great-raid":
    "6W: aim it where the arrows it musters flatten the land outright, which " +
    "takes it where they carry one point more than it holds; 11W: " +
    "pressure the neighbourhood that musters most, 2 arrows or more. Target: " +
    "greatRaidPick, the bordering land its own neighbours can hit hardest. " +
    "No travel discount, and it needs none: the fan is bordering lands by " +
    "construction, so every arrow of it lands next turn",
  "prosperous-proliferation":
    "8R: raise the ceiling of the realm's biggest land whenever held - it is " +
    "always in the harvest offer, so a seat that never picked it up is a seat " +
    "that chose otherwise",
  "favourable-omens": "6W: read the omens when the doubled attack opens a gate",
  "war-council": "11W: build leadership while no gate is within 2 attacks",
  "plague": "6P: cash stacks when a gate opens or the damage beats a raid",
  "foul-winds": "6P: claim the board's stacks while rivals hold more than us",
  "miasma": "6P: double the stacks when the doubled plague opens a gate",
  "localized-outbreak": "6P: seed the junction with the most non-own neighbours",
  "spread-disease":
    "11P: stack the polygon nearest its gate",
  "bodyguard": "7: post the guard while own leadership is the board's highest",
  "found-settlement": "8: settle a spare turn (income)",
  "turnip-harvest": "9: cash the harvest whenever held (auto-picks by build)",
  "grow-crops": "10: grow turnips whenever held (feeds the harvest loop)",
};

/** The march card this hand would rather send, and its id: the strong one
 *  where both are held, since it is the same play for one more point. One
 *  lookup for every branch that sends an army, so a new march card is a line
 *  in `MARCH_CARDS` rather than a hunt through this file. */
function marchPick(
  idxOf: (id: string) => number | undefined,
): { index: number; id: string } | undefined {
  for (const id of ["strong-raid", "raid"]) {
    const index = idxOf(id);
    if (index !== undefined) return { index, id };
  }
  return undefined;
}

/** What a blow keeps of its worth for every turn past the first that its army
 *  spends walking.
 *
 *  An army takes a turn for every land it crosses, so the same card at the
 *  same land is worth two different things depending on how far back it sets
 *  out from: the board moves while the arrow is in the air, the target heals,
 *  and the land the army left stands soft the whole time. A policy with no
 *  notion of when a blow lands trades a target it can hit tomorrow for one it
 *  can hit in three turns at no discount, which on the map reads as armies
 *  thrown into the distance.
 *
 *  ONE dial, deliberately, so the playtest and the balance suite have one
 *  number to argue about rather than a term per branch. It is a guess with a
 *  shape behind it and not a measured number: at three hops - the furthest an
 *  army may go - a blow keeps about a third of its worth, which is enough that
 *  a nearer target has to be genuinely worse to lose. */
export const TRAVEL_DISCOUNT = 0.6;

/** How much of a value survives the walk. Multiplied into a WORTH and divided
 *  into a COST - "worth less" and "further off" are the same statement twice,
 *  and both branches that score a raid target read one of the two. */
function travelFactor(hops: number): number {
  return TRAVEL_DISCOUNT ** Math.max(0, hops - 1);
}

/** Turns before a blow at this polygon would land: the walk of the arrow the
 *  policy would ACTUALLY declare, `marchSourceFor`'s tail included.
 *
 *  The chosen tail and not the nearest one, unlike `bestAttackOn` one field
 *  over. That function answers "is this play available at all", where the best
 *  case is the honest reading; this one answers "and when does it land", which
 *  is a fact about the arrow that gets drawn. Every land in
 *  `borderPolygonsOf` borders the realm somewhere, so a nearest-source reading
 *  would be 1 almost
 *  everywhere and the discount would be decoration.
 *
 *  Infinity where no land can send the army - it sorts last either way round,
 *  which is what a target nothing can reach deserves. */
function turnsToLand(
  state: GameState, v: RulesView, actor: string, target: string,
): number {
  const from = marchSourceFor(state, v, actor, target);
  if (from === undefined) return Number.POSITIVE_INFINITY;
  return marchHopsTo(v, from, target) ?? Number.POSITIVE_INFINITY;
}

/** The subjugation-gate line of a polygon, and how far above it the score
 *  sits. Positive gap = closed by that much. */
function gateGap(v: RulesView, polygon: string): number {
  return (
    defenseOf(v, polygon) -
    Math.floor(SUBJUGATION_GATE * defenseMaxOf(v, polygon))
  );
}

/** Outward gate-hunting candidates: polygons in reach that are rival faction
 *  HOMES with their gate still CLOSED - not the actor's own realm, not
 *  annexed lands (no gate to open), and not a gate already standing open.
 *  The last filter is load-bearing: an open gate's gap is negative, so
 *  without it the "finishing hit" condition matched every already-broken
 *  polygon forever, every raid read as decisive, and a 150-turn all-warpath
 *  world starved its turnip loop to 13 plays and zero subjugations. A land
 *  standing open wants an army walked into it, which is step 2A, not more
 *  damage. Sorted nearest-gate-first, ties by faction order.
 *
 *  "Nearest gate" counts the WALK as well as the points: a gap of 4 three
 *  turns away is further off than a gap of 6 next door, because the arrow
 *  crossing those lands gives the target two extra turns to heal and leaves
 *  its own source soft for both. `travelFactor` is the one dial. */
function gateCandidates(
  state: GameState, v: RulesView, actor: string, targets: string[],
): string[] {
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  const cost = (t: string): number =>
    gateGap(v, t) / travelFactor(turnsToLand(state, v, actor, t));
  return targets
    .filter(
      (t) => !realm.has(t) && !(t in v.incorporated) && gateGap(v, t) > 0,
    )
    .sort(
      (a, b) =>
        cost(a) - cost(b) ||
        state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
    );
}

/** Damage already in the air at a polygon, net of what the polygon's own side
 *  has aimed back down the same axis. What `gateGap` arithmetic has to net out
 *  now that an attack is visible a turn before it lands: a heal that ignores
 *  an incoming march heals a land that is about to be broken anyway. */
function incomingAt(v: RulesView, polygon: string): number {
  let net = 0;
  for (const axis of axesOf(v.marches)) {
    if (axis.a !== polygon && axis.b !== polygon) continue;
    const [at, back] = axis.a === polygon
      ? [axis.fromB, axis.fromA]
      : [axis.fromA, axis.fromB];
    net += Math.max(
      0,
      at.reduce((s, m) => s + m.damage, 0) -
        back.reduce((s, m) => s + m.damage, 0),
    );
  }
  return net;
}

/** Which land to march a Raid out of, given where it is aimed.
 *
 *  The tail is now a real decision: whatever land the army leaves from is the
 *  land a counter-raid comes back at, so the pick is the source that best
 *  survives being answered. Highest defense first - a land near its own
 *  subjugation gate is the worst place to expose - ties by faction order so a
 *  seeded run marches out of the same land every time. */
function marchSourceFor(
  state: GameState, v: RulesView, actor: string, target: string,
): string | undefined {
  return [...marchSourcesAgainst(v, actor, target)].sort(
    (a, b) =>
      defenseOf(v, b) - defenseOf(v, a) ||
      state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
  )[0];
}

/** A raid play with its tail chosen. Every raid the policy returns goes
 *  through here, so no branch can forget the source and quietly fall back on
 *  `playCard`'s first-legal default. */
function raidAt(
  state: GameState, v: RulesView, actor: string,
  cardIndex: number, cardId: string, target: string,
): AiAction {
  const sourceId = marchSourceFor(state, v, actor, target);
  return {
    type: "play", cardIndex, targetId: target,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(sourceId === undefined
      ? {}
      : { spend: raidSpendFor(v, actor, cardId, sourceId, target) }),
  };
}

/** Whether this land of ours faces anybody but the land we are aiming at. The
 *  question the spend policy turns on: a land with a second rival on its
 *  border is holding a frontier, and a frontier emptied to hit somewhere else
 *  is an invitation. */
function isFrontier(
  v: RulesView, actor: string, land: string, exceptTarget: string,
): boolean {
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  return (v.adjacency[land] ?? []).some(
    (adj) => adj !== exceptTarget && !realm.has(adj),
  );
}

/** How much defense the AI tears out of `from` to send this raid.
 *
 *  A raid card spends its source land's defense 1:1 and the arrow lands for
 *  what was spent, so "which card, at what" stopped being the whole of the
 *  decision and this is the rest of it:
 *
 *  - A CONQUEST is paid for wherever the source stands: `defense + 1`, since
 *    `capturesOnArrival` wants the blow to EXCEED what is standing, and not a
 *    point more. A land taken is worth being left open for.
 *  - Otherwise, out of a FRONTIER land, the minimum. It will not gut the land
 *    facing one rival to soften another it cannot take this turn.
 *  - Otherwise the source is INTERIOR, and it spends its ceiling: the blow
 *    that cannot capture is still the blow that softens, and nothing is
 *    standing over that land to punish it for being emptied.
 *
 *  The conquest arm above the frontier arm is load-bearing. Read the other way
 *  round, a branch that had already PICKED a target it could overwhelm would
 *  then send an arrow too small to take it - the AI choosing a conquest and
 *  declining to pay for it in the same turn.
 *
 *  The `POLICY_COVERAGE` entries for all three raid cards name this rule; it
 *  is one function over the class rather than three copies keyed by card id. */
function raidSpendFor(
  v: RulesView, actor: string, cardId: string, from: string, to: string,
): number {
  const ceiling = spendCeilingOn(v, cardId, from);
  const takes = defenseOf(v, to) + 1;
  if (takes <= ceiling) return Math.max(MIN_RAID_SPEND, takes);
  if (isFrontier(v, actor, from, to)) return MIN_RAID_SPEND;
  return Math.max(MIN_RAID_SPEND, ceiling);
}

/** The hardest single arrow this card could throw at `target` right now -
 *  every legal source's ceiling considered, readings and the leader included.
 *
 *  What the scoring branches below reason with, and deliberately the CEILING
 *  rather than what `raidSpendFor` would actually send: a branch asking "can
 *  this card finish that land" is asking whether the play is available at all,
 *  and the answer is yes whenever some land of the realm could pay for it. */
function bestAttackOn(
  v: RulesView, actor: string, cardId: string, target: string,
): number {
  return attackImpactOn(v, actor, cardId, target).damage;
}

/** Which land of the realm to settle: a land held outright is yours for
 *  good, while a vassal walks off with the settlement the moment it frees
 *  itself. Ties break on faction order, so the pick is deterministic. */
function settlementTarget(
  state: GameState,
  actorFactionId: string,
  targets: string[],
): string | undefined {
  const rank = (id: string): number => {
    if (id === actorFactionId) return 0;
    if (state.incorporated[id] === actorFactionId) return 1;
    return 2; // a vassal's land: settle it last
  };
  return [...targets].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
  )[0];
}

/** Deterministic policy v3 - the defense-score spine; see the 2026-08-08
 *  design doc, "AI: two known strategies". Calls `playableSet` with no
 *  `discards` option on purpose: the "discard" verdict it can then return
 *  means "nothing playable" under any rule set, and `aiTakeTurn`'s unlimited
 *  loop relies on exactly that verdict as its stop signal.
 *
 *  `repeatOnly` is how a re-opened turn reaches the policy, and it needs no
 *  branch of its own: it narrows the set every branch below picks out of, so
 *  the same branches that chose the first card choose the second, aimed
 *  afresh at the board the first one left. A turn spent for good narrows the
 *  set to nothing, and the last-resort step then names a hand index that is
 *  not there - which `playCard` refuses, and `aiTakeTurn` reads as its stop. */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(
    v, p.factionId, p.hand, { repeatOnly: repeatOnlyOf(state) },
  );
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);
  const order = (id: string): number => state.factionIds.indexOf(id);

  // 1: forced tribute. Forced cards leave no real choice; play the demand.
  const lord = state.overlords.get(p.factionId);
  if (lord !== undefined) {
    const tribute = set.cardIndexes.find((i) => isTributeCard(p.hand[i]));
    if (tribute !== undefined) return { type: "play", cardIndex: tribute };
  }

  // 2A: take a land outright. An army that deals more than the land has
  // standing walks in over what is left of it, and one arriving where nothing
  // is left to fight takes it for free - so a raid at a neighbour this card
  // overwhelms is a conquest rather than an attack, and it is the only way a
  // land changes hands now. It outranks everything voluntary for the same
  // reason the old Subjugate branch did: a certain gain beats every plan.
  //
  // The same predicate the resolution asks, against the same post-terrain
  // number, or the branch would claim lands that hill country hands back.
  //
  // Ahead of the gate-hunting branches on purpose. Those aim at lands this card
  // cannot finish (`gateCandidates` drops a land whose gate is already open),
  // so without this step a seat would flatten its neighbours one after another
  // and never move in.
  const walkIn = marchPick(idxOf);
  if (walkIn !== undefined) {
    const realm = fullRealmOf(p.factionId, state.overlords, state.incorporated);
    const worth = (t: string): number =>
      fullRealmOf(t, state.overlords, state.incorporated).size *
      travelFactor(turnsToLand(state, v, p.factionId, t));
    // Per target, because a raid's damage is now the ceiling of whichever of
    // OUR lands borders that one - two neighbours are two different numbers.
    const takeable = validTargetsFor(v, p.factionId, walkIn.id)
      .filter((t) => !realm.has(t)
        && capturesOnArrival(
          damageAfterTerrain(v, t, bestAttackOn(v, p.factionId, walkIn.id, t)),
          defenseOf(v, t),
        ))
      // The biggest pyramid first: taking a lord takes everything under it -
      // discounted by the walk, because a conquest three turns out is a
      // conquest the target has three turns to repair out of. A pyramid twice
      // the size is still worth a turn further off; four times the size is
      // worth two.
      .sort(
        (a, b) =>
          worth(b) - worth(a) ||
          order(a) - order(b),
      );
    if (takeable.length > 0) {
      return raidAt(state, v, p.factionId, walkIn.index, walkIn.id, takeable[0]);
    }
  }

  // 2B: subjugate any faction whose gate is open - the certain gain outranks
  // everything voluntary. Legality owns the gate, the respite and the liege
  // rule; the pick among several open gates is the biggest full realm, since
  // taking a lord takes its pyramid. The card is withdrawn from every pool,
  // so this is unreachable until it comes back; it is kept because the branch
  // is what the card means, not what any deck happens to hold.
  const subjugate = idxOf("subjugate");
  if (subjugate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "subjugate");
    if (targets.length > 0) {
      const best = [...targets].sort(
        (a, b) =>
          fullRealmOf(b, state.overlords, state.incorporated).size -
            fullRealmOf(a, state.overlords, state.incorporated).size ||
          order(a) - order(b),
      )[0];
      return { type: "play", cardIndex: subjugate, targetId: best };
    }
  }

  // 3: incorporate the vassal whose digestion nets the most permanent land.
  // The scoring keeps the kept-lands-minus-freed-subtrees arithmetic and has
  // no odds discount - the roll no longer exists.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    let best: string | null = null;
    let bestScore = 0; // a digest that nets nothing is never picked
    for (const t of targets) {
      const vassalsOfT = state.factionIds.filter(
        (f) => state.overlords.get(f) === t,
      );
      const kept =
        realmOf(t, state.overlords, state.incorporated).length -
        vassalsOfT.length;
      const freed = vassalsOfT.reduce(
        (sum, f) =>
          sum + fullRealmOf(f, state.overlords, state.incorporated).size,
        0,
      );
      const score = kept - freed;
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (best !== null) {
      return { type: "play", cardIndex: incorporate, targetId: best };
    }
  }

  // 4: assassinate the rival with the highest leadership, when that
  // leadership makes them a threat in reach and no bodyguard risk is known.
  // Both strategies share this branch; it is the check on Warpath. A ruler
  // with a posted guard is skipped: trading the card for the guard leaves
  // the leadership standing.
  const assassinate = idxOf("assassinate-ruler");
  if (assassinate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "assassinate-ruler")
      .filter((t) => !holdsGuard(v, t, "bodyguard"));
    // A land carrying No successor is taken outright by the killing, whatever
    // its ruler was worth: a card that wins a land beats a card that removes a
    // leadership stack.
    const free = targets
      .filter((t) => hasPassive(v.passives, t, "no-successor"))
      .sort((a, b) => order(a) - order(b))[0];
    const pick =
      free ??
      targets
        .filter((t) => (v.leadership[t] ?? 0) >= WAR_COUNCIL_LEADERSHIP)
        .sort(
          (a, b) => (v.leadership[b] ?? 0) - (v.leadership[a] ?? 0) ||
            order(a) - order(b),
        )[0];
    if (pick !== undefined) {
      return { type: "play", cardIndex: assassinate, targetId: pick };
    }
  }

  // 5: repair the realm. When its worst polygon sits under 50%, heal it.
  // The two single-land heals in strength order: spend the big one first while
  // a land is worth it. Fortify is the weaker, and the one every deck starts
  // holding four of.
  //
  // A vassal used to have an arm of its own above this one, healing its HOME
  // toward the line that would have freed it. A vassal never leaves now, so
  // its home is one of the realm's polygons like any other and the walk below
  // covers it.
  const hillfort = idxOf("hillfort");
  const strongFortify = idxOf("strong-fortify");
  const fortify = idxOf("fortify");
  const feast = idxOf("harvest-feast");
  /** The strongest heal in hand that this land is a legal target for. */
  const healAt = (land: string): AiAction | null => {
    for (const [index, cardId] of [
      [hillfort, "hillfort"] as const,
      [strongFortify, "strong-fortify"] as const,
      [fortify, "fortify"] as const,
    ]) {
      if (index === undefined) continue;
      if (validTargetsFor(v, p.factionId, cardId).includes(land)) {
        return { type: "play", cardIndex: index, targetId: land };
      }
    }
    return null;
  };
  const realmPolys = [
    ...fullRealmOf(p.factionId, state.overlords, state.incorporated),
  ];
  // Braced: a land reads as damaged by what has already landed PLUS what is
  // in the air at it, netted against our own counter on the same axis. An
  // arrow is visible a turn ahead, so a heal that ignores it repairs a land
  // that is about to be knocked straight back down.
  const braced = (m: string): number =>
    Math.max(0, defenseOf(v, m) - incomingAt(v, m));
  // Worst first, and DOWN THE LIST rather than the worst alone. A fortify
  // calls on a settlement of the land it heals, so the worst land runs out
  // while it is still the worst - and a repeat that could only ever re-aim
  // at the same land would end the run on its second play. The same walk
  // also covers the older case of a land braced under half that is already
  // standing at its ceiling.
  const worst = realmPolys
    .filter((m) => braced(m) < 0.5 * defenseMaxOf(v, m))
    .sort(
      (a, b) =>
        braced(a) / defenseMaxOf(v, a) - braced(b) / defenseMaxOf(v, b) ||
        order(a) - order(b),
    );
  for (const land of worst) {
    const heal = healAt(land);
    if (heal !== null) return heal;
  }
  if (worst.length > 0 && feast !== undefined) {
    return { type: "play", cardIndex: feast };
  }

  // 5A: answer a march. An arrow is visible for exactly one turn, so this is
  // the most perishable move on the spine and sits directly under the heals it
  // competes with - a Hillfort on a land about to be broken is worth less than
  // the counter that stops it being broken.
  //
  // Both strategies, not just Warpath: every seat starts holding Raids
  // whatever build it picked, and a march is aimed at the land, not the plan.
  const counter = counterRaid(state, v, p.factionId, idxOf);
  if (counter !== null) return counter;

  // 6: the strategy branch's DECISIVE moves - the ones whose moment passes:
  // vassal suppression, a finishing hit, a fan that opens gates, a reserve
  // that unlocks one. The always-available build moves (raid the nearest
  // gate, war council, spread on the nearest gate) live BELOW the harvest
  // steps instead: measured with them up here, a warpath seat always had a
  // raid to prefer, never played a turnip, never earned the harvest that is
  // its only route to Subjugate - and a 150-turn all-warpath world ended
  // with zero subjugations.
  const branch =
    p.strategy === "warpath"
      ? warpathDecisive(state, v, p.factionId, idxOf)
      : pestilenceDecisive(state, v, p.factionId, idxOf);
  if (branch !== null) return branch;

  // 7: bodyguard while own leadership is the highest on the board - you are
  // now the assassination target step 4 hunts.
  const bodyguard = idxOf("bodyguard");
  if (bodyguard !== undefined) {
    const own = v.leadership[p.factionId] ?? 0;
    const highest =
      own > 0 &&
      state.factionIds.every(
        (f) => f === p.factionId || (v.leadership[f] ?? 0) < own,
      );
    if (highest) return { type: "play", cardIndex: bodyguard };
  }

  // 8R: raise a ceiling. Consumed on play and permanent, so it is spent on
  // the land worth compounding: the biggest already, ties by faction order.
  // Ahead of the settlement because it buys an army as well as the headroom.
  const ramparts = idxOf("prosperous-proliferation");
  if (ramparts !== undefined) {
    const best = [...validTargetsFor(v, p.factionId, "prosperous-proliferation")].sort(
      (a, b) => defenseMaxOf(v, b) - defenseMaxOf(v, a) || order(a) - order(b),
    )[0];
    if (best !== undefined) {
      return { type: "play", cardIndex: ramparts, targetId: best };
    }
  }

  // 8: found a settlement on a spare turn - permanent income.
  const settle = idxOf("found-settlement");
  if (settle !== undefined) {
    const target = settlementTarget(
      state, p.factionId, validTargetsFor(v, p.factionId, "found-settlement"),
    );
    if (target !== undefined) {
      return { type: "play", cardIndex: settle, targetId: target };
    }
  }

  // 9: cash the harvest whenever held. Above turnips, or a hand holding both
  // would grow turnips forever and never spend the harvest they earned. The
  // pick itself needs no policy here: a choiceless playCard auto-resolves
  // through autoHarvestChoice, which ranks by the seat's build.
  const harvest = idxOf("turnip-harvest");
  if (harvest !== undefined) return { type: "play", cardIndex: harvest };

  // 10: grow turnips whenever held. Above the build moves, not below them:
  // the deck holds one turnip against five build cards, so this costs about
  // one turn in six and is the only thing that keeps the harvest loop - and
  // with it the whole card economy - turning.
  const grow = idxOf("grow-crops");
  if (grow !== undefined) return { type: "play", cardIndex: grow };

  // 11: the strategy branch's build moves - always-available progress toward
  // the next gate.
  const build =
    p.strategy === "warpath"
      ? warpathBuild(state, v, p.factionId, idxOf)
      : pestilenceBuild(state, v, p.factionId, idxOf);
  if (build !== null) return build;

  // 12: first playable card as a last resort.
  const i0 = set.cardIndexes[0];
  const lastResort = p.hand[i0];
  if (CARDS[lastResort]?.targeted) {
    const legal = validTargetsFor(v, p.factionId, lastResort);
    return { type: "play", cardIndex: i0, targetId: legal[0] };
  }
  return { type: "play", cardIndex: i0 };
}

/** Step 5A: raid back down an axis somebody is marching along.
 *
 *  A counter is a Raid like any other - the clash is recognised by the axis,
 *  not by a card - so the whole move is "aim a raid at the land the arrow came
 *  out of". Worth a turn on two conditions, either alone:
 *
 *  - the incoming would push one of our lands to or under its subjugation
 *    gate, which is the only damage that costs more than a card; or
 *  - our raid is at least as strong as the ONE arrow it will meet, so the pair
 *    cancels and may throw the difference back. One arrow, because armies pair
 *    off one for one on an axis - a counter aimed at a bundle of three stops
 *    the one it meets and lets the other two through.
 *
 *  Without the second condition a weak seat would trade its army for nothing;
 *  without the first, a seat about to be broken would sit and take it because
 *  the arithmetic said its counter was too small to win. */
function counterRaid(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const pick = marchPick(idxOf);
  if (pick === undefined) return null;
  const raid = pick.index;
  const realm = fullRealmOf(actor, v.overlords, v.incorporated);
  const targets = new Set(validTargetsFor(v, actor, pick.id));

  const answerable = axesOf(v.marches)
    .flatMap((axis) => [
      { under: axis.a, from: axis.b, incoming: axis.fromB, ours: axis.fromA },
      { under: axis.b, from: axis.a, incoming: axis.fromA, ours: axis.fromB },
    ])
    .filter(
      (x) =>
        realm.has(x.under) && !realm.has(x.from) &&
        x.incoming.length > 0 && targets.has(x.from) &&
        // Only from the land actually under threat: a counter declared from
        // anywhere else is a fresh attack on a different axis and does not
        // meet this one at all.
        marchSourcesAgainst(v, actor, x.from).includes(x.under),
    )
    .map((x) => {
      // The armies pair off one for one, so a counter answers ONE arrow. Ours
      // joins the end of our side of the axis and therefore meets the incoming
      // sitting at that index; `net` is what still gets through if we do
      // nothing - every incoming nobody is already meeting.
      const answers = x.incoming[x.ours.length]?.damage ?? 0;
      const net = x.incoming
        .slice(x.ours.length)
        .reduce((s, m) => s + m.damage, 0);
      // What OUR land could throw back is its own ceiling, not a card-wide
      // number: the land under threat is the only land a counter may leave
      // from, and a land already softened answers more feebly. Which is the
      // whole point of the counter being worth timing.
      const ours = attackDamageFor(
        v, actor, pick.id, spendCeilingOn(v, pick.id, x.under),
      ).damage;
      return { ...x, answers, net, ours };
    })
    .filter(
      (x) => x.answers > 0 && (x.ours >= x.answers || gateGap(v, x.under) <= x.net),
    );
  if (answerable.length === 0) return null;

  // The land in the most trouble first: nearest its gate after the hit it is
  // about to take, ties by faction order.
  const worst = answerable.sort(
    (a, b) =>
      gateGap(v, a.under) - a.net - (gateGap(v, b.under) - b.net) ||
      state.factionIds.indexOf(a.under) - state.factionIds.indexOf(b.under),
  )[0];
  return {
    type: "play", cardIndex: raid, targetId: worst.from, sourceId: worst.under,
    // A counter answers the arrow in front of it: enough to beat what is
    // coming, capped by what the threatened land can still pay. Not
    // `raidSpendFor` - that one asks about capturing, and a counter is asked
    // about surviving.
    spend: Math.max(
      MIN_RAID_SPEND,
      Math.min(spendCeilingOn(v, pick.id, worst.under), worst.answers),
    ),
  };
}

/** Step 6, Warpath: the decisive moves, every one condition-gated so a quiet
 *  board falls through to the harvest steps. */
function warpathDecisive(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const pick = marchPick(idxOf);
  const raid = pick?.index;
  const greatRaid = idxOf("great-raid");
  const omens = idxOf("favourable-omens");
  const raidTargets =
    pick === undefined ? [] : validTargetsFor(v, actor, pick.id);

  // Per target, and a ceiling: what the hardest arrow the realm could throw
  // at that land would land. A branch asking "can this card finish it" is
  // asking whether the play is available at all.
  const hardest = (t: string): number =>
    pick === undefined ? 0 : bestAttackOn(v, actor, pick.id, t);
  const candidates = gateCandidates(state, v, actor, raidTargets);

  // 6W-2: the finishing hit - a polygon whose gate this one raid opens.
  // Netted against what is already in the air at that polygon: a march
  // already aimed there does part of the work, and one aimed the other way
  // will eat part of ours. Both are known a turn ahead now, so a "finisher"
  // that ignores them is the raid-status-rider bug again - a decisive branch
  // firing at a target it cannot actually finish.
  //
  // What is left for this branch after 2A is the land this raid flattens
  // EXACTLY, or one it only finishes with help already in the air. Anything it
  // overwhelms on its own was taken up there, which is why this stays a
  // gap-not-excess test.
  if (raid !== undefined) {
    const finish = candidates.find(
      (t) => gateGap(v, t) - incomingAt(v, t) <= hardest(t),
    );
    if (finish !== undefined) {
      return raidAt(state, v, actor, raid, pick!.id, finish);
    }
  }

  // 6W-3: great raid where the arrows it musters flatten the land outright.
  // It is several Raids at one target now, so the question is the finisher's
  // question with a bigger number: how much lands, against what is standing.
  if (greatRaid !== undefined) {
    const best = greatRaidPick(v, actor);
    if (best !== null && best.damage >= gateGap(v, best.target)) {
      return { type: "play", cardIndex: greatRaid, targetId: best.target };
    }
  }

  // 6W-4: read the omens when the doubled attack would open a gate this
  // plain raid cannot, or one-shot a small polygon outright.
  if (omens !== undefined && (raid !== undefined || greatRaid !== undefined)) {
    const doubled = candidates.some((t) => {
      const d = hardest(t);
      return (gateGap(v, t) > d && gateGap(v, t) <= d * 2) ||
        defenseOf(v, t) <= d * 2;
    });
    if (doubled) return { type: "play", cardIndex: omens };
  }
  return null;
}

/** Step 11, Warpath: the always-available build moves, below the harvest
 *  steps so they cannot starve the turnip loop. */
function warpathBuild(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const pick = marchPick(idxOf);
  const raid = pick?.index;
  const greatRaid = idxOf("great-raid");
  const council = idxOf("war-council");
  const raidTargets =
    pick === undefined ? [] : validTargetsFor(v, actor, pick.id);
  const hardest = (t: string): number =>
    bestAttackOn(v, actor, pick?.id ?? "raid", t);
  const candidates = gateCandidates(state, v, actor, raidTargets);

  // 11W-1: war council while no target's gate is within 2 attacks - build
  // first, strike once the striking is worth it.
  if (council !== undefined) {
    const near = candidates.some((t) => gateGap(v, t) <= 2 * hardest(t));
    if (!near) return { type: "play", cardIndex: council };
  }

  // 11W-2: raid the polygon nearest its subjugation gate.
  if (raid !== undefined && candidates.length > 0) {
    return raidAt(state, v, actor, raid, pick!.id, candidates[0]);
  }

  // 11W-3: great raid as pressure, where two or more lands can ride at once.
  // One arrow is a Raid played at a card's price, so the card is only worth
  // spending where the neighbourhood actually musters.
  if (greatRaid !== undefined) {
    const best = greatRaidPick(v, actor);
    if (best !== null && best.arrows >= 2) {
      return { type: "play", cardIndex: greatRaid, targetId: best.target };
    }
  }

  return null;
}

/** Where a Great raid would land hardest: the bordering polygon its own
 *  neighbourhood can throw the most damage at, ties broken toward the land
 *  nearest falling. Null when no target musters an arrow at all.
 *
 *  One list, `greatRaidMarches`, which is also what legality and the card tip
 *  read - the AI must not score a fan the rules would not send.
 *
 *  The CANDIDATES come from `validTargetsFor`, the same way every other picker
 *  in this module gets its list, and never from the bare border. That changes
 *  the set in BOTH directions, and the widening is the half worth stating:
 *
 *  - It refuses what the rules refuse. A seat proposing a target the rules
 *    will not take used to hang the run - `playCard` hands the state back
 *    unchanged, `endTurn` refuses a standard turn that played nothing, and
 *    `advance` will not move past an open turn. Reachable the moment a VASSAL
 *    started taking turns, because a lord borders its vassal and the fattest
 *    fan on the board is often aimed straight up the actor's own chain, which
 *    `aimsWithinOwnRealm` forbids.
 *  It also narrows the set the same way every other picker is narrowed: a
 *    lord may no longer aim a hostile card down its own chain, so its vassals
 *    are not offered here any more than they are to `raidPick`. */
function greatRaidPick(
  v: RulesView, actor: string,
): { target: string; arrows: number; damage: number } | null {
  let best: { target: string; arrows: number; damage: number } | null = null;
  for (const target of validTargetsFor(v, actor, "great-raid")) {
    if (target in v.incorporated) continue;
    const arrows = greatRaidMarches(v, actor, target).length;
    if (arrows === 0) continue;
    // The whole pool, not one arrow times the fan: the lands share a purse
    // now, so a wide fan of poor lands and a narrow one of rich lands are
    // different plays and the score has to be able to tell them apart.
    const damage = attackImpactOn(v, actor, "great-raid", target).damage;
    if (
      best === null ||
      damage > best.damage ||
      (damage === best.damage && gateGap(v, target) < gateGap(v, best.target))
    ) {
      best = { target, arrows, damage };
    }
  }
  return best;
}

/** Step 6, Pestilence: the decisive moves - cashing a gate open outranks
 *  stacking further, and everything here is condition-gated. */
function pestilenceDecisive(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const outbreak = idxOf("localized-outbreak");
  const miasma = idxOf("miasma");
  const plague = idxOf("plague");
  const winds = idxOf("foul-winds");
  const mult = plagueMultiplier(v, actor);
  const stacksOn = (polygon: string): number =>
    v.disease[polygon]?.[actor] ?? 0;
  const plagueDamageAt = (polygon: string, m: number): number =>
    stacksOn(polygon) * PLAGUE_DAMAGE_PER_STACK * m;
  // Scored only over `plagueTargetsOf`'s list below, so the reach question is
  // already answered by the time this runs; the annexation check here is the
  // AI's own gate-hunting preference, not a reach question - an annexed land
  // has no gate of its own to open.
  const opensGate = (polygon: string, m: number): boolean =>
    !(polygon in v.incorporated) &&
    gateGap(v, polygon) > 0 &&
    gateGap(v, polygon) <= plagueDamageAt(polygon, m);

  // 6P-2: plague when it opens at least one gate, or when the total damage
  // beats a raid's worth - the cash-out test. `plagueTargetsOf` is the same
  // list legality, the resolution and the hover preview all read, so the
  // policy never scores a stack the play cannot actually strike.
  if (plague !== undefined) {
    const targets = plagueTargetsOf(v, actor);
    const total = targets.reduce(
      (sum, polygon) => sum + Math.min(defenseOf(v, polygon), plagueDamageAt(polygon, mult)),
      0,
    );
    const opens = targets.some((polygon) => opensGate(polygon, mult));
    // "Beats a raid's worth" - the best raid actually available, since a
    // raid's worth is no longer one number for the board.
    const raidWorth = [...borderPolygonsOf(v, actor)]
      .reduce((most, t) => Math.max(most, bestAttackOn(v, actor, "raid", t)), 0);
    if (opens || total > raidWorth) {
      return { type: "play", cardIndex: plague };
    }
  }

  // 6P-3: foul winds when rivals' stacks exceed our own. `theirs` walks
  // `foulWindsTargetsOf`'s list - what the play could actually claim; `own`
  // is not aim, so it walks every stack the actor holds with no filter.
  if (winds !== undefined) {
    let own = 0;
    for (const owners of Object.values(v.disease)) own += owners[actor] ?? 0;
    let theirs = 0;
    for (const polygon of foulWindsTargetsOf(v, actor)) {
      for (const [owner, n] of Object.entries(v.disease[polygon] ?? {})) {
        if (owner !== actor) theirs += n;
      }
    }
    if (theirs > own) return { type: "play", cardIndex: winds };
  }

  // 6P-4: miasma when the doubled plague would push a gate open that the
  // plain one cannot.
  if (miasma !== undefined && plague !== undefined) {
    const unlocks = state.factionIds.some(
      (polygon) => !opensGate(polygon, mult) && opensGate(polygon, mult * 2),
    );
    if (unlocks) return { type: "play", cardIndex: miasma };
  }

  // 6P-5: localized outbreak on the junction whose non-own neighbour count
  // is highest, when that junction spreads further than a single stack.
  if (outbreak !== undefined) {
    const targets = validTargetsFor(v, actor, "localized-outbreak");
    const scored = targets
      .map((t) => ({
        t,
        n: (v.adjacency[t] ?? []).filter(
          (adj) =>
            !fullRealmOf(actor, v.overlords, v.incorporated).has(adj),
        ).length,
      }))
      .sort(
        (a, b) =>
          b.n - a.n ||
          state.factionIds.indexOf(a.t) - state.factionIds.indexOf(b.t),
      )[0];
    if (scored !== undefined && scored.n >= 2) {
      return { type: "play", cardIndex: outbreak, targetId: scored.t };
    }
  }
  return null;
}

/** Step 11, Pestilence: the always-available build move, below the harvest
 *  steps for the warpath reason. */
function pestilenceBuild(
  state: GameState,
  v: RulesView,
  actor: string,
  idxOf: (id: string) => number | undefined,
): AiAction | null {
  const spread = idxOf("spread-disease");
  if (spread !== undefined) {
    const candidates = gateCandidates(
      state, v, actor, validTargetsFor(v, actor, "spread-disease"),
    );
    if (candidates.length > 0) {
      return { type: "play", cardIndex: spread, targetId: candidates[0] };
    }
  }
  return null;
}

/** Ceiling on plays per AI turn. The refill happens only at turn start, so
 *  the hand itself bounds the loop; the cap is belt-and-braces against a
 *  future card that adds cards to the hand mid-turn. Exported because the
 *  balance harness walks a turn the same way and must not bound it
 *  differently. */
export const MAX_AI_PLAYS = 16;

/** Ends the seat's turn, and if the rules will not let it end, gives it up -
 *  loudly. The whole of the hung-seat guard, and it closes the failure as a
 *  CLASS rather than one picker at a time.
 *
 *  `turnOpen` after an `endTurn` is precisely "advance will refuse to move past
 *  this seat", so this fires on exactly the states that freeze the run and on
 *  no others. A seat that simply has nothing to do never reaches it: an empty
 *  playable set makes `chooseAction` return a discard, and `discardCard` spends
 *  the turn.
 *
 *  Two reachable ways in, and neither can be recovered through the engine's own
 *  doors, which is why the flag is set here:
 *
 *  - A picker proposes a target the rules refuse, so `playCard` hands the state
 *    straight back. `discardCard` is no escape - it refuses whenever
 *    `playableSet` reports `mode: "play"`, which is exactly this case.
 *  - The seat's hand is empty, so the set is `discard` with nothing in it and
 *    `discardCard` refuses on the index.
 *
 *  And `endTurn` is no escape either: it is the door every seat uses, a person's
 *  included, and letting a standard turn end unplayed there would let a player
 *  skip a turn they could have played. `endTurn` already carries this same
 *  reasoning for a re-opened turn - "a seat holding a raid it cannot aim
 *  anywhere sits there forever" - and this is that sentence for the first play.
 *
 *  It SHOUTS because a silent recovery turns the next picker bug into
 *  mysteriously skipped turns nobody can diagnose. Reaching this is a bug in
 *  whatever chose the action, not a rule of the game: the console line names the
 *  seat and what it proposed so the picker can be found. */
function endOrGiveUp(state: GameState, proposed: AiAction | null): GameState {
  const ended = endTurn(state);
  if (ended.phase !== "playing" || !turnOpen(ended)) return ended;
  const p = ended.players[ended.current];
  console.error(
    `AI seat cannot end its turn - giving it up. turn ${ended.turn}, ` +
      `${p?.factionId}, proposed ${JSON.stringify(proposed)}, ` +
      `hand ${JSON.stringify(p?.hand)}`,
  );
  return { ...ended, playedThisTurn: true, repeatGroup: null };
}

/** One WHOLE turn for the current seat, in either mode - every caller wraps
 *  this in `advance`, so a partial turn here would stall the game. */
export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  if (state.rules.turn === "unlimited") {
    let g = state;
    let refused: AiAction | null = null;
    for (let plays = 0; g.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
      const a = chooseAction(g);
      if (a.type === "discard") break;
      const next = playCard(g, a.cardIndex, rng, a.targetId, {
        ...(a.sourceId !== undefined ? { sourceId: a.sourceId } : {}),
      });
      if (next === g) { // a refused play must not spin
        refused = a;
        break;
      }
      g = next;
    }
    // Unlimited rules end a turn that played nothing, so the guard is inert
    // here. It is asked anyway rather than only on the standard path: which
    // rule axis is in force must not decide whether a hung seat is recoverable.
    return endOrGiveUp(g, refused);
  }
  // The standard turn is one card - unless that card re-opened it for another
  // of its own kind, which is a question about the state after the play, not
  // about the card. So the loop is the unlimited one with a different stop:
  // keep going while the turn is still open and the state still moves. A
  // refused play (an empty narrowed set, a run out of armies) returns the
  // state unchanged and stops it, so the rules end the run rather than a
  // count of plays; MAX_AI_PLAYS remains the belt-and-braces bound.
  let g = state;
  let refused: AiAction | null = null;
  for (let plays = 0; g.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
    const a = chooseAction(g);
    const next = a.type === "discard"
      ? discardCard(g, a.cardIndex)
      : playCard(g, a.cardIndex, rng, a.targetId, {
          ...(a.sourceId !== undefined ? { sourceId: a.sourceId } : {}),
        });
    if (next === g) {
      refused = a;
      break;
    }
    g = next;
    if (!turnOpen(g)) break;
  }
  // Gives up whatever is left of a re-opened turn. A seat that stopped with a
  // repeat still on the table has decided it has no second play worth making,
  // and `advance` will not move past a turn that is still open - and, if the
  // rules will not let even that turn end, gives it up rather than freezing
  // the run behind a seat that can never act.
  return endOrGiveUp(g, refused);
}
