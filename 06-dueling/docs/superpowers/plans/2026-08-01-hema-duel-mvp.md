# HEMA Duel MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome-playable 2D HEMA fencing duel (longsword vs rapier, player vs AI dummy with modes) in `06-dueling`, per the approved spec at `06-dueling/docs/superpowers/specs/2026-08-01-hema-duel-mvp-design.md`.

**Architecture:** Pure TypeScript combat core (fixed 60Hz tick, deterministic, no DOM) + canvas 2D renderer with explicit per-animation sprite metadata. Vite + vitest, zero runtime dependencies.

**Tech Stack:** Vite ^5.4.0, TypeScript ^5.5.4, vitest ^2.0.5 (same as sibling prototypes). Canvas 2D. No other deps.

## Global Constraints

- Working directory for all commands: `/Users/janis.kirsteins/Projects/prototypes/06-dueling` unless stated otherwise.
- `vite.config.ts` must set `base: "/prototypes/06/"`.
- The landing page link in `.github/pages-index.html` is added in the same commit that scaffolds the prototype (repo rule).
- Zero runtime dependencies. devDependencies only: typescript, vite, vitest.
- All game/UI/log strings use only keyboard-typable characters: `->` not unicode arrows, `-` not em dash, `...` not ellipsis.
- Git: stage with explicit paths scoped to `06-dueling/` (plus `.github/pages-index.html` in Task 1). Never `git add -A`. The repo pre-commit hook runs biome lint + tsc; write lint-clean code (no unused vars, no `any`).
- `npm test` must stay fast (< a few seconds).
- Numeric tuning deviations from the spec tables (spec says "tuning expected"; these make the counter-window arithmetic hold and are asserted by tests in Task 3): `whiffRecoveryFactor` longsword 2.0, rapier 3.0; `parriedPenalty` longsword 260, rapier 360; pre-tempo phase applies only to AI-initiated attacks (tell layer), player attacks start at windup.

---

### Task 1: Scaffold the Vite project + landing page link

**Files:**
- Create: `06-dueling/package.json`, `06-dueling/tsconfig.json`, `06-dueling/vite.config.ts`, `06-dueling/index.html`, `06-dueling/src/main.ts`, `06-dueling/test/smoke.test.ts`
- Modify: `.github/pages-index.html` (repo root)

**Interfaces:**
- Produces: a project where `npm test` and `npm run build` pass; later tasks add files under `src/` and `test/`.

- [ ] **Step 1: Write package.json, tsconfig.json, vite.config.ts**

`package.json`:
```json
{
  "name": "dueling",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/prototypes/06/",
});
```

