import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import {
  geoAzimuthalEqualArea, geoPath, geoArea, geoContains,
} from "d3-geo";
import { topology } from "topojson-server";
import { merge } from "topojson-client";
import polygonClipping from "polygon-clipping";

// GISCO sources, the same vintage family as the Baltic bake so the two maps
// share provenance and precision. Everything playable comes from NUTS-3;
// Andorra and the grey neighbors come from the countries file.
const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2020_4326.geojson";
// Natural Earth 10m river centerlines (public domain). The Europe supplement
// is fetched for parity with the Baltic bake; every Iberian river matched
// below happens to live in the main file.
const NE_RIVERS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson";
const NE_RIVERS_EU_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_europe.geojson";
const CACHE_DIR = "scripts/.cache";

const WIDTH = 1400;
const HEIGHT = 1150;
const PAD = 40;
const YEAR = 895;
// The 2000-margin clip below (CLIP_MARGIN) brings the wider surroundings into
// view: DZ and TN are the Maghreb coast the emirate looked across, and IT
// joins for Sardinia (Corsica arrives with FR - both are whole islands of
// countries already listed). CH and DE close the northeast corner, where
// France's own polygon used to end short of the visible ring and the sea
// rect behind everything showed through as a phantom sea where those
// countries belong. The bake warns on any entry that contributes no path,
// which is what would catch a code that still earns no place here - BE, LU,
// NL, SI and HR were all measured and dropped: none of them reach even the
// wider painted-rect clip.
const NEIGHBORS = ["FR", "MA", "DZ", "TN", "IT", "CH", "DE"];

// Off-map ES/PT ground: the Atlantic archipelagos and the African exclaves.
// The Balearics stay - they are a faction.
const EXCLUDED_PREFIXES = ["ES7", "PT2", "PT3"];
const EXCLUDED_IDS = ["ES630", "ES640"];
// Every kept mainland/Balearic NUTS-3 unit, pinned so a vintage change fails
// on the source rather than as a partition surprise further down.
const EXPECTED_KEPT_NUTS = 73;

// Peoples of Iberia, ca. 895. Colors are each family's base hue; faction
// fills are shades within the family (see FACTIONS).
const PEOPLES = [
  { id: "galicians", name: "Galicians", color: "#9fc487" },
  { id: "asturleonese", name: "Asturleonese", color: "#8fb3d1" },
  { id: "basques", name: "Basques", color: "#c0a8d4" },
  { id: "castilians", name: "Castilians", color: "#cf8f83" },
  { id: "catalans", name: "Catalans", color: "#e3cf8e" },
  { id: "arabs", name: "Arabs", color: "#8ec4b8" },
  { id: "berbers", name: "Berbers", color: "#d9a06f" },
  { id: "muwallads", name: "Muwallads", color: "#d1a3a0" },
];

// One faction per land, drawn from the land's primary ethnicity. Types are
// descriptive only. Colors are hue-family shades: single-faction ethnicities
// reuse the people color exactly; the seven muwallad roses and the five
// catalan golds are spread so neighbouring lands differ clearly in lightness.
const FACTIONS = [
  { id: "galicians-of-iria", name: "Galicians", ethnicity: "galicians", type: "land", color: "#9fc487" },
  { id: "asturians", name: "Asturians", ethnicity: "asturleonese", type: "principality", color: "#a9c6de" },
  { id: "leonese", name: "Leonese", ethnicity: "asturleonese", type: "land", color: "#7ba2c4" },
  { id: "alavese", name: "Alavese", ethnicity: "basques", type: "land", color: "#cdb9dd" },
  { id: "castilians-of-burgos", name: "Castilians", ethnicity: "castilians", type: "land", color: "#cf8f83" },
  { id: "pamplonese", name: "Pamplonese", ethnicity: "basques", type: "principality", color: "#ab8fc3" },
  { id: "aragonese", name: "Aragonese", ethnicity: "catalans", type: "land", color: "#efe2b1" },
  { id: "sobrarbians", name: "Sobrarbians", ethnicity: "catalans", type: "land", color: "#d8c176" },
  { id: "pallaresans", name: "Pallaresans", ethnicity: "catalans", type: "land", color: "#c9b061" },
  { id: "urgellians", name: "Urgellians", ethnicity: "catalans", type: "land", color: "#f4ead0" },
  { id: "barcelonans", name: "Barcelonans", ethnicity: "catalans", type: "united-lands", color: "#e3cf8e" },
  { id: "banu-qasi", name: "Banu Qasi", ethnicity: "muwallads", type: "united-lands", color: "#d1a3a0" },
  { id: "toledans", name: "Toledans", ethnicity: "muwallads", type: "land", color: "#c08d8a" },
  { id: "meridans", name: "Meridans", ethnicity: "berbers", type: "land", color: "#d9a06f" },
  { id: "banu-marwan", name: "Banu Marwan", ethnicity: "muwallads", type: "land", color: "#e2b8b5" },
  { id: "lisbonese", name: "Lisbonese", ethnicity: "muwallads", type: "land", color: "#f2dcd9" },
  { id: "algarvians", name: "Algarvians", ethnicity: "arabs", type: "land", color: "#8ec4b8" },
  { id: "sevillans", name: "Sevillans", ethnicity: "arabs", type: "united-lands", color: "#a8d3c9" },
  // The emirate's rump around the capital: a dynasty, not a place, so no
  // placeName flag - "the Umayyads" takes the article like everyone else.
  { id: "umayyads", name: "Umayyads", ethnicity: "arabs", type: "principality", color: "#74af9f" },
  { id: "hafsunids", name: "Hafsunids", ethnicity: "muwallads", type: "chiefdom", color: "#a87672" },
  { id: "elvirans", name: "Elvirans", ethnicity: "arabs", type: "land", color: "#c2e1d9" },
  { id: "todmirians", name: "Todmirians", ethnicity: "muwallads", type: "land", color: "#96625e" },
  { id: "valencians", name: "Valencians", ethnicity: "muwallads", type: "land", color: "#eccac6" },
  { id: "balearians", name: "Balearians", ethnicity: "berbers", type: "island-lands", color: "#c2854f" },
];

// Main arteries of the peninsula ca. 895. Same matching contract as the
// Baltic bake: `match` lists Natural Earth naming variants, compared
// case-insensitively against each feature's primary name only, first
// whitelist entry wins, majors are required, minors warn and skip.
// "Guadiana Menor" stays out by itself: its primary name is the full
// two-word string and matches nothing here.
const RIVERS = [
  { id: "douro", name: "Douro", major: true, match: ["douro", "duero"] },
  { id: "ebro", name: "Ebro", major: true, match: ["ebro"] },
  { id: "guadalquivir", name: "Guadalquivir", major: true, match: ["guadalquivir"] },
  { id: "guadiana", name: "Guadiana", major: false, match: ["guadiana"] },
  { id: "minho", name: "Minho", major: false, match: ["minho", "mino"] },
  { id: "tagus", name: "Tagus", major: false, match: ["tagus", "tajo", "tejo"] },
];

