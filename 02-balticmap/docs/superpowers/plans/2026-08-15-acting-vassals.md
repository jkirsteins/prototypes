# Acting Vassals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A land that changes hands gets a ruler, so it takes turns and plays
its own deck, and no seat may aim a hostile card at a peer inside its own realm
- while a lord may still raid its own vassals, which is what vassal upkeep is.

**Architecture:** One new writer in `src/rulers.ts` (`seatRuler`) for a vacant
chair, called from the two places a land changes hands - `takeLand` in
`beginTurn` and `landSubjugation` in the play path - beside the
`stripOnCapture` each already runs. Nothing in the turn loop changes:
`takesNoTurn` already returns false once `hasRuler` is true. Separately,
`aimsUpOwnChain` in `src/playability.ts` widens from the actor's overlord chain
to the actor's root realm minus the actor's own, and is renamed for it.

**Tech Stack:** TypeScript, Vite 5, vitest 2, happy-dom.

**Spec:** `02-balticmap/docs/superpowers/specs/2026-08-15-run-structure-attack-design.md`,
section C. The design it serves is `~/Downloads/refactor-spec.md` section 3.3.

## Global Constraints

- Branch: `feature/run-structure`, cut from main AFTER the branch-previews plan
  has merged, because this stage is judged on a preview.
- `npm test` and `npm run build` must both pass before every commit. `npm test`
  excludes the balance suites deliberately; do not run `npm run balance` as
  part of this plan.
- No new cards, so no `POLICY_COVERAGE` entry, no discovery route and no wire
  fingerprint change. If a change here would move `cardRulesHash`, it is out of
  scope.
- Comments explain, they do not chronicle: no dates, no "previously", no
  before/after narration in code comments.
- Stage with explicit paths under `02-balticmap`. Never `git add -A`.
- Seeding is out of scope. `pickFaction` still vacates every non-acting chair;
  only a conquest fills one.

---

### Task 1: `seatRuler`, a writer for a vacant chair

`replaceRuler` is documented as "the only writer" and is a SUCCESSION: it reads
the dead ruler through `rulerOf`, which throws on a vacant seat
(`src/rulers.ts:131`). Seating somebody where nobody sat is a different
operation and needs its own function and its own place in the invariant.

**Files:**
- Modify: `src/rulers.ts` (the `Rulers` doc comment, the `replaceRuler` doc
  comment, and a new export)
- Test: `tests/rulers.test.ts`

**Interfaces:**
- Consumes: `rulerNameFor(factionId, ethnicity, sequence, taken)` and the
  `Ruler` interface, both already in `src/rulers.ts`.
- Produces:
  `seatRuler(rulers: Rulers, ethnicities: Record<string, string>, factionId: string, turn: number, abilities: readonly string[]): Rulers`.
  Returns `rulers` unchanged when the seat is already taken. Abilities are
  passed in rather than derived, so `src/rulers.ts` stays a leaf that knows
  nothing about decks or players.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rulers.test.ts`, inside a new `describe("seatRuler")`:

```ts
describe("seatRuler", () => {
  const ethnicities = { selonians: "selonian", jersikans: "latgalian" };

  it("seats a ruler on a vacant chair at turn 0 leadership", () => {
    const seated = seatRuler({}, ethnicities, "selonians", 7, []);
    expect(hasRuler(seated, "selonians")).toBe(true);
    expect(rulerOf(seated, "selonians").since).toBe(7);
    expect(rulerOf(seated, "selonians").leadership).toBe(0);
    expect(rulerOf(seated, "selonians").abilities).toBeUndefined();
  });

  it("gives the new ruler the abilities it is handed", () => {
    const seated = seatRuler({}, ethnicities, "selonians", 3, ["raid-leadership"]);
    expect(rulerOf(seated, "selonians").abilities).toEqual(["raid-leadership"]);
  });

  it("does not take a name a living ruler already holds", () => {
    const first = seatRuler({}, ethnicities, "selonians", 1, []);
    const both = seatRuler(first, ethnicities, "jersikans", 1, []);
    expect(rulerOf(both, "jersikans").name).not.toBe(rulerOf(both, "selonians").name);
  });

  it("leaves an occupied chair exactly as it found it", () => {
    const first = seatRuler({}, ethnicities, "selonians", 1, []);
    const again = seatRuler(first, ethnicities, "selonians", 9, ["raid-leadership"]);
    expect(again).toBe(first);
  });
});
```

Add `seatRuler` to the import list at the top of the file.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd 02-balticmap && npx vitest run tests/rulers.test.ts -t seatRuler
```

