# Survidle: terrain colour, firelight and the torch

The map is glyphs on black. Water alone has a background in its own hue,
which is why it reads better than the rest of the ground. This spec gives
every terrain the same treatment, makes fire show on the map at night as
light rather than a letter, and adds a torch: a crafted, consumable light
you carry, with one real effect on the simulation.

Extends `2026-09-02-survidle-design.md` (the map, the sky's light, the
fire) and `2026-09-02-survidle-skills-design.md` (the torch joins the
skill tables). Everything below is in real quantities where it touches the
simulation, and in CSS where it touches the screen.

## 1. Terrain backgrounds

### 1.1 Colours

Every terrain glyph sits on a background of its own hue, dark enough that
the glyph still carries the shape and the background carries the colour
at a glance. Water keeps what it has.

| terrain | glyph colour (unchanged) | background |
|---------|--------------------------|------------|
| water   | #3a6fd8                  | #0a1633 (as today) |
| spruce  | #1f8f3a                  | #0b1f11    |
| pine    | #3fbf5a                  | #0e2415    |
| birch   | #9be36a                  | #1a2a12    |
| meadow  | #6f9a3c                  | #171f0f    |
| bog     | #2f9f8f                  | #0b221f    |
| rock    | #7a7f88                  | #1a1c20    |
| fell    | #b9bec8                  | #22252b    |

Under snow (`snowCm > 5`) the ground is white and the glyph colours already
change; the uniform snow background `#121a26` on every non-water cell stays
as it is, since snow covers the ground's colour in life too.

Fog, void, and the dim "seen from a distance" look are unchanged: fog and
void keep their own backgrounds, dim stays an opacity.

### 1.2 Highlights become overlays

Three highlights are painted as backgrounds today and would erase the
terrain colour: the current region (`.cur`, white at 7%), the selected
region (`.sel`, accent at 18%) and the route (`.rt`, accent at 22%). Each
becomes an inset box-shadow (`inset 0 0 0 20px`) plus a 1px inset outline
of the same colour, since the cell's transparent border would otherwise
show a seam; together they cover the 11 by 14 px cell and composite over
the terrain. The border colours for region edges are untouched.

### 1.3 Test

A test reads `src/style.css` and asserts that for every terrain in the
`Terrain` union there is a rule selecting `.grid .c.t-<terrain>` that sets
a `background`, and that `.cur`, `.sel` and `.rt` set no `background`.

## 2. Firelight at night

### 2.1 Sources and reach

A light source is a cell and a reach in rings:

| source | cell | reach |
|--------|------|-------|
| the camp fire, lit, fuel at or above `FIRE_LOW_KG` (3 kg) | the region's camp cell | 2 rings |
| the camp fire, lit, fuel under 3 kg (burning low) | the region's camp cell | 1 ring |
| a lit torch | the player's cell | 1 ring |

Every visited region's fire is a source, not only the one you stand in, so
your own camp is visible across the valley at night. Ring `d` of a source
is the set of cells at Chebyshev distance `d` from it, minus the four
corners of ring 2 (cells with `|dx| = |dy| = 2`), which rounds the glow. A
cell reached by two sources takes the nearer ring. Ring 0 is the source
cell itself.

### 2.2 When and at which zoom

The glow is drawn only while the calendar says night (`cal.isNight`), the
same flag that already toggles the grid's `night` class and sits in the
map key. Dawn and dusk stay unlit; the sky's own tint covers them.

| zoom (cells per glyph) | what is drawn |
|------------------------|---------------|
| 1                      | rings 0, 1 and 2 |
| 3                      | ring 0 only, on the glyph that holds the source cell |
| 9 and the whole north  | nothing new; the `F` marker itself animates (2.4) |

### 2.3 Markup

`mapHtml` computes the lit cells from the sources and adds one of the
classes `lit-0`, `lit-1`, `lit-2` to the cell's span. Every lit cell also
gets an inline `style="--fd:<seconds>"`, a negative animation delay
between 0 and 1.1 s taken from a hash of the glyph index, so neighbouring
flames are out of step and a re-render at the same view gives the same
pattern. The source cell keeps its marker (`F` for a fire, `@` when you stand on it or
carry the torch); the marker's background takes the flame animation.

