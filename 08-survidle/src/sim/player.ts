import { PACK_COMFORTABLE_KG, PACK_HARD_KG, clamp } from "../units";
import { cellAt, type World } from "../world/gen";
import { speedOf } from "../world/route";
import type { Calendar } from "./calendar";
import { type Exposure, garmentWet, skinExposure, stepGarments, wetFactor } from "./clothing";
import { fireWarmth, fireWarms, SMOKE_COUGH, SMOKE_DEADLY, SMOKE_DRAIN_PER_HOUR } from "./fire";
import { carried } from "./inventory";
import { CLOTHING, KCAL_FULL } from "./items";
import { creditBurn, creditTime } from "./ledger";
import { log } from "./log";
import { atCamp, cellOf, hereTerrain, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { speedFactor } from "./skills";
import type { DeathCause, GameState, IceMode, Player, RegionState, Task, TaskId, Terrain, Weather } from "./types";
import { ICE_SHORE_CM, THIRSTY_L, stepWater } from "./water";
import { DEEP_SNOW_CM, ICE_SAFE_CM, stormNow } from "./weather";

/** Tasks done at camp, by the fire and under the roof. */
const CAMP_TASKS = new Set<TaskId>([
  "rest", "night", "wait", // a waiting body burns at the camp rate too, the same as rest and night
  "sleep", "craft", "cook", "split", "repair", "build", "light", "lightTorch", "sharpen", "melt", "thaw", "lightIndoors", "hang",
]);

/** Awake hours that are not work: the ledger counts everything else on a task as a working minute. */
const IDLE_TASKS = new Set<TaskId>(["rest", "night", "wait", "sleep"]);

export type Activity = "sleep" | "rest" | "light" | "walk" | "heavy";

export function activityOf(task: Task | null): Activity {
  if (!task) return "rest";
  switch (task.id) {
    case "sleep": return "sleep";
    case "rest": case "night": case "wait": case "craft": case "cook": case "repair": case "sharpen": case "light": case "lightTorch": case "melt": case "thaw": case "lightIndoors": return "rest";
    case "sticks": case "bark": case "stone": case "berries": case "hunt": case "fish": case "fill": case "hang": return "light";
    case "travel": case "walk": case "haul": return "walk";
    case "chop": case "split": case "build": case "iceHole": return "heavy";
  }
}

export function isCampTask(task: Task | null): boolean {
  return !task || CAMP_TASKS.has(task.id);
}

/** Degrees of comfort the shelter gives, for someone at camp doing camp things. */
export function shelterBonus(r: RegionState): number {
  if (r.structures.cabin) return 15;
  if (r.structures.leanTo) return 5;
  return 0;
}

/** True when the player is under a roof: at camp, doing camp things, with a shelter built. */
export function sheltered(state: GameState, world: World): boolean {
  const r = regionState(state, world, state.player.region);
  return atCamp(state, world) && isCampTask(state.task) && (r.structures.cabin || r.structures.leanTo);
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

/**
 * A fit adult's fat, in kilocalories: about nine kilos at 9 kcal a gram.
 * At a total fast of 3,000 kcal a day that is 27 days before it is gone,
 * the reserve behind the kilocalorie stomach that lets a fed, sheltered
 * beginner last weeks rather than days.
 */
export const FAT_FULL = 80000;

/** Share of the fat reserve gone, 0 (full) to 1 (empty): what a thin body costs elsewhere. */
export function starvation(p: Player): number {
  return 1 - clamp(p.fat, 0, FAT_FULL) / FAT_FULL;
}

export function feltTemperature(state: GameState, world: World, ambient: number): number {
  const p = state.player;
  const r = regionState(state, world, p.region);
  const camp = atCamp(state, world);
  const campTask = isCampTask(state.task);
  let felt = ambient + insulation(state);
  if (camp && fireWarms(r)) felt += fireWarmth(r.fire, campTask);
  if (camp && campTask) felt += shelterBonus(r);
  if (bedded(state.task)) felt += beddingInsulation(state);
  if (camp && state.task?.id === "sleep" && r.structures.boughBed) felt += BOUGH_BED_C;
  const a = activityOf(state.task);
  felt += a === "heavy" ? 6 : a === "walk" ? 4 : a === "light" ? 2 : 0;
  felt -= 0.15 * p.wetness;
  if (stormNow(state.weather, state.minute)) felt -= 6;
  // A starving body has no insulation and no fuel: up to 4 C gone at the end of the fat.
  felt -= 4 * starvation(p);
  return felt;
}

/** Work goes slower when exhausted or hurt, and faster with practice. */
export function workSpeed(state: GameState, world: World): number {
  const p = state.player;
  let f = 1;
  if (p.energy < 20) f *= 0.5;
  if (p.injured > 0) f *= 0.7;
  if (p.water < THIRSTY_L) f *= 0.8;
  f *= 1 - 0.5 * starvation(p);
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
  if (cal.isNight && !state.player.torch.lit) v *= 0.75;
  if (loadKg > PACK_HARD_KG) v *= 0.6;
  else if (loadKg > PACK_COMFORTABLE_KG) v *= 0.8;
  if (state.player.energy < 20) v *= 0.7;
  if (state.player.frostbite.feet > 0) v *= 0.6;
  if (state.player.toes) v *= 0.85;
  return v;
}

/** Walking speed in km/h on this ground, right now, with this load; a water cell needs the route's ice mode. */
export function walkSpeed(state: GameState, cal: Calendar, weather: Weather, terrain: Terrain, loadKg = carried(state.player), ice: IceMode = "none"): number {
  return baseWalkSpeed(state, cal, weather, loadKg) * speedOf(terrain, ice);
}

/** Flat kcal/h for activities that do not depend on the ground: walking is computed separately, by terrain. */
const KCAL_PER_HOUR: Record<Exclude<Activity, "walk">, number> = { sleep: 70, rest: 100, light: 200, heavy: 400 };
/** Base kcal/h for walking on ground at ordinary (open-forest) speed; the ground and load scale it from here. */
const WALK_KCAL_PER_HOUR = 300;
/**
 * The body's resting burn, every hour of the day asleep or not: the sleep
 * rate, which over 24 hours is 1,680 kcal, a fit adult's resting burn.
 * The ledger's base bucket; what an activity costs is counted above it.
 */
export const BASE_KCAL_PER_HOUR = KCAL_PER_HOUR.sleep;
/** Burn under a felt temperature below zero, as a multiple of the burn before it. */
export const COLD_BURN_FACTOR = 1.3;
/** Burn while sick, as a multiple of the burn before it. */
export const SICK_BURN_FACTOR = 1.2;

export interface Drains { starve: number; cold: number; sick: number; thirst: number; smoke: number }

/** Felt temperature at which a clothed body at rest holds half its warmth. */
export const COMFORT_C = 5;
/** Share of the gap to the target closed per minute. */
export const WARMTH_RATE = 0.012;
/** Snow on wool never gets you wetter than damp. */
export const SNOW_DAMP_MAX = 30;

/** The warmth a body settles at for a felt temperature: 50 at comfort, 100 ten degrees above, 0 ten below. */
export function warmthTarget(felt: number): number {
  return clamp(50 + (felt - COMFORT_C) * 5, 0, 100);
}

/**
 * One step of the body: kcal, warmth, energy, wetness, clothing wear, health.
 * dt is at most one minute. Returns the health drains so a death can be named.
 */
export function stepPlayer(state: GameState, world: World, ambient: number, dt: number): Drains {
  const p = state.player;
  const r = regionState(state, world, p.region);
  const w = state.weather;
  const felt = feltTemperature(state, world, ambient);
  const a = activityOf(state.task);
  const camp = atCamp(state, world);
  const campTask = isCampTask(state.task);
  const roof = sheltered(state, world);
  const cabin = roof && r.structures.cabin;
  const h = dt / 60;

  const x: Exposure = {
    raining: w.precip !== "none",
    heavy: w.precip === "heavy",
    snowing: w.precip !== "none" && ambient <= 0,
    roof,
    cabin: !!cabin,
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
    if (carried(p) > PACK_COMFORTABLE_KG) burn += 50;
  } else {
    burn = KCAL_PER_HOUR[a];
  }
  const above = burn - BASE_KCAL_PER_HOUR;
  const afterCold = felt < 0 ? burn * COLD_BURN_FACTOR : burn;
  const afterSick = p.sick > 0 ? afterCold * SICK_BURN_FACTOR : afterCold;
  creditBurn(state, {
    base: BASE_KCAL_PER_HOUR * h,
    activity: a === "walk" ? 0 : above * h,
    walk: a === "walk" ? above * h : 0,
    cold: (afterCold - burn) * h,
    sick: (afterSick - afterCold) * h,
  });
  creditTime(state, a === "sleep" ? "sleep" : state.task && !IDLE_TASKS.has(state.task.id) ? "work" : "idle", dt);
  // Below zero, the shortfall comes out of the fat reserve instead of health.
  const kcalBurn = afterSick * h;
  const shortfall = Math.max(0, kcalBurn - p.kcal);
  p.kcal = clamp(p.kcal - kcalBurn, 0, KCAL_FULL);
  if (shortfall > 0) p.fat = clamp(p.fat - shortfall, 0, FAT_FULL);

  const thirst = stepWater(state, felt, dt);

  // Warmth settles toward the level the felt temperature can hold, with a
  // time constant of about an hour and a half: a body in balance, not a leak.
  const target = warmthTarget(felt);
  p.warmth = clamp(p.warmth + (target - p.warmth) * WARMTH_RATE * dt, 0, 100);

  // Energy.
  // A working day of ten hours plus six awake costs about what eight hours of sleep restores.
  const energyRate = a === "sleep" ? 12.5 : a === "rest" && state.task?.id === "rest" ? (p.energy < 20 ? 4 : 6) : a === "rest" ? -4 : -8;
  p.energy = clamp(p.energy + energyRate * h, 0, 100);

  // Wetness.
  if (x.raining && !x.cabin) {
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

  // A torch burns whatever you do, and there is no saving the stub.
  if (p.torch.lit) {
    p.torch.minutes = Math.max(0, p.torch.minutes - dt);
    if (p.torch.minutes === 0) {
      p.torch.lit = false;
      log(state, "The torch gutters out.");
    }
  }

  // Health.
  const drains: Drains = { starve: 0, cold: 0, sick: 0, thirst, smoke: 0 };
  if (p.kcal <= 0 && p.fat <= 0) drains.starve = 2 * h;
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
  warn(state, "kcal", p.kcal <= 1200, "You are starving.");
  warn(state, "thin", p.fat < 0.75 * FAT_FULL, "You are getting thin.");
  warn(state, "ribs", p.fat < 0.5 * FAT_FULL, "Your ribs show.");
  warn(state, "wasting", p.fat < 0.25 * FAT_FULL, "You are wasting away.");
  warn(state, "warm", p.warmth < 30, "You are shivering hard. Find warmth.");
  warn(state, "wet", p.wetness >= 60, "You are soaked through.");
  warn(state, "tired", p.energy < 20, "You can barely lift your arms. Sleep.");
  warn(state, "thirst", p.water < THIRSTY_L, "You are thirsty.");
  const here = cellOf(state, world);
  const onThinIce = cellAt(world, here).terrain === "water" && w.iceCm < ICE_SAFE_CM;
  warn(state, "thinice", onThinIce, "The ice is thin here.");
  warn(state, "icedover", watersideCell(world, here) && w.iceCm >= ICE_SHORE_CM, "The shore is iced over.");
  warn(state, "smoke", camp && r.smoke > SMOKE_COUGH, "The fire is smoking the place out.");
  warn(state, "co", smoking, "The air is thick. You wake coughing.");

  return drains;
}

const warned = new WeakMap<GameState, Set<string>>();
function warn(state: GameState, key: string, active: boolean, text: string) {
  let set = warned.get(state);
  if (!set) {
    set = new Set();
    warned.set(state, set);
  }
  if (active && !set.has(key)) {
    set.add(key);
    log(state, text, "bad");
  } else if (!active && set.has(key)) {
    set.delete(key);
  }
}

/** Names the death from the drains that killed: the largest of them. */
export function causeFrom(d: Drains): DeathCause {
  const worst = (Object.entries(d) as [keyof Drains, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const named: Record<keyof Drains, DeathCause> = { starve: "starved", cold: "froze", sick: "sickness", thirst: "thirst", smoke: "smoke" };
  return named[worst];
}

/** What the log says, and the death screen's cause paragraph, for each way to go: one table so the two always agree. */
export const DEATH_LINES: Record<DeathCause, string> = {
  starved: "You starved.",
  froze: "The cold took you.",
  wolves: "The wolves finished it.",
  sickness: "The fever won.",
  thirst: "Thirst took you.",
  smoke: "The smoke took you in your sleep.",
  drowned: "The ice gave way. The lake kept you.",
};

export function die(state: GameState, cause: DeathCause): void {
  if (state.dead) return;
  state.dead = { cause, minute: state.minute };
  state.task = null;
  log(state, DEATH_LINES[cause], "bad");
}
