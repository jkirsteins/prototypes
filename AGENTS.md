# AGENTS.md

After implementation work is done, verify the app end to end in a real browser with Playwright and confirm the user-facing flow works as expected before reporting completion.

Core game design principle: never create unwinnable stuck/dead-end situations. If progress requires an item from an earlier room, the player must be able to return to that room, or the story must guarantee the item was collected before the one-way transition.
