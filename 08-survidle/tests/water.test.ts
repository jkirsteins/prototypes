import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { hourlyHazards, hourlyWorld } from "../src/sim/hazards";
import { addItem, pile, produce, qty, takeUp } from "../src/sim/inventory";
import { itemLabel, take } from "../src/sim/actions";
import { newGame } from "../src/sim/newgame";
import { causeFrom, stepPlayer, workSpeed } from "../src/sim/player";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import {
  campWaterCapacity, drink, fillVessels, ICE_SHORE_CM, pourVessels, THIRSTY_L,
  vesselLitres, WATER_FULL, waterLossPerHour, waterSource,
} from "../src/sim/water";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";

const cal = calendar(0);

describe("water", () => {
  it("loses a tenth of a litre an hour idle and more working, cold or hot", () => {
    const { state, world } = newGame(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(0.1, 6);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    expect(waterLossPerHour(state, 10)).toBeCloseTo(0.35, 6);
    expect(waterLossPerHour(state, -15)).toBeCloseTo(0.35 * 1.3, 6);
    expect(waterLossPerHour(state, 25)).toBeCloseTo(0.35 * 1.3, 6);
    state.task = null;
    const w0 = state.player.water;
    // 5 C ambient plus the starting wool's insulation keeps felt well under
    // the hot threshold (10 C ambient plus that insulation lands at 20.1 C,
    // just over it, which would fold in the 1.3x and hide the plain rate).
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 5, 1);
    expect(w0 - state.player.water).toBeCloseTo(0.1, 2);
  });

  it("thirst slows the work, then drains health at 4 an hour, and names the death", () => {
    const { state, world } = newGame(1);
    state.player.autoDrink = false;
    state.player.water = THIRSTY_L - 0.01;
    expect(workSpeed(state, world)).toBeCloseTo(0.8, 6);
    state.player.water = 0;
    const h0 = state.player.health;
    let drains = { starve: 0, cold: 0, sick: 0, thirst: 0, smoke: 0 };
    for (let m = 0; m < 60; m++) drains = stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(h0 - state.player.health).toBeCloseTo(4, 1);
    expect(causeFrom(drains)).toBe("thirst");
    expect(state.log.some((e) => e.text === "{You} {are} thirsty.")).toBe(true);
  });

  it("drinks at a shore and not away from water; auto-drink keeps the reserve up while the tab runs", () => {
    const g = newGame(42);
    const { state, world } = g;
    // Camp is a shore cell; stand on the dry forest spot first.
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.water = 0.5;
    expect(waterSource(state, world)).toBe(false);
    expect(drink(state, world)).toBe(false);
    placeAtSpot(state, world, state.player.region, "shore");
    expect(waterSource(state, world)).toBe(true);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(WATER_FULL);
    state.player.water = 0.9;
    advance(state, world, 1);
    expect(state.player.water).toBe(WATER_FULL);
  });

  it("a shore under two centimetres of ice still gives water; thicker is iced over", () => {
    const { state, world } = newGame(42);
    placeAtSpot(state, world, state.player.region, "shore");
    state.weather.iceCm = 1.9;
    expect(waterSource(state, world)).toBe(true);
    state.weather.iceCm = 2;
    expect(waterSource(state, world)).toBe(false);
  });

  it("an iced-over shore logs the warning once and offers a disabled drink button saying so", () => {
    const { state, world } = newGame(42);
    placeAtSpot(state, world, state.player.region, "shore");
    state.weather.iceCm = ICE_SHORE_CM + 1;
    advance(state, world, 1);
    const lines = state.log.filter((e) => e.text === "The shore is iced over.");
    expect(lines).toHaveLength(1);
    const html = doHtml(state, world, calendar(state.minute), newUiState());
    expect(html).toContain("iced over");
  });

  it("a working day without drinking ends thirsty and, left alone, dead of thirst before starvation", () => {
    const { state, world } = newGame(17);
    state.player.autoDrink = false;
    state.player.autoEat = false;
    state.player.pack.items.driedMeat = 5;
    advance(state, world, 1440 * 4);
    expect(state.dead?.cause).toBe("thirst");
  });
});