// Attested sites ca. 895, at modern coordinates. Notes are one-line tooltips
// and must hold for 895 specifically - hence Zamora fresh from Alfonso III's
// repopulation, Bobastro at its height, and Mayrit a fort rather than a town.
// Each land starts with exactly one unlocked settlement; locked entries fill
// the land's remaining slots for Found a settlement. Coastal dots sit a few
// km inland where GISCO's 1:1M coastline would otherwise clip them into the
// sea. labelDy drops a label below its dot where neighbours would collide.
const SETTLEMENTS = [
  // Galicia and the northwest
  { id: "iria", name: "Iria", land: "galicia", unlocked: true, lon: -8.66, lat: 42.74, note: "Seat of the bishop who keeps the shrine of Santiago, a day's walk up the valley." },
  { id: "lugo", name: "Lugo", land: "galicia", unlocked: false, lon: -7.556, lat: 43.012, note: "Old Roman town whose circle of walls still stands whole around the church." },
  { id: "ourense", name: "Ourense", land: "galicia", unlocked: false, lon: -7.864, lat: 42.336, note: "Town at the hot springs and the Minho bridge, rebuilt under the Galician counts." },
  { id: "tui", name: "Tui", land: "galicia", unlocked: false, lon: -8.644, lat: 42.047, note: "Old see at the Minho crossing, restored since the border pushed south of the river." },
  { id: "braga", name: "Braga", land: "galicia", unlocked: false, lon: -8.426, lat: 41.545, note: "Ancient church metropolis of the northwest, resettled under the counts of Portugal." },
  { id: "oviedo", name: "Oviedo", land: "asturias", unlocked: true, lon: -5.844, lat: 43.362, note: "City of churches raised by the kings, the royal seat behind the mountain wall." },
  { id: "cangas", name: "Cangas", land: "asturias", unlocked: false, lon: -5.129, lat: 43.351, note: "First seat of the kings by the field of Covadonga, still holy to the dynasty." },
  { id: "santillana", name: "Santillana", land: "asturias", unlocked: false, lon: -4.106, lat: 43.388, note: "Abbey of Santa Juliana among the sea meadows, gathering the relics of the coast." },
  { id: "leon-city", name: "Leon", land: "leon", unlocked: true, lon: -5.567, lat: 42.599, note: "Old legionary city on the meseta road, its walls repeopled from the mountains." },
  { id: "astorga", name: "Astorga", land: "leon", unlocked: false, lon: -6.056, lat: 42.457, note: "Walled Roman crossroads restored a generation ago, gate of the roads west." },
  { id: "zamora", name: "Zamora", land: "leon", unlocked: false, lon: -5.744, lat: 41.503, note: "Fortress city above the Douro ford, rebuilt by King Alfonso against the raids." },
  { id: "braganca", name: "Braganca", land: "leon", unlocked: false, lon: -6.757, lat: 41.806, note: "Hill town of the cold northeastern marches, half empty between the raids." },
  { id: "armentia", name: "Armentia", land: "alava", unlocked: true, lon: -2.685, lat: 42.83, note: "See of the Alavese among their hills, a church and a ring of farms." },
  { id: "sopuerta", name: "Sopuerta", land: "alava", unlocked: false, lon: -3.17, lat: 43.267, note: "Iron valleys of the western Basques, named in the king's chronicle a lifetime ago." },
  { id: "burgos", name: "Burgos", land: "castile", unlocked: true, lon: -3.7, lat: 42.343, note: "New fortress town on the Arlanzon, raised by Count Diego ten years past." },
  { id: "amaya", name: "Amaya", land: "castile", unlocked: false, lon: -4.028, lat: 42.655, note: "Rock fortress over the northern meseta, repeopled from the mountain valleys." },
  { id: "najera", name: "Najera", land: "castile", unlocked: false, lon: -2.735, lat: 42.416, note: "Red-cliff town on the Ebro road, in the shadow of the Banu Qasi." },
  { id: "pamplona-city", name: "Pamplona", land: "pamplona", unlocked: true, lon: -1.644, lat: 42.812, note: "City of the Basque kings in their mountain basin, wary of Franks and emirs alike." },
  { id: "leire", name: "Leire", land: "pamplona", unlocked: false, lon: -1.174, lat: 42.65, labelDy: 16, note: "Mountain abbey above the Aragon valley, burial house of the Pamplona kings." },
  // Tudela sits on Navarrese ground on this map's whole-province grouping;
  // in 895 it is the Banu Qasi's own river seat, and the note says so.
  { id: "tudela", name: "Tudela", land: "pamplona", unlocked: false, lon: -1.606, lat: 42.065, note: "Ebro stronghold of the Banu Qasi, watching the river road to Zaragoza." },

  // The Pyrenean counties
  { id: "jaca", name: "Jaca", land: "aragon", unlocked: true, lon: -0.549, lat: 42.57, note: "Stone town of the Aragon valley, holding the southern mouth of the pass." },
  { id: "siresa", name: "Siresa", land: "aragon", unlocked: false, lon: -0.749, lat: 42.747, note: "Monastery of the high valley, schoolhouse of the little county." },
  { id: "boltana", name: "Boltana", land: "sobrarbe", unlocked: true, lon: 0.067, lat: 42.446, note: "Castle village above the Ara, named in the emirs' campaign rolls." },
  { id: "alaon", name: "Alaon", land: "sobrarbe", unlocked: false, lon: 0.735, lat: 42.318, note: "Old abbey by the Noguera gorge, its charters older than the county." },
  { id: "tremp", name: "Tremp", land: "pallars", unlocked: true, lon: 0.895, lat: 42.166, labelDy: 16, note: "Valley town of the Pallars counts, ringed by terraced hills." },
  { id: "gerri", name: "Gerri", land: "pallars", unlocked: false, lon: 1.067, lat: 42.324, labelDy: 16, note: "Salt springs and an old abbey by the Noguera, tolling the mountain road." },
  { id: "la-seu", name: "La Seu", land: "urgell", unlocked: true, lon: 1.458, lat: 42.358, note: "Cathedral town of Urgell under the high peaks, seat of counts and bishops." },
  { id: "balaguer", name: "Balaguer", land: "urgell", unlocked: false, lon: 0.806, lat: 41.791, note: "Muslim border fort above the Segre plain, facing the mountain counties." },
  { id: "barcelona-city", name: "Barcelona", land: "barcelona", unlocked: true, lon: 2.13, lat: 41.42, note: "Old Roman walled city, seat of Count Wifred's house and the eastern march." },
  { id: "girona", name: "Girona", land: "barcelona", unlocked: false, lon: 2.821, lat: 41.983, note: "Walled city on the Frankish road, first stop south of the mountain passes." },
  { id: "vic", name: "Vic", land: "barcelona", unlocked: false, lon: 2.255, lat: 41.93, note: "Plain of Ausona resettled under Count Wifred, a new cathedral among burned farms." },
  { id: "cardona", name: "Cardona", land: "barcelona", unlocked: false, lon: 1.68, lat: 41.914, note: "Salt mountain and castle above the frontier woods, guarded since Wifred's day." },

  // The Ebro march
  { id: "zaragoza", name: "Zaragoza", land: "upper-march", unlocked: true, lon: -0.877, lat: 41.656, note: "White city on the Ebro, greatest of the march towns, seldom obedient to Cordoba." },
  { id: "tarazona", name: "Tarazona", land: "upper-march", unlocked: false, lon: -1.725, lat: 41.905, note: "Old Roman town under the Moncayo, tied to the Banu Qasi river lands." },
  { id: "calatayud", name: "Calatayud", land: "upper-march", unlocked: false, lon: -1.643, lat: 41.353, note: "Castle town of Ayyub on the Jalon road, second city of the march." },
  { id: "daroca", name: "Daroca", land: "upper-march", unlocked: false, lon: -1.415, lat: 41.115, note: "Walled town in the Jiloca gorge, on the road from the Ebro to Toledo." },
  { id: "medinaceli", name: "Medinaceli", land: "upper-march", unlocked: false, lon: -2.431, lat: 41.267, note: "Madinat Salim on the high pass, watching the road to the Duero wastes." },

  // The middle march
  { id: "toledo-city", name: "Toledo", land: "toledo", unlocked: true, lon: -4.027, lat: 39.862, note: "Old Visigoth capital on its rock above the Tagus, proud and forever in revolt." },
  { id: "mayrit", name: "Mayrit", land: "toledo", unlocked: false, lon: -3.703, lat: 40.417, note: "Fort of Emir Muhammad on the sierra road, outwork of Toledo against the north." },
  { id: "guadalajara", name: "Guadalajara", land: "toledo", unlocked: false, lon: -3.161, lat: 40.633, note: "Bridge town of Wadi al-Hijara, holding the upper road of the middle march." },
  { id: "talavera", name: "Talavera", land: "toledo", unlocked: false, lon: -4.83, lat: 39.964, note: "Walled town on the Tagus below Toledo, its rival in every revolt." },
  { id: "cuenca", name: "Cuenca", land: "toledo", unlocked: false, lon: -2.132, lat: 40.07, note: "Rock fort between two gorges, small and nearly impossible to storm." },
  { id: "ucles", name: "Ucles", land: "toledo", unlocked: false, lon: -2.86, lat: 39.98, note: "Castle of the Zannun lords on the meseta edge, half loyal to Toledo alone." },

  // The west. Merida the city stands on Guadiana ground that runs with
  // Badajoz on this map's whole-province grouping; the land named for it is
  // its old hinterland north of the river, seated at Coria.
  { id: "coria", name: "Coria", land: "merida", unlocked: true, lon: -6.537, lat: 39.985, note: "Walled town on the Alagon, a border hold passed between rebels and emirs." },
  { id: "salamanca", name: "Salamanca", land: "merida", unlocked: false, lon: -5.664, lat: 40.965, note: "Old city on the Tormes ford, thinly held on the edge of the empty plains." },
  { id: "idanha", name: "Idanha", land: "merida", unlocked: false, lon: -7.146, lat: 39.93, note: "Old see of Egitania, its walls and springs kept by a shrunken flock." },
  { id: "badajoz-city", name: "Badajoz", land: "badajoz", unlocked: true, lon: -6.97, lat: 38.879, note: "New city of Ibn Marwan on the Guadiana, walled by leave of a defeated emir." },
  { id: "evora", name: "Evora", land: "badajoz", unlocked: false, lon: -7.909, lat: 38.571, note: "Yabura of the wide plains, drawn into the rebel lordship of the west." },
  { id: "merida-city", name: "Merida", land: "badajoz", unlocked: false, lon: -6.344, lat: 38.916, note: "Old Roman capital on the Guadiana, punished and half emptied for its risings." },
  { id: "juromenha", name: "Juromenha", land: "badajoz", unlocked: false, lon: -7.234, lat: 38.741, note: "River castle of Julumaniya, the old Marwanid refuge above the Guadiana." },
  { id: "ushbuna", name: "Ushbuna", land: "lisbon", unlocked: true, lon: -9.14, lat: 38.75, note: "Harbour city at the Tagus mouth, once burned by Northmen off the sea." },
  { id: "santarem", name: "Santarem", land: "lisbon", unlocked: false, lon: -8.685, lat: 39.236, note: "Shantarin on its cliff above the Tagus plain, granary of the lower river." },
  { id: "coimbra", name: "Coimbra", land: "lisbon", unlocked: false, lon: -8.428, lat: 40.209, note: "Mondego city of Mozarabs, lately passing between king and emir." },
  { id: "sintra", name: "Sintra", land: "lisbon", unlocked: false, lon: -9.388, lat: 38.799, labelDy: 16, note: "Castle on the wooded ridge above the western sea, cool and rich in orchards." },
  { id: "ossonoba", name: "Ossonoba", land: "algarve", unlocked: true, lon: -7.93, lat: 37.06, note: "Old see by the lagoons, now Shantamariyya of the Banu Harun." },
  { id: "silves", name: "Silves", land: "algarve", unlocked: false, lon: -8.438, lat: 37.191, note: "Chief town of the western Algarve, red walls above a quiet river port." },
  { id: "beja", name: "Beja", land: "algarve", unlocked: false, lon: -7.865, lat: 38.015, note: "Plains town of Roman walls, its lords leaning to the rebels of the west." },

  // The Guadalquivir and the south
  { id: "sevilla", name: "Sevilla", land: "seville", unlocked: true, lon: -5.99, lat: 37.389, labelDy: 16, note: "River city of the Banu Hajjaj, masters of the lower Guadalquivir." },
  { id: "carmona", name: "Carmona", land: "seville", unlocked: false, lon: -5.646, lat: 37.471, note: "Hill town above the plain road, a fortress older than the emirs." },
  { id: "niebla", name: "Niebla", land: "seville", unlocked: false, lon: -6.68, lat: 37.361, labelDy: 16, note: "Walled town on the Rio Tinto, market of the western districts." },
  { id: "huelva", name: "Huelva", land: "seville", unlocked: false, lon: -6.92, lat: 37.3, note: "Harbour between two river mouths, fishing and salt for the inland towns." },
  { id: "jerez", name: "Jerez", land: "seville", unlocked: false, lon: -6.137, lat: 36.681, note: "Town of vineyards toward the bay, raided once by Northmen ashore." },
  { id: "sidonia", name: "Sidonia", land: "seville", unlocked: false, lon: -5.928, lat: 36.457, note: "Shaduna of the southern hills, seat of an old district of the conquest." },
  { id: "cordoba-city", name: "Cordoba", land: "cordoba", unlocked: true, lon: -4.779, lat: 37.884, note: "Seat of the emirs on the Guadalquivir, the great bridge and the mosque at its gate." },
  { id: "jaen", name: "Jaen", land: "cordoba", unlocked: false, lon: -3.789, lat: 37.779, note: "Jayyan of the olive hills, tax house of the upper districts." },
  { id: "ubeda", name: "Ubeda", land: "cordoba", unlocked: false, lon: -3.37, lat: 38.013, note: "New town on the high ground over the Guadalquivir, work of the emirs." },
  { id: "andujar", name: "Andujar", land: "cordoba", unlocked: false, lon: -4.052, lat: 38.039, note: "River town where the east road crosses the Guadalquivir." },
  { id: "gafiq", name: "Gafiq", land: "cordoba", unlocked: false, lon: -5.166, lat: 38.575, note: "Castle of Gafiq on the road north, gate of the emir's city toward the marches." },
  { id: "cabra", name: "Cabra", land: "cordoba", unlocked: false, lon: -4.442, lat: 37.472, note: "Old see town under the sierra, fought over with the rebel of Bobastro." },
  { id: "priego", name: "Priego", land: "cordoba", unlocked: false, lon: -4.196, lat: 37.439, labelDy: 16, note: "Mountain town of springs and mills, lately sworn to the rebel side." },
  { id: "baena", name: "Baena", land: "cordoba", unlocked: false, lon: -4.322, lat: 37.617, note: "Walled hill town above the campina, loyal while the emir's army is near." },
  { id: "bobastro-city", name: "Bobastro", land: "bobastro", unlocked: true, lon: -4.804, lat: 36.911, note: "Rock fortress of Umar ibn Hafsun, unreachable master of the southern hills." },
  { id: "malaga", name: "Malaga", land: "bobastro", unlocked: false, lon: -4.44, lat: 36.74, note: "Sea town under the rebel hills, its harbour paying whoever holds the castles." },
  { id: "ilbira", name: "Ilbira", land: "elvira", unlocked: true, lon: -3.677, lat: 37.23, note: "Madinat Ilbira in its vega, torn between Arab lords and muwallad neighbours." },
  { id: "pechina", name: "Pechina", land: "elvira", unlocked: false, lon: -2.457, lat: 36.923, note: "Sailor republic of Bajjana, grown rich on the sea trade to the east." },
  { id: "guadix", name: "Guadix", land: "elvira", unlocked: false, lon: -3.137, lat: 37.301, note: "Wadi Ash on the high road east, between the vega and the desert hills." },
  { id: "baza", name: "Baza", land: "elvira", unlocked: false, lon: -2.772, lat: 37.489, note: "Old Basta under its dry sierra, market of the upland herders." },

  // The east
  { id: "murcia", name: "Murcia", land: "todmir", unlocked: true, lon: -1.13, lat: 37.986, labelDy: 16, note: "Young city of the emirs on the Segura, capital of Tudmir since the old towns fell." },
  { id: "lorca", name: "Lorca", land: "todmir", unlocked: false, lon: -1.702, lat: 37.672, note: "Lurqa of the frontier gardens, holding the dry road toward the west." },
  { id: "orihuela", name: "Orihuela", land: "todmir", unlocked: false, lon: -0.943, lat: 38.085, note: "Uryula of Theodemir's old pact, the first seat of the land of Tudmir." },
  { id: "alicante", name: "Alicante", land: "todmir", unlocked: false, lon: -0.52, lat: 38.36, note: "Laqant under its bare rock, a small harbour of the eastern shore." },
  { id: "balansiya", name: "Balansiya", land: "valencia", unlocked: true, lon: -0.42, lat: 39.48, note: "City among the watered gardens of the Turia, quiet since its Roman prime." },
  { id: "xativa", name: "Xativa", land: "valencia", unlocked: false, lon: -0.518, lat: 38.99, note: "Castle ridge above the southern huerta, key of the road to Tudmir." },
  { id: "sagunto", name: "Sagunto", land: "valencia", unlocked: false, lon: -0.3, lat: 39.68, note: "Murbatar under the great Roman castle, its stones older than any emir." },
  { id: "alpuente", name: "Alpuente", land: "valencia", unlocked: false, lon: -1.011, lat: 39.876, note: "Mountain town of al-Bunt, holding the dry hills toward the meseta." },
  { id: "palma", name: "Palma", land: "balearics", unlocked: true, lon: 2.66, lat: 39.62, note: "Old Roman town on the great bay, its people answering to no emir yet." },
  { id: "mago", name: "Mago", land: "balearics", unlocked: false, lon: 4.2, lat: 39.93, note: "Harbour of the eastern island, a haven for corsairs and traders alike." },
];

