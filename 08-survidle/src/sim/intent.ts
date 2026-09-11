import { localWeather } from "./weather";
/**
 * Intents: "Gather wood, forever, bring it to camp". An intent is a small
 * record; the runner below re-reads the world every minute and starts one
 * ordinary task at a time. It never computes a yield, an odd or a share;
 * the tasks do, exactly as when a player clicks them one by one.
 */
import type { Rng } from "../rng";
import { cellAt, regionAt, spotOf, type World } from "../world/gen";
import { itemLabel } from "./actions";
import { absence, popOf } from "./animals";
import { orderKit, provision, provisionKit, tooExhausted } from "./body";
import type { Calendar } from "./calendar";
import { bankFire } from "./fire";
import { recordOpportunityEvent } from "./opportunities";
import { canConsume, isEmpty, listItems, pile, pileAt, pilesIn, qty, reach, resolveNeed, TRACE_KG, transfer, weight } from "./inventory";
import { body } from "./person";
import { ITEM_KG, ITEM_NAMES, type Need, RECIPES, ROOT_FROM_DOY, ROOT_POOR_SHARE, ROOT_TO_DOY, STRUCTURES } from "./items";
import { log } from "./log";
import { cellOf, forestCell, heathCell, kmBetween, rockCell, SPOT_WORDS, straightKm, watersideCell } from "./position";
import { campSite, regionState } from "./regionstate";
import { owningOrder } from "./orderowner";
import { survivorRoute } from "./routing";
import { nearestSeep, seepGround } from "./seep";
import { rootCellFullKg, rootCellKg } from "./stocks";
import { fishSpecies, type Species, SPECIES_DEFS, waterOf } from "./species";
import { walkableIce } from "./weather";
import { type Step, takeStep, walkStep } from "./steps";
import { campWaterRoom, ICE_SHORE_CM, pourVessels, vesselLitres } from "./water";
import { check, isShortAtCamp, loadPack, setAside, type InitialWalk, type TaskOption, whereIs } from "./tasks";
import { bestHuntCell, hasRecentHuntSign, huntEstimate } from "./hunting";
import { knownBearDen } from "./wildlife-agents";
import { noteHauledHuntFood } from "./hunt-audit";
import type {
  GameState, Intent, IntentRequest, Inventory, ItemId, RecipeId, SpotId, StructureId, TaskId, Until, UntilChoice, Where, WorkIntent,
} from "./types";
import { isWorkIntent } from "./types";

/**
 * Whose an intent is, read once from what it was asked to do. A once order
 * is the player's own choice in the moment and stays theirs: the body never
 * moves it. Everything the runner keeps going on its own - a standing or
 * counted order is the runner's, and so is the night out, a
 * once whose only content is the sleep the body serves.
 */
export function intentMode(task: TaskId, until: Until | UntilChoice): WorkIntent["mode"] {
  if (task === "night") return "runner";
  return until.kind === "once" ? "hand" : "runner";
}

export type { IntentRequest, UntilChoice, Where } from "./types";

/** Work that is done at camp whatever the ground. */
const CAMP_BOUND = new Set<TaskId>(["split", "splitWedges", "lightIndoors", "repair", "sharpen", "hone", "hang", "mend"]);
/** Work whose place is wherever you stand. */
const HERE = new Set<TaskId>(["haul", "night", "rest", "sleep"]);
/** Intents whose legality is not a question for check: the runner knows when they are over. */
const UNCHECKED = new Set<TaskId>(["night", "rest", "sleep"]);

const GROUND_OF: Partial<Record<TaskId, SpotId>> = {
  chop: "forest", deadwood: "forest", sticks: "forest", bark: "forest", stone: "outcrop", berries: "heath",
  fill: "shore", iceHole: "shore", read: "shore", setTrap: "shore",
};

/** The ground a piece of work wants, as the spot that stands for it, or null when any ground does. An order saved against a species the catalogue no longer has names no ground. */
export function groundOf(task: TaskId, arg?: string): SpotId | null {
  // "Anything" names no species: a cast for it goes to the shore, a hunt for it is placed by anyCell below.
  if (arg === "any") return task === "hunt" ? "forest" : task === "fish" ? "shore" : null;
  if (task === "hunt" || task === "fish") return SPECIES_DEFS[arg as Species]?.hunt?.spot ?? null;
  if (task === "build" && arg === "snare") return "heath";
  // A seep fetch goes to the seep, a dig to wet ground: neither is a spot.
  if (task === "fill" && arg === "seep") return null;
  return GROUND_OF[task] ?? null;
}

