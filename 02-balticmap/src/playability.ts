import { CARDS } from "./cards";
import {
  allianceActive, allianceKey, leadsOf, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export const SUBJUGATE_THRESHOLD = 2;

/** The slice of game state the rules need. GameState satisfies this
 *  structurally; tests build it directly. */
export interface RulesView {
  relations: Relations;
  overlords: Overlords; // stored vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // faction id -> adjacent faction ids
  factionIds: string[];
  alliances: Record<string, number>; // sorted-pair key -> expiry turn
  turn: number;
  bodyguards: string[]; // faction ids holding an unused Bodyguard guard
  omens: string[]; // faction ids holding an unspent Favourable omens reading
}

function reachOf(view: RulesView, factionId: string): Set<string> {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) {
      reach.add(view.incorporated[adj] ?? adj);
    }
  }
  return reach;
}

/** How many lands of the actor's realm border the target's core - the target
 *  itself, or a land the target has incorporated. The target's vassals resolve
 *  to themselves, not to their lord.
 *
 *  This mirrors `reachOf`'s `incorporated[adj] ?? adj` resolution deliberately.
 *  Because legality and this number come from the same rule, a Raid that the
 *  rules allow always has at least one bordering land, so the gain is never 0
 *  and the number on the tooltip can never contradict the target being
 *  offered. */
export function borderStrength(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): number {
  const realm = realmOf(actorFactionId, view.overlords, view.incorporated);
  return realm.filter((member) =>
    (view.adjacency[member] ?? []).some(
      (adj) => (view.incorporated[adj] ?? adj) === targetFactionId,
    ),
  ).length;
}

/** The lead anyone needs against this faction: two per land of its realm,
 *  counting its vassals and the lands it has incorporated.
 *
 *  Bare arithmetic with no eligibility guards, because two callers need it
 *  that way: `subjugationRequirement` applies the guards itself, and the
 *  notices ask "what lead does anyone need against my realm" with no
 *  particular rival in mind. */
export function subjugationGripOn(
  view: RulesView,
  factionId: string,
): number {
  return (
    SUBJUGATE_THRESHOLD *
    realmOf(factionId, view.overlords, view.incorporated).length
  );
}

/** The lead the actor needs on either track to Subjugate the target: two per
 *  land of the target's realm, counting its vassals and the lands it has
 *  incorporated. Null when Subjugate could never apply to that pair at all,
 *  so callers can leave the bar off rather than quote a meaningless number.
 *
 *  Same rule as the `insufficient-lead` block reason, kept here so the map
 *  and the tooltip can show the bar without re-deriving it. */
export function subjugationRequirement(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): number | null {
  if (targetFactionId === actorFactionId) return null;
  if (targetFactionId in view.incorporated) return null;
  if (view.overlords.get(targetFactionId) === actorFactionId) return null;
  if (view.overlords.get(actorFactionId) !== undefined) return null;
  return subjugationGripOn(view, targetFactionId);
}

export interface Threat {
  factionId: string;
  /** Lead this faction still needs on its best track. <= 0 means it can act now. */
  shortfall: number;
  statusShortfall: number;
  mightShortfall: number;
}

/** Every faction that could Subjugate `factionId` if only its lead were high
 *  enough, with how much lead each still needs. Sorted by shortfall ascending,
 *  ties by faction order.
 *
 *  Legality comes from `targetEligibilityFor` rather than being re-derived: a
 *  candidate counts only when this faction's entry is `available` (it can act
 *  now) or blocked by nothing except `insufficient-lead`. Reach, active pacts,
 *  the candidate being someone's vassal and this faction already being its
 *  vassal are therefore all handled in one place.
 *
 *  Four policy steps ask this question - Alliance, Assassinate ruler, Bodyguard
 *  and Fortify - which is why it lives here as one unit instead of four
 *  inlined copies in the AI. */
export function threatsTo(view: RulesView, factionId: string): Threat[] {
  const out: Threat[] = [];
  for (const other of view.factionIds) {
    if (other === factionId) continue;
    const required = subjugationRequirement(view, other, factionId);
    if (required === null) continue;
    const entry = targetEligibilityFor(view, other, "subjugate").find(
      (e) => e.factionId === factionId,
    );
    if (entry === undefined || entry.state === "irrelevant") continue;
    if (
      entry.state === "blocked" &&
      !(entry.reasons.length === 1 && entry.reasons[0].code === "insufficient-lead")
    ) {
      continue;
    }
    const lead = leadsOf(view.relations, other, factionId);
    out.push({
      factionId: other,
      shortfall: required - Math.max(lead.status, lead.might),
      statusShortfall: required - lead.status,
      mightShortfall: required - lead.might,
    });
  }
  const order = (id: string): number => view.factionIds.indexOf(id);
  return out.sort(
    (a, b) =>
      a.shortfall - b.shortfall || order(a.factionId) - order(b.factionId),
  );
}

export type TargetBlockReason =
  | { code: "alliance"; expiresTurn: number }
  | {
      code: "insufficient-lead";
      requiredLead: number;
      mightLead: number;
      statusLead: number;
      realmSize: number;
    }
  | { code: "already-vassal" }
  | { code: "actor-subjugated" }
  | { code: "overlord-prohibited" }
  | { code: "incorporated" }
  | { code: "self" }
  | { code: "not-your-vassal" };

export type TargetEligibility =
  | { state: "irrelevant"; factionId: string }
  | { state: "available"; factionId: string }
  | {
      state: "blocked";
      factionId: string;
      reasons: TargetBlockReason[];
    };

