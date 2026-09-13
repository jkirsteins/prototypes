# Survidle Authoritative Close Zoom Design

Date: 2026-09-10

## 1. Purpose

The 50 m and 100 m map views currently draw cosmetic subdivisions inside one
authoritative 300 m simulation cell. Those subdivisions are deterministic
texture, but they cannot be selected, traversed, depleted, built on, observed,
or used by tasks. The map therefore shows spatial distinctions the simulation
does not possess.

This change makes 50 m patches the canonical spatial unit. Every larger scale
is derived from that same fine terrain. The close views will show ordinary real
cells instead of nested cosmetic glyph fields.

Existing saves and existing seed layouts do not need compatibility. This is a
new world-generation and save-schema version.

## 2. Confirmed root cause

The current split is explicit in the code:

- `visualGround()` hashes a parent terrain and chooses display-only glyphs.
- Close-map micro glyphs share one click target and one 300 m cell id.
- `cellFromPoint()` discards the pointer's position inside the visual detail.
- Player state is continuous only in old cell units, and tasks reduce it with
  `cellOf()` to the 300 m bucket.
- Piles, structures, partial work, observations, resources, weather ground,
  and most wildlife interactions are keyed by that parent cell.
- Wildlife has exact metre positions, but the rest of the simulation does not
  share its spatial convention.

The fix is not a rendering substitution. The simulation needs one canonical
fine spatial model.

## 3. Considered approaches

### 3.1 Canonical 50 m grid with hierarchical routing

Every simulation location is a real 50 m patch. Terrain is generated at that
scale, larger views aggregate it, and long routes use exact component and
boundary summaries. This is the selected approach. It provides fine mechanics
without searching or allocating the entire fine world.

### 3.2 Canonical 50 m grid with direct global A*

This has a simpler route implementation but makes searches cover up to 36
times as many nodes. Repeated scheduler routing, region construction, and long
journeys would have unacceptable worst cases. This approach is rejected.

### 3.3 Continuous terrain with navigation polygons

This could create smoother paths, but it introduces a new polygon topology,
geometry persistence, target ownership, and interaction model. Tasks and
resources would still need discrete ownership. This approach is rejected as
unnecessary complexity.

## 4. Canonical spatial model

The physical world is the solved world's 540 by 667 km, 1,800 by 2,224 cells
of 300 m. Its canonical lattice becomes 10,800 by 13,344 patches, each 50 m
square. There are about 144 million possible patches, but they are procedural
and never allocated as one fine array.

The shared constants and conversions are:

- Base patch width: 50 m, or 0.05 km.
- Fine patches per old-width parent: 6 by 6.
- Fine patch id: `y * WORLD_FINE_W + x`.
- Parent coordinate: `floor(x / 6), floor(y / 6)`.
- Metric point to patch: floor each metre coordinate divided by 50.
- Patch center to metric point: `(x + 0.5) * 50, (y + 0.5) * 50`.

Player and wildlife positions use metres. The patch under an exact point is the
canonical owner for local state. No subsystem stores a second position in a
different unit.

Routes store exact fine patch ids and continuous progress along the current
edge. Regions, named places, targets, piles, camps, structures, tasks, and
observations also store fine patch ids.

The type and adapter boundary must make scale explicit. Code must not accept a
bare coordinate that could mean metres, fine patches, or aggregate cells.

## 5. Zoom hierarchy

Every ordinary zoom draws the same 72 by 36 glyph board:

| Rung | Fine patches per glyph | Scale per glyph |
|---|---:|---:|
| Closest | 1 by 1 | 50 m |
| Close | 2 by 2 | 100 m |
| Default | 6 by 6 | 300 m |
| Regional | 18 by 18 | 900 m |
| Wide | 54 by 54 | 2.7 km |
| Whole world | Dynamic | About 12 km |

The closest view is a grid of 2,592 authoritative patches. The close view is a
grid of 2 by 2 aggregates. Neither contains `.micro-ground` elements or calls
`visualGround()`.

Exact aggregates are computed for known ground from cached fine chunks and
lower-level summaries. Unknown ground remains fog and does not force terrain
generation. Wide glyphs may skip uniform descendants through cached summary
nodes, but their answer still derives from the fine generator. No coarse
terrain participates directly in mechanics.

