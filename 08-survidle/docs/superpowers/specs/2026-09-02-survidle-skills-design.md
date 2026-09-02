# Survidle: skills, mastery and pools

Survidle is in the spirit of Melvor Idle but has none of its progression: no
skill levels, no mastery, no pools. This spec adds all three without adding
an unreal number. Experience is minutes of work. A level is a count of hours
behind the axe, the bow or the needle, and what it buys is what practice
buys: speed, better odds, less waste. Gates are soft: a recommended level
shown on the button, with the odds tuned so that trying early is a gamble
that can backfire, never a locked door.

Extends `2026-09-02-survidle-design.md`. Everything below is in real
quantities: minutes, hours, percent.

## 1. Skills and levels

### 1.1 The six skills and what trains them

| skill     | tasks                                                | mastery keys                                                        |
|-----------|------------------------------------------------------|---------------------------------------------------------------------|
| Woodcraft | chop, sticks, bark, split                            | `chop:spruce`, `chop:pine`, `chop:birch`, `sticks`, `bark`, `split` |
| Foraging  | berries, stone                                       | `berries`, `stone`                                                  |
| Hunting   | hunt (each species), build snare                     | `hunt:hare`, `hunt:grouse`, `hunt:deer`, `hunt:elk`, `snare`        |
| Fishing   | fish                                                 | `fish`                                                              |
| Crafting  | craft (each recipe), repair, sharpen                 | `craft:<recipe>` for every recipe, `repair`, `sharpen`              |
| Building  | build (each structure but snare), light, cook        | `build:<structure>`, `light`, `cook:rawMeat`, `cook:fish`           |

Walking, travelling, hauling, resting and sleeping train nothing.

`chop` keys on the terrain under foot (spruce, pine or birch). A felling
started on spruce and resumed on pine trains pine from that minute on; the
share done is not retagged.

### 1.2 Experience

Every simulated minute spent at a task adds one minute to the task's skill
and one minute to the task's mastery key, and one minute to the skill's
pool. It is elapsed time, not progress: a tired worker at half speed still
learns per minute. Experience is granted in `stepTask`, so it accrues
while away the same way work does, and a task set aside keeps what it
earned because it was granted as it happened.

### 1.3 Level curve

Skill level `L` (1..50) needs cumulative hours `2 * (L - 1)^2`:

| level | hours | reads as                         |
|-------|-------|----------------------------------|
| 2     | 2     | an afternoon                     |
| 5     | 32    | three working days               |
| 10    | 162   | two and a half weeks             |
| 20    | 722   | a season                         |
| 30    | 1682  | half a year, full time           |
| 50    | 4802  | the cap; years                   |

`level(xpMinutes) = min(50, 1 + floor(sqrt(xpMinutes / 120)))`.

A year holds about 3,600 working hours across all six skills, so a first
year ends with most skills between 10 and 20 and one or two higher.

### 1.4 Effects, 1% per level above 1

`bonus = 0.01 * (level - 1)`, so level 1 is the untrained baseline.

| skill     | effect                                                         |
|-----------|----------------------------------------------------------------|
| Woodcraft | work speed on its tasks x (1 + bonus)                          |
| Foraging  | work speed x (1 + bonus)                                       |
| Hunting   | work speed x (1 + bonus); hunt odds x (1 + bonus)              |
| Fishing   | work speed x (1 + bonus); fish odds x (1 + bonus)              |
| Crafting  | work speed x (1 + bonus); tool wear on its tasks x (1 - bonus) |
| Building  | work speed x (1 + bonus), which covers lighting and cooking    |

Work speed multiplies the existing `workSpeed` (energy and injury factors).
Odds still cap at 95%.

### 1.5 Level-ups

Crossing a level logs `Woodcraft 5.` in the good colour. Level-ups while
away appear in the away panel like any log line.

## 2. Soft gates

### 2.1 Recommended levels

| action                                  | skill    | recommended |
|-----------------------------------------|----------|-------------|
| hunt roe deer                           | Hunting  | 4           |
| hunt elk                                | Hunting  | 8           |
| craft bow                               | Crafting | 5           |
| craft hide blanket                      | Crafting | 6           |
| craft hide coat, hide trousers, hide boots | Crafting | 8        |
| build log cabin                         | Building | 10          |