/** The water is part of the ground for a species that lives on one kind of it. */
function suits(world: World, cell: number, ground: SpotId, water: "lake" | "sea" | null): boolean {
  switch (ground) {
    case "forest": return forestCell(world, cell);
    case "outcrop": return rockCell(world, cell);
    case "heath": return heathCell(world, cell);
    case "shore": return watersideCell(world, cell, water ?? "any");
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
    case "eggs": return "eggs";
    case "innerBark": return "freshBark";
    case "grindBark": return "barkFlour";
    case "roots": return "roots";
    case "tapSap": return null;
    case "seaweed": return "seaweed";
    case "split": return "firewood";
    case "splitWedges": return "firewood";
    case "deadwood": return "firewood";
    case "hunt": return "rawMeat";
    case "fish": return "fish";
    case "cook": return arg === "fish" ? "cookedFish" : arg === "oilyFish" ? "cookedOilyFish" : arg === "rawFat" ? "fat" : arg === "roots" ? "cookedRoots" : "cookedMeat";
    case "craft": return RECIPES[arg as RecipeId].out.item ?? null;
    case "fill": return "water";
    case "melt": return "water";
    case "hang": return "driedMeat";
    case "emptyTrap": return "fish";
    default: return null;
  }
}

/** Everything the work leaves in the pack that a delivery carries to camp. */
export function yieldItems(task: TaskId, arg?: string): ItemId[] | "all" {
  if (task === "haul") return "all";
  if (task === "chop") return ["log", "stick"];
  if (task === "hunt") return ["rawMeat", "hide", "fur", "rawFat", "bone", "sinew"];
  // A fill's or a melt's litres never sit in the pack as an item; packCarries reads the vessels instead.
  if (task === "fill" || task === "melt") return ["water"];
  // Hang moves raw meat onto the rack; nothing lands in the pack for a delivery to carry.
  if (task === "hang") return [];
  // A catch can be either fish class, and a spawning one brings roe too.
  if (task === "fish") return ["fish", "oilyFish", "roe"];
  if (task === "emptyTrap") return ["fish", "oilyFish"];
  const one = yieldItem(task, arg);
  return one ? [one] : [];
}

/**
 * Where a hunt for anything goes. It names no species and so no single kind
 * of ground: use the nearest reachable cell where this hunter has something
 * worth hunting. A named place remains an explicit override when it works.
 */
function anyHuntCell(state: GameState, world: World, cal: Calendar, where: Where): { cell: number; note: string } {
  const r = regionAt(world, state.player.region);
  const weigh = (cell: number) => huntEstimate(state, world, cal, cell).kgPerHour;
  if (typeof where === "string" && where !== "nearest") {
    const s = spotOf(r, where);
    if (s && weigh(s.cell) > 0) return { cell: s.cell, note: "" };
    return { cell: nearestCell(state, world, (cell) => weigh(cell) > 0), note: `${SPOT_WORDS[where]} does not suit; going to the nearest hunting ground instead` };
  }
  return { cell: bestHuntCell(state, world, cal), note: "" };
}

/**
 * The nearest cell of this region matching `pred`, by straight line then a
 * route check, `here` when none does.
 */
export function nearestCell(state: GameState, world: World, pred: (cell: number) => boolean): number {
  const here = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  const cells = r.cells.filter(pred).sort((a, b) => straightKm(world, here, a) - straightKm(world, here, b));
  for (const c of cells.slice(0, 8)) if (survivorRoute(state, world, here, c, "none")) return c;
  return here;
}

