/**
 * The capability spine (spec 2026-09-04-survidle-capability-spine-design.md,
 * section 5), as data: one row per built capability, asserted both ways
 * against the recommended levels, the structures, the recipes and the
 * rungs. A row is something the survivor can newly do, recognise, make,
 * automate or survive; it names what it receives from outside its skill,
 * what it gives, and what it leaves limiting. Species and mastery extras
 * are content beneath rows and are not here.
 */
import type { OrderKind, RecipeId, SkillId, StructureId } from "./types";

export type CapabilityKey = `rec:${string}` | `build:${StructureId}` | `craft:${RecipeId}` | `rung:${OrderKind}`;

export interface CapabilityRow {
  /** The name a player remembers. */
  id: string;
  /** What the row stands for in code: a RECOMMENDED key, a structure, a recipe with no recommended level, a delegation rung. */
  keys: CapabilityKey[];
  /** The skill the tier sits on, or "structure" or "rung". */
  tier: { skill: SkillId; level: number } | "structure" | "rung";
  /** Skills outside its own it takes from; empty only with `alone`. */
  receives: SkillId[];
  gives: string;
  limits: string;
  alone?: string;
  producer?: true;
}

export const NOT_TIERS: StructureId[] = ["boughBed"];
export const PRODUCERS: string[] = ["snares", "drying rack", "basket trap", "water trough", "seep"];

export const CAPABILITIES: CapabilityRow[] = [
  {
    id: "jobs, grinds and keeps",
    keys: ["rung:job", "rung:grind", "rung:keep"],
    tier: "rung",
    receives: [],
    gives: "the horizon",
    limits: "the level a skill has reached",
    alone: "the rungs are how any skill delegates; they receive nothing and give the horizon",
  },
  {
    id: "fire pit",
    keys: ["build:firePit"],
    tier: "structure",
    receives: ["foraging"],
    gives: "a fire: warmth, cooking, light, drying",
    limits: "firewood",
  },
  {
    id: "lean-to",
    keys: ["build:leanTo"],
    tier: "structure",
    receives: ["woodcraft"],
    gives: "+5 C and half the wetting; a roof over the pit",
    limits: "a year, then re-roofing",
  },
  {
    id: "cabin",
    keys: ["rec:build:cabin", "build:cabin"],
    tier: { skill: "building", level: 10 },
    receives: ["woodcraft", "foraging"],
    gives: "+15 C, and the hearth, storehouse, cellar and smokehouse attach here",
    limits: "sixty hours, a winter's firewood",
  },
  {
    id: "drying rack",
    keys: ["build:dryingRack"],
    tier: "structure",
    receives: ["woodcraft", "hunting", "fishing"],
    producer: true,
    gives: "meat that keeps: 3 kg into 1",
    limits: "40 kg a rack and two racks, two dry days",
  },
  {
    id: "snares",
    keys: ["build:snare", "craft:snare"],
    tier: { skill: "hunting", level: 1 },
    receives: ["woodcraft", "crafting"],
    producer: true,
    gives: "food while working; fur, bone and sinew",
    limits: "checking them, the fox, five a region",
  },
  {
    id: "bone needle",
    keys: ["craft:needle"],
    tier: { skill: "crafting", level: 1 },
    receives: ["hunting"],
    gives: "tailored clothing, the waterskin",
    limits: "the first kill comes first",
  },
  {
    id: "whetstone",
    keys: ["craft:whetstone", "craft:wedges"],
    tier: { skill: "crafting", level: 1 },
    receives: ["foraging", "woodcraft"],
    gives: "an edge honed for nothing, and a log split with no axe",
    limits: "the axe is still the pace",
  },
  {
    id: "stone axe",
    keys: ["rec:craft:stoneAxe", "craft:flakedAxe"],
    tier: { skill: "crafting", level: 5 },
    receives: ["foraging", "woodcraft"],
    gives: "the second axe: a real edge in twenty hours, or a flaked one in an evening that shatters",
    limits: "stone at camp, and the whetstone",
  },
  {
    id: "bow",
    keys: ["rec:craft:bow"],
    tier: { skill: "crafting", level: 5 },
    receives: ["woodcraft", "hunting"],
    gives: "roe deer and elk",
    limits: "arrows, sinew, a lumpy larder",
  },
  {
    id: "tailored hide clothing",
    keys: ["rec:craft:hideCoat", "rec:craft:hideTrousers", "rec:craft:hideBoots", "rec:craft:hideBlanket"],
    tier: { skill: "crafting", level: 8 },
    receives: ["hunting"],
    gives: "winter under hide",
    limits: "wear, mending, a deer every eight days",
  },
  {
    id: "reading water",
    keys: ["rec:read"],
    tier: { skill: "fishing", level: 3 },
    // D's species table is Hunting's; reading a shore leans on it too.
    receives: ["hunting"],
    gives: "the shore says what it holds and where; a read shore fishes better; where to set a trap",
    limits: "nothing passive yet",
  },
  {
    id: "basket trap",
    keys: ["rec:trap", "craft:basketTrap"],
    tier: { skill: "fishing", level: 5 },
    receives: ["woodcraft", "crafting"],
    producer: true,
    gives: "passive fish: the first food a camp makes without you",
    limits: "emptying, the racks' 80 kg, the ice",
  },
  {
    id: "turf hut",
    keys: ["rec:build:turfHut", "build:turfHut"],
    tier: { skill: "building", level: 5 },
    receives: ["woodcraft", "foraging"],
    gives: "a fire inside and a first winter; +10 C",
    limits: "re-roofing in a year and a half",
  },
  {
    id: "water trough",
    keys: ["rec:build:waterStore", "build:waterStore"],
    tier: { skill: "building", level: 3 },
    receives: ["woodcraft"],
    producer: true,
    gives: "a week of water at camp",
    limits: "the walk to fill it",
  },
  {
    id: "seep",
    keys: ["build:seep"],
    tier: "structure",
    receives: ["woodcraft"],
    producer: true,
    gives: "water that comes on its own: a pool at a bog or in damp forest, for a camp with no shore",
    limits: "the ground's litres an hour, frost without a fire on its cell, a dry fortnight, a re-dig each year",
  },
];
