# Petty Kingdoms Multi-Region Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the game to Petty Kingdoms and make the map a switchable,
persisted "region" (Baltic c. 1100, Iberia c. 895), chosen on a Regions page
reached from the main menu.

**Architecture:** A static region registry (`src/regions.ts`) carries each
region's map JSON, ruler-name pools and passive placements; a module-level
active-region accessor (set once at boot) feeds the two modules whose tables
were Baltic-hardcoded (`rulers.ts`, `passives.ts`). Everything else already
flows from parsed `MapData` handed down by `main.ts`. The choice persists as a
`MetaStorage` preference, seeds from a `region=` boot param, and joins the
multiplayer hello handshake as a fingerprint.

**Tech Stack:** Plain TypeScript + Vite, no framework, imperative DOM. vitest
(happy-dom). Map bake: node script with d3-geo, topojson, polygon-clipping
(all already in devDependencies).

## Global Constraints

- Work happens in the worktree at
  `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/multi-region`,
  branch `worktree-multi-region`. All paths below are relative to its
  `02-balticmap/` directory unless prefixed with `.github/`.
- `npm test` and `npm run build` must pass before every commit. Balance suites
  (`sim.test.ts`, `scenarios.test.ts`) are NOT run and NOT modified beyond
  keeping them compiling against the renamed Baltic data file.
- Stage with explicit paths. Never `git add -A`. Commit messages follow the
  repo style: lowercase `feat(balticmap): ...` style subject, ending with the
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- No em dashes and no non-ASCII punctuation in any NEW prose (code comments,
  docs, UI copy). New data (Iberia names) stays plain ASCII: "Leon", not
  "León". Existing Baltic data keeps its diacritics.
- Card rules, AI, balance, cards.ts, game.ts turn logic: unchanged. This
  feature adds no card and no `GameEventType`.
- Player-facing prose never interpolates card or faction names into strings
  (rich-text segments rule). The Regions page copy below is written so no
  faction name appears in it.
- If `02-balticmap/node_modules` is missing in the worktree, run
  `npm install` there first. Before the bake task, copy the download cache if
  the main checkout has one:
  `cp -R /Users/janis.kirsteins/Projects/prototypes/02-balticmap/scripts/.cache scripts/.cache 2>/dev/null || true`

---

### Task 1: Region registry and the baltic.json rename

**Files:**
- Create: `src/regions.ts`
- Rename: `src/data/map.json` -> `src/data/baltic.json` (git mv)
- Modify: `src/main.ts:1,84` (import), `src/sim.ts:1`,
  `scripts/prepare-data.mjs:1742-1744` (output path),
  `tests/data.test.ts:3`, `tests/rulers.test.ts:5`, `tests/passives.test.ts:10`,
  `tests/interaction.test.ts:7`, `tests/naming-convention.test.ts:7`,
  `tests/render.test.ts:5`
- Test: `tests/regions.test.ts`

**Interfaces:**
- Consumes: `MapData` from `src/types.ts`.
- Produces (later tasks rely on these exact names):

```ts
// src/regions.ts
import type { MapData } from "./types";
import balticMap from "./data/baltic.json";

/** Widened to "baltic" | "iberia" when the Iberia bake lands (Task 4). */
export type RegionId = "baltic";

export interface RegionDef {
  id: RegionId;
  /** Display name for the Regions page tile and the menu subtitle. */
  name: string;
  /** Era line, e.g. "Eastern Baltic, c. 1100". */
  era: string;
  /** 2-3 sentences for the Regions page tile. Must not contain any card or
   *  faction name - the rich-text segment rule has no renderer here. */
  blurb: string;
  map: MapData;
  /** Ruler-name pools keyed by people id. The shared "generic" fallback
   *  stays in rulers.ts, not here. */
  rulerNames: Readonly<Record<string, readonly string[]>>;
  /** Which lands may roll which terrain passive (faction id keyed). */
  terrainEligibility: Readonly<Record<string, readonly string[]>>;
  /** The lands that carry burden-of-bureaucracy from turn 1. */
  bureaucracyLands: readonly string[];
}

export const DEFAULT_REGION: RegionId = "baltic";
export const REGIONS: Record<RegionId, RegionDef>;

/** The one mutable cell in the module: which region this PROCESS is playing.
 *  Set exactly once at boot (main.ts), before any deal; tests may set it.
 *  A singleton rather than a threaded parameter because rulers.ts and
 *  passives.ts are called from deep inside game.ts with signatures the wire
 *  protocol depends on. Default is baltic, so sim.ts and every existing
 *  test read the map they always did without calling anything. */
export function setActiveRegion(id: RegionId): void;
export function activeRegion(): RegionDef;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/regions.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  REGIONS, DEFAULT_REGION, activeRegion, setActiveRegion,
} from "../src/regions";

afterEach(() => setActiveRegion(DEFAULT_REGION));

describe("region registry", () => {
  it("defaults to the baltic region", () => {
    expect(DEFAULT_REGION).toBe("baltic");
    expect(activeRegion().id).toBe("baltic");
    expect(activeRegion().map.regions.length).toBe(26);
  });

  it("every region is self-consistent", () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.name.length).toBeGreaterThan(0);
      expect(region.era).toMatch(/c\. \d+/);
      expect(region.blurb.length).toBeGreaterThan(40);
      const factionIds = new Set(region.map.factions.map((f) => f.id));
      const peopleIds = new Set(region.map.peoples.map((p) => p.id));
      // Ruler pools cover every people of the map.
      for (const p of peopleIds) {
        expect(region.rulerNames[p], `${region.id} pool for ${p}`).toBeDefined();
        expect(region.rulerNames[p].length).toBeGreaterThanOrEqual(10);
      }
      // Passive placements name real factions.
      for (const id of Object.keys(region.terrainEligibility)) {
        expect(factionIds.has(id), `${region.id} terrain on ${id}`).toBe(true);
      }
      for (const id of region.bureaucracyLands) {
        expect(factionIds.has(id), `${region.id} burden on ${id}`).toBe(true);
      }
      expect(region.bureaucracyLands.length).toBe(3);
    }
  });

  it("setActiveRegion switches what activeRegion answers", () => {
    setActiveRegion("baltic");
    expect(activeRegion().id).toBe("baltic");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/regions.test.ts`
