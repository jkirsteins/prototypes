/**
 * The delegation ladder (idle curve spec, section 2). A once job is the
 * manual rung: one unit of work, then it drops off the list, and it is
 * never gated. Jobs with a count or a camp-has target, grinds and keeps
 * are earned per skill, at RUNG_LEVEL. The gate reads the level at the
 * moment an order is given, on the kind the order is actually added as.
 */
import type { World } from "../world/gen";
import { yieldItem } from "./intent";
import { addOrder } from "./orders";
import { RUNG_LEVEL, RUNG_WORD, SKILL_NAMES, skillLevel, skillOf } from "./skills";
import type { GameState, IntentRequest, Order, OrderKind, SkillId, TaskId } from "./types";

/** Tasks that train no skill but can still be ordered take the skill of the work they serve. */
const GATE_SKILL: Partial<Record<TaskId, SkillId>> = { haul: "woodcraft", melt: "building", thaw: "building" };

/** Never orders: the runner's own steps, and the moves the Do panel starts directly. */
export const NOT_ORDERS: TaskId[] = ["walk", "travel", "wait", "rest", "sleep", "night", "makeCamp"];

/** The skill whose level gates orders for this task, or null for a task that is never an order. */
export function gateSkill(task: TaskId, arg?: string): SkillId | null {
  return skillOf(task, arg) ?? GATE_SKILL[task] ?? null;
}

/**
 * The kind an order is added as. A keep or a camp-has without a countable
 * yield is a once job; a grind is always forever. "Keep it lit" is the one
 * keep exempt from the fallback: light has no stock to count, but the fire
 * going out is itself the thing worth watching for.
 */
export function normalizeOrder(req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const lightKeep = kind === "keep" && req.task === "light";
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg) && !lightKeep) {
    return { req: { ...req, until: { kind: "once" } }, kind: "job" };
  }
  if (kind === "grind") return { req: { ...req, until: { kind: "forever" } }, kind: "grind" };
  return { req, kind };
}

export type Gate = { ok: true } | { ok: false; why: string; skill: SkillId; level: number; at: number };

/** Whether this order may be given now, and if not, which level opens it. */
export function orderGate(state: GameState, req: IntentRequest, kind: OrderKind): Gate {
  const n = normalizeOrder(req, kind);
  if (n.kind === "job" && n.req.until.kind === "once") return { ok: true };
  const skill = gateSkill(n.req.task, n.req.arg);
  if (!skill) throw new Error(`${n.req.task} has no gate skill and cannot be an order`);
  const level = skillLevel(state, skill);
  const at = RUNG_LEVEL[n.kind];
  if (level >= at) return { ok: true };
  return { ok: false, why: `${RUNG_WORD[n.kind]} at ${SKILL_NAMES[skill]} ${at}, you are ${level}`, skill, level, at };
}

/** The door the Do panel and the player script use: the gate, then addOrder. */
export function giveOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind, rank?: number): Order {
  const gate = orderGate(state, req, kind);
  if (!gate.ok) throw new Error(gate.why);
  return addOrder(state, world, req, kind, rank);
}

/** Trees a player fells per click when the grind is shut but a count is open. */
export const GRIND_STAND_IN = 5;

/**
 * What a player gives instead when the kind they want is shut: the best
 * kind the skill has earned, aimed at the same target. A keep is a keep at
 * 10, a camp-has job at 3, a once job below; a grind is itself at 5, a
 * GRIND_STAND_IN-times job at 3, a once job below; a counted job is itself
 * at 3 and a once job below. The player script and the stage set-ups use
 * it; the Do panel shows the gate instead and lets the player choose.
 */
export function withinLadder(state: GameState, req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const n = normalizeOrder(req, kind);
  if (orderGate(state, n.req, n.kind).ok) return n;
  const level = skillLevel(state, gateSkill(n.req.task, n.req.arg)!);
  const once = { req: { ...n.req, until: { kind: "once" as const } }, kind: "job" as const };
  if (level < RUNG_LEVEL.job) return once;
  if (n.kind === "grind") return { req: { ...n.req, until: { kind: "times", n: GRIND_STAND_IN } }, kind: "job" };
  // A keep, at 3 or 5: the same target as a job that drops off when met.
  // "Keep it lit" has nothing to count and falls to light once.
  return normalizeOrder({ ...n.req, until: n.req.until.kind === "campHas" ? n.req.until : { kind: "once" } }, "job");
}
