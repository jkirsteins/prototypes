import { describe, expect, it } from "vitest";
import { GENERATOR_VERSION, type SolvedWorld } from "../src/world/solve";
import { readSolved, setWorldStore, worldKey, writeSolved, type WorldRecord } from "../src/world/worldstore";

// happy-dom has no IndexedDB, so this tests the key and the round trip through
// an injected fake store; the IndexedDB wrapper itself is exercised by the
// browser check in the task report.
function fakeStore() {
  const records = new Map<string, WorldRecord>();
  return {
    records,
    get(key: string) {
      return Promise.resolve(records.get(key));
    },
    put(record: WorldRecord) {
      records.set(record.key, record);
      return Promise.resolve();
    },
  };
}

function tinySolved(): SolvedWorld {
  const n = 4;
  return {
    w: 2, h: 2,
    height: new Int16Array([1, 2, 3, 4]),
    flowDir: new Uint8Array([0, 1, 2, 3]),
    discharge: new Float32Array([0.1, 0.2, 0.3, 0.4]),
    kind: new Uint8Array(n).fill(1),
    flags: new Uint8Array(n).fill(0),
    terrain: new Uint8Array(n).fill(2),
    moisture: new Uint8Array(n).fill(128),
  };
}

describe("worldKey", () => {
  it("bakes the seed, size and generator version into one string", () => {
    expect(worldKey(42, 480, 320)).toBe(`42-480x320-v${GENERATOR_VERSION}`);
  });
});

describe("readSolved and writeSolved over an injected store", () => {
  it("misses on an empty store", async () => {
    setWorldStore(fakeStore());
    const result = await readSolved(worldKey(1, 2, 2));
    expect(result).toBeNull();
    setWorldStore(null);
  });

  it("round-trips the seven typed arrays", async () => {
    const store = fakeStore();
    setWorldStore(store);
    const key = worldKey(7, 2, 2);
    const solved = tinySolved();
    await writeSolved(key, solved);
    const back = await readSolved(key);
    expect(back).not.toBeNull();
    expect(back?.w).toBe(2);
    expect(back?.h).toBe(2);
    expect(Array.from(back?.height ?? [])).toEqual([1, 2, 3, 4]);
    expect(Array.from(back?.flowDir ?? [])).toEqual([0, 1, 2, 3]);
    expect(Array.from(back?.discharge ?? [])).toEqual(Array.from(solved.discharge));
    expect(Array.from(back?.kind ?? [])).toEqual([1, 1, 1, 1]);
    expect(Array.from(back?.flags ?? [])).toEqual([0, 0, 0, 0]);
    expect(Array.from(back?.terrain ?? [])).toEqual([2, 2, 2, 2]);
    expect(Array.from(back?.moisture ?? [])).toEqual([128, 128, 128, 128]);
    setWorldStore(null);
  });

  it("resolves to null and void, never throws, when a store method rejects", async () => {
    setWorldStore({
      get() { return Promise.reject(new Error("quota exceeded")); },
      put() { return Promise.reject(new Error("quota exceeded")); },
    });
    await expect(readSolved(worldKey(1, 2, 2))).resolves.toBeNull();
    await expect(writeSolved(worldKey(1, 2, 2), tinySolved())).resolves.toBeUndefined();
    setWorldStore(null);
  });
});
