# Balticmap: Might That Scales With The Map - Design

Date: 2026-07-29
Status: implemented

## Problem

Might and Status grow by +1 a play. The Subjugate bar grows by 2 per land of
the target's realm. The bar therefore outruns the tracks: once a neighbour
holds four or five lands, a lead of 8 or 10 is needed, and a deck holding one
Raid and one Shrewd marriage supplies 2 points per full deck cycle. The game
settles into a stalemate where no faction can act on any other, and the run
neither resolves nor progresses.

Two dials, both requested:

1. Raid's gain scales with how much of the target's territory the actor's
   realm actually touches, so a large neighbour is a larger target rather than
   only a harder one.
2. A new card doubles the next gain, giving a deck a way to spend a turn to
   buy a bigger swing later.

A third change falls out of measuring the first two: today an AI cannot win, so
a game with no human collapse has no end state to measure.

## Rules changes

### Raid scales with border pressure

`playability.ts` gains:

```ts
export function borderStrength(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): number
```

It counts the lands in the actor's realm - `realmOf`, meaning the actor plus
its vassals plus the lands it has incorporated - that are adjacent to the
target's core. The target's core is the target itself plus the lands it has
incorporated; its vassals are excluded.

The counting rule is not arbitrary. `reachOf` already resolves an adjacent
land to `view.incorporated[adj] ?? adj`, which maps an incorporated land to its
owner and leaves a vassal as itself. `borderStrength` matches that resolution
exactly, so the set it counts against is the same set that made the Raid legal
in the first place. Two consequences follow:

- A legal Raid always has at least one bordering land, so `N >= 1` and a lone
  faction still gains the +1 it gains today. Nothing regresses.
- The bar shown on hover and the legality rule cannot disagree, because both
  derive from one resolution rule rather than two.

Raid grants `N` Might instead of a flat 1. `relations.ts` gains `bumpMightBy`
and `bumpStatusBy` taking an amount; `bumpMight` and `bumpStatus` become the
amount-1 case, so no existing caller changes.

A vassal's own incorporated lands stay attributed to the vassal, not to its
lord, because `realmOf` walks one level. That is the existing meaning of realm
throughout the rules and this change does not alter it.

> Amended 2026-07-31. The sentence above still holds for the Might rules it was
> written about - the subjugation bar and `borderStrength` keep the one-level
> `realmOf`, because Subjugate frees its target's vassals the moment it lands.
> It is no longer true "throughout the rules": the scoreboard and the win
> condition now count with `fullRealmOf`, which does attribute a vassal's
> annexations to its lord. See "Two realm sizes, and only one of them is a
> score" in `AGENTS.md`.

### Favourable omens

A new deck-buildable non-basic, one per deck, untargeted:

> Favourable omens - "The signs are read: your next Might or Status gain counts
> double."

`GameState` gains `omens: string[]`, faction ids holding an unspent reading.
This is the same shape as the existing `bodyguards` and `diplomacyBoost`
arrays and is added to `RulesView` alongside them. The card is unplayable
while you already hold a reading, exactly as Bodyguard is unplayable while one
is posted, so readings never stack.

Playing a card in this set spends the reading and doubles every counter that
card moves:

| Card | Normal | Doubled |
| --- | --- | --- |
| Raid | +N Might | +2N Might |
| Shrewd marriage | +1 Status | +2 Status |
| Fortify | +1 Might vs every living faction | +2 Might vs each |
| Revolt | +1 Might and +1 Status vs the former lord | +2 and +2 |
| Pay tribute | +1 to the lord and its incorporated lands | +2 to each |

Every other card - Subjugate, Incorporate, Assassinate ruler, Alliance,
Bodyguard, Reclaim independence, Grow potatoes, Favourable omens itself -
resolves normally and leaves the reading in reserve. A reading is therefore
never wasted on a card that has no number to double.

Pay tribute is deliberately in the doubling set even though it is forced and
even though it helps the payer's overlord. Holding a reading while subjugated
is a real cost, which is what stops the card from being free to hoard.

Alliance duration remains Extended diplomacy's effect and is not in the
doubling set, so the two modifiers are disjoint. Nothing in the game
multiplies an Alliance by four.

