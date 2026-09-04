import { Rng } from "../rng";
import { CELL_KM, PACK_HARD_KG } from "../units";
import { cellAt, hasSpot, regionAt, spotOf, type World } from "../world/gen";
import { findRoute, routeKm, routeMinutes } from "../world/route";
import { loadRack } from "./actions";
import { absence, popOf, regionDensity } from "./animals";
import { type Calendar, minutesUntilDawn } from "./calendar";
import { cue } from "./cues";
import {
  addItem, canConsume, consume, hasTool, herePile, listItems, pile, produce, qty, reach,
  removeItem, takeUp, tool, toolNear, totalQty, transfer, wearTool, weight,
} from "./inventory";
import {
  BERRY_PICK_KG, CLOTHING, FOODS, ITEM_KG, ITEM_NAMES, MAX_SNARES, RACK_MAX_KG, RECIPES, RECIPE_IDS, STRUCTURES,
  STRUCTURE_IDS, TOOLS, TORCH_BURN_MINUTES,
} from "./items";
import { creditYield } from "./ledger";
import { log } from "./log";
import { baseWalkSpeed, die, ENERGY_RATE, walkSpeed, workSpeed } from "./player";
import {
  chopSticks, craftSuccess, effectiveNeeds, fishKg, gap, gapInjury, huntExtras, injuryChance, MASTERY_CAP,
  masteryKey, masteryLevel, masteryMinutes, oddsFactor, RECOMMENDED, skillLevel, SKILL_NAMES,
  skillOf, spoiledNeeds, train, wearFactor, yieldFactor,
} from "./skills";
import {
  atCamp, cellCenter, cellIndex, cellOf, forestCell, heathCell, hereTerrain,
  placeAt, rockCell, setRegion, spotHere, SPOT_WORDS, straightKm, watersideCell,
} from "./position";
import { lightingInRain, SMOKE_COUGH, splitIsWet, splitSheltered } from "./fire";
import { discovery, regionState } from "./regionstate";
import { fishSpecies, huntedLand, isFish, type Species, SPECIES_DEFS, waterOf } from "./species";
import type {
  GameState, IceMode, Inventory, ItemId, Order, PausedTask, RecipeId,
  SpotId, StructureId, TaskId, ToolId,
} from "./types";
import { campPileHere, campWaterRoom, fillVessels, ICE_SHORE_CM, iceHoleOpen, vesselLitres, vesselLitresCapacity, waterSource, WATER_FULL } from "./water";
import { ambientTemperature, DEEP_SNOW_CM, ICE_SAFE_CM, iceMode, stormNow, walkableIce } from "./weather";

export type TaskGroup = "gather" | "hunt" | "camp" | "craft" | "build" | "move";

export interface TaskOption {
  id: TaskId;
  arg?: string;
  group: TaskGroup;
  label: string;
  /** What it costs or yields, for the button's second line. */
  detail: string;
  /** Minutes at full speed, or 0 when it cannot start. */
  duration: number;
  ok: boolean;
  /** Why it cannot start, when it cannot. */
  why: string;
  repeatable: boolean;
  /** Share already done and waiting to be resumed, when there is one. */
  resume?: number;
  /** Mastery of this action, and the share of the way to the next mastery level. */
  mastery?: { level: number; share: number };
  /** The recommended level, and whether you are under it. */
  recommended?: { text: string; under: boolean };
}

export const SPOT_NAMES = SPOT_WORDS;

/** Work that stays where it was left: the half-felled tree is in that cell of forest. */
const LOCATED = new Set<TaskId>(["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook", "iceHole"]);
/** Work you carry in your hands wherever you go. */
const CARRIED = new Set<TaskId>(["craft", "repair", "sharpen", "light", "lightIndoors", "lightTorch"]);

/** Where a task's unfinished share is remembered, or null if it is not the kind that can be. */
export function pauseKey(state: GameState, world: World, id: TaskId, arg?: string, at = cellOf(state, world)): string | null {
  const a = arg ?? "";
  if (LOCATED.has(id)) return `${id}:${a}@${at}`;
  if (CARRIED.has(id)) return `${id}:${a}`;
  return null;
}

export function pausedFraction(state: GameState, world: World, id: TaskId, arg?: string, at = cellOf(state, world)): number {
  const key = pauseKey(state, world, id, arg, at);
  return key ? (state.paused[key]?.fraction ?? 0) : 0;
}

/** Tasks whose pace depends on the body; the rest are walks and waits. */
const WORK_TASKS = new Set<TaskId>([
  "chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook",
  "craft", "repair", "sharpen", "build", "light", "lightIndoors", "lightTorch", "fill", "iceHole", "hang",
]);

/** The tool a task swings, or null. What check looks for in reach and beginTask takes up. */
export function toolFor(id: TaskId, arg?: string): ToolId | null {
  switch (id) {
    case "chop": case "split": return "axe";
    case "hunt": return "bow";
    case "fish": return "fishingSpear";
    case "craft": return RECIPES[arg as RecipeId]?.tool ?? null;
    case "repair": return "needle";
    case "light": case "lightIndoors": return "fireDrill";
    case "fill": return "barkBucket";
    case "iceHole": return "axe";
    default: return null;
  }
}

/** Berries ripen mid-July and are gone by mid-October. */
export function berrySeason(cal: Calendar): boolean {
  return cal.dayOfYear >= 195 && cal.dayOfYear <= 288;
}

function needsList(needs: { item: string; qty: number; alt?: string }[]): string {
  return needs
    .map((n) => `${n.qty} ${ITEM_NAMES[n.item as keyof typeof ITEM_NAMES]}${n.alt ? ` (or ${ITEM_NAMES[n.alt as keyof typeof ITEM_NAMES]})` : ""}`)
    .join(", ");
}

/**
 * A walk's argument names its target: a spot of the current region, a
 * region's camp, or a bare cell (for things lying about and work set aside).
 * A trailing `:thin` asks the route to cross thin ice rather than the safe
 * ice a plain walk uses when the world has it.
 */
export function walkTarget(state: GameState, world: World, arg: string): { cell: number; label: string; thin: boolean } | null {
  const parts = arg.split(":");
  const thin = parts[parts.length - 1] === "thin";
  if (thin) parts.pop();
  const [kind, val] = parts;
  if (kind === "spot") {
    const s = spotOf(regionAt(world, state.player.region), val as SpotId);
    return s ? { cell: s.cell, label: SPOT_WORDS[val as SpotId], thin } : null;
  }
  if (kind === "region") {
    const r = regionAt(world, Number(val));
    return r ? { cell: r.campCell, label: r.name, thin } : null;
  }
  if (kind === "cell") {
    const cell = Number(val);
    if (!Number.isInteger(cell) || cell < 0 || cell >= world.w * world.h) return null;
    return { cell, label: whereIs(state, world, cell), thin };
  }
  return null;
}

/** The ice a walk crosses water with: thin when asked for and available, safe ice by default, else none. */
function walkIceMode(state: GameState, thin: boolean): IceMode {
  return thin ? "thin" : walkableIce(state.weather);
}

