import type { Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import type { Presence } from "./advance";
import { absence, popOf, regionDensity } from "./animals";
import { calendar, DAILY_HOUR, lastDusk, minutesUntilDawn, type Calendar } from "./calendar";
import { addItem, ageStacks, pile, qty, removeItem, tidyPiles, totalQty } from "./inventory";
import { burnPerHour, dryWood, EMBER_MINUTES, EMBER_RAIN_RATE, fuelTotal, hasEmbers, roofed, stepFieldFire, stepSmoke } from "./fire";
import { goalDeed, KEPT_DAYS } from "./goals";
import {
  BOUGH_BED_DAYS, DECAYING, EGG_FROM_DOY, EGG_TO_DOY, FIRE_MAX_KG, FOODS, type FoodId, ITEM_NAMES, MEAT_DRY_RATIO, RACK_DRY_MINUTES, RACK_DRY_RAIN_MINUTES,
  RACK_MAX_KG, SNARE_CATCH_MAX_AGE, SNARE_ODDS_PER_NIGHT, SNOW_MELT_DAYS, STRUCTURE_LIFE_DAYS, TRAP_HOLD_KG, TRAP_ODDS,
} from "./items";
import { noteLarder } from "./ledger";
import { log } from "./log";
import { campSite, regionState, touchedRegions } from "./regionstate";
import { seepGround } from "./seep";
import { masteryOf, skillLevel, yieldFactor } from "./skills";
import { fishItem, SPECIES_DEFS } from "./species";
import { growRoots, nestsFor, rootStockFor } from "./stocks";
import { type DecayingId, type GameState, type Site, PERISHABLES } from "./types";
import { ICE_SHORE_CM, THAW_L_PER_HOUR } from "./water";
import { localWeather } from "./weather";
import { noteHuntFoodLost, noteHuntFoodTransformed } from "./hunt-audit";

/** Re-exported so every caller that wants the figure (tests included) reaches it through camp.ts, beside dailyCamp's own use of it. */
export { rootStockFor };

/** Fires, racks and rot, every minute, everywhere; `who` is null with nobody home. */
export function stepCamp(state: GameState, world: World, ambient: number, dt: number, who: Presence | null): void {
  if (who) stepFieldFire(state, world, ambient, dt);
  const cal = calendar(state.minute, state.startDoy);
  // Read here rather than after: dailyCamp's own gate below flips state.lastDay
  // later in this same tick, so this still catches the one tick the day turns.
  const daily = cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR;
  // True on the single tick dawn falls in, however long dt is: the tick just
  // before this one had dawn less than dt minutes off.
  const dawnThisTick = minutesUntilDawn(state.minute - dt, state.startDoy) <= dt + 1e-9;
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const region = regionAt(world, id);
    const weather = localWeather(state, world, st.campCell ?? region.campCell ?? region.cells[0]);
    const ambient = weather.temperatureC;
    const mine = who !== null && id === who.region;
    const atCampHere = mine && who!.atCamp;
    const name = () => regionAt(world, id).name;

    st.logsWet = weather.precip !== "none" ? 0 : st.logsWet + dt;

    if (st.fire.lit) {
      const roof = roofed(campSite(st));
      const perMin = burnPerHour(weather, ambient, st) / 60;
      const total = fuelTotal(st.fire);
      if (total > 0) {
        const share = st.fire.wetKg / total;
        st.fire.wetKg = Math.max(0, st.fire.wetKg - perMin * dt * share);
        st.fire.fuelKg = Math.max(0, st.fire.fuelKg - perMin * dt * (1 - share));
      }
      const outOfFuel = fuelTotal(st.fire) <= 0;
      const drownedLow = weather.precip === "heavy" && ambient > 0 && !roof && fuelTotal(st.fire) < 2;
      if (outOfFuel || drownedLow) {
        st.fire.fuelKg = 0;
        st.fire.wetKg = 0;
        st.fire.lit = false;
        st.fire.indoors = false;
        // Rain that beat the fire beat the coals with it; a fire that simply
        // ate its wood leaves them, which is how a night is got through.
        st.fire.embers = drownedLow ? 0 : EMBER_MINUTES;
        if (st.fire.embers <= 0) {
          st.fire.litSince = null;
          st.fire.rainHeld = 0;
        }
        log(state, mine
          ? (st.fire.embers > 0 ? "The flames are down to coals." : "The fire has gone out.")
          : `The fire at ${name()} has gone out.`, "bad");
      }
    }

    if (!st.fire.lit && st.fire.embers > 0) {
      const wet = weather.precip !== "none" && !roofed(campSite(st)) ? EMBER_RAIN_RATE : 1;
      st.fire.embers = Math.max(0, st.fire.embers - dt * wet);
      if (st.fire.embers === 0) {
        st.fire.litSince = null;
        st.fire.rainHeld = 0;
        log(state, mine ? "The last of the coals goes grey." : `The fire at ${name()} is dead.`, "bad");
      }
    }

    // A lit fire left with no one at camp to mind it runs its unattended clock.
    st.fire.unattended = st.fire.lit && !atCampHere ? st.fire.unattended + dt : 0;
    stepSmoke(st, atCampHere, dt);

    // Embers count as alive here same as flame: coals kept through the night
    // or a storm are the whole point of banking a fire rather than a chore
    // that only counts while it is burning bright.
    const fireAlive = st.fire.lit || hasEmbers(st.fire);
    // Held, not just endured: only while the fire is alive and the rain is
    // actually falling on it does the clock run; a dead fire's held time
    // means nothing, so it is cleared at the two death points above.
    const rainingOnIt = fireAlive && weather.precip !== "none";
    if (rainingOnIt) st.fire.rainHeld += dt;
    // These three goals are the player's own only: an untended camp fire in
    // a region the player has left is real, but it is not what the player
    // is being asked to keep. `mine` alone, not `atCampHere`, because being
    // away from the pit within your own camp - out at the snares, asleep -
    // is exactly the case these goals are meant to reward, not punish.
    if (mine) {
      if (rainingOnIt) goalDeed(state, { kind: "keptRain", minutes: st.fire.rainHeld });
      if (fireAlive && st.fire.litSince !== null) {
        const elapsed = state.minute - st.fire.litSince;
        // The daily roll alone can sit up to a day short of the target, since it only
        // ever samples DAILY_HOUR: a fire lit mid-morning reaches three days mid-morning
        // too, a span the roll does not visit until the next one. Emitting again the
        // instant elapsed crosses KEPT_DAYS lands the credit on the day it is earned;
        // goalDeed already ignores a goal once done, so the daily roll's own emission
        // afterwards costs nothing.
        const crossedKeptDays = elapsed >= KEPT_DAYS * 24 * 60 && elapsed - dt < KEPT_DAYS * 24 * 60;
        if (daily || crossedKeptDays) goalDeed(state, { kind: "keptFor", minutes: elapsed });
      }
      if (dawnThisTick && fireAlive && st.fire.litSince !== null && st.fire.litSince <= lastDusk(state.minute, state.startDoy)) {
        goalDeed(state, { kind: "keptNight" });
      }
    }

    if (st.rack.kg > 0) {
      // Dry air dries; rain dries at half the rate, so two dry days become four wet ones.
      st.rack.dried += weather.precip === "none" ? dt : dt * (RACK_DRY_MINUTES / RACK_DRY_RAIN_MINUTES);
      if (st.rack.dried >= RACK_DRY_MINUTES && st.campCell !== null) {
        const dried = st.rack.kg / MEAT_DRY_RATIO;
        addItem(pile(state, st.campCell), "driedMeat", dried);
        noteHuntFoodTransformed(state, "rack", "driedMeat", st.rack.kg, dried, true);
        log(state, `${st.rack.kg.toFixed(1)} kg of meat has dried to ${dried.toFixed(1)} kg at ${name()}.`, "good");
        st.rack.kg = 0;
        st.rack.dried = 0;
      }
    }

    // A bucket of ice by a fed fire thaws itself; nobody has to tend it.
    if (st.fire.lit && st.fire.fuelKg > 0 && st.campCell !== null) {
      const campPile = state.piles[st.campCell];
      const ice = campPile ? qty(campPile, "ice") : 0;
      if (campPile && ice > 1e-9) {
        const melt = Math.min(ice, (THAW_L_PER_HOUR / 60) * dt);
        removeItem(campPile, "ice", melt);
        addItem(campPile, "water", melt);
        if (ice - melt <= 1e-9) log(state, mine ? "The ice at camp has thawed." : `The ice at camp in ${name()} has thawed.`, "good");
      }
    }

  }
  dryWood(state, dt, who, world);
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv || !PERISHABLES.some((id) => inv.stacks[id]?.length)) continue;
    const region = cellAt(world, cell).region;
    reportSpoil(state, ageStacks(inv, dt, localWeather(state, world, cell).temperatureC), region === who?.region ? "" : ` at ${regionAt(world, region).name}`);
  }
  // Nobody is carrying a pack with nobody home.
  if (who) reportSpoil(state, ageStacks(state.player.pack, dt, ambient), " in {your} pack");
  tidyPiles(state);
}

