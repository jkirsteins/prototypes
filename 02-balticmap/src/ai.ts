import { CARDS, DOUBLABLE_CARDS, isTributeCard, type Rng } from "./cards";
import { fullRealmOf, realmOf } from "./relations";
import {
  holdsGuard, leadsIn, omenMultiplier, playableSet, raidGainFor,
  seatOf, subjugationRequirement, subjugationChance,
  incorporationChance, targetEligibilityFor, threatsTo, validTargetsFor,
  type RulesView, type Threat,
} from "./playability";
import { discardCard, endTurn, playCard, viewOf, type GameState } from "./game";

export type AiAction =
  | { type: "play"; cardIndex: number; targetId?: string }
  | { type: "discard"; cardIndex: number };

/** Which branch of `chooseAction` decides each card. Keyed on every id in
 *  CARDS, not only the deck-buildable ones: tribute is injection-only yet
 *  reaches hands and has a real branch, so keying on `deckBuildable` would
 *  leave the most forced card in the game unguarded.
 *
 *  A card with no branch here fails a test rather than passing review. That is
 *  deliberate. Alliance, Assassinate ruler, Extended diplomacy, Bodyguard and
 *  Revolt all once shipped with no branch at all, and 27.7% of AI plays were
 *  last-resort fallthroughs as a result - Alliance and Assassinate ruler being
 *  the 5th and 6th most-played cards, each picking its target by faction sort
 *  order while 2 or more targets were legal 82% and 64% of the time. See the
 *  card rule in AGENTS.md. */
export const POLICY_COVERAGE: Record<string, string> = {
  "pay-military-tribute": "1: forced tribute",
  "revolt": "2: revolt out of vassalage",
  "seeds-of-revolt": "2a: sow a revolt while a vassal",
  "incorporate": "3: incorporate the best permanent gain net of freed vassals",
  "subjugate": "4: subjugate the biggest lead (vassal seats included)",
  "alliance": "5: emergency alliance",
  "assassinate-ruler": "5: emergency assassination",
  "take-hostage": "5b: lock a restive vassal's Revolt, biggest realm first",
  "raid": "6: finishing play, else 9: build toward the closest subjugation",
  "fortify": "7: defensive fan-out",
  "found-settlement":
    "7b: settle against a nearing threat, else 9b: settle a spare turn",
  "seat-of-power":
    "7c: seat against a nearing threat, else 9c: seat the widest border, " +
    "moving only to a strictly better land",
  "favourable-omens":
    "8: read the omens before building, stacking on a held reading",
  "extended-diplomacy": "8b: extend the next pact",
  "bodyguard": "8c: post the guard whose card is aimed at this position",
  "distrustful-neighbour": "8c: post the guard whose card is aimed at this position",
  "population-boom": "8d: raise the population when it would unlock a settlement",
  "mighty-ruler": "9d: level the ruler on a spare turn",
  "turnip-harvest":
    "9e: cash the harvest on any legal turn (auto-resolves in playCard; the " +
    "injection is human-seat-only, so only the sim's human seat holds it)",
  "grow-crops": "10: grow crops",
};

/** Which guard answers which position, as the question the policy can actually
 *  ask about each: "is anybody in a position where the card this guard turns
 *  aside would hurt me?"
 *
 *  Written as one table rather than three copies of step 8c, because the three
 *  guards differ only in what counts as the position worth spending a turn on.
 *  Every entry names a real position and none falls through to "play it because
 *  it is in hand" - which is the failure POLICY_COVERAGE exists to stop. */
interface GuardCase {
  cardId: string;
  /** True when posting this guard is worth the turn. */
  worth(v: RulesView, self: string, threats: Threat[]): boolean;
}

const GUARD_CASES: GuardCase[] = [
  {
    // A Might lead that cannot be cashed this turn is exactly the position
    // step 5's assassination hunts, so the guard answers a threat this policy
    // would itself make. A lead you can cash now needs no guard, which is what
    // the Subjugate check at the call site encodes.
    cardId: "bodyguard",
    worth: (v, self) =>
      targetEligibilityFor(v, self, "subjugate").some((e) => {
        if (e.state === "irrelevant") return false;
        const required = subjugationRequirement(v, self, e.factionId);
        if (required === null) return false;
        return leadsIn(v, self, e.factionId) >= required;
      }),
  },
  {
    // A pact freezes hostile cards in BOTH directions, so being courted by a
    // faction you were about to take is a five-turn tax on your own conquest -
    // the reasoning step 5 already uses to refuse allying with its own best
    // target, turned around. Worth a card only while such a target exists.
    cardId: "distrustful-neighbour",
    worth: (v, self) =>
      targetEligibilityFor(v, self, "subjugate").some((e) => {
        if (e.state === "irrelevant") return false;
        const required = subjugationRequirement(v, self, e.factionId);
        if (required === null) return false;
        // Within two plays, counting a flat +1 a play. Raid's convexity
        // would make this optimistic rather than pessimistic, and a guard
        // posted a turn early costs nothing but the turn.
        return required - leadsIn(v, self, e.factionId) <= 2;
      }),
  },
];

