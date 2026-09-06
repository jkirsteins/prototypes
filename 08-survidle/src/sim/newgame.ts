import { derive, Rng } from "../rng";
import { generateWorld, regionAt, type World } from "../world/gen";
import { calendar, fmtDate, START_DOY } from "./calendar";
import { AWAY_HOURS_DEFAULT } from "../units";
import { addItem, emptyInventory } from "./inventory";
import { FOODS } from "./items";
import { creditYield } from "./ledger";
import { log } from "./log";
import { newRecord } from "./record";
import { rollName } from "./names";
import { derived, medianPerson, personOf, rollCandidates } from "./person";
import { enterRegion } from "./regionstate";
import { newSkills } from "./skills";
import type { GameState, LifeRecord, Person } from "./types";
import { seasonalMean } from "./weather";

/** The stomach a survivor arrives with, in kcal. */
export const START_KCAL = 5000;
/** Dried meat in the arrival pack, in kilos. */
export const ARRIVAL_DRIED_MEAT_KG = 1;

/** Fills the person half of a state: the body, its kit, its skills and its empty log. The world half is untouched. */
export function newPerson(state: GameState, world: World, cell: number, region: number): void {
  const d = derived(personOf(state));
  const pack = emptyInventory();
  addItem(pack, "driedMeat", ARRIVAL_DRIED_MEAT_KG);
  state.player = {
    x: (cell % world.w) + 0.5,
    y: Math.floor(cell / world.w) + 0.5,
    region,
    health: 100,
    kcal: START_KCAL,
    fat: d.fatFull,
    warmth: 80,
    energy: 90,
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
    pack,
    autoEat: true,
    autoFeed: true,
    water: 2.5,
    autoDrink: true,
    frostbite: { feet: 0, hands: 0 },
    toes: false,
    fingers: false,
    berriesToday: { day: 1, kg: 0 },
    workHours: d.workHours,
    known: {},
  };
  state.task = null;
  state.log = [];
  state.dead = null;
  state.stats = { trees: 0, animals: 0, structures: 0, km: 0 };
  state.skills = newSkills();
  state.paused = {};
  state.route = null;
  state.intent = null;
  state.ledger = [];
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
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
export function newGame(seed: number, startDoy = START_DOY, person?: Person): { state: GameState; world: World } {
  const world = generateWorld(seed);
  const start = regionAt(world, world.start);
  // The weather opens for the season: past the thaw there is no ice and no snow.
  const warm = seasonalMean(startDoy) > 0;
  const state = {
    seed,
    startDoy,
    awayHours: AWAY_HOURS_DEFAULT,
    minute: 0,
    rng: derive(seed, 99),
    regions: {},
    discovered: {},
    weather: { precip: "none", clear: true, offset: 0, snowCm: warm ? 0 : 3, rolledDay: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 },
    lastHour: 0,
    lastDay: 0,
    piles: {},
    seeps: {},
    survivors: [firstRecord(seed, startDoy, person)],
    year: 1,
    landing: null,
    spine: { fired: {}, announced: {} },
  } as GameState;
  newPerson(state, world, start.campCell, world.start);
  enterRegion(state, world, world.start);
  if (startDoy === START_DOY) log(state, `1 April. Snow still lies in the shade at ${start.name}. You have an axe, wool on your back and a kilo of dried meat.`);
  else log(state, `${fmtDate(calendar(0, startDoy))}. You wake at ${start.name} with an axe, wool on your back and a kilo of dried meat.`);
  return { state, world };
}
