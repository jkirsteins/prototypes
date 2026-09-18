import { dayNumber } from "./calendar";
import { qty } from "./inventory";
import { type FoodId, RECIPES } from "./items";
import {
  allOpportunityDefs, catalogOpportunityDef, DAY_ONE_CAPABILITY_KEYS, eventDiscoveryKeys, settleCurrent,
  OPPORTUNITY_GROUPS, registerAuthoredOpportunityDefs, SEASONS,
} from "./opportunity-catalog";
import { straightKm } from "./position";
import { current } from "./record";
import { gainedForecastFact } from "./weather";
import type { World } from "../world/gen";
import type { GameState, ItemId, OpportunityCategory, OpportunityDef, OpportunityEvent, OpportunityGroupDef, OpportunityGroupId, OpportunityKey, OpportunityState, OpportunityStepDef, RecipeId, Season, StaticOpportunityId, StructureId, TaskId, WeatherOpportunityContext } from "./types";
export type { OpportunityKey, OpportunityEvent, StormPlanSnapshot, StormPlanOption, StormPlanInputs, StormOptionKind, FoodMethod } from "./types";
import type { FoodMethod } from "./types";
export { allOpportunityDefs, discoverAvailableOpportunities, OPPORTUNITY_CATEGORIES, OPPORTUNITY_GROUPS, SEASONS } from "./opportunity-catalog";

const task = (...ids: TaskId[]) => (d: OpportunityEvent) => ((d.kind === "task" || d.kind === "taskCompleted") && ids.includes(d.id) ? 1 : 0);
const lit = (d: OpportunityEvent) => d.kind === "lit" || d.kind === "fireLit" ? 1 : 0;
const built = (...ids: StructureId[]) => (d: OpportunityEvent) => (d.kind === "built" && ids.includes(d.structure) ? 1 : 0);
const roof = (d: OpportunityEvent) => d.kind === "protectionChanged"
  ? (d.from < 2 && d.to >= 2 ? 1 : 0)
  : d.kind === "sheltered"
    ? (d.protection >= 2 ? 1 : 0)
    : built("leanTo", "turfHut", "snowShelter", "cabin")(d);

/**
 * The kilos of dry firewood a gather produced. Wet wood is not counted: the
 * goal below it is lighting a fire, and a bar that filled on ten kilos of wet
 * wood told the player they had what the fire wanted while every light refused
 * them. Wet wood dries into this same item, so the bar fills either way - it
 * just waits until the wood can do the job the goal is naming.
 */
const firewoodKg = (d: OpportunityEvent) => (d.kind === "gathered" && d.item === "firewood" ? d.kg : 0);
const awaitingContext = (_d: OpportunityEvent) => 0;

const one = (id: string, label: string, credit: OpportunityStepDef["credit"], target = 1, unit?: string): OpportunityStepDef[] => [
  { id, label, credit, target, unit, final: true },
];
const step = (id: string, label: string, credit: OpportunityStepDef["credit"], target = 1, unit?: string): OpportunityStepDef => ({ id, label, credit, target, unit });
const crafted = (recipe: RecipeId) => (d: OpportunityEvent) => (d.kind === "crafted" && d.recipe === recipe ? 1 : 0);
/**
 * Having the thing, however it was come by. Crafting is the usual way and
 * still credits on the spot, but the event alone was not enough: it only
 * counts against goals already open, so a drill made before "Light a fire"
 * was discovered banked nothing, and an heir who inherits that drill could
 * never tick a step telling them to make one. Goals outlive survivors; what
 * they ask for has to be readable off the world rather than off a life.
 */
const made = (recipe: RecipeId) => {
  const item = RECIPES[recipe].out.item;
  return (d: OpportunityEvent, held?: ReadonlySet<ItemId>) => (crafted(recipe)(d) || (item && held?.has(item)) ? 1 : 0);
};
const acquired = (method?: FoodMethod) => (d: OpportunityEvent) => (d.kind === "foodAcquired" && (!method || d.method === method) ? 1 : 0);
/** The food methods that keep producing: a source is a thing that goes on feeding you, not the first handful you pick. */
const LASTING_METHODS: FoodMethod[] = ["snare", "trap", "hunt", "fish"];
const lastingSource = (d: OpportunityEvent) => (d.kind === "foodAcquired" && LASTING_METHODS.includes(d.method) ? 1 : 0);
const ate = (...items: (FoodId | "sap")[]) => (d: OpportunityEvent) => (d.kind === "ate" && items.includes(d.item) ? 1 : 0);
const preparedMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "cookedMeat", "cookedFish", "cookedOilyFish", "fat", "roe", "driedMeat", "sap");
const gatheredMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "sap");
/** What a cook produced, for a step that says to eat the meal it just made: raw berries are not that meal. */
const cookedMeal = ate("cookedRoots", "cookedMeat", "cookedFish", "cookedOilyFish", "barkFlour");
/** The foods that are only there for part of the year, for the step that says to eat the seasonal one. */
const seasonalMeal = ate("berries", "roe", "eggs", "sap", "cookedRoots", "seaweed");
const cookedMeat = ate("cookedMeat");
const cookedFish = ate("cookedFish", "cookedOilyFish");

