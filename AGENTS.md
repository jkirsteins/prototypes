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

- Review legal-action generation and strategic evaluation for the card.
- Add or update AI tests for useful, harmful, and competing-card situations.
- Add or update simulation metrics that can reveal whether the card is ignored,
  wasted, dominant, or targeted with an unintended bias.
- Run the prototype's seeded AI balance benchmark and compare it with the
  committed baseline.
- Document why no AI change is needed when the review concludes that existing
  behavior is intentionally sufficient.

Falling through to the first playable card or first legal target is not complete
AI support.

## Housekeeping

- Several sessions may work in this repo at once, sometimes on the same branch
  and on different prototypes. Stage with explicit paths scoped to the prototype
  you are working on. Never `git add -A`.
- `.superpowers/` directories are scratch workspaces. Do not commit them, and do
  not read or write another prototype's workspace.
