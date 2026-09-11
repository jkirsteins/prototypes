# Survidle Opportunities Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Goals with one world-scoped Opportunities catalog whose selectable leaf entries include authored survival journeys and dynamically discovered collection items.

**Architecture:** Introduce a single event-driven opportunity kernel with stable leaf keys, prerequisite and event discovery, unpinned progress, derived collection groups, one visual current selection, and batched notices. Port the existing authored and weather journeys into that kernel, add explicit collection generators and wildlife chains, then replace the goal panel and modals with a permanent current-opportunity panel and paged catalog. Old saves migrate once at the serialization boundary; the final runtime contains no Goals subsystem.

**Tech Stack:** TypeScript 5.5, Vite 5, Vitest 2 with happy-dom, existing string-rendered UI and morphing renderer, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-survidle-opportunities-catalog-design.md`

## Global Constraints

- Use only ASCII characters in source, tests, documentation, and user-facing copy.
- Pinning is visual only; every discovered incomplete leaf receives matching event credit.
- Never infer opportunity credit from current inventory, structures, records, or world state.
- Groups store no progress. A group is done only when every defined child, including undiscovered children, is complete.
- Opportunity state is world-scoped and survives death.
- Unknown titles must not appear in rendered text, attributes, or accessible markup.
- An unidentified sound, subject, or generic animal classification must not reveal a species.
- Keep preservation generic; do not add meat provenance to inventory.
- Do not run `npm run test:slow`, set `SURVIDLE_TEST_SUITE=slow`, or invoke any test file assigned to the slow suite.
- Finish with no runtime `GoalId`, `GoalState`, `GoalDef`, `GOAL_STAGES`, `activeGoals`, `goalDeed`, goal UI action, or `state.goals` usage outside the old-save migration reader.
- Preserve all existing weather lesson behavior while removing pin/current as a credit gate.
- Stage explicit prototype paths. Never use `git add -A`.

---

### Task 1: Add the opportunity kernel beside the existing runtime

**Files:**
- Create: `src/sim/opportunities.ts`
- Modify: `src/sim/types.ts:789-842`
- Create: `tests/opportunities.test.ts`

**Interfaces:**
- Consumes: `Species`, `FoodId`, `StructureId`, `ToolId`, `Season`, and the existing event vocabulary in `src/sim/goals.ts`.
- Produces: `OpportunityKey`, `OpportunityEvent`, `OpportunityDef`, `OpportunityGroupDef`, `OpportunityNotice`, `OpportunityState`, `newOpportunities()`, `opportunityDef()`, `opportunitySteps()`, `discoverOpportunity()`, `applyOpportunityEvent()`, `setCurrentOpportunity()`, and `opportunityGroupView()`.

- [ ] **Step 1: Write failing kernel tests**

Create `tests/opportunities.test.ts` with focused state tests. Use `newState()` from the existing test helpers where practical, but keep pure-definition assertions independent of a generated world.

```ts
import { describe, expect, it } from "vitest";
import {
  discoverOpportunity,
  newOpportunities,
  opportunityGroupView,
  applyOpportunityEvent,
  setCurrentOpportunity,
} from "../src/sim/opportunities";

