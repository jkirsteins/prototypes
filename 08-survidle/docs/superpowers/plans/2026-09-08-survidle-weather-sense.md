# Weather Sense and Shelter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A survivor caught out by a storm can look for cover, improve what they find, build when the ground gives nothing, and light a fire where they stand - and can learn to see the storm coming in time for any of that to matter.

**Architecture:** One protection currency (0-3) that found cover, improved cover, partial emergency builds and the existing structures all produce, read by the shelter functions that already take a `Site | null`. Three new skills. A forecast that grows in three stages. Rain, snow and gale ask for different ground; optional Stage 4 adds lightning.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-08-survidle-weather-sense-design.md`

**Rebased baseline:** `252a2ea1`. This plan was re-audited after main gained
the purpose-indexed Do pane, the one-list scheduler with body and camp care
rows, deed-driven goals, active gear and the sky weather wall.

## Global Constraints

- Repo rules in `/Users/janis.kirsteins/Projects/prototypes/CLAUDE.md` apply. Work only inside `08-survidle`. Stage with explicit paths; never `git add -A`.
- `npm test` and `npm run build` must pass before every commit. Run them in the FOREGROUND.
- No em dashes and no non-typable unicode anywhere. Only `-`, `->`, `"`, `'`, `...`.
- Comments explain, never chronicle: no dates, no "before/after", no plan references.
- **Numbers.** The shelter minutes are 30 / 90 / 240 and **do not change during this plan.** They are design values chosen inside sourced field ranges and the comment beside them must say so. Nothing else invents a constant: if a number seems needed, stop and ask.
- **Do not tune a gate.** A gate measures the sim. If a reading moves, report the movement and its cause.
- Game voice: `{You}`, `{your}` templates, lower case after a colon, no exclamation marks.
- **One scheduler.** Weather response is served by the existing body care row.
  Its shelter steps keep that row's ownership and never enqueue hidden work or
  bypass the player's ranking.
- **One task surface.** Every new TaskId is added to `TASK_IDS`, Do-pane row
  construction, `ui/purpose.ts`, search vocabulary, skill and mastery tables,
  intent wording, orderability and capability coverage as applicable. Let the
  exhaustive tests identify every table; do not restore the removed region
  panel.
- **Goals are outcomes.** Successful field lighting and cooking emit the
  existing deeds. First reaching protection 2 emits one shelter deed for the
  existing roof goal. Field fires emit none of the three hearth-keeping deeds.
- **Active gear.** Field work uses the existing provisioning, `toolNear`,
  `takeUp` and carried-load paths. Do not add a parallel equipment check.
- **Presentation.** Forecast detail belongs in the weather wall and sky;
  protection at a cell belongs in the map tooltip and the relevant Do rows.

## Staging

The stages exist so a random death mechanism cannot obscure whether the shelter and forecast system works. **Do not start a stage until the previous one is green.**

1. **Shelter core** (Tasks 1-5) - protection, found cover, improvement, partial builds, fire anywhere.
2. **Skills and forecast** (Tasks 6-8) - the three skills, weather sense, and the measurement that says whether the 48-110 minute case now produces a real decision.
3. **Storm effects** (Tasks 9-10) - rain and snow, then gale.
4. **Lightning** (Task 11) - optional for the first merge, last and isolated.

## The acceptance targets

These are the author's, and they outrank any individual test:

> **Skill must visibly convert a hopeless situation into a manageable one.** With only the basic warning, sometimes there is no good answer. With better weather sense or shelter skill, the same situation becomes manageable often enough that the progression is visibly worth having. The target is NOT that an unskilled survivor always survives.

If optional Stage 4 is included:

> **Lightning should be rare enough to be memorable.** Across ordinary competent play, deaths by strike are rare. Across deliberately repeated bad-ground exposure, the risk becomes unmistakable. Do NOT tune it so every seed sees lightning - that turns a rare hazard into a scheduled mechanic.

---

## Stage 1: Shelter core

### Task 1: Protection as one currency

Pure refactor plus one new function. No behaviour change: the existing structures map onto the scale they already imply.