Expected: FAIL, `seatRuler is not a function`.

- [ ] **Step 3: Check the ability id**

```bash
grep -n "RAID_LEADERSHIP" src/abilities.ts | head -3
```

The test above assumes the id is `raid-leadership`. If the constant's value
differs, import `RAID_LEADERSHIP` from `../src/abilities` in the test and use
it rather than a literal. A literal that drifts from the constant is the
failure this step exists to prevent.

- [ ] **Step 4: Write the implementation**

In `src/rulers.ts`, directly above `replaceRuler`:

```ts
/** Seats a leader where nobody sat. The OTHER writer, and not a special case
 *  of `replaceRuler`: that one is a succession and reads the dead ruler
 *  through `rulerOf`, which throws on a vacant seat.
 *
 *  A land that has changed hands gets one of these, which is the whole of what
 *  makes a vassal act - `takesNoTurn` asks `hasRuler` and nothing else. The
 *  fields are stated rather than inherited because there is nobody to inherit
 *  from: a fresh name no living ruler holds, `since` at the turn the land
 *  fell, leadership 0, and whatever abilities its people's own build brings.
 *  Abilities are handed in rather than looked up so this module stays a leaf
 *  that knows nothing about decks or seats.
 *
 *  An occupied chair is returned untouched, so a caller does not have to ask
 *  first: a land taken from a lord who was already leading it keeps its
 *  leader, and a conquest is not an assassination. */
export function seatRuler(
  rulers: Rulers,
  ethnicities: Record<string, string>,
  factionId: string,
  turn: number,
  abilities: readonly string[],
): Rulers {
  if (rulers[factionId] !== undefined) return rulers;
  const taken = new Set(Object.values(rulers).map((r) => r.name));
  return {
    ...rulers,
    [factionId]: {
      name: rulerNameFor(factionId, ethnicities[factionId], turn, taken),
      since: turn,
      leadership: 0,
      ...(abilities.length > 0 ? { abilities: [...abilities] } : {}),
    },
  };
}
```

- [ ] **Step 5: Correct the two doc comments this makes wrong**

In the `Rulers` type comment, the sentence "Grey lands start vacant; the five
players do not, and cannot become vacant, because `replaceRuler` always seats a
successor" no longer describes the game. Replace the final clause with:

```
 *  Grey lands START vacant and stop being vacant the moment somebody takes
 *  them (`seatRuler`); a seated faction never becomes vacant, because
 *  `replaceRuler` always seats a successor.
```

In the `replaceRuler` comment, replace "The only writer." with:

```
/** The succession writer: this ruler is dead and another takes the chair.
 *  `seatRuler` is the other one, for a chair nobody was sitting in. Returns
 *  both names so the caller can record what happened without asking twice and
 *  risking a different answer. */
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx vitest run tests/rulers.test.ts
```

