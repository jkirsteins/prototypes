import { AWAY_HOURS_DEFAULT, GAME_MINUTES_PER_REAL_SECOND } from "../units";
import { regionAt, type World } from "../world/gen";
import { advance } from "./advance";
import { ensureCareRows, isCareRow } from "./bodyorder";
import { calendar, dayNumber, START_DOY } from "./calendar";
import { discoverAvailableOpportunities, newOpportunities, opportunityDef, OPPORTUNITIES, SEASONS } from "./opportunities";
import type { OpportunityContextState, OpportunityKey, OpportunityNotice, OpportunityState, Season, WeatherOpportunityContext } from "./types";
import { addItem } from "./inventory";
import { TOOLS } from "./items";
import { ordersHere, orderSentence } from "./orders";
import { firstRecord } from "./newgame";
import { sexOfName } from "./names";
import { fatLandmarks, medianPerson, personOf, rollCandidates } from "./person";
import { newSite, regionState } from "./regionstate";
import { newSkills, SKILL_IDS } from "./skills";
import { intentMode } from "./intent";
import { isWorkIntent, type DecayingId, type GameState, type Intent, type Inventory, type LogEntry, type Species, type StructureId, type TaskId, type Until, type WorkOrder } from "./types";
import { emptyWildlife } from "./wildlife-agents";
import { decodeKnowledge, encodeKnowledge, type KnowledgeChunks, newKnowledge, setKnowledge } from "./fineknowledge";
import { migrateWeather } from "./weather";
import { DISTURBANCE_PROFILES } from "./species";
import { precipitationStormKind } from "./weather";
import { metricPointForStoredCell } from "./wildlife-space";
import { inspectSave, SAVE_VERSION, WORLD_VERSION } from "./world-version";

export const SAVE_KEY = "survidle.save";

/** The most real time a catch-up simulates: the run's away dial. The forecast's first row is this same span. */
export function awaySeconds(state: GameState): number {
  return state.awayHours * 3600;
}

export interface SaveFile { version: typeof SAVE_VERSION; worldVersion: typeof WORLD_VERSION; savedAt: number; state: GameState }

/** A save written for a world this build can no longer make, with the sentence to show for it. */
export interface RefusedSave { refused: string }

export function serialize(state: GameState, now = Date.now()): string {
  // Knowledge is chunked typed arrays, which JSON cannot carry: it goes out
  // as its own compact string and comes back through migrate.
  const carried = { ...state, knowledge: encodeKnowledge(state.knowledge) };
  delete (carried as unknown as Record<string, unknown>)["goals"];
  return JSON.stringify({ version: SAVE_VERSION, worldVersion: WORLD_VERSION, savedAt: now, state: carried });
}

/** A save's knowledge field as it may arrive: encoded, a cell-keyed record from before the lattice, or absent. */
interface LegacyKnowledge {
  knowledge?: KnowledgeChunks | string;
  mapped?: Record<number, 1 | 3>;
}

function loadKnowledge(state: LegacyKnowledge): KnowledgeChunks {
  const carried = state.knowledge;
  if (typeof carried === "string") return decodeKnowledge(carried);
  if (carried && carried.chunks instanceof Map) return carried;
  const knowledge = newKnowledge();
  // A save written while knowledge was a property per cell: the same ground,
  // dim where the journal held it. Ground nobody had is simply absent.
  for (const [cell, level] of Object.entries(state.mapped ?? {})) {
    setKnowledge(knowledge, Number(cell), level === 3 ? "inherited" : "seen");
  }
  delete state.mapped;
  return knowledge;
}

/**
 * A save carries no world, only its seed, and nothing migrates across a
 * world-version boundary: the patch ids of a save written on another terrain
 * model mean nothing on this one. Such a save is refused with its reason
 * rather than read.
 */
export function deserialize(text: string): SaveFile | RefusedSave | null {
  const compatibility = inspectSave(text);
  if (compatibility === "invalid") return null;
  if (compatibility === "old-world") return { refused: "This save is from a world made by an older map and cannot be loaded; a new world begins." };
  try {
    const file = JSON.parse(text) as SaveFile;
    migrate(file.state);
    return file;
  } catch {
    return null;
  }
}

/**
 * Fields added since a save was written get their starting values, so a
 * run in progress survives a new structure the same way it survives a new
 * region: by not having it yet.
 */