/** Where the work is done, decided once. The note says when the chosen spot did not suit. */
export function resolveCell(state: GameState, world: World, cal: Calendar, task: TaskId, arg: string | undefined, where: Where): { cell: number; note: string } {
  const here = cellOf(state, world);
  if (task === "findShelter" || task === "improveCover" || task === "emergencyShelter" || task === "readSky") return { cell: typeof where === "object" ? where.cell : here, note: "" };
  // The site is chosen at the click, not wherever the runner happens to be standing when
  // the order starts; named explicitly, ahead of the generic object check below, so the
  // binding still holds even if that check is ever narrowed to fewer tasks.
  if (task === "makeCamp") return { cell: typeof where === "object" ? where.cell : here, note: "" };
  if (typeof where === "object") return { cell: where.cell, note: "" };
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  if (HERE.has(task)) return { cell: here, note: "" };
  if (task === "build" && arg === "seep") {
    // The nearest wet cell with no seep on it.
    return { cell: nearestCell(state, world, (c) => seepGround(world, c) !== null && !state.seeps[c]), note: "" };
  }
  // No camp to bind to: the work is judged where the survivor stands, and the camp
  // guard in `check` is what refuses it, rather than a cell chosen to carry the refusal.
  if (CAMP_BOUND.has(task) || (task === "build" && arg !== "snare")) return { cell: st.campCell ?? here, note: "" };
  if (task === "craft") {
    const needs = RECIPES[arg as RecipeId].needs;
    return { cell: canConsume(reach(state, world), needs) ? here : (st.campCell ?? here), note: "" };
  }
  if (task === "hunt" && arg === "any") return anyHuntCell(state, world, cal, where);
  if (task === "hunt" && arg === "bear") {
    const den = knownBearDen(state, cal);
    if (den?.denCell !== null && den?.denCell !== undefined) return { cell: den.denCell, note: "" };
  }
  if (task === "fill" && st.iceHole && localWeather(state, world).iceCm >= ICE_SHORE_CM) return { cell: st.iceHole.cell, note: "" };
  if (task === "emptyTrap" && st.trap) return { cell: st.trap.cell, note: "" };
  if (task === "fill" && arg === "seep") {
    // The nearest seep holding water; failing that the nearest seep, whose row says why it is shut.
    const withWater = nearestSeep(state, world, here, (s) => s.litres > 1e-9);
    const any = withWater ?? nearestSeep(state, world, here, () => true);
    return { cell: any ?? here, note: "" };
  }
  if (task === "setTrap") {
    return { cell: nearestCell(state, world, (cell) => (state.player.known[cell]?.fish.length ?? 0) > 0), note: "" };
  }
  if (task === "eggs") {
    return { cell: nearestCell(state, world, (cell) => watersideCell(world, cell) || heathCell(world, cell)), note: "" };
  }
  if (task === "innerBark") return { cell: nearestCell(state, world, (c) => cellAt(world, c).terrain === "pine"), note: "" };
  if (task === "tapSap") return { cell: nearestCell(state, world, (c) => cellAt(world, c).terrain === "birch"), note: "" };
  if (task === "seaweed") return { cell: nearestCell(state, world, (c) => watersideCell(world, c, "sea")), note: "" };
  if (task === "roots") {
    // Outside the digging season the bog and the meadow are frozen solid and only the water
    // reaches the rhizomes, through a hole cut in the ice. So a winter dig goes to the open
    // hole and not to the nearest root ground: sent to the bog it was refused with "the
    // ground is frozen" every winter day, and the winter row on the list never once ran.
    const winter = cal.dayOfYear < ROOT_FROM_DOY || cal.dayOfYear > ROOT_TO_DOY;
    if (winter && st.iceHole && watersideCell(world, st.iceHole.cell)) return { cell: st.iceHole.cell, note: "" };
    // A patch worth digging first: a cell dug below the poor line gives up its roots slower,
    // and the ground next to it has not been touched. Failing that, whatever is left anywhere.
    const worth = (c: number) => rootCellKg(st, world, c) >= rootCellFullKg(world, c) * ROOT_POOR_SHARE;
    const anyLeft = (c: number) => rootCellKg(st, world, c) > TRACE_KG;
    const root = (c: number) => rootCellFullKg(world, c) > 0;
    const good = (c: number) => root(c) && worth(c);
    return { cell: nearestCell(state, world, r.cells.some(good) ? good : (c) => root(c) && anyLeft(c)), note: "" };
  }
  const ground = groundOf(task, arg);
  if (!ground) return { cell: here, note: "" };
  const water = (task === "hunt" || task === "fish") && SPECIES_DEFS[arg as Species] ? waterOf(arg as Species) : null;
  let note = "";
  if (where !== "nearest") {
    const s = spotOf(r, where);
    if (s && suits(world, s.cell, ground, water)) return { cell: s.cell, note: "" };
    note = `${SPOT_WORDS[where]} does not suit; going to ${SPOT_WORDS[ground]} instead`;
  }
  const usable = (cell: number) => {
    if (!suits(world, cell, ground, water)) return false;
    if (task === "chop" && (arg === "spruce" || arg === "pine" || arg === "birch") && cellAt(world, cell).terrain !== arg) return false;
    if (task === "hunt" && arg && arg !== "any" && !hasRecentHuntSign(state, cell, arg as Species)) return false;
    if (task !== "fish" || arg !== "any") return true;
    const seen = state.player.known[cell];
    return fishSpecies().some((species) => {
      if (seen && !seen.fish.includes(species)) return false;
      if (!r.capacity[species] || popOf(st, species) < 1) return false;
      if (absence(SPECIES_DEFS[species], cal, localWeather(state, world).iceCm)) return false;
      return watersideCell(world, cell, waterOf(species) ?? "any");
    });
  };
  if (usable(here)) return { cell: here, note };
  return { cell: nearestCell(state, world, usable), note };
}

/**
 * A build blocked at its own cell for want of materials gets one allowance:
 * something it needs sits elsewhere in the region and can be walked to. Only
 * when that is the actual reason it is blocked - "already built here" or
 * "clear the fire site first" get no allowance, fetching would not help
 * either. A delivery, not a second method: an order names one method and
 * waits when that method is shut. The one place this is decided, so
 * intentOption and startIntent never disagree about whether the button may
 * be pressed.
 */
function fetchAllowance(state: GameState, world: World, task: TaskId, arg: string | undefined, why: string): { ok: boolean; detail: string; source: number | null } {
  if (task !== "build" || arg === "snare" || !isShortAtCamp(why)) return { ok: false, detail: "", source: null };
  const sid = arg as StructureId;
  const campCell = regionState(state, world, state.player.region).campCell;
  if (campCell === null || !canFetch(state, world, sid, campCell)) return { ok: false, detail: "", source: null };
  const { missing, sources } = fetchSources(state, world, sid, campCell, cellOf(state, world));
  const src = sources[0];
  // Name what the nearest pile actually holds, not just the first thing missing overall.
  const need = missing.find((n) => qty(src.inv, n.item) > 1e-9 || (n.alt !== undefined && qty(src.inv, n.alt) > 1e-9))!;
  const item = qty(src.inv, need.item) > 1e-9 ? need.item : need.alt!;
  return { ok: true, detail: `fetching ${itemLabel(item, need.qty)} from ${whereIs(state, world, src.cell)} first`, source: src.cell };
}

