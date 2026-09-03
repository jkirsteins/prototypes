# Survidle: standing orders, a scheduler over intents

Today the player holds one intent: "Gather wood, forever, bring it to camp".
One intent cannot keep firewood, food and water topped up at once, so a
session is a series of hand-picked intents and an away stretch is one job
running until it blocks. This spec replaces the single intent with a ranked
list of orders per camp: "keep camp at 40 firewood; keep 3 kg dried meat;
build a cabin; otherwise fell trees forever". The runner serves the highest
order that is unmet and can start, and when none can, it waits at camp and
keeps itself alive there.

Orders are a scheduler and nothing more. The intent record, the body tier,
the work tier, hauling, fetching and every task stay exactly as
`2026-09-03-survidle-intents-design.md` specifies them. The scheduler only
decides which intent is live.

This is the first of three sub-projects toward an idle loop; the roadmap
(`2026-09-03-survidle-realism-roadmap.md`, "The idle loop") names the other
two, the risk forecast and skill tiers, which build on this.

## Decisions confirmed with the author

- **Ranked standing orders**, not a daily routine, not a queue, not
  buildings that produce out of nothing. Each minute with a free slot the
  runner serves the highest unmet order.
- **Two kinds of entry in one ranking.** Standing orders never finish
  (keep a stock, or grind forever). Jobs finish and drop off (once, N
  times, until camp has N, a build). A job sits wherever the player ranks
  it: above "keep meat" means it runs hungry, below means it waits.
- **Building does not need the player present**, only their decision. A
  build is a job; the runner hauls, builds and sleeps its way through it.
- **Away stays as risky as the rules say.** The runner adds no safety net
  beyond what the body tier already does. The one new behaviour, waiting at
  camp when nothing can run, is what a person would do; it is not a rescue.

## 1. Orders

Orders live per camp, in `RegionState`, so a system belongs to the place it
was set up in. The list shown is the region under foot. Walking into a new
region shows its list, empty until the player sets it up; coming back shows
the old one, which resumes.

```ts
export type OrderKind = "keep" | "grind" | "job";

export interface Order {
  /** Stable within the run; the live intent names its order by it. */
  id: number;
  kind: OrderKind;
  /** The click, as the strip made it. Cells are resolved afresh at every start. */
  req: IntentRequest;
  /** Lifetime counters for the list and the away report. */
  done: number;
  minutes: number;
  /** Why the scheduler last skipped it, or "" when it could run. */
  skipped: string;
}

// RegionState
orders: Order[];
nextOrderId: number;

// Intent
orderId: number | null;
/** The scheduler has chosen another order: deliver what is owed, then end. */
windDown: boolean;
```

A keep's stock is `yieldItem(req.task, req.arg)` and its target is
`req.until.qty`; nothing is stored twice.

`req` is the `IntentRequest` the Do panel builds today (task, arg, until,
deliver, where). The kinds map from the strip's "Do it" choice:

| strip choice        | kind  | `req.until`        | met when                                              |
|---------------------|-------|--------------------|-------------------------------------------------------|
| once                | job   | `once`             | `done >= 1`                                           |
| N times             | job   | `times N`          | `done >= N`                                           |
| until camp has N    | job   | `campHas N`        | the camp pile holds at least N of the yield item      |
| keep camp at N      | keep  | `campHas N`        | see 1.1                                               |
| forever             | grind | `forever`          | never                                                 |

`done` and `minutes` count as the intent's own `done` counts today:
completions of the work task, and minutes spent in it. Walks, hauls and
body steps count for neither. They accumulate for the life of the order.

A work that offers no `campHas` (build, light, repair, sharpen, haul, night,
rest, sleep; recipes that make a tool or clothing) cannot be a keep. The
strip's keep choice falls back to `once` for those rows, shown in the row's
small print as "once", the way `campHas` falls back today.

### 1.1 Keep: the half rule

A keep is **unmet** when the camp pile holds less than half its target, and
once its intent is live it stays unmet until the pile holds the target.
Between half and the target it is met if idle and unmet if running.

Fixed hysteresis, one number for the player. Without it, auto-feed burning
firewood under 40 would send the runner to camp to split one log after
every tree felled. With it, "keep 40 firewood" means "when it drops to 20,
split back up to 40", and the walk is paid once per twenty kilos rather
than once per log.

Only the camp pile counts, never the pack: a keep is a promise about camp.

### 1.2 Jobs drop off

A job whose "until" is met is removed from the list and logged
"`<label>`: done." as `good`, after any pending delivery, exactly as the
intent ends today. A build job is met when the structure stands.

A blocked job stays in the list with its reason (section 2), so the player
sees what it lacks. Nothing removes an order but the player and a met job.

## 2. The scheduler

`runOrders(state, world, cal, rng)` runs each minute inside `advance`,
between `stepTask` and `runIntent`:

```
stepTask
runOrders          (only when the task slot is free)
runIntent
if (!task && energy < 10) sleep where you stand
stepCamp, stepPlayer, autoEat, ...
```

