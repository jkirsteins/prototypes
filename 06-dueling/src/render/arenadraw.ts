import { GRID_Y, drawMover, drawTiles } from "./movedraw";
import { HELP_BUTTON, PX_PER_CM, drawDuelPresentation, drawFighter, drawTrackRow } from "./draw";
import { ARENA_PLATFORM } from "../movement/level";
import { BODY_W, heightOf } from "../movement/engine";
import { DRAW_MS } from "../scenes/arenarules";
import { arenaControlsLines } from "../ui/arenahelp";
import type { ArenaWorld, PlayerRep } from "../scenes/arena";
import type { Labels } from "../input/scheme";
import type { MoveView } from "./movedraw";
import type { SheetName } from "./sheets";
import type { TimeControl, View } from "./draw";

export interface ArenaView {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  labels: Labels;
}

/** A fighter's ground in canvas px from its cm floor: one mapping for
 *  everything the arena draws, the movedraw grid's. */
export function floorPx(floorYcm: number): number {
  return GRID_Y + floorYcm * PX_PER_CM;
}

/** The action-track rows' offsets, the same geometry draw.ts uses. */
const ROW1_LABEL_Y = -184;
const ROW1_BAR_Y = -178;

export function drawArenaFrame(v: ArenaView, w: ArenaWorld, overlay: boolean, time: TimeControl): void {
  const { ctx } = v;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 960, 540);

  const mv: MoveView = { ctx, images: v.images, tiles: v.tiles, labels: v.labels };
  const fv: View = { ctx, images: v.images, overlay, labels: v.labels };
  drawTiles(mv, w.level);

  if (w.duel !== null) {
    // A live (or just-decided) duel renders EXACTLY the duel scene's
    // stack - measure bands, line bars, tracks, log, HUD, bind bar,
    // opening prompt, time control, banner - lifted to the platform.
    drawDuelPresentation(fv, w.duel, w.aiMode, w.seed, time, floorPx(ARENA_PLATFORM.topY));
    drawSheatheBar(fv, w);
    return;
  }

  const enemyFloor = floorPx(ARENA_PLATFORM.topY);
  drawFighter(fv, w.enemy, w.time, null, 1, enemyFloor);
  drawPlayer(fv, mv, w);

  if (overlay && (w.player.kind === "mover" || w.player.kind === "drawing")) {
    const m = w.player.m;
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

  const [line1, line2] = arenaControlsLines(v.labels);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(line1, 480, 522);
  ctx.fillText(line2, 480, 536);
  ctx.textAlign = "left";
  drawTimeAndHelp(v, time);
}

function drawPlayer(fv: View, mv: MoveView, w: ArenaWorld): void {
  const p: PlayerRep = w.player;
  if (p.kind === "mover") {
    drawMover(mv, p.m);
    return;
  }
  if (p.kind === "drawing") {
    drawMover(mv, p.m);
    drawTrackRow(
      fv, p.m.x * PX_PER_CM, ROW1_LABEL_Y + 40, ROW1_BAR_Y + 40,
      "drawing", "#e6c229", p.t / DRAW_MS, floorPx(p.m.y),
    );
    return;
  }
  const floor = floorPx(p.floorY);
  drawFighter(fv, p.f, w.time, null, 0, floor);
  if (p.kind === "sheathing") {
    drawTrackRow(
      fv, p.f.x * PX_PER_CM, ROW1_LABEL_Y + 40, ROW1_BAR_Y + 40,
      "sheathing", "#e6c229", p.t / DRAW_MS, floor,
    );
  }
}

/** The mid-duel sheathe: the same action-track bar, on the committed body. */
function drawSheatheBar(fv: View, w: ArenaWorld): void {
  if (w.player.kind !== "sheathing") return;
  drawTrackRow(
    fv, w.player.f.x * PX_PER_CM, ROW1_LABEL_Y + 40, ROW1_BAR_Y + 40,
    "sheathing", "#e6c229", w.player.t / DRAW_MS, floorPx(w.player.floorY),
  );
}

function drawTimeAndHelp(v: ArenaView, time: TimeControl): void {
  const { ctx } = v;
  if (time.paused || time.timescale !== 1) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#e6c229";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(time.paused ? "paused" : `${time.timescale}x`, 12, 536);
  }
  if (!time.paused && time.bulletScale < 0.995) {
    ctx.fillStyle = "#4aa3df";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`BULLET TIME ${time.bulletScale.toFixed(2)}x`, 480, 126);
    ctx.textAlign = "left";
  }
  const b = HELP_BUTTON;
  ctx.strokeStyle = "#3a404c";
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("?", b.x + b.w / 2, b.y + 16);
  ctx.textAlign = "left";
}
