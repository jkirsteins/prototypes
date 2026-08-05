# Combat Animation PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the Xbot through 06-dueling's combat states with curated Mixamo clip timestamps, pose locked to state, reach and grip calibrated, e2e verified in Chrome.

**Architecture:** Three pure layers (timings, states, poses) mirror 06's weapons/fighter/frames split and are vitest-covered; a rig layer applies pose picks to an AnimationMixer under a hard-reset rule; a duel page wires keys to states. Clips arrive as without-skin GLBs binding to Xbot's bones by name.

**Tech Stack:** Vite + TypeScript, three.js (~0.170), vitest, fbx2gltf@0.9.7-p1 (offline conversion only), Chrome DevTools/CDP for e2e.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-combat-anim-poc-design.md` - read it before starting any task.
- Pose is a pure function of state: every action always paused, loop time from `timeMs`, apply with `mixer.update(0)`.
- Timings verbatim from 06: cut 600/100/380/420, thrust 440/60/260/300, `PARRYABLE_FRACTION` 0.5, step 260 ms / 60 cm, void 320 ms / 100 cm, hitstun 350 ms, death 900 ms, reach 200 cm.
- Travelling pose retained while `elapsedMs <= parryableUntil` (inclusive), delivered after.
- Units: x in cm in the state layer (like 06); renderer converts at 0.01 m/cm; duel fighter height 1.75 m.
- The walk demo (default page) must keep working untouched; duel mode is `?mode=duel`.
- Repo rules: no `git add -A`; stage explicit paths; `npm test` and `npm run build` green before every commit; biome lint clean.
- Writing style: no em dashes or non-typable unicode in any file.

---

### Task 1: timings.ts - the 06 timing table

**Files:**
- Create: `src/duel/timings.ts`
- Test: `test/duel-timings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LONGSWORD: WeaponTimings`, `PARRYABLE_FRACTION`, `HIT_STUN_MS`, `DEATH_ANIM_MS`, `PARRY_FORM_MS`, `attackTimeline(w: WeaponTimings, a: "cut" | "thrust"): AttackTimeline`, types `AttackTimings`, `WeaponTimings`, `AttackTimeline`, `AttackKind`.

- [ ] **Step 1: Write the failing test**

```ts
// test/duel-timings.test.ts
import { describe, expect, it } from "vitest";
import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, PARRYABLE_FRACTION, attackTimeline } from "../src/duel/timings";