**Files:**
- Modify: `src/sim/types.ts` (add `Protection`)
- Create: `src/sim/shelter.ts`
- Modify: `src/sim/fire.ts` (`roofed`), `src/sim/player.ts` (`roofBonus`, `shelterBonus`, `sheltered`)
- Modify: `src/sim/goals.ts` (add the protection outcome deed and accept it
  for the existing roof goal)
- Test: `tests/shelter.test.ts`, `tests/goals-deeds.test.ts`

**Interfaces:**
- Consumes: `Site`, `siteAt`, `campSite` from the camp-siting work.
- Produces:
  - `export type Protection = 0 | 1 | 2 | 3` in `types.ts`
  - `export function protectionOf(site: Site | null): Protection` in `shelter.ts` - what stands on a cell, as a level
  - `export const PROTECTION_WORDS: Record<Protection, string>` - `["open ground", "windbreak", "weatherproof", "liveable"]`
  - `Deed` gains `{ kind: "sheltered"; protection: Protection }`; the roof
    goal accepts this at 2 or above as well as its existing built deeds

- [ ] **Step 1: Write the failing test**

Create `tests/shelter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { protectionOf, PROTECTION_WORDS } from "../src/sim/shelter";

describe("protection", () => {
  it("reads nothing as open ground", () => {
    expect(protectionOf(null)).toBe(0);
    expect(PROTECTION_WORDS[0]).toBe("open ground");
  });

  it("puts the existing structures on the scale they already imply", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell ?? 0);
    expect(protectionOf(site)).toBe(0);
    site.structures.snowShelter = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.leanTo = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.turfHut = true;
    expect(protectionOf(site)).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd 08-survidle && npm test -- tests/shelter.test.ts`
Expected: FAIL, no module `../src/sim/shelter`.

- [ ] **Step 3: Write `src/sim/shelter.ts`**

```ts
/**
 * What a place gives against the weather, on one scale. Found cover, cover
 * worked on, a shelter half built and a cabin all answer in the same terms,
 * so every reader asks one question: how much is over this survivor.
 */
import type { Site } from "./types";
import type { Protection } from "./types";

export const PROTECTION_WORDS: Record<Protection, string> = {
  0: "open ground",
  1: "windbreak",
  2: "weatherproof",
  3: "liveable",
};

/** The level the structures standing on a cell come to. */
export function protectionOf(site: Site | null): Protection {
  if (!site) return 0;
  const s = site.structures;
  if (s.cabin || s.turfHut) return 3;
  if (s.leanTo || s.snowShelter) return 2;
  return 0;
}
```

Add to `types.ts`:

```ts
/** How much a place gives against the weather: open ground, a windbreak, weatherproof, or good enough to live in. */
export type Protection = 0 | 1 | 2 | 3;
```

- [ ] **Step 4: Point the shelter readers at it**

`roofed(site)` in `fire.ts` becomes `protectionOf(site) >= 2`. `roofBonus` and `shelterBonus` in `player.ts` keep their degree values but derive from `protectionOf` where that does not change a number: a cabin is 15, a turf hut 10, a lean-to 5, and those stay exactly as they are. **Change no temperature.**

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run build`
Expected: PASS with no test's expectations changed.

- [ ] **Step 5a: Protect the goals seam**

Add the deed type and roof-goal credit rule. Prove that state alone advances
nothing, a protection-2 deed completes the outcome, protection 1 does not, and
the existing permanent built deeds still do. Later tasks emit the deed only on
a transition from below 2.

- [ ] **Step 6: Commit**

```bash
git add src/sim/shelter.ts src/sim/types.ts src/sim/fire.ts src/sim/player.ts src/sim/goals.ts tests/shelter.test.ts tests/goals-deeds.test.ts
git commit -m "feat(survidle): what a place gives against the weather is one scale"
```

---

### Task 2: Find shelter

**Files:**
- Modify: `src/sim/shelter.ts` (terrain ceilings, `findCover`)
- Modify: `src/sim/types.ts` (`Site.cover`), `src/sim/regionstate.ts` (`newSite`), `src/sim/save.ts` (migration default)
- Modify: `src/sim/tasks.ts` (the `findShelter` task), `src/sim/types.ts` (`TaskId`)
- Modify: `src/ui/dopanel.ts`, `src/ui/purpose.ts`, `src/ui/tip.ts` (one
  visible action home, search words, and protection on the cell tooltip)
- Modify as required by task placement and exhaustive coverage: `src/sim/intent.ts`,
  `src/sim/ladder.ts`, `src/sim/skills.ts`, `src/sim/capabilities.ts`
- Test: `tests/shelter.test.ts`
- Test: `tests/purpose.test.ts`, `tests/dopanel.test.ts`, `tests/tip.test.ts`,
  and the existing exhaustive task-table tests

**Interfaces:**
- Produces:
  - `export const COVER_CEILING: Record<Terrain, Protection>` - `rock: 2, spruce: 2, pine: 1, birch: 1, meadow: 0, bog: 0, fell: 0, water: 0`
  - `export function coverCeiling(world: World, cell: number): Protection`
  - `Site.cover: Protection` - what searching found here, 0 if nothing
  - `Site.coverAge: number` - minutes since that cover was last found or
    improved, for expiry in the per-site daily loop
  - `TaskId` gains `"findShelter"`

- [ ] **Step 1: Write the failing test**

```ts
  it("finds cover by terrain and never above the ceiling", () => {
    expect(COVER_CEILING.rock).toBe(2);
    expect(COVER_CEILING.spruce).toBe(2);
    expect(COVER_CEILING.pine).toBe(1);
    expect(COVER_CEILING.meadow).toBe(0);
    expect(COVER_CEILING.bog).toBe(0);
    expect(COVER_CEILING.fell).toBe(0);
  });
