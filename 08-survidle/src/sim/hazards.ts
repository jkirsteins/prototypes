/**
 * The hourly rolls that need a die: what the weather does to your things
 * and your body over an hour. Called from hourlyEvents. iceUnderFoot is the
 * exception: standing on failing ice is a per-minute risk (the ice does not
 * wait for the hour to turn), so advance.ts calls it every step instead.
 */
import type { Rng } from "../rng";
import { cellAt, neighbours, regionAt, type World } from "../world/gen";
import type { Presence } from "./advance";
import type { Calendar } from "./calendar";
import { coldFeet, coldHands, frostbiteChance, FROSTBITE_MINUTES } from "./clothing";
import { fireAt, fuelTotal, groundDry, SPREAD_FUEL_KG, SPREAD_PER_HOUR, SPREAD_UNATTENDED_MINUTES } from "./fire";
import { addItem, qty, removeItem } from "./inventory";
import { TOOLS } from "./items";
import { log } from "./log";
import { activityOf } from "./player";
import { cellOf } from "./position";
import { record } from "./record";
import { burnWoodAround } from "./stocks";
import { campSite, touchedRegions } from "./regionstate";
import { fallChance, fallThrough } from "./tasks";
import type { GameState } from "./types";
import { campWaterCapacity, FREEZE_C } from "./water";
import { ICE_THIN_CM, localWeather } from "./weather";

export function hourlyHazards(state: GameState, world: World, ambient: number, felt: number, rng: Rng): void {
  freezeVessels(state, world, ambient, rng);
  frostbite(state, felt, rng);
}

/** The hour's rolls against camp and land rather than the body: run with nobody home too. */
export function hourlyWorld(state: GameState, world: World, cal: Calendar, ambient: number, rng: Rng, who: Presence | null): void {
  freezeCamps(state, world, ambient, rng, who);
  spread(state, world, cal, rng, who);
}

/**
 * A big fire left unattended on tinder-dry ground can walk off camp: it eats
 * the lean-to and the bough bed on its way, and goes out doing it. The
 * runner banks a fire before it leaves camp (see intent.ts), so this only
 * catches a fire left burning by hand.
 */
function spread(state: GameState, world: World, cal: Calendar, rng: Rng, who: Presence | null): void {
  if (who) {
    const playerDry = groundDry(localWeather(state, world), cal);
    if (playerDry && !state.weather.dryWarned) {
      state.weather.dryWarned = true;
      log(state, "The ground is tinder dry.", "bad");
    }
    if (!playerDry) state.weather.dryWarned = false;
  }
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    if (st.campCell === null || !groundDry(localWeather(state, world, st.campCell), cal)) continue;
    if (!st.fire.lit || fuelTotal(st.fire) <= SPREAD_FUEL_KG || st.fire.unattended <= SPREAD_UNATTENDED_MINUTES) continue;
    if (!rng.chance(SPREAD_PER_HOUR)) continue;
    burnWoodAround(st, world, st.campCell, 10 + rng.int(21));
    // A fire only ever burns where a fire site was cleared, so a site stands here already.
    const site = campSite(st);
    if (site) {
      site.structures.leanTo = false;
      delete site.structureAge.leanTo;
      site.structures.boughBed = false;
    }
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.indoors = false;
    const where = id === who?.region ? "" : ` at ${regionAt(world, id).name}`;
    log(state, `Smoke on the wind. The fire has spread from camp${where}.`, "bad");
  }
}

/**
 * A cold, exposed extremity rolls frostbite for the hour. The numb warning
 * fires only on a fresh bite; a repeat strike while the timer is already
 * running costs the digits for good instead, logged once, and just resets
 * the timer without a second warning.
 */
