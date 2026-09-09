import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { drop, dropAll, eat, take } from "../src/sim/actions";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { activeGoals, checkWinterStores, goalDeed, GOALS } from "../src/sim/goals";
import { setSkillLevel } from "../src/sim/horizon";
import { startIntent } from "../src/sim/intent";
import { addItem, pile, qty, removeItem } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { beginAgain, land } from "../src/sim/landing";
import { orderByHand } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { campSite, regionState, siteFor } from "../src/sim/regionstate";
import { check, DEADWOOD_KG, startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import { drink } from "../src/sim/water";
import { siteCamp } from "./siting-helpers";

const cal = calendar(0);

describe("deeds reach the ladder", () => {
  it("the first goal is choosing where to live, credited by making camp", () => {
    const { state } = newGame(3);
    expect(GOALS[0].id).toBe("site");
    expect(goalDeed(state, { kind: "task", id: "makeCamp" })).toContain("site");
  });

  it("does not infer the roof goal from shelter already standing", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell ?? 0).structures.leanTo = true;
    advance(state, world, 1);
    expect(state.goals.done.roof).toBeUndefined();
  });

  it("does not credit a windbreak as a roof", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "sheltered", protection: 1 })).not.toContain("roof");
    expect(state.goals.done.roof).toBeUndefined();
  });

  it("credits weatherproof shelter as the roof outcome", () => {
    const { state } = newGame(3);
    expect(goalDeed(state, { kind: "sheltered", protection: 2 })).toContain("roof");
    expect(state.goals.done.roof).toBe(true);
  });

  it("keeps every existing built deed as a route to the roof goal", () => {
    for (const structure of ["leanTo", "turfHut", "snowShelter", "cabin"] as const) {
      const { state } = newGame(3);
      expect(goalDeed(state, { kind: "built", structure })).toContain("roof");
      expect(state.goals.done.roof).toBe(true);
    }
  });

  it("does not treat ordinary sleep as exploration", () => {
    const { state, world } = newGame(3);
    state.task = { id: "sleep", progress: 0, duration: 0, repeat: false };
    stepTask(state, world, cal, new Rng(1), 1);
    expect(state.goals.done.explore).toBeUndefined();
  });

  it("credits a real drink and food with non-lean energy", () => {
    const { state, world } = newGame(3);
    state.player.water = 1;
    placeAtSpot(state, world, state.player.region, "shore");
    expect(drink(state, world)).toBe(true);
    expect(state.goals.done.drink).toBe(true);
    addItem(state.player.pack, "berries", 0.2);
    expect(eat(state, world, "berries", new Rng(1))).toBeGreaterThan(0);
    expect(state.goals.done.fat).toBe(true);
  });

  it("distinguishes a first standing camp order from a longer one", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    setSkillLevel(state, "woodcraft", 3);
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, "job");
    expect(state.goals.done.firstOrder).toBe(true);
    expect(state.goals.done.longOrder).toBeUndefined();
    setSkillLevel(state, "woodcraft", 5);
    orderByHand(state, world, cal, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(state.goals.done.longOrder).toBe(true);
  });

  it("recognizes full winter food and fuel reserves on the daily roll", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    addItem(camp, "driedMeat", 81);
    addItem(camp, "fat", 21);
    addItem(camp, "firewood", 610);
    addItem(camp, "log", 301);
    advance(state, world, 24 * 60);
    expect(state.goals.done.winterStores).toBe(true);
  });

  it("requires each named winter store instead of accepting substitutes", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    addItem(camp, "driedMeat", 140);
    addItem(camp, "firewood", 1000);
    checkWinterStores(state);
    expect(state.goals.done.winterStores).toBeUndefined();
    addItem(camp, "fat", 20);
    addItem(camp, "log", 300);
    checkWinterStores(state);
    expect(state.goals.done.winterStores).toBe(true);
  });

  it("counts a newly made tool as preparing a replacement", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "stick", 2);
    addItem(state.player.pack, "cordage", 1);
    const o = check(state, world, cal, "craft", "fireDrill");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "craft", "fireDrill")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.goals.done.toolCare).toBe(true);
  });

  it("credits the fire when this survivor lights one", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    state.goals.done.firewood = true;
    placeAt(state, world, st.campCell!);
    // Everything a light needs, so the deed is the only thing under test.
    siteFor(st, st.campCell!).structures.firePit = true;
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, o.duration + 1);
    // No rain at landing means lightingInRain's failChance is 0: this light
    // cannot fail, so the fire goal must be credited outright.
    expect(st.fire.lit).toBe(true);
    expect(state.goals.done.fire).toBe(true);
  });

  it("credits nothing when the tinder does not catch", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    siteFor(st, st.campCell!).structures.firePit = true;
    // Rain with no roof gives a one-in-three fail chance; seed 7 rolls it.
    state.weather.precip = "light";
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    const rng = new Rng(7);
    for (let m = 0; m < o.duration + 1 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(st.fire.lit).toBe(false);
    expect(state.goals.done.fire).toBeUndefined();
  });

  it("does not credit the fire to a survivor who only found one burning", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    advance(state, world, 60);
    expect(state.goals.done.fire).toBeUndefined();
  });

  it("credits nothing for firewood that just exists in a pile, since nobody gathered it", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 40);
    advance(state, world, 120);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("credits goal 1 by the kilos a real gather actually produces", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    const o = check(state, world, cal, "deadwood");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "deadwood")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.goals.progress.firewood).toBeCloseTo(DEADWOOD_KG);
    expect(state.goals.done.firewood).toBe(true);
  });

  it("credits goal 1 by the kilos a real split actually produces", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // The landing kit's own axe is what split() needs; no forest cell required.
    addItem(state.player.pack, "log", 1);
    const o = check(state, world, cal, "split");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "split")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.goals.progress.firewood).toBeCloseTo(ITEM_KG.log);
  });

  it("credits goal 1 by the kilos a real splitWedges actually produces", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "log", 1);
    addItem(state.player.pack, "wedge", 2);
    const o = check(state, world, cal, "splitWedges");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "splitWedges")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(state.goals.progress.firewood).toBeCloseTo(ITEM_KG.log);
  });

  it("credits nothing when a standing order carries firewood home and drops it at camp", () => {
    const { state, world } = newGame(17);
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
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("credits nothing for firewood taken out of the camp pile and put straight back", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(pile(state, camp), "firewood", 10);
    expect(take(state, world, "firewood", 10)).toBe(10);
    expect(drop(state, world, "firewood", 10)).toBe(10);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("credits a season goal when the calendar actually turns the corner", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // Backdating lastSeason forces the very next day roll to see a turnover,
    // without simulating the months a real one would take.
    state.goals.lastSeason = "winter";
    advance(state, world, 1440);
    expect(state.goals.lastSeason).toBe("spring");
    expect(state.goals.done.spring).toBe(true);
  });

  it("credits a season only when the calendar turns over into it", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    for (const id of ["firewood", "fire", "cook", "bed", "roof", "water", "store"] as const) {
      state.goals.done[id] = true;
    }
    const before = state.goals.lastSeason;
    // A landing does not credit the season it lands in.
    advance(state, world, 60);
    expect(state.goals.done[before as "winter"]).toBeUndefined();
  });

  it("credits the bed goal when the survivor actually builds one", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(state.player.pack, "stick", 12);
    const o = check(state, world, cal, "build", "boughBed");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "build", "boughBed")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(campSite(st)!.structures.boughBed).toBe(true);
    expect(state.goals.done.bed).toBe(true);
  });

  it("credits the cook goal when the survivor actually cooks over the fire", () => {
    const { state, world } = newGame(3);
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
    expect(state.goals.done.cook).toBe(true);
  });

  it("does not credit cooking when the ingredient is gone at completion", () => {
    const { state, world } = newGame(3);
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
    expect(state.goals.done.cook).toBeUndefined();
  });

  it("credits the store goal when meat actually goes onto the rack", () => {
    const { state, world } = newGame(17);
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
    expect(state.goals.done.store).toBe(true);
  });

  it("credits nothing when the meat is gone before the hang finishes", () => {
    const { state, world } = newGame(17);
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
    expect(state.goals.done.store).toBeUndefined();
  });
});

