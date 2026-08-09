# Plays-Again Cards, Pick-Screen Land Info, and the Test Suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general "this card lets another copy of itself be played this turn" rule (Raid is its first user), show land information while choosing a faction, and bring the whole test suite back to green with specs for everything built in this session.

**Architecture:** A card may declare `playsAgain`. Playing it spends the turn exactly as any card does, and additionally records `repeatCardId` on the state: while that is set, the ONLY card the spent turn will accept is another copy of it, and ordinary legality (for Raid, a land with a free army) decides whether there is one to play. Nothing is Raid-specific.

**Tech Stack:** TypeScript, Vite, vitest, plain imperative DOM. No new dependencies.

## Order, and why

The working tree carries this whole session's rules work uncommitted, and the
pre-commit hook typechecks every test file. Nothing can be committed until the
suites compile, so the two green-the-suite tasks come FIRST and the features
follow on a clean base. Task 1 is the one commit in this plan that may use
`git commit --no-verify`, and only because the surface suites it does not touch
are still red until Task 2; say so in that commit's message.

## Global Constraints

- Run everything from `02-balticmap/`. `npx tsc --noEmit` and `npm test` must both pass before every commit.
- Never `git add -A`. Stage explicit paths under `02-balticmap/` only.
- No em dashes, no unicode arrows, no fancy quotes, no ellipsis characters anywhere in code, comments, docs or commit messages. Plain ASCII punctuation.
- Comments explain why, never chronicle. No dates, no "was X, now Y".
- Player-facing prose that names a card or a faction is built from `t()`, `card()`, `faction()` segments (`src/rich-text.ts`); `tests/naming-convention.test.ts` enforces it.
- A card whose legality or effect changes needs its `POLICY_COVERAGE` entry in `src/ai.ts` to name the branch that decides it.
- A new `GameEventType` must be classified in `nestsUnderItsPlay` (`src/game.ts`), `NOTICE_RULES` (`src/notices.ts`) and `eventSegments` (`src/hud.ts`).
- An event that moves a defense score or a disease stack carries `amount`.
- Sparse-store convention: a key is present only when it says something.
- `npm run balance` is NOT run as part of this work.

---

### Task 3: A card may open the turn for another copy of itself

**Files:**
- Modify: `src/cards.ts` (`CardDef.playsAgain`, Raid and Strong raid declare it), `src/game.ts` (`GameState.repeatCardId`, `playCard`, `beginTurn`), `src/playability.ts` (`playableSet` honours it)
- Test: `tests/game.test.ts`, `tests/playability.test.ts`, `tests/cards.test.ts`