export function migrate(state: GameState): void {
  state.startDoy ??= START_DOY;
  state.knowledge = loadKnowledge(state as unknown as LegacyKnowledge);
  migrateWeather(state);
  state.awayHours ??= AWAY_HOURS_DEFAULT;
  state.advanceCarry ??= 0;
  state.skills ??= newSkills();
  // A skill added since the save was written is the harder half of the same
  // problem: the record is there, so the line above sees nothing missing, and
  // the hole is one key down. Every id gets its own default, not just the whole.
  for (const id of SKILL_IDS) state.skills[id] ??= { xp: 0, mastery: {}, pool: 0 };
  state.intent ??= null;
  state.ledger ??= [];
  state.year ??= 1;
  state.landing ??= null;
  state.spine ??= { fired: {}, announced: {} };
  state.manualSeen ??= false;
  migrateLegacyOpportunities(state, state as unknown as Record<string, unknown>);
  state.shopping ??= null;
  if (state.task?.id === "explore" && state.task.originRegion === undefined) {
    const target = state.task.arg?.startsWith("region:") ? Number(state.task.arg.slice(7)) : Number.NaN;
    const otherCamp = Object.entries(state.regions)
      .find(([id, region]) => Number(id) !== target && region.campCell !== null);
    state.task.originRegion = target !== state.player.region
      ? state.player.region
      : otherCamp ? Number(otherCamp[0]) : state.player.region;
  }
  state.taught ??= {};
  state.teachQueue ??= [];
  state.wildlife ??= emptyWildlife();
  state.wildlife.familiarity ??= {};
  state.wildlife.inherited ??= {};
  state.wildlife.recognized ??= {};
  state.wildlife.visible ??= [];
  state.wildlife.knownDens ??= {};
  state.wildlife.recognitionQueue ??= [];
  for (const subject of state.wildlife.subjects) {
    subject.denCell ??= null;
    if (!subject.active) continue;
    const active = subject.active;
    // An old fleeing animal resumes an existing episode without replaying it.
    active.escapeRemainingM ??= active.intent === "flee" ? DISTURBANCE_PROFILES[subject.species].escapeMinM : 0;
    active.escapeStartedMinute ??= active.intent === "flee" ? state.minute : null;
    active.lastDetectionMinute ??= active.alarm > 0 || active.escapeStartedMinute !== null ? state.minute : null;
    active.escapeEpisode ??= 0;
    active.position ??= metricPointForStoredCell(state.seed, subject.id, active.cell)
      ?? { xM: 0, yM: 0 };
    active.travel ??= null;
  }
  // A save from before the world was the thing saved: its survivor becomes the first of the world, recorded from now.
  state.survivors ??= [firstRecord(state.seed, state.startDoy)];
  // A record from before the person: the median survivor, with the sex its name says and a face of its own.
  for (const s of state.survivors) s.person ??= { ...medianPerson(sexOfName(s.name.first) ?? (s.index % 2 ? "m" : "f")), face: s.index };
  // A landing from before the boat: three people rolled for it, the old name kept in the field.
  if (state.landing) {
    const l = state.landing;
    l.candidates ??= rollCandidates(state.seed, state.survivors.length + 1, 0, state.survivors.map((s) => s.name));
    l.boat ??= 0;
    l.chosen ??= 0;
    l.name ??= l.candidates[l.chosen].name;
    l.oldCamp ??= null;
  }
  state.player.known ??= {};
  state.player.huntSigns ??= {};
  for (const [cell, sign] of Object.entries(state.player.huntSigns)) {
    const legacy = sign as typeof sign & { minute?: number; species: Species[] | typeof sign.species };
    if (Array.isArray(legacy.species)) {
      state.player.huntSigns[Number(cell)] = {
        species: Object.fromEntries(legacy.species.map((species) => [species, legacy.minute ?? state.minute])),
      };
    }
  }
  state.player.skyReadDay ??= null;
  state.player.fieldFire ??= null;
  state.seeps ??= {};
  state.carcasses ??= [];
  state.nextCarcassId ??= 1;
  state.huntPressure ??= {};
  state.stats.kills ??= {};
  state.stats.killsKcal ??= 0;
  for (const st of Object.values(state.regions)) {
    st.trap ??= null;
    if (st.trap) st.trap.age ??= 0;
    if (st.trap) st.trap.oilyKg ??= 0;
    // A save older than the seasonal stocks knows no nests. Zero is a real reading - a heath
    // whose clutches are gathered out - so it cannot stand for "never knew", and this function
    // has no world to seed a real stock with. -1 says "unset" and fillPopulations, which walks
    // the same regions with the world in hand, seeds it.
    st.nests ??= -1;
    // A region's roots were one number for the whole region once, which says nothing about
    // which cells they came out of. It is dropped and the ground reads full: what one survivor
    // took out of nine hectares a cell is inside a season's regrowth anyway.
    delete (st as unknown as Record<string, unknown>).roots;
    st.rootCells ??= {};
    // A save from before the wood stock was the ground's carries one number for
    // the whole region. There is no patch it belongs to, so the region opens
    // uncut and grows from there rather than stranding a figure nothing reads.
    st.woodCells ??= {};
    delete (st as unknown as { wood?: number }).wood;
    st.sapTaps ??= { day: 0, n: 0 };
  }
  for (const d of state.ledger) {
    d.yield.trap ??= 0;
    d.yield.marrow ??= 0;
    d.yield.roe ??= 0;
    d.yield.eggs ??= 0;
    d.yield.roots ??= 0;
    d.yield.bark ??= 0;
    d.yield.sap ??= 0;
    d.yield.seaweed ??= 0;
    d.leanKcal ??= 0;
    d.nonLeanKcal ??= 0;
    d.leanAtCamp ??= false;
  }
  // Old saves represented idleness as a synthetic wait intent and task.
  // Idleness now has no record at all, so discard both halves on load.
  if ((state.intent as unknown as { task?: string } | null)?.task === "wait") state.intent = null;
  if ((state.task as unknown as { id?: string } | null)?.id === "wait") state.task = null;
  if (state.intent) {
    state.intent.orderId ??= null;
    if (isWorkIntent(state.intent) && state.intent.orderRegion === undefined) {
      state.intent.orderRegion = Number(Object.entries(state.regions)
        .find(([, st]) => st.orders.some((order) => order.id === state.intent?.orderId))?.[0] ?? state.player.region);
    }
    // Whose the intent is was read off what it was asked to do; a save from
    // before that reads the same way.
    const it = state.intent as Partial<Intent> & { task?: TaskId; until?: Until };
    if (it.mode !== "care" && it.task && it.until) {
      it.mode ??= intentMode(it.task, it.until);
      const work = state.intent;
      if (isWorkIntent(work)) work.windDown ??= false;
    }
  }
  // Hauling was a stored plan once; an intent restarts from anywhere, so a saved plan is simply forgotten.
  delete (state as unknown as Record<string, unknown>).plan;
  // The one-species fish and the one grouse became a roster: a fish task with no
  // species fishes for anything, and the old grouse is the willow grouse.
  // The one stone axe recipe became the ground celt, under its own id.
  const renameArg = (t: { id: TaskId; arg?: string } | null | undefined) => {
    if (!t) return;
    if (t.id === "fish" && !t.arg) t.arg = "any";
    if (t.id === "hunt" && t.arg === "grouse") t.arg = "willowGrouse";
    if (t.id === "craft" && t.arg === "axe") t.arg = "stoneAxe";
  };
  renameArg(state.task);
  if (isWorkIntent(state.intent) && state.intent.task === "fish" && !state.intent.arg) state.intent.arg = "any";
  if (isWorkIntent(state.intent) && state.intent.task === "hunt" && state.intent.arg === "grouse") state.intent.arg = "willowGrouse";
  if (isWorkIntent(state.intent) && state.intent.task === "craft" && state.intent.arg === "axe") state.intent.arg = "stoneAxe";
  const crafting = state.skills.crafting.mastery;
  if (crafting["craft:axe"] !== undefined) {
    crafting["craft:stoneAxe"] = (crafting["craft:stoneAxe"] ?? 0) + crafting["craft:axe"];
    delete crafting["craft:axe"];
  }
  // A paused entry's dictionary key is built from its own arg (tasks.ts pauseKey: "id:arg@cell"
  // for located work, "id:arg" for carried work, cell -1). Renaming .arg without moving the
  // entry to the recomputed key would strand it under the old key, unresumable and undeletable.
  for (const [key, p] of Object.entries(state.paused)) {
    if ((p as unknown as { id?: string }).id === "wait") {
      delete state.paused[key];
      continue;
    }
    renameArg(p);
    const newKey = p.cell === -1 ? `${p.id}:${p.arg ?? ""}` : `${p.id}:${p.arg ?? ""}@${p.cell}`;
    if (newKey !== key) {
      delete state.paused[key];
      state.paused[newKey] = p;
    }
  }
  // An order's click carries the same task/arg shape under different field names.
  for (const st of Object.values(state.regions)) {
    // Old traps have aggregate kilos only. Preserve them without inventing species credit.
    if (st.trap) st.trap.caught ??= [];
    for (const o of st.orders ?? []) {
      if (isCareRow(o)) {
        delete (o as unknown as { req?: unknown }).req;
        continue;
      }
      if (o.req.task === "fish" && !o.req.arg) o.req.arg = "any";
      if (o.req.task === "hunt" && o.req.arg === "grouse") o.req.arg = "willowGrouse";
      if (o.req.task === "craft" && o.req.arg === "axe") o.req.arg = "stoneAxe";
    }
  }
  const p = state.player;
  p.torch ??= { lit: false, minutes: 0 };
  p.fat ??= fatLandmarks(personOf(state)).typical;
  p.water ??= 2.5;
  p.frostbite ??= { feet: 0, hands: 0 };
  p.toes ??= false;
  p.fingers ??= false;
  p.gut ??= { day: 0, kg: {}, leanKcal: 0 };
  delete (p as { berriesToday?: unknown }).berriesToday;
  delete (p as { leanToday?: unknown }).leanToday;
  // A save from before the two processes has one number for both: read its
  // fatigue as the debt's mirror, which is where a rested body sits, and no
  // night under way. The clock rules that number carried are gone and so are
  // their markers, and the working day is the person's own, so a save holding
  // any of them drops them here and round-trips clean.
  p.sleepDebt ??= 100 - p.energy;
  p.sleeping ??= null;
  p.collapsed ??= false;
  // Collapse used to be a second route into sleep. Preserve its recovery as
  // exhausted Rest, while leaving ordinary sleep continuity untouched.
  const legacyCollapse = (p.sleeping as { collapsed: boolean } | null)?.collapsed === true;
  if (legacyCollapse) {
    p.sleeping = null;
    p.collapsed = true;
    p.bodyNeed = "spent";
    if (state.task?.id === "sleep") state.task = null;
    if (state.intent?.mode === "care" && state.intent.care === "body") state.intent = null;
  }
  // A save with no sticky need reads its need fresh on the next free minute,
  // which costs one minute of stickiness and nothing else.
  p.bodyNeed ??= null;
  p.coldSpent ??= false;
  delete (p as { restUntil?: number }).restUntil;
  delete (p as { sleptTonight?: boolean }).sleptTonight;
  delete (p as { workHours?: number }).workHours;
  // Hunger, thirst and the fire are the care rows' now, so the three
  // switches a save may still carry for them mean nothing and go the same way.
  delete (p as { autoEat?: boolean }).autoEat;
  delete (p as { autoFeed?: boolean }).autoFeed;
  delete (p as { autoDrink?: boolean }).autoDrink;
  for (const g of p.clothing) g.wet ??= 0;
  for (const t of p.tools) {
    if (TOOLS[t.id].litres === undefined) continue;
    t.litres ??= 0;
    t.frozen ??= false;
  }
  // Berries joined the perishables, so a save that holds them as a plain count
  // holds kilos that weigh but that qty, listItems and eating never see. Moving
  // them into one fresh stack is what addItem would have done with the pick.
  const stackBerries = (inv: Inventory): void => {
    inv.stacks ??= {};
    const kg = inv.items.berries ?? 0;
    if (kg > 0) addItem(inv, "berries", kg);
    delete inv.items.berries;
  };
  stackBerries(p.pack);
  for (const inv of Object.values(state.piles)) stackBerries(inv);
  const w = state.weather;
  w.storm ??= null;
  if (w.storm) w.storm.kind ??= precipitationStormKind(w, calendar(w.storm.from, state.startDoy));
  if (w.storm) w.storm.id ??= 1;
  if (w.storm) w.storm.source ??= "natural";
  w.nextStormId = Math.max(w.nextStormId ?? 1, (w.storm?.id ?? 0) + 1);
  w.stormFreeSince ??= state.minute;
  w.dryDays ??= 0;
  w.wetDay ??= false;
  w.dryWarned ??= false;
  w.iceCm ??= 0;
  if (state.route) {
    state.route.ice ??= "none";
    // Old saves predate lastLand; the route's own path (or its target, if already there) is the closest thing to it.
    state.route.lastLand ??= state.route.path[0] ?? state.route.target;
    // Nothing is known of where an old save's walk began; its behind line starts at the survivor.
    state.route.walked ??= [];
  }
  for (const st of Object.values(state.regions)) {
    // A save from before sites kept one camp's worth of structures flat on the region.
    const flat = st as unknown as { structures?: Record<string, number | boolean>; racks?: number; boughBedAge?: number; meltDays?: number; structureAge?: Partial<Record<DecayingId, number>>; build?: Partial<Record<StructureId, number>> };
    if (flat.structures) {
      const site = newSite();
      const old = flat.structures;
      site.structures.firePit = Boolean(old.firePit);
      site.structures.leanTo = Boolean(old.leanTo);
      site.structures.cabin = Boolean(old.cabin);
      site.structures.dryingRack = Boolean(old.dryingRack);
      site.structures.boughBed = Boolean(old.boughBed);
      site.structures.hearth = Boolean(old.hearth);
      site.structures.turfHut = Boolean(old.turfHut);
      site.structures.waterStore = Boolean(old.waterStore);
      site.structures.snowShelter = Boolean(old.snowShelter);
      // A save from before racks were counted has only the flag: one rack stood if dryingRack did.
      site.racks = flat.racks ?? (old.dryingRack ? 1 : 0);
      site.boughBedAge = flat.boughBedAge ?? 0;
      site.meltDays = flat.meltDays ?? 0;
      site.structureAge = flat.structureAge ?? {};
      site.build = flat.build ?? {};
      st.snares = Number(old.snares ?? 0);
      st.sites = {};
      // A region touched but never lived in gets no site, the same as one raised today.
      const lived = Object.values(site.structures).some(Boolean) || Object.keys(site.build).length > 0;
      // A save from before a camp could be missing always has one: only a fresh region starts with none.
      if (lived && st.campCell !== null) st.sites[st.campCell] = site;
      delete flat.structures;
      delete flat.racks;
      delete flat.boughBedAge;
      delete flat.meltDays;
      delete flat.structureAge;
      delete flat.build;
    }
    st.sites ??= {};
    for (const site of Object.values(st.sites)) {
      site.cover ??= 0;
      site.coverAge ??= 0;
      site.emergencyMinutes ??= 0;
      site.emergencyAge ??= 0;
    }
    st.snares ??= 0;
    st.fire.wetKg ??= 0;
    st.fire.indoors ??= false;
    st.fire.unattended ??= 0;
    st.fire.embers ??= 0;
    st.fire.litSince ??= null;
    st.fire.rainHeld ??= 0;
    st.smoke ??= 0;
    st.logsWet ??= 1440;
    st.orders ??= [];
    st.nextOrderId ??= 1;
    // Only a direct map click owns a Walk row, and that row always owns the
    // top of the list. Older builds inserted route legs beside their parent.
    const removedWalkIds = new Set(st.orders
      .filter((o, i) => i > 0 && !isCareRow(o) && o.req.task === "walk")
      .map((o) => o.id));
    st.orders = st.orders.filter((o, i) => i === 0 || isCareRow(o) || o.req.task !== "walk");
    if (st === state.regions[state.player.region] && removedWalkIds.size) {
      if (state.intent?.orderId !== null && state.intent?.orderId !== undefined && removedWalkIds.has(state.intent.orderId)) {
        state.intent = null;
        if (state.task?.id === "walk") {
          state.task = null;
          state.route = null;
        }
      }
      // The old generated Walk was classified as hand work and could replace
      // itself with an ownerless collapse sleep. Let Self-care decide again.
      if (!state.intent && state.task?.id === "sleep" && state.player.collapsed) {
        state.task = null;
        state.player.sleeping = null;
      }
    }
    st.iceHole ??= null;
    // A save from before a care row existed has none: it is unshifted on,
    // above the work, which is the rank the always-pre-empting tier already
    // held over the list it could not be seen on.
    ensureCareRows(st);
  }
  // A raw map walk used to have no order. Preserve that explicit destination
  // as the one visible Walk at the top. A route owned by work or care remains
  // a step of that owner and needs no migration.
  if (state.task?.id === "walk" && state.route) {
    const st = state.regions[state.player.region];
    if (st) {
      const old = state.intent;
      if (old && (!isWorkIntent(old) || old.task !== "walk")) return;
      const alreadyVisible = isWorkIntent(old) && old.task === "walk" && old.orderId !== null
        && st.orders.some((o) => o.id === old.orderId && !isCareRow(o) && o.req.task === "walk");
      if (alreadyVisible) return;
      const target = state.route.target;
      const walk: WorkOrder = {
        id: st.nextOrderId++, kind: "job",
        req: { task: "walk", arg: `cell:${target}`, until: { kind: "once" }, deliver: "leave", where: { cell: target } },
        done: 0, minutes: 0, skipped: "",
        givenDoy: calendar(state.minute, state.startDoy).dayOfYear,
      };
      st.orders.unshift(walk);
      state.intent = {
        mode: "hand", task: "walk", arg: `cell:${target}`, cell: target, campCell: st.campCell,
        until: { kind: "once" }, deliver: "leave", done: 0,
        step: `walking to ${state.route.label}`, orderId: walk.id, windDown: false,
      };
    }
  }
}


