# Survidle Hunting Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nearest-cell instant-loot hunting with skill-bounded ground choice, persistent carcasses, real recovery work, local avoidance and runway-driven automation.

**Architecture:** `hunting.ts` owns knowledge estimates, carcasses and pressure. `intent.ts` asks it for the best generic target. `tasks.ts` changes a successful hunt into an internal field-processing phase and produces only recovered yields. Reference and evaluation modules consume the same public rules.

**Tech Stack:** TypeScript, Vitest, Vite

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-hunting-economy-design.md`

## Global Constraints

- Preserve explicit species and explicit-cell commands.
- Autonomous target selection may not read exact hidden populations.
- A kill is not inventory until field processing finishes.
- Large-game pressure is local avoidance, not artificial extermination.
- Deferred tuning must be recorded in `docs/roadmap-additions.md`.

---

### Task 1: Skill-bounded ground choice

**Files:**
- Create: `src/sim/hunting.ts`
- Modify: `src/sim/intent.ts`, `src/sim/types.ts`, `src/sim/wildlife-agents.ts`, `src/sim/save.ts`
- Test: `tests/hunting.test.ts`, `tests/intent.test.ts`, `tests/animal-agents.test.ts`

**Interfaces:**
- Produces: `bestHuntCell(state, world, cal): number`, `noteHuntSign(...)`, `huntEstimate(...)`

- [x] Write tests proving low skill favors nearby plausible ground, high skill favors better known return, signs persist, and explicit targets remain exact.
- [x] Run the focused tests and verify they fail for the missing knowledge selector.
- [x] Add hunting-sign state and save migration.
- [x] Implement estimates from mapped terrain, general habitat knowledge, signs, pressure, travel and skill without hidden roster or population reads.
- [x] Run the focused tests until green and remove obsolete nearest-only assertions.

### Task 2: Carcass and field-processing pipeline

**Files:**
- Modify: `src/sim/hunting.ts`, `src/sim/types.ts`, `src/sim/tasks.ts`, `src/sim/advance.ts`, `src/sim/save.ts`, `src/sim/intent.ts`
- Test: `tests/hunting.test.ts`, `tests/tasks.test.ts`, `tests/save.test.ts`

**Interfaces:**
- Produces: `Carcass`, `createCarcass(...)`, `stepCarcasses(...)`, `recoverCarcass(...)`

- [x] Write tests proving a kill creates no inventory, processing takes time, stopping preserves it, recovery scales with skill, and completion produces only the recovered share.
- [x] Run the focused tests and verify the new expectations fail.
- [x] Add carcass state, migration and the hunt task's processing phase.
- [x] Age carcasses each minute and apply warm spoilage/scavenging.
- [x] Finish recovery into the existing pile/pack and delivery machinery.
- [x] Run focused tests until green.

### Task 3: Local pressure

**Files:**
- Modify: `src/sim/hunting.ts`, `src/sim/tasks.ts`, `src/sim/animals.ts`, `src/sim/save.ts`
- Test: `tests/hunting.test.ts`

**Interfaces:**
- Produces: `huntPressureFactor(...)`, `disturbHuntingGround(...)`, `decayHuntingPressure(...)`

- [x] Write tests for attempt pressure, larger kill pressure, reduced local odds and daily recovery.
- [x] Run them red.
- [x] Implement one shared pressure model used by target estimates and actual odds.
- [x] Run them green.

### Task 4: Runway-driven reference strategy

**Files:**
- Modify: `src/sim/reference.ts`
- Test: `tests/list.test.ts`, `tests/reference.test.ts`

**Interfaces:**
- Produces: `survivalDebt(...)`, stock-aware hunt orders without species forever grinds.

- [x] Write tests proving the reference list contains no unrestricted large-game grinds and food debt outranks excess winter fuel work.
- [x] Run them red.
- [x] Replace the three forever hunts with one food runway objective ahead of future winter reserves.
- [x] Run focused reference tests green.

### Task 5: Honest evaluators

**Files:**
- Modify: `src/sim/horizon.ts`, `scripts/reference.ts`, `scripts/year.ts`, evaluation tests
- Test: `tests/horizon.test.ts`, `tests/reference.test.ts`, `tests/year.test.ts`

**Interfaces:**
- Produces: explicit horizon fixtures, paired lineage comparison, exposure-qualified deep-cold reports, paired source probes.

- [ ] Write failing tests for each invalid metric.
- [ ] Replace transformed horizon orders with explicit stage fixtures and extend its cap beyond 60 days.
- [ ] Replace raw lineage lifespan monotonicity with matched inherited-versus-fresh comparisons.
- [ ] Report deep cold only from qualifying exposure samples.
- [ ] Add paired constrained food-source deltas.
- [ ] Run focused evaluator tests green.

### Task 6: Verification and roadmap

**Files:**
- Modify: `docs/roadmap-additions.md`

- [x] Record deferred evaluator repair, final ecology, skill-curve, cold and secondary-food tuning with prerequisites.
- [ ] Run `npm test`, `npm run build`, `npm run reference`, `npm run horizon`, `npm run year`, and winter/source probes.
- [ ] Compare large-game output, late-August survival and evaluator validity against the pre-change evidence.
- [ ] Run the root lint gate and review the complete diff.

### Task 7: Hunting goal guidance

**Files:**
- Modify: `src/sim/goals.ts`, `src/sim/types.ts`, `src/sim/hunting.ts`, `src/sim/tasks.ts`, `src/sim/intent.ts`
- Test: `tests/goals.test.ts`, `tests/goals-deeds.test.ts`

- [x] Add a goal completed by finding real fresh animal sign.
- [x] Add a goal completed only when recovered carcass meat reaches camp.
- [x] Keep preservation represented by the existing storage goal.
