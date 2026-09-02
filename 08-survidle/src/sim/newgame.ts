import { derive } from "../rng";
import { generateWorld, type World } from "../world/gen";
import { addItem, emptyInventory } from "./inventory";
import { log } from "./log";
import { type GameState, type RegionState, SPECIES, type Species } from "./types";

export function newRegionState(world: World, id: number): RegionState {
  const r = world.regions[id];
  const pop = {} as Record<Species, number>;
  for (const s of SPECIES) pop[s] = r.capacity[s] * 0.7;
  return {
    wood: r.wood0,
    pop,
    piles: {},
    structures: { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0 },
    build: {},
    fire: { lit: false, fuelKg: 0 },
    rack: { kg: 0, dried: 0 },
    snareCatch: { count: 0, age: 0 },
  };
}

/** A fresh run: spring, an axe, the clothes on your back and a day's food. */
export function newGame(seed: number): { state: GameState; world: World } {
  const world = generateWorld(seed);
  const pack = emptyInventory();
  addItem(pack, "driedMeat", 1);
  const state: GameState = {
    seed,
    minute: 0,
    rng: derive(seed, 99),
    player: {
      region: world.start,
      spot: "camp",
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
      pack,
      autoEat: true,
      autoFeed: true,
    },
    regions: world.regions.map((r) => newRegionState(world, r.id)),
    weather: { precip: "none", clear: true, offset: 0, snowCm: 3, rolledDay: 0 },
    task: null,
    log: [],
    dead: null,
    stats: { trees: 0, animals: 0, structures: 0, km: 0 },
    lastHour: 0,
    lastDay: 0,
    paused: {},
  };
  log(state, `1 April. Snow still lies in the shade at ${world.regions[world.start].name}. You have an axe, wool on your back and a kilo of dried meat.`);
  return { state, world };
}
