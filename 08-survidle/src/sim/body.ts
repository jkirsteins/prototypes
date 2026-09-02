// Stub until the body tier lands.
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import type { Step } from "./steps";
import type { BodyNeed, GameState, Intent } from "./types";

export function currentNeed(_state: GameState, _cal: Calendar, _it: Intent): BodyNeed | null {
  return null;
}
export function bodyStep(_state: GameState, _world: World, _cal: Calendar, _rng: Rng, _need: BodyNeed): Step | null {
  return null;
}
export function provision(_state: GameState, _world: World): void {}
