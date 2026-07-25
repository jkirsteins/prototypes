# Baltic Map Factions and 20-Land Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a faction layer (one faction per polygon, faction-colored fills within ethnic hue families) and grow the 1184 Baltic map from 15 to 20 lands using GISCO LAU municipality geometry.

**Architecture:** The prepare script (scripts/prepare-data.mjs) is the single source of truth: it downloads GISCO geodata, merges municipalities/regions into lands, validates the roster, and writes src/data/map.json. The app then renders whatever map.json says. So the bulk of the work is in the prepare script plus regenerated data; the app changes are small (fill color source, panel/tooltip lines).

**Tech Stack:** Node ESM script with d3-geo, topojson-server/client, polygon-clipping (new dep); Vite + TypeScript app; Vitest (happy-dom for DOM tests).

**Spec:** docs/superpowers/specs/2026-07-25-balticmap-factions-design.md (read it first; the roster table there is normative).

## Global Constraints

- Work on branch `feature/factions` (create from main if it does not exist).
- Working directory for all commands: `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` (the git repo root is the PARENT directory; paths in git commands are relative to `02-balticmap`).
- Total population must stay exactly 650,000; every population a positive multiple of 5,000.
- Exactly 20 regions, 20 factions, 1:1 mapping; faction `ethnicity` === region `peoples[0]`.
- Data display names keep native diacritics (Rävala, Sēlija, Žemaitija...). String literals matching LAU_NAME MUST reproduce diacritics exactly or the lookup fails.
- Faction names are plain (no "Dukes of X"); Lietuva's type is `land-coalition`, NOT duchy.
- GISCO sources (verified reachable, correct counts on 2026-07-25):
  - LAU: `https://gisco-services.ec.europa.eu/distribution/v2/lau/geojson/LAU_RG_01M_2023_4326.geojson` (127 MB; EE=79, LV=43 features; attribute `LAU_NAME`)
  - NUTS: `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326_LEVL_3.geojson` (LT codes are LT011, LT021-LT029 in the 2021 vintage)
  - Countries: `https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2020_4326.geojson`
- Cache downloads in `scripts/.cache/` (gitignored). A pre-downloaded copy of the LAU file exists at `/private/tmp/claude-501/-Users-janis-kirsteins-Projects-prototypes-02-balticmap/c6f3d57a-d7fc-447d-970d-becc9f4e86a7/scratchpad/lau2023.geojson` - copy it into `scripts/.cache/LAU_RG_01M_2023_4326.geojson` to skip the 127 MB download if it is still there.
- The Daugava split polyline below is PROTOTYPED AND VERIFIED (Koknese, Aizkraukle town, Krustpils land north; Jaunjelgava, Selpils, Jekabpils center, Viesite land south; north pieces are contiguous with Livanu novads and each other). Do not re-derive it.

---

### Task 1: Types, prepare-script rewrite, regenerated map.json, data tests

This is one atomic task: the data tests can only pass against a regenerated map.json, which needs the whole pipeline.

**Files:**
- Modify: `src/types.ts`
- Modify: `scripts/prepare-data.mjs` (full rewrite of config + geometry assembly)
- Modify: `tests/data.test.ts`
- Modify: `package.json` (add polygon-clipping devDependency)
- Create: `.gitignore` entry for `scripts/.cache/` (file `02-balticmap/.gitignore`; create the file if missing)
- Regenerate: `src/data/map.json`

**Interfaces:**
- Produces (used by Tasks 2-3):
  - `type FactionType = "county" | "island-league" | "regional-confederacy" | "principality" | "chiefdom" | "land-coalition"`
  - `interface Faction { id: string; name: string; ethnicity: string; type: FactionType; color: string }`
  - `Region.faction: string` (new required field)
  - `MapData.factions: Faction[]`
  - map.json with 20 regions (ids listed below) and 20 factions.

- [ ] **Step 1: Update src/types.ts**

Insert after the `People` interface:

```ts
export type FactionType =
  | "county"
  | "island-league"
  | "regional-confederacy"
  | "principality"
  | "chiefdom"
  | "land-coalition";

export interface Faction {
  id: string;
  name: string;
  ethnicity: string; // id into MapData.peoples
  type: FactionType; // descriptive only - no mechanics yet
  color: string; // polygon fill; a shade within the ethnicity hue family
}
```

In `Region`, add after `peoples`:

```ts
  faction: string; // id into MapData.factions; 1:1 with regions for now
```

and update the `peoples` comment to `// primary ethnicity first (= faction ethnicity), minorities after`. The fill-color remark ("first = primary = fill color") is now wrong - fills come from the faction.

In `MapData`, add after `peoples`:

```ts
  factions: Faction[];
```

- [ ] **Step 2: Rewrite tests/data.test.ts expectations (failing first)**

Replace the whole file with:

