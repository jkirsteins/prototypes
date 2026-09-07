/**
 * Every animal in the north, in one place: where it lives, how far its
 * range reaches, when it is here, what taking one costs and yields, and
 * what it sounds like. Regions, hunting, fishing, skills, the panels and
 * the sound all read this and name no species of their own.
 *
 * Key order is load-bearing: a species' position seeds its range noise, so
 * reordering the catalogue redraws every range. Append new species.
 */
import { disabled } from "./probe";
import type { SpotId, Terrain } from "./types";

export type Habitat = Exclude<Terrain, "water"> | "lake" | "sea";
export type SpeciesClass = "mammal" | "bird" | "fish";
export type WaterKind = "lake" | "sea";

export type SeasonRule =
  | { kind: "resident"; /** capacity factor December to February */ winter?: number }
  /** Present from the arrive month to the month before leave, 0-based; absent otherwise. away is how the absence reads: gone south, or denned. */
  | { kind: "migrant"; arrive: number; leave: number; away?: "gone" | "denned" };

export interface Call {
  /** Slot in the audio manifest. */
  sound: string;
  when: "day" | "night" | "dawn" | "dusk" | "any";
  /** 0-based inclusive month range; absent means all year. An end below the start wraps the year: [11, 1] is December to February. */
  months?: [number, number];
  /** Relative frequency among a region's open calls. */
  weight: number;
}

export interface SpeciesDef {
  name: string;
  kind: SpeciesClass;
  /** Individuals per km2 of each habitat at full occupancy. Absent means none. */
  habitat: Partial<Record<Habitat, number>>;
  /** Habitats at least one of which the region must have some of; capacity scales with their share up to a quarter. */
  needs?: Habitat[];
  /** Share of suitable regions the species occupies, 0..1. */
  range: number;
  season: SeasonRule;
  /** Daily logistic growth rate for residents. */
  growth: number;
  /** Absent for voice-only species. */
  hunt?: {
    spot: SpotId;
    minutes: number;
    odds: number;
    injury: number;
    /** Recommended Hunting or Fishing level; absent means none. */
    level?: number;
    /** Odds factor at night; 0.7 when absent. */
    night?: number;
  };
  yields?: { meatKg: number; hideKg?: number; furKg?: number; fatKg?: number; bone?: number; sinew?: number };
  calls?: Call[];
  /** Where this fish lies off a shore, as the read names it. */
  lie?: string;
  /** The oily class: 1,500 kcal/kg, a 0.4 lean share, defined once in FOODS. */
  oily?: true;
  /** Spawning months, 0-based inclusive; a catch inside yields roe. */
  spawn?: [number, number];
}

const resident = (winter?: number): SeasonRule => (winter === undefined ? { kind: "resident" } : { kind: "resident", winter });
const migrant = (arrive: number, leave: number, away?: "denned"): SeasonRule => (away ? { kind: "migrant", arrive, leave, away } : { kind: "migrant", arrive, leave });

/**
 * Fish per square kilometre of water from a standing biomass in kg per
 * hectare and the mean weight of one fish. A boreal lake carries perch at
 * 10 to 50 kg/ha and pike at 10 to 20; the numbers below sit inside those
 * ranges, so a region's lake holds tens of thousands of perch and a
 * survivor's take never moves its density. A pond is still fishable down.
 */
export function perKm2(kgPerHa: number, kgEach: number): number {
  return Math.round((kgPerHa * 100) / kgEach);
}

const fish = (name: string, lake: number | null, sea: number | null, range: number, odds: number, meatKg: number, extra: Partial<SpeciesDef> & { level?: number; night?: number; lie?: string } = {}): SpeciesDef => ({
  name, kind: "fish",
  habitat: { ...(lake !== null ? { lake } : {}), ...(sea !== null ? { sea } : {}) },
  range, season: extra.season ?? resident(), growth: 0.003,
  hunt: { spot: "shore", minutes: 60, odds, injury: 0, ...(extra.level !== undefined ? { level: extra.level } : {}), ...(extra.night !== undefined ? { night: extra.night } : {}) },
  yields: { meatKg },
  ...(extra.needs ? { needs: extra.needs } : {}),
  ...(extra.lie ? { lie: extra.lie } : {}),
  ...(extra.oily ? { oily: extra.oily } : {}),
  ...(extra.spawn ? { spawn: extra.spawn } : {}),
});

