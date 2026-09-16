/**
 * What a glyph of the board looks like, from what the model says it is.
 *
 * The map used to be 2,592 elements dressed in classes, and this was 140
 * stylesheet rules: terrain by tone by season by snow by ice by mark by
 * night, resolved by the cascade for every cell on every change. The board
 * is a canvas now, and a canvas asks a function. This is that function,
 * the rules carried over one by one with the cascade's own order of
 * precedence written out as the order of the assignments: a later line
 * wins the way a later, more specific rule won. The tokens are the same
 * words the classes were (`t-water`, `memory`, `mk-player`), because the
 * model still speaks them and the tests still read them.
 *
 * Nothing here moves. The night fire's flicker, the lit rings and the
 * mood's breath are the effects layer's (map.ts, drawPulses), drawn over
 * these colours every frame; what this returns for a lit glyph is where
 * that animation starts from.
 */

/** One glyph's look, in the terms the canvas draws in. */
export interface GlyphStyle {
  /** The cell's own fill, or null where the board's dark shows through. */
  bg: string | null;
  /** The character's colour, with the memory and far filters already applied. */
  fg: string;
  /** Opacity of the drawn character (`dim`, `far`). */
  alpha: number;
  bold: boolean;
  /** The terrain character hidden under a weather glyph the effects layer draws instead. */
  hidden: boolean;
  /** Something lies here: an underline in this colour. */
  underline: string | null;
  /** The `cur` and `sel` washes, a translucent fill over the whole cell. */
  wash: string | null;
  /** The walk's destination glows in this colour. */
  glow: string | null;
  /** Region edges: a one-pixel line on the side that owns one. */
  border: { l: string | null; r: string | null; t: string | null; b: string | null };
  /** Fog and void draw a dot in this colour rather than a character. */
  dot: string | null;
}

/** The season and hour tokens the grid itself carries. */
export interface GridLook {
  season: string;
  night: boolean;
}

// The page's own variables, as :root declares them.
const DIM = "#7f8894";
const ACCENT = "#e6c229";
const WATER = "#3b7dd8";
const BORDER = "#3b6fd1";

/** The grid's background: what shows where a glyph paints nothing. */
export const BOARD_BG = "#05070c";
export const BOARD_FONT = 'ui-monospace, Menlo, "SF Mono", Consolas, monospace';

const TERRAIN: Record<string, { fg: string; bg: string | null }> = {
  water: { fg: "#3a6fd8", bg: "#0a1633" },
  river: { fg: WATER, bg: null },
  spruce: { fg: "#1f8f3a", bg: "#0b1f11" },
  pine: { fg: "#3fbf5a", bg: "#0e2415" },
  birch: { fg: "#9be36a", bg: "#1a2a12" },
  meadow: { fg: "#6f9a3c", bg: "#171f0f" },
  bog: { fg: "#2f9f8f", bg: "#0b221f" },
  rock: { fg: "#7a7f88", bg: "#1a1c20" },
  fell: { fg: "#b9bec8", bg: "#22252b" },
};

/** Height as tone, on bare ground: the letter for the trees, the letter and the cell for open ground. */
const TONE: Record<string, [{ fg: string; bg?: string }, { fg: string; bg?: string }]> = {
  spruce: [{ fg: "#16642a" }, { fg: "#35c455" }],
  pine: [{ fg: "#2d8640" }, { fg: "#6ee089" }],
  birch: [{ fg: "#6da548" }, { fg: "#c2f593" }],
  meadow: [{ fg: "#5c8032", bg: "#131a0c" }, { fg: "#8ab84a", bg: "#1c2612" }],
  bog: [{ fg: "#278477", bg: "#091c1a" }, { fg: "#3cc2af", bg: "#0e2b27" }],
  rock: [{ fg: "#666b73", bg: "#16181c" }, { fg: "#92979f", bg: "#202329" }],
  fell: [{ fg: "#9aa0aa", bg: "#1d2026" }, { fg: "#d6dbe4", bg: "#292d35" }],
};

/** Under snow the terrains keep telling themselves apart, in the cold end of their own colours. */
const SNOW_FG: Record<string, string> = {
  spruce: "#6f9e78", pine: "#86b592", birch: "#9fb8c8",
  meadow: "#dfe6f0", bog: "#c2d4dc", rock: "#d8dee8", fell: "#f2f6fb",
};
const DEEP_SNOW_FG: Record<string, string> = { spruce: "#c3d6dd", pine: "#d2e2e8", birch: "#e2ecf2" };
const SNOW_BG: Record<string, string> = {
  meadow: "#141d2a", bog: "#101a24", rock: "#171f2c", fell: "#1d2634",
  spruce: "#0f1823", pine: "#0f1823", birch: "#0f1823",
};

