import { Rng } from "../rng";
import { CELL_KM } from "../units";
import { BIG_EATER_PACE, body, FELL_FEAR_LINE, fearsFell, hasQuirk, SHORE_FEAR_LINE, shunsShore } from "./person";
import { cellAt, hasSpot, regionAt, spotOf, type World } from "../world/gen";
import { findRoute, passable, routeKm, routeMinutes } from "../world/route";
import { loadRack } from "./actions";
import { absence, popOf, regionDensity } from "./animals";
import type { Calendar } from "./calendar";
import { canMoveCamp, needsMending, rackCapacity, siteLine, siteReport } from "./camp";
import { cue } from "./cues";
import {
  addItem, AXES, axeInHand, axeNear, canConsume, consume, hasTool, herePile, listItems, pile, produce, qty, reach,
  removeItem, takeUp, toolNear, totalQty, transfer, wearTool, weight,
} from "./inventory";
import {
  BERRY_PICK_KG, CLOTHING, DECAYING, FOODS, ITEM_KG, ITEM_NAMES, MARROW_KG_PER_BONE, MAX_RACKS, MAX_SNARES, MEND, RECIPES, RECIPE_IDS, ROE_SHARE, SNOW_SHELTER_CM, STRUCTURES,
  STRUCTURE_IDS, TOOLS, TORCH_BURN_MINUTES,
} from "./items";
import { creditYield } from "./ledger";
import { log } from "./log";
import { baseWalkSpeed, die, walkSpeed, workSpeed } from "./player";
import { hasEvent, record } from "./record";
import {
  chopSticks, craftSuccess, effectiveNeeds, fishKg, gap, gapInjury, huntExtras, injuryChance, MASTERY_CAP,
  masteryKey, masteryLevel, masteryMinutes, oddsFactor, RECOMMENDED, skillLevel, SKILL_NAMES,
  skillOf, spoiledNeeds, train, wearFactor, yieldFactor,
} from "./skills";
import { sleepMinutes } from "./sleep";
import {
  atCamp, campCellOf, cellCenter, cellIndex, cellOf, forestCell, heathCell, hereTerrain,
  placeAt, rockCell, setRegion, spotHere, SPOT_WORDS, straightKm, watersideCell,
} from "./position";
import { lightingInRain, roofed, SMOKE_COUGH, splitIsWet, splitSheltered } from "./fire";
import { isRead, readLine, readShore } from "./knowledge";
import { discovery, regionState } from "./regionstate";
import { SEEP, seepGround, seepNeedsRedig } from "./seep";
import { fatSeason, fishItem, fishSpecies, huntedLand, inSpawn, isFish, LARGE_GAME, marrowFactor, type Species, SPECIES_DEFS, waterOf } from "./species";
import { BERRY_FROM_DOY, BERRY_TO_DOY } from "./tables";
import {
  type DecayingId, FILL_METHODS, type FillMethod, type GameState, type IceMode, type Inventory, type ItemId, type Order, type PausedTask, type RecipeId,
  type SpotId, type StructureId, type TaskId, type ToolId,
} from "./types";
import { campPileHere, campWaterRoom, fillVessels, ICE_SHORE_CM, iceHoleOpen, takeUpTripVessel, tripLitres, tripVessel, vesselLitresCapacity, vesselRoom, waterSource, WATER_FULL } from "./water";
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
  /** The recommended level, whether you are under it, and by how many levels. */
  recommended?: { text: string; under: boolean; short: number };
}

export const SPOT_NAMES = SPOT_WORDS;

/** Work that stays where it was left: the half-felled tree is in that cell of forest. */
const LOCATED = new Set<TaskId>(["chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges", "hunt", "fish", "cook", "iceHole", "read"]);
/** Work you carry in your hands wherever you go. */
const CARRIED = new Set<TaskId>(["craft", "repair", "sharpen", "hone", "light", "lightIndoors", "lightTorch"]);

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
  "chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges", "hunt", "fish", "cook",
  "craft", "repair", "sharpen", "hone", "build", "mend", "light", "lightIndoors", "lightTorch", "fill", "iceHole", "hang", "read",
  "setTrap", "emptyTrap", "makeCamp", "crack",
]);

/** The tool a task swings, or null. What check looks for in reach and beginTask takes up. */
export function toolFor(id: TaskId, arg?: string): ToolId | null {
  switch (id) {
    case "chop": case "split": return "axe";
    case "hunt": return "bow";
    case "fish": return "fishingSpear";
    case "craft": return RECIPES[arg as RecipeId]?.tool ?? null;
    case "repair": return "needle";
    case "hone": return "whetstone";
    case "light": case "lightIndoors": return "fireDrill";
    case "fill": return "barkBucket";
    case "iceHole": return "axe";
    case "mend": return null;
    default: return null;
  }
}

/** Berries ripen mid-July and are gone by mid-October. */
export function berrySeason(cal: Calendar): boolean {
  return cal.dayOfYear >= BERRY_FROM_DOY && cal.dayOfYear <= BERRY_TO_DOY;
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
    // "camp" is the one spot a move sends elsewhere; every other spot's cell is fixed at generation.
    if (val === "camp") return { cell: campCellOf(state, world), label: SPOT_WORDS.camp, thin };
    const s = spotOf(regionAt(world, state.player.region), val as SpotId);
    return s ? { cell: s.cell, label: SPOT_WORDS[val as SpotId], thin } : null;
  }
  if (kind === "region") {
    const id = Number(val);
    const r = regionAt(world, id);
    return r ? { cell: campCellOf(state, world, id), label: r.name, thin } : null;
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
  const inRegion = region === state.player.region ? "" : ` in ${r.name}`;
  if (cell === campCellOf(state, world, region)) return `${SPOT_WORDS.camp}${inRegion}`;
  const spot = r.spots.find((s) => s.id !== "camp" && s.cell === cell);
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
  const obs = id === "fish" ? state.player.known[at] : undefined;
  const out: { s: Species; w: number }[] = [];
  for (const s of pool) {
    if (obs && !obs.fish.includes(s)) continue;
    if (!r.capacity[s] || popOf(st, s) < 1) continue;
    const def = SPECIES_DEFS[s].hunt!;
    if (!spotSuits(world, at, def.spot, waterOf(s))) continue;
    const d = regionDensity(state, world, state.player.region, s, cal);
    if (d <= 0) continue;
    out.push({ s, w: d * def.odds });
  }
  return out;
}

/**
 * Why a fetch has nothing to gain, or null when it has. fillVessels tops
 * every carried vessel off in one call, so a fetch with no room left in any
 * of them repeats forever at the water instead of walking the load home to
 * pour - and a vessel that froze full has no room at all, since fillVessels
 * cannot add to it and pourVessels will not empty it. The frozen case is
 * given its own reason and not "the vessels are full", because the answer to
 * it is the fire and not the walk home: a level-20 camp whose only bucket
 * froze on 30 January ran the fetch every daylight hour for twenty days,
 * drew nothing, and starved the woodpile keep beneath it into a cold death.
 */