const SPECIES_DEFS_RAW = {
  // Mammals. Fur-bearers yield fur; deer and bigger yield hide.
  // fatKg is peak autumn fat, before fatSeason scales it down through the year (fat and carbohydrate design, section 2).
  hare: { name: "mountain hare", kind: "mammal", habitat: { meadow: 20, birch: 16, bog: 8, pine: 4, fell: 3 }, range: 1.0, season: resident(), growth: 0.006,
    hunt: { spot: "heath", minutes: 90, odds: 0.6, injury: 0, night: 0.9 }, yields: { meatKg: 1.2, furKg: 0.2, bone: 1 } },
  squirrel: { name: "red squirrel", kind: "mammal", habitat: { spruce: 12, pine: 10, birch: 4 }, range: 0.9, season: resident(), growth: 0.006,
    hunt: { spot: "forest", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.2, furKg: 0.1 },
    calls: [{ sound: "squirrel", when: "day", weight: 1 }] },
  fox: { name: "red fox", kind: "mammal", habitat: { meadow: 1.5, birch: 1.2, pine: 1, spruce: 1, bog: 0.8, rock: 0.5, fell: 0.3 }, range: 0.95, season: resident(), growth: 0.002,
    hunt: { spot: "heath", minutes: 150, odds: 0.3, injury: 0, level: 3 }, yields: { meatKg: 3, furKg: 1, bone: 2, sinew: 1 },
    calls: [{ sound: "fox", when: "night", months: [11, 1], weight: 2 }] },
  beaver: { name: "beaver", kind: "mammal", habitat: { lake: 4 }, needs: ["birch", "meadow"], range: 0.5, season: resident(), growth: 0.001,
    hunt: { spot: "shore", minutes: 150, odds: 0.4, injury: 0, level: 3 }, yields: { meatKg: 10, furKg: 1.5, fatKg: 3, bone: 2, sinew: 1 } },
  deer: { name: "roe deer", kind: "mammal", habitat: { birch: 6, meadow: 5, pine: 3, spruce: 2 }, range: 0.7, season: resident(0.6), growth: 0.0012,
    hunt: { spot: "forest", minutes: 180, odds: 0.45, injury: 0, level: 4 }, yields: { meatKg: 12, hideKg: 3, fatKg: 2, bone: 4, sinew: 3 } },
  reindeer: { name: "wild reindeer", kind: "mammal", habitat: { fell: 3, rock: 2, bog: 1.5, pine: 1 }, range: 0.6, season: resident(), growth: 0.0008,
    hunt: { spot: "outcrop", minutes: 200, odds: 0.4, injury: 0.05, level: 6 }, yields: { meatKg: 40, hideKg: 5, fatKg: 6, bone: 5, sinew: 4 } },
  elk: { name: "elk", kind: "mammal", habitat: { spruce: 1.0, bog: 0.8, birch: 0.5, pine: 0.3 }, range: 0.8, season: resident(0.6), growth: 0.0006,
    hunt: { spot: "forest", minutes: 240, odds: 0.3, injury: 0.15, level: 8 }, yields: { meatKg: 150, hideKg: 20, fatKg: 15, bone: 8, sinew: 6 },
    calls: [{ sound: "elk", when: "dusk", months: [8, 9], weight: 2 }, { sound: "elk", when: "night", months: [8, 9], weight: 2 }] },
  wolf: { name: "wolf", kind: "mammal", habitat: { spruce: 0.08, pine: 0.06, bog: 0.05, birch: 0.04, fell: 0.02 }, range: 0.35, season: resident(), growth: 0.0005,
    hunt: { spot: "forest", minutes: 240, odds: 0.25, injury: 0.35, level: 12 }, yields: { meatKg: 25, furKg: 3, fatKg: 1, bone: 6, sinew: 4 },
    calls: [{ sound: "wolf", when: "night", weight: 1 }] },
  wolverine: { name: "wolverine", kind: "mammal", habitat: { fell: 0.03, spruce: 0.03, rock: 0.02, bog: 0.02 }, range: 0.4, season: resident(), growth: 0.0005,
    hunt: { spot: "outcrop", minutes: 240, odds: 0.2, injury: 0, level: 10 }, yields: { meatKg: 8, furKg: 1.5, bone: 3, sinew: 2 } },
  // Denned November to March: absent the way a migrant is, and the same rule says so.
  bear: { name: "brown bear", kind: "mammal", habitat: { spruce: 0.15, pine: 0.1, bog: 0.1, birch: 0.08 }, range: 0.5, season: migrant(3, 10, "denned"), growth: 0.0006,
    hunt: { spot: "forest", minutes: 300, odds: 0.25, injury: 0.5, level: 15 }, yields: { meatKg: 80, furKg: 8, fatKg: 25, bone: 8, sinew: 5 } },

  // Game birds, all taken with the bow.
  willowGrouse: { name: "willow grouse", kind: "bird", habitat: { bog: 12, birch: 8, meadow: 4, fell: 2 }, range: 0.9, season: resident(), growth: 0.005,
    hunt: { spot: "heath", minutes: 60, odds: 0.6, injury: 0 }, yields: { meatKg: 0.4 },
    calls: [{ sound: "willowGrouse", when: "dawn", weight: 2 }, { sound: "willowGrouse", when: "dusk", weight: 2 }] },
  ptarmigan: { name: "rock ptarmigan", kind: "bird", habitat: { fell: 8, rock: 5 }, range: 0.8, season: resident(), growth: 0.005,
    hunt: { spot: "outcrop", minutes: 60, odds: 0.55, injury: 0 }, yields: { meatKg: 0.35 },
    calls: [{ sound: "ptarmigan", when: "day", weight: 2 }] },
  blackGrouse: { name: "black grouse", kind: "bird", habitat: { birch: 5, meadow: 4, bog: 3, pine: 2 }, range: 0.7, season: resident(), growth: 0.005,
    hunt: { spot: "heath", minutes: 90, odds: 0.5, injury: 0 }, yields: { meatKg: 0.8 },
    calls: [{ sound: "blackGrouse", when: "dawn", months: [2, 4], weight: 3 }] },
  capercaillie: { name: "capercaillie", kind: "bird", habitat: { spruce: 3, pine: 3 }, range: 0.5, season: resident(), growth: 0.005,
    hunt: { spot: "forest", minutes: 120, odds: 0.4, injury: 0, level: 2 }, yields: { meatKg: 2.5 },
    calls: [{ sound: "capercaillie", when: "dawn", months: [2, 4], weight: 3 }] },
  hazelGrouse: { name: "hazel grouse", kind: "bird", habitat: { spruce: 6, birch: 2 }, range: 0.6, season: resident(), growth: 0.005,
    hunt: { spot: "forest", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.3 } },
  mallard: { name: "mallard", kind: "bird", habitat: { lake: 10 }, range: 0.8, season: migrant(3, 9), growth: 0.005,
    hunt: { spot: "shore", minutes: 60, odds: 0.5, injury: 0 }, yields: { meatKg: 0.8 },
    calls: [{ sound: "mallard", when: "day", weight: 2 }] },
  eider: { name: "eider", kind: "bird", habitat: { sea: 15 }, range: 0.9, season: resident(), growth: 0.005,
    hunt: { spot: "shore", minutes: 90, odds: 0.45, injury: 0 }, yields: { meatKg: 1.5 },
    calls: [{ sound: "eider", when: "day", weight: 2 }] },
  goose: { name: "bean goose", kind: "bird", habitat: { bog: 3 }, range: 0.5, season: migrant(3, 9), growth: 0.005,
    hunt: { spot: "heath", minutes: 120, odds: 0.3, injury: 0, level: 3 }, yields: { meatKg: 2.5 },
    calls: [{ sound: "goose", when: "any", months: [3, 3], weight: 3 }, { sound: "goose", when: "any", months: [8, 9], weight: 3 }] },

  // Voice-only birds: heard and listed, never hunted.
  loon: { name: "black-throated loon", kind: "bird", habitat: { lake: 2 }, range: 0.7, season: migrant(4, 9), growth: 0.005,
    calls: [{ sound: "loon", when: "dusk", weight: 3 }, { sound: "loon", when: "night", weight: 3 }] },
  cuckoo: { name: "cuckoo", kind: "bird", habitat: { birch: 3, pine: 2, spruce: 1 }, range: 0.8, season: migrant(4, 7), growth: 0.005,
    calls: [{ sound: "cuckoo", when: "day", weight: 3 }, { sound: "cuckoo", when: "dawn", weight: 3 }] },
  raven: { name: "raven", kind: "bird", habitat: { fell: 1, rock: 1, spruce: 0.3 }, range: 0.9, season: resident(), growth: 0.005,
    calls: [{ sound: "raven", when: "day", weight: 2 }] },
  // Two calls in one window, not one stronger call: the sound layer rolls each open call on its own, so February to May the owl is heard twice as often.
  owl: { name: "Ural owl", kind: "bird", habitat: { spruce: 0.5, pine: 0.3 }, range: 0.5, season: resident(), growth: 0.005,
    calls: [{ sound: "owl", when: "night", weight: 2 }, { sound: "owl", when: "night", months: [1, 4], weight: 2 }] },
  crane: { name: "crane", kind: "bird", habitat: { bog: 1.5 }, range: 0.5, season: migrant(3, 9), growth: 0.005,
    calls: [{ sound: "crane", when: "dawn", weight: 2 }, { sound: "crane", when: "day", weight: 2 }] },
  woodpecker: { name: "great spotted woodpecker", kind: "bird", habitat: { spruce: 2, pine: 2, birch: 2 }, range: 0.8, season: resident(), growth: 0.005,
    calls: [{ sound: "woodpecker", when: "day", months: [2, 4], weight: 2 }] },

  // Lake fish: biomass per hectare over mean weight (perKm2). spawn windows
  // are the fat and carbohydrate design's section 3 table, 0-based inclusive.
  perch: fish("perch", perKm2(30, 0.08), null, 0.9, 0.6, 0.3, { lie: "along the reeds", spawn: [3, 4] }),
  roach: fish("roach", perKm2(20, 0.1), null, 0.6, 0.7, 0.2, { lie: "in the shallows", spawn: [3, 4] }),
  pike: fish("pike", perKm2(15, 1.5), null, 0.8, 0.35, 2.0, { level: 3, lie: "in the reeds", spawn: [3, 4] }),
  whitefish: fish("whitefish", perKm2(10, 0.5), null, 0.6, 0.5, 0.6, { level: 2, lie: "off the point", spawn: [9, 10] }),
  char: fish("arctic char", perKm2(5, 0.6), null, 0.3, 0.45, 0.8, { level: 4, lie: "in the deep water", oily: true, spawn: [8, 9] }),
  trout: fish("brown trout", perKm2(5, 0.5), null, 0.5, 0.4, 0.7, { level: 3, lie: "at the inflow", oily: true, spawn: [8, 9] }),
  burbot: fish("burbot", perKm2(5, 1.0), null, 0.5, 0.4, 1.2, { level: 2, night: 1.3, season: resident(1.5), lie: "on the bottom", spawn: [0, 1] }),

  // Sea fish, the coastal strip: cod and saithe thin, herring in shoals.
  cod: fish("cod", null, perKm2(5, 2.5), 0.9, 0.5, 2.5, { level: 2, lie: "off the rocks", spawn: [2, 3] }),
  saithe: fish("saithe", null, perKm2(5, 1.5), 0.7, 0.5, 1.5, { lie: "off the rocks", spawn: [1, 2] }),
  herring: fish("herring", null, perKm2(30, 0.15), 0.6, 0.8, 0.15, { lie: "off the point", oily: true, spawn: [2, 3] }),
} satisfies Record<string, SpeciesDef>;

