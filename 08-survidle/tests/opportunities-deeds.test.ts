import { activeOpportunityKeys, reveal } from "./opportunity-helpers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { drop, dropAll, eat, take } from "../src/sim/actions";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { checkWinterStores, recordOpportunityEvent, opportunitySteps, OPPORTUNITIES } from "../src/sim/opportunities";
import { setSkillLevel } from "../src/sim/horizon";
import { startIntent } from "../src/sim/intent";
import { createCarcass, carcassMinutes } from "../src/sim/hunting";
import { addItem, pile, qty, removeItem } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { beginAgain, land } from "../src/sim/landing";
import { orderByHand } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { cellOf, placeAt, placeAtSpot, straightKm } from "../src/sim/position";
import { campSite, regionState, siteFor } from "../src/sim/regionstate";
import { check, DEADWOOD_KG, startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import { drink } from "../src/sim/water";
import { ensureGround } from "../src/sim/weather";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere, testRain } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

const cal = calendar(0);

const THROUGH_COOK = ["site", "drink", "firewood", "fire", "bed", "roof", "cook"] as const;

function openShelterChapter(state: ReturnType<typeof newGame>["state"]): void {
  for (const id of THROUGH_COOK) state.opportunities.completedAt[id] = 0;
  state.opportunities.completedAt.keptNight = 0;
  state.opportunities.completedAt.forageMeal = 0;
  reveal(state, ["findUsefulCover"]);
}

function openRemoteChapter(state: ReturnType<typeof newGame>["state"]): void {
  for (const id of [
    ...THROUGH_COOK, "keptNight", "forageMeal", "findUsefulCover", "makeUsefulShelter", "testShelter",
    "snareMeal", "huntMeal", "fishMeal", "trapMeal", "foodSource", "store", "fat", "firstOrder", "water",
    "keptDays", "readWeather", "prepareWeather", "surviveForecast", "longOrder", "toolCare", "explore",
  ] as const) state.opportunities.completedAt[id] = 0;
  state.minute = 30 * 1440;
  reveal(state, ["remoteRefuge"]);
}

function announcedGame(seed: number) {
  const game = newGame(seed);
  reveal(game.state, OPPORTUNITIES.map((g) => g.key));
  return game;
}