The body tier is untouched. It still preempts any live intent and still
runs only while an intent is live; section 2.3 is what makes an intent
live whenever there are orders.

### 2.1 Choosing

When `state.task` is null, the scheduler walks this region's list top to
bottom and takes the first order that is **unmet** (section 1) and **can
start**: `intentOption` at the cell `resolveCell` would pick, `ok` or with
a fetch allowance, as the button is judged today. Every order it passes
over gets `skipped` set: the option's `why` when it cannot start, or
"" when it was merely met. The chosen order gets `skipped = ""`.

Judging happens every free minute, so a skip clears itself the minute its
reason does: "needs an axe" until an axe is made, "no logs here" until the
grind below hauls one in.

`intentOption` runs `check` and `resolveCell` per order per free minute.
Free minutes are between tasks, a few a day; the list is short. This is
the same cost as rendering the Do panel and needs no cache.

### 2.2 Switching

Let `chosen` be the order found, or null.

1. **Same order.** If the live intent's `orderId` is `chosen.id`, nothing
   changes; `runIntent` carries on.
2. **Delivery first.** If the live intent has a delivery pending
   (`deliveryPending`), the scheduler sets `windDown` on it and does
   nothing else this minute. `workStep` treats a winding-down intent as
   one whose until is met: it takes the delivery steps, then ends the
   intent without a log line. Logs are not left in the forest because
   firewood ran low. The switch happens on the first free minute with
   nothing owed. A winding-down intent is still preempted by the body
   tier like any other.
3. **Switch.** Otherwise `startIntent` starts `chosen` in the ordinary way
   with `orderId` set; its own `stopTask` clears the outgoing intent. The
   slot is free, so there is no task to set aside and nothing to log: a
   switch is silent. The share of work an outgoing intent had set aside
   through the body tier stays in `paused` as today.
4. **Nothing to do.** `chosen` is null and the live intent is not `wait`:
   stop it and start `wait` (section 2.3).

Reordering (up, down, remove) edits the list and nothing else; the next
free minute applies it. Removing the live order's entry ends its intent at
the next free minute through rule 3 or 4, delivery first.

A switch never happens mid-task. A felling in progress finishes the tree,
a walk reaches its cell, a sleep lasts the night. The scheduler runs only
when the slot is free, and the body tier remains the only thing that takes
a task over.

### 2.3 Waiting at camp

`wait` is a new intent-only task beside `haul` and `night`. `startTask`
refuses it; it is never a row in the Do panel. It resolves to the home
camp cell, `until: forever`, `deliver: leave`. Its work step is `rest` at
camp, started afresh each time the slot frees, so the body burns at the
resting rate and is at camp when night, cold or hunger comes. The body
tier serves those as for any intent: the fire is lit from what is in
reach, the sleep is at camp, food in the camp pile is eaten.

`wait` is live whenever the region has at least one order and none can run.
A region with no orders at all has no intent, as today: the player is
clicking by hand and the collapse at energy 10 is the floor.

`wait` shows in the Orders panel as "Waiting at camp" with the rest bar
and, under every skipped order, its reason. It is not an order, cannot be
ranked, and is not saved as one; `orderId` is null on it.

### 2.4 The raw list

A raw task started from the advanced list goes through `startTask`, which
clears the live intent as today. The scheduler does not run while that
task is live, since the slot is not free. When it ends the scheduler picks
the list up again at the next minute. The raw task is a manual override,
not an order, and nothing about it is saved in the list.

## 3. The Do panel

The settings strip and the intent rows stay. What a click does changes: it
appends an order to this region's list. It does not touch the live intent;
the scheduler decides, at the next free minute, whether the new order
outranks it.

- **Do it:** `once` | `N times` | `until camp has N` | `keep camp at N` |
  `forever`. Five toggles; the three that need a number share the one
  field. `UiState.until` gains `"keep"`.
- **Bring it** and **Where** are unchanged.

A row whose work cannot be a keep (section 1) shows "once" in its small
print when keep or campHas is chosen.

Every row is clickable, blocked or not. A row that cannot start now is
drawn dim with its reason in small print, as today, but its button stays
live and the order it adds starts skipped with that reason. This is the
main use of a job: "build a cabin" queued under the grind that will haul
its logs in. Every order is judged afresh at every free minute, so the
row's reason at click time is only what the list shows until the reason
clears.

### 3.1 The Orders panel

Replaces the Doing panel. With orders in this region:

```
Orders
 1  Keep camp at 40 firewood                   split 6 logs, 2 h   ^ v x
      met
 2  Keep camp at 3 kg dried meat                                    ^ v x
      hunting hare at the heath   [=====     ] 40 min left
 3  Build a cabin                                                   ^ v x
      missing 20 logs
 4  Fell trees, forever, bringing it to camp   14 trees, 9 h        ^ v x
      waiting
```