export type Species = keyof typeof SPECIES_DEFS_RAW;
/** Widened from the literal RAW object so every entry reads as a full SpeciesDef, not just the fields its own literal happened to set. */
export const SPECIES_DEFS: Record<Species, SpeciesDef> = SPECIES_DEFS_RAW;
export const SPECIES_IDS = Object.keys(SPECIES_DEFS) as Species[];
/** The species whose first kill marks the large-game surplus: the tables' large-game row. */
export const LARGE_GAME: Species[] = ["deer", "reindeer", "elk"];

/**
 * Fat by season, as a share of the peak (fat and carbohydrate design,
 * section 2): ungulates at full from August to November, half in winter, a
 * fifth from March to May and 0.6 through midsummer; a bear full before
 * denning, a third at emergence; a beaver near full all year; the rest of
 * the mammals at half. The figure abstracts suet, depot fat and other
 * fatty tissue; other offal is in the meat.
 */
export function fatSeason(s: Species, month: number): number {
  switch (s) {
    case "deer": case "reindeer": case "elk":
      return month >= 7 && month <= 10 ? 1 : month === 11 || month <= 1 ? 0.5 : month <= 4 ? 0.2 : 0.6;
    case "bear":
      return month === 8 || month === 9 ? 1 : month === 3 || month === 4 ? 0.3 : month >= 5 && month <= 7 ? 0.6 : 0;
    case "beaver": return 0.8;
    default: return SPECIES_DEFS[s].kind === "mammal" ? 0.5 : 0;
  }
}

