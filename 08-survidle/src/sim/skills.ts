/**
 * Skills are practice. Every minute at a task is a minute in its skill, in
 * that action's mastery and in the skill's pool; a level is a count of
 * hours. What a level buys is what practice buys: speed, odds, less waste.
 */
import type { World } from "../world/gen";
import { ITEM_NAMES, KG_ITEMS, RECIPE_IDS, RECIPES, STRUCTURES, STRUCTURE_IDS, type Need } from "./items";
import { starvation } from "./player";
import { hereTerrain } from "./position";
import { extrasClass, fishSpecies, huntedLand, type Species, SPECIES_DEFS } from "./species";
import type { GameState, ItemId, OrderKind, RecipeId, SkillId, SkillState, StructureId, TaskId } from "./types";
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
  hunting: [...huntedLand().map((s) => `hunt:${s}`), "snare"],
  fishing: [...fishSpecies().map((s) => `fish:${s}`), "read", "trap"],
  crafting: [...RECIPE_IDS.map((r) => `craft:${r}`), "repair", "sharpen"],
  building: [...STRUCTURE_IDS.filter((s) => s !== "snare").map((s) => `build:${s}`), "light", "lightTorch", "cook:rawMeat", "cook:fish"],
};

export const SKILL_CAP = 50;

/**
 * The delegation ladder (idle curve spec, section 2): the level a skill
 * must reach before its orders may be given as each kind. A once job is
 * the manual rung and is never gated.
 */
export const RUNG_LEVEL: Record<OrderKind, number> = { job: 3, grind: 5, keep: 10 };
export const RUNG_WORD: Record<OrderKind, string> = { job: "jobs", grind: "grinds", keep: "keeps" };
/** Crude before smart: the order the rungs open in. */
export const RUNG_ORDER: OrderKind[] = ["job", "grind", "keep"];

/** What the log says as each rung opens, once per skill per survivor. */
export const RUNG_LINE: Record<OrderKind, (skill: string) => string> = {
  job: (s) => `You know ${s.toLowerCase()} well enough to set a task and walk away: jobs with a count or a target from ${s}.`,
  grind: (s) => `${s} is second nature now: grinds, work that never ends, from ${s}.`,
  keep: (s) => `You keep count of ${s.toLowerCase()} without thinking: keeps from ${s}.`,
};

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

/** Keys the pool counts, for the skills whose rosters would otherwise put the perks out of reach. */
const POOL_KEY_CAP: Partial<Record<SkillId, number>> = { hunting: 6, fishing: 3 };

export function poolCapacity(skill: SkillId): number {
  return POOL_MINUTES_PER_KEY * Math.min(MASTERY_KEYS[skill].length, POOL_KEY_CAP[skill] ?? Number.POSITIVE_INFINITY);
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
    case "mend": return "building";
    case "fish": case "read": case "setTrap": case "emptyTrap": return "fishing";
    case "craft": case "repair": case "sharpen": return "crafting";
    case "light": case "lightIndoors": case "lightTorch": case "cook": case "hang": return "building";
    case "fill": case "iceHole": return "foraging";
    default: return null;
  }
}

/** The mastery key a task trains here and now; felling keys on the ground under foot. */
export function masteryKey(state: GameState, world: World, id: TaskId, arg?: string): string | null {
  switch (id) {
    case "chop": return `chop:${hereTerrain(state, world)}`;
    case "sticks": case "bark": case "split": case "berries": case "stone":
    case "repair": case "sharpen": case "light": case "lightTorch": case "hang":
      return id;
    // "Anything" is not a thing you get better at: the species drawn is what the minutes go to.
    case "fish": return arg === "any" ? null : `fish:${arg}`;
    case "lightIndoors": return "light";
    case "hunt": return arg === "any" ? null : `hunt:${arg}`;
    case "build": return arg === "snare" ? "snare" : `build:${arg}`;
    case "mend": return `mend:${arg}`;
    case "craft": return `craft:${arg}`;
    case "cook": return `cook:${arg ?? "rawMeat"}`;
    case "fill": case "iceHole": return id;
    case "read": return "read";
    case "setTrap": case "emptyTrap": return "trap";
    default: return null;
  }
}

