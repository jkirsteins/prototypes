import { clamp } from "../units";
import { cellAt, type World } from "../world/gen";
import { speedOf } from "../world/route";
import type { Calendar } from "./calendar";
import { type Exposure, garmentWet, skinExposure, stepGarments, wetFactor } from "./clothing";
import { fireWarmth, fireWarms, SMOKE_COUGH, SMOKE_DEADLY, SMOKE_DRAIN_PER_HOUR } from "./fire";
import { carried } from "./inventory";
import { CLOTHING, KCAL_FULL } from "./items";
import { creditBurn, creditTime } from "./ledger";
import { lightFactor, skyLux, TORCH_LUX, WALK_LUX } from "./light";
import { log, warn } from "./log";
import { BIG_EATER_BURN, body, fatLandmarks, hasQuirk, massFactor, personOf } from "./person";
import { atCamp, cellOf, hereTerrain, watersideCell } from "./position";
import { fillDied, record } from "./record";
import { regionState, siteAt } from "./regionstate";
import { speedFactor } from "./skills";
import { debtFallHalved, debtStep, sleepiness, SLEEPY_AT, SPENT_AT } from "./sleep";
import type { DeathCause, GameState, IceMode, Site, Task, TaskId, Terrain, Weather } from "./types";
import { ICE_SHORE_CM, THIRSTY_L, stepWater } from "./water";
import { DEEP_SNOW_CM, ICE_SAFE_CM, stormNow } from "./weather";

/** Tasks done at camp, by the fire and under the roof. */
const CAMP_TASKS = new Set<TaskId>([
  "rest", "night",
  "sleep", "craft", "cook", "split", "splitWedges", "repair", "build", "mend", "light", "lightTorch", "sharpen", "hone", "melt", "thaw", "lightIndoors", "hang", "crack", "grindBark",
]);

/** Awake hours that are not work: the ledger counts everything else on a task as a working minute. */
const IDLE_TASKS = new Set<TaskId>(["rest", "night", "sleep"]);

export type Activity = "sleep" | "rest" | "light" | "walk" | "heavy";

export function activityOf(task: Task | null): Activity {
  if (!task) return "rest";
  switch (task.id) {
    case "sleep": return "sleep";
    case "rest": case "night": case "craft": case "cook": case "repair": case "sharpen": case "hone": case "light": case "lightTorch": case "melt": case "thaw": case "lightIndoors": case "crack": case "grindBark": return "rest";
    case "sticks": case "bark": case "stone": case "berries": case "eggs": case "innerBark": case "roots": case "tapSap": case "seaweed": case "deadwood": case "hunt": case "findDen": case "fish": case "fill": case "hang": case "read": case "setTrap": case "emptyTrap": case "makeCamp": return "light";
    case "travel": case "walk": case "haul": case "explore": case "searchHome": return "walk";
    case "chop": case "split": case "splitWedges": case "build": case "mend": case "iceHole": return "heavy";
  }
}

export function isCampTask(task: Task | null): boolean {
  return !task || CAMP_TASKS.has(task.id);
}

/** The roof's own warmth, whichever roof stands, regardless of a snow shelter beside it: cabin over turf hut over lean-to. */
export function roofBonus(site: Site | null): number {
  if (!site) return 0;
  if (site.structures.cabin) return 15;
  if (site.structures.turfHut) return 10;
  if (site.structures.leanTo) return 5;
  return 0;
}

/** Degrees of comfort the shelter gives, for someone at camp doing camp things. */
export function shelterBonus(site: Site | null): number {
  if (!site) return 0;
  if (site.structures.snowShelter && !site.structures.cabin && !site.structures.turfHut) return 0;
  return roofBonus(site);
}

/**
 * True when the player is under a roof: doing camp things on a cell something
 * shelter-shaped stands on. The roof is the one under the survivor's feet, the
 * same one feltTemperature reads, so a lean-to left behind at an old camp still
 * keeps the rain off whoever walks back into it.
 */
export function sheltered(state: GameState, world: World): boolean {
  const site = siteAt(regionState(state, world, state.player.region), cellOf(state, world));
  if (!site) return false;
  return isCampTask(state.task) && (site.structures.cabin || site.structures.leanTo || site.structures.turfHut || site.structures.snowShelter);
}