// Two provinces each hold two lands of 895, so each is cut once - the
// Daugava-split machinery from the Baltic bake, reused with hand-traced
// divides. Closing points run over ground the feature does not reach, so
// only the traced line matters.
//
// Huesca (ES241): the county of Aragon in the west, Sobrarbe-Ribagorza in
// the east. The line bends along the Gallego-Ara watershed and down the
// steppe, so the seam reads as ground rather than as a meridian.
// Verified: Jaca, Siresa and Huesca town fall west; Boltana, Alaon and
// Monzon fall east.
const HUESCA_DIVIDE = [
  [-0.1, 43.05], [0.05, 42.75], [-0.02, 42.55], [-0.12, 42.3],
  [-0.05, 42.05], [0.08, 41.75], [0.02, 41.45], [0.15, 41.25],
];
const HUESCA_CLOSING = [[-2.5, 41.25], [-2.5, 43.05]];
// Lleida (ES513): Pallars and Aran in the mountain northwest, Urgell over
// the rest. The mask ring runs above the Montsec and west of the Segre
// headwater valley; its west and north sides lie outside the province, so
// only the south and east seams are drawn. Verified: Tremp, Gerri and
// Vielha fall inside (pallars); La Seu, Organya and Balaguer fall outside.
const PALLARS_MASK = [
  [0.45, 42.08], [0.75, 42.02], [1.0, 42.1], [1.16, 42.06],
  [1.3, 42.18], [1.24, 42.42], [1.33, 42.62], [1.25, 43.0], [0.45, 43.0],
];

