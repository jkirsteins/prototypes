# How to tackle the run-structure refactor

Status: **agreed 2026-08-15.** This is the plan of attack for
`~/Downloads/refactor-spec.md` (the run-structure design), not a restatement of
it. Read that document first: it holds the diagnosis, the evidence and the
design. This one holds only the decisions about HOW the work is sequenced,
branched and judged, plus a full spec for the first game stage.

Section A is a repo-level change and touches files outside `02-balticmap`
(`.github/workflows/pages.yml`, the repo `CLAUDE.md`). It is written up here
because it exists to serve this refactor and nothing else asked for it.

---

## A. Branch previews on GitHub Pages

**The requirement.** Every decision in the refactor is judged by feel rather
than by a test, so a branch has to be playable in a browser before it lands on
main. Today `.github/workflows/pages.yml` triggers on push to main and
`workflow_dispatch`, builds every `NN-*` directory, and publishes the assembled
`_site/` through `actions/upload-pages-artifact` and `actions/deploy-pages`.

**The decision: keep the artifact deploy, and build main plus one preview into
the same artifact.** The Pages source stays on `build_type: workflow`. Nothing
migrates to a `gh-pages` branch.

A preview run:

1. Checks out `origin/main` and builds the full site into `_site/` exactly as
   the workflow does today. Every `/prototypes/NN/` URL keeps serving main.
2. Checks out the dispatching ref and builds only the changed prototypes with
   `npm run build -- --base=/prototypes/preview/<slug>/NN/`, copying each into
   `_site/preview/<slug>/NN/`.
3. Uploads one artifact and deploys it. The preview URL is written to the job
   summary.

`<slug>` is the branch name lowercased with every character outside
`[a-z0-9-]` replaced by `-`.

**Trigger: push to any branch except main, plus `workflow_dispatch` as a manual
override.** The dispatch form takes an explicit `prototypes` input; the push
form derives it from `git diff --name-only origin/main...HEAD`, so a change to
one prototype never rebuilds the others and a docs-only push builds nothing at
all.

**The checkout must be `fetch-depth: 0`.** `actions/checkout@v4` fetches depth
1 by default, and a triple-dot diff needs the merge base, which a shallow
checkout does not have. A branch several commits behind main would otherwise
fail detection before anything was built. The run verifies a merge base exists
before diffing and fails loudly rather than silently previewing nothing.

### What follows from the single artifact, stated so nobody is surprised

- **One preview slot.** The most recent preview push across all branches is the
  one that is live. This repo regularly has several sessions working at once,
  so a preview can disappear because somebody else pushed.
- **A push to main wipes the live preview.** Main's run publishes main only,
  and the artifact is the entire site. The recovery is to push the preview
  branch again, which is why the trigger is a push rather than a manual
  dispatch.
- **The workflow used is the one on the branch.** A branch cut before this
  change lands cannot preview itself until it is rebased past the CI commit.

### Decisions inside section A

- **`base` stays hardcoded in every `vite.config.ts`.** The override is a
  `--base` flag at the CI call site, so no prototype config changes and the
  repo `CLAUDE.md` rule stays literally true. It gains one sentence saying CI
  may override it for a preview.
- **Godot prototypes cannot be previewed.** A preview run that detects a
  changed `NN-*` directory holding `project.godot` skips it with a warning
  rather than failing the run, so a Godot change still gets a green build and
  simply no preview URL.
- **The main tree is cached, keyed on main's SHA.** Required, not optional: a
  push-triggered preview that rebuilt seven prototypes including a Godot export
  on every commit would make the playtest loop unusable. On a cache miss the
  run builds all of main and saves it.
- **`concurrency: group: pages` is unchanged.** One artifact is one site, so
  serialising runs is correct. Per-branch concurrency keys would let two runs
  race for the same deployment.
- **`.github/pages-index.html` stays main's hand-maintained index.** No preview
  index is generated. The URL shape is documented instead.

### Verification

Push the branch, then confirm all three:

- `https://jkirsteins.github.io/prototypes/preview/<slug>/02/` loads and its
  assets resolve.
