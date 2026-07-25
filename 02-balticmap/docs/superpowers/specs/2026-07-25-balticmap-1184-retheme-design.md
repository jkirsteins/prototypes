# Baltic Map "Anno 1184" Re-theme - Design

Date: 2026-07-25
Status: Approved pending user review of this document
Builds on: 2026-07-25-balticmap-design.md (the NUTS-3 interactive map prototype)

## Purpose

Re-theme the existing interactive Baltic map from modern NUTS-3 statistical
regions to a plausible depiction of the eastern Baltic in 1184 AD - the year
of Meinhard's mission church at Ikšķile, the earliest well-documented anchor
for the region's tribal geography. The vibe is "roughly realistic, but not a
slave to realism": modern polygons are kept (with a few merges), renamed to
attested period lands, and regrouped from 3 countries into 9 peoples.

This map is the foundation for a later, separately specced game (turn-based
or real-time, war and trade). This spec covers only the map re-theme plus the
data-model fields the game will need. No game logic.

## Core conceptual model

Three distinct layers, deliberately kept apart:

- **Polygon name = land** (geographic identity, e.g. Tālava, Žemaitija).
- **Color = people** (broad ethnocultural identity, e.g. Latgalians).
- **Factions = political actors inside lands** (chiefs, lineages, princes).
  Factions are OUT OF SCOPE here; they arrive in the game spec. Nothing in
  this map may imply a land or a people is a unified polity.

Compound land names (see roster) are explicit cartographic compromises where
one polygon bundles two attested lands; panel text explains the bundling.

## Land roster (15 provinces)

| # | Land (display name) | Slug (id) | Built from (NUTS 2013) | Peoples (first = primary/color) |
|---|---------------------|-----------|------------------------|----------------------------------|
| 1 | Rävala | ravala | EE001 Põhja-Eesti | Estonians |
| 2 | Virumaa | virumaa | EE007 Kirde-Eesti | Estonians |
| 3 | Järvamaa | jarvamaa | EE006 Kesk-Eesti | Estonians |
| 4 | Läänemaa-Saaremaa | laanemaa-saaremaa | EE004 Lääne-Eesti | Estonians |
| 5 | Ugandi-Sakala | ugandi-sakala | EE008 Lõuna-Eesti | Estonians |
| 6 | Līvzeme | livzeme | LV006 Riga + LV007 Pierīga (merged) | Livs |
| 7 | Kursa | kursa | LV003 Kurzeme | Curonians |
| 8 | Zemgale-Sēlija | zemgale-selija | LV009 Zemgale | Semigallians, Selonians |
| 9 | Tālava | talava | LV008 Vidzeme | Latgalians, Livs |
| 10 | Jersika | jersika | LV005 Latgale | Latgalians |
| 11 | Pilsotas | pilsotas | LT003 Klaipėdos | Curonians |
| 12 | Žemaitija | zemaitija | LT008 Telšių + LT007 Tauragės + LT006 Šiaulių (merged) | Samogitians |
| 13 | Aukštaitija | aukstaitija | LT002 Kauno + LT005 Panevėžio + LT009 Utenos + LT00A Vilniaus (merged) | Aukštaitians |
| 14 | Sūduva | suduva | LT004 Marijampolės | Yotvingians |
| 15 | Dainava | dainava | LT001 Alytaus | Yotvingians |

Historiographical notes (recorded so the compromises stay deliberate):

- **Ugandi-Sakala**: Sakala and Ugandi behave as distinct major lands in the
  early 13th-century record; the compound name marks the merge as a map
  compromise, not a claim that Sakala was part of Ugandi.
- **Läänemaa-Saaremaa**: Saaremaa (Osilia) was politically distinctive; the
  compound identity avoids calling the whole polygon Läänemaa. Panel text
  notes the Osilians' maritime prominence.
- **Zemgale-Sēlija**: the NUTS Zemgale polygon includes Sēlija (south bank of
  the Daugava: Jēkabpils, Aizkraukle). Selonians are represented in the
  peoples list and by a map label, though no polygon is colored for them
  alone. This is the accepted compromise for keeping the polygon.
- **Jersika** is used instead of the general regional label "Latgale" because
  the polygon covers the southeastern Latgalian area along the Daugava where
  the Jersika principality sat; a 12th-century political name fits better
  beside Tālava and Līvzeme.
- **Aukštaitija** is a geographic/cultural umbrella, not an 1184 polity. Its
  flavor text names the rival lands inside it (Lietuva, Deltuva, Nalšia,
  Upytė). The game spec may later host multiple competing factions there.
- **Pilsotas** covers the Curonian coastal lands of Lithuania; flavor text
  notes Mēguva.
- **Tālava** lists Livs as a secondary people (Gauja Livs at Turaida etc.).
- **1184 anchor**: Meinhard's church at Ikšķile is conventionally dated 1184;
  Riga is not yet a city (episcopal centre only after 1201), which is why the
  Riga polygon dissolves into Līvzeme.

