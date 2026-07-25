# Baltic Map 1184 - Factions and 21-Land Roster - Design

Date: 2026-07-25
Status: Approved pending user review
Builds on: 2026-07-25-balticmap-population-design.md

## Purpose

Add a political layer on top of ethnicity: every polygon is the territory of
exactly one faction, drawn from the polygon's primary ethnicity. Polygon fill
color becomes per-faction, with faction colors chosen as shades within each
ethnicity's hue family (the classic historical-atlas convention), so ethnic
geography stays readable at a glance. The map grows from 15 to 21 lands so
that historically conspicuous actors (Saaremaa, Ugandi, Sakala, Harjumaa,
Selonians, Lietuva) do not disappear inside merged polygons. Treat each
polygon as the territory of a regional coalition, not a unified state.

## The 21-land roster

Population stays anchored at 650,000 total (180k Estonian lands, 175k
modern-Latvia area, 295k modern-Lithuania area), all multiples of 5,000.
Splits subdivide the previous numbers; unchanged lands keep theirs.

| Land | Faction | Type | Ethnicity | Pop | Cohesion |
|---|---|---|---|---:|---|
| Ravala | Ravalans | county | estonians | 10,000 | medium |
| Harjumaa | Harjuans | county | estonians | 20,000 | medium |
| Virumaa | Vironians | county | estonians | 35,000 | medium |
| Jarvamaa | Jarvans | county | estonians | 25,000 | medium |
| Laanemaa | Laanians | county | estonians | 25,000 | medium |
| Saaremaa | Osilians | island-league | estonians | 15,000 | high |
| Ugandi | Ugandians | county | estonians | 30,000 | medium |
| Sakala | Sakalans | county | estonians | 20,000 | medium |
| Livzeme | Lower Daugava Livs | land-coalition | livs | 20,000 | medium |
| Kursa | Curonian Confederacy | regional-confederacy | curonians | 45,000 | high |
| Zemgale | Semigallian Confederacy | regional-confederacy | semigallians | 30,000 | high |
| Selija | Selonians | land-coalition | selonians | 15,000 | low |
| Talava | Talavians | chiefdom | latgalians | 30,000 | high |
| Jersika | Jersikans | principality | latgalians | 35,000 | high |
| Pilsotas | Pilsotas Curonians | land-coalition | curonians | 15,000 | medium |
| Zemaitija | Samogitian Confederacy | regional-confederacy | samogitians | 70,000 | low |
| Lietuva | Lietuva | land-coalition | aukstaitians | 60,000 | medium |
| Eastern Aukstaitija | Eastern Aukstaitian Confederacy | land-coalition | aukstaitians | 90,000 | low |
| Suduva | Sudovians | land-coalition | yotvingians | 30,000 | low |
| Dainava | Dainavians | land-coalition | yotvingians | 30,000 | low |

Judgment calls baked in:

- Saaremaa is cohesion high (organized maritime raiding league); Osilians
  punch above their 15k.
- Zemgale moves medium -> high now that the Selonians are unbundled; Selija
  is low (scattered along the river, no single center).
- Lietuva is a land-coalition, not a duchy: "duchy" would overstate 1184
  consolidation. Its flavor text carries the consolidation story instead.
- Faction names are plain demonyms or plain land names. No titles, no
  "Dukes of X".
- Absorbed smaller lands live in flavor text only, not polygons:
  Vanema, Ventava and Bandava under Kursa; Meguva under Pilsotas; Koknese
  under Jersika; Deltuva, Nalsia and Upyte under Eastern Aukstaitija;
  Karsuva under Zemaitija; the various Daugava and Gauja Liv communities
  under Livzeme (Lower Daugava Livs).
- Display names in data keep native diacritics, matching the existing map
  data (e.g. "Ravala" appears as its native form in `name` fields).

## Data model (src/types.ts)

```
type FactionType =
  | "county"
  | "island-league"
  | "regional-confederacy"
  | "principality"
  | "chiefdom"
  | "land-coalition";

interface Faction {
  id: string;        // "ravalans"
  name: string;      // "Ravalans"
  ethnicity: string; // id into MapData.peoples
  type: FactionType; // descriptive only - no mechanics yet
  color: string;     // polygon fill; a shade within the ethnicity hue family
}

interface Region {
  // existing fields stay
  faction: string;   // id into MapData.factions; 1:1 with regions for now
  peoples: string[]; // primary ethnicity first, minorities after
}

MapData.factions: Faction[];
```