interface LegacyProgressState {
  done?: Record<string, true>;
  progress?: Record<string, number>;
  stepProgress?: Record<string, Record<string, number>>;
  introduced?: Record<string, true>;
  queue?: string[];
  noticeQueue?: string[];
  opportunity?: unknown;
  chapter3HomeRegion?: number | null;
  lastSeason?: Season;
}

function legacyStaticOpportunityKey(id: string): OpportunityKey | undefined {
  if (SEASONS.includes(id as Season)) return `season:${id as Season}`;
  return OPPORTUNITIES.find((def) => def.key === id && !def.group)?.key;
}

// Historical ordering belongs only to the save boundary.
const LEGACY_STAGES: string[][] = [
  ["site"],
  ["drink"],
  ["firewood"],
  ["fire"],
  ["bed", "roof", "keptNight"],
  ["forageMeal", "cook"],
  ["findUsefulCover"],
  ["makeUsefulShelter"],
  ["testShelter"],
  ["readWeather"],
  ["prepareWeather"],
  ["surviveForecast"],
  ["remoteRefuge"],
  ["fieldFire"],
  ["fieldMeal"],
  ["remoteStorm"],
  ["snareMeal", "huntMeal", "fishMeal"],
  ["trapMeal", "foodSource", "store"],
  ["fat"],
  ["firstOrder", "water", "keptDays"],
  ["longOrder", "toolCare"],
  ["explore"],
  ["secondCamp", "seasonalFood", "durableRoof"],
  ["winterStores"],
];

