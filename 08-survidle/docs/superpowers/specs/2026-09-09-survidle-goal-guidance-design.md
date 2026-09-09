# Goal Guidance - design

Survidle's goal ladder becomes a staged guide. It gives direct survival
priorities during the first week, then loosens into short invitations to explore
systems during the first months. It never becomes a solved recipe book.

## Why

The current goal panel names an outcome but gives no reason, route, or visible
progress for one-shot goals. The first goal, "Choose where to live", is a large
box with no clue that camp controls storage, shelter, fire, and automatic care.
The existing goals spec deliberately called this "not a tutorial", but that
withholds the survival order the player needs before discovery becomes fun.

The new line is targeted guidance:

- During the first week, say what matters next and where to begin in the UI.
- During the first month, introduce systems and suggest a first experiment.
- During the first season, name useful possibilities and let the player choose.
- Keep every cue short. Progress, order, position, and game data carry meaning
  before prose does.

The player should understand how to survive before they are asked to improvise.
They should still discover recipes, tradeoffs, and good camp practice themselves.

## Principles

1. **Urgency sets the order.** Water, warmth, sleep protection, and food appear
   before long-term camp projects.
2. **Guidance fades.** An early modal names a UI path. A later one asks a short
   question such as "Which food source suits this place?"
3. **Progress is visible.** Every active goal shows a count, fill, or set of
   measurable milestones in the pinned panel and its modal.
4. **Only observed facts get a check.** Looking around and understanding advice
   are not simulation events, so the interface never claims they happened.
5. **One fact appears once.** Headings, position, fill, checks, and deadlines are
   not restated in sentences.
6. **Goals guide, not command.** They do not queue work, filter the Do panel, or
   highlight a required answer.
7. **The game uses its own words.** Paths and actions use the exact labels the
   player can find in the live interface.

## The teaching curve

### Days 1 to 7: Stay alive

This phase is ordered. One goal stands at a time until the fire is established;
then night preparations can run in parallel.

1. **Choose where to live.** Camp anchors supplies, shelter, fire, and care. The
   modal says to inspect nearby ground, walk to a suitable cell, then use
   `Camp > Make camp here`. Progress is `0 / 1` until camp is made.
2. **Drink.** The Water bar is urgent. The modal points to a shore and
   `Gather > Drink`. It mentions stored water only as a later convenience.
   Progress is `0 / 1` until the survivor drinks.
3. **Gather 10 kg of firewood.** The modal distinguishes dead wood, which needs
   no axe, from trees. The existing kilogram counter remains the progress.
4. **Light a fire.** The progress surface shows the live prerequisites: a fire
   site, fuel, tinder, and an ignition tool. The modal names these concepts and
   sends the player to `Camp` and `Make`, but does not list a solved recipe.
5. **Prepare for the first night.** Two goals open together:
   - **Get off the cold ground.** Build a bough bed. Progress shows its material
     requirement and whether the bed stands at camp.
   - **Put a roof over your head.** Build any valid early shelter. Progress shows
     material readiness and whether a roof stands at camp.
   Both carry a compact `before dusk` cue while the first night is ahead.
6. **Cook over the fire.** Prepare one food over the fire. The cue connects the
   result to the Food and Energy bars and says dried meat buys time but is not a
   long-term diet. Progress is `0 / 1` until cooking finishes.
7. **Make the camp maintain itself.** Give the first non-once order for fuel or
   water. The modal explains the queue with one sentence and points to the order
   controls already attached to action rows. Progress is `0 / 1` until such an
   order is created.

The order follows lethality: location, water, warmth, night protection, food,
then automation. Exact dates are not gates. A fast player can advance early and
a slow player keeps the relevant guidance beyond day seven.

### Weeks 2 to 4: Build a working camp

This phase can show two or three goals at once. Each modal names why the system
matters and suggests one experiment.

- Store water at camp.
- Keep the fire through a night and changing weather.
- Try hunting, fishing, or trapping as a renewable food source.
- Preserve food and find a source of fat.
- Reach a new skill rung and try the longer order it opens.
- Maintain a tool or prepare a replacement.

The prompts do not require one universal camp solution. Completion accepts the
valid alternatives already represented by game deeds and state.

### Months 2 to 4: Learn the country

This phase is open ended. Its modals have no UI path unless a control would
otherwise be undiscoverable.

- Explore another region.
- Establish or revisit a second camp and its route.
- Try a seasonal plant food.
- Build durable shelter.
- Put winter fuel and preserved food by.
- Compare food systems: "The lakes, woods, and trap line feed a camp
  differently. Find one that suits this place."

