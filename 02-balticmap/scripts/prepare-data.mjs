import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import {
  geoAzimuthalEqualArea, geoPath, geoArea, geoContains,
} from "d3-geo";
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
// Natural Earth 10m river centerlines (public domain). The Europe
// supplement carries the smaller regional rivers (Gauja, Venta, Musa...).
const NE_RIVERS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson";
const NE_RIVERS_EU_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_europe.geojson";
// geoBoundaries ADM2 (OpenStreetMap-derived, ODbL). GISCO publishes no powiat
// level and no Kaliningrad subdivision at all, so the Prussian lands come from
// here. Pinned to a release commit so the build stays reproducible.
const GB_COMMIT = "9469f09";
const GB_BASE =
  `https://github.com/wmgeolab/geoBoundaries/raw/${GB_COMMIT}/releaseData/gbOpen`;
const GB_POL_URL = `${GB_BASE}/POL/ADM2/geoBoundaries-POL-ADM2_simplified.geojson`;
const GB_RUS_URL = `${GB_BASE}/RUS/ADM2/geoBoundaries-RUS-ADM2_simplified.geojson`;
const CACHE_DIR = "scripts/.cache";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const YEAR = 1100;
// DK is gone: even with the frame extended west for the Prussian lands it
// stays off-canvas (the bake warns on any entry that contributes no path).
// SE stays - Gotland and Oland came into view with the wider frame.
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL"];

// Peoples of the eastern Baltic, ca. 1100. Colors are each family's base
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
  { id: "prussians", name: "Prussians", color: "#90a8c9" },
];

// One faction per land, drawn from the land's primary ethnicity. Types are
// descriptive only. Colors are hue-family shades: single-faction
// ethnicities reuse the people color exactly; the 8 Estonian greens and the
// 3 Prussian blues are spread so neighbouring lands differ clearly in
// lightness (final tuning is done visually in Chrome - keep hexes unique).
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
  // placeName: Lietuva is named for a land, not a people, so it takes no
  // article. Emitted from here because `factions: FACTIONS` ships this roster
  // verbatim - the flag was once hand-edited into map.json and the next bake
  // silently dropped it, putting "the Lietuva" back in every notice.
  { id: "lietuva", name: "Lietuva", ethnicity: "aukstaitians", type: "land-coalition", color: "#d9c48f", placeName: true },
  { id: "eastern-aukstaitian-confederacy", name: "Eastern Aukštaitian Confederacy", ethnicity: "aukstaitians", type: "land-coalition", color: "#e6d9b8" },
  { id: "sudovians", name: "Sudovians", ethnicity: "yotvingians", type: "land-coalition", color: "#d1a3a0" },
  { id: "dainavians", name: "Dainavians", ethnicity: "yotvingians", type: "land-coalition", color: "#bd8a87" },
  { id: "sembians", name: "Sembians", ethnicity: "prussians", type: "land-coalition", color: "#90a8c9" },
  { id: "natangians", name: "Natangians", ethnicity: "prussians", type: "land-coalition", color: "#7089b0" },
  { id: "nadruvians", name: "Nadruvians", ethnicity: "prussians", type: "land-coalition", color: "#b1c5de" },
  { id: "warmians", name: "Warmians", ethnicity: "prussians", type: "land-coalition", color: "#8098bd" },
  { id: "pomesanians", name: "Pomesanians", ethnicity: "prussians", type: "chiefdom", color: "#a1b7d3" },
  { id: "galindians", name: "Galindians", ethnicity: "prussians", type: "land-coalition", color: "#5f7aa3" },
];

// Main trade arteries ca. 1100. `match` lists Natural Earth naming
// variants, compared case-insensitively against each feature's primary
// name only (properties.name, falling back to name_en) - see
// riverFeatureNames. Matching is exclusive: a feature is assigned to at
// most the first whitelist entry it matches, so no feature's path is
// ever duplicated across two rivers. `major` = wider stroke (the two
// great rivers). A missing minor river is warned and skipped (spec:
// accept the gap); Daugava and Nemunas are required.
// No separate "lielupe" entry: Natural Earth carries the Lielupe only
// as the name_alt of its combined Musa feature (the two rivers share one
// course below their confluence), so the "musa" entry below covers it.
const RIVERS = [
  { id: "daugava", name: "Daugava", major: true, match: ["daugava", "zapadnaya dvina", "western dvina"] },
  { id: "nemunas", name: "Nemunas", major: true, match: ["neman", "nemunas", "nyoman", "nioman"] },
  { id: "neris", name: "Neris", major: false, match: ["neris", "viliya", "vilija"] },
  { id: "gauja", name: "Gauja", major: false, match: ["gauja"] },
  { id: "venta", name: "Venta", major: false, match: ["venta"] },
  { id: "musa", name: "Mūša", major: false, match: ["musa", "mūša"] },
  { id: "memele", name: "Mēmele", major: false, match: ["memele", "mēmele", "nemunelis", "nemunėlis"] },
  { id: "emajogi", name: "Emajõgi", major: false, match: ["emajogi", "emajõgi"] },
  { id: "parnu", name: "Pärnu", major: false, match: ["parnu", "pärnu"] },
  { id: "narva", name: "Narva", major: false, match: ["narva"] },
  { id: "pregolya", name: "Prieglius", major: false, match: ["pregolya", "pregel", "prieglius"] },
  { id: "vistula", name: "Vysla", major: true, match: ["vistula", "wisla", "wisła"] },
  { id: "lyna", name: "Alna", major: false, match: ["lyna", "łyna", "lava", "alle"] },
];