function noVesselRoom(state: GameState, world: World): string | null {
  const p = state.player;
  if (vesselLitresCapacity(p) <= 0) return null;
  if (vesselRoom(p) > 1e-9) return null;
  if (p.tools.some((t) => t.frozen && (TOOLS[t.id].litres ?? 0) > 0)) return "no vessel has room to fill";
  const homeSt = regionState(state, world, p.region);
  return campWaterRoom(pile(state, homeSt.campCell), homeSt) > 0 ? "the vessels are full" : "camp is full";
}

/** How much is about for a hunt or a cast from this cell, by the same weights the draw uses. 0 when the ground suits nothing. */
export function candidateWeight(state: GameState, world: World, cal: Calendar, id: "hunt" | "fish", at: number): number {
  return candidates(state, world, cal, id, at).reduce((a, x) => a + x.w, 0);
}

/**
 * What "anything" turns out to be: drawn by how likely each species is to
 * be met from this cell, hunt and cast alike. What walks past is not the
 * hunter's choice; the ground is, and huntGroundValue below is what
 * chooses it, so a hunt that draws mallard drew it on a shore the hunter
 * had a reason to be standing on. Null when nothing is about.
 */
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
 * What a hunt from this cell is worth to a hunter of this level: the meat a
 * day's hunting here would be expected to bring home, per hour. Every
 * species this ground could give counts, at its real odds - which read the
 * hunter's own skill, so an elk that a beginner has no chance at adds
 * almost nothing - times the meat one trip carries home, over the hours the
 * hunt takes. It is what ranks one ground against another: a shore where
 * mallard swim ranks below a forest two cells away holding seventy-six roe
 * deer, unless the mallard are truly the better catch. Zero when nothing
 * here can be hunted at all.
 */
export function huntGroundValue(state: GameState, world: World, cal: Calendar, at: number): number {
  const c = candidates(state, world, cal, "hunt", at);
  // Game the hunter has the level for counts; a ground offering nothing but
  // game they have no business at is worth what it is worth to them anyway,
  // so a beginner with only deer about still goes hunting.
  const own = c.filter(({ s }) => gap(state, `hunt:${s}`) === 0);
  let value = 0;
  for (const { s } of own.length ? own : c) {
    const def = SPECIES_DEFS[s];
    const d = regionDensity(state, world, state.player.region, s, cal);
    // The meat that counts is the meat one trip brings home: a ground is
    // worth what a load is worth, not what the whole animal weighs.
    const kg = Math.min(def.yields?.meatKg ?? 0, body(state).packHardKg);
    value += (huntOdds(state, world, cal, d, s) * kg * 60) / def.hunt!.minutes;
  }
  return value;
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

/** A patch gives this much to the most worn piece. */
export const MEND_GAIN = 40;
/** Mend when the most worn piece is at or under this: a patch of half a kilo of hide never buys less than its full gain. */
export const MEND_AT = 100 - MEND_GAIN;

/**
 * The one place a task's legality and duration are decided. availableTasks
 * and startTask both go through it so the button and the click agree.
 * `at` judges the task at another cell of this region, for an intent that
 * has not walked there yet; ground, camp and reach are all taken there.
 */
/** Work done at the open shore: what a forest-born survivor will not do in a storm. */
const SHORE_TASKS = new Set<TaskId>(["fish", "read", "setTrap", "emptyTrap", "iceHole"]);

/**
 * A fear refuses the way a ladder refusal does: the row says why, the runner
 * reports the order blocked, and the scheduler moves to the next order.
 */
function feared(state: GameState, world: World, id: TaskId, arg: string | undefined, at: number, o: TaskOption): TaskOption {
  if (!o.ok) return o;
  if (fearsFell(state)) {
    const target = id === "walk" || id === "travel" ? walkTarget(state, world, arg ?? "")?.cell : LOCATED.has(id) ? at : undefined;
    if (target !== undefined && cellAt(world, target).terrain === "fell") return { ...o, ok: false, why: FELL_FEAR_LINE };
  }
  if (shunsShore(state) && (SHORE_TASKS.has(id) || (id === "fill" && (arg === "shore" || arg === "hole")))) return { ...o, ok: false, why: SHORE_FEAR_LINE };
  return o;
}

export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const o = checkFresh(state, world, cal, id, arg, at);
  const fraction = pausedFraction(state, world, id, arg, at);
  if (fraction > 0 && o.ok) return { ...o, resume: fraction, duration: o.duration * (1 - fraction) };
  if (fraction > 0) return { ...o, resume: fraction };
  return o;
}

export function checkFresh(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const o = feared(state, world, id, arg, at, checkRaw(state, world, cal, id, arg, at));
  // A big eater works a tenth faster at anything the body paces.
  if (o.ok && WORK_TASKS.has(id) && hasQuirk(state, "bigEater")) return { ...o, duration: o.duration * BIG_EATER_PACE };
  return o;
}

