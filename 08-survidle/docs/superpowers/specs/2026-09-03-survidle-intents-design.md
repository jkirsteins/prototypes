# Survidle: intents, an orchestration layer over tasks

Today the player clicks Walk to the forest, then Fell a tree, then Haul to
camp, then Walk back, then Sleep, and lights the fire by hand between. This
spec replaces that with intents: "Gather wood, forever, bring it to camp".
The game does the going, the felling, the hauling, and, when the body asks
for it, the walk back to camp, the fire and the night's sleep.

An intent is an orchestration layer and nothing more. Every step it takes is
an ordinary task started through `startTask`, advanced by `stepTask`, and
set aside by `stopTask`. Skills, mastery, pools, tool wear, injury, yields,
odds and the set-aside shares are untouched, because the runner never
computes any of them; it only decides which task to start next.

Extends `2026-09-02-survidle-design.md` and
`2026-09-02-survidle-skills-design.md`.

## Decisions confirmed with the author

- **Depth: logistics and body only.** An intent handles walking, the work,
  hauling to camp, and self-care. It never gathers inputs for a tool or a
  structure it lacks: with no axe, "Gather wood" says "needs an axe" and
  does not start. The one exception is building, which may haul materials
  that already exist in this region's piles to camp (section 4.2, rule 3).
- **Night: go to camp and make a fire if it can.** When sleep is due away
  from camp the runner walks to the current region's camp cell, lays a fire
  pit from stones, splits a log and lights the fire when the means are in
  reach, sleeps, and walks back to the work at dawn.
- **UI: intents replace the tabs.** One list of intents with a shared
  settings strip; the old raw action list survives unchanged behind an
  "advanced" toggle.
- **Runner: reactive.** The intent is a small record. Each minute the runner
  re-reads the world and does at most one thing. It stores no plan, so
  nothing goes stale, saving is trivial, and offline catch-up continues the
  intent for free.

## 1. The intent record

`GameState.plan` is removed. In its place:

```ts
export type Until =
  | { kind: "once" }
  | { kind: "times"; n: number }
  | { kind: "campHas"; item: ItemId; qty: number }
  | { kind: "forever" };

export interface Intent {
  /** The work underneath, in the terms startTask already speaks. */
  task: TaskId;
  arg?: string;
  /** The cell the work is done in, resolved once when the intent starts. */
  cell: number;
  /** The home camp: where "bring it to camp" delivers. Fixed at start. */
  campCell: number;
  until: Until;
  deliver: "leave" | "camp";
  /** Completions of the work so far. */
  done: number;
  /** What the runner is doing right now, for the Doing panel. */
  step: string;
  /** The body need being served, so a need with an exit above its entry holds between the two. */
  need: "sleep" | "cold" | "hungry" | null;
}

// GameState
intent: Intent | null;
```

`task` can be any of: `chop`, `sticks`, `bark`, `stone`, `berries`, `hunt`
(arg species), `fish`, `split`, `cook` (arg food), `light`, `craft` (arg
recipe), `repair`, `sharpen`, `build` (arg structure), `haul`, `night`,
`rest`, `sleep`. `haul` and `night` are new task ids that exist only as
intents (section 4.4); `startTask` refuses them. `walk` and `travel` are
never intents: the Region panel's walk and go buttons start them directly,
as today.

### 1.1 Resolving `cell`

Resolved once in `startIntent`, never again. A cell is chosen this way:

| work                                              | cell                                                                                              |
|---------------------------------------------------|---------------------------------------------------------------------------------------------------|
| ground-bound: chop, sticks, bark, stone, berries, hunt, fish, build snare | the chosen spot if it suits the work; else the cell under foot if it suits; else this region's spot for that ground (forest, outcrop, shore, heath) |
| camp-bound: split, cook, light, build (not snare), repair, sharpen        | the home camp cell                                                                    |
| craft                                             | the cell under foot if the recipe's inputs are in reach here; else the home camp cell             |
| haul                                              | the cell under foot (the pile being hauled)                                                       |
| night, rest, sleep                                | the cell under foot                                                                               |