// Attested or archaeologically grounded sites ca. 1100, at the modern
// coordinates of their hillforts/harbours. Notes are one-line tooltips
// and must hold for 1100 specifically (hence Daugmale at its peak, an
// unremarkable Ikskile, and no Riga - it does not exist yet). Each land
// starts with exactly one unlocked settlement; locked entries are
// authored ahead for future unlocks and are not rendered. labelDy drops
// a label below its dot where neighbours would collide.
const SETTLEMENTS = [
  { id: "daugmale", name: "Daugmale", land: "livzeme", unlocked: true, lon: 24.43, lat: 56.84, note: "Great Liv hillfort and market above the Daugava crossing, at the height of its power." },
  // Balga sits at 19.969,54.568 on a headland that GISCO's 1:1M coastline does
  // not resolve, so the true site clips into the lagoon. Placed 4.0 km inland
  // instead, with 1.1 km of clearance from the coast - the nearest inside point
  // is only 220 m clear and would flip out on any source update. Same
  // compromise as the Pionersky and Svetly selection points.
  { id: "honeda", name: "Honeda", land: "notanga", unlocked: true, lon: 19.995, lat: 54.535, note: "Prussian stronghold on the headland above the Vistula Lagoon, watching the shallow crossing." },
  { id: "ikskile", name: "Ikšķile", land: "livzeme", unlocked: false, lon: 24.5, lat: 56.84, labelDy: 16, note: "Liv riverside village; nothing yet marks it out from its neighbours." },
  { id: "impiltis", name: "Impiltis", land: "pilsotas", unlocked: true, lon: 21.22, lat: 56.05, note: "Stronghold of the coastal Curonians above the lagoon shore." },
  { id: "jersika", name: "Jersika", land: "jersika", unlocked: true, lon: 26.2, lat: 56.27, note: "Seat of the Latgalian princes of the Daugava, looking east to Polotsk." },
  { id: "kareda", name: "Kareda", land: "jarvamaa", unlocked: true, lon: 25.75, lat: 58.93, note: "Village among the fields at the heart of the causeway country, where the elders meet." },
  { id: "kaup", name: "Kaup", land: "semba", unlocked: true, lon: 20.53, lat: 54.93, note: "Trading place on the lagoon shore where Prussian amber meets the Baltic sea-road." },
  { id: "kernave", name: "Kernavė", land: "lietuva", unlocked: true, lon: 24.85, lat: 54.89, note: "Cluster of hillforts above the Neris, foremost among the strongholds of Lietuva." },
  { id: "koknese", name: "Koknese", land: "jersika", unlocked: false, lon: 25.44, lat: 56.64, note: "Fortified town on the Daugava's right bank, tollgate of the river road." },
  { id: "lindanise", name: "Lindanise", land: "ravala", unlocked: true, lon: 24.74, lat: 59.44, note: "Harbour below the fort where the Gotland run turns east for Novgorod." },
  { id: "medvegalis", name: "Medvėgalis", land: "zemaitija", unlocked: true, lon: 22.11, lat: 55.635, note: "Highest of the Samogitian hillforts, refuge of the lineages around it." },
  { id: "mezotne", name: "Mežotne", land: "zemgale", unlocked: false, lon: 24.05, lat: 56.44, note: "Semigallian stronghold guarding the Lielupe river road." },
  { id: "otepaa", name: "Otepää", land: "ugandi", unlocked: false, lon: 26.46, lat: 58.06, note: "Upland stronghold of Ugandi on the road from the Rus' towns." },
  { id: "punia", name: "Punia", land: "dainava", unlocked: true, lon: 24.09, lat: 54.513, note: "Hillfort above the Nemunas bend, chief refuge of the Dainava bands." },
  { id: "ragaine", name: "Ragaine", land: "nadrawa", unlocked: true, lon: 22.03, lat: 55.03, note: "Fort above the Nemunas where the river road turns inland toward the Samogitian forests." },
  { id: "lecbarg", name: "Lecbarg", land: "warmi", unlocked: true, lon: 20.58, lat: 54.13, note: "Prussian fort above the Alna, where the tracks from the lagoon meet the inland roads." },
  { id: "kwedis", name: "Kwedis", land: "pamede", unlocked: true, lon: 18.93, lat: 53.73, note: "Stronghold above the Vistula's east bank, the Prussian watch on the Polish crossing." },
  { id: "staswiny", name: "Staswiny", land: "galinda", unlocked: true, lon: 21.86, lat: 53.94, note: "Hillfort among the Galindian lakes, reached by causeway and abandoned to the forest in bad years." },
  { id: "selpils", name: "Sēlpils", land: "selija", unlocked: true, lon: 25.68, lat: 56.6, labelDy: 16, note: "Old fort of the Selonians on the Daugava's wooded left bank." },
  { id: "soontagana", name: "Soontagana", land: "laanemaa", unlocked: true, lon: 24.08, lat: 58.55, note: "Stronghold of the western Estonians amid bogs, reachable only on winter roads." },
  { id: "sudargas", name: "Sudargas", land: "suduva", unlocked: true, lon: 22.63, lat: 55.04, note: "Line of hillforts above the Nemunas, watching the river road to the west." },
  { id: "talsi", name: "Talsi", land: "kursa", unlocked: true, lon: 22.59, lat: 57.24, note: "Curonian hillfort town among the lakes of Vanema." },
  { id: "tarbatu", name: "Tarbatu", land: "ugandi", unlocked: true, lon: 26.72, lat: 58.38, note: "Estonian hillfort above the Emajõgi crossing, key to the eastern road." },
  { id: "tarvanpea", name: "Tarvanpea", land: "virumaa", unlocked: true, lon: 26.355, lat: 59.346, note: "Chief hillfort of the Vironians where the coast road turns toward the east." },
  { id: "tervete", name: "Tērvete", land: "zemgale", unlocked: true, lon: 23.38, lat: 56.48, note: "Chief hillfort of the Semigallians, seat of their strongest chiefs." },
  { id: "trikata", name: "Trikāta", land: "talava", unlocked: true, lon: 25.7, lat: 57.54, note: "Latgalian chief's fort on the upper Gauja, heart of Tālava." },
  { id: "utena", name: "Utena", land: "eastern-aukstaitija", unlocked: true, lon: 25.6, lat: 55.49, note: "Old hillfort seat among the eastern lakes." },
  { id: "valjala", name: "Valjala", land: "saaremaa", unlocked: true, lon: 22.79, lat: 58.4, note: "Chief ringfort of the Osilians, lords of the island sea-roads." },
  { id: "varbola", name: "Varbola", land: "harjumaa", unlocked: true, lon: 24.47, lat: 59.03, note: "Great ringfort of Harjumaa, mightiest stronghold of the Estonian lands." },
  { id: "viliende", name: "Viliende", land: "sakala", unlocked: true, lon: 25.6, lat: 58.363, note: "Stronghold on the Sakala upland, seat of its strongest elders." },
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
const DAUGAVA_CLOSING = [[26.60, 58.5], [24.60, 58.5]];

// Two municipalities straddle the Daugava; split them so Selija is the
// left/south bank (Selonia proper) and the right/north bank - including
// Koknese and Krustpils - runs with Jersika. Pseudo-members "<name>#north"
// and "<name>#south" are what LANDS reference below.
const SPLIT_MUNICIPALITIES = ["Aizkraukles novads", "Jēkabpils novads"];

// A land's members come from three sources: `lau` (EE/LV municipalities, and
// the Lithuanian counties taken at municipality level), `nuts` (NUTS-3), and
// `adm2` (geoBoundaries ADM2 units, keyed by the Prussian place each one is
// selected by). Always read them through memberKeysOf.
const memberKeysOf = (land) =>
  new Set([...(land.lau ?? []), ...(land.nuts ?? []), ...(land.adm2 ?? [])]);

// 23 lands. `lau` lists LAU_NAME members (EE/LV, LAU 2023); `nuts` lists
// NUTS-2021 level-3 members (LT); `adm2` lists geoBoundaries ADM2 members
// (the Kaliningrad rayons of the Prussian lands), named for the Prussian
// place that selects each one - see KALININGRAD_PLACES. Provenance lives
// here only. Every member is a whole administrative unit; the grouping of
// those units into 1100 lands is a deliberate game abstraction.

// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// anchored to ~180k for the Estonian lands (a common estimate for the
// era, held flat for 1100 - these are game numbers, not a census) and
// 735,000 for the whole map, rounded to the nearest 5,000. Cohesion is
// political concentration - a cohesive 45k land can outweigh a fragmented
// 150k neighbourhood.
const LANDS = [
  {
    id: "ravala", name: "Rävala", faction: "ravalans",
    peoples: ["estonians"],
    lau: [
      "Tallinn", "Viimsi vald", "Maardu linn", "Jõelähtme vald", "Rae vald",
      "Kiili vald", "Saku vald", "Saue vald", "Harku vald", "Keila linn",
      "Lääne-Harju vald",
    ],
    flavor:
      "The coastal land around the harbour below the fort of Lindanise, " +
      "running west past the bay of Paldiski, where traders bound for " +
      "Novgorod and the Gotland run put in. Its elders grow rich on the " +
      "sea-road.",
    places: ["Lindanise", "Iru"],
    population: 15000, cohesion: "medium",
  },
  {
    id: "harjumaa", name: "Harjumaa", faction: "harjuans",
    peoples: ["estonians"],
    lau: [
      "Kuusalu vald", "Loksa linn", "Anija vald",
      "Raasiku vald", "Kose vald", "Kehtna vald", "Kohila vald",
      "Märjamaa vald", "Rapla vald",
    ],
    flavor:
      "The wooded inland country behind the coast, ruled by elders from " +
      "hillforts - none greater than the ringfort of Varbola, the " +
      "mightiest stronghold of the Estonian lands.",
    places: ["Varbola", "Lohu"],
    population: 15000, cohesion: "medium",
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
      "rich on river trade with the Rus' towns and Gotland. The hillfort " +
      "town of Daugmale above the river crossing is the busiest market " +
      "on this coast.",
    places: ["Daugmale", "Turaida"],
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
    lau: [
      "Klaipėdos miesto savivaldybė", "Klaipėdos rajono savivaldybė",
      "Kretingos rajono savivaldybė", "Palangos miesto savivaldybė",
      "Skuodo rajono savivaldybė",
    ],
    flavor:
      "The narrow Curonian coast north of the lagoon - Pilsotas and Mēguva - " +
      "living from fishing, amber, and the sea-road south to the " +
      "Prussians.",
    places: ["Palanga", "Impiltis"],
    population: 10000, cohesion: "medium",
  },
  {
    id: "zemaitija", name: "Žemaitija", faction: "samogitian-confederacy",
    peoples: ["samogitians"],
    nuts: ["LT026", "LT028"],
    lau: [
      "Jurbarko rajono savivaldybė", "Tauragės rajono savivaldybė",
      "Šilalės rajono savivaldybė",
    ],
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
      "war-bands ride yearly against the Rus' towns. Its rival dukes " +
      "feud among themselves as readily as they raid abroad.",
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
    adm2: [
      "powiat gołdapski", "powiat olecki", "powiat suwalski", "Suwałki",
    ],
    flavor:
      "Land of the Yotvingian Sudovians, horse-breeders and raiders of the " +
      "western forests, pressed between Mazovian and Rus' spears.",
    places: ["Šešupė valley"],
    population: 35000, cohesion: "low",
  },
  {
    id: "dainava", name: "Dainava", faction: "dainavians",
    peoples: ["yotvingians"],
    nuts: ["LT021"],
    // Sejny goes with Dainava, not Suduva: powiat augustowski does not touch
    // Alytus county, so without the Sejny corridor between them Dainava would
    // be two disjoint pieces (measured: LT021+augustowski union has 2 parts,
    // LT021+sejnenski+augustowski has 1).
    adm2: ["powiat sejneński", "powiat augustowski"],
    flavor:
      "The southern Yotvingian land of lakes and pine forest along the " +
      "Nemunas bend; its bands raid into Rus' and Mazovia and are raided " +
      "in turn.",
    places: ["Merkinė", "Punia"],
    population: 35000, cohesion: "low",
  },
  {
    id: "semba", name: "Semba", faction: "sembians",
    peoples: ["prussians"],
    adm2: [
      "Twangste", "Kaup", "Rusemoter", "Pioneru", "Palweniken", "Kaimen",
      "Zimmerbude", "Pillau",
    ],
    flavor:
      "The amber peninsula between the sea and the lagoons, thickest-settled " +
      "of all the Prussian lands. Its shore yields amber traded as far as " +
      "the Rus' towns, and its elders answer to no one beyond the Pregolya.",
    places: ["Kaup", "Twangste"],
    population: 35000, cohesion: "high",
  },
  {
    id: "notanga", name: "Notanga", faction: "natangians",
    peoples: ["prussians"],
    adm2: [
      "Ilava", "Sventomest", "Ludwigsort", "Friedland", "Tapiow",
      "powiat bartoszycki", "powiat kętrzyński",
    ],
    flavor:
      "The open country south of the Pregolya, running east to Barta: good " +
      "plough land and horse pasture, watched over by forts above the Alle.",
    places: ["Honeda", "Barta"],
    population: 30000, cohesion: "medium",
  },
  {
    id: "nadrawa", name: "Nadrawa", faction: "nadruvians",
    peoples: ["prussians", "curonians", "samogitians"],
    adm2: [
      "Instrutis", "Gumbe", "Stalupenai", "Lazdynai", "Darkiemis", "Ragaine",
      "Gastos", "Tilze", "Labguva",
    ],
    // Skalvia and Lamata on the Nemunas' north bank, taken from Pilsotas and
    // Zemaitija - Prussian ground that the modern county boundary cuts across.
    lau: [
      "Neringos savivaldybė", "Pagėgių savivaldybė",
      "Šilutės rajono savivaldybė",
    ],
    flavor:
      "Deep forest and marsh along the lower Nemunas, the least settled of " +
      "the Prussian lands and the road by which Samogitian raiders come.",
    places: ["Ragaine", "Skalva"],
    population: 25000, cohesion: "low",
  },
  {
    id: "warmi", name: "Warmi", faction: "warmians",
    peoples: ["prussians"],
    adm2: [
      "powiat braniewski", "powiat lidzbarski", "powiat elbląski",
      "powiat olsztyński", "Elbląg", "Olsztyn",
    ],
    flavor:
      "Warmia and Pogesania, between the lagoon and the lakes: the richest " +
      "farmland of the Prussian interior, and the country the sea-traders " +
      "reach first when they turn inland.",
    places: ["Lecbarg", "Ornia"],
    population: 30000, cohesion: "medium",
  },
  {
    id: "pamede", name: "Pamede", faction: "pomesanians",
    peoples: ["prussians"],
    adm2: [
      "powiat kwidzyński", "powiat sztumski", "powiat malborski",
      "powiat iławski", "powiat ostródzki", "powiat nowomiejski",
      "powiat działdowski",
    ],
    flavor:
      "The westernmost Prussian land, running to the Vistula. Across the " +
      "river lie the Poles, and Pamede's chiefs raid over it and are raided " +
      "back across it in turn.",
    places: ["Kwedis", "Sasna"],
    population: 30000, cohesion: "medium",
  },
  {
    id: "galinda", name: "Galinda", faction: "galindians",
    peoples: ["prussians"],
    adm2: [
      "powiat mrągowski", "powiat giżycki", "powiat piski",
      "powiat szczycieński", "powiat ełcki", "powiat węgorzewski",
      "powiat nidzicki",
    ],
    flavor:
      "The lake country: more water and forest than field, thinly held by " +
      "scattered lineages. Armies that march into Galinda tend not to find " +
      "anyone to fight.",
    places: ["Staswiny", "Galindia"],
    population: 15000, cohesion: "low",
  },
];

// Label positions are hand-tuned lon/lat, projected below.
// kinds: people | people-minor | neighbor | river | title | subtitle
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
  // Placed over the middle of the six Prussian lands, now that the whole
  // Prussian ground from the Vistula to the Nemunas is on the map.
  { text: "PRUSSIANS", lon: 20.9, lat: 54.35, kind: "people" },
  { text: "Lands of Rus'", lon: 28.0, lat: 57.2, kind: "neighbor" },
  { text: "Mazovians", lon: 21.4, lat: 53.15, kind: "neighbor" },
  { text: "Pomeranians", lon: 18.4, lat: 53.95, kind: "neighbor" },
  { text: "Finnic lands", lon: 21.8, lat: 59.85, kind: "neighbor" },
  { text: "Daugava", lon: 25.08, lat: 56.5, kind: "river" },
  { text: "Nemunas", lon: 23.9, lat: 54.93, kind: "river" },
  { text: "Gauja", lon: 25.35, lat: 57.28, kind: "river" },
  { text: "Venta", lon: 22.1, lat: 56.85, kind: "river" },
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

const [lau, nuts, countries, neRivers, neRiversEu, gbPol, gbRus] =
  await Promise.all([
    fetchJsonCached(LAU_URL),
    fetchJsonCached(NUTS_URL),
    fetchJsonCached(CNTR_URL),
    fetchJsonCached(NE_RIVERS_URL),
    fetchJsonCached(NE_RIVERS_EU_URL),
    fetchJsonCached(GB_POL_URL),
    fetchJsonCached(GB_RUS_URL),
  ]);

// --- Assemble the member-feature pool: EE/LV municipalities (with the two
// Daugava straddlers split) plus LT NUTS-3 counties. Every member gets a
// `key` that LANDS reference via `lau` or `nuts`.
const toMultiCoords = (geom) =>
  geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;

// polygon-clipping winds rings opposite to the GISCO/d3-geo spherical
// convention; an inverted ring reads as "the whole globe minus a hole"
// (geoArea ~ 4*PI). Rewind: exterior rings must enclose a small area,
// holes the complement.
const ringGeoArea = (ring) =>
  geoArea({ type: "Polygon", coordinates: [ring] });
function rewind(multiPolygonCoords) {
  return multiPolygonCoords.map((poly) =>
    poly.map((ring, i) => {
      const a = ringGeoArea(ring);
      const inverted = i === 0 ? a > 2 * Math.PI : a < 2 * Math.PI;
      return inverted ? [...ring].reverse() : ring;
    }),
  );
}
// A cut is a hand-traced polyline plus a `closing` path that shuts it into a
// ring. The ring is a mask: piece "#a" is what falls inside it, "#b" is the
// rest. Closing points normally run over water or over land the feature does
// not reach, so only the traced line matters. The Daugava split below is the
// only cut on the map - every other member is a whole administrative unit -
// and the towns that must land on each bank are named with DAUGAVA itself.
function maskRing(line, closing) {
  return [[...line, ...closing, line[0]]];
}

function splitByLine(feature, name, line, closing) {
  const coords = toMultiCoords(feature.geometry);
  const mask = maskRing(line, closing);
  const a = rewind(polygonClipping.intersection(coords, mask));
  const b = rewind(polygonClipping.difference(coords, mask));
  if (!a.length || !b.length) {
    throw new Error(`Cut "${name}" produced an empty part`);
  }
  return [
    { key: `${name}#a`, geometry: { type: "MultiPolygon", coordinates: a } },
    { key: `${name}#b`, geometry: { type: "MultiPolygon", coordinates: b } },
  ];
}

function splitByDaugava(feature) {
  const name = feature.properties.LAU_NAME;
  const [north, south] = splitByLine(feature, name, DAUGAVA, DAUGAVA_CLOSING);
  return [
    { key: `${name}#north`, geometry: north.geometry },
    { key: `${name}#south`, geometry: south.geometry },
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
// Klaipeda (LT023) and Taurage (LT027) are taken at municipality level so
// Silute, Neringa and Pagegiai - Skalvian and Lamatan ground, not Curonian -
// can be split away from Pilsotas and Zemaitija. Every other Lithuanian county
// stays at NUTS-3.
const LT_LAU_COUNTIES = ["LT023", "LT027"];
for (const f of nuts.features) {
  if (f.properties.CNTR_CODE !== "LT") continue;
  if (LT_LAU_COUNTIES.includes(f.properties.NUTS_ID)) continue;
  memberFeatures.push({ key: f.properties.NUTS_ID, geometry: f.geometry });
}
// LAU_NAME is truncated to 28 characters in this vintage (several Lithuanian
// names lose their final letter), so these are copied verbatim from the source
// and the count is checked rather than trusted.
const LT_LAU_MEMBERS = [
  "Klaipėdos miesto savivaldybė", "Klaipėdos rajono savivaldybė",
  "Kretingos rajono savivaldybė", "Neringos savivaldybė",
  "Palangos miesto savivaldybė", "Skuodo rajono savivaldybė",
  "Šilutės rajono savivaldybė", "Jurbarko rajono savivaldybė",
  "Pagėgių savivaldybė", "Tauragės rajono savivaldybė",
  "Šilalės rajono savivaldybė",
];
let ltLauFound = 0;
for (const f of lau.features) {
  if (f.properties.CNTR_CODE !== "LT") continue;
  if (!LT_LAU_MEMBERS.includes(f.properties.LAU_NAME)) continue;
  ltLauFound++;
  memberFeatures.push({ key: f.properties.LAU_NAME, geometry: f.geometry });
}
if (ltLauFound !== LT_LAU_MEMBERS.length) {
  throw new Error(
    `Found ${ltLauFound} of ${LT_LAU_MEMBERS.length} Lithuanian LAU members - ` +
      `names are truncated to 28 chars in this vintage, copy them verbatim`,
  );
}

// geoBoundaries winds rings opposite to the GISCO and d3-geo convention, so an
// unrewound ring reads as the whole globe minus a hole. It is also OSM-derived,
// so its outer borders disagree slightly with GISCO's - measured worst case,
// powiat elblaski strays 3.0 km2 outside the GISCO Poland outline on a 1310 km2
// unit (0.23%). Intersecting each unit with its GISCO country polygon keeps
// every international border and coastline coming from GISCO exactly as before,
// leaving geoBoundaries responsible only for the internal divisions.
//
// The bbox is a performance necessity, not a nicety: the RUS file carries all
// 2,327 Russian ADM2 units and the GISCO Russia outline has 82k vertices, so
// clipping everything against everything costs ~8 minutes per bake (measured
// ~200ms per unit). Units whose bounds fall outside the bbox are skipped
// before clipping, and the outline is cropped to the bbox once - exact for
// every unit wholly inside the bbox, which the skip guarantees.
// Plain min/max coordinate bounds, not geoBounds: the source features are not
// rewound yet, and spherical bounds of an inverted ring are garbage.
function planarBounds(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of toMultiCoords(geom)) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
    }
  }
  return [w, s, e, n];
}
function adm2Units(collection, cntrId, bbox) {
  const [bw, bs, be, bn] = bbox;
  const bboxRing = [[[[bw, bs], [be, bs], [be, bn], [bw, bn], [bw, bs]]]];
  const outline = polygonClipping.intersection(
    toMultiCoords(
      countries.features.find((f) => f.properties.CNTR_ID === cntrId).geometry,
    ),
    bboxRing,
  );
  const units = [];
  for (const f of collection.features) {
    const [w, s, e, n] = planarBounds(f.geometry);
    if (w <= bw || e >= be || s <= bs || n >= bn) continue;
    const clipped = polygonClipping.intersection(
      toMultiCoords(f.geometry),
      outline,
    );
    if (!clipped.length) continue;
    units.push({
      name: f.properties.shapeName,
      geometry: { type: "MultiPolygon", coordinates: rewind(clipped) },
    });
  }
  return units;
}
// The two boxes of ground this map takes from geoBoundaries: the Kaliningrad
// exclave, and the Prussian-and-Sudovian northeast of Poland. A needed unit
// straying outside its box fails loudly further down - a Kaliningrad place
// resolves to 0 units, or a whitelisted powiat is "not found".
const KALININGRAD_BBOX = [19.0, 54.0, 23.2, 55.6];
const NE_POLAND_BBOX = [18.0, 52.5, 24.5, 54.9];
// polUnits carries the Polish powiats; the lands built from them arrive with
// the next slice of the map. Both sets are checked for emptiness here so a
// truncated download or a moved release commit fails on the source rather
// than as a confusing "place resolves to 0 units" further down.
const polUnits = adm2Units(gbPol, "PL", NE_POLAND_BBOX);
const kaliningradUnits = adm2Units(gbRus, "RU", KALININGRAD_BBOX);
if (!polUnits.length || !kaliningradUnits.length) {
  throw new Error(
    `geoBoundaries ADM2 yielded ${polUnits.length} PL and ` +
      `${kaliningradUnits.length} RU units - check the pinned release ` +
      `commit ${GB_COMMIT}`,
  );
}