describe("opportunity focus", () => {
  it("credits a discovered opportunity while another leaf is current", () => {
    const opportunities = newOpportunities("winter");
    discoverOpportunity(opportunities, "drink", 0);
    discoverOpportunity(opportunities, "firewood", 0);
    setCurrentOpportunity(opportunities, "drink");
    applyOpportunityEvent(opportunities, { kind: "gathered", item: "firewood", kg: 10 }, 1);
    expect(opportunities.completedAt.firewood).toBe(1);
    expect(opportunities.current).toBe("drink");
  });

  it("does not replay an event from before discovery", () => {
    const opportunities = newOpportunities("winter");
    applyOpportunityEvent(opportunities, { kind: "drank" }, 1);
    discoverOpportunity(opportunities, "drink", 2);
    expect(opportunities.completedAt.drink).toBeUndefined();
  });

  it("keeps a group incomplete while an unknown child remains", () => {
    const opportunities = newOpportunities("winter");
    discoverOpportunity(opportunities, "season:spring", 0);
    opportunities.completedAt["season:spring"] = 1;
    expect(opportunityGroupView(opportunities, "seasons")).toMatchObject({ done: false });
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run: `npm test -- tests/opportunities.test.ts`

Expected: FAIL because `src/sim/opportunities.ts` does not exist.

- [ ] **Step 3: Add stable types and empty world state**

Add the following shapes to `src/sim/types.ts`. Keep static ids in a named union so old-save migration can validate them without accepting arbitrary strings.

```ts
export type StaticOpportunityId =
  | "site" | "drink" | "firewood" | "fire" | "bed" | "roof"
  | "forageMeal" | "cook" | "keptNight" | "snareMeal" | "huntMeal"
  | "fishMeal" | "trapMeal" | "preserveHunt" | "firstOrder"
  | "findUsefulCover" | "makeUsefulShelter" | "testShelter"
  | "readWeather" | "prepareWeather" | "surviveForecast"
  | "water" | "keptDays" | "foodSource" | "store" | "fat"
  | "longOrder" | "toolCare" | "remoteRefuge" | "fieldFire"
  | "fieldMeal" | "remoteStorm" | "explore" | "secondCamp"
  | "seasonalFood" | "durableRoof" | "winterStores";

export type OpportunityKey =
  | StaticOpportunityId
  | `track:${Species}` | `hunt:${Species}` | `dress:${Species}`
  | `recover:${Species}` | `catch:${Species}` | `trap:${Species}`
  | `forage:${FoodId}` | `build:${StructureId}` | `make:${ToolId}`
  | `season:${Season}`;

export type OpportunityCategory =
  | "survival" | "camp" | "food" | "wildlife"
  | "weather" | "exploration" | "mastery";

export type OpportunityGroupId =
  | "track-animals" | "hunt-animals" | "dress-carcasses" | "recover-kills"
  | "catch-fish" | "trap-fish" | "forage-foods" | "build-shelters"
  | "make-tools" | "seasons";

export type OpportunityEvent =
  | { kind: "drank" }
  | { kind: "gathered"; item: ItemId; kg: number }
  | { kind: "season"; season: Season };

export interface OpportunityStepDef {
  id: string;
  label: string;
  target: number;
  unit?: string;
  final?: boolean;
  credit: (event: OpportunityEvent) => number;
}

export interface OpportunityDef {
  key: OpportunityKey;
  title: string;
  category: OpportunityCategory;
  group?: OpportunityGroupId;
  steps: OpportunityStepDef[];
  prerequisites?: OpportunityKey[];
  notBeforeDay?: number;
  note?: string;
}

export interface OpportunityGroupDef {
  id: OpportunityGroupId;
  title: string;
  category: OpportunityCategory;
  keys: OpportunityKey[];
}

export interface OpportunityNotice {
  id: string;
  minute: number;
  completed: OpportunityKey[];
  completedGroups: OpportunityGroupId[];
  discovered: OpportunityKey[];
  messages: string[];
}

export interface OpportunityContextState {
  /** Refined to WeatherOpportunityContext when Task 5 moves the runner. */
  weather: unknown | null;
  chapter3HomeRegion: number | null;
}

export interface OpportunityState {
  discoveredAt: Partial<Record<OpportunityKey, number>>;
  completedAt: Partial<Record<OpportunityKey, number>>;
  stepProgress: Partial<Record<OpportunityKey, Record<string, number>>>;
  current: OpportunityKey | null;
  notices: OpportunityNotice[];
  nextNoticeId: number;
  context: OpportunityContextState;
  lastCategory: OpportunityCategory;
}
```

- [ ] **Step 4: Implement the pure kernel**

Create `src/sim/opportunities.ts`. Start with the authored definitions needed by
the new tests and all four season leaves. Keep mutation functions independent of
UI state.

```ts
export function newOpportunities(season: Season): OpportunityState {
  const state: OpportunityState = {
    discoveredAt: {}, completedAt: {}, stepProgress: {}, current: null,
    notices: [], nextNoticeId: 1,
    context: { weather: null, chapter3HomeRegion: null },
    lastCategory: "survival",
  };
  for (const value of SEASONS) discoverOpportunity(state, `season:${value}`, 0, false);
  discoverOpportunity(state, "site", 0, true);
  state.current = "site";
  return state;
}

export function setCurrentOpportunity(state: OpportunityState, key: OpportunityKey | null): boolean {
  if (key !== null && (state.discoveredAt[key] === undefined || state.completedAt[key] !== undefined)) return false;
  state.current = key;
  return true;
}

export function discoverOpportunity(
  state: OpportunityState,
  key: OpportunityKey,
  minute: number,
  announce = true,
): boolean {
  if (state.discoveredAt[key] !== undefined) return false;
  state.discoveredAt[key] = minute;
  if (announce) state.notices.push({
    id: `${minute}:${state.nextNoticeId++}`,
    minute,
    completed: [],
    completedGroups: [],
    discovered: [key],
    messages: [],
  });
  return true;
}
```

Implement `recordOpportunityEvent` by iterating all discovered incomplete
definitions, applying non-final steps first, final steps only after prerequisites
are complete, recording completions, and then discovering prerequisite-unlocked
leaves. Return one result object so callers and modal batching do not need to
reconstruct what changed:

```ts
export interface OpportunityEventResult {
  completed: OpportunityKey[];
  discovered: OpportunityKey[];
  completedGroups: OpportunityGroupId[];
}

export function applyOpportunityEvent(
  state: OpportunityState,
  event: OpportunityEvent,
  minute: number,
): OpportunityEventResult;
```

- [ ] **Step 5: Run kernel tests and typecheck**

Run: `npm test -- tests/opportunities.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with the pure kernel compiling independently of `GameState`.

- [ ] **Step 6: Commit the kernel**

```bash
git add src/sim/opportunities.ts src/sim/types.ts tests/opportunities.test.ts
git commit -m "feat(survidle): add opportunity state kernel"
```

### Task 2: Port the authored journey and remove the Goals runtime

**Files:**
- Modify: `src/sim/opportunities.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/save.ts`
- Modify: `src/sim/newgame.ts`
- Modify: `src/sim/actions.ts`
- Modify: `src/sim/advance.ts`
- Modify: `src/sim/body.ts`
- Modify: `src/sim/camp.ts`
- Modify: `src/sim/hunting.ts`
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/ladder.ts`
- Modify: `src/sim/spine.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/water.ts`
- Modify: `src/sim/weather.ts`
- Modify: `src/ui/goalguide.ts`
- Modify: `src/ui/goalpanel.ts`
- Modify: `src/main.ts`
- Delete: `src/sim/goals.ts`
- Update tests: `tests/goals.test.ts`, `tests/goals-deeds.test.ts`, `tests/goals-fire.test.ts`, and every existing test importing `src/sim/goals`

**Interfaces:**
- Consumes: Task 1's opportunity kernel and every current `goalDeed` emitter.
- Produces: the complete static `OPPORTUNITIES` registry, prerequisite discovery, `recordOpportunityEvent(state, event, world?)`, and a `GameState` containing only `opportunities` at runtime.

- [ ] **Step 1: Add authored-journey parity tests before moving definitions**

Extend `tests/opportunities.test.ts` with the old ladder's critical ordering and
unpinned credit behavior:

```ts
it("discovers authored parallel leaves only after their prerequisite chain", () => {
  const state = newState();
  expect(state.opportunities.discoveredAt.site).toBeDefined();
  recordOpportunityEvent(state, { kind: "task", id: "makeCamp" });
  expect(state.opportunities.discoveredAt.drink).toBeDefined();
  recordOpportunityEvent(state, { kind: "drank" });
  recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 10 });
  recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
  recordOpportunityEvent(state, { kind: "fuelled" });
  recordOpportunityEvent(state, { kind: "crafted", recipe: "fireDrill" });
  recordOpportunityEvent(state, { kind: "lit" });
  expect(Object.keys(state.opportunities.discoveredAt)).toEqual(
    expect.arrayContaining(["bed", "roof", "keptNight"]),
  );
});
```

- [ ] **Step 2: Run the parity tests and verify they fail**

Run: `npm test -- tests/opportunities.test.ts`

Expected: FAIL because the full authored registry and `GameState` event wrapper
do not yet exist.

- [ ] **Step 3: Move all worthwhile static definitions**

Move every retained definition from `GOALS` into `OPPORTUNITIES`. Replace stage
position with explicit prerequisites. A leaf after a parallel release lists all
leaves in that release as prerequisites.

First replace Task 1's minimal `OpportunityEvent` union with every member of the
current `GoalEvent` union, preserving payloads, and add
`{ kind: "animalKilled"; species: Species }` for the preservation journey. Task
4 adds the first production emitter for that event.

```ts
const STATIC_OPPORTUNITIES: OpportunityDef[] = [
  opportunity("site", "Choose where to live", "survival", one("camp", "Make camp", task("makeCamp"))),
  opportunity("drink", "Drink water", "survival", one("drink", "Drink", kind("drank")), ["site"]),
  opportunity("firewood", "Gather 10 kg of firewood", "survival", one("wood", "Gather 10 kg", firewoodKg, 10, "kg"), ["drink"]),
  opportunity("fire", "Light a fire", "survival", fireSteps, ["firewood"]),
  opportunity("bed", "Get off the cold ground", "survival", one("bed", "Build a bed", built("boughBed")), ["fire"]),
  opportunity("roof", "Put a roof over your head", "survival", one("roof", "Build a roof", roof), ["fire"]),
  opportunity("keptNight", "Keep the fire alive overnight", "survival", one("night", "Keep the fire alive until dawn", kind("keptNight")), ["fire"]),
];
```

Port the existing notes from `goalguide.ts` into each definition's `note` field.
Add `preserveHunt` with sequential credit and keep the existing broader `store`
journey:

```ts
opportunity("preserveHunt", "Preserve meat from a hunt", "food", [
  step("hunt", "Hunt any animal", (event) => event.kind === "animalKilled" ? 1 : 0),
  finalStep("preserve", "Preserve meat", (event) => event.kind === "preserved" ? 1 : 0),
]);
```

Give `OpportunityDef` an optional `notBeforeDay` alongside `prerequisites`, then
translate the old stages to these exact releases:

| Leaves discovered together | Required completed leaves | Earliest day |
|---|---|---|
| `site` | none | 1 |
| `drink` | `site` | 1 |
| `firewood` | `drink` | 1 |
| `fire` | `firewood` | 1 |
| `bed`, `roof`, `keptNight` | `fire` | 1 |
| `forageMeal`, `cook` | `bed`, `roof`, `keptNight` | 1 |
| `findUsefulCover` | `forageMeal`, `cook` | 1 |
| `makeUsefulShelter` | `findUsefulCover` | 1 |
| `testShelter` | `makeUsefulShelter` | 1 |
| `readWeather` | `testShelter` | 8 |
| `prepareWeather` | `readWeather` | 8 |
| `surviveForecast` | `prepareWeather` | 8 |
| `remoteRefuge` | `surviveForecast` | 31 |
| `fieldFire` | `remoteRefuge` | 31 |
| `fieldMeal` | `fieldFire` | 31 |
| `remoteStorm` | `fieldMeal` | 31 |
| `snareMeal`, `huntMeal`, `fishMeal` | `remoteStorm` | 1 |
| `trapMeal`, `foodSource`, `store`, `preserveHunt` | `snareMeal`, `huntMeal`, `fishMeal` | 1 |
| `fat` | `trapMeal`, `foodSource`, `store`, `preserveHunt` | 1 |
| `firstOrder`, `water`, `keptDays` | `fat` | 1 |
| `longOrder`, `toolCare` | `firstOrder`, `water`, `keptDays` | 1 |
| `explore` | `longOrder`, `toolCare` | 1 |
| `secondCamp`, `seasonalFood`, `durableRoof` | `explore` | 1 |
| `winterStores` | `secondCamp`, `seasonalFood`, `durableRoof` | 1 |

The four `season:*` collection leaves are known from world start and do not
participate in this authored chain.

- [ ] **Step 4: Replace every simulation emitter**

Replace imports and calls mechanically, preserving the event at each seam:

```ts
// Before
goalDeed(state, { kind: "drank" });

// After
recordOpportunityEvent(state, { kind: "drank" });
```

The `GameState` wrapper supplies `state.minute` and invokes contextual matching.
Keep all current event payloads unchanged in this task except that
`recoveredAtCamp` may temporarily omit species until Task 4.

- [ ] **Step 5: Convert old saves at the boundary**

Define a private `LegacyProgressState` in `save.ts`, bump `SaveFile.version` from 9
to 10, accept versions 3 through 10, and migrate before deleting the raw field:

```ts
interface LegacyProgressState {
  done?: Record<string, true>;
  progress?: Record<string, number>;
  stepProgress?: Record<string, Record<string, number>>;
  introduced?: Record<string, true>;
  queue?: string[];
  noticeQueue?: string[];
  opportunity?: unknown;
  chapter3HomeRegion?: number | null;
  lastSeason?: Season;
}

function migrateGoalsToOpportunities(state: GameState, raw: Record<string, unknown>): void {
  const legacy = raw["goals"] as LegacyProgressState | undefined;
  if (state.opportunities || !legacy) {
    delete raw["goals"];
    return;
  }
  const next = newOpportunities(calendar(state.minute, state.startDoy).season);
  copyKnownLegacyProgress(next, legacy);
  next.current = firstUnfinishedLegacyLeaf(legacy);
  next.notices.push(...migrateLegacyNotices(legacy));
  next.context = migrateLegacyOpportunityContext(legacy);
  state.opportunities = next;
  delete raw["goals"];
}
```

Implement the four migration helpers in the same file with these exact
contracts. `copyKnownLegacyProgress` maps only ids returned by
`legacyStaticOpportunityKey()` and copies only step ids present in the target
definition. `firstUnfinishedLegacyLeaf` uses the old `GOAL_STAGES` ordering
copied into a private migration-only constant. `migrateLegacyNotices` produces
one notice batch for the surviving valid queued completions and text notices.
`migrateLegacyOpportunityContext` translates the existing storm reservation and
chapter-home fields without examining current world state.

```ts
function copyKnownLegacyProgress(next: OpportunityState, legacy: LegacyProgressState): void;
function firstUnfinishedLegacyLeaf(legacy: LegacyProgressState): OpportunityKey | null;
function migrateLegacyNotices(legacy: LegacyProgressState): OpportunityNotice[];
function migrateLegacyOpportunityContext(legacy: LegacyProgressState): OpportunityContextState;
```

Preserve old introduced, completed, partial-step, queued-notice, chapter-home,
and weather reservation data exactly as specified. Do not inspect records to
backfill collection leaves.

- [ ] **Step 6: Remove the runtime Goals types and module**

Delete `goals` from `GameState`, remove `GoalId`, `GoalState`, and `GoalDef`, and
delete `src/sim/goals.ts`. Rename exported UI-facing functions in place for now:

```ts
activeOpportunityKeys(state, cal)
unpresentedOpportunityKeys(state, cal)
opportunitySteps(state, key)
```

The UI may still occupy the old DOM mount until Task 5, but it must import only
the new opportunity API.

- [ ] **Step 7: Port existing tests and run the complete fast suite**

Update imports, state field names, and assertions in all affected tests. Preserve
the old behavioral coverage, especially announcement gating, weather context,
death persistence, and the year loop.

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no runtime Goals module.

- [ ] **Step 8: Commit the authored port**

```bash
git add src tests vitest.config.ts
git commit -m "refactor(survidle): replace goals with opportunities"
```

### Task 3: Add collection definitions and non-wildlife discovery events

**Files:**
- Create: `src/sim/opportunity-catalog.ts`
- Modify: `src/sim/opportunities.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/ladder.ts`
- Modify: `src/sim/mapped.ts`
- Modify: `src/sim/knowledge.ts`
- Modify: `src/sim/save.ts`
- Create: `tests/opportunity-catalog.test.ts`
- Modify: relevant task tests for craft, build, forage, fish, trap, and seasons

**Interfaces:**
- Consumes: `SPECIES_DEFS`, supported food tasks, buildable structures, craftable tool recipes, `OpportunityDef`, and `recordOpportunityEvent()`.
- Produces: `OPPORTUNITY_CATEGORIES`, `OPPORTUNITY_GROUPS`, `allOpportunityDefs()`, `opportunityGroupView()`, `discoverAvailableOpportunities()`, and identity-bearing collection events.

- [ ] **Step 1: Write failing registry and collection tests**

Create `tests/opportunity-catalog.test.ts`:

```ts
it("generates stable leaves only for explicitly supported catalog members", () => {
  const keys = allOpportunityDefs().map((def) => def.key);
  expect(keys).toContain("catch:perch");
  expect(keys).toContain("build:leanTo");
  expect(keys).toContain("make:bow");
  expect(keys).toContain("season:spring");
  expect(new Set(keys).size).toBe(keys.length);
});

it("discovers fish from a water reading and credits only the caught species", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "waterRead", species: ["perch", "pike"] });
  expect(state.opportunities.discoveredAt["catch:perch"]).toBe(state.minute);
  recordOpportunityEvent(state, { kind: "fishCaught", species: "perch", method: "direct" });
  expect(state.opportunities.completedAt["catch:perch"]).toBe(state.minute);
  expect(state.opportunities.completedAt["catch:pike"]).toBeUndefined();
});

it("completes no collection group while an unknown leaf remains", () => {
  const state = newState();
  const group = OPPORTUNITY_GROUPS.find((candidate) => candidate.id === "catch-fish");
  if (!group) throw new Error("catch-fish group is missing");
  for (const key of group.keys) {
    if (key === "catch:pike") continue;
    discoverOpportunity(state.opportunities, key, state.minute, false);
    state.opportunities.completedAt[key] = state.minute;
  }
  expect(opportunityGroupView(state.opportunities, "catch-fish").done).toBe(false);
});

it("credits overlapping authored and collection leaves from one build event", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "roof", state.minute, false);
  discoverOpportunity(state.opportunities, "build:leanTo", state.minute, false);
  recordOpportunityEvent(state, { kind: "built", structure: "leanTo" });
  expect(state.opportunities.completedAt.roof).toBe(state.minute);
  expect(state.opportunities.completedAt["build:leanTo"]).toBe(state.minute);
});
```

- [ ] **Step 2: Run the catalog test and verify missing APIs**

Run: `npm test -- tests/opportunity-catalog.test.ts`

Expected: FAIL because the collection registry and identity-bearing events do
not exist.

- [ ] **Step 3: Implement categories, groups, and explicit supported subsets**

Create `src/sim/opportunity-catalog.ts` with fixed ordering and definition
generators. Do not use every raw catalog entry automatically.

```ts
export const OPPORTUNITY_CATEGORIES: OpportunityCategory[] = [
  "survival", "camp", "food", "wildlife", "weather", "exploration", "mastery",
];

export const OPPORTUNITY_GROUPS: OpportunityGroupDef[] = [
  { id: "track-animals", title: "Track animals", category: "wildlife", keys: trackKeys() },
  { id: "hunt-animals", title: "Hunt animals", category: "wildlife", keys: huntKeys() },
  { id: "dress-carcasses", title: "Dress carcasses", category: "wildlife", keys: dressKeys() },
  { id: "recover-kills", title: "Recover kills", category: "wildlife", keys: recoverKeys() },
  { id: "catch-fish", title: "Catch fish", category: "food", keys: fishKeys("catch") },
  { id: "trap-fish", title: "Trap fish", category: "food", keys: fishKeys("trap") },
  { id: "forage-foods", title: "Forage foods", category: "food", keys: forageKeys() },
  { id: "build-shelters", title: "Build shelters", category: "camp", keys: shelterKeys() },
  { id: "make-tools", title: "Make tools", category: "mastery", keys: toolKeys() },
  { id: "seasons", title: "Seasons", category: "exploration", keys: seasonKeys() },
];
```

Export and test the explicit supported id arrays. A new species, recipe, or
structure should fail a coverage test only when it is intentionally in a
supported subset without a route, not merely because it exists elsewhere.

- [ ] **Step 4: Add identity-bearing non-wildlife events**

Extend `OpportunityEvent`:

```ts
| { kind: "waterRead"; species: Species[] }
| { kind: "fishCaught"; species: Species; method: "direct" | "trap" }
| { kind: "foraged"; item: FoodId }
| { kind: "toolAvailable"; tool: ToolId }
| { kind: "toolMade"; tool: ToolId }
| { kind: "structureAvailable"; structure: StructureId }
```

Emit `waterRead` from successful Read the water completion, `fishCaught` from
direct fishing and trap collection, and `foraged` alongside the existing broad
food-acquired event. Map craft recipes to the produced `ToolId` at the craft
completion seam. Discover build and make leaves when their corresponding recipe
or structure first passes the Do list's capability-visibility gate. Ignore
temporary materials, weather, daylight, and location blockers; a known
possibility does not become unknown when present conditions change.

- [ ] **Step 5: Add discovery refreshes without completion inference**

Call one narrow refresh at capability unlock and one at knowledge changes:

```ts
export function discoverAvailableOpportunities(state: GameState, world: World, cal: Calendar): OpportunityKey[] {
  const keys = [
    ...availableToolOpportunityKeys(state, world, cal),
    ...availableStructureOpportunityKeys(state, world, cal),
    ...knownForageOpportunityKeys(state, world, cal),
  ];
  return discoverMany(state.opportunities, keys, state.minute);
}
```

This function discovers current possibilities only. It must never call a step
credit function or inspect owned quantities and built structures for completion.

- [ ] **Step 6: Run focused task and catalog tests**

Run: `npm test -- tests/opportunities.test.ts tests/opportunity-catalog.test.ts`

Expected: PASS.

The existing fish, trap, plant, tool, and shelter integration files belong to
the slow suite and are not run for this task.

- [ ] **Step 7: Commit collection definitions**

```bash
git add src/sim/opportunity-catalog.ts src/sim/opportunities.ts src/sim/types.ts src/sim/tasks.ts src/sim/ladder.ts src/sim/mapped.ts src/sim/knowledge.ts src/sim/save.ts tests
git commit -m "feat(survidle): add opportunity collections"
```

### Task 4: Connect identified wildlife to track, hunt, dress, and recovery chains

**Files:**
- Modify: `src/sim/opportunities.ts`
- Modify: `src/sim/opportunity-catalog.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/wildlife-agents.ts`
- Modify: `src/sim/wildlife-encounter.ts`
- Modify: `src/sim/hunting.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/intent.ts`
- Modify: `tests/wildlife-encounter.test.ts`
- Modify: `tests/animal-agents.test.ts`
- Modify: `tests/hunting.test.ts`
- Modify: `tests/carcass.test.ts`
- Create: `tests/opportunity-wildlife.test.ts`

**Interfaces:**
- Consumes: wildlife visibility/identification, `noteHuntSign()`, hunt kill resolution, `processCarcass()`, and hunt delivery intents.
- Produces: `speciesSeen`, `signFound`, `animalKilled`, `carcassDressed`, and `carcassRecovered` opportunity events with exact species identity.

- [ ] **Step 1: Write the complete failing wildlife chain test**

Create `tests/opportunity-wildlife.test.ts`:

```ts
it("unlocks and completes one species chain without leaking another", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  expect(state.opportunities.discoveredAt["track:deer"]).toBe(state.minute);
  expect(state.opportunities.discoveredAt["track:elk"]).toBeUndefined();

  recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
  expect(state.opportunities.completedAt["track:deer"]).toBe(state.minute);
  expect(state.opportunities.discoveredAt["hunt:deer"]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "animalKilled", species: "deer" });
  expect(state.opportunities.completedAt["hunt:deer"]).toBe(state.minute);
  expect(state.opportunities.discoveredAt["dress:deer"]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "carcassDressed", species: "deer", carcassId: 7 });
  expect(state.opportunities.completedAt["dress:deer"]).toBe(state.minute);
  expect(state.opportunities.discoveredAt["recover:deer"]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "carcassRecovered", species: "deer", carcassId: 7 });
  expect(state.opportunities.completedAt["recover:deer"]).toBe(state.minute);
});

it.each([
  { kind: "heard", identification: "species", uncertaintyM: 5 },
  { kind: "seen", identification: "unknown" },
  { kind: "seen", identification: "ungulate" },
] as const)("does not reveal a species from $kind/$identification perception", (perception) => {
  expect(speciesRevealedByPerception(perception, "deer")).toBeNull();
});
```

- [ ] **Step 2: Run the wildlife test and verify missing event failures**

Run: `npm test -- tests/opportunity-wildlife.test.ts`

Expected: FAIL because the species events and generated chain are absent.

- [ ] **Step 3: Emit discovery only from identified visual presentation**

Add an explicit bridge at the same seam that decides the visible animal can be
named. Do not emit from raw subject proximity or hidden simulation state.

```ts
export function speciesRevealedByPerception(
  perception: StartlePerception,
  species: Species,
): Species | null {
  return perception.kind === "seen" &&
    (perception.identification === "species" || perception.identification === "subject")
    ? species
    : null;
}
```

The wildlife presentation seam calls this pure helper and records
`speciesSeen` only for its non-null result.

Repeated sightings are deduplicated by `discoverOpportunity`. Recognition of a
named individual and discovery of its species may share a frame, but produce one
Track species discovery.

- [ ] **Step 4: Carry species through sign, kill, and dressing events**

Change the broad sign event in `hunting.ts`:

```ts
if (discovered) recordOpportunityEvent(state, { kind: "signFound", species });
```

At the confirmed kill seam in `resolveHuntPursuit`, emit before field dressing:

```ts
recordOpportunityEvent(state, { kind: "animalKilled", species: s });
```

Extend the `processCarcass` return value with `species` and `carcassId`, then emit
after successful field processing:

```ts
recordOpportunityEvent(state, {
  kind: "carcassDressed",
  species: recovered.species,
  carcassId: recovered.carcassId,
});
```

If dressing occurs at camp, emit `carcassRecovered` for the same species and
id immediately after `carcassDressed`; that meat has already reached camp.

- [ ] **Step 5: Preserve temporary carcass identity through delivery**

Add `recoveredSpecies?: Species` and `recoveredCarcassId?: number` to the live
hunt work intent. Set them when dressed meat is assigned to the pack. Clear them
when all recovered hunt meat and fat have been delivered. Emit only after both
identity fields have been checked:

```ts
if (intent.recoveredSpecies !== undefined && intent.recoveredCarcassId !== undefined) {
  recordOpportunityEvent(state, {
    kind: "carcassRecovered",
    species: intent.recoveredSpecies,
    carcassId: intent.recoveredCarcassId,
  });
}
```

This is transient hunt-work metadata, not inventory provenance. Generic raw meat
remains generic after delivery.

- [ ] **Step 6: Test the real seams and regress hidden-information behavior**

Run: `npm test -- tests/opportunity-wildlife.test.ts tests/wildlife-encounter.test.ts`

Expected: PASS, including heard-only and unknown-perception tests. Do not run
`animal-agents.test.ts`, `hunting.test.ts`, `carcass.test.ts`, or
`wildlife.test.ts`; they are assigned to the slow suite.

- [ ] **Step 7: Commit the wildlife chain**

```bash
git add src/sim/opportunities.ts src/sim/opportunity-catalog.ts src/sim/types.ts src/sim/wildlife-agents.ts src/sim/wildlife-encounter.ts src/sim/hunting.ts src/sim/tasks.ts src/sim/intent.ts tests
git commit -m "feat(survidle): discover wildlife opportunities"
```

### Task 5: Move weather reservations behind opportunity context

**Files:**
- Create: `src/sim/opportunity-context.ts`
- Delete: `src/sim/goalopportunity.ts`
- Modify: `src/sim/opportunities.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/advance.ts`
- Modify: `src/sim/weather.ts`
- Rename and modify: `tests/goalopportunity.test.ts` to `tests/opportunity-context.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: the existing storm reservation and measurement functions plus discovered opportunity state.
- Produces: `stepOpportunityContext()`, `recordStormMinute()`, `stormMetrics()`, and `OpportunityContextState.weather` with no dependency on current selection.

- [ ] **Step 1: Add a failing unpinned weather test**

Move the existing weather opportunity tests to the new filename, update imports,
and add:

```ts
it("reserves a discovered weather opportunity while another leaf is current", () => {
  const { state, world } = newGame(17);
  discoverOpportunity(state.opportunities, "testShelter", state.minute, false);
  discoverOpportunity(state.opportunities, "drink", state.minute, false);
  setCurrentOpportunity(state.opportunities, "drink");
  state.weather.storm = {
    id: 7, source: "natural", kind: "rain", from: 120, until: 480, warned: false,
  };
  state.weather.nextStormId = 8;

  stepOpportunityContext(state, world, calendar(0, state.startDoy), new Rng(12));

  expect(state.opportunities.context.weather).toMatchObject({
    opportunity: "testShelter", status: "reserved", stormId: 7,
  });
  expect(state.opportunities.current).toBe("drink");
});
```

Keep the renamed lifecycle tests as the completion evidence. This added case
isolates the regression: current selection must not gate the context runner.

- [ ] **Step 2: Run the focused test and verify it fails on the old active gate**

Run: `npm test -- tests/opportunity-context.test.ts`

Expected: FAIL because the old weather machinery still checks the currently
active authored goal set.

- [ ] **Step 3: Rename and isolate the context runner**

Move the weather reservation implementation into
`src/sim/opportunity-context.ts`. Replace `GoalOpportunity` with a weather member
inside the general context:

```ts
export interface OpportunityContextState {
  weather: WeatherOpportunityContext | null;
  chapter3HomeRegion: number | null;
}

export function stepOpportunityContext(
  state: GameState,
  world: World,
  cal: Calendar,
  rng: Rng,
): void;
```

Replace every `activeGoals` or current-selection check with:

```ts
isOpportunityDiscovered(state.opportunities, key) &&
!isOpportunityComplete(state.opportunities, key)
```

Keep matching storm ids, reader identity, area radius, protection minutes, and
survival checks unchanged.

- [ ] **Step 4: Run weather and opportunity tests**

Run: `npm test -- tests/opportunity-context.test.ts tests/opportunities.test.ts tests/weathersense.test.ts`

Expected: PASS. `storms.test.ts` and `weather.test.ts` remain excluded as slow
tests.

- [ ] **Step 5: Commit contextual opportunities**

```bash
git add src/sim/opportunity-context.ts src/sim/opportunities.ts src/sim/types.ts src/sim/advance.ts src/sim/weather.ts tests/opportunity-context.test.ts vitest.config.ts
git commit -m "refactor(survidle): isolate opportunity context"
```

### Task 6: Build the permanent current panel and paged catalog

**Files:**
- Create: `src/ui/opportunity-panel.ts`
- Create: `src/ui/opportunity-catalog.ts`
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `src/style.css`
- Delete: `src/ui/goalguide.ts`
- Delete: `src/ui/goalpanel.ts`
- Create: `tests/opportunity-panel.test.ts`
- Create: `tests/opportunity-catalog-ui.test.ts`
- Modify: `tests/layout.test.ts`
- Delete or rename: `tests/goalguide.test.ts`, `tests/goalpanel.test.ts`

**Interfaces:**
- Consumes: opportunity definitions, group views, current selection, category ordering, and step views.
- Produces: `opportunityPanelHtml()`, `opportunityCatalogHtml()`, `opportunityDetailHtml()`, catalog UI state, and action names `opportunity-open`, `opportunity-close`, `opportunity-page`, `opportunity-category`, `opportunity-detail`, `opportunity-back`, and `opportunity-current`.

- [ ] **Step 1: Write failing panel and hidden-title tests**

Create `tests/opportunity-panel.test.ts`:

```ts
it("shows only the current leaf and keeps the catalog available with no current", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "drink", 0, false);
  setCurrentOpportunity(state.opportunities, "drink");
  expect(opportunityPanelHtml(state)).toContain("Drink water");
  expect(opportunityPanelHtml(state)).not.toContain("Choose where to live");
  setCurrentOpportunity(state.opportunities, null);
  expect(opportunityPanelHtml(state)).toContain("No current opportunity");
  expect(opportunityPanelHtml(state)).toContain("View all opportunities");
});
```

Create `tests/opportunity-catalog-ui.test.ts`:

```ts
it("renders anonymous unknown rows without leaking their titles", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "track:deer", 1, false);
  const html = opportunityCatalogHtml(state, { category: "wildlife", page: 0, detail: null });
  expect(html).toContain("Track roe deer");
  expect(html).toContain("Undiscovered opportunity");
  expect(html).not.toContain("Track elk");
  expect(html).not.toContain("track:elk");
});

