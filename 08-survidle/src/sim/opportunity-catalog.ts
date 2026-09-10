import { cellAt, neighbours, waterKindOf, type World } from "../world/gen";
import type { Calendar } from "./calendar";
import { STRUCTURES, TOOLS, type FoodId } from "./items";
import { SPECIES_DEFS, type Species } from "./species";
import type {
  GameState, OpportunityCategory, OpportunityDef, OpportunityEvent,
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
  ...SEASONS.map((season): OpportunityDef => ({ key: `season:${season}`, title: `Live through ${season}`, category: "exploration", group: "seasons", steps: one("season", `Live into ${season}`, (event) => event.kind === "season" && event.season === season ? 1 : 0) })),
];

let AUTHORED_OPPORTUNITIES: OpportunityDef[] = [];
const DEFS = new Map(COLLECTION_OPPORTUNITIES.map((def) => [def.key, def]));

export function registerAuthoredOpportunityDefs(defs: readonly OpportunityDef[]): void {
  AUTHORED_OPPORTUNITIES = [...defs];
  for (const def of defs) DEFS.set(def.key, def);
}

export function allOpportunityDefs(): OpportunityDef[] {
  const authored = new Set(AUTHORED_OPPORTUNITIES.map((def) => def.key));
  return [...AUTHORED_OPPORTUNITIES, ...COLLECTION_OPPORTUNITIES.filter((def) => !authored.has(def.key))];
}

export function catalogOpportunityDef(key: OpportunityKey): OpportunityDef | undefined {
  return DEFS.get(key);
}

export function discoverMany(state: OpportunityState, keys: readonly OpportunityKey[], minute: number): OpportunityKey[] {
  const discovered: OpportunityKey[] = [];
  for (const key of keys) {
    if (!DEFS.has(key) || state.discoveredAt[key] !== undefined) continue;
    state.discoveredAt[key] = minute;
    discovered.push(key);
  }
  if (state.current === null && discovered.length === 1) {
    state.current = discovered[0];
    state.lastCategory = DEFS.get(discovered[0])?.category ?? state.lastCategory;
  }
  if (discovered.length) state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: [], completedGroups: [], discovered, messages: [] });
  return discovered;
}

const capabilityLevel = (state: GameState, skill: SkillId): number => Math.min(50, 1 + Math.floor(Math.sqrt(Math.max(0, state.skills[skill].xp) / 120)));
const TOOL_TIER: Partial<Record<ToolId, { skill: SkillId; level: number }>> = {
  bow: { skill: "crafting", level: 5 }, stoneAxe: { skill: "crafting", level: 5 }, flakedAxe: { skill: "crafting", level: 5 },
};
const STRUCTURE_TIER: Partial<Record<StructureId, { skill: SkillId; level: number }>> = {
  cabin: { skill: "building", level: 10 }, turfHut: { skill: "building", level: 5 },
};

export function availableToolOpportunityKeys(state: GameState, _world: World, _cal: Calendar): OpportunityKey[] {
  return SUPPORTED_TOOL_RECIPES.map((recipe) => TOOL_RECIPE[recipe]).filter((tool) => {
    const tier = TOOL_TIER[tool];
    return !tier || capabilityLevel(state, tier.skill) >= tier.level;
  }).map((tool) => `make:${tool}` as OpportunityKey);
}

export function availableStructureOpportunityKeys(state: GameState, _world: World, _cal: Calendar): OpportunityKey[] {
  return SUPPORTED_SHELTER_STRUCTURES.filter((structure) => {
    const tier = STRUCTURE_TIER[structure];
    return !tier || capabilityLevel(state, tier.skill) >= tier.level;
  }).map((structure) => `build:${structure}` as OpportunityKey);
}

export function knownForageOpportunityKeys(state: GameState, world: World, _cal: Calendar): OpportunityKey[] {
  const known = Object.keys(state.mapped).map(Number);
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

export function discoverAvailableOpportunities(state: GameState, world: World, cal: Calendar): OpportunityKey[] {
  const keys = [
    ...availableToolOpportunityKeys(state, world, cal),
    ...availableStructureOpportunityKeys(state, world, cal),
    ...knownForageOpportunityKeys(state, world, cal),
  ];
  return discoverMany(state.opportunities, keys, state.minute);
}

export function eventDiscoveryKeys(event: OpportunityEvent, state?: GameState): OpportunityKey[] {
  if (event.kind === "waterRead") {
    const fish = event.species.filter((species) => SUPPORTED_FISH_SET.has(species));
    const trapKnown = state !== undefined && capabilityLevel(state, "fishing") >= 5;
    return [...fish.map((species) => `catch:${species}` as OpportunityKey), ...(trapKnown ? fish.map((species) => `trap:${species}` as OpportunityKey) : [])];
  }
  if (event.kind === "toolAvailable") return [`make:${event.tool}`];
  if (event.kind === "structureAvailable") return [`build:${event.structure}`];
  return [];
}
