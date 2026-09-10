# Survidle: scale-independent wildlife disturbance

The animal-agent build puts large animals on map cells and makes every herd
within two cells of the survivor flee on its next ten-minute tick. That rule is
both too broad and too late. Two occupants of one coarse cell may still be far
apart, while an animal that detects a person entering its cover does not wait
for the map simulation's next tick before reacting.

This design replaces cell-count proximity with a metric encounter boundary and
makes a perceived startle legible through map animation, sound and the log. It
extends `2026-09-08-survidle-animal-agents-design.md`; where that spec says
ungulates within two cells gain alarm, this one takes precedence.

Walking proficiency is only an input here. A separate roadmap item owns the
design of a Walking skill and the many systems it could affect.

## 1. Decisions

- Wildlife behavior reasons in metres, elapsed minutes and physical context.
  It never reads cell counts or map-cell size.
- Active animals keep exact metric positions. Old cell-bound saves migrate to
  their stable seeded point through the spatial adapter.
- Sharing a coarse map cell is legal. An undetected animal may remain there.
- Detection raises alarm. Alarm, not co-occupancy, makes an animal flee.
- A newly startled animal begins escaping during the update that startled it,
  without waiting for the ten-minute wildlife tick.
- Ordinary movement uses a generic movement-proficiency input. A deliberate
  hunt adds Hunting skill. This build adds no Stalk or Walking skill.
- A startle the survivor sees or hears produces one transient map cue, one
  audio sequence and one log line. An unperceived reaction changes only state.
- Heard-only reactions animate over hidden ground but reveal no persistent map
  knowledge, animal glyph, identity, count or route.
- Live events animate and sound once. Offline catch-up never replays them.

## 2. Scope

This build owns the metric adapter, stable coarse-position uncertainty,
ungulate detection and escape, sight and hearing of reactions, structured
presentation events, the `!` effect, departure audio and log copy, the neutral
movement-proficiency hook, and any necessary save migration.

It does not add Walking progression, wind or scent, direct animal controls,
clickable animals, hunt forks or new
predator attacks. Wolves, bears and wolverines keep species-specific behavior
and do not inherit the ungulate flee rule.

## 3. Metric spatial boundary

The public spatial vocabulary contains no grid terms:

```ts
interface MetricPoint { xM: number; yM: number }

type SpatialEstimate =
  | { kind: "exact"; point: MetricPoint }
  | { kind: "area"; key: string; min: MetricPoint; max: MetricPoint };

interface EncounterGeometry {
  actor: MetricPoint;
  subject: MetricPoint;
  distanceM: number;
  bearingRad: number;
  uncertaintyM: number;
}
```

The adapter converts the survivor's interpolated position to an exact metric
point. A newly activated animal begins at a stable point derived inside its
cell from world seed, subject ID and area key, consuming no simulation RNG.
Thereafter its stored metric position advances continuously with game time;
the cell is only the spatial bucket containing that point.

Two actors in one coarse area therefore do not automatically have zero
separation. A future detailed branch returns exact estimates; all downstream
behavior stays unchanged. Only the adapter imports cell dimensions or indexes.
A dependency test guards that encounter logic imports no grid scale,
`cellOf`, `cellIndex` or neighbour helper.

## 4. Movement context

The resolver receives movement facts rather than task or skill IDs:

```ts
interface MovementProfile {
  speedKmh: number;
  loadKg: number;
  noiseFactor: number;
  visibilityFactor: number;
  footingFactor: number;
  deliberateApproach: boolean;
}
```

The initial proficiency hook returns neutral factors. A later Walking skill may
change them without wildlife knowing a Walking level exists. Ordinary travel
supplies no Hunting bonus. A Hunt task marks deliberate approach and supplies
the existing Hunting factor. Walking near wildlife trains nothing new here.

Encounter context also carries terrain, light in lux, precipitation, cover and
metric geometry. Wind and scent are optional future inputs; absence is neutral.

## 5. Detection, alarm and escape

Each agent species gains centralized physical calibration:

```ts
interface DisturbanceProfile {
  visualRangeM: number;
  auditoryRangeM: number;
  alertAlarm: number;
  flightAlarm: number;
  alarmGain: number;
  settleMinutes: number;
  settleDistanceM: number;
  escapeMinM: number;
  escapeMaxM: number;
}
```

The first values are anchored by observed deer behavior: human approach flight
distances of tens to low hundreds of metres, and a disturbed red deer escape on
the order of 600 m. The implementation plan records chosen values and sources
beside the table. Every agent species must have a tested profile.

An encounter is evaluated when survivor or animal advances, when the survivor
begins a differently noisy activity, when supplied context changes, and on the
wildlife tick while the survivor remains nearby. Broad-phase filtering uses the
largest metric sensory range, never a fixed number of cells.

Sight and sound are separate seeded detection rolls. Distance against channel
range gives the base chance; cover, light and matching movement factors modify
it. Heavy rain can mask sound and sight. Deliberate approach applies Hunting
only to the approach signature. Either channel may add alarm.

Below alert the current intent continues. Alert but below flight watches,
pauses or reorients. Flight starts one escape episode. A group shares its
highest alarm because it remains one subject.

Escape selects a direction away from the threat and a seeded physical distance
between `escapeMinM` and `escapeMaxM`. The reaction immediately schedules a
passable segment but does not relocate the animal. Later elapsed game minutes
move it by physical gait speed and spend only distance actually travelled.
Waypoint arrival continues the route independently of decision-tick cadence.

Water, unsafe ice and the active-region boundary remain impassable. A blocked
subject chooses the passable direction that most increases metric separation.
With none, it stays alarmed; it never teleports or despawns.

Alarm settles only after both the configured time without new detection and
the configured metric separation. Continued detection refreshes alarm but does
not emit another startle from the same escape.

## 6. Perception of the reaction

Animal detection of the survivor and survivor perception of the reaction are
separate:

```ts
type StartlePerception =
  | { kind: "seen"; identification: "subject" | "species" | "ungulate" | "unknown" }
  | { kind: "heard"; identification: "species" | "ungulate" | "unknown"; uncertaintyM: number }
  | { kind: "none" };
```

Sight may identify a recognized subject, known species, broad body type or
nothing. Hearing reads distance, departure loudness, terrain, precipitation
and competing noise. Hunting can improve classification, but cannot make an
inaudible event audible.

Current animal visibility is already observed evidence. When a subject in
the map's current visibility result begins escaping, its departure is seen
even if the independent reaction-perception rolls fail. That event retains
the recognized name or species the map already discloses. This reads current
visibility before escape movement, not the cached ten-minute sighting list;
a formerly visible subject now hidden keeps the ordinary hearing and
unperceived outcomes. Visibility never forces the animal to detect a person
or turns routine wandering into a startle.

Heard-only perception includes an uncertain source position. It may appear
over hidden ground for a moment but is not written to mapped knowledge,
familiarity or last-known position.

## 7. Structured presentation event

Every perceived transition into escape emits one event containing a stable ID,
subject ID, metric source, bearing, distance, uncertainty, perception, terrain,
body weight class, group class and final log text. It is the sole input to map,
audio and log consumers, which never independently infer the event.

The ID deduplicates delivery. The log records once at emission. The transient
visual/audio queue is not saved. Persistent alarm and unfinished escape are
saved if new fields are required. Loading resumes behavior without replaying
the cue. Aggregate and offline simulation queue no spatial effects.

## 8. Map effect

The map gains a transient layer above persistent glyphs. A marker never
replaces the survivor, animal, fire, shelter or terrain glyph. Projection uses
the current map transform: coarse zoom anchors to the containing display glyph,
future detail uses precise placement, and offscreen events pulse once at the
nearest edge with their bearing.

The visible sequence is:

1. `!` pops at the perceived source;
2. a seen animal glyph recoils or shakes briefly;
3. the marker holds, rises slightly and fades;
4. actual escape movement supplies departure motion.

The marker lasts about 1.2 seconds and does not pause. A herd creates one. A
heard-only marker can appear on hidden ground but shows no animal or trail. A
stable small jitter inside its uncertainty radius communicates approximation.