it("paginates without omitting or duplicating definitions", () => {
  const state = newState();
  const first = catalogPage(state, "wildlife", 0, 8);
  const slots = Array.from({ length: first.pageCount }, (_, page) =>
    catalogPage(state, "wildlife", page, 8).rows.map((row) => row.slot),
  ).flat();
  expect(new Set(slots).size).toBe(slots.length);
  expect(slots).toHaveLength(
    OPPORTUNITY_GROUPS
      .filter((group) => group.category === "wildlife")
      .reduce((total, group) => total + group.keys.length, 0),
  );
});
```

- [ ] **Step 2: Run the UI tests and verify missing modules**

Run: `npm test -- tests/opportunity-panel.test.ts tests/opportunity-catalog-ui.test.ts`

Expected: FAIL because the new renderers do not exist.

- [ ] **Step 3: Implement the permanent panel**

Render one leaf and retain the entry point in every state:

```ts
export function opportunityPanelHtml(state: GameState): string {
  const key = state.opportunities.current;
  const body = key === null
    ? `<p class="dim">No current opportunity</p>`
    : opportunitySummaryHtml(state, key);
  return `<h2>Opportunities</h2>${body}<button type="button" class="mini" data-act="opportunity-open">View all opportunities</button>`;
}
```

Rename the DOM mount from `goals` to `opportunities`. Do not make the panel
empty when no current leaf exists.

- [ ] **Step 4: Add catalog UI state and pure pagination**

Replace `UiState.goalGuide` with separate presentation and catalog state:

```ts
export interface OpportunityCatalogUi {
  open: boolean;
  category: OpportunityCategory;
  page: number;
  detail: OpportunityKey | null;
}

