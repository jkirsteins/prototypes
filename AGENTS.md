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
