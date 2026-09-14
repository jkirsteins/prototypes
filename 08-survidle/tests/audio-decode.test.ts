/**
 * Pins the memory fix: unlock() must not pull the whole catalogue into
 * memory, and a sound decodes at most once no matter how many times or how
 * concurrently it is asked to play.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "../src/audio/engine";
import type { Slot, SlotDef } from "../src/audio/manifest";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, key: (i) => [...values.keys()][i] ?? null,
    removeItem: (key) => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); },
  };
}

// A minimal Web Audio stand-in: enough surface for createAudioEngine to run
// its graph setup and one-shot playback without a real browser.
class Node {
  gain = { value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} };
  frequency = { value: 0, setTargetAtTime() {} };
  playbackRate = { value: 1 };
  buffer: unknown;
  loop = false;
  type = "";
  onended: (() => void) | null = null;
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}
class Context {
  currentTime = 0;
  state: "running" | "suspended" = "running";
  destination = new Node();
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { return new Node(); }
  async decodeAudioData() { return {} as AudioBuffer; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("decode on first play, not on unlock", () => {
  it("unlock() fetches only the preload set, never the whole catalogue", async () => {
    vi.stubGlobal("AudioContext", Context);
    const fetch = vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("fetch", fetch);
    const slots: Record<Slot, SlotDef> = {
      fire: { files: ["fire.ogg"], kind: "loop", gain: 0.6 },
      step_leaves: { files: ["step_leaves_01.ogg", "step_leaves_02.ogg"], kind: "oneshot", gain: 0.5 },
      forest: { files: ["forest.ogg"], kind: "loop", gain: 0.5 },
      raven: { files: ["raven.ogg"], kind: "oneshot", gain: 0.6 },
      wolves: { files: ["wolves.ogg"], kind: "oneshot", gain: 0.9 },
    };
    const engine = createAudioEngine(slots, storage());
    engine.unlock();
    await settle();
    const fetched = fetch.mock.calls.map(([url]) => String(url));
    expect(fetched.some((u) => u.endsWith("fire.ogg"))).toBe(true);
    expect(fetched.some((u) => u.endsWith("step_leaves_01.ogg"))).toBe(true);
    expect(fetched.some((u) => u.endsWith("step_leaves_02.ogg"))).toBe(true);
    // Not in the preload set: nothing fetches them until something plays them.
    expect(fetched.some((u) => u.endsWith("forest.ogg"))).toBe(false);
    expect(fetched.some((u) => u.endsWith("raven.ogg"))).toBe(false);
    expect(fetched.some((u) => u.endsWith("wolves.ogg"))).toBe(false);
  });

  it("decodes a non-preloaded sound once on first play and reuses it after", async () => {
    vi.stubGlobal("AudioContext", Context);
    const fetch = vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("fetch", fetch);
    const slots: Record<Slot, SlotDef> = { raven: { files: ["raven.ogg"], kind: "oneshot", gain: 0.6 } };
    const engine = createAudioEngine(slots, storage());
    engine.unlock();
    expect(fetch).not.toHaveBeenCalled();

    // The very first play asks for a sound that is not decoded yet: it kicks
    // off the decode but this call has nothing to play with.
    engine.play("raven");
    expect(fetch).toHaveBeenCalledTimes(1);
    await settle();

    // Now cached: further plays neither re-fetch nor re-decode.
    engine.play("raven");
    engine.play("raven");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch across two concurrent first-plays of the same sound", async () => {
    vi.stubGlobal("AudioContext", Context);
    const fetch = vi.fn(async (_url: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("fetch", fetch);
    const slots: Record<Slot, SlotDef> = { wolves: { files: ["wolves.ogg"], kind: "oneshot", gain: 0.9 } };
    const engine = createAudioEngine(slots, storage());
    engine.unlock();

    engine.play("wolves");
    engine.play("wolves"); // concurrent: the first decode has not resolved yet
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops ambience loops instead of leaving them running silently when ambience is turned off", async () => {
    vi.stubGlobal("AudioContext", Context);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const slots: Record<Slot, SlotDef> = { fire: { files: ["fire.ogg"], kind: "loop", gain: 0.6 } };
    const engine = createAudioEngine(slots, storage());
    engine.unlock();
    await settle(); // fire is preloaded, so it is cached by now

    engine.setLoops({ fire: 1 }, false);
    const stop = vi.spyOn(Node.prototype, "stop");
    engine.update({ ambience: false });
    expect(stop).toHaveBeenCalledTimes(1);

    // The scheduler keeps calling setLoops every frame regardless of the
    // toggle; it must not immediately recreate what was just stopped.
    engine.setLoops({ fire: 1 }, false);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
