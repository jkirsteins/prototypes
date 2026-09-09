# Survidle Continuous Wildlife Travel Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Work test-first and stop at each review gate.

Goal: Replace instantaneous wildlife cell relocation with continuous,
metric travel advanced by game time, while preserving deterministic saves,
visibility, encounter behavior, and map legibility at every zoom level.

Architecture: Active wildlife owns an exact metric position and at most one
in-progress segment toward a passable waypoint. Decision ticks select intents
and waypoints, but elapsed game minutes move the subject along the segment at
a species- and intent-specific speed. The grid adapter derives the containing
cell from the exact position. Encounter and presentation code consume the
same exact position, so cell size and future map detail do not alter behavior.

## Constraints

- Movement distance is `speedMPerMinute * elapsedGameMinutes`.
- No movement rule uses a fixed number of pixels, subcells, or assumed cell
  size. Grid conversion remains inside `wildlife-space.ts`.
- A new escape emits its cue immediately but does not relocate the subject.
  Travel begins through elapsed simulation time after the reaction.
- `escapeRemainingM` decreases only by distance actually travelled.
- Decision ticks reconsider intent and update needs. They do not grant one
  cell of movement. While an intent remains active, arrival at a waypoint
  immediately schedules the next segment and consumes residual elapsed time.
- Locomotion, needs, decisions, and interactions have separate cadences.
  Crossing more or smaller cells must not multiply hunger, thirst, attacks,
  predation, feeding, or other interaction effects.
- A subject cannot cross water, unsafe ice, a world edge, or its active-region
  boundary. It cannot teleport when blocked.
- Detailed foreground advance updates exact positions each simulation step.
  Aggregate and offline behavior remains cheap and emits no transient cues.
- Save migration gives old cell-only subjects their existing deterministic
  point, without replaying an escape or changing seeded population outcomes.
- Visibility, predation, camp interaction, map glyphs, recoil, and startle
  sources must use the exact position or its derived current cell consistently.
- This task converts locomotion and ungulate encounters. Legacy wolf attacks,
  predation, camp-food contact, and fire avoidance remain cell-based and are
  recorded as a separate roadmap item before simulation-cell scale may change.
- Motion is tested with more than one configured cell scale or with a metric
  adapter fixture that proves duration depends on distance, not cell count.

## Task 1: Exact position and save migration

Files:

- Modify `src/sim/types.ts`
- Modify `src/sim/wildlife-space.ts`
- Modify `src/sim/save.ts`
- Modify `src/sim/wildlife-agents.ts`
- Modify `tests/wildlife-space.test.ts`
- Modify `tests/advance-save.test.ts`

1. Add a serializable exact metric position and optional active travel segment
   to `WildlifeActive`. Keep `cell` as a derived spatial bucket for existing
   routing and lookup code during this change.
2. Add adapter functions that resolve an active subject's exact point and map
   a finite metric point back to a valid world cell.
3. Initialize new subjects at their existing deterministic point inside the
   selected cell.
4. Migrate old saves from `cell` to that same deterministic point. A loaded
   subject already fleeing retains its remaining distance but begins no
   movement until game time advances.
5. Test round trips, invalid points, world edges, and unchanged old-save
   deterministic placement.

Review gate: no caller outside the grid adapter performs metres-per-cell
conversion.

## Task 2: Time-scaled segment travel

Files:

- Modify `src/sim/species.ts`
- Modify `src/sim/wildlife-agents.ts`
- Modify `tests/species.test.ts`
- Modify `tests/animal-agents.test.ts`

1. Add centralized ordinary and escape speeds in physical units to each agent
   species profile. Use plausible gait values and keep them balance-visible in
   one tested table.
2. Change movement decisions to schedule an adjacent passable waypoint instead
   of assigning `active.cell`.
3. Split the current bundled movement function into timed needs, intent
   decisions, segment integration, and interactions. Preserve each existing
   cadence explicitly.
4. Advance the exact position along the current segment by elapsed game time.
   Handle arrival, residual time, and derived-cell updates deterministically.
   While the intent continues, schedule the next waypoint immediately rather
   than waiting for another ten-minute decision tick.
