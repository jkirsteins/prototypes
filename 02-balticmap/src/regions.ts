import type { MapData } from "./types";
import balticMap from "./data/baltic.json";
import balticRulerNames from "./data/ruler-names.json";
import { BUREAUCRACY_LANDS, TERRAIN_ELIGIBILITY } from "./passives";

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

// The "generic" pool is a fallback for a people with no pool of its own, not
// a people in the map - keeping it out of rulerNames means every key here
// really does answer to a people the map defines, which is what the
// self-consistency test checks.
const { generic: _generic, ...balticPools } = balticRulerNames as
  Record<string, string[]>;

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
    terrainEligibility: TERRAIN_ELIGIBILITY,
    bureaucracyLands: BUREAUCRACY_LANDS,
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
