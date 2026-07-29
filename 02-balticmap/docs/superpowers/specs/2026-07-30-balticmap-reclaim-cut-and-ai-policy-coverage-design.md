# Balticmap: cut Reclaim independence, and give every card a policy branch

Two findings, one changeset. They are together because they are the same defect
seen from two sides: a card whose rule nobody had measured, and a policy that
never decided to play half the deck.

## Finding 1: Reclaim independence scales backwards

`isCardPlayable` (`src/playability.ts:221-231`) lets a vassal reclaim while the
overlord's lead is under `SUBJUGATE_THRESHOLD * (the overlord's holdings other
than the vassal)` on both tracks. Subjugate charges `SUBJUGATE_THRESHOLD *
realmOf(target)`. The two scale against different realms, so the price of
*taking* a vassal is indexed to the vassal while the price of *holding* one is
indexed to the holder:

| overlord holds | lead needed to subjugate a 1-land neighbour | lead needed to hold it |
| --- | --- | --- |
| 1 land | 2 | 2 |
| 2 lands | 2 | 4 |
| 5 lands | 2 | 10 |

At one land the two numbers agree, so a fresh vassal cannot walk out and must
first grind the lead down. From two lands up, every newly taken vassal is free
to leave on its next turn having done nothing. The card is at its weakest
against the smallest overlord and its strongest against the largest.

Measured in 26 worlds, escapes by the lord's other holdings: 8 Reclaim plays at
one holding, 174 at two or more.

### Why it is cut rather than re-scaled

Reclaim's legality is a strict subset of Revolt's (Revolt needs only an
overlord) and its effect is a strict subset of Revolt's (same release, and
Revolt adds +1/+1 against the former lord and is in `DOUBLABLE_CARDS`). No
threshold rule fixes that: any Reclaim is a Revolt that does less. Of 182
Reclaim plays measured, 126 had a legal Revolt in the same hand, so the policy
was also picking the weaker card two times in three.

### Evidence for the cut

26 seats, all playing the same deck, 300-turn cap, seeds 1-200, each multiset
run in three deck orderings (the deck is shuffled per game, so ordering only
perturbs the permutation). Pooled over 600 games each:

| multiset | unified | median end turn | subjugations/game | escapes/game |
| --- | --- | --- | --- | --- |
| reclaim in (today) | 93.3% | 129.5 | 42.5 | 14.5 |
| reclaim cut | 94.7% | 112.0 | 34.4 | 7.0 |

Per-ordering spread was 92.5-95.0% and 94.5-95.0%, so **resolution share does
not move**. Median end turn (124.5-134.0 against 109.0-116.0), subjugations and
escapes all separate cleanly from the noise: worlds resolve about 13% faster
with 19% less churn and half the escapes.

The ordering sweep is part of the method, not decoration. An earlier 26-game
run put the same two multisets at 92.3% and 100.0%, which reads as a decisive
8-point improvement and is entirely deck-order noise. Any future arm comparison
in this prototype should sweep orderings before claiming a share moved.

## Finding 2: 27.7% of AI plays have no policy behind them

`chooseAction` (`src/ai.ts`) has no branch for `alliance`,
`assassinate-ruler`, `extended-diplomacy`, `bodyguard` or `revolt`. They reach
play only through step 9, "first playable card as a last resort", and their
targets come from `validTargetsFor(...)[0]`, first in faction order.

60 worlds, 26 seats, default deck, 52,596 plays:

| card | plays | share | policy step |
| --- | --- | --- | --- |
| fortify | 8483 | 16.1% | yes |
| favourable-omens | 8438 | 16.0% | yes |
| raid | 7810 | 14.8% | yes |
| shrewd-marriage | 7577 | 14.4% | yes |
| alliance | 7505 | 14.3% | **none** |
| assassinate-ruler | 6583 | 12.5% | **none** |
| subjugate | 2530 | 4.8% | yes |
| pay-tribute | 1416 | 2.7% | yes |
| incorporate | 1401 | 2.7% | yes |
| revolt | 467 | 0.9% | **none** |
| reclaim-independence | 386 | 0.7% | yes |

Alliance and Assassinate ruler are the 5th and 6th most-played cards and
neither is ever chosen. Two or more targets were legal in 82% and 64% of those
plays, so faction sort order was silently deciding. `extended-diplomacy` and
`bodyguard` show no plays here only because `DEFAULT_DECK` does not carry them;
`buildAiDeck` rolls them into enemy decks at probability 0.5, so they are live
in every human-facing scenario.

`incorporate` has a branch but takes the first vassal in faction order, which
is the same arbitrary-target defect with a step in front of it.

## Part 1: remove the card

| file | change |
| --- | --- |
| `cards.ts:22` | delete the `CARDS` entry |
| `cards.ts:61` | `DEFAULT_DECK`: `"reclaim-independence"` becomes `"grow-crops"` |
| `playability.ts:221-231` | delete the branch; the `overlord` local stays, pay-tribute and revolt read it |
| `game.ts:333-341` | delete the resolution branch |
| `notices.ts:314-322` | the `cardId` ternary and the `!== "revolt"` penalty guard collapse; rewrite the doc comment |
| `sim.ts:445`, `scenarios.ts:86` | comments naming the card |

`DEFAULT_DECK` takes a literal `"grow-crops"` rather than dropping to nine
entries: `WORLD_ARMS["full-deck"]` hands `DEFAULT_DECK` straight to `runWorld`,
which throws on any length other than `DECK_SIZE` (`sim.ts:365`). Substituting
in place also keeps `DEFAULT_DECK`'s "currently exactly `DECK_SIZE` long"
invariant true and leaves `buildDeck()`'s padding dormant as documented.

Measured alternatives for that slot, 26 worlds: `extended-diplomacy` collapses
resolution to 53.8% at a 178-turn median, `bodyguard` to 88.5% at 130. Grow
potatoes is the best of the three and the only one that does not change what
the arm measures.

Kept deliberately:

- The `reclaimed` event type. Revolt still emits it, and renaming the log
  vocabulary was considered and declined.
- `hud.ts:92-93`, "X reclaims independence from Y", now describing a Revolt.
- `CARDS` declaration order for every remaining card. `buildAiDeck` draws one
  rng value per non-basic in that order, so reordering would remap every seed.
  Deleting one entry already shortens that stream by one draw, which is why the
  bands below move; no further disturbance is acceptable.

Retired ids in saved progress need no code. `isTrackable` gates on
`CARDS[id]?.deckBuildable === true`, so `loadMeta` drops an unknown id from
both `knownCards` and `seenPool` on read. This wants a test, not a change.

## Part 2: a threat model, shared by every defensive card

Four of the five uncovered cards are defensive, and all four need the same
question answered: who can take me, and how close are they? Today that
arithmetic exists once, inlined in the Fortify step as `leadsOf(f, me).might >=
1`. Rather than inline it four more times, add one unit to
`src/playability.ts`, beside the eligibility rules it builds on:

```ts
export interface Threat {
  factionId: string;
  /** Lead the threat still needs on its best track; <= 0 means it can act now. */
  shortfall: number;
  statusShortfall: number;
  mightShortfall: number;
}

