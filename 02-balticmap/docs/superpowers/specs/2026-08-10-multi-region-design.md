# Petty Kingdoms: multi-region support - design

2026-08-10. Approved in brainstorming; this document records the design.

## What is being built

The game stops being "Baltic Tribes" and becomes **Petty Kingdoms**: one game,
several interchangeable regions ("DLCs"), each a map of small polities in an
era of fragmentation. The Baltic map (c. 1100) becomes one region of two; the
second is the Iberian peninsula around 895, during the fitna of the Emirate of
Cordoba, while Asturias was a kingdom.

A Regions page - reached from the main menu - switches the active region. The
choice persists in localStorage, so after a refresh the menu and the New game
flow sit over the region last activated. Cards, rules, AI and balance are
identical across regions; a region brings its polygons, factions, peoples,
ruler-name pools, hover flavor and passive-status placements, and nothing else.

Chosen over two alternatives: lazy-loaded region modules (bundle savings
nobody needs at two regions, and it would make a synchronous boot path async)
and a region picked only by URL or build flag (fails the requirement of a
persisted configuration page).

## Region registry and data flow

New module `src/regions.ts`:

```ts
type RegionId = "baltic" | "iberia";
interface RegionDef {
  id: RegionId;
  name: string;        // "Baltic lands", "Iberia"
  era: string;         // "Eastern Baltic, c. 1100" / "Iberia, c. 895"
  blurb: string;       // 2-3 sentences for the Regions page tile
  map: unknown;        // the region's map JSON, statically imported
  rulerNames: Record<string, string[]>;  // pools keyed by people id
  polygonPassives: Record<string, readonly string[]>; // faction id -> passives
}
export const REGIONS: Record<RegionId, RegionDef>;
export const DEFAULT_REGION: RegionId = "baltic";
```

- `src/data/map.json` is renamed `src/data/baltic.json`; `src/data/iberia.json`
  is new. Both are static imports; both ship in every build.
- `src/data/ruler-names.json` becomes the Baltic pools. Iberia gets its own
  file. The `generic` pool stays shared (module-level in `rulers.ts` or a
  shared file); `rulers.ts` stops importing pools directly and takes the
  region's pools as input.
- The `POLYGON_PASSIVES` table hardcoded in `src/passives.ts` moves into the
  Baltic region entry as data. `passives.ts` keeps the passive definitions -
  those are game rules, identical everywhere - and takes placements as input.
- `src/main.ts` resolves the active region at boot (preference, or `region=`
  boot param) and hands that region's parsed data down. Game logic already
  flows from parsed map data, so it does not change.
- `src/sim.ts`, the balance scripts and the balance suites pin the Baltic
  region explicitly. Balance evidence stays Baltic-only.

## The Iberia dataset

New `scripts/prepare-iberia.mjs`, modeled on `scripts/prepare-data.mjs`:
GISCO NUTS3 provinces for Spain and Portugal merged into polities, the same
equal-area projection machinery, Natural Earth rivers (Mino, Duero, Ebro,
Tajo, Guadiana, Guadalquivir), France and Morocco as grey neighbor context.
Canvas dimensions are per-map fields already; Iberia gets a landscape frame.
Output committed as `src/data/iberia.json`, reproducible from the script,
downloads cached in `scripts/.cache`. The script prints polygon count and
adjacency-degree stats so Iberia's graph can be sanity-compared against the
Baltic map's.

Roster, ~22 polities around 895. Plausibility over precision: borders are
modern provinces grouped to read right, not reconstructed frontiers.

- Christian north: Galicia, Asturias, Alava, County of Castile, Pamplona,
  County of Aragon, Sobrarbe-Ribagorza, Pallars, Urgell, Barcelona (with the
  coastal counties).
- Fragmented al-Andalus: the Umayyad rump around Cordoba, the Upper March
  (Banu Qasi), the Middle March around Toledo, Badajoz (Ibn Marwan), Seville,
  Bobastro (Ibn Hafsun), Elvira/Granada, Murcia, Valencia, the Algarve, and
  the Balearics as an island-lands faction.
- Peoples: Galicians, Asturleonese, Basques, Castilians, Catalans, Arabs,
  Berbers, Muwallads. Ruler-name pools per people (Alfonso/Ordono/Fruela,
  Sancho/Garcia, Wifred/Borrell, Muhammad/Umar/Abd Allah, ...). Names stay
  plain ASCII, matching the plain-names convention the Baltic roster follows.
- Passive placements: hill-country on the mountain north (Asturias, Sobrarbe,
  Alava), river-trade on the Ebro march, Seville and Valencia,
  burden-of-bureaucracy on the three biggest polygons, per the existing rule.
  Every placement must be supported by the land's own flavor text, and the
  land hover names every status - the standing rule.

## The Regions page and the rename

- The main menu gains a "Regions" button under "New game". It opens a
  full-screen page in the deck-screen style: one tile per region with name,
  era line, blurb and a small map preview rendered from the region's own
  polygon paths. The active region is marked; clicking the other tile saves
  the preference and rebuilds the menu view over the new map immediately.
  Switching lives only on the menu; a run in progress belongs to the region
  it started on, and the page is unreachable mid-game.
- The rename touches the two places the old name lives: the `<title>` in
  `index.html` and the menu title in `src/hud.ts`, both becoming
  "Petty Kingdoms". The active region's era line becomes a subtitle under the
  menu title. The repo landing page `.github/pages-index.html` link text is
  updated in the same change. The directory stays `02-balticmap`.

## Persistence, boot params, multiplayer

- `src/meta.ts` gains a region preference key beside the build and rules
  prefs. `loadRegionPref` defaults to `baltic`; an unknown stored value falls
  back to the default rather than wedging boot.
- New boot param `region=iberia` in `src/boot-params.ts`, seeding the booted
  page's (memory) storage the way `rules=` does. This is also what makes the
  e2e pass one navigation per check.
- The lobby handshake grows the region id plus a fingerprint of the region's
  map data, folded in beside `cardRulesHash`. Two builds on different regions,
  or whose map data differs, refuse to shake hands - the same rule the card
  tables follow. The guest renders the map from its own bundled copy of the
  host's named region.
- "Reset progress" keeps the region choice: it is configuration, not
  progress.

## Testing

- Parametrize the existing map-validity checks over both regions: symmetric
  adjacency, unique ids, every faction owning a polygon, ruler pools covering
  every people, passive placements naming real factions.
- New coverage: the `region=` boot param; the preference round-trip including
  the unknown-value fallback; a handshake test where two sessions on
  different regions refuse.
- The naming-convention suite runs against whichever names the active data
  carries; the plan verifies it covers both regions' names.
- Balance suites stay Baltic-pinned and unchanged.

## E2E verification (Chrome, dev server)

1. Open the page: menu says Petty Kingdoms over the Baltic map.
2. Open Regions, activate Iberia: menu rebuilds over the Iberia map.
3. Hard refresh: Iberia held.
4. New game: build screen sits over the Iberia map; play a few turns.
5. Switch back to Baltic: held after refresh.

Implementation happens in a git worktree.

## Out of scope

- Region-specific cards, card names or rules; any balance work for Iberia.
- Renaming the `02-balticmap` directory.
- Lazy loading of region data.
- Mid-game region switching.
