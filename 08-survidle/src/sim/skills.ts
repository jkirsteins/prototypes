/**
 * Skills are practice. Every minute at a task is a minute in its skill, in
 * that action's mastery and in the skill's pool; a level is a count of
 * hours. What a level buys is what practice buys: speed, odds, less waste.
 */
import type { World } from "../world/gen";
import { ANIMALS, ITEM_NAMES, KG_ITEMS, RECIPE_IDS, RECIPES, STRUCTURES, STRUCTURE_IDS, type Need } from "./items";
import { hereTerrain } from "./position";
import type { GameState, ItemId, RecipeId, SkillId, SkillState, Species, StructureId, TaskId } from "./types";
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
  building: [...STRUCTURE_IDS.filter((s) => s !== "snare").map((s) => `build:${s}`), "light", "lightTorch", "cook:rawMeat", "cook:fish"],
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

/** Foraging and Fishing take their pool perks as yield instead of tool wear. */
export function yieldFactor(state: GameState, skill: SkillId): number {
  if (skill !== "foraging" && skill !== "fishing") return 1;
  const share = poolShare(state, skill);
  return share >= 0.95 ? 1.5 : share >= 0.25 ? 1.2 : 1;
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
    case "light": case "lightIndoors": case "lightTorch": case "cook": return "building";
    default: return null;
  }
}

