import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { feedFire } from "../src/sim/camp";
import { burnPerHour, fireSeason, fireWarmth, lightingInRain, smoky } from "../src/sim/fire";
import { hourlyWorld } from "../src/sim/hazards";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, INDOOR_C, warmthTarget } from "../src/sim/player";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { ambientTemperature } from "../src/sim/weather";

const cal = calendar(0);

describe("wet wood", () => {
  it("logs split in rain, or within six hours of it, give wet firewood, which dries by a fire whatever the weather", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "log", 2);
    startTask(state, world, cal, "split");
    state.weather.precip = "light";
    advance(state, world, 20);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(20);
    state.weather.precip = "none";
    st.logsWet = 0;
    advance(state, world, 20);
    // The first batch has sat in the pack the whole 20 minutes, drying at the
    // unsheltered camp's 0.5 kg/h even with no fire yet: a sixth of a kilo gone.
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(20 - 1 / 6, 6);
    // Dries at 2 kg an hour by a lit fire, and keeps at it once it rains again:
    // the fire's own heat does the drying, not a dry sky.
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    const dryBefore = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    advance(state, world, 60);
    const after = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    expect(dryBefore - after).toBeCloseTo(2, 0);
    state.weather.precip = "heavy";
    advance(state, world, 60);
    const afterRain = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    expect(after - afterRain).toBeCloseTo(2, 0);
  });

  it("wet wood on the fire halves its warmth and the fire is smoky", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    addItem(state.player.pack, "firewood", 5);
    addItem(state.player.pack, "wetFirewood", 20);
    feedFire(state, world, state.player.region, 30);
    expect(st.fire.fuelKg).toBe(5);
    expect(st.fire.wetKg).toBe(20);
    expect(smoky(st.fire)).toBe(true);
    expect(fireWarmth(st.fire, true)).toBe(7.5);
    const felt = feltTemperature(state, world, 0);
    st.fire.wetKg = 0;
    expect(feltTemperature(state, world, 0) - felt).toBeCloseTo(7.5, 6);
  });

  it("rain fights the fire: slower lighting that can fail, a faster burn, and heavy rain puts a low fire out", () => {
    const { state, world } = newGame(3);
    const w = state.weather;
    const st = regionState(state, world, state.player.region);
    expect(burnPerHour(w, 5, st)).toBe(3);
    w.precip = "light";
    expect(burnPerHour(w, 5, st)).toBe(4.5);
    expect(lightingInRain(w, 5, false)).toEqual({ minutes: 20, failChance: 1 / 3, blocked: null });
    w.precip = "heavy";
    expect(burnPerHour(w, 5, st)).toBe(6);
    expect(lightingInRain(w, 5, false).blocked).toBe("too wet to light");
    expect(lightingInRain(w, 5, true).blocked).toBeNull();
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 1.5;
    // Push the ambient warm so this is really heavy rain, not heavy snow.
    w.offset = 12;
    expect(ambientTemperature(cal, state.weather)).toBeGreaterThan(0);
    advance(state, world, 1);
    expect(st.fire.lit).toBe(false);
    // The mirror case: heavy snowfall burns at half strength and never puts a fire out at once.
    w.precip = "heavy";
    w.offset = -12;
    expect(ambientTemperature(cal, state.weather)).toBeLessThan(0);
    expect(burnPerHour(w, ambientTemperature(cal, state.weather), st)).toBe(4.5);
    st.fire.lit = true;
    st.fire.fuelKg = 1.5;
    advance(state, world, 1);
    expect(st.fire.lit).toBe(true);
    w.offset = 0;
    // Lighting in light rain: a third of tries fail and cost the wood either way.
    w.precip = "light";
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    let fails = 0;
    for (let seed = 1; seed <= 12; seed++) {
      st.fire.lit = false;
      addItem(state.player.pack, "firewood", 1);
      const o = check(state, world, cal, "light");
      expect(o.duration).toBe(20);
      startTask(state, world, cal, "light");
      const rng = new Rng(seed);
      for (let m = 0; m < 25 && state.task; m++) stepTask(state, world, cal, rng, 1);
      if (!st.fire.lit) fails++;
      st.fire.fuelKg = 0;
    }
    expect(fails).toBeGreaterThan(0);
    expect(fails).toBeLessThan(12);
    expect(qty(state.player.pack, "firewood")).toBe(0);
  });

  it("an unsheltered camp is still the open: wet firewood dries there too, just slowly", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "wetFirewood", 10);
    advance(state, world, 60);
    expect(qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(9.5, 6);
  });

  it("a lit fire dries the camp pile at 2 kg an hour even in heavy rain", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    addItem(pile(state, st.campCell), "wetFirewood", 10);
    state.weather.precip = "heavy";
    advance(state, world, 60);
    expect(qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(8, 6);
  });
});

