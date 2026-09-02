import type { Rng } from "../rng";
import { PACK_HARD_KG } from "../units";
import { hasSpot, spotKm, type World } from "../world/gen";
import { regionDensity } from "./animals";
import { type Calendar, minutesUntilDawn } from "./calendar";
import {
  canConsume, consume, hasTool, herePile, listItems, pile, produce, qty, reach,
  removeItem, tool, totalQty, transfer, wearTool, weight,
} from "./inventory";
import {
  ANIMALS, CLOTHING, ITEM_KG, ITEM_NAMES, MAX_SNARES, RECIPES, RECIPE_IDS, STRUCTURES,
  STRUCTURE_IDS, type SpeciesDef,
} from "./items";
import { log } from "./log";
import { walkSpeed, workSpeed } from "./player";
import {
  type GameState, type RecipeId, SPECIES, SPOTS, type Species, type SpotId,
  type StructureId, type TaskId,
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
}

export const SPOT_NAMES: Record<SpotId, string> = {
  camp: "camp", forest: "the forest", outcrop: "the outcrop", shore: "the shore", heath: "the heath",
};

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
 * The one place a task's legality and duration are decided. availableTasks
 * and startTask both go through it so the button and the click agree.
 */
export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string): TaskOption {
  const p = state.player;
  const r = world.regions[p.region];
  const st = state.regions[p.region];
  const here = p.spot;
  const invs = reach(state);
  const opt = (partial: Partial<TaskOption> & { label: string; group: TaskGroup }): TaskOption => ({
    id, arg, detail: "", duration: 0, ok: true, why: "", repeatable: false, ...partial,
  });
  const at = (spot: SpotId, o: TaskOption): TaskOption => {
    if (!hasSpot(r, spot)) return { ...o, ok: false, why: `${r.name} has no ${SPOT_NAMES[spot].replace("the ", "")}` };
    if (here !== spot) return { ...o, ok: false, why: `walk to ${SPOT_NAMES[spot]}` };
    return o;
  };

  switch (id) {
    case "chop": {
      const o = at("forest", opt({ group: "gather", label: "Fell a tree", detail: "4 logs and 4 sticks left on the ground", duration: r.frac.spruce > 0.4 ? 50 : 60, repeatable: true }));
      if (!o.ok) return o;
      if (!hasTool(p, "axe")) return { ...o, ok: false, why: "needs an axe" };
      if (st.wood < 1) return { ...o, ok: false, why: "nothing left worth felling" };
      return o;
    }
    case "sticks":
      return at("forest", opt({ group: "gather", label: "Gather sticks", detail: "6 sticks", duration: 20, repeatable: true }));
    case "bark":
      return at("forest", opt({ group: "gather", label: "Strip bark", detail: "4 bark, for cordage", duration: 20, repeatable: true }));
    case "stone":
      return at("outcrop", opt({ group: "gather", label: "Gather stone", detail: "3 stone", duration: 30, repeatable: true }));
    case "berries": {
      const o = at("heath", opt({ group: "gather", label: "Pick berries", detail: "1 kg berries, mid-July to mid-October", duration: 60, repeatable: true }));
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
      const o = at(def.spot, opt({
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
      const o = at("shore", opt({ group: "hunt", label: "Fish", duration: def.minutes, repeatable: true, detail: `0.7 kg per catch; about ${Math.round(huntOdds(state, cal, d, def) * 100)}% per try` }));
      if (!o.ok) return o;
      if (!hasTool(p, "fishingSpear")) return { ...o, ok: false, why: "needs a fishing spear" };
      if (st.pop.fish < 1) return { ...o, ok: false, why: "the water is empty" };
      return o;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      const o = opt({ group: "camp", label: `Cook ${ITEM_NAMES[food]}`, detail: "1 kg at a time over the fire", duration: Math.max(1, 10 * kg), repeatable: true });
      if (here !== "camp") return { ...o, ok: false, why: "walk to camp" };
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
        const o2 = at("heath", o);
        if (!o2.ok) return o2;
        if (st.structures.snares >= MAX_SNARES) return { ...o2, ok: false, why: "five snares is enough here" };
        if (!canConsume(invs, def.needs)) return { ...o2, ok: false, why: "needs a snare" };
        return o2;
      }
      if (here !== "camp") return { ...o, ok: false, why: "walk to camp" };
      if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };
      if (sid === "cabin" && !st.structures.firePit) return { ...o, ok: false, why: "build the fire pit first" };
      if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% built; materials already laid out` };
      if (!canConsume(invs, def.needs)) return { ...o, ok: false, why: "missing materials at camp" };
      return o;
    }
    case "light": {
      const o = opt({ group: "camp", label: "Light the fire", detail: "fire drill and 1 kg firewood", duration: 10 });
      if (here !== "camp") return { ...o, ok: false, why: "walk to camp" };
      if (!st.structures.firePit) return { ...o, ok: false, why: "needs a fire pit" };
      if (st.fire.lit) return { ...o, ok: false, why: "already burning" };
      if (!hasTool(p, "fireDrill")) return { ...o, ok: false, why: "needs a fire drill" };
      if (totalQty(invs, "firewood") < 1) return { ...o, ok: false, why: "needs 1 kg firewood" };
      return o;
    }
    case "travel": {
      const to = Number(arg);
      const nb = r.neighbours.find((n) => n.id === to);
      const dest = world.regions[to];
      const o = opt({ group: "move", label: `Go to ${dest?.name ?? "?"}`, detail: "" });
      if (!nb) return { ...o, ok: false, why: "not next to here" };
      const km = nb.km + spotKm(r, here);
      const bog = r.frac.bog > 0.5 || dest.frac.bog > 0.5;
      const v = walkSpeed(state, cal, state.weather, bog);
      const minutes = (km / v) * 60;
      const o2 = { ...o, duration: minutes, detail: `${km.toFixed(1)} km at ${v.toFixed(1)} km/h` };
      if (weight(p.pack) > PACK_HARD_KG) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "walk": {
      const to = arg as SpotId;
      const o = opt({ group: "move", label: `Walk to ${SPOT_NAMES[to]}`, detail: "" });
      if (!hasSpot(r, to)) return { ...o, ok: false, why: "no such place here" };
      if (to === here) return { ...o, ok: false, why: "you are here" };
      const km = walkKm(r, here, to);
      const v = walkSpeed(state, cal, state.weather, r.frac.bog > 0.5);
      const o2 = { ...o, duration: (km / v) * 60, detail: `${km.toFixed(1)} km at ${v.toFixed(1)} km/h` };
      if (weight(p.pack) > PACK_HARD_KG) return { ...o2, ok: false, why: "the pack is too heavy to lift" };
      return o2;
    }
    case "haul": {
      const o = opt({ group: "move", label: "Haul to camp", detail: "", repeatable: true });
      if (here === "camp") return { ...o, ok: false, why: "you are at camp" };
      const kg = weight(herePile(state));
      if (kg <= 0) return { ...o, ok: false, why: "nothing on the ground here" };
      const km = spotKm(r, here);
      const loaded = walkSpeed(state, cal, state.weather, r.frac.bog > 0.5, PACK_HARD_KG + 5);
      const empty = walkSpeed(state, cal, state.weather, r.frac.bog > 0.5, 5);
      const minutes = (km / loaded + km / empty) * 60;
      return { ...o, duration: minutes, detail: `${Math.min(PACK_HARD_KG, kg).toFixed(0)} kg per trip, ${km.toFixed(1)} km each way; ${kg.toFixed(0)} kg lying here` };
    }
    case "rest":
      return opt({ group: "camp", label: "Rest", detail: "an hour off your feet", duration: 60, repeatable: true });
    case "sleep": {
      // Until dawn or until rested, whichever is later; no one sleeps round the clock.
      const toRested = ((100 - p.energy) / 12.5) * 60;
      const minutes = Math.min(600, Math.max(60, minutesUntilDawn(state.minute), toRested));
      return opt({ group: "camp", label: "Sleep", detail: `until dawn or rested, at most 10 h; ${here === "camp" ? "by the fire, under the roof if you have one" : "on the ground, in the open"}`, duration: minutes });
    }
  }
}

/** Distance between two spots, via camp unless one of them is camp. */
export function walkKm(r: World["regions"][number], from: SpotId, to: SpotId): number {
  if (from === "camp") return spotKm(r, to);
  if (to === "camp") return spotKm(r, from);
  return spotKm(r, from) + spotKm(r, to);
}

export function huntOdds(state: GameState, cal: Calendar, density: number, def: SpeciesDef): number {
  let odds = density * def.odds;
  if (state.weather.snowCm > DEEP_SNOW_CM) odds *= 0.75;
  if (cal.isNight) odds *= 0.7;
  if (state.weather.precip !== "none") odds *= 0.85;
  return Math.min(0.95, odds);
}

/** Every task the UI should show for the current spot, legal or not. */
export function availableTasks(state: GameState, world: World, cal: Calendar): TaskOption[] {
  const out: TaskOption[] = [];
  const r = world.regions[state.player.region];
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
  for (const s of SPOTS) if (hasSpot(r, s) && s !== state.player.spot) out.push(check(state, world, cal, "walk", s));
  out.push(check(state, world, cal, "haul"));
  for (const nb of r.neighbours) out.push(check(state, world, cal, "travel", String(nb.id)));
  return out;
}

export function startTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false): boolean {
  if (state.dead) return false;
  const o = check(state, world, cal, id, arg);
  if (!o.ok) return false;
  // Whatever was under way is set down first, so a half-built wall stays built.
  stopTask(state);
  if (id === "build" && !(state.regions[state.player.region].build[arg as StructureId] ?? 0)) {
    // Materials are committed when the work starts, and stay laid out if you stop.
    consume(reach(state), STRUCTURES[arg as StructureId].needs);
    if (arg !== "snare") state.regions[state.player.region].build[arg as StructureId] = 0.001;
  }
  state.task = { id, arg, progress: 0, duration: o.duration, repeat: repeat && o.repeatable };
  return true;
}

export function stopTask(state: GameState): void {
  const t = state.task;
  if (t?.id === "build" && t.arg !== "snare") {
    const st = state.regions[state.player.region];
    const sid = t.arg as StructureId;
    st.build[sid] = (st.build[sid] ?? 0) + t.progress;
  }
  state.task = null;
}

/** Advances the current task by dt minutes and applies its effect when it completes. */
export function stepTask(state: GameState, world: World, cal: Calendar, rng: Rng, dt: number): void {
  const t = state.task;
  if (!t || state.dead) return;
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

function complete(state: GameState, world: World, cal: Calendar, rng: Rng, id: TaskId, arg?: string): void {
  const p = state.player;
  const r = world.regions[p.region];
  const st = state.regions[p.region];
  const invs = reach(state);
  switch (id) {
    case "chop": {
      st.wood -= 1;
      produce(state, "log", 4);
      produce(state, "stick", 4);
      state.stats.trees++;
      if (wearTool(p, "axe", 1)) log(state, "The axe head splits on the last stroke. It is done for.", "bad");
      if (rng.chance(0.01)) {
        p.injured = Math.max(p.injured, 24 * 60);
        p.health = Math.max(1, p.health - 10);
        log(state, "The axe glances off a knot into your shin. You will limp for a day.", "bad");
      }
      return;
    }
    case "sticks": produce(state, "stick", 6); return;
    case "bark": produce(state, "bark", 4); return;
    case "stone": {
      produce(state, "stone", 3);
      if (rng.chance(0.1)) {
        produce(state, "stone", 1);
        log(state, "A good sharp flint among the stones.", "good");
      }
      return;
    }
    case "berries": produce(state, "berries", 1); return;
    case "split": {
      consume(invs, [{ item: "log", qty: 1 }]);
      produce(state, "firewood", ITEM_KG.log);
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
        const where = produce(state, "rawMeat", def.meatKg);
        if (def.hideKg) produce(state, "hide", def.hideKg);
        if (def.bone) produce(state, "bone", def.bone);
        if (def.sinew) produce(state, "sinew", def.sinew);
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
        produce(state, "fish", def.meatKg);
        log(state, "A fish, 0.7 kg.", "good");
      } else log(state, "Nothing bites.");
      return;
    }
    case "cook": {
      const food = (arg ?? "rawMeat") as "rawMeat" | "fish";
      const kg = Math.min(1, totalQty(invs, food));
      consume(invs, [{ item: food, qty: kg }]);
      produce(state, food === "rawMeat" ? "cookedMeat" : "cookedFish", kg);
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
        produce(state, rec.out.item, rec.out.qty ?? 1);
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
    case "travel": {
      const to = Number(arg);
      const nb = r.neighbours.find((n) => n.id === to);
      state.stats.km += (nb?.km ?? 0) + spotKm(r, p.spot);
      p.region = to;
      p.spot = "camp";
      log(state, `You reach ${world.regions[to].name}.`);
      collectSnares(state, world);
      return;
    }
    case "walk": {
      state.stats.km += walkKm(r, p.spot, arg as SpotId);
      p.spot = arg as SpotId;
      if (p.spot === "heath") collectSnares(state, world);
      return;
    }
    case "haul": {
      const from = herePile(state);
      const camp = pile(state, p.region, "camp");
      let room = PACK_HARD_KG;
      // Heaviest things first: logs, then whatever else is lying about.
      const items = listItems(from).sort((a, b) => ITEM_KG[b.item] - ITEM_KG[a.item]);
      for (const { item, qty: have } of items) {
        if (room <= 1e-9) break;
        const unit = ITEM_KG[item];
        const n = unit >= 1 ? Math.min(have, Math.floor(room / unit + 1e-9)) : Math.min(have, room / unit);
        if (n <= 0) continue;
        transfer(from, camp, item, n);
        room -= n * unit;
      }
      state.stats.km += 2 * spotKm(r, p.spot);
      return;
    }
    case "rest":
    case "sleep":
      return;
  }
}

/** Hares hanging in the snares come with you when you pass the heath. */
function collectSnares(state: GameState, world: World): void {
  const p = state.player;
  const st = state.regions[p.region];
  if (p.spot !== "heath" || st.snareCatch.count <= 0) return;
  const n = st.snareCatch.count;
  st.snareCatch.count = 0;
  st.snareCatch.age = 0;
  produce(state, "rawMeat", ANIMALS.hare.meatKg * n);
  produce(state, "hide", ANIMALS.hare.hideKg * n);
  produce(state, "bone", n);
  state.stats.animals += n;
  log(state, `${n} hare${n > 1 ? "s" : ""} in the snares at ${world.regions[p.region].name}.`, "good");
}

/** kg of a given item within reach, for labels. */
export function inReach(state: GameState, item: keyof typeof ITEM_KG): number {
  return qty(state.player.pack, item) + qty(herePile(state), item);
}
