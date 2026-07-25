import { writeFileSync, mkdirSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { merge } from "topojson-client";

const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2013_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2013_4326.geojson";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const YEAR = 1184;
const BALTIC = ["EE", "LV", "LT"];
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];

// Peoples of the eastern Baltic, ca. 1184. Colors are the map's pastel
// palette; Selonians color no polygon (they share zemgale-selija) but keep
// a color for future use (legend, game factions).
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

// 15 lands. `nuts` lists the NUTS-2013 level-3 members merged into each
// land (provenance lives here only, not in the output). Compound names are
// deliberate cartographic compromises - see the design spec.
const LANDS = [
  {
    id: "ravala", name: "Rävala", nuts: ["EE001"], peoples: ["estonians"],
    flavor:
      "The northern coastlands facing the gulf, where the harbour below the " +
      "fort of Lindanise serves traders bound for Novgorod and the Gotland " +
      "run. Elders of Rävala and Harju rule from hillforts scattered " +
      "through the woods.",
    places: ["Lindanise", "Iru", "Varbola"],
  },
  {
    id: "virumaa", name: "Virumaa", nuts: ["EE007"], peoples: ["estonians"],
    flavor:
      "A broad and prosperous land along the northeastern coast, first of " +
      "the Estonian lands to sight ships from the west. Its districts " +
      "answer to their own elders and to no common lord.",
    places: ["Tarvanpea", "Mahu"],
  },
  {
    id: "jarvamaa", name: "Järvamaa", nuts: ["EE006"], peoples: ["estonians"],
    flavor:
      "A small inland land of fields and bogs at the crossroads of the " +
      "Estonian interior; armies and traders alike must pass its causeways.",
    places: ["Kareda"],
  },
  {
    id: "laanemaa-saaremaa", name: "Läänemaa-Saaremaa", nuts: ["EE004"],
    peoples: ["estonians"],
    flavor:
      "The western coast and the great islands. The Osilians of Saaremaa " +
      "are the fiercest seafarers of these waters, raiding as far as the " +
      "Danish and Swedish coasts; the mainland districts till quieter " +
      "fields.",
    places: ["Valjala", "Soontagana"],
  },
  {
    id: "ugandi-sakala", name: "Ugandi-Sakala", nuts: ["EE008"],
    peoples: ["estonians"],
    flavor:
      "Two lands of the southern uplands: Sakala west of the great valley " +
      "and Ugandi east of it, each with its own strongholds and elders. " +
      "Through Ugandi runs the road from the Rus' towns to the coast.",
    places: ["Tarbatu", "Otepää", "Viliende"],
  },
  {
    id: "livzeme", name: "Līvzeme", nuts: ["LV006", "LV007"],
    peoples: ["livs"],
    flavor:
      "The Liv lands at the mouths of the Daugava and the Gauja, grown " +
      "rich on river trade with the Rus' towns and Gotland. At Ikšķile the " +
      "monk Meinhard has this very year raised a church of stone - the " +
      "first in these lands.",
    places: ["Ikšķile", "Mārtiņsala", "Turaida"],
  },
  {
    id: "kursa", name: "Kursa", nuts: ["LV003"], peoples: ["curonians"],
    flavor:
      "The Curonian shore, feared from Denmark to Gotland for its " +
      "war-boats. Its lands - Vanema, Ventava, Bandava and the rest - " +
      "follow their own kings in war and in raid.",
    places: ["Talsi", "Embūte", "Grobiņa"],
  },
  {
    id: "zemgale-selija", name: "Zemgale-Sēlija", nuts: ["LV009"],
    peoples: ["semigallians", "selonians"],
    flavor:
      "The fertile plain of the Semigallians along the Lielupe, and across " +
      "the Daugava the wooded hills of the Selonians. Both peoples guard " +
      "the river roads jealously.",
    places: ["Tērvete", "Mežotne", "Sēlpils"],
  },
  {
    id: "talava", name: "Tālava", nuts: ["LV008"],
    peoples: ["latgalians", "livs"],
    flavor:
      "Latgalian land on the upper Gauja, paying occasional tribute to " +
      "Pskov, while Liv settlements hold the river's lower reaches. Its " +
      "chiefs rule from timber forts above the valley.",
    places: ["Beverīna", "Trikāta"],
  },
  {
    id: "jersika", name: "Jersika", nuts: ["LV005"], peoples: ["latgalians"],
    flavor:
      "A Latgalian principality on the Daugava under its own prince, " +
      "leaning toward Polotsk and the eastern church. Fortified towns " +
      "watch the river crossings.",
    places: ["Jersika", "Koknese"],
  },
  {
    id: "pilsotas", name: "Pilsotas", nuts: ["LT003"], peoples: ["curonians"],
    flavor:
      "The narrow Curonian coast by the lagoon - Pilsotas and Mēguva - " +
      "living from fishing, amber, and the sea-road south to the " +
      "Prussians.",
    places: ["Palanga", "Impiltis"],
  },
  {
    id: "zemaitija", name: "Žemaitija", nuts: ["LT006", "LT007", "LT008"],
    peoples: ["samogitians"],
    flavor:
      "The Samogitian uplands between the coast and the river country: " +
      "dense forest, sacred groves, and rival lineages - Karšuva among " +
      "them - who unite only when raiders come.",
    places: ["Medvėgalis", "Karšuva", "Saulė"],
  },
  {
    id: "aukstaitija", name: "Aukštaitija",
    nuts: ["LT002", "LT005", "LT009", "LT00A"], peoples: ["aukstaitians"],
    flavor:
      "The eastern highlands, not one realm but many: the lands of " +
      "Lietuva, Deltuva, Nalšia and Upytė, whose warring dukes raid one " +
      "another and their neighbours alike. From here war-bands ride " +
      "against the Rus' towns.",
    places: ["Kernavė", "Deltuva", "Upytė"],
  },
  {
    id: "suduva", name: "Sūduva", nuts: ["LT004"], peoples: ["yotvingians"],
    flavor:
      "Land of the Yotvingian Sudovians, horse-breeders and raiders of the " +
      "western forests, pressed between Mazovian and Rus' spears.",
    places: ["Šešupė valley"],
  },
  {
    id: "dainava", name: "Dainava", nuts: ["LT001"], peoples: ["yotvingians"],
    flavor:
      "The southern Yotvingian land of lakes and pine forest along the " +
      "Nemunas bend; its bands raid into Rus' and Mazovia and are raided " +
      "in turn.",
    places: ["Merkinė", "Punia"],
  },
];

