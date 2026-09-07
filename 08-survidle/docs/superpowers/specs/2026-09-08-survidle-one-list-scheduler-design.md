# Survidle: one list, one rule

> "there is definitely something funny about the queue i dunno what that
> is, **i don't trust it**" - Nikko, note 148

> "my biggest complaint is - ignoring UI things - is the ordering of the
> tasks. I really don't want to deal with that" - note 183

The order list is governed by three schedulers that do not know about each
other.

`chooseOrder` (`src/sim/orders.ts:415`) picks a row from the list, but only
on a minute with a free task slot. `serveBody` (`src/sim/intent.ts:678`)
pre-empts the live intent every minute with one of eight body needs - but
only when the intent is the runner's, so a once order the player clicked
gets no body tier at all and runs until the collapse clause in `runIntent`
catches it. `bodyAsks` (`src/sim/body.ts:126`) runs a third reading in the
gap between orders, to give hand-clicked work the body turn `serveBody`
denied it.

None of the three is on the list. The player sees rows and infers that the
rows are the game; what actually decides the minute is a hidden interaction
between the rows, the mode of the live intent, and a need model with no
representation anywhere on screen.

Every queue complaint in the 2026-09-07 playtest comes out of that gap, and
so does the one bug left unfixed on `survidle/queue-bugs`. This spec
replaces the three schedulers with one loop over one list, and puts the
body on that list as a row.

Extends `2026-09-07-survidle-order-ladder-design.md` (the rungs and the
conditions) and `2026-09-07-survidle-legibility-design.md` (what a row
says about itself). It moves numbers in every gate; section 9 says which
and why that is expected rather than a regression.

## Decisions confirmed with the author

- **Nothing blocks by default; blocking is an opt-in pin per row.** A row
  that cannot run is passed over and the list goes on. A row the player
  has pinned holds the list while it is unmet, which is today's once
  behaviour, kept as a deliberate tool rather than a rule the player
  discovers by dying of it.
- **The topmost runnable row wins, every minute, including mid-work.**
  One sentence describes the whole scheduler. A row that takes over sets
  the live one aside with its progress kept.
- **The body is one row now, not seven.** "Look after yourself" covers
  sleep, food, water, warmth, shelter and coming home. Splitting it into a
  row per need is a later change, and the design keeps it a data change
  rather than a rewrite.
- **The body row cannot be removed, only ranked.** Ranking it to the
  bottom already means "never look after yourself"; a delete button adds
  only a way to do that by accident.
- **A click goes to the top, a standing order goes to the bottom.** This
  is note 111's question answered in one sentence, and it keeps the
  standing ruling that a once order is immediate while a standing order
  leaves the actor leeway.
- **A click lands above the body row.** That is the existing "hand work
  has no body tier" rule, now a visible rank instead of a hidden mode.

## 1. The verdict, and the loop

Every row is read into one of four verdicts:

```ts
/** What the scheduler makes of one row this minute. */
type Verdict =
  | { v: "met" }              // asks for nothing right now
  | { v: "shut"; why: string } // conditions closed: season, stock, dark, capacity
  | { v: "blocked"; why: string } // wants to run and cannot: no tool, no route, illegal
  | { v: "ready" };
```

`met` and `shut` are today's two silent pass-overs and keep passing over.
The change is `blocked`: it passes over too, unless the row is pinned.

The loop is the whole scheduler:

```
for each row, top down:
   if row is pinned and not met and not ready -> the list is held here; stop
   if row is ready -> this row runs
   otherwise -> next row
nothing ready -> wait at camp
```

`judgeOrders` (`src/sim/orders.ts:426`) keeps its shape and its job of
judging every row afresh so no row shows a stale reason. Its return type
changes from `{ chosen, stalling }` to `{ chosen, blockedBy }`, where
`blockedBy` is only ever a pinned row. `stallingOrder` becomes
`blockingOrder` and keeps its callers (the player script reads it to know
the list needs an answer). `waitingLine` (`src/sim/orders.ts:510`), which
turns that judgement into the words on a row, keeps its shape and swaps
"held up by" onto the pinned row.

