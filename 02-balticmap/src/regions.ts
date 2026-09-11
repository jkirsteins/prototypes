import type { MapData } from "./types";
import balticMap from "./data/baltic.json";
import balticRulerNames from "./data/ruler-names.json";
import iberiaMap from "./data/iberia.json";
import iberiaRulerNames from "./data/ruler-names-iberia.json";

export type RegionId = "baltic" | "iberia";

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
  /** The realms that already stand when this map opens. Absent for a region
   *  whose every land answers to itself. */
  startingRealms?: StartingRealms;
  /** The power beyond the frame that the run's last act is fought against.
   *
   *  Every region authors one. A run whose last fight was a neighbour like any
   *  other would end where every other act ends, and the whole point of the
   *  third one is that it is somewhere else. */
  foreignPower: ForeignPowerDef;
}

/** A power that does not stand on the map: the fight the last act is for.
 *
 *  It is AUTHORED, the way `terrainEligibility` and `bureaucracyLands` are,
 *  and for the same reason - there is no rim concept in the code, and this is
 *  not the change that should invent one. Which lands face outward is a fact
 *  about the region's geography that the region's own file is the right place
 *  to state.
 *
 *  It borrows its polygon from the map's baked NEIGHBOURS - the grey country
 *  silhouettes already drawn around the playable lands - rather than carrying
 *  geometry of its own. The ground is already there and already in the right
 *  place; what was missing was anything in the game that knew it existed. */
export interface ForeignPowerDef {
  /** The faction id it takes when summoned. Prefixed, so it cannot collide
   *  with a land id and so a reader of a log line can tell at a glance that
   *  this one is not on the map. */
  id: string;
  name: string;
  /** Which `MapData.neighbors` path it is drawn as. */
  neighbor: string;
  /** Polygon fill, deliberately outside every people's hue family: it belongs
   *  to no ethnicity on the map. */
  color: string;
  /** Its defense ceiling. Far above any single land's - the map's biggest is
   *  18 - because a realm that has taken half the map is what comes for it. */
  defenseMax: number;
  /** The lands it borders: the only ground an expedition may set out from,
   *  and the only lands its own raids reach. Authored rather than derived,
   *  per the note above. */
  landings: readonly string[];
  /** Two or three sentences, shown when it is summoned. Must not contain any
   *  card or faction name - the rich-text segment rule, and there is no
   *  renderer for one here. */
  blurb: string;
}

/** Both keyed by the HELD land's faction id -> the holder's, matching the
 *  `Overlords` and `Incorporated` stores they seed. `vassals` is a land with
 *  its own lord who owes fealty; `incorporated` is direct rule with no
 *  separate lord left to owe it. */
export interface StartingRealms {
  vassals: Readonly<Record<string, string>>;
  incorporated: Readonly<Record<string, string>>;
}

const balticPools = balticRulerNames as Record<string, readonly string[]>;
const iberiaPools = iberiaRulerNames as Record<string, readonly string[]>;

/** Which lands could plausibly carry which ground, read off what the map
 *  already says about each region in its own flavour text: hills and uplands
 *  for `hill-country`, the trade rivers for `river-trade`. Random placement
 *  that ignored this put hills on the Semigallian plain, which the map calls
 *  flat and fertile two lines away.
 *
 *  A land absent from the table gets no terrain status, which is the honest
 *  answer for the plains and the islands. */
const BALTIC_TERRAIN_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  // Highlands, uplands and wooded hills.
  "eastern-aukstaitian-confederacy": ["hill-country"],
  "sakalans": ["hill-country"],
  "selonians": ["hill-country"],
  "ugandians": ["hill-country"],
  "samogitian-confederacy": ["hill-country"],
  // The trade rivers: the Daugava, the Gauja, the Nemunas, the Lielupe, the
  // Vistula.
  "jersikans": ["river-trade"],
  "lower-daugava-livs": ["river-trade"],
  "talavians": ["river-trade"],
  "lietuva": ["river-trade"],
  "dainavians": ["river-trade"],
  "nadruvians": ["river-trade"],
  "semigallian-confederacy": ["river-trade"],
  "pomesanians": ["river-trade"],
};

/** The three largest baked populations - the two Lithuanian confederacies and
 *  Lietuva itself. Named rather than rolled: it is a fact about how big these
 *  three are, so a run where they muster freely is not a different map but
 *  the same imbalance back. At the map's own divisor the largest of the three
 *  would otherwise field six armies to a small land's one - enough standing
 *  force to raid every neighbour every round and still hold; the burden
 *  leaves them the strongest lands in the game (four, three and three)
 *  without letting one polygon out-muster a realm. */
const BALTIC_BUREAUCRACY_LANDS: readonly string[] = [
  "eastern-aukstaitian-confederacy", "samogitian-confederacy", "lietuva",
];

