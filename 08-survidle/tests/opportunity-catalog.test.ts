import { expect, it } from "vitest";
import {
  allOpportunityDefs, discoverAvailableOpportunities, OPPORTUNITY_GROUPS,
  SUPPORTED_FISH_SPECIES, SUPPORTED_FORAGE_FOODS, SUPPORTED_SHELTER_STRUCTURES,
  SUPPORTED_TOOL_RECIPES, SUPPORTED_WILDLIFE_SPECIES,
} from "../src/sim/opportunity-catalog";
import { discoverOpportunity, newOpportunities, opportunityGroupView, recordOpportunityEvent } from "../src/sim/opportunities";
import { newGame } from "../src/sim/newgame";
import { calendar } from "../src/sim/calendar";
import { trainTask } from "../src/sim/skills";
import { migrate } from "../src/sim/save";
import { RECIPES, TOOLS } from "../src/sim/items";
import type { ToolId } from "../src/sim/types";

function newState() {
  return newGame(3).state;
}

it("generates stable leaves only for explicitly supported catalog members", () => {
  const keys = allOpportunityDefs().map((def) => def.key);
  expect(keys).toContain("catch:perch");
  expect(keys).toContain("build:leanTo");
  expect(keys).toContain("make:bow");
  expect(keys).toContain("season:spring");
  expect(new Set(keys).size).toBe(keys.length);
});

it("starts winter on the current survival opportunity rather than changing category", () => {
  expect(newOpportunities("winter").lastCategory).toBe("survival");
});

it("keeps each supported collection subset explicit and reviewable", () => {
  expect(SUPPORTED_WILDLIFE_SPECIES).toEqual(["deer", "reindeer", "elk", "wolf", "wolverine", "bear"]);
  expect(SUPPORTED_FISH_SPECIES).toEqual(["perch", "roach", "pike", "whitefish", "char", "trout", "burbot", "cod", "saithe", "herring"]);
  expect(SUPPORTED_FORAGE_FOODS).toEqual(["berries", "eggs", "barkFlour", "cookedRoots", "seaweed"]);
  expect(SUPPORTED_SHELTER_STRUCTURES).toEqual(["leanTo", "cabin", "boughBed", "turfHut", "snowShelter"]);
  expect(SUPPORTED_TOOL_RECIPES).toEqual(["knife", "fireDrill", "bow", "fishingSpear", "needle", "stoneAxe", "flakedAxe", "whetstone", "barkBucket", "waterskin"]);

  const keys = new Set(allOpportunityDefs().map((def) => def.key));
  for (const species of SUPPORTED_FISH_SPECIES) {
    expect(keys.has(`catch:${species}`)).toBe(true);
    expect(keys.has(`trap:${species}`)).toBe(true);
  }
  for (const food of SUPPORTED_FORAGE_FOODS) expect(keys.has(`forage:${food}`)).toBe(true);
  for (const structure of SUPPORTED_SHELTER_STRUCTURES) expect(keys.has(`build:${structure}`)).toBe(true);
  for (const recipe of SUPPORTED_TOOL_RECIPES) {
    const item = RECIPES[recipe].out.item;
    if (!item || !(item in TOOLS)) throw new Error(`${recipe} does not make a supported tool`);
    expect(keys.has(`make:${item as ToolId}`)).toBe(true);
  }
});

it("discovers fish from a water reading and credits only the caught species", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "waterRead", species: ["perch", "pike"] });
  expect(state.opportunities.discoveredAt["catch:perch"]).toBe(state.minute);
  recordOpportunityEvent(state, { kind: "fishCaught", species: "perch", method: "direct" });
  expect(state.opportunities.completedAt["catch:perch"]).toBe(state.minute);
  expect(state.opportunities.completedAt["catch:pike"]).toBeUndefined();
});

it("reveals trap leaves only once the basket-trap capability is known", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "waterRead", species: ["perch"] });
  expect(state.opportunities.discoveredAt["trap:perch"]).toBeUndefined();
  state.skills.fishing.xp = 120 * 4 ** 2;
  recordOpportunityEvent(state, { kind: "waterRead", species: ["perch"] });
  expect(state.opportunities.discoveredAt["trap:perch"]).toBe(state.minute);
});

it("completes no collection group while an unknown leaf remains", () => {
  const state = newState();
  const group = OPPORTUNITY_GROUPS.find((candidate) => candidate.id === "catch-fish");
  if (!group) throw new Error("catch-fish group is missing");
  for (const key of group.keys) {
    if (key === "catch:pike") continue;
    discoverOpportunity(state.opportunities, key, state.minute, false);
    state.opportunities.completedAt[key] = state.minute;
  }
  expect(opportunityGroupView(state.opportunities, "catch-fish").done).toBe(false);
});

it("credits overlapping authored and collection leaves from one build event", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "roof", state.minute, false);
  discoverOpportunity(state.opportunities, "build:leanTo", state.minute, false);
  recordOpportunityEvent(state, { kind: "built", structure: "leanTo" });
  expect(state.opportunities.completedAt.roof).toBe(state.minute);
  expect(state.opportunities.completedAt["build:leanTo"]).toBe(state.minute);
});

it("discovery events reveal leaves without credit and identity events credit only their leaf", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "toolAvailable", tool: "knife" });
  recordOpportunityEvent(state, { kind: "structureAvailable", structure: "leanTo" });
  expect(state.opportunities.completedAt["make:knife"]).toBeUndefined();
  expect(state.opportunities.completedAt["build:leanTo"]).toBeUndefined();

  recordOpportunityEvent(state, { kind: "toolMade", tool: "knife" });
  recordOpportunityEvent(state, { kind: "foraged", item: "berries" });
  expect(state.opportunities.completedAt["make:knife"]).toBe(state.minute);
  expect(state.opportunities.completedAt["forage:berries"]).toBe(state.minute);
  expect(state.opportunities.completedAt["forage:eggs"]).toBeUndefined();
});

it("refresh discovers known possibilities but never infers completion from possessions", () => {
  const { state, world } = newGame(3);
  state.player.tools.push({ id: "knife", durability: 100 });
  discoverAvailableOpportunities(state, world, calendar(state.minute, state.startDoy));
  expect(state.opportunities.discoveredAt["make:knife"]).toBe(state.minute);
  expect(state.opportunities.discoveredAt["build:leanTo"]).toBe(state.minute);
  expect(state.opportunities.completedAt["make:knife"]).toBeUndefined();
  expect(state.opportunities.completedAt["build:leanTo"]).toBeUndefined();
});

it("refreshes newly reached capability tiers at the skill level crossing", () => {
  const { state, world } = newGame(3);
  expect(state.opportunities.discoveredAt["make:bow"]).toBeUndefined();
  trainTask(state, world, { id: "craft", arg: "knife" }, 120 * 4 ** 2);
  expect(state.opportunities.discoveredAt["make:bow"]).toBe(state.minute);
  expect(state.opportunities.completedAt["make:bow"]).toBeUndefined();
});

it("migrates old aggregate trap catches without inventing species credit", () => {
  const { state } = newGame(3);
  const region = state.regions[state.player.region];
  region.trap = { cell: region.campCell!, kg: 1, oilyKg: 0, fish: ["perch"], age: 0 };
  migrate(state, 10);
  expect(region.trap.caught).toEqual([]);
  expect(state.opportunities.completedAt["trap:perch"]).toBeUndefined();
});