### Long term: Live through the seasons

Season goals remain the tail of the ladder. Their progress shows elapsed days
and the next seasonal boundary. Their modal is observational, not procedural.

## Revised ladder

The implementation keeps existing ids where their meaning still fits and adds
ids only for genuinely new destinations. Save migration maps no completed goal
backward.

| Order | Id | Phase | Completion |
|---|---|---|---|
| 1 | `site` | first week | Make camp |
| 2 | `drink` | first week | Drink water |
| 3 | `firewood` | first week | Gather 10 kg of firewood |
| 4 | `fire` | first week | Light a fire |
| 5 | `bed` | first week | Build a bough bed |
| 6 | `roof` | first week | Build an early roof |
| 7 | `cook` | first week | Cook food over the fire |
| 8 | `keptNight` | first week | Keep the fire alive overnight |
| 9 | `firstOrder` | first week | Give a non-once fuel or water order |
| 10 | `water` | first month | Build water storage or a seep |
| 11 | `keptDays` | first month | Keep one fire alive for three days |
| 12 | `foodSource` | first month | Hunt, fish, or receive food from a trap |
| 13 | `store` | first month | Put food on a drying rack |
| 14 | `fat` | first month | Eat food that does not count fully as lean |
| 15 | `longOrder` | first month | Use a newly unlocked longer order |
| 16 | `toolCare` | first month | Hone a tool or make a replacement |
| 17 | `explore` | first season | Complete an Explore task in another region |
| 18 | `secondCamp` | first season | Make camp in another region |
| 19 | `seasonalFood` | first season | Gather a food available only in its season |
| 20 | `durableRoof` | first season | Build a turf hut or cabin |
| 21 | `winterStores` | first season | Reach the existing winter food and fuel lines |
| 22-25 | `spring`, `summer`, `autumn`, `winter` | long term | Live across the next boundary into that season |

`snare`, `keptRain`, and other narrower experiments become suggested routes or
milestones inside broader goals instead of mandatory serial gates. Existing
completed values remain in old saves and are harmless; they are no longer active
ladder entries.

## Goal guidance model

The simulation continues to own goal selection and completion. UI guidance is a
separate projection over real state.

`src/sim/goals.ts` adds phase and introduction metadata to the goal system:

```ts
type GoalPhase = "firstWeek" | "firstMonth" | "firstSeason" | "longTerm";

interface GoalState {
  done: Partial<Record<GoalId, true>>;
  progress: Partial<Record<GoalId, number>>;
  introduced: Partial<Record<GoalId, true>>;
  queue: GoalId[];
  lastSeason: Season;
}
```

`src/ui/goalguide.ts` owns concise content and live presentation:

```ts
interface GoalStepView {
  label: string;
  done: boolean;
}

interface GoalProgressView {
  at: number;
  target: number;
  unit?: string;
  steps: GoalStepView[];
  deadline?: string;
}

interface GoalGuide {
  id: GoalId;
  phase: GoalPhase;
  reason: string;
  path?: string;
  prompt?: string;
}

function goalProgress(
  state: GameState,
  world: World,
  cal: Calendar,
  id: GoalId,
): GoalProgressView;
```

`goalProgress` derives current prerequisites and composite milestones from the
real world. Existing deed counters remain the source for cumulative quantities.
The same returned view renders the pinned row and the modal, so their numbers
and status cannot drift.

Temporary state is presented honestly. A built water store can remain checked
while its current litres fall. A fire prerequisite can become unchecked before
the fire is lit. Completed world achievements stay in `GoalState.done` across
death as they do today.

Every `GoalId` must have one `GoalGuide`. Guidance coverage is a test guard, the
same way deed coverage already prevents unreachable goals.

## Introduction and reopening

A newly active goal opens once automatically. The introduction is world-scoped
and persists in `GoalState.introduced`. The pinned goal is always a button and
reopens its focused modal without changing progression.

Overlay priority remains:

1. Manual opened by the player.
2. Cemetery or away report.
3. Landing or death.
4. Survivor welcome.
5. Skill-rung teaching moment.
6. Goal transition or introduction.
7. Wildlife recognition.

An automatic introduction is marked seen only when dismissed. If the page is
reloaded while it is open, it opens again. A manually reopened modal does not
change `introduced`.

