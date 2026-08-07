import { COLS, ROWS, TILE, isSolid, tileAt } from "../movement/level";
import { BLOCK_H, BLOCK_W, BODY_W, heightOf } from "../movement/engine";
import { HELP_BUTTON, PX_PER_CM, SCALE } from "./draw";
import { SHEETS } from "./sheets";
import { moveControlsLines } from "../ui/movehelp";
import { pickMoveFrame } from "./moveframes";
import type { Labels } from "../input/scheme";
import type { Level } from "../movement/level";
import type { Mover } from "../movement/engine";
import type { SheetName } from "./sheets";
import type { TimeControl } from "./draw";

/** Canvas y of the grid's top edge: 11 rows of 48 px = 528, letterboxed
 *  into the 540 canvas with the spare 12 px above. */
const GRID_Y = 12;

export interface MoveView {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  labels: Labels;
}

/** Atlas cell (16 px units) for a solid tile from its same-solid
 *  neighbourhood: the big 6x6 block's ring frames every rectangle. */
function atlasCell(l: boolean, r: boolean, t: boolean, b: boolean): [number, number] {
  const sx = !l ? 0 : !r ? 5 : 2;
  const sy = !t ? 4 : !b ? 9 : 6;
  return [sx * 16, sy * 16];
}

export function drawMoveFrame(v: MoveView, m: Mover, level: Level, overlay: boolean, time: TimeControl): void {
  const { ctx } = v;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 960, 540);

  // Tiles.
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const k = tileAt(level, col, row);
      const x = col * 48;
      const y = GRID_Y + row * 48;
      if (isSolid(k)) {
        const solid = (c: number, r2: number): boolean => isSolid(tileAt(level, c, r2));
        const [sx, sy] = atlasCell(solid(col - 1, row), solid(col + 1, row), solid(col, row - 1), solid(col, row + 1));
        ctx.drawImage(v.tiles, sx, sy, 16, 16, x, y, 48, 48);
      } else if (k === "ladder") {
        // No ladder tile in the atlas: minimal flat-colour rails and rungs.
        ctx.fillStyle = "#6b5a3a";
        ctx.fillRect(x + 9, y, 6, 48);
        ctx.fillRect(x + 33, y, 6, 48);
        ctx.fillStyle = "#8a8f98";
        for (let ry = 6; ry < 48; ry += 12) ctx.fillRect(x + 9, y + ry, 30, 4);
      }
    }
  }

  // The block: one bright atlas cell plus an outline so it reads as a prop.
  const bx = m.block.x * PX_PER_CM - (BLOCK_W * PX_PER_CM) / 2;
  const by = GRID_Y + (10 * TILE - BLOCK_H) * PX_PER_CM;
  ctx.drawImage(v.tiles, 16, 16, 16, 16, bx, by, 48, 48);
  ctx.strokeStyle = "#0e1013";
  ctx.strokeRect(bx + 0.5, by + 0.5, 47, 47);

  // The player.
  const pick = pickMoveFrame(m);
  const meta = SHEETS[pick.sheet];
  const img = v.images[pick.sheet];
  const feetScreenY = GRID_Y + m.y * PX_PER_CM;
  const feetY = meta.feetYPerFrame?.[pick.frame] ?? meta.feetY;
  ctx.save();
  ctx.translate(m.x * PX_PER_CM, 0);
  if (pick.flip) ctx.scale(-1, 1);
  ctx.drawImage(
    img, pick.frame * meta.frameW, 0, meta.frameW, meta.frameH,
    -meta.originX * SCALE, feetScreenY - feetY * SCALE, meta.frameW * SCALE, meta.frameH * SCALE,
  );
  ctx.restore();

  // Overlay: state, velocities, the collision box.
  if (overlay) {
    const h = heightOf(m.state);
    ctx.strokeStyle = "#57a55a";
    ctx.strokeRect(
      (m.x - BODY_W / 2) * PX_PER_CM, GRID_Y + (m.y - h) * PX_PER_CM,
      BODY_W * PX_PER_CM, h * PX_PER_CM,
    );
    ctx.fillStyle = "#cfd3da";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `${m.state.kind}  x ${m.x.toFixed(0)} y ${m.y.toFixed(0)}  vx ${m.vx.toFixed(0)} vy ${m.vy.toFixed(0)}`,
      12, 24,
    );
  }

  // Legend, time control, help button - the duel's furniture, this scene's table.
  const [line1, line2] = moveControlsLines(v.labels);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(line1, 480, 522);
  ctx.fillText(line2, 480, 536);
  if (time.paused || time.timescale !== 1) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#e6c229";
    ctx.fillText(time.paused ? "paused" : `${time.timescale}x`, 12, 536);
  }
  const b = HELP_BUTTON;
  ctx.strokeStyle = "#3a404c";
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("?", b.x + b.w / 2, b.y + 16);
}
