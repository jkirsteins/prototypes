# Survidle: making the mechanics legible

The game already models more than it says. A rung opens and the news goes
into a scrolling log; the gap under a recommended level halves your odds
and nothing on the row says so; the capability table carries finished
teaching copy that no panel reads. This item is the teaching layer: a
moment when the structure of the game changes, a welcome that adapts to
who just landed, and four places where a rule that already runs starts
saying what it does.

The constraint that shapes every decision here: **helpful to a new
player, not annoying to an experienced one.** A player on their fourth
life must not click through what they learned on their first.

## 1. What is already legible

Not starting from zero, and this section exists so the pass does not
rebuild what stands:

- Every rung unlock writes a log line, once per skill per survivor
  (`RUNG_LINE`, `src/sim/skills.ts`), including on an heir's carried
  levels through `carrySkills`.
- The Skills panel shows all five rungs per skill, the level each opens
  at, and the hours to the next shut one (`skillsHtml`).
- Mastery 20 and 50 announce their concrete extra: "an extra stick per
  tree".
- A shut kind button on a Do row carries its own small print: "jobs at
  Building 3, you are 1, about 4 h" (`kindNeeds`).
- A blocked row says why it is blocked and can be queued anyway.
- The manual opens unasked on a world's first landing.

## 2. What is dark, and what this item does about it

| Dark today | This item |
| --- | --- |
| A rung opens into a scrolling log, beside "Woodcraft 4." | A modal, the first time each concept opens |
| Nothing states the ladder exists, or where you are on it | A welcome on every landing, adapting to carried levels |
| The hunt and fish gap silently halves odds and adds injury | The row says the cost, as craft and build already do |
| `CAPABILITIES` gives/limits copy is dead data | Producer rows carry it |
| Once vs standing is explained only in the README | The expanded row says it |
| The hurry and the 25% carry are learned by accident | A line where each applies |

## 3. The teaching layer

New `src/sim/teach.ts`. The sim never reaches into the UI, the rule
`src/sim/cues.ts` already follows: the sim names the moment, and whoever
is listening shows it.

### State

Two fields on `GameState`, both saved and both defaulted in
`fillDefaults` the way `manualSeen` is:

```ts
/** Concepts whose moment has been shown in this world; a moment is shown once, ever. */
taught: Partial<Record<Concept, true>>;
/** Concepts earned but not yet shown, oldest first; drained by the UI one at a time. */
teachQueue: Concept[];
```

`Concept` is the five rungs: `job | grind | keep | condition | pace`.

**`taught` is per survivor, and both fields reset on a landing.** A
moment is about what *this* survivor can newly reach, so each life gets
its own. The player who has seen it four times is protected not by the
memory but by the rule in the next section: a rung you land already
holding is never a moment.

(A world-wide `taught` was considered and set aside. It may come back if
a tester round says the repeat grates.)

### Queuing

`train()` in `src/sim/skills.ts` already computes
`before < RUNG_LEVEL[k] && after >= RUNG_LEVEL[k]` and writes
`RUNG_LINE`. It gains one call to `teach(state, k)`.

```ts
/** Queues a concept's moment the first time this survivor opens it by practice. The log line is written by the caller, on every unlock; only the moment is once. */
export function teach(state: GameState, c: Concept): void {
  if (state.taught[c]) return;
  state.taught[c] = true;
  state.teachQueue.push(c);
}

/** A rung the survivor landed already holding: known, so never a moment. The welcome names it instead. */
export function taughtOnLanding(state: GameState, c: Concept): void {
  state.taught[c] = true;
}
```

**A carried rung is never a moment.** `carrySkills` calls
`taughtOnLanding` for each rung an heir's carried level opens, marking
it known without queuing. The welcome is where the heir reads what they
landed holding ("Woodcraft 4 already takes jobs from you"), and a moment
is kept for what this survivor earns by practice. So the better the
lineage, the quieter the landing, which is the point: a strong heir
starts playing instead of clicking through what they were born with.

Marking `taught` at push time, not at dismiss time, is what makes two
skills crossing the same rung inside one offline catch-up queue the
concept once.

