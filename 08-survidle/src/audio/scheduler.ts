/**
 * Turns the sim's answers into sound. Beds follow the surroundings every
 * frame; the task's loop keeps its own beat on the wall clock; calls are
 * rolled once per game minute against their rates, at most one call per
 * burst with bursts a few game minutes apart, near or far at random.
 *
 * The rolls are on the game clock and from the world seed, not the wall
 * clock and Math.random: a call at a given minute of a given run is the
 * same whoever plays it, however fast the clock runs and however the
 * frames fall, so a seed's night can be listened to in advance with
 * scripts/calls.ts. At 1x a game minute is a real second, so a rate "per
 * game hour" reads as it always did, per real minute; under a hurry or
 * the speed test aid the calls follow the game clock rather than the
 * wall. The one thing left to the caller's `random` is the beat's pitch
 * jitter, which is cosmetic and on the wall clock anyway.
 */
import { derive } from "../rng";
import type { Calendar } from "../sim/calendar";
import type { Cue } from "../sim/cues";
import { activityLoop, ambienceMix, openCalls, surroundings } from "../sim/soundscape";
import type { GameState } from "../sim/types";
import type { WildlifeStartleEvent } from "../sim/wildlife-encounter";
import type { World } from "../world/gen";
import type { AudioEngine } from "./engine";

export interface Scheduler {
  /** Once per rAF. live is false while dead, away, or the tab is hidden: everything fades out and nothing starts. */
  frame(state: GameState, world: World, cal: Calendar, ambient: number, nowMs: number, live: boolean): void;
  cue(c: Cue): void;
  /** Live, already-deduplicated presentation events only. Snow is read from current weather by the caller. */
  wildlifeStartle(event: WildlifeStartleEvent, snowCovered?: boolean): void;
}

/** Game minutes between bursts: a real four seconds at 1x, as the wall-clock gap was. */
const CALL_GAP_MIN = 4;
/**
 * A frame that carries more game minutes than this rolls only the last of
 * them. A hurry pulse is six minutes a second and a return from away is
 * hours; the calls of a stretch nobody was listening to are not owed.
 */
const MAX_ROLLED_MINUTES = 10;
/** Playback rate jitter on repeating sounds, so a loop of footsteps is not a metronome. */
const JITTER = 0.06;

/**
 * Uniform in [0, 1) from the world seed, a game minute and a name. The seed
 * and the minute go through `derive`, the name through FNV-1a, and the
 * result through murmur3's finaliser so neighbouring minutes do not roll
 * neighbouring numbers.
 */
export function roll(seed: number, minute: number, key: string): number {
  let h = derive(seed, minute);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function createScheduler(engine: AudioEngine, random: () => number = Math.random): Scheduler {
  let lastBeat = -Infinity;
  let beatSlot: string | null = null;
  /** The game minute last rolled, or null while nothing is live: the first live minute is a start, not a stretch to catch up. */
  let lastMinute: number | null = null;
  let lastCallMinute = -Infinity;
  /** Game minute before which each held slot is not rolled. */
  const heldUntil = new Map<string, number>();

  return {
    frame(state, world, cal, ambient, nowMs, live) {
      if (!live) {
        engine.setLoops({}, false);
        beatSlot = null;
        lastMinute = null;
        return;
      }
      const s = surroundings(state, world, ambient);
      engine.setLoops(ambienceMix(s, cal, ambient), s.indoors);

      const loop = activityLoop(state, s);
      if (!loop) beatSlot = null;
      else {
        if (loop.slot !== beatSlot) {
          beatSlot = loop.slot;
          lastBeat = nowMs - loop.period * 1000;   // the first beat lands at once
        }
        if (nowMs - lastBeat >= loop.period * 1000) {
          lastBeat = nowMs;
          engine.play(loop.slot, { rate: 1 + (random() * 2 - 1) * JITTER });
        }
      }

      const minute = Math.floor(state.minute);
      if (lastMinute === null || minute < lastMinute) {
        lastMinute = minute;
        return;
      }
      if (minute === lastMinute) return;
      const from = Math.max(lastMinute + 1, minute - MAX_ROLLED_MINUTES + 1);
      lastMinute = minute;
      const open = openCalls(state, world, cal);
      for (let m = from; m <= minute; m++) {
        if (m - lastCallMinute < CALL_GAP_MIN) continue;
        // Every open call gets its own roll against its rate (per game
        // hour, so per minute is a sixtieth), but a burst is a single
        // moment: more than one species can pass its roll here, and only
        // one of them is actually heard. The one heard is picked from the
        // passing set weighted by rate, so a common resident at full
        // density is heard more often than a rare passer-by, matching the
        // rates over many bursts rather than letting catalogue order decide.
        const heard = open.filter((c) => (heldUntil.get(c.slot) ?? -Infinity) <= m && roll(state.seed, m, c.slot) < c.rate / 60);
        if (!heard.length) continue;
        let pick = roll(state.seed, m, "pick") * heard.reduce((sum, c) => sum + c.rate, 0);
        let chosen = heard[heard.length - 1];
        for (const c of heard) {
          pick -= c.rate;
          if (pick <= 0) { chosen = c; break; }
        }
        lastCallMinute = m;
        if (chosen.hold) heldUntil.set(chosen.slot, m + chosen.hold);
        engine.play(chosen.slot, { gain: 0.3 + 0.7 * roll(state.seed, m, "gain"), pan: roll(state.seed, m, "pan") * 2 - 1 });
      }
    },
    cue(c) {
      engine.play(c);
    },
    wildlifeStartle(event, snowCovered = false) {
      const forest = event.terrain === "spruce" || event.terrain === "pine" || event.terrain === "birch";
      const slot = snowCovered ? "startle_hoof_snow" : event.terrain === "bog" ? "startle_hoof_bog"
        : `startle_hoof_${event.body}_${forest ? "forest" : "open"}`;
      // Stable presentation variation neither consumes the caller's RNG nor
      // advances the simulation's stream. Group counterpoint stays in range.
      let hash = 2166136261;
      for (let i = 0; i < event.id.length; i++) hash = Math.imul(hash ^ event.id.charCodeAt(i), 16777619);
      const rate = 0.95 + (hash >>> 0) / 4294967295 * 0.1;
      const gain = 1 / (1 + Math.max(0, event.distanceM) / 100);
      const pan = Math.cos(event.bearingRad);
      engine.duck(900, 0.28);
      engine.play("startle_contact", { gain, pan, rate, delay: 0 });
      // Short recordings contain several impacts. Three increasingly quiet
      // bursts describe roughly two seconds of movement away from the source.
      for (const [delay, level] of [[0.08, 1], [0.72, 0.62], [1.44, 0.3]]) {
        engine.play(slot, { gain: gain * level, pan, rate, delay });
      }
      if (event.group === "group") {
        engine.play(slot, { gain: gain * 0.4, pan, rate: rate <= 1 ? rate + 0.04 : rate - 0.04, delay: 0.23 });
      }
    },
  };
}