function reportSpoil(state: GameState, lost: ReturnType<typeof ageStacks>, where: string) {
  for (const k of PERISHABLES) {
    const kg = lost[k];
    if (kg) {
      noteHuntFoodLost(state, k, kg);
      log(state, `${kg.toFixed(1)} kg of ${ITEM_NAMES[k]} has gone off${where}.`, "bad");
    }
  }
}

/**
 * Puts up to `wantKg` of firewood on the fire from pack and camp pile: dry
 * first, then wet unless `dryOnly` asks for none of that (a storm's ladder
 * lights a fresh fire from dry wood alone). Returns kg added.
 */
export function feedFire(state: GameState, world: World, region: number, wantKg: number, dryOnly = false): number {
  const st = regionState(state, world, region);
  const room = Math.max(0, Math.min(wantKg, FIRE_MAX_KG - fuelTotal(st.fire)));
  let added = 0;
  const invs = st.campCell === null ? [state.player.pack] : [state.player.pack, pile(state, st.campCell)];
  for (const inv of invs) {
    if (added >= room - 1e-9) break;
    const took = removeItem(inv, "firewood", room - added);
    st.fire.fuelKg += took;
    added += took;
  }
  if (dryOnly) return added;
  for (const inv of invs) {
    if (added >= room - 1e-9) break;
    const took = removeItem(inv, "wetFirewood", room - added);
    st.fire.wetKg += took;
    added += took;
  }
  return added;
}