/** True with a lit torch in hand or beside your own lit fire: the light wolves keep away from. */
export function firelit(state: GameState, world: World): boolean {
  if (state.player.torch.lit) return true;
  const r = regionState(state, world, state.player.region);
  return atCamp(state, world) && r.fire.lit;
}

export function insulation(state: GameState): number {
  let sum = 0;
  for (const g of state.player.clothing) sum += CLOTHING[g.id].insulation * clamp(g.durability, 0, 100) / 100 * wetFactor(g);
  return sum;
}

/** True while lying or sitting still: the time bedding is in use. */
export function bedded(task: Task | null): boolean {
  return task?.id === "sleep" || task?.id === "rest";
}

/** What a blanket adds while you lie under it, scaled by its wear. */
export function beddingInsulation(state: GameState): number {
  let sum = 0;
  for (const g of state.player.clothing) sum += (CLOTHING[g.id].sleep ?? 0) * clamp(g.durability, 0, 100) / 100;
  return sum;
}

/** Degrees the bed under you gives while you sleep on it; a bed is laid at camp. */
export const BOUGH_BED_C = 4;

/** Kilocalories in a kilogram of body fat, 9 kcal a gram: the unit the fat reserve is weighed in. */
export const FAT_KCAL_PER_KG = 9000;

/** How far into the failing range - lower landmark down to the floor - each word waits for. */
const FAT_THIN = 0.25;
export const FAT_RIBS = 0.5;
export const FAT_WASTING = 0.75;

/**
 * How far the body has fallen into its failing range: nothing at the lower
 * landmark and above, total at the floor it dies on. A naturally lean body
 * sitting in its settling zone is not starving and reads zero, which is what
 * makes this safe to feed to warmth, work speed and the body's own words.
 */
export function starvation(state: GameState): number {
  const l = fatLandmarks(personOf(state));
  return clamp((l.lower - state.player.fat) / (l.lower - l.floor), 0, 1);
}

/**
 * Air inside a walled shelter with its fire lit. A turf hut with a hearth
 * stays above freezing at -30 C outside; a chinked cabin sits at 10 to 15
 * by the fire. The outside air is the floor's lower bound, never its
 * ceiling: a hut in July is July. The cabin row is reachable only where a
 * cabin has a hearth, and the hearth has no build entry yet, so the row
 * waits on the shelter ladder that adds one.
 */
export const INDOOR_C = { turfHut: 5, cabin: 10 } as const;

/** The floor a snow shelter holds with no fire: Kochanski's -3 to -5 C at the ground under good snow. */
export const SNOW_FLOOR_C = -3;

export function feltTemperature(state: GameState, world: World, ambient: number): number {
  const p = state.player;
  const r = regionState(state, world, p.region);
  // A roof is a roof wherever it stands: the camp's, or one the survivor
  // moved away from and has walked back into out of the rain.
  const here = siteAt(r, cellOf(state, world));
  const camp = atCamp(state, world);
  const campTask = isCampTask(state.task);
  // A cabin holds its room temperature only once the fire has a hearth to
  // burn on: without one the fire is at the pit outside, and the walls are a
  // roof and no more.
  const inCabin = here?.structures.cabin && here.structures.hearth;
  // Warm indoor air comes from the camp's own fire burning inside these walls; a hut
  // standing at a site the survivor left is a cold roof, whatever the camp's fire is doing.
  const indoors = camp && campTask && r.fire.lit && r.fire.indoors && (here?.structures.turfHut || inCabin);
  const inSnow = campTask && here?.structures.snowShelter && !indoors;
  let felt: number;
  if (indoors) {
    felt = Math.max(ambient, inCabin ? INDOOR_C.cabin : INDOOR_C.turfHut) + insulation(state);
  } else if (inSnow) {
    // A snow shelter's ground floor and a roof's open-air bonus do not stack; a camp
    // with both stands under whichever is warmer at this ambient, not colder than
    // either alone - reachable whenever a hut or cabin stands but its fire is unlit,
    // since nothing clears a snow shelter but three warm days in a row.
    const withSnow = Math.max(ambient, SNOW_FLOOR_C);
    const withRoof = ambient + roofBonus(here);
    felt = Math.max(withSnow, withRoof) + insulation(state);
  } else {
    felt = ambient + insulation(state);
    // A room at its temperature is the shelter's whole gift; the bonus is for a roof with no warm air under it.
    if (campTask) felt += shelterBonus(here);
  }
  // The fire is the camp's: there is no fire burning at a site the survivor left.
  if (camp && fireWarms(r)) felt += fireWarmth(r.fire, campTask);
  if (bedded(state.task)) felt += beddingInsulation(state);
  if (state.task?.id === "sleep" && here?.structures.boughBed) felt += BOUGH_BED_C;
  const a = activityOf(state.task);
  felt += a === "heavy" ? 6 : a === "walk" ? 4 : a === "light" ? 2 : 0;
  felt -= 0.15 * p.wetness;
  if (stormNow(state.weather, state.minute)) felt -= 6;
  // A starving body has no insulation and no fuel: up to 4 C gone at the end of the fat.
  felt -= 4 * starvation(state);
  return felt;
}