Fill color moves from `people.color` to `faction.color`. Peoples keep their
color as the family base hue (labels, legend, future use). `peoples[0]` of a
region must equal its faction's `ethnicity`. Minority peoples remain listed
(e.g. Livs in Talava).

## Colors: hue families

Each ethnicity keeps its hue; its factions get distinct shades of it.

- Single-faction ethnicities keep their current color unchanged: Livs
  #a8c8cf, Semigallians #e8d18b, Selonians #c7b3d6 (its reserved color
  finally colors a polygon), Samogitians #c9b17f.
- Two-faction families get a base + darker sibling, roughly:
  Curonians #d9986f / #c48257, Latgalians #e5b28e / #d69b6f,
  Aukstaitians #e6d9b8 / #d9c48f, Yotvingians #d1a3a0 / #bd8a87.
- Estonians are the stress case: 8 greens spanning light sage to deep moss.
  Exact hexes are hand-tuned at implementation under one rule: polygons of
  the same family that share a border must differ clearly in lightness.
  Verified visually in Chrome, not by an automated metric.

## Geometry pipeline (scripts/prepare-data.mjs)

- Estonia and Latvia rebuild from GISCO LAU municipality polygons (latest
  post-reform vintage: 79 EE, 43 LV municipalities), grouped per land by
  explicit code lists in the script. Lithuania stays NUTS-3 based but moves
  to the same GISCO vintage year as the LAU set so EE/LV/LT seams match;
  the neighbor-country layer moves to the same vintage.
- Lietuva = Kauno + Vilniaus counties; Eastern Aukstaitija = Panevezio +
  Utenos. Saaremaa = the island municipalities (Saaremaa, Hiiumaa, Muhu,
  Ruhnu, Vormsi as grouped by LAU) - no geometric island extraction needed.
- Daugava split rule for Selija/Jersika: Selonia is the left (south) bank.
  Aizkraukle and Jekabpils municipalities straddle the river, so both are
  split along a hand-traced Daugava polyline (clipped with a polygon
  library): right/north bank, including Koknese and Krustpils, goes to
  Jersika; left/south bank, including Selpils, goes to Selija. Jekabpils
  splits for the same reason plus contiguity: without it the north-bank
  Aizkraukle piece could not touch the rest of Jersika. Left-bank parts of
  Augsdaugava municipality (historic Ilukste-area Selonia) stay under
  Jersika as a documented abstraction to avoid slicing a third
  municipality.
- The municipality-to-land mapping is a game abstraction, documented as
  commented lists in the prepare script (provenance only, not output),
  exactly like today's NUTS lists.

## Display

- Panel gains a faction line above the peoples line:
  `Faction: Curonian Confederacy (regional confederacy)` - type shown
  lowercase with spaces, in the same muted style as the peoples line.
- Tooltip line 2 becomes `Curonian Confederacy - ~45k - high cohesion`.
- Map labels: ethnic-group labels stay (hue families keep them truthful);
  positions re-tuned for the 21 polygons; SELONIANS becomes a normal people
  label over its own polygon.
- Every split or absorbing land gets new or edited flavor text mentioning
  its absorbed smaller lands (see roster section).

## Validation and tests

Prepare-script hard checks (throw on violation):

- populations are positive multiples of 5,000 and total exactly 650,000;
- every region's faction id exists; the faction-to-region mapping is 1:1;
- each faction's ethnicity equals its region's `peoples[0]`;
- faction colors are unique; single-faction ethnicities reuse the people
  color exactly.

Tests updated/added:

- data test: 21 regions; the checks above mirrored as assertions.
- panel test: faction line renders name plus spaced lowercase type.
- tooltip test: line 2 is `<faction> - ~<pop>k - <cohesion> cohesion`.
- Full suite and build green; e2e verify in Chrome before claiming done
  (color distinguishability of the 8 Estonian greens is checked here).

## Out of scope

- Any mechanical effect of faction type or cohesion (mobilization, war,
  trade) - game spec.
- Factions spanning multiple regions (the model allows it later; data is
  1:1 today).
- Sub-faction population splits for absorbed lands - flavor text only.
- Population change over time.