function checkRaw(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const p = state.player;
  const r = regionAt(world, p.region);
  const st = regionState(state, world, p.region);
  const invs = [p.pack, pile(state, at)];
  // Judged from camp for work elsewhere, a tool in the camp pile is in reach
  // too: setting out takes it up (provisionKit), so a spare made while the
  // first was still held is not left at home while the shore reads "needs a
  // fishing spear". Materials are not: they are fetched by the delivery rules
  // and never carried out to the work.
  const here = cellOf(state, world);
  const toolInvs = at !== here && here === st.campCell ? [...invs, pile(state, here)] : invs;
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
      const o = ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Fell a tree", detail: `4 logs and ${chopSticks(state, world)} sticks left on the ground`, duration: (terrain === "spruce" ? 50 : 60) * edgeFactor(state), repeatable: true }));
      if (!o.ok) return o;
      if (stormNow(state.weather, state.minute)) return { ...o, ok: false, why: "too rough" };
      if (!axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs an axe" };
      if (st.wood < 1) return { ...o, ok: false, why: "nothing left worth felling" };
      return o;
    }
    case "deadwood": {
      const o = ground(forestCell(world, at), "forest", "forest", opt({ group: "gather", label: "Gather dead wood", detail: `${DEADWOOD_KG} kg of firewood off the forest floor; no axe`, duration: 60, repeatable: true }));
      if (!o.ok) return o;
      if (st.wood < DEADWOOD_TREE_SHARE) return { ...o, ok: false, why: "the forest is picked clean" };
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
      const o = opt({ group: "camp", label: "Split a log", detail: `one log into 20 kg of firewood${sheltered ? ", under the roof" : ""}`, duration: 15 * edgeFactor(state), repeatable: true });
      if (!axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs an axe" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      if (!sheltered && splitIsWet(state, world)) return { ...o, ok: false, why: "waiting for dry weather" };
      return o;
    }
    case "splitWedges": {
      const sheltered = splitSheltered(state, world, at);
      const o = opt({ group: "camp", label: "Split a log with wedges", detail: `one log into 20 kg of firewood, driven with a stick; a third the axe's pace${sheltered ? ", under the roof" : ""}`, duration: 45, repeatable: true });
      if (totalQty(invs, "wedge") < 2) return { ...o, ok: false, why: "needs two wedges" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      if (!sheltered && splitIsWet(state, world)) return { ...o, ok: false, why: "waiting for dry weather" };
      return o;
    }
    case "hang": {
      const raw = totalQty(invs, "rawMeat");
      const room = rackCapacity(st) - st.rack.kg;
      const kg = Math.min(raw, room);
      const o = needCamp(opt({ group: "camp", label: "Hang meat to dry", detail: `5 minutes a kilo; ${rackCapacity(st)} kg on the racks, two dry days`, duration: Math.max(1, Math.round(5 * kg)), repeatable: false }));
      if (!o.ok) return o;
      if (!st.structures.dryingRack) return { ...o, ok: false, why: "needs a drying rack" };
      if (raw <= 1e-9) return { ...o, ok: false, why: "no raw meat here" };
      if (room <= 1e-9) return { ...o, ok: false, why: "the rack is full" };
      return o;
    }
    case "fill": {
      const method = (arg ?? "shore") as FillMethod;
      const holds = vesselLitresCapacity(p) + totalQty(invs, "barkBucket") * TOOLS.barkBucket.litres! + totalQty(invs, "waterskin") * TOOLS.waterskin.litres!;
      const label = method === "hole" ? "Cut an ice hole and fetch water" : method === "seep" ? "Fetch water from the seep" : "Fetch water from the shore";
      const base = opt({ group: "camp", label, detail: "one vessel", duration: 5, repeatable: true });
      if (method === "seep") {
        if (holds <= 0) return { ...base, ok: false, why: "needs a vessel" };
        const s = state.seeps[at];
        if (!s) return { ...base, ok: false, why: Object.keys(state.seeps).some((k) => cellAt(world, Number(k)).region === p.region) ? "walk to the seep" : "no seep dug" };
        const noRoom = noVesselRoom(state, world);
        if (noRoom) return { ...base, ok: false, why: noRoom };
        if (s.litres <= 1e-9) return { ...base, ok: false, why: s.ice > 1e-9 ? "the seep is frozen" : "the seep is empty" };
        const v = tripVessel(state, world);
        const litres = Math.min(tripLitres(state, world), s.litres);
        return { ...base, detail: `${litres.toFixed(1)} l${v ? `, the ${TOOLS[v.id].name}` : ""}, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l in the seep` };
      }
      const o0 = ground(watersideCell(world, at), "shore", "water", base);
      if (!o0.ok) return o0;
      if (holds <= 0) return { ...o0, ok: false, why: "needs a vessel" };
      const v = tripVessel(state, world);
      const o = { ...o0, detail: `${tripLitres(state, world).toFixed(1)} l${v ? `, the ${TOOLS[v.id].name}` : ""}` };
      const noRoom = noVesselRoom(state, world);
      if (noRoom) return { ...o, ok: false, why: noRoom };
      const iced = state.weather.iceCm >= ICE_SHORE_CM && !iceHoleOpen(state, at);
      if (method === "shore") return iced ? { ...o, ok: false, why: "iced over" } : o;
      if (state.weather.iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open, no hole needed" };
      // The pack and the work cell only: the vessel and the axe for a fill are the fill task's own rule, and provisionKit leaves a fill's kit to it, so a camp-pile axe is never taken up on the way out.
      if (!axeNear(p, invs)) return { ...o, ok: false, why: "needs an axe" };
      return iced ? { ...o, detail: `${o.detail}; cuts the hole first, wearing the axe`, duration: 25 } : o;
    }
    case "iceHole": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Open an ice hole", detail: "20 minutes with the axe; skins over by morning", duration: 20 }));
      if (!o.ok) return o;
      if (state.weather.iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open" };
      if (iceHoleOpen(state, at)) return { ...o, ok: false, why: "already open here" };
      if (!axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs an axe" };
      return o;
    }
    case "hunt": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "hunt", at);
        const kinds = huntedLand().filter((k) => r.capacity[k] && popOf(st, k) >= 1 && !absence(SPECIES_DEFS[k], cal, state.weather.iceCm));
        const o = opt({ group: "hunt", label: "Hunt anything", duration: 120, repeatable: true, detail: `whatever is about; ${kinds.length} kind${kinds.length === 1 ? "" : "s"} here` });
        // Ground, then tool, then animal. Kinds live here but none of them keeps to this ground: the forest is where a hunt starts.
        if (kinds.length && !c.length) return ground(false, "forest", "forest", o);
        if (!toolNear(p, "bow", toolInvs)) return { ...o, ok: false, why: "needs a bow" };
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
      if (!toolNear(p, "bow", toolInvs)) return { ...o, ok: false, why: "needs a bow" };
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
        if (!toolNear(p, "fishingSpear", toolInvs)) return { ...o, ok: false, why: "needs a fishing spear" };
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
      if (!toolNear(p, "fishingSpear", toolInvs)) return { ...o, ok: false, why: "needs a fishing spear" };
      const away = absence(def, cal, state.weather.iceCm);
      if (away) return { ...o, ok: false, why: away };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
    case "read": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Read the water", detail: "an hour watching this shore: what lives in it and where it lies", duration: 60, repeatable: false }));
      if (!o.ok) return o;
      if (state.weather.iceCm >= ICE_SHORE_CM) return { ...o, ok: false, why: "the water is under ice" };
      if (isRead(state, at)) return { ...o, ok: false, why: "{you} {have} read this water" };
      return o;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish" | "oilyFish" | "rawFat";
      const kg = Math.min(1, totalQty(invs, food));
      const label = food === "rawFat" ? "Render fat" : `Cook ${ITEM_NAMES[food]}`;
      const detail = food === "rawFat" ? "1 kg at a time; raw fat rots in three warm days, rendered it keeps" : "1 kg at a time over the fire";
      const o = needCamp(opt({ group: "camp", label, detail, duration: Math.max(1, 10 * kg), repeatable: true }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (kg <= 0) return { ...o, ok: false, why: `no ${ITEM_NAMES[food]} here` };
      return o;
    }
    case "crack": {
      const o = needCamp(opt({ group: "camp", label: "Crack bones for marrow", detail: `${MARROW_KG_PER_BONE * 1000} g of marrow a bone at a fat animal, less in spring; the fragments still make a needle`, duration: 20, repeatable: true }));
      if (!o.ok) return o;
      if (totalQty(invs, "bone") < 1) return { ...o, ok: false, why: "no bones here" };
      if (totalQty(toolInvs, "stone") < 1 && !axeInHand(p)) return { ...o, ok: false, why: "needs a stone or the axe" };
      return o;
    }
    case "craft": {
      const rid = arg as RecipeId;
      const rec = RECIPES[rid];
      const needs = effectiveNeeds(state, rid);
      const o = opt({ group: "craft", label: rec.name, detail: needsList(needs) + (rec.tool ? `; needs a ${TOOLS[rec.tool].name}` : ""), duration: rec.minutes, repeatable: rec.out.item !== undefined });
      if (rec.tool && !toolNear(p, rec.tool, toolInvs)) return { ...o, ok: false, why: `needs a ${TOOLS[rec.tool].name}` };
      if (!canConsume(invs, needs)) return { ...o, ok: false, why: "missing materials" };
      return o;
    }
    case "repair": {
      const o = opt({ group: "camp", label: "Mend clothing", detail: `0.5 kg hide; +${MEND_GAIN} wear on the most worn piece`, duration: 30 });
      if (!toolNear(p, "needle", toolInvs)) return { ...o, ok: false, why: "needs a bone needle" };
      if (totalQty(invs, "hide") < 0.5) return { ...o, ok: false, why: "needs 0.5 kg hide" };
      if (!p.clothing.some((g) => g.durability <= MEND_AT)) return { ...o, ok: false, why: "nothing worn enough to mend" };
      return o;
    }
    case "sharpen": {
      const o = opt({ group: "camp", label: "Sharpen the axe on a stone", detail: "1 stone; the edge +30", duration: 15 });
      const axe = axeInHand(p);
      if (!axe) return { ...o, ok: false, why: "no axe" };
      if (totalQty(invs, "stone") < 1) return { ...o, ok: false, why: "needs a stone" };
      if (axe.durability >= 100) return { ...o, ok: false, why: "already sharp" };
      return o;
    }
    case "hone": {
      const o = opt({ group: "camp", label: "Hone the axe", detail: "ten minutes on the whetstone; the edge back to full", duration: 10 });
      const axe = axeInHand(p);
      if (!axe) return { ...o, ok: false, why: "no axe" };
      if (!toolNear(p, "whetstone", invs)) return { ...o, ok: false, why: "needs a whetstone" };
      if (axe.durability >= HONE_UNDER) return { ...o, ok: false, why: "sharp enough" };
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
        if (st.structures.snares >= MAX_SNARES) return { ...o2, ok: false, why: `${MAX_SNARES} snares is enough here` };
        if (!kitInReach(state, world, "snare", invs)) return { ...o2, ok: false, why: "needs a snare" };
        return o2;
      }
      if (sid === "seep") {
        const cls = seepGround(world, at);
        const o2 = { ...o, label: "Dig a seep", detail: cls
          ? `4 sticks and a bucket to bail; ${SEEP[cls].poolL} l pool, +${SEEP[cls].refillLPerHour} l/h`
          : "wet ground only: bog, spruce, or meadow and birch beside a bog" };
        if (!cls) return { ...o2, ok: false, why: watersideCell(world, at) ? "the shore is here" : "dry ground" };
        if (state.seeps[at]) return { ...o2, ok: false, why: "a seep is here already" };
        if (vesselLitresCapacity(p) <= 0 && !kitInReach(state, world, "barkBucket", invs) && !kitInReach(state, world, "waterskin", invs)) return { ...o2, ok: false, why: "needs a vessel to bail with" };
        if (done > 0) return { ...o2, detail: `${Math.round((done / def.minutes) * 100)}% dug` };
        // The sticks are pocketed at camp when the order sets out (provisionKit), so the camp pile counts from camp, as a snare's kit does.
        const sticks = totalQty(invs, "stick") + (cellOf(state, world) === st.campCell && at !== st.campCell ? qty(pile(state, st.campCell), "stick") : 0);
        if (sticks < def.needs[0].qty) return { ...o2, ok: false, why: "needs 4 sticks" };
        return o2;
      }
      if (!camp) return { ...o, ok: false, why: "walk to camp" };
      if (sid === "snowShelter") {
        if (st.structures.turfHut || st.structures.cabin) return { ...o, ok: false, why: "the hut is warmer" };
        if (st.structures.snowShelter) return { ...o, ok: false, why: "already built here" };
        if (state.weather.snowCm < SNOW_SHELTER_CM) return { ...o, ok: false, why: `needs ${SNOW_SHELTER_CM} cm of snow` };
        if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% heaped` };
        return o;
      }
      if (sid === "dryingRack") {
        if (st.racks >= MAX_RACKS) return { ...o, ok: false, why: "two racks stand here already" };
      } else if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };
      if ((sid === "cabin" || sid === "turfHut") && !st.structures.firePit) return { ...o, ok: false, why: "build the fire pit first" };
      if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% built; materials already laid out` };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
    case "mend": {
      if (arg === "seep") {
        const o = opt({ group: "camp", label: "Re-dig the seep", detail: "an hour with the bucket; another year", duration: 60 });
        const s = state.seeps[at];
        if (!s) return { ...o, ok: false, why: "no seep here" };
        if (!seepNeedsRedig(state, s)) return { ...o, ok: false, why: "holds well enough" };
        return o;
      }
      const sid = arg as DecayingId;
      const def = MEND[sid];
      const name = STRUCTURES[sid].name;
      const label = sid === "turfHut" ? "Re-roof the hut" : `Mend the ${name}`;
      const detail = sid === "turfHut" ? "20 bark; a new roof for another year and a half"
        : `${needsList(def.needs)}; ${sid === "leanTo" ? "re-roof it for another year" : "relash it for another two years"}`;
      const o = needCamp(opt({ group: "camp", label, detail, duration: def.minutes, repeatable: false }));
      if (!o.ok) return o;
      if (!st.structures[sid]) return { ...o, ok: false, why: `no ${name} here` };
      if (!needsMending(st, sid)) return { ...o, ok: false, why: "stands well enough" };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
    case "light": {
      const lr = lightingInRain(state.weather, ambientTemperature(cal, state.weather), roofed(st), hasQuirk(state, "steadyByTheFire"));
      const o = needCamp(opt({
        group: "camp", label: "Light the fire at the pit",
        detail: `fire drill and 1 kg firewood${lr.failChance > 0 ? "; one in three fails in the rain" : ""}`,
        duration: lr.minutes,
      }));
      if (!o.ok) return o;
      if (!st.structures.firePit) return { ...o, ok: false, why: "needs a fire pit" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!toolNear(p, "fireDrill", toolInvs)) return { ...o, ok: false, why: "needs a fire drill" };
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
      if (id === "travel" && discovery(state, cellAt(world, target.cell).region) === 0) return { ...o, ok: false, why: "{you} {know} nothing of that country" };
      const from = cellOf(state, world);
      if (target.cell === from) return { ...o, ok: false, why: "{you} {are} here" };
      if (target.thin && iceMode(state.weather) !== "thin") return { ...o, ok: false, why: "the ice is not thin here" };
      const ice = walkIceMode(state, target.thin);
      const route = findRoute(world, from, target.cell, ice, fearsFell(state));
      if (!route) return { ...o, ok: false, why: "no way there on foot" };
      const v = baseWalkSpeed(state, cal, state.weather);
      const minutes = routeMinutes(world, route, v, ice);
      let detail = `${routeKm(route).toFixed(1)} km on foot`;
      if (ice === "thin") detail += `; thin ice, ${Math.round(fallChance(state.weather.iceCm) * 100)}% per crossing cell`;
      const o2 = { ...o, duration: minutes, detail };
      if (weight(p.pack) > body(state).packHardKg) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "haul": {
      const here = at;
      const campCell = st.campCell;
      // Haul does not read `repeat` (beginTask refuses "haul" outright; the intent's own until governs it), so a loop button beside it would be a promise the button cannot keep.
      const o = opt({ group: "move", label: "Haul to camp", detail: "", repeatable: false });
      if (here === campCell) return { ...o, ok: false, why: "{you} {are} at camp" };
      const kg = weight(pile(state, at));
      if (kg <= 0) return { ...o, ok: false, why: "nothing on the ground here" };
      const ice = walkIceMode(state, false);
      const route = findRoute(world, here, campCell, ice, fearsFell(state));
      if (!route) return { ...o, ok: false, why: "no way to camp on foot" };
      const loaded = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, body(state).packHardKg + 5), ice);
      const empty = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, 5), ice);
      return { ...o, duration: loaded + empty, detail: `${Math.min(body(state).packHardKg, kg).toFixed(0)} kg per trip, ${routeKm(route).toFixed(1)} km each way; ${kg.toFixed(0)} kg lying here; stop anywhere and carry on later` };
    }
    case "makeCamp": {
      const o = opt({ group: "camp", label: "Make camp here", detail: "", duration: 20 });
      if (at === campCellOf(state, world)) return { ...o, ok: false, why: "this is the camp" };
      if (!passable(terrain)) return { ...o, ok: false, why: "not here" };
      const move = canMoveCamp(state, world);
      if (!move.ok) return { ...o, ok: false, why: move.why };
      return { ...o, detail: siteLine(siteReport(state, world, at)) };
    }
    case "night":
      return opt({ group: "camp", label: "Camp for the night", detail: `go to camp, make a fire if you can, sleep; ${bedText(state, world)}`, duration: 0 });
    case "wait":
      return opt({ group: "camp", label: "Wait at camp", detail: "rest at camp until there is something to do", duration: 0 });
    case "rest":
      return opt({ group: "camp", label: "Rest", detail: "an hour off your feet", duration: 60, repeatable: true });
    case "sleep": {
      // However long the model says this body will lie there: the minutes
      // from now to the wake line, with no dawn under it and no cap over it.
      const minutes = sleepMinutes(state, cal);
      return opt({ group: "camp", label: "Sleep", detail: `until rested, about ${Math.round(minutes / 60)} h; ${bedText(state, world)}`, duration: minutes });
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
        detail: st.structures.cabin && st.structures.hearth ? "at the hearth" : st.structures.turfHut && !st.structures.cabin ? "under the smoke hole" : "no smoke hole: the cabin will fill with smoke",
        duration: 10,
      }));
      if (!o.ok) return o;
      if (st.structures.snowShelter && !st.structures.turfHut && !st.structures.cabin) return { ...o, ok: false, why: "snow does not take a fire" };
      if (!st.structures.cabin && !st.structures.turfHut) return { ...o, ok: false, why: "needs a cabin or a turf hut" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!toolNear(p, "fireDrill", toolInvs)) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      return o;
    }
    case "setTrap": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Set the trap", detail: "stakes and the basket in the shallows; catches while you are elsewhere", duration: 20 }));
      if (!o.ok) return o;
      if (st.trap) return { ...o, ok: false, why: `the trap is set at ${whereIs(state, world, st.trap.cell)} already` };
      if (state.weather.iceCm >= ICE_SHORE_CM) return { ...o, ok: false, why: "the water is under ice" };
      if (!isRead(state, at)) return { ...o, ok: false, why: "read the water first" };
      if (state.player.known[at].fish.length === 0) return { ...o, ok: false, why: "nothing lives in this water" };
      if (!kitInReach(state, world, "basketTrap", invs)) return { ...o, ok: false, why: "needs a basket trap" };
      return o;
    }
    case "emptyTrap": {
      const o = opt({ group: "hunt", label: "Empty the trap", detail: st.trap ? `${st.trap.kg.toFixed(1)} kg of fish in it` : "", duration: 15 });
      if (!st.trap) return { ...o, ok: false, why: "no trap set here" };
      if (at !== st.trap.cell) return { ...o, ok: false, why: `walk to the trap at ${whereIs(state, world, st.trap.cell)}` };
      if (st.trap.kg <= 1e-9) return { ...o, ok: false, why: "the trap is empty" };
      return o;
    }
  }
}

