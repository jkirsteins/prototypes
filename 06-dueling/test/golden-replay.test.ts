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
    // The two mode-3 scenarios re-recorded at the jittered-reaction step,
    // cause verified by per-tick probe: createAiState now consumes one rng
    // draw for the initial reaction, so every subsequent seeded draw -
    // cooldown, attack, height - shifts, and both duelist fights re-roll
    // wholesale. Here the duelist commits at tick 85 and its thrust kills
    // at 135; the scripted parry at 120 forms ~300ms after the blade
    // stopped being meetable. The drill scenario (mode 2, no reaction
    // gate, no rng draws) hashing IDENTICALLY across the same change is
    // the control that pins the cause to the rng stream.
    "longsword player advances into mode-3 rapier duelist": { hash: 28558235, endedAt: 135 },
    // Same rng-stream shift: the duelist now launches at tick 106, 16
    // ticks after the scripted player thrust at 90, and dies mid-windup
    // at 118 - the near-simultaneous trade the old recording witnessed
    // (blades crossing at 117) simply is not scheduled this roll. The
    // crossing mechanics stay pinned by blade-contact.test.ts, not by
    // this gate.
    "rapier player against mode-3 longsword, different seed": { hash: 3216415018, endedAt: 118 },
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
    // Re-recorded at parry-rise (the guard needs parryRiseMs to form, so
    // the tell-free rapier thrust kills at 188 where the old build was
    // parried) and again at the jittered-reaction step: seed 7 draws a
    // 203ms reaction where the constant was 180, so the dummy's press
    // lands two ticks later (173, was 171). Same fight, same documented
    // death at 188 - only the press tick moved, which is exactly what a
    // slower reaction should change and nothing more.
    "parry dummy reads the player's telegraph-free attacks": { hash: 4097846637, endedAt: 188 },
  };

  for (const sc of SCENARIOS) {
    test(sc.name, () => {
      expect(runScenario(sc)).toEqual(EXPECTED[sc.name]);
    });
  }
});
