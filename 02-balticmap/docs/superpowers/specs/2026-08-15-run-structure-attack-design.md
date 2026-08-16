# How to tackle the run-structure refactor

Status: **agreed 2026-08-15.** This is the plan of attack for
`~/Downloads/refactor-spec.md` (the run-structure design), not a restatement of
it. Read that document first: it holds the diagnosis, the evidence and the
design. This one holds only the decisions about HOW the work is sequenced,
branched and judged, plus a full spec for the first game stage.

Section A is a repo-level change and touches files outside `02-balticmap`
(`.github/workflows/pages.yml`, the repo `CLAUDE.md`). It is written up here
because it exists to serve this refactor and nothing else asked for it.

---

## A. Branch previews on GitHub Pages

**The requirement.** Every decision in the refactor is judged by feel rather
than by a test, so a branch has to be playable in a browser before it lands on
main. Today `.github/workflows/pages.yml` triggers on push to main and
`workflow_dispatch`, builds every `NN-*` directory, and publishes the assembled
`_site/` through `actions/upload-pages-artifact` and `actions/deploy-pages`.

**The decision: keep the artifact deploy, and build main plus one preview into
the same artifact.** The Pages source stays on `build_type: workflow`. Nothing
migrates to a `gh-pages` branch.

A preview run:

1. Checks out `origin/main` and builds the full site into `_site/` exactly as
   the workflow does today. Every `/prototypes/NN/` URL keeps serving main.
2. Checks out the dispatching ref and builds only the changed prototypes with
   `npm run build -- --base=/prototypes/preview/<slug>/NN/`, copying each into
   `_site/preview/<slug>/NN/`.
3. Uploads one artifact and deploys it. The preview URL is written to the job
   summary.

`<slug>` is the branch name lowercased with every character outside
`[a-z0-9-]` replaced by `-`.

**Trigger: push to any branch except main, plus `workflow_dispatch` as a manual
override.** The dispatch form takes an explicit `prototypes` input; the push
form derives it from `git diff --name-only origin/main...HEAD`, so a change to
one prototype never rebuilds the others and a docs-only push builds nothing at
all.

**The checkout must be `fetch-depth: 0`.** `actions/checkout@v4` fetches depth
1 by default, and a triple-dot diff needs the merge base, which a shallow
checkout does not have. A branch several commits behind main would otherwise
fail detection before anything was built. The run verifies a merge base exists
before diffing and fails loudly rather than silently previewing nothing.

### What follows from the single artifact, stated so nobody is surprised

- **One preview slot.** The most recent preview push across all branches is the
  one that is live. This repo regularly has several sessions working at once,
  so a preview can disappear because somebody else pushed.
- **A push to main wipes the live preview.** Main's run publishes main only,
  and the artifact is the entire site. The recovery is to push the preview
  branch again, which is why the trigger is a push rather than a manual
  dispatch.
- **The workflow used is the one on the branch.** A branch cut before this
  change lands cannot preview itself until it is rebased past the CI commit.

### Decisions inside section A

- **`base` stays hardcoded in every `vite.config.ts`.** The override is a
  `--base` flag at the CI call site, so no prototype config changes and the
  repo `CLAUDE.md` rule stays literally true. It gains one sentence saying CI
  may override it for a preview.
- **Godot prototypes cannot be previewed.** A preview run that detects a
  changed `NN-*` directory holding `project.godot` skips it with a warning
  rather than failing the run, so a Godot change still gets a green build and
  simply no preview URL.
- **The main tree is cached, keyed on main's SHA.** Required, not optional: a
  push-triggered preview that rebuilt seven prototypes including a Godot export
  on every commit would make the playtest loop unusable. On a cache miss the
  run builds all of main and saves it.
