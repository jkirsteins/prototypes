import {
  CARDS, DOUBLABLE_CARDS, guardAgainst, isGuardCard, isTributeCard,
} from "./cards";
import {
  allianceActive, fullRealmOf, incorporatedRealmOf, leadOf, overlordChainOf,
  pactBetween,
  type Alliances, type Incorporated, type Overlords, type Relations,
} from "./relations";
import { activeExpiry, timedActive } from "./timed";

export const SUBJUGATE_THRESHOLD = 2;

/** Base of the Might lead a vassal needs over its DIRECT overlord to play
 *  Revolt: `REVOLT_BASE_THRESHOLD - fullRealmOf(lord).size`, so every land
 *  the lord's realm swallows brings every vassal in it one closer to legal
 *  revolt, and past four lands the gate stands open even at a deficit. See
 *  `revoltRequirement`. */
export const REVOLT_BASE_THRESHOLD = 4;

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
  /** Vassal faction id -> tribute payments still owed before the hostage taken
   *  from it goes home. Absent key means no hostage is held. A count map like
   *  `omens`, not a list: the number is what the vassal's Revolt block line
   *  quotes, and it falls with every tribute paid. An entry exists only while
   *  the vassalage that justified it does - every exit from vassalage deletes
   *  it (see `playCard`). */
  hostages: Record<string, number>;
  /** Faction id -> treasury. Absent = 0, never negative, uncapped. Earned in
   *  `beginTurn` (1 per settlement in the faction's own realm, see
   *  `wealthIncomeFor`), spent on costed cards and on tribute. Read only
   *  through `wealthOf`. */
  wealth: Record<string, number>;
  /** Faction id -> the turn its post-escape respite expires (see
   *  `ESCAPE_RESPITE_TURNS`). Bare expiry on the src/timed.ts clock, no
   *  payload; read only through `respiteExpiry`, so a stale unswept entry is
   *  inert by construction. */
  respites: Record<string, number>;
  /** Faction id -> its CURRENT ruler's prowess. Absent = 0. Projected from
   *  GameState.rulers by `prowessByFaction`, never read off a Ruler here: a
   *  successor starts at 0 because `replaceRuler` builds it so, and a test
   *  view carrying no rulers is a world of unproven ones. */
  prowess: Record<string, number>;
  /** Owner faction id -> the land its ruler's seat stands on (Seat of power).
   *  One seat per owner by construction - a Record cannot hold two - and the
   *  land is the owner itself or a land it incorporated. Read only through
   *  `seatOf`, so an entry the owner no longer holds outright, or one whose
   *  owner has since been vassalized, is inert by construction; the
   *  `beginTurn` sweep deletes it and reports `seat-lost`. */
  seats: Record<string, string>;
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

/** Tribute payments a vassal must make before a hostage taken from it goes
 *  home and its Revolt is playable again. Two, so the lock is real - roughly
 *  the wait for the tribute cards to cycle round - without deleting the
 *  escape the way stripping the Revolt would. */
export const HOSTAGE_RETURN_TRIBUTES = 2;

/** Turns a faction that ESCAPED vassalage - Revolt, or freed because its lord
 *  fell - cannot be subjugated by anyone. Two, so an escape is a real window
 *  to act in rather than a state the next Subjugate undoes before the escaper
 *  moves, without parking the faction outside the game the way a long truce
 *  would. Being poached is not an escape and grants nothing. */
export const ESCAPE_RESPITE_TURNS = 2;

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
  return pactBoostExpiriesOn(view, a, b).length * PACT_MIGHT_BONUS;
}

/** The expiry turn of each live pact behind `pactBonusOn` - one entry per
 *  PACT_MIGHT_BONUS it adds, in the alliance store's order. The hover reads
 *  this to say when a boosted lead falls back, and sharing the walk with the
 *  bonus itself is what keeps the two from ever disagreeing about which pacts
 *  are live. */