function initialWalk(
  state: GameState, world: World, cal: Calendar, task: TaskId, arg: string | undefined,
  where: Where, workCell: number, fetchCell: number | null,
): InitialWalk | undefined {
  const here = cellOf(state, world);
  const target = fetchCell ?? workCell;
  if (target === here) return undefined;
  const walk = check(state, world, cal, "walk", `cell:${target}`);
  const km = kmBetween(state, world, here, target, walkableIce(localWeather(state, world)));
  if (!walk.ok || km === null) return undefined;
  const campCell = regionState(state, world, state.player.region).campCell;
  const explicit = typeof where === "string" && where !== "nearest";
  const ground = groundOf(task, arg);
  let destination: string;
  let nearest = false;
  if (fetchCell !== null) destination = whereIs(state, world, target);
  else if (target === campCell) destination = "camp";
  else if (explicit) destination = SPOT_WORDS[where];
  else if (task === "chop" && (arg === "spruce" || arg === "pine" || arg === "birch")) {
    destination = `${arg} forest`;
    nearest = true;
  } else if (ground) {
    destination = SPOT_WORDS[ground].replace(/^the /, "");
    nearest = true;
  } else destination = whereIs(state, world, target);
  return { cell: target, destination, nearest, km, minutes: walk.duration };
}

/** The button: legality judged where the work would be done, so ground is never the reason. */
export function intentOption(state: GameState, world: World, cal: Calendar, task: TaskId, arg: string | undefined, where: Where): TaskOption {
  const { cell } = resolveCell(state, world, cal, task, arg, where);
  const o = { ...check(state, world, cal, task, arg, cell), cell };
  const fa = fetchAllowance(state, world, task, arg, o.why);
  const walk = initialWalk(state, world, cal, task, arg, where, cell, fa.source);
  if (o.ok) return { ...o, initialWalk: walk };
  return fa.ok ? { ...o, ok: true, why: "", detail: fa.detail, initialWalk: walk } : o;
}

/** Sets out. False when the work could not start at its place; the button already said why. */
export function startIntent(state: GameState, world: World, cal: Calendar, rng: Rng, req: IntentRequest, orderId: number | null = null, runNow = true): boolean {
  if (state.dead || req.task === "travel") return false;
  // Clicks and queue starts share the collapse gate. Care starts sleep and
  // rest through its own row, so those recovery tasks remain available.
  if (!UNCHECKED.has(req.task) && tooExhausted(state)) return false;
  const { cell, note } = resolveCell(state, world, cal, req.task, req.arg, req.where);
  const item = yieldItem(req.task, req.arg);
  let until: Until = req.until.kind === "campHas"
    ? item ? { kind: "campHas", item, qty: req.until.qty } : { kind: "once" }
    // A daily count is the scheduler's own bookkeeping; the live intent just runs it as a target for today.
    : req.until.kind === "daily"
      ? { kind: "times", n: req.until.n }
      : req.until;
  // A leave-it intent can never meet "camp has N"; the promise is about the camp pile.
  let deliver = req.until.kind === "campHas" ? "camp" : req.deliver;
  if (req.task === "haul") {
    until = { kind: "once" };
    deliver = "camp";
  }
  // A night out is one sleep, not a promise to keep bringing anything anywhere.
  if (req.task === "night") {
    until = { kind: "once" };
    deliver = "leave";
  }
  // Tentatively in place, so the kit check below sees the new task; reverted on a failed check.
  const prevIntent = state.intent;
  const campCell = regionState(state, world, state.player.region).campCell;
  const mode = intentMode(req.task, until);
  const fields = {
    task: req.task, arg: req.arg, cell, campCell, until, deliver, orderRegion: state.player.region,
    done: 0, step: "setting out", orderId, windDown: false,
  };
  state.intent = mode === "hand" ? { mode, ...fields } : { mode, ...fields };
  // A bow hunt's arrows, or a set-snares job's snares, must be in the pack before the
  // check below, which reads the pack only; food and vessels stay in the camp pile
  // until the intent actually starts.
  const pocketed = provisionKit(state, world);
  if (!UNCHECKED.has(req.task)) {
    const o = check(state, world, cal, req.task, req.arg, cell);
    if (!o.ok && !fetchAllowance(state, world, req.task, req.arg, o.why).ok) {
      if (pocketed > 0) {
        const kit = orderKit(state)[0];
        if (kit && campCell !== null) transfer(state.player.pack, pile(state, campCell), kit, pocketed);
      }
      state.intent = prevIntent;
      return false;
    }
  }
  // Whatever was under way, by hand or by intent, is set aside with its share kept.
  setAside(state, world);
  // The first minute is the new intent's, unless the caller has a step of its
  // own to take on it: a care row spends its minute on the want that won
  // it rather than starting generic work here.
  if (runNow) runIntent(state, world, cal, rng);
  // The note (a chosen spot that did not suit) belongs on the first step, not "setting out".
  if (note && state.intent) state.intent.step = `${note}; ${state.intent.step}`;
  return true;
}

