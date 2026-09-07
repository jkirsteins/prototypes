# Goals - design

A per-world ladder of named destinations. The game holds one out at a time in
the opening, widening to two and then three; the player is told *what* is worth
reaching and never *how*.

## Why

The 2026-09-07 playtest is the whole argument, and it argues both ways.

Nothing told the player what to focus on [130]. The easy and hard routes to wood
looked identical [244]. The fire's five prerequisites appeared one at a time, at
the moment of failure [240], and the first survivor died of cold at camp beside
20 kg of his own firewood [188]. On his second run he assembled the correct early
loop himself - fire, then cooking, then food - hours in, after a death [264].
A first goal hands that sentence over on day one.

But the record's load-bearing correction is note [279], and it governs this
document. Put the goals idea to him directly, the tester pushed back:

> "not necessarily in-game goals. It's just realizing all the things that are
> actions so to speak" / "**discovering it is half the fun**" / "and it's
> somewhat obscured in a long list of skills/actions" / "**which is the bad part
> so to speak**" / "going '**oh shit, I can build a fire? Oh shit, I can do
> this?**' is fun"

So the principle is **discoverability, not instruction**. "Light a fire" is a
priority and a direction. "Gather sticks, make cordage, make a fire drill" is the
answer to a puzzle he enjoyed solving, and spending it buys nothing the priority
did not already buy.

Every rule below exists to keep that line. A goal names an outcome. It never
names a route, a recipe, a prerequisite or a task row.

## What a goal is

```ts
type GoalId =
  | "firewood" | "fire" | "cook" | "bed" | "roof"
  | "water" | "snare" | "store"
  | "spring" | "summer" | "autumn" | "winter";

interface GoalDef {
  id: GoalId;
  /** The whole of what the player is told. No second line exists. */
  title: string;
  /** How much this deed contributes, in the goal's own unit. 0 when unrelated. */
  credit: (deed: Deed, state: GameState) => number;
  /** 1 for a one-shot; the count or the kilos for a counted goal. */
  target: number;
  /** The unit a counted goal prints; absent on a one-shot, which shows no bar. */
  unit?: string;
}
```

`title` is the entire text. There is deliberately no `desc`, no `hint` and no
`needs` field: a field for the route would be filled in eventually, so the type
does not have one.

## Deeds, and why completion is an act

A **deed** is something this survivor did. It is emitted from `complete()` in
`src/sim/tasks.ts`, the single seam every finished task passes through, which
already holds the task id, its argument and the state.

```ts
type Deed =
  | { kind: "task"; id: TaskId; arg?: string }
  | { kind: "delivered"; item: ItemId; kg: number }   // dropped at the camp cell
  | { kind: "built"; structure: StructureId }
  | { kind: "season"; season: Season };   // the calendar turned over into it
```

Goals advance on deeds and are never derived from world state. This is the
decision that makes the ladder honest across a lineage: an heir landing to a lit
fire, a full woodpile and a standing hut has advanced nothing. The fire is
warm because someone else lit it, and the goal, if it were still open, would
still ask this survivor to light one.

The counted goals hold counters rather than reading a pile for the same reason.
"Bring 10 kg of firewood back to camp" counts what this survivor carried in.
Inheriting 40 kg moves it by nothing.

## The ladder

Eight worked goals, then the four seasons. The Title column is the complete text
the player sees.

| # | Title | What credits it | Target |
|---|---|---|---|
| 1 | Bring 10 kg of firewood back to camp | firewood or wet firewood delivered to the camp cell | 10 kg |
| 2 | Light a fire | `light`, `lightIndoors` | 1 |
| 3 | Cook something over it | `cook` | 1 |
| 4 | Get off the cold ground | built `boughBed` | 1 |
| 5 | Put a roof over your head | built `leanTo`, `turfHut` or `snowShelter` | 1 |
| 6 | Keep water at camp | built `waterStore` or `seep` | 1 |
| 7 | Set a snare | built `snare` | 1 |
| 8 | Put food by for later | `hang` | 1 |
| 9-12 | Live to see the spring / the summer / the autumn / the winter | the calendar turning over into that season | 1 each |

