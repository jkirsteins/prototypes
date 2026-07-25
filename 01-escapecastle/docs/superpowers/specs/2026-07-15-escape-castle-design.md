# Escape Castle Prototype Design

## Goal

Build a small browser-playable prototype for a layered escape-room adventure. The protagonist wakes inside a vampire's castle and must solve physical room puzzles to escape, branch through the castle, and eventually begin a larger journey home.

The prototype should validate the interaction model and puzzle structure, not production polish.

## Tone and Story

The story is literal swashbuckling gothic adventure: Odyssey meets Dracula meets Indiana Jones.

The protagonist has been kidnapped by agents of Count Veyr, an old vampire lord. They wake in Castle Veyr and must escape through practical puzzles, hidden mechanisms, locked passages, gothic hazards, and daring route choices.

The larger arc is a journey home. Escaping the castle is only the first act. Later acts can move through vampire-controlled villages, haunted roads, monasteries, smugglers' crossings, port cities, and a final return home while the vampire's agents pursue the protagonist.

Recommended long-term hook: the protagonist carries or knows about a concrete artifact that Count Veyr needs for a rite. This keeps the story physical and adventure-friendly: the artifact can be hidden, stolen, traded, copied, or used in puzzles.

## Tech Stack

Use a static web app:

- Vite
- TypeScript
- Plain CSS
- No backend
- No database
- No external game engine

This is the simplest stack for sharing with testers while keeping the game data separate from the UI. Rooms, items, verbs, inventory, and action rules should be data-driven enough that new rooms can be added without rewriting the UI.

## UI Model

The UI should simulate a TUI without requiring free typing.

The player interacts through a LucasArts-style parser-lite interface:

- A fixed verb bar with buttons such as `Look at`, `Use`, `Take`, `Open`, `Push`, `Pull`, and `Turn`.
- A main prose pane that describes the current room.
- Interactable nouns highlighted inline in the room description.
- An inventory row where held items are also clickable nouns.
- A command preview/log that prints generated commands such as `> Open wardrobe`.
- A response log that prints the result of each attempted action.

The player clicks a verb, then clicks a highlighted noun. For `Use`, the player can select an item or noun, then a second noun:

`Use` -> `small iron key` -> `wardrobe`

This generates:

`> Use small iron key with wardrobe`

The prototype should not require typed input. It should feel like a parser while avoiding guess-the-word failures.

## Game Structure

The game is organized as layered rooms. Each room defines:

- Description text with highlighted interactable nouns.
- Visible items and hidden items.
- Supported verb-object actions.
- Optional item-object combinations.
- Inventory changes.
- Room exits unlocked by puzzle state.
- Failure responses for plausible but invalid actions.

The first prototype covers:

1. Coffin tutorial room.
2. Guest bedroom escape.
3. Branching corridor with upstairs and downstairs routes.
4. Upstairs roof hatch puzzle.
5. Downstairs basement door tease, locked with no solution yet.

## Layer 0: Coffin Tutorial

The protagonist wakes inside a velvet-lined coffin.

Initial visible nouns:

- `coffin lid`
- `velvet lining`
- `brass plaque`

Revealed nouns:

- `loose nail`
- `hinge`
- `rosary bead`

Puzzle path:

1. `Push coffin lid`: the lid shifts, but catches near the hinge.
2. `Look at velvet lining`: reveals a `loose nail`.
3. `Take loose nail`: adds it to inventory.
4. `Look at brass plaque`: one corner is loose.
5. `Use loose nail with brass plaque`: pries plaque free and adds it to inventory.
6. `Use brass plaque with hinge`: wedges the hinge.
7. `Push coffin lid`: snaps the hinge enough to escape.

The room teaches that nouns can be revealed by inspecting objects, that verbs matter, and that inventory combinations can solve puzzles.

## Layer 1: Guest Bedroom

The protagonist emerges into a locked guest chamber.

Visible nouns:

- `bed`
- `nightstand`
- `mirror`
- `wardrobe`
- `window`
- `locked door`
- `bell pull`

Puzzle path:

1. `Look at mirror`: the mirror shows scratches under the bed.
2. `Look at bed`: reveals a `loose floorboard`.
3. `Open loose floorboard`: finds a `small iron key`.
4. `Use small iron key with wardrobe`: opens the wardrobe.
5. `Look at wardrobe`: finds a `moth-eaten cloak` and `servant note`.
6. `Take cloak`.
7. `Look at servant note`: explains the bell pull releases the corridor latch after midnight.
8. `Pull bell pull`: unlocks the room door.
9. `Open locked door`: exits to the branching corridor.

The small iron key should not open the main room door. This teaches indirect puzzle logic.

## Layer 2A: Upstairs Roof Hatch

The upstairs route leads to a roof hatch sealed by a moon-phase mechanism.

Visible nouns:

- `roof hatch`
- `rusted crank`
- `moon dial`
- `stained glass`
- `chain`
- `cloak`

Puzzle path:

1. `Look at roof hatch`: reveals a moon-phase lock.
2. `Look at stained glass`: moonlight passes through colored panes.
3. `Use cloak with stained glass`: blocks most light except a crescent-shaped tear.
4. `Turn moon dial`: player can cycle or select `new`, `crescent`, `half`, `full`.
5. Set `moon dial` to `crescent`.
6. `Pull chain`: releases the hatch lock.
7. `Open roof hatch`: unlocks access to the roof for a later layer.

## Layer 2B: Downstairs Basement Door

The downstairs route is visible but intentionally blocked in this prototype.

Visible nouns:

- `basement door`
- `keyhole`
- `iron keyring`
- `wine rack`
- `cold draft`

Behavior:

- `Look at basement door`: heavy oak, newer lock, smells of earth and old water.
- `Look at keyhole`: needs a long silver key.
- `Take iron keyring`: fixed to the wall.
- `Use small iron key with basement door`: wrong key.
- `Open basement door`: locked.

There is no way through the basement door in the first prototype.

## Error Handling and Hints

Invalid actions should return short, authored responses rather than generic errors when possible.

Examples:

- `Open coffin lid`: "There is no handle on this side."
- `Use loose nail with coffin lid`: "You scratch the wood, but gain no leverage."
- `Use small iron key with locked door`: "The key turns partway, then stops. It was made for something smaller."

If the player repeats a failed action several times, the game may add a subtle hint, but hints are optional for the first prototype.

## Testing Strategy

Manual testing is enough for the first toy, but the game logic should be structured so a small automated test can run through the golden path:

1. Escape coffin.
2. Escape bedroom.
3. Reach upstairs.
4. Open roof hatch.
5. Confirm basement remains locked.

The most important validation is whether testers understand that verbs are buttons, nouns are highlighted, and combinations are possible.
