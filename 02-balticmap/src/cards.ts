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
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Nothing happens. Enough of these earn a Turnip harvest.",
    textSegments: [t("Nothing happens. Enough of these earn a "), card("turnip-harvest"), t(".")] },
  // Build A - Warpath.
  "raid": { id: "raid", name: "Raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Send an army at a bordering land. It lands next turn for 1 damage plus your leadership, less any counter-raid." },
  "great-raid": { id: "great-raid", name: "Great raid", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Every land of yours that can spare an army raids all it borders. They land next turn for 0.5 damage plus your leadership." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your next Raid or Great raid deals double damage. Stacks.",
    textSegments: [t("Your next "), card("raid"), t(" or "), card("great-raid"), t(" deals double damage. Stacks.")] },
  "war-council": { id: "war-council", name: "War council", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your ruler gains 1 leadership, added to every attack. Stacks. Lost when the ruler dies." },
  "strong-raid": { id: "strong-raid", name: "Strong raid", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Send an army at a bordering land. It lands next turn for 2 damage plus your leadership, less any counter-raid." },
  "strong-fortify": { id: "strong-fortify", name: "Strong fortify", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 2 defense to one of your lands." },
  "fortify": { id: "fortify", name: "Fortify", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 1 defense to one of your lands." },
  // Build B - Pestilence. Stacks are owned: each rival's disease on a land is
  // its own count, and only your own stacks feed your Plague.
  "spread-disease": { id: "spread-disease", name: "Spread disease", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Put 1 disease on a land in reach. It does nothing until a Plague." ,
    textSegments: [t("Put 1 disease on a land in reach. It does nothing until a "), card("plague"), t(".")] },
  "localized-outbreak": { id: "localized-outbreak", name: "Localized outbreak", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Put 1 disease on every neighbour of a land in reach. Skips your own lands." },
  "miasma": { id: "miasma", name: "Miasma", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Your next Plague counts each of your stacks double. Stacks.",
    textSegments: [t("Your next "), card("plague"), t(" counts each of your stacks double. Stacks.")] },
  "plague": { id: "plague", name: "Plague", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Every land holding your disease takes 1 damage per stack. Your stacks are spent." },
  "foul-winds": { id: "foul-winds", name: "Foul winds", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Every disease stack on the map becomes yours." },
  // Neutrals - reachable by every deck through the harvest pool.
  "hillfort": { id: "hillfort", name: "Hillfort", targeted: true, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 3 defense to one of your lands." },
  "harvest-feast": { id: "harvest-feast", name: "Harvest feast", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "Restore 1 defense to every land you hold." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Take a faction in reach as your vassal. Only while their home defense is a quarter or less. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Absorb one of your vassals for good. Needs a realm of 4 lands." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Kill a ruler in reach. Their successor starts with no leadership." },
  // Secret. The rules already treat a posted guard as hidden - `failureRiskOf`
  // in src/playability.ts refuses to read the guard lists so the Assassinate
  // ruler tooltip cannot become a detector - and a log line naming the card was
  // that detector by another route.
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "The next Assassinate ruler against you fails. One at a time. Others see only that you played a secret card.",
    textSegments: [t("The next "), card("assassinate-ruler"), t(" against you fails. One at a time. Others see only that you played a secret card.")] },
  // Consumed on play (see CONSUMED_CARDS): the ceiling it raises is permanent.
  // Never in a build or the neutral pool - `deckBuildable: false` - because
  // the harvest offers it in a slot of its own, every time. That fixed slot IS
  // its discovery route, and it is why the offer can never come back with
  // nothing worth taking.
  "prosperous-proliferation": { id: "prosperous-proliferation", name: "Prosperous proliferation", targeted: true, secret: false, maxPerDeck: null, deckBuildable: false, forced: false, rarity: "common", text: "Good years: one of your lands grows by 1, ceiling and defense alike. Leaves your deck." },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", wealthCost: 1, text: "Costs 1 wealth. Build a settlement in one of your lands. Each one founded earns 1 wealth a turn." },
  // Injection-only: a Subjugate shuffles one into the vassal's deck (see
  // playCard) and a release strips it out again. Never offered by a harvest.
  "pay-military-tribute": { id: "pay-military-tribute", name: "Pay tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced. Pay your overlord 1 wealth per land of yours. What you cannot pay is forgiven." },
  // Injection-only: earned by the turnip bar, every seat alike. Its discovery
  // route is the bar itself - the harvest-earned notice says it arrived.
  "turnip-harvest": { id: "turnip-harvest", name: "Turnip harvest", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: false, rarity: "common", text: "Three cards are offered. Keep one, or none. The keep joins your deck." },
};

/** The two builds. A seat picks one before the game and its harvest pool is
 *  the picked build's cards plus the neutrals - the two sets are mutually
 *  exclusive by design, and the build picker names both up front so the
 *  player knows what they chose against. */
export type Strategy = "warpath" | "pestilence";

export const BUILDS: Record<Strategy, readonly string[]> = {
  // The strong pair rather than the plain one: every deck already OPENS with
  // three Raids and five Fortifies, so a harvest that offered them again was
  // offering a card the seat was already holding five of. What the pool owes
  // a warpath seat is a better version of what it already does.
  warpath: [
    "strong-raid", "great-raid", "favourable-omens", "war-council",
    "strong-fortify",
  ],
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
export const ATTACK_CARDS: ReadonlySet<string> = new Set([
  "raid", "strong-raid", "great-raid",
]);

/** The cards that send ONE army at ONE land - the two-step aim (a source, then
 *  a target), the arrow, and the `no-army` refusal. Keyed as a set because
 *  "raid" was a literal in eight places and a second raid card would have had
 *  to find all eight. */
export const MARCH_CARDS: ReadonlySet<string> = new Set(["raid", "strong-raid"]);

export const isMarchCard = (cardId: string): boolean => MARCH_CARDS.has(cardId);

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
 *  A deck here is small and never shuffles anything out, so a card that must
 *  not repeat has to be removed by hand. Growing a land is the one: the
 *  ceiling it raises is permanent, so a copy cycling back round would compound
 *  into a land twice the size of anything on the map off a single pick.
 *
 *  A Set beside `ATTACK_CARDS` and `GUARDS` rather than a `CardDef` field, the
 *  same as those two: the rule belongs to a handful of cards and the twenty
 *  that do not care should not have to answer for it. Pinned in
 *  tests/cards.test.ts. */
export const CONSUMED_CARDS: ReadonlySet<string> = new Set([
  "prosperous-proliferation",
]);

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
    // Every seat opens on a map that is mostly lands nobody plays, so a deck
    // without this can win nothing.
    "subjugate",
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