/** Marrow is the last fat to go: 1 at a full animal, 0.75 at half, 0.4 at a fifth, linear between and no lower. */
export function marrowFactor(season: number): number {
  if (season >= 1) return 1;
  if (season >= 0.5) return 0.75 + ((season - 0.5) / 0.5) * 0.25;
  if (season >= 0.2) return 0.4 + ((season - 0.2) / 0.3) * 0.35;
  return 0.4;
}

export function speciesDef(s: Species): SpeciesDef {
  return SPECIES_DEFS[s];
}

export function isFish(s: Species): boolean {
  return SPECIES_DEFS[s].kind === "fish";
}

/** Which item a catch produces: the oily class or the plain one, by species. The probe reads an oily catch as lean when the source is shut. */
export function fishItem(s: Species): "fish" | "oilyFish" {
  return SPECIES_DEFS[s].oily && !disabled("oilyFish") ? "oilyFish" : "fish";
}

/** Whether a species is spawning this month: a catch inside the window also brings roe. */
export function inSpawn(s: Species, month: number): boolean {
  const w = SPECIES_DEFS[s].spawn;
  return w !== undefined && month >= w[0] && month <= w[1];
}

export function isHunted(s: Species): boolean {
  return SPECIES_DEFS[s].hunt !== undefined;
}