The `play` log event gains `doubled?: boolean`, mirroring the `prevented?:
boolean` that Bodyguard already sets, so the activity log can say a card landed
doubled without a second event type.

`favourable-omens` is appended at the end of `CARDS`. `buildDeck()` takes the
first `DECK_SIZE` non-basics and there are already more non-basics than deck
slots by design - the human picks up to ten on the deck screen and the AI rolls
its own - so appending leaves `buildDeck()` producing exactly what it produces
today, and the existing `full`-deck scenarios do not shift on account of deck
composition. The deck screen and `buildAiDeck` both enumerate `CARDS`, so the
card reaches the player and the enemies with no further change.

### Any faction can win

`playCard`'s ending block asks only about seat 1 today, so an AI that unifies
the Balts is not recognised and a game without a human collapse never ends.

`GameState` gains `humanSeat: number | null`, set to 0 by `newGame`. The
ending block consults it rather than hardcoding `players[0]`, and `advance`'s
never-skip-index-0 rule becomes never-skip-the-human-seat. The order is:

1. the human seat's faction is incorporated -> `defeat`;
2. else the human seat's realm is at `victoryRealmSize` -> `victory`;
3. else any other faction's realm is at `victoryRealmSize` -> `defeat`, with a
   new `unified` event naming the winner.

The three cannot collide: `victoryRealmSize(26)` is 15 lands and two factions
cannot both hold 15 of 26.

With `humanSeat: null` there is no seat whose incorporation ends anything and
no seat that `advance` refuses to skip, so a run ends only on unification or a
turn cap. That is what the world simulation below needs, and it is the only
reason the field exists. Everything outside the ending block and `advance`
keeps addressing the human as index 0 and player id 1, as it does now.

`unified` is a new `GameEventType` carrying `overlordFactionId` for the winner.
The post-mortem screen distinguishes it from incorporation, since "X unified
the Balts" and "incorporated by X" are different endings for the player.

## AI policy

Required by the repository rule that a card change must revisit the AI. Both
dials get explicit strategic evaluation; neither falls through to the
first-playable path.

A shared helper returns what a play would actually move:

```ts
function gainOf(view, actorFactionId, cardId, targetId): number
```

`borderStrength` for Raid, 1 for Shrewd marriage, doubled when the actor holds
an unspent reading.

**Step 5, finishing a threshold.** Today it tests `lead === needed - 1`, which
assumes every play is worth exactly 1. It becomes `lead + gainOf(...) >=
needed`, so a Raid worth +4 correctly finishes a four-point gap and a doubled
Raid finishes an eight-point one. Without this the AI would sit one large Raid
away from a subjugation and not see it.

**Step 7, building toward the closest subjugation.** Today it ranks candidate
targets by raw point deficit. With variable gains that ranks the wrong thing:
a 6-point gap closed 3 at a time is nearer than a 4-point gap closed 1 at a
time. It ranks by `ceil(deficit / gainOf(...))`, the plays still required, tie
-broken by faction order as today.

**New step 6b, playing a reading.** Between the defensive Fortify (6) and the
build (7): play Favourable omens when the actor holds it, holds no unspent
reading, holds a doublable card, and is not a vassal.

- The vassal guard is the point of putting Pay tribute in the doubling set. An
  AI holding a reading while subjugated would hand its overlord double.
- Before the build is correct rather than merely tempting. Raid is one per
  deck, so over two turns Omens-then-Raid yields 2N where Raid-then-filler
  yields N.
- After step 5 means a reading never delays a play that wins a subjugation
  outright.
- Sitting after the defensive Fortify step (6) rather than before it is a
  deliberate tradeoff, not an oversight: an AI holding Favourable omens,
  Fortify, and facing a threat plays Fortify undoubled and keeps the reading
  for the build step, forgoing +2 Might against every living faction. That
  is accepted because Fortify's own defensive value does not depend on being
  doubled, while the build step (7) is where a reading reliably shortens the
  game (see Results below); ordering the reading first would trade a
  measured win for an unmeasured one.

## Hover

Requested: an active modifier must be visible on card hover before the card is
played. Two of the three modifiers are invisible today.