The `intentMode(...) === "hand"` test inside `judgeOrders`, which is what
makes a once order stall the list today, is deleted. Nothing about a row's
*kind* decides whether it blocks; only its pin does.

## 2. Pre-emption, and why it is cheap

`runOrders` (`src/sim/orders.ts:541`) returns on its first line when
`state.task` is set, so today a row dragged to the top waits for the
current chunk to end - which `decideAgain` exists to work around, by
setting the live task aside whenever the player edits the list.

Under one rule the judgement runs every minute whether or not a task is
live. When the chosen row is not the live row, the live row is set aside
(`setAside`, which keeps its share of the work) and the chosen row starts.
`decideAgain` and the two `...ByHand` doors it serves are deleted: the
scheduler now notices an edit on the next minute by itself, which is what
those doors were faking.

One exception survives, unchanged: a live order carrying a load home is
still the chosen row until it has delivered (`deliveryPending`, and the
`windDown` path). A survivor does not drop 18 kg of bark in the snow
because a keep dipped under its target.

**The expensive half only runs on a prefix.** A row's readiness needs
`intentOption`, `resolveCell` and a walk `check` - the last of which routes
across the map. Rows *below* the live row cannot pre-empt it, so they need
only the cheap reads: `conditionOpen` and `orderMet`. The expensive
readiness check runs for the rows above the live row, plus the live row
itself. On a list whose live row is near the top - the ordinary case - that
is one or two routings a minute, which is what the code does today.

Without this the multi-hundred-day gates would put A* in the inner loop.
The rule is stated as an invariant in the code, not left to be inferred:
*a row is judged for readiness only if it could take the minute.*

**Thrash guard.** A row takes over live work only when it crosses its
**idle** start line, never its live one. `orderMet` already distinguishes
the two (a keep is unmet under half today's target when idle, under the
whole target when live), and `keepBand` gives a restart band the same
memory. The body's needs have their own sticky exits inside `currentNeed`.
So the guard is not new machinery - it is a rule about which threshold the
scheduler asks for, and it is what stops a keep hovering at its line from
yanking the survivor out of a chop every other minute.

## 3. The body row

`OrderKind` gains a fourth member:

```ts
export type OrderKind = "keep" | "grind" | "job" | "body";
```

There is exactly one `body` row per region list. It is created with the
region's camp (`newgame.ts`, and the migration in section 8), it cannot be
removed, and `removeOrder` refuses it.

Its sentence is fixed:

> Look after yourself - sleep, food, water, warmth, shelter, home before dark.

Its verdicts come from the need model rather than from a target:

- `met` when `currentNeed(...)` returns null.
- `ready` when a need holds and `bodyStep` returns a step for it.
- `blocked` when a need holds and `bodyStep` returns null - a thirst with
  no water in reach, a hunger with nothing edible. The reason is the
  need's own word, so the row reads "thirsty; no water within reach"
  rather than going quiet at the moment it matters most.

`met`/`shut`/`blocked` for the body row are all cheap: `currentNeed` reads
the player and the weather. `bodyStep` can route (the walk to the shore),
so it obeys section 2's prefix rule like any other row.

### 3.1 `serveBody` comes out of `runIntent`

`runIntent` (`src/sim/intent.ts:700`) calls `serveBody` for every runner
intent. That call goes. Under the one rule it is redundant when the body
row outranks the live order - the scheduler would pre-empt anyway - and it
is *wrong* when the player has ranked the body row below the work, which
is the lever this whole spec is for. Note 149, "how can i get him to do
something and not sleep", is answered by dragging one row.

What remains of `serveBody` moves into the body row's own run: the row
becomes the live intent (the runner-shaped `wait` intent that already
exists for this in `runOrders`), and its minute reads the need and takes
the step. The sleep-wake clause inside `serveBody` - a sleep task set
aside the minute the model says the body is done sleeping - moves with it.