/** Recommended levels. Under them the odds are punished; over them nothing extra. */
export const RECOMMENDED: Record<string, { skill: SkillId; level: number }> = {
  "craft:bow": { skill: "crafting", level: 5 },
  "craft:hideBlanket": { skill: "crafting", level: 6 },
  "craft:hideCoat": { skill: "crafting", level: 8 },
  "craft:hideTrousers": { skill: "crafting", level: 8 },
  "craft:hideBoots": { skill: "crafting", level: 8 },
  "build:cabin": { skill: "building", level: 10 },
  read: { skill: "fishing", level: 3 },
  "craft:basketTrap": { skill: "fishing", level: 5 },
  "build:turfHut": { skill: "building", level: 5 },
  "build:waterStore": { skill: "building", level: 3 },
};
for (const s of huntedLand()) {
  const l = SPECIES_DEFS[s].hunt?.level;
  if (l) RECOMMENDED[`hunt:${s}`] = { skill: "hunting", level: l };
}
for (const s of fishSpecies()) {
  const l = SPECIES_DEFS[s].hunt?.level;
  if (l) RECOMMENDED[`fish:${s}`] = { skill: "fishing", level: l };
}

/** Levels short of the recommendation for a mastery key; 0 when there is none or you are there. */
export function gap(state: GameState, key: string): number {
  const rec = RECOMMENDED[key];
  if (!rec) return 0;
  return Math.max(0, rec.level - skillLevel(state, rec.skill));
}

/** The concrete extras, at mastery 20 and 50, by key; a key not here is speed only. A key with no at50 has nothing to promise there. */
export const EXTRAS: Record<string, { at20: string; at50?: string }> = {
  "chop:spruce": { at20: "an extra stick per tree", at50: "the axe keeps its edge on spruce" },
  "chop:pine": { at20: "an extra stick per tree", at50: "the axe keeps its edge on pine" },
  "chop:birch": { at20: "an extra stick per tree", at50: "the axe keeps its edge on birch" },
  "craft:hideCoat": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideTrousers": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBoots": { at20: "one sinew fewer", at50: "a tenth less hide" },
  "craft:hideBlanket": { at20: "one sinew fewer", at50: "a tenth less hide" },
  // The tenth off the canonical need is real but inert on these two: a tenth off one fur rounds back to one, so nothing is promised at 50.
  "craft:furHat": { at20: "one sinew fewer" },
  "craft:furMittens": { at20: "one sinew fewer" },
};

/** Extras text by the class a hunted or fished species falls into. */
const CLASS_EXTRAS = {
  fur: { at20: "the pelt comes off whole, half again the fur", at50: "a bone more" },
  big: { at20: "a sinew more", at50: "half the chance of a hurt" },
  bird: { at20: "an arrow is never lost on a miss", at50: "a quarter better odds" },
  fish: { at20: "a third more per catch", at50: "two thirds more per catch" },
};
for (const s of huntedLand()) EXTRAS[`hunt:${s}`] = CLASS_EXTRAS[extrasClass(s)!];
for (const s of fishSpecies()) EXTRAS[`fish:${s}`] = CLASS_EXTRAS.fish;

/** A readable name for a mastery key, for log lines: "Spruce felling", "Elk hunting", "Hide coat". */
export function keyName(key: string): string {
  const [kind, arg] = key.split(":");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (kind === "chop") return `${cap(arg)} felling`;
  if (kind === "hunt" || kind === "fish") return `${cap(SPECIES_DEFS[arg as Species].name)} ${kind === "hunt" ? "hunting" : "fishing"}`;
  if (kind === "craft") return cap(RECIPES[arg as RecipeId].name);
  if (kind === "build") return cap(STRUCTURES[arg as StructureId].name);
  if (kind === "cook") return `Cooking ${ITEM_NAMES[arg as ItemId]}`;
  return cap(kind);
}

export function chopSticks(state: GameState, world: World): number {
  return 4 + (masteryOf(state, "woodcraft", masteryKey(state, world, "chop")!) >= 20 ? 1 : 0);
}

