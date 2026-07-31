import { CARDS, DOUBLABLE_CARDS, isTributeCard } from "./cards";
import {
  allianceActive, allianceKey, leadsOf, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export const SUBJUGATE_THRESHOLD = 2;

/** Annexed lands per +1 Might their owner gains against everyone, once per
 *  turn. See `passiveFortifyFor`. */
export const PASSIVE_PER_LANDS = 4;

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
  /** `${land}|${lord}` -> consecutive turns that lord has held that land as a
   *  vassal. Drives the Incorporate odds. Absent key means 0. */
  loyalty: Record<string, number>;
  /** Factions holding a live Revolt card somewhere in deck, hand or discard.
   *  Seeds of revolt refuses to sow a second one, so the rules need to know;
   *  modelled as a faction-id list like `bodyguards` and `omens` rather than
   *  giving RulesView a view of the piles. */
  liveRevolts: string[];
}

/** Turns of unbroken vassalage after which Incorporate is certain. Below it the
 *  card rolls `loyalty / INCORPORATE_RAMP`, so a fresh conquest is a gamble and
 *  a long-held one is a formality. Measured at 5: at 15 and 30 the map stopped
 *  consolidating entirely and vassals just circulated between poachers. */
export const INCORPORATE_RAMP = 5;

/** Chance a Subjugate aimed at somebody else's vassal lands. Taking a free
 *  faction is never a gamble - the roll exists to defend an existing vassalage,
 *  not to tax expansion. */
export const POACH_CHANCE = 0.5;

/** `${land}|${lord}` key for the loyalty clock. */
export const loyaltyKey = (land: string, lord: string): string =>
  `${land}|${lord}`;

export function loyaltyOf(
  view: { loyalty: Record<string, number> },
  land: string,
  lord: string,
): number {
  return view.loyalty[loyaltyKey(land, lord)] ?? 0;
}

/** The odds an Incorporate of `land` by `lord` succeeds, in [0, 1]. */
export function incorporationChance(
  view: { loyalty: Record<string, number> },
  lord: string,
  land: string,
): number {
  return Math.min(1, loyaltyOf(view, land, lord) / INCORPORATE_RAMP);
}

/** The odds a Subjugate of `target` lands: certain unless it is a poach. */
export function subjugationChance(view: RulesView, target: string): number {
  return view.overlords.has(target) ? POACH_CHANCE : 1;
}

/** The incumbent overlord's hold on a vassal: the larger of their two leads
 *  over it, 0 when it is nobody's vassal. */
export function overlordGrip(view: RulesView, targetFactionId: string): number {
  const lord = view.overlords.get(targetFactionId);
  if (lord === undefined) return 0;
  const l = leadsOf(view.relations, lord, targetFactionId);
  return Math.max(0, l.status, l.might);
}

/** What a poacher pays on top of the base grip: half the incumbent's hold,
 *  rounded up. Tribute therefore defends a vassalage against rivals as well as
 *  feeding its lord. Half rather than all of it deliberately - at the full grip
 *  poaching all but vanished (0.1% of endings), which deletes an interaction
 *  rather than pricing it. */
