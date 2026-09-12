import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { discoverOpportunity, opportunityGroupView, recordOpportunityEvent, setCurrentOpportunity } from "../src/sim/opportunities";
import { speciesRevealedByPerception } from "../src/sim/wildlife-encounter";
import { activateWildlife, noteWildlifeSightings, visibleWildlife } from "../src/sim/wildlife-agents";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { cellOf, placeAt } from "../src/sim/position";
import { noteHuntSign, createCarcass, processCarcass } from "../src/sim/hunting";
import { runIntent } from "../src/sim/intent";
import { addItem, emptyInventory, pile, qty } from "../src/sim/inventory";
import { check, stepTask } from "../src/sim/tasks";
import type { GameState, WorkIntent } from "../src/sim/types";
import { regionAt, type World } from "../src/world/gen";
import { neighbourLandCell, siteCamp } from "./siting-helpers";

function newState() {
  return newGame(3).state;
}

it.each(["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const)("unlocks and completes the %s chain without leaking another species", (species) => {
  const state = newState();
  const other = species === "deer" ? "elk" : "deer";
  setCurrentOpportunity(state.opportunities, "site");
  recordOpportunityEvent(state, { kind: "speciesSeen", species });
  expect(state.opportunities.discoveredAt[`track:${species}`]).toBe(state.minute);
  expect(state.opportunities.completedAt[`track:${species}`]).toBeUndefined();
  expect(state.opportunities.discoveredAt[`track:${other}`]).toBeUndefined();

  recordOpportunityEvent(state, { kind: "signFound", species });
  expect(state.opportunities.completedAt[`track:${species}`]).toBe(state.minute);
  expect(state.opportunities.discoveredAt[`hunt:${species}`]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "animalKilled", species });
  expect(state.opportunities.completedAt[`hunt:${species}`]).toBe(state.minute);
  expect(state.opportunities.discoveredAt[`dress:${species}`]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "carcassDressed", species, carcassId: 7 });
  expect(state.opportunities.completedAt[`dress:${species}`]).toBe(state.minute);
  expect(state.opportunities.discoveredAt[`recover:${species}`]).toBe(state.minute);

  recordOpportunityEvent(state, { kind: "carcassRecovered", species, carcassId: 7 });
  expect(state.opportunities.completedAt[`recover:${species}`]).toBe(state.minute);
  expect(state.opportunities.discoveredAt[`hunt:${other}`]).toBeUndefined();
  expect(state.opportunities.current).toBe("site");
  for (const group of ["track-animals", "hunt-animals", "dress-carcasses", "recover-kills"] as const) {
    expect(opportunityGroupView(state.opportunities, group).done).toBe(false);
  }
});

it.each([
  { kind: "heard", identification: "species", uncertaintyM: 5 },
  { kind: "seen", identification: "unknown" },
  { kind: "seen", identification: "ungulate" },
  { kind: "none" },
] as const)("does not reveal a species from $kind/$identification perception", (perception) => {
  expect(speciesRevealedByPerception(perception, "deer")).toBeNull();
});

it.each(["species", "subject"] as const)("reveals identified visual %s perception", (identification) => {
  expect(speciesRevealedByPerception({ kind: "seen", identification }, "deer")).toBe("deer");
});

