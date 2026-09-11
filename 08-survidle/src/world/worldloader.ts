/**
 * A world for the browser: solved in a worker while the bar shows the
 * stage, then built on the main thread from the transferred arrays. Where
 * there is no Worker (tests, scripts) the synchronous cache serves.
 */
import { generateWorld, type World } from "./gen";
import { type SolveProgress, STAGES } from "./solve";
import type { SolveMessage } from "./solve.worker";
import { WORLD_H, WORLD_W } from "./terrain";

export function loadWorld(seed: number, onProgress: SolveProgress = () => {}): Promise<World> {
  // Vitest's DOM shim may define Worker; the tests want the synchronous cache either way.
  if (typeof Worker === "undefined" || import.meta.env.MODE === "test") {
    onProgress("reading the ground", 0);
    return Promise.resolve(generateWorld(seed));
  }
  return new Promise((resolve, reject) => {
    // A slow world beats no world: a worker that will not start or that dies
    // mid-solve falls back to the main thread, which blocks for seconds but
    // leaves a run to play. Only a failure of that fallback rejects.
    const onTheMainThread = () => {
      onProgress("solving on the main thread", 0);
      try {
        resolve(generateWorld(seed));
      } catch (e) {
        reject(e);
      }
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL("./solve.worker.ts", import.meta.url), { type: "module" });
    } catch {
      onTheMainThread();
      return;
    }
    worker.onmessage = (ev: MessageEvent<SolveMessage>) => {
      const m = ev.data;
      if (m.kind === "progress") onProgress(m.stage, m.fraction);
      else {
        worker.terminate();
        resolve(generateWorld(seed, m.solved));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      onTheMainThread();
    };
    // The bar is up before the worker's first word, so nothing is clickable
    // underneath while the solve starts.
    onProgress(STAGES[0], 0);
    worker.postMessage({ seed, w: WORLD_W, h: WORLD_H });
  });
}
