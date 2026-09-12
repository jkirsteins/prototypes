/** The solve off the main thread: progress by stage, then the arrays transferred, not copied. */
import { type SolvedWorld, solvedBuffers, solveWorld } from "./solve";

export type SolveMessage = { kind: "progress"; stage: string; fraction: number } | { kind: "done"; solved: SolvedWorld };
const ctx = self as unknown as { postMessage(m: SolveMessage, transfer?: ArrayBuffer[]): void; onmessage: ((ev: MessageEvent<{ seed: number; w: number; h: number }>) => void) | null };

ctx.onmessage = (ev) => {
  const { seed, w, h } = ev.data;
  const solved = solveWorld(seed, w, h, (stage, fraction) => ctx.postMessage({ kind: "progress", stage, fraction }));
  ctx.postMessage({ kind: "done", solved }, solvedBuffers(solved));
};
