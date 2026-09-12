# Survidle rivers

Written 2026-09-11. Sub-project 2 of the realism roadmap, which this
spec takes over. It targets the merged terrain pair: the terrain
hydrology (`2026-09-11-survidle-terrain-hydrology-design.md`) and the
authoritative close zoom (`2026-09-10-survidle-authoritative-close-zoom-design.md`),
in that merge order, with the close zoom's fine terrain rewritten to
refine the solved world. Nothing here is built before both are on main.

## Purpose

The solved world puts rivers where water drains, with a discharge on
every cell, lakes in real depressions and a height in metres
everywhere. What it does not say is what a river is when the survivor
reaches it: how wide, how deep, how fast, whether it can be waded,
swum, bridged or must be walked around, and what it does in the last
week of May. This spec says that, at the scale the survivor meets it,
and makes the answer change with the weather.

Rivers are a barrier, a hazard and a line to follow. They are not a
stock: no fish rows, no weir, no salmon run. Those stay with the
fishing tiers (roadmap C and D) and read this spec's channel numbers
when they land.

## Decisions taken in conversation

| Decision | Choice |
|---|---|
| Base | The merged pair only. Nothing is built on the hydrology branch alone. |
| Merge order | Hydrology first; the close zoom then merges main and rewrites its fine terrain to refine the solved arrays. Water is top-down, forest bottom-up. |
| Bridges | A felled-tree footbridge over a stream up to 6 m of bankfull width. No river bridge: a solo survivor does not span 12 m of moving water. |
| Floods | Driven by the weather the climate model already integrates: snowmelt for the spring flood, rain for the autumn rises. No scripted curve. |
| Swimming | A skill of its own, two mastery keys. Cold water is the limit, not distance. |
| Fords | Read from the channel's hydraulics, not the 300 m gradient flag. A ford is where the depth-velocity product is under the wading limit at today's flow. |
| No magic numbers | Every constant below names its source. A number that does not fit a gate is corrected at the source, never bent. |

## 0. What the merged pair must provide

This spec reads the solved arrays through the fine lattice. The close
zoom's rewrite of its task 2 delivers the contract below; the rivers
work starts when these exist and are tested.

| Provided by | What | Used here for |
|---|---|---|
| hydrology | `height` Int16 metres per 300 m cell; `flowDir`; `discharge` m3/s; `kind` land, sea, lake, river; the stream flag. The ford flag is superseded by section 1 and no longer read. | the skeleton: where water is and how much |
| hydrology | `runoff(coastKm)` litres a second per km2, and each cell's upslope area | the mean daily runoff a region's weather is measured against |
| close zoom | a fine height per 50 m patch, interpolated from the coarse surface plus slope-scaled noise, with the 36 children averaging to their parent | banks, floodplain, pools |
| close zoom | a chunk-local priority flood that drains to the parent cells' outlets, and per patch the id of its local depression and that depression's rim height | flooded pockets that stay after the water falls |
| close zoom | for each 300 m river cell, the ordered list of channel patches from the upstream entry to the exit toward the receiver, found by routing the parent's discharge down the fine surface; every other patch in the cell is bank | the channel is one patch wide until width exceeds 50 m |
| close zoom | for each 300 m stream cell, the same, one patch wide | brooks a survivor steps over or bridges |
| close zoom | lake and sea patches: below the parent water body's surface and connected to it | shores at 50 m |
| close zoom | the determinism rule inherited from the solve: integer noise, correctly rounded arithmetic, no `Math.exp` or trigonometry | the sync's one-seed-one-world rule |

Two rules for the close zoom's rewrite that this spec depends on:

- **Discharge is conserved through a chunk.** The water leaving a
  river cell's exit patch is the water that entered plus the cell's own
  runoff. A test walks every river cell of a chunk and checks it.
- **Water runs downhill on the fine surface.** Each channel patch is
  no higher than the one before it along the channel. A test checks
  every channel in a chunk.

