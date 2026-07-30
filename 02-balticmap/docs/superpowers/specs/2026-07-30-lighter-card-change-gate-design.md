# Lighter card-change gate

## Problem

The repo rule "Card changes must revisit AI and balance evidence" puts six
obligations on every card change, several of which are prose-work: bespoke
simulation metrics per card, a benchmark run compared against the committed
baseline, a measured discovery rate, and a written justification when no AI
change is needed. A one-line tweak to a card's cost pays the same toll as a new
card.

The suite is also slow, and lopsidedly so. Measured 2026-07-30 in
`02-balticmap`, `npm test` took 47.3s:

| file | time |
| --- | --- |
| `tests/scenarios.test.ts` (14 tests) | 46.2s |
| `tests/sim.test.ts` (36 tests) | 12.6s |
| `tests/rng-isolation.test.ts` (1 test) | 0.9s |
| the other 19 files (559 tests) | ~0.8s |

Two files are 97% of the cost. Nothing else is slow.

## Approach

Split the suite along that line and shrink the rule to the guards that are
already tests, so honouring them costs nothing.

The default gate for a card change becomes: fast tests pass, then the human
plays it and judges it. Balance evidence is produced on request, not per change.

## What stays in the fast gate

The split is only safe because the cheap tests are the load-bearing ones:

- `tests/ai.test.ts` `POLICY_COVERAGE` guard, 12ms. A card with no named branch
  in `chooseAction` still fails immediately.
- `tests/deck-screen.test.ts` and `tests/meta.test.ts`, 22ms. A card with no
  route by which the player learns it exists still fails.
- `tests/rng-isolation.test.ts`, 0.9s. This is the baseline diff. It replays ten
  seeded games against a committed fixture, so accidental rng drift is caught
  without running a single scenario band.

So the ~2.6s gate still refuses a card with no AI branch, no discovery route, or
a disturbed rng stream. What it stops doing is judging whether the change is
*good*.

## Scripts

| script | contents | cost |
| --- | --- | --- |
| `npm test` | everything except `sim` and `scenarios` | ~2.6s |
| `npm run balance` | those two files, then the world report | ~60s |
| `npm run test:all` | the whole suite | ~47s |

`npm test` excludes by repeated `--exclude` flags. A single brace glob
(`tests/{sim,scenarios}.test.ts`) silently inverts the selection under
vitest 2.1 and collects only `scenarios.test.ts`; two flags collect the correct
20 files. Do not "simplify" it back to one pattern.

`scripts/balance.ts` prints a report from `aggregateWorld` over
`runWorldBatch`, which already carries what the rule used to ask for per card:
`playShareByCard` (ignored or dominant), `firstLegalTargetShare` with
`targetedPlaysSeen` (targeting bias), `alliancesOnOwnTargetsShare` and the
waste counters, and `medianStallTurns` (stalemate). No new instrumentation in
`src/sim.ts`.

Discovery rate is deliberately *not* in the report. `WorldStats` does not track
which cards the human witnessed, and adding that plumbing to make this change
land would defeat its purpose. The discoverability *guard* is unaffected: it is
a test, it is free, and it stays in the fast gate. A measured discovery rate
stays an ad-hoc probe, written when a specific card is under suspicion.

## Cost accepted

Dropping `scenarios.test.ts` from `npm test` removes the pacing bands
(`new-player-potatoes`, `competent-full-deck` and the rest) from the commit
gate. A pacing regression now survives until someone runs `npm run balance` or
feels it while playing. That is a real loss, accepted deliberately: this is a
prototype whose author plays it, and 46s on every commit to catch a regression
the author would notice anyway is a bad trade.

## Rule rewrite

The two AGENTS.md sections collapse into one short section stating the two
must-hold guards and pointing at `npm run balance` for everything else. The
2026-07-30 fallthrough incident (27.7% of AI plays were last-resort
fallthroughs; Alliance and Assassinate ruler picked targets by faction sort
order) is why `POLICY_COVERAGE` is a test rather than a checklist item, so it is
kept - compressed to a sentence, not two paragraphs.

Card work ends with a playtest brief: what to play and what would look wrong.
That replaces the written balance justification.