// The oblast's units carry Soviet-era names honouring Bagration, Chernyakhovsky
// and Nesterov, and five are Cyrillic and truncated in the source. None of that
// belongs in a map of 1100, so each unit is selected by a point at the Prussian
// or Baltic place it is centred on. Where no Baltic form of a name is attested,
// the older German toponym stands in - never the Soviet one. Verified: these 22
// points resolve to 22 distinct units covering the whole oblast.
// Two points sit inland of the place they are named for. GISCO's 1:1M coastline
// runs inland of the lagoon shore, so clipping puts the waterfront of Pionersky
// and of Svetly in water; the points are moved to the widest inland part of
// those two units (0.75 km and 2.5 km of clearance) rather than to a neighbour.
const KALININGRAD_PLACES = {
  semba: {
    Twangste: [20.51, 54.71],     // Konigsberg
    Kaup: [20.53, 54.93],         // Zelenogradsk
    Rusemoter: [20.15, 54.94],    // Svetlogorsk
    Pioneru: [20.217, 54.943],    // Pionersky
    Palweniken: [19.96, 54.87],   // Yantarny, the amber works
    Kaimen: [20.61, 54.77],       // Guryevsk
    Zimmerbude: [20.255, 54.715], // Svetly
    Pillau: [19.91, 54.65],       // Baltiysk
  },
  notanga: {
    Ilava: [20.64, 54.39],        // Preussisch Eylau, Bagrationovsk
    Sventomest: [19.94, 54.46],   // Heiligenbeil, Mamonovo
    Ludwigsort: [20.17, 54.57],   // Ladushkin
    Friedland: [21.01, 54.44],    // Pravdinsk
    Tapiow: [21.05, 54.65],       // Tapiau, Gvardeysk
  },
  nadrawa: {
    Instrutis: [21.81, 54.63],    // Insterburg, Chernyakhovsk
    Gumbe: [22.20, 54.59],        // Gumbinnen, Gusev
    Stalupenai: [22.57, 54.63],   // Nesterov
    Lazdynai: [22.47, 54.94],     // Krasnoznamensk
    Darkiemis: [22.01, 54.41],    // Ozyorsk
    Ragaine: [22.03, 55.03],      // Ragnit, Neman
    Gastos: [21.68, 55.05],       // Slavsk
    Tilze: [21.88, 55.08],        // Tilsit, Sovetsk
    Labguva: [21.11, 54.86],      // Labiau, Polessk
  },
};

