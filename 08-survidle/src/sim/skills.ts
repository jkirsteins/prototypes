/**
 * Skills are practice. Every minute at a task is a minute in its skill, in
 * that action's mastery and in the skill's pool; a level is a count of
 * hours. What a level buys is what practice buys: speed, odds, less waste.
 */
import type { World } from "../world/gen";
import { RECIPE_IDS, STRUCTURE_IDS } from "./items";
import { hereTerrain } from "./position";
import type { GameState, SkillId, SkillState, TaskId } from "./types";
import { log } from "./log";

export const SKILL_IDS: SkillId[] = ["woodcraft", "foraging", "hunting", "fishing", "crafting", "building"];

export const SKILL_NAMES: Record<SkillId, string> = {
  woodcraft: "Woodcraft", foraging: "Foraging", hunting: "Hunting",
  fishing: "Fishing", crafting: "Crafting", building: "Building",
};

/** The actions each skill owns; the pool's capacity is 100 hours per key. */
export const MASTERY_KEYS: Record<SkillId, string[]> = {
  woodcraft: ["chop:spruce", "chop:pine", "chop:birch", "sticks", "bark", "split"],
  foraging: ["berries", "stone"],
  hunting: ["hunt:hare", "hunt:grouse", "hunt:deer", "hunt:elk", "snare"],
  fishing: ["fish"],
  crafting: [...RECIPE_IDS.map((r) => `craft:${r}`), "repair", "sharpen"],
  building: [...STRUCTURE_IDS.filter((s) => s !== "snare").map((s) => `build:${s}`), "light", "cook:rawMeat", "cook:fish"],
};

export const SKILL_CAP = 50;
export const MASTERY_CAP = 99;
/** Level L needs 2 (L-1)^2 hours: 120 (L-1)^2 minutes. */
export const SKILL_LEVEL_MINUTES = 120;
/** Mastery M needs 0.25 (M-1)^2 hours: 15 (M-1)^2 minutes. */
export const MASTERY_LEVEL_MINUTES = 15;
export const POOL_MINUTES_PER_KEY = 100 * 60;

export function newSkills(): Record<SkillId, SkillState> {
  const out = {} as Record<SkillId, SkillState>;
  for (const id of SKILL_IDS) out[id] = { xp: 0, mastery: {}, pool: 0 };
  return out;
}

export function level(minutes: number): number {
  return Math.min(SKILL_CAP, 1 + Math.floor(Math.sqrt(Math.max(0, minutes) / SKILL_LEVEL_MINUTES)));
}

export function levelMinutes(l: number): number {
  return SKILL_LEVEL_MINUTES * (l - 1) ** 2;
}

export function masteryLevel(minutes: number): number {
  return Math.min(MASTERY_CAP, 1 + Math.floor(Math.sqrt(Math.max(0, minutes) / MASTERY_LEVEL_MINUTES)));
}

export function masteryMinutes(m: number): number {
  return MASTERY_LEVEL_MINUTES * (m - 1) ** 2;
}

export function poolCapacity(skill: SkillId): number {
  return POOL_MINUTES_PER_KEY * MASTERY_KEYS[skill].length;
}

export function poolShare(state: GameState, skill: SkillId): number {
  return state.skills[skill].pool / poolCapacity(skill);
}

export function skillLevel(state: GameState, skill: SkillId): number {
  return level(state.skills[skill].xp);
}

export function masteryOf(state: GameState, skill: SkillId, key: string): number {
  return masteryLevel(state.skills[skill].mastery[key] ?? 0);
}

/** The skill a task trains, or null for walks and waits. */
export function skillOf(id: TaskId, arg?: string): SkillId | null {
  switch (id) {
    case "chop": case "sticks": case "bark": case "split": return "woodcraft";
    case "berries": case "stone": return "foraging";
    case "hunt": return "hunting";
    case "build": return arg === "snare" ? "hunting" : "building";
    case "fish": return "fishing";
    case "craft": case "repair": case "sharpen": return "crafting";
    case "light": case "cook": return "building";
    default: return null;
  }
}