it("does not replay old wildlife deeds or disclose a species from signs or kills", () => {
  const state = newState();
  recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
  recordOpportunityEvent(state, { kind: "animalKilled", species: "deer" });
  recordOpportunityEvent(state, { kind: "carcassDressed", species: "deer", carcassId: 7 });
  recordOpportunityEvent(state, { kind: "carcassRecovered", species: "deer", carcassId: 7 });
  expect(state.opportunities.discoveredAt["track:deer"]).toBeUndefined();
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  expect(state.opportunities.completedAt["track:deer"]).toBeUndefined();
  expect(state.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
});

function finishTask(state: GameState, world: World, success = true) {
  if (!state.task) throw new Error("Expected a live task");
  state.task.progress = state.task.duration;
  const rng = new Rng(1);
  rng.chance = () => success;
  stepTask(state, world, calendar(state.minute, state.startDoy), rng, 0.01);
}

it.each([false, true])("discovers a visually presented species once without treating sight as fresh sign (recognized: %s)", (recognized) => {
  const { state, world } = newGame(3);
  const here = cellOf(state, world);
  state.regions[state.player.region].pop.deer = 4;
  activateWildlife(state, world, new Rng(1));
  const deer = state.wildlife.subjects.find((subject) => subject.species === "deer" && subject.active);
  if (!deer?.active) throw new Error("Expected active deer");
  deer.active.cell = here;
  if (recognized) state.wildlife.recognized[deer.id] = true;
  else state.wildlife.familiarity[deer.id] = { points: 5, lastDay: -1 };
  const cal = calendar(state.minute, state.startDoy);
  expect(visibleWildlife(state, world, cal)).toContain(deer);
  expect(state.opportunities.discoveredAt["track:deer"]).toBeUndefined();
  noteWildlifeSightings(state, [deer.id], cal.day);
  noteWildlifeSightings(state, [deer.id], cal.day);
  expect(state.opportunities.discoveredAt["track:deer"]).toBe(state.minute);
  expect(state.opportunities.completedAt["track:deer"]).toBeUndefined();
  expect(state.player.huntSigns[here].species.deer).toBe(state.minute);
  expect(state.wildlife.recognized[deer.id]).toBe(true);
  expect(state.opportunities.notices.flatMap((notice) => notice.discovered).filter((key) => key === "track:deer")).toHaveLength(1);
  recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
  expect(state.opportunities.completedAt["track:deer"]).toBe(state.minute);
});

it.each(["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const)("credits real fresh sign, kill, dressing and camp recovery for %s", (species) => {
  const { state, world } = newGame(3);
  const camp = siteCamp(state, world);
  placeAt(state, world, camp);
  regionAt(world, state.player.region).capacity[species] = 4;
  state.regions[state.player.region].pop[species] = 4;
  recordOpportunityEvent(state, { kind: "speciesSeen", species });
  // A sighting already taught the hunt where to look. It must not suppress
  // a later fresh-sign deed just because the knowledge timestamp is recent.
  noteHuntSign(state, camp, species);
  state.task = { id: "hunt", arg: species, duration: 1, progress: 0, repeat: false };
  finishTask(state, world);
  expect(state.carcasses).toHaveLength(1);
  expect(state.opportunities.completedAt[`track:${species}`]).toBe(state.minute);
  expect(state.opportunities.completedAt[`hunt:${species}`]).toBe(state.minute);
  expect(state.opportunities.completedAt[`dress:${species}`]).toBeUndefined();
  finishTask(state, world);
  expect(state.opportunities.completedAt[`dress:${species}`]).toBe(state.minute);
  expect(state.opportunities.completedAt[`recover:${species}`]).toBe(state.minute);
});

it("does not credit a kill when a successful strike finds no animal to claim", () => {
  const { state, world } = newGame(3);
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
  state.regions[state.player.region].pop.deer = 0;
  state.task = { id: "hunt", arg: "deer", duration: 1, progress: 0, repeat: false };
  finishTask(state, world);
  expect(state.carcasses).toEqual([]);
  expect(state.opportunities.completedAt["hunt:deer"]).toBeUndefined();
  expect(state.opportunities.discoveredAt["dress:deer"]).toBeUndefined();
});

it("returns the processed carcass identity and cannot dress it twice", () => {
  const { state, world } = newGame(3);
  const carcass = createCarcass(state, world, "elk", { meatKg: 1 });
  expect(processCarcass(state, world, carcass.id)).toMatchObject({ species: "elk", carcassId: carcass.id });
  expect(processCarcass(state, world, carcass.id)).toBeNull();
});

function fieldRecovery(meatKg: number, fatKg: number) {
  const { state, world } = newGame(3);
  const camp = siteCamp(state, world);
  const source = neighbourLandCell(world, camp);
  placeAt(state, world, source);
  state.player.pack = emptyInventory();
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
  recordOpportunityEvent(state, { kind: "animalKilled", species: "deer" });
  const carcass = createCarcass(state, world, "deer", { meatKg, fatKg });
  const intent: WorkIntent = {
    mode: "hand", task: "hunt", arg: "any", cell: source, campCell: camp,
    until: { kind: "once" }, deliver: "camp", done: 0, step: "", orderId: null, windDown: false,
  };
  state.intent = intent;
  state.task = { id: "hunt", arg: "deer", any: true, duration: 1, progress: 0, repeat: false, huntPhase: "field", carcassId: carcass.id };
  finishTask(state, world);
  return { state, world, camp, source, intent, carcass };
}

it.each([[50, 2], [2, 50]])("waits for all meat and fat across separate destinations (%s kg meat, %s kg fat)", (meatKg, fatKg) => {
  const { state, world, camp, source, intent, carcass } = fieldRecovery(meatKg, fatKg);
  expect(state.opportunities.completedAt["dress:deer"]).toBe(state.minute);
  expect(state.opportunities.completedAt["recover:deer"]).toBeUndefined();
  expect(intent).toMatchObject({ recoveredSpecies: "deer", recoveredCarcassId: carcass.id });
  expect(intent.recoveredMeatAtSourceKg ?? 0).toBeCloseTo(qty(pile(state, source), "rawMeat"));
  expect(intent.recoveredFatAtSourceKg ?? 0).toBeCloseTo(qty(pile(state, source), "rawFat"));
  expect(intent.recoveredMeatPackedKg ?? 0).toBeCloseTo(qty(state.player.pack, "rawMeat"));
  expect(intent.recoveredFatPackedKg ?? 0).toBeCloseTo(qty(state.player.pack, "rawFat"));
  const cal = calendar(state.minute, state.startDoy);
  placeAt(state, world, camp);
  runIntent(state, world, cal, new Rng(1));
  expect(state.opportunities.completedAt["recover:deer"]).toBeUndefined();
  expect(intent.recoveredCarcassId).toBe(carcass.id);
  for (let trip = 0; trip < 8 && state.opportunities.completedAt["recover:deer"] === undefined; trip++) {
    state.task = null;
    placeAt(state, world, source);
    runIntent(state, world, cal, new Rng(1));
    state.task = null;
    placeAt(state, world, camp);
    runIntent(state, world, cal, new Rng(1));
  }
  expect(state.opportunities.completedAt["recover:deer"]).toBe(state.minute);
  expect(intent.recoveredSpecies).toBeUndefined();
  expect(intent.recoveredCarcassId).toBeUndefined();
});

it.each(["recoveredSpecies", "recoveredCarcassId"] as const)("never attributes generic deliveries when %s is absent", (field) => {
  const { state, world, camp, intent } = fieldRecovery(1, 1);
  delete intent[field];
  addItem(state.player.pack, "rawMeat", 5);
  placeAt(state, world, camp);
  runIntent(state, world, calendar(state.minute, state.startDoy), new Rng(1));
  expect(state.opportunities.completedAt["recover:deer"]).toBeUndefined();
});

it("delivers a small carcass before a repeating hunt can overwrite its identity", () => {
  const { state, world, source, intent, carcass } = fieldRecovery(1, 1);
  intent.until = { kind: "forever" };
  state.player.tools.push({ id: "bow", durability: 100 });
  addItem(state.player.pack, "arrow", 5);
  const cal = calendar(state.minute, state.startDoy);
  expect(check(state, world, cal, "hunt", "any", source).ok).toBe(true);
  runIntent(state, world, cal, new Rng(1));
  expect(state.task?.id).toBe("walk");
  expect(intent.recoveredCarcassId).toBe(carcass.id);
  expect(state.opportunities.completedAt["recover:deer"]).toBeUndefined();
});

it.each([
  { key: "track", event: { kind: "signFound", species: "deer" } },
  { key: "hunt", event: { kind: "animalKilled", species: "deer" } },
  { key: "dress", event: { kind: "carcassDressed", species: "deer", carcassId: 7 } },
  { key: "recover", event: { kind: "carcassRecovered", species: "deer", carcassId: 7 } },
] as const)("credits only the matching discovered $key leaf when both species are known", ({ key, event }) => {
  const state = newState();
  discoverOpportunity(state.opportunities, `${key}:deer`, state.minute);
  discoverOpportunity(state.opportunities, `${key}:elk`, state.minute);
  recordOpportunityEvent(state, event);
  expect(state.opportunities.completedAt[`${key}:deer`]).toBe(state.minute);
  expect(state.opportunities.completedAt[`${key}:elk`]).toBeUndefined();
});

it.each([{ population: 4, success: false }, { population: 0, success: true }])("failed or empty pursuits disclose no species ($population animals, success roll $success)", ({ population, success }) => {
  const { state, world } = newGame(3);
  state.regions[state.player.region].pop.deer = population;
  state.task = { id: "hunt", arg: "deer", duration: 1, progress: 0, repeat: false };
  finishTask(state, world, success);
  expect(state.carcasses).toEqual([]);
  expect(state.opportunities.discoveredAt["track:deer"]).toBeUndefined();
  expect(state.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
});

it("does not award dressing or recovery when the field task's carcass is gone", () => {
  const { state, world } = newGame(3);
  discoverOpportunity(state.opportunities, "dress:deer", state.minute);
  state.task = { id: "hunt", arg: "deer", duration: 1, progress: 0, repeat: false, huntPhase: "field", carcassId: 999 };
  finishTask(state, world);
  expect(state.opportunities.completedAt["dress:deer"]).toBeUndefined();
  expect(state.opportunities.discoveredAt["recover:deer"]).toBeUndefined();
});
