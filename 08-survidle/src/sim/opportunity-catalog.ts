import { cellAt, neighbours, waterKindOf, type World } from "../world/gen";
import { knownPatches } from "./fineknowledge";
import type { Calendar } from "./calendar";
import { STRUCTURES, TOOLS, type FoodId } from "./items";
import { SPECIES_DEFS, type Species } from "./species";
import type {
  GameState, ItemId, OpportunityCategory, OpportunityDef, OpportunityEvent,
  OpportunityGroupDef, OpportunityKey, OpportunityState, OpportunityStepDef,
  RecipeId, Season, SkillId, StructureId, TaskId, ToolId,
} from "./types";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const satisfies readonly Season[];

export const SUPPORTED_WILDLIFE_SPECIES = ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const satisfies readonly Species[];
export const SUPPORTED_FISH_SPECIES = ["perch", "roach", "pike", "whitefish", "char", "trout", "burbot", "cod", "saithe", "herring"] as const satisfies readonly Species[];
export const SUPPORTED_FORAGE_FOODS = ["berries", "eggs", "barkFlour", "cookedRoots", "seaweed"] as const satisfies readonly FoodId[];
export const SUPPORTED_SHELTER_STRUCTURES = ["leanTo", "cabin", "boughBed", "turfHut", "snowShelter"] as const satisfies readonly StructureId[];
export const SUPPORTED_TOOL_RECIPES = ["knife", "fireDrill", "bow", "fishingSpear", "needle", "stoneAxe", "flakedAxe", "whetstone", "barkBucket", "waterskin"] as const satisfies readonly RecipeId[];
const SUPPORTED_FISH_SET = new Set<Species>(SUPPORTED_FISH_SPECIES);

const TOOL_RECIPE: Record<(typeof SUPPORTED_TOOL_RECIPES)[number], ToolId> = {
  knife: "knife", fireDrill: "fireDrill", bow: "bow", fishingSpear: "fishingSpear", needle: "needle",
  stoneAxe: "stoneAxe", flakedAxe: "flakedAxe", whetstone: "whetstone", barkBucket: "barkBucket",
  waterskin: "waterskin",
};

const FORAGE_TASK: Record<FoodId, TaskId | undefined> = {
  rawMeat: undefined, cookedMeat: undefined, driedMeat: undefined, cookedFish: undefined,
  cookedOilyFish: undefined, roe: undefined, berries: "berries", eggs: "eggs", barkFlour: "innerBark",
  fat: undefined, cookedRoots: "roots", seaweed: "seaweed",
};

const FORAGE_TITLES: Record<(typeof SUPPORTED_FORAGE_FOODS)[number], string> = {
  berries: "Gather berries", eggs: "Gather eggs", barkFlour: "Gather inner bark",
  cookedRoots: "Gather roots", seaweed: "Gather seaweed",
};

const one = (id: string, label: string, credit: OpportunityStepDef["credit"], target = 1, unit?: string): OpportunityStepDef[] => [
  { id, label, credit, target, unit, final: true },
];
const built = (structure: StructureId) => (event: OpportunityEvent) => event.kind === "built" && event.structure === structure ? 1 : 0;

const fishKeys = (kind: "catch" | "trap") => SUPPORTED_FISH_SPECIES.map((species) => `${kind}:${species}` as OpportunityKey);
const trackKeys = () => SUPPORTED_WILDLIFE_SPECIES.map((species) => `track:${species}` as OpportunityKey);
const huntKeys = () => SUPPORTED_WILDLIFE_SPECIES.map((species) => `hunt:${species}` as OpportunityKey);
const dressKeys = () => SUPPORTED_WILDLIFE_SPECIES.map((species) => `dress:${species}` as OpportunityKey);
const recoverKeys = () => SUPPORTED_WILDLIFE_SPECIES.map((species) => `recover:${species}` as OpportunityKey);
const forageKeys = () => SUPPORTED_FORAGE_FOODS.map((food) => `forage:${food}` as OpportunityKey);
const shelterKeys = () => SUPPORTED_SHELTER_STRUCTURES.map((structure) => `build:${structure}` as OpportunityKey);
const toolKeys = () => SUPPORTED_TOOL_RECIPES.map((recipe) => `make:${TOOL_RECIPE[recipe]}` as OpportunityKey);
const seasonKeys = () => SEASONS.map((season) => `season:${season}` as OpportunityKey);

