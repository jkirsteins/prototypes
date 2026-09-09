# Survidle DiceBear Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pixel portraits with deterministic local Toon Head portraits and give the living header layered activity, condition, ambient motion, and firelight.

**Architecture:** Keep `Person.face` as identity, generate explicit Toon Head identity and expression frames locally, and cache the resulting SVG. A pure portrait-state module chooses the base frame and CSS treatments; a UI-only controller applies jittered transient motion without touching game RNG or saved state.

**Tech Stack:** TypeScript, Vite, Vitest, happy-dom, `@dicebear/core` 10.7.0, `@dicebear/styles` 10.6.0, CSS animations.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-dicebear-portraits-design.md`

## Global Constraints

- Generate Toon Head locally; no DiceBear HTTP request may occur during play.
- Keep `Person.face` unchanged so existing saves need no migration.
- Normal awake eyes are `happy`.
- `Person.sex` controls facial-hair availability only; hairstyles are shared.
- Clothing is restricted to shirt, open jacket, and turtleneck.
- Gameplay `eyes` and `build` grades are not encoded in portrait artwork.
- Only the living stats-header portrait animates.
- Every visible string and source file uses ASCII punctuation only.
- Preserve the current panel churn budget and reduced-motion behavior.

---

### Task 1: Deterministic local Toon Head frames

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/ui/face.ts`
- Modify: `tests/face.test.ts`

**Interfaces:**
- Consumes: `Person.face` and `Person.sex` from `src/sim/types.ts`.
- Produces: `FaceExpression`, `STATIC_FACE`, `faceIdentity(person)`, `faceFrame(person, px, expression)`, and the compatible `faceSvg(person, px)`.

- [ ] **Step 1: Install the exact local dependencies**

Run:

```bash
npm install @dicebear/core@10.7.0 @dicebear/styles@10.6.0
```

Expected: package and lockfile list both packages under runtime dependencies.

- [ ] **Step 2: Replace pixel-specific tests with failing identity and frame tests**

Write tests equivalent to:

```ts
expect(faceSvg(person("f", 7), 64)).toBe(faceSvg(person("f", 7), 64));
expect(faceSvg(person("f", 7), 64)).not.toBe(faceSvg(person("f", 8), 64));
expect(faceIdentity(person("f", 7)).beard).toBeNull();
expect(["shirt", "openJacket", "turtleNeck"]).toContain(faceIdentity(person("m", 7)).clothes);
expect(faceFrame(person("m", 7), 64, STATIC_FACE)).toContain("<svg");
expect(identitySignature(faceFrame(person("m", 7), 64, STATIC_FACE)))
  .toBe(identitySignature(faceFrame(person("m", 7), 64, FOCUSED_FACE)));
```

Export a test-only `clearFaceCache()` and assert that generating more than 256 distinct frame keys leaves `faceCacheSize()` at 256.

- [ ] **Step 3: Run the face tests and verify the old implementation fails them**

Run: `npx vitest run tests/face.test.ts`

Expected: FAIL because the Toon Head interfaces do not exist.

- [ ] **Step 4: Implement explicit identity picks and local rendering**

Implement these public types and functions:

```ts
export interface FaceExpression {
  eyebrows: "angry" | "happy" | "neutral" | "raised" | "sad";
  eyes: "bow" | "happy" | "humble" | "wide" | "wink";
  mouth: "agape" | "angry" | "laugh" | "sad" | "smile";
}

export interface FaceIdentity {
  seed: string;
  hair: "bun" | "sideComed" | "spiky" | "undercut";
  rearHair: "longStraight" | "longWavy" | "neckHigh" | "shoulderHigh" | null;
  beard: "chin" | "chinMoustache" | "fullBeard" | "longBeard" | "moustacheTwirl" | null;
  clothes: "shirt" | "openJacket" | "turtleNeck";
  skin: string;
  hairColor: string;
  clothesColor: string;
}

export const STATIC_FACE: FaceExpression = { eyebrows: "happy", eyes: "happy", mouth: "smile" };
export function faceIdentity(person: Person): FaceIdentity;
export function faceFrame(person: Person, px: number, expression: FaceExpression): string;
export function faceSvg(person: Person, px: number): string;
export function clearFaceCache(): void;
export function faceCacheSize(): number;
```

Use the repository `Rng` with a derived stream or a fresh `Rng(person.face)` to pick every identity property before rendering. Pass every picked property explicitly to DiceBear so expression options cannot move the identity stream. Use an insertion-ordered `Map` and delete the oldest key when size exceeds 256. Wrap DiceBear rendering in `try/catch` and return the retained pixel renderer on failure.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx vitest run tests/face.test.ts
npm run build
```

Expected: PASS; the production build contains the Toon Head definition and makes no API request.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json src/ui/face.ts tests/face.test.ts
git commit -m "feat(survidle): render deterministic Toon Head portraits"
```

### Task 2: Pure live portrait state and priority

**Files:**
- Create: `src/ui/portrait.ts`
- Create: `tests/portrait.test.ts`

