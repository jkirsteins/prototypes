/**
 * A disk cache of solved worlds for tests and scripts, keyed by seed,
 * size and generator version, under node_modules/.cache so it is never
 * committed. A seed is solved once per machine, then read in tens of
 * milliseconds. Browser code must never import this file.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATOR_VERSION, type SolvedWorld, solveWorld } from "./solve";
import { setSolveCache } from "./solvecache";
import { type RegionDef, setRegionCache } from "./gen";

const HEADER_BYTES = 16;
/** The layout of a regions file; bump when a field is added or its bytes change. */
const REGION_FORMAT = 1;

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

/**
 * Files from an earlier generator, swept at install. A version bump makes every
 * cached world unreadable and nothing else ever deletes them, so the directory
 * would grow by a full set of solved worlds - hundreds of megabytes - per bump.
 */
function sweepOldVersions(dir: string): void {
  if (!existsSync(dir)) return;
  const suffix = `-v${GENERATOR_VERSION}.bin`;
  for (const name of readdirSync(dir)) {
    // A claim or a half-written world belongs to a process that is still
    // going: sweeping those would pull the floor out from under a sibling
    // worker mid-solve. They clean up after themselves, and a claim left by
    // a process that died is taken over on age.
    if (name.endsWith(".solving") || name.endsWith(".part")) continue;
    // The regions file carries the generator version in its own name.
    if (name.startsWith("regions-") && name.endsWith(`-v${GENERATOR_VERSION}-r${REGION_FORMAT}`)) continue;
    if (!name.endsWith(suffix)) rmSync(join(dir, name), { force: true, recursive: true });
  }
}

/** How often a waiting worker looks for the world somebody else is solving. */
const POLL_MS = 100;
/** How long it waits before giving up and solving the world itself. */
const WAIT_MS = 5 * 60_000;
/**
 * A claim older than this was left by a process that died, and is taken over.
 * Shorter than the wait above, so a waiter takes an abandoned claim rather
 * than sitting out its whole clock first; longer than any solve, which the
 * slow suite's budget test holds under twenty seconds.
 */
const ABANDONED_MS = 2 * 60_000;

/** A synchronous sleep: the solve cache is synchronous, so a waiter cannot yield to an event loop. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Claims the right to solve one world, or says somebody else holds it. */
function claim(lock: string): boolean {
  try {
    closeSync(openSync(lock, "wx"));
    return true;
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs < ABANDONED_MS) return false;
    } catch {
      // Gone between the two calls: whoever held it has finished.
    }
    rmSync(lock, { force: true });
    try {
      closeSync(openSync(lock, "wx"));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Built regions, one file per region under a directory per seed, read on
 * the first ask and written as each is built. The cells array is the bulk
 * of a region and goes down as bytes; the rest is small and goes as JSON.
 * A file is written under a part name and moved onto the real one, so a
 * reader in another worker sees a whole region or none, and a region built
 * by two workers at once is simply written twice. One file per region
 * rather than one per seed because a store must not cost more than the
 * build it saves: rewriting a seed's whole file for each of the hundred
 * regions a test walks past made a cold run slower than no cache at all.
 *
 * `spots` are never stored - they are the routes, placed on first read,
 * and a region a test walked past never placed them.
 */
function regionsDir(dir: string, seed: number): string {
  return join(dir, `regions-${seed}-v${GENERATOR_VERSION}-r${REGION_FORMAT}`);
}

function encodeRegion(r: RegionDef): Buffer {
  const { cells, spots: _lazy, ...rest } = r;
  const meta = Buffer.from(JSON.stringify(rest), "utf8");
  const body = Buffer.from(new Int32Array(cells).buffer);
  const head = Buffer.alloc(8);
  head.writeInt32LE(meta.length, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, meta, body]);
}

function decodeRegion(buf: Buffer): RegionDef | null {
  if (buf.length < 8) return null;
  const metaLen = buf.readInt32LE(0);
  const bodyLen = buf.readInt32LE(4);
  if (buf.length !== 8 + metaLen + bodyLen) return null;
  const meta = JSON.parse(buf.subarray(8, 8 + metaLen).toString("utf8"));
  const cells = Array.from(new Int32Array(buf.buffer.slice(buf.byteOffset + 8 + metaLen, buf.byteOffset + 8 + metaLen + bodyLen)));
  const r = { ...meta, cells } as RegionDef;
  // No spots: the caller installs the lazy property that places them.
  delete (r as Partial<RegionDef>).spots;
  return r;
}

function installRegionCache(dir: string): void {
  setRegionCache({
    load(seed, id) {
      const file = join(regionsDir(dir, seed), `${id}.bin`);
      if (!existsSync(file)) return null;
      return decodeRegion(readFileSync(file));
    },
    store(seed, region) {
      const at = regionsDir(dir, seed);
      mkdirSync(at, { recursive: true });
      const file = join(at, `${region.id}.bin`);
      const part = `${file}.${process.pid}.part`;
      writeFileSync(part, encodeRegion(region));
      renameSync(part, file);
    },
  });
}

export function installNodeWorldCache(dir = join(process.cwd(), "node_modules", ".cache", "survidle-worlds")): void {
  sweepOldVersions(dir);
  installRegionCache(dir);
  setSolveCache((seed, w, h) => {
    const file = join(dir, `${seed}-${w}x${h}-v${GENERATOR_VERSION}.bin`);
    if (existsSync(file)) return decode(readFileSync(file));
    mkdirSync(dir, { recursive: true });
    // A cold cache and eight test workers means eight processes wanting the
    // same world at the same second, and a world costs seconds to solve. One
    // of them claims it and the rest wait for the file to appear, which is
    // the difference between a fresh checkout paying for a world once and
    // paying for it once per worker. A waiter watches for two things: the
    // world arriving, and the claim coming free - because the holder let it
    // go without a world, or died and left it to age out. A waiter still
    // waiting after five minutes solves it itself rather than hang.
    const lock = `${file}.solving`;
    let mine = claim(lock);
    if (!mine) {
      const until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        sleep(POLL_MS);
        if (existsSync(file)) return decode(readFileSync(file));
        if (claim(lock)) {
          mine = true;
          break;
        }
      }
      if (existsSync(file)) return decode(readFileSync(file));
    }
    try {
      const solved = solveWorld(seed, w, h);
      // Written beside the real name and moved onto it, so a reader in
      // another process sees either no file or the whole of one. Reading a
      // world that is still being written gives no error, just wrong ground.
      const part = `${file}.${process.pid}.part`;
      writeFileSync(part, encode(solved));
      renameSync(part, file);
      return solved;
    } finally {
      if (mine) rmSync(lock, { force: true });
    }
  });
}