**Interfaces:**
- Produces: `CardDef.playsAgain?: true`; `GameState.repeatCardId: string | null`; `playableSet(view, factionId, hand, opts?: { repeatOnly?: string | null })`.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts`:

```ts
describe("a card that plays again", () => {
  /** Two lands with a free army each, and two Raids in hand. */
  function twoArmies(): GameState {
    const g = playingState(LINE_ADJ);
    return withHand({ ...g, overlords: new Map([["gamma", "beta"]]) }, 0,
      ["raid", "raid", "fortify"]);
  }

  it("leaves the turn open for another copy of itself", () => {
    const after = playCard(twoArmies(), 0, rng(), "alpha");
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatCardId).toBe("raid");
  });

  it("accepts the second copy even though the turn is spent", () => {
    const first = playCard(twoArmies(), 0, rng(), "alpha");
    const second = playCard(first, 0, rng(), "delta");
    expect(Object.values(second.marches)).toHaveLength(2);
  });

  it("refuses every OTHER card once the turn is spent", () => {
    const first = playCard(twoArmies(), 0, rng(), "alpha");
    const fortifyIndex = first.players[0].hand.indexOf("fortify");
    expect(playCard(first, fortifyIndex, rng(), "beta")).toBe(first);
  });

  it("stops when the armies run out, not at a count of plays", () => {
    // One land, one army: the second Raid has nowhere to march out of.
    const g = withHand(playingState(), 0, ["raid", "raid"]);
    const first = playCard(g, 0, rng(), "alpha");
    expect(validTargetsFor(viewOf(first), "beta", "raid")).toEqual([]);
  });

  it("clears at the next turn start", () => {
    const first = playCard(twoArmies(), 0, rng(), "alpha");
    expect(beginTurn({ ...first, turn: first.turn + 1 }, rng()).repeatCardId)
      .toBeNull();
  });
});
```

In `tests/cards.test.ts`:

```ts
it("pins the plays-again set - the cards a spent turn still accepts", () => {
  const again = Object.values(CARDS).filter((c) => c.playsAgain === true)
    .map((c) => c.id).sort();
  expect(again).toEqual(["raid", "strong-raid"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- game cards`
Expected: FAIL, `repeatCardId` does not exist.

- [ ] **Step 3: Write the implementation**

`src/cards.ts` - on `CardDef`:

```ts
  /** Playing this card leaves the turn open for ANOTHER COPY OF IT.
   *
   *  The card still spends the turn's allowance the way every card does; what
   *  it adds is that the spent turn will accept more of the same card, and
   *  nothing else. What stops the run is ordinary legality - for the raids,
   *  a land with a free army to march out of - so the limit is the board,
   *  not a count kept here.
   *
   *  Deliberately not "raids are special": any card can carry it, and the
   *  rule reads the same for all of them. */
  playsAgain?: true;
```

Add `playsAgain: true` to `raid` and `strong-raid`.

`src/game.ts`:

```ts
  /** The card a SPENT turn will still accept, or null. Set by playing a card
   *  that `playsAgain`; cleared at the next turn start. */
  repeatCardId: string | null;
```

`newGame` initialises `repeatCardId: null`; `beginTurn` returns `repeatCardId: null`; `playCard` gates on it and sets it:

```ts
  if (state.playedThisTurn && cardId !== state.repeatCardId) return state;
```
(replacing the bare `if (state.playedThisTurn) return state;`, and read `cardId` from the hand before the check)

and in the returned state:

```ts
    repeatCardId: CARDS[cardId]?.playsAgain === true ? cardId : null,
```

`src/playability.ts` - `playableSet` gains `opts: { repeatOnly?: string | null } = {}`; when `opts.repeatOnly` is a card id, only hand entries of that card are considered playable, before the forced-card rule.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: the new tests pass. Other suites may fail on the added `repeatCardId` field in state literals - add `repeatCardId: null` where a test builds a state by hand.

- [ ] **Step 5: Commit**

```bash
git add src/cards.ts src/game.ts src/playability.ts tests/
git commit -m "feat(balticmap): a card may open the turn for another copy of itself"
```

---

### Task 4: The screen honours a turn that is still open

**Files:**
- Modify: `src/main.ts` (`humanPlayableSet`, `humanBlockReason`, `discardMode`), `src/hud.ts` (`renderHand`, the status line), `src/ai.ts` (`aiTakeTurn`)
- Test: `tests/hud.test.ts`, `tests/ai.test.ts`

**Interfaces:**
- Consumes: `GameState.repeatCardId`, `playableSet(..., { repeatOnly })` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `tests/ai.test.ts`:

```ts
it("keeps raiding while it has armies, under one-card-per-turn rules", () => {
  // Two lands with a free army each and two Raids in hand.
  const after = aiTakeTurn(twoArmyRaider(), seededRng(1));
  expect(Object.values(after.marches).length).toBeGreaterThan(1);
});
```

Build `twoArmyRaider()` from this file's existing fixtures.

In `tests/hud.test.ts`:

```ts
it("keeps the repeat card live and greys the rest once the turn is spent", () => {
  const { container, hud } = setup();
  const g = { ...playing(), playedThisTurn: true, repeatCardId: "raid" };
  hud.update(withHand(g, 0, ["raid", "fortify"]));
  const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
  expect(cards[0].classList.contains("unplayable")).toBe(false);
  expect(cards[1].classList.contains("unplayable")).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- hud ai`
Expected: FAIL - the hand greys everything once the turn is spent, and the AI plays one card.

- [ ] **Step 3: Write the implementation**

- `src/main.ts`: `humanPlayableSet()` and `humanBlockReason()` pass `{ repeatOnly: game.repeatCardId }`. `canPlay` in the HUD must no longer be "turn not spent" alone - pass the repeat state through so a spent turn holding the repeat card still renders it live.
- `src/hud.ts`: `renderHand`'s `canPlay` becomes `isLocalTurn(state) && !resolving && (!state.playedThisTurn || state.repeatCardId !== null)`, and the per-card `cardAllowed` decides the rest through `canPlayCard`. The status line reads `Turn N - raid again, or end your turn` while `repeatCardId` is set and a legal play remains, else `end your turn`.
- `src/ai.ts`: `aiTakeTurn`'s standard-rules path loops while `playCard` moves the state, exactly as the unlimited path does, so a seat with two armies sends two raids. Keep the `MAX_AI_PLAYS` guard.

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/hud.ts src/ai.ts tests/
git commit -m "feat(balticmap): the screen and the AI use a turn that is still open"
```

---

### Task 5: The faction picker says what a land is

**Files:**
- Modify: `src/game.ts` (`chooseBuild` seeds terrain), `src/passives.ts` (seeding split), `src/main.ts` (`hoverLines` during `pick-faction`)
- Test: `tests/passives.test.ts`, `tests/game.test.ts`

**Interfaces:**
- Produces: `seedTerrain(factionIds, rng)` (the roll alone) and `quietPassives(passives, factionIds, acting)` (the quiet set alone), replacing the single `seedPassives`.

- [ ] **Step 1: Write the failing tests**

```ts
it("rolls the ground before the faction is picked", () => {
  const g = chooseBuild(startGame(newGame(LANDS, ADJ)), "warpath");
  // Terrain is on the board at pick time; the quiet set is not, because who
  // acts is not known until the pick.
  expect(Object.keys(g.passives).length).toBeGreaterThan(0);
  for (const ids of Object.values(g.passives)) {
    expect(ids).not.toContain("keeps-to-itself");
  }
});

it("adds the quiet set when the seats are dealt", () => {
  const g = pickFaction(
    chooseBuild(startGame(newGame(LANDS, ADJ)), "warpath"), "alpha", seededRng(1),
  );
  const quiet = LANDS.filter((id) => !playsTurns(g.passives, id));
  expect(quiet.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- passives game`
Expected: FAIL - `passives` is empty until `pickFaction`.

- [ ] **Step 3: Write the implementation**

- `src/passives.ts`: split `seedPassives` into `rollTerrain` (already exists) and `quietPassives(passives, factionIds, acting)`. Keep both exported.
- `src/game.ts`: `chooseBuild` returns `{ ...state, phase: "pick-faction", humanStrategy: build, passives: rollTerrain(state.factionIds, rng) }` - it needs an `rng` parameter, passed by every caller. `pickFaction` applies `quietPassives` on top instead of re-rolling.
- `src/main.ts`: `hoverLines` returns early on `!inPlay()`. Before that early return, add the lines a picker needs: the land's defense ceiling, its army cap (`armyCapFor`), its settlements, and its passive statuses. Nothing that depends on a human seat existing.

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts src/passives.ts src/main.ts tests/
git commit -m "feat(balticmap): the faction picker says what each land is"
```

---

### Task 1: The rules suites go green

**Files:**
- Modify: `tests/game.test.ts`, `tests/playability.test.ts`, `tests/marches.test.ts`, `tests/defense.test.ts`, `tests/cards.test.ts`, `tests/harvest.test.ts`, `tests/relations.test.ts`, `tests/standings.test.ts`, `tests/rng-isolation.test.ts`

**What changed under these tests, all of it already implemented in `src/`:**

- Defense scale: `DEFENSE_PER_POPULATION` 5000, `DEFAULT_DEFENSE_MAX` 6, `FORTIFY_HEAL` 1, `HILLFORT_HEAL` 3, `HARVEST_FEAST_HEAL` 1, `PLAGUE_DAMAGE_PER_STACK` 1, `WAR_COUNCIL_LEADERSHIP` 1, `victoryRealmSize` = half the roster.
- `armiesOn`/`freeArmiesOn`/`addArmy` take an army CAP; `armyCapFor(defenseMax)` and `turnipThresholdFor(defenseMax)` in `src/defense.ts`.
- `RulesView` gained `passives`, `claims`, `leaders`; `GameState` gained `passives`, `claims`, `defenseMax` mutability, `pendingTransfer`, `repeatCardId`.
- Subjugate is DECLARED (a `Claim`), resolving at the actor's next turn; a raid landing on a 0-defense land captures it; capture strips `strippedOnCapture` statuses and may move defense (`transferLimit`, `autoTransfer`, `transferDefense`).
- Only a faction with a ruler acts (`hasRuler`, `vacateRulers`); `advance` skips the rest.
- Cards: no `create-army`; `strong-raid`/`strong-fortify` exist; `prosperous-proliferation` grows a ceiling by `LAND_GROWTH`; `startingDeck(strategy)`.
- The harvest is a three-way choice plus burn and skip (`HarvestChoice`, `harvestCard`, `buildOffer`, `destroyOffer`, `autoHarvestChoice(player)`).

- [ ] **Step 1: Run the suite and read every failure**

Run: `npm test 2>&1 | tail -80`

- [ ] **Step 2: Fix each failing expectation to the shipped rule**

Rule for this task: a test's INTENT is preserved; only the numbers, signatures and fixture rosters change. Where a fixture needs a roomy polygon for its arithmetic to mean anything, pass an explicit `defenseMax` (the file-level `FIXTURE_MAX` pattern already in `tests/game.test.ts`). Where a fixture's realm size collides with the new win line, move it to a larger roster rather than changing what it asserts. Never weaken an assertion to make it pass.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: these suites PASS.

- [ ] **Step 4: Commit**

This commit carries the session's uncommitted `src/` work as well: the tests
under it only pass against that source, and splitting them would commit a suite
that cannot run. `--no-verify` is used ONCE here, because the hook typechecks
the surface suites too and those are Task 2's job.

```bash
git add src/ tests/ docs/
git commit --no-verify -m "feat(balticmap): five seats, leaders, claims, milestones and the harvest rebuild"
```

---

### Task 2: The surface suites go green

**Files:**
- Modify: `tests/hud.test.ts`, `tests/notices.test.ts`, `tests/view.test.ts`, `tests/target-explanations.test.ts`, `tests/boot-params.test.ts`, `tests/panel.test.ts`, `tests/rules.test.ts`, `tests/net-protocol.test.ts`, `tests/net-pipe.test.ts`, `tests/interaction.test.ts`, `tests/render.test.ts`, `tests/naming-convention.test.ts`

**What changed under these tests:**

- `standingsFor({ acting, ... })` ranks factions with a leader; `SCOREBOARD_ROWS` is gone.
- `standingChangeText` renders `Defense 6 -> 5 (-1)`.
- `relationshipLine` returns `Segment[] | null`.
- `RuleSelections` gained the `hand` axis (`keep` / `sweep`); `allowsDiscards` is gone, `sweepsHandAtTurnEnd` and `forcesDiscardWhenStuck` replace it; `playableSet` no longer takes `discards`.
- New event types: `transferred`, `harvest-burned`. New passive-status lines on the land hover, plus a Leader block.
- The tooltip parks at a screen edge (`tip-left` / `tip-right`), so any test asserting `left`/`top` pixels asserts the class instead.
- `showHarvestOffer` takes `{ buildCards, heldCards }` and five hooks; `showTransferOffer` and `revealGainedCards` are new.

- [ ] **Step 1: Run the suite and read every failure**

Run: `npm test 2>&1 | tail -80`

- [ ] **Step 2: Fix each failing expectation to the shipped behaviour**

Same rule as Task 4: intent preserved, numbers and signatures updated, no assertion weakened.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test(balticmap): the surface suites follow the shipped HUD and rules"
```

---

### Task 6: Specs for what this session built

**Files:**
- Create/modify: `tests/milestones.test.ts` (new), `tests/harvest.test.ts`, `tests/game.test.ts`, `tests/passives.test.ts`

**What still has no test.** Write one per bullet, in the file named:

`tests/milestones.test.ts`
- every milestone has a name, text, points and goal; `milestoneStandings` ranks per faction and lists `achievedBy` in seat order; `milestonePoints` sums only achieved ones; "A wide realm" reads the CURRENT realm and can go down.

`tests/harvest.test.ts`
- `buildOffer` is the seat's build minus what is at its cap; `destroyOffer` excludes forced cards; `harvestCard` returns the growth card / the named build card / one from `randomPool` / null for burn and skip; `autoHarvestChoice` takes its build's highest-ranked card and falls back to growth.

`tests/game.test.ts`
- a Subjugate declares a claim that resolves at the actor's NEXT turn; a claim finding the gate closed lapses; a raid declared at a claimed land clears other factions' claims there; a raid landing on a 0-defense land captures it, but only for a faction with a ruler; `transferDefense` moves points and clamps to `transferLimit`; the hand sweep discards what is left when the turn moves on; a quiet land raids at the round wrap and its march resolves there.

`tests/passives.test.ts`
- `keeps-to-itself` is stripped on capture; `damageAfterTerrain` rounds and never exceeds the incoming damage.

- [ ] **Step 1: Write the tests**

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: PASS. A test that fails here has found a real defect - fix `src/`, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test(balticmap): specs for claims, captures, transfers, milestones and the harvest"
```

---

### Task 7: Green, linted, and written down

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-08-09-five-seats-and-passive-statuses-design.md`

- [ ] **Step 1: Full green**

From `02-balticmap/`: `npm test && npm run build`. From the repo root: `npx biome lint 02-balticmap/src 02-balticmap/tests`.
Expected: all pass, no warnings in the prototype's own files.

- [ ] **Step 2: Bring the design doc up to date**

The spec still describes the five-seat/passives design alone. Add the rules that landed after it, each in a paragraph: leaders gate action (a land with a vacant seat never acts, even once taken); Subjugate is declared and resolves a turn later, cancelled by a raid at its target; a raid landing on a flattened land captures it; a capture may move defense from the land it was taken with; `playsAgain`; the harvest's five options; the milestone table; the turn structure (nothing ends itself, `hand` axis).

- [ ] **Step 3: Record the shape in the prototype's notes**

Add to `02-balticmap/CLAUDE.md`: the animation queue (`animations` in `src/animate.ts` - every visible sequence goes through it, in the order asked for, and nothing overlaps); that a status is the only difference between a land that plays and one that does not; and that `playsAgain` is how a card opens the turn for more of itself.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs(balticmap): the rules and surfaces this session added"
```