/** What you would lie on and under if you slept here now: "on a bough bed, under your blanket and the roof, by the fire". */
export function bedText(state: GameState, world: World): string {
  const st = regionState(state, world, state.player.region);
  const camp = atCamp(state, world);
  const bed = camp && st.structures.boughBed;
  const roof = camp && roofed(st);
  const blanket = state.player.clothing.some((g) => CLOTHING[g.id].slot === "blanket");
  const on = bed ? "on a bough bed" : "on bare ground";
  const under = blanket && roof ? "under {your} blanket and the roof" : blanket ? "under {your} blanket" : roof ? "under the roof" : "in the open";
  const fire = camp && st.fire.lit ? ", by the fire" : "";
  return `${on}, ${under}${fire}`;
}

/** A read shore's odds over an unread one: knowing where the fish lie is worth half again. */
export const READ_ODDS = 1.5;

export function huntOdds(state: GameState, world: World, cal: Calendar, density: number, species: Species): number {
  const def = SPECIES_DEFS[species].hunt!;
  let odds = density * def.odds * oddsFactor(state, species);
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= def.night ?? 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  const st = regionState(state, world, state.player.region);
  if (atCamp(state, world) && st.smoke > SMOKE_COUGH) odds *= 0.5;
  if (stormNow(state.weather, state.minute)) odds *= 0.5;
  if (SPECIES_DEFS[species].kind === "fish" && isRead(state, cellOf(state, world))) odds *= READ_ODDS;
  if (state.player.energy < 20) odds *= 0.5;
  else if (state.player.energy < 30) odds *= 0.75;
  // Sharp eyes find game by day; the night is the same dark for everyone.
  if (!cal.isNight) odds *= body(state).dayOdds;
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
  for (const id of ["chop", "deadwood", "sticks", "bark", "stone", "berries"] as TaskId[]) out.push(check(state, world, cal, id));
  out.push(check(state, world, cal, "hunt", "any"));
  for (const s of huntedLand()) if (r.capacity[s]) out.push(check(state, world, cal, "hunt", s));
  out.push(check(state, world, cal, "fish", "any"));
  for (const s of fishSpecies()) if (r.capacity[s]) out.push(check(state, world, cal, "fish", s));
  out.push(check(state, world, cal, "read"));
  out.push(check(state, world, cal, "setTrap"));
  out.push(check(state, world, cal, "emptyTrap"));
  out.push(check(state, world, cal, "cook", "rawMeat"));
  out.push(check(state, world, cal, "cook", "fish"));
  out.push(check(state, world, cal, "light"));
  out.push(check(state, world, cal, "lightIndoors"));
  out.push(check(state, world, cal, "lightTorch"));
  out.push(check(state, world, cal, "split"));
  out.push(check(state, world, cal, "splitWedges"));
  out.push(check(state, world, cal, "hang"));
  out.push(check(state, world, cal, "sharpen"));
  out.push(check(state, world, cal, "hone"));
  out.push(check(state, world, cal, "repair"));
  out.push(check(state, world, cal, "rest"));
  out.push(check(state, world, cal, "sleep"));
  for (const m of FILL_METHODS) out.push(check(state, world, cal, "fill", m));
  out.push(check(state, world, cal, "iceHole"));
  out.push(check(state, world, cal, "makeCamp"));
  for (const id of RECIPE_IDS) out.push(check(state, world, cal, "craft", id));
  for (const id of STRUCTURE_IDS) out.push(check(state, world, cal, "build", id));
  for (const sid of DECAYING) out.push(check(state, world, cal, "mend", sid));
  out.push(check(state, world, cal, "mend", "seep"));
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
  out.recommended = { text: `${SKILL_NAMES[rec.skill]} ${rec.level}`, under: g > 0, short: g };
  const parts: string[] = [];
  if (g > 0 && o.id === "craft") parts.push(`${Math.round(craftSuccess(state, o.arg as RecipeId) * 100)}% chance it comes out`);
  if (g > 0 && o.id === "build") parts.push(`at ${SKILL_NAMES.building} ${skillLevel(state, "building")} this takes ${(1.3 ** g).toFixed(1)}x as long`);
  if (parts.length) out.detail = out.detail ? `${out.detail}; ${parts.join("; ")}` : parts.join("; ");
  return out;
}

