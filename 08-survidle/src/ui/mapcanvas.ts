/**
 * The board as one picture, drawn from a model.
 *
 * `buildMapModel` (map.ts) works out everything a glyph shows - its
 * classes, its character, its borders, what a pointer over it should read -
 * and this file turns that into a picture. The picture used to be 2,592
 * elements the browser laid out, styled and morphed; now it is one
 * `fillRect`-and-`fillText` pass over the model into a canvas nobody sees,
 * redrawn only when the model changes, and the effects layer (map.ts,
 * updateEffects) copies it onto the screen every frame under the light of
 * the hour. Nothing here moves on its own clock: the water, the weather,
 * the firelight and the survivor's pulse are the effects layer's, drawn
 * from its own model against the wall clock.
 *
 * Colours come from the palette (palette.ts), a function of the glyph's
 * tokens; there is no stylesheet behind the board any more and nothing to
 * ask the cascade.
 */

import { BOARD_BG, BOARD_FONT, type GlyphStyle, glyphStyle } from "./palette";

/** One glyph of the board, as `buildMapModel` decided it. */
export interface MapGlyph {
  gx: number;
  gy: number;
  /** What the glyph is, in the words the old classes used, `c` first. The palette is keyed on these. */
  classes: string[];
  /** The character drawn, or a space. */
  glyph: string;
  /** A mark (player, fire, camp, animal) rather than ground: bold, and drawn over its own weather. */
  signal: boolean;
  /** What a pointer over the glyph reads: the old aria-label. */
  info: string;
  /** The patch this glyph stands on, or null beyond the world. */
  mapCell: number | null;
  /** Whether the glyph's region can be selected (the old data-act="select"). */
  act: boolean;
  region: number;
  /** Flicker delay for a firelit glyph, in seconds, so neighbouring flames are out of step. */
  fd?: number;
  wildlifeId?: number;
  /** When a seen animal on this glyph recoiled, in wall-clock ms, for the effects layer's shake. */
  wildlifeStart?: number;
  /** An animal sharing the survivor's block at a wide rung: its letter, drawn small in the glyph's corner. */
  badge?: { glyph: string; bg: string; fg: string };
}

/** An animal at its own metre position at the closest rung, laid over the grid rather than in a glyph. */
export interface MapMark {
  id: number;
  /** Centre, in CSS pixels from the grid's corner. */
  x: number;
  y: number;
  glyph: string;
  bg: string;
  fg: string;
  /** When it recoiled, in wall-clock ms, or undefined. */
  recoilAt?: number;
}

/** A startle cue: an exclamation that pops above where something bolted or was heard. */
export interface MapStartle {
  key: number;
  /** Where its top-centre sits, in CSS pixels from the grid's corner. */
  x: number;
  y: number;
  kind: "seen" | "heard";
  startedAtMs: number;
  /** Clamped in from the panel's edge; the direction it really lies in. */
  edge: string | null;
}

export interface MapModel {
  cols: number;
  rows: number;
  px: number;
  line: number;
  font: number;
  x0: number;
  y0: number;
  z: number;
  /** Classes on the grid element: season, fine, cloud mode, night. */
  gridClasses: string[];
  night: boolean;
  season: string;
  glyphs: MapGlyph[];
  /** The walk as points in glyph units: dashed from where it began to the survivor, solid from the survivor to the target. */
  walk: { behind: [number, number][]; ahead: [number, number][] };
  marks: MapMark[];
  startles: MapStartle[];
}

const looks = new Map<string, GlyphStyle>();
let lookedGrid = "";

/** The palette's answer for one glyph, held per distinct token list for the model's life. */
export function styleOf(model: MapModel, g: MapGlyph): GlyphStyle {
  const gridKey = `${model.season}|${model.night ? "n" : "d"}`;
  if (lookedGrid !== gridKey) {
    looks.clear();
    lookedGrid = gridKey;
  }
  const key = g.classes.join(" ");
  const held = looks.get(key);
  if (held) return held;
  const style = glyphStyle({ season: model.season, night: model.night }, g.classes);
  looks.set(key, style);
  return style;
}

let board: HTMLCanvasElement | null = null;
let drawnKey = "";
let drawnDpr = 0;
let stamp = 0;

