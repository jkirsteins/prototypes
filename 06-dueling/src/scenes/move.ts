import { createMover, tickMove } from "../movement/engine";
import { createLevel } from "../movement/level";
import { drawMoveFrame } from "../render/movedraw";
import type { AudioEngine } from "../audio/audio";
import type { Labels } from "../input/scheme";
import type { ActionId } from "../input/scheme";
import type { MoveEvent, MoveInput, Mover } from "../movement/engine";
import type { SheetName } from "../render/sheets";
import type { TimeControl } from "../render/draw";
import type { HeldLevels, Scene } from "./scene";

/** Pad stick magnitude below this walks; at or above runs. The keyboard's
 *  walk is the {walkMod} hold. */
export const RUN_MAG = 0.85;

export interface MoveSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  audio: AudioEngine;
}

export function createMoveScene(deps: MoveSceneDeps): Scene {
  const level = createLevel();
  let mover: Mover = createMover(level);
  let pendingJump = false;
  let pendingDash = false;
  let frameEvents: MoveEvent[] = [];

  return {
    id: "move",
    holdKeys: { a: "retreat", d: "advance", w: "up", s: "down", l: "guard", shift: "walk" },
    heldEdge() { /* levels are read each tick; no edge consequences */ },
    press(e: KeyboardEvent): boolean {
      switch (e.key.toLowerCase()) {
        case "k": pendingJump = true; return true;
        case "j": pendingDash = true; return true;
        default: return false;
      }
    },
    keyRelease() {},
    padAction(a: ActionId) {
      if (a === "jump") pendingJump = true;
      else if (a === "dash") pendingDash = true;
      else if (a === "resetScene") mover = createMover(level);
    },
    tickOnce(held: HeldLevels, moveMag: number) {
      const padWalks = moveMag > 0 && moveMag < RUN_MAG;
      const input: MoveInput = {
        held: {
          left: held.retreat, right: held.advance,
          up: held.up, down: held.down,
          grab: held.guard, walk: held.walk || padWalks,
        },
        pressed: { jump: pendingJump, dash: pendingDash },
      };
      pendingJump = false;
      pendingDash = false;
      frameEvents.push(...tickMove(mover, level, input));
    },
    frameScale() { return 1; },
    audioFrame() {
      deps.audio.moveFrame(frameEvents);
      frameEvents = [];
    },
    draw(overlay: boolean, labels: Labels, time: TimeControl) {
      drawMoveFrame({ ctx: deps.ctx, images: deps.images, tiles: deps.tiles, labels }, mover, level, overlay, time);
    },
    snapshot() { return { live: true, decided: false }; },
    reset() { mover = createMover(level); },
  };
}