export function endIntent(state: GameState, text: string, kind?: "good" | "bad"): void {
  log(state, text, kind);
  state.intent = null;
}

function labelOf(state: GameState, world: World, cal: Calendar, it: WorkIntent): string {
  return check(state, world, cal, it.task, it.arg, it.cell).label;
}

/** "Fell a tree, until camp has 40 logs, bringing it to camp". */
export function intentSentence(state: GameState, world: World, cal: Calendar, it: Intent): string {
  if (!isWorkIntent(it)) return it.care === "camp" ? "Camp maintenance" : "Self-care";
  const parts = [labelOf(state, world, cal, it)];
  const u = it.until;
  if (u.kind === "times") parts.push(`${it.done} of ${u.n} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(u.item, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  if (it.deliver === "camp" && it.task !== "haul" && yieldItem(it.task, it.arg) !== null) parts.push("bringing it to camp");
  return parts.join(", ");
}

/**
 * A campHas intent stops as soon as the shortfall is in hand: the camp
 * pile, the pack, and, working away from camp, the pile at the work cell
 * too - so a gather stops the trip it crosses the target instead of
 * grinding on until a full pack forces it home. The order itself still
 * judges the camp pile alone (orderMet): a keep is a promise about camp,
 * and it is the live intent's job to decide when the work in hand is done.
 */
function untilMet(state: GameState, it: WorkIntent): boolean {
  if (it.task === "haul") return isEmpty(pile(state, it.cell));
  const u = it.until;
  switch (u.kind) {
    case "once": return it.done >= 1;
    case "times": return it.done >= u.n;
    case "campHas": {
      let have = qty(pileAt(state, it.campCell), u.item) + qty(state.player.pack, u.item);
      if (it.cell !== it.campCell) have += qty(pile(state, it.cell), u.item);
      return have >= u.qty - 1e-9;
    }
    case "forever": return false;
  }
}

/**
 * What "owed to camp" is judged against: the work, where it is done, and
 * the camp it owes. A live intent is one of these; so is a row on the list,
 * once its cell is resolved, which is how a row can ask whether its own
 * load has landed without an intent to ask through.
 */
export interface Delivery {
  task: TaskId;
  arg?: string;
  deliver: "leave" | "camp";
  cell: number;
  campCell: number | null;
}

/** The pack holds something a delivery should carry, or cannot take more anyway. */
function packCarries(state: GameState, world: World, d: Delivery): boolean {
  if (d.task === "fill" || d.task === "melt") {
    const room = campWaterRoom(pileAt(state, d.campCell), campSite(regionState(state, world, state.player.region)));
    return vesselLitres(state.player) > 0 && room > 0;
  }
  const pack = state.player.pack;
  if (weight(pack) >= body(state).packHardKg - 1e-9) return true;
  const items = yieldItems(d.task, d.arg);
  if (items === "all") return !isEmpty(pack);
  return items.some((i) => qty(pack, i) > 1e-9);
}

/**
 * Something is owed to camp: on the ground at the work cell, or on your back.
 * Work done at camp itself never owes the ground there - it already landed
 * in the camp pile - but the pack can still hold something unrelated that
 * arrived with the player and is still owed a drop.
 */
export function deliveryPending(state: GameState, world: World, d: Delivery): boolean {
  // Nowhere to deliver to: work with no camp owes nothing to one.
  if (d.deliver !== "camp" || d.campCell === null) return false;
  if (d.cell === d.campCell) return packCarries(state, world, d);
  return !isEmpty(pile(state, d.cell)) || packCarries(state, world, d);
}

function loadFull(state: GameState, it: WorkIntent): boolean {
  if (it.cell === it.campCell) return false;
  return weight(state.player.pack) + weight(pile(state, it.cell)) >= body(state).packHardKg - 1e-9;
}

/**
 * Everything off the back onto the pile here, except the kit this order
 * carries out with it. Returns whether anything actually moved: a hunt with
 * a bow keeps its arrows, so a pack holding only those is a pack that
 * cannot be emptied, and a caller that treated the unload as a step taken
 * would take it again the next minute and forever. A level-20 camp on seed
 * 19 did exactly that - fourteen hours a day standing at its own fire
 * "unloading at camp" with ten arrows in the pack - and starved on day 42
 * with an elk down and 5,645 kcal a day gathered.
 */
function dropEverything(state: GameState, world: World): boolean {
  const from = state.player.pack;
  const here = cellOf(state, world);
  const to = pile(state, here);
  const keep = new Set(orderKit(state));
  const atHome = isWorkIntent(state.intent) && state.intent.campCell === here;
  let moved = false;
  let recoveredMeat = 0;
  let recoveredFat = 0;
  for (const { item, qty: q } of listItems(from)) {
    if (keep.has(item)) continue;
    const kg = transfer(from, to, item, q);
    if (kg > 1e-9) {
      moved = true;
      if (item === "rawMeat" && isWorkIntent(state.intent)) {
        recoveredMeat = Math.min(kg, state.intent.recoveredMeatPackedKg ?? 0);
      } else if (item === "rawFat" && isWorkIntent(state.intent)) {
        recoveredFat = Math.min(kg, state.intent.recoveredFatPackedKg ?? 0);
      }
    }
  }
  // Unloading at the home camp empties the vessels too, as far as the vessels and trough at camp have room.
  if (atHome) moved = pourVessels(state.player, to, campSite(regionState(state, world, state.player.region))) > 1e-9 || moved;
  if (atHome && (recoveredMeat > 0 || recoveredFat > 0) && isWorkIntent(state.intent)) {
    state.intent.recoveredMeatPackedKg = Math.max(0, (state.intent.recoveredMeatPackedKg ?? 0) - recoveredMeat);
    state.intent.recoveredFatPackedKg = Math.max(0, (state.intent.recoveredFatPackedKg ?? 0) - recoveredFat);
    noteHauledHuntFood(state, recoveredMeat, recoveredFat);
    recordOpportunityEvent(state, { kind: "recoveredAtCamp" });
    const intent = state.intent;
    if ((intent.recoveredMeatAtSourceKg ?? 0) + (intent.recoveredMeatPackedKg ?? 0)
      + (intent.recoveredFatAtSourceKg ?? 0) + (intent.recoveredFatPackedKg ?? 0) <= 1e-9) {
      if (intent.recoveredSpecies !== undefined && intent.recoveredCarcassId !== undefined) {
        recordOpportunityEvent(state, { kind: "carcassRecovered", species: intent.recoveredSpecies, carcassId: intent.recoveredCarcassId });
      }
      delete intent.recoveredSpecies;
      delete intent.recoveredCarcassId;
    }
  }
  return moved;
}

type Outcome = "again" | undefined;

/**
 * A route required by work is one step of that work. The parent intent stays
 * live while the ordinary walk task moves it to the cell where its next step
 * can run. Only an explicit map click has a Walk row of its own.
 */
function walkTo(state: GameState, world: World, cal: Calendar, rng: Rng, it: WorkIntent, cell: number): Outcome {
  const here = cellOf(state, world);
  if (here === cell) return undefined;
  if (here === it.campCell) provision(state, world);
  const o = check(state, world, cal, "walk", `cell:${cell}`);
  if (!o.ok) {
    // An order's intent says nothing here either: the scheduler re-judges the
    // route next free minute and logs the reason once, through chooseOrder.
    if (it.orderId !== null) state.intent = null;
    else endIntent(state, `${labelOf(state, world, cal, it)}: ${o.why}. {You} {stop}.`, "bad");
    return undefined;
  }
  if (here === it.campCell && cell !== it.campCell) bankFire(state, world, state.player.region);
  takeStep(state, world, cal, walkStep(state, world, cell, ""), rng);
  return undefined;
}

/**
 * One step of a haul leg, inferred from where you are and what you carry:
 * at the pile, fill up first; carrying anything, take it to camp; at camp,
 * unload; otherwise go back for the rest.
 */
function deliveryStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: WorkIntent): Outcome {
  const campCell = it.campCell;
  if (campCell === null) return undefined;
  const here = cellOf(state, world);
  const pack = state.player.pack;
  // The work cell and the camp pile are the same pile when they are the same cell: nothing to load.
  if (it.cell !== it.campCell && here === it.cell && !isEmpty(pile(state, it.cell)) && weight(pack) < body(state).packHardKg - 1e-9) {
    const before = weight(pack);
    const loaded = loadPack(state, world);
    const recovered = Math.min(loaded.rawMeat ?? 0, it.recoveredMeatAtSourceKg ?? 0);
    const recoveredFat = Math.min(loaded.rawFat ?? 0, it.recoveredFatAtSourceKg ?? 0);
    if (recovered > 0) {
      it.recoveredMeatAtSourceKg = Math.max(0, (it.recoveredMeatAtSourceKg ?? 0) - recovered);
      it.recoveredMeatPackedKg = (it.recoveredMeatPackedKg ?? 0) + recovered;
    }
    if (recoveredFat > 0) {
      it.recoveredFatAtSourceKg = Math.max(0, (it.recoveredFatAtSourceKg ?? 0) - recoveredFat);
      it.recoveredFatPackedKg = (it.recoveredFatPackedKg ?? 0) + recoveredFat;
    }
    if (weight(pack) > before + 1e-9) {
      it.step = "loading up";
      return "again";
    }
  }
  // At camp, whatever is on the back comes off, yield or not - it is not going back out.
  // A pack holding nothing but this order's own kit comes off as nothing, and that is not a
  // step taken: fall through to the walk rather than claim one and stand here forever.
  if (packCarries(state, world, it) || (here === campCell && !isEmpty(pack))) {
    if (here !== campCell) return walkTo(state, world, cal, rng, it, campCell);
    if (dropEverything(state, world)) {
      it.step = "unloading at camp";
      return "again";
    }
  }
  if (here !== it.cell) return walkTo(state, world, cal, rng, it, it.cell);
  // At the pile with nothing loaded and nothing that counts: what is on your back is in the way. Take it to camp.
  return walkTo(state, world, cal, rng, it, campCell);
}

interface FetchNeed {
  /** Needs of the build that neither the pack nor the camp pile can meet. */
  missing: Need[];
  /** An inventory holds something the build is missing. */
  wanted: (inv: Inventory) => boolean;
}

interface FetchSources extends FetchNeed {
  /** This region's non-camp piles that hold something missing, reachable from `from`, nearest first. */
  sources: { cell: number; inv: Inventory; km: number }[];
}

/** What a build still needs, whatever the pack and the camp pile between them cannot cover. */
function fetchMissing(state: GameState, sid: StructureId, campCell: number): FetchNeed {
  const campInvs = [state.player.pack, pile(state, campCell)];
  const missing = STRUCTURES[sid].needs.filter((n) => resolveNeed(campInvs, n) === null);
  const wanted = (inv: Inventory) => missing.some((n) => qty(inv, n.item) > 1e-9 || (n.alt !== undefined && qty(inv, n.alt) > 1e-9));
  return { missing, wanted };
}

/**
 * What a build still needs and where in the region it might be found, from
 * one shared cell so canFetch and fetchStep never disagree. Scans every pile
 * in the region, so callers that only need `missing` (the carrying leg of a
 * fetch, already bound for camp) call fetchMissing instead.
 */
function fetchSources(state: GameState, world: World, sid: StructureId, campCell: number, from: number): FetchSources {
  const { missing, wanted } = fetchMissing(state, sid, campCell);
  const ice = walkableIce(localWeather(state, world));
  const sources = pilesIn(state, world, state.player.region)
    .filter((x) => x.cell !== campCell && wanted(x.inv))
    .map((x) => ({ ...x, km: kmBetween(state, world, from, x.cell, ice) }))
    .filter((x): x is { cell: number; inv: Inventory; km: number } => x.km !== null)
    .sort((a, b) => a.km - b.km);
  return { missing, wanted, sources };
}

/** Some pile in this region, other than camp's, holds a material the build still lacks and can be walked to from here. */
function canFetch(state: GameState, world: World, sid: StructureId, campCell: number): boolean {
  const { missing, sources } = fetchSources(state, world, sid, campCell, cellOf(state, world));
  return missing.length > 0 && sources.length > 0;
}

/** Moves the missing materials of a build from this region's piles to camp, one load at a time. "none" when there is nothing left to fetch, or nothing to be gained by trying. */
function fetchStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: WorkIntent): Outcome | "none" {
  const sid = it.arg as StructureId;
  const campCell = it.campCell;
  if (campCell === null) return "none";
  const st = regionState(state, world, state.player.region);
  if ((campSite(st)?.build[sid] ?? 0) > 0) return "none";
  const p = state.player;
  const campInvs = [p.pack, pile(state, campCell)];
  if (canConsume(campInvs, STRUCTURES[sid].needs)) return "none";
  const here = cellOf(state, world);
  const { missing, wanted } = fetchMissing(state, sid, campCell);
  if (wanted(p.pack)) {
    if (here !== campCell) return walkTo(state, world, cal, rng, it, campCell);
    dropEverything(state, world);
    it.step = "laying out materials at camp";
    return "again";
  }
  // The route-filtered source list scans every pile in the region; only worth it once carrying is ruled out.
  const { sources } = fetchSources(state, world, sid, campCell, here);
  if (!sources.length) return "none";
  const src = sources[0];
  if (here !== src.cell) return walkTo(state, world, cal, rng, it, src.cell);
  // The missing things first, then whatever else fits.
  const before = weight(p.pack);
  let room = body(state).packHardKg - weight(p.pack);
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
  // Nothing fit: standing here again next minute would not change that either. Let rule 5 end it with the real reason.
  if (weight(p.pack) <= before + 1e-9) return "none";
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
  eggs: () => "gathering eggs",
  innerBark: () => "stripping inner bark",
  grindBark: () => "grinding bark flour",
  roots: () => "digging roots",
  tapSap: () => "tapping a birch",
  seaweed: () => "gathering seaweed",
  split: () => "splitting a log",
  splitWedges: () => "splitting a log with wedges",
  deadwood: () => "gathering dead wood",
  hunt: (arg) => (arg === "any" ? "hunting" : `hunting ${SPECIES_DEFS[arg as Species]?.name ?? "game"}`),
  findDen: () => "following bear sign",
  findShelter: () => "looking for shelter",
  readSky: () => "reading the sky",
  improveCover: () => "improving shelter",
  emergencyShelter: () => "building emergency shelter",
  fish: (arg) => (arg === "any" ? "fishing" : `fishing for ${SPECIES_DEFS[arg as Species]?.name ?? "fish"}`),
  cook: (arg) => `cooking ${ITEM_NAMES[(arg ?? "rawMeat") as ItemId]}`,
  craft: (arg) => `making ${RECIPES[arg as RecipeId].name}`,
  repair: () => "mending clothing",
  sharpen: () => "sharpening the axe",
  hone: () => "honing the axe",
  build: (arg) => `building the ${STRUCTURES[arg as StructureId].name}`,
  mend: (arg) => `mending the ${STRUCTURES[arg as StructureId].name}`,
  light: () => "lighting the fire",
  lightTorch: () => "lighting a torch",
  rest: () => "resting",
  sleep: () => "sleeping",
  fill: () => "filling vessels",
  iceHole: () => "cutting an ice hole",
  hang: () => "hanging meat to dry",
  makeCamp: () => "making camp",
  crack: () => "cracking bones",
};

/**
 * The work step's text, with the place named when it is not where the camp pile sits.
 * A makeCamp never gets the place suffix: its cell is the new site, not the old
 * campCell it is bound to walk back to, and "making camp" already says where.
 */
function workGerund(state: GameState, world: World, it: WorkIntent): string {
  const g = GERUND[it.task]?.(it.arg) ?? it.task;
  if (it.task === "makeCamp") return g;
  return it.cell === it.campCell ? g : `${g} at ${whereIs(state, world, it.cell)}`;
}

/** The work tier: one rule fires. "again" means an instant action was taken and the next decision can follow at once. */
function workStep(state: GameState, world: World, cal: Calendar, rng: Rng): Outcome {
  const it = state.intent;
  if (!isWorkIntent(it)) return undefined;
  const here = cellOf(state, world);
  const label = labelOf(state, world, cal, it);
  if (it.task === "walk") {
    if (here === it.cell) {
      it.done++;
      const order = owningOrder(state, world, it);
      if (order) order.done++;
      state.intent = null;
      return "again";
    }
    if (!takeStep(state, world, cal, walkStep(state, world, it.cell, ""), rng)) state.intent = null;
    return undefined;
  }
  if (it.task === "build" && it.arg !== "snare") {
    const f = fetchStep(state, world, cal, rng, it);
    if (f !== "none") return f;
  }
  // A camp-bound delivery already standing at camp: whatever produce() left on the
  // back (it favours the pack over the ground when there is room) goes onto the
  // camp pile at once, so campHas can see it and nothing is ever carried back out.
  // Idempotent: once the pack holds none of the yield this does not fire again.
  if (it.deliver === "camp" && here === it.campCell && packCarries(state, world, it) && dropEverything(state, world)) {
    it.step = "unloading at camp";
    return "again";
  }
  const o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
  const met = it.windDown || untilMet(state, it);
  if (met || (o && !o.ok)) {
    if (deliveryPending(state, world, it)) return deliveryStep(state, world, cal, rng, it);
    // An order's intent says nothing: the scheduler removes a met job with its
    // done line and re-judges a blocked one, logging the reason once.
    if (it.orderId !== null || it.windDown) state.intent = null;
    else if (met) endIntent(state, `${label}: done.`, "good");
    else endIntent(state, `${label}: ${o!.why}. {You} {stop}.`, "bad");
    return undefined;
  }
  // One hunt intent carries one carcass identity. Finish that recovery before
  // another pursuit can replace it, even when this kill did not fill the pack.
  if (it.task === "hunt" && it.recoveredCarcassId !== undefined && deliveryPending(state, world, it)) {
    return deliveryStep(state, world, cal, rng, it);
  }
  if (it.deliver === "camp" && (it.task === "haul" || loadFull(state, it))) return deliveryStep(state, world, cal, rng, it);
  if (here !== it.cell) return walkTo(state, world, cal, rng, it, it.cell);
  if (it.task === "night") return undefined;
  const step: Step = { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
  if (!takeStep(state, world, cal, step, rng)) {
    if (it.orderId !== null) state.intent = null;
    else endIntent(state, `${label}: cannot go on. {You} {stop}.`, "bad");
  }
  return undefined;
}

/**
 * Called once a minute by advance, after stepTask. The runner takes the
 * minute the scheduler already gave it and nothing more: which row holds
 * it, either care row included, was decided on the list before this ever
 * runs, and nothing here revisits that choice. The collapse clause below
 * is the one thing beneath it - the floor under work the player chose by
 * hand, which nothing else is allowed to interrupt once it outranks the
 * body's row. Instant actions that cost the clock nothing - loading up,
 * unloading at camp, laying out materials for a build - chain in one
 * call, up to eight of them, for as long as nothing has claimed the
 * minute as a task of its own.
 */
export function runIntent(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (!state.intent || state.dead) return;
  const it = state.intent;
  // Care is advanced by the ranked care row in runOrders. It is not work
  // and never falls through into the work-intent state machine.
  if (!isWorkIntent(it)) return;
  // At the collapse line the work is released back to the queue. Its row
  // reads "too exhausted", so the next ranked row wins visibly instead of
  // a hidden recovery task bypassing the list.
  if (tooExhausted(state)) {
    state.player.collapsed = true;
    state.player.bodyNeed = "spent";
    setAside(state, world);
    if (it.orderId === null) endIntent(state, `${labelOf(state, world, cal, it)}: {you} {are} too exhausted. {You} {stop}.`, "bad");
    else state.intent = null;
    return;
  }
  for (let guard = 0; guard < 8 && state.intent && !state.task; guard++) {
    if (workStep(state, world, cal, rng) !== "again") return;
  }
}
