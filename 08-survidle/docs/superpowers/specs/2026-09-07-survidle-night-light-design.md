# Survidle: the night is a light level, not a wall

Three lines in the Do panel at 20:40 in September:

    Sleep: blocked, dark; no fire to work by.
    Gather sticks: blocked, dark; no fire to work by.
    Strip bark: blocked, dark; no fire to work by.

The first is a bug and is fixed (a body with no fire lies down in the
dark rather than standing over a cold hearth until dawn). The other two
are the design this spec replaces. A person whose fire has gone out on a
clear September night with a moon up can find sticks. It is slow, they
miss things, and they would rather do it tomorrow - but the world does
not refuse them.

The sim currently answers "can this be done now" with `cal.isNight`, a
boolean, in four separate places that do not know about each other: the
order gate (`orders.ts nightSkip`), the walk speed
(`player.ts NIGHT_WALK_FACTOR`), the hunt odds (`tasks.ts huntOdds`,
`def.night ?? 0.7`) and the wolves (`events.ts`). This spec replaces the
first three with one number - the illuminance at the survivor's cell, in
lux - and turns the refusal into a cost.

Extends `2026-09-06-survidle-sleep-design.md` (the two-process body) and
supersedes the night clauses of
`2026-09-06-survidle-winter-loop-design.md` (1.2 away work by day, 1.3
chores by firelight) **for work started by hand only**. The runner's
gate is untouched.

## Decisions confirmed with the author

- **Nothing is blocked by darkness.** Every activity can be attempted at
  any hour. What the dark takes is time, not permission.
- **The penalty is per-activity and authored.** A new activity has no
  night penalty unless its author gives it one. False negatives are
  preferred to false positives: an activity nobody thought about works
  at night at full odds, rather than being silently crippled.
- **The penalty is a per-attempt roll, and the yield is unchanged.** A
  failed roll does not complete the attempt; the work goes again. Night
  work returns exactly what day work returns, after far more hours.
- **Light scales the roll, and 100% brightness is no penalty.** Light
  sources are real illuminance and they add.
- **Brightness reads the whole sky.** Sun, flame, moon, snow and cloud.
- **Lux, log-scaled, from published values.** No invented constants;
  where a number is not published it is derived from one that is, and
  the derivation is written down.
- **The runner keeps its night gate.** Standing orders behave exactly as
  they do today: away work waits for first light, camp chores want a
  fire, the working-day budget holds. Only work the player starts by
  hand runs after dark.
- **A hand order ends only in collapse.** Nothing interrupts a once
  order; at the collapse line the survivor lies down where they stand.

## 1. The light model

New module `src/sim/light.ts`. One function is the whole interface:

```ts
illuminance(state, world, cal, cell): number   // lux
```

Sources add, because illuminance is additive.

### 1.1 The sun

The calendar has `LATITUDE_DEG = 62` and already computes the solar
declination for `daylight()`. Solar altitude is the same two constants
with an hour angle:

    sin(h) = sin(lat) sin(decl) + cos(lat) cos(decl) cos(H)
    H = 15 deg per hour from solar noon (13:00 in this calendar)

Clear-sky horizontal illuminance against altitude, log-interpolated
between published values:

| sun altitude | lux | |
|---|---|---|
| +60 deg | 100,000 | clear summer noon |
| +30 | 50,000 | |
| +10 | 15,000 | |
| +5 | 8,000 | clear December noon at 62 N |
| 0 | 400 | sunrise/sunset |
| -3 | 50 | |
| -6 | 3.4 | civil twilight ends |
| -12 | 0.008 | nautical twilight ends |
| -18 and below | 0.002 | starlight, moonless clear |

This alone replaces the flat `isNight` band with a slope, and makes a
September dusk a different working proposition from a December one.

### 1.2 The moon

`moonPhase` and `moonIllumination` already exist. The moon's position is
the sun's, shifted:

    decl_moon = decl_sun * cos(2 pi phase)
    H_moon    = H_sun - 2 pi phase

At full moon (phase 0.5) that puts the moon opposite the sun - 12 hours
away in hour angle, declination negated - which is why a full moon rides
high on a December night at this latitude and low in June. That is a
real northern fact and it falls out of the model rather than being
asserted.

Full moon at the zenith, clear: **0.25 lux** (published range 0.05-0.3).
Scaled by `moonIllumination` and by `sin(h_moon)`, zero below the
horizon.

### 1.3 Cloud

`weather.clear` already exists. Overcast transmits **0.15** of clear-sky
sun (published 0.1-0.25) and **0.03** of moonlight. An overcast, moonless
night floors at **0.0001 lux**, which is the reference dark for the odds
curve below.

### 1.4 Snow

Fresh snow's albedo is 0.8 against about 0.15 for the forest floor. The
light at the working surface is the incident light plus what the ground
throws back:

    factor = (1 + albedo) / (1 + 0.15)

which is 1.57 over snow and 1.0 without. Applied to sun and moon only;
a fire does not care what it is standing on.

### 1.5 Flame

The two soft numbers in this spec. Both are derived from a luminous flux
rather than asserted as illuminance, and **both are flagged for the
survival sources audit**:

- **Camp fire**, a moderate one, about 500 lm. As a point source
  I = 500/4pi = 40 cd; at 1.4 m from the hearth, **20 lux**. Present at
  the camp cell while `fire.lit`.
