import type { Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import type { Presence } from "./advance";
import { popOf, regionDensity } from "./animals";
import type { Calendar } from "./calendar";
import { addItem, ageStacks, pile, qty, removeItem, tidyPiles } from "./inventory";
import { burnPerHour, dryWood, fuelTotal, stepSmoke } from "./fire";
import {
  BOUGH_BED_DAYS, FIRE_LOW_KG, FIRE_MAX_KG, ITEM_NAMES, RACK_DRY_MINUTES,
  SNARE_CATCH_MAX_AGE, STRUCTURE_LIFE_DAYS,
} from "./items";
import { log } from "./log";
import { regionState, touchedRegions } from "./regionstate";
import { type GameState, type RegionState, PERISHABLES } from "./types";
import { THAW_L_PER_HOUR } from "./water";

/** Fires, racks and rot, every minute, everywhere; `who` is null with nobody home. */
export function stepCamp(state: GameState, world: World, ambient: number, dt: number, who: Presence | null): void {
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const mine = who !== null && id === who.region;
    const atCampHere = mine && who!.atCamp;
    const name = () => regionAt(world, id).name;

    st.logsWet = state.weather.precip !== "none" ? 0 : st.logsWet + dt;

    if (st.fire.lit) {
      const roof = st.structures.leanTo || st.structures.cabin;
      const perMin = burnPerHour(state.weather, ambient, roof) / 60;
      const total = fuelTotal(st.fire);
      if (total > 0) {
        const share = st.fire.wetKg / total;
        st.fire.wetKg = Math.max(0, st.fire.wetKg - perMin * dt * share);
        st.fire.fuelKg = Math.max(0, st.fire.fuelKg - perMin * dt * (1 - share));
      }
      if (fuelTotal(st.fire) <= FIRE_LOW_KG && atCampHere && state.player.autoFeed) {
        feedFire(state, world, id, FIRE_MAX_KG - fuelTotal(st.fire));
      }
      const outOfFuel = fuelTotal(st.fire) <= 0;
      const drownedLow = state.weather.precip === "heavy" && ambient > 0 && !roof && fuelTotal(st.fire) < 2;
      if (outOfFuel || drownedLow) {
        st.fire.fuelKg = 0;
        st.fire.wetKg = 0;
        st.fire.lit = false;
        st.fire.indoors = false;
        log(state, mine ? "The fire has gone out." : `The fire at ${name()} has gone out.`, "bad");
      }
    }

    // A lit fire left with no one at camp to mind it runs its unattended clock.
    st.fire.unattended = st.fire.lit && !atCampHere ? st.fire.unattended + dt : 0;
    stepSmoke(st, atCampHere, dt);

    if (st.rack.kg > 0) {
      if (state.weather.precip === "none") st.rack.dried += dt;
      if (st.rack.dried >= RACK_DRY_MINUTES) {
        const dried = st.rack.kg / 3;
        addItem(pile(state, st.campCell), "driedMeat", dried);
        log(state, `${st.rack.kg.toFixed(1)} kg of meat has dried to ${dried.toFixed(1)} kg at ${name()}.`, "good");
        st.rack.kg = 0;
        st.rack.dried = 0;
      }
    }

    // A bucket of ice by a fed fire thaws itself; nobody has to tend it.
    if (st.fire.lit && st.fire.fuelKg > 0) {
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
  dryWood(state, dt, who);
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv) continue;
    const region = cellAt(world, cell).region;
    reportSpoil(state, ageStacks(inv, dt, ambient), region === who?.region ? "" : ` at ${regionAt(world, region).name}`);
  }
  // Nobody is carrying a pack with nobody home.
  if (who) reportSpoil(state, ageStacks(state.player.pack, dt, ambient), " in your pack");
  tidyPiles(state);
}

function reportSpoil(state: GameState, lost: ReturnType<typeof ageStacks>, where: string) {
  for (const k of PERISHABLES) {
    const kg = lost[k];
    if (kg) log(state, `${kg.toFixed(1)} kg of ${ITEM_NAMES[k]} has gone off${where}.`, "bad");
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
  const invs = [state.player.pack, pile(state, st.campCell)];
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
  return qty(state.player.pack, "firewood") + qty(pile(state, regionState(state, world, region).campCell), "firewood");
}

/** Once a day at 04:00: snares catch, catches rot, forest regrows. */
export function dailyCamp(state: GameState, world: World, cal: Calendar, rng: Rng, who: Presence | null): void {
  for (const id of touchedRegions(state)) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    if (st.snareCatch.count > 0) {
      st.snareCatch.age += 1440;
      if (st.snareCatch.age > SNARE_CATCH_MAX_AGE) {
        log(state, `A fox got to the snares at ${r.name} before you did.`, "bad");
        st.snareCatch.count = 0;
        st.snareCatch.age = 0;
      }
    }
    if (st.structures.snares > 0) {
      const d = regionDensity(state, world, id, "hare", cal);
      for (let i = 0; i < st.structures.snares; i++) {
        if (popOf(st, "hare") >= 1 && rng.chance(0.3 * d)) {
          st.pop.hare = popOf(st, "hare") - 1;
          st.snareCatch.count += 1;
        }
      }
    }
    if (st.structures.boughBed) {
      st.boughBedAge += 1440;
      if (st.boughBedAge >= BOUGH_BED_DAYS * 1440) {
        st.structures.boughBed = false;
        st.boughBedAge = 0;
        log(state, `The bough bed at ${r.name} has gone flat and brown. Lay it again.`, "bad");
      }
    }
    for (const sid of ["leanTo", "dryingRack"] as const) {
      if (!st.structures[sid]) continue;
      st.structureAge[sid] = (st.structureAge[sid] ?? 0) + 1440;
      if (st.structureAge[sid]! < STRUCTURE_LIFE_DAYS[sid]! * 1440) continue;
      st.structures[sid] = false;
      delete st.structureAge[sid];
      if (sid === "dryingRack") { st.rack.kg = 0; st.rack.dried = 0; }
      log(state, sid === "leanTo" ? `The lean-to at ${r.name} has fallen in.` : `The rack at ${r.name} has rotted through.`, "bad");
    }
    if (st.iceHole) {
      st.iceHole = null;
      if (who && id === who.region) log(state, "The ice hole has skinned over.");
    }
    const forestCells = r.forest * r.cells.length;
    st.wood = Math.min(r.wood0, st.wood + (0.5 * forestCells) / 365);
  }
}

/** Past two thirds of its life a lean-to needs re-roofing and a rack relashing; the camp panel says so. */
export function needsMending(st: RegionState, id: "leanTo" | "dryingRack"): boolean {
  return st.structures[id] && (st.structureAge[id] ?? 0) >= (STRUCTURE_LIFE_DAYS[id]! * 1440 * 2) / 3;
}
