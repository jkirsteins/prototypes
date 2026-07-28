# Prussian lands: extending the map south and west

Design, 2026-07-28.

## Goal

Extend the 1100 map to cover the lands of the Old Prussians. Today the map
stops at the modern Lithuanian border, which is an artifact of 2026 politics
and not of 1100: the Prussian lands were the densest and wealthiest Baltic
territory of the period, and the map's Yotvingian lands are cut off halfway
through their own territory by that border.

The roster grows from 20 lands to 26. Six new Prussian lands are added, three
existing lands are re-cut, and the view gains a zoom floor so that showing
more ground does not mean rendering every land smaller.

## Decisions taken

These were settled during brainstorming and are not open questions:

- **Granularity: 6 consolidated lands**, not the full 9-10 historic divisions.
  The thin and wilderness lands are merged into their neighbours.
- **Geometry: whole administrative units from geoBoundaries ADM2.** Polish
  powiats and Kaliningrad rayons, clipped to the GISCO country outlines. No
  hand-traced cut lines anywhere. See "Why geoBoundaries ADM2" below.
- **Existing lands are re-cut.** `pilsotas` gives up Skalvian ground;
  `suduva` and `dainava` extend south across the modern border.
- **Victory threshold scales with the roster** rather than staying a
  hardcoded 11.
- **One new people, `prussians`**, with six faction shades in one hue family.
  Yotvingians stay a separate people, as they are today.
- **The map gains a minimum zoom.** The whole map is no longer visible at
  once; the player pans.

## Why geoBoundaries ADM2

The existing pipeline builds lands from whole administrative units: EE and LV
from GISCO LAU 2023 municipalities keyed by `LAU_NAME`, LT from GISCO NUTS-3
counties keyed by `NUTS_ID`. The new territory should work the same way. It
cannot use GISCO, for two separate reasons.

Kaliningrad has no LAU or NUTS coverage at all. It appears in GISCO only as
part of the undivided `RU` country polygon.

Poland has LAU gminas in GISCO, but they cannot be keyed. Measured, not
assumed: 203 gminas fall in the Prussian area with 22 name collisions, the
usual urban and rural pairs (Bartoszyce, Elblag, Ketrzyn); `LAU_ID` is the
constant `"1.0042"` for every Polish feature; and `GISCO_ID` does not decode
to a verifiable TERYT powiat code. GISCO publishes no powiat level, which is
the granularity the Prussian lands actually need.

**geoBoundaries ADM2** (OpenStreetMap-derived, ODbL) supplies exactly the
missing levels: 380 Polish powiats and city-counties, and the 22 rayons and
urban okrugs of Kaliningrad Oblast. Verified against the data: all 28 Polish
units the roster needs exist under unique, readable names, and the 22
Kaliningrad units partition the oblast exactly.

This means **no hand-traced cut lines at all**. Every Prussian land is a union
of whole administrative units, exactly like every existing land on the map.
An earlier draft of this design proposed hand-tracing eight cut lines through
Kaliningrad and Poland; that approach is rejected. Hand-drawn borders do not
survive contact with the source data, cannot be verified, and would have made
every future edit a fresh act of cartography.

Two consequences of mixing sources, both handled:

- **Ring winding.** geoBoundaries winds rings opposite to the GISCO and
  d3-geo spherical convention, so an unrewound ring reads as the whole globe
  minus a hole. The pipeline's existing `rewind` helper is applied on load.
  This is not theoretical: it silently produced garbage in every measurement
  taken during design until it was applied.
- **Border disagreement.** Being OSM-derived, geoBoundaries outer borders do
  not exactly match GISCO's. Measured on the frontier units, the worst case
  is `powiat elblaski` straying 3.0 km2 outside the GISCO Poland outline, on
  a 1310 km2 unit - 0.23%, well under a pixel at map scale. Each unit is
  nonetheless intersected with its GISCO country polygon, so every
  international border and coastline on the map keeps coming from GISCO
  exactly as it does today, and only the internal divisions come from
  geoBoundaries.

The source is pinned to a specific geoBoundaries release commit so the build
is reproducible, and cached alongside the GISCO and Natural Earth downloads.

### Selecting the units

Poland is selected by `shapeName`. The names are Latin, unique and meaningful
- `powiat kwidzynski` is the powiat around Kwidzyn, the Prussian Kwedis.

