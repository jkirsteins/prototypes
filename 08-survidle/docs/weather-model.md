# The weather model

The atmosphere, visibility and ground-state model as built: the advected
fields in `src/sim/climate.ts`, the per-region ground integrator in
`src/sim/weather.ts`, and the sight rays in `src/sim/sight.ts`. The sky
widget's astronomy is a separate note, `sky-model.md`. Player-facing
behaviour (storms called an hour ahead, wet wood, ice) is in
`how-it-plays.md`; this is the model underneath it.

## The atmospheric field

The atmosphere is a deterministic field of the world seed, absolute weather
time and coordinates. It never rolls separately in each 300 m cell and never
draws from the gameplay RNG. Pressure, humidity and temperature anomaly use a
12 km sampling lattice. Their seeded component wavelengths are 5, 7 and 11
lattice spacings, or 60, 84 and 132 km. A subordinate 1.2 km lattice has 6,
8.4 and 13.2 km wavelengths. It can shape a precipitation edge or terrain fog
only where the broad cloud field supplies support, so nearby cells normally
belong to one continuous weather feature rather than unrelated showers.

The whole field translates continuously at a seed-dependent 6 to 46 km/h.
That system motion is separate from local surface wind. Surface wind combines
the prevailing flow with the centred pressure gradient over 12 km, is smoothly
bounded below 60 km/h, and supplies the same vector used by map and sky motion.
Elevation cools air by 6.5 C/km. The upwind and downwind terrain samples are
6 km away: rising ground adds humidity and precipitation, lee ground dries the
air, and damp depressions increase fog potential. These are local modifiers to
one larger system, not new weather systems.

Every atmospheric sample contains temperature, pressure, relative humidity,
cloud, liquid-equivalent precipitation, rain and snow phase rates, wind, fog,
blowing snow and optical extinction. Rain and snow blend continuously from all
rain at +1 C to all snow at -1 C. Frozen liquid uses the model's 10:1 fresh
snow conversion, so 1 mm water equivalent becomes 1 cm fresh snow.

## Ray extinction

Visibility uses the 5 percent contrast threshold

    tau_max = -ln(0.05) = 2.9957
    beta_clear = tau_max / 50 km
    MOR = tau_max / beta_total

where every beta is in 1/km. The clear baseline is counted once. Rain, snow,
fog and blowing-snow excess coefficients are added to it. Rain MOR anchors are
20 km at 0.5 mm/h, 8 km at 2.5 mm/h, 3 km at 7.5 mm/h and 0.8 km at 25 mm/h.
Snow anchors are 5 km at 0.4 cm/h, 1.2 km at 1 cm/h and 0.4 km at 2.5 cm/h.
Between rate anchors the interpolation is logarithmic:

    t = ln(rate / rate0) / ln(rate1 / rate0)
    MOR = MOR0 * (MOR1 / MOR0) ^ t
    beta_excess = tau_max / MOR - beta_clear

Rates below the first anchor ramp linearly to zero excess; rates above the last
anchor clamp. Fog moves exponentially from a 10 km onset MOR to 0.2 km at full
density, and blowing snow from 12 km to 0.3 km. Both use a smooth onset over
density 0 to 0.05.

A sight ray walks each 300 m segment at its midpoint and accumulates

    tau = sum(beta(segment midpoint) * segment length km)

Each midpoint beta is bilinearly interpolated from the four surrounding
integer cell-centre atmosphere samples. Every centre uses its own authoritative
regional snow cover and is sampled at most once per visibility pass. The fixed
centres make the result independent of ray enumeration order while retaining a
continuous field between adjacent cells. A midpoint outside the world is
opaque rather than borrowing an in-world edge value.

The target is hidden once tau exceeds tau_max. Clear air after fog cannot
restore lost contrast. Terrain, light, eyesight, skill and the geometric
horizon set the maximum radius; weather only shortens it. The candidate set is
circular, not square, and is capped at the 50 km clear-air MOR before ray
work. A canopy remains a hard blocker. Ground already mapped remains known,
while wildlife and newly mapped ground require current visibility.

Live weather is rendered only where known ground intersects that current
viewshed. Remembered ground outside it keeps its terrain memory but shows no
current cloud, cloud shadow, fog, rain or snow, and never-seen ground shows
neither terrain nor weather. This observation rule also applies to coarse map
blocks, so zooming out cannot turn the map into a weather radar. The simulation
still evolves the continuous weather field everywhere. The map key includes
the exact projected viewshed at every zoom and shares that result with the
markup once per displayed game minute, preventing stale coarse weather without
adding another ray pass.

Cloud feature translation follows game minutes, including the ordinary clock
and accelerated work. The same simulated wind vector drives rain and snow
drift. Fog and optional ASCII cloud glyphs use slower presentation-only cycles
of 12 and 16 real seconds. Those decorative shape changes do not accelerate
with work, pause, or alter the simulated feature's location or visibility.
Liquid water in the current viewshed ripples on the same kind of wall clock.
It is faked for the eye, not modelled: three smooth waves cross the sheet in
different directions, with wavelengths of 4, 2.5 and 6 cells and periods of
5, 3.75 and 8 real seconds, and each cell shows their sum. A cell's start in
each wave comes from its position, with up to a radian of seeded jitter, and
each wave peaks at its own seeded brightness, so neighbours move together
without the sheet sliding as one texture. The waves are drawn on the
effects canvas by `drawWaterShimmer` in `src/ui/map.ts`, one additive
rectangle per wave per cell in the cell's lit blue; at the two close zoom
rungs the peak is halved so a big cell does not wash out its detail glyphs.
It began as three stacked DOM overlays per water cell, which was the single
most expensive thing the game drew (86 percent of all style recalculation,
measured 2026-09-14; the record is under "The render surface" in
`roadmap-additions.md`), and the canvas is what replaced it. Ice, marked
cells and remembered water lie still, and reduced motion turns it off. `?shimmer=2`
is a test aid that runs all three waves twice as fast; it is not a game
feature.