/** "the forest", "camp in Stensund", "a spot 0.4 km east": how a cell is named to the player. */
export function whereIs(state: GameState, world: World, cell: number): string {
  const region = cellAt(world, cell).region;
  const r = regionAt(world, region);
  const spot = r.spots.find((s) => s.cell === cell);
  const inRegion = region === state.player.region ? "" : ` in ${r.name}`;
  if (spot) return `${SPOT_WORDS[spot.id]}${inRegion}`;
  const here = cellCenter(world, cellOf(state, world));
  const there = cellCenter(world, cell);
  const dx = there.x - here.x;
  const dy = there.y - here.y;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
  return `a spot ${straightKm(world, cellOf(state, world), cell).toFixed(1)} km ${dir}${inRegion}`;
}

/** Whether the cell suits a species' spot: its ground, and for the shore, its water. */
function spotSuits(world: World, at: number, spot: SpotId, water: "lake" | "sea" | null): boolean {
  switch (spot) {
    case "forest": return forestCell(world, at);
    case "outcrop": return rockCell(world, at);
    case "heath": return heathCell(world, at);
    case "shore": return watersideCell(world, at, water ?? "any");
    case "camp": return true;
  }
}

const SPOT_WHAT: Record<SpotId, string> = { forest: "forest", outcrop: "rock", heath: "heath", shore: "water", camp: "camp" };

/** What a kill of this species puts on the ground, and the odds of getting one. */
function huntDetail(state: GameState, s: Species, odds: number): string {
  const x = huntExtras(state, s);
  const parts = [`${x.meatKg} kg meat`];
  if (x.hideKg) parts.push(`${x.hideKg} kg hide`);
  if (x.furKg) parts.push(`${x.furKg} kg fur`);
  if (x.fatKg) parts.push(`${x.fatKg} kg fat`);
  if (x.bone) parts.push(`${x.bone} bone`);
  if (x.sinew) parts.push(`${x.sinew} sinew`);
  return `${parts.join(", ")}; ${oddsText(odds)}`;
}

/** "a hare", "an elk": an animal named with the article its name takes; capitalised when it opens a sentence. */
function anAnimal(s: Species, opening = false): string {
  const { name } = SPECIES_DEFS[s];
  const a = "aeiou".includes(name[0]) ? "an" : "a";
  return `${opening ? a[0].toUpperCase() + a.slice(1) : a} ${name}`;
}

/**
 * Species a hunt or a cast could meet from this cell: hunted, of the right
 * kind, about now, and suited by the ground. A species that is away keeps
 * itself out: its seasonal capacity is 0, so its density is too.
 */
function candidates(state: GameState, world: World, cal: Calendar, id: "hunt" | "fish", at: number): { s: Species; w: number }[] {
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const pool = id === "fish" ? fishSpecies() : huntedLand();
  const out: { s: Species; w: number }[] = [];
  for (const s of pool) {
    if (!r.capacity[s] || popOf(st, s) < 1) continue;
    const def = SPECIES_DEFS[s].hunt!;
    if (!spotSuits(world, at, def.spot, waterOf(s))) continue;
    const d = regionDensity(state, world, state.player.region, s, cal);
    if (d <= 0) continue;
    out.push({ s, w: d * def.odds });
  }
  return out;
}

/** How much is about for a hunt or a cast from this cell, by the same weights the draw uses. 0 when the ground suits nothing. */
export function candidateWeight(state: GameState, world: World, cal: Calendar, id: "hunt" | "fish", at: number): number {
  return candidates(state, world, cal, id, at).reduce((a, x) => a + x.w, 0);
}

/** What "anything" turns out to be: drawn by how likely each species is to be met. Null when nothing is about. */
export function drawSpecies(state: GameState, world: World, cal: Calendar, rng: Rng, id: "hunt" | "fish", at: number): Species | null {
  const c = candidates(state, world, cal, id, at);
  const total = c.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let pick = rng.next() * total;
  for (const x of c) {
    pick -= x.w;
    if (pick <= 0) return x.s;
  }
  return c[c.length - 1].s;
}

/**
 * Whether a kit item - arrows for a hunt, a snare for a set-snares job -
 * counts as in reach: in `invs` (the pack, or the pack and the work
 * cell's pile) like any other material, or in the camp pile while the
 * player is standing right on the camp cell. Only there, because leaving
 * camp is what pockets it (provisionKit) - a kit sitting at camp is not
 * "in reach" of work done anywhere else, but it is on the way out, so the
 * judging rule has to see what the pocketing rule is about to move.
 */
function kitInReach(state: GameState, world: World, item: ItemId, invs: Inventory[]): boolean {
  if (totalQty(invs, item) >= 1) return true;
  const st = regionState(state, world, state.player.region);
  return cellOf(state, world) === st.campCell && qty(pile(state, st.campCell), item) >= 1;
}

/** No one sleeps past nine hours: a night's sleep for a working adult, the top of the real band. */
export const SLEEP_CAP_MINUTES = 540;

/**
 * The one place a task's legality and duration are decided. availableTasks
 * and startTask both go through it so the button and the click agree.
 * `at` judges the task at another cell of this region, for an intent that
 * has not walked there yet; ground, camp and reach are all taken there.
 */
export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const o = checkFresh(state, world, cal, id, arg, at);
  const fraction = pausedFraction(state, world, id, arg, at);
  if (fraction > 0 && o.ok) return { ...o, resume: fraction, duration: o.duration * (1 - fraction) };
  if (fraction > 0) return { ...o, resume: fraction };
  return o;
}

