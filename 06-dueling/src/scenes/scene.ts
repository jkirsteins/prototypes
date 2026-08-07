import type { ActionId, Labels } from "../input/scheme";
import type { TimeControl } from "../render/draw";

export type SceneId = "duel" | "move" | "arena";

/** Held levels main.ts merges across keyboard and pad. Scenes read the
 *  subset they care about; unknown levels are simply false. */
export interface HeldLevels {
  advance: boolean; retreat: boolean; guard: boolean;
  up: boolean; down: boolean; walk: boolean;
}
export type HeldAction = keyof HeldLevels;

export interface Scene {
  id: SceneId;
  /** lowercased e.key -> held action. main owns the level store and
   *  routes keydown/keyup through this map. */
  holdKeys: Partial<Record<string, HeldAction>>;
  /** An effective (source-merged) held-level transition. */
  heldEdge(action: HeldAction, value: boolean): void;
  /** A non-hold keydown; true when consumed. */
  press(e: KeyboardEvent): boolean;
  /** keyup quirks (the duel's Caps Lock OFF edge). */
  keyRelease(e: KeyboardEvent): void;
  /** A resolved pad edge action. */
  padAction(a: ActionId): void;
  /** One fixed 60 Hz tick. held: current effective levels. moveMag: the
   *  pad stick magnitude (0 when keyboard-driven). */
  tickOnce(held: HeldLevels, moveMag: number): void;
  /** Wall-clock presentation advance; returns the extra timescale the
   *  scene imposes (the duel's bullet time; 1 otherwise). */
  frameScale(wallDt: number): number;
  /** Flush this frame's simulation events to audio. Once per rAF. */
  audioFrame(): void;
  draw(overlay: boolean, labels: Labels, time: TimeControl): void;
  snapshot(): { live: boolean; decided: boolean; armed?: boolean };
  /** R: restart the scene's current run. */
  reset(): void;
}