- **The concurrency group is split in two**, `pages-main` and `pages-preview`.
  This was written down as "`group: pages` is unchanged", on the reasoning that
  one artifact is one site so serialising every run is correct. That reasoning
  missed how the group actually behaves: GitHub cancels a PENDING run when a
  newer one queues on the same group, even under `cancel-in-progress: false`.
  With every branch push sharing one group, a push to main could be cancelled
  while queued behind somebody's branch build, leaving the live site stale on a
  green-looking history - and this repo has several sessions pushing at once.
  Split, main serialises only against main. The accepted consequence is that a
  main run and a preview run can now deploy at the same time and the last to
  land wins, which is safe in both orders: a preview run publishes main's tree
  PLUS the preview, and a main run publishes main alone, which drops the
  preview the way any push to main already does.
- **A branch cannot deploy at all without a repo SETTING**, which is invisible
  from the tree: the `github-pages` environment's deployment branch policies.
  Measured rather than assumed - Pages patterns do not treat `*` or `**` as
  crossing a `/`, so `main`, `*` and `*/*` are what this repo carries, and a
  branch named `a/b/c` would need `*/*/*`. Without a match the run fails at the
  deploy job reading `Branch "X" is not allowed to deploy to github-pages due
  to environment protection rules`, which looks exactly like a workflow bug.
  The repo `CLAUDE.md` carries the operational version of this.
- **`.github/pages-index.html` stays main's hand-maintained index.** No preview
  index is generated. The URL shape is documented instead.

### Verification

Push the branch, then confirm all three:

- `https://jkirsteins.github.io/prototypes/preview/<slug>/02/` loads and its
  assets resolve.
- `https://jkirsteins.github.io/prototypes/02/` still serves main.
- A second push to the same branch replaces the preview rather than
  accumulating.

---

## B. Branch shape

**Section A lands on its own branch and merges to main.** It is infrastructure,
it helps every prototype, and the game work cannot be previewed until it is on
main.

**Everything in the refactor's section 3 then lives on one long branch,**
`feature/run-structure`, cut from main after the CI change lands and merged
once, at the end. It is rebased onto main regularly, because other sessions
ship to main and the branch will be open for a while.

Stages, in the refactor spec's order:

1. Acting vassals, plus the sideways targeting block (section C below).
2. March travel time.
3. The gauntlet loop: target picker with visible rewards, duel scoping, the
   regional-leader status.

### Why the world tick is not a stage of its own

The refactor spec bundles acting vassals and the world tick as one experiment,
on the grounds that the tick is what makes many autonomous actors readable. The
tick is split here, and the reason has to be written down or the next reader
will think it was dropped by accident.

The world tick is two things, and only one of them is unbuilt. **Batched and
readable** is shipped: `stepAiChain` walks the AI seats a seat at a time and
`raiseRoundSummary` folds the whole batch into one modal, which is exactly "the
world takes one turn and the player is shown what happened". **Per-gauntlet
cadence** is the unbuilt half, and it cannot ship before the thing that defines
a gauntlet. Assigning the tick to stage 1 would mean building the gauntlet loop
in stage 1 and leaving stages 2 and 3 with nothing to do.

**The residual risk is real and is accepted.** Stage 1 judges acting vassals at
the CURRENT cadence, where the world acts between every player turn rather than
once per duel, so a bloc of fifteen seats is shown to the player far more often
than the run structure intends. If stage 1 reads as too noisy, the first
question is whether the noise is the vassals or the cadence, and the answer
must not be assumed. That is what the beats-per-round measurement in section C
is for: a count taken at the old cadence is the thing the new cadence can be
compared against once stage 3 exists.

**The refactor spec's step 2, re-measuring the balance baseline against the
raid-spend commit, is deliberately skipped.** Stage 1 is judged by playing it.
The consequence is accepted explicitly: no claim of "this widened the skill
gap" can be made until somebody runs `npm run balance`, and the project's own
standard says prose did not work. If a later stage needs the number, that run
is its first task rather than a retrospective one. What is NOT lost is the
measurement itself: main is a fixed commit, so the pre-refactor baseline can be
produced at any point by running the suite at that SHA. The cost of skipping is
convenience, not the ability to separate the raid-spend change from this work.

