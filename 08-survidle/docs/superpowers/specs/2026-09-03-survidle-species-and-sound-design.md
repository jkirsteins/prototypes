# Survidle: a species catalogue, and the sound of the place

Today the north has five animals, every region has all five in amounts set
only by its terrain shares, fish is one species, and the game is silent.
This spec replaces the five with a catalogue of about thirty species that
have ranges, seasons, calls and their own yields; lets the player hunt or
fish for a chosen species or for whatever is about; makes wolves a
population that drives the night danger; and adds sound: ambience beds for
the ground under foot and the weather, calls from the species that live
here at the hours they call, and the sound of the work.

Extends `2026-09-02-survidle-design.md`, `2026-09-02-survidle-skills-design.md`
and `2026-09-03-survidle-body-and-elements-design.md`. In the realism
roadmap's build order it lands right after A, standing orders, as the base
of sub-project 4 and the animals rung of C.

## Decisions confirmed with the author

- **Species are catalogue-driven.** One catalogue entry per species holds
  its habitat, range, season, hunt parameters, yields and calls. Region
  generation, hunting, fishing, skills, the region panel and the sound all
  read the catalogue. Adding a species is one entry.
- **Wolves are a population, huntable, and the night hazard.** Wolf
  density drives the attack chance and the howls; no wolves, safe nights.
  A high-level hunter can take one for a large fur.
- **Hunt and fish by target or by whatever is about.** "Hunt anything" and
  "Fish for anything" are always offered; each species living in the region
  has its own row, greyed with a reason when none are about now; a species
  that never lives here has no row.
- **Sound is a read-only layer.** The sim exposes pure queries and a cue
  sink for one-shots. The audio layer schedules on real seconds with its own
  randomness. The sim's seeded rng is never consumed for sound, so seeded
  tests and offline catch-up are unchanged.
- **Silence over a wrong sound.** A slot with no fitting recording stays
  silent and the manifest says so. Non-CC0 recordings are allowed in this
  prototype and are flagged for replacement.
- **Ambience is on by default, with its own toggle.** The 06-dueling
  ambience bed came out the same day it went in, so the toggle is visible.

## 1. The catalogue

`src/sim/species.ts` replaces `ANIMALS` in `items.ts` and `SPECIES` in
`types.ts`. `Species` becomes the union of the catalogue's keys.

```ts
export type Habitat = Exclude<Terrain, "water"> | "lake" | "sea";
export type SpeciesClass = "mammal" | "bird" | "fish";

export type SeasonRule =
  | { kind: "resident"; /** capacity factor December to February */ winter?: number }
  /** Present from the arrive month to the month before leave, 0-based; absent otherwise. */
  | { kind: "migrant"; arrive: number; leave: number };

export interface Call {
  /** Slot in the audio manifest. */
  sound: string;
  when: "day" | "night" | "dawn" | "dusk" | "any";
  /** 0-based inclusive month range; absent means all year. */
  months?: [number, number];
  /** Relative frequency among a region's open calls. */
  weight: number;
}

export interface SpeciesDef {
  name: string;
  kind: SpeciesClass;
  /** Individuals per km2 of each habitat at full occupancy. Absent means none. */
  habitat: Partial<Record<Habitat, number>>;
  /** Share of suitable regions the species occupies, 0..1. */
  range: number;
  season: SeasonRule;
  /** Daily logistic growth rate for residents. */
  growth: number;
  /** Absent for voice-only species. */
  hunt?: {
    spot: SpotId;
    minutes: number;
    odds: number;
    injury: number;
    /** Recommended Hunting or Fishing level; absent means none. */
    level?: number;
    /** Odds factor at night; 0.7 when absent. */
    night?: number;
  };
  yields?: { meatKg: number; hideKg?: number; furKg?: number; fatKg?: number; bone?: number; sinew?: number };
  calls?: Call[];
}
```

A migrant rule may say how its absence reads: `away: "gone" | "denned"`,
"gone" when absent, so the bear's row says "denned until April".