describe("vessels and snow", () => {
  it("a bark bucket carries two litres from the shore and is drunk from anywhere", () => {
    const { state, world } = newGame(42);
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 0 });
    placeAtSpot(state, world, state.player.region, "shore");
    expect(fillVessels(state, world)).toBe(2);
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.water = 0.5;
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBeCloseTo(2.5, 6);
    expect(state.player.tools.find((t) => t.id === "barkBucket")!.litres).toBeCloseTo(0, 6);
  });

  it("melting snow at the fire costs a kilo of wood a litre; thawing frees a frozen vessel", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    state.weather.snowCm = 5;
    // The shore under the camp is iced, or the reserve would fill from it and not from the melt.
    state.weather.iceCm = 4;
    state.player.water = 1;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 1, frozen: true });
    expect(check(state, world, cal, "melt").ok).toBe(true);
    startTask(state, world, cal, "melt");
    advance(state, world, 20);
    // Precision 1, not 6: the fire's warmth pushes felt above the hot threshold
    // for the whole 20 minutes, so the pre-existing thirst drain (waterLossPerHour)
    // also nibbles at the reserve alongside the litre melt adds - the same reason
    // the fuel check below is a loose match rather than an exact one.
    expect(state.player.water).toBeCloseTo(2, 1);
    expect(st.fire.fuelKg).toBeCloseTo(10 - 1 - (3 / 60) * 20, 1);
    expect(check(state, world, cal, "thaw").ok).toBe(true);
    startTask(state, world, cal, "thaw");
    advance(state, world, 15);
    expect(state.player.tools.find((t) => t.id === "barkBucket")!.frozen).toBe(false);
    state.weather.snowCm = 0;
    expect(check(state, world, cal, "melt").why).toBe("no snow to melt");
  });

  it("water in a still pack freezes at -5 and a full bucket may split", () => {
    const { state, world } = newGame(17);
    state.player.tools.push({ id: "waterskin", durability: 100, litres: 3 });
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 2 });
    state.player.energy = 100;
    state.task = null;
    const rng = new Rng(3);
    for (let h = 0; h < 6; h++) hourlyHazards(state, world, -8, -8, rng);
    const skin = state.player.tools.find((t) => t.id === "waterskin")!;
    expect(skin.frozen).toBe(true);
    expect(vesselLitres(state.player)).toBe(0);
    const bucket = state.player.tools.find((t) => t.id === "barkBucket");
    // Six freezing hours at one-in-three: the bucket split (gone) or froze whole; never a drinkable one left.
    expect(bucket === undefined || bucket.frozen === true).toBe(true);
  });
});

function atCamp(seed = 17) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  return { g, state, world, st, camp: pile(state, st.campCell) };
}

describe("water at camp", () => {
  it("capacity is the vessels lying at camp, and a pour stops at the cap", () => {
    const { state, world, camp } = atCamp();
    expect(campWaterCapacity(camp)).toBe(0);
    addItem(camp, "barkBucket", 1);
    addItem(camp, "waterskin", 1);
    expect(campWaterCapacity(camp)).toBe(5);
    addItem(state.player.pack, "waterskin", 1);
    takeUp(state, world, "waterskin");
    state.player.tools.find((t) => t.id === "waterskin")!.litres = 3;
    addItem(camp, "water", 4);
    expect(pourVessels(state.player, camp)).toBe(1);
    expect(qty(camp, "water")).toBe(5);
    expect(state.player.tools.find((t) => t.id === "waterskin")!.litres).toBe(2);
    expect(itemLabel("water", 5)).toBe("5.0 l water");
  });

  it("standing at camp, you drink the camp water", () => {
    const { state, world, camp } = atCamp();
    state.player.water = 1;
    addItem(camp, "barkBucket", 1);
    addItem(camp, "water", 2);
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(3);
    expect(qty(camp, "water")).toBe(0);
  });

  it("camp water freezes without a fire under -5 C and thaws by a fed fire", () => {
    const { state, world, st, camp } = atCamp();
    // Under half the capacity, so no bucket rolls a split and the numbers are exact.
    addItem(camp, "barkBucket", 2);
    addItem(camp, "water", 1.5);
    hourlyWorld(state, world, cal, -8, new Rng(1), { region: state.player.region, atCamp: true });
    expect(qty(camp, "water")).toBe(0);
    expect(qty(camp, "ice")).toBeCloseTo(1.5, 5);
    expect(qty(camp, "barkBucket")).toBe(2);
    expect(state.log.some((l) => l.text === "The water at camp has frozen.")).toBe(true);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    // Two litres an hour: half an hour thaws one.
    advance(state, world, 30);
    expect(qty(camp, "ice")).toBeCloseTo(0.5, 2);
    expect(qty(camp, "water")).toBeCloseTo(1, 2);
  });

  it("a bucket at camp over half full may split in the freeze, same as a carried one", () => {
    const { state, world, camp } = atCamp();
    addItem(camp, "barkBucket", 1);
    addItem(camp, "water", 3);
    // Capacity is one bucket's 2 l; 3 l is over half of that, so the split rolls.
    // Rng(7)'s first draw is 0.0117, under the one-in-three chance, so it fires.
    hourlyWorld(state, world, cal, -8, new Rng(7), { region: state.player.region, atCamp: true });
    expect(qty(camp, "barkBucket")).toBe(0);
    expect(qty(camp, "ice")).toBeCloseTo(1, 5);
    expect(state.log.some((l) => l.text === "A bucket at camp has split in the frost.")).toBe(true);
  });

  it("a fire at camp keeps the water from freezing", () => {
    const { state, world, st, camp } = atCamp();
    addItem(camp, "barkBucket", 1);
    addItem(camp, "water", 2);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    hourlyWorld(state, world, cal, -8, new Rng(1), { region: state.player.region, atCamp: true });
    expect(qty(camp, "water")).toBe(2);
  });

  it("water is never pocketed: produce puts it on the ground", () => {
    const { state, world } = atCamp();
    expect(produce(state, world, "water", 1)).toBe("pile");
  });

  it("water and ice cannot be taken into the pack; they live only in piles", () => {
    const { state, world, camp } = atCamp();
    addItem(camp, "water", 2);
    addItem(camp, "ice", 1);
    expect(take(state, world, "water", 2)).toBe(0);
    expect(take(state, world, "ice", 1)).toBe(0);
    expect(qty(camp, "water")).toBe(2);
    expect(qty(camp, "ice")).toBe(1);
    expect(qty(state.player.pack, "water")).toBe(0);
    expect(qty(state.player.pack, "ice")).toBe(0);
  });
});
