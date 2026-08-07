# Arena Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third scene combining parkour and dueling (spec:
`docs/superpowers/specs/2026-08-07-arena-scene-design.md`), plus the
movement engine's new air rules (no double jump, post-liftoff steer
window).

**Architecture:** Composite scene. The enemy is always a combat
`Fighter`; the player is a `Mover` while sheathed and a `Fighter` while
drawn; a real `Duel` is assembled when both stand armed on the platform.
Neither engine learns about the other; the scene owns all conversions.

**Tech Stack:** TypeScript, Vite, vitest, canvas 2D. All paths below are
relative to `06-dueling/`.

## Global Constraints

- One simulation for both fighters: no phase, duration or capability may
  condition on which side controls a fighter. AI asymmetry lives in
  policy layers only.
- Presentation cues fire on the tick the simulation reaches the moment,
  never on input acceptance.
- No capability flags, weapon-ID branches, or pairwise matchup tables.
- `tickDuel` in `src/combat/engine.ts` must stay byte-identical except
  for additive exports: `test/golden-replay.test.ts` hashes its event
  stream and MUST NOT be re-recorded.
- `npm test` and `npm run build` (in `06-dueling/`) plus `npm run lint`
  (repo root) must pass at every commit. Keep tests fast.
- Commit with explicit paths scoped to `06-dueling/`. Never `git add -A`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No em dashes or non-typable unicode in new prose or code comments; use
  `-` and `->`.
- Any change to states, phases or acceptance rules updates the affected
  "?" panel in the same commit.

---

### Task 1: Movement engine air rules

Remove the double jump; add the post-liftoff steer window. Affects the
move scene and (later) the arena.

**Files:**
- Modify: `src/movement/engine.ts`
- Modify: `src/render/moveframes.ts` (drop the airSpin case)
- Modify: `src/ui/movehelp.ts` (drop the airSpin row, reword jump/fall)
- Modify: `test/move-engine.test.ts`, `test/move-wall.test.ts`,
  `test/moveframes.test.ts`, `test/move-crouch.test.ts` (comment only)

**Interfaces:**
- Consumes: existing `Mover`, `tickMove`, `MoveInput`.
- Produces: `export const AIR_STEER_MS = 120` and a `Mover.airMs: number`
  field (ms since the body last left a support; 0 while supported).
  `MoveState` loses `airSpin`; `Mover` loses `spun`. Every later task
  builds against this shape.

