# Live UI Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show recent game-speed changes and make map lighting visually uniform across real and synthetic unexplored cells.

**Architecture:** Keep a 60-second UI-only sample buffer and update one SVG directly. Apply night/weather shading at the viewport layer so it covers both generated cells and synthetic padding.

**Tech Stack:** TypeScript, SVG, CSS, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-fieldwork-and-gear-design.md`

## Global Constraints

- History is not saved and resets on reload/new world.
- Weather text remains legible over the graph.
- Viewport shading must not reveal world bounds.

---

## File Map

- Add `src/ui/speed-history.ts`: sampling and SVG geometry.
- Modify `src/ui/render.ts`, `src/ui/panels.ts`, `src/main.ts`: UI state, stable weather SVG, direct updates.
- Modify `src/ui/map.ts` and `src/style.css`: uniform full-viewport shading.
- Modify focused tests under `src/**/*.test.ts`.

### Task 1: Speed history

- [ ] Add tests for 60-second retention and 1x/6x vertical mapping.
- [ ] Add a bounded sample buffer at a modest cadence.
- [ ] Render a stable stepped SVG area behind the weather footer and update only its path/live point.
- [ ] Fade old samples and honor reduced motion.

### Task 2: Uniform map shading

- [ ] Add a regression assertion that lighting belongs to the viewport layer, not only real cells.
- [ ] Put synthetic unexplored cells and generated cells beneath the same night/weather sheet.
- [ ] Keep markers, fire light, tooltips, and map controls above the sheet and interactive.
- [ ] Confirm no rectangular world boundary appears at night or in rain.

### Task 3: Verification

- [ ] Run focused speed-history, weather, map, and CSS tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

