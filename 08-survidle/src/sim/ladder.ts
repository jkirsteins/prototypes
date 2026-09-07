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
import { RUNG_LEVEL, RUNG_WORD, type Rung, SKILL_NAMES, skillLevel, skillOf } from "./skills";
import type { GameState, IntentRequest, Order, OrderKind, SkillId, TaskId } from "./types";

/** Tasks that train no skill but can still be ordered take the skill of the work they serve. */
const GATE_SKILL: Partial<Record<TaskId, SkillId>> = { haul: "woodcraft", melt: "building", thaw: "building" };

/** Never orders: the runner's own steps, and the moves the Do panel starts directly. */
export const NOT_ORDERS: TaskId[] = ["walk", "travel", "wait", "rest", "sleep", "night", "makeCamp"];

/** The skill whose level gates orders for this task, or null for a task that is never an order. */
export function gateSkill(task: TaskId, arg?: string): SkillId | null {
  return skillOf(task, arg) ?? GATE_SKILL[task] ?? null;
}

/** A keep whose promise is a structure standing or a count of snares set, not a stock at camp. */
export function structureKeep(req: IntentRequest, kind: OrderKind): boolean {
  // A seep stands on a cell, not at camp, so it is never a structure keep: it falls
  // back to a once job through the guard below.
  return kind === "keep" && req.task === "build" && req.arg !== "seep";
}

/**
 * The kind an order is added as. A keep or a camp-has without a countable
 * yield is a once job; a grind is always forever. "Keep it lit" is the one
 * keep exempt from the fallback: light has no stock to count, but the fire
 * going out is itself the thing worth watching for. A keep on a structure
 * (structureKeep) is the other exemption: the bed standing or the snares
 * set is what it watches, not a stock.
 */
export function normalizeOrder(req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const lightKeep = kind === "keep" && (req.task === "light" || req.task === "lightIndoors");
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg) && !lightKeep && !structureKeep(req, kind)) {
    return { req: { ...req, until: { kind: "once" } }, kind: "job" };
  }
  if (kind === "grind") return { req: { ...req, until: { kind: "forever" } }, kind: "grind" };
  return { req, kind };
}

/** The rungs an order asks for: its kind, and past the keep, each condition it carries. */
export function rungsNeeded(req: IntentRequest, kind: OrderKind): Rung[] {
  const n = normalizeOrder(req, kind);
  const out: Rung[] = [n.kind];
  const w = n.req.when;
  if (w?.season || w?.stock || w?.restart !== undefined || n.req.until.kind === "daily") out.push("condition");
  // Both pace words ask for the same rung: "spent by the season's close" is what
  // a due date can say next, not a rung of its own.
  if (w?.by !== undefined || w?.spend) out.push("pace");
  return out;
}

export type Gate = { ok: true } | { ok: false; why: string; skill: SkillId; level: number; at: number };

/** Whether this order may be given now, and if not, which level opens it. */
export function orderGate(state: GameState, req: IntentRequest, kind: OrderKind): Gate {
  const n = normalizeOrder(req, kind);
  const rungs = rungsNeeded(n.req, n.kind);
  if (n.kind === "job" && n.req.until.kind === "once" && rungs.length === 1) return { ok: true };
  const skill = gateSkill(n.req.task, n.req.arg);
  if (!skill) throw new Error(`${n.req.task} has no gate skill and cannot be an order`);
  const level = skillLevel(state, skill);
  for (const r of rungs) {
    if (r === "job" && n.req.until.kind === "once") continue;
    const at = RUNG_LEVEL[r];
    if (level < at) return { ok: false, why: `${RUNG_WORD[r]} at ${SKILL_NAMES[skill]} ${at}, {you} {are} ${level}`, skill, level, at };
  }
  return { ok: true };
}

/** The request with every condition the skill has not earned taken off; the kind stand-in follows as before. */
function stripUnearned(state: GameState, req: IntentRequest): IntentRequest {
  const skill = gateSkill(req.task, req.arg);
  if (!skill) return req;
  const level = skillLevel(state, skill);
  let out = req;
  // The two pace words go together: "spent by the season's close" says what
  // happens after a due date, so it means nothing once the date is off.
  if (level < RUNG_LEVEL.pace && (out.when?.by !== undefined || out.when?.spend)) {
    const { by: _by, spend: _spend, ...rest } = out.when;
    out = { ...out, when: Object.keys(rest).length ? rest : undefined };
  }
  if (level < RUNG_LEVEL.condition) {
    if (out.when) out = { ...out, when: undefined };
    if (out.until.kind === "daily") out = { ...out, until: { kind: "times", n: out.until.n } };
  }
  return out;
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
  // Strip what the skill has not earned before the kind stand-in, so a stripped
  // daily (now a times count) goes through the counted-job path below like any
  // other counted job, rather than being read as still asking for the condition rung.
  const s = normalizeOrder(stripUnearned(state, n.req), n.kind);
  if (orderGate(state, s.req, s.kind).ok) return s;
  const level = skillLevel(state, gateSkill(s.req.task, s.req.arg)!);
  const once = { req: { ...s.req, until: { kind: "once" as const } }, kind: "job" as const };
  if (level < RUNG_LEVEL.job) return once;
  if (s.kind === "grind") return { req: { ...s.req, until: { kind: "times", n: GRIND_STAND_IN } }, kind: "job" };
  // A keep, at 3 or 5: the same target as a job that drops off when met.
  // "Keep it lit" has nothing to count and falls to light once.
  return normalizeOrder({ ...s.req, until: s.req.until.kind === "campHas" ? s.req.until : { kind: "once" } }, "job");
}