describe("timings mirror 06's longsword", () => {
  it("copies the attack numbers verbatim", () => {
    expect(LONGSWORD.attacks.cut).toEqual({ windup: 600, beat: 100, strike: 380, recovery: 420 });
    expect(LONGSWORD.attacks.thrust).toEqual({ windup: 440, beat: 60, strike: 260, recovery: 300 });
    expect(LONGSWORD.reachCm).toBe(200);
    expect(LONGSWORD.stepDistanceCm).toBe(60);
    expect(LONGSWORD.stepDurationMs).toBe(260);
    expect(LONGSWORD.voidDistanceCm).toBe(100);
    expect(LONGSWORD.voidDurationMs).toBe(320);
    expect(PARRYABLE_FRACTION).toBe(0.5);
    expect(HIT_STUN_MS).toBe(350);
    expect(DEATH_ANIM_MS).toBe(900);
  });

  it("builds the cut timeline exactly as 06's attackTimeline", () => {
    const tl = attackTimeline(LONGSWORD, "cut");
    expect(tl).toEqual({
      riseStart: 0, riseEnd: 600, strikeStart: 700,
      parryableUntil: 890, strikeEnd: 1080,
      recoveryStart: 1080, recoveryEnd: 1500,
    });
  });

  it("builds the thrust timeline", () => {
    const tl = attackTimeline(LONGSWORD, "thrust");
    expect(tl).toEqual({
      riseStart: 0, riseEnd: 440, strikeStart: 500,
      parryableUntil: 630, strikeEnd: 760,
      recoveryStart: 760, recoveryEnd: 1060,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/duel-timings.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/duel/timings.ts
/**
 * 06-dueling's longsword numbers, copied verbatim (see the spec's
 * transplant contract). Distances stay in centimeters like 06's engine;
 * the renderer converts at 0.01 m per cm.
 */

export type AttackKind = "cut" | "thrust";

export interface AttackTimings {
  windup: number; beat: number; strike: number; recovery: number;
}

export interface WeaponTimings {
  reachCm: number;
  stepDistanceCm: number; stepDurationMs: number;
  voidDistanceCm: number; voidDurationMs: number;
  attacks: Record<AttackKind, AttackTimings>;
}

export const LONGSWORD: WeaponTimings = {
  reachCm: 200,
  stepDistanceCm: 60, stepDurationMs: 260,
  voidDistanceCm: 100, voidDurationMs: 320,
  attacks: {
    cut:    { windup: 600, beat: 100, strike: 380, recovery: 420 },
    thrust: { windup: 440, beat: 60,  strike: 260, recovery: 300 },
  },
};

export const PARRYABLE_FRACTION = 0.5;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;
/** 06's guardShiftMs: the rise-to-formed travel of a parry. */
export const PARRY_FORM_MS = 180;

/** Field-for-field 06's AttackTimeline (weapons.ts). */
export interface AttackTimeline {
  riseStart: number; riseEnd: number; strikeStart: number;
  parryableUntil: number; strikeEnd: number;
  recoveryStart: number; recoveryEnd: number;
}

/** Same math as 06's attackTimeline (weapons.ts:159). */
export function attackTimeline(w: WeaponTimings, a: AttackKind): AttackTimeline {
  const t = w.attacks[a];
  const riseStart = 0;
  const riseEnd = riseStart + t.windup;
  const strikeStart = riseEnd + t.beat;
  const strikeEnd = strikeStart + t.strike;
  return {
    riseStart, riseEnd, strikeStart,
    parryableUntil: strikeStart + t.strike * PARRYABLE_FRACTION,
    strikeEnd,
    recoveryStart: strikeEnd,
    recoveryEnd: strikeEnd + t.recovery,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/duel-timings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add 07-rendertest/src/duel/timings.ts 07-rendertest/test/duel-timings.test.ts
git commit -m "feat(rendertest): duel timings table, 06's longsword verbatim"
```

---

### Task 2: states.ts - the PoC fighter state machine

**Files:**
- Create: `src/duel/states.ts`
- Test: `test/duel-states.test.ts`

**Interfaces:**
- Consumes: `attackTimeline`, `LONGSWORD`, `HIT_STUN_MS`, `DEATH_ANIM_MS`, `AttackTimeline`, `AttackKind` from `./timings`.
- Produces:
  - `type DuelState` (union below), `interface Duelist { x: number; facing: 1 | -1; state: DuelState }`
  - `createDuelist(): Duelist` (x 0, facing 1, ready)
  - `type DuelEvent = "stepFwd" | "stepBack" | "void" | "cut" | "thrust" | "parryDown" | "parryUp" | "hitstun" | "bind" | "unarmed" | "death" | "reset" | "flip"`
  - `handleEvent(d: Duelist, e: DuelEvent): void`
  - `tick(d: Duelist, dtMs: number): void`

- [ ] **Step 1: Write the failing test**

```ts
// test/duel-states.test.ts
import { describe, expect, it } from "vitest";
import { LONGSWORD } from "../src/duel/timings";
import { createDuelist, handleEvent, tick } from "../src/duel/states";

describe("duel state machine", () => {
  it("steps forward 60 cm over 260 ms then returns to ready", () => {
    const d = createDuelist();
    handleEvent(d, "stepFwd");
    expect(d.state.kind).toBe("step");
    tick(d, 130);
    expect(d.x).toBeCloseTo(30);
    tick(d, 130);
    expect(d.x).toBeCloseTo(60);
    tick(d, 1);
    expect(d.state.kind).toBe("ready");
  });

  it("steps are facing-relative and voids hop backward 100 cm", () => {
    const d = createDuelist();
    handleEvent(d, "flip");
    expect(d.facing).toBe(-1);
    handleEvent(d, "stepFwd");
    tick(d, 260);
    expect(d.x).toBeCloseTo(-60);
    tick(d, 1);
    handleEvent(d, "void");
    tick(d, 320);
    expect(d.x).toBeCloseTo(-60 + 100); // void moves against facing
  });

  it("attacks walk windup -> strike -> recovery -> ready on 06's marks", () => {
    const d = createDuelist();
    handleEvent(d, "cut");
    if (d.state.kind !== "attack") throw new Error("not attacking");
    expect(d.state.phase).toBe("windup");
    tick(d, 700); // riseEnd 600 + beat 100 = strikeStart
    expect(d.state.kind === "attack" && d.state.phase).toBe("strike");
    tick(d, 380); // strikeEnd 1080
    expect(d.state.kind === "attack" && d.state.phase).toBe("recovery");
    tick(d, 420); // recoveryEnd 1500
    expect(d.state.kind).toBe("ready");
  });

  it("ignores movement events mid-attack, honors reset from anywhere", () => {
    const d = createDuelist();
    handleEvent(d, "cut");
    handleEvent(d, "stepFwd");
    expect(d.state.kind).toBe("attack");
    handleEvent(d, "reset");
    expect(d.state.kind).toBe("ready");
    handleEvent(d, "death");
    expect(d.state.kind).toBe("dead");
    tick(d, 5000);
    expect(d.state.kind).toBe("dead"); // death holds
    handleEvent(d, "reset");
    expect(d.state.kind).toBe("ready");
  });

  it("parry forms while held and releases to ready; hitstun expires", () => {
    const d = createDuelist();
    handleEvent(d, "parryDown");
    expect(d.state.kind).toBe("parry");
    tick(d, 500);
    expect(d.state.kind).toBe("parry"); // held, does not expire
    handleEvent(d, "parryUp");
    expect(d.state.kind).toBe("ready");
    handleEvent(d, "hitstun");
    tick(d, 350);
    tick(d, 1);
    expect(d.state.kind).toBe("ready");
  });

  it("clamps x to the piste bounds", () => {
    const d = createDuelist();
    for (let i = 0; i < 20; i++) { handleEvent(d, "stepFwd"); tick(d, 261); }
    expect(d.x).toBeLessThanOrEqual(400);
    expect(LONGSWORD.stepDistanceCm).toBe(60); // guard against constant drift
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/duel-states.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/duel/states.ts
import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, attackTimeline } from "./timings";
import type { AttackKind, AttackTimeline } from "./timings";

/**
 * The PoC stand-in for 06's fighter: keys force transitions, elapsed ms
 * advances them. x is centimeters, 0 at screen center; the engine owns
 * position and displacement (clips play in place).
 */

/** Keeps the fighter inside the fixed camera's view (cm). */
export const PISTE_HALF_CM = 400;

export type DuelState =
  | { kind: "ready" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: "windup" | "strike" | "recovery"; elapsedMs: number; timeline: AttackTimeline }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "bind" }
  | { kind: "unarmed" }
  | { kind: "dead"; t: number };

export interface Duelist {
  x: number;
  facing: 1 | -1;
  state: DuelState;
}

export function createDuelist(): Duelist {
  return { x: 0, facing: 1, state: { kind: "ready" } };
}

export type DuelEvent =
  | "stepFwd" | "stepBack" | "void" | "cut" | "thrust"
  | "parryDown" | "parryUp" | "hitstun" | "bind" | "unarmed"
  | "death" | "reset" | "flip";

export function handleEvent(d: Duelist, e: DuelEvent): void {
  if (e === "reset") { d.state = { kind: "ready" }; return; }
  if (e === "flip") { d.facing = d.facing === 1 ? -1 : 1; return; }
  if (e === "death") { d.state = { kind: "dead", t: 0 }; return; }
  if (e === "parryUp") {
    if (d.state.kind === "parry") d.state = { kind: "ready" };
    return;
  }
  // Everything else only launches from ready - the PoC has no
  // interrupts; states run their course or are reset.
  if (d.state.kind !== "ready") return;
  switch (e) {
    case "stepFwd": d.state = { kind: "step", dir: 1, t: 0 }; break;
    case "stepBack": d.state = { kind: "step", dir: -1, t: 0 }; break;
    case "void": d.state = { kind: "void", t: 0 }; break;
    case "cut": d.state = { kind: "attack", attack: "cut", phase: "windup", elapsedMs: 0, timeline: attackTimeline(LONGSWORD, "cut") }; break;
    case "thrust": d.state = { kind: "attack", attack: "thrust", phase: "windup", elapsedMs: 0, timeline: attackTimeline(LONGSWORD, "thrust") }; break;
    case "parryDown": d.state = { kind: "parry", t: 0 }; break;
    case "hitstun": d.state = { kind: "hitstun", t: 0 }; break;
    case "bind": d.state = { kind: "bind" }; break;
    case "unarmed": d.state = { kind: "unarmed" }; break;
  }
}

const clampX = (x: number): number => Math.min(PISTE_HALF_CM, Math.max(-PISTE_HALF_CM, x));

/** Linear per-tick displacement, exactly 06's fighter.ts pattern. */
export function tick(d: Duelist, dtMs: number): void {
  const s = d.state;
  const w = LONGSWORD;
  switch (s.kind) {
    case "step": {
      const prev = Math.min(s.t, w.stepDurationMs);
      s.t += dtMs;
      const now = Math.min(s.t, w.stepDurationMs);
      d.x = clampX(d.x + ((now - prev) / w.stepDurationMs) * w.stepDistanceCm * s.dir * d.facing);
      if (s.t > w.stepDurationMs) d.state = { kind: "ready" };
      break;
    }
    case "void": {
      const prev = Math.min(s.t, w.voidDurationMs);
      s.t += dtMs;
      const now = Math.min(s.t, w.voidDurationMs);
      d.x = clampX(d.x - ((now - prev) / w.voidDurationMs) * w.voidDistanceCm * d.facing);
      if (s.t > w.voidDurationMs) d.state = { kind: "ready" };
      break;
    }
    case "attack": {
      s.elapsedMs += dtMs;
      const tl = s.timeline;
      if (s.elapsedMs >= tl.recoveryEnd) d.state = { kind: "ready" };
      else if (s.elapsedMs >= tl.recoveryStart) s.phase = "recovery";
      else if (s.elapsedMs >= tl.strikeStart) s.phase = "strike";
      break;
    }
    case "hitstun":
      s.t += dtMs;
      if (s.t > HIT_STUN_MS) d.state = { kind: "ready" };
      break;
    case "dead":
      s.t = Math.min(s.t + dtMs, DEATH_ANIM_MS); // holds the final pose
      break;
    case "parry":
      s.t += dtMs; // held until parryUp; t drives the rise-to-formed pose
      break;
    case "ready": case "bind": case "unarmed":
      break;
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/duel-states.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add 07-rendertest/src/duel/states.ts 07-rendertest/test/duel-states.test.ts
git commit -m "feat(rendertest): duel state machine with 06 displacement semantics"
```

---

### Task 3: poses.ts - pickPose and the curated timestamp table

**Files:**
- Create: `src/duel/poses.ts`
- Test: `test/duel-poses.test.ts`

**Interfaces:**
- Consumes: `Duelist`, `DuelState` from `./states`; `PARRY_FORM_MS`, `HIT_STUN_MS`, `DEATH_ANIM_MS` from `./timings`.
- Produces:
  - `type ClipName = "gsIdle" | "gsWalk" | "gsSlash" | "gsBlock" | "gsImpact" | "dodgeBack" | "stab" | "unarmedIdle" | "gsDeath"`
  - `CLIPS: Record<ClipName, { file: string; durationS: number }>`
  - `POSE_T` (curated timestamp table, seconds into each clip)
  - `interface PosePick { clip: ClipName; clipTime: number; mode: "held" | "loop" }`
  - `pickPose(d: Duelist, timeMs: number): PosePick`
  - `BIND_COUNTERPART: PosePick` (the static opponent's frozen pose)

- [ ] **Step 1: Write the failing test**

```ts
// test/duel-poses.test.ts
import { describe, expect, it } from "vitest";
import { createDuelist, handleEvent, tick } from "../src/duel/states";
import { CLIPS, POSE_T, pickPose } from "../src/duel/poses";
import type { Duelist } from "../src/duel/states";

const atElapsed = (attack: "cut" | "thrust", elapsedMs: number): Duelist => {
  const d = createDuelist();
  handleEvent(d, attack);
  tick(d, elapsedMs);
  return d;
};

describe("pickPose", () => {
  it("idles loop from timeMs, everything else is held", () => {
    const d = createDuelist();
    const p = pickPose(d, 12345);
    expect(p.clip).toBe("gsIdle");
    expect(p.mode).toBe("loop");
    expect(p.clipTime).toBeCloseTo((12.345) % CLIPS.gsIdle.durationS);
    expect(pickPose(d, 0).clipTime).toBe(0);
  });

  it("windup: low until rise midpoint, high until riseEnd, then the still beat", () => {
    expect(pickPose(atElapsed("cut", 299), 0).clipTime).toBe(POSE_T.slash.windupLow);
    expect(pickPose(atElapsed("cut", 301), 0).clipTime).toBe(POSE_T.slash.windupHigh);
    expect(pickPose(atElapsed("cut", 650), 0).clipTime).toBe(POSE_T.slash.still);
  });

  it("strike: travelling retained AT parryableUntil, delivered after (06 frames.ts:156)", () => {
    // cut timeline: strikeStart 700, parryableUntil 890
    expect(pickPose(atElapsed("cut", 890), 0).clipTime).toBe(POSE_T.slash.travelling);
    expect(pickPose(atElapsed("cut", 891), 0).clipTime).toBe(POSE_T.slash.delivered);
    // thrust: strikeStart 500, parryableUntil 630
    expect(pickPose(atElapsed("thrust", 630), 0).clipTime).toBe(POSE_T.stab.travelling);
    expect(pickPose(atElapsed("thrust", 631), 0).clipTime).toBe(POSE_T.stab.delivered);
  });

  it("recovery scrubs its range and never exceeds it", () => {
    const early = pickPose(atElapsed("cut", 1081), 0).clipTime;
    const late = pickPose(atElapsed("cut", 1499), 0).clipTime;
    expect(early).toBeGreaterThanOrEqual(POSE_T.slash.recoveryStart);
    expect(late).toBeLessThanOrEqual(POSE_T.slash.recoveryEnd);
    expect(late).toBeGreaterThan(early);
  });

  it("parry rises then forms at PARRY_FORM_MS; death clamps at its end", () => {
    const d = createDuelist();
    handleEvent(d, "parryDown");
    tick(d, 100);
    expect(pickPose(d, 0).clipTime).toBe(POSE_T.block.rise);
    tick(d, 100); // 200 > 180
    expect(pickPose(d, 0).clipTime).toBe(POSE_T.block.formed);
    handleEvent(d, "reset");
    handleEvent(d, "death");
    tick(d, 5000);
    expect(pickPose(d, 0).clipTime).toBeCloseTo(POSE_T.death.end);
  });

  it("bind freezes the slash contact; every pick is a real clip", () => {
    const d = createDuelist();
    handleEvent(d, "bind");
    const p = pickPose(d, 0);
    expect(p).toEqual({ clip: "gsSlash", clipTime: POSE_T.bindContact, mode: "held" });
    for (const name of Object.keys(CLIPS)) expect(CLIPS[name as keyof typeof CLIPS].durationS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/duel-poses.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/duel/poses.ts
import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, PARRY_FORM_MS } from "./timings";
import type { Duelist } from "./states";

/**
 * The 3D analogue of 06's ATTACK_FRAMES: curated timestamps into each
 * clip, chosen from screenshots (Task 7 tunes them). Pose is a pure
 * function of state - the strike swap at parryableUntil is inclusive,
 * exactly 06's frames.ts:156.
 */

export type ClipName =
  | "gsIdle" | "gsWalk" | "gsSlash" | "gsBlock" | "gsImpact"
  | "dodgeBack" | "stab" | "unarmedIdle" | "gsDeath";

/** durationS values are measured from the converted GLBs (Task 4 fills
 *  them); 1.0 is a provisional stand-in that keeps the math testable. */
export const CLIPS: Record<ClipName, { file: string; durationS: number }> = {
  gsIdle:     { file: "great-sword-idle.glb",     durationS: 1.0 },
  gsWalk:     { file: "great-sword-walk.glb",     durationS: 1.0 },
  gsSlash:    { file: "great-sword-slash.glb",    durationS: 1.0 },
  gsBlock:    { file: "great-sword-blocking.glb", durationS: 1.0 },
  gsImpact:   { file: "great-sword-impact.glb",   durationS: 1.0 },
  dodgeBack:  { file: "dodge-backward.glb",       durationS: 1.0 },
  stab:       { file: "stabbing.glb",             durationS: 1.0 },
  unarmedIdle:{ file: "unarmed-idle.glb",         durationS: 1.0 },
  gsDeath:    { file: "great-sword-death.glb",    durationS: 1.0 },
};

/** Curated timestamps (seconds). Provisional until Task 7's screenshot
 *  pass; the STRUCTURE is what the tests pin down. */
export const POSE_T = {
  slash: { windupLow: 0.10, windupHigh: 0.25, still: 0.35, travelling: 0.50, delivered: 0.65, recoveryStart: 0.70, recoveryEnd: 0.95 },
  stab:  { windupLow: 0.10, windupHigh: 0.20, still: 0.30, travelling: 0.45, delivered: 0.60, recoveryStart: 0.65, recoveryEnd: 0.90 },
  block: { rise: 0.10, formed: 0.30 },
  walk:  { start: 0.0, end: 0.95 },
  dodge: { start: 0.05, end: 0.85 },
  impact:{ start: 0.05, end: 0.60 },
  death: { start: 0.0, end: 0.95 },
  bindContact: 0.50,          // the fighter's frozen slash contact
  bindCounterpartBlock: 0.30, // the static counterpart's formed block
};

export interface PosePick {
  clip: ClipName;
  clipTime: number;
  mode: "held" | "loop";
}

/** The static bind counterpart's pose: a formed block meeting the slash. */
export const BIND_COUNTERPART: PosePick = { clip: "gsBlock", clipTime: POSE_T.bindCounterpartBlock, mode: "held" };

const lerp = (a: number, b: number, f: number): number => a + (b - a) * Math.min(1, Math.max(0, f));
const loop = (clip: ClipName, timeMs: number): PosePick =>
  ({ clip, clipTime: (timeMs / 1000) % CLIPS[clip].durationS, mode: "loop" });

export function pickPose(d: Duelist, timeMs: number): PosePick {
  const s = d.state;
  const w = LONGSWORD;
  switch (s.kind) {
    case "ready": return loop("gsIdle", timeMs);
    case "unarmed": return loop("unarmedIdle", timeMs);
    case "step": return { clip: "gsWalk", clipTime: lerp(POSE_T.walk.start, POSE_T.walk.end, s.t / w.stepDurationMs), mode: "held" };
    case "void": return { clip: "dodgeBack", clipTime: lerp(POSE_T.dodge.start, POSE_T.dodge.end, s.t / w.voidDurationMs), mode: "held" };
    case "hitstun": return { clip: "gsImpact", clipTime: lerp(POSE_T.impact.start, POSE_T.impact.end, s.t / HIT_STUN_MS), mode: "held" };
    case "dead": return { clip: "gsDeath", clipTime: lerp(POSE_T.death.start, POSE_T.death.end, s.t / DEATH_ANIM_MS), mode: "held" };
    case "parry": return { clip: "gsBlock", clipTime: s.t < PARRY_FORM_MS ? POSE_T.block.rise : POSE_T.block.formed, mode: "held" };
    case "bind": return { clip: "gsSlash", clipTime: POSE_T.bindContact, mode: "held" };
    case "attack": {
      const t = s.attack === "cut" ? POSE_T.slash : POSE_T.stab;
      const clip = s.attack === "cut" ? "gsSlash" as const : "stab" as const;
      const tl = s.timeline;
      switch (s.phase) {
        case "windup": {
          const clipTime =
            s.elapsedMs < (tl.riseStart + tl.riseEnd) / 2 ? t.windupLow :
            s.elapsedMs < tl.riseEnd ? t.windupHigh :
            t.still;
          return { clip, clipTime, mode: "held" };
        }
        case "strike":
          return { clip, clipTime: s.elapsedMs <= tl.parryableUntil ? t.travelling : t.delivered, mode: "held" };
        case "recovery":
          return {
            clip,
            clipTime: lerp(t.recoveryStart, t.recoveryEnd, (s.elapsedMs - tl.recoveryStart) / (tl.recoveryEnd - tl.recoveryStart)),
            mode: "held",
          };
      }
    }
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/duel-poses.test.ts` then `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add 07-rendertest/src/duel/poses.ts 07-rendertest/test/duel-poses.test.ts
git commit -m "feat(rendertest): pickPose with curated timestamp table"
```

---

### Task 4: clip acquisition - Mixamo fetch, conversion, real durations

This task blocks on the user logging into mixamo.com. Announce the login
handoff clearly and wait.

**Files:**
- Create: `tools/mixamo-fetch.mjs`
- Create: `public/models/clips/*.glb` (9 files)
- Modify: `src/duel/poses.ts` (real `durationS` values)

**Interfaces:**
- Consumes: the `CLIPS` table's file names from Task 3.
- Produces: the 9 committed GLBs whose animation names Task 5 loads; real durations in `CLIPS`.

- [ ] **Step 1: Open Mixamo and hand over for login**

Try the chrome-devtools MCP first (`new_page` on https://www.mixamo.com). If its profile is locked by a sibling session, launch a VISIBLE (not headless) own Chrome on a fresh CDP port with a scratchpad profile:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9412 --user-data-dir="$SCRATCH/mixamo-profile" \
  --no-first-run "https://www.mixamo.com" &
```

Tell the user: "Chrome is open on mixamo.com - please log in (and solve any captcha). Say done when you see the character/animations screen." WAIT for their reply. Never touch credential fields.

- [ ] **Step 2: Observe one manual export to learn the API shape**

Ask the user to download ONE animation manually (Great Sword Idle, settings: Format FBX Binary, Skin Without Skin, and In Place checked if shown). While they do, capture the network traffic via CDP (Network domain) or the devtools MCP's network request list. Record: the export POST endpoint and body (product gms_hash, character_id), the auth header source (localStorage `access_token` or cookie), and the monitor/poll endpoint that returns the download URL.

- [ ] **Step 3: Write tools/mixamo-fetch.mjs from the observed shape**

The script (structure below; fill the endpoint details exactly as observed in Step 2):

```js
// tools/mixamo-fetch.mjs
// Downloads Mixamo animations as without-skin FBX via the session's own
// export API. Convenience only - the supported fallback is clicking
// Download in the Mixamo UI with the same settings. Usage:
//   node tools/mixamo-fetch.mjs <bearer-token> <character-id> <outdir>
// Token + character id come from the logged-in session (Step 2 records
// where). For each NAME in the list: search the product, fetch its
// gms_hash with character_id, POST the export, poll the monitor URL
// until status "completed", then download job_result to <outdir>/NAME.fbx.
const NAMES = [
  "Great Sword Idle", "Great Sword Walk", "Great Sword Slash",
  "Great Sword Blocking", "Great Sword Impact", "Standing Dodge Backward",
  "Stabbing", "Unarmed Idle", "Two Handed Sword Death",
];
// Endpoint defaults (community-documented shape - VERIFY each against
// the Step 2 observation and correct where they differ):
//   search:  GET https://www.mixamo.com/api/v1/products?query=<name>&type=Motion&page=1&limit=24  (X-Api-Key: mixamo2)
//   details: GET https://www.mixamo.com/api/v1/products/<id>?similar=0&character_id=<charId>      (Bearer)
//   export:  POST https://www.mixamo.com/api/v1/animations/export
//            body { character_id, product_name, type: "Motion", gms_hash: [<details.gms_hash with params filled, inplace true where offered>] }  (Bearer)
//   monitor: GET https://www.mixamo.com/api/v1/characters/<charId>/monitor -> { status, job_result } (Bearer)
// 2s poll, 60s timeout per clip, fail loudly per clip and continue with
// the rest; anything unresolvable falls back to manual UI download.
```

Run it. If the API misbehaves in any way, fall back: ask the user to download the remaining clips manually with the same settings and continue from Downloads.

- [ ] **Step 4: Convert all FBX to GLB and measure durations**

```bash
cd "$SCRATCH" && npm install fbx2gltf@0.9.7-p1 --no-save
for f in <outdir>/*.fbx; do
  ./node_modules/fbx2gltf/bin/Darwin/FBX2glTF --binary --input "$f" --output "<kebab-name>"
done
```

Name outputs exactly as the `CLIPS` table's files: `great-sword-idle.glb`, `great-sword-walk.glb`, `great-sword-slash.glb`, `great-sword-blocking.glb`, `great-sword-impact.glb`, `dodge-backward.glb`, `stabbing.glb`, `unarmed-idle.glb`, `great-sword-death.glb`. Copy to `public/models/clips/`. Then read each GLB's animation duration (max input accessor max over the animation's samplers, same GLB-JSON parsing used for the knight) and write the real `durationS` values into `CLIPS` in poses.ts. Also record each GLB's animation NAME (FBX2glTF usually emits one animation per file, often named like `mixamo.com`) - Task 5 needs the convention; if every file uses one animation, rig.ts takes `animations[0]` and the name does not matter.

Check root motion: for `dodge-backward.glb` and `great-sword-walk.glb`, inspect whether the hips/root track translates in x/z. If In Place was unavailable and it does, note it - rig.ts (Task 5) zeroes the root x/z translation track defensively either way.

- [ ] **Step 5: Verify tests still pass, commit**

Run: `npm test && npm run build`
Expected: PASS (poses tests use the table, so real durations keep them green; the bind/duration test now proves durations are real).

```bash
git add 07-rendertest/tools/mixamo-fetch.mjs 07-rendertest/public/models/clips 07-rendertest/src/duel/poses.ts
git commit -m "feat(rendertest): nine Mixamo clips fetched, converted, durations measured"
```

---

### Task 5: sword prop + rig.ts

**Files:**
- Create: `public/models/Sword.glb` (converted from the Quaternius pack)
- Create: `src/duel/rig.ts`
- Modify: `src/character.ts` (extract `normalizeToHeight` helper)

**Interfaces:**
- Consumes: `CLIPS`, `ClipName`, `PosePick` from `./poses`.
- Produces:
  - `normalizeToHeight(obj: THREE.Object3D, targetM: number): void` exported from `../character`
  - `interface RigSample { activeClip: string | null; clipTime: number; paused: boolean; weights: Record<string, number>; boneLocal: Record<string, number[]>; rootWorldX: number; tipWorldX: number; leftPalmToGripCm: number; lowestFootY: number }`
  - `interface DuelRig { root: THREE.Group; applyPose(p: PosePick): void; setSwordVisible(v: boolean): void; sample(): RigSample }`
  - `loadDuelRig(baseUrl: string): Promise<DuelRig>`
  - Calibration constants exported for Task 8: `SWORD_SOCKET_POS`, `SWORD_SOCKET_EULER`, `BLADE_LENGTH_SCALE`, `PALM_OFFSET`, `GRIP_A`, `GRIP_B`, `TIP_LOCAL`.

- [ ] **Step 1: Convert the sword**

```bash
cd "$SCRATCH"
./node_modules/fbx2gltf/bin/Darwin/FBX2glTF --binary \
  --input "/Users/janis.kirsteins/Downloads/Knight Character Animated by Quaternius/FBX/Sword.fbx" \
  --output sword
cp sword.glb /Users/janis.kirsteins/Projects/prototypes/07-rendertest/public/models/Sword.glb
```

Inspect its GLB JSON for mesh bounds to learn the blade axis (longest dimension) and record it in a comment in rig.ts.

- [ ] **Step 2: Extract normalizeToHeight in character.ts**

Replace the inline normalization in `loadCharacter` with a call to a new exported helper (same math, no behavior change):

```ts
/** Scales obj so its bounding height is targetM and rests its feet on y = 0. */
export function normalizeToHeight(obj: THREE.Object3D, targetM: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const scale = targetM / (box.max.y - box.min.y);
  obj.scale.setScalar(scale);
  obj.position.y = -box.min.y * scale;
}
```

Run `npm test && npm run build` - the walk demo path must stay green.

- [ ] **Step 3: Write rig.ts**

```ts
// src/duel/rig.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalizeToHeight } from "../character";
import { CLIPS } from "./poses";
import type { ClipName, PosePick } from "./poses";

/** 06's fighter is a ~175 cm person; duel mode normalizes to match. */
const FIGHTER_HEIGHT_M = 1.75;

// Calibration constants - Task 8 solves the real values; these are the
// starting guesses. The sword's blade axis is <recorded in Step 1>.
export const SWORD_SOCKET_POS = new THREE.Vector3(0, 0.05, 0.02);
export const SWORD_SOCKET_EULER = new THREE.Euler(Math.PI / 2, 0, 0);
export const BLADE_LENGTH_SCALE = 1.0;
/** Wrist-origin to palm-center offset, meters, in hand-bone local space. */
export const PALM_OFFSET = new THREE.Vector3(0, 0.08, 0.01);
/** Grip segment ends and blade tip, sword-local, BEFORE blade scaling. */
export const GRIP_A = new THREE.Vector3(0, 0.02, 0);
export const GRIP_B = new THREE.Vector3(0, 0.22, 0);
export const TIP_LOCAL = new THREE.Vector3(0, 1.0, 0);

export interface RigSample {
  activeClip: string | null;
  clipTime: number;
  paused: boolean;
  weights: Record<string, number>;
  boneLocal: Record<string, number[]>;
  rootWorldX: number;
  tipWorldX: number;
  leftPalmToGripCm: number;
  lowestFootY: number;
}

export interface DuelRig {
  root: THREE.Group;
  applyPose(p: PosePick): void;
  setSwordVisible(v: boolean): void;
  sample(): RigSample;
}

/** Zeroes x/z of the root translation track so the engine alone moves
 *  the fighter (the spec's in-place rule), keeping y (crouch/jump). */
function stripRootMotion(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position")) continue;
    if (!/Hips/.test(track.name)) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
  }
}

export async function loadDuelRig(baseUrl: string): Promise<DuelRig> {
  const loader = new GLTFLoader();
  const xbot = await loader.loadAsync(`${baseUrl}models/Xbot.glb`);
  const inner = xbot.scene;
  inner.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      o.material.color.set(o.material.name.includes("Joints") ? 0x3a404c : 0xb8bec8);
    }
  });
  normalizeToHeight(inner, FIGHTER_HEIGHT_M);
  const root = new THREE.Group();
  root.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  const actions = new Map<ClipName, THREE.AnimationAction>();
  for (const [name, meta] of Object.entries(CLIPS) as [ClipName, { file: string }][]) {
    const gltf = await loader.loadAsync(`${baseUrl}models/clips/${meta.file}`);
    const clip = gltf.animations[0];
    if (!clip) throw new Error(`${meta.file} has no animation`);
    stripRootMotion(clip);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
    actions.set(name, action);
  }

  // Sword prop + markers on the right hand.
  const swordGltf = await loader.loadAsync(`${baseUrl}models/Sword.glb`);
  const swordGroup = new THREE.Group();
  swordGroup.add(swordGltf.scene);
  swordGltf.scene.scale.y *= BLADE_LENGTH_SCALE; // blade axis per Step 1
  const tip = new THREE.Object3D(); tip.position.copy(TIP_LOCAL).multiplyScalar(BLADE_LENGTH_SCALE); swordGroup.add(tip);
  const gripA = new THREE.Object3D(); gripA.position.copy(GRIP_A); swordGroup.add(gripA);
  const gripB = new THREE.Object3D(); gripB.position.copy(GRIP_B); swordGroup.add(gripB);
  swordGroup.position.copy(SWORD_SOCKET_POS);
  swordGroup.setRotationFromEuler(SWORD_SOCKET_EULER);

  let rightHand: THREE.Object3D | null = null;
  let leftHand: THREE.Object3D | null = null;
  const bones: THREE.Bone[] = [];
  const feet: THREE.Object3D[] = [];
  inner.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    if (/RightHand$/.test(o.name)) rightHand = o;
    if (/LeftHand$/.test(o.name)) leftHand = o;
    if (/Foot$|ToeBase$/.test(o.name)) feet.push(o);
  });
  if (!rightHand || !leftHand) throw new Error("hand bones not found");
  rightHand.add(swordGroup);
  const leftPalm = new THREE.Object3D();
  leftPalm.position.copy(PALM_OFFSET);
  leftHand.add(leftPalm);

  let current: { pick: PosePick } | null = null;

  return {
    root,
    applyPose(p: PosePick): void {
      // The hard-reset rule: exactly one action at weight 1, every
      // action paused, time set explicitly, advanced with update(0) so
      // frame dt can never move a pose.
      for (const [name, action] of actions) {
        action.paused = true;
        action.setEffectiveWeight(name === p.clip ? 1 : 0);
        if (name === p.clip) action.time = p.clipTime;
      }
      mixer.update(0);
      current = { pick: p };
    },
    setSwordVisible(v: boolean): void { swordGroup.visible = v; },
    sample(): RigSample {
      root.updateWorldMatrix(true, true);
      const world = new THREE.Vector3();
      const tipW = tip.getWorldPosition(new THREE.Vector3());
      const palmW = leftPalm.getWorldPosition(new THREE.Vector3());
      const a = gripA.getWorldPosition(new THREE.Vector3());
      const b = gripB.getWorldPosition(new THREE.Vector3());
      const seg = b.clone().sub(a);
      const t = Math.min(1, Math.max(0, palmW.clone().sub(a).dot(seg) / seg.lengthSq()));
      const nearest = a.clone().addScaledVector(seg, t);
      const boneLocal: Record<string, number[]> = {};
      for (const bone of bones) {
        boneLocal[bone.name] = [
          bone.position.x, bone.position.y, bone.position.z,
          bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w,
          bone.scale.x, bone.scale.y, bone.scale.z,
        ];
      }
      const weights: Record<string, number> = {};
      for (const [name, action] of actions) weights[name] = action.getEffectiveWeight();
      return {
        activeClip: current?.pick.clip ?? null,
        clipTime: current?.pick.clipTime ?? 0,
        paused: [...actions.values()].every((x) => x.paused),
        weights,
        boneLocal,
        rootWorldX: root.getWorldPosition(world).x,
        tipWorldX: tipW.x,
        leftPalmToGripCm: palmW.distanceTo(nearest) * 100,
        lowestFootY: Math.min(...feet.map((f) => f.getWorldPosition(new THREE.Vector3()).y)),
      };
    },
  };
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run build && cd .. && npx biome lint 07-rendertest/src`
Expected: clean. (rig.ts has no unit tests - it is three-bound; the e2e suite is its test.)

- [ ] **Step 5: Commit**

```bash
git add 07-rendertest/public/models/Sword.glb 07-rendertest/src/duel/rig.ts 07-rendertest/src/character.ts
git commit -m "feat(rendertest): duel rig - hard-reset pose application, sword socket, markers"
```

---

### Task 6: main-duel.ts - the duel page

**Files:**
- Create: `src/duel/main-duel.ts`
- Modify: `src/main.ts` (mode branch)
- Modify: `index.html` (nothing structural - the status div is reused)

**Interfaces:**
- Consumes: everything above; `createStage` from `../scene`.
- Produces: `window.__duel` e2e hook: `{ duelist, pick(): PosePick, sample(): RigSample, timeline(): AttackTimeline | null, paused: boolean, setPaused(v: boolean): void, step(ms: number): void }`.

- [ ] **Step 1: Add the mode branch in main.ts**

Wrap the existing walk-demo code in `function runWalkDemo(): void { ... }` (verbatim move, no edits inside), then at the bottom:

```ts
if (new URLSearchParams(location.search).get("mode") === "duel") {
  import("./duel/main-duel").then((m) => m.runDuel());
} else {
  runWalkDemo();
}
```

- [ ] **Step 2: Write main-duel.ts**

```ts
// src/duel/main-duel.ts
import * as THREE from "three";
import { createStage } from "../scene";
import { createDuelist, handleEvent, tick } from "./states";
import { BIND_COUNTERPART, pickPose } from "./poses";
import { loadDuelRig } from "./rig";
import { LONGSWORD } from "./timings";
import type { DuelEvent } from "./states";

const CM_TO_M = 0.01;

const KEYS: Record<string, DuelEvent> = {
  KeyD: "stepFwd", KeyA: "stepBack", KeyS: "void",
  KeyJ: "cut", KeyK: "thrust",
  KeyH: "hitstun", KeyB: "bind", KeyU: "unarmed", KeyX: "death",
  KeyR: "reset", KeyF: "flip",
};

export async function runDuel(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const status = document.getElementById("status") as HTMLElement;
  const stage = createStage(canvas);
  const duelist = createDuelist();

  const rig = await loadDuelRig(import.meta.env.BASE_URL);
  stage.scene.add(rig.root);

  // The bind's static counterpart: same rig type, mirrored, frozen.
  const counterpart = await loadDuelRig(import.meta.env.BASE_URL);
  counterpart.applyPose(BIND_COUNTERPART);
  counterpart.root.visible = false;
  stage.scene.add(counterpart.root);

  // Reach debug line: a thin box on the floor at the weapon's reach.
  const reachLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.002, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xe6c229 }),
  );
  stage.scene.add(reachLine);

  status.textContent =
    "A/D step S void J cut K thrust L parry(hold) H hit B bind U unarmed X death F flip R reset Space pause";

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") { paused = !paused; return; }
    if (e.code === "KeyL") { handleEvent(duelist, "parryDown"); return; }
    const ev = KEYS[e.code];
    if (ev) handleEvent(duelist, ev);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyL") handleEvent(duelist, "parryUp");
  });

  let paused = false;
  let simTimeMs = 0;
  let lastPick = pickPose(duelist, 0);

  const frame = (dtMs: number): void => {
    simTimeMs += dtMs;
    tick(duelist, dtMs);
    lastPick = pickPose(duelist, simTimeMs);
    rig.applyPose(lastPick);
    rig.root.position.x = duelist.x * CM_TO_M;
    rig.root.rotation.y = (duelist.facing * Math.PI) / 2;
    const bind = duelist.state.kind === "bind";
    counterpart.root.visible = bind;
    if (bind) {
      // Face-to-face at blade contact: reach apart, mirrored facing.
      counterpart.root.position.x = (duelist.x + duelist.facing * LONGSWORD.reachCm) * CM_TO_M;
      counterpart.root.rotation.y = (-duelist.facing * Math.PI) / 2;
    }
    reachLine.position.set((duelist.x + duelist.facing * LONGSWORD.reachCm) * CM_TO_M, 0.001, 0);
    stage.renderer.render(stage.scene, stage.camera);
  };

  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta() * 1000, 100);
    if (!paused) frame(dt);
    else stage.renderer.render(stage.scene, stage.camera);
  });

  // e2e hook: deterministic stepping while paused makes mark-exact
  // assertions possible (06's Space/. pattern).
  Object.assign(window, {
    __duel: {
      duelist,
      pick: () => lastPick,
      sample: () => rig.sample(),
      timeline: () => (duelist.state.kind === "attack" ? duelist.state.timeline : null),
      get paused() { return paused; },
      setPaused(v: boolean) { paused = v; },
      step(ms: number) { frame(ms); },
    },
  });
}
```

- [ ] **Step 3: Build, typecheck, smoke-test via CDP**

Run: `npx tsc --noEmit && npm run build`, start the dev server, open `?mode=duel` in headless Chrome (the cdp.mjs fallback driver), and verify: status line present, `window.__duel` exists, `__duel.step(100)` advances, a screenshot shows the fighter with sword on the floor band.

- [ ] **Step 4: Run all tests, commit**

```bash
npm test
git add 07-rendertest/src/duel/main-duel.ts 07-rendertest/src/main.ts
git commit -m "feat(rendertest): duel mode page - keys, bind counterpart, reach line, e2e hook"
```

---

### Task 7: timestamp curation from screenshots

**Files:**
- Modify: `src/duel/poses.ts` (POSE_T values only)

**Interfaces:** unchanged - values only.

- [ ] **Step 1: Screenshot every pose**

With the dev server and headless CDP driver: for each entry in POSE_T, drive the state there deterministically (`__duel.setPaused(true)` then key event + `__duel.step(ms)` to the exact mark) and screenshot. Cover: idle, both windup poses + still, travelling, delivered (cut and thrust), block rise + formed, three walk scrub points, dodge scrub, impact scrub, death end, bind scene (both rigs), unarmed idle.

- [ ] **Step 2: Curate**

Examine each screenshot against 06's readability contracts: windup low/high must read as a rising telegraph, the still beat as held readiness, travelling as the blade en route, delivered as fully committed, block formed as a closed line, death end as prone. Adjust POSE_T timestamps and re-screenshot until each pose reads. Record the final values with a one-line comment per non-obvious choice (what the pose shows, not its history).

- [ ] **Step 3: Tests, commit**

```bash
npm test
git add 07-rendertest/src/duel/poses.ts
git commit -m "feat(rendertest): curated pose timestamps from screenshot pass"
```

---

### Task 8: calibration - socket, blade scale, reach, grip

**Files:**
- Modify: `src/duel/rig.ts` (calibration constants only)

- [ ] **Step 1: Socket and palm calibration**

Screenshot the idle and formed-block poses zoomed on the hands. Adjust `SWORD_SOCKET_POS` / `SWORD_SOCKET_EULER` until the hilt lies in the right palm across poses; adjust `PALM_OFFSET` until the debug palm dot sits at the palm center; set `GRIP_A`/`GRIP_B` to the hilt's visible grip ends and `TIP_LOCAL` to the blade tip (confirm with the debug dots).

- [ ] **Step 2: Solve the blade scale for reach**

At the cut's delivered pose (paused, stepped to elapsedMs 891): read `sample().tipWorldX - sample().rootWorldX`, times facing. Solve `BLADE_LENGTH_SCALE` = current scale x (2.00 / measured forward reach), reload, re-measure. Iterate until within 2 cm. Repeat the measurement at the thrust's delivered pose (631) - the SAME scale must satisfy both within 2 cm; if it cannot, re-curate whichever delivered timestamp is over-extended (Task 7's loop) and re-solve.

- [ ] **Step 3: The consequence check**

Screenshot both delivered poses full-frame. The sword must read as a longsword: total length in the 1.0-1.4 m band against the 1.75 m fighter (measure in-world: tip to pommel distance from the markers), neither stubby nor lance-like to the eye. If it fails, re-curate the delivered timestamps and re-solve, per the spec's loop.

- [ ] **Step 4: Grip gate**

At every curated non-unarmed pose, read `sample().leftPalmToGripCm`. Gate: within 10 cm at attack and parry poses. Screenshot-check for a floating off-hand. If a pose fails, re-curate its timestamp; if the family fundamentally separates hands, record it as a finding.

- [ ] **Step 5: Record and commit**

Write the final numbers (timestamps, scale, measured reach both attacks, worst grip distance) into comments beside the constants, run `npm test && npm run build`, commit:

```bash
git add 07-rendertest/src/duel/rig.ts 07-rendertest/src/duel/poses.ts
git commit -m "feat(rendertest): reach and grip calibration - tip at 200cm, grip within gate"
```

---

### Task 9: full e2e suite, report, README

**Files:**
- Create: `tools/duel-e2e.mjs`
- Create: `docs/superpowers/2026-08-05-combat-anim-poc-report.md`
- Modify: `README.md`

- [ ] **Step 1: Write tools/duel-e2e.mjs**

A node CDP script (same driver pattern as the walk demo's verification) that, against a running dev server URL passed as argv:

1. Opens `?mode=duel`, waits for `window.__duel`.
2. `setPaused(true)`; for each state/mark in a table (idle at 0; cut at 299/301/650/890/891/1200; thrust at 630/631; parry at 100/250; hitstun 200; void 160; step 130; bind; unarmed; death 900): dispatch the key event, `step()` to the mark, then assert `sample()` vs `pick()`: activeClip and clipTime match pickPose's table values, `paused` true, exactly one weight is 1 and the rest 0.
3. History independence: reach the cut-delivered pick via (ready -> cut) and via (hitstun -> reset -> cut); compare `boneLocal` per bone within 1e-4; likewise for idle at timeMs 0 after two different histories.
4. Ground contact per the spec's table: `lowestFootY` within 0.05 of 0 for idle/windup/strike/recovery/parry/bind/unarmed; death final within 0.15 (prone); void sampled mid-hop (160) unconstrained but at 321 back within 0.05.
5. Reach: forward reach within 2 cm of 2.00 m at both delivered poses. Grip: `leftPalmToGripCm <= 10` at attack/parry poses.
6. Foot drift, measured not gated: during a step and a void (unpaused,
   real time), sample a foot bone's world x every 40 ms as in the walk
   demo's drift measurement; report the stance-phase drift m/s for the
   report's "measured, not gated" section.
7. Screenshots every asserted pose to a directory argument.
8. Console: collect errors/exceptions on a fresh reload; assert empty.
9. Prints PASS/FAIL per assertion and exits non-zero on any failure.

- [ ] **Step 2: Run it, fix, re-run until green**

Run: `node tools/duel-e2e.mjs http://127.0.0.1:<port>/prototypes/07/ <shots-dir>`
Expected: all assertions PASS. Investigate any failure with the systematic-debugging skill before touching code.

- [ ] **Step 3: Write the report**

`docs/superpowers/2026-08-05-combat-anim-poc-report.md`: the verdict on the spec's question (do curated mocap timestamps read as combat phases), the calibration numbers, the grip findings, foot-drift measurements for step/void (measured, not gated), any clips that fought the approach, and embedded references to the screenshot evidence paths.

- [ ] **Step 4: README + the human gate**

Add a Duel mode section to README.md: URL, key table, what each state should look like. End the turn with the repo-convention closing: what to play and what would look wrong (windup stillness = telegraph, travelling-to-delivered swap = window closing, bind = two blades in pressure, feet planted, sword in both hands).

- [ ] **Step 5: Final gates and commit**

```bash
npm test && npm run build && cd .. && npx biome lint 07-rendertest/src 07-rendertest/test 07-rendertest/tools
git add 07-rendertest/tools/duel-e2e.mjs 07-rendertest/docs/superpowers/2026-08-05-combat-anim-poc-report.md 07-rendertest/README.md
git commit -m "feat(rendertest): duel e2e suite green, PoC report"
```
