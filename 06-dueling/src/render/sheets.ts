export type SheetName =
  | "swordIdle" | "swordRun" | "swordAttack" | "swordStab"
  | "roll" | "hurt" | "death";

export interface SheetMeta {
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** y of the feet inside a frame, sheet pixels. Anchors the character to the floor. */
  feetY: number;
  /** x of the body center inside a frame when facing right. */
  originX: number;
}

/**
 * Frame sizes were measured from the real PNGs, not the filenames
 * (the Death sheet is named 64x64 but contains 48x48 frames).
 * feetY/originX are measured from per-frame alpha bounds of the real
 * sheets during Chrome animation verification: every 48px-tall sheet's
 * content ground line sits at row 39 (feetY 40), the 64x64 swordAttack
 * sheet's ground row is 47 on all 6 frames (feetY 48), and swordStab's
 * body (frames 0-3) occupies x 34..54, centered at originX 44.
 */
export const SHEETS: Record<SheetName, SheetMeta> = {
  swordIdle:   { file: "sword-idle.png",   frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
  swordRun:    { file: "sword-run.png",    frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  swordAttack: { file: "sword-attack.png", frameW: 64, frameH: 64, frames: 6,  feetY: 48, originX: 28 },
  swordStab:   { file: "sword-stab.png",   frameW: 96, frameH: 48, frames: 7,  feetY: 40, originX: 44 },
  roll:        { file: "roll.png",         frameW: 48, frameH: 48, frames: 7,  feetY: 40, originX: 24 },
  hurt:        { file: "hurt.png",         frameW: 48, frameH: 48, frames: 4,  feetY: 40, originX: 24 },
  death:       { file: "death.png",        frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
};