describe("deeds reach the ladder", () => {
  it("the first opportunity is choosing where to live, credited by making camp", () => {
    const { state } = announcedGame(3);
    expect(OPPORTUNITIES[0].key).toBe("site");
    expect(recordOpportunityEvent(state, { kind: "task", id: "makeCamp" })).toContain("site");
  });

  it("does not infer the roof opportunity from shelter already standing", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell ?? 0).structures.leanTo = true;
    advance(state, world, 1);
    expect(state.opportunities.completedAt.roof).toBeUndefined();
  });

  it("does not credit a windbreak as a roof", () => {
    const { state } = newGame(3);
    reveal(state, ["roof"]);
    expect(recordOpportunityEvent(state, { kind: "sheltered", protection: 1 })).not.toContain("roof");
    expect(state.opportunities.completedAt.roof).toBeUndefined();
  });

  it("credits weatherproof shelter as the roof outcome", () => {
    const { state } = newGame(3);
    reveal(state, ["roof"]);
    expect(recordOpportunityEvent(state, { kind: "sheltered", protection: 2 })).toContain("roof");
    expect(state.opportunities.completedAt.roof).toBeDefined();
  });

  it("keeps every existing built deed as a route to the roof opportunity", () => {
    for (const structure of ["leanTo", "turfHut", "snowShelter", "cabin"] as const) {
      const { state } = newGame(3);
      reveal(state, ["roof"]);
      expect(recordOpportunityEvent(state, { kind: "built", structure })).toContain("roof");
      expect(state.opportunities.completedAt.roof).toBeDefined();
    }
  });

  it("does not treat ordinary sleep as exploration", () => {
    const { state, world } = announcedGame(3);
    state.task = { id: "sleep", progress: 0, duration: 0, repeat: false };
    stepTask(state, world, cal, new Rng(1), 1);
    expect(state.opportunities.completedAt.explore).toBeUndefined();
  });

  it("credits a real drink and food with non-lean energy", () => {
    const { state, world } = announcedGame(3);
    ensureGround(state, world, state.player.region).iceCm = 0;
    state.player.water = 1;
    placeAtSpot(state, world, state.player.region, "shore");
    expect(drink(state, world)).toBe(true);
    expect(state.opportunities.completedAt.drink).toBeDefined();
    addItem(state.player.pack, "berries", 0.2);
    expect(eat(state, world, "berries", new Rng(1))).toBeGreaterThan(0);
    expect(state.opportunities.completedAt.fat).toBeDefined();
  });

  it("distinguishes a first standing camp order from a longer one", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    setSkillLevel(state, "woodcraft", 3);
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, "job");
    expect(state.opportunities.completedAt.firstOrder).toBeDefined();
    expect(state.opportunities.completedAt.longOrder).toBeUndefined();
    setSkillLevel(state, "woodcraft", 5);
    orderByHand(state, world, cal, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(state.opportunities.completedAt.longOrder).toBeDefined();
  });

  it("recognizes full winter food and fuel reserves on the daily roll", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    addItem(camp, "driedMeat", 81);
    addItem(camp, "fat", 21);
    addItem(camp, "firewood", 610);
    addItem(camp, "log", 301);
    advance(state, world, 24 * 60);
    expect(state.opportunities.completedAt.winterStores).toBeDefined();
  });

  it("requires each named winter store instead of accepting substitutes", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    addItem(camp, "driedMeat", 140);
    addItem(camp, "firewood", 1000);
    checkWinterStores(state);
    expect(state.opportunities.completedAt.winterStores).toBeUndefined();
    addItem(camp, "fat", 20);
    addItem(camp, "log", 300);
    checkWinterStores(state);
    expect(state.opportunities.completedAt.winterStores).toBeDefined();
  });

  it("counts a newly made tool as preparing a replacement", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "stick", 2);
    addItem(state.player.pack, "cordage", 1);
    const o = check(state, world, cal, "craft", "fireDrill");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "craft", "fireDrill")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.completedAt.toolCare).toBeDefined();
  });

  it("credits the fire when this survivor lights one", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    state.opportunities.completedAt.firewood = 0;
    placeAt(state, world, st.campCell!);
    // Everything a light needs, so the deed is the only thing under test.
    siteFor(st, st.campCell!).structures.firePit = true;
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    recordOpportunityEvent(state, { kind: "crafted", recipe: "fireDrill" });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, o.duration + 1);
    // No rain at landing means lightingInRain's failChance is 0: this light
    // cannot fail, so the fire opportunity must be credited outright.
    expect(st.fire.lit).toBe(true);
    expect(state.opportunities.completedAt.fire).toBeDefined();
  });

  it("credits nothing when the tinder does not catch", () => {
    testRain(1);
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.firePit = true;
    // Rain with no roof gives a one-in-three fail chance; seed 7 rolls it.
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    const rng = new Rng(7);
    for (let m = 0; m < o.duration + 1 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(st.fire.lit).toBe(false);
    expect(state.opportunities.completedAt.fire).toBeUndefined();
  });

  it("does not credit the fire to a survivor who only found one burning", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    advance(state, world, 60);
    expect(state.opportunities.completedAt.fire).toBeUndefined();
  });

  it("credits nothing for firewood that just exists in a pile, since nobody gathered it", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 40);
    advance(state, world, 120);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("credits opportunity 1 by the kilos a real gather actually produces", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    const o = check(state, world, cal, "deadwood");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "deadwood")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.stepProgress.firewood?.wood).toBeCloseTo(DEADWOOD_KG);
    expect(state.opportunities.completedAt.firewood).toBeDefined();
  });

  it("credits opportunity 1 by the kilos a real split actually produces", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    // The landing kit's own axe is what split() needs; no forest cell required.
    addItem(state.player.pack, "log", 1);
    const o = check(state, world, cal, "split");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "split")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.stepProgress.firewood?.wood).toBeCloseTo(Math.min(10, ITEM_KG.log));
  });

  it("credits opportunity 1 by the kilos a real splitWedges actually produces", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "log", 1);
    addItem(state.player.pack, "wedge", 2);
    const o = check(state, world, cal, "splitWedges");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "splitWedges")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.stepProgress.firewood?.wood).toBeCloseTo(Math.min(10, ITEM_KG.log));
  });

  it("credits nothing when a standing order carries firewood home and drops it at camp", () => {
    testAtmosphere();
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    // deadwood is the one gathering task whose yield is firewood itself.
    expect(startIntent(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "forever" }, deliver: "camp", where: "nearest" })).toBe(true);
    // Standing at camp already, with a load on the back and nowhere else the
    // intent needs to send it first: the exact shape dropEverything handles.
    state.task = null;
    placeAt(state, world, camp);
    addItem(state.player.pack, "firewood", 4);
    advance(state, world, 1);
    expect(qty(pile(state, camp), "firewood")).toBe(4);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("credits nothing for firewood taken out of the camp pile and put straight back", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(pile(state, camp), "firewood", 10);
    expect(take(state, world, "firewood", 10)).toBe(10);
    expect(drop(state, world, "firewood", 10)).toBe(10);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("credits a season opportunity when the calendar actually turns the corner", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    // Backdating lastSeason forces the very next day roll to see a turnover,
    // without simulating the months a real one would take.
    state.opportunities.lastSeason = "winter";
    advance(state, world, 1440);
    expect(state.opportunities.lastSeason).toBe("spring");
    expect(state.opportunities.completedAt["season:spring"]).toBeDefined();
  });

  it("credits a season only when the calendar turns over into it", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    for (const id of ["firewood", "fire", "cook", "bed", "roof", "water", "store"] as const) {
      state.opportunities.completedAt[id] = 0;
    }
    const before = state.opportunities.lastSeason;
    // A landing does not credit the season it lands in.
    advance(state, world, 60);
    expect(state.opportunities.completedAt[`season:${before}`]).toBeUndefined();
  });

  it("credits the bed opportunity when the survivor actually builds one", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(state.player.pack, "stick", 12);
    const o = check(state, world, cal, "build", "boughBed");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "build", "boughBed")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(campSite(st)!.structures.boughBed).toBe(true);
    expect(state.opportunities.completedAt.bed).toBeDefined();
  });

  it("finishes the hot-meal opportunity when cooked food is eaten", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    addItem(state.player.pack, "rawMeat", 2);
    const o = check(state, world, cal, "cook", "rawMeat");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "cook", "rawMeat")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.completedAt.cook).toBeUndefined();
    expect(eat(state, world, "cookedMeat", new Rng(1))).toBeGreaterThan(0);
    expect(state.opportunities.completedAt.cook).toBeDefined();
  });

  it("does not credit cooking when the ingredient is gone at completion", () => {
    const { state, world } = announcedGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    addItem(state.player.pack, "rawMeat", 1);
    const o = check(state, world, cal, "cook", "rawMeat");
    expect(startTask(state, world, cal, "cook", "rawMeat")).toBe(true);
    removeItem(state.player.pack, "rawMeat", 1);
    advance(state, world, o.duration + 1);
    expect(state.opportunities.completedAt.cook).toBeUndefined();
  });

  it("finishes the preserving opportunity only after preserved meat is eaten", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.dryingRack = true;
    siteFor(st, st.campCell!).racks = 1;
    addItem(pile(state, st.campCell!), "rawMeat", 9);
    const o = check(state, world, cal, "hang");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "hang")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(st.rack.kg).toBeGreaterThan(0);
    expect(state.opportunities.completedAt.store).toBeUndefined();
    addItem(state.player.pack, "driedMeat", 0.2);
    expect(eat(state, world, "driedMeat", new Rng(1))).toBeGreaterThan(0);
    expect(state.opportunities.completedAt.store).toBeDefined();
  });

  it("teaches the hunting loop through real sign and camp recovery deeds", () => {
    const { state } = newGame(17);
    reveal(state, ["huntMeal"]);
    recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
    recordOpportunityEvent(state, { kind: "recoveredAtCamp" });
    expect(opportunitySteps(state, "huntMeal").filter((step) => step.id === "sign" || step.id === "recover").map((step) => [step.id, step.done])).toEqual([
      ["sign", true], ["recover", true],
    ]);
  });

  it("credits recovered meat only when a field-dressed carcass reaches camp", () => {
    const { state, world } = newGame(17);
    reveal(state, ["huntMeal"]);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAtSpot(state, world, state.player.region, "forest");
    const field = cellOf(state, world);
    const carcass = createCarcass(state, world, "deer", { meatKg: 12 });
    state.intent = {
      mode: "hand", task: "hunt", arg: "deer", cell: field, campCell: camp,
      until: { kind: "once" }, deliver: "camp", done: 0, step: "", orderId: null, windDown: false };
    state.task = {
      id: "hunt", arg: "deer", progress: 0, duration: carcassMinutes(carcass), repeat: false,
      huntPhase: "field", carcassId: carcass.id };
    stepTask(state, world, cal, new Rng(1), state.task.duration + 1);
    expect(opportunitySteps(state, "huntMeal").find((step) => step.id === "recover")?.done).toBe(false);
    placeAt(state, world, camp);
    advance(state, world, 1);
    expect(opportunitySteps(state, "huntMeal").find((step) => step.id === "recover")?.done).toBe(true);
  });

  it("does not mistake unrelated raw meat for the dressed carcass", () => {
    const { state, world } = newGame(17);
    reveal(state, ["huntMeal"]);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAtSpot(state, world, state.player.region, "forest");
    const field = cellOf(state, world);
    addItem(state.player.pack, "rawMeat", 0.2);
    addItem(state.player.pack, "stick", 40);
    const carcass = createCarcass(state, world, "deer", { meatKg: 12 });
    state.intent = {
      mode: "hand", task: "hunt", arg: "deer", cell: field, campCell: camp,
      until: { kind: "once" }, deliver: "camp", done: 0, step: "", orderId: null, windDown: false };
    state.task = {
      id: "hunt", arg: "deer", progress: 0, duration: carcassMinutes(carcass), repeat: false,
      huntPhase: "field", carcassId: carcass.id };
    stepTask(state, world, cal, new Rng(1), state.task.duration + 1);
    expect(qty(pile(state, field), "rawMeat")).toBeGreaterThan(0);
    placeAt(state, world, camp);
    advance(state, world, 1);
    expect(opportunitySteps(state, "huntMeal").find((step) => step.id === "recover")?.done).toBe(false);
  });

  it("credits nothing when the meat is gone before the hang finishes", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.dryingRack = true;
    siteFor(st, st.campCell!).racks = 1;
    const camp = pile(state, st.campCell!);
    addItem(camp, "rawMeat", 9);
    const o = check(state, world, cal, "hang");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "hang")).toBe(true);
    // The same failure shape the fire deed exists for: the task still runs
    // to completion, but loadRack has nothing left to move onto the rack.
    removeItem(camp, "rawMeat", qty(camp, "rawMeat"));
    advance(state, world, o.duration + 1);
    expect(st.rack.kg).toBe(0);
    expect(state.opportunities.completedAt.store).toBeUndefined();
  });
});

