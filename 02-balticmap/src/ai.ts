import {
  CARDS, DOUBLABLE_CARDS, isTributeCard, TRIBUTE_CARDS,
  type Rng, type TributeTrack,
} from "./cards";
import { leadsOf, realmOf } from "./relations";
import {
  omenMultiplier, playableSet, raidGainFor, subjugationGripOn,
  subjugationRequirement, poachSurchargeOn, subjugationChance,
  incorporationChance, targetEligibilityFor, threatsTo, validTargetsFor,
} from "./playability";
import { discardCard, playCard, viewOf, type GameState } from "./game";

export type AiAction =
  | { type: "play"; cardIndex: number; targetId?: string }
  | { type: "discard"; cardIndex: number };

const TRACKS = [
  { cardId: "raid", field: "might" as const },
  { cardId: "shrewd-marriage", field: "status" as const },
];

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
  "pay-military-tribute": "1: forced tribute, weaker track first",
  "pay-status-tribute": "1: forced tribute, weaker track first",
  "revolt": "2: revolt out of vassalage",
  "seeds-of-revolt": "2a: sow a revolt while a vassal",
  "incorporate": "3: incorporate the vassal with the best land-times-odds",
  "subjugate": "4: subjugate the biggest lead",
  "alliance": "5: emergency alliance",
  "assassinate-ruler": "5: emergency assassination",
  "raid": "6: finishing play, else 9: build toward the closest subjugation",
  "shrewd-marriage": "6: finishing play, else 9: build toward the closest subjugation",
  "fortify": "7: defensive fortify",
  "found-settlement":
    "7b: settle against a nearing threat, else 9b: settle a spare turn",
  "favourable-omens":
    "8: read the omens before building, stacking on a held reading",
  "extended-diplomacy": "8b: extend the next pact",
  "bodyguard": "8c: post a guard",
  "grow-crops": "10: grow crops",
};

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

