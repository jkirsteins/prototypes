/**
 * One-shot sounds the sim announces. The sim knows nothing about audio; it
 * names the moment and whoever installed a sink hears it. With no sink,
 * a cue is nothing, so tests and offline catch-up run silent for free.
 */
export type Cue =
  | "treeFalls" | "arrow" | "spear" | "fireCatches" | "torchLit"
  | "iceCracks" | "fallThrough" | "toolBreaks" | "wolves";

let sink: ((c: Cue) => void) | null = null;

export function setCueSink(fn: ((c: Cue) => void) | null): void {
  sink = fn;
}

export function cue(c: Cue): void {
  sink?.(c);
}