Kaliningrad is **not** selected by name. Its units carry Soviet-era names
honouring Bagration, Chernyakhovsky and Nesterov, which mean nothing on a map
of 1100, and five of them are Cyrillic and truncated in the source
(`Mamonovskiy gorodskoy okru`). Instead each unit is selected by a point at
the Prussian place it is centred on - Twangste, Tapiau, Ragaine, Labguva,
Tilze - and the pipeline takes whichever polygon contains that point. The
configuration therefore reads as Prussian geography and never as modern
Russian administration, and no Cyrillic appears anywhere in the codebase.

Verified: 22 points resolve to 22 distinct rayons covering the whole oblast,
with no duplicates and none unclaimed.

## The roster

### New people

One entry, `prussians`, with a base hue. Six factions take shades within that
family, following the pattern the eight Estonian greens already establish.
Faction names are plain demonyms, with no titles.

### New lands

| id | name | faction | population | cohesion |
|---|---|---|---|---|
| `semba` | Semba | Sembians | 35,000 | high |
| `notanga` | Notanga | Natangians | 30,000 | medium |
| `nadrawa` | Nadrawa | Nadruvians | 25,000 | low |
| `warmi` | Warmi | Warmians | 30,000 | medium |
| `pamede` | Pamede | Pomesanians | 30,000 | medium |
| `galinda` | Galinda | Galindians | 15,000 | low |

Territory:

- **Semba** is the Kaliningrad peninsula north and west of the Pregolya: the
  amber coast, the densest Prussian settlement, and the trade shore facing
  Gotland.
- **Notanga** is south-central Kaliningrad together with Bartia on the Polish
  side.
- **Nadrawa** is eastern Kaliningrad together with Skalvia and Lamata on both
  banks of the lower Nemunas, including the Lithuanian municipalities taken
  from Pilsotas.
- **Warmi** is Warmia together with Pogesania.
- **Pamede** is Pomesania together with Sasna, running west to the Vistula.
- **Galinda** is the Masurian lake country, thinly settled and largely forest.

Faction `type` values come from the existing `FactionType` union. No new
types are introduced: these are `land-coalition` and `chiefdom`.

### Changes to existing lands

- `pilsotas`: 15,000 to 10,000. Loses Silute, Pagegiai and Neringa to
  Nadrawa, leaving Klaipeda, Palanga, Kretinga and Skuodas. This is the
  correct extent of Pilsotas and Meguva; the current land is the whole modern
  Klaipeda county, which reaches into Skalvian and Lamatan ground.
- `suduva`: 30,000 to 35,000. Extends south into the Suwalki area.
- `dainava`: 30,000 to 35,000. Extends south into the Augustow area.

### Population budget

`EXPECTED_TOTAL_POPULATION` goes from 650,000 to **820,000**:

```
650,000  current
 -5,000  pilsotas 15,000 -> 10,000
+10,000  suduva and dainava, +5,000 each
+165,000 six new Prussian lands
-------
820,000
```

These are deliberate game estimates in the same spirit as the existing
numbers, not a census. The Prussian total of roughly 165,000 is in line with
the commonly cited scale for the Prussian lands in the period, and sits
sensibly against the map's existing 180,000 Estonian anchor.

`maxSettlements` is derived by the existing formula and needs no change.

### Settlements

One unlocked settlement per new land, held to the bar the existing data sets:
attested or archaeologically grounded, at the real coordinates of the site,
with a one-line note that is true specifically in 1100.

Candidates: Kaup for Semba, Honeda at Balga for Notanga, Ragaine for Nadrawa,
Lecbarg for Warmi, Kwedis for Pamede, Staswiny for Galinda.

Each site and its 1100-validity is verified during implementation. Truso is
explicitly excluded: the emporium was long dead by 1100, so it fails the
note-must-be-true-in-1100 rule the same way Riga does.

The pipeline's existing `geoContains` guard will catch any site whose
coordinates do not actually fall inside the land claiming it. It already has:
Balga's true position on its headland at 19.97E, 54.57N falls outside the
simplified geoBoundaries coastline, so Honeda is placed a little inland at
19.99E, 54.55N. This is the only place the simplified geometry is visibly
coarser than GISCO, and it moves the dot by under two kilometres.

## Pipeline changes

All in `scripts/prepare-data.mjs`.

### Loading geoBoundaries

Two new cached downloads, pinned to a geoBoundaries release commit: the POL
and RUS ADM2 simplified GeoJSON files. On load every feature is rewound and
intersected with its GISCO country polygon, then enters the member pool under
its selection key.

### Kaliningrad

The 22 units of the oblast are selected by Prussian-place point containment
as described above, and grouped into three lands:

- **Semba**: Twangste, Kaup, Rusemoter, Pioneru, Palvininkai, Neuhausen,
  Zimmerbude, Pillau - the peninsula north of the Pregolya and west of the
  Deima.