// Resolve each place to exactly one unit, and account for every unit. This is
// the guard: a place that lands in the sea, two places in one unit, or a unit
// nobody claimed all fail the build.
const takenUnits = new Map();
for (const places of Object.values(KALININGRAD_PLACES)) {
  for (const [place, point] of Object.entries(places)) {
    const hits = kaliningradUnits.filter((u) =>
      geoContains({ type: "Feature", geometry: u.geometry }, point),
    );
    if (hits.length !== 1) {
      throw new Error(
        `Prussian place ${place} at ${point} resolves to ${hits.length} ` +
          `Kaliningrad units - expected exactly 1`,
      );
    }
    const unit = hits[0];
    if (takenUnits.has(unit.name)) {
      throw new Error(
        `${place} and ${takenUnits.get(unit.name)} both resolve to the same ` +
          `Kaliningrad unit`,
      );
    }
    takenUnits.set(unit.name, place);
    memberFeatures.push({ key: place, geometry: unit.geometry });
  }
}
if (takenUnits.size !== kaliningradUnits.length) {
  const missed = kaliningradUnits
    .filter((u) => !takenUnits.has(u.name))
    .map((u) => u.name);
  throw new Error(
    `${missed.length} Kaliningrad units claimed by no Prussian place: ` +
      `${missed.join(", ")}`,
  );
}

