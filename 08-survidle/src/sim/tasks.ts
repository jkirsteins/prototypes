import type { Rng } from "../rng";
import { CELL_KM, PACK_HARD_KG } from "../units";
import { cellAt, hasSpot, regionAt, spotOf, type World } from "../world/gen";
import { findRoute, routeKm, routeMinutes } from "../world/route";
import { regionDensity } from "./animals";
import { type Calendar, minutesUntilDawn } from "./calendar";
import {
  canConsume, consume, hasTool, herePile, isEmpty, listItems, pile, produce, qty, reach,
  removeItem, tool, totalQty, transfer, wearTool, weight,
} from "./inventory";
import {
  ANIMALS, CLOTHING, ITEM_KG, ITEM_NAMES, MAX_SNARES, RECIPES, RECIPE_IDS, STRUCTURES,
  STRUCTURE_IDS, type SpeciesDef,
} from "./items";
import { log } from "./log";
import { baseWalkSpeed, walkSpeed, workSpeed } from "./player";
import {
  atCamp, byWater, cellCenter, cellIndex, cellOf, hereTerrain, inForest, onHeath, onRock,
  placeAt, setRegion, spotHere, SPOT_WORDS, straightKm,
} from "./position";
import { discovery, regionState } from "./regionstate";
import {
  type GameState, type PausedTask, type PlanStep, type RecipeId, SPECIES, type Species,
  type SpotId, type StructureId, type TaskId,
} from "./types";
import { DEEP_SNOW_CM } from "./weather";

export type TaskGroup = "gather" | "hunt" | "camp" | "craft" | "build" | "move";

export interface TaskOption {
  id: TaskId;
  arg?: string;
  group: TaskGroup;
  label: string;
  /** What it costs or yields, for the button's second line. */
  detail: string;
  /** Minutes at full speed, or 0 when it cannot start. */
  duration: number;
  ok: boolean;
  /** Why it cannot start, when it cannot. */
  why: string;
  repeatable: boolean;
  /** Share already done and waiting to be resumed, when there is one. */
  resume?: number;
}

export const SPOT_NAMES = SPOT_WORDS;

/** Work that stays where it was left: the half-felled tree is in that cell of forest. */
const LOCATED = new Set<TaskId>(["chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook"]);
/** Work you carry in your hands wherever you go. */
const CARRIED = new Set<TaskId>(["craft", "repair", "sharpen", "light"]);

/** Where a task's unfinished share is remembered, or null if it is not the kind that can be. */
export function pauseKey(state: GameState, world: World, id: TaskId, arg?: string): string | null {
  const a = arg ?? "";
  if (LOCATED.has(id)) return `${id}:${a}@${cellOf(state, world)}`;
  if (CARRIED.has(id)) return `${id}:${a}`;
  return null;
}

export function pausedFraction(state: GameState, world: World, id: TaskId, arg?: string): number {
  const key = pauseKey(state, world, id, arg);
  return key ? (state.paused[key]?.fraction ?? 0) : 0;
}

/** Tasks whose pace depends on the body; the rest are walks and waits. */
const WORK_TASKS = new Set<TaskId>([
  "chop", "sticks", "bark", "stone", "berries", "split", "hunt", "fish", "cook",
  "craft", "repair", "sharpen", "build", "light",
]);

/** Berries ripen mid-July and are gone by mid-October. */
export function berrySeason(cal: Calendar): boolean {
  return cal.dayOfYear >= 195 && cal.dayOfYear <= 288;
}

function needsList(needs: { item: string; qty: number; alt?: string }[]): string {
  return needs
    .map((n) => `${n.qty} ${ITEM_NAMES[n.item as keyof typeof ITEM_NAMES]}${n.alt ? ` (or ${ITEM_NAMES[n.alt as keyof typeof ITEM_NAMES]})` : ""}`)
    .join(", ");
}

/**
 * A walk's argument names its target: a spot of the current region, a
 * region's camp, or a bare cell (for things lying about and work set aside).
 */