**The log line stays on every unlock, per skill.** Only the modal is
first-per-concept. A player who reaches Fishing 5 four skills later
still reads "Fishing is second nature now" in the log; they simply are
not stopped for it.

Because the queue is on the state, a rung earned while the tab was shut
survives the catch-up and is waiting on return. Nothing is lost and
nothing fires into a closed tab.

## 4. The overlay stack and the pause

`render()` in `src/main.ts` picks one overlay by priority. Two entries
join the end:

    manual, cemetery, away, landing, tombstone, welcome, teach

So a moment never covers a tombstone, the landing picker or the away
report. It waits behind them and drains one `Got it` at a time. Coming
back from eight hours away with two rungs earned reads: the away report,
then jobs, then grinds, then the game.

### The pause is new work

The clock does **not** pause for the manual today. Only `state.dead`,
`state.landing` and `ui.away` stop the frame. Opening the manual mid-hunt
leaves the game running underneath.

The frame gate in `src/main.ts` becomes:

```ts
if (!state.dead && !state.landing && !ui.away && !ui.teach && !ui.welcome) {
```

and the else branch sets `lastReal = now` the way the `ui.away` branch
does. Without that, a modal left open for more than thirty seconds trips
the background catch-up path and the player dismisses a welcome into a
surprise away report.

The manual and the cemetery keep today's behaviour. Making those pause
too is a change to how the game plays and is not this item's to take.

## 5. The welcome

Fires on every landing, fresh survivor or heir, at the point
`openManualOnFirstLanding` is already called in `src/main.ts`. On a
world's first landing the manual comes first, then the welcome; on every
landing after, the welcome alone.

It reads the state rather than being fixed text. `welcomeHtml` in
`src/ui/panels.ts` builds it from a sim-side `welcomeLines(state)` in
`teach.ts`, so what it claims about skills and rungs comes from the same
`skillLevel` and `RUNG_LEVEL` the panels use.

A fresh survivor:

    Aina Halme, 1 April, day 1.

    You land knowing nothing. Every job is yours
    to click, one at a time: practice a skill to 3
    and it starts keeping count for you.

      Woodcraft 1   Foraging 1   Hunting 1
      Fishing 1     Crafting 1   Building 1

    A fire tonight. A roof by the second night.

    Tip: a hare alone starves you. You need fat:
    marrow, oily fish, eggs and roe in season.

                                       [ Begin ]

An heir, off the carried levels:

    You land carrying a quarter of what Aina knew.
    Woodcraft 4 and Building 3 already take jobs
    from you: set a count and walk away. The rest
    is by hand again.

The rule for the second paragraph: name every skill at level 2 or above
with its level, and name the highest rung any of them has already
opened, in `RUNG_WORD`'s own words. With no skill at 2 the fresh copy
stands.

### Tips

A `TIPS` table in `teach.ts`, shaped like `MANUAL_SECTIONS`: one line
each, in the game's voice, drawn from what the manual and the tables
already establish. One is shown per landing: the index is the world's
seed plus the survivor's index, modulo the table, stepped on by one if
that lands on the tip the previous landing showed. Deterministic, so a
given landing always shows the same tip and a test can assert it, and
never the same line twice running.

This is the replay teaching vector: a player on their sixth survivor
still meets a rule they had not noticed, without a single extra click.

## 6. A concept moment

`CONCEPTS` in `teach.ts`: per concept a title, two or three lines of
prose, and the rung it belongs to. The prose is the concept, not the
skill: "a grind is work that never ends", not "Woodcraft is second
nature now" (that sentence is `RUNG_LINE`'s job, in the log).

Under the prose, one live example built from the player's own state:

    Grinds

    You have practised a skill far enough to set
    work that never ends. A grind takes every hour
    the list leaves free, and never drops off.

    You could now say:
      Fell trees, forever, bringing it to camp

                                      [ Got it ]

`exampleFor(state, world, cal, concept)` picks it: take the skills that
have reached the concept's `RUNG_LEVEL`, find a Do row in one of them
that is startable right now, build the real `IntentRequest` for that
concept's kind, and run it through `orderSentence` in `src/sim/orders.ts`.
The example is therefore exactly the sentence the order list would print
for that order, and it cannot drift from what the panel does.

