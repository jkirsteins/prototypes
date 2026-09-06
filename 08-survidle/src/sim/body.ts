/**
 * The body tier of an intent: sleep, storm, cold, thirst, hunger, snares,
 * spent, home, in that order, and what to do about each. Every step is an
 * ordinary task; the fire steps are guarded by check, so a missing drill or
 * an under-level pit is skipped, never an error.
 */
import type { Rng } from "../rng";
import { findRoute, routeMinutes } from "../world/route";
import { cellAt, regionAt, spotOf, type World } from "../world/gen";
import { autoEat, edible, HUNGRY_LINE } from "./actions";
import type { Calendar } from "./calendar";
import { feedFire } from "./camp";
import { fireWarms, fuelTotal, roofed, SPREAD_FUEL_KG } from "./fire";
import { AXES, axeInHand, hasTool, pile, qty, takeUp, transfer, weight } from "./inventory";
import { body, fearsFell } from "./person";
import { AUTO_EAT_ORDER, type FoodId, ITEM_KG, MAX_SNARES, STRUCTURES, TOOLS } from "./items";
import { log } from "./log";
import { baseWalkSpeed } from "./player";
import { cellOf, straightKm, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { seepStopped } from "./seep";
import { RESTED_AT, sleepiness, SLEEP_ONSET, SLEEPY_AT, SPENT_AT, WAKE_AT } from "./sleep";
import { isRunning, type Step, walkStep } from "./steps";
import { check, toolFor } from "./tasks";
import type { BodyNeed, GameState, Intent, ItemId } from "./types";
import { drink, fillVessels, ICE_SHORE_CM, THIRSTY_L, vesselLitres, WATER_FULL, waterSource } from "./water";
import { ambientTemperature, stormComing, stormNow, walkableIce } from "./weather";

/** Fatigue at which a body lies down wherever it is, whatever the clock says: the collapse. */
export const SLEEP_AT = 20;
export const COLD_UNDER = 30;
export const WARM_AT = 45;
export const PROVISION_KG = 2;
/** Soaked through: wet clothing holds half its warmth, and hypothermia near freezing is an hour or two away. */
export const SOAKED_WETNESS = 60;
/** The air under which a soaked body reads cold at WARM_AT rather than COLD_UNDER. */
export const WET_COLD_C = 5;
/** Densest first, so two kilos carry the most days. */
const PROVISIONS: FoodId[] = ["driedMeat", "cookedMeat", "cookedFish", "berries"];

/**
 * Hours of task work a day the median body's fatigue is scaled to: a
 * camp-builder's working day, with the evening by the fire. It is the
 * divisor of the task drain and the word on the person's card, and nothing
 * counts hours against it.
 */
export const WORK_HOURS_DEFAULT = 10;

/**
 * A catch hanging in the snares and the heath in reach by day: the cell to
 * walk to, or null. Arriving on the heath collects the catch, so the chore
 * ends where it is done. A person checks their snares on the way past,
 * which puts this above the evening's rest and below eating and drinking.
 */
export function snaresWaiting(state: GameState, world: World, cal: Calendar): number | null {
  if (cal.isNight) return null;
  const st = regionState(state, world, state.player.region);
  if (st.snareCatch.count <= 0) return null;
  const heath = spotOf(regionAt(world, state.player.region), "heath");
  if (!heath) return null;
  if (cellOf(state, world) === heath.cell) return null;
  return check(state, world, cal, "walk", `cell:${heath.cell}`).ok ? heath.cell : null;
}

/** The need that holds now, sleep first. A need already being served keeps holding until its own exit. */
export function currentNeed(state: GameState, world: World, cal: Calendar, it: Intent): BodyNeed | null {
  const p = state.player;
  // Read once, before the sleep clauses, because both have a say in them.
  const thirsty = p.water < THIRSTY_L && canQuench(state, world, cal);
  const storming = stormComing(state.weather, state.minute) || stormNow(state.weather, state.minute);
  // Thirst defers a bedtime only when the body would actually get up and go to
  // the water. A storm outranks thirst, so a thirsty body sitting one out is
  // not going to drink first, and the exception would only keep it awake.
  const drinkFirst = thirsty && !storming;
  const sleepy = sleepiness(p.sleepDebt, cal.hour);
  // The body lies down when the two processes cross the onset line and gets up
  // when they fall back to the wake line: no clock is read here, so the
  // bedtime, the wake and the nap are all the same clause. A thirsty body
  // that can drink drinks before it lies down; one that has worked itself
  // under the collapse line sleeps parched, which is what a collapse is, and
  // holds that sleep past the wake line until the fatigue an evening by the
  // fire would have given back is there.
  // The night lives on the player, not the intent, and only the model ends
  // it: a sleep broken to feed the fire, or by an order changing under the
  // sleeper, is a night interrupted rather than a night over, and the body
  // goes back to bed on the next free minute.
  if (p.energy <= SLEEP_AT) p.sleeping = { collapsed: true };
  else if (p.sleeping) {
    if (!(sleepy > WAKE_AT || (p.sleeping.collapsed && p.energy < RESTED_AT))) p.sleeping = null;
  } else if (sleepy >= SLEEP_ONSET && !drinkFirst) {
    p.sleeping = { collapsed: false };
  }
  if (p.sleeping || (it.task === "night" && it.done < 1)) return "sleep";
  if (storming) return "storm";
  // Warm again: whatever a spent rest gave up on is worth trying afresh next time it turns cold.
  if (p.warmth >= WARM_AT) it.coldSpent = false;
  const wetCold = p.wetness > SOAKED_WETNESS && ambientTemperature(cal, state.weather) < WET_COLD_C;
  const coldUnder = wetCold ? WARM_AT : COLD_UNDER;
  const cold = !it.coldSpent && (p.warmth < coldUnder || (it.need === "cold" && p.warmth < WARM_AT));
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (thirsty) return "thirsty";
  if (p.kcal < HUNGRY_LINE && canFeed(state, world, cal, it)) return "hungry";
  if (snaresWaiting(state, world, cal) !== null) return "snares";
  // Worked out: the evening by the fire, held until the fire has given the
  // fatigue back rather than until a clock says dawn. It also holds while the
  // body is nearly sleepy, so an evening that is within an hour of bed is
  // spent by the fire rather than on one more errand and a walk back.
  // A day's work done is no reason to sit down parched: at the water, drink
  // your fill before walking back to the fire. Away from it the stores keep,
  // since the auto-drink reaches a vessel or the camp pile without getting up.
  const spent = p.energy < SPENT_AT || (it.need === "spent" && (p.energy < RESTED_AT || sleepy >= SLEEPY_AT));
  if (spent) return p.water < WATER_FULL - 0.5 && waterSource(state, world) ? "thirsty" : "spent";
  if (homeBeforeDark(state, world, cal, it)) return "home";
  return null;
}

/** Whether hunger can be answered: safe food in the pack, or at camp with a walk there open. A hunger nothing can answer masks nothing. */
export function canFeed(state: GameState, world: World, cal: Calendar, it: Intent): boolean {
  const p = state.player;
  if (AUTO_EAT_ORDER.some((f) => edible(state, f) && qty(p.pack, f) > 1e-9)) return true;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => edible(state, f) && qty(camp, f) > 1e-9)) return false;
  return cellOf(state, world) === it.campCell || check(state, world, cal, "walk", `cell:${it.campCell}`).ok;
}