```ts
import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "dainava", "eastern-aukstaitija", "harjumaa", "jarvamaa", "jersika",
  "kursa", "laanemaa", "lietuva", "livzeme", "pilsotas", "ravala",
  "saaremaa", "sakala", "selija", "suduva", "talava", "ugandi",
  "virumaa", "zemaitija", "zemgale",
];

const EXPECTED_PEOPLE_IDS = [
  "aukstaitians", "curonians", "estonians", "latgalians", "livs",
  "samogitians", "selonians", "semigallians", "yotvingians",
];

const FACTION_TYPES = [
  "county", "island-league", "regional-confederacy", "principality",
  "chiefdom", "land-coalition",
];

describe("map.json (anno 1184)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.year).toBe(1184);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 20 lands, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("has exactly 9 peoples with names and hex colors", () => {
    expect(data.peoples.map((p) => p.id).sort()).toEqual(EXPECTED_PEOPLE_IDS);
    for (const p of data.peoples) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("every region resolves peoples, has flavor, places, and path data", () => {
    const peopleIds = new Set(data.peoples.map((p) => p.id));
    for (const r of data.regions) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.peoples.length).toBeGreaterThan(0);
      for (const pid of r.peoples) expect(peopleIds.has(pid)).toBe(true);
      expect(r.flavor.length).toBeGreaterThan(20);
      expect(r.places.length).toBeGreaterThan(0);
      expect(r.path.startsWith("M")).toBe(true);
    }
  });

  it("uses native names with diacritics where the spec requires", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r.name]));
    expect(byId.get("ravala")).toBe("Rävala");
    expect(byId.get("laanemaa")).toBe("Läänemaa");
    expect(byId.get("jarvamaa")).toBe("Järvamaa");
    expect(byId.get("selija")).toBe("Sēlija");
    expect(byId.get("talava")).toBe("Tālava");
    expect(byId.get("zemaitija")).toBe("Žemaitija");
    expect(byId.get("suduva")).toBe("Sūduva");
    expect(byId.get("livzeme")).toBe("Līvzeme");
    expect(byId.get("eastern-aukstaitija")).toBe("Eastern Aukštaitija");
  });

  it("has 20 factions in 1:1 correspondence with regions", () => {
    expect(data.factions.length).toBe(20);
    const factionIds = data.factions.map((f) => f.id);
    expect(new Set(factionIds).size).toBe(20);
    const used = data.regions.map((r) => r.faction).sort();
    expect(used).toEqual([...factionIds].sort());
  });

  it("faction ethnicity matches its region's primary people", () => {
    const byId = new Map(data.factions.map((f) => [f.id, f]));
    for (const r of data.regions) {
      const f = byId.get(r.faction)!;
      expect(f).toBeDefined();
      expect(f.ethnicity).toBe(r.peoples[0]);
    }
  });

  it("faction types are valid and colors are unique hex", () => {
    const colors = new Set<string>();
    for (const f of data.factions) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(FACTION_TYPES).toContain(f.type);
      expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
      colors.add(f.color);
    }
    expect(colors.size).toBe(20);
  });

  it("single-faction ethnicities keep the people color exactly", () => {
    const peopleColor = new Map(data.peoples.map((p) => [p.id, p.color]));
    const byEthnicity = new Map<string, typeof data.factions>();
    for (const f of data.factions) {
      const arr = byEthnicity.get(f.ethnicity) ?? [];
      arr.push(f);
      byEthnicity.set(f.ethnicity, arr);
    }
    for (const [eth, factions] of byEthnicity) {
      if (factions.length === 1) {
        expect(factions[0].color).toBe(peopleColor.get(eth));
      }
    }
  });

  it("roster spot checks match the spec", () => {
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    const faction = (id: string) => data.factions.find((f) => f.id === id)!;
    expect(region("kursa")).toMatchObject({
      faction: "curonian-confederacy", population: 45000, cohesion: "high",
    });
    expect(faction("curonian-confederacy")).toMatchObject({
      name: "Curonian Confederacy", type: "regional-confederacy",
      ethnicity: "curonians",
    });
    expect(region("lietuva")).toMatchObject({
      faction: "lietuva", population: 60000, cohesion: "medium",
    });
    expect(faction("lietuva").type).toBe("land-coalition");
    expect(region("eastern-aukstaitija")).toMatchObject({
      faction: "eastern-aukstaitian-confederacy",
      population: 90000, cohesion: "low",
    });
    expect(region("selija")).toMatchObject({
      faction: "selonians", population: 15000, cohesion: "low",
    });
    expect(region("selija").peoples).toEqual(["selonians"]);
    expect(region("zemgale").peoples).toEqual(["semigallians"]);
    expect(region("talava").peoples).toEqual(["latgalians", "livs"]);
    expect(faction("osilians")).toMatchObject({ type: "island-league" });
    expect(region("saaremaa")).toMatchObject({ cohesion: "high" });
  });

  it("populations are 5k multiples totalling 650k", () => {
    let total = 0;
    for (const r of data.regions) {
      expect(Number.isInteger(r.population)).toBe(true);
      expect(r.population).toBeGreaterThan(0);
      expect(r.population % 5000).toBe(0);
      expect(["low", "medium", "high"]).toContain(r.cohesion);
      total += r.population;
    }
    expect(total).toBe(650000);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(3);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("people").sort()).toEqual([
      "AUKŠTAITIANS", "CURONIANS", "ESTONIANS", "LATGALIANS", "LIVS",
      "SAMOGITIANS", "SELONIANS", "SEMIGALLIANS", "YOTVINGIANS",
    ]);
    expect(byKind("people-minor")).toEqual([]);
    expect(byKind("title")).toEqual(["Anno Domini 1184"]);
    expect(byKind("subtitle")).toEqual(["the lands of the eastern Baltic"]);
    expect(byKind("neighbor").length).toBeGreaterThanOrEqual(2);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });
});
```

- [ ] **Step 3: Run the data tests to verify they fail**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL (old map.json has 15 lands, no factions).

- [ ] **Step 4: Install polygon-clipping**

Run: `npm install --save-dev polygon-clipping`
Expected: package.json gains `"polygon-clipping": "^0.15.x"`.

- [ ] **Step 5: Add cache dir to gitignore**

Create or append to `.gitignore` (in `02-balticmap/`):

```
scripts/.cache/
```

- [ ] **Step 6: Rewrite scripts/prepare-data.mjs**

Full replacement. The FACTIONS/LANDS config below is normative - copy it exactly (names contain required diacritics).