/** Work goes slower when exhausted or hurt, and faster with practice. */
export function workSpeed(state: GameState, world: World): number {
  const p = state.player;
  let f = 1;
  if (p.energy < 20) f *= 0.5;
  if (p.injured > 0) f *= 0.7;
  if (p.water < THIRSTY_L) f *= 0.8;
  f *= 1 - 0.5 * starvation(state);
  const t = state.task;
  if (t) f *= speedFactor(state, world, t.id, t.arg);
  if (p.frostbite.feet > 0 && activityOf(state.task) === "heavy") f *= 0.7;
  const r = regionState(state, world, p.region);
  if (atCamp(state, world) && r.smoke > SMOKE_COUGH) f *= 0.7;
  return f;
}

/** Base walking speed in km/h before the ground: open forest, this weather, this load, this body. */
export function baseWalkSpeed(state: GameState, cal: Calendar, weather: Weather, loadKg = carried(state.player)): number {
  let v = 3.0;
  if (weather.snowCm > DEEP_SNOW_CM) v *= 0.5;
  // The dark slows the feet by the light there is, not by the clock: the
  // handbook's reading is what a pitch-dark night costs, and a moonlit
  // snowfield or a torch in hand buys most of the pace back.
  v *= lightFactor(skyLux(cal, weather.clear, weather.snowCm) + (state.player.torch.lit ? TORCH_LUX : 0), WALK_LUX, NIGHT_WALK_FACTOR);
  const d = body(state);
  if (loadKg > d.packHardKg) v *= 0.6;
  else if (loadKg > d.packComfortableKg) v *= 0.8;
  if (state.player.energy < 20) v *= 0.7;
  if (state.player.frostbite.feet > 0) v *= 0.6;
  if (state.player.toes) v *= 0.85;
  return v;
}

/** The most meaningful real penalty affecting the current walking pace. */
export function walkManner(state: GameState, world: World, cal: Calendar): string {
  const p = state.player;
  const terrain = hereTerrain(state, world);
  const loadKg = carried(p);
  const limits = body(state);
  const lux = skyLux(cal, state.weather.clear, state.weather.snowCm) + (p.torch.lit ? TORCH_LUX : 0);
  if (p.frostbite.feet > 0 || p.toes) return "limping";
  if (state.weather.snowCm > DEEP_SNOW_CM) return "struggling through deep snow";
  if (loadKg > limits.packHardKg) return "struggling under the load";
  if (lightFactor(lux, WALK_LUX, NIGHT_WALK_FACTOR) < 0.8) return "walking carefully in the dark";
  if (loadKg > limits.packComfortableKg) return "walking under a heavy load";
  if (terrain === "water" && state.route?.ice !== "none") return "crossing the ice";
  if (terrain === "fell") return "climbing the fell";
  if (terrain === "bog") return "picking through the bog";
  if (terrain === "rock") return "picking over rock";
  return "walking";
}