- **Notanga**: Honeda, Heiligenbeil, Ludwigsort, Friedland, Tapiau - the
  country south of the Pregolya, plus Bartia on the Polish side.
- **Nadrawa**: Insterburg, Gumbinnen, Stalupenai, Lazdynai, Darkiemis,
  Ragaine, Gastos, Tilze, Labguva - the east and the lower Nemunas.

The pipeline asserts that the selection points resolve one-to-one onto the
oblast's units, that none is claimed twice, and that none is left over. That
assertion is the guard the hand-traced approach could never have.

### Poland

28 whole powiats and city-counties, selected by `shapeName`:

- **Warmi**: braniewski, lidzbarski, elblaski, olsztynski, Elblag, Olsztyn
- **Pamede**: kwidzynski, sztumski, malborski, ilawski, ostrodzki,
  nowomiejski, dzialdowski
- **Galinda**: mragowski, gizycki, piski, szczycienski, elcki, wegorzewski,
  nidzicki
- **Notanga** also takes bartoszycki and ketrzynski, which are Bartia
- **Suduva** extends into goldapski, olecki, suwalski, sejnenski, Suwalki
- **Dainava** extends into augustowski

`powiat nowodworski`, the Vistula delta, is deliberately excluded: Zulawy
marsh, Pomerelian rather than Pomesanian ground in 1100.

The Polish member pool is this whitelist, not all 380 powiats, so the
partition check guards that the whitelist is exactly claimed - it still
catches a typo or a double claim, but it cannot catch a Prussian powiat
nobody thought to list. That is an accepted and deliberate weakening,
recorded here so it is not mistaken for an oversight.

### Lithuania

LT023 stops being a NUTS member. Its seven LAU municipalities enter the pool
instead. Verified: all 60 LT LAU names are unique, so they key by `LAU_NAME`
exactly as EE and LV do. This lets Silute, Pagegiai and Neringa join Nadrawa
while Pilsotas keeps the rest.

The remaining LT lands continue to use NUTS-3, and no Lithuanian land
takes any geoBoundaries unit.

### Adjacency

Two failure modes, both handled:

- The Prussian lands come from geoBoundaries while their Estonian, Latvian
  and Lithuanian neighbours come from GISCO. Vertices across that seam will
  not match, so neither arc-sharing nor the existing coordinate-matching
  fallback will fire. Clipping to the GISCO country outline does not help
  here: it aligns the outer edge of the union, not the individual vertices.
- Units from the same geoBoundaries file share exact vertices along their
  common borders, so the coordinate fallback handles every border internal to
  Poland or internal to Kaliningrad without help.

`SEA_LINKS` is generalized to `AUTHORED_LINKS`, carrying both the existing
island sea links and the new cross-source land seams, each with a comment
explaining why it cannot be derived. The existing "every region has at least
one adjacency" guard stays and will catch an omission.

### Attribution

geoBoundaries is ODbL, which requires attribution. The `attribution` field in
`map.json` gains a clause naming geoBoundaries and OpenStreetMap contributors.
`tests/data.test.ts` asserts that string exactly and must be updated with it.

### Rivers and labels

Rivers added: Pregolya, Vistula, Lyna. Whitelist entries follow the existing
`match` convention with Natural Earth naming variants. All three are minor
except the Vistula, which is major.

### Neighbors

A neighbor is the non-playable remainder of the world, so it must not overlap
playable land. Relying on the region polygons to paint over it would leave
the data wrong even though the render looks right, and would put a stale
duplicate of every Prussian land inside the `RU` and `PL` paths.

Two rules:

- **Subtract playable land.** The union of the claimed Kaliningrad units is
  subtracted from `RU`, and the union of the claimed powiats from `PL`, using
  `polygon-clipping` difference with the same winding-rewind guard. What
  remains is the Pskov and Novgorod frontier for `RU`, and Masovia and
  Pomerelia for `PL`. Subtracting the claimed units rather than whole source
  regions is what keeps Pomerelia - which no land claims - a neighbor.
- **Keep only neighbors that render.** Verified against the current built
  `map.json`: of the six configured neighbors, only `BY`, `FI`, `PL` and `RU`
  produce a path at all. `SE` and `DK` fall entirely outside the canvas and
  are silently discarded today by the `.filter(n => n.path)` step, so the
  config has been carrying two dead entries.

The silent filter becomes a warning, so a configured neighbor that
contributes nothing is visible at build time instead of rotting unnoticed.

