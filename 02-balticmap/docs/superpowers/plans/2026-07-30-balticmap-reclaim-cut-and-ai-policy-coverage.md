# Reclaim Cut and AI Policy Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Reclaim independence, whose legality threshold scales against the overlord's realm instead of the vassal's, and give every remaining card a named branch in the AI policy enforced by a coverage test.

**Architecture:** One new unit, `threatsTo` in `src/playability.ts`, answers "who can subjugate me and by how much lead do they fall short", built on the already-centralized `targetEligibilityFor` so no legality rule is re-derived. The four defensive cards (Alliance, Assassinate ruler, Bodyguard, and the existing Fortify step) read that one function instead of inlining threat arithmetic. `chooseAction` keeps its numbered-step shape; steps are added and reordered, none are rewritten.

**Tech Stack:** TypeScript (strict), Vite, Vitest, vite-node for simulations. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-balticmap-reclaim-cut-and-ai-policy-coverage-design.md`. Read it before Task 1.
- `npm test` and `npm run build` must both pass before every commit. `build` runs `tsc` over `src` **and** `tests`, so a type error in a test fails the build.
- Never reorder the `CARDS` object literal in `src/cards.ts`. `buildAiDeck` draws one rng value per non-basic in declaration order, so reordering silently remaps every seeded deck. Deleting one entry is intended here; reordering the rest is not.
- `DEFAULT_DECK` must stay exactly `DECK_SIZE` (10) entries long. `WORLD_ARMS["full-deck"]` passes it straight to `runWorld`, which throws on any other length.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`. Other sessions work in this repo on the same branch.
- No em dashes and no non-typable characters in code, comments, commit messages or docs. Use `-`, `->`, `"`, `...`.
- `SUBJUGATE_THRESHOLD` is the only source of the number 2 in threshold arithmetic. Do not hardcode 2.
- The AGENTS.md rule this plan answers to is already committed (`5dce3e1`). No task in this plan edits it.

## Two facts the test fixtures depend on

Both are easy to get wrong and neither is obvious from reading a test.

1. **`newGame(FACTIONS)` with no adjacency argument builds a fully connected
   map.** It falls back to `factionIds.map(id => [id, everyone else])`. So in
   `tests/ai.test.ts`, alpha, beta, gamma and delta are all mutually adjacent
   and everything is in everything's reach. `tests/playability.test.ts` is the
   opposite: its `view()` helper pins `LINE_ADJ`, a four-faction line where
   alpha and delta are two steps apart.
2. **`leadsOf(a, b)` is a difference, not a pair of counters.**
   `leadsOf(a, b).might === -leadsOf(b, a).might`. Bumping Might in both
   directions cancels to a lead of zero rather than making both sides strong. To
   make two factions threaten each other, put their leads on *different* tracks:
   subjugation needs the bar on either one.

## Concurrency Precondition

**Read this before Task 1.** Another session is working in `02-balticmap` and had staged, uncommitted changes to `src/hud.ts`, `src/notices.ts`, `tests/game.test.ts`, `tests/notices.test.ts` and `tests/rulers.test.ts` when this plan was written, on top of six commits adding rulers to the event log.

- Start only from a clean `git status` for `02-balticmap`. If those files are still modified, stop and ask.
- This plan anchors edits to **symbol and test names, not line numbers**, for exactly this reason. Where a line number appears it is a hint; find the symbol.
- Tasks 3 and 4 touch `src/notices.ts`, `tests/game.test.ts` and `tests/notices.test.ts`, the three files that overlap the other session's work. Re-read each file immediately before editing it.

## File Structure

| file | responsibility | change |
| --- | --- | --- |
| `src/playability.ts` | card legality, target eligibility, threshold arithmetic | add `Threat`/`threatsTo`; delete the reclaim branch; extended-diplomacy legality |
| `src/ai.ts` | the deterministic policy | five new/changed branches, plus `POLICY_COVERAGE` |
| `src/cards.ts` | card definitions and decks | delete one `CARDS` entry and one `DEFAULT_DECK` entry |
| `src/game.ts` | state and card resolution | delete the reclaim resolution; `viewOf` gains `diplomacyBoost` |
| `src/notices.ts` | player-facing modals | collapse the two-card branch to Revolt |
| `src/sim.ts` | headless simulation and metrics | six waste/bias metrics; `runWorld` drives `chooseAction` directly |
| `src/scenarios.ts` | committed metric bands | re-measured bands |

---

### Task 1: `threatsTo`

