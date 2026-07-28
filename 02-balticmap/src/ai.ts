import { CARDS, type Rng } from "./cards";
import { leadsOf, realmOf } from "./relations";
import {
  SUBJUGATE_THRESHOLD, playableSet, validTargetsFor,
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

  // 2: reclaim independence
  const reclaim = idxOf("reclaim-independence");
  if (reclaim !== undefined) return { type: "play", cardIndex: reclaim };

  // 3: incorporate the first vassal in faction order
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const t = validTargetsFor(v, p.factionId, "incorporate")[0];
    if (t !== undefined) return { type: "play", cardIndex: incorporate, targetId: t };
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

  // 5: one play away from the threshold
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(t, state.overlords, state.incorporated).length;
      if (leadsOf(state.relations, p.factionId, t)[field] === needed - 1) {
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

  // 7: build toward the closest new subjugation
  let build: { cardIndex: number; targetId: string; deficit: number; order: number } | null = null;
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(t, state.overlords, state.incorporated).length;
      const deficit = needed - leadsOf(state.relations, p.factionId, t)[field];
      const order = state.factionIds.indexOf(t);
      if (
        build === null ||
        deficit < build.deficit ||
        (deficit === build.deficit && order < build.order)
      ) {
        build = { cardIndex: i, targetId: t, deficit, order };
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