```

Plus a task test: standing on a meadow cell, `check(state, world, cal, "findShelter")` is legal but finding returns 0 and says so; standing on rock or spruce it returns 2 at a high natural-shelter level. Until Task 6 adds the skill, treat the level as its floor and assert the ceiling is reached.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/shelter.test.ts`

- [ ] **Step 3: Add the ceilings**

```ts
/**
 * What each ground can offer someone looking for cover. FM 21-76's own list
 * of natural shelter - caves and rocky crevices, small depressions, large
 * rocks on the leeward side of a hill, large trees with low-hanging limbs,
 * fallen trees with thick branches - read onto the terrain this world has.
 * Open ground offers nothing, and no amount of skill conjures an overhang
 * on a meadow.
 */
export const COVER_CEILING: Record<Terrain, Protection> = {
  rock: 2, spruce: 2, pine: 1, birch: 1, meadow: 0, bog: 0, fell: 0, water: 0,
};
```

- [ ] **Step 4: Add `Site.cover` and the task**

`Site.cover: Protection` and `Site.coverAge: number`, defaulting 0 in `newSite`
and in the save migration. The `findShelter` task is legal on any passable
land cell, costs minutes, writes `siteFor(st, cell).cover`, and resets its age.
It creates a site - it is an authoring path, which is what `siteFor` is for.

Before implementing the task timing and the low-skill result curve, ask for
the novice and expert values if no current skill formula derives them. The
terrain ceiling is fixed; the time and attained share are not yet specified.

Its refusal on ground with a ceiling of 0 is not a hard block: the survivor may look and find nothing, which costs the minutes and says so. That is what looking is.

Put the row under `Explore > Shelter`. It is a normal once/job action at the
cell named by its order, not a second exploration orchestrator. Add "shelter",
"cover" and "weather" to its search vocabulary. The map tooltip reports known
protection but does not grow an action button; actions live in Do.

Teach `intent.resolveCell` that finding shelter works at the explicitly named
cell and otherwise where the survivor stands. It is not camp-bound and it does
not silently walk to the terrain with the best ceiling: choosing the ground is
part of the decision.

- [ ] **Step 5: Fold cover into `protectionOf`**

`protectionOf` returns the greater of the structures' level and `site.cover`.

When this task first raises a cell from protection below 2 to protection 2 or
above, emit the shelter deed used by the existing roof goal. Deeds, not a state
scan, are the goals seam.

- [ ] **Step 6: Cover does not keep**

Found cover is a fact about a place the survivor noticed, not a thing they
made, and it should not persist as though it were built. Add its clock to
`dailyCamp`'s per-site loop beside the bough bed and the snow shelter: cover
falls back to 0 after a few days, and the log says nothing - nobody needs
telling that a hollow they once crawled into is still a hollow.

