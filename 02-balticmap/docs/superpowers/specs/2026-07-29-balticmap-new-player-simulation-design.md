# Balticmap: New-Player Subjugation Simulation - Design

Date: 2026-07-29
Status: implemented

## Goal

Answer two questions with reproducible numbers:

1. How fast does a new player get subjugated? A new player is modelled as
   someone who builds a deck of nothing but Grow potatoes and plays whatever
   the rules let them play.
2. Would enemy decks that always carry Subjugate and Raid make the world
   meaningfully more dangerous to that player?

Then keep the answers from rotting: a named scenario carries the pacing it is
expected to produce, and a change that shifts that pacing fails a check.

This is a narrow slice of
`2026-07-28-balticmap-ai-evaluation-and-balance-design.md`. It does not
implement the scoring AI, action records, or per-card metric suite described
there. It reuses the existing fixed-priority policy in `src/ai.ts` unchanged.

No production analytics; every result comes from a local seeded run.

## Deck arms

Three enemy-deck builders, compared on the same seeds:

| Arm | Enemy deck |
| --- | --- |
| `shipped` | what `buildAiDeck` builds today: Subjugate and Raid guaranteed, each remaining non-basic at p=0.5, potatoes fill to 10 |
| `unarmed` | no guarantees - every non-basic at p=0.5. The world as it stood before 2026-07-29 |
| `defensive` | Alliance and Bodyguard guaranteed, remaining non-basics at p=0.5 |

The `defensive` arm exists because a guaranteed pair means more non-potato
cards per deck (about 6.5 versus 5.5). Without a same-density arm whose
guaranteed cards are not aggressive, an armed-versus-unarmed delta cannot
distinguish "aggression matters" from "denser decks matter".

`buildAiDeck(rng, guaranteed = AI_DECK_GUARANTEED)` takes the guarantee list as
an optional argument. Every non-basic is rolled for whether or not it is
guaranteed, so a given seed consumes the same rng values in every arm and the
arms stay paired game for game.

## Injection

`pickFaction(state, factionId, rng, aiDeckFor?)` takes an optional deck-builder
callback, defaulting to `buildAiDeck`. This is the only change to production
game flow; the app calls it exactly as before.

## Simulation core - `src/sim.ts`

**Human policies.** `naive` asks `playableSet` for the human's options and
takes the first one - discarding the first card in discard mode, picking the
tribute track from the injected rng, and the first valid target if the card is
targeted. `competent` runs the same policy the enemies use.

**Human decks.** `potatoes` is ten Grow potatoes; `full` is the deck-screen
default from `buildDeck`.

**`runGame({ seed, humanFaction, aiDeckFor, humanTurn, humanDeck, turnCap })`.**
Builds a game over the real 26-faction map adjacency and alternates human and
AI turns until victory, defeat, or the turn cap. If a turn ever leaves
`playedThisTurn` false, the run throws with seed, turn, and actor rather than
spinning; a stuck turn is a bug, not a data point.

**`summarize(state, seed, humanFaction)`.** Derived from `state.log`:

- turn of the first `subjugated` event against the human, or null;
- how many times the human was subjugated, and how many times released (a
  vassal is freed when its own overlord is subjugated by a third party);
- turn of the `defeat` event, or null;
- outcome: `defeat`, `victory`, or `cap`;
- the faction that first subjugated the human, and the one that incorporated
  them.

## Scenarios - `src/scenarios.ts`

A scenario is a named run configuration plus the pacing it should produce: a
human policy, a human deck, an enemy arm, a game count, a first seed, a turn
cap, and inclusive `[min, max]` bands on aggregate metrics.

`npm run simulate:check` runs every scenario and exits non-zero if any band is
missed; `tests/scenarios.test.ts` runs the same checks in the suite, so a
change that shifts pacing fails `npm test` as well.

Bands are set from a measured run and then widened deliberately. Because every
scenario is fixed-seed, a band is not absorbing sampling noise - it states how
much drift from unrelated changes is acceptable before someone should look.
When a band legitimately moves, the new numbers and the reason belong in this
document.

Adding a run configuration means adding an entry to `SCENARIOS`. Nothing else
needs to change: the CLI and the test both enumerate the list.

## CLI - `scripts/simulate.ts`

Run through `vite-node`, which vitest already provides; no new dependency.

```
npm run simulate -- --games=500 --cap=150 --seed=1 --arms=shipped,unarmed,defensive
```

Every arm runs the same seed list and the same rotating human faction per game
index, so arms are paired game for game. `--json=<path>` writes the full
per-game report; generated reports are local artifacts and are not committed.

Reported per arm: share ever subjugated; median and mean turn of first
subjugation, always printed alongside the count of games where it never
happened; share ending in defeat and the median turn of defeat; the mean paired
per-seed difference against the first arm listed; and the five starting lands
that fall fastest and the five that last longest.