export interface OpportunityPresentationUi {
  noticeIds: string[];
}
```

Use a pure page function with an explicit size:

```ts
export interface CatalogRowView {
  slot: `${OpportunityGroupId}:${number}`;
  group: OpportunityGroupId;
  key?: OpportunityKey;
  title?: string;
  status: "unknown" | "not-done" | "done";
}

export interface CatalogPageView {
  page: number;
  pageCount: number;
  rows: CatalogRowView[];
}

export function catalogPage(
  state: GameState,
  category: OpportunityCategory,
  page: number,
  pageSize: number,
): CatalogPageView;
```

Clamp stale page indexes after discovery changes the visible group structure.
Use eight rows on desktop and six on the narrow layout. Page-size changes may
occur only at the existing CSS breakpoint, not from content height.

- [ ] **Step 5: Render categories, rows, and detail**

Rows carry a key only when discovered. Unknown rows carry their group id and
anonymous slot index, never the opportunity key:

```ts
return known
  ? `<button data-act="opportunity-detail" data-opportunity="${esc(key)}">${status} ${esc(title)}</button>`
  : `<span class="opportunity-unknown">[?] Undiscovered opportunity</span>`;
```

Detail renders checklist, note, Done or Current text, Back, and Set as current
only for a discovered incomplete non-current leaf.

- [ ] **Step 6: Wire non-pausing catalog actions**

Add main action cases for open, close, category, page, detail, back, and current.
Persist `lastCategory` on the world opportunity state. Do not include
`ui.opportunityCatalog.open` in any simulation pause condition.

- [ ] **Step 7: Add responsive CSS without nested scroll capture**

Render the catalog in the existing overlay mount, but give its content fixed
pages rather than `overflow-y: auto`. Ensure category tabs and Previous/Next stay
in stable positions. Update layout tests to assert no catalog descendant uses a
nested vertical scroller.

- [ ] **Step 8: Run UI, layout, and type tests**

Run: `npm test -- tests/opportunity-panel.test.ts tests/opportunity-catalog-ui.test.ts tests/layout.test.ts`

Expected: PASS. `ui.test.ts` remains excluded as a slow test.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit the catalog UI**

```bash
git add src/ui/opportunity-panel.ts src/ui/opportunity-catalog.ts src/ui/render.ts src/main.ts index.html src/style.css tests
git commit -m "feat(survidle): add opportunities catalog UI"
```

### Task 7: Add batched discovery and completion presentations

**Files:**
- Create: `src/ui/opportunity-modal.ts`
- Modify: `src/sim/opportunities.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Create: `tests/opportunity-modal.test.ts`
- Modify: `tests/pause.test.ts`
- Modify: `tests/opportunities.test.ts`