/**
 * Starts a task by hand. Whatever intent was running is over; the task set
 * aside keeps its share. The runner's night goes with the intent: a hand
 * that takes over mid-sleep is the player deciding the night is done, and a
 * flag left set would put the next intent back to bed at the wake line
 * rather than the onset line.
 */
export function startTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false, rng?: Rng): boolean {
  if (!beginTask(state, world, cal, id, arg, repeat, rng)) return false;
  state.intent = null;
  state.player.sleeping = null;
  return true;
}

/**
 * Starts a task without touching the intent: what the runner calls for each
 * of its steps. Whatever was under way is set aside first, with its share done kept.
 */
/**
 * Felling and splitting slow once the edge is under half: twice as long at
 * 0, unchanged at 50 and above, since an axe a few strokes off sharp cuts
 * as well as a fresh one; a flaked axe is half again as slow at any edge.
 */
export const SLOW_EDGE = 50;
/** An hour on the forest floor: deadfall and dry branches broken by hand, an evening's fire. */
export const DEADWOOD_KG = 10;
/** Dead wood draws the felling stock: eight gathers are one tree's worth. */
export const DEADWOOD_TREE_SHARE = 1 / 8;
/** One split in ten breaks a wedge along the grain. */
export const WEDGE_BREAK = 0.1;
/** The edge a hone is worth: above it the row refuses, so a hone grind blocks harmlessly on a sharp axe. */
export const HONE_UNDER = 70;
export function edgeFactor(state: GameState): number {
  const axe = axeInHand(state.player);
  if (!axe) return 1;
  const f = 1 + Math.max(0, (SLOW_EDGE - axe.durability) / SLOW_EDGE);
  return axe.id === "flakedAxe" ? f * 1.5 : f;
}