export function walkTarget(state: GameState, world: World, arg: string): { cell: number; label: string } | null {
  const [kind, val] = arg.split(":");
  if (kind === "spot") {
    const s = spotOf(regionAt(world, state.player.region), val as SpotId);
    return s ? { cell: s.cell, label: SPOT_WORDS[val as SpotId] } : null;
  }
  if (kind === "region") {
    const r = regionAt(world, Number(val));
    return r ? { cell: r.campCell, label: r.name } : null;
  }
  if (kind === "cell") {
    const cell = Number(val);
    if (!Number.isInteger(cell) || cell < 0 || cell >= world.w * world.h) return null;
    return { cell, label: whereIs(state, world, cell) };
  }
  return null;
}

/** "the forest", "camp in Stensund", "a spot 0.4 km east": how a cell is named to the player. */
export function whereIs(state: GameState, world: World, cell: number): string {
  const region = cellAt(world, cell).region;
  const r = regionAt(world, region);
  const spot = r.spots.find((s) => s.cell === cell);
  const inRegion = region === state.player.region ? "" : ` in ${r.name}`;
  if (spot) return `${SPOT_WORDS[spot.id]}${inRegion}`;
  const here = cellCenter(world, cellOf(state, world));
  const there = cellCenter(world, cell);
  const dx = there.x - here.x;
  const dy = there.y - here.y;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
  return `a spot ${straightKm(world, cellOf(state, world), cell).toFixed(1)} km ${dir}${inRegion}`;
}

/**
 * The one place a task's legality and duration are decided. availableTasks
 * and startTask both go through it so the button and the click agree.
 */
export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string): TaskOption {
  const o = checkFresh(state, world, cal, id, arg);
  const fraction = pausedFraction(state, world, id, arg);
  if (fraction > 0 && o.ok) return { ...o, resume: fraction, duration: o.duration * (1 - fraction) };
  if (fraction > 0) return { ...o, resume: fraction };
  return o;
}

