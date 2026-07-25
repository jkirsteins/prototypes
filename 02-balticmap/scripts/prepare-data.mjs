import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath, geoArea } from "d3-geo";
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
const CACHE_DIR = "scripts/.cache";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const YEAR = 1100;
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];

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

// Main trade arteries ca. 1100. `match` lists Natural Earth naming
// variants, compared case-insensitively against each feature's name,
// name_en and name_alt. `major` = wider stroke (the two great rivers).
// A missing minor river is warned and skipped (spec: accept the gap);
// Daugava and Nemunas are required.
const RIVERS = [
  { id: "daugava", name: "Daugava", major: true, match: ["daugava", "zapadnaya dvina", "western dvina", "dvina"] },
  { id: "nemunas", name: "Nemunas", major: true, match: ["neman", "nemunas", "nyoman", "nioman"] },
  { id: "neris", name: "Neris", major: false, match: ["neris", "viliya", "vilija"] },
  { id: "gauja", name: "Gauja", major: false, match: ["gauja"] },
  { id: "venta", name: "Venta", major: false, match: ["venta"] },
  { id: "lielupe", name: "Lielupe", major: false, match: ["lielupe"] },
  { id: "musa", name: "Mūša", major: false, match: ["musa", "mūša"] },
  { id: "memele", name: "Mēmele", major: false, match: ["memele", "mēmele", "nemunelis", "nemunėlis"] },
  { id: "narva", name: "Narva", major: false, match: ["narva"] },
];

// Attested or archaeologically grounded sites ca. 1100, at the modern
// coordinates of their hillforts/harbours. Notes are one-line tooltips
// and must hold for 1100 specifically (hence Daugmale at its peak, an
// unremarkable Ikskile, and no Riga - it does not exist yet). labelDy
// drops a label below its dot where neighbours would collide.
const SETTLEMENTS = [
  { id: "apuole", name: "Apuolė", lon: 21.55, lat: 56.17, note: "Old Curonian stronghold in the north of the land, besieged by sea-kings in centuries past." },
  { id: "daugmale", name: "Daugmale", lon: 24.43, lat: 56.84, note: "Great Liv hillfort and market above the Daugava crossing, at the height of its power." },
  { id: "ikskile", name: "Ikšķile", lon: 24.5, lat: 56.84, labelDy: 16, note: "Liv riverside village; nothing yet marks it out from its neighbours." },
  { id: "impiltis", name: "Impiltis", lon: 21.22, lat: 56.05, note: "Stronghold of the coastal Curonians above the lagoon shore." },
  { id: "jersika", name: "Jersika", lon: 26.2, lat: 56.27, note: "Seat of the Latgalian princes of the Daugava, looking east to Polotsk." },
  { id: "kernave", name: "Kernavė", lon: 24.85, lat: 54.89, note: "Cluster of hillforts above the Neris, foremost among the strongholds of Lietuva." },
  { id: "koknese", name: "Koknese", lon: 25.44, lat: 56.64, note: "Fortified town on the Daugava's right bank, tollgate of the river road." },
  { id: "lindanise", name: "Lindanise", lon: 24.74, lat: 59.44, note: "Harbour below the fort where the Gotland run turns east for Novgorod." },
  { id: "mezotne", name: "Mežotne", lon: 24.05, lat: 56.44, note: "Semigallian stronghold guarding the Lielupe river road." },
  { id: "otepaa", name: "Otepää", lon: 26.46, lat: 58.06, note: "Upland stronghold of Ugandi on the road from the Rus' towns." },
  { id: "selpils", name: "Sēlpils", lon: 25.68, lat: 56.6, labelDy: 16, note: "Old fort of the Selonians on the Daugava's wooded left bank." },
  { id: "soontagana", name: "Soontagana", lon: 24.08, lat: 58.55, note: "Stronghold of the western Estonians amid bogs, reachable only on winter roads." },
  { id: "talsi", name: "Talsi", lon: 22.59, lat: 57.24, note: "Curonian hillfort town among the lakes of Vanema." },
  { id: "tarbatu", name: "Tarbatu", lon: 26.72, lat: 58.38, note: "Estonian hillfort above the Emajõgi crossing, key to the eastern road." },
  { id: "tervete", name: "Tērvete", lon: 23.38, lat: 56.48, note: "Chief hillfort of the Semigallians, seat of their strongest chiefs." },
  { id: "trikata", name: "Trikāta", lon: 25.7, lat: 57.54, note: "Latgalian chief's fort on the upper Gauja, heart of Tālava." },
  { id: "valjala", name: "Valjala", lon: 22.79, lat: 58.4, note: "Chief ringfort of the Osilians, lords of the island sea-roads." },
  { id: "varbola", name: "Varbola", lon: 24.47, lat: 59.03, note: "Great ringfort of Harjumaa, mightiest stronghold of the Estonian lands." },
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
// of municipalities into 1100 lands is a deliberate game abstraction.

// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// anchored to ~180k for the Estonian lands (a common estimate for the
// era, held flat for 1100 - these are game numbers, not a census) and
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
  { text: "Lands of Rus'", lon: 28.0, lat: 57.2, kind: "neighbor" },
  { text: "Prussian lands", lon: 21.3, lat: 54.15, kind: "neighbor" },
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

const [lau, nuts, countries, neRivers, neRiversEu] = await Promise.all([
  fetchJsonCached(LAU_URL),
  fetchJsonCached(NUTS_URL),
  fetchJsonCached(CNTR_URL),
  fetchJsonCached(NE_RIVERS_URL),
  fetchJsonCached(NE_RIVERS_EU_URL),
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
function splitByDaugava(feature) {
  const coords = toMultiCoords(feature.geometry);
  const north = rewind(polygonClipping.intersection(coords, NORTH_BANK_MASK));
  const south = rewind(polygonClipping.difference(coords, NORTH_BANK_MASK));
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

// --- Rivers: collect every Natural Earth segment matching a whitelisted
// name into one MultiLineString per river; geoPath's clipExtent trims
// them to the canvas.
function riverFeatureNames(f) {
  const p = f.properties ?? {};
  return [p.name, p.name_en, p.name_alt]
    .filter((n) => typeof n === "string" && n.length > 0)
    .flatMap((n) => n.split(/[\/,()]/))
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length > 0);
}
const toLineCoords = (geom) =>
  geom.type === "LineString" ? [geom.coordinates]
  : geom.type === "MultiLineString" ? geom.coordinates
  : [];
const riverSegments = new Map(RIVERS.map((r) => [r.id, []]));
for (const f of [...neRivers.features, ...neRiversEu.features]) {
  const names = riverFeatureNames(f);
  for (const r of RIVERS) {
    if (r.match.some((m) => names.includes(m))) {
      riverSegments.get(r.id).push(...toLineCoords(f.geometry));
    }
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

const settlements = SETTLEMENTS.map((s) => {
  const p = projection([s.lon, s.lat]);
  const inBounds =
    p && p[0] > 0 && p[0] < WIDTH && p[1] > 0 && p[1] < HEIGHT;
  if (!inBounds) throw new Error(`Settlement outside canvas: ${s.id}`);
  return {
    id: s.id,
    name: s.name,
    note: s.note,
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
  attribution:
    "(c) EuroGeographics for the administrative boundaries; rivers: Natural Earth",
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