`hud.ts` already builds a `card-tip` per hand card holding a description and
target lines. It gains a modifier line rendered above the description, fed by a
new `cb.cardModifiers?.(cardId): string[]` callback that `main.ts` fills from
game state. `hud.ts` stays free of rules knowledge, as it is now.

| Hovering | With | Line |
| --- | --- | --- |
| a doublable card | a reading held | "Favourable omens: this card counts double." |
| Alliance | Extended diplomacy held | "Extended diplomacy: this Alliance lasts 10 turns." |
| Favourable omens | a reading held | "A reading is already in hand." |
| Bodyguard | a bodyguard posted | "A bodyguard is already posted." |

Raid's per-target lines need the number, since `borderStrength` is otherwise
invisible and unguessable from the map. `explainTargetEligibility` gains an
optional `annotate?: (factionId: string) => string[]` whose lines are appended
to available entries, and `main.ts` supplies it for Raid: "+3 Might", or "+6
Might (doubled)" when a reading is held. Subjugate's existing required-lead
lines are unchanged.

## Evaluation

### World runs

`runWorld({ seed, deck, raidRule, turnCap })` in `src/sim.ts` builds a game
with `humanSeat: null`, all 26 seats holding the same deck and playing the
competent policy, and runs to unification or the cap.

`WorldSummary`:

- `endTurn`, `winner` (faction id or null), `outcome`: `unified` or `cap`;
- `subjugations`, `incorporations`: how much happened at all;
- `largestRealm`: the biggest realm any faction reached;
- `turnsSinceLastIncorporation` at the end.

The last three exist to tell a stalemate from a slow game. A run that hits the
cap with a largest realm of 3 and nothing incorporated for 60 turns is the
failure mode this whole design is aimed at, and it should be visible as a
number rather than as an undifferentiated "cap".

### Arms

Arms differ by a rule as well as by a deck, which the current harness cannot
express. `GameState` gains `raidRule: "border" | "flat"`.

This is a feature flag in production state, and a flag that silently defaults
to the wrong value is worse than no flag. Three constraints make the value
impossible to get wrong by accident, and a fourth removes the flag once it has
done its job.

**It is required, never optional.** `raidRule: "border" | "flat"` is declared
without `?`, so every site that builds a `GameState` fails to compile until it
states a value. There is no `?? "border"` anywhere; a fallback is exactly the
construct that would let a missing value pass unnoticed.

**It lives on `GameState` only, not on `RulesView`.** The rule is read in one
place, the Raid branch of `playCard`. `borderStrength` itself is a pure
function of the board and is not conditioned on it. That keeps `viewOf`
unchanged and means the many tests that build a `RulesView` directly are
untouched, so adding the flag now and deleting it later is a small diff both
times.

**Hover is never conditioned on it.** The tip always shows the border number,
because the shipped game is always `"border"`. The `"flat"` value exists only
inside simulation arms and never reaches a rendered frame.

**A test pins the blast radius.** `newGame()` produces `"border"`, and
`"flat"` appears in exactly one place in the source: the `conquest-flat` arm
definition in `src/sim.ts`. If a second place ever sets it, that test fails.

### Retiring the flag

`GameState.raidRule` existed only for the length of this branch, to let the
world harness produce the `conquest-flat` numbers now recorded in Results.
The Results section confirmed `"border"` as the rule worth shipping:
`conquest-scaled` beat `conquest-flat` on every metric that matters (unified
share, median end turn, capShare), by a wide margin rather than a marginal
one. With that measurement recorded, the flag had done its job, and the same
branch removed it: `GameState.raidRule`, the `RaidRule` type, the `"flat"`
branch in `playCard`'s Raid resolution, and the `conquest-flat` arm and its
scenario are all gone. `gainOf` in `src/ai.ts` and the Raid branch in
`src/game.ts` now call `borderStrength` unconditionally.

Accepted cost: the `conquest-flat` baseline is no longer runnable. It
survives only as the numbers recorded in this document - the three-arm table
above, the 104-worlds-per-arm confirmation below, and the per-scenario notes
are the only remaining record of what the flat rule produced. This is
unlike the `unarmed` deck arm, which stays live in `DECK_ARMS` and can be
re-run at any time, because `unarmed` is a deck variation the harness already
expresses naturally, whereas the flat Raid rule was a branch in the rules
that every future reader of `playCard` would otherwise have to understand and
step around.

