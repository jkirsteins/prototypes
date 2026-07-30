import { CARDS, DOUBLABLE_CARDS, type Rng } from "./cards";
import { leadsOf, realmOf } from "./relations";
import {
  SUBJUGATE_THRESHOLD, borderStrength, playableSet, threatsTo, validTargetsFor,
} from "./playability";
import {
  discardCard, playCard, viewOf,
  type GameState, type TributeTrack,
} from "./game";

export type AiAction =
  | { type: "play"; cardIndex: number; targetId?: string; tributeTrack?: TributeTrack }
  | { type: "discard"; cardIndex: number };

const TRACKS = [
  { cardId: "raid", field: "might" as const },
  { cardId: "shrewd-marriage", field: "status" as const },
];

/** What a play would actually move, so the policy stops assuming every card
 *  is worth exactly 1: Raid scales with border, and any doublable card is
 *  worth twice as much while a reading is held. */
function gainOf(
  state: GameState,
  actorFactionId: string,
  cardId: string,
  targetId: string,
): number {
  const base =
    cardId === "raid"
      ? borderStrength(viewOf(state), actorFactionId, targetId)
      : 1;
  const doubled =
    state.omens.includes(actorFactionId) && DOUBLABLE_CARDS.has(cardId);
  return doubled ? base * 2 : base;
}

/** Deterministic policy v2; see the rules-v2 spec, "AI policy v2". */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(v, p.factionId, p.hand);
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);

  // 1: forced tribute, feeding the overlord's weaker track
  const tribute = idxOf("pay-tribute");
  if (tribute !== undefined) {
    const lord = state.overlords.get(p.factionId)!;
    const l = leadsOf(state.relations, lord, p.factionId);
    const track: TributeTrack = l.status < l.might ? "status" : "might";
    return { type: "play", cardIndex: tribute, tributeTrack: track };
  }

  // 2: revolt out of vassalage. A vassal cannot Subjugate or Incorporate at all
  // and every forced Pay tribute compounds the lord's lead against it, so no
  // vassal turn is better spent elsewhere. Revolt carries no lead condition,
  // and its parting +1/+1 cuts the lord's lead, delaying re-subjugation.
  // Playable exactly while subjugated, so idxOf is the whole guard. A forced
  // Pay tribute still outranks it through playableSet.
  const revolt = idxOf("revolt");
  if (revolt !== undefined) return { type: "play", cardIndex: revolt };

  // 3: incorporate the vassal that brings the most land. Incorporation is
  // permanent and carries the vassal's own annexations with it, so realm size
  // is exactly the land gained - and land is the victory condition. Chains
  // cannot exist, so a vassal's realm is itself plus what it has annexed.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    if (targets.length > 0) {
      let best = targets[0];
      let bestSize = -1;
      for (const t of targets) {
        const size = realmOf(t, state.overlords, state.incorporated).length;
        if (size > bestSize) {
          best = t;
          bestSize = size;
        }
      }
      return { type: "play", cardIndex: incorporate, targetId: best };
    }
  }

  // 4: subjugate the biggest lead
  const subjugate = idxOf("subjugate");
  if (subjugate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "subjugate");
    if (targets.length > 0) {
      let best = targets[0];
      let bestLead = -Infinity;
      for (const t of targets) {
        const l = leadsOf(state.relations, p.factionId, t);
        const m = Math.max(l.status, l.might);
        if (m > bestLead) {
          best = t;
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
  }

  // 5: one play away from the threshold
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(t, state.overlords, state.incorporated).length;
      if (
        leadsOf(state.relations, p.factionId, t)[field] +
          gainOf(state, p.factionId, cardId, t) >= needed
      ) {
        return { type: "play", cardIndex: i, targetId: t };
      }
    }
  }

  // 6: defensive fortify
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

  // 6b: read the omens before building. Raid is one per deck, so spending a
  // turn now and playing it doubled next turn beats playing it plain and
  // following with filler. Never while a vassal: a forced Pay tribute would
  // spend the reading on the overlord. This sits after step 5 so a reading
  // never delays a play that wins a subjugation outright.
  const omens = idxOf("favourable-omens");
  if (
    omens !== undefined &&
    state.overlords.get(p.factionId) === undefined &&
    p.hand.some((c) => DOUBLABLE_CARDS.has(c))
  ) {
    return { type: "play", cardIndex: omens };
  }

  // 7: build toward the closest new subjugation, measured in plays remaining
  // rather than points - a 6-point gap closed 3 at a time is nearer than a
  // 4-point gap closed 1 at a time.
  let build: { cardIndex: number; targetId: string; plays: number; order: number } | null = null;
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(t, state.overlords, state.incorporated).length;
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

  // 8: grow crops
  const grow = idxOf("grow-crops");
  if (grow !== undefined) return { type: "play", cardIndex: grow };

  // 9: first playable card as a last resort
  const i0 = set.cardIndexes[0];
  const cardId = p.hand[i0];
  if (CARDS[cardId]?.targeted) {
    return {
      type: "play", cardIndex: i0,
      targetId: validTargetsFor(v, p.factionId, cardId)[0],
    };
  }
  return { type: "play", cardIndex: i0 };
}

export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId, a.tributeTrack);
}
