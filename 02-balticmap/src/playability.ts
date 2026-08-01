import {
  CARDS, DOUBLABLE_CARDS, guardAgainst, isGuardCard, isTributeCard,
} from "./cards";
import {
  allianceActive, leadsOf, pactBetween, realmOf,
  type Alliances, type Incorporated, type Overlords, type Relations,
} from "./relations";

export const SUBJUGATE_THRESHOLD = 2;

/** Settlements a land supports with no Population boom spent on it - the one
 *  standing there since the map was drawn, plus one. So Found a settlement
 *  raises a land to its second and stops, and every settlement past that is a
 *  boom that was held and spent. */
export const SETTLEMENT_BASE_CAP = 2;

/** Might both allies gain against every faction bordering both realms, for as
 *  long as their pact lasts. Not a bump: a term `leadsIn` adds and stops
 *  adding. See `Pact` in src/relations.ts. */
export const PACT_MIGHT_BONUS = 1;

/** Guard card id -> the faction ids holding that guard unspent. Absent key
 *  means nobody. Keyed by the CARD rather than by the faction because that is
 *  the shape every question has: "is this target holding the guard against the
 *  card I am aiming"? A faction may hold one of each. */
export type Guards = Readonly<Record<string, string[]>>;

/** Unspent Favourable omens readings per faction. Absent key means none.
 *
 *  A count map rather than a faction-id list like `bodyguards`, because
 *  readings stack: each one held doubles the next doublable card again. A list
 *  with repeated ids would have kept `includes` compiling while silently
 *  meaning "at least one", which is exactly the drift this shape refuses. */
export type Omens = Readonly<Record<string, number>>;

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
  alliances: Alliances; // sorted-pair key -> the pact between that pair
  turn: number;
  guards: Guards; // guard card id -> faction ids holding it unspent
  omens: Omens; // faction id -> unspent Favourable omens readings held
  diplomacyBoost: string[]; // faction ids holding an unspent Extended diplomacy
  /** Faction id -> how many FURTHER settlements the map authors for that land.
   *  Map-derived and static, like `adjacency`: a land's slot cap follows from
   *  its population, so how often it could ever be built in is not something
   *  play changes. Absent or 0 means never again.
   *
   *  Faction ids, like every other id here - the map's region ids are a
   *  different id space and must be translated before they reach the rules. */
  siteCaps: Record<string, number>;
  /** Faction id -> settlements founded in that land this game, not counting the
   *  one every land starts with. Absent = 0. */
  settlements: Record<string, number>;
  /** Faction id -> unspent Population booms, each one allowing a settlement
   *  past what a land supports unaided. Absent = 0. */
  booms: Record<string, number>;
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

/** Whether `factionId` is holding `guardCardId` unspent. */
export function holdsGuard(
  view: { guards: Guards },
  factionId: string,
  guardCardId: string,
): boolean {
  return (view.guards[guardCardId] ?? []).includes(factionId);
}

/** The Might `a` gains over `b` from a's active pacts - PACT_MIGHT_BONUS for
 *  each live pact of a's whose frozen `against` list names b.
 *
 *  Summed rather than capped at one: each pact is a separate diplomatic fact,
 *  and two allies both bordering the same rival is exactly the position the
 *  card is meant to reward. In practice Alliance is one per deck, so a stack
 *  needs two pacts running at once.
 *
 *  Note this is directional. b's own pacts against a are b's gain, and
 *  `leadsIn` subtracts them there. */
export function pactBonusOn(
  view: { alliances: Alliances; turn: number },
  a: string,
  b: string,
): number {
  let bonus = 0;
  for (const [key, pact] of Object.entries(view.alliances)) {
    if (view.turn >= pact.expiry) continue;
    if (!key.split("|").includes(a)) continue;
    if (pact.against.includes(b)) bonus += PACT_MIGHT_BONUS;
  }
  return bonus;
}

/** A's leads over B as the RULES see them: the relation store, plus the Might
 *  either side's live pacts buy them over the other.
 *
 *  This, not `leadsOf`, is what every rule, policy step and readout asks. A
 *  pact bonus that some surfaces counted and others did not would be a lead the
 *  map badge and the legality check disagreed about, which is the same class of
 *  bug as `realmOf` versus `fullRealmOf`.
 *
 *  `leadsOf` stays the raw read of the store and keeps exactly one caller that
 *  wants it: the pre-assassination Status capture in src/game.ts, which reads a
 *  track no pact touches, from a `relations` value mid-play. */
export function leadsIn(
  view: { relations: Relations; alliances: Alliances; turn: number },
  a: string,
  b: string,
): { status: number; might: number } {
  const raw = leadsOf(view.relations, a, b);
  return {
    status: raw.status,
    might: raw.might + pactBonusOn(view, a, b) - pactBonusOn(view, b, a),
  };
}

