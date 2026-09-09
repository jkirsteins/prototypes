# Wildlife startle browser evidence

Generated on 2026-09-09 with `scripts/startle-shots.mjs`, Vite's development-only seeded fixture harness, and headless Chrome.
Each screenshot is captured about 240 ms into the 1200 ms effect.

- [visible](visible.png): one seen marker and a recoiling animal glyph.
- [heard-only](heard-only.png): one marker with no animal glyph or identity.
- [reduced-motion](reduced-motion.png): the same cue under `prefers-reduced-motion: reduce`.
- [mid-travel](visible-mid-travel.png) and [cell crossing](visible-cell-crossing.png): exact simulated movement with one stable animal node.
- [natural seed 19](natural-seed-19-startle.png): an unmodified landing and ordinary map click, with no fixture command.
- [natural seed 9 on 25 November](natural-seed-9-heard.png): a normal eastward walk produces a heard-only departure with no animal glyph.
- [natural seed 3 start](natural-seed-3-travel-start.png) and [arrival](natural-seed-3-travel-end.png): visible ordinary deer travel with no player action or startle.

The script drives all six fixture scenarios plus the natural seeds. It asserts visible and heard-only disclosure, same-area non-detection, bog and snow audio slot selection, blocked-edge passability, cue timestamp/key survival, a time-stamped monotonic trace across one complete gait-scaled segment, animal-node identity across a cell boundary, clipped edge bounds, reduced-motion fade, muted simulation equivalence, normal landing and map-click flow, and a console free of exceptions. Browser automation cannot objectively evaluate the subjective recognisability or quality of the rendered sound.
