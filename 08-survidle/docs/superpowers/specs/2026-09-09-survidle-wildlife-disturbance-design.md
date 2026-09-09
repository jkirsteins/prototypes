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
- Current saves keep cell-bound animal positions. A spatial adapter turns
  coarse positions into stable metric estimates. A later detailed view can
  supply exact positions through the same interface.
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

It does not add Walking progression, wind or scent, stored continuous animal
positions, direct animal controls, clickable animals, hunt forks or new
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

The current adapter converts the survivor's interpolated position to an exact
metric point. An active animal cell becomes a metric area. Resolution derives
one plausible point inside it from the world seed, subject ID and area key.
That point remains stable while the subject remains in the area and consumes
no simulation RNG.

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
between `escapeMinM` and `escapeMaxM`. The movement adapter spends that distance
through coarse or detailed steps. The first movement happens immediately and
later wildlife ticks continue it.

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

What would look wrong: a fixed cell flight radius; same-cell contact; a
ten-minute reaction delay; hidden identity or route disclosure; an ambiguous
twig snap; non-receding hoofbeats; one marker per herd member; teleporting; or
zoom replay.

## 14. Walking follow-on

The roadmap's Walking item owns progression. It starts from the neutral
movement-profile boundary and must decide practice, benefits, capabilities,
order-ladder treatment, lineage carry, balance and save shape before code. This
build adds no Walking level or implied curve.