Notes on the choices:

- **Goal 1 is reachable on the landing day.** `deadwood` yields firewood with no
  axe and no splitting (`tasks.ts`, the `deadwood` branch of `complete`), so the
  opening goal never asks for a tool the survivor has not got. Wet firewood
  counts: the goal is the carrying, and a wet January is not a reason to withhold
  the first success in the game.
- **Goals 2 and 3 are the chain that killed the first survivor**, named and not
  explained. The fire site is a prerequisite of goal 2 and is deliberately not a
  goal of its own: making it one would tell the player the fire has parts, which
  is the first half of the recipe.
- **Goal 5 accepts any of three roofs.** The goal is the outcome; which roof is
  the player's business and depends on the season they are standing in.
- **Goals 9 to 12 are survivals rather than acts**, and they are the only entries
  in the ladder whose order is not fixed. Which season is next depends on the day
  the world is standing on, so the active seasonal goal is always **the next
  season to arrive that is not yet done** - a January landing is asked for the
  spring, an August one for the autumn. `seasonOf()` in `calendar.ts` is the
  source; the season spine has no season threshold and is not involved.

  A season is credited when the calendar **turns over into it** with the survivor
  alive. Landing inside a season does not credit it: a January landing has not
  lived to see the winter, it started there, and the winter goal is the one that
  comes round eleven months later. All four take a full year to clear, which is
  the point - the tail of the ladder is the year loop, and it is the same year
  the game is otherwise measured by.

## Selection, and widening

The active set is the **first N incomplete goals in ladder order**, with the
seasonal tail collapsed to one.

| From | N |
|---|---|
| goal 1 | 1 |
| goal 4 | 2 |
| goal 6 | 3 |

N is read from the lowest-numbered incomplete goal, so it never narrows.

The last widening lands at goal 6 rather than later because the seasonal tail
occupies a single slot: from goal 8 onwards there are only two things left to
show, and a width of three would never be reached.

**At most one seasonal goal is ever active**, and it is the next season due.
Holding out "live to see the spring" and "live to see the summer" at the same
time would be three lines saying one thing, and the second is not a destination
the player can act on differently from the first. So the seasons occupy a single
slot in the active set and take it in turn.

One priority and no ambiguity through the fire and food chain, which is where
the playtest shows the player has the fewest tools and the least idea what
matters. It widens at goal 4 because from there the goals stop being a chain:
a bed, a roof and water at camp are parallel jobs competing for the same sticks,
and holding out only one of them would read as the game insisting on an order it
does not actually care about.

## Persistence

One field on `GameState`, world-scoped, sitting beside `manualSeen`:

```ts
/**
 * The world's goals: what has been reached here, and how far the counted
 * ones have got. World-scoped rather than per survivor - an heir inherits
 * the ladder's position the way they inherit the camp - so newPerson and
 * resetTeaching leave it alone.
 */
goals: {
  done: Partial<Record<GoalId, true>>;
  progress: Partial<Record<GoalId, number>>;
  /** The season the last day roll was in: a turnover is this differing from now. */
  lastSeason: Season;
};
```

`lastSeason` is what makes "the calendar turned over into it" a deed rather than
a state read. It is set on the day roll, so a landing writes the season it lands
in and credits nothing.

`newPerson()` and `resetTeaching()` must not touch it. That omission is the
entire per-world mechanism, so it gets a test rather than a comment alone.

Progress on an incomplete goal carries across a death. A survivor who dies
having carried 6 of 10 kg leaves an heir six kilos along, which is the same
promise the camp itself makes.

`fillDefaults()` in `save.ts` gives a save written before this feature
an empty ladder, with `lastSeason` set to the season it is currently standing in
so the load itself credits nothing. An in-progress run therefore starts at
goal 1 even if it has had a fire for a week. Under-crediting is the right error:
the alternative is inferring history from state, which is exactly the inference
the deed rule exists to forbid.

## Interface

**The panel.** A new `#goals` section at the top of the centre column, above
`#clock`. Always present, never scrolled away, in the column the player already
watches. One row per active goal: the title, and on a counted goal a progress bar
and its figure ("4 / 10 kg"). Progress bars are one of the four interface wins
the playtest recorded - "satisfying to watch", and he asked for more of them [81].

