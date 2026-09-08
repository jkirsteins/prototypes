# Idle and care intents

## Problem

The scheduler currently invents a forever `wait` intent whenever no queued
work can run. Because `wait` is camp-bound, an idle survivor walks to camp.
At camp, the intent creates repeated one-hour rest tasks. The activity strip
then mistakes those implementation tasks for work with measurable progress.

The same `wait` request is also used as a dummy payload for the permanent
Camp maintenance and Self-care rows. This makes an implementation placeholder
look like a player command and forces UI code to recognize and hide it.

Queue metadata is split between the heading and a second status line. The
result is visually inconsistent: `once` appears beside the title while
`blocked` appears below the controls.

## Rules

1. Doing nothing is represented by no intent and no task.
2. Doing nothing never moves the survivor.
3. Movement happens only as a step of player-requested work or a concrete
   care need.
4. There is no player-facing or internal `wait` task or wait intent.
5. A care row owns a care intent directly. It does not pretend to own work.
6. The activity view model explicitly states whether progress is measurable.
   Rendering never infers progress from the presence of a simulation task.
7. Queue type and state metadata share the title line.
8. The body stat remains named `Wet`. Garment wetness and body wetness remain
   separate simulation reservoirs.

## Intent model

`Intent` becomes a discriminated union of work and care:

- Work intents retain `task`, target cell, camp cell, completion condition,
  delivery behavior, and completion count.
- Care intents contain `mode: "care"`, the owning care row id, the concrete
  care need, the current step text, and optional warmth-at-rest-start state.

Code that needs work-only fields must first establish that the intent is a
work intent. Shared task stepping may update the common current-step text.
The order scheduler, not the work-intent runner, advances care intents.

Old saves containing a wait intent discard that intent during migration. The
scheduler immediately reconstructs any real body or camp need from current
state. No meaningful progress is lost because wait never produced work.

`wait` is removed from `TaskId`, task catalogs, task checks, activity tables,
and the Do panel. The `CARE_REQ` and scheduler `WAIT` constants are removed.

## Idle scheduling

When no queue row can run, `runOrders` clears a completed or stale
scheduler-owned intent and starts nothing. The normal minute loop continues.
`stepPlayer` already treats a null task as resting activity, so weather,
needs, recovery, passive eating and drinking, hazards, and time continue at
the existing idle rates without a fabricated task.

Camp maintenance and Self-care may still start real movement, rest, or sleep
steps when their need model requests those actions. Their care intent names
the row and need responsible for the step.

## Activity presentation

The activity presenter returns either no activity or a record containing:

- title
- current step
- whether a progress bar is meaningful

Plain idleness returns no activity and uses the existing idle flavor text.
Finite work, walking, rest, and sleep may expose progress. A state with no
defined completion does not.

## Queue presentation

Each row title contains compact metadata chips in one place:

- `once` or `standing` for execution mode
- `blocked` in red when that row cannot be reached because the queue stopped

The row that stopped the queue also receives `blocked`; its concrete refusal
reason remains beneath its controls. Rows below it receive only the chip.
The existing queue-level banner names the stopping row and its reason once.

## Wetness

No simulation or stat-name change is made. Garments hold rain first. Body
wetness rises only from rain penetrating the coat and trousers, so it may lag
well behind garment wetness. Hat and boot wetness do not directly contribute
to the body value.

## Verification

Tests should specify that:

- a blocked or empty queue leaves the survivor at the current cell with null
  intent and task;
- no task or action catalog exposes `wait`;
- care movement is attributed to a care intent and still completes;
- idle flavor has no progress bar;
- progress bars are controlled by activity presentation data;
- queue metadata appears on the title line without a duplicate status line;
- old wait intents are cleared on load.

Per the current playtest request, these tests will be updated but not run.
