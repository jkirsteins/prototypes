import { buildNotice } from "../notices";
import type { Notice } from "../notices";
import { diff } from "../vitals";
import type { EventKind, GameEvent, GameState } from "../types";

/** How long the table dwells on each kind of event. The full chain between
 *  your click and your next input stays around 1.3s, which is short enough
 *  that no skip control is warranted. Tune here, nowhere else. */
export const BEAT_MS: Record<EventKind, number> = {
  scene: 0,
  turn: 120,
  lead: 250,
  answer: 200,
  decline: 120,
  effect: 200,
  coercion: 150,
  surrender: 300,
  recover: 200,
  haulUp: 200,
  pass: 200,
  discard: 180,
  draw: 180,
  reshuffle: 200,
  outcome: 0,
};

export interface BeatHooks {
  /** Perform the visual for one event. Called once per event, in order. */
  play(event: GameEvent): void;
  /** Open the modal. The driver stays busy until `done` is called. */
  notice(notice: Notice, done: () => void): void;
  /** The chain has drained: unlock input and draw final state. */
  settled(): void;
}

export interface BeatDriver {
  run(state: GameState): void;
  reset(): void;
  isBusy(): boolean;
}

export function createBeats(hooks: BeatHooks): BeatDriver {
  let rendered = 0;
  let busy = false;
  let queue: GameEvent[] = [];
  let segment: GameEvent[] | null = null;
  // The log the last `rendered` count refers to. `state.log` is a single
  // array mutated in place by push for the life of one run (see log.ts), so
  // its identity is stable turn over turn. A fresh run gets a brand new
  // array from newRun(), even if it happens to reach the same length as the
  // old one before we ever see it - length alone can't tell those apart.
  let lastLog: GameEvent[] | null = null;

  /** Closes the open segment against `closing` and returns the notice, if
   *  any. Always leaves the segment closed. */
  function flush(closing: GameEvent): Notice | null {
    const open = segment;
    segment = null;
    if (open === null || open.length === 0) return null;
    return buildNotice(open, diff(open[0].vitals, closing.vitals));
  }

  /** Applies the segment rules to one event and returns a notice to show
   *  before continuing, if that event closed a segment worth reporting. */
  function track(event: GameEvent): Notice | null {
    if (event.kind === "outcome") {
      segment = null;
      return null;
    }
    if (event.kind === "turn") {
      const notice = flush(event);
      if (event.side === "convict") segment = [event];
      return notice;
    }
    if (event.kind === "surrender") {
      const notice = flush(event);
      segment = [event];
      return notice;
    }
    segment?.push(event);
    return null;
  }

  function step(): void {
    const event = queue.shift();
    if (event === undefined) {
      busy = false;
      hooks.settled();
      return;
    }
    hooks.play(event);
    const notice = track(event);
    const wait = BEAT_MS[event.kind];
    if (notice !== null) {
      setTimeout(() => hooks.notice(notice, step), wait);
      return;
    }
    setTimeout(step, wait);
  }

  return {
    run(state: GameState): void {
      // A log array we haven't seen before means a fresh run replaced the
      // old one under us; start over rather than slicing past the end (or,
      // worse, silently rendering nothing because the new log happens to
      // match the old rendered count in length).
      if (state.log !== lastLog) {
        rendered = 0;
        segment = null;
      }
      queue = state.log.slice(rendered);
      rendered = state.log.length;
      lastLog = state.log;
      busy = true;
      step();
    },
    reset(): void {
      rendered = 0;
      queue = [];
      segment = null;
      busy = false;
      lastLog = null;
    },
    isBusy: () => busy,
  };
}
