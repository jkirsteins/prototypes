# Survidle Wildlife Disturbance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cell-count wildlife alarm with scale-independent, immediate ungulate startle behavior that is legible through state, map animation, audio, and the log.

**Architecture:** A single metric adapter converts current coarse positions into stable metric estimates, while pure encounter code owns detection, perception, escape calibration, and presentation events without importing grid scale. The simulation emits one structured transient event per escape episode; UI, audio, and logging consume that event without rediscovering facts. A neutral movement profile preserves a clean seam for a later Walking skill.

**Tech Stack:** TypeScript 5.5, Vitest 2, Vite 5, DOM/CSS, Web Audio, existing seeded RNG and save model, ffmpeg asset pipeline.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-wildlife-disturbance-design.md`

## Global Constraints

- Output and source comments use ASCII punctuation only.
- Wildlife encounter behavior reasons in metres and minutes, never cell counts.
- Only `src/sim/wildlife-space.ts` may import `CELL_KM`, `cellOf`, cell indexing, or grid-neighbour helpers for encounter geometry.
- Stable coarse subject points derive from world seed, subject ID, and area key without consuming simulation RNG.
- Ungulates are deer, reindeer, and elk. Wolves, bears, and wolverines do not inherit this flee rule.
- Ordinary travel gets neutral movement factors and no Hunting bonus. Hunt activity alone sets `deliberateApproach` and may use Hunting.
- One transition into an escape episode emits at most one structured event, one log entry, one visual cue, and one audio sequence.
- Heard-only presentation reveals no subject identity, exact count, route, persistent map knowledge, familiarity, or last-known position.
- Offline or aggregate advance emits no transient visual or audio event.
- The visual marker lasts 1200 ms and reduced motion removes pop, rise, recoil, and shake while retaining appearance and fade.
- Every selected startle audio slot has at least two variants. Audio failure or mute never changes simulation outcomes.
- `npm test` and `npm run build` must pass before the final commit.

---

### Task 1: Metric spatial adapter

**Files:**
- Create: `src/sim/wildlife-space.ts`
- Create: `tests/wildlife-space.test.ts`

**Interfaces:**
- Produces: `MetricPoint`, `SpatialEstimate`, `EncounterGeometry`, `metricPointForPlayer(state, world)`, `metricAreaForCell(world, cell)`, `resolveSpatialEstimate(seed, subjectId, estimate)`, `encounterGeometry(actor, subject)`.
- Consumes: `CELL_KM`, `GameState`, `World`, and the existing seeded `derive` helper.

- [ ] **Step 1: Write failing geometry tests**

```ts
it("keeps a coarse subject point stable and separated inside the same area", () => {
  const area = metricAreaForCell(world, cellOf(state, world));
  const a = resolveSpatialEstimate(state.seed, 17, area);
  const b = resolveSpatialEstimate(state.seed, 17, area);
  expect(a).toEqual(b);
  expect(encounterGeometry(metricPointForPlayer(state, world), a).distanceM).toBeGreaterThan(0);
});