**Open questions 1 to 4 in the refactor spec stay open.** Each blocks its own
stage, not the branch: what losing a duel costs and run-enders block stage 3,
marches in flight at a gauntlet boundary blocks stage 3, maximum march distance
blocks stage 2. Question 5, whether a vassal build follows, stays deferred; the
refactor spec adds no cards in this pass and the repo's card gate agrees.

---

## C. Stage 1: acting vassals

### What changes

- **`takeLand` seats a ruler on the captured faction**, through a new
  `seatRuler` in `src/rulers.ts`. Symmetric, so a rival's conquest wakes their
  new vassal on the same terms as yours. The turn loop needs nothing else:
  `takesNoTurn` already returns false the moment `hasRuler` is true, and
  `keeps-to-itself` is already stripped on capture.

  **`replaceRuler` cannot be reused, and seating is not a one-liner.**
  `rulerOf` (`src/rulers.ts:131`) throws on a vacant seat, so the documented
  "only writer" is a SUCCESSION operation and this is a different one. Its
  doc comment and the `GameState.rulers` invariant both have to say so.
  `seatRuler` states all four fields itself: a name unique against every name
  in play (`rulerNameFor`, the same uniqueness set `replaceRuler` builds),
  `since` set to the turn of the conquest, leadership 0, and abilities from the
  faction's own `strategy` through `BUILD_ABILITIES`.

  **Abilities are the part that is a design decision rather than a detail.**
  `pickFaction` grants `BUILD_ABILITIES` AFTER `vacateRulers`
  (`src/game.ts:901-905`), so no quiet faction holds its build ability today
  and there is nothing to carry over. Granting it at seating means a woken
  warpath vassal raids with `war-leader`; withholding it means a vassal is
  strictly weaker than a seat that started the run acting. **The decision is to
  grant it**, because the alternative is a second class of ruler and this
  design's whole method is that a status is the only difference between a land
  that plays and one that does not.

  **And the grey middle is uniformly warpath.** `pestilent` is drawn only from
  the ACTING rivals (`src/game.ts:874-876`), so all 21 quiet factions were
  handed a `warpath` Player at deal time and never used it. Conquest therefore
  wakes warpath decks and nothing else, which makes the bloc more aggressive
  and more one-note than the refactor spec's aggro/value/combo triangle
  assumes. Left alone in stage 1, deliberately: it is a seeding change, it is
  measurable by playing, and fixing it before it is seen to be a problem would
  confound the read the same way waking the grey middle at seeding would.
  Capture tests cover both a warpath and a pestilence source faction so the
  behaviour is pinned either way.
- **`aimsUpOwnChain` widens SIDEWAYS only, and is renamed for it.** A hostile
  card may not aim at a land that is under the actor's own root realm but not
  under the actor: up the chain as today, and now at a sibling vassal. The
  refactor spec names sibling raids as the likeliest source of "my ally did
  something insane", and reading as randomness is the complaint the whole
  exercise started from, so this ships WITH acting vassals rather than after
  them.

  **Downward stays legal, deliberately.** A lord raiding its own vassal is
  vassal upkeep: it is how a vassal's defenses are held under the independence
  gate, and `tests/playability.test.ts` already pins it with that reason
  written down. Closing it would delete the mechanism this whole stage exists
  to put pressure on, which is the opposite of the intent. The predicate is
  therefore "inside my root's realm AND not inside mine", not "inside my
  root's realm".
- **`MAX_AI_TURNS` needs nothing.** Checked rather than assumed: it is 1000
  (`src/decisions.ts:39`), a stall guard deliberately set far above any real
  turn order, and a round of every faction on the map is 26. It is recorded
  here because "the seat cap will bite" is the obvious worry and the answer is
  that it does not.

- **Both doors that change allegiance seat the ruler**, not just the arriving
  one. `takeLand` (`src/game.ts:1186`, an army arriving) and `landSubjugation`
  (`src/game.ts:2268`, a card resolving on the table) already both call
  `stripOnCapture`, and the seating belongs beside it in each. `beginTurn`
  currently reads `state.rulers` without threading a local copy, so it gains
  one and returns it, the way the play path already does.