Panels are rendered from state ten times a second, not on every display
frame: nothing a panel shows moves faster than a game minute, and every
per-frame writer compares before it writes. Motion that must be smooth is
drawn on the sky and effects canvases from their own clock. Input still
renders at once through its own
handlers, and the map tip draws on the pointer event itself.

## Stationary ground consequences

Moving clouds and stationary ground are separate state. Each materialized
roughly 4 km region stores its last completed weather hour, snow depth, surface
water, soil moisture, frost, standing-water ice, dry hours and the partial
day's temperature integral. Completed hours replay deterministically when a
region is next needed. In each hour the ground integrator applies, in order:

    snow += snow_cm_per_hour
    melt = min(2 cm, snow), only while temperature > 2 C
    surface_water += rain_mm_per_hour + melt_cm
    infiltration = min(surface_water, 2 * (1 - soil_moisture)) mm
    soil_moisture += infiltration / 50
    evaporation = 0.08 * (1 - relative_humidity)
                  * max(0, temperature_C + 5) * (1 + wind_kmh / 20)

Evaporation consumes surface water before the 50 mm soil store. Moist frozen
ground adds `min(1, -temperature_C / 12) / 24` frost per hour; temperature
above zero removes `temperature_C / 12`. Dry hours reset after at least 0.2 mm
of hourly precipitation or while soil moisture exceeds 0.2, otherwise they
increment. At local midnight snow settles by 5 percent. Standing-water ice
uses the local daily mean: freezing grows squared thickness by 7.2 per
freezing degree-day, while thaw removes 2 cm per positive degree-day.

Version 1 saves copy their global snow, ice and drought into every already
materialized region at the save's completed hour. Wet-day saves begin with
1 mm surface water and 0.5 soil moisture; dry saves use zero and 0.1. Frost
starts at zero. Untouched regions initialize from deterministic seasonal
history. Version 2 saves retain their local records. Weather time has its own
elapsed offset, so a new survivor can reset the life clock without moving the
atmosphere or ground backward.

Map glyphs sample atmosphere at their own coordinates and share one caught-up
ground record per represented region. Unknown terrain stays secret while air
can remain visible over it. Fog remains in the map's cell vocabulary: every
300 m sample controls the opacity of one same-colour ASCII ripple, with a
coordinate-stable animation phase and no weather border or separate viewport
layer. Neighboring values remain coherent because they come from the same
continuous simulated field. Rain and snow particles keep transparent
backgrounds so precipitation cannot turn those cells into gray tiles. The
default cloud display uses that same per-cell density to dim the ground as a
moving shadow capped at a 14 percent black wash, leaving terrain glyphs
readable. Ordinary cells have no border on any side; only actual region edges
restore their owned boundary line. The persistent "clouds cast
map shadows" setting can be turned off to replace those shadows with
same-colour ASCII cloud ripples. The setting changes presentation only: cloud
location, density, movement, light, visibility, rain and snow remain simulation
output. Terrain memory and inherited-map dimming apply to terrain and signals,
not the cell-owned atmosphere, so weather does not acquire discovery-state
seams. The weather panel and sky use the player's same sample; CSS only
amplifies opacity and motion from that sample. The legacy
`Weather`-shaped fields are a derived player summary kept for save and narrow
no-world compatibility. They do not drive the atmospheric field or ground
integration. Cell-specific version 2 work, water, routes, audio and rendering
query local conditions.

Repeated current-cell reads in one simulation minute share one atmospheric
sample through a one-entry `WeakMap` memo per live `GameState`. Its key covers
world identity and seed, absolute weather minute, cell, climate start day and
local snow input. The memo is not serialized, returns copies to callers, and
does not apply to historical ground replay or sight's per-pass cell-centre cache.

This is a physically inspired mesoscale model, not CFD. It deliberately omits
metre-scale turbulence, shelter aerodynamics, cloud microphysics, fronts with
vertical structure and forecast uncertainty. The performance probe is
`npm run weather:profile`; it reports deterministic work and host timings but
has no flaky timing gate. On the 2026-09-10 development host, seed 17 measured
10,000 atmospheric samples in 57.29 ms and 10,000 identical memoized
current-cell reads in 1.40 ms, the maximum-range open-fell sight
workload over exactly 87,604 integer lattice candidates in 3.52 ms, 2,592
map-sized atmospheric samples in 14.03 ms, one day of catch-up for 100 ground
regions in 16.34 ms, and the 2,592-glyph late-day map render in 32.43 ms. The
sight workload chooses a broadly open fell/rock origin, searches daylight for
the clearest local atmosphere. That run reached 855 cells before optical
attenuation and retained 287 visible cells, with deterministic checksum
`855:287:570357823`, so it exercises long open rays instead of ending
immediately in forest canopy.
The 87,604 count
is an exact enumeration of every non-origin `(dx, dy)` with
`hypot(dx, dy) <= 167`: 167 cells follows from `ceil(50 km / 0.3 km)` and the
clear-air maximum MOR. Those figures are calibration
evidence, not portable budgets. The sight candidate cap removed an observed
2,787,736-cell, 18.9 second scan of rays that the 50 km clear-air extinction
limit could never reveal.

