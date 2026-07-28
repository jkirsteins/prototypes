# Balticmap: AI Evaluation and Card Balance Evidence

Date: 2026-07-28
Status: approved

## Goal

Replace the aging fixed-priority enemy policy with a strong but readable
scoring policy, and add reproducible local simulations that reveal cards which
are ignored, wasted, dominant, or biased toward arbitrary targets.

This work records no production analytics and collects no player data.

## Design principles

- Enemy decisions should be strategically coherent without approximating
  perfect play.
- Forced rules remain absolute.
- Randomness may create variety among near-equal actions, but must not select
  clearly inferior actions.
- Every result must be reproducible from its seed.
- Faction personality changes style, not baseline competence.
- Simulation evidence informs balance decisions but does not make them
  automatically.

## AI architecture

### Complete legal actions

A pure action generator enumerates every complete legal action available to the
current player. A targeted card produces one action per valid target. Pay
Tribute produces one action per legal track. Untargeted cards and forced
discard produce their corresponding complete actions.

The generator delegates legality and targeting to `playability.ts`; it does not
duplicate card rules. Forced Pay Tribute and forced discard bypass ordinary
strategic competition.

### Scoring

Every non-forced action receives a score composed from named, inspectable
components:

- immediate progress toward subjugation or independence;
- realm growth and target value;
- defensive urgency;
- enemy value prevented;
- card synergy, including Extended Diplomacy before Alliance;
- opportunity cost and waste;
- pressure on the human when strategically justified;
- bounded faction-style modifiers.

Every current card receives explicit evaluation, including Revolt, Assassinate
Ruler, Alliance, Extended Diplomacy, and Bodyguard. There is no generic
"first playable card" or "first valid target" completion path for a known card.
Unknown cards cause an explicit evaluation error in development and simulation.

Score components are returned with the total so tests and simulation reports
can explain decisions. Non-finite component or total scores are errors.

### Selection and variety

The selector finds the highest score, then forms a candidate set containing
actions within a small configured margin of that score. Injected RNG selects
from the candidate set. A fixed seed therefore produces a fixed result, while
different seeds can vary between strategically comparable actions.

Stable action ordering is used only for reproducibility. It is not a strategic
tie-breaker.

### Faction styles

Faction profiles provide bounded preferences for aggression, diplomacy,
defense, and consolidation. Profiles may change which near-equal plan a faction
prefers, but cannot override forced rules or core competence safeguards.

Every faction must still:

- escape subjugation when a sound escape action is available;
- avoid actions with no useful effect when a useful alternative exists;
- take decisive conquest opportunities;
- avoid arbitrary faction-order targeting.

## Headless simulation

### Runs

A local command runs complete games without a DOM. Each batch:

- uses an explicit seed range and game count;
- rotates the human faction;
- runs the same scenarios against naive, competent, and greedy human policies;
- applies a configured turn cap;
- reports a capped game as a draw instead of discarding it.

The naive policy selects the first legal action. The competent policy uses the
general scoring system without faction modifiers. The greedy policy strongly
favors immediate realm expansion.

Policies are validated before a batch. An unknown policy, illegal selected
action, malformed result, or non-finite score fails the run with seed and turn
context.

### Action records

Each evaluated turn records:

- seed, turn, actor, and faction profile;
- card, target, and other action parameters;
- all legal alternatives;
- named score components and total score for every alternative;
- the selected action.

### Game summaries

Each game records:

- result and duration;
- final realm sizes;
- subjugations and incorporations;
- faction survival;
- cards included in each deck.

## Card metrics

The report calculates, per card:

- inclusion, draw, play, discard, and forced-play rates;
- average turns held before play;
- playable-but-not-chosen rate;
- null-effect or low-value play rate;
- immediate score contribution;
- realm growth, survival, and victory correlation;
- outcome difference when included versus excluded;
- synergy and conflict with other cards;
- target distribution and faction-order concentration;
- splits by human policy and faction profile.

No single metric labels a card as balanced or unbalanced. A card is flagged only
when several signals agree.

An underperforming flag requires evidence such as low selection when playable,
negative outcome difference, and frequent low-value resolutions. An
overperforming flag requires evidence such as a large positive outcome
difference across policies, unusually high first-choice rate, and limited
counterplay.

## Reports and baseline

The simulator writes a machine-readable JSON report and prints a compact
terminal summary. Full generated reports are local artifacts and are not
committed.

A small fixed-seed baseline fixture is committed for regression detection.
Regression tests use documented tolerant ranges for aggregate metrics rather
than exact aggregates. Exact reproducibility is tested separately for identical
seeds and configuration.

Every balance change includes an evidence note with:

- benchmark command;
- seed range and game count;
- relevant before and after metrics;
- intended gameplay effect;
- accepted tradeoffs.

## Project rule

The repository `AGENTS.md` requires any new or changed card in a card-playing
prototype to revisit AI action generation, strategic evaluation, decision
tests, simulation metrics, and the seeded balance benchmark in the same change.
If no AI code changes, the change must document why existing behavior is
intentionally sufficient.

Falling through to the first playable card or first legal target is not complete
AI support.

## Testing

### Unit tests

- Enumerate complete legal actions for targeted, untargeted, tribute, and
  discard cases.
- Cover every known card in action generation and scoring.
- Verify individual score components with constructed states.
- Reject unknown cards and non-finite scores.

### Decision tests

- Prefer useful actions over null-effect actions.
- Handle current card combinations and synergies.
- Reclaim or revolt appropriately while subjugated.
- Select Alliance, Assassinate Ruler, Bodyguard, and Extended Diplomacy for
  strategic reasons.
- Avoid arbitrary faction-order targeting when targets differ strategically.
- Permit seeded variety only inside the near-equal score margin.

### Simulation tests

- Reproduce identical results for identical seeds and configuration.
- Keep game length within the configured cap or report a draw.
- Produce evaluation and metric coverage for every included card.
- Detect unexplained target concentration.
- Keep fixed-seed aggregate metrics inside documented baseline ranges.

## Out of scope

- Production analytics or anonymized player telemetry.
- Network services or uploaded reports.
- Minimax, Monte Carlo tree search, or hidden-information search.
- Automatic balance changes based only on metric thresholds.
- A UI for simulation results.
