# Room Interaction System Design (Inventory + Verb Strip)

Date: 2026-07-16

## Goal

Layer a point-and-click interaction system over the ink story: the player
discovers objects in the room ("look around"), applies two verbs (look, use)
to them from a minimal text strip, collects items into an inventory, and
those items gate later interactions. First content to use it: the stuck
table drawer (strength-gated), the fire-starting tin inside it, and the
cold candle by the door whose lighting swaps the room background to a
lighter image and lets a later "look around" reveal more objects.

## Mental model (authoring rule)

"Point at it and grunt": if a generic verb plus one visible object fully
expresses the action (look table, use drawer, use candle), it belongs in
the item strip. If there is no object to point at, or the meaning lives in
manner or intention ("Call out anyway.", internal memories, escalating
repetition), it belongs in the ink choice list. Every scene is authored by
listing its physical objects (strip entries) and then whatever remains
that the player should be able to do (ink choices, always few).

Strip interactions are combinatorial: any verb+object pair is attemptable.
Only interesting pairs get authored prose; everything else falls back to
generic in-fiction flavor. This keeps the ink choice list clean as items
multiply, because displayed ink choices must each be authored while strip
fallbacks are free.

## Architecture: ink owns all state (Approach A)

Ink remains the single source of truth. Spotted objects and inventory are
ink LIST variables. The TypeScript strip UI is a pure projection of ink
state plus one piece of UI-only state (which verb is selected). A strip
click calls back into ink via `ChoosePathString("interact", true,
[verb, item])` (inkjs supports the args parameter; verified against
`node_modules/inkjs/engine/Story.d.ts`). Consequences:

- No state synchronization between TS and ink; no duplicate stores.
- Ink conditions gate on inventory natively: `{ inventory ? tinderbox: ... }`.
- Ink's built-in state serialization will cover saves later for free.
- Tests drive `interact()` headlessly in the existing vitest style.

Rejected alternatives: TS-owned inventory with EXTERNAL functions (two
sources of truth, save state loses inventory, ink lookahead calls
externals speculatively) and tag-event sourcing (`# spot:x` / `# take:x`;
gating logic needs the state back inside ink anyway, causing duplication).

## Ink changes (`src/ink/coffin.ink`)

Declarations:

```
LIST items = table, drawer, tinderbox, candle, hanging, cage, bucket
VAR spotted = ()
VAR inventory = ()
VAR drawer_open = false
VAR candle_lit = false
```

- `cell_room` prose changes so the candle is cold and unlit (current text
  says it burns, which contradicts the lighting chain). Entering the room
  spots the candle (`~ spotted += candle`) because the prose names it.
- The sticky "Look around." ink choice becomes a three-way conditional:
  1. First pass: spots the table (`~ spotted += table`) with prose about
     noticing it under the window.
  2. After `candle_lit`, next pass: spots hanging, cage, bucket
     (`~ spotted += (hanging, cage, bucket)`) with prose about what the
     light reveals.
  3. Otherwise: "nothing in particular catches your eye" flavor.
- Dispatcher knot, entered only from TS:

```
=== interact(verb, item) ===
{ verb == "look" and item == "table": -> look_table }
{ verb == "use" and item == "drawer": -> use_drawer }
... (one line per authored handler)
-> interact_fallback(verb, item)
```

Authored handlers (each a stitch that prints prose, mutates state, and
diverts back to `cell_room_loop`):

- `look table`: reveals the drawer; `~ spotted -= table`,
  `~ spotted += drawer` (the table becomes irrelevant and leaves the strip).
- `look drawer`: describes it as stuck shut.
- `use drawer`: `{ strength >= 2: ... }` - success sets `drawer_open`,
  spots the tinderbox (in-fiction: a small tin with flint and steel);
  failure prints stuck flavor. Repeat use after opening gets flavor.
- `look tinderbox`, `use tinderbox`: use picks it up
  (`~ spotted -= tinderbox`, `~ inventory += tinderbox`).
