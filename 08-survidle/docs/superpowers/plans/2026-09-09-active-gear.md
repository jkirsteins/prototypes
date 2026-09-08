# Active Gear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make finite equipped gear visible and controllable, beginning with a partly burned torch.

**Architecture:** Keep unused torches in count inventory and the active torch on the player. Share one active-equipment view model between Gear and the compact map inventory overlay.

**Tech Stack:** TypeScript, Vite, Vitest, DOM HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-fieldwork-and-gear-design.md`

## Global Constraints

- An equipped torch always contributes 0.4 kg, lit or out.
- Putting it out is immediate; relighting uses the existing one-minute fire or ten-minute drill path and consumes no new torch.
- Gear appears once, in the pane after Inventory.

---

## File Map

- Modify `src/sim/inventory.ts` and load consumers: active torch weight.
- Modify `src/sim/tasks.ts`, `src/sim/player.ts`, `src/sim/items.ts`: put out, relight, and expiry behavior.
- Add `src/ui/equipment.ts`: shared active-equipment presentation model.
- Modify `src/ui/panes.ts`, `src/ui/panels.ts`, `src/ui/tip.ts`, `src/main.ts`, `index.html`, `src/style.css`: Gear pane, controls, and compact map row.
- Modify focused tests under `src/**/*.test.ts`.

### Task 1: Torch lifecycle and load

- [ ] Add tests for fresh lighting, immediate put-out, relight at fire, relight by drill, fuel preservation, expiry, and 0.4 kg load in both states.
- [ ] Add a carried-load helper that includes active equipment and replace pack-only capacity calculations.
- [ ] Let `lightTorch` distinguish a fresh torch from an out equipped torch, preserving fuel on relight.
- [ ] Add an immediate put-out action and remove the active torch when fuel reaches zero.

### Task 2: Shared equipment view model

- [ ] Define generic active-equipment rows with label, state, remaining/maximum capacity, and available control.
- [ ] Render the full row in Gear and only timed/capacity equipment in the compact map overlay.
- [ ] Wire put-out and relight controls through existing delegated action handling.

### Task 3: Gear pane

- [ ] Add `gear` after `pack` in pane IDs and labels.
- [ ] Move Worn and Tools markup from the sidebar into the Gear pane.
- [ ] Preserve pane preference migration and remove the duplicate sidebar section.
- [ ] Add layout styling for active equipment, clothing, and tools.

### Task 4: Verification

- [ ] Run focused torch, inventory, pane, and panel tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

