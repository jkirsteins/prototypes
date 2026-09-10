# Weather Sense and Shelter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A survivor caught out by a storm can find or build protection, use a field fire, anticipate weather, and learn that complete loop through meaningful event-backed goals.

**Architecture:** One protection currency (0-3) unifies found cover, improved cover, partial emergency builds and existing structures. Three skills feed one staged forecast and one storm-option evaluator used by the body, the UI and goal snapshots. Ten goals in three chapters use contextual simulation events and natural-first weather opportunities; optional Stage 5 adds lightning.

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
- **Numbers.** Emergency shelter thresholds are 30 / 90 / 240 effective
  work minutes. Found cover expires after 7 days and emergency work after 14
  days. A search takes `max(10, 31 - naturalShelterLevel)` minutes; levels 1-4
  find protection 1 where cover exists and level 5+ reaches the terrain
  ceiling. Improving to protection 2 costs 30 effective minutes and improving
  to 3 costs 75. `readSky` costs 10 minutes. Forecast warning is
  `60 + 5 * (weatherSenseLevel - 1) + 10 * min(6, survivedStorms) + 30` for
  each of `weatherEye` and a current sky reading; stages begin at 60, 120 and
  180 minutes. Gales are 20% of storms, with effective protection
  `clamp(protection + lee - highProfile, 0, 3)`. These are conservative
  starting design values and may move only when a functional test proves the
  formula wrong; balance concerns belong in the final report.
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
- **Goals are outcomes.** Emit contextual simulation events with minute,
  location and weather identity rather than scanning state or inventing
  goal-only deeds. A failed search, failed light or sky reading that reveals
  nothing earns nothing. Field fires emit none of the three hearth-keeping
  events.
- **Guarantee the opportunity, not the outcome.** Weather teaching claims an
  eligible natural storm first and synthesizes one only after three dawns.
  It never grants protection, forces work, moves the survivor, weakens the
  event or completes a failed attempt.
- **Teaching weather is ordinary weather.** It uses the normal generator and
  distributions, carries a stable storm ID, excludes lightning and is never
  materially harsher than a comparable natural event at that progression.
- **Active gear.** Field work uses the existing provisioning, `toolNear`,
  `takeUp` and carried-load paths. Do not add a parallel equipment check.
- **Presentation.** Forecast detail belongs in the weather wall and sky;
  protection at a cell belongs in the map tooltip and the relevant Do rows.

## Staging

The stages exist so a random death mechanism cannot obscure whether the shelter and forecast system works. **Do not start a stage until the previous one is green.**

1. **Shelter core** (Tasks 1-5) - protection, found cover, improvement, partial builds, fire anywhere.
2. **Skills and forecast** (Tasks 6-8) - the three skills, weather sense, one shared storm decision, and its measurement.
3. **Storm effects** (Tasks 9-10) - rain and snow, then gale.
4. **Goals and opportunities** (Tasks 11-15) - contextual events, reviewable introductions, natural-first weather opportunities and three teaching chapters.
5. **Lightning** (Task 16) - optional for the first merge, last and isolated.

## The acceptance targets

These are the author's, and they outrank any individual test:

> **Skill must visibly convert a hopeless situation into a manageable one.** With only the basic warning, sometimes there is no good answer. With better weather sense or shelter skill, the same situation becomes manageable often enough that the progression is visibly worth having. The target is NOT that an unskilled survivor always survives.

If optional Stage 5 is included:

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

The task takes `max(10, 31 - naturalShelterLevel)` minutes. Levels 1-4 find
protection 1 wherever the terrain ceiling is non-zero; level 5 and above find
the terrain ceiling. No level exceeds it.

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

Expire found cover after 7 days. This is a pacing value for remembered and
lightly arranged natural cover, not the lifetime of the terrain itself.

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