function copyKnownLegacyProgress(next: OpportunityState, legacy: LegacyProgressState): void {
  const ids = new Set([...Object.keys(legacy.introduced ?? {}), ...Object.keys(legacy.done ?? {}), ...Object.keys(legacy.stepProgress ?? {}), ...Object.keys(legacy.progress ?? {})]);
  for (const id of ids) {
    const key = legacyStaticOpportunityKey(id);
    if (!key) continue;
    const def = opportunityDef(key)!;
    if (legacy.introduced?.[id] === true || legacy.done?.[id] === true) next.discoveredAt[key] = 0;
    if (legacy.done?.[id] === true) next.completedAt[key] = 0;
    const validProgress = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const compatible = Object.fromEntries(def.steps.flatMap((step) => {
      const value = legacy.stepProgress?.[id]?.[step.id];
      return validProgress(value) ? [[step.id, value]] : [];
    }));
    // Older counted leaves had only an aggregate. One-step definitions have
    // an unambiguous mapping; multi-step outcomes cannot infer missing deeds.
    if (!legacy.stepProgress?.[id] && def.steps.length === 1 && validProgress(legacy.progress?.[id])) compatible[def.steps[0].id] = legacy.progress![id];
    if (Object.keys(compatible).length) next.stepProgress[key] = compatible;
  }
}