// Label positions are hand-tuned lon/lat, projected below.
// kinds: people | people-minor | neighbor | title | subtitle
const LABELS = [
  { text: "ESTONIANS", lon: 25.3, lat: 58.8, kind: "people" },
  { text: "LIVS", lon: 24.35, lat: 57.05, kind: "people" },
  { text: "LATGALIANS", lon: 26.6, lat: 56.95, kind: "people" },
  { text: "CURONIANS", lon: 22.0, lat: 57.0, kind: "people" },
  { text: "SEMIGALLIANS", lon: 23.6, lat: 56.45, kind: "people" },
  { text: "SELONIANS", lon: 25.6, lat: 56.15, kind: "people-minor" },
  { text: "SAMOGITIANS", lon: 22.6, lat: 55.65, kind: "people" },
  { text: "LITHUANIANS", lon: 25.15, lat: 55.3, kind: "people" },
  { text: "YOTVINGIANS", lon: 23.6, lat: 54.5, kind: "people" },
  { text: "Lands of Rus'", lon: 28.0, lat: 57.2, kind: "neighbor" },
  { text: "Prussian lands", lon: 21.3, lat: 54.15, kind: "neighbor" },
  { text: "Finnic lands", lon: 21.8, lat: 59.85, kind: "neighbor" },
  { text: "Anno Domini 1184", lon: 23.55, lat: 57.75, kind: "title" },
  { text: "the lands of the eastern Baltic", lon: 23.55, lat: 57.58, kind: "subtitle" },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return res.json();
}

const [nuts, countries] = await Promise.all([
  fetchJson(NUTS_URL),
  fetchJson(CNTR_URL),
]);

const nutsFeatures = nuts.features.filter((f) =>
  BALTIC.includes(f.properties.CNTR_CODE),
);
if (nutsFeatures.length !== 21) {
  throw new Error(`Expected 21 NUTS-3 regions, got ${nutsFeatures.length}`);
}

// Sanity: every configured NUTS id exists exactly once, and every fetched
// feature is claimed by exactly one land.
const claimed = LANDS.flatMap((l) => l.nuts);
const available = nutsFeatures.map((f) => f.properties.NUTS_ID).sort();
if (JSON.stringify([...claimed].sort()) !== JSON.stringify(available)) {
  throw new Error(
    `LANDS config does not partition the NUTS set.\nclaimed: ${[...claimed].sort()}\navailable: ${available}`,
  );
}

// Build a topology so shared borders become shared arcs, then dissolve the
// internal borders of multi-member lands with merge().
const topo = topology(
  { nuts: { type: "FeatureCollection", features: nutsFeatures } },
  1e5,
);
const landFeatures = LANDS.map((land) => {
  const members = topo.objects.nuts.geometries.filter((g) =>
    land.nuts.includes(g.properties.NUTS_ID),
  );
  if (members.length !== land.nuts.length) {
    throw new Error(`Missing members for land ${land.id}`);
  }
  return { type: "Feature", properties: { land }, geometry: merge(topo, members) };
});

const neighborFeatures = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);

// Same framing as the NUTS map: fit to the (identical) union of the lands.
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
  regions: landFeatures
    .map((f) => {
      const { land } = f.properties;
      return {
        id: land.id,
        name: land.name,
        peoples: land.peoples,
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
const peopleIds = new Set(PEOPLES.map((p) => p.id));
for (const r of data.regions) {
  for (const pid of r.peoples) {
    if (!peopleIds.has(pid)) throw new Error(`Unknown people ${pid} in ${r.id}`);
  }
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/map.json", JSON.stringify(data));
console.log(
  `Wrote src/data/map.json: ${data.regions.length} lands, ` +
    `${data.peoples.length} peoples, ${data.neighbors.length} neighbors, ` +
    `${data.labels.length} labels`,
);