```js
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { merge } from "topojson-client";
import polygonClipping from "polygon-clipping";

// GISCO sources, one vintage family so EE/LV (LAU) and LT (NUTS) seams match.
const LAU_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/lau/geojson/LAU_RG_01M_2023_4326.geojson";
const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2020_4326.geojson";
const CACHE_DIR = "scripts/.cache";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const YEAR = 1184;
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];

// Peoples of the eastern Baltic, ca. 1184. Colors are each family's base
// hue; faction fills are shades within the family (see FACTIONS).
const PEOPLES = [
  { id: "estonians", name: "Estonians", color: "#b8cf9b" },
  { id: "livs", name: "Livs", color: "#a8c8cf" },
  { id: "latgalians", name: "Latgalians", color: "#e5b28e" },
  { id: "curonians", name: "Curonians", color: "#d9986f" },
  { id: "semigallians", name: "Semigallians", color: "#e8d18b" },
  { id: "selonians", name: "Selonians", color: "#c7b3d6" },
  { id: "samogitians", name: "Samogitians", color: "#c9b17f" },
  { id: "aukstaitians", name: "Aukštaitians", color: "#e6d9b8" },
  { id: "yotvingians", name: "Yotvingians", color: "#d1a3a0" },
];

// One faction per land, drawn from the land's primary ethnicity. Types are
// descriptive only. Colors are hue-family shades: single-faction
// ethnicities reuse the people color exactly; the 8 Estonian greens are
// spread so neighbouring lands differ clearly in lightness (final tuning
// is done visually in Chrome - keep hexes unique).
const FACTIONS = [
  { id: "ravalans", name: "Ravalans", ethnicity: "estonians", type: "county", color: "#93b371" },
  { id: "harjuans", name: "Harjuans", ethnicity: "estonians", type: "county", color: "#d7e5bb" },
  { id: "vironians", name: "Vironians", ethnicity: "estonians", type: "county", color: "#a3bf83" },
  { id: "jarvans", name: "Jarvans", ethnicity: "estonians", type: "county", color: "#79a15e" },
  { id: "laanians", name: "Laanians", ethnicity: "estonians", type: "county", color: "#b8cf9b" },
  { id: "osilians", name: "Osilians", ethnicity: "estonians", type: "island-league", color: "#e2eecd" },
  { id: "ugandians", name: "Ugandians", ethnicity: "estonians", type: "county", color: "#8fb06d" },
  { id: "sakalans", name: "Sakalans", ethnicity: "estonians", type: "county", color: "#cddfae" },
  { id: "lower-daugava-livs", name: "Lower Daugava Livs", ethnicity: "livs", type: "land-coalition", color: "#a8c8cf" },
  { id: "curonian-confederacy", name: "Curonian Confederacy", ethnicity: "curonians", type: "regional-confederacy", color: "#d9986f" },
  { id: "semigallian-confederacy", name: "Semigallian Confederacy", ethnicity: "semigallians", type: "regional-confederacy", color: "#e8d18b" },
  { id: "selonians", name: "Selonians", ethnicity: "selonians", type: "land-coalition", color: "#c7b3d6" },
  { id: "talavians", name: "Talavians", ethnicity: "latgalians", type: "chiefdom", color: "#e5b28e" },
  { id: "jersikans", name: "Jersikans", ethnicity: "latgalians", type: "principality", color: "#cd9468" },
  { id: "pilsotas-curonians", name: "Pilsotas Curonians", ethnicity: "curonians", type: "land-coalition", color: "#c48257" },
  { id: "samogitian-confederacy", name: "Samogitian Confederacy", ethnicity: "samogitians", type: "regional-confederacy", color: "#c9b17f" },
  { id: "lietuva", name: "Lietuva", ethnicity: "aukstaitians", type: "land-coalition", color: "#d9c48f" },
  { id: "eastern-aukstaitian-confederacy", name: "Eastern Aukštaitian Confederacy", ethnicity: "aukstaitians", type: "land-coalition", color: "#e6d9b8" },
  { id: "sudovians", name: "Sudovians", ethnicity: "yotvingians", type: "land-coalition", color: "#d1a3a0" },
  { id: "dainavians", name: "Dainavians", ethnicity: "yotvingians", type: "land-coalition", color: "#bd8a87" },
];

// The Daugava, west-to-east, as a hand-traced polyline (lon/lat). Closing
// it far to the north yields a mask for the right/north bank. Verified:
// Koknese, Aizkraukle town and Krustpils fall north; Jaunjelgava, Selpils,
// Jekabpils centre and Viesite fall south; the north-bank pieces stay
// contiguous with each other and with Livanu novads (Jersika's Latgale).
const DAUGAVA = [
  [24.60, 56.78], [24.83, 56.72], [25.10, 56.63], [25.25, 56.60],
  [25.43, 56.635], [25.72, 56.615], [25.86, 56.50], [26.10, 56.40],
  [26.35, 56.22], [26.60, 56.05],
];
const NORTH_BANK_MASK = [
  [...DAUGAVA, [26.60, 58.5], [24.60, 58.5], DAUGAVA[0]],
];

// Two municipalities straddle the Daugava; split them so Selija is the
// left/south bank (Selonia proper) and the right/north bank - including
// Koknese and Krustpils - runs with Jersika. Pseudo-members "<name>#north"
// and "<name>#south" are what LANDS reference below.
const SPLIT_MUNICIPALITIES = ["Aizkraukles novads", "Jēkabpils novads"];

// 20 lands. `lau` lists LAU_NAME members (EE/LV, LAU 2023); `nuts` lists
// NUTS-2021 level-3 members (LT). Provenance lives here only. The grouping
// of municipalities into 1184 lands is a deliberate game abstraction.

// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// anchored to ~180k for the Estonian lands (common ~1200 estimate) and
// 650,000 for the whole map, rounded to the nearest 5,000. Cohesion is
// political concentration - a cohesive 45k land can outweigh a fragmented
// 150k neighbourhood.
const LANDS = [
  {
    id: "ravala", name: "Rävala", faction: "ravalans",
    peoples: ["estonians"],
    lau: [
      "Tallinn", "Viimsi vald", "Maardu linn", "Jõelähtme vald", "Rae vald",
      "Kiili vald", "Saku vald", "Saue vald", "Harku vald", "Keila linn",
    ],
    flavor:
      "The small coastal land around the harbour below the fort of " +
      "Lindanise, where traders bound for Novgorod and the Gotland run " +
      "put in. Its elders grow rich on the sea-road.",
    places: ["Lindanise", "Iru"],
    population: 10000, cohesion: "medium",
  },
  {
    id: "harjumaa", name: "Harjumaa", faction: "harjuans",
    peoples: ["estonians"],
    lau: [
      "Lääne-Harju vald", "Kuusalu vald", "Loksa linn", "Anija vald",
      "Raasiku vald", "Kose vald", "Kehtna vald", "Kohila vald",
      "Märjamaa vald", "Rapla vald",
    ],
    flavor:
      "The wooded inland country behind the coast, ruled by elders from " +
      "hillforts - none greater than the ringfort of Varbola, the " +
      "mightiest stronghold of the Estonian lands.",
    places: ["Varbola", "Lohu"],
    population: 20000, cohesion: "medium",
  },
  {
    id: "virumaa", name: "Virumaa", faction: "vironians",
    peoples: ["estonians"],
    lau: [
      "Haljala vald", "Kadrina vald", "Rakvere linn", "Rakvere vald",
      "Tapa vald", "Vinni vald", "Viru-Nigula vald", "Väike-Maarja vald",
      "Alutaguse vald", "Jõhvi vald", "Kohtla-Järve linn", "Lüganuse vald",
      "Narva linn", "Narva-Jõesuu linn", "Sillamäe linn", "Toila vald",
    ],
    flavor:
      "A broad and prosperous land along the northeastern coast, first of " +
      "the Estonian lands to sight ships from the west. Its districts " +
      "answer to their own elders and to no common lord.",
    places: ["Tarvanpea", "Mahu"],
    population: 35000, cohesion: "medium",
  },
  {
    id: "jarvamaa", name: "Järvamaa", faction: "jarvans",
    peoples: ["estonians"],
    lau: ["Järva vald", "Paide linn", "Türi vald"],
    flavor:
      "A small inland land of fields and bogs at the crossroads of the " +
      "Estonian interior; armies and traders alike must pass its causeways.",
    places: ["Kareda"],
    population: 25000, cohesion: "medium",
  },
  {
    id: "laanemaa", name: "Läänemaa", faction: "laanians",
    peoples: ["estonians"],
    lau: [
      "Haapsalu linn", "Lääne-Nigula vald", "Häädemeeste vald",
      "Kihnu vald", "Lääneranna vald", "Põhja-Pärnumaa vald", "Pärnu linn",
      "Saarde vald", "Tori vald",
    ],
    flavor:
      "The mainland west coast of quiet fields and salt meadows, from the " +
      "bay of Matsalu down past the stronghold of Soontagana; its people " +
      "watch the sea but till the land.",
    places: ["Soontagana", "Lihula"],
    population: 25000, cohesion: "medium",
  },
  {
    id: "saaremaa", name: "Saaremaa", faction: "osilians",
    peoples: ["estonians"],
    lau: [
      "Saaremaa vald", "Muhu vald", "Ruhnu vald", "Hiiumaa vald",
      "Vormsi vald",
    ],
    flavor:
      "The great islands, home of the Osilians - fiercest seafarers of " +
      "these waters, whose war-fleets raid as far as the Danish and " +
      "Swedish coasts and return laden before the autumn storms.",
    places: ["Valjala", "Muhu"],
    population: 15000, cohesion: "high",
  },
  {
    id: "ugandi", name: "Ugandi", faction: "ugandians",
    peoples: ["estonians"],
    lau: [
      "Tartu linn", "Tartu vald", "Elva vald", "Kambja vald", "Kastre vald",
      "Luunja vald", "Nõo vald", "Peipsiääre vald", "Kanepi vald",
      "Põlva vald", "Räpina vald", "Antsla vald", "Rõuge vald",
      "Setomaa vald", "Võru linn", "Võru vald", "Otepää vald", "Tõrva vald",
      "Valga vald", "Jõgeva vald", "Mustvee vald", "Põltsamaa vald",
    ],
    flavor:
      "The southeastern uplands behind the strongholds of Tarbatu and " +
      "Otepää. Through Ugandi runs the road from the Rus' towns to the " +
      "coast, and with it both trade and war.",
    places: ["Tarbatu", "Otepää"],
    population: 30000, cohesion: "medium",
  },
  {
    id: "sakala", name: "Sakala", faction: "sakalans",
    peoples: ["estonians"],
    lau: [
      "Viljandi linn", "Viljandi vald", "Mulgi vald", "Põhja-Sakala vald",
    ],
    flavor:
      "The southwestern upland west of the great valley, a land of " +
      "strong farms and stronger forts around Viliende, whose elders " +
      "guard the marches against Latgalian and Liv raids.",
    places: ["Viliende", "Leole"],
    population: 20000, cohesion: "medium",
  },
  {
    id: "livzeme", name: "Līvzeme", faction: "lower-daugava-livs",
    peoples: ["livs"],
    lau: [
      "Rīga", "Jūrmala", "Ādažu novads", "Saulkrastu novads",
      "Siguldas novads", "Ropažu novads", "Salaspils novads",
      "Ķekavas novads", "Mārupes novads", "Olaines novads", "Ogres novads",
      "Tukuma novads", "Limbažu novads",
    ],
    flavor:
      "The Liv lands at the mouths of the Daugava and the Gauja, grown " +
      "rich on river trade with the Rus' towns and Gotland. At Ikšķile the " +
      "monk Meinhard has this very year raised a church of stone - the " +
      "first in these lands.",
    places: ["Ikšķile", "Mārtiņsala", "Turaida"],
    population: 20000, cohesion: "medium",
  },
  {
    id: "kursa", name: "Kursa", faction: "curonian-confederacy",
    peoples: ["curonians"],
    lau: [
      "Dienvidkurzemes novads", "Kuldīgas novads", "Saldus novads",
      "Talsu novads", "Ventspils novads", "Ventspils", "Liepāja",
    ],
    flavor:
      "The Curonian shore, feared from Denmark to Gotland for its " +
      "war-boats. Its lands - Vanema, Ventava, Bandava and the rest - " +
      "follow their own kings in war and in raid.",
    places: ["Talsi", "Embūte", "Grobiņa"],
    population: 45000, cohesion: "high",
  },
  {
    id: "zemgale", name: "Zemgale", faction: "semigallian-confederacy",
    peoples: ["semigallians"],
    lau: [
      "Jelgava", "Jelgavas novads", "Dobeles novads", "Bauskas novads",
    ],
    flavor:
      "The fertile plain of the Semigallians along the Lielupe, rich in " +
      "grain and horses. Its lands answer to their own chiefs at Tērvete " +
      "and Mežotne, and guard the river roads jealously.",
    places: ["Tērvete", "Mežotne"],
    population: 30000, cohesion: "high",
  },
  {
    id: "selija", name: "Sēlija", faction: "selonians",
    peoples: ["selonians"],
    lau: ["Aizkraukles novads#south", "Jēkabpils novads#south"],
    flavor:
      "The wooded hills of the Selonians on the left bank of the Daugava, " +
      "a scattered people of forest farms below the old fort of Sēlpils, " +
      "with no single center and no common lord.",
    places: ["Sēlpils", "Viesīte"],
    population: 15000, cohesion: "low",
  },
  {
    id: "talava", name: "Tālava", faction: "talavians",
    peoples: ["latgalians", "livs"],
    lau: [
      "Cēsu novads", "Valmieras novads", "Valkas novads",
      "Smiltenes novads", "Alūksnes novads", "Gulbenes novads",
      "Madonas novads",
    ],
    flavor:
      "Latgalian land on the upper Gauja, paying occasional tribute to " +
      "Pskov, while Liv settlements hold the river's lower reaches. Its " +
      "chiefs rule from timber forts above the valley.",
    places: ["Beverīna", "Trikāta"],
    population: 30000, cohesion: "high",
  },
  {
    id: "jersika", name: "Jersika", faction: "jersikans",
    peoples: ["latgalians"],
    lau: [
      "Daugavpils", "Augšdaugavas novads", "Krāslavas novads",
      "Ludzas novads", "Rēzekne", "Rēzeknes novads", "Balvu novads",
      "Preiļu novads", "Līvānu novads", "Varakļānu novads",
      "Aizkraukles novads#north", "Jēkabpils novads#north",
    ],
    flavor:
      "A Latgalian principality on the Daugava under its own prince, " +
      "leaning toward Polotsk and the eastern church. Its writ runs down " +
      "the river's right bank past the fortified town of Koknese.",
    places: ["Jersika", "Koknese"],
    population: 35000, cohesion: "high",
  },
  {
    id: "pilsotas", name: "Pilsotas", faction: "pilsotas-curonians",
    peoples: ["curonians"],
    nuts: ["LT023"],
    flavor:
      "The narrow Curonian coast by the lagoon - Pilsotas and Mēguva - " +
      "living from fishing, amber, and the sea-road south to the " +
      "Prussians.",
    places: ["Palanga", "Impiltis"],
    population: 15000, cohesion: "medium",
  },
  {
    id: "zemaitija", name: "Žemaitija", faction: "samogitian-confederacy",
    peoples: ["samogitians"],
    nuts: ["LT026", "LT027", "LT028"],
    flavor:
      "The Samogitian uplands between the coast and the river country: " +
      "dense forest, sacred groves, and rival lineages - Karšuva among " +
      "them - who unite only when raiders come.",
    places: ["Medvėgalis", "Karšuva", "Saulė"],
    population: 70000, cohesion: "low",
  },
  {
    id: "lietuva", name: "Lietuva", faction: "lietuva",
    peoples: ["aukstaitians"],
    nuts: ["LT022", "LT011"],
    flavor:
      "The land of Lietuva between the Neris and the Nemunas, whose " +
      "war-bands ride yearly against the Rus' towns. Its rival dukes are " +
      "slowly, grudgingly, learning to ride under one banner.",
    places: ["Kernavė", "Vilnia"],
    population: 60000, cohesion: "medium",
  },
  {
    id: "eastern-aukstaitija", name: "Eastern Aukštaitija",
    faction: "eastern-aukstaitian-confederacy",
    peoples: ["aukstaitians"],
    nuts: ["LT025", "LT029"],
    flavor:
      "The lake-strewn highlands of Deltuva, Nalšia and Upytė, each land " +
      "under its own lineages, allied and feuding by turn with Lietuva to " +
      "the south and the Rus' towns to the east.",
    places: ["Deltuva", "Upytė", "Utena"],
    population: 90000, cohesion: "low",
  },
  {
    id: "suduva", name: "Sūduva", faction: "sudovians",
    peoples: ["yotvingians"],
    nuts: ["LT024"],
    flavor:
      "Land of the Yotvingian Sudovians, horse-breeders and raiders of the " +
      "western forests, pressed between Mazovian and Rus' spears.",
    places: ["Šešupė valley"],
    population: 30000, cohesion: "low",
  },
  {
    id: "dainava", name: "Dainava", faction: "dainavians",
    peoples: ["yotvingians"],
    nuts: ["LT021"],
    flavor:
      "The southern Yotvingian land of lakes and pine forest along the " +
      "Nemunas bend; its bands raid into Rus' and Mazovia and are raided " +
      "in turn.",
    places: ["Merkinė", "Punia"],
    population: 30000, cohesion: "low",
  },
];

// Label positions are hand-tuned lon/lat, projected below.
// kinds: people | people-minor | neighbor | title | subtitle
const LABELS = [
  { text: "ESTONIANS", lon: 25.3, lat: 58.8, kind: "people" },
  { text: "LIVS", lon: 24.35, lat: 57.05, kind: "people" },
  { text: "LATGALIANS", lon: 26.6, lat: 56.95, kind: "people" },
  { text: "CURONIANS", lon: 22.0, lat: 57.0, kind: "people" },
  { text: "SEMIGALLIANS", lon: 23.3, lat: 56.45, kind: "people" },
  { text: "SELONIANS", lon: 25.35, lat: 56.35, kind: "people" },
  { text: "SAMOGITIANS", lon: 22.6, lat: 55.65, kind: "people" },
  { text: "AUKŠTAITIANS", lon: 25.15, lat: 55.3, kind: "people" },
  { text: "YOTVINGIANS", lon: 23.6, lat: 54.5, kind: "people" },
  { text: "Lands of Rus'", lon: 28.0, lat: 57.2, kind: "neighbor" },
  { text: "Prussian lands", lon: 21.3, lat: 54.15, kind: "neighbor" },
  { text: "Finnic lands", lon: 21.8, lat: 59.85, kind: "neighbor" },
  { text: "Anno Domini 1184", lon: 23.55, lat: 57.75, kind: "title" },
  { text: "the lands of the eastern Baltic", lon: 23.55, lat: 57.58, kind: "subtitle" },
];

async function fetchJsonCached(url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = `${CACHE_DIR}/${url.split("/").pop()}`;
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const [lau, nuts, countries] = await Promise.all([
  fetchJsonCached(LAU_URL),
  fetchJsonCached(NUTS_URL),
  fetchJsonCached(CNTR_URL),
]);

// --- Assemble the member-feature pool: EE/LV municipalities (with the two
// Daugava straddlers split) plus LT NUTS-3 counties. Every member gets a
// `key` that LANDS reference via `lau` or `nuts`.
const toMultiCoords = (geom) =>
  geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

function splitByDaugava(feature) {
  const coords = toMultiCoords(feature.geometry);
  const north = polygonClipping.intersection(coords, NORTH_BANK_MASK);
  const south = polygonClipping.difference(coords, NORTH_BANK_MASK);
  if (!north.length || !south.length) {
    throw new Error(
      `Daugava split produced an empty part for ${feature.properties.LAU_NAME}`,
    );
  }
  const name = feature.properties.LAU_NAME;
  return [
    { key: `${name}#north`, geometry: { type: "MultiPolygon", coordinates: north } },
    { key: `${name}#south`, geometry: { type: "MultiPolygon", coordinates: south } },
  ];
}