**Interfaces:**
- Consumes: `OpportunityNotice[]`, current selection rules, opportunity and group views, and the existing overlay priority chain.
- Produces: `nextOpportunityPresentation()`, `dismissOpportunityPresentation()`, `opportunityModalHtml()`, and `opportunity-set-current` / `opportunity-modal-ok` actions.

- [ ] **Step 1: Write failing modal batching and selection tests**

Create `tests/opportunity-modal.test.ts`:

```ts
it("combines completion, group completion, and discoveries in one modal", () => {
  const state = newState();
  const notice: OpportunityNotice = {
    id: "0:1",
    minute: 0,
    completed: ["track:deer"],
    completedGroups: ["track-animals"],
    discovered: ["hunt:deer"],
    messages: [],
  };
  const html = opportunityModalHtml(state, notice);
  expect(html.indexOf("Completed: Track roe deer")).toBeLessThan(html.indexOf("Group completed: Track animals"));
  expect(html.indexOf("Group completed: Track animals")).toBeLessThan(html.indexOf("New opportunity: Hunt roe deer"));
  expect(html.match(/class="opportunity-modal"/g)).toHaveLength(1);
});

it("preserves current on OK", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "drink", 0, false);
  setCurrentOpportunity(state.opportunities, "drink");
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  const notice = state.opportunities.notices[0];
  if (!notice) throw new Error("discovery notice is missing");
  dismissOpportunityPresentation(state, notice.id, null);
  expect(state.opportunities.current).toBe("drink");
});

it("changes current only to the discovery selected from that notice", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "drink", 0, false);
  setCurrentOpportunity(state.opportunities, "drink");
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  const notice = state.opportunities.notices[0];
  if (!notice) throw new Error("discovery notice is missing");
  dismissOpportunityPresentation(state, notice.id, "track:deer");
  expect(state.opportunities.current).toBe("track:deer");
});

it("auto-selects one discovery when no current exists", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  const notice = state.opportunities.notices[0];
  if (!notice) throw new Error("discovery notice is missing");
  expect(state.opportunities.current).toBe("track:deer");
  expect(opportunityModalHtml(state, notice)).not.toContain("Set as current");
});
```