Improving protection 1 to 2 costs 30 effective work minutes; improving 2 to 3
costs 75. Both are half the equivalent incremental emergency-build work, which
keeps found cover strictly cheaper than starting from nothing.

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

Expire emergency work after 14 days without work on it, resetting both fields.

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

The idle curve spec assigns jobs, grinds and keeps per skill. Add the entries
for the three new ones using the existing rung levels unchanged.

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

`readSky` costs 10 minutes. Warning minutes use the formula in Global
Constraints and forecast stages begin at 60, 120 and 180 minutes. This lets a
level-1 survivor retain today's warning, a weather eye or current reading make
visible progress, and combined practice and observation cover the measured
48-110 minute neighbouring-region journey.

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
Stage 5 extends the union with `"lightning"`.

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
- [ ] **Step 3: Add the gale design values.** Twenty percent of ordinary
  storms are gales. Effective gale protection is
  `clamp(protection + (lee ? 1 : 0) - (highProfile ? 1 : 0), 0, 3)`; use it
  wherever gale wind reads protection. Record that these are design values,
  not sourced frequencies.
- [ ] **Step 4: Implement.** Lee reads off terrain the world already generates: a depression or dense spruce is lee, rock and fell are exposed.
- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): a gale asks how low you are, not how much is over you"
```

**Stage 3 gate.** Full suite and every gate script. Record.

---

## Stage 4: Goals and opportunities

### Task 11: Contextual goal events, phases and reviewable introductions

**Files:** `src/sim/types.ts`, `src/sim/goals.ts`, `src/sim/save.ts`,
`src/ui/goalpanel.ts`, `src/ui/render.ts`, `src/main.ts`, `tests/goals.test.ts`,
`tests/goals-deeds.test.ts`, `tests/goalpanel.test.ts`

**Interfaces:**
- Rename the event union to `GoalEvent` and retain `export type Deed = GoalEvent`
  as a migration alias until all call sites are changed in Tasks 12-15.
- `GoalDef` gains `intro: string[]`, `phase: "opening" | "camp" | "range" | "seasonal"`,
  `notBeforeDay?: number`, and `after?: GoalId[]`.
- `GoalState` gains `introduced`, `introQueue`, and `noticeQueue`.
- `GoalId` gains `findUsefulCover`, `makeUsefulShelter`, `testShelter`,
  `readWeather`, `prepareWeather`, `surviveForecast`, `remoteRefuge`,
  `fieldFire`, `fieldMeal`, and `remoteStorm`.

- [ ] **Step 1: Write failing phase and introduction tests**

Prove that Chapter 1 follows `cook` in the one-wide opening, `keptNight` and
`bed` follow Chapter 1, Chapter 2 requires those goals and day 8, Chapter 3
requires Chapter 2 and day 31, and eligible existing camp goals prevent a
calendar gate from leaving the panel empty. Prove every goal has non-empty
ASCII introduction copy, an introduction queues once per world, and an heir
does not queue it again.

- [ ] **Step 2: Write failing goal-row review tests**

Render active goals as buttons with `data-goal`. Clicking opens the same intro
copy without mutating `done`, `progress`, `introduced`, or any opportunity.
The automatic intro uses the existing overlay priority and completion moments
still outrank a newly queued introduction in the same minute.

- [ ] **Step 3: Run the focused tests and verify the expected failures**

Run: `npm test -- tests/goals.test.ts tests/goals-deeds.test.ts tests/goalpanel.test.ts`

- [ ] **Step 4: Add the phase metadata and state migration**

Insert Chapter 1 after `cook`; resume `keptNight` and `bed`; make Chapter 2
eligible at day 8 after those prerequisites; make Chapter 3 eligible at day 31
after Chapter 2. Preserve the current width rules for eligible goals and the
single seasonal slot. Save migration defaults all new maps and queues without
replaying old introductions.

- [ ] **Step 5: Add introduction and review UI**

Use the existing overlay box and voice rules. The introduction explains why
the outcome matters and valid approaches, not a hidden recipe chain. A review
is read-only. Add keyboard-accessible button markup without nesting a button
inside another interactive element.

- [ ] **Step 6: Run, build and commit**

```bash
npm test -- tests/goals.test.ts tests/goals-deeds.test.ts tests/goalpanel.test.ts
npm run build
git add src/sim/types.ts src/sim/goals.ts src/sim/save.ts src/ui/goalpanel.ts src/ui/render.ts src/main.ts tests/goals.test.ts tests/goals-deeds.test.ts tests/goalpanel.test.ts
git commit -m "feat(survidle): goals explain the weather lessons they set"
```

---

### Task 12: Stable storms and natural-first teaching opportunities

**Files:** `src/sim/types.ts`, `src/sim/weather.ts`, `src/sim/advance.ts`,
`src/sim/goals.ts`, create `src/sim/goalopportunity.ts`, `src/sim/save.ts`,
`tests/storm.test.ts`, create `tests/goalopportunity.test.ts`

**Interfaces:**
- Every storm has `id: number` and `source: "natural" | "synthetic"`;
  `Weather.nextStormId` supplies stable IDs and migrates from old saves.
- `GoalOpportunity` has the exact fields and status union in spec section 7.
- `stepGoalOpportunity(state, world, cal, rng)` claims or creates weather but
  never executes survivor work.
- `GoalState.opportunity: GoalOpportunity | null`.

- [ ] **Step 1: Write failing identity and lifecycle tests**

Prove IDs increase without reuse, survive save/load, and remain the same from
warning through end. Prove `reserved -> announced -> running -> resolved` at
the correct minutes and that a running ordinary storm delays reservation.

- [ ] **Step 2: Write failing natural-first tests**

With an eligible natural storm scheduled before the third dawn, prove the
opportunity claims it without changing `from`, `until`, `kind`, or RNG state.
With none by the third dawn, prove exactly one synthetic storm is created by
the normal storm factory. Prove no overlap, no reroll, no lightning, and no
event outside the opportunity's danger constraints.

- [ ] **Step 3: Run and verify red**

Run: `npm test -- tests/storm.test.ts tests/goalopportunity.test.ts`

- [ ] **Step 4: Extract one storm factory and implement claiming**

The ordinary dawn roll and synthesis call the same factory. Claiming only
stores the existing ID in the opportunity. Chapter 1 constrains rain above
freezing to the shortest third of the 6-19 hour range. Chapter 2 requires an
event readable before the base warning. Chapter 3 requires current refuge
travel time plus 30 minutes. The third-dawn fallback is a pacing rule, not a
new daily weather loop.

- [ ] **Step 5: Implement miss and heir retry**

On a miss or death set `resolved`, queue a factual notice, and keep the goal
open. After one full storm-free day, increment `attempts`, refresh `createdAt`,
and begin natural-first reservation again. Completed earlier goals stay done.

- [ ] **Step 6: Run, build and commit**

```bash
npm test -- tests/storm.test.ts tests/goalopportunity.test.ts tests/advance-save.test.ts
npm run build
git add src/sim/types.ts src/sim/weather.ts src/sim/advance.ts src/sim/goals.ts src/sim/goalopportunity.ts src/sim/save.ts tests/storm.test.ts tests/goalopportunity.test.ts tests/advance-save.test.ts
git commit -m "feat(survidle): teaching weather claims the world before creating it"
```

---

### Task 13: Chapter 1 - find, improve and test shelter

**Files:** `src/sim/goals.ts`, `src/sim/goalopportunity.ts`,
`src/sim/tasks.ts`, `src/sim/shelter.ts`, `src/sim/advance.ts`,
`tests/goals-deeds.test.ts`, `tests/goalopportunity.test.ts`

**Interfaces:** `GoalEvent` gains contextual `protectionChanged`,
`stormStarted`, and `stormEnded` variants from spec section 7. The active
opportunity accumulates `minutesByProtection`, camp/away minutes and wetness.

- [ ] **Step 1: Write failing outcome tests**

Prove a failed search earns nothing, protection 1 completes `findUsefulCover`,
and protection 2 completes `makeUsefulShelter` at a different cell within 1 km
in the same region. Prove a cell farther away or in another region does not.

- [ ] **Step 2: Write failing storm-test metrics**

For the matching Chapter 1 storm, prove 60 accumulated minutes at protection
2 in the area plus being alive at storm end completes `testShelter`. Prove 59
minutes, protection 1, death, time outside the area, and another storm ID do
not. Metrics count the actual location each minute, not the final cell.

- [ ] **Step 3: Run and verify red**

Run: `npm test -- tests/goals-deeds.test.ts tests/goalopportunity.test.ts`

- [ ] **Step 4: Emit and interpret general protection and storm events**

Emit one `protectionChanged` event at each real transition, including partial
emergency thresholds. Refactor the existing roof goal to accept `to >= 2`.
Do not emit a specialized shelter-goal event. At storm end emit the accumulated
general metrics with the stable ID and let the active goal interpret them.

- [ ] **Step 5: Run, build and commit**

```bash
npm test -- tests/goals-deeds.test.ts tests/goalopportunity.test.ts tests/shelter.test.ts
npm run build
git add src/sim/goals.ts src/sim/goalopportunity.ts src/sim/tasks.ts src/sim/shelter.ts src/sim/advance.ts tests/goals-deeds.test.ts tests/goalopportunity.test.ts
git commit -m "feat(survidle): shelter goals finish only when shelter works"
```

---

### Task 14: Chapter 2 - read, prepare and survive forecast weather

**Files:** `src/sim/goals.ts`, `src/sim/goalopportunity.ts`,
`src/sim/weather.ts`, `src/sim/tasks.ts`, `src/sim/body.ts`,
`src/sim/advance.ts`, `src/ui/panels.ts`, `tests/weathersense.test.ts`,
`tests/goalopportunity.test.ts`, `tests/body.test.ts`

**Interfaces:**
- `GoalEvent` gains `forecastChanged` with before/after knowledge and source.
- Extract `stormOptions(state, world, storm): StormPlanSnapshot` from the body
  decision; each option records kind, inputs, arrival margin and `viable`.
- `stormStarted` carries that pre-storm snapshot.

- [ ] **Step 1: Write failing forecast-credit tests**

Prove `readSky` earns `readWeather` only for the matching announced storm when
at least one previously unknown fact becomes known. A repeated read, passive
warning, unrelated storm, or observation with no new fact earns nothing.

- [ ] **Step 2: Write failing snapshot tests**

Before onset, construct viable return-home, local-shelter and remote-refuge
cases and prove all can complete `prepareWeather`. Snapshot inputs include
forecast facts, routes, travel times, protection, fire, fuel, active gear and
supplies. Mutating those values after onset does not rewrite the snapshot.

- [ ] **Step 3: Write failing completion tests**

The matching `stormEnded` completes `surviveForecast` only if the survivor who
read it remains alive. Another storm or an heir who did not read it does not.

- [ ] **Step 4: Run and verify red**

Run: `npm test -- tests/weathersense.test.ts tests/goalopportunity.test.ts tests/body.test.ts`

- [ ] **Step 5: Implement one shared option evaluator and contextual forecast events**

The body chooses the highest expected survival option from `stormOptions`;
the weather wall describes those same options; the goal stores the same
snapshot. `readSky` emits before and after knowledge, never a goal-only deed.

- [ ] **Step 6: Run, build and commit**

```bash
npm test -- tests/weathersense.test.ts tests/goalopportunity.test.ts tests/body.test.ts tests/bodyorder.test.ts tests/sky.test.ts
npm run build
git add src/sim/goals.ts src/sim/goalopportunity.ts src/sim/weather.ts src/sim/tasks.ts src/sim/body.ts src/sim/advance.ts src/ui/panels.ts tests/weathersense.test.ts tests/goalopportunity.test.ts tests/body.test.ts
git commit -m "feat(survidle): foresight becomes a plan before weather lands"
```

---

### Task 15: Chapter 3 - live beyond camp

**Files:** `src/sim/goals.ts`, `src/sim/goalopportunity.ts`,
`src/sim/tasks.ts`, `src/sim/advance.ts`, `tests/goals-deeds.test.ts`,
`tests/goalopportunity.test.ts`, `tests/fieldfire.test.ts`

**Interfaces:** `GoalEvent` gains contextual `fireLit` and `taskCompleted`.

- [ ] **Step 1: Write failing remote outcome tests**

Prove protection 2 in a non-camp region completes `remoteRefuge`; protection
at camp does not. A successful light and completed cook at a non-camp cell
complete `fieldFire` and `fieldMeal`; attempts, failures and camp work do not.

- [ ] **Step 2: Write failing remote storm tests**

Prove the opportunity reserves when the refuge exists, not when the survivor
arrives. It requires travel time plus 30 minutes. The matching end completes
`remoteStorm` only with survival, at least 60 protected minutes in the refuge
region, and zero storm minutes at camp. Going home resolves a miss and retries
after cooldown without undoing the first nine goals.

- [ ] **Step 3: Run and verify red**

Run: `npm test -- tests/goals-deeds.test.ts tests/goalopportunity.test.ts tests/fieldfire.test.ts`

- [ ] **Step 4: Emit the general field events and implement Chapter 3 credit**

Replace legacy `lit` and `task` emissions at these call sites with contextual
events while preserving credit for the existing fire and cook goals. Bind the
refuge to its region and cell for travel evaluation; never wait for the player
to stand there before reserving weather.

- [ ] **Step 5: Run all Stage 4 tests, build and commit**

```bash
npm test -- tests/goals.test.ts tests/goals-deeds.test.ts tests/goalpanel.test.ts tests/goalopportunity.test.ts tests/fieldfire.test.ts tests/weathersense.test.ts tests/storm.test.ts
npm run build
git add src/sim/goals.ts src/sim/goalopportunity.ts src/sim/tasks.ts src/sim/advance.ts tests/goals-deeds.test.ts tests/goalopportunity.test.ts tests/fieldfire.test.ts
git commit -m "feat(survidle): foresight makes a life beyond camp possible"
```

**Stage 4 gate.** Run the full fast suite, slow suite, build, `reference`,
`horizon`, `year`, `december`, and the lineage probe. Functional failures and
runner defects block completion. Record balance and calibration movement
without tuning it away.

---

## Stage 5: Lightning

This stage is optional for the first merge. Stages 1-4 are a complete feature
and must not be held back if their implementation and calibration are sound.
If lightning is deferred, leave this task in the roadmap with no placeholder
storm kind produced by the live weather roll.

### Task 16: The strike

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

- **All required Stage 1-4 pacing values are fixed in Global Constraints.**
  Optional lightning odds remain calibrated by Task 16's acceptance target.
- In particular, do not use the lean-to's 365 days for either temporary life.
  It is a built structure's life and the wrong shape entirely.
- Several tasks in Stages 2 to 5 give the shape of the work rather than the
  code. That is deliberate for the parts that depend on measurements taken
  in the task before them, but it means those tasks need a fuller read of
  the spec section they implement than the early ones do. The spec section
  is named in each task's Files list.
- The 30 / 90 / 240 minutes do not move in this plan. If the measurements say they are wrong, that is a finding for the author, not a fix.
- Task 8 has a measurement as its deliverable. If optional Stage 5 is included,
  Task 16 does too. A task that ships the code and skips its reading is not done.
- Stage boundaries are gates. Do not start a stage on a red previous one.