Aggregate presentation records terrain composition, surface state, knowledge
composition, and the visible features it contains. The dominant glyph follows
the existing terrain priority for ties so coast and mountain forms remain
legible.

## 6. Fine terrain generation

Generation is a pure function of seed and metric position. Existing coast,
fjord, ridge, elevation, moisture, and lake fields retain comparable physical
wavelengths by expressing their frequencies in metres rather than old cell
coordinates.

Each 50 m patch samples the physical fields at its center. Additional seeded
small-scale octaves provide real local variation. Classification proceeds from
physical facts:

1. Coast and inland-water fields determine sea and lake water.
2. Elevation and exposure determine fell and exposed rock.
3. Low elevation, drainage tendency, and moisture determine bog.
4. Moisture, elevation, exposure, and latitude select spruce, pine, birch, or
   meadow.

Neighbor-aware inputs may examine the same pure fields around a patch to avoid
single-patch classification noise and to form coherent shores, clearings,
passes, and rocky bands. Classification must not depend on query order or
mutate generated state.

The old 300 m terrain classification does not constrain the 36 children.
Instead, a 300 m summary is computed bottom-up from those children.

Regions retain approximately their present physical diameter. Their seed
lattice, membership, centroids, area, habitat shares, resource capacity, and
named places are evaluated in metric or fine-patch units. A named shore is a
reachable land patch beside water. An outcrop, forest, or heath is an exact
reachable patch with that terrain.

## 7. Chunks, summaries, and persistence

Fine terrain is generated in 96 by 96 patch chunks aligned to 6-patch parent
boundaries. One chunk covers 4.8 by 4.8 km and contains 9,216 possible patches.
The terrain, region membership, and any cached scalar fields use compact typed
arrays.

Each chunk exposes a hierarchy of discardable summaries. A 6 by 6 summary
contains:

- Terrain counts and dominant presentation terrain.
- Elevation and obstruction bounds.
- Resource totals.
- Region membership counts.
- Knowledge counts.
- Traversal components and boundary portals.

Larger summary nodes aggregate these records. Uniform nodes can answer map and
visibility queries without descending to individual patches. Cache ownership
belongs to the world object and never to save state.

Generated terrain is immutable and is not saved. Saved state is sparse and
fine-patch keyed:

- Changed resource quantities.
- Piles and carcasses.
- Camps, shelter components, fires, traps, and seeps.
- Partial work and terrain changes.
- Knowledge and observations.

Knowledge uses per-touched-chunk bit fields for current-life and inherited
states rather than one JavaScript object property per patch. Untouched chunks
cost no save space.

Chunk, aggregate, route, and visibility caches use bounded least-recently-used
retention. Eviction can affect runtime only, never simulation results.

## 8. Exact hierarchical routing

Fine patches connect in eight directions. Orthogonal edges are 50 m. Diagonal
edges are `50 * sqrt(2)` metres. A diagonal edge is forbidden if either of the
two adjoining orthogonal patches is blocked, so a route cannot cut through an
impassable corner.

Edge cost derives from physical distance, terrain speed, elevation gain and
descent, surface conditions, and actor state such as injury and carried load.
Directional slope means reverse edges may have different costs.

A 6 by 6 parent is not one route node. Its static routing summary records:

- Every traversible connected component.
- Every traversible boundary patch as an exact portal.
- Which portals are connected internally.
- Exact local predecessor data needed to reconstruct paths.
- Exact links to neighboring parent portals.

Using every boundary patch gives at most 24 perimeter portals. Local searches
contain at most 36 patches. A river or cliff that divides a parent therefore
creates separate components; the macro graph cannot invent a crossing. A
single real ford remains a single real portal.

A route request attaches the exact start and destination patches to their
local components, searches the portal graph with A*, and reconstructs one
continuous fine route through each chosen parent. Diagonal transitions across
parent boundaries follow the same corner rule.

Static topology is cached by seed and parent coordinate. Actor- and
condition-dependent costs are separate overlays with explicit keys. A changed
patch invalidates its parent summary and neighboring boundary links. Weather
cost changes reuse topology unless they change passability, as safe ice can.