function firstUnfinishedLegacyLeaf(legacy: LegacyProgressState, minute: number): OpportunityKey | null {
  const after: Record<string, string[]> = {
    findUsefulCover: ["cook"], makeUsefulShelter: ["findUsefulCover"], testShelter: ["makeUsefulShelter"],
    readWeather: ["testShelter", "keptNight", "bed"], prepareWeather: ["readWeather"], surviveForecast: ["prepareWeather"],
    remoteRefuge: ["surviveForecast"], fieldFire: ["remoteRefuge"], fieldMeal: ["fieldFire"], remoteStorm: ["fieldMeal"],
  };
  const weather = new Set(["readWeather", "prepareWeather", "surviveForecast", "remoteRefuge", "fieldFire", "fieldMeal", "remoteStorm"]);
  const context = (legacy.opportunity as { goal?: string } | null | undefined)?.goal;
  const eligible = (id: string): boolean => {
    const key = legacyStaticOpportunityKey(id);
    const def = key && opportunityDef(key);
    if (!def || legacy.done?.[id] === true || after[id]?.some((prior) => legacy.done?.[prior] !== true)) return false;
    const inherited = context === "readWeather" && ["readWeather", "prepareWeather", "surviveForecast"].includes(id)
      || context === "remoteStorm" && ["fieldFire", "fieldMeal", "remoteStorm"].includes(id);
    return def.notBeforeDay === undefined || dayNumber(minute) >= def.notBeforeDay || legacy.introduced?.[id] === true || inherited;
  };
  const lesson = LEGACY_STAGES.flat().find((id) => weather.has(id) && eligible(id));
  if (lesson) return legacyStaticOpportunityKey(lesson) ?? null;
  for (const stage of LEGACY_STAGES) {
    const id = stage.find(eligible);
    if (id) return legacyStaticOpportunityKey(id) ?? null;
  }
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
  const at = seasons.indexOf(legacy.lastSeason ?? "spring");
  for (let i = 1; i <= seasons.length; i++) {
    const season = seasons[(at + i) % seasons.length];
    if (legacy.done?.[season] !== true) return legacyStaticOpportunityKey(season) ?? null;
  }
  return null;
}

