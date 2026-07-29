# Balticmap: Might That Scales With The Map - Design

Date: 2026-07-29
Status: designed

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
express. `GameState` gains `raidRule: "border" | "flat"`, defaulting to
`"border"` once this ships.

This is a feature flag in production state, which is a cost. It is accepted for
the same reason the `unarmed` deck arm is kept permanently: this repository has
already decided that the size of a past balance tradeoff should stay
measurable rather than becoming a number in an old document. The alternative,
measuring the baseline against the previous commit, leaves nothing to re-check
when a later change moves the same numbers.

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
- Every existing test still passes, or its band is re-measured and the new
  number recorded here with a reason.

## Results

To be filled in from the measured run before this ships. If `conquest-omens`
does not shorten games against `conquest-flat`, that is the finding and it is
recorded here rather than papered over. Further dials to discuss in that case,
none of them in scope now:

- more than one Raid per deck;
- a sublinear Subjugate threshold, so a large realm is not proportionally
  harder;
- Fortify scaling with realm size the way Raid now scales with border.

## Out of scope

- Any change to the Subjugate threshold formula itself.
- The scoring AI and per-card metric suite from the 2026-07-28 AI evaluation
  design.
- A UI for simulation results.
- Rebalancing Alliance, Bodyguard, or Assassinate ruler.