Reduced-motion mode keeps appearance, hold and fade but removes pop, rise,
recoil and shake. The log remains the non-animated reading.

## 9. Audio vocabulary

A startle must read as sudden departure, not generic ambience. Every ungulate
cue has a sharp contact transient, surface or vegetation movement, and
footfalls that recede.

| ground | departure vocabulary |
|---|---|
| spruce or pine | branch snap, brush thrash, muffled hoofbeats |
| birch | leaf burst, light branches, hoofbeats |
| meadow or fell | hoof scrape, grass movement, open hoofbeats |
| bog | wet impacts, splashing, heavy bounds |
| snow | sharp crunch then receding snow impacts |
| rock | scrape or stone clatter then irregular hard impacts |

Body and group select weight and width. Roe deer are light and quick; elk are
heavier with fewer strong impacts; groups layer non-identical patterns.
Vocalizations are optional species accents, never the core signal. There is no
non-diegetic chime for `!`.

Initial slots, each with at least two variants, are:

- `startle_hoof_light_forest`;
- `startle_hoof_heavy_forest`;
- `startle_hoof_light_open`;
- `startle_hoof_heavy_open`;
- `startle_hoof_bog`;
- `startle_hoof_snow`;
- `startle_brush_predator`.

The predator slot is reserved but unreachable in this build because predators
retain their older behavior and have zero disturbance gain. Predator reaction,
metric contact, and whether this slot belongs to that presentation are recorded
in the roadmap rather than implied to be complete here.

Distance selects gain, bearing selects pan and event ID selects light rate
variation. Recorded movement recedes over one to three seconds. Ambience and
survivor footsteps duck slightly at onset, then return smoothly. Simulation
decides audibility; mute, missing stereo or failed files never change it.

## 10. Log language

- Recognized and seen: `The River Herd startles and bounds into the birches.`
- Species known and seen: `A roe deer herd startles and bounds into the birches.`
- Ungulate heard: `Hooves crash away through the spruce to the east.`
- Unknown heard: `Something crashes away through the spruce.`

Words become more specific only through perceived evidence, Hunting and
recognition. Heard-only lines name no stable subject or exact count. Direction
appears only when hearing localizes it.

## 11. Failure handling and performance

- Non-finite spatial input resolves no encounter or state change and asserts in
  development.
- Blocked escape leaves the animal alarmed at its best passable position.
- Duplicate event IDs are ignored by transient consumers.
- Missing audio warns once; visual and log continue.
- Missing stereo uses centred playback.
- Hidden tabs and catch-up start no one-shots.
- The twelve-subject bound remains and an update stays under the existing 16 ms
  representative-desktop budget.

## 12. Tests

Automated tests prove metric modules have no grid dependencies; coarse and exact
adapters agree for equal geometry; same-area separation is stable and not
forced to zero; rerender, unrelated RNG and save/load cannot change it;
movement or noisy work can startle immediately; an undetected animal may remain
in the same coarse area; metric escape is spent correctly; time and distance
both gate settling; boundaries never teleport; one herd emits one event; sight,
hearing and no perception disclose only allowed facts; heard-only events do not
map or reveal animals; event IDs prevent replay; audio follows terrain, body,
distance and bearing; accessibility and audio failures preserve fallbacks; and
offline advance queues no transient effects.

Catalogue guards require disturbance data for every agent species and manifest
entries for every selected audio slot.

## 13. Browser playtest

For a playable URL seed with a naturally visible herd and ordinary map-click
movement, use the [natural seed 19 walkthrough](../../natural-wildlife-playtest.md).
It records the landing choices, 300 m route, observed departure, and timing
limits without development-console setup.

At one-cell zoom with sound on:

1. Walk toward a visible herd and see one `!`, recoil, departure audio and one
   matching log line.
2. Repeat until a herd fails to detect the survivor and confirm same-area
   occupancy looks plausible.
3. Approach unseen wildlife through spruce. An audible departure shows `!`,
   terrain audio and a non-identifying log without an animal glyph or mapping.
4. Cause an unperceived departure beyond sight and hearing; nothing discloses it.
5. Compare forest, open, bog and snow, and light against heavy ungulates. The
   first second must communicate "animal startled" and broad ground.
