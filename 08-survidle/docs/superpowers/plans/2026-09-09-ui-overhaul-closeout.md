# UI Overhaul Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the UI overhaul with predictable recovery and map rendering, merge it to main, and measure the resulting simulation health.

**Architecture:** Keep collapse recovery as one simulation invariant consumed by needs, scheduling, and UI. Keep map cells fixed in the grid and animate only paint. Verify the complete branch before a local merge, then run the slow and simulation probes on main and record current readings in the roadmap.

**Tech Stack:** TypeScript, Vite, Vitest, Biome, headless Chrome, Git.

**Spec:** `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`

## Global Constraints

- Keep output and source additions ASCII-only unless existing game content requires named-language characters.
- Stage only explicit `08-survidle` paths.
- Do not bypass hooks.
- Run fast tests, slow tests, build, lint, headless Chrome, reference, horizon, year, and December probes.

---

### Task 1: Recovery and map-cell invariants

**Files:**
- Modify: `src/sim/sleep.ts`
- Modify: `src/sim/body.ts`
- Modify: `src/ui/bars.ts`
- Modify: `src/ui/panels.ts`
- Modify: `src/style.css`
- Test: `tests/needs.test.ts`
- Test: `tests/walkorders.test.ts`
- Test: `tests/mood.test.ts`

**Interfaces:**
- Produces: `collapseRecoveryPending(energy, sleeping): boolean`
- Produces: `workResumeAt(state): number | null`
- Consumes: `sleeping.collapsed` as the persistent recovery latch.

- [x] **Step 1: Write failing tests for full collapse recovery, truthful Energy display, and fixed map cells.**
- [x] **Step 2: Run the focused tests and observe failures at the old 55-point release and positional map animation.**
- [x] **Step 3: Implement the shared recovery predicate and paint-only map animation.**
- [x] **Step 4: Run focused tests and the production build.**

### Task 2: Complexity and branch verification

**Files:**
- Modify only files already changed by the UI overhaul when simplification is behavior-preserving.

**Interfaces:**
- Consumes: all changed UI, scheduler, exploration, speed-history, and recovery code.
- Produces: a reviewed branch with no duplicated decision rules found in the changed diff.

- [x] **Step 1: Inspect the complete branch diff for duplicated predicates, nested decisions, and stale comments.**
- [x] **Step 2: Apply behavior-preserving simplifications and run focused tests after each affected subsystem.**
- [x] **Step 3: Run `npm test`, `npm run test:slow`, `npm run build`, and root Biome lint.**
- [x] **Step 4: Load the production UI in headless Chrome and inspect the screenshot and DOM for render errors.**
- [ ] **Step 5: Request an independent code review and resolve all critical or important findings.**

### Task 3: Commit and merge

**Files:**
- Commit: explicit changed paths under `08-survidle`.

**Interfaces:**
- Consumes: verified worktree branch `worktree-survidle-ui-overhaul`.
- Produces: a local merge into `main` with hooks and merged-tree checks passing.

- [ ] **Step 1: Stage explicit project files and commit without bypassing hooks.**
- [ ] **Step 2: Merge `worktree-survidle-ui-overhaul` into `main` from the main checkout.**
- [ ] **Step 3: Run fast tests, slow tests, build, and lint on the merged tree.**

### Task 4: Post-merge simulation health

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`

**Interfaces:**
- Consumes: output from `reference`, `horizon`, `year`, and `december` scripts on merged main.
- Produces: dated roadmap readings and a concise health assessment.

- [ ] **Step 1: Run `npm run reference` and record all gate summaries.**
- [ ] **Step 2: Run `npm run horizon` and record every out-of-band stage.**
- [ ] **Step 3: Run `npm run year`, its winter variant, and `npm run december`; record all gate summaries and seasonal anomalies.**
- [ ] **Step 4: Update the roadmap with the exact 2026-09-09 readings, regressions, and next actions without changing balance merely to make a gate green.**
- [ ] **Step 5: Commit the roadmap update on main with hooks enabled and report the judgment calls made.**
