# Survidle Goal Journey Design

## Problem

The current goal UI can announce a completed goal that the player was never
shown. It renders completion through a green `[x]` without saying what the
colour means, mixes that line with a much larger new-goal heading, and gives
prescriptive UI paths such as `Build > Site`. The pinned panel also renders an
empty inline progress bar as a meaningless vertical line.

The landing welcome has useful state-specific material, but buries it under two
paragraphs of system explanation. The useful parts are the survivor, the date,
starting or inherited skills, and one random tip.

Food goals are too abstract to teach the acquisition loops. A useful food goal
should include the equipment and acquisition work and finish when the survivor
eats the result.

## Principles

- A goal receives no progress before its announcement has been dismissed.
- No earlier deed is inferred or replayed when a goal becomes active.
- Goals appear in an authored survival journey, not in response to already
  owning the equipment that the goal is meant to teach.
- Several goals may be active together only when their work makes sense in
  parallel.
- A goal may have several high-level checklist steps.
- Checklist steps name outcomes, not recipes, quantities of ingredients, or UI
  paths.
- A final step only counts after all prerequisite steps are complete.
- Every goal may carry one short mechanics note. Obvious goals carry none.
- Meaning is written explicitly. Colour is reinforcement, never the only cue.

## Goal state and credit

`GoalState` gains step progress keyed by goal id and step id. `introduced`
continues to mean that the automatic announcement has been dismissed. This is
the credit gate because the game is paused while the announcement is open.

`goalDeed` ignores every goal without `introduced[id]`. It evaluates the
unfinished non-final steps first. It evaluates the final step only when every
required earlier step is complete. A deed before introduction changes neither
step progress, counted progress, completion, nor the completion queue.

This rule applies to all goals, including counted firewood, seasons, and goals
completed by the same world event. For example, building a turf hut before
"Build lasting shelter" is announced does not complete that later goal.

Existing completed goals stay completed during save migration. Existing
introduced goals stay introduced. New goals and the new step map begin empty.
Migration never infers step progress from inventory, structures, or records.

## Authored journey

The journey is a list of stages. `activeGoals` exposes every incomplete goal in
the first unfinished stage, capped at three. A completed goal frees its place,
but no goal from a later stage appears until the current stage is complete.
Season goals retain their current next-season rotation.

Stages:

1. `site`
2. `drink`
3. `firewood`
4. `fire`
5. `bed`, `roof`, `keptNight`
6. `forageMeal`, `cook`
7. `snareMeal`, `huntMeal`, `fishMeal`
8. `trapMeal`, `foodSource`, `store`
9. `fat`
10. `firstOrder`, `water`, `keptDays`
11. `longOrder`, `toolCare`
12. `explore`
13. `secondCamp`, `seasonalFood`, `durableRoof`
14. `winterStores`
15. the next unfinished season

Water storage stays with later camp systems because it is a larger project,
not part of the first drink.

## Goal steps

Existing one-event goals retain one step. Compound and food goals use these
high-level steps:

- `site`, Choose where to live: Make camp.
- `drink`, Drink water: Drink.
- `firewood`, Gather 10 kg of firewood: Gather 10 kg.
- `fire`, Light a fire: Establish a fire site; provide fuel; provide ignition;
  light the fire.
- `bed`, Get off the cold ground: Build a bed.
- `roof`, Put a roof over your head: Build a roof.
- `forageMeal`, Forage and eat a meal: Gather edible food; eat gathered food.
- `cook`, Prepare and eat a hot meal: Cook food; eat the meal.
- `snareMeal`, Eat from a snare: Make a snare; set a snare; collect its catch;
  eat cooked meat from it.
- `huntMeal`, Hunt, cook, and eat meat: Make a bow; make arrows; hunt an animal;
  eat cooked meat.
- `fishMeal`, Catch, cook, and eat fish: Make a fishing spear; catch fish; eat
  cooked fish.
- `trapMeal`, Eat from a basket trap: Make a basket trap; set it; collect fish;
  eat cooked fish.
- `foodSource`, Find a lasting food source: Establish a repeatable or passive
  source; eat from it.
- `store`, Put food by for later: Preserve food; eat preserved food.
- `fat`, Find food with fat: Eat food containing fat.
- `keptNight`, Keep the fire alive overnight: Keep the fire alive until dawn.
- `firstOrder`, Give a standing camp order: Give a standing order.
- `water`, Keep water at camp: Establish storage or a reliable camp source.
- `keptDays`, Keep a fire burning for three days: Keep one fire alive for three
  days.
- `longOrder`, Try a longer order: Give a grind or keep order.
- `toolCare`, Keep a tool working: Repair, sharpen, hone, or prepare a
  replacement.
- `explore`, Explore another region: Explore another region.
- `secondCamp`, Establish a second camp: Make camp in another region.
- `seasonalFood`, Try a seasonal food: Gather seasonal food; eat that kind of
  food.
