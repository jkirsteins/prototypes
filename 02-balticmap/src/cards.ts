/** One pack draw tier: how much of a slot it takes, what impact a card needs
 *  to reach it, and the colour of the band a card of that tier wears.
 *
 *  The table is ordered, ascending by minImpact, and the first entry is the
 *  base tier: it is what an unreachable threshold and an empty tier both fall
 *  back to. Adding a fourth tier is one entry here and nothing else.
 *
 *  `rollTier` consumes exactly one rng value whatever it returns, and
 *  `openPack` exactly two per slot, so a new tier does not shift the draw count
 *  and committed seeds stay comparable. It does change which tier a given roll
 *  lands in, which is expected - the same caution `CARDS` carries below about
 *  its own declaration order.
 *
 *  minImpact is in lands: the coefficient of the card in the realm-size
 *  regression run by `npm run rarity`. See the 2026-07-31 card-rarity design. */
export interface RarityTier {
  id: string;
  weight: number;
  minImpact: number;
  colour: string;
}

export const RARITY_TIERS = [
  { id: "common", weight: 70, minImpact: Number.NEGATIVE_INFINITY, colour: "#6d6355" },
  // Thresholds set once from the 1500-deck run in src/data/card-impact.json and
  // then frozen. They are cut points in the gaps between measured impacts, so a
  // rerun that nudges a coefficient does not re-tier a card the player owns.
  // The two cuts are not equally solid, and a maintainer re-tiering should know
  // which is which before trusting either.
  //
  // 0.389 is the midpoint of the 0.404 chasm between Incorporate (0.591) and
  // Favourable omens (0.187). That gap is 4.6x wider than anything else in the
  // table and is the only separation two independent seeds agree on. Epic is
  // measured.
  //
  // 0.1125 is the midpoint of the 0.087-wide gap between Alliance (0.156) and
  // Shrewd marriage (0.069) - the widest gap left, but only just: the runner-up
  // is 0.083, and on seed 2000 Alliance measured 0.073 and would have fallen
  // common. Rare is a judgement call resting on a gap the noise can cross.
  // Treat it as a design decision to playtest, not as a measurement.
  { id: "rare",   weight: 25, minImpact: 0.1125, colour: "#1f6fd0" },
  { id: "epic",   weight:  5, minImpact: 0.389, colour: "#7b2fbf" },
] as const satisfies readonly RarityTier[];

export type CardRarity = (typeof RARITY_TIERS)[number]["id"];

