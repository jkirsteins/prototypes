import { cellAt, neighbours, waterKindOf, type World } from "../world/gen";
import { type KnowledgeChunks, knowledgeWrites, knownPatches } from "./fineknowledge";
import type { Calendar } from "./calendar";
import { RECIPES, STRUCTURES, TOOLS, type FoodId } from "./items";
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

/**
 * The recipes that are not tools but are still Do rows, so they still need
 * an opportunity to reveal them. Cordage and a torch are handwork, wedges
 * and arrows are consumables, and the six clothing recipes are what a hide
 * becomes. Keyed `make:<recipe>` like the tools; the tool keys are recipe
 * ids too, since TOOL_RECIPE is an identity map.
 */
export const SUPPORTED_CRAFT_RECIPES = ["cordage", "torch", "arrows", "snare", "wedges", "basketTrap", "hideCoat", "hideTrousers", "hideBoots", "furHat", "furMittens", "hideBlanket"] as const satisfies readonly RecipeId[];

/**
 * The structures a camp is made of rather than sheltered by. The five in
 * SUPPORTED_SHELTER_STRUCTURES are roofs; these are the fire site, the
 * woodshed, the rack, the snare, the seep and the trough.
 */
export const SUPPORTED_CAMP_STRUCTURES = ["firePit", "vedbod", "dryingRack", "snare", "seep", "waterStore"] as const satisfies readonly StructureId[];
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
const campStructureKeys = () => SUPPORTED_CAMP_STRUCTURES.map((structure) => `build:${structure}` as OpportunityKey);
const toolKeys = () => SUPPORTED_TOOL_RECIPES.map((recipe) => `make:${TOOL_RECIPE[recipe]}` as OpportunityKey);
const craftKeys = () => SUPPORTED_CRAFT_RECIPES.map((recipe) => `make:${recipe}` as OpportunityKey);
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
  { id: "build-camp", title: "Build up a camp", category: "camp", keys: campStructureKeys() },
  { id: "make-tools", title: "Make tools", category: "mastery", keys: toolKeys() },
  { id: "make-craft", title: "Make cordage, clothing and tackle", category: "mastery", keys: craftKeys() },
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
  // Credited off `crafted` rather than `toolMade`: none of these is a tool,
  // so nothing would ever tick a toolMade step for them.
  ...SUPPORTED_CRAFT_RECIPES.map((recipe): OpportunityDef => {
    const title = `Make ${RECIPES[recipe].name}`;
    return { key: `make:${recipe}`, title, category: "mastery", group: "make-craft", steps: one("make", title, (event) => event.kind === "crafted" && event.recipe === recipe ? 1 : 0) };
  }),
  ...SUPPORTED_CAMP_STRUCTURES.map((structure): OpportunityDef => ({
    key: `build:${structure}`, title: `Build ${STRUCTURES[structure].name}`, category: "camp",
    group: "build-camp", steps: one("build", `Build ${STRUCTURES[structure].name}`, built(structure)),
    // The fire site is the second rung of the opening: it follows the camp
    // the way drink used to, and firewood and the fire follow it. The vedbod
    // arrives with the firewood goal: a player gathering ten kilos of dry
    // wood is the player asking how to keep it dry, and the answer has to
    // be on the board while the wood is, not once cordage happens to be.
    ...(structure === "firePit" ? { prerequisites: ["site" as OpportunityKey] } : structure === "vedbod" ? { prerequisites: ["build:firePit" as OpportunityKey] } : {}),
  })),
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
/** Discovered, not done, and something to do rather than something told. */
const openGoal = (state: OpportunityState, key: OpportunityKey): boolean =>
  state.discoveredAt[key] !== undefined && state.completedAt[key] === undefined && DEFS.has(key) && !DEFS.get(key)?.fyi;

/**
 * Something open is current whenever something open exists.
 *
 * Current used to be set only when exactly one new goal arrived, so two
 * arriving together - the fire and the firewood, both after the pit - left
 * it empty once the first was done: "No current opportunity" beside a
 * half-ticked "Light a fire". A goal the player is being offered right now
 * (`prefer`: the discoveries of a notice) steps forward first; failing
 * that, the authored spine's earliest open goal, since that is the order
 * the run was written in; failing that, the oldest open goal from the
 * catalogue. The player can still choose another from the catalogue.
 */
export function settleCurrent(state: OpportunityState, prefer: readonly OpportunityKey[] = []): void {
  if (state.current !== null && state.completedAt[state.current] === undefined) return;
  const offered = prefer.filter((key) => openGoal(state, key));
  const authored = AUTHORED_OPPORTUNITIES.map((def) => def.key).filter((key) => openGoal(state, key));
  const collected = (Object.keys(state.discoveredAt) as OpportunityKey[])
    .filter((key) => openGoal(state, key))
    .sort((a, b) => (state.discoveredAt[a] ?? 0) - (state.discoveredAt[b] ?? 0));
  state.current = offered[0] ?? authored[0] ?? collected[0] ?? null;
  if (state.current) state.lastCategory = DEFS.get(state.current)?.category ?? state.lastCategory;
}