const memberFeatures = [];
const lauCounts = { EE: 0, LV: 0 };
for (const f of lau.features) {
  const c = f.properties.CNTR_CODE;
  if (c !== "EE" && c !== "LV") continue;
  lauCounts[c]++;
  if (SPLIT_MUNICIPALITIES.includes(f.properties.LAU_NAME)) {
    memberFeatures.push(...splitByDaugava(f));
  } else {
    memberFeatures.push({ key: f.properties.LAU_NAME, geometry: f.geometry });
  }
}
if (lauCounts.EE !== 79 || lauCounts.LV !== 43) {
  throw new Error(
    `Unexpected LAU counts (EE ${lauCounts.EE}, LV ${lauCounts.LV}) - ` +
      `expected 79/43; check the LAU vintage`,
  );
}
for (const f of nuts.features) {
  if (f.properties.CNTR_CODE !== "LT") continue;
  memberFeatures.push({ key: f.properties.NUTS_ID, geometry: f.geometry });
}

// Sanity: LANDS partition the member pool exactly.
const claimed = LANDS.flatMap((l) => [...(l.lau ?? []), ...(l.nuts ?? [])]);
const availableKeys = memberFeatures.map((m) => m.key).sort();
if (JSON.stringify([...claimed].sort()) !== JSON.stringify(availableKeys)) {
  const claimedSet = new Set(claimed);
  const availSet = new Set(availableKeys);
  const missing = availableKeys.filter((k) => !claimedSet.has(k));
  const unknown = claimed.filter((k) => !availSet.has(k));
  throw new Error(
    `LANDS config does not partition the member set.\n` +
      `unclaimed members: ${missing.join(", ") || "-"}\n` +
      `unknown members: ${unknown.join(", ") || "-"}\n` +
      `(also fails if a member is claimed twice)`,
  );
}

