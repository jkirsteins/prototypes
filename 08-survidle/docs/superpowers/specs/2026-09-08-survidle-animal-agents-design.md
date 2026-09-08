# Survidle: large animals as agents

## Purpose

The existing wildlife model is regional. It knows how many animals of each
species live in a region, how populations grow and migrate, what can be hunted,
what calls, and how wolf density changes the danger of a night. The map never
shows an animal and no animal has a position, a daily rhythm or a history.

This design makes the six large land mammals into persistent subjects and
cell-level actors without turning the whole 540 by 390 km world into a
minute-by-minute agent simulation. Bears and wolverines are individuals; wolves
are packs; roe deer, wild reindeer and elk are herds. Only the survivor's current
region has spatial agents. Everywhere else keeps cheap regional populations and
lightweight identity records.

The work is the visible and behavioural half of roadmap item 4, "Animals as
agents", and the substrate for roadmap item N, "Presence". It does not add
direct animal controls. Hunting remains a task and a standing order.

## Decisions confirmed with the author

- Regional `pop` remains the canonical ecological total and the compatibility
  surface for hunting, sound, forecasts and old saves.
- At most twelve animal subjects are spatial at once, all in the survivor's
  current region. A subject is one bear, one wolverine, one wolf pack or one
  ungulate herd.
- Foreground play advances spatial behaviour every ten game minutes. Offline
  catch-up, forecasts, reference probes, gaps between survivors and time with
  nobody home never run cell movement.
- Large animals have needs, daily rhythms, social behaviour and readable-realism
  life histories. Packs and herds have one identity and demographic cohorts,
  never an object per member.
- Animal positions cause the detailed-mode event. A wolf pack that reaches the
  survivor causes the wolf encounter; a bear or wolverine that reaches exposed
  food causes the theft. A second regional roll must not fire beside it.
- The map is observational, not tactical. Animal glyphs are not click targets.
  The existing Hunt rows remain the player's only hunting control.
- Repeated sightings build hidden familiarity. Until recognition, the UI gives
  no hint that two sightings are the same subject. Recognition pauses the game
  with "You recognize this animal. You call it X."
- Bears and wolverines receive short proper animal names. Packs and herds
  receive field names from a trait or territory. A recognized subject receives
  a stable accent colour on the map.
- A named subject remains part of the world across survivors. The inherited
  journal gives an heir a head start, not automatic recognition.

## 1. State and ownership

`GameState` gains one `wildlife` record:

```ts
export type AgentSpecies = "deer" | "reindeer" | "elk" | "wolf" | "wolverine" | "bear";
export type WildlifeMode = "detailed" | "aggregate";

export interface WildlifeCohort {
  sex: "f" | "m";
  bornYear: number;
  count: number;
}

export interface WildlifeSubject {
  id: number;
  species: AgentSpecies;
  form: "individual" | "pack" | "herd";
  region: number;
  cohorts: WildlifeCohort[];
  condition: number;             // 0..100
  reproductive: "none" | "pregnant" | "dependent";
  dependentUntilYear: number;
  name: string | null;            // assigned only on first recognition
  nameKind: "proper" | "field";
  colour: number;                 // deterministic palette index
  lastKnownDay: number;
  active: WildlifeActive | null;  // non-null only in the current region
}

export interface WildlifeActive {
  cell: number;
  hunger: number;                 // 0..100
  thirst: number;                 // 0..100
  rest: number;                   // 0..100
  alarm: number;                  // 0..100
  intent: "forage" | "drink" | "rest" | "flee" | "hunt" | "camp" | "den" | "wander";
  target: number | null;
  route: number[];
}

export interface WildlifeState {
  nextId: number;
  activeRegion: number | null;
  subjects: WildlifeSubject[];
  lastSpatialTick: number;
  familiarity: Record<number, { points: number; lastDay: number }>;
  inherited: Record<number, 3>;
  recognitionQueue: number[];
}
```

The concrete implementation may split these interfaces into an `individual`
and a `group` union when that makes illegal states unrepresentable. The stored
wire behaviour above is fixed: solitary subjects carry one-member cohorts;
packs and herds carry age-and-sex totals; only current-region subjects have an
active cell.

`SpeciesDef` gains an optional `agent` profile. Only the six species above have
one. It holds social form, activity periods, habitat preferences, group-size
targets, breeding calendar, maturity, independence and old-age rulings. Code
must read the profile rather than branch on a second species list.

`advance` gains `wildlife?: WildlifeMode`. Its default is `"aggregate"` so
tests, probes and non-UI callers keep their present cost and seeded outcomes.
The browser foreground loop passes `"detailed"`. `catchUp`, forecast workers,
reference scripts, horizon scripts and nobody-time pass or inherit aggregate
mode explicitly.