/** Every faction that could subjugate `factionId` if its lead were high
 *  enough, with how much lead it still needs. Sorted by shortfall ascending,
 *  ties by faction order. */
export function threatsTo(view: RulesView, factionId: string): Threat[];
```

Legality comes from the existing centralized `targetEligibilityFor(view, other,
"subjugate")`: a faction counts as a threat when this faction's entry is
`available`, or `blocked` by exactly one reason with code `insufficient-lead`.
That single gate already accounts for reach, active alliances, the actor being
subjugated, and this faction already being their vassal, so no rule is
re-derived. Shortfalls come from `subjugationRequirement` and `leadsOf`.

This is the one new abstraction in the changeset. It exists because four
policies need it, it can be tested without the AI, and it deletes duplicated
arithmetic rather than adding a layer.

## Part 3: the policy, complete

Steps 1, 4, 6, 7, 8 (omens), 9, 10 and 11 keep today's behaviour and today's
relative order. New and changed steps are marked.

| # | step | rule |
| --- | --- | --- |
| 1 | forced tribute | unchanged: feed the overlord's weaker track |
| 2 | **revolt** | replaces Reclaim's step. Play Revolt whenever it is playable |
| 3 | **incorporate** | targeting fixed: the vassal with the largest `realmOf`, ties by faction order |
| 4 | subjugate | unchanged: the largest lead |
| 5 | **emergency defence** | new tier: Alliance, else Assassinate ruler |
| 6 | finishing raid/marriage | unchanged (was step 5) |
| 7 | defensive fortify | unchanged (was step 6) |
| 8 | **setup** | omens (unchanged, was 6b), then **Extended diplomacy**, then **Bodyguard** |
| 9 | build toward the closest subjugation | unchanged (was step 7) |
| 10 | grow crops | unchanged (was step 8) |
| 11 | first playable, last resort | unchanged (was step 9) |

### Step 2: Revolt

Play it whenever playable. A vassal cannot Subjugate or Incorporate at all
(`actor-subjugated`), and every forced Pay tribute compounds the lord's lead
against it, so no vassal turn is better spent elsewhere. Revolt carries no lead
condition, and its parting +1/+1 cuts the lord's lead, delaying
re-subjugation. `idxOf` only returns playable indexes and Revolt is playable
exactly while subjugated, so the step needs no extra guard. A forced Pay
tribute still outranks it through `playableSet`.

### Step 3: which vassal to incorporate

The vassal whose `realmOf` is largest, ties by faction order. Incorporation is
permanent and transfers the vassal's own incorporated lands to the new owner
(`game.ts:325-327`), so realm size is exactly the land gained, and land is the
victory condition. Chains cannot exist, so a vassal's realm is itself plus its
annexations.

### Step 5: emergency defence

Fires only against a threat with `shortfall <= 1`, meaning a rival can subjugate
this faction now or after one more play. It sits below Subjugate because taking
a vassal is a certain gain that also *raises* this faction's own subjugation
threshold (`realmOf` grows, so `SUBJUGATE_THRESHOLD * realmOf(me)` grows) and is
therefore itself defensive. It sits above the finishing raid because being
subjugated costs more than setting up next turn's conquest.

**Alliance** takes the threat with the lowest `shortfall`, ties by faction
order, provided that faction is in `validTargetsFor(me, "alliance")`, is not
this faction's vassal, and is not in `validTargetsFor(me, "subjugate")`. That
last exclusion matters: a pact blocks hostile targeted cards in *both*
directions, so allying with your own best target freezes your own conquest for
five turns. If the worst threat is excluded, the step considers the next one
rather than giving up.

**Assassinate ruler** runs when Alliance did not. It levels the Status counters
in both directions, so it only ever helps against a Status threat: candidates
are threats with `statusShortfall <= 1` that are in
`validTargetsFor(me, "assassinate-ruler")`, taken by lowest `statusShortfall`,
ties by faction order. Because a Status threat by definition leads this faction
on Status, the card can never destroy the actor's own lead here, which is why no
separate guard is needed.

Targets holding a Bodyguard are skipped. If every qualifying target is guarded,
the step does not fire at all: trading the card for a guard leaves the threat
standing, and the turn is better spent building.

### Step 8: setup

Three cards that pay off next turn, in this order. Only one is playable per
turn, so the order is a preference, not a sequence.

**Favourable omens** keeps today's rule and position exactly.

**Extended diplomacy** plays when this faction holds no boost, holds Alliance in
hand, and has a legal alliance target. Reaching step 8 already means no
emergency alliance fired, which is the same reasoning the omens step uses: a
setup card must never delay a play that resolves something now.

**Bodyguard** plays when there is some faction in reach for which
`subjugationRequirement(view, me, them)` is non-null and this faction's Status
lead over them meets it, and this faction does not hold a playable Subjugate
this turn. A null requirement means Subjugate could never apply to that pair, so
there is no lead worth guarding. That is precisely the position the new Assassinate ruler
policy hunts, so the guard is posted against a threat the AI itself would make,
rather than at random. Holding a lead you can cash immediately needs no guard,
which is what the Subjugate check encodes.

### Coverage map

`src/ai.ts` gains an exported map from every deck-buildable card id to the step
that decides it:

```ts
export const POLICY_COVERAGE: Record<string, string> = {
  "pay-tribute": "1: forced tribute",
  "revolt": "2: revolt out of vassalage",
  // ... one entry per id in CARDS
};
```

A test asserts the key set equals **every id in `CARDS`**, not just the
deck-buildable ones. `pay-tribute` is injection-only and never deck-buildable,
yet it reaches hands and has a real branch, so keying on `deckBuildable` would
leave the most forced card in the game unguarded. Every one of the thirteen
cards remaining after Part 1 has a branch, so the map ships complete with no
exemption list. A new card cannot ship without either a branch or a deliberate
decision to name it here.

## Part 4: one legality fix, and one prohibition reviewed and left alone

**Extended diplomacy can be wasted.** `isCardPlayable` returns `true`
unconditionally for it (`playability.ts:216`), while `bodyguard` and
`favourable-omens` both refuse to re-hold a token they already have. So a
player or AI can burn a turn replacing a boost they are already holding. Fix it
to match its siblings: `return !view.diplomacyBoost.includes(factionId)`. This
needs `diplomacyBoost: string[]` added to `RulesView` and to `viewOf`; the field
already exists on `GameState` (`game.ts:53`).

This is a rules change, not just an AI change, and it affects the human as much
as the AI, which is why it belongs here rather than being worked around inside
the policy.

**No change to Assassinate ruler's overlord prohibition.** It cannot target the
actor's overlord (`playability.ts:148-153`). With Reclaim gone there is no
threshold to grind down, so this no longer blocks any escape route and is left
alone. Recorded because it was reviewed, not because it changes.

## Metrics

`src/sim.ts` gains per-arm metrics that can show a card being ignored, wasted or
biased. Each is aggregated over a batch, alongside the existing fields.

| metric | reveals |
| --- | --- |
| `playShareByCard` | a card that is ignored, or played as filler |
| `firstLegalTargetShare` | targeting bias: share of targeted plays that chose the first legal target while 2+ were legal |
| `preventedAssassinations` | Assassinate ruler spent into a Bodyguard |
| `unusedBoosts` | Extended diplomacy plays whose boost was never spent on an Alliance |
| `untestedGuards` | Bodyguard plays never tested by an assassination |
| `alliancesOnOwnTargets` | Alliance sealed with a faction the actor could have subjugated |

`firstLegalTargetShare` is the direct regression guard for Finding 2: today it
is 1.00 for Alliance and Assassinate ruler by construction. `unusedBoosts`,
`untestedGuards` and `alliancesOnOwnTargets` are waste counters that should be
low, and `alliancesOnOwnTargets` should be 0 by construction once the exclusion
in step 5 lands.

## Predictions, recorded before measuring

Per the standing rule that bands and the reasoning behind them are written down
before the change lands.

1. **Alliance and Assassinate ruler play counts fall sharply** from 14.3% and
   12.5%. Both stop being filler and fire only against a real threat.
2. **Worlds resolve faster, not slower.** The instinct is that competent
   Alliance play freezes the map, but today's map is already frozen by 7505
   filler pacts per 60 worlds; a threat-gated policy makes far fewer of them.
   The `cut, extended-diplomacy` arm measured at 53.8% unified and 178 turns
   shows what alliance-adjacent filler does to pacing. That figure is a single
   26-game run with no ordering sweep, so it is directional only, cited for the
   size of the effect and not as a band. Expect a median end turn at or below the
   112.0 measured for the Reclaim cut alone, with resolution share holding in the
   93-96% range.
3. **The risk to watch is the opposite of prediction 2.** If alliances now land
   on exactly the factions a conqueror needs next, `unifiedShare` could fall and
   `medianStallTurns` rise. If that happens the fix is to tighten step 5's bar
   to `shortfall <= 0`, not to loosen it.

If a measurement contradicts a prediction, the prediction stays in this document
with the measurement beside it. The scaling-might design's correction section is
the precedent.

## Bands

**All seven committed scenarios may move, including the two `conquest-*` arms.**
Those arms were immune to the Reclaim cut, since they build decks explicitly and
never held the card, but they do hold Incorporate, and step 3's targeting
changes. This is a correction to an earlier read of this changeset that called
them immune.

Human scenarios (`src/scenarios.ts`), all four affected: their enemy decks come
from `buildAiDeck`, whose per-card rng draws remap when `CARDS` loses a
non-basic, and `flailing-full-deck` and `competent-full-deck` also use
`HUMAN_DECKS.full`, which changes.

- `new-player-potatoes`
- `potatoes-unarmed-enemies`
- `flailing-full-deck`
- `competent-full-deck`

World scenarios: `full-deck` (its deck changes), `conquest-scaled` and
`conquest-omens` (Incorporate targeting only). `conquest-inert` has no committed
band by design and additionally exercises the new Bodyguard step.

Every band is re-measured, and every move is recorded here with its number and
the reason it moved. A band is widened only with a stated reason, never to make
a failing run pass.

## Testing

`threatsTo`, tested without the AI:

- a faction in reach with a subjugation-grade lead reports `shortfall <= 0`
- one lead short reports `shortfall 1`; per-track shortfalls differ when the
  tracks differ
- an active alliance, an out-of-reach faction, a subjugated would-be actor and
  an existing overlord relationship all report no threat
- ordering is by shortfall then faction order

Policy, one test per new or changed branch:

- Revolt is played while subjugated in preference to a build play, and a forced
  Pay tribute still outranks it
- Incorporate takes the largest vassal realm, not the first in faction order
- Alliance fires on the worst threat at `shortfall <= 1`, and does not fire on a
  faction the actor could subjugate itself
- Assassinate ruler fires on a Status threat, skips a bodyguarded target, and
  does not fire when every qualifying target is guarded
- Extended diplomacy fires only with Alliance in hand, a legal target and no
  boost held, and never ahead of an emergency alliance
- Bodyguard fires on an uncashable subjugation-grade Status lead, and not when
  Subjugate is playable this turn
- `POLICY_COVERAGE` keys equal the deck-buildable ids in `CARDS`

Removals and legality:

- Extended diplomacy is unplayable while a boost is held
- `loadMeta` drops a stored `reclaim-independence` id from `knownCards` and
  `seenPool`
- the card-id list tests in `cards.test.ts`, `game.test.ts`,
  `deck-screen.test.ts` lose the entry; the Reclaim tests in
  `playability.test.ts`, `game.test.ts`, `ai.test.ts` and `notices.test.ts` are
  deleted
- `notices.test.ts:244` builds a `reclaimed` event with no `cardId` and relies on
  the ternary's else-branch; it gains `cardId: "revolt"`

Also: `npm test` and `npm run build` both pass, and `npm run simulate:check` is
run and reconciled against the bands above. Verified in Chrome through the root
dev server per project convention, since `main.ts` wiring is only covered e2e.

## Repo rule

`AGENTS.md` already required card changes to revisit the AI and said in as many
words that falling through to the first playable card or first legal target is
not complete AI support. Four cards shipped anyway. The section now requires a
named branch recorded in a coverage map that a test enforces, and cites this
measurement as the reason the requirement is mechanical rather than a checklist
item.

## Out of scope

- Renaming the `reclaimed` event type and the log wording it feeds.
- Fortify's defensive bar (`might lead >= 1`). It keeps today's rule and
  position; folding it into `threatsTo` would move bands for a step that is not
  broken.
- Revolt's own balance as the sole remaining escape route. Escapes halve, which
  is measured and intended; if that proves too generous to overlords it is a
  separate change with its own evidence.
- Any change to `CARDS` declaration order.