// --- Roster validation: factions, peoples, population, cohesion.
const peopleIds = new Set(PEOPLES.map((p) => p.id));
const factionById = new Map(FACTIONS.map((f) => [f.id, f]));
if (factionById.size !== FACTIONS.length) {
  throw new Error("Duplicate faction ids");
}
const factionColors = new Set(FACTIONS.map((f) => f.color));
if (factionColors.size !== FACTIONS.length) {
  throw new Error("Faction colors must be unique");
}
for (const f of FACTIONS) {
  if (!peopleIds.has(f.ethnicity)) {
    throw new Error(`Faction ${f.id} has unknown ethnicity ${f.ethnicity}`);
  }
}
const factionsPerEthnicity = new Map();
for (const f of FACTIONS) {
  factionsPerEthnicity.set(
    f.ethnicity,
    (factionsPerEthnicity.get(f.ethnicity) ?? 0) + 1,
  );
}
const peopleColorById = new Map(PEOPLES.map((p) => [p.id, p.color]));
for (const f of FACTIONS) {
  if (
    factionsPerEthnicity.get(f.ethnicity) === 1 &&
    f.color !== peopleColorById.get(f.ethnicity)
  ) {
    throw new Error(
      `Single-faction ethnicity ${f.ethnicity} must reuse the people color`,
    );
  }
}
const usedFactions = new Set();
const COHESION_TIERS = new Set(["low", "medium", "high"]);
const EXPECTED_TOTAL_POPULATION = 650000;
let totalPopulation = 0;
for (const land of LANDS) {
  const faction = factionById.get(land.faction);
  if (!faction) throw new Error(`Unknown faction ${land.faction} in ${land.id}`);
  if (usedFactions.has(land.faction)) {
    throw new Error(`Faction ${land.faction} used by more than one land`);
  }
  usedFactions.add(land.faction);
  if (faction.ethnicity !== land.peoples[0]) {
    throw new Error(
      `Faction ${faction.id} ethnicity ${faction.ethnicity} != primary ` +
        `people ${land.peoples[0]} of ${land.id}`,
    );
  }
  for (const pid of land.peoples) {
    if (!peopleIds.has(pid)) throw new Error(`Unknown people ${pid} in ${land.id}`);
  }
  if (
    !Number.isInteger(land.population) ||
    land.population <= 0 ||
    land.population % 5000 !== 0
  ) {
    throw new Error(`Population for ${land.id} must be a positive multiple of 5000`);
  }
  if (!COHESION_TIERS.has(land.cohesion)) {
    throw new Error(`Unknown cohesion "${land.cohesion}" for ${land.id}`);
  }
  totalPopulation += land.population;
}
if (usedFactions.size !== FACTIONS.length) {
  throw new Error("Every faction must rule exactly one land");
}
if (totalPopulation !== EXPECTED_TOTAL_POPULATION) {
  throw new Error(
    `Total population ${totalPopulation} != ${EXPECTED_TOTAL_POPULATION} - ` +
      `update EXPECTED_TOTAL_POPULATION intentionally when the roster changes`,
  );
}