export function poachSurchargeOn(
  view: RulesView,
  targetFactionId: string,
): number {
  return Math.ceil(overlordGrip(view, targetFactionId) / 2);
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

/** Raid's Might yield for `borderLands` of the actor's realm on the target's
 *  border: the first bordering land is worth 1, the second 2, the third 3, and
 *  so on.
 *
 *  Convex rather than linear because realm size otherwise buys no accumulation
 *  rate at all. The Subjugate bar scales with the *defender's* realm, so your
 *  last rival is always the largest faction left; but a lead is a pairwise
 *  difference, and every other lead-gaining card is a flat +1. Two peers
 *  therefore gain at the same rate, their difference random-walks near zero,
 *  and a bar of 20-plus is never reached. Measured on 2026-07-30: 13.5% of
 *  worlds never resolved inside 300 turns, every one of them a two-bloc endgame
 *  one or two lands short with a median pairwise lead of exactly 0.
 *
 *  `borderLands = 1` is unchanged at 1, so the early game - where nearly every
 *  faction holds a single land - plays exactly as it did. The convexity only
 *  bites once several of your lands touch the same target, which is to say once
 *  you are already large. That is the intent expressed on the accumulation side
 *  rather than by lowering the bar, which would have broken the single
 *  realm-wide grip number the HUD and notices both quote. */
export function raidYield(borderLands: number): number {
  return (borderLands * (borderLands + 1)) / 2;
}

/** Whether a Favourable omens reading would double this card for this faction:
 *  a reading is held AND the card is one a reading can double.
 *
 *  Four places ask it - `playCard` spends the reading on it, the AI policy
 *  scores through it, the card tip names it and the map preview quotes the
 *  doubled number - and it was written out longhand at each. That is the shape
 *  a rule drifts in: the card tip's copy dropped the `DOUBLABLE_CARDS` half
 *  and only stayed correct because its one caller had already narrowed to
 *  Raid. */
export function isDoubled(
  view: { omens: string[] },
  factionId: string,
  cardId: string,
): boolean {
  return view.omens.includes(factionId) && DOUBLABLE_CARDS.has(cardId);
}

/** The Might a Raid on this target would actually add, doubling included, and
 *  whether a reading paid for half of it. `playCard` resolves the raid with
 *  this, so the number the player is shown before aiming is by construction
 *  the number they get. */
export function raidGainFor(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): { gain: number; doubled: boolean } {
  const doubled = isDoubled(view, actorFactionId, "raid");
  const gain = raidYield(borderStrength(view, actorFactionId, targetFactionId));
  return { gain: doubled ? gain * 2 : gain, doubled };
}

/** Lands this faction has permanently annexed. Counted straight off
 *  `incorporated` rather than by filtering `realmOf`, because the two agree by
 *  construction: `realmOf`'s incorporated portion is exactly these entries. */
export function annexedLandsOf(view: RulesView, factionId: string): number {
  return Object.values(view.incorporated).filter((o) => o === factionId).length;
}

/** The standing Might an annexed realm earns its owner against every living
 *  faction, once per turn: `floor(annexed / PASSIVE_PER_LANDS)`.
 *
 *  Annexation otherwise silences a land completely - `advance` skips any seat
 *  whose faction is incorporated, and only *vassals* pay tribute - so a
 *  fourteen-land realm took exactly one action per round, the same as a
 *  one-land minnow. Conquest raised your own grip and your victory count and
 *  did nothing at all for your rate of gain. This is what makes size buy tempo.
 *
 *  Deliberately deterministic, so it consumes no rng: a seeded stream stays
 *  aligned with the committed fixture, and a band that moves has moved because
 *  behaviour changed rather than because draw order shifted. It is also why
 *  Favourable omens cannot touch it - see `beginTurn`, which applies this
 *  outside the card path entirely.
 *
 *  Known wart: `floor` plateaus, so at PASSIVE_PER_LANDS = 4 realms of 12 and
 *  15 annexed lands both yield +3 and drift nothing against each other. Near
 *  ties are broken by `raidYield`, not by this; this carries the broad
 *  size-buys-tempo intent. If measurement ever shows the passive has to break
 *  ties on its own, the fix is a per-faction remainder accumulator, not a
 *  smaller divisor. */
export function passiveFortifyFor(view: RulesView, factionId: string): number {
  return Math.floor(annexedLandsOf(view, factionId) / PASSIVE_PER_LANDS);
}

/** The lead a Subjugate needs, one bar per track. The two are separate because
 *  a settlement is garrisoned ground: it walls off the Might route only.
 *
 *  The asymmetry is deliberate and it runs the other way on the accumulation
 *  side. Might is the fast track - `raidYield` is convex in bordering lands and
 *  `passiveFortifyFor` pays every turn for nothing - so it meets the taller
 *  wall. Status climbs at +1 a play from a single Shrewd marriage per deck, so
 *  it faces the shorter one. A settled realm is therefore soft to a patient
 *  Status siege, and that is the tell the player is meant to read. */
export interface TrackBars {
  might: number;
  status: number;
}

/** What a faction's grip is made of: the lands of its realm, the settlements
 *  founded in them, and the bar each track demands. */
export interface GripParts extends TrackBars {
  lands: number;
  settlements: number;
}

/** The lands and settlements behind a faction's grip. Returned as parts rather
 *  than only the totals because a bar cannot be taken apart again afterwards:
 *  the tooltip used to recover the land count by dividing the bar by two, which
 *  a settlement makes wrong. */
export function gripPartsOn(view: RulesView, factionId: string): GripParts {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const lands = realm.length;
  const settlements = realm.filter((m) => view.settled.includes(m)).length;
  const base = SUBJUGATE_THRESHOLD * lands;
  return { lands, settlements, might: base + settlements, status: base };
}

/** The lead anyone needs against this faction: two per land of its realm,
 *  counting its vassals and the lands it has incorporated, plus - on the Might
 *  track alone - one per settlement founded in any of those lands.
 *
 *  Bare arithmetic with no eligibility guards, because two callers need it
 *  that way: `subjugationRequirement` applies the guards itself, and the
 *  notices ask "what lead does anyone need against my realm" with no
 *  particular rival in mind. */
export function subjugationGripOn(
  view: RulesView,
  factionId: string,
): TrackBars {
  const { might, status } = gripPartsOn(view, factionId);
  return { might, status };
}

/** True once either track's lead has reached its own bar. Subjugate has always
 *  needed one track cleared, not both; with per-track bars the comparison can
 *  no longer be `max(lead) >= bar`, so it lives here once rather than being
 *  spelled out at each of its call sites. */
export function clearsBars(
  lead: { status: number; might: number },
  bars: TrackBars,
): boolean {
  return lead.might >= bars.might || lead.status >= bars.status;
}

/** The poach surcharge lands on both bars. It prices the incumbent lord's hold
 *  on a vassal, which is a fact about the lord rather than about a track. */
function withSurcharge(bars: TrackBars, surcharge: number): TrackBars {
  return { might: bars.might + surcharge, status: bars.status + surcharge };
}


/** The lead the actor needs on each track to Subjugate the target: two per
 *  land of the target's realm, counting its vassals and the lands it has
 *  incorporated, plus one per settlement on the Might track, plus the poach
 *  surcharge on both when the target already has a lord. Null when Subjugate
 *  could never apply to that pair at all, so callers can leave the bars off
 *  rather than quote meaningless numbers.
 *
 *  Same rule as the `insufficient-lead` block reason, kept here so the map
 *  and the tooltip can show the bars without re-deriving them. */
export function subjugationRequirement(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): TrackBars | null {
  if (targetFactionId === actorFactionId) return null;
  if (targetFactionId in view.incorporated) return null;
  if (view.overlords.get(targetFactionId) === actorFactionId) return null;
  if (view.overlords.get(actorFactionId) !== undefined) return null;
  return withSurcharge(
    subjugationGripOn(view, targetFactionId),
    poachSurchargeOn(view, targetFactionId),
  );
}

export interface Threat {
  factionId: string;
  /** Lead this faction still needs on its nearest track, each track measured
   *  against its own bar. <= 0 means it can act now. */
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
    const statusShortfall = required.status - lead.status;
    const mightShortfall = required.might - lead.might;
    out.push({
      factionId: other,
      shortfall: Math.min(statusShortfall, mightShortfall),
      statusShortfall,
      mightShortfall,
    });
  }
  const order = (id: string): number => view.factionIds.indexOf(id);
  return out.sort(
    (a, b) =>
      a.shortfall - b.shortfall || order(a.factionId) - order(b.factionId),
  );
}

