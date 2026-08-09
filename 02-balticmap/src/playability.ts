import {
  CARDS, guardAgainst, isGuardCard, isInwardCard, isMarchCard,
  isRaidCard, isSingleLandHeal, isTributeCard, keywordHas,
} from "./cards";
import {
  fullRealmOf, incorporatedRealmOf, overlordChainOf,
  type Incorporated, type Overlords,
} from "./relations";
import {
  armyCapFor, defenseMaxOf, defenseOf, STRONG_BONUS,
  PLAGUE_DAMAGE_PER_STACK, RAID_DAMAGE, SUBJUGATION_GATE, subjugationGateOpen,
  turnipThresholdFor, type Defense, type Disease,
} from "./defense";
import {
  freeArmiesOn, type Armies, type Claims, type Marches,
} from "./marches";
import { hasPassive, perArmyOn, type Passives } from "./passives";
import {
  hasAbility, RAID_LEADERSHIP, type LeaderAbilities,
} from "./abilities";
import { activeExpiry } from "./timed";

/** Settlements a land supports - the one standing there since the map was
 *  drawn, plus one. Flat now: Population boom retired with the Might bar. */
export const SETTLEMENT_BASE_CAP = 2;

/** Lands the actor's FULL realm must hold before Incorporate is legal. Its
 *  own constant now - it borrowed Revolt's base threshold, and Revolt retired
 *  with the revolt loop. */
export const INCORPORATE_REALM_GATE = 4;

/** Turns a faction that ESCAPED vassalage - the independence gate, or freed
 *  because its lord fell - cannot be subjugated by anyone. Two, so an escape
 *  is a real window to act in rather than a state the next Subjugate undoes
 *  before the escaper moves. Being poached is not an escape and grants
 *  nothing. */
export const ESCAPE_RESPITE_TURNS = 2;

/** Guard card id -> the faction ids holding that guard unspent. Absent key
 *  means nobody. Keyed by the CARD rather than by the faction because that is
 *  the shape every question has: "is this target holding the guard against the
 *  card I am aiming"? */
export type Guards = Readonly<Record<string, string[]>>;

/** Unspent Favourable omens readings per faction. Absent key means none.
 *  A count map because readings stack: each one held doubles the next attack
 *  again. `GameState.miasma` shares the shape for the same reason. */
export type Omens = Readonly<Record<string, number>>;

/** The slice of game state the rules need. GameState satisfies this
 *  structurally; tests build it directly. */