6. Startle a herd against water and a region edge; it moves passably or stays
   alarmed, never vanishes.
7. Zoom during the effect, mute, hide and restore the tab, and enable reduced
   motion. Nothing replays and every fallback stays understandable.

For the ungulate disturbance behavior covered by this spec, what would look
wrong is a fixed cell flight radius; co-occupancy treated as zero-distance
contact; a
ten-minute reaction delay; hidden identity or route disclosure; an ambiguous
twig snap; non-receding hoofbeats; one marker per herd member; teleporting; or
zoom replay.

### Verified deterministic fixtures (9 September 2026)

`npm run startle-seeds` searches seeds 1 through 5000. For each seed it fully
generates the region, selects at most 16 eligible candidate cells, and evaluates
up to 16 approach samples per candidate cell. It uses the production encounter's
seeded rolls without overrides. These are controlled placements of a naturally
generated herd on generated ground, not promises about its normal spawn cell.
Terrain is never edited. Only the selected herd is active during a fixture.

| Case | Seed | Subject | Animal start cell | Survivor cell | Result |
|---|---|---|---|---|---|
| visible | 1 | 1 | 1280781 | 1280781 | Seen herd departs through pine |
| heard-only | 7 | 1 | 901197 | 902997 | Hidden spruce source, unknown crash |
| same-area-remain | 1 | 1 | 1280781 | 1280781 | Alarm stays zero; no departure or log |
| bog | 74 | 1 | 1257438 | 1257438 | Heard hoof departure through bog |
| snow | 1 | 1 | 1280781 | 1280781 | Seen departure with snow impacts |
| blocked-edge | 1 | 1 | 1280781 | 1280781 | Departure stays on passable regional ground |

The explicit approach is 15 m toward the herd's stable metric estimate, at
08:01 on 1 April (minute 1), or midnight for heard-only (minute 960). The
survivor stays within its listed cell while taking that sample. Snow sets
10 cm of cover; other fixtures have clear, dry, snow-free weather. A single
sample intentionally holds other simulation systems still so a later wildlife
tick, changing weather or browser frame timing cannot change the result.

Exact browser steps:

1. Run `npm run dev` from `08-survidle`, open
   `http://127.0.0.1:5173/prototypes/08/`, and enable sound with the audio control.
   These helpers exist only in the development build.
2. Run `npm run startle-seeds` and copy the printed `await
   window.survidle.startleSetup({...});` line for a case into the console. Setup
   selects one-cell zoom, holds simulation time, and suppresses saves. It keeps
   the existing run in memory for restoration.
3. Execute `setTimeout(() => window.survidle.startleStep(), 2000)` and close the
   console before the two seconds elapse. The helper takes the 15 m approach
   sample and invokes the same production
   disturbance evaluator and live presentation sink. Look for one marker and
   log line, plus departure audio, except in the calm shared-cell case.
4. Invoke `startleStep()` again. The same escape must not produce another cue.
   Reload the fixture with its setup command to hear or see it again. Compare
   the bog fixture's wet impacts with the snow fixture's crunching footfalls.
5. In heard-only, confirm the source cell remains unmapped and no animal or
   route appears. In blocked-edge, confirm the herd remains inside its region
   on passable ground. Test zoom, mute and reduced motion during an effect.
6. Run `window.survidle.startleEnd()` to restore the original run and normal
   clock/saving. Avoid other game actions while inspecting a fixture.

For a shorter setup command, load the finder once in the development console:

```js
const startles = await import('/prototypes/08/scripts/startle-seeds.ts');
await window.survidle.startleSetup(startles.findStartleScenario('heard-only', 7, 7));
window.survidle.startleStep();
```

The table and production live-event delivery are verified by the scenario
tests. Visual appearance and perceived audio quality still require the manual
pass above.

## 14. Walking follow-on

The roadmap's Walking item owns progression. It starts from the neutral
movement-profile boundary and must decide practice, benefits, capabilities,
order-ladder treatment, lineage carry, balance and save shape before code. This
build adds no Walking level or implied curve.
