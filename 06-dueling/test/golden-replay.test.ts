import { describe, expect, test } from "vitest";
import { aiDecide, createAiState } from "../src/combat/ai";
import { createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { AiMode } from "../src/combat/ai";
import type { Intent, WeaponId } from "../src/combat/types";

/**
 * The behavior-preservation gate for the state-tracks restructure (spec
 * 2026-08-02-fighter-state-tracks.md §7.1). Each scenario runs a seeded duel
 * and hashes a NORMALIZED projection per tick: positions, over/winner, and
 * the DuelEvent stream (kind/side/time only). State kinds and phase names
 * are deliberately excluded - the restructure renames them, so a hash over
 * names could not survive even behavior-preserving changes. Any timing
 * drift still surfaces: a shifted boundary moves an event's time, a broken
 * remainder moves x.
 *
 * The expected hashes were recorded on the pre-restructure build (9ca5cb3),
 * then re-recorded ONCE at the timeline-snapshot step, cause fully known:
 * the old walker subtracted phase durations from a phase-local clock, and
 * its accumulated float rounding pushed exact-multiple boundaries (400ms,
 * 700ms) across a tick edge in path-dependent directions. The absolute-mark
 * comparison crosses on the mathematically correct tick. Verified by full
 * per-tick diff against the old build: 6 events moved by exactly one tick
 * (4 AI swings earlier, 2 rapier-cut parried later); positions, outcomes
 * and every other event identical. If a hash changes again, the simulation
 * changed - do not re-record without that level of understanding.
 */

/** FNV-1a 32-bit, accumulated across per-tick projection lines. */
function fnv1a(hash: number, s: string): number {
  let h = hash;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

interface Scenario {
  name: string;
  p: WeaponId;
  e: WeaponId;
  mode: AiMode;
  seed: number;
  ticks: number;
  /** Player intent per tick index; ticks not listed feed null. */
  script: Record<number, Intent>;
}

/**
 * Scripts are fixed tick times, never reactions to state - so they replay
 * identically on any engine that preserves behavior. Together the scenarios
 * produce every DuelEvent kind except "draw" (a same-tick mutual death is
 * not schedulable from a blind script): step, attackStart, windup, swing,
 * parry, met, parried, whiff, void, hit, kill - across both weapons on both
 * sides and AI modes 1-3.
 */
const SCENARIOS: Scenario[] = [
  {
    name: "longsword player advances into mode-3 rapier duelist",
    p: "longsword", e: "rapier", mode: 3, seed: 0x5eed, ticks: 3600,
    script: (() => {
      const s: Record<number, Intent> = {};
      for (let t = 0; t < 90; t++) s[t] = "advance"; // held key: chained steps
      s[120] = "parry"; s[200] = "thrust"; s[300] = "void"; s[420] = "parry";
      s[520] = "cut"; s[700] = "parry"; s[820] = "thrust";
      return s;
    })(),
  },
  {
    name: "rapier player against mode-3 longsword, different seed",
    p: "rapier", e: "longsword", mode: 3, seed: 0xbeef, ticks: 3600,
    script: (() => {
      const s: Record<number, Intent> = {};
      for (let t = 0; t < 60; t++) s[t] = "advance";
      s[90] = "thrust"; s[220] = "parry"; s[340] = "advance"; s[360] = "advance";
      s[430] = "cut"; s[600] = "void"; s[760] = "parry";
      return s;
    })(),
  },
  {
    name: "drill metronome: parry the first beat, void the second into a whiff",
    p: "longsword", e: "rapier", mode: 2, seed: 1, ticks: 2400,
    script: (() => {
      const s: Record<number, Intent> = {};
      for (let t = 0; t < 111; t++) s[t] = "advance"; // close from out of measure
      s[128] = "parry"; // up as the first drill strike arrives
      s[240] = "void"; // hop out of the second: whiff, extended recovery
      for (let t = 280; t < 341; t++) s[t] = "advance"; // re-close; the third kills
      return s;
    })(),
  },
  {
    name: "parry dummy reads the player's telegraph-free attacks",
    p: "rapier", e: "rapier", mode: 1, seed: 7, ticks: 1800,
    script: (() => {
      const s: Record<number, Intent> = {};
      for (let t = 0; t < 130; t++) s[t] = "advance";
      s[160] = "thrust"; s[300] = "cut"; s[460] = "thrust"; s[620] = "cut";
      return s;
    })(),
  },
];

function runScenario(sc: Scenario): { hash: number; endedAt: number | null } {
  const d = createDuel(WEAPONS[sc.p], WEAPONS[sc.e]);
  const ai = createAiState(sc.seed);
  let hash = 0x811c9dc5;
  let endedAt: number | null = null;
  for (let tick = 0; tick < sc.ticks; tick++) {
    const ia = sc.script[tick] ?? null;
    const ib = aiDecide(d, sc.mode, ai, 1000 / 60);
    const events = tickDuel(d, ia, ib);
    const line = JSON.stringify({
      x: [d.f[0].x, d.f[1].x],
      over: d.over,
      winner: d.winner,
      events: events.map((e) => ({ kind: e.kind, side: e.side, time: e.time })),
    });
    hash = fnv1a(hash, line);
    if (d.over && endedAt === null) endedAt = tick;
  }
  return { hash, endedAt };
}

describe("golden replay: the simulation is unchanged by the restructure", () => {
  const EXPECTED: Record<string, { hash: number; endedAt: number | null }> = {
    "longsword player advances into mode-3 rapier duelist": { hash: 1489359747, endedAt: 105 },
    // Re-recorded at blade-contact, cause verified by per-tick probe: the
    // duelist's thrust begins at tick 88, the scripted player thrust at
    // 90 - a same-line near-simultaneous trade. The old build let the
    // faster rapier resolve first and kill at 118; the blades now cross
    // at 117 (met, side 1 - the later strike completing the contact),
    // both resolve parried (118, 133), and the duelist's cut ends the
    // longer fight at 317. The trade becoming a clash is the spec's
    // central promise, witnessed in the gate scenario itself.
    "rapier player against mode-3 longsword, different seed": { hash: 2583423569, endedAt: 317 },
    // Re-recorded at rule D (parry on its own track: the player walks into
    // the first drill strike with the guard riding and parries it), at
    // attack-lines (the drill cycles heights, so its third strike steps the
    // stance up first and the killing blow lands 17 ticks later, 410 vs
    // 393), and at blade-contact: same death, same tick, but the parried
    // first beat's met cue now fires at the blade's ARRIVAL at the guard
    // (extension covering the gap) instead of the parryable-interval
    // boundary - the travel model locating the clash. The other scenarios
    // are unchanged: their duels end before any contact timing differs.
    "drill metronome: parry the first beat, void the second into a whiff": { hash: 4063824542, endedAt: 410 },
    // Re-recorded once at the parry-rise step (TODO-1), the sanctioned
    // gameplay change: the guard now needs parryRiseMs to form, so the
    // dummy's reactive answer to the tell-free rapier thrust (260ms of
    // preparation against 180ms reaction + 190ms rise) forms ~30ms after
    // the blade stops being meetable - the documented coverage failure,
    // pinned independently by parry-rise.test.ts. The scripted thrust at
    // tick 160 therefore kills at tick 188 where the old build was parried.
    "parry dummy reads the player's telegraph-free attacks": { hash: 3658309345, endedAt: 188 },
  };

  for (const sc of SCENARIOS) {
    test(sc.name, () => {
      expect(runScenario(sc)).toEqual(EXPECTED[sc.name]);
    });
  }
});