/** The firewood opportunity's target, in kilos: named once so the title can never drift from the number the bar checks. */
const FIREWOOD_KG = 10;

export const WINTER_DRIED_MEAT_KG = 80;
export const WINTER_FAT_KG = 20;
export const WINTER_FIREWOOD_KG = 600;
export const WINTER_LOGS = 300;

export function winterStoreProgress(state: GameState): { food: boolean; fuel: boolean } {
  const st = state.regions[state.player.region];
  const inv = st?.campCell === null || st?.campCell === undefined ? undefined : state.piles[st.campCell];
  const food = Boolean(inv && qty(inv, "driedMeat") >= WINTER_DRIED_MEAT_KG && qty(inv, "fat") >= WINTER_FAT_KG);
  const fuel = Boolean(inv && qty(inv, "firewood") + (st?.fire.fuelKg ?? 0) >= WINTER_FIREWOOD_KG && qty(inv, "log") >= WINTER_LOGS);
  return { food, fuel };
}

export function checkWinterStores(state: GameState): void {
  const progress = winterStoreProgress(state);
  if (progress.food && progress.fuel) recordOpportunityEvent(state, { kind: "winterStocked" });
}

/** The keeping opportunity's target, in days: named once so the title can never drift from the number the credit checks. */
export const KEPT_DAYS = 3;

const NOTES: Partial<Record<StaticOpportunityId, string>> = {
  // Each says why the thing matters to a body, in the words a person would
  // use, and stops there: the how is the row's, the numbers are the bars'.
  site: "Everything you build, store and come back to is at this spot. Choose it for water close by and wood within a walk.",
  drink: "Thirst kills faster than hunger. Below a litre in the body, Self-care drinks from what is at hand or walks to water when the queue lets it.",
  firewood: "Dead wood burns without felling a tree. Gathered in rain or snow it comes back wet, and only dry wood lights: the wet dries beside a burning fire, or under a vedbod's roof, and rots out in the open.",
  fire: "A fire is warmth at night, dry clothes, cooked food and melted snow. It wants a cleared site, a kilo of dry wood laid in it, and a drill to catch.",
  bed: "The ground pulls the warmth out of a sleeper all night. Boughs under you keep it, and you wake rested instead of chilled.",
  roof: "Rain on the body takes its warmth twice as fast as cold air. A roof keeps you dry through a night you would otherwise sit out shivering.",
  forageMeal: "What the ground gives is the food that costs no chase. Some of it must be cooked before it can be eaten.",
  cook: "Raw meat, fish, fat and roots sit badly or not at all. A fire turns them into a meal.",
  findUsefulCover: "A hollow, a thicket or a lee breaks the wind long before anything is built, and a storm does not wait for the building.",
  makeUsefulShelter: "Cover you found can be made better with what is at hand, and where there is none a shelter can be raised from the ground up.",
  testShelter: "A shelter is only as good as the night it keeps off you. Rain is the test.",
  keptNight: "A fire fed through the night is a warm night; one left to itself is coals by midnight and cold by dawn.",
  snareMeal: "A snare hunts while you do other things. It only feeds you if someone walks out to check it.",
  huntMeal: "A hunt can come home with nothing. When it does not, it is the biggest meal there is.",
  fishMeal: "Fish are the surest food by open water, and the fat in them is what lean meat lacks.",
  trapMeal: "A basket trap fishes while you sleep. Left too long, what it caught is lost.",
  firstOrder: "A standing order is work the survivor keeps doing on their own: the way to have wood and water without asking every day.",
  water: "Water kept at camp is a night without a walk to the shore, and a thirst answered where you lie.",
  readWeather: "The sky says what is coming hours ahead, if you look. A warning you read in time is a plan; one you did not is a soaking.",
  prepareWeather: "Weather you know is coming is weather you can be under a roof for, with the fire fed and the wood in.",
  surviveForecast: "Come through the storm you saw coming. That is what the reading and the preparing were for.",
  keptDays: "A fire kept for days is a camp that stays warm and dry whatever the weather does. It costs wood every hour.",
  foodSource: "One good meal is a day. A source that gives again, or gives while you are elsewhere, is the way to a season.",
  store: "Raw meat rots in days. Dried, it keeps for months, and a full rack is winter half answered.",
  fat: "Lean meat alone starves a body however much of it you eat. Fat, fish or fatty game is what it needs.",
  longOrder: "A longer order runs on without you at the screen: the difference between playing every hour and coming back to find the work done.",
  toolCare: "A tool wears with use and breaks at the worst time. Honing, mending or a spare keeps the work going.",
  explore: "Another region has other ground, other game and other food. What is scarce here may be common there.",
  remoteRefuge: "A shelter away from home is the range you can use in bad weather, not only in good.",
  fieldFire: "A fire you can make anywhere is warmth and a hot meal wherever the day ends.",
  fieldMeal: "Cooking away from camp turns what you carry into days of independence.",
  remoteStorm: "With a refuge you know and a sky you can read, weather far from home is something you ride out, not something you run from.",
  secondCamp: "A second camp is a second country: its own water, wood and game, and somewhere to be when the first is used up or snowed in.",
  seasonalFood: "Some foods come for a few weeks and are gone. Taking them when they are there is the difference between a lean month and a fed one.",
  durableRoof: "A lean-to sags and leaks in a season. Turf or logs stand through the winter.",
  winterStores: "Winter gives almost nothing. It is fed and warmed from what was put by before it, food and fuel both.",
  preserveHunt: "One animal is more meat than a body can eat before it turns. Dried, it is a month.",
};

