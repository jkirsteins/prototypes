/**
 * The board as the tests read it: the model the canvas draws, glyph by
 * glyph. A glyph's `classes` are the words the old cells carried (`t-water`,
 * `memory`, `mk-player`), so an assertion that used to select `.c.t-water.
 * memory` asks `glyphsWith(board, "t-water", "memory")` and means the same.
 */
import type { Calendar } from "../src/sim/calendar";
import type { GameState } from "../src/sim/types";
import { mapModel } from "../src/ui/map";
import type { MapGlyph, MapModel } from "../src/ui/mapcanvas";
import type { UiState } from "../src/ui/render";
import type { World } from "../src/world/gen";
import { WORLD_W } from "../src/world/terrain";

export type { MapGlyph, MapModel };

export function board(world: World, state: GameState, ui: UiState, cal: Calendar, nowMs?: number): MapModel {
  return mapModel(world, state, ui, cal, nowMs);
}

/** Whether a glyph carries every one of these words. A word starting with `!` must be absent. */
export function has(g: MapGlyph, ...tokens: string[]): boolean {
  return tokens.every((t) => (t.startsWith("!") ? !g.classes.includes(t.slice(1)) : g.classes.includes(t)));
}

export function glyphsWith(model: MapModel, ...tokens: string[]): MapGlyph[] {
  return model.glyphs.filter((g) => has(g, ...tokens));
}

export function glyphAt(model: MapModel, gx: number, gy: number): MapGlyph {
  return model.glyphs[gy * model.cols + gx];
}

/**
 * The glyph this patch falls in, or undefined when the patch is off the
 * board. At a block rung a glyph stands over z by z patches and its
 * `mapCell` names the block's first; the patch asked about can be any of
 * them.
 */
export function glyphOfCell(model: MapModel, cell: number): MapGlyph | undefined {
  const gx = Math.floor((cell % WORLD_W - model.x0) / model.z);
  const gy = Math.floor((Math.floor(cell / WORLD_W) - model.y0) / model.z);
  if (gx < 0 || gy < 0 || gx >= model.cols || gy >= model.rows) return undefined;
  return model.glyphs[gy * model.cols + gx];
}

/** Every glyph's words joined, for an assertion that a token appears (or not) anywhere on the board. */
export function boardText(model: MapModel): string {
  return model.glyphs.map((g) => `${g.classes.join(" ")}|${g.glyph}|${g.info}`).join("\n");
}