/** Minutes to this region's camp on foot right now, or null when there is no way there. Zero already there. */
export function minutesToCamp(state: GameState, world: World, cal: Calendar): number | null {
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here === st.campCell) return 0;
  const ice = walkableIce(state.weather);
  const route = findRoute(world, here, st.campCell, ice, fearsFell(state));
  if (!route) return null;
  return routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather), ice);
}

/**
 * Winter days are short: leave the work so as to reach camp by sunset.
 * Sticky once it holds, until night actually falls, so the boundary the
 * walk time sets does not flicker the need in and out and send the runner
 * back out for one more minute of work between crossings.
 */
function homeBeforeDark(state: GameState, world: World, cal: Calendar, it: Intent): boolean {
  if (cal.season !== "winter" || cal.isNight) return false;
  if (it.need === "home") return true;
  const st = regionState(state, world, state.player.region);
  // Already at camp: nothing to walk home for. The old 15-minutes-to-sunset
  // check fired here too and only ever idled the evening away at rest.
  if (cellOf(state, world) === st.campCell) return false;
  const minutes = minutesToCamp(state, world, cal);
  if (minutes === null) return false;
  return (cal.sunset - cal.hour) * 60 <= minutes + 15;
}

/** The step a need calls for, or null when there is nothing to start for it. */
export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent, need: BodyNeed): Step | null {
  switch (need) {
    case "hungry": return hungryStep(state, world, cal, rng, it);
    case "thirsty": return thirstyStep(state, world, cal);
    case "storm": return stormStep(state, world, cal);
    case "home": return homeStep(state, world, cal);
    case "snares": {
      const cell = snaresWaiting(state, world, cal);
      return cell === null ? null : walkStep(state, world, cell, " to check the snares");
    }
    default: return campStep(state, world, cal, it, need);
  }
}

