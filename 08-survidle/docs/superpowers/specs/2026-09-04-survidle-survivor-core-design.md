# Survidle: the survivor loop's core

Roadmap item F, its core (`2026-09-03-survidle-realism-roadmap.md`, "F.
The survivor loop"). Today a death removes the save file, so a first
death is a deletion and the world is gone with the person. After this
spec the world is what is saved, a survivor is a chapter in it, and the
next survivor lands months later in the same world and finds what the
last one left: the fire pit, the snares, a cabin if there was one, the
map as far as it was walked, and a written life to read.

This is the smaller of F's three parts. The lineage (latitude by row,
goals, the Lineage tree, the death site and corpse run) lands after the
first producers and B. The ramp's parts land inside the sub-projects
that own them. Nothing here carries anything of the person to the heir
except the world and the record.

## Decisions confirmed with the author

- **The gap is at least a season, then the next open-coast day.** A
  boat lands only between ice-out and freeze-up. A spring death lands
  its heir in late summer; an autumn or winter death lands the next
  May. The gap is game time, never the wall clock.
- **The gap is the sim advancing with nobody home**, not a table.
  Weather, fires, racks, snares, piles and populations run by the rules
  a living survivor sees.
- **Structure decay is a live rule in the sim.** A lean-to falls after a
  season whether or not anyone is alive; the gap gets it for free.
- **Abandoning is a death.** The button stays with its confirm, its
  cause is "gave up", and the heir lands after the gap as after any
  death.
- **Survivors have names.** The landing screen prefills a first and
  last name from Scandinavian and Baltic pools with a reroll button, and
  the player may type over it. A name is never offered twice in a world.
- **One save holds the world and the person** (version 5). No separate
  world and person files; the lineage as a player-owned thing across
  seeds arrives with the tree and can be split out then.

## 1. The save and the phases

### 1.1 The file

`SaveFile` becomes `{ version: 5; savedAt: number; state: GameState }`.
`GameState` keeps every field it has and gains:

```ts
/** Every survivor of this world, the living one last. */
survivors: LifeRecord[];
/** World year the current survivor landed in, 1 for the first. */
year: number;
/** Set between "Begin again" and the name being confirmed; null otherwise. */
landing: Landing | null;
```

```ts
interface Landing {
  cell: number; region: number; date: WorldDate; gapDays: number;
  /** The prefilled or rerolled name, until the player confirms. */
  name: { first: string; last: string };
}
```

`saveGame` no longer removes the file on death. `clearSave` stays for
the "new world" action in 6.5 and for tests.

### 1.2 Migration from version 4

A version 4 file loads as a world whose first survivor is the one in
the file: `survivors` is one record with a rolled name, `landed` at the
file's `startDoy` in year 1, no gap, and an events list that begins at
the load. The record begins at the load and the entry says nothing
about the days before it. `year` is 1, `landing` is null.
`fillDefaults` handles it as it handles every earlier field.

### 1.3 Three phases

- **Alive**: `dead` and `landing` both null. As today.
- **Dead**: `dead` set. The file is kept, and a reload shows the death
  card again. No catch-up runs while dead: `boot` skips `catchUp` when
  the saved state is dead, so the gap is the game's time from the death
  date and never the wall clock's. Rendering while dead shows the
  tombstone (6.3) as the overlay.
- **Landing**: `landing` set. The gap has run, the world clock stands at
  the landing minute, the person is re-initialised, and the name screen
  (4.4) is the overlay. Confirming clears `landing`, writes the record's
  name and the first log line, and the run begins. Saving in this phase
  saves the landing block, so a reload returns to the name screen.

### 1.4 The clock per survivor

Each survivor's run starts at `minute` 0 on the day they land, with
`startDoy` the day of year of that landing, so `cal.day` stays "day N
of this life" everywhere it is used, and the ledger, the harness and
the panels do not change. `year` says which world year the landing fell
in, and every date that crosses survivors is stored as `{ year, doy }`
in the life record, never as a minute. One helper, `worldDate(state,
minute)`, gives the date of any minute of the current life from
`year`, `startDoy` and the day index, stepping the year where the day
of year wraps, and it is the only place that arithmetic lives.

The rebase at landing touches the few absolute minutes the world holds:
`regions[*].iceHole` is cleared, `lastHour` and `lastDay` go to 0,
`weather.rolledDay` goes to 0, and the old survivor's `log` is dropped,
since their record has what mattered from it. Rack drying, snare age,
fire unattended minutes, `logsWet` and pile stack ages are relative and
carry over unchanged.

