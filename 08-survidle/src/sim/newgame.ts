import { derive } from "../rng";
import { generateWorld, regionAt, type World } from "../world/gen";
import { addItem, emptyInventory } from "./inventory";
import { log } from "./log";
import { enterRegion } from "./regionstate";
import { newSkills } from "./skills";
import type { GameState } from "./types";

/** A fresh run: spring, an axe, the clothes on your back and a day's food. */
export function newGame(seed: number): { state: GameState; world: World } {
  const world = generateWorld(seed);
  const start = regionAt(world, world.start);
  const pack = emptyInventory();
  addItem(pack, "driedMeat", 1);
  const state: GameState = {
    seed,
    minute: 0,
    rng: derive(seed, 99),
    player: {
      x: (start.campCell % world.w) + 0.5,
      y: Math.floor(start.campCell / world.w) + 0.5,
      region: world.start,
      health: 100,
      kcal: 5000,
      warmth: 80,
      energy: 90,
      wetness: 0,
      sick: 0,
      injured: 0,
      clothing: [
        { id: "woolCoat", durability: 60 },
        { id: "woolTrousers", durability: 60 },
        { id: "leatherBoots", durability: 50 },
        { id: "woolHat", durability: 70 },
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
  };
  enterRegion(state, world, world.start);
  log(state, `1 April. Snow still lies in the shade at ${start.name}. You have an axe, wool on your back and a kilo of dried meat.`);
  return { state, world };
}
