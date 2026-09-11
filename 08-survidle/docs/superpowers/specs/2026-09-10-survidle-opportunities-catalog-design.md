# Survidle Opportunities Catalog Design

## Purpose

Replace the authored Goals system with one Opportunities system that records
both the survival journey and discoveries made through the live world.

The 2026-09-10 blind playtest supplied the immediate case. Seeing deer produced
the tester's first self-directed plan: go to the animals, learn how hunting
works, and gather the tools it might require. The map created that intention,
but the goal system did not recognize it. An opportunity discovered from the
map should preserve and support that intention without explaining its solution.

The replacement also resolves a structural mismatch in the current Goals
system. It can show several authored goals at once, but the player has no way to
choose which one should stay prominent. The new system records every discovered
opportunity in a catalog, awards progress to all of them, and lets the player
choose one leaf opportunity as the current visual focus.

## Principles

- One Opportunities system owns authored journeys, map discoveries, progress,
  completion notices, and the current visual focus.
- The old Goals system is migrated and removed. No parallel runtime goal model
  remains.
- Every selectable entry is a leaf opportunity with its own coherent outcome.
- Groups and categories organize leaves. They do not own independent progress.
- A leaf may contain several checklist steps when all steps are genuine parts of
  the outcome named by its title.
- Pinning is visual only. Every discovered opportunity can earn progress.
- An opportunity earns no progress before it is discovered. Earlier events are
  not replayed or inferred from current state.
- The catalog belongs to the world and survives death, like camps, learned
  systems, and the present goal journey.
- Discovery names an outcome, not a recipe or UI route. The pleasure of finding
  the solution remains with the player.
- Hidden wildlife is never disclosed through the catalog.

## Vocabulary and hierarchy

Use three presentation levels:

1. A category is a catalog page, such as Wildlife or Food.
2. A group is a stable collection of parallel leaf opportunities, such as
   Track animals.
3. A leaf opportunity is the selectable and completable unit, such as Track roe
   deer.

Only leaves can be current. A group summary is derived from its leaves. A group
is done only when every defined leaf is complete, including leaves the player
has not discovered yet. Completion is therefore permanent and never revoked by
a later discovery.

Before the first leaf in a group is discovered, the catalog shows an anonymous
grey group slot. Once the group is known, its title appears and its leaves are
shown. Undiscovered leaves remain anonymous grey rows. Their titles must not be
present in visible text, HTML attributes, accessibility labels, or other UI
metadata.

## Opportunity definitions

Stable static keys and generated subject keys share one definition type:

```ts
type OpportunityKey =
  | StaticOpportunityId
  | `track:${Species}`
  | `hunt:${Species}`
  | `dress:${Species}`
  | `recover:${Species}`
  | `catch:${Species}`
  | `trap:${Species}`
  | `forage:${FoodId}`
  | `build:${StructureId}`
  | `make:${ToolId}`
  | `season:${Season}`;

interface OpportunityStepDef {
  id: string;
  label: string;
  target: number;
  unit?: string;
  final?: boolean;
  credit: (event: OpportunityEvent) => number;
}

interface OpportunityDef {
  key: OpportunityKey;
  title: string;
  category: OpportunityCategory;
  group?: OpportunityGroupId;
  steps: OpportunityStepDef[];
  prerequisites?: OpportunityKey[];
  note?: string;
}
```

Definitions for species, fish, forage foods, tools, shelters, and seasons are
generated from explicit supported subsets of their central catalogs. Adding a
new catalog member does not silently promise an opportunity that has no event
route. Coverage tests require every generated leaf and every step to have a real
discovery and credit source.

The initial category order is:

1. Survival
2. Camp
3. Food
4. Wildlife
5. Weather
6. Exploration
7. Mastery

## State

```ts
interface OpportunityState {
  /** The game minute on which each leaf first became known. */
  discoveredAt: Partial<Record<OpportunityKey, number>>;
  /** The game minute on which each leaf was completed. */
  completedAt: Partial<Record<OpportunityKey, number>>;
  /** Stored deed-driven progress for each stable step. */
  stepProgress: Partial<Record<OpportunityKey, Record<string, number>>>;
  /** The one leaf shown in the top-left panel. Visual only. */
  current: OpportunityKey | null;
  /** Batched facts waiting for the paused presentation surface. */
  notices: OpportunityNotice[];
  /** Specialized state used by contextual opportunities, including weather. */
  context: OpportunityContextState;
  /** Presentation preference, persisted but irrelevant to simulation. */
  lastCategory: OpportunityCategory;
}
```

