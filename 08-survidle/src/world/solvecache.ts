/**
 * Where a solved world comes from when code asks for one synchronously:
 * the in-process map first, then an installed cache (the node disk cache
 * in tests and scripts), then the solve itself. The browser's main
 * thread never calls this: it loads through the worker (worldloader.ts).
 */
import { type SolvedWorld, solveWorld } from "./solve";

export type SolveCache = (seed: number, w: number, h: number) => SolvedWorld;

let hook: SolveCache | null = null;
const inProcess = new Map<string, SolvedWorld>();

export function setSolveCache(fn: SolveCache | null): void {
  hook = fn;
}

export function solvedFor(seed: number, w: number, h: number): SolvedWorld {
  const key = `${seed}:${w}x${h}`;
  let s = inProcess.get(key);
  if (!s) {
    s = hook ? hook(seed, w, h) : solveWorld(seed, w, h);
    inProcess.set(key, s);
  }
  return s;
}

/** A solved world handed in from elsewhere (the worker, a message) is remembered so `generateWorld(seed)` finds it. */
export function rememberSolved(s: SolvedWorld, seed: number): void {
  inProcess.set(`${seed}:${s.w}x${s.h}`, s);
}

/** Browser sessions play one seed at a time; old arrays must not stay rooted by this cache after a reset. */
export function retainSolved(seed: number): void {
  for (const key of inProcess.keys()) if (!key.startsWith(`${seed}:`)) inProcess.delete(key);
}

/** Whether `s` is the solved world this process holds for `seed` - the real one, not a fixture that borrowed the seed. */
export function isRememberedSolved(seed: number, s: SolvedWorld): boolean {
  return inProcess.get(`${seed}:${s.w}x${s.h}`) === s;
}
