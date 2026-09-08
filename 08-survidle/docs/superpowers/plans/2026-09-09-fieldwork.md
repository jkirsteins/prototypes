# Fieldwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact frontier movement and useful, real-action region surveying available from the normal UI.

**Architecture:** Keep known routing strict, add one frontier-route helper, and let the existing explore task orchestrate normal walking plus normal Read water work without extra queue rows.

**Tech Stack:** TypeScript, Vite, Vitest, DOM HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-fieldwork-and-gear-design.md`

## Global Constraints

- Preserve exact-cell manual movement.
- Never route through more than one unknown cell.
- Survey sub-actions use existing movement, legality, timing, skill, mastery, logging, and completion rules.
- Exploration remains manual one-time work, never a standing order.

---

## File Map

- Modify `src/sim/routing.ts`: frontier route.
- Modify `src/sim/types.ts`: serializable survey phase state.
- Modify `src/sim/tasks.ts`: survey planner and real Read water phase.
- Modify `src/ui/purpose.ts`: Explore/Wayfinding navigation.
- Modify `src/ui/dopanel.ts`: survey action rows.
- Modify `src/ui/panels.ts` and `src/ui/tip.ts`: informative-only map tips and survey phase wording.
- Modify `src/main.ts`: exact known/frontier map activation.
- Modify focused tests under `src/**/*.test.ts`.

### Task 1: Frontier routing and exact map activation

- [ ] Add tests proving known targets stay exact, reachable frontier targets use one unknown final step, and deeper unknown targets do not move.
- [ ] Add `frontierRoute` beside `survivorRoute`; validate the target is passable, unknown, and adjacent to a known cell reachable by `survivorRoute`.
- [ ] Update map click handling to use exact known routing first and frontier routing second. Keep touch inspect-first semantics.
- [ ] Verify crossing a region boundary still calls the normal region/sight machinery.

### Task 2: Explore/Wayfinding UI

- [ ] Add `Explore` and `Wayfinding` to the Do navigation model.
- [ ] List `Survey <region>` for current or adjacent incomplete regions with reachable work.
- [ ] List `Search for a way home` only when camp has no known route.
- [ ] Remove action controls from hover tips and retain facts only.
- [ ] Assert exploration tasks remain in `NOT_ORDERS`.

### Task 3: Survey orchestration

- [ ] Extend the serialized task with a small survey phase record containing target region, visited vantages, handled water representatives, active shore, and phase.
- [ ] Extract shared work advancement/completion so both the top-level Read water task and an explore-owned Read water phase execute the same code path.
- [ ] Group water by connected water cells and choose one reachable shore representative per system.
- [ ] Alternate real route walking, real Read water work, and vantage selection until no useful work remains.
- [ ] Skip currently unreadable water without deadlocking and leave it available for later work.
- [ ] Ensure walking trains Wayfinding while Read water trains Fishing and read mastery, with no double credit.
- [ ] Expose concise gerunds for walking, reading water, and surveying.

### Task 4: Verification

- [ ] Run focused routing, task, Do panel, and map interaction tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