describe("a hand-played drop credits nothing, at camp or away", () => {
  it("drop() at camp moves the load but credits nothing: the gather already did", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(state.player.pack, "firewood", 6);
    expect(drop(state, world, "firewood", 6)).toBe(6);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("drop() away from camp credits nothing either", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "firewood", 6);
    drop(state, world, "firewood", 6);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("dropAll() at camp credits nothing", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAt(state, world, camp);
    addItem(state.player.pack, "firewood", 3);
    dropAll(state, world);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("dropAll() away from camp credits nothing", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "firewood", 3);
    dropAll(state, world);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });
});

describe("an heir inherits the world and not the ladder's credit", () => {
  it("lands to a lit fire, a full camp and a standing hut, and advances nothing", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const oldRegion = state.player.region;
    const st = regionState(state, world, oldRegion);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    siteFor(st, st.campCell!).structures.turfHut = true;
    addItem(pile(state, st.campCell!), "firewood", 200);
    const before = activeGoals(state, calendar(state.minute, state.startDoy));
    die(state, "froze", regionAt(world, oldRegion).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(activeGoals(state, calendar(state.minute, state.startDoy))).toEqual(before);
    expect(state.goals.done.fire).toBeUndefined();
    expect(state.goals.done.roof).toBeUndefined();
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("carries an incomplete goal's progress across a real death", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const region = state.player.region;
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 6 });
    die(state, "froze", regionAt(world, region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.goals.progress.firewood).toBeCloseTo(6);
    expect(state.goals.done.firewood).toBeUndefined();
  });
});
