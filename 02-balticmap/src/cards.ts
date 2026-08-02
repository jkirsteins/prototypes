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
  // Both cuts sit in GAPS between measured impacts, never on a card, so a
  // rerun that nudges a coefficient cannot re-tier a card a player already
  // owns. They are absolute numbers on a scale that the pool's own size moves,
  // though - a denser enemy field shrinks every human realm and pulls every
  // coefficient toward zero with it - so adding cards means re-reading the
  // table and re-cutting, not just tagging the new ones. Take hostage joining
  // the pool was such a re-cut: the coefficients past the top two reordered
  // outright, so several cards changed tier with it.
  //
  // 0.147 is the midpoint of the 0.058 gap between A feast (0.176) and Found a
  // settlement (0.118), the widest separation in the table. Epic is measured,
  // and holds Incorporate and A feast.
  //
  // 0.044 is the midpoint of the runner-up gap, between Bodyguard (0.065) and
  // Alliance (0.023). Past the top of the table a card's measured contribution
  // to final realm size is small and noise-dominated, so the rare/common line
  // is a design decision about what feels worth finding rather than a
  // measurement. Treat it as something to playtest.
  //
  // An empty top tier is a real failure and not a tidy one: `rollTier` falls
  // back to the base tier, so 5% of pack slots would quietly become common
  // while the purple band went unused. tests/packs.test.ts refuses it.
  { id: "rare",   weight: 25, minImpact: 0.044, colour: "#1f6fd0" },
  { id: "epic",   weight:  5, minImpact: 0.147, colour: "#7b2fbf" },
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
   *    moved a track would be named in all but words. Every guard moves
   *    nothing: a guard's whole effect is that somebody else's card moved
   *    nothing either.
   *  - **Secrecy is not a discovery route, and it removes none.** A card is
   *    learnt from a pack (`openPack` in src/meta.ts is the only writer of
   *    `knownCards`), never from witnessing it, so hiding the name costs
   *    nothing here. A card that had no route but being witnessed must not
   *    ship - see the card rule in the repo CLAUDE.md - and marking one secret
   *    would not change that either way.
   *
   *  Every secret card in the game today is a guard - see `GUARDS` below, which
   *  also carries the reveal clause each of them needs. The two sets being
   *  identical is pinned in tests/cards.test.ts rather than assumed: a secret
   *  card that guards nothing would need its own reveal clause written from
   *  scratch. */
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
  "pay-military-tribute": { id: "pay-military-tribute", name: "Pay military tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, grant your overlord +1 Might. Overlords pass it on up their own chain of lords." },
  "pay-status-tribute": { id: "pay-status-tribute", name: "Pay status tribute", targeted: false, secret: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, grant your overlord +1 Status. Overlords pass it on up their own chain of lords." },
  "seeds-of-revolt": { id: "seeds-of-revolt", name: "Seeds of revolt", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "While a vassal: shuffle a Revolt into your deck. Only one Revolt at a time." },
  "revolt": { id: "revolt", name: "Revolt", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: false, forced: false, rarity: "common", text: "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you, and none may subjugate you for 2 turns. Leaves your deck for good." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Even the score: the Status lead between you and one faction in reach resets to none." },
  "alliance": { id: "alliance", name: "Alliance", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Seal a pact with one faction in reach: no hostile cards between you for 5 turns, and +1 Might for both of you against every faction bordering both realms. Sealed again with an ally, the pact runs 5 turns longer." },
  "extended-diplomacy": { id: "extended-diplomacy", name: "Extended diplomacy", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Patient envoys: your next Alliance lasts twice as long." },
  // Secret. The rules already treat a posted guard as hidden - `failureRiskOf`
  // in src/playability.ts refuses to read the guard lists so the Assassinate
  // ruler tooltip cannot become a detector - and a log line naming the card was
  // that detector by another route.
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Post a bodyguard: the next Assassinate ruler against you fails. No stacking. Others see only that you played a secret card." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "The signs are read: your next Might or Status gain counts double." },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Raise another settlement in one land of your realm, up to what your people support - two, and one more for each Population boom you hold. Each settlement adds +1 to the Might lead others need to subjugate you, and spends a boom." },
  // Appended, never inserted: `buildAiDeck` rolls one rng draw per entry here
  // in declaration order, so where a card sits decides which draw it answers
  // to. See the warning on DEFAULT_DECK.
  "population-boom": { id: "population-boom", name: "Population boom", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Your people multiply: one more settlement than your lands would otherwise support. Stacks, and waits in hand until a settlement is founded." },
  "a-feast": { id: "a-feast", name: "A feast", targeted: false, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "epic", text: "Gain +1 Status over every other living faction at once." },
  "distrustful-neighbour": { id: "distrustful-neighbour", name: "Distrustful neighbour", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Your neighbours grow wary: the next Alliance sealed with you fails. No stacking. Others see only that you played a secret card." },
  "eloping-heirs": { id: "eloping-heirs", name: "Eloping heirs", targeted: false, secret: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Your heirs slip away in the night: the next Shrewd marriage against you fails. No stacking. Others see only that you played a secret card." },
  "take-hostage": { id: "take-hostage", name: "Take hostage", targeted: true, secret: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "rare", text: "Take a hostage from a vassal of yours whose deck holds a Revolt: the Revolt cannot be played until they pay tribute twice and the hostage goes home." },
};

/** Guard card -> the card it turns aside, once, for whoever posted it.
 *
 *  Three cards, one mechanic, one table. Nothing about a guard is written per
 *  card: `GameState.guards` is keyed by the guard card id, `playCard` has one
 *  prevented branch, `cardBlockReason` answers `already-held` for any of them,
 *  `failureRiskOf` returns `{ kind: "hidden", because: <guard id> }` for any
 *  guarded card, and `revealedSecrets` in src/hud.ts pops the queue for
 *  `guardAgainst(cardId)`.
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
  "distrustful-neighbour": "alliance",
  "eloping-heirs": "shrewd-marriage",
};

export const isGuardCard = (cardId: string): boolean => cardId in GUARDS;

/** The guard that turns `cardId` aside, or undefined where nothing does.
 *  The reverse of GUARDS, derived rather than written out so the two cannot
 *  disagree. */
const GUARD_BY_TARGET: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(GUARDS).map(([guard, target]) => [target, guard]),
);

export const guardAgainst = (cardId: string): string | undefined =>
  GUARD_BY_TARGET[cardId];

/** Cards that move a track against EVERY living faction at once rather than
 *  against one target. They share a shape three places care about: `playCard`
 *  fans the bump out, `leadMovesOf` in src/standings.ts can only resolve the
 *  third-party half of one, and `impactText` in src/hud.ts prints
 *  "+N Might against all" instead of a single pair's before -> after.
 *
 *  A set rather than three `cardId === "fortify" || cardId === "a-feast"`
 *  chains, which is how the doubling rule drifted before DOUBLABLE_CARDS
 *  existed. The track each one moves is the card's own business and lives in
 *  `playCard`; this only says the fan-out shape applies. */
export const FAN_OUT_CARDS: ReadonlySet<string> = new Set(["fortify", "a-feast"]);

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
  "raid", "shrewd-marriage", "fortify", "a-feast", "revolt",
  ...Object.keys(TRIBUTE_CARDS),
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