`bodyAsks` is deleted. It existed only to give hand-clicked work the body
turn `serveBody` denied it, and there is no such denial left: the body is
a row, and it wins when it outranks what is running.

### 3.2 The sticky state moves to the player

`RunnerIntent.need` and `RunnerIntent.coldSpent` (`types.ts:278,282`) are
read back by `currentNeed` to make a need's exit stickier than its entry -
a `cold` need holds until warm, not until it stops being freezing. The
body intent now comes and goes as the row wins and loses the minute, so
state on the intent would reset each time and flicker every sticky need.

Both move to `Player`:

```ts
/** The body need being served, or null. Sticky: a need's exit line is not its entry line. */
bodyNeed: BodyNeed | null;
/** A rest has already failed to raise warmth: cold does not hold again until warmth recovers on its own. */
coldSpent: boolean;
```

`RunnerIntent` keeps `restFromWarmth`, which is genuinely per-step.
`HandIntent.need: null` and the `Intent` union lose their reason to
differ on `need`; the field leaves `IntentBase` entirely.

### 3.3 The three backstops stay

Removing the body tier from work does not remove the floor under it:

- `runIntent`'s collapse clause: a hand order at `SLEEP_AT` ends where it
  stands and the survivor sleeps there.
- `currentNeed`'s own collapse: `p.energy <= SLEEP_AT` sets
  `p.sleeping = { collapsed: true }` regardless of what any row says.
- `advance.ts:79`: an idle body under `EXHAUSTED` lies down.

A player who ranks the body row last gets a survivor who works to
collapse. That is the intended reading of the lever, and it is survivable
rather than instantly fatal.

## 4. Fall-through announces itself

Finding 4 in the playtest is that a blocked row prints one bare word.
Fall-through makes that worse if left alone: the row is passed over *and*
something else starts, so the player sees work they did not ask for.

`markSkipped` already logs on the `""` -> reason transition. It gains the
other half of the sentence, and only for the class of row that used to
block - a once job, the player's own request:

> Light the fire is held up (needs dry weather). Digging roots instead.

Standing rows fall through silently, as today. A keep passed over is
routine - it is what "keep camp at 40 kg firewood" *means* on a day the
camp has 40 kg - and announcing it would bury the log.

The row itself keeps showing its reason on the list every minute,
unchanged.

## 5. The pin

```ts
/** The player has said this row holds the list until it is met. */
pinned?: boolean;
```

Off, the row falls through. On, an unmet row that is not ready holds the
list: nothing below it runs until it can run, or it is met, or the player
unpins or strikes it off.

`shut` counts as not ready, so a pinned row waiting on a season holds the
list until that season opens - months, if the player pins a berry order in
January. That is a real foot-gun and it is kept deliberately, because the
alternative is a pin that means "hold, except for the reasons we decided
do not count", which is the class of hidden exception this spec exists to
delete. The banner in the next paragraph is what makes it survivable: the
list never stands still without saying which row is standing on it and why.

Not ladder-gated. The rungs gate *power* - a keep is a promise the runner
keeps for you - and the pin buys no power. It is a way of saying "do not
start anything else until this is done", it can only ever cost the player
throughput, and its cost is visible while it is being paid.

**It is visible while it is being paid.** A pinned row holding the list is
not a state the player should have to infer from a survivor standing
still, which is exactly what happened at note 242. Above the list:

> The list is held up by **Light the fire** - waits for dry weather.
> Unpin it to let the rest of the list run.

The pin control on a row reads `do this first` when off and
`doing this first - holds the list` when on, because a two-behaviour row
that looks like a one-behaviour row is the confusion this spec exists to
remove.

## 6. Where a row lands

Two landing rules today: `orderByHand` (`src/sim/ladder.ts:117`) inserts a
once click at `liveHand + 1`, and `addOrder` appends everything else. That
is note 111 - "is this a queue, or is this a stack" - and it is
unanswerable because the honest answer is "both, depending".

The rule becomes:

- **A click goes to the top.** Index 0, always, above the body row. It
  runs on the spot, as the click-reorder ruling requires.