**Interfaces:**
- Consumes: `faceFrame`, `FaceExpression`, `moodOf`, `feltTemperature`, `firelit`, `hungerLine`, `starvation`, `THIRSTY_L`, `SLEEPY_AT`, and live `GameState` readings.
- Produces: `PortraitExpression`, `LivePortraitState`, `livePortraitState(state, world, cal, ambient)`, and `liveFaceHtml(person, px, view)`.

- [ ] **Step 1: Write failing priority tests**

Build a new game and assert these exact transitions:

```ts
expect(livePortraitState(state, world, cal, ambient).expression).toBe("happy");
state.task = task("chop");
expect(livePortraitState(state, world, cal, ambient).expression).toBe("focused");
state.player.warmth = 35;
expect(livePortraitState(state, world, cal, ambient).expression).toBe("cold");
state.task = task("sleep");
expect(livePortraitState(state, world, cal, ambient).expression).toBe("sleep");
state.dead = { cause: "froze", minute: state.minute };
expect(livePortraitState(state, world, cal, ambient).expression).toBe("dead");
```

Add separate assertions for hot at felt temperature above 20 C and warmth at least 80, thirsty, hungry, exhausted, sleepy, sick, injured, firelit only at a current-cell lit camp, and cold overriding work during a task whose intent mode is `once`.

- [ ] **Step 2: Run the portrait tests and verify they fail**

Run: `npx vitest run tests/portrait.test.ts`

Expected: FAIL because `src/ui/portrait.ts` does not exist.

- [ ] **Step 3: Implement the pure state reader**

Define:

```ts
export type PortraitExpression = "happy" | "focused" | "cold" | "hot" | "unhappy" | "tired" | "hurt" | "sleep" | "dead";

export interface LivePortraitState {
  expression: PortraitExpression;
  activity: Mood;
  firelit: boolean;
  motion: "awake" | "limited" | "none";
  signature: string;
}

export function livePortraitState(
  state: GameState,
  world: World,
  cal: Calendar,
  ambient: number,
): LivePortraitState;
```

Use direct readings only. Do not call `currentNeed`. Evaluate dead, sleep, cold, hurt, thirst, hunger, tired, hot, work, and happy in that order. Build `signature` from current survivor index, expression, activity, and firelit state.

- [ ] **Step 4: Implement live markup and focused split frame**

`liveFaceHtml` returns a stable wrapper with keyed layers:

```html
<span class="stat-face portrait mood-work is-firelit" data-portrait-signature="0:focused:work:1">
  <span data-portrait-frame="base">...</span>
  <span data-portrait-frame="focus-raised">...</span>
  <span data-portrait-frame="blink">...</span>
  <span data-portrait-frame="flavor">...</span>
</span>
```

The focus base uses angry eyebrows, wide eyes, and smile mouth. The raised
overlay changes only eyebrows and clips the seed-selected half. Other states
map to fixed explicit `FaceExpression` constants.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/portrait.test.ts tests/face.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/ui/portrait.ts tests/portrait.test.ts
git commit -m "feat(survidle): derive the survivor portrait state"
```

### Task 3: Integrate the living header and visual layers

**Files:**
- Modify: `src/ui/panels.ts`
- Modify: `src/style.css`
- Modify: `tests/mood.test.ts`
- Modify: `tests/css.test.ts`
- Modify: `tests/churn.test.ts`

**Interfaces:**
- Consumes: `livePortraitState(...)` and `liveFaceHtml(...)` from Task 2.
- Produces: the live stats-header portrait and all static CSS state treatments.

- [ ] **Step 1: Write failing integration and CSS tests**

Assert that `statsHtml` contains `data-portrait-signature`, `is-focused` while chopping, `is-cold` when warmth is below 40, and `is-firelit` only beside a lit fire. Assert CSS contains `.portrait.is-firelit`, a bottom-positioned radial gradient, `.portrait.is-focused`, `.portrait.is-hot`, `.portrait.is-cold`, and corresponding reduced-motion overrides. Extend the churn test to keep the stats portrait node within the existing replacement budget.

- [ ] **Step 2: Run the focused UI tests and verify failure**

Run: `npx vitest run tests/mood.test.ts tests/css.test.ts tests/churn.test.ts`

Expected: FAIL because the stats header still calls static `faceSvg`.

- [ ] **Step 3: Replace the stats-header call and add CSS layers**

In `statsHtml`, derive one portrait view and call `liveFaceHtml`. Keep every
other call to `faceSvg` static. Add CSS for:

- stacked absolute frames and opacity crossfades;
- deterministic left or right focus-brow clipping;
- slight forward work posture;
- cold saturation and shiver;
- hot lower flush;
- bottom-centered radial amber firelight;
- a separate blurred ember glow;
- different fire opacity and reach rhythms;
- static reduced-motion variants.

Do not display explanatory WORK, HOT, COLD, or FIRELIT badges from the design previews.

- [ ] **Step 4: Run the UI tests**

Run: `npx vitest run tests/mood.test.ts tests/css.test.ts tests/churn.test.ts tests/portrait.test.ts`

Expected: PASS with no higher churn count.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/ui/panels.ts src/style.css tests/mood.test.ts tests/css.test.ts tests/churn.test.ts
git commit -m "feat(survidle): show condition and firelight on the living portrait"
```

