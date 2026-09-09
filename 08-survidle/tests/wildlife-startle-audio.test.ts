import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine, type AudioEngine } from "../src/audio/engine";
import { SLOTS } from "../src/audio/manifest";
import { createScheduler } from "../src/audio/scheduler";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { encounterGeometry } from "../src/sim/wildlife-space";

const event: WildlifeStartleEvent = {
  id: "herd-7:escape-3", subjectId: 7, source: { xM: 50, yM: 20 },
  bearingRad: 0, distanceM: 40, uncertaintyM: 0,
  perception: { kind: "seen", identification: "species" }, terrain: "spruce",
  body: "light", group: "single", logText: "A roe deer startles.",
};

function recorder() {
  const plays: { slot: string; opts: NonNullable<Parameters<AudioEngine["play"]>[1]> }[] = [];
  const ducks: { durationMs: number; amount: number }[] = [];
  const engine: AudioEngine = {
    unlock() {}, ready: () => true, setLoops() {},
    play(slot, opts = {}) { plays.push({ slot, opts }); },
    duck(durationMs, amount) { ducks.push({ durationMs, amount }); },
    settings: () => ({ volume: 1, muted: false, ambience: true }),
    update() {}, suspend() {}, resume() {},
  };
  return { engine, plays, ducks };
}

describe("wildlife departure scheduling", () => {
  it.each([
    ["east", { xM: 140, yM: 200 }, 1],
    ["west", { xM: 60, yM: 200 }, -1],
    ["north", { xM: 100, yM: 160 }, 0],
    ["south", { xM: 100, yM: 240 }, 0],
  ] as const)("pans a source to the %s using encounter geometry", (_direction, source, want) => {
    const geometry = encounterGeometry({ xM: 100, yM: 200 }, source)!;
    const { engine, plays } = recorder();
    createScheduler(engine).wildlifeStartle({
      ...event, source: geometry.subject, bearingRad: geometry.bearingRad, distanceM: geometry.distanceM,
    });
    expect(plays.length).toBeGreaterThan(1);
    for (const play of plays) expect(play.opts.pan).toBeCloseTo(want);
  });

  it("starts with contact then recedes through delayed, positioned hoofbeats", () => {
    const { engine, plays, ducks } = recorder();
    createScheduler(engine).wildlifeStartle(event);
    expect(plays[0]).toMatchObject({ slot: "startle_contact", opts: { delay: 0, pan: 1 } });
    const feet = plays.slice(1);
    expect(feet.length).toBeGreaterThanOrEqual(3);
    expect(feet.every((p) => p.slot === "startle_hoof_light_forest")).toBe(true);
    expect(feet[0].opts.delay).toBeGreaterThanOrEqual(0.06);
    expect(feet[0].opts.delay).toBeLessThanOrEqual(0.12);
    expect(feet.at(-1)!.opts.delay).toBeGreaterThan(1);
    expect(feet.at(-1)!.opts.delay).toBeLessThan(2);
    for (let i = 1; i < feet.length; i++) {
      expect(feet[i].opts.gain).toBeLessThan(feet[i - 1].opts.gain!);
      expect(feet[i].opts.delay).toBeGreaterThan(feet[i - 1].opts.delay!);
    }
    expect(plays.every((p) => p.opts.pan === 1)).toBe(true);
    expect(ducks).toEqual([{ durationMs: 900, amount: 0.28 }]);
  });

  it.each([
    ["spruce", "light", false, "startle_hoof_light_forest"],
    ["pine", "heavy", false, "startle_hoof_heavy_forest"],
    ["birch", "heavy", false, "startle_hoof_heavy_forest"],
    ["meadow", "light", false, "startle_hoof_light_open"],
    ["fell", "heavy", false, "startle_hoof_heavy_open"],
    ["rock", "heavy", false, "startle_hoof_heavy_open"],
    ["bog", "heavy", false, "startle_hoof_bog"],
    ["bog", "light", true, "startle_hoof_snow"],
    ["spruce", "heavy", true, "startle_hoof_snow"],
  ] as const)("selects %s / %s with snow=%s", (terrain, body, snow, want) => {
    const { engine, plays } = recorder();
    createScheduler(engine).wildlifeStartle({ ...event, terrain, body }, snow);
    expect(plays[1].slot).toBe(want);
  });

  it("uses event identity for bounded jitter without consuming randomness or editing the event", () => {
    const a = recorder(); const b = recorder(); const c = recorder();
    const random = vi.fn(() => 0.1);
    const before = JSON.stringify(event);
    createScheduler(a.engine, random).wildlifeStartle(event);
    createScheduler(b.engine, () => 0.9).wildlifeStartle(event);
    createScheduler(c.engine).wildlifeStartle({ ...event, id: "another-episode" });
    expect(a.plays).toEqual(b.plays);
    expect(c.plays[1].opts.rate).not.toBe(a.plays[1].opts.rate);
    expect(a.plays.every((p) => p.opts.rate! >= 0.95 && p.opts.rate! <= 1.05)).toBe(true);
    expect(random).not.toHaveBeenCalled();
    expect(JSON.stringify(event)).toBe(before);
  });

  it("attenuates with distance and adds a quieter, non-identical group layer", () => {
    const near = recorder(); const far = recorder(); const group = recorder();
    createScheduler(near.engine).wildlifeStartle(event);
    createScheduler(far.engine).wildlifeStartle({ ...event, distanceM: 250, bearingRad: Math.PI });
    createScheduler(group.engine).wildlifeStartle({ ...event, group: "group" });
    expect(far.plays[1].opts.gain).toBeLessThan(near.plays[1].opts.gain!);
    expect(far.plays[1].opts.pan).toBe(-1);
    expect(group.plays).toHaveLength(near.plays.length + 1);
    const extra = group.plays.at(-1)!;
    expect(extra.opts.gain).toBeLessThan(group.plays[1].opts.gain!);
    expect(extra.opts.rate).not.toBe(group.plays[1].opts.rate);
    expect(extra.opts.delay).not.toBe(group.plays[1].opts.delay);
  });

  it("provides two variants for every departure vocabulary slot", () => {
    for (const slot of ["startle_contact", "startle_hoof_light_forest", "startle_hoof_heavy_forest", "startle_hoof_light_open", "startle_hoof_heavy_open", "startle_hoof_bog", "startle_hoof_snow", "startle_brush_predator"] as const) {
      expect(SLOTS[slot]?.kind).toBe("oneshot");
      expect(new Set(SLOTS[slot]?.files).size).toBeGreaterThanOrEqual(2);
    }
  });
});