// Poland at powiat level, from geoBoundaries. Whole units, no cuts. The pool is
// this whitelist rather than all 380 Polish powiats, so the partition check
// guards that the whitelist is exactly claimed - it catches a typo or a double
// claim, but cannot catch a Prussian powiat nobody thought to list.
// powiat nowodworski (the Vistula delta) is deliberately absent: Zulawy marsh,
// Pomerelian rather than Pomesanian ground in 1100.
const POLISH_MEMBERS = [
  // Warmia and Pogesania
  "powiat braniewski", "powiat lidzbarski", "powiat elbląski",
  "powiat olsztyński", "Elbląg", "Olsztyn",
  // Pomesania and Sasna
  "powiat kwidzyński", "powiat sztumski", "powiat malborski",
  "powiat iławski", "powiat ostródzki", "powiat nowomiejski",
  "powiat działdowski",
  // Galindia
  "powiat mrągowski", "powiat giżycki", "powiat piski",
  "powiat szczycieński", "powiat ełcki", "powiat węgorzewski",
  "powiat nidzicki",
  // Barta, which runs with Notanga
  "powiat bartoszycki", "powiat kętrzyński",
  // Sudovia, south of the modern border
  "powiat gołdapski", "powiat olecki", "powiat suwalski", "Suwałki",
  "powiat sejneński", "powiat augustowski",
];
const polByName = new Map(polUnits.map((u) => [u.name, u]));
for (const name of POLISH_MEMBERS) {
  const unit = polByName.get(name);
  if (!unit) throw new Error(`Polish unit not found in geoBoundaries: ${name}`);
  memberFeatures.push({ key: name, geometry: unit.geometry });
}
// KALININGRAD_PLACES groups the places by land, and so does each land's `adm2`
// list; keep the two from drifting apart. The partition check further down
// sees only the flat key set, so a place filed under the wrong land in one of
// the two would otherwise pass silently. A land's adm2 list may also carry
// Polish powiats (Notanga holds Barta), so only its Kaliningrad entries are
// compared.
const kaliningradPlaceKeys = new Set(
  Object.values(KALININGRAD_PLACES).flatMap((p) => Object.keys(p)),
);
for (const [landId, places] of Object.entries(KALININGRAD_PLACES)) {
  const land = LANDS.find((l) => l.id === landId);
  if (!land) throw new Error(`KALININGRAD_PLACES names unknown land ${landId}`);
  const byPlace = Object.keys(places).sort().join(",");
  const byLand = [...(land.adm2 ?? [])]
    .filter((k) => kaliningradPlaceKeys.has(k))
    .sort()
    .join(",");
  if (byPlace !== byLand) {
    throw new Error(
      `Land ${landId} adm2 list disagrees with KALININGRAD_PLACES:\n` +
        `  places: ${byPlace}\n  adm2:   ${byLand}`,
    );
  }
}

