/**
 * Turns the sim's answers into sound on the wall clock. Beds follow the
 * surroundings every frame; the task's loop keeps its own beat; calls are
 * rolled every quarter second against their rates, but at most one call
 * plays per burst and bursts are a few seconds apart, near or far at
 * random. Randomness here is the caller's, so the sim's seeded stream is
 * never touched and tests can pin it.
 */
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

const ROLL_MS = 250;
const CALL_GAP_MS = 4000;
/** Playback rate jitter on repeating sounds, so a loop of footsteps is not a metronome. */
const JITTER = 0.06;

export function createScheduler(engine: AudioEngine, random: () => number = Math.random): Scheduler {
  let lastRoll = -Infinity;
  let lastCall = -Infinity;
  let lastBeat = -Infinity;
  let beatSlot: string | null = null;

  return {
    frame(state, world, cal, ambient, nowMs, live) {
      if (!live) {
        engine.setLoops({}, false);
        beatSlot = null;
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

      if (nowMs - lastRoll < ROLL_MS) return;
      lastRoll = nowMs;
      if (nowMs - lastCall < CALL_GAP_MS) return;
      // Every open call gets its own roll against its rate (per real minute,
      // scaled to this quarter second), but a burst is a single moment: more
      // than one species can pass its roll here, and only one of them is
      // actually heard. The one heard is picked from the passing set
      // weighted by rate, so a common resident at full density is heard
      // more often than a rare passer-by, matching the rates over many
      // bursts rather than letting catalogue order decide.
      const heard = openCalls(state, world, cal).filter((c) => random() < (c.rate / 60) * (ROLL_MS / 1000));
      if (heard.length) {
        let pick = random() * heard.reduce((sum, c) => sum + c.rate, 0);
        let chosen = heard[heard.length - 1];
        for (const c of heard) {
          pick -= c.rate;
          if (pick <= 0) { chosen = c; break; }
        }
        lastCall = nowMs;
        engine.play(chosen.slot, { gain: 0.3 + 0.7 * random(), pan: random() * 2 - 1 });
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