### What deliberately does not change

- **Seeding.** The refactor spec allows that leaderlessness "may still be rolled
  at seeding, but is no longer guaranteed for non-acting lands". That is a much
  bigger swing than letting conquest wake a land, it would confound the read on
  this stage, and the grey middle is a designed feature rather than an
  accident. It is a separate experiment if the stage argues for one.
- **Presentation.** `involvesLocalSeats` is untouched. Whether fifteen acting
  seats make the turn-start replay too long is a measurement, not an
  assumption, and the existing audience gate already filters most of a stranger
  bloc's business out. What is recorded while playing is beats per round and
  wall-clock replay length at roughly turn 10 and turn 30, so that if a quieter
  treatment for your own bloc is needed there is a number behind it. The option
  on the table, should it be needed, is an arm in `involvesLocalSeats` giving a
  seat inside your own realm its log line and its badge walk but no camera
  glide and no label.
- **Cards, and therefore the wire hash.** No `CardDef` changes, no new
  `POLICY_COVERAGE` entry, no discovery route to add.

### What to watch for while playing

Stated in advance so the playtest can falsify them:

- Vassals actually going for independence. The refactor spec predicts the
  dormant AI branch at `src/ai.ts:474` wakes up and vassalage becomes the
  game's central tension.
- Your own bloc starting wars you did not pick, which the spec wants as a cost
  of expansion arriving free.
- Replay length per round, per the measurement above.
- Any surviving case of an ally doing something that reads as insane, now that
  same-realm aggression is closed.

### Gate

`npm test` and `npm run build` green, and a browser pass on the branch preview
from section A.

---

## D. Stage 2: march travel time

A march moves one land per turn, so a raid launched from the rear lands later
than one launched from the border. The refactor spec's section 3.4 states the
intent: travel is purely a ticking timer for arrival, there is no interception
in transit, defense is still spent at declaration with no recall, and
reinforcement stays deferred.

Reading the code turned up two interactions the refactor spec does not mention
and one open question it leaves for here. All three are decided below.

### The open question: maximum march distance

**Ruled: three hops, stated as a rule.**

The refactor spec prefers no stated cap, arguing that with 10-20 turn duels and
one hop per turn "lands more than three or four deep cannot reach the fight" and
that this is "a natural cap requiring no tuning". That argument depends on the
duel clock, and the duel clock is stage 3. Until it exists there is no clock at
all, so "whatever the clock allows" means the whole map: `marchTargetsFrom`
would offer every land, the aim preview would light up all 26, and the AI would
score every faction from every source.

A stated three also costs nothing the emergent cap was not already taking, and
it buys two things the emergent version cannot. The target list stays a list a
player can read. And the rule becomes something the game can SAY - the hover and
the block reason can name it - rather than something a player has to infer from
arrows that never arrive in time.

Revisit this in stage 3 once a duel has a length. If the clock turns out to bind
tighter than three, the constant is one number.

### A march carries the turn it was declared

`Axis.opening` in `src/marches.ts` decides which side of a clash is drawn full
size and which is drawn as the answer, and it is currently "read off the expiry,
which IS the declaration turn plus one". Travel time breaks that identity: a
three-hop attack declared on turn 4 and a one-hop attack declared on turn 6 both
expire on turn 7, and the later one would be drawn as the opening move.

So `March` gains the turn it was declared, and `opening` reads that instead.
This is the first change of stage 2 because everything else depends on it, and
it is a new field on a replicated type - `SerializedGameState` is checked at
compile time and will say so.

### Distance does not break the clash system, and that is worth stating

A clash is per AXIS, and an axis is a pair of lands. Both directions of a pair
are the same distance apart, so two seats attacking each other across three hops
both arrive on the same turn exactly as they do today across one. Travel time
therefore changes when a clash resolves, never whether the two sides meet. The
refactor spec's "no interception in transit" survives for the same reason: there
is no such thing as being caught between two lands, because a march has no
position - it has a timer.