/** A stroke's wear on the axe in hand; only a flaked axe can shatter, and the record keeps that. */
function wearAxe(state: GameState, world: World): void {
  const axe = axeInHand(state.player);
  if (!axe) return;
  if (wearTool(state, axe.id, wearFactor(state, world, "chop"))) {
    record(state, { kind: "toolWorn", tool: axe.id });
    cue("toolBreaks");
    log(state, "The flaked axe shatters on the stroke.", "bad");
  }
}

export function beginTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false, rng?: Rng): boolean {
  if (state.dead) return false;
  if (id === "night") return false;
  if (id === "haul") return false;
  if (id === "wait") return false;
  const o = check(state, world, cal, id, arg);
  if (!o.ok) return false;
  const need = toolFor(id, arg);
  // A fetch takes up the one vessel with the most room, whatever is already in hand.
  if (id === "fill") takeUpTripVessel(state, world);
  else if (need === "axe") {
    if (!axeInHand(state.player)) for (const id of AXES) if (takeUp(state, world, id)) break;
  } else if (need && !hasTool(state.player, need)) takeUp(state, world, need);
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
    const path = findRoute(world, from, target.cell, ice, fearsFell(state)) ?? [];
    state.route = { target: target.cell, path, walked: [from], label: target.label, ice, lastLand: from };
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
  let room = body(state).packHardKg - weight(pack);
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
  // A sleep set aside keeps nothing here on purpose. The night under way is
  // the player's `sleeping`, and only the model ends it, so a sleep broken to
  // feed the fire or by an order changing under the sleeper is resumed on the
  // next free minute rather than dropped until the onset line comes round
  // again, which for a body woken at sleepiness 40 would be the next evening.
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
    // The sleep this need asked for is done; whether the body lies down again
    // is the model's to say next minute, off the player's own night.
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
    if (!o.ok) log(state, `${o.label}: ${o.why}. {You} {stop}.`);
    else if (!beginTask(state, world, cal, id, wanted, true, rng)) log(state, `${o.label}: nothing about. {You} {stop}.`);
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
    die(state, "drowned", regionAt(world, state.player.region).name);
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
  log(state, "Through the ice. {You} {crawl} out soaked and shaking.", "bad");
  // The one way an iron axe ends: one time in two the hand that went under opens.
  const axe = axeInHand(p);
  if (axe && rng.chance(0.5)) {
    p.tools = p.tools.filter((t) => t !== axe);
    record(state, { kind: "toolLost", tool: axe.id });
    log(state, `The ${TOOLS[axe.id].name} went to the bottom and stayed there.`, "bad");
  }
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
      route.walked.push(route.path.shift()!);
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
    if (wasTravel) log(state, `{You} {reach} ${label}.`);
    if (spotHere(state, world) === "heath") collectSnares(state, world);
    collectTrap(state, world);
  }
}

/** Cuts an ice hole here: takes up an axe from the pack or the pile underfoot if none is in hand, wears it, and opens the hole. Both complete("fill") on an iced shore and complete("iceHole") share this so the two never drift. */
function cutIceHole(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (!axeInHand(p)) for (const id of AXES) if (takeUp(state, world, id)) break;
  wearAxe(state, world);
  st.iceHole = { cell: cellOf(state, world), minute: state.minute };
  log(state, "{You} {cut} a hole in the ice.");
}

