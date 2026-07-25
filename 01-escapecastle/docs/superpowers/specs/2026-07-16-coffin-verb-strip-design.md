# Coffin Scene on the Verb Strip Design

Date: 2026-07-16

## Goal

Refactor the coffin scene to use the room interaction system (spotted
objects + look/use verb strip) introduced for the cell room. Verb+object
actions move to the strip; ink choices remain only for actions with no
object to point at or whose meaning lives in manner or intention. The
strip becomes visible from the very start of the game.

## Action mapping

| Current ink choice | Becomes |
|---|---|
| Feel along the velvet. | `look lining` - spots the nail |
| Work the loose nail free. | `use nail` - moves nail to inventory |
| Think about the loose nail. | `look nail` while spotted; a carried variant line once taken |
| Force the hinge with the nail. | `use hinge` - gated on `inventory ? nail`; without the nail, in-fiction "fingers find no purchase" flavor |
| Push against the wood above you. | stays ink (meaning lives in escalating manner; fifth push escapes) |
| Call for help. / Call out anyway. | stays ink (no object) |
| Trace where the wood resists. | stays ink; its payoff becomes `~ spotted += hinge` |
| Remember why calling out felt dangerous. | stays ink (internal memory) |

## Spotting

- The scene opens with only `lining` spotted (`~ spotted += lining` in
  `start`), so the strip appears from the first beat.
- The opening prose is adjusted to match: the velvet stays named, the
  wood above stays (the push choice targets it), and the brass plate
  mention moves out of the opening. The plate surfaces in the
  trace-choice text where the hinge hides behind its edge, so the player
  is never shown a named object the strip does not carry.
- `look lining` spots the nail. The trace ink choice spots the hinge.
- On `lid_open`, coffin-local spotted entries are cleared
  (`~ spotted -= (lining, nail, hinge)`) so stale coffin objects never
  linger in the cell-room strip. A carried nail stays in inventory and
  rides into the cell room.

## Ink changes (`src/ink/coffin.ink`)

- LIST `items` gains `lining, nail, hinge`.
- New `VAR current_room = "coffin"`; set to `"cell"` on entering
  `cell_room`.
- New knot `room_return` that diverts to `coffin_loop` or
  `cell_room_loop` based on `current_room`. Every interact stitch and
  `interact_fallback` divert to `room_return` instead of hard-coding
  `cell_room_loop`.
- New dispatcher lines and stitches:
  - `look_lining`: tactile prose (it is dark; "look" reads as attending
    by touch), `~ spotted += nail`, keeps `# image:coffin-lining`.
  - `look_nail`: spotted-not-taken variant carries the current "only
    thing in here not made to hold you" thought; carried variant is a
    short line about the nail in your fist. `# image:coffin-nail`.
  - `use_nail`: if spotted, works it free (`~ spotted -= nail`,
    `~ inventory += nail`); if already carried, flavor.
    `# image:coffin-nail`.
  - `look_hinge`: short authored line. `# image:coffin-hinge`.
  - `use_hinge`: `{ inventory ? nail: ... }` - success keeps the current
    escape beat (sets `escaped`, `build = "ingenious"`,
    `~ ingenuity += 2`) and diverts to `lid_open`; failure prints
    fingers-find-no-purchase flavor. `# image:coffin-hinge`.
- Removed ink choices: "Feel along the velvet.", "Work the loose nail
  free.", "Think about the loose nail.", "Force the hinge with the
  nail."
- Flag cleanup: `lining_seen`, `nail_seen`, `nail_taken` are removed;
  conditions use spotted/inventory membership instead (`start` flavor
  uses `inventory ? nail`). `hinge_seen`, `push_count`, `call_count`,
  `unsafe_memory` stay.
- The trace choice keeps its gating (hidden once the hinge is known) via
  `hinge_seen`.

## TS layer

- No changes to `coffinScene.ts` or `main.ts`: the strip already renders
  whenever spotted or inventory is non-empty, and the discovered-item
  guard already blocks interaction with unspotted items.
- `src/itemLabels.ts` gains labels: `lining` -> "velvet", `nail` ->
  "nail", `hinge` -> "hinge".

## Tests (`src/ink/coffinScene.test.ts`)

- Ingenious path switches from ink choices to `interact()` calls:
  `look lining` spots nail -> `use nail` moves it to inventory ->
  trace choice spots hinge -> `use hinge` escapes with
  `build === "ingenious"`.
- `use hinge` without the nail: in-fiction failure, not escaped.
- Unauthored coffin combo (e.g. `use lining`): fallback prose and the
  story returns to the coffin loop (push/call choices still present),
  not the cell-room loop.
- After stepping into the room, spotted contains no coffin objects; a
  carried nail is still in inventory.
- Fiction guard (word-boundary checks) covers all new prose; opening
  prose no longer names the brass plate.
- Strength-path and cell-room tests updated only where they previously
  drove the removed ink choices.

## Verification

- `npm test` passes (recompiles ink first).
- Playwright in a real browser: from game start confirm the strip shows
  "velvet"; click through look lining -> use nail -> trace choice ->
  use hinge to escape; step into the room and confirm the strip carries
  the nail and no coffin objects; also confirm the strength path (five
  pushes) still works from the ink list.

## Non-goals

- No new coffin objects beyond lining/nail/hinge (lid and plate stay
  out of the strip; their actions remain ink choices).
- No changes to cell-room content beyond the shared `room_return`
  refactor.
- No save/load, no verb changes (look/use only).