export const OPPORTUNITY_CATEGORIES: OpportunityCategory[] = ["survival", "camp", "food", "wildlife", "weather", "exploration", "mastery"];
export const OPPORTUNITY_GROUPS: OpportunityGroupDef[] = [
  { id: "track-animals", title: "Track animals", category: "wildlife", keys: trackKeys() },
  { id: "hunt-animals", title: "Hunt animals", category: "wildlife", keys: huntKeys() },
  { id: "dress-carcasses", title: "Dress carcasses", category: "wildlife", keys: dressKeys() },
  { id: "recover-kills", title: "Recover kills", category: "wildlife", keys: recoverKeys() },
  { id: "catch-fish", title: "Catch fish", category: "food", keys: fishKeys("catch") },
  { id: "trap-fish", title: "Trap fish", category: "food", keys: fishKeys("trap") },
  { id: "forage-foods", title: "Forage foods", category: "food", keys: forageKeys() },
  { id: "build-shelters", title: "Build shelters", category: "camp", keys: shelterKeys() },
  { id: "make-tools", title: "Make tools", category: "mastery", keys: toolKeys() },
  { id: "seasons", title: "Seasons", category: "exploration", keys: seasonKeys() },
];

const COLLECTION_OPPORTUNITIES: OpportunityDef[] = [
  ...SUPPORTED_WILDLIFE_SPECIES.flatMap((species): OpportunityDef[] => {
    const name = SPECIES_DEFS[species].name;
    const dress = `Dress ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name} carcass`;
    return [
      { key: `track:${species}`, title: `Read ${name} sign`, category: "wildlife", group: "track-animals", steps: one("sign", `Find fresh ${name} sign`, (event) => event.kind === "signFound" && event.species === species ? 1 : 0) },
      { key: `hunt:${species}`, title: `Hunt ${name}`, category: "wildlife", group: "hunt-animals", prerequisites: [`track:${species}`], steps: one("kill", `Kill ${name}`, (event) => event.kind === "animalKilled" && event.species === species ? 1 : 0) },
      { key: `dress:${species}`, title: dress, category: "wildlife", group: "dress-carcasses", prerequisites: [`hunt:${species}`], steps: one("dress", dress, (event) => event.kind === "carcassDressed" && event.species === species ? 1 : 0) },
      { key: `recover:${species}`, title: `Bring ${name} meat to camp`, category: "wildlife", group: "recover-kills", prerequisites: [`dress:${species}`], steps: one("recover", `Bring ${name} meat to camp`, (event) => event.kind === "carcassRecovered" && event.species === species ? 1 : 0) },
    ];
  }),
  ...SUPPORTED_FISH_SPECIES.flatMap((species): OpportunityDef[] => [
    { key: `catch:${species}`, title: `Catch ${SPECIES_DEFS[species].name}`, category: "food", group: "catch-fish", steps: one("catch", `Catch ${SPECIES_DEFS[species].name}`, (event) => event.kind === "fishCaught" && event.method === "direct" && event.species === species ? 1 : 0) },
    { key: `trap:${species}`, title: `Trap ${SPECIES_DEFS[species].name}`, category: "food", group: "trap-fish", steps: one("trap", `Collect ${SPECIES_DEFS[species].name} from a trap`, (event) => event.kind === "fishCaught" && event.method === "trap" && event.species === species ? 1 : 0) },
  ]),
  ...SUPPORTED_FORAGE_FOODS.map((food): OpportunityDef => ({ key: `forage:${food}`, title: FORAGE_TITLES[food], category: "food", group: "forage-foods", steps: one("gather", FORAGE_TITLES[food], (event) => event.kind === "foraged" && event.item === food ? 1 : 0) })),
  ...SUPPORTED_SHELTER_STRUCTURES.map((structure): OpportunityDef => ({ key: `build:${structure}`, title: `Build ${STRUCTURES[structure].name}`, category: "camp", group: "build-shelters", steps: one("build", `Build ${STRUCTURES[structure].name}`, built(structure)) })),
  ...SUPPORTED_TOOL_RECIPES.map((recipe): OpportunityDef => {
    const tool = TOOL_RECIPE[recipe];
    return { key: `make:${tool}`, title: `Make ${TOOLS[tool].name}`, category: "mastery", group: "make-tools", steps: one("make", `Make ${TOOLS[tool].name}`, (event) => event.kind === "toolMade" && event.tool === tool ? 1 : 0) };
  }),
];