`hunt.spot` is `forest`, `heath`, `outcrop` or `shore`; a fish's is always
`shore` and its habitat says which water. The `spot` decides which ground
an intent walks to, as `groundOf` in `intent.ts` does today.

### 1.1 The roster

Numbers are per km2 of that habitat. Meat, hide and fur are kilograms.

Mammals. Fur-bearers yield fur; deer and bigger yield hide.

| id | name | habitat | range | season | hunt (spot, min, odds, injury, level) | yields |
|---|---|---|---|---|---|---|
| hare | mountain hare | meadow 20, birch 16, bog 8, pine 4, fell 3 | 1.0 | resident | heath, 90, 0.6, 0 | meat 1.2, fur 0.2, bone 1 |
| squirrel | red squirrel | spruce 12, pine 10, birch 4 | 0.9 | resident | forest, 60, 0.5, 0 | meat 0.2, fur 0.1 |
| fox | red fox | meadow 1.5, birch 1.2, pine 1, spruce 1, bog 0.8, rock 0.5, fell 0.3 | 0.95 | resident | heath, 150, 0.3, 0, level 3 | meat 3, fur 1, bone 2, sinew 1 |
| beaver | beaver | lake 4 (only where birch or meadow is also present, see 2.1) | 0.5 | resident | shore, 150, 0.4, 0, level 3 | meat 10, fur 1.5, fat 2, bone 2, sinew 1 |
| deer | roe deer | birch 6, meadow 5, pine 3, spruce 2 | 0.7 | resident, winter 0.6 | forest, 180, 0.45, 0, level 4 | meat 12, hide 3, fat 1, bone 4, sinew 3 |
| reindeer | wild reindeer | fell 3, rock 2, bog 1.5, pine 1 | 0.6 | resident | outcrop, 200, 0.4, 0.05, level 6 | meat 40, hide 5, fat 4, bone 5, sinew 4 |
| elk | elk | spruce 1.0, bog 0.8, birch 0.5, pine 0.3 | 0.8 | resident, winter 0.6 | forest, 240, 0.3, 0.15, level 8 | meat 150, hide 20, fat 8, bone 8, sinew 6 |
| wolf | wolf | spruce 0.08, pine 0.06, bog 0.05, birch 0.04, fell 0.02 | 0.35 | resident | forest, 240, 0.25, 0.35, level 12 | meat 25, fur 3, fat 1, bone 6, sinew 4 |
| wolverine | wolverine | fell 0.03, spruce 0.03, rock 0.02, bog 0.02 | 0.4 | resident | outcrop, 240, 0.2, 0, level 10 | meat 8, fur 1.5, bone 3, sinew 2 |
| bear | brown bear | spruce 0.15, pine 0.1, bog 0.1, birch 0.08 | 0.5 | denned November to March (the migrant rule, April to October) | forest, 300, 0.25, 0.5, level 15 | meat 80, fur 8, fat 10, bone 8, sinew 5 |

The hare's hunt has a night odds factor of 0.9: hares move at dusk and
dawn, so darkness costs the hunter less than the 0.7 the others take.

Fat is in kilograms like meat, and the roadmap's calorie rule holds: it
is a food at 9000 kcal per kilogram, a 0.1 kg portion, never sickening,
last in the auto-eat order so it is kept. It does not spoil. E's tanning
and 3's tallow light take it from here.

Bear and wolverine are populations that do nothing yet: they are hunted,
listed and counted so that the roadmap's sub-project 4 has them to make
act (raids on the rack and the pile, attacks by day). A denned bear is
absent the way a migrant is; the same rule expresses both.

Game birds. All hunted with the bow from the `heath` or `forest` spot; the
sea birds from the `shore`.