- [ ] **Step 2: Run the modal tests and verify missing renderer failures**

Run: `npm test -- tests/opportunity-modal.test.ts`

Expected: FAIL because the modal renderer and dismissal functions do not exist.

- [ ] **Step 3: Give each event one stable notice batch**

Use a monotonic notice id stored in opportunity state or a stable
`minute:sequence` id. Do not enqueue separate modal records for child and group
completion.

```ts
export interface OpportunityNotice {
  id: string;
  minute: number;
  completed: OpportunityKey[];
  completedGroups: OpportunityGroupId[];
  discovered: OpportunityKey[];
  messages: string[];
}
```

Do not queue empty notices. Repeated discoveries and completions are idempotent.

- [ ] **Step 4: Implement automatic current selection exactly once**

After event processing:

```ts
if (state.current === null && discovered.length === 1) {
  state.current = discovered[0];
}
```

If current completed, clear it before this rule. If multiple leaves were
discovered, leave current null. A discovery while another incomplete current
exists never replaces it.

- [ ] **Step 5: Render and route the paused modal**

Render completion lines, then group completion lines, then discovery cards.
Each discovery card gets its own Set as current button:

```html
<button type="button" data-act="opportunity-set-current" data-opportunity="track:deer">Set as current</button>
```

`OK` dismisses without changing current. Both actions remove exactly the shown
notice id. Preserve the existing priority behind landing, death, away reports,
and rung teaching. Include an open opportunity presentation in the same pause
conditions currently used by goal guidance, and reset `lastReal` on dismissal.