describe("Chapter 1 shelter deeds", () => {
  it("leaves the shelter chapter open when a search finds no protection", () => {
    const { state } = newGame(3);
    openShelterChapter(state);

    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 10, region: state.player.region, cell: 12,
      from: 0, to: 0, source: "found" });

    expect(state.opportunities.completedAt.findUsefulCover).toBeUndefined();
    expect(state.opportunities.context.weather).toBeNull();
  });

  it("remembers the found area when natural cover first reaches protection one", () => {
    const { state, world } = newGame(3);
    openShelterChapter(state);
    const cell = cellOf(state, world);

    expect(recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 10, region: state.player.region, cell,
      from: 0, to: 1, source: "found" })).toContain("findUsefulCover");

    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "makeUsefulShelter", status: "reserved", createdAt: 10, attempts: 1,
      area: { region: state.player.region, centre: cell, radiusKm: 1 } });
  });

  it("accepts improving the original found cell into weatherproof shelter", () => {
    const { state, world } = newGame(3);
    openShelterChapter(state);
    const origin = cellOf(state, world);
    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 10, region: state.player.region, cell: origin,
      from: 0, to: 1, source: "found" });
    reveal(state, ["makeUsefulShelter"]);

    expect(recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 11, region: state.player.region, cell: origin,
      from: 1, to: 2, source: "improved" }, world)).toContain("makeUsefulShelter");
    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "testShelter", status: "reserved", createdAt: 11, attempts: 1,
      stormId: null, area: { region: state.player.region, centre: origin, radiusKm: 1 } });
  });

  it("does not accept weatherproof shelter outside the original local area", () => {
    const { state, world } = newGame(3);
    openShelterChapter(state);
    const origin = cellOf(state, world);
    const region = regionAt(world, state.player.region);
    const far = region.cells.reduce((best, cell) => straightKm(world, origin, cell) > straightKm(world, origin, best) ? cell : best, origin);
    expect(straightKm(world, origin, far)).toBeGreaterThan(1);
    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 10, region: state.player.region, cell: origin,
      from: 0, to: 1, source: "found" });
    reveal(state, ["makeUsefulShelter"]);

    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 11, region: state.player.region, cell: far,
      from: 1, to: 2, source: "structure" }, world);
    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: 12, region: state.player.region + 1, cell: origin,
      from: 1, to: 2, source: "structure" }, world);

    expect(state.opportunities.completedAt.makeUsefulShelter).toBeUndefined();
  });

  it("credits the roof from every real transition to protection two or higher", () => {
    for (const source of ["found", "improved", "emergency", "structure"] as const) {
      const { state } = newGame(3);
      reveal(state, ["roof"]);
      expect(recordOpportunityEvent(state, {
        kind: "protectionChanged", minute: 1, region: state.player.region, cell: 1,
        from: 1, to: 2, source })).toContain("roof");
    }
  });
});