| id | name | habitat | range | season | hunt | yields |
|---|---|---|---|---|---|---|
| willowGrouse | willow grouse | bog 12, birch 8, meadow 4, fell 2 | 0.9 | resident | heath, 60, 0.6, 0 | meat 0.4 |
| ptarmigan | rock ptarmigan | fell 8, rock 5 | 0.8 | resident | outcrop, 60, 0.55, 0 | meat 0.35 |
| blackGrouse | black grouse | birch 5, meadow 4, bog 3, pine 2 | 0.7 | resident | heath, 90, 0.5, 0 | meat 0.8 |
| capercaillie | capercaillie | spruce 3, pine 3 | 0.5 | resident | forest, 120, 0.4, 0, level 2 | meat 2.5 |
| hazelGrouse | hazel grouse | spruce 6, birch 2 | 0.6 | resident | forest, 60, 0.5, 0 | meat 0.3 |
| mallard | mallard | lake 10 | 0.8 | migrant, April to September | shore, 60, 0.5, 0 | meat 0.8 |
| eider | eider | sea 15 | 0.9 | resident | shore, 90, 0.45, 0 | meat 1.5 |
| goose | bean goose | bog 3 | 0.5 | migrant, April to September | heath, 120, 0.3, 0, level 3 | meat 2.5 |

Voice-only birds. No `hunt`, no `yields`; they are on the roster to be
heard and listed.

| id | name | habitat | range | season | calls |
|---|---|---|---|---|---|
| loon | black-throated loon | lake 2 | 0.7 | migrant, May to September | `loon` dusk and night, weight 3 |
| cuckoo | cuckoo | birch 3, pine 2, spruce 1 | 0.8 | migrant, May to July | `cuckoo` day and dawn, weight 3 |
| raven | raven | fell 1, rock 1, spruce 0.3 | 0.9 | resident | `raven` day, weight 2 |
| owl | Ural owl | spruce 0.5, pine 0.3 | 0.5 | resident | `owl` night, weight 2, months February to May stronger (weight 4) |
| crane | crane | bog 1.5 | 0.5 | migrant, April to September | `crane` dawn and day, weight 2 |
| woodpecker | great spotted woodpecker | spruce 2, pine 2, birch 2 | 0.8 | resident | `woodpecker` day, months March to May, weight 2 |

Calls of the hunted species: `capercaillie` display at dawn, March to May;
`blackGrouse` lek at dawn, March to May; `willowGrouse` dawn and dusk;
`ptarmigan` day; `mallard` day; `eider` day; `goose` flyover any hour, April
and September to October, weight 3; `elk` bellow dusk and night, September to
October; `wolf` night (section 4.3); `fox` night, December to February;
`squirrel` day, weight 1; `hare` none.

Lake fish. Habitat `lake`; hunted from the shore of a lake.

| id | name | lake | range | season | odds, level, night | meat kg |
|---|---|---|---|---|---|---|
| perch | perch | 40 | 0.9 | resident | 0.6 | 0.3 |
| roach | roach | 40 | 0.6 | resident | 0.7 | 0.2 |
| pike | pike | 8 | 0.8 | resident | 0.35, level 3 | 2.0 |
| whitefish | whitefish | 20 | 0.6 | resident | 0.5, level 2 | 0.6 |
| char | arctic char | 15 | 0.3 | resident | 0.45, level 4 | 0.8 |
| trout | brown trout | 12 | 0.5 | resident | 0.4, level 3 | 0.7 |
| burbot | burbot | 10 | 0.5 | resident, winter 1.5 | 0.4, level 2, night 1.3 | 1.2 |

Sea fish. Habitat `sea`.

| id | name | sea | range | odds, level | meat kg |
|---|---|---|---|---|---|
| cod | cod | 30 | 0.9 | 0.5, level 2 | 2.5 |
| saithe | saithe | 25 | 0.7 | 0.5 | 1.5 |
| herring | herring | 60 | 0.6 | 0.8 | 0.15 |

Every fish: `spot: "shore"`, 60 minutes, injury 0, `growth` 0.003. Mammal
growth as today (hare 0.006, deer 0.0012, elk 0.0006); squirrel 0.006, fox
0.002, beaver 0.001, reindeer 0.0008, wolf 0.0005. Birds 0.005. Voice-only
species use growth 0.005 and are never reduced, so they sit at capacity.

### 1.2 Fur and fat

