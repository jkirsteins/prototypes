# A natural wildlife encounter

Open [seed 19](http://127.0.0.1:5173/prototypes/08/?seed=19) with the
prototype's dev server running. The same `?seed=19` works on a deployed build.
Reloading this seeded URL starts the world over.

1. Keep the first survivor, **Egle Jankauskaite**, and click **Land**.
2. Click **Begin**, then **Continue** on the Goals dialog.
3. At the default map zoom, find `@`. A `d` stands in the immediately adjacent
   cell to its left, on rock. This is a naturally generated roe deer herd.
4. Click that `d` soon after the map opens, around **08:01** on the clock.
   This orders an ordinary **300 m walk west**. Let the walk run; its normal
   automatic speed-up applies.
5. Watch for `!` and departure, then open **Log** to read the lasting record.

The verified browser run clicked at 08:01.14 and perceived the departure at
08:07.20, after about **224 m** of walking. It showed one heard `!` and logged:

> Hooves crash away over the rocks.

The initial animal is repeatable. A particular startle, its exact time, and
whether it is seen, heard, or unperceived are **not guaranteed**. The ordinary
simulation keeps running while you inspect the map, and animals move every
ten game minutes. If the herd has already moved, reload the URL and repeat.
Do not expect every approach to produce a marker or a log entry.

No animal, terrain, weather, detection roll, or player position is changed for
this playthrough. It uses normal generation, the landing screens, and mouse
clicks. There are no development-console steps.

## What was verified

On 9 September 2026, a production build was played in headless Chrome with
the default clock speed. The first survivor landed at Orreholt. Before the
walk, the adjacent herd was visible and had no escape episode or startle log.
After the map click, the herd fled and the live DOM contained one
`wildlife-startle heard` marker with the matching log entry. The 300 m walk
completed. No page exceptions were recorded.

Evidence: [initial deer](natural-wildlife-shots/initial.jpg),
[ordinary walk order](natural-wildlife-shots/walking.jpg),
[departure in the Log](natural-wildlife-shots/log.png), and
[live marker and log snapshot](natural-wildlife-shots/event.json).
The images came from normal browser screenshots and a screen recording;
the JSON is a read-only observation of the live game.

The replay traces the actual production sequence: `newWorld`, `land`, then
the first detailed `advance`. That update consumes the weather RNG before
activating wildlife and immediately runs the initial wildlife movement tick.
Calling `activateWildlife` directly with the initial seed gives different
positions and cannot establish a playable URL seed. Walking also includes
the normal `advanceHurry` clock envelope.

What would look wrong: no adjacent deer immediately after this landing, a
marker before the walk, duplicate markers or log entries for one escape,
an animal moving through water, or a heard-only marker disclosing a new
identity or route.