`NEIGHBORS` is then pruned to exactly the set that contributes geometry
**under the new framing**, re-derived from the built output rather than from
today's. This is deliberately not decided in advance: the reframe extends the
canvas west, and because meridians converge, the western edge reaches further
west at Baltic latitudes than at the Vistula. Gotland and Oland may come into
view, in which case `SE` is kept rather than dropped. Dropping it on today's
evidence would leave a hole in the sea.

No German territory borders the new lands, so `DE` is not added.

Labels: the `Prussian lands` neighbor label is removed, since that territory
is now on the map. A `PRUSSIANS` people label is added, along with
`Mazovians` and `Pomeranians` neighbor labels. The pipeline already drops
off-canvas neighbor labels with a warning, so a label that falls outside the
frame is not a build failure.

### Canvas

Stays 1000 by 1400. Checked against the projection rather than assumed: the
current content aspect is 0.669 and the extended content aspect is 0.692,
both below the canvas aspect of 0.714. The extended map therefore fits with
slightly less letterboxing than today.

## View changes

Today `base = fitView(whole map)` and `clampView` caps `view.w` at `base.w`.
The whole map is visible at default zoom, which makes `panBy` inert until the
player zooms in. Extending the map under that model would shrink every land
by about 14 percent.

Instead:

- `view.ts` gains a `MIN_ZOOM` constant.
- `clampView` caps width at `base.w / MIN_ZOOM` rather than `base.w`.
- The initial view becomes `clampView(base, base)`.

Panning then works at every zoom level with no further change, because pan
bounds already clamp against the map rect.

`MIN_ZOOM = 1.3` makes lands render roughly 12 percent larger than they do
today. It is one tunable constant, and the final value is settled visually in
Chrome rather than by arithmetic.

**Accepted trade-off:** the player can no longer see the entire map in a
single view, in a game whose win condition is holding 15 of 26 lands. No
minimap is built now. If the loss of overview proves to hurt in play, a
minimap or a realm-overview panel is the fix, not a lower floor.

## Game changes

- `VICTORY_REALM_SIZE` stops being a hardcoded 11 and becomes
  `Math.ceil(0.55 * factionIds.length)`, giving 15 of 26. This keeps run
  difficulty at its current relative level and stops the constant from
  rotting the next time the map changes.
- `hud.ts` line 477 hardcodes `of 20 lands` in the victory string. It becomes
  data-driven from the roster size.
- Round length goes from 20 turns to 26. The AI turn pacing is checked in
  Chrome and flagged if a round drags; no change is made speculatively.

## Test changes

`tests/data.test.ts` carries the map invariants and needs:

- land count 20 to 26, with `EXPECTED_IDS` extended and re-sorted
- `EXPECTED_PEOPLE_IDS` extended with `prussians`, 9 peoples to 10
- faction count 20 to 26, including the unique-color assertion
- unlocked settlement count 20 to 26
- the single-faction-ethnicity color rule still holds: `prussians` has six
  factions, so it is exempt from the reuse-the-people-color rule the way
  `estonians` is
- the existing neighbor assertions at line 182 are loose enough to survive
  the prune, but the neighbor id set is pinned to the derived list so a
  neighbor cannot silently disappear again

Other suites reference faction ids only through the data, so they follow
automatically. `tests/view.test.ts` gains cases for the zoom floor and for
panning being available at minimum zoom.

## Verification

- `npm test` and `npm run build` both pass.
- `npm run prepare-data` runs clean, with its own guards passing: the
  partition check, the population total, the geometry winding check, the
  settlement containment check, and the every-region-has-adjacency check.
- No configured neighbor yields an empty path, and no neighbor polygon
  overlaps a playable land: `RU` no longer contains the claimed Kaliningrad
  units and `PL` no longer contains the claimed powiats. Confirmed by
  inspecting the
  built `map.json`, not only by eye in the browser, since an overlap is
  invisible under the region fills.
- Verified in Chrome through the root dev server at
  `http://127.0.0.1:4173/prototypes/`, not through a bare prototype root: all
  26 lands render with distinct fills, panning works at minimum zoom, the new
  labels and rivers sit correctly, and a run can be played far enough to
  confirm turn pacing.

## Out of scope

- A minimap or whole-map overview.
- Any new faction type, card, or mechanic.
- Belarusian and Russian territory east of the current frontier. The eastern
  edge stays where it is.
- Rebalancing the existing 17 untouched lands. Only the three lands that lose
  or gain territory have their populations revised.

## Coordination note

Parallel work is landing in this prototype on alliances and new cards, in
`playability.ts`, `relations.ts` and `cards.ts`. This change does not touch
those files. Shared surface is limited to `game.ts` (one constant) and the
test directory. Staging must be scoped to explicit paths.