- `https://jkirsteins.github.io/prototypes/02/` still serves main.
- A second push to the same branch replaces the preview rather than
  accumulating.

---

## B. Branch shape

**Section A lands on its own branch and merges to main.** It is infrastructure,
it helps every prototype, and the game work cannot be previewed until it is on
main.

**Everything in the refactor's section 3 then lives on one long branch,**
`feature/run-structure`, cut from main after the CI change lands and merged
once, at the end. It is rebased onto main regularly, because other sessions
ship to main and the branch will be open for a while.

Stages, in the refactor spec's order:

1. Acting vassals, plus the sideways targeting block (section C below).
2. March travel time.
3. The gauntlet loop: target picker with visible rewards, duel scoping, the
   regional-leader status.

### Why the world tick is not a stage of its own

The refactor spec bundles acting vassals and the world tick as one experiment,
on the grounds that the tick is what makes many autonomous actors readable. The
tick is split here, and the reason has to be written down or the next reader
will think it was dropped by accident.

The world tick is two things, and only one of them is unbuilt. **Batched and
readable** is shipped: `stepAiChain` walks the AI seats a seat at a time and
`raiseRoundSummary` folds the whole batch into one modal, which is exactly "the
world takes one turn and the player is shown what happened". **Per-gauntlet
cadence** is the unbuilt half, and it cannot ship before the thing that defines
a gauntlet. Assigning the tick to stage 1 would mean building the gauntlet loop
in stage 1 and leaving stages 2 and 3 with nothing to do.

**The residual risk is real and is accepted.** Stage 1 judges acting vassals at
the CURRENT cadence, where the world acts between every player turn rather than
once per duel, so a bloc of fifteen seats is shown to the player far more often
than the run structure intends. If stage 1 reads as too noisy, the first
question is whether the noise is the vassals or the cadence, and the answer
must not be assumed. That is what the beats-per-round measurement in section C
is for: a count taken at the old cadence is the thing the new cadence can be
compared against once stage 3 exists.

**The refactor spec's step 2, re-measuring the balance baseline against the
raid-spend commit, is deliberately skipped.** Stage 1 is judged by playing it.
The consequence is accepted explicitly: no claim of "this widened the skill
gap" can be made until somebody runs `npm run balance`, and the project's own
standard says prose did not work. If a later stage needs the number, that run
is its first task rather than a retrospective one. What is NOT lost is the
measurement itself: main is a fixed commit, so the pre-refactor baseline can be
produced at any point by running the suite at that SHA. The cost of skipping is
convenience, not the ability to separate the raid-spend change from this work.

**Open questions 1 to 4 in the refactor spec stay open.** Each blocks its own
stage, not the branch: what losing a duel costs and run-enders block stage 3,
marches in flight at a gauntlet boundary blocks stage 3, maximum march distance
blocks stage 2. Question 5, whether a vassal build follows, stays deferred; the
refactor spec adds no cards in this pass and the repo's card gate agrees.

---

## C. Stage 1: acting vassals

### What changes

- **`takeLand` seats a ruler on the captured faction**, through a new
  `seatRuler` in `src/rulers.ts`. Symmetric, so a rival's conquest wakes their
  new vassal on the same terms as yours. The turn loop needs nothing else:
  `takesNoTurn` already returns false the moment `hasRuler` is true, and
  `keeps-to-itself` is already stripped on capture.

  **`replaceRuler` cannot be reused, and seating is not a one-liner.**
  `rulerOf` (`src/rulers.ts:131`) throws on a vacant seat, so the documented
  "only writer" is a SUCCESSION operation and this is a different one. Its
  doc comment and the `GameState.rulers` invariant both have to say so.
  `seatRuler` states all four fields itself: a name unique against every name
  in play (`rulerNameFor`, the same uniqueness set `replaceRuler` builds),
  `since` set to the turn of the conquest, leadership 0, and abilities from the
  faction's own `strategy` through `BUILD_ABILITIES`.

  **Abilities are the part that is a design decision rather than a detail.**
  `pickFaction` grants `BUILD_ABILITIES` AFTER `vacateRulers`
  (`src/game.ts:901-905`), so no quiet faction holds its build ability today
  and there is nothing to carry over. Granting it at seating means a woken
  warpath vassal raids with `war-leader`; withholding it means a vassal is
  strictly weaker than a seat that started the run acting. **The decision is to
  grant it**, because the alternative is a second class of ruler and this
  design's whole method is that a status is the only difference between a land
  that plays and one that does not.

  **And the grey middle is uniformly warpath.** `pestilent` is drawn only from
  the ACTING rivals (`src/game.ts:874-876`), so all 21 quiet factions were
  handed a `warpath` Player at deal time and never used it. Conquest therefore
  wakes warpath decks and nothing else, which makes the bloc more aggressive
  and more one-note than the refactor spec's aggro/value/combo triangle
  assumes. Left alone in stage 1, deliberately: it is a seeding change, it is
  measurable by playing, and fixing it before it is seen to be a problem would
  confound the read the same way waking the grey middle at seeding would.
  Capture tests cover both a warpath and a pestilence source faction so the
  behaviour is pinned either way.