/**
 * Gives back the board's pixels. A canvas keeps its backing store as long as
 * it has a size, which for a board on a retina screen is megabytes that a
 * hidden tab is not showing anybody. The next draw sizes it again, and
 * `drawnKey` is cleared so that draw happens.
 */
export function releaseBoard(): void {
  if (!board) return;
  board.width = 0;
  board.height = 0;
  drawnKey = "";
  drawnDpr = 0;
  looks.clear();
  lookedGrid = "";
}

/** Counts draws, so a frame can tell a board it has already copied from one drawn since. */
export function boardStamp(): number {
  return stamp;
}

/** The picture as last drawn, for the effects layer to copy onto the screen; null before the first draw. */
export function boardImage(): HTMLCanvasElement | null {
  return drawnKey ? board : null;
}

/**
 * Draws the board into its own canvas. `key` is the model's own identity -
 * the map key that built it - so a call with the picture already drawn
 * costs a string compare and nothing else; that is the static layer's
 * whole budget on a still minute. Returns whether it drew.
 */
export function drawBoard(model: MapModel, key: string): boolean {
  const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  if (drawnKey === key && drawnDpr === dpr && board) return false;
  if (typeof document === "undefined") return false;
  board ??= document.createElement("canvas");
  const ctx = board.getContext("2d");
  if (!ctx) return false;
  const w = model.cols * model.px;
  const h = model.rows * model.line;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (board.width !== pw) board.width = pw;
  if (board.height !== ph) board.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const px = model.px;
  const line = model.line;
  // Backgrounds and washes first, then borders, then characters, so a
  // neighbour's border is never painted over by this cell's ground and a
  // character always sits over everything under it.
  for (const g of model.glyphs) {
    const s = styleOf(model, g);
    if (!s.bg && !s.wash) continue;
    const x = g.gx * px;
    const y = g.gy * line;
    if (s.bg) {
      ctx.fillStyle = s.bg;
      ctx.fillRect(x, y, px, line);
    }
    if (s.wash) {
      ctx.fillStyle = s.wash;
      ctx.fillRect(x, y, px, line);
    }
  }
  for (const g of model.glyphs) {
    const s = styleOf(model, g);
    if (!s.border.l && !s.border.r && !s.border.t && !s.border.b) continue;
    const x = g.gx * px;
    const y = g.gy * line;
    if (s.border.l) { ctx.fillStyle = s.border.l; ctx.fillRect(x, y, 1, line); }
    if (s.border.r) { ctx.fillStyle = s.border.r; ctx.fillRect(x + px - 1, y, 1, line); }
    if (s.border.t) { ctx.fillStyle = s.border.t; ctx.fillRect(x, y, px, 1); }
    if (s.border.b) { ctx.fillStyle = s.border.b; ctx.fillRect(x, y + line - 1, px, 1); }
  }
  let font = "";
  for (const g of model.glyphs) {
    const s = styleOf(model, g);
    const x = g.gx * px + px / 2;
    const y = g.gy * line + line / 2;
    if (s.dot) {
      const want = `${model.font}px ${BOARD_FONT}`;
      if (font !== want) { ctx.font = want; font = want; }
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.dot;
      ctx.fillText("·", x, y);
      continue;
    }
    if (s.hidden || g.glyph === " " || g.glyph === "") continue;
    const want = `${s.bold ? "bold " : ""}${model.font}px ${BOARD_FONT}`;
    if (font !== want) { ctx.font = want; font = want; }
    ctx.globalAlpha = s.alpha;
    if (s.glow) {
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = 4;
    }
    ctx.fillStyle = s.fg;
    ctx.fillText(g.glyph, x, y);
    if (s.glow) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }
    if (s.underline) {
      ctx.fillStyle = s.underline;
      ctx.fillRect(g.gx * px + 1, g.gy * line + line - 2, px - 2, 1);
    }
  }
  ctx.globalAlpha = 1;
  drawnKey = key;
  drawnDpr = dpr;
  stamp++;
  return true;
}

/** For a test or a rebuild that must draw again whatever the key says. */
export function forgetDrawnBoard(): void {
  drawnKey = "";
}