/** Dry firewood only: what wet wood in reach cannot count toward a fresh light. */
export function firewoodAt(state: GameState, world: World, region: number): number {
  const camp = regionState(state, world, region).campCell;
  return qty(state.player.pack, "firewood") + (camp === null ? 0 : qty(pile(state, camp), "firewood"));
}

/** Raw meat the camp's racks hold together. */
export function rackCapacity(site: Site | null): number {
  return RACK_MAX_KG * Math.max(1, site?.racks ?? 0);
}

/** Draws a basket trap gets at dawn: four at the start, one more every five levels of fishing past five, capped at eight. */
export function trapDraws(level: number): number {
  return Math.min(8, 4 + Math.floor(Math.max(0, level - 5) / 5));
}

/** The trap's own mastery bonus on top of a draw's odds. */
export function trapFactor(mastery: number): number {
  return mastery >= 50 ? 5 / 3 : mastery >= 20 ? 4 / 3 : 1;
}

/** What the log says when each decaying structure gives out. */
const FALLS: Record<DecayingId, (name: string) => string> = {
  leanTo: (n) => `The lean-to at ${n} has fallen in.`,
  dryingRack: (n) => `The rack at ${n} has rotted through.`,
  turfHut: (n) => `The roof of the hut at ${n} has come down.`,
};

/** A noticed hollow or overhang is re-read after this many days. */
const FOUND_COVER_DAYS = 7;

/**
 * Ages noticed cover by elapsed simulation time. This runs before the task
 * step for the same interval, so cover found at its end begins at age zero.
 */
export function stepFoundCover(state: GameState, dt: number): void {
  for (const id of touchedRegions(state)) {
    for (const site of Object.values(state.regions[id].sites)) {
      if (site.cover === 0) continue;
      site.coverAge += dt;
      if (site.coverAge < FOUND_COVER_DAYS * 1440) continue;
      site.cover = 0;
      site.coverAge = 0;
    }
  }
}

