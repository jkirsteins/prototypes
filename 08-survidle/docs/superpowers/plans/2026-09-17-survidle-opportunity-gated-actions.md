# Opportunity-gated actions implementation plan

> For agentic workers: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** A Do row appears when the opportunity that names it is discovered, taking day 1 from 84 rows to about 18, without ever walking a dependency graph at runtime.

**Architecture:** A `REVEAL` table in `src/ui/purpose.ts` maps each row key to one `OpportunityKey`. The runtime gate is `isOpportunityDiscovered(state.opportunities, key)`, two object lookups, applied at the three sites that walk the candidate set. The transitive dependency walk that proves the table is honest lives in a test-only module and never ships.

**Tech Stack:** TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-survidle-opportunity-gated-actions-design.md`

## Global constraints

- **No runtime graph walking.** The resolver is test-only. Runtime is `REVEAL[key]` plus `isOpportunityDiscovered`. No new per-tick or per-draw work. This is the user's explicit constraint.
- **No new GameState field and no save migration.** `OpportunityState.discoveredAt` (`types.ts:969`) already exists, is JSON-safe and is persisted. `serialize` is a whole-state spread, so nothing there changes.
- Gate all three call sites in lockstep: `paneRows` (`dopanel.ts:639`), `searchRows` (`dopanel.ts:578`) and `purposeCounts` (`dopanel.ts:652`). Gating two of three makes the left pane's counts disagree with the rows drawn.
- The gate sees only `{ id, arg }`, which is what `intentGroups` yields. `rowKey(id, arg)` is the lookup key.
- Never fold a revealed row behind a "more (N)". The `docs/ux.md` ban on that survives this pass; only the starting set changes.
- ASCII only. Stage with explicit paths, never `git add -A`; sibling sessions share this branch.
- `npm test` and `npm run build` must pass before each commit. Slow suite is not run.

## Task 1: The test-only resolver, and measure the gap

No behaviour change. This task exists to replace two estimates with counts before any content is authored.

Files: create `tests/reveal-graph.ts` (helper, not a `.test.ts`), create `tests/reveal.test.ts`.

- [ ] In `tests/reveal-graph.ts`, build `producerOf: Map<ItemId, TaskId[]>` by calling `yieldItem(task, arg)` (`src/sim/intent.ts:88`) over every `TaskId` and every craft `arg` in `RECIPE_IDS`. Supplement the animal materials it cannot cover: `hide`, `sinew`, `bone`, `fur` and `crackedBone` all produced by `hunt`.
- [ ] In the same file, `requirementsOf(rowKey)`: for `craft:<r>` read `RECIPES[r].needs` and `RECIPES[r].tool`; for `build:<s>` read `STRUCTURES[s].needs`; for a mend row read the mend table. Return `{ items: ItemId[], tools: ItemId[] }`.
- [ ] In `tests/reveal.test.ts`, write a test named `reports the opportunity gap` that walks every row from `intentGroups` over a universe of regions (copy the universe construction from `tests/purpose.test.ts`), and for each row records whether `REVEAL` names a key, and whether that key is in `DAY_ONE_CAPABILITY_KEYS` or is seeded by `newOpportunities`. Have it `console.log` the three lists and assert nothing yet.
- [ ] Run `npx vitest run tests/reveal.test.ts` and record: rows with no opportunity, rows keyed to a minute-0 opportunity, rows keyed to a genuinely progressive one.
- [ ] Commit the helper and the reporting test with the measured numbers in the commit message.

## Task 2: Make the 15 day-one capabilities progressive

The blocker this plan was rewritten around. `DAY_ONE_CAPABILITY_KEYS` (`opportunity-catalog.ts:141`) discovers all 10 tool recipes and all 5 shelters at minute 0, so gating on them would change nothing.

Files: modify `src/sim/opportunity-catalog.ts`, modify `src/sim/opportunities.ts` if a new event kind is needed, create `tests/opportunity-progression.test.ts`.

- [ ] Write a failing test asserting that on a fresh `newGame`, `make:knife`, `make:bow`, `make:needle` and `build:cabin` are **not** discovered, while `build:leanTo` and `make:fireDrill` are.
- [ ] Run it, observe failure.
- [ ] Reduce `DAY_ONE_CAPABILITY_KEYS` to the genuine day-one set: `make:fireDrill` and `build:leanTo` and `build:boughBed`. These need no tool the survivor lacks and are the first night's work.
- [ ] Move the other twelve into `discoverAvailableOpportunities`, beside forage and traps, exactly as the comment at `opportunity-catalog.ts:134` directs. Conditions, each a one-line predicate over `state`/`world`:
  - `make:knife`, `make:whetstone` when stone is held or an outcrop is known
  - `make:barkBucket` when bark is held
  - `make:flakedAxe`, `make:fishingSpear` when a knife is held
  - `make:needle` when a bone is held
  - `make:waterskin` when hide is held
  - `make:bow` when a huntable species has been seen
  - `make:stoneAxe` when a whetstone is held
  - `build:turfHut`, `build:snowShelter` when a camp exists
  - `build:cabin` when a camp exists and Building is at least 5
- [ ] Update the comment at `opportunity-catalog.ts:134` so it describes the new arrangement rather than the old one.
- [ ] Run the test, observe pass. Run `npm test` in full: `tests/opportunity-save.test.ts` and `tests/opportunity-catalog-ui.test.ts` are the likely breakages.
- [ ] Commit.

## Task 3: Opportunities for the rows that have none

Task 1 prints the list. `SUPPORTED_TOOL_RECIPES` covers 10 of ~22 recipes, so `cordage`, `torch`, `arrows`, `snare`, `basketTrap`, `wedges` and the six clothing recipes are the expected gap.

Files: modify `src/sim/opportunity-catalog.ts`, modify `tests/reveal.test.ts`.

- [ ] Extend `SUPPORTED_TOOL_RECIPES` to cover every recipe a Do row can draw, so each gets a `make:<tool>` def from the existing generator at `opportunity-catalog.ts:84`. Where a recipe's output is not a `ToolId`, add the def explicitly rather than forcing it through `TOOL_RECIPE`.
- [ ] Give each new key a discovery condition in `discoverAvailableOpportunities`, following Task 2's shape: clothing recipes on hide held, `craft:cordage` and `craft:torch` on bark held, `craft:arrows`/`craft:snare`/`craft:basketTrap` on a knife held.
- [ ] Re-run Task 1's reporting test. The "no opportunity" list must be empty.
- [ ] Commit.

## Task 4: The REVEAL table and the four rules

Files: modify `src/ui/purpose.ts`, modify `tests/reveal.test.ts`.

- [ ] In `src/ui/purpose.ts` add `const REVEAL: Record<string, OpportunityKey>` and `export function revealOf(id: TaskId, arg?: string): OpportunityKey | null`, mirroring `home()` including its `mend` special case.
- [ ] Turn Task 1's reporting test into four real tests: **coverage** (every row names exactly one key), **reachability** (every named key is discoverable from the day-one set), **no locked doors** (every requirement resolves, transitively, to a row revealed by the same key or an earlier one; season and place are exempt; a skill-level block requires at least one revealed row training that skill), **runtime purity** (`src/ui/dopanel.ts` and `src/ui/render.ts` do not import `tests/reveal-graph.ts` or traverse `RECIPES`/`STRUCTURES`).
- [ ] Run them, observe failure. Author `REVEAL` until green.
- [ ] Commit.

## Task 5: Gate the Do pane

Files: modify `src/ui/dopanel.ts`, modify `docs/ux.md`, create `tests/reveal-gate.test.ts`.

- [ ] Write a failing test: on a fresh `newGame`, `paneRows` for `Make` returns zero rows, and the whole Do panel across all subtabs draws fewer than 25 rows.
- [ ] Run it, observe failure.
- [ ] Add one predicate in `dopanel.ts`: `const revealed = (id, arg) => { const key = revealOf(id, arg); return key === null || isOpportunityDiscovered(state.opportunities, key); }`, and apply it in `paneRows`, `searchRows` and `purposeCounts`.
- [ ] Rewrite the `docs/ux.md` section "The Do pane is subtabs and purposes, and hides nothing" with the replacement text quoted in spec section 2. Keep the ban on folding.
- [ ] Run the test and `npm test`. `tests/purpose.test.ts` and `tests/dopanel.test.ts` are the likely breakages; a purpose test that walks every row must walk the unrevealed ones too, so it should call the ungated path.
- [ ] Commit.

## Task 6: The opportunity card becomes a door

Files: modify `src/ui/opportunity-panel.ts`, modify `src/main.ts`, modify `tests/opportunity-panel.test.ts`.

- [ ] Write a failing test: clicking the current-opportunity card sets `ui.panes` to the subtab and purpose of the row its opportunity reveals.
- [ ] Run it, observe failure.
- [ ] Add `data-act="opportunity-goto"` to the card in `opportunity-panel.ts`, carrying the row key the opportunity reveals (invert `REVEAL` once at module load into `Map<OpportunityKey, string>`; this is static data, not a per-draw walk).
- [ ] Handle it in `main.ts` beside the other `opportunity-` cases: set `ui.panes` via `toSubtab`, then set the purpose, then `savePanes`.
- [ ] Resolve the inert `[ ]` glyph: the checklist in `opportunityChecklistHtml` renders `[x]`/`[ ]` as a status, so give it `aria-hidden` and a non-checkbox appearance rather than making it clickable.
- [ ] Run tests. Commit.

## Task 7: Default pane and the clear control

Files: modify `src/ui/panes.ts`, modify `src/main.ts`, modify `tests/panes.test.ts`.

- [ ] Write a failing test: `defaultPanes(state)` on a fresh game returns the subtab and purpose of the current opportunity's row, not `Gather`/`Woodcutting`.
- [ ] Run it, observe failure.
- [ ] Change `defaultPanes()` to take an optional current-opportunity row key and derive subtab and purpose from it, falling back to `Gather`/`PURPOSES.Gather[0]` when there is none. Update `loadPanes` to use it as the fallback.
- [ ] Add a `clear` button beside the filter box in `index.html`, `data-act="do-clear"`, handled in `main.ts` to reset filter text and panes together.
- [ ] Run tests. Commit.

## Task 8: Need chips

Files: modify `src/ui/dopanel.ts`, modify `src/style.css`, modify `tests/dopanel.test.ts`.

- [ ] Write a failing test: the chip row renders only concepts carried by at least one revealed row, and clicking one sets `ui.filter` to `kw:<concept>`.
- [ ] Run it, observe failure.
- [ ] Render the chips above the subtab strip from `conceptNames()`, each `data-act="do-chip" data-concept="<name>"`, filtered to concepts with a revealed row. Reuse the existing `kw:` filter path in `main.ts:808-815`; no new filtering logic.
- [ ] Style the chip row to match the existing `.kw` tags.
- [ ] Run tests, `npm run build`. Commit.

## Task 9: Verify in the browser and push

- [ ] Run `npm test` and `npm run build`. Both green.
- [ ] Load the game in Chrome at 1440x900 on `?seed=17`. Land, Begin, dismiss the notice. Count the rows the Do panel draws across all six subtabs. Record the number against the 84 measured before this pass.
- [ ] Confirm by eye: the opportunity card jumps to `Make camp here`; the chip row appears; `clear` returns to the current opportunity's row.
- [ ] Push the branch.

## Deliberately not done

- **The catalogue does not pause.** Spec section 7 asks for it, but `render.ts:159` carries a deliberate comment, "Catalog browsing is live; the presentation surfaces hold the world clock." Pausing on a browse surface invites pause-scumming in an idle game. Left as it is, flagged to the user rather than overridden silently.
- The tab-strip merge (spec section 8), the Skills panel, the map's `50vh`, the idle strip's tone. All separate passes.