Expected: FAIL - `Cannot find module '../src/regions'`.

- [ ] **Step 3: Implement**

`git mv src/data/map.json src/data/baltic.json`. Create `src/regions.ts` per
the interface above. For this task the baltic entry's `rulerNames`,
`terrainEligibility` and `bureaucracyLands` are IMPORTED VALUES, not copies:

```ts
import balticRulerNames from "./data/ruler-names.json";
import { BUREAUCRACY_LANDS, TERRAIN_ELIGIBILITY } from "./passives";
```

(Those two constants move OUT of passives.ts in Task 2; for now reference
them so there is one copy. If this import creates a cycle - passives.ts does
not import regions.ts yet, so it does not - flag it rather than duplicating
the table.) The baltic `rulerNames` is the JSON minus its `generic` key:

```ts
const { generic: _generic, ...balticPools } = balticRulerNames as
  Record<string, string[]>;
```

`name: "Baltic lands"`, `era: "Eastern Baltic, c. 1100"`, blurb (exact copy):
"Chiefdoms and confederacies of the eastern Baltic on the eve of the
crusades. Dense forest, river trade and no king anywhere: every land answers
to its own hillfort, and the strongest realm on the map is whoever three
neighbours fear at once."

Update the seven importers of `./data/map.json` / `../src/data/map.json` to
the new `baltic.json` path (main.ts, sim.ts, and the five test files listed
above - naming-convention, data, rulers, passives, interaction, render).
Update `scripts/prepare-data.mjs:1742-1744` to write `src/data/baltic.json`.

- [ ] **Step 4: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: PASS (rename is invisible to behaviour).

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/regions.ts 02-balticmap/src/data 02-balticmap/src/main.ts 02-balticmap/src/sim.ts 02-balticmap/scripts/prepare-data.mjs 02-balticmap/tests
git commit -m "feat(balticmap): a region registry, and the map file says which region it is"
```

---

### Task 2: Rulers and passives read the active region

**Files:**
- Modify: `src/rulers.ts:1,31-36`, `src/passives.ts:97-102,151-208`,
  `src/regions.ts` (baltic entry now owns the tables)
- Modify: `src/data/ruler-names.json` (loses its `generic` key),
  Create: `src/data/ruler-names-generic.json`
- Test: `tests/rulers.test.ts`, `tests/passives.test.ts` (extend, keep green)

**Interfaces:**
- Consumes: `activeRegion()` from Task 1.
- Produces: `rulers.ts` and `passives.ts` keep their EXACT public signatures
  (`rulerNameFor`, `initialRulers`, `replaceRuler`, `rollTerrain`,
  `seedTerrain`, ...). `TERRAIN_ELIGIBILITY` and `BUREAUCRACY_LANDS` stop
  being exported from `passives.ts` and live only on `RegionDef`.
  `BUREAUCRACY_PER_ARMY` and every other rule constant stays in passives.ts.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rulers.test.ts` (it already imports the map and drives
`initialRulers`; follow its existing style):

```ts
import { DEFAULT_REGION, setActiveRegion } from "../src/regions";

afterEach(() => setActiveRegion(DEFAULT_REGION));

it("draws names from the ACTIVE region's pools", () => {
  // Baltic pools hold no name from the generic pool's spelling space that
  // this asserts on; the point is only that switching regions switches the
  // answer. Until Iberia lands (Task 4) this pins the plumbing with baltic.
  const name = rulerNameFor("selonians", "selonians", 0, new Set());
  setActiveRegion("baltic");
  expect(rulerNameFor("selonians", "selonians", 0, new Set())).toBe(name);
});

it("falls back to the generic pool for an unknown ethnicity", () => {
  const name = rulerNameFor("x", undefined, 0, new Set());
  expect(name.length).toBeGreaterThan(0);
});
```