// --- Build a topology so shared borders become shared arcs, then dissolve
// the internal borders of multi-member lands with merge().
const memberCollection = {
  type: "FeatureCollection",
  features: memberFeatures.map((m) => ({
    type: "Feature",
    properties: { key: m.key },
    geometry: m.geometry,
  })),
};
const topo = topology({ members: memberCollection }, 1e5);
const landFeatures = LANDS.map((land) => {
  const keys = new Set([...(land.lau ?? []), ...(land.nuts ?? [])]);
  const members = topo.objects.members.geometries.filter((g) =>
    keys.has(g.properties.key),
  );
  if (members.length !== keys.size) {
    throw new Error(`Missing members for land ${land.id}`);
  }
  return { type: "Feature", properties: { land }, geometry: merge(topo, members) };
});

const neighborFeatures = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);

// Same framing as before: fit to the union of the lands.
const projection = geoAzimuthalEqualArea()
  .rotate([-10, -52])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: landFeatures },
  );
projection.clipExtent([[0, 0], [WIDTH, HEIGHT]]);
const path = geoPath(projection).digits(1);

const labels = LABELS.flatMap((l) => {
  const projected = projection([l.lon, l.lat]);
  const inBounds =
    projected &&
    projected[0] > 0 && projected[0] < WIDTH &&
    projected[1] > 0 && projected[1] < HEIGHT;
  if (!inBounds) {
    if (l.kind === "neighbor") {
      console.warn(`Dropping off-canvas neighbor label: ${l.text}`);
      return [];
    }
    throw new Error(`Label outside canvas: ${l.text}`);
  }
  return [{
    text: l.text,
    x: Math.round(projected[0]),
    y: Math.round(projected[1]),
    kind: l.kind,
  }];
});