### 1.5 What re-initialises at landing

The person: `player`, `skills`, `task`, `paused`, `route`, `intent`,
`ledger`, `stats`, `log`, `dead`, exactly as `newGame` fills them, with
the landing cell as the position and the landing region as
`player.region`. What stays: `regions` with their structures, fires,
racks, snares, orders, wood and populations; `piles`; `discovered`
demoted per section 8; `weather`, which the gap has run forward and
which stands at whatever the landing day's weather is.

Orders stay attached to their camps because they belong to the camp,
not the person. The heir who walks into the old camp finds its list
waiting, blocked or not, and the runner reports each order as it does
today.

`newGame` is split so the person half is one function, `newPerson`,
that both `newGame` and the landing call.

## 2. The world without a person

`advance(state, world, minutes, { nobody: true })` runs the world half
of `step` and skips the person half. The world half is `stepWeather`,
`stepCamp`, the hourly events that do not concern the body, and the
daily `dailyAnimals` and `dailyCamp`, plus the structure decay of
section 3. The person half is `stepTask`, `runOrders`, `runIntent`, the
unbidden sleep, `stepPlayer`, `autoEat`, `autoDrink`, `iceUnderFoot`
and the death check.

`stepCamp` and `hourlyEvents` read `state.player.region` and the
player's position to decide what is "here". In nobody mode nothing is
here: no fire is fed, no wolves roll, no smoke is breathed. The plan
checks each call site and gates it on the mode rather than on a dummy
player. `advance` in nobody mode ignores `state.dead`, since the dead
person is exactly who is not there.

The gap runs `advance` in nobody mode for the whole gap in one call,
from "Begin again", before the landing screen shows. At about 10 ms a
game day for the full sim, and the person half being most of it, a
90-day gap is well under a second and a 280-day one about two.

The random stream is the world's, `state.rng`, consumed as it is
consumed while alive, so the gap is deterministic per seed and the
reference player's heir run reproduces.

## 3. Structure decay

A live rule in `dailyCamp`, for every touched region, every day,
alive or not. Each structure that decays has an age in minutes on the
region state, reset when it is built or repaired:

| structure | lasts | then |
|---|---|---|
| lean-to | a season, 90 days | falls: `leanTo` false, the age cleared, "The lean-to at X has fallen in." |
| drying rack | a season | rots: `dryingRack` false and whatever hung on it lost, "The rack at X has rotted through." |
| bough bed | as today, 14 days | as today |
| snares | do not decay; a set snare stands until it is taken up | the catch rots by the rule that exists |
| fire pit, hearth, cabin | do not decay in this spec | the cabin's decades and the turf hut's re-roofing are 3's |

A lean-to or rack past two thirds of its life shows "needs re-roofing"
or "needs relashing" in the camp panel, and a **repair** task at the
structure resets the age: an hour for the lean-to with 2 sticks, an
hour for the rack with 1 cordage. The runner treats repair like any
build step: it is ordered or it does not happen, and the reference
player's list does not include it in this spec, so its lean-to falls
in July and the report says so.

`RegionState.structures` keeps its shape; the ages are a new
`structureAge: Partial<Record<"leanTo" | "dryingRack", number>>` beside
`boughBedAge`, which stays where it is.

## 4. The gap and the landing

### 4.1 The rule

At "Begin again":

1. `deathDate` is the current date `{ year, doy }`.
2. `earliest` is `deathDate` plus 90 days.
3. The landing is the first day on or after `earliest` on which the
   coast is open.

The coast is open from `COAST_OPEN_FROM` to `COAST_OPEN_TO`, days of
year in `calendar.ts`, derived from the seasonal mean in `weather.ts`
and written down as numbers: it opens a month after the air's mean
crosses 0 C in spring, since the sea lags the air, and closes on the
day the mean crosses 0 C in autumn, since no boat runs into freeze-up.
With `seasonalMean` as it is, that is day 125 (6 May) to day 306
(3 November). A test asserts both numbers against the curve so a
change to the curve moves them.

Worked: a death on 25 April lands 24 July of the same year; a death on
1 September lands 6 May of the next; a death on 20 October lands 6 May
of the next. The gap in days and the landing date go into the new
record.

### 4.2 Running the gap