Performance targets for the refinement are the ones agreed on
2026-09-11: a 96 by 96 chunk refined cold in under 50 ms, the closest
view from cached chunks in under 16 ms, all fine caches under 20 MB,
and no terrain generation on the tick path, gated by a work count.

## 1. The channel

A river cell's channel has a bankfull geometry from its mean discharge,
and a stage from today's discharge. Both are power laws of discharge
(Leopold and Maddock, *The hydraulic geometry of stream channels and
some physiographic implications*, USGS Professional Paper 252, 1953).

**Bankfull**, the channel the mean annual flood fills. `Q_mean` is the
solved discharge. In a snowmelt regime the mean annual flood is several
times the mean flow; the ratio is read from SMHI's station statistics
(Vattenwebb, MHQ over MQ) for unregulated Norrland rivers and set once:

    Q_bf = R_bf * Q_mean            R_bf from SMHI, expected 4 to 6
    w_bf = a * Q_bf ^ 0.5           metres
    d_bf = c * Q_bf ^ 0.4           metres
    v_bf = Q_bf / (w_bf * d_bf)     metres a second

The exponents are Leopold and Maddock's downstream values. The
coefficients `a` and `c` are fitted so that a 5 m3/s river reads 10 to
15 m wide at bankfull, the width the hydrology spec already quotes, and
a 500 m3/s river reads 80 to 150 m, which is the Lule or the Ume where
they run free. With `a = 3.0` and `c = 0.27` and `R_bf = 4`: a 5 m3/s
river is 13.4 m wide and 0.9 m deep at bankfull; a 100 m3/s river is
60 m and 3.0 m. The fit is checked against those two ranges, not
trusted.

**Stage**, the channel today. At a station, width, depth and velocity
change with discharge by Leopold and Maddock's at-a-station exponents:

    d(Q) = d_bf * (Q / Q_bf) ^ 0.40
    w(Q) = w_bf * (Q / Q_bf) ^ 0.26
    v(Q) = Q / (w(Q) * d(Q))

At mean flow a 5 m3/s river is about 8 m wide, 0.5 m deep and runs at
1.1 m/s. At a summer low of 0.4 `Q_mean` it is 6 m, 0.36 m and 0.9 m/s.
Above `Q_bf` the water leaves the channel; section 5 says where it goes.

**Riffles and pools.** A channel alternates riffles and pools at five
to seven channel widths (Leopold, Wolman and Miller, *Fluvial Processes
in Geomorphology*, 1964), so a 12 m river has a riffle every 60 to 85 m
and a 60 m river every 300 to 420 m. The channel patches of a river
cell are assigned riffle or pool by walking the channel from the cell's
entry and marking a riffle every `6 * w_bf` metres, seeded by the cell
so the pattern is stable; on a riffle depth is half the reach depth and
width 1.4 times it, in a pool the reverse, and velocity follows from
continuity. The 300 m ford flag from the solve is retired: it made 8 of
12 river cells fords on the test reach, which is the riffle spacing
showing through a 300 m grid, not the presence of a crossing.

**Streams.** A stream cell's channel gets the same geometry. From 0.02
to 5 m3/s that is a bankfull width of 0.8 m to 13 m. Under 2 m of
bankfull width the survivor steps over it and it costs nothing. Between
2 m and 6 m it is waded, bridged, or in flood refused, by section 3's
rules. Above 6 m it is a small river in everything but its terrain
class, and the log calls it a river.

**Water temperature.** Rivers track the air with a short lag; lakes a
longer one. Both are needed for section 4 and both are new:

    T_river = max(0.2, mean air temperature of the last 7 days)
    T_lake  = max(0.2, mean air temperature of the last 14 days)
    under ice: 0.2 for both

Read from the region's weather; no per-cell state. The lag lengths are
a first fit and a measurement: in July and August a Norrland river
should read 14 to 18 C and a shallow lake 15 to 20 C (SMHI's summer
water temperature series; the coastal sea at Norrland reads about 21 C
at its warmest, and rivers are cooler than the sea). If the fit misses,
the lag moves.

## 2. Flow through the season

