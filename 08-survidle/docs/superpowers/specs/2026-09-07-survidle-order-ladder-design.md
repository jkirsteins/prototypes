# Survidle: the upper rungs of the order ladder

Roadmap item L (`2026-09-03-survidle-realism-roadmap.md`). The delegation
ladder gives each skill three rungs: a once job at 3, a grind at 5, a keep
at 10, and each rung buys a longer walk-away: hours, days, weeks. The idle
arc the author set wants two more: a plan that holds a season, and one that
holds the year. This item adds them as things a standing order can say, and
holds the reference runner to the shapes its skills have earned.

The runner today reaches past the ladder. Its orders are the player's
shapes, but the mornings it changes them are rules in code no player can
write: the larder gate, the render, crack and hang gates, the season
windows, the water method by the ice, the paced pile the fat item measured.
It is a player who checks in every morning with perfect judgement, so the
gates measure a player who exists at no level. After this item every such
rule is either a condition a player can put on an order at the rung that
earns it, or a plain order, or a named runner rule that stands for a
returning player's decision and is counted as one. The gates then measure
the game as a player at that level could play it, and the attention a plan
cost is a number beside the reading.

Extends `2026-09-03-survidle-standing-orders-design.md` (orders, the
scheduler, the runner) and the idle curve spec (the ladder, section 2).
The author pre-approved the item and verifies at the end; the decisions
below are the controller's, recorded for that verification.

## Decisions taken for the author

- **Rung levels 15 and 20.** Conditions at 15, pace at 20, continuing the
  3, 5, 10 progression. The one number in the item with no source; the
  author may move it.
- **Five condition shapes and one pace shape**, no more: a season window, a
  stock condition, a restart line on a keep, a daily count, and a target
  due by a date. Everything the runner does today that a player cannot
  write maps onto one of these or stays a named runner rule (below).
- **Keeps read their stored forms.** A keep on a food task counts the food
  in the forms it takes at camp, in the keep's own unit, so "keep 240 kg of
  meat" reads dried meat at three kilos a kilo. The bark keep's KEEP_ALSO
  is the precedent and becomes the general table.
- **The runner is a returning player for what it has not earned.** A want
  whose condition the skill has not reached is given as the plain shape
  aimed at today's reading and withdrawn or re-given as the condition
  would have done it; every such act is a morning the list changed and is
  counted. At the rung the order carries the condition and the count
  falls. That is the honesty the item buys: attention per season by level.
- **Named runner rules stay where a player reads the same thing off the
  screen**: a recommended level on a named hunt, a garment or an axe; the
  water and fire method by what stands and what the ice does; the snow
  shelter until walls stand. Each flip is counted as an intervention.
- **The hunt keep's larder band replaces the larder gate.** The hunt keep
  targets the winter stock's meat in meat-equivalent kilos with a restart
  line at four fifths of it (the fifth the stock carries as spare); the
  fish keep carries a stock condition that shuts it while the dried meat
  at camp is at or above the stock's 80 kg. No new constant.
- **The paced pile sits above the food rows** with its target due on 1
  December (the day the winter stock is what a competent player has), the
  shape the fat item measured; it is a rung-20 order and an heir below the
  rung gets the returning player's plain keep at today's target instead.
- **The plant band's daily count is a condition.** "An hour of roots a
  day" is a daily job at 15; below it the runner re-gives the counted job
  each morning as a returning player would and the count shows it.
- **No constant moves.** Every number here is a level, a date already in
  the calendar, or a stock already in the list.
- **The lineage gets the short plan by construction**: an heir at level 5
  runs the same list through the same ladder and gets jobs and grinds, so
  the lineage gate measures the ramp; its landing line prints what the
  heir inherited.
- **Out of scope**: the coast (item M), new tasks, any change to the food
  model or its numbers, a day-share scheduler (the ladder's conditions
  answer the all-day-keep problem where it bit, and a scheduler that
  shares the day is a different item if the readings still ask for it).

## 1. The vocabulary

An `IntentRequest` gains an optional `when` block and one new `until`
kind. The rung each part needs is beside it.