// A land's members are NUTS-3 units (`nuts`, with "#west"/"#east" and
// "#pallars"/"#rest" pseudo-members for the two cut provinces) plus whole
// countries from the CNTR file (`cntr` - Andorra, merged into Urgell so the
// map has no hole). Always read them through memberKeysOf.
const memberKeysOf = (land) =>
  new Set([...(land.nuts ?? []), ...(land.cntr ?? [])]);

// 24 lands. Provenance lives here only: every member is a whole NUTS-3 unit
// (or one bank of a cut), and the grouping of those units into 895 lands is
// a deliberate game abstraction - a whole modern province goes to whichever
// power's sphere covers most of it.
//
// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// relative sizes plausible for 895 (the Cordoban south heavy, the mountain
// north light), rounded to the nearest 5,000. Cohesion is political
// concentration - Bobastro's 20k under one rebel outweighs Toledo's mobs.
const LANDS = [
  {
    id: "galicia", name: "Galicia", faction: "galicians-of-iria",
    peoples: ["galicians"],
    nuts: ["ES111", "ES112", "ES113", "ES114", "PT111", "PT112", "PT119", "PT11A", "PT11C"],
    flavor:
      "Green river country of the far northwest, thick with monasteries " +
      "and the shrine of Santiago. Its counts answer to Oviedo when it " +
      "suits them.",
    places: ["Iria", "Lugo", "Ourense", "Tui", "Braga", "Compostela"],
    population: 45000, cohesion: "medium",
  },
  {
    id: "asturias", name: "Asturias", faction: "asturians",
    peoples: ["asturleonese"],
    nuts: ["ES120", "ES130"],
    flavor:
      "The mountain heart of the Christian kingdom, a wall of green hills " +
      "and high ridges between the sea and the meseta. Kings are made and " +
      "buried among these hills.",
    places: ["Oviedo", "Cangas", "Santillana", "Covadonga"],
    population: 25000, cohesion: "high",
  },
  {
    id: "leon", name: "Leon", faction: "leonese",
    peoples: ["asturleonese", "galicians"],
    nuts: ["ES413", "ES414", "ES416", "ES418", "ES419", "PT11B", "PT11D", "PT11E"],
    flavor:
      "The repeopled plains south of the mountains, running down to the " +
      "Douro, whose fords and boats carry the border trade. Grain, mules " +
      "and river tolls feed the young towns.",
    places: ["Leon", "Astorga", "Zamora", "Braganca"],
    population: 35000, cohesion: "medium",
  },
  {
    id: "alava", name: "Alava", faction: "alavese",
    peoples: ["basques"],
    nuts: ["ES211", "ES212", "ES213"],
    flavor:
      "Basque hill country above the upper Ebro, green valleys under wet " +
      "ridges where no army stays long. Its elders bow to Pamplona or " +
      "Oviedo as the year demands.",
    places: ["Armentia", "Sopuerta"],
    population: 20000, cohesion: "low",
  },
  {
    id: "castile", name: "Castile", faction: "castilians-of-burgos",
    peoples: ["castilians", "basques"],
    nuts: ["ES230", "ES412"],
    flavor:
      "The eastern march of the kingdom, a line of new castles from the " +
      "mountains toward the Ebro. Hard frontier ground that breeds hard " +
      "counts.",
    places: ["Burgos", "Amaya", "Najera"],
    population: 25000, cohesion: "medium",
  },
  {
    id: "pamplona", name: "Pamplona", faction: "pamplonese",
    peoples: ["basques", "muwallads"],
    nuts: ["ES220"],
    flavor:
      "The Basque kingdom in its mountain basin, keeping the western pass " +
      "of the Pyrenees. Kin to the Banu Qasi downriver, by marriage and by " +
      "need.",
    places: ["Pamplona", "Leire", "Tudela"],
    population: 25000, cohesion: "high",
  },
  {
    id: "aragon", name: "Aragon", faction: "aragonese",
    peoples: ["catalans", "basques"],
    nuts: ["ES241#west"],
    flavor:
      "A small county in the high valleys of the Aragon river, living from " +
      "passes, flocks and Frankish charters.",
    places: ["Jaca", "Siresa"],
    population: 10000, cohesion: "medium",
  },
  {
    id: "sobrarbe", name: "Sobrarbe", faction: "sobrarbians",
    peoples: ["catalans"],
    nuts: ["ES241#east"],
    flavor:
      "Steep hill country under the central Pyrenees, gorge villages and " +
      "old abbeys. Raiders from the plain climb no further than its first " +
      "ridges.",
    places: ["Boltana", "Alaon"],
    population: 10000, cohesion: "low",
  },
  {
    id: "pallars", name: "Pallars", faction: "pallaresans",
    peoples: ["catalans", "basques"],
    nuts: ["ES513#pallars"],
    flavor:
      "The highest of the Catalan counties, shepherd hills and salt " +
      "springs far up the Noguera valleys.",
    places: ["Tremp", "Gerri"],
    population: 10000, cohesion: "low",
  },
  {
    id: "urgell", name: "Urgell", faction: "urgellians",
    peoples: ["catalans"],
    nuts: ["ES513#rest"],
    cntr: ["AD"],
    flavor:
      "Mountain county around the see of Urgell, running down from " +
      "Andorra's valleys to the dry Segre plain and its Muslim border " +
      "forts.",
    places: ["La Seu", "Balaguer", "Andorra"],
    population: 15000, cohesion: "medium",
  },
  {
    id: "barcelona", name: "Barcelona", faction: "barcelonans",
    peoples: ["catalans"],
    nuts: ["ES511", "ES512", "ES514"],
    flavor:
      "The eastern march counties gathered in one house, from the mountain " +
      "passes to the walled city on the sea.",
    places: ["Barcelona", "Girona", "Vic", "Cardona"],
    population: 35000, cohesion: "medium",
  },
  {
    id: "upper-march", name: "Upper March", faction: "banu-qasi",
    peoples: ["muwallads", "basques"],
    nuts: ["ES242", "ES243", "ES417"],
    flavor:
      "The Ebro valley under the Banu Qasi, muwallad lords who deal with " +
      "Cordoba as equals. The river carries their grain, their tolls and " +
      "their wars.",
    places: ["Zaragoza", "Tarazona", "Calatayud", "Daroca", "Medinaceli"],
    population: 45000, cohesion: "high",
  },
  {
    id: "toledo", name: "Toledo", faction: "toledans",
    peoples: ["muwallads", "berbers"],
    nuts: ["ES300", "ES422", "ES423", "ES424", "ES425"],
    flavor:
      "The old Visigoth heartland around the city on the Tagus rock, " +
      "forever in revolt against Cordoba.",
    places: ["Toledo", "Mayrit", "Guadalajara", "Talavera", "Cuenca", "Ucles"],
    population: 55000, cohesion: "low",
  },
  {
    id: "merida", name: "Merida", faction: "meridans",
    peoples: ["berbers", "muwallads"],
    nuts: ["ES411", "ES415", "ES432", "PT16G", "PT16H", "PT16J"],
    flavor:
      "The lands of the old western capital on the Guadiana, broken by the " +
      "emirs and held together by Berber garrisons.",
    places: ["Coria", "Salamanca", "Idanha"],
    population: 30000, cohesion: "low",
  },
  {
    id: "badajoz", name: "Badajoz", faction: "banu-marwan",
    peoples: ["muwallads", "berbers"],
    nuts: ["ES431", "PT186", "PT187"],
    flavor:
      "The rebel lordship of Ibn Marwan on the Guadiana, a new city and " +
      "the river plains of the west. River boats and border tolls pay for " +
      "its walls.",
    places: ["Badajoz", "Evora", "Merida", "Juromenha"],
    population: 35000, cohesion: "high",
  },
  {
    id: "lisbon", name: "Lisbon", faction: "lisbonese",
    peoples: ["muwallads"],
    nuts: ["PT16B", "PT16D", "PT16E", "PT16F", "PT16I", "PT170", "PT185"],
    flavor:
      "The Atlantic coast of the muwallad west, from the Mondego down to " +
      "the harbour at the Tagus mouth. Northmen off the sea are an old " +
      "story here.",
    places: ["Ushbuna", "Santarem", "Coimbra", "Sintra"],
    population: 40000, cohesion: "medium",
  },
  {
    id: "algarve", name: "Algarve", faction: "algarvians",
    peoples: ["arabs", "muwallads"],
    nuts: ["PT150", "PT181", "PT184"],
    flavor:
      "The dry south coast and the plains behind it: fig orchards, " +
      "lagoons and small harbours under Arab lords.",
    places: ["Ossonoba", "Silves", "Beja"],
    population: 25000, cohesion: "medium",
  },
  {
    id: "seville", name: "Seville", faction: "sevillans",
    peoples: ["arabs", "muwallads"],
    nuts: ["ES612", "ES615", "ES618"],
    flavor:
      "The lower Guadalquivir under the Banu Hajjaj, Arab lords who rule " +
      "the richest river plain in Iberia. Ships work the river up to the " +
      "city bridge.",
    places: ["Sevilla", "Carmona", "Niebla", "Huelva", "Jerez", "Sidonia"],
    population: 60000, cohesion: "high",
  },
  {
    id: "cordoba", name: "Cordoba", faction: "umayyads",
    peoples: ["arabs", "muwallads"],
    nuts: ["ES613", "ES616"],
    flavor:
      "The emirate's shrunken core around the capital, still the greatest " +
      "city of the west even with rebels on every road.",
    places: ["Cordoba", "Jaen", "Ubeda", "Andujar", "Gafiq", "Cabra", "Priego", "Baena"],
    population: 80000, cohesion: "high",
  },
  {
    id: "bobastro", name: "Bobastro", faction: "hafsunids",
    peoples: ["muwallads", "berbers"],
    nuts: ["ES617"],
    flavor:
      "The southern mountain country of Umar ibn Hafsun, ridge forts and " +
      "hidden valleys in hills no emir's column has cleared.",
    places: ["Bobastro", "Malaga"],
    population: 20000, cohesion: "high",
  },
  {
    id: "elvira", name: "Elvira", faction: "elvirans",
    peoples: ["arabs", "muwallads"],
    nuts: ["ES611", "ES614"],
    flavor:
      "The vega and the dry east under Arab lords, torn by feud between " +
      "Arab and muwallad neighbours.",
    places: ["Ilbira", "Pechina", "Guadix", "Baza"],
    population: 35000, cohesion: "low",
  },
  {
    id: "todmir", name: "Todmir", faction: "todmirians",
    peoples: ["muwallads", "arabs"],
    nuts: ["ES421", "ES521", "ES620"],
    flavor:
      "The old pact-land of Theodemir on the Segura, gardens and dry hills " +
      "feuding around the young capital.",
    places: ["Murcia", "Lorca", "Orihuela", "Alicante"],
    population: 40000, cohesion: "low",
  },
  {
    id: "valencia", name: "Valencia", faction: "valencians",
    peoples: ["muwallads"],
    nuts: ["ES522", "ES523"],
    flavor:
      "The watered gardens of the eastern shore along the Turia and the " +
      "Jucar, rich, quiet and lightly held. River boats and sea traders " +
      "carry its fruit to every port.",
    places: ["Balansiya", "Xativa", "Sagunto", "Alpuente"],
    population: 40000, cohesion: "medium",
  },
  {
    id: "balearics", name: "Balearics", faction: "balearians",
    peoples: ["berbers"],
    nuts: ["ES531", "ES532", "ES533"],
    flavor:
      "The islands under Berber sea captains, harbours for corsairs and " +
      "traders between two coasts. No emir has yet landed to stay.",
    places: ["Palma", "Mago"],
    population: 10000, cohesion: "medium",
  },
];

