# Baltic Map Prototype - Design

Date: 2026-07-25
Status: Approved pending user review

## Purpose

An interactive map of the Baltic states (Estonia, Latvia, Lithuania) rendered
entirely from open vector data, replacing an earlier idea of using a
copyrighted, low-resolution raster map (Nordregio "Regions and municipalities
in the Baltic States in 2015"). The map shows 21 NUTS-3 units; hovering
highlights a unit, clicking selects it and opens a placeholder info panel.
Deployable to GitHub Pages as prototype 02 in the `prototypes` monorepo.

## Interaction requirements

- 21 hoverable/clickable units (NUTS-3, per NUTS 2013 classification):
  - Lithuania: 10 counties (apskritys)
  - Latvia: 6 statistical regions
  - Estonia: 5 county groups
- Hover: region brightens, its outline is raised above neighbors, a tooltip
  shows the region name.
- Click: region becomes selected (persistent highlight) and a side panel
  opens showing region name, country, and dummy placeholder fields (to be
  replaced with real data later). Clicking sea/neighbor countries or the
  panel's close button deselects.
- Pan: drag with the mouse. Zoom: scroll wheel centered on the cursor,
  crisp at any level (vector), clamped between fit-to-viewport (1x) and 8x.
  Map initially fits the viewport.

## Architecture

Two parts, cleanly separated:

### 1. Data prep script (build-time, run once, output committed)

`scripts/prepare-data.mjs` (Node, d3-geo as devDependency):

1. Downloads from Eurostat GISCO:
   - NUTS 2013 boundaries, 1:1M generalization, GeoJSON.
   - Country boundaries (same scale) for neighbor context: FI, SE, RU, BY, PL.
2. Filters NUTS-3 features for EE/LV/LT (21 features).
3. Projects everything with LAEA Europe (the standard projection for European
   statistical maps) into a fixed internal coordinate space
   (e.g. 1000 x 1400 units, portrait).
4. Writes `src/data/map.json`: per region - id (NUTS code), name, country,
   projected polygon rings; plus neighbor geometries and the coordinate-space
   bounds.

The output JSON is committed, so app builds never touch the network and the
runtime app has zero npm dependencies.

### 2. Runtime app (Vite + TypeScript, no framework)

- `src/main.ts` - bootstraps, loads `map.json`, wires components together.
- `src/map-render.ts` - builds the SVG: sea background, grey neighbor
  shapes, 21 region `<path>` elements (pastel palette echoing the original
  map), country labels. Pure function of the data; no interaction logic.
- `src/interaction.ts` - hover/click handlers, selection state, viewBox
  pan/zoom (drag + wheel). Exposes a small state object; emits
  select/deselect changes via callbacks.
- `src/panel.ts` - side panel + tooltip DOM. Renders from a region's
  metadata; placeholder fields are hardcoded labels with dummy values.
- Attribution line "(c) EuroGeographics for the administrative boundaries"
  fixed in a corner.

## Project structure and deploy

- Project lives at `02-balticmap/` in the `prototypes` monorepo.
- `vite.config.ts` uses `base: "/prototypes/02/"`.
- `01-escapecastle/vite.config.ts` changes from `base: "/prototypes/"` to
  `base: "/prototypes/01/"`.
- New workflow `.github/workflows/pages.yml` at repo root:
  - builds both prototypes (npm ci + npm run build in each),
  - assembles a site directory: `01/` (escapecastle dist), `02/` (balticmap
    dist), plus a minimal root `index.html` linking to both prototypes,
  - deploys via actions/upload-pages-artifact + actions/deploy-pages.
- Resulting URLs: `https://jkirsteins.github.io/prototypes/01/` and
  `https://jkirsteins.github.io/prototypes/02/`.

## Error handling

- Prep script: fails loudly if a download fails or the NUTS-3 filter does not
  yield exactly 21 features; no partial output written.
- Runtime: `map.json` is bundled at build time, so no runtime fetch errors to
  handle. Pointer handlers ignore events outside region paths (sea/neighbors
  deselect only on click).

## Testing

- Vitest for pure logic:
  - data shape: 21 regions, expected NUTS codes, country assignment,
    coordinates within declared bounds (runs against the committed
    `map.json`),
  - selection state transitions (hover/select/deselect),
  - viewBox math for pan/zoom (clamping, wheel zoom around cursor).
- Visual behavior (rendering, palette, panel) verified manually in the
  browser.

## Out of scope

- Real region data (population etc.) - the panel shows placeholders.
- Municipality (LAU) boundaries and interaction.
- Custom artwork; the vector outlines serve as the template for later art.
- Mobile/touch gestures (mouse-first prototype).