- [ ] **Step 1: Write the failing tests** in `test/move-engine.test.ts`
  (reuse the file's existing `mover()`, `input()`, `run()` helpers):

```ts
describe("air rules: no double jump, steer window", () => {
  test("a second jump press mid-air does not rise again", () => {
    const m = mover();
    run(m, input({}, { jump: true }), 1);
    run(m, input({}), 10);
    const vyBefore = m.vy;
    run(m, input({}, { jump: true }), 1);
    expect(m.vy).toBeGreaterThan(vyBefore - 1); // no fresh upward impulse
    expect(m.state.kind).toBe("jump");
  });

  test("steering inside AIR_STEER_MS sets vx; after it, vx is locked", () => {
    const early = mover();
    run(early, input({}, { jump: true }), 1);
    run(early, input({ right: true }), 3); // ~50ms: inside the window
    expect(early.vx).toBe(RUN_SPEED);

    const late = mover();
    run(late, input({}, { jump: true }), 1);
    run(late, input({}), 12); // ~200ms: window lapsed
    run(late, input({ right: true }), 3);
    expect(late.vx).toBe(0);
  });

  test("a walk-off opens its own steer window", () => {
    const m = mover();
    m.x = 4.5 * TILE; m.y = 8 * TILE; // on the left step platform
    run(m, input({ right: true }), 30); // run off its right edge
    expect(m.state.kind).toBe("fall");
    // Just off the edge: reverse steering still bites briefly.
    run(m, input({ left: true }), 3);
    expect(m.vx).toBe(-RUN_SPEED);
  });
});
```

  Import `AIR_STEER_MS`, `RUN_SPEED`, `TILE` as needed. Exact tick
  counts may need +-1 adjustment against the real window; the assertion
  structure may not change.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/move-engine.test.ts`
Expected: FAIL (airSpin still consumes the second press; steering always live).

- [ ] **Step 3: Implement in `src/movement/engine.ts`**

  1. Delete `AIRSPIN_V` and `SPIN_MS` constants, the
     `{ kind: "airSpin"; t: number }` member of `MoveState`, the
     `spun: boolean` field of `Mover` (and its uses: `createMover`,
     `tryHang`, wall/ladder/landing resets), the two
     `input.pressed.jump && !m.spun` blocks in `case "jump"` and
     `case "fall"`, and the whole `case "airSpin"` (fold its
     `steer(); airChecks();` behavior nowhere - jump/fall already do it).
     Remove `"airSpin"` from the `airborne` kind list in the
     integration section.
  2. Add `export const AIR_STEER_MS = 120;` beside `INPUT_BUFFER_MS`,
     and `airMs: number` to `Mover` (created as `0`).
  3. Gate `steer()`:

```ts
  const steer = (): void => {
    if (m.airMs > AIR_STEER_MS) return; // committed: the arc is ballistic
    ...existing body...
  };
```

  4. Reset `m.airMs = 0` at every support-leaving site: inside
     `groundJump()`, the dash-jump branch, the wall-slide jump, the
     ledge-hang jump and release (`held.down || wish === -s.wall`), the
     ladder jump and both ladder exits (fall and side step-off), the
     wall-slide -> fall transition, and the grounded -> fall walk-off
     conversion near the end of `tickMove`. Increment it in the
     integration section:

```ts
  if (m.state.kind === "jump" || m.state.kind === "fall") m.airMs += MOVE_TICK;
  else if (!airborne) m.airMs = 0; // any support (ground, wall, ladder, lip) rearms the window
```

  5. `src/render/moveframes.ts`: delete the `case "airSpin"` line and
     the now-unused `SPIN_MS` import. Leave `SheetName`/`SHEETS` and the
     loaded png untouched (unused asset, no churn).
  6. `src/ui/movehelp.ts`: delete the `airSpin` row of `MOVE_HELP`
     (the typed Record makes keeping it a build error); change the
     `jump` row to
     `{ label: "jump", what: "Rising; the launch direction is set in the first instant.", player: "Steering locks about 120 ms after leaving support." }`
     and the legend entry `[labels.jump, "jump/spin"]` to
     `[labels.jump, "jump"]`.

- [ ] **Step 4: Fix the displaced tests**

  - `test/move-wall.test.ts:29,34`: the assertions expecting
    `"airSpin"` after a second jump press become assertions that the
    state stays `"jump"`/`"fall"` and `vy` gains no upward impulse.
  - `test/moveframes.test.ts:15`: remove `{ kind: "airSpin", t: 100 }`
    from the STATES list.
  - `test/move-crouch.test.ts:53`: update the comment (double jump no
    longer exists).
  - Any other failure in `test/move-*.test.ts` from locked steering:
    adjust inputs so direction is held from the tick of liftoff (the
    window makes that equivalent), never by weakening assertions.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (golden replays untouched: they cover the duel only).

- [ ] **Step 6: Commit**

```bash
git add src/movement/engine.ts src/render/moveframes.ts src/ui/movehelp.ts test/move-engine.test.ts test/move-wall.test.ts test/moveframes.test.ts test/move-crouch.test.ts
git commit -m "feat(dueling): air rules - no double jump, steer window after liftoff"
```

---

### Task 2: Input scheme - drawSheathe, selPickThird, arena resolver

**Files:**
- Modify: `src/input/scheme.ts`
- Modify: `src/scenes/scene.ts` (SceneId)
- Test: `test/scheme.test.ts`

**Interfaces:**
- Produces: `ActionId` gains `"drawSheathe"` and `"selPickThird"`.
  `SceneId = "duel" | "move" | "arena"`. `UiSnapshot.scene` widens the
  same way and gains `armed: boolean`. `resolvePadEdge` resolves arena
  edges modally. Pad button 6 (LT/L2) -> drawSheathe.

- [ ] **Step 1: Write the failing test** in `test/scheme.test.ts`:

```ts
describe("arena pad resolution is modal on the weapon", () => {
  const ui = (armed: boolean): UiSnapshot => ({
    helpOpen: false, selectOpen: false, simLive: true,
    paused: false, decided: false, scene: "arena", armed,
  });
  const btn = (index: number): PadControl => ({ kind: "button", index });

  test("button 0 is jump sheathed, thrust armed", () => {
    expect(resolvePadEdge(ui(false), btn(0))).toBe("jump");
    expect(resolvePadEdge(ui(true), btn(0))).toBe("thrust");
  });
  test("button 6 is drawSheathe in both modes", () => {
    expect(resolvePadEdge(ui(false), btn(6))).toBe("drawSheathe");
    expect(resolvePadEdge(ui(true), btn(6))).toBe("drawSheathe");
  });
  test("B is feint only while armed", () => {
    expect(resolvePadEdge(ui(true), btn(1))).toBe("feint");
    expect(resolvePadEdge(ui(false), btn(1))).toBeNull();
  });
});
```

  Existing tests constructing `UiSnapshot` literals will fail to compile
  until they carry `armed: false` - update them mechanically.

- [ ] **Step 2: Run to verify failure**

Run: `npx tsc --noEmit; npx vitest run test/scheme.test.ts`
Expected: compile errors ("drawSheathe"/"armed" unknown), test failures.

- [ ] **Step 3: Implement in `src/input/scheme.ts` and `src/scenes/scene.ts`**

  1. `scene.ts`: `export type SceneId = "duel" | "move" | "arena";`
  2. `ActionId`: add `| "drawSheathe"` to the movement-scene group and
     `| "selPickThird"` to the select group.
  3. Labels (every table, build-enforced):
     keyboard `drawSheathe: "E"`, `selPickThird: "3"`;
     xbox `drawSheathe: "LT"`, `selPickThird: "3"`;
     ps `drawSheathe: "L2"`, `selPickThird: "3"`.
  4. `PAD_BINDINGS`: `drawSheathe: [{ kind: "button", index: 6 }]`.
     No entry for selPickThird (keyboard-only, like the other picks).
  5. `UiSnapshot`: `scene: SceneId;` (import the type) and
     `armed: boolean;` with doc comment "arena only: the weapon is out;
     false elsewhere".
  6. Verb sets:

```ts
const ARENA_SHEATHED_VERBS: ActionId[] = [...MOVE_VERBS, "drawSheathe"];
const ARENA_ARMED_VERBS: ActionId[] = [...DUEL_VERBS, "drawSheathe"];
```

  7. `resolvePadEdge`: in the button-1 block, replace the scene guard
     with `(ui.scene === "duel" || (ui.scene === "arena" && ui.armed))`;
     in the final table dispatch:

```ts
  if (ui.simLive || ui.decided) {
    const verbs =
      ui.scene === "move" ? MOVE_VERBS
      : ui.scene === "arena" ? (ui.armed ? ARENA_ARMED_VERBS : ARENA_SHEATHED_VERBS)
      : DUEL_VERBS;
    return boundAction(edge, verbs);
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/scheme.test.ts && npx tsc --noEmit`
Expected: PASS. (`main.ts` compiles because `uiSnapshot()` must now
supply `armed` - add `armed: false` there for now; Task 8 wires it.)

- [ ] **Step 5: Commit**

```bash
git add src/input/scheme.ts src/scenes/scene.ts src/main.ts test/scheme.test.ts
git commit -m "feat(dueling): drawSheathe and selPickThird actions, modal arena pad resolution"
```

---

### Task 3: The arena level

**Files:**
- Modify: `src/movement/level.ts`
- Test: `test/move-level.test.ts`

**Interfaces:**
- Produces: `export function createArenaLevel(): Level` and
  `export const ARENA_PLATFORM = { left: 576, right: 1344, topY: 672 }`
  (cm; left/right are the outer faces of cols 6-13, topY is row 7's top
  edge). `createLevel()` keeps its exact behavior.

- [ ] **Step 1: Write the failing test** in `test/move-level.test.ts`:

```ts
describe("arena level", () => {
  test("flat floor, one centered 8x3 platform, no ladder, block off-world", () => {
    const l = createArenaLevel();
    for (let c = 0; c < COLS; c++) expect(tileAt(l, c, 10)).toBe("solid");
    for (let c = 6; c <= 13; c++) for (let r = 7; r <= 9; r++)
      expect(tileAt(l, c, r)).toBe("solid");
    expect(tileAt(l, 5, 7)).toBe("empty");
    expect(tileAt(l, 14, 9)).toBe("empty");
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      expect(tileAt(l, c, r)).not.toBe("ladder");
    expect(l.blockStartX).toBeLessThan(0);
    expect(ARENA_PLATFORM).toEqual({ left: 6 * TILE, right: 14 * TILE, topY: 7 * TILE });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/move-level.test.ts`
Expected: FAIL ("createArenaLevel is not defined").

- [ ] **Step 3: Implement in `src/movement/level.ts`**

  Refactor the private grid builder to take a map, keep `createLevel()`
  reading the existing `MAP`, and add:

```ts
// The arena: a flat yard with one raised platform. Three tiles tall is
// load-bearing - a jump's apex (~210 cm) cannot clear 288 cm, so the
// only way up is the hands: jump, catch the lip, pull up.
const ARENA_MAP = [
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
  "......########......",
  "......########......",
  "......########......",
  "####################",
];

/** Platform faces and top edge, cm. right is the RIGHT FACE (col 14's left). */
export const ARENA_PLATFORM = { left: 6 * TILE, right: 14 * TILE, topY: 7 * TILE };

export function createArenaLevel(): Level {
  return {
    grid: ARENA_MAP.map((row) => [...row].map((ch) => KIND[ch])),
    // Parked off-world: the engine's block collision can never engage.
    blockStartX: -500,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/move-level.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/movement/level.ts test/move-level.test.ts
git commit -m "feat(dueling): arena level - flat yard, one 8x3 platform"
```

---

### Task 4: Combat engine seams - assembleDuel, standalone presentation events

**Files:**
- Modify: `src/combat/engine.ts` (additive only; `tickDuel` body untouched)
- Test: `test/engine.test.ts`

**Interfaces:**
- Produces:
  - `export function assembleDuel(player: Fighter, enemy: Fighter): Duel`
    - player is ALWAYS index 0 (aiDecide reads `d.f[1]` as self).
  - `export function inRise(f: Fighter): boolean` (export the existing
    private function; no body change).
  - `export function standaloneFighterEvents(f: Fighter, side: 0 | 1, time: number, evs: FighterEvent[], wasRising: boolean): DuelEvent[]`
    - maps footfall -> "step", strikeBegin -> "swing", and appends one
      "windup" (with `ms`) when `!wasRising && inRise(f)` - the same
      mapping tickDuel performs inline. tickDuel is NOT refactored onto
      it (golden-replay event order is pinned); a test asserts the two
      agree instead.

- [ ] **Step 1: Write the failing test** in `test/engine.test.ts`:

```ts
describe("arena seams", () => {
  test("assembleDuel preserves fighters, player at index 0", () => {
    const p = createFighter(700, 1, WEAPONS.longsword);
    const e = createFighter(1100, -1, WEAPONS.rapier);
    p.x = 800;
    const d = assembleDuel(p, e);
    expect(d.f[0]).toBe(p);
    expect(d.f[1]).toBe(e);
    expect(d.f[0].x).toBe(800);
    expect(d.over).toBe(false);
    expect(d.bind).toBeNull();
    expect(d.log).toEqual([]);
  });

  test("standaloneFighterEvents matches the duel's mapping for an attack", () => {
    // Standalone: tick one fighter through an accepted cut and collect.
    const f = createFighter(700, 1, WEAPONS.longsword);
    applyIntent(f, "cut");
    const got: string[] = [];
    let rising = inRise(f);
    for (let i = 0; i < 90; i++) {
      const evs = tickFighter(f, TICK);
      for (const ev of standaloneFighterEvents(f, 1, i * TICK, evs, rising)) got.push(ev.kind);
      rising = inRise(f);
    }
    // The same attack inside a real duel, out of the opponent's reach.
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[1].x = 1790; // far: no contact, pure presentation stream
    const want: string[] = [];
    tickDuel(d, "cut", null);
    for (let i = 0; i < 90; i++) {
      for (const ev of tickDuel(d, null, null)) {
        if (ev.kind === "step" || ev.kind === "swing" || ev.kind === "windup") {
          if (ev.side === 0) want.push(ev.kind);
        }
      }
    }
    expect(got).toEqual(want);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/engine.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement in `src/combat/engine.ts`** (place beside
  `createDuel`; do not touch `tickDuel`):

```ts
/**
 * A Duel over two ALREADY-LIVING fighters: the arena scene's engagement.
 * The player must be index 0 - the AI (aiDecide) and the HUD both read
 * side 1 as the machine's. States and positions carry over untouched.
 */
export function assembleDuel(player: Fighter, enemy: Fighter): Duel {
  return {
    f: [player, enemy], time: 0, over: false, winner: null,
    outcome: null, bind: null, disarm: null, log: [],
  };
}

/**
 * The presentation mapping tickDuel performs inline (footfall -> step,
 * strikeBegin -> swing, the rise edge -> windup), for a fighter ticking
 * OUTSIDE a duel - the arena's sentinel. Kept in agreement with the
 * inline sites by test, not by refactor: tickDuel's event order is
 * golden-replay-pinned and must not churn.
 */
export function standaloneFighterEvents(
  f: Fighter, side: 0 | 1, time: number, evs: FighterEvent[], wasRising: boolean,
): DuelEvent[] {
  const out: DuelEvent[] = [];
  for (const e of evs) {
    if (e.type === "footfall") out.push({ time, side, kind: "step", text: "" });
    else if (e.type === "strikeBegin") out.push({ time, side, kind: "swing", text: "" });
  }
  if (!wasRising && inRise(f) && f.state.kind === "attack") {
    out.push({ time, side, kind: "windup", text: "", ms: f.weapon.attacks[f.state.attack].windup });
  }
  return out;
}
```

  Change `function inRise` to `export function inRise` (no body change).
  Add the needed type imports at the top if missing.

- [ ] **Step 4: Run tests including golden replays**

Run: `npx vitest run test/engine.test.ts test/golden-replay.test.ts && npx tsc --noEmit`
Expected: PASS, golden hashes unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/combat/engine.ts test/engine.test.ts
git commit -m "feat(dueling): assembleDuel and standalone fighter presentation events"
```

---

### Task 5: Renderer extractions

**Files:**
- Modify: `src/render/movedraw.ts`, `src/render/draw.ts`
- Test: existing suites only (pure refactor; `npx vitest run` green)

**Interfaces:**
- Produces from `movedraw.ts`:
  - `export function drawTiles(v: MoveView, level: Level): void` (the
    tile loop including ladder rails; extracted verbatim)
  - `export function drawMover(v: MoveView, m: Mover): void` (the player
    sprite block, verbatim; overlay box stays in drawMoveFrame)
  - `export const GRID_Y = 12` (currently private)
- Produces from `draw.ts` (each gains a trailing `floorY: number =
  ARENA.floorY` parameter; every internal `ARENA.floorY` in their bodies
  becomes `floorY`):
  - `export function drawFighter(v, f, time, bind, side, floorY?)`
  - `export function drawBodyTrack(v, f, disarm?, floorY?)`
  - `export function drawParryTrack(v, f, bind, side, floorY?)`
  - `export function drawTrackRow(v, cx, labelY, barY, label, color, frac, floorY?)`
  - `export function drawBindBar(v, d)` and
    `export function drawBanner(v, d)` (exported as-is; fixed screen
    coordinates).
  - `drawFrame` behavior is unchanged (defaults preserve it).

- [ ] **Step 1: Extract and export** exactly as listed. In
  `drawMoveFrame`, replace the inlined tile loop and player block with
  calls to `drawTiles`/`drawMover`. In `draw.ts`, thread `floorY`
  through `drawBodyTrack`/`drawParryTrack` into their `drawTrackRow`
  calls and through `drawFighter`'s `dy` computation.

- [ ] **Step 2: Verify pure refactor**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no behavior change anywhere.

- [ ] **Step 3: Commit**

```bash
git add src/render/movedraw.ts src/render/draw.ts
git commit -m "refactor(dueling): export tile/mover/fighter/track drawing for scene composition"
```

---

### Task 6: The arena scene core

The largest task: `src/scenes/arena.ts` with modes, conversions,
sentinel policy, engagement, edge rules, and events.

**Files:**
- Create: `src/scenes/arena.ts`
- Create: `src/render/arenadraw.ts` (minimal working version; polish in Task 7)
- Test: `test/arena.test.ts`

**Interfaces:**
- Consumes: `createArenaLevel`, `ARENA_PLATFORM` (Task 3);
  `assembleDuel`, `standaloneFighterEvents`, `inRise` (Task 4);
  `AIR_STEER_MS`-era Mover (Task 1); `aiDecide`, `createAiState`;
  `tickMove`, `createMover`; `applyIntent`, `tickFighter`, `createFighter`,
  `TICK`; `WEAPONS`; bullet time; renderer exports (Task 5).
- Produces:
  - `export function createArenaScene(deps: ArenaSceneDeps): Scene` with
    `ArenaSceneDeps = { ctx, images, tiles, audio, seedPin, initialAiMode, pWeapon, eWeapon }`.
  - `export const DRAW_MS = 350;` (draw/sheathe duration)
  - `export const EDGE_MARGIN = 60;` (cm; enemy policy keeps this far from lips)
  - `export const STRIKE_BAND = { lo: ARENA_PLATFORM.topY - 60, hi: ARENA_PLATFORM.topY + 20 };`
  - `Scene.snapshot()` return type in `src/scenes/scene.ts` gains
    `armed?: boolean` (optional; other scenes unchanged).
  - For tests, export the internal world accessor:
    `export interface ArenaScene extends Scene { world(): ArenaWorld }`
    where `ArenaWorld = { player: PlayerRep; enemy: Fighter; duel: Duel | null; level: Level; deadBy: 0 | 1 | null }`
    and `PlayerRep` is the union below.

**Core model** (this is the heart of the scene; implement as written):

```ts
export type PlayerRep =
  | { kind: "mover"; m: Mover }
  | { kind: "drawing"; m: Mover; t: number }        // sheathed -> armed
  | { kind: "fighter"; f: Fighter; floorY: number } // armed; floorY: cm of the surface stood on
  | { kind: "sheathing"; f: Fighter; floorY: number; t: number };
```

Rules, all in `tickOnce`:

1. **Duel live** (`duel !== null && !duel.over`): player intent from
   pending/held exactly like `src/scenes/duel.ts` (guard heldEdge ->
   parry/parryRelease, advance/retreat holds, press table). Enemy intent:
   `edgeSafe(aiDecide(duel, aiMode, ai, TICK))` where

```ts
/** Policy, not physics: refuse footwork whose travel would end within
 *  EDGE_MARGIN of a lip. The enemy's feet, its own choice - the player
 *  is free to walk off. */
function edgeSafe(f: Fighter, intent: Intent | null): Intent | null {
  if (intent !== "advance" && intent !== "retreat") return intent;
  const dir = intent === "advance" ? f.facing : -f.facing;
  const end = f.x + dir * f.weapon.stepDistance;
  if (end < ARENA_PLATFORM.left + EDGE_MARGIN || end > ARENA_PLATFORM.right - EDGE_MARGIN) return null;
  return intent;
}
```

   Feed `tickDuel(duel, ia, ib)`, collect DuelEvents. After the tick:
   if the player fighter's x left `[ARENA_PLATFORM.left, ARENA_PLATFORM.right]`,
   **disengage**: `duel = null`; enemy leaves any pair state
   (`if (enemy.state.kind === "bind" || enemy.state.kind === "exposed") enemy.state = { kind: "ready" };`
   and the duel's bind dies with the duel object); player becomes
   `{ kind: "mover", m }` via `fighterToMover(f, ARENA_PLATFORM.topY)`
   with `state: { kind: "fall" }, airFromJump: false, airMs: 0` - falling
   sheathes, instantly, no bar.

2. **No duel**: tick the enemy standalone:
   - sentinel policy (below) may produce an Intent; `applyIntent(enemy, it)`;
     `const evs = tickFighter(enemy, TICK)`;
     `frameDuelEvents.push(...standaloneFighterEvents(enemy, 1, simTime, evs, wasRising))`.
   - **strike resolution vs the unarmed body**: on `strikeEnd` in `evs`,
     compute the player body box (`mover`: x, y, `heightOf(state)`;
     `drawing`: same; armed reps cannot coexist with no-duel on the
     platform except on the lower floor, where reach can never close).
     Hit iff `Math.abs(enemy.x - px) <= enemy.weapon.reach` and the box
     `[py - h, py]` overlaps `[STRIKE_BAND.lo, STRIKE_BAND.hi]`. On hit:
     `deadBy = 1`, emit `hit` then `kill` DuelEvents (side 1), scene
     decided; on miss emit `whiff` (side 1) - the whoosh at resolution.
   - facing: while `enemy.state.kind === "ready"`, face the player
     (`enemy.facing = px >= enemy.x ? 1 : -1`).

3. **Player rep tick** (no duel):
   - `mover`: build MoveInput from held/pending like `src/scenes/move.ts`
     (jump/dash pendings); `tickMove(m, level, input)`; collect
     MoveEvents. If drawSheathe was pressed and
     `["idle", "walk", "run"].includes(m.state.kind)`:
     `player = { kind: "drawing", m, t: 0 }` (zero `m.vx`).
   - `drawing`: `t += TICK`; no inputs reach the mover (it stands).
     At `t >= DRAW_MS`:
     `player = { kind: "fighter", f: createFighter(m.x, m.x <= enemy.x ? 1 : -1, WEAPONS[pWeapon]), floorY: m.y }`.
   - `fighter` (armed, unengaged - only reachable on the lower floor):
     duel-style intents via `applyIntent`; `tickFighter`; strikes always
     whiff (emit whiff, side 0); steps move x (already engine-clamped to
     [120, 1800]). drawSheathe from `ready` ->
     `{ kind: "sheathing", f, floorY, t: 0 }`.
   - `sheathing`: `t += TICK`; at `t >= DRAW_MS` ->
     `{ kind: "mover", m: fighterToMover(f, floorY) }` with
     `state: { kind: "idle" }`.
4. **Engagement check** (after 3): if `player.kind === "fighter" &&
   player.floorY === ARENA_PLATFORM.topY` then
   `duel = assembleDuel(player.f, enemy)`.
5. **Death and restart**: `snapshot()` returns
   `{ live: no banner condition, decided: duel?.over === true || deadBy !== null, armed: player.kind === "fighter" || player.kind === "sheathing" }`.
   `reset()` rebuilds everything: mover at `x: 2 * TILE, y: 10 * TILE`,
   enemy `createFighter(960, -1, WEAPONS[eWeapon])`, fresh seed like
   `src/scenes/duel.ts` `start()`, fresh bullet time, `deadBy = null`.

Sentinel policy (private in arena.ts):

```ts
/** Pre-duel decisions only; physics stays in the fighter machine. */
interface Sentinel { cooldownMs: number }
const SENTINEL_COOLDOWN = 1400;
const SENTINEL_POST = 960; // platform center, cm

function sentinelDecide(enemy: Fighter, sn: Sentinel, px: number, threatened: boolean): Intent | null {
  if (enemy.state.kind !== "ready" || enemy.stepRecoveryMs > 0) return null;
  const gap = Math.abs(px - enemy.x);
  if (threatened && gap <= enemy.weapon.reach * 0.95 && sn.cooldownMs <= 0) {
    sn.cooldownMs = SENTINEL_COOLDOWN;
    return "thrust";
  }
  const target = threatened ? px : SENTINEL_POST;
  const d = target - enemy.x;
  if (Math.abs(d) > enemy.weapon.reach * 0.8) {
    const step = enemy.facing === Math.sign(d) ? "advance" : "retreat";
    return edgeSafe(enemy, step); // the same veto: policy owns the feet
  }
  return null;
}
```

`threatened` = the player body box overlaps STRIKE_BAND (same predicate
as strike resolution). Decrement `sn.cooldownMs` each tick.

Input tables (Scene interface plumbing):

```ts
const SHEATHED_HOLD = { a: "retreat", d: "advance", w: "up", s: "down", l: "guard", shift: "walk" } as const;
const ARMED_HOLD = { a: "retreat", d: "advance", l: "guard" } as const;
```

`press(e)`: sheathed - `k` jump, `j` dash, `e` drawSheathe; armed - the
duel scene's full switch (s/j/k/i/f/arrows/capslock/0-4) plus `e`
drawSheathe. `padAction`: route `jump`/`dash` when sheathed, duel verbs
when armed, `drawSheathe` always, `resetScene` -> reset. On every mode
flip reassign `scene.holdKeys` to the matching table. `keyRelease`
carries the armed CapsLock quirk exactly like duel.ts.

`frameScale`: bullet time via `bulletTimePhase(duel)` like duel.ts.
`audioFrame`: `audio.frame(frameDuelEvents)` then
`audio.moveFrame(frameMoveEvents)`, clear both.

`fighterToMover(f: Fighter, floorY: number): Mover` - a `createMover(level)`
then `m.x = f.x; m.y = floorY; m.facing = f.facing;` plus the stated
state overrides at each call site.

Minimal `arenadraw.ts` for this task (Task 7 polishes):
`drawArenaFrame(v, world, overlay, time)` fills the background, calls
`drawTiles`, then per rep: `drawMover` (mover/drawing) or
`drawFighter(v2, f, simTime, duel?.bind ?? null, side, GRID_Y + floorYcm * PX_PER_CM)`
for player and enemy; draws the drawing/sheathing progress via
`drawTrackRow(v2, cx, -184, -178, "drawing", "#e6c229", t / DRAW_MS, floorPx)`;
`drawBindBar` + `drawBanner` when applicable.

- [ ] **Step 1: Write failing tests** in `test/arena.test.ts`. Drive the
  scene through its public `Scene` interface plus `world()`; fabricate
  `deps` with a stub ctx (`null as unknown as CanvasRenderingContext2D`
  is fine - draw is never called in tests) and a silent audio stub:

```ts
const audioStub = { unlock() {}, frame() {}, moveFrame() {}, cue() {}, toggleMute() {} };
const HELD0: HeldLevels = { advance: false, retreat: false, guard: false, up: false, down: false, walk: false };
function scene(): ArenaScene {
  return createArenaScene({
    ctx: null as unknown as CanvasRenderingContext2D,
    images: {} as never, tiles: {} as never,
    audio: audioStub as never, seedPin: 7, initialAiMode: 2,
    pWeapon: "longsword", eWeapon: "rapier",
  });
}
const tick = (s: Scene, n: number, held = HELD0): void => { for (let i = 0; i < n; i++) s.tickOnce(held, 0); };
const press = (s: Scene, key: string): void => { s.press(new KeyboardEvent("keydown", { key })); };
```

  Tests (each a `test(...)`):
  1. "starts sheathed on the floor, enemy on the platform": world's
     player kind "mover", enemy.x between platform faces.
  2. "drawing takes DRAW_MS and produces a fighter": press "e", tick
     `DRAW_MS / TICK` ticks, expect kinds "drawing" then "fighter".
  3. "drawing is refused mid-air": force `m.state = { kind: "fall" }`,
     press "e", expect kind stays "mover".
  4. "engagement assembles a duel on the platform": teleport the mover
     (`w.player.m.x = 700; w.player.m.y = ARENA_PLATFORM.topY;
     w.player.m.state = { kind: "idle" }`), press "e", tick past DRAW_MS,
     expect `world().duel` non-null and `duel.f[1]` === enemy.
  5. "backing off the lip dissolves the duel into a sheathed fall":
     from state 4, set `w.player.f.x = ARENA_PLATFORM.left - 1` (a
     step's travel done), one tick, expect duel null, player kind
     "mover" with state.kind "fall".
  6. "the enemy never enters the edge margin": from engagement, run
     3000 ticks feeding held advance (player presses forward); every
     tick assert `enemy.x >= ARENA_PLATFORM.left + EDGE_MARGIN - 1 &&
     enemy.x <= ARENA_PLATFORM.right - EDGE_MARGIN + 1`.
  7. "an unarmed player in reach is struck dead": place the mover on the
     platform beside the enemy (`x = enemy.x - 150`, `y = topY`, idle),
     tick until `snapshot().decided` (bound: 4000 ticks) - expect
     decided true and duel still null.
  8. "out of the band the strike whiffs": mover on the FLOOR under the
     enemy's x, tick 4000, expect `snapshot().decided` false.
  9. "falling never keeps the sword": from engaged duel, dissolve via
     rule 5, expect `snapshot().armed` false.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/arena.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `src/scenes/arena.ts` and minimal
  `src/render/arenadraw.ts`** per the model above. Also add
  `armed?: boolean` to `snapshot()`'s type in `src/scenes/scene.ts`.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, including golden replays.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/arena.ts src/render/arenadraw.ts src/scenes/scene.ts test/arena.test.ts
git commit -m "feat(dueling): arena scene - parkour approach, sentinel enemy, assembled duel"
```

---

### Task 7: Arena help panel and full renderer

**Files:**
- Create: `src/ui/arenahelp.ts`
- Modify: `src/render/arenadraw.ts` (furniture: legend lines, time
  control, help button, overlay boxes)
- Test: `test/arenahelp.test.ts`

**Interfaces:**
- Produces: `export function renderArenaHelpHtml(labels?: Labels): string`,
  `export function arenaControlsLines(labels?: Labels): [string, string]`.

- [ ] **Step 1: Write failing tests** in `test/arenahelp.test.ts`
  (mirror `test/movehelp.test.ts`'s structure):

```ts
test("all tokens resolve for every scheme", () => {
  for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
    expect(renderArenaHelpHtml(labels)).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const line of arenaControlsLines(labels)) expect(line).not.toMatch(/\{/);
  }
});
test("the panel cites the shipping draw duration", () => {
  expect(renderArenaHelpHtml(KEYBOARD_LABELS)).toContain(String(DRAW_MS));
});
test("entries stay concise", () => {
  const text = renderArenaHelpHtml(KEYBOARD_LABELS).replace(/<[^>]+>/g, " ");
  for (const sentence of text.split(/(?<=\.)\s+/)) expect(sentence.length).toBeLessThan(180);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/arenahelp.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/ui/arenahelp.ts`** - a short two-section
  panel (mirroring movehelp's html shape and css classes):
  - Sheathed: "Parkour rules apply ({jump} jump, {dash} dash, {grab}
    grab). {drawSheathe} draws the sword (`DRAW_MS` ms, shown as a bar) -
    only standing on the ground, and the enemy can strike you at any
    time you are in its reach."
  - Armed: "The duel rules apply in full ({cut} cut, {thrust} thrust,
    {guard} guard...). {drawSheathe} sheathes ( same bar). Backing past
    the lip is a fall, and FALLING SHEATHES - the enemy will not follow
    you off."
  Interpolate `DRAW_MS` via the imported constant, never a literal.
  `arenaControlsLines` follows `moveControlsLines`' format with the
  sheathed line plus drawSheathe.

- [ ] **Step 4: Finish `src/render/arenadraw.ts` furniture**: legend
  from `arenaControlsLines`, paused/timescale text, `HELP_BUTTON`
  outline (copy the movedraw block), overlay: mover collision box and
  state text when sheathed (reuse movedraw's overlay approach inline),
  `drawBodyTrack`/`drawParryTrack` at the platform floorY when armed
  with overlay on.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/ui/arenahelp.ts src/render/arenadraw.ts test/arenahelp.test.ts
git commit -m "feat(dueling): arena help panel and full arena renderer"
```

---

### Task 8: Scene selector and main wiring

**Files:**
- Modify: `src/ui/scenes.ts`, `index.html`, `src/main.ts`
- Test: `test/scenes-select.test.ts`

**Interfaces:**
- Consumes: `createArenaScene` (Task 6), `renderArenaHelpHtml` (Task 7),
  `SceneId` "arena" (Task 2).
- Produces: three-way selector; `?scene=arena` boots straight in; Esc
  from the arena returns to the selector; help shows the arena panel;
  `uiSnapshot().armed` reads the active scene's snapshot.

- [ ] **Step 1: Write failing tests** in `test/scenes-select.test.ts`:
  selLeft/selRight cycle duel -> move -> arena -> duel (wrapping both
  ways); `selPickThird` picks arena; confirm fires `onPick("arena")`.
  Follow the file's existing harness for showScenes/handleScenesAction.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/scenes-select.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - `src/ui/scenes.ts`: `const ORDER: SceneId[] = ["duel", "move", "arena"];`
    selLeft/selRight rotate through ORDER; `selPickThird` -> "arena";
    keyboard handler maps `"3"` -> selPickThird; `render()` iterates
    ORDER instead of the two-tuple.
  - `index.html`: third column
    `<div class="col" data-scene="arena"><h2>Arena</h2><div class="option"><strong>The platform</strong><br><small>Climb the platform unarmed; draw, and the duel rules take over.</small></div></div>`
    and widen the hint text via scenes.ts (it already resolves tokens;
    add `{selPickThird}` to the hint string).
  - `src/main.ts`:
    - create `arenaScene = createArenaScene({ ctx, images, tiles, audio, seedPin, initialAiMode, pWeapon: state.pWeapon, eWeapon: state.eWeapon })`
      next to the others; `startArena()` mirrors `startMove()`.
    - `openScenes` callback: `(s) => { if (s === "duel") openSelect(); else if (s === "move") startMove(); else startArena(); }`.
    - `goBack()`: arena -> `openScenes()`.
    - boot: `else if (sceneParam === "arena") startArena();`
    - `helpHtml()`: `active?.id === "arena" ? renderArenaHelpHtml(activeLabels()) : ...`.
    - `uiSnapshot()`: `armed: snap.armed ?? false` (replacing Task 2's
      placeholder literal).
    - `applyPadAction`: add `"selPickThird"` to the select-verb case list.

- [ ] **Step 4: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/scenes.ts src/main.ts index.html test/scenes-select.test.ts
git commit -m "feat(dueling): third scene wired - selector, boot param, help routing"
```

---

### Task 9: Full verification - suites, lint, and e2e in Chrome

**Files:** none new (fixes land where the evidence points).

- [ ] **Step 1: Full local gates**

Run in `06-dueling/`: `npm test && npm run build`
Run at repo root: `npm run lint`
Expected: all green.

- [ ] **Step 2: E2E in Chrome.** Start the dev server
  (`cd 06-dueling && npm run dev`, page at
  `http://127.0.0.1:5173/prototypes/06/`), then drive it with the
  Chrome MCP tools (`?scene=arena`, keyboard events via CDP). Verify,
  with screenshots at each stage:
  1. Selector shows three columns; `3` + Enter boots the arena.
  2. Jump at the platform face -> ledge catch -> W pulls up (the only
     way up; direct jump must fail).
  3. Enemy approaches on top but never nears the lip; its strike kills
     an idling sheathed player (death banner; R restarts).
  4. `E` shows the progress bar, then duel HUD elements appear; J/K/L
     produce cut/thrust/guard with sounds; a parry rings on contact.
  5. Holding A past the lip mid-duel: the player falls off sheathed,
     enemy stays, re-climb re-engages after `E`.
  6. `?scene=move`: no double jump mid-air; steering dies ~120 ms after
     liftoff; ledge catches still work.
  7. `?` overlay in the arena resolves all tokens on keyboard labels.
- [ ] **Step 3: Fix anything found, re-run step 1, commit fixes** with
  scoped paths and a `fix(dueling):` message describing the symptom.

---

## Self-review notes (already applied)

- Spec coverage: level (T3), modes/draw (T6), engagement/edge (T6),
  unarmed threat (T6), input (T2/T6), air rules (T1), rendering (T5/T6/T7),
  audio (T4/T6), help (T7), weapons/flow (T6/T8), testing (every task),
  e2e (T9).
- aiDecide hardcodes self = f[1]: assembleDuel pins player to index 0
  and the test in T4 asserts it.
- Golden replays: tickDuel untouched; T4's agreement test replaces the
  refactor the spec's "shared helper" wording might otherwise invite.
- `armed` on UiSnapshot is required (not optional) so every constructor
  states it; `snapshot().armed` is optional so duel/move stay untouched.
