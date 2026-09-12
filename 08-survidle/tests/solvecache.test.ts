/**
 * The disk cache of solved worlds. A world costs seconds, and a cold cache
 * meets eight test workers at once, so the rules that matter are the ones
 * about two processes wanting the same world at the same moment: one solves
 * it, the file appears whole or not at all, and a claim left by a process
 * that died does not stop the next one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installNodeWorldCache } from "../src/world/solvecache.node";
import { solvedFor } from "../src/world/solvecache";
import { GENERATOR_VERSION, solveWorld } from "../src/world/solve";

/** Small enough to solve in milliseconds, large enough to be a real solve. */
const W = 60;
const H = 74;

const dirs: string[] = [];

function cacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "survidle-worlds-"));
  dirs.push(dir);
  installNodeWorldCache(dir);
  return dir;
}

const worldFile = (dir: string, seed: number) => join(dir, `${seed}-${W}x${H}-v${GENERATOR_VERSION}.bin`);

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
  // The suite's own worlds live in the real cache; hand it back.
  installNodeWorldCache();
});

describe("the solved-world cache", () => {
  it("writes a world that reads back as the solve made it, leaving no claim and no part file", () => {
    const dir = cacheDir();
    const seed = 90001;
    const world = solvedFor(seed, W, H);
    expect(world.terrain).toEqual(solveWorld(seed, W, H).terrain);
    expect(existsSync(worldFile(dir, seed))).toBe(true);
    expect(readdirSync(dir).filter((name) => name.endsWith(".solving") || name.endsWith(".part"))).toEqual([]);
  });

  it("takes over a claim left behind by a process that died rather than waiting out its clock", () => {
    const dir = cacheDir();
    const seed = 90002;
    const lock = `${worldFile(dir, seed)}.solving`;
    writeFileSync(lock, "");
    const hoursAgo = Date.now() / 1000 - 3600;
    utimesSync(lock, hoursAgo, hoursAgo);

    const started = Date.now();
    const world = solvedFor(seed, W, H);

    expect(world.terrain).toEqual(solveWorld(seed, W, H).terrain);
    // Waiting on the abandoned claim instead of taking it over would cost minutes.
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(worldFile(dir, seed))).toBe(true);
  });

  it("sweeps worlds from an earlier generator but leaves a live claim and a half-written world alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "survidle-worlds-"));
    dirs.push(dir);
    const stale = join(dir, `1-${W}x${H}-v${GENERATOR_VERSION - 1}.bin`);
    const lock = join(dir, `2-${W}x${H}-v${GENERATOR_VERSION}.bin.solving`);
    const part = join(dir, `2-${W}x${H}-v${GENERATOR_VERSION}.bin.4242.part`);
    for (const file of [stale, lock, part]) writeFileSync(file, "");

    installNodeWorldCache(dir);

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(part)).toBe(true);
  });

  it("puts a whole world under the name a reader looks for, never a part of one", () => {
    const dir = cacheDir();
    const seed = 90003;
    solvedFor(seed, W, H);
    // Header, then the seven arrays: 2 bytes of height, 4 of discharge and
    // one each of flow direction, kind, flags, terrain and moisture. A file
    // that is short by any amount is a world that was read while it was
    // being written, which decodes to wrong ground rather than to an error.
    expect(statSync(worldFile(dir, seed)).size).toBe(16 + W * H * 11);
  });
});