## Peoples and palette

A `peoples` table with 9 entries replaces the 3 countries:

| People id | Display name |
|-----------|--------------|
| estonians | Estonians |
| livs | Livs |
| latgalians | Latgalians |
| curonians | Curonians |
| semigallians | Semigallians |
| selonians | Selonians |
| samogitians | Samogitians |
| aukstaitians | Aukštaitians |
| yotvingians | Yotvingians |

- Each land is filled with the color of its FIRST people. Palette: same
  pastel family as the current map, 9 distinguishable hues chosen at
  implementation time; sea and neighbor-country greys unchanged.
- Selonians have a table entry and a map label but color no polygon; that is
  intentional and documented above.
- Cross-border peoples (Curonians: Kursa + Pilsotas; Latgalians: Tālava +
  Jersika; Yotvingians: Sūduva + Dainava) visually dissolve the modern
  three-country reading.

## Labels and framing

- The ESTONIA / LATVIA / LITHUANIA labels are removed. In the same
  typographic style, people labels are placed over their areas: ESTONIANS,
  LIVS, LATGALIANS, CURONIANS, SEMIGALLIANS, SELONIANS (smaller, along the
  lower Daugava south bank), SAMOGITIANS, LITHUANIANS (over Aukštaitija),
  YOTVINGIANS. Label positions are hand-tuned coordinates in the data-prep
  script, like the current country labels.
- Neighbor territories get atmospheric geographic labels that claim no
  polity: "Lands of Rus'" (spanning the RU and BY shapes, one label), 
  "Prussian lands" (the PL shape - the adjacent territory in 1184 is
  Prussian), "Swedish lands" (SE), "Finnic lands" (FI). Note: Prussians and
  Swedes are peoples, Rus' is a political/cultural world of multiple
  principalities; the "lands of" phrasing keeps these categories from being
  presented as equivalent unified polities.
- Title cartouche in the sea area: "Anno Domini 1184" with subtitle
  "the lands of the eastern Baltic". This is what dates the map.
- Page `<title>` and header text updated to match the new theme.

## Info panel

The placeholder fields are replaced by period content per land:

- Land name (diacritic display form).
- Peoples line, phrased as predominance, not statehood: e.g. "predominantly
  Latgalian, with Liv settlements on the Gauja".
- Flavor blurb: 2-3 chronicle-flavored sentences per land mentioning real
  places and the land's situation in 1184 (Ikšķile's new stone church in
  Līvzeme; Jersika's castle on the Daugava; Saaremaa raiders; the rival
  lands within Aukštaitija; etc.).
- "Notable places" line (short list of period place names).

No game stats. The panel layout/structure should leave room to add stat rows
later without redesign.

## Data model (src/data/map.json)

```
{
  width, height, attribution,
  year: 1184,
  peoples: [ { id, name, color } x 9 ],
  regions: [ {
    id: "talava",           // slug, replaces NUTS code
    name: "Tālava",         // diacritic display form
    peoples: ["latgalians", "livs"],  // first = primary = fill color
    flavor: "...",
    places: ["Beverīna", "Trikāta"],
    path: "M..."
  } x 15 ],
  neighbors: [ { id, path } ],        // unchanged shapes
  labels: [ { text, x, y, kind: "people" | "neighbor" | "title" } ]
}
```

NUTS provenance (which modern units each land came from) lives in the
prepare script's config, not in the runtime JSON.

## Pipeline changes (scripts/prepare-data.mjs)

- Add a merge table: NUTS ids -> land definition (slug, name, peoples,
  member NUTS ids).
- Merge member geometries BEFORE projection with a topology-safe union
  (e.g. topojson.merge over the shared arcs, or polygon union at GeoJSON
  level) so shared internal borders dissolve cleanly; then project and emit
  one path per land. Merged paths must be valid non-empty geometry.
- Flavor text, places, peoples table, and label positions live in the
  script's config section and are emitted into map.json.
- Output JSON remains committed; runtime app remains dependency-free.

## Runtime changes

- src/map-render.ts: fill by people color via the peoples table; render the
  new label kinds (people/neighbor/title) with appropriate styles.
- src/panel.ts: render peoples line, flavor, places.
- Types in src/types.ts updated to the new schema.
- Interaction (hover, click, select, pan, zoom) unchanged.

## Testing

- Update existing tests: region count 21 -> 15; name/id assertions updated
  to the new slugs.
- New data validation test: every region's people ids resolve to the peoples
  table; every region path non-empty; peoples table has exactly 9 entries;
  labels include the title cartouche and all 9 people labels.
- Interaction tests unchanged in behavior.

## Out of scope (next spec: the game)

- Turn structure (1 turn = 1 year vs real time), war, trade.
- Factions (political actors inside lands), including multiple rival
  factions within one land (e.g. Aukštaitija).
- Any events (the crusade, founding of Riga in 1201, etc.).
