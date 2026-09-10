# Spatial Weather and Ray-Attenuated Sight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic moving local weather, persistent regional ground conditions and ray-attenuated circular sight.

**Architecture:** Pure seeded atmospheric fields supply all consumers. Persistent region records integrate ground consequences hourly. Sight accumulates optical extinction through each 300 m segment and retains terrain occlusion.

**Tech Stack:** TypeScript, Vite, Vitest, SVG and CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-local-weather-design.md`

## Global Constraints

- Use ASCII punctuation only and never use em dashes.
- Weather at neighboring 300 m cells must be continuous and belong to coherent features.
- Broad fields use a 12 km lattice; subordinate detail uses 1.2 km and is gated by the broad system.
- Atmospheric state moves; ground state remains local and persistent.
- Simulation and rendering consume the same samples.
- Do not consume or shift the gameplay RNG.
- Preserve mapped terrain while applying current visibility to wildlife and new mapping.
- Stage only explicit `08-survidle` paths; never use `git add -A`.

---

### Task 1: Deterministic atmospheric fields

**Files:** Create `src/sim/climate.ts`; create `tests/climate.test.ts`; modify `src/sim/types.ts` only for shared types.

**Interfaces:** Produce `AtmosphereSample` and `sampleAtmosphere(weather, world, minute, x, y)` plus pure extinction helpers.

- [ ] Write failing tests for determinism, adjacent continuity, distant variation, 20-minute advection, parent-gated local precipitation, windward/lee response and MOR calibration.
- [ ] Run `npx vitest run tests/climate.test.ts` and confirm the missing interface failure.
- [ ] Implement seeded broad and subordinate fields, terrain modifiers, precipitation, fog, blowing snow and additive extinction.
- [ ] Run the focused test and `npm run typecheck`.
- [ ] Commit the atmospheric foundation.

### Task 2: Persistent local ground and save migration

**Files:** Modify `src/sim/weather.ts`, `src/sim/types.ts`, `src/sim/newgame.ts`, `src/sim/save.ts`, `src/sim/advance.ts` and affected weather consumers; modify weather, save, fire, seep, ice and snow tests.

**Interfaces:** Produce `LocalGroundWeather`, `WeatherWorld`, `groundAt`, `conditionsAt` and hourly catch-up.

- [ ] Write failing tests for local rain and snow, persistence after passage, settlement, melt, puddling, infiltration, evaporation, frost, ice, drought and dormant catch-up equivalence.
- [ ] Run the focused tests and confirm behavior failures.
- [ ] Implement region ground records and replace global weather reads with cell-aware conditions.
- [ ] Migrate old saves without touching gameplay RNG and preserve existing local ground values in materialized regions.
- [ ] Run affected tests and typecheck, then commit.

### Task 3: Circular ray attenuation

**Files:** Modify `src/sim/sight.ts` and `tests/sight.test.ts`; update exploration or wildlife tests only where behavior changes intentionally.

**Interfaces:** Consume `sampleAtmosphere` and extinction; preserve `sightRangeCells`, `sightReachCells` and `visibleCells` public signatures.

- [ ] Write failing tests for equal cardinal and diagonal range, uniform MOR, attenuation through a local band, no contrast recovery after leaving it, combined obscurants, canopy and remembered terrain.
- [ ] Run the sight tests and confirm expected failures.
- [ ] Add midpoint sampling, accumulated optical depth and Euclidean cutoff with per-call cell sampling memoization.
- [ ] Run sight, exploration and wildlife tests plus typecheck, then commit.

### Task 4: Unified weather presentation

**Files:** Modify `src/ui/map.ts`, `src/ui/sky.ts`, `src/ui/panels.ts`, `src/style.css` and their focused tests.

**Interfaces:** Consume the same `conditionsAt` samples as gameplay. Produce no second visual weather generator.

- [ ] Write failing UI tests for local weather text, coordinate-matched map classes and variables, simulated wind motion, unknown-ground atmosphere and reduced motion.
- [ ] Run focused UI and sky tests and confirm failures.
- [ ] Render one atmospheric sample per glyph, the player sample in the sky and local ground per glyph; use CSS only to amplify opacity.
- [ ] Add minute and local-condition inputs to render keys so approaching weather redraws without frame churn.
- [ ] Run focused tests and typecheck, then commit.

### Task 5: Calibration, documentation and complete verification

**Files:** Create `scripts/weather-profile.ts`; modify `docs/README.md` and package scripts if needed.

- [ ] Add deterministic profiling for 10,000 samples, worst-case fell sight, map-sized sampling and 100 active ground regions.
- [ ] Document scales, equations, persistence, save migration and deliberate simplifications.
- [ ] Run the profiler and record results without a flaky timing assertion.
- [ ] Run `npm test -- --maxWorkers=1 --minWorkers=1`, `npm run build`, root lint, horizon and year probes.
- [ ] Browser-playtest moving rain, snow over existing snow, valley fog, windward/lee weather and an obscured sight ray.
- [ ] Commit explicit prototype paths.
