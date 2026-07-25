# Balticmap: Settlement Slots and Full Land Coverage - Design

Date: 2026-07-25
Status: Approved

## Goal

Every land starts with exactly one visible settlement; the data model gains
population-correlated settlement slots ("max cities") so more settlements
can be unlocked later. Also close a coverage gap: Estonia's interior rivers.

## Decisions

- Slot formula: `maxSettlements = clamp(round(population / 10000), 1, 10)`,
  computed and baked into map.json by the pipeline. With current
  populations (10k-90k) this yields 1-9 slots.
- Start state: exactly one unlocked settlement per land. The five existing
  second-settlements become authored-but-locked entries.
- Locked settlements stay in map.json (`unlocked: false`) and are NOT
  rendered; no unlock mechanic yet (YAGNI - data model only).
- Seven new primary settlements fill the lands that had none.
- Rivers addendum: add Emajogi and Parnu to the river whitelist.

## Data model (`src/types.ts`)

- `Settlement` gains:
  - `land: string` - id into MapData.regions
  - `unlocked: boolean`
- `Region` gains:
  - `maxSettlements: number`

## Content

New settlements (all `unlocked: true`, primary for their land, ca. 1100
sites; coordinates refined during implementation against the land
polygons):

| id | name | land | lon | lat |
|---|---|---|---|---|
| tarvanpea | Tarvanpea | virumaa | 26.36 | 59.35 |
| kareda | Kareda | jarvamaa | 25.72 | 58.93 |
| viliende | Viliende | sakala | 25.60 | 58.36 |
| medvegalis | Medvėgalis | zemaitija | 22.11 | 55.63 |
| utena | Utena | eastern-aukstaitija | 25.60 | 55.50 |
| sudargas | Sudargas | suduva | 22.65 | 55.06 |
| punia | Punia | dainava | 24.09 | 54.51 |

Each gets a one-line ca.-1100 note in the established tone (plain,
understated, no titles).

Existing settlements gain `land` and `unlocked`:

- Unlocked primaries: lindanise (ravala), varbola (harjumaa), soontagana
  (laanemaa), valjala (saaremaa), tarbatu (ugandi), daugmale (livzeme),
  talsi (kursa), tervete (zemgale), selpils (selija), trikata (talava),
  jersika (jersika), impiltis (pilsotas), kernave (lietuva).
- Locked (`unlocked: false`): ikskile (livzeme), koknese (jersika),
  otepaa (ugandi), mezotne (zemgale), apuole (pilsotas).

Result: 25 authored settlements, exactly 20 unlocked - one per land.

## Pipeline (`scripts/prepare-data.mjs`)

- SETTLEMENTS entries gain `land` and `unlocked`.
- Region emit gains `maxSettlements` from the formula.
- New build-time validations (throw on failure):
  1. Every settlement's `land` is a known land id.
  2. Every land has exactly one unlocked settlement.
  3. Authored settlements per land <= that land's maxSettlements.
  4. `geoContains(landFeature, [lon, lat])` holds for each settlement's
     claimed land (uses d3-geo on the pre-projection land features) -
     catches curation errors before they bake into the data.
- Rivers: add `emajogi` (match: emajogi, emajõgi) and `parnu` (match:
  parnu, pärnu) as minor rivers, warn-and-skip semantics like the others.

## Rendering and UI

- `map-render.ts`: only `unlocked` settlements get dots and labels.
  `settlementDots` keys only unlocked ids.
- `panel.ts`: region panel gains one line, class `panel-settlements`,
  text: `Settlements: <unlocked settlement name> (1/<maxSettlements>)`.
  The panel needs access to the settlements list to resolve the land's
  unlocked settlement.
- Tooltips and interaction unchanged (locked settlements have no DOM
  presence, so no interaction cases).

## Testing

- data.test.ts: 25 authored / 20 unlocked / one unlocked per land; every
  settlement's land resolves; maxSettlements matches the formula for
  every region (recompute in test); per-land authored count <= max; spot
  checks (ravala max 1, eastern-aukstaitija max 9, kursa max 5); rivers
  list may now include emajogi/parnu (test range widens accordingly).
- render.test.ts: dots/labels rendered = unlocked count only; a locked id
  (e.g. ikskile) has no dot.
- panel.test.ts: settlements line text for a sample region.
- interaction.test.ts: existing settlement tests keep passing against an
  unlocked id.
- Final e2e Chrome pass (standing rule): 20 dots, no label collisions
  (the 7 new labels checked), panel line, Estonian rivers visible.