const MARK: Record<string, { fg: string; bg: string }> = {
  "mk-player": { fg: "#fff", bg: "#b8860b" },
  "mk-fire": { fg: "#fff", bg: "#b8431a" },
  "mk-coals": { fg: "#fff", bg: "#7a3d1a" },
  "mk-shelter": { fg: "#fff", bg: "#4a5a78" },
  "mk-camp": { fg: "#0c0f14", bg: "#6fcf6f" },
  "mk-trap": { fg: "#fff", bg: "#4a5a78" },
  "mk-seep": { fg: "#0c0f14", bg: "#6fa8dc" },
  "mk-animal": { fg: "#111", bg: "#b7ad87" },
};
/** A recognised animal's own colour, by its recognition index. */
export const WILDLIFE_BG = ["#e5a84b", "#76c7b7", "#cb8fc4", "#91bd62", "#d77b68", "#87a8dc"];

/** Where the night fire's flicker and the coals' breath start from, and where they go (map.ts, PULSE). */
export const NIGHT_FIRE_BG = "#b8431a";
export const NIGHT_COALS_BG = "#5c2c14";
export const NIGHT_LIT0_BG = "#ff7a1a";
export const NIGHT_LIT0_COALS_BG = "#6b3218";

export const FOG_FG = "#141a26";
export const FOG_BG = "#0a0e17";
const FAR_BG = "#0c111b";