export interface RulesView {
  overlords: Overlords; // stored vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // polygon id -> adjacent polygon ids
  factionIds: string[];
  /** Polygon id -> the passive statuses it carries (src/passives.ts). Read by
   *  the damage sites, the income rule and the AI. */
  passives: Passives;
  turn: number;
  guards: Guards; // guard card id -> faction ids holding it unspent
  omens: Omens; // faction id -> unspent Favourable omens readings held
  /** Faction id -> how many FURTHER settlements the map authors for that land.
   *  Map-derived and static, like `adjacency`. Absent or 0 means never
   *  again. Faction ids, like every other id here. */
  siteCaps: Record<string, number>;
  /** Faction id -> settlements founded in that land this game, not counting the
   *  one every land starts with. Absent = 0. */
  settlements: Record<string, number>;
  /** Faction id -> treasury. Absent = 0, never negative, uncapped. Earned in
   *  `beginTurn`, spent on costed cards and on tribute. Read only through
   *  `wealthOf`. */
  wealth: Record<string, number>;
  /** Faction id -> the turn its post-escape respite expires (see
   *  `ESCAPE_RESPITE_TURNS`). Bare expiry on the src/timed.ts clock; read
   *  only through `respiteExpiry`, so a stale unswept entry is inert. */
  respites: Record<string, number>;
  /** Faction id -> its CURRENT ruler's leadership. Absent = 0. Projected
   *  from GameState.rulers by `leadershipByFaction`, never read off a Ruler
   *  here: a successor starts at 0 because `replaceRuler` builds it so, and
   *  a test view carrying no rulers is a world of unproven ones. */
  leadership: Record<string, number>;
  /** Faction id -> the abilities its current ruler holds (src/abilities.ts).
   *  Absent means none, so a test-built view carrying no rulers is a world of
   *  leaders who add nothing. */
  leaderAbilities: LeaderAbilities;
  /** Faction id -> true where a leader sits. The projection of the ruler
   *  vacancy, in the same shape as `leadership`: absent means nobody leads
   *  that land, so it takes no turn and has nobody to assassinate. */
  leaders: Record<string, boolean>;
  /** Polygon id -> current defense; absent = at max (src/defense.ts). */
  defense: Defense;
  /** Polygon id -> static defense ceiling. Map-derived, like `adjacency`. */
  defenseMax: Record<string, number>;
  /** Polygon id -> owner faction id -> disease stacks (src/defense.ts). */
  disease: Disease;
  /** Faction id -> unspent Miasma readings, the `omens` shape. */
  miasma: Readonly<Record<string, number>>;
  /** Faction id -> Grow turnips plays since the last harvest was earned. */
  turnips: Record<string, number>;
  /** Declared-but-unlanded attacks, keyed by direction (src/marches.ts). Read
   *  here because an army already out on a march cannot be spent on a second
   *  one, which makes reach an army question as well as an adjacency one. */
  marches: Marches;
  /** Subjugations declared but not yet answered (src/marches.ts). Read by the
   *  map, which draws one as an arrow like any other pending thing, and by the
   *  round wrap that lands them. A second Subjugate at the same land is legal
   *  and simply replaces the first demand (`addClaim`, src/marches.ts). */
  claims: Claims;
  /** Polygon id -> armies stationed; absent = the land's own army cap. */
  armies: Armies;
}

/** How many armies this land may field: its ceiling's worth. The one place
 *  the rules ask, so the badge, the legality and the AI cannot disagree. */
export function armyCapOn(view: RulesView, polygon: string): number {
  return armyCapFor(defenseMaxOf(view, polygon), perArmyOn(view.passives, polygon));
}

/** Armies on a land that are not already out on a march. */
export function freeArmiesFor(view: RulesView, polygon: string): number {
  return freeArmiesOn(view.armies, view.marches, polygon, armyCapOn(view, polygon));
}

/** Grow turnips plays this faction owes before a harvest is earned, from its
 *  HOME land's ceiling - the land its people actually farm. */
export function turnipThresholdOn(view: RulesView, factionId: string): number {
  return turnipThresholdFor(defenseMaxOf(view, factionId));
}

/** Whether `factionId` is holding `guardCardId` unspent. */
export function holdsGuard(
  view: { guards: Guards },
  factionId: string,
  guardCardId: string,
): boolean {
  return (view.guards[guardCardId] ?? []).includes(factionId);
}

/** Why a play can come back with nothing. One shape today - a guard the target
 *  may or may not be holding - kept as a discriminated union so a future risk
 *  with a different payload slots in without touching the callers. */
export type FailureRisk = { kind: "hidden"; because: string };

/** How this play could come back with nothing, or null when it cannot. */
export function failureRiskOf(
  _view: RulesView,
  _actorFactionId: string,
  cardId: string,
  _targetFactionId: string,
): FailureRisk | null {
  const guard = guardAgainst(cardId);
  if (guard !== undefined) {
    // Unconditional, and it must stay that way: `view.guards` is right there,
    // and reading it would turn this warning into a detector telling the player
    // exactly which rivals had spent a card defending themselves.
    return { kind: "hidden", because: guard };
  }
  return null;
}

/** Settlements standing in `land` right now, counting the one it started with. */
export function settlementsIn(
  view: { settlements: Record<string, number> },
  land: string,
): number {
  return 1 + (view.settlements[land] ?? 0);
}

/** The most settlements the actor's people can support in any one land. Flat
 *  since Population boom retired. Kept as a function so the allowance rule
 *  has one spelling wherever it is asked. */
export function settlementAllowance(): number {
  return SETTLEMENT_BASE_CAP;
}