Two new kilogram items, `fur` and `fat` (1 kg per unit). Fur-bearers yield
fur where they yielded hide. The fur hat and fur mittens need `fur` with
`hide` as the alt; the hide blanket needs `hide` with `fur` as the alt. The
`Need.alt` field already exists and `consume` already honours it. Hide
recipes are otherwise unchanged. `CLOTHING.material` stays `"hide"` for fur
pieces: wetting and drying do not distinguish them.

## 2. Regions

### 2.1 Water kinds and capacity

`RegionDef.frac` keeps `water`; `RegionDef` gains `lake` and `sea`, the
shares of the region's cells that are lake water and sea water. A water
cell is sea when `fieldsAt(seed, x, y).sea` is true. `buildRegion` counts
them in the same scan that counts terrain. `frac.water === lake + sea`.

Capacity per species:

    raw = area * sum over habitats h of share[h] * habitat[h]
    u   = clamp(0.5 + (fbm(cx / 84, cy / 84, derive(seed, 2000 + speciesIndex), 2) - 0.5) * 2, 0, 1)
    present = ground > 0.02 and raw >= 0.5 and u >= 1 - range
    heart   = (u - (1 - range)) / range                                   in 0..1 when present
    capacity = present ? raw * (0.5 + heart) : 0

`u` is the range noise stretched around a half by a factor of 2, because
fbm clusters near a half: unstretched, a range of r covers far less than r
of the country. `ground` is the sum of the shares of the species' own
habitats; the floor of 0.02 says how thin a habitat may be before the
species is not worth listing, so two pine cells on a bare fell are not a
pine wood.

