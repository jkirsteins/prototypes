import type { Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import { regionDensity } from "./animals";
import type { Calendar } from "./calendar";
import { addItem, ageStacks, pile, qty, removeItem, tidyPiles } from "./inventory";
import {
  BOUGH_BED_DAYS, FIRE_BURN_KG_PER_HOUR, FIRE_LOW_KG, FIRE_MAX_KG, ITEM_NAMES, RACK_DRY_MINUTES,
  SNARE_CATCH_MAX_AGE,
} from "./items";
import { log } from "./log";
import { atCamp } from "./position";
import { regionState, touchedRegions } from "./regionstate";
import { type GameState, PERISHABLES } from "./types";

/** Fires, racks and rot, every minute, everywhere. */
export function stepCamp(state: GameState, world: World, ambient: number, dt: number): void {
  const p = state.player;
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const mine = id === p.region;
    const name = () => regionAt(world, id).name;

    if (st.fire.lit) {
      st.fire.fuelKg -= (FIRE_BURN_KG_PER_HOUR / 60) * dt;
      if (st.fire.fuelKg <= FIRE_LOW_KG && mine && atCamp(state, world) && p.autoFeed) {
        feedFire(state, world, id, FIRE_MAX_KG - st.fire.fuelKg);
      }
      if (st.fire.fuelKg <= 0) {
        st.fire.fuelKg = 0;
        st.fire.lit = false;
        log(state, mine ? "The fire has gone out." : `The fire at ${name()} has gone out.`, "bad");
      }
    }

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

  }
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv) continue;
    const region = cellAt(world, cell).region;
    reportSpoil(state, ageStacks(inv, dt, ambient), region === p.region ? "" : ` at ${regionAt(world, region).name}`);
  }
  reportSpoil(state, ageStacks(p.pack, dt, ambient), " in your pack");
  tidyPiles(state);
}

function reportSpoil(state: GameState, lost: ReturnType<typeof ageStacks>, where: string) {
  for (const k of PERISHABLES) {
    const kg = lost[k];
    if (kg) log(state, `${kg.toFixed(1)} kg of ${ITEM_NAMES[k]} has gone off${where}.`, "bad");
  }
}

/** Puts up to `wantKg` of firewood on the fire from pack and camp pile. Returns kg added. */
export function feedFire(state: GameState, world: World, region: number, wantKg: number): number {
  const st = regionState(state, world, region);
  const room = Math.max(0, Math.min(wantKg, FIRE_MAX_KG - st.fire.fuelKg));
  let added = 0;
  for (const inv of [state.player.pack, pile(state, st.campCell)]) {
    if (added >= room - 1e-9) break;
    added += removeItem(inv, "firewood", room - added);
  }
  st.fire.fuelKg += added;
  return added;
}

export function firewoodAt(state: GameState, world: World, region: number): number {
  return qty(state.player.pack, "firewood") + qty(pile(state, regionState(state, world, region).campCell), "firewood");
}

/** Once a day at 04:00: snares catch, catches rot, forest regrows. */
export function dailyCamp(state: GameState, world: World, cal: Calendar, rng: Rng): void {
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
        if (st.pop.hare >= 1 && rng.chance(0.3 * d)) {
          st.pop.hare -= 1;
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
    const forestCells = r.forest * r.cells.length;
    st.wood = Math.min(r.wood0, st.wood + (0.5 * forestCells) / 365);
  }
}