### What the player must be able to see

**An arrow in flight has to say when it lands.** Today every arrow lands next
turn, so the question never arises; a three-hop arrow standing on the map for
three turns with nothing to distinguish it from one landing tomorrow is the map
lying about the board. The arrival goes on the chip BEHIND the tail, never on
the shaft - the shaft carries exactly one number, and `02-balticmap/CLAUDE.md`
records that the bare "1 STR" form is safe only because of that.

**A multi-hop arrow spans, and that is already built.** `crossingBetween`
returns nothing for two lands that share no vertex, and `renderArrowScene`
already spans such a pair rather than standing an arrow in the middle of
nothing - the strait treatment. A three-hop arrow is that same case, so nothing
new is drawn. Whether it READS as a long march or as a strait crossing is a
question for the playtest, not an assumption to make now.

### A march is judged when declared and when it lands, never in between

`resolveMarches` re-asks the targeting rules every turn. With one-turn flights
that was indistinguishable from asking at arrival; with three-turn flights it is
not, and the difference matters because stage 1 made allegiance change roughly
every four turns. An arrow would be cancelled mid-flight routinely, by a
relation that did not exist when it was declared.

**Ruled: validity is decided at declaration and re-decided at arrival.** In
between the march is a timer and nothing can touch it, which is exactly what
"no interception in transit" means. If the target has become a peer of the
actor's own realm by the time the arrow lands, the march LAPSES - no damage, no
capture - and says so in the log, because an arrow that vanishes with no line is
the map lying again.

### The long march is a bet, and the bet is the point

Defense is spent at declaration, so a three-hop march leaves its source soft for
three turns rather than one - and, since stage 1, a source below its own
independence gate for three turns is a source that may free itself. That is not
a defect to be fixed. The refactor spec names it as the most interesting
decision the structure creates and also the most likely to feel punishing if the
numbers are wrong, which is precisely what the playtest is for.

### The AI must not treat a distant target as a near one

`chooseAction` scores targets with no notion of when a blow lands. Widening its
reach without teaching it that a three-hop raid arrives in three turns would
make it trade near targets for far ones at no discount, which reads as the AI
throwing armies into the distance. The scoring gains a distance term; how steep
it is, is a number the playtest and the balance suite argue about, not something
to settle here.

### Gate

`npm test` and `npm run build` green, a stuck-seat sweep still at zero, and a
browser pass on the branch preview. The specific things to watch: whether an
arrow's arrival reads clearly, whether a three-hop arrow is legible as a march
rather than a strait, and whether rear lands are worth anything at all or
whether the defender simply out-heals every long arrow.

---

## E. Stage 3: the gauntlet loop

The refactor spec's section 3.1 and 3.2. Pick a bordering target whose reward
is visible, duel it, cash the reward, the whole world takes one turn, repeat.

Its three open questions are ruled below rather than left open, because the
stage cannot be built around them.

### Open question 1: what losing a duel costs

**Ruled: nothing new is written.** The existing ladder is the forfeit. Capture
is `dealt > standing`, so a land is lost exactly when it is let go soft; losing
your home makes you somebody's vassal; being incorporated is defeat; and the
independence gate is the escape valve that stops a death spiral. All four
already exist, are already telegraphed, and are already the rules the player has
been learning for the whole run. A forfeit rule invented for the gauntlet would
be a fifth thing to learn that fires exactly when a player is already losing.

### Open question 2: run-enders

**Ruled: not built in this pass.** A marked neighbour that can take the whole
realm must be unmissable, avoidable and eventually worth fighting - which means
act boundaries, a boss-strength notion and a way to see one coming, none of
which exist. Half-built, it punishes exploration, and the refactor spec names
exploration as the one thing a map roguelike most needs to reward. The run still
ends the two ways it already does: half the map, or being incorporated.

### Open question 3: marches in flight when a gauntlet ends

