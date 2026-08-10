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

/** The lands that carry it from the first turn. Named rather than rolled: it
 *  is a fact about how big these three are, so a run where they muster freely
 *  is not a different map but the same imbalance back. */
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
  },
  iberia: {
    id: "iberia",
    name: "Iberia",
    era: "Iberian Peninsula, c. 895",
    blurb:
      "The emirate has come apart in rebel marches and mountain kingdoms. " +
      "Muwallad lords hold the river valleys against Cordoba, Asturias " +
      "raids south past the Douro, and every count and wali on the map " +
      "answers to himself. The fitna is a good time to be ambitious.",
    map: iberiaMap as MapData,
    rulerNames: iberiaPools,
    terrainEligibility: IBERIA_TERRAIN_ELIGIBILITY,
    bureaucracyLands: IBERIA_BUREAUCRACY_LANDS,
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

/** What two screens must agree on before sharing a lobby: which region, and
 *  that their baked maps are byte-identical. FNV-1a over the id and the
 *  map JSON, cached per region - the hello sends it, both ends compare. */
export function regionFingerprint(): string {
  const region = activeRegion();
  const cached = fingerprintCache.get(region.id);
  if (cached !== undefined) return cached;
  const text = `${region.id}:${JSON.stringify(region.map)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const fingerprint = `${region.id}@${h.toString(16)}`;
  fingerprintCache.set(region.id, fingerprint);
  return fingerprint;
}
