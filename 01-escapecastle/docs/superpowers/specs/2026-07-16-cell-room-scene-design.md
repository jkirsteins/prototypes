# Cell Room Scene Design

Date: 2026-07-16

## Goal

After the player chooses "Step into the room.", the game shows a new
background image (a ruined stone room: barred window with rotted curtain,
heavy banded door, low pallet, chains on the walls) and sets the scene in
prose. The room offers a repeatable "Look around." action that reports the
player does not see anything specific. The story no longer ends after
stepping in; this knot is the scaffold future room actions hang off.

## Changes

### Asset

- Add `public/backgrounds/cell-room.png` (image supplied by the user,
  copied from Downloads).

### Ink story (`src/ink/coffin.ink`)

- The "Step into the room." choice in `lid_open` keeps its climbing-out
  prose but diverts to a new knot `cell_room` instead of `-> END`.
- `cell_room` is tagged `# image:cell-room` and describes the room in
  sensory, show-don't-tell terms: cold flagstones, a barred window behind a
  rotted curtain, a heavy iron-banded door, a low pallet with a tumbled
  blanket, chains hanging against the stone. The words "cell", "prison",
  and "dungeon" never appear in player-facing text; the player has not
  learned where they are.
- After the scene prose, the knot offers one sticky choice:
  `+ [Look around.]`. Choosing it prints a short line to the effect
  of "You look, and look again. Nothing in particular catches your eye."
  and loops back. Sticky so the player always has at least one action and
  the story never dead-ends (no-stuck-states principle).
- No variable or attribute changes in this beat.

### Background wiring (`src/main.ts`)

- Register `"cell-room"` in the `BACKGROUNDS` map, pointing at
  `backgrounds/cell-room.png`. Fallback behavior is unchanged.

### Tests (`src/ink/coffinScene.test.ts`)

- Stepping into the room yields `imageId === "cell-room"` and offers a
  "Look around." choice (story does not end).
- Choosing "Look around." prints the nothing-specific line and offers
  "Look around." again.
- Existing fiction-break checks apply to the new prose (no "cell",
  "prison", "dungeon", "coffin", or meta language).
- Update any existing assertions that expect the story to end after
  "Step into the room."

## Verification

- `npm test` passes (recompiles ink via `compile:ink`).
- Playwright in a real browser: stepping into the room shows the new
  background, the scene prose renders, and "Look around." loops with the
  nothing-specific line.

## Non-goals

- No interactable room features yet (door, window, pallet, table are
  future content).
- No changes to build/attribute mechanics.