Save version 8 writes the whole wildlife record. Versions 3 through 7 load with
an empty record, no familiarity and no pending recognition; their current
region materializes deterministically on the first detailed step. A version 8
save may hold a queued recognition moment and must open it exactly once.

## 2. Population and identity

Materialization is deterministic from world seed, subject id, region, calendar
day and the simulation RNG. For each agent species, the integer part of
`RegionState.pop[species]` is divided among subjects; the fractional remainder
stays aggregate. Subject cohorts may never total more than `floor(pop)`.

The target social sizes are author rulings, not hard ecological caps:

| species | subject | target size | maturity | independence | old-age roll begins |
|---|---|---:|---:|---:|---:|
| roe deer | herd | 2-8 | 2 years | 1 year | 12 years |
| wild reindeer | herd | 3-12 | 2 years | 1 year | 15 years |
| elk | herd | 2-6 | 2 years | 1 year | 15 years |
| wolf | pack | 2-8 | 2 years | 2 years | 10 years |
| wolverine | individual | 1 | 2 years | 1 year | 12 years |
| brown bear | individual | 1, or mother with young | 4 years | 2 years | 20 years |

If representing every integer animal would need more than twelve subjects,
groups grow past their target size before another subject is added. A solitary
species never groups: surplus bears and wolverines remain unmaterialized but
included in `pop`, and a hunt or a later materialization may instantiate one.

Leaving a region clears every `active` record but retains the subject, its
region, cohorts, condition and history. Unrecognized subjects that have not
contributed to any living or inherited knowledge for 365 game days may merge
back into their regional aggregate. Recognized subjects remain until death or,
for a group, dissolution. This is the save-growth bound.

Daily aggregate population changes and persistent subjects reconcile in this
order:

1. Apply births, maturation, condition and natural mortality to subjects.
2. Apply group splits, dispersal and region-level movement.
3. Sum subject members by region and species.
4. Run the existing capacity, growth and migration rule on only the residual
   population not represented by subjects.
5. Set `pop` to represented plus residual population.

A kill removes exactly one member from the selected subject and one from
`pop`. Empty groups dissolve. A killed individual is removed. No reconciliation
pass may remove the same animal again.

## 3. Readable-realism life history

The profile table uses month numbers in code and month names here. These are
deliberately broad northern-calendar rulings rather than a genetics model.

| species | active rhythm | mating | births | young and grouping |
|---|---|---|---|---|
| roe deer | dawn and dusk forage, midday cover | July-August | May-June | does and young group; adult males are small herds outside rut |
| wild reindeer | day forage and travel, sheltered night rest | October | May | mixed herd; larger movement pressure in autumn and spring |
| elk | dawn and dusk browse, midday cover | September-October | May-June | cows and calves group; bulls split outside rut |
| wolf | dusk-night patrol and hunt, daytime rest | February-March | April-May | one breeding event per pack; yearlings disperse when the pack is crowded |
| wolverine | dusk-night forage, daytime cover | April-August | February-April | dependent kits stay with the mother until the next year |
| brown bear | dawn-dusk forage; denned November-March | May-July | January-February | cubs stay with the mother for two years; no new litter while dependent |

Each subject has one 0..100 condition score. A successful forage or predator
meal adds 4, a full day without adequate food subtracts 3, winter subtracts one
additional point from ungulates, and denning subtracts one point per seven days.
Condition clamps to the range. At 0, an individual dies; a group loses one
member from its youngest cohort, then its oldest. At and beyond the old-age
year, an individual or each cohort member has a 0.001 daily mortality chance per
year beyond the threshold, capped at 0.02. Birth counts are deterministic RNG
draws: roe deer and elk 1-2, reindeer 1, wolves 3-6, wolverines 1-3 and bears
1-3. A breeding female or pack requires condition 50 or higher.

The daily pass is enough outside the current region. It updates region, cohort
and condition facts but never invents a cell route. Predation outside the
current region is abstracted into condition and the existing population curve;
it does not create carcasses or player-accessible items.

## 4. Current-region behaviour

At activation, each subject receives a passable cell matching its habitat,
away from the survivor where possible. Placement must not reveal unmapped
ground and must not put a land animal on water or unsafe ice.

Every ten game minutes, active needs rise: hunger by 2, thirst by 3, rest by 1
while moving; rest falls by 5 while resting. Need priority chooses an intent:

1. Alarm 50 or above: flee from the survivor or threatening predator.
2. Thirst 60 or above: seek a reachable shore or known open-water edge.
3. Hunger 60 or above: herbivores seek preferred habitat; wolves seek an
   ungulate group; bears and wolverines forage, then consider exposed camp food.