function migrateLegacyNotices(legacy: LegacyProgressState, discovered: OpportunityKey[]): OpportunityNotice[] {
  const completed = [...new Set((legacy.queue ?? []).flatMap((id) => { const key = legacyStaticOpportunityKey(id); return key ? [key] : []; }))];
  const messages = (legacy.noticeQueue ?? []).filter((value): value is string => typeof value === "string");
  return completed.length || messages.length || discovered.length ? [{ id: "legacy:1", minute: 0, completed, completedGroups: [], discovered, messages }] : [];
}

function migrateLegacyOpportunityContext(legacy: LegacyProgressState): OpportunityContextState {
  const raw = legacy.opportunity as (Omit<WeatherOpportunityContext, "opportunity"> & { goal: string }) | null | undefined;
  let weather: WeatherOpportunityContext | null = null;
  const key = raw && typeof raw === "object" ? legacyStaticOpportunityKey(raw.goal) : undefined;
  if (raw && key) {
    const { goal, ...context } = raw;
    weather = { ...context, opportunity: goal === "fieldFire" || goal === "fieldMeal" ? "remoteStorm" : key,
      minutesByProtection: raw.minutesByProtection ?? [0, 0, 0, 0], atCampMinutes: raw.atCampMinutes ?? 0,
      awayFromCampMinutes: raw.awayFromCampMinutes ?? 0, maxWetness: raw.maxWetness ?? 0,
      readerIndex: raw.readerIndex ?? null, plan: raw.plan ?? null };
  }
  return { weather, chapter3HomeRegion: legacy.chapter3HomeRegion ?? null };
}