/**
 * Like found cover, emergency work decays by elapsed minutes, not daily
 * rolls: a build just before 04:00 still gets fourteen complete days.
 * Partial work rots too, everywhere, even with nobody there to see it fall.
 */
export function stepEmergencyShelter(state: GameState, world: World, dt: number): void {
  for (const id of touchedRegions(state)) {
    for (const site of Object.values(state.regions[id].sites)) {
      if (site.emergencyMinutes <= 0) continue;
      site.emergencyAge += dt;
      if (site.emergencyAge < 14 * 1440) continue;
      site.emergencyMinutes = 0;
      site.emergencyAge = 0;
      log(state, `The emergency shelter at ${regionAt(world, id).name} has fallen in.`, "bad");
    }
  }
}

/** Lean food: fully lean meat and fish (FOODS.leanShare 1), the kind the ceiling caps outright. */
const LEAN_FOOD_IDS = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].leanShare === 1);

/** Once a day at 04:00: snares catch, catches rot, forest regrows. */
export function dailyCamp(state: GameState, world: World, cal: Calendar, rng: Rng, who: Presence | null): void {
  for (const id of touchedRegions(state)) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    if (who && id === who.region) {
      const campInvs = st.campCell === null ? [state.player.pack] : [state.player.pack, pile(state, st.campCell)];
      const leanAtCamp = LEAN_FOOD_IDS.some((f) => totalQty(campInvs, f) > 1e-9);
      noteLarder(state, leanAtCamp);
    }
    if (st.snareCatch.count > 0) {
      st.snareCatch.age += 1440;
      if (st.snareCatch.age > SNARE_CATCH_MAX_AGE) {
        log(state, `A fox got to the snares at ${r.name} before {you} did.`, "bad");
        st.snareCatch.count = 0;
        st.snareCatch.age = 0;
      }
    }
    if (st.snares > 0) {
      const d = regionDensity(state, world, id, "hare", cal);
      for (let i = 0; i < st.snares; i++) {
        if (popOf(st, "hare") >= 1 && rng.chance(SNARE_ODDS_PER_NIGHT * d)) {
          st.pop.hare = popOf(st, "hare") - 1;
          st.snareCatch.count += 1;
        }
      }
    }
    if (st.trap && st.trap.kg > 0) {
      st.trap.age += 1440;
      if (st.trap.age > SNARE_CATCH_MAX_AGE) {
        log(state, `The fish in the trap at ${r.name} have rotted.`, "bad");
        st.trap.kg = 0;
        st.trap.oilyKg = 0;
        st.trap.age = 0;
      }
    }
    if (st.trap) {
      if (localWeather(state, world, st.campCell ?? r.campCell ?? r.cells[0]).iceCm >= ICE_SHORE_CM) {
        log(state, `The ice has taken the trap at ${r.name}.`, "bad");
        st.trap = null;
      } else if (st.trap.kg < TRAP_HOLD_KG) {
        const draws = who ? trapDraws(skillLevel(state, "fishing")) : 4;
        const factor = who ? trapFactor(masteryOf(state, "fishing", "trap")) : 1;
        const kgFactor = who ? yieldFactor(state, "fishing") : 1;
        const present = st.trap.fish.filter((s) => popOf(st, s) >= 1 && !absence(SPECIES_DEFS[s], cal, localWeather(state, world, st.campCell ?? r.campCell ?? r.cells[0]).iceCm));
        for (let i = 0; i < draws && present.length && st.trap.kg < TRAP_HOLD_KG; i++) {
          const s = present[rng.int(present.length)];
          const d = regionDensity(state, world, id, s, cal);
          if (!rng.chance(d * SPECIES_DEFS[s].hunt!.odds * TRAP_ODDS * factor)) continue;
          st.pop[s] = Math.max(0, popOf(st, s) - 1);
          const before = st.trap.kg;
          st.trap.kg = Math.min(TRAP_HOLD_KG, before + (SPECIES_DEFS[s].yields?.meatKg ?? 0) * kgFactor);
          // The class through fishItem, the same call the spear's catch makes, so the without
          // probe shuts the oily side in one place rather than leaking it into the trap.
          if (fishItem(s) === "oilyFish") st.trap.oilyKg += st.trap.kg - before;
        }
      }
    }
    // Nothing decays where nothing stands: every check below is on a structure that
    // must already be true, which cannot hold at a cell with no site raised on it.
    for (const [cell, site] of Object.entries(st.sites)) {
      if (site.structures.boughBed) {
        site.boughBedAge += 1440;
        if (site.boughBedAge >= BOUGH_BED_DAYS * 1440) {
          site.structures.boughBed = false;
          site.boughBedAge = 0;
          log(state, `The bough bed at ${r.name} has gone flat and brown. Lay it again.`, "bad");
        }
      }
      if (site.structures.snowShelter) {
        const mean = localWeather(state, world, Number(cell)).temperatureC;
        site.meltDays = mean > 0 ? site.meltDays + 1 : 0;
        if (site.meltDays >= SNOW_MELT_DAYS) {
          site.structures.snowShelter = false;
          site.meltDays = 0;
          log(state, `The snow shelter at ${r.name} has slumped.`, "bad");
        }
      }
      for (const sid of DECAYING) {
        if (!site.structures[sid]) continue;
        site.structureAge[sid] = (site.structureAge[sid] ?? 0) + 1440;
        if (site.structureAge[sid]! < STRUCTURE_LIFE_DAYS[sid] * 1440) continue;
        site.structures[sid] = false;
        delete site.structureAge[sid];
        if (sid === "dryingRack") {
          if (Number(cell) === st.campCell) { st.rack.kg = 0; st.rack.dried = 0; }
          site.racks = 0;
        }
        if (sid === "turfHut" && Number(cell) === st.campCell) st.fire.indoors = false;
        log(state, FALLS[sid](r.name), "bad");
      }
    }
    if (st.iceHole) {
      st.iceHole = null;
      if (who && id === who.region) log(state, "The ice hole has skinned over.");
    }
    if (cal.dayOfYear === EGG_FROM_DOY) st.nests = nestsFor(world, st, id);
    if (cal.dayOfYear === EGG_TO_DOY + 1) st.nests = 0;
    growRoots(st, world, cal.dayOfYear);
    // What the region's forest puts back in a year is its patches' own growth
    // added up, not a figure per cell: what a stand grows follows its ground.
    st.wood = Math.min(r.wood0, st.wood + r.treeGrowthPerYear / 365);
  }
}