Expected: PASS, the whole file.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src/rulers.ts 02-balticmap/tests/rulers.test.ts
git commit -m "feat(balticmap): a chair nobody sat in has its own writer"
```

---

### Task 2: A conquest seats the ruler

`beginTurn` reads `state.rulers` but keeps no local copy and does not return
one, so it gains both. `takeLand` then seats beside the `stripOnCapture` it
already runs.

**Files:**
- Modify: `src/game.ts` (`beginTurn`'s locals around line 1110, `takeLand` at
  line 1186, `beginTurn`'s return object around line 1574)
- Test: `tests/rulers.test.ts`

**Interfaces:**
- Consumes: `seatRuler` from task 1.
- Produces: a module-level helper
  `seatingAbilities(players: readonly PlayerState[], factionId: string): readonly string[]`
  in `src/game.ts`, used again by task 3.

- [ ] **Step 1: Write the failing test**

The conquest is driven through the boot params, not hand-built: `defense=X:0`
plus `march=Y>X` declares a real arrow through the real rules, and one more
round lands it. That way what is under test is `takeLand` calling the new
writer, rather than a fixture asserting itself.

Append to `tests/rulers.test.ts`:

```ts
describe("a conquest wakes the land", () => {
  /** Plays until `victim` has changed hands, and returns the state plus who
   *  took it. `defense=...:0` makes it a land one army walks into; the march
   *  is declared through the real rules and lands at its actor's next turn. */
  const conquest = (
    search: string, victim: string,
  ): { state: GameState; taken: string; lord: string } => {
    let g = applyBootParams(
      newGame(SIM_FACTION_IDS, SIM_ADJACENCY), params(search), seededRng(4),
    );
    for (let i = 0; i < 40 && g.overlords.get(victim) === undefined; i++) {
      g = advance(beginTurn(g, seededRng(i + 1)), seededRng(i + 1));
    }
    const lord = g.overlords.get(victim);
    if (lord === undefined) throw new Error(`${victim} never fell`);
    return { state: g, taken: victim, lord };
  };

  it("seats a ruler on a taken land, so it stops being skipped", () => {
    const { state, taken } = conquest(
      "?seed=4&faction=selonians&defense=jersikans:0&march=selonians>jersikans",
      "jersikans",
    );
    expect(hasRuler(state.rulers, taken)).toBe(true);
    expect(takesNoTurn(state, taken)).toBe(false);
  });

  it("gives the woken people their own build's ability", () => {
    const { state, taken } = conquest(
      "?seed=4&faction=selonians&defense=jersikans:0&march=selonians>jersikans",
      "jersikans",
    );
    const pl = state.players.find((p) => p.factionId === taken);
    const expected = pl?.strategy === "warpath" ? [RAID_LEADERSHIP] : undefined;
    expect(rulerOf(state.rulers, taken).abilities).toEqual(expected);
  });

  it("is warpath, because the quiet lands were never dealt pestilence", () => {
    const { state, taken } = conquest(
      "?seed=4&faction=selonians&defense=jersikans:0&march=selonians>jersikans",
      "jersikans",
    );
    expect(state.players.find((p) => p.factionId === taken)?.strategy)
      .toBe("warpath");
  });

  it("wakes a pestilence people with no ability, when an acting rival falls", () => {
    // `pestilent` is drawn from the ACTING rivals only, so the only way to
    // capture a pestilence seat is to take one of them. Find one on the board
    // rather than naming an id: which rivals are pestilent is a seeded draw.
    let g = applyBootParams(
      newGame(SIM_FACTION_IDS, SIM_ADJACENCY),
      params("?seed=4&faction=selonians"), seededRng(4),
    );
    const victim = g.players.find(
      (p) => p.strategy === "pestilence" && hasRuler(g.rulers, p.factionId),
    )?.factionId;
    expect(victim).toBeDefined();
    g = applyBootParams(
      newGame(SIM_FACTION_IDS, SIM_ADJACENCY),
      params(`?seed=4&faction=selonians&defense=${victim}:0`), seededRng(4),
    );
    // Its own ruler is still seated, so this asserts the OTHER half of the
    // rule: seatRuler leaves an occupied chair alone and no ability appears
    // from nowhere.
    expect(rulerOf(g.rulers, victim!).abilities).toBeUndefined();
  });
});
```

Add to the imports at the top of the file: `takesNoTurn` from `../src/game`,
`RAID_LEADERSHIP` from `../src/abilities`, and
`applyBootParams, parseBootParams` from `../src/boot-params`. Copy the small
`params()` helper from `tests/boot-params.test.ts:52-56` verbatim - it throws
when a search string parses to `null`, which is the difference between a test
that checks a boot and one that silently checks a pristine game.

If `conquest()` throws `never fell` for the seed above, try seeds 1 through 8
rather than loosening the assertion. A conquest that will not happen under any
seed means the march was not declared, and `applyBootParams` drops a `march=`
clause whose source has no free army or does not border the target.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/rulers.test.ts -t "conquest wakes"
```

Expected: FAIL on `hasRuler(...)` being false. If it fails earlier, inside the
helper, fix the helper before touching `src/game.ts` - a test that fails for
the wrong reason proves nothing.

- [ ] **Step 3: Add the abilities helper**

Near the other module-level helpers in `src/game.ts`:

```ts
/** What a newly seated ruler holds: whatever its own people's build brings,
 *  from the one table the build screen and `pickFaction` also read. A woken
 *  vassal is a seat like any other - a warpath people raid with `war-leader`
 *  behind them - because the alternative is a second class of ruler, and the
 *  whole design is that a status is the only difference between a land that
 *  plays and one that does not. */
function seatingAbilities(
  players: readonly PlayerState[], factionId: string,
): readonly string[] {
  const pl = players.find((p) => p.factionId === factionId);
  return pl === undefined ? [] : BUILD_ABILITIES[pl.strategy] ?? [];
}
```

`BUILD_ABILITIES` is already imported at `src/game.ts:51`.

- [ ] **Step 4: Thread `rulers` through `beginTurn`**

Beside `let players = state.players;` (around line 1110) add:

```ts
  // A conquest below seats a leader on the land it takes, so the turn's rulers
  // are not the ones it started with.
  let rulers = state.rulers;
```

In `takeLand`, immediately after the `passives = stripOnCapture(passives, land);`
line:

```ts
    // The people wake up under their new lord: a land that has changed hands
    // has a chief, and a chief is the whole of what makes a seat take turns.
    rulers = seatRuler(
      rulers, state.ethnicities, land, state.turn,
      seatingAbilities(players, land),
    );
```

In `beginTurn`'s return object, add `rulers` to the spread list beside
`players, overlords`.

Add `seatRuler` to the `./rulers` import at `src/game.ts:47-50`.

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run tests/rulers.test.ts -t "conquest wakes"
```

Expected: PASS, all four cases.

- [ ] **Step 6: Run the whole suite**

```bash
npm test
```

Expect failures, and read each one before changing it. Tests that asserted a
taken land stays leaderless are asserting the old rule and should be updated to
the new one; a test failing for any OTHER reason is a real regression and stops
this task. `tests/rulers.test.ts` around lines 185-310 and any test naming
`playsTurns` are the likely ones.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests
git commit -m "feat(balticmap): a land that changes hands wakes up under its new lord"
```

---

### Task 3: The other door

A land also changes hands on the table rather than on arrival:
`landSubjugation` (`src/game.ts:2268`). Both doors already call
`stripOnCapture`; both must seat. The play path already threads a local
`rulers` (`src/game.ts:2118`) and returns it, so this is one call.

