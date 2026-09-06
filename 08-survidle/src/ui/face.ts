/**
 * The face: an 8x8 portrait drawn from the person, a four-column left half
 * mirrored, a handful of colours from a northern palette. The templates are
 * picked by the face seed (hair, beard, colours) and by the grades (eyes wide
 * and bright or narrow, the jaw wide for a heavy build), so the ancestor
 * keeps their face in the cemetery and a candidate's card says who they are
 * before a word is read. Rendered as inline SVG rects, so the string panels
 * stay strings.
 */
import { Rng } from "../rng";
import type { Person } from "../sim/types";

/** The portrait's side in cells; 12 is the fallback if 8 does not read as a person. */
export const FACE_SIZE: 8 | 12 = 8;

/** Cell keys: background, skin, hair, eye, eye white, line, beard, wool collar. */
type Key = "." | "S" | "H" | "E" | "W" | "L" | "B" | "C";

const SKIN = ["#e8c39e", "#d4a373", "#b07d4f"];
const HAIR = ["#2b1d14", "#6b4423", "#d9b86a", "#a4402a"];
const EYE = ["#2f4f6f", "#4b6b3a", "#3b2a1a"];
const BACK = ["#3b4652", "#2f4a3d", "#232b4a"];
const WOOL = ["#5a5f66", "#6e5a48"];
const LINE = "#1a1410";
const WHITE = "#f2efe6";

export const HAIR_WOMEN = ["long", "braided", "short", "cropped"] as const;
export const HAIR_MEN = ["short", "cropped", "bald", "long"] as const;
export const BEARDS = ["none", "short", "full"] as const;
export type Hair = (typeof HAIR_WOMEN)[number] | (typeof HAIR_MEN)[number];
export type Beard = (typeof BEARDS)[number];

export interface FacePicks {
  hair: Hair;
  beard: Beard;
  eyes: "wide" | "plain" | "narrow";
  jaw: "wide" | "narrow";
  skin: number;
  hairColour: number;
  eye: number;
  back: number;
  wool: number;
}

/** What the seed and the grades pick for a person. */
export function facePicks(p: Person): FacePicks {
  const rng = new Rng(p.face);
  const hair = p.sex === "f" ? HAIR_WOMEN[rng.int(HAIR_WOMEN.length)] : HAIR_MEN[rng.int(HAIR_MEN.length)];
  const beard = p.sex === "m" ? BEARDS[rng.int(BEARDS.length)] : "none";
  return {
    hair,
    beard,
    eyes: p.axes.eyes >= 1 ? "wide" : p.axes.eyes <= -1 ? "narrow" : "plain",
    jaw: p.axes.build >= 1 ? "wide" : "narrow",
    skin: rng.int(SKIN.length),
    hairColour: rng.int(HAIR.length),
    eye: rng.int(EYE.length),
    back: rng.int(BACK.length),
    wool: rng.int(WOOL.length),
  };
}

/** The left half, four cells a row, rows top to bottom; later layers paint over earlier ones. */
function half(picks: FacePicks): Key[][] {
  const rows: Key[][] = [
    [".", ".", ".", "."],
    [".", ".", "S", "S"],
    [".", "S", "L", "S"],
    [".", "S", "E", "S"],
    [".", "S", "S", "S"],
    [".", "S", "S", "L"],
    [".", ".", "S", "S"],
    [".", "C", "C", "C"],
  ];
  if (picks.jaw === "wide") {
    rows[4] = ["S", "S", "S", "S"];
    rows[5] = ["S", "S", "S", "L"];
    rows[6] = [".", "S", "S", "S"];
  }
  switch (picks.hair) {
    case "short":
      rows[0] = [".", ".", "H", "H"];
      rows[1] = [".", "H", "H", "H"];
      break;
    case "cropped":
      rows[1] = [".", ".", "H", "H"];
      break;
    case "long":
    case "braided":
      rows[0] = [".", ".", "H", "H"];
      rows[1] = [".", "H", "H", "H"];
      for (const r of [2, 3, 4, 5]) rows[r][0] = "H";
      if (picks.hair === "braided") {
        rows[6][0] = "H";
        rows[7][0] = "H";
      }
      break;
    case "bald":
      break;
  }
  if (picks.eyes === "wide") {
    rows[3][1] = "W";
    rows[3][2] = "E";
  } else if (picks.eyes === "narrow") {
    rows[3][2] = "L";
  }
  if (picks.beard === "short") {
    rows[6][2] = "B";
    rows[6][3] = "B";
  } else if (picks.beard === "full") {
    rows[5][1] = "B";
    rows[5][2] = "B";
    rows[5][3] = "B";
    rows[6][1] = "B";
    rows[6][2] = "B";
    rows[6][3] = "B";
  }
  return rows;
}

/** The whole portrait, size rows of size keys; 12 is the 8 grid at one and a half, the same shapes. */
export function facePixels(p: Person, size: 8 | 12 = FACE_SIZE): Key[][] {
  const left = half(facePicks(p));
  const eight = left.map((row) => [...row, ...[...row].reverse()]);
  if (size === 8) return eight;
  const out: Key[][] = [];
  for (let y = 0; y < 12; y++) {
    const row: Key[] = [];
    for (let x = 0; x < 12; x++) row.push(eight[Math.min(7, Math.floor((y * 8) / 12))][Math.min(7, Math.floor((x * 8) / 12))]);
    out.push(row);
  }
  return out;
}

function colour(k: Key, picks: FacePicks): string | null {
  switch (k) {
    case ".": return null;
    case "S": return SKIN[picks.skin];
    case "H": return HAIR[picks.hairColour];
    case "E": return EYE[picks.eye];
    case "W": return WHITE;
    case "L": return LINE;
    case "B": return HAIR[picks.hairColour];
    case "C": return WOOL[picks.wool];
  }
}

/** The portrait as an inline SVG, `px` wide and high, crisp at any scale. */
export function faceSvg(p: Person, px: number, size: 8 | 12 = FACE_SIZE): string {
  const picks = facePicks(p);
  const rows = facePixels(p, size);
  const rects: string[] = [`<rect x="0" y="0" width="${size}" height="${size}" fill="${BACK[picks.back]}"/>`];
  rows.forEach((row, y) => {
    row.forEach((k, x) => {
      const c = colour(k, picks);
      if (c) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
    });
  });
  return `<svg class="face" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`;
}