/** The same two rules read off the Iberian map's own flavour text: hills for
 *  the mountain north and the rebel sierras, the trade rivers - Douro, Ebro,
 *  Guadiana, Guadalquivir, Turia - for the valley lands. */
const IBERIA_TERRAIN_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  // The Cantabrian wall, the Basque hills, the Pyrenean counties and the
  // sierras of Bobastro.
  "asturians": ["hill-country"],
  "alavese": ["hill-country"],
  "sobrarbians": ["hill-country"],
  "pallaresans": ["hill-country"],
  "hafsunids": ["hill-country"],
  // The river-valley lords: the Ebro, the Guadalquivir, the Turia, the
  // Douro and the Guadiana.
  "banu-qasi": ["river-trade"],
  "sevillans": ["river-trade"],
  "valencians": ["river-trade"],
  "leonese": ["river-trade"],
  "banu-marwan": ["river-trade"],
};

/** The three largest baked populations - the emirate's core and the two
 *  great rebel cities. Named rather than rolled, same as the Baltic three. */
const IBERIA_BUREAUCRACY_LANDS: readonly string[] = [
  "umayyads", "sevillans", "toledans",
];

/** The peninsula was not twenty-four lands each answering to itself. In 890
 *  Alfonso III ruled Galicia, Leon, Castile and Alava from Oviedo, Wifred the
 *  Hairy held Urgell alongside Barcelona, and Badajoz had swallowed Merida -
 *  while it was the EMIRATE that had come apart, which is the asymmetry this
 *  table exists to put on the map.
 *
 *  Nine of the twenty-four start held. What a seeded land is, is a land taken
 *  mid-game: `newGame` gives it an entry here and nothing else, so it carries
 *  no quiet passives, raids nobody, and - having no ruler - never takes a
 *  turn. That is `takeLand`'s own leavings, which is why this needed no rule.
 *
 *  The ten left free are free on the evidence, not for room to fight in.
 *  Todmir ran itself under the Banu Khattab, Valencia under local lords, the
 *  Balearics were not Umayyad until Isam al-Khawlani landed in 902, the
 *  Algarve had Bakr ibn Yahya at Ocsonoba, Seville had been in open revolt
 *  under Ibrahim ibn Hajjaj since 889, Toledo was in permanent revolt,
 *  Bobastro was Ibn Hafsun at his height, Pallars was Ramon I's separate
 *  house and Sobrarbe owed its fealty off this map. The Banu Qasi get no
 *  vassals either: Muhammad ibn Lubb overshadowed Fortun Garces of Pamplona,
 *  but that was kinship and influence, which is what the Pamplona flavour
 *  line already says and is not the same thing as a lord. */
const IBERIA_STARTING_REALMS: StartingRealms = {
  vassals: {
    // Counties of the Asturian kingdom, each with a count of its own: Galicia
    // restive enough that the map's own line says it answers to Oviedo when it
    // suits, Castile a frontier county whose Burgos was founded in 884, Alava
    // Asturian under Vela Jimenez.
    "galicians-of-iria": "asturians",
    "castilians-of-burgos": "asturians",
    "alavese": "asturians",
    // The muwallad Atlantic west, in the orbit of Ibn Marwan al-Jilliqi's
    // house at Badajoz.
    "lisbonese": "banu-marwan",
    // Galindo Aznarez II's county, bound to Pamplona by marriage and merged
    // into it outright by 922.
    "aragonese": "pamplonese",
    // Sa'id ibn Judi's Arabs fought Ibn Hafsun as Cordoba's party while
    // running their own war - loyal, and nobody's subject.
    "elvirans": "umayyads",
  },
  incorporated: {
    // Repeopled from Oviedo in 856 and royal ground since: no count-dynasty of
    // its own at this date to owe anything.
    "leonese": "asturians",
    // Merida was broken by the emirs; Badajoz, founded 875, is the same
    // family's seat in its place.
    "meridans": "banu-marwan",
    // Wifred held Urgell and Cerdanya himself from 870, Barcelona from 878.
    "urgellians": "barcelonans",
  },
};

/** The Rus' beyond the Daugava and the eastern forests. Its landings are the
 *  lands that actually faced east in 1100: Jersika on the Daugava trade road
 *  to Polotsk, Ugandi and Virumaa against Pskov and Novgorod, and the
 *  Sudovian and Dainavian bands whose own flavour line on this map already
 *  says they "raid into Rus' and Mazovia and are raided in turn". */
const BALTIC_FOREIGN: ForeignPowerDef = {
  id: "foreign-rus",
  name: "Lands of Rus'",
  neighbor: "RU",
  color: "#6b5b7b",
  defenseMax: 40,
  landings: [
    "vironians", "ugandians", "jersikans", "selonians",
    "eastern-aukstaitian-confederacy", "dainavians", "sudovians",
  ],
  blurb:
    "Beyond the eastern forests the princes have stopped quarrelling among " +
    "themselves and started counting your lands. Their levies gather where " +
    "the trade roads come out of the woods. This one does not wait to be " +
    "attacked, and it cannot be reached without leaving the map behind.",
};