- `durableRoof`, Build lasting shelter: Build a turf hut or cabin.
- `winterStores`, Prepare stores for winter: Store food; store fuel.
- Season goals: Live into the named season.

Preparation may predate a food goal. Eating a correctly prepared matching food
after the acquisition step proves preparation and completes the final step.
The method flag distinguishes hunted meat from snared meat and directly caught
fish from trapped fish. It is consumed when the matching meal completes, so a
single acquisition cannot complete several method goals.

The broad `foodSource` goal listens to a completed meal from foraging, hunting,
direct fishing, snares, or a basket trap. Because credit is announcement-gated,
the player must complete such a meal while `foodSource` is active.

## Deeds

Food-related deeds carry enough identity for the goal system without adding
provenance to inventory:

```ts
type FoodMethod = "forage" | "hunt" | "fish" | "snare" | "trap";

type Deed =
  | { kind: "foodAcquired"; method: FoodMethod }
  | { kind: "ate"; item: FoodId }
  | { kind: "preserved" }
  | existing deeds;
```

Successful forage tasks emit `foodAcquired: forage`. Successful hunts and
direct fishing emit their methods. Collecting a snare catch and emptying a
basket trap emit separate methods. A successful hang emits `preserved`.
`eat()` emits `ate` only after a positive quantity was consumed.

Successful crafts emit a separate `crafted` deed, so a failed craft cannot
credit equipment. Build task deeds carry the ids needed for placement steps.
Cooking deeds carry the cooked output item so tests and future notes can
distinguish the food without inspecting inventory.

## Goal notes

Notes explain only the mechanic that is easy to miss:

- `site`: none.
- `drink`: Below 1 litre, the survivor drinks automatically from water at hand.
  If travel is needed, Self-care handles it through the activity queue.
- `firewood`: Dead wood burns without felling a tree.
- `fire`: Fire needs a site, fuel, and ignition.
- `bed`: A bed keeps sleep off the cold ground.
- `roof`: Shelter reduces wind and rain exposure.
- `forageMeal`: Some gathered foods must be cooked before eating.
- `cook`: Raw meat, fish, fat, and roots need a fire.
- `snareMeal`: Snares catch food while other work continues, but must be
  checked.
- `huntMeal`: Hunts can fail; meat must be cooked before eating.
- `fishMeal`: Fish must be cooked before eating.
- `trapMeal`: A basket trap catches fish while other work continues, but must
  be emptied.
- `foodSource`: Repeatable and passive methods can keep producing food.
- `store`: Raw meat rots quickly; drying makes it last.
- `fat`: Lean meat alone cannot sustain the body.
- `keptNight`: A fire survives only while fuel remains.
- `firstOrder`: Standing orders repeat work through the activity queue.
- `water`: Stored water avoids repeated journeys to a source.
- `keptDays`: Weather and fuel determine how long a fire lasts.
- `longOrder`: Longer orders continue without repeated clicks.
- `toolCare`: Damaged tools can be restored or replaced.
- `explore`: Other regions offer different ground, wildlife, and food.
- `secondCamp`: Another camp extends the country the survivor can use.
- `seasonalFood`: Seasonal foods are available for only part of the year.
- `durableRoof`: Lasting shelter survives longer than a lean-to.
- `winterStores`: Winter requires both food and fuel.
- Season goals: none.

## UI

The pinned panel is a checklist headed `Goals`. It renders no progress bar,
fraction, next-step accent line, or route hint:

```text
Goals
[ ] Choose where to live
```

The transition modal uses one global heading and explicit sentences:

```text
Goals

Goal completed: Choose where to live
New goal available: Drink water

Below 1 litre, the survivor drinks automatically from water at hand.
If travel is needed, Self-care handles it through the activity queue.

Continue
```

Each completed and new goal gets its own explicit line. Several new goals are
followed by their individual high-level step lists and optional note. Titles
use one consistent body size. Green may reinforce `Goal completed`, but the
words carry the meaning.

A manually opened goal says `Current goal: X`, then shows its checklist and
optional note. It uses the same `Goals` heading and dismissal button.

## Welcome

The welcome remains because its random tip and lineage-dependent skills are
useful. It contains only:

- survivor name;
- date;
- a `Starting skills` label and all skill levels;
- a `Tip` label and the deterministic random tip;
- `Begin`.

The two paragraphs explaining clicks, practice, and automation are removed.
The tip no longer relies on an unlabeled callout line.

## Verification

Automated tests cover:

- no credit, progress, or queue entry before introduction;
- no retroactive credit on introduction;
- stage activation and intentional parallel groups;
- every multi-step goal, including final-step gating;
- each food method from acquisition through eating;
- existing save migration without inferred progress;
- explicit transition wording and simplified pinned markup;
- optional notes with no UI paths or recipes;
- compact welcome content;
- complete test suite, lint, and production build.

Headless Chrome verifies the opening welcome, first goal, a goal transition,
the water note, a multi-step food goal, desktop layout, mobile layout, and the
absence of horizontal overflow or collapsed progress-bar artifacts.
