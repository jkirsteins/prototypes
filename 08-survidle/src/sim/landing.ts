/**
 * Between two survivors: the gap, the world run with nobody home, the
 * heir's shore and the name screen. The first survivor keeps the start
 * search; every heir lands near the last camp.
 */
import { derive, Rng } from "../rng";
import { CELL_KM } from "../units";
import { cellAt, neighbours, regionOf, type World } from "../world/cells";
import { regionAt } from "../world/gen";
import { passable } from "../world/route";
import { advance } from "./advance";
import { calendar, coastOpen } from "./calendar";
import { fmtWorldDate } from "./epitaph";
import { addItem, pile } from "./inventory";
import { log } from "./log";
import { fmtName, rollName } from "./names";
import { newPerson } from "./newgame";
import { current, newRecord, worldDate } from "./record";
import { DIM, enterRegion, regionState, touchedRegions } from "./regionstate";
import type { GameState, ItemId, RegionState, WorldDate } from "./types";

export const GAP_MIN_DAYS = 90;
export const LANDING_MIN_KM = 3;
export const LANDING_MAX_KM = 20;

/** Rule 4.1: at least a season, and only on the open coast. */
export function landingDate(death: WorldDate): { date: WorldDate; gapDays: number } {
  let { year, doy } = death;
  let gapDays = 0;
  const stepDay = () => {
    doy += 1;
    gapDays += 1;
    if (doy >= 365) {
      doy = 0;
      year += 1;
    }
  };
  for (let i = 0; i < GAP_MIN_DAYS; i++) stepDay();
  while (!coastOpen(doy)) stepDay();
  return { date: { year, doy }, gapDays };
}

function isShore(world: World, idx: number): boolean {
  const c = cellAt(world, idx);
  return passable(c.terrain) && neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
}

/** A shore cell 3 to 20 km from the old camp, the same one every time; the nearest shore if the band is empty. */
export function landingCell(world: World, oldCamp: number, seed: number, index: number): number {
  const cc = cellAt(world, oldCamp);
  const r = Math.ceil(LANDING_MAX_KM / CELL_KM);
  const band: number[] = [];
  let nearest = -1;
  let nearestD = Number.POSITIVE_INFINITY;
  for (let y = Math.max(0, cc.y - r); y <= Math.min(world.h - 1, cc.y + r); y++) {
    for (let x = Math.max(0, cc.x - r); x <= Math.min(world.w - 1, cc.x + r); x++) {
      const idx = y * world.w + x;
      if (!isShore(world, idx)) continue;
      const km = Math.hypot(x - cc.x, y - cc.y) * CELL_KM;
      if (km >= LANDING_MIN_KM && km <= LANDING_MAX_KM) band.push(idx);
      if (km < nearestD && idx !== oldCamp) {
        nearestD = km;
        nearest = idx;
      }
    }
  }
  if (band.length) return band[new Rng(derive(seed, 1000 + index)).int(band.length)];
  return nearest >= 0 ? nearest : oldCamp;
}

/** The pack goes down where the body fell: every count, every kilo, every stack, and the tools as items. */
export function layDownPack(state: GameState, world: World): void {
  const p = state.player;
  // A drowning lays the pack on the water cell itself; the lake keeps it, which is intended.
  const cell = Math.floor(p.y) * world.w + Math.floor(p.x);
  const to = pile(state, cell);
  for (const k of Object.keys(p.pack.items) as ItemId[]) {
    const n = p.pack.items[k] ?? 0;
    if (n > 0) addItem(to, k, n);
    delete p.pack.items[k];
  }
  for (const [k, stacks] of Object.entries(p.pack.stacks)) {
    for (const s of stacks ?? []) {
      to.stacks[k as keyof typeof to.stacks] ??= [];
      to.stacks[k as keyof typeof to.stacks]!.push({ ...s });
    }
    delete p.pack.stacks[k as keyof typeof p.pack.stacks];
  }
  for (const t of p.tools) addItem(to, t.id, 1);
  p.tools = [];
}

/** Every discovered region forgets to dim: seen once, from the journal now, not from standing there. */
export function demoteFog(state: GameState): void {
  for (const id of Object.keys(state.discovered)) state.discovered[Number(id)] = DIM;
}