/** Bones do not remember their animal: the crack reads this year's most-killed large game, and the ungulate curve when there is none. */
function marrowAnimal(state: GameState): Species {
  let best: Species = "deer";
  let bestKills = 0;
  for (const s of [...LARGE_GAME, "bear" as Species]) {
    const kills = state.stats.kills[s] ?? 0;
    if (kills > bestKills) {
      best = s;
      bestKills = kills;
    }
  }
  return best;
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
      wearAxe(state, world);
      const axeInjury = p.energy < 20 ? 0.03 : p.energy < 30 ? 0.02 : 0.01;
      if (rng.chance(axeInjury)) {
        p.injured = Math.max(p.injured, 24 * 60);
        p.health = Math.max(1, p.health - 10);
        log(state, "The axe glances off a knot into {your} shin. {You} will limp for a day.", "bad");
      }
      return;
    }
    case "deadwood": {
      st.wood -= DEADWOOD_TREE_SHARE;
      produce(state, world, splitIsWet(state, world) ? "wetFirewood" : "firewood", DEADWOOD_KG);
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
    case "splitWedges": {
      consume(invs, [{ item: "log", qty: 1 }]);
      const wet = !splitSheltered(state, world, cellOf(state, world)) && splitIsWet(state, world);
      produce(state, world, wet ? "wetFirewood" : "firewood", ITEM_KG.log);
      if (rng.chance(WEDGE_BREAK)) {
        consume(invs, [{ item: "wedge", qty: 1 }]);
        log(state, "A wedge splits along the grain.", "bad");
      }
      return;
    }
    case "hunt": {
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      // A hunt saved against a species the catalogue no longer has finishes as nothing.
      if (!def?.hunt || isFish(s)) return;
      const d = regionDensity(state, world, p.region, s, cal);
      if (wearTool(state, "bow", wearFactor(state, world, "hunt", s))) {
        record(state, { kind: "toolWorn", tool: "bow" });
        cue("toolBreaks");
        log(state, "The bow snaps.", "bad");
      }
      cue("arrow");
      if (rng.chance(huntOdds(state, world, cal, d, s))) {
        st.pop[s] = Math.max(0, popOf(st, s) - 1);
        state.stats.animals++;
        state.stats.kills[s] = (state.stats.kills[s] ?? 0) + 1;
        if (!hasEvent(state, (e) => e.kind === "firstKill" && e.species === s)) record(state, { kind: "firstKill", species: s });
        const x = huntExtras(state, s);
        const where = produce(state, world, "rawMeat", x.meatKg);
        if (x.hideKg) produce(state, world, "hide", x.hideKg);
        if (x.furKg) produce(state, world, "fur", x.furKg);
        if (x.fatKg) produce(state, world, "rawFat", x.fatKg);
        creditYield(state, "hunt", x.meatKg * FOODS.rawMeat.kcalPerKg + (x.fatKg ?? 0) * FOODS.fat.kcalPerKg);
        if (x.bone) produce(state, world, "bone", x.bone);
        if (x.sinew) produce(state, world, "sinew", x.sinew);
        log(state, `${anAnimal(s, true)}. ${x.meatKg} kg of meat${where === "pile" ? ", more than {you} can carry; it lies where it fell" : ""}.`, "good");
        const injury = injuryChance(state, s);
        if (injury > 0 && rng.chance(injury)) {
          p.injured = Math.max(p.injured, 24 * 60);
          p.health = Math.max(1, p.health - 15);
          log(state, "It did not go down easily. {You} {are} hurt.", "bad");
        }
      } else {
        const hurt = gapInjury(state, s);
        if (hurt > 0 && rng.chance(hurt)) {
          p.injured = Math.max(p.injured, 24 * 60);
          p.health = Math.max(1, p.health - 15);
          log(state, `The ${def.name} turns on {you}. {You} {are} hurt.`, "bad");
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
        record(state, { kind: "toolWorn", tool: "fishingSpear" });
        cue("toolBreaks");
        log(state, "The spear shaft splits.", "bad");
      }
      cue("spear");
      if (rng.chance(huntOdds(state, world, cal, d, s))) {
        st.pop[s] = Math.max(0, popOf(st, s) - 1);
        state.stats.animals++;
        if (!hasEvent(state, (e) => e.kind === "firstKill" && e.species === s)) record(state, { kind: "firstKill", species: s });
        const kg = fishKg(state, s) * yieldFactor(state, "fishing");
        const item = fishItem(s);
        produce(state, world, item, kg);
        // Raw fish is not eaten; the yield is what it cooks to.
        creditYield(state, "fish", kg * FOODS[item === "fish" ? "cookedFish" : "cookedOilyFish"].kcalPerKg);
        if (inSpawn(s, cal.month)) {
          const roe = Math.round(kg * ROE_SHARE * 100) / 100;
          produce(state, world, "roe", roe);
          creditYield(state, "roe", roe * FOODS.roe.kcalPerKg);
          log(state, `${anAnimal(s, true)}, ${kg.toFixed(1)} kg, and ${Math.round(roe * 1000)} g of roe.`, "good");
        } else log(state, `${anAnimal(s, true)}, ${kg.toFixed(1)} kg.`, "good");
      } else log(state, "Nothing bites.");
      return;
    }
    case "read": {
      const here = cellOf(state, world);
      readShore(state, world, here);
      log(state, readLine(state, world, cal, here), "good");
      return;
    }
    case "setTrap": {
      const here = cellOf(state, world);
      consume(invs, [{ item: "basketTrap", qty: 1 }]);
      st.trap = { cell: here, kg: 0, oilyKg: 0, fish: [...state.player.known[here].fish], age: 0 };
      log(state, `The trap is set at ${whereIs(state, world, here)}.`);
      state.stats.structures++;
      return;
    }
    case "emptyTrap": {
      const kg = takeTrapFish(state, world);
      log(state, `{You} {empty} the trap: ${kg.toFixed(1)} kg of fish.`, "good");
      return;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish" | "oilyFish" | "rawFat";
      const kg = Math.min(1, totalQty(invs, food));
      consume(invs, [{ item: food, qty: kg }]);
      const out = food === "rawMeat" ? "cookedMeat" : food === "fish" ? "cookedFish" : food === "oilyFish" ? "cookedOilyFish" : "fat";
      produce(state, world, out, kg);
      return;
    }
    case "crack": {
      consume(invs, [{ item: "bone", qty: 1 }]);
      const kg = Math.round(MARROW_KG_PER_BONE * marrowFactor(fatSeason(marrowAnimal(state), cal.month)) * 1000) / 1000;
      produce(state, world, "fat", kg);
      produce(state, world, "crackedBone", 1);
      creditYield(state, "marrow", kg * FOODS.fat.kcalPerKg);
      log(state, `{You} {crack} a bone: ${Math.round(kg * 1000)} g of marrow.`, "good");
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
        if (rec.tool && wearTool(state, rec.tool, wearFactor(state, world, "craft", rid))) record(state, { kind: "toolWorn", tool: rec.tool });
        log(state, `The ${rec.name} is spoiled: ${needsList(lost)} wasted.`, "bad");
        return;
      }
      consume(invs, needs);
      if (rec.tool && wearTool(state, rec.tool, wearFactor(state, world, "craft", rid))) record(state, { kind: "toolWorn", tool: rec.tool });
      if (rec.out.clothing) {
        const slot = CLOTHING[rec.out.clothing].slot;
        const old = p.clothing.find((g) => CLOTHING[g.id].slot === slot);
        p.clothing = p.clothing.filter((g) => g !== old);
        p.clothing.push({ id: rec.out.clothing, durability: 100 });
        log(state, `{You} {put} on the ${rec.name}${old ? ` and leave the ${CLOTHING[old.id].name} behind` : ""}.`, "good");
      } else if (rec.out.item) {
        const item = rec.out.item;
        produce(state, world, item, rec.out.qty ?? 1);
        if (item in TOOLS) {
          if (hasTool(p, item as ToolId)) log(state, `{You} {have} a spare ${rec.name}.`, "good");
          else if (takeUp(state, world, item as ToolId)) log(state, `{You} {have} a ${rec.name}.`, "good");
        }
      }
      return;
    }
    case "repair": {
      consume(invs, [{ item: "hide", qty: 0.5 }]);
      if (wearTool(state, "needle", 2 * wearFactor(state, world, "repair"))) record(state, { kind: "toolWorn", tool: "needle" });
      const worst = p.clothing.reduce((a, b) => (b.durability < a.durability ? b : a));
      worst.durability = Math.min(100, worst.durability + MEND_GAIN);
      log(state, `The ${CLOTHING[worst.id].name} is patched.`, "good");
      return;
    }
    case "sharpen": {
      consume(invs, [{ item: "stone", qty: 1 }]);
      const axe = axeInHand(p);
      if (axe) axe.durability = Math.min(100, axe.durability + 30);
      return;
    }
    case "hone": {
      const axe = axeInHand(p);
      if (axe) axe.durability = 100;
      wearTool(state, "whetstone", 1);
      return;
    }
    case "build": {
      const sid = arg as StructureId;
      if (sid === "snare") {
        consume(invs, STRUCTURES.snare.needs);
        st.structures.snares++;
      } else if (sid === "seep") {
        const here = cellOf(state, world);
        state.seeps[here] = { class: seepGround(world, here)!, litres: 0, ice: 0, dug: state.minute };
        delete st.build[sid];
      } else {
        st.structures[sid] = true;
        delete st.build[sid];
        if (sid === "dryingRack") st.racks = Math.min(MAX_RACKS, st.racks + 1);
        if (sid === "boughBed") st.boughBedAge = 0;
        if (sid === "leanTo" || sid === "dryingRack" || sid === "turfHut") st.structureAge[sid] = 0;
      }
      state.stats.structures++;
      // Once per structure per life; the first snare set is the record's snare line.
      if (!hasEvent(state, (e) => e.kind === "built" && e.structure === sid)) record(state, { kind: "built", structure: sid });
      log(state, `The ${STRUCTURES[sid].name} is ${sid === "snare" ? "set" : sid === "seep" ? "dug" : "finished"}.`, "good");
      return;
    }
    case "mend": {
      if (arg === "seep") {
        const s = state.seeps[cellOf(state, world)];
        if (s) s.dug = state.minute;
        log(state, "{You} {dig} the seep out again.", "good");
        return;
      }
      const sid = arg as DecayingId;
      consume(invs, MEND[sid].needs);
      st.structureAge[sid] = 0;
      record(state, { kind: "repaired", structure: sid });
      log(state, `The ${STRUCTURES[sid].name} is mended.`, "good");
      return;
    }
    case "light":
    case "lightIndoors": {
      consume(invs, [{ item: "firewood", qty: 1 }]);
      if (wearTool(state, "fireDrill", 2 * wearFactor(state, world, "light"))) record(state, { kind: "toolWorn", tool: "fireDrill" });
      const lr = lightingInRain(state.weather, ambientTemperature(cal, state.weather), roofed(st), hasQuirk(state, "steadyByTheFire"));
      if (lr.failChance > 0 && rng.chance(lr.failChance)) {
        log(state, "The tinder will not catch.", "bad");
        return;
      }
      st.fire.lit = true;
      cue("fireCatches");
      st.fire.fuelKg += 1;
      // The row names the method: the pit fire is outdoors whatever stands, the fire indoors is indoors.
      st.fire.indoors = id === "lightIndoors";
      log(state, "Smoke, then flame. The fire is lit.", "good");
      return;
    }
    case "lightTorch": {
      consume(invs, [{ item: "torch", qty: 1 }]);
      if (!(atCamp(state, world) && st.fire.lit) && wearTool(state, "fireDrill", wearFactor(state, world, "lightTorch"))) record(state, { kind: "toolWorn", tool: "fireDrill" });
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
      if (arg === "hole" && !waterSource(state, world) && state.weather.iceCm >= ICE_SHORE_CM) cutIceHole(state, world);
      const added = fillVessels(state, world);
      if (added > 1e-9) log(state, `{You} {fill} ${added.toFixed(1)} litres.`);
      return;
    }
    case "hang": {
      const kg = loadRack(state, world);
      if (kg > 0) log(state, `{You} {hang} ${kg.toFixed(1)} kg of meat to dry.`);
      return;
    }
    case "iceHole": {
      cutIceHole(state, world);
      return;
    }
    case "makeCamp": {
      const here = cellOf(state, world);
      st.campCell = here;
      if (state.intent) state.intent.campCell = here;
      log(state, "{You} {make} camp here.");
      return;
    }
    // A sleep leaves nothing behind it: it ran to the wake line, and whether
    // the body lies down again is the model's to say next minute.
    case "sleep":
    case "haul":
    case "night":
    case "wait":
    case "travel":
    case "walk":
    case "rest":
      return;
  }
}