The solved discharge is the mean. Today's discharge is the mean scaled
by what the weather has done upstream.

**A region's runoff factor** `r(t)`. The climate model integrates per
region and per hour the surface water in millimetres: rain plus
snowmelt, less infiltration, less evaporation. Today it writes
`surfaceWaterMm` and nothing reads it. It is the flood driver. The
region's mean daily runoff is known from the solve: `runoff(coastKm)`
in litres a second per km2 converts to millimetres a day (50 l/s/km2 is
4.3 mm/day on the Atlantic side, 12 is 1.0 mm/day inland). Then:

    quick(t) = surface water that ran off in the last 3 days, mm
    r(t)     = b(soil moisture) + quick(t) / (3 * mean daily runoff mm)

`b` is the baseflow, the part that comes out of the ground when nothing
is running off the top. It is a linear function of the region's soil
moisture fitted so that the flow under ice in February reads 0.2 to 0.3
of the mean, which is where SMHI's winter low flow (MLQ over MQ) sits
for Norrland rivers, and 0.6 to 0.8 in a wet September. The 3-day
window is the lag between rain on a hillside and the river below it in
a catchment of this size; it is not tuned further.

**A river cell's catchment mix.** A river 400 km long crosses many
regions. At solve time every river cell gets a list of up to 16
(region, share of upslope area) pairs, accumulated down the river
network in flow order and merged at confluences, with the remainder
lumped into a "far" share that carries the world's latitude-band mean
of `r`. About 1000 to 10000 river cells at 16 pairs of 6 bytes is
under 1 MB, solved once with the world, never saved. A cell downstream
of a lake takes its mix through a 7-day window instead of 3, because
the chain of lakes the terrain report found is a real damper.

    Q(t) = Q_mean * max(0.15, sum over pairs of share * r_region(t))

**Update cadence.** Once per game hour, for river cells in resident
chunks and for the river cells the scheduler is asking about. Every
other cell's `Q(t)` is computed on demand from the same inputs, so a
route across a river 100 km away reads the same number a walk there
would. The result is cached per cell per hour. Cost: one dot product of
16 terms per river cell per hour, under 1 ms for the whole network.

**The spring flood.** Nothing is scripted. The climate model melts snow
above 2 C at a capped rate; the melt enters `surfaceWaterMm`; the
factor rises; the river follows. The measurement is that the model
reproduces the shape of the real thing: in Norrland the intensive melt
runs from mid May to early June, forest streams peak in the last week
of May and the mountain rivers in the first week of June, with several
peaks rather than one (SMHI, *1995 - extrem vårflod i norra Sverige*).
A normal year's peak on a river over 50 m3/s should read 4 to 8 times
the mean; the 1995 flood was about 1.5 times the 1938 record and is the
top of what a run should ever see. If the model's peak comes in March
or reads 15 times the mean, the fault is the melt rule's flat 2 cm an
hour cap or the missing degree-day factor, and it is fixed there.

**Autumn rain.** A wet week in September on the Atlantic side lifts a
small river's factor to 2 or 3. That is the roadmap's trap: cross a
ford on Monday, two days of rain, no way back on Thursday. Section 3
makes it refuse; section 9 makes the log say so.

## 3. Crossing

Every crossing is decided from `d(Q)`, `w(Q)` and `v(Q)` at the patch
where the survivor stands, at the hour the crossing starts. A crossing
is a task of a few minutes and is atomic: the flow does not change
under a survivor mid-stream.

**Wading.** The limit is the depth-velocity product. A person with firm
footing is at risk above about 0.8 m2/s and should not wade at 1.0
(Canada's *Hydrometric Field Manual*, the "rule of ten" in imperial
units). So:

| `d * v` at the patch | Unskilled | Wading mastery at 20 |
|---|---|---|
| under 0.5 | wade, wet to the knee | wade |
| 0.5 to 0.8 | wade, wet to the waist, a slip roll | wade, wet to the waist |
| 0.8 to 1.0 | refused | wade, wet to the waist, a slip roll |
| over 1.0 | refused | refused |