// Sanity: LANDS partition the member pool exactly.
const claimed = LANDS.flatMap((l) => [...memberKeysOf(l)]);
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
const EXPECTED_TOTAL_POPULATION = 820000;

// Population-correlated settlement slots ("max cities"): one slot per
// ~10k people, clamped to 1..10. Deliberate game math, not demography.
const maxSettlementsFor = (population) =>
  Math.min(10, Math.max(1, Math.round(population / 10000)));

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
  const keys = memberKeysOf(land);
  const members = topo.objects.members.geometries.filter((g) =>
    keys.has(g.properties.key),
  );
  if (members.length !== keys.size) {
    throw new Error(`Missing members for land ${land.id}`);
  }
  // merge() dissolves only borders that dedupe into shared topology arcs,
  // which needs identical vertex sequences. Where a land mixes sources
  // (GISCO NUTS/LAU against geoBoundaries), the two files draw the same
  // border with different vertex spacing, so the seam survives merge() and
  // renders as a border line cutting through the land. A single-argument
  // union re-sweeps the rings and dissolves every coincident internal edge;
  // single-source lands pass through unchanged.
  const merged = merge(topo, members);
  const dissolved = rewind(polygonClipping.union(toMultiCoords(merged)));
  return {
    type: "Feature",
    properties: { land },
    geometry: { type: "MultiPolygon", coordinates: dissolved },
  };
});

// Guard against inverted ring winding: every land is a tiny fraction of
// the sphere. 0.05 sr is ~2,000,000 km^2 - far above any Baltic land.
for (const f of landFeatures) {
  const a = geoArea(f);
  if (a > 0.05) {
    throw new Error(
      `Suspicious geometry for ${f.properties.land.id}: geoArea ${a} - ` +
        `check ring winding of split/merged members`,
    );
  }
}

// --- Region adjacency from shared topology arcs. Two lands are adjacent
// iff some member of one and some member of the other trace the same arc.
// Adjacencies that cannot be derived from shared arcs or shared vertices.
// Two causes: island lands share no land border at all, and lands whose
// members come from different source files (LAU, NUTS, geoBoundaries) meet
// on a border that each file generalizes independently, so no vertex
// coincides.
const AUTHORED_LINKS = [
  ["saaremaa", "laanemaa"], // island
  ["saaremaa", "kursa"],    // island
  // The Prussian lands come from geoBoundaries, their Baltic neighbours from
  // GISCO. The same border is generalized differently in each source, so no
  // arc and no vertex is shared.
  ["nadrawa", "pilsotas"],
  ["nadrawa", "zemaitija"],
  ["nadrawa", "suduva"],
];

function arcIdsOf(geometry) {
  const out = new Set();
  const walk = (a) => {
    if (typeof a === "number") out.add(a < 0 ? ~a : a);
    else for (const x of a) walk(x);
  };
  if (geometry.arcs) walk(geometry.arcs);
  return out;
}

const landArcs = new Map(
  LANDS.map((land) => {
    const keys = memberKeysOf(land);
    const arcs = new Set();
    for (const g of topo.objects.members.geometries) {
      if (keys.has(g.properties.key)) {
        for (const id of arcIdsOf(g)) arcs.add(id);
      }
    }
    return [land.id, arcs];
  }),
);

// Fallback for borders arc-sharing misses at the LAU/NUTS seam (Latvia's
// LAU municipalities vs Lithuania's NUTS regions are generalized at
// different vertex densities, so the shared international border does not
// always dedupe into shared arcs even though the lines coincide). Compare
// quantized raw coordinates of the pre-topology member geometries instead:
// two lands are adjacent if they share at least MIN_SHARED_POINTS vertices
// at 1e-6 degree precision (~0.1m). A minimum of 1 shared point is not
// enough to trust: a corner touch or tripoint can coincidentally put a
// single vertex in common without a real shared border, so this requires
// 2+ to guard against a silent false border if the source data changes.
// Verified against known non-adjacent pairs to produce zero false
// positives before relying on it.
const COORD_PRECISION = 6;
const MIN_SHARED_POINTS = 2;
function flattenCoords(geometry) {
  const pts = [];
  const depth =
    geometry.type === "Polygon" ? 2 : geometry.type === "MultiPolygon" ? 3 : -1;
  if (depth < 0) return pts;
  const walk = (a, d) => {
    if (d === 0) { pts.push(a); return; }
    for (const x of a) walk(x, d - 1);
  };
  walk(geometry.coordinates, depth);
  return pts;
}

const landPoints = new Map(
  LANDS.map((land) => {
    const keys = memberKeysOf(land);
    const points = new Set();
    for (const m of memberFeatures) {
      if (keys.has(m.key)) {
        for (const [lon, lat] of flattenCoords(m.geometry)) {
          points.add(`${lon.toFixed(COORD_PRECISION)},${lat.toFixed(COORD_PRECISION)}`);
        }
      }
    }
    return [land.id, points];
  }),
);

const adjacency = new Map(LANDS.map((l) => [l.id, new Set()]));
const landIds = LANDS.map((l) => l.id);
for (let i = 0; i < landIds.length; i++) {
  for (let j = i + 1; j < landIds.length; j++) {
    const a = landArcs.get(landIds[i]);
    const b = landArcs.get(landIds[j]);
    let shared = false;
    for (const id of a) {
      if (b.has(id)) { shared = true; break; }
    }
    if (!shared) {
      const pa = landPoints.get(landIds[i]);
      const pb = landPoints.get(landIds[j]);
      const [smaller, larger] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
      let sharedPoints = 0;
      for (const p of smaller) {
        if (larger.has(p)) {
          sharedPoints++;
          if (sharedPoints >= MIN_SHARED_POINTS) { shared = true; break; }
        }
      }
    }
    if (shared) {
      adjacency.get(landIds[i]).add(landIds[j]);
      adjacency.get(landIds[j]).add(landIds[i]);
    }
  }
}
for (const [a, b] of AUTHORED_LINKS) {
  if (!adjacency.has(a) || !adjacency.has(b)) {
    throw new Error(`Unknown region in authored link ${a}-${b}`);
  }
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
}
for (const [id, set] of adjacency) {
  if (set.size === 0) throw new Error(`Region ${id} has no adjacency`);
}
console.log(
  "Adjacency:",
  [...adjacency].map(([id, s]) => `${id}: ${[...s].sort().join(",")}`).join("; "),
);