/** The mastery key a task trains here and now; felling keys on the ground under foot. */
export function masteryKey(state: GameState, world: World, id: TaskId, arg?: string): string | null {
  switch (id) {
    case "chop": return `chop:${hereTerrain(state, world)}`;
    case "sticks": case "bark": case "split": case "berries": case "stone":
    case "fish": case "repair": case "sharpen": case "light": case "lightTorch":
      return id;
    case "lightIndoors": return "light";
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

/** The concrete extras, at mastery 20 and 50, by key; a key not here is speed only. */
export const EXTRAS: Record<string, { at20: string; at50: string }> = {
  "chop:spruce": { at20: "an extra stick per tree", at50: "the axe keeps its edge on spruce" },
  "chop:pine": { at20: "an extra stick per tree", at50: "the axe keeps its edge on pine" },
  "chop:birch": { at20: "an extra stick per tree", at50: "the axe keeps its edge on birch" },
  "hunt:hare": { at20: "the hide comes off whole, 0.3 kg", at50: "a bone more" },
  "hunt:deer": { at20: "a sinew more", at50: "half the chance of a hurt" },
  "hunt:elk": { at20: "a sinew more", at50: "half the chance of a hurt" },
  fish: { at20: "0.9 kg per catch", at50: "1.2 kg per catch" },
  "craft:hideCoat": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideTrousers": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBoots": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBlanket": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:furHat": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:furMittens": { at20: "one sinew fewer", at50: "a tenth less hide" },
};

/** A readable name for a mastery key, for log lines: "Spruce felling", "Elk hunting", "Hide coat". */
export function keyName(key: string): string {
  const [kind, arg] = key.split(":");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (kind === "chop") return `${cap(arg)} felling`;
  if (kind === "hunt") return `${cap(ANIMALS[arg as Species].name)} hunting`;
  if (kind === "craft") return cap(RECIPES[arg as RecipeId].name);
  if (kind === "build") return cap(STRUCTURES[arg as StructureId].name);
  if (kind === "cook") return `Cooking ${ITEM_NAMES[arg as ItemId]}`;
  return cap(kind);
}

export function chopSticks(state: GameState, world: World): number {
  return 4 + (masteryOf(state, "woodcraft", masteryKey(state, world, "chop")!) >= 20 ? 1 : 0);
}

export function huntExtras(state: GameState, species: Species): { hideKg: number; bone: number; sinew: number; injuryFactor: number } {
  const def = ANIMALS[species];
  const m = masteryOf(state, "hunting", `hunt:${species}`);
  const out = { hideKg: def.hideKg, bone: def.bone, sinew: def.sinew, injuryFactor: 1 };
  if (species === "hare") {
    if (m >= 20) out.hideKg = 0.3;
    if (m >= 50) out.bone += 1;
  } else if (species === "deer" || species === "elk") {
    if (m >= 20) out.sinew += 1;
    if (m >= 50) out.injuryFactor = 0.5;
  }
  return out;
}

export function fishKg(state: GameState): number {
  const m = masteryOf(state, "fishing", "fish");
  return ANIMALS.fish.meatKg + (m >= 50 ? 0.5 : m >= 20 ? 0.2 : 0);
}

/** A recipe's needs after mastery: hide and fur pieces want one sinew fewer at 20 and a tenth less hide at 50. */
export function effectiveNeeds(state: GameState, recipe: RecipeId): Need[] {
  const rec = RECIPES[recipe];
  if (!EXTRAS[`craft:${recipe}`]) return rec.needs;
  const m = masteryOf(state, "crafting", `craft:${recipe}`);
  return rec.needs
    .map((n) => {
      if (n.item === "sinew" && m >= 20) return { ...n, qty: n.qty - 1 };
      if (n.item === "hide" && m >= 50) return { ...n, qty: Math.round((n.qty * 0.9) * 2) / 2 };
      return n;
    })
    .filter((n) => n.qty > 0);
}

/** Chance the animal hurts you: its own, plus ten points per level short, halved by mastery 50 on deer and elk. */
export function injuryChance(state: GameState, species: Species): number {
  const base = ANIMALS[species].injury + 0.1 * gap(state, `hunt:${species}`);
  return Math.min(1, base * huntExtras(state, species).injuryFactor);
}

/** Chance the gap alone turns on you, on every attempt whether or not the animal is taken. */
export function gapInjury(state: GameState, species: Species): number {
  return Math.min(1, 0.1 * gap(state, `hunt:${species}`)) * huntExtras(state, species).injuryFactor;
}

/** Chance a piece comes out: halved per level short of the recommendation. */
export function craftSuccess(state: GameState, recipe: RecipeId): number {
  let f = 0.5 ** gap(state, `craft:${recipe}`);
  // Cold hands double the chance of spoiling the piece, not halve the chance of success.
  if (state.player.frostbite.hands > 0) f = 1 - Math.min(1, 2 * (1 - f));
  // Spent past energy 20, hands fumble the piece: the spoil chance doubles the same way.
  if (state.player.energy < 20) f = 1 - Math.min(1, 2 * (1 - f));
  if (state.player.fingers) f *= 0.9;
  return f;
}

/** Half of each need, for a spoiled attempt: counts rounded up, kilograms exact. */
export function spoiledNeeds(needs: Need[]): Need[] {
  return needs.map((n) => ({ ...n, qty: KG_ITEMS.has(n.item) ? n.qty / 2 : Math.ceil(n.qty / 2) }));
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

/** Tool wear multiplier for a task: Crafting's level, the pool's 25% and 95% perks, and mastery 50 sparing the axe on a mastered tree kind. */
export function wearFactor(state: GameState, world: World, id: TaskId, arg?: string): number {
  const skill = skillOf(id, arg);
  if (!skill) return 1;
  let f = skill === "crafting" ? 1 - skillBonus(state, skill) : 1;
  if (skill !== "fishing" && skill !== "foraging") {
    const share = poolShare(state, skill);
    if (share >= 0.95) f = 0;
    else if (share >= 0.25) f *= 0.5;
  }
  if (id === "chop" && masteryOf(state, skill, masteryKey(state, world, id)!) >= 50) f = 0;
  return f;
}

/** Odds multiplier for a hunt or a cast: the skill's level, halved per level short of the recommendation. */
export function oddsFactor(state: GameState, species: string): number {
  const skill: SkillId = species === "fish" ? "fishing" : "hunting";
  const key = species === "fish" ? "fish" : `hunt:${species}`;
  let f = (1 + skillBonus(state, skill)) * 0.5 ** gap(state, key);
  if (state.player.frostbite.hands > 0) f *= 0.5;
  if (state.player.fingers) f *= 0.9;
  return f;
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
  const mBefore = masteryLevel(s.mastery[key] ?? 0);
  s.mastery[key] = (s.mastery[key] ?? 0) + dt;
  const mAfter = masteryLevel(s.mastery[key]);
  const extra = EXTRAS[key];
  if (extra) {
    if (mBefore < 20 && mAfter >= 20) log(state, `${keyName(key)} mastery 20: ${extra.at20}.`, "good");
    if (mBefore < 50 && mAfter >= 50) log(state, `${keyName(key)} mastery 50: ${extra.at50}.`, "good");
  }
  s.pool = Math.min(poolCapacity(skill), s.pool + dt);
}