/** One track of one rival's subjugation race, as the map badge quotes it. */
export interface TrackRace {
  /** The human's signed lead on this track, positive means the human leads -
   *  the same convention as `formatLead`, the scoreboard and the round
   *  summary. */
  lead: number;
  /** The bar that lead is racing. The bars are asymmetric, each counting the
   *  realm of the side being taken, so a track showing both against the
   *  player's bar quotes the wrong number the moment the rival is the one
   *  leading. The sign of the lead already says who is running, so it also
   *  says whose bar applies. Null where the leading side could never subjugate
   *  the other, and the track shows no denominator. */
  bar: number | null;
  /** Whose realm `bar` counts: the side that would be TAKEN. Anything
   *  itemising a bar has to itemise this realm, which is not always the
   *  faction under the cursor. A dead-even track (lead 0) goes to the human,
   *  which is what the badge has always shown. */
  takenFactionId: string;
}

/** Both tracks of one rival's subjugation race against the human.
 *
 *  One computation, because the map badge and the hover breakdown must quote
 *  the same numbers by construction rather than by two copies of the same
 *  direction-picking dance. The tracks resolve independently on purpose: a
 *  settlement raises the Might bar and leaves Status where it was, and the two
 *  leads can point in opposite directions, so Might and Status can be racing
 *  toward different realms' bars on one badge. */