it("makes exact and area estimates agree when they resolve to the same point", () => {
  const point = { xM: 125, yM: 240 };
  expect(encounterGeometry(point, resolveSpatialEstimate(1, 1, { kind: "exact", point }))).toMatchObject({ distanceM: 0, uncertaintyM: 0 });
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `npx vitest run tests/wildlife-space.test.ts`
Expected: FAIL because `src/sim/wildlife-space.ts` does not exist.

- [ ] **Step 3: Implement the adapter and finite-input guard**

```ts
export interface MetricPoint { xM: number; yM: number }
export type SpatialEstimate = { kind: "exact"; point: MetricPoint } | { kind: "area"; key: string; min: MetricPoint; max: MetricPoint };
export interface EncounterGeometry { actor: MetricPoint; subject: MetricPoint; distanceM: number; bearingRad: number; uncertaintyM: number }

export function resolveSpatialEstimate(seed: number, subjectId: number, estimate: SpatialEstimate): MetricPoint | null;
export function encounterGeometry(actor: MetricPoint, subject: MetricPoint, uncertaintyM?: number): EncounterGeometry | null;
```

Use `derive(seed, 81000 + subjectId * 2 + hash(area.key))` independently for x and y fractions. Convert cell bounds with `CELL_KM * 1000`; use player interpolation rather than snapping to cell centre. Return `null` for any non-finite input and call `console.assert(false, ...)` only outside production.

- [ ] **Step 4: Add the dependency guard and rerun tests**

```ts
it("keeps grid dependencies behind the spatial adapter", () => {
  const source = readFileSync(new URL("../src/sim/wildlife-encounter.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/CELL_KM|cellOf|cellIndex|neighbours/);
});
```

Run: `npx vitest run tests/wildlife-space.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/wildlife-space.ts 08-survidle/tests/wildlife-space.test.ts
git commit -m "feat(survidle): add metric wildlife space adapter"
```

### Task 2: Pure disturbance and perception model

**Files:**
- Create: `src/sim/wildlife-encounter.ts`
- Create: `tests/wildlife-encounter.test.ts`
- Modify: `src/sim/species.ts`
- Modify: `tests/species.test.ts`

**Interfaces:**
- Consumes: `EncounterGeometry` from Task 1, terrain/weather/light facts, `derive`, and `skillLevel` only through a supplied factor.
- Produces: `MovementProfile`, `neutralMovementProfile`, `DisturbanceProfile`, `DISTURBANCE_PROFILES`, `StartlePerception`, `WildlifeStartleEvent`, `evaluateUngulateEncounter(input)`, `escapeDistanceM(seed, eventId, profile)`, `startleLogText(input)`.

- [ ] **Step 1: Write failing catalogue and deterministic decision tests**

```ts
it.each(["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const)("calibrates %s", (species) => {
  expect(DISTURBANCE_PROFILES[species]).toBeDefined();
});

it("does not force same-area detection and separates animal detection from survivor perception", () => {
  const result = evaluateUngulateEncounter({ ...fixture, geometry: { ...fixture.geometry, distanceM: 210 }, detectionRoll: 0.99, hearingRoll: 0.99, sightRoll: 0.99 });
  expect(result.detected).toBe(false);
  expect(result.perception.kind).toBe("none");
});
```

- [ ] **Step 2: Run the tests and confirm missing exports**

Run: `npx vitest run tests/wildlife-encounter.test.ts tests/species.test.ts`
Expected: FAIL on missing encounter model and disturbance catalogue.

- [ ] **Step 3: Implement profiles and pure evaluation**

```ts
export interface MovementProfile { speedKmh: number; loadKg: number; noiseFactor: number; visibilityFactor: number; footingFactor: number; deliberateApproach: boolean }
export interface DisturbanceProfile { visualRangeM: number; auditoryRangeM: number; alertAlarm: number; flightAlarm: number; alarmGain: number; settleMinutes: number; settleDistanceM: number; escapeMinM: number; escapeMaxM: number }
export type StartlePerception =
  | { kind: "seen"; identification: "subject" | "species" | "ungulate" | "unknown" }
  | { kind: "heard"; identification: "species" | "ungulate" | "unknown"; uncertaintyM: number }
  | { kind: "none" };
```

Calibrate deer to 140/190 m sensing and 420-680 m escape, reindeer to 170/220 m and 500-760 m, and elk to 160/230 m and 520-800 m. Give non-ungulates explicit neutral profiles with `alarmGain: 0` so catalogue coverage is total. Cite the red deer and roe deer sources from the design notes beside the table. Detection probability falls linearly with range, then multiplies cover, lux, precipitation, movement, and deliberate Hunting approach factors. Rolls are supplied or deterministically derived, not taken from the main RNG.

- [ ] **Step 4: Cover disclosure, settling gates, and no-grid imports**

Add table-driven tests for seen recognized/species/ungulate, heard localized/nonlocalized, none, heavy-rain masking, ordinary versus deliberate approach, deterministic escape bounds, and log strings. Add a source guard that `wildlife-encounter.ts` does not contain `CELL_KM`, `cellOf`, `cellIndex`, or `neighbours`.

Run: `npx vitest run tests/wildlife-encounter.test.ts tests/wildlife-space.test.ts tests/species.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/wildlife-encounter.ts 08-survidle/src/sim/species.ts 08-survidle/tests/wildlife-encounter.test.ts 08-survidle/tests/wildlife-space.test.ts 08-survidle/tests/species.test.ts
git commit -m "feat(survidle): model ungulate disturbance in metres"
```

### Task 3: Immediate simulation escape and event delivery

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/wildlife-agents.ts`
- Modify: `src/sim/advance.ts`
- Modify: `src/sim/save.ts`
- Create: `src/sim/wildlife-events.ts`
- Modify: `tests/animal-agents.test.ts`
- Modify: `tests/advance-save.test.ts`

**Interfaces:**
- Consumes: Task 1 adapter and Task 2 encounter functions.
- Produces: persistent active fields `escapeRemainingM`, `escapeStartedMinute`, `lastDetectionMinute`, `escapeEpisode`; `setWildlifeEventSink(sink)`, `emitWildlifeEvent(event)`, `evaluateWildlifeDisturbance(state, world, cal, live)`.

- [ ] **Step 1: Write failing immediate-response and persistence tests**

```ts
it("starts and spends escape in the minute that movement startles a herd", () => {
  setWildlifeEventSink((event) => events.push(event));
  evaluateWildlifeDisturbance(state, world, cal, true);
  expect(deer.active?.intent).toBe("flee");
  expect(deer.active?.cell).not.toBe(startCell);
  expect(events).toHaveLength(1);
});

it("allows an undetected herd to remain in the survivor's coarse area", () => {
  evaluateWildlifeDisturbance(state, world, cal, true, highRolls);
  expect(deer.active?.cell).toBe(cellOf(state, world));
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/animal-agents.test.ts tests/advance-save.test.ts`
Expected: FAIL because immediate evaluation, event sink, and persistent escape fields do not exist.

- [ ] **Step 3: Integrate one escape episode**

Initialize new active fields during activation and migrate absent fields in deserialization. Evaluate encounters after each minute's player/task update and again on detailed wildlife ticks. Use a metric broad phase computed from profile range through the adapter. On the first flight transition, increment `escapeEpisode`, choose metric escape distance, log immediately, emit only if `live` and perceived, and spend at least one passable coarse movement step immediately. Later ticks continue spending distance; blocked movement selects the passable neighbor maximizing metric separation or stays alarmed. Settle only when both elapsed time and metric separation pass profile thresholds.

- [ ] **Step 4: Prove deduplication, boundaries, and catch-up behavior**

Add tests for one herd event per episode, continued detection refreshing alarm without another event, water/ice/region-edge passability, no teleport, time plus distance settlement, save/load persistence without replay, aggregate collapse, offline `advance` with a null sink, and `MAX_ACTIVE_SUBJECTS` unchanged.

Run: `npx vitest run tests/animal-agents.test.ts tests/advance-save.test.ts tests/wildlife-encounter.test.ts tests/wildlife-space.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/wildlife-agents.ts 08-survidle/src/sim/advance.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/wildlife-events.ts 08-survidle/tests/animal-agents.test.ts 08-survidle/tests/advance-save.test.ts
git commit -m "feat(survidle): make startled ungulates escape immediately"
```

### Task 4: Transient map cue and accessible animation

**Files:**
- Modify: `src/ui/render.ts`
- Modify: `src/ui/map.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Create: `tests/wildlife-startle-ui.test.ts`

**Interfaces:**
- Consumes: `WildlifeStartleEvent` and `setWildlifeEventSink` from Task 3.
- Produces: `UiState.wildlifeStartles`, `enqueueWildlifeStartle(ui, event, nowMs)`, event-aware `mapKey` and `mapHtml` transient overlay.

- [ ] **Step 1: Write failing markup and lifecycle tests**

```ts
it("renders one non-identifying cue on hidden ground and expires it after 1200 ms", () => {
  enqueueWildlifeStartle(ui, heardEvent, 1000);
  expect(mapHtml(world, state, ui, cal, 1100)).toContain('class="wildlife-startle heard"');
  expect(mapHtml(world, state, ui, cal, 2201)).not.toContain("wildlife-startle");
  expect(mapHtml(world, state, ui, cal, 1100)).not.toContain(heardEvent.subjectId.toString());
});
```

- [ ] **Step 2: Run the test and confirm missing UI behavior**

Run: `npx vitest run tests/wildlife-startle-ui.test.ts tests/map-inspection.test.ts`
Expected: FAIL on the missing queue and overlay.

- [ ] **Step 3: Implement the transient layer**

Store events with `startedAtMs`, ignore duplicate IDs, prune after 1200 ms, and include active IDs in `mapKey`. Project metric source through the current view transform. In-view cues render `<i aria-hidden="true" class="wildlife-startle seen|heard">!</i>` inside the cell without replacing its glyph; offscreen cues render once on the nearest map edge with a bearing class. Seen animal cells also get `wildlife-recoil`; heard cues never create animal markup or persistent state. Main's live event sink enqueues the UI event and calls audio once; catch-up temporarily sets the sink to null.

- [ ] **Step 4: Add CSS motion and reduced-motion fallback**

```css
.wildlife-startle { animation: wildlife-startle 1.2s ease-out both; }
.wildlife-recoil { animation: wildlife-recoil .28s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .wildlife-startle { animation-name: wildlife-startle-fade; }
  .wildlife-recoil { animation: none; }
}
```

Test overlay ordering, player/animal glyph preservation, zoom rerender without replay, offscreen edge cue, herd deduplication, and presence of reduced-motion rules.

Run: `npx vitest run tests/wildlife-startle-ui.test.ts tests/map-inspection.test.ts tests/css.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/render.ts 08-survidle/src/ui/map.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/wildlife-startle-ui.test.ts
git commit -m "feat(survidle): show transient wildlife startle cues"
```

### Task 5: Layered and legible departure audio

**Files:**
- Modify: `src/audio/manifest.ts`
- Modify: `src/audio/scheduler.ts`
- Modify: `src/audio/engine.ts`
- Modify: `scripts/audio-sources.json`
- Modify: `public/audio/manifest.md`
- Create: `tests/wildlife-startle-audio.test.ts`
- Create: `public/audio/startle_*.ogg`

**Interfaces:**
- Consumes: `WildlifeStartleEvent` from Task 2 and main's live event delivery from Task 4.
- Produces: `Scheduler.wildlifeStartle(event)`, seven named `startle_*` slots, and `AudioEngine.duck(durationMs, amount)`.

- [ ] **Step 1: Write failing scheduler selection tests**

```ts
it("layers forest departure with distance gain, bearing pan, and deterministic rate", () => {
  scheduler.wildlifeStartle(forestDeerEvent);
  expect(engine.plays.map((p) => p.slot)).toEqual(["startle_contact", "startle_hoof_light_forest"]);
  expect(engine.plays[1].opts.pan).toBeCloseTo(Math.sin(forestDeerEvent.bearingRad));
  expect(engine.ducks).toEqual([{ durationMs: 900, amount: 0.28 }]);
});
```

- [ ] **Step 2: Run the test and confirm missing audio API**

Run: `npx vitest run tests/wildlife-startle-audio.test.ts tests/scheduler.test.ts`
Expected: FAIL on missing slots and `wildlifeStartle`.

- [ ] **Step 3: Add sources, variants, and attribution**

Use CC0 Freesound sources `452570` (branch snap) and `684446` (horse gallop), preserving their page URLs, author names, CC0 licence, trims, and processing notes in `scripts/audio-sources.json`. Generate at least two short variants for each of `startle_hoof_light_forest`, `startle_hoof_heavy_forest`, `startle_hoof_light_open`, `startle_hoof_heavy_open`, `startle_hoof_bog`, `startle_hoof_snow`, and `startle_brush_predator`; add two `startle_contact` variants for the sharp onset. Use trim, pitch, EQ, and fades to make forest brushy, open hard-edged, bog wet, snow crunchy, light faster, and heavy lower. Run `node scripts/audio-fetch.mjs` and verify generated files are nonempty Ogg Opus.

- [ ] **Step 4: Implement event scheduling and graceful fallback**

Map spruce/pine/birch to forest, meadow/fell/rock to open, bog to bog, and snow cover to snow; map deer/reindeer to light and elk to heavy. Contact starts at delay 0; footfalls begin at 0.06-0.12 s and recede through descending gains over 1-3 seconds. Distance controls gain, `sin(bearingRad)` controls pan, event ID controls a rate jitter within +/-0.05, and group class adds one quieter non-identical layer. Duck loops and task footsteps by 0.28 for 900 ms. Missing playback warns once through the engine but leaves callers alive; no stereo centres pan.

Run: `npx vitest run tests/wildlife-startle-audio.test.ts tests/scheduler.test.ts tests/audio-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/audio/manifest.ts 08-survidle/src/audio/scheduler.ts 08-survidle/src/audio/engine.ts 08-survidle/scripts/audio-sources.json 08-survidle/public/audio/manifest.md 08-survidle/public/audio/startle_*.ogg 08-survidle/tests/wildlife-startle-audio.test.ts
git commit -m "feat(survidle): add terrain-aware wildlife departure audio"
```

### Task 6: Deterministic playtest seeds and whole-feature regression coverage

**Files:**
- Create: `scripts/startle-seeds.ts`
- Modify: `package.json`
- Create: `tests/startle-scenarios.test.ts`
- Modify: `docs/superpowers/specs/2026-09-09-survidle-wildlife-disturbance-design.md`

**Interfaces:**
- Consumes: all preceding public encounter, simulation, UI, and audio interfaces.
- Produces: `npm run startle-seeds`, printing reproducible visible, heard-only, same-area-undetected, bog/snow, and blocked-edge cases with seed, subject, start cell, survivor cell, and approach instruction.

- [ ] **Step 1: Write failing deterministic scenario tests**

```ts
it.each(["visible", "heard-only", "same-area-remain", "bog", "snow", "blocked-edge"])("finds a reproducible %s scenario", (kind) => {
  const scenario = findStartleScenario(kind, 1, 5000);
  expect(scenario).not.toBeNull();
  expect(replayStartleScenario(scenario!)).toMatchObject({ kind });
});
```

- [ ] **Step 2: Run scenario tests and confirm missing harness**

Run: `npx vitest run tests/startle-scenarios.test.ts`
Expected: FAIL because the scenario finder does not exist.

- [ ] **Step 3: Implement the bounded seed finder and browser setup output**

Export pure `findStartleScenario` and `replayStartleScenario` helpers from the script. Search seeds 1 through 5000 with deterministic encounter rolls, never `Math.random`, and print a compact table plus copyable `window.survidle` setup commands. Add `"startle-seeds": "vite-node scripts/startle-seeds.ts"` to `package.json`. Append the verified seed table and exact manual steps to the design spec's browser-playtest section.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npm run startle-seeds
npx vitest run tests/startle-scenarios.test.ts tests/wildlife-space.test.ts tests/wildlife-encounter.test.ts tests/animal-agents.test.ts tests/advance-save.test.ts tests/wildlife-startle-ui.test.ts tests/wildlife-startle-audio.test.ts
npm test
npm run build
```

Expected: seed table prints, focused tests PASS, full fast suite PASS, and TypeScript/Vite production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/scripts/startle-seeds.ts 08-survidle/package.json 08-survidle/tests/startle-scenarios.test.ts 08-survidle/docs/superpowers/specs/2026-09-09-survidle-wildlife-disturbance-design.md
git commit -m "test(survidle): add wildlife startle playtest seeds"
```

### Task 7: Browser verification and final evidence

**Files:**
- Modify only if verification exposes a defect: files from Tasks 3-6 and their covering tests.

**Interfaces:**
- Consumes: `npm run startle-seeds`, the development server, live UI event sink, audio scheduler, and browser accessibility preferences.
- Produces: committed fixes for any defect found; screenshots are external verification evidence and are not committed unless the repository already has an established location for feature evidence.

- [ ] **Step 1: Start the scoped development server**

Run: `npm run dev`
Expected: Vite serves `http://127.0.0.1:5173/prototypes/08/`.

- [ ] **Step 2: Play deterministic scenarios**

Use the printed visible and heard-only setups. Confirm one `!`, recoil only for visible wildlife, a matching single log line, audible sudden contact plus receding footfalls, and no hidden identity/glyph/mapping disclosure. Capture screenshots during visible and heard-only effects.

- [ ] **Step 3: Exercise fallbacks and scale behavior**

During an effect, change zoom and confirm it reprojects without replay. Test muted audio, hidden/restore tab, reduced motion, offscreen bearing pulse, bog/snow variants, and blocked water/edge. Confirm same-area non-detection can leave an animal present and that no outcome changes when audio is muted.

- [ ] **Step 4: Fix any observed defect test-first and rerun its focused suite**

For each defect, add a failing assertion to the nearest `tests/wildlife-*.test.ts`, implement the smallest correction, and rerun that file. Then rerun `npm test` and `npm run build`.

- [ ] **Step 5: Stop the server and commit only if fixes were required**

```bash
git add 08-survidle/src/... 08-survidle/tests/...
git commit -m "fix(survidle): address wildlife startle playtest findings"
```