export const OPPORTUNITIES: OpportunityDef[] = [
  { key: "site", title: "Choose where to live", category: "survival", steps: one("camp", "Make camp", task("makeCamp")) },
  // An FYI, not a goal: the self-care row drinks on its own, and a goal
  // that asked for it held the fire behind it. Told once, with the camp.
  { key: "drink", title: "Water", category: "survival", fyi: true, steps: [], prerequisites: ["site"] },
  { key: "firewood", title: `Gather ${FIREWOOD_KG} kg of dry firewood`, category: "survival", steps: one("wood", `Gather ${FIREWOOD_KG} kg, dry`, firewoodKg, FIREWOOD_KG, "kg"), prerequisites: ["build:firePit"] },
  { key: "fire", title: "Light a fire", category: "survival", steps: [
      // Every step names a row in the Do panel, in the order the rows come
      // due. "Provide fuel" named no row at all and could only be met by the
      // lighting it was listed above, which left a player with a site, a
      // drill and ten kilos of wood reading a checklist they could not act on.
      // The fire site is not a step here: it is the rung before firewood,
      // so it is always built before this goal opens, and a step credited
      // by the building event alone could then never be ticked.
      step("fuel", "Lay wood at the fire site", (d) => (d.kind === "fuelled" ? 1 : 0)),
      step("ignition", "Have a fire drill", made("fireDrill")),
      { ...step("light", "Light the fire", lit), final: true },
    // Beside the firewood goal, not behind it. Wood gathered in snow is wet
    // and dries by a lit fire, so a fire held behind ten dry kilos was a
    // landing that could never light one: the rows to light it were hidden
    // until a goal that needed them lit was met.
    ], prerequisites: ["build:firePit"] },
  { key: "bed", title: "Get off the cold ground", category: "survival", steps: one("bed", "Build a bed", built("boughBed")), prerequisites: ["fire"] },
  { key: "roof", title: "Put a roof over your head", category: "survival", steps: one("roof", "Build a roof", roof), prerequisites: ["fire"] },
  { key: "forageMeal", title: "Forage and eat a meal", category: "food", steps: [step("gather", "Gather edible food", acquired("forage")), { ...step("eat", "Eat gathered food", gatheredMeal), final: true }], prerequisites: ["bed","roof","keptNight"] },
  { key: "cook", title: "Prepare and eat a hot meal", category: "food", steps: [step("cook", "Cook food", (d) => (d.kind === "cooked" && d.kg > 0 ? 1 : 0)), { ...step("eat", "Eat the meal", cookedMeal), final: true }], prerequisites: ["bed","roof","keptNight"] },
  { key: "findUsefulCover", title: "Find useful cover", category: "weather", steps: one("cover", "Find useful cover", (d) => (d.kind === "protectionChanged" && d.source === "found" && d.to > d.from && d.to >= 1 ? 1 : 0)), prerequisites: ["forageMeal","cook"] },
  { key: "makeUsefulShelter", title: "Turn the ground into shelter", category: "weather", steps: one("shelter", "Reach weatherproof protection", awaitingContext), prerequisites: ["findUsefulCover"] },
  { key: "testShelter", title: "Put shelter to the test", category: "weather", steps: one("storm", "Weather the offered rain", awaitingContext), prerequisites: ["makeUsefulShelter"] },
  { key: "keptNight", title: "Keep the fire alive overnight", category: "survival", steps: one("night", "Keep the fire alive until dawn", (d) => (d.kind === "keptNight" ? 1 : 0)), prerequisites: ["fire"] },
  { key: "snareMeal", title: "Eat from a snare", category: "food", steps: [step("make", "Make a snare", made("snare")), step("set", "Set a snare", built("snare")), step("catch", "Collect its catch", acquired("snare")), { ...step("eat", "Eat cooked meat", cookedMeat), final: true }], prerequisites: ["remoteStorm"] },
  { key: "huntMeal", title: "Hunt, cook, and eat meat", category: "food", steps: [
      step("bow", "Make a bow", made("bow")),
      step("arrows", "Make arrows", made("arrows")),
      step("sign", "Find fresh animal sign", (d) => (d.kind === "signFound" ? 1 : 0)),
      step("recover", "Bring meat back to camp", (d) => (d.kind === "recoveredAtCamp" ? 1 : 0)),
      { ...step("eat", "Eat cooked meat", cookedMeat), final: true },
    ], prerequisites: ["remoteStorm"] },
  { key: "fishMeal", title: "Catch, cook, and eat fish", category: "food", steps: [step("spear", "Make a fishing spear", made("fishingSpear")), step("catch", "Catch fish", acquired("fish")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }], prerequisites: ["remoteStorm"] },
  { key: "trapMeal", title: "Eat from a basket trap", category: "food", steps: [step("make", "Make a basket trap", made("basketTrap")), step("set", "Set the trap", task("setTrap")), step("catch", "Collect fish", acquired("trap")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "firstOrder", title: "Give a standing camp order", category: "mastery", steps: one("order", "Give a standing order", (d) => (d.kind === "ordered" && ["deadwood", "split", "splitWedges", "chop", "fill", "melt"].includes(d.task) ? 1 : 0)), prerequisites: ["fat"] },
  { key: "water", title: "Keep water at camp", category: "camp", steps: one("source", "Establish storage or a camp source", built("waterStore", "seep")), prerequisites: ["fat"] },
  { key: "readWeather", title: "Read approaching weather", category: "weather", steps: one("read", "Learn a new forecast fact", awaitingContext), prerequisites: ["testShelter"], notBeforeDay: 8 },
  { key: "prepareWeather", title: "Prepare for what is coming", category: "weather", steps: one("plan", "Have a viable plan at onset", awaitingContext), prerequisites: ["readWeather"], notBeforeDay: 8 },
  { key: "surviveForecast", title: "Come through the forecast storm", category: "weather", steps: one("survive", "Survive the forecast storm", awaitingContext), prerequisites: ["prepareWeather"], notBeforeDay: 8 },
  { key: "keptDays", title: "Keep a fire burning for three days", category: "survival", steps: one("fire", "Keep one fire alive for three days", (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0)), prerequisites: ["fat"] },
  { key: "foodSource", title: "Find a lasting food source", category: "food", steps: [step("source", "Establish a repeatable or passive source", lastingSource), { ...step("eat", "Eat from that source", preparedMeal), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "store", title: "Put food by for later", category: "food", steps: [step("preserve", "Preserve food", (d) => (d.kind === "preserved" ? 1 : 0)), { ...step("eat", "Eat preserved food", ate("driedMeat")), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "fat", title: "Find food with fat", category: "food", steps: one("fat", "Eat food containing fat", (d) => (d.kind === "ateFat" ? 1 : 0)), prerequisites: ["trapMeal","foodSource","store","preserveHunt"] },
  { key: "longOrder", title: "Try a longer order", category: "mastery", steps: one("order", "Give a grind or keep order", (d) => (d.kind === "ordered" && d.long ? 1 : 0)), prerequisites: ["firstOrder","water","keptDays"] },
  { key: "toolCare", title: "Keep a tool working", category: "mastery", steps: one("care", "Restore or replace a tool", (d) => (d.kind === "toolCared" ? 1 : 0)), prerequisites: ["firstOrder","water","keptDays"] },
  { key: "remoteRefuge", title: "Prepare a refuge beyond home", category: "weather", steps: one("refuge", "Prepare shelter in another region", awaitingContext), prerequisites: ["surviveForecast"], notBeforeDay: 31 },
  { key: "fieldFire", title: "Light a fire away from camp", category: "weather", steps: one("fire", "Light away from camp", awaitingContext), prerequisites: ["remoteRefuge"], notBeforeDay: 31 },
  { key: "fieldMeal", title: "Make a meal away from camp", category: "weather", steps: one("meal", "Cook at a field fire", awaitingContext), prerequisites: ["fieldFire"], notBeforeDay: 31 },
  { key: "remoteStorm", title: "Ride out weather beyond home", category: "weather", steps: one("storm", "Weather the storm beyond home", awaitingContext), prerequisites: ["fieldMeal"], notBeforeDay: 31 },
  { key: "explore", title: "Explore another region", category: "exploration", steps: one("explore", "Explore another region", (d) => (d.kind === "explored" && d.anotherRegion ? 1 : 0)), prerequisites: ["longOrder","toolCare"] },
  { key: "secondCamp", title: "Establish a second camp", category: "camp", steps: one("camp", "Make camp in another region", (d) => (d.kind === "campedAgain" ? 1 : 0)), prerequisites: ["explore"] },
  { key: "seasonalFood", title: "Try a seasonal food", category: "food", steps: [step("gather", "Gather seasonal food", (d) => (d.kind === "seasonalFood" ? 1 : 0)), { ...step("eat", "Eat seasonal food", seasonalMeal), final: true }], prerequisites: ["explore"] },
  { key: "durableRoof", title: "Build lasting shelter", category: "camp", steps: one("roof", "Build a turf hut or cabin", built("turfHut", "cabin")), prerequisites: ["explore"] },
  { key: "winterStores", title: "Prepare stores for winter", category: "food", steps: one("stores", "Store food and fuel", (d) => (d.kind === "winterStocked" ? 1 : 0)), prerequisites: ["secondCamp","seasonalFood","durableRoof"] },
  { key: "preserveHunt", title: "Preserve meat from a hunt", category: "food", prerequisites: ["snareMeal", "huntMeal", "fishMeal"], steps: [step("hunt", "Hunt any animal", (event) => event.kind === "animalKilled" ? 1 : 0), { ...step("preserve", "Preserve meat", (event) => event.kind === "preserved" ? 1 : 0), final: true }] },
];
for (const def of OPPORTUNITIES) def.note = NOTES[def.key as StaticOpportunityId];
// Lived through, not achieved: an FYI, so it never stands in front of
// anything. The seasons are seeded known from the first minute regardless.
for (const season of SEASONS) OPPORTUNITIES.push({ key: `season:${season}`, title: `Live through ${season}`, category: "exploration", group: "seasons", fyi: true, steps: [] });
const defs = new Map(OPPORTUNITIES.map((def) => [def.key, def]));
registerAuthoredOpportunityDefs(OPPORTUNITIES);
export function newOpportunities(season: Season): OpportunityState {
  const state: OpportunityState = {
    discoveredAt: {}, completedAt: {}, stepProgress: {}, current: null,
    notices: [], nextNoticeId: 1, context: { weather: null, chapter3HomeRegion: null }, lastCategory: "survival", lastSeason: season,
  };
  for (const value of SEASONS) discoverOpportunity(state, `season:${value}`, 0, false);
  for (const key of DAY_ONE_CAPABILITY_KEYS) discoverOpportunity(state, key, 0, false);
  discoverOpportunity(state, "site", 0, true);
  state.current = "site";
  return state;
}

export function opportunityDef(key: OpportunityKey): OpportunityDef | undefined {
  return defs.get(key) ?? catalogOpportunityDef(key);
}

export function opportunityStepDefs(key: OpportunityKey): OpportunityStepDef[] {
  return opportunityDef(key)?.steps ?? [];
}

export function opportunityEligible(def: OpportunityDef, minute: number): boolean {
  return def.notBeforeDay === undefined || dayNumber(minute) >= def.notBeforeDay;
}

/** The lessons a chapter carries once its first leaf has been introduced. */
const AFTER_READ_WEATHER = new Set<OpportunityKey>(["prepareWeather", "surviveForecast"]);
const AFTER_REMOTE_REFUGE = new Set<OpportunityKey>(["fieldFire", "fieldMeal", "remoteStorm"]);

/** First entry is calendar-gated; the world keeps an opened chapter across heirs. */
function chapterEligible(state: OpportunityState, def: OpportunityDef, minute: number): boolean {
  if (AFTER_READ_WEATHER.has(def.key) && state.discoveredAt.readWeather !== undefined) return true;
  if (AFTER_REMOTE_REFUGE.has(def.key) && state.discoveredAt.remoteRefuge !== undefined) return true;
  return opportunityEligible(def, minute);
}

export function setCurrentOpportunity(state: OpportunityState, key: OpportunityKey | null): boolean {
  // Nothing to do is nothing to be current.
  if (key !== null && opportunityDef(key)?.fyi) return false;
  if (key !== null && (state.discoveredAt[key] === undefined || state.completedAt[key] !== undefined)) return false;
  state.current = key;
  if (key !== null) state.lastCategory = opportunityDef(key)?.category ?? state.lastCategory;
  return true;
}

/** Consume only this presentation; stale clicks cannot select or dismiss another batch. */
export function dismissOpportunityPresentation(state: GameState, noticeId: string, selected: OpportunityKey | null): boolean {
  const opportunities = state.opportunities;
  const index = opportunities.notices.findIndex((notice) => notice.id === noticeId);
  if (index < 0) return false;
  if (selected !== null && (selected === opportunities.current || !opportunities.notices[index].discovered.includes(selected)
    || !opportunityDef(selected) || !setCurrentOpportunity(opportunities, selected))) return false;
  const [notice] = opportunities.notices.splice(index, 1);
  // OK without a choice is not "none of these": the first offered goal
  // stands, so the card never reads empty beside a goal just announced.
  if (selected === null) settleCurrent(opportunities, notice.discovered);
  return true;
}

export function isOpportunityDiscovered(state: OpportunityState, key: OpportunityKey): boolean {
  return state.discoveredAt[key] !== undefined;
}

export function isOpportunityComplete(state: OpportunityState, key: OpportunityKey): boolean {
  return state.completedAt[key] !== undefined;
}

export function discoverOpportunity(state: OpportunityState, key: OpportunityKey, minute: number, announce = true): boolean {
  const def = opportunityDef(key);
  if (!def || state.discoveredAt[key] !== undefined) return false;
  state.discoveredAt[key] = minute;
  // An FYI has nothing to do: told is done, so it never holds a later rung.
  if (def.fyi) state.completedAt[key] ??= minute;
  if (announce) state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: [], completedGroups: [], discovered: [key], messages: [] });
  return true;
}

export interface OpportunityEventResult {
  completed: OpportunityKey[];
  discovered: OpportunityKey[];
  completedGroups: OpportunityGroupId[];
}

export interface OpportunityGroupView extends OpportunityGroupDef {
  done: boolean;
  discovered: OpportunityKey[];
  completed: OpportunityKey[];
}

export function applyOpportunityEvent(
  state: OpportunityState,
  event: OpportunityEvent,
  minute: number,
  contextual?: (completed: OpportunityKey[]) => void,
  discoveryKeys = eventDiscoveryKeys(event),
  held?: ReadonlySet<ItemId>,
): OpportunityEventResult {
  const result: OpportunityEventResult = { completed: [], discovered: [], completedGroups: [] };
  for (const key of Object.keys(state.discoveredAt) as OpportunityKey[]) {
    if (state.completedAt[key] !== undefined) continue;
    const def = opportunityDef(key);
    // Discovery timestamps describe history across lives, whose clocks reset.
    // Only membership gates credit; no past event is ever replayed.
    if (!def) continue;
    // An FYI is told, not done. One left discovered-but-open by a save from
    // before it was an FYI is closed here without a word: it has no steps,
    // so it would otherwise complete on the first event of any kind and
    // announce four seasons lived through on the day a camp was sited.
    if (def.fyi) { state.completedAt[key] = minute; continue; }
    const progress = state.stepProgress[key] ?? {};
    state.stepProgress[key] = progress;
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i];
      if (step.final && def.steps.slice(0, i).some((prior) => (progress[prior.id] ?? 0) + 1e-9 < prior.target)) break;
      const credit = Math.max(0, step.credit(event, held));
      if (credit) progress[step.id] = Math.min(step.target, (progress[step.id] ?? 0) + credit);
    }
    if (def.steps.every((step) => (progress[step.id] ?? 0) + 1e-9 >= step.target)) {
      state.completedAt[key] = minute;
      result.completed.push(key);
    }
  }
  contextual?.(result.completed);
  for (const def of allOpportunityDefs()) {
    const key = def.key;
    if (state.discoveredAt[key] !== undefined || state.completedAt[key] !== undefined || def.prerequisites?.some((pre) => state.completedAt[pre] === undefined)) continue;
    if (!chapterEligible(state, def, minute)) continue;
    if (def.prerequisites) { discoverOpportunity(state, key, minute, false); result.discovered.push(key); }
  }
  for (const key of discoveryKeys) {
    if (discoverOpportunity(state, key, minute, false)) result.discovered.push(key);
  }
  // One arrival is the answer; several are a choice the notice offers, and
  // the choice left unmade settles when the notice is dismissed. Nothing
  // arriving, the spine's next open goal steps forward.
  if (state.current !== null && state.completedAt[state.current] !== undefined) state.current = null;
  const doable = result.discovered.filter((key) => !opportunityDef(key)?.fyi);
  if (doable.length <= 1) settleCurrent(state, doable);
  for (const group of OPPORTUNITY_GROUPS) {
    // A group of nothing but FYIs - the seasons - is never an achievement.
    if (group.keys.every((key) => opportunityDef(key)?.fyi)) continue;
    if (group.keys.length && result.completed.some((key) => group.keys.includes(key)) && group.keys.every((key) => state.completedAt[key] !== undefined)) result.completedGroups.push(group.id);
  }
  if (result.completed.length || result.discovered.length || result.completedGroups.length) {
    state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: result.completed, completedGroups: result.completedGroups, discovered: result.discovered, messages: [] });
  }
  return result;
}