Because the catalog itself does not pause, discoveries may arrive while it is
open. Leave their notices queued until the player closes the catalog, then open
the paused discovery presentation. Landing, death, away reports, and rung
teaching close or supersede the catalog according to the existing overlay
priority so two overlay bodies are never rendered together.

- [ ] **Step 6: Run modal, pause, and full fast tests**

Run: `npm test -- tests/opportunity-modal.test.ts tests/pause.test.ts tests/opportunities.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit presentation batching**

```bash
git add src/ui/opportunity-modal.ts src/sim/opportunities.ts src/sim/types.ts src/ui/render.ts src/main.ts src/style.css tests/opportunity-modal.test.ts tests/pause.test.ts tests/opportunities.test.ts
git commit -m "feat(survidle): present opportunity discoveries"
```

### Task 8: Remove legacy artifacts and verify old-save migration

**Files:**
- Modify: `src/sim/save.ts`
- Create: `tests/opportunity-save.test.ts`
- Rename: `tests/goals.test.ts` to `tests/opportunities-journey.test.ts`
- Rename: `tests/goals-deeds.test.ts` to `tests/opportunities-deeds.test.ts`
- Rename: `tests/goals-fire.test.ts` to `tests/opportunities-fire.test.ts`
- Rename: `tests/slow/goals-year.test.ts` to `tests/slow/opportunities-year.test.ts`
- Modify: `vitest.config.ts`
- Rename: `scripts/goal-ux.mjs` to `scripts/opportunity-ux.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the finished Opportunities runtime and private legacy save reader.
- Produces: version-10 saves with no `goals` field, exhaustive migration tests, and no runtime or test dependency on removed Goals APIs.

- [ ] **Step 1: Add representative old-save migration tests**

In `tests/opportunity-save.test.ts`, construct version-9 JSON rather than mutating a
new state after serialization:

```ts
function versionNineFixture(goals: Record<string, unknown>): Record<string, unknown> {
  const state = newState();
  const raw = JSON.parse(serialize(state)) as {
    version: number;
    state: Record<string, unknown> & { survivors: Survivor[] };
  };
  raw.version = 9;
  delete raw.state.opportunities;
  raw.state["goals"] = {
    done: {}, progress: {}, stepProgress: {}, introduced: {}, queue: [],
    noticeQueue: [], opportunity: null, chapter3HomeRegion: null,
    lastSeason: calendar(state.minute, state.startDoy).season,
    ...goals,
  };
  return raw;
}

function versionNineFixtureWithKill(species: Species): Record<string, unknown> {
  const raw = versionNineFixture({});
  const state = (raw as { state: { survivors: Survivor[] } }).state;
  state.survivors[0].events.push({
    kind: "firstKill", species, day: 1, date: { year: 1, doy: START_DOY },
  });
  return raw;
}

it("migrates old goal progress once and serializes only opportunities", () => {
  const old = versionNineFixture({
    done: { site: true, drink: true },
    introduced: { firewood: true },
    stepProgress: { firewood: { wood: 6 } },
    queue: ["drink"],
  });
  const loaded = deserialize(JSON.stringify(old));
  expect(loaded?.state.opportunities.completedAt.site).toBeDefined();
  expect(loaded?.state.opportunities.stepProgress.firewood?.wood).toBe(6);
  expect(loaded?.state.opportunities.current).toBe("firewood");
  const saved = JSON.parse(serialize(loaded!.state));
  expect(saved.state["goals"]).toBeUndefined();
});

it("does not backfill wildlife collections from old life records", () => {
  const old = versionNineFixtureWithKill("deer");
  const loaded = deserialize(JSON.stringify(old));
  expect(loaded?.state.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
  expect(loaded?.state.opportunities.completedAt["hunt:deer"]).toBeUndefined();
});
```