/** The tier nothing can fail to reach. Also the fallback when a rolled tier
 *  holds no cards. */
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
   *  - **A secret card must move no relation counter.** `impactText` in
   *    src/hud.ts prints `(Might +1 -> 2)` beside the line off the event's
   *    `amount`/`track`, and nothing here hides that suffix. A secret card that
   *    moved a track would be named in all but words. Bodyguard moves nothing.
   *  - **Secrecy is not a discovery route, and it removes none.** A card is
   *    learnt from a pack (`openPack` in src/meta.ts is the only writer of
   *    `knownCards`), never from witnessing it, so hiding the name costs
   *    nothing here. A card that had no route but being witnessed must not
   *    ship - see the card rule in the repo CLAUDE.md - and marking one secret
   *    would not change that either way. */
  secret: boolean;
  /** Copies allowed per deck; null = unlimited (basic filler). */
  maxPerDeck: number | null;
  /** May appear in a built deck. The tribute cards are injection-only. */
  deckBuildable: boolean;
  /** While in hand, it is the only playable card. */
  forced: boolean;
  /** Pack draw tier. Set from the measured impact table, not by hand; see
   *  `rarityForImpact` and tests/cards.test.ts. */
  rarity: CardRarity;
  /** One-line rules text shown to the player. */
  text: string;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, secret: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "No effect - a quiet season. Fills out the deck." },
  "raid": { id: "raid", name: "Raid", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain Might over one faction in reach: +1 for your first land on their border, +2 for the second, +3 for the third, and so on." },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain +1 Status over one faction in reach; your overlord is always courtable." },
  "fortify": { id: "fortify", name: "Fortify", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain +1 Might over every other living faction at once." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "epic", text: "Permanently absorb one of your vassals into your realm." },
  // Injection-only, like Revolt: a Subjugate shuffles one of each into the
  // vassal's deck (see playCard) and a release strips them out again. They are
  // never deck-buildable and never in a pack.
  "pay-military-tribute": { id: "pay-military-tribute", name: "Pay military tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, grant your overlord +1 Might." },
  "pay-status-tribute": { id: "pay-status-tribute", name: "Pay status tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, grant your overlord +1 Status." },
  "seeds-of-revolt": { id: "seeds-of-revolt", name: "Seeds of revolt", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "While a vassal: shuffle a Revolt into your deck. Only one Revolt at a time." },
  "revolt": { id: "revolt", name: "Revolt", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: false, forced: false, rarity: "common", text: "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you. Leaves your deck for good." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Even the score: the Status lead between you and one faction in reach resets to none." },
  "alliance": { id: "alliance", name: "Alliance", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Seal a pact with one faction in reach: no hostile cards between you for 5 turns." },
  "extended-diplomacy": { id: "extended-diplomacy", name: "Extended diplomacy", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Patient envoys: your next Alliance lasts twice as long." },
  // Secret. The rules already treat a posted guard as hidden - `failureRiskOf`
  // in src/playability.ts refuses to read `view.bodyguards` so the Assassinate
  // ruler tooltip cannot become a detector - and a log line naming the card was
  // that detector by another route.
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Post a bodyguard: the next Assassinate ruler against you fails. No stacking. Others see only that you played a secret card." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "The signs are read: your next Might or Status gain counts double." },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Settle the free site in one land of your realm. Each settlement adds +1 to the lead others need to subjugate you." },
};

/** Which track a relation counter moves on. Lives here because the tribute
 *  cards below are what fix it per card; `game.ts` re-exports it. */
export type TributeTrack = "status" | "might";

/** The tribute a vassalage injects, and the track each card pays on.
 *
 *  One card per track rather than one card with a choice. The choice was a
 *  second click that asked the player to optimize their own tax, and a
 *  vassal's real position is that they pay what is demanded of them - which of
 *  the two comes up is the draw's business, not theirs.
 *
 *  This map is the only place the set is written down. Everything that used to
 *  name "pay-tribute" - the strip on release, the injection on subjugation,
 *  the resolution in `playCard`, the vassal-only legality, the doubling set,
 *  the footnotes - reads it instead, so a third tribute would be one entry. */
export const TRIBUTE_CARDS: Readonly<Record<string, TributeTrack>> = {
  "pay-military-tribute": "might",
  "pay-status-tribute": "status",
};

export const isTributeCard = (cardId: string): boolean =>
  cardId in TRIBUTE_CARDS;

/** Cards a Favourable omens reading doubles. Everything else resolves as
 *  normal and leaves the reading in reserve, so a reading is never spent on a
 *  card with no number to double. Tribute is deliberately included: a reading
 *  held while subjugated doubles what you pay, which is what stops the card
 *  from being free to sit on. */
export const DOUBLABLE_CARDS: ReadonlySet<string> = new Set([
  "raid", "shrewd-marriage", "fortify", "revolt", ...Object.keys(TRIBUTE_CARDS),
]);

/** Cards the player knows from their very first game. Everything else in the
 *  roster is earned from packs. Raid, Subjugate and Fortify together cover the
 *  three verbs the game is about - hit someone, take someone, hold everyone -
 *  so a first run is a real game rather than ten turns of turnips.
 *
 *  Seeds of revolt is here for a different reason: it is the only route to a
 *  Revolt, and a Revolt is the only way a vassal frees itself. Pack-locking it
 *  meant a first-run player fell into vassalage around turn 6 (measured by the
 *  `new-player-potatoes` scenario) with no counterplay available to them at
 *  all, and now that a dead vassalage ends the run outright (see `isStranded`
 *  in src/game.ts) that would have been a locked door rather than a decision.
 *  It stays an ordinary optional pick: leaving it out of your ten is allowed,
 *  and being stranded is then what you chose. */
export const STARTING_KNOWN_CARDS: string[] = [
  "raid", "subjugate", "fortify", "seeds-of-revolt",
];

/** The pack pool: every deck-buildable non-basic you do not start with, in
 *  stable CARDS order. Grow turnips stays free filler outside the pool; Revolt
 *  and the tribute cards are injection-only and excluded by `deckBuildable`. */
export const ACQUIRABLE_CARDS: string[] = Object.values(CARDS)
  .filter(
    (c) =>
      c.deckBuildable &&
      c.maxPerDeck !== null &&
      !STARTING_KNOWN_CARDS.includes(c.id),
  )
  .map((c) => c.id);

export const DECK_SIZE = 10;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The deck the deck screen offers by default and the `full` simulation arm
 *  plays. Explicit rather than "the first DECK_SIZE entries of CARDS", because
 *  that made the declaration order of CARDS silently decide the default deck -
 *  which is how Favourable omens ended up absent from it: it was appended
 *  last in CARDS so that the old slice-based buildDeck() would not change,
 *  which also kept it out of the default deck entirely. See the 2026-07-29
 *  scaling-might design doc's correction section for the measured effect.
 *
 *  Do NOT reorder CARDS to "fix" this list matching CARDS order, and do not
 *  reorder CARDS for any other tidiness reason either: buildAiDeck() rolls
 *  `nonBasics.filter(() => rng() < 0.5)`, consuming one rng draw per entry in
 *  CARDS's declaration order, so reordering CARDS changes which card each
 *  draw maps to and silently moves every committed AI-deck band.
 *
 *  The grow-crops slot the Reclaim cut left behind now holds Found a
 *  settlement: a default deck that offers a do-nothing card where a real
 *  choice fits was a hole, not a design.
 *
 *  Revolt is no longer here: it is injection-only, like tribute. Seeds of
 *  revolt takes its deck slot and injects the Revolt itself. Note that swapping
 *  one deck-buildable non-basic for another keeps `buildAiDeck`'s rng draw
 *  count identical, so committed AI-deck bands do not move. */
export const DEFAULT_DECK: string[] = [
  "raid", "shrewd-marriage", "fortify", "subjugate", "incorporate",
  "found-settlement", "seeds-of-revolt", "assassinate-ruler", "alliance",
  "favourable-omens",
];

/** The default (and human "full") deck: DEFAULT_DECK, padded with grow-crops
 *  if it is ever shorter than DECK_SIZE. The padding is a preserved invariant,
 *  not an assumption - DEFAULT_DECK is currently exactly DECK_SIZE long. */
export function buildDeck(): string[] {
  return [
    ...DEFAULT_DECK,
    ...Array.from(
      { length: Math.max(0, DECK_SIZE - DEFAULT_DECK.length) },
      () => "grow-crops",
    ),
  ];
}

/** Cards every enemy deck carries. A world where nobody holds Subjugate lets
 *  a passive player sit undisturbed for tens of turns; since falling is how a
 *  new player discovers the rest of the deck, sitting undisturbed is the worst
 *  outcome. Measured effect: see the 2026-07-29 new-player simulation spec. */
export const AI_DECK_GUARANTEED = ["subjugate", "raid"];

/** Randomized AI deck: every card in `guaranteed` plus each remaining
 *  deck-buildable non-basic at probability 0.5 (rolled per card, in stable
 *  CARDS order so a seeded rng is deterministic), grow-crops filling the rest.
 *
 *  Guaranteed ids are listed first so the DECK_SIZE cap can never drop one.
 *  Every non-basic is still rolled for, guaranteed or not, so a given seed
 *  consumes the same rng values whatever the guarantee list is and simulation
 *  arms stay comparable. Pass [] for the unarmed deck. */
export function buildAiDeck(
  rng: Rng,
  guaranteed: string[] = AI_DECK_GUARANTEED,
): string[] {
  const nonBasics = Object.values(CARDS)
    .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
    .map((c) => c.id);
  const rolled = nonBasics.filter(() => rng() < 0.5);
  const forced = nonBasics.filter((id) => guaranteed.includes(id));
  const included = [
    ...forced,
    ...rolled.filter((id) => !forced.includes(id)),
  ].slice(0, DECK_SIZE);
  return [
    ...included,
    ...Array.from({ length: DECK_SIZE - included.length }, () => "grow-crops"),
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