When every goal is done the panel is not rendered at all, rather than showing an
empty box or a congratulatory placeholder.

**The completion overlay.** Full screen, in the existing `#overlay` chain,
reusing the rung-moment machinery in `src/ui/teachpanel.ts`. It carries the goal
just met, a congratulation, and the goals now active - so one dismissal leaves
the player knowing where to walk next.

Ordering rules for the overlay:

- It queues *behind* a rung moment. A capability unlocking is the larger event
  and should not be pre-empted by a goal that opened in the same minute.
- Several goals completed in one catch-up produce one overlay listing them, not
  a stack of overlays to dismiss in turn.
- A completion that happens while the player is away is shown on their return,
  after the away report.
- The final goal's overlay says the ladder is finished and introduces nothing.

**Nothing else changes.** The Do panel, the order list and the map are untouched.
A goal never highlights a task row, never filters the list and never queues an
order - all three would be the route, arriving by another door.

## Files

| File | Change |
|---|---|
| `src/sim/goals.ts` | new: `GoalId`, `GoalDef`, the ladder, `credit()`, `activeGoals()`, `deed()` |
| `src/ui/goalpanel.ts` | new: the panel and the completion overlay |
| `src/sim/types.ts` | the `goals` field on `GameState` |
| `src/sim/save.ts` | one line in `fillDefaults` |
| `src/sim/tasks.ts` | one `deed()` call at the `complete()` seam |
| `src/sim/camp.ts` or the delivery seam | one `deed()` call where items are dropped at camp |
| `src/sim/advance.ts` | one `deed()` call on the day roll when `seasonOf()` turns over |
| `src/main.ts` | render the panel; the overlay in the existing chain |
| `index.html` | the `#goals` section |

`tasks.ts` gains a call and no logic. No existing file grows a subsystem inside
it.

## Testing

`tests/goals.test.ts`:

- **Deeds advance, state does not.** A survivor who lights a fire completes goal
  2; a state with a lit fire and no deed completes nothing.
- **Inheritance advances nothing.** A world with a full camp, a lit fire and a
  standing hut, handed to a new survivor with the ladder open, has the same
  active goals as an empty one.
- **The ladder does not repeat.** A goal completed by survivor one is never
  active for survivor two.
- **Progress survives a death.** 6 of 10 kg before a death is 6 of 10 kg after.
- **`newPerson` and `resetTeaching` leave `state.goals` untouched.**
- **N widens at 4 and 8**, and never narrows.
- **The seasonal tail.** The next season due is the one shown, from any landing
  date; only one seasonal goal is ever active; a landing inside a season does not
  credit it; and the calendar turning over credits exactly one. A run driven
  through a full simulated year clears all four in arrival order.
- **Coverage.** Every `GoalId` in the ladder is credited by at least one deed the
  vocabulary actually emits, checked against `TASK_IDS`, `STRUCTURE_IDS` and the
  four seasons. A goal added with a deed nothing emits fails the suite. This is the
  `POLICY_COVERAGE` shape: an unreachable goal is worse than no goal, because it
  sits at the top of the screen asking for something impossible.
- **No goal text names a route.** Every `title` is asserted against the task and
  recipe vocabularies: a title containing a task id's display name, an item name
  or a recipe name fails. This is the note [279] line, made mechanical, because
  prose did not hold it in `02-balticmap` either.

Then `npm test`, `npm run build`, and a browser pass driving the fire chain on a
January landing to see the panel, the bar and the overlay in the real page.

## What this is not

- **Not a shopping list.** The pinned target of notes [176-179] - pick "make
  knife", see its outstanding requirements against where you stand - is a
  separate roadmap item and a good one. It is the player choosing a target and
  asking for the route. This feature is the game choosing a destination and
  withholding the route. They can coexist; they must not be merged, or the goal
  panel acquires a requirements list and the line in [279] is gone.
- **Not a tutorial.** No goal explains, points, highlights or queues.
- **Not per survivor.** A life is not the unit; the world is.
