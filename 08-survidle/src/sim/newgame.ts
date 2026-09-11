import { derive, Rng } from "../rng";
import { generateWorld, regionAt, type World } from "../world/gen";
import { calendar, fmtDate, START_DOY } from "./calendar";
import { newGoals } from "./goals";
import { AWAY_HOURS_DEFAULT } from "../units";
import { addItem, emptyInventory } from "./inventory";
import { FOODS, KCAL_FULL } from "./items";
import { creditYield } from "./ledger";
import { log } from "./log";
import { mapRegion } from "./mapped";
import { newRecord } from "./record";
import { rollName } from "./names";
import { fatLandmarks, medianPerson, personOf, rollCandidates } from "./person";
import { enterRegion } from "./regionstate";
import { seeFrom } from "./sight";
import { newSkills } from "./skills";
import { resetTeaching } from "./teach";
import type { GameState, LifeRecord, Person, Player } from "./types";
import { ensureGround, localWeather, newWeather } from "./weather";
import { emptyWildlife, resetWildlifeKnowledge } from "./wildlife-agents";

/**
 * The stomach a survivor arrives with: fed, not gorged. A share of the pool
 * rather than a number of its own, so it cannot end up above the cap and be
 * clamped away in the first hour ashore.
 */
export const START_KCAL = KCAL_FULL * (5 / 6);
/** Dried meat in the arrival pack, in kilos. */
export const ARRIVAL_DRIED_MEAT_KG = 1;

function freshPlayer(person: Person, world: World, cell: number, region: number): Player {
  const pack = emptyInventory();
  addItem(pack, "driedMeat", ARRIVAL_DRIED_MEAT_KG);
  return {
    skyReadDay: null,
    x: (cell % world.w) + 0.5,
    y: Math.floor(cell / world.w) + 0.5,
    region,
    health: 100,
    kcal: START_KCAL,
    fat: fatLandmarks(person).typical,
    warmth: 80,
    energy: 90,
    // The debt a body carries off a full night and two hours up, which is
    // where an 08:00 landing starts; the same reading a save without the
    // reserve derives from its fatigue.
    sleepDebt: 10,
    sleeping: null,
    collapsed: false,
    bodyNeed: null,
    coldSpent: false,
    wetness: 0,
    sick: 0,
    injured: 0,
    clothing: [
      { id: "woolCoat", durability: 60, wet: 0 },
      { id: "woolTrousers", durability: 60, wet: 0 },
      { id: "leatherBoots", durability: 50, wet: 0 },
      { id: "woolHat", durability: 70, wet: 0 },
    ],
    tools: [{ id: "axe", durability: 100 }],
    torch: { lit: false, minutes: 0 },
    fieldFire: null,
    pack,
    water: 2.5,
    frostbite: { feet: 0, hands: 0 },
    toes: false,
    fingers: false,
    gut: { day: 1, kg: {}, leanKcal: 0 },
    known: {},
    huntSigns: {},
  };
}

/** Fills the person half of a state: the body, its kit, its skills and its empty log. The world half is untouched. */
export function newPerson(state: GameState, world: World, cell: number, region: number): void {
  resetWildlifeKnowledge(state);
  state.player = freshPlayer(personOf(state), world, cell, region);
  state.task = null;
  state.log = [];
  state.dead = null;
  state.stats = { trees: 0, animals: 0, structures: 0, km: 0, kills: {}, killsKcal: 0 };
  state.skills = newSkills();
  state.paused = {};
  state.route = null;
  state.intent = null;
  state.ledger = [];
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
  // A person coming into being looks around: the ground underfoot and
  // whatever the eye reaches from it is the whole of what they know.
  seeFrom(state, world, calendar(state.minute, state.startDoy), cell);
}

/** The first survivor's record for the direct path: a name for the sex the seed rolls, and the median person unless one is given. */
export function firstRecord(seed: number, startDoy: number, person?: Person): LifeRecord {
  const rng = new Rng(derive(seed, 7));
  const sex = rng.int(2) === 0 ? "f" : "m";
  const p = person ?? medianPerson(sex);
  return newRecord(1, rollName(rng, p.sex, []), { year: 1, doy: startDoy }, 0, p);
}

/**
 * A new world as the player meets it: on the landing screen, three people
 * aboard the first boat, the date a week later per boat asked for. The
 * placeholder under the overlay is the median survivor, which land replaces.
 */
export function newWorld(seed: number, boat = 0, startDoy = START_DOY): { state: GameState; world: World } {
  const doy = startDoy + 7 * boat;
  const g = newGame(seed, doy);
  const start = regionAt(g.world, g.world.start);
  const candidates = rollCandidates(seed, 1, boat, []);
  g.state.log = [];
  g.state.landing = { cell: start.campCell, region: g.world.start, date: { year: 1, doy }, gapDays: 0, candidates, boat, chosen: 0, name: candidates[0].name, oldCamp: null };
  return g;
}

/** A fresh run: spring, an axe, the clothes on your back and a day's food. */
// The start region's camp is the landing shore (gen.ts findStart).
export function newGame(seed: number, startDoy = START_DOY, person?: Person): { state: GameState; world: World } {
  const world = generateWorld(seed);
  const start = regionAt(world, world.start);
  const first = firstRecord(seed, startDoy, person);
  const state: GameState = {
    seed,
    startDoy,
    awayHours: AWAY_HOURS_DEFAULT,
    minute: 0,
    advanceCarry: 0,
    rng: derive(seed, 99),
    player: freshPlayer(first.person, world, start.campCell, world.start),
    regions: {},
    discovered: {},
    mapped: {},
    weather: newWeather(startDoy),
    task: null,
    log: [],
    dead: null,
    stats: { trees: 0, animals: 0, structures: 0, km: 0, kills: {}, killsKcal: 0 },
    skills: newSkills(),
    lastHour: 0,
    lastDay: 0,
    piles: {},
    paused: {},
    carcasses: [],
    nextCarcassId: 1,
    huntPressure: {},
    seeps: {},
    route: null,
    intent: null,
    ledger: [],
    survivors: [first],
    year: 1,
    landing: null,
    spine: { fired: {}, announced: {} },
    manualSeen: false,
    goals: newGoals(calendar(0, startDoy).season),
    shopping: null,
    taught: {},
    teachQueue: [],
    wildlife: emptyWildlife(),
  };
  // The same fresh slate a landing gives, from the one door that gives it.
  resetTeaching(state);
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
  ensureGround(state, world, world.start);
  const local = localWeather(state, world);
  Object.assign(state.weather, {
    precip: local.precip, clear: local.clear, offset: local.offset, snowCm: local.snowCm,
    rolledDay: local.rolledDay, dryDays: local.dryDays, wetDay: local.wetDay, iceCm: local.iceCm,
  });
  seeFrom(state, world, calendar(state.minute, state.startDoy), start.campCell);
  enterRegion(state, world, world.start);
  // A camp is chosen, and a choice needs the ground in front of you.
  mapRegion(state, world, world.start);
  if (startDoy === START_DOY) log(state, `1 April. Snow still lies in the shade at ${start.name}. {You} {have} an axe, wool on {your} back and a kilo of dried meat.`);
  else log(state, `${fmtDate(calendar(0, startDoy))}. {You} {wake} at ${start.name} with an axe, wool on {your} back and a kilo of dried meat.`);
  return { state, world };
}
