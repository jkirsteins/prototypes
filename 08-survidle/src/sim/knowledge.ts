/**
 * What a survivor knows about the water. A read is an hour at a shore and
 * writes which fish this water holds and where each lies; it is the
 * person's, not the world's, so an heir reads again. The trap and, later,
 * the net set only where a shore is read.
 */
import { cellAt, regionAt, type RegionDef, type World } from "../world/gen";
import { absence } from "./animals";
import type { Calendar } from "./calendar";
import { kmBetween, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { fishSpecies, type Species, SPECIES_DEFS, waterOf } from "./species";
import type { GameState, Observation } from "./types";

/** The fish with capacity in this region whose water this cell touches, in catalogue order. */
export function shoreFish(world: World, region: RegionDef, cell: number): Species[] {
  return fishSpecies().filter((s) => region.capacity[s] && watersideCell(world, cell, waterOf(s) ?? "any"));
}

/** A species' name and where it lies, for a read: "whitefish off the point". Falls back for the rare species with no lie set. */
export function fishLie(s: Species): string {
  const def = SPECIES_DEFS[s];
  return `${def.name} ${def.lie ?? "off the point"}`;
}

export function readShore(state: GameState, world: World, cell: number): Observation {
  const region = regionAt(world, cellAt(world, cell).region);
  const obs: Observation = { minute: state.minute, fish: shoreFish(world, region, cell) };
  state.player.known[cell] = obs;
  return obs;
}

export function isRead(state: GameState, cell: number): boolean {
  return state.player.known[cell] !== undefined;
}

/** This region's read cells: those with fish first, then nearest the camp first. */
export function readCells(state: GameState, world: World, region: number): number[] {
  const camp = regionState(state, world, region).campCell;
  return Object.keys(state.player.known)
    .map(Number)
    .filter((c) => cellAt(world, c).region === region)
    .sort((a, b) => {
      const fa = state.player.known[a].fish.length > 0 ? 0 : 1;
      const fb = state.player.known[b].fish.length > 0 ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (kmBetween(world, a, camp) ?? 0) - (kmBetween(world, b, camp) ?? 0);
    });
}

/** The log line a read writes: present fish with their lies, absent ones with their reason after a semicolon. */
export function readLine(state: GameState, world: World, cal: Calendar, cell: number): string {
  const name = regionAt(world, cellAt(world, cell).region).name;
  const obs = state.player.known[cell];
  if (!obs || obs.fish.length === 0) return `{You} {read} the water at ${name}: nothing lives in this water.`;
  const here: string[] = [];
  const away: string[] = [];
  for (const s of obs.fish) {
    const def = SPECIES_DEFS[s];
    const gone = absence(def, cal, state.weather.iceCm);
    if (gone) away.push(`the ${def.name} are ${def.lie ?? "off the point"}, ${gone}`);
    else here.push(fishLie(s));
  }
  return `{You} {read} the water at ${name}: ${[here.join(", "), away.join(", ")].filter(Boolean).join("; ")}.`;
}
