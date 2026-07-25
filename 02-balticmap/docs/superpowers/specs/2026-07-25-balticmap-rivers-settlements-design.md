# Balticmap: River Layer, Settlements, and Shift to 1100 - Design

Date: 2026-07-25
Status: Approved (approach A)

## Goal

Add a real-data river layer (the main trade arteries) and a curated set of
settlement markers on top of the existing land polygons, and shift the map's
setting from 1184 to 1100.

## Decisions

- River scope: major arteries only, roughly 9 rivers.
- River geometry source: Natural Earth (approach A below).
- Settlements: hand-curated list of sites attested ca. 1100, with real
  modern coordinates and period-appropriate names.
- Year: full shift to 1100 (YEAR constant, labels, light faction/flavor
  sanity pass). The 20-land roster stays.
- Interactivity: settlements get hover tooltips (name plus a one-line
  note); rivers are purely visual.

## River data source (approach A: Natural Earth)

Natural Earth publishes public-domain river centerline data:
`ne_10m_rivers_lake_centerlines` plus the `ne_10m_rivers_europe`
supplement, available as GeoJSON. The build script downloads both (cached
in `scripts/.cache`, same pattern as the GISCO sources), then:

1. Selects features whose name matches a whitelist: Daugava, Nemunas
   (Neman), Neris, Gauja, Venta, Lielupe, Musa, Memele, Narva. Name
   matching must handle Natural Earth's naming variants (e.g.
   "Zapadnaya Dvina" / "Daugava", "Neman" / "Nemunas").
2. Merges each river's segments into one feature per river.
3. Clips to the map's lon/lat frame.
4. Projects with the existing azimuthal equal-area projection.
5. Emits `rivers: [{id, name, path}]` into `src/data/map.json`.

If a whitelisted river is missing from Natural Earth or too coarse, we
accept the gap or hand-patch that one river; we do not switch sources.

Attribution string gains "Rivers: Natural Earth".

Rejected alternatives: OSM/Overpass (slow, flaky in builds, far too
detailed for this scale); hand-tracing all rivers (not real sourced data,
tedious, error-prone).

## Settlements (ca. 1100)

A curated constant in `scripts/prepare-data.mjs`: about 15 sites attested
for ca. 1100, each with real lon/lat, a period-appropriate name, and a
one-sentence tooltip note. Candidate list (final list fixed during
implementation research):

- Daugmale - major Liv hillfort and trade center, at its peak ca. 1100
- Ikskile - Liv village on the Daugava (no German church yet; that is 1184+)
- Koknese, Jersika, Selpils - Daugava strongholds
- Tervete, Mezotne - Semigallian centers
- Talava/Beverina area - Latgalian center
- Tarbatu, Lindanise, Otepaa, Varbola, Soontagana - Estonian sites
- Apuole, Impiltis - Curonian hillforts
- Kernave - Aukstaitian center

Riga is deliberately absent - it does not exist in 1100.

Emitted as `settlements: [{id, name, note, x, y}]` (projected viewBox
coordinates).

## Year shift to 1100

- YEAR constant 1184 -> 1100; title/subtitle labels update.
- Light sanity pass over faction names and flavor text for ca. 1100:
  the 20-land structure stays; adjust any wording that implies
  late-1100s events. Consolidation language stays understated.
- Settlement notes must be valid for ca. 1100 specifically.

## Rendering

Two new SVG groups in `map-render.ts`, inserted between `regions` and
`labels` (DOM order: sea < neighbors < regions < rivers < settlements <
labels):

- `rivers`: blue stroked paths, `fill: none`, `pointer-events: none`.
  One consistent stroke width, slightly wider for Daugava and Nemunas.
  No width tapering.
- `settlements`: small filled circles plus text labels. Only the dot is
  hit-testable; labels are `pointer-events: none` so region hover/click
  beneath is unaffected.

River name labels: only the 3-4 biggest rivers, added as plain entries in
the existing labels array with a suitable label kind.

## Interactivity

Settlement dots reuse the existing tooltip pathway in `interaction.ts`:
`pointerenter`/`pointerleave` handlers surface name plus note through the
hover callback (either a generalized hover payload or a parallel
`onHoverSettlement` callback - implementer's choice, keep it consistent
with the existing style). Clicking a settlement does nothing; clicks pass
through to the region only when not on the dot itself. Rivers are
non-interactive.

## Data model additions (`src/types.ts`)

- `River { id, name, path }`
- `Settlement { id, name, note, x, y }`
- `MapData` gains `rivers: River[]` and `settlements: Settlement[]`;
  `year` becomes 1100.

## Testing

- map.json: rivers and settlements present; paths/coordinates fall inside
  the viewBox frame; no settlement named Riga; year is 1100 everywhere it
  appears.
- Rendering: new groups exist with correct DOM order; settlement dots are
  hit-testable, river paths are not.
- Interaction: hovering a settlement dot fires the tooltip callback with
  name and note; leaving clears it.
- Final visual verification in Chrome (standing rule: happy-dom is not
  enough).