/** Why a play can come back with nothing. Two shapes, because a player can be
 *  told two different things about it. A roll has a number and the number is
 *  the decision. A guard has none: it is a card the target may or may not be
 *  holding, and saying which would hand over what they bought.
 *
 *  `held` rides along on the loyalty roll because the odds alone do not say
 *  what to do about them - a player told "60%" and not "held 3 of the 5 turns
 *  needed" cannot see that waiting fixes it. */
export type FailureRisk =
  | { kind: "roll"; chance: number; because: "poach" | "loyalty"; held: number }
  /** `because` is the GUARD CARD's id, so the wording can name what turns this
   *  particular card aside. It never says whether the target actually holds
   *  one. */
  | { kind: "hidden"; because: string };

/** How this play could come back with nothing, or null when it cannot.
 *
 *  The single place that question is answered. Every surface that warns about a
 *  fallible card reads it from here, so a card cannot become fallible - or stop
 *  being so - in the rules without every tooltip following. Before this, the
 *  odds existed only as prose inside the tooltip that printed them, which is
 *  why Assassinate ruler's guard was never mentioned anywhere at all.
 *
 *  A miss is not the only way a play can disappoint, and the ones left out are
 *  left out deliberately: Grow turnips does nothing by design and says so in
 *  its own text, and an Alliance re-sealed on a faction you could have taken is
 *  a bad choice rather than a failure. This answers "can the rules refuse
 *  this after I commit to it", nothing wider. */
export function failureRiskOf(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): FailureRisk | null {
  if (cardId === "subjugate") {
    const chance = subjugationChance(view, targetFactionId);
    return chance >= 1
      ? null
      : { kind: "roll", chance, because: "poach", held: 0 };
  }
  if (cardId === "incorporate") {
    // Returned at 100% too, unlike the poach above. A certain poach is not a
    // risk and saying so would be noise on every free target; a certain
    // annexation is the end of a clock the player has been watching, and "held
    // 5 of the 5 turns needed" is the payoff for waiting.
    return {
      kind: "roll",
      chance: incorporationChance(view, actorFactionId, targetFactionId),
      because: "loyalty",
      held: loyaltyOf(view, targetFactionId, actorFactionId),
    };
  }
  const guard = guardAgainst(cardId);
  if (guard !== undefined) {
    // Unconditional, and it must stay that way: `view.guards` is right there,
    // and reading it would turn this warning into a detector telling the player
    // exactly which rivals had spent a card defending themselves. The guard is
    // theirs to know. What the player is owed is that the card can be turned
    // aside at all, which is true of every target equally.
    return { kind: "hidden", because: guard };
  }
  return null;
}

/** Settlements standing in `land` right now, counting the one it started with.
 *  The stored count deliberately omits that one - see `GameState.settlements` -
 *  and this is the single place it is added back, so the allowance rule and the
 *  subjugation bar cannot disagree about what "three settlements" means. */
export function settlementsIn(
  view: { settlements: Record<string, number> },
  land: string,
): number {
  return 1 + (view.settlements[land] ?? 0);
}

/** The most settlements this actor's people can support in any one land:
 *  SETTLEMENT_BASE_CAP, plus one per unspent Population boom they hold.
 *
 *  An "up to", not a step. Two booms held do not force the actor at a
 *  four-settlement land; they may still raise a bare land to its second, and
 *  `playCard` spends a boom either way. */
export function settlementAllowance(
  view: { booms: Record<string, number> },
  factionId: string,
): number {
  return SETTLEMENT_BASE_CAP + (view.booms[factionId] ?? 0);
}

/** Further settlements the map still authors for `land` - its locked dots less
 *  the ones already founded. 0 means the map has nothing left to draw there,
 *  whatever the actor's allowance says. */
export function freeSitesIn(
  view: { siteCaps: Record<string, number>; settlements: Record<string, number> },
  land: string,
): number {
  return Math.max(0, (view.siteCaps[land] ?? 0) - (view.settlements[land] ?? 0));
}

export function boomsHeld(
  view: { booms: Record<string, number> },
  factionId: string,
): number {
  return view.booms[factionId] ?? 0;
}

/** The incumbent overlord's hold on a vassal: the larger of their two leads
 *  over it, 0 when it is nobody's vassal. */
export function overlordGrip(view: RulesView, targetFactionId: string): number {
  const lord = view.overlords.get(targetFactionId);
  if (lord === undefined) return 0;
  const l = leadsIn(view, lord, targetFactionId);
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

/** Every faction the actor's realm borders, each land resolved to whoever
 *  annexed it. This is what "in reach" means for a targeted card. */
export function reachOf(view: RulesView, factionId: string): Set<string> {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) {
      reach.add(view.incorporated[adj] ?? adj);
    }
  }
  return reach;
}

/** Factions bordering BOTH realms - what a pact between a and b buys them both
 *  a Might lead over, in faction order.
 *
 *  Neither ally's own realm counts, in either direction: a pact does not buy
 *  you a lead over your own vassal, nor over the ally you just sealed it with.
 *  An incorporated land is not a faction any more and is excluded with them -
 *  `reachOf` already resolves such a land to its owner, so this only has to
 *  drop the realm members themselves.
 *
 *  Order comes from `factionIds` rather than from set iteration, so the frozen
 *  list a pact stores is deterministic and two runs of the same seed record it
 *  identically. */
