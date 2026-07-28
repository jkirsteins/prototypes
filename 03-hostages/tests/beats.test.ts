import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBeats, BEAT_MS } from "../src/ui/beats";
import type { BeatHooks } from "../src/ui/beats";
import type { EventKind, GameEvent, GameState } from "../src/types";
import { newRun, chooseOpening, playerLead, playerPass } from "../src/game";
import type { Notice } from "../src/notices";

const ALL_KINDS: EventKind[] = [
  "scene", "turn", "lead", "answer", "decline", "effect", "coercion",
  "surrender", "recover", "haulUp", "pass", "discard", "draw",
  "reshuffle", "outcome",
];

function recorder() {
  const played: GameEvent[] = [];
  const notices: Notice[] = [];
  let resume: (() => void) | null = null;
  let settled = 0;
  const hooks: BeatHooks = {
    play: (e) => played.push(e),
    notice: (n, done) => {
      notices.push(n);
      resume = done;
    },
    settled: () => {
      settled += 1;
    },
  };
  return {
    hooks,
    played,
    notices,
    settledCount: () => settled,
    dismiss: () => {
      const r = resume;
      resume = null;
      r?.();
    },
    pending: () => resume !== null,
  };
}

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BEAT_MS", () => {
  it("gives every event kind a duration", () => {
    expect(Object.keys(BEAT_MS).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("keeps a full convict exchange under 1500ms", () => {
    const chain = BEAT_MS.turn + BEAT_MS.draw + BEAT_MS.lead + BEAT_MS.answer + BEAT_MS.effect;
    expect(chain).toBeLessThanOrEqual(1500);
  });
});

describe("beat driver", () => {
  it("plays every fresh event once, in order", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.map((e) => e.kind)).toEqual(state.log.map((e) => e.kind));
  });

  it("only plays events appended since the last run", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const first = r.played.length;
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBe(state.log.length);
    expect(r.played.length).toBeGreaterThan(first);
  });

  it("is busy until the chain drains, then settles exactly once", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    expect(beats.isBusy()).toBe(true);
    expect(r.settledCount()).toBe(0);
    vi.advanceTimersByTime(10000);
    expect(beats.isBusy()).toBe(false);
    expect(r.settledCount()).toBe(1);
  });

  it("settles even when there is nothing fresh to play", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.settledCount()).toBe(2);
  });

  it("shows no notice for the player's own turn", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = [];
    playerLead(state, "stallHim");
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(0);
  });

  it("holds the chain open until the notice is dismissed, then settles", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);

    // Hand-built segment: his turn, his lead, your decline, the effect,
    // then your turn marker which closes it.
    const base = state.log[state.log.length - 1];
    const push = (kind: EventKind, over: Partial<GameEvent> = {}) => {
      state.log.push({ ...base, kind, deltas: [], text: "", ...over });
    };
    push("turn", { side: "convict" });
    push("lead", { side: "convict", cardId: "backhand" });
    push("decline", { side: "player", text: "You take it." });
    push("turn", {
      side: "player",
      vitals: { ...base.vitals, playerVigor: base.vitals.playerVigor - 2 },
    });

    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].rows).toContain(
      `Your vigor ${base.vitals.playerVigor} -> ${base.vitals.playerVigor - 2}`,
    );
    expect(beats.isBusy()).toBe(true);
    expect(r.settledCount()).toBe(1); // the initial deal only

    r.dismiss();
    vi.advanceTimersByTime(10000);
    expect(beats.isBusy()).toBe(false);
    expect(r.settledCount()).toBe(2);
  });

  it("drops the open segment when the run ends", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const base = state.log[state.log.length - 1];
    state.log.push({ ...base, kind: "turn", side: "convict", text: "", deltas: [] });
    state.log.push({ ...base, kind: "lead", side: "convict", cardId: "backhand", text: "", deltas: [] });
    state.log.push({ ...base, kind: "outcome", side: "system", text: "", deltas: [] });
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(0);
  });

  it("forgets everything on reset so a new run replays from the start", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const first = r.played.length;
    beats.reset();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBe(first * 2);
  });

  it("replays from the start when the log shrinks under it", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const fresh = started();
    beats.run(fresh);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBeGreaterThan(fresh.log.length);
  });
});
