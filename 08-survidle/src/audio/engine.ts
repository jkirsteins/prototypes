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
  /** Briefly reduce ambience and survivor footsteps by amount, then restore smoothly. */
  duck(durationMs: number, amount: number): void;
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
/**
 * Every sound decodes on first play except two named exceptions, kept as
 * two tiers so the reasoning for each stays visible here rather than
 * scattered across call sites:
 *
 * IMMEDIATE_SLOTS decode on unlock, before anything has played: the fire
 * bed and every footstep surface play on nearly every frame once a run is
 * under way, so waiting for a first play would make the very first fire
 * crackle or footfall late or silent.
 *
 * WARM_SLOTS decode shortly after unlock, at low priority, via
 * warmDramaticSet(): the startle departures, ice cracking, a falling tree,
 * a breaking tool, wolves. These are rare, one-off dramatic beats rather
 * than a constant hum, so they must not delay the first gesture the way
 * IMMEDIATE_SLOTS may - but a silent first occurrence can be the only
 * occurrence a session ever has, so leaving them fully on demand risks
 * losing the moment they exist for.
 *
 * Everything outside both tiers - calls, the other ambience beds, minor
 * moments - decodes on first play: a bird call landing a beat late costs
 * nothing worth spending memory up front to avoid.
 */
const IMMEDIATE_SLOTS: Slot[] = [
  "fire", "step_leaves", "step_grass", "step_bog", "step_rock", "step_snow", "step_ice",
];
const WARM_SLOTS: Slot[] = [
  "startle_contact",
  "startle_hoof_light_forest", "startle_hoof_heavy_forest",
  "startle_hoof_light_open", "startle_hoof_heavy_open",
  "startle_hoof_bog", "startle_hoof_snow", "startle_brush_predator",
  "toolBreaks", "fallThrough", "iceCracks", "treeFalls", "wolves",
];
/** How long a background warm step may wait for an idle moment before running anyway. */
const WARM_IDLE_TIMEOUT_MS = 2000;
/** Delay between background warm steps where the browser has no requestIdleCallback (Safari). */
const WARM_FALLBACK_DELAY_MS = 250;

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
  let ambienceDuck: GainNode | null = null;
  let footstepsDuck: GainNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  /** In-flight decode per file, so two concurrent first-plays of the same sound share one fetch and one decode. */
  const decoding = new Map<string, Promise<AudioBuffer | null>>();
  const warned = new Set<string>();
  const shots = new Set<AudioBufferSourceNode>();
  const roundRobin = new Map<Slot, number>();
  const loops = new Map<Slot, { src: AudioBufferSourceNode; gain: GainNode; quietSince: number }>();
  let cfg = loadSettings(storage);
  let suspended = false;

  const warnOnce = (key: string, reason: unknown): void => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`audio: ${key} unavailable (${reason instanceof Error ? reason.message : String(reason)})`);
  };

  const stopShots = (): void => {
    for (const src of shots) {
      src.stop();
      src.disconnect();
    }
    shots.clear();
  };

  const stopLoops = (): void => {
    for (const [, l] of loops) {
      l.src.stop();
      l.src.disconnect();
      l.gain.disconnect();
    }
    loops.clear();
  };

  const applySettings = (): void => {
    if (!ctx || !master) return;
    master.gain.value = cfg.muted ? 0 : cfg.volume;
    const amb = cfg.ambience ? 1 : 0;
    if (buses.ambience) buses.ambience.gain.value = amb;
    if (buses.flavour) buses.flavour.gain.value = amb;
    // Ambience off is not just silence: the beds keep running underneath it
    // unless stopped, spending CPU on audio nobody hears. Stopping them here
    // costs nothing extra - setLoops already starts a fresh, faded-in node
    // the next time a bed is wanted.
    if (!cfg.ambience) stopLoops();
  };

  /**
   * Fetches and decodes one file into the buffer cache, sharing an in-flight
   * decode across concurrent callers rather than starting a second one. A
   * file that already failed once stays failed rather than being retried on
   * every subsequent play.
   */
  const decodeFile = (file: string): Promise<AudioBuffer | null> => {
    const cached = buffers.get(file);
    if (cached) return Promise.resolve(cached);
    if (warned.has(file)) return Promise.resolve(null);
    const pending = decoding.get(file);
    if (pending) return pending;
    if (!ctx) return Promise.resolve(null);
    const c = ctx;
    const promise = fetch(`${import.meta.env.BASE_URL}audio/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((bytes) => c.decodeAudioData(bytes))
      .then((buf) => {
        buffers.set(file, buf);
        return buf;
      })
      .catch((err: Error) => {
        warnOnce(file, err);
        return null;
      })
      .finally(() => decoding.delete(file));
    decoding.set(file, promise);
    return promise;
  };

  /**
   * Runs fn at the next moment the browser considers idle, or after a fixed
   * short delay on a browser with no requestIdleCallback (Safari has none).
   */
  const scheduleIdle = (fn: () => void): void => {
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(fn, { timeout: WARM_IDLE_TIMEOUT_MS });
    else setTimeout(fn, WARM_FALLBACK_DELAY_MS);
  };

  /**
   * Decodes every WARM_SLOTS file one at a time, each step scheduled for an
   * idle moment rather than fired all at once. One at a time keeps this from
   * contending with the browser's decoder against a real play request or
   * against the immediate tier still loading; decodeFile's own cache means a
   * real play that reaches a file before the warmer does costs the warmer
   * nothing when it gets there.
   */
  const warmDramaticSet = (): void => {
    const files = WARM_SLOTS.flatMap((slot) => slots[slot]?.files ?? []);
    let i = 0;
    const step = (): void => {
      if (i >= files.length) return;
      void decodeFile(files[i++]).finally(() => scheduleIdle(step));
    };
    scheduleIdle(step);
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
    ambienceDuck = ctx.createGain();
    buses.ambience.connect(ambienceDuck);
    ambienceDuck.connect(lowpass);
    buses.flavour = ctx.createGain();
    buses.flavour.connect(master);
    buses.action = ctx.createGain();
    buses.action.connect(master);
    footstepsDuck = ctx.createGain();
    footstepsDuck.connect(buses.action);
    applySettings();
    for (const slot of IMMEDIATE_SLOTS) {
      const def = slots[slot];
      if (!def) continue;
      for (const file of def.files) void decodeFile(file);
    }
    warmDramaticSet();
    if (ctx.state === "suspended") void ctx.resume();
  };

  const pickFile = (slot: Slot): AudioBuffer | null => {
    const def = slots[slot];
    if (!def?.files.length) {
      warnOnce(slot, "no files registered");
      return null;
    }
    const i = (roundRobin.get(slot) ?? -1) + 1;
    roundRobin.set(slot, i);
    const file = def.files[i % def.files.length];
    const cached = buffers.get(file);
    if (!cached) void decodeFile(file);
    return cached ?? null;
  };

  const play = (slot: Slot, opts: { gain?: number; pan?: number; rate?: number; delay?: number } = {}): void => {
    if (!ctx || suspended || cfg.muted) return;
    const def = slots[slot];
    const buf = pickFile(slot);
    if (!def || !buf) return;
    const bus = slot.startsWith("step_") ? footstepsDuck : buses[BUS_OF(def, slot)];
    if (!bus) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      const g = ctx.createGain();
      g.gain.value = def.gain * (opts.gain ?? 1);
      src.connect(g);
      let p: StereoPannerNode | null = null;
      if (opts.pan !== undefined && typeof ctx.createStereoPanner === "function") {
        p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        g.connect(p);
        p.connect(bus);
      } else {
        g.connect(bus);
      }
      src.onended = () => { shots.delete(src); src.disconnect(); g.disconnect(); p?.disconnect(); };
      src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
      shots.add(src);
    } catch (err) {
      warnOnce(slot, err);
    }
  };

  const duck = (durationMs: number, amount: number): void => {
    if (!ctx || suspended || cfg.muted) return;
    const now = ctx.currentTime;
    for (const node of [ambienceDuck, footstepsDuck]) {
      if (!node) continue;
      const g = node.gain;
      // Separate gain nodes leave user volume and ambience settings intact.
      // Holding automation also lets a second departure extend the dip.
      if (typeof g.cancelAndHoldAtTime === "function") g.cancelAndHoldAtTime(now);
      else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
      g.linearRampToValueAtTime(1 - Math.max(0, Math.min(1, amount)), now + 0.015);
      g.linearRampToValueAtTime(1, now + Math.max(0.03, durationMs / 1000));
    }
  };

  const setLoops = (targets: Record<Slot, number>, indoors: boolean): void => {
    if (!ctx || !buses.ambience || !lowpass) return;
    const now = ctx.currentTime;
    lowpass.frequency.setTargetAtTime(indoors ? INDOORS_HZ : OUTDOORS_HZ, now, FADE_S);
    const wall = performance.now();
    // Ambience off means no bed is wanted, not just no bed heard: otherwise
    // this runs every frame regardless of the toggle and would immediately
    // recreate whatever applySettings just stopped.
    const active = cfg.ambience ? targets : {};
    for (const [slot, target] of Object.entries(active)) {
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
      if ((active[slot] ?? 0) > 0) continue;
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
    duck,
    settings: () => ({ ...cfg }),
    update(s) {
      cfg = { ...cfg, ...s, volume: Math.min(1, Math.max(0, s.volume ?? cfg.volume)) };
      if (cfg.muted) stopShots();
      saveSettings(cfg, storage);
      applySettings();
    },
    suspend() {
      suspended = true;
      // Frozen delayed one-shots must not replay when the tab is restored.
      stopShots();
      void ctx?.suspend();
    },
    resume() {
      suspended = false;
      void ctx?.resume();
    },
  };
}
