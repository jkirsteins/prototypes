# Weather Sense and Shelter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A survivor caught out by a storm can look for cover, improve what they find, build when the ground gives nothing, and light a fire where they stand - and can learn to see the storm coming in time for any of that to matter.

**Architecture:** One protection currency (0-3) that found cover, improved cover, partial emergency builds and the existing structures all produce, read by the shelter functions that already take a `Site | null`. Three new skills. A forecast that grows in three stages. Four storm kinds, each asking for different ground.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-08-survidle-weather-sense-design.md`

## Global Constraints

- Repo rules in `/Users/janis.kirsteins/Projects/prototypes/CLAUDE.md` apply. Work only inside `08-survidle`. Stage with explicit paths; never `git add -A`.
- `npm test` and `npm run build` must pass before every commit. Run them in the FOREGROUND.
- No em dashes and no non-typable unicode anywhere. Only `-`, `->`, `"`, `'`, `...`.
- Comments explain, never chronicle: no dates, no "before/after", no plan references.
- **Numbers.** The shelter minutes are 30 / 90 / 240 and **do not change during this plan.** They are design values chosen inside sourced field ranges and the comment beside them must say so. Nothing else invents a constant: if a number seems needed, stop and ask.
- **Do not tune a gate.** A gate measures the sim. If a reading moves, report the movement and its cause.
- Game voice: `{You}`, `{your}` templates, lower case after a colon, no exclamation marks.

## Staging

The stages exist so a random death mechanism cannot obscure whether the shelter and forecast system works. **Do not start a stage until the previous one is green.**

1. **Shelter core** (Tasks 1-5) - protection, found cover, improvement, partial builds, fire anywhere.
2. **Skills and forecast** (Tasks 6-8) - the three skills, weather sense, and the measurement that says whether the 48-110 minute case now produces a real decision.
3. **Storm effects** (Tasks 9-10) - rain and snow, then gale.
4. **Lightning** (Task 11) - last, isolated, on its own.

## The two acceptance targets

These are the author's, and they outrank any individual test:

> **Skill must visibly convert a hopeless situation into a manageable one.** With only the basic warning, sometimes there is no good answer. With better weather sense or shelter skill, the same situation becomes manageable often enough that the progression is visibly worth having. The target is NOT that an unskilled survivor always survives.

> **Lightning should be rare enough to be memorable.** Across ordinary competent play, deaths by strike are rare. Across deliberately repeated bad-ground exposure, the risk becomes unmistakable. Do NOT tune it so every seed sees lightning - that turns a rare hazard into a scheduled mechanic.

---

## Stage 1: Shelter core

### Task 1: Protection as one currency

Pure refactor plus one new function. No behaviour change: the existing structures map onto the scale they already imply.

**Files:**
- Modify: `src/sim/types.ts` (add `Protection`)
- Create: `src/sim/shelter.ts`
- Modify: `src/sim/fire.ts` (`roofed`), `src/sim/player.ts` (`roofBonus`, `shelterBonus`, `sheltered`)
- Test: `tests/shelter.test.ts`

**Interfaces:**
- Consumes: `Site`, `siteAt`, `campSite` from the camp-siting work.
- Produces:
  - `export type Protection = 0 | 1 | 2 | 3` in `types.ts`
  - `export function protectionOf(site: Site | null): Protection` in `shelter.ts` - what stands on a cell, as a level
  - `export const PROTECTION_WORDS: Record<Protection, string>` - `["open ground", "windbreak", "weatherproof", "liveable"]`

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

- [ ] **Step 6: Commit**

```bash
git add src/sim/shelter.ts src/sim/types.ts src/sim/fire.ts src/sim/player.ts tests/shelter.test.ts
git commit -m "feat(survidle): what a place gives against the weather is one scale"
```

---

### Task 2: Find shelter

**Files:**
- Modify: `src/sim/shelter.ts` (terrain ceilings, `findCover`)
- Modify: `src/sim/types.ts` (`Site.cover`), `src/sim/regionstate.ts` (`newSite`), `src/sim/save.ts` (migration default)
- Modify: `src/sim/tasks.ts` (the `findShelter` task), `src/sim/types.ts` (`TaskId`)
- Test: `tests/shelter.test.ts`

**Interfaces:**
- Produces:
  - `export const COVER_CEILING: Record<Terrain, Protection>` - `rock: 2, spruce: 2, pine: 1, birch: 1, meadow: 0, bog: 0, fell: 0, water: 0`
  - `export function coverCeiling(world: World, cell: number): Protection`
  - `Site.cover: Protection` - what searching found here, 0 if nothing
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

`Site.cover: Protection`, defaulting 0 in `newSite` and in the save migration. The `findShelter` task is legal on any passable land cell, costs minutes, and writes `siteFor(st, cell).cover`. It creates a site - it is an authoring path, which is what `siteFor` is for.

Its refusal on ground with a ceiling of 0 is not a hard block: the survivor may look and find nothing, which costs the minutes and says so. That is what looking is.

- [ ] **Step 5: Fold cover into `protectionOf`**

`protectionOf` returns the greater of the structures' level and `site.cover`.

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

