/** The solve off the main thread: progress by stage, then the arrays transferred, not copied. */
import { type SolvedWorld, solvedBuffers, solveWorld } from "./solve";
import { WORLD_CELL_H, WORLD_CELL_W } from "./terrain";

export type SolveMessage = { kind: "progress"; stage: string; fraction: number } | { kind: "done"; solved: SolvedWorld };
const ctx = self as unknown as { postMessage(m: SolveMessage, transfer?: ArrayBuffer[]): void; onmessage: ((ev: MessageEvent<{ seed: number }>) => void) | null };

// The size is the world's own, not the caller's: WORLD_W and WORLD_H are the
// fine lattice, and a solve asked for those would grind through thirty-six
// times the cells and answer with a world no run can stand on.
ctx.onmessage = (ev) => {
  const solved = solveWorld(ev.data.seed, WORLD_CELL_W, WORLD_CELL_H, (stage, fraction) => ctx.postMessage({ kind: "progress", stage, fraction }));
  ctx.postMessage({ kind: "done", solved }, solvedBuffers(solved));
};