// Label positions are hand-tuned lon/lat, projected below.
// kinds: people | neighbor | river | group
const LABELS = [
  // Group labels take over from the people labels at the zoom floor (the
  // inverse-visibility swap in map-detail.ts), so they name the same ground
  // at a coarser grain: two span the playable lands themselves, the rest
  // stand in the surrounding geography that opens up around them.
  { text: "THE CHRISTIAN NORTH", lon: -4.0, lat: 43.4, kind: "group" },
  { text: "AL-ANDALUS", lon: -4.5, lat: 37.4, kind: "group" },
  { text: "FRANCIA", lon: 2.5, lat: 45.5, kind: "group" },
  { text: "THE MAGHREB", lon: -4.0, lat: 32.8, kind: "group" },
  { text: "GALICIANS", lon: -7.9, lat: 42.55, kind: "people" },
  { text: "ASTURLEONESE", lon: -5.75, lat: 42.9, kind: "people" },
  { text: "BASQUES", lon: -2.1, lat: 42.95, kind: "people" },
  { text: "CASTILIANS", lon: -3.35, lat: 42.55, kind: "people" },
  { text: "CATALANS", lon: 1.3, lat: 41.7, kind: "people" },
  { text: "MUWALLADS", lon: -3.5, lat: 39.5, kind: "people" },
  { text: "ARABS", lon: -4.7, lat: 37.3, kind: "people" },
  { text: "BERBERS", lon: -6.1, lat: 39.6, kind: "people" },
  { text: "FRANCIA", lon: 0.8, lat: 43.55, kind: "neighbor" },
  { text: "MAGHREB", lon: -5.2, lat: 35.55, kind: "neighbor" },
  { text: "Douro", lon: -4.95, lat: 41.52, kind: "river" },
  { text: "Ebro", lon: -1.35, lat: 41.82, kind: "river" },
  { text: "Guadalquivir", lon: -5.3, lat: 37.62, kind: "river" },
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

const [nuts, countries, neRivers, neRiversEu] = await Promise.all([
  fetchJsonCached(NUTS_URL),
  fetchJsonCached(CNTR_URL),
  fetchJsonCached(NE_RIVERS_URL),
  fetchJsonCached(NE_RIVERS_EU_URL),
]);

// --- Assemble the member-feature pool: kept ES/PT NUTS-3 units (with the
// two divided provinces cut) plus Andorra. Every member gets a `key` that
// LANDS reference via `nuts` or `cntr`.
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
// rest. Closing points run over ground the feature does not reach, so only
// the traced line matters.
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

const isExcluded = (id) =>
  EXCLUDED_IDS.includes(id) || EXCLUDED_PREFIXES.some((p) => id.startsWith(p));

const memberFeatures = [];
let keptCount = 0;
for (const f of nuts.features) {
  const { CNTR_CODE, NUTS_ID } = f.properties;
  if (CNTR_CODE !== "ES" && CNTR_CODE !== "PT") continue;
  if (isExcluded(NUTS_ID)) continue;
  keptCount++;
  if (NUTS_ID === "ES241") {
    const [west, east] = splitByLine(f, NUTS_ID, HUESCA_DIVIDE, HUESCA_CLOSING);
    memberFeatures.push(
      { key: "ES241#west", geometry: west.geometry },
      { key: "ES241#east", geometry: east.geometry },
    );
  } else if (NUTS_ID === "ES513") {
    // The mask is already a closed box, so the "closing" is just the seam
    // back to the start.
    const [inside, rest] = splitByLine(f, NUTS_ID, PALLARS_MASK, []);
    memberFeatures.push(
      { key: "ES513#pallars", geometry: inside.geometry },
      { key: "ES513#rest", geometry: rest.geometry },
    );
  } else {
    memberFeatures.push({ key: NUTS_ID, geometry: f.geometry });
  }
}
if (keptCount !== EXPECTED_KEPT_NUTS) {
  throw new Error(
    `Kept ${keptCount} ES/PT NUTS-3 units - expected ${EXPECTED_KEPT_NUTS}; ` +
      `check the NUTS vintage or the exclusion list`,
  );
}
const andorra = countries.features.find((f) => f.properties.CNTR_ID === "AD");
if (!andorra) throw new Error("Andorra missing from the countries file");
memberFeatures.push({ key: "AD", geometry: andorra.geometry });

// Sanity: LANDS partition the member pool exactly. This is the loud failure
// the roster demands - a kept province assigned to no land, to two lands, or
// under a typo'd key stops the bake here.
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
const EXPECTED_TOTAL_POPULATION = 770000;

// Population-correlated settlement slots, same formula as the Baltic bake:
// one slot per ~10k people, clamped to 2..10. The floor is 2 because the
// first slot is the settlement standing at turn 1 and Found a settlement
// needs at least one site left to aim at.
const maxSettlementsFor = (population) =>
  Math.min(10, Math.max(2, Math.round(population / 10000)));

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
    land.population < 10000 ||
    land.population > 90000 ||
    land.population % 5000 !== 0
  ) {
    throw new Error(
      `Population for ${land.id} must be a multiple of 5000 in 10000..90000`,
    );
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
  // merge() dissolves only borders that dedupe into shared topology arcs.
  // Where a land mixes sources (NUTS against the CNTR Andorra), the two
  // files may draw the same border with different vertex spacing, so the
  // seam survives merge() and renders as a line through the land. A
  // single-argument union re-sweeps the rings and dissolves every
  // coincident internal edge; single-source lands pass through unchanged.
  const merged = merge(topo, members);
  const dissolved = rewind(polygonClipping.union(toMultiCoords(merged)));
  return {
    type: "Feature",
    properties: { land },
    geometry: { type: "MultiPolygon", coordinates: dissolved },
  };
});

