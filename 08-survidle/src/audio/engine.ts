/**
 * All Web Audio lives here. Three buses under a master: ambience (the beds,
 * through a lowpass that closes indoors), flavour (calls) and action (the
 * work and the moments). Audio is optional: a file that fails to decode
 * logs one warning and its slot stays silent, and nothing plays until a
 * user gesture unlocks the context.
 */
import { loadSettings, saveSettings, type AudioSettings } from "./settings";
import type { Slot, SlotDef } from "./manifest";

export interface AudioEngine {
  /** On any user gesture; creates or resumes the context. Idempotent. */
  unlock(): void;
  ready(): boolean;
  /** Once per frame: every loop fades toward its target gain over about two seconds; absent slots fade out. */
  setLoops(targets: Record<Slot, number>, indoors: boolean): void;
  /** delay is real seconds before the start: a thunderclap after its flash, once the wind sub-project brings one. */
  play(slot: Slot, opts?: { gain?: number; pan?: number; rate?: number; delay?: number }): void;
  settings(): AudioSettings;
  update(s: Partial<AudioSettings>): void;
  /** A hidden tab: hold the loops. */
  suspend(): void;
  resume(): void;
}

const FADE_S = 0.7;            // setTargetAtTime constant: about 2 s to settle
const INDOORS_HZ = 600;
const OUTDOORS_HZ = 20000;
/** A loop at target 0 for this long is stopped and dropped. */
const LOOP_LINGER_MS = 5000;

const BUS_OF = (def: SlotDef, slot: Slot): "ambience" | "flavour" | "action" =>
  def.kind === "loop" ? "ambience" : CALLS.has(slot) ? "flavour" : "action";
const CALLS = new Set<Slot>([
  "loon", "cuckoo", "raven", "owl", "crane", "woodpecker", "capercaillie", "blackGrouse", "willowGrouse", "ptarmigan",
  "mallard", "eider", "goose", "elk", "wolf", "fox", "squirrel",
]);

export function createAudioEngine(slots: Record<Slot, SlotDef>, storage: Storage = localStorage): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buses: Partial<Record<"ambience" | "flavour" | "action", GainNode>> = {};
  let lowpass: BiquadFilterNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const roundRobin = new Map<Slot, number>();
  const loops = new Map<Slot, { src: AudioBufferSourceNode; gain: GainNode; quietSince: number }>();
  let cfg = loadSettings(storage);
  let suspended = false;

  const applySettings = (): void => {
    if (!ctx || !master) return;
    master.gain.value = cfg.muted ? 0 : cfg.volume;
    const amb = cfg.ambience ? 1 : 0;
    if (buses.ambience) buses.ambience.gain.value = amb;
    if (buses.flavour) buses.flavour.gain.value = amb;
  };

  const unlock = (): void => {
    if (ctx) {
      if (ctx.state === "suspended" && !suspended) void ctx.resume();
      return;
    }
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = OUTDOORS_HZ;
    lowpass.connect(master);
    buses.ambience = ctx.createGain();
    buses.ambience.connect(lowpass);
    buses.flavour = ctx.createGain();
    buses.flavour.connect(master);
    buses.action = ctx.createGain();
    buses.action.connect(master);
    applySettings();
    const c = ctx;
    for (const def of Object.values(slots)) {
      for (const file of def.files) {
        if (buffers.has(file)) continue;
        fetch(`${import.meta.env.BASE_URL}audio/${file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((bytes) => c.decodeAudioData(bytes))
          .then((buf) => buffers.set(file, buf))
          .catch((err: Error) => console.warn(`audio: ${file} unavailable (${err.message})`));
      }
    }
    if (c.state === "suspended") void c.resume();
  };

  const pickFile = (slot: Slot): AudioBuffer | null => {
    const def = slots[slot];
    if (!def || !def.files.length) return null;
    const i = (roundRobin.get(slot) ?? -1) + 1;
    roundRobin.set(slot, i);
    const file = def.files[i % def.files.length];
    return buffers.get(file) ?? null;
  };

  const play = (slot: Slot, opts: { gain?: number; pan?: number; rate?: number; delay?: number } = {}): void => {
    if (!ctx || suspended) return;
    const def = slots[slot];
    const buf = pickFile(slot);
    if (!def || !buf) return;
    const bus = buses[BUS_OF(def, slot)];
    if (!bus) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = def.gain * (opts.gain ?? 1);
    src.connect(g);
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      p.connect(bus);
    } else {
      g.connect(bus);
    }
    src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
  };

  const setLoops = (targets: Record<Slot, number>, indoors: boolean): void => {
    if (!ctx || !buses.ambience || !lowpass) return;
    const now = ctx.currentTime;
    lowpass.frequency.setTargetAtTime(indoors ? INDOORS_HZ : OUTDOORS_HZ, now, FADE_S);
    const wall = performance.now();
    for (const [slot, target] of Object.entries(targets)) {
      if (target <= 0) continue;
      let l = loops.get(slot);
      if (!l) {
        const def = slots[slot];
        const buf = pickFile(slot);
        if (!def || !buf || def.kind !== "loop") continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(buses.ambience);
        src.start();
        l = { src, gain, quietSince: 0 };
        loops.set(slot, l);
      }
      l.quietSince = 0;
      l.gain.gain.setTargetAtTime(slots[slot].gain * Math.min(1, target), now, FADE_S);
    }
    for (const [slot, l] of loops) {
      if ((targets[slot] ?? 0) > 0) continue;
      if (!l.quietSince) {
        l.quietSince = wall;
        l.gain.gain.setTargetAtTime(0, now, FADE_S);
      } else if (wall - l.quietSince > LOOP_LINGER_MS) {
        l.src.stop();
        l.src.disconnect();
        l.gain.disconnect();
        loops.delete(slot);
      }
    }
  };

  return {
    unlock,
    ready: () => ctx !== null,
    setLoops,
    play,
    settings: () => ({ ...cfg }),
    update(s) {
      cfg = { ...cfg, ...s, volume: Math.min(1, Math.max(0, s.volume ?? cfg.volume)) };
      saveSettings(cfg, storage);
      applySettings();
    },
    suspend() {
      suspended = true;
      void ctx?.suspend();
    },
    resume() {
      suspended = false;
      void ctx?.resume();
    },
  };
}