- **A standing order goes to the bottom.** It is a policy, and policies
  sit under the day's requests.

The `liveHand + 1` insertion goes with it. Its purpose was to keep a
second click from displacing the first, and under the new rule a second
click *does* displace the first - which is what "I want this now" means,
and what the player expects from a click.

The panel prints the rule where the list can be seen, in those two
sentences. It is one line, and it is the only documentation the queue
needs once the rule is actually one rule.

## 7. What the panel shows

- The body row reads distinctly from the work rows, and shows the need it
  is serving as its live step ("warming up by the fire", "walking to the
  shore to drink"). That is finding 2 answered for the body's own actions,
  which were previously the least legible thing in the game because they
  belonged to no row.
- The held-up banner from section 5, when and only when a pinned row is
  holding the list.
- The landing rule, one line, at the head of the list.
- The pin control per row.

Nothing else in the panel changes. The layout findings (1, and the nested
scroll capture at note 74) are not this spec's.

## 8. Save shape

`Order.pinned` is optional and absent means off.

`Player.bodyNeed` and `Player.coldSpent` are new. A save without them
loads with `bodyNeed: null, coldSpent: false`, which is the state a
survivor is in on any minute the body is not mid-need - a lost sticky
exit at load is one need re-entered a minute later, not a corruption.

**The body row must exist on every loaded region list.** A save from
before this change has none. The migration adds one to each region's
orders, ranked at the top: a loaded game behaves as it did before, since
a body row at the top is the old always-pre-empting body tier exactly.

## 9. What moves in the gates, and why it is expected

This changes what the survivor does with its minutes, so April, winter,
year, lineage and heir will all read differently. Named in advance so the
readings are judged rather than chased:

- **Work chosen by hand now yields to the body** when the body row
  outranks it - it never did before. Expect fewer collapse deaths and
  more time in rest and sleep.
- **A blocked row no longer stops the list**, so a run that used to stand
  still now does the next thing. Expect more work done per day and fewer
  deaths of the "stood there while the list was stuck" kind.
- **A keep can now interrupt live work**, guarded by its idle threshold.
  Expect keeps to read met more of the time and grinds to be interrupted
  more.

The golden replay hashes move. They are regenerated deliberately, in their
own commit, with the readings recorded beside them.

**The gates are not tuned to stay green.** A gate that goes red on a
correct rule is a reading about the game, and it is reported as one.

## 10. Tests

Behavioural, one per claim this spec makes:

1. Clearing the order list does not stop a live sleep. (Bug 1, note 147.)
2. Striking off an unrelated standing order does not stop a live sleep.
   (Note 146.)
3. A once row that cannot run is passed over and the row below it runs.
   (Notes 171, 174, 242.)
4. The same row, pinned, stops the list, and `blockingOrder` names it.
5. A once row passed over writes one log line naming both halves, once,
   on the transition - not every minute.
6. The body row ranked below a `forever` grind: the survivor works past
   spent and past sleepy, and the collapse backstop catches him.
7. The body row at the top pre-empts a live grind mid-chunk, and the
   grind's progress is still there when it resumes.
8. A click lands at index 0 and runs on the minute it is clicked, with a
   body need outstanding.
9. A load being carried home is delivered before a higher row takes over.
10. A keep hovering at its target does not take over live work every other
    minute (the idle-threshold guard).
11. Readiness is not computed for rows below the live row. (A counting
    probe on the walk check; this is the performance invariant, and it is
    the kind that rots silently without a test.)

## 11. Out of scope

- **The `autoEat` reflex** (`advance.ts:95`) is a third layer, below both
  the body row and the needs, and design question 3 in the playtest is
  about it. Not touched here.
- **A row per need.** The decision is one row now. The body row's verdict
  already comes from `currentNeed` per need, so splitting it later is a
  list of rows each naming a need, not a new mechanism.
- **Layout, scrolling and the Do panel** (findings 1, 2's UI half).
- **Everything the playtest raised that is not the queue**: the fire
  chain, the food chain, carry weight, the map.