/** Moves the live fish out of this region's trap into the pack and credits the trap's row. Returns the kilos taken (fish and oily fish together). */
function takeTrapFish(state: GameState, world: World): number {
  const st = regionState(state, world, state.player.region);
  const kg = st.trap?.kg ?? 0;
  if (!st.trap || kg <= 1e-9) return 0;
  const oilyKg = st.trap.oilyKg;
  const leanKg = kg - oilyKg;
  st.trap.kg = 0;
  st.trap.oilyKg = 0;
  st.trap.age = 0;
  if (leanKg > 1e-9) {
    produce(state, world, "fish", leanKg);
    creditYield(state, "trap", leanKg * FOODS.cookedFish.kcalPerKg);
  }
  if (oilyKg > 1e-9) {
    produce(state, world, "oilyFish", oilyKg);
    creditYield(state, "trap", oilyKg * FOODS.cookedOilyFish.kcalPerKg);
  }
  state.stats.animals++;
  return kg;
}

/** The fish in the trap come out when you arrive at its cell, as hares do at the snares: a basket at the shore you stand on is not a trip. */
function collectTrap(state: GameState, world: World): void {
  const st = regionState(state, world, state.player.region);
  if (!st.trap || cellOf(state, world) !== st.trap.cell) return;
  const kg = takeTrapFish(state, world);
  if (kg > 1e-9) log(state, `${kg.toFixed(1)} kg of fish in the trap at ${whereIs(state, world, st.trap.cell)}; {you} {take} them.`, "good");
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