/** The Maghreb across the strait. Its landings are the southern coast and the
 *  islands: the Algarve, the Guadalquivir mouth, the sierras of Bobastro and
 *  Elvira above Malaga, and the Balearics, which were not Umayyad until Isam
 *  al-Khawlani sailed for them in 902. */
const IBERIA_FOREIGN: ForeignPowerDef = {
  id: "foreign-maghreb",
  name: "The Maghreb",
  neighbor: "MA",
  color: "#7b6b4b",
  defenseMax: 40,
  landings: [
    "algarvians", "sevillans", "hafsunids", "elvirans", "balearians",
  ],
  blurb:
    "Across the strait the Berber emirs have watched the peninsula come " +
    "apart and put together again, and they have drawn their own conclusion. " +
    "Their ships are at Ceuta. This one does not wait to be attacked, and it " +
    "cannot be reached without leaving the map behind.",
};

export const DEFAULT_REGION: RegionId = "baltic";

export const REGIONS: Record<RegionId, RegionDef> = {
  baltic: {
    id: "baltic",
    name: "Baltic lands",
    era: "Eastern Baltic, c. 1100",
    blurb:
      "Chiefdoms and confederacies of the eastern Baltic on the eve of the " +
      "crusades. Dense forest, river trade and no king anywhere: every land " +
      "answers to its own hillfort, and the strongest realm on the map is " +
      "whoever three neighbours fear at once.",
    map: balticMap as MapData,
    rulerNames: balticPools,
    terrainEligibility: BALTIC_TERRAIN_ELIGIBILITY,
    bureaucracyLands: BALTIC_BUREAUCRACY_LANDS,
    foreignPower: BALTIC_FOREIGN,
  },
  iberia: {
    id: "iberia",
    name: "Iberia",
    era: "Iberian Peninsula, c. 895",
    blurb:
      "The emirate has come apart in rebel marches and mountain kingdoms. " +
      "Muwallad lords hold the river valleys against Cordoba, whose writ now " +
      "ends a few days' ride from the capital, while in the north Oviedo has " +
      "gathered four lands under one crown. The fitna is a good time to be " +
      "ambitious.",
    map: iberiaMap as MapData,
    rulerNames: iberiaPools,
    terrainEligibility: IBERIA_TERRAIN_ELIGIBILITY,
    bureaucracyLands: IBERIA_BUREAUCRACY_LANDS,
    startingRealms: IBERIA_STARTING_REALMS,
    foreignPower: IBERIA_FOREIGN,
  },
};

// The one mutable cell in this module: which region the running process is
// playing. A singleton rather than a threaded parameter because rulers.ts
// and passives.ts are called from deep inside game.ts with signatures the
// wire protocol depends on - and every existing test and sim.ts read the
// baltic map without calling anything, which the default preserves.
let active: RegionId = DEFAULT_REGION;

/** Set exactly once at boot (main.ts), before any deal; tests may set it. */
export function setActiveRegion(id: RegionId): void {
  active = id;
}

export function activeRegion(): RegionDef {
  return REGIONS[active];
}

/** One fingerprint per region, computed once. The map JSON is the expensive
 *  part to hash and never changes at runtime, so a second call for the same
 *  region answers from the cache rather than re-stringifying it. */
const fingerprintCache = new Map<RegionId, string>();

/** What two screens must agree on before sharing a lobby: which region, that
 *  their baked maps are byte-identical, and that the realms already standing
 *  on them are the same realms. FNV-1a over all three, cached per region - the
 *  hello sends it, both ends compare.
 *
 *  The seeded realms are in here because the pick screen is drawn from each
 *  screen's OWN `newGame`, before the host deals and the state starts
 *  replicating. Two builds disagreeing about who holds Leon would show their
 *  two players different maps to choose from, which is the whole class of
 *  thing this refuses a lobby over. */
export function regionFingerprint(): string {
  const region = activeRegion();
  const cached = fingerprintCache.get(region.id);
  if (cached !== undefined) return cached;
  const realms = JSON.stringify(region.startingRealms ?? null);
  // The foreign power is in the fingerprint because it is a fact about what
  // this map's run IS - two builds that disagree about which power the last
  // act is fought against, where it lands, or how much it holds would deal
  // the same board and then play two different games on it.
  const power = JSON.stringify(region.foreignPower);
  const text =
    `${region.id}:${realms}:${power}:${JSON.stringify(region.map)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const fingerprint = `${region.id}@${h.toString(16)}`;
  fingerprintCache.set(region.id, fingerprint);
  return fingerprint;
}