Groups store no progress or completion flags. A group view derives known,
unknown, complete, and total leaf counts from definitions and leaf state.

The current key is saved with the world. Death does not clear an incomplete
current opportunity. Completion clears it before newly discovered leaves are
considered for automatic selection.

## Discovery and credit flow

All opportunity-relevant facts pass through one event seam. The current
`goalDeed` seam is generalized and renamed rather than maintained behind a
compatibility wrapper.

Processing one event follows this order:

1. Apply completions and progress to every previously discovered incomplete
   leaf that accepts the event.
2. Discover leaves whose prerequisites or event conditions were satisfied.
3. Record completion and discovery facts in one batched notice.
4. Update the current selection according to the rules below.

An event may complete more than one leaf. For example, building a lean-to may
complete both Build a lean-to and Put a roof over your head. This is
intentional: the collection leaf records breadth, while the authored leaf marks
a survival outcome.

An event that discovers an opportunity does not retroactively credit it. A
later matching event is required. No migration or load path infers completed
work from inventory, structures, records, or current world state.

Pinning never participates in credit. Contextual opportunities, such as a
reserved weather lesson, use their stored context and discovery state rather
than the current selection to decide whether an event matches.

## Wildlife opportunity chains

The first implementation uses identified visual sightings. A sound, an unknown
subject, or a generic hoofed-animal identification reveals no species leaf. The
species must be identified through the same perception rules that permit the UI
to name it.

For a supported trackable and huntable species:

```text
identified visual sighting
  -> discover Track [species]

fresh sign from that species found
  -> complete Track [species]
  -> discover Hunt [species]

animal of that species killed
  -> complete Hunt [species]
  -> discover Dress a [species] carcass

field processing succeeds
  -> complete Dress a [species] carcass
  -> discover Bring [species] meat to camp

meat from that carcass reaches camp
  -> complete Bring [species] meat to camp
```

The relevant events gain species identity where they do not already carry it.
Only a real perceived animal can cause the first discovery. Failed hunts and
empty habitat never do.

Processed meat currently loses species provenance after it enters inventory.
The catalog does not add species-specific cooking or preservation leaves. That
would promise evidence the simulation does not retain.

## Initial collection groups

The first catalog contains only explicit collections supported by current
simulation events:

| Group | Leaf | Discovery | Completion |
|---|---|---|---|
| Track animals | Track [species] | Identified visual sighting | Fresh sign from that species |
| Hunt animals | Hunt [species] | Matching track leaf completed | Animal of that species killed |
| Dress carcasses | Dress a [species] carcass | Matching hunt leaf completed | Field processing succeeds |
| Recover kills | Bring [species] meat to camp | Matching dress leaf completed | That carcass's meat reaches camp |
| Catch fish | Catch [species] | Reading water identifies it | Species is caught directly |
| Trap fish | Trap [species] | Water identifies it and basket traps are known | Species is collected from a trap |
| Forage foods | Gather [food] | Food is identified on known ground | Food is gathered |
| Build shelters | Build [structure] | Known from world start | Structure is built |
| Make tools | Make [tool] | Known from world start | Tool is crafted |
| Seasons | Live into [season] | Known from world start | A living survivor crosses into it |

The supported subset for each group is explicit. Voice-only wildlife, animals
without a perceivable tracking route, non-buildable structures, and items with
no direct production event are excluded until their mechanics can support an
honest leaf.

Nothing in the simulation gates a tool recipe or a shelter behind a skill, a
season or a place, so those fifteen leaves are known from world start, silently,
the way the four seasons are. Announcing them would present fifteen unearned
opportunities in the first modal of a run. A capability a later gate really does
hide announces when the gate opens, as forage does on newly known ground and a
basket trap does once traps are known.

Discoveries caused together are batched. A capability step that makes three
tracked tool recipes available produces one presentation containing three new
leaves, not three consecutive modal interruptions.

## Authored journey opportunities

The useful existing goals become static leaf opportunities. Their authored
order is expressed by prerequisites, not a separate stage runner. Parallel
outcomes can share prerequisites and become discovered together.

The retained set includes:

- Choose where to live.
- Drink water.
- Gather 10 kg of firewood.
- Light a fire.
- Get off the cold ground.
- Put a roof over your head.
- Forage and eat a meal.
- Prepare and eat a hot meal.
- Keep the fire alive overnight.
- Eat from a snare.
- Hunt, cook, and eat meat.
- Catch, cook, and eat fish.
- Eat from a basket trap.
- Preserve meat from a hunt.
- Find a lasting food source.
- Find food with fat.
- Keep water at camp.
- Give a standing camp order.
- Try a longer order.
- Keep a tool working.
- The existing local shelter, forecast-weather, and remote-weather sequences.
- Explore another region.
- Establish a second camp.
- Try a seasonal food.
- Build lasting shelter.
- Prepare stores for winter.

Existing wording and steps should be retained when they still describe the
events accurately. The preservation opportunity is generic:

```text
Preserve meat from a hunt
[ ] Hunt any animal
[ ] Preserve meat
```

The preserve step accepts any later meat-preservation event after the hunt step
is complete. It does not claim that the preserved meat came from the same
animal. This keeps the current no-provenance inventory model.

A leaf uses multiple steps only when the title honestly contains the whole
sequence. Hunt roe deer ends at the kill. Dressing, recovery, cooking, and
preservation belong to separate leaves or explicitly named compound journeys.

## Current selection

The current opportunity is visual focus only:

- Any discovered incomplete leaf may be made current from the catalog or its
  discovery modal.
- Completed and undiscovered leaves cannot be current.
- Changing current never changes progress, eligibility, contextual state, or
  event handling.
- Completing the current leaf clears it.
- If the same event reveals exactly one new leaf while there is no current leaf,
  the new leaf becomes current automatically.
- If several leaves are revealed while there is no current leaf, none is chosen
  arbitrarily. Their modal offers Set as current on each leaf.
- If a newly discovered leaf arrives while another leaf is current, the current
  leaf remains unchanged unless the player chooses Set as current.

## Top-left panel

The existing Goals panel becomes the permanent Opportunities entry point. It
shows one current leaf, never a list:

```text
Opportunities

Current
Track roe deer
[ ] Find fresh roe deer sign

View all opportunities
```

The leaf title and checklist open its detail view. View all opportunities opens
the catalog. When no leaf is current, the panel says No current opportunity and
retains the catalog button. It also remains available after every opportunity
is complete so the completed history can still be inspected.

## Catalog popup

The catalog uses the existing full-screen overlay surface. It does not introduce
a nested scrolling list.

- Category tabs switch among the seven fixed categories.
- A category opens on the group or leaf containing the current opportunity. If
  none is current, it opens on the persisted last-viewed category.
- Categories are split into fixed-size pages with Previous, Next, and a page
  number. The exact page size may differ by responsive layout, but every control
  remains stable while the player interacts with it.
- A discovered incomplete row shows `[ ]`.
- A completed row shows `[x]` and Done in text. Colour is reinforcement only.
- The current row says Current.
- An undiscovered row says `[?] Undiscovered opportunity` and exposes no title.
- Selecting a discovered row opens a detail view with its title, checklist,
  optional mechanics note, completion state, and Back control.
- An incomplete non-current detail offers Set as current.
- A completed detail can be reviewed but cannot be made current again.

Group headings show derived progress, such as Track animals: 3 / 18. The total
includes unknown leaves. Completing the final child marks the group done, but a
group is never itself selectable or current.

## Discovery and completion presentation

New leaves and completions use the current paused goal overlay, renamed for
opportunities.

For one discovery while another leaf is current:

```text
New opportunity

Track roe deer
[ ] Find fresh roe deer sign

OK
Set as current
```

OK preserves the current selection. Set as current selects this leaf and closes
the presentation. If there was no current leaf, a single discovered leaf is
selected automatically and Set as current is omitted.

One simulation event produces at most one modal. It orders facts as follows:

1. Completed leaves.
2. Completed groups, when their final child just finished.
3. Newly discovered leaves.

When several leaves are discovered, Set as current appears beside each leaf so
the choice is not modal-wide and ambiguous. If several discoveries arrive with
no current selection, no leaf is chosen automatically.

The overlay continues to wait behind landing, death, away reports, and larger
teaching moments. Facts remain queued and are not lost.

## Save migration and legacy removal

Loading a save with `goals` and no `opportunities` performs a one-way migration:

- Existing introduced goals become discovered static opportunities.
- Existing completed goals become completed static opportunities.
- Compatible step progress moves to the matching stable opportunity steps.
- Pending completion and notice queues become opportunity notices without
  replaying already presented facts.
- Existing specialized weather opportunity state moves into the relevant
  opportunity context.
- The first unfinished goal that the old stage system would have displayed
  becomes current. No other leaf is selected by migration.