let AUTHORED_OPPORTUNITIES: OpportunityDef[] = [];
const DEFS = new Map(COLLECTION_OPPORTUNITIES.map((def) => [def.key, def]));
/** The catalogue only changes when authored defs are registered, and every sim minute asks for it. */
let ALL_OPPORTUNITIES: OpportunityDef[] = [...COLLECTION_OPPORTUNITIES];

export function registerAuthoredOpportunityDefs(defs: readonly OpportunityDef[]): void {
  AUTHORED_OPPORTUNITIES = [...defs];
  for (const def of defs) DEFS.set(def.key, def);
  const authored = new Set(AUTHORED_OPPORTUNITIES.map((def) => def.key));
  ALL_OPPORTUNITIES = [...AUTHORED_OPPORTUNITIES, ...COLLECTION_OPPORTUNITIES.filter((def) => !authored.has(def.key))];
}

export function allOpportunityDefs(): OpportunityDef[] {
  return ALL_OPPORTUNITIES;
}

export function catalogOpportunityDef(key: OpportunityKey): OpportunityDef | undefined {
  return DEFS.get(key);
}

/**
 * Silent discovery is knowledge the survivor arrived with rather than
 * something that just happened: it neither presents nor takes the current
 * leaf, since there was no moment for the player to answer.
 */
export function discoverMany(state: OpportunityState, keys: readonly OpportunityKey[], minute: number, announce = true): OpportunityKey[] {
  const discovered: OpportunityKey[] = [];
  for (const key of keys) {
    if (!DEFS.has(key) || state.discoveredAt[key] !== undefined) continue;
    state.discoveredAt[key] = minute;
    discovered.push(key);
  }
  if (!announce) return discovered;
  if (state.current === null && discovered.length === 1) {
    state.current = discovered[0];
    state.lastCategory = DEFS.get(discovered[0])?.category ?? state.lastCategory;
  }
  if (discovered.length) state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: [], completedGroups: [], discovered, messages: [] });
  return discovered;
}

const capabilityLevel = (state: GameState, skill: SkillId): number => Math.min(50, 1 + Math.floor(Math.sqrt(Math.max(0, state.skills[skill].xp) / 120)));

/**
 * The capabilities a survivor steps off the boat already able to reach:
 * the fire they need tonight and the two roofs that cost only what the
 * ground gives. Seeded silently by `newOpportunities`, like the seasons.
 *
 * Everything else waits. Each Do row now hangs off the opportunity that
 * names it, so seeding all ten tools and all five shelters here would put
 * fifteen rows on the board before the player had done anything - which is
 * the twenty-two unmakeable recipes this pass exists to remove. The rest
 * are discovered in `knownCapabilityOpportunityKeys` below, which is where
 * this comment used to say a genuinely gated capability belongs.
 */
export const DAY_ONE_CAPABILITY_KEYS: readonly OpportunityKey[] = [
  "make:fireDrill", "build:leanTo", "build:boughBed",
];

/**
 * Whether the survivor can lay hands on an item: in hand as a tool, in the
 * pack, or in the pile at camp.
 *
 * Reads `items` directly rather than calling `qty`, because importing
 * inventory here is a cycle - inventory reaches back into this module and
 * the catalogue's own `SEASONS` is still undefined when it does. Every item
 * asked about below is a counted one, never a perishable stack, so the
 * plain read is the same answer `qty` would give.
 */
function holds(state: GameState, item: ItemId): boolean {
  if (state.player.tools.some((t) => (t.id as string) === item)) return true;
  if ((state.player.pack.items[item] ?? 0) > 0) return true;
  const cell = state.regions[state.player.region]?.campCell;
  if (cell === null || cell === undefined) return false;
  return (state.piles[cell]?.items[item] ?? 0) > 0;
}

/**
 * The capabilities the survivor's own kit, ground and skill have opened.
 *
 * Each condition names the thing that makes the capability a real prospect
 * rather than a locked door: the stone in hand before a knife is worth
 * knowing about, the knife before the work a knife does, the camp before
 * the buildings a camp holds. A player who learns of a bow while holding
 * no cordage has learned nothing they can act on.
 */
