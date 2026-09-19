# The two views

Roadmap item P, part 1: a top-level switch between the survivor and the camp.

Taken with `scripts/heir-map-shots.mjs`, which loads a save into the ordinary
application and presses the real switch. The save is `scripts/heir-save.ts
--away`: one survivor, two days, a camp of their own, walked to the far side
of their region. The counts beside each are the board model's own.

| | in sight | walked | fog |
| --- | ---: | ---: | ---: |
| `survivor-view` | 162 | 41 | 1853 |
| `camp-view` | 170 | 49 | 1991 |

## `survivor-view.png`

The page as it has always been. The board is centred on the survivor, and the
Do pane offers Gather, Hunt and Explore.

## `camp-view.png`

The same save, one click later. The board is held on the camp - the green `x`
in the middle - while the survivor stands at the bottom edge of it, and the
Do pane now offers Camp and Build.

Which camp is being shown is captioned on the board, under the carried line.
It began beside the two buttons and read as a third tab, which is the
tester's "visually it seems to blur together" (playtest 2026-09-19, note 140)
earned in a single change. The switch is two buttons; the caption belongs on
the thing it describes.

**What this shot also shows, and it is a finding rather than a defect.** The
pane reads "Fire 0 / nothing here yet". Camp view offers camp work, but most
camp rows are gated on standing at the camp, so a survivor two kilometres away
has nothing to give it. Camp view is a place to look from before it is a place
to plan from; what would make it the second is item P part 2's placed
improvements - a build ordered onto a cell rather than started where you
stand. Worth deciding before the next tester round, because "a view with
nothing in it" is the empty-panel opening `panes.ts` already has one scar from.

## `camp-view-unfound.png`

An heir's camp view before they have found the old camp: the board moves to
where the camp is and draws fog, because the country is not theirs to read
yet (roadmap Q ruling 1). Correct, and worth keeping in mind - camp view is
empty for exactly as long as the walk home takes.