Write the test first: a site with `cover` set, run `dailyCamp` past the
window, and the cover is gone while the structures on that same site are
untouched.

**The number of days is not derivable from anything existing. Stop and ask
the author for it rather than picking one.**

- [ ] **Step 7: Run and commit**

```bash
npm test && npm run build
git add src/sim/shelter.ts src/sim/types.ts src/sim/regionstate.ts src/sim/save.ts src/sim/tasks.ts tests/shelter.test.ts
git commit -m "feat(survidle): the ground is looked at before it is built on"
```

---

### Task 3: Improve what you found

**Files:** `src/sim/shelter.ts`, `src/sim/tasks.ts`, `src/ui/dopanel.ts`,
`src/ui/purpose.ts`, `tests/shelter.test.ts`, `tests/purpose.test.ts`

**Interfaces:** `TaskId` gains `"improveCover"`.

- [ ] **Step 1: Write the failing test**

Improving on rock (ceiling 2) reaches 3. Improving on pine (ceiling 1) reaches 2. Improving on meadow (ceiling 0) is refused - there is nothing to improve. Improving twice does not reach 4.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`improveCover` is legal where `site.cover >= 1`, costs minutes, and raises `site.cover` by one, capped at 3. Its cost is lower than the equivalent step of building from nothing - that is the whole point of looking first.

The labour cost is an author checkpoint unless a current task-time rule
derives it. Do not choose a number merely because it sits below 30 or 90.

Put the row under `Build > Shelter`. Emit the roof-goal shelter deed only when
this work first crosses protection 2; improving an already-weatherproof place
does not emit it again.

Like finding, improving is bound to its chosen cell and is never redirected to
camp by `intent.resolveCell`.

- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): cover that was found can be worked on"
```

---

### Task 4: An emergency shelter that pays as it goes

**Files:** `src/sim/types.ts` (`Site.emergencyMinutes`, `Site.emergencyAge`, `TaskId`),
`src/sim/regionstate.ts`, `src/sim/save.ts`, `src/sim/shelter.ts`,
`src/sim/tasks.ts`, `src/sim/camp.ts`, `src/ui/dopanel.ts`,
`src/ui/purpose.ts`, `src/ui/tip.ts`, `tests/shelter.test.ts`, and the
exhaustive task-table tests

**Interfaces:**
- Produces: `export const EMERGENCY_MINUTES: Record<1 | 2 | 3, number>` = `{ 1: 30, 2: 90, 3: 240 }`, and `export function builtProtection(minutes: number): Protection`.
- `TaskId` gains `"emergencyShelter"`; this is deliberately not a
  `StructureId`.
- `Site.emergencyAge: number` tracks decay separately from work invested.

- [ ] **Step 1: Write the failing test**

```ts
  it("pays out as the minutes go in, and joins the lean-to at the top", () => {
    expect(builtProtection(0)).toBe(0);
    expect(builtProtection(29)).toBe(0);
    expect(builtProtection(30)).toBe(1);
    expect(builtProtection(89)).toBe(1);
    expect(builtProtection(90)).toBe(2);
    expect(builtProtection(240)).toBe(3);
    expect(EMERGENCY_MINUTES[3]).toBe(STRUCTURES.leanTo.minutes);
  });
```

That last assertion is load-bearing: the emergency build must land exactly on the existing lean-to's cost so the curve joins the structure table rather than running beside it.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

```ts
/**
 * Minutes to each level of an emergency shelter. Design values chosen
 * inside sourced field ranges rather than measured: a natural-material
 * lean-to gives a windbreak and a roof in under an hour, and a debris hut
 * runs from about an hour and a half to half a day, two to four hours being
 * usual. The top of the scale is the lean-to's own cost, so building long
 * enough is building a lean-to.
 */