const landFeatureById = new Map(
  landFeatures.map((f) => [f.properties.land.id, f]),
);

// --- Growth sites: the one further site a land can still settle -----------
// Found a settlement needs somewhere to put the new dot. Four lands already
// carry an authored locked site (Ikšķile, Koknese, Otepää, Mežotne) and those
// are used as they are; the rest get one unnamed growth site each, because
// inventing 22 more named hillforts would be inventing history the map is
// otherwise careful about.
//
// The point is chosen by sampling the land's own polygon on a grid and taking
// the sample with the best `min(distance to the land's edge, distance to the
// settlements it already has)`. Both halves are needed: distance from the
// existing town alone drives the site into a far corner of the land, where it
// reads as belonging to the neighbour across the border (measured: Žemaitija's
// and eastern Aukštaitija's first attempts landed one pixel apart), and
// distance from the edge alone puts it on top of the town already there.
// Derived from the same geometry the geoContains guard below checks, so it is
// deterministic and validated like an authored site.
const GROWTH_GRID = 60;

function growthSiteFor(land, feature, existing) {
  const coords = [];
  const walk = (node) => {
    if (typeof node[0] === "number") coords.push(node);
    else node.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const stepLon = (maxLon - minLon) / GROWTH_GRID;
  const stepLat = (maxLat - minLat) / GROWTH_GRID;
  // Longitude scaled by cos(lat) so a degree east counts for what it is worth
  // this far north. Distances are in these scaled degrees throughout.
  const k = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180);
  const cell = Math.min(stepLat, stepLon * k);
  const at = (i, j) => [minLon + i * stepLon, minLat + j * stepLat];
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * k, a[1] - b[1]);

  // Contained mask, then a hop count out from the edge (8-connected BFS from
  // every sample that is not inside the land): a cheap distance-to-edge that
  // needs no polygon geometry.
  const n = GROWTH_GRID + 1;
  const insideMask = new Uint8Array(n * n);
  const hops = new Int32Array(n * n).fill(-1);
  const queue = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = at(i, j);
      if (geoContains(feature, p)) insideMask[i * n + j] = 1;
      else { hops[i * n + j] = 0; queue.push(i * n + j); }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const idx = queue[q];
    const i = Math.floor(idx / n), j = idx % n;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nIdx = ni * n + nj;
        if (hops[nIdx] !== -1) continue;
        hops[nIdx] = hops[idx] + 1;
        queue.push(nIdx);
      }
    }
  }

  let best = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const idx = i * n + j;
      if (!insideMask[idx] || hops[idx] < 2) continue; // never hug the edge
      const p = at(i, j);
      const score = Math.min(
        hops[idx] * cell,
        ...existing.map((s) => dist(p, [s.lon, s.lat])),
      );
      if (best === null || score > best.score) {
        best = { lon: Number(p[0].toFixed(3)), lat: Number(p[1].toFixed(3)), score };
      }
    }
  }
  if (best === null) {
    throw new Error(`No interior growth site found in land ${land.id}`);
  }
  return {
    id: `${land.id}-growth`,
    name: "", // unnamed on purpose: no invented place name, so no map label
    land: land.id,
    unlocked: false,
    lon: best.lon,
    lat: best.lat,
    note: `New settlement in ${land.name}.`,
  };
}

const GROWTH_SITES = LANDS.flatMap((land) => {
  const own = SETTLEMENTS.filter((s) => s.land === land.id);
  if (own.some((s) => !s.unlocked)) return []; // authored locked site already
  if (own.length >= maxSettlementsFor(land.population)) return []; // no slot
  return [growthSiteFor(land, landFeatureById.get(land.id), own)];
});

const ALL_SETTLEMENTS = [...SETTLEMENTS, ...GROWTH_SITES];

// --- Settlement validation: known land, exactly one unlocked per land,
// exactly one locked "next site" per land that has a spare slot, authored
// count within the land's slot cap, and the coordinates really fall inside
// the claimed land (curation guard). Growth sites go through every one of
// these too - a generated point is not exempt from the guard that caught
// curation errors in the authored ones.
const landIdSet = new Set(LANDS.map((l) => l.id));
const unlockedPerLand = new Map();
const lockedPerLand = new Map();
const authoredPerLand = new Map();
for (const s of ALL_SETTLEMENTS) {
  if (!landIdSet.has(s.land)) {
    throw new Error(`Settlement ${s.id} claims unknown land ${s.land}`);
  }
  authoredPerLand.set(s.land, (authoredPerLand.get(s.land) ?? 0) + 1);
  const per = s.unlocked ? unlockedPerLand : lockedPerLand;
  per.set(s.land, (per.get(s.land) ?? 0) + 1);
}
for (const s of ALL_SETTLEMENTS) {
  if (!geoContains(landFeatureById.get(s.land), [s.lon, s.lat])) {
    throw new Error(
      `Settlement ${s.id} at ${s.lon},${s.lat} is not inside land ${s.land}`,
    );
  }
}
for (const land of LANDS) {
  const slots = maxSettlementsFor(land.population);
  if ((unlockedPerLand.get(land.id) ?? 0) !== 1) {
    throw new Error(`Land ${land.id} must have exactly one unlocked settlement`);
  }
  if ((authoredPerLand.get(land.id) ?? 0) > slots) {
    throw new Error(`Land ${land.id} has more authored settlements than slots`);
  }
  // A land with a spare slot must have exactly one locked next site, or Found
  // a settlement would be unplayable there for no reason a player can see.
  // A land with no spare slot must have none.
  const locked = lockedPerLand.get(land.id) ?? 0;
  const wanted = slots > 1 ? 1 : 0;
  if (locked !== wanted) {
    throw new Error(
      `Land ${land.id} has ${locked} locked next sites, expected ${wanted}`,
    );
  }
}

// Neighbors are what is left of the world once the playable lands are taken
// out - otherwise RU and PL would carry a stale duplicate of every Prussian
// land underneath the region fills. Subtract the claimed member units, never
// whole source regions: the powiats nobody claimed are Masovia and Pomerelia
// and must survive. The units are unioned first and subtracted in one call -
// N successive differences against a full country MultiPolygon is
// catastrophically slow (measured: minutes, vs seconds this way).
const memberByKey = new Map(memberFeatures.map((m) => [m.key, m]));
const claimedKeySet = new Set(claimed);
const NEIGHBOR_SUBTRACTIONS = {
  // Every unit of the Kaliningrad exclave is claimed (the one-to-one guard
  // above), so the playable ground to remove from RU is exactly "everything
  // inside the bbox". Subtracting the plain rectangle is geometrically
  // identical to subtracting the union of the 22 clipped rayons - and unlike
  // that union it shares no coastline edges with the outline, which is what
  // sends polygon-clipping into its "Unable to complete output ring" failure.
  RU: { bbox: KALININGRAD_BBOX },
  PL: { keys: POLISH_MEMBERS },
};
const neighborFeatures = countries.features
  .filter((f) => NEIGHBORS.includes(f.properties.CNTR_ID))
  .map((f) => {
    const sub = NEIGHBOR_SUBTRACTIONS[f.properties.CNTR_ID];
    if (!sub) return f;
    let cut;
    if (sub.bbox) {
      const [bw, bs, be, bn] = sub.bbox;
      cut = [[[[bw, bs], [be, bs], [be, bn], [bw, bn], [bw, bs]]]];
    } else {
      cut = null;
      for (const key of sub.keys) {
        const member = memberByKey.get(key);
        if (!member) throw new Error(`Neighbor subtraction names unknown member ${key}`);
        if (!claimedKeySet.has(key)) {
          throw new Error(
            `Refusing to subtract ${key} from ${f.properties.CNTR_ID}: no land ` +
              `claims it, so it is still neighbor ground`,
          );
        }
        const coords = toMultiCoords(member.geometry);
        cut = cut ? polygonClipping.union(cut, coords) : coords;
      }
    }
    const remainder = polygonClipping.difference(toMultiCoords(f.geometry), cut);
    if (!remainder.length) {
      throw new Error(`Subtraction emptied neighbor ${f.properties.CNTR_ID}`);
    }
    return {
      ...f,
      geometry: { type: "MultiPolygon", coordinates: rewind(remainder) },
    };
  });

