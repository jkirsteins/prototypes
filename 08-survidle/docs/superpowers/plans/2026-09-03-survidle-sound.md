# Survidle Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the game a soundscape: ambience beds for the ground, water, weather and fire around the player; calls from the species that live here at the hours they call, with wolves howling by the moon; and the sound of the work and its one-shot events.

**Architecture:** The sim stays pure and deterministic. `src/sim/soundscape.ts` answers questions (what surrounds the player, which beds and calls are open, what the current task sounds like) and `src/sim/cues.ts` is a sink the sim pokes for one-shots. `src/audio/` owns Web Audio: a manifest of slots, an engine with three buses, a scheduler that runs on real seconds with `Math.random`, and a static control. The moon is added to the calendar and drawn in the sky.

**Tech Stack:** TypeScript, Web Audio API, Vite static assets under `public/audio/`, ffmpeg (libopus) for conversion, vitest. No new npm dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-species-and-sound-design.md`, section 4 (all subsections), section 6 for the tests, section 7 for the docs. Depends on the species plan (`2026-09-03-survidle-species.md`) having landed: `SPECIES_DEFS[s].calls`, `speciesHere`, `regionDensity`, `waterKindOf`.

## Global Constraints

- The sim never calls `Math.random` and never consumes the seeded rng for sound. Only `src/audio/` may use `Math.random`, and only through an injected `random` so tests can pin it.
- Only `src/audio/engine.ts` touches `AudioContext`. Everything else in `src/audio/` takes the engine as an interface.
- `npm test` and `npm run build` must pass before every commit; run from `08-survidle/`. Tests run in happy-dom, which has no `AudioContext`: the engine is checked in Chrome, everything around it is unit-tested.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`.
- No em dashes, no non-typable characters anywhere, including the UI control ("Sound", not a speaker glyph).
- Comments explain, never chronicle.
- Silence over a wrong sound: a slot with no fitting recording is left out of `SLOTS` and listed under "Silent slots" in `public/audio/manifest.md`. A generic "bird" is not a loon.
- Non-CC0 recordings go under "Replace before distribution" in `manifest.md` with source, author and licence.
- Assets load from `${import.meta.env.BASE_URL}audio/<file>`, never an absolute `/audio/` path.

---

## File map

| File | Responsibility |
|---|---|
| `src/sim/calendar.ts` | `moonPhase`, `moonIllumination`, `Calendar.moon`, `Calendar.moonLight` |
| `src/ui/sky.ts` | the crescent |
| `src/sim/cues.ts` (new) | `Cue`, `cue()`, `setCueSink()` |
| `src/sim/tasks.ts`, `src/sim/events.ts` | call `cue()` at the events |
| `src/sim/soundscape.ts` (new) | `surroundings`, `ambienceMix`, `openCalls`, `activityLoop`, `windowOpen` (pure) |
| `src/audio/manifest.ts` (new) | `SLOTS: Record<Slot, SlotDef>` |
| `src/audio/settings.ts` (new) | `AudioSettings`, load and save to `localStorage` |
| `src/audio/engine.ts` (new) | `AudioEngine`, `createAudioEngine` (Web Audio) |
| `src/audio/scheduler.ts` (new) | `createScheduler`: beds, calls, activity loops, cues, on real time |
| `src/audio/control.ts` (new) | the Sound control's DOM wiring |
| `src/main.ts`, `index.html`, `src/style.css` | wiring, the static control |
| `public/audio/*.ogg`, `public/audio/manifest.md` | the recordings and their provenance |
| `scripts/audio-sources.json`, `scripts/audio-fetch.mjs` | how the recordings were fetched and converted |
| `tests/calendar.test.ts`, `tests/sky.test.ts`, `tests/cues.test.ts`, `tests/soundscape.test.ts`, `tests/scheduler.test.ts`, `tests/audio-settings.test.ts` | |

---

### Task 1: The moon

**Files:**
- Modify: `src/sim/calendar.ts`
- Modify: `src/ui/sky.ts` (`skyHtml`, `updateSky`)
- Test: `tests/calendar.test.ts`, `tests/sky.test.ts`

**Interfaces:**
- Produces: `moonPhase(minute): number` (0 new, 0.5 full, in [0, 1)), `moonIllumination(minute): number` (0..1), `Calendar.moon: number`, `Calendar.moonLight: number`, `SYNODIC_DAYS = 29.530588`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/calendar.test.ts`:

```ts
import { moonIllumination, moonPhase, SYNODIC_DAYS } from "../src/sim/calendar";