If nothing is startable, the modal shows prose alone rather than
inventing an example. A moment is never blocked on finding one.

## 7. The four row-level changes

### 7.1 The hunt and fish gap

`withProgression` in `src/sim/tasks.ts` already spells out the craft gap
("40% chance it comes out") and the build gap ("this takes 2.2x as
long"). For hunt and fish it says nothing, while `gap` is halving the
odds per level short through `oddsFactor` and adding ten points of
injury per level through `injuryChance`.

Two arms join it, reading the same functions the sim rolls against:

- `hunt`: the odds as a share of what they would be at the recommended
  level, and the injury chance. "a quarter the odds, 20% chance it turns
  on you".
- `fish`: the odds share alone; fishing has no injury.

The `recommended.text` also stops being a bare noun phrase. Today a row
reads "Hunting 5" in warn colour, which never says whether that is a
wall or a suggestion. Under the level it reads "Hunting 5, you are 2".

### 7.2 Producers

`src/sim/capabilities.ts` carries `producer: true` and a hand-written
`gives` and `limits` per row, in the game's voice, and no panel reads
any of it. `PRODUCERS` is likewise data nothing consumes.

- A Do row that builds or crafts a producer carries its `gives` line:
  "passive fish: the first food a camp makes without you".
- The region panel, for each producer standing at this camp, carries its
  `limits` line: "emptying, the racks' 80 kg, the ice".

A lookup `capabilityFor(task, arg)` maps a row to its `CapabilityRow`
through the `keys` field, which already speaks `build:` and `craft:`.
Passive production is the central idle-game concept and this is the one
place the game says which structures do it.

### 7.3 Once against standing

The expanded row's kind buttons get a divider and two words:

    once                         <- yours, starts now
    ------------------------------------------------
    3 times | 3 a day | until camp has 40 kg |
    keep camp at 40 kg | forever      <- the runner's

Clicking the row's label starts work now and cuts the runner off;
everything else hands the work over. The README explains this at length
and the panel has never said it.

### 7.4 The hurry and the carry

- The Doing panel's running order gains a hint that clicking its row
  pushes it ahead, shown while a standing or counted order is running
  and the pulse is not on cooldown.
- The tombstone gains a line naming the quarter carry before "Begin
  again": what the next survivor keeps of this one.

## 8. Testing

Unit, in `tests/teach.test.ts`:

- Two skills crossing the same rung inside one catch-up queue the
  concept once, and the log line is written for both.
- `taught` and `teachQueue` survive a save and load, and default on a
  save written before this item.
- An heir's carried levels queue nothing at landing and leave the queue
  empty, however many rungs they open; the same rung earned later by
  practice in that life still queues nothing, because landing marked it
  known.
- A rung this survivor earns by practice queues its moment even though a
  previous survivor in the same world already had it: `taught` and
  `teachQueue` are cleared on every landing.
- `exampleFor` returns a sentence when a row is startable and null when
  none is, and never throws for any concept.
- `welcomeLines` names the carried skills for an heir and the fresh copy
  when nothing is at level 2.

Coverage, in the spirit of `POLICY_COVERAGE` in `02-balticmap`, so the
tables cannot drift from the code:

- Every `Rung` has a `CONCEPTS` entry.
- Every `TIPS` line is within the length the box lays out.
- Every `producer: true` row in `CAPABILITIES` resolves to a Do row
  through `capabilityFor`, and every key `capabilityFor` matches names a
  row that exists.

Browser, per `docs/ux.md`, at 1440 by 900 **and** 390 wide, both named in
the write-up: the welcome on a fresh landing and on an heir's, one
concept moment with its example, the clock confirmed stopped behind an
open moment and running again after it, and a row under its recommended
level reading its new cost line.

## 9. Out of scope

- Making the manual and the cemetery pause the clock. A change to how
  the game plays, and its own decision.
- A moment for anything that is not a rung. Mastery 20 and 50 already
  announce themselves in the log and adding modals there would be the
  annoyance this item exists to avoid.
- A settings toggle to turn moments off. Five per world, once ever, is
  under the budget where a toggle earns its place; if a tester round says
  otherwise it is one field.
