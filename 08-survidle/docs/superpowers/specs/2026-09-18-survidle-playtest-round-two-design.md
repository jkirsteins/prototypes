# Survidle: playtest round two, the decided items

Six items from the 2026-09-17 playtest (`docs/playtest-2026-09-17.md`,
findings 8, 9, 10, 15, 16 and the walk request) settled with the author
on 2026-09-18, one question at a time. This is what was decided and how
each is built. The opportunity-gated Do pane is the 2026-09-17 spec; this
one is only what that playtest turned up in the body, the queue and the
fire.

## 1. A step with no bar is a stall, and stalls are structural

Finding 15. The body names a step every minute ("opening an ice hole")
and the strip prints the words; the bar is the task under it. When the
task refuses to start the words stay and the bar never comes, and the
survivor stands still, which is how a thirsty body stood beside a brook
until it died.

Decision: verify each step, fall through, and hold the whole thing to an
invariant test.

- `steps.ts` gains `canStart(state, world, cal, step)`: the step is
  already running, or the task's own `check` says it can begin. The body
  only returns a step that can start; a refused step is skipped and the
  need's next fallback is tried (the seep, snow at the fire).
- `serveNeed` no longer keeps a claim it could not start. A care step
  that fails to begin drops the intent and says why once (`warn`, keyed
  by the need, cleared when the step next starts), so the strip never
  prints a step with nothing under it.
- `tests/slow/care-steps-run.test.ts` runs the reference survivor across
  seeds for two days and fails on any run of minutes where a care intent
  stands with no task under it. That is the structural part: every
  future fallback that can refuse is caught by the same test. It costs
  about twenty seconds a seed, so it sits in the slow suite; the two
  clearing rules it found (a claim answered on the spot, a need that
  ended) are units in `tests/bodyorder-claims.test.ts`, which the gate
  runs.

## 2. Thirst under the collapse follows the body, not the latch

Finding 10. Decision, the author's words: if realistically the survivor
could go and address thirst, they should; if realistically they would
collapse despite it, keep the collapse.

The model already says what a spent body can afford. Work drains
`taskDrain(workHours)` an hour and the store clamps at zero; a walk is a
task. So under the collapse the body goes for water when the walk there
costs less energy than it has, and drinks on the spot whenever water is
at hand (that costs the minute nothing). A walk it cannot afford waits
for the rest, exactly as before. Hunger stays under the rest: it kills
slower and the same rule would send a collapsed body on a hunt.

## 3. One rest, to the work line, pre-empted by a higher row

Finding 9. Decision: one task whose bar ends where work resumes, and a
row placed above the body row takes over on the next minute.

The work line is `RESTED_AT` (55) whichever way the rest was entered:
the collapse clears there and the spent need exits there. So a rest
that starts under it lasts the minutes the model says it takes to get
there, piecewise on `ENERGY_RATE.restSpent` below `SLEEP_AT` and
`ENERGY_RATE.rest` above, and the row says so ("to the work line, about
2 h"). A rest that starts above the line is still an hour off the feet.
Pre-emption is what `jumpQueue` already does for a once row placed above
the live one, and `serveBodyMidChunk` for the body's own needs; the rest
is a task like any other and both reach it. The sleep model still ends a
rest when the body lies down.

## 4. A map click walks there and stays

The author's request: a manual walk adds a blocking "wait until
dismissed" row at the top, so the survivor does not leave the cell they
were sent to the moment they arrive; one such row only, and another
click repurposes it and moves it back to the top.

`insertWalkAtTop` already keeps one walk row at the top. It now carries
a new `until` kind, `dismissed`: never met, so the row stays until the
player strikes it off with its x. On arrival the row's minute is a rest
where they stand ("staying here"), so the body is still served (thirst
pre-empts a rest and the row walks them back after), and the list under
it waits, which is the point. The row reads "Walk to the shore, and stay
until struck off", tagged "until struck off" where a once row says
"once". A walk that crosses a region border is adopted onto that
region's list on arrival, since the list read is the region's own.

## 5. The fire has a setting, per fire

Findings 8 and 16. Decision: one three-way choice per fire, the field
fire included, visible for every fire that exists, not only the one
under foot; banking on leaving stays automatic. The camp view in roadmap
item P part 1 is where these live in the end; until it exists they live
on the Camp tab, every camp's fire listed.

`fire.keep` on a region's fire and on the field fire:

- `burning` (default, today's behaviour plus one thing): the camp row
  feeds a lit fire to full, and relights it from its coals when the
  flame goes out, so a fire that died while the survivor was out is back
  the minute they are home.
- `coals`: no feeding while lit; the fire is let down to coals and relit
  only when the coals are about to die, so a kilo a night keeps a pit
  warm enough to rekindle in five minutes.
- `out`: the camp row does nothing for it.

None of the three starts a fire from cold, and the relight ranks under
the snares, waits for daylight, and yields to any want of the body's.
The first cut relit a cold pit whenever the survivor was home by day and
fed it to full from the pile; by bedtime the wood was gone and the sleep
step was splitting logs. The body's own needs (cold, the night, a storm)
and the player's Light row are what light a cold pit; the setting is
maintenance, not survival.

Save files older than the field default to `burning`.

## 6. The recipe target already exists

The 2026-09-07 playtest's pinned target (notes 175 to 179) was built as
"track materials" in every Make and Build row's more block, with the
Shopping list panel under Opportunities, place cues in Places and a find
button that filters the Do pane. The author's round-two answer asked for
exactly that shape. What was missing was a door from a make or build
goal on the opportunity card, which now offers the same button. Only a
revealed row can be tracked, which follows from the Do pane's gating.