function migrateLegacyOpportunities(state: GameState, raw: Record<string, unknown>): void {
  const legacy = raw["goals"] as LegacyProgressState | undefined;
  if (!state.opportunities) {
    const next = newOpportunities(calendar(state.minute, state.startDoy).season);
    if (legacy) {
      next.notices = [];
      next.lastSeason = legacy.lastSeason ?? next.lastSeason;
      copyKnownLegacyProgress(next, legacy);
      next.current = firstUnfinishedLegacyLeaf(legacy, state.minute);
      // The default state already knows site and the seasons. Presentation
      // must instead follow what this legacy save had actually introduced.
      const oldId = next.current?.startsWith("season:") ? next.current.slice(7) : next.current;
      const discovered = next.current && oldId && legacy.introduced?.[oldId] !== true && legacy.done?.[oldId] !== true ? [next.current] : [];
      if (next.current) next.discoveredAt[next.current] ??= 0;
      next.notices.push(...migrateLegacyNotices(legacy, discovered));
      next.context = migrateLegacyOpportunityContext(legacy);
    }
    state.opportunities = next;
  }
  delete raw["goals"];
}

/**
 * The world half of a load, which needs the generated world and so cannot
 * live in `migrate`. Ground the save already holds is ground a survivor has
 * already stood on, so what it makes possible is knowledge the load hands
 * back rather than a discovery: it arrives without a presentation.
 */