export function checkFresh(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const p = state.player;
  const r = regionAt(world, p.region);
  const st = regionState(state, world, p.region);
  const invs = [p.pack, pile(state, at)];
  const camp = at === st.campCell;
  const terrain = cellAt(world, at).terrain;
  const opt = (partial: Partial<TaskOption> & { label: string; group: TaskGroup }): TaskOption => ({
    id, arg, detail: "", duration: 0, ok: true, why: "", repeatable: false, ...partial,
  });
  /** Ground the task needs under foot, with the spot to walk to when it is not. */
  const ground = (ok: boolean, spot: SpotId, what: string, o: TaskOption): TaskOption => {
    if (ok) return o;
    if (!hasSpot(r, spot)) return { ...o, ok: false, why: `no ${what} in ${r.name}` };
    return { ...o, ok: false, why: `stand ${what === "water" ? "by" : "in"} the ${what}; walk to ${SPOT_WORDS[spot]}` };
  };
  const needCamp = (o: TaskOption): TaskOption => (camp ? o : { ...o, ok: false, why: "walk to camp" });

  switch (id) {
    case "chop": {
      const o = ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Fell a tree", detail: `4 logs and ${chopSticks(state, world)} sticks left on the ground`, duration: terrain === "spruce" ? 50 : 60, repeatable: true }));
      if (!o.ok) return o;
      if (stormNow(state.weather, state.minute)) return { ...o, ok: false, why: "too rough" };
      if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };
      if (st.wood < 1) return { ...o, ok: false, why: "nothing left worth felling" };
      return o;
    }
    case "sticks":
      return ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Gather sticks", detail: "6 sticks", duration: 20, repeatable: true }));
    case "bark":
      return ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Strip bark", detail: "4 bark, for cordage", duration: 20, repeatable: true }));
    case "stone":
      return ground(rockCell(world, at), "outcrop", "rock", opt({ group: "gather", label: "Gather stone", detail: `${Math.round(3 * yieldFactor(state, "foraging"))} stone`, duration: 30, repeatable: true }));
    case "berries": {
      const o = ground(heathCell(world, at), "heath", "heath", opt({ group: "gather", label: "Pick berries", detail: `${(BERRY_PICK_KG * yieldFactor(state, "foraging")).toFixed(1)} kg berries, mid-July to mid-October`, duration: 60, repeatable: true }));
      if (!o.ok) return o;
      if (!berrySeason(cal)) return { ...o, ok: false, why: "nothing ripe yet" };
      return o;
    }
    case "split": {
      const sheltered = splitSheltered(state, world, at);
      const o = opt({ group: "camp", label: "Split a log", detail: `one log into 20 kg of firewood${sheltered ? ", under the roof" : ""}`, duration: 15, repeatable: true });
      if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      if (!sheltered && splitIsWet(state, world)) return { ...o, ok: false, why: "waiting for dry weather" };
      return o;
    }
    case "hang": {
      const raw = totalQty(invs, "rawMeat");
      const room = RACK_MAX_KG - st.rack.kg;
      const kg = Math.min(raw, room);
      const o = needCamp(opt({ group: "camp", label: "Hang meat to dry", detail: `5 minutes a kilo; ${RACK_MAX_KG} kg on the rack, two dry days`, duration: Math.max(1, Math.round(5 * kg)), repeatable: false }));
      if (!o.ok) return o;
      if (!st.structures.dryingRack) return { ...o, ok: false, why: "needs a drying rack" };
      if (raw <= 1e-9) return { ...o, ok: false, why: "no raw meat here" };
      if (room <= 1e-9) return { ...o, ok: false, why: "the rack is full" };
      return o;
    }
    case "fill": {
      const holds = vesselLitresCapacity(p) + totalQty(invs, "barkBucket") * TOOLS.barkBucket.litres! + totalQty(invs, "waterskin") * TOOLS.waterskin.litres!;
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Fill vessels", detail: "every vessel in hand, from open water", duration: 5, repeatable: true }));
      if (!o.ok) return o;
      if (holds <= 0) return { ...o, ok: false, why: "needs a vessel" };
      // fillVessels tops every carried vessel off in one call, so a vessel already at
      // capacity has nothing left to gain from another cycle; without this the task
      // repeats forever at the shore instead of walking the full vessel home to pour.
      if (vesselLitresCapacity(p) > 0 && vesselLitres(p) >= vesselLitresCapacity(p) - 1e-9) {
        const camp = pile(state, regionState(state, world, p.region).campCell);
        const why = campWaterRoom(camp) > 0 ? "the vessels are full" : "no vessel at camp to pour into";
        return { ...o, ok: false, why };
      }
      if (state.weather.iceCm >= ICE_SHORE_CM && !iceHoleOpen(state, at)) {
        if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "iced over; needs an axe for an ice hole" };
        return { ...o, detail: `${o.detail}; opens an ice hole first`, duration: 25 };
      }
      return o;
    }
    case "iceHole": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Open an ice hole", detail: "20 minutes with the axe; skins over by morning", duration: 20 }));
      if (!o.ok) return o;
      if (state.weather.iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open" };
      if (iceHoleOpen(state, at)) return { ...o, ok: false, why: "already open here" };
      if (!toolNear(p, "axe", invs)) return { ...o, ok: false, why: "needs an axe" };
      return o;
    }
    case "hunt": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "hunt", at);
        const kinds = huntedLand().filter((k) => r.capacity[k] && popOf(st, k) >= 1 && !absence(SPECIES_DEFS[k], cal, state.weather.iceCm));
        const o = opt({ group: "hunt", label: "Hunt anything", duration: 120, repeatable: true, detail: `whatever is about; ${kinds.length} kind${kinds.length === 1 ? "" : "s"} here` });
        // Ground, then tool, then animal. Kinds live here but none of them keeps to this ground: the forest is where a hunt starts.
        if (kinds.length && !c.length) return ground(false, "forest", "forest", o);
        if (!toolNear(p, "bow", invs)) return { ...o, ok: false, why: "needs a bow" };
        if (!kitInReach(state, world, "arrow", [p.pack])) return { ...o, ok: false, why: "needs arrows in the pack" };
        if (!kinds.length) return { ...o, ok: false, why: "nothing about" };
        return o;
      }
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      if (!def?.hunt || isFish(s)) return { ...opt({ group: "hunt", label: "Hunt" }), ok: false, why: "no such animal" };
      const d = regionDensity(state, world, p.region, s, cal);
      const o = ground(spotSuits(world, at, def.hunt.spot, waterOf(s)), def.hunt.spot, SPOT_WHAT[def.hunt.spot], opt({
        group: "hunt", label: `Hunt ${def.name}`, duration: def.hunt.minutes, repeatable: true,
        detail: huntDetail(state, s, huntOdds(state, world, cal, d, s)),
      }));
      if (!o.ok) return o;
      if (!toolNear(p, "bow", invs)) return { ...o, ok: false, why: "needs a bow" };
      if (!kitInReach(state, world, "arrow", [p.pack])) return { ...o, ok: false, why: "needs arrows in the pack" };
      // Away before empty: the last of a flock lingers in the numbers for weeks after it has gone.
      const gone = absence(def, cal, state.weather.iceCm);
      if (gone) return { ...o, ok: false, why: gone };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
    case "fish": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "fish", at);
        const inRegion = fishSpecies().filter((k) => r.capacity[k] && popOf(st, k) >= 1 && !absence(SPECIES_DEFS[k], cal, state.weather.iceCm));
        // The count is what this water holds: a lake's fish are no comfort at a sea shore.
        const kinds = inRegion.filter((k) => watersideCell(world, at, waterOf(k) ?? "any"));
        const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Fish for anything", duration: 60, repeatable: true, detail: `whatever bites; ${kinds.length} kind${kinds.length === 1 ? "" : "s"} here` }));
        if (!o.ok) return o;
        if (!toolNear(p, "fishingSpear", invs)) return { ...o, ok: false, why: "needs a fishing spear" };
        // Fish in the region but none in this water is the wrong water, not an empty one.
        if (!c.length) return { ...o, ok: false, why: !kinds.length && inRegion.length ? "nothing bites here" : "nothing about" };
        return o;
      }
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      if (!def?.hunt || !isFish(s)) return { ...opt({ group: "hunt", label: "Fish" }), ok: false, why: "no such fish" };
      const water = waterOf(s) ?? "any";
      const d = regionDensity(state, world, p.region, s, cal);
      const kg = fishKg(state, s) * yieldFactor(state, "fishing");
      const o = ground(watersideCell(world, at, water), "shore", "water", opt({
        group: "hunt", label: `Fish for ${def.name}`, duration: def.hunt.minutes, repeatable: true,
        detail: `${kg.toFixed(1)} kg per catch; ${oddsText(huntOdds(state, world, cal, d, s))}`,
      }));
      if (!o.ok) {
        // Standing by the wrong water reads as the wrong water, not as no water at all.
        if (watersideCell(world, at) && !watersideCell(world, at, water)) return { ...o, why: water === "lake" ? `no ${def.name} in salt water` : `no ${def.name} in a lake` };
        return o;
      }
      if (stormNow(state.weather, state.minute)) return { ...o, ok: false, why: "too rough" };
      if (!toolNear(p, "fishingSpear", invs)) return { ...o, ok: false, why: "needs a fishing spear" };
      const away = absence(def, cal, state.weather.iceCm);
      if (away) return { ...o, ok: false, why: away };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      const o = needCamp(opt({ group: "camp", label: `Cook ${ITEM_NAMES[food]}`, detail: "1 kg at a time over the fire", duration: Math.max(1, 10 * kg), repeatable: true }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (kg <= 0) return { ...o, ok: false, why: `no ${ITEM_NAMES[food]} here` };
      return o;
    }
    case "craft": {
      const rid = arg as RecipeId;
      const rec = RECIPES[rid];
      const needs = effectiveNeeds(state, rid);
      const o = opt({ group: "craft", label: rec.name, detail: needsList(needs) + (rec.tool ? `; needs a ${rec.tool === "needle" ? "needle" : rec.tool}` : ""), duration: rec.minutes, repeatable: rec.out.item !== undefined });
      if (rec.tool && !toolNear(p, rec.tool, invs)) return { ...o, ok: false, why: `needs a ${rec.tool === "fishingSpear" ? "fishing spear" : rec.tool}` };
      if (!canConsume(invs, needs)) return { ...o, ok: false, why: "missing materials" };
      return o;
    }
    case "repair": {
      const o = opt({ group: "camp", label: "Mend clothing", detail: "0.5 kg hide; +40 wear on the most worn piece", duration: 30 });
      if (!toolNear(p, "needle", invs)) return { ...o, ok: false, why: "needs a bone needle" };
      if (totalQty(invs, "hide") < 0.5) return { ...o, ok: false, why: "needs 0.5 kg hide" };
      if (!p.clothing.some((g) => g.durability < 100)) return { ...o, ok: false, why: "nothing needs mending" };
      return o;
    }
    case "sharpen": {
      const o = opt({ group: "camp", label: "Sharpen the axe", detail: "1 stone; axe +30", duration: 15 });
      const axe = tool(p, "axe");
      if (!axe) return { ...o, ok: false, why: "no axe" };
      if (totalQty(invs, "stone") < 1) return { ...o, ok: false, why: "needs a stone" };
      if (axe.durability >= 100) return { ...o, ok: false, why: "already sharp" };
      return o;
    }
    case "build": {
      const sid = arg as StructureId;
      const def = STRUCTURES[sid];
      const done = st.build[sid] ?? 0;
      const o = opt({ group: "build", label: def.name, detail: `${needsList(def.needs)}; ${def.desc}`, duration: Math.max(1, def.minutes - done) });
      if (sid === "snare") {
        const o2 = ground(heathCell(world, at), "heath", "heath", o);
        if (!o2.ok) return o2;
        if (st.structures.snares >= MAX_SNARES) return { ...o2, ok: false, why: "five snares is enough here" };
        if (!kitInReach(state, world, "snare", invs)) return { ...o2, ok: false, why: "needs a snare" };
        return o2;
      }
      if (!camp) return { ...o, ok: false, why: "walk to camp" };
      if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };
      if (sid === "cabin" && !st.structures.firePit) return { ...o, ok: false, why: "build the fire pit first" };
      if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% built; materials already laid out` };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
    case "light": {
      const roof = st.structures.leanTo || st.structures.cabin;
      const lr = lightingInRain(state.weather, ambientTemperature(cal, state.weather), roof);
      const o = needCamp(opt({
        group: "camp", label: "Light the fire",
        detail: `fire drill and 1 kg firewood${lr.failChance > 0 ? "; one in three fails in the rain" : ""}`,
        duration: lr.minutes,
      }));
      if (!o.ok) return o;
      if (!st.structures.firePit) return { ...o, ok: false, why: "needs a fire pit" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!toolNear(p, "fireDrill", invs)) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      if (lr.blocked) return { ...o, ok: false, why: lr.blocked };
      return o;
    }
    case "lightTorch": {
      const o = opt({ group: "camp", label: "Light a torch", detail: "burns 1 h; no night penalty on foot, and wolves keep off", duration: 1 });
      if (p.torch.lit) return { ...o, ok: false, why: "a torch is already burning" };
      if (totalQty(invs, "torch") < 1) return { ...o, ok: false, why: "needs a torch" };
      if (camp && st.fire.lit) return { ...o, detail: `${o.detail}; lit from the fire` };
      if (hasTool(p, "fireDrill")) return { ...o, duration: 10, detail: `${o.detail}; with the fire drill` };
      return { ...o, ok: false, why: "needs a fire or a fire drill" };
    }
    case "travel":
    case "walk": {
      const target = walkTarget(state, world, arg ?? "");
      const o = opt({ group: "move", label: id === "travel" ? `Go to ${target?.label ?? "?"}` : `Walk to ${target?.label ?? "?"}`, detail: "" });
      if (!target) return { ...o, ok: false, why: "no such place" };
      if (id === "travel" && discovery(state, cellAt(world, target.cell).region) === 0) return { ...o, ok: false, why: "you know nothing of that country" };
      const from = cellOf(state, world);
      if (target.cell === from) return { ...o, ok: false, why: "you are here" };
      if (target.thin && iceMode(state.weather) !== "thin") return { ...o, ok: false, why: "the ice is not thin here" };
      const ice = walkIceMode(state, target.thin);
      const route = findRoute(world, from, target.cell, ice);
      if (!route) return { ...o, ok: false, why: "no way there on foot" };
      const v = baseWalkSpeed(state, cal, state.weather);
      const minutes = routeMinutes(world, route, v, ice);
      let detail = `${routeKm(route).toFixed(1)} km on foot`;
      if (ice === "thin") detail += `; thin ice, ${Math.round(fallChance(state.weather.iceCm) * 100)}% per crossing cell`;
      const o2 = { ...o, duration: minutes, detail };
      if (weight(p.pack) > PACK_HARD_KG) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "haul": {
      const here = at;
      const campCell = st.campCell;
      // Haul does not read `repeat` (beginTask refuses "haul" outright; the intent's own until governs it), so a loop button beside it would be a promise the button cannot keep.
      const o = opt({ group: "move", label: "Haul to camp", detail: "", repeatable: false });
      if (here === campCell) return { ...o, ok: false, why: "you are at camp" };
      const kg = weight(pile(state, at));
      if (kg <= 0) return { ...o, ok: false, why: "nothing on the ground here" };
      const ice = walkIceMode(state, false);
      const route = findRoute(world, here, campCell, ice);
      if (!route) return { ...o, ok: false, why: "no way to camp on foot" };
      const loaded = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, PACK_HARD_KG + 5), ice);
      const empty = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, 5), ice);
      return { ...o, duration: loaded + empty, detail: `${Math.min(PACK_HARD_KG, kg).toFixed(0)} kg per trip, ${routeKm(route).toFixed(1)} km each way; ${kg.toFixed(0)} kg lying here; stop anywhere and carry on later` };
    }
    case "night":
      return opt({ group: "camp", label: "Camp for the night", detail: `go to camp, make a fire if you can, sleep; ${bedText(state, world)}`, duration: 0 });
    case "wait":
      return opt({ group: "camp", label: "Wait at camp", detail: "rest at camp until there is something to do", duration: 0 });
    case "rest":
      return opt({ group: "camp", label: "Rest", detail: "an hour off your feet", duration: 60, repeatable: true });
    case "sleep": {
      // Until dawn or until rested, whichever is later, and never past the cap.
      const toRested = ((100 - p.energy) / ENERGY_RATE.sleep) * 60;
      const minutes = Math.min(SLEEP_CAP_MINUTES, Math.max(60, minutesUntilDawn(state.minute, state.startDoy), toRested));
      return opt({ group: "camp", label: "Sleep", detail: `until dawn or rested, at most 9 h; ${bedText(state, world)}`, duration: minutes });
    }
    case "melt": {
      const o = needCamp(opt({ group: "camp", label: "Melt snow", detail: "1 kg of the fire's wood for a litre", duration: 15, repeatable: true }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (st.fire.fuelKg < 1) return { ...o, ok: false, why: "the fire is too low" };
      if (state.weather.snowCm < 1) return { ...o, ok: false, why: "no snow to melt" };
      return o;
    }
    case "thaw": {
      const o = needCamp(opt({ group: "camp", label: "Thaw the water", detail: "a frozen vessel by the fire", duration: 10 }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (!p.tools.some((t) => t.frozen) && qty(pile(state, st.campCell), "ice") <= 1e-9) return { ...o, ok: false, why: "nothing is frozen" };
      return o;
    }
    case "lightIndoors": {
      const o = needCamp(opt({
        group: "camp", label: "Light a fire indoors",
        detail: "no smoke hole: the cabin will fill with smoke",
        duration: 10,
      }));
      if (!o.ok) return o;
      if (!st.structures.cabin) return { ...o, ok: false, why: "needs a cabin" };
      if (st.structures.hearth) return { ...o, ok: false, why: "there is a hearth: light it there" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!toolNear(p, "fireDrill", invs)) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      return o;
    }
  }
}

/** What you would lie on and under if you slept here now: "on a bough bed, under your blanket and the roof, by the fire". */
export function bedText(state: GameState, world: World): string {
  const st = regionState(state, world, state.player.region);
  const camp = atCamp(state, world);
  const bed = camp && st.structures.boughBed;
  const roof = camp && (st.structures.cabin || st.structures.leanTo);
  const blanket = state.player.clothing.some((g) => CLOTHING[g.id].slot === "blanket");
  const on = bed ? "on a bough bed" : "on bare ground";
  const under = blanket && roof ? "under your blanket and the roof" : blanket ? "under your blanket" : roof ? "under the roof" : "in the open";
  const fire = camp && st.fire.lit ? ", by the fire" : "";
  return `${on}, ${under}${fire}`;
}

export function huntOdds(state: GameState, world: World, cal: Calendar, density: number, species: Species): number {
  const def = SPECIES_DEFS[species].hunt!;
  let odds = density * def.odds * oddsFactor(state, species);
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= def.night ?? 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  const st = regionState(state, world, state.player.region);
  if (atCamp(state, world) && st.smoke > SMOKE_COUGH) odds *= 0.5;
  if (stormNow(state.weather, state.minute)) odds *= 0.5;
  if (state.player.energy < 20) odds *= 0.5;
  else if (state.player.energy < 30) odds *= 0.75;
  return Math.min(0.95, odds);
}

/** "about N% per try", or "under 1%" when the odds round to nothing but are not actually zero. */
function oddsText(odds: number): string {
  const pct = Math.round(odds * 100);
  return pct === 0 && odds > 0 ? "under 1% per try" : `about ${pct}% per try`;
}

/** Every task the UI should show from where the player stands, legal or not. */
export function availableTasks(state: GameState, world: World, cal: Calendar): TaskOption[] {
  const out: TaskOption[] = [];
  const r = regionAt(world, state.player.region);
  const here = cellOf(state, world);
  for (const id of ["chop", "sticks", "bark", "stone", "berries"] as TaskId[]) out.push(check(state, world, cal, id));
  out.push(check(state, world, cal, "hunt", "any"));
  for (const s of huntedLand()) if (r.capacity[s]) out.push(check(state, world, cal, "hunt", s));
  out.push(check(state, world, cal, "fish", "any"));
  for (const s of fishSpecies()) if (r.capacity[s]) out.push(check(state, world, cal, "fish", s));
  out.push(check(state, world, cal, "cook", "rawMeat"));
  out.push(check(state, world, cal, "cook", "fish"));
  out.push(check(state, world, cal, "light"));
  out.push(check(state, world, cal, "lightIndoors"));
  out.push(check(state, world, cal, "lightTorch"));
  out.push(check(state, world, cal, "split"));
  out.push(check(state, world, cal, "hang"));
  out.push(check(state, world, cal, "sharpen"));
  out.push(check(state, world, cal, "repair"));
  out.push(check(state, world, cal, "rest"));
  out.push(check(state, world, cal, "sleep"));
  out.push(check(state, world, cal, "fill"));
  out.push(check(state, world, cal, "iceHole"));
  for (const id of RECIPE_IDS) out.push(check(state, world, cal, "craft", id));
  for (const id of STRUCTURE_IDS) out.push(check(state, world, cal, "build", id));
  for (const s of r.spots) if (s.cell !== here) out.push(check(state, world, cal, "walk", `spot:${s.id}`));
  out.push(check(state, world, cal, "haul"));
  for (const nb of r.neighbours) out.push(check(state, world, cal, "travel", `region:${nb.id}`));
  return out.map((o) => withProgression(state, world, o));
}

/** Adds what practice says about an option: its mastery, and the level it is meant for. */
export function withProgression(state: GameState, world: World, o: TaskOption): TaskOption {
  const skill = skillOf(o.id, o.arg);
  const key = skill ? masteryKey(state, world, o.id, o.arg) : null;
  if (!skill || !key) return o;
  const minutes = state.skills[skill].mastery[key] ?? 0;
  const m = masteryLevel(minutes);
  const span = masteryMinutes(m + 1) - masteryMinutes(m);
  const out: TaskOption = { ...o, mastery: { level: m, share: m >= MASTERY_CAP ? 1 : (minutes - masteryMinutes(m)) / span } };
  const rec = RECOMMENDED[key];
  if (!rec) return out;
  const g = gap(state, key);
  out.recommended = { text: `${SKILL_NAMES[rec.skill]} ${rec.level}`, under: g > 0 };
  const parts: string[] = [];
  if (g > 0 && o.id === "craft") parts.push(`${Math.round(craftSuccess(state, o.arg as RecipeId) * 100)}% chance it comes out`);
  if (g > 0 && o.id === "build") parts.push(`at ${SKILL_NAMES.building} ${skillLevel(state, "building")} this takes ${(1.3 ** g).toFixed(1)}x as long`);
  if (parts.length) out.detail = out.detail ? `${out.detail}; ${parts.join("; ")}` : parts.join("; ");
  return out;
}

/** Starts a task by hand. Whatever intent was running is over; the task set aside keeps its share. */
export function startTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false, rng?: Rng): boolean {
  if (!beginTask(state, world, cal, id, arg, repeat, rng)) return false;
  state.intent = null;
  return true;
}

/**
 * Starts a task without touching the intent: what the runner calls for each
 * of its steps. Whatever was under way is set aside first, with its share done kept.
 */
export function beginTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false, rng?: Rng): boolean {
  if (state.dead) return false;
  if (id === "night") return false;
  if (id === "haul") return false;
  if (id === "wait") return false;
  const o = check(state, world, cal, id, arg);
  if (!o.ok) return false;
  const need = toolFor(id, arg);
  if (need && !hasTool(state.player, need)) {
    if (id === "fill") {
      if (vesselLitresCapacity(state.player) <= 0 && !takeUp(state, world, "barkBucket")) takeUp(state, world, "waterskin");
    } else takeUp(state, world, need);
  }
  setAside(state, world);
  let any = false;
  if ((id === "hunt" || id === "fish") && arg === "any") {
    // No stream of the caller's own: take one off the saved seed and write it back, so a save round-trips the draw.
    const r = rng ?? new Rng(state.rng);
    const drawn = drawSpecies(state, world, cal, r, id, cellOf(state, world));
    if (!rng) state.rng = r.s;
    if (!drawn) return false;
    arg = drawn;
    any = true;
    log(state, id === "hunt" ? `Fresh sign: ${anAnimal(drawn)}.` : `A swirl under the bank: ${SPECIES_DEFS[drawn].name}.`);
  }
  if (id === "build" && !(regionState(state, world, state.player.region).build[arg as StructureId] ?? 0)) {
    // Materials are committed when the work starts, and stay laid out if you stop.
    consume(reach(state, world), STRUCTURES[arg as StructureId].needs);
    if (arg !== "snare") regionState(state, world, state.player.region).build[arg as StructureId] = 0.001;
  }
  if (id === "walk" || id === "travel") {
    const target = walkTarget(state, world, arg ?? "")!;
    const ice = walkIceMode(state, target.thin);
    const from = cellOf(state, world);
    const path = findRoute(world, from, target.cell, ice) ?? [];
    state.route = { target: target.cell, path, label: target.label, ice, lastLand: from };
    state.task = { id, arg, progress: 0, duration: o.duration, repeat: false };
    return true;
  }
  // Pick up where this task was left, if it was.
  const key = pauseKey(state, world, id, arg);
  const fresh = checkFresh(state, world, cal, id, arg);
  const fraction = key ? (state.paused[key]?.fraction ?? 0) : 0;
  if (key) delete state.paused[key];
  state.task = { id, arg, progress: fresh.duration * fraction, duration: fresh.duration, repeat: repeat && o.repeatable, ...(any ? { any: true } : {}) };
  return true;
}

/** Fills the pack to the hard limit from the pile here, heaviest things first. */
export function loadPack(state: GameState, world: World): void {
  const from = herePile(state, world);
  const pack = state.player.pack;
  let room = PACK_HARD_KG - weight(pack);
  const items = listItems(from).sort((a, b) => ITEM_KG[b.item] - ITEM_KG[a.item]);
  for (const { item, qty: have } of items) {
    if (room <= 1e-9) break;
    const unit = ITEM_KG[item];
    const n = unit >= 1 ? Math.min(have, Math.floor(room / unit + 1e-9)) : Math.min(have, room / unit);
    if (n <= 0) continue;
    transfer(from, pack, item, n);
    room -= n * unit;
  }
}

/** Stops by hand: the intent is over and the task is set aside with its share kept. */
export function stopTask(state: GameState, world: World): void {
  state.intent = null;
  setAside(state, world);
}

/**
 * Sets the current task aside. Work keeps its share where it belongs; a walk
 * simply ends where you stand. Rest and sleep keep nothing.
 */
export function setAside(state: GameState, world: World): void {
  const t = state.task;
  if (!t) return;
  if (t.id === "build" && t.arg !== "snare") {
    const st = regionState(state, world, state.player.region);
    const sid = t.arg as StructureId;
    st.build[sid] = (st.build[sid] ?? 0) + t.progress;
  } else if (t.id === "walk" || t.id === "travel") {
    state.route = null;
  } else {
    const key = pauseKey(state, world, t.id, t.arg);
    const fraction = t.duration > 0 ? Math.min(0.999, t.progress / t.duration) : 0;
    if (key && fraction > 0.005) {
      state.paused[key] = { id: t.id, arg: t.arg, fraction, cell: LOCATED.has(t.id) ? cellOf(state, world) : -1 };
    }
  }
  state.task = null;
}

/** Everything set aside, with whether it can be picked up from where the player stands. */
export function pausedList(state: GameState, world: World, cal: Calendar): { key: string; task: PausedTask; option: TaskOption; here: boolean }[] {
  const here = cellOf(state, world);
  return Object.entries(state.paused).map(([key, task]) => {
    const isHere = task.cell < 0 || task.cell === here;
    const option = isHere
      ? check(state, world, cal, task.id, task.arg)
      : { ...checkFresh(state, world, cal, task.id, task.arg), ok: false, why: `at ${whereIs(state, world, task.cell)}` };
    return { key, task, option, here: isHere };
  });
}

/**
 * The order the live intent serves, when it serves one and the task under
 * way is its work - a night order's work is the sleep it starts, so that
 * alias counts too, the same way it.done already treats them as one.
 */
function liveOrderFor(state: GameState, world: World, id: TaskId, arg?: string): Order | null {
  const it = state.intent;
  if (!it || it.orderId === null) return null;
  const isWork = (it.task === id && (it.arg ?? "") === (arg ?? "")) || (it.task === "night" && id === "sleep");
  if (!isWork) return null;
  return regionState(state, world, state.player.region).orders.find((o) => o.id === it.orderId) ?? null;
}

/** Advances the current task by dt minutes and applies its effect when it completes. */
export function stepTask(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task;
  if (!t || state.dead) return;
  if (t.id === "walk" || t.id === "travel") {
    stepWalk(state, world, cal, rng, dt);
    return;
  }
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state, world) : 1;
  train(state, world, dt);
  // An "any" task is the intent's and the order's work under whatever species it drew.
  const wanted = t.any ? "any" : t.arg;
  // A concrete order or intent (arg "hare") can adopt a task drawn as "any" (steps.ts
  // isRunning treats them as the same work), so try the drawn species too before giving up.
  const order = liveOrderFor(state, world, t.id, wanted) ?? liveOrderFor(state, world, t.id, t.arg);
  if (order) order.minutes += dt;
  t.progress += dt * pace;
  if (t.progress < t.duration) return;

  const id = t.id;
  const arg = t.arg;
  const repeat = t.repeat;
  state.task = null;
  const it = state.intent;
  if (it) {
    if (it.task === id && ((it.arg ?? "") === (wanted ?? "") || (it.arg ?? "") === (arg ?? ""))) {
      it.done++;
      if (order) order.done++;
    } else if (it.task === "night" && id === "sleep") {
      it.done++;
      if (order) order.done++;
    }
    if (id === "sleep" && it.need === "sleep") it.need = null;
    // A rest that barely warmed anyone is not worth repeating: give the need up until warmth
    // recovers some other way, rather than resting here forever for less than a point of gain.
    if (id === "rest" && it.need === "cold") {
      const gained = state.player.warmth - (it.restFromWarmth ?? state.player.warmth);
      if (gained < 1) {
        it.coldSpent = true;
        it.need = null;
      }
    }
  }
  complete(state, world, cal, rng, id, arg);
  if (repeat && !state.dead) {
    // "Anything" draws afresh; state.task is already null, so beginTask sets nothing aside.
    const o = check(state, world, cal, id, wanted);
    if (!o.ok) log(state, `${o.label}: ${o.why}. You stop.`);
    else if (!beginTask(state, world, cal, id, wanted, true, rng)) log(state, `${o.label}: nothing about. You stop.`);
  }
}

/** Chance per thin-ice cell of going through: ten percent at 5 cm, one at 14. */
export function fallChance(iceCm: number): number {
  return Math.max(0, ((ICE_SAFE_CM - iceCm) / 10) * 0.1);
}

/** Through the ice: three in five drown; the rest crawl out onto the last land, soaked and cold, the walk over. */
export function fallThrough(state: GameState, world: World, rng: Rng, land: number): void {
  cue("fallThrough");
  const p = state.player;
  if (rng.chance(0.6)) {
    die(state, "drowned");
    return;
  }
  placeAt(state, world, land);
  p.wetness = 100;
  for (const g of p.clothing) g.wet = 100;
  p.warmth = Math.max(0, p.warmth - 30);
  p.energy = Math.max(0, p.energy - 20);
  state.route = null;
  state.task = null;
  state.intent = null;
  log(state, "Through the ice. You crawl out soaked and shaking.", "bad");
}

/**
 * Moves the player along the route at the speed of the ground under foot.
 * The bar shows minutes: what has passed, and what the rest would take now.
 * Every water cell entered while the ice is under the safe thickness risks a
 * fall, which ends the walk on the spot (the thin-ice warning itself is
 * level-triggered in stepPlayer, which sees the same standing-on-water
 * condition whether you are mid-crossing or stopped).
 */
function stepWalk(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task!;
  const route = state.route;
  if (!route) {
    state.task = null;
    return;
  }
  const p = state.player;
  let km = (walkSpeed(state, cal, state.weather, hereTerrain(state, world), undefined, route.ice) / 60) * dt;
  while (km > 1e-9 && route.path.length) {
    const cell = route.path[0];
    const next = cellCenter(world, cell);
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const distKm = Math.hypot(dx, dy) * CELL_KM;
    if (km >= distKm) {
      p.x = next.x;
      p.y = next.y;
      setRegion(state, world, cellAt(world, cell).region);
      route.path.shift();
      km -= distKm;
      state.stats.km += distKm;
      const terrain = cellAt(world, cell).terrain;
      if (terrain === "water") {
        if (state.weather.iceCm < ICE_SAFE_CM) cue("iceCracks");
        if (state.weather.iceCm < ICE_SAFE_CM && rng.chance(fallChance(state.weather.iceCm))) {
          fallThrough(state, world, rng, route.lastLand);
          return;
        }
      } else {
        route.lastLand = cell;
      }
    } else {
      const f = km / distKm;
      p.x += dx * f;
      p.y += dy * f;
      setRegion(state, world, cellAt(world, cellIndex(world, p.x, p.y)).region);
      state.stats.km += km;
      km = 0;
    }
  }
  t.progress += dt;
  t.duration = t.progress + routeMinutes(world, route.path, baseWalkSpeed(state, cal, state.weather), route.ice);
  if (!route.path.length) {
    const label = route.label;
    const wasTravel = t.id === "travel";
    state.route = null;
    state.task = null;
    placeAt(state, world, cellOf(state, world));
    if (wasTravel) log(state, `You reach ${label}.`);
    if (spotHere(state, world) === "heath") collectSnares(state, world);
  }
}

/** Cuts an ice hole here: takes up an axe from the pack or the pile underfoot if none is in hand, wears it, and opens the hole. Both complete("fill") on an iced shore and complete("iceHole") share this so the two never drift. */
function cutIceHole(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (!hasTool(p, "axe")) takeUp(state, world, "axe");
  wearTool(state, "axe", wearFactor(state, world, "chop"));
  st.iceHole = { cell: cellOf(state, world), minute: state.minute };
  log(state, "You cut a hole in the ice.");
}

function complete(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const invs = reach(state, world);
  switch (id) {
    case "chop": {
      cue("treeFalls");
      st.wood -= 1;
      produce(state, world, "log", 4);
      produce(state, world, "stick", chopSticks(state, world));
      state.stats.trees++;
      if (wearTool(state, "axe", wearFactor(state, world, "chop"))) {
        cue("toolBreaks");
        log(state, "The axe head splits on the last stroke. It is done for.", "bad");
      }
      const axeInjury = p.energy < 20 ? 0.03 : p.energy < 30 ? 0.02 : 0.01;
      if (rng.chance(axeInjury)) {
        p.injured = Math.max(p.injured, 24 * 60);
        p.health = Math.max(1, p.health - 10);
        log(state, "The axe glances off a knot into your shin. You will limp for a day.", "bad");
      }
      return;
    }
    case "sticks": produce(state, world, "stick", 6); return;
    case "bark": produce(state, world, "bark", 4); return;
    case "stone": {
      produce(state, world, "stone", Math.round(3 * yieldFactor(state, "foraging")));
      if (rng.chance(0.1)) {
        produce(state, world, "stone", 1);
        log(state, "A good sharp flint among the stones.", "good");
      }
      return;
    }
    case "berries": {
      const kg = BERRY_PICK_KG * yieldFactor(state, "foraging");
      produce(state, world, "berries", kg);
      creditYield(state, "berries", kg * FOODS.berries.kcalPerKg);
      return;
    }
    case "split": {
      consume(invs, [{ item: "log", qty: 1 }]);
      const wet = !splitSheltered(state, world, cellOf(state, world)) && splitIsWet(state, world);
      produce(state, world, wet ? "wetFirewood" : "firewood", ITEM_KG.log);
      return;
    }
    case "hunt": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      // A hunt saved against a species the catalogue no longer has finishes as nothing.
      if (!def?.hunt || isFish(s)) return;
      const d = regionDensity(state, world, p.region, s, cal);
      if (wearTool(state, "bow", wearFactor(state, world, "hunt", s))) {
        cue("toolBreaks");
        log(state, "The bow snaps.", "bad");
      }
      cue("arrow");
      if (rng.chance(huntOdds(state, world, cal, d, s))) {
        st.pop[s] = Math.max(0, popOf(st, s) - 1);
        state.stats.animals++;
        const x = huntExtras(state, s);
        const where = produce(state, world, "rawMeat", x.meatKg);
        if (x.hideKg) produce(state, world, "hide", x.hideKg);
        if (x.furKg) produce(state, world, "fur", x.furKg);
        if (x.fatKg) produce(state, world, "fat", x.fatKg);
        creditYield(state, "hunt", x.meatKg * FOODS.rawMeat.kcalPerKg + (x.fatKg ?? 0) * FOODS.fat.kcalPerKg);
        if (x.bone) produce(state, world, "bone", x.bone);
        if (x.sinew) produce(state, world, "sinew", x.sinew);
        log(state, `${anAnimal(s, true)}. ${x.meatKg} kg of meat${where === "pile" ? ", more than you can carry; it lies where it fell" : ""}.`, "good");
        const injury = injuryChance(state, s);
        if (injury > 0 && rng.chance(injury)) {
          p.injured = Math.max(p.injured, 24 * 60);
          p.health = Math.max(1, p.health - 15);
          log(state, "It did not go down easily. You are hurt.", "bad");
        }
      } else {
        const hurt = gapInjury(state, s);
        if (hurt > 0 && rng.chance(hurt)) {
          p.injured = Math.max(p.injured, 24 * 60);
          p.health = Math.max(1, p.health - 15);
          log(state, `The ${def.name} turns on you. You are hurt.`, "bad");
        }
        const loss = huntExtras(state, s).arrowLoss;
        if (loss > 0 && rng.chance(loss)) {
          removeItem(p.pack, "arrow", 1);
          log(state, `No ${def.name} today, and an arrow lost in the brush.`);
        } else log(state, `No ${def.name} today.`);
      }
      return;
    }
    case "fish": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      // Likewise a cast saved before fishing named its fish.
      if (!def?.hunt || !isFish(s)) return;
      const d = regionDensity(state, world, p.region, s, cal);
      if (wearTool(state, "fishingSpear", wearFactor(state, world, "fish", s))) {
        cue("toolBreaks");
        log(state, "The spear shaft splits.", "bad");
      }
      cue("spear");
      if (rng.chance(huntOdds(state, world, cal, d, s))) {
        st.pop[s] = Math.max(0, popOf(st, s) - 1);
        state.stats.animals++;
        const kg = fishKg(state, s) * yieldFactor(state, "fishing");
        produce(state, world, "fish", kg);
        // Raw fish is not eaten; the yield is what it cooks to.
        creditYield(state, "fish", kg * FOODS.cookedFish.kcalPerKg);
        log(state, `${anAnimal(s, true)}, ${kg.toFixed(1)} kg.`, "good");
      } else log(state, "Nothing bites.");
      return;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      consume(invs, [{ item: food, qty: kg }]);
      produce(state, world, food === "rawMeat" ? "cookedMeat" : "cookedFish", kg);
      return;
    }
    case "craft": {
      const rid = arg as RecipeId;
      const rec = RECIPES[rid];
      const needs = effectiveNeeds(state, rid);
      if (!canConsume(invs, needs)) {
        log(state, `The ${rec.name} is left unfinished: the materials are gone.`, "bad");
        return;
      }
      const success = craftSuccess(state, rid);
      if (success < 1 && !rng.chance(success)) {
        const lost = spoiledNeeds(needs);
        consume(invs, lost);
        if (rec.tool) wearTool(state, rec.tool, wearFactor(state, world, "craft", rid));
        log(state, `The ${rec.name} is spoiled: ${needsList(lost)} wasted.`, "bad");
        return;
      }
      consume(invs, needs);
      if (rec.tool) wearTool(state, rec.tool, wearFactor(state, world, "craft", rid));
      if (rec.out.clothing) {
        const slot = CLOTHING[rec.out.clothing].slot;
        const old = p.clothing.find((g) => CLOTHING[g.id].slot === slot);
        p.clothing = p.clothing.filter((g) => g !== old);
        p.clothing.push({ id: rec.out.clothing, durability: 100 });
        log(state, `You put on the ${rec.name}${old ? ` and leave the ${CLOTHING[old.id].name} behind` : ""}.`, "good");
      } else if (rec.out.item) {
        const item = rec.out.item;
        produce(state, world, item, rec.out.qty ?? 1);
        if (item in TOOLS) {
          if (hasTool(p, item as ToolId)) log(state, `You have a spare ${rec.name}.`, "good");
          else if (takeUp(state, world, item as ToolId)) log(state, `You have a ${rec.name}.`, "good");
        }
      }
      return;
    }
    case "repair": {
      consume(invs, [{ item: "hide", qty: 0.5 }]);
      wearTool(state, "needle", 2 * wearFactor(state, world, "repair"));
      const worst = p.clothing.reduce((a, b) => (b.durability < a.durability ? b : a));
      worst.durability = Math.min(100, worst.durability + 40);
      log(state, `The ${CLOTHING[worst.id].name} is patched.`, "good");
      return;
    }
    case "sharpen": {
      consume(invs, [{ item: "stone", qty: 1 }]);
      const axe = tool(p, "axe");
      if (axe) axe.durability = Math.min(100, axe.durability + 30);
      return;
    }
    case "build": {
      const sid = arg as StructureId;
      if (sid === "snare") {
        consume(invs, STRUCTURES.snare.needs);
        st.structures.snares++;
      } else {
        st.structures[sid] = true;
        delete st.build[sid];
        if (sid === "boughBed") st.boughBedAge = 0;
      }
      state.stats.structures++;
      log(state, `The ${STRUCTURES[sid].name} is ${sid === "snare" ? "set" : "finished"}.`, "good");
      return;
    }
    case "light":
    case "lightIndoors": {
      consume(invs, [{ item: "firewood", qty: 1 }]);
      wearTool(state, "fireDrill", 2 * wearFactor(state, world, "light"));
      const roof = st.structures.leanTo || st.structures.cabin;
      const lr = lightingInRain(state.weather, ambientTemperature(cal, state.weather), roof);
      if (lr.failChance > 0 && rng.chance(lr.failChance)) {
        log(state, "The tinder will not catch.", "bad");
        return;
      }
      st.fire.lit = true;
      cue("fireCatches");
      st.fire.fuelKg += 1;
      st.fire.indoors = id === "lightIndoors";
      log(state, "Smoke, then flame. The fire is lit.", "good");
      return;
    }
    case "lightTorch": {
      consume(invs, [{ item: "torch", qty: 1 }]);
      if (!(atCamp(state, world) && st.fire.lit)) wearTool(state, "fireDrill", wearFactor(state, world, "lightTorch"));
      p.torch = { lit: true, minutes: TORCH_BURN_MINUTES };
      cue("torchLit");
      log(state, "The torch catches.", "good");
      return;
    }
    case "melt": {
      st.fire.fuelKg = Math.max(0, st.fire.fuelKg - 1);
      let l = 1.0;
      const drinkL = Math.min(l, WATER_FULL - p.water);
      p.water += drinkL;
      l -= drinkL;
      for (const t of p.tools) {
        const holds = TOOLS[t.id].litres ?? 0;
        if (!holds || l <= 1e-9) continue;
        const room = holds - (t.litres ?? 0);
        const put = Math.min(room, l);
        if (put <= 1e-9) continue;
        t.litres = (t.litres ?? 0) + put;
        t.frozen = false;
        l -= put;
      }
      return;
    }
    case "thaw": {
      for (const t of p.tools) if (t.frozen) t.frozen = false;
      const camp = campPileHere(state, world);
      if (camp) {
        const ice = qty(camp, "ice");
        removeItem(camp, "ice", ice);
        addItem(camp, "water", ice);
      }
      return;
    }
    case "fill": {
      if (!waterSource(state, world) && state.weather.iceCm >= ICE_SHORE_CM) cutIceHole(state, world);
      const added = fillVessels(state, world);
      if (added > 1e-9) log(state, `You fill ${added.toFixed(1)} litres.`);
      return;
    }
    case "hang": {
      const kg = loadRack(state, world);
      if (kg > 0) log(state, `You hang ${kg.toFixed(1)} kg of meat to dry.`);
      return;
    }
    case "iceHole": {
      cutIceHole(state, world);
      return;
    }
    case "haul":
    case "night":
    case "wait":
    case "travel":
    case "walk":
    case "rest":
    case "sleep":
      return;
  }
}

/** Hares hanging in the snares come with you when you pass the heath. */
function collectSnares(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (st.snareCatch.count <= 0) return;
  const n = st.snareCatch.count;
  st.snareCatch.count = 0;
  st.snareCatch.age = 0;
  const y = SPECIES_DEFS.hare.yields!;
  produce(state, world, "rawMeat", y.meatKg * n);
  creditYield(state, "snare", y.meatKg * n * FOODS.rawMeat.kcalPerKg);
  produce(state, world, "fur", (y.furKg ?? 0) * n);
  produce(state, world, "bone", n);
  state.stats.animals += n;
  log(state, `${n} hare${n > 1 ? "s" : ""} in the snares at ${regionAt(world, p.region).name}.`, "good");
}

/** kg of a given item within reach, for labels. */
export function inReach(state: GameState, world: World, item: keyof typeof ITEM_KG): number {
  return qty(state.player.pack, item) + qty(herePile(state, world), item);
}