`cx, cy` are the region's centroid in cells, so 84 cells is about 25 km:
ranges are patches a few regions wide, and neighbouring regions mostly
share a roster. A species is densest in the heart of its range and thin at
the edge. `speciesIndex` is the species' position in the catalogue's key
order, which is therefore load-bearing: reordering the catalogue redraws
every range. The beaver's `raw` is multiplied by `min(1, 4 * (frac.birch +
frac.meadow))`, the "only where" condition in the table.

`RegionDef.capacity` becomes `Partial<Record<Species, number>>`; absent
means never here. `speciesHere(region)` lists the keys with capacity.
`SPECIES_IDS`, the catalogue's keys in order, replaces the `SPECIES` array
wherever the sim iterated it.

The existing hare, grouse, deer, elk and fish formulas go; `willowGrouse`
is the grouse the old world had.

### 2.2 Population

`RegionState.pop` becomes `Partial<Record<Species, number>>`, keyed only by
the species with capacity, initialised at 70 percent of capacity as today.
`popOf(st, s)` returns 0 for a missing key.

`seasonalCapacity` reads the season rule: a resident's capacity times its
`winter` factor in winter; a migrant's capacity inside its months and 0
outside. Lake species (`habitat.lake`, birds only: mallard, loon) have
capacity 0 while `weather.iceCm >= ICE_THIN_CM`; fish are reached through
the ice as today.

`dailyAnimals`:

- Residents grow logistically as today, and winter thins a herd over
  capacity as today.
- Migrants do not grow. Each day `pop += (K_season - pop) * 0.1`: they
  arrive over a few weeks in spring, leave in autumn, and a hunted flock is
  replaced by next year's.
- Voice-only species are set to `K_season` daily.
- Migration between touched neighbours as today, for mammals only. Birds
  and fish do not shuffle.
- The "tracks are fresher" and "have moved on" log lines apply to deer,
  reindeer, elk and wolf.

### 2.3 Wolves and the night

In `hourlyEvents`, the wolf roll becomes

    chance = 0.02 * wolfDensity * (winter ? 2 : 1)

where `wolfDensity` is `regionDensity` of `wolf` here. A region with no
wolves has no attack. The rest of the roll (night, unsheltered, no fire or
torch, the wound, the death) is unchanged. `densityLabel` for wolves reads
"tracks" at the same thresholds; the region panel puts the wolf line under
"Game" like the others.

## 3. Hunting and fishing

### 3.1 Targets and "anything"

`TaskId` `hunt` takes `arg` as a species id or `"any"`. `fish` takes `arg`
as a species id or `"any"`; the old arg-less fish is gone and every caller
passes one.

`availableTasks` emits, in this order: `hunt any`, one `hunt` per non-fish
hunted species with capacity in the player's region (mammals then birds,
catalogue order), `fish any`, one `fish` per fish species with capacity in
the region. A species with no capacity here has no row at all.
`INTENT_GROUPS.Hunt` is built the same way from the region, so it is
computed per render instead of being a constant.

A row's legality, in order of the reasons given:

1. The ground: `hunt` wants the species' spot; `fish` wants a waterside
   cell of the right water. `watersideCell(world, at, kind)` takes `kind`
   as `"lake"`, `"sea"` or `"any"`; `waterKindOf(world, cell)` returns
   `"lake"` or `"sea"` for a water cell from `fieldsAt`. "Fish for perch"
   at a sea shore says "no perch in salt water". `hunt any` is legal on
   any ground that suits at least one hunted species with `pop >= 1`, and
   draws only among the species whose spot suits the cell under foot; as an
   intent it walks to the `forest` spot when the ground here suits none.
   `fish any` wants any waterside cell and draws from that water's kind.
2. The tool: bow and an arrow for `hunt`, the spear for `fish`.
3. The animal: `popOf(st, s) < 1` says "no <name> here now"; a migrant out
   of season says "gone until <month>"; a lake bird on ice says "the
   lake is frozen". For `any`: nothing huntable with `pop >= 1` says
   "nothing about".

Odds and duration on the row are the species' own. `hunt any` shows
"whatever is about; <n> kinds here" and a duration of 120 minutes as its
estimate.

### 3.2 Resolving "anything"

`beginTask` for `hunt any` or `fish any` draws the species met, weighted by
`density * hunt.odds` over the species with `pop >= 1` and the right
ground, using the sim rng, and starts the task with that species as its
`arg` and its `minutes`, and `Task.any = true`. The label reads "Hunting
hare (whatever was about)" and the log says "Fresh sign: a hare." or "A
swirl under the bank: perch." A repeating task or an intent re-draws on
each start. So mastery accrues to the species actually stalked from the
first minute, and the runner's `intent.arg` stays `"any"`.

Completion is the existing hunt or fish branch with `arg` the drawn
species. The fish branch produces `fish` in kilograms of `yields.meatKg`
times the mastery factor times `yieldFactor(fishing)`; the log names the
species: "A pike, 2.3 kg."

Snares are unchanged: they catch hares, and only where hares have capacity.

### 3.3 Skills

`MASTERY_KEYS.hunting` is `hunt:<s>` for every hunted non-fish species plus
`snare`; `MASTERY_KEYS.fishing` is `fish:<s>` for every fish. `masteryKey`
returns `hunt:<arg>` and `fish:<arg>` (the arg is the drawn species for
"anything"). `poolCapacity` counts at most six keys for Hunting and three
for Fishing, so a roster of seventeen does not push the pool perks out of
reach: Hunting's capacity stays near today's 500 hours, Fishing's goes from
100 to 300 hours because the one key it had is now ten. Woodcraft, Crafting
and Building count their keys as today.

`RECOMMENDED` is built from `hunt.level`. `oddsFactor` and `gap` key on
`hunt:<s>` and `fish:<s>`.

`EXTRAS`, by class:

- Fur-bearers (hare, squirrel, fox, beaver, wolverine): at 20 "the pelt
  comes off whole, half again the fur"; at 50 "a bone more".
- Big game (deer, reindeer, elk, wolf, bear): at 20 "a sinew more"; at 50
  "half the chance of a hurt". As today. The rule that sorts a mammal: an
  injury chance above 0 or a hide yield makes it big game; otherwise a fur
  yield makes it a fur-bearer.
- Game birds: at 20 "an arrow is never lost on a miss"; at 50 "a quarter
  better odds".
- Fish: at 20 "a third more per catch"; at 50 "two thirds more per catch".
  This replaces the flat 0.2 and 0.5 kg of the one-species fish.

`huntExtras` implements the first three; `fishKg(state, species)` the
last. `keyName` reads names from the catalogue for `hunt:` and `fish:`.

Old saves keep a `fish` mastery key and `hunt:grouse` in `skills.*.mastery`.
They are left in place, count for nothing, and are not shown; the skills
panel iterates `MASTERY_KEYS`, not the stored keys.

### 3.4 The region panel

The animals line becomes four lines, each listing only species with
capacity here, in catalogue order:

    Game: elk some, roe deer few, hare many, wolf tracks
    Birds: capercaillie few, willow grouse many, mallard gone until April
    Fish: perch many, pike some, burbot few
    Heard: loon, cuckoo, raven

"Heard" lists voice-only species, with "(from May)" after a migrant out of
season. Lines with nothing to list are omitted.

## 4. Sound

### 4.1 Files and the manifest

Recordings live in `08-survidle/public/audio/` as Ogg (Opus or Vorbis),
48 kHz, mono, one-shots peaking at about -4 dBFS, loops with a 2 second
crossfade region so they seam. `public/audio/manifest.md` documents every
file: source URL, author, licence, processing, duration, intended slot.
Non-CC0 files are listed under a heading "Replace before distribution".
Every slot the design names but no file fills is listed under "Silent
slots" with a note on what was tried.

Sources, in order of preference: CC0 packs (Kenney, OpenGameArt), then
freesound previews and xeno-canto recordings for species calls, which are
almost all CC BY or CC BY-NC and therefore go under "Replace before
distribution". Species calls must be the named species or its nearest
relative; a generic "bird" is a silent slot.

`src/audio/manifest.ts` maps slot names to files and kinds:

```ts
export type Slot = string;
export interface SlotDef { files: string[]; kind: "loop" | "oneshot"; gain: number }
export const SLOTS: Record<Slot, SlotDef>;
```

A slot with several files plays them round-robin with a few percent of
playback rate jitter.

### 4.2 The engine

`src/audio/engine.ts`, the only file that touches Web Audio. Buses:
`master` holding `ambience`, `flavour` and `action`. `ambience` runs
through a lowpass filter that opens fully outdoors and closes to 600 Hz
indoors. The context is created on the first click or keydown; until then
the header control reads "sound: click to start". A hidden tab pauses the
ambience loops and resumes them on return; nothing is heard while the away
overlay is up.

```ts
export interface AudioEngine {
  unlock(): void;
  /** Once per rAF: fade every loop toward its target gain over 2 s. */
  setLoops(targets: Record<Slot, number>, indoors: boolean): void;
  /** delay is real seconds before the sound starts: a thunderclap after its flash, later. */
  play(slot: Slot, opts?: { gain?: number; pan?: number; rate?: number; delay?: number }): void;
  settings(): AudioSettings;
  update(s: Partial<AudioSettings>): void;
}
export interface AudioSettings { volume: number; muted: boolean; ambience: boolean }
```

Settings persist in `localStorage` under `survidle.audio`, separate from
the save. Defaults: volume 0.7, not muted, ambience on. The control is a
"Sound" button (mute), a range input, and an "ambience" checkbox in a
static `<div id="sound">` in `index.html` above the clock panel, owned by
the audio layer and never redrawn by `render` (a panel redraw would drop
the slider mid-drag). The checkbox silences the ambience and flavour buses
and leaves the action bus.

Assets are fetched relative to `import.meta.env.BASE_URL` so the branch
preview and the Pages build both find them. A file that fails to decode
logs one warning and its slot is silent.

### 4.3 What the sim tells the audio

`src/sim/soundscape.ts` is pure and tested. It exports:

```ts
export interface Surroundings {
  /** Shares of the 5x5 cells around the player. forest is spruce, pine and birch; open is fell, rock, meadow and bog; bog is also given alone. */
  forest: number; birch: number; open: number; lake: number; sea: number; bog: number;
  footing: "leaves" | "grass" | "bog" | "rock" | "snow" | "ice";
  frozen: boolean;
  fire: "none" | "torch" | "low" | "fed";
  indoors: boolean;
  rain: "none" | "light" | "heavy";
  storm: boolean;
}
export function surroundings(state: GameState, world: World, cal: Calendar, ambient: number): Surroundings;

