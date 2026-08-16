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

## Stage 2, tasks 4-6: what those five pieces left open

- **A multi-hop arrow's GEOMETRY is still the strait's.** The dashed casing
  (`.march-overland`) says an army is walking overland rather than crossing
  water, and that was the cheap half. What was not done is the arrow's
  placement: `straitCrossing` still puts it midway between the two lands'
  nearest vertices with `gap / 2 + seaClearance` either side, so a long march
  FLOATS between two coasts instead of being rooted in the land it sets out
  from and the land it is headed for. The honest fix is an `overlandCrossing`
  measuring `reach` into both ends, which is real geometry work and was judged
  not worth the risk without a review round behind it.
- **`chipTextFor` can produce a long chip.** "2nd - clash - lands in 3" is 24
  characters, about a 146-unit badge behind a tail. Nothing was seen colliding
  in the browser pass, but that combination was not constructed - it needs a
  clash and a three-hop arrow on one border.
- **The travel discount is unmeasured, and 0.6 is a guess.** `TRAVEL_DISCOUNT`
  in `src/ai.ts` was picked for its shape (a three-hop blow keeps about a third
  of its worth), not from a run of the balance suite. It is the one dial, and
  it is the obvious thing to move if the AI now looks too parochial.
- **The discount reads the tail the policy picked, and that pick is unchanged.**
  `marchSourceFor` still sorts sources by highest defense with no distance
  term, so the AI can choose a three-hop tail when a one-hop tail exists and
  then discount the TARGET for a walk it chose. Discounting the target is
  right; not preferring the nearer tail may not be. Deliberately out of scope -
  the source rule is about surviving a counter-raid and moving it is its own
  question.
- **Mid-flight cancellation removed with no browser pass on the long case.** A
  march is now judged only at declaration and arrival, which is covered by
  three tests through the real capture routes. What was not watched in a
  browser is a three-hop arrow surviving an allegiance change and lapsing on
  landing, with the beat and the log line that go with it.
- **Card prose says "up to three".** `MAX_MARCH_HOPS` is spelled in words in
  Raid's and Strong raid's text rather than interpolated, per the rule against
  interpolating into player-facing strings. Nothing fails if the constant
  moves; the text would simply be wrong again.

## The one thing a playtest should look at first

Whether rear lands are worth anything. A three-hop march spends its source's
defense at declaration and leaves it soft for three turns, and since stage 1 a
land below its own independence gate for three turns may free itself. If the
defender simply out-heals every long arrow, rear lands are pure economy and the
travel-time stage bought nothing - which the spec names in advance as the most
likely way the numbers are wrong.

# Gauntlet loop, Batch A (the engine)

`GameState.gauntlet` and the duel scoping ship on their own, ahead of the
modal that raises the pick. Everything below is unverified rather than
unfinished, and the reviews for this stage were skipped for time.

## Nothing in the app reaches it yet, and that is on purpose

No surface answers the pick, so a shipped run sits at `{ kind: "picking" }`
for its whole length and the turn loop is unscoped - which is the game
exactly as it was. Batch B is what makes any of this visible. Read a green
`npm test` as "the engine cannot hang", not as "the loop works".

## Unverified

- **No browser pass.** Nothing on screen changed, so there was nothing to
  look at; the first real pass belongs to Batch B's modal.
- **Balance unmeasured**, per the standing rule. A duel gives the two sides
  a turn each round and everybody else none, so every pacing band the
  scenario suite pins is certainly moved. Nobody has looked.
- **A duel does not restrict TARGETS, only turns.** During a duel the player
  may still raid, sicken or subjugate a third party - it just cannot answer.
  Taking a third party's land does not end the duel, which is right by the
  rule as written but has never been played.
- **The grey middle still raids during a duel.** A restless raid fires off
  `keeps-to-itself` at the round wrap rather than off a turn, so quiet lands
  go on picking fights while two realms duel. Deliberate - the alternative is
  a second rule about the gauntlet living in `src/passives.ts` - but "the
  world stands still" is not literally true and a playtest should say whether
  it reads as noise.
- **A third party can still take a land at the wrap.** Its arrows are landed
  by the dormant sweep, and it keeps its chief, so an arrow declared before
  the duel can capture during one. That is how the enemy can stop existing
  mid-duel. The clock is the backstop and the sweep proves it is reachable,
  but no run was watched hitting it.
- **Declining costs nothing extra today.** `declineDuel` moves to
  `world-tick`, but `picking` is unscoped as well, so at the engine level
  declining and leaving the offer alone spend the same round. If declining is
  meant to cost something the player can feel, Batch B has to say what.

## Seams left for Batch B

`pickDuel` and `declineDuel` in `src/game.ts` are the two engine doors, both
identity-return on refusal, which is what `commitDecision` reads as
`RULES_REFUSED`. `DUEL_TURNS` and `duelCandidates` are in `src/gauntlet.ts`.
There is no `NetAction` and no `Decision` for either yet, and no boot param -
a `duel=` key would be the cheap way to boot straight into a scoped board.