| Arm | Deck (10 cards) | Raid |
| --- | --- | --- |
| `conquest-flat` | raid, subjugate, incorporate, 7x grow-crops | +1 |
| `conquest-scaled` | raid, subjugate, incorporate, 7x grow-crops | +N |
| `conquest-omens` | raid, subjugate, incorporate, favourable-omens, 6x grow-crops | +N |

All three run the same seed list, so every game is paired. `conquest-scaled`
exists to attribute a result: without it, a shorter game under `conquest-omens`
cannot be told apart from "the deck simply holds one more non-potato card",
the same reasoning that put the `defensive` arm in the 2026-07-29 new-player
spec.

Reported per arm: share reaching unification, median and mean end turn over
those runs, cap share, and the stall metrics above.

Success is `conquest-omens` and `conquest-scaled` reaching unification more
often and sooner than `conquest-flat`.

### Scenarios

`Scenario` is human-shaped - a human policy, a human deck, an enemy arm, and
expectations about subjugation of the human. World runs have none of those, so
they go in a separate `WORLD_SCENARIOS` list with a `WorldExpectation` type
(`unifiedShare`, `medianEndTurn`, `capShare`), enumerated by the same
`npm run simulate:check` CLI and the same test file. The existing type is left
intact rather than widened with fields that are meaningless on one side.

The four existing scenarios are re-measured and re-banded against the new
rules. The potato player is incorporated long before any faction holds 15
lands, so little movement is expected there; `competent-full-deck` at an
80-turn cap plausibly now ends on a rival unification. Whatever the measured
numbers are, they and the reason for the move are recorded in this document
before the change lands, per the standing rule on bands.

## Testing

- `borderStrength`: the actor's vassals and incorporated lands count, the
  target's vassals do not, the target's incorporated lands do, and a legal Raid
  never yields 0.
- Raid applies `borderStrength` Might, and `2 * borderStrength` with a reading.
- A reading doubles each of the five doublable cards and is spent by each.
- A reading passes through every other card and survives.
- Favourable omens is unplayable while a reading is held; readings never stack.
- A forced Pay tribute burns a reading and doubles what the lord receives.
- The `unified` ending fires for a rival at victory size and emits the event.
- `advance` skips an incorporated seat when it is not the human seat, and never
  skips the human seat.
- The AI plays a reading before a build, never before a finishing play, and
  never while a vassal.
- The AI's finishing step recognises a multi-point Raid, and its build step
  ranks by plays remaining rather than by point deficit.
- Hover produces the right modifier line for each of the four cases, and Raid's
  target lines carry the gain.
- Identical seeds reproduce identical `WorldSummary` values.
- `newGame()` produces `raidRule: "border"`, and a source scan finds `"flat"`
  in exactly one place, the `conquest-flat` arm. Both assertions are deleted
  along with the flag in the retirement step.
- Every existing test still passes, or its band is re-measured and the new
  number recorded here with a reason.

## Results

### World runs

```
npm run simulate:world -- --games=26 --cap=300 --seed=1
```

26 worlds per arm, seeds 1..26, 300-turn cap, 26 equal seats, all seats
playing the same deck and the same policy, arms paired seed for seed.