/** Deterministic policy v2; see the rules-v2 spec, "AI policy v2". */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(v, p.factionId, p.hand);
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);

  // 1: forced tribute, feeding the overlord's weaker track. The track is the
  // card now, so this is a choice between the two tribute cards rather than a
  // choice made while playing one - and when only one of them is in hand there
  // is nothing to choose, which is the common case.
  const lord = state.overlords.get(p.factionId);
  if (lord !== undefined) {
    const l = leadsOf(state.relations, lord, p.factionId);
    const weaker: TributeTrack = l.status < l.might ? "status" : "might";
    const tributes = set.cardIndexes.filter((i) => isTributeCard(p.hand[i]));
    const preferred =
      tributes.find((i) => TRIBUTE_CARDS[p.hand[i]] === weaker) ?? tributes[0];
    if (preferred !== undefined) return { type: "play", cardIndex: preferred };
  }

  // 2: revolt out of vassalage. A vassal cannot Subjugate or Incorporate at all
  // and every forced tribute compounds the lord's lead against it, so no
  // vassal turn is better spent elsewhere. Revolt carries no lead condition,
  // and its parting +1/+1 cuts the lord's lead, delaying re-subjugation.
  // Playable exactly while subjugated, so idxOf is the whole guard. A forced
  // tribute still outranks it through playableSet.
  const revolt = idxOf("revolt");
  if (revolt !== undefined) return { type: "play", cardIndex: revolt };

  // 2a: sow a revolt. Legality already restricts this to a vassal holding no
  // live Revolt, so there is nothing left to weigh: the sooner it is sown, the
  // sooner the escape becomes drawable, and every turn spent waiting is another
  // forced tribute feeding the lord's grip.
  const seeds = idxOf("seeds-of-revolt");
  if (seeds !== undefined) return { type: "play", cardIndex: seeds };

  // 3: incorporate the vassal that brings the most land. Incorporation is
  // permanent and carries the vassal's own annexations with it, so realm size
  // is exactly the land gained - and land is the victory condition. Chains
  // cannot exist, so a vassal's realm is itself plus what it has annexed.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    if (targets.length > 0) {
      // Land gained, discounted by the odds of actually getting it: a failed
      // roll burns the only Incorporate in the deck, so a four-land vassal at
      // 20% is worth less than a one-land vassal at 100%. Holding the card
      // costs nothing and the loyalty clock only rises, so below MIN_ODDS the
      // policy waits rather than gambling the card away.
      const MIN_ODDS = 0.5;
      let best: string | null = null;
      let bestScore = -1;
      for (const t of targets) {
        const odds = incorporationChance(state, p.factionId, t);
        if (odds < MIN_ODDS) continue;
        const score = odds * realmOf(t, state.overlords, state.incorporated).length;
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
        const l = leadsOf(state.relations, p.factionId, t);
        const m = Math.max(l.status, l.might);
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
      const myTargets = validTargetsFor(v, p.factionId, "subjugate");
      // A pact blocks hostile targeted cards in BOTH directions, so allying
      // with your own best target freezes your own conquest for five turns.
      // The own-vassal check below is defence in depth, not load-bearing:
      // threatsTo already excludes any faction with an overlord (including
      // one of your own vassals) from ever appearing as a threat, since a
      // vassal cannot itself Subjugate.
      const pick = threats.find(
        (t) =>
          courtable.includes(t.factionId) &&
          !myTargets.includes(t.factionId) &&
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
      // Levelling Status helps only against a Status threat. Because such a
      // threat leads this faction on Status by definition, the card can never
      // destroy the actor's own lead here, so no separate guard is needed.
      // A guarded ruler is skipped: trading the card for the guard leaves the
      // threat standing, and the turn is worth more spent building.
      const pick = threats
        .filter(
          (t) =>
            t.statusShortfall <= 1 &&
            legal.includes(t.factionId) &&
            !state.bodyguards.includes(t.factionId),
        )
        .sort(
          (a, b) =>
            a.statusShortfall - b.statusShortfall ||
            order(a.factionId) - order(b.factionId),
        )[0];
      if (pick !== undefined) {
        return { type: "play", cardIndex: assassinate, targetId: pick.factionId };
      }
    }
  }

  // 6: one play away from the threshold
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      // Each track answers to its own bar, so a settled target is nearer on
      // Status than on Might and the policy must not measure both against one
      // number.
      const needed = subjugationGripOn(v, t)[field] + poachSurchargeOn(v, t);
      if (
        leadsOf(state.relations, p.factionId, t)[field] +
          gainOf(state, p.factionId, cardId, t) >= needed
      ) {
        return { type: "play", cardIndex: i, targetId: t };
      }
    }
  }

  // 7: defensive fortify
  const fortify = idxOf("fortify");
  if (fortify !== undefined) {
    const threatened = state.factionIds.some(
      (f) =>
        f !== p.factionId &&
        !(f in state.incorporated) &&
        !state.overlords.has(f) &&
        leadsOf(state.relations, f, p.factionId).might >= 1,
    );
    if (threatened) return { type: "play", cardIndex: fortify };
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

  // 8c: post a guard on a Status lead that cannot be cashed this turn. This is
  // exactly the position step 5's assassination hunts, so the guard answers a
  // threat the AI itself would make. A lead you can cash now needs no guard,
  // which is what the Subjugate check encodes. An `irrelevant` eligibility
  // entry means out of reach, so it is also the reach test.
  const bodyguard = idxOf("bodyguard");
  if (bodyguard !== undefined && idxOf("subjugate") === undefined) {
    const worthGuarding = targetEligibilityFor(v, p.factionId, "subjugate").some(
      (e) => {
        if (e.state === "irrelevant") return false;
        const required = subjugationRequirement(v, p.factionId, e.factionId);
        if (required === null) return false;
        return leadsOf(state.relations, p.factionId, e.factionId).status >=
          required.status;
      },
    );
    if (worthGuarding) return { type: "play", cardIndex: bodyguard };
  }

  // 9: build toward the closest new subjugation, measured in plays remaining
  // rather than points - a 6-point gap closed 3 at a time is nearer than a
  // 4-point gap closed 1 at a time.
  let build: { cardIndex: number; targetId: string; plays: number; order: number } | null = null;
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed = subjugationGripOn(v, t)[field] + poachSurchargeOn(v, t);
      const deficit = needed - leadsOf(state.relations, p.factionId, t)[field];
      const plays = Math.ceil(deficit / gainOf(state, p.factionId, cardId, t));
      const order = state.factionIds.indexOf(t);
      if (
        build === null ||
        plays < build.plays ||
        (plays === build.plays && order < build.order)
      ) {
        build = { cardIndex: i, targetId: t, plays, order };
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

export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId);
}