export interface SubjugationRace {
  might: TrackRace;
  status: TrackRace;
  /** A pact is running. Neither side may aim a hostile card at the other while
   *  it lasts, so the bars are what will apply once it lapses. */
  allied: boolean;
  /** Nothing stands between these two: no lead either way and no pact. The map
   *  draws no badge and the hover offers no breakdown - both read this rather
   *  than testing the leads themselves. */
  quiet: boolean;
  /** Either of THEIR tracks has already cleared its bar: they can take the
   *  human now. Guarded by the same rule that decides legality, so a faction
   *  that could never subjugate the human is never marked. */
  danger: boolean;
}

export function subjugationRaceFor(
  view: RulesView,
  humanFactionId: string,
  rivalFactionId: string,
): SubjugationRace {
  const lead = leadsOf(view.relations, humanFactionId, rivalFactionId);
  const yours = subjugationRequirement(view, humanFactionId, rivalFactionId);
  const theirs = subjugationRequirement(view, rivalFactionId, humanFactionId);
  const track = (t: "might" | "status"): TrackRace =>
    lead[t] < 0
      ? { lead: lead[t], bar: theirs?.[t] ?? null, takenFactionId: humanFactionId }
      : { lead: lead[t], bar: yours?.[t] ?? null, takenFactionId: rivalFactionId };
  const allied = allianceActive(view, humanFactionId, rivalFactionId);
  return {
    might: track("might"),
    status: track("status"),
    allied,
    quiet: lead.might === 0 && lead.status === 0 && !allied,
    // Their lead over the human is the human's lead negated, measured against
    // their bar. `clearsBars` rather than a hand-written pair of comparisons:
    // one track clearing is enough, and that rule lives in one place.
    danger:
      theirs !== null &&
      clearsBars({ might: -lead.might, status: -lead.status }, theirs),
  };
}