function checkFresh(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string): TaskOption {
  const p = state.player;
  const r = regionAt(world, p.region);
  const st = regionState(state, world, p.region);
  const invs = reach(state, world);
  const camp = atCamp(state, world);
  const opt = (partial: Partial<TaskOption> & { label: string; group: TaskGroup }): TaskOption => ({
    id, arg, detail: "", duration: 0, ok: true, why: "", repeatable: false, ...partial,
  });
  /** Ground the task needs under foot, with the spot to walk to when it is not. */
  const ground = (ok: boolean, spot: SpotId, what: string, o: TaskOption): TaskOption => {
    if (ok) return o;
    if (!hasSpot(r, spot)) return { ...o, ok: false, why: `no ${what} in ${r.name}` };
    return { ...o, ok: false, why: `stand ${what === "water" ? "by" : "in"} the ${what}; walk to ${SPOT_WORDS[spot]}` };
  };
  const needCamp = (o: TaskOption): TaskOption => (camp ? o : { ...o, ok: false, why: "walk to camp" });

  switch (id) {
    case "chop": {
      const o = ground(inForest(state, world), "forest", "forest", opt({ group: "gather", label: "Fell a tree", detail: "4 logs and 4 sticks left on the ground", duration: hereTerrain(state, world) === "spruce" ? 50 : 60, repeatable: true }));
      if (!o.ok) return o;
      if (!hasTool(p, "axe")) return { ...o, ok: false, why: "needs an axe" };
      if (st.wood < 1) return { ...o, ok: false, why: "nothing left worth felling" };
      return o;
    }
    case "sticks":
      return ground(inForest(state, world), "forest", "forest", opt({ group: "gather", label: "Gather sticks", detail: "6 sticks", duration: 20, repeatable: true }));
    case "bark":
      return ground(inForest(state, world), "forest", "forest", opt({ group: "gather", label: "Strip bark", detail: "4 bark, for cordage", duration: 20, repeatable: true }));
    case "stone":
      return ground(onRock(state, world), "outcrop", "rock", opt({ group: "gather", label: "Gather stone", detail: "3 stone", duration: 30, repeatable: true }));
    case "berries": {
      const o = ground(onHeath(state, world), "heath", "heath", opt({ group: "gather", label: "Pick berries", detail: "1 kg berries, mid-July to mid-October", duration: 60, repeatable: true }));
      if (!o.ok) return o;
      if (!berrySeason(cal)) return { ...o, ok: false, why: "nothing ripe yet" };
      return o;
    }
    case "split": {
      const o = opt({ group: "camp", label: "Split a log", detail: "one log into 20 kg of firewood", duration: 15, repeatable: true });
      if (!hasTool(p, "axe")) return { ...o, ok: false, why: "needs an axe" };
      if (totalQty(invs, "log") < 1) return { ...o, ok: false, why: "no logs here" };
      return o;
    }
    case "hunt": {
      const s = arg as Species;
      const def: SpeciesDef = ANIMALS[s];
      const d = regionDensity(state, world, p.region, s, cal);
      const onGround = def.spot === "heath" ? onHeath(state, world) : inForest(state, world);
      const o = ground(onGround, def.spot, def.spot === "heath" ? "heath" : "forest", opt({
        group: "hunt", label: `Hunt ${def.name}`, duration: def.minutes, repeatable: true,
        detail: `${def.meatKg} kg meat${def.hideKg ? `, ${def.hideKg} kg hide` : ""}${def.bone ? `, ${def.bone} bone` : ""}${def.sinew ? `, ${def.sinew} sinew` : ""}; about ${Math.round(huntOdds(state, cal, d, def) * 100)}% per try`,
      }));
      if (!o.ok) return o;
      if (!hasTool(p, "bow")) return { ...o, ok: false, why: "needs a bow" };
      if (totalQty([p.pack], "arrow") < 1) return { ...o, ok: false, why: "needs arrows in the pack" };
      if (st.pop[s] < 1) return { ...o, ok: false, why: `no ${def.name} here` };
      return o;
    }
    case "fish": {
      const def = ANIMALS.fish;
      const d = regionDensity(state, world, p.region, "fish", cal);
      const o = ground(byWater(state, world), "shore", "water", opt({ group: "hunt", label: "Fish", duration: def.minutes, repeatable: true, detail: `0.7 kg per catch; about ${Math.round(huntOdds(state, cal, d, def) * 100)}% per try` }));
      if (!o.ok) return o;
      if (!hasTool(p, "fishingSpear")) return { ...o, ok: false, why: "needs a fishing spear" };
      if (st.pop.fish < 1) return { ...o, ok: false, why: "the water is empty" };
      return o;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      const o = needCamp(opt({ group: "camp", label: `Cook ${ITEM_NAMES[food]}`, detail: "1 kg at a time over the fire", duration: Math.max(1, 10 * kg), repeatable: true }));
      if (!o.ok) return o;
      if (!st.fire.lit) return { ...o, ok: false, why: "needs a lit fire" };
      if (kg <= 0) return { ...o, ok: false, why: `no ${ITEM_NAMES[food]} here` };
      return o;
    }
    case "craft": {
      const rec = RECIPES[arg as RecipeId];
      const o = opt({ group: "craft", label: rec.name, detail: needsList(rec.needs) + (rec.tool ? `; needs a ${rec.tool === "needle" ? "needle" : rec.tool}` : ""), duration: rec.minutes, repeatable: rec.out.item !== undefined });
      if (rec.tool && !hasTool(p, rec.tool)) return { ...o, ok: false, why: `needs a ${rec.tool === "fishingSpear" ? "fishing spear" : rec.tool}` };
      if (!canConsume(invs, rec.needs)) return { ...o, ok: false, why: "missing materials" };
      return o;
    }
    case "repair": {
      const o = opt({ group: "camp", label: "Mend clothing", detail: "0.5 kg hide; +40 wear on the most worn piece", duration: 30 });
      if (!hasTool(p, "needle")) return { ...o, ok: false, why: "needs a bone needle" };
      if (totalQty(invs, "hide") < 0.5) return { ...o, ok: false, why: "needs 0.5 kg hide" };
      if (!p.clothing.some((g) => g.durability < 100)) return { ...o, ok: false, why: "nothing needs mending" };
      return o;
    }
    case "sharpen": {
      const o = opt({ group: "camp", label: "Sharpen the axe", detail: "1 stone; axe +30", duration: 15 });
      const axe = tool(p, "axe");
      if (!axe) return { ...o, ok: false, why: "no axe" };
      if (totalQty(invs, "stone") < 1) return { ...o, ok: false, why: "needs a stone" };
      if (axe.durability >= 100) return { ...o, ok: false, why: "already sharp" };
      return o;
    }
    case "build": {
      const sid = arg as StructureId;
      const def = STRUCTURES[sid];
      const done = st.build[sid] ?? 0;
      const o = opt({ group: "build", label: def.name, detail: `${needsList(def.needs)}; ${def.desc}`, duration: Math.max(1, def.minutes - done) });
      if (sid === "snare") {
        const o2 = ground(onHeath(state, world), "heath", "heath", o);
        if (!o2.ok) return o2;
        if (st.structures.snares >= MAX_SNARES) return { ...o2, ok: false, why: "five snares is enough here" };
        if (!canConsume(invs, def.needs)) return { ...o2, ok: false, why: "needs a snare" };
        return o2;
      }
      if (!camp) return { ...o, ok: false, why: "walk to camp" };
      if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };
      if (sid === "cabin" && !st.structures.firePit) return { ...o, ok: false, why: "build the fire pit first" };
      if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% built; materials already laid out` };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
    case "light": {
      const o = needCamp(opt({ group: "camp", label: "Light the fire", detail: "fire drill and 1 kg firewood", duration: 10 }));
      if (!o.ok) return o;
      if (!st.structures.firePit) return { ...o, ok: false, why: "needs a fire pit" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!hasTool(p, "fireDrill")) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      return o;
    }
    case "travel":
    case "walk": {
      const target = walkTarget(state, world, arg ?? "");
      const o = opt({ group: "move", label: id === "travel" ? `Go to ${target?.label ?? "?"}` : `Walk to ${target?.label ?? "?"}`, detail: "" });
      if (!target) return { ...o, ok: false, why: "no such place" };
      if (id === "travel" && discovery(state, cellAt(world, target.cell).region) === 0) return { ...o, ok: false, why: "you know nothing of that country" };
      const from = cellOf(state, world);
      if (target.cell === from) return { ...o, ok: false, why: "you are here" };
      const route = findRoute(world, from, target.cell);
      if (!route) return { ...o, ok: false, why: "no way there on foot" };
      const v = baseWalkSpeed(state, cal, state.weather);
      const minutes = routeMinutes(world, route, v);
      const o2 = { ...o, duration: minutes, detail: `${routeKm(route).toFixed(1)} km on foot` };
      if (weight(p.pack) > PACK_HARD_KG) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "haul": {
      const here = cellOf(state, world);
      const campCell = st.campCell;
      const o = opt({ group: "move", label: "Haul to camp", detail: "", repeatable: true });
      if (here === campCell) return { ...o, ok: false, why: "you are at camp" };
      const kg = weight(herePile(state, world));
      if (kg <= 0) return { ...o, ok: false, why: "nothing on the ground here" };
      const route = findRoute(world, here, campCell);
      if (!route) return { ...o, ok: false, why: "no way to camp on foot" };
      const loaded = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, PACK_HARD_KG + 5));
      const empty = routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather, 5));
      return { ...o, duration: loaded + empty, detail: `${Math.min(PACK_HARD_KG, kg).toFixed(0)} kg per trip, ${routeKm(route).toFixed(1)} km each way; ${kg.toFixed(0)} kg lying here; stop anywhere and carry on later` };
    }
    case "rest":
      return opt({ group: "camp", label: "Rest", detail: "an hour off your feet", duration: 60, repeatable: true });
    case "sleep": {
      // Until dawn or until rested, whichever is later; no one sleeps round the clock.
      const toRested = ((100 - p.energy) / 12.5) * 60;
      const minutes = Math.min(600, Math.max(60, minutesUntilDawn(state.minute), toRested));
      return opt({ group: "camp", label: "Sleep", detail: `until dawn or rested, at most 10 h; ${camp ? "by the fire, under the roof if you have one" : "on the ground, in the open"}`, duration: minutes });
    }
  }
}

export function huntOdds(state: GameState, cal: Calendar, density: number, def: SpeciesDef): number {
  let odds = density * def.odds;
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  return Math.min(0.95, odds);
}

/** Every task the UI should show from where the player stands, legal or not. */
export function availableTasks(state: GameState, world: World, cal: Calendar): TaskOption[] {
  const out: TaskOption[] = [];
  const r = regionAt(world, state.player.region);
  const here = cellOf(state, world);
  for (const id of ["chop", "sticks", "bark", "stone", "berries"] as TaskId[]) out.push(check(state, world, cal, id));
  for (const s of SPECIES) out.push(s === "fish" ? check(state, world, cal, "fish") : check(state, world, cal, "hunt", s));
  out.push(check(state, world, cal, "cook", "rawMeat"));
  out.push(check(state, world, cal, "cook", "fish"));
  out.push(check(state, world, cal, "light"));
  out.push(check(state, world, cal, "split"));
  out.push(check(state, world, cal, "sharpen"));
  out.push(check(state, world, cal, "repair"));
  out.push(check(state, world, cal, "rest"));
  out.push(check(state, world, cal, "sleep"));
  for (const id of RECIPE_IDS) out.push(check(state, world, cal, "craft", id));
  for (const id of STRUCTURE_IDS) out.push(check(state, world, cal, "build", id));
  for (const s of r.spots) if (s.cell !== here) out.push(check(state, world, cal, "walk", `spot:${s.id}`));
  out.push(check(state, world, cal, "haul"));
  for (const nb of r.neighbours) out.push(check(state, world, cal, "travel", `region:${nb.id}`));
  return out;
}

export function startTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false): boolean {
  if (state.dead) return false;
  const o = check(state, world, cal, id, arg);
  if (!o.ok) return false;
  // Whatever was under way is set aside first, with its share done kept.
  stopTask(state, world);
  if (id === "haul") return startHaul(state, world, cal);
  if (id === "build" && !(regionState(state, world, state.player.region).build[arg as StructureId] ?? 0)) {
    // Materials are committed when the work starts, and stay laid out if you stop.
    consume(reach(state, world), STRUCTURES[arg as StructureId].needs);
    if (arg !== "snare") regionState(state, world, state.player.region).build[arg as StructureId] = 0.001;
  }
  if (id === "walk" || id === "travel") {
    const target = walkTarget(state, world, arg ?? "")!;
    const path = findRoute(world, cellOf(state, world), target.cell) ?? [];
    state.route = { target: target.cell, path, label: target.label };
    state.task = { id, arg, progress: 0, duration: o.duration, repeat: false };
    return true;
  }
  // Pick up where this task was left, if it was.
  const key = pauseKey(state, world, id, arg);
  const fresh = checkFresh(state, world, cal, id, arg);
  const fraction = key ? (state.paused[key]?.fraction ?? 0) : 0;
  if (key) delete state.paused[key];
  state.task = { id, arg, progress: fresh.duration * fraction, duration: fresh.duration, repeat: repeat && o.repeatable };
  return true;
}

/**
 * Hauling is a plan, not a task: load up here, walk to camp, drop, walk
 * back, again while the pile holds anything. Each leg is an ordinary walk,
 * so stopping leaves you where you are, loaded, and the plan can be started
 * again from either end.
 */
function startHaul(state: GameState, world: World, cal: Calendar): boolean {
  const here = cellOf(state, world);
  const campCell = regionState(state, world, state.player.region).campCell;
  const steps: PlanStep[] = [
    { kind: "load", cell: here },
    { kind: "walk", cell: campCell, label: "camp" },
    { kind: "drop" },
    { kind: "walk", cell: here, label: whereIs(state, world, here) },
  ];
  state.plan = { name: "Haul to camp", steps: [...steps], loop: steps, sourceCell: here };
  runPlan(state, world, cal);
  return state.task !== null;
}

/** Takes the next step of the plan when nothing is under way. Called every minute by advance. */
export function runPlan(state: GameState, world: World, cal: Calendar): void {
  const plan = state.plan;
  if (!plan || state.task || state.dead) return;
  for (let guard = 0; guard < 8 && !state.task; guard++) {
    if (!plan.steps.length) {
      const more = plan.loop && plan.sourceCell !== null && !isEmpty(pile(state, plan.sourceCell));
      if (!more) {
        log(state, `${plan.name}: done.`, "good");
        state.plan = null;
        return;
      }
      plan.steps = [...plan.loop!];
    }
    const step = plan.steps.shift()!;
    if (step.kind === "load") {
      if (cellOf(state, world) !== step.cell) {
        // Not where the pile is: walk there first.
        plan.steps.unshift(step);
        plan.steps.unshift({ kind: "walk", cell: step.cell, label: whereIs(state, world, step.cell) });
        continue;
      }
      loadPack(state, world);
    } else if (step.kind === "drop") {
      const from = state.player.pack;
      const to = herePile(state, world);
      for (const { item, qty: q } of listItems(from)) transfer(from, to, item, q);
    } else {
      if (cellOf(state, world) === step.cell) continue;
      const o = checkFresh(state, world, cal, "walk", `cell:${step.cell}`);
      if (!o.ok) {
        log(state, `${plan.name}: ${o.why}. You stop.`, "bad");
        state.plan = null;
        return;
      }
      const path = findRoute(world, cellOf(state, world), step.cell) ?? [];
      state.route = { target: step.cell, path, label: step.label };
      state.task = { id: "walk", arg: `cell:${step.cell}`, progress: 0, duration: o.duration, repeat: false };
    }
  }
}

/** Fills the pack to the hard limit from the pile here, heaviest things first. */
function loadPack(state: GameState, world: World): void {
  const from = herePile(state, world);
  const pack = state.player.pack;
  let room = PACK_HARD_KG - weight(pack);
  const items = listItems(from).sort((a, b) => ITEM_KG[b.item] - ITEM_KG[a.item]);
  for (const { item, qty: have } of items) {
    if (room <= 1e-9) break;
    const unit = ITEM_KG[item];
    const n = unit >= 1 ? Math.min(have, Math.floor(room / unit + 1e-9)) : Math.min(have, room / unit);
    if (n <= 0) continue;
    transfer(from, pack, item, n);
    room -= n * unit;
  }
}

/**
 * Sets the current task aside. Work keeps its share where it belongs; a walk
 * simply ends where you stand; a plan is dropped, since it restarts from
 * anywhere. Rest and sleep keep nothing.
 */
export function stopTask(state: GameState, world: World): void {
  state.plan = null;
  const t = state.task;
  if (!t) return;
  if (t.id === "build" && t.arg !== "snare") {
    const st = regionState(state, world, state.player.region);
    const sid = t.arg as StructureId;
    st.build[sid] = (st.build[sid] ?? 0) + t.progress;
  } else if (t.id === "walk" || t.id === "travel") {
    state.route = null;
  } else {
    const key = pauseKey(state, world, t.id, t.arg);
    const fraction = t.duration > 0 ? Math.min(0.999, t.progress / t.duration) : 0;
    if (key && fraction > 0.005) {
      state.paused[key] = { id: t.id, arg: t.arg, fraction, cell: LOCATED.has(t.id) ? cellOf(state, world) : -1 };
    }
  }
  state.task = null;
}

/** Everything set aside, with whether it can be picked up from where the player stands. */
export function pausedList(state: GameState, world: World, cal: Calendar): { key: string; task: PausedTask; option: TaskOption; here: boolean }[] {
  const here = cellOf(state, world);
  return Object.entries(state.paused).map(([key, task]) => {
    const isHere = task.cell < 0 || task.cell === here;
    const option = isHere
      ? check(state, world, cal, task.id, task.arg)
      : { ...checkFresh(state, world, cal, task.id, task.arg), ok: false, why: `at ${whereIs(state, world, task.cell)}` };
    return { key, task, option, here: isHere };
  });
}

/** Advances the current task by dt minutes and applies its effect when it completes. */
export function stepTask(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task;
  if (!t || state.dead) return;
  if (t.id === "walk" || t.id === "travel") {
    stepWalk(state, world, cal, dt);
    return;
  }
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state) : 1;
  t.progress += dt * pace;
  if (t.progress < t.duration) return;

  const id = t.id;
  const arg = t.arg;
  const repeat = t.repeat;
  state.task = null;
  complete(state, world, cal, rng, id, arg);
  if (repeat && !state.dead) {
    const o = check(state, world, cal, id, arg);
    if (o.ok) state.task = { id, arg, progress: 0, duration: o.duration, repeat: true };
    else log(state, `${o.label}: ${o.why}. You stop.`);
  }
}

/**
 * Moves the player along the route at the speed of the ground under foot.
 * The bar shows minutes: what has passed, and what the rest would take now.
 */
function stepWalk(state: GameState, world: World, cal: Calendar, dt: number): void {
  const t = state.task!;
  const route = state.route;
  if (!route) {
    state.task = null;
    return;
  }
  const p = state.player;
  let km = (walkSpeed(state, cal, state.weather, hereTerrain(state, world)) / 60) * dt;
  while (km > 1e-9 && route.path.length) {
    const next = cellCenter(world, route.path[0]);
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const distKm = Math.hypot(dx, dy) * CELL_KM;
    if (km >= distKm) {
      p.x = next.x;
      p.y = next.y;
      setRegion(state, world, cellAt(world, route.path[0]).region);
      route.path.shift();
      km -= distKm;
      state.stats.km += distKm;
    } else {
      const f = km / distKm;
      p.x += dx * f;
      p.y += dy * f;
      setRegion(state, world, cellAt(world, cellIndex(world, p.x, p.y)).region);
      state.stats.km += km;
      km = 0;
    }
  }
  t.progress += dt;
  t.duration = t.progress + routeMinutes(world, route.path, baseWalkSpeed(state, cal, state.weather));
  if (!route.path.length) {
    const label = route.label;
    const wasTravel = t.id === "travel";
    state.route = null;
    state.task = null;
    placeAt(state, world, cellOf(state, world));
    if (wasTravel) log(state, `You reach ${label}.`);
    if (spotHere(state, world) === "heath") collectSnares(state, world);
  }
}

function complete(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const invs = reach(state, world);
  switch (id) {
    case "chop": {
      st.wood -= 1;
      produce(state, world, "log", 4);
      produce(state, world, "stick", 4);
      state.stats.trees++;
      if (wearTool(p, "axe", 1)) log(state, "The axe head splits on the last stroke. It is done for.", "bad");
      if (rng.chance(0.01)) {
        p.injured = Math.max(p.injured, 24 * 60);
        p.health = Math.max(1, p.health - 10);
        log(state, "The axe glances off a knot into your shin. You will limp for a day.", "bad");
      }
      return;
    }
    case "sticks": produce(state, world, "stick", 6); return;
    case "bark": produce(state, world, "bark", 4); return;
    case "stone": {
      produce(state, world, "stone", 3);
      if (rng.chance(0.1)) {
        produce(state, world, "stone", 1);
        log(state, "A good sharp flint among the stones.", "good");
      }
      return;
    }
    case "berries": produce(state, world, "berries", 1); return;
    case "split": {
      consume(invs, [{ item: "log", qty: 1 }]);
      produce(state, world, "firewood", ITEM_KG.log);
      return;
    }
    case "hunt": {
      const s = arg as Species;
      const def = ANIMALS[s];
      const d = regionDensity(state, world, p.region, s, cal);
      if (wearTool(p, "bow", 1)) log(state, "The bow snaps.", "bad");
      if (rng.chance(huntOdds(state, cal, d, def))) {
        st.pop[s] = Math.max(0, st.pop[s] - 1);
        state.stats.animals++;
        const where = produce(state, world, "rawMeat", def.meatKg);
        if (def.hideKg) produce(state, world, "hide", def.hideKg);
        if (def.bone) produce(state, world, "bone", def.bone);
        if (def.sinew) produce(state, world, "sinew", def.sinew);
        log(state, `A ${def.name}. ${def.meatKg} kg of meat${where === "pile" ? ", more than you can carry; it lies where it fell" : ""}.`, "good");
        if (def.injury && rng.chance(def.injury)) {
          p.injured = Math.max(p.injured, 24 * 60);
          p.health = Math.max(1, p.health - 15);
          log(state, "It did not go down easily. You are hurt.", "bad");
        }
      } else {
        if (rng.chance(0.5)) {
          removeItem(p.pack, "arrow", 1);
          log(state, `No ${def.name} today, and an arrow lost in the brush.`);
        } else log(state, `No ${def.name} today.`);
      }
      return;
    }
    case "fish": {
      const def = ANIMALS.fish;
      const d = regionDensity(state, world, p.region, "fish", cal);
      if (wearTool(p, "fishingSpear", 1)) log(state, "The spear shaft splits.", "bad");
      if (rng.chance(huntOdds(state, cal, d, def))) {
        st.pop.fish = Math.max(0, st.pop.fish - 1);
        state.stats.animals++;
        produce(state, world, "fish", def.meatKg);
        log(state, "A fish, 0.7 kg.", "good");
      } else log(state, "Nothing bites.");
      return;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      consume(invs, [{ item: food, qty: kg }]);
      produce(state, world, food === "rawMeat" ? "cookedMeat" : "cookedFish", kg);
      return;
    }
    case "craft": {
      const rid = arg as RecipeId;
      const rec = RECIPES[rid];
      if (!canConsume(invs, rec.needs)) {
        log(state, `The ${rec.name} is left unfinished: the materials are gone.`, "bad");
        return;
      }
      consume(invs, rec.needs);
      if (rec.tool) wearTool(p, rec.tool, 1);
      if (rec.out.tool) {
        p.tools = p.tools.filter((x) => x.id !== rec.out.tool);
        p.tools.push({ id: rec.out.tool, durability: 100 });
        log(state, `You have a ${rec.name}.`, "good");
      } else if (rec.out.clothing) {
        const slot = CLOTHING[rec.out.clothing].slot;
        const old = p.clothing.find((g) => CLOTHING[g.id].slot === slot);
        p.clothing = p.clothing.filter((g) => g !== old);
        p.clothing.push({ id: rec.out.clothing, durability: 100 });
        log(state, `You put on the ${rec.name}${old ? ` and leave the ${CLOTHING[old.id].name} behind` : ""}.`, "good");
      } else if (rec.out.item) {
        produce(state, world, rec.out.item, rec.out.qty ?? 1);
      }
      return;
    }
    case "repair": {
      consume(invs, [{ item: "hide", qty: 0.5 }]);
      wearTool(p, "needle", 2);
      const worst = p.clothing.reduce((a, b) => (b.durability < a.durability ? b : a));
      worst.durability = Math.min(100, worst.durability + 40);
      log(state, `The ${CLOTHING[worst.id].name} is patched.`, "good");
      return;
    }
    case "sharpen": {
      consume(invs, [{ item: "stone", qty: 1 }]);
      const axe = tool(p, "axe");
      if (axe) axe.durability = Math.min(100, axe.durability + 30);
      return;
    }
    case "build": {
      const sid = arg as StructureId;
      if (sid === "snare") {
        consume(invs, STRUCTURES.snare.needs);
        st.structures.snares++;
      } else {
        st.structures[sid] = true;
        delete st.build[sid];
      }
      state.stats.structures++;
      log(state, `The ${STRUCTURES[sid].name} is ${sid === "snare" ? "set" : "finished"}.`, "good");
      return;
    }
    case "light": {
      consume(invs, [{ item: "firewood", qty: 1 }]);
      wearTool(p, "fireDrill", 2);
      st.fire.lit = true;
      st.fire.fuelKg += 1;
      log(state, "Smoke, then flame. The fire is lit.", "good");
      return;
    }
    case "haul":
    case "travel":
    case "walk":
    case "rest":
    case "sleep":
      return;
  }
}

/** Hares hanging in the snares come with you when you pass the heath. */
function collectSnares(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (st.snareCatch.count <= 0) return;
  const n = st.snareCatch.count;
  st.snareCatch.count = 0;
  st.snareCatch.age = 0;
  produce(state, world, "rawMeat", ANIMALS.hare.meatKg * n);
  produce(state, world, "hide", ANIMALS.hare.hideKg * n);
  produce(state, world, "bone", n);
  state.stats.animals += n;
  log(state, `${n} hare${n > 1 ? "s" : ""} in the snares at ${regionAt(world, p.region).name}.`, "good");
}

/** kg of a given item within reach, for labels. */
export function inReach(state: GameState, world: World, item: keyof typeof ITEM_KG): number {
  return qty(state.player.pack, item) + qty(herePile(state, world), item);
}