| arm | unified | median end | mean end | capped | median stall | median biggest realm | mean subjugations | mean incorporations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conquest-flat` | 57.7% | 243.0 | 244.3 | 42.3% | 110.0 | 15.5 | 24.8 | 23.4 |
| `conquest-scaled` | 92.3% | 110.0 | 115.7 | 7.7% | 217.5 | 17.5 | 25.4 | 23.8 |
| `conquest-omens` | 96.2% | 70.0 | 79.4 | 3.8% | 241.0 | 18.0 | 25.8 | 23.8 |

`median end` and `mean end` are over resolved worlds only. `median stall` is
turns since the last incorporation, over capped worlds only.

### Findings

1. **`conquest-scaled` resolves more worlds, and sooner, than
   `conquest-flat`.** Unified share rises 57.7% -> 92.3%, a gain of 34.6
   points; capped share falls in step, 42.3% -> 7.7%, so under a fifth as
   many worlds now time out. Median end turn drops 243.0 -> 110.0 and mean
   end turn 244.3 -> 115.7, both to well under half their old value. The two
   arms differ only in the Raid rule and run the identical fixed deck, so
   this is the scaling dial alone doing the work.

2. **`conquest-omens` adds a further, smaller improvement beyond
   `conquest-scaled`.** Unified share rises again, 92.3% -> 96.2% (+3.9
   points), and median end turn falls again, 110.0 -> 70.0, another 40 turns
   and a further 36% cut; mean end turn 115.7 -> 79.4. The two arms differ in
   deck composition, not just in whether Favourable omens does something:
   `CONQUEST_DECK` holds 3 live cards and 7 Grow potatoes, `CONQUEST_OMENS_DECK`
   holds 4 live cards and 6 potatoes, so a naive reading could credit the
   improvement to a denser or more varied deck rather than to the card
   itself. A control experiment rules that out. Both arms draw from a
   10-card deck, so Raid/Subjugate/Incorporate throughput per cycle is
   identical regardless of what the fourth slot holds; a fourth card only
   moves the result if it is played and does something. Swapping the fourth
   card for one that is strategically inert in this deck - Bodyguard, which
   only matters against Assassinate ruler, a card no arm here carries - at
   the same 26 seeds and 300-turn cap:

   | arm | unified | median end | mean end | capped |
   | --- | --- | --- | --- | --- |
   | `conquest-scaled` (3 live cards) | 92.3% | 110 | 115.7 | 7.7% |
   | `conquest-omens` (4 live cards) | 96.2% | 70 | 79.4 | 3.8% |
   | control, 4th card = `bodyguard` | 92.3% | 110 | 115.7 | 7.7% |
   | control, 4th card = `extended-diplomacy` | 92.3% | 110 | 115.7 | 7.7% |

   Both controls land exactly on `conquest-scaled` - adding a fourth card
   that never fires changes nothing. So deck size and card count are not the
   confound; the 40-turn improvement is Favourable omens and the AI's use of
   it doing real work. The Bodyguard control is committed as the
   `conquest-inert` arm in `WORLD_ARMS` (`src/sim.ts`) so a reader can rerun
   it directly: `npm run simulate:world -- --games=26 --cap=300 --seed=1
   --arms=conquest-scaled,conquest-omens,conquest-inert`. It carries no
   committed scenario band - it is a control to rerun on demand, not pacing
   to protect against regression.

3. **The stall metrics fell, but `median stall` on its own is the wrong
   number to read.** The honest stall statistic is `capShare`: 42.3% ->
   7.7% -> 3.8%, an order-of-magnitude fall in the share of worlds that fail
   to resolve inside 300 turns. `median stall` instead rises, 110.0 -> 217.5
   -> 241.0, and that rise is a selection effect, not the stall getting
   worse. It is computed only over capped worlds. Under the flat rule, a
   large and varied population of worlds caps, including many that were
   still making slow progress, so their median stall is low. Under the
   better rules almost nothing caps, and the handful that still do are the
   genuinely hopeless ones, so the survivors' median stall is higher even
   though the actual incidence of stalling has fallen by an order of
   magnitude. Read the two numbers together: capShare says stalling became
   rare; median stall says the worlds that still stall, stall hard, which is
   consistent, not contradictory.

Two further columns support the same conclusion without needing a finding of
their own: median biggest realm rises 15.5 -> 17.5 -> 18.0, and mean
subjugations/incorporations rise slightly, 24.8/23.4 -> 25.4/23.8 -> 25.8/23.8.
Worlds are not just ending sooner, they are ending because the map is
genuinely consolidating further, not because some other stopping condition is
firing early.

**Success, as defined in the Arms section above, is met**: both
`conquest-scaled` and `conquest-omens` reach unification more often and
sooner than `conquest-flat`, and `conquest-omens` is the best of the three.

### Confirmation at 104 worlds per arm

```
npm run simulate:world -- --games=104 --cap=300 --seed=1
```

Run while `conquest-flat` was still live, before the retirement step below,
purely to check that the 26-world finding was not a small-sample artifact:

| arm | unified | median end | mean end | capped | median stall | median biggest realm |
| --- | --- | --- | --- | --- | --- | --- |
| `conquest-flat` | 58.7% | 237.0 | 237.5 | 41.3% | 125.0 | 15.0 |
| `conquest-scaled` | 87.5% | 109.0 | 119.4 | 12.5% | 216.0 | 17.0 |
| `conquest-omens` | 95.2% | 72.0 | 82.7 | 4.8% | 240.0 | 17.0 |

The finding is stable across sample sizes: `conquest-scaled` still resolves
far more worlds, and sooner, than `conquest-flat` (87.5% vs 58.7% unified,
109.0 vs 237.0 median end turn), and `conquest-omens` is still the best of
the three. The committed scenario bands in `src/scenarios.ts` are derived
from the 26-world run above, not this one - a band must match the sample its
scenario actually runs at (26 games, per `WORLD_SCENARIOS`), so widening a
band using numbers from a run of a different size would make the band
describe a check the scenario never performs. This 104-world run is
corroboration that the 26-world finding generalizes, not the basis for any
committed band.

`median stall` again rises across the arms - 125.0 -> 216.0 -> 240.0 - and
that is the same selection effect described for the 26-world run above, not
a regression: the metric is computed only over capped worlds, and `capped`
collapses in step, 41.3% -> 12.5% -> 4.8%. As the better rules shrink the
population of worlds that still time out, the few that remain are the
genuinely hopeless ones, so their stall figure rises even as stalling itself
becomes rarer. Read `capped` and `median stall` together, as before: `capped`
says stalling became rare, `median stall` says the worlds that still stall,
stall hard.

### Existing scenario bands that moved

All four human-perspective scenarios in `src/scenarios.ts` were re-measured
from scratch against the new rules; their `// measured x` comments record the
exact values. The bands moved for reasons other than Raid scaling, and a
reader of this document in six months needs to know why, because none of the
four scenarios' enemies border a human realm the way the conquest arms do -
their movement comes from elsewhere:

1. **A 12th deck-buildable card made every AI deck denser.** `buildAiDeck`
   rolls each non-basic at p=0.5 and slices to 10, so going from 11 to 12
   candidates (Favourable omens now exists) raised the expected non-potato
   count per enemy deck from about 6.5 to about 7. Enemy decks in every
   scenario that uses the `shipped` or `unarmed` arm are permanently more
   aggressive as a side effect of the card existing at all, independent of
   anyone ever drawing it. The human's own deck is unaffected, because
   `buildDeck` takes the first 10 non-basics and the card is appended last.
2. **The AI got materially better.** It now recognises that a multi-point
   Raid can finish a threshold outright (step 5), and ranks build targets by
   plays remaining rather than raw point deficit (step 7). A competent
   player, and a naive player facing competent enemies, is subjugated sooner
   as a result.
3. **A metric bug was fixed mid-plan.** `summarize()` derived the defeat
   cause only from `"defeat"` events, so a rival unification - which logs
   `"unified"` while setting phase to `"defeat"` - was silently dropped from
   `defeatShare` and `medianDefeatTurn`. Measured before the fix,
   `flailing-full-deck` had 29 games ending in defeat but only 27 defeat
   events; its `defeatShare` band moved from a badly undercounted
   [0.15, 0.45] to a correctly counted [0.54, 0.84] (measured 0.69) for that
   reason above all others.
4. **The conquest arms are immune to cause 1**, because they use explicit
   fixed decks rather than `buildAiDeck`, which is exactly why the
   three-arm world comparison above can be attributed to the Raid rule and
   to Favourable omens rather than to deck density.

Per scenario:

- `new-player-potatoes` (naive, potatoes, `shipped`): subjugated share holds
  at 1.00; `medianFirstSubjugation` tightens 5-13 -> 4-11 (measured 7.00) and
  `medianDefeatTurn` tightens 10-24 -> 7-20 (measured 13.00), both faster
  because of causes 1 and 2 acting on the `shipped` arm's enemy decks.
