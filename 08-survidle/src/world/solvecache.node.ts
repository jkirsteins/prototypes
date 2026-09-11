/**
 * A disk cache of solved worlds for tests and scripts, keyed by seed,
 * size and generator version, under node_modules/.cache so it is never
 * committed. A seed is solved once per machine, then read in tens of
 * milliseconds. Browser code must never import this file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATOR_VERSION, type SolvedWorld, solveWorld } from "./solve";
import { setSolveCache } from "./solvecache";

const HEADER_BYTES = 16;

function encode(s: SolvedWorld): Buffer {
  const parts = [s.height, s.flowDir, s.discharge, s.kind, s.flags, s.terrain, s.moisture].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeInt32LE(s.w, 0);
  header.writeInt32LE(s.h, 4);
  header.writeInt32LE(GENERATOR_VERSION, 8);
  return Buffer.concat([header, ...parts]);
}

function decode(buf: Buffer): SolvedWorld {
  const w = buf.readInt32LE(0);
  const h = buf.readInt32LE(4);
  const n = w * h;
  let at = HEADER_BYTES;
  const take = <T extends Int16Array | Uint8Array | Float32Array>(make: (n: number) => T, bytesPer: number): T => {
    const out = make(n);
    new Uint8Array(out.buffer).set(buf.subarray(at, at + n * bytesPer));
    at += n * bytesPer;
    return out;
  };
  return {
    w, h,
    height: take((n) => new Int16Array(n), 2),
    flowDir: take((n) => new Uint8Array(n), 1),
    discharge: take((n) => new Float32Array(n), 4),
    kind: take((n) => new Uint8Array(n), 1),
    flags: take((n) => new Uint8Array(n), 1),
    terrain: take((n) => new Uint8Array(n), 1),
    moisture: take((n) => new Uint8Array(n), 1),
  };
}

export function installNodeWorldCache(dir = join(process.cwd(), "node_modules", ".cache", "survidle-worlds")): void {
  setSolveCache((seed, w, h) => {
    const file = join(dir, `${seed}-${w}x${h}-v${GENERATOR_VERSION}.bin`);
    if (existsSync(file)) return decode(readFileSync(file));
    const solved = solveWorld(seed, w, h);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, encode(solved));
    return solved;
  });
}