export function pactBoostExpiriesOn(
  view: { alliances: Alliances; turn: number },
  a: string,
  b: string,
): number[] {
  const expiries: number[] = [];
  for (const [key, pact] of Object.entries(view.alliances)) {
    if (!timedActive(pact.expiry, view.turn)) continue;
    if (!key.split("|").includes(a)) continue;
    if (pact.against.includes(b)) expiries.push(pact.expiry);
  }
  return expiries;
}

/** A's Might lead over B as the RULES see it: the relation store, plus the
 *  Might either side's live pacts buy them over the other.
 *
 *  This, not `leadOf`, is what every rule, policy step and readout asks. A
 *  pact bonus that some surfaces counted and others did not would be a lead the
 *  map badge and the legality check disagreed about, which is the same class of
 *  bug as `realmOf` versus `fullRealmOf`.
 *
 *  `leadOf` stays the raw read of the store, for the few callers that want
 *  the store itself rather than what the rules see: the boot-param override
 *  diff and the pact residue the Assassinate ruler tooltip subtracts
 *  (levelling zeroes the store, never a live pact). */
export function leadsIn(
  view: { relations: Relations; alliances: Alliances; turn: number },
  a: string,
  b: string,
): number {
  return leadOf(view.relations, a, b) +
    pactBonusOn(view, a, b) - pactBonusOn(view, b, a);
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

/** The actor's treasury. Absent = 0. */
export function wealthOf(
  view: { wealth: Record<string, number> },
  factionId: string,
): number {
  return view.wealth[factionId] ?? 0;
}

/** Wealth `factionId` earns when its turn begins: 1, plus 1 per settlement
 *  FOUNDED in its own realm - itself plus the lands incorporated into it, and
 *  deliberately no vassals. A vassal is a live seat earning into its own
 *  treasury, and tribute is the channel by which its wealth reaches the lord;
 *  counting its lands here would tax them twice.
 *
 *  The base is one coin a turn, not one per land: annexation must not print
 *  money, or a grown realm shrugs at every wealth cost the cards carry. Size
 *  buys tempo through the garrison tick; treasuries grow only by founding.
 *  (Tribute stays 1 per land - it counts `incorporatedRealmOf` itself in
 *  `playCard` and never asks this function.)
 *
 *  Two callers, one sum: the `beginTurn` tick and the HUD's "+N/turn"
 *  readout - which is how the promise and the tick cannot drift. */
export function wealthIncomeFor(
  view: { incorporated: Incorporated; settlements: Record<string, number> },
  factionId: string,
): number {
  let founded = 0;
  for (const land of incorporatedRealmOf(factionId, view.incorporated)) {
    founded += view.settlements[land] ?? 0;
  }
  return 1 + founded;
}

/** What the ruler's seat adds to its owner's subjugation bar. */
export const SEAT_BAR_BONUS = 2;

/** The flat Might the seat adds to its owner's raids on the seat land's
 *  neighbours. Flat and applied AFTER the omen multiplier - the seat pays a
 *  fixed levy on top, it is not a term readings double. The 2026-08-02 raid
 *  Status rider died on the pacing gate; keeping this one small and outside
 *  the doubling is what the seat-of-power design accepted instead. */
export const SEAT_RAID_BONUS = 1;

/** The land `factionId`'s ruler's seat stands on, while it stands at all.
 *  The one read every rule and surface goes through - the grip term, the raid
 *  rider, the map marker and the hover line cannot disagree about whether the
 *  seat stands because they all ask this. A seat stands only while its owner
 *  holds the land outright (itself or its own annexation) and answers to no
 *  overlord; anything else is inert, whether or not the sweep has caught up. */
export function seatOf(
  view: {
    seats: Record<string, string>;
    incorporated: Incorporated;
    overlords: Overlords;
  },
  factionId: string,
): string | undefined {
  const land = view.seats[factionId];
  if (land === undefined) return undefined;
  if (view.overlords.get(factionId) !== undefined) return undefined;
  const holds = land === factionId || view.incorporated[land] === factionId;
  return holds ? land : undefined;
}

/** The incumbent overlord's hold on a vassal: its lead over it, floored at 0,
 *  0 when it is nobody's vassal. */
export function overlordGrip(view: RulesView, targetFactionId: string): number {
  const lord = view.overlords.get(targetFactionId);
  if (lord === undefined) return 0;
  return Math.max(0, leadsIn(view, lord, targetFactionId));
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

/** Every faction the actor's FULL realm borders, each land resolved to
 *  whoever annexed it. This is what "in reach" means for a targeted card: a
 *  grand-vassal's border is the pyramid's border, to any depth - the realm is
 *  ultimately the root's, and its edge is where the root can act. */
export function reachOf(view: RulesView, factionId: string): Set<string> {
  const realm = fullRealmOf(factionId, view.overlords, view.incorporated);
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
  // Full realms, matching `reachOf`: a pact must not buy a lead over either
  // ally's grand-vassal any more than over a direct one.
  const own = new Set([
    ...fullRealmOf(a, view.overlords, view.incorporated),
    ...fullRealmOf(b, view.overlords, view.incorporated),
  ]);
  return view.factionIds.filter(
    (f) => reachA.has(f) && reachB.has(f) && !own.has(f) &&
      !(f in view.incorporated),
  );
}

/** How many lands of the actor's FULL realm border the target's core - the
 *  target itself, or a land the target has incorporated. The target's vassals
 *  resolve to themselves, not to their lord: a vassal is its own faction and
 *  is raided separately. The actor side counts the whole pyramid, matching
 *  `reachOf`, so Raid's convex `raidYield` now scales with pyramid-wide
 *  borders - deliberate, and watched by `npm run balance`.
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
  const realm = [...fullRealmOf(actorFactionId, view.overlords, view.incorporated)];
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
 *  number rather than the border count. The seat's `SEAT_RAID_BONUS` lands
 *  after the multiplier again - a flat levy on raids against the seat land's
 *  neighbours, resolved through `incorporated` the way `borderStrength`
 *  resolves every border. */
export function raidGainFor(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): { gain: number; multiplier: number } {
  const multiplier = omenMultiplier(view, actorFactionId, "raid");
  const gain = raidYield(borderStrength(view, actorFactionId, targetFactionId));
  const seat = seatOf(view, actorFactionId);
  const seatBonus =
    seat !== undefined &&
    (view.adjacency[seat] ?? []).some(
      (adj) => (view.incorporated[adj] ?? adj) === targetFactionId,
    )
      ? SEAT_RAID_BONUS
      : 0;
  return { gain: gain * multiplier + seatBonus, multiplier };
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

/** What a faction's grip is made of: the lands of its realm, the settlements
 *  founded in them, the ruler's seat if one stands, and the Might bar they
 *  demand together. */
export interface GripParts {
  lands: number;
  settlements: number;
  /** `SEAT_BAR_BONUS` while the faction's own seat stands, else 0. Its own
   *  part, never folded silently into `might`: the tooltip itemises the bar,
   *  and a hidden term would corrupt any caller recovering a part by
   *  subtraction. */
  seat: number;
  might: number;
}

/** The lands and settlements behind a faction's grip. Returned as parts rather
 *  than only the totals because a bar cannot be taken apart again afterwards:
 *  the tooltip used to recover the land count by dividing the bar by two, which
 *  a settlement makes wrong.
 *
 *  The FULL realm, to any depth: taking a lord takes its whole pyramid (the
 *  subjugate branch in src/game.ts keeps the target's vassals), so the bar
 *  prices every land that would change hands and every settlement founded in
 *  any of them. */
export function gripPartsOn(view: RulesView, factionId: string): GripParts {
  const realm = [...fullRealmOf(factionId, view.overlords, view.incorporated)];
  const lands = realm.length;
  // Summed, not counted: a land can now carry several founded settlements, and
  // counting settled LANDS would have quietly capped the bar at one per land
  // while the map drew three dots.
  const settlements = realm.reduce(
    (sum, m) => sum + (view.settlements[m] ?? 0),
    0,
  );
  // The faction's OWN seat alone. A vassal's seat is inert while the
  // vassalage lasts (`seatOf`), and a lord's seat does not shelter the
  // vassals under it - the seat guards the ruler who sits in it.
  const seat = seatOf(view, factionId) !== undefined ? SEAT_BAR_BONUS : 0;
  return {
    lands, settlements, seat,
    might: SUBJUGATE_THRESHOLD * lands + settlements + seat,
  };
}

/** The Might lead anyone needs against this faction: two per land of its
 *  realm - counting its vassals and the lands it has incorporated - plus one
 *  per settlement founded in any of those lands.
 *
 *  Bare arithmetic with no eligibility guards, because two callers need it
 *  that way: `subjugationRequirement` applies the guards itself, and the
 *  notices ask "what lead does anyone need against my realm" with no
 *  particular rival in mind. */
export function subjugationGripOn(
  view: RulesView,
  factionId: string,
): number {
  return gripPartsOn(view, factionId).might;
}

/** Prowess levels per -1 on the bar a ruler's own Subjugates need. Four: the
 *  player-facing rule is "a quarter per level", made integer at the boundary
 *  the way `poachSurchargeOn` ceils - so levels 1 to 3 move nothing, and the
 *  Mighty ruler card is honest about that in its text. */
export const PROWESS_PER_REDUCTION = 4;

/** What the actor's ruler shaves off any target's subjugation bar. A fact
 *  about the actor, which is why it cannot live in `gripPartsOn` - the bar
 *  there is a fact about the target alone. */
export function prowessReductionFor(
  view: RulesView,
  actorFactionId: string,
): number {
  return Math.floor((view.prowess[actorFactionId] ?? 0) / PROWESS_PER_REDUCTION);
}

/** The one spelling of "prowess lowers the bar": floored at 1, because a lead
 *  of 0 clears a bar of 0 and subjugation must never become free. */
function lessProwess(bar: number, reduction: number): number {
  return Math.max(1, bar - reduction);
}

/** The Might lead the actor needs to Subjugate the target: two per land of
 *  the target's realm, counting its vassals and the lands it has
 *  incorporated, plus one per settlement, plus the poach surcharge when the
 *  target already has a lord, less what the actor's ruler's prowess shaves
 *  off (`prowessReductionFor`, never below 1). Null when Subjugate could
 *  never apply to that pair at all - self, an incorporated land, the actor's
 *  own direct vassal, or the actor's own liege (any ancestor in its overlord
 *  chain) - so callers can leave the bar off rather than quote a meaningless
 *  number. A vassal actor gets a real bar against everyone else: vassals can
 *  Subjugate, which is also why they now show up in `threatsTo` and on the
 *  map badges.
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
  if (overlordChainOf(actorFactionId, view.overlords).includes(targetFactionId)) {
    return null;
  }
  return lessProwess(
    subjugationGripOn(view, targetFactionId) +
      poachSurchargeOn(view, targetFactionId),
    prowessReductionFor(view, actorFactionId),
  );
}

/** The Might lead a vassal needs over its DIRECT overlord to play Revolt, or
 *  null for a free faction. `REVOLT_BASE_THRESHOLD` less the lord's FULL realm
 *  size - the scoreboard number, which counts the revolting vassal itself -
 *  so an overstretched lord is easy to walk out on: at four lands the
 *  requirement is 0 and past that it goes negative, a gate a vassal clears
 *  even while behind. The lead compared against it is `leadsIn`, the live
 *  rules read, so anything that moves the pair - the tribute-shortfall bump,
 *  a pact naming the lord, future cards - moves the gate with it. The lord's
 *  standing seat is deliberately no term here: `SEAT_BAR_BONUS` guards the
 *  ruler against subjugation, not its hold over vassals.
 *
 *  Same shape as `subjugationRequirement` and for the same reason: legality,
 *  the block-reason prose and the tests all ask this one function, so the
 *  greyed card and the line explaining it cannot quote different numbers. */
export function revoltRequirement(
  view: RulesView,
  vassalFactionId: string,
): number | null {
  const lord = view.overlords.get(vassalFactionId);
  if (lord === undefined) return null;
  return (
    REVOLT_BASE_THRESHOLD -
    fullRealmOf(lord, view.overlords, view.incorporated).size
  );
}

export interface Threat {
  factionId: string;
  /** Might lead this faction still needs against its bar. <= 0 means it can
   *  act now. */
  shortfall: number;
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
    out.push({
      factionId: other,
      shortfall: required - leadsIn(view, other, factionId),
    });
  }
  const order = (id: string): number => view.factionIds.indexOf(id);
  return out.sort(
    (a, b) =>
      a.shortfall - b.shortfall || order(a.factionId) - order(b.factionId),
  );
}

/** One rival's subjugation race against the human, as the map badge quotes it.
 *
 *  One computation, because the map badge and the hover breakdown must quote
 *  the same numbers by construction rather than by two copies of the same
 *  direction-picking dance. */
export interface SubjugationRace {
  /** The human's signed Might lead, positive means the human leads - the same
   *  convention as `formatLead`, the scoreboard and the round summary. */
  lead: number;
  /** The bar that lead is racing. The bars are asymmetric, each counting the
   *  realm of the side being taken, so showing both against the player's bar
   *  quotes the wrong number the moment the rival is the one leading. The
   *  sign of the lead already says who is running, so it also says whose bar
   *  applies. Null where the leading side could never subjugate the other,
   *  and the badge shows no denominator. */
  bar: number | null;
  /** Whose realm `bar` counts: the side that would be TAKEN. Anything
   *  itemising a bar has to itemise this realm, which is not always the
   *  faction under the cursor. A dead-even race (lead 0) goes to the human,
   *  which is what the badge has always shown. */
  takenFactionId: string;
  /** A pact is running. Neither side may aim a hostile card at the other while
   *  it lasts, so the bar is what will apply once it lapses. */
  allied: boolean;
  /** Nothing stands between these two: no lead either way, no pact binding
   *  them, and no live pact term of either side's inside the lead. The last
   *  matters because a pact bonus can buy a raided lead back to exactly 0 -
   *  a 0 that falls back when the pact lapses, which a truly quiet pair has
   *  no equivalent of. The map draws no badge and the hover offers no
   *  breakdown - both read this rather than testing the lead themselves. */
  quiet: boolean;
  /** THEIR lead has already cleared its bar: they can take the human now.
   *  Guarded by the same rule that decides legality, so a faction that could
   *  never subjugate the human is never marked. */
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
  const allied = allianceActive(view, humanFactionId, rivalFactionId);
  return {
    ...(lead < 0
      ? { lead, bar: theirs, takenFactionId: humanFactionId }
      : { lead, bar: yours, takenFactionId: rivalFactionId }),
    allied,
    quiet: lead === 0 && !allied &&
      pactBonusOn(view, humanFactionId, rivalFactionId) === 0 &&
      pactBonusOn(view, rivalFactionId, humanFactionId) === 0,
    // Their lead over the human is the human's lead negated, measured against
    // their bar.
    danger: theirs !== null && -lead >= theirs,
  };
}

export type TargetBlockReason =
  | { code: "alliance"; expiresTurn: number }
  /** The candidate escaped vassalage within the last ESCAPE_RESPITE_TURNS
   *  turns, so Subjugate cannot touch it. The same field shape as `alliance`
   *  and deliberately its own code: the two are different facts with
   *  different prose, and a merged "timed" code would make every consumer
   *  switch twice. */
  | { code: "respite"; expiresTurn: number }
  | {
      code: "insufficient-lead";
      /** The Might bar the lead is short of. */
      required: number;
      lead: number;
      realmSize: number;
      /** Settlements founded in that realm, each adding 1 to the bar. */
      settlements: number;
      /** Extra lead demanded because the target already has an overlord; 0
       *  when it is free. Part of `required`, broken out so the tooltip can
       *  say why the bar is higher than the realm alone explains. */
      poachSurcharge: number;
      /** What the actor's ruler's prowess actually removed from the bar - the
       *  `prowessReductionFor` ask, clamped so the bar never fell below 1. 0
       *  for an unproven ruler. Part of `required`, broken out like
       *  `poachSurcharge` so the tooltip column keeps summing. */
      prowessReduction: number;
    }
  | { code: "already-vassal" }
  /** The land already holds every settlement the actor's people can support.
   *  A Population boom is what raises `allowance`; `have` is what stands
   *  there now, counting the one the land started with. */
  | { code: "needs-population"; have: number; allowance: number }
  | { code: "no-free-site" }
  | { code: "liege" }
  | { code: "overlord-prohibited" }
  | { code: "incorporated" }
  | { code: "self" }
  | { code: "not-your-vassal" }
  /** Take hostage: the vassal has no Revolt in its piles, so there is nothing
   *  to lock. Reads `liveRevolts`, which is exactly what the overlord can
   *  already see - the `seeded` notice and the map's unrest mark. */
  | { code: "no-revolt" }
  /** Take hostage: one hostage per vassal at a time. A second would be a
   *  wasted card - the Revolt is already locked. */
  | { code: "hostage-already-held" }
  /** Seat of power: the actor's seat already stands on this land, so moving
   *  it here would change nothing. */
  | { code: "already-seat" };

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
  return activeExpiry(pactBetween(view, actor, candidate)?.expiry, view.turn);
}

/** The turn a faction's post-escape respite runs out, while it is running.
 *  The one read every rule and surface goes through - the eligibility check,
 *  the hover lines and the badge countdown cannot disagree about whether the
 *  respite stands because they all ask this. */
export function respiteExpiry(
  view: { respites: Record<string, number>; turn: number },
  factionId: string,
): number | undefined {
  return activeExpiry(view.respites[factionId], view.turn);
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
  // The actor's whole chain of lords. A Subjugate aimed anywhere in it would
  // close a cycle - `overlords[target] = actor` loops exactly when the target
  // is an ancestor - so this one block is the entire cycle rule. Incorporate
  // needs nothing: it only ever targets the actor's own direct vassal.
  const lieges = new Set(overlordChainOf(actorFactionId, view.overlords));
  const reach = reachOf(view, actorFactionId);
  // Found a settlement and Seat of power are aimed at your own realm, so
  // neither the pact block nor the self and incorporated blocks apply to
  // them: your own land and the lands you have annexed are exactly what they
  // are for.
  const inward = cardId === "found-settlement" || cardId === "seat-of-power";
  const hostile = cardId !== "alliance" && !inward;
  // Each inward card names its own realm. Found a settlement reaches the
  // FULL realm, like `reachOf`: a lord may found in a grand-vassal's land,
  // and the settlement still belongs to the land and raises whatever bar
  // that land sits under. The seat reaches only what the actor holds
  // OUTRIGHT - itself and its annexations - because a vassal's land answers
  // to its own ruler, and `seatOf` would hold any wider placement inert.
  const ownRealm =
    cardId === "found-settlement"
      ? [...fullRealmOf(actorFactionId, view.overlords, view.incorporated)]
      : cardId === "seat-of-power"
        ? [...incorporatedRealmOf(actorFactionId, view.incorporated)]
        : [];

  return view.factionIds.map((factionId): TargetEligibility => {
    const specialOverlord =
      cardId === "alliance" && factionId === actorOverlord;
    // Incorporate and Take hostage are aimed at your own vassals, who are part
    // of your realm rather than merely bordering it - reach is the wrong
    // question for both, so every faction is relevant and the vassal check
    // below does the narrowing.
    const vassalCard = cardId === "incorporate" || cardId === "take-hostage";
    const relevant = inward
      ? ownRealm.includes(factionId)
      : vassalCard || reach.has(factionId) || specialOverlord;
    if (!relevant) return { state: "irrelevant", factionId };

    const reasons: TargetBlockReason[] = [];
    if (factionId === actorFactionId && !inward) reasons.push({ code: "self" });
    if (factionId in view.incorporated && !inward) {
      reasons.push({ code: "incorporated" });
    }
    if (cardId === "subjugate" && lieges.has(factionId)) {
      reasons.push({ code: "liege" });
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
      vassalCard &&
      view.overlords.get(factionId) !== actorFactionId
    ) {
      reasons.push({ code: "not-your-vassal" });
    } else if (cardId === "take-hostage") {
      // Ordered: a vassal with no Revolt sown has nothing to lock, and only
      // once there is one does "already locked" become the answer.
      if (!view.liveRevolts.includes(factionId)) {
        reasons.push({ code: "no-revolt" });
      } else if (factionId in view.hostages) {
        reasons.push({ code: "hostage-already-held" });
      }
    }

    const expiry = allianceExpiry(view, actorFactionId, factionId);
    if (hostile && expiry !== undefined) {
      reasons.push({ code: "alliance", expiresTurn: expiry });
    }

    if (cardId === "subjugate") {
      // Before the lead reasons, because the hover quotes only the FIRST
      // reason: a time gate nothing the actor plays can lift outranks a lead
      // they could be building right now - the same relative position the
      // alliance reason holds above.
      const respite = respiteExpiry(view, factionId);
      if (respite !== undefined) {
        reasons.push({ code: "respite", expiresTurn: respite });
      }
      const grip = gripPartsOn(view, factionId);
      const surcharge = poachSurchargeOn(view, factionId);
      const required = lessProwess(
        grip.might + surcharge,
        prowessReductionFor(view, actorFactionId),
      );
      const lead = leadsIn(view, actorFactionId, factionId);
      if (lead < required) {
        reasons.push({
          code: "insufficient-lead",
          required,
          lead,
          realmSize: grip.lands,
          settlements: grip.settlements,
          poachSurcharge: surcharge,
          prowessReduction: grip.might + surcharge - required,
        });
      }
    }

    // Two different refusals, and the order matters: a land the map has no dot
    // left for can never be built in again, so saying "raise your population"
    // there would send the player after a boom that would not help. The
    // allowance is only quoted once the map could actually draw one.
    if (cardId === "found-settlement" && freeSitesIn(view, factionId) === 0) {
      reasons.push({ code: "no-free-site" });
    } else if (cardId === "found-settlement") {
      const have = settlementsIn(view, factionId);
      const allowance = settlementAllowance(view, actorFactionId);
      if (have >= allowance) {
        reasons.push({ code: "needs-population", have, allowance });
      }
    }

    if (
      cardId === "seat-of-power" &&
      seatOf(view, actorFactionId) === factionId
    ) {
      reasons.push({ code: "already-seat" });
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
  /** The card costs more wealth than the actor holds. Carries both numbers
   *  because together they are the decision: "needs 2, you hold 1" says how
   *  long to wait, where "cannot afford" alone says nothing. */
  | { code: "cannot-afford"; cost: number; held: number }
  /** Revolt while the overlord holds a hostage. Carries how many tribute
   *  payments remain, because the count is the decision: a player told only
   *  "locked" cannot see that paying down the debt is what unlocks it. */
  | { code: "hostage-held"; remaining: number }
  /** Revolt below the gate. Carries both numbers because together they are
   *  the decision: `required` falls as the lord's realm grows and `lead`
   *  moves with the pair's counters, and which of the two to wait on is
   *  exactly what the player needs to see. */
  | { code: "revolt-lead"; required: number; lead: number }
  | { code: "no-target" }
  /** Seat of power while the actor has an overlord. A vassal's seat is inert
   *  (`seatOf`) and the sweep would report it lost next turn, so the card is
   *  a dead play for the whole vassalage - the reason says so rather than
   *  letting a placement silently lapse. */
  | { code: "vassal-no-seat" }
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
  // Affordability outranks every rule below: an unaffordable card is not
  // playable on any terms, and one check here is what keeps a new costed card
  // from having to remember it. The tribute cards carry no cost, so the
  // forced set is untouched.
  const cost = card.wealthCost ?? 0;
  if (cost > wealthOf(view, factionId)) {
    return { code: "cannot-afford", cost, held: wealthOf(view, factionId) };
  }
  const overlord = view.overlords.get(factionId);
  const vassalOnly = (): CardBlockReason | null =>
    overlord === undefined ? { code: "needs-overlord" } : null;
  // Favourable omens, Population boom and Mighty ruler are always legal: all
  // three stack, so a second one is a bigger allowance rather than a dead
  // card, and a boom held with no settlement to spend it on simply waits.
  // Listed here explicitly because the tail of this function answers
  // `unavailable` for untargeted cards.
  if (
    cardId === "grow-crops" || cardId === "fortify" ||
    cardId === "favourable-omens" || cardId === "population-boom" ||
    cardId === "mighty-ruler"
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
  if (isTributeCard(cardId)) return vassalOnly();
  if (cardId === "revolt") {
    // A hostage in the overlord's camp locks the Revolt without removing it:
    // the card stays in the piles (so `liveRevolts` and `isStranded` still see
    // it) and unlocks when the tribute debt is paid down. The hostage outranks
    // the lead gate for the subjugate-precedence reason: a gate nothing the
    // actor plays can lift comes before a lead they could be building.
    const free = vassalOnly();
    if (free !== null || overlord === undefined) return free;
    const held = view.hostages[factionId];
    if (held !== undefined) return { code: "hostage-held", remaining: held };
    const required = revoltRequirement(view, factionId);
    if (required === null) return null;
    const lead = leadsIn(view, factionId, overlord);
    return lead >= required ? null : { code: "revolt-lead", required, lead };
  }
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
  if (cardId === "seat-of-power" && overlord !== undefined) {
    return { code: "vassal-no-seat" };
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
 *  card in hand - unless the rules refuse discards, in which case the set
 *  stays in "play" mode with nothing in it: there is no discard mode to
 *  degrade to, so the hand simply has nothing to click. */
export function playableSet(
  view: RulesView,
  factionId: string,
  hand: string[],
  opts: { discards?: boolean } = {},
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
  // With discards off the table there is no discard mode to degrade to: the
  // hand simply has nothing to click, and the per-card reasons stay honest.
  if (opts.discards === false) return { mode: "play", cardIndexes: [] };
  return { mode: "discard", cardIndexes: hand.map((_, i) => i) };
}

/** Why this card in this hand cannot be played THIS TURN, or null when it can.
 *
 *  The hand-level answer, and the one the player is owed: a card can be
 *  perfectly legal and still unplayable because something forced is holding
 *  the turn. Read straight off `playableSet` rather than re-deriving the
 *  forced rule, so what the hover says and what the click allows are the same
 *  decision. In discard mode nothing is blocked - every card may go - and this
 *  returns null for all of them, but only while the rules allow discards:
 *  `opts.discards: false` flows straight through to `playableSet`, whose
 *  empty play set makes every card fall through below and report its own
 *  reason instead of a blanket null. */
export function handBlockReason(
  view: RulesView,
  factionId: string,
  hand: string[],
  cardId: string,
  opts: { discards?: boolean } = {},
): CardBlockReason | null {
  const set = playableSet(view, factionId, hand, opts);
  if (set.cardIndexes.some((i) => hand[i] === cardId)) return null;
  return cardBlockReason(view, factionId, cardId) ?? { code: "forced-first" };
}