/** What a play would actually move, so the policy stops assuming every card
 *  is worth exactly 1: Raid scales with border, and any doublable card is
 *  worth `2 ** readings` as much while a stack of readings is held. */
function gainOf(
  state: GameState,
  actorFactionId: string,
  cardId: string,
  targetId: string,
): number {
  // Raid's yield is convex in border width, so the policy has to score it
  // through `raidGainFor` - the same call `playCard` resolves it with. Scoring
  // the raw border count instead would undervalue a wide border, exactly the
  // case the convexity exists to reward, and the policy would keep preferring a
  // flat +1 card over a Raid worth 15.
  if (cardId === "raid") {
    return raidGainFor(viewOf(state), actorFactionId, targetId).gain;
  }
  return omenMultiplier(state, actorFactionId, cardId);
}

/** Which land of the realm to settle. Every settlement raises the same bar by
 *  the same 1, so the choice is entirely about which land is safest to sink a
 *  turn into: a land you hold yourself or have annexed is yours for good, while
 *  a vassal walks off with the settlement (and the grip it carries) the moment
 *  it revolts. Ties break on faction order, so the pick is deterministic
 *  without being arbitrary - the ordering is the rule. */
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

/** How well the seat would serve from `land`: the distinct raidable rivals
 *  its neighbours resolve to, since the seat pays its raid bonus against
 *  exactly the factions the seat land touches. Distinct owners, resolved
 *  through `incorporated` the way the rider itself resolves them, because
 *  two adjacent lands of one rival still colour only that rival's raids. */
function seatScore(v: RulesView, actorFactionId: string, land: string): number {
  const raidable = new Set(validTargetsFor(v, actorFactionId, "raid"));
  const owners = new Set(
    (v.adjacency[land] ?? [])
      .map((adj) => v.incorporated[adj] ?? adj)
      .filter((owner) => raidable.has(owner)),
  );
  return owners.size;
}

/** The seat play both seat steps share, or null when the turn is better spent
 *  elsewhere: the widest-border legal land, ties on faction order like
 *  `settlementTarget` - and, while a seat already stands, only a STRICTLY
 *  better land is worth the coin. Equal is not a move: a policy that shuffles
 *  its seat between equivalent lands pays 1 wealth a turn for nothing, which
 *  is the "AI shuffling its seat" failure the design doc names first. */
function seatPlay(
  state: GameState,
  v: RulesView,
  actorFactionId: string,
  cardIndex: number,
): AiAction | null {
  const targets = validTargetsFor(v, actorFactionId, "seat-of-power");
  if (targets.length === 0) return null;
  const best = [...targets].sort(
    (a, b) =>
      seatScore(v, actorFactionId, b) - seatScore(v, actorFactionId, a) ||
      state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
  )[0];
  const current = seatOf(v, actorFactionId);
  if (
    current !== undefined &&
    seatScore(v, actorFactionId, best) <= seatScore(v, actorFactionId, current)
  ) {
    return null;
  }
  return { type: "play", cardIndex, targetId: best };
}