/** Walking speed in km/h on this ground, right now, with this load; a water cell needs the route's ice mode. */
export function walkSpeed(state: GameState, cal: Calendar, weather: Weather, terrain: Terrain, loadKg = carried(state.player), ice: IceMode = "none"): number {
  return baseWalkSpeed(state, cal, weather, loadKg) * speedOf(terrain, ice);
}

/**
 * The share of a task's work above base that is the body being moved, and so
 * scales with total mass. A task absent from this table does not scale with
 * mass at all - work done standing in one place costs what it costs whoever
 * is doing it, and a heavier body pays for its reserve through the resting
 * burn instead.
 *
 * The walk activity itself (walk, travel, haul, explore, searchHome, by
 * activityOf) is charged separately, in stepPlayer's walk branch, where
 * `burn *= massFactor(state)` already scales all of it - this table covers
 * only work done on the feet that is not the walk itself, so a walk-class
 * task must not carry a row here.
 *
 * Same convention as NIGHT_WORK in light.ts: absence means the effect does
 * not apply.
 */
export const ON_THE_FEET: Partial<Record<TaskId, number>> = {
  hunt: 0.6, berries: 0.4, roots: 0.4, sticks: 0.4, deadwood: 0.4, seaweed: 0.4, stone: 0.4,
};

/**
 * Flat kcal/h for activities that do not depend on the ground. Heavy is axe
 * work by the MET tables (6 to 7 MET at 72 kg), under the Swedish
 * handbook's 700 for a hard march or heavy work.
 */
const KCAL_PER_HOUR: Record<Exclude<Activity, "walk">, number> = { sleep: 70, rest: 100, light: 200, heavy: 500 };
export const KCAL_PER_HOUR_FOR_TEST = KCAL_PER_HOUR;
/**
 * Base kcal/h for walking on ground at ordinary (open-forest) speed; the
 * ground and load scale it from here. Walking at three kilometres an hour
 * is 200 to 250 kcal/h for a fit adult, so below 200 a walk would cost less
 * than steady work standing still.
 */
export const WALK_KCAL_PER_HOUR = 200;
/**
 * The body's resting burn, every hour of the day asleep or not: the sleep
 * rate, which over 24 hours is 1,680 kcal, a fit adult's resting burn.
 * The ledger's base bucket; what an activity costs is counted above it.
 */
export const BASE_KCAL_PER_HOUR = KCAL_PER_HOUR.sleep;
/**
 * What a load adds to an hour's walking: the Swedish handbook's 545 kcal/h
 * at 4 km/h with 27 kg against 240 unloaded, so 300 over the hard limit
 * and half that over the comfortable one.
 */
export const LOAD_KCAL_PER_HOUR = { comfortable: 150, hard: 300 } as const;
/**
 * Burn under a felt temperature below zero, as a multiple of the burn
 * before it: 2 percent a degree, capped at double. 1.3 at -15; 1.6 at
 * -30, which with a working day reads the handbook's 6,000 kcal for a
 * week at -30 to -40 C.
 */
export function coldBurnFactor(felt: number): number {
  return Math.min(2, 1 + 0.02 * Math.max(0, -felt));
}
/** Walking in the pitch dark with no torch: the Swedish handbook's 1 km/h in terrain against 3 by day. */
export const NIGHT_WALK_FACTOR = 1 / 3;
/** Burn while sick, as a multiple of the burn before it. */
export const SICK_BURN_FACTOR = 1.2;

export interface Drains { starve: number; cold: number; sick: number; thirst: number; smoke: number }

/** Felt temperature at which a clothed body at rest holds half its warmth. */
export const COMFORT_C = 5;
/** Share of the gap to the target closed per minute. */
export const WARMTH_RATE = 0.012;
/** Snow on wool never gets you wetter than damp. */
export const SNOW_DAMP_MAX = 30;

/** The warmth a body settles at for a felt temperature: 50 at comfort, 100 ten degrees above, 0 ten below. A heavy body's comfort sits a degree lower per grade. */
export function warmthTarget(felt: number, comfortC = COMFORT_C): number {
  return clamp(50 + (felt - comfortC) * 5, 0, 100);
}