- `potatoes-unarmed-enemies` (naive, potatoes, `unarmed`): the same shift,
  smaller, because the `unarmed` arm has no guaranteed cards to begin with -
  `medianFirstSubjugation` moves 10-24 -> 8-22 (measured 14.50) and
  `defeatShare` 0.8-1 -> 0.66-0.96 (measured 0.81), on cause 1 alone (the
  AI-quality change in cause 2 applies here too, but the unarmed deck is the
  larger lever).
- `flailing-full-deck` (naive, full deck, `shipped`): the scenario most
  exposed to cause 3. `defeatShare` moves from 0.15-0.45 to 0.54-0.84
  (measured 0.69), which is the metric-bug fix, not a pacing change;
  `subjugatedShare` also widens upward, 0.42-0.78 -> 0.62-0.92 (measured
  0.77), on causes 1 and 2.
- `competent-full-deck` (competent, full deck, `shipped`): the scenario most
  exposed to cause 2, since the human plays the same policy the AI does.
  `medianFirstSubjugation` collapses from 8-40 to 3-9 (measured 6.00) - a
  competent opponent that recognises a finishing Raid ends the contest far
  faster than the old lead-by-lead AI did. This is the scenario the original
  design flagged as one that "plausibly now ends on a rival unification";
  that is exactly what the measured run shows.

## Correction: the default deck did not carry Favourable omens

Found after the Results section above was written and believed done: the
world-run evidence for this whole design was measured only against the
`conquest-*` arms, which use a deliberately narrow deck (Raid, Subjugate,
Incorporate plus Grow potatoes filler) built to isolate the subjugation loop.
Measured instead with the actual ten-card deck a human player is offered -
`buildDeck()`'s output, unchanged since this design shipped - worlds resolved
only 50.0% of the time at a median of 237 turns: essentially the pre-change
stalemate baseline this whole design set out to fix, not the 92-96% / 70-110
turn result reported above.

**Cause.** The "Favourable omens" section above states the reasoning
plainly and it was wrong in its consequence: `favourable-omens` was appended
at the end of `CARDS` specifically so that `buildDeck()`'s "take the first
`DECK_SIZE` non-basics in `CARDS` declaration order" logic would keep
returning the same ten cards it always had, on the theory that this would
leave the `full`-deck scenarios undisturbed. It did leave them undisturbed -
by keeping Favourable omens out of the default deck entirely. The default
deck a real player builds, and the `full` arm the `flailing-full-deck` and
`competent-full-deck` scenarios exercise, never contained the card whose
whole purpose was to help resolve the stalemate. The conquest arms never
noticed because they build their decks explicitly (`CONQUEST_DECK`,
`CONQUEST_OMENS_DECK`) rather than through `buildDeck()`, so they were never
exposed to this bug - which is exactly why they could not have caught it.

**Fix.** `buildDeck()` in `src/cards.ts` no longer derives its output from
`CARDS` declaration order at all. It now returns an explicit, named
`DEFAULT_DECK` constant - the previous default deck with `extended-diplomacy`
replaced by `favourable-omens` - padded with `grow-crops` only if the constant
is ever shorter than `DECK_SIZE`. `CARDS`'s declaration order is unchanged and
must stay unchanged: `buildAiDeck` draws one rng value per non-basic in that
order (`nonBasics.filter(() => rng() < 0.5)`), so reordering `CARDS` would
silently remap every seed's rng draws and move every committed AI-deck band.
`DEFAULT_DECK` and the comment on it both call this out for future readers.

Measured with the fix, 26 worlds, 26 equal seats, seeds 1..26, 300-turn cap:

| deck all seats play | unified | median end turn | capped |
| --- | --- | --- | --- |
| full default (no omens, the bug) | 50.0% | 237.0 | 50.0% |
| full default, omens replacing extended-diplomacy (the fix) | 92.3% | 114.5 | 7.7% |

This arm now ships as `full-deck` in `WORLD_ARMS` (`src/sim.ts`) and
`WORLD_SCENARIOS` (`src/scenarios.ts`), 26 games, seed 1, 300-turn cap,
`unifiedShare` banded `[0.77, 1]` (measured 0.923) and `medianEndTurn` banded
`[68, 172]` (measured 114.5). It exists so the conquest arms - which isolate
the subjugation loop but, as shown above, overstate how fast a real game
resolves - are no longer the only committed evidence that this design's fix
holds up in the deck shape a player actually plays.

