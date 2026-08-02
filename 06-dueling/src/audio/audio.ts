import type { DuelEvent } from "../combat/engine";
import { EVENT_SOUNDS, FOOTSTEPS, SOUNDS, WINDUP_SOUND } from "./manifest";
import type { SoundName } from "./manifest";

/**
 * All Web Audio lives here; the combat layer stays DOM-free. Audio is
 * optional: a browser that cannot decode Ogg (Safari) logs one warning per
 * file and the game plays silent.
 *
 * The context is never suspended for pause: one-shots are tick-driven, so a
 * paused game emits no events and is silent for free, and `.` single-step
 * still sounds its tick.
 */
export interface AudioEngine {
  /** Call on any user gesture; creates/resumes the context (idempotent). */
  unlock(): void;
  /** Once per rAF frame with every event of that frame's ticks. */
  frame(events: DuelEvent[]): void;
  /** Returns true when now muted. */
  toggleMute(): boolean;
}

const SFX_GAIN = 0.7;
const WINDUP_GAIN = 0.35; // a cue under the outcome sounds, not an effect

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let sfxBus: GainNode | null = null;
  let masterBus: GainNode | null = null;
  const buffers = new Map<SoundName, AudioBuffer>();
  let muted = false;
  let footstepAt = 0;
  const windupTones: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];

  const unlock = (): void => {
    if (ctx !== null) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    masterBus = ctx.createGain();
    masterBus.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_GAIN;
    sfxBus.connect(masterBus);
    for (const [name, file] of Object.entries(SOUNDS) as Array<[SoundName, string]>) {
      fetch(`${import.meta.env.BASE_URL}audio/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((bytes) => (ctx as AudioContext).decodeAudioData(bytes))
        .then((buf) => buffers.set(name, buf))
        .catch((err: Error) => console.warn(`audio: ${file} unavailable (${err.message})`));
    }
  };

  const play = (name: SoundName, rate: number): void => {
    if (ctx === null || sfxBus === null) return;
    const buf = buffers.get(name);
    if (buf === undefined) return; // still decoding, or failed: skip silently
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(sfxBus);
    src.start();
  };

  const startWindup = (side: 0 | 1, ms: number): void => {
    if (ctx === null || sfxBus === null) return;
    const buf = buffers.get(WINDUP_SOUND);
    if (buf === undefined) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (buf.duration * 1000) / ms; // stretch to the windup
    const g = ctx.createGain();
    g.gain.value = WINDUP_GAIN;
    src.connect(g);
    g.connect(sfxBus);
    src.onended = () => {
      if (windupTones[side] === src) windupTones[side] = null;
    };
    windupTones[side] = src;
    src.start();
  };

  const chokeWindup = (side: 0 | 1): void => {
    const src = windupTones[side];
    if (src !== null) {
      src.stop();
      windupTones[side] = null;
    }
  };

  const frame = (events: DuelEvent[]): void => {
    if (ctx === null) return;
    // Windup tones are per-side and stoppable, so they bypass the dedupe:
    // both fighters may rise at once, each at its own rate. A landed hit
    // chokes the victim's rise (mezzo tempo: the windup died with it), and
    // a feint chokes the feinter's own - the threat was withdrawn.
    for (const e of events) {
      if (e.kind === "windup") startWindup(e.side, e.ms ?? 280);
      else if (e.kind === "hit") chokeWindup((1 - e.side) as 0 | 1);
      else if (e.kind === "feint") chokeWindup(e.side);
    }
    // At 2x/4x several ticks run per frame; one sound per kind per frame
    // keeps catch-up bursts from stacking identical samples.
    const seen = new Set<DuelEvent["kind"]>();
    for (const e of events) {
      if (seen.has(e.kind)) continue;
      seen.add(e.kind);
      const pool = EVENT_SOUNDS[e.kind];
      if (pool === undefined) continue;
      if (pool === FOOTSTEPS) {
        footstepAt = (footstepAt + 1) % pool.length;
        play(pool[footstepAt], 1 + (Math.random() - 0.5) * 0.1);
      } else {
        play(pool[Math.floor(Math.random() * pool.length)], 1);
      }
    }
  };

  const toggleMute = (): boolean => {
    muted = !muted;
    if (masterBus !== null) masterBus.gain.value = muted ? 0 : 1;
    return muted;
  };

  return { unlock, frame, toggleMute };
}