/** Energy an hour: asleep, at camp work (the rest activity class on a task), and the explicit rest task. A task's own drain is this body's, below. */
export const ENERGY_RATE = { sleep: 12.5, camp: -4, rest: 6, restSpent: 4 };

/**
 * Fatigue a task drains an hour for a body whose working day is this long:
 * enough that a fresh body ends its own day of task work on the spent line
 * and no lower. The strength axis sets workHours, so a strong body's day is
 * eleven hours and a weak one's nine with no count kept anywhere, and the
 * card's "works ten hours" is the drain rather than a clock.
 */
export function taskDrain(workHours: number): number {
  return (100 - SPENT_AT) / workHours;
}

/**
 * One step of the body: kcal, warmth, the two sleep processes, wetness,
 * clothing wear, health. dt is at most one minute. Returns the health drains
 * so a death can be named.
 */
export function stepPlayer(state: GameState, world: World, cal: Calendar, ambient: number, dt: number): Drains {
  const p = state.player;
  const d = body(state);
  const l = fatLandmarks(personOf(state));
  const r = regionState(state, world, p.region);
  const w = state.weather;
  const felt = feltTemperature(state, world, ambient);
  const a = activityOf(state.task);
  const camp = atCamp(state, world);
  const campTask = isCampTask(state.task);
  const roof = sheltered(state, world);
  // Walls are the walls the survivor is standing inside, the same place roof reads.
  const site = siteAt(r, cellOf(state, world));
  const walled = roof && (site?.structures.cabin || site?.structures.turfHut || site?.structures.snowShelter);
  const h = dt / 60;

  const x: Exposure = {
    raining: w.precip !== "none",
    heavy: w.precip === "heavy",
    snowing: w.precip !== "none" && ambient <= 0,
    roof,
    walled: !!walled,
    fireAtCamp: r.fire.lit && camp && campTask,
    bedded: bedded(state.task),
    storm: stormNow(w, state.minute),
  };
  stepGarments(state, x, dt);

  // Kilocalories, in the ledger's buckets: base for every hour, the activity
  // or the walk above it, then the cold and the sickness increments on top.
  let burn: number;
  if (a === "walk") {
    burn = WALK_KCAL_PER_HOUR / Math.max(0.25, speedOf(hereTerrain(state, world), state.route?.ice ?? "none"));
    if (w.snowCm > DEEP_SNOW_CM) burn *= 2;
    // Moving the body costs what the body weighs. The load below is charged
    // separately and more steeply: a pack on the back is carried far less
    // efficiently than the body carrying it.
    burn *= massFactor(state);
    if (carried(p) > d.packHardKg) burn += LOAD_KCAL_PER_HOUR.hard;
    else if (carried(p) > d.packComfortableKg) burn += LOAD_KCAL_PER_HOUR.comfortable;
  } else {
    burn = KCAL_PER_HOUR[a];
  }
  // The base is this body's resting burn and the work above it is scaled by its strength.
  const eats = hasQuirk(state, "bigEater") ? BIG_EATER_BURN : 1;
  // Work that moves the body scales with what the body weighs; the rest is effort, and strength is the axis for that.
  const feet = a === "walk" ? 0 : (state.task && ON_THE_FEET[state.task.id]) || 0;
  const above = (burn - BASE_KCAL_PER_HOUR) * d.workBurn * eats * (1 + (massFactor(state) - 1) * feet);
  // The reserve is mass the body carries everywhere, so resting costs more for a body that has one.
  const base = BASE_KCAL_PER_HOUR * massFactor(state) * eats;
  burn = base + above;
  const afterCold = burn * coldBurnFactor(felt);
  const afterSick = p.sick > 0 ? afterCold * SICK_BURN_FACTOR : afterCold;
  creditBurn(state, {
    base: base * h,
    activity: a === "walk" ? 0 : above * h,
    walk: a === "walk" ? above * h : 0,
    cold: (afterCold - burn) * h,
    sick: (afterSick - afterCold) * h,
  });
  creditTime(state, a === "sleep" ? "sleep" : state.task && !IDLE_TASKS.has(state.task.id) ? "work" : "idle", dt);
  // The energy store pays every minute's burn regardless of what the
  // stomach shows; fullness is drained the same amount, separately, and
  // simply has nowhere to go once it hits empty. The two agree only on a
  // day when eating exactly kept pace with burning.
  const kcalBurn = afterSick * h;
  p.fat -= kcalBurn;
  p.kcal = clamp(p.kcal - kcalBurn, 0, KCAL_FULL);

  const thirst = stepWater(state, felt, dt);

  // Warmth settles toward the level the felt temperature can hold, with a
  // time constant of about an hour and a half: a body in balance, not a leak.
  const target = warmthTarget(felt, d.comfortC);
  p.warmth = clamp(p.warmth + (target - p.warmth) * WARMTH_RATE * dt, 0, 100);

  // Sleep debt, the homeostatic process: the clock builds it and only sleep
  // pays it, so a felling day and a sewing day are equally long awake and
  // an evening by the fire gives none of it back. A light sleeper on a windy
  // night clears it at half the rate.
  const asleep = a === "sleep";
  p.sleepDebt = debtStep(p.sleepDebt, asleep, dt, asleep && debtFallHalved(state));

  // Fatigue: what the work drains and what rest and sleep give back. The
  // budget balances at eight hours - twelve on a task and four of camp work
  // drain what eight asleep restore - so a working day ends tired and a grind
  // day needs nine.
  const energyRate = asleep ? ENERGY_RATE.sleep
    : a === "rest" && state.task?.id === "rest" ? (p.energy < 20 ? ENERGY_RATE.restSpent : ENERGY_RATE.rest)
    : a === "rest" ? ENERGY_RATE.camp
    : -taskDrain(d.workHours);
  p.energy = clamp(p.energy + energyRate * h, 0, 100);

  // Wetness.
  if (x.raining && !x.walled) {
    let wet = x.heavy ? 2 : 1;
    if (x.roof) wet *= 0.5;
    // Snow brushes off; it dampens rather than soaks.
    const cap = x.snowing ? SNOW_DAMP_MAX : 100;
    if (x.snowing) wet *= 0.25;
    // A dry coat and trousers keep the rain off the skin; only a soaked layer lets it through.
    wet *= skinExposure(state);
    p.wetness = clamp(p.wetness + wet * dt, 0, Math.max(p.wetness, cap));
  } else {
    const dry = x.fireAtCamp ? 1.5 : x.roof ? 0.5 : x.raining ? 0 : 0.3;
    p.wetness = clamp(p.wetness - dry * dt, 0, 100);
  }

  // Clothing wears when worn outdoors; bedding only while it is out of the pack.
  if (!roof) {
    const wear = (x.raining ? 1.0 : 0.5) * h;
    const inUse = bedded(state.task);
    for (const g of p.clothing) {
      if (CLOTHING[g.id].slot === "blanket" && !inUse) continue;
      const soaked = garmentWet(g) > 50 ? 1.5 : 1;
      g.durability = clamp(g.durability - wear * soaked, 0, 100);
    }
  }

  // Statuses tick down.
  if (p.sick > 0) p.sick = Math.max(0, p.sick - dt);
  if (p.injured > 0) p.injured = Math.max(0, p.injured - dt);
  // Frostbite only heals hours under a roof by a lit fire at camp; otherwise it holds.
  if (roof && r.fire.lit && camp) {
    if (p.frostbite.feet > 0) p.frostbite.feet = Math.max(0, p.frostbite.feet - dt);
    if (p.frostbite.hands > 0) p.frostbite.hands = Math.max(0, p.frostbite.hands - dt);
  }

  // Only a lit torch burns. A put-out stub stays equipped with its fuel.
  if (p.torch.lit) {
    p.torch.minutes = Math.max(0, p.torch.minutes - dt);
    if (p.torch.minutes === 0) {
      p.torch.lit = false;
      log(state, "The torch gutters out.");
    }
  }

  // Health.
  const drains: Drains = { starve: 0, cold: 0, sick: 0, thirst, smoke: 0 };
  // The floor is essential fat: structure, not fuel. A body at it is dying,
  // however much weight is still on it.
  if (p.kcal <= 0 && p.fat <= l.floor) drains.starve = 2 * h;
  if (p.warmth < 20) drains.cold = 6 * h;
  if (p.sick > 0 && !(roof && felt >= 10)) drains.sick = 0.5 * h;
  const smoking = camp && state.task?.id === "sleep" && r.smoke > SMOKE_DEADLY;
  if (smoking) drains.smoke = (SMOKE_DRAIN_PER_HOUR / 60) * dt;
  const total = drains.starve + drains.cold + drains.sick + drains.thirst + drains.smoke;
  if (total > 0) {
    p.health = clamp(p.health - total, 0, 100);
  } else if (p.kcal > 1500 && p.warmth > 40 && p.sick === 0 && p.water > THIRSTY_L) {
    p.health = clamp(p.health + 1 * h, 0, 100);
  }

  // Milestone warnings, once per crossing.
  // Starving is the fat reserve going, not the stomach: the stomach empties
  // whenever the food runs out, and autoEat says so at the meal line.
  // The words track the failing range, so a lean body in its settling zone is
  // not told its ribs show.
  const failing = starvation(state);
  warn(state, "kcal", failing >= 0.5, "{You} {are} starving.");
  warn(state, "thin", failing > FAT_THIN, "{You} {are} getting thin.");
  warn(state, "ribs", failing > FAT_RIBS, "{Your} ribs show.");
  warn(state, "wasting", failing > FAT_WASTING, "{You} {are} wasting away.");
  warn(state, "warm", p.warmth < 30, "{You} {are} shivering hard. Find warmth.");
  warn(state, "wet", p.wetness >= 60, "{You} {are} soaked through.");
  warn(state, "tired", p.energy < 20, "{You} can barely lift {your} arms. Sleep.");
  warn(state, "sleepy", sleepiness(p.sleepDebt, cal.hour) >= SLEEPY_AT, "{You} can barely keep {your} eyes open.");
  // The evening by the fire announces itself the way the yawn does, and it is
  // news rather than a warning.
  warn(state, "spent", p.energy < SPENT_AT, "A day's work done. Time to rest by the fire.", "plain");
  warn(state, "thirst", p.water < THIRSTY_L, "{You} {are} thirsty.");
  const here = cellOf(state, world);
  const onThinIce = cellAt(world, here).terrain === "water" && w.iceCm < ICE_SAFE_CM;
  warn(state, "thinice", onThinIce, "The ice is thin here.");
  warn(state, "icedover", watersideCell(world, here) && w.iceCm >= ICE_SHORE_CM, "The shore is iced over.");
  warn(state, "smoke", camp && r.smoke > SMOKE_COUGH, "The fire is smoking the place out.");
  warn(state, "co", smoking, "The air is thick. {You} {wake} coughing.");

  return drains;
}

