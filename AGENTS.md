# Prototypes repo

A collection of independent web prototypes, one per top-level directory named
`NN-name` (`01-escapecastle`, `02-balticmap`, `03-hostages`). Each is a
self-contained Vite + TypeScript project with its own `package.json`, tests and
`node_modules`. They share no code.

Everything is published together to GitHub Pages by `.github/workflows/pages.yml`,
which builds every `NN-*` directory it finds, copies each `dist/` to `_site/NN/`,
and uses `.github/pages-index.html` as the site landing page.

## Every prototype must be linked from the landing page

The deploy workflow discovers prototype directories automatically, but
`.github/pages-index.html` is a hand-maintained list. A prototype that is not
listed there still gets built and deployed, and is then unreachable by anyone who
does not already know its URL. This has happened once already.

So: **when you add a new prototype, add its `<li>` link to
`.github/pages-index.html` in the same change.** Adding the directory is not the
whole job. The same applies if a prototype is renamed or removed.

## Previewing a branch

A push to any branch other than main publishes that branch's changed
prototypes to

    https://jkirsteins.github.io/prototypes/preview/<branch-slug>/NN/

beside main's site, which keeps serving `/prototypes/NN/` throughout. The
trigger is `branches: ['**']`, not a bare `push:`, so a tag push does not fire
it and cannot take the one preview slot. The slug is the branch name
lowercased with anything outside `[a-z0-9-]` replaced by `-`.

Which prototypes are built is `git diff` against the merge base with main,
scoped to top-level `NN-*` directories - so a change under
`02-balticmap/docs/` is a change to `02-balticmap` and previews it, same as
touching its `src/`. What publishes nothing is a push that touches no `NN-*`
directory at all: the repo root, `.github/`, a root-level doc.
`gh workflow run pages.yml --ref <branch> -f prototypes=02-balticmap`
overrides the diff if you want a preview of something you have not changed.

A branch whose only changed prototypes are Godot also publishes nothing -
Godot's export path is baked into `project.godot` with no per-run override, so
there is nothing previewable left to build - rather than deploying an empty
preview directory and a link that 404s. The run says so as a notice rather
than failing.

Three things follow from the fact that Pages publishes ONE artifact as the
WHOLE site, and each of them will bite somebody:

- **There is one preview slot.** The most recent preview push across all
  branches is the one that is live, and this repo regularly has several
  sessions working at once.
- **A push to main wipes the live preview.** Main's run publishes main and
  nothing else. Push the branch again to get the preview back; that is why
  the trigger is a push rather than something you have to remember to run.
- **The workflow used is the one on the branch.** A branch cut before branch
  previews existed cannot preview itself until it is rebased.

Branch deploys also depend on a repo SETTING, not just the workflow file:
Settings > Environments > github-pages > Deployment branches and tags. The
`deploy` job runs under that environment, and a branch with no matching
policy fails there with `Branch "X" is not allowed to deploy to github-pages
due to environment protection rules` - a build-job success followed by a
deploy-job failure that reads exactly like a workflow bug and is not one.
`main`, `*` and `*/*` are the policies this repo has configured.

The slash rule is the part worth remembering: a deployment branch pattern's
`*` and `**` do NOT cross a `/`, the opposite of how those wildcards read
everywhere else in this file. `*` alone matches only a single-segment branch
name, so `feature/branch-previews` needs the `*/*` policy on top of it, and a
branch nested one level deeper (`a/b/c`) needs `*/*/*` and fails without it.
Add the matching policy alongside a newly nested branch naming scheme, the
same way `.github/pages-index.html` gets a new prototype's link in the same
change.

## Running a dev server

Run the prototype's own dev server, from its directory, only when you actually
need a browser:

```bash
cd NN-name && npm run dev
```

Each prototype sets `base: "/prototypes/NN/"` in its `vite.config.ts` to match
how Pages serves this repo, so the page is at
`http://127.0.0.1:5173/prototypes/NN/`, not at `/`. Stop the server when done.

There is deliberately no root-level `npm run dev`. The old root orchestrator
(`scripts/dev.mjs`) spawned `npm run dev` in every `NN-*` directory; a
directory without its own `package.json` (a Godot project, a docs-only spec)
made npm walk up to the root package.json and re-run the orchestrator - a fork
bomb that grew until fork() failed. If a front-door server ever comes back, it
must skip directories without a `package.json`.

To check a real production build rather than the dev server, run `npm run build`
in each prototype and assemble the `dist/` directories the way
`.github/workflows/pages.yml` does.

## Per-prototype conventions

- `npm test` runs vitest; `npm run build` runs `tsc` then `vite build`. Both must
  pass before committing. Keep `npm test` fast - if a suite grows past a few
  seconds, split the slow part behind its own script rather than taxing every
  commit with it.
