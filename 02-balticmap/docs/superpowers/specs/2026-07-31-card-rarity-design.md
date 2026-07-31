# Balticmap: card rarity, measured rather than declared

Date: 2026-07-31
Status: approved

## Goal

Populate the rare and epic tiers that
`2026-07-31-card-acquisition-xp-packs-design.md` left empty, and write down
the rule that places every future card without a fresh argument each time.

Rarity sets one thing: how often a card appears in a pack. `RARITY_WEIGHTS`
gives each tier its share of a slot, and `openPack` picks uniformly inside
the tier it rolled. Rarity does not change what a card does in play. Every
non-basic is `maxPerDeck: 1` and every deck slot costs the same, so a rare
card is not a stronger card. It is a card that arrives later.

A card's tier follows from its measured impact. Higher impact means higher
rarity.

## The tier table

One ordered table replaces `RARITY_WEIGHTS`, the `CardRarity` union and the
threshold constants. It lives in `src/cards.ts`; `src/packs.ts` imports it.
The tiers are written down once.

```
RARITY_TIERS = [
  { id: "common", weight: 70, minImpact: -Infinity, colour: ... },
  { id: "rare",   weight: 25, minImpact: R,         colour: ... },
  { id: "epic",   weight:  5, minImpact: E,         colour: ... },
]
```

`CardRarity` derives from the table, so the union cannot drift from the
weights. `R` and `E` are set once, from the first regression run described
below, and then frozen. The colour values are chosen at implementation, under
the constraint in the display section.

A card's tier is **the highest tier whose `minImpact` it meets**. That rule
takes any number of tiers. Adding a fourth is one entry and one threshold,
and nothing else changes.

The first entry is the base tier. It is also the fallback when a rolled tier
holds no cards. `openPack` stops naming `"common"` and reads the table.

`rollTier` consumes exactly one rng value whatever it returns, and `openPack`
consumes exactly two per slot, so adding a tier does not shift the draw count
and committed seeds stay comparable. It does change which tier a given roll
lands in, which is expected. That note belongs in the table's comment, beside
the warning `CARDS` already carries about its own declaration order.

## Only the pack pool takes a measured tier

`ACQUIRABLE_CARDS` - eight cards today - takes a measured tier. Every other
card is common by rule.
That covers three groups, and none of them is ever drawn from a pack:

- the starting cards - today Raid, Subjugate, Fortify and Seeds of revolt -
  and any starting card added later;
- Grow turnips, free filler outside the pool;
- the injection-only cards, Revolt and the two tributes.

A tier on any of them would describe nothing.

The rule holds when a card moves between the two groups, which is the case
that would otherwise rot. Promoting a pack card into the starting set makes
it common, and its measured impact stays recorded.

The starting cards are still measured. Their numbers are what say whether the
pool's best card is stronger than Subjugate, and that is the context for
setting `E`. They just never take a tier.

## Measuring impact: random-deck regression

Impact is measured, not declared.

Build several hundred random legal decks. Play each with
`HUMAN_POLICIES.competent` on a fixed seed set. Regress the outcome on card
presence. Each card's coefficient is its impact.

This is the bulk pass. It ranks the whole pool, and it works at 8 cards and
at 50. It lives in `scripts/` behind its own `npm run rarity`, not inside
`npm run balance` and never inside `npm test`, for the reason the repo
`CLAUDE.md` gives: a suite that takes minutes taxes every commit.

The regression is plain least squares on a presence matrix, written out in
the script. One column per card, one row per deck, the realm size as the
response. The repo carries no statistics dependency and this does not add
one.

Two details make it work.

**The response variable must be continuous.** `GameSummary` has no such
field today: it carries outcome, first-subjugation turn, defeat turn and
counts. Over a few dozen games, `victoryShare` cannot separate eight cards.
Add the human's final realm size, via `fullRealmOf` - the full-realm question
by the rule in `CLAUDE.md`, since this is a number the player could check
against the map. Defeat scores 0 and victory scores the whole map, so one
number covers every outcome. Record survival turn as a secondary check.

**The decks need contrast.** There are 12 deck-buildable non-basics and 10
slots, so a uniform random deck holds almost everything and the regression
sees no variation. Draw a count first, between 3 and 8, then draw that many
cards and pad with Grow turnips. Past roughly 20 cards this stops mattering.

Measured cost: 246ms per game at a 150-turn cap with the competent policy, so
500 games is about two minutes.

## Placing one new card later

The bulk pass is the wrong tool for a single added card. Use a frozen
reference deck instead: the starting cards plus Grow turnips to fill.

Swap one turnip slot for the new card. Run one arm on the standard seeds.
Compare the delta against the stored table, and read the tier off the
thresholds. One arm of 24 games costs about six seconds.

A card that modifies another card scores near zero when its partner is
absent - Extended diplomacy does nothing without an Alliance. Such a card
names its partner, and the partner joins its reference arm. The bulk pass
catches this on its own, because partners co-occur across enough decks.

## Where the numbers live, and what the report says

A checked-in table maps card id to measured impact. It is the input to the
tier assignment and the record of how each tier was decided.

The balance report gains a rarity block: the impact table, each tier's size,
and each card's real draw chance per pack. Tier share is fixed but per-card
share falls as a tier fills, so the report warns when a tier holds so many
cards that one of them is effectively undrawable.

## Display: a coloured band on every pack-pool card

`RARITY_TIERS` carries a colour per tier. Every place that draws a card reads
it - the hand, the deck screen and the pack reveal. A fourth tier brings its
colour in the same entry.

A band rather than a text label, for the reason `CLAUDE.md` records under
"A dark box states its own text colour": the deck screen is dark and its card
boxes are light, and a label would need a colour declared for each. A band
shows on both. `.ds-pack-card` shipped with exactly that bug.

The band colours must not read as faction colours. The map owns that
vocabulary already.

A card outside the pack pool shows no band, for the same reason it takes no
tier.

## Tests

Five invariants, following the `POLICY_COVERAGE` precedent that prose does
not hold:

- a card in the pack pool has the `rarity` its stored impact falls in;
- a card outside the pack pool is `common`;
- tiers are ordered by ascending `minImpact`;
- a tier with a higher `minImpact` has a lower `weight`;
- the weights sum to 100, so they read as percentages.

The first two together are what stop a card being hand-tagged.

## The card gate

The card rule in `CLAUDE.md` gains one line. A new deck-buildable card needs
a measured impact and the tier that follows from it, next to its
`POLICY_COVERAGE` branch, its discovery route and its `NOTICE_RULES` entry.

## Out of scope

- Changing the 70 / 25 / 5 weights. They are the acquisition spec's numbers
  and this pass populates the tiers rather than retuning them.
- Duplicate handling. `openPack` deliberately never consults what the player
  already knows, and that stays.
- Any change to what a card does. This pass moves no card's effect.