4. Rest 60 or above, or outside the species' active period: seek cover and rest.
5. Otherwise follow the seasonal social intent or wander within habitat.

An active subject moves at most one four-connected cell per tick. It caches the
route to its target and recalculates only when the target changes, the next cell
becomes invalid, or the route ends. Ungulates within two cells of the survivor
gain alarm. A group shares the highest alarm among its members because it is one
subject.

Wolves avoid a lit campfire's two-cell glow, and the same radius follows a lit
carried torch while the survivor travels. They steer around that live light or
abandon an approach rather than despawning. The protection ends as soon as the
fire or torch goes out. Bears do not inherit this safety bubble. A hungry pack
may pursue an ungulate group; reaching it removes one prey member, raises wolf
condition and makes the prey flee. Reaching an unsheltered survivor at night
resolves the existing wolf injury outcome. A detailed-mode wolf encounter
replaces, rather than supplements, the hourly regional wolf roll.

Bears and wolverines never home directly on the player. When hungry, they may
target meat on a drying rack or in an outdoor camp pile. A lit camp fire makes
that target invalid for wolverines, but is not an absolute bear-proof bubble.
A turf hut or cabin protects the pile but not the rack; a lean-to does not.
Reaching the target consumes up to one day's food for the subject, removes the
stock and logs the theft. Detailed attacks require the
subject and survivor to occupy the same cell after an approach warning; they do
not arise from an extra random event.

Each persistent bear receives a stable den cell. During November-March the bear
is dormant and ordinary "Hunt bear" is unavailable. "Find bear den" is a
four-hour Hunting task available from October through February, gated at
Hunting 5. Its chance begins at 15 percent and rises by 20 percent per Hunting
level to a 75 percent cap. Success records the stable den as a `D` map POI;
knowledge of the physical site persists after the occupant leaves or dies.

In February and March, a known occupied den changes the row to "Hunt brown bear
at den". The known location shortens the task and gives a high encounter chance,
but doubles both successful-hunt and failed-hunt injury risk because the
confrontation is at close quarters. It is not an automatic kill and does not
expose cubs as separate hunt targets. A bear taken from a late-winter den yields
half its normal fat, reflecting depleted reserves. This reflects the historical
effectiveness of Scandinavian den hunting without turning a sleeping bear into
free meat.

Hunt tasks remain unchanged in presentation. In detailed mode a hunt first
chooses a local subject of the requested species on suitable ground. The task's
existing odds and duration still decide success. "Hunt anything" draws among
eligible local subjects with the existing weights. If no subject is currently
reachable, the task spends its existing duration searching and may materialize
one from unrepresented integer population; it does not claim a populated region
is empty merely because of the twelve-subject display cap.

## 5. Sight, recognition and names

The current sight calculation becomes a pure query shared by map rendering and
`seeFrom`. Historical `mapped` knowledge is not current visibility. An animal
renders only when its cell is in the current result and the zoom has one cell
per glyph. Animal glyphs are not clickable.

Glyphs are `d` roe deer, `r` reindeer, `E` elk, `w` wolf pack, `v` wolverine and
`B` bear. Before recognition they use one neutral wildlife colour. The tooltip
names species, visible count and readable activity, never hidden demographics
or identity. Player, fire, shelter, camp, trap and seep marks keep their current
priority when marks collide; a consequential collision is named in the log.

A sighting earns familiarity only when the subject has newly entered current
visibility and has not earned familiarity on the same calendar day. Remaining
in sight, changing zoom, rerendering or stepping out and back on the same day
earns nothing.

```ts
gain = 1 + Math.floor((huntingLevel - 1) / 5)
threshold = 6
```

The threshold produces six credited sightings at level 1, three at level 6,
two at level 11 and one at level 26. The counter and sameness are invisible.
When it reaches six, assign the first unused deterministic name and append the
subject id to `recognitionQueue`. The normal overlay priority is away report,
death, landing or welcome, teaching, goals, then recognition. Opening any of
those pauses the clock. Dismissing recognition removes that queue entry exactly
once.

Bear and wolverine names come from separate short proper-name lists. Pack and
herd field names combine one stable observed trait or territory word with
"Pack" or "Herd". Names are unique among living subjects of the same form. The
colour is a deterministic palette index derived from subject id and must differ
from the neutral wildlife colour. Colour is a recognition aid, never the only
place the name appears.

Recognition records a life event in the journal. A later survivor begins with
three familiarity points for each subject named in inherited journal evidence,
but recognition cannot complete until that survivor has one credited current-
life sighting. The subject may have moved or died before that happens.