export function discoverMany(state: OpportunityState, keys: readonly OpportunityKey[], minute: number, announce = true): OpportunityKey[] {
  const discovered: OpportunityKey[] = [];
  for (const key of keys) {
    const def = DEFS.get(key);
    if (!def || state.discoveredAt[key] !== undefined) continue;
    state.discoveredAt[key] = minute;
    if (def.fyi) state.completedAt[key] ??= minute;
    discovered.push(key);
  }
  if (!announce) return discovered;
  // One arrival is the answer; several are a choice the notice offers, and
  // the choice left unmade settles when the notice is dismissed.
  const doable = discovered.filter((key) => !DEFS.get(key)?.fyi);
  if (doable.length === 1) settleCurrent(state, doable);
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

  // Bark is the first thing a pair of hands turns into something else, and
  // cordage is what half the recipes below want, so it opens the moment
  // there is bark to twist.
  if (holds(state, "bark")) keys.push("make:cordage", "make:torch");
  // Knife work. Each of these is a stick or a stone with an edge taken to
  // it, and none of them is a prospect until the edge exists.
  if (knife) keys.push("make:wedges", "make:arrows", "make:snare", "make:basketTrap");
  // A hide is the whole clothing branch. Sewing also wants a needle, but
  // the hide is what makes the branch worth knowing about: a player holding
  // one should learn a coat is possible and then go find the needle.
  if (holds(state, "hide")) {
    keys.push("make:hideCoat", "make:hideTrousers", "make:hideBoots", "make:hideBlanket");
  }
  if (holds(state, "fur") || holds(state, "hide")) keys.push("make:furHat", "make:furMittens");

  // A camp is the ground these stand on, so none of them means anything
  // before there is one. The fire site comes with the camp itself; the rest
  // wait for the material or the tool that builds them.
  if (camp && holds(state, "cordage")) keys.push("build:dryingRack");
  if (camp && holds(state, "snare")) keys.push("build:snare");
  if (camp && holds(state, "barkBucket")) keys.push("build:seep", "build:waterStore");
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

/**
 * What the known ground is made of, read in one pass and kept until the
 * ground changes.
 *
 * This used to be read six times per call - four terrain scans and two
 * water scans, each walking every known patch through `cellAt`, which
 * resolves fine chunks and churns the chunk cache - and the call came on
 * every look the survivor took. Inside a forecast that is every simulated
 * hour of every run of every horizon: profiled at 19% of a two-minute
 * trace, with `fineChunkFor` alone at 11% self time, and a heap that rose
 * by 130 MB on each real hour's forecast. Safari reloaded the tab for it.
 *
 * `knowledgeWrites` moves on every change to any patch's level, so a
 * summary stamped with it is exact: the same ground reads the same, and
 * new ground reads again. Keyed on the knowledge object too, so a
 * forecast's clone never answers for the live state.
 */
interface GroundSummary { gen: number; terrains: Set<string>; byWater: boolean; bySea: boolean }
const groundSummaries = new WeakMap<KnowledgeChunks, GroundSummary>();

function groundSummary(state: GameState, world: World): GroundSummary {
  const gen = knowledgeWrites();
  const hit = groundSummaries.get(state.knowledge);
  if (hit && hit.gen === gen) return hit;
  const terrains = new Set<string>();
  let byWater = false;
  let bySea = false;
  for (const cell of knownPatches(state.knowledge)) {
    terrains.add(cellAt(world, cell).terrain);
    if (byWater && bySea) continue;
    for (const next of neighbours(world, cell)) {
      if (!byWater && cellAt(world, next).terrain === "water") byWater = true;
      if (!bySea && waterKindOf(world, next) === "sea") bySea = true;
    }
  }
  const out = { gen, terrains, byWater, bySea };
  groundSummaries.set(state.knowledge, out);
  return out;
}

export function knownForageOpportunityKeys(state: GameState, world: World, _cal: Calendar): OpportunityKey[] {
  // Nothing left to find means nothing to scan for: once every forage the
  // catalogue supports is discovered, which most runs reach in their first
  // hour, this costs a handful of lookups and no walk over the ground.
  const wanted = SUPPORTED_FORAGE_FOODS.filter((food) => FORAGE_TASK[food] !== undefined && state.opportunities.discoveredAt[`forage:${food}`] === undefined);
  if (wanted.length === 0) return [];
  const ground = groundSummary(state, world);
  const has = (...terrain: string[]) => terrain.some((t) => ground.terrains.has(t));
  const available = new Set<FoodId>();
  if (has("bog", "meadow")) available.add("berries");
  if (has("bog", "meadow") || ground.byWater) available.add("eggs");
  if (has("pine")) available.add("barkFlour");
  if (has("bog", "meadow") || ground.byWater) available.add("cookedRoots");
  if (ground.bySea) available.add("seaweed");
  return wanted.filter((food) => available.has(food)).map((food) => `forage:${food}` as OpportunityKey);
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