Append to `tests/passives.test.ts`:

```ts
import { activeRegion } from "../src/regions";

it("terrain tables live on the region and name real factions", () => {
  const region = activeRegion();
  const factionIds = new Set(
    (data as MapData).factions.map((f) => f.id),
  );
  for (const id of Object.keys(region.terrainEligibility)) {
    expect(factionIds.has(id)).toBe(true);
  }
  expect(region.bureaucracyLands).toEqual([
    "eastern-aukstaitian-confederacy", "samogitian-confederacy", "lietuva",
  ]);
});
```

Any existing test that imported `TERRAIN_ELIGIBILITY` or `BUREAUCRACY_LANDS`
from passives.ts switches to `activeRegion().terrainEligibility` /
`.bureaucracyLands`.

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `npx vitest run tests/rulers.test.ts tests/passives.test.ts`
Expected: FAIL on the new imports/exports.

- [ ] **Step 3: Implement**

1. Move the `generic` pool out of `ruler-names.json` into
   `src/data/ruler-names-generic.json` (shape: a bare `string[]`).
2. `rulers.ts`: drop `import pools from "./data/ruler-names.json"`; instead

```ts
import genericNames from "./data/ruler-names-generic.json";
import { activeRegion } from "./regions";

const GENERIC: readonly string[] = genericNames as string[];

function poolFor(ethnicity: string | undefined): readonly string[] {
  if (ethnicity !== undefined) {
    const pool = activeRegion().rulerNames[ethnicity];
    if (pool !== undefined && pool.length > 0) return pool;
  }
  return GENERIC;
}
```

3. `passives.ts`: delete the `TERRAIN_ELIGIBILITY` and `BUREAUCRACY_LANDS`
   exports (move their doc comments with them); `rollTerrain` and
   `seedTerrain` read `activeRegion().terrainEligibility` and
   `activeRegion().bureaucracyLands`. Signatures unchanged.
4. `regions.ts`: the baltic entry now DEFINES the two tables (paste the
   moved values verbatim, including their comments) and imports nothing from
   passives.ts. `rulerNames` imports `./data/ruler-names.json` (now
   generic-free).

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS. `rng-isolation.test.ts` in particular must stay green - the
naming path consumes no rng draw, and this change must keep it that way.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): ruler names and terrain tables come off the active region"
```

---

### Task 3: Region preference, boot param, and boot-order in main.ts

**Files:**
- Modify: `src/meta.ts` (add pref), `src/boot-params.ts:27-66,178-229`,
  `src/main.ts:84-233` (reorder boot, resolve region)
- Test: `tests/boot-params.test.ts` (extend), `tests/regions.test.ts` (extend)

**Interfaces:**
- Consumes: `RegionId`, `DEFAULT_REGION`, `REGIONS`, `setActiveRegion` from
  Task 1; `MetaStorage` from meta.ts.
- Produces:

```ts
// src/meta.ts
export const REGION_PREF_KEY = "balticmap-region-pref-v1";
export function loadRegionPref(storage: MetaStorage): RegionId; // unknown -> DEFAULT_REGION
export function saveRegionPref(storage: MetaStorage, id: RegionId): void;
// src/boot-params.ts: BootParams gains `region: RegionId | null`,
// "region" joins BOOT_KEYS, unknown value parses to null.
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/regions.test.ts`:

```ts
import { memoryStorage } from "../src/meta";
import { loadRegionPref, saveRegionPref, REGION_PREF_KEY } from "../src/meta";