export function opportunityGroupView(state: OpportunityState, id: OpportunityGroupId): OpportunityGroupView {
  const group = OPPORTUNITY_GROUPS.find((candidate) => candidate.id === id) ?? { id, title: id, category: "mastery" as OpportunityCategory, keys: [] };
  return { ...group, done: group.keys.length > 0 && group.keys.every((key) => state.completedAt[key] !== undefined), discovered: group.keys.filter((key) => state.discoveredAt[key] !== undefined), completed: group.keys.filter((key) => state.completedAt[key] !== undefined) };
}

function shelterOpportunity(opportunity: "makeUsefulShelter" | "testShelter", minute: number, area: { region: number; centre: number; radiusKm: 1 }): WeatherOpportunityContext | null {
  return {
    opportunity, status: "reserved", createdAt: minute, attempts: 1,
    stormId: null, source: null, area, announcedAt: null, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    readerIndex: null, plan: null,
  };
}

function fieldOpportunity(minute: number, area: { region: number; centre: number; radiusKm: 1 }): WeatherOpportunityContext | null {
  return {
    opportunity: "remoteStorm", status: "reserved", createdAt: minute, attempts: 1,
    stormId: null, source: null, area, announcedAt: null, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    readerIndex: null, plan: null,
  };
}

/**
 * Everything the survivor could lay a hand on this minute: the tools on their
 * belt, what is in the pack, and what is in the camp pile beside them. A step
 * that asks for a tool reads this, so having one is having one however it
 * arrived - crafted this life, inherited from the last, or left in the pile.
 */