## Results, 2026-07-29

```
npm run simulate -- --games=500 --cap=150 --seed=1 --arms=unarmed,shipped,defensive
```

500 games per arm, seeds 1..500, 150-turn cap, the human faction rotating
through all 26 lands (19 or 20 games each), human deck ten Grow potatoes,
naive policy.

| Arm | ever subjugated | median first subjugation | mean | never | defeated | median defeat |
| --- | --- | --- | --- | --- | --- | --- |
| `unarmed` | 99.4% | turn 15 | 22.2 | 3 | 94.4% | turn 26.5 |
| `shipped` | 100% | turn 9 | 10.2 | 0 | 99.8% | turn 17 |
| `defensive` | 99.2% | turn 16 | 22.1 | 4 | 94.2% | turn 28 |

Share of games where the human is already a vassal by a given turn:

| Arm | by turn 5 | by turn 10 | by turn 20 | by turn 40 |
| --- | --- | --- | --- | --- |
| `unarmed` | 6.0% | 27.2% | 63.4% | 85.4% |
| `shipped` | 21.8% | 61.8% | 93.2% | 99.4% |
| `defensive` | 5.0% | 26.6% | 65.4% | 87.4% |

Paired against `unarmed` on the same seed and starting land:

- `shipped`: 12.03 turns sooner on average, 95% CI [10.40, 13.66], n=497.
  Sooner in 77.5% of paired games, unchanged in 9.3%, later in 13.3%.
- `defensive`: 0.10 turns later on average, 95% CI [-1.08, +1.29], n=494.
  Sooner in 47.6%, later in 44.7% - a coin flip.

### Findings

1. **A potato deck was never survivable, even unarmed.** Under the old decks
   the new player was somebody's vassal by turn 15 and incorporated by turn
   26.5 at the median; 94.4% lost outright inside 150 turns.
2. **Guaranteed Subjugate and Raid roughly halve that clock.** Median first
   subjugation 15 -> 9, median defeat 26.5 -> 17, share already subjugated by
   turn 10 27.2% -> 61.8%.
3. **The effect is aggression, not deck density.** The `defensive` arm holds
   the same number of non-potato cards but guarantees Alliance and Bodyguard,
   and lands within noise of `unarmed`. Without this arm the result could not
   be told apart from "enemies simply hold fewer potatoes".
4. **Starting land matters more than the deck arm.** Lower Daugava Livs fall at
   a median of turn 8 unarmed; Pomesanians hold to turn 41. That spread is
   wider than the gap between arms, which points at map position, not card mix,
   as the dominant difficulty dial for a first game.
5. **Holding the cards matters more than playing them well.** A naive player
   with the full deck is subjugated in 60% of games and defeated in only 29%,
   against 100% and 100% for the potato player, because Reclaim independence
   and Revolt keep arriving in hand and get played by position alone.

### Decision

Guaranteed Subjugate and Raid ship as the default (`AI_DECK_GUARANTEED`).

The reasoning is a design one, not a balance one: being subjugated is how a
new player is shown the rest of the card pool, so a passive opening should
resolve quickly rather than leave the player idling in an untouched world. The
numbers above set the pace at a median turn 9 rather than turn 15.

Accepted tradeoff: every enemy deck now holds two known cards, so enemy decks
are less varied than they were, and roughly one potato slot per deck is spent.
The `unarmed` arm and the `potatoes-unarmed-enemies` scenario stay in the
repository so the size of that tradeoff remains measurable.

### AI review

Required by the repository rule on card changes. This change alters deck
availability, not card rules, and needs no change to `src/ai.ts`:

- Legal-action generation is unaffected: `playability.ts` decides legality and
  targeting from board state, never from deck composition.
- Both guaranteed cards already have explicit strategic evaluation. Subjugate
  is priority 4 and picks the target with the largest lead rather than the
  first legal one; Raid is evaluated at priorities 5 and 7, either finishing a
  track one step from the threshold or building toward the nearest
  subjugation. Neither falls through to the first-playable path.
- Simulation metrics covering both cards are the tables above, and the
  scenarios now hold that pacing.

## Testing

- identical seed and configuration reproduce an identical summary;
- every arm holds ten cards and respects `maxPerDeck`, and the shipped arm
  always contains Subjugate and Raid;
- `buildAiDeck` consumes the same rng draws whatever the guarantee list is;
- a one-turn cap yields outcome `cap` with no subjugation recorded;
- the naive policy plays forced Pay tribute ahead of Grow potatoes;
- `summarize` extracts the right turns from a synthetic log;
- scenario bands are ordered, name known arms/policies/decks, and hold;
- a metric that cannot be measured counts as a miss, never as a pass.

## Out of scope

- The scoring AI, faction styles, and per-card metric suite from the AI
  evaluation spec.
- Any UI for simulation results.