export function parseColor(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  const h = c.match(/^#([0-9a-f]{3})$/i);
  if (h) {
    const [r, g, b] = h[1].split("").map((d) => Number.parseInt(d + d, 16));
    return [r, g, b, 1];
  }
  const h6 = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (h6) {
    const n = Number.parseInt(h6[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h6[2] ? Number.parseInt(h6[2], 16) / 255 : 1];
  }
  return null;
}

/** A colour through `brightness()` and `saturate()`, the way the compositor applied them to a character. */
export function filtered(color: string, brightness: number, saturate: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  let [r, g, b] = rgb;
  const a = rgb[3];
  if (brightness !== 1) {
    r = Math.min(255, r * brightness); g = Math.min(255, g * brightness); b = Math.min(255, b * brightness);
  }
  if (saturate !== 1) {
    // The CSS saturate matrix.
    const s = saturate;
    const nr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
    const ng = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
    const nb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
    r = Math.max(0, Math.min(255, nr)); g = Math.max(0, Math.min(255, ng)); b = Math.max(0, Math.min(255, nb));
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * The look of one glyph. `tokens` are the model's classes for it, `c`
 * first; the grid's own season and night ride in `grid`. Pure, and keyed
 * by the caller: a board of 2,592 glyphs has a few hundred distinct looks.
 */
export function glyphStyle(grid: GridLook, tokens: readonly string[]): GlyphStyle {
  const has = (t: string): boolean => tokens.includes(t);
  const mark = has("mk");
  const fog = has("fog") || has("void");
  const terrain = tokens.find((t) => t.startsWith("t-"))?.slice(2) ?? null;
  const snow = has("ground-snow");
  const tone = has("tone-0") ? 0 : has("tone-2") ? 2 : 1;

  let fg = DIM;
  let bg: string | null = null;
  if (fog) {
    fg = FOG_FG;
    bg = FOG_BG;
  }
  if (has("far")) bg = FAR_BG;
  // Terrain: colour and cell. A far glyph's cell is its terrain's, the
  // terrain rule coming after the far rule at the same weight.
  if (terrain && TERRAIN[terrain]) {
    fg = TERRAIN[terrain].fg;
    bg = TERRAIN[terrain].bg;
  }
  if (!mark && terrain) {
    if (snow) {
      const deep = has("ground-snow-deep");
      const snowFg = (deep && DEEP_SNOW_FG[terrain]) || SNOW_FG[terrain];
      if (snowFg) fg = snowFg;
      if (terrain !== "water") bg = SNOW_BG[terrain] ?? "#121a26";
    } else {
      // Bare ground: tone, then depth, then the season on top of both.
      const toned = tone !== 1 ? TONE[terrain]?.[tone === 0 ? 0 : 1] : undefined;
      if (toned) {
        fg = toned.fg;
        if (toned.bg) bg = toned.bg;
      }
      if (terrain === "water" && !has("ice-thin") && !has("ice-safe")) {
        if (has("deep-0")) { fg = "#5b9ae8"; bg = "#102047"; }
        if (has("deep-2")) { fg = "#2b53a4"; bg = "#060d20"; }
      }
      if (grid.season === "autumn") {
        if (terrain === "birch") fg = tone === 0 ? "#e07a2a" : tone === 2 ? "#ffdc72" : "#f0b93f";
        if (has("turned")) {
          if (terrain === "meadow") {
            fg = tone === 0 ? "#c06a2e" : tone === 2 ? "#e8c15c" : "#d09a42";
            bg = tone === 0 ? "#1a1409" : tone === 2 ? "#292110" : "#1f1a0c";
          }
          if (terrain === "bog") {
            fg = tone === 0 ? "#ad5530" : tone === 2 ? "#dd9455" : "#c4713c";
            bg = "#1e150e";
          }
        }
      }
      if (grid.season === "winter") {
        if (terrain === "birch") fg = tone === 0 ? "#6d5943" : tone === 2 ? "#a89078" : "#8a7256";
        if (terrain === "meadow") fg = tone === 0 ? "#63614e" : tone === 2 ? "#9a9880" : "#7c7a63";
        if (terrain === "bog") fg = "#6f7b78";
      }
    }
    if (terrain === "water") {
      if (has("ice-thin")) bg = "#142533";
      if (has("ice-safe")) bg = "#243746";
    }
  }
  // A mark owns its whole cell.
  let glow: string | null = null;
  if (mark) {
    for (const t of tokens) {
      const m = MARK[t];
      if (m) {
        fg = m.fg;
        bg = m.bg;
      }
    }
    if (has("mk-animal")) {
      const colour = tokens.find((t) => /^wildlife-\d$/.test(t));
      if (colour) bg = WILDLIFE_BG[Number(colour.slice(9))] ?? bg;
    }
    if (has("mk-player") && has("mood-sleep")) bg = "#7d5c08";
    if (grid.night) {
      if (has("mk-fire")) {
        bg = NIGHT_FIRE_BG;
        if (has("fire-far")) {
          bg = "#632d18";
          fg = "#ffe0aa";
          glow = "#d7772f";
        }
      }
      if (has("mk-coals")) bg = has("lit-0") ? NIGHT_LIT0_COALS_BG : NIGHT_COALS_BG;
    }
  }
  // The fire's own cell at night: the fire colour is the cell, whatever stood there.
  if (grid.night && has("lit-0") && !has("mk-coals")) bg = NIGHT_LIT0_BG;
  if (has("target")) glow = ACCENT;

  // What the memory of a place, or a distant look at it, does to the letter.
  let alpha = 1;
  if (has("dim")) alpha = 0.45;
  if (has("memory")) fg = filtered(fg, 0.58, 0.45);
  if (has("far") && !mark) {
    alpha = 0.3;
    fg = filtered(fg, 0.85, 0.3);
  }
  // Known in part: the ground's own letter, paled, on the dark of the
  // unknown round it; edges through it the way fog carries them.
  if (has("part") && !mark) {
    alpha = 0.6;
    fg = filtered(fg, 0.9, 0.55);
    bg = FOG_BG;
  }
  // The height, in the snow's own range, on the letter alone.
  if (!mark && snow && tone !== 1) fg = filtered(fg, tone === 0 ? 0.82 : 1.18, 1);

  // Edges: which side this glyph owns of a region line, in whose colour.
  const edge = fog || has("part")
    ? has("edge-cur") ? "rgba(230, 194, 41, 0.38)" : has("edge-known") ? "rgba(59, 111, 209, 0.38)" : "#39404e"
    : has("cur") ? ACCENT : BORDER;
  const border = {
    l: has("bl") ? edge : null,
    r: has("br") ? edge : null,
    t: has("bt") ? edge : null,
    b: has("bb") ? edge : null,
  };

  return {
    bg, fg, alpha,
    bold: mark,
    hidden: !mark && has("wx-glyph"),
    underline: has("pl") ? ACCENT : null,
    wash: has("sel") ? "rgba(230, 194, 41, 0.18)" : has("cur") ? "rgba(255, 255, 255, 0.07)" : null,
    glow,
    border,
    // A mark standing in fog is the mark, not a dot.
    dot: fog && !mark ? FOG_FG : null,
  };
}