export type TargetBlockReason =
  | { code: "alliance"; expiresTurn: number }
  | {
      code: "insufficient-lead";
      /** The bar on each track. They differ by the settlement count. */
      required: TrackBars;
      mightLead: number;
      statusLead: number;
      realmSize: number;
      /** Settlements founded in that realm, each adding 1 to the Might bar. */
      settlements: number;
      /** Extra lead demanded on both tracks because the target already has an
       *  overlord; 0 when it is free. Part of `required`, broken out so the
       *  tooltip can say why the bars are higher than the realm alone
       *  explains. */
      poachSurcharge: number;
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
      const surcharge = poachSurchargeOn(view, factionId);
      const required = withSurcharge(grip, surcharge);
      const lead = leadsOf(view.relations, actorFactionId, factionId);
      if (!clearsBars(lead, required)) {
        reasons.push({
          code: "insufficient-lead",
          required,
          mightLead: lead.might,
          statusLead: lead.status,
          realmSize: grip.lands,
          settlements: grip.settlements,
          poachSurcharge: surcharge,
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

/** Why a card cannot be played, in the vocabulary of the rules rather than of
 *  any one card. `TargetBlockReason` does the same job one level down, for a
 *  targeted card's individual candidates. */
export type CardBlockReason =
  | { code: "forced-first" }
  | { code: "needs-overlord" }
  | { code: "already-held" }
  | { code: "revolt-live" }
  | { code: "no-target" }
  | { code: "unavailable" };

/** Why this card cannot be played on its own terms, or null when it can.
 *
 *  Derived per rule rather than per card: "you are holding an unspent one" is
 *  one answer covering Bodyguard, Favourable omens and Extended diplomacy, and
 *  "only while you are somebody's vassal" covers Revolt, Seeds of revolt and
 *  every tribute card, present and future. `isCardPlayable` is this reduced to
 *  a boolean, so legality and the explanation can never disagree.
 *
 *  Says nothing about the rest of the hand - a card that is perfectly legal
 *  can still be unplayable this turn because a forced card monopolizes it.
 *  That is `handBlockReason`. */
export function cardBlockReason(
  view: RulesView,
  factionId: string,
  cardId: string,
): CardBlockReason | null {
  const card = CARDS[cardId];
  if (!card) return { code: "unavailable" };
  const overlord = view.overlords.get(factionId);
  const vassalOnly = (): CardBlockReason | null =>
    overlord === undefined ? { code: "needs-overlord" } : null;
  if (cardId === "grow-crops" || cardId === "fortify") return null;
  if (cardId === "bodyguard") {
    return view.bodyguards.includes(factionId) ? { code: "already-held" } : null;
  }
  if (cardId === "favourable-omens") {
    return view.omens.includes(factionId) ? { code: "already-held" } : null;
  }
  if (cardId === "extended-diplomacy") {
    return view.diplomacyBoost.includes(factionId)
      ? { code: "already-held" }
      : null;
  }
  if (isTributeCard(cardId) || cardId === "revolt") return vassalOnly();
  if (cardId === "seeds-of-revolt") {
    // Only a vassal may sow, and only one Revolt may be live at a time. Letting
    // a free faction sow would put a Revolt into an idle hand, where it would
    // sit unplayable until the next subjugation - which is exactly the
    // pre-loaded escape this card exists to remove.
    return (
      vassalOnly() ??
      (view.liveRevolts.includes(factionId) ? { code: "revolt-live" } : null)
    );
  }
  if (card.targeted) {
    return validTargetsFor(view, factionId, cardId).length > 0
      ? null
      : { code: "no-target" };
  }
  return { code: "unavailable" };
}

export function isCardPlayable(
  view: RulesView,
  factionId: string,
  cardId: string,
): boolean {
  return cardBlockReason(view, factionId, cardId) === null;
}

export interface PlayableSet {
  mode: "play" | "discard";
  cardIndexes: number[];
}

/** Which hand indexes may be played this turn. Forced cards (the tribute cards)
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

/** Why this card in this hand cannot be played THIS TURN, or null when it can.
 *
 *  The hand-level answer, and the one the player is owed: a card can be
 *  perfectly legal and still unplayable because something forced is holding
 *  the turn. Read straight off `playableSet` rather than re-deriving the
 *  forced rule, so what the hover says and what the click allows are the same
 *  decision. In discard mode nothing is blocked - every card may go - and this
 *  returns null for all of them. */
export function handBlockReason(
  view: RulesView,
  factionId: string,
  hand: string[],
  cardId: string,
): CardBlockReason | null {
  const set = playableSet(view, factionId, hand);
  if (set.cardIndexes.some((i) => hand[i] === cardId)) return null;
  return cardBlockReason(view, factionId, cardId) ?? { code: "forced-first" };
}