function frostbite(state: GameState, felt: number, rng: Rng): void {
  const p = state.player;
  const chance = frostbiteChance(felt);
  if (chance <= 0) return;
  if (coldFeet(state, felt) && rng.chance(chance)) {
    const alreadyNumb = p.frostbite.feet > 0;
    if (alreadyNumb && !p.toes) {
      p.toes = true;
      record(state, { kind: "frostbite", part: "toes" });
      log(state, "{You} will not get those toes back.", "bad");
    }
    p.frostbite.feet = FROSTBITE_MINUTES;
    if (!alreadyNumb) log(state, "{Your} feet are numb.", "bad");
  }
  if (coldHands(state, felt) && rng.chance(chance)) {
    const alreadyNumb = p.frostbite.hands > 0;
    if (alreadyNumb && !p.fingers) {
      p.fingers = true;
      record(state, { kind: "frostbite", part: "fingers" });
      log(state, "{You} will not get those fingers back.", "bad");
    }
    p.frostbite.hands = FROSTBITE_MINUTES;
    if (!alreadyNumb) log(state, "{You} cannot feel {your} fingers.", "bad");
  }
}

/**
 * Ice too thin to bear weight at all: standing on it risks the fall every
 * minute you stay. A walk already rolls this per cell as it crosses
 * (tasks.ts, stepWalk), so this is only for standing still on it.
 */
export function iceUnderFoot(state: GameState, world: World, rng: Rng): void {
  if (state.dead) return;
  if (localWeather(state, world).iceCm >= ICE_THIN_CM) return;
  if (activityOf(state.task) === "walk") return;
  const cell = cellOf(state, world);
  if (cellAt(world, cell).terrain !== "water") return;
  if (!rng.chance(fallChance(localWeather(state, world).iceCm))) return;
  const land = neighbours(world, cell).find((n) => cellAt(world, n).terrain !== "water") ?? cell;
  fallThrough(state, world, rng, land);
}

/** A still pack in frost: the water in it freezes; a bark bucket more than half full may split. */
function freezeVessels(state: GameState, world: World, ambient: number, rng: Rng): void {
  const p = state.player;
  if (ambient >= FREEZE_C) return;
  const a = activityOf(state.task);
  if (a === "walk" || a === "heavy" || a === "light") return;
  if (fireAt(state, world)) return;
  for (const t of [...p.tools]) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds || !(t.litres ?? 0) || t.frozen) continue;
    t.frozen = true;
    if (t.id === "barkBucket" && t.litres! > holds / 2 && rng.chance(1 / 3)) {
      p.tools = p.tools.filter((x) => x !== t);
      log(state, "The bucket has split in the frost.", "bad");
    }
  }
}

/** Water left at camp in frost with no fire: it freezes, and a full bucket may split. */
function freezeCamps(state: GameState, world: World, _ambient: number, rng: Rng, who: Presence | null): void {
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    if (st.fire.lit || st.campCell === null) continue;
    if (localWeather(state, world, st.campCell).temperatureC >= FREEZE_C) continue;
    const camp = state.piles[st.campCell];
    if (!camp) continue;
    const litres = qty(camp, "water");
    if (litres <= 1e-9) continue;
    removeItem(camp, "water", litres);
    addItem(camp, "ice", litres);
    // Each bucket at camp rolls the split a carried one does, and takes its share of the ice with it.
    const buckets = qty(camp, "barkBucket");
    const full = litres > campWaterCapacity(camp, campSite(st)) / 2;
    for (let i = 0; i < buckets; i++) {
      if (!full || !rng.chance(1 / 3)) continue;
      removeItem(camp, "barkBucket", 1);
      removeItem(camp, "ice", Math.min(TOOLS.barkBucket.litres!, qty(camp, "ice")));
      log(state, id === who?.region ? "A bucket at camp has split in the frost." : `A bucket at camp in ${regionAt(world, id).name} has split in the frost.`, "bad");
    }
    log(state, id === who?.region ? "The water at camp has frozen." : `The water at camp in ${regionAt(world, id).name} has frozen.`, "bad");
  }
}
