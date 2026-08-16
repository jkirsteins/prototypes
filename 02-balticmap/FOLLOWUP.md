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

## Batch B: the pick, the reward and the screen (2026-08-16)

`rewardFor`, the `pick-duel` decision, the offer modal and the lock ship
together. `npm test` (59 files, 1607) and `npm run build` are green, the
stuck-seat sweep is zero in both modes, and `npx biome lint` is clean. What
is NOT verified:

- **No browser pass.** Every claim below about how the loop READS is a claim
  about code, not about a run somebody watched. In particular: whether the
  offer modal arriving at every human turn start between duels is welcome or
  a nag, and whether the world tick is legible at the beat counts stage 1
  measured. That is Batch C's C3.
- **Balance unmeasured**, per the standing rule. The three reward sizes -
  1 growth, 2 defense, 3 wealth - are chosen for legibility rather than
  measured, and `BIG_LAND_SITES = 4` was picked off the two maps' site
  histograms (4 of 26 lands on the Baltic, 5 of 24 on Iberia) rather than off
  play. `npm run balance` has not been run against any of it.
- **The spoils always come HOME.** Growth and defense land on the human's own
  faction polygon, whichever of the enemy's lands actually fell. That is
  deliberate - the promise is made against the enemy before an arrow is sent,
  and the land that falls may be a grand-vassal nobody aimed at - but it does
  mean a wide realm always improves the same land. If that reads as a shrine
  rather than a reward, the fix is to let the player choose the land, which is
  another modal.
- **Growth on a land already at its ceiling logs `amount` 0.** `defenseOf`
  reports an absent key as "at max", so raising the ceiling raises the score
  with it and the heal moves nothing. The land does grow; the event honestly
  records no store movement. This is exactly what Prosperous proliferation
  already does (`landHeal` in `playCard`), and the two are the same shape on
  purpose - but it means the badge walk shows no step for a full-health
  winner.
- **The pick is raised from `refreshWhenSettled` rather than from a
  transition stage.** It holds nothing open: `picking` is a state the engine
  carries until answered, so there is no one-shot route to lose and no
  reconciliation needed. The cost is that the modal appears after the round
  summary has been dismissed rather than as part of the move - which is the
  right order for reading, but nobody has watched it.
- **A run that reaches an empty offer was never observed.** The empty-offer
  arm is tested at the HUD level only; no game state was driven into it.
- **`duel=` is answered before `march=` and after `realm=`.** No test covers
  the interaction of `realm=25` with a `duel=` clause, since a realm holding
  the map borders little.

## Batch C: what a browser said (2026-08-16)

The deployed preview at `695c2bd` was played over CDP - the offer answered, a
duel fought to a defeat ending, a duel won, a duel run out to its clock, world
ticks timed, multi-hop arrows booted and hovered. **Zero console errors and
zero warnings across all of it, and the "AI seat cannot end its turn" guard
never fired.** The console hook was self-tested, so that is evidence rather
than a harness reporting nothing.

What the browser CONFIRMED, that was unverified above:

- **The world tick is not the problem stage 1 feared.** Ten unscoped rounds at
  a six-land realm: median 7.9s, max 15.5s at 9 beats, beat cadence a steady
  1.72s. `involvesLocalSeats` is why - the whole map acts, most of it earns no
  beat. Duel rounds are smaller again: median 6.1s, max 14.5s.
- **The offer is one modal per cycle**, raised after the round summary, over a
  dimmed map. At 8 candidates the panel is 720px in an 805px viewport with no
  overflow, and a WIDER realm gives FEWER candidates rather than more, so the
  clipping risk Batch B could not rule out does not exist.
- **A won duel closes cleanly**: "The duel with Jersikans is won - 3 wealth
  comes home / The whole map takes one turn now, and then a fresh offer comes
  round."
- **The duel's turn scope holds.** Four duel rounds produced 20 third-party
  card plays and all 20 were `keeps-to-itself` restless raids. No third party
  took a turn.
- **A conquered land's hover names its new ruler**, and the log shows it
  acting: "Jersika (Jersikans) / Your vassal / ... / Leader Drivinalde / War
  leader", against "Nobody leads this land / No successor" on an untaken one,
  and then "Drivinalde of the Jersikans played Fortify on Jersikans".
- **The dashed overland casing works.** A gold shaft inside a white dashed
  outline reads as an army still on the road and not as damage or weakness.

What the browser FOUND, and none of it is above:

- **A duel that is not WON ends in total silence.** `gauntletAtRoundWrap`
  retires the duel with no event, and `duel-won` is the only gauntlet event
  that exists - there is no duel-lost and no duel-expired. Watched: a duel
  declared on turn 1 with `until` 21 produced 35 log lines on turn 21 and not
  one of them mentions it. The only signal is the offer modal reappearing on
  turn 22. This is the loop's premise - a promise made and then settled - going
  unsettled in three of its four endings.
