import {
  COMBAT_RULES, RAID_SPEND_FRACTION, SINGLE_LAND_HEAL, type CombatRules,
} from "./defense";
import { card, keyword, t, type Segment } from "./segments";

/** One pack draw tier. The meta progression retired with the defense-score
 *  design (2026-08-08) - nothing rolls tiers today - but the table and
 *  `rarityForImpact` stay for the later pass that re-measures the new roster:
 *  the cuts, the colours and the reasoning were paid for and the next
 *  measurement wants the same shape to land in. */
export interface RarityTier {
  id: string;
  weight: number;
  minImpact: number;
  colour: string;
}

export const RARITY_TIERS = [
  { id: "common", weight: 70, minImpact: Number.NEGATIVE_INFINITY, colour: "#6d6355" },
  { id: "rare",   weight: 25, minImpact: 0.013, colour: "#1f6fd0" },
  { id: "epic",   weight:  5, minImpact: 0.139, colour: "#7b2fbf" },
] as const satisfies readonly RarityTier[];

export type CardRarity = (typeof RARITY_TIERS)[number]["id"];

/** The tier nothing can fail to reach. */
export const BASE_RARITY: CardRarity = RARITY_TIERS[0].id;

/** The highest tier this impact reaches. Relies on the ascending minImpact
 *  order, which `tests/cards.test.ts` enforces. */
export function rarityForImpact(impact: number): CardRarity {
  let out: CardRarity = BASE_RARITY;
  for (const tier of RARITY_TIERS) {
    if (impact >= tier.minImpact) out = tier.id;
  }
  return out;
}