export const EMERGENCY_MINUTES = { 1: 30, 2: 90, 3: 240 } as const;
```

The task reads and advances `Site.emergencyMinutes` and resets
`Site.emergencyAge` rather than waiting for a
completion. It follows the permanent build progress pattern, but does not use
`Site.build`: that map is keyed by `StructureId`, and an emergency shelter must
not appear in permanent build, capability or mending tables. Put its row under
`Build > Shelter` and make its face state the next protection threshold.

Teach `intent.resolveCell` that this build is bound to the selected or current
cell. Do not route it through the permanent-build camp rule or its material
fetch allowance.

- [ ] **Step 4: Fold into `protectionOf`**

`protectionOf` returns the greatest of: the structures' level, `site.cover`, and
`builtProtection(site.emergencyMinutes)`.

Emit the roof-goal shelter deed on the first minute that crosses protection 2,
not only at the 240-minute end. This requires a threshold-crossing test because
normal task completion is not the deed seam for progressive protection.

- [ ] **Step 5: An emergency shelter rots**

It is boughs and deadfall, not a built structure, and the spec says it goes
in days rather than seasons and is never mended. Add it to `dailyCamp`'s
per-site loop the way the decaying structures already work, and log its
fall the way `FALLS` does for the others - a survivor who walks back to a
week-old shelter should be told there is nothing there.

Test it: build to protection 2, run the days out, and both the protection
and both emergency fields are reset.

**As with cover, the number of days is not derivable. Ask the author.**

- [ ] **Step 6: Run and commit**

```bash
git commit -m "feat(survidle): fifty minutes of work buys fifty minutes of shelter"
```

---

### Task 5: A fire where you stand

**Files:** `src/sim/tasks.ts` (the `needCamp` gates), `src/sim/intent.ts`
(remove field-capable work from `CAMP_BOUND`), `src/sim/types.ts`,
`src/sim/body.ts`, `src/sim/camp.ts`, `src/sim/inventory.ts`,
`src/sim/goals.ts`, `src/ui/dopanel.ts`, `src/ui/purpose.ts`,
`src/ui/tip.ts`, `tests/fieldfire.test.ts`, `tests/goals-deeds.test.ts`, and
the existing gear, purpose and task-coverage tests

**Interfaces:** produces `Player.fieldFire: { cell: number; fuelKg: number } | null`.

- [ ] **Step 1: Write the failing test**

A survivor on open ground with a drill and dry wood can `light`. Cooking, cracking, bark-grinding, melting and thawing all work there with the gear, and are refused for want of the gear rather than for want of a camp. Hanging, `lightIndoors` and `mend` still need the camp and say so. The field fire dies on leaving the cell, keeps no embers, and credits no fire-keeping goal.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Move the gate from place to equipment**

Of the tasks behind `needCamp` today: `cook`, `crack`, `grindBark`, `melt` and
`thaw` move to an equipment gate. Remove them, and `light`, from
`intent.ts`'s `CAMP_BOUND` set so an order stays attached to its chosen field
cell. `hang`, `lightIndoors`, `mend`, permanent `build`, `haul` and `night`
stay with the camp.

The refusal wording changes with it and improves: "needs a bark bucket", not "no camp here yet".

Use the current active-gear path. A drill, axe, stone or vessel may be in hand,
in the pack, or provisioned by the order exactly as comparable fieldwork is
today; task start takes up the tool and carried load includes it. Do not add a
field-fire-only inventory lookup.

- [ ] **Step 4: Field fire lifecycle**

It lives on the player, not the region. No pit, hand-fed only, no `litSince`, no embers, cleared on leaving the cell. One camp fire per region stays true.

Generalize the fire-at-feet queries used by task legality, warmth, drying and
the storm body step, while leaving camp fire-feeding and the camp care row tied
to the region fire. A successful field light emits the existing `lit` deed and a
field cook emits the existing task deed, so the fire and cook goals remain
outcome-based. Never emit `keptNight`, `keptFor` or `keptRain` for this fire.

The rows remain in their current Do purposes: removing `needCamp` changes
legality, not where cooking, food preparation or water work is found. The map
tooltip may show a field fire on the current cell; the camp box does not, since
it describes camp infrastructure.

- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): a fire is what you make, not where you are"
```

**Stage 1 gate.** `npm test`, `npm run test:slow`, `npm run build`, then `reference`, `horizon`, `year`, `december`. Record the readings. Movement is expected here because a survivor can now cook away from camp; read it, do not tune it.

---

## Stage 2: Skills and forecast

### Task 6: Three skills, by technique

