import { localWeather } from "./weather";
import { Rng } from "../rng";
import { CELL_KM, fmtDuration, shareWord } from "../units";
import { BIG_EATER_PACE, body, FELL_FEAR_LINE, fearsFell, hasQuirk, SHORE_FEAR_LINE, shunsShore } from "./person";
import { cellAt, hasSpot, neighbours, regionAt, spotOf, type World } from "../world/gen";
import { passable, routeKm } from "../world/route";
import { itemLabel, loadRack } from "./actions";
import { absence, popOf, regionDensity } from "./animals";
import { dayNumber, type Calendar } from "./calendar";
import { cellPossibilities, leaveCamp, needsMending, rackCapacity } from "./camp";
import { cue } from "./cues";
import { exploreRoute, frontierRoute, routeConditions, survivorRoute, survivorRouteMinutes } from "./routing";
import {
  addItem, AXES, axeInHand, axeNear, canConsume, consume, hasTool, herePile, listItems, pile, pileAt, produce, qty, reach,
  removeItem, shortOf, takeUp, toolNear, totalQty, TRACE_KG, transfer, wearTool, weight,
} from "./inventory";
import {
  BARK_DRY_RATIO, BARK_FLOUR_MINUTES_PER_KG, BARK_FRESH_KG_PER_HOUR, BARK_FROM_DOY, BARK_TO_DOY, BARK_TREE_SHARE,
  BERRY_PICK_KG, BERRY_WINTER_SHARE, CLOTHING, DECAYING, type Need, EGG_CLUTCH_KG, EGG_FROM_DOY, EGG_KG_PER_HOUR, EGG_TO_DOY, FOODS, ITEM_KG, ITEM_NAMES, KCAL_FULL, MARROW_KG_PER_BONE, MAX_RACKS, MAX_SNARES, MEND,
  RECIPES, RECIPE_IDS, ROE_SHARE, ROOT_FROM_DOY, ROOT_KG_PER_HOUR, ROOT_TO_DOY, ROOT_WINTER_KG_PER_HOUR, SAP_FROM_DOY, SAP_KCAL, SAP_LITRES, SAP_TAPS_PER_DAY, SAP_TO_DOY,
  SEAWEED_KG_PER_HOUR, SNOW_SHELTER_CM, STRUCTURES, STRUCTURE_IDS, TOOLS, TORCH_BURN_MINUTES,
} from "./items";
import { creditEaten, creditYield } from "./ledger";
import { attemptOdds, illuminance, lightFactor, lightWord, NIGHT_WORK, SPOT_LUX } from "./light";
import { log } from "./log";
import { baseWalkSpeed, die, walkSpeed, workSpeed } from "./player";
import { disabled } from "./probe";
import { hasEvent, record } from "./record";
import {
  chopSticks, craftSuccess, effectiveNeeds, fishKg, gap, gapInjury, huntExtras, injuryChance,
  masteryKey, masteryProgress, oddsFactor, RECOMMENDED, skillLevel, SKILL_NAMES,
  skillOf, spoiledNeeds, train, trainTask, wearFactor, yieldFactor,
} from "./skills";
import { debtFallHalved, minutesUntilWake, sleepMinutes } from "./sleep";
import {
  atCamp, campCellOf, cellCenter, cellIndex, cellOf, forestCell, heathCell, hereTerrain,
  placeAt, rockCell, setRegion, spotHere, SPOT_WORDS, straightKm, watersideCell,
} from "./position";
import { EMBER_RELIGHT_MINUTES, fireAt, fireSiteMinutes, hasEmbers, lightingInRain, roofed, SMOKE_COUGH, splitIsWet, splitSheltered } from "./fire";
import { recordOpportunityEvent } from "./opportunities";
import { builtProtection, coverCeiling, EMERGENCY_MINUTES, findCover, improveCover, improveCoverMinutes, protectionOf, PROTECTION_WORDS } from "./shelter";
import { isRead, readLine, readShore } from "./knowledge";
import { isKnown, knownShare } from "./mapped";
import { campSite, discovery, regionState, siteAt, siteFor } from "./regionstate";
import { SEEP, seepGround, seepNeedsRedig } from "./seep";
import { seeFrom, sightReachCells } from "./sight";
import { rootCellFullKg, rootCellKg, rootDigFactor, setRootCellKg } from "./stocks";
import { fatSeason, fishItem, fishSpecies, inSpawn, isFish, LARGE_GAME, marrowFactor, type Species, SPECIES_DEFS, waterOf } from "./species";
import { BERRY_FROM_DOY, BERRY_TO_DOY } from "./tables";
import {
  type DecayingId, FILL_METHODS, type FillMethod, type GameState, type IceMode, type Inventory, type ItemId, type PausedTask, type RecipeId,
  type Protection, type Site, type SkillId, type SpotId, type StructureId, type TaskId, type ToolId, type WorkOrder,
} from "./types";
import { isWorkIntent } from "./types";
import { owningOrder } from "./orderowner";
import { campPileHere, campWaterRoom, fillVessels, ICE_SHORE_CM, iceHoleOpen, takeUpTripVessel, tripLitres, tripVessel, vesselLitresCapacity, vesselRoom, waterSource, WATER_FULL } from "./water";
import { ambientTemperature, DEEP_SNOW_CM, forecastKnowledge, forecastText, ICE_SAFE_CM, sameForecastKnowledge, skyReadDay, stormNow, walkableIce } from "./weather";
import { plain } from "./voice";
import { claimHuntableAnimal, knownBearDen, unknownBearDen } from "./wildlife-agents";
import { carcassMinutes, createCarcass, disturbHuntingGround, hasRecentHuntSign, huntPressureFactor, huntSignOdds, huntSpeciesWeights, knownHuntSpecies, noteFailedHunt, noteHuntSign, processCarcass } from "./hunting";
import { noteFieldRecovery, noteHauledHuntFood, noteHuntAttempt, noteHuntFoodTransformed, noteHuntPursuit, pendingHuntMinutes } from "./hunt-audit";

export type TaskGroup = "gather" | "hunt" | "camp" | "craft" | "build" | "move";

export interface InitialWalk {
  cell: number;
  destination: string;
  nearest: boolean;
  km: number;
  minutes: number;
}

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
  /**
   * Work this ground will never offer, however long you wait: there is no
   * outcrop in this region, no shore, no forest. Told apart from the reasons
   * that pass - a storm, a missing tool, a season - because a row that can
   * never run here is not one to queue: it would sit at the head of the list
   * stopping every order under it until it was struck off by hand.
   */
  never?: boolean;
  /** Share already done and waiting to be resumed, when there is one. */
  resume?: number;
  /** The cell the work resolved to, when an intent chose one; absent means wherever the player stands. */
  cell?: number;
  /** The first route this action will take before doing work. */
  initialWalk?: InitialWalk;
  /** Mastery of this action, the share of the way to the next level, and the skill and key it is kept under. */
  mastery?: { level: number; share: number; skill: SkillId; key: string };
  /** The recommended level, whether you are under it, and by how many levels. */
  recommended?: { text: string; under: boolean; short: number };
}

/** Work that stays where it was left: the half-felled tree is in that cell of forest. */
const LOCATED = new Set<TaskId>(["chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges", "hunt", "fish", "cook", "iceHole", "read", "eggs", "innerBark", "roots", "tapSap", "seaweed", "findShelter", "improveCover"]);
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

/**
 * Why every camp-addressed task is refused in a region nobody has made camp
 * in. One line for the lot, so the answer to "hang meat", "light the fire"
 * and "camp for the night" is the same sentence and points at the same fix.
 */
export const NO_CAMP = "no camp here yet";

/** Tasks whose pace depends on the body; the rest are walks and waits. Exported so a test can hold availableTasks to covering every one of them. */
export const WORK_TASKS = new Set<TaskId>([
  "chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges", "hunt", "findDen", "fish", "cook",
  "craft", "repair", "sharpen", "hone", "build", "mend", "light", "lightIndoors", "lightTorch", "fill", "iceHole", "hang", "read",
  "setTrap", "emptyTrap", "makeCamp", "crack", "eggs", "innerBark", "grindBark", "roots", "tapSap", "seaweed",
  "findShelter", "improveCover", "emergencyShelter",
]);

/** The tool a task swings, or null. What check looks for in reach and beginTask takes up. */
export function toolFor(id: TaskId, arg?: string): ToolId | null {
  switch (id) {
    case "chop": case "split": case "crack": return "axe";
    case "hunt": return "bow";
    case "fish": return "fishingSpear";
    case "craft": return RECIPES[arg as RecipeId]?.tool ?? null;
    case "repair": return "needle";
    case "hone": return "whetstone";
    case "light": case "lightIndoors": return "fireDrill";
    case "fill": case "melt": return "barkBucket";
    case "iceHole": return "axe";
    case "mend": return null;
    case "innerBark": return "knife";
    case "tapSap": return "knife";
    default: return null;
  }
}

/** Berries ripen mid-July and are gone by mid-October. */
export function berrySeason(cal: Calendar): boolean {
  return cal.dayOfYear >= BERRY_FROM_DOY && cal.dayOfYear <= BERRY_TO_DOY;
}

/** November to April, month 0-indexed: the window the frozen lingon under the snow are worth digging for. */
function winterBerries(cal: Calendar): boolean {
  return cal.month >= 10 || cal.month <= 3;
}

/** Inner bark strips full rate off young spring branches; the rest of the year, half. */
export function barkSeason(cal: Calendar): boolean {
  return cal.dayOfYear >= BARK_FROM_DOY && cal.dayOfYear <= BARK_TO_DOY;
}

/** Whether a cell yields seaweed right now: a sea shore, with the water open. Shared by the seaweed task's check and the unexploited line so the two cannot drift apart. */
export function seaweedAvailable(state: GameState, world: World, cell: number): boolean {
  return watersideCell(world, cell, "sea") && localWeather(state, world, cell).iceCm < ICE_SHORE_CM;
}

/**
 * The whole job in minutes. Every structure but the fire site is its table
 * value; the fire site is the ground it is cleared on, so the same camp costs
 * one thing in summer and another under snow, and the progress already done
 * is measured against whichever it is now.
 */
export function buildMinutes(state: GameState, world: World, sid: StructureId, at: number): number {
  if (sid !== "firePit") return STRUCTURES[sid].minutes;
  return fireSiteMinutes(cellAt(world, at).terrain, localWeather(state, world, at).snowCm);
}

/**
 * What a build still wants, in the words a reader would use: "short 2
 * stone", not "missing materials" beside a recipe list reading "2 stone,
 * 4 sticks" - which a tester holding four stone read as "missing 2 stone".
 * The list is what the thing costs; this is what is wanting.
 *
 * The words end in AT_CAMP because the fetch path keys on that rather than
 * on the whole sentence: it used to compare against the exact prose, so
 * rewording this silently turned fetching off.
 */
const AT_CAMP = " at camp";