- **A duel has no visible MIDDLE either.** Mid-duel the string "duel" appears
  nowhere on screen, no element carries a duel/enemy/gauntlet class, and the
  status bar is exactly what it always was. There is no chip naming the enemy
  and no turns-remaining, so the clock the player is running out of cannot be
  seen running out. `duel-note` lives inside the offer modal and nowhere else.
- **The `lands in N` chip hides behind the land's own defense badge.** Measured
  client rects: `lands in 2` text spans x 713-740 with the `1/3` badge at
  725-744 - 15 of 27px covered; `2nd - lands in 3` spans 814-858 with `6/7` at
  837-857 - 21 of 44px covered. The badge wins the z-order, so the number is
  the part that disappears. This is NOT the collision predicted above: the
  feared case was the 24-character `2nd - clash - lands in 3` against a clash
  label, and the case that actually bites is the ordinary ten-character chip
  against a badge that is on the map every turn. The clash-plus-hops chip could
  not be constructed at all - every counter-march booted back down a multi-hop
  border was refused by the real rules.
- **Declining rerolls nothing.** The offer is byte-identical across consecutive
  declines - seven turns in a row of the same eight tiles - which is what
  `sameList` guarantees while the borders hold. So declining is a pass, not a
  choice, and it costs a full world round stated only as "every realm takes a
  turn", which does not read as a price. Batch A's "if declining is meant to
  cost something the player can feel, Batch B has to say what" is still open,
  and now measured.
- **The log during a duel is two thirds grey middle.** The scope holds for
  turns, but the restless raids do not stop, so twenty of roughly thirty log
  lines a round are lands you have no relationship with. "The world stands
  still" is true of the turn loop and false of the activity log.
- **Reward variety is thin early.** The turn-1 offer gave "3 wealth" on three
  of four tiles; at six lands it was 5 wealth / 2 defense / 1 growth of eight.
  Wealth is the default and it shows.
- **`duel=` with a wrong id boots onto the offer modal** - `duel=semigallians`
  drops silently because the id is `semigallian-confederacy`. Documented
  behaviour, but the only tell is the modal you were trying to skip past.
- **Boot-order artefact:** with `realm=N` and no `duel=`, the first offer is
  computed before the annexation (4 candidates at `realm=6`) and the next wrap
  recomputes it to 8. Boot path only, no effect on a played run.

The ranked recommendation from the playtest: **an event at the wrap that
retires a duel un-won**, with a notice in the same shape as the win, plus a HUD
chip naming the enemy and the turns left. Then the chip/badge collision.

## After the two fixes (silent duel endings, chip under the badge)

Both are fixed and both were checked in a headed Chrome over CDP against the
dev server. What is NOT verified, and what a later pass should pick up:

- **The `duel-lost` ending has never been seen on a screen.** It is covered by
  `tests/gauntlet.test.ts` ("says so when the ENEMY is the one who took a
  land"), and it shares its notice, beat and log machinery with the lapse that
  WAS driven in a browser - but nobody has watched one land. It is awkward to
  boot: a duel enemy that can take a land off you needs a ruler, and the
  bordering candidate on the seeds tried (`seed=7`, Selonians against
  Jersikans) carries `keeps-to-itself`, so its arrow breaks a land without
  taking it. `Raid out of Jersikans reaches Selonians` on a land at 0 defense
  is that rule, working as written.
- **The beat is not eyeballed either.** `PRESENTATION_RULES` frames both new
  endings, so each takes the camera, the glow and a label, and the tables are
  exhaustive - but the browser pass caught the modal and the log line, not the
  label that runs before them.
- **The chip dodges BADGES and nothing else.** `SceneCtx.keepOut` is fed the
  threat badges alone. Land names, river labels and another arrow's own chip
  are not keep-out boxes, and a chip can still land on one. The badges were
  what the playtest measured; the rest is unmeasured rather than ruled out.
- **A chip with nowhere clear to go keeps its least-covered station.** With
  four sideways steps either way there is 60 units of room on each side, which
  clears every badge on both maps from a chip centred on one - but a board that
  crowded it further would degrade to "least bad" rather than to "clear", and
  nothing says so on screen.

## Presentation review, the four fixes (2026-08-16)

An adversarial review measured four things in a browser that 1615 tests had
not. Three are fixed and verified the same way, with pixel measurements before
and after; one is engine work in another session's files and is specified here
rather than done. Everything below was driven over CDP in a headed Chrome
against the dev server at `?seed=7&faction=selonians`, with a self-tested
console hook: **zero errors and zero warnings across every run**.

### What was NOT fixed, and exactly what it needs

**Declining a duel still costs nothing.** The offer returns on the very next
turn - eleven straight turns of the same four tiles was what the review
watched. `declineDuel` moves the gauntlet to `world-tick`, but `world-tick`
and `picking` are BOTH unscoped, and `gauntletAtRoundWrap` turns `world-tick`
into `picking` at the first wrap it sees. A decline made mid-round is
therefore seen at the wrap that opens the very next round, so the price is the
tail of the round the player was already in: zero. Batch A wrote this down as
"declining costs nothing extra today" and Batch C measured it; this is the
third time it has been recorded and it is still true.

It is engine work, in `src/gauntlet.ts` and `src/game.ts`, which this pass did
not own. What it needs, precisely:

- `Gauntlet`'s `world-tick` arm gains `until: number` - the turn the offer
  comes back on. A plain number, so `src/net-codec.ts` needs nothing.
- `gauntletAtRoundWrap`: `if (g.kind === "world-tick") return view.turn >=
  g.until ? { kind: "picking", candidates } : g;`
- The duel-retirement arm returns `{ kind: "world-tick", until: view.turn + 1 }`.
  That is the CURRENT behaviour written down, not a change: the wrap runs
  inside `beginTurn` for the round that is beginning, so `until = T + 1` is
  reached at the next wrap exactly as the bare `world-tick` was.
- `declineDuel` returns `{ kind: "world-tick", until: state.turn + 2 }`. Two
  and not one, and that asymmetry is the whole fix: a decline is answered
  MID-round, so `turn + 1` is the wrap that opens the next round and would buy
  the player nothing. `turn + 2` buys one whole unscoped round, which is what
  "let the world turn" says on the button.
- The test that would fail if it were reverted: decline at turn N, run two
  round wraps, and assert the gauntlet is still `world-tick` after the first
  and `picking` only after the second.

Note what this does NOT fix, and deliberately: `sameList` keeps the offer
byte-identical while the borders hold, so the second offer is the same four
tiles a round later. Whether declining should also reroll is a separate
question the review did not ask.

### The shaft geometry: decided against, with the reason

The review found a second collision in the same run - two arrows' `N STR`
labels overlapping by 66 px - and asked for a judgement on the
`overlandCrossing` this file already records as the honest fix. The judgement
is **no, not in this pass**, and the reason is structural rather than nerve:

`crossingBetween` is handed two RING SETS and nothing else. It cannot tell
"these two lands share no vertex because there is sea between them" from
"these two lands share no vertex because they are three lands apart", so it
cannot choose between strait geometry and overland geometry - and every
multi-hop march therefore gets the strait's, which puts the shaft midway
between the two lands' nearest vertices. That is what stands a long march's
label in the middle of somebody else's border.

Giving it the answer means one of two things, and both are bigger than they
look. Changing `crossingBetween`'s signature reaches `tests/borders.test.ts`,
which walks all 103 adjacencies on both maps. Branching in main.ts's
`crossingFor` instead is feasible - main.ts already computes `overland` off
`game().adjacency` for the spec - but it makes the geometry a function of live
game state where it is currently a pure function of the map, and `crossings`
in main.ts is CACHED per unordered border pair, so the cache key has to grow
the overland flag or the first caller decides the shape for every later one.

What the fix would be, for whoever picks it up: an `overlandCrossing(a, b)`
that takes the axis between the two lands' CENTROIDS rather than their nearest
vertices, walks out to each land's boundary along it, and uses `reach` to
measure the depth available inside each end - so the arrow is rooted in the
land it sets out from and bites the land it is headed for, instead of standing
wherever the two happen to nearly touch.

The cheap alternative was considered and refused on the standing rule: the
strength label could dodge the way the chip does, and must not. A strength
sits on its shaft and its position is what says which arrow it belongs to.
The chip is the only part of an arrow whose position carries no information,
which is why it is still the only thing in the scene that moves.

### What was fixed, and what is still unverified about it

- **The chip's keep-out set.** Verified: the `1st` chip's box went from
  x 740.5-755.3, y 374.9-382.6 with all 114 px inside SELONIANS (plus 8.3 px
  on a `2 STR`), to x 764.5-779.3, y 355.5-363.2 with 0 px on anything. What
  is NOT verified is a CROWDED board: `CHIP_DODGE_TRIES` gives four steps of
  15 either way, and the map's words are far larger obstacles than the badges
  the dodge was tuned against - a people's name is roughly 200 units wide.
  Nothing was seen degrading to "least bad", but nothing constructed a board
  that would.
- **`ArrowKindDef.labelPx` is an ESTIMATE of the drawn label**, `characters *
  fontPx * 0.56`, the chip's own ratio. It is held to style.css by a test, so
  the font size cannot drift - but the 0.56 is not measured per face, and a
  label in a much wider or narrower face would reserve the wrong ground. It
  only ranks candidate chip stations 15 units apart, so the tolerance is
  large.
- **The note outside the scroll region** was measured at 720x403, 853x400 and
  1440x805. Not measured: a window short enough that the CARD itself overflows
  once the note is outside the scroll - at 720x403 the card is 339px in a
  403px viewport, so there is room, but the margin is not large.
- **The lapsed-duel label has still never been watched on a screen.** The
  wording is fixed and pinned by a test; the beat itself remains in the "never
  eyeballed" list two sections above.
- **End turn's z-index** was raised over the activity log after
  `elementFromPoint` showed the button unhittable at 720x403 and two-thirds
  unhittable at 1440x805. What that BUYS is a clickable button; what it costs
  is 34px of the log's lower entries drawn over. The log scrolls, so nothing
  is lost - but the two controls still share one column, and the layout fix
  was not attempted.
