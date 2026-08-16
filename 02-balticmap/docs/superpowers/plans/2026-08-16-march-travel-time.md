# March Travel Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A march moves one land per turn, so a raid out of the rear lands
later than one off the border, up to three hops away.

**Architecture:** Distance is hop count on the adjacency graph, computed by a
BFS in `src/adjacency.ts` and capped at `MAX_MARCH_HOPS`. `marchTargetsFrom`
widens from the source's neighbours to everything within that many hops, and
every declaration site sets `expiry = turn + hops` instead of `turn + 1`.
`March` gains the turn it was declared, because `Axis.opening` currently infers
that from the expiry and travel time breaks the inference. The arrow says when
it lands, on the chip behind its tail. Validity is re-decided at arrival only.

**Tech Stack:** TypeScript, Vite 5, vitest 2, happy-dom.

**Spec:** `02-balticmap/docs/superpowers/specs/2026-08-15-run-structure-attack-design.md`,
section D.

## Global Constraints

- Branch: `feature/run-structure`, continuing from stage 1. Do not merge.
- `npm test` and `npm run build` must pass before every commit. Do NOT run
  `npm run balance` or `npm run test:all`.
- No new cards, no `CardDef` change.
- A new field on a replicated type must survive `src/net-codec.ts`.
  `SerializedGameState` is checked at COMPILE time and the error names the
  field; a `Map`, `Set` or `Date` stringifies to `{}` and takes a rule with it.
- Comments explain WHY. No dates, no before/after chronicle. Plain ASCII only.
- Stage with explicit paths under `02-balticmap`. Never `git add -A`.
- After any change to what the AI may target or when a blow lands, re-run the
  stuck-seat sweep described in
  `.superpowers/sdd/2026-08-15-acting-vassals/task-2-report.md` and confirm it
  is still zero. Stage 1 closed a freeze of exactly that shape.

---

### Task 1: A march knows when it was declared

`Axis.opening` decides which side of a clash is drawn full size and which is
drawn as the answer. Its doc comment says it is "read off the expiry, which IS
the declaration turn plus one". Travel time destroys that identity, so the fact
has to be carried rather than inferred. This is first because everything else
changes expiries.