function allianceExpiry(
  view: RulesView,
  actor: string,
  candidate: string,
): number | undefined {
  const expiry = view.alliances[allianceKey(actor, candidate)];
  return expiry !== undefined && allianceActive(view, actor, candidate)
    ? expiry
    : undefined;
}

/** Structured eligibility for every faction, in faction order. */
export function targetEligibilityFor(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
): TargetEligibility[] {
  if (!CARDS[cardId]?.targeted) {
    return view.factionIds.map((factionId) => ({
      state: "irrelevant",
      factionId,
    }));
  }

  const actorOverlord = view.overlords.get(actorFactionId);
  const reach = reachOf(view, actorFactionId);
  const hostile = cardId !== "alliance";

  return view.factionIds.map((factionId): TargetEligibility => {
    const specialOverlord =
      (cardId === "shrewd-marriage" || cardId === "alliance") &&
      factionId === actorOverlord;
    const relevant = cardId === "incorporate" || reach.has(factionId) ||
      specialOverlord;
    if (!relevant) return { state: "irrelevant", factionId };

    const reasons: TargetBlockReason[] = [];
    if (factionId === actorFactionId) reasons.push({ code: "self" });
    if (factionId in view.incorporated) reasons.push({ code: "incorporated" });
    if (
      actorOverlord !== undefined &&
      (cardId === "subjugate" || cardId === "incorporate")
    ) {
      reasons.push({ code: "actor-subjugated" });
    }
    if (
      factionId === actorOverlord &&
      (cardId === "raid" || cardId === "assassinate-ruler")
    ) {
      reasons.push({ code: "overlord-prohibited" });
    }
    if (
      cardId === "subjugate" &&
      view.overlords.get(factionId) === actorFactionId
    ) {
      reasons.push({ code: "already-vassal" });
    } else if (
      cardId === "incorporate" &&
      view.overlords.get(factionId) !== actorFactionId
    ) {
      reasons.push({ code: "not-your-vassal" });
    }

    const expiry = allianceExpiry(view, actorFactionId, factionId);
    if (hostile && expiry !== undefined) {
      reasons.push({ code: "alliance", expiresTurn: expiry });
    }

    if (cardId === "subjugate") {
      const realmSize =
        realmOf(factionId, view.overlords, view.incorporated).length;
      const requiredLead = SUBJUGATE_THRESHOLD * realmSize;
      const lead = leadsOf(view.relations, actorFactionId, factionId);
      if (Math.max(lead.status, lead.might) < requiredLead) {
        reasons.push({
          code: "insufficient-lead",
          requiredLead,
          mightLead: lead.might,
          statusLead: lead.status,
          realmSize,
        });
      }
    }

    return reasons.length === 0
      ? { state: "available", factionId }
      : { state: "blocked", factionId, reasons };
  });
}

/** Valid targets for a targeted card, in faction order. */
export function validTargetsFor(
  view: RulesView,
  factionId: string,
  cardId: string,
): string[] {
  if (!CARDS[cardId]?.targeted) return [];
  return targetEligibilityFor(view, factionId, cardId)
    .filter(
      (entry): entry is Extract<TargetEligibility, { state: "available" }> =>
        entry.state === "available",
    )
    .map((entry) => entry.factionId);
}

export function isCardPlayable(
  view: RulesView,
  factionId: string,
  cardId: string,
): boolean {
  const card = CARDS[cardId];
  if (!card) return false;
  const overlord = view.overlords.get(factionId);
  if (cardId === "grow-crops" || cardId === "fortify" || cardId === "extended-diplomacy") return true;
  if (cardId === "bodyguard") return !view.bodyguards.includes(factionId);
  if (cardId === "favourable-omens") return !view.omens.includes(factionId);
  if (cardId === "pay-tribute") return overlord !== undefined;
  if (cardId === "revolt") return overlord !== undefined;
  if (cardId === "reclaim-independence") {
    if (overlord === undefined) return false;
    const l = leadsOf(view.relations, overlord, factionId);
    // The overlord's realm always includes factionId itself (as its vassal);
    // the grip strength is the overlord's OTHER holdings, excluding the
    // very vassal weighing whether to leave.
    const overlordRealm = realmOf(overlord, view.overlords, view.incorporated)
      .filter((id) => id !== factionId);
    const grip = SUBJUGATE_THRESHOLD * overlordRealm.length;
    return l.status < grip && l.might < grip;
  }
  if (card.targeted) return validTargetsFor(view, factionId, cardId).length > 0;
  return false;
}

export interface PlayableSet {
  mode: "play" | "discard";
  cardIndexes: number[];
}

/** Which hand indexes may be played this turn. Forced cards (Pay Tribute)
 *  monopolize the set; an empty playable set means a forced discard of any
 *  card in hand. */
export function playableSet(
  view: RulesView,
  factionId: string,
  hand: string[],
): PlayableSet {
  const forced: number[] = [];
  hand.forEach((c, i) => {
    if (CARDS[c]?.forced && isCardPlayable(view, factionId, c)) forced.push(i);
  });
  if (forced.length > 0) return { mode: "play", cardIndexes: forced };
  const playable: number[] = [];
  hand.forEach((c, i) => {
    if (!CARDS[c]?.forced && isCardPlayable(view, factionId, c)) playable.push(i);
  });
  if (playable.length > 0) return { mode: "play", cardIndexes: playable };
  return { mode: "discard", cardIndexes: hand.map((_, i) => i) };
}