- [ ] **Step 2: Run the fast migration test and verify it fails**

Run: `npm test -- tests/opportunity-save.test.ts`

Expected: FAIL on the new serialized-field or migration assertion.

- [ ] **Step 3: Fix every field mapping**

Implement validation against the static opportunity registry, translate queued
completion and factual notice data into stable opportunity notice batches, and
move the old weather reservation and chapter-home fields into context.

- [ ] **Step 4: Rename tests and tooling, then update discovery configuration**

Rename files with `git mv`, update imports and `vitest.config.ts` exact names,
and change the package script:

```json
"opportunity-ux": "node scripts/opportunity-ux.mjs"
```

Remove `goal-ux`; do not retain two aliases for a deleted subsystem.

- [ ] **Step 5: Prove legacy runtime names are gone**

Run:

```bash
rg -n 'GoalId|GoalState|GoalDef|GOAL_STAGES|activeGoals|goalDeed|goal-open|goal-close|state\.goals|from "\.\/goals"|from "\.\.\/src\/sim\/goals"' src tests index.html package.json
```

Expected: no matches. The private old-save interface may use quoted JSON field
access such as `raw["goals"]`; keep it isolated in `save.ts` and assert that no
new serialization writes it.

- [ ] **Step 6: Run fast tests, build, and lint checks**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run from repository root:

```bash
npm run lint -- 08-survidle/src 08-survidle/tests 08-survidle/scripts 08-survidle/index.html
```

Expected: PASS.

- [ ] **Step 7: Commit cleanup and migration**

```bash
git add src/sim/save.ts tests/opportunity-save.test.ts tests/opportunities-journey.test.ts tests/opportunities-deeds.test.ts tests/opportunities-fire.test.ts tests/slow/opportunities-year.test.ts vitest.config.ts scripts/opportunity-ux.mjs package.json
git commit -m "refactor(survidle): remove legacy goal artifacts"
```

### Task 9: Browser playtest and final verification

**Files:**
- Modify: `scripts/opportunity-ux.mjs`
- Modify: `src/main.ts`
- Modify only if verification exposes defects: other files already named in Tasks 1-8
- Create: `docs/opportunity-ux-shots/README.md`
- Create: `docs/opportunity-ux-shots/current-desktop.png`
- Create: `docs/opportunity-ux-shots/catalog-desktop.png`
- Create: `docs/opportunity-ux-shots/discovery-modal.png`
- Create: `docs/opportunity-ux-shots/catalog-mobile.png`

**Interfaces:**
- Consumes: the complete implementation.
- Produces: visual evidence and a clean final verification record.

- [ ] **Step 1: Run the complete automated gate from the prototype**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Run root lint on the finished change**

From the repository root, run:

```bash
npm run lint -- 08-survidle
```

Expected: PASS.

- [ ] **Step 3: Add a development-only opportunity event hook and update the screenshot script**

Follow the existing `startleSetup` development-hook pattern. Extend the declared
window interface and the `import.meta.env.DEV` block:

```ts
interface Window {
  survidle: {
    opportunityEvent?(event: OpportunityEvent): void;
    // Existing members remain unchanged.
  };
}

if (import.meta.env.DEV) {
  window.survidle.opportunityEvent = (event) => {
    recordOpportunityEvent(state, event, world);
    render();
  };
}
```

Update `scripts/opportunity-ux.mjs` to use `OPPORTUNITY_UX_URL`,
`OPPORTUNITY_UX_PORT`, `docs/opportunity-ux-shots`, the new selectors, and the
real event seam:

```js
await evaluate(`window.survidle.opportunityEvent({ kind: "speciesSeen", species: "deer" })`);
await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('Track roe deer')`, "track discovery did not open");
await click('#overlay [data-act="opportunity-modal-ok"]');
await evaluate(`window.survidle.opportunityEvent({ kind: "signFound", species: "deer" })`);
await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('Hunt roe deer')`, "hunt discovery did not open");
```

The hook exists only in development builds. It invokes production event logic
and does not write opportunity state directly.

- [ ] **Step 4: Start only this prototype's dev server**

Run from `08-survidle`:

```bash
npm run dev
```

Open `http://127.0.0.1:5173/prototypes/08/?seed=30`.

- [ ] **Step 5: Exercise the current-selection and catalog flow**

Verify in the real page:

1. The initial authored opportunity is current.
2. The top-left panel shows exactly one leaf.
3. View all opportunities opens the catalog without stopping the game clock.
4. Every category and page control stays in place while clicked.
5. Unknown wildlife rows reveal neither species names nor internal keys.
6. A discovered incomplete leaf can become current.
7. An unpinned discovered leaf still receives progress.
8. Completed leaves remain inspectable and cannot be made current.
9. No-current state retains the catalog entry point.

- [ ] **Step 6: Exercise one complete wildlife chain**

Run `npm run opportunity-ux` while the server is live. The script must use the
development event hook to identify deer, dismiss the discovery modal with OK,
switch to Track roe deer from the catalog, submit matching sign, and verify one
combined completion/discovery modal offers Hunt roe deer. Submit the same
species sighting again and assert that no second discovery notice appears.

What would look wrong: an unidentified animal leaks through an unknown row,
switching current changes credit, a group completes while an unknown child
remains, repeated sightings repeat the modal, or the catalog recreates the old
scrolling trap.

- [ ] **Step 7: Capture desktop and mobile evidence**

Save the four named screenshots and write `docs/opportunity-ux-shots/README.md`
with seed, viewport, build commit, scenario, and the observed result for each.
Use only ASCII text.

- [ ] **Step 8: Stop the dev server**

Send Ctrl-C to the dev-server session and verify the process exits.

- [ ] **Step 9: Re-run checks after any browser fixes**

If the browser pass required code changes, rerun:

```bash
npm test
npm run build
```

Then rerun root `npm run lint -- 08-survidle`.

- [ ] **Step 10: Commit verification artifacts and any fixes**

```bash
git add docs/opportunity-ux-shots scripts/opportunity-ux.mjs src tests index.html package.json vitest.config.ts
git commit -m "test(survidle): verify opportunities catalog"
```