describe("splitting waits for dry weather", () => {
  it("is blocked in rain and for six hours after, then allowed", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "log", 2);
    state.weather.precip = "light";
    expect(check(state, world, calendar(0), "split")).toMatchObject({ ok: false, why: "waiting for dry weather" });
    state.weather.precip = "none";
    st.logsWet = 60;
    expect(check(state, world, calendar(0), "split").ok).toBe(false);
    st.logsWet = 6 * 60;
    expect(check(state, world, calendar(0), "split").ok).toBe(true);
  });

  it("is allowed in the rain at a camp with a lean-to, and the wood comes out dry", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "log", 1);
    state.weather.precip = "heavy";
    st.structures.leanTo = true;
    expect(check(state, world, calendar(0), "split")).toMatchObject({ ok: true, detail: "one log into 20 kg of firewood, under the roof" });
    startTask(state, world, cal, "split");
    advance(state, world, 15);
    expect(qty(state.player.pack, "firewood") + qty(pile(state, st.campCell), "firewood")).toBeCloseTo(20, 6);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(0);
  });

  it("still waits for dry weather at the same camp with no roof", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "log", 1);
    state.weather.precip = "heavy";
    expect(check(state, world, calendar(0), "split")).toMatchObject({ ok: false, why: "waiting for dry weather" });
  });

  it("judges the split at the camp cell, not wherever the player is standing", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "log", 1);
    st.structures.leanTo = true;
    state.weather.precip = "heavy";
    placeAtSpot(state, world, state.player.region, "shore");
    expect(check(state, world, calendar(0), "split", undefined, st.campCell)).toMatchObject({ ok: true, detail: "one log into 20 kg of firewood, under the roof" });
  });
});

describe("spread and smoke", () => {
  it("fire season is summer or September, not October", () => {
    const sep = calendar((258 - 91) * 1440 + 12 * 60);
    const oct = calendar((288 - 91) * 1440 + 12 * 60);
    expect(fireSeason(sep)).toBe(true);
    expect(fireSeason(oct)).toBe(false);
  });

  it("a big fire left alone on dry August ground spreads at two percent an hour; a banked one never does", () => {
    const { state, world } = newGame(3);
    const july = calendar((200 - 91) * 1440 + 12 * 60);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    st.fire.unattended = 200;
    state.weather.dryDays = 4;
    placeAtSpot(state, world, state.player.region, "forest");
    const wood0 = st.wood;
    const rng = new Rng(9);
    let hours = 0;
    while (st.fire.lit && hours < 400) {
      hourlyWorld(state, world, july, 18, rng, { region: state.player.region, atCamp: false });
      hours++;
    }
    expect(st.fire.lit).toBe(false);
    expect(hours).toBeLessThan(400);
    expect(st.wood).toBeLessThan(wood0);
    expect(st.structures.leanTo).toBe(false);
    expect(state.log.some((e) => e.text.startsWith("Smoke on the wind"))).toBe(true);
    expect(state.log.some((e) => e.text === "The ground is tinder dry.")).toBe(true);
    // Banked to six kilos, or ground that is not dry, or a fire someone sits at: no spread in 400 hours.
    for (const fix of [{ fuel: 6, dry: 4, unattended: 200 }, { fuel: 30, dry: 1, unattended: 200 }, { fuel: 30, dry: 4, unattended: 30 }]) {
      const h = newGame(3);
      const st2 = regionState(h.state, h.world, h.state.player.region);
      st2.structures.firePit = true;
      st2.fire.lit = true;
      st2.fire.fuelKg = fix.fuel;
      st2.fire.unattended = fix.unattended;
      h.state.weather.dryDays = fix.dry;
      for (let k = 0; k < 400; k++) hourlyWorld(h.state, h.world, july, 18, rng, { region: h.state.player.region, atCamp: true });
      expect(st2.fire.lit).toBe(true);
    }
  });

  it("a cabin gets no fire warmth without a hearth; a fire lit indoors warms, smokes, and kills a sleeper", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.cabin = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    const cold = feltTemperature(state, world, 0);
    st.structures.hearth = true;
    expect(feltTemperature(state, world, 0) - cold).toBe(15);
    st.structures.hearth = false;
    st.fire.lit = false;
    state.task = null;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "firewood", 30);
    expect(check(state, world, cal, "lightIndoors").ok).toBe(true);
    expect(check(state, world, cal, "lightIndoors").detail).toContain("fill with smoke");
    startTask(state, world, cal, "lightIndoors");
    advance(state, world, 15);
    expect(st.fire.indoors).toBe(true);
    feedFire(state, world, state.player.region, 30);
    state.player.autoFeed = true;
    advance(state, world, 150);
    expect(st.smoke).toBeGreaterThan(40);
    expect(state.log.some((e) => e.text === "The fire is smoking the place out.")).toBe(true);
    state.player.energy = 30;
    startTask(state, world, cal, "sleep");
    const h0 = state.player.health;
    advance(state, world, 240);
    expect(state.log.some((e) => e.text === "The air is thick. {You} {wake} coughing.")).toBe(true);
    expect(state.player.health).toBeLessThan(h0 - 50);
    advance(state, world, 240);
    expect(state.dead?.cause).toBe("smoke");
  });
});