// Guard against inverted ring winding: every land is a tiny fraction of
// the sphere. 0.05 sr is ~2,000,000 km^2 - far above any Iberian land.
for (const f of landFeatures) {
  const a = geoArea(f);
  if (a > 0.05) {
    throw new Error(
      `Suspicious geometry for ${f.properties.land.id}: geoArea ${a} - ` +
        `check ring winding of split/merged members`,
    );
  }
}

// --- Land adjacency from shared topology arcs. Two lands are adjacent iff
// some member of one and some member of the other trace the same arc. The
// Balearics share no land border with anyone, so their sea links are
// authored - the Saaremaa pattern.
const AUTHORED_LINKS = [
  ["balearics", "valencia"],
  ["balearics", "todmir"],
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

// Fallback for borders arc-sharing misses where two sources generalize the
// same line at different vertex densities (NUTS against the CNTR Andorra).
// Two lands are adjacent if they share at least MIN_SHARED_POINTS quantized
// vertices; a single shared point is not trusted, because a tripoint can
// coincidentally put one vertex in common without a real shared border.
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

// --- Settlement validation: unique id, a name, a known land, exactly one
// unlocked per land, authored count = the land's slot count, and the
// coordinates really fall inside the claimed land (curation guard).
const landById = new Map(LANDS.map((l) => [l.id, l]));
const landIdSet = new Set(landById.keys());
const seenIds = new Set();
const unlockedPerLand = new Map();
const lockedPerLand = new Map();
const authoredPerLand = new Map();
for (const s of SETTLEMENTS) {
  if (!landIdSet.has(s.land)) {
    throw new Error(`Settlement ${s.id} claims unknown land ${s.land}`);
  }
  if (seenIds.has(s.id)) throw new Error(`Duplicate settlement id ${s.id}`);
  seenIds.add(s.id);
  if (s.name.trim() === "") throw new Error(`Settlement ${s.id} has no name`);
  // The land's own place list is the only prose that names its sites, so it
  // may hold rivers and districts that are not settlements, but it may not
  // omit a settlement the map draws inside that land.
  if (!landById.get(s.land).places.includes(s.name)) {
    throw new Error(
      `Settlement ${s.name} is missing from the places of land ${s.land}`,
    );
  }
  authoredPerLand.set(s.land, (authoredPerLand.get(s.land) ?? 0) + 1);
  const per = s.unlocked ? unlockedPerLand : lockedPerLand;
  per.set(s.land, (per.get(s.land) ?? 0) + 1);
}
// Every stray coordinate at once, not the first - placing a settlement is
// iterative and one throw per run turns authoring into a round trip per row.
const strays = [];
for (const s of SETTLEMENTS) {
  if (!geoContains(landFeatureById.get(s.land), [s.lon, s.lat])) {
    strays.push(`  ${s.id} at ${s.lon},${s.lat} is not inside ${s.land}`);
  }
}
if (strays.length > 0) {
  throw new Error(`Settlements outside their land:\n${strays.join("\n")}`);
}
for (const land of LANDS) {
  const slots = maxSettlementsFor(land.population);
  if ((unlockedPerLand.get(land.id) ?? 0) !== 1) {
    throw new Error(`Land ${land.id} must have exactly one unlocked settlement`);
  }
  const authored = authoredPerLand.get(land.id) ?? 0;
  if (authored !== slots) {
    throw new Error(
      `Land ${land.id} has ${authored} authored settlements, expected ${slots}`,
    );
  }
  const locked = lockedPerLand.get(land.id) ?? 0;
  if (locked !== slots - 1) {
    throw new Error(
      `Land ${land.id} has ${locked} locked next sites, expected ${slots - 1}`,
    );
  }
}

// Neighbors are the grey context beyond the playable lands. Nothing playable
// is carved out of any of them, so each passes through whole; the
// projection's clip extent trims them.
const neighborFeatures = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);
if (neighborFeatures.length !== NEIGHBORS.length) {
  throw new Error(
    `Expected ${NEIGHBORS.length} neighbor features, found ` +
      `${neighborFeatures.length} - check NEIGHBORS against the CNTR file`,
  );
}

