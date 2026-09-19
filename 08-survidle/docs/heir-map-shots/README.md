# What an heir opens the map on

Before and after roadmap Q's rulings 1 and 4: a death takes the ground with
it, and sighting the old camp hands its country back.

Every image is the ordinary application. `scripts/heir-save.ts` lands a first
survivor on seed 17, gives them the region's own camp cell, lives twelve days,
kills them, and runs the real `beginAgain` and `land`; the page loads the save
that produces the way it loads any other. Nothing is drawn that the simulation
did not leave behind. The before images were taken on `7ca8cac` (main) with
that revision's own save, so each side is its own idea of what a heir knows.

`scripts/heir-map-shots.mjs` takes them, and prints the board model's own
counts beside each one - so the pictures can be checked against a number
rather than an impression.

| | glyphs | in sight | walked | from the journal | fog |
| --- | ---: | ---: | ---: | ---: | ---: |
| `before-close` | 2592 | 206 | 125 | 0 | 2357 |
| `after-close` | 2592 | 53 | 0 | 0 | 2479 |
| `before-wide` | 2592 | 25 | 11 | 39 | 2516 |
| `after-wide` | 2592 | 6 | 0 | 0 | 2578 |
| `after-camp-sighted` | 2592 | 19 | 10 | 17 | 2546 |

## The close rung, 300 m per glyph

`before-close.png` and `after-close.png`. Before, the landing valley is handed
over whole - 125 glyphs of it - because `land` called `mapRegion` on the heir's
region as well as the first survivor's. After, the heir keeps only what the eye
reaches from the shore they stand on, which is `newPerson`'s own look.

The two lives land in different countries (Langtjern before, Stormnes after)
because the landing rule changed in the same branch: the floor is now the
region next door rather than three kilometres.

## The wide rung, 900 m per glyph

`before-wide.png` and `after-wide.png`, one press of the real zoom-out button.
This is the pair that shows the inheritance itself. Before, a detached island
of the ancestor's country sits in the north-east, in full colour, with nothing
between it and the heir: thirty-nine glyphs of ground this survivor has never
walked. After, there is none of it.

## The country coming back

`after-camp-sighted.png`. The same heir, stood on the old camp's patch, which
is the plainest way to put the camp in front of the eye. Ruling 4's trigger
fires and the camp's region comes back whole at `inherited` - seventeen glyphs
where the un-sighted shot had none - and the inventory panel names the camp's
own axe. Ground the ancestors only walked elsewhere stays unknown.

There is no before for this one. It is new behaviour: before the change the
ground was already dim and there was nothing to hand back.

## A note on the harness

These were re-taken on 2026-09-19. The first set was wrong in a way no
assertion caught: headless Chrome reports no pointer, so `@media (hover: none)`
matched and the phone's 40px touch minimum landed on every control. The zoom
buttons photographed 18 by 40 where a desktop player sees 18 by 16 - tall thin
slots, misaligned with the corner, in every shot. `setEmulatedMedia` is
accepted and does not move those features in this build, so the harness sets
the hover and pointer types at launch (`--blink-settings=primaryHoverType=2,
availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`).

A shot of the desktop page has to be taken with a mouse. Anything photographed
before that flag is a picture of the phone layout wearing the desktop's width.