/** Ambience loop targets, 0..1 by slot, from the surroundings, season and hour. */
export function ambienceMix(s: Surroundings, cal: Calendar, ambient: number): Record<Slot, number>;

export interface OpenCall { slot: Slot; /** calls per real minute at density 1 */ rate: number }
/** Every call whose species lives here above "tracks" and whose window is open now. */
export function openCalls(state: GameState, world: World, cal: Calendar): OpenCall[];

/** The repeating sound of the current task, or null. */
export function activityLoop(state: GameState, s: Surroundings): { slot: Slot; period: number } | null;
```

Footing: snow when `snowCm >= 5`; ice on a water cell; bog on bog; rock on
rock and fell; grass on meadow; leaves in forest. Windows: dawn is sunrise
minus one hour to sunrise plus three; dusk is sunset minus two to sunset
plus one; day and night follow `cal.isNight`; a species' `months` gate it.
The wolf howl's rate is `0.6 * wolfDensity * (0.3 + 0.7 * moonIllumination)`
per real minute, so a full moon over wolf country howls every couple of
minutes and a new moon rarely. Other calls: `rate = 0.5 * weight * density`.

Ambience targets: `forest` from the forest share; `leaves` from the birch
share, May to September; `open` from the open share, doubled in a storm;
`lake` from the lake share when not frozen; `sea` from the sea share;
`rain` light or heavy when raining and ambient above 0; `fire` 0.5 for a
torch, 0.7 for a low fire, 1 for a fed one, from `fire`; `chorus` in forest
and birch, May to July, in the dawn window; `insects` on bog and meadow
shares, June to August, 18:00 to 23:00, ambient above 10. Winter is what is
left when these fall away: the open and forest wind.

Activity loops: `walk` plays `step_<footing>` every 0.6 s; `chop` plays
`axe` every 1.5 s; `split` plays `axe` every 2 s; `craft` of a stone tool
plays `knap` every 1.2 s; everything else is silent.

### 4.4 Cues

`src/sim/cues.ts`:

```ts
export type Cue =
  | "treeFalls" | "arrow" | "spear" | "fireCatches" | "torchLit"
  | "iceCracks" | "fallThrough" | "toolBreaks" | "wolves";
