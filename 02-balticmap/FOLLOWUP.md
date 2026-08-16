# Follow-up: what was skipped to get the run-structure refactor down

Written while building the refactor on `feature/run-structure`. Everything here
is a check that WOULD have been run under the normal process and was not, or a
known-false thing left standing. Nothing here is speculative - each item names
what is unverified and what it would cost to be wrong.

## Unmeasured balance, all of it

`npm run balance` has not been run against ANY of this work, and the repo rule
is that balance evidence is produced on demand. The pre-refactor baseline is
still reproducible: main is a fixed commit, so the suite can be run at that SHA
whenever somebody wants the naive-versus-competent gap to compare against.

Specific dials that moved and were never measured:

- **`greatRaidPick` routed through `validTargetsFor`** (stage 1). This WIDENED
  the AI's candidate set by 5,960 (actor, target) pairs against 15,111 removed,
  because `attackReach` includes the actor's own vassals and grand-vassals.
- **The sideways refusal** (stage 1). 138,702 pairs refused across a 468-run
  sweep that the old predicate allowed.
- **`autoTransfer` capped at one under the independence gate** (stage 1b). AI
  conquests now garrison thinner than they did. Intended, unmeasured.
- **Plague waste** (stage 1). A refused polygon keeps its stacks, so a vassal
  can bank stacks it can never burn.
- **Three-hop marches and the AI's distance discount** (stage 2). The reach of
  every attacking seat roughly tripled.

The playtest measured a median vassalage of 4 turns and that a realm reaching
76% of the win bar collapsed to 23% uncontested. That is the number most likely
to want tuning, and tuning it without the balance suite is guessing.

## Skipped review rounds

Stage 1 and stage 1b had a per-task review and a whole-branch review. From
stage 2 task 4 onward the per-task reviews were dropped for speed. What that
costs, concretely, is the class of finding those reviews actually produced on
this branch - each of these was found by a reviewer and none by a test:

- A freeze that hung the game, reachable in about one seeded run in ten.
- A `resolveMarches` bug where an actor's own second arrow at one target landed
  a turn early, found by probing rather than reading.
- A player-facing keyword text that told the player two refused things were
  legal targets.
- A uniqueness test that passed with the behaviour it named deleted.
- Four hand-rolled copies of one question, one of which overstated damage to
  the player on the hover.

So: the highest-value thing to do on top of this work is a whole-branch review
of everything from stage 2 task 4 onward, with the instruction to verify claims
by probing rather than reading.

## Known-false or unverified things left standing

- **A multi-hop arrow renders as a sea crossing.** `crossingBetween` sets
  `sea: true` for any pair sharing no vertex, and every 2-3 hop pair is one.
  Nothing breaks; the picture lies about why the arrow spans.
- **The human-seat freeze is untested.** `endTurn` refuses an unplayed standard
  turn for everybody, so a person whose every card is legal-in-hand but
  un-aimable would hit the same refusal the AI guard now covers, and the guard
  does nothing for them. Unproven, unrecoverable if real, nothing persisted.
- **`cardRulesHash` does not cover legality.** A card's targeting can change
  without the wire fingerprint moving, because the rule lives in
  `src/playability.ts`, which is in no `CARD_RULES` table. It moved on this
  branch only because a keyword's TEXT happens to be hashed. The honest fix is
  to scope the `CLAUDE.md` sentence or fold the legality module into the hash.
- **`marchReachFrom` runs one bounded BFS per candidate land** where one BFS
  from the source would collect the whole ring. Right answer, wrong shape, no
  measured regression at 26 lands.
- **A stale conquest question on the `?turns=` boot path**, and `Run time - 0s`
  on a booted postmortem. Both seen in the stage 1 playtest.
- **Root `npm run lint` is broken for everyone** whenever a sibling
  `.claude/worktrees/*` exists, because the root `biome.json` does not ignore
  `**/.claude/worktrees/**`. Not caused by this work; noticed by it.

## The one thing a playtest should look at first

Whether rear lands are worth anything. A three-hop march spends its source's
defense at declaration and leaves it soft for three turns, and since stage 1 a
land below its own independence gate for three turns may free itself. If the
defender simply out-heals every long arrow, rear lands are pure economy and the
travel-time stage bought nothing - which the spec names in advance as the most
likely way the numbers are wrong.