/** Further settlements the map still authors for `land`. */
export function freeSitesIn(
  view: { siteCaps: Record<string, number>; settlements: Record<string, number> },
  land: string,
): number {
  return Math.max(0, (view.siteCaps[land] ?? 0) - (view.settlements[land] ?? 0));
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
 *  deliberately no vassals. Tribute is the channel by which a vassal's wealth
 *  reaches the lord; counting its lands here would tax them twice. */
export function wealthIncomeFor(
  view: {
    incorporated: Incorporated;
    settlements: Record<string, number>;
    passives: Passives;
  },
  factionId: string,
): number {
  let founded = 0;
  let trade = 0;
  for (const land of incorporatedRealmOf(factionId, view.incorporated)) {
    founded += view.settlements[land] ?? 0;
    // River trade pays whoever holds the bank. A vassal's river is left out
    // for the same reason its settlements are: tribute is the channel by which
    // a vassal's wealth reaches its lord, and counting it here taxes it twice.
    if (hasPassive(view.passives, land, "river-trade")) trade += 1;
  }
  return 1 + founded + trade;
}

/** Every faction the actor's FULL realm borders, each land resolved to
 *  whoever annexed it. This is what "in reach" means for a FACTION-targeted
 *  card (Subjugate, Assassinate ruler): a grand-vassal's border is the
 *  pyramid's border, to any depth. */
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

/** The polygons bordering the actor's FULL realm - the polygons themselves,
 *  NOT resolved to their annexer, because attacks hit polygons. What Great
 *  raid strikes, and half of `attackReach`. */
export function borderPolygonsOf(view: RulesView, actor: string): Set<string> {
  const realm = fullRealmOf(actor, view.overlords, view.incorporated);
  const out = new Set<string>();
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) {
      if (!realm.has(adj)) out.add(adj);
    }
  }
  return out;
}

/** Where a targeted attack or disease card may land: the polygons bordering
 *  the actor's full realm, PLUS the actor's own vassal polygons - a lord may
 *  raid or sicken its vassals to hold them under the independence gate, and
 *  without that exception vassalage could never be kept. The vassal half is
 *  the full realm less what the actor holds outright (its own home and
 *  annexations), so a grand-vassal and a vassal's annexed land ride along. */
export function attackReach(view: RulesView, actor: string): Set<string> {
  const out = borderPolygonsOf(view, actor);
  const own = incorporatedRealmOf(actor, view.incorporated);
  for (const member of fullRealmOf(actor, view.overlords, view.incorporated)) {
    if (!own.has(member)) out.add(member);
  }
  return out;
}

/** Lands the actor could march an army OUT of: full-realm members holding a
 *  free army that border something the actor may attack. The tail of every
 *  arrow the actor can draw.
 *
 *  The realm half is `fullRealmOf`, not `incorporatedRealmOf` - a lord marches
 *  out of its vassals' lands too, the same pyramid rule `attackReach` follows
 *  on the other end. */
export function marchSourcesFor(view: RulesView, actor: string): string[] {
  const reach = attackReach(view, actor);
  const realm = fullRealmOf(actor, view.overlords, view.incorporated);
  return view.factionIds.filter(
    (land) =>
      realm.has(land) &&
      freeArmiesFor(view, land) > 0 &&
      (view.adjacency[land] ?? []).some((adj) => reach.has(adj)),
  );
}

/** What an army standing in `source` can be aimed at: everything in the
 *  actor's attack reach that `source` borders. An army marches to a
 *  neighbouring land, so the arrow is always one step long. */
export function marchTargetsFrom(
  view: RulesView, actor: string, source: string,
): string[] {
  const reach = attackReach(view, actor);
  const adjacent = new Set(view.adjacency[source] ?? []);
  return view.factionIds.filter((land) => reach.has(land) && adjacent.has(land));
}

/** Every march Great raid would declare right now, in faction order: one arrow
 *  per bordering polygon, exactly the set the card's text promises.
 *
 *  Every land of the actor's realm that borders the TARGET and has a free
 *  army sends one, so the card is a way to play several Raids at once rather
 *  than a fan across the frontier. Each arrow is its own axis, which is what
 *  makes it heavy: a counter-raid answers one of them and the rest land.
 *
 *  Order of play matters and is meant to. A land whose only army is already
 *  out on a march sends nothing, so a Raid declared first out of the same land
 *  is one arrow fewer here.
 *
 *  Legality, resolution and the arrow preview all call this rather than
 *  re-deriving it: the promise the card tip makes and the arrows that appear
 *  cannot drift apart if there is only one list. */
