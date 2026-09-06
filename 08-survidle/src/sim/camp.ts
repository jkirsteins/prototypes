import type { Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import { findRoute, routeMinutes } from "../world/route";
import type { Presence } from "./advance";
import { absence, popOf, regionDensity } from "./animals";
import { calendar, type Calendar } from "./calendar";
import { addItem, ageStacks, pile, qty, removeItem, tidyPiles, weight } from "./inventory";
import { burnPerHour, dryWood, fuelTotal, roofed, stepSmoke } from "./fire";
import {
  BOUGH_BED_DAYS, DECAYING, FIRE_LOW_KG, FIRE_MAX_KG, ITEM_NAMES, RACK_DRY_MINUTES, RACK_DRY_RAIN_MINUTES,
  RACK_MAX_KG, SNARE_CATCH_MAX_AGE, STRUCTURES, STRUCTURE_LIFE_DAYS, TRAP_HOLD_KG, TRAP_ODDS,
} from "./items";
import { log } from "./log";
import { baseWalkSpeed } from "./player";
import { regionState, touchedRegions } from "./regionstate";
import { seepGround } from "./seep";
import { masteryOf, skillLevel, yieldFactor } from "./skills";
import { SPECIES_DEFS } from "./species";
import { type DecayingId, type GameState, type RegionState, type SeepClass, type SpotId, PERISHABLES } from "./types";
import { ICE_SHORE_CM, THAW_L_PER_HOUR } from "./water";
import { walkableIce } from "./weather";

/** Fires, racks and rot, every minute, everywhere; `who` is null with nobody home. */
export function stepCamp(state: GameState, world: World, ambient: number, dt: number, who: Presence | null): void {
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const mine = who !== null && id === who.region;
    const atCampHere = mine && who!.atCamp;
    const name = () => regionAt(world, id).name;

    st.logsWet = state.weather.precip !== "none" ? 0 : st.logsWet + dt;

    if (st.fire.lit) {
      const roof = roofed(st);
      const perMin = burnPerHour(state.weather, ambient, st) / 60;
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
      // Dry air dries; rain dries at half the rate, so two dry days become four wet ones.
      st.rack.dried += state.weather.precip === "none" ? dt : dt * (RACK_DRY_MINUTES / RACK_DRY_RAIN_MINUTES);
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

/** Raw meat the camp's racks hold together. */
export function rackCapacity(st: RegionState): number {
  return RACK_MAX_KG * Math.max(1, st.racks);
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
    if (st.trap && st.trap.kg > 0) {
      st.trap.age += 1440;
      if (st.trap.age > SNARE_CATCH_MAX_AGE) {
        log(state, `The fish in the trap at ${r.name} have rotted.`, "bad");
        st.trap.kg = 0;
        st.trap.age = 0;
      }
    }
    if (st.trap) {
      if (state.weather.iceCm >= ICE_SHORE_CM) {
        log(state, `The ice has taken the trap at ${r.name}.`, "bad");
        st.trap = null;
      } else if (st.trap.kg < TRAP_HOLD_KG) {
        const draws = who ? trapDraws(skillLevel(state, "fishing")) : 4;
        const factor = who ? trapFactor(masteryOf(state, "fishing", "trap")) : 1;
        const kgFactor = who ? yieldFactor(state, "fishing") : 1;
        const present = st.trap.fish.filter((s) => popOf(st, s) >= 1 && !absence(SPECIES_DEFS[s], cal, state.weather.iceCm));
        for (let i = 0; i < draws && present.length && st.trap.kg < TRAP_HOLD_KG; i++) {
          const s = present[rng.int(present.length)];
          const d = regionDensity(state, world, id, s, cal);
          if (!rng.chance(d * SPECIES_DEFS[s].hunt!.odds * TRAP_ODDS * factor)) continue;
          st.pop[s] = Math.max(0, popOf(st, s) - 1);
          st.trap.kg = Math.min(TRAP_HOLD_KG, st.trap.kg + (SPECIES_DEFS[s].yields?.meatKg ?? 0) * kgFactor);
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
    for (const sid of DECAYING) {
      if (!st.structures[sid]) continue;
      st.structureAge[sid] = (st.structureAge[sid] ?? 0) + 1440;
      if (st.structureAge[sid]! < STRUCTURE_LIFE_DAYS[sid] * 1440) continue;
      st.structures[sid] = false;
      delete st.structureAge[sid];
      if (sid === "dryingRack") { st.rack.kg = 0; st.rack.dried = 0; st.racks = 0; }
      if (sid === "turfHut") st.fire.indoors = false;
      log(state, FALLS[sid](r.name), "bad");
    }
    if (st.iceHole) {
      st.iceHole = null;
      if (who && id === who.region) log(state, "The ice hole has skinned over.");
    }
    const forestCells = r.forest * r.cells.length;
    st.wood = Math.min(r.wood0, st.wood + (0.5 * forestCells) / 365);
  }
}

/** Past two thirds of its life a lean-to needs re-roofing, a rack relashing, a hut a new roof; the camp panel says so. */
export function needsMending(st: RegionState, id: DecayingId): boolean {
  return st.structures[id] && (st.structureAge[id] ?? 0) >= (STRUCTURE_LIFE_DAYS[id] * 1440 * 2) / 3;
}

/**
 * The word canMoveCamp names for each structure flag that can hold a camp in place, in the order
 * RegionState.structures declares them, snares excepted since they stand on the heath, not the camp cell.
 * Names come from STRUCTURES where a structure is built there; a hearth has no build entry of its own.
 */
const STRUCTURE_WORD: Partial<Record<keyof RegionState["structures"], string>> = {
  firePit: STRUCTURES.firePit.name,
  leanTo: STRUCTURES.leanTo.name,
  cabin: STRUCTURES.cabin.name,
  dryingRack: STRUCTURES.dryingRack.name,
  boughBed: STRUCTURES.boughBed.name,
  hearth: "hearth",
  turfHut: STRUCTURES.turfHut.name,
  waterStore: STRUCTURES.waterStore.name,
};

/** Whether the camp may be moved: nothing built at it, no fire banked, nothing lying in its pile. */
export function canMoveCamp(state: GameState, world: World): { ok: true } | { ok: false; why: string } {
  const st = regionState(state, world, state.player.region);
  for (const [key, word] of Object.entries(STRUCTURE_WORD)) {
    if (st.structures[key as keyof typeof st.structures]) return { ok: false, why: `the ${word} stands there` };
  }
  if (st.fire.lit || fuelTotal(st.fire) > 0) return { ok: false, why: "the fire is banked there" };
  // Read only: pile() would insert an empty inventory at the camp cell, which the map
  // then underlines as though something lay there.
  const p = state.piles[st.campCell];
  const kg = p ? weight(p) : 0;
  if (kg > 1e-9) return { ok: false, why: `${Math.round(kg * 10) / 10} kg lie at the old camp, carry them first` };
  return { ok: true };
}

export interface SiteReport {
  spots: { id: SpotId; minutes: number | null }[];
  /** The ground a seep could be dug in on this cell, or null. */
  seep: SeepClass | null;
}

/** What a cell offers as a camp: the walk to each of the region's other spots from it. */
export function siteReport(state: GameState, world: World, cell: number): SiteReport {
  const region = cellAt(world, cell).region;
  const r = regionAt(world, region);
  const cal = calendar(state.minute, state.startDoy);
  const speed = baseWalkSpeed(state, cal, state.weather);
  // The same ice a walk button in this Here section would cross, not a flat "none": a
  // frozen shore is reachable here exactly when the button next to it says so.
  const ice = walkableIce(state.weather);
  const spots = r.spots
    .filter((s) => s.id !== "camp")
    .map((s) => {
      const route = findRoute(world, cell, s.cell, ice);
      return { id: s.id, minutes: route ? Math.round(routeMinutes(world, route, speed, ice)) : null };
    });
  return { spots, seep: seepGround(world, cell) };
}

/** "forest 6, outcrop 33, shore 22, heath 17 min" - the spots in the region's own order, one "min" for the lot. */
export function siteLine(r: SiteReport): string {
  const parts = r.spots.map((s) => (s.minutes === null ? `${s.id} no way` : `${s.id} ${s.minutes}`));
  return `${parts.join(", ")} min${r.seep ? ", seep possible" : ""}`;
}