/** Deterministic policy v2; see the rules-v2 spec, "AI policy v2". Calls
 *  `playableSet` with no `discards` option on purpose: the "discard" verdict
 *  it can then return means "nothing playable" under any rule set, and
 *  `aiTakeTurn`'s unlimited loop relies on exactly that verdict as its stop
 *  signal, never acting on it as a real discard. */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(v, p.factionId, p.hand);
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);

  // 1: forced tribute. Forced cards leave no real choice; play the demand.
  const lord = state.overlords.get(p.factionId);
  if (lord !== undefined) {
    const tribute = set.cardIndexes.find((i) => isTributeCard(p.hand[i]));
    if (tribute !== undefined) return { type: "play", cardIndex: tribute };
  }

  // 2: revolt out of vassalage. A vassal CAN Subjugate and Incorporate now,
  // and revolt still outranks both deliberately: only free factions win, and
  // every forced tribute drains the treasury or feeds the lord. Freedom first.
  // Revolt carries no lead condition, and its parting +1/+1 cuts the lord's
  // lead, delaying re-subjugation. Playable exactly while subjugated, so
  // idxOf is the whole guard. A forced tribute still outranks it through
  // playableSet.
  const revolt = idxOf("revolt");
  if (revolt !== undefined) return { type: "play", cardIndex: revolt };

  // 2a: sow a revolt. Legality already restricts this to a vassal holding no
  // live Revolt, so there is nothing left to weigh: the sooner it is sown, the
  // sooner the escape becomes drawable, and every turn spent waiting is another
  // forced tribute feeding the lord's grip.
  const seeds = idxOf("seeds-of-revolt");
  if (seeds !== undefined) return { type: "play", cardIndex: seeds };

  // 3: incorporate the vassal whose digestion nets the most permanent land.
  // Incorporation keeps the target and its annexations for good, but frees
  // the target's own vassals (see playCard), so their subtrees are not a
  // gain - they are the price, and a pyramid big enough to outweigh the kept
  // land is worth more as vassalage than as one annexation.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    if (targets.length > 0) {
      // Kept land discounted by the odds of actually getting it: a failed
      // roll burns the only Incorporate in the deck, so a four-land vassal at
      // 20% is worth less than a one-land vassal at 100%. Holding the card
      // costs nothing and the loyalty clock only rises, so below MIN_ODDS the
      // policy waits rather than gambling the card away.
      const MIN_ODDS = 0.5;
      let best: string | null = null;
      // Starts at 0, so a digest that nets nothing or less is never picked -
      // the policy holds the card instead.
      let bestScore = 0;
      for (const t of targets) {
        const odds = incorporationChance(state, p.factionId, t);
        if (odds < MIN_ODDS) continue;
        const vassalsOfT = state.factionIds.filter(
          (f) => state.overlords.get(f) === t,
        );
        // realmOf counts t + its vassals + its annexations; dropping the
        // vassals leaves exactly the lands that turn permanent.
        const kept =
          realmOf(t, state.overlords, state.incorporated).length -
          vassalsOfT.length;
        const freed = vassalsOfT.reduce(
          (sum, f) =>
            sum + fullRealmOf(f, state.overlords, state.incorporated).size,
          0,
        );
        const score = odds * kept - freed;
        if (score > bestScore) {
          best = t;
          bestScore = score;
        }
      }
      if (best !== null) {
        return { type: "play", cardIndex: incorporate, targetId: best };
      }
    }
  }

  // 4: subjugate the biggest lead
  const subjugate = idxOf("subjugate");
  if (subjugate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "subjugate");
    if (targets.length > 0) {
      // Odds first, then lead. Taking a free faction always lands; prising one
      // off a rival is a coin flip that burns the only Subjugate in the deck.
      // A bigger lead never compensates for halving the chance, so the two are
      // ranked in order rather than multiplied together.
      let best = targets[0];
      let bestOdds = -1;
      let bestLead = -Infinity;
      for (const t of targets) {
        const odds = subjugationChance(v, t);
        const m = leadsIn(v, p.factionId, t);
        if (odds > bestOdds || (odds === bestOdds && m > bestLead)) {
          best = t;
          bestOdds = odds;
          bestLead = m;
        }
      }
      return { type: "play", cardIndex: subjugate, targetId: best };
    }
  }

  // 5: emergency defence, only against a threat that can subjugate this faction
  // now or after one more play. It sits below Subjugate because taking a vassal
  // is a certain gain that also raises this faction's own bar (realmOf grows,
  // so SUBJUGATE_THRESHOLD * realmOf(me) grows), and is therefore itself
  // defensive. It sits above the finishing raid because being subjugated costs
  // more than setting up next turn's conquest.
  const threats = threatsTo(v, p.factionId).filter((t) => t.shortfall <= 1);
  if (threats.length > 0) {
    const alliance = idxOf("alliance");
    if (alliance !== undefined) {
      const courtable = validTargetsFor(v, p.factionId, "alliance");
      // The own-vassal check is load-bearing: vassals can Subjugate, so your
      // own vassal with a lead appears in threatsTo, and sealing a pact with
      // it would freeze your own Incorporate for nothing. (No own-best-target
      // exclusion any more: a threat within one play leads this faction, so
      // on one shared Might counter it can never simultaneously be a legal
      // Subjugate target.)
      const pick = threats.find(
        (t) =>
          courtable.includes(t.factionId) &&
          state.overlords.get(t.factionId) !== p.factionId,
      );
      if (pick !== undefined) {
        return { type: "play", cardIndex: alliance, targetId: pick.factionId };
      }
    }

    const assassinate = idxOf("assassinate-ruler");
    if (assassinate !== undefined) {
      const legal = validTargetsFor(v, p.factionId, "assassinate-ruler");
      const order = (id: string): number => state.factionIds.indexOf(id);
      // Levelling Might helps only against a Might threat. Because such a
      // threat leads this faction on Might by definition, the card can never
      // destroy the actor's own lead here, so no separate guard is needed.
      // A guarded ruler is skipped: trading the card for the guard leaves the
      // threat standing, and the turn is worth more spent building.
      const pick = threats
        .filter(
          (t) =>
            t.shortfall <= 1 &&
            legal.includes(t.factionId) &&
            !holdsGuard(v, t.factionId, "bodyguard"),
        )
        .sort(
          (a, b) =>
            a.shortfall - b.shortfall || order(a.factionId) - order(b.factionId),
        )[0];
      if (pick !== undefined) {
        return { type: "play", cardIndex: assassinate, targetId: pick.factionId };
      }
    }
  }

  // 5b: lock a restive vassal's Revolt. Legality has already narrowed the
  // targets to this faction's own vassals holding a live Revolt with no
  // hostage taken, so the only question left is which. The Revolt can surface
  // any turn and fires the turn it does, while a threshold play (step 6) is
  // still there next turn - which is why this sits above the finishing plays
  // and below the emergencies: losing yourself outranks keeping a vassal.
  const hostage = idxOf("take-hostage");
  if (hostage !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "take-hostage");
    if (targets.length > 0) {
      // The vassal with the most land at stake: a revolt walks off with its
      // whole realm - subtree included, which is why this counts the FULL
      // realm - and the tribute it was paying. Ties by faction order, so
      // the pick is deterministic - the same convention settlementTarget uses.
      const best = [...targets].sort(
        (a, b) =>
          fullRealmOf(b, state.overlords, state.incorporated).size -
            fullRealmOf(a, state.overlords, state.incorporated).size ||
          state.factionIds.indexOf(a) - state.factionIds.indexOf(b),
      )[0];
      return { type: "play", cardIndex: hostage, targetId: best };
    }
  }

  // 6: one play away from the threshold
  {
    const i = idxOf("raid");
    if (i !== undefined) {
      for (const t of validTargetsFor(v, p.factionId, "raid")) {
        if (state.overlords.get(t) === p.factionId) continue;
        // The actor-aware bar, not grip + surcharge inlined: prowess lowers
        // it, and a pair the requirement rules out (a grand-liege, say) is
        // one there is no threshold to finish against.
        const needed = subjugationRequirement(v, p.factionId, t);
        if (needed === null) continue;
        if (
          leadsIn(v, p.factionId, t) +
            gainOf(state, p.factionId, "raid", t) >= needed
        ) {
          return { type: "play", cardIndex: i, targetId: t };
        }
      }
    }
  }

  // 7: defensive fan-out - Fortify against a rival holding a lead.
  {
    const i = idxOf("fortify");
    if (i !== undefined) {
      // Vassal rivals count: a vassal with the lead can Subjugate, so it is
      // exactly as much of a threat as a free one.
      const threatened = state.factionIds.some(
        (f) =>
          f !== p.factionId &&
          !(f in state.incorporated) &&
          leadsIn(v, f, p.factionId) >= 1,
      );
      if (threatened) return { type: "play", cardIndex: i };
    }
  }

  // 7b: settle a land while a threat is closing. A settlement adds 1 to the
  // lead anyone needs against this whole realm, permanently, which buys about
  // a turn against a rival who gains 1 a turn - so it is worth the turn only
  // once somebody is within two plays of taking this faction. An unthreatened
  // spare turn still settles, at step 9b, below the plays that resolve
  // something now.
  const settle = idxOf("found-settlement");
  if (settle !== undefined && threats.some((t) => t.shortfall <= 2)) {
    const target = settlementTarget(
      state, p.factionId, validTargetsFor(v, p.factionId, "found-settlement"),
    );
    if (target !== undefined) {
      return { type: "play", cardIndex: settle, targetId: target };
    }
  }

  // 7c: plant the seat while a threat is closing, for the same reason 7b
  // settles: +2 on the bar buys about two turns against a rival gaining 1 a
  // turn. Below 7b only because a settlement also feeds income; the ordering
  // between them is a preference, not a rule.
  const seat = idxOf("seat-of-power");
  if (seat !== undefined && threats.some((t) => t.shortfall <= 2)) {
    const play = seatPlay(state, v, p.factionId, seat);
    if (play !== null) return play;
  }

  // 8: read the omens before building. Raid is one per deck, so spending a
  // turn now and playing it doubled next turn beats playing it plain and
  // following with filler. Never while a vassal: a forced tribute would
  // spend every held reading on the overlord. This sits after step 6 so a
  // reading never delays a play that wins a subjugation outright.
  //
  // Readings stack, and this branch deliberately does not check whether one is
  // already held: the same trade holds a second time, and a "only when holding
  // none" guard would leave the redrawn copy legal but unwanted, which hands it
  // to the last-resort fallthrough - the failure POLICY_COVERAGE exists to stop.
  const omens = idxOf("favourable-omens");
  if (
    omens !== undefined &&
    state.overlords.get(p.factionId) === undefined &&
    p.hand.some((c) => DOUBLABLE_CARDS.has(c))
  ) {
    return { type: "play", cardIndex: omens };
  }

  // 8b: extend the next pact. Only with an Alliance in hand and somebody to
  // seal it with, and only having reached this tier, which means no emergency
  // alliance fired - the same rule the omens step follows: a setup card must
  // never delay a play that resolves something now. isCardPlayable already
  // refuses this while a boost is held.
  const extend = idxOf("extended-diplomacy");
  if (
    extend !== undefined &&
    p.hand.includes("alliance") &&
    validTargetsFor(v, p.factionId, "alliance").length > 0
  ) {
    return { type: "play", cardIndex: extend };
  }

  // 8c: post a guard, but only one that answers a position actually on the
  // board. `GUARD_CASES` holds the per-guard question; the shared conditions
  // are here. The Subjugate check is one of them: a turn that could instead
  // take a vassal is never worth a guard, whichever guard it is. An
  // `irrelevant` eligibility entry means out of reach, so it is also the reach
  // test inside each case.
  if (idxOf("subjugate") === undefined) {
    for (const guard of GUARD_CASES) {
      const i = idxOf(guard.cardId);
      if (i === undefined) continue;
      if (guard.worth(v, p.factionId, threats)) {
        return { type: "play", cardIndex: i };
      }
    }
  }

  // 8d: raise the population, but only when it would unlock something. A boom
  // is spent by the next Found a settlement whatever that settlement cost, so
  // playing one while a land is still legal to settle unaided throws the
  // allowance away on a settlement that never needed it. The test is therefore
  // not "do I hold a boom" but "is every land in my realm blocked by the
  // allowance rather than by the map" - a land the map has no dot left for is
  // one no boom can help.
  const boom = idxOf("population-boom");
  if (boom !== undefined && p.hand.includes("found-settlement")) {
    const lands = targetEligibilityFor(v, p.factionId, "found-settlement");
    const settleNow = lands.some((e) => e.state === "available");
    const wouldUnlock = lands.some(
      (e) =>
        e.state === "blocked" &&
        e.reasons.every((r) => r.code === "needs-population"),
    );
    if (!settleNow && wouldUnlock) return { type: "play", cardIndex: boom };
  }

  // 9: build toward the closest new subjugation, measured in plays remaining
  // rather than points - a 6-point gap closed 3 at a time is nearer than a
  // 4-point gap closed 1 at a time.
  let build: { cardIndex: number; targetId: string; plays: number; order: number } | null = null;
  const buildRaid = idxOf("raid");
  if (buildRaid !== undefined) {
    for (const t of validTargetsFor(v, p.factionId, "raid")) {
      if (state.overlords.get(t) === p.factionId) continue;
      // Same actor-aware bar as step 6, for the same reasons.
      const needed = subjugationRequirement(v, p.factionId, t);
      if (needed === null) continue;
      const deficit = needed - leadsIn(v, p.factionId, t);
      const plays = Math.ceil(deficit / gainOf(state, p.factionId, "raid", t));
      const order = state.factionIds.indexOf(t);
      if (
        build === null ||
        plays < build.plays ||
        (plays === build.plays && order < build.order)
      ) {
        build = { cardIndex: buildRaid, targetId: t, plays, order };
      }
    }
  }
  if (build !== null) {
    return { type: "play", cardIndex: build.cardIndex, targetId: build.targetId };
  }

  // 9b: no threat near and nothing to build toward - spend the turn on a
  // permanent bar rather than on turnips. Below step 9 because a lead that
  // wins a subjugation is worth more than a bar that delays one.
  if (settle !== undefined) {
    const target = settlementTarget(
      state, p.factionId, validTargetsFor(v, p.factionId, "found-settlement"),
    );
    if (target !== undefined) {
      return { type: "play", cardIndex: settle, targetId: target };
    }
  }

  // 9c: a spare turn plants (or upgrades) the seat: a permanent +2 bar and a
  // raid edge beat the slower builds below. `seatPlay` refuses a sideways
  // shuffle, so a standing seat on its best land leaves the copy in hand -
  // where, unlike the cards below, letting it wait is the honest policy: the
  // card's whole value is WHERE it lands, and there is nowhere better.
  if (seat !== undefined) {
    const play = seatPlay(state, v, p.factionId, seat);
    if (play !== null) return play;
  }

  // 9d: nothing to resolve, build toward, settle or seat - level the ruler.
  // Honest about the card's weight: the first PROWESS_PER_REDUCTION - 1
  // levels move no bar at all, so this must never pre-empt a play that moves
  // the map now. It outranks exactly one thing, turnips: permanent progress
  // toward cheaper Subjugates beats a card defined as no effect.
  // Unconditional at this depth on purpose - a cleverer gate would leave a
  // legal copy to the step-11 fallthrough, the exact failure POLICY_COVERAGE
  // exists to stop.
  const mighty = idxOf("mighty-ruler");
  if (mighty !== undefined) return { type: "play", cardIndex: mighty };

  // 9e: cash the harvest. A free boon strictly beats a turnip, and the pick
  // itself needs no policy: a choiceless playCard auto-resolves through
  // autoHarvestChoice. Only the human seat can ever hold one (the injection
  // is seat-gated), so this branch exists for the sim's policy-driven human
  // seat - and to keep the card out of the step-11 fallthrough.
  const harvest = idxOf("turnip-harvest");
  if (harvest !== undefined) return { type: "play", cardIndex: harvest };

  // 10: grow crops
  const grow = idxOf("grow-crops");
  if (grow !== undefined) return { type: "play", cardIndex: grow };

  // 11: first playable card as a last resort. Even here a target is not taken
  // blindly: an Alliance sealed with a faction this one could subjugate freezes
  // its own conquest for five turns, and the emergency step at 5 refuses such a
  // target for exactly that reason. Without this, the fallthrough undid that
  // exclusion - measured at 0.33 such pacts per world before it was added.
  const i0 = set.cardIndexes[0];
  const cardId = p.hand[i0];
  if (CARDS[cardId]?.targeted) {
    const legal = validTargetsFor(v, p.factionId, cardId);
    const mine = validTargetsFor(v, p.factionId, "subjugate");
    const targetId =
      cardId === "alliance"
        ? legal.find((t) => !mine.includes(t)) ?? legal[0]
        : legal[0];
    return { type: "play", cardIndex: i0, targetId };
  }
  return { type: "play", cardIndex: i0 };
}

/** Ceiling on plays per unlimited AI turn. The refill happens only at turn
 *  start, so the hand itself bounds the loop; the cap is belt-and-braces
 *  against a future card that adds cards to the hand mid-turn. */
const MAX_AI_PLAYS = 16;

/** One WHOLE turn for the current seat, in either mode - every caller wraps
 *  this in `advance`, so a partial turn here would stall the game. Under
 *  unlimited rules that means the same one-card policy consulted again on
 *  each updated state until it finds nothing playable: no new branches, so
 *  POLICY_COVERAGE is untouched, and no discards, so a `discard` verdict is
 *  the stop signal rather than an action. */
export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  if (state.rules.turn === "unlimited") {
    let g = state;
    for (let plays = 0; g.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
      const a = chooseAction(g);
      if (a.type === "discard") break;
      const next = playCard(g, a.cardIndex, rng, a.targetId);
      if (next === g) break; // a refused play must not spin
      g = next;
    }
    return endTurn(g);
  }
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId);
}