- Newly added collection leaves begin undiscovered and incomplete. Migration
  does not inspect past survivor records to backfill them.

After migration, only `OpportunityState` is used. Remove:

- `GoalId`, `GoalState`, and `GoalDef`.
- `GOAL_STAGES`, `activeGoals`, and the active-only credit gate.
- Goal introduction, completion, and notice queues.
- Goal-specific UI action names and rendering entry points.
- Compatibility wrappers around `goalDeed`.

The current `goalopportunity.ts` name is no longer accurate because it owns a
weather lesson reservation rather than the general opportunity system. Its
machinery moves behind the contextual opportunity boundary and receives a name
that describes weather reservation or contextual opportunity execution.

## Expected file shape

Exact splits may be refined in the implementation plan, but ownership should be
clear:

| Area | Responsibility |
|---|---|
| `src/sim/opportunities.ts` | Definitions, discovery, credit, completion, current selection, derived group views |
| `src/sim/opportunity-context.ts` | Reserved and running contextual opportunity state, including weather |
| `src/sim/types.ts` | Stable opportunity keys, events, state, and notice types |
| `src/sim/save.ts` | One-way Goals to Opportunities migration and defaults |
| Wildlife, hunting, tasks, and world knowledge seams | Emit identified discovery and credited outcome events |
| `src/ui/opportunity-panel.ts` | Permanent top-left current leaf and catalog entry point |
| `src/ui/opportunity-catalog.ts` | Category pages, group rows, leaf rows, and detail view |
| `src/ui/opportunity-modal.ts` | Batched paused discovery and completion presentation |
| `src/main.ts` | Rendering and action routing |
| `index.html`, `src/style.css` | Renamed mount point and responsive catalog presentation |

Do not preserve an old file merely to reduce the apparent diff. A clean removal
is part of this feature.

## Verification

### Model tests

- A discovered unpinned leaf earns progress.
- Changing current changes no simulation or progress state.
- An event before discovery is not credited or replayed later.
- Completion clears the current leaf.
- One newly revealed leaf becomes current when no current leaf exists.
- Several newly revealed leaves do not receive an arbitrary current selection.
- A group remains incomplete while any leaf, including an unknown leaf, is
  incomplete.
- Completing the final unknown leaf completes the group exactly once.
- Death preserves discoveries, progress, completions, and current selection.
- Generated definitions have unique stable keys and real discovery and credit
  routes.
- Static journey prerequisites reproduce the intended authored order and
  intentional parallel releases without `GOAL_STAGES`.
- One event may complete a collection leaf and an authored journey leaf.
- Generic Preserve meat from a hunt requires a hunt event before a later
  preservation event and does not inspect meat provenance.

### Wildlife tests

- The first identified visual sighting discovers exactly one Track species leaf.
- A repeated sighting creates no duplicate state or modal.
- Heard-only, unknown, and generic ungulate encounters reveal no species.
- Fresh sign completes only the matching species track leaf.
- Track completion reveals only the matching hunt leaf.
- A kill completes only the matching species hunt leaf.
- Dressing and carcass recovery preserve species identity through their events.
- Species without supported routes produce no impossible opportunity leaves.

### Catalog and modal tests

- Unknown titles are absent from rendered HTML, attributes, and accessible text.
- Category and page controls expose every definition exactly once.
- The current row and top-left panel agree after selection, completion, reload,
  and death.
- Completed leaves remain inspectable and cannot become current.
- A single discovery modal has OK and conditionally Set as current.
- Batched completion plus discovery uses one modal in the required order.
- Group completion is reported with the final child and never receives its own
  second modal.
- With no current leaf, the permanent panel still opens the catalog.
- Desktop and mobile layouts have no nested scroll trap, horizontal overflow,
  or controls that move while clicked.

### Migration and removal tests

- Representative old saves preserve completed, introduced, and partial static
  goal progress.
- Migration selects the expected first unfinished old active goal as current.
- Migration does not infer collection progress from old records or world state.
- Existing weather reservations survive migration and continue without pinning.
- Serialized new saves contain no legacy `goals` field.
- Source and tests contain no runtime references to removed Goals APIs after the
  migration reader boundary.

Finish with `npm test`, root lint scoped to changed files, `npm run build`, and a
browser playtest that identifies an animal, tracks it, switches current focus,
completes tracking, and receives the matching hunt opportunity. What would look
wrong: an unidentified animal leaks through an unknown row, switching current
changes credit, a group completes while an unknown child remains, repeated
sightings repeat the modal, or the catalog recreates the old scrolling trap.