/** The nearest waterside cell in this region open to fetch water from - the cut ice hole when the shore is iced over, else the nearest open shore - not this cell, and a walk there can start. Null otherwise. */
function shoreForWater(state: GameState, world: World, cal: Calendar): number | null {
  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  if (state.weather.iceCm >= ICE_SHORE_CM) {
    const hole = st.iceHole?.cell;
    if (hole === undefined || hole === here) return null;
    return check(state, world, cal, "walk", `cell:${hole}`).ok ? hole : null;
  }
  const r = regionAt(world, state.player.region);
  const candidates = r.cells
    .filter((c) => c !== here && watersideCell(world, c))
    .sort((a, b) => straightKm(world, here, a) - straightKm(world, here, b));
  for (const cell of candidates) {
    if (check(state, world, cal, "walk", `cell:${cell}`).ok) return cell;
  }
  return null;
}

/**
 * Where a hole could be cut: the shore is iced, no hole is open in this
 * region, and the runner holds an axe. The nearest waterside cell a walk
 * can reach, the cell under foot included; null when any of that fails.
 */
export function iceHoleSite(state: GameState, world: World, cal: Calendar): number | null {
  if (state.weather.iceCm < ICE_SHORE_CM) return null;
  const st = regionState(state, world, state.player.region);
  if (st.iceHole) return null;
  if (!axeInHand(state.player)) return null;
  const here = cellOf(state, world);
  if (watersideCell(world, here)) return here;
  const r = regionAt(world, state.player.region);
  const candidates = r.cells.filter((c) => watersideCell(world, c)).sort((a, b) => straightKm(world, here, a) - straightKm(world, here, b));
  for (const cell of candidates) if (check(state, world, cal, "walk", `cell:${cell}`).ok) return cell;
  return null;
}

/** Camp water in reach: litres in the camp pile, and camp under foot or a walk there open. */
function campWaterReady(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (qty(pile(state, st.campCell), "water") <= 1e-9) return false;
  return cellOf(state, world) === st.campCell || check(state, world, cal, "walk", `cell:${st.campCell}`).ok;
}

/** Whether this region's camp can melt snow for water right now: snow on the ground, a fire lit or still gettable, and camp in reach. */
export function campMeltReady(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (state.weather.snowCm < 1) return false;
  if (!st.fire.lit && fireStep(state, world, cal, st.campCell) === null) return false;
  return cellOf(state, world) === st.campCell
    ? !st.fire.lit || check(state, world, cal, "melt").ok
    : check(state, world, cal, "walk", `cell:${st.campCell}`).ok;
}

/** A place to walk to for water and what a walk there would give: endless at the shore or an open hole, the pool at a seep, the pile's litres at camp. */
interface WaterOption { cell: number; litres: number; km: number; why: string }