describe("Chapter 3 field deeds", () => {
  it.each(["found", "improved", "emergency", "structure"] as const)("binds a %s refuge only after protection two is reached outside the home camp region", (source) => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const home = state.player.region;
    const remote = regionAt(world, home).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    openRemoteChapter(state);

    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute, region: home, cell: cellOf(state, world),
      from: 1, to: 2, source }, world);
    expect(state.opportunities.completedAt.remoteRefuge).toBeUndefined();

    expect(recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute + 1, region: remote, cell: refuge,
      from: 1, to: 2, source }, world)).toContain("remoteRefuge");
    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "remoteStorm", status: "reserved", createdAt: state.minute + 1,
      area: { region: remote, centre: refuge, radiusKm: 1 } });
  });

  it("accepts permanent shelter at a later camp while rejecting the original home", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const home = state.player.region;
    const remote = regionAt(world, home).neighbours[0].id;
    state.regions[remote] = structuredClone(state.regions[home]);
    state.regions[remote].campCell = regionAt(world, remote).campCell;
    openRemoteChapter(state);

    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute, region: home, cell: state.regions[home].campCell!,
      from: 1, to: 2, source: "structure" }, world);
    expect(state.opportunities.completedAt.remoteRefuge).toBeUndefined();
    expect(recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute + 1, region: remote, cell: state.regions[remote].campCell!,
      from: 1, to: 2, source: "structure" }, world)).toContain("remoteRefuge");
  });

  it("does not credit Chapter 3 before introduction or from camp fire and meal events", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    openRemoteChapter(state);
    const home = state.player.region;
    const remote = regionAt(world, home).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    recordOpportunityEvent(state, { kind: "protectionChanged", minute: state.minute, region: remote, cell: refuge, from: 1, to: 2, source: "improved" }, world);
    const opportunity = state.opportunities.context.weather!;
    opportunity.stormId = 80;
    opportunity.source = "natural";
    opportunity.status = "announced";
    opportunity.announcedAt = state.minute + 1;
    opportunity.minutesByProtection[2] = 7;

    recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute + 1, region: home, cell: cellOf(state, world), atCamp: true }, world);
    expect(state.opportunities.completedAt.fieldFire).toBeUndefined();
    reveal(state, ["fieldFire"]);
    recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute + 2, region: home, cell: cellOf(state, world), atCamp: true }, world);
    expect(state.opportunities.completedAt.fieldFire).toBeUndefined();

    expect(recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute + 3, region: remote, cell: refuge, atCamp: false }, world)).toContain("fieldFire");
    expect(state.opportunities.context.weather).toBe(opportunity);
    expect(state.opportunities.context.weather).toMatchObject({ opportunity: "remoteStorm", stormId: 80, source: "natural", status: "announced", minutesByProtection: [0, 0, 7, 0] });
    reveal(state, ["fieldMeal"]);
    recordOpportunityEvent(state, { kind: "taskCompleted", minute: state.minute + 4, id: "cook", arg: "rawMeat", region: home, cell: cellOf(state, world), atCamp: true }, world);
    expect(state.opportunities.completedAt.fieldMeal).toBeUndefined();

    expect(recordOpportunityEvent(state, { kind: "taskCompleted", minute: state.minute + 5, id: "cook", arg: "rawMeat", region: remote, cell: refuge, atCamp: false }, world)).toContain("fieldMeal");
    expect(state.opportunities.context.weather).toBe(opportunity);
    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "remoteStorm", createdAt: state.minute, stormId: 80, source: "natural", status: "announced",
      minutesByProtection: [0, 0, 7, 0],
      area: { region: remote, centre: refuge } });
  });

  it("completes the remote storm only for matching refuge-region protection without camp time", () => {
    const ended = (overrides: Partial<Extract<Parameters<typeof recordOpportunityEvent>[1], { kind: "stormEnded" }>> = {}) => ({
      kind: "stormEnded" as const, minute: 40 * 1440, stormId: 70, stormKind: "rain" as const, survivorAlive: true,
      minutesByProtection: [0, 0, 60, 0] as [number, number, number, number],
      atCampMinutes: 0, awayFromCampMinutes: 60, maxWetness: 10, ...overrides });
    for (const bad of [
      { stormId: 71 }, { survivorAlive: false },
      { minutesByProtection: [0, 60, 0, 0] as [number, number, number, number] },
      { atCampMinutes: 1, awayFromCampMinutes: 59 },
    ]) {
      const { state, world } = newGame(17);
      siteCamp(state, world);
      openRemoteChapter(state);
      state.opportunities.completedAt.remoteRefuge = 0;
      state.opportunities.completedAt.fieldFire = 0;
      state.opportunities.completedAt.fieldMeal = 0;
      reveal(state, ["remoteStorm"]);
      const remote = regionAt(world, regionAt(world, state.player.region).neighbours[0].id);
      state.opportunities.context.weather = {
        opportunity: "remoteStorm", status: "running", createdAt: state.minute, attempts: 1,
        stormId: 70, source: "natural", area: { region: remote.id, centre: remote.campCell, radiusKm: 1 },
        announcedAt: state.minute, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
        atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
      recordOpportunityEvent(state, ended(bad), world);
      expect(state.opportunities.completedAt.remoteStorm).toBeUndefined();
    }

    const { state, world } = newGame(17);
    siteCamp(state, world);
    openRemoteChapter(state);
    for (const id of ["remoteRefuge", "fieldFire", "fieldMeal"] as const) state.opportunities.completedAt[id] = 0;
    reveal(state, ["remoteStorm"]);
    const remote = regionAt(world, regionAt(world, state.player.region).neighbours[0].id);
    state.opportunities.context.weather = {
      opportunity: "remoteStorm", status: "running", createdAt: state.minute, attempts: 1,
      stormId: 70, source: "natural", area: { region: remote.id, centre: remote.campCell, radiusKm: 1 },
      announcedAt: state.minute, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    expect(recordOpportunityEvent(state, ended(), world)).toContain("remoteStorm");
  });
});

