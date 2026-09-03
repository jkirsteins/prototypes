import { PACK_COMFORTABLE_KG, PACK_HARD_KG, clamp } from "../units";
import { cellAt, type World } from "../world/gen";
import { speedOf } from "../world/route";
import type { Calendar } from "./calendar";
import { carried } from "./inventory";
import { CLOTHING, KCAL_FULL } from "./items";
import { log } from "./log";
import { atCamp, cellOf } from "./position";
import { regionState } from "./regionstate";
import { speedFactor } from "./skills";
import type { DeathCause, GameState, IceMode, RegionState, Task, TaskId, Terrain, Weather } from "./types";
import { THIRSTY_L, stepWater } from "./water";
import { DEEP_SNOW_CM, ICE_SAFE_CM } from "./weather";

/** Tasks done at camp, by the fire and under the roof. */
const CAMP_TASKS = new Set<TaskId>(["rest", "night", "sleep", "craft", "cook", "split", "repair", "build", "light", "lightTorch", "sharpen", "melt", "thaw", "lightIndoors"]);

export type Activity = "sleep" | "rest" | "light" | "walk" | "heavy";

export function activityOf(task: Task | null): Activity {
  if (!task) return "rest";
  switch (task.id) {
    case "sleep": return "sleep";
    case "rest": case "night": case "craft": case "cook": case "repair": case "sharpen": case "light": case "lightTorch": case "melt": case "thaw": case "lightIndoors": return "rest";
    case "sticks": case "bark": case "stone": case "berries": case "hunt": case "fish": return "light";
    case "travel": case "walk": case "haul": return "walk";
    case "chop": case "split": case "build": return "heavy";
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
  for (const g of state.player.clothing) sum += CLOTHING[g.id].insulation * clamp(g.durability, 0, 100) / 100;
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

export function feltTemperature(state: GameState, world: World, ambient: number): number {
  const p = state.player;
  const r = regionState(state, world, p.region);
  const camp = atCamp(state, world);
  const campTask = isCampTask(state.task);
  let felt = ambient + insulation(state);
  if (r.fire.lit && camp) felt += campTask ? 15 : 7;
  if (camp && campTask) felt += shelterBonus(r);
  if (bedded(state.task)) felt += beddingInsulation(state);
  if (camp && state.task?.id === "sleep" && r.structures.boughBed) felt += BOUGH_BED_C;
  const a = activityOf(state.task);
  felt += a === "heavy" ? 6 : a === "walk" ? 4 : a === "light" ? 2 : 0;
  felt -= 0.15 * p.wetness;
  return felt;
}

/** Work goes slower when exhausted or hurt, and faster with practice. */
export function workSpeed(state: GameState, world: World): number {
  const p = state.player;
  let f = 1;
  if (p.energy < 20) f *= 0.5;
  if (p.injured > 0) f *= 0.7;
  if (p.water < THIRSTY_L) f *= 0.8;
  const t = state.task;
  if (t) f *= speedFactor(state, world, t.id, t.arg);
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
  return v;
}

/** Walking speed in km/h on this ground, right now, with this load; a water cell needs the route's ice mode. */
export function walkSpeed(state: GameState, cal: Calendar, weather: Weather, terrain: Terrain, loadKg = carried(state.player), ice: IceMode = "none"): number {
  return baseWalkSpeed(state, cal, weather, loadKg) * speedOf(terrain, ice);
}

const KCAL_PER_HOUR: Record<Activity, number> = { sleep: 70, rest: 100, light: 200, walk: 300, heavy: 400 };

export interface Drains { starve: number; cold: number; sick: number; thirst: number }

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

  // Kilocalories.
  let burn = KCAL_PER_HOUR[a];
  if (a === "walk" && carried(p) > PACK_COMFORTABLE_KG) burn = 350;
  if (felt < 0) burn *= 1.3;
  if (p.sick > 0) burn *= 1.2;
  p.kcal = clamp(p.kcal - burn * h, 0, KCAL_FULL);

  const thirst = stepWater(state, felt, dt);

  // Warmth settles toward the level the felt temperature can hold, with a
  // time constant of about an hour and a half: a body in balance, not a leak.
  const target = warmthTarget(felt);
  p.warmth = clamp(p.warmth + (target - p.warmth) * WARMTH_RATE * dt, 0, 100);

  // Energy.
  // A working day of ten hours plus six awake costs about what eight hours of sleep restores.
  const energyRate = a === "sleep" ? 12.5 : a === "rest" && state.task?.id === "rest" ? 6 : a === "rest" ? -4 : -8;
  p.energy = clamp(p.energy + energyRate * h, 0, 100);

  // Wetness.
  const raining = w.precip !== "none";
  if (raining && !cabin) {
    let wet = w.precip === "heavy" ? 2 : 1;
    if (roof) wet *= 0.5;
    // Snow brushes off; it dampens rather than soaks.
    const cap = ambient <= 0 ? SNOW_DAMP_MAX : 100;
    if (ambient <= 0) wet *= 0.25;
    p.wetness = clamp(p.wetness + wet * dt, 0, Math.max(p.wetness, cap));
  } else {
    const dry = r.fire.lit && camp && campTask ? 1.5 : roof ? 0.5 : raining ? 0 : 0.3;
    p.wetness = clamp(p.wetness - dry * dt, 0, 100);
  }

  // Clothing wears when worn outdoors; bedding only while it is out of the pack.
  if (!roof) {
    const wear = (raining ? 1.0 : 0.5) * h;
    const inUse = bedded(state.task);
    for (const g of p.clothing) {
      if (CLOTHING[g.id].slot === "blanket" && !inUse) continue;
      g.durability = clamp(g.durability - wear, 0, 100);
    }
  }

  // Statuses tick down.
  if (p.sick > 0) p.sick = Math.max(0, p.sick - dt);
  if (p.injured > 0) p.injured = Math.max(0, p.injured - dt);

  // A torch burns whatever you do, and there is no saving the stub.
  if (p.torch.lit) {
    p.torch.minutes = Math.max(0, p.torch.minutes - dt);
    if (p.torch.minutes === 0) {
      p.torch.lit = false;
      log(state, "The torch gutters out.");
    }
  }

  // Health.
  const drains: Drains = { starve: 0, cold: 0, sick: 0, thirst };
  if (p.kcal <= 0) drains.starve = 2 * h;
  if (p.warmth < 20) drains.cold = 6 * h;
  if (p.sick > 0 && !(roof && felt >= 10)) drains.sick = 0.5 * h;
  const total = drains.starve + drains.cold + drains.sick + drains.thirst;
  if (total > 0) {
    p.health = clamp(p.health - total, 0, 100);
  } else if (p.kcal > 1500 && p.warmth > 40 && p.sick === 0 && p.water > THIRSTY_L) {
    p.health = clamp(p.health + 1 * h, 0, 100);
  }

  // Milestone warnings, once per crossing.
  warn(state, "kcal", p.kcal <= 1200, "You are starving.");
  warn(state, "warm", p.warmth < 30, "You are shivering hard. Find warmth.");
  warn(state, "wet", p.wetness >= 60, "You are soaked through.");
  warn(state, "tired", p.energy < 20, "You can barely lift your arms. Sleep.");
  warn(state, "thirst", p.water < THIRSTY_L, "You are thirsty.");
  const onThinIce = cellAt(world, cellOf(state, world)).terrain === "water" && w.iceCm < ICE_SAFE_CM;
  warn(state, "thinice", onThinIce, "The ice is thin here.");

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

/** Names the death from the drains that killed: the largest of the four. */
export function causeFrom(d: Drains): DeathCause {
  const worst = (Object.entries(d) as [keyof Drains, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const named: Record<keyof Drains, DeathCause> = { starve: "starved", cold: "froze", sick: "sickness", thirst: "thirst" };
  return named[worst];
}

export function die(state: GameState, cause: DeathCause): void {
  if (state.dead) return;
  state.dead = { cause, minute: state.minute };
  state.task = null;
  const text = {
    starved: "You starved.",
    froze: "The cold took you.",
    wolves: "The wolves finished it.",
    sickness: "The fever won.",
    thirst: "Thirst took you.",
    smoke: "The smoke took you in your sleep.",
    drowned: "The ice gave way. The lake kept you.",
  }[cause];
  log(state, text, "bad");
}
