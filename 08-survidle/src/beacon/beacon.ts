/**
 * The beacon: the cadence and the record. It knows the game's facts and
 * a sink with one method, and nothing about the vendor behind the sink.
 * Off, it keeps counting attention and the time of death, so a tester
 * who turns it back on is counted from the right place; the only emit
 * that ignores the switch is the switch itself, once per toggle.
 */
import { current } from "../sim/record";
import type { GameState } from "../sim/types";
import { type BeaconRecord, beganAgainFacts, common, diedFacts, openedFacts } from "./facts";
import { saveRecord } from "./storage";

export interface Sink {
  emit(name: string, context: Record<string, unknown>): void;
  /** Ends the vendor session outright, for a switch turned off mid-session; optional because the recording test sink has nothing to end. */
  stop?(): void;
}

/** One heartbeat a real minute while the tab is visible and the game runs: the unit hours of attention are summed from. */
export const HEARTBEAT_MS = 60_000;

/**
 * Whether this is the frame that should report a death: the first frame
 * where the state reads dead and the caller had not already seen it die.
 * A death produced by the reload catch-up counts the same as one produced
 * by a live tick, since both cross from not-dead to dead exactly once.
 */
export function deathTransition(wasDead: boolean, deadNow: boolean): boolean {
  return deadNow && !wasDead;
}

export interface Beacon {
  opened(state: GameState): void;
  died(state: GameState, now: number): void;
  beganAgain(state: GameState, now: number): void;
  tick(state: GameState, visible: boolean, running: boolean, now: number): void;
  setOn(on: boolean, state: GameState): void;
  setSink(sink: Sink | null): void;
  record(): BeaconRecord;
}

export function createBeacon(storage: Storage, sink: Sink | null, rec: BeaconRecord): Beacon {
  let lastBeat: number | null = null;
  const save = () => saveRecord(storage, rec);
  const send = (name: string, ctx: Record<string, unknown>) => { if (rec.on) sink?.emit(name, ctx); };
  return {
    opened(state) { send("opened", { ...openedFacts(state, rec) }); },
    died(state, now) {
      rec.diedAt = now;
      save();
      send("died", { ...diedFacts(state, rec) });
    },
    beganAgain(state, now) {
      send("beganAgain", { ...beganAgainFacts(state, rec, now) });
      rec.attention = { seed: state.seed, survivor: current(state).index, minutes: 0 };
      save();
    },
    tick(state, visible, running, now) {
      if (!visible || !running) { lastBeat = null; return; }
      if (lastBeat === null) { lastBeat = now; return; }
      if (now - lastBeat < HEARTBEAT_MS) return;
      lastBeat = now;
      const seed = state.seed;
      const survivor = current(state).index;
      if (rec.attention.seed !== seed || rec.attention.survivor !== survivor) rec.attention = { seed, survivor, minutes: 0 };
      rec.attention.minutes += 1;
      save();
      send("heartbeat", { ...common(state, rec) });
    },
    setOn(on, state) {
      rec.on = on;
      save();
      sink?.emit("settings", { ...common(state, rec), on });
    },
    setSink(s) { sink = s; },
    record: () => rec,
  };
}