/** Every source in reach of a walk, nearest first; the cell under foot is excluded, since drink() already tried it. */
function waterOptions(state: GameState, world: World, cal: Calendar): WaterOption[] {
  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  const out: WaterOption[] = [];
  const shore = shoreForWater(state, world, cal);
  if (shore !== null) out.push({ cell: shore, litres: Number.POSITIVE_INFINITY, km: straightKm(world, here, shore), why: " for water" });
  if (campWaterReady(state, world, cal) && st.campCell !== here) {
    out.push({ cell: st.campCell, litres: qty(pile(state, st.campCell), "water"), km: straightKm(world, here, st.campCell), why: " for water" });
  }
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    if (cell === here || cellAt(world, cell).region !== state.player.region) continue;
    if (!check(state, world, cal, "walk", `cell:${cell}`).ok) continue;
    out.push({ cell, litres: state.seeps[cell].litres, km: straightKm(world, here, cell), why: " for the seep" });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Whether thirst can actually be done anything about here and now; gates the need the way campCanWarm gates cold. */
function canQuench(state: GameState, world: World, cal: Calendar): boolean {
  return vesselLitres(state.player) > 0
    || waterSource(state, world)
    || waterOptions(state, world, cal).some((o) => o.litres > 1e-9)
    || iceHoleSite(state, world, cal) !== null
    || campMeltReady(state, world, cal)
    || Object.keys(state.seeps).some((k) => cellAt(world, Number(k)).region === state.player.region);
}

/**
 * Drink in reach; else the nearest source that would put the reserve back over
 * the thirsty line; else cut an ice hole; else wait at the fullest seep,
 * drinking as it fills; else melt snow at the fire, last because it burns the
 * woodpile. The body's own choice among sources, which an order never makes.
 */
function thirstyStep(state: GameState, world: World, cal: Calendar): Step | null {
  if (drink(state, world)) return null;
  const p = state.player;
  const here = cellOf(state, world);
  const need = Math.max(0.1, THIRSTY_L - p.water);
  const options = waterOptions(state, world, cal);
  const enough = options.find((o) => o.litres >= need);
  if (enough) return walkStep(state, world, enough.cell, enough.why);
  const site = iceHoleSite(state, world, cal);
  if (site !== null) {
    if (site !== here) return walkStep(state, world, site, " to open an ice hole");
    return { id: "iceHole", step: "opening an ice hole" };
  }
  const seepHere = state.seeps[here];
  if (seepHere && seepStopped(state, world, here, ambientTemperature(cal, state.weather)) !== "frozen") {
    return { id: "rest", step: "waiting at the seep" };
  }
  const seeps = options.filter((o) => o.why === " for the seep" && state.seeps[o.cell].ice <= 1e-9);
  if (seeps.length) {
    const fullest = seeps.reduce((a, b) => (b.litres > a.litres ? b : a));
    return walkStep(state, world, fullest.cell, " to wait at the seep");
  }
  const st = regionState(state, world, p.region);
  const atCamp = here === st.campCell;
  if (campMeltReady(state, world, cal)) {
    if (!atCamp) return walkStep(state, world, st.campCell, " for water");
    // The cold step's fire, for the same reason: no fire, no melt.
    const fs = fireStep(state, world, cal, st.campCell);
    if (fs) return fs;
    return { id: "melt", step: "melting snow" };
  }
  return null;
}

/** Walk to this region's camp, light a fire there if a cold pit allows it, keep it fed against the wind with dry wood, then wait the storm out. */
function stormStep(state: GameState, world: World, cal: Calendar): Step | null {
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before the storm") : null;
  }
  const fs = fireStep(state, world, cal, st.campCell);
  if (fs) return fs;
  if (st.fire.lit && fuelTotal(st.fire) < SPREAD_FUEL_KG) feedFire(state, world, state.player.region, SPREAD_FUEL_KG - fuelTotal(st.fire), true);
  return { id: "rest", step: "waiting out the storm" };
}

/** Walk to this region's camp and settle in before dark. */
function homeStep(state: GameState, world: World, cal: Calendar): Step | null {
  const st = regionState(state, world, state.player.region);
  if (cellOf(state, world) !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before dark") : null;
  }
  return { id: "rest", step: "in before dark" };
}

/**
 * The fire step waiting at a cell: build the pit, split fuel for it, or
 * light it. Null once the fire is already lit or nothing more can be done
 * there. Judged at a given cell (rather than wherever the player stands) so
 * a body already at camp and one still deciding whether the walk is worth
 * it never disagree about what camp offers.
 */
export function fireStep(state: GameState, world: World, cal: Calendar, at: number): Step | null {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (st.fire.lit) return null;
  if (!st.structures.firePit) {
    return check(state, world, cal, "build", "firePit", at).ok ? { id: "build", arg: "firePit", step: "laying a fire pit" } : null;
  }
  // The body's own choice of method, allowed to a reflex: the fire indoors where a hut or a hearth stands, the pit otherwise.
  const indoors = st.structures.turfHut || (st.structures.cabin && st.structures.hearth);
  if (indoors && check(state, world, cal, "lightIndoors", undefined, at).ok) return { id: "lightIndoors", step: "lighting the fire indoors" };
  if (check(state, world, cal, "light", undefined, at).ok) return { id: "light", step: "lighting the fire" };
  const firewood = qty(state.player.pack, "firewood") + qty(pile(state, at), "firewood");
  if (hasTool(p, "fireDrill") && firewood < 1 && check(state, world, cal, "split", undefined, at).ok) {
    return { id: "split", step: "splitting a log for the fire" };
  }
  return null;
}