export function knownCapabilityOpportunityKeys(state: GameState): OpportunityKey[] {
  // Holding the stone, not seeing the outcrop. Knowing there is rock a
  // kilometre off is not having a stone to knap, and a condition that reads
  // the map would open the knife on some landings and not others.
  const stone = holds(state, "stone");
  const knife = holds(state, "knife");
  const camp = state.regions[state.player.region]?.campCell !== null
    && state.regions[state.player.region]?.campCell !== undefined;
  // Read off the track: keys rather than off the sign: having seen an animal
  // is already an opportunity, so the bow waits on the same fact the player
  // was told about rather than on a second notion of "seen".
  const seenGame = SUPPORTED_WILDLIFE_SPECIES
    .some((species) => state.opportunities.discoveredAt[`track:${species}` as OpportunityKey] !== undefined);

  const keys: OpportunityKey[] = [];
  if (stone) keys.push("make:knife", "make:whetstone");
  if (holds(state, "bark")) keys.push("make:barkBucket");
  if (knife) keys.push("make:flakedAxe", "make:fishingSpear");
  if (holds(state, "bone") || holds(state, "crackedBone")) keys.push("make:needle");
  if (holds(state, "hide")) keys.push("make:waterskin");
  if (seenGame) keys.push("make:bow");
  if (holds(state, "whetstone")) keys.push("make:stoneAxe");
  if (camp) keys.push("build:turfHut", "build:snowShelter");
  if (camp && capabilityLevel(state, "building") >= 5) keys.push("build:cabin");
  return keys;
}

export function knownTrapOpportunityKeys(state: GameState): OpportunityKey[] {
  if (capabilityLevel(state, "fishing") < 5) return [];
  const named = new Set<Species>();
  for (const observation of Object.values(state.player.known)) {
    for (const species of observation.fish) if (SUPPORTED_FISH_SET.has(species)) named.add(species);
  }
  return SUPPORTED_FISH_SPECIES.filter((species) => named.has(species)).map((species) => `trap:${species}` as OpportunityKey);
}

export function knownForageOpportunityKeys(state: GameState, world: World, _cal: Calendar): OpportunityKey[] {
  const known = knownPatches(state.knowledge);
  const hasTerrain = (...terrain: string[]) => known.some((cell) => terrain.includes(cellAt(world, cell).terrain));
  const byWater = (kind: "any" | "sea") => known.some((cell) => neighbours(world, cell).some((next) => kind === "any" ? cellAt(world, next).terrain === "water" : waterKindOf(world, next) === kind));
  const available = new Set<FoodId>();
  if (hasTerrain("bog", "meadow")) available.add("berries");
  if (hasTerrain("bog", "meadow") || byWater("any")) available.add("eggs");
  if (hasTerrain("pine")) available.add("barkFlour");
  if (hasTerrain("bog", "meadow") || byWater("any")) available.add("cookedRoots");
  if (byWater("sea")) available.add("seaweed");
  return SUPPORTED_FORAGE_FOODS.filter((food) => available.has(food) && FORAGE_TASK[food] !== undefined).map((food) => `forage:${food}` as OpportunityKey);
}

/**
 * What the survivor's own ground and skill make possible. Ground mapped
 * after a run is under way is news; ground a run or a save opens with is
 * not, and the boundaries that hand over that ground ask for silence.
 */
export function discoverAvailableOpportunities(state: GameState, world: World, cal: Calendar, announce = true): OpportunityKey[] {
  const keys = [
    ...knownForageOpportunityKeys(state, world, cal),
    ...knownTrapOpportunityKeys(state),
    ...knownCapabilityOpportunityKeys(state),
  ];
  return discoverMany(state.opportunities, keys, state.minute, announce);
}

export function eventDiscoveryKeys(event: OpportunityEvent, state?: GameState): OpportunityKey[] {
  if (event.kind === "speciesSeen") return [`track:${event.species}`];
  if (event.kind === "waterRead") {
    const fish = event.species.filter((species) => SUPPORTED_FISH_SET.has(species));
    const trapKnown = state !== undefined && capabilityLevel(state, "fishing") >= 5;
    return [...fish.map((species) => `catch:${species}` as OpportunityKey), ...(trapKnown ? fish.map((species) => `trap:${species}` as OpportunityKey) : [])];
  }
  return [];
}