## 6. Aggregate mode and fairness

Aggregate mode advances daily demographics and regional populations but never
creates cells, paths or ten-minute ticks. It keeps the existing density-based
wolf risk. Predator theft uses region density, exposed food, shelter and fire
as its aggregate inputs. Every aggregate risk appears in the forecast before it
can happen away.

Switching from detailed to aggregate collapses active cells before advancing.
Switching back reconciles subjects against final `pop`, activates the final
current region and places its cohort. Catch-up may therefore move, kill or birth
an animal, but it cannot preserve a stale pre-catch-up cell.

The forecast works on a clone and may assign temporary ids or names there; none
may leak into live state. Seeded aggregate outcomes before this feature remain
unchanged unless an animal-agent risk is deliberately enabled in that run.

## 7. Logging and presentation

Routine movement is silent. The log records only a first visible species in an
encounter, a meaningful approach or flight, predation witnessed in sight, theft,
attack, wound, kill, den discovery, recognition and a recognized subject moving
out of the region. Before recognition, all text is generic.

The map legend gains the six glyphs under one wildlife entry or compact species
entries. A recognized subject uses its accent in the glyph and tooltip. The map
key includes only active subjects whose visible cell, glyph, count, recognition
or activity presentation changed, so unseen animal movement cannot rebuild the
grid.

Every map cell participates in one shared inspection system. Pointer hover, or
keyboard focus followed by the arrow keys, updates a compact information box in
the map's top-left corner. It always names the underlying terrain first, then the
known region and every known item sharing that glyph: survivor, camp, shelter,
fire or coals, trap, seep, supplies, known den and visible wildlife. This list is
independent of marker priority, so a player glyph drawn above a den does not hide
the den's meaning. Unknown ground remains unknown. Coarse glyphs name their block
size and collect the known features inside the block.

## 8. Verification and performance gate

Automated tests cover:

- deterministic materialization, population bounds and valid habitat placement;
- one active region, collapse on exit and reconciliation on return;
- ten-minute movement, cached targets, needs, rhythms, fire avoidance, pursuit,
  predation, food theft and group changes;
- breeding windows, cohort maturation, condition, mortality and migration;
- one decrement per hunt or predation and no detailed/aggregate double event;
- aggregate catch-up and forecasts executing no spatial ticks;
- version 8 round trips and versions 3 through 7 gaining safe defaults;
- one familiarity credit per subject per day, the level formula, no identity
  leak, name uniqueness, recognition queue persistence and the inherited
  three-point head start with a required current sighting;
- current line of sight, zoom gating, marker priority, tooltip content, stable
  named colour and map-key churn.

Record the pre-change reference and forecast timings. Their aggregate workloads
must remain within ten percent of baseline. A synthetic current region with
twelve active subjects must stay within twenty-five percent of the same
aggregate advance, and one spatial wildlife tick must remain under 16 ms on the
development machine.

The browser playtest uses a fixed seed and exercises: a herd coming into sight;
six low-skill sightings over separate days and one high-skill recognition; the
recognition modal and named colour; a night wolf approach; a bear or wolverine
approaching exposed food; fire deterrence; a hunt; leaving and returning to the
region; an offline catch-up; and an heir receiving journal help without instant
recognition. Anything looks wrong if an unseen subject is named, an event fires
without its warning, a visible animal survives its own successful hunt, two
hazards fire for one encounter, or fast-forward visibly stalls.

## Sources and prior decisions

- `2026-09-03-survidle-realism-roadmap.md`, item 4 and item N.
- `2026-09-03-survidle-species-and-sound-design.md`, the catalogue, populations
  and wolf-density contract.
- Rovdata's Scandinavian wolf monitoring and reproduction material:
  https://rovdata.no/ulv/bestandsstatus.aspx
- Natural Resources Institute Finland's large-carnivore and ungulate research:
  https://www.luke.fi/en/modelling-tools-for-wolf-population-management
- Scandinavian Brown Bear Research Project's research summary, including the
  winter denning period and reliance on stored fat:
  https://www.brownbearproject.com/_files/ugd/915ea6_51b9ed1b7f234a61b30e0752dee27c3a.pdf
- Sahlen et al. on Scandinavian den entry and human-injury implications:
  https://wildlife.onlinelibrary.wiley.com/doi/10.1002/jwmg.822
- Elfstrom et al. on Scandinavian den selection and the historical vulnerability
  of denning bears to effective den culling:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6116945/

The dates, group sizes, condition deltas and recognition thresholds above are
game rulings. The external sources ground the shape of the lives; they do not
pretend the prototype is a population-management model.