export function greatRaidMarches(
  view: RulesView, actor: string, target: string,
): { from: string; to: string; holdsArmy: boolean }[] {
  const realm = fullRealmOf(actor, view.overlords, view.incorporated);
  const neighbours = new Set(view.adjacency[target] ?? []);
  return view.factionIds
    .filter(
      (land) =>
        land !== target && neighbours.has(land) && realm.has(land) &&
        freeArmiesFor(view, land) > 0,
    )
    .map((from) => ({ from, to: target, holdsArmy: true }));
}

/** Which of the actor's lands could send an army at `target`. Empty means the
 *  target is in reach on the map but out of reach in fact: every land that
 *  borders it has its army already out. */
export function marchSourcesAgainst(
  view: RulesView, actor: string, target: string,
): string[] {
  const adjacent = new Set(view.adjacency[target] ?? []);
  return marchSourcesFor(view, actor).filter((land) => adjacent.has(land));
}

/** What the actor's held omens readings multiply an attack card by:
 *  `2 ** readings`, 1 for a card whose keyword does not say so. Spent whole
 *  stack by the next attack, exactly the reserve shape omens have always
 *  had. */
export function omensMultiplier(
  view: { omens: Omens },
  factionId: string,
  cardId: string,
): number {
  // What the card IS, through its keyword, rather than a list of ids kept
  // here. A heal is doubled by the same reading a raid is, which is why this
  // is not called `attackMultiplier` any more - the readings are worth the
  // same whichever way the card points.
  return keywordHas(cardId, "doubledByOmens")
    ? 2 ** (view.omens[factionId] ?? 0)
    : 1;
}

/** How many unspent omens readings this faction holds. */
export function omensHeld(view: { omens: Omens }, factionId: string): number {
  return view.omens[factionId] ?? 0;
}

/** Miasma's multiplier on the next Plague: `2 ** readings`, the omens rule
 *  on the other build's reserve. */
export function plagueMultiplier(
  view: { miasma: Readonly<Record<string, number>> },
  factionId: string,
): number {
  return 2 ** (view.miasma[factionId] ?? 0);
}

export function miasmaHeld(
  view: { miasma: Readonly<Record<string, number>> },
  factionId: string,
): number {
  return view.miasma[factionId] ?? 0;
}

/** The damage one attack card deals per polygon, readings included:
 *  `(base + leadership) * multiplier`. `playCard` resolves with this and the
 *  card tip quotes it, so the promise and the resolution cannot drift. */
export function attackDamageFor(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
): { damage: number; multiplier: number } {
  // Great raid is several Raids, so an arrow of one is worth exactly a Raid.
  // There is no number of its own to keep in step any more.
  const base = cardId === "strong-raid"
    ? RAID_DAMAGE + STRONG_BONUS
    : RAID_DAMAGE;
  const multiplier = omensMultiplier(view, actorFactionId, cardId);
  return {
    damage: (base + raidLeadership(view, actorFactionId, cardId)) * multiplier,
    multiplier,
  };
}

/** What the actor's LEADER adds to this attack. Zero unless the card carries
 *  the raid keyword and the ruler holds the ability that makes leadership
 *  count - a people who never learned to fight behind a chief get nothing from
 *  one, however hardened the chief is. The one reader of `war-leader`. */
export function raidLeadership(
  view: RulesView, actorFactionId: string, cardId: string,
): number {
  if (!isRaidCard(cardId)) return 0;
  if (!hasAbility(view.leaderAbilities, actorFactionId, RAID_LEADERSHIP)) {
    return 0;
  }
  return view.leadership[actorFactionId] ?? 0;
}

/** What a Plague would deal to one polygon right now: `PLAGUE_DAMAGE_PER_STACK`
 *  per stack the actor owns there, times the held Miasma readings. */