**Ruled: they keep flying, and the gauntlet boundary means nothing to them.**
Section D made a march a timer, and a timer that stopped at a boundary it cannot
see would be a second rule about what an arrow means. An arrow declared in one
gauntlet lands in the next, on whoever holds the land when it arrives, judged by
the same arrival check as any other - which may lapse it. That also gives the
player a real decision at the end of a duel: an arrow declared late is an arrow
that arrives while somebody else is the enemy.

### The duel, and what a gauntlet actually changes

A gauntlet is a scope over the turn loop, not a new loop:

- **The player picks one bordering faction to duel.** The picker shows each
  candidate's reward, derived from what the land IS rather than rolled - a
  river-trade land pays wealth, hill country yields defense, a big land yields
  growth. The map then teaches its own logic.
- **While a duel runs, only the two sides act.** The player's realm and the
  enemy's realm take turns; everybody else is still. This is one more arm on
  `takesNoTurn`, which is already the single question the turn loop asks.
- **A duel ends when a land changes hands between the two sides, or after
  `DUEL_TURNS`,** whichever comes first. A duel nobody can win still ends, so
  the run cannot stall on a stalemate - which the pre-refactor game did, at a
  median of 110 turns.
- **Then the world takes one turn**, every seat at once, through the existing
  `stepAiChain` and the round summary. This is the difficulty curve: the fifth
  neighbour you fight has had five ticks to grow.
- **Some neighbours are neutral and ignorable.** The border is not a to-do list,
  so the picker offers rather than requires, and declining is a real choice that
  costs a world tick.

### Deliberately not in this pass

The regional-leader status, which the refactor spec wants for pulling a bloc
into a fight. It is a `PASSIVES` row plus a hook, but per the project rule it
does not ship until the land hover names it, and the stage is large enough
already. Rewards start as the smallest set that proves the idea rather than one
per terrain.

### Gate

`npm test` and `npm run build` green, the stuck-seat sweep still zero, and a
browser pass. What to watch: whether a duel actually feels like an arc, whether
the world tick is readable at the beat counts stage 1 measured (up to 16 beats
and 29.5s per round at a five-land realm - a world tick is that with every seat
acting), and whether declining a neighbour is ever the right move.

### A duel enemy fights, chief or no chief

An adversarial review measured what the first version of the offer actually
produced: **110 of 110 turn-1 candidates across all 26 seats were leaderless**,
and 26 of 78 duels over full runs. A leaderless enemy takes no turn and cannot
take a land, so the map stood still for up to twenty rounds while the player
fought something that never answered, and `duel-lost` was unreachable.

Three things fix it, and the scope is deliberately narrow.

- **A leaderless enemy is RARE.** `duelCandidates` prefers factions that have a
  chief. It does not refuse a leaderless one outright, because the border is
  what it is and a realm hemmed in by quiet lands must still be offered a fight.
- **A duel enemy acts whether or not it has a chief.** Inside a duel, the
  enemy's side is exempt from the leaderless arm of `takesNoTurn`. It plays its
  deck, raids, and answers. This is the ONLY place that arm is bypassed:
  outside a duel a land with no leader still takes no turn, and the grey middle
  is still the grey middle.
- **Beating a chiefless enemy INCORPORATES it.** That is the whole remaining
  difference between an enemy with a chief and one without: a people who follow
  somebody become your vassal and may one day leave, and a people who follow
  nobody are simply absorbed. It also means the reward for fighting a quiet
  land is a permanent one, which is what stops "rare" from reading as "worse".

**The asymmetry this leaves, stated so nobody thinks it is an accident.** A
leaderless land taken OUTSIDE a duel still gets a chief seated on it and
becomes a vassal, per section C. Only the duel enemy is absorbed. The narrower
rule was chosen over making absorption universal because universal absorption
would undo section C - every quiet land is leaderless, so a conquest would stop
waking anybody and the acting map would never grow. If a later playtest says
the split reads as two rules rather than one, the fix is to make absorption
universal and give section C a different way to wake the map, not to widen this
one quietly.