"Suits" is the same ground test `checkFresh` applies today (`inForest`,
`onRock`, `onHeath`, `byWater`, a species' `spot`). The region's spot for a
ground is what `ground()` in `checkFresh` names when it says "walk to X".
When a chosen spot does not suit the work the runner falls back as in the
table and `step` says so for the first step: "the outcrop has no trees;
going to the forest instead".

`campCell` is always the camp of the region the player stands in when the
intent starts. A region has no camp cell only if it was never generated,
which cannot happen for the region under foot.

### 1.2 `until`

| kind      | met when                                                                       |
|-----------|--------------------------------------------------------------------------------|
| `once`    | `done >= 1`                                                                    |
| `times`   | `done >= n`                                                                    |
| `campHas` | the pile at `campCell` holds at least `qty` of `item`                          |
| `forever` | never; the intent ends only when blocked or stopped                            |

`campHas.item` is the work's primary yield, fixed when the intent starts:

| work    | item        |
|---------|-------------|
| chop    | log         |
| sticks  | stick       |
| bark    | bark        |
| stone   | stone       |
| berries | berries     |
| split   | firewood    |
| hunt    | rawMeat     |
| fish    | fish        |
| cook    | cookedMeat or cookedFish per arg |
| craft   | the recipe's `out.item`; recipes that make a tool or clothing offer no `campHas` |
| build, light, repair, sharpen, haul, night, rest, sleep | no `campHas`; the strip's choice falls back to `once` |

Only the camp pile counts, not the pack: the promise is "camp has 40 logs",
and 40 logs in the forest are not that.

`done` counts completions of the work task only. Walks, hauls and body steps
do not count. A hunt that misses is still a completion.

## 2. Where the runner sits

`advance.step` today:

```
stepTask
if (!task) runPlan
if (!task && energy < 10) sleep where you stand
stepCamp, stepPlayer, autoEat, ...
```

becomes:

```
stepTask
runIntent          (body tier every minute; work tier when the slot is free)
if (!task && energy < 10) sleep where you stand
stepCamp, stepPlayer, autoEat, ...
```

The involuntary collapse at energy 10 stays as the floor under everything,
intent or not.

`runIntent(state, world, cal, rng)` returns after starting at most one task
or taking at most one instant action, except that instant actions (eat,
load, drop, pocket food) are followed in the same call by the next decision,
bounded by a guard of eight iterations, the way `runPlan` chains today.

## 3. The body tier

Evaluated every minute while an intent is live, before the work tier. A body
need that holds takes over: if the current task is not already the step the
need calls for, the runner calls `stopTask` (the share done is kept, exactly
as a manual stop) and starts the need's next step. Needs are checked in this
order and the first that holds wins.

### 3.1 Sleep

Holds when `energy <= 20`, or when it is night (`cal.isNight`) and
`energy < 60`, and keeps holding (`need === "sleep"`) until a `sleep` task
completes, whichever way it was started.

Steps, each taken only when the previous does not apply:

1. Not at this region's camp cell and a route exists: walk there
   (`walk cell:<camp>`, step "walking to camp for the night").
2. No route to this region's camp: sleep where you stand (step "sleeping
   where you stand; no way to camp"), and log "No way to camp from here. You
   sleep where you are." once.
3. At camp, fire cold, no fire pit, 6 stone in reach: `build firePit`.
4. At camp, fire cold, pit present, fire drill held, no firewood in reach,
   axe held, a log in reach: `split`.
5. At camp, fire cold, pit present, fire drill held, at least 1 kg firewood
   in reach: `light`.
6. `sleep`.

"In reach" is `reach(state, world)`: the pack and the pile under foot. The
steps use `check` so a step that cannot start (under-level build, no drill)
is simply skipped, never an error. Each is an ordinary task and trains its
skill.

Because the sleep task's own length is "until dawn or rested, at most 10 h",
the need cannot flap: once asleep the runner does nothing until the task
ends, and on waking energy is well above 20 and it is day.

Sleep while a `build` is under way: `stopTask` banks the minutes in
`regionState.build`, and the work tier resumes the build the next morning
with those minutes kept, as any manual stop-and-resume does today.

### 3.2 Cold

Holds when `warmth < 30`, and keeps holding (`need === "cold"`) until
`warmth >= 45` or the sleep need takes over. The exit is set at 45 rather than higher because the warmth a
body settles at beside a winter fire can sit in the fifties; an exit it
never reaches would rest forever. Steps 1 to 5 are the same as sleep's (walk to camp, pit, split,
light); step 6 is `rest` (step "warming up by the fire", or "resting to warm
up" when there is no fire). `rest` is 60 minutes and repeats through the
work tier's silence until warmth is back at 45; the runner starts another
`rest` each time the slot frees while the need holds.

A cold body with no fire and no shelter may never reach 45; then the rest
repeats until sleep takes over or the player stops it. That is the
same fate a manual player meets, and the Doing panel says "resting to warm
up" so the player can see it is not working and act.

### 3.3 Hungry

Holds when `kcal < 1800`. Ends when `kcal >= 1800`.

1. Safe food in reach (any of `AUTO_EAT_ORDER`): eat one portion with
   `eat()`, regardless of the auto-eat toggle. Instant. The runner eats at
   most one portion per minute, which is what auto-eat does today.
2. No safe food in reach, safe food in the home camp pile, and not at the
   home camp: walk there (step "walking to camp to eat").
3. Otherwise the need is noted and ignored: the work continues hungry, as
   a manual player would, and the starving tag on the stats panel says so.

### 3.4 Provisioning

Not a need, a habit: whenever the runner stands at the home camp cell and
the intent's work cell is elsewhere, before it walks off it pockets safe
food from the camp pile into the pack, up to 2 kg total of safe food in the
pack, without passing `PACK_COMFORTABLE_KG`. Order: dried meat, cooked
meat, cooked fish, berries (densest first). Instant, via `transfer`. Raw
meat is never pocketed.

## 4. The work tier

Runs only when `state.task` is null and no body need holds. Rules in order;
the first that applies is taken.

### 4.1 Load and delivery

A **load is ready** when `deliver === "camp"` and either the pack plus the
pile at the work cell weigh at least `PACK_HARD_KG`, or the work is over
(`until` met or the work is blocked) and there is something left to carry:
the pile at the work cell is not empty, or the pack holds any of the work's
yield (the item in section 1.2's table; for chop also sticks; for hunt also
hide, bone and sinew; for haul, anything at all).

A **haul leg** is: at the work cell, `loadPack` (heaviest first, to the hard
limit, as today); walk to `campCell`; drop everything from the pack onto the
camp pile; then, if the work continues, walk back to the work cell. Each
walk is an ordinary `walk cell:<n>` task. Logs weigh 20 kg, so a leg moves
one log, as hauling does today.

Dropping at camp drops everything in the pack, including things the player
was carrying before the intent started. That is what today's haul does too,
and the pack is emptied onto the camp pile, which is where a player wants
things. Tools and clothing are not in the pack and stay on the body.

### 4.2 Rule order

Legality (rule 5's `check`) is evaluated at the work cell wherever the
player stands (section 6), so a blocked intent ends where it is instead of
walking back to find out.

1. **Until met.** If a load is ready, take the next step of the haul leg.
   Otherwise end the intent: log "`<label>`: done." as `good`, clear
   `state.intent`.
2. **Load ready.** Take the next step of the haul leg.
3. **Build needs fetching.** `task === "build"`, at the home camp, `check`
   says "missing materials at camp", and some pile in this region other than
   the camp pile holds at least one of the missing items: walk to the
   nearest such pile (by route minutes), load the missing items first and
   then fill the pack heaviest first, walk back to camp, drop. When no pile
   holds any missing item, fall through to rule 5, which ends the intent
   with "missing materials at camp".
4. **Not at the work cell.** `walk cell:<cell>` (step "walking to the
   forest" using `whereIs`). If the walk cannot start, end the intent with
   its reason: "no way there on foot", or "the pack is too heavy to lift".
5. **Start the work.** `check(task, arg)`. If `ok`, `startTask(task, arg,
   false)`; the step text is the option's label in lower case ("felling a
   tree"). If not `ok`, end the intent with the option's `why`: log
   "`<label>`: `<why>`. You stop." as `bad`.

`done` increments in `stepTask` when a task completes while an intent with
that task and arg is live; `stepTask` never restarts the task itself, since
intents pass `repeat = false`.

### 4.3 Blockers end the intent

There is no waiting on a transient condition. The reasons `check` gives
today are the reasons an intent ends with, in the same words: "needs an
axe", "nothing left worth felling", "needs arrows in the pack", "the water
is empty", "nothing ripe yet", "missing materials", "already built here",
"needs a lit fire". Two reasons never reach the player because the runner
handles them: the ground reasons ("stand in the forest; walk to the
forest") and "walk to camp".

One reason is downgraded: "no logs here" for `split` and "no raw meat here"
for `cook` at the home camp end the intent like any other; they are what
"until camp has 100 kg firewood" runs into when the logs run out, and the
log line says exactly that.

### 4.4 The two intent-only tasks

- **`haul`**: "Bring what lies here to camp". `cell` is the cell under foot,
  `deliver` is forced to `camp`, `until` is forced to `once`, and the work
  step is a no-op that counts as done as soon as the pile at `cell` is
  empty. In practice rule 2 runs haul legs until the pile is bare, then
  rule 1 ends it. This replaces `startHaul` and the `Plan` type.
- **`night`**: "Camp for the night". Forces the sleep need to hold until a
  `sleep` task completes, whatever the energy, and then ends. It exists so
  the player can say "turn in" without choosing a bed step by step.

`rest` and `sleep` as intents are the raw tasks with `until: once`, kept so
the intents list has them; the body tier never triggers for them.

## 5. Starting and stopping

`startIntent(state, world, cal, intent: Omit<Intent, "cell" | "campCell" |
"done" | "step">, where: SpotId | "nearest")` resolves the cells (section
1.1), calls `stopTask` (which also clears any live intent), sets
`state.intent`, and calls `runIntent` once so the first step begins in the
same minute. It returns false and sets nothing when `check` at the resolved
cell would fail for a reason other than ground or camp; the UI greys the
button with that reason, so a click that cannot start is not offered.

`stopTask` clears `state.intent` and sets the task aside as today. Starting
a raw task through the advanced list also goes through `stopTask`, so a raw
task and an intent are never live together.

A stopped intent keeps its work's share in `state.paused` under the same
keys as today. The Set aside list gains a **finish** button on every entry,
wherever the player stands: it starts an intent for that task with `cell`
set to the entry's cell (or the cell under foot for carried work), `until:
once`, `deliver: leave`. The existing **resume** button, offered only when
the player is at the cell, stays.

## 6. Legality shown on the button

`check` and `checkFresh` take an optional trailing `at` cell, defaulting to
the cell under foot; ground, camp and reach are judged at that cell. The
position predicates in `position.ts` get cell-based forms (`forestCell`,
`rockCell`, `heathCell`, `watersideCell`) that the player-based ones call.
`intentOption(state, world, cal, task, arg, where)` is `check` at the
resolved cell, so the only reasons left on a button are the real ones
(tools, materials, populations, seasons). Its `duration` is the work's duration for one completion, and the
button shows it in both clocks as today: "1 h (1 min)". A walk is not added
to that time; the Doing panel's step bar shows each walk as it happens.

`startTask`, `stepTask`, `complete` and `stopTask` keep their signatures.
`startTask` splits into `beginTask`, which starts a task without touching
the intent and is what the runner calls, and `startTask`, which is
`beginTask` followed by clearing the intent, for the advanced list. `availableTasks` keeps producing the raw list for the
advanced toggle unchanged.

## 7. The UI

### 7.1 The Do panel

The six tabs go. The panel is:

1. **The settings strip**, applying to whatever intent is clicked next:
   - **Do it:** `once` | `N times` | `until camp has N` | `forever`, as four
     toggle buttons, with one number field shared by the two that need it,
     default 10, min 1.
   - **Bring it:** `leave it` | `to camp`.
   - **Where:** `nearest` | one button per named spot of this region other
     than camp, showing the spot's distance from here.
   The strip lives in `UiState` (`until`, `n`, `deliver`, `where`), starts
   at once / 10 / leave it / nearest, and is not saved.
2. **Instant buttons**, as today at the top of the Camp tab: eat, add
   firewood, hang raw meat. Shown whenever they apply, not only on a tab.
3. **The intents list**, under five headings: Gather (wood, sticks, bark,
   stone, berries), Hunt (hare, grouse, roe deer, elk, fish), Camp (split a
   log, cook meat, cook fish, light the fire, mend clothing, sharpen the
   axe, camp for the night, rest, sleep), Make (every recipe), Build (every
   structure). Movement is not listed; the Region panel has it.
4. **advanced**: a toggle at the bottom. When on, today's tabbed raw list
   renders under it, byte for byte what `actionsHtml` produces now,
   including loop buttons, spot walks and Haul. Haul in that list starts the
   `haul` intent.

Each intent row keeps the anatomy of today's button: label, recommended
level, mastery bar, the per-completion time in both clocks, the detail line,
and the greyed reason when it cannot start. A row whose work cannot take
the strip's `until campHas` (section 1.2) shows "once" in its own small
print so the player is not surprised.

The intent is described on the button's second line when the strip would
change it from a plain click: "forever, bringing it to camp, at the forest".

### 7.2 The Doing panel

With an intent live:

```
Doing                                   stop
Gather wood, forever, bringing it to camp
  felling a tree at the forest             [======    ] 38 min left
```

The first line is the intent sentence: `<label>`, then the until clause
("once" is omitted, "5 times", "until camp has 40 logs", "forever"), then
"bringing it to camp" when `deliver` is camp. The second line is
`intent.step` and the current task's bar. `done` shows when `until` is
`times`: "3 of 5 done". Body steps read plainly: "walking to camp for the
night", "splitting a log for the fire", "lighting the fire", "sleeping",
"warming up by the fire", "walking to camp to eat", "eating".

Without an intent but with a raw task under way, the panel is as today.

The Set aside list gains the finish button (section 5).

### 7.3 Log lines

- Start: nothing; the Doing panel shows it.
- End by until: "`<label>`: done." (good).
- End by blocker: "`<label>`: `<why>`. You stop." (bad).
- Night away from home: "You turn in at camp in `<region>`." when the night
  camp is not the home camp; nothing when it is.
- No route to camp for the night: "No way to camp from here. You sleep
  where you are." (bad).

These are what the away panel shows after an offline stretch, so a returning
player reads a sequence such as: "A roe deer. 12 kg of meat." / "You turn
in at camp." / "Smoke, then flame. The fire is lit." / "Hunt roe deer: no
roe deer here. You stop."

## 8. Persistence

`SaveFile.version` stays 3. `fillDefaults` sets `state.intent ??= null` and
deletes `state.plan` if present. A live intent is saved with the state,
survives reload, and continues through `catchUp` because `runIntent` is
inside `advance`. The strip's settings are not saved.

## 9. Removals

- `Plan`, `PlanStep`, `GameState.plan`, `runPlan`, `startHaul`, and the
  `plan` branches in `stopTask`, `panels.taskHtml` and `newgame`.
- `"haul"` as a case in `checkFresh` becomes the intent option (section
  4.4); the advanced Haul button stays and starts it.
- Nothing else. `loadPack`, `walkTarget`, `whereIs`, `check`, `startTask`
  and every completion effect stay as they are.

## 10. Tests

All through `advance` on seeded states, all fast.

- **Runner table.** For each rule in sections 3 and 4, a fixture state and
  the one step the runner takes: the started task id and arg, or the ended
  intent and its log line. Ordering cases: sleep beats cold beats hungry
  beats work; until-met beats load-ready; load-ready beats walking to work.
- **A working day.** From camp with an axe, "Gather wood, forever, to camp":
  after 24 game hours, trees have fallen, logs lie at camp, one sleep task
  ran at the camp cell, the fire was lit if a pit, drill and firewood were
  there, and the work resumed after dawn. Woodcraft xp equals the minutes
  spent in `chop` and `split` tasks, none from walks.
- **Preemption keeps the share.** A cabin build started at energy 25 is set
  aside when energy reaches 20, sleep runs, and `regionState.build.cabin`
  plus the resumed task's progress add up to the minutes worked.
- **Every blocker.** For each `why` in `checkFresh` reachable by an intent,
  the intent ends with that text in the log and `state.intent` is null.
- **Until.** `times 3` ends after three completions; `campHas log 8` ends
  after two trees and the hauls; `once` with `deliver camp` hauls before
  ending.
- **Haul intent.** Replaces the existing haul test: a pile at the forest is
  emptied to camp one load at a time, and the intent ends.
- **Fetch for a build.** Logs at the forest, lean-to materials otherwise at
  camp: "Build lean-to" fetches the logs, then builds.
- **Save and away.** Serialize mid-intent, deserialize, `catchUp` an hour,
  the intent is still live and `done` advanced. A version 3 save with a
  `plan` field loads with `intent` null.
- **UI.** The strip renders and its clicks change `UiState`; the Doing
  sentence for each `until` kind; the finish button on a set-aside entry;
  the advanced toggle hides and shows a raw list identical to
  `actionsHtml`'s output today.

Then a browser pass on the dev server: start "Gather wood, forever, to
camp" at speed 60 and watch a day and a night go by in the Doing panel and
the log.

## 11. Out of scope

- Resolving prerequisites: making the axe you lack, gathering the stones
  for a fire pit you do not have. The intent says what is missing and stops.
- Intents across regions: `cell` is always in the region the intent starts
  in. "Go to Stensund" stays a walk from the Region panel; the next intent
  starts there.
- Queues of intents, or two intents at once.
- A per-intent save of the strip's settings.
- Tuning the body thresholds by the player. The numbers in section 3 are
  constants beside the ones in `advance.ts` and `player.ts`.