describe("a hand-played drop credits nothing, at camp or away", () => {
  it("drop() at camp moves the load but credits nothing: the gather already did", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(state.player.pack, "firewood", 6);
    expect(drop(state, world, "firewood", 6)).toBe(6);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("drop() away from camp credits nothing either", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "firewood", 6);
    drop(state, world, "firewood", 6);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("dropAll() at camp credits nothing", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(state.player.pack, "firewood", 3);
    dropAll(state, world);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("dropAll() away from camp credits nothing", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "firewood", 3);
    dropAll(state, world);
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });
});

describe("an heir inherits the world and not the ladder's credit", () => {
  it("lands to a lit fire, a full camp and a standing hut, and advances nothing", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const oldRegion = state.player.region;
    const st = regionState(state, world, oldRegion);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    siteFor(st, st.campCell!).structures.turfHut = true;
    addItem(pile(state, st.campCell!), "firewood", 200);
    const before = activeOpportunityKeys(state, calendar(state.minute, state.startDoy));
    die(state, "froze", regionAt(world, oldRegion).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(activeOpportunityKeys(state, calendar(state.minute, state.startDoy))).toEqual(before);
    expect(state.opportunities.completedAt.fire).toBeUndefined();
    expect(state.opportunities.completedAt.roof).toBeUndefined();
    expect(state.opportunities.stepProgress.firewood?.wood ?? 0).toBe(0);
  });

  it("carries an incomplete opportunity's progress across a real death", () => {
    const { state, world } = announcedGame(17);
    siteCamp(state, world);
    const region = state.player.region;
    recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 6 });
    die(state, "froze", regionAt(world, region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.opportunities.stepProgress.firewood?.wood).toBeCloseTo(6);
    expect(state.opportunities.completedAt.firewood).toBeUndefined();
  });
});