/** How much stands at a camp: the seven one-off structures plus however many snares. */
function campScore(st: RegionState): number {
  const s = st.structures;
  return (s.firePit ? 1 : 0) + (s.leanTo ? 1 : 0) + (s.cabin ? 1 : 0) + (s.dryingRack ? 1 : 0) + (s.hearth ? 1 : 0) + (s.turfHut ? 1 : 0) + (s.waterStore ? 1 : 0) + s.snares;
}

/**
 * The region the heir's old camp is read from: a fire pit beats no fire pit,
 * then the most built, ties to the lowest id since regions are visited in no
 * particular order. A survivor who died with nothing ever raised anywhere
 * leaves the heir the region they happened to be standing in.
 */
export function oldCampRegion(state: GameState): number {
  let best = -1;
  let bestFirePit = false;
  let bestScore = -1;
  for (const id of touchedRegions(state).sort((a, b) => a - b)) {
    const st = state.regions[id];
    const firePit = st.structures.firePit;
    const score = campScore(st);
    if (!firePit && score === 0) continue;
    if (best < 0 || (firePit && !bestFirePit) || (firePit === bestFirePit && score > bestScore)) {
      best = id;
      bestFirePit = firePit;
      bestScore = score;
    }
  }
  return best >= 0 ? best : state.player.region;
}

const WINDS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
/** One of the eight winds from `from` toward `to`. */
export function bearing(world: World, from: number, to: number): string {
  const a = cellAt(world, from);
  const b = cellAt(world, to);
  // Screen y grows downward, so south is +y.
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return WINDS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Runs the gap and sets the landing phase. The state must be dead. */
export function beginAgain(state: GameState, world: World): void {
  if (!state.dead || state.landing) return;
  const death = worldDate(state, state.dead.minute);
  const { date, gapDays } = landingDate(death);
  const oldCamp = regionState(state, world, oldCampRegion(state)).campCell;
  layDownPack(state, world);
  // To 08:00 of the landing day: minute 0 of a day index is 08:00 in this calendar.
  const deathIndex = calendar(state.dead.minute, state.startDoy).dayIndex;
  const target = (deathIndex + gapDays) * 1440;
  advance(state, world, target - state.minute, { nobody: true });
  // Rebase: the heir's life starts at minute 0 on the landing day.
  const landedYear = worldDate(state).year;
  state.year = landedYear;
  state.startDoy = date.doy;
  state.minute = 0;
  state.lastHour = 0;
  state.lastDay = 0;
  state.weather.rolledDay = 0;
  state.weather.storm = null;
  for (const st of Object.values(state.regions)) st.iceHole = null;
  // The dead survivor's log against the new clock would confuse the landing phase; the heir starts with a clean page.
  state.log = [];
  demoteFog(state);
  const cell = landingCell(world, oldCamp, state.seed, state.survivors.length + 1);
  const name = rollName(new Rng(derive(state.seed, 500 + state.survivors.length)), state.survivors.map((s) => s.name));
  state.landing = { cell, region: regionOf(world, cell % world.w, Math.floor(cell / world.w)), date, gapDays, name, oldCamp };
}

/** Rolls another name for the landing screen, never one already used in this world. */
export function rerollName(state: GameState): void {
  if (!state.landing) return;
  const rng = new Rng(state.rng);
  state.landing.name = rollName(rng, [...state.survivors.map((s) => s.name), state.landing.name]);
  state.rng = rng.s;
}

export function daysInWords(n: number): string {
  return String(n);
}

/** Confirms the name and starts the heir's run. */
export function land(state: GameState, world: World, name = state.landing?.name): void {
  const l = state.landing;
  if (!l || !name) return;
  const last = current(state);
  const oldCamp = l.oldCamp;
  state.survivors.push(newRecord(state.survivors.length + 1, name, l.date, l.gapDays));
  newPerson(state, world, l.cell, l.region);
  state.landing = null;
  enterRegion(state, world, l.region);
  const cc = cellAt(world, oldCamp);
  const lc = cellAt(world, l.cell);
  const km = Math.round(Math.hypot(cc.x - lc.x, cc.y - lc.y) * CELL_KM);
  const oldName = regionAt(world, cellAt(world, oldCamp).region).name;
  log(
    state,
    `${fmtWorldDate(l.date)}. ${daysInWords(l.gapDays)} days after ${fmtName(last.name)} died. You land at ${regionAt(world, l.region).name} with an axe, wool on your back and a kilo of dried meat. The old camp at ${oldName} lies ${km} km ${bearing(world, l.cell, oldCamp)}.`,
  );
}