Everything else has no recommendation. `gap = max(0, recommended - level)`.
A level above the recommendation gives nothing beyond section 1.4; the
recommendation is where the penalty stops.

### 2.2 What a gap does

- **Hunting and fishing.** Odds x `0.5^gap`. The gap's own share of the
  injury chance, `0.10 * gap` halved by mastery 50 the same as the animal's
  own chance, rolls on every attempt, success or not; the animal's own
  injury chance rolls only when it is taken, on top of the gap's share for
  that attempt. Elk at Hunting 1 is about one try in 128, with an 85% chance
  of the injury status when it is taken and a 70% chance from the gap alone
  on every try regardless. Deer at Hunting 2 is a quarter of the odds and a
  20% injury when taken. So seven levels short of elk you are hurt seven
  tries in ten whether or not you see the animal.
- **Crafting.** The piece comes out with chance `0.5^gap`, rolled at
  completion. On failure half of each material is lost (counts rounded up,
  kilograms exact), the time is spent, and the log says
  `The hide coat is cut wrong. 3 kg hide and 1 sinew are spoiled.` The
  needle or knife still wears.
- **Building.** No backfire. Duration x `1.3^gap`. A cabin at Building 4 is
  about 4.8 times the hours.

### 2.3 What the button shows

The button is never greyed for level. Its detail line gains the recommended
level, `Hunting 8`, rendered in the warning colour while `gap > 0`. The hunt
line already prints `about N% per try`; that N is the penalised figure. A
craft under level appends `N% chance it comes out`. A build under level
appends `at Building 4 this takes 4.8x as long`.

## 3. Mastery per action

### 3.1 Curve

Mastery level `M` (1..99) on a key needs cumulative hours `0.25 * (M - 1)^2`:
mastery 10 at 20 hours, 20 at 90, 50 at 600, 99 at 2,401.

`masteryLevel(minutes) = min(99, 1 + floor(sqrt(minutes / 15)))`.

### 3.2 Effects

- Work speed on that action x `(1 + 0.0025 * (M - 1))`, about +25% at 99,
  on top of the skill bonus.
- Concrete extras at mastery 20 and 50, logged when reached
  (`Spruce felling mastery 20: an extra stick per tree.`):

| key                     | at 20                              | at 50                                   |
|-------------------------|------------------------------------|-----------------------------------------|
| `chop:*` (each kind)    | +1 stick per tree                  | the axe loses no edge on that kind      |
| `hunt:hare`             | hide 0.3 kg instead of 0.2         | +1 bone                                 |
| `hunt:deer`, `hunt:elk` | +1 sinew                           | injury chance halved                    |
| `fish`                  | +0.2 kg per catch                  | +0.5 kg per catch                       |
| `craft:hide*`, `craft:fur*` | one fewer sinew                | 10% less hide, rounded to 0.5 kg        |

Every other key is speed only. This table is the whole list; a key not in
it has no extra and the spec must be updated to give it one.

### 3.3 Display

Each action button carries a thin bar in the durability-bar style with the
mastery level as its label, `mastery 12`, filled to the share of the way to
the next mastery level.

## 4. Mastery pools

### 4.1 Filling

One pool per skill. Every mastery minute also adds one minute to the pool.
Capacity is 100 hours per mastery key the skill owns (6,000 minutes per
key), so Woodcraft holds 600 hours, Hunting 500, Foraging 200, Fishing 100,
Crafting 100 per recipe plus 200, Building 100 per structure plus 300. The
pool stops at capacity.

### 4.2 Checkpoints

A perk holds while the pool is at or above the share:

| share | perk                                                                  |
|-------|-----------------------------------------------------------------------|
| 10%   | work speed on the skill's tasks x 1.05                                |
| 25%   | tool wear on the skill's tasks x 0.5; Foraging and Fishing: yield x 1.2 |
| 50%   | work speed x 1.10 (replaces the 10% perk)                             |
| 95%   | no tool wear on the skill's tasks; Foraging and Fishing: yield x 1.5 (replaces 25%) |

Speed factors multiply: skill bonus x mastery bonus x pool perk x the
existing energy and injury factors. Wear factors multiply the same way and
floor at 0.