export function plagueDamageOn(
  view: RulesView,
  actorFactionId: string,
  polygon: string,
): number {
  const stacks = view.disease[polygon]?.[actorFactionId] ?? 0;
  return stacks * PLAGUE_DAMAGE_PER_STACK * plagueMultiplier(view, actorFactionId);
}

/** Localized outbreak's splash: every neighbour of the target polygon except
 *  polygons of the actor's own full realm. Indiscriminate otherwise - third
 *  parties are hit, which is the card's text. */
export function outbreakPolygons(
  view: RulesView,
  actorFactionId: string,
  targetPolygon: string,
): string[] {
  const realm = fullRealmOf(actorFactionId, view.overlords, view.incorporated);
  return (view.adjacency[targetPolygon] ?? []).filter((p) => !realm.has(p));
}

/** Lands the actor's FULL realm must hold before Incorporate is legal.
 *  `held` is `fullRealmOf` - the scoreboard count, per the realm rule - so
 *  the gate line and the score cannot disagree. */
export function incorporateRealmGate(
  view: RulesView,
  actorFactionId: string,
): { required: number; held: number } {
  return {
    required: INCORPORATE_REALM_GATE,
    held: fullRealmOf(actorFactionId, view.overlords, view.incorporated).size,
  };
}

/** The turn a faction's post-escape respite runs out, while it is running. */
export function respiteExpiry(
  view: { respites: Record<string, number>; turn: number },
  factionId: string,
): number | undefined {
  return activeExpiry(view.respites[factionId], view.turn);
}

export type TargetBlockReason =
  /** Subjugate: the target's home defenses still stand above the gate.
   *  Carries both numbers because together they are the decision: how much
   *  more damage before the gate opens. */
  | { code: "gate-closed"; defense: number; required: number }
  /** The candidate escaped vassalage within the last ESCAPE_RESPITE_TURNS
   *  turns, so Subjugate cannot touch it. */
  | { code: "respite"; expiresTurn: number }
  /** The polygon already stands at its full defense, so a heal would move
   *  nothing. */
  | { code: "at-full-defense" }
  | { code: "already-vassal" }
  /** Assassinate ruler: nobody leads this land, so there is nobody to kill. */
  | { code: "no-ruler" }
  /** The land already holds every settlement the actor's people can support. */
  | { code: "needs-population"; have: number; allowance: number }
  | { code: "no-free-site" }
  /** Raid: the land borders the actor's realm, but every realm land touching
   *  it already has its army out on a march. Reach on the map, out of reach in
   *  fact - and unlike the others here, the actor fixes it by waiting a turn
   *  for an army to come home, or by raising one. */
  | { code: "no-army" }
  | { code: "liege" }
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

/** The Subjugate gate, quoted as the two numbers the block reason and the
 *  badge both need: current home defense against the gate line. */
export function subjugationGateOn(
  view: RulesView,
  targetFactionId: string,
): { defense: number; required: number; open: boolean } {
  return {
    defense: defenseOf(view, targetFactionId),
    required: Math.floor(SUBJUGATION_GATE * defenseMaxOf(view, targetFactionId)),
    open: subjugationGateOpen(view, targetFactionId),
  };
}