/** Past two thirds of its life a lean-to needs re-roofing, a rack relashing, a hut a new roof; the camp panel says so. */
export function needsMending(site: Site | null, id: DecayingId): boolean {
  return site !== null && site.structures[id] && (site.structureAge[id] ?? 0) >= (STRUCTURE_LIFE_DAYS[id] * 1440 * 2) / 3;
}

/**
 * What a camp leaves when the survivor moves on. Nothing travels: the fuel comes off
 * the fire and the meat off the rack into the pile at the cell they stood on, and the
 * survivor may walk back for them. The fire itself does not survive the move either -
 * it dies exactly as it would running out of fuel, coals and all, so a camp left
 * behind and a camp burnt out come to the same state.
 */
export function leaveCamp(state: GameState, world: World): void {
  const st = regionState(state, world, state.player.region);
  // A first siting leaves nothing behind: there is no old cell to tip a fire into.
  if (st.campCell === null) return;
  const old = pile(state, st.campCell);
  const dry = st.fire.fuelKg;
  const wet = st.fire.wetKg;
  const meat = st.rack.kg;
  if (dry > 1e-9) addItem(old, "firewood", dry);
  if (wet > 1e-9) addItem(old, "wetFirewood", wet);
  if (meat > 1e-9) addItem(old, "rawMeat", meat);
  st.fire.lit = false;
  st.fire.fuelKg = 0;
  st.fire.wetKg = 0;
  st.fire.indoors = false;
  st.fire.unattended = 0;
  st.fire.embers = 0;
  st.fire.litSince = null;
  st.fire.rainHeld = 0;
  st.smoke = 0;
  st.rack.kg = 0;
  st.rack.dried = 0;
}

/** Stable environmental capabilities offered by this exact cell. */
export function cellPossibilities(world: World, cell: number): string[] {
  return seepGround(world, cell) ? ["seep possible"] : [];
}