/** Names the death from the drains that killed: the largest of them. */
export function causeFrom(d: Drains): DeathCause {
  const worst = (Object.entries(d) as [keyof Drains, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const named: Record<keyof Drains, DeathCause> = { starve: "starved", cold: "froze", sick: "sickness", thirst: "thirst", smoke: "smoke" };
  return named[worst];
}

/** What the log says, and the death screen's cause paragraph, for each way to go: one table so the two always agree. */
export const DEATH_LINES: Record<DeathCause, string> = {
  starved: "{You} starved.",
  froze: "The cold took {you}.",
  wolves: "The wolves finished it.",
  sickness: "The fever won.",
  thirst: "Thirst took {you}.",
  smoke: "The smoke took {you} in {your} sleep.",
  drowned: "The ice gave way. The lake kept {you}.",
  gaveUp: "{You} sat down by the cold fire and did not get up.",
};

export function die(state: GameState, cause: DeathCause, regionName = ""): void {
  if (state.dead) return;
  fillDied(state, cause, regionName);
  state.dead = { cause, minute: state.minute };
  state.advanceCarry = 0;
  state.task = null;
  log(state, DEATH_LINES[cause], "bad");
}

/** Giving up: a death like any other, named gave up, with its own line in the record. */
export function abandon(state: GameState, regionName = ""): void {
  record(state, { kind: "abandoned" });
  die(state, "gaveUp", regionName);
}