**Files:** `src/sim/types.ts` (`SkillId`), `src/sim/skills.ts` (`SKILL_IDS`,
`SKILL_NAMES`, `MASTERY_KEYS`, `skillOf`, `masteryKey`),
`src/sim/ladder.ts` (`gateSkill`), `src/sim/capabilities.ts`,
`src/sim/reference.ts`, `src/ui/panels.ts` (the existing skills view),
`tests/skills.test.ts`, `tests/ladder.test.ts`, `tests/capabilities.test.ts`

**Interfaces:** `SkillId` gains `"naturalShelter" | "shelterBuilding" | "weatherSense"`.

- [ ] **Step 1: Write the failing test**

`SKILL_IDS` has ten entries; each new one has a name and a non-empty `MASTERY_KEYS` pool; `findShelter` and `improveCover` belong to `naturalShelter`, the emergency build to `shelterBuilding`, and reading the sky to `weatherSense`.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

Skills are categories of technique, not of material. `naturalShelter` covers finding cover, judging a site and improving what is found, whatever the material - a drifted snow cave is the same skill as a rock overhang. `shelterBuilding` covers raising a structure from materials, again whatever the material. Permanent work stays in `building`.

- [ ] **Step 4: The curve**

The idle curve spec assigns jobs, grinds and keeps per skill. Add the entries for the three new ones, following the existing shape. **If this needs a number that is not derivable from the existing pattern, stop and ask.**

The current UI derives its skill list from the shared tables, so do not add a
weather-specific panel. Extend the exhaustive coverage assertions and verify
that adding three skills does not leave a missing rung, mastery pool,
capability tier or heir carry entry.

- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): shelter is two techniques and the sky is a third"
```

---

### Task 7: Weather sense

**Files:** `src/sim/weather.ts`, `src/sim/tasks.ts` (`readSky`),
`src/sim/person.ts` (the quirk), `src/sim/record.ts` (read existing storm
events), `src/sim/types.ts` (the per-survivor daily sky observation),
`src/sim/newgame.ts`, `src/sim/landing.ts`, `src/sim/save.ts`,
`src/sim/advance.ts` (warning log), `src/sim/body.ts`
(warning consumer), `src/ui/panels.ts` (`weatherHtml`), `src/ui/sky.ts`,
`src/ui/dopanel.ts`, `src/ui/purpose.ts`, and the exhaustive task-table tests;
test in `tests/weathersense.test.ts`, `tests/sky.test.ts`, and focused UI tests

**Interfaces:**
- `export function warningMinutes(state: GameState): number`
- `export function forecastStage(state: GameState): 1 | 2 | 3`
- `QuirkId` gains `"weatherEye"`
- `TaskId` gains `"readSky"`
- `Player.skyReadDay: number | null` records the day index of a current
  observation and resets for a new survivor
- Storms survived are counted from the life record's existing `kind: "storm"`
  events; no second counter is added

- [ ] **Step 1: Write the failing test**

The warning lengthens with `weatherSense`, with survived-storm events, with the
quirk, and with a current sky observation, and the four stack. Stage 1 says
only that a storm is coming; stage 2 adds when, kind and severity; stage 3 adds
how long. `readSky` costs its minutes, stores an observation until the next
dawn, and returns detail matching the reader's stage. A storm that finishes
while the survivor is alive already records one event; one that merely rolls
does not.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`stormComing` stops being a flat hour and reads `warningMinutes`. The base stays 60 so an unskilled survivor is where they are today.

Put `readSky` under `Explore > Weather`. It is orderable, including through the
existing daily count, so "read the sky once each morning" is expressed by the
same list as every other routine. It does not create a special standing-order
type. Add its purpose, vocabulary, skill, mastery, gerund and capability
coverage.

Render forecast detail in the weather wall around the existing sky and storm
line. `advance.ts`, `weatherHtml` and `stormStep` all consume the same forecast
helpers; none reconstructs a private stage. Preserve the current stable sky
markup and direct-update rules.

Before implementation, fix the read duration and the contribution table from
skill, survived storms, quirk and today's observation to warning minutes and
forecast stage. Those values do not follow from main. Keep 60 as the base and
use the measured 48-110 minute neighboring-region journey to judge the next
stage; do not invent increments inside the task.

- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): the sky can be read, and reading it is learned"
```