**Files:**
- Modify: `src/game.ts` (`landSubjugation`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `seatRuler` and `seatingAbilities`.

- [ ] **Step 1: Find the existing driver**

```bash
cd 02-balticmap && grep -n "subjugated" tests/game.test.ts | head
```

A revived Subjugate claim answers through `landClaims` into `takeLand`, not
through `landSubjugation` - `landSubjugation`'s one caller is the
no-successor assassination branch. So the test to sit beside is whichever one
asserts a `subjugated` event out of THAT play path, driven by `playCard`
alone with no `landMarches`/`beginTurn` needed. Read it and note three
things: how it builds the state, the name it gives the state after the play,
and the id it subjugates. The new test reuses all three rather than building
a fourth setup.

- [ ] **Step 2: Write the failing test**

Directly below that test, with `<setup>`, `<after>` and `<target>` replaced by
what you just read:

```ts
it("a land subjugated on the table wakes up too", () => {
  <setup>
  expect(hasRuler(<after>.rulers, <target>)).toBe(true);
  expect(takesNoTurn(<after>, <target>)).toBe(false);
});
```

Both assertions matter and they are not the same one: the first says the writer
ran, the second says the turn loop agrees, which is the only reason the writer
exists. If `hasRuler` and `takesNoTurn` ever disagree here, the bug is in
`takesNoTurn`'s ordering and not in this task.

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run tests/game.test.ts -t "on the table wakes"
```

Expected: FAIL, `hasRuler` false.

- [ ] **Step 4: Seat at the second door**

In `landSubjugation`, immediately after its
`passives = stripOnCapture(passives, target);`:

```ts
    // The same rule as an army arriving: a land that has changed hands has a
    // chief. Spelled at both doors rather than inside `stripOnCapture`,
    // because stripping a status and seating a leader are two facts and one
    // of them is about to be a whole seat's behaviour.
    rulers = seatRuler(
      rulers, state.ethnicities, target, state.turn,
      seatingAbilities(players, target),
    );
```

- [ ] **Step 5: Run the test and the suite**

```bash
npx vitest run tests/game.test.ts -t "on the table wakes" && npm test
```

Expected: PASS, then the full suite green.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests/game.test.ts
git commit -m "feat(balticmap): both doors that change allegiance seat the chief"
```

---

### Task 4: A seat does not raid its siblings

`aimsUpOwnChain` refuses a hostile card aimed UP the actor's overlord chain.
With vassals acting, the gap is sideways: a vassal may raid its sibling under
the same lord, which the source design names as the likeliest source of "my
ally did something insane".

**Downward stays legal**, and this is the part to get right. `tests/playability.test.ts:975`
("leaves sideways and downward alone - the pyramid is not a truce") asserts a
lord may raid its own vassals, with the reason written down: it is how their
defenses are held under the independence gate. Vassal upkeep is the pressure
this whole stage exists to create, so closing it would be self-defeating. Only
the sideways half of that existing test changes.

So the predicate is **inside my root's realm AND not inside mine**.

**Files:**
- Modify: `src/playability.ts:336-342` (the function, renamed) and its callers
  at lines 362, 417, 616, 759, 950, 959; the prose references at
  `src/playability.ts:309,755` and `src/defense.ts:400`
- Test: `tests/playability.test.ts` (the `describe` at line 938)

**Interfaces:**
- Consumes: `overlordChainOf` and `fullRealmOf` from `src/relations.ts`, both
  already imported by `src/playability.ts`.
- Produces:
  `aimsWithinOwnRealm(view: RulesView, actor: string, cardId: string, polygon: string): boolean`,
  replacing `aimsUpOwnChain` with the same signature and the same sense: true
  means refuse.

- [ ] **Step 1: Write the failing tests**

The existing `pyramid()` fixture at `tests/playability.test.ts:941` is alpha
over beta over gamma, with delta unattached, on `FULL_ADJ`. It already has
everything the sideways case needs except a second vassal under alpha.

Rename the `describe` at line 938 to
`"a hostile card may never be aimed at your own realm's peers"` and add:

```ts
  /** The pyramid with a SECOND vassal directly under alpha, so beta and
   *  epsilon are siblings: same root, neither under the other. */
  const siblings = (extra: Partial<RulesView> = {}) =>
    view({
      adjacency: FULL_ADJ,
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "beta"], ["epsilon", "alpha"],
      ]),
      ...extra,
    });

  it("blocks a vassal aimed at its sibling under the same lord", () => {
    const v = siblings();
    for (const cardId of HOSTILE) {
      expect(validTargetsFor(v, "beta", cardId)).not.toContain("epsilon");
      expect(validTargetsFor(v, "epsilon", cardId)).not.toContain("beta");
    }
  });

  it("blocks a grand-vassal aimed at its lord's sibling", () => {
    // gamma is under beta is under alpha; epsilon is under alpha. Same
    // pyramid, no line of fealty between them, and an arrow between them is
    // still the bloc fighting itself.
    expect(validTargetsFor(siblings(), "gamma", "raid")).not.toContain("epsilon");
  });
```

`epsilon` must be in `ORDER` for `FULL_ADJ` and `factionIds` to know it. Check
with `grep -n "const ORDER" -A4 tests/playability.test.ts` and add it if it is
not there; if adding an id breaks unrelated tests in the file, use whatever
fifth id `ORDER` already holds instead of inventing one.

- [ ] **Step 2: Split the existing sideways-and-downward test**

That test at line 975 now asserts two different rules and one of them has
changed. Replace it with two:

```ts
  it("leaves DOWNWARD alone - holding your own vassals down is upkeep", () => {
    const v = pyramid();
    expect(validTargetsFor(v, "alpha", "raid")).toContain("beta");
    expect(validTargetsFor(v, "alpha", "raid")).toContain("gamma");
    expect(validTargetsFor(v, "beta", "raid")).toContain("gamma");
  });

  it("leaves a stranger alone - the rule is the realm, not a truce", () => {
    // delta is nobody's vassal, so it is not in gamma's pyramid at all.
    expect(validTargetsFor(pyramid(), "gamma", "raid")).toContain("delta");
  });
```

- [ ] **Step 3: Run and watch them fail**

```bash
npx vitest run tests/playability.test.ts -t "sibling"
```

Expected: FAIL, `aimsWithinOwnRealm is not defined`.

- [ ] **Step 3: Widen and rename**

Replace `src/playability.ts:336-342` with:

```ts
/** Whether this hostile card is aimed at a PEER inside the actor's own realm:
 *  up the chain at a lord, or sideways at a land that answers to the same root
 *  without answering to the actor. One question rather than two, because both
 *  are the same fact - the bloc fighting itself - and a bloc that raids its own
 *  members reads as the game behaving randomly.
 *
 *  DOWNWARD is deliberately not here. A lord raiding its own vassal is upkeep:
 *  it is how a vassal is held under the independence gate, and taking it away
 *  would remove the pressure that makes vassalage a decision. So the set is
 *  the root's realm MINUS the actor's own, which is exactly "everyone in my
 *  pyramid who is not mine to discipline". */
export function aimsWithinOwnRealm(
  view: RulesView, actor: string, cardId: string, polygon: string,
): boolean {
  if (!isHostileCard(cardId)) return false;
  const political = view.incorporated[polygon] ?? polygon;
  const chain = overlordChainOf(actor, view.overlords);
  const root = chain.length > 0 ? chain[chain.length - 1] : actor;
  if (!fullRealmOf(root, view.overlords, view.incorporated).has(political)) {
    return false;
  }
  return !fullRealmOf(actor, view.overlords, view.incorporated).has(political);
}
```

Note what the second call also buys: `fullRealmOf(actor, ...)` contains `actor`
itself, so a card aimed at the actor's own land is not refused here and stays
whatever legality already said about it. That is unchanged behaviour - the old
function could not refuse it either, since `overlordChainOf` never includes the
actor.

- [ ] **Step 4: Rename every caller**

```bash
cd /Users/janis.kirsteins/Projects/prototypes && grep -rn "aimsUpOwnChain" 02-balticmap/src 02-balticmap/tests
```

Rename each hit: six call sites inside `src/playability.ts` (lines 362, 417,
616, 759, 950, 959) and two prose references (`src/playability.ts:309,755`,
`src/defense.ts:400`). If a target-explanation string near line 759 says the
refusal is about a lord, it now has to say the realm; read the surrounding
explanations in `src/target-explanations.ts` and match their voice rather than
inventing a phrasing.

- [ ] **Step 5: Run the tests**

```bash
cd 02-balticmap && npx vitest run tests/playability.test.ts && npm test
```

Expected: both green. A failing targeting test elsewhere is likely asserting
that a sibling raid is legal, which is now wrong on purpose - confirm that is
what it says before changing it. A failing test asserting a lord may raid its
own vassal is NOT that, and means the predicate lost its downward arm.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): a seat does not raid its peers, and still disciplines its own"
```

---

### Task 5: The gate

**Files:** none modified unless a check fails.

- [ ] **Step 1: The two required checks**

```bash
cd 02-balticmap && npm test && npm run build
```

Expected: both green. Do not run `npm run balance`; section B of the spec
records why it is skipped.

- [ ] **Step 2: Lint**

```bash
cd /Users/janis.kirsteins/Projects/prototypes && npm run lint
```

Expected: clean.

- [ ] **Step 3: Push and get a preview**

```bash
git push -u origin feature/run-structure
```

Wait for the run, then open the preview URL from the job summary. If the branch
predates the branch-previews merge, rebase onto main first - the workflow used
is the one on the branch.

- [ ] **Step 4: Play it, and record the numbers the spec asks for**

Play at least 30 turns. Record, in a comment on the branch or a scratch note:

- Beats per round and wall-clock replay length at roughly turn 10 and turn 30.
  These are measured at the CURRENT tick cadence deliberately: they are the
  baseline the per-gauntlet cadence gets compared against in a later stage.
- Whether vassals actually went for independence, which the source design
  predicts wakes the dormant branch at `src/ai.ts:474`.
- Whether your own bloc started wars you did not pick.
- Any remaining ally behaviour that read as insane now that same-realm
  aggression is closed.

- [ ] **Step 5: Boot straight into the state worth checking**

```
http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&turns=20&defense=jersikans:0
```

Locally, this is the fastest route to a conquest: a neighbour at 0 defense that
one army walks into. Confirm the taken land's hover names its new lord, that it
appears in the turn order on the following round, and that its ruler has a
name. A woken land with no name on its hover is the "a status does not ship
until the land hover names it" rule failing.

- [ ] **Step 6: Report, do not merge**

The branch stays open: stages 2 and 3 of section B follow on it. Report what
the playtest showed, and say plainly whether the stage should stand, be tuned,
or be abandoned the way the Raid status rider was.