export function huntExtras(state: GameState, species: Species): {
  meatKg: number; hideKg: number; furKg: number; fatKg: number; bone: number; sinew: number; injuryFactor: number; oddsFactor: number; arrowLoss: number;
} {
  const y = SPECIES_DEFS[species].yields ?? { meatKg: 0 };
  const m = masteryOf(state, "hunting", `hunt:${species}`);
  const out = { meatKg: y.meatKg, hideKg: y.hideKg ?? 0, furKg: y.furKg ?? 0, fatKg: y.fatKg ?? 0, bone: y.bone ?? 0, sinew: y.sinew ?? 0, injuryFactor: 1, oddsFactor: 1, arrowLoss: 0.5 };
  switch (extrasClass(species)) {
    case "fur":
      if (m >= 20) out.furKg = Math.round(out.furKg * 1.5 * 100) / 100;
      if (m >= 50) out.bone += 1;
      break;
    case "big":
      if (m >= 20) out.sinew += 1;
      if (m >= 50) out.injuryFactor = 0.5;
      break;
    case "bird":
      if (m >= 20) out.arrowLoss = 0;
      if (m >= 50) out.oddsFactor = 1.25;
      break;
  }
  return out;
}

/** Kilograms a catch of this species weighs, after mastery. */
export function fishKg(state: GameState, species: Species): number {
  const m = masteryOf(state, "fishing", `fish:${species}`);
  return (SPECIES_DEFS[species].yields?.meatKg ?? 0) * (m >= 50 ? 5 / 3 : m >= 20 ? 4 / 3 : 1);
}

/** A recipe's needs after mastery: hide and fur pieces want one sinew fewer at 20 and a tenth less of the skin they are cut from at 50. */
export function effectiveNeeds(state: GameState, recipe: RecipeId): Need[] {
  const rec = RECIPES[recipe];
  if (!EXTRAS[`craft:${recipe}`]) return rec.needs;
  const m = masteryOf(state, "crafting", `craft:${recipe}`);
  return rec.needs
    .map((n) => {
      if (n.item === "sinew" && m >= 20) return { ...n, qty: n.qty - 1 };
      if ((n.item === "hide" || n.item === "fur") && m >= 50) return { ...n, qty: Math.round((n.qty * 0.9) * 2) / 2 };
      return n;
    })
    .filter((n) => n.qty > 0);
}

/** Chance the animal hurts you: its own, plus ten points per level short, halved by mastery 50 on big game, whatever extrasClass calls big. */
export function injuryChance(state: GameState, species: Species): number {
  const base = (SPECIES_DEFS[species].hunt?.injury ?? 0) + 0.1 * gap(state, `hunt:${species}`);
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
export function oddsFactor(state: GameState, species: Species): number {
  const fishing = SPECIES_DEFS[species].kind === "fish";
  const skill: SkillId = fishing ? "fishing" : "hunting";
  const key = fishing ? `fish:${species}` : `hunt:${species}`;
  let f = (1 + skillBonus(state, skill)) * 0.5 ** gap(state, key);
  if (state.player.frostbite.hands > 0) f *= 0.5;
  if (state.player.fingers) f *= 0.9;
  f *= 1 - 0.5 * starvation(state.player);
  if (!fishing) f *= huntExtras(state, species).oddsFactor;
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
  if (after > before) {
    log(state, `${SKILL_NAMES[skill]} ${after}.`, "good");
    // Once per survivor by construction: a level is crossed once, and the heir is a new state.
    for (const k of RUNG_ORDER) if (before < RUNG_LEVEL[k] && after >= RUNG_LEVEL[k]) log(state, RUNG_LINE[k](SKILL_NAMES[skill]), "good");
  }
  const mBefore = masteryLevel(s.mastery[key] ?? 0);
  s.mastery[key] = (s.mastery[key] ?? 0) + dt;
  const mAfter = masteryLevel(s.mastery[key]);
  const extra = EXTRAS[key];
  if (extra) {
    if (mBefore < 20 && mAfter >= 20) log(state, `${keyName(key)} mastery 20: ${extra.at20}.`, "good");
    if (extra.at50 && mBefore < 50 && mAfter >= 50) log(state, `${keyName(key)} mastery 50: ${extra.at50}.`, "good");
  }
  s.pool = Math.min(poolCapacity(skill), s.pool + dt);
}