---

### Task 8: The decision, and whether it is real

This task's deliverable is a **measurement**, not a feature.

**Files:** `src/sim/body.ts` (`stormStep`), `src/sim/bodyorder.ts`,
`src/sim/orders.ts` (ownership assertions only if needed),
`tests/weathersense.test.ts`, `tests/bodyorder.test.ts`, and a scratch
measurement script

- [ ] **Step 1: Give `stormStep` a second option**

Today the storm branch walks everyone home when the body care row wins. It must
now weigh walking home against digging in where the survivor stands: find
cover, improve it, or build, and light a fire. The comparison is the walk's
minutes against the warning's minutes - if home cannot be reached before the
storm lands, digging in wins.

Every resulting step is taken as the body care row's ordinary task step. It
keeps that row's `orderId`, pauses and resumes work through the existing
set-aside path, and never inserts shelter jobs into the list. If the body row
is ranked below ready work, the work wins and no private storm scheduler
overrides that choice.

- [ ] **Step 2: Write the test that says home still wins when home is close**

A survivor 10 minutes from camp walks home. A survivor 90 minutes out with a
60-minute warning does not. This is the guard against digging in becoming the
default. Add the scheduler counterpart: the same storm does not interrupt a
ready row ranked above the body, then is served when the body row reaches the
top ready position.

- [ ] **Step 3: Measure the author's first acceptance target**

Take the 48-110 minute case: a survivor caught in a neighbouring region. Measure, across seeds, how often they survive at:
- base weather sense and no shelter skill
- high weather sense, no shelter skill
- high shelter skill, base weather sense
- both high

Write the readings into the report. **The target is not that the unskilled always survive.** It is that skill visibly converts hopeless into manageable often enough to be worth having. If the four readings are indistinguishable, the system does not work yet and that is the finding - say so rather than adjusting a number to manufacture a difference.

Hold the body row at a stated rank in all four cohorts. Otherwise the
measurement mixes skill progression with a different scheduling policy and
cannot answer the acceptance question.

- [ ] **Step 4: Run the gates and commit**

```bash
git commit -m "feat(survidle): a storm is a choice, not an errand"
```

**Stage 2 gate.** Everything from Stage 1's gate, plus the four readings above. Do not start Stage 3 until they exist.

---

## Stage 3: Storm effects

### Task 9: Rain and snow, and wind on a wet body

**Files:** `src/sim/weather.ts` (`StormKind`), `src/sim/player.ts`
(wetness), `src/sim/types.ts`, `src/sim/save.ts`, `src/ui/panels.ts`,
`src/ui/sky.ts`, `tests/storms.test.ts`, `tests/sky.test.ts`

**Interfaces:** `export type StormKind = "rain" | "snow" | "gale"`, on
`Weather.storm.kind`. Only rain and snow are produced in this task. Optional
Stage 4 extends the union with `"lightning"`.

- [ ] **Step 1: Write the failing test**

A storm has a kind. Rain and snow are chosen by temperature the way
`burnPerHour` already distinguishes them. **Wind drives wetness faster on a
body under protection 0 than under protection 2** - that is the single
mechanical addition, and it is what makes being caught out dangerous through
the existing stack rather than through a new rule. Protection 1 must remain a
real middle: in rain it removes the storm multiplier while ordinary rain still
gets through; protection 2 stops the rain. In snow, a windbreak counts as the
effective shelter threshold.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement.** No new death cause. No storm-specific health drain.
- [ ] **Step 4: Test the whole protection ladder.** Under the same rain storm,
  level 0 wets faster than level 1, and level 1 wets faster than level 2. Under
  snow, level 1 receives the intended windbreak benefit. Do not collapse the
  feature into a binary `>= 2` check outside the rules that genuinely need a
  roof.
- [ ] **Step 5: Show the kind through the existing weather wall.** Preserve
  the sky's stable markup and direct updates. A stage-1 forecast must not leak
  kind through text, classes, icons or accessible labels before the survivor
  has earned that information.
- [ ] **Step 6: Run and commit**

```bash
git commit -m "feat(survidle): wind finds a wet body faster with nothing over it"
```

---

### Task 10: Gale