No spending from the pool in this cut. Buying mastery levels with pool
minutes, as Melvor allows, can be added later without changing the data.

### 4.3 Display

A Skills panel, below Worn and Tools in the left column, with six rows:

    Woodcraft  7      12 h 40 min to 8
    [=============-------]
    pool 14%  [==|=====|=====....|.....|]

The level bar fills with the share of the way from the current level's
hours to the next. The pool bar has tick marks at 10, 25, 50 and 95 and is
labelled with its percentage. A perk that is active is named under the bar
in the good colour.

## 5. Data and code

### 5.1 State

```ts
export type SkillId = "woodcraft" | "foraging" | "hunting" | "fishing" | "crafting" | "building";
export interface SkillState {
  /** Minutes of practice. */
  xp: number;
  /** Minutes of practice per mastery key. */
  mastery: Record<string, number>;
  /** Minutes in the pool, capped at capacity. */
  pool: number;
}
// on GameState:
skills: Record<SkillId, SkillState>;
```

Old saves get every skill at zero on load, the way bedding fields are
filled in `save.ts`.

### 5.2 Module `src/sim/skills.ts`

- `SKILLS`: id, name, and the list of mastery keys the skill owns (recipes
  and structures enumerated from `items.ts`, so a new recipe joins the pool
  capacity by itself).
- `skillOf(task): SkillId | null` and `masteryKey(state, world, task): string | null`.
- `level(minutes)`, `masteryLevel(minutes)`, `hoursToNext(...)`.
- `train(state, world, task, dt)`: the per-minute grant, called from
  `stepTask`. Logs level-ups and mastery extras as they cross.
- `speedFactor(state, world, task)`, `wearFactor(state, task)`,
  `oddsFactor(state, task)`, `yieldFactor(state, task)`: the multipliers
  the rest of the sim reads, each combining skill, mastery, pool and gap.
- `RECOMMENDED`: the table in 2.1, and `gap(state, task)`.

### 5.3 Hooks

- `workSpeed` in `player.ts` multiplies by `speedFactor`.
- `huntOdds` in `tasks.ts` multiplies by `oddsFactor`, before the 95% cap;
  fishing the same.
- `wearTool` calls on craft, repair, sharpen, chop and split scale by
  `wearFactor`, keeping fractional wear.
- The hunt and craft completions read the gap for injury and failure, and
  the mastery extras.
- `check` in `tasks.ts` appends the recommendation text and the build
  slowdown.
- `advance` already steps tasks minute by minute, so nothing changes for
  the away simulation.

### 5.4 UI

- `skillsHtml(state)` in `panels.ts`, rendered under the gear panel.
- `actionsHtml` adds the mastery bar to each option.
- The stats screen at death adds the highest skill and its level.

## 6. Tests

- Curves: level 1 at 0, 2 at 120 minutes, 10 at 9,720; mastery 20 at 5,415;
  caps hold.
- Training: sixty minutes of felling spruce adds sixty to Woodcraft,
  `chop:spruce` and the Woodcraft pool; walking adds nothing; a felling set
  aside keeps its minutes.
- Effects: Woodcraft 11 fells 10% faster than 1; Hunting 11 has 10% better
  odds; Crafting 11 wears the needle 10% less.
- Gates: elk at Hunting 1 shows one in 128 of the base odds and 85% injury;
  a bow at Crafting 1 fails with the right chance and loses half the
  materials; a cabin at Building 4 takes `1.3^6` times as long.
- Mastery extras: `chop:spruce` at 20 gives 5 sticks; `hunt:hare` at 20
  gives 0.3 kg hide.
- Pool: the capacity is 6,000 times the key count; 10% turns on x1.05; 50%
  replaces it with x1.10; the pool never exceeds capacity.
- Save: a save without `skills` loads with all six at zero.
- UI: the Skills panel lists six rows with level and hours; a hunt button
  under level carries the warning class and the recommendation; every
  option has a mastery bar.

## 7. Out of scope

- Spending pool minutes on mastery levels.
- New prey (wolves, bears). They will slot in as species with a recommended
  level and an injury chance.
- Skill-specific equipment or unlocks beyond the recommendations above.