- `look candle`: unlit vs lit variants.
- `use candle`: `{ inventory ? tinderbox: ... }` - success sets
  `candle_lit`, emits `# image:cell-room-lit`; no tools or already lit
  each get their own flavor line.
- `look` on hanging, cage, bucket: one short authored line each.
- `interact_fallback(verb, item)`: generic in-fiction flavor (distinct
  lines for look vs use), no state change.

Winnability note: the drawer gate stays strength-only for now. The lit
candle is optional in this prototype (it brightens the room and reveals
objects; escape progress must not require it). Alternate routes for
non-strength builds are deferred and tracked as a non-goal.

## TS scene layer (`src/ink/coffinScene.ts`)

- `export type ItemVerb = "look" | "use";`
- `interact(verb: ItemVerb, item: string): CoffinSnapshot` - calls
  `this.story.ChoosePathString("interact", true, [verb, item])`, then
  `continueStory()`, returns the snapshot.
- Snapshot gains `spotted: string[]` and `inventory: string[]`, read via
  a small helper that converts an ink LIST variable (InkList entries) to
  an array of item names, following the existing typed-variable-reader
  pattern.

## Strip UI (`src/main.ts`, `src/styles.css`)

Minimal-UI rules apply: plain text over the scene, no boxes, borders, or
button styling; at most a soft scrim for legibility.

- A strip at the top of the stage. Left cluster: the words "look" and
  "use"; the selected verb renders at full opacity, the other dimmed.
  Default verb is "look". Selection is module-level UI state persisting
  across renders.
- Next to the verbs: spotted room objects as plain clickable words. A
  whitespace-separated cluster shows carried items (inventory).
- Item ids map to player-facing labels via a TS display-name map
  (e.g. `tinderbox` -> "small tin"). Labels are in-fiction nouns only.
- Clicking an item calls `scene.interact(selectedVerb, itemId)` and
  re-renders.
- `BACKGROUNDS` gains `"cell-room-lit"` -> `backgrounds/cell-room-lit.png`.
- Debug panel (debug-only, allowed to show mechanics) additionally lists
  spotted and inventory contents.
- Existing keyboard handling (1-9 chooses ink choices, backtick toggles
  debug) is unchanged.

## Asset

- Copy the user-supplied lighter room image (candle lit on the right
  wall) from Downloads to `public/backgrounds/cell-room-lit.png`.

## Tests (`src/ink/coffinScene.test.ts`)

- Strength-build happy path: five pushes -> step in -> look around spots
  table -> `interact("look", "table")` swaps table for drawer ->
  `interact("use", "drawer")` opens it and spots tinderbox ->
  `interact("use", "tinderbox")` moves it to inventory ->
  `interact("use", "candle")` sets `imageId === "cell-room-lit"` ->
  second look around spots hanging, cage, bucket.
- Non-strength build (ingenious path): `use drawer` prints stuck flavor,
  drawer stays spotted, no tinderbox appears.
- `use candle` without the tin: flavor line, imageId stays `cell-room`.
- Unauthored combo (`use table`): generic fallback prose, no crash, no
  state change.
- Fiction guard (existing word-boundary checks) runs over all new prose
  and choice/interaction output; additionally assert the pre-lighting
  room prose never claims the candle is burning.

## Verification

- `npm test` passes (recompiles ink first).
- Playwright in a real browser: click through the full chain (look
  around, verb selection, table -> drawer -> tin -> candle), confirm the
  strip updates at each step, the background swaps to the lit image, and
  a second look around reveals the new objects.

## Non-goals

- No alternate (non-strength) route into the drawer yet.
- No handlers for door/window/pallet/chains yet (fallback covers them if
  spotted later; they are not spotted in this iteration).
- No "use X on Y" item-combination verb yet (the dispatcher signature
  extends naturally when needed).
- No save/load.