### Task 4: Jittered ambient portrait controller

**Files:**
- Create: `src/ui/portrait-motion.ts`
- Create: `tests/portrait-motion.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: a root `ParentNode`, real-time milliseconds, visibility, reduced-motion preference, and keyed frame elements produced by Task 2.
- Produces: `createPortraitMotion(random): PortraitMotion`, whose `frame(root, now, active)` method updates transient inline opacity and transform state.

- [ ] **Step 1: Write failing fake-clock tests**

Use a fixed random sequence and a happy-dom portrait fixture. Assert:

```ts
const motion = createPortraitMotion(sequence([0, 1, 0.5]));
motion.frame(root, 0, true);
expect(motion.inspect().nextBlinkAt).toBeGreaterThanOrEqual(1000);
expect(motion.inspect().nextBlinkAt).toBeLessThanOrEqual(5000);
motion.frame(root, motion.inspect().nextBlinkAt, true);
expect(frame(root, "blink").style.opacity).toBe("1");
```

Also assert 100 to 180 ms blink duration, no action while inactive, future
rescheduling after resume, signature-change cancellation, no cheerful flavor
for distressed signatures, focused-state flavor restriction, and no scheduling
when reduced motion matches.

- [ ] **Step 2: Run the motion tests and verify failure**

Run: `npx vitest run tests/portrait-motion.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the state machine**

Define:

```ts
export interface PortraitMotion {
  frame(root: ParentNode, now: number, active: boolean): void;
  inspect(): Readonly<PortraitMotionState>;
}

export function createPortraitMotion(random: () => number = Math.random): PortraitMotion;
```

Schedule blinks at `now + 1000 + random() * 4000`, duration at
`100 + random() * 80`, glances at a longer independently jittered interval,
and flavor frames at another longer interval. Apply transient state as inline
styles because `morphAttrs` preserves DOM-owned style properties. Reset all
transient styles when the portrait signature changes or `active` becomes false.

- [ ] **Step 4: Integrate with the existing frame loop**

Create one controller near the audio scheduler. Immediately after `render()` in
`frame(now)`, call:

```ts
portraitMotion.frame(
  document,
  now,
  document.visibilityState === "visible" && !state.dead && !state.landing && !ui.away,
);
```

Call it after the initial render as well. Let the controller query
`matchMedia("(prefers-reduced-motion: reduce)")` through an injectable helper
so happy-dom tests do not depend on browser globals.

- [ ] **Step 5: Run focused tests and the full fast suite**

Run:

```bash
npx vitest run tests/portrait-motion.test.ts tests/portrait.test.ts tests/churn.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/ui/portrait-motion.ts tests/portrait-motion.test.ts src/main.ts
git commit -m "feat(survidle): give the living portrait quiet ambient motion"
```

### Task 5: Contact sheet, attribution, and end-to-end verification

**Files:**
- Modify: `src/faces.ts`
- Modify: `docs/README.md`
- Modify: `src/ui/panels.ts`
- Test: `tests/manual.test.ts`

**Interfaces:**
- Consumes: static and live portrait APIs from Tasks 1 and 2.
- Produces: a `?faces=1` review surface and visible CC BY 4.0 attribution.

- [ ] **Step 1: Write a failing attribution test**

Assert the chosen in-game credits surface contains `ToonHead`, `Johan Melin`,
`CC BY 4.0`, and the source URL. Run its focused test and confirm it fails.

- [ ] **Step 2: Add attribution and update the debug documentation**

Add concise credits copy with the required author, work, license, and source
link. Update `docs/README.md` so `?faces=1` says it reviews identity, sizes,
expressions, layered states, and motion.

- [ ] **Step 3: Rebuild the contact sheet**

Show at least 24 seeded identities at 64px and 24px, all fixed expression
states for one identity, the split focused frame on both sides, hot and cold,
bottom firelight, blink, glance, and flavor motion. Use only the local renderer.

- [ ] **Step 4: Run automated verification**

Run:

```bash
npm test
npm run build
cd .. && npm run lint -- 08-survidle/src 08-survidle/tests
```

Expected: all commands exit 0.

- [ ] **Step 5: Run the browser pass**

Start `npm run dev` in `08-survidle`, then inspect
`http://127.0.0.1:5173/prototypes/08/?faces=1` and the game at both 1440 by
900 and 390 by 844 with touch emulation. Verify the playtest gate from the
spec, including immediate cold while a once-order continues, recovery by a
fire, sleep, death, static history, low animated firelight, and no layout
movement. Stop the server after the pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/faces.ts docs/README.md src/ui/panels.ts tests/manual.test.ts
git commit -m "docs(survidle): expose and credit the living portrait system"
```

- [ ] **Step 7: Inspect the final scoped diff**

Run:

```bash
git status --short
git log --oneline -6
git diff HEAD~5 --check
```

Expected: only the approved portrait work and its design and plan are present;
no `.superpowers/` file is tracked.