5. For escape, immediately select the first away waypoint but leave position
   unchanged in the triggering call. Continue through away waypoints while
   remaining distance and elapsed time permit.
6. Define interval ordering: integrate travel that was active during the
   elapsed interval, then evaluate reactions at the interval endpoint. A newly
   triggered escape may schedule travel but cannot consume time preceding its
   event timestamp. Cover reaction and decision boundaries explicitly.
7. Prove with tests that half the travel time produces the segment midpoint,
   equal elapsed time produces equal distance across different update chunking,
   zero elapsed time never moves, and arrival crosses only adjacent passable
   cells. The chunk-invariance claim applies to locomotion given identical
   timed decisions; it does not claim that the existing weather and encounter
   schedulers are invariant to arbitrary external advance chunking.
8. Prove that one metric journey continues across multiple waypoints at the
   same physical speed in two cell-scale fixtures, and that the extra crossings
   do not change needs, attacks, kills, feeding, or other interaction counts.

Review gate: an escape reaction changes intent/event state immediately, while
position changes only in proportion to later elapsed game time.

## Task 3: Integrate dependent simulation systems

Files:

- Modify `src/sim/wildlife-agents.ts`
- Modify `src/sim/wildlife-space.ts`
- Modify relevant wildlife, visibility, predation, and save tests

1. Use the exact point for disturbance geometry and emitted seen-event source.
2. Derive the current cell from exact position before terrain, visibility,
   route, camp, and predation checks.
3. Derive the current cell during every segment integration and at every
   waypoint. Legacy predator interactions during a crossing remain in the
   metric-reach roadmap item rather than being silently retuned here.
4. Keep settling dependent on actual metric separation and actual escape
   distance travelled.
5. Clamp each escape increment to the smallest of available speed-distance,
   remaining segment length, and `escapeRemainingM`. When the distance budget
   reaches zero before alarm settlement, stop fleeing movement but remain
   alarmed until the existing time and separation settlement gates pass.
6. Cover interruption and retargeting, predation-triggered flight, blocked
   movement, save/load mid-segment, and deterministic update chunking.

Review gate: no dependent system observes a destination cell before the animal
physically reaches it.

## Task 4: Render exact travel and attach cues

Files:

- Modify `src/ui/map.ts`
- Modify `src/ui/render.ts`
- Modify `src/style.css`
- Modify `tests/wildlife-startle-ui.test.ts`
- Modify map rendering tests

1. Project an animal's exact metric position through the current map transform.
   Detailed zoom must not synthesize motion from `minute % 10`.
2. Give animal glyphs stable identity across position changes. Render moving
   detailed animals in a shared overlay if cell-local DOM ownership prevents
   continuity across a boundary.
3. Anchor a seen `!` and recoil to the same rendered subject position. Heard
   cues remain anonymous and use only their uncertain perceived source.
4. Keep coarse zoom cell-bucket rendering, but ensure adjacent-cell crossings
   happen only when the exact position crosses the corresponding boundary.
5. Test same-cell travel, boundary crossing, zoom changes, cue attachment,
   reduced motion, snow/weather stacking, and hidden-subject non-disclosure.

Review gate: rendered movement is a projection of saved simulation position,
not an independent cosmetic clock.

## Task 5: Natural seeded verification and balance report

Files:

- Modify `scripts/startle-shots.mjs`
- Modify `docs/natural-wildlife-playtest.md`
- Add refreshed screenshots under `docs/natural-wildlife-shots/`

1. Find and document at least three natural seeds: visible startle, heard-only
   startle, and visible non-startling ordinary travel.
2. In headless Chrome, record time-stamped positions across a full segment and
   assert monotonic metric progress with no node replacement at detailed zoom.
3. Capture screenshots at reaction, mid-travel, and after a cell boundary.
4. Run focused tests, full `npm test`, `npm run build`, and root staged lint.
5. Report gameplay effects: encounter readability, escape duration, hunting
   difficulty, CPU/render cost, determinism, save compatibility, and any
   remaining line-of-sight disappearance that is intentional rather than
   movement teleportation.
