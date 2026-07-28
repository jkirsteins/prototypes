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
- **Geometry: NUTS-3 plus hand cuts.** Not gminas. See "Why NUTS-3" below.
- **Existing lands are re-cut.** `pilsotas` gives up Skalvian ground;
  `suduva` and `dainava` extend south across the modern border.
- **Victory threshold scales with the roster** rather than staying a
  hardcoded 11.
- **One new people, `prussians`**, with six faction shades in one hue family.
  Yotvingians stay a separate people, as they are today.
- **The map gains a minimum zoom.** The whole map is no longer visible at
  once; the player pans.

## Why NUTS-3

The existing pipeline builds lands from GISCO administrative units: EE and LV
from LAU 2023 municipalities keyed by `LAU_NAME`, LT from NUTS-3 counties
keyed by `NUTS_ID`. The new territory does not fit that pattern cleanly.

Kaliningrad has no LAU or NUTS coverage at all. It is only present as part of
the `RU` polygon in the countries file. So its lands must be hand-cut with
`polygon-clipping` no matter what else is decided.

Poland does have LAU gminas in the already-cached file, but they cannot be
keyed the way EE and LV are. Measured, not assumed:

- 203 gminas fall in the Prussian area, with 22 name collisions, the usual
  urban and rural pairs (Bartoszyce, Elblag, Ketrzyn, Lidzbark Warminski).
- `LAU_ID` is a useless constant for Poland: every PL feature carries
  `"1.0042"`.
- `GISCO_ID` does not decode to a verifiable TERYT powiat code, so no readable
  key can be derived from it.

Keying Poland by gmina would therefore need either raw `GISCO_ID` strings in
`LANDS` or a fragile derived tiebreaker, plus roughly 200 entries. Against
that, hand cuts cost four cut lines using machinery already being written for
Kaliningrad, keep `NUTS_ID` as the key, and leave the southern frontier
toward Masovia following real NUTS-3 borders rather than a hand-traced line.

The trade-off accepted: internal Prussian borders are hand-traced and so read
smoother than the admin-derived borders elsewhere on the map. The outer
frontier and all coastlines remain real data.

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
coordinates do not actually fall inside the land claiming it.

## Pipeline changes

All in `scripts/prepare-data.mjs`.

### Kaliningrad extraction

The oblast is present in the cached countries file as part of the `RU`
MultiPolygon. Verified: one clean exterior ring of 509 points spanning
19.80E to 22.89E and 54.32N to 55.29N, plus the tip of the Vistula Spit.
Both are selected by bounding box.

The extracted polygon is subdivided into Semba, Notanga and the Kaliningrad
portion of Nadrawa by hand-traced cut lines, using the machinery that already
splits the two Daugava-straddling municipalities. `splitByDaugava` is
generalized to a `splitByLine(feature, line, name)` helper so the Daugava
split and the Prussian cuts share one implementation and one winding-rewind
guard.

### Poland

PL NUTS-3 members PL621, PL622, PL623 and PL843 enter the member pool. Each
is hand-cut to yield Warmi, Pamede, Galinda and the southern extensions of
Suduva and Dainava.

The `LANDS` partition check is preserved: the claimed set must still exactly
equal the available member pool, so a forgotten piece of a cut region fails
the build rather than silently vanishing.

### Lithuania

LT023 stops being a NUTS member. Its seven LAU municipalities enter the pool
instead. Verified: all 60 LT LAU names are unique, so they key by `LAU_NAME`
exactly as EE and LV do. This lets Silute, Pagegiai and Neringa join Nadrawa
while Pilsotas keeps the rest.

The remaining LT lands continue to use NUTS-3.

### Adjacency

Two failure modes, both handled:

- The RU border comes from the countries file while the LT and PL borders
  come from the LAU and NUTS files. Vertices across that seam will not match,
  so neither arc-sharing nor the existing coordinate-matching fallback will
  fire.
- Hand-cut pieces share exact vertices along their cut lines, so the
  coordinate fallback does handle those.

`SEA_LINKS` is generalized to `AUTHORED_LINKS`, carrying both the existing
island sea links and the new cross-source land seams, each with a comment
explaining why it cannot be derived. The existing "every region has at least
one adjacency" guard stays and will catch an omission.

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

- **Subtract playable land.** The extracted Kaliningrad polygon is subtracted
  from `RU`, and the claimed NUTS-3 regions are subtracted from `PL`, using
  the same `polygon-clipping` difference and winding-rewind path as the land
  cuts. What remains is the Pskov and Novgorod frontier for `RU` and Masovia
  and Pomerelia for `PL`.
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
  overlaps a playable land: `RU` no longer contains Kaliningrad and `PL` no
  longer contains the Prussian NUTS-3 regions. Confirmed by inspecting the
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
