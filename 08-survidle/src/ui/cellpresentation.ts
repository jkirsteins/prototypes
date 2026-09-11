import { surfaceHeading, surfaceLocation, surfaceOf, terrainHeading, type CellSurface } from "../sim/cellstatus";
import type { GameState, LocalGroundWeather, Terrain } from "../sim/types";
import { groundAt } from "../sim/weather";
import { cellAt, waterKindOf, type World } from "../world/gen";
import { groundGlyph } from "./ground";

export const TERRAIN_GLYPH: Record<Terrain, string> = {
  water: "~",
  fell: "^",
  rock: "n",
  bog: '"',
  spruce: "A",
  pine: "T",
  birch: "Y",
  meadow: ".",
  river: "=",
};

export type CellKnowledge = "unknown" | "current" | "remembered" | "inherited";

interface UnknownCellPresentation {
  knowledge: "unknown";
  heading: "unknown ground";
  glyph: " ";
  classes: readonly string[];
}

interface KnownCellPresentation {
  knowledge: "remembered" | "inherited";
  terrain: Terrain;
  heading: string;
  glyph: string;
  classes: readonly string[];
}

interface CurrentCellPresentation {
  knowledge: "current";
  terrain: Terrain;
  surface: CellSurface;
  heading: string;
  location: string;
  glyph: string;
  classes: readonly string[];
}

export type CellPresentation = UnknownCellPresentation | KnownCellPresentation | CurrentCellPresentation;
export type GroundResolver = () => Pick<LocalGroundWeather, "snowCm" | "iceCm">;

export function cellKnowledge(state: GameState, cell: number, visible: boolean): CellKnowledge {
  if (visible) return "current";
  const mapped = state.mapped[cell];
  if (mapped === undefined) return "unknown";
  return mapped === 1 ? "remembered" : "inherited";
}

export function cellPresentation(
  state: GameState,
  world: World,
  cell: number,
  knowledge: CellKnowledge,
  resolveGround?: GroundResolver,
): CellPresentation {
  if (knowledge === "unknown") return { knowledge, heading: "unknown ground", glyph: " ", classes: [] };
  const groundCell = cellAt(world, cell);
  const base = TERRAIN_GLYPH[groundCell.terrain];
  const glyph = groundGlyph(world, groundCell.x, groundCell.y, groundCell.terrain, base);
  if (knowledge !== "current") {
    return {
      knowledge,
      terrain: groundCell.terrain,
      heading: terrainHeading(groundCell.terrain),
      glyph,
      classes: [`t-${groundCell.terrain}`, knowledge === "remembered" ? "memory" : "dim"],
    };
  }
  const ground = resolveGround?.() ?? groundAt(state, world, groundCell.region);
  const water = waterKindOf(world, groundCell.y * world.w + groundCell.x) ?? "lake";
  const surface = surfaceOf(groundCell.terrain, water, ground);
  const classes = [`t-${groundCell.terrain}`];
  if (surface.kind === "water" && surface.ice !== "none") classes.push(surface.ice === "safe" ? "ice-safe" : "ice-thin");
  if (surface.kind === "land" && surface.snow !== "none") {
    classes.push("ground-snow");
    if (surface.snow === "deep") classes.push("ground-snow-deep");
  }
  return {
    knowledge,
    terrain: groundCell.terrain,
    surface,
    heading: surfaceHeading(surface),
    location: surfaceLocation(surface),
    glyph,
    classes,
  };
}
