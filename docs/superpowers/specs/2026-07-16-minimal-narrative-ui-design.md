# Minimal Narrative UI Revamp - Design

Date: 2026-07-16
Status: Approved

## Goal

Replace the boxed, panel-heavy prototype UI with a minimal presentation: full-screen
scene background, plain narrative text, plain selectable text choices. Remove all
player-facing mechanics (stats, discoveries) and all fiction-breaking language. Codify
these principles in AGENTS.md.

## Design principles (also added to AGENTS.md)

- Show, don't tell. Describe what the player character senses; never name what they
  have not learned in-fiction (the player does not know they are in a coffin, so the
  word never appears).
- Never break the fiction. No meta language in player-facing text: no "tutorial",
  no "BUILD SET:", "CLUE FOUND:", "ITEM GAINED:", "MEMORY GAINED:", "DEDUCTION:".
  State changes happen silently; the prose carries the meaning.
- Minimal UI. No boxes, borders, panels, or buttons-that-look-like-buttons. Narrative
  text and selectable text choices rendered over a scene background image, with at
  most a soft gradient scrim for legibility.
- Mechanics stay hidden. Stats, builds, and flags are tracked internally and never
  shown to the player.
- Debug affordances must be unmistakably labeled as debug and easy to remove later.

## What is removed

- The bordered shell, scanline background, side panel, choices box, controls box.
- The CSS-drawn coffin illustration (`.flavor-image`, `.coffin-plate`) and mood caption.
- The header block: eyebrow "Coffin Tutorial" and h1 "Inside the Coffin".
- The "Starting Build" stats panel.
- The "Items, Clues, Memories" discoveries panel and its click-to-combine mechanic.
  Progression is unaffected: the Ink script already gates "break the hinge" behind
  having found both the nail and the hinge.
- The always-visible Reset button (moves into the debug overlay).
- Legacy unreferenced modules: `src/game/` and `src/ui/` including their tests.

## What is built

### Layout (main.ts + styles.css)

- Full-viewport background image: the supplied render of a dark wooden interior,
  copied to `public/backgrounds/awakening.png`, applied with `background-size: cover`,
  centered. Page never scrolls horizontally.
- One text column anchored to the lower-left region (max width ~60ch), sitting on a
  soft bottom-up dark gradient scrim (no border, no box).
- Narrative paragraphs in a serif stack (e.g. Iowan Old Style, Palatino, Georgia,
  serif), light warm color, comfortable line height.
- Ink `image:` tags keep working, but all current tags map to the same background;
  the plumbing stays for future scenes.

### Choices

- Rendered as plain text lines below the narrative. Dim by default, brighten on
  hover/focus. Cursor pointer. Activated by click or number keys 1-9.
- When the scene ends (no choices), nothing extra is rendered; the final prose stands.

### Debug overlay

- Backtick (`) toggles a fixed overlay clearly headed "DEBUG - not player-facing,
  remove before release".
- Shows: build, strength/caution/ingenuity numbers, escaped flag, and a Reset button
  that restarts the story.
- Visually distinct from the game (e.g. monospace, high-contrast panel) so it can
  never be mistaken for fiction.

### Ink content rewrite (coffin.ink)

- Opening: sensory-only. Darkness, velvet against the shoulders, wood inches above
  the face, stale air, a brass plaque rasping near the right hand. The word "coffin"
  never appears in any player-visible text, including choice labels.
- Choice labels rewritten in the same spirit, e.g. "Push against the wood above you"
  instead of "Push the coffin lid."
- All meta announcement lines removed. Variables (`build`, stats, flags) are still
  set exactly as before; they are simply never printed.
- Internal identifiers (file names, variable names, image tag values like
  `image:coffin`) are not player-visible and stay unchanged.

### AGENTS.md update

- Add the "Design principles" section above, alongside the existing verification and
  no-dead-end rules.

## Testing

- Update `src/ink/coffinScene.test.ts` to the rewritten prose and to assert that
  player-visible text never contains fiction-breaking terms ("coffin", "tutorial",
  "BUILD SET", "CLUE FOUND", "ITEM GAINED", "MEMORY GAINED", "DEDUCTION").
- Remove `src/game/*.test.ts` and `src/ui/*.test.ts` along with their modules.
- End-to-end in a real browser: play all three escape paths (three pushes; call twice;
  find lining -> take nail -> find hinge -> break hinge) and toggle the debug overlay.

## Out of scope

- New scenes, new art for other story beats, sound, animations, save/load.
- Touch-device access to the debug overlay (debug is keyboard-only by design).