**Files:** `src/sim/shelter.ts`, `src/sim/tasks.ts`, `tests/shelter.test.ts`

**Interfaces:** `TaskId` gains `"improveCover"`.

- [ ] **Step 1: Write the failing test**

Improving on rock (ceiling 2) reaches 3. Improving on pine (ceiling 1) reaches 2. Improving on meadow (ceiling 0) is refused - there is nothing to improve. Improving twice does not reach 4.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`improveCover` is legal where `site.cover >= 1`, costs minutes, and raises `site.cover` by one, capped at 3. Its cost is lower than the equivalent step of building from nothing - that is the whole point of looking first.

- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): cover that was found can be worked on"
```

---

### Task 4: An emergency shelter that pays as it goes

**Files:** `src/sim/items.ts` (the structure entry), `src/sim/shelter.ts`, `src/sim/tasks.ts`, `tests/shelter.test.ts`

**Interfaces:**
- Produces: `export const EMERGENCY_MINUTES: Record<1 | 2 | 3, number>` = `{ 1: 30, 2: 90, 3: 240 }`, and `export function builtProtection(minutes: number): Protection`.

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

The build reads `Site.build.emergency` - the progress field that already exists - rather than waiting for completion. This is the one structure that pays out partway.

- [ ] **Step 4: Fold into `protectionOf`**

`protectionOf` returns the greatest of: the structures' level, `site.cover`, and `builtProtection(site.build.emergency ?? 0)`.

- [ ] **Step 5: An emergency shelter rots**

It is boughs and deadfall, not a built structure, and the spec says it goes
in days rather than seasons and is never mended. Add it to `dailyCamp`'s
per-site loop the way the decaying structures already work, and log its
fall the way `FALLS` does for the others - a survivor who walks back to a
week-old shelter should be told there is nothing there.

Test it: build to protection 2, run the days out, and both the protection
and the build progress are gone.

**As with cover, the number of days is not derivable. Ask the author.**

- [ ] **Step 6: Run and commit**

```bash
git commit -m "feat(survidle): fifty minutes of work buys fifty minutes of shelter"
```

---

### Task 5: A fire where you stand

**Files:** `src/sim/tasks.ts` (the `needCamp` gates), `src/sim/types.ts`, `src/sim/camp.ts`, `tests/fieldfire.test.ts`

**Interfaces:** produces `PlayerState.fieldFire: { cell: number; fuelKg: number } | null`.

- [ ] **Step 1: Write the failing test**

A survivor on open ground with a drill and dry wood can `light`. Cooking, cracking, bark-grinding, melting and thawing all work there with the gear, and are refused for want of the gear rather than for want of a camp. Hanging, `lightIndoors` and `mend` still need the camp and say so. The field fire dies on leaving the cell, keeps no embers, and credits no fire-keeping goal.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Move the gate from place to equipment**

Of the tasks behind `needCamp` today: `cook`, `crack`, `grindBark`, `melt` and `thaw` move to an equipment gate. `hang`, `lightIndoors`, `mend`, permanent `build`, `haul`, `night` and `wait` stay with the camp.

The refusal wording changes with it and improves: "needs a bark bucket", not "no camp here yet".

- [ ] **Step 4: Field fire lifecycle**

It lives on the player, not the region. No pit, hand-fed only, no `litSince`, no embers, cleared on leaving the cell. One camp fire per region stays true.

- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): a fire is what you make, not where you are"
```

**Stage 1 gate.** `npm test`, `npm run test:slow`, `npm run build`, then `reference`, `horizon`, `year`, `december`. Record the readings. Movement is expected here because a survivor can now cook away from camp; read it, do not tune it.

---

## Stage 2: Skills and forecast

### Task 6: Three skills, by technique

**Files:** `src/sim/types.ts` (`SkillId`), `src/sim/skills.ts` (`SKILL_IDS`, `SKILL_NAMES`, `MASTERY_KEYS`), `src/sim/reference.ts`, `tests/skills.test.ts`

**Interfaces:** `SkillId` gains `"naturalShelter" | "shelterBuilding" | "weatherSense"`.

- [ ] **Step 1: Write the failing test**

`SKILL_IDS` has ten entries; each new one has a name and a non-empty `MASTERY_KEYS` pool; `findShelter` and `improveCover` belong to `naturalShelter`, the emergency build to `shelterBuilding`, and reading the sky to `weatherSense`.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

Skills are categories of technique, not of material. `naturalShelter` covers finding cover, judging a site and improving what is found, whatever the material - a drifted snow cave is the same skill as a rock overhang. `shelterBuilding` covers raising a structure from materials, again whatever the material. Permanent work stays in `building`.

- [ ] **Step 4: The curve**

The idle curve spec assigns jobs, grinds and keeps per skill. Add the entries for the three new ones, following the existing shape. **If this needs a number that is not derivable from the existing pattern, stop and ask.**

- [ ] **Step 5: Run and commit**

```bash
git commit -m "feat(survidle): shelter is two techniques and the sky is a third"
```

---

### Task 7: Weather sense

