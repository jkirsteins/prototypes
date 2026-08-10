# A repeating Fortify, bounded by settlements

Supersedes the `playsAgain` half of
`2026-08-09-five-seats-and-passive-statuses-design.md` section 4a. That
document describes `CardDef.playsAgain` and `GameState.repeatCardId`, which the
keyword refactor replaced with `CardDef.keywords` + `KeywordDef.repeats` +
`GameState.repeatGroup`; the refactor shipped without a spec of its own, so
this one states the current rule as well as the change it makes.

## 1. What a repeat is now

A card carries KEYWORDS, and a keyword carries rules. `KeywordDef.repeats`
re-opens a spent turn for another card of THAT CLASS - not another copy of the
same card. Playing a Raid therefore leaves the turn open for a Strong raid or a
Great raid, because all three carry `raid`.

`GameState.repeatGroup` holds the keyword id, `turnAccepts` is the only reader,
and `playableSet`'s `repeatOnly` narrows the hand to the class. Nothing else in
the tree knows the rule exists, and none of it names a card.

The keyword split exists precisely so that "these cards are a class" and "you
may play two" are separate facts. `fortify` was the case that forced it: the
two fortify cards needed to be a class for their heal amounts and their hover
preview long before they were allowed to repeat.

## 2. The bound is the whole of the design

A repeat ends on ordinary legality. That is only a rule if the class has
something to run out of.

A raid runs out of armies: a march holds one army of its source until it lands
(`freeArmiesOn`), so a realm can have exactly as many attacks in flight as it
has armies, and `marchSourcesFor` goes empty when the last one leaves. The
board is the limit, and no count of plays is kept anywhere.

A heal has no such floor. The comment that stood beside `KEYWORDS.fortify`
until this change said so outright:

> No `repeats`: a raid runs out of armies and a heal would run out of nothing,
> so a repeating fortify would be bounded only by the hand.

This change answers the objection rather than overruling it. A fortify calls on
a SETTLEMENT of the land it heals, for the rest of that turn.

- Every land already stands on at least one settlement - `settlementsIn` is
  `1 + founded`, the founding one being the map's own authored dot.
- `KeywordDef.spendsSettlement` says a class does this. Both fortify cards
  carry it; Hillfort, a single-land heal carrying no keyword at all, does not.
- One settlement per play whatever the card restores. The bound is a fortify
  per settlement per turn, not a settlement per point, so Strong fortify is
  legal wherever Fortify is.
- `GameState.settlementsSpent` is the commitment store: faction id -> how many
  of that land's settlements have answered this turn. `freeSettlementsIn` is
  the reader, floored at 0 exactly as `freeArmiesOn` is.

So a default land takes one fortify a turn. A land that founded its second
takes two. The run continues across the realm while any land still holds a
settlement it has not called on, and ends when none does.

The flat `SETTLEMENT_BASE_CAP` of 2 is what caps a single land, which is worth
stating because it means the ceiling on a realm's healing in one turn is
`2 x lands`, reached only by a realm that has spent a wealth and a card on
every second settlement.

## 3. Where the commitment is cleared, and why there

`beginTurn` clears the whole map, beside `playedThisTurn` and `repeatGroup` -
the three per-turn facts, cleared together at the START of a turn rather than
the end of one. `endTurn` deliberately does not touch it. A commitment
therefore cannot outlive the turn that made it however that turn ends, and no
seat can refresh its settlements by giving its turn up.

This differs from the army it is modelled on, and the difference is
deliberate: an army is held by a march with an absolute expiry and comes home
when the arrow lands, which is a fact about the board that outlives a turn. A
settlement is not sent anywhere. It is called on, and the calling is what
lasts until the turn comes round.

## 4. Two refusals, kept apart

`no-settlement` is a new block reason at both levels, distinct from the two it
sits between:

- `at-full-defense` - the land does not want the heal. Fixed by taking damage.
- `no-settlement` - the land wants the heal and cannot have it this turn.
  Fixed by waiting a turn, or by founding a settlement.
- `no-target` - there is no land to aim at.

The hand-level branch reads off the per-target verdicts rather than
re-deriving which lands are candidates, so the greyed card and the greyed map
cannot disagree. A land blocked SOLELY by `no-settlement` is the signal; a
land blocked by that plus anything else belongs to `no-target`.

Without that branch the card would report "nothing to aim at" when the lands
are plainly there and it is the settlements that are out - which is the exact
shape of lie `no-army` was separated from `no-target` to prevent.

## 5. What the player sees

A rule the player cannot see reads as the game cheating, so the settlement
gets the same surface the army has:

- **Badge pips**, one per standing settlement, a row above the army pips.
  Filled is a settlement a fortify can still be called on, hollow is one
  already called on this turn - the identical `army-free` / `army-away`
  convention and the identical ink. Wide where an army pip is tall, so the two
  rows are told apart at map scale.
- **The land hover** gains "N called on this turn" under the existing
  Settlements block, and only while N is above zero: the line appearing is the
  news.
- **The block reasons** say which refusal it is, in both places.

The map's own settlement DOTS are untouched. Filled and hollow mean authored
and founded there, and that is a different surface answering a different
question.

## 6. The AI

Step 5 heals the realm's worst land. It took `sorted[0]` - a single land - so
once that land's settlements were out it gave up rather than trying the next
one down. A repeat that could only ever re-aim at the same land would end its
run on the second play, so step 5 now walks the sorted list until a heal is
legal. That also fixes an older case the single-land version had: a land
braced under half that is already standing at its ceiling.

`POLICY_COVERAGE` names the repeat on both fortify entries.

## 7. What was considered and not done

- **Scoping the cost to `SINGLE_LAND_HEALS`** rather than the keyword. That
  would have pulled Hillfort in, a card nobody asked to change, and it would
  have put the rule on a derived set instead of on the class that already
  exists to carry rules.
- **Strong fortify costing two settlements.** A default land could then never
  be Strong-fortified at all, which is a harsh refusal with nothing useful to
  say to the player.
- **Marking the map dot spent** instead of adding badge pips. Fill and hollow
  are already spoken for on that dot, and the badge is where "what can this
  land do right now" already lives.

## 8. Balance

Not measured. A repeating heal moves the defense economy, and `npm run
balance` is the pass that would say by how much - run on demand, per the repo
rule, once this settles.