function shortList(invs: Inventory[], needs: Need[]): string {
  const short = shortOf(invs, needs);
  if (!short.length) return `missing materials${AT_CAMP}`;
  const said = short.map((s) => itemLabel(s.item, s.qty));
  const list = said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}` : said[0];
  return `short ${list}${AT_CAMP}`;
}

/**
 * Whether a refusal is "the camp has not got the materials", which is the
 * one a build can answer by fetching them. Named, so the wording above is
 * free to change without turning a feature off from another file.
 */
export function isShortAtCamp(why: string): boolean {
  return why.endsWith(AT_CAMP);
}

function needsList(needs: { item: string; qty: number; alt?: string }[]): string {
  return needs
    .map((n) => `${itemLabel(n.item as ItemId, n.qty)}${n.alt ? ` (or ${itemLabel(n.alt as ItemId, n.qty)})` : ""}`)
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
    if (val === "camp") {
      const camp = campCellOf(state, world);
      return camp === null ? null : { cell: camp, label: SPOT_WORDS.camp, thin };
    }
    const s = spotOf(regionAt(world, state.player.region), val as SpotId);
    return s ? { cell: s.cell, label: SPOT_WORDS[val as SpotId], thin } : null;
  }
  if (kind === "region") {
    const id = Number(val);
    const r = regionAt(world, id);
    // Travelling to a region aims at its own ground, and a region nobody has camped in
    // still has a landmark cell to walk to: the one generation put its "camp" spot on.
    return r ? { cell: campCellOf(state, world, id) ?? r.campCell, label: r.name, thin } : null;
  }
  if (kind === "cell") {
    const cell = Number(val);
    if (!Number.isInteger(cell) || cell < 0 || cell >= world.w * world.h) return null;
    return { cell, label: whereIs(state, world, cell), thin };
  }
  return null;
}

/** The ice a walk crosses water with: thin when asked for and available, safe ice by default, else none. */
function walkIceMode(state: GameState, world: World, thin: boolean): IceMode {
  return thin ? "thin" : walkableIce(localWeather(state, world));
}

/** "the forest", "camp in Stensund", "a spot 0.4 km east": how a cell is named to the player. */
export function whereIs(state: GameState, world: World, cell: number): string {
  const region = cellAt(world, cell).region;
  const r = regionAt(world, region);
  const inRegion = region === state.player.region ? "" : ` in ${r.name}`;
  if (campCellOf(state, world, region) !== null && cell === campCellOf(state, world, region)) return `${SPOT_WORDS.camp}${inRegion}`;
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
function huntDetail(state: GameState, s: Species): string {
  const x = huntExtras(state, s);
  const parts = [`${x.meatKg} kg meat`];
  if (x.hideKg) parts.push(`${x.hideKg} kg hide`);
  if (x.furKg) parts.push(`${x.furKg} kg fur`);
  if (x.fatKg) parts.push(`${x.fatKg} kg fat`);
  if (x.bone) parts.push(`${x.bone} bone`);
  if (x.sinew) parts.push(`${x.sinew} sinew`);
  return parts.join(", ");
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
  if (id === "hunt") return huntSpeciesWeights(state, world, cal, at).map((row) => ({ s: row.species, w: row.weight }));
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const pool = fishSpecies();
  const obs = state.player.known[at];
  const out: { s: Species; w: number }[] = [];
  for (const s of pool) {
    if (obs && !obs.fish.includes(s)) continue;
    if (!r.capacity[s]) continue;
    const def = SPECIES_DEFS[s].hunt!;
    if (!spotSuits(world, at, def.spot, waterOf(s))) continue;
    if (popOf(st, s) < 1) continue;
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
  // No camp to pour into: the vessels being full is the whole of it, and "camp is full"
  // would name a place that does not exist yet.
  if (homeSt.campCell === null) return "the vessels are full";
  return campWaterRoom(pileAt(state, homeSt.campCell), campSite(homeSt)) > 0 ? "the vessels are full" : "camp is full";
}

/** How much is about for a hunt or a cast from this cell, by the same weights the draw uses. 0 when the ground suits nothing. */
export function candidateWeight(state: GameState, world: World, cal: Calendar, id: "hunt" | "fish", at: number): number {
  return candidates(state, world, cal, id, at).reduce((a, x) => a + x.w, 0);
}

/**
 * What "anything" turns out to be: drawn by how likely each species is to
 * be met from this cell, hunt and cast alike. What walks past is not the
 * hunter's choice at first; practice shifts the draw toward the best usable
 * recovery on ground the hunter had a reason to choose. Null when nothing
 * is plausible here.
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
  return st.campCell !== null && cellOf(state, world) === st.campCell && qty(pile(state, st.campCell), item) >= 1;
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
  const target = id === "walk" || id === "travel" ? walkTarget(state, world, arg ?? "")?.cell : LOCATED.has(id) ? at : undefined;
  if (target !== undefined && fearsFell(state, world, target) && cellAt(world, target).terrain === "fell") return { ...o, ok: false, why: FELL_FEAR_LINE };
  if (shunsShore(state, world, at) && (SHORE_TASKS.has(id) || (id === "fill" && (arg === "shore" || arg === "hole")))) return { ...o, ok: false, why: SHORE_FEAR_LINE };
  return o;
}

export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const paused = state.paused[pauseKey(state, world, id, arg, at) ?? ""];
  if (id === "hunt" && paused?.huntPhase === "field" && paused.carcassId !== undefined) {
    const carcass = state.carcasses.find((candidate) => candidate.id === paused.carcassId && candidate.cell === at);
    if (carcass) {
      const duration = paused.duration ?? carcassMinutes(carcass);
      return {
        id, arg, group: "hunt", label: `Field dress ${SPECIES_DEFS[carcass.species].name}`,
        detail: "recover meat before it spoils", duration: duration * (1 - paused.fraction), ok: true, why: "",
        repeatable: false, resume: paused.fraction,
      };
    }
  }
  const o = darkNote(state, world, cal, id, at, checkFresh(state, world, cal, id, arg, at));
  const fraction = pausedFraction(state, world, id, arg, at);
  if (fraction > 0 && o.ok) return { ...o, resume: fraction, duration: o.duration * (1 - fraction) };
  if (fraction > 0) return { ...o, resume: fraction };
  return o;
}

/**
 * What the dark is costing this work, on the row that offers it. The work is
 * never refused for want of light, so this is a price rather than a reason:
 * the odds an attempt comes off, and the word for the light they come from.
 */
function darkNote(state: GameState, world: World, cal: Calendar, id: TaskId, at: number, o: TaskOption): TaskOption {
  if (!o.ok || !NIGHT_WORK[id]) return o;
  const lux = illuminance(state, world, cal, at);
  const odds = lightFactor(lux, NIGHT_WORK[id].needLux, NIGHT_WORK[id].darkOdds);
  if (odds > 0.995) return o;
  return { ...o, detail: `${o.detail}${o.detail ? "; " : ""}${lightWord(lux)}, ${oddsText(odds)}` };
}

export function checkFresh(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world), huntFromAny = false): TaskOption {
  const o = feared(state, world, id, arg, at, checkRaw(state, world, cal, id, arg, at, huntFromAny));
  // A big eater works a tenth faster at anything the body paces.
  if (o.ok && WORK_TASKS.has(id) && hasQuirk(state, "bigEater")) return { ...o, duration: o.duration * BIG_EATER_PACE };
  return o;
}

function checkRaw(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world), huntFromAny = false): TaskOption {
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
  const campCell = st.campCell;
  const toolInvs = at !== here && here === campCell ? [...invs, pile(state, here)] : invs;
  const camp = campCell !== null && at === campCell;
  const terrain = cellAt(world, at).terrain;
  const opt = (partial: Partial<TaskOption> & { label: string; group: TaskGroup }): TaskOption => ({
    id, arg, detail: "", duration: 0, ok: true, why: "", repeatable: false, ...partial,
  });
  /** Ground the task needs under foot, with the spot to walk to when it is not. */
  const ground = (ok: boolean, spot: SpotId, what: string, o: TaskOption): TaskOption => {
    if (ok) return o;
    if (!hasSpot(r, spot)) return { ...o, ok: false, never: true, why: `no ${what} in ${r.name}` };
    return { ...o, ok: false, why: `stand ${what === "water" ? "by" : "in"} the ${what}; walk to ${SPOT_WORDS[spot]}` };
  };
  /**
   * The one guard every camp-addressed task goes through. Two answers, in
   * order: there is no camp in this region at all, or there is one and it is
   * not the ground under foot. `haveCamp` is the first answer alone, for the
   * work that walks itself to camp rather than needing to be stood at it.
   */
  const haveCamp = (o: TaskOption): TaskOption => (campCell === null ? { ...o, ok: false, why: NO_CAMP } : o);
  const needCamp = (o: TaskOption): TaskOption => (campCell === null ? { ...o, ok: false, why: NO_CAMP } : camp ? o : { ...o, ok: false, why: "walk to camp" });

  switch (id) {
    case "chop": {
      const tree = arg === "spruce" || arg === "pine" || arg === "birch" ? arg : null;
      const label = tree ? `Fell ${tree}` : "Fell any tree";
      const base = opt({ group: "gather", label, detail: `4 logs and ${chopSticks(state, world)} sticks left on the ground`, duration: (terrain === "spruce" ? 50 : 60) * edgeFactor(state), repeatable: true });
      if (tree && r.frac[tree] <= 0) return { ...base, ok: false, never: true, why: `no ${tree} in ${r.name}` };
      const o = ground(forestCell(world, at) && (!tree || terrain === tree), "forest", tree ? `${tree} forest` : "forest", base);
      if (!o.ok) return o;
      if (stormNow(localWeather(state, world, at), state.minute)) return { ...o, ok: false, why: "too rough" };
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
      const winter = winterBerries(cal);
      const kg = BERRY_PICK_KG * yieldFactor(state, "foraging") * (winter ? BERRY_WINTER_SHARE : 1);
      const label = winter ? "Pick frozen lingon under the snow" : "Pick berries";
      const detail = winter ? `${kg.toFixed(2)} kg berries, dug from under the snow` : `${kg.toFixed(1)} kg berries, mid-July to mid-October`;
      const o = ground(heathCell(world, at), "heath", "heath", opt({ group: "gather", label, detail, duration: 60, repeatable: true }));
      if (!o.ok) return o;
      if (winter) {
        if (localWeather(state, world, at).snowCm >= DEEP_SNOW_CM) return { ...o, ok: false, why: "under too much snow" };
        return o;
      }
      if (!berrySeason(cal)) return { ...o, ok: false, why: "nothing ripe yet" };
      return o;
    }
    case "innerBark": {
      const o = opt({ group: "gather", label: "Strip inner bark", detail: `${BARK_FRESH_KG_PER_HOUR} kg an hour on pine, half outside spring; dries three to one, grinds to flour`, duration: 60, repeatable: true });
      if (terrain !== "pine") return { ...o, ok: false, why: "stand in pine forest" };
      if (!kitInReach(state, world, "knife", toolInvs) && !hasTool(p, "knife")) return { ...o, ok: false, why: "needs a knife" };
      if (st.wood < 1) return { ...o, ok: false, why: "the pines are stripped" };
      if (disabled("bark")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "roots": {
      const ground = watersideCell(world, at) || terrain === "bog" || terrain === "meadow";
      const winter = cal.dayOfYear < ROOT_FROM_DOY || cal.dayOfYear > ROOT_TO_DOY;
      const full = rootCellFullKg(world, at);
      const left = rootCellKg(st, world, at);
      const factor = rootDigFactor(left, full);
      const rate = Number(((winter ? ROOT_WINTER_KG_PER_HOUR : ROOT_KG_PER_HOUR) * factor).toFixed(3));
      const dug = `food once cooked. ${rate} kg an hour with a digging stick. Cattail and reed at the water, dandelion on the meadow`;
      // A patch thins before it goes: the row says which it is, so the next dig is aimed at ground that still has a stand on it.
      const detail = factor < 1 ? `${dug}. Dug over here, the next patch is better` : dug;
      const o = opt({ group: "gather", label: "Dig roots", detail, duration: 60, repeatable: true });
      if (!ground) return { ...o, ok: false, why: "stand by the water, on the bog or on the meadow" };
      if (winter && !(watersideCell(world, at) && iceHoleOpen(state, at))) return { ...o, ok: false, why: "the ground is frozen; an ice hole reaches the rhizomes" };
      if (totalQty(invs, "stick") < 1) return { ...o, ok: false, why: "needs a stick to dig with" };
      if (left <= TRACE_KG) return { ...o, ok: false, why: "the ground is dug out" };
      if (disabled("roots")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "tapSap": {
      const o = opt({ group: "gather", label: "Tap a birch", detail: `${SAP_LITRES} litres of sap drunk on the spot, ${SAP_KCAL} kcal; early May until the leaves open`, duration: 30, repeatable: true });
      if (terrain !== "birch") return { ...o, ok: false, why: "stand among birches" };
      if (cal.dayOfYear < SAP_FROM_DOY || cal.dayOfYear > SAP_TO_DOY) return { ...o, ok: false, why: cal.dayOfYear < SAP_FROM_DOY ? "the sap has not risen" : "the sap has stopped" };
      if (!kitInReach(state, world, "knife", toolInvs) && !hasTool(p, "knife")) return { ...o, ok: false, why: "needs a knife" };
      if (st.sapTaps.day === dayNumber(state.minute) && st.sapTaps.n >= SAP_TAPS_PER_DAY) return { ...o, ok: false, why: "the birches have given today's sap" };
      if (disabled("sap")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "seaweed": {
      const o = opt({ group: "gather", label: "Gather seaweed", detail: `${SEAWEED_KG_PER_HOUR} kg an hour off the rocks; two kilos a day is all a body takes`, duration: 60, repeatable: true });
      if (!seaweedAvailable(state, world, at)) {
        return { ...o, ok: false, why: !watersideCell(world, at, "sea") ? "stand on the sea shore" : "the shore is iced over" };
      }
      if (disabled("seaweed")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "split": {
      const sheltered = splitSheltered(state, world, at);
      const wet = !sheltered && splitIsWet(state, world, at);
      const o = opt({ group: "camp", label: "Split a log", detail: `one log into 20 kg of ${wet ? "wet " : ""}firewood${sheltered ? ", under the roof" : ""}`, duration: 15 * edgeFactor(state), repeatable: true });
      if (!axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs an axe" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      return o;
    }
    case "splitWedges": {
      const sheltered = splitSheltered(state, world, at);
      const wet = !sheltered && splitIsWet(state, world, at);
      const o = opt({ group: "camp", label: "Split a log with wedges", detail: `one log into 20 kg of ${wet ? "wet " : ""}firewood, driven with a stick; a third the axe's pace${sheltered ? ", under the roof" : ""}`, duration: 45, repeatable: true });
      if (totalQty(invs, "wedge") < 2) return { ...o, ok: false, why: "needs two wedges" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      return o;
    }
    case "hang": {
      const site = campSite(st);
      const raw = totalQty(invs, "rawMeat");
      const room = rackCapacity(site) - st.rack.kg;
      const kg = Math.min(raw, room);
      const o = needCamp(opt({ group: "camp", label: "Hang meat to dry", detail: `5 minutes a kilo; ${rackCapacity(site)} kg on the racks, two dry days`, duration: Math.max(1, Math.round(5 * kg)), repeatable: false }));
      if (!o.ok) return o;
      if (!site?.structures.dryingRack) return { ...o, ok: false, why: "needs a drying rack" };
      if (raw <= TRACE_KG) return { ...o, ok: false, why: "no raw meat here" };
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
      const iced = localWeather(state, world, at).iceCm >= ICE_SHORE_CM && !iceHoleOpen(state, at);
      if (method === "shore") return iced ? { ...o, ok: false, why: "iced over" } : o;
      if (localWeather(state, world, at).iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open, no hole needed" };
      // The pack and the work cell only: the vessel and the axe for a fill are the fill task's own rule, and provisionKit leaves a fill's kit to it, so a camp-pile axe is never taken up on the way out.
      if (!axeNear(p, invs)) return { ...o, ok: false, why: "needs an axe" };
      return iced ? { ...o, detail: `${o.detail}; cuts the hole first, wearing the axe`, duration: 25 } : o;
    }
    case "iceHole": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "camp", label: "Open an ice hole", detail: "20 minutes with the axe; skins over by morning", duration: 20 }));
      if (!o.ok) return o;
      if (localWeather(state, world, at).iceCm < ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is open" };
      if (iceHoleOpen(state, at)) return { ...o, ok: false, why: "already open here" };
      if (!axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs an axe" };
      return o;
    }
    case "hunt": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "hunt", at);
        const o = opt({ group: "hunt", label: "Hunt anything", duration: 120, repeatable: true, detail: "follow whatever sign you find" });
        if (!c.length) return ground(false, "forest", "forest", o);
        if (!toolNear(p, "bow", toolInvs)) return { ...o, ok: false, why: "needs a bow" };
        if (!kitInReach(state, world, "arrow", [p.pack])) return { ...o, ok: false, why: "needs arrows in the pack" };
        return o;
      }
      const s = arg as Species;
      const def = SPECIES_DEFS[s];
      if (!def?.hunt || isFish(s)) return { ...opt({ group: "hunt", label: "Hunt" }), ok: false, why: "no such animal" };
      const den = s === "bear" ? knownBearDen(state, cal) : null;
      const denOdds = Math.min(0.9, 0.55 * oddsFactor(state, "bear"));
      const base = opt({
        group: "hunt", label: den ? `Hunt ${def.name} at den` : `Hunt ${def.name}`, duration: den ? Math.max(120, def.hunt.minutes / 2) : def.hunt.minutes, repeatable: true,
        detail: den ? `${Math.round(denOdds * 100)}% chance; known den, twice the injury risk` : huntDetail(state, s),
      });
      const o = den ? base : ground(spotSuits(world, at, def.hunt.spot, waterOf(s)), def.hunt.spot, SPOT_WHAT[def.hunt.spot], base);
      if (!o.ok) return o;
      if (!toolNear(p, "bow", toolInvs)) return { ...o, ok: false, why: "needs a bow" };
      if (!kitInReach(state, world, "arrow", [p.pack])) return { ...o, ok: false, why: "needs arrows in the pack" };
      // Away before empty: the last of a flock lingers in the numbers for weeks after it has gone.
      const gone = absence(def, cal, localWeather(state, world, at).iceCm);
      if (gone && !den) return { ...o, ok: false, why: gone };
      if (!den && !huntFromAny && !hasRecentHuntSign(state, at, s)) return { ...o, ok: false, why: "no fresh sign" };
      return o;
    }
    case "findDen": {
      const bear = unknownBearDen(state, cal);
      const o = opt({ group: "hunt", label: "Find bear den", duration: 240, repeatable: true, detail: `${Math.round(findDenOdds(state) * 100)}% chance; follow autumn or winter sign` });
      if (skillLevel(state, "hunting") < 5) return { ...o, ok: false, why: `needs Hunting 5; {you} {are} ${skillLevel(state, "hunting")}` };
      if (!bear) {
        const known = state.wildlife.subjects.some((subject) => subject.species === "bear" && subject.region === p.region && subject.denCell !== null && state.wildlife.knownDens[subject.denCell]);
        return { ...o, ok: false, why: known ? "the occupied den here is already known" : "no denning bear sign here now" };
      }
      return o;
    }
    case "fish": {
      if (arg === "any") {
        const c = candidates(state, world, cal, "fish", at);
        const inRegion = fishSpecies().filter((k) => r.capacity[k] && popOf(st, k) >= 1 && !absence(SPECIES_DEFS[k], cal, localWeather(state, world, at).iceCm));
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
      if (stormNow(localWeather(state, world, at), state.minute)) return { ...o, ok: false, why: "too rough" };
      if (!toolNear(p, "fishingSpear", toolInvs)) return { ...o, ok: false, why: "needs a fishing spear" };
      const away = absence(def, cal, localWeather(state, world, at).iceCm);
      if (away) return { ...o, ok: false, why: away };
      if (popOf(st, s) < 1) return { ...o, ok: false, why: `no ${def.name} here now` };
      return o;
    }
    case "read": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Read the water", detail: "an hour watching this shore: what lives in it and where it lies", duration: 60, repeatable: false }));
      if (!o.ok) return o;
      if (localWeather(state, world, at).iceCm >= ICE_SHORE_CM) return { ...o, ok: false, why: "the water is under ice" };
      if (isRead(state, at)) return { ...o, ok: false, why: "{you} {have} read this water" };
      return o;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish" | "oilyFish" | "rawFat" | "roots";
      const kg = Math.min(1, totalQty(invs, food));
      const label = food === "rawFat" ? "Render fat" : `Cook ${ITEM_NAMES[food]}`;
      const detail = food === "rawFat" ? "1 kg at a time; raw fat rots in three warm days, rendered it keeps" : "1 kg at a time over the fire";
      const o = opt({ group: "camp", label, detail, duration: Math.max(1, 10 * kg), repeatable: true });
      if (!fireAt(state, world, at)) return { ...o, ok: false, why: "needs a lit fire" };
      if (kg <= TRACE_KG) return { ...o, ok: false, why: `no ${ITEM_NAMES[food]} here` };
      if (food === "roots" && disabled("roots")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "crack": {
      const o = opt({ group: "camp", label: "Crack bones for marrow", detail: `${MARROW_KG_PER_BONE * 1000} g of marrow a bone at a fat animal, less in spring; the fragments still make a needle`, duration: 20, repeatable: true });
      if (totalQty(invs, "bone") < 1) return { ...o, ok: false, why: "no bones here" };
      if (totalQty(toolInvs, "stone") < 1 && !axeNear(p, toolInvs)) return { ...o, ok: false, why: "needs a stone or the axe" };
      if (disabled("marrow")) return { ...o, ok: false, why: "disabled for the probe" };
      if (!fireAt(state, world, at)) return { ...o, ok: false, why: "needs a lit fire" };
      return o;
    }
    case "eggs": {
      const shore = watersideCell(world, at);
      const heath = heathCell(world, at);
      const o = opt({ group: "gather", label: "Gather eggs", detail: `${EGG_KG_PER_HOUR} kg an hour from the nests; May and June, and the nests empty`, duration: 60, repeatable: true });
      if (!(shore || heath)) return { ...o, ok: false, why: "stand by the water or on the heath" };
      if (cal.dayOfYear < EGG_FROM_DOY || cal.dayOfYear > EGG_TO_DOY) return { ...o, ok: false, why: "no eggs until May" };
      if (st.nests <= 1e-9) return { ...o, ok: false, why: "the nests are empty" };
      if (disabled("eggs")) return { ...o, ok: false, why: "disabled for the probe" };
      return o;
    }
    case "grindBark": {
      const kg = Math.min(1, totalQty(invs, "driedBark"));
      const o = opt({ group: "camp", label: "Grind bark flour", detail: "20 minutes a kilo with a stone", duration: Math.max(1, Math.round(BARK_FLOUR_MINUTES_PER_KG * kg)), repeatable: true });
      if (kg <= TRACE_KG) return { ...o, ok: false, why: "no dried bark here" };
      if (totalQty(toolInvs, "stone") < 1) return { ...o, ok: false, why: "needs a stone" };
      if (disabled("bark")) return { ...o, ok: false, why: "disabled for the probe" };
      if (!fireAt(state, world, at)) return { ...o, ok: false, why: "needs a lit fire" };
      return o;
    }
    case "craft": {
      const rid = arg as RecipeId;
      const rec = RECIPES[rid];
      const needs = effectiveNeeds(state, rid);
      // The label is what a queued row says, and a queue holds acts: a row
      // reading "snare" is a thing, and "Make snare" is the job it stands for.
      const o = opt({ group: "craft", label: `Make ${rec.name}`, detail: needsList(needs) + (rec.tool ? `; needs a ${TOOLS[rec.tool].name}` : ""), duration: rec.minutes, repeatable: rec.out.item !== undefined });
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
      const site = campSite(st);
      const done = site?.build[sid] ?? 0;
      const total = buildMinutes(state, world, sid, at);
      const o = opt({ group: "build", label: def.name, detail: def.needs.length ? `${needsList(def.needs)}; ${def.desc}` : def.desc, duration: Math.max(1, total - done) });
      if (sid === "snare") {
        const o2 = ground(heathCell(world, at), "heath", "heath", o);
        if (!o2.ok) return o2;
        if (st.snares >= MAX_SNARES) return { ...o2, ok: false, why: `${MAX_SNARES} snares is enough here` };
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
        if (done > 0) return { ...o2, detail: `${Math.round((done / total) * 100)}% dug` };
        // The sticks are pocketed at camp when the order sets out (provisionKit), so the camp pile counts from camp, as a snare's kit does.
        const sticks = totalQty(invs, "stick") + (campCell !== null && here === campCell && at !== campCell ? qty(pile(state, campCell), "stick") : 0);
        if (sticks < def.needs[0].qty) return { ...o2, ok: false, why: "needs 4 sticks" };
        return o2;
      }
      const o3 = needCamp(o);
      if (!o3.ok) return o3;
      if (sid === "snowShelter") {
        if (site?.structures.turfHut || site?.structures.cabin) return { ...o, ok: false, why: "the hut is warmer" };
        if (site?.structures.snowShelter) return { ...o, ok: false, why: "already built here" };
        if (localWeather(state, world, at).snowCm < SNOW_SHELTER_CM) return { ...o, ok: false, why: `needs ${SNOW_SHELTER_CM} cm of snow` };
        if (done > 0) return { ...o, detail: `${Math.round((done / total) * 100)}% heaped` };
        return o;
      }
      if (sid === "dryingRack") {
        if ((site?.racks ?? 0) >= MAX_RACKS) return { ...o, ok: false, why: "two racks stand here already" };
      } else if (site?.structures[sid]) return { ...o, ok: false, why: "already built here" };
      if ((sid === "cabin" || sid === "turfHut") && !site?.structures.firePit) return { ...o, ok: false, why: "clear the fire site first" };
      if (done > 0) return { ...o, detail: `${Math.round((done / total) * 100)}% ${def.needs.length ? "built; materials already laid out" : "done"}` };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: shortList(invs, def.needs) };
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
      const site = campSite(st);
      if (!site?.structures[sid]) return { ...o, ok: false, why: `no ${name} here` };
      if (!needsMending(site, sid)) return { ...o, ok: false, why: "stands well enough" };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: shortList(invs, def.needs) };
      return o;
    }
    case "light": {
      const rekindle = camp && hasEmbers(st.fire);
      const weather = localWeather(state, world, at);
      const lr = lightingInRain(weather, ambientTemperature(cal, weather), roofed(siteAt(st, at)), hasQuirk(state, "steadyByTheFire"));
      const o = opt({
        group: "camp", label: camp ? "Light the fire at the site" : "Light a field fire",
        detail: rekindle ? "1 kg firewood" : `fire drill and 1 kg firewood${lr.failChance > 0 ? "; one in three fails in the rain" : ""}`,
        duration: rekindle ? EMBER_RELIGHT_MINUTES : lr.minutes,
      });
      if (terrain === "water") return { ...o, ok: false, why: "needs dry ground" };
      if (camp && !campSite(st)?.structures.firePit) return { ...o, ok: false, why: "needs a fire site" };
      if (fireAt(state, world, at)) return { ...o, ok: false, why: "already burning" };
      if (!rekindle && !toolNear(p, "fireDrill", toolInvs)) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      if (!rekindle && lr.blocked) return { ...o, ok: false, why: lr.blocked };
      return o;
    }
    case "lightTorch": {
      const relight = p.torch.minutes > 0;
      const o = opt({ group: "camp", label: relight ? "Relight torch" : "Light a torch", detail: relight ? `${fmtDuration(p.torch.minutes)} fuel left` : "burns 1 h; no night penalty on foot, and wolves keep off", duration: 1 });
      if (p.torch.lit) return { ...o, ok: false, why: "a torch is already burning" };
      if (!relight && totalQty(invs, "torch") < 1) return { ...o, ok: false, why: "needs a torch" };
      if (fireAt(state, world, at)) return { ...o, detail: `${o.detail}; lit from the fire` };
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
      const ice = walkIceMode(state, world, target.thin);
      const route = survivorRoute(state, world, from, target.cell, ice)
        ?? frontierRoute(state, world, from, target.cell, ice);
      if (!route) return { ...o, ok: false, why: "{you} {know} no way there" };
      const v = baseWalkSpeed(state, cal, localWeather(state, world, at));
      const minutes = survivorRouteMinutes(state, world, route, v, ice);
      let detail = `${routeKm(route).toFixed(1)} km on foot`;
      if (ice === "thin") {
        const risk = route.reduce((max, cell) => cellAt(world, cell).terrain === "water"
          ? Math.max(max, fallChance(localWeather(state, world, cell).iceCm)) : max, 0);
        detail += `; thin ice, up to ${Math.round(risk * 100)}% per crossing cell`;
      }
      const o2 = { ...o, duration: minutes, detail };
      if (weight(p.pack) > body(state).packHardKg) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "explore": {
      const target = walkTarget(state, world, arg ?? "");
      const o = opt({ group: "move", label: `Survey ${target?.label ?? "?"}`, detail: "", repeatable: false });
      if (!target) return { ...o, ok: false, why: "no such place" };
      const region = cellAt(world, target.cell).region;
      if (discovery(state, region) === 0) return { ...o, ok: false, why: "{you} {know} nothing of that country" };
      const water = localWeather(state, world, at).iceCm < ICE_SHORE_CM ? nextSurveyWater(state, world, region, []) : null;
      if (knownShare(state, world, region) >= 1 && !water) return { ...o, ok: false, why: "{you} {know} that country" };
      if (!pickVantage(state, world, cal, region, [here]) && !water) return { ...o, ok: false, why: "no reachable frontier" };
      // No duration is promised: how long it takes is how long the ground takes.
      return { ...o, duration: 0, detail: "maps the region and reads its waters" };
    }
    case "searchHome": {
      // The player's button never carries an arg and reads camp, same as ever;
      // a target given in the same "region:N" shape walk and explore already
      // take is what lets the reference player point this same search at some
      // other named ground, an heir's old camp among it.
      // "Home" is the ground named in the arg when there is one - an heir searches for
      // the camp of the life before, in another region - and this region's camp otherwise.
      const home = (arg ? walkTarget(state, world, arg)?.cell : undefined) ?? campCell;
      const o = opt({ group: "move", label: "Search for a way home", detail: "", repeatable: false });
      if (home === null) return { ...o, ok: false, why: NO_CAMP };
      const route = survivorRoute(state, world, here, home, walkableIce(localWeather(state, world, at)));
      if (route) return { ...o, ok: false, why: "{you} {know} the way home" };
      // Nobody can say how far the unmapped ground between here and camp actually runs, so no duration is offered.
      return { ...o, duration: 0, detail: "no telling how long; it ends the moment the way opens" };
    }
    case "readSky":
      return opt({ group: "move", label: "Read the sky", detail: "ten minutes watching the weather; the reading lasts until dawn", duration: 10, repeatable: true });
    case "findShelter": {
      const level = skillLevel(state, "naturalShelter");
      const duration = Math.max(10, 31 - level);
      const cover = findCover(world, at, level);
      const o = opt({ group: "move", label: "Find shelter", detail: `look over this ground for natural cover; ${PROTECTION_WORDS[cover]} at Natural shelter ${level}`, duration });
      return passable(terrain) ? o : { ...o, ok: false, why: "not on water" };
    }
    case "improveCover": {
      const cover = siteAt(st, at)?.cover ?? 0;
      const duration = improveCoverMinutes(cover) ?? 0;
      const maximum = Math.min(3, coverCeiling(world, at) + 1) as 1 | 2 | 3;
      const next = Math.min(maximum, cover + 1) as 1 | 2 | 3;
      const o = opt({ group: "build", label: "Improve shelter", detail: `${PROTECTION_WORDS[cover]} to ${PROTECTION_WORDS[next]}`, duration });
      if (cover === 0) return { ...o, ok: false, why: "no cover found here" };
      if (cover >= maximum) return { ...o, ok: false, why: "cover cannot be improved further" };
      return o;
    }
    case "emergencyShelter": {
      const minutes = siteAt(st, at)?.emergencyMinutes ?? 0;
      const level = builtProtection(minutes);
      const next = Math.min(3, level + 1) as 1 | 2 | 3;
      const o = opt({
        group: "build", label: `Emergency shelter - ${PROTECTION_WORDS[next]}`,
        detail: `${Math.max(0, EMERGENCY_MINUTES[next] - minutes)} effective minutes to ${PROTECTION_WORDS[next]}; boughs and deadfall last fourteen days without work`,
        duration: Math.max(0, EMERGENCY_MINUTES[3] - minutes),
      });
      if (!passable(terrain)) return { ...o, ok: false, why: "not on water" };
      if (level === 3) return { ...o, ok: false, why: "emergency shelter is already liveable" };
      return o;
    }
    case "haul": {
      const from = at;
      // Haul does not read `repeat` (beginTask refuses "haul" outright; the intent's own until governs it), so a loop button beside it would be a promise the button cannot keep.
      const o = haveCamp(opt({ group: "move", label: "Haul to camp", detail: "", repeatable: false }));
      if (!o.ok || campCell === null) return o;
      if (from === campCell) return { ...o, ok: false, why: "{you} {are} at camp" };
      const kg = weight(pile(state, at));
      if (kg <= TRACE_KG) return { ...o, ok: false, why: "nothing on the ground here" };
      const ice = walkIceMode(state, world, false);
      const route = survivorRoute(state, world, from, campCell, ice);
      if (!route) return { ...o, ok: false, why: "{you} {know} no way there" };
      const loaded = survivorRouteMinutes(state, world, route, baseWalkSpeed(state, cal, localWeather(state, world, at), body(state).packHardKg + 5), ice);
      const empty = survivorRouteMinutes(state, world, route, baseWalkSpeed(state, cal, localWeather(state, world, at), 5), ice);
      return { ...o, duration: loaded + empty, detail: `${Math.min(body(state).packHardKg, kg).toFixed(0)} kg per trip; ${kg.toFixed(0)} kg lying here; stop anywhere and carry on later` };
    }
    case "makeCamp": {
      const o = opt({ group: "camp", label: "Make camp here", detail: "", duration: 20 });
      if (campCell !== null && at === campCell) return { ...o, ok: false, why: "this is the camp" };
      if (!passable(terrain)) return { ...o, ok: false, why: "not here" };
      return { ...o, detail: cellPossibilities(world, at).join(", ") };
    }
    case "night":
      return haveCamp(opt({ group: "camp", label: "Camp for the night", detail: `go to camp, make a fire if you can, sleep; ${bedText(state, world)}`, duration: 0 }));
    case "rest":
      return opt({ group: "camp", label: "Rest", detail: "an hour off your feet", duration: 60, repeatable: true });
    case "sleep": {
      // However long the model says this body will lie there: the minutes
      // from now to the wake line, with no dawn under it and no cap over it.
      const minutes = sleepMinutes(state, cal, world, at);
      return opt({ group: "camp", label: "Sleep", detail: `until rested, about ${Math.round(minutes / 60)} h; ${bedText(state, world)}`, duration: minutes });
    }
    case "melt": {
      const o = opt({ group: "camp", label: "Melt snow", detail: "1 kg of the fire's wood for a litre", duration: 15, repeatable: true });
      if (!camp && !toolNear(p, "barkBucket", toolInvs)) return { ...o, ok: false, why: "needs a bark bucket" };
      const fire = fireAt(state, world, at);
      if (!fire) return { ...o, ok: false, why: "needs a lit fire" };
      if (fire.fuelKg < 1) return { ...o, ok: false, why: "the fire is too low" };
      if (localWeather(state, world, at).snowCm < 1) return { ...o, ok: false, why: "no snow to melt" };
      return o;
    }
    case "thaw": {
      const o = opt({ group: "camp", label: "Thaw the water", detail: "a frozen vessel by the fire", duration: 10 });
      if (!camp && !p.tools.some(t => TOOLS[t.id].litres)) return { ...o, ok: false, why: "needs a vessel" };
      if (!fireAt(state, world, at)) return { ...o, ok: false, why: "needs a lit fire" };
      if (!p.tools.some((t) => t.frozen) && (!camp || qty(pileAt(state, campCell), "ice") <= 1e-9)) return { ...o, ok: false, why: "nothing is frozen" };
      return o;
    }
    case "lightIndoors": {
      const site = campSite(st);
      const rekindle = hasEmbers(st.fire);
      const o = needCamp(opt({
        group: "camp", label: "Light a fire indoors",
        detail: site?.structures.cabin && site.structures.hearth ? "at the hearth" : site?.structures.turfHut && !site.structures.cabin ? "under the smoke hole" : "no smoke hole: the cabin will fill with smoke",
        duration: rekindle ? EMBER_RELIGHT_MINUTES : 10,
      }));
      if (!o.ok) return o;
      if (site?.structures.snowShelter && !site.structures.turfHut && !site.structures.cabin) return { ...o, ok: false, why: "snow does not take a fire" };
      if (!site?.structures.cabin && !site?.structures.turfHut) return { ...o, ok: false, why: "needs a cabin or a turf hut" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!rekindle && !toolNear(p, "fireDrill", toolInvs)) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      return o;
    }
    case "setTrap": {
      const o = ground(watersideCell(world, at), "shore", "water", opt({ group: "hunt", label: "Set the trap", detail: "stakes and the basket in the shallows; catches while you are elsewhere", duration: 20 }));
      if (!o.ok) return o;
      if (st.trap) return { ...o, ok: false, why: `the trap is set at ${whereIs(state, world, st.trap.cell)} already` };
      if (localWeather(state, world, at).iceCm >= ICE_SHORE_CM) return { ...o, ok: false, why: "the water is under ice" };
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
  const site = campSite(st);
  const bed = camp && site?.structures.boughBed;
  const roof = camp && roofed(site);
  const blanket = state.player.clothing.some((g) => CLOTHING[g.id].slot === "blanket");
  const on = bed ? "on a bough bed" : "on bare ground";
  const under = blanket && roof ? "under {your} blanket and the roof" : blanket ? "under {your} blanket" : roof ? "under the roof" : "in the open";
  const fire = camp && st.fire.lit ? ", by the fire" : "";
  return `${on}, ${under}${fire}`;
}

/** A read shore's odds over an unread one: knowing where the fish lie is worth half again. */
export const READ_ODDS = 1.5;

export function findDenOdds(state: GameState): number {
  return Math.min(0.75, 0.15 * 1.2 ** Math.max(0, skillLevel(state, "hunting") - 5));
}

export function huntOdds(state: GameState, world: World, cal: Calendar, density: number, species: Species): number {
  const def = SPECIES_DEFS[species].hunt!;
  let odds = density * def.odds * oddsFactor(state, species);
  if (localWeather(state, world).snowCm > DEEP_SNOW_CM) odds *= 0.75;
  // What a hunter can see, by the light there is rather than by the clock:
  // the species' own night figure is what the pitch dark leaves them, and
  // dusk and a full moon fall where they fall between that and daylight.
  const lux = illuminance(state, world, cal, cellOf(state, world));
  odds *= lightFactor(lux, SPOT_LUX, def.night ?? 0.7);
  if (localWeather(state, world).precip !== "none") odds *= 0.85;
  const st = regionState(state, world, state.player.region);
  if (atCamp(state, world) && st.smoke > SMOKE_COUGH) odds *= 0.5;
  if (stormNow(localWeather(state, world), state.minute)) odds *= 0.5;
  if (SPECIES_DEFS[species].kind === "fish" && isRead(state, cellOf(state, world))) odds *= READ_ODDS;
  if (state.player.energy < 20) odds *= 0.5;
  else if (state.player.energy < 30) odds *= 0.75;
  // Sharp eyes are worth what there is to see by; the pitch dark is the same
  // dark for everyone, and a bright day is where the whole of the quirk lands.
  odds *= 1 + (body(state).dayOdds - 1) * lightFactor(lux, SPOT_LUX, 0);
  odds *= huntPressureFactor(state, world, cellOf(state, world));
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
  for (const id of ["chop", "deadwood", "sticks", "bark", "stone", "berries", "eggs", "innerBark", "roots", "tapSap", "seaweed"] as TaskId[]) out.push(check(state, world, cal, id));
  out.push(check(state, world, cal, "hunt", "any"));
  for (const s of knownHuntSpecies(state, world)) out.push(check(state, world, cal, "hunt", s));
  out.push(check(state, world, cal, "findDen"));
  out.push(check(state, world, cal, "fish", "any"));
  for (const s of fishSpecies()) if (r.capacity[s]) out.push(check(state, world, cal, "fish", s));
  out.push(check(state, world, cal, "read"));
  out.push(check(state, world, cal, "setTrap"));
  out.push(check(state, world, cal, "emptyTrap"));
  out.push(check(state, world, cal, "cook", "rawMeat"));
  out.push(check(state, world, cal, "cook", "fish"));
  out.push(check(state, world, cal, "cook", "oilyFish"));
  out.push(check(state, world, cal, "cook", "rawFat"));
  out.push(check(state, world, cal, "cook", "roots"));
  out.push(check(state, world, cal, "crack"));
  out.push(check(state, world, cal, "grindBark"));
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
  out.push(check(state, world, cal, "explore", `region:${r.id}`));
  for (const nb of r.neighbours) out.push(check(state, world, cal, "explore", `region:${nb.id}`));
  out.push(check(state, world, cal, "searchHome"));
  out.push(check(state, world, cal, "findShelter"));
  out.push(check(state, world, cal, "readSky"));
  out.push(check(state, world, cal, "improveCover"));
  out.push(check(state, world, cal, "emergencyShelter"));
  return out.map((o) => withProgression(state, world, o));
}

/** Adds what practice says about an option: its mastery, and the level it is meant for. */
export function withProgression(state: GameState, world: World, o: TaskOption): TaskOption {
  const skill = skillOf(o.id, o.arg);
  const key = skill ? masteryKey(state, world, o.id, o.arg, o.cell) : null;
  if (!skill || !key) return o;
  const out: TaskOption = { ...o, mastery: { ...masteryProgress(state, skill, key), skill, key } };
  const rec = RECOMMENDED[key];
  if (!rec) return out;
  const g = gap(state, key);
  // Under the level the row names where you stand as well as what it wants: a
  // bare "Hunting 6" never said whether that was a wall or a suggestion.
  // Templated like the ladder's own gate line, and rendered through plain() by
  // the panel: away, an option's text is read out about somebody by name.
  out.recommended = {
    text: g > 0 ? `${SKILL_NAMES[rec.skill]} ${rec.level}, {you} {are} ${skillLevel(state, rec.skill)}` : `${SKILL_NAMES[rec.skill]} ${rec.level}`,
    under: g > 0,
    short: g,
  };
  const parts: string[] = [];
  if (g > 0 && o.id === "craft") parts.push(`${Math.round(craftSuccess(state, o.arg as RecipeId) * 100)}% chance it comes out`);
  if (g > 0 && o.id === "build") parts.push(`at ${SKILL_NAMES.building} ${skillLevel(state, "building")} this takes ${(1.3 ** g).toFixed(1)}x as long`);
  // The gap halves the odds per level and turns big game on you, and nothing on
  // a hunt or a cast said so: a craft row has named its cost all along.
  if (g > 0 && (o.id === "hunt" || o.id === "fish") && o.arg && o.arg !== "any") {
    parts.push(`${shareWord(0.5 ** g)} the odds`);
    const hurt = o.id === "hunt" ? Math.round(injuryChance(state, o.arg as Species) * 100) : 0;
    if (hurt > 0) parts.push(`${hurt}% chance it turns on {you}`);
  }
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
  const requestedArg = arg;
  const pausedKey = pauseKey(state, world, id, requestedArg);
  const paused = pausedKey ? state.paused[pausedKey] : undefined;
  const o = check(state, world, cal, id, requestedArg);
  if (!o.ok) return false;
  if (paused?.any) arg = paused.arg;
  const need = paused?.huntPhase === "field" ? undefined : toolFor(id, arg);
  // A fetch takes up the one vessel with the most room, whatever is already in hand.
  if (id === "fill") takeUpTripVessel(state, world);
  else if (need === "axe") {
    if (!axeInHand(state.player)) for (const id of AXES) if (takeUp(state, world, id)) break;
  } else if (need && !hasTool(state.player, need)) takeUp(state, world, need);
  setAside(state, world);
  let any = false;
  if (!paused && (id === "hunt" || id === "fish") && arg === "any") {
    // No stream of the caller's own: take one off the saved seed and write it back, so a save round-trips the draw.
    const r = rng ?? new Rng(state.rng);
    const drawn = drawSpecies(state, world, cal, r, id, cellOf(state, world));
    if (!rng) state.rng = r.s;
    if (!drawn) return false;
    arg = drawn;
    any = true;
    if (id === "fish") log(state, `A swirl under the bank: ${SPECIES_DEFS[drawn].name}.`);
  }
  if (id === "build" && !(campSite(regionState(state, world, state.player.region))?.build[arg as StructureId] ?? 0)) {
    // Materials are committed when the work starts, and stay laid out if you stop.
    consume(reach(state, world), STRUCTURES[arg as StructureId].needs);
    // The first minute of real progress is what raises the site, the same as a completed build does.
    if (arg !== "snare") {
      const homeSt = regionState(state, world, state.player.region);
      // The build's own legality has already found the camp: nothing raises a site without one.
      siteFor(homeSt, homeSt.campCell!).build[arg as StructureId] = 0.001;
    }
  }
  if (id === "walk" || id === "travel") {
    const target = walkTarget(state, world, arg ?? "")!;
    const ice = walkIceMode(state, world, target.thin);
    const from = cellOf(state, world);
    const path = survivorRoute(state, world, from, target.cell, ice)
      ?? frontierRoute(state, world, from, target.cell, ice) ?? [];
    state.route = { target: target.cell, path, walked: [from], label: target.label, ice, lastLand: from };
    state.task = { id, arg, progress: 0, duration: o.duration, repeat: false };
    return true;
  }
  if (id === "explore") {
    const target = walkTarget(state, world, arg ?? "")!;
    const region = cellAt(world, target.cell).region;
    const from = cellOf(state, world);
    const vantage = pickVantage(state, world, cal, region, [from]);
    const ice = walkIceMode(state, world, false);
    state.task = { id, arg, progress: 0, duration: 0, repeat: false, visited: [from], originRegion: state.player.region, surveyPhase: "walk", surveyedWater: [] };
    if (vantage) {
      state.route = { target: vantage.cell, path: vantage.path, walked: [from], label: target.label, ice, lastLand: from };
      state.task.visited!.push(vantage.cell);
      if (!refreshRouteDuration(state, world, cal)) return false;
    } else if (!planSurvey(state, world, cal, state.task, region, target.label)) {
      state.task = null;
      return false;
    }
    return true;
  }
  if (id === "searchHome") {
    const home = (arg ? walkTarget(state, world, arg)?.cell : undefined) ?? campCellOf(state, world);
    const from = cellOf(state, world);
    if (home === null) return false;
    const leg = nextHomeLeg(state, world, cal, from, home);
    if (!leg) return false;
    const ice = walkIceMode(state, world, false);
    state.route = { target: leg.vantage.cell, path: leg.vantage.path, walked: [from], label: "the way home", ice, lastLand: from };
    state.task = {
      id, arg: `region:${leg.region}`, progress: 0,
      duration: 0,
      repeat: false, visited: [from, leg.vantage.cell], home,
    };
    return refreshRouteDuration(state, world, cal);
  }
  // Pick up where this task was left, if it was.
  const key = pausedKey ?? pauseKey(state, world, id, arg);
  const fresh = checkFresh(state, world, cal, id, arg, cellOf(state, world), any);
  const fraction = paused?.fraction ?? 0;
  if (key) delete state.paused[key];
  // A species hunt is an encounter, not a lock on an arbitrary animal elsewhere
  // in the region. Only a known den names a concrete subject before pursuit.
  const wildlifeSubject = id === "hunt" && arg === "bear" ? knownBearDen(state, cal)?.id : undefined;
  const duration = paused?.duration ?? fresh.duration;
  state.task = {
    id, arg, progress: duration * fraction, duration, repeat: repeat && o.repeatable,
    ...(any || paused?.any ? { any: true } : {}), ...(wildlifeSubject !== undefined ? { wildlifeSubject } : {}),
    ...(paused?.huntPhase ? { huntPhase: paused.huntPhase } : {}),
    ...(paused?.carcassId !== undefined ? { carcassId: paused.carcassId } : {}),
  };
  if (id === "findShelter") state.task.shelterLevel = skillLevel(state, "naturalShelter");
  if (id === "emergencyShelter") {
    const minutes = siteAt(regionState(state, world, state.player.region), cellOf(state, world))?.emergencyMinutes ?? 0;
    const cost = hasQuirk(state, "bigEater") ? BIG_EATER_PACE : 1;
    state.task.duration = EMERGENCY_MINUTES[3] * cost;
    state.task.progress = minutes * cost;
  }
  return true;
}

/** Fills the pack to the hard limit from the pile here, heaviest things first. */
export function loadPack(state: GameState, world: World): Partial<Record<ItemId, number>> {
  const from = herePile(state, world);
  const pack = state.player.pack;
  const moved: Partial<Record<ItemId, number>> = {};
  let room = body(state).packHardKg - weight(pack);
  const items = listItems(from).sort((a, b) => ITEM_KG[b.item] - ITEM_KG[a.item]);
  for (const { item, qty: have } of items) {
    if (room <= 1e-9) break;
    const unit = ITEM_KG[item];
    const n = unit >= 1 ? Math.min(have, Math.floor(room / unit + 1e-9)) : Math.min(have, room / unit);
    if (n <= 0) continue;
    moved[item] = transfer(from, pack, item, n);
    room -= n * unit;
  }
  return moved;
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
    const homeSt = regionState(state, world, state.player.region);
    // A build under way was started at a camp; setting it aside cannot have unmade one.
    const site = siteFor(homeSt, homeSt.campCell!);
    const sid = t.arg as StructureId;
    site.build[sid] = (site.build[sid] ?? 0) + t.progress;
  } else if (t.id === "walk" || t.id === "travel" || t.id === "explore" || t.id === "searchHome") {
    state.route = null;
  } else {
    const key = pauseKey(state, world, t.id, t.any ? "any" : t.arg);
    const fraction = t.duration > 0 ? Math.min(0.999, t.progress / t.duration) : 0;
    const fieldCarcass = t.id === "hunt" && t.huntPhase === "field" && t.carcassId !== undefined;
    if (key && (fraction > 0.005 || fieldCarcass)) {
      state.paused[key] = {
        id: t.id, arg: t.arg, ...(t.any ? { any: true } : {}), fraction, cell: LOCATED.has(t.id) ? cellOf(state, world) : -1,
        ...(t.id === "hunt" ? { duration: t.duration, huntPhase: t.huntPhase, carcassId: t.carcassId } : {}),
      };
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
function liveOrderFor(state: GameState, world: World, id: TaskId, arg?: string): WorkOrder | null {
  const it = state.intent;
  if (!isWorkIntent(it) || it.orderId === null) return null;
  const isWork = (it.task === id && (it.arg ?? "") === (arg ?? "")) || (it.task === "night" && id === "sleep");
  if (!isWork) return null;
  return owningOrder(state, world, it);
}

/** Advances the current task by dt minutes and applies its effect when it completes. */
export function stepTask(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task;
  if (!t || state.dead) return;
  if (t.id === "hunt" && t.huntPhase === "field" && (t.carcassId === undefined
    || !state.carcasses.some((carcass) => carcass.id === t.carcassId && carcass.cell === cellOf(state, world)))) {
    state.task = null;
    log(state, "The carcass is gone.", "bad");
    return;
  }
  if (t.id === "walk" || t.id === "travel") {
    stepWalk(state, world, cal, rng, dt);
    return;
  }
  if (t.id === "explore") {
    stepExplore(state, world, cal, rng, dt);
    return;
  }
  if (t.id === "searchHome") {
    stepSearchHome(state, world, cal, rng, dt);
    return;
  }
  // Automatic sleep is one body-owned activity. Its displayed end follows
  // the live wake crossing as weather changes, but the task itself is never
  // completed and restarted in estimate-sized buckets. serveBodyRow ends it
  // when the sleep model clears the sleeping latch.
  if (t.id === "sleep" && state.intent?.mode === "care" && state.intent.care === "body") {
    t.progress += dt;
    const remaining = minutesUntilWake(state.player.sleepDebt, cal.hour, debtFallHalved(state, world));
    t.duration = t.progress + Math.max(1, remaining);
    return;
  }
  if ((t.id === "cook" || t.id === "crack" || t.id === "grindBark") && !fireAt(state, world)) {
    state.task = null;
    if (isWorkIntent(state.intent) && state.intent.task === t.id) state.intent = null;
    log(state, `${check(state, world, cal, t.id, t.arg).label}: needs a lit fire. {You} {stop}.`);
    return;
  }
  // The site is authoritative: it can expire before this very step, and
  // neither a task bar nor paused work may bring those old minutes back.
  if (t.id === "emergencyShelter") {
    const o = check(state, world, cal, t.id, t.arg);
    if (!o.ok) {
      state.task = null;
      if (isWorkIntent(state.intent) && state.intent.task === t.id) state.intent = null;
      log(state, `${o.label}: ${o.why}. {You} {stop}.`);
      return;
    }
    const minutes = siteAt(regionState(state, world, state.player.region), cellOf(state, world))?.emergencyMinutes ?? 0;
    t.progress = minutes * (t.duration / EMERGENCY_MINUTES[3]);
  }
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state, world) : 1;
  if (t.id === "hunt" && t.huntPhase !== "field") noteHuntPursuit(state, dt);
  // Older saves may hold a search started before levels were recorded.
  if (t.id === "findShelter") t.shelterLevel ??= skillLevel(state, "naturalShelter");
  train(state, world, dt);
  // An "any" task is the intent's and the order's work under whatever species it drew.
  const wanted = t.any ? "any" : t.arg;
  // A concrete order or intent (arg "hare") can adopt a task drawn as "any" (steps.ts
  // isRunning treats them as the same work), so try the drawn species too before giving up.
  const order = liveOrderFor(state, world, t.id, wanted) ?? liveOrderFor(state, world, t.id, t.arg);
  if (order) order.minutes += dt;
  t.progress += dt * pace;
  if (t.id === "emergencyShelter" && dt * pace > 0) {
    const cell = cellOf(state, world);
    const site = siteFor(regionState(state, world, state.player.region), cell);
    const before = protectionOf(site);
    site.emergencyMinutes = Math.min(EMERGENCY_MINUTES[3], t.progress / (t.duration / EMERGENCY_MINUTES[3]));
    site.emergencyAge = 0;
    const after = protectionOf(site);
    if (after !== before) recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute, region: state.player.region, cell,
      from: before, to: after, source: "emergency",
    }, world);
  }
  if (t.progress < t.duration) return;
  // Existing cover ages before this task step. If it expires in the finishing
  // interval, the improvement has nothing left to work and is not a completion.
  if (t.id === "improveCover") {
    const o = check(state, world, cal, t.id, t.arg);
    if (!o.ok) {
      state.task = null;
      if (isWorkIntent(state.intent) && state.intent.task === t.id) state.intent = null;
      log(state, `${o.label}: ${o.why}. {You} {stop}.`);
      return;
    }
  }
  // The dark refuses nothing; it wastes the attempt. Work that needs light
  // to be sure of itself rolls when it would finish, and a failure puts the
  // attempt back to the start rather than ending the work: the yield when it
  // does come off is the daylight yield, and the whole cost is the hours.
  // The minutes are already in the skill, because groping about in the dark
  // is still practice.
  // Full odds draw nothing: work in the light, and work the dark does not
  // touch, must leave the seeded stream exactly where it found it.
  const odds = t.id === "hunt" && t.huntPhase === "field" ? 1 : attemptOdds(state, world, cal, t.id);
  if (odds < 1 && !rng.chance(odds)) {
    t.progress = 0;
    if (!t.darkSaid) {
      t.darkSaid = true;
      log(state, `${check(state, world, cal, t.id, t.arg).label}: too dark to be sure of anything. {You} {go} by feel.`);
    }
    return;
  }

  if (t.id === "hunt" && t.huntPhase !== "field") {
    if (resolveHuntPursuit(state, world, cal, rng, t)) return;
  }

  const id = t.id;
  const arg = t.arg;
  const repeat = t.repeat;
  state.task = null;
  const it = state.intent;
  if (isWorkIntent(it)) {
    if (it.task === id && ((it.arg ?? "") === (wanted ?? "") || (it.arg ?? "") === (arg ?? ""))) {
      it.done++;
      if (order) order.done++;
    } else if (it.task === "night" && id === "sleep") {
      it.done++;
      if (order) order.done++;
    }
    // The sleep this need asked for is done; whether the body lies down again
    // is the model's to say next minute, off the player's own night. A sleep
    // clicked by hand carries no need of its own to close out, whatever the
    // sticky reading happens to be.
    if (it.mode === "runner" && id === "sleep" && state.player.bodyNeed === "sleep") state.player.bodyNeed = null;
    // A rest that barely warmed anyone is not worth repeating: give the need up until warmth
    // recovers some other way, rather than resting here forever for less than a point of gain.
    // Only the runner's own rest carries a warmth-at-start to judge the gain against.
    if (it.mode === "runner" && id === "rest" && state.player.bodyNeed === "cold") {
      const gained = state.player.warmth - (it.restFromWarmth ?? state.player.warmth);
      if (gained < 1) {
        state.player.coldSpent = true;
        state.player.bodyNeed = null;
      }
    }
  } else if (it?.mode === "care" && it.care === "body") {
    if (id === "sleep" && state.player.bodyNeed === "sleep") state.player.bodyNeed = null;
    if (id === "rest" && state.player.bodyNeed === "cold") {
      const gained = state.player.warmth - (it.restFromWarmth ?? state.player.warmth);
      if (gained < 1) {
        state.player.coldSpent = true;
        state.player.bodyNeed = null;
      }
    }
  }
  if (id === "hunt" && t.huntPhase === "field") {
    const recovered = t.carcassId === undefined ? null : processCarcass(state, world, t.carcassId);
    if (recovered) {
      const kcal = recovered.meatKg * FOODS.rawMeat.kcalPerKg + (recovered.fatKg ?? 0) * FOODS.fat.kcalPerKg;
      noteFieldRecovery(state, recovered.meatKg, recovered.fatKg ?? 0);
      creditYield(state, "hunt", kcal);
      recordOpportunityEvent(state, { kind: "foodAcquired", method: "hunt" });
      if (LARGE_GAME.includes(arg as Species) || arg === "bear") state.stats.killsKcal += kcal;
      const camp = campCellOf(state, world);
      if (camp !== null && camp === cellOf(state, world)) {
        noteHauledHuntFood(state, recovered.meatKg, recovered.fatKg ?? 0);
        recordOpportunityEvent(state, { kind: "recoveredAtCamp" });
      }
      else if (isWorkIntent(it) && it.task === "hunt" && it.deliver === "camp") {
        if (recovered.meatDestination === "pack") it.recoveredMeatPackedKg = recovered.meatKg;
        else it.recoveredMeatAtSourceKg = recovered.meatKg;
        if (recovered.meatDestination === "pack") it.recoveredFatPackedKg = recovered.fatKg ?? 0;
        else it.recoveredFatAtSourceKg = recovered.fatKg ?? 0;
      }
      log(state, `${Math.round(recovered.meatKg * 10) / 10} kg of meat dressed from the carcass.`, "good");
    }
    recordOpportunityEvent(state, {
      kind: "taskCompleted", minute: state.minute, id, arg, region: state.player.region,
      cell: cellOf(state, world), atCamp: atCamp(state, world),
    }, world);
  } else complete(state, world, cal, rng, id, arg, t.shelterLevel);
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
  // The ice crossing and the intent driving it are over whichever outcome
  // follows. Drowning otherwise returns through die() with the route still
  // alive after its task is gone.
  state.route = null;
  state.task = null;
  state.intent = null;
  if (rng.chance(0.6)) {
    die(state, "drowned", regionAt(world, state.player.region).name);
    return;
  }
  placeAt(state, world, land);
  p.wetness = 100;
  for (const g of p.clothing) g.wet = 100;
  p.warmth = Math.max(0, p.warmth - 30);
  p.energy = Math.max(0, p.energy - 20);
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
 * Walks the current route by dt minutes: the per-cell stepping, the ice
 * roll, the region it puts the survivor in, the sight it opens from every
 * cell entered. Shared by a plain walk and an exploring one, so the two
 * can never drift apart on how a step is spent. Returns true once the
 * route's path is empty - the leg has arrived, not necessarily the task.
 * A fall through the ice ends the walk on the spot (fallThrough clears
 * state.route and state.task itself); the caller reads that by checking
 * state.route again rather than trusting this return.
 */
function walkAlong(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): boolean {
  const route = state.route!;
  const p = state.player;
  const conditions = routeConditions(state, world, route.ice);
  const here = cellOf(state, world);
  if (!passable(hereTerrain(state, world), conditions.iceAt(here)) || conditions.blockedAt?.(here)) {
    state.route = null;
    state.task = null;
    log(state, "The way ahead is no longer passable.", "bad");
    return false;
  }
  let km = (walkSpeed(state, cal, localWeather(state, world), hereTerrain(state, world), undefined, conditions.iceAt(cellOf(state, world))) / 60) * dt;
  while (km > 1e-9 && route.path.length) {
    const cell = route.path[0];
    if (!passable(cellAt(world, cell).terrain, conditions.iceAt(cell)) || conditions.blockedAt?.(cell)) {
      state.route = null;
      state.task = null;
      log(state, "The way ahead is no longer passable.", "bad");
      return false;
    }
    const next = cellCenter(world, cell);
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const distKm = Math.hypot(dx, dy) * CELL_KM;
    if (km >= distKm) {
      p.x = next.x;
      p.y = next.y;
      setRegion(state, world, cellAt(world, cell).region);
      seeFrom(state, world, cal, cell);
      route.walked.push(route.path.shift()!);
      km -= distKm;
      state.stats.km += distKm;
      const terrain = cellAt(world, cell).terrain;
      if (terrain === "water") {
        if (localWeather(state, world).iceCm < ICE_SAFE_CM) cue("iceCracks");
        if (localWeather(state, world).iceCm < ICE_SAFE_CM && rng.chance(fallChance(localWeather(state, world).iceCm))) {
          fallThrough(state, world, rng, route.lastLand);
          return true;
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
  return route.path.length === 0;
}

/** Ends blocked legs without ever storing an unreachable estimate in a save. */
function refreshRouteDuration(state: GameState, world: World, cal: Calendar): boolean {
  const t = state.task!;
  const route = state.route!;
  const duration = t.progress + survivorRouteMinutes(state, world, route.path, baseWalkSpeed(state, cal, localWeather(state, world)), route.ice);
  if (!Number.isFinite(duration)) {
    state.route = null;
    state.task = null;
    log(state, "The way ahead is no longer passable.", "bad");
    return false;
  }
  t.duration = duration;
  return true;
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
  const order = t.id === "walk" ? liveOrderFor(state, world, "walk", t.arg) : null;
  if (order) order.minutes += dt;
  if (!state.route) {
    state.task = null;
    return;
  }
  const finished = walkAlong(state, world, cal, rng, dt);
  if (!state.route || !state.task) return; // fell through the ice: the walk is already over
  const route = state.route;
  t.progress += dt;
  if (!refreshRouteDuration(state, world, cal)) return;
  if (finished) {
    const label = route.label;
    const wasTravel = t.id === "travel";
    const it = state.intent;
    if (!wasTravel && isWorkIntent(it) && it.task === "walk") {
      it.done++;
      if (order) {
        order.done++;
        if (order.req.until.kind === "once") {
          const owner = regionState(state, world, it.orderRegion ?? state.player.region);
          owner.orders = owner.orders.filter((candidate) => candidate.id !== order.id);
        }
      }
      state.intent = null;
    }
    state.route = null;
    state.task = null;
    placeAt(state, world, cellOf(state, world));
    if (wasTravel) log(state, `{You} {reach} ${label}.`);
    if (spotHere(state, world) === "heath") collectSnares(state, world);
    collectTrap(state, world);
  }
}

/**
 * The region's cells still worth walking to: passable, reachable from
 * where the survivor stands (known ground, or unmapped ground of this
 * same region - exploreRoute may cross that, since walking into the dark
 * is what exploring is), standing next to ground not yet mapped, and not
 * a cell this sweep has already stood at (`visited`: pickVantage never
 * repeats one, so a candidate whose only unseen neighbour turns out to
 * open nothing gets dropped rather than picked forever). Nearest route
 * first, so how far down this list the wayfinding level bothers to weigh
 * (task 6's `1 + level`) is a plain slice of it.
 */
function exploreFrontier(state: GameState, world: World, region: number, visited: readonly number[]): { cell: number; path: number[] }[] {
  const from = cellOf(state, world);
  const ice = walkIceMode(state, world, false);
  const avoidFell = false;
  const out: { cell: number; path: number[] }[] = [];
  for (const cell of regionAt(world, region).cells) {
    if (cell === from || visited.includes(cell)) continue;
    if (!passable(cellAt(world, cell).terrain)) continue;
    if (!neighbours(world, cell).some((nb) => cellAt(world, nb).region === region && !isKnown(state, nb))) continue;
    const path = exploreRoute(state, world, from, cell, region, ice, avoidFell);
    if (path) out.push({ cell, path });
  }
  out.sort((a, b) => a.path.length - b.path.length);
  return out;
}

/**
 * The best of the candidates the survivor could walk to: not the vantage
 * with the best view alone, but the one worth the walk to reach - unknown
 * ground opened (sightRangeCells there, squared, stands in for that well
 * enough without ray-marching every one of them) per minute the route
 * there costs. A candidate already underfoot costs no minutes and is
 * free, so it always wins. Every reachable candidate is weighed, not a
 * narrower slice by level: wayfinding buys a wider eye instead (see
 * sightRangeCells), so a level-10 sweep opens more from the same stop
 * rather than gambling on a farther one for a marginally better ratio -
 * weighing fewer stops shorter by construction, not by the luck of which
 * ones a wider candidate pool happens to turn up. Null when the region
 * has nothing left reachable to see more from.
 */
function pickVantage(state: GameState, world: World, cal: Calendar, region: number, visited: readonly number[]): { cell: number; path: number[] } | null {
  const candidates = exploreFrontier(state, world, region, visited);
  const ice = walkIceMode(state, world, false);
  const speed = baseWalkSpeed(state, cal, localWeather(state, world));
  let best: { cell: number; path: number[] } | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    // What the vantage opens, not what standing there tells you: the ring every
    // cell gives is not a reason to walk anywhere.
    const opened = sightReachCells(state, world, cal, c.cell) ** 2;
    const minutes = survivorRouteMinutes(state, world, c.path, speed, ice);
    const score = minutes <= 0 ? Number.POSITIVE_INFINITY : opened / minutes;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * A twisted ankle or worse, off-trail on fell, rock or bog underfoot:
 * wilderness travel surveys put a lower-limb injury near one per thousand
 * hours of rough, trackless ground for someone who has not learned to read
 * it - call it 0.1% an hour. A practised eye picks the sound line through
 * the same ground and wears that risk down toward nothing by level 20;
 * water and ice already carry their own risk (fallChance) and are not
 * doubled up here.
 */
export function exploreInjuryChance(level: number): number {
  return 0.001 * Math.max(0, 20 - level) / 19;
}

/**
 * Rolled once per hour of the sweep, on whatever the survivor is standing
 * on the moment that hour turns - not per cell, since a vantage leg can
 * cross several kinds of ground in an hour and only the roughest three
 * matter here.
 */
function exploreInjury(state: GameState, world: World, rng: Rng, before: number, after: number): void {
  if (Math.floor(after / 60) <= Math.floor(before / 60)) return;
  const terrain = hereTerrain(state, world);
  if (terrain !== "fell" && terrain !== "rock" && terrain !== "bog") return;
  const chance = exploreInjuryChance(skillLevel(state, "wayfinding"));
  if (chance <= 0 || !rng.chance(chance)) return;
  state.player.injured = Math.max(state.player.injured, 24 * 60);
  log(state, "The ground gives underfoot. {You} {are} hurt.", "bad");
  record(state, { kind: "injury", cause: "wayfinding" });
}

interface SurveyWater {
  key: number;
  shores: number[];
}

const surveyWaterCache = new WeakMap<World, Map<number, SurveyWater[]>>();

/** Connected water systems touching a region, with land in that region from which each can be read. */
function surveyWaters(world: World, region: number): SurveyWater[] {
  let byRegion = surveyWaterCache.get(world);
  if (!byRegion) {
    byRegion = new Map();
    surveyWaterCache.set(world, byRegion);
  }
  const cached = byRegion.get(region);
  if (cached) return cached;
  const starts = regionAt(world, region).cells.filter((cell) => cellAt(world, cell).terrain === "water");
  const seen = new Set<number>();
  const systems: SurveyWater[] = [];
  for (const start of starts) {
    if (seen.has(start)) continue;
    const todo = [start];
    const shores = new Set<number>();
    let key = start;
    seen.add(start);
    while (todo.length) {
      const cell = todo.pop()!;
      key = Math.min(key, cell);
      for (const n of neighbours(world, cell)) {
        if (cellAt(world, n).terrain === "water") {
          if (!seen.has(n)) {
            seen.add(n);
            todo.push(n);
          }
        } else if (cellAt(world, n).region === region && passable(cellAt(world, n).terrain)) {
          shores.add(n);
        }
      }
    }
    if (shores.size) systems.push({ key, shores: [...shores] });
  }
  byRegion.set(region, systems);
  return systems;
}

function nextSurveyWater(state: GameState, world: World, region: number, handled: number[]): { key: number; shore: number; path: number[] } | null {
  const from = cellOf(state, world);
  const ice = walkIceMode(state, world, false);
  for (const system of surveyWaters(world, region)) {
    if (handled.includes(system.key)) continue;
    if (system.shores.some((shore) => isRead(state, shore))) {
      handled.push(system.key);
      continue;
    }
    let best: { shore: number; path: number[] } | null = null;
    for (const shore of system.shores) {
      const path = exploreRoute(state, world, from, shore, region, ice);
      if (path && (!best || path.length < best.path.length)) best = { shore, path };
    }
    if (best) return { key: system.key, ...best };
  }
  return null;
}

/** Chooses the next real read or mapping leg. */
function planSurvey(state: GameState, world: World, cal: Calendar, t: NonNullable<GameState["task"]>, region: number, label: string): boolean {
  if (!t.surveyedWater) t.surveyedWater = [];
  const handled = t.surveyedWater;
  if (localWeather(state, world).iceCm < ICE_SHORE_CM) {
    const water = nextSurveyWater(state, world, region, handled);
    if (water) {
      const from = cellOf(state, world);
      const ice = walkIceMode(state, world, false);
      state.route = { target: water.shore, path: water.path, walked: [from], label: "water", ice, lastLand: from };
      t.surveyPhase = "walk";
      t.surveyWater = water.key;
      t.surveyShore = water.shore;
      t.surveyProgress = 0;
      return refreshRouteDuration(state, world, cal);
    }
  }
  const next = pickVantage(state, world, cal, region, t.visited ?? []);
  if (!next) return false;
  const from = cellOf(state, world);
  const ice = walkIceMode(state, world, false);
  state.route = { target: next.cell, path: next.path, walked: [from], label, ice, lastLand: from };
  t.visited = [...(t.visited ?? []), next.cell];
  t.surveyPhase = "walk";
  delete t.surveyWater;
  delete t.surveyShore;
  delete t.surveyProgress;
  return refreshRouteDuration(state, world, cal);
}

/**
 * Walks the current leg of an exploring sweep; when it lands, picks
 * wherever unmapped ground of the region is best seen from next and sets
 * off there. Ends the task once the region is fully known; stopping it by
 * hand, like a walk, just ends it where the survivor stands.
 */
function stepExplore(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task!;
  const target = walkTarget(state, world, t.arg ?? "");
  if (!target) {
    state.task = null;
    state.route = null;
    return;
  }
  const region = cellAt(world, target.cell).region;
  if (t.surveyPhase === "read") {
    const shore = t.surveyShore ?? cellOf(state, world);
    const option = check(state, world, cal, "read", undefined, shore);
    if (!option.ok) {
      if (!t.surveyedWater) t.surveyedWater = [];
      if (t.surveyWater !== undefined) t.surveyedWater.push(t.surveyWater);
      log(state, `Water unread: ${plain(option.why)}.`);
      delete t.surveyWater;
      delete t.surveyShore;
      delete t.surveyProgress;
      if (!planSurvey(state, world, cal, t, region, target.label)) {
        state.task = null;
        state.route = null;
      }
      return;
    }
    const pace = workSpeed(state, world);
    trainTask(state, world, { id: "read" }, dt);
    t.progress += dt;
    t.surveyProgress = (t.surveyProgress ?? 0) + dt * pace;
    t.duration = t.progress + Math.max(0, option.duration - t.surveyProgress);
    if (t.surveyProgress < option.duration) return;
    complete(state, world, cal, rng, "read");
    if (!t.surveyedWater) t.surveyedWater = [];
    if (t.surveyWater !== undefined) t.surveyedWater.push(t.surveyWater);
    delete t.surveyWater;
    delete t.surveyShore;
    delete t.surveyProgress;
    if (!planSurvey(state, world, cal, t, region, target.label)) {
      recordOpportunityEvent(state, { kind: "explored", anotherRegion: t.originRegion !== undefined && region !== t.originRegion });
      state.task = null;
      state.route = null;
      log(state, `{You} {finish} surveying ${regionAt(world, region).name}.`);
    }
    return;
  }
  if (!state.route) {
    if (!planSurvey(state, world, cal, t, region, target.label)) state.task = null;
    return;
  }
  // The route walked trains nothing; the eye reading the country as it goes is wayfinding's own practice.
  train(state, world, dt);
  const before = t.progress;
  const finished = walkAlong(state, world, cal, rng, dt);
  if (!state.route) return; // fell through the ice: the sweep is already over
  t.progress += dt;
  exploreInjury(state, world, rng, before, t.progress);
  if (!finished) {
    refreshRouteDuration(state, world, cal);
    return;
  }
  placeAt(state, world, cellOf(state, world));
  if (spotHere(state, world) === "heath") collectSnares(state, world);
  collectTrap(state, world);
  state.route = null;
  if (t.surveyWater !== undefined) {
    t.surveyPhase = "read";
    t.surveyProgress = 0;
    t.duration = t.progress + 60;
    return;
  }
  if (!planSurvey(state, world, cal, t, region, target.label)) {
    recordOpportunityEvent(state, { kind: "explored", anotherRegion: t.originRegion !== undefined && region !== t.originRegion });
    state.task = null;
    log(state, `{You} {finish} surveying ${regionAt(world, region).name}.`);
  }
}

/**
 * Every unmapped, named region, nearest bearing first: the true centre
 * (RegionDef's own cx, cy - the centroid a campCell only stands near) lies
 * most nearly in the direction of `home` as seen from `from`. A region
 * already fully known, or never even glimpsed, is not a candidate. Ties
 * keep the lower id, so the order never wavers between two scored the same.
 */
function homeRegionsByBearing(state: GameState, world: World, from: number, home: number): number[] {
  const here = cellCenter(world, from);
  const there = cellCenter(world, home);
  const toHome = Math.atan2(there.y - here.y, there.x - here.x);
  const scored: { id: number; diff: number }[] = [];
  for (const key of Object.keys(state.discovered)) {
    const id = Number(key);
    if (discovery(state, id) === 0 || knownShare(state, world, id) >= 1) continue;
    const r = regionAt(world, id);
    const toCentre = Math.atan2(r.cy - here.y, r.cx - here.x);
    let diff = Math.abs(toCentre - toHome) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    scored.push({ id, diff });
  }
  scored.sort((a, b) => a.diff - b.diff || a.id - b.id);
  return scored.map((s) => s.id);
}

/**
 * The next leg of a search toward `home`: a vantage in the nearest-bearing
 * unmapped region a route can actually reach right now - most of the
 * bearing order is ground nothing known yet touches, unwalkable until a
 * closer sweep opens a way in, so this tries each in turn rather than
 * betting everything on the single best bearing. Null once nothing named
 * is left that a route can reach.
 */
function nextHomeLeg(state: GameState, world: World, cal: Calendar, from: number, home: number): { region: number; vantage: { cell: number; path: number[] } } | null {
  for (const region of homeRegionsByBearing(state, world, from, home)) {
    const vantage = pickVantage(state, world, cal, region, [from]);
    if (vantage) return { region, vantage };
  }
  return null;
}

/**
 * Walks the current leg of a search for the way home; when it lands, checks
 * whether camp now routes from here before sweeping on. Ends the moment it
 * does, in whichever region that turns out to be - the sweep may cross
 * several regions before the corridor opens. Stopping it by hand, like an
 * explore, just ends it where the survivor stands. No safety net: a survivor
 * who starves out here starves, the same as any other task the model runs.
 */
function stepSearchHome(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task!;
  if (!state.route) {
    state.task = null;
    return;
  }
  train(state, world, dt);
  const before = t.progress;
  const finished = walkAlong(state, world, cal, rng, dt);
  if (!state.route) return; // fell through the ice: the search is already over
  const route = state.route;
  t.progress += dt;
  exploreInjury(state, world, rng, before, t.progress);
  if (!finished) {
    refreshRouteDuration(state, world, cal);
    return;
  }
  placeAt(state, world, cellOf(state, world));
  if (spotHere(state, world) === "heath") collectSnares(state, world);
  collectTrap(state, world);
  const home = t.home!;
  const from = cellOf(state, world);
  if (survivorRoute(state, world, from, home) !== null) {
    state.route = null;
    state.task = null;
    log(state, "{You} {know} the way home now.", "good");
    return;
  }
  const region = Number((t.arg ?? "").split(":")[1]);
  const next = pickVantage(state, world, cal, region, t.visited ?? []);
  if (next) {
    state.route = { target: next.cell, path: next.path, walked: [from], label: route.label, ice: route.ice, lastLand: from };
    t.visited = [...(t.visited ?? []), next.cell];
    refreshRouteDuration(state, world, cal);
    return;
  }
  const leg = nextHomeLeg(state, world, cal, from, home);
  if (!leg) {
    // Every named region this side of whatever cuts the survivor off is mapped whole, and still no way home.
    state.route = null;
    state.task = null;
    return;
  }
  state.route = { target: leg.vantage.cell, path: leg.vantage.path, walked: [from], label: route.label, ice: route.ice, lastLand: from };
  t.arg = `region:${leg.region}`;
  t.visited = [from, leg.vantage.cell];
  refreshRouteDuration(state, world, cal);
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

/** hearth has no build entry of its own, so STRUCTURES cannot name it the way every other structure is named. */
const SITE_STRUCTURE_NAME: Partial<Record<keyof Site["structures"], string>> = { hearth: "hearth" };

/**
 * What making camp elsewhere leaves standing at the old cell: read before leaveCamp runs,
 * or the fire's fuel and the rack's load are already gone from them and this counts nothing
 * for what only leaveCamp would have tipped into the pile. "" when nothing is left at all.
 */
export function leftBehind(state: GameState, world: World): string {
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  const names = site
    ? (Object.keys(site.structures) as (keyof Site["structures"])[])
        .filter((sid) => site.structures[sid])
        .map((sid) => SITE_STRUCTURE_NAME[sid] ?? STRUCTURES[sid as StructureId].name)
    : [];
  // Read only: pile() would insert an empty inventory at the camp cell, which the map
  // then underlines as though something lay there.
  const p = st.campCell === null ? undefined : state.piles[st.campCell];
  const kg = (p ? weight(p) : 0) + st.fire.fuelKg + st.fire.wetKg + st.rack.kg;
  const parts = kg > 1e-9 ? [...names, `${Math.round(kg * 10) / 10} kg`] : names;
  if (parts.length === 0) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `The ${list} ${parts.length === 1 ? "stays" : "stay"} at the old camp.`;
}

/**
 * Every finished task, and the one place goals hear about it. The switch
 * below is untouched: a deed is what happened, not a special case inside
 * whatever happened.
 */
/** Resolves the pursuit half of a hunt. True means a kill became field work. */
function resolveHuntPursuit(state: GameState, world: World, cal: Calendar, rng: Rng, task: NonNullable<GameState["task"]>): boolean {
  const p = state.player;
  const s = task.arg as Species;
  const def = SPECIES_DEFS[s];
  if (!def?.hunt || isFish(s)) return false;
  const here = cellOf(state, world);
  const d = regionDensity(state, world, p.region, s, cal);
  const populationBefore = popOf(regionState(state, world, p.region), s);
  disturbHuntingGround(state, world, here, false);
  if (wearTool(state, "bow", wearFactor(state, world, "hunt", s))) {
    record(state, { kind: "toolWorn", tool: "bow" });
    cue("toolBreaks");
    log(state, "The bow snaps.", "bad");
  }
  cue("arrow");
  const den = s === "bear" ? knownBearDen(state, cal) : null;
  const odds = den ? Math.min(0.9, 0.55 * oddsFactor(state, "bear")) : huntOdds(state, world, cal, d, s);
  const struck = rng.chance(odds);
  const killed = struck && claimHuntableAnimal(state, world, s, here, den?.id ?? task.wildlifeSubject);
  noteHuntAttempt(state, world, {
    species: s, region: p.region, cell: here, populationBefore, odds,
    pressureFactor: huntPressureFactor(state, world, here), success: killed,
    minutes: pendingHuntMinutes(state),
  });
  const signOdds = huntSignOdds(state, d);
  if (d > 0 && (killed || rng.chance(signOdds))) {
    if (noteHuntSign(state, here, s)) log(state, `Fresh sign: ${anAnimal(s)}.`);
  }
  if (killed) {
    state.stats.animals++;
    state.stats.kills[s] = (state.stats.kills[s] ?? 0) + 1;
    if (!hasEvent(state, (e) => e.kind === "firstKill" && e.species === s)) record(state, { kind: "firstKill", species: s });
    const x = huntExtras(state, s);
    if (den && x.fatKg) x.fatKg *= 0.5;
    const carcass = createCarcass(state, world, s, x);
    disturbHuntingGround(state, world, here, true);
    task.huntPhase = "field";
    task.carcassId = carcass.id;
    task.progress = 0;
    task.duration = carcassMinutes(carcass);
    if (isWorkIntent(state.intent)) state.intent.step = `field dressing ${def.name}`;
    log(state, `${anAnimal(s, true)}. The carcass lies where it fell.`, "good");
    const injury = Math.min(0.95, injuryChance(state, s) * (den ? 2 : 1));
    if (injury > 0 && rng.chance(injury)) {
      p.injured = Math.max(p.injured, 24 * 60);
      p.health = Math.max(1, p.health - 15);
      log(state, "It did not go down easily. {You} {are} hurt.", "bad");
    }
    return true;
  }
  noteFailedHunt(state, here, s);
  const hurt = Math.min(0.95, gapInjury(state, s) * (den ? 2 : 1));
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
  return false;
}

function complete(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string, shelterLevel?: number): void {
  const succeeded = completeTask(state, world, cal, rng, id, arg, shelterLevel);
  if (succeeded !== false) recordOpportunityEvent(state, {
    kind: "taskCompleted", minute: state.minute, id, arg, region: state.player.region,
    cell: cellOf(state, world), atCamp: atCamp(state, world),
  }, world);
}

function completeTask(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string, shelterLevel?: number): boolean | undefined {
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
      const item = splitIsWet(state, world) ? "wetFirewood" : "firewood";
      produce(state, world, item, DEADWOOD_KG);
      recordOpportunityEvent(state, { kind: "gathered", item, kg: DEADWOOD_KG });
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
      const kg = BERRY_PICK_KG * yieldFactor(state, "foraging") * (winterBerries(cal) ? BERRY_WINTER_SHARE : 1);
      produce(state, world, "berries", kg);
      creditYield(state, "berries", kg * FOODS.berries.kcalPerKg);
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foraged", item: "berries" });
      recordOpportunityEvent(state, { kind: "seasonalFood" });
      return;
    }
    case "innerBark": {
      const kg = BARK_FRESH_KG_PER_HOUR * yieldFactor(state, "foraging") * (barkSeason(cal) ? 1 : 0.5);
      st.wood -= kg * BARK_TREE_SHARE;
      produce(state, world, "freshBark", kg);
      creditYield(state, "bark", (kg / BARK_DRY_RATIO) * FOODS.barkFlour.kcalPerKg);
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foraged", item: "barkFlour" });
      log(state, `{You} {strip} the pines: ${(kg * 1000).toFixed(0)} g of inner bark.`, "good");
      return;
    }
    case "roots": {
      const at = cellOf(state, world);
      const winter = cal.dayOfYear < ROOT_FROM_DOY || cal.dayOfYear > ROOT_TO_DOY;
      const left = rootCellKg(st, world, at);
      const rate = (winter ? ROOT_WINTER_KG_PER_HOUR : ROOT_KG_PER_HOUR) * rootDigFactor(left, rootCellFullKg(world, at));
      const take = Math.min(rate * yieldFactor(state, "foraging"), left);
      setRootCellKg(st, world, at, left - take);
      // Under Foraging 3 half of what comes up is not worth keeping.
      const kept = gap(state, "roots") > 0 ? take / 2 : take;
      if (kept < take) log(state, "{You} {dig} up as much that is not food as is.", "bad");
      produce(state, world, "roots", kept);
      creditYield(state, "roots", kept * FOODS.cookedRoots.kcalPerKg);
      if (kept > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      if (kept > 1e-9) recordOpportunityEvent(state, { kind: "foraged", item: "cookedRoots" });
      if (!winter) recordOpportunityEvent(state, { kind: "seasonalFood" });
      return;
    }
    case "tapSap": {
      const day = dayNumber(state.minute);
      st.sapTaps = st.sapTaps.day === day ? { day, n: st.sapTaps.n + 1 } : { day, n: 1 };
      p.water = WATER_FULL;
      p.kcal = Math.min(KCAL_FULL, p.kcal + SAP_KCAL);
      creditEaten(state, SAP_KCAL, 0);
      creditYield(state, "sap", SAP_KCAL);
      recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      recordOpportunityEvent(state, { kind: "seasonalFood" });
      recordOpportunityEvent(state, { kind: "ate", item: "sap" });
      log(state, "{You} {drink} the sap as it runs.", "good");
      return;
    }
    case "seaweed": {
      const kg = SEAWEED_KG_PER_HOUR * yieldFactor(state, "foraging");
      produce(state, world, "seaweed", kg);
      creditYield(state, "seaweed", kg * FOODS.seaweed.kcalPerKg);
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foraged", item: "seaweed" });
      recordOpportunityEvent(state, { kind: "seasonalFood" });
      log(state, `{You} {gather} seaweed off the rocks: ${(kg * 1000).toFixed(0)} g.`, "good");
      return;
    }
    case "split": {
      consume(invs, [{ item: "log", qty: 1 }]);
      const wet = !splitSheltered(state, world, cellOf(state, world)) && splitIsWet(state, world);
      const item = wet ? "wetFirewood" : "firewood";
      produce(state, world, item, ITEM_KG.log);
      recordOpportunityEvent(state, { kind: "gathered", item, kg: ITEM_KG.log });
      return;
    }
    case "splitWedges": {
      consume(invs, [{ item: "log", qty: 1 }]);
      const wet = !splitSheltered(state, world, cellOf(state, world)) && splitIsWet(state, world);
      const item = wet ? "wetFirewood" : "firewood";
      produce(state, world, item, ITEM_KG.log);
      recordOpportunityEvent(state, { kind: "gathered", item, kg: ITEM_KG.log });
      if (rng.chance(WEDGE_BREAK)) {
        consume(invs, [{ item: "wedge", qty: 1 }]);
        log(state, "A wedge splits along the grain.", "bad");
      }
      return;
    }
    case "findDen": {
      const bear = unknownBearDen(state, cal);
      if (!bear?.denCell) return;
      if (rng.chance(findDenOdds(state))) {
        state.wildlife.knownDens[bear.denCell] = true;
        log(state, "The tracks narrow to a hollow under stone and root: a bear den.", "good");
      } else log(state, "The bear sign crosses itself and fades. No den found.");
      return;
    }
    case "hunt": {
      // Pursuit and field processing are resolved in stepTask so one kill can
      // remain a single task while changing phase.
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
        recordOpportunityEvent(state, { kind: "foodAcquired", method: "fish" });
        recordOpportunityEvent(state, { kind: "fishCaught", species: s, method: "direct" });
        const item = fishItem(s);
        produce(state, world, item, kg);
        // Raw fish is not eaten; the yield is what it cooks to.
        creditYield(state, "fish", kg * FOODS[item === "fish" ? "cookedFish" : "cookedOilyFish"].kcalPerKg);
        if (inSpawn(s, cal.month) && !disabled("roe")) {
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
      st.trap = { cell: here, kg: 0, oilyKg: 0, fish: [...state.player.known[here].fish], age: 0, caught: [] };
      log(state, `The trap is set at ${whereIs(state, world, here)}.`);
      state.stats.structures++;
      return;
    }
    case "emptyTrap": {
      const catchResult = takeTrapFish(state, world);
      if (catchResult.kg > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "trap" });
      for (const species of catchResult.species) recordOpportunityEvent(state, { kind: "fishCaught", species, method: "trap" });
      log(state, `{You} {empty} the trap: ${catchResult.kg.toFixed(1)} kg of fish.`, "good");
      return;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish" | "oilyFish" | "rawFat" | "roots";
      const kg = Math.min(1, totalQty(invs, food));
      consume(invs, [{ item: food, qty: kg }]);
      const out = food === "rawMeat" ? "cookedMeat" : food === "fish" ? "cookedFish" : food === "oilyFish" ? "cookedOilyFish" : food === "roots" ? "cookedRoots" : "fat";
      produce(state, world, out, kg);
      if (food === "rawMeat" || food === "rawFat") noteHuntFoodTransformed(state, food, out, kg, kg, food === "rawFat");
      if (kg > 0) recordOpportunityEvent(state, { kind: "cooked", kg, item: out });
      return kg > 0;
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
    case "eggs": {
      const kg = Math.min(EGG_KG_PER_HOUR * yieldFactor(state, "foraging"), st.nests * EGG_CLUTCH_KG);
      st.nests -= kg / EGG_CLUTCH_KG;
      produce(state, world, "eggs", kg);
      creditYield(state, "eggs", kg * FOODS.eggs.kcalPerKg);
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foodAcquired", method: "forage" });
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "foraged", item: "eggs" });
      if (kg > 1e-9) recordOpportunityEvent(state, { kind: "seasonalFood" });
      log(state, `{You} {gather} the nests: ${(kg * 1000).toFixed(0)} g of eggs.`, "good");
      return;
    }
    case "grindBark": {
      const kg = Math.min(1, totalQty(invs, "driedBark"));
      consume(invs, [{ item: "driedBark", qty: kg }]);
      produce(state, world, "barkFlour", kg);
      log(state, `{You} {grind} the bark: ${(kg * 1000).toFixed(0)} g of flour.`, "good");
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
          recordOpportunityEvent(state, { kind: "toolMade", tool: item as ToolId });
          recordOpportunityEvent(state, { kind: "toolCared" });
          if (hasTool(p, item as ToolId)) log(state, `{You} {have} a spare ${rec.name}.`, "good");
          else if (takeUp(state, world, item as ToolId)) log(state, `{You} {have} a ${rec.name}.`, "good");
        }
      }
      if (state.shopping?.task === "craft" && state.shopping.arg === rid) state.shopping = null;
      recordOpportunityEvent(state, { kind: "crafted", recipe: rid });
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
      if (axe) recordOpportunityEvent(state, { kind: "toolCared" });
      return;
    }
    case "hone": {
      const axe = axeInHand(p);
      if (axe) axe.durability = 100;
      wearTool(state, "whetstone", 1);
      if (axe) recordOpportunityEvent(state, { kind: "toolCared" });
      return;
    }
    case "build": {
      const sid = arg as StructureId;
      // A snare's completion never touches the camp's own record: it stands on the
      // heath, counted in st.snares, and raises no site of its own.
      if (sid === "snare") {
        consume(invs, STRUCTURES.snare.needs);
        st.snares++;
      } else {
        const site = siteFor(st, st.campCell!);
        const before = protectionOf(site);
        if (sid === "seep") {
          const here = cellOf(state, world);
          state.seeps[here] = { class: seepGround(world, here)!, litres: 0, ice: 0, dug: state.minute };
          delete site.build[sid];
        } else {
          site.structures[sid] = true;
          delete site.build[sid];
          if (sid === "dryingRack") site.racks = Math.min(MAX_RACKS, site.racks + 1);
          if (sid === "boughBed") site.boughBedAge = 0;
          if (sid === "leanTo" || sid === "dryingRack" || sid === "turfHut") site.structureAge[sid] = 0;
        }
        const after = protectionOf(site);
        if (sid !== "seep" && after !== before) recordOpportunityEvent(state, {
          kind: "protectionChanged", minute: state.minute, region: state.player.region, cell: st.campCell!,
          from: before, to: after, source: "structure",
        }, world);
      }
      state.stats.structures++;
      // Once per structure per life; the first snare set is the record's snare line.
      if (!hasEvent(state, (e) => e.kind === "built" && e.structure === sid)) record(state, { kind: "built", structure: sid });
      recordOpportunityEvent(state, { kind: "built", structure: sid });
      if (state.shopping?.task === "build" && state.shopping.arg === sid) state.shopping = null;
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
      // Reachable only once needsMending has confirmed the structure stands, so the site is already there.
      siteFor(st, st.campCell!).structureAge[sid] = 0;
      record(state, { kind: "repaired", structure: sid });
      log(state, `The ${STRUCTURES[sid].name} is mended.`, "good");
      return;
    }
    case "light":
    case "lightIndoors": {
      const camp = atCamp(state, world);
      const rekindle = camp && hasEmbers(st.fire);
      consume(invs, [{ item: "firewood", qty: 1 }]);
      if (!rekindle && wearTool(state, "fireDrill", 2 * wearFactor(state, world, "light"))) record(state, { kind: "toolWorn", tool: "fireDrill" });
      const weather = localWeather(state, world);
      const lr = lightingInRain(weather, ambientTemperature(cal, weather), roofed(siteAt(st, cellOf(state, world))), hasQuirk(state, "steadyByTheFire"));
      if (!rekindle && lr.failChance > 0 && rng.chance(lr.failChance)) {
        log(state, "The tinder will not catch.", "bad");
        return false;
      }
      if (!camp) {
        p.fieldFire = { cell: cellOf(state, world), fuelKg: 1 };
        recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute, region: state.player.region, cell: cellOf(state, world), atCamp: false }, world);
        cue("fireCatches");
        log(state, "Smoke, then flame. The field fire is lit.", "good");
        return true;
      }
      st.fire.lit = true;
      st.fire.embers = 0;
      // A run of keeping survives the coals; only a fire lit from cold starts a new one.
      if (st.fire.litSince === null) st.fire.litSince = state.minute;
      recordOpportunityEvent(state, { kind: "fuelled" });
      recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute, region: state.player.region, cell: cellOf(state, world), atCamp: true }, world);
      cue("fireCatches");
      st.fire.fuelKg += 1;
      // The row names the method: the pit fire is outdoors whatever stands, the fire indoors is indoors.
      st.fire.indoors = id === "lightIndoors";
      log(state, "Smoke, then flame. The fire is lit.", "good");
      return true;
    }
    case "lightTorch": {
      const relight = p.torch.minutes > 0;
      if (!relight) consume(invs, [{ item: "torch", qty: 1 }]);
      if (!fireAt(state, world) && wearTool(state, "fireDrill", wearFactor(state, world, "lightTorch"))) record(state, { kind: "toolWorn", tool: "fireDrill" });
      p.torch = { lit: true, minutes: relight ? p.torch.minutes : TORCH_BURN_MINUTES };
      cue("torchLit");
      log(state, "The torch catches.", "good");
      return;
    }
    case "melt": {
      const fire = fireAt(state, world);
      if (!fire) return;
      fire.fuelKg = Math.max(0, fire.fuelKg - 1);
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
      if (arg === "hole" && !waterSource(state, world) && localWeather(state, world).iceCm >= ICE_SHORE_CM) cutIceHole(state, world);
      const added = fillVessels(state, world);
      if (added > 1e-9) log(state, `{You} {fill} ${added.toFixed(1)} litres.`);
      return;
    }
    case "hang": {
      const kg = loadRack(state, world);
      // Raw meat auto-eaten while the task ran leaves loadRack nothing to move: the
      // task still finishes, but a hang that hung nothing is not food put by.
      if (kg > 0) {
        log(state, `{You} {hang} ${kg.toFixed(1)} kg of meat to dry.`);
        recordOpportunityEvent(state, { kind: "stored" });
        recordOpportunityEvent(state, { kind: "preserved" });
      }
      return;
    }
    case "iceHole": {
      cutIceHole(state, world);
      return;
    }
    case "makeCamp": {
      const here = cellOf(state, world);
      const hadCampInAnotherRegion = Object.entries(state.regions)
        .some(([id, region]) => Number(id) !== state.player.region && region.campCell !== null);
      const left = leftBehind(state, world);
      leaveCamp(state, world);
      st.campCell = here;
      if (isWorkIntent(state.intent)) state.intent.campCell = here;
      log(state, left ? `{You} {make} camp here. ${left}` : "{You} {make} camp here.");
      if (hadCampInAnotherRegion) recordOpportunityEvent(state, { kind: "campedAgain", region: state.player.region });
      return;
    }
    case "readSky": {
      const storm = state.weather.storm;
      const before = storm ? forecastKnowledge(state, storm) : null;
      state.player.skyReadDay = skyReadDay(state);
      const after = storm ? forecastKnowledge(state, storm) : null;
      if (storm && before && after && !sameForecastKnowledge(before, after)) {
        recordOpportunityEvent(state, { kind: "forecastChanged", minute: state.minute, stormId: storm.id, before, after, source: "readSky" }, world);
      }
      log(state, `{You} {read} the sky: ${forecastText(state) || "no storm can be read in it"}.`);
      return;
    }
    case "findShelter": {
      const cell = cellOf(state, world);
      const site = siteFor(st, cell);
      const before = protectionOf(site);
      site.cover = Math.max(site.cover, findCover(world, cell, shelterLevel ?? skillLevel(state, "naturalShelter"))) as Protection;
      site.coverAge = 0;
      const after = protectionOf(site);
      if (after !== before) recordOpportunityEvent(state, {
        kind: "protectionChanged", minute: state.minute, region: state.player.region, cell,
        from: before, to: after, source: "found",
      }, world);
      log(state, site.cover === 0 ? "There is no shelter here." : `{You} {find} ${PROTECTION_WORDS[site.cover]} cover.`);
      return;
    }
    case "improveCover": {
      const cell = cellOf(state, world);
      const site = siteFor(st, cell);
      const before = protectionOf(site);
      const maximum = Math.min(3, coverCeiling(world, cell) + 1) as Protection;
      const after = improveCover(site, maximum);
      if (after !== before) recordOpportunityEvent(state, {
        kind: "protectionChanged", minute: state.minute, region: state.player.region, cell,
        from: before, to: after, source: "improved",
      }, world);
      log(state, `{You} {work} the cover into something ${PROTECTION_WORDS[after]}.`);
      return;
    }
    case "emergencyShelter":
      log(state, "{You} {finish} the emergency shelter. It is liveable, but will fall in fourteen days.");
      return;
    // A sleep leaves nothing behind it: it ran to the wake line, and whether
    // the body lies down again is the model's to say next minute.
    case "sleep":
    case "haul":
    case "night":
    case "travel":
    case "walk":
      return;
    case "searchHome":
    case "rest":
      return;
  }
}