/**
 * Whether this region's camp can actually warm a cold body: a fire already
 * lit, a roof over it, or a fire step still waiting there. A camp with none
 * of these cannot help; the cold need does not send the runner to a rest
 * that only makes it colder than working would have.
 */
function campCanWarm(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (fireWarms(st) || roofed(st)) return true;
  return fireStep(state, world, cal, st.campCell) !== null;
}

/** Walk to this region's camp, make a fire if the means are here, then sleep or rest. */
function campStep(state: GameState, world: World, cal: Calendar, it: Intent, need: "sleep" | "cold" | "spent"): Step {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const here = cellOf(state, world);
  if (here !== st.campCell) {
    // A walk home to lie down by day says what it is, the way the sleep step does.
    const why = need === "sleep" ? (cal.isNight ? " for the night" : " to doze") : need === "cold" ? " to warm up" : " for the evening";
    if (check(state, world, cal, "walk", `cell:${st.campCell}`).ok) return walkStep(state, world, st.campCell, why);
    const s: Step = need === "sleep"
      ? { id: "sleep", step: "sleeping where {you} {stand}; no way to camp" }
      : need === "cold"
        ? { id: "rest", step: "resting to warm up; no way to camp" }
        : { id: "rest", step: "resting after the day's work; no way to camp" };
    if (!isRunning(state, s) && need === "sleep") log(state, "No way to camp from here. {You} {sleep} where {you} {are}.", "bad");
    return s;
  }
  const fs = fireStep(state, world, cal, st.campCell);
  if (fs) return fs;
  if (need === "sleep") {
    // A sleep that starts in daylight at camp is a doze by the fire and says
    // so, so an away report that reads forty minutes of it at two in the
    // afternoon is telling the truth. The wording is set when the task
    // starts, so a doze that runs into the night keeps its word for it.
    const s: Step = { id: "sleep", step: cal.isNight ? "sleeping" : "dozing by the fire" };
    if (!isRunning(state, s) && st.campCell !== it.campCell) log(state, `{You} {turn} in at camp in ${regionAt(world, p.region).name}.`);
    return s;
  }
  if (need === "cold") return { id: "rest", step: st.fire.lit ? "warming up by the fire" : "resting to warm up" };
  return { id: "rest", step: st.fire.lit ? "resting by the fire after the day's work" : "resting after the day's work" };
}

/** Eat what is in reach, walking the order until the hungry line is passed or nothing is left to take; else go where the food is; else nothing. Force is set: the runner eats regardless of the player's auto-eat toggle. */
function hungryStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent): Step | null {
  const before = state.player.kcal;
  autoEat(state, world, rng, true);
  if (state.player.kcal > before) return null;
  if (cellOf(state, world) === it.campCell) return null;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => edible(state, f) && qty(camp, f) > 1e-9)) return null;
  if (!check(state, world, cal, "walk", `cell:${it.campCell}`).ok) return null;
  return walkStep(state, world, it.campCell, " to eat");
}

/** Arrows a bow hunt carries out of camp. */
export const ARROWS_TO_CARRY = 10;

/**
 * Items an order carries out of camp to do its work, rather than gathering
 * or crafting toward a stock left there: a keep on one of these is still a
 * promise about camp, but the pack is where camp's kit sits while a live
 * order has it out, so a keep on it has to count the pack too.
 */
export const KIT_ITEMS = new Set<ItemId>(["arrow", "snare"]);

/** What the live order needs in the pack beside food: arrows for a bow hunt, snares for a set-snares job, a basket for a set-trap job, sticks for a seep dug away from camp. */
export function orderKit(state: GameState): ItemId[] {
  const it = state.intent;
  if (it?.task === "hunt" && hasTool(state.player, "bow")) return ["arrow"];
  if (it?.task === "build" && it.arg === "snare") return ["snare"];
  if (it?.task === "build" && it.arg === "seep") return ["stick"];
  if (it?.task === "setTrap") return ["basketTrap"];
  return [];
}

/** How many snares this intent still needs: its times target minus what it has already set, floored at one and capped at MAX_SNARES so a stray target never over-pockets. An intent with no times target (a once build, or one started by hand) has no target to read, so it takes one. */
function snaresWanted(it: Intent): number {
  const left = it.until.kind === "times" ? it.until.n - it.done : 1;
  return Math.min(MAX_SNARES, Math.max(1, left));
}