The map key gains, per region, whether the fire is low (`f` beside `F`),
and whether the player's torch is lit, so the glow appears and disappears
on change without re-rendering per frame.

### 2.4 Style

Night on the grid today is a `brightness()` and `saturate()` filter on the
whole grid plus a hard-light colour tint painted in `.grid::after`. A
filter reaches every child, so a glow drawn on cells would be darkened
with the rest. The darkening moves off the filter:

- The grid gets one more child, `<i class="shade"></i>`, absolute over the
  whole grid, black, `opacity: calc(1 - var(--bright))`, no pointer
  events. `filter: brightness()` is removed; `saturate(var(--sat))` stays,
  since a desaturated orange still reads as fire.
- The source cell and the markers are positioned with a z-index above the
  shade and the tint (markers were already above the tint, and were
  dimmed only by the old brightness filter, so they now read bright at
  night by design). Ring cells stay under the shade; each ring cell's
  `::after` overlay is what rises above it, so the ring reads as light on
  dark ground rather than a square of daylight. A cell that is dim (seen
  from afar) keeps its opacity.

Colours, applied only under `.grid.night`:

| class   | background                                   | glyph colour |
|---------|----------------------------------------------|--------------|
| `lit-0` | animates between #ff7a1a and #ffb84d         | white (the marker's) |
| `lit-1` | rgba(255, 140, 40, a), a animating 0.35..0.55 | the terrain's own, seen through the overlay |
| `lit-2` | rgba(255, 120, 30, a), a animating 0.12..0.22 | the terrain's own |

One keyframe animation, `flicker`, 1.1 s, `alternate`, `ease-in-out`,
infinite, on `background-color`; each cell's `animation-delay` is its
`--fd`. At zooms of 9 cells per glyph and beyond, `.grid.night .mk-fire`
runs the same animation on its background, so a distant fire pulses.

The ring backgrounds sit over the terrain background from section 1, so
firelit spruce still reads as spruce through the orange.

### 2.5 Tests

`mapHtml` at zoom 0, at night, with the player at camp:

- fire lit with 10 kg: the player's glyph has `lit-0`; its 8 neighbours
  `lit-1`; ring 2 has 12 cells with `lit-2` (16 minus the 4 corners); 21
  lit cells in all, each with a `--fd` style.
- fire lit with 2 kg: 9 lit cells.
- fire out: no lit cells.
- the same fire by day: no lit cells and no `night` class.
- zoom 1 (3 cells per glyph): exactly one lit cell, `lit-0`.
- a lit torch with the player at the forest and no fire: 9 lit cells
  around the player, the player's glyph `lit-0` with the `@` marker.
- torch lit and standing on the lit fire: still 21 cells, no cell with two
  `lit-` classes.

`updateSky` at night sets `--bright` to 0.55 as today; a test asserts the
grid contains the `shade` element and that `.grid` no longer declares
`brightness(` in its filter (read from `style.css`).

## 3. The torch

### 3.1 Item and recipe

- `torch`: a count item, 0.4 kg, named "torches" in lists.
- Recipe `torch`: 1 stick, 2 bark, 20 minutes, no tool, makes 1 torch.
  Repeatable. It joins Crafting's mastery keys as `craft:torch` by way of
  `RECIPE_IDS`, and Crafting's pool capacity grows by 100 hours with it.

### 3.2 Lighting one

A task `lightTorch`, in the Camp group, "Light a torch":

| condition | duration | note |
|-----------|----------|------|
| at camp with the fire lit | 1 minute | lit from the fire |
| anywhere with a fire drill | 10 minutes | the drill wears 1 point |
| neither | refused: "needs a fire or a fire drill" | |
| no torch in reach | refused: "needs a torch" | pack or the pile here |
| a torch already burning | refused: "a torch is already burning" | |