/** The mastery key a task trains here and now; felling keys on the ground under foot. */
export function masteryKey(state: GameState, world: World, id: TaskId, arg?: string): string | null {
  switch (id) {
    case "chop": return `chop:${hereTerrain(state, world)}`;
    case "sticks": case "bark": case "split": case "berries": case "stone":
    case "fish": case "repair": case "sharpen": case "light":
      return id;
    case "hunt": return `hunt:${arg}`;
    case "build": return arg === "snare" ? "snare" : `build:${arg}`;
    case "craft": return `craft:${arg}`;
    case "cook": return `cook:${arg ?? "rawMeat"}`;
    default: return null;
  }
}

/** Recommended levels. Under them the odds are punished; over them nothing extra. */
export const RECOMMENDED: Record<string, { skill: SkillId; level: number }> = {
  "hunt:deer": { skill: "hunting", level: 4 },
  "hunt:elk": { skill: "hunting", level: 8 },
  "craft:bow": { skill: "crafting", level: 5 },
  "craft:hideBlanket": { skill: "crafting", level: 6 },
  "craft:hideCoat": { skill: "crafting", level: 8 },
  "craft:hideTrousers": { skill: "crafting", level: 8 },
  "craft:hideBoots": { skill: "crafting", level: 8 },
  "build:cabin": { skill: "building", level: 10 },
};

/** Levels short of the recommendation for a mastery key; 0 when there is none or you are there. */
export function gap(state: GameState, key: string): number {
  const rec = RECOMMENDED[key];
  if (!rec) return 0;
  return Math.max(0, rec.level - skillLevel(state, rec.skill));
}

function skillBonus(state: GameState, skill: SkillId): number {
  return 0.01 * (skillLevel(state, skill) - 1);
}

/** Work pace multiplier for a task: skill, mastery, pool, and the build slowdown under level. */
export function speedFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  const key = masteryKey(state, world, id, arg);
  let f = 1 + skillBonus(state, skill);
  if (key) f *= 1 + 0.0025 * (masteryOf(state, skill, key) - 1);
  const share = poolShare(state, skill);
  if (share >= 0.5) f *= 1.1;
  else if (share >= 0.1) f *= 1.05;
  if (id === "build" && key) f /= 1.3 ** gap(state, key);
  return f;
}

/** Tool wear multiplier for a task: Crafting's level, and the pool's 25% and 95% perks. */
export function wearFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  let f = skill === "crafting" ? 1 - skillBonus(state, skill) : 1;
  const share = poolShare(state, skill);
  if (share >= 0.95) f = 0;
  else if (share >= 0.25) f *= 0.5;
  void world;
  return f;
}

/** Odds multiplier for a hunt or a cast: the skill's level, halved per level short of the recommendation. */
export function oddsFactor(state: GameState, species: string): number {
  const skill: SkillId = species === "fish" ? "fishing" : "hunting";
  const key = species === "fish" ? "fish" : `hunt:${species}`;
  return (1 + skillBonus(state, skill)) * 0.5 ** gap(state, key);
}

/** One minute at the current task: skill, mastery and pool each gain it. Called from stepTask. */
export function train(state: GameState, world: World, dt: number): void {
  const t = state.task;
  if (!t) return;
  const skill = skillOf(t.id, t.arg);
  if (!skill) return;
  const key = masteryKey(state, world, t.id, t.arg);
  if (!key) return;
  const s = state.skills[skill];
  const before = level(s.xp);
  s.xp += dt;
  const after = level(s.xp);
  if (after > before) log(state, `${SKILL_NAMES[skill]} ${after}.`, "good");
  s.mastery[key] = (s.mastery[key] ?? 0) + dt;
  s.pool = Math.min(poolCapacity(skill), s.pool + dt);
}
