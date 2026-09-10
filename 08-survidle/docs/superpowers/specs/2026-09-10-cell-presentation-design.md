# Cell presentation design

## Goal

Every player-facing description and rendering of a map cell must derive from
one typed semantic status. A frozen water cell must not render as ice while a
popup independently calls it water. Snow and ice must not replace terrain
glyphs with a second visual vocabulary.

The design also keeps observation honest. Current snow and ice may be shown on
ground in the current viewshed. A known cell outside that viewshed may identify
its terrain, but must not reveal a surface change that happened since it was
last observed.

## Current problem

Cell meaning is currently assembled independently:

- `src/ui/map.ts` owns a terrain-name table, surface classes, and the `=` and
  `*` condition glyph substitutions.
- `src/ui/tip.ts` owns a different terrain-name table and ignores ice in its
  heading.
- `src/sim/position.ts` owns another terrain-to-location phrase table.
- Detailed zoom has separate snow and ice glyph substitutions in
  `visualGround`.

The compiler cannot connect these branches. Adding or changing a surface state
in one does not require the others to change.

## Decisions

### Stable glyphs

A glyph identifies terrain, not a temporary surface condition.

- Sea remains `~` and lake remains `-` whether open or frozen.
- Meadow retains its existing moisture form: `'`, `.`, or `,`.
- Rock remains `n`; fell remains `^`; trees retain their tree letters.
- Snow and ice change cell color, never the glyph.
- `=` and `*` are removed from normal and detailed map rendering and from the
  legend.

This preserves meaningful terrain variants while removing condition-specific
symbols. At detailed zoom, `visualGround` continues to vary only the underlying
terrain forms. Snow and ice are inherited from the containing cell's classes.

### One semantic surface projection

Add `src/sim/cellstatus.ts`. It owns the complete terrain vocabulary and the
rules that combine terrain with persistent ground state.

The central type is a discriminated union so impossible combinations cannot be
constructed:

```ts
type CellSurface =
  | {
      kind: "water";
      terrain: "water";
      water: "lake" | "sea";
      ice: "none" | "thin" | "safe";
    }
  | {
      kind: "land";
      terrain: Exclude<Terrain, "water">;
      snow: "none" | "cover" | "deep";
    };
```

`cellSurface(state, world, cell)` is the only function that combines terrain,
water kind, snow depth, and ice depth. Callers do not repeat thresholds or ask
whether ice should override a water label.

The module also owns exhaustive formatting:

- `surfaceHeading(surface)`: `safe ice over water`, `snow-covered meadow`,
  `bare rock`.
- `surfaceLocation(surface)`: `on safe ice`, `on snow-covered open ground`,
  `among the pines`.
- `terrainHeading(terrain)`: the base terrain name used when live surface state
  is not observable.

Every switch ends in an `assertNever` check. Adding a terrain or surface kind
therefore fails type checking until every central phrase is supplied.

### Observation-aware presentation

Add `src/ui/cellpresentation.ts` as the sole adapter from simulation truth to a
player-facing cell.

```ts
type CellObservation =
  | { knowledge: "unknown"; heading: "unknown ground" }
  | {
      knowledge: "current";
      surface: CellSurface;
      heading: string;
      location: string;
      glyph: string;
      classes: readonly string[];
    }
  | {
      knowledge: "remembered" | "inherited";
      terrain: Terrain;
      heading: string;
      glyph: string;
      classes: readonly string[];
    };
```

The adapter accepts the already computed current viewshed. It checks map
knowledge before sampling a surface:

- Unknown cells expose no terrain or current ground state.
- Current cells receive the full `CellSurface`, including snow and ice.
- Remembered and inherited cells receive base terrain only. They do not sample
  current snow or ice and therefore cannot reveal remote changes.

The map can aggregate terrain at coarse zoom, but it must use the same surface
projection for any block that intersects the current viewshed. A coarse block
outside the current viewshed remains remembered or inherited and receives no
live surface condition.

### Consumer migration

The following consumers move to the shared projection:

- Map glyph, CSS classes, `aria-label`, and `data-map-info`.
- Detailed map glyphs.
- Local and remote cell popup headings and surface lines.
- The survivor's current-location summary in `describeWhere`.
- Cell-based route and task descriptions when they claim what the ground is.
- The map legend.

Named places remain useful labels. A named place is the popup heading and the
shared surface heading appears immediately below it. An unnamed cell uses the
surface heading directly. Relative descriptions such as `a spot 0.6 km north`
remain relative descriptions and do not invent terrain text.

Simulation mechanics continue to use `cellAt`, `terrainAt`, and numeric cell
indices directly. The presentation projection does not replace mechanical cell
identity or routing rules.

### Visual states

The existing class names remain the rendering contract:

- `.ground-snow` and `.ground-snow-deep` color the stable land glyph.
- `.ice-thin` uses background `#142533`.
- `.ice-safe` uses background `#243746`.
- Frozen water uses the ordinary water foreground and its stable lake or sea
  glyph. Ice condition is communicated by background fill only.
- Markers continue to own their whole cell background.
- No new border, overlay, SVG, or non-cell-aligned layer is introduced.

The legend demonstrates ice with the underlying water glyph on the two ice
backgrounds. It does not assign ice a new symbol.

## Enforcement

The architecture is enforced at three levels:

1. `CellSurface` makes ice-on-land and snow-as-a-water-replacement impossible
   states, while exhaustive switches make new cases compile-time failures.
2. Terrain names, surface thresholds, and location phrases have one owner.
   The duplicate tables in `map.ts`, `tip.ts`, and `position.ts` are deleted.
3. Contract tests exercise the same fixtures through map markup, popup HTML,
   accessibility text, and current-location text. For each visibility and
   surface state, all consumers must agree on the central description.

Tests also assert that condition glyphs never appear, that normal and detailed
zoom preserve the underlying terrain forms, that marker backgrounds win, and
that remembered or unknown cells do not expose current snow or ice.

## Performance

Map rendering already caches ground by region and computes the current viewshed
once per displayed minute. The presentation adapter accepts those resolved
inputs rather than recomputing atmosphere or line of sight per consumer.

`cellSurface` is pure with respect to supplied terrain and ground values. A
convenience overload may resolve them for low-volume consumers such as the
popup and location summary. The dense map path uses the resolved-input form.

No new per-frame simulation work, weather sampling, or DOM layer is added.

## Migration and compatibility

This is a presentation-only migration. Save data, terrain generation, weather
state, routing, ice safety, and snow mechanics do not change.

Existing screenshots are regenerated from the deterministic scenario catalog.
The frozen-water reference must show stable water glyphs on the safe-ice fill,
and snowy references must show their original terrain glyphs in snow colors.

## Verification

- Unit tests for every `CellSurface` branch and formatter.
- Red-green rendering tests for stable water and meadow glyphs.
- Cross-surface contract tests for map labels, popup headings, accessibility
  labels, and current-location descriptions.
- Unknown, remembered, inherited, current, thin-ice, safe-ice, snow-cover, and
  deep-snow cases.
- Existing fast test suite and production build.
- Headless Chrome weather references, including frozen water, snow, fog,
  clouds, and clear ground.
- Visual inspection for symbol reduction, marker precedence, region borders,
  and absence of cell seams.