// Same framing as before: fit to the union of the lands.
const projection = geoAzimuthalEqualArea()
  .rotate([-10, -52])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: landFeatures },
  );
// Geometry is baked well past the canvas: at the zoom floor a wide viewport
// letterboxes far beyond the 1000x1400 frame, and a neighbor clipped at the
// canvas edge shows as a straight cut through land with bare sea beyond it.
// 1200 covers viewport aspects up to ~3.4:1 at the floor; anything wider
// falls back to the sea-colored page background. Lands, settlements and
// labels are all inside the canvas, so only neighbors and rivers grow.
const CLIP_MARGIN = 1200;
projection.clipExtent([
  [-CLIP_MARGIN, -CLIP_MARGIN],
  [WIDTH + CLIP_MARGIN, HEIGHT + CLIP_MARGIN],
]);
const path = geoPath(projection).digits(1);

// Sub-pixel land fragments render as stroke dots and dashes. Two kinds, both
// left behind by the seam dissolve above: pinch-offs that became their own
// tiny polygons, and lens-shaped holes where the two sources' lines cross
// back and forth - together they trace a dashed ghost of the very seam the
// dissolve removed. A few speck polygons the sources carry fall out with
// them. Measured on the projected map: every such sliver is 0.7 px2 or less,
// while the smallest real feature kept (an islet of the Saaremaa
// archipelago) is 1.1 px2, so the cut sits between the two clusters. Every
// drop is logged so a real loss cannot pass silently.
const MIN_POLY_PX2 = 0.9;
for (const f of landFeatures) {
  // A hole ring measured alone reads as globe-minus-hole; reverse it into an
  // exterior ring to measure the area it encloses.
  const holePx2 = (ring) =>
    path.area({ type: "Polygon", coordinates: [[...ring].reverse()] });
  let droppedPolys = 0;
  let droppedHoles = 0;
  const kept = [];
  for (const poly of f.geometry.coordinates) {
    if (path.area({ type: "Polygon", coordinates: poly }) < MIN_POLY_PX2) {
      droppedPolys++;
      continue;
    }
    const holes = poly.slice(1).filter((h) => holePx2(h) >= MIN_POLY_PX2);
    droppedHoles += poly.length - 1 - holes.length;
    kept.push([poly[0], ...holes]);
  }
  if (!kept.length) {
    throw new Error(`Sliver filter emptied land ${f.properties.land.id}`);
  }
  if (droppedPolys || droppedHoles) {
    console.log(
      `Land ${f.properties.land.id}: dropped ${droppedPolys} sub-pixel ` +
        `sliver(s) and ${droppedHoles} sub-pixel hole(s)`,
    );
  }
  f.geometry.coordinates = kept;
}

// --- Rivers: collect every Natural Earth segment matching a whitelisted
// name into one MultiLineString per river; geoPath's clipExtent trims
// them to the canvas.
function riverFeatureNames(f) {
  const p = f.properties ?? {};
  // Primary name only (name_en as fallback when name is absent) - never
  // name_alt, which on Natural Earth can carry an entirely different
  // river's name (e.g. a combined-course feature) and would otherwise
  // pull that feature into two whitelist entries at once.
  const primary = typeof p.name === "string" && p.name.length > 0 ? p.name : p.name_en;
  return typeof primary === "string"
    ? primary
        .split(/[\/,()]/)
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length > 0)
    : [];
}
const toLineCoords = (geom) =>
  geom.type === "LineString" ? [geom.coordinates]
  : geom.type === "MultiLineString" ? geom.coordinates
  : [];
const riverSegments = new Map(RIVERS.map((r) => [r.id, []]));
for (const f of [...neRivers.features, ...neRiversEu.features]) {
  const names = riverFeatureNames(f);
  // First whitelist match wins - each feature belongs to at most one river.
  const river = RIVERS.find((r) => r.match.some((m) => names.includes(m)));
  if (river) {
    riverSegments.get(river.id).push(...toLineCoords(f.geometry));
  }
}
const rivers = RIVERS.flatMap((r) => {
  const segs = riverSegments.get(r.id);
  const d = segs.length
    ? path({ type: "MultiLineString", coordinates: segs })
    : null;
  if (!d) {
    if (r.major) {
      throw new Error(`Natural Earth match failed for required river ${r.id}`);
    }
    console.warn(`River ${r.id}: no usable Natural Earth geometry - skipped`);
    return [];
  }
  return [{ id: r.id, name: r.name, major: r.major, path: d }];
}).sort((a, b) => a.id.localeCompare(b.id));

const settlements = ALL_SETTLEMENTS.map((s) => {
  const p = projection([s.lon, s.lat]);
  const inBounds =
    p && p[0] > 0 && p[0] < WIDTH && p[1] > 0 && p[1] < HEIGHT;
  if (!inBounds) throw new Error(`Settlement outside canvas: ${s.id}`);
  return {
    id: s.id,
    name: s.name,
    note: s.note,
    land: s.land,
    unlocked: s.unlocked,
    x: Math.round(p[0]),
    y: Math.round(p[1]),
    ...(s.labelDy !== undefined ? { labelDy: s.labelDy } : {}),
  };
}).sort((a, b) => a.id.localeCompare(b.id));

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
  margin: CLIP_MARGIN,
  attribution:
    "(c) EuroGeographics for the administrative boundaries; " +
    "Poland and Kaliningrad: geoBoundaries / OpenStreetMap contributors (ODbL); " +
    "rivers: Natural Earth",
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
        maxSettlements: maxSettlementsFor(land.population),
        adjacent: [...adjacency.get(land.id)].sort(),
        flavor: land.flavor,
        places: land.places,
        path: path(f),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  neighbors: neighborFeatures
    .map((f) => ({ id: f.properties.CNTR_ID, path: path(f) }))
    .filter((n) => {
      if (!n.path) {
        console.warn(
          `Neighbor ${n.id} is entirely off-canvas - drop it from NEIGHBORS ` +
            `or widen the frame`,
        );
        return false;
      }
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  rivers,
  settlements,
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
    `${data.neighbors.length} neighbors, ${data.rivers.length} rivers, ` +
    `${data.settlements.length} settlements, ${data.labels.length} labels`,
);