A slip drops the survivor into the swim rules below for the rest of the
width. Wading costs time at bog's walking speed across `w(Q)`, sets
wetness to 60 (the body model's soaked line) or 100 for the waist, and
soaks the garments on the legs or all of them. In winter with open
water that is the cold rule of section 4. A ford is any channel patch
whose `d * v` is under the survivor's limit today; on a river of 5 m3/s
at mean flow most riffles qualify and most pools do not, and at twice
mean flow only the widest riffles do.

**Reading the water for fords.** A ford is not known until it is read.
Unskilled, a survivor reads the patch they stand on the bank of. The
wayfinding skill gains a mastery key, `fords`:

| Wayfinding level | What is read |
|---|---|
| 1 | the adjacent channel patch |
| 10 | every channel patch within 300 m along the bank, once the bank is walked |
| 20 | every riffle within sight range when the river is seen, so the route planner can aim at one from a day away |

Reading credits the key with the minutes on the bank. The route planner
uses only fords the survivor has read; an unread river is a wall, as it
is today.

**Swimming.** Where wading is refused or the survivor slips, the
crossing is a swim across `w(Q)` at the swim speed, drifting
downstream by `v * time` and landing on the far bank that many patches
down. A swim is offered, never taken by the runner. The offer says the
water temperature, the width, and the minutes it will take. The skill
is new, `swimming`, with mastery keys `swim` and `wade` (the wade key
is the one the wading table reads):

| Swimming level | Swim speed in clothes | Effect |
|---|---|---|
| 1 | 0.3 m/s | a 13 m river is 45 s; a 200 m lake crossing is 11 min |
| 20 | 0.5 m/s | the cold shock minute is survived without the roll |
| 50 | 0.6 m/s | swim failure onset doubles in time |

Minutes in the water credit `swim`; minutes wading credit `wade`. There
is no standing order for either, as for wayfinding.

**The felled-tree footbridge.** A stream with a bankfull width of 6 m
or less can be bridged by one tree: a single felled log is a safe
footbridge to about 6 m, and engineered log beams start at 6 (USFS
*Timber Bridge Manual*, chapter 2). The job needs the axe, a spruce or
pine patch adjoining the stream bank whose trees stand taller than the
width plus 2 m, and building at the job rung (level 3). It is the
existing fell-a-tree work plus limbing and placing, three to four
hours, credited to a new building mastery key `footbridge`. The bridge
is a structure on the bank patch with the channel patch it spans. It is
crossed at full walking speed, dry. It is taken by the first flow above
`Q_bf`, because a log at bank height is what a bankfull flood lifts;
the log says "the brook took the bridge" and the structure is gone. A
survivor cannot bridge a river, and the offer does not appear on one.

**Ice.** Section 6.

## 4. Cold water

The body model has wetness and warmth and no immersion. Immersion is
added as one rule with three phases, the 1-10-1 rule (Giesbrecht,
University of Manitoba; the National Center for Cold Water Safety):

| Phase | Time in water | What happens at `T_water` under 15 C |
|---|---|---|
| cold shock | first minute | gasp and hyperventilation; a roll to drown, 3 percent at 10 C rising to 8 percent at 2 C, waived at swimming 20 |
| swim failure | minutes 1 to 10 | swimming stops being possible; a crossing still in the water at 10 minutes ends as a drowning |
| hypothermia | after an hour | not reachable by a crossing; falls to the existing cold drain on land |

The drowning rolls are the death cause `drowned`. Above 15 C the shock
roll is waived and swim failure moves out to 30 minutes; at 20 C and
above there is no limit but the survivor's energy. The water
temperature is section 1's. So a July river is a swim and a May one is
a death sentence, which is the truth of the north and is what keeps the
ford, the bridge and the long way round worth their cost.

On the bank afterwards the survivor is wet to 100 with every garment
soaked, warmth down by 30 as falling through the ice already does, and
the existing drying and cold rules take over. A swimmer who lands in
the dark on the far bank of a winter river with no fire within an hour
freezes; the offer said the temperature and the survivor took it.

## 5. Floods

**Where the water goes.** Above `Q_bf` the stage rises past the bank.
The overbank depth is `d(Q) - d_bf` and the water surface at a river
cell is its bank height plus that. A 300 m cell floods when its height
is at or below the surface of the nearest river cell it drains to,
found by a breadth-first walk from the river cells outward over cells
within the current overbank depth of the bank; the walk stops at the
first cell above the surface, so it costs the floodplain and no more.
The result is cached per river reach per 0.1 m of overbank depth and
recomputed when the hour's `Q(t)` crosses into a new band. On a 5 m3/s
river the spring peak at 6 times mean is 1.4 times `Q_bf`, an overbank
depth of 0.15 m, and the floodplain is the valley floor within a metre
or two of the bank. On a 500 m3/s river at 6 times mean it is 0.5 m
over the bank and the flat land a kilometre wide is under water. That
is what Norrland's river valleys look like in the first week of June.

**At 50 m.** A flooded 300 m cell's patches are under water where the
fine height is at or below the water surface. Flooded ground is
"wading" ground by section 3: the overbank flow is slow, so depth alone
decides, and the wading table applies with `v` at a tenth of the
channel's. Ground more than 0.8 m under is a swim.

**Retreat and the pockets.** When the stage falls, a patch that was
under the flood surface stays wet where it lies in a local depression
of the fine surface whose rim is above the falling surface. The close
zoom's chunk-local flood provides that depression id and rim height per
patch. The pocket is a pool: a timed cell status through the central
timed-status rules, with a depth equal to the flood surface less the
patch height, draining by the climate model's evaporation and
infiltration rates for that region and no constant of its own. A pool
of 0.3 m in a June meadow is gone in two to three weeks; in a bog
hollow it stays until the ground freezes. Pools are water beside for
drinking and are "wading" ground until they are under 0.1 m. On the
default rung a cell with pools shows the water glyph on its flooded
share; at the closest rung each pool patch is water.

**What the flood takes.** A pile on a flooded patch is lost, a carcass
is lost, a fire is out, a trap is gone, a footbridge is gone, a seep is
silted and returns as it does after ice. A hut or lean-to on a flooded
patch stands but is wading ground inside; the survivor sleeping in it
is wet and the night is section 4's bank rule. The camp is not moved
for the player. The log says what went and where.

**Warning.** The rising river is visible: the stage is a number and the
close rungs show the bank state, and the activity log posts "the river
is rising" when `Q(t)` passes `0.7 * Q_bf` on a river within sight, and
"the river is over its banks" at `Q_bf`. Weather sense at its second
tier posts the rise a day ahead from the melt it can see coming. That
is the whole of the forecast; there is no flood panel.

**Lakes.** A lake's surface is its rim height and does not move with
the season in this spec. A lake takes floodwater from its inflows and
lets it out at its outlet, which is why the 7-day window damps the
rivers below one. Lake level dynamics, a metre of spring rise on a big
lake, are named out of scope below.

## 6. Ice on rivers

Lake ice is one thickness per region from degree-days. River ice is
that thickness read through the water's speed at the patch, because
moving water does not freeze at the same rate and fast water does not
freeze at all: a stable ice cover cannot form or progress where the
surface velocity is above about 0.6 m/s (Ashton, *River and Lake Ice
Engineering*, 1986).

| `v(Q)` at the patch | Ice |
|---|---|
| over 0.6 m/s | open water all winter: rapids and most riffles. Drinking water beside a camp all winter with no ice hole. |
| 0.3 to 0.6 m/s | forms 14 days after the lake's, at 0.7 of the lake's thickness |
| under 0.3 m/s | as the lake |

The thin-ice panel and the fall-through rule read the river's number
where the route crosses a river patch. Falling through on a river is
not the lake's 60 percent: the current takes the survivor under the
cover, and the roll is a death unless the patch is a pool under 0.3
m/s, where it is the lake roll. In the thaw the river ice goes first:
it is rotten, the mode `thin`, from the day `Q(t)` passes the mean
until it is gone, and the panel says "rotten".

The frozen river is the winter road: a lake-chain river with pools
under 0.3 m/s is walkable end to end from January to April, and the
route planner uses it as it uses lake ice today.

## 7. Routing

`speedOf` reads the crossing rules. For a river or flooded patch the
speed is: full on a footbridge or on safe ice; bog's speed for a wade
the survivor is allowed; 0 otherwise. Fords are the survivor's read
fords, not a flag. A swim is never planned by the route; it is an offer
at the bank when the route has no dry way.

The route cache key gains a term per region: `r(t)` quantised to
quarters. The key already carries every region's ice and hour, so this
is a widening, not a new invalidation. The known-route cache and
`reachableFrom` follow. `frontierRoute` gets the ford argument it is
missing today on the hydrology branch, so an unread river reads as a
wall there too, the same as everywhere else.

When the route to a known place had a way last week and has none
today, the log says why once: "the ford at <place> is too deep to
wade", "the brook is over its banks at <place>". The scheduler's "no
way there on foot" is unchanged otherwise.

## 8. What the player sees

**Map.** The hydrology branch draws the river glyph at every rung and
promotes a block to river when any known cell in it is river. That
stays. At the two close rungs the channel patches are water and the
bank patches are their terrain, so a river is a line one patch wide
with banks, and a ford the survivor has read carries the ford mark on
its patch. A flooded patch is water with the flood tone; a pool is
water. The stage shows as the bank: at the closest rung a river cell's
bank patches nearest the channel take a wet mark when `Q(t)` is over
`0.7 * Q_bf`, and are water over `Q_bf`.

**Shimmer.** The main-branch ripple keys on the water class and needs
the river class added, with the rest and lit colours defined for it,
or the ripples render invisible. Moving water does not shimmer like a
lake: a river patch gets one ripple that drifts downstream along the
channel direction at the patch, on the same render clock and the same
compositor path, at a period that is not shared with the lake's three
so the two do not read as one pulsing sheet (the render-clock finding
of 2026-09-11). Riffles get the lit colour more often than pools. A
frozen river patch shows the ice class as a lake does. Flooded and pool
patches use the lake ripple.

**Sound.** The hydrology spec already says river and stream cells in
earshot add running water to the bed when a recording exists. Riffles
and rapids are louder than pools; a river over its banks is louder
still. No new recording is required by this spec.

**Text.** The cell status on a river bank says the width and the state
in the survivor's terms: "at the river, twelve paces wide, waist deep
and fast", "at the river, over its banks", "at the frozen river,
rotten". The crossing offer says the temperature and the minutes. The
tip on a read ford says "a ford, knee deep today".

## 9. Skills, orders and opportunities

**Skills.** One new skill, `swimming`, mastery keys `swim` and `wade`,
no standing form. Two new mastery keys on existing skills: `fords`
under wayfinding and `footbridge` under building. The perk copy at 20
and 50 for each key is the tables above in the player's words. Skills
level by the existing minutes-worked rule and cap at 50.

**Orders.** The footbridge is a job at building 3 and is the only order
this spec adds. Crossing is not an order: the runner walks routes, and
a route only ever contains bridges, ice and read fords the survivor may
wade. A once order to a place across a river with no dry way is refused
with the reason, and the swim is a separate offer at the bank that the
player takes by hand.

**Opportunities.** Three, discovered by the existing routes:

| Key | Discovered when | Steps |
|---|---|---|
| `cross:river` | a river is seen | read a ford; cross it |
| `bridge:brook` | a stream of 2 to 6 m is known and an axe is held | fell the tree across it; cross dry |
| `swim:open-water` | a crossing is refused for depth, or open water is seen at a water temperature over 15 C | swim across once |

Each carries the concept tags the queue legibility work expects and
credits from events the tasks already emit, plus three new events:
`fordRead`, `waded`, `swam`.

## 10. Performance

| Work | Cost | When |
|---|---|---|
| catchment mix per river cell | under 1 MB, 16 pairs per cell | once, in the solve, not saved |
| `r(t)` per region | a sum over 3 or 7 days of a value already integrated hourly | hourly |
| `Q(t)` per river cell | a 16-term dot product | hourly for resident chunks; on demand elsewhere, cached per hour |
| stage geometry per patch | three power functions | on demand, cached with `Q(t)` |
| floodplain per reach | breadth-first over the flooded cells only | when `Q(t)` crosses a 0.1 m overbank band |
| fine flood and pools per chunk | one pass over the chunk's patches against the surface | when a resident chunk's reach changes band |
| route cache | the key widens by a few characters per region | no new invalidations |
| ice per patch | a table lookup on `v(Q)` | with the existing ice read |

Nothing here runs per tick. The tick path reads cached hourly values;
a work-count gate proves the scheduler triggers no flood walk and no
chunk refinement. Power functions with fractional exponents use
`Math.pow`, which is banned in the solve for determinism; here they run
on the main thread after the solve and their results are never part of
the world, so the ban does not apply. The catchment mix is part of the
solve and uses only the allowed operations.

Memory: the mixes under 1 MB, hourly caches a few hundred KB, the
floodplain cache bounded by the floodplain. Nothing is saved except the
footbridges, the pools (as timed statuses) and the read fords (as
knowledge on the patch).

## 11. Edge cases

- **A river ending at the world's edge.** The terrain report found one
  that leaves by the south edge. Its factor and stage are computed as
  for any reach; its mouth is off the map and nothing refers to it.
- **The chain of lakes.** 148 of the 201 cells on the test reach were
  lake. A river cell between two lakes is a short reach; its `Q(t)`
  takes the 7-day window; its ice is the lake's unless `v` says
  otherwise. This is a real Norrland river and not a bug.
- **Confluences.** The mix merges by area share; the stage below a
  confluence reads the merged `Q(t)`. Two rivers meeting in one 300 m
  cell have two channels in it at 50 m; the entry-to-exit routing in
  the close zoom's contract handles two entries.
- **A ford that floods.** A read ford stays read; whether it can be
  waded is today's `d * v`. The route drops it and the log says so.
- **A crossing when the flood arrives.** Crossings are atomic and take
  minutes; the hourly stage does not move under a survivor.
- **The camp on a floodplain.** Allowed. A survivor who camps on the
  June floodplain in April loses the piles in June, and the log said
  the river was rising. The landing's shelter test is unchanged, and
  the heir's walk home is unchanged; whether the landing itself should
  refuse the mean annual floodplain is left to the landing item (M) and
  noted there.
- **Stream in a flood.** A 4 m brook at 6 times mean is over its banks
  at the bridge patch; the bridge goes, the brook is refused, and the
  survivor waits a week or walks up to where it is 2 m.
- **Freezing pools.** A pool in November freezes as the lake does and
  reads as ice; a pool that froze at 0.2 m is not thin ice over water
  worth a panel, so a pool under 0.3 m is walkable when frozen at all.
- **Falling through on the frozen river with an axe.** The existing
  50 percent axe loss applies where the survivor lives.
- **The ice hole.** A camp beside a riffle needs no ice hole; the
  drink and fill branches already count a river cell as a shore with
  no ice, and they read the patch's ice, not the region's.
- **Rivers far from the landing.** The terrain report found the
  nearest river 152 km from seed 42's landing. The follow-up on the
  hydrology branch lowers the river threshold to 5 m3/s at every rung;
  streams of 2 to 6 m, which this spec makes real ground, are on
  nearly every landing. The measurement in section 12 says whether a
  landing usually has a river within a day.
- **Save version.** Bumps once for the footbridge structure, the pool
  statuses and the read-ford knowledge. Old saves are refused as the
  close zoom already refuses them.
- **Sync.** Every number in this spec derives from the solved arrays
  and the weather, both regenerated from the seed; nothing about
  rivers travels in the save beyond the three items above.

## 12. Tests and measurement

Fast, in `npm test`:

- The hydraulic functions are monotone in `Q` and reproduce the two
  fitted widths.
- The wading table refuses at 1.0, allows at 0.5, and the mastery
  column differs only in the 0.8 to 1.0 band.
- A synthetic region weather of three dry days then 20 mm of rain lifts
  `r(t)` above 2 and back under 1.2 within a week.
- The catchment mix of a river cell sums to 1 with the far share and is
  identical across two solves of the seed.
- The floodplain walk stops at the first cell above the surface and
  never visits a cell it did not flood.
- A pool at 0.3 m in a June region drains to 0 within 14 to 21 days
  under the region's own evaporation and infiltration.
- Ice: a patch at 0.7 m/s reads open at 40 degree-days; at 0.4 m/s
  reads 0.7 of the lake's thickness 14 days after the lake's.
- The route across a read ford is planned at mean flow and refused at
  3 times mean, with exactly one log line between.
- The footbridge is offered on a 4 m stream with an axe and a spruce
  bank, not on a 8 m stream, not on a river, and is gone after one hour
  at `1.1 * Q_bf`.
- The swim roll is waived at 16 C and is a death at 10 minutes in 8 C
  water; a 13 m crossing at level 1 lands 15 patches downstream at
  1.1 m/s.
- The work-count gate: a 20-day headless life triggers zero flood
  walks and zero chunk refinements from the scheduler.

Slow, on ask, in `tests/slow`:

- On three seeds, the spring peak on every river over 50 m3/s falls
  between 4 and 8 times the mean, and the peak day falls between 20 May
  and 10 June for the southern rows. The peak day per latitude band is
  printed.
- On three seeds, the share of landings with a river within a day's
  walk and with a stream of 2 to 6 m within an hour, printed.
- Ford density: on a 5 m3/s reach at mean flow, wadable riffles per
  kilometre, printed against the riffle spacing.
- The reference 20-day life on a seed with no river near its landing
  is unchanged to the golden hash; on a seed with a river, the day the
  runner first routes across a ford is printed.
- Performance: hourly `Q(t)` for the whole network under 1 ms; the
  floodplain walk on the largest river at 6 times mean under 100 ms.

Then the browser pass: stand on a bank in May with the flood coming,
watch the river rise over two game days at the closest rung, cross at a
ford in July, lose a bridge in September, walk the frozen river in
February. What would look wrong: a river that is the same width at
every discharge, a flood that appears without a rising line in the
log, a ford the survivor never read being routed over, a lake and a
river pulsing in step, a survivor swimming in May and living.

## Out of scope, named so nobody assumes them

- River species, the weir, the salmon run: roadmap C and D.
- Springs as a third winter water: the roadmap keeps them with rivers
  in words, and they wait for the moisture field's successor.
- Lake level dynamics and lake outflow control.
- A river bridge of any kind, rafts, boats, a rope line.
- Ice jams, frazil, and the spring break-up as a hazard beyond
  "rotten".
- Erosion of the bank or channel migration during a run.
- Regions shaped by watersheds.
- The landing refusing the floodplain: noted for item M.
- Latitude-driven water temperature beyond the air it follows.

## Risks

- **The melt rule.** A flat 2 cm an hour cap above 2 C may peak too
  early or too flat. The spring-flood gate finds it, and the fix is a
  degree-day melt in the climate model, which is that model's item.
- **The refinement contract.** If the close zoom's rewrite delivers
  channels that do not conserve discharge or run uphill, nothing in
  sections 3 to 6 is trustworthy. The two contract tests are the gate,
  and this spec does not start until they pass.
- **Too many offers.** A river bank could show wade, swim and bridge at
  once. The rule is one offer at a time: the cheapest dry way if any,
  else the wade if allowed, else the swim, and the bridge only where a
  stream qualifies.
- **The fit coefficients.** `a`, `c` and `R_bf` are fits with named
  checks. If a check fails, the coefficient moves; the checks do not.
