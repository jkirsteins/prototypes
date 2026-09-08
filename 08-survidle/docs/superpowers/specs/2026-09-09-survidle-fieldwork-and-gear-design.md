# Survidle: fieldwork, active gear, and speed history

## Purpose

Movement into unknown country must be possible directly from the map. Automated
exploration must do useful fieldwork rather than only paint cells. A lit torch
must read as an equipped, finite item rather than vanish from inventory. The
weather footer should retain a small visual history of changes in game speed.

This design replaces the interactive controls formerly emitted inside the map's
hover tooltip. A hover surface remains informational. Actions live on the map or
in the Do pane.

## 1. Manual movement and the frontier

The map is the primary control for exact movement.

- Clicking known ground inserts an explicit walk to that exact cell at the top
  of the activity queue.
- A frontier cell is an unknown passable cell touching known ground.
- Clicking a reachable frontier cell routes across known ground to its known
  edge, takes the final step into the frontier cell, and stops there.
- The final unknown step is permitted even though ordinary routing still
  refuses unknown cells. It does not permit a route through further unknown
  ground.
- Clicking unknown ground beyond the frontier only inspects it. It starts no
  movement.
- Entering another region names and visits it through the existing
  `enterRegion` path. `seeFrom` then reveals whatever the survivor can see.
- Touch retains its inspect-first behavior. The second deliberate activation
  starts the same exact walk.

This makes manual exploration a sequence of visible, exact decisions. It keeps
the important rule that the survivor cannot plan a route through unseen ground.

Hover tooltips contain facts only. Region-level `Explore` and `Go to` buttons
are removed from them. The Places box remains a list of known named places with
route estimates, not a second exploration interface.

## 2. Explore as a Wayfinding action

Add an `Explore` subtab to Do. Its Wayfinding purpose contains:

- `Survey <region>` for the current incomplete region and named adjacent
  incomplete regions that have a reachable frontier.
- `Search for a way home` only when no known route to camp exists.

Exploration and searching remain player-started, one-time work. They cannot be
standing orders and the unattended runner never starts them.

`Survey <region>` is one activity queue item. It owns an internal sequence of
real sub-actions. Sub-actions do not become separate queue rows. The central
activity strip shows the active phase using its gerund, for example:

- `walking the ridge`
- `reading the water`
- `surveying Orrelia`

The survey planner repeatedly chooses a reachable vantage that reveals useful
unknown ground. Ordinary walking and sight rules remain the source of movement,
time, weather risk, injury, and revealed cells. Survey walking trains
Wayfinding exactly once. It does not also train ordinary walking.

## 3. Real fieldwork during a survey

A survey records named spots and cell possibilities by seeing their cells. This
needs no duplicate persisted metadata: routes, tree ground, seep possibilities,
shelter possibilities, and named spots are derived from known cells and existing
world state.

Water is different because `Read water` creates a survivor observation. The
survey therefore performs the real `read` task as a sub-action.

- Water cells are grouped into distinct connected water systems touching the
  region.
- The planner selects one reachable representative shore for each system.
- At that shore it runs the existing `read` task for its normal 60 minutes.
- The sub-action uses the real legality check and completion path.
- Its minutes train Fishing and `read` mastery, not Wayfinding.
- Its log entry and observation are the same as a manually started read.
- The central strip says `reading the water` while it runs.

Mapping may finish when a water system is temporarily unreadable, such as water
under ice. The survey reports that system as unread rather than blocking forever.
A later survey or manual Read water can complete it. Permanent or current
failure reasons are never bypassed.

A survey is complete when no reachable vantage can reveal more ground and every
currently readable water system has been read. The completion summary is
derived from the known map and observations. It does not create another region
inventory.

Stopping the survey stops its current sub-action and leaves the survivor where
they stand. Revealed cells and completed water observations remain.

## 4. Torch as active equipment

Lighting a fresh torch removes one unused torch from the reachable inventory and
creates the equipped torch with 60 minutes of fuel, as today. The equipped torch
continues to count as 0.4 kg of carried weight.

The equipped torch has two states:

- Lit: fuel decreases every game minute.
- Out: fuel is preserved.