// Web Audio is the external boundary. Record node connections and automation
// so these tests exercise the actual engine's routing and failure handling.
class Param {
  value = 1;
  automation: { kind: string; value?: number; time: number }[] = [];
  setTargetAtTime(value: number, time: number) { this.automation.push({ kind: "target", value, time }); }
  setValueAtTime(value: number, time: number) { this.automation.push({ kind: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.automation.push({ kind: "ramp", value, time }); }
  cancelScheduledValues(time: number) { this.automation.push({ kind: "cancel", time }); }
  cancelAndHoldAtTime(time: number) { this.automation.push({ kind: "hold", time }); }
}
class Node {
  gain = new Param(); frequency = new Param(); playbackRate = new Param();
  connections: Node[] = [];
  buffer: unknown; loop = false; type = ""; onended: (() => void) | null = null;
  starts: number[] = []; stops = 0;
  connect(node: Node) { this.connections.push(node); }
  disconnect() {}
  start(time = 0) { this.starts.push(time); }
  stop() { this.stops++; }
}
class Context {
  static last: Context;
  currentTime = 10; state = "running"; destination = new Node();
  sources: Node[] = []; gains: Node[] = [];
  constructor() { Context.last = this; }
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  async decodeAudioData() { return {}; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
}

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (i) => [...values.keys()][i] ?? null,
    removeItem: (key) => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); },
  };
}

async function loadedEngine() {
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const engine = createAudioEngine(SLOTS, storage());
  engine.unlock();
  await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  // Let the chained fetch, buffer and decode promises settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { engine, ctx: Context.last };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("optional departure playback", () => {
  it("ducks existing loops and footsteps, then restores smoothly without reducing startle or calls", async () => {
    const { engine, ctx } = await loadedEngine();
    engine.setLoops({ forest: 1 }, false);
    engine.play("step_leaves");
    engine.duck(900, 0.28);
    engine.play("startle_contact", { pan: 0.8 });
    engine.play("raven");
    const ducked = ctx.gains.filter((node) => node.gain.automation.some((a) => a.value === 0.72));
    expect(ducked).toHaveLength(2);
    const passes = (node: Node, targets: Node[]): boolean => targets.includes(node) || node.connections.some((next) => passes(next, targets));
    expect(passes(ctx.sources[0], ducked)).toBe(true);
    expect(passes(ctx.sources[1], ducked)).toBe(true);
    expect(passes(ctx.sources[2], ducked)).toBe(false);
    expect(passes(ctx.sources[3], ducked)).toBe(false);
    for (const node of ducked) expect(node.gain.automation.at(-1)).toMatchObject({ value: 1, time: 10.9 });
    engine.update({ ambience: false });
    expect(ducked.every((node) => node.gain.automation.at(-1)?.time === 10.9)).toBe(true);
  });

  it("centres without stereo, silences mute, and drops pending departures when hidden", async () => {
    const { engine, ctx } = await loadedEngine();
    expect(() => createScheduler(engine).wildlifeStartle(event)).not.toThrow();
    expect(ctx.sources.length).toBeGreaterThan(1);
    engine.suspend();
    expect(ctx.sources.every((s) => s.stops === 1)).toBe(true);
    engine.resume();
    const count = ctx.sources.length;
    engine.update({ muted: true });
    createScheduler(engine).wildlifeStartle(event);
    expect(ctx.sources).toHaveLength(count);
  });

  it("warns only once for a failed file and keeps all event consumers alive", async () => {
    vi.stubGlobal("AudioContext", Context);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = createAudioEngine({ startle_contact: { files: ["missing.ogg"], gain: 1, kind: "oneshot" } }, storage());
    engine.unlock();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(() => { engine.play("startle_contact"); engine.play("startle_contact"); engine.duck(900, 0.28); }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