Tests compare hierarchical results with direct fine-grid A* on bounded maps.
The hierarchical path must be reachable exactly when the oracle path is, must
never cross a blocked patch, and must have the same cheapest cost within the
test tolerance.

## 9. Movement and targeting

The simulation advances the survivor continuously along exact fine edges.
Entering a patch immediately changes local terrain, task availability,
exposure, resources, visibility origin, and the description of where the
survivor stands.

At 50 m zoom, clicking a glyph selects that exact patch.

At aggregate zooms:

- Clicking an exact marker selects that marker's fine patch.
- Clicking ordinary ground selects the nearest reachable patch inside the
  aggregate.
- The selected fine destination is resolved and displayed before an order is
  created.
- If several exact features share a glyph, the tooltip lists them instead of
  silently choosing one.
- The tooltip states the aggregate scale and terrain composition.

Routes, task destinations, standing-order work sites, map selection, and hover
state all carry exact fine patch ids after resolution.

## 10. Local structures, resources, and tasks

All location-owned state moves to fine patch keys:

- Camps and shelter components.
- Fires, traps, seeps, piles, and carcasses.
- Partial work and depletion.
- Terrain observations and current visibility.
- Wildlife buckets and encounter sites.

A camp occupies one patch. Shelter, warmth, firelight, smoke, and sound use
physical ranges from that patch rather than applying to an old 300 m square.
Rules that intentionally reach adjacent ground must name a physical distance
or explicit neighbor relation.

Resources derive from each patch's 0.0025 square-kilometre area and its local
terrain and environmental fields. Region totals remain comparable because
they sum fine contributions, but no patch mechanically receives 1/36 of an old
parent value. Renewable and depleted stocks remain patch-local.

Task legality reads the exact work patch. Piles produced by work remain there.
Paused located work resumes only at that patch. Search and gathering behaviors
may deliberately choose several fine patches, but must expose that footprint
instead of treating a parent as one place.

## 11. Weather and local ground

Atmospheric weather remains a continuous metric field. Storm size, motion,
temperature gradients, cloud, precipitation, and wind retain their physical
scales and must not shrink by a factor of six with the grid.

Patch ground conditions derive from elevation, terrain, exposure,
precipitation, temperature, nearby water, and local shelter. Snow, wetness,
ice, and fire effects are therefore sampled at the fine patch. Region-scale
state may remain an efficient shared driver, but local task and travel answers
must include patch modifiers.

Dynamic condition versions participate in route and visibility cache keys.
Changing conditions cannot leave a cached route passable through unsafe water
or a cached visibility answer clear through new smoke.

## 12. Visibility, light, and knowledge

The close view traces exact 50 m terrain, elevation, canopy, atmospheric
attenuation, smoke, and light. Longer queries use cached elevation and
obstruction bounds to skip groups that provably cannot affect a ray. A summary
is subdivided whenever its bounds cannot prove visibility or occlusion.

Wildlife detection resolves its final line against exact fine patches.
Aggregate glyphs summarize visible, remembered, inherited, and unknown fine
patches without disclosing hidden members.

Knowledge writes compact chunk bit fields. Seeing broad open country can mark
many patches without creating thousands of object properties. Current-life
and inherited knowledge remain distinct and saveable.

## 13. Wildlife

Wildlife and player positions share the same metre coordinate system. Active
wildlife uses fine patch buckets and exact hierarchical routes. Encounter
distance, bearing, cover, sound, and line of sight use exact positions and fine
terrain.

Inactive populations remain region-level ecological state. Detailed movement
continues only in active areas, so the fine grid does not multiply worldwide
animal updates. Activation places a subject at a valid fine metric point;
deactivation preserves the ecological facts required by the existing model.

## 14. Save and world version behavior

The save schema and world-generation version both increment. A save from the
300 m world is not migrated. Load detects the old version before constructing
world state and presents a clear message that the world-generation model
changed and a new run is required. It must not partially reinterpret old cell
ids as fine ids.

Seed determinism remains mandatory within the new version. The same seed and
version produce identical fine terrain, regions, routes, resources, and
starting conditions.

