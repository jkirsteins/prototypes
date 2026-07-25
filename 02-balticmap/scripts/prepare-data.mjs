import { writeFileSync, mkdirSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";

const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2013_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2013_4326.geojson";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const BALTIC = ["EE", "LV", "LT"];
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];
const COUNTRY_LABELS = [
  { text: "ESTONIA", lon: 25.3, lat: 58.8 },
  { text: "LATVIA", lon: 26.2, lat: 56.9 },
  { text: "LITHUANIA", lon: 23.9, lat: 55.4 },
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

const regions = nuts.features.filter((f) =>
  BALTIC.includes(f.properties.CNTR_CODE),
);
if (regions.length !== 21) {
  throw new Error(`Expected 21 NUTS-3 regions, got ${regions.length}`);
}

const neighbors = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);
if (neighbors.length !== NEIGHBORS.length) {
  const found = neighbors.map((f) => f.properties.CNTR_ID);
  throw new Error(`Missing neighbors: ${NEIGHBORS.filter((c) => !found.includes(c))}`);
}

// LAEA Europe orientation (lon 10, lat 52), fitted to the Baltic states.
const projection = geoAzimuthalEqualArea()
  .rotate([-10, -52])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: regions },
  );
projection.clipExtent([[0, 0], [WIDTH, HEIGHT]]);
const path = geoPath(projection).digits(1);

const data = {
  width: WIDTH,
  height: HEIGHT,
  attribution: "(c) EuroGeographics for the administrative boundaries",
  regions: regions
    .map((f) => ({
      id: f.properties.NUTS_ID,
      name: f.properties.NAME_LATN,
      country: f.properties.CNTR_CODE,
      path: path(f),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  neighbors: neighbors
    .map((f) => ({ id: f.properties.CNTR_ID, path: path(f) }))
    .filter((n) => n.path)
    .sort((a, b) => a.id.localeCompare(b.id)),
  labels: COUNTRY_LABELS.map((l) => {
    const projected = projection([l.lon, l.lat]);
    if (!projected) throw new Error(`Label outside projection: ${l.text}`);
    return { text: l.text, x: Math.round(projected[0]), y: Math.round(projected[1]) };
  }),
};

for (const r of data.regions) {
  if (!r.path) throw new Error(`Empty path for region ${r.id}`);
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/map.json", JSON.stringify(data));
console.log(
  `Wrote src/data/map.json: ${data.regions.length} regions, ` +
    `${data.neighbors.length} neighbors, ${data.labels.length} labels`,
);
