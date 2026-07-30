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
  diplomacyBoost: string[]; // faction ids holding an unspent Extended diplomacy
  /** Factions whose land still has a free site to settle. Map-derived and
   *  static, like `adjacency`: a land's slot cap follows from its population,
   *  so which lands could ever be built in is not something play changes.
   *
   *  Faction ids, like every other id here - the map's region ids are a
   *  different id space and must be translated before they reach the rules. */
  sites: string[];
  /** Factions whose land has been settled this game. One site per land, so a
   *  list of faction ids is the whole state. */
  settled: string[];
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

/** What a faction's grip is made of: the lands of its realm, and the
 *  settlements founded in them. */
export interface GripParts {
  lands: number;
  settlements: number;
  /** The lead the two together demand: `2 * lands + settlements`. */
  bar: number;
}

/** The lands and settlements behind a faction's grip. Returned as parts rather
 *  than only the total because the number cannot be taken apart again
 *  afterwards: the tooltip used to recover the land count by dividing the bar
 *  by two, which a settlement makes wrong. */
export function gripPartsOn(view: RulesView, factionId: string): GripParts {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const lands = realm.length;
  const settlements = realm.filter((m) => view.settled.includes(m)).length;
  return { lands, settlements, bar: SUBJUGATE_THRESHOLD * lands + settlements };
}

/** The lead anyone needs against this faction: two per land of its realm,
 *  counting its vassals and the lands it has incorporated, plus one per
 *  settlement founded in any of those lands.
 *
 *  Bare arithmetic with no eligibility guards, because two callers need it
 *  that way: `subjugationRequirement` applies the guards itself, and the
 *  notices ask "what lead does anyone need against my realm" with no
 *  particular rival in mind. */
export function subjugationGripOn(
  view: RulesView,
  factionId: string,
): number {
  return gripPartsOn(view, factionId).bar;
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
      /** Settlements founded in that realm, each adding 1 to requiredLead. */
      settlements: number;
    }
  | { code: "already-vassal" }
  | { code: "already-settled" }
  | { code: "no-free-site" }
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
  // Found a settlement is aimed at your own realm, so neither the pact block
  // nor the self and incorporated blocks apply to it: your own land and the
  // lands you have annexed are exactly what it is for.
  const inward = cardId === "found-settlement";
  const hostile = cardId !== "alliance" && !inward;
  const ownRealm = inward
    ? realmOf(actorFactionId, view.overlords, view.incorporated)
    : [];

  return view.factionIds.map((factionId): TargetEligibility => {
    const specialOverlord =
      (cardId === "shrewd-marriage" || cardId === "alliance") &&
      factionId === actorOverlord;
    const relevant = inward
      ? ownRealm.includes(factionId)
      : cardId === "incorporate" || reach.has(factionId) || specialOverlord;
    if (!relevant) return { state: "irrelevant", factionId };

    const reasons: TargetBlockReason[] = [];
    if (factionId === actorFactionId && !inward) reasons.push({ code: "self" });
    if (factionId in view.incorporated && !inward) {
      reasons.push({ code: "incorporated" });
    }
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
      const grip = gripPartsOn(view, factionId);
      const lead = leadsOf(view.relations, actorFactionId, factionId);
      if (Math.max(lead.status, lead.might) < grip.bar) {
        reasons.push({
          code: "insufficient-lead",
          requiredLead: grip.bar,
          mightLead: lead.might,
          statusLead: lead.status,
          realmSize: grip.lands,
          settlements: grip.settlements,
        });
      }
    }

    if (inward && !view.sites.includes(factionId)) {
      reasons.push({ code: "no-free-site" });
    } else if (inward && view.settled.includes(factionId)) {
      reasons.push({ code: "already-settled" });
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
  if (cardId === "grow-crops" || cardId === "fortify") return true;
  if (cardId === "bodyguard") return !view.bodyguards.includes(factionId);
  if (cardId === "favourable-omens") return !view.omens.includes(factionId);
  if (cardId === "extended-diplomacy") return !view.diplomacyBoost.includes(factionId);
  if (cardId === "pay-tribute") return overlord !== undefined;
  if (cardId === "revolt") return overlord !== undefined;
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