describe("fuel by shelter", () => {
  it("burns 3 kg an hour in the open and 1.2 under a hut's smoke hole", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const dry = { ...state.weather, precip: "none" as const };
    st.fire.lit = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.structures.leanTo = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.structures.turfHut = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.fire.indoors = true;
    expect(burnPerHour(dry, -20, st)).toBe(1.2);
  });

  it("a cabin with a hearth burns 0.8 kg an hour and holds the room at 10 C, with the fire indoors laying the hearth fire", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.cabin = true;
    st.structures.hearth = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 10);
    // The fire indoors is the row that lays a cabin's hearth fire; the plain light is the pit outside.
    expect(check(state, world, cal, "lightIndoors").detail).toBe("at the hearth");
    startTask(state, world, cal, "lightIndoors");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(true);
    expect(burnPerHour({ ...state.weather, precip: "none" as const }, -20, st)).toBe(0.8);
    // The room is its own temperature: outside air below the floor makes no
    // difference to a body resting in it, and air above the floor does.
    st.fire.fuelKg = 10;
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    expect(feltTemperature(state, world, -30)).toBe(feltTemperature(state, world, INDOOR_C.cabin));
    expect(feltTemperature(state, world, INDOOR_C.cabin + 5)).toBe(feltTemperature(state, world, -30) + 5);
  });

  it("rain only eats an unroofed fire", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const rain = { ...state.weather, precip: "heavy" as const };
    expect(burnPerHour(rain, 5, st)).toBe(6);
    st.structures.turfHut = true;
    expect(burnPerHour(rain, 5, st)).toBe(3);
  });

  it("the plain light is the pit fire even with a hut standing; the fire indoors goes under the smoke hole", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.turfHut = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 10);
    expect(check(state, world, cal, "light").detail).not.toMatch(/smoke hole/);
    startTask(state, world, cal, "light");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(false);
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    // The pit fire fed itself the whole pile; a second light needs its kilo.
    addItem(pile(state, st.campCell), "firewood", 10);
    expect(check(state, world, cal, "lightIndoors").detail).toBe("under the smoke hole");
    startTask(state, world, cal, "lightIndoors");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(true);
  });
});

describe("inside is a temperature", () => {
  it("holds a body in wool above 20 warmth asleep in a hut at -30 with the fire lit, and not with it out", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.turfHut = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    st.fire.indoors = true;
    startTask(state, world, cal, "sleep");
    const lit = feltTemperature(state, world, -30);
    expect(warmthTarget(lit)).toBeGreaterThan(20);
    st.fire.lit = false;
    const out = feltTemperature(state, world, -30);
    expect(out).toBeLessThan(lit - 10);
    expect(INDOOR_C).toEqual({ turfHut: 5, cabin: 10 });
  });
});