/** Structured eligibility for every polygon/faction, in faction order. */
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

  // The actor's whole chain of lords. A Subjugate aimed anywhere in it would
  // close a cycle - `overlords[target] = actor` loops exactly when the target
  // is an ancestor - so this one block is the entire cycle rule.
  const lieges = new Set(overlordChainOf(actorFactionId, view.overlords));
  const factionReach = reachOf(view, actorFactionId);
  const polygonReach = attackReach(view, actorFactionId);
  const fullRealm = fullRealmOf(actorFactionId, view.overlords, view.incorporated);

  // Which id space this card aims at. Attack and disease cards hit POLYGONS
  // (a land's own id, annexed or not); the political cards aim at FACTIONS
  // and resolve through `reachOf`; the inward cards aim at the actor's own
  // realm.
  const polygonCard =
    isRaidCard(cardId) || cardId === "spread-disease" ||
    cardId === "localized-outbreak";
  const inward = isInwardCard(cardId);
  const vassalCard = cardId === "incorporate";

  // Every polygon a free army of the actor's borders, computed once for the
  // whole pass rather than per candidate: `marchSourcesFor` walks the realm,
  // and Raid asks the question 26 times.
  const sources =
    isMarchCard(cardId)
      ? new Set(
          marchSourcesFor(view, actorFactionId).flatMap(
            (land) => view.adjacency[land] ?? [],
          ),
        )
      : null;

  return view.factionIds.map((factionId): TargetEligibility => {
    const relevant = polygonCard
      ? polygonReach.has(factionId)
      : inward
        ? fullRealm.has(factionId)
        : vassalCard || factionReach.has(factionId);
    if (!relevant) return { state: "irrelevant", factionId };

    const reasons: TargetBlockReason[] = [];
    if (!polygonCard && !inward && factionId === actorFactionId) {
      reasons.push({ code: "self" });
    }
    if (!polygonCard && !inward && factionId in view.incorporated) {
      reasons.push({ code: "incorporated" });
    }
    // A land nobody leads has nobody to assassinate. The vacancy is public -
    // the hover says so - so this is not a detector for anything hidden.
    if (cardId === "assassinate-ruler" && (view.leaders[factionId] !== true)) {
      reasons.push({ code: "no-ruler" });
    }
    if (cardId === "subjugate") {
      if (lieges.has(factionId)) reasons.push({ code: "liege" });
      if (view.overlords.get(factionId) === actorFactionId) {
        reasons.push({ code: "already-vassal" });
      }
      // A time gate nothing the actor plays can lift outranks the gate they
      // could be opening right now - the hover quotes only the FIRST reason.
      const respite = respiteExpiry(view, factionId);
      if (respite !== undefined) {
        reasons.push({ code: "respite", expiresTurn: respite });
      }
      const gate = subjugationGateOn(view, factionId);
      if (!gate.open) {
        reasons.push({
          code: "gate-closed", defense: gate.defense, required: gate.required,
        });
      }
    }
    if (vassalCard && view.overlords.get(factionId) !== actorFactionId) {
      reasons.push({ code: "not-your-vassal" });
    }
    // A raid is an army leaving a land, so it needs a land to leave FROM.
    // Computed per target rather than once, because the answer differs per
    // target: the realm may hold free armies and still have none next to this
    // particular border.
    if (isMarchCard(cardId) && sources !== null && !sources.has(factionId)) {
      reasons.push({ code: "no-army" });
    }
    // Great raid asks the same question of a whole neighbourhood: it is legal
    // where at least one land of the realm bordering this target still has an
    // army at home. Its own list, because the answer IS the arrows it would
    // send - the card tip quotes the same call.
    if (
      cardId === "great-raid" &&
      greatRaidMarches(view, actorFactionId, factionId).length === 0
    ) {
      reasons.push({ code: "no-army" });
    }
    // The single-land heals, one rule: a land already at its ceiling has
    // nothing to restore, whichever card is aimed at it.
    if (
      isSingleLandHeal(cardId) &&
      defenseOf(view, factionId) >= defenseMaxOf(view, factionId)
    ) {
      reasons.push({ code: "at-full-defense" });
    }
    // Two different refusals, ordered: a land the map has no dot left for can
    // never be built in again, so quoting the allowance there would mislead.
    if (cardId === "found-settlement" && freeSitesIn(view, factionId) === 0) {
      reasons.push({ code: "no-free-site" });
    } else if (cardId === "found-settlement") {
      const have = settlementsIn(view, factionId);
      const allowance = settlementAllowance();
      if (have >= allowance) {
        reasons.push({ code: "needs-population", have, allowance });
      }
    }

    return reasons.length === 0
      ? { state: "available", factionId }
      : { state: "blocked", factionId, reasons };
  });
}