export function cue(c: Cue): void;
export function setCueSink(fn: ((c: Cue) => void) | null): void;
```

The sim calls `cue` at: chop completion (`treeFalls`), a hunt attempt
resolving (`arrow`), a cast resolving (`spear`), a fire or torch lit, a
thin-ice cell crossed, a fall through the ice, a tool breaking, and the
wolf attack. `main.ts` installs the engine as the sink at boot and sets it
to null around `catchUp`, so a night away does not play at dismiss. The
sink is module-global: the roadmap's risk forecast (B) must run `advance`
in a worker or with the sink set to null, or its rehearsed nights would
sound.

### 4.5 The scheduler

`src/audio/soundscape.ts` runs from `frame` in `main.ts` once per rAF with
the state, world and calendar. It computes `surroundings` and `ambienceMix`
and hands the targets to `setLoops`; runs the activity loop's period on
real time; and, every 250 ms, rolls `Math.random()` against each open
call's rate. At most one call starts per 4 seconds, at a random gain of 0.3
to 1 and a random pan, so the same loon is near or far. The catalogue's
species index seeds nothing here: this layer is not deterministic and is
not meant to be.

### 4.6 The moon

`calendar.ts` gains

```ts
export function moonPhase(minute: number): number;        // 0 new, 0.5 full, 0..1
export function moonIllumination(minute: number): number; // 0..1
```

on a synodic month of 29.530588 days, phase 0 at day index -12.4 so the
first full moon of a run is on 3 April, and illumination
`(1 - cos(2 pi phase)) / 2`. `Calendar` carries both. The sky strip draws
the moon as today with a second disc of the sky colour laid over it, offset
by `2 r (1 - illumination)` to the left before full and to the right after,
so the crescent reads. The moon has no effect on play; only on the howls
and the sky.

## 5. Saves

`SaveFile.version` stays 3. `fillDefaults`:

- For every region in `state.regions`, delete `pop.fish` and `pop.grouse`,
  and for every species with capacity in the region and no `pop` entry set
  it to 70 percent of capacity.
- `state.task` and `state.intent` with `id: "fish"` and no arg get
  `arg: "any"`; with `id: "hunt"` and `arg: "grouse"` get `arg:
  "willowGrouse"`. A `paused` entry the same.

Regions are rebuilt from the seed on load, so capacity needs no migration.

## 6. Tests

`tests/species.test.ts`:

- Every species has at least one habitat weight above 0, and every hunted
  species has yields with meat.
- Over seeds 1 to 20, every species has capacity in some region and is
  absent from some region with its habitat (ranges vary).
- A region with `frac.fell >= 0.8` never has capercaillie, hazel grouse,
  cuckoo, squirrel or any lake fish; a region with `sea > 0` and `lake
  === 0` has no perch; a region with no water has no fish.
- Migrants have capacity 0 in January and their catalogue capacity in
  June; a lake bird has capacity 0 with `iceCm` 10.
- `dailyAnimals` brings a migrant from 0 to over half its capacity in 10
  days of its season, and back under a tenth in 30 days after it leaves.
- The wolf roll never fires where wolf capacity is 0, over 2000 hours of
  unsheltered nights.
- `hunt any` draws only species with `pop >= 1` and the right ground; with
  everything at 0 the row is illegal with "nothing about".
- Fishing at a sea shore never yields a lake fish; the "perch" row at a
  sea shore is illegal.
- Fur-bearers produce `fur`, deer produce `hide`; the fur hat crafts from
  fur and, with none, from hide.
- Old-save migration: a version 3 save with `pop: { hare, grouse, deer,
  elk, fish }` loads with `fish` and `grouse` gone and the region's roster
  filled.

`tests/soundscape.test.ts`:

- `surroundings` reads footing right for each terrain, snow and ice.
- `ambienceMix` puts `lake` at 0 when frozen, `fire` at 1 by a fed fire,
  `chorus` above 0 at a June dawn in birch and 0 at a June noon.
- `openCalls` lists the loon in a lake region at a June dusk and not in
  January; the wolf's rate at full moon is more than three times its rate
  at new moon; a region without owls lists no owl at night.
- `activityLoop` is `step_snow` while walking on snow and null while
  sleeping.

`tests/calendar.test.ts` gains the moon: the period, full at phase 0.5,
illumination 0 at new.

Existing tests that pin outcomes to a seed may shift, since `dailyAnimals`
now consumes rng for more species. The plan re-seeds them rather than
loosening them.

The engine and the scheduler are checked in Chrome: the beds change
walking from forest to shore, the axe sounds while felling, a loon calls at
dusk on a lake, and the sound control mutes and persists.

## 7. Docs

The README's "How it plays" gets a bullet for the roster and one for
sound, and the "Where the numbers live" list points at `species.ts` and
`audio/manifest.ts`. The realism roadmap gets a row saying this spec lands
species and sound, and lists the snare, bear and river items of section 8
as later steps.

## 8. What this does not do

- Snares still catch hares only. Snaring grouse is a later step.
- Bear and wolverine do not act: no raids, no attacks by day. That is
  sub-project 4 of the realism roadmap, which this roster is the base of.
  No lynx, no seals.
- The `insects` bed follows its own June-to-August rule; sub-project 5's
  mosquito load per cell can drive it once that exists. Sub-project 8's
  `burnt` and `thicket` grounds become two more habitat keys per species.
- No per-species tracks on the map, and no sightings; density is the only
  information, as today.
- No fishing net or line; the spear is the one method, so the catch is
  drawn by density and odds and not by the method.
- Rivers are still absent, so grayling and salmon wait for them.
- The moon does not light the night. That belongs with the light spec.