function inReach(state: GameState): ReadonlySet<ItemId> {
  const held = new Set<ItemId>();
  for (const tool of state.player.tools) held.add(tool.id);
  const st = state.regions[state.player.region];
  const invs = [state.player.pack, st?.campCell === null || st?.campCell === undefined ? undefined : state.piles[st.campCell]];
  for (const inv of invs) {
    if (!inv) continue;
    for (const [item, n] of Object.entries(inv.items) as [ItemId, number][]) if (n > 1e-9) held.add(item);
  }
  return held;
}

/** Discovered leaves can earn credit regardless of presentation or current focus. */
export function recordOpportunityEvent(state: GameState, d: OpportunityEvent, world?: World): OpportunityKey[] {
  captureChapterHome(state);
  const known = new Set(Object.keys(state.opportunities.discoveredAt) as OpportunityKey[]);
  const pending = new Set([...known].filter((key) => state.opportunities.completedAt[key] === undefined));
  const result = applyOpportunityEvent(state.opportunities, d, state.minute, (finished) => {
    if (d.kind === "protectionChanged" && finished.includes("findUsefulCover")) {
      state.opportunities.context.weather = shelterOpportunity("makeUsefulShelter", d.minute, { region: d.region, centre: d.cell, radiusKm: 1 });
    }
    if (d.kind === "protectionChanged") {
      const opportunity = state.opportunities.context.weather;
      const area = opportunity?.area;
      if (opportunity?.opportunity === "makeUsefulShelter" && area && world && pending.has("makeUsefulShelter")
        && d.to > d.from && d.to >= 2 && d.region === area.region
        && straightKm(world, area.centre, d.cell) <= area.radiusKm) {
        finishOpportunity(state, "makeUsefulShelter", finished);
        state.opportunities.context.weather = shelterOpportunity("testShelter", d.minute, area);
      }
      if (pending.has("remoteRefuge") && d.to > d.from && d.to >= 2
        && state.opportunities.context.chapter3HomeRegion !== null && d.region !== state.opportunities.context.chapter3HomeRegion) {
        finishOpportunity(state, "remoteRefuge", finished);
        state.opportunities.context.weather = fieldOpportunity(d.minute, { region: d.region, centre: d.cell, radiusKm: 1 });
      }
    }
    if (d.kind === "fireLit" && !d.atCamp) {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "remoteStorm" && opportunity.area && pending.has("fieldFire")) {
        finishOpportunity(state, "fieldFire", finished);
      }
    }
    if (d.kind === "taskCompleted" && d.id === "cook" && !d.atCamp) {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "remoteStorm" && opportunity.area && pending.has("fieldMeal")) {
        finishOpportunity(state, "fieldMeal", finished);
      }
    }
    if (d.kind === "forecastChanged") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "readWeather" && (opportunity.status === "announced" || opportunity.status === "reserved")
        && opportunity.stormId === d.stormId && known.has("readWeather")
        && d.source === "readSky" && gainedForecastFact(d.before, d.after)) {
        opportunity.readerIndex = current(state).index;
        if (pending.has("readWeather")) finishOpportunity(state, "readWeather", finished);
      }
    }
    if (d.kind === "stormStarted") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "readWeather" && opportunity.stormId === d.stormId && d.plan.stormId === d.stormId) {
        opportunity.plan ??= structuredClone(d.plan);
        if (pending.has("prepareWeather") && d.plan.options.some((option) => option.viable)) {
          finishOpportunity(state, "prepareWeather", finished);
        }
      }
    }
    if (d.kind === "stormEnded") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "testShelter" && opportunity.stormId === d.stormId && pending.has("testShelter")
        && d.survivorAlive && d.minutesByProtection[2] + d.minutesByProtection[3] + 1e-9 >= 60) {
        finishOpportunity(state, "testShelter", finished);
      }
      if (opportunity?.opportunity === "readWeather" && opportunity.stormId === d.stormId && pending.has("surviveForecast")
        && d.survivorAlive && opportunity.readerIndex === current(state).index) {
        finishOpportunity(state, "surviveForecast", finished);
      }
      const adequateMinutes = d.stormKind === "snow"
        ? d.minutesByProtection[1] + d.minutesByProtection[2] + d.minutesByProtection[3]
        : d.minutesByProtection[2] + d.minutesByProtection[3];
      if (opportunity?.opportunity === "remoteStorm" && opportunity.stormId === d.stormId && pending.has("remoteStorm")
        && d.survivorAlive && d.atCampMinutes <= 1e-9 && adequateMinutes + 1e-9 >= 60) {
        finishOpportunity(state, "remoteStorm", finished);
      }
    }
  }, eventDiscoveryKeys(d, state), inReach(state));
  captureChapterHome(state);
  return result.completed;
}