describe("the moon", () => {
  it("runs a synodic month, full on 3 April, dark at new", () => {
    const day = (d: number) => 1440 * (d - 1) + 4 * 60;   // noon of run day d (the run starts at 08:00)
    expect(moonPhase(day(3))).toBeCloseTo(0.5, 1);
    expect(moonIllumination(day(3))).toBeGreaterThan(0.97);
    expect(moonIllumination(day(3 + SYNODIC_DAYS / 2))).toBeLessThan(0.03);
    expect(moonPhase(day(3 + SYNODIC_DAYS))).toBeCloseTo(0.5, 1);
    for (let m = 0; m < 1440 * 60; m += 977) {
      expect(moonPhase(m)).toBeGreaterThanOrEqual(0);
      expect(moonPhase(m)).toBeLessThan(1);
    }
    const c = calendar(day(3));
    expect(c.moon).toBeCloseTo(0.5, 1);
    expect(c.moonLight).toBeGreaterThan(0.97);
  });
});
```

Append to `tests/sky.test.ts` (it already imports `calendar`, `newGame` and `updateSky`; add `skyHtml` to the sky import):

```ts
it("draws the moon's shadow to the left while waxing, to the right while waning, over it at new and clear of it at full", () => {
  const { state } = newGame(1);
  const root = document.createElement("div");
  root.innerHTML = skyHtml();
  /** Shadow offset from the moon at 00:00 after run day d (the run starts at 08:00, so +16 h is midnight). */
  const shadowX = (d: number) => {
    updateSky(state, calendar(1440 * (d - 1) + 16 * 60), 0, root);
    const moon = Number(root.querySelector("#sky-moon")!.getAttribute("cx"));
    const shadow = Number(root.querySelector("#sky-moon-shadow")!.getAttribute("cx"));
    return shadow - moon;
  };
  // Full on 3 April (run day 3): the shadow is a whole diameter aside.
  expect(Math.abs(shadowX(3))).toBeGreaterThan(9);
  // New about 18 April: the shadow sits on the moon.
  expect(Math.abs(shadowX(18))).toBeLessThan(0.6);
  // Waning a week after full: shadow right. Waxing a week before the next full (about 2 May): shadow left.
  expect(shadowX(9)).toBeGreaterThan(4);
  expect(shadowX(26)).toBeLessThan(-4);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/calendar.test.ts tests/sky.test.ts`
Expected: FAIL, `moonPhase` not exported.

- [ ] **Step 3: Implement the phase**

In `src/sim/calendar.ts`:

```ts
export const SYNODIC_DAYS = 29.530588;
/** Day index of a new moon, chosen so the run's first full moon is 3 April. */
const NEW_MOON_DAY = -12.4;

/** 0 at new, 0.5 at full, in [0, 1). */
export function moonPhase(minute: number): number {
  const days = (minute + START_MINUTE_OF_DAY) / 1440;
  const p = ((days - NEW_MOON_DAY) / SYNODIC_DAYS) % 1;
  return p < 0 ? p + 1 : p;
}

/** Lit share of the disc, 0 at new to 1 at full. */
export function moonIllumination(minute: number): number {
  return (1 - Math.cos(2 * Math.PI * moonPhase(minute))) / 2;
}
```

Add `moon: number; moonLight: number;` to `Calendar` (with comments "phase, 0 new to 0.5 full" and "illumination 0..1") and set `moon: moonPhase(minute), moonLight: moonIllumination(minute)` in `calendar()`.

- [ ] **Step 4: The crescent**

In `skyHtml`, after the `sky-moon` circle add:

```html
<circle id="sky-moon-shadow" cx="${CX - ARC_R}" cy="${GROUND_Y}" r="5.4" fill="#4682d2" opacity="0"/>
```

In `updateSky`, after the moon lines:

```ts
  // A disc of sky laid over the moon, slid aside by how much of it is lit: left while waxing, right while waning.
  const r = 5;
  const offset = 2 * r * cal.moonLight * (cal.moon < 0.5 ? -1 : 1);
  setAttr(root, "sky-moon-shadow", "cx", f(pos.body === "moon" ? pos.x + offset : CX - ARC_R));
  setAttr(root, "sky-moon-shadow", "cy", f(pos.body === "moon" ? pos.y : GROUND_Y + 8));
  setAttr(root, "sky-moon-shadow", "fill", light.skyTop);
  setAttr(root, "sky-moon-shadow", "opacity", pos.body === "moon" ? "1" : "0");
```

At new moon the offset is 0 and the shadow covers the moon; at full it is `2r` aside and clear of it; the crescent between is the moon's disc minus the shadow's.

- [ ] **Step 5: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/calendar.test.ts tests/sky.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/calendar.ts 08-survidle/src/ui/sky.ts 08-survidle/tests/calendar.test.ts 08-survidle/tests/sky.test.ts
git commit -m "feat(survidle): the moon has phases, and the sky strip shows the crescent"
```

---

### Task 2: Cues from the sim

**Files:**
- Create: `src/sim/cues.ts`
- Modify: `src/sim/tasks.ts` (`complete` chop, hunt, fish, light, lightTorch; `stepWalk`; `fallThrough`; the three tool-break logs), `src/sim/events.ts` (wolves)
- Test: `tests/cues.test.ts`

**Interfaces:**
- Produces: `type Cue = "treeFalls" | "arrow" | "spear" | "fireCatches" | "torchLit" | "iceCracks" | "fallThrough" | "toolBreaks" | "wolves"`, `cue(c: Cue): void`, `setCueSink(fn: ((c: Cue) => void) | null): void`.

- [ ] **Step 1: Write the failing test**

`tests/cues.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { type Cue, cue, setCueSink } from "../src/sim/cues";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { fallThrough, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("cues", () => {
  afterEach(() => setCueSink(null));

  it("reach the sink, and nothing happens without one", () => {
    const got: Cue[] = [];
    cue("arrow");
    setCueSink((c) => got.push(c));
    cue("arrow");
    cue("wolves");
    expect(got).toEqual(["arrow", "wolves"]);
    setCueSink(null);
    cue("arrow");
    expect(got).toHaveLength(2);
  });

  it("a felled tree, a lit fire and a fall through the ice each sound once", () => {
    const got: Cue[] = [];
    setCueSink((c) => got.push(c));
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, cal, "chop")).toBe(true);
    const rng = new Rng(1);
    for (let i = 0; i < 400 && state.task; i++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(got.filter((c) => c === "treeFalls")).toHaveLength(1);

    placeAtSpot(state, world, state.player.region, "camp");
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100, litres: 0, frozen: false });
    addItem(state.player.pack, "firewood", 5);
    expect(startTask(state, world, cal, "light")).toBe(true);
    for (let i = 0; i < 400 && state.task; i++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(got.filter((c) => c === "fireCatches")).toHaveLength(st.fire.lit ? 1 : 0);

    // A fall that is survived (rng seeded so the 60% drowning roll misses): find a seed whose first roll is above 0.6.
    let seed = 1;
    while (new Rng(seed).next() < 0.6) seed++;
    fallThrough(state, world, new Rng(seed), st.campCell);
    expect(got.filter((c) => c === "fallThrough")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/cues.test.ts`
Expected: FAIL, cannot find `../src/sim/cues`.

- [ ] **Step 3: The sink**

`src/sim/cues.ts`:

```ts
/**
 * One-shot sounds the sim announces. The sim knows nothing about audio; it
 * names the moment and whoever installed a sink hears it. With no sink,
 * a cue is nothing, so tests and offline catch-up run silent for free.
 */
export type Cue =
  | "treeFalls" | "arrow" | "spear" | "fireCatches" | "torchLit"
  | "iceCracks" | "fallThrough" | "toolBreaks" | "wolves";

let sink: ((c: Cue) => void) | null = null;

export function setCueSink(fn: ((c: Cue) => void) | null): void {
  sink = fn;
}

export function cue(c: Cue): void {
  sink?.(c);
}
```

- [ ] **Step 4: The call sites**

In `src/sim/tasks.ts`, `import { cue } from "./cues";` and:

- `complete` `chop`: first line of the case, `cue("treeFalls");`.
- `complete` `hunt` (species branch, not the arg check): before `if (rng.chance(huntOdds(...)))`, `cue("arrow");`. After `if (wearTool(p, "bow", ...)) log(...)`, make it `if (wearTool(...)) { cue("toolBreaks"); log(...); }`.
- `complete` `fish`: `cue("spear");` before the odds roll; the spear-splits log likewise gets `cue("toolBreaks")`.
- `complete` `chop`: the axe-head-splits log gets `cue("toolBreaks")`.
- `complete` `light`: right after `st.fire.lit = true;`, `cue("fireCatches");`.
- `complete` `lightTorch`: after `p.torch = {...}`, `cue("torchLit");`.
- `stepWalk`: inside `if (terrain === "water")`, before the fall roll, `if (state.weather.iceCm < ICE_SAFE_CM) cue("iceCracks");`.
- `fallThrough`: first line, `cue("fallThrough");` (before the drowning roll: the ice breaks whether or not you get out).

In `src/sim/events.ts`, inside the wolf attack block before the log, `cue("wolves");`.

- [ ] **Step 5: Run the tests**

Run: `cd 08-survidle && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/cues.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/events.ts 08-survidle/tests/cues.test.ts
git commit -m "feat(survidle): the sim names the moments that sound; a cue sink hears them"
```

---

### Task 3: What the sim tells the audio

**Files:**
- Create: `src/sim/soundscape.ts`
- Test: `tests/soundscape.test.ts`

**Interfaces:**
- Consumes: `speciesHere`, `regionDensity`, `waterKindOf`, `cellAt`, `cellOf`, `atCamp`, `sheltered`, `regionState`, `FIRE_LOW_KG`, `ICE_THIN_CM`, `SPECIES_DEFS`, `Calendar.moonLight`.
- Produces:

```ts
export type Footing = "leaves" | "grass" | "bog" | "rock" | "snow" | "ice";
export interface Surroundings { forest: number; birch: number; open: number; bog: number; lake: number; sea: number; footing: Footing; frozen: boolean; fire: "none" | "torch" | "low" | "fed"; indoors: boolean; rain: "none" | "light" | "heavy"; storm: boolean }
export function surroundings(state, world, ambient): Surroundings;
export function windowOpen(when: Call["when"], cal: Calendar): boolean;
export function ambienceMix(s: Surroundings, cal: Calendar, ambient: number): Record<string, number>;
export interface OpenCall { slot: string; rate: number }
export function openCalls(state, world, cal): OpenCall[];
export function activityLoop(state, s: Surroundings): { slot: string; period: number } | null;
```

- [ ] **Step 1: Write the failing tests**

`tests/soundscape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { activityLoop, ambienceMix, openCalls, surroundings, type Surroundings, windowOpen } from "../src/sim/soundscape";
import { cellAt, regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { FIRE_LOW_KG } from "../src/sim/items";
import type { Species } from "../src/sim/species";

const base: Surroundings = { forest: 0, birch: 0, open: 0, bog: 0, lake: 0, sea: 0, footing: "grass", frozen: false, fire: "none", indoors: false, rain: "none", storm: false };
/** Minutes for a clock hour on run day d. */
const at = (d: number, hour: number) => 1440 * (d - 1) + (hour - 8) * 60;
const JUNE = 62;   // run day of 1 June
const JAN = 276;

describe("surroundings", () => {
  it("reads the footing from the ground, snow and ice", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    const on = (t: string) => r.cells.find((c) => cellAt(world, c).terrain === t);
    const forest = on("spruce") ?? on("pine");
    placeAt(state, world, forest!);
    expect(surroundings(state, world, 10).footing).toBe("leaves");
    expect(surroundings(state, world, 10).forest).toBeGreaterThan(0);
    const meadow = on("meadow");
    if (meadow) {
      placeAt(state, world, meadow);
      expect(surroundings(state, world, 10).footing).toBe("grass");
    }
    const bog = on("bog");
    if (bog) {
      placeAt(state, world, bog);
      expect(surroundings(state, world, 10).footing).toBe("bog");
    }
    state.weather.snowCm = 6;
    placeAt(state, world, forest!);
    expect(surroundings(state, world, -3).footing).toBe("snow");
    state.weather.snowCm = 0;
    const water = on("water");
    if (water) {
      state.weather.iceCm = 20;
      placeAt(state, world, water);
      expect(surroundings(state, world, -3).footing).toBe("ice");
      expect(surroundings(state, world, -3).frozen).toBe(true);
    }
  });

  it("knows the fire, the roof and the rain", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "camp");
    const st = regionState(state, world, state.player.region);
    expect(surroundings(state, world, 10).fire).toBe("none");
    st.fire.lit = true;
    st.fire.fuelKg = FIRE_LOW_KG - 1;
    expect(surroundings(state, world, 10).fire).toBe("low");
    st.fire.fuelKg = 20;
    expect(surroundings(state, world, 10).fire).toBe("fed");
    st.fire.lit = false;
    state.player.torch = { lit: true, minutes: 30 };
    expect(surroundings(state, world, 10).fire).toBe("torch");
    state.weather.precip = "heavy";
    expect(surroundings(state, world, 5).rain).toBe("heavy");
    expect(surroundings(state, world, -5).rain).toBe("none");
  });
});

describe("windows", () => {
  it("dawn is sunrise minus one to plus three, dusk sunset minus two to plus one", () => {
    const c = calendar(at(JUNE, 12));
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise - 0.5)))).toBe(true);
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise + 2.9)))).toBe(true);
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise + 3.1)))).toBe(false);
    expect(windowOpen("dusk", calendar(at(JUNE, c.sunset - 1)))).toBe(true);
    expect(windowOpen("dusk", calendar(at(JUNE, c.sunset + 1.1)))).toBe(false);
    expect(windowOpen("day", calendar(at(JUNE, 12)))).toBe(true);
    expect(windowOpen("night", calendar(at(JUNE, 12)))).toBe(false);
    expect(windowOpen("any", calendar(at(JUNE, 12)))).toBe(true);
  });
});

describe("ambience mix", () => {
  it("lake is quiet when frozen, fire is loud when fed, the chorus sings at a June dawn in birch", () => {
    const june = calendar(at(JUNE, 12));
    expect(ambienceMix({ ...base, lake: 0.4 }, june, 10).lake).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, lake: 0.4, frozen: true }, june, -5).lake ?? 0).toBe(0);
    expect(ambienceMix({ ...base, fire: "fed" }, june, 10).fire).toBe(1);
    expect(ambienceMix({ ...base, fire: "low" }, june, 10).fire).toBe(0.7);
    expect(ambienceMix({ ...base, fire: "torch" }, june, 10).fire).toBe(0.5);
    const dawn = calendar(at(JUNE, june.sunrise + 1));
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, dawn, 10).chorus).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, june, 10).chorus ?? 0).toBe(0);
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, calendar(at(JAN, 12)), -10).leaves ?? 0).toBe(0);
    expect(ambienceMix({ ...base, open: 1, storm: true }, june, 10).open).toBeGreaterThan(ambienceMix({ ...base, open: 1 }, june, 10).open);
    expect(ambienceMix({ ...base, rain: "heavy" }, june, 5).rain_heavy).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, bog: 0.5 }, calendar(at(JUNE + 20, 20)), 14).insects).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, bog: 0.5 }, calendar(at(JUNE + 20, 12)), 14).insects ?? 0).toBe(0);
  });
});

describe("open calls", () => {
  function regionWith(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], s: Species): number {
    for (let id = 0; id < LATTICE_W * LATTICE_H; id++) if (regionAt(world, id).capacity[s]) return id;
    throw new Error(`no ${s}`);
  }

  it("a loon calls on its lake at a June dusk, not in January, and an owl only where owls are", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "loon");
    placeAt(state, world, regionAt(world, id).campCell);
    const st = regionState(state, world, id);
    st.pop.loon = regionAt(world, id).capacity.loon;
    const c = calendar(at(JUNE, 12));
    const dusk = calendar(at(JUNE, c.sunset - 1));
    expect(openCalls(state, world, dusk).some((o) => o.slot === "loon")).toBe(true);
    expect(openCalls(state, world, calendar(at(JAN, 20))).some((o) => o.slot === "loon")).toBe(false);
    if (!regionAt(world, id).capacity.owl) expect(openCalls(state, world, calendar(at(JUNE, 1))).some((o) => o.slot === "owl")).toBe(false);
  });

  it("wolves howl to the moon", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "wolf");
    placeAt(state, world, regionAt(world, id).campCell);
    regionState(state, world, id).pop.wolf = regionAt(world, id).capacity.wolf;
    const full = calendar(at(3, 1));
    const dark = calendar(at(3 + 15, 1));
    expect(full.moonLight).toBeGreaterThan(0.95);
    expect(dark.moonLight).toBeLessThan(0.05);
    const rate = (cal: ReturnType<typeof calendar>) => openCalls(state, world, cal).find((o) => o.slot === "wolf")?.rate ?? 0;
    expect(rate(full)).toBeGreaterThan(3 * rate(dark));
    expect(rate(dark)).toBeGreaterThan(0);
    expect(rate(calendar(at(3, 13)))).toBe(0);
  });
});

describe("activity loop", () => {
  it("steps on the footing while walking, swings the axe while felling, is quiet asleep", () => {
    const { state } = newGame(3);
    state.task = { id: "walk", progress: 0, duration: 10, repeat: false };
    expect(activityLoop(state, { ...base, footing: "snow" })).toEqual({ slot: "step_snow", period: 0.6 });
    state.task = { id: "chop", progress: 0, duration: 50, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "axe", period: 1.5 });
    state.task = { id: "split", progress: 0, duration: 15, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "axe", period: 2 });
    state.task = { id: "craft", arg: "knife", progress: 0, duration: 45, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "knap", period: 1.2 });
    state.task = { id: "craft", arg: "cordage", progress: 0, duration: 20, repeat: false };
    expect(activityLoop(state, base)).toBeNull();
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    expect(activityLoop(state, base)).toBeNull();
    state.task = null;
    expect(activityLoop(state, base)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/soundscape.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`src/sim/soundscape.ts`:

```ts
/**
 * What the place sounds like, as questions the audio layer asks every
 * frame. Pure: reads the state, rolls nothing, plays nothing. The audio
 * layer turns these into loops and one-shots on its own clock.
 */
import { cellAt, regionAt, speciesHere, waterKindOf, type World } from "../world/gen";
import { regionDensity } from "./animals";
import type { Calendar } from "./calendar";
import { FIRE_LOW_KG } from "./items";
import { sheltered } from "./player";
import { atCamp, cellOf } from "./position";
import { regionState } from "./regionstate";
import { type Call, SPECIES_DEFS } from "./species";
import type { GameState, RecipeId, Terrain } from "./types";
import { ICE_THIN_CM } from "./weather";

export type Footing = "leaves" | "grass" | "bog" | "rock" | "snow" | "ice";

export interface Surroundings {
  /** Shares of the 5x5 cells around the player. forest is spruce, pine and birch; open is fell, rock, meadow and bog; bog is also given alone. */
  forest: number;
  birch: number;
  open: number;
  bog: number;
  lake: number;
  sea: number;
  footing: Footing;
  /** Standing water around is under ice. */
  frozen: boolean;
  fire: "none" | "torch" | "low" | "fed";
  indoors: boolean;
  rain: "none" | "light" | "heavy";
  storm: boolean;
}

/** Cells either side of the player counted for the surroundings. */
const REACH = 2;
/** Snow this deep is what you hear under foot. */
const SNOW_FOOTING_CM = 5;

function footingOf(t: Terrain, snowCm: number): Footing {
  if (t === "water") return "ice";
  if (snowCm >= SNOW_FOOTING_CM) return "snow";
  if (t === "bog") return "bog";
  if (t === "rock" || t === "fell") return "rock";
  if (t === "meadow") return "grass";
  return "leaves";
}

export function surroundings(state: GameState, world: World, ambient: number): Surroundings {
  const here = cellOf(state, world);
  const hx = here % world.w;
  const hy = Math.floor(here / world.w);
  let n = 0;
  let forest = 0;
  let birch = 0;
  let open = 0;
  let bog = 0;
  let lake = 0;
  let sea = 0;
  for (let dy = -REACH; dy <= REACH; dy++) {
    for (let dx = -REACH; dx <= REACH; dx++) {
      const x = hx + dx;
      const y = hy + dy;
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      const idx = y * world.w + x;
      const t = cellAt(world, idx).terrain;
      n++;
      if (t === "spruce" || t === "pine" || t === "birch") forest++;
      if (t === "birch") birch++;
      if (t === "fell" || t === "rock" || t === "meadow" || t === "bog") open++;
      if (t === "bog") bog++;
      if (t === "water") {
        if (waterKindOf(world, idx) === "sea") sea++;
        else lake++;
      }
    }
  }
  const st = regionState(state, world, state.player.region);
  const camp = atCamp(state, world);
  const fire: Surroundings["fire"] = camp && st.fire.lit ? (st.fire.fuelKg + st.fire.wetKg > FIRE_LOW_KG ? "fed" : "low") : state.player.torch.lit ? "torch" : "none";
  const w = state.weather;
  return {
    forest: forest / n, birch: birch / n, open: open / n, bog: bog / n, lake: lake / n, sea: sea / n,
    footing: footingOf(cellAt(world, here).terrain, w.snowCm),
    frozen: w.iceCm >= ICE_THIN_CM,
    fire,
    indoors: sheltered(state, world) && st.structures.cabin,
    rain: ambient > 0 ? w.precip : "none",
    storm: w.storm !== null && state.minute >= w.storm.from && state.minute < w.storm.until,
  };
}

/** Whether a call's window is open: dawn is sunrise -1 to +3, dusk is sunset -2 to +1, day and night follow the sun. */
export function windowOpen(when: Call["when"], cal: Calendar): boolean {
  const h = cal.hour;
  switch (when) {
    case "any": return true;
    case "day": return !cal.isNight;
    case "night": return cal.isNight;
    case "dawn": return h >= cal.sunrise - 1 && h < cal.sunrise + 3;
    case "dusk": return h >= cal.sunset - 2 && h < cal.sunset + 1;
  }
}

function inMonths(months: [number, number] | undefined, month: number): boolean {
  if (!months) return true;
  const [a, b] = months;
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/** Target gains for the ambience loops, by slot. Absent means silent. */
export function ambienceMix(s: Surroundings, cal: Calendar, ambient: number): Record<string, number> {
  const mix: Record<string, number> = {};
  const set = (slot: string, v: number) => { if (v > 0) mix[slot] = Math.min(1, v); };
  set("forest", s.forest);
  if (cal.month >= 4 && cal.month <= 8) set("leaves", s.birch);
  set("open", s.open * (s.storm ? 2 : 1));
  if (!s.frozen) set("lake", s.lake);
  set("sea", s.sea);
  if (s.rain === "light") set("rain_light", 1);
  if (s.rain === "heavy") set("rain_heavy", 1);
  if (s.fire === "torch") set("fire", 0.5);
  if (s.fire === "low") set("fire", 0.7);
  if (s.fire === "fed") set("fire", 1);
  if (cal.month >= 4 && cal.month <= 6 && windowOpen("dawn", cal)) set("chorus", s.forest);
  if (cal.month >= 5 && cal.month <= 7 && cal.hour >= 18 && cal.hour < 23 && ambient > 10) set("insects", s.bog + (s.open - s.bog) * 0.5);
  return mix;
}

export interface OpenCall { slot: string; /** calls per real minute */ rate: number }

/** Every call open now from a species that lives here above "tracks". */
export function openCalls(state: GameState, world: World, cal: Calendar): OpenCall[] {
  const region = state.player.region;
  const out: OpenCall[] = [];
  for (const s of speciesHere(regionAt(world, region))) {
    const def = SPECIES_DEFS[s];
    if (!def.calls) continue;
    const d = regionDensity(state, world, region, s, cal, state.weather.iceCm);
    if (d < 0.15) continue;
    for (const c of def.calls) {
      if (!windowOpen(c.when, cal) || !inMonths(c.months, cal.month)) continue;
      const rate = s === "wolf" ? 0.6 * d * (0.3 + 0.7 * cal.moonLight) : 0.5 * c.weight * d;
      out.push({ slot: c.sound, rate });
    }
  }
  return out;
}

const KNAPPED = new Set<RecipeId>(["knife", "axe", "arrows", "fishingSpear"]);

/** The repeating sound of the task under way: footsteps, the axe, the knapping stone. Null for everything else. */
export function activityLoop(state: GameState, s: Surroundings): { slot: string; period: number } | null {
  const t = state.task;
  if (!t) return null;
  switch (t.id) {
    case "walk": case "travel": return { slot: `step_${s.footing}`, period: 0.6 };
    case "chop": return { slot: "axe", period: 1.5 };
    case "split": return { slot: "axe", period: 2 };
    case "craft": return KNAPPED.has(t.arg as RecipeId) ? { slot: "knap", period: 1.2 } : null;
    default: return null;
  }
}
```

If `regionDensity`'s signature from the species plan does not take `iceCm`, drop that argument.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/soundscape.test.ts && npx tsc --noEmit`
Expected: PASS. If the June/January day constants are off by the calendar's leap-free months, adjust `JUNE` and `JAN` in the test (1 June is run day 62, 1 January is run day 276, from a 1 April start).

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/soundscape.ts 08-survidle/tests/soundscape.test.ts
git commit -m "feat(survidle): the sim can say what the place sounds like"
```

---

### Task 4: Manifest, settings and the engine

**Files:**
- Create: `src/audio/manifest.ts`, `src/audio/settings.ts`, `src/audio/engine.ts`
- Test: `tests/audio-settings.test.ts`

**Interfaces:**
- Produces:

```ts
// manifest.ts
export type Slot = string;
export interface SlotDef { files: string[]; kind: "loop" | "oneshot"; gain: number }
export const SLOTS: Record<Slot, SlotDef>;
// settings.ts
export interface AudioSettings { volume: number; muted: boolean; ambience: boolean }
export const DEFAULT_SETTINGS: AudioSettings;
export function loadSettings(storage?: Storage): AudioSettings;
export function saveSettings(s: AudioSettings, storage?: Storage): void;
// engine.ts
export interface AudioEngine {
  unlock(): void;
  ready(): boolean;
  setLoops(targets: Record<Slot, number>, indoors: boolean): void;
  /** delay is real seconds before the start: a thunderclap after its flash, once the wind sub-project brings one. */
  play(slot: Slot, opts?: { gain?: number; pan?: number; rate?: number; delay?: number }): void;
  settings(): AudioSettings;
  update(s: Partial<AudioSettings>): void;
  suspend(): void;
  resume(): void;
}
export function createAudioEngine(slots: Record<Slot, SlotDef>, storage?: Storage): AudioEngine;
```

- [ ] **Step 1: Write the failing test**

`tests/audio-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/audio/settings";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe("audio settings", () => {
  it("default to on, at 0.7, with ambience", () => {
    expect(loadSettings(memory())).toEqual({ volume: 0.7, muted: false, ambience: true });
    expect(DEFAULT_SETTINGS.volume).toBe(0.7);
  });

  it("round-trip, clamp the volume, and survive junk", () => {
    const s = memory();
    saveSettings({ volume: 1.7, muted: true, ambience: false }, s);
    expect(loadSettings(s)).toEqual({ volume: 1, muted: true, ambience: false });
    s.setItem("survidle.audio", "{not json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem("survidle.audio", JSON.stringify({ volume: "loud" }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/audio-settings.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: settings.ts**

```ts
/** The listener's choices: kept in the browser, not the save, because they are about this machine's speakers. */
export interface AudioSettings { volume: number; muted: boolean; ambience: boolean }

export const SETTINGS_KEY = "survidle.audio";
export const DEFAULT_SETTINGS: AudioSettings = { volume: 0.7, muted: false, ambience: true };

export function loadSettings(storage: Storage = localStorage): AudioSettings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<AudioSettings>;
    if (typeof p.volume !== "number" || typeof p.muted !== "boolean" || typeof p.ambience !== "boolean") return { ...DEFAULT_SETTINGS };
    return { volume: Math.min(1, Math.max(0, p.volume)), muted: p.muted, ambience: p.ambience };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AudioSettings, storage: Storage = localStorage): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, volume: Math.min(1, Math.max(0, s.volume)) }));
  } catch {
    // A browser that refuses storage still plays; it just forgets.
  }
}
```

- [ ] **Step 4: manifest.ts**

The slot names are fixed here; which have files is decided in Task 7. Start with every slot the design names and empty `files`, so the engine and scheduler can be built and checked against the structure; Task 7 fills `files` and removes slots that stayed silent.

```ts
/**
 * Every sound the game can make, by slot. A slot with several files plays
 * them round-robin. Gains are per slot under the bus; loops peak lower
 * than one-shots so a bed never masks an event. public/audio/manifest.md
 * says where each file came from.
 */
export type Slot = string;
export interface SlotDef { files: string[]; kind: "loop" | "oneshot"; gain: number }

const loop = (gain: number, ...files: string[]): SlotDef => ({ files, kind: "loop", gain });
const shot = (gain: number, ...files: string[]): SlotDef => ({ files, kind: "oneshot", gain });

export const SLOTS: Record<Slot, SlotDef> = {
  // Beds.
  forest: loop(0.5), leaves: loop(0.4), open: loop(0.45), lake: loop(0.5), sea: loop(0.55),
  rain_light: loop(0.4), rain_heavy: loop(0.55), fire: loop(0.6), chorus: loop(0.35), insects: loop(0.25),
  // The work.
  step_leaves: shot(0.5), step_grass: shot(0.45), step_bog: shot(0.5), step_rock: shot(0.5), step_snow: shot(0.5), step_ice: shot(0.5),
  axe: shot(0.7), knap: shot(0.5),
  // Moments.
  treeFalls: shot(0.8), arrow: shot(0.6), spear: shot(0.6), fireCatches: shot(0.6), torchLit: shot(0.5),
  iceCracks: shot(0.7), fallThrough: shot(0.9), toolBreaks: shot(0.7), wolves: shot(0.9),
  // Calls.
  loon: shot(0.7), cuckoo: shot(0.6), raven: shot(0.6), owl: shot(0.6), crane: shot(0.6), woodpecker: shot(0.5),
  capercaillie: shot(0.6), blackGrouse: shot(0.6), willowGrouse: shot(0.6), ptarmigan: shot(0.6), mallard: shot(0.6), eider: shot(0.6),
  goose: shot(0.6), elk: shot(0.7), wolf: shot(0.7), fox: shot(0.6), squirrel: shot(0.4),
};
```

- [ ] **Step 5: engine.ts**

```ts
/**
 * All Web Audio lives here. Three buses under a master: ambience (the beds,
 * through a lowpass that closes indoors), flavour (calls) and action (the
 * work and the moments). Audio is optional: a file that fails to decode
 * logs one warning and its slot stays silent, and nothing plays until a
 * user gesture unlocks the context.
 */
import { loadSettings, saveSettings, type AudioSettings } from "./settings";
import type { Slot, SlotDef } from "./manifest";

export interface AudioEngine {
  /** On any user gesture; creates or resumes the context. Idempotent. */
  unlock(): void;
  ready(): boolean;
  /** Once per frame: every loop fades toward its target gain over about two seconds; absent slots fade out. */
  setLoops(targets: Record<Slot, number>, indoors: boolean): void;
  /** delay is real seconds before the start: a thunderclap after its flash, once the wind sub-project brings one. */
  play(slot: Slot, opts?: { gain?: number; pan?: number; rate?: number; delay?: number }): void;
  settings(): AudioSettings;
  update(s: Partial<AudioSettings>): void;
  /** A hidden tab: hold the loops. */
  suspend(): void;
  resume(): void;
}

const FADE_S = 0.7;            // setTargetAtTime constant: about 2 s to settle
const INDOORS_HZ = 600;
const OUTDOORS_HZ = 20000;
/** A loop at target 0 for this long is stopped and dropped. */
const LOOP_LINGER_MS = 5000;

const BUS_OF = (def: SlotDef, slot: Slot): "ambience" | "flavour" | "action" =>
  def.kind === "loop" ? "ambience" : CALLS.has(slot) ? "flavour" : "action";
const CALLS = new Set<Slot>([
  "loon", "cuckoo", "raven", "owl", "crane", "woodpecker", "capercaillie", "blackGrouse", "willowGrouse", "ptarmigan",
  "mallard", "eider", "goose", "elk", "wolf", "fox", "squirrel",
]);

export function createAudioEngine(slots: Record<Slot, SlotDef>, storage: Storage = localStorage): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buses: Partial<Record<"ambience" | "flavour" | "action", GainNode>> = {};
  let lowpass: BiquadFilterNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const roundRobin = new Map<Slot, number>();
  const loops = new Map<Slot, { src: AudioBufferSourceNode; gain: GainNode; quietSince: number }>();
  let cfg = loadSettings(storage);
  let suspended = false;

  const applySettings = (): void => {
    if (!ctx || !master) return;
    master.gain.value = cfg.muted ? 0 : cfg.volume;
    const amb = cfg.ambience ? 1 : 0;
    if (buses.ambience) buses.ambience.gain.value = amb;
    if (buses.flavour) buses.flavour.gain.value = amb;
  };

  const unlock = (): void => {
    if (ctx) {
      if (ctx.state === "suspended" && !suspended) void ctx.resume();
      return;
    }
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = OUTDOORS_HZ;
    lowpass.connect(master);
    buses.ambience = ctx.createGain();
    buses.ambience.connect(lowpass);
    buses.flavour = ctx.createGain();
    buses.flavour.connect(master);
    buses.action = ctx.createGain();
    buses.action.connect(master);
    applySettings();
    const c = ctx;
    for (const def of Object.values(slots)) {
      for (const file of def.files) {
        if (buffers.has(file)) continue;
        fetch(`${import.meta.env.BASE_URL}audio/${file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((bytes) => c.decodeAudioData(bytes))
          .then((buf) => buffers.set(file, buf))
          .catch((err: Error) => console.warn(`audio: ${file} unavailable (${err.message})`));
      }
    }
    if (c.state === "suspended") void c.resume();
  };

  const pickFile = (slot: Slot): AudioBuffer | null => {
    const def = slots[slot];
    if (!def || !def.files.length) return null;
    const i = (roundRobin.get(slot) ?? -1) + 1;
    roundRobin.set(slot, i);
    const file = def.files[i % def.files.length];
    return buffers.get(file) ?? null;
  };

  const play = (slot: Slot, opts: { gain?: number; pan?: number; rate?: number; delay?: number } = {}): void => {
    if (!ctx || suspended) return;
    const def = slots[slot];
    const buf = pickFile(slot);
    if (!def || !buf) return;
    const bus = buses[BUS_OF(def, slot)];
    if (!bus) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = def.gain * (opts.gain ?? 1);
    src.connect(g);
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      p.connect(bus);
    } else {
      g.connect(bus);
    }
    src.start(ctx.currentTime + Math.max(0, opts.delay ?? 0));
  };

  const setLoops = (targets: Record<Slot, number>, indoors: boolean): void => {
    if (!ctx || !buses.ambience || !lowpass) return;
    const now = ctx.currentTime;
    lowpass.frequency.setTargetAtTime(indoors ? INDOORS_HZ : OUTDOORS_HZ, now, FADE_S);
    const wall = performance.now();
    for (const [slot, target] of Object.entries(targets)) {
      if (target <= 0) continue;
      let l = loops.get(slot);
      if (!l) {
        const def = slots[slot];
        const buf = pickFile(slot);
        if (!def || !buf || def.kind !== "loop") continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(buses.ambience);
        src.start();
        l = { src, gain, quietSince: 0 };
        loops.set(slot, l);
      }
      l.quietSince = 0;
      l.gain.gain.setTargetAtTime(slots[slot].gain * Math.min(1, target), now, FADE_S);
    }
    for (const [slot, l] of loops) {
      if ((targets[slot] ?? 0) > 0) continue;
      if (!l.quietSince) {
        l.quietSince = wall;
        l.gain.gain.setTargetAtTime(0, now, FADE_S);
      } else if (wall - l.quietSince > LOOP_LINGER_MS) {
        l.src.stop();
        l.src.disconnect();
        l.gain.disconnect();
        loops.delete(slot);
      }
    }
  };

  return {
    unlock,
    ready: () => ctx !== null,
    setLoops,
    play,
    settings: () => ({ ...cfg }),
    update(s) {
      cfg = { ...cfg, ...s, volume: Math.min(1, Math.max(0, s.volume ?? cfg.volume)) };
      saveSettings(cfg, storage);
      applySettings();
    },
    suspend() {
      suspended = true;
      void ctx?.suspend();
    },
    resume() {
      suspended = false;
      void ctx?.resume();
    },
  };
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd 08-survidle && npx vitest run tests/audio-settings.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean (`import.meta.env` is typed by `vite-env.d.ts`, which exists).

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/audio/manifest.ts 08-survidle/src/audio/settings.ts 08-survidle/src/audio/engine.ts 08-survidle/tests/audio-settings.test.ts
git commit -m "feat(survidle): an audio engine with three buses, a slot manifest and remembered settings"
```

---

### Task 5: The scheduler

**Files:**
- Create: `src/audio/scheduler.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `AudioEngine`, `surroundings`, `ambienceMix`, `openCalls`, `activityLoop`, `Cue`.
- Produces:

```ts
export interface Scheduler {
  /** Once per rAF. live is false while dead, away, or the tab is hidden: everything fades out and nothing starts. */
  frame(state: GameState, world: World, cal: Calendar, ambient: number, nowMs: number, live: boolean): void;
  cue(c: Cue): void;
}
export function createScheduler(engine: AudioEngine, random?: () => number): Scheduler;
```

- [ ] **Step 1: Write the failing test**

`tests/scheduler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AudioEngine } from "../src/audio/engine";
import { createScheduler } from "../src/audio/scheduler";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";

function fakeEngine() {
  const played: { slot: string; opts?: { gain?: number; pan?: number; rate?: number; delay?: number } }[] = [];
  const loops: Record<string, number>[] = [];
  const engine: AudioEngine = {
    unlock() {}, ready: () => true,
    setLoops(t) { loops.push({ ...t }); },
    play(slot, opts) { played.push({ slot, opts }); },
    settings: () => ({ volume: 1, muted: false, ambience: true }),
    update() {}, suspend() {}, resume() {},
  };
  return { engine, played, loops };
}
const at = (d: number, hour: number) => 1440 * (d - 1) + (hour - 8) * 60;

describe("scheduler", () => {
  it("steps every 0.6 s while walking and swings the axe while felling", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine, () => 0.5);
    const { state, world } = newGame(3);
    const cal = calendar(state.minute);
    state.task = { id: "walk", progress: 0, duration: 10, repeat: false };
    for (let ms = 0; ms <= 3000; ms += 16) s.frame(state, world, cal, 10, ms, true);
    const steps = played.filter((p) => p.slot.startsWith("step_"));
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(6);
    played.length = 0;
    state.task = { id: "chop", progress: 0, duration: 50, repeat: false };
    for (let ms = 3000; ms <= 6000; ms += 16) s.frame(state, world, cal, 10, ms, true);
    expect(played.filter((p) => p.slot === "axe").length).toBe(2);
  });

  it("plays calls at their rate, never two within four seconds, and none when not live", () => {
    const { engine, played, loops } = fakeEngine();
    // random() = 0 makes every roll succeed: the four-second spacing is then the only limit.
    const s = createScheduler(engine, () => 0);
    const { state, world } = newGame(5);
    let id = -1;
    for (let i = 0; i < LATTICE_W * LATTICE_H && id < 0; i++) if (regionAt(world, i).capacity.raven) id = i;
    placeAt(state, world, regionAt(world, id).campCell);
    regionState(state, world, id).pop.raven = regionAt(world, id).capacity.raven;
    const noon = calendar(at(62, 12));
    for (let ms = 0; ms <= 20000; ms += 50) s.frame(state, world, noon, 10, ms, true);
    const calls = played.filter((p) => p.slot === "raven");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeLessThanOrEqual(6);
    played.length = 0;
    for (let ms = 20000; ms <= 30000; ms += 50) s.frame(state, world, noon, 10, ms, false);
    expect(played).toHaveLength(0);
    expect(loops.at(-1)).toEqual({});
  });

  it("a call is rare when the roll is high, and cues go straight through", () => {
    const { engine, played } = fakeEngine();
    const s = createScheduler(engine, () => 0.999999);
    const { state, world } = newGame(5);
    for (let ms = 0; ms <= 20000; ms += 50) s.frame(state, world, calendar(at(62, 12)), 10, ms, true);
    expect(played.filter((p) => !p.slot.startsWith("step_") && p.slot !== "axe")).toHaveLength(0);
    s.cue("treeFalls");
    expect(played.at(-1)?.slot).toBe("treeFalls");
  });

  it("hands the beds to the engine", () => {
    const { engine, loops } = fakeEngine();
    const s = createScheduler(engine, () => 0.5);
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    s.frame(state, world, calendar(0), 5, 0, true);
    expect(loops.at(-1)?.forest).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/scheduler.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`src/audio/scheduler.ts`:

```ts
/**
 * Turns the sim's answers into sound on the wall clock. Beds follow the
 * surroundings every frame; the task's loop keeps its own beat; calls are
 * rolled every quarter second against their rates, at most one every few
 * seconds, near or far at random. Randomness here is the caller's, so the
 * sim's seeded stream is never touched and tests can pin it.
 */
import type { Calendar } from "../sim/calendar";
import type { Cue } from "../sim/cues";
import { activityLoop, ambienceMix, openCalls, surroundings } from "../sim/soundscape";
import type { GameState } from "../sim/types";
import type { World } from "../world/gen";
import type { AudioEngine } from "./engine";

export interface Scheduler {
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
      for (const c of openCalls(state, world, cal)) {
        // rate is per real minute; a quarter-second roll gets its share.
        if (random() < (c.rate / 60) * (ROLL_MS / 1000)) {
          lastCall = nowMs;
          engine.play(c.slot, { gain: 0.3 + 0.7 * random(), pan: random() * 2 - 1 });
          break;
        }
      }
    },
    cue(c) {
      engine.play(c);
    },
  };
}
```

`engine.play(c)` works because every `Cue` name is a `Slot` name in the manifest. Add a compile-time check at the bottom of `manifest.ts`:

```ts
import type { Cue } from "../sim/cues";
/** Every cue must have a slot, or the scheduler would name a sound the manifest does not know. */
const _cueSlots: Record<Cue, SlotDef> = SLOTS as Record<Cue, SlotDef>;
void _cueSlots;
```

(That check passes because `SLOTS` is typed `Record<string, SlotDef>`; to make it bite, type `SLOTS` as `Record<Cue | KnownSlot, SlotDef>` where `KnownSlot` is the union of the other names. Do that: define `type KnownSlot = "forest" | "leaves" | ... | "squirrel"` listing every non-cue slot, and `export const SLOTS: Record<Cue | KnownSlot, SlotDef>`; `Slot` stays `string` for callers.)

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/scheduler.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/audio/scheduler.ts 08-survidle/src/audio/manifest.ts 08-survidle/tests/scheduler.test.ts
git commit -m "feat(survidle): a scheduler plays the beds, the beat of the work and the calls on the wall clock"
```

---

### Task 6: Wiring and the Sound control

**Files:**
- Create: `src/audio/control.ts`
- Modify: `index.html`, `src/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: `createAudioEngine`, `createScheduler`, `setCueSink`, `SLOTS`.
- Produces: `mountControl(root: HTMLElement, engine: AudioEngine): void`.

- [ ] **Step 1: The static control**

In `index.html`, inside `<main id="center" class="col">` before `<section id="clock" ...>`:

```html
        <div id="sound" class="panel">
          <button type="button" data-sound="mute">Sound</button>
          <input type="range" min="0" max="100" step="1" data-sound="volume" aria-label="volume" />
          <label><input type="checkbox" data-sound="ambience" /> ambience</label>
          <span class="dim" data-sound="note"></span>
        </div>
```

In `src/style.css`, near the `#clock` rules:

```css
#sound { display: flex; gap: 12px; align-items: center; padding: 6px 10px; }
#sound input[type="range"] { width: 120px; }
#sound button.off { color: var(--dim); text-decoration: line-through; }
```

- [ ] **Step 2: control.ts**

```ts
/**
 * The Sound control: a static element outside the panels, so a redraw of
 * the clock never drops the slider mid-drag. Reads and writes the engine's
 * settings and nothing else.
 */
import type { AudioEngine } from "./engine";

export function mountControl(root: HTMLElement, engine: AudioEngine): void {
  const mute = root.querySelector<HTMLButtonElement>("[data-sound=mute]")!;
  const volume = root.querySelector<HTMLInputElement>("[data-sound=volume]")!;
  const ambience = root.querySelector<HTMLInputElement>("[data-sound=ambience]")!;
  const note = root.querySelector<HTMLElement>("[data-sound=note]")!;

  const show = (): void => {
    const s = engine.settings();
    mute.classList.toggle("off", s.muted);
    mute.textContent = s.muted ? "Sound off" : "Sound";
    if (document.activeElement !== volume) volume.value = String(Math.round(s.volume * 100));
    ambience.checked = s.ambience;
    note.textContent = engine.ready() ? "" : "click anywhere to start";
  };

  mute.addEventListener("click", () => {
    engine.update({ muted: !engine.settings().muted });
    show();
  });
  volume.addEventListener("input", () => {
    engine.update({ volume: Number(volume.value) / 100 });
    show();
  });
  ambience.addEventListener("change", () => {
    engine.update({ ambience: ambience.checked });
    show();
  });
  document.addEventListener("click", show, { capture: true });
  document.addEventListener("keydown", show, { capture: true });
  show();
}
```

- [ ] **Step 3: main.ts**

Add imports:

```ts
import { mountControl } from "./audio/control";
import { createAudioEngine } from "./audio/engine";
import { SLOTS } from "./audio/manifest";
import { createScheduler } from "./audio/scheduler";
import { setCueSink } from "./sim/cues";
```

After `const ui = newUiState();`:

```ts
const audio = createAudioEngine(SLOTS);
const sounds = createScheduler(audio);
```

In `boot()`, wrap the catch-up so a night away is silent:

```ts
      setCueSink(null);
      const entries = catchUp(state, world, elapsed, speed);
      setCueSink((c) => sounds.cue(c));
```

and the same around the `catchUp` in `frame()`. After `boot();` at the bottom, before the click listener:

```ts
setCueSink((c) => sounds.cue(c));
mountControl(document.getElementById("sound")!, audio);
document.addEventListener("click", () => audio.unlock(), { capture: true });
document.addEventListener("keydown", () => audio.unlock(), { capture: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") audio.suspend();
  else audio.resume();
});
```

(keep the existing `visibilitychange` save listener too). In `frame(now)`, after `render();`:

```ts
  const cal = calendar(state.minute);
  sounds.frame(state, world, cal, ambientTemperature(cal, state.weather), now, !state.dead && !ui.away && document.visibilityState !== "hidden");
```

- [ ] **Step 4: Typecheck, test, look**

Run: `cd 08-survidle && npx tsc --noEmit && npx vitest run`
Expected: clean. The manifest has no files yet, so the page is still silent; check in Chrome that the control renders, "click anywhere to start" clears on the first click, the mute button toggles its label, and the slider and checkbox persist across a reload (inspect `localStorage["survidle.audio"]`). Run the dev server with `npm run dev` and stop it after.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/index.html 08-survidle/src/style.css 08-survidle/src/main.ts 08-survidle/src/audio/control.ts
git commit -m "feat(survidle): the game is wired for sound, with a Sound control that remembers itself"
```

---

### Task 7: The recordings

This task is search work with a fixed procedure and acceptance criteria, not code. Do it slot by slot; a slot with nothing fitting after two sources is a silent slot.

**Files:**
- Create: `scripts/audio-sources.json`, `scripts/audio-fetch.mjs`, `public/audio/*.ogg`, `public/audio/manifest.md`
- Modify: `src/audio/manifest.ts` (fill `files`, delete silent slots from `SLOTS` and from `KnownSlot`; a silent cue slot keeps its entry with empty `files`, since the type requires every cue)

**Sources, in order:**

1. In-repo CC0: `04-3dtest/assets/audio/footstep_grass_01..04.ogg` and `06-dueling/public/audio/footstep_0*.ogg` (Kenney, CC0) for `step_grass` and `step_leaves` (pitch the leaves copies down 10 percent with `-af "asetrate=48000*0.9,aresample=48000"`).
2. BBC Sound Effects (`https://sound-effects.bbcrewind.co.uk`, RemArc licence: personal, educational and research use; "Replace before distribution"). Search the site in the browser or with WebFetch on its search API; note the recording id and the direct media URL from the page's network requests. Strong for: wolves howling, ravens, owls, cuckoo, divers (loon), cranes, geese, capercaillie, black grouse lek, ptarmigan, mallard, eider, red deer or elk rut (use a moose or elk recording, not red deer roaring), fox, woodland ambience, wind on moorland, lake water lapping, sea on shingle, rain, fire crackle, axe chopping wood, footsteps in snow, ice cracking, an arrow, a splash.
3. Wikimedia Commons (`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=<species> call ogg&format=json`, then `action=query&prop=imageinfo&iiprop=url|extmetadata&titles=File:<name>`), CC BY or CC BY-SA mostly; xeno-canto mirrors live here. Read `extmetadata.LicenseShortName`.
4. freesound.org for what is left: the page for a sound shows its licence and a preview mp3 URL in the HTML (`https://cdn.freesound.org/previews/...-hq.mp3`); previews are fetchable without a login.

**Acceptance per slot:** the named species or its nearest relative (a red-throated loon for a black-throated one is fine; a common loon is fine; a duck for an eider is not), no music, no voices, no hard clipping; one-shots under 6 s (calls may run to 10 s), loops 20 to 60 s that seam when looped, decoded peak about -4 dBFS for one-shots and -12 dBFS for loops.

- [ ] **Step 1: The source list and the fetch script**

`scripts/audio-sources.json` is an array of entries:

```json
[
  { "slot": "wolf", "file": "wolf_01.ogg", "url": "https://...", "source": "BBC Sound Effects 07044038", "author": "BBC", "licence": "RemArc (non-commercial)", "kind": "oneshot", "trim": [2.0, 8.5], "note": "one long howl" }
]
```

`scripts/audio-fetch.mjs` reads it and, for each entry, downloads to `scripts/.audio-cache/<file>.src` (skipped when present), runs ffmpeg with the trim, mono, 48 kHz, a two-pass peak normalize (`-af volumedetect` to read `max_volume`, then `-af volume=<gain>dB` to bring the peak to -4 dBFS for oneshot and -12 for loop), 2 ms fade-in, and for loops a 2 s crossfade seam (`-af "afade=t=in:d=0.002,..."`; for the seam use `acrossfade` on a copy of the tail against the head, or simply fade the last 0.5 s out and the first 0.5 s in), and encodes with `-c:a libopus -b:a 64k` to `public/audio/<file>`. Then it appends a block per entry to `public/audio/manifest.md` under the licence heading the entry's `licence` selects ("CC0" or "Replace before distribution"). The script must print what it did per file and exit non-zero on any ffmpeg failure. Run it as `node scripts/audio-fetch.mjs`.

Write the script now against the two in-repo footstep entries first so it is proven before any download.

- [ ] **Step 2: Fill the slots**

Work through the slots in this order, adding entries to the JSON and running the script after each batch: the beds (`forest`, `open`, `lake`, `sea`, `rain_light`, `rain_heavy`, `fire`), the work (`step_*`, `axe`, `knap`), the moments (`treeFalls`, `arrow`, `spear`, `fireCatches`, `torchLit`, `iceCracks`, `fallThrough`, `toolBreaks`, `wolves`), then the calls (`wolf` first, then `loon`, `cuckoo`, `raven`, `owl`, `crane`, `goose`, `capercaillie`, `blackGrouse`, `willowGrouse`, `ptarmigan`, `mallard`, `eider`, `elk`, `fox`, `woodpecker`, `squirrel`), then `chorus`, `insects`, `leaves`.

Listen to each one before accepting it: `afplay public/audio/<file>` on macOS. Reject and keep searching if it does not read as the thing.

- [ ] **Step 3: manifest.ts**

Fill `files` for every slot with recordings. Delete non-cue slots that stayed silent from `SLOTS` and `KnownSlot`. For a silent cue slot leave `files: []` (the engine skips it). `ambienceMix` and `activityLoop` may still name a deleted slot; that is fine, `setLoops` and `play` ignore unknown slots.

- [ ] **Step 4: manifest.md**

`public/audio/manifest.md` has, in this order: a header paragraph (format, levels, the fact that non-CC0 files are for this prototype only), "## CC0", "## Replace before distribution" (every non-CC0 file, with source, author, licence, URL, processing, duration, slot), and "## Silent slots" listing each slot with no file and one line on what was tried and why it was rejected.

- [ ] **Step 5: Size check and tests**

Run: `du -sh 08-survidle/public/audio` (expect under 6 MB; trim loops if larger) and `cd 08-survidle && npm test && npm run build`.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/public/audio 08-survidle/scripts/audio-sources.json 08-survidle/scripts/audio-fetch.mjs 08-survidle/src/audio/manifest.ts
git commit -m "feat(survidle): the recordings, their provenance, and the script that fetched them"
```

`scripts/.audio-cache/` is not committed: add it to `08-survidle/.gitignore` (create the file if absent) in the same commit.

---

### Task 8: Hear it in Chrome, then the docs

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: Browser pass**

`cd 08-survidle && npm run dev`, open `http://127.0.0.1:5173/prototypes/08/?seed=5`, click once. Check each, and fix what fails before going on:

1. In forest at camp with no fire: the forest bed and nothing else. Walk to the shore: the lake or sea bed fades in over about two seconds while the forest fades down. Footsteps sound at a walking pace on the way and stop at arrival.
2. Fell a tree: the axe beats; a tree-fall sound at the end.
3. `window.survidle.advance(60 * 10)` into the evening in June (use `?speed=` or `advance` to reach it): on a lake, a loon within a couple of minutes; on bog, cranes by day.
4. Light a fire (give yourself a fire drill and firewood from the console): the fire catches, and the crackle bed sits under the rest while at camp.
5. Advance to a full-moon night in wolf country (find a wolf region with `window.survidle.world` and `regionAt`, walk there or set the player position from the console): howls every few minutes, far and near.
6. Rain: set `window.survidle.state.weather.precip = "heavy"` with ambient above 0: the rain bed. Set it below 0: silence from the rain.
7. Mute: silence at once. Ambience off: beds and calls stop, the axe still sounds. Reload: the settings hold.
8. Hide the tab for 40 s and come back: the away overlay is up and silent; dismiss it; sound resumes and no cue burst plays for the night away.

Stop the dev server.

- [ ] **Step 2: README**

Add to "How it plays" after the Species bullet:

```
- **Sound.** The place has a voice: wind in the trees or over the fell,
  water at the shore, rain, the fire at camp, footsteps on leaves, snow or
  bog, the axe. The species that live here call at their hours and in
  their seasons: loons on a June evening, cranes on the bog, wolves at
  night by the moon. Click once to start it; the Sound control mutes,
  sets the volume and turns the ambience off on its own. Recordings and
  their licences are listed in `public/audio/manifest.md`; several are for
  this prototype only and are marked for replacement.
```

Under "Where the numbers live": `- \`src/audio/manifest.ts\`: every sound slot, its files and gain; \`src/sim/soundscape.ts\`: which beds and calls are open where.`

- [ ] **Step 3: Full check and commit**

Run: `cd 08-survidle && npm test && npm run build`

```bash
git add 08-survidle/docs/README.md
git commit -m "docs(survidle): the README says what you hear and where the recordings came from"
```

- [ ] **Step 4: Memory**

Update the auto-memory note `no-ambient-background-audio.md`: the survidle ambience was asked for explicitly, defaults on, and has its own toggle; record what the user says about it after playing.