- [ ] **Step 2: Write index.html and stub main.ts**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>06 - Dueling</title>
    <style>
      html, body { margin: 0; height: 100%; background: #14161a; color: #cfd3da;
        font-family: ui-monospace, Menlo, monospace; }
      #wrap { display: flex; align-items: center; justify-content: center; height: 100%; }
      canvas { image-rendering: pixelated; background: #1b1e24; }
    </style>
  </head>
  <body>
    <div id="wrap"><canvas id="game" width="960" height="540"></canvas></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (stub, replaced in Task 12):
```ts
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (ctx) {
  ctx.fillStyle = "#cfd3da";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText("06-dueling: scaffold OK", 20, 30);
}
```

`test/smoke.test.ts`:
```ts
import { expect, test } from "vitest";

test("scaffold smoke", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 3: Add the landing page link**

In `.github/pages-index.html`, after the `04/` line (there is no 05 entry; 05-advcoffin is an empty pre-existing directory, leave it alone), add:
```html
      <li><a href="./06/">06 - Dueling, a HEMA fencing duel</a></li>
```

- [ ] **Step 4: Install and verify**

Run: `cd /Users/janis.kirsteins/Projects/prototypes/06-dueling && npm install && npm test && npm run build`
Expected: install OK, 1 test passes, build emits `dist/`.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/package.json 06-dueling/package-lock.json 06-dueling/tsconfig.json \
  06-dueling/vite.config.ts 06-dueling/index.html 06-dueling/src/main.ts \
  06-dueling/test/smoke.test.ts .github/pages-index.html
git commit -m "feat(dueling): scaffold 06-dueling prototype and link it from the landing page"
```

---

### Task 2: Sprite assets + sheet metadata + PNG dimension test

**Files:**
- Create: `06-dueling/public/sprites/*.png` (7 sheets, copied + renamed), `06-dueling/src/render/sheets.ts`, `06-dueling/test/sheets.test.ts`

**Interfaces:**
- Produces: `SheetName` union, `SheetMeta` interface, `SHEETS: Record<SheetName, SheetMeta>` from `src/render/sheets.ts`. Consumed by Tasks 11 and 12.

- [ ] **Step 1: Copy and rename the sheets**

```bash
cd /Users/janis.kirsteins/Projects/prototypes/06-dueling
mkdir -p public/sprites
T="/Users/janis.kirsteins/Downloads/2D-Pixel-Art-Character-Template"
cp "$T/Sword Idle/Player Sword Idle 48x48.png"      public/sprites/sword-idle.png
cp "$T/Sword Run/Player Sword Run 48x48.png"        public/sprites/sword-run.png
cp "$T/Sword Attack/player sword atk 64x64.png"     public/sprites/sword-attack.png
cp "$T/Sword Stab/Player Sword Stab 96x48.png"      public/sprites/sword-stab.png
cp "$T/Roll/Player Roll 48x48.png"                  public/sprites/roll.png
cp "$T/Hurt-Damaged/Player Hurt 48x48.png"          public/sprites/hurt.png
cp "$T/Death/Player Death 64x64.png"                public/sprites/death.png
```
Note: `death.png` comes from a file NAMED "64x64" that is really 480x48 (10 frames of 48x48). The metadata below records the truth; the test in this task enforces it.

- [ ] **Step 2: Write the failing test**

`test/sheets.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SHEETS } from "../src/render/sheets";

function readPngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error(`not a PNG: ${path}`);
  }
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error(`no IHDR: ${path}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("sheet metadata matches the real PNG files", () => {
  for (const [name, meta] of Object.entries(SHEETS)) {
    test(`${name} (${meta.file})`, () => {
      const { width, height } = readPngSize(join(__dirname, "..", "public", "sprites", meta.file));
      expect(height).toBe(meta.frameH);
      expect(width).toBe(meta.frameW * meta.frames);
      expect(meta.feetY).toBeLessThanOrEqual(meta.frameH);
      expect(meta.originX).toBeLessThanOrEqual(meta.frameW);
    });
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/render/sheets`.

- [ ] **Step 4: Write sheets.ts**

`src/render/sheets.ts`:
```ts
export type SheetName =
  | "swordIdle" | "swordRun" | "swordAttack" | "swordStab"
  | "roll" | "hurt" | "death";

export interface SheetMeta {
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** y of the feet inside a frame, sheet pixels. Anchors the character to the floor. */
  feetY: number;
  /** x of the body center inside a frame when facing right. */
  originX: number;
}

/**
 * Frame sizes were measured from the real PNGs, not the filenames
 * (the Death sheet is named 64x64 but contains 48x48 frames).
 * feetY/originX start as estimates and are corrected during the
 * Chrome animation verification pass.
 */
export const SHEETS: Record<SheetName, SheetMeta> = {
  swordIdle:   { file: "sword-idle.png",   frameW: 48, frameH: 48, frames: 10, feetY: 44, originX: 24 },
  swordRun:    { file: "sword-run.png",    frameW: 48, frameH: 48, frames: 8,  feetY: 44, originX: 24 },
  swordAttack: { file: "sword-attack.png", frameW: 64, frameH: 64, frames: 6,  feetY: 60, originX: 28 },
  swordStab:   { file: "sword-stab.png",   frameW: 96, frameH: 48, frames: 7,  feetY: 44, originX: 28 },
  roll:        { file: "roll.png",         frameW: 48, frameH: 48, frames: 7,  feetY: 44, originX: 24 },
  hurt:        { file: "hurt.png",         frameW: 48, frameH: 48, frames: 4,  feetY: 44, originX: 24 },
  death:       { file: "death.png",        frameW: 48, frameH: 48, frames: 10, feetY: 44, originX: 24 },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (7 sheet tests + smoke).

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/public/sprites 06-dueling/src/render/sheets.ts 06-dueling/test/sheets.test.ts
git commit -m "feat(dueling): sprite sheets with asserted per-animation metadata"
```

---

### Task 3: Combat types + weapon profiles + balance invariants

**Files:**
- Create: `06-dueling/src/combat/types.ts`, `06-dueling/src/combat/weapons.ts`, `06-dueling/test/weapons.test.ts`

**Interfaces:**
- Produces (from `src/combat/types.ts`):
  - `type WeaponId = "longsword" | "rapier"`
  - `type AttackKind = "cut" | "thrust"`
  - `type AttackPhase = "pretempo" | "windup" | "beat" | "strike" | "recovery"`
  - `type Zone = "out" | "wide" | "narrow"`
  - `type Intent = "advance" | "retreat" | "void" | "cut" | "thrust" | "parry"`
  - `interface AttackTimings { windup: number; beat: number; strike: number; recovery: number }`
  - `interface WeaponProfile` (fields below)
- Produces (from `src/combat/weapons.ts`): `WEAPONS: Record<WeaponId, WeaponProfile>`, `counterTime(w: WeaponProfile): number`.

- [ ] **Step 1: Write the failing test**

`test/weapons.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { WEAPONS, counterTime } from "../src/combat/weapons";
import type { AttackKind } from "../src/combat/types";

const KINDS: AttackKind[] = ["cut", "thrust"];

describe("weapon identity", () => {
  test("rapier outranges and outpaces the longsword", () => {
    expect(WEAPONS.rapier.reach).toBeGreaterThan(WEAPONS.longsword.reach);
    expect(WEAPONS.rapier.animSpeed).toBeGreaterThan(WEAPONS.longsword.animSpeed);
    expect(WEAPONS.rapier.stepDuration).toBeLessThan(WEAPONS.longsword.stepDuration);
    expect(WEAPONS.rapier.attacks.thrust.windup).toBeLessThan(WEAPONS.longsword.attacks.thrust.windup);
  });
  test("rapier cut is a poor option vs its thrust", () => {
    expect(WEAPONS.rapier.attacks.cut.windup).toBeGreaterThan(WEAPONS.rapier.attacks.thrust.windup);
    expect(WEAPONS.rapier.attacks.cut.recovery).toBeGreaterThan(WEAPONS.rapier.attacks.thrust.recovery);
  });
});

describe("counter-window arithmetic (the doc's tempo economics)", () => {
  // counterTime = fastest player counter (thrust, no pretempo): windup + beat + strike.
  for (const atk of Object.values(WEAPONS)) {
    for (const def of Object.values(WEAPONS)) {
      for (const kind of KINDS) {
        const t = atk.attacks[kind];
        test(`${def.id} thrust counters ${atk.id} whiffed ${kind}`, () => {
          expect(t.recovery * atk.whiffRecoveryFactor).toBeGreaterThan(counterTime(def));
        });
        test(`${def.id} thrust counters ${atk.id} parried ${kind} (dui tempi)`, () => {
          expect(t.recovery + atk.parriedPenalty).toBeGreaterThan(counterTime(def));
        });
        test(`void beats parry: bigger window after ${atk.id} whiffed ${kind}`, () => {
          expect(t.recovery * atk.whiffRecoveryFactor).toBeGreaterThan(t.recovery + atk.parriedPenalty);
        });
      }
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/weapons`.

- [ ] **Step 3: Write types.ts and weapons.ts**

`src/combat/types.ts`:
```ts
export type WeaponId = "longsword" | "rapier";
export type AttackKind = "cut" | "thrust";
export type AttackPhase = "pretempo" | "windup" | "beat" | "strike" | "recovery";
export type Zone = "out" | "wide" | "narrow";
export type Intent = "advance" | "retreat" | "void" | "cut" | "thrust" | "parry";

export interface AttackTimings {
  windup: number;
  beat: number;
  strike: number;
  recovery: number;
}

export interface WeaponProfile {
  id: WeaponId;
  name: string;
  /** world px; a strike lands if the gap at strike-end is <= reach */
  reach: number;
  stepDistance: number;
  stepDuration: number;
  /** stance pause between chained steps */
  stancePause: number;
  /** tell phase before windup; AI attacks only */
  pretempo: number;
  attacks: Record<AttackKind, AttackTimings>;
  parryWindow: number;
  parryCooldown: number;
  /** added to this weapon's recovery when its attack is parried */
  parriedPenalty: number;
  /** multiplies this weapon's recovery when its attack whiffs */
  whiffRecoveryFactor: number;
  /** sprite playback multiplier: the feel knob */
  animSpeed: number;
  voidDistance: number;
  voidDuration: number;
  identity: string;
}
```

`src/combat/weapons.ts`:
```ts
import type { WeaponId, WeaponProfile } from "./types";

export const WEAPONS: Record<WeaponId, WeaponProfile> = {
  longsword: {
    id: "longsword",
    name: "Longsword",
    reach: 95,
    stepDistance: 34,
    stepDuration: 260,
    stancePause: 90,
    pretempo: 180,
    attacks: {
      cut:    { windup: 420, beat: 100, strike: 380, recovery: 420 },
      thrust: { windup: 260, beat: 60,  strike: 260, recovery: 300 },
    },
    parryWindow: 260,
    parryCooldown: 340,
    parriedPenalty: 260,
    whiffRecoveryFactor: 2.0,
    animSpeed: 0.85,
    voidDistance: 55,
    voidDuration: 320,
    identity: "The generalist: cuts and thrusts, strong in the bind.",
  },
  rapier: {
    id: "rapier",
    name: "Rapier",
    reach: 115,
    stepDistance: 28,
    stepDuration: 200,
    stancePause: 70,
    pretempo: 140,
    attacks: {
      cut:    { windup: 320, beat: 80, strike: 300, recovery: 400 },
      thrust: { windup: 200, beat: 60, strike: 220, recovery: 260 },
    },
    parryWindow: 200,
    parryCooldown: 400,
    parriedPenalty: 360,
    whiffRecoveryFactor: 3.0,
    animSpeed: 1.15,
    voidDistance: 55,
    voidDuration: 320,
    identity: "The thrust specialist: fastest clean attack, bad in the bind.",
  },
};

/** Fastest counter a player can throw: thrust with no pretempo (tell-free). */
export function counterTime(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  return t.windup + t.beat + t.strike;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. If any inequality fails, adjust `whiffRecoveryFactor` / `parriedPenalty` upward minimally; do not weaken the test.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/types.ts 06-dueling/src/combat/weapons.ts 06-dueling/test/weapons.test.ts
git commit -m "feat(dueling): weapon profiles with tested counter-window invariants"
```

---

### Task 4: Measure classification

**Files:**
- Create: `06-dueling/src/combat/measure.ts`, `06-dueling/test/measure.test.ts`

**Interfaces:**
- Produces: `zoneFor(gap: number, w: WeaponProfile): Zone` from `src/combat/measure.ts`. Consumed by AI (Task 9) and the overlay (Task 12).

- [ ] **Step 1: Write the failing test**

`test/measure.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { zoneFor } from "../src/combat/measure";
import { WEAPONS } from "../src/combat/weapons";

describe("measure zones are per-weapon and asymmetric", () => {
  const ls = WEAPONS.longsword; // reach 95, step 34
  const rp = WEAPONS.rapier;    // reach 115, step 28

  test("boundaries for longsword", () => {
    expect(zoneFor(95, ls)).toBe("narrow");
    expect(zoneFor(95.1, ls)).toBe("wide");
    expect(zoneFor(129, ls)).toBe("wide");
    expect(zoneFor(129.1, ls)).toBe("out");
  });

  test("asymmetry: a gap can be narrow for rapier and wide for longsword", () => {
    expect(zoneFor(110, rp)).toBe("narrow");
    expect(zoneFor(110, ls)).toBe("wide");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/measure`.

- [ ] **Step 3: Write measure.ts**

`src/combat/measure.ts`:
```ts
import type { WeaponProfile, Zone } from "./types";

/** Measure in the doc's sense: what can you do from here, in how many actions. */
export function zoneFor(gap: number, w: WeaponProfile): Zone {
  if (gap <= w.reach) return "narrow";
  if (gap <= w.reach + w.stepDistance) return "wide";
  return "out";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/measure.ts 06-dueling/test/measure.test.ts
git commit -m "feat(dueling): asymmetric measure zone classification"
```

---

### Task 5: Fighter state machine - stepping and buffering

**Files:**
- Create: `06-dueling/src/combat/fighter.ts`, `06-dueling/test/fighter-steps.test.ts`

**Interfaces:**
- Produces (from `src/combat/fighter.ts`), consumed by every later combat task:
  - `const TICK = 1000 / 60`, `const HIT_STUN_MS = 350`, `const DEATH_ANIM_MS = 900`
  - `type FighterState` (discriminated union below)
  - `interface Fighter { x: number; facing: 1 | -1; weapon: WeaponProfile; state: FighterState; buffered: Intent | null; parryCd: number }`
  - `type FighterEvent = { type: "strikeEnd"; attack: AttackKind } | { type: "attackStart"; attack: AttackKind; tell: boolean } | { type: "voidStart" } | { type: "parryStart" } | { type: "died" }`
  - `createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter`
  - `applyIntent(f: Fighter, intent: Intent, opts?: { tell?: boolean }): "accepted" | "buffered" | "ignored"`
  - `tickFighter(f: Fighter, dt: number): FighterEvent[]`

This task implements idle/step/pause (movement, chaining, one-slot buffer). Void/parry are Task 6, attack is Task 7 - but the full `FighterState` union and the switch skeleton are written now so the shape never changes.

- [ ] **Step 1: Write the failing test**

`test/fighter-steps.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

function run(f: ReturnType<typeof createFighter>, ms: number) {
  for (let t = 0; t < ms; t += TICK) tickFighter(f, TICK);
}

describe("discrete steps", () => {
  test("advance moves exactly stepDistance toward facing, then pauses, then idles", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    expect(applyIntent(f, "advance")).toBe("accepted");
    expect(f.state.kind).toBe("step");
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance, 5);
    expect(f.state.kind).toBe("pause");
    run(f, WEAPONS.longsword.stancePause + TICK);
    expect(f.state.kind).toBe("idle");
  });

  test("retreat moves away from facing", () => {
    const f = createFighter(600, -1, WEAPONS.rapier);
    applyIntent(f, "retreat");
    run(f, WEAPONS.rapier.stepDuration + TICK);
    expect(f.x).toBeCloseTo(600 + WEAPONS.rapier.stepDistance, 5);
  });

  test("input during a step is buffered (one slot) and fires after the pause", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    applyIntent(f, "advance");
    expect(applyIntent(f, "advance")).toBe("buffered");
    expect(applyIntent(f, "retreat")).toBe("buffered"); // overwrites the slot
    run(f, WEAPONS.longsword.stepDuration + WEAPONS.longsword.stancePause + 2 * TICK);
    expect(f.state.kind).toBe("step"); // buffered retreat fired
    run(f, WEAPONS.longsword.stepDuration + TICK);
    expect(f.x).toBeCloseTo(300 + WEAPONS.longsword.stepDistance - WEAPONS.longsword.stepDistance, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/fighter`.

- [ ] **Step 3: Write fighter.ts (full state union, step/pause behavior)**

`src/combat/fighter.ts`:
```ts
import type { AttackKind, AttackPhase, Intent, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;

export type FighterState =
  | { kind: "idle" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "pause"; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: AttackPhase; t: number; recoveryMs: number; tell: boolean }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };

export interface Fighter {
  x: number;
  facing: 1 | -1;
  weapon: WeaponProfile;
  state: FighterState;
  buffered: Intent | null;
  parryCd: number;
}

export type FighterEvent =
  | { type: "strikeEnd"; attack: AttackKind }
  | { type: "attackStart"; attack: AttackKind; tell: boolean }
  | { type: "voidStart" }
  | { type: "parryStart" }
  | { type: "died" };

export function createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter {
  return { x, facing, weapon, state: { kind: "idle" }, buffered: null, parryCd: 0 };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { tell?: boolean },
): "accepted" | "buffered" | "ignored" {
  const k = f.state.kind;
  if (k === "dead" || k === "hitstun") return "ignored";
  if (k === "idle") {
    return startAction(f, intent, opts?.tell ?? false) ? "accepted" : "ignored";
  }
  if (k === "step" || k === "pause") {
    f.buffered = intent; // one-slot buffer, last input wins
    return "buffered";
  }
  return "ignored"; // committed: void, attack, parry
}

function startAction(f: Fighter, intent: Intent, tell: boolean): boolean {
  switch (intent) {
    case "advance":
      f.state = { kind: "step", dir: 1, t: 0 };
      return true;
    case "retreat":
      f.state = { kind: "step", dir: -1, t: 0 };
      return true;
    case "void":
      f.state = { kind: "void", t: 0 };
      return true;
    case "cut":
    case "thrust":
      f.state = {
        kind: "attack",
        attack: intent,
        phase: tell ? "pretempo" : "windup",
        t: 0,
        recoveryMs: f.weapon.attacks[intent].recovery,
        tell,
      };
      return true;
    case "parry":
      if (f.parryCd > 0) return false;
      f.state = { kind: "parry", t: 0 };
      return true;
  }
}

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  f.parryCd = Math.max(0, f.parryCd - dt);
  const s = f.state;
  switch (s.kind) {
    case "idle":
    case "dead":
      if (s.kind === "dead") s.t += dt;
      break;
    case "step": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.stepDuration);
      s.t += dt;
      const now = Math.min(s.t, w.stepDuration);
      f.x += ((now - prev) / w.stepDuration) * w.stepDistance * s.dir * f.facing;
      if (s.t >= w.stepDuration) f.state = { kind: "pause", t: s.t - w.stepDuration };
      break;
    }
    case "pause":
      s.t += dt;
      if (s.t >= f.weapon.stancePause) {
        f.state = { kind: "idle" };
        flushBuffer(f, events);
      }
      break;
    case "void":
    case "attack":
    case "parry":
    case "hitstun":
      // Implemented in Tasks 6 and 7.
      break;
  }
  return events;
}

function flushBuffer(f: Fighter, events: FighterEvent[]): void {
  const b = f.buffered;
  f.buffered = null;
  if (b !== null && startAction(f, b, false)) {
    emitStart(f, events);
  }
}

function emitStart(f: Fighter, events: FighterEvent[]): void {
  const s = f.state;
  if (s.kind === "attack") events.push({ type: "attackStart", attack: s.attack, tell: s.tell });
  else if (s.kind === "void") events.push({ type: "voidStart" });
  else if (s.kind === "parry") events.push({ type: "parryStart" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/fighter.ts 06-dueling/test/fighter-steps.test.ts
git commit -m "feat(dueling): fighter state machine with discrete buffered steps"
```

---

### Task 6: Fighter state machine - void and parry

**Files:**
- Modify: `06-dueling/src/combat/fighter.ts` (fill the `void`, `parry`, `hitstun` cases)
- Create: `06-dueling/test/fighter-defense.test.ts`

**Interfaces:**
- Consumes/extends Task 5's `tickFighter`. No signature changes.

- [ ] **Step 1: Write the failing test**

`test/fighter-defense.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { HIT_STUN_MS, TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

function run(f: ReturnType<typeof createFighter>, ms: number) {
  const out = [];
  for (let t = 0; t < ms; t += TICK) out.push(...tickFighter(f, TICK));
  return out;
}

describe("void", () => {
  test("moves backward voidDistance over voidDuration, committed throughout", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "void");
    expect(f.state.kind).toBe("void");
    expect(applyIntent(f, "cut")).toBe("ignored"); // committed
    run(f, WEAPONS.longsword.voidDuration + TICK);
    expect(f.x).toBeCloseTo(400 - WEAPONS.longsword.voidDistance, 5);
    expect(f.state.kind).toBe("idle");
  });
});

describe("parry", () => {
  test("parry lasts parryWindow, then cooldown blocks re-entry", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    expect(applyIntent(f, "parry")).toBe("accepted");
    run(f, WEAPONS.rapier.parryWindow + TICK);
    expect(f.state.kind).toBe("idle");
    expect(applyIntent(f, "parry")).toBe("ignored"); // cooling down
    run(f, WEAPONS.rapier.parryCooldown + TICK);
    expect(applyIntent(f, "parry")).toBe("accepted");
  });
});

describe("hitstun", () => {
  test("hitstun leads to dead and emits died", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    f.state = { kind: "hitstun", t: 0 };
    const events = run(f, HIT_STUN_MS + 2 * TICK);
    expect(f.state.kind).toBe("dead");
    expect(events.some((e) => e.type === "died")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - void does not move / states never exit (cases are empty).

- [ ] **Step 3: Fill the cases in tickFighter**

Replace the placeholder `case "void": case "attack": case "parry": case "hitstun":` block with:
```ts
    case "void": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.voidDuration);
      s.t += dt;
      const now = Math.min(s.t, w.voidDuration);
      f.x -= ((now - prev) / w.voidDuration) * w.voidDistance * f.facing;
      if (s.t >= w.voidDuration) {
        f.state = { kind: "idle" };
        flushBuffer(f, events);
      }
      break;
    }
    case "parry":
      s.t += dt;
      if (s.t >= f.weapon.parryWindow) {
        f.state = { kind: "idle" };
        f.parryCd = f.weapon.parryCooldown;
      }
      break;
    case "hitstun":
      s.t += dt;
      if (s.t >= HIT_STUN_MS) {
        f.state = { kind: "dead", t: 0 };
        events.push({ type: "died" });
      }
      break;
    case "attack":
      // Implemented in Task 7.
      break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/fighter.ts 06-dueling/test/fighter-defense.test.ts
git commit -m "feat(dueling): void and parry with cooldown, hitstun to death"
```

---

### Task 7: Fighter state machine - the attack cascade

**Files:**
- Modify: `06-dueling/src/combat/fighter.ts` (fill the `attack` case)
- Create: `06-dueling/test/fighter-attack.test.ts`

**Interfaces:**
- Consumes/extends Task 5's `tickFighter`. Emits `{ type: "strikeEnd", attack }` exactly once per attack, at the strike-to-recovery transition; the engine (Task 8) resolves the outcome on that event and may mutate `state.recoveryMs` in the same tick.

- [ ] **Step 1: Write the failing test**

`test/fighter-attack.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";
import type { FighterEvent } from "../src/combat/fighter";

describe("attack cascade", () => {
  test("player thrust: windup -> beat -> strike -> recovery -> idle, phase times per profile", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    const t = WEAPONS.rapier.attacks.thrust;
    applyIntent(f, "thrust");
    expect(f.state).toMatchObject({ kind: "attack", phase: "windup" });

    const phases: string[] = [];
    let strikeEndAt = -1;
    let elapsed = 0;
    for (let i = 0; i < 2000 / TICK; i++) {
      const evs: FighterEvent[] = tickFighter(f, TICK);
      elapsed += TICK;
      if (f.state.kind === "attack" && phases[phases.length - 1] !== f.state.phase) {
        phases.push(f.state.phase);
      }
      if (evs.some((e) => e.type === "strikeEnd")) strikeEndAt = elapsed;
      if (f.state.kind === "idle") break;
    }
    expect(phases).toEqual(["windup", "beat", "strike", "recovery"]);
    // strikeEnd fires at windup + beat + strike (within one tick)
    expect(strikeEndAt).toBeGreaterThanOrEqual(t.windup + t.beat + t.strike - TICK);
    expect(strikeEndAt).toBeLessThanOrEqual(t.windup + t.beat + t.strike + TICK);
    expect(f.state.kind).toBe("idle");
  });

  test("AI attack includes the pretempo tell", () => {
    const f = createFighter(400, -1, WEAPONS.longsword);
    applyIntent(f, "cut", { tell: true });
    expect(f.state).toMatchObject({ kind: "attack", phase: "pretempo" });
  });

  test("attacks cannot be cancelled once started", () => {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "cut");
    expect(applyIntent(f, "void")).toBe("ignored");
    expect(applyIntent(f, "retreat")).toBe("ignored");
  });

  test("engine can extend recovery on strikeEnd (whiff simulation)", () => {
    const f = createFighter(400, 1, WEAPONS.rapier);
    const t = WEAPONS.rapier.attacks.thrust;
    applyIntent(f, "thrust");
    let extended = false;
    let elapsed = 0;
    let idleAt = -1;
    for (let i = 0; i < 3000 / TICK; i++) {
      const evs = tickFighter(f, TICK);
      elapsed += TICK;
      if (evs.some((e) => e.type === "strikeEnd") && f.state.kind === "attack") {
        f.state.recoveryMs *= WEAPONS.rapier.whiffRecoveryFactor;
        extended = true;
      }
      if (f.state.kind === "idle") { idleAt = elapsed; break; }
    }
    expect(extended).toBe(true);
    const expected = t.windup + t.beat + t.strike + t.recovery * WEAPONS.rapier.whiffRecoveryFactor;
    expect(idleAt).toBeGreaterThanOrEqual(expected - 2 * TICK);
    expect(idleAt).toBeLessThanOrEqual(expected + 2 * TICK);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - attack state never advances (case is empty).

- [ ] **Step 3: Fill the attack case**

Replace the placeholder `case "attack":` block with:
```ts
    case "attack": {
      const timings = f.weapon.attacks[s.attack];
      s.t += dt;
      // Walk phases, carrying tick remainder so timing drift never accumulates.
      let advanced = true;
      while (advanced) {
        advanced = false;
        const dur =
          s.phase === "pretempo" ? f.weapon.pretempo :
          s.phase === "windup" ? timings.windup :
          s.phase === "beat" ? timings.beat :
          s.phase === "strike" ? timings.strike :
          s.recoveryMs;
        if (s.t < dur) break;
        s.t -= dur;
        if (s.phase === "pretempo") { s.phase = "windup"; advanced = true; }
        else if (s.phase === "windup") { s.phase = "beat"; advanced = true; }
        else if (s.phase === "beat") { s.phase = "strike"; advanced = true; }
        else if (s.phase === "strike") {
          s.phase = "recovery";
          events.push({ type: "strikeEnd", attack: s.attack });
          // Stop walking: the engine may mutate recoveryMs on this event
          // before the next tick. Remainder stays in s.t.
        } else {
          f.state = { kind: "idle" };
          flushBuffer(f, events);
        }
      }
      break;
    }
```
Also make `startAction`'s attack branch emit `attackStart` - move event emission into `applyIntent`: after a successful `startAction` in `applyIntent`, there is no events array. Keep it simple: `attackStart`, `voidStart`, `parryStart` events are only needed by the engine log; the engine (Task 8) detects starts by comparing `state.kind` before/after applying intents, so REMOVE the `emitStart` helper and those three event types from `FighterEvent` if unused - the union becomes `{ type: "strikeEnd"; attack: AttackKind } | { type: "died" }` and `flushBuffer` drops its `events` use accordingly (keep flushing the buffer itself). Update Task 5's test expectations only if the compiler complains about unused imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/fighter.ts 06-dueling/test/fighter-attack.test.ts
git commit -m "feat(dueling): attack cascade with remainder-carrying phase walk"
```

---

### Task 8: Duel engine - resolution, clamping, events

**Files:**
- Create: `06-dueling/src/combat/engine.ts`, `06-dueling/test/engine.test.ts`

**Interfaces:**
- Produces (from `src/combat/engine.ts`), consumed by AI (Task 9), log (Task 10), renderer (Task 12):
  - `const ARENA = { left: 60, right: 900, floorY: 430 }`, `const MIN_GAP = 40`
  - `interface DuelEvent { time: number; side: 0 | 1; kind: "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "kill" | "draw"; text: string }`
  - `interface Duel { f: [Fighter, Fighter]; time: number; over: boolean; winner: 0 | 1 | "draw" | null; log: DuelEvent[] }`
  - `createDuel(wa: WeaponProfile, wb: WeaponProfile): Duel` (fighter 0 at x=330 facing 1, fighter 1 at x=630 facing -1)
  - `gapOf(d: Duel): number`
  - `tickDuel(d: Duel, ia: Intent | null, ib: Intent | null): DuelEvent[]` - side 1's attack intents are applied with `tell: true` (side 1 is always the AI in this MVP)

- [ ] **Step 1: Write the failing test**

`test/engine.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { TICK } from "../src/combat/fighter";
import { MIN_GAP, createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null) {
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

function closeTo(d: Duel, gap: number) {
  // Teleport for test setup: keep fighter 1 in place, move fighter 0.
  d.f[0].x = d.f[1].x - gap;
}

describe("attack resolution", () => {
  test("hit: strike inside reach against an idle defender kills", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    closeTo(d, 80); // inside longsword reach 95
    const evs = runMs(d, 3000, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.over).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("whiff: void opens the distance, attacker recovery is extended, counter lands", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    // 70: inside rapier reach (115); after the void it is 125 (rapier whiffs);
    // one longsword advance brings it to 91, inside longsword reach (95).
    closeTo(d, 70);
    // Fighter 0 (rapier) thrusts; fighter 1 (longsword) voids immediately.
    let evs = runMs(d, TICK, "thrust", "void");
    const t = WEAPONS.rapier.attacks.thrust;
    // run until just past strikeEnd
    evs = evs.concat(runMs(d, t.windup + t.beat + t.strike + 2 * TICK));
    expect(evs.some((e) => e.kind === "whiff" && e.side === 0)).toBe(true);
    expect(d.over).toBe(false);
    // Nachreisen: longsword advances once and thrusts, starting right after its void ends.
    const evs2 = runMs(d, 60, null, "advance");
    const evs3 = runMs(d, 2000, null, "thrust");
    const all = evs.concat(evs2, evs3);
    expect(all.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(d.winner).toBe(1);
  });

  test("parried: attacker eats the penalty, defender counters (dui tempi)", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 90); // inside both reaches
    // Rapier thrusts; longsword parries just before the strike lands.
    const t = WEAPONS.rapier.attacks.thrust;
    let evs = runMs(d, TICK, "thrust", null);
    const landAt = t.windup + t.beat + t.strike;
    const parryAt = landAt - WEAPONS.longsword.parryWindow / 2;
    evs = evs.concat(runMs(d, parryAt - TICK));
    evs = evs.concat(runMs(d, TICK, null, "parry"));
    evs = evs.concat(runMs(d, landAt - parryAt + 2 * TICK));
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    // dui tempi: defender thrusts immediately after the parry resolves
    const evs2 = runMs(d, 2000, null, "thrust");
    expect(evs2.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
  });

  test("mutual strikeEnd on the same tick is a draw", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    closeTo(d, 80);
    runMs(d, 3000, "thrust", "thrust");
    // identical weapons, same-tick thrusts: both land
    expect(d.over).toBe(true);
    expect(d.winner).toBe("draw");
  });
});

describe("positions", () => {
  test("fighters never overlap closer than MIN_GAP", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, "advance", "advance");
    expect(gapOf(d)).toBeGreaterThanOrEqual(MIN_GAP - 0.001);
  });
});
```
Note on the mutual-kill test: side 1's thrust carries the pretempo tell (140ms for rapier, 180 for longsword) so with identical weapons side 1 strikes later - EXCEPT both are longsword here and side 0 also idles 180ms? No: side 0 starts at windup, side 1 at pretempo, so side 1's strikeEnd comes 180ms later and side 0 simply wins. To make a genuine draw, the test uses `tickDuel`'s documented behavior: intents repeat every tick; side 0's kill happens first and `over` flips before side 1 lands. THEREFORE the draw test must instead inject symmetric no-tell attacks: set both sides' attacks in the same tick by calling the fighter API directly:
```ts
import { applyIntent } from "../src/combat/fighter";
// inside the draw test, replace runMs(..., "thrust", "thrust") with:
applyIntent(d.f[0], "thrust");
applyIntent(d.f[1], "thrust");
for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, null, null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/engine`.

- [ ] **Step 3: Write engine.ts**

`src/combat/engine.ts`:
```ts
import { applyIntent, tickFighter } from "./fighter";
import type { Fighter, FighterEvent } from "./fighter";
import { createFighter } from "./fighter";
import type { Intent, WeaponProfile } from "./types";

export const ARENA = { left: 60, right: 900, floorY: 430 };
export const MIN_GAP = 40;

export interface DuelEvent {
  time: number;
  side: 0 | 1;
  kind: "attackStart" | "whiff" | "parried" | "hit" | "void" | "parry" | "kill" | "draw";
  text: string;
}

export interface Duel {
  f: [Fighter, Fighter];
  time: number;
  over: boolean;
  winner: 0 | 1 | "draw" | null;
  log: DuelEvent[];
}

export function createDuel(wa: WeaponProfile, wb: WeaponProfile): Duel {
  return {
    f: [createFighter(330, 1, wa), createFighter(630, -1, wb)],
    time: 0,
    over: false,
    winner: null,
    log: [],
  };
}

export function gapOf(d: Duel): number {
  return Math.abs(d.f[0].x - d.f[1].x);
}

export function tickDuel(d: Duel, ia: Intent | null, ib: Intent | null): DuelEvent[] {
  const out: DuelEvent[] = [];
  const intents: [Intent | null, Intent | null] = [ia, ib];
  const dt = 1000 / 60;

  for (const side of [0, 1] as const) {
    const intent = intents[side];
    if (intent === null || d.over) continue;
    const before = d.f[side].state.kind;
    const r = applyIntent(d.f[side], intent, { tell: side === 1 });
    if (r === "accepted" && before !== d.f[side].state.kind) {
      const k = d.f[side].state.kind;
      if (k === "attack") emit(d, out, side, "attackStart", `${d.f[side].weapon.name} ${intent} begins`);
      else if (k === "void") emit(d, out, side, "void", `${d.f[side].weapon.name} voids`);
      else if (k === "parry") emit(d, out, side, "parry", `${d.f[side].weapon.name} raises a parry`);
    }
  }

  d.time += dt;
  const evs: [FighterEvent[], FighterEvent[]] = [tickFighter(d.f[0], dt), tickFighter(d.f[1], dt)];

  clampPositions(d);

  // Gather strike resolutions AFTER both fighters ticked, so same-tick
  // strikes resolve simultaneously (mutual hit = draw).
  const strikes: Array<0 | 1> = [];
  for (const side of [0, 1] as const) {
    if (evs[side].some((e) => e.type === "strikeEnd")) strikes.push(side);
  }
  const hits: Array<0 | 1> = [];
  for (const side of strikes) {
    const atk = d.f[side];
    const def = d.f[1 - side];
    if (atk.state.kind !== "attack") continue; // safety: state must be recovery-phase attack
    const gap = gapOf(d);
    if (gap > atk.weapon.reach) {
      atk.state.recoveryMs *= atk.weapon.whiffRecoveryFactor;
      emit(d, out, side, "whiff", `${atk.weapon.name} misses -> Nachreisen window open`);
    } else if (def.state.kind === "parry") {
      atk.state.recoveryMs += atk.weapon.parriedPenalty;
      def.state = { kind: "idle" };
      def.parryCd = def.weapon.parryCooldown;
      emit(d, out, side, "parried", `${atk.weapon.name} parried -> dui tempi counter available`);
    } else {
      hits.push(side);
    }
  }
  for (const side of hits) {
    const def = d.f[1 - side];
    const flavor =
      def.state.kind === "step" ? " (mid-step: primo tempo)" :
      def.state.kind === "attack" && def.state.phase === "recovery" ? " (in recovery: Nachreisen)" :
      def.state.kind === "attack" ? " (into preparation: mezzo tempo)" :
      def.state.kind === "void" ? " (void mistimed)" : "";
    def.state = { kind: "hitstun", t: 0 };
    emit(d, out, side, "hit", `${d.f[side].weapon.name} strike lands${flavor}`);
  }
  if (hits.length === 2) {
    d.over = true;
    d.winner = "draw";
    emit(d, out, 0, "draw", "mutual strike: both fighters fall");
  } else if (hits.length === 1) {
    d.over = true;
    d.winner = hits[0];
    emit(d, out, hits[0], "kill", `${d.f[hits[0]].weapon.name} kills`);
  }
  return out;
}

function clampPositions(d: Duel): void {
  for (const f of d.f) f.x = Math.min(ARENA.right, Math.max(ARENA.left, f.x));
  const gap = gapOf(d);
  if (gap < MIN_GAP) {
    const push = (MIN_GAP - gap) / 2;
    const [l, r] = d.f[0].x <= d.f[1].x ? [d.f[0], d.f[1]] : [d.f[1], d.f[0]];
    l.x = Math.max(ARENA.left, l.x - push);
    r.x = Math.min(ARENA.right, r.x + push);
  }
}

function emit(d: Duel, out: DuelEvent[], side: 0 | 1, kind: DuelEvent["kind"], text: string): void {
  const e: DuelEvent = { time: d.time, side, kind, text };
  d.log.push(e);
  out.push(e);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. The whiff/parried tests are timing-sensitive; if one is off by a tick, adjust the test's run windows by +-1 TICK, never the engine.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/engine.ts 06-dueling/test/engine.test.ts
git commit -m "feat(dueling): duel engine with whiff/parry/hit resolution and HEMA log"
```

---

### Task 9: AI dummy modes

**Files:**
- Create: `06-dueling/src/combat/ai.ts`, `06-dueling/test/ai.test.ts`

**Interfaces:**
- Produces (from `src/combat/ai.ts`), consumed by main loop (Task 12):
  - `type AiMode = 0 | 1 | 2`
  - `const AI_REACTION_MS = 180`, `const AI_ATTACK_COOLDOWN_MS = 1400`
  - `interface AiState { cooldown: number; next: AttackKind }`
  - `createAiState(): AiState`
  - `aiDecide(d: Duel, mode: AiMode, ai: AiState, dt: number): Intent | null` (always decides for side 1)

- [ ] **Step 1: Write the failing test**

`test/ai.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { AI_REACTION_MS, aiDecide, createAiState } from "../src/combat/ai";
import { TICK } from "../src/combat/fighter";
import { createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { AiMode } from "../src/combat/ai";
import type { Duel } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

function runWithAi(d: Duel, mode: AiMode, ms: number, playerIntent: Intent | null = null) {
  const ai = createAiState();
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    const ib = aiDecide(d, mode, ai, TICK);
    evs.push(...tickDuel(d, playerIntent, ib));
    playerIntent = null;
  }
  return evs;
}

test("mode 0 never acts", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 60;
  runWithAi(d, 0, 2000);
  expect(d.f[1].state.kind).toBe("idle");
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("mode 1 parries after the reaction delay, never attacks or moves", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 80; // narrow for longsword
  const startX = d.f[1].x;
  const evs = runWithAi(d, 1, 3000, "cut");
  expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
  expect(d.f[1].x).toBe(startX);
  expect(d.log.filter((e) => e.side === 1 && e.kind === "attackStart")).toEqual([]);
});

test("mode 2 attacks when the player is in its measure, never advances", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
  d.f[0].x = d.f[1].x - 100; // narrow for rapier (reach 115)
  const startX = d.f[1].x;
  const evs = runWithAi(d, 2, 4000);
  expect(evs.some((e) => e.kind === "attackStart" && e.side === 1)).toBe(true);
  expect(d.f[1].x).toBe(startX);
});

test("mode 2 stays quiet out of measure", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.rapier); // gap 300, out for both
  runWithAi(d, 2, 2000);
  expect(d.log.filter((e) => e.side === 1)).toEqual([]);
});

test("determinism: identical runs produce identical logs", () => {
  const script = (d: Duel) => {
    const ai = createAiState();
    for (let i = 0; i < Math.floor(5000 / TICK); i++) {
      const ia: Intent | null = i === 30 ? "advance" : i === 60 ? "thrust" : i === 200 ? "void" : null;
      tickDuel(d, ia, aiDecide(d, 2, ai, TICK));
    }
    return d.log.map((e) => `${e.time.toFixed(3)}|${e.side}|${e.kind}|${e.text}`);
  };
  const a = script(createDuel(WEAPONS.longsword, WEAPONS.rapier));
  const b = script(createDuel(WEAPONS.longsword, WEAPONS.rapier));
  expect(a).toEqual(b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/ai`.

- [ ] **Step 3: Write ai.ts**

`src/combat/ai.ts`:
```ts
import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { AttackKind, Intent } from "./types";

export type AiMode = 0 | 1 | 2;

export const AI_REACTION_MS = 180;
export const AI_ATTACK_COOLDOWN_MS = 1400;

export interface AiState {
  cooldown: number;
  next: AttackKind;
}

export function createAiState(): AiState {
  return { cooldown: 0, next: "thrust" };
}

/** Decides side 1's intent. Deterministic: no rng anywhere. */
export function aiDecide(d: Duel, mode: AiMode, ai: AiState, dt: number): Intent | null {
  if (mode === 0 || d.over) return null;
  const self = d.f[1];
  const opp = d.f[0];

  if (mode === 1) {
    if (opp.state.kind !== "attack") return null;
    const { phase, t, attack, tell } = opp.state;
    if (phase === "recovery") return null;
    const w = opp.weapon.attacks[attack];
    const pre = tell ? opp.weapon.pretempo : 0;
    // Time since the attack became visible, and time left until the strike lands.
    const elapsed =
      phase === "pretempo" ? t :
      phase === "windup" ? pre + t :
      phase === "beat" ? pre + w.windup + t :
      pre + w.windup + w.beat + t;
    const remaining = pre + w.windup + w.beat + w.strike - elapsed;
    // Needs AI_REACTION_MS of visible attack to react, then times the parry
    // to intercept the lands-instant (not the windup - a parry raised at the
    // windup would expire before a slow cut arrives).
    if (
      elapsed >= AI_REACTION_MS &&
      remaining <= self.weapon.parryWindow * 0.75 &&
      self.state.kind === "idle" &&
      self.parryCd <= 0
    ) {
      return "parry";
    }
    return null;
  }

  // mode 2: attack in place, never step closer
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  if (self.state.kind !== "idle" || ai.cooldown > 0) return null;
  if (opp.state.kind === "dead") return null;
  if (zoneFor(gapOf(d), self.weapon) === "out") return null;
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  ai.cooldown = AI_ATTACK_COOLDOWN_MS;
  return attack;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. Mode-1 arithmetic check: rapier parryWindow 200 -> parry raised when remaining <= 150ms. Longsword cut lands at 900ms; parry raised at 750 covers 750-950: catches it. Longsword thrust lands at 580; raised at 430 covers 430-630: catches it. If a case still slips through by a tick, tune the 0.75 factor, not the tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/ai.ts 06-dueling/test/ai.test.ts
git commit -m "feat(dueling): deterministic AI dummy modes 0/1/2"
```

---

### Task 10: Log formatting

**Files:**
- Create: `06-dueling/src/combat/log.ts`, `06-dueling/test/log.test.ts`

**Interfaces:**
- Produces: `formatEvent(e: DuelEvent): string` (e.g. `"0:12.4 [P1] Rapier misses -> Nachreisen window open"`), `lastLines(log: DuelEvent[], n: number): string[]`. Consumed by renderer (Task 12).

- [ ] **Step 1: Write the failing test**

`test/log.test.ts`:
```ts
import { expect, test } from "vitest";
import { formatEvent, lastLines } from "../src/combat/log";
import type { DuelEvent } from "../src/combat/engine";

const ev = (time: number, side: 0 | 1, text: string): DuelEvent =>
  ({ time, side, kind: "hit", text });

test("formats minutes, seconds, tenths and side tag", () => {
  expect(formatEvent(ev(12400, 0, "Rapier misses -> Nachreisen window open")))
    .toBe("0:12.4 [P1] Rapier misses -> Nachreisen window open");
  expect(formatEvent(ev(61000, 1, "Longsword kills"))).toBe("1:01.0 [P2] Longsword kills");
});

test("lastLines keeps only the tail", () => {
  const log = Array.from({ length: 12 }, (_, i) => ev(i * 1000, 0, `e${i}`));
  const lines = lastLines(log, 8);
  expect(lines).toHaveLength(8);
  expect(lines[7]).toContain("e11");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/combat/log`.

- [ ] **Step 3: Write log.ts**

`src/combat/log.ts`:
```ts
import type { DuelEvent } from "./engine";

export function formatEvent(e: DuelEvent): string {
  const total = Math.floor(e.time / 100) / 10;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const ss = s < 10 ? `0${s.toFixed(1)}` : s.toFixed(1);
  return `${m}:${ss} [P${e.side + 1}] ${e.text}`;
}

export function lastLines(log: DuelEvent[], n: number): string[] {
  return log.slice(-n).map(formatEvent);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. Note `0:12.4` requires no leading zero-pad for seconds >= 10; the pad applies only when `s < 10`.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/combat/log.ts 06-dueling/test/log.test.ts
git commit -m "feat(dueling): HEMA event log formatting"
```

---

### Task 11: Frame picking (state -> sprite frame, pure)

**Files:**
- Create: `06-dueling/src/render/frames.ts`, `06-dueling/test/frames.test.ts`

**Interfaces:**
- Produces: `interface FramePick { sheet: SheetName; frame: number; flip: boolean }`, `pickFrame(f: Fighter, timeMs: number): FramePick`. Consumed by draw (Task 12).
- Consumes: `SHEETS`/`SheetName` (Task 2), `Fighter`, `HIT_STUN_MS`, `DEATH_ANIM_MS` (Task 5), weapon profiles (Task 3).

- [ ] **Step 1: Write the failing test**

`test/frames.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { pickFrame } from "../src/render/frames";
import { createFighter } from "../src/combat/fighter";
import { WEAPONS } from "../src/combat/weapons";

describe("pickFrame maps fighter state to sheet frames", () => {
  test("idle loops the sword idle sheet, speed scaled by weapon animSpeed", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    const a = pickFrame(f, 0);
    expect(a.sheet).toBe("swordIdle");
    expect(a.frame).toBe(0);
    // one idle frame lasts 125 / animSpeed ms
    const later = pickFrame(f, 125 / WEAPONS.longsword.animSpeed + 1);
    expect(later.frame).toBe(1);
  });

  test("cut holds frame 2 through the whole transition beat", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    f.state = { kind: "attack", attack: "cut", phase: "beat", t: 1, recoveryMs: 420, tell: false };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordAttack", frame: 2 });
    f.state.t = WEAPONS.longsword.attacks.cut.beat - 1;
    expect(pickFrame(f, 0).frame).toBe(2);
  });

  test("thrust strike walks frames 3..5 of the stab sheet", () => {
    const f = createFighter(300, 1, WEAPONS.rapier);
    const strike = WEAPONS.rapier.attacks.thrust.strike;
    f.state = { kind: "attack", attack: "thrust", phase: "strike", t: 0, recoveryMs: 260, tell: false };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordStab", frame: 3 });
    f.state.t = strike - 1;
    expect(pickFrame(f, 0).frame).toBe(5);
  });

  test("dead clamps to the last death frame", () => {
    const f = createFighter(300, -1, WEAPONS.longsword);
    f.state = { kind: "dead", t: 99999 };
    const p = pickFrame(f, 0);
    expect(p).toMatchObject({ sheet: "death", frame: 9, flip: true });
  });

  test("step maps t across the run sheet", () => {
    const f = createFighter(300, 1, WEAPONS.longsword);
    f.state = { kind: "step", dir: 1, t: 0 };
    expect(pickFrame(f, 0)).toMatchObject({ sheet: "swordRun", frame: 0 });
    f.state.t = WEAPONS.longsword.stepDuration - 1;
    expect(pickFrame(f, 0).frame).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/render/frames`.

- [ ] **Step 3: Write frames.ts**

`src/render/frames.ts`:
```ts
import { DEATH_ANIM_MS, HIT_STUN_MS } from "../combat/fighter";
import { SHEETS } from "./sheets";
import type { Fighter } from "../combat/fighter";
import type { SheetName } from "./sheets";

export interface FramePick {
  sheet: SheetName;
  frame: number;
  flip: boolean;
}

const IDLE_FRAME_MS = 125;

function span(sheet: SheetName, t: number, total: number, first: number, last: number): number {
  const n = last - first + 1;
  const idx = first + Math.min(n - 1, Math.floor((t / total) * n));
  return Math.min(idx, SHEETS[sheet].frames - 1);
}

export function pickFrame(f: Fighter, timeMs: number): FramePick {
  const flip = f.facing === -1;
  const s = f.state;
  const w = f.weapon;
  switch (s.kind) {
    case "idle": {
      const per = IDLE_FRAME_MS / w.animSpeed;
      return { sheet: "swordIdle", frame: Math.floor(timeMs / per) % SHEETS.swordIdle.frames, flip };
    }
    case "pause":
      return { sheet: "swordIdle", frame: 0, flip };
    case "step":
      return { sheet: "swordRun", frame: span("swordRun", s.t, w.stepDuration, 0, 7), flip };
    case "void":
      return { sheet: "roll", frame: span("roll", s.t, w.voidDuration, 0, 6), flip };
    case "parry":
      // No parry sheet in the template: hold the raised-guard windup frame.
      return { sheet: "swordAttack", frame: 1, flip };
    case "hitstun":
      return { sheet: "hurt", frame: span("hurt", s.t, HIT_STUN_MS, 0, 3), flip };
    case "dead":
      return { sheet: "death", frame: span("death", Math.min(s.t, DEATH_ANIM_MS - 1), DEATH_ANIM_MS, 0, 9), flip };
    case "attack": {
      const timings = w.attacks[s.attack];
      const sheet: SheetName = s.attack === "cut" ? "swordAttack" : "swordStab";
      switch (s.phase) {
        case "pretempo":
          return { sheet, frame: 0, flip };
        case "windup":
          return { sheet, frame: s.t < timings.windup / 2 ? 0 : 1, flip };
        case "beat":
          return { sheet, frame: 2, flip };
        case "strike":
          return { sheet, frame: span(sheet, s.t, timings.strike, 3, s.attack === "cut" ? 4 : 5), flip };
        case "recovery":
          return { sheet, frame: SHEETS[sheet].frames - 1, flip };
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/render/frames.ts 06-dueling/test/frames.test.ts
git commit -m "feat(dueling): pure state-to-frame mapping with per-weapon speed"
```

---

### Task 12: Renderer + game loop + input; Chrome animation verification

**Files:**
- Create: `06-dueling/src/render/draw.ts`, `06-dueling/src/render/loader.ts`
- Modify: `06-dueling/src/main.ts` (replace stub)

**Interfaces:**
- Consumes everything above. Produces a playable duel bootable via URL query: `?p=longsword&e=rapier&mode=2` skips the select screen (select screen itself is Task 13; until then main.ts ALWAYS boots straight into a duel from query params with defaults p=longsword, e=rapier, mode=0).
- Produces (from `src/render/draw.ts`): `interface View { ctx: CanvasRenderingContext2D; images: Record<SheetName, HTMLImageElement>; overlay: boolean }`, `drawFrame(v: View, d: Duel, aiMode: AiMode): void`.
- Produces (from `src/render/loader.ts`): `loadImages(): Promise<Record<SheetName, HTMLImageElement>>` using `import.meta.env.BASE_URL + "sprites/" + meta.file`.

- [ ] **Step 1: Write loader.ts**

`src/render/loader.ts`:
```ts
import { SHEETS } from "./sheets";
import type { SheetName } from "./sheets";

export function loadImages(): Promise<Record<SheetName, HTMLImageElement>> {
  const entries = Object.entries(SHEETS).map(
    ([name, meta]) =>
      new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([name, img]);
        img.onerror = () => reject(new Error(`failed to load ${meta.file}`));
        img.src = `${import.meta.env.BASE_URL}sprites/${meta.file}`;
      }),
  );
  return Promise.all(entries).then((pairs) => Object.fromEntries(pairs) as Record<SheetName, HTMLImageElement>);
}
```

- [ ] **Step 2: Write draw.ts**

`src/render/draw.ts` - full canvas pass. The essential parts:

```ts
import { ARENA, gapOf } from "../combat/engine";
import { lastLines } from "../combat/log";
import { zoneFor } from "../combat/measure";
import { pickFrame } from "./frames";
import { SHEETS } from "./sheets";
import type { AiMode } from "../combat/ai";
import type { Duel } from "../combat/engine";
import type { Fighter } from "../combat/fighter";
import type { SheetName } from "./sheets";

export const SCALE = 3;

export interface View {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  overlay: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  pretempo: "#8a8f98", windup: "#e6c229", beat: "#e6c229", strike: "#d64541",
  recovery: "#57a55a", void: "#4aa3df", parry: "#9b8cff", step: "#cfd3da",
  pause: "#cfd3da", hitstun: "#d64541", dead: "#555a63", idle: "#8a8f98",
};

export function drawFrame(v: View, d: Duel, aiMode: AiMode): void {
  const { ctx } = v;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 960, 540);
  // floor
  ctx.fillStyle = "#2a2e36";
  ctx.fillRect(0, ARENA.floorY, 960, 540 - ARENA.floorY);

  if (v.overlay) drawMeasureBands(v, d);
  drawFighter(v, d.f[0], d.time);
  drawFighter(v, d.f[1], d.time);
  if (v.overlay) {
    drawPhaseLabel(v, d.f[0]);
    drawPhaseLabel(v, d.f[1]);
    drawLog(v, d);
  }
  drawHud(v, d, aiMode);
  if (d.over) drawBanner(v, d);
}

function drawFighter(v: View, f: Fighter, time: number): void {
  const { ctx } = v;
  const pick = pickFrame(f, time);
  const meta = SHEETS[pick.sheet];
  const img = v.images[pick.sheet];
  const sx = pick.frame * meta.frameW;
  const dy = ARENA.floorY - meta.feetY * SCALE;
  ctx.save();
  ctx.translate(f.x, 0);
  if (pick.flip) ctx.scale(-1, 1);
  ctx.drawImage(
    img, sx, 0, meta.frameW, meta.frameH,
    -meta.originX * SCALE, dy, meta.frameW * SCALE, meta.frameH * SCALE,
  );
  ctx.restore();
}

function drawMeasureBands(v: View, d: Duel): void {
  const { ctx } = v;
  const tints = ["#c9a227", "#4aa3df"]; // fighter 0 gold, fighter 1 blue
  d.f.forEach((f, i) => {
    const y = ARENA.floorY + 14 + i * 12;
    const dir = f.facing;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = tints[i];
    ctx.fillRect(f.x, y, dir * f.weapon.reach, 5); // narrow
    ctx.globalAlpha = 0.18;
    ctx.fillRect(f.x + dir * f.weapon.reach, y, dir * f.weapon.stepDistance, 5); // wide
    ctx.globalAlpha = 1;
    ctx.fillStyle = tints[i];
    ctx.font = "10px ui-monospace, monospace";
    const zone = zoneFor(gapOf(d), f.weapon);
    ctx.fillText(`${f.weapon.name}: ${zone}`, f.x + (dir === 1 ? 4 : -70), y + 14);
  });
}
```

Plus `drawPhaseLabel` (state kind or attack phase, colored via PHASE_COLORS, 12px text centered ~180px above floor at f.x), `drawLog` (`lastLines(d.log, 8)`, right-aligned column at x=955 text-align right, y from 24), `drawHud` (two cards: fillRect 8,8,290,84 and 662,8,290,84 with alpha 0.75 background #232830; lines: weapon name + "you"/"AI mode N"; `reach NNN` plus a reach bar `fillRect(x, y, reach * 0.6, 4)`; "cut: 2 tempi / thrust: 1 tempo" for longsword, "thrust: 1 tempo / cut: poor" for rapier; controls line at bottom: `A/D step S void J cut K thrust L parry | 0/1/2 AI mode R rematch Esc select \` overlay`), and `drawBanner` (when over: 28px centered text at 960/2,240: winner === "draw" ? "MUTUAL DEATH - draw" : `${d.f[winner].weapon.name.toUpperCase()} KILLS - R to rematch, Esc to reselect`).

- [ ] **Step 3: Replace main.ts**

`src/main.ts`:
```ts
import { aiDecide, createAiState } from "./combat/ai";
import { TICK } from "./combat/fighter";
import { createDuel, tickDuel } from "./combat/engine";
import { WEAPONS } from "./combat/weapons";
import { drawFrame } from "./render/draw";
import { loadImages } from "./render/loader";
import type { AiMode } from "./combat/ai";
import type { Duel } from "./combat/engine";
import type { Intent, WeaponId } from "./combat/types";
import type { View } from "./render/draw";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("no 2d context");

const params = new URLSearchParams(location.search);
const pick = (key: string, fallback: WeaponId): WeaponId => {
  const v = params.get(key);
  return v === "longsword" || v === "rapier" ? v : fallback;
};

const state = {
  pWeapon: pick("p", "longsword"),
  eWeapon: pick("e", "rapier"),
  aiMode: (["0", "1", "2"].includes(params.get("mode") ?? "") ? Number(params.get("mode")) : 0) as AiMode,
  overlay: params.get("overlay") !== "0",
  duel: null as Duel | null,
  ai: createAiState(),
  held: { advance: false, retreat: false },
  pending: null as Intent | null,
};

function startDuel(): void {
  state.duel = createDuel(WEAPONS[state.pWeapon], WEAPONS[state.eWeapon]);
  state.ai = createAiState();
  state.pending = null;
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case "a": state.held.retreat = true; break;
    case "d": state.held.advance = true; break;
    case "s": state.pending = "void"; break;
    case "j": state.pending = "cut"; break;
    case "k": state.pending = "thrust"; break;
    case "l": state.pending = "parry"; break;
    case "0": state.aiMode = 0; break;
    case "1": state.aiMode = 1; break;
    case "2": state.aiMode = 2; break;
    case "r": startDuel(); break;
    case "`": state.overlay = !state.overlay; break;
  }
});
document.addEventListener("keyup", (e) => {
  switch (e.key.toLowerCase()) {
    case "a": state.held.retreat = false; break;
    case "d": state.held.advance = false; break;
  }
});

loadImages().then((images) => {
  const view: View = { ctx, images, overlay: state.overlay };
  startDuel();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number): void => {
    acc += Math.min(now - last, 250);
    last = now;
    const d = state.duel;
    if (d) {
      while (acc >= TICK) {
        acc -= TICK;
        let ia: Intent | null = state.pending;
        state.pending = null;
        if (ia === null && state.held.advance) ia = "advance";
        if (ia === null && state.held.retreat) ia = "retreat";
        const ib = aiDecide(d, state.aiMode, state.ai, TICK);
        tickDuel(d, ia, ib);
      }
      view.overlay = state.overlay;
      drawFrame(view, d, state.aiMode);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}).catch((err: Error) => {
  ctx.fillStyle = "#d64541";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText(`sprite load failed: ${err.message}`, 20, 30);
});
```

- [ ] **Step 4: Verify build and tests**

Run: `npm test && npm run build`
Expected: PASS / build OK.

- [ ] **Step 5: Chrome animation verification (the user's explicit requirement)**

Start the root dev server: `cd /Users/janis.kirsteins/Projects/prototypes && npm run dev` (background). Open `http://127.0.0.1:4173/prototypes/06/?p=longsword&e=rapier&mode=0` with the Chrome devtools MCP.

Checklist (screenshot at each point, compare feet position against the floor line):
1. Idle both fighters: feet planted at floorY, enemy correctly mirrored, 10-frame idle loops smoothly. Take 2 screenshots ~400ms apart.
2. Hold D through 3 chained steps: screenshot mid-step and at pause; feet never leave the floor, no horizontal teleport at step/pause boundaries.
3. Press J (cut, 64x64 sheet): screenshots during windup, beat, strike, recovery. The character must NOT sink/jump when the sheet switches 48x48 -> 64x64 (this is what feetY=60 for swordAttack corrects; if it jumps, adjust `SHEETS.swordAttack.feetY/originX` and re-check).
4. Press K (thrust, 96x48 sheet): same check; the blade should extend toward the enemy, body stays planted (originX correction).
5. Press S (void): roll plays moving backward, ends in idle at exactly voidDistance back.
6. Mode 2 (`press 2`), stand in enemy reach, get hit deliberately: hurt then death animation, no frame bleed (death sheet is the misnamed one - a wrong frameW would show two half-characters; the metadata test already guards this, but eyeball it).
7. `?p=rapier&e=longsword`: rapier thrust visibly faster (1.15x vs 0.85x anim speed), steps visibly quicker.
Fix any anchor drift by editing ONLY `feetY`/`originX` in `sheets.ts`, re-screenshot until stable.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/render/draw.ts 06-dueling/src/render/loader.ts 06-dueling/src/main.ts 06-dueling/src/render/sheets.ts
git commit -m "feat(dueling): canvas renderer, game loop, input; verified animations in Chrome"
```

---

### Task 13: Select screen + Esc flow

**Files:**
- Create: `06-dueling/src/ui/select.ts`
- Modify: `06-dueling/src/main.ts`, `06-dueling/index.html`

**Interfaces:**
- Produces: `showSelect(current: { p: WeaponId; e: WeaponId }, onStart: (p: WeaponId, e: WeaponId) => void): void`, `hideSelect(): void` from `src/ui/select.ts`. DOM overlay div `#select` added to index.html.

- [ ] **Step 1: Add the overlay markup and styles to index.html**

Inside `<body>` before the script tag:
```html
    <div id="select" hidden>
      <h1>Choose the swords</h1>
      <div class="cols">
        <div class="col" data-col="p"><h2>You</h2></div>
        <div class="col" data-col="e"><h2>Opponent (AI)</h2></div>
      </div>
      <p class="hint">A/D switch column - W/S switch sword - 1/2 direct pick - Enter to duel</p>
    </div>
```
And styles in `<head>`:
```css
      #select { position: fixed; inset: 0; background: rgba(16,18,22,0.96);
        display: flex; flex-direction: column; align-items: center; justify-content: center; }
      #select .cols { display: flex; gap: 48px; }
      #select .col { width: 300px; }
      #select .option { border: 1px solid #3a404c; padding: 10px 12px; margin: 8px 0; }
      #select .option.picked { border-color: #e6c229; }
      #select .col.active h2 { color: #e6c229; }
      #select .hint { color: #8a8f98; margin-top: 24px; }
      #select .bar { height: 4px; background: #4aa3df; }
```

- [ ] **Step 2: Write select.ts**

`src/ui/select.ts`:
```ts
import { WEAPONS } from "../combat/weapons";
import type { WeaponId } from "../combat/types";

const IDS: WeaponId[] = ["longsword", "rapier"];

interface SelectState {
  p: WeaponId;
  e: WeaponId;
  activeCol: "p" | "e";
  onStart: (p: WeaponId, e: WeaponId) => void;
}

let sel: SelectState | null = null;

export function showSelect(current: { p: WeaponId; e: WeaponId }, onStart: SelectState["onStart"]): void {
  sel = { p: current.p, e: current.e, activeCol: "p", onStart };
  render();
  const el = document.getElementById("select");
  if (el) el.hidden = false;
  document.addEventListener("keydown", onKey);
}

export function hideSelect(): void {
  sel = null;
  const el = document.getElementById("select");
  if (el) el.hidden = true;
  document.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (!sel) return;
  const k = e.key.toLowerCase();
  if (k === "a" || k === "arrowleft") sel.activeCol = "p";
  else if (k === "d" || k === "arrowright") sel.activeCol = "e";
  else if (k === "w" || k === "s" || k === "arrowup" || k === "arrowdown") toggle();
  else if (k === "1") set(IDS[0]);
  else if (k === "2") set(IDS[1]);
  else if (k === "enter") { const { p, e: ew, onStart } = sel; hideSelect(); onStart(p, ew); return; }
  else return;
  e.preventDefault();
  render();
}

function toggle(): void {
  if (!sel) return;
  const cur = sel[sel.activeCol];
  set(cur === "longsword" ? "rapier" : "longsword");
}

function set(id: WeaponId): void {
  if (sel) sel[sel.activeCol] = id;
}

function render(): void {
  if (!sel) return;
  for (const colKey of ["p", "e"] as const) {
    const col = document.querySelector(`#select .col[data-col="${colKey}"]`);
    if (!col) continue;
    col.classList.toggle("active", sel.activeCol === colKey);
    for (const old of col.querySelectorAll(".option")) old.remove();
    for (const id of IDS) {
      const w = WEAPONS[id];
      const div = document.createElement("div");
      div.className = `option${sel[colKey] === id ? " picked" : ""}`;
      const cutLine = id === "longsword" ? "cut: 2 tempi, thrust: 1 tempo" : "thrust: 1 tempo, cut: poor";
      div.innerHTML = `<strong>${w.name}</strong><div class="bar" style="width:${w.reach * 0.8}px"></div>
        <small>reach ${w.reach} - ${cutLine}<br>${w.identity}</small>`;
      col.appendChild(div);
    }
  }
}
```

- [ ] **Step 3: Wire into main.ts**

Changes to `src/main.ts`:
- Import `{ hideSelect, showSelect }` from `./ui/select`.
- Boot logic: if the URL has `p` or `e` params, start the duel immediately (browser-check convention); otherwise `showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => { state.pWeapon = p; state.eWeapon = e; startDuel(); })`.
- Add to keydown switch: `case "escape": if (state.duel) { state.duel = null; showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => { state.pWeapon = p; state.eWeapon = e; startDuel(); }); } break;`
- Guard the game keydown handler: ignore game keys while `state.duel === null` (select screen owns the keyboard then; note both A/D handlers).

- [ ] **Step 4: Verify in Chrome**

`npm test && npm run build`, then with the root dev server:
1. `http://127.0.0.1:4173/prototypes/06/` -> select screen appears, A/D moves the highlight, W/S toggles, reach bars visibly different (rapier longer), Enter starts the duel.
2. Esc mid-duel returns to select; previous picks remembered.
3. `?p=rapier&e=longsword&mode=1` boots straight into the duel, no select screen.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/src/ui/select.ts 06-dueling/src/main.ts 06-dueling/index.html
git commit -m "feat(dueling): weapon select screen with URL-bootable matchups"
```

---

### Task 14: README with HEMA feature matrix + full verification

**Files:**
- Create: `06-dueling/README.md`

**Interfaces:** none (documentation), but the matrix content is a user requirement.

- [ ] **Step 1: Write README.md**

`06-dueling/README.md`:
```markdown
# 06 - Dueling

A 2D HEMA fencing duel prototype: measure and tempo as the whole game.
Spec: `docs/superpowers/specs/2026-08-01-hema-duel-mvp-design.md`.

## Run

From the repo root: `npm run dev`, then open
`http://127.0.0.1:4173/prototypes/06/`.
Boot straight into a matchup: `/prototypes/06/?p=rapier&e=longsword&mode=1`.

## Controls

- A / D: step back / forward (discrete, buffered)
- S: void (back-hop off the line)
- J: cut (2 tempi), K: thrust (1 tempo)
- L: parry
- 0 / 1 / 2: AI mode (passive / parry-only / attack-in-place)
- R: rematch, Esc: sword select, backtick: debug overlay

## HEMA feature matrix

What the source design doc covers vs what this prototype implements.

| Concept | Status |
|---|---|
| Measure zones (out/wide/narrow) | implemented (per weapon, asymmetric, drawn on the floor) |
| Grappling measure | not in MVP |
| Tempo: committed attacks with readable cascade | implemented (windup/beat/strike/recovery; pretempo tell on AI attacks only) |
| Primo tempo / mezzo tempo / Nachreisen | partial (recognized and named in the event log when they happen; not separate mechanics) |
| Contratempo (strike into strike) | partial (simultaneous strikes resolve, can draw; no geometry advantage) |
| Void | implemented (backward only) |
| Offline/directional void | not in MVP (2D lateral abstraction undecided) |
| Parry (dui tempi) | implemented (resolves to neutral + counter window; no bind state) |
| Bind mini-game, fuehlen, hart/weich | not in MVP |
| Winden / Absetzen / Ringen am Schwert | not in MVP |
| Feints | not in MVP (void/parry decision is therefore not yet live) |
| Recovery windows varying by attack and outcome | implemented (whiff recovery > parried recovery > clean recovery, tested) |
| Multiple attack lines (high/low) | not in MVP |
| Weapons as measure/tempo profiles, not stats | implemented (longsword, rapier) |
| Other weapons (smallsword, spear, dagger, poleaxe, messer) | not in MVP |
| Footwork coupled to weapon | partial (per-weapon step size/duration/cadence; no passing/compass steps) |
| Cut vs thrust distinction | implemented (different timings per weapon; no armor interactions) |
| Half-swording, Mordschlag | not in MVP |
| Matchup asymmetry | partial (reach/tempo asymmetry only; one contested pairing) |
| Enemy movement AI / personalities | not in MVP (dummy modes 0/1/2 only) |
| Terrain as matchup tool | not in MVP |
| Audio tempo cues | not in MVP |

## Verifying HEMA behavior solo

Turn the overlay on (default), set mode 2, and check: standing in the enemy's
wide band draws attacks; voiding during its strike produces "misses ->
Nachreisen" and your counter thrust kills into recovery; parrying produces
"parried -> dui tempi" with a tighter window. Mode 1 validates your own
cascade: its parry catches your thrust but leaves it committed on cooldown.
```

- [ ] **Step 2: Full verification**

```bash
cd /Users/janis.kirsteins/Projects/prototypes/06-dueling && npm test && npm run build
cd /Users/janis.kirsteins/Projects/prototypes && npm run lint
```
Expected: all pass. Then a final Chrome pass through the root dev server (`/prototypes/` front door -> click "06 - Dueling"): play one full exchange per AI mode with each weapon matchup; confirm the log narrates in HEMA terms and the banner + R/Esc work.

- [ ] **Step 3: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 06-dueling/README.md
git commit -m "docs(dueling): README with run instructions and HEMA feature matrix"
```

---

### Task 15: Publish

- [ ] **Step 1: Confirm with the user, then push**

Pushing `main` triggers the Pages workflow that builds every `NN-*` directory. Ask the user before pushing (shared repo, concurrent sessions). After push: verify the workflow succeeds and `https://<pages-domain>/prototypes/06/` loads, select screen and sprites included (asset paths depend on the `base` setting - this is the production check that catches a wrong base).

---

## Self-review notes

- Spec coverage: scaffold+link (T1), sprites+metadata test (T2), profiles+tempo economics (T3), measure (T4), fighter FSM (T5-7), resolution+events (T8), AI modes (T9), log (T10), animation mapping (T11), renderer+loop+Chrome pass (T12), select+URL boot (T13), README matrix+final verify (T14), Pages (T15). Spec section 8 error handling: loader catch in T12 main.ts, clamps in T8, illegal-transition guards are the `applyIntent` return values.
- Type consistency: `Fighter`/`FighterState`/`applyIntent`/`tickFighter` defined once in T5 and only extended in place in T6/T7. `DuelEvent.kind` strings used by T9/T10 tests match T8's `emit` calls. `counterTime` defined in T3, used conceptually by T3 tests only.
- Known judgment calls delegated to the implementer with explicit options: T7 removing unused start events, T9 mode-1 parry timing (thrust test or re-raise), T12 anchor corrections limited to `sheets.ts` metadata.