export function sharedNeighboursOf(
  view: RulesView,
  a: string,
  b: string,
): string[] {
  const reachA = reachOf(view, a);
  const reachB = reachOf(view, b);
  const own = new Set([
    ...realmOf(a, view.overlords, view.incorporated),
    ...realmOf(b, view.overlords, view.incorporated),
  ]);
  return view.factionIds.filter(
    (f) => reachA.has(f) && reachB.has(f) && !own.has(f) &&
      !(f in view.incorporated),
  );
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

/** What this faction's held Favourable omens readings multiply this card by:
 *  `2 ** readings` on a card a reading can double, 1 otherwise.
 *
 *  Readings stack and are never capped. The ceiling is tempo: the deck holds
 *  one copy, so a second reading costs a full cycle in which you declined to
 *  cash the first on Raid, Fortify, Shrewd marriage or Revolt.
 *
 *  Four places ask it - `playCard` spends the readings on it, the AI policy
 *  scores through it, the card tip names it and the map preview quotes the
 *  multiplied number - and it was written out longhand at each. That is the
 *  shape a rule drifts in: the card tip's copy dropped the `DOUBLABLE_CARDS`
 *  half and only stayed correct because its one caller had already narrowed
 *  to Raid.
 *
 *  Returns a multiplier rather than a boolean on purpose. The boolean version
 *  it replaced could not express a stack, and every caller had already written
 *  `? 2 : 1` beside it. */
export function omenMultiplier(
  view: { omens: Omens },
  factionId: string,
  cardId: string,
): number {
  return DOUBLABLE_CARDS.has(cardId) ? 2 ** (view.omens[factionId] ?? 0) : 1;
}

/** How many unspent readings this faction holds. */
export function omensHeld(view: { omens: Omens }, factionId: string): number {
  return view.omens[factionId] ?? 0;
}

/** The Might a Raid on this target would actually add, readings included, and
 *  the multiplier they paid for. `playCard` resolves the raid with this, so the
 *  number the player is shown before aiming is by construction the number they
 *  get.
 *
 *  The multiplier applies after `raidYield`, so a stack multiplies the convex
 *  number rather than the border count. */
export function raidGainFor(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): { gain: number; multiplier: number } {
  const multiplier = omenMultiplier(view, actorFactionId, "raid");
  const gain = raidYield(borderStrength(view, actorFactionId, targetFactionId));
  return { gain: gain * multiplier, multiplier };
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
 *  outside the card path entirely. That matters more now that readings stack:
 *  a garrison tick eating a two-deep stack would be a silent loss of two turns.
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
  // Summed, not counted: a land can now carry several founded settlements, and
  // counting settled LANDS would have quietly capped the bar at one per land
  // while the map drew three dots.
  const settlements = realm.reduce(
    (sum, m) => sum + (view.settlements[m] ?? 0),
    0,
  );
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
    const lead = leadsIn(view, other, factionId);
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
  const lead = leadsIn(view, humanFactionId, rivalFactionId);
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
  /** The land already holds every settlement the actor's people can support.
   *  A Population boom is what raises `allowance`; `have` is what stands
   *  there now, counting the one the land started with. */
  | { code: "needs-population"; have: number; allowance: number }
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

export function allianceExpiry(
  view: { alliances: Alliances; turn: number },
  actor: string,
  candidate: string,
): number | undefined {
  return allianceActive(view, actor, candidate)
    ? pactBetween(view, actor, candidate)?.expiry
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
      const lead = leadsIn(view, actorFactionId, factionId);
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

    // Two different refusals, and the order matters: a land the map has no dot
    // left for can never be built in again, so saying "raise your population"
    // there would send the player after a boom that would not help. The
    // allowance is only quoted once the map could actually draw one.
    if (inward && freeSitesIn(view, factionId) === 0) {
      reasons.push({ code: "no-free-site" });
    } else if (inward) {
      const have = settlementsIn(view, factionId);
      const allowance = settlementAllowance(view, actorFactionId);
      if (have >= allowance) {
        reasons.push({ code: "needs-population", have, allowance });
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
 *  one answer covering Bodyguard and Extended diplomacy, and
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
  // Favourable omens and Population boom are always legal: both stack, so a
  // second one is a bigger allowance rather than a dead card, and a boom held
  // with no settlement to spend it on simply waits. Listed here explicitly
  // because the tail of this function answers `unavailable` for untargeted
  // cards.
  if (
    cardId === "grow-crops" || cardId === "fortify" || cardId === "a-feast" ||
    cardId === "favourable-omens" || cardId === "population-boom"
  ) {
    return null;
  }
  // Every guard, one rule: one unspent copy at a time. A second would be a
  // wasted turn, since a guard turns aside exactly one card either way.
  if (isGuardCard(cardId)) {
    return holdsGuard(view, factionId, cardId) ? { code: "already-held" } : null;
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
