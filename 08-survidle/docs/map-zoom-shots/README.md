# Close map zoom references

The older `before-rung0.png`, `after-rung0.png`, and `places-rung1.png` record
the first map zoom and layout corrections.

`visual-subcells-rung1.png` and `visual-subcells-rung0.png` are historical:
they show the cosmetic 100 m and 50 m fields the close rungs once drew inside
one 300 m cell. Nothing inside those fields was mechanical. The
authoritative-close-zoom migration replaced them with real 50 m patches, so
these two shots are kept only as the "before" they were.

The rung ladder now, closest first, in 50 m patches per glyph:

| Patches per glyph | Ground per glyph | Board |
| --- | --- | --- |
| 1 | 50 m | 72 by 36 glyphs |
| 2 | 100 m | 72 by 36 glyphs |
| 6 | 300 m | 72 by 36 glyphs |
| 18 | 900 m | 72 by 36 glyphs |
| 54 | 2.7 km | 72 by 36 glyphs |
| the whole world | one glyph per block of the world's height | 36 glyphs tall |

Every rung but the last is a square block of the same authoritative patches, so
the closest rung is the ground the simulation runs on rather than a magnified
default, and a click at any rung names the exact patch an order is given for.
The board keeps its size on screen throughout; the farthest rung is only as
wide as the world needs.

The current before-and-after captures of the close rungs live in
`../close-zoom-simulation-shots/`, beside the design they were taken for.