// Same framing as the Baltic bake: fit to the union of the lands.
const projection = geoAzimuthalEqualArea()
  .rotate([4, -40])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: landFeatures },
  );
// Geometry is baked well past the canvas: the painted rect (canvas plus this
// margin) IS the pan and zoom bound now, not a guess at a viewport shape, so
// whatever is baked here is exactly what a player can ever pan or zoom to
// reach - nothing past the margin is ever asked to render, and nothing this
// side of it is ever left unpainted. A neighbor clipped short of the margin
// shows as a straight cut through land with bare sea beyond it, which is the
// thing the margin exists to prevent. Lands, settlements and people/neighbor
// labels stay inside the canvas; group labels alone may sit out in that
// margin, over the surrounding geography it now bakes.
const CLIP_MARGIN = 2000;
projection.clipExtent([
  [-CLIP_MARGIN, -CLIP_MARGIN],
  [WIDTH + CLIP_MARGIN, HEIGHT + CLIP_MARGIN],
]);
const path = geoPath(projection).digits(1);

// Sub-pixel land fragments render as stroke dots and dashes - pinch-offs and
// lens-shaped holes left by the seam dissolve, plus speck islets the source
// carries. The cut keeps every real feature (the smallest Balearic islet
// kept is well above a pixel) and logs every drop so a real loss cannot pass
// silently.
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
// name into one MultiLineString per river; geoPath's clipExtent trims them.
function riverFeatureNames(f) {
  const p = f.properties ?? {};
  // Primary name only (name_en as fallback when name is absent) - never
  // name_alt, which can carry an entirely different river's name and would
  // pull a feature into two whitelist entries at once.
  const primary = typeof p.name === "string" && p.name.length > 0 ? p.name : p.name_en;
  return typeof primary === "string"
    ? primary
        .split(/[/,()]/)
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

const settlements = SETTLEMENTS.map((s) => {
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

// --- Dots and labels must not collide, in pixels ---------------------------
// Same geometry as map-render.ts: dots at r=3.5 (so 7 px centres exactly
// touch), labels centred at (x, y + labelDy ?? -7) in 12px type. Runs over
// locked sites too: any of them can be revealed mid-game.
const MIN_SETTLEMENT_GAP_PX = 7;
const LABEL_CHAR_W = 7.2;
const LABEL_PAD_PX = 2;
const labelBox = (s) => {
  const w = s.name.length * LABEL_CHAR_W;
  const y = s.y + (s.labelDy ?? -7);
  return { x0: s.x - w / 2, x1: s.x + w / 2, y0: y - 9, y1: y + 3 };
};
const collisions = [];
for (let i = 0; i < settlements.length; i++) {
  for (let j = i + 1; j < settlements.length; j++) {
    const a = settlements[i], b = settlements[j];
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    if (gap < MIN_SETTLEMENT_GAP_PX) {
      collisions.push(
        `  dots ${a.id} and ${b.id} are ${gap.toFixed(1)} px apart - they ` +
          `merge into one blob. Move one, or drop the site.`,
      );
    }
    const ba = labelBox(a), bb = labelBox(b);
    const overlaps =
      ba.x0 - LABEL_PAD_PX < bb.x1 && bb.x0 - LABEL_PAD_PX < ba.x1 &&
      ba.y0 - LABEL_PAD_PX < bb.y1 && bb.y0 - LABEL_PAD_PX < ba.y1;
    if (overlaps) {
      collisions.push(
        `  labels ${a.name} and ${b.name} overlap - give one a labelDy to ` +
          `drop it below its dot.`,
      );
    }
  }
}
if (collisions.length > 0) {
  throw new Error(`Settlements collide:\n${collisions.join("\n")}`);
}

const labels = LABELS.flatMap((l) => {
  const projected = projection([l.lon, l.lat]);
  if (l.kind === "group") {
    // A group label names ground out in the surrounding geography by
    // design - the painted rect is its bound, not the canvas.
    const inPaintedRect =
      projected &&
      projected[0] > -CLIP_MARGIN && projected[0] < WIDTH + CLIP_MARGIN &&
      projected[1] > -CLIP_MARGIN && projected[1] < HEIGHT + CLIP_MARGIN;
    if (!inPaintedRect) throw new Error(`Group label outside painted rect: ${l.text}`);
    return [{
      text: l.text,
      x: Math.round(projected[0]),
      y: Math.round(projected[1]),
      kind: l.kind,
    }];
  }
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

// Neighbour geometry gets its own, much tighter clip. `CLIP_MARGIN` above is
// the painted rect - what `MapData.margin` reports and what the pan/zoom
// bound in src/view.ts reads - and it has to reach far past the frame so a
// neighbour's own border never shows a straight cut with bare sea beyond it.
// But everything past the frame is hidden behind an opaque surround
// (`FRAME_RING` in src/view.ts, drawn in map-render.ts), so a neighbour's
// path stretching out to the full painted margin was mostly bytes nobody
// could ever see. NEIGHBOR_CLIP_RING outsets the canvas by 45% of its own
// width and height instead - comfortably past VISIBLE_RING (0.3) and
// FRAME_RING (0.35), with headroom for a coastline that runs at an angle
// through the clip box - and nothing else changes: the sea rect and `margin`
// still use CLIP_MARGIN. Same value and reasoning as the Baltic bake.
const NEIGHBOR_CLIP_RING = 0.45;
const paintedClip = projection.clipExtent();
projection.clipExtent([
  [-WIDTH * NEIGHBOR_CLIP_RING, -HEIGHT * NEIGHBOR_CLIP_RING],
  [WIDTH * (1 + NEIGHBOR_CLIP_RING), HEIGHT * (1 + NEIGHBOR_CLIP_RING)],
]);
const neighborPath = geoPath(projection).digits(1);
const neighborsOut = neighborFeatures
  .map((f) => ({ id: f.properties.CNTR_ID, path: neighborPath(f) }))
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
  .sort((a, b) => a.id.localeCompare(b.id));
// Restore the painted-rect clip: `path` below still draws regions with it.
projection.clipExtent(paintedClip);

const data = {
  width: WIDTH,
  height: HEIGHT,
  margin: CLIP_MARGIN,
  attribution:
    "(c) EuroGeographics for the administrative boundaries; " +
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
  neighbors: neighborsOut,
  rivers,
  settlements,
  labels,
};

for (const r of data.regions) {
  if (!r.path) throw new Error(`Empty path for region ${r.id}`);
}

// --- Graph sanity check against the Baltic map ------------------------------
// The printed numbers are the review gate the spec asks for: no 0-degree
// land, a Baltic-like degree spread, and no microscopic land on canvas.
function pathAreaPx2(d) {
  // geoPath with digits(1) emits only M/L/Z. Signed shoelace per ring, then
  // the absolute sum, so holes subtract regardless of winding.
  let total = 0;
  for (const ring of d.split("Z")) {
    const pts = ring
      .split(/[ML]/)
      .filter((t) => t.length)
      .map((t) => t.split(",").map(Number));
    if (pts.length < 3) continue;
    let signed = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      signed += x1 * y2 - x2 * y1;
    }
    total += signed / 2;
  }
  return Math.abs(total);
}
function graphStats(regions) {
  const degrees = regions.map((r) => r.adjacent.length);
  const areas = regions.map((r) => pathAreaPx2(r.path));
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    lands: regions.length,
    minDeg: Math.min(...degrees),
    maxDeg: Math.max(...degrees),
    meanDeg: (sum(degrees) / degrees.length).toFixed(1),
    minArea: Math.round(Math.min(...areas)),
    meanArea: Math.round(sum(areas) / areas.length),
    maxArea: Math.round(Math.max(...areas)),
  };
}
const baltic = JSON.parse(readFileSync("src/data/baltic.json", "utf8"));
console.log("Degrees:", data.regions
  .map((r) => `${r.id}=${r.adjacent.length}`).join(" "));
for (const [name, stats] of [
  ["iberia", graphStats(data.regions)],
  ["baltic", graphStats(baltic.regions)],
]) {
  console.log(
    `${name}: ${stats.lands} lands, degree ${stats.minDeg}..${stats.maxDeg} ` +
      `(mean ${stats.meanDeg}), area px2 min ${stats.minArea} / mean ` +
      `${stats.meanArea} / max ${stats.maxArea}`,
  );
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/iberia.json", JSON.stringify(data));
console.log(
  `Wrote src/data/iberia.json: ${data.regions.length} lands, ` +
    `${data.factions.length} factions, ${data.peoples.length} peoples, ` +
    `${data.neighbors.length} neighbors, ${data.rivers.length} rivers, ` +
    `${data.settlements.length} settlements, ${data.labels.length} labels`,
);