function finishOpportunity(state: GameState, key: OpportunityKey, finished: OpportunityKey[]): void {
  if (state.opportunities.completedAt[key] !== undefined) return;
  const def = opportunityDef(key)!;
  state.opportunities.stepProgress[key] = Object.fromEntries(def.steps.map((step) => [step.id, step.target]));
  state.opportunities.completedAt[key] = state.minute;
  finished.push(key);
}

/** Live context can initialize after migration or after the first camp appears. */
function captureChapterHome(state: GameState): void {
  if (state.dead || state.landing || state.opportunities.discoveredAt.remoteRefuge === undefined
    || state.opportunities.completedAt.remoteRefuge !== undefined
    || state.opportunities.context.chapter3HomeRegion !== null) return;
  const here = state.regions[state.player.region];
  const home = here?.campCell !== null && here?.campCell !== undefined
    ? state.player.region : Number(Object.entries(state.regions).find(([, region]) => region.campCell !== null)?.[0]);
  state.opportunities.context.chapter3HomeRegion = Number.isFinite(home) ? home : null;
}

/** Calendar gates can open on a quiet minute without a survivor deed. */
export function refreshOpportunities(state: GameState, minute = state.minute): void {
  const discovered: OpportunityKey[] = [];
  // Every sim minute asks this question of the whole catalogue, so the cheap
  // and most telling reasons a leaf is not about to be introduced come first:
  // it is already known, it is already done, or nothing leads to it.
  for (const def of allOpportunityDefs()) {
    if (!def.prerequisites) continue;
    if (state.opportunities.discoveredAt[def.key] !== undefined || state.opportunities.completedAt[def.key] !== undefined) continue;
    if (def.prerequisites.some((key) => state.opportunities.completedAt[key] === undefined)) continue;
    if (!chapterEligible(state.opportunities, def, minute)) continue;
    if (discoverOpportunity(state.opportunities, def.key, state.minute, false)) discovered.push(def.key);
  }
  captureChapterHome(state);
  if (discovered.length) {
    state.opportunities.notices.push({ id: `${state.minute}:${state.opportunities.nextNoticeId++}`, minute: state.minute, completed: [], completedGroups: [], discovered, messages: [] });
    if (discovered.length === 1) settleCurrent(state.opportunities, discovered);
  } else if (!state.opportunities.notices.length) {
    // A save from before goals stepped forward on their own loads with an
    // open goal and no current; this minute settles it. A pending notice is
    // a choice still being offered, and is left alone.
    settleCurrent(state.opportunities);
  }
}

export function queueOpportunityMessage(state: GameState, message: string): void {
  state.opportunities.notices.push({ id: `${state.minute}:${state.opportunities.nextNoticeId++}`, minute: state.minute, completed: [], completedGroups: [], discovered: [], messages: [message] });
}

export function opportunitySteps(state: GameState, key: OpportunityKey): { id: string; label: string; at: number; target: number; unit?: string; done: boolean }[] {
  const progress = state.opportunities.stepProgress[key] ?? {};
  return opportunityStepDefs(key).map((step) => {
    const at = Math.min(step.target, progress[step.id] ?? (state.opportunities.completedAt[key] !== undefined ? step.target : 0));
    return { id: step.id, label: step.label, at, target: step.target, unit: step.unit, done: at + 1e-9 >= step.target };
  });
}
