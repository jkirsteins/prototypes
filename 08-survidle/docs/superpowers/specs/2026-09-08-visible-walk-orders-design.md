# Visible Walk Orders

## Goal

Walking is an action, not hidden orchestration inside another action. Every
walk within the current region uses the same ranked activity queue, lifecycle,
progress display, interruption rules, and controls as other actions.

The queue remains the single answer to "what happens next?" The activity strip
remains the single answer to "what is happening now?"

## Why this simplifies the architecture

Today a work intent owns a target cell and privately starts a walk task when
the survivor is elsewhere. `walkTo`, `workStep`, care service, and direct map
clicks therefore start and preserve movement through different paths.

The replacement has one path:

1. A row determines that it needs the survivor at another cell.
2. It inserts an ordinary once-only Walk row immediately before itself.
3. The scheduler runs that Walk row normally.
4. The Walk row completes and disappears normally.
5. The original row is judged again from the new cell.

This removes hidden walk substeps from work and care intents. It replaces
several ownership and preservation rules with one queue operation: ensure the
required cell is reached first.

## Queue behavior

### Direct map walks

Clicking a known cell creates a once-only `Walk to <place>` row at the top of
the queue, just like another explicit once action. It does not start a raw task
outside the queue.

The row is visible, movable, removable, blockable, and interruptible by the
same rules as every other row. While it runs, the central activity strip shows
its progress.

### Walks required by another row

When a work or care row is ready but requires another cell, the scheduler
inserts a once-only Walk row directly before that row. The inserted row carries
an exact cell target, not a named place that can resolve differently later.

Examples include:

- walking to suitable forest before felling;
- walking to usable water before fishing;
- walking to camp to deliver a load;
- walking back to the work cell for another load;
- walking to a material pile while preparing a build;
- walking home for a concrete body need;
- walking to snares for camp maintenance.

The requesting row does not remain live while the Walk row runs. Once the Walk
row is gone, the requesting row re-evaluates the world normally. No parent-child
execution state is required.

### Moving or removing generated walks

Generated Walk rows are ordinary rows. The player may move or remove them.

If the requesting row later becomes eligible while the survivor is still in
the wrong cell, it inserts a new Walk row immediately before itself. This is a
direct consequence of re-evaluating prerequisites, not a restoration special
case.

Only one matching Walk row may be inserted directly before a requesting row.
Repeated scheduler reads must be idempotent and must not accumulate duplicate
walks.

## Targeting

The requesting action resolves its usable cell before creating the Walk row.
The existing targeting conventions remain:

- an explicit map cell stays exact;
- an action using `nearest` selects the nearest reachable usable cell;
- a named explicit target stays exact when compatible;
- if an action's rules permit fallback from an incompatible named target, the
  fallback resolves before the exact Walk row is created.

The Walk row stores the resulting cell. Completion means reaching that cell.

If the route becomes impossible before or during the walk, the Walk row becomes
blocked or stops with the same route reason currently used by walking. The
requesting row remains in the queue and may generate a new walk only after its
own targeting produces a reachable destination.

## Execution model

`walk` becomes a valid work-order task. A once Walk order starts the existing
walk task and credits its completion to the order. The ordinary job cleanup
then removes the completed row.

The scheduler gains one materialization result for a ready row: it may either
start the row here or insert a Walk row to the required cell. Rendering and dry
judgement never insert rows; only the minute-owning scheduler mutates the list.

Work intents no longer call `walkTo`. Delivery and material-fetch logic return
a required cell to the scheduler instead of starting movement themselves.
Care logic does the same when `bodyStep` asks for a walk. Non-movement care
steps continue to use care intents.

Region travel, exploration, and searching for a route home remain outside this
change. They can cross queue boundaries or discover their destination while
running, unlike a walk to an exact known cell within the current region.

## UI

The inserted Walk row is visible in normal queue rank. It uses the same `once`
and `blocked` metadata placement as other rows.

The active Walk row is highlighted normally. Its progress bar appears in the
central activity strip through the same activity model as every other active
task. The queue does not add a second progress bar.

The requesting row remains visible immediately below the generated Walk row,
so the reason for the movement is apparent from sequence without an extra
explanation label.

## Save migration

Existing saves with a work intent currently walking keep their destination by
becoming a once Walk row followed by their original work row. A raw direct walk
becomes a once Walk row using its route target.

Other live work intents remain valid. The migration is limited to movement in
progress and does not reorder unrelated rows.

## Invariants

- No work intent or care intent starts a walk task directly.
- A same-region walk always has a visible queue row.
- Direct and generated walks share one task and order lifecycle.
- Rendering and judgement never mutate the queue.
- Inserting prerequisites is idempotent.
- Removing a prerequisite does not remove or silently retarget its requesting
  action.
- An exact map destination is never replaced by a nearest compatible cell.
- Idle still means no intent and no task.

## Verification

Tests should cover direct map walks, generated outward walks, delivery walks,
return walks, build-fetch walks, body and camp care walks, removal and
regeneration, reordering, blocked routes, save migration, and the absence of
hidden walk tasks.

Per the current playtest request, implementation verification will be limited
to static inspection unless the user later asks to run tests or builds.