describe("region preference", () => {
  it("round-trips and defaults", () => {
    const storage = memoryStorage();
    expect(loadRegionPref(storage)).toBe("baltic");
    saveRegionPref(storage, "baltic");
    expect(loadRegionPref(storage)).toBe("baltic");
  });

  it("falls back to the default on an unknown stored value", () => {
    const storage = memoryStorage();
    storage.setItem(REGION_PREF_KEY, "atlantis");
    expect(loadRegionPref(storage)).toBe("baltic");
  });
});
```

Append to `tests/boot-params.test.ts`, following its existing parse tests:

```ts
it("parses region=, dropping unknown values", () => {
  expect(parseBootParams("?region=baltic")?.region).toBe("baltic");
  expect(parseBootParams("?region=atlantis")?.region).toBeNull();
  // region alone is a boot param: the page must seal itself off from the
  // player's storage exactly as seed= does.
  expect(parseBootParams("?region=baltic")).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/regions.test.ts tests/boot-params.test.ts`
Expected: FAIL - missing exports / missing key.

- [ ] **Step 3: Implement**

1. `meta.ts`: the three exports above, in the `loadBuildPref` mould
   (try/catch, validate against `Object.keys(REGIONS)`). Import
   `type RegionId, DEFAULT_REGION, REGIONS` from `./regions`.
2. `boot-params.ts`: add `region: RegionId | null` to `BootParams` with a
   doc comment ("`region=iberia` - which map the booted page plays on;
   seeds the booted page's region preference the way `rules=` seeds the
   rules"); add `"region"` to `BOOT_KEYS`; in `parseBootParams`:
   `region: q.get("region") !== null && q.get("region")! in REGIONS ? q.get("region") as RegionId : null`.
   `applyBootParams` does NOT read it - the region decides which map is
   loaded, which happens before any game state exists.
3. `main.ts` boot-order refactor. Today `renderMap(data, app)` runs at line
   97 and `boot`/`storage` are built at 197-233. Move, keeping every comment
   with its block, so the order at module top becomes:
   1. `const app = ...` and the contextmenu/selectstart listeners;
   2. the `boot` parse and `joinId` (current lines 195-203);
   3. `rng`, `storage`, `netStorage` (current lines 205-260) - and inside
      the boot arm of the `storage` IIFE add, beside the rules seeding:
      `if (boot.region !== null) mem.setItem(REGION_PREF_KEY, boot.region);`
   4. region resolution, new:

```ts
const regionId: RegionId = loadRegionPref(storage);
setActiveRegion(regionId);
const region = REGIONS[regionId];
const data = region.map;
```

   (the old `const data = rawData as MapData` and the `map.json` import go);
   5. `renderMap(data, app)` and everything after, unchanged.

   `newGame(...)` at line 269 and every `data.` reader is untouched - they
   already consume `data`.

- [ ] **Step 4: Full suite, build, and a hand check**

Run: `npm test && npm run build`
Expected: PASS.
Then `npm run dev` and load
`http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&turns=2` -
the game must boot exactly as before (boot params still work after the
reorder). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): the region is a preference, and a booted page names its map"
```

---

### Task 4: The Iberia bake

**Files:**
- Create: `scripts/prepare-iberia.mjs`, `src/data/iberia.json` (baked),
  `src/data/ruler-names-iberia.json`
- Modify: `src/regions.ts` (widen `RegionId`, add the iberia entry)
- Test: `tests/data-iberia.test.ts`

**Interfaces:**
- Consumes: `RegionDef` from Task 1.
- Produces: `RegionId = "baltic" | "iberia"`; `REGIONS.iberia` complete.

This is the largest task. Read `scripts/prepare-data.mjs` FIRST, whole: the
new script reuses its stages (download+cache, topojson merge, equal-area
projection via `geoAzimuthalEqualArea`, path baking, adjacency derivation
including authored sea links, settlement layout guard, the final
`writeFileSync`). Copy functions rather than importing across scripts if the
existing file does not export them - but keep the copies verbatim.

**Sources** (same vintage family as the Baltic bake where possible):
- Lands: GISCO `NUTS_RG_01M_2021_4326_LEVL_3.geojson` (already a cached URL
  in prepare-data.mjs), features with `CNTR_CODE` ES or PT. EXCLUDE the
  islands and exclaves that are off-map: NUTS3 ids starting `ES7` (Canaries),
  `PT2`/`PT3` (Azores, Madeira), plus `ES630`/`ES640` (Ceuta, Melilla).
  KEEP `ES53*` (Balearics - they are a faction).
- Andorra sits inside the Urgell group: take its polygon from GISCO
  `CNTR_RG_01M_2020_4326.geojson` (`AD`) and merge it into the `urgell` land
  so the map has no hole.
- Neighbors (grey context): `FR` and `MA` from the CNTR file.
- Rivers: the two Natural Earth river files already used; keep by name:
  Minho, Douro, Tagus, Ebro, Guadiana, Guadalquivir. `major: true` for
  Douro, Ebro, Guadalquivir. River LABELS for the majors only.

**Frame:** `WIDTH = 1400`, `HEIGHT = 1150`, `PAD = 40`, `YEAR = 895`,
`margin` baked the same way prepare-data.mjs bakes it. Attribution:
`"(c) EuroGeographics for the administrative boundaries; rivers: Natural Earth"`.

**Roster.** 24 lands, one faction each, 8 peoples. The NUTS3-to-land grouping
is the implementer's to complete (the geojson carries `NUTS_NAME`; the script
MUST throw if any kept ES/PT NUTS3 feature is assigned to no land or to two),
but the lands, factions and peoples are fixed:

Peoples (id, name): `galicians` Galicians, `asturleonese` Asturleonese,
`basques` Basques, `castilians` Castilians, `catalans` Catalans,
`arabs` Arabs, `berbers` Berbers, `muwallads` Muwallads.

Lands (region id / faction id / faction name / people / rough modern ground):
1. `galicia` / `galicians-of-iria` / "Galicians" / galicians / Galicia + Viana do Castelo, Braga (north Portugal).
2. `asturias` / `asturians` / "Asturians" / asturleonese / Asturias + Cantabria. Faction type `principality` (the kingdom's core).
3. `leon` / `leonese` / "Leonese" / asturleonese / Leon, Zamora, Palencia, Valladolid north.
4. `alava` / `alavese` / "Alavese" / basques / Alava + Bizkaia + Gipuzkoa.
5. `castile` / `castilians-of-burgos` / "Castilians" / castilians / Burgos + La Rioja.
6. `pamplona` / `pamplonese` / "Pamplonese" / basques / Navarra. Type `principality`.
7. `aragon` / `aragonese` / "Aragonese" / basques or catalans - use catalans / Huesca west.
8. `sobrarbe` / `sobrarbians` / "Sobrarbians" / catalans / Huesca east (Sobrarbe-Ribagorza).
9. `pallars` / `pallaresans` / "Pallaresans" / catalans / Lleida north.
10. `urgell` / `urgellians` / "Urgellians" / catalans / Lleida mid + Andorra.
11. `barcelona` / `barcelonans` / "Barcelonans" / catalans / Barcelona + Girona + Tarragona north. Type `united-lands` (the count held several counties).
12. `upper-march` / `banu-qasi` / "Banu Qasi" / muwallads / Zaragoza + Teruel north + Soria. Type `united-lands`.
13. `toledo` / `toledans` / "Toledans" / muwallads / Toledo + Madrid + Guadalajara + Cuenca west.
14. `merida` / `meridans` / "Meridans" / berbers / Caceres + Salamanca south + Avila.
15. `badajoz` / `banu-marwan` / "Banu Marwan" / muwallads / Badajoz + Alentejo east.
16. `lisbon` / `lisbonese` / "Lisbonese" / muwallads / Lisboa + Setubal + Santarem + Leiria + Coimbra coast.
17. `algarve` / `algarvians` / "Algarvians" / arabs / Faro + Beja.
18. `seville` / `sevillans` / "Sevillans" / arabs / Sevilla + Huelva + Cadiz. Type `united-lands`.
19. `cordoba` / `umayyads` / "Umayyads" / arabs / Cordoba + Jaen. Type `principality` (the emirate's rump; NOT placeName).
20. `bobastro` / `hafsunids` / "Hafsunids" / muwallads / Malaga + Granada west uplands. Type `chiefdom`.
21. `elvira` / `elvirans` / "Elvirans" / arabs / Granada + Almeria.
22. `todmir` / `todmirians` / "Todmirians" / muwallads / Murcia + Alicante + Albacete.
23. `valencia` / `valencians` / "Valencians" / muwallads / Valencia + Castellon + Teruel east.
24. `balearics` / `balearians` / "Balearians" / berbers / ES53. Type
    `island-lands`, sea links to `valencia` and `todmir` (authored, the
    saaremaa pattern).

Remaining faction types default to `land`. Colors: one hue family per
people, shades within it (the Baltic convention; single-faction peoples
reuse the people color exactly - the data test asserts this). All 24 colors
unique lowercase hex.

**Populations:** multiples of 5000, relative sizes plausible for 895
(Cordoba, Seville, Toledo large; the mountain north small), each in
[10000, 90000]. `maxSettlements` uses the same formula the Baltic bake uses:
`min(10, max(2, round(population / 10000)))`. The three largest polygons BY
POPULATION are the `bureaucracyLands` (fix the list in regions.ts to match
what you bake; the regions test asserts length 3).

**Flavor and places:** every land gets 1-2 sentences of flavor (>20 chars,
period-true, mentioning the ground where a terrain passive is eligible - the
hover names statuses and the flavor must support them) and a `places` list.
Settlements: one unlocked per land plus locked sites filling
`maxSettlements`, era-true names (Oviedo, Leon, Pamplona, Jaca, Barcelona,
Girona, Toledo, Cordoba, Sevilla, Merida, Badajoz, Zaragoza, Tudela,
Bobastro, Ilbira, Tudmir, Balansiya...; NO post-895 foundations, so no
Madrid-as-city - Mayrit the fort is acceptable), notes >20 chars valid for
895, every settlement name in its land's `places`, dot/label collision guard
same as the Baltic bake.

**Labels:** people labels (kind `people`, uppercase people names), the three
major-river labels, `FRANCIA` and `MAGHREB` as `neighbor` labels. All label
coordinates inside the 1400x1150 canvas.

**Ruler pools** (`src/data/ruler-names-iberia.json`, keyed by people id,
>=12 names each, plain ASCII): galicians/asturleonese from the Asturian
dynasty space (Alfonso, Ordono, Fruela, Ramiro, Bermudo, Garcia, Silo,
Mauregato, Vermudo, Pelayo, Aurelio, Favila...); basques (Sancho, Garcia,
Fortun, Enneco, Ximeno, Velasco...); castilians (Rodrigo, Diego, Fernan,
Gonzalo, Nuno, Assur...); catalans (Wifred, Borrell, Sunyer, Miro, Oliba,
Ramon, Berenguer, Ermengol...); arabs (Muhammad, Abd Allah, Abd al-Rahman,
al-Mundhir, Hisham, Sulayman...); berbers (Tariq, Musa, Zawi, Habib,
Yahya...); muwallads (Umar, Musa, Lubb, Mutarrif, Sulayman, Marwan...).
Pools may share forms - `rulerNameFor` dedupes across the world.

**Terrain eligibility (iberia entry in regions.ts):** `hill-country` on
`asturians`, `alavese`, `sobrarbians`, `pallaresans`, `hafsunids`;
`river-trade` on `banu-qasi` (Ebro), `sevillans` (Guadalquivir),
`valencians`, `leonese` (Douro), `banu-marwan` (Guadiana). Each supported by
that land's flavor text.

- [ ] **Step 1: Write the failing data test**

`tests/data-iberia.test.ts`, modeled on `tests/data.test.ts` but pinned to
Iberia's own facts. Include AT LEAST: the canvas/year/attribution pin
(1400x1150, 895); exactly the 24 land ids above, sorted; the 8 people ids;
26-invariants generalized to 24 (1:1 factions/regions, ethnicity = first
people, unique colors, single-faction-people color rule); populations are
positive 5000-multiples with the maxSettlements formula; adjacency
symmetric, sorted, non-empty; `balearics` adjacent to `valencia` and
`todmir`; the rivers list contains `ebro`, `douro`, `guadalquivir` as major;
settlements unique, one unlocked per land, every locked count =
maxSettlements - 1, no post-era names (assert none of: "madrid", "murcia
cathedral" - keep it to a lowercase substring blocklist of
`["alhambra", "escorial", "el escorial", "gibraltar"]`); the label bounds
check against 1400x1150; the dot/label collision guard copied from
data.test.ts with the Iberia dimensions. Import `../src/data/iberia.json`.

Also extend `tests/regions.test.ts`: nothing to change - its
`Object.values(REGIONS)` loop now covers iberia automatically (that is why
it loops).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/data-iberia.test.ts`
Expected: FAIL - `Cannot find module '../src/data/iberia.json'`.

- [ ] **Step 3: Write and run the bake**

Write `scripts/prepare-iberia.mjs`; add
`"prepare-iberia": "node scripts/prepare-iberia.mjs"` to package.json
scripts. Run `npm run prepare-iberia` (network; cache under
`scripts/.cache`). The script must end by printing land count, per-land
adjacency degrees, and min/mean/max polygon areas next to the Baltic map's
same numbers (read `src/data/baltic.json` for the comparison) - the graph
sanity check the spec asks for. Iterate on the grouping until: no land has 0
authored adjacency, degree spread is broadly Baltic-like (2..8), and no land
is microscopic on canvas.

- [ ] **Step 4: Wire the region entry**

Widen `RegionId` to `"baltic" | "iberia"`, add `REGIONS.iberia` with
`name: "Iberia"`, `era: "Iberian Peninsula, c. 895"`, blurb (exact copy):
"The emirate has come apart in rebel marches and mountain kingdoms. Muwallad
lords hold the river valleys against Cordoba, Asturias raids south past the
Douro, and every count and wali on the map answers to himself. The fitna is
a good time to be ambitious.", the map import, the ruler pools import, the
terrain tables above, and `bureaucracyLands` matching the three largest
baked populations.

- [ ] **Step 5: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS, including regions.test.ts now looping over iberia (pool
coverage for all 8 peoples, tables naming real factions).

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/scripts/prepare-iberia.mjs 02-balticmap/package.json 02-balticmap/src/data/iberia.json 02-balticmap/src/data/ruler-names-iberia.json 02-balticmap/src/regions.ts 02-balticmap/tests/data-iberia.test.ts
git commit -m "feat(balticmap): iberia c. 895, baked from real provinces into fitna-era lands"
```

---

### Task 5: The Regions page, the menu, and the rename

**Files:**
- Create: `src/regions-screen.ts`
- Modify: `src/hud.ts:727-737` (menu title, subtitle, Regions button; new
  optional callbacks), `src/main.ts` (wire the page), `index.html:7`,
  `src/style.css` (screen styles), `.github/pages-index.html` (link text),
  `CLAUDE.md` + `AGENTS.md` in `02-balticmap/` (first line: the game is
  Petty Kingdoms; note the region registry and the `region=` boot param)
- Test: `tests/hud.test.ts` (extend), `tests/regions-screen.test.ts`

**Interfaces:**
- Consumes: `REGIONS`, `RegionId`, `activeRegion` (Task 1),
  `saveRegionPref` (Task 3).
- Produces:

```ts
// src/regions-screen.ts
export interface RegionsScreenDeps {
  activeId: RegionId;
  /** Persist + reboot into the picked region. Not called for the active tile. */
  onPick(id: RegionId): void;
  onClose(): void;
}
/** Builds the overlay, appends it to `parent`, returns it. Dark screen in
 *  the .deck-screen mould: it declares its own `color`. */
export function createRegionsScreen(
  parent: HTMLElement, deps: RegionsScreenDeps,
): HTMLElement;
// src/hud.ts HudCallbacks gains:
//   onOpenRegions?(): void;   // renders the menu "Regions" button when present
//   regionSubtitle?(): string; // era line under the menu title when present
```

- [ ] **Step 1: Write the failing tests**

`tests/regions-screen.test.ts` (happy-dom, the hud.test.ts style):

```ts
import { describe, it, expect, vi } from "vitest";
import { createRegionsScreen } from "../src/regions-screen";
import { REGIONS } from "../src/regions";

describe("regions screen", () => {
  it("shows one tile per region with name, era, blurb and a preview", () => {
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick: () => {}, onClose: () => {},
    });
    const tiles = el.querySelectorAll(".rs-tile");
    expect(tiles.length).toBe(Object.keys(REGIONS).length);
    for (const region of Object.values(REGIONS)) {
      expect(el.textContent).toContain(region.name);
      expect(el.textContent).toContain(region.era);
    }
    // The preview is real geometry, not a screenshot: one svg per tile,
    // holding that region's polygon paths.
    for (const tile of tiles) {
      expect(tile.querySelectorAll("svg path").length).toBeGreaterThan(10);
    }
    // The active tile says so and does not re-pick.
    expect(el.querySelector(".rs-tile.active")?.textContent).toContain("Active");
  });

  it("picking the inactive tile calls onPick with its id", () => {
    const onPick = vi.fn();
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick, onClose: () => {},
    });
    const inactive = [...el.querySelectorAll(".rs-tile")]
      .find((t) => !t.classList.contains("active"))!;
    (inactive as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith("iberia");
  });

  it("the active tile does not fire onPick, and Back closes", () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const el = createRegionsScreen(document.body, {
      activeId: "baltic", onPick, onClose,
    });
    (el.querySelector(".rs-tile.active") as HTMLElement).click();
    expect(onPick).not.toHaveBeenCalled();
    (el.querySelector(".rs-back") as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
```

Extend `tests/hud.test.ts` where the menu is asserted: with
`onOpenRegions` provided, the menu holds a `.menu-regions` button labelled
"Regions" whose click calls it; the menu title reads "Petty Kingdoms"; with
`regionSubtitle: () => "Eastern Baltic, c. 1100"` a `.menu-subtitle` under
the title carries that text.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/regions-screen.test.ts tests/hud.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. `regions-screen.ts`: overlay div `regions-screen`, an `h1` "Regions", a
   tile row, a back button `.rs-back` labelled "Back". Tile: region name,
   era line, blurb paragraph, "Active" badge on the active one, and an
   `<svg>` preview built from `region.map`: viewBox
   `0 0 ${map.width} ${map.height}`, one `path` per `map.regions` entry
   filled with its faction's color (look the faction up by `r.faction`),
   stroke a dark hairline. No interactivity inside the preview.
2. `style.css`: `.regions-screen` dark full-screen overlay in the
   `.deck-screen` mould - and it DECLARES `color` (the dark-box rule).
   Tiles light, like `.ds-build`; preview svg `max-width: 100%`, capped
   height; `.rs-tile.active` outlined. The tile row is the scroll region;
   the Back button stays outside it (the build-screen rule).
3. `hud.ts`: title becomes "Petty Kingdoms"; when `cb.regionSubtitle` is
   present append `<p class="menu-subtitle">` with its text under the
   title; when `cb.onOpenRegions` is present append a `.menu-regions`
   button "Regions" between New game and Reset progress, clicking it calls
   the callback and disarms the reset (the `disarmReset` pattern already
   there).
4. `main.ts`: pass `regionSubtitle: () => region.era` and
   `onOpenRegions` to `createHud`. `onOpenRegions` builds the screen:

```ts
createRegionsScreen(app, {
  activeId: regionId,
  onPick(id) {
    saveRegionPref(storage, id);
    // The whole app is wired to one map at module scope; a reload IS the
    // rebuild, and the menu phase has no run to lose.
    window.location.reload();
  },
  onClose() { screen.remove(); },
});
```

   Guard: only openable while `game.phase` is `"main-menu"` (the button
   lives on the menu overlay, which the phase already hides - state the
   guard in a comment rather than code if the overlay's visibility is
   sufficient, which it is).
5. `index.html`: `<title>Petty Kingdoms</title>`.
6. `.github/pages-index.html`: the 02 link text becomes
   "Petty Kingdoms" (keep any parenthetical the page style uses).
7. `CLAUDE.md`/`AGENTS.md` in 02-balticmap: first paragraph says the game
   is Petty Kingdoms with switchable regions (registry in
   `src/regions.ts`, active map at boot from the region pref, `region=`
   boot param); fix the one stale `src/data/map.json` mention
   (naming-convention section) to `src/data/baltic.json`.

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests 02-balticmap/index.html 02-balticmap/CLAUDE.md 02-balticmap/AGENTS.md .github/pages-index.html
git commit -m "feat(balticmap): petty kingdoms, and a regions page that picks the map"
```

---

### Task 6: The handshake refuses a cross-region lobby

**Files:**
- Modify: `src/regions.ts` (fingerprint), `src/net-protocol.ts:13,48-52`,
  `src/net-host.ts:57-65`, `src/net-guest.ts:43-48,77-80`
- Test: `tests/net-protocol.test.ts` or `tests/two-seat.test.ts` (whichever
  already drives the hello exchange - extend THERE, do not build a parallel
  harness; the net-pipe lesson in CLAUDE.md is exactly about this)

**Interfaces:**
- Consumes: `activeRegion()`.
- Produces:

```ts
// src/regions.ts
/** What two screens must agree on before sharing a lobby: which region, and
 *  that their baked maps are byte-identical. FNV-1a over the id and the
 *  map JSON, cached per region - the hello sends it, both ends compare. */
export function regionFingerprint(): string; // e.g. "baltic@1a2b3c4d"
// net-protocol.ts: hello gains `region: string`; PROTOCOL_VERSION becomes 5.
```

- [ ] **Step 1: Write the failing test**

In the suite that drives a real hello exchange over `wirePair()`: connect a
host and a guest whose hellos disagree on region. The guest sends hello on
create, so fake the mismatch the way the suite fakes version mismatches - if
it has no such precedent, send a hand-built
`{ type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(), region: "iberia@0", name: "x" }`
into the host's wire and assert the reply is a `refuse` whose reason
mentions region, and that the wire closes. Also assert the happy path still
shakes hands (both ends on the real `regionFingerprint()`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/net-protocol.test.ts tests/two-seat.test.ts`
Expected: FAIL - `region` not in the hello type.

- [ ] **Step 3: Implement**

1. `regions.ts`: `regionFingerprint()` - FNV-1a (copy the 32-bit loop from
   rulers.ts, it is six lines) over `id + ":" + JSON.stringify(region.map)`,
   memoized in a `Map<RegionId, string>`.
2. `net-protocol.ts`: `PROTOCOL_VERSION = 5`; hello gains
   `region: string`.
3. `net-host.ts` hello arm: refuse when
   `msg.region !== regionFingerprint()` with reason
   `"the two screens are on different regions - pick the same region on both and reload"`
   (keep the existing version/cards refusal first); include
   `region: regionFingerprint()` in the host's own hello.
4. `net-guest.ts`: send `region: regionFingerprint()` in its hello; on the
   host's hello, compare `msg.region` the same way and call
   `deps.onRefused` + `wire.close()` on mismatch (the host is authoritative,
   but a guest that silently renders the wrong map is the bug this exists
   to stop).

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS - two-seat drives both real sessions, so the new field
crosses in every existing test for free.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): the lobby refuses a cross-region handshake"
```

---

### Task 7: Full verification pass

Not a subagent task - the orchestrating session runs this.

- [ ] `npm test && npm run build` clean in the worktree.
- [ ] `npm run dev`, then the Chrome e2e (per the memory: pick tiles by
  hand where a real run is started; HMR restarts a run, so do not edit
  files mid-check):
  1. Load `http://127.0.0.1:5173/prototypes/02/`. Menu reads
     "Petty Kingdoms" with "Eastern Baltic, c. 1100" beneath, Baltic map
     behind it.
  2. Regions -> two tiles, Baltic marked Active, both previews render
     polygons. READ the text on the dark screen (the dark-box rule).
  3. Activate Iberia -> page reloads into the menu over the Iberia map,
     subtitle "Iberian Peninsula, c. 895".
  4. Hard refresh -> Iberia held.
  5. New game -> build screen over the Iberia map; pick a build, pick a
     land, play 2-3 turns: hovers name Iberian lands and rulers, log lines
     render, no black-on-dark text anywhere.
  6. Boot check: `?seed=7&region=iberia&faction=umayyads&turns=3` boots a
     playable Iberia run; `?seed=7&faction=selonians&turns=3` (no region=)
     boots Baltic REGARDLESS of the saved Iberia pref (memory storage).
  7. Regions -> back to Baltic; refresh; Baltic held.
  8. Screenshot the Iberia map once, and READ it: land shapes sane,
     labels inside the frame, settlement dots labelled.
- [ ] Fix what the pass finds (each fix through the ordinary
  test-first loop), re-run, then hand over to the user on the branch -
  merging waits for their confirmation.

## Self-review notes

- Spec coverage: registry+rename (T1), pools/passives per region (T2),
  pref+boot param+boot order (T3), Iberia data+roster+bake (T4), Regions
  page+rename+landing page+docs (T5), handshake (T6), e2e (T7). "Reset
  progress keeps the region" holds by construction: reset clears no
  region key today and none of these tasks adds it to any reset path -
  T5's implementer must not wire REGION_PREF_KEY into onResetProgress.
- The naming-convention suite keeps its Baltic import (T1) and needs no
  Iberia pass: it scans EVENT prose against the active data's names, and
  events in tests run over Baltic states. Iberia names entering event prose
  would come from the same segment builders the suite already polices.
- Balance suites: untouched except the T1 import rename; they pin Baltic
  behaviour and the default active region is baltic, so no set-up call.
