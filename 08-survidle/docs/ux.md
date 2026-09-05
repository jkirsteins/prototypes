# Survidle: the UI rules

The rules every browser pass checks against, from the UI pass's spec
(section 5 of `docs/superpowers/specs/2026-09-05-survidle-ui-pass-design.md`).
Nothing here is a test; a browser pass reads the page and confirms each
rule by eye.

## Nothing off the screen at 1440 by 900

The check-in - the bars, Doing with the order list, Ahead and the log's
first lines - must be visible without scrolling the body. A browser pass
checks this by loading the page at 1440 by 900, taking a screenshot or
reading the DOM's positions, and confirming `#task`, `#forecast`, and
the top of `#log` sit inside the first screenful. Scrolling inside a
column (the Do panel's own box, a column that runs the viewport's
height) does not count as the body scrolling.

## A list past a dozen rows has a fold and a filter

Any list that can grow past about a dozen rows - the Do panel's groups
are the one today - needs a fold that remembers its state and a filter
that narrows by label. A browser pass checks this by counting a group's
rows past a reload (the fold state round-trips through local storage)
and by typing into the filter box and confirming rows outside the match
disappear along with any group left empty.

## The check-in fits above the fold

"Above the fold" means the first screenful at 1440 by 900, the same
screenful the first rule names. A browser pass checks this the same way:
the check-in's pieces are all inside that first screenful, not merely
present somewhere on the page.

## A Do row is two lines with its bar

A row reads as a label line and a small-print line, plus the progress
bar when the task is running. A browser pass checks this by reading a
row's rendered height against its two text lines and bar, and flags a
row that wraps to three lines or drops the bar while running.

## Buttons reachable by thumb at 390 wide

Under the phone breakpoint, buttons and inputs are large enough to hit
with a thumb: at least 40 pixels tall, per the `@media (hover: none)`
rule. A browser pass checks this at 390 wide by measuring a button's
box, and confirms nothing needed for a check-in sits outside a scroll
container a thumb cannot reach.

## Every browser pass runs at both widths and says so

From this page onward, a browser pass is not done at one width. It runs
the page at 1440 by 900 and again at 390 wide, and its record - the
Built paragraph, or wherever the pass is written up - names both widths
it ran at. A pass that only ran one width has not checked this page.