- **`aimsUpOwnChain` widens SIDEWAYS only, and is renamed for it.** A hostile
  card may not aim at a land that is under the actor's own root realm but not
  under the actor: up the chain as today, and now at a sibling vassal. The
  refactor spec names sibling raids as the likeliest source of "my ally did
  something insane", and reading as randomness is the complaint the whole
  exercise started from, so this ships WITH acting vassals rather than after
  them.

  **Downward stays legal, deliberately.** A lord raiding its own vassal is
  vassal upkeep: it is how a vassal's defenses are held under the independence
  gate, and `tests/playability.test.ts` already pins it with that reason
  written down. Closing it would delete the mechanism this whole stage exists
  to put pressure on, which is the opposite of the intent. The predicate is
  therefore "inside my root's realm AND not inside mine", not "inside my
  root's realm".
- **`MAX_AI_TURNS` needs nothing.** Checked rather than assumed: it is 1000
  (`src/decisions.ts:39`), a stall guard deliberately set far above any real
  turn order, and a round of every faction on the map is 26. It is recorded
  here because "the seat cap will bite" is the obvious worry and the answer is
  that it does not.

- **Both doors that change allegiance seat the ruler**, not just the arriving
  one. `takeLand` (`src/game.ts:1186`, an army arriving) and `landSubjugation`
  (`src/game.ts:2268`, a card resolving on the table) already both call
  `stripOnCapture`, and the seating belongs beside it in each. `beginTurn`
  currently reads `state.rulers` without threading a local copy, so it gains
  one and returns it, the way the play path already does.

### What deliberately does not change

- **Seeding.** The refactor spec allows that leaderlessness "may still be rolled
  at seeding, but is no longer guaranteed for non-acting lands". That is a much
  bigger swing than letting conquest wake a land, it would confound the read on
  this stage, and the grey middle is a designed feature rather than an
  accident. It is a separate experiment if the stage argues for one.
- **Presentation.** `involvesLocalSeats` is untouched. Whether fifteen acting
  seats make the turn-start replay too long is a measurement, not an
  assumption, and the existing audience gate already filters most of a stranger
  bloc's business out. What is recorded while playing is beats per round and
  wall-clock replay length at roughly turn 10 and turn 30, so that if a quieter
  treatment for your own bloc is needed there is a number behind it. The option
  on the table, should it be needed, is an arm in `involvesLocalSeats` giving a
  seat inside your own realm its log line and its badge walk but no camera
  glide and no label.
- **Cards, and therefore the wire hash.** No `CardDef` changes, no new
  `POLICY_COVERAGE` entry, no discovery route to add.

### What to watch for while playing

Stated in advance so the playtest can falsify them:

- Vassals actually going for independence. The refactor spec predicts the
  dormant AI branch at `src/ai.ts:474` wakes up and vassalage becomes the
  game's central tension.
- Your own bloc starting wars you did not pick, which the spec wants as a cost
  of expansion arriving free.
- Replay length per round, per the measurement above.
- Any surviving case of an ally doing something that reads as insane, now that
  same-realm aggression is closed.

### Gate

`npm test` and `npm run build` green, and a browser pass on the branch preview
from section A.
