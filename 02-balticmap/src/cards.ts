import { card, t, type Segment } from "./segments";

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
  /** One-line rules text shown to the player. */
  text: string;
  /** `text`, with every card the text names as a `card()` segment, so the
   *  reference is hoverable wherever rules text is rendered. Authored only on
   *  cards that name another card. `plainText(textSegments)` must equal
   *  `text` - tests/cards.test.ts pins the pair. */
  textSegments?: Segment[];
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "No effect - a quiet season. Every 5th play earns a Turnip harvest.",
    textSegments: [t("No effect - a quiet season. Every 5th play earns a "), card("turnip-harvest"), t(".")] },
  // Build A - Warpath.
  "raid": { id: "raid", name: "Raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Deal 150 damage, plus your ruler's leadership, to the defenses of one land in reach." },
  "great-raid": { id: "great-raid", name: "Great raid", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Deal 75 damage, plus your ruler's leadership, to the defenses of every land bordering your realm." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "The signs are read: your next Raid or Great raid deals double damage. Readings stack.",
    textSegments: [t("The signs are read: your next "), card("raid"), t(" or "), card("great-raid"), t(" deals double damage. Readings stack.")] },
  "war-council": { id: "war-council", name: "War council", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your ruler gains 50 leadership, added to every attack. Stacks, and dies with the ruler." },
  // Build B - Pestilence. Stacks are owned: each rival's disease on a land is
  // its own count, and only your own stacks feed your Plague.
  "spread-disease": { id: "spread-disease", name: "Spread disease", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Set one of your disease stacks on a land in reach. Stacks sit harmless until a Plague cashes them." ,
    textSegments: [t("Set one of your disease stacks on a land in reach. Stacks sit harmless until a "), card("plague"), t(" cashes them.")] },
  "localized-outbreak": { id: "localized-outbreak", name: "Localized outbreak", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Set one of your disease stacks on every neighbour of a land in reach, except lands of your own realm. Third parties are hit." },
  "miasma": { id: "miasma", name: "Miasma", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Foul air gathers: your next Plague counts each of your stacks double. Stacks.",
    textSegments: [t("Foul air gathers: your next "), card("plague"), t(" counts each of your stacks double. Stacks.")] },
  "plague": { id: "plague", name: "Plague", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Every land holding your disease takes 100 damage per stack of yours, and your stacks are spent. Other owners' stacks are untouched." },
  "foul-winds": { id: "foul-winds", name: "Foul winds", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Every disease stack on every land, whoever owns it, becomes yours." },
  // Neutrals - reachable by every deck through the harvest pool.
  "hillfort": { id: "hillfort", name: "Hillfort", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 150 defense to one land of your realm, up to what it once held." },
  "harvest-feast": { id: "harvest-feast", name: "Harvest feast", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 50 defense to every land of your realm, up to what each once held." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Turn a faction in reach into your vassal. Legal only while their home land's defenses sit at a quarter or less. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Permanently absorb one of your vassals into your realm. Needs a realm of 4 lands." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "The ruler of one faction in reach dies. The successor starts with no leadership." },
  // Secret. The rules already treat a posted guard as hidden - `failureRiskOf`
  // in src/playability.ts refuses to read the guard lists so the Assassinate
  // ruler tooltip cannot become a detector - and a log line naming the card was
  // that detector by another route.
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Post a bodyguard: the next Assassinate ruler against you fails. No stacking. Others see only that you played a secret card.",
    textSegments: [t("Post a bodyguard: the next "), card("assassinate-ruler"), t(" against you fails. No stacking. Others see only that you played a secret card.")] },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", wealthCost: 1, text: "Costs 1 wealth. Raise another settlement in one land of your realm, up to what your people support. Each settlement founded earns 1 wealth a turn." },
  // Injection-only: a Subjugate shuffles one into the vassal's deck (see
  // playCard) and a release strips it out again. Never offered by a harvest.
  "pay-military-tribute": { id: "pay-military-tribute", name: "Pay tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, pay 1 wealth per land of your realm to your overlord; what your treasury cannot cover is forgiven." },
  // Injection-only: earned by the turnip bar, every seat alike. Its discovery
  // route is the bar itself - the harvest-earned notice says it arrived.
  "turnip-harvest": { id: "turnip-harvest", name: "Turnip harvest", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: false, rarity: "common", text: "The quiet seasons pay off: three cards from your build's pool are offered and you keep one, or none. The keep joins your deck for good." },
};

/** The two builds. A seat picks one before the game and its harvest pool is
 *  the picked build's cards plus the neutrals - the two sets are mutually
 *  exclusive by design, and the build picker names both up front so the
 *  player knows what they chose against. */
export type Strategy = "warpath" | "pestilence";

export const BUILDS: Record<Strategy, readonly string[]> = {
  warpath: ["raid", "great-raid", "favourable-omens", "war-council"],
  pestilence: [
    "spread-disease", "localized-outbreak", "miasma", "plague", "foul-winds",
  ],
};

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

/** The cards a Favourable omens reading doubles - the attack cards. Damage
 *  resolution, the reserve spend, the card tip and the AI all key on this
 *  set, so a new attack card is one entry here. */
export const ATTACK_CARDS: ReadonlySet<string> = new Set(["raid", "great-raid"]);

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

/** The deck every seat starts with, human and AI alike: five Raids and the
 *  turnip that feeds the harvest bar. No padding and no DECK_SIZE - the deck
 *  is exactly what you hold, and it grows only through harvest picks. */
export function startingDeck(): string[] {
  return ["raid", "raid", "raid", "raid", "raid", "grow-crops"];
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