```ts
/** Conditions on a standing order; each reads the camp or the calendar every morning. */
export interface OrderWhen {
  /** Day-of-year window, inclusive; from > to wraps the new year. Rung: condition. */
  season?: { from: number; to: number };
  /** Open only while the camp pile holds the item in this range (kilos or count). Rung: condition. */
  stock?: { item: ItemId; atLeast?: number; under?: number };
  /** A keep that has read met at its target stays met until the stock falls under this. Rung: condition. */
  restart?: number;
  /** A keep whose target is due in full on this day of year; the target rises to it linearly from the season's start (or the day the order was given) and holds after. Rung: pace. */
  by?: number;
}

export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" }
  /** n completions a day, the count cleared at the day roll; never drops off. Rung: condition. */
  | { kind: "daily"; n: number };
```

`Rung` is `"job" | "grind" | "keep" | "condition" | "pace"`, with
`RUNG_LEVEL = { job: 3, grind: 5, keep: 10, condition: 15, pace: 20 }`,
`RUNG_WORD` and `RUNG_LINE` for the two new rungs ("Foraging 15: orders
with a season, a stock line or a daily count", "Woodcraft 20: a keep due
by a date"). `OrderKind` is unchanged; a rung is a property of an order,
not its kind.

Semantics, each in one place:

- `conditionOpen(state, world, cal, req)` in `src/sim/orders.ts` returns
  whether the order's `when` lets it run this morning: the season holds
  and the stock line holds. A closed order is skipped with a reason the
  row shows ("out of season until 1 May", "waits for a bone at camp").
- `orderMet` reads `restart`: a keep stores `held: boolean` on the order;
  it flips to true when the stock reaches the target and back to false
  when the stock falls under `restart`; while `held`, the keep reads met.
  Without `restart` the reading is what it is today.
- `keepTargetToday(cal, o)` reads `by`: with a season, the target is
  `qty * clamp((doy - from) / (by - from), 0, 1)` on the calendar's day of
  year, with the wrap handled; without a season the rise starts on the
  day the order was given (`o.givenDoy`, stored at addOrder). On and after
  `by` the target is `qty`. A keep with `by` is skipped as met while the
  stock is at or above today's target.
- `daily`: `runOrders` clears `o.done` at the day roll (`o.dayOpened`
  stored on the order) and never removes a daily job; the live intent
  runs it as `times n`.
- Keeps read their stored forms: `KEEP_ALSO` becomes
  `KEEP_FORMS: Partial<Record<TaskId, { item: ItemId; ratio: number }[]>>`
  with `hunt: [cookedMeat 1, driedMeat 3]`, `fish: [cookedFish 1, oilyFish 1,
  cookedOilyFish 1]`, `roots: [cookedRoots 1]`, `innerBark: [driedBark 3,
  barkFlour 3]`; the sentence names the forms ("meat in any form").

## 2. The ladder

`orderGate` checks the kind's rung as today, then each part of `when` and
a `daily` until against the skill: a `season`, `stock`, `restart` or
`daily` needs `condition`; a `by` needs `pace`. The gate's `why` names the
first rung short ("a season on an order at Foraging 15, {you} {are} 9").

`withinLadder` strips what is not earned rather than refusing: a `by`
under 20 goes (the keep aims at the full target); `season`, `stock` and
`restart` under 15 go; a `daily` under 15 becomes `times n`. What it
returns is what the runner gives, and the runner's returning-player act
(section 4) stands in for what was stripped.

`RUNG_ORDER` gains the two rungs so the level-up log names them; the
capabilities panel's rung row lists five keys; the manual's orders line,
if it has one, reads the five rungs in a clause.

## 3. The Do panel

A row whose skill has the condition rung shows, beside the kind buttons,
the condition fields: a season (two month pickers, "from" and "to", by
month start), a stock line (an item from the region's known items, "at
least" or "under", a number), a "restart under" number on a keep, and a
"daily" count kind beside "times". With the pace rung a keep shows a "by"
month picker. Under a rung the fields are absent and the small print says
which level opens them, the way `kindNeeds` does today. The row's request
carries `when` and the daily kind through `rowRequest`. An order's
sentence names its conditions after its target: "keep camp at 600 kg
firewood, by 1 December, from midsummer to 1 April"; "hunt anything, keep
camp at 240 kg meat in any form, restart under 192"; "dig roots, 1 a day,
from 1 April to 31 October". The away report's order lines carry the same.

Save: `when`, `held`, `givenDoy` and `dayOpened` are optional on an order
and an old save loads with none.

## 4. The reference runner

`REFERENCE_ORDERS` is rewritten as the list a competent player would keep
with the vocabulary, and `wantOpen` shrinks to the named runner rules.
The wants that carry conditions:

| want | condition |
|---|---|
| eggs | daily 1, season 1 May to 30 June |
| roots | daily 1, season 1 April to 31 October; a second want for the winter dig, daily 1, season 1 November to 31 March, given only with an axe in reach (a runner rule: the ice hole is what an axe keeps open) |
| seaweed | daily 1, given only on a sea camp (a runner rule) |
| tapSap | once, season the sap window |
| cook rawFat grind | stock { rawFat, atLeast TRACE_KG } |
| crack grind | stock { bone, atLeast 1 } |
| hang grind | stock { rawMeat, atLeast HANG_ABOVE_KG } |
| dryingRack once | stock { rawMeat, atLeast TRACE_KG } |
| hunt any keep | target WINTER_STOCK.driedMeatKg times 3 in meat forms, restart four fifths of it |
| fish any keep | 1 kg in fish forms, stock { driedMeat, under WINTER_STOCK.driedMeatKg } |
| split, splitWedges, deadwood keeps | 600 kg, by 1 December, season midsummer to 1 April, above the hunt keep |
| chop keep | 300 logs, by 1 December, the same season, above the hunt keep |
| berries keep | season 1 July to 30 April (the summer season and the frozen lingon) |

The named runner rules that stay in `wantOpen`, each a decision a player
reads off the screen: water by method (shore open, hole with an axe under
ice, melt with no axe); fire by method (pit until walls, indoors after);
the snow shelter until walls; the named hunts, the garments and the spare
axe by their recommended levels; the winter roots row by an axe in reach;
seaweed by a sea camp. Every other branch of `wantOpen` goes.

The returning player: for each want, `tick` computes `withinLadder` as
today. When the result lost a condition, the runner applies the condition
itself: a lost `season` gives at the window's start and withdraws at its
end; a lost `stock` gives while the line holds and withdraws when it does
not; a lost `restart` gives while the stock is under the restart line and
withdraws at the target (the band by hand); a lost `daily` re-gives the
counted job each morning; a lost `by` gives a plain keep at today's pace
target and re-gives it as the target moves (once a week, the returning
player's cadence). Each give and each withdrawal is an intervention.
`DAILY_TASKS` and `REOPENING_TASKS` go: the sap tap is a once job with a
season, re-given inside the window as any withdrawn-and-reopened want is.

The intervention count: `ReferencePlayer.interventions: Map<day, number>`
counts every give and withdrawal the runner makes after the opening list
(the first morning's gives are the plan, not attention), including the
named runner rules' flips. The reports print `attention: N mornings of M`
on the month line of the year report and the pass line of the reference
report, and per life on the lineage report.

## 5. The readings that come with it

- **The unexploited line's second half.** Beside each source the line
  names, what the ledger credited from it in the week before the death:
  "roots 125 kg, 306 kcal a day taken" or "roots 125 kg, none taken".
  `unexploited()` reads `weekBefore` per source.
- **What an heir inherited.** The lineage report's landing line prints the
  old camp's food in kcal and its wood in kilos on the day the heir
  reaches it (`HeirReport.found` already reads the camp; the line prints
  it).
- **The attention count** above.

## 6. Measurement and done

The four gates on the five reference seeds, before and after, in the
spec's section 0; the attention count per season per gate; the
interventions the named runner rules made; every death read as the fat
item read them, with the runner's deaths fixed inside the vocabulary the
skill had earned (a fix that needs a rung the survivor has not reached is
a finding, not a fix). Done is:

- Every want on the list is an order a player at the runner's level could
  give, or a named runner rule listed in section 4.
- No gate reads below its reading before the item (April 5 of 5, winter 5
  of 5, year 3 of 5, lineage 1 of 5), or the record says which death moved
  it and why the vocabulary could not answer it.
- A level-20 camp's attention over a year is under one morning a week
  outside the named rules' flips; a from-scratch life's attention is
  reported, expected daily.
- The lineage is reported with what each heir inherited and each life's
  attention; the trend gate is reported and not required.

## 7. Roadmap and docs

Item L's Built paragraph in the roadmap with the readings; the README's
standing-orders paragraph reads the five rungs and the conditions; the
manual's line on orders, if any, reads them in a clause; the spec's
section 0 holds "Measured before" and "Measured after".
