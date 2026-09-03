/**
 * Intents: "Gather wood, forever, bring it to camp". An intent is a small
 * record; the runner below re-reads the world every minute and starts one
 * ordinary task at a time. It never computes a yield, an odd or a share;
 * the tasks do, exactly as when a player clicks them one by one.
 */
import type { Rng } from "../rng";
import { PACK_HARD_KG } from "../units";
import { regionAt, spotOf, type World } from "../world/gen";
import { itemLabel } from "./actions";
import { bodyStep, currentNeed, provision } from "./body";
import type { Calendar } from "./calendar";
import { canConsume, isEmpty, listItems, pile, pilesIn, qty, reach, resolveNeed, transfer, weight } from "./inventory";
import { ANIMALS, ITEM_KG, ITEM_NAMES, type Need, RECIPES, STRUCTURES } from "./items";
import { log } from "./log";
import { cellOf, forestCell, heathCell, kmBetween, rockCell, SPOT_WORDS, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { isRunning, type Step, takeStep, walkStep } from "./steps";
import { check, loadPack, stopTask, type TaskOption, whereIs } from "./tasks";
import type {
  GameState, Intent, Inventory, ItemId, RecipeId, SpotId, Species, StructureId, TaskId, Until,
} from "./types";

export type Where = "nearest" | SpotId | { cell: number };

/** The strip's choice, before the yield item is filled in. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" };

export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
}

/** Work that is done at camp whatever the ground. */
const CAMP_BOUND = new Set<TaskId>(["split", "cook", "light", "repair", "sharpen"]);
/** Work whose place is wherever you stand. */
const HERE = new Set<TaskId>(["haul", "night", "rest", "sleep"]);
/** Intents whose legality is not a question for check: the runner knows when they are over. */
const UNCHECKED = new Set<TaskId>(["night", "rest", "sleep"]);

const GROUND_OF: Partial<Record<TaskId, SpotId>> = {
  chop: "forest", sticks: "forest", bark: "forest", stone: "outcrop", berries: "heath", fish: "shore",
};

/** The ground a piece of work wants, as the spot that stands for it, or null when any ground does. */
function groundOf(task: TaskId, arg?: string): SpotId | null {
  if (task === "hunt") return ANIMALS[arg as Species].spot;
  if (task === "build" && arg === "snare") return "heath";
  return GROUND_OF[task] ?? null;
}

function suits(world: World, cell: number, ground: SpotId): boolean {
  switch (ground) {
    case "forest": return forestCell(world, cell);
    case "outcrop": return rockCell(world, cell);
    case "heath": return heathCell(world, cell);
    case "shore": return watersideCell(world, cell);
    case "camp": return true;
  }
}

/** The item "until camp has N" counts, or null when the work makes nothing countable. */
export function yieldItem(task: TaskId, arg?: string): ItemId | null {
  switch (task) {
    case "chop": return "log";
    case "sticks": return "stick";
    case "bark": return "bark";
    case "stone": return "stone";
    case "berries": return "berries";
    case "split": return "firewood";
    case "hunt": return "rawMeat";
    case "fish": return "fish";
    case "cook": return arg === "fish" ? "cookedFish" : "cookedMeat";
    case "craft": return RECIPES[arg as RecipeId].out.item ?? null;
    default: return null;
  }
}

/** Everything the work leaves in the pack that a delivery carries to camp. */
export function yieldItems(task: TaskId, arg?: string): ItemId[] | "all" {
  if (task === "haul") return "all";
  if (task === "chop") return ["log", "stick"];
  if (task === "hunt") return ["rawMeat", "hide", "bone", "sinew"];
  const one = yieldItem(task, arg);
  return one ? [one] : [];
}

/** Where the work is done, decided once. The note says when the chosen spot did not suit. */
export function resolveCell(state: GameState, world: World, task: TaskId, arg: string | undefined, where: Where): { cell: number; note: string } {
  const here = cellOf(state, world);
  if (typeof where === "object") return { cell: where.cell, note: "" };
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  if (HERE.has(task)) return { cell: here, note: "" };
  if (CAMP_BOUND.has(task) || (task === "build" && arg !== "snare")) return { cell: st.campCell, note: "" };
  if (task === "craft") {
    const needs = RECIPES[arg as RecipeId].needs;
    return { cell: canConsume(reach(state, world), needs) ? here : st.campCell, note: "" };
  }
  const ground = groundOf(task, arg);
  if (!ground) return { cell: here, note: "" };
  let note = "";
  if (where !== "nearest") {
    const s = spotOf(r, where);
    if (s && suits(world, s.cell, ground)) return { cell: s.cell, note: "" };
    note = `${SPOT_WORDS[where]} does not suit; going to ${SPOT_WORDS[ground]} instead`;
  }
  if (suits(world, here, ground)) return { cell: here, note };
  const s = spotOf(r, ground);
  // No such ground in this region: check at the cell under foot says so in its own words.
  return { cell: s ? s.cell : here, note };
}

/** The button: legality judged where the work would be done, so ground is never the reason. */
export function intentOption(state: GameState, world: World, cal: Calendar, task: TaskId, arg: string | undefined, where: Where): TaskOption {
  const { cell } = resolveCell(state, world, task, arg, where);
  return check(state, world, cal, task, arg, cell);
}

/** Sets out. False when the work could not start at its place; the button already said why. */
export function startIntent(state: GameState, world: World, cal: Calendar, rng: Rng, req: IntentRequest): boolean {
  if (state.dead || req.task === "walk" || req.task === "travel") return false;
  const { cell, note } = resolveCell(state, world, req.task, req.arg, req.where);
  if (!UNCHECKED.has(req.task)) {
    const o = check(state, world, cal, req.task, req.arg, cell);
    if (!o.ok && !(req.task === "build" && req.arg !== "snare" && canFetch(state, world, req.arg as StructureId, regionState(state, world, state.player.region).campCell))) return false;
  }
  const item = yieldItem(req.task, req.arg);
  let until: Until = req.until.kind === "campHas"
    ? item ? { kind: "campHas", item, qty: req.until.qty } : { kind: "once" }
    : req.until;
  // A leave-it intent can never meet "camp has N"; the promise is about the camp pile.
  let deliver = req.until.kind === "campHas" ? "camp" : req.deliver;
  if (req.task === "haul") {
    until = { kind: "once" };
    deliver = "camp";
  }
  if (req.task === "night") until = { kind: "once" };
  // Whatever was under way, by hand or by intent, is set aside with its share kept.
  stopTask(state, world);
  state.intent = {
    task: req.task, arg: req.arg, cell,
    campCell: regionState(state, world, state.player.region).campCell,
    until, deliver, done: 0, step: "setting out", need: null,
  };
  runIntent(state, world, cal, rng);
  // The note (a chosen spot that did not suit) belongs on the first step, not "setting out".
  if (note && state.intent) state.intent.step = `${note}; ${state.intent.step}`;
  return true;
}

export function endIntent(state: GameState, text: string, kind?: "good" | "bad"): void {
  log(state, text, kind);
  state.intent = null;
}

function labelOf(state: GameState, world: World, cal: Calendar, it: Intent): string {
  return check(state, world, cal, it.task, it.arg, it.cell).label;
}

/** "Fell a tree, until camp has 40 logs, bringing it to camp". */
export function intentSentence(state: GameState, world: World, cal: Calendar, it: Intent): string {
  const parts = [labelOf(state, world, cal, it)];
  const u = it.until;
  if (u.kind === "times") parts.push(`${it.done} of ${u.n} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(u.item, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  if (it.deliver === "camp" && it.task !== "haul") parts.push("bringing it to camp");
  return parts.join(", ");
}

function untilMet(state: GameState, it: Intent): boolean {
  if (it.task === "haul") return isEmpty(pile(state, it.cell));
  const u = it.until;
  switch (u.kind) {
    case "once": return it.done >= 1;
    case "times": return it.done >= u.n;
    case "campHas": return qty(pile(state, it.campCell), u.item) >= u.qty - 1e-9;
    case "forever": return false;
  }
}

/** The pack holds something a delivery should carry, or cannot take more anyway. */
function packCarries(state: GameState, it: Intent): boolean {
  const pack = state.player.pack;
  if (weight(pack) >= PACK_HARD_KG - 1e-9) return true;
  const items = yieldItems(it.task, it.arg);
  if (items === "all") return !isEmpty(pack);
  return items.some((i) => qty(pack, i) > 1e-9);
}

/**
 * Something is owed to camp: on the ground at the work cell, or on your back.
 * Work done at camp itself never owes the ground there - it already landed
 * in the camp pile - but the pack can still hold something unrelated that
 * arrived with the player and is still owed a drop.
 */
function deliveryPending(state: GameState, it: Intent): boolean {
  if (it.deliver !== "camp") return false;
  if (it.cell === it.campCell) return packCarries(state, it);
  return !isEmpty(pile(state, it.cell)) || packCarries(state, it);
}

function loadFull(state: GameState, it: Intent): boolean {
  if (it.cell === it.campCell) return false;
  return weight(state.player.pack) + weight(pile(state, it.cell)) >= PACK_HARD_KG - 1e-9;
}

function dropEverything(state: GameState, world: World): void {
  const from = state.player.pack;
  const to = pile(state, cellOf(state, world));
  for (const { item, qty: q } of listItems(from)) transfer(from, to, item, q);
}

type Outcome = "again" | undefined;

/**
 * A walk the runner starts. Leaving the home camp, it pockets provisions
 * first. A walk that cannot start ends the intent with the walk's reason.
 */
function walkTo(state: GameState, world: World, cal: Calendar, it: Intent, cell: number, why: string): Outcome {
  const here = cellOf(state, world);
  if (here === cell) return undefined;
  if (here === it.campCell) provision(state, world);
  const o = check(state, world, cal, "walk", `cell:${cell}`);
  if (!o.ok) {
    endIntent(state, `${labelOf(state, world, cal, it)}: ${o.why}. You stop.`, "bad");
    return undefined;
  }
  takeStep(state, world, cal, walkStep(state, world, cell, why));
  return undefined;
}

/**
 * One step of a haul leg, inferred from where you are and what you carry:
 * at the pile, fill up first; carrying anything, take it to camp; at camp,
 * unload; otherwise go back for the rest.
 */
function deliveryStep(state: GameState, world: World, cal: Calendar, it: Intent): Outcome {
  const here = cellOf(state, world);
  const pack = state.player.pack;
  // The work cell and the camp pile are the same pile when they are the same cell: nothing to load.
  if (it.cell !== it.campCell && here === it.cell && !isEmpty(pile(state, it.cell)) && weight(pack) < PACK_HARD_KG - 1e-9) {
    const before = weight(pack);
    loadPack(state, world);
    if (weight(pack) > before + 1e-9) {
      it.step = "loading up";
      return "again";
    }
  }
  // At camp, whatever is on the back comes off, yield or not - it is not going back out.
  if (packCarries(state, it) || (here === it.campCell && !isEmpty(pack))) {
    if (here !== it.campCell) return walkTo(state, world, cal, it, it.campCell, " with the load");
    dropEverything(state, world);
    it.step = "unloading at camp";
    return "again";
  }
  if (here !== it.cell) return walkTo(state, world, cal, it, it.cell, " for the rest");
  // At the pile with nothing loaded and nothing that counts: what is on your back is in the way. Take it to camp.
  return walkTo(state, world, cal, it, it.campCell, " with the load");
}

interface FetchSources {
  /** Needs of the build that neither the pack nor the camp pile can meet. */
  missing: Need[];
  /** An inventory holds something the build is missing. */
  wanted: (inv: Inventory) => boolean;
  /** This region's non-camp piles that hold something missing, reachable from `from`, nearest first. */
  sources: { cell: number; inv: Inventory; km: number }[];
}

/** What a build still needs and where in the region it might be found, from one shared cell so canFetch and fetchStep never disagree. */
function fetchSources(state: GameState, world: World, sid: StructureId, campCell: number, from: number): FetchSources {
  const campInvs = [state.player.pack, pile(state, campCell)];
  const missing = STRUCTURES[sid].needs.filter((n) => resolveNeed(campInvs, n) === null);
  const wanted = (inv: Inventory) => missing.some((n) => qty(inv, n.item) > 1e-9 || (n.alt !== undefined && qty(inv, n.alt) > 1e-9));
  const sources = pilesIn(state, world, state.player.region)
    .filter((x) => x.cell !== campCell && wanted(x.inv))
    .map((x) => ({ ...x, km: kmBetween(world, from, x.cell) }))
    .filter((x): x is { cell: number; inv: Inventory; km: number } => x.km !== null)
    .sort((a, b) => a.km - b.km);
  return { missing, wanted, sources };
}

/** Some pile in this region, other than camp's, holds a material the build still lacks and can be walked to from here. */
function canFetch(state: GameState, world: World, sid: StructureId, campCell: number): boolean {
  const { missing, sources } = fetchSources(state, world, sid, campCell, cellOf(state, world));
  return missing.length > 0 && sources.length > 0;
}

/** Moves the missing materials of a build from this region's piles to camp, one load at a time. Undefined when there is nothing to fetch. */
function fetchStep(state: GameState, world: World, cal: Calendar, it: Intent): Outcome | "none" {
  const sid = it.arg as StructureId;
  const st = regionState(state, world, state.player.region);
  if ((st.build[sid] ?? 0) > 0) return "none";
  const p = state.player;
  const campInvs = [p.pack, pile(state, it.campCell)];
  if (canConsume(campInvs, STRUCTURES[sid].needs)) return "none";
  const here = cellOf(state, world);
  const { missing, wanted, sources } = fetchSources(state, world, sid, it.campCell, here);
  if (wanted(p.pack)) {
    if (here !== it.campCell) return walkTo(state, world, cal, it, it.campCell, " with materials");
    dropEverything(state, world);
    it.step = "laying out materials at camp";
    return "again";
  }
  if (!sources.length) return "none";
  const src = sources[0];
  if (here !== src.cell) return walkTo(state, world, cal, it, src.cell, " for materials");
  // The missing things first, then whatever else fits.
  let room = PACK_HARD_KG - weight(p.pack);
  for (const n of missing) {
    for (const item of [n.item, n.alt].filter((x): x is ItemId => x !== undefined)) {
      const have = qty(src.inv, item);
      const unit = ITEM_KG[item];
      const max = unit >= 1 ? Math.floor(room / unit + 1e-9) : room / unit;
      const take = Math.min(have, Math.max(0, max));
      if (take > 0) {
        transfer(src.inv, p.pack, item, take);
        room -= take * unit;
      }
    }
  }
  loadPack(state, world);
  it.step = "loading materials";
  return "again";
}

/** What each piece of work looks like while it is happening, in place of the button's label. */
const GERUND: Partial<Record<TaskId, (arg?: string) => string>> = {
  chop: () => "felling a tree",
  sticks: () => "gathering sticks",
  bark: () => "stripping bark",
  stone: () => "gathering stone",
  berries: () => "picking berries",
  split: () => "splitting a log",
  hunt: (arg) => `hunting ${ANIMALS[arg as Species].name}`,
  fish: () => "fishing",
  cook: (arg) => `cooking ${ITEM_NAMES[(arg ?? "rawMeat") as ItemId]}`,
  craft: (arg) => `making ${RECIPES[arg as RecipeId].name}`,
  repair: () => "mending clothing",
  sharpen: () => "sharpening the axe",
  build: (arg) => `building the ${STRUCTURES[arg as StructureId].name}`,
  light: () => "lighting the fire",
  rest: () => "resting",
  sleep: () => "sleeping",
};

/** The work step's text, with the place named when it is not where the camp pile sits. */
function workGerund(state: GameState, world: World, it: Intent): string {
  const g = GERUND[it.task]?.(it.arg) ?? it.task;
  return it.cell === it.campCell ? g : `${g} at ${whereIs(state, world, it.cell)}`;
}

/** The work tier: one rule fires. "again" means an instant action was taken and the next decision can follow at once. */
function workStep(state: GameState, world: World, cal: Calendar): Outcome {
  const it = state.intent!;
  const here = cellOf(state, world);
  const label = labelOf(state, world, cal, it);
  if (it.task === "build" && it.arg !== "snare") {
    const f = fetchStep(state, world, cal, it);
    if (f !== "none") return f;
  }
  const o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
  const met = untilMet(state, it);
  if (met || (o && !o.ok)) {
    if (deliveryPending(state, it)) return deliveryStep(state, world, cal, it);
    if (met) endIntent(state, `${label}: done.`, "good");
    else endIntent(state, `${label}: ${o!.why}. You stop.`, "bad");
    return undefined;
  }
  if (it.deliver === "camp" && (it.task === "haul" || loadFull(state, it))) return deliveryStep(state, world, cal, it);
  if (here !== it.cell) return walkTo(state, world, cal, it, it.cell, "");
  if (it.task === "night") return undefined;
  const step: Step = { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
  if (!takeStep(state, world, cal, step)) endIntent(state, `${label}: cannot go on. You stop.`, "bad");
  return undefined;
}

/**
 * Called once a minute by advance, after stepTask. The body tier may take
 * over a running task; the work tier runs only when the slot is free. At
 * most eight instant actions chain in one call, as the old haul plan did.
 */
export function runIntent(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (!state.intent || state.dead) return;
  const it = state.intent;
  const need = currentNeed(state, cal, it);
  it.need = need;
  if (need) {
    const s = bodyStep(state, world, cal, rng, need);
    if (s) {
      if (!isRunning(state, s)) takeStep(state, world, cal, s);
      return;
    }
  }
  for (let guard = 0; guard < 8 && state.intent && !state.task; guard++) {
    if (workStep(state, world, cal) !== "again") return;
  }
}