/**
 * Pockets the live order's kit - arrows for a bow hunt, snares for a set-snares job,
 * a basket for a set-trap job - from the camp pile, when standing at the intent's
 * camp cell. Returns how many it moved, so a start that turns out illegal can hand
 * them straight back.
 */
export function provisionKit(state: GameState, world: World): number {
  const it = state.intent;
  if (!it || cellOf(state, world) !== it.campCell) return 0;
  // The tool the work swings, when none is in hand and the camp pile holds
  // one: taken up here on the way out. A tool in hand is never put down, so
  // this is not undone when the start fails; the kit below is. Vessels are
  // left to the fill task's own rule.
  const need = it.task === "fill" ? null : toolFor(it.task, it.arg);
  if (need === "axe") {
    if (!axeInHand(state.player)) for (const id of AXES) if (takeUp(state, world, id)) { log(state, `{You} {take} up the ${TOOLS[id].name}.`); break; }
  } else if (need && !hasTool(state.player, need) && takeUp(state, world, need)) log(state, `{You} {take} up the ${TOOLS[need].name}.`);
  const kit = orderKit(state);
  const pack = state.player.pack;
  const camp = pile(state, it.campCell);
  if (kit.includes("arrow")) {
    const want = ARROWS_TO_CARRY - qty(pack, "arrow");
    if (want <= 0) return 0;
    // Arrows are 0.05 kg each; ten weigh half a kilo, never worth a pack-room guard.
    return transfer(camp, pack, "arrow", Math.min(want, qty(camp, "arrow")));
  }
  if (kit.includes("snare")) {
    const want = snaresWanted(it) - qty(pack, "snare");
    if (want <= 0) return 0;
    return transfer(camp, pack, "snare", Math.min(want, qty(camp, "snare")));
  }
  if (kit.includes("basketTrap")) {
    if (qty(pack, "basketTrap") >= 1) return 0;
    return transfer(camp, pack, "basketTrap", Math.min(1, qty(camp, "basketTrap")));
  }
  if (kit.includes("stick")) {
    const want = STRUCTURES.seep.needs[0].qty - qty(pack, "stick");
    if (want <= 0) return 0;
    return transfer(camp, pack, "stick", Math.min(want, qty(camp, "stick")));
  }
  return 0;
}

/**
 * Lunch for the day: at the home camp, pocket safe food from the pile up to
 * PROVISION_KG in the pack, never past the comfortable load. `want` and `kg`
 * below read `qty` as kilos directly: every item in PROVISIONS has
 * ITEM_KG === 1, so a count and its weight are the same number.
 */
export function provision(state: GameState, world: World): void {
  const it = state.intent;
  if (!it || cellOf(state, world) !== it.campCell) return;
  const pack = state.player.pack;
  const camp = pile(state, it.campCell);
  let want = PROVISION_KG - PROVISIONS.reduce((a, f) => a + qty(pack, f), 0);
  let room = body(state).packComfortableKg - weight(pack);
  for (const f of PROVISIONS) {
    if (want <= 1e-9 || room <= 1e-9) break;
    const kg = Math.min(want, room, qty(camp, f)) / ITEM_KG[f];
    if (kg <= 1e-9) continue;
    const moved = transfer(camp, pack, f, kg);
    want -= moved;
    room -= moved;
  }
  // A waterside camp tops off every vessel along with lunch, the same errand.
  if (waterSource(state, world)) fillVessels(state, world);
  provisionKit(state, world);
  quiverUp(state, world);
}

/**
 * Arrows go in the pack whenever the bow leaves camp, whatever the errand
 * is. A bow hunt is legal only with arrows in the pack, or standing on the
 * camp cell with arrows in the pile, and provisionKit fills the quiver only
 * once a hunt is already the live order. So a survivor anywhere but camp
 * reads every named hunt as "needs arrows in the pack", and a named hunt at
 * the foot of the list - which only ever gets its turn when everything above
 * it is met or blocked, and by then the runner is usually out at the shore
 * or in the forest - was never once served. Nobody who owns a bow walks out
 * of camp without arrows.
 */
function quiverUp(state: GameState, world: World): void {
  const p = state.player;
  if (!hasTool(p, "bow")) return;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const want = ARROWS_TO_CARRY - qty(p.pack, "arrow");
  if (want <= 0) return;
  transfer(camp, p.pack, "arrow", Math.min(want, qty(camp, "arrow")));
}
