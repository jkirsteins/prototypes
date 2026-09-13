import { groundChangeAt } from "../world/cells";
import { cellAt, waterKindOf, type World } from "../world/gen";
import type { GroundChangeKind } from "../world/groundchange";
import type { GameState, IceMode, LocalGroundWeather, Terrain } from "./types";
import { DEEP_SNOW_CM, groundAtPatch, iceMode } from "./weather";

export const SNOW_SHOWN_CM = 5;

export type SnowCover = "none" | "cover" | "deep";
type LandTerrain = Exclude<Terrain, "water">;

export type CellSurface =
  | { kind: "water"; terrain: "water" | "river"; water: "lake" | "sea" | "river"; ice: IceMode }
  | { kind: "land"; terrain: LandTerrain; snow: SnowCover; change?: GroundChangeKind };

const TERRAIN_HEADING: Record<Terrain, string> = {
  water: "water",
  fell: "open fell",
  rock: "bare rock",
  bog: "bog",
  spruce: "spruce forest",
  pine: "pine forest",
  birch: "birch wood",
  meadow: "meadow",
  river: "river",
};

const TERRAIN_LOCATION: Record<Terrain, string> = {
  water: "in the water",
  fell: "up on the fell",
  rock: "on the rocks",
  bog: "on the bog",
  spruce: "in the spruce",
  pine: "among the pines",
  birch: "among the birches",
  meadow: "on open ground",
  river: "at the river",
};

const SNOW_LOCATION: Record<LandTerrain, string> = {
  fell: "on snow-covered fell",
  rock: "on snow-covered rocks",
  bog: "on snow-covered bog",
  spruce: "in snow-covered spruce",
  pine: "among snow-covered pines",
  birch: "among snow-covered birches",
  meadow: "on snow-covered open ground",
  river: "at the frozen river",
};

/**
 * What changed ground is called. It reads as meadow to every mechanic, but it
 * is not a meadow to look at and the player cut it themselves, so the heading
 * and the tooltip name what it actually is.
 */
export const GROUND_CHANGE_HEADING: Record<GroundChangeKind, string> = { clearing: "clearing", young: "young growth" };
const GROUND_CHANGE_LOCATION: Record<GroundChangeKind, string> = { clearing: "in a clearing", young: "in young growth" };

export function terrainHeading(terrain: Terrain): string {
  return TERRAIN_HEADING[terrain];
}

export function surfaceOf(
  terrain: Terrain,
  water: "lake" | "sea" | "river",
  ground: Pick<LocalGroundWeather, "snowCm" | "iceCm">,
  change?: GroundChangeKind,
): CellSurface {
  if (terrain === "water" || terrain === "river") return { kind: "water", terrain, water, ice: iceMode(ground) };
  const snow: SnowCover = ground.snowCm > DEEP_SNOW_CM ? "deep" : ground.snowCm > SNOW_SHOWN_CM ? "cover" : "none";
  return { kind: "land", terrain, snow, change };
}

export function cellSurface(state: GameState, world: World, cell: number): CellSurface {
  const groundCell = cellAt(world, cell);
  const water = waterKindOf(world, cell) ?? "lake";
  // Snow is read where the survivor is looking, not averaged over the region.
  return surfaceOf(groundCell.terrain, water, groundAtPatch(state, world, cell), groundChangeAt(world, cell)?.kind);
}

export function surfaceHeading(surface: CellSurface): string {
  if (surface.kind === "water") {
    if (surface.ice === "thin") return "thin ice over water";
    if (surface.ice === "safe") return "safe ice over water";
    return terrainHeading(surface.terrain);
  }
  const terrain = surface.change ? GROUND_CHANGE_HEADING[surface.change] : terrainHeading(surface.terrain);
  if (surface.snow === "cover") return `snow-covered ${terrain}`;
  if (surface.snow === "deep") return `deep snow over ${terrain}`;
  return terrain;
}

export function surfaceLocation(surface: CellSurface): string {
  if (surface.kind === "water") {
    if (surface.ice === "thin") return "on thin ice";
    if (surface.ice === "safe") return "on safe ice";
    return TERRAIN_LOCATION[surface.terrain];
  }
  const where = surface.change ? GROUND_CHANGE_LOCATION[surface.change] : TERRAIN_LOCATION[surface.terrain];
  if (surface.snow === "cover") return surface.change ? `on snow-covered ${GROUND_CHANGE_HEADING[surface.change]}` : SNOW_LOCATION[surface.terrain];
  if (surface.snow === "deep") return `in deep snow ${where}`;
  return where;
}
