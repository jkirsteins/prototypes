export type SheetName =
  | "swordIdle" | "swordRun" | "swordAttack" | "swordStab"
  | "roll" | "hurt" | "death" | "idle"
  // movement-test sheets (the pack's unarmed base character)
  | "walk" | "run" | "dash" | "slide" | "jump" | "land" | "airSpin"
  | "wallSlide" | "wallLand" | "climbBack" | "ledgeClimb"
  | "crouchIdle" | "crouchWalk" | "push" | "pull" | "pushIdle";

export interface SheetMeta {
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** y of the feet inside a frame, sheet pixels. Anchors the character to the floor. */
  feetY: number;
  /** Per-frame feet rows for sheets whose poses end on different rows -
   *  without this, short-content frames float above the surface. Falls
   *  back to feetY when absent or unset for a frame. */
  feetYPerFrame?: number[];
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
  // The UNARMED idle (the pack's base character, no sword): the disarmed
  // loser's stand. 480x48 measured = 10 frames; feetY/originX follow the
  // pack's uniform 48px-sheet ground line and centering, which every
  // measured sibling above landed on (40 / 24).
  idle:        { file: "idle.png",         frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },

  // Movement-test sheets. feetY is the measured per-frame alpha ground
  // row + 1 where the sheet touches ground uniformly; airborne sheets
  // (jump, airSpin, wallSlide) anchor on their ground-contact frames or
  // the pack's uniform line. originX 24 = frame center; the bodies are
  // centered within +-2px on every measured sheet.
  walk:       { file: "walk.png",        frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  run:        { file: "run.png",         frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  dash:       { file: "dash.png",        frameW: 48, frameH: 48, frames: 9,  feetY: 40, originX: 24 },
  slide:      { file: "slide.png",       frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  // jump: only frames 2-4 are ever drawn (0-1 crouch prep and 5 touch are
  // dead code per moveframes.ts), and all three measure max-y 38 - the
  // Chrome pass caught the character floating ~8cm above the ground line
  // because feetY had been measured off the two unused frames (max-y 43)
  // instead of the ones actually rendered.
  jump:       { file: "jump.png",        frameW: 48, frameH: 48, frames: 6,  feetY: 39, originX: 24 },
  land:       { file: "land.png",        frameW: 48, frameH: 48, frames: 9,  feetY: 40, originX: 24 },
  airSpin:    { file: "air-spin.png",    frameW: 48, frameH: 48, frames: 6,  feetY: 40, originX: 24 },
  wallSlide:  { file: "wall-slide.png",  frameW: 48, frameH: 48, frames: 3,  feetY: 44, originX: 24 },
  wallLand:   { file: "wall-land.png",   frameW: 48, frameH: 48, frames: 6,  feetY: 42, originX: 24 },
  climbBack:  { file: "climb-back.png",  frameW: 48, frameH: 48, frames: 4,  feetY: 42, originX: 24 },
  // Measured per-frame content bottoms + 1: the pull-up poses end on
  // rows 41,41,39,41,37, so a single anchor floats frames 2 and 4.
  ledgeClimb: { file: "ledge-climb.png", frameW: 48, frameH: 48, frames: 5,  feetY: 42, feetYPerFrame: [42, 42, 40, 42, 38], originX: 24 },
  crouchIdle: { file: "crouch-idle.png", frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
  crouchWalk: { file: "crouch-walk.png", frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
  push:       { file: "push.png",        frameW: 48, frameH: 48, frames: 10, feetY: 38, originX: 24 },
  pull:       { file: "pull.png",        frameW: 48, frameH: 48, frames: 6,  feetY: 40, originX: 24 },
  pushIdle:   { file: "push-idle.png",   frameW: 48, frameH: 48, frames: 8,  feetY: 38, originX: 24 },
};
