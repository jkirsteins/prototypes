# AGENTS.md

After implementation work is done, verify the app end to end in a real browser with Playwright and confirm the user-facing flow works as expected before reporting completion.

## Game design principles

- Never create unwinnable stuck/dead-end situations. If progress requires an item from an earlier room, the player must be able to return to that room, or the story must guarantee the item was collected before the one-way transition.
- Show, don't tell. Describe what the player character senses; never name what they have not learned in-fiction. The player does not know where they are unless the story has revealed it (e.g. the opening scene never uses the word "coffin").
- Never break the fiction. No meta language in player-facing text: no "tutorial", no announcements like "BUILD SET:", "CLUE FOUND:", "ITEM GAINED:", "MEMORY GAINED:", "DEDUCTION:". State changes happen silently; the prose carries the meaning.
- Minimal UI. No boxes, borders, panels, or button-styled controls in the player-facing UI. Narrative text and plain selectable text choices are rendered over a full-screen scene background image, with at most a soft gradient scrim for legibility.
- Mechanics stay hidden. Stats, builds, and flags are tracked internally and never shown to the player.
- Debug affordances must be unmistakably labeled as debug (e.g. "DEBUG - not player-facing, remove before release") and easy to remove later. They are the only place mechanics may be displayed.
