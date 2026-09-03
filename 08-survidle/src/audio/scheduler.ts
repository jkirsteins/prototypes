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
import type { World } from "../world/gen";
import type { AudioEngine } from "./engine";

export interface Scheduler {
  /** Once per rAF. live is false while dead, away, or the tab is hidden: everything fades out and nothing starts. */
  frame(state: GameState, world: World, cal: Calendar, ambient: number, nowMs: number, live: boolean): void;
  cue(c: Cue): void;
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
  };
}