/** Puts out the equipped torch immediately and preserves its remaining fuel. */
export function putOutTorch(state: GameState): boolean {
  if (!state.player.torch.lit || state.player.torch.minutes <= 0) return false;
  state.player.torch.lit = false;
  log(state, "The torch is out.");
  return true;
}

/** Moves the live fish out of this region's trap into the pack and retains the identities actually collected. */
function takeTrapFish(state: GameState, world: World): { kg: number; species: Species[] } {
  const st = regionState(state, world, state.player.region);
  const kg = st.trap?.kg ?? 0;
  if (!st.trap || kg <= 1e-9) return { kg: 0, species: [] };
  const oilyKg = st.trap.oilyKg;
  const leanKg = kg - oilyKg;
  const species = [...new Set(st.trap.caught ?? [])];
  st.trap.kg = 0;
  st.trap.oilyKg = 0;
  st.trap.age = 0;
  st.trap.caught = [];
  if (leanKg > 1e-9) {
    produce(state, world, "fish", leanKg);
    creditYield(state, "trap", leanKg * FOODS.cookedFish.kcalPerKg);
  }
  if (oilyKg > 1e-9) {
    produce(state, world, "oilyFish", oilyKg);
    creditYield(state, "trap", oilyKg * FOODS.cookedOilyFish.kcalPerKg);
  }
  state.stats.animals++;
  return { kg, species };
}

/** The fish in the trap come out when you arrive at its cell, as hares do at the snares: a basket at the shore you stand on is not a trip. */
function collectTrap(state: GameState, world: World): void {
  const st = regionState(state, world, state.player.region);
  if (!st.trap || cellOf(state, world) !== st.trap.cell) return;
  const catchResult = takeTrapFish(state, world);
  if (catchResult.kg > 1e-9) {
    recordOpportunityEvent(state, { kind: "foodAcquired", method: "trap" });
    for (const species of catchResult.species) recordOpportunityEvent(state, { kind: "fishCaught", species, method: "trap" });
    log(state, `${catchResult.kg.toFixed(1)} kg of fish in the trap at ${whereIs(state, world, st.trap.cell)}; {you} {take} them.`, "good");
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
  recordOpportunityEvent(state, { kind: "foodAcquired", method: "snare" });
  log(state, `${n} hare${n > 1 ? "s" : ""} in the snares at ${regionAt(world, p.region).name}.`, "good");
}

/** kg of a given item within reach, for labels. */
export function inReach(state: GameState, world: World, item: keyof typeof ITEM_KG): number {
  return qty(state.player.pack, item) + qty(herePile(state, world), item);
}