- `vite.config.ts` must set `base: "/prototypes/NN/"` matching the directory
  number, or the deployed build will not load its assets.
  CI passes `--base` explicitly for a branch preview, so the value in the file
  is the default rather than the only value ever used. Do not read the flag in
  `vite.config.ts`; the override belongs at the call site.
- Prototype-specific instructions, specs and plans live under that prototype's
  own `docs/`. Read them before changing its code.

## Card changes: two guards, then playtest it

For prototypes with card-playing AI, two things must hold when a card is added
or its effect, legality, targeting, deck availability or interactions change.
Both are already tests, so they cost nothing to honour:

- **A branch in the AI policy.** Add an entry to `POLICY_COVERAGE` naming the
  branch in `chooseAction` that decides the card and, if targeted, what it aims
  at. Falling through to the first playable card or first legal target is not AI
  support; when existing behaviour genuinely covers a card, the entry names the
  branch that covers it.
- **A route by which the player learns the card exists.** Usually
  `deckBuildable: true` plus the learning loop, so witnessing an enemy play it
  is enough. A card kept out of deck-building must name its other route in a
  comment beside its definition. A card that cannot be built, witnessed or
  injected must not ship. If its effect is private - moving cards inside a
  faction's own deck rather than changing the map - decide who can observe it
  and keep the activity log and notices agreeing with that decision.
- **The one exception: a WITHDRAWN card.** A card may be taken out of every
  pool - not deck-buildable, in no starting deck, injected by nothing - while
  its definition, its AI branch and the machinery it drives stay in the tree.
  That is what "we may bring this back" looks like in code, and deleting it
  instead means rebuilding the machinery from a commit message later. A
  withdrawn card must say so in a comment beside its definition, and say what
  took over the job it was doing. `subjugate` is the standing example: a land
  changes hands by an army walking into it now, and the claim system it
  declares through is still what a Subjugate would need.

Then play it. Your judgement is the gate, so end card work by saying what to
play and what would look wrong.

`POLICY_COVERAGE` is a test and not a checklist item because prose did not work.
Measured in `02-balticmap` on 2026-07-30: four of fourteen cards had no branch
at all, and 27.7% of AI plays were last-resort fallthroughs - Alliance and
Assassinate ruler, the 5th and 6th most-played cards, picking targets by faction
sort order.

## Balance evidence is on demand

`npm test` is fast and catches a missing AI branch, a missing discovery route
and rng drift. It cannot tell you whether a change is *good*.

In `02-balticmap`, `npm run balance` can. It runs the seeded simulation and the
scenario pacing bands, then prints play share per card, cards in the deck that
were never played, targeting bias, waste and the stalemate number. It takes
about a minute. Run it when a batch of card work settles or when something feels
wrong - not on every change. `npm run test:all` is both suites.

## Linting and the pre-commit gate

A single root `biome.json` lints every prototype (`npm run lint` /
`npm run lint:fix` from the repo root). It is deliberately lint-only, formatter
off: the code across all three prototypes is hand-formatted with intent -
packed multi-import lines, aligned JSDoc - and Biome's formatter would rewrite
all of that for no benefit. `style/noNonNullAssertion`,
`style/noDescendingSpecificity` and `complexity/noImportantStyles` are turned
off because this codebase uses them deliberately; everything else in Biome's
recommended set is on.

`.githooks/pre-commit` runs `biome lint` on staged files plus `tsc --noEmit`
for every prototype that has staged changes, scoped so a commit to one
prototype is never blocked by another prototype mid-edit in a sibling session.
It is not installed automatically per clone - run `npm install` at the repo
root once (its `prepare` script points `core.hooksPath` at `.githooks`), or
`npm run hooks:install` directly. Bypass with `git commit --no-verify`.

A git worktree is a fresh checkout with no `node_modules`, and the hook only
ever uses the repo root's own biome (never `npx biome`, which is a squatted
package). A tool the hook cannot find fails the commit and names the
`npm install` to run; `PROTOTYPES_HOOK_STRICT=0` turns that back into a
warning. `npm run lint` works in an uninstalled worktree only because npm
borrows the parent checkout's `node_modules/.bin`, so it is no evidence the
hook will.

The hook checks the **working tree, not the staged snapshot** - it never runs
`git stash`, because several sessions can be mid-edit on the same branch at
once and a stash/restore cycle could swallow someone else's in-progress work.
See the comment at the top of `.githooks/pre-commit` for the full reasoning.

## Housekeeping

- Several sessions may work in this repo at once, sometimes on the same branch
  and on different prototypes. Stage with explicit paths scoped to the prototype
  you are working on. Never `git add -A`.
- `.superpowers/` directories are scratch workspaces. Do not commit them, and do
  not read or write another prototype's workspace.