The gap is section 2's `advance` in nobody mode for `gapDays * 1440`
minutes. Before it runs, the dead survivor's pack is laid down as a
pile on the cell where they died, through the pile machinery that
exists, so it spoils and its tools wear by the rules in 4.3. Nothing
marks the cell and nothing points at it; the marker and the corpse run
are the rest of F's.

After it runs, `minute` is rebased to 0 with `startDoy` the landing's
day of year and `year` stepped if the landing crossed a year end, per
1.4.

### 4.3 Tools in the open

Tools in a pile lose durability at `TOOL_RUST_PER_MONTH`, 5 points per
30 days, to a floor of 10, as part of the daily pile step. This is the
one rule the pack at the death cell needs that piles do not have today,
and it applies to any tool left on the ground, alive or not. A tool at
the floor is still a tool with the wear penalty the tables give it.

This rule was not built here: piles hold tools as counts, not as
durability-bearing items, and `takeUp` hands back any tool taken from a
pile at full durability, so rust as wear has nothing to act on until the
corpse run gives piles durability to lose.

### 4.4 Where the heir lands

The first survivor keeps the start search in `world/gen.ts`. An heir
lands on a shore cell, water beside land, at a straight-line distance
of `LANDING_MIN_KM` (3) to `LANDING_MAX_KM` (20) from the last camp,
chosen deterministically from the seed and the survivor's index. If no
shore cell lies in the band, the nearest shore cell to the old camp is
taken. The cell is stored in `landing.cell`, and the heir's region is
the region of that cell. The world's `start` is untouched, so the
harness and the tests that read it still mean the first survivor.

### 4.5 The landing screen

The overlay while `landing` is set. It shows:

- The date and year: "Late July, year 2."
- The gap in words: "Ninety-one days after Eirik Kalnins died."
- A name field, prefilled, and a "another name" button that rerolls it.
- One button, "Land".

The name pools live in `src/sim/names.ts`: first names and last names,
each list Scandinavian and Baltic together, combined freely. The roll
is from the world's rng so it is deterministic per seed and survivor
index; the reroll draws again. A name whose first and last both match
a survivor already in this world is not offered. What the player types
is taken as typed, trimmed, and empty means the prefilled name.

Confirming writes the name into the record, sets `landing` to null,
writes the first log line, and saves. The first log line is the only
direction the heir gets: "Late July, year 2. Ninety-one days after
Eirik Kalnins died. You land at Grey Shore with an axe, wool on your
back and a kilo of dried meat. The old camp at Hareskog lies 6 km
north-east." Distance and bearing are from the landing cell to the old
camp cell, rounded to the kilometre and the eight winds.

The heir's kit is the arrival kit as today. This spec adds no kit
variant; that is the tree's.

## 5. The life record

```ts
interface LifeRecord {
  name: { first: string; last: string };
  /** Index in the world, 1 for the first survivor. */
  index: number;
  landed: WorldDate;
  /** Days between the last death and this landing; 0 for the first. */
  gapDays: number;
  events: LifeEvent[];
  /** One entry per day of the life, B's month number; null until B lands. */
  forecast: (number | null)[];
  died: Died | null;
}
interface WorldDate { year: number; doy: number }
```

### 5.1 Events

`LifeEvent` is `{ day: number; date: WorldDate; kind: ...; }` with one
of a fixed list of kinds, each written by a single `record(state, ev)`
call at the seam where the log already writes the line:

| kind | fields | seam |
|---|---|---|
| `threshold` | `id` | the season spine's detector (7) |
| `firstKill` | `species` | the hunt and fish task completions, once per species |
| `built` | `structure` | the build completion, where `stats.structures` is stepped; once per structure per life |
| `entered` | `region` | `enterRegion`, on the first visit |
| `toolWorn` | `tool` | where a tool's durability reaches 0 |
| `frostbite` | `part` | where frostbite first takes a toe or finger |
| `storm` | none | when a storm passes and the survivor is alive |
| `repaired` | `structure` | the repair task (3) |
| `abandoned` | none | the abandon confirm, right before `die` |

`worstNight` is not an event but a running field on the record,
`worst: { day: number; warmth: number; wolves: boolean } | null`,
updated by the hourly step whenever warmth at night is under the value
held. One kill of a species is one event; the count stays in `stats`.
The record is bounded by the world's regions, species and structures
and by one threshold per season per year, so it stays small.

### 5.2 The died block

Filled by `die` at the moment of death, since the world moves on
afterwards:

```ts
interface Died {
  day: number; date: WorldDate; cause: DeathCause; region: string;
  kmFromCamp: number; packFoodKg: number; campFoodKcal: number;
  campFirewoodKg: number;
  /** The last threshold passed and nights since it. */
  after: { threshold: ThresholdId; nights: number } | null;
}
```

`DeathCause` gains `"gaveUp"`, and `DEATH_LINES` gains its line: "You
sat down by the cold fire and did not get up."

### 5.3 The forecast field

`forecast` gets one `null` pushed per game day in the daily step. B
fills it in place of the null when it lands. Nothing draws it in this
spec.

## 6. The selector, the epitaph, the cemetery

### 6.1 The selector

`src/sim/epitaph.ts`, pure over a `LifeRecord`, no state:

- `epitaph(rec)`: one line.
- `entry(rec)`: up to twelve lines, in date order.
- `since(rec, day)`: the away report's "what happened" line, from the
  events on or after `day`.

Templates over real quantities, no adjectives, no generated prose.
Deterministic, so a test asserts the output for a seeded run.

The epitaph is: name; "Day N."; the cause with its context; where; what
was in hand. "Eirik Kalnins. Day 87. Died of cold on the fourth night
after the cold snap, 2.1 km from camp, with 400 g of dried meat in the
pack and 6 kg of firewood at camp." When `after` is null the clause is
"on day 87"; when `kmFromCamp` is under 0.2 it is "at camp".

The entry is the epitaph, then one line per threshold reached, one per
first kill, one per structure built or repaired, the worst night, the
last three days as the last three events, and the cause. A three-day
life has a three-line entry; a wintered one the full twelve, oldest
lines dropped from the middle before the ends, never the epitaph or
the cause.

### 6.2 The away report

`awayHtml` gains the `since` line at its top, from the current record
and the day the player left. The log entries under it stay as they
are. The check-in loop and the survivor loop share the selector rather
than each growing its own summary.

### 6.3 The tombstone

`deathHtml` becomes the tombstone: the name, the epitaph, the entry,
then "The next boat lands in May, year 2." computed by 4.1 without
running the gap, then "Begin again", then a "cemetery" link. The line
saying the save is gone goes. The stats sentence goes, since the entry
has it. "Begin again" runs the gap and moves to the landing phase.

### 6.4 The cemetery

A panel per world, over the overlay, listing every survivor newest
first, each under their epitaph; opening one shows the entry. It is
reached from the tombstone, from the journal panel (8.2), and it is
what shows after the away report when the survivor died while away:
the away report's "Continue" leads to the tombstone rather than the
game when `dead` is set. Nothing in the cemetery pays anything or
changes the world.

### 6.5 New world

The cemetery panel carries one "leave this world" button with a
confirm. It clears the save and starts a new seed, and the world with
its survivors is gone. It is the only way to a new world, and it is
not on the tombstone, so the path of least resistance from a death is
the heir.

### 6.6 Abandon

The abandon button and its confirm stay where they are. Confirming
records the `abandoned` event and calls `die(state, "gaveUp")`. The
tombstone and the cemetery treat it as any death. The reference player
never abandons, so no gate counts it.

## 7. The season spine

Eight thresholds a year, each with a detector on the world state, an
expected day of year, an announcement a week ahead, an arrival line,
and one line of what it asks for. `src/sim/spine.ts` holds the table
and a `stepSpine` called from the daily step, alive or not; in nobody
mode it records nothing and announces nothing, and only keeps the
"passed this year" marks current so the heir's year starts right.

| id | detector | expected doy | asks for |
|---|---|---|---|
| berries | the berry season opens (the date `berries.ts` uses) | its constant | "Pick while they last; dry what you cannot eat." |
| rut | a date, `RUT_DOY`, 20 September | 263 | "Elk are on the move and dangerous; the bow and the spear are worth the most now." |
| firstFrost | first night with ambient under 0 C after midsummer | the day the seasonal mean night crosses 0 C, from the curve | "The berries stop; be under a roof with dry wood." |
| lakeFreeze | shore ice at `ICE_SHORE_CM` or more | from the curve, as `water.ts` grows ice | "Open water closes; a hole cut by axe is the water now." |
| firstSnow | snow that lies, `snowCm` above 0 at the daily tick | from the curve | "Tracks show; wood gets wet; the walk costs more." |
| dark | daylight under 6 hours | from `daylight()` | "Short days; work by the fire, and wood for the long nights." |
| coldSnap | the weather's cold snap event, first of the winter | mid-January by the curve | "The coldest nights; a fire through every one, and stay in." |
| iceOut | shore ice back to 0 after the cold snap | from the curve | "Open water again; the boat season begins." |

