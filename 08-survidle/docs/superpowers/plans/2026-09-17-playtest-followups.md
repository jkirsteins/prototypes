# Playtest follow-ups implementation plan

> For agentic workers: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make startup atomic, preserve known terrain at 300m, and eliminate measured redundant rendering and search work.

**Architecture:** Keep the existing map model and canvas boundaries. Fix knowledge classification with exact cheap reads at close rungs; keep unknown terrain generation deferred. Retain independent stamina and sleep models. Audit worker ownership before attempting shared memory.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas, browser CDP.

**Spec:** Approved designs in the accompanying conversation: loading through first complete render, exact 36-patch knowledge at 300m, transparent exact-position animals, compact selected-clock rates. Forest changes preserve concealment; performance changes require measured evidence.

## Global constraints

- 300m is the primary acceptance view.
- ASCII copy and explicit-path staging only.
- Commit and push independent changes promptly. Slow tests run at the end.
- No shared-memory migration without verified thread ownership and deployment compatibility.
- Do not claim Safari verification from Chromium results.

## Task 1: Atomic loading

Files: index.html, src/ui/loading.ts, src/main.ts, tests/loading.test.ts.

- [ ] Test initial HTML and real showLoading/hideLoading transitions, including failed initialization remaining covered.
- [ ] Run `npx vitest run tests/loading.test.ts` and observe failure.
- [ ] Start with a visible loading screen in initial HTML. Keep a root loading state until after render and updateEffects. Remove early hideLoading calls in boot; fresh runs reveal only after rendering when startup has completed.
- [ ] Verify focused tests and typecheck, commit and push.

## Task 2: Exact close-rung knowledge

Files: src/ui/map.ts, tests/close-zoom.test.ts.

- [ ] Exercise every patch position in a 6x6 block with only one known patch; require partial terrain rather than fog.
- [ ] Observe failure with `npx vitest run tests/close-zoom.test.ts -t 'every known patch'`.
- [ ] Use `const step = z <= 6 ? 1 : Math.max(1, Math.floor(z / 3));`. Preserve existing unknown and far-country behavior.
- [ ] Check no unknown terrain is generated, verify, commit and push.

## Task 3: Compact rates and wildlife presentation

Files: src/ui/rate.ts, src/ui/map.ts, tests/rate.test.ts, tests/wildlife-presentation.test.ts.

- [ ] Require selected real clock alone: `expect(formatRate(20, 'kg', 'real')).toBe('0.33 kg/s')`.
- [ ] Observe failure, return selected reading only, verify and commit.
- [ ] Cover transparent fine-position animal rendering using a recording canvas; remove only mark rectangles, keep glyphs and player-above-animal ordering.
- [ ] Verify, commit and push.

## Task 4: Forest and search

Files: src/sim/sight.ts, src/ui/dopanel.ts, tests/sight.test.ts, tests/search-budget.test.ts.

- [ ] Examine dense spruce fixtures and existing cover integration. Test seeing the closing trunks but not concealed wildlife behind them.
- [ ] Remove the zero-range spruce shortcut in favor of the existing cover-limited forest envelope, without weakening terrain or optical occlusion.
- [ ] Pre-filter exact concept searches by conceptsFor before constructing routed rows. Free-text searches must retain detail and legality matches; do not discard them based only on names.
- [ ] Verify focused regressions, compare work counts, commit and push.

## Task 5: Budgets, ownership and final validation

Files: tests/frame-budget.test.ts, src/ui/mapcanvas.ts, scripts/e2e.mjs, docs/testing.md.

- [ ] Audit latest wall-clock viewshed bounds and enforce static draw no-op across animation-only frames, with redraw on changed keys/DPR.
- [ ] Audit solved-world and fine-cache ownership; document actual duplication and safe next steps instead of speculative transfer.
- [ ] Push completed fixes, then run npm test, npm run test:slow and npm run build. Run real browser e2e and compare drawing costs at 300m.
- [ ] Report Safari verification separately if unavailable. Update plan with results and remaining work.

## Execution record

Tasks 1-4 implemented, tested and pushed in separate commits. Task 5's static draw budget and worker ownership audit are implemented; eager forecast allocation, old solved-seed caches and strong old-game search retention were fixed. Browser playthrough passed, then an additional keyboard-under-loading regression exposed a missing input guard; its fix is being verified. Final results and explicit unimplemented architecture work are recorded in `docs/performance-playtest-2026-09-17.md`.

Full fast rerun is running after repairing the pre-existing weather-projection test's cache assumptions. The full slow suite is running and has failures; selected UI/wildlife/delivery failures reproduce in an isolated worktree at the pulled baseline. Safari automation is blocked by unavailable Computer Use permissions. No integration-green or Safari-memory claim is made.
