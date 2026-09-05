/**
 * mulberry32. The whole generator is one 32-bit integer, so the game state
 * can carry it as a plain number and a save round-trips the random stream.
 */
export class Rng {
  constructor(public s: number) {
    this.s = s >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Roughly normal, mean 0, standard deviation 1 (sum of three uniforms). */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
}

/** Splits a seed into an independent stream for a named purpose. */
export function derive(seed: number, salt: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
}
