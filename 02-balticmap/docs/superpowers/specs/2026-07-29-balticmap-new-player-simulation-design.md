# Balticmap: New-Player Subjugation Simulation - Design

Date: 2026-07-29
Status: approved

## Goal

Answer two questions with reproducible numbers:

1. How fast does a new player get subjugated? A new player is modelled as
   someone who builds a deck of nothing but Grow potatoes and plays whatever
   the rules let them play.
2. Would enemy decks that always carry Subjugate and Raid make the world
   meaningfully more dangerous to that player?

This is a narrow slice of
`2026-07-28-balticmap-ai-evaluation-and-balance-design.md`. It does not
implement the scoring AI, action records, or per-card metric suite described
there. It reuses the existing fixed-priority policy in `src/ai.ts` unchanged,
so the numbers describe the game as it ships today.

No production analytics; every result comes from a local seeded run.

## Deck arms

Three enemy-deck builders, compared on the same seeds:

| Arm | Enemy deck |
| --- | --- |
| `baseline` | today's `buildAiDeck`: each deck-buildable non-basic at p=0.5, potatoes fill to 10 |
| `aggressive` | Subjugate and Raid always present, remaining non-basics still at p=0.5 |
| `control` | Alliance and Bodyguard always present, remaining non-basics still at p=0.5 |

The `control` arm exists because `aggressive` decks hold more non-potato cards
than `baseline` (about 6.5 versus 5.5 on average). Without a same-density arm
whose guaranteed cards are not aggressive, a baseline-to-aggressive delta
cannot distinguish "aggression matters" from "denser decks matter".

`buildAiDeck(rng, guaranteed = [])` grows one optional argument. With no
argument its behaviour is unchanged, card for card.

## Injection

`pickFaction(state, factionId, rng, aiDeckFor?)` takes an optional
deck-builder callback, defaulting to the current `buildAiDeck`. This is the
only change to production game code; the app calls it exactly as before.

## Simulation core - `src/sim.ts`

**Naive human policy.** Ask `playableSet` for the human's options. In discard
mode, discard the first card. Otherwise play the first playable index, picking
the tribute track from the injected rng and the first valid target if the card
is targeted. With a potato deck the only cards ever played are Grow potatoes
and forced Pay tribute.

**`runGame({ seed, humanFaction, aiDeckFor, turnCap })`.** Builds a game over
the real 26-faction map adjacency, sets the human deck to ten Grow potatoes,
and alternates human and AI turns until victory, defeat, or the turn cap. If a
turn ever leaves `playedThisTurn` false, the run throws with seed, turn, and
actor rather than spinning; a stuck turn is a bug, not a data point.

**`summarize(state, humanFaction)`.** Derived from `state.log`:

- turn of the first `subjugated` event against the human, or null;
- how many times the human was subjugated, and how many times released (a
  vassal is freed when its own overlord is subjugated by a third party);
- turn of the `defeat` event, or null;
- outcome: `defeat`, `victory`, or `cap`;
- the faction that first subjugated the human, and the one that incorporated
  them.

## CLI - `scripts/simulate.ts`

Run through `vite-node`, which vitest already provides; no new dependency.

```
npm run simulate -- --games=500 --cap=150 --seed=1 --arms=baseline,aggressive,control
```

Every arm runs the same seed list and the same rotating human faction per game
index, so arms are paired game for game. `--json=<path>` writes the full
per-game report; generated reports are local artifacts and are not committed.

## Reported metrics, per arm

- share of games where the human was ever subjugated;
- median and mean turn of first subjugation, always printed alongside the
  count of games where it never happened, never silently dropped;
- share of games ending in defeat, and the median turn of defeat;
- mean paired per-seed difference against `baseline`;
- the five starting lands that fall fastest and the five that last longest.

## Testing

- identical seed and configuration reproduce an identical summary;
- an aggressive deck always contains Subjugate and Raid, still holds ten
  cards, and respects `maxPerDeck`;
- `buildAiDeck(rng)` with no guarantee list is unchanged;
- a one-turn cap yields outcome `cap` with no subjugation recorded;
- the naive policy plays forced Pay tribute ahead of Grow potatoes;
- `summarize` extracts the right turns from a synthetic log.

## Results, 2026-07-29

Command:

```
npm run simulate -- --games=500 --cap=150 --seed=1 --arms=baseline,aggressive,control
```

500 games per arm, seeds 1..500, 150-turn cap, the human faction rotating
through all 26 lands (19 or 20 games each), human deck ten Grow potatoes.

| Arm | ever subjugated | median first subjugation | mean | never | defeated | median defeat |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 99.4% | turn 15 | 22.2 | 3 | 94.4% | turn 26.5 |
| aggressive | 100% | turn 9 | 10.2 | 0 | 99.8% | turn 17 |
| control | 99.2% | turn 16 | 22.1 | 4 | 94.2% | turn 28 |

Share of games where the human is already a vassal by a given turn:

| Arm | by turn 5 | by turn 10 | by turn 20 | by turn 40 |
| --- | --- | --- | --- | --- |
| baseline | 6.0% | 27.2% | 63.4% | 85.4% |
| aggressive | 21.8% | 61.8% | 93.2% | 99.4% |
| control | 5.0% | 26.6% | 65.4% | 87.4% |

Paired against baseline on the same seed and starting land:

- aggressive: 12.03 turns sooner on average, 95% CI [10.40, 13.66], n=497.
  Sooner in 77.5% of paired games, unchanged in 9.3%, later in 13.3%.
- control: 0.10 turns later on average, 95% CI [-1.08, +1.29], n=494. Sooner
  in 47.6%, later in 44.7% - a coin flip.

### Findings

1. **A potato deck is not survivable, and never was.** Under the shipped
   enemy decks the new player is somebody's vassal by turn 15 and incorporated
   by turn 26.5 at the median; 94.4% lose outright inside 150 turns. Only 3
   games in 500 ended with the player never having been a vassal. The
   prototype does not currently need help killing a passive player.
2. **Guaranteed Subjugate and Raid roughly halve that clock.** Median first
   subjugation falls 15 -> 9, median defeat 26.5 -> 17, and the share already
   subjugated by turn 10 goes 27.2% -> 61.8%.
3. **The effect is aggression, not deck density.** The control arm holds the
   same number of non-potato cards as the aggressive arm but guarantees
   Alliance and Bodyguard, and lands within noise of baseline. Without this
   arm the aggressive result could not be told apart from "enemies simply hold
   fewer potatoes".
4. **Starting land matters more than the deck arm.** Lower Daugava Livs fall
   at a median of turn 8 under baseline; Pomesanians hold to turn 41. The
   spread between best and worst land is wider than the gap between arms,
   which points at map position, not card mix, as the dominant difficulty
   dial for a first game.

### Decision

Not taken here. The measurement says the aggressive default would make an
already lethal opening lethal faster, which is a design question rather than a
correctness one. `buildAiDeck` still ships its current behaviour, and any
change to it should carry its own evidence note against this baseline.

## Out of scope

- The scoring AI, faction styles, and per-card metric suite from the AI
  evaluation spec.
- Changing the shipped `buildAiDeck` default. The measurement comes first; the
  default changes only as a separate, evidenced decision.
- Any UI for simulation results.