## 15. Performance requirements

The architecture must satisfy these invariants:

- No whole-world fine array or whole-world fine scan. The solve's seven
  300 m arrays on `world.solved` are the one named exception: they are the
  world's authoritative height and water, they are solved once behind a
  progress bar and cached by seed, and nothing here asks them to be smaller.
- No long route searches directly across an unbounded fine grid.
- No unchanged frame rebuilds terrain, routes, or visibility.
- Unknown map ground does not force fine terrain generation.
- Repeated scheduler route checks reuse topology and matching cost results.
- Region statistics use aligned aggregate work and do not repeatedly rescan
  the same fine patches.
- Cache size is bounded and observable in diagnostics.

The implementation records baselines and gates for:

- Fresh world creation from solved arrays in hand.
- First and cached region construction.
- Cold and cached 50 m, 100 m, 300 m, and wide map renders.
- Short local and representative long routes.
- Repeated scheduler route checks.
- Close and long-range visibility.
- Save size after ordinary play and broad exploration.
- Extended headless simulation.

The fresh-world limit of two seconds remains a hard ceiling, measured from
the solved arrays in hand to a started run. The solve itself is not inside
that budget: hydrology chose its own bar and its progress bar, and this
branch does not chase the solve down to two seconds. The
closest map should not increase DOM scale: it replaces the current nested field
of more than 2,300 nodes with 2,592 ordinary glyph cells. Host-sensitive timing
tests report deterministic work counts alongside wall time so a fast machine
cannot hide algorithmic growth.

## 16. Correctness and integration tests

Automated coverage includes:

- Deterministic fine fields and bottom-up summaries.
- Stable physical field wavelengths after changing resolution.
- Compatible mixed terrain within a 300 m area.
- Exact 50 m and 100 m map output with no cosmetic micro cells.
- Orthogonal and diagonal movement costs.
- Forbidden diagonal corner-cutting.
- Disconnected parent components and a one-patch crossing.
- Hierarchical routes checked against a direct fine oracle.
- Route cache keys and local invalidation.
- Exact ownership of structures, piles, work, and resources.
- Aggregate click resolution and multiple-feature disclosure.
- Fine weather, visibility, and wildlife encounters.
- Sparse knowledge and save encoding.
- Explicit rejection of old saves.
- Simulation invariance across external advance chunk sizes.

Existing tests that express physical distances remain behavior contracts.
Tests that encode old 300 m indices or counts are rewritten to use named
spatial helpers and physical units. Balance fixtures are recalibrated after
the spatial model is correct rather than used to preserve old seed geometry.

## 17. Authentic before and after comparison

The baseline images live in `docs/close-zoom-simulation-shots/`:

- `before-100m.png`
- `before-50m.png`
- `before-scene.json`

They were captured from commit `56942580` with headless Chrome at seed 21,
start day 90, game minute 10, and a 1440 by 900 viewport at capture scale 2.
The harness used the normal landing and zoom controls. It did not assign
terrain, player position, weather, visibility, markup, CSS, or simulation
state.

At completion the implementation produces:

- `after-100m.png`
- `after-50m.png`
- `after-scene.json`

The after capture uses the same seed, start day, game minute, viewport, landing
flow, and real zoom controls. Coordinates and region ids may differ because
world compatibility is explicitly not required.

No application code may recognize or special-case this seed, capture scene,
or screenshot mode. The comparison must exercise the ordinary generator,
simulation, renderer, and controls. The before and after pairs are visually
reviewed together before completion.

## 18. Delivery boundary

This work replaces the spatial foundation as one coherent migration. It is not
complete while close terrain is merely clickable, while tasks still collapse
to 300 m ownership, or while route summaries can invent crossings.

Implementation may proceed in testable internal stages, but the branch is
delivered only when:

- 50 m terrain is authoritative.
- Both close zooms derive from it with no cosmetic micro cells.
- Movement, routing, interaction state, weather ground, visibility, and active
  wildlife use the fine model.
- Performance gates pass.
- The complete relevant test and build suites pass.
- Authentic after images have been generated and compared with the recorded
  baseline.
