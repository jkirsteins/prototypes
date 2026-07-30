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

## Run the dev server from the root, through the landing page

**From the repo root:**

```bash
npm run dev
```

Then open `http://127.0.0.1:4173/prototypes/`.

That starts every prototype's own Vite dev server, each keeping full hot reload,
and puts a single front door in front of them serving the same landing page
GitHub Pages uses. Every prototype is reachable from that one page at the same
URL shape it will have in production. It also warns on startup if a prototype
exists but is not linked from the landing page.

`scripts/dev.mjs` implements this with node builtins only, no dependencies. Child
Vite servers get port 5100 plus the prototype number, and websocket upgrades are
proxied so hot reload works through the front door rather than only on the child
ports.

Do not serve a single prototype at a bare root instead. Each is built with
`base: "/prototypes/NN/"` in its `vite.config.ts`, matching how Pages serves this
repo. Serving one on its own at `/` makes its asset paths resolve by accident
locally while still being wrong in production, and it hides landing-page problems
like a missing link entirely. Running one prototype's own `npm run dev` directly
is fine for a quick look, but verify through the root server before calling work
done.

To check a real production build rather than the dev servers, run `npm run build`
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

## Housekeeping

- Several sessions may work in this repo at once, sometimes on the same branch
  and on different prototypes. Stage with explicit paths scoped to the prototype
  you are working on. Never `git add -A`.
- `.superpowers/` directories are scratch workspaces. Do not commit them, and do
  not read or write another prototype's workspace.