**Files:** `src/sim/weather.ts`, `src/sim/shelter.ts` (profile and lee),
`src/ui/panels.ts`, `src/ui/sky.ts`, `src/ui/tip.ts`,
`tests/storms.test.ts`, `tests/sky.test.ts`, `tests/tip.test.ts`

**Interfaces:** `export function profileOf(site: Site | null): "low" | "high"`, `export function isLee(world: World, cell: number): boolean`.

- [ ] **Step 1: Write the failing test**

In a gale the same protection level serves worse in a high-profile shelter than a low one, and lee ground beats a roof. A frame shelter is high profile; found cover and a scrape are low.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Set the gale design values before implementing.** Main has no
  storm-kind distribution, gale frequency, wind severity or profile penalty
  to derive. Ask for them and record them as design values beside their
  intended outcome; do not borrow lightning's rarity target.
- [ ] **Step 4: Implement.** Lee reads off terrain the world already generates: a depression or dense spruce is lee, rock and fell are exposed.
- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): a gale asks how low you are, not how much is over you"
```

**Stage 3 gate.** Full suite and every gate script. Record.

---

## Stage 4: Lightning

This stage is optional for the first merge. Stages 1-3 are a complete feature
and must not be held back if their implementation and calibration are sound.
If lightning is deferred, leave this task in the roadmap with no placeholder
storm kind produced by the live weather roll.

### Task 11: The strike

Last, and alone, so a random death cannot obscure whether the rest works.

**Files:** `src/sim/weather.ts`, `src/sim/shelter.ts`, `src/sim/player.ts`, `src/sim/types.ts` (`DeathCause`), `src/sim/epitaph.ts`, `tests/lightning.test.ts`

**Interfaces:**
- `DeathCause` gains `"struck"`
- `export function struckGround(world: World, cell: number, site: Site | null): boolean`

- [ ] **Step 1: Write the failing test**

Lightning storms fall in summer (over 70% of real lightning deaths are June to August, and summer currently carries the game's lowest storm chance, so this gives summer a danger of its own). Struck ground is a lone tall tree, a ridge, rock, or open fell - and sheltering under the biggest spruce is among the worst places, not the best. Low ground away from lone trees is safe. A survivor on struck ground during a lightning storm has a small chance per hour of dying, cause `"struck"`, with its own epitaph line.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

The odds are **calibrated to a target, not sourced** - real strike statistics describe a modern sheltered population, not someone standing under a spruce for six hours. Write the target in the comment beside the number.

- [ ] **Step 4: Measure the author's second acceptance target**

Across ordinary competent play, strike deaths must be rare enough to be memorable. Across deliberately repeated bad-ground exposure, the risk must be unmistakable. Measure both: a normal reference run across many seeds, and a scripted survivor who sits every lightning storm out under a lone tree.

**Do not tune it so every seed sees lightning.** A rare hazard that fires on schedule is not a rare hazard. If the reading says most runs never meet it, that is success, not a gap.

- [ ] **Step 5: Run every gate and commit**

```bash
git commit -m "feat(survidle): the tree you ran to is the worst place to be"
```

---

## Notes for the executor

- **The fixed numbers are only 30 / 90 / 240 and the existing 60-minute base.**
  The rebase audit found author checkpoints the earlier plan left implicit:
  find-cover timing and low-skill result, improve-cover labour, the two decay
  lives, read-sky duration, forecast contributions and stage thresholds, and
  gale frequency/severity/profile effect. Ask at the task that names each one.
  Optional lightning odds remain calibrated by Task 11's acceptance target.
- In particular, do not use the lean-to's 365 days for either temporary life.
  It is a built structure's life and the wrong shape entirely.
- Several tasks in Stages 2 to 4 give the shape of the work rather than the
  code. That is deliberate for the parts that depend on measurements taken
  in the task before them, but it means those tasks need a fuller read of
  the spec section they implement than the early ones do. The spec section
  is named in each task's Files list.
- The 30 / 90 / 240 minutes do not move in this plan. If the measurements say they are wrong, that is a finding for the author, not a fix.
- Task 8 has a measurement as its deliverable. If optional Stage 4 is included,
  Task 11 does too. A task that ships the code and skips its reading is not done.
- Stage boundaries are gates. Do not start a stage on a red previous one.
