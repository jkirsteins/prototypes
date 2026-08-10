/** The game's one ear-facing surface. A thin Web Audio wrapper with two
 *  properties that are the whole design:
 *
 *  - **Nothing exists until a user gesture.** `unlock()` builds the
 *    `AudioContext` lazily and is wired to the first pointerdown/keydown;
 *    every other call is a no-op while the context is null. Autoplay policy
 *    requires this anyway, and it is also why the test suite needs no mocks -
 *    under happy-dom or node no gesture ever fires, so the module stays
 *    inert. Do not construct a context at module load or in `createHud`.
 *
 *  - **A missing or undecodable file degrades to silence, never a throw.**
 *    Buffers are fetched once at unlock, each with its own catch logging one
 *    warning. The game must play identically with its ears cut off.
 *
 *  `cue(name)` is the entire playing API. A slight playback-rate jitter keeps
 *  a round of five raids from sounding like one sample stuttering; a
 *  per-drain dedupe keeps a simultaneous batch (the score floats' single
 *  step) from stacking five copies at once.
 *
 *  The mute preference rides `MetaStorage` under its own key - the
 *  `RULES_PREFS_KEY` pattern, deliberately not a `LogPrefs` field: the boot
 *  path seeds `LOG_PREFS_KEY` by replacing the whole record, and a `?popups=`
 *  boot must not silently reset the player's sound. */

import { SOUNDS, type SoundName } from "./audio-manifest";
import type { MetaStorage } from "./meta";

export const AUDIO_PREFS_KEY = "balticmap-audio-prefs-v1";

export interface AudioEngine {
  /** Builds the context and starts decoding, on the first real gesture.
   *  Idempotent; safe to wire to several event types. */
  unlock(): void;
  /** Plays a sound now, if the context exists, decoding finished and the
   *  player has not muted. Silent no-op otherwise. */
  cue(name: SoundName): void;
  muted(): boolean;
  /** Flips and persists the preference. Returns the new value. */
  setMuted(muted: boolean): void;
}

export function loadMutedPref(storage: MetaStorage): boolean {
  try {
    const raw = storage.getItem(AUDIO_PREFS_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof (parsed as { muted?: unknown }).muted === "boolean"
      ? (parsed as { muted: boolean }).muted
      : false;
  } catch {
    return false;
  }
}

export function saveMutedPref(storage: MetaStorage, muted: boolean): void {
  try {
    storage.setItem(AUDIO_PREFS_KEY, JSON.stringify({ muted }));
  } catch {
    // Session-only preference from here on; same degradation as every pref.
  }
}

const MASTER_GAIN = 0.6;
/** +-6% playback rate, so repeats of one sample read as events, not a loop. */
const RATE_JITTER = 0.06;
/** Two cues of the same sound inside this window collapse into one - the
 *  simultaneous-batch case, e.g. one queue step raising several score floats. */
const DEDUPE_MS = 90;

export function createAudioEngine(storage: MetaStorage): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<SoundName, AudioBuffer>();
  const lastCue = new Map<SoundName, number>();
  let isMuted = loadMutedPref(storage);

  function unlock(): void {
    if (ctx !== null) return;
    if (typeof AudioContext !== "function") return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    for (const [name, file] of Object.entries(SOUNDS) as [SoundName, string][]) {
      fetch(`${import.meta.env.BASE_URL}audio/${file}`)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx!.decodeAudioData(data))
        .then((buffer) => buffers.set(name, buffer))
        .catch((err) => console.warn(`audio: could not load ${file}:`, err));
    }
  }

  return {
    unlock,
    cue(name) {
      if (ctx === null || master === null || isMuted) return;
      // A suspended context (the tab lost focus mid-run) resumes on the next
      // cue rather than staying dead for the session.
      if (ctx.state === "suspended") void ctx.resume();
      const buffer = buffers.get(name);
      if (buffer === undefined) return; // still decoding, or failed to
      const now = ctx.currentTime * 1000;
      const last = lastCue.get(name);
      if (last !== undefined && now - last < DEDUPE_MS) return;
      lastCue.set(name, now);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_JITTER;
      src.connect(master);
      src.start();
    },
    muted() {
      return isMuted;
    },
    setMuted(muted) {
      isMuted = muted;
      if (master !== null) master.gain.value = muted ? 0 : MASTER_GAIN;
      saveMutedPref(storage, muted);
    },
  };
}
