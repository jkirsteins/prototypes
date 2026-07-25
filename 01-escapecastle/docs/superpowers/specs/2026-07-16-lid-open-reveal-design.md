# Lid-Open Reveal Design

Date: 2026-07-16

## Goal

When the coffin lid is open, regardless of how the player opened it (five pushes
by force, or forcing the hinge with the nail), the game shows a specific
background image (a view from inside the coffin into a ruined, ornate room) and
offers a narrative choice: "Step into the room."

## Changes

### Asset

- Add `public/backgrounds/lid-open.png` (image supplied by the user).

### Ink story (`src/ink/coffin.ink`)

- Both escape endings keep their variable effects (`escaped`, `build`,
  attribute bumps) but divert to a new shared knot `lid_open` instead of
  `-> END`.
- The strength ending prose is rewritten so the lid bursts open while the
  player is still inside the coffin (currently it says they roll out onto
  cold stone, which contradicts the image's point of view).
- `lid_open` is tagged `# image:lid-open`, describes the room as seen from
  inside the coffin (show, don't tell; the word "coffin" never appears in
  player-facing text), and offers exactly one choice: "Step into the room."
- Choosing it plays a short passage of climbing out, then `-> END`. The next
  room is future content.

### Background wiring (`src/main.ts`, `src/styles.css`)

- The background is currently hardcoded to `awakening.png` on `body` in CSS.
  Replace with a mapping driven by `snapshot.imageId`: `lid-open` maps to
  `/backgrounds/lid-open.png`; every other image id falls back to
  `/backgrounds/awakening.png`.
- No other visible UI change. The debug overlay keeps showing the raw
  image id.

### Tests (`src/ink/coffinScene.test.ts`)

- Both escape paths reach a state with `imageId === "lid-open"` and a
  "Step into the room." choice.
- Choosing "Step into the room." ends the story (no further choices).
- Existing fiction-break checks continue to apply to the new prose.

## Verification

- `npm test` passes.
- Playwright in a real browser: both escape routes show the new background
  when the lid opens, the "Step into the room." choice is present, and
  choosing it plays the closing passage.

## Non-goals

- The room scene itself (what happens after stepping in) is future content.
- No changes to build/attribute mechanics.