**Bands that moved.** Making `buildDeck()` explicit changes `HUMAN_DECKS.full`
(Favourable omens in, Extended diplomacy out), which changes what the two
`full`-deck human scenarios in `src/scenarios.ts` measure. Re-measured at
their existing game counts and turn caps:

- `flailing-full-deck` (52 games, naive policy, 80-turn cap):
  `subjugatedShare` moves `[0.62, 0.92]` (measured 0.77) -> `[0.45, 0.75]`
  (measured 0.60); `medianFirstSubjugation` moves `[7, 19]` (measured 12.50)
  -> `[3, 9]` (measured 6.00); `defeatShare` moves `[0.54, 0.84]` (measured
  0.69) -> `[0.33, 0.63]` (measured 0.48).
- `competent-full-deck` (26 games, competent policy, 80-turn cap):
  `subjugatedShare` moves `[0.66, 0.96]` (measured 0.81) -> `[0.47, 0.77]`
  (measured 0.62); `medianFirstSubjugation` moves `[3, 9]` (measured 6.00) ->
  `[3, 8]` (measured 5.00).

These moves are not all in the same direction for the player, and reading
them as "the scenarios got easier" would be wrong. Of the three metrics that
moved, two are better for the player and one is not:

- `subjugatedShare` (0.77 -> 0.60 for `flailing-full-deck`, 0.81 -> 0.62 for
  `competent-full-deck`) and `defeatShare` (0.69 -> 0.48) both fall: the
  human is subjugated, and defeated, less often. Better for the player.
- `medianFirstSubjugation` also falls (12.50 -> 6.00, and 6.00 -> 5.00), but
  a lower first-subjugation turn is worse for the player, not better: among
  the games where the human still ends up subjugated, it now happens sooner.

This is a selection effect, the same shape as the `median stall` one already
noted above for the world runs, and it is worth being explicit about rather
than leaving the reader to reconcile three numbers that look like they
disagree. A deck that trades Extended diplomacy (which only ever matters
alongside Alliance) for Favourable omens (which sharpens whichever Raid or
Shrewd marriage follows it) makes the human's own deck a little better at
holding off subjugation altogether - hence `subjugatedShare` and
`defeatShare` both falling. But the games the human now survives are
disproportionately the ones where subjugation, if it happened at all, would
have come late; those games drop out of the `medianFirstSubjugation`
population entirely rather than pulling its median up. What is left is
dominated by the early, hard-to-prevent subjugations that were always going
to happen regardless of the human's deck, so the median of the surviving
population falls even though no single game's subjugation moved earlier.
Read `subjugatedShare`/`defeatShare` and `medianFirstSubjugation` together:
the first two say the human's position improved; the third says the
subjugations that still happen are concentrated earlier, which is consistent
with an improvement, not a contradiction of one.

`new-player-potatoes` and `potatoes-unarmed-enemies` were re-run and did not
move - both use a potato deck for the human seat and an AI deck untouched by
this change, exactly as expected, so their bands are unchanged.

**Open balance question, not addressed here: Fortify is the main stalling
card.** Adding Fortify alone to the `conquest-scaled` deck (in place of one
`grow-crops`) drops that arm's unified share from 92.3% to 80.8% and more
than doubles its capped share, 7.7% -> 19.2% (measured on the same 26 seeds,
300-turn cap). Alliance added the same way is neutral, landing exactly on
`conquest-scaled`'s 92.3% / 7.7%. Fortify's flat, untargeted Might gain
against every living faction at once evidently props up factions that would
otherwise fall behind, which is the same mechanism the scaling-Raid and
Favourable-omens changes are fighting on the other side. This is a real
tension in the current design and is left as an open balance question for a
future change to address; rebalancing Fortify is not part of this correction.

## Out of scope

- Any change to the Subjugate threshold formula itself.
- The scoring AI and per-card metric suite from the 2026-07-28 AI evaluation
  design.
- A UI for simulation results.
- Rebalancing Alliance, Bodyguard, or Assassinate ruler.
- Rebalancing Fortify. Its stalling effect on world resolution is measured
  and recorded in the Correction section above, as an open question for a
  future change, not addressed here.