**Files:**
- Modify: `src/marches.ts` (the `March` interface, `axesOf`'s `opening`)
- Modify: every site that builds a `March` - `src/game.ts` (three), and
  `src/boot-params.ts`
- Test: `tests/marches.test.ts`, `tests/net-codec.test.ts`

**Interfaces:**
- Produces: `March.declared: number`, the turn the march was declared.

- [ ] **Step 1: Write the failing test**

In `tests/marches.test.ts`, in the `axesOf` describe:

```ts
it("reads the opening side off the declaration, not the arrival", () => {
  // A far attack declared first and a near answer declared later can land on
  // the SAME turn once travel time exists. The opening side is the one that
  // started the quarrel, which only `declared` knows.
  let marches: Marches = {};
  marches = addMarch(marches, march({
    id: 1, from: "selija", to: "talava", declared: 1, expiry: 4,
  }));
  marches = addMarch(marches, march({
    id: 2, from: "talava", to: "selija", declared: 3, expiry: 4,
  }));
  const [axis] = axesOf(marches);
  expect(axis.opening).toBe(axis.a === "selija" ? "a" : "b");
});
```

The local `march()` factory at the top of that file needs `declared: 1` added
to its defaults beside `expiry: 3`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd 02-balticmap && npx vitest run tests/marches.test.ts -t "opening side off the declaration"
```

Expected: FAIL, on `declared` not existing in the `March` type.

- [ ] **Step 3: Add the field**

In `src/marches.ts`, on the `March` interface beside `expiry`:

```ts
  /** The turn this was declared on. Carried rather than derived: `opening`
   *  used to read it off the expiry, which was the declaration turn plus one
   *  for every march there was. A march now takes a turn per land it crosses,
   *  so two arrows landing together may have set out turns apart, and the one
   *  that started the quarrel is the one drawn full size. */
  declared: number;
```

Then rewrite `opening` in `axesOf` to compare `declared`, falling back to
insertion order for two declared on the same turn - the same tie-break it
already applies, moved onto the new field.

- [ ] **Step 4: Set it at every declaration site**

```bash
grep -rn "expiry: " src/game.ts src/boot-params.ts
```

Every one of those four sites gets `declared:` set to the same turn it is
computing the expiry from. Do not change any expiry yet - that is Task 3, and
keeping this commit behaviour-neutral is what makes it reviewable.

- [ ] **Step 5: Check the wire**

```bash
npx vitest run tests/net-codec.test.ts && npm run build
```

Expected: both green. `March` is inside `GameState.marches`, a plain record of
plain objects, so a number field crosses for free - but the compile-time check
in `src/net-codec.ts` is what proves it rather than the assumption.

- [ ] **Step 6: Run the suite and commit**

```bash
npm test && npm run build
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): a march carries the turn it set out"
```

---

### Task 2: How far apart two lands are

**Files:**
- Modify: `src/adjacency.ts`
- Test: `tests/adjacency.test.ts`

**Interfaces:**
- Produces: `hopsBetween(adjacency: Record<string, string[]>, from: string, to: string, max: number): number | null`
  - the fewest lands crossed to get from `from` to `to`, 1 for neighbours,
    `null` when they are further apart than `max` or not connected at all.
  - Also `MAX_MARCH_HOPS = 3`, exported from the same module.

- [ ] **Step 1: Write the failing tests**

In `tests/adjacency.test.ts`:

```ts
describe("hopsBetween", () => {
  // a - b - c - d - e in a line, plus f attached to nothing.
  const LINE: Record<string, string[]> = {
    a: ["b"], b: ["a", "c"], c: ["b", "d"], d: ["c", "e"], e: ["d"], f: [],
  };

  it("counts a neighbour as one hop", () => {
    expect(hopsBetween(LINE, "a", "b", 3)).toBe(1);
  });

  it("counts the lands crossed, not the lands passed through", () => {
    expect(hopsBetween(LINE, "a", "c", 3)).toBe(2);
    expect(hopsBetween(LINE, "a", "d", 3)).toBe(3);
  });

  it("gives up past the maximum rather than walking the whole map", () => {
    expect(hopsBetween(LINE, "a", "e", 3)).toBeNull();
  });

  it("says nothing for a land with no path to it", () => {
    expect(hopsBetween(LINE, "a", "f", 3)).toBeNull();
  });

  it("is zero hops to itself, which is not a march anybody can declare", () => {
    expect(hopsBetween(LINE, "a", "a", 3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run tests/adjacency.test.ts -t hopsBetween
```

Expected: FAIL, `hopsBetween is not a function`.

- [ ] **Step 3: Implement**

In `src/adjacency.ts`:

```ts
/** How many lands an army crosses going from `from` to `to`: 1 for a
 *  neighbour, null past `max` or for a land there is no path to at all.
 *
 *  Bounded rather than complete on purpose. The answer is wanted for a march,
 *  a march may not cross more than `MAX_MARCH_HOPS`, and a bounded walk stops
 *  at that ring instead of touring the map for an answer the caller will throw
 *  away. */
export function hopsBetween(
  adjacency: Record<string, string[]>,
  from: string,
  to: string,
  max: number,
): number | null {
  if (from === to) return 0;
  const seen = new Set([from]);
  let ring = [from];
  for (let hops = 1; hops <= max; hops++) {
    const next: string[] = [];
    for (const land of ring) {
      for (const neighbour of adjacency[land] ?? []) {
        if (seen.has(neighbour)) continue;
        if (neighbour === to) return hops;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) return null;
    ring = next;
  }
  return null;
}
```

And beside it:

```ts
/** How far an army may march. Three, stated as a rule rather than left to
 *  emerge from how long a fight lasts: the duel clock that would have capped
 *  it does not exist yet, and without a cap every land on the map is a legal
 *  target - an aim preview lighting up all 26 and an AI scoring every faction
 *  from every source. Three also keeps the rule sayable, which an emergent cap
 *  never is. */
export const MAX_MARCH_HOPS = 3;
```

- [ ] **Step 4: Run and watch them pass**

```bash
npx vitest run tests/adjacency.test.ts && npm test
```

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/adjacency.ts 02-balticmap/tests/adjacency.test.ts
git commit -m "feat(balticmap): how far apart two lands are, bounded at the asking"
```

---

### Task 3: A march reaches three lands deep, and takes a turn per land

**Files:**
- Modify: `src/playability.ts` (`marchTargetsFrom`, `marchSourcesFor` if it
  filters on adjacency, and any block reason naming a neighbour)
- Modify: `src/game.ts` (the three declaration sites), `src/boot-params.ts`
- Test: `tests/playability.test.ts`, `tests/game.test.ts`

**Interfaces:**
- Consumes: `hopsBetween`, `MAX_MARCH_HOPS` from Task 2; `March.declared` from
  Task 1.

- [ ] **Step 1: Write the failing tests**

In `tests/playability.test.ts`, using the file's own `view()` builder and its
`LINE_ADJ` fixture (check what ids `LINE_ADJ` actually chains before writing
these - use its real ids, not these placeholders):

```ts
describe("a march reaches past the border", () => {
  it("offers a land two hops away", () => {
    const v = view({ adjacency: LINE_ADJ });
    expect(marchTargetsFrom(v, ACTOR, SOURCE)).toContain(TWO_HOPS_AWAY);
  });

  it("stops at MAX_MARCH_HOPS", () => {
    const v = view({ adjacency: LINE_ADJ });
    expect(marchTargetsFrom(v, ACTOR, SOURCE)).not.toContain(FOUR_HOPS_AWAY);
  });

  it("still refuses a peer of the actor's own realm, however close", () => {
    // The realm rule is not a distance rule and widening reach must not have
    // quietly become a way around it.
    const v = view({
      adjacency: LINE_ADJ,
      overlords: new Map([[SOURCE_FACTION, LORD], [SIBLING, LORD]]),
    });
    expect(marchTargetsFrom(v, SOURCE_FACTION, SOURCE)).not.toContain(SIBLING);
  });
});
```

In `tests/game.test.ts`, a test that declares a two-hop march and asserts its
expiry is two turns out, not one. Drive it through the real declaration path
rather than building a `March` by hand.

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run tests/playability.test.ts -t "reaches past the border"
```

Expected: FAIL - the two-hop land is not offered.

- [ ] **Step 3: Widen the reach**

In `marchTargetsFrom` (`src/playability.ts:432`), replace the `adjacent` set
with a hop test:

```ts
export function marchTargetsFrom(
  view: RulesView, actor: string, source: string, cardId = "raid",
): string[] {
  const reach = attackReach(view, actor);
  return view.factionIds.filter(
    (land) =>
      reach.has(land) &&
      marchHopsTo(view, source, land) !== null &&
      !aimsWithinOwnRealm(view, actor, cardId, land),
  );
}
```

and add beside it the one spelling of the question, so no caller re-derives it:

```ts
/** How many turns an army out of `source` spends reaching `land`, or null if
 *  it may not go that far. The ONE reader of `MAX_MARCH_HOPS` outside the
 *  constant itself: legality, the expiry the declaration sets and the arrival
 *  the arrow prints all have to agree, and three copies of a hop count is how
 *  they stop agreeing. */
export function marchHopsTo(
  view: RulesView, source: string, land: string,
): number | null {
  const hops = hopsBetween(view.adjacency, source, land, MAX_MARCH_HOPS);
  return hops === null || hops === 0 ? null : hops;
}
```

- [ ] **Step 4: Make the expiry the distance**

At each of the three `expiry: state.turn + 1` sites in `src/game.ts` and the
one in `src/boot-params.ts`, set the expiry from `marchHopsTo` instead. A site
that cannot answer the question - because the pair is out of range - must not
declare the march at all; that is already the shape `declareMarch` uses for a
source with no free army, so follow it rather than inventing a second refusal.

Set `declared` to the current turn at each site as Task 1 established.

- [ ] **Step 5: Run the tests**

```bash
npm test && npm run build
```

Read every failure. Tests asserting a march lands next turn are asserting the
old rule where the pair is adjacent - check the pair before updating, because
for an adjacent pair the answer is STILL next turn and such a test failing means
something is wrong.

- [ ] **Step 6: Sweep**

Run the stuck-seat sweep from
`.superpowers/sdd/2026-08-15-acting-vassals/task-2-report.md`. Widening what the
AI may target is the shape that froze the game in stage 1.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): an army takes a turn for every land it crosses"
```

---

### Task 4: A march is judged when it lands, not while it flies

**Files:**
- Modify: `src/game.ts` (`resolveMarches` and the per-turn re-validation around
  `src/game.ts:1697`)
- Test: `tests/marches.test.ts` or `tests/game.test.ts`, wherever the existing
  march-cancellation tests live

- [ ] **Step 1: Find the existing behaviour**

```bash
grep -n "aimsWithinOwnRealm\|callOffMarches" src/game.ts | head
```

Read what currently cancels a march mid-flight and why. There is a
`callOffMarchesAgainstLord` and a per-turn check; both were written when every
flight was one turn long, so "each turn" and "at arrival" were the same
sentence.

- [ ] **Step 2: Write the failing test**

A march declared at a land three hops away, where the target becomes a peer of
the actor's realm on the turn AFTER declaration. Assert: the arrow is still on
the board while it flies, and on arrival it lapses with a log line rather than
landing damage.

- [ ] **Step 3: Run it and watch it fail**

Expected: FAIL because the march is cancelled the moment the relation changes,
so it is not on the board to check.

- [ ] **Step 4: Move the check to arrival**

Validity is decided at declaration and re-decided at arrival, never in between.
Keep the log line: an arrow that vanishes with nothing said is the map lying
about the board, which this codebase treats as a defect rather than a rough
edge.

- [ ] **Step 5: Tests, sweep, commit**

```bash
npm test && npm run build
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): an arrow in flight is a timer, and answers on landing"
```

---

### Task 5: The arrow says when it lands

**Files:**
- Modify: `src/arrow-scene.ts` (the `ArrowSpec` and the chip behind the tail),
  `src/main.ts` (where specs are built)
- Test: `tests/arrow-scene.test.ts`

- [ ] **Step 1: Read the rule before touching the scene**

`02-balticmap/CLAUDE.md`'s arrow section is long and every paragraph of it was
paid for. Two constraints bind this task: the shaft carries exactly ONE number,
and the bare "1 STR" form is safe only because the landing-order chip sits
BEHIND the tail rather than on the shaft. So the arrival goes on that chip.
Also note that everything deciding how an arrow LOOKS belongs on its spec, and
that no pass after the paint may touch an arrow's opacity.

- [ ] **Step 2: Write the failing test**

In `tests/arrow-scene.test.ts`, following whatever that file's existing pattern
is for asserting on a rendered spec: an arrow landing this coming turn shows no
arrival text, and one landing three turns out does. The first half matters as
much as the second - every arrow saying "lands in 1" would be noise on a board
where that used to be the only possibility.

- [ ] **Step 3: Implement**

Add the arrival to `ArrowSpec` and render it on the chip. Keep it off the
shaft.

- [ ] **Step 4: Tests and commit**

```bash
npm test && npm run build
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): an arrow three turns out says so"
```

---

### Task 6: The AI discounts a distant blow

**Files:**
- Modify: `src/ai.ts` (the target scoring)
- Test: `tests/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Two candidate targets of equal value, one adjacent and one three hops away.
Assert the AI picks the near one. Build it through the real policy entry point
the other tests in that file use, not by calling a scorer directly, so the test
survives the scorer being reshaped.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL, or PASS FOR THE WRONG REASON. If it passes, find out why before
changing anything - faction sort order may be deciding it, and a test that
passes on a tie-break is not testing the rule.

- [ ] **Step 3: Add the distance term**

A blow that lands in three turns is worth less than the same blow tomorrow: the
board moves, the target heals, and the source stands soft the whole time. Keep
the shape simple and the constant named and in one place, so the playtest and
the balance suite have one dial to argue about.

- [ ] **Step 4: `POLICY_COVERAGE`**

Check whether the repo's AI-coverage test needs its entries updated now that
distance participates in target choice. The repo rule is that a branch in the
policy is named; if the entries describe target selection, they may now be
describing it wrongly.

- [ ] **Step 5: Tests, sweep, commit**

```bash
npm test && npm run build
```

Run the stuck-seat sweep again - this is the last change to what the AI does
with its turn.

```bash
git add 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): a blow three turns out is worth less than one tomorrow"
```

---

### Task 7: The gate

- [ ] **Step 1: The checks**

```bash
cd 02-balticmap && npm test && npm run build
```

Do NOT run `npm run balance`.

- [ ] **Step 2: Push and preview**

```bash
git push origin feature/run-structure
```

The preview lands at
`https://jkirsteins.github.io/prototypes/preview/feature-run-structure/02/`.

- [ ] **Step 3: Play it, and record what the spec asks**

- Does an arrow's arrival read clearly, and can you tell a three-hop march from
  a strait crossing at a glance?
- Are rear lands worth anything, or does the defender out-heal every long
  arrow? The spec names this as the most likely way the numbers are wrong.
- Does a long march leaving its source soft for three turns actually cost the
  attacker a vassal?
- Any arrow that lapsed on arrival: was the log line enough to understand why?

Boot straight into it rather than clicking:
`?seed=7&faction=selonians&turns=15` and the `march=` boot param, which
declares an arrow already in flight.

- [ ] **Step 4: Report, do not merge**

Stage 3 continues on this branch.