Each row: rank, the intent sentence (`intentSentence`, reused), the
counters as "N <unit>, H h" when `done > 0`, and the three buttons. The
second line is one of: the live step and its progress bar, "met" for a
keep or job at target, the skip reason in grey, or "waiting" for an order
below the live one that could run. When `wait` is live the panel's first
line under the heading is "Waiting at camp" with the rest bar and every
order shows its reason.

The unit is the yield item's label for work with one (trees for chop,
logs for split, hares for hunt hare), and "times" otherwise.

The Set aside list and its finish and resume buttons stay under the list.
A finish click adds a `once` job for the entry, as it starts an intent
today.

Without orders and with a raw task under way, the panel is as today.

### 3.2 Log lines

- Job done: "`<label>`: done." (good), as today.
- Switch that set work aside: "`<label>` set aside; `<new label>`."
- Blocked: "`<label>`: `<why>`." (bad) once, when the order's `skipped`
  changes from "" to a reason, whether the scheduler skipped it or its
  live intent ended on that reason. Nothing while the reason holds, since
  a standing order is skipped a hundred times a day. Today's "You stop."
  goes with it; an order does not stop, it waits.
- Waiting: "Nothing to do. You wait at camp." once, when `wait` starts,
  as plain text; nothing while it continues.
- Night lines are unchanged.

## 4. The away report

`catchUp` snapshots every order's `done` and `minutes` in the region under
foot before advancing and returns, beside the log entries, one summary per
order:

```ts
export interface AwayOrder { label: string; done: number; minutes: number; skipped: string }
```

`awayHtml` shows them above the log, one line each: "Keep 40 firewood:
split 6 logs." / "Fell trees: 14 trees, 9 h." / "Build cabin: blocked,
missing 20 logs." An order with nothing done and no skip reason shows
"nothing to do". Orders removed while away (jobs that finished) are still
listed from the snapshot, with "done" after their counters.

Only the region the player was in when they left is summarised. A travel
task can carry the player into another region while away; that region's
orders run and log as usual, and the summary says "You are now in
`<region>`." above its own list when the region changed.

## 5. Persistence

`SaveFile.version` stays 3. `fillDefaults` sets `st.orders ??= []` and
`st.nextOrderId ??= 1` on every region, and `state.intent.orderId ??= null`.
A save with a live intent and no orders loads as a manual intent with
`orderId` null; the scheduler leaves an intent with a null `orderId` alone
until its region has orders, and then treats it as an outgoing intent
under rule 3 or 4.

`UiState.until` is not saved, as today.

## 6. Removals

- `endIntent`'s "You stop." line for an intent with an `orderId`: the
  reason is written to the order's `skipped` instead, and logged once on
  change (section 3.2). Manual intents (`orderId` null) keep the line.
- Nothing else. `runIntent`, the body tier, `deliveryStep`, `fetchStep`,
  `startIntent`, `stopTask` and every task keep their signatures.

## 7. Tests

All through `advance` on seeded states, all fast.

- **Scheduler table.** One fixture per rule. A keep at 40 with 25 at camp
  is met; at 19 it is unmet, and once live it stays unmet at 30 and is
  met at 40. A higher unmet order takes over at the next free slot and
  never mid-task. A pending delivery is finished before the switch. A
  blocked order is skipped with the option's `why` on it and the next
  order runs. A job drops off when met. Removing the live order ends its
  intent at the next free minute.
- **Waiting.** One order, blocked: `wait` starts, the character walks to
  camp, rests, and sleeps at camp that night with the fire lit when the
  means are there. A region with no orders has no intent.
- **A set-up camp.** Keep 40 firewood, keep 3 kg dried meat, fell trees
  forever, to camp, from a camp with an axe, a drill, a pit, a rack, logs
  and meat. Seventy-two game hours: firewood is never under 20 at any
  dawn, every sleep task ran at the camp cell, trees fell in between, and
  the counters on each order equal the completions in the log.
- **Per region.** Orders in region A; travel to B shows an empty list and
  no intent; travel back and A's list resumes with the same ids.
- **Save and away.** Serialize mid-order, deserialize, `catchUp` two
  hours: the same `orderId` is live, the counters advanced, and the away
  summary lists every order with the delta. A version 3 save without
  `orders` loads with empty lists.
- **UI.** The strip's keep toggle; a click appends an order and does not
  change the live intent; the Orders panel renders the four row states
  (live, met, skipped, waiting) and its buttons reorder and remove; the
  away summary lines.

Then a browser pass on the dev server: the three-order camp at speed 60
across a day and a night, watching the rows change state in the Orders
panel and the away summary after a reload with a backdated save.

## 8. Out of scope

- The risk forecast and skill tiers: the next two sub-projects.
- Orders that span regions. An order's cells are in its region.
- The runner gathering prerequisites it lacks. A blocked order says what
  is missing; a job above it, placed by the player, is how it gets made.
- Time-of-day rules ("hunt in the morning") and per-order body thresholds.
- Sharing an order between camps, or moving a list with the player.