const data = {
  width: WIDTH,
  height: HEIGHT,
  attribution: "(c) EuroGeographics for the administrative boundaries",
  year: YEAR,
  peoples: PEOPLES,
  factions: FACTIONS,
  regions: landFeatures
    .map((f) => {
      const { land } = f.properties;
      return {
        id: land.id,
        name: land.name,
        peoples: land.peoples,
        faction: land.faction,
        population: land.population,
        cohesion: land.cohesion,
        flavor: land.flavor,
        places: land.places,
        path: path(f),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  neighbors: neighborFeatures
    .map((f) => ({ id: f.properties.CNTR_ID, path: path(f) }))
    .filter((n) => n.path)
    .sort((a, b) => a.id.localeCompare(b.id)),
  labels,
};

for (const r of data.regions) {
  if (!r.path) throw new Error(`Empty path for region ${r.id}`);
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/map.json", JSON.stringify(data));
console.log(
  `Wrote src/data/map.json: ${data.regions.length} lands, ` +
    `${data.factions.length} factions, ${data.peoples.length} peoples, ` +
    `${data.neighbors.length} neighbors, ${data.labels.length} labels`,
);
```

- [ ] **Step 7: Seed the cache and regenerate map.json**

Run:
```bash
mkdir -p scripts/.cache
cp /private/tmp/claude-501/-Users-janis-kirsteins-Projects-prototypes-02-balticmap/c6f3d57a-d7fc-447d-970d-becc9f4e86a7/scratchpad/lau2023.geojson scripts/.cache/LAU_RG_01M_2023_4326.geojson 2>/dev/null || true
npm run prepare-data
```
Expected: `Wrote src/data/map.json: 20 lands, 20 factions, 9 peoples, ...`. If a label lands outside the canvas or a partition error names specific municipalities, fix the config (not the checks) and re-run.

- [ ] **Step 8: Run the data tests to verify they pass**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files not yet updated (tests/panel.test.ts fixtures and src/map-render.ts do not reference factions yet, so there may be none at this point; `Region.faction` being unused is fine). If map-render/panel fixtures fail because `faction` is now required on `Region`, that is expected leakage into Tasks 2-3 - in that case add the field to the affected FIXTURES minimally (`faction: "curonian-confederacy"` etc.) so the repo compiles, and leave all behavior changes to Tasks 2-3.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts scripts/prepare-data.mjs tests/data.test.ts src/data/map.json package.json package-lock.json .gitignore
git commit -m "feat(balticmap): 20-land LAU-based roster with factions data model"
```

---

### Task 2: Fill polygons by faction color

**Files:**
- Modify: `src/map-render.ts`
- Modify: `tests/render.test.ts`

**Interfaces:**
- Consumes: `MapData.factions`, `Region.faction` from Task 1.
- Produces: polygons filled with `faction.color` (no API change to `renderMap`).

- [ ] **Step 1: Update tests/render.test.ts (failing first)**

The file loads real map.json. Replace the first two tests (which assert people-color fills and 15 lands) with the following; keep the last two tests ("renders neighbors beneath regions..." and "adds the attribution line...") unchanged:

```ts
  it("renders one path per land with data-id, faction color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(20);
    expect(regionPaths.size).toBe(20);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonianConfederacy = data.factions.find(
      (f) => f.id === "curonian-confederacy",
    )!;
    expect(kursa.getAttribute("fill")).toBe(curonianConfederacy.color);
  });

  it("gives same-ethnicity lands different faction fills", () => {
    const container = document.createElement("div");
    const { regionPaths } = renderMap(data, container);
    const fill = (id: string) => regionPaths.get(id)!.getAttribute("fill");
    expect(fill("ravala")).not.toBe(fill("virumaa"));
    expect(fill("ravala")).toBe(
      data.factions.find((f) => f.id === "ravalans")!.color,
    );
    expect(fill("zemgale")).toBe(
      data.factions.find((f) => f.id === "semigallian-confederacy")!.color,
    );
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL (fills still come from people colors).

- [ ] **Step 3: Update src/map-render.ts**

Replace the `peopleColors` map and fill lookup:

```ts
  const factionColors = new Map(data.factions.map((f) => [f.id, f.color]));
```

and in the region loop:

```ts
    const fill = factionColors.get(r.faction);
    if (!fill) throw new Error(`Unknown faction ${r.faction} for ${r.id}`);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map-render.ts tests/render.test.ts
git commit -m "feat(balticmap): fill lands by faction color"
```

---

### Task 3: Faction in panel and tooltip

**Files:**
- Modify: `src/panel.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/panel.test.ts`

**Interfaces:**
- Consumes: `Faction`, `MapData.factions`, `Region.faction` from Task 1.
- Produces:
  - `formatFactionType(type: FactionType): string` - `"regional-confederacy"` -> `"regional confederacy"` (exported from panel.ts)
  - `tooltipText(region: Region, faction: Faction): string` - CHANGED signature; returns `` `${region.name}\n${faction.name} - ~45k - high cohesion` ``
  - `createPanel(container, onClose, peoples, factions: Faction[])` - CHANGED signature; renders a `.panel-faction` line between `.panel-name` and `.panel-peoples`: `Faction: Curonian Confederacy (regional confederacy)`

- [ ] **Step 1: Update tests/panel.test.ts (failing first)**

Extend the fixtures at the top:

```ts
import type { Faction, People, Region } from "../src/types";

const factions: Faction[] = [
  {
    id: "talavians", name: "Talavians", ethnicity: "latgalians",
    type: "chiefdom", color: "#e5b28e",
  },
  {
    id: "jersikans", name: "Jersikans", ethnicity: "latgalians",
    type: "principality", color: "#cd9468",
  },
];
```

Add `faction: "talavians"` to the `talava` fixture and `faction: "jersikans"` to the `jersika` fixture. Update every `createPanel(container, ..., peoples)` call to `createPanel(container, ..., peoples, factions)`.

In the first panel test, after the `.panel-name` assertion add:

```ts
    expect(container.querySelector(".panel-faction")!.textContent).toBe(
      "Faction: Talavians (chiefdom)",
    );
```

Update the tooltip/population helper describe block:

```ts
  it("builds a two-line tooltip with name, faction, band, and cohesion", () => {
    expect(tooltipText(talava, factions[0])).toBe(
      "Tālava\nTalavians - ~30k - high cohesion",
    );
    expect(tooltipText(jersika, factions[1])).toBe(
      "Jersika\nJersikans - ~35k - high cohesion",
    );
  });

  it("formats faction types with spaces", () => {
    expect(formatFactionType("regional-confederacy")).toBe(
      "regional confederacy",
    );
    expect(formatFactionType("county")).toBe("county");
  });
```

(import `formatFactionType` from `../src/panel`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/panel.test.ts`
Expected: FAIL (missing element, wrong signatures).

- [ ] **Step 3: Update src/panel.ts**

```ts
import type { Faction, FactionType, People, Region } from "./types";

export function formatFactionType(type: FactionType): string {
  return type.replace(/-/g, " ");
}
```

`tooltipText` becomes:

```ts
export function tooltipText(region: Region, faction: Faction): string {
  return (
    `${region.name}\n${faction.name} - ` +
    `${formatPopulation(region.population)} - ${region.cohesion} cohesion`
  );
}
```

`createPanel` gains a `factions: Faction[]` parameter, builds a lookup, and a new line element inserted between `name` and `peoplesLine`:

```ts
  const factionById = new Map(factions.map((f) => [f.id, f]));
  const factionLine = document.createElement("p");
  factionLine.className = "panel-faction";
  // ...
  root.append(close, name, factionLine, peoplesLine, population, cohesion, flavor, places);
```

and in `show()`:

```ts
      const faction = factionById.get(region.faction);
      factionLine.textContent = faction
        ? `Faction: ${faction.name} (${formatFactionType(faction.type)})`
        : "";
```

- [ ] **Step 4: Update src/main.ts**

```ts
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const panel = createPanel(app, () => interaction.deselect(), data.peoples, data.factions);
// in onHover:
    if (region) {
      tooltip.show(
        tooltipText(region, factionById.get(region.faction)!),
        clientX,
        clientY,
      );
    } else tooltip.hide();
```

- [ ] **Step 5: Update src/style.css**

Add `.panel-faction` to the muted group (same block as `.panel-peoples`):

```css
.panel-faction,
.panel-peoples {
  font-size: 13px;
  color: #8a7f6f;
  margin-top: 6px;
}

.panel-faction {
  margin-top: 8px;
}
```

(Replace the existing `.panel-peoples` rule with this block.)

- [ ] **Step 6: Run panel tests, then the full suite**

Run: `npx vitest run tests/panel.test.ts` -> PASS
Run: `npm test` -> ALL PASS (interaction/smoke/view/state must still be green; fix any fixture that now needs a `faction` field).

- [ ] **Step 7: Commit**

```bash
git add src/panel.ts src/main.ts src/style.css tests/panel.test.ts
git commit -m "feat(balticmap): faction line in panel and tooltip"
```

---

### Task 4: Full verification, visual pass, merge

**Files:**
- Possibly modify: `scripts/prepare-data.mjs` (label nudges, green-shade tuning) + regenerate `src/data/map.json`

- [ ] **Step 1: Full suite and build**

Run: `npm test` -> ALL PASS
Run: `npm run build` -> succeeds (tsc + vite).

- [ ] **Step 2: Visual e2e in Chrome (required by project memory)**

Start `npm run dev`, open the served URL in Chrome via the browser tools, and check:
- 20 polygons render; no gaps/slivers along the EE/LV and LV/LT seams (LAU vs NUTS vintages) at normal zoom;
- the Selija/Jersika river split looks sane (Jersika runs along the north bank, no stray fragments);
- the 8 Estonian greens are distinguishable between NEIGHBOURING lands (spec rule); if two adjacent greens read as the same, adjust the hexes in FACTIONS (keep single-faction ethnicities on the people color, keep all 20 unique), re-run `npm run prepare-data`, re-check;
- all labels sit sensibly (SELONIANS over Selija, no overlaps with the new borders); nudge LABELS lon/lat and regenerate if needed;
- hover shows `<name>\n<faction> - ~<pop>k - <cohesion> cohesion`; click shows the panel with the faction line.

- [ ] **Step 3: Commit any tuning**

```bash
git add scripts/prepare-data.mjs src/data/map.json
git commit -m "polish(balticmap): tune faction greens and label positions"
```
(Skip if nothing changed.)

- [ ] **Step 4: Merge to main**

```bash
git checkout main
git merge --no-ff feature/factions -m "Merge feature/factions: factions and 20-land LAU-based roster"
```