The current completion overlay and the next introduction become one transition
surface. It marks the completed title compactly, then presents the next goal or
new group. The player never dismisses a congratulation only to receive a second
modal carrying the same title.

When several goals open together, one transition modal shows their compact
summaries. Each pinned row opens an individual focused modal afterward.

## Pinned panel

The current large title-only block becomes a compact progress control:

```text
CHOOSE WHERE TO LIVE                    0/1
[------------------------------------------]
Make camp
```

For a goal with live prerequisites:

```text
LIGHT A FIRE                            2/4
[============================--------------]
[x] Site   [x] Fuel   [ ] Tinder   [ ] Ignition
```

Rules:

- The whole row is the button. There is no separate Details link.
- The title, figure, fill, and next unfinished milestone are visible.
- Completed detail collapses when space is tight.
- A one-step goal still shows `0 / 1`; one-shot goals never look inert.
- Yellow marks the current milestone, the existing good colour marks completed
  milestones, and dim marks what remains.
- Focus is visible and the semantic button has an accessible name that includes
  the title and current progress.
- Mobile uses the same hierarchy with larger touch targets, not extra copy.

The surrounding section does not repeat "Your goal" when the title and stable
position already establish the role. When several goals are active, their rows
remain independently clickable.

## Guidance modal

The modal is narrow, left aligned, and uses the existing overlay vocabulary:

```text
Choose where to live                    0/1

[ ] Make camp

Camp anchors supplies, shelter, and fire.

Camp > Make camp here

Continue
```

It contains, in order:

1. Title and compact progress.
2. Measurable steps, if the goal has more than one.
3. One short reason.
4. An early UI path or a later open prompt, never both.
5. One dismissal action.

It does not add labels such as "Progress", "Why", or "Next step" when position
already supplies that meaning. It does not repeat the pinned summary in prose.

## Welcome and manual

The opening overlay cadence becomes:

1. Choose a survivor on the landing screen.
2. Read the welcome, which explains identity and inherited skill.
3. Read the first goal, which explains what to do now.

The manual remains available through `How to survive` but no longer opens
automatically. The welcome removes its copied first-days advice because goals
now own that sequence. This prevents three overlapping explanations before the
player can act.

## Save migration

Old saves gain `introduced: {}`. They keep all existing completion and progress
state. Only currently active, incomplete goals are eligible for automatic
introduction, so migration does not replay completed goals.

## Files

| File | Responsibility |
|---|---|
| `src/sim/goals.ts` | Phases, active ladder, completion, introduction state |
| `src/ui/goalguide.ts` | Guidance content and live progress projection |
| `src/ui/goalpanel.ts` | Pinned goal buttons and guidance/transition modal |
| `src/ui/render.ts` | Open goal modal state |
| `src/main.ts` | Goal actions, overlay priority, automatic introductions |
| `src/sim/save.ts` | `introduced` migration |
| `src/sim/manual.ts` | Manual remains explicit rather than automatic |
| `src/ui/teachpanel.ts` | Welcome stops repeating first-days advice |
| `src/style.css` | Compact progress rows, modal steps, focus, mobile layout |
| `tests/goals*.test.ts` | Ladder, deeds, progress, persistence, and timing |
| `tests/goalpanel.test.ts` | Markup, actions, modal transitions, concise hierarchy |

## Verification

Automated tests must prove:

- Every goal has guidance and observable progress.
- Every early path uses labels that exist in the live action groups.
- First-week goals stay ordered through fire, then widen for night preparation.
- Counts and milestones change from real deeds or state.
- An automatic introduction opens once, survives reload until dismissal, and
  can be reopened manually.
- Overlay priority and grouped transitions never produce repeated modals.
- Migration preserves old completion and progress while introducing only active
  goals.
- The manual does not open automatically and remains available on demand.

The browser pass uses headless Chrome at 1440 by 900 and 390 wide with touch
emulation. A scripted first-week playthrough checks that every instructed action
exists, progress visibly changes, and the next guidance appears in order.
Screenshots cover the first goal, a composite night goal, an open-ended monthly
prompt, and the mobile layout.

Run `npm test`, `npm run build`, and root lint. The browser record names both
widths and any confusing or visually repeated information found during the pass.

## Out of scope

- Goals do not execute, queue, or choose actions for the player.
- Goals do not reveal complete recipes.
- No adaptive coach ranks arbitrary threats or rewrites the ladder at runtime.
- This pass does not rebalance survival rates or resource yields.
- This pass does not redesign the manual, Do panel, or activity queue beyond the
  links and concise guidance goals need.