`put out` is immediate. `relight` consumes no second torch. It uses the existing
lighting sources and costs:

- 1 minute at a lit fire.
- 10 minutes with a fire drill, including normal tool wear.

When fuel reaches zero, the equipped torch disappears. A partly burned torch
stays equipped while out; it is not merged into the stack of unused torches,
because the count inventory cannot represent different remaining fuel values.

The Gear pane shows:

1. Active equipment
2. Worn clothing
3. Tools

For the torch, active equipment reads `Torch - lit, 43 min` or
`Torch - out, 43 min`, with a fuel bar and the applicable `put out` or `relight`
control. An unavailable relight control gives the normal concise reason.

The map inventory overlay uses the same active-equipment presenter, but only for
equipped items with a changing duration or capacity. It shows a compact line and
microbar, such as `Torch: lit, 43 min`. It does not repeat ordinary clothing or
tools. Empty active equipment produces no row.

This presenter is generic enough for a future lantern, loaded weapon, battery,
or other equipped item with fuel, charge, ammunition, or durability in active
use.

## 5. Gear pane

Add `Gear` immediately after `Inventory` in the pane tabs. Move the existing
Worn and Tools content from the left sidebar into it. Remove the old sidebar
Gear panel rather than rendering the same information twice.

The left sidebar keeps survival status, the away forecast, and skills. Moving
gear gives those permanent status panels more vertical room.

The Gear pane is remembered by the existing pane preference. Old stored pane
state remains valid.

## 6. Speed history

The weather footer keeps its region name and live `1 s = X game min` value. A
faint 60-second rate history is drawn behind them.

- Horizontal position is real time, oldest on the left.
- Vertical position is the effective rate from 1x at the bottom to 6x at the
  top.
- The trace is a stepped, translucent area using the existing accent color.
- Older samples fade toward the left.
- The foreground text remains fully legible.
- History is UI-only, is not saved, and resets on reload or a new world.
- Reduced-motion mode disables visual interpolation but still shows samples.

The UI state owns a fixed-size ring buffer sampled at a modest cadence. A direct
DOM updater changes the SVG path and live point. It does not rebuild the weather
panel on every animation frame.

## 7. Data and component boundaries

- Known-route code remains strict. A dedicated frontier-route function owns the
  one permitted unknown final step.
- The survey planner decides the next vantage or water sub-action.
- Existing walk and read task implementations execute those sub-actions.
- The survey task owns only orchestration state: target region, visited
  vantages, water systems handled, and current phase.
- Skill credit comes from the executing sub-action. The orchestrator never
  duplicates it.
- A shared active-equipment view model supplies Gear and the map overlay.
- Speed history remains entirely in `UiState` and UI modules.

Save migration extends the existing torch record without changing unused torch
inventory. Existing saves with `{ lit, minutes }` remain valid. Survey
orchestration state must serialize through the existing task record so a reload
continues the same phase.

## 8. Verification

Tests must cover:

- A known-cell click still targets that exact cell.
- A reachable frontier click takes exactly one unknown step and stops.
- A non-frontier unknown click does not move.
- Crossing the border names the new region and reveals sight from the entered
  cell.
- Survey is visible under Explore and never available as a standing order.
- Survey walks real routes and retains partial knowledge when stopped.
- Each connected water system is read once through the real task.
- Read sub-actions consume 60 minutes and credit Fishing/read mastery without
  Wayfinding double credit.
- Ice-blocked water is reported unread and does not deadlock the survey.
- The central activity gerund follows the active sub-action.
- Lit and extinguished torches preserve the correct fuel and carried weight.
- Relighting uses the correct source, duration, tool wear, and no new torch.
- Gear and the map overlay share active-equipment values without duplicating
  ordinary gear.
- Gear replaces the sidebar panel and persists as a selected pane.
- The speed history keeps 60 seconds, represents 1x and 6x correctly, resets at
  the right boundaries, and does not rebuild the weather panel per sample.

The full fast suite and production build remain the commit gate. Browser review
must check the map at mouse and touch widths, the Gear pane with and without an
active torch, and the weather footer through a complete manual speed pulse.
