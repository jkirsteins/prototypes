# Wildlife startle browser evidence

Generated on 2026-09-09 with `scripts/startle-shots.mjs`, Vite's development-only seeded fixture harness, and headless Chrome.
Each screenshot is captured about 240 ms into the 1200 ms effect.

- [visible](visible.png): one seen marker and a recoiling animal glyph.
- [heard-only](heard-only.png): one marker with no animal glyph or identity.
- [reduced-motion](reduced-motion.png): the same cue under `prefers-reduced-motion: reduce`.

The script drives all six seeded scenarios. It asserts visible and heard-only disclosure, same-area non-detection, bog and snow audio slot selection, blocked-edge passability, cue timestamp/key survival across zoom and a second step, clipped edge bounds, reduced-motion fade, muted simulation equivalence, visibility suppression, and a console free of exceptions. Browser automation cannot objectively evaluate the subjective recognisability or quality of the rendered sound.