Completion consumes one torch and sets the player's torch to lit with 60
minutes of burn (`TORCH_BURN_MINUTES = 60`). The task is carried work like
`light`: set aside, it keeps its share in your hands. It trains Building
under the mastery key `lightTorch`, which joins `MASTERY_KEYS.building`
(Building's pool capacity grows by 100 hours).

### 3.3 Burning

`Player.torch: { lit: boolean; minutes: number }`, minutes of burn left.
`stepPlayer` takes `dt` off it while lit; at zero it goes out with the log
line `The torch gutters out.` It burns while you sleep, walk or work, in
rain or snow; there is no putting it out early. Old saves load with
`{ lit: false, minutes: 0 }`.

### 3.4 What it does

- On the map: a light source of reach 1 at the player's cell (section 2).
- Walking: the night speed penalty (`x0.75` in `baseWalkSpeed`) does not
  apply while a torch is lit. Deep snow and load still do.
- Wolves: the hourly wolf roll skips a player with a lit torch, or at a lit
  fire at camp, the same way it skips a sheltered player. Fire is what
  keeps wolves off in the north, and the game has both fires now.
- Nothing else. Gathering is not gated by night today, so a torch unlocks
  nothing there, and hunting at night stays penalised: a torch is the last
  thing that helps a stalk.

### 3.5 UI

- The Camp tab shows "Light a torch" with the usual why-text when it is
  refused.
- The stats panel shows a tag `torch lit, 42 min` while it burns, next to
  the other status tags.
- Torches appear in pack and pile lists by count like sticks.

### 3.6 Tests

- Recipe: 1 stick and 2 bark make a torch in 20 minutes; `craft:torch` is
  in `MASTERY_KEYS.crafting`; `lightTorch` in `MASTERY_KEYS.building`.
- Lighting: at a lit fire the option lasts 1 minute; with a drill away
  from camp, 10 minutes and the drill loses a point; with neither it is
  refused with the given text; with a torch already lit it is refused.
- Burning: after 60 minutes the torch is out and the log has the line;
  minutes never go below 0.
- Speed: at night `baseWalkSpeed` is 2.25 km/h without a torch and 3.0
  with; by day 3.0 either way.
- Wolves: 500 seeded night hours outside shelter with a lit torch produce
  no wolf line; the same without one produce some.
- Saves: a save without `player.torch` loads with it unlit.
- Reachability: the existing "everything has a button" tests pick up the
  `torch` recipe and the `lightTorch` task by way of the catalogues.

## 4. Code

| file | change |
|------|--------|
| `src/style.css` | terrain backgrounds; highlights as inset box-shadows; the `shade` layer; `lit-0/1/2` colours and the `flicker` keyframes; the distant-fire pulse |
| `src/ui/map.ts` | light sources and rings; `lit-` classes and `--fd`; the `shade` child; the map key additions |
| `src/ui/sky.ts` | stops setting a brightness filter (the variable is still set; the shade reads it) |
| `src/sim/types.ts` | `torch` in `CountItem`; `lightTorch` in `TaskId`; `torch` in `RecipeId`; `Player.torch` |
| `src/sim/items.ts` | `ITEM_KG.torch`, `ITEM_NAMES.torch`, the `torch` recipe, `TORCH_BURN_MINUTES` |
| `src/sim/tasks.ts` | `lightTorch` in `check`, `complete`, `CARRIED`, `WORK_TASKS`, `availableTasks` |
| `src/sim/player.ts` | the burn in `stepPlayer`; the night speed rule in `baseWalkSpeed`; `activityOf` treats `lightTorch` as rest |
| `src/sim/events.ts` | the wolf skip |
| `src/sim/skills.ts` | `lightTorch` in `skillOf`, `masteryKey` and `MASTERY_KEYS.building` |
| `src/sim/newgame.ts`, `src/sim/save.ts` | the unlit torch on a fresh run and on load |
| `src/ui/panels.ts` | the torch tag in `statsHtml` |
| `docs/README.md` | a line under Camp for the torch, and under the map for the colours |
| tests | as listed per section |

Order of work: section 1 (pure CSS plus its test), then section 2 with the
camp fire as the only source, then section 3, then the torch as a second
source. Each step ships on its own.

## 5. Out of scope

- Light by day, or at dawn and dusk.
- Putting a torch out, or a torch as a weapon.
- Lanterns, candles, tallow: later light sources would be new rows in the
  source table with a cell and a reach.
- Any change to the sky strip.
