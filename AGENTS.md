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
  pass before committing.
- `vite.config.ts` must set `base: "/prototypes/NN/"` matching the directory
  number, or the deployed build will not load its assets.
- Prototype-specific instructions, specs and plans live under that prototype's
  own `docs/`. Read them before changing its code.

## Card changes must revisit AI and balance evidence

For prototypes with card-playing AI, adding a card or changing a card's effect,
legality, targeting, deck availability, or interactions must revisit the AI in
the same change. The change must:

- **Give the card its own branch in the AI policy.** A new card is not done
  until the policy decides, by name, when to play it and (if targeted) what to
  aim it at. Record that branch in the policy's coverage map so a card without
  one fails a test rather than passing review.
- Review legal-action generation and strategic evaluation for the card.
- Add or update AI tests for useful, harmful, and competing-card situations.
- Add or update simulation metrics that can reveal whether the card is ignored,
  wasted, dominant, or targeted with an unintended bias.
- Run the prototype's seeded AI balance benchmark and compare it with the
  committed baseline.
- Document why no AI change is needed when the review concludes that existing
  behavior is intentionally sufficient. "Intentionally sufficient" still needs a
  coverage-map entry naming the branch that covers it.

Falling through to the first playable card or first legal target is not complete
AI support.

This rule has been broken before, and prose alone did not catch it. Measured in
`02-balticmap` on 2026-07-30, four of its fourteen cards had no branch in
`chooseAction` at all, and 27.7% of all AI plays across 60 simulated worlds were
step-of-last-resort fallthroughs. Two of them, Alliance and Assassinate ruler,
were the 5th and 6th most-played cards in the game and picked their targets by
faction sort order while two or more targets were legal 82% and 64% of the time.
That is why the coverage map above is a test and not a checklist item.

## Every new card must be discoverable by the player

For prototypes with a card-discovery or unlock loop, a new card is not done until
a player can *learn that it exists* by playing the game. A card the player can
never find out about is content that, for them, is not in the game at all.

So for every card added:

- **Name the route by which the player first sees it**, and make it a test.
  Usually that means the card is deck-buildable and tracked by the learning
  loop, so witnessing an enemy play it adds it to the seen pool.
- **Measure the discovery rate** over a seeded batch and record it. A card
  witnessed in a few percent of games is technically discoverable and
  practically invisible; treat that as a failing number, not a pass.
- **A card deliberately excluded from deck-building must be reachable another
  way**, and that way must be documented next to its definition. Injection-only
  cards are the legitimate case: the player meets them because something else
  puts them in their deck.

Injection-only is the sole exemption, and it is only an exemption from *deck
discovery*, never from being encountered. If a card cannot be built, cannot be
witnessed, and cannot be injected, it must not ship.

Measured in `02-balticmap` on 2026-07-30, when Seeds of revolt replaced Revolt:
Seeds of revolt is witnessed in 71% of games by a naive player over 200 seeded
runs, the same rate as Assassinate ruler and ahead of Alliance at 53%. Revolt
itself became `deckBuildable: false` and is now reachable *only* by playing
Seeds of revolt - which is why that route is stated in its card comment and in
the deck-screen test, rather than left to be rediscovered later.

Note that discoverability is about more than the deck screen. If a card's effect
is a private action - one that moves cards inside a faction's own deck rather
than changing the map - decide explicitly who can observe it, and keep the
activity log and the notices agreeing with that decision. The same changeset
shipped a log filter and a notice for exactly this reason: sowing a revolt is
invisible from outside, so the log must not announce every faction's, while a
player's own vassal sowing must be announced or the counterplay is unknowable.

## Housekeeping

- Several sessions may work in this repo at once, sometimes on the same branch
  and on different prototypes. Stage with explicit paths scoped to the prototype
  you are working on. Never `git add -A`.
- `.superpowers/` directories are scratch workspaces. Do not commit them, and do
  not read or write another prototype's workspace.