export interface CardDef {
  id: string;
  name: string;
  targeted: boolean;
  /** Played face down: the activity log names it only to the player who played
   *  it. See `eventSegments` and `revealedSecrets` in src/hud.ts. Required, not
   *  optional, so the exhaustive check in tests/cards.test.ts makes a new card
   *  decide rather than default.
   *
   *  Two constraints ride on this that no type can check:
   *
   *  - **A secret card must move no counter.** `impactText` in src/hud.ts
   *    prints the `(Defense -150 -> 450)` suffix beside the line off the
   *    event's `amount`, and nothing here hides that suffix. A secret card
   *    that moved a score would be named in all but words. Every guard moves
   *    nothing: a guard's whole effect is that somebody else's card moved
   *    nothing either.
   *  - **A reveal clause must exist** in `revealedSecrets` (src/hud.ts)
   *    saying when the card stops being secret, or it is hidden forever and
   *    the log will contradict what the player has plainly seen happen.
   *
   *  Every secret card in the game today is a guard - see `GUARDS` below. The
   *  two sets being identical is pinned in tests/cards.test.ts. */
  secret: boolean;
  /** Copies allowed per deck; null = unlimited. The harvest offer is what
   *  enforces it now: a card whose copies across a seat's piles have reached
   *  this cap is not offered (`harvestPool` in src/harvest.ts). */
  maxPerDeck: number | null;
  /** May be offered by the turnip harvest. The injection-only cards - the
   *  tribute cards and Turnip harvest itself - are not. */
  deckBuildable: boolean;
  /** While in hand, it is the only playable card. */
  forced: boolean;
  /** Pack draw tier. Every card in this roster is common by design: the
   *  defense-score rebuild ships unmeasured, and `npm run rarity` is not run
   *  until the later balance pass (see the design doc). */
  rarity: CardRarity;
  /** Wealth the actor must hold and spend to play this card. Absent = free.
   *  One legality rule reads it - `cannot-afford` in src/playability.ts - and
   *  `playCard` deducts it at the moment of play, unconditionally. The costed
   *  set is pinned to a literal in tests/cards.test.ts. */
  wealthCost?: number;
  /** The keywords this card carries - the names of the CLASSES of cards it
   *  belongs to. What each class means is the keyword's business, not the
   *  card's: see `KEYWORDS`. A card says which classes it is in and nothing
   *  more, so a rule added to a keyword reaches every card carrying it without
   *  touching one of them.
   *
   *  A LIST because the classes are independent: Unique says a card leaves the
   *  deck, Raid says it re-opens the turn, and a card can perfectly well be
   *  both. Kept apart from the rules themselves for the same reason - the
   *  field used to BE the repeat group, which made "has a keyword" and
   *  "repeats" one fact and left no way to say fortify cards are a class
   *  without also saying you may play two. */
  keywords?: readonly string[];
  /** One-line rules text shown to the player. */
  text: string;
  /** `text`, with every card the text names as a `card()` segment, so the
   *  reference is hoverable wherever rules text is rendered. Authored only on
   *  cards that name another card. `plainText(textSegments)` must equal
   *  `text` - tests/cards.test.ts pins the pair. */
  textSegments?: Segment[];
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Nothing happens. Enough of these earn a Turnip harvest.",
    textSegments: [t("Nothing happens. Enough of these earn a "), card("turnip-harvest"), t(".")] },
  // Build A - Warpath.
  "raid": { id: "raid", name: "Raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["raid", "hostile"], text: "Send an army at a land your realm can reach, out of any land of yours up to three away, spending up to HALF the source land's defense. It marches a turn for every land it crosses and lands for what you spent, less any counter-raid." },
  "great-raid": { id: "great-raid", name: "Great raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["raid", "hostile"], text: "Every land of yours bordering one land raids it, one army each, spending defense you divide between them. They are all neighbours, so unlike a Raid every arrow lands next turn, answered separately.",
    textSegments: [t("Every land of yours bordering one land raids it, one army each, spending defense you divide between them. They are all neighbours, so unlike a "), card("raid"), t(" every arrow lands next turn, answered separately.")] },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your next raid or fortify card counts double. Stacks.",
    textSegments: [t("Your next "), keyword("raid"), t(" or "), keyword("fortify"), t(" card counts double. Stacks.")] },
  "war-council": { id: "war-council", name: "War council", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your ruler gains 1 leadership. Stacks. Lost when the ruler dies - what their leadership is worth is up to what they can do with it." },
  "strong-raid": { id: "strong-raid", name: "Strong raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["raid", "hostile"], text: "Send an army at a land your realm can reach, out of any land of yours up to three away, spending as much of the source land's defense as you like. It marches a turn for every land it crosses and lands for what you spent, less any counter-raid." },
  "strong-fortify": { id: "strong-fortify", name: "Strong fortify", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["fortify"], text: "Restore 3 defense to one of your lands." },
  "fortify": { id: "fortify", name: "Fortify", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["fortify"], text: "Restore 2 defense to one of your lands." },
  // Build B - Pestilence. Stacks are owned: each rival's disease on a land is
  // its own count, and only your own stacks feed your Plague.
  "spread-disease": { id: "spread-disease", name: "Spread disease", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["hostile"], text: "Put 1 disease on a land in reach. It does nothing until a Plague." ,
    textSegments: [t("Put 1 disease on a land in reach. It does nothing until a "), card("plague"), t(".")] },
  "localized-outbreak": { id: "localized-outbreak", name: "Localized outbreak", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["hostile"], text: "Put 1 disease on every neighbour of a land in reach. Skips your own lands." },
  "miasma": { id: "miasma", name: "Miasma", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your next Plague counts each of your stacks double. Stacks.",
    textSegments: [t("Your next "), card("plague"), t(" counts each of your stacks double. Stacks.")] },
  "plague": { id: "plague", name: "Plague", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", keywords: ["hostile"], text: "Every land holding your disease takes 1 damage per stack. Your stacks are spent." },
  "foul-winds": { id: "foul-winds", name: "Foul winds", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", keywords: ["hostile"], text: "Every disease stack on the map becomes yours." },
  // Neutrals - reachable by every deck through the harvest pool.
  "hillfort": { id: "hillfort", name: "Hillfort", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 3 defense to one of your lands." },
  "harvest-feast": { id: "harvest-feast", name: "Harvest feast", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 1 defense to every land you hold." },
  // WITHDRAWN. Not deck-buildable and in no starting deck, so no seat can hold
  // one and no route offers it: a land changes hands one way now, by an army
  // walking into it once its defenses are gone. The definition and the claim
  // machinery stay because the card is meant to come back, and a card nobody
  // can obtain is the one shape the discovery rule allows to sit idle.
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: false, forced: false, rarity: "common", keywords: ["hostile"], text: "Take a faction in reach as your vassal, once their defenses are gone. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Absorb one of your vassals for good. Needs a realm of 4 lands." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", keywords: ["hostile"], text: "Kill a ruler in reach. Their successor starts with no leadership." },
  // Secret. The rules already treat a posted guard as hidden - `failureRiskOf`
  // in src/playability.ts refuses to read the guard lists so the Assassinate
  // ruler tooltip cannot become a detector - and a log line naming the card was
  // that detector by another route.
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "The next Assassinate ruler against you fails. One at a time. Others see only that you played a secret card.",
    textSegments: [t("The next "), card("assassinate-ruler"), t(" against you fails. One at a time. Others see only that you played a secret card.")] },
  // Unique: the ceiling it raises is permanent, so it must not come round.
  // Never in a build or the neutral pool - `deckBuildable: false` - because
  // the harvest offers it in a slot of its own, every time. That fixed slot IS
  // its discovery route, and it is why the offer can never come back with
  // nothing worth taking.
  "prosperous-proliferation": { id: "prosperous-proliferation", name: "Prosperous proliferation", targeted: true, secret: false, maxPerDeck: null, deckBuildable: false, forced: false, rarity: "common", keywords: ["unique"], text: "Good years: one of your lands grows by 1, ceiling and defense alike." },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", wealthCost: 1, text: "Costs 1 wealth. Build a settlement in one of your lands. Each one founded earns 1 wealth a turn." },
  // Injection-only: a Subjugate shuffles one into the vassal's deck (see
  // playCard) and a release strips it out again. Never offered by a harvest.
  "pay-military-tribute": { id: "pay-military-tribute", name: "Pay tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced. Pay your overlord 1 wealth per land of yours. What you cannot pay is forgiven." },
  // Injection-only: earned by the turnip bar, every seat alike. Its discovery
  // route is the bar itself - the harvest-earned notice says it arrived.
  "turnip-harvest": { id: "turnip-harvest", name: "Turnip harvest", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: false, rarity: "common", keywords: ["unique"], text: "Three cards are offered. Keep one, or none. The keep joins your deck." },
};

/** The two builds. A seat picks one before the game and its harvest pool is
 *  the picked build's cards plus the neutrals - the two sets are mutually
 *  exclusive by design, and the build picker names both up front so the
 *  player knows what they chose against. */
export type Strategy = "warpath" | "pestilence";

export const BUILDS: Record<Strategy, readonly string[]> = {
  // A ladder, listed bottom to top, and the plain cards are its bottom rung.
  // Every deck OPENS with four Raids and four Fortifies, and those eight are
  // what the strong cards are BOUGHT with - see `UPGRADES`. So a warpath seat
  // deepens by trading up rather than by piling on, and the plain card belongs
  // in the offer because it is the currency, not because it is a prize.
  warpath: [
    "raid", "strong-raid", "great-raid",
    "fortify", "strong-fortify",
    "favourable-omens", "war-council",
  ],
  // Flat and free: pestilence's five cards do five different jobs, so there is
  // no lesser version of any of them to trade in.
  pestilence: [
    "spread-disease", "localized-outbreak", "miasma", "plague", "foul-winds",
  ],
};

/** What a card costs, paid in copies of a lesser card. */
export interface UpgradeCost {
  /** The card spent. */
  readonly from: string;
  /** How many copies of it leave the game.  */
  readonly count: number;
}

/** The upgrade ladder: a card that must be BOUGHT, and what buys it.
 *
 *  The copies spent leave the game for good rather than going to the discard,
 *  so climbing makes a deck smaller and sharper instead of bigger and more
 *  diluted. Two into one, every rung, which is also why the opening four Raids
 *  are exactly the price of one Great raid.
 *
 *  A card absent from this table is free. `NEUTRAL_POOL` and the random draw
 *  never charge - only the named `build` pick does - so a rung reached by luck
 *  is a lucky break rather than a hole in the ladder.
 *
 *  The table must stay ACYCLIC and every `from` must name a real card, or the
 *  AI's ladder walk in src/harvest.ts has no bottom to reach.
 *  tests/cards.test.ts pins both. */
export const UPGRADES: Readonly<Record<string, UpgradeCost>> = {
  "strong-raid": { from: "raid", count: 2 },
  "great-raid": { from: "strong-raid", count: 2 },
  "strong-fortify": { from: "fortify", count: 2 },
};

/** What `cardId` costs, or null where it is free. The one reader of the table,
 *  so the offer, the payment, the UI and the AI all price a card alike. */
export const upgradeCostOf = (cardId: string): UpgradeCost | null =>
  UPGRADES[cardId] ?? null;

const UPGRADE_INTO: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(UPGRADES).map(([into, cost]) => [cost.from, into]),
);

/** The card `cardId` is spent on, one rung up, or null at the top. The table
 *  read backwards, which is how "is this card still worth wanting" is asked:
 *  a seat that traded its Raids up for a Great raid has not lost the Raid, it
 *  has SPENT it, and a policy that could not tell the difference would buy the
 *  same rung back forever. Each card is spent on at most one thing, so the
 *  inversion loses nothing - tests/cards.test.ts pins that. */
export const upgradesInto = (cardId: string): string | null =>
  UPGRADE_INTO[cardId] ?? null;

/** Rungs on the longest ladder, plus one. The bound on any walk of the table,
 *  so a cycle somebody adds by mistake is a wrong answer rather than a hang. */
export const LADDER_DEPTH = Object.keys(UPGRADES).length + 1;

/** Deck-buildable cards that fit neither build: every deck reaches them
 *  through the harvest pool. Derived so a new neutral cannot be forgotten -
 *  the roster minus the builds minus the filler is exactly the neutrals. */
export const NEUTRAL_POOL: readonly string[] = Object.values(CARDS)
  .filter(
    (c) =>
      c.deckBuildable &&
      c.id !== "grow-crops" &&
      !BUILDS.warpath.includes(c.id) &&
      !BUILDS.pestilence.includes(c.id),
  )
  .map((c) => c.id);

/** The cards that deal damage to one polygon. Derived from the spend table
 *  rather than written out again, the `SINGLE_LAND_HEALS` rule: a card cannot
 *  be in the set and missing a ceiling, or carry a ceiling nothing treats as
 *  an attack. */
export const ATTACK_CARDS: ReadonlySet<string> = new Set(
  Object.keys(RAID_SPEND_FRACTION),
);

/** The cards that send ONE army at ONE land - the two-step aim (a source, then
 *  a target), the arrow, and the `no-army` refusal. Keyed as a set because
 *  "raid" was a literal in eight places and a second raid card would have had
 *  to find all eight. */
export const MARCH_CARDS: ReadonlySet<string> = new Set(["raid", "strong-raid"]);

export const isMarchCard = (cardId: string): boolean => MARCH_CARDS.has(cardId);

/** The cards that restore defense to ONE land of the actor's own realm. A set
 *  for the reason `MARCH_CARDS` is one: legality asks two questions of every
 *  one of them - it aims inward, and a land already at its ceiling is no
 *  target - and a heal left out of the set aims OUTWARD, which is a card that
 *  refuses your own lands and repairs a rival's.
 *
 *  Derived from the amount table in src/defense.ts rather than written out
 *  again, so a heal cannot be in one and missing from the other. */
export const SINGLE_LAND_HEALS: ReadonlySet<string> = new Set(
  Object.keys(SINGLE_LAND_HEAL),
);

export const isSingleLandHeal = (cardId: string): boolean =>
  SINGLE_LAND_HEALS.has(cardId);

/** The cards aimed at a land of the actor's OWN realm rather than at a rival.
 *
 *  Three surfaces ask this one question and must agree: legality resolves the
 *  candidates through the realm instead of `reachOf`, the hover explains a
 *  miss as "not in your realm", and the click aims at the POLYGON. An
 *  incorporated land is where they part - it sits in its annexer's realm under
 *  its own id, so a card resolved politically there heals, grows or builds in
 *  the annexer's home instead of the land the player clicked. */
export const INWARD_CARDS: ReadonlySet<string> = new Set([
  ...SINGLE_LAND_HEALS, "found-settlement", "prosperous-proliferation",
]);

export const isInwardCard = (cardId: string): boolean =>
  INWARD_CARDS.has(cardId);

/** A keyword: a class of cards, named once and explained once, carrying
 *  whatever rules the flags below turn on.
 *
 *  `noun` is the class's common NOUN, lowercase, for prose that names the
 *  class rather than a card - "your next raid card", "another raid". `name` is
 *  how the keyword is titled where it is explained.
 *
 *  `text` must STATE whatever the flags turn on. They are what the code reads
 *  and the text is what the player reads, and the two going out of step is the
 *  whole failure mode a keyword exists to prevent.
 *
 *  Every card carrying a keyword shows this text with its own rules text, so
 *  the rule is learned from the card that has it rather than from somewhere
 *  else the player has to go looking. */
export interface KeywordDef {
  /** Its own key, so a lookup's RESULT can be written back as a group id
   *  without the caller carrying the key alongside it. */
  id: string;
  name: string;
  noun: string;
  text: string;
  /** Playing one leaves the turn open for another of the class. Legality still
   *  decides whether there is one to play. */
  repeats?: true;
  /** Favourable omens doubles what a card of this class does. */
  doubledByOmens?: true;
  /** The card leaves the deck for good when played - no discard, no reshuffle
   *  back. For a card whose effect is permanent, or one the game hands out
   *  again when it is earned again. */
  consumesSelf?: true;
  /** Playing one calls on a settlement OF THE LAND IT IS AIMED AT for the rest
   *  of the turn. What bounds a repeating class whose effect would otherwise
   *  run out of nothing: `freeSettlementsIn` in src/playability.ts is the
   *  reader, and `beginTurn` hands the settlements back. */
  spendsSettlement?: true;
  /** The card does somebody harm, and therefore cannot be aimed at a PEER of
   *  the actor's own realm: not at its overlord, not at that overlord's
   *  overlord, not at anything else answering to the same root, not at any land
   *  one of them has annexed. Downward stays open - a lord may raid its own
   *  vassals and their vassals, which is how a vassal is held under the
   *  independence gate. `aimsWithinOwnRealm` in src/playability.ts is the rule;
   *  this flag is what it asks about.
   *
   *  A KEYWORD and not a list of ids, because the rule has to be asked by
   *  everything that aims: the targeting pass, the two-step march aim, the
   *  arrows already in flight when a subjugation reshapes the pyramid under
   *  them, and the untargeted Plague and Foul winds that resolve over a set of
   *  lands. A list would have been the eight-places problem `MARCH_CARDS`
   *  records, and the failure is silent: a card left out is a card that can
   *  still stab its own side. */
  hostile?: true;
}

export const KEYWORDS: Readonly<Record<string, KeywordDef>> = {
  raid: {
    id: "raid",
    name: "Raid",
    noun: "raid",
    text: "Playing a raid card leaves your turn open for another one - you may keep going while you hold one and a land can spare an army and the defense to send it. Favourable omens doubles what the arrow lands, not what it cost.",
    repeats: true,
    doubledByOmens: true,
  },
  hostile: {
    id: "hostile",
    name: "Hostile",
    noun: "hostile card",
    text: "Cannot be aimed at your own realm: not at your overlord, nor at anyone they answer to, nor at anyone else under the same crown, nor at land any of them have annexed. Your own vassals and their vassals are still fair game - holding them under the independence gate is a lord's own business.",
    hostile: true,
  },
  unique: {
    id: "unique",
    name: "Unique",
    noun: "unique card",
    text: "Leaves your deck for good once played. It does not come round again with the discard.",
    consumesSelf: true,
  },
  fortify: {
    id: "fortify",
    name: "Fortify",
    noun: "fortify",
    // Repeats on the same terms a raid does, and is bounded the same way: a
    // raid runs out of armies, a fortify runs out of settlements to call on.
    // Without `spendsSettlement` a repeating heal would run out of nothing and
    // be bounded only by the hand.
    text: "A fortify card restores defense to one land of your own realm and calls on one of that land's settlements for the turn. Your turn stays open for another fortify while a land of yours still has a settlement to call on. Favourable omens doubles what it restores.",
    repeats: true,
    spendsSettlement: true,
    doubledByOmens: true,
  },
};

/** The keywords a card carries, in the order it declares them. One lookup, so
 *  a surface that explains keywords never has to know which ones exist. */
export const keywordsOf = (cardId: string): KeywordDef[] =>
  (CARDS[cardId]?.keywords ?? [])
    .map((id) => KEYWORDS[id])
    .filter((def): def is KeywordDef => def !== undefined);

/** Whether ANY keyword this card carries turns on `flag`. The one reader of
 *  the flags, so a rule keyed on a keyword is a lookup rather than a list of
 *  card ids kept somewhere else and forgotten. */
export const keywordHas = (
  cardId: string,
  flag:
    | "repeats" | "doubledByOmens" | "consumesSelf" | "hostile"
    | "spendsSettlement",
): boolean => keywordsOf(cardId).some((def) => def[flag] === true);

/** Whether this card does somebody harm, and so may never be aimed up the
 *  actor's own chain of lords. Asked by every surface that aims - see the
 *  `hostile` flag on `KeywordDef` for why it is a keyword and not a list. */
export const isHostileCard = (cardId: string): boolean =>
  keywordHas(cardId, "hostile");

/** The keyword a spent turn is re-opened for by playing `cardId`, or null
 *  where the card's keyword does not repeat. What the turn-spent gate writes
 *  and reads back, so no rule anywhere names a card. */
export const repeatGroupOf = (cardId: string): string | null =>
  keywordsOf(cardId).find((def) => def.repeats === true)?.id ?? null;

/** Guard card -> the card it turns aside, once, for whoever posted it.
 *
 *  **A guard is the reveal clause of its own secret.** Secrecy buys the fact
 *  that you cannot tell which rival is holding one; it does not buy a card
 *  visibly spent in front of you staying hidden afterwards. So a play that came
 *  back `prevented` reveals the guard that turned it aside, and the log names
 *  it from then on. A secret card that is NOT in this table has no reveal
 *  clause at all and must not ship - see `CardDef.secret`.
 *
 *  **A guarded card must be targeted**, because the guard is consumed off
 *  `targetFactionId`. `tests/cards.test.ts` pins that. */
export const GUARDS: Readonly<Record<string, string>> = {
  "bodyguard": "assassinate-ruler",
};

/** Cards that LEAVE the deck when played, rather than going to the discard.
 *
 *  Derived from the Unique keyword, not written out: a deck here is small and
 *  never shuffles anything out, so "this does not come round again" is a rule
 *  the player has to be told, and a keyword is how a card tells them. The set
 *  exists only so `playCard` can ask its question the way it always has.
 *
 *  Growing a land is unique because the ceiling it raises is permanent, and a
 *  copy cycling back round would compound into a land twice the size of
 *  anything on the map off a single pick. The harvest is unique because the
 *  turnip bar hands out a fresh one every time it fills, and one that also
 *  came back through the discard would cash a season nobody farmed. */
export const CONSUMED_CARDS: ReadonlySet<string> = new Set(
  Object.values(CARDS).filter((c) => keywordHas(c.id, "consumesSelf"))
    .map((c) => c.id),
);

export const isGuardCard = (cardId: string): boolean => cardId in GUARDS;

const GUARD_BY_TARGET: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(GUARDS).map(([guard, target]) => [target, guard]),
);

export const guardAgainst = (cardId: string): string | undefined =>
  GUARD_BY_TARGET[cardId];

/** The tribute cards a vassalage injects. The only place the set is written
 *  down - the strip on release, the injection on subjugation, the resolution
 *  in `playCard` and the vassal-only legality all read it. */
export const TRIBUTE_CARDS: readonly string[] = ["pay-military-tribute"];

export const isTributeCard = (cardId: string): boolean =>
  TRIBUTE_CARDS.includes(cardId);

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The deck a seat starts with, by build. Ten cards, the same shape either
 *  way: three that do the build's work, five that hold ground, the turnip that
 *  feeds the harvest bar, and the one card that takes ground.
 *
 *  A pestilence seat used to open with the warpath deck and only meet its own
 *  cards through harvests, which took so long that a sixteen-turn run had no
 *  disease in it at all. The build has to be in the deck for the build to be
 *  in the game. */
export function startingDeck(strategy: Strategy = "warpath"): string[] {
  const work = strategy === "pestilence"
    ? ["spread-disease", "spread-disease", "spread-disease", "plague"]
    : ["raid", "raid", "raid", "raid"];
  return [
    ...work,
    "fortify", "fortify", "fortify", "fortify",
    "grow-crops",
  ];
}

/** Fisher-Yates; returns a new array, input untouched. */
export function shuffle(cards: string[], rng: Rng): string[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every field of a `CardDef` is either BEHAVIOUR - something two deploys
 *  must agree on or their boards diverge - or PROSE, which they may differ on
 *  harmlessly. Exhaustive `Record`: a new field does not compile until
 *  somebody decides which, and `cardRulesHash` folds in exactly the behaviour
 *  ones.
 *
 *  Prose is excluded deliberately. Refusing a lobby over a reworded sentence
 *  teaches the player nothing, and the two screens would still be playing the
 *  same game. */
export const CARD_FIELD_KIND: Record<keyof Required<CardDef>, "behaviour" | "prose"> = {
  id: "behaviour",
  targeted: "behaviour",
  secret: "behaviour",
  maxPerDeck: "behaviour",
  deckBuildable: "behaviour",
  forced: "behaviour",
  wealthCost: "behaviour",
  keywords: "behaviour",
  name: "prose",
  text: "prose",
  textSegments: "prose",
  rarity: "prose",
};

/** Every table a card's behaviour is spread across, gathered so the wire can
 *  fingerprint the lot. A card's rules are not all ON the card: what a raid
 *  does for damage, what a fortify heals, what a keyword turns on, what a
 *  build offers and what an upgrade costs all live in tables of their own.
 *
 *  The interface is what makes a MISSING table a compile error at
 *  `CARD_RULES`. Nothing can make a newly invented table join it, so a new
 *  behaviour table joins this in the same change - the rule is written in
 *  AGENTS.md beside the rest of the card rules, which is the page a card
 *  author already reads.
 *
 *  The derived sets - `ATTACK_CARDS`, `SINGLE_LAND_HEALS`, `INWARD_CARDS` -
 *  are deliberately absent: they are computed from tables already here, so
 *  including them would be fingerprinting the same fact twice. */
export interface CardRules {
  cards: Record<string, CardDef>;
  raidSpendFraction: Readonly<Record<string, number>>;
  singleLandHeal: Readonly<Record<string, number>>;
  keywords: Readonly<Record<string, KeywordDef>>;
  builds: Record<Strategy, readonly string[]>;
  upgrades: Readonly<Record<string, UpgradeCost>>;
  marchCards: ReadonlySet<string>;
  guards: Readonly<Record<string, string>>;
  tributeCards: readonly string[];
  /** What a blow BUYS, as against what a card carries: the gates, and the rule
   *  by which an arriving army takes a land. Not a card table, and here
   *  anyway - a raid's damage means nothing without it, and two deploys that
   *  disagree about it disagree about what every attack card does. */
  combat: CombatRules;
}

export const CARD_RULES: CardRules = {
  cards: CARDS,
  raidSpendFraction: RAID_SPEND_FRACTION,
  singleLandHeal: SINGLE_LAND_HEAL,
  keywords: KEYWORDS,
  builds: BUILDS,
  upgrades: UPGRADES,
  marchCards: MARCH_CARDS,
  guards: GUARDS,
  tributeCards: TRIBUTE_CARDS,
  combat: COMBAT_RULES,
};

/** A stable string for everything two deploys must agree about. Sorted at
 *  every level, so key order cannot move it and a real change always does.
 *
 *  This is the handshake. It used to be `Object.keys(CARDS)` - the card IDS -
 *  and three commits changed damage, cost and legality without touching one
 *  id, so two builds shook hands and then disagreed about what the player's
 *  own card was about to do. The state could not desync, because the host is
 *  authoritative; what diverged was the guest's PREVIEW - its armed targets,
 *  its block reasons, the damage its arrow promised - so a click its own map
 *  called legal came back refused. */
export function cardRulesHash(rules: CardRules = CARD_RULES): string {
  const cards = Object.keys(rules.cards).sort().map((id) => {
    const def = rules.cards[id] as unknown as Record<string, unknown>;
    const behaviour = (Object.keys(CARD_FIELD_KIND) as (keyof CardDef)[])
      .filter((f) => CARD_FIELD_KIND[f] === "behaviour")
      .sort()
      .map((f) => `${f}=${stable(def[f])}`);
    return `${id}{${behaviour.join(",")}}`;
  });
  return [
    `cards:${cards.join("|")}`,
    `spend:${stable(rules.raidSpendFraction)}`,
    `heal:${stable(rules.singleLandHeal)}`,
    `keywords:${stable(rules.keywords)}`,
    `builds:${stable(rules.builds)}`,
    `upgrades:${stable(rules.upgrades)}`,
    `march:${[...rules.marchCards].sort().join(",")}`,
    `guards:${stable(rules.guards)}`,
    `tribute:${[...rules.tributeCards].sort().join(",")}`,
    `combat:${stable(rules.combat)}`,
  ].join(";");
}

/** JSON with object keys sorted, so an unchanged table always renders the
 *  same string. A KeywordDef's prose rides along here; a keyword's text
 *  states what its flags turn on, so two deploys whose keyword text differs
 *  have almost certainly changed what it does. */
function stable(value: unknown): string {
  if (value === undefined) return "-";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(",")}}`;
}
