/**
 * Where each Do row lives: its subtab, and within that the purpose it
 * serves.
 *
 * The panel used to be five folding groups, one of which - Camp - held
 * twenty-six rows covering cooking, water, fire, tools and rest under a
 * single heading. A player looking for food read the whole thing. So the
 * left pane of each subtab gives that kind of work a short, concrete name,
 * and the item pane holds the actions in it.
 *
 * A row belongs to exactly one purpose. Two homes would mean a reader who
 * found it under one could not be sure they had seen everything under the
 * other.
 *
 * tests/purpose.test.ts holds every row to having exactly one home, and
 * every home to having at least one row.
 */
import type { OpportunityKey, TaskId } from "../sim/types";

export type SubtabId = "Gather" | "Hunt" | "Explore" | "Camp" | "Make" | "Build";

export const SUBTABS: SubtabId[] = ["Gather", "Hunt", "Explore", "Camp", "Make", "Build"];

/** The left pane's entries per subtab, in the order they are shown. */
export const PURPOSES: Record<SubtabId, string[]> = {
  Gather: ["Woodcutting", "Kindling", "Tree products", "Wild food", "Stone"],
  Hunt: ["Game", "Fish", "Traps"],
  Explore: ["Wayfinding", "Shelter", "Weather"],
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
 * species: generic and specific variants live beside each other.
 */
const HOME: Record<string, [SubtabId, string]> = {
  // Gather
  chop: ["Gather", "Woodcutting"],
  deadwood: ["Gather", "Kindling"],
  sticks: ["Gather", "Kindling"],
  bark: ["Gather", "Tree products"],
  innerBark: ["Gather", "Tree products"],
  tapSap: ["Gather", "Tree products"],
  berries: ["Gather", "Wild food"],
  eggs: ["Gather", "Wild food"],
  roots: ["Gather", "Wild food"],
  seaweed: ["Gather", "Wild food"],
  stone: ["Gather", "Stone"],

  // Hunt
  hunt: ["Hunt", "Game"],
  findDen: ["Hunt", "Game"],
  fish: ["Hunt", "Fish"],
  read: ["Hunt", "Fish"],
  setTrap: ["Hunt", "Traps"],
  emptyTrap: ["Hunt", "Traps"],

  // Explore
  explore: ["Explore", "Wayfinding"],
  searchHome: ["Explore", "Wayfinding"],
  findShelter: ["Explore", "Shelter"],
  readSky: ["Explore", "Weather"],

  // Camp
  light: ["Camp", "Fire"],
  fuel: ["Camp", "Fire"],
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
  "build:vedbod": ["Build", "Fire"],
  "build:leanTo": ["Build", "Shelter"],
  "build:cabin": ["Build", "Shelter"],
  "build:turfHut": ["Build", "Shelter"],
  "build:snowShelter": ["Build", "Shelter"],
  "build:boughBed": ["Build", "Shelter"],
  improveCover: ["Build", "Shelter"],
  emergencyShelter: ["Build", "Shelter"],
  "build:seep": ["Build", "Water"],
  "build:waterStore": ["Build", "Water"],
  "build:dryingRack": ["Build", "Food"],
  "build:snare": ["Build", "Food"],
};

/**
 * Which opportunity puts a row on the board.
 *
 * A row is drawn once its opportunity is discovered, and not before. Day 1
 * used to draw eighty-four rows of which twelve could be started, and
 * twenty-two of the refusals were recipes for tools the player had never
 * heard of. A row whose opportunity has arrived may still be blocked - on
 * the season, on the place, on a step that is itself on screen - and every
 * one of those blocks teaches something. What is gated is the one that
 * teaches nothing.
 *
 * The opening is the authored spine, and nothing else:
 *
 *     site -> drink -> firewood -> fire -> bed, roof
 *
 * `opportunities.ts` already declares those with a prerequisite on the one
 * before, so a landing offers exactly one thing to do - make camp - and the
 * board opens a rung at a time as each is met. That sequence is the
 * onboarding; keying the opening rows to anything else would put a dozen
 * choices in front of a player who has not yet chosen where to live.
 *
 * Only the body rows keep `site` alongside making camp, because resting and
 * sleeping are not things a player is taught, they are things a body does.
 *
 * Exactly one key per row. Two would mean a player who saw a row appear
 * could not tell what they had just learned. `tests/reveal.test.ts` holds
 * that, and holds every key to being one the catalogue really defines.
 */
const REVEAL: Record<string, OpportunityKey> = {
  // Gather. The wood rows arrive with the goal that asks for firewood.
  chop: "firewood",
  deadwood: "firewood",
  sticks: "firewood",
  bark: "firewood",
  stone: "firewood",
  // Not the forage: keys, which a landing discovers silently so the
  // catalogue can show what the ground carries. Those would put every
  // edible on the board beside "choose where to live". The rows arrive with
  // the first rung after the camp; which of them a ground actually offers
  // is still decided by intentGroups, which filters by region.
  innerBark: "drink",
  berries: "drink",
  eggs: "drink",
  roots: "drink",
  seaweed: "drink",
  // Not a season key: all four seasons are seeded at minute 0, so a row
  // keyed to one shows from the first minute whatever month it is.
  tapSap: "seasonalFood",

  // Hunt. The tackle is what makes each of these a prospect.
  hunt: "make:bow",
  "hunt:any": "make:bow",
  findDen: "track:bear",
  fish: "make:fishingSpear",
  "fish:any": "make:fishingSpear",
  read: "fishMeal",
  setTrap: "make:basketTrap",
  emptyTrap: "make:basketTrap",

  // Explore. Walking and looking need nothing but legs.
  explore: "explore",
  searchHome: "explore",
  findShelter: "findUsefulCover",
  readSky: "readWeather",

  // Camp.
  light: "fire",
  lightIndoors: "build:cabin",
  lightTorch: "make:torch",
  fuel: "fire",
  split: "firewood",
  splitWedges: "make:wedges",
  cook: "cook",
  hang: "build:dryingRack",
  crack: "huntMeal",
  grindBark: "drink",
  melt: "make:barkBucket",
  thaw: "make:barkBucket",
  fill: "drink",
  iceHole: "water",
  night: "site",
  rest: "site",
  sleep: "site",
  repair: "make:needle",
  sharpen: "toolCare",
  hone: "make:whetstone",

  // Make. Each recipe is revealed by its own goal.
  "craft:fireDrill": "fire",
  "craft:torch": "make:torch",
  "craft:cordage": "make:cordage",
  "craft:knife": "make:knife",
  "craft:flakedAxe": "make:flakedAxe",
  "craft:stoneAxe": "make:stoneAxe",
  "craft:whetstone": "make:whetstone",
  "craft:wedges": "make:wedges",
  "craft:needle": "make:needle",
  "craft:bow": "make:bow",
  "craft:arrows": "make:arrows",
  "craft:fishingSpear": "make:fishingSpear",
  "craft:snare": "make:snare",
  "craft:basketTrap": "make:basketTrap",
  "craft:hideCoat": "make:hideCoat",
  "craft:hideTrousers": "make:hideTrousers",
  "craft:hideBoots": "make:hideBoots",
  "craft:furHat": "make:furHat",
  "craft:furMittens": "make:furMittens",
  "craft:hideBlanket": "make:hideBlanket",
  "craft:barkBucket": "make:barkBucket",
  "craft:waterskin": "make:waterskin",

  // Build. Siting a camp is the first thing anyone does.
  makeCamp: "site",
  improveCover: "findUsefulCover",
  emergencyShelter: "findUsefulCover",
  "build:firePit": "build:firePit",
  "build:vedbod": "build:vedbod",
  "build:leanTo": "roof",
  "build:cabin": "build:cabin",
  "build:turfHut": "build:turfHut",
  "build:snowShelter": "build:snowShelter",
  "build:boughBed": "bed",
  "build:seep": "build:seep",
  "build:waterStore": "build:waterStore",
  "build:dryingRack": "build:dryingRack",
  "build:snare": "build:snare",
};

/**
 * The opportunity that reveals this row, or null when nothing does - which
 * the coverage test treats as a fault, the way a missing home is.
 *
 * Mending follows its structure, as `home` does: a lean-to mended is
 * revealed by whatever revealed the lean-to.
 */
export function revealOf(id: TaskId, arg?: string): OpportunityKey | null {
  if (id === "mend" && arg) return REVEAL[`build:${arg}`] ?? null;
  return REVEAL[rowKey(id, arg)] ?? REVEAL[id] ?? null;
}

/**
 * The row an opportunity is asking for, read off `REVEAL` backwards.
 *
 * This is what turns the Opportunities card from a label into a door: the
 * card said "Make camp" and clicking it opened a catalogue, leaving the
 * player to find `Build > Site` themselves - the sixth subtab of six.
 *
 * Built once at module load, not per draw. Where several rows share a key
 * the first wins, which is why the opening rungs name the row a player
 * should be looking at: `site` is making camp, not resting.
 */
const ASKS_FOR = new Map<OpportunityKey, string>();
for (const [row, key] of Object.entries(REVEAL)) if (!ASKS_FOR.has(key)) ASKS_FOR.set(key, row);

/**
 * The opening rungs, pinned rather than left to whichever row happens to
 * be written first. Several rows share each of these keys - `drink` reveals
 * the forage rows as well as fetching water, `site` reveals resting as well
 * as making camp - and the card has to name the work the goal is about.
 * This is the sentence the goal already says, said in the panel's terms.
 */
for (const [key, row] of [
  ["site", "makeCamp"], ["drink", "fill"], ["firewood", "deadwood"],
  ["fire", "light"], ["bed", "build:boughBed"], ["roof", "build:leanTo"],
] as const) {
  ASKS_FOR.set(key, row);
}

/** Where the Do pane should stand to show what this opportunity is asking for. */
export function paneForOpportunity(key: OpportunityKey): { subtab: SubtabId; purpose: string } | null {
  const row = ASKS_FOR.get(key);
  if (row === undefined) return null;
  const [id, arg] = row.includes(":") ? row.split(":") : [row, undefined];
  const subtab = subtabOf(id as TaskId, arg);
  const purpose = purposeOf(id as TaskId, arg);
  return subtab === null || purpose === null ? null : { subtab, purpose };
}

function home(id: TaskId, arg?: string): [SubtabId, string] | null {
  // Mending a thing serves whatever the thing serves: a lean-to is shelter
  // mended or new, a drying rack is food either way. So a mend row takes the
  // home its structure has rather than needing a second table that could
  // drift from the first.
  if (id === "mend" && arg) return HOME[`build:${arg}`] ?? null;
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