export function knowLoadedGround(state: GameState, world: World): void {
  discoverAvailableOpportunities(state, world, calendar(state.minute, state.startDoy), false);
}

export function saveGame(state: GameState, storage: Storage = localStorage, now = Date.now()): void {
  storage.setItem(SAVE_KEY, serialize(state, now));
}

/**
 * The save a text holds, or null where there is none to read: unreadable, or
 * refused. Callers that must tell the player why it was refused read
 * `deserialize` itself, which keeps the reason.
 */
export function readSave(text: string): SaveFile | null {
  const file = deserialize(text);
  return file && "state" in file ? file : null;
}

/** A refused save loads as nothing; the caller is told why so the new run can say it. */
export function loadGame(storage: Storage = localStorage, onRefused?: (reason: string) => void): SaveFile | null {
  const text = storage.getItem(SAVE_KEY);
  const file = text ? deserialize(text) : null;
  if (file && "refused" in file) {
    onRefused?.(file.refused);
    return null;
  }
  return file;
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

export interface AwayOrder {
  label: string;
  task: TaskId;
  /** Completions and minutes since the player left. */
  done: number;
  minutes: number;
  /** Why it is blocked now, or "". */
  skipped: string;
  /** Finished and dropped off the list while away. */
  gone: boolean;
}

export interface AwaySummary {
  entries: LogEntry[];
  /** One per order of the camp the player left, in rank order. */
  orders: AwayOrder[];
  /** The region the player is in now, when it is not the one they left. */
  movedTo: string | null;
}

/**
 * Simulates the time the tab was closed and returns what happened meanwhile:
 * the log, and each order's share of it. Runs one-minute steps, the same
 * steps the foreground loop takes.
 */
export function catchUp(state: GameState, world: World, realSecondsElapsed: number, speed = 1): AwaySummary {
  const seconds = Math.min(awaySeconds(state), Math.max(0, realSecondsElapsed));
  const minutes = seconds * GAME_MINUTES_PER_REAL_SECOND * speed;
  const before = state.log.length;
  const firstMinute = state.minute;
  const region = state.player.region;
  const cal = calendar(state.minute, state.startDoy);
  // The whole order is copied: a job that finishes while away is removed with
  // its counters, and its "until" is what says how many completions that took.
  // Neither care row finishes anything for the report to count, so both are
  // left off the same way they are left off every other tally of the list's work.
  const snap = ordersHere(state, world).filter((o) => !isCareRow(o)).map((o) => ({ ...o, label: orderSentence(state, world, cal, o) }));
  advance(state, world, minutes);
  // Written while nobody watched: the panels render these by name.
  for (const e of state.log.slice(before)) if (e.minute > firstMinute) e.away = true;
  const after = regionState(state, world, region).orders;
  const orders = snap.map((s) => {
    const o = after.find((x) => x.id === s.id);
    const u = s.req.until;
    const finished = u.kind === "times" ? u.n : 1;
    return {
      label: s.label,
      task: s.req.task,
      done: o ? o.done - s.done : Math.max(0, finished - s.done),
      minutes: (o?.minutes ?? s.minutes) - s.minutes,
      skipped: o?.skipped ?? "",
      gone: !o,
    };
  });
  return {
    entries: state.log.slice(before).filter((e) => e.minute > firstMinute),
    orders,
    movedTo: state.player.region === region ? null : regionAt(world, state.player.region).name,
  };
}