**Files:**
- Modify: `src/playability.ts` (add after `subjugationRequirement`)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `subjugationRequirement(view, actor, target): number | null`, `targetEligibilityFor(view, actor, cardId): TargetEligibility[]`, `leadsOf(rel, a, b): {status, might}` from `./relations`.
- Produces: `export interface Threat { factionId: string; shortfall: number; statusShortfall: number; mightShortfall: number }` and `export function threatsTo(view: RulesView, factionId: string): Threat[]`. Tasks 7, 8 and 9 consume both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/playability.test.ts`. The `view()` helper and `mightLead`/`statusLead` helpers already exist at the top of that file.

```ts
describe("threatsTo", () => {
  it("reports a faction that can subjugate now at shortfall 0 or less", () => {
    // alpha and beta are adjacent; beta's realm is 1 land, so the bar is 2.
    // gamma is also adjacent to beta and so is also a threat, just a distant
    // one: threatsTo reports everyone who COULD take beta given enough lead,
    // and leaves the filtering to its callers. alpha sorts first on shortfall.
    const v = view({ relations: mightLead("alpha", "beta", 2) });
    const threats = threatsTo(v, "beta");
    expect(threats[0]).toMatchObject({ factionId: "alpha", shortfall: 0 });
    expect(threats.map((t) => t.factionId)).toEqual(["alpha", "gamma"]);
  });

  it("reports how much lead a threat still needs, per track", () => {
    const v = view({ relations: mightLead("alpha", "beta", 1) });
    const [t] = threatsTo(v, "beta");
    expect(t.shortfall).toBe(1);
    expect(t.mightShortfall).toBe(1);
    expect(t.statusShortfall).toBe(SUBJUGATE_THRESHOLD);
  });

  it("counts a faction with no lead at all as a threat needing the full bar", () => {
    expect(threatsTo(view(), "beta").map((t) => t.factionId)).toEqual([
      "alpha", "gamma",
    ]);
  });

  it("ignores factions out of reach", () => {
    // delta is two steps from beta on the line map
    expect(threatsTo(view(), "beta").map((t) => t.factionId)).not.toContain("delta");
  });

  it("ignores a faction whose pact with this one is still active", () => {
    const v = view({ alliances: { [allianceKey("alpha", "beta")]: 10 }, turn: 1 });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("ignores a subjugated faction, which cannot subjugate anyone", () => {
    const v = view({ overlords: new Map([["alpha", "delta"]]) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("ignores this faction's own overlord, which already holds it", () => {
    const v = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).not.toContain("alpha");
  });

  it("sorts by shortfall, then by faction order", () => {
    // gamma is 1 short, alpha is 2 short: gamma first despite sorting later
    const v = view({ relations: mightLead("gamma", "beta", 1) });
    expect(threatsTo(v, "beta").map((t) => t.factionId)).toEqual(["gamma", "alpha"]);
  });

  it("scales with the threatened faction's own realm", () => {
    // beta holds gamma: 2 lands, so the bar doubles and a lead of 2 is short
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(threatsTo(v, "beta")[0].shortfall).toBe(2);
  });
});
```

Add `threatsTo` to the existing import block at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/playability.test.ts -t "threatsTo"`
Expected: FAIL, `threatsTo is not a function` / TS error that it is not exported.

- [ ] **Step 3: Implement `threatsTo`**

Insert in `src/playability.ts` directly after `subjugationRequirement`, before `export type TargetBlockReason`:

```ts
export interface Threat {
  factionId: string;
  /** Lead this faction still needs on its best track. <= 0 means it can act now. */
  shortfall: number;
  statusShortfall: number;
  mightShortfall: number;
}

/** Every faction that could Subjugate `factionId` if only its lead were high
 *  enough, with how much lead each still needs. Sorted by shortfall ascending,
 *  ties by faction order.
 *
 *  Legality comes from `targetEligibilityFor` rather than being re-derived: a
 *  candidate counts only when this faction's entry is `available` (it can act
 *  now) or blocked by nothing except `insufficient-lead`. Reach, active pacts,
 *  the candidate being someone's vassal and this faction already being its
 *  vassal are therefore all handled in one place.
 *
 *  Four policy steps ask this question - Alliance, Assassinate ruler, Bodyguard
 *  and Fortify - which is why it lives here as one unit instead of four
 *  inlined copies in the AI. */
export function threatsTo(view: RulesView, factionId: string): Threat[] {
  const out: Threat[] = [];
  for (const other of view.factionIds) {
    if (other === factionId) continue;
    const required = subjugationRequirement(view, other, factionId);
    if (required === null) continue;
    const entry = targetEligibilityFor(view, other, "subjugate").find(
      (e) => e.factionId === factionId,
    );
    if (entry === undefined || entry.state === "irrelevant") continue;
    if (
      entry.state === "blocked" &&
      !(entry.reasons.length === 1 && entry.reasons[0].code === "insufficient-lead")
    ) {
      continue;
    }
    const lead = leadsOf(view.relations, other, factionId);
    out.push({
      factionId: other,
      shortfall: required - Math.max(lead.status, lead.might),
      statusShortfall: required - lead.status,
      mightShortfall: required - lead.might,
    });
  }
  const order = (id: string): number => view.factionIds.indexOf(id);
  return out.sort(
    (a, b) =>
      a.shortfall - b.shortfall || order(a.factionId) - order(b.factionId),
  );
}
```

`targetEligibilityFor` is declared below this point in the file. That is fine: function declarations hoist, and `subjugationRequirement` already sits above its own callers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/playability.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS. Nothing else calls `threatsTo` yet, so no behaviour changed.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/tests/playability.test.ts
git commit -m "feat(balticmap): name the factions that could subjugate you

Four defensive cards need the same question answered and the arithmetic
existed once, inlined in the Fortify step. threatsTo answers it from the
centralized eligibility rules, so reach, pacts and vassalage are not
re-derived per caller."
```

---

### Task 2: delete the card from the rules and the deck

**Files:**
- Modify: `src/cards.ts` (the `CARDS` entry, and `DEFAULT_DECK`)
- Modify: `src/playability.ts` (the `reclaim-independence` branch of `isCardPlayable`, near line 235)
- Modify: `src/game.ts` (the `reclaim-independence` branch of the card resolution, near line 333)
- Test: `tests/playability.test.ts`, `tests/game.test.ts`, `tests/cards.test.ts`, `tests/deck-screen.test.ts`, `tests/ai.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `CARDS` has 13 entries; `"reclaim-independence"` is not a key anywhere in `src` or `tests`. Task 10's coverage test depends on that count being complete.

- [ ] **Step 1: Delete the tests that assert the card's behaviour**

Find by test name, not line number.

- `tests/playability.test.ts`: delete `it("reclaim needs subjugation AND the overlord's lead below 2 on both tracks", ...)` and `it("reclaim scales with the overlord realm size", ...)`. The second one is one of the three inline `RulesView` literals in the file; deleting it reduces Task 4's work.
- `tests/game.test.ts`: delete `it("reclaim frees the player and strips tribute copies", ...)` and `it("reclaim is rejected while the overlord's lead is 2+", ...)`. Keep `it("revolt strips tribute, frees the vassal, ...")`, which covers the same release path.
- `tests/ai.test.ts`: delete `it("2: reclaim when playable", ...)`. Task 5 adds its replacement.

- [ ] **Step 2: Remove the id from the card-list assertions**

Delete the `"reclaim-independence"` string from the expected id arrays in `tests/cards.test.ts` (two places: the id list and the `CardDef` field table), `tests/game.test.ts` (the deck-buildable id list) and `tests/deck-screen.test.ts` (three places).

- [ ] **Step 3: Run the suite to verify it fails for the right reason**

Run: `npm test`
Expected: FAIL in `tests/cards.test.ts` and `tests/deck-screen.test.ts`, because `CARDS` and `DEFAULT_DECK` still contain the card the tests no longer expect. This is the failing-test step: the tests now describe the world we want.

- [ ] **Step 4: Delete the card definition and deck entry**

In `src/cards.ts`, delete the whole `"reclaim-independence": { ... }` line from `CARDS`. Do not move any other entry.

In `DEFAULT_DECK`, replace `"reclaim-independence"` with `"grow-crops"`:

```ts
export const DEFAULT_DECK: string[] = [
  "raid", "shrewd-marriage", "fortify", "subjugate", "incorporate",
  "grow-crops", "revolt", "assassinate-ruler", "alliance",
  "favourable-omens",
];
```

The substitution is in place rather than a deletion because `DEFAULT_DECK` must stay `DECK_SIZE` long: `WORLD_ARMS["full-deck"]` hands it to `runWorld`, which throws otherwise. Measured alternatives for the slot, 26 worlds: `extended-diplomacy` drops resolution to 53.8% at a 178-turn median, `bodyguard` to 88.5% at 130. Grow potatoes is both the best and the only one that does not change what the arm measures.

- [ ] **Step 5: Delete the legality branch**

In `src/playability.ts`, delete the entire `if (cardId === "reclaim-independence") { ... }` block from `isCardPlayable`. Leave the `overlord` local in place: the `pay-tribute` and `revolt` branches above it both read it.

- [ ] **Step 6: Delete the resolution branch**

In `src/game.ts`, delete the entire `} else if (cardId === "reclaim-independence") {` clause through to just before `} else if (cardId === "revolt") {`. Keep the `reclaimed` event type in the `GameEvent` union: Revolt still emits it.

- [ ] **Step 7: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS. If `tsc` reports the `reclaimed` event type or `cardId` field as unused, do not delete them; Revolt uses both.

**Expected interim state, do not "fix" it here.** `src/ai.ts` still holds
`idxOf("reclaim-independence")` at step 2. That is now a lookup for a card that
cannot be in any hand: dead but harmless, and it compiles because it is only a
string. Between this task and Task 5 the AI therefore has no deliberate escape
logic at all, reaching Revolt only through the last-resort step. The suite is
green and that is the point of the split: this commit is "the card is gone", and
Task 5 is "the AI decides to revolt". Do not merge the two.

- [ ] **Step 8: Commit**

```bash
git add 02-balticmap/src/cards.ts 02-balticmap/src/playability.ts 02-balticmap/src/game.ts \
  02-balticmap/tests/cards.test.ts 02-balticmap/tests/game.test.ts \
  02-balticmap/tests/playability.test.ts 02-balticmap/tests/deck-screen.test.ts \
  02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): retire Reclaim independence

Its threshold scaled against the overlord's realm while Subjugate scales
against the target's, so holding a vassal got dearer as you grew while
taking one stayed cheap. At one land the two agree; from two up a fresh
vassal walked out having done nothing. No threshold rule fixes it: the
card's legality and effect are both strict subsets of Revolt's."
```

---

### Task 3: stop the notices naming a card that no longer exists

**Files:**
- Modify: `src/notices.ts` (`buildVassalBrokeFreeNotice`)
- Modify: `src/sim.ts` (the `WORLD_ARMS` doc comment naming the card), `src/scenarios.ts` (the scenario doc comment naming it)
- Test: `tests/notices.test.ts`, `tests/meta.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no behaviour change for Revolt events. `buildVassalBrokeFreeNotice` keeps its name and signature.

**Re-read `src/notices.ts` and `tests/notices.test.ts` before editing. Both overlap the other session's work.**

- [ ] **Step 1: Update the tests first**

In `tests/notices.test.ts`:

- Delete `it("warns when a vassal reclaims independence, which costs you no standing", ...)`.
- Find the `it("is empty for every silent event type", ...)` fixture list and give its `reclaimed` entry a `cardId`, because with the branch gone every `reclaimed` event is a Revolt and the fixture must say so:

```ts
ev({ type: "reclaimed", playerId: 1, cardId: "revolt", targetFactionId: "livs", overlordFactionId: "jersika" }),
```

Add to `tests/meta.test.ts`, covering that a retired id disappears from saved progress:

```ts
it("drops a retired card id from stored progress", () => {
  const storage = memoryStorage();
  storage.setItem(
    META_STORAGE_KEY,
    JSON.stringify({
      knownCards: ["grow-crops", "raid", "reclaim-independence"],
      seenPool: ["reclaim-independence", "alliance"],
    }),
  );
  const meta = loadMeta(storage);
  expect(meta.knownCards).not.toContain("reclaim-independence");
  expect(meta.seenPool).not.toContain("reclaim-independence");
  // the ids that still exist survive
  expect(meta.knownCards).toContain("raid");
  expect(meta.seenPool).toContain("alliance");
});
```

Match the import style already at the top of `tests/meta.test.ts`; it should already import `loadMeta`, `memoryStorage` and `META_STORAGE_KEY`.

- [ ] **Step 2: Run the tests**

Run: `npm test -- tests/notices.test.ts tests/meta.test.ts`
Expected: PASS already. `isTrackable` gates on `CARDS[id]?.deckBuildable === true`, so Task 2 made the meta test pass without new code, and the notices fixture change is compatible with the branch that is still there. This step exists to prove the retired-id behaviour is real before the code is simplified on top of it.

- [ ] **Step 3: Collapse the two-card branch**

In `src/notices.ts`, replace the head of `buildVassalBrokeFreeNotice` and its doc comment:

```ts
/** A vassal of the human played Revolt, the only way out of vassalage. It also
 *  costs the human a point on each track, doubled if the vassal held a reading. */
function buildVassalBrokeFreeNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  const penalty = (e: GameEvent): string[] => {
    const n = e.doubled ? 2 : 1;
    return [`They gain ${n} Might and ${n} Status against you.`];
  };
```

Delete the `cardLabel` helper and replace its two call sites (the single-event `what` and the batched one) with the literal `Revolt`. In the single-event path:

```ts
      what: `${rebel} played Revolt and cast off your overlordship.`,
```

Find the batched path in the same function and make the equivalent substitution. Do not change `NOTICE_RULES.reclaimed` or the `"reclaimed"` case in the batch dispatcher.

- [ ] **Step 4: Update the two stale comments**

`src/sim.ts`: the `WORLD_ARMS` comment reads "a full ten-card deck also carries Fortify, Alliance, Reclaim independence and Revolt, all of which can stall or reverse a conquest". Drop "Reclaim independence and" so it reads "Fortify, Alliance and Revolt".

`src/scenarios.ts`: the comment on the potato scenario names Reclaim as the reason the potato player is outlasted. Reword to name Revolt, which now carries that role.

- [ ] **Step 5: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/notices.ts 02-balticmap/src/sim.ts 02-balticmap/src/scenarios.ts \
  02-balticmap/tests/notices.test.ts 02-balticmap/tests/meta.test.ts
git commit -m "fix(balticmap): notices stop naming a retired card

Every reclaimed event is now a Revolt, so the card-label branch and the
penalty guard both collapse. Adds the missing coverage that a retired id
drops out of saved progress on read."
```

---

### Task 4: Extended diplomacy stops being wasteable

**Files:**
- Modify: `src/playability.ts` (`RulesView`, and the `extended-diplomacy` clause of `isCardPlayable`)
- Modify: `src/game.ts` (`viewOf`)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RulesView` gains `diplomacyBoost: string[]`. Task 9's policy step relies on `isCardPlayable` enforcing this, so it must land first.

- [ ] **Step 1: Write the failing test**

Append to the card-legality `describe` block in `tests/playability.test.ts`:

```ts
it("extended diplomacy is unplayable while a boost is already held", () => {
  expect(isCardPlayable(view(), "alpha", "extended-diplomacy")).toBe(true);
  expect(
    isCardPlayable(view({ diplomacyBoost: ["alpha"] }), "alpha", "extended-diplomacy"),
  ).toBe(false);
  // someone else's boost is not yours
  expect(
    isCardPlayable(view({ diplomacyBoost: ["beta"] }), "alpha", "extended-diplomacy"),
  ).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/playability.test.ts -t "extended diplomacy is unplayable"`
Expected: FAIL. A TS error on the unknown `diplomacyBoost` property is the expected failure at this step.

- [ ] **Step 3: Add the field to `RulesView`**

In `src/playability.ts`, in the `RulesView` interface, after `omens`:

```ts
  diplomacyBoost: string[]; // faction ids holding an unspent Extended diplomacy
```

- [ ] **Step 4: Enforce it in `isCardPlayable`**

Find the combined always-playable clause and take `extended-diplomacy` out of it, then give it its own line beside its siblings:

```ts
  if (cardId === "grow-crops" || cardId === "fortify") return true;
  if (cardId === "bodyguard") return !view.bodyguards.includes(factionId);
  if (cardId === "favourable-omens") return !view.omens.includes(factionId);
  if (cardId === "extended-diplomacy") return !view.diplomacyBoost.includes(factionId);
```

All three token-holding cards now refuse to re-hold what they already have. Before this, Extended diplomacy alone returned `true` unconditionally, so a turn could be burned replacing a boost already in hand.

- [ ] **Step 5: Feed the field through**

In `src/game.ts`, add to the object `viewOf` returns:

```ts
    diplomacyBoost: state.diplomacyBoost,
```

In `tests/playability.test.ts`, add `diplomacyBoost: []` to the base object inside the `view()` helper, and to each remaining inline `RulesView` literal (there are two after Task 2 removed the third).

- [ ] **Step 6: Run the suite and build**

Run: `npm test && npm run build`
Expected: PASS. `tsc` covers `tests`, so a missed literal fails here rather than silently.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/src/game.ts 02-balticmap/tests/playability.test.ts
git commit -m "fix(balticmap): a held diplomacy boost blocks another

Bodyguard and Favourable omens both refuse to re-hold a token they
already carry; Extended diplomacy returned true unconditionally, so a
player or AI could burn a turn replacing a boost they were holding."
```

---

### Task 5: policy step 2, Revolt

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `playableSet`, `idxOf` (the local helper already inside `chooseAction`).
- Produces: step 2 of the policy is Revolt. Task 10 records it as `"2: revolt out of vassalage"`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai.test.ts`, in the priorities `describe`. `base()`, `withHand()` and `lead()` already exist at the top of that file; the actor is `alpha` at index 1.

```ts
it("2: revolts out of vassalage rather than building", () => {
  let g = base();
  g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
  g = withHand(g, ["raid", "revolt"]);
  expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
});

it("2: does not revolt when not subjugated", () => {
  let g = base();
  g = withHand(g, ["revolt", "grow-crops"]);
  // Revolt is unplayable while free, so the potato is the play
  expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
});

it("1 beats 2: a forced tribute outranks revolting", () => {
  let g = base();
  g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
  g = withHand(g, ["revolt", "pay-tribute"]);
  expect(chooseAction(g)).toEqual({
    type: "play", cardIndex: 1, tributeTrack: "might",
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/ai.test.ts -t "revolt"`
Expected: FAIL on the first test, which returns the Raid because Revolt has no branch and Raid is chosen by the build step.

- [ ] **Step 3: Replace the deleted reclaim step**

In `src/ai.ts`, where step 2 used to read the reclaim card:

```ts
  // 2: revolt out of vassalage. A vassal cannot Subjugate or Incorporate at all
  // and every forced Pay tribute compounds the lord's lead against it, so no
  // vassal turn is better spent elsewhere. Revolt carries no lead condition,
  // and its parting +1/+1 cuts the lord's lead, delaying re-subjugation.
  // Playable exactly while subjugated, so idxOf is the whole guard. A forced
  // Pay tribute still outranks it through playableSet.
  const revolt = idxOf("revolt");
  if (revolt !== undefined) return { type: "play", cardIndex: revolt };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): the AI decides to revolt

Revolt had no branch at all and reached play only through the
last-resort step, at 0.9% of plays while the strictly worse Reclaim
took its slot two times in three."
```

---

### Task 6: policy step 3, which vassal to incorporate

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `validTargetsFor`, `realmOf` (both already imported in `ai.ts`).
- Produces: step 3 picks by realm size. Task 10 records it as `"3: incorporate the largest vassal realm"`.

- [ ] **Step 1: Write the failing test**

```ts
it("3: incorporates the vassal that brings the most land", () => {
  let g = base();
  // alpha holds gamma and delta; delta has annexed a land, so it is worth more
  g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
  g = { ...g, incorporated: { beta: "delta" } };
  g = withHand(g, ["incorporate"]);
  expect(chooseAction(g)).toEqual({
    type: "play", cardIndex: 0, targetId: "delta",
  });
});

it("3: breaks a realm-size tie by faction order", () => {
  let g = base();
  g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
  g = withHand(g, ["incorporate"]);
  expect(chooseAction(g)).toEqual({
    type: "play", cardIndex: 0, targetId: "gamma",
  });
});
```

Rename the existing `it("3: incorporate the first vassal", ...)` test, whose name now describes a behaviour we are removing, or delete it if the tie-break test above covers the same state.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/ai.test.ts -t "brings the most land"`
Expected: FAIL, returns `gamma`, first in faction order.

- [ ] **Step 3: Replace the targeting**

```ts
  // 3: incorporate the vassal that brings the most land. Incorporation is
  // permanent and carries the vassal's own annexations with it, so realm size
  // is exactly the land gained - and land is the victory condition. Chains
  // cannot exist, so a vassal's realm is itself plus what it has annexed.
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "incorporate");
    if (targets.length > 0) {
      let best = targets[0];
      let bestSize = -1;
      for (const t of targets) {
        const size = realmOf(t, state.overlords, state.incorporated).length;
        if (size > bestSize) {
          best = t;
          bestSize = size;
        }
      }
      return { type: "play", cardIndex: incorporate, targetId: best };
    }
  }
```

`targets` arrives in faction order and the comparison is strict `>`, so ties keep the earliest. That is the tie-break the second test pins.

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): incorporate the vassal worth the most land

The step existed but took the first vassal in faction order, which is
the arbitrary-target pattern the repo rule names. Annexations transfer
with the vassal, so realm size is the land gained."
```

---

### Task 7: policy step 5, Alliance against an imminent threat

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `threatsTo` from Task 1, `validTargetsFor`.
- Produces: the step-5 emergency tier, and the local `threats` binding that Task 8 extends. Task 10 records `"5: emergency alliance"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("5: allies with the faction that can subjugate it now", () => {
  let g = base();
  // gamma is 1 short of taking alpha; alliance freezes it for 5 turns
  g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
  g = withHand(g, ["grow-crops", "alliance"]);
  expect(chooseAction(g)).toEqual({
    type: "play", cardIndex: 1, targetId: "gamma",
  });
});

it("5: does not ally with a faction it could subjugate itself", () => {
  let g = base();
  // beta threatens alpha AND alpha can already take beta: a pact would freeze
  // alpha's own conquest for five turns, so step 5 must decline entirely.
  // The hand carries a potato so the decline is visible: if the step fired it
  // would seal with beta, the only threat within one play.
  //
  // The two leads MUST sit on different tracks. leadsOf is a difference, so
  // bumping both directions on Might would cancel to a lead of zero and nobody
  // would threaten anyone. Subjugation needs the bar on either track, so beta
  // threatens on Might while alpha holds its own claim on Status.
  g = { ...g, relations: statusLead(lead(g.relations, "beta", "alpha", 2), "alpha", "beta", 2) };
  g = withHand(g, ["alliance", "grow-crops"]);
  expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
});

it("5: does not fire when nobody is close to subjugating it", () => {
  let g = base();
  g = withHand(g, ["alliance", "raid"]);
  // no threat within one play, so the build step takes the turn
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/ai.test.ts -t "allies with the faction"`
Expected: FAIL, the potato is played because Alliance has no branch.

- [ ] **Step 3: Add the emergency tier**

Insert between step 4 (subjugate) and the finishing raid/marriage step. Add `threatsTo` to the `./playability` import at the top of `ai.ts`.

```ts
  // 5: emergency defence, only against a threat that can subjugate this faction
  // now or after one more play. It sits below Subjugate because taking a vassal
  // is a certain gain that also raises this faction's own bar (realmOf grows,
  // so SUBJUGATE_THRESHOLD * realmOf(me) grows), and is therefore itself
  // defensive. It sits above the finishing raid because being subjugated costs
  // more than setting up next turn's conquest.
  const threats = threatsTo(v, p.factionId).filter((t) => t.shortfall <= 1);
  if (threats.length > 0) {
    const alliance = idxOf("alliance");
    if (alliance !== undefined) {
      const courtable = validTargetsFor(v, p.factionId, "alliance");
      const myTargets = validTargetsFor(v, p.factionId, "subjugate");
      // A pact blocks hostile targeted cards in BOTH directions, so allying
      // with your own best target freezes your own conquest for five turns.
      const pick = threats.find(
        (t) =>
          courtable.includes(t.factionId) &&
          !myTargets.includes(t.factionId) &&
          state.overlords.get(t.factionId) !== p.factionId,
      );
      if (pick !== undefined) {
        return { type: "play", cardIndex: alliance, targetId: pick.factionId };
      }
    }
  }
```

`threats` is already sorted by shortfall then faction order, so `find` returns the worst eligible threat and skips excluded ones rather than giving up.

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): pacts answer a threat instead of filling a turn

Alliance was the 5th most-played card and was never chosen: it reached
play through the last-resort step and took whichever target sorted
first, with 2+ legal targets 82% of the time."
```

---

### Task 8: policy step 5, Assassinate ruler against a Status threat

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: the `threats` binding from Task 7, `validTargetsFor`, `state.bodyguards`.
- Produces: Task 10 records `"5: emergency assassination"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("5: assassinates the ruler closest to taking it on Status", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
  g = withHand(g, ["grow-crops", "assassinate-ruler"]);
  expect(chooseAction(g)).toEqual({
    type: "play", cardIndex: 1, targetId: "gamma",
  });
});

it("5: ignores a Might-only threat, which levelling Status cannot help", () => {
  let g = base();
  g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
  g = withHand(g, ["assassinate-ruler", "raid"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
});

it("5: does not fire when every qualifying ruler is guarded", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
  g = { ...g, bodyguards: ["gamma"] };
  g = withHand(g, ["assassinate-ruler", "raid"]);
  // spending the card to strip a guard leaves the threat standing
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
});

it("5: prefers the alliance when both are in hand", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
  g = withHand(g, ["assassinate-ruler", "alliance"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "gamma" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/ai.test.ts -t "assassinates the ruler"`
Expected: FAIL.

- [ ] **Step 3: Extend the emergency tier**

Inside the `if (threats.length > 0) { ... }` block from Task 7, after the alliance attempt:

```ts
    const assassinate = idxOf("assassinate-ruler");
    if (assassinate !== undefined) {
      const legal = validTargetsFor(v, p.factionId, "assassinate-ruler");
      const order = (id: string): number => state.factionIds.indexOf(id);
      // Levelling Status helps only against a Status threat. Because such a
      // threat leads this faction on Status by definition, the card can never
      // destroy the actor's own lead here, so no separate guard is needed.
      // A guarded ruler is skipped: trading the card for the guard leaves the
      // threat standing, and the turn is worth more spent building.
      const pick = threats
        .filter(
          (t) =>
            t.statusShortfall <= 1 &&
            legal.includes(t.factionId) &&
            !state.bodyguards.includes(t.factionId),
        )
        .sort(
          (a, b) =>
            a.statusShortfall - b.statusShortfall ||
            order(a.factionId) - order(b.factionId),
        )[0];
      if (pick !== undefined) {
        return { type: "play", cardIndex: assassinate, targetId: pick.factionId };
      }
    }
```

The explicit sort is required: `threats` is ordered by `shortfall`, which can disagree with `statusShortfall` when the two tracks differ.

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): assassination answers a Status threat

It levels Status in both directions, so it only ever helps against a
faction leading you on Status - and it was being played as filler at
12.5% of all plays, on whichever target sorted first."
```

---

### Task 9: policy step 8, the setup tier

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `targetEligibilityFor` and `subjugationRequirement` (add both to the `./playability` import), `leadsOf`, `state.diplomacyBoost`.
- Produces: Task 10 records `"8: extend the next pact"` and `"8: post a guard"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("8: extends diplomacy only with an Alliance in hand to extend", () => {
  let g = base();
  g = withHand(g, ["extended-diplomacy", "alliance"]);
  expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
});

it("8: does not extend diplomacy with no Alliance in hand", () => {
  let g = base();
  g = withHand(g, ["extended-diplomacy", "grow-crops"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
});

it("8: an emergency alliance outranks extending the next one", () => {
  let g = base();
  g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
  g = withHand(g, ["extended-diplomacy", "alliance"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "gamma" });
});

it("8: posts a guard on a Status lead it cannot cash this turn", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 2) };
  g = withHand(g, ["bodyguard", "grow-crops"]);
  expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
});

it("8: does not post a guard when Subjugate is playable this turn", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 2) };
  g = withHand(g, ["bodyguard", "subjugate"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "beta" });
});

it("8: does not post a guard with no subjugation-grade Status lead", () => {
  let g = base();
  g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 1) };
  g = withHand(g, ["bodyguard", "grow-crops"]);
  expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/ai.test.ts -t "8:"`
Expected: FAIL on the extend and guard tests.

- [ ] **Step 3: Add both steps after the existing omens step**

```ts
  // 8b: extend the next pact. Only with an Alliance in hand and somebody to
  // seal it with, and only having reached this tier, which means no emergency
  // alliance fired - the same rule the omens step follows: a setup card must
  // never delay a play that resolves something now. isCardPlayable already
  // refuses this while a boost is held.
  const extend = idxOf("extended-diplomacy");
  if (
    extend !== undefined &&
    p.hand.includes("alliance") &&
    validTargetsFor(v, p.factionId, "alliance").length > 0
  ) {
    return { type: "play", cardIndex: extend };
  }

  // 8c: post a guard on a Status lead that cannot be cashed this turn. This is
  // exactly the position step 5's assassination hunts, so the guard answers a
  // threat the AI itself would make. A lead you can cash now needs no guard,
  // which is what the Subjugate check encodes. An `irrelevant` eligibility
  // entry means out of reach, so it is also the reach test.
  const bodyguard = idxOf("bodyguard");
  if (bodyguard !== undefined && idxOf("subjugate") === undefined) {
    const worthGuarding = targetEligibilityFor(v, p.factionId, "subjugate").some(
      (e) => {
        if (e.state === "irrelevant") return false;
        const required = subjugationRequirement(v, p.factionId, e.factionId);
        if (required === null) return false;
        return leadsOf(state.relations, p.factionId, e.factionId).status >= required;
      },
    );
    if (worthGuarding) return { type: "play", cardIndex: bodyguard };
  }
```

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): the AI invests a turn deliberately

Extended diplomacy is spent only when there is an Alliance in hand to
extend, and a Bodyguard is posted on a Status lead that cannot be cashed
this turn - the same position the new assassination step hunts."
```

---

### Task 10: the coverage map

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `CARDS`.
- Produces: `export const POLICY_COVERAGE: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
describe("POLICY_COVERAGE", () => {
  it("names a policy branch for every card in the game", () => {
    expect(Object.keys(POLICY_COVERAGE).sort()).toEqual(Object.keys(CARDS).sort());
  });

  it("names a non-empty branch for each", () => {
    for (const [id, step] of Object.entries(POLICY_COVERAGE)) {
      expect(step, id).not.toBe("");
    }
  });
});
```

Import `POLICY_COVERAGE` from `../src/ai` and `CARDS` from `../src/cards`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/ai.test.ts -t "POLICY_COVERAGE"`
Expected: FAIL, not exported.

- [ ] **Step 3: Add the map**

At the top of `src/ai.ts`, below the imports:

```ts
/** Which branch of `chooseAction` decides each card. Keyed on every id in
 *  CARDS, not just the deck-buildable ones: Pay tribute is injection-only yet
 *  reaches hands and has a real branch, so keying on `deckBuildable` would
 *  leave the most forced card in the game unguarded.
 *
 *  A card with no branch here fails a test rather than passing review. That is
 *  deliberate: four cards once shipped with no branch at all, and 27.7% of AI
 *  plays were last-resort fallthroughs as a result. See AGENTS.md. */
export const POLICY_COVERAGE: Record<string, string> = {
  "pay-tribute": "1: forced tribute",
  "revolt": "2: revolt out of vassalage",
  "incorporate": "3: incorporate the largest vassal realm",
  "subjugate": "4: subjugate the biggest lead",
  "alliance": "5: emergency alliance",
  "assassinate-ruler": "5: emergency assassination",
  "raid": "6: finishing play, else 9: build toward the closest subjugation",
  "shrewd-marriage": "6: finishing play, else 9: build toward the closest subjugation",
  "fortify": "7: defensive fortify",
  "favourable-omens": "8: read the omens before building",
  "extended-diplomacy": "8: extend the next pact",
  "bodyguard": "8: post a guard",
  "grow-crops": "10: grow crops",
};
```

- [ ] **Step 4: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "test(balticmap): a card without a policy branch fails a test

AGENTS.md asked for this in prose and four cards shipped without one
anyway. Keyed on every id in CARDS so Pay tribute is covered too."
```

---

### Task 11: waste and bias metrics

**Files:**
- Modify: `src/sim.ts` (`WorldSummary`, `runWorld`, `WorldStats`, `aggregateWorld`)
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `chooseAction` (already imported via `aiTakeTurn`; import `chooseAction` directly), `validTargetsFor`, `playCard`, `discardCard`.
- Produces: `WorldSummary` gains the six fields below; `WorldStats` gains their aggregates.

- [ ] **Step 1: Write the failing test**

```ts
it("counts a play that took the first legal target when others were legal", () => {
  const a = runWorld({ seed: 1, deck: DEFAULT_DECK, turnCap: 60 });
  expect(a.targetedPlays).toBeGreaterThan(0);
  expect(a.firstLegalTargetPlays).toBeLessThanOrEqual(a.targetedPlays);
});

it("reproduces identical summaries for identical seeds", () => {
  const a = runWorld({ seed: 7, deck: DEFAULT_DECK, turnCap: 60 });
  const b = runWorld({ seed: 7, deck: DEFAULT_DECK, turnCap: 60 });
  expect(a).toEqual(b);
});
```

The second test already exists in some form; keep the existing one and make sure it still passes after `runWorld` is restructured, since that is the guard that driving `chooseAction` directly consumes rng identically to `aiTakeTurn`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/sim.test.ts -t "first legal target"`
Expected: FAIL, `targetedPlays` does not exist.

- [ ] **Step 3: Add the fields**

In `WorldSummary`:

```ts
  /** Per-card play counts, keyed by card id. Reveals a card ignored or spammed. */
  playsByCard: Record<string, number>;
  /** Targeted plays where 2+ targets were legal, and how many took the first
   *  in faction order. A high share is the arbitrary-targeting defect. */
  targetedPlays: number;
  firstLegalTargetPlays: number;
  /** Assassinate ruler spent into a Bodyguard. */
  preventedAssassinations: number;
  /** Bodyguards posted that no assassination ever tested. */
  untestedGuards: number;
  /** Extended diplomacy plays whose boost was never spent on an Alliance. */
  unusedBoosts: number;
  /** Pacts sealed with a faction the actor could have subjugated instead. */
  alliancesOnOwnTargets: number;
```

- [ ] **Step 4: Drive `chooseAction` directly in `runWorld`**

Three of the six metrics need the legal alternatives at decision time, which the log does not record, so `runWorld` must inspect the action before applying it. Replace the `aiTakeTurn(state, rng)` call with the two calls it is made of:

```ts
  const playsByCard: Record<string, number> = {};
  let targetedPlays = 0;
  let firstLegalTargetPlays = 0;
  let boostedAlliances = 0;
  let alliancesOnOwnTargets = 0;

  while (state.phase === "playing" && state.turn <= opts.turnCap) {
    const p = state.players[state.current];
    const actor = p.factionId;
    const action = chooseAction(state);
    if (action.type === "play") {
      const cardId = p.hand[action.cardIndex];
      playsByCard[cardId] = (playsByCard[cardId] ?? 0) + 1;
      if (CARDS[cardId]?.targeted === true) {
        const legal = validTargetsFor(viewOf(state), actor, cardId);
        if (legal.length > 1) {
          targetedPlays++;
          if (action.targetId === legal[0]) firstLegalTargetPlays++;
        }
      }
      if (cardId === "alliance") {
        if (state.diplomacyBoost.includes(actor)) boostedAlliances++;
        if (
          action.targetId !== undefined &&
          validTargetsFor(viewOf(state), actor, "subjugate").includes(action.targetId)
        ) {
          alliancesOnOwnTargets++;
        }
      }
    }
    const next =
      action.type === "discard"
        ? discardCard(state, action.cardIndex)
        : playCard(state, action.cardIndex, rng, action.targetId, action.tributeTrack);
    if (!next.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${opts.seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${p.hand.join(", ")}]`,
      );
    }
    state = next.phase === "playing" ? advance(next, rng) : next;
    largestRealm = Math.max(largestRealm, biggestRealm(state));
  }
```

`aiTakeTurn` is `chooseAction` followed by exactly one of `discardCard`/`playCard`, so rng consumption is unchanged. The existing identical-seeds test is the proof; if it fails, the restructure is wrong, not the test.

The remaining three come from the log, after the loop:

```ts
  const plays = state.log.filter((e) => e.type === "play");
  const preventedAssassinations = plays.filter(
    (e) => e.cardId === "assassinate-ruler" && e.prevented === true,
  ).length;
  const guardsPosted = playsByCard["bodyguard"] ?? 0;
  const boostsPosted = playsByCard["extended-diplomacy"] ?? 0;
```

with `untestedGuards: guardsPosted - preventedAssassinations` and `unusedBoosts: boostsPosted - boostedAlliances` in the returned object. Both are counts of tokens posted and never cashed, so both floor at 0 by construction; if either goes negative a token was cashed twice and that is a bug worth the throw.

- [ ] **Step 5: Aggregate them**

Add to `WorldStats`:

```ts
  /** Pooled, not a mean of per-game ratios: a 40-turn game must not weigh the
   *  same as a 300-turn one. Null when no game offered a real target choice. */
  firstLegalTargetShare: number | null;
  /** Pooled per-card share of all plays, keyed by card id. */
  playShareByCard: Record<string, number>;
  meanPreventedAssassinations: number | null;
  meanUntestedGuards: number | null;
  meanUnusedBoosts: number | null;
  meanAlliancesOnOwnTargets: number | null;
```

and in `aggregateWorld`, beside the existing fields:

```ts
  const sum = (pick: (g: WorldSummary) => number): number =>
    games.reduce((a, g) => a + pick(g), 0);
  const targeted = sum((g) => g.targetedPlays);
  const totalPlays = games.reduce(
    (a, g) => a + Object.values(g.playsByCard).reduce((x, y) => x + y, 0),
    0,
  );
  const playShareByCard: Record<string, number> = {};
  for (const g of games) {
    for (const [id, n] of Object.entries(g.playsByCard)) {
      playShareByCard[id] = (playShareByCard[id] ?? 0) + n;
    }
  }
  for (const id of Object.keys(playShareByCard)) {
    playShareByCard[id] = totalPlays === 0 ? 0 : playShareByCard[id] / totalPlays;
  }
```

then return `firstLegalTargetShare: targeted === 0 ? null : sum((g) => g.firstLegalTargetPlays) / targeted`, `playShareByCard`, and the four means via the existing `mean(...)` helper, e.g. `meanUntestedGuards: mean(games.map((g) => g.untestedGuards))`.

- [ ] **Step 6: Run, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/sim.ts 02-balticmap/tests/sim.test.ts
git commit -m "feat(balticmap): measure wasted and arbitrary card plays

firstLegalTargetShare is the direct guard for the defect this changeset
fixes: it was 1.00 for Alliance and Assassinate ruler by construction.
The four waste counters catch a card spent on nothing."
```

---

### Task 12: re-measure every band

**Files:**
- Modify: `src/scenarios.ts` (bands only)
- Modify: `docs/superpowers/specs/2026-07-30-balticmap-reclaim-cut-and-ai-policy-coverage-design.md` (a Results section)

- [ ] **Step 1: Measure**

Run: `npm run simulate:check`
Record every metric's measured value, including the ones that pass.

- [ ] **Step 2: Compare against the predictions**

The spec's Predictions section commits to three claims before measuring. Check each and write down what actually happened:

1. Alliance and Assassinate ruler play shares fall from 14.3% and 12.5%.
2. Median end turn lands at or below 112.0 with resolution share in 93-96%.
3. If instead `unifiedShare` fell and `medianStallTurns` rose, tighten step 5's filter from `shortfall <= 1` to `shortfall <= 0` and re-measure. Do not loosen it, and do not widen a band to absorb it.

- [ ] **Step 3: Update the bands**

All seven committed scenarios may move. The four human scenarios take new enemy decks because deleting a `CARDS` entry shortens `buildAiDeck`'s rng stream by one draw; `flailing-full-deck` and `competent-full-deck` also take a changed `HUMAN_DECKS.full`; `full-deck` takes a changed deck; and `conquest-scaled` and `conquest-omens` hold Incorporate, whose targeting changed in Task 6.

Set each band from the measured value with the same margin the existing bands use, and never widen one merely to make a run pass.

- [ ] **Step 4: Write the Results section**

Append to the spec: a table of every band, its old range, its new range, its measured value, and one sentence on why it moved. Where a prediction was wrong, keep the prediction and put the measurement beside it. Precedent: the scaling-might design's correction section.

- [ ] **Step 5: Verify and commit**

Run: `npm run simulate:check && npm test && npm run build`

```bash
git add 02-balticmap/src/scenarios.ts \
  02-balticmap/docs/superpowers/specs/2026-07-30-balticmap-reclaim-cut-and-ai-policy-coverage-design.md
git commit -m "test(balticmap): re-measure the bands after the policy change"
```

---

### Task 13: verify in the real app

**Files:** none

- [ ] **Step 1: Start the root dev server**

From the repo root: `npm run dev`, then open `http://127.0.0.1:4173/prototypes/` and follow the link to this prototype. Do not serve the prototype at a bare root; its `base` is `/prototypes/02/`, so a bare root hides asset-path and landing-page problems.

- [ ] **Step 2: Check the deck screen**

Reclaim independence must be absent from the buildable list. If saved progress from an earlier run listed it, the screen must render without it and without an error.

- [ ] **Step 3: Check a survivable subjugation**

Get subjugated, pay tribute, then play Revolt. Confirm the release, the tribute copies leaving the deck, and the notice wording naming Revolt.

- [ ] **Step 4: Check the new AI behaviour is visible**

Watch the activity log across 20 turns and confirm alliances and assassinations are no longer constant background noise.

- [ ] **Step 5: Report**

State what was verified and anything that looked wrong. No commit.

---

## Notes for the executor

- Tasks 1 through 11 each leave the suite green and are independently reviewable.
- Task 12 is the only one that changes committed numbers, and it must not begin until 1 through 11 are all landed: bands measured mid-sequence describe a state that will not ship.
- If a prediction in the spec turns out wrong, that is a finding to record, not a band to widen.