**Files:** `src/sim/weather.ts`, `src/sim/tasks.ts` (`readSky`), `src/sim/person.ts` (the quirk), `src/sim/record.ts` (storms survived), `src/ui/panels.ts`, `tests/weathersense.test.ts`

**Interfaces:**
- `export function warningMinutes(state: GameState): number`
- `export function forecastStage(state: GameState): 1 | 2 | 3`
- `QuirkId` gains `"weatherEye"`
- `TaskId` gains `"readSky"`
- The life record gains a storms-survived count

- [ ] **Step 1: Write the failing test**

The warning lengthens with `weatherSense`, with storms survived, and with the quirk, and the three stack. Stage 1 says only that a storm is coming; stage 2 adds when and how hard; stage 3 adds how long. `readSky` costs its minutes and returns detail matching the reader's stage. A storm that blows while the survivor is alive increments the count; one that merely rolls does not.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`stormComing` stops being a flat hour and reads `warningMinutes`. The base stays 60 so an unskilled survivor is where they are today.

- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): the sky can be read, and reading it is learned"
```

---

### Task 8: The decision, and whether it is real

This task's deliverable is a **measurement**, not a feature.

**Files:** `src/sim/body.ts` (`stormStep`), `tests/weathersense.test.ts`, and a scratch measurement script

- [ ] **Step 1: Give `stormStep` a second option**

Today it walks everyone home. It must now weigh walking home against digging in where it stands: find cover, improve it, or build, and light a fire. The comparison is the walk's minutes against the warning's minutes - if home cannot be reached before the storm lands, digging in wins.

- [ ] **Step 2: Write the test that says home still wins when home is close**

A survivor 10 minutes from camp walks home. A survivor 90 minutes out with a 60-minute warning does not. This is the guard against digging in becoming the default.

- [ ] **Step 3: Measure the author's first acceptance target**

Take the 48-110 minute case: a survivor caught in a neighbouring region. Measure, across seeds, how often they survive at:
- base weather sense and no shelter skill
- high weather sense, no shelter skill
- high shelter skill, base weather sense
- both high

Write the readings into the report. **The target is not that the unskilled always survive.** It is that skill visibly converts hopeless into manageable often enough to be worth having. If the four readings are indistinguishable, the system does not work yet and that is the finding - say so rather than adjusting a number to manufacture a difference.

- [ ] **Step 4: Run the gates and commit**

```bash
git commit -m "feat(survidle): a storm is a choice, not an errand"
```

**Stage 2 gate.** Everything from Stage 1's gate, plus the four readings above. Do not start Stage 3 until they exist.

---

## Stage 3: Storm effects

### Task 9: Rain and snow, and wind on a wet body

**Files:** `src/sim/weather.ts` (`StormKind`), `src/sim/player.ts` (wetness), `tests/storms.test.ts`

**Interfaces:** `export type StormKind = "rain" | "snow" | "gale" | "lightning"`, on `Weather.storm.kind`. Only rain and snow are produced in this task.

- [ ] **Step 1: Write the failing test**

A storm has a kind. Rain and snow are chosen by temperature the way `burnPerHour` already distinguishes them. **Wind drives wetness faster on a body under protection 0 than under protection 2** - that is the single mechanical addition, and it is what makes being caught out dangerous through the existing stack rather than through a new rule.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement.** No new death cause. No storm-specific health drain.
- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): wind finds a wet body faster with nothing over it"
```

---

### Task 10: Gale

**Files:** `src/sim/weather.ts`, `src/sim/shelter.ts` (profile and lee), `tests/storms.test.ts`

**Interfaces:** `export function profileOf(site: Site | null): "low" | "high"`, `export function isLee(world: World, cell: number): boolean`.

- [ ] **Step 1: Write the failing test**

In a gale the same protection level serves worse in a high-profile shelter than a low one, and lee ground beats a roof. A frame shelter is high profile; found cover and a scrape are low.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement.** Lee reads off terrain the world already generates: a depression or dense spruce is lee, rock and fell are exposed.
- [ ] **Step 4: Run and commit**

```bash
git commit -m "feat(survidle): a gale asks how low you are, not how much is over you"
```

**Stage 3 gate.** Full suite and every gate script. Record.

---

## Stage 4: Lightning

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

- **Two numbers are deliberately missing**: how many days found cover lasts,
  and how many days an emergency shelter lasts. Neither follows from
  anything already in the tree, and the standing rule forbids inventing
  one. Ask the author when you reach Task 2 Step 6 and Task 4 Step 5; do
  not guess and do not use the lean-to's 365 days, which is a built
  structure's life and the wrong shape entirely.
- Several tasks in Stages 2 to 4 give the shape of the work rather than the
  code. That is deliberate for the parts that depend on measurements taken
  in the task before them, but it means those tasks need a fuller read of
  the spec section they implement than the early ones do. The spec section
  is named in each task's Files list.
- The 30 / 90 / 240 minutes do not move in this plan. If the measurements say they are wrong, that is a finding for the author, not a fix.
- Tasks 8 and 11 have measurements as their deliverable. A task that ships the code and skips the reading is not done.
- Stage boundaries are gates. Do not start a stage on a red previous one.
