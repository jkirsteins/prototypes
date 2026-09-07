/**
 * Where each Do row lives: its subtab, and within that the purpose it
 * serves.
 *
 * The panel used to be five folding groups, one of which - Camp - held
 * twenty-six rows covering cooking, water, fire, tools and rest under a
 * single heading. A player looking for food read the whole thing. So the
 * left pane of each subtab asks the only question a player actually has,
 * which is what a row is *for*, and the item pane answers it.
 *
 * A row belongs to exactly one purpose, chosen by what a player wants it
 * for first: inner bark is food before it is cordage stock, so it is
 * Food, and bark is Material. Two homes would mean a reader who found it
 * under one could not be sure they had seen everything under the other.
 *
 * tests/purpose.test.ts holds every row to having exactly one home, and
 * every home to having at least one row.
 */
import type { TaskId } from "../sim/types";

export type SubtabId = "Gather" | "Hunt" | "Camp" | "Make" | "Build";

export const SUBTABS: SubtabId[] = ["Gather", "Hunt", "Camp", "Make", "Build"];

/** The left pane's entries per subtab, in the order they are shown. */
export const PURPOSES: Record<SubtabId, string[]> = {
  Gather: ["Fuel", "Food", "Material"],
  Hunt: ["Food", "Traps", "Scout"],
  Camp: ["Fire", "Fuel", "Food", "Water", "Rest", "Tools"],
  Make: ["Fire", "Tools", "Hunting", "Clothing", "Water"],
  Build: ["Site", "Fire", "Shelter", "Water", "Food"],
};

/**
 * A row's name in the table below: its task id, or `id:arg` where one
 * task covers many rows. Keyed the way dopanel.ts's VOCABULARY is keyed,
 * so a reader holding both tables open reads them the same way.
 */
export function rowKey(id: TaskId, arg?: string): string {
  return arg ? `${id}:${arg}` : id;
}

/**
 * An `id:arg` entry wins over a bare `id`. That is what lets craft split
 * across four panes by recipe while hunt keeps one line for every
 * species: whatever you are hunting, you are hunting it for food.
 */
const HOME: Record<string, [SubtabId, string]> = {
  // Gather
  chop: ["Gather", "Fuel"],
  deadwood: ["Gather", "Fuel"],
  sticks: ["Gather", "Fuel"],
  berries: ["Gather", "Food"],
  eggs: ["Gather", "Food"],
  roots: ["Gather", "Food"],
  seaweed: ["Gather", "Food"],
  innerBark: ["Gather", "Food"],
  tapSap: ["Gather", "Food"],
  bark: ["Gather", "Material"],
  stone: ["Gather", "Material"],

  // Hunt
  hunt: ["Hunt", "Food"],
  fish: ["Hunt", "Food"],
  emptyTrap: ["Hunt", "Food"],
  setTrap: ["Hunt", "Traps"],
  read: ["Hunt", "Scout"],

  // Camp
  light: ["Camp", "Fire"],
  lightIndoors: ["Camp", "Fire"],
  lightTorch: ["Camp", "Fire"],
  split: ["Camp", "Fuel"],
  splitWedges: ["Camp", "Fuel"],
  cook: ["Camp", "Food"],
  hang: ["Camp", "Food"],
  crack: ["Camp", "Food"],
  grindBark: ["Camp", "Food"],
  melt: ["Camp", "Water"],
  thaw: ["Camp", "Water"],
  fill: ["Camp", "Water"],
  iceHole: ["Camp", "Water"],
  night: ["Camp", "Rest"],
  rest: ["Camp", "Rest"],
  sleep: ["Camp", "Rest"],
  repair: ["Camp", "Tools"],
  sharpen: ["Camp", "Tools"],
  hone: ["Camp", "Tools"],

  // Make. Cordage is under Tools rather than a Material pane of its own:
  // it is handwork, and it is what the tools pane is already full of.
  "craft:fireDrill": ["Make", "Fire"],
  "craft:torch": ["Make", "Fire"],
  "craft:knife": ["Make", "Tools"],
  "craft:flakedAxe": ["Make", "Tools"],
  "craft:stoneAxe": ["Make", "Tools"],
  "craft:whetstone": ["Make", "Tools"],
  "craft:wedges": ["Make", "Tools"],
  "craft:needle": ["Make", "Tools"],
  "craft:cordage": ["Make", "Tools"],
  "craft:bow": ["Make", "Hunting"],
  "craft:arrows": ["Make", "Hunting"],
  "craft:fishingSpear": ["Make", "Hunting"],
  "craft:snare": ["Make", "Hunting"],
  "craft:basketTrap": ["Make", "Hunting"],
  "craft:hideCoat": ["Make", "Clothing"],
  "craft:hideTrousers": ["Make", "Clothing"],
  "craft:hideBoots": ["Make", "Clothing"],
  "craft:furHat": ["Make", "Clothing"],
  "craft:furMittens": ["Make", "Clothing"],
  "craft:hideBlanket": ["Make", "Clothing"],
  "craft:barkBucket": ["Make", "Water"],
  "craft:waterskin": ["Make", "Water"],

  // Build. makeCamp is siting and not a chore, which is why it sits here
  // and not among Camp's cooking and mending.
  makeCamp: ["Build", "Site"],
  "build:firePit": ["Build", "Fire"],
  "build:leanTo": ["Build", "Shelter"],
  "build:cabin": ["Build", "Shelter"],
  "build:turfHut": ["Build", "Shelter"],
  "build:snowShelter": ["Build", "Shelter"],
  "build:boughBed": ["Build", "Shelter"],
  "build:seep": ["Build", "Water"],
  "build:waterStore": ["Build", "Water"],
  "build:dryingRack": ["Build", "Food"],
  "build:snare": ["Build", "Food"],
};

function home(id: TaskId, arg?: string): [SubtabId, string] | null {
  return HOME[rowKey(id, arg)] ?? HOME[id] ?? null;
}

/** What this row is for, or null when it has no home - which the coverage test treats as a fault. */
export function purposeOf(id: TaskId, arg?: string): string | null {
  return home(id, arg)?.[1] ?? null;
}

/** Which subtab draws this row. */
export function subtabOf(id: TaskId, arg?: string): SubtabId | null {
  return home(id, arg)?.[0] ?? null;
}
