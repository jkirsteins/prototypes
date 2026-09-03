import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { hourlyHazards } from "../src/sim/hazards";
import { newGame } from "../src/sim/newgame";
import { causeFrom, stepPlayer, workSpeed } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { drink, fillVessels, THIRSTY_L, vesselLitres, WATER_FULL, waterLossPerHour, waterSource } from "../src/sim/water";

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
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 5, 1);
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
    for (let m = 0; m < 60; m++) drains = stepPlayer(state, world, 15, 1);
    expect(h0 - state.player.health).toBeCloseTo(4, 1);
    expect(causeFrom(drains)).toBe("thirst");
    expect(state.log.some((e) => e.text === "You are thirsty.")).toBe(true);
  });

  it("drinks at a shore and not away from water; auto-drink keeps the reserve up while the tab runs", () => {
    const g = newGame(42);
    const { state, world } = g;
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
    placeAtSpot(state, world, state.player.region, "camp");
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
    for (let h = 0; h < 6; h++) hourlyHazards(state, world, cal, -8, -8, rng);
    const skin = state.player.tools.find((t) => t.id === "waterskin")!;
    expect(skin.frozen).toBe(true);
    expect(vesselLitres(state.player)).toBe(0);
    const bucket = state.player.tools.find((t) => t.id === "barkBucket");
    // Six freezing hours at one-in-three: the bucket split (gone) or froze whole; never a drinkable one left.
    expect(bucket === undefined || bucket.frozen === true).toBe(true);
  });
});