/** Whether a declared Subjugate would still land if it resolved right now.
 *
 *  The map asks it to label an arrow that is going to come to nothing, and
 *  `beginTurn` asks it when the demand actually arrives. ONE spelling, because
 *  an arrow labelled "will fail" that then took a land - or the reverse -
 *  would make the label worse than no label at all.
 *
 *  Four ways to lose it, and each is something that can change in the turn the
 *  demand is riding: the land put its defenses back up, it won a respite,
 *  somebody else took it first, or the actor lost the border it was reaching
 *  across. */
export function claimWouldLand(
  view: RulesView, actor: string, target: string,
): boolean {
  return (
    subjugationGateOpen(view, target) &&
    respiteExpiry(view, target) === undefined &&
    !fullRealmOf(actor, view.overlords, view.incorporated).has(target) &&
    reachOf(view, actor).has(target)
  );
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
 *  any one card. `TargetBlockReason` does the same job one level down. */
export type CardBlockReason =
  | { code: "forced-first" }
  | { code: "needs-overlord" }
  | { code: "already-held" }
  /** The card costs more wealth than the actor holds. */
  | { code: "cannot-afford"; cost: number; held: number }
  /** Incorporate below the realm gate. */
  | { code: "realm-too-small"; required: number; held: number }
  /** Plague or Foul winds with no disease stacks anywhere to cash or claim -
   *  the play would move nothing. */
  | { code: "no-disease" }
  /** Harvest feast with the whole realm at full defense. */
  | { code: "at-full-defense" }
  /** A raid with no army left to send: every land of the realm that borders
   *  anything already has its army out on a march. Distinct from `no-target`
   *  because the fix is different - wait a turn, or raise one. */
  | { code: "no-army" }
  /** The turn has been spent, and the play that spent it re-opened it for
   *  more of its own kind only (`CardDef.playsAgain`). Says nothing about
   *  this card: it is the turn that is out, not the card that is illegal. */
  | { code: "turn-spent" }
  | { code: "no-target" }
  | { code: "unavailable" };

/** Why this card cannot be played on its own terms, or null when it can.
 *  Derived per rule rather than per card, and reduced to a boolean by
 *  `isCardPlayable`, so legality and the explanation can never disagree. */
export function cardBlockReason(
  view: RulesView,
  factionId: string,
  cardId: string,
): CardBlockReason | null {
  const card = CARDS[cardId];
  if (!card) return { code: "unavailable" };
  // Affordability outranks every rule below: an unaffordable card is not
  // playable on any terms.
  const cost = card.wealthCost ?? 0;
  if (cost > wealthOf(view, factionId)) {
    return { code: "cannot-afford", cost, held: wealthOf(view, factionId) };
  }
  // Always legal: the filler, the reserves (both stack, so a second is a
  // bigger allowance rather than a dead card), the council, and the harvest
  // (its offer always includes skip, so it is never dead in hand). Fortify
  // used to be here on the grounds that a 0-reading play was a wasted turn
  // rather than an illegal one; it is a targeted heal now and falls through
  // to the ordinary no-target rule with the rest of them.
  if (
    cardId === "grow-crops" || cardId === "favourable-omens" ||
    cardId === "miasma" || cardId === "war-council" ||
    cardId === "turnip-harvest"
  ) {
    return null;
  }
  // Every guard, one rule: one unspent copy at a time.
  if (isGuardCard(cardId)) {
    return holdsGuard(view, factionId, cardId) ? { code: "already-held" } : null;
  }
  if (isTributeCard(cardId)) {
    return view.overlords.get(factionId) === undefined
      ? { code: "needs-overlord" }
      : null;
  }
  // The two attack cards answer the same two questions in the same order: is
  // there anything to hit, and is there an army free to send at it. The border
  // question first, because a realm surrounded by its own lands has nothing to
  // raid however many armies it is sitting on.
  if (cardId === "great-raid") {
    const border = borderPolygonsOf(view, factionId);
    if (border.size === 0) return { code: "no-target" };
    return [...border].some((t) => greatRaidMarches(view, factionId, t).length > 0)
      ? null
      : { code: "no-army" };
  }
  if (isMarchCard(cardId)) {
    if (attackReach(view, factionId).size === 0) return { code: "no-target" };
    return marchSourcesFor(view, factionId).length > 0
      ? null
      : { code: "no-army" };
  }
  if (cardId === "plague") {
    const held = Object.values(view.disease).some(
      (owners) => (owners[factionId] ?? 0) > 0,
    );
    return held ? null : { code: "no-disease" };
  }
  if (cardId === "foul-winds") {
    const any = Object.values(view.disease).some((owners) =>
      Object.values(owners).some((n) => n > 0),
    );
    return any ? null : { code: "no-disease" };
  }
  if (cardId === "harvest-feast") {
    const damaged = [
      ...fullRealmOf(factionId, view.overlords, view.incorporated),
    ].some((p) => defenseOf(view, p) < defenseMaxOf(view, p));
    return damaged ? null : { code: "at-full-defense" };
  }
  if (cardId === "incorporate") {
    // The gate outranks `no-target` below: a too-small realm is a fact about
    // the actor that no target can change.
    const gate = incorporateRealmGate(view, factionId);
    if (gate.held < gate.required) return { code: "realm-too-small", ...gate };
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

/** How far open the turn is, for the two hand-level questions below.
 *
 *  `repeatOnly` is a card id when the turn has already been spent by a play
 *  that re-opened it for another copy of itself, and null or absent when the
 *  turn is simply open. It is a card ID rather than a flag because the rule is
 *  "another copy of THAT card": the caller holds the id
 *  (`GameState.repeatCardId`), the rules never ask which card it is. */
export interface HandOptions {
  repeatOnly?: string | null;
}

/** Which hand indexes may be played this turn. Forced cards (the tribute
 *  cards) monopolize the set; an empty playable set means a forced discard of
 *  any card in hand - unless `opts.repeatOnly` narrows the turn, in which case
 *  an empty set means the run is over and the turn ends.
 *
 *  The discard is unconditional, under every rule set. It used to be off
 *  under unlimited turns, on the reading that a dead hand should wait for the
 *  board to change - but a hand that refills to a fixed size never changes on
 *  its own, so a seat holding four unplayable cards held those same four for
 *  the rest of the game, played nothing, and ended every turn in silence. */
export function playableSet(
  view: RulesView,
  factionId: string,
  hand: string[],
  opts: HandOptions = {},
): PlayableSet {
  // A re-opened turn is the narrowest set there is, so it is answered before
  // anything else. It outranks the forced card because the forced card is a
  // claim on a turn that has yet to be spent, and this turn has been spent
  // already. And it never degrades to a discard: the forced discard exists to
  // unstick a turn that has done nothing, so a turn that has already played
  // its card ends instead - an empty set here means "end your turn".
  const repeat = opts.repeatOnly;
  if (repeat !== undefined && repeat !== null) {
    const again: number[] = [];
    hand.forEach((c, i) => {
      if (c === repeat && isCardPlayable(view, factionId, c)) again.push(i);
    });
    return { mode: "play", cardIndexes: again };
  }
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

/** Why this card in this hand cannot be played THIS TURN, or null when it
 *  can. Read straight off `playableSet` rather than re-deriving the forced
 *  rule, so what the hover says and what the click allows are the same
 *  decision.
 *
 *  The mode test is load-bearing: a "discard" set lists every card in hand,
 *  and those are the cards that may be DISCARDED, not played. Without it a
 *  dead hand reported every card as playable, which stayed invisible only
 *  while the surface asking was also rendering discard mode over the top. */
export function handBlockReason(
  view: RulesView,
  factionId: string,
  hand: string[],
  cardId: string,
  opts: HandOptions = {},
): CardBlockReason | null {
  const set = playableSet(view, factionId, hand, opts);
  if (set.mode === "play" && set.cardIndexes.some((i) => hand[i] === cardId)) {
    return null;
  }
  // The card's own reason first, whichever rule locked the hand: what the
  // player has to fix is the board, and "a forced card must go first" would
  // send them looking for a fix that changes nothing.
  const own = cardBlockReason(view, factionId, cardId);
  if (own !== null) return own;
  const repeat = opts.repeatOnly;
  return repeat !== undefined && repeat !== null
    ? { code: "turn-spent" }
    : { code: "forced-first" };
}