export function isVoiceOnly(s: Species): boolean {
  return SPECIES_DEFS[s].hunt === undefined;
}

/** Hunted species that are not fish: what the bow takes. */
export function huntedLand(): Species[] {
  return SPECIES_IDS.filter((s) => isHunted(s) && !isFish(s));
}

export function fishSpecies(): Species[] {
  return SPECIES_IDS.filter(isFish);
}

/** The water a species lives on or in, for species whose habitat is water at all. */
export function waterOf(s: Species): WaterKind | null {
  const h = SPECIES_DEFS[s].habitat;
  if (h.lake !== undefined) return "lake";
  if (h.sea !== undefined) return "sea";
  return null;
}

/** How a migrant's absence reads on the region card: "gone until April" or "denned until April". */
export function awayWord(def: SpeciesDef): "gone" | "denned" {
  return def.season.kind === "migrant" ? (def.season.away ?? "gone") : "gone";
}

/** Capacity factor for a month: a resident's winter thinning, a migrant's absence. */
export function seasonFactor(def: SpeciesDef, month: number): number {
  const r = def.season;
  if (r.kind === "resident") return month >= 11 || month <= 1 ? (r.winter ?? 1) : 1;
  return month >= r.arrive && month < r.leave ? 1 : 0;
}

/** Which mastery extras a hunted species gets: an animal that can hurt you or gives hide is big game; otherwise fur makes a fur-bearer. */
export function extrasClass(s: Species): "fur" | "big" | "bird" | "fish" | null {
  const def = SPECIES_DEFS[s];
  if (!def.hunt || !def.yields) return null;
  if (def.kind === "fish") return "fish";
  if (def.kind === "bird") return "bird";
  if (def.hunt.injury > 0 || def.yields.hideKg) return "big";
  return def.yields.furKg ? "fur" : "big";
}