- **Torch**, a pine or birch-bark brand, about 100 lm, so I = 8 cd; at
  arm's length, **10 lux**. Present at the survivor's own cell while
  `torch.lit`.

`ui/map.ts lightSources` already knows both of these as map glyphs and
should read this module rather than keeping its own list.

## 2. The activity's declaration

```ts
export const NIGHT_WORK: Partial<Record<TaskId, { needLux: number; darkOdds: number }>>
```

Absent means no roll, ever. `needLux` is the light the work honestly
needs, off the occupational scale (EN 12464-1): about 20 lux to carry
and stack known objects, 200 for ordinary handwork, 500 for fine
handwork. `darkOdds` is the chance per attempt at the 0.0001 lux floor.

Per attempt, log-linear between the two:

    t = (log10(lux) - log10(0.0001)) / (log10(needLux) - log10(0.0001))
    p = darkOdds + (1 - darkOdds) * clamp01(t)

A torch at 10 lux against a 20-lux need therefore reads t = 0.94 - very
nearly daylight, which is the point of carrying one. A full moon on snow
(0.2 lux) reads t = 0.62: real, poor working light.

The starting table, all of it the author's to move:

| activity | needLux | darkOdds | why |
|---|---|---|---|
| `sticks`, `deadwood`, `bark`, `innerBark` | 20 | 0.05 | finding and choosing wood you cannot see |
| `berries`, `roots`, `eggs`, `seaweed`, `stone` | 50 | 0.02 | small things on the ground |
| `craft`, `repair`, `mend` | 200 | 0.05 | handwork |
| `sharpen`, `hone` | 500 | 0.02 | an edge you judge by eye |

Not listed, deliberately: `chop`, `split`, `splitWedges`, `haul`,
`fill`, `melt`, `thaw`, `light`, `cook`, `build`. An axe swung at a log
you have already found is a job for the hands, and cooking happens at
the fire by definition.

## 3. The roll

`tasks.ts stepTask`, at the line where `t.progress >= t.duration`. Roll
`p`; on a failure set `t.progress = 0` and return - no `complete()`, no
`it.done++`, no yield. `train()` has already run for those minutes, so
practice in the dark is still practice.

The log says so once per task, not once per attempt: the first failed
attempt of a task logs "Too dark to be sure of anything" and the rest
are silent.

## 4. The collapse

A hand intent has no body tier (`runIntent`: `it.mode === "runner"`
guards `serveBody`), so today nothing can stop one. At `SLEEP_AT`
energy the collapse fires for a hand intent too: the intent ends, the
survivor sleeps where they stand. This is the only interruption a once
order gets, and it is the price of working the night through.

## 5. What folds in, and what does not

- **`NIGHT_WALK_FACTOR`** (`player.ts:240`, the Swedish handbook's 1 km/h
  against 3) becomes the same interpolation at a 20-lux walking need
  with a 1/3 floor. The handbook's dark reading is preserved exactly;
  what changes is that a moonlit snowfield is now faster than an
  overcast one.
- **`huntOdds`'s `def.night ?? 0.7`** (`tasks.ts:902`) becomes the same
  interpolation, per species, against the species' own night factor as
  the floor. Nocturnal species keep their advantage; the flat boolean
  goes.
- **The wolves** (`events.ts:29`) do **not** fold in, contrary to what
  was said when the design was presented. That clause is fear of flame,
  not light to work by - a fire keeps wolves off whether or not it is
  bright enough to whittle by. It stays a boolean and stays where it is.

## 6. What the player sees

The lux number itself never appears. The status line gains a word for
the light where it already says "day" or "night" (`ui/panels.ts:161`):
pitch dark, starlit, moonlit, firelit, twilight, overcast, daylight. A
hand order running under a roll shows its odds the way the hunt already
does ("about 5% per try").

## 7. Testing

Unit, in `tests/light.test.ts`:

- Noon in June is over 50,000 lux; noon in December is under 5,000.
- Civil twilight reads 3.4 lux within a tolerance, at both equinoxes.
- A full moon in December is up at midnight and a new moon is not.
- Overcast kills the moon: the same night clear and cloudy differ by
  more than a factor of ten.
- Snow raises an outdoor night and does not raise a torch.
- A lit fire at the camp cell does not light the next cell over.

Behavioural, in `tests/orders.test.ts` and `tests/tasks.test.ts`:

- A hand-started `sticks` at midnight with no light completes, and takes
  more than ten times the daylight minutes on a fixed seed.
- The same with a torch lit takes very nearly the daylight minutes.
- A standing `sticks` order at midnight is still skipped, with the same
  reason it gives today.
- A hand intent at the collapse line ends in sleep.
- `split` at midnight with no light takes exactly the daylight minutes:
  an activity that declares nothing is not penalised.

Gates: `npm test`, then the April, winter, year and lineage readings
reported as they come. Per the standing rule, a gate that moves is a
reading to report, not a number to tune against.

## 8. Build order

1. `light.ts`: sun altitude, moon position, illuminance, the word.
2. Its tests.
3. `NIGHT_WORK` and the odds function.
4. The roll in `stepTask`, and the once-per-task log line.
5. The collapse for hand intents.
6. Fold the walk factor and the hunt odds; leave the wolves.
7. `ui/map.ts lightSources` reads `light.ts`; the status word.
8. Gates, and the browser pass.