A week before the expected day, if the threshold has not fired this
year, the log says "<Name> is near. <asks for>". When the detector
fires the log says "<Name>. Day N." and the record takes a `threshold`
event. Each fires at most once a year; a `passed: Record<ThresholdId,
number>` on the state holds the year it last fired.

### 7.1 The season panel

One block at the top of the journal panel: the next threshold's name,
"expected in N days" or "any day now" past its expected date, and its
asks-for line. Nothing else.

## 8. The dim map and the journal panel

### 8.1 Dim

`discovered` gains the value 3, `DIM`, with `SEEN` 1 and `VISITED` 2
unchanged. At landing every region at `SEEN` or `VISITED` becomes
`DIM`. The map draws a dim region as terrain and its name with the
`dim` class, no wood count, no animals, no structures, no piles;
`enterRegion` makes it `VISITED` as usual and the neighbours `SEEN`
only where they are unknown. Dim never fades.

### 8.2 The journal panel

A panel in the right column under the log, "Journal". At its top the
season panel (7.1). Under it the current survivor's record so far as
`entry()` renders it, then the ancestors newest first, each a name and
epitaph that opens to their entry. The cemetery link is here too.

## 9. The reference player and the gate

`runReference` gains an heir mode: `runHeir(seed, days)` runs the
April reference survivor to their death, applies 4.1 and 4.2, lands the
heir with a rolled name, runs the heir's reference list to their death
or to `days`, and reports both lives: day and cause of each death, the
gap and the landing date, and what the heir found at the old camp (the
structures standing, the piles and their kcal, the snares). `npm run
reference` prints it beside the gates it prints today.

The gate is the late-August gate the roadmap wrote down, run from the
heir's real landing rather than from a fixed 24 August: the heir
reaches the first snow alive and fed, on 4 seeds. The pull-forward rule
applies: if it is red the report says which death, and the first
producers are next in the order in any case.

## 10. Tests

All in `tests/`, vitest, fast:

- `save`: a version 4 file loads wrapped per 1.2; a dead save survives
  `saveGame`; a dead save reloads to the dead phase without catch-up; a
  landing-phase save reloads to the name screen.
- `gap`: 4.1 for a death in each month; `COAST_OPEN_FROM` and `_TO`
  against the curve; the landing cell is shore in the distance band on
  the four reference seeds; a name is never offered twice.
- `nobody`: `advance` in nobody mode never reads `state.player` (a
  proxy that throws), and over a 90-day gap from a kitted camp the fire
  is out, the rack is gone, the snare catch is gone, and a bucket left
  in a winter gap has split.
- `decay`: the lean-to falls at 90 days and the rack at 90; the cabin
  and fire pit stand at 400; repair resets the age; the camp panel's
  needs-repair line appears at two thirds.
- `record`: each seam in 5.1 writes its event once; `died` is filled
  with the right kmFromCamp and kcal; `forecast` has one null per day.
- `epitaph`: the epitaph and entry of each reference seed's April run,
  asserted verbatim as golden strings; `since` over an away window.
- `abandon`: the confirm records the event and dies with `gaveUp`.
- `spine`: the eight detectors fire once each and in order over a
  seeded year in nobody mode from 1 April; the ahead line lands seven
  days before the expected day.
- `dim`: demotion at landing; the map html carries the `dim` class and
  no state for a dim region.
- `reference`: `runHeir` on seed 17 reports two lives and a landing in
  the open season.

## 11. Browser pass

On seed 17 with the clock advanced: run to the death, read the
tombstone and its entry, press "Begin again", reroll the name twice and
type one, land, read the ancestor's entry from the journal, walk to the
old camp by the first log line's direction and find the fire pit and
the snares with the lean-to gone, the season panel naming the next
threshold, and in a second run abandon and find it in the cemetery as
gave up.

## 12. Out of scope

Latitude by row, goals, the Lineage tree, the death site marker and
the corpse run, trails, the cellar, a chosen landing month, a kit
variant, regrowth and repopulation, the cabin's and turf hut's decay,
the forecast views, and the beacon.

## 13. Roadmap bookkeeping

When this lands: the roadmap's build order marks F core built with a
pointer to this spec and its plan; the F section's core paragraph gains
the "built" line the other items carry; the idle curve spec's
sequencing marks item 3 built; and the measured heir report goes under
F the way the calibration pass's measurements went under it.
