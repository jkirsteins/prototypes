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

**The refactor spec's step 2, re-measuring the balance baseline against the
raid-spend commit, is deliberately skipped.** Stage 1 is judged by playing it.
The consequence is accepted explicitly: no claim of "this widened the skill
gap" can be made until somebody runs `npm run balance`, and the project's own
standard says prose did not work. If a later stage needs the number, that run
is its first task rather than a retrospective one.

**Open questions 1 to 4 in the refactor spec stay open.** Each blocks its own
stage, not the branch: what losing a duel costs and run-enders block stage 3,
marches in flight at a gauntlet boundary blocks stage 3, maximum march distance
blocks stage 2. Question 5, whether a vassal build follows, stays deferred; the
refactor spec adds no cards in this pass and the repo's card gate agrees.

---

## C. Stage 1: acting vassals

### What changes

- **`takeLand` seats a ruler on the captured faction.** `pickFaction` runs
  `vacateRulers` so only the acting seats hold a chair; a conquest fills the
  captured seat's chair. Symmetric, so a rival's conquest wakes their new
  vassal on the same terms as yours. This is the whole of "acting vassals":
  `takesNoTurn` already returns false the moment `hasRuler` is true, and
  `keeps-to-itself` is already stripped on capture, so no second gate is
  involved.
- **`aimsUpOwnChain` widens to the whole realm and is renamed for it.** A
  hostile card may not aim at any land under the actor's own root, in any
  direction: not up the chain, not sideways at a sibling vassal, not down at
  its own. The refactor spec names sibling raids as the likeliest source of "my
  ally did something insane", and reading as randomness is the complaint the
  whole exercise started from, so this ships WITH acting vassals rather than
  after them.
- **`MAX_AI_TURNS` (`src/main.ts:3344`) is derived rather than raised.** It is a
  stall guard sized for five acting seats. A legitimate round of fifteen would
  trip it, log `AI chain stalled - breaking`, and silently truncate the world's
  turn. It has to be a function of the seats that can act on the board as it
  stands, with headroom, or it becomes a hidden cap on how large a bloc the
  game will simulate.

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
