import { derive } from "../rng";
import { generateWorld, regionAt, type World } from "../world/gen";
import { addItem, emptyInventory } from "./inventory";
import { FOODS } from "./items";
import { creditYield } from "./ledger";
import { log } from "./log";
import { FAT_FULL } from "./player";
import { enterRegion } from "./regionstate";
import { newSkills } from "./skills";
import type { GameState } from "./types";

/** The stomach a survivor arrives with, in kcal. */
export const START_KCAL = 5000;
/** Dried meat in the arrival pack, in kilos. */
export const ARRIVAL_DRIED_MEAT_KG = 1;

/** A fresh run: spring, an axe, the clothes on your back and a day's food. */
export function newGame(seed: number): { state: GameState; world: World } {
  const world = generateWorld(seed);
  const start = regionAt(world, world.start);
  const pack = emptyInventory();
  addItem(pack, "driedMeat", ARRIVAL_DRIED_MEAT_KG);
  const state: GameState = {
    seed,
    minute: 0,
    rng: derive(seed, 99),
    player: {
      x: (start.campCell % world.w) + 0.5,
      y: Math.floor(start.campCell / world.w) + 0.5,
      region: world.start,
      health: 100,
      kcal: START_KCAL,
      fat: FAT_FULL,
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
    },
    regions: {},
    discovered: {},
    weather: { precip: "none", clear: true, offset: 0, snowCm: 3, rolledDay: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 },
    task: null,
    log: [],
    dead: null,
    stats: { trees: 0, animals: 0, structures: 0, km: 0 },
    skills: newSkills(),
    lastHour: 0,
    lastDay: 0,
    paused: {},
    piles: {},
    route: null,
    intent: null,
    ledger: [],
  };
  enterRegion(state, world, world.start);
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
  log(state, `1 April. Snow still lies in the shade at ${start.name}. You have an axe, wool on your back and a kilo of dried meat.`);
  return { state, world };
}
