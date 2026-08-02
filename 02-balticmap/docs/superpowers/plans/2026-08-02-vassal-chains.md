# Chains of Vassalage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vassals may play Subjugate and Incorporate, chains of vassalage form and are counted transitively everywhere, tribute cascades up the chain hop by hop, and only free factions win.

**Architecture:** The data model does not change - `overlords` stays a flat vassal -> lord map and chains are just entries whose lord is itself a vassal. The work is: one new chain walk in `src/relations.ts` that everything else reuses; legality swaps in `src/playability.ts` (the `liege` cycle block replaces `actor-subjugated`, and the rules that scale with a realm move from the one-level `realmOf` to the transitive `fullRealmOf`); resolution changes in `src/game.ts` (keep the subtree on Subjugate, cascade tribute with a new `tribute-forwarded` event); and the AI/prose surfaces that assumed chains cannot exist.

**Tech Stack:** Plain TypeScript + Vite, vitest, no framework. Spec: `docs/superpowers/specs/2026-08-02-vassal-chains-design.md` - read it first; every rule decision below traces to it.

## Global Constraints

- `npm test` and `npm run build` must pass at every commit (run from `02-balticmap/`).
- Never use em dashes or non-typable unicode in any code, comment, doc or commit message. Use `-` and `->`.
- Player-facing prose: card and faction names are segments (`t()`, `card()`, `faction()` from `src/rich-text.ts`), never interpolated strings; a faction name never opens a sentence; common nouns lowercase. `tests/naming-convention.test.ts` enforces this.
- Any event that moves a relation counter records `amount` and `track`, or the standings walk drifts (see `GameEvent.amount` in `src/game.ts`).
- Comments explain the rule as it is; never write "was X, now Y" or date-stamped chronicles.
- Several sessions share this branch. Stage with explicit paths under `02-balticmap/` (plus the repo `AGENTS.md` edit in Task 4). Never `git add -A`.
- End commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Transitive realm walks in relations.ts

**Files:**
- Modify: `src/relations.ts` (`fullRealmOf`, `realmRootOf`, new `overlordChainOf`)
- Test: `tests/relations.test.ts`

**Interfaces:**
- Consumes: existing `Overlords`, `Incorporated` types.
- Produces: `overlordChainOf(factionId: string, overlords: Overlords): string[]` (ancestors, nearest first, empty for a free faction); `fullRealmOf` now returns the transitive closure; `realmRootOf` now returns the true root. Tasks 2-9 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("fullRealmOf", ...)` block and add a new block in `tests/relations.test.ts` (the file already imports `realmOf, realmRootOf, fullRealmOf`; add `overlordChainOf` to that import):

```ts
  it("walks chains of vassalage to any depth, with each member's annexations", () => {
    // delta -> gamma -> beta -> alpha, and gamma has annexed epsilon
    const o = new Map([
      ["beta", "alpha"], ["gamma", "beta"], ["delta", "gamma"],
    ]);
    const inc = { epsilon: "gamma" };
    expect([...fullRealmOf("alpha", o, inc)].sort()).toEqual(
      ["alpha", "beta", "delta", "epsilon", "gamma"],
    );
    // a mid-lord's own realm is its subtree, not its lord's
    expect([...fullRealmOf("beta", o, inc)].sort()).toEqual(
      ["beta", "delta", "epsilon", "gamma"],
    );
  });

describe("overlordChainOf", () => {
  it("lists ancestors nearest first and is empty for a free faction", () => {
    const o = new Map([["gamma", "beta"], ["beta", "alpha"]]);
    expect(overlordChainOf("gamma", o)).toEqual(["beta", "alpha"]);
    expect(overlordChainOf("beta", o)).toEqual(["alpha"]);
    expect(overlordChainOf("alpha", o)).toEqual([]);
  });
});

describe("realmRootOf", () => {
  it("follows the chain to the top, through an incorporated land's owner", () => {
    const o = new Map([["gamma", "beta"], ["beta", "alpha"]]);
    expect(realmRootOf("gamma", o, {})).toBe("alpha");
    // an incorporated land resolves to its owner once, then climbs
    expect(realmRootOf("delta", o, { delta: "gamma" })).toBe("alpha");
    expect(realmRootOf("alpha", o, {})).toBe("alpha");
  });
});
```

(There may be an existing `realmRootOf` describe - if so, add the `it` cases to it instead of a new block.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/relations.test.ts`
Expected: FAIL - `overlordChainOf` not exported; the chain cases return one-level answers.

- [ ] **Step 3: Implement**

In `src/relations.ts`, add after `realmOf`:

```ts
/** Every ancestor of `factionId` in the overlord chain, nearest first: its
 *  lord, that lord's lord, and so on to the root. Empty for a free faction.
 *  The liege rule in src/playability.ts is what keeps `overlords` acyclic -
 *  a Subjugate may never target the actor's own ancestor - so this walk
 *  terminates; the `seen` set only defends against a corrupted store. */
export function overlordChainOf(
  factionId: string,
  overlords: Overlords,
): string[] {
  const chain: string[] = [];
  const seen = new Set([factionId]);
  let cur = overlords.get(factionId);
  while (cur !== undefined && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    cur = overlords.get(cur);
  }
  return chain;
}
```

Replace `realmRootOf`'s body (keep the export, update the doc comment to say it climbs the whole chain):

```ts
export function realmRootOf(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string {
  const held = incorporated[factionId] ?? factionId;
  const chain = overlordChainOf(held, overlords);
  return chain.length === 0 ? held : chain[chain.length - 1];
}
```

Replace `fullRealmOf`'s body and rewrite its doc comment - the old one promises "two steps reach everything", which chains break:

```ts
/** EVERY land under one root: vassals of vassals to any depth, plus each
 *  member's own incorporated lands. This is the answer to "how much of the
 *  map is theirs" - the scoreboard, the win condition, the postmortem, the
 *  ownership shading and the hover halo all count it. `incorporated` itself
 *  stays flat (incorporate re-parents annexations to the actor), so only the
 *  vassal edges recurse. */
export function fullRealmOf(
  root: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Set<string> {
  const members = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const member = queue.pop()!;
    for (const [vassal, lord] of overlords) {
      if (lord === member && !members.has(vassal)) {
        members.add(vassal);
        queue.push(vassal);
      }
    }
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === member && !members.has(land)) {
        members.add(land);
        queue.push(land);
      }
    }
  }
  return members;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/relations.test.ts`
Expected: PASS (including the pre-existing one-level cases, which are a subset of the transitive walk).

- [ ] **Step 5: Full suite, then commit**

Run: `npm test` - endings, shading and scoreboard callers inherit the transitive walk here; everything should still pass because no chain exists yet in any fixture. If a test fails, read it - it is asserting one-level behaviour on a hand-built chain and belongs to a later task only if it contradicts the spec.

```bash
git add 02-balticmap/src/relations.ts 02-balticmap/tests/relations.test.ts
git commit -m "feat(balticmap): transitive realm walks for chains of vassalage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Legality - the liege block replaces actor-subjugated

**Files:**
- Modify: `src/playability.ts` (`TargetBlockReason`, `targetEligibilityFor`, `subjugationRequirement`)
- Modify: `src/target-explanations.ts` (`explainReason`)
- Test: `tests/playability.test.ts`, `tests/target-explanations.test.ts`

**Interfaces:**
- Consumes: `overlordChainOf` from Task 1.
- Produces: block reason `{ code: "liege" }` replacing `{ code: "actor-subjugated" }`; `subjugationRequirement` now answers for vassal actors; `threatsTo` therefore includes vassal candidates with no code change.

- [ ] **Step 1: Write the failing tests**

In `tests/playability.test.ts` (helpers `view()` and `mightLead()` shown at the top of the file):

```ts
describe("vassal actors", () => {
  it("a vassal may Subjugate a free faction in reach", () => {
    // alpha is delta's vassal; alpha leads beta enough to take it
    const v = view({
      overlords: new Map([["alpha", "delta"]]),
      relations: mightLead("alpha", "beta", 2),
    });
    expect(validTargetsFor(v, "alpha", "subjugate")).toContain("beta");
  });

  it("a vassal may Incorporate its own vassal", () => {
    // gamma -> beta -> alpha: beta is a mid-lord digesting gamma
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      loyalty: { [loyaltyKey("gamma", "beta")]: INCORPORATE_RAMP },
    });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
  });

  it("no faction in the actor's own overlord chain is subjugable (liege)", () => {
    // gamma -> beta -> alpha; gamma has crushing leads over both
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      relations: {
        ...mightLead("gamma", "beta", 50),
        ...mightLead("gamma", "alpha", 50),
      },
    });
    const entries = targetEligibilityFor(v, "gamma", "subjugate");
    for (const liege of ["beta", "alpha"]) {
      const entry = entries.find((e) => e.factionId === liege);
      expect(entry?.state).toBe("blocked");
      if (entry?.state === "blocked") {
        expect(entry.reasons.map((r) => r.code)).toContain("liege");
      }
    }
    expect(subjugationRequirement(v, "gamma", "beta")).toBeNull();
    expect(subjugationRequirement(v, "gamma", "alpha")).toBeNull();
  });

  it("a lord may poach its own grand-vassal, flattening the pyramid", () => {
    // gamma -> beta -> alpha: alpha aims at gamma, which is beta's vassal
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
      relations: mightLead("alpha", "gamma", 20),
    });
    expect(validTargetsFor(v, "alpha", "subjugate")).toContain("gamma");
    expect(subjugationChance(v, "gamma")).toBe(POACH_CHANCE);
  });

  it("a vassal with the lead now appears among threats", () => {
    // beta is alpha's vassal but leads gamma; adjacency puts gamma in reach
    const v = view({
      overlords: new Map([["beta", "alpha"]]),
      relations: mightLead("beta", "gamma", 2),
    });
    expect(threatsTo(v, "gamma").map((t) => t.factionId)).toContain("beta");
  });
});
```

Also UPDATE the existing `subjugationRequirement` test that asserts an actor with an overlord gets `null` (around line 76-81, the `overlords: new Map([["alpha", "delta"]])` case): a vassal actor now gets real bars against a non-ancestor, so change its expectation to the numeric bars (`{ might: 2, status: 2 }` for a one-land free target).

In `tests/target-explanations.test.ts`, replace the `{ code: "actor-subjugated" }` case (line ~97) with:

```ts
        { code: "liege" },
```

and assert its wording matches the implementation below.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/playability.test.ts tests/target-explanations.test.ts`
Expected: FAIL - vassal targets refused with `actor-subjugated`, `liege` unknown.

- [ ] **Step 3: Implement**

`src/playability.ts`:

1. Import `overlordChainOf` (extend the existing `./relations` import).
2. In `TargetBlockReason`, replace `| { code: "actor-subjugated" }` with `| { code: "liege" }`.
3. In `targetEligibilityFor`, compute once before the `.map` (next to `actorOverlord`):

```ts
  // The actor's whole chain of lords. A Subjugate aimed anywhere in it would
  // close a cycle - `overlords[target] = actor` loops exactly when the target
  // is an ancestor - so this one block is the entire cycle rule. Incorporate
  // needs nothing: it only ever targets the actor's own direct vassal.
  const lieges = new Set(overlordChainOf(actorFactionId, view.overlords));
```

then replace the block

```ts
    if (
      actorOverlord !== undefined &&
      (cardId === "subjugate" || cardId === "incorporate")
    ) {
      reasons.push({ code: "actor-subjugated" });
    }
```

with

```ts
    if (cardId === "subjugate" && lieges.has(factionId)) {
      reasons.push({ code: "liege" });
    }
```

4. In `subjugationRequirement`, replace
   `if (view.overlords.get(actorFactionId) !== undefined) return null;` with

```ts
  if (overlordChainOf(actorFactionId, view.overlords).includes(targetFactionId)) {
    return null;
  }
```

   and update its doc comment: null now means self, incorporated, already your direct vassal, or your own liege - not "the actor is somebody's vassal". Note in the comment that vassal actors therefore appear in `threatsTo` and on map badges deliberately.

`src/target-explanations.ts`, in `explainReason`, replace the `actor-subjugated` case with:

```ts
    case "liege":
      return ["You owe them fealty, directly or through your lords."];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/playability.test.ts tests/target-explanations.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`. `tests/ai.test.ts` may have fixtures asserting a vassal seat cannot subjugate - if one fails, it is asserting the old rule; update it to the new rule (a vassal CAN, and the AI now uses it - Task 8 tunes the policy, but legality-level assertions change here).

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/src/target-explanations.ts 02-balticmap/tests/playability.test.ts 02-balticmap/tests/target-explanations.test.ts
git commit -m "feat(balticmap): vassals may Subjugate and Incorporate; liege block prevents cycles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: The subjugation bar counts the whole subtree

**Files:**
- Modify: `src/playability.ts` (`gripPartsOn`)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `fullRealmOf` (Task 1).
- Produces: `gripPartsOn` unchanged in signature; `lands`/`settlements`/bars now count the target's full transitive realm. Everything downstream (`subjugationGripOn`, `subjugationRequirement`, badges, tooltips, AI steps 6/9) inherits it.

- [ ] **Step 1: Write the failing test**

In `tests/playability.test.ts`, next to the existing `subjugationRequirement` cases:

```ts
  it("counts the whole pyramid: vassals of vassals and their annexations", () => {
    // beta holds gamma, gamma holds delta, delta has annexed epsilon,
    // and a settlement stands founded in delta.
    const v = view({
      factionIds: ["alpha", "beta", "gamma", "delta", "epsilon"],
      overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]),
      incorporated: { epsilon: "delta" },
      settlements: { delta: 1 },
    });
    // 4 lands (beta, gamma, delta, epsilon) at 2 each; +1 settlement on Might.
    expect(subjugationRequirement(v, "alpha", "beta"))
      .toEqual({ might: 9, status: 8 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/playability.test.ts`
Expected: FAIL - one-level realm gives `{ might: 5, status: 4 }`.

- [ ] **Step 3: Implement**

In `gripPartsOn`, replace

```ts
  const realm = realmOf(factionId, view.overlords, view.incorporated);
```

with

```ts
  const realm = [...fullRealmOf(factionId, view.overlords, view.incorporated)];
```

(add `fullRealmOf` to the `./relations` import). Rewrite the doc comment on `gripPartsOn`: taking a lord takes its pyramid (playCard no longer frees the target's vassals - Task 5), so the bar prices every land that would change hands, to any depth, plus every settlement founded in them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/playability.test.ts`
Expected: PASS - the pre-existing one-level cases are unchanged by the walk (no chains in them).

- [ ] **Step 5: Full suite, then commit**

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/tests/playability.test.ts
git commit -m "feat(balticmap): subjugation bar prices the target's full pyramid

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Reach, Raid strength, pact exclusion and settling follow the full realm

**Files:**
- Modify: `src/playability.ts` (`reachOf`, `borderStrength`, `sharedNeighboursOf`, `targetEligibilityFor` inward realm)
- Modify: `src/relations.ts` (`realmOf` doc comment only)
- Modify: `AGENTS.md` at the 02-balticmap root ("Two realm sizes" section)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `fullRealmOf`.
- Produces: no signature changes. Spec section 4: card range and Raid yield extend through the pyramid; a pact's frozen `against` list excludes both full realms; Found a settlement may target any land of the full realm.

- [ ] **Step 1: Write the failing tests**

```ts
describe("full-realm reach", () => {
  // gamma -> beta chain on the line map alpha-beta-gamma-delta:
  // beta's grand border now includes delta, through gamma.
  const chained = () => view({
    overlords: new Map([["gamma", "beta"]]),
  });

  it("reach extends through a vassal's vassal", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    // alpha's full realm is alpha+beta+gamma, whose borders include delta
    expect(reachOf(v, "alpha").has("delta")).toBe(true);
  });

  it("borderStrength counts bordering lands from the whole pyramid", () => {
    // both beta and gamma border... on the line map only gamma borders delta,
    // so strength is 1; annex beta's neighbour? Keep it direct: beta's realm
    // {beta, gamma} has exactly one land on delta's border.
    expect(borderStrength(chained(), "beta", "delta")).toBe(1);
    // and alpha is bordered by beta alone - still 1 - while a two-front realm
    // shows the sum: on the full graph beta+gamma both border alpha.
    const full = view({
      adjacency: {
        alpha: ["beta", "gamma"], beta: ["alpha", "gamma"],
        gamma: ["alpha", "beta", "delta"], delta: ["gamma"],
      },
      overlords: new Map([["gamma", "beta"]]),
    });
    expect(borderStrength(full, "beta", "alpha")).toBe(2);
  });

  it("a pact never buys a lead over the ally's grand-vassal", () => {
    // delta -> gamma (vassal) -> beta (grand lord); alpha allies beta
    const v = view({
      adjacency: {
        alpha: ["beta", "delta"], beta: ["alpha", "gamma"],
        gamma: ["beta", "delta"], delta: ["gamma", "alpha"],
      },
      overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]),
    });
    expect(sharedNeighboursOf(v, "alpha", "beta")).toEqual([]);
  });

  it("Found a settlement reaches a grand-vassal's land", () => {
    const v = view({
      overlords: new Map([["beta", "alpha"], ["gamma", "beta"]]),
    });
    expect(validTargetsFor(v, "alpha", "found-settlement")).toContain("gamma");
  });
});
```

(Adjust the import list at the top of the test file: `reachOf`, `sharedNeighboursOf` if not already imported.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/playability.test.ts`
Expected: FAIL on reach-through-chain, pact exclusion and settlement cases.

- [ ] **Step 3: Implement**

In `src/playability.ts`:

1. `reachOf`: replace the `realmOf(...)` call with `fullRealmOf(factionId, view.overlords, view.incorporated)` and iterate the set. Update the doc comment: the realm's border is the border of everything under you, to any depth - "my grand-vassal's border is my border" is the decided rule.
2. `borderStrength`: replace `realmOf(...)` with `[...fullRealmOf(actorFactionId, view.overlords, view.incorporated)]`. Doc comment: actor side counts the full pyramid; the target side stays the target plus its own annexations, because a vassal is its own faction and is raided separately. Note beside it that Raid's convex `raidYield` now scales with pyramid-wide borders - deliberate, measured by `npm run balance`.
3. `sharedNeighboursOf`: build `own` from both full realms:

```ts
  const own = new Set([
    ...fullRealmOf(a, view.overlords, view.incorporated),
    ...fullRealmOf(b, view.overlords, view.incorporated),
  ]);
```

4. `targetEligibilityFor`: the `inward` own-realm list becomes

```ts
  const ownRealm = inward
    ? [...fullRealmOf(actorFactionId, view.overlords, view.incorporated)]
    : [];
```

In `src/relations.ts`, rewrite `realmOf`'s doc comment: it is now the DIRECT holding only - what the vassal stripes draw, what the AI's incorporate scoring keeps permanent, and the shape of one fealty link - while every rule that scales with "the realm" (bar, reach, border strength, score, win) uses `fullRealmOf`.

In the 02-balticmap `AGENTS.md`, update the "Two realm sizes" section: `fullRealmOf` is transitive (chains of vassalage exist; vassals may Subjugate); the list of `realmOf` callers shrinks to the vassal stripe overlay and the AI's permanent-gain scoring; the subjugation bar, `borderStrength` and reach now use `fullRealmOf`. Keep the section's lesson (ask which question, not which function).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/playability.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`. Existing `sharedNeighboursOf`/`reachOf` tests without chains are unaffected (full realm equals direct realm when no vassal has vassals).

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/src/relations.ts 02-balticmap/tests/playability.test.ts AGENTS.md
git commit -m "feat(balticmap): reach, raid strength and settling follow the full realm

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(That `AGENTS.md` is the 02-balticmap one at the prototype root - check `git status` for its exact path before staging; another session has it mid-edit, so stage only if your hunk is isolated, otherwise leave the doc edit for a follow-up commit.)

---

### Task 5: Subjugate keeps the subtree; Incorporate frees it on purpose

**Files:**
- Modify: `src/game.ts` (subjugate and incorporate branches of `playCard`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: legality from Task 2 (vassal actors, grand-vassal poach).
- Produces: `playCard` behaviour later tasks and tests rely on: no `released` events on subjugation; `released` events on digesting a mid-lord.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts` (helpers `playingState`, `withHand`, `withRel`, `mightLead`, `rng` are at the top; `certain` below forces the poach roll to succeed):

```ts
describe("chains of vassalage", () => {
  const certain = () => 0; // rng: 0 >= POACH_CHANCE is false, so a poach lands

  it("subjugating a lord takes its whole pyramid, releasing nobody", () => {
    // gamma is alpha's vassal; human beta takes alpha (free, so certain)
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "alpha"]]) };
    g = withRel(g, mightLead({}, "beta", "alpha", 20));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, certain, "alpha");
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(after.overlords.get("gamma")).toBe("alpha"); // chain intact
    expect(after.log.some((e) => e.type === "released")).toBe(false);
  });

  it("a vassal subjugates a free faction, deepening the chain", () => {
    let g = playingState(LINE_ADJ);
    g = asVassal(g, "alpha"); // human beta owes fealty to alpha
    g = withRel(g, mightLead({}, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, certain, "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.overlords.get("beta")).toBe("alpha");
  });

  it("a poached mid-lord keeps its own vassals and its hostages of them", () => {
    // delta -> gamma -> alpha; human beta poaches gamma off alpha
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["gamma", "alpha"], ["delta", "gamma"]]),
      hostages: { delta: 2, gamma: 1 },
    };
    g = withRel(g, mightLead({}, "beta", "gamma", 30));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, certain, "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.overlords.get("delta")).toBe("gamma"); // subtree came along
    expect(after.hostages.delta).toBe(2); // gamma's hostage of delta survives
    expect(after.hostages.gamma).toBeUndefined(); // debt to alpha died with it
  });

  it("incorporating a mid-lord frees its vassals and keeps its annexations", () => {
    // beta holds alpha; alpha holds gamma (vassal) and epsilon... the map has
    // four factions, so: alpha's vassal is gamma, alpha annexed nothing.
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["alpha", "beta"], ["gamma", "alpha"]]),
      loyalty: { [loyaltyKey("alpha", "beta")]: INCORPORATE_RAMP },
      hostages: { gamma: 2 },
    };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.incorporated.alpha).toBe("beta");
    expect(after.overlords.has("gamma")).toBe(false); // freed
    expect(after.hostages.gamma).toBeUndefined(); // the debt was owed to alpha
    expect(
      after.log.filter((e) => e.type === "released")
        .map((e) => e.targetFactionId),
    ).toEqual(["gamma"]);
  });

  it("a mid-lord's revolt detaches its whole branch", () => {
    // human beta -> alpha's vassal, and beta holds gamma
    let g = playingState(LINE_ADJ);
    g = asVassal(g, "alpha");
    g = { ...g, overlords: new Map([...g.overlords, ["gamma", "beta"]]) };
    g = withHand(g, 0, ["revolt"]);
    const after = playCard(g, 0, rng());
    expect(after.overlords.has("beta")).toBe(false);
    expect(after.overlords.get("gamma")).toBe("beta"); // still beta's
  });
});
```

Check the existing test that asserts Subjugate frees the target's vassals (search `game.test.ts` for `released` near a subjugate play) - it asserts the OLD rule; rewrite it to the keep-subtree expectation rather than deleting it.

Note `mightLead` in game.test.ts has signature `(rel, actor, target, n)` - pass `{}` as the base.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL - subjugation currently frees gamma/delta.

- [ ] **Step 3: Implement**

In `playCard`'s successful-subjugate branch, delete the `freeVassalsOf(targetId);` call and put the rule in its place:

```ts
  } else if (cardId === "subjugate" && targetId !== undefined) {
    const formerLord = overlords.get(targetId);
    // The target's own vassals come along: taking a lord takes its pyramid,
    // which is why the bar in src/playability.ts prices the full realm. Its
    // hostages of them survive too - those vassalages are untouched.
    dropHostageOf(targetId); // the poached vassal's debt was to its former lord
    ...
```

(everything else in the branch is unchanged).

In the incorporate branch, replace the comment on its `freeVassalsOf(targetId);` line:

```ts
    // A real rule, not defense: digesting a mid-lord frees its vassals.
    // Fealty was to the lord that just vanished, and re-parenting them would
    // make Incorporate strictly better than the pyramid it consumes. The
    // trade is deliberate - the freed subtree leaves your full realm in
    // exchange for one permanent land - and the AI prices it (src/ai.ts).
    freeVassalsOf(targetId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

`tests/notices.test.ts` may exercise `released` lines fired by subjugation - if one fails, re-point its fixture at an incorporate-caused release (the only remaining source).

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests/game.test.ts 02-balticmap/tests/notices.test.ts
git commit -m "feat(balticmap): subjugation carries the target's subtree; digestion frees it

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Only free factions win

**Files:**
- Modify: `src/game.ts` (endings block of `playCard`)
- Test: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("only free factions win", () => {
  it("a vassal human at winSize does not win; their root unifies instead", () => {
    // human beta holds alpha and gamma (3 lands >= winSize(4) = 3), but owes
    // fealty to delta - whose realm is therefore all four lands.
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([
        ["alpha", "beta"], ["gamma", "beta"], ["beta", "delta"],
      ]),
    };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("defeat");
    const unified = after.log.find((e) => e.type === "unified");
    expect(unified?.overlordFactionId).toBe("delta");
  });

  it("a free human whose vassal's subtree also crosses still wins", () => {
    // gamma holds alpha and delta; human beta holds gamma. Both beta (4) and
    // gamma (3) cross winSize on the same board; the free root wins.
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([
        ["alpha", "gamma"], ["delta", "gamma"], ["gamma", "beta"],
      ]),
    };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("victory");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts`
Expected: the first case FAILS (vassal human currently wins).

- [ ] **Step 3: Implement**

In the endings block of `playCard`:

1. Human victory branch - add the free-faction guard and update the comment (the old "superset" note now argues the other way):

```ts
  } else if (
    humanFaction !== null &&
    // Only a free faction wins: a vassal's realm is a strict subset of its
    // root's, so victory belongs to roots - a human mid-lord must revolt
    // free before their pyramid counts as theirs.
    !overlords.has(humanFaction) &&
    fullRealmOf(humanFaction, overlords, incorporated).size >= winSize
  ) {
```

2. Unifier search - skip vassals:

```ts
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        !overlords.has(f) &&
        fullRealmOf(f, overlords, incorporated).size >= winSize,
    );
```

with a comment: a vassal subtree crossing the threshold is inside its root's realm, and the root is the unifier; skipping vassals is what makes the named unifier the root when both cross on the same play.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests/game.test.ts
git commit -m "feat(balticmap): only free factions win or unify

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Tribute cascades up the chain, one tribute-forwarded event per hop

**Files:**
- Modify: `src/game.ts` (`GameEventType`, `nestsUnderItsPlay`, tribute branch of `playCard`)
- Modify: `src/xp.ts` (`XP_TABLE`)
- Modify: `src/notices.ts` (`NOTICE_RULES` + one lines helper)
- Modify: `src/hud.ts` (`eventSegments`)
- Modify: `src/standings.ts` (`leadMovesOf`)
- Test: `tests/game.test.ts`, `tests/standings.test.ts`, `tests/naming-convention.test.ts`, `tests/notices.test.ts`

**Interfaces:**
- Consumes: `overlordChainOf` (Task 1).
- Produces: `GameEventType` gains `"tribute-forwarded"`. Event shape per hop: `{ type: "tribute-forwarded", targetFactionId: <the link it was taken from>, overlordFactionId: <the beneficiary lord>, track, amount }`, `playerId` = the original payer's seat. The union is exhaustive in four Records/switches - `nestsUnderItsPlay`, `XP_TABLE`, `NOTICE_RULES`, `eventSegments` - so this task must land as ONE commit or nothing compiles.

- [ ] **Step 1: Write the failing tests**

`tests/game.test.ts`:

```ts
describe("tribute cascade", () => {
  it("forwards per hop: each lord gains over its own vassal, to the root", () => {
    // human beta -> alpha -> gamma, and gamma has annexed delta
    let g = playingState(LINE_ADJ);
    g = asVassal(g, "alpha");
    g = {
      ...g,
      overlords: new Map([...g.overlords, ["alpha", "gamma"]]),
      incorporated: { delta: "gamma" },
    };
    g = withHand(g, 0, ["pay-military-tribute"]);
    const after = playCard(g, 0, rng());
    // hop 1: alpha (the direct lord) over beta
    expect(getRel(after.relations, "alpha", "beta").might).toBe(1);
    // hop 2: gamma over alpha - NOT over beta
    expect(getRel(after.relations, "gamma", "alpha").might).toBe(1);
    expect(getRel(after.relations, "gamma", "beta").might).toBe(0);
    // each hop's beneficiary brings its incorporated lands along
    expect(getRel(after.relations, "delta", "alpha").might).toBe(1);
    const forwarded = after.log.filter((e) => e.type === "tribute-forwarded");
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({
      targetFactionId: "alpha", overlordFactionId: "gamma",
      track: "might", amount: 1, consequence: true,
    });
  });

  it("the payer's omen stack multiplies every hop once", () => {
    let g = playingState(LINE_ADJ);
    g = asVassal(g, "alpha");
    g = {
      ...g,
      overlords: new Map([...g.overlords, ["alpha", "gamma"]]),
      omens: { beta: 1 },
    };
    g = withHand(g, 0, ["pay-status-tribute"]);
    const after = playCard(g, 0, rng());
    expect(getRel(after.relations, "alpha", "beta").status).toBe(2);
    expect(getRel(after.relations, "gamma", "alpha").status).toBe(2);
  });

  it("only the actual payer's hostage debt moves", () => {
    let g = playingState(LINE_ADJ);
    g = asVassal(g, "alpha");
    g = {
      ...g,
      overlords: new Map([...g.overlords, ["alpha", "gamma"]]),
      hostages: { beta: 2, alpha: 2 },
    };
    g = withHand(g, 0, ["pay-military-tribute"]);
    const after = playCard(g, 0, rng());
    expect(after.hostages.beta).toBe(1);
    expect(after.hostages.alpha).toBe(2); // a forwarded hop is not alpha's play
  });
});
```

`tests/standings.test.ts` - beside the existing `tribute` unit cases (mirror their ctx-building style; if none exist as units, add these using a minimal `WalkCtx`):

```ts
describe("tribute-forwarded moves", () => {
  const ctx = (H: string) => ({
    humanFactionId: H,
    factionOf: (id: number) => (id === 1 ? H : "payer"),
    leads: () => ({ might: 0, status: 0 }),
  });

  it("the human mid-link loses the amount toward the beneficiary", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "tribute-forwarded",
      targetFactionId: "me", overlordFactionId: "lord",
      track: "might", amount: 2,
    };
    expect(leadMovesOf(e, ctx("me"))).toEqual([
      { kind: "add", factionId: "lord", track: "might", delta: -2 },
    ]);
  });

  it("the human beneficiary gains the amount over the link", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "tribute-forwarded",
      targetFactionId: "mid", overlordFactionId: "me",
      track: "might", amount: 2,
    };
    expect(leadMovesOf(e, ctx("me"))).toEqual([
      { kind: "add", factionId: "mid", track: "might", delta: 2 },
    ]);
  });
});
```

`tests/naming-convention.test.ts`: find the sample-event table that drives every non-play `GameEventType` through both text producers and add two samples (human as the link, human as the beneficiary):

```ts
  { turn: 1, playerId: 2, type: "tribute-forwarded", targetFactionId: H, overlordFactionId: RIVAL, track: "might", amount: 1 },
  { turn: 1, playerId: 2, type: "tribute-forwarded", targetFactionId: RIVAL, overlordFactionId: H, track: "might", amount: 1 },
```

`tests/notices.test.ts`: assert the rule - a `tribute-forwarded` whose `targetFactionId` is the human produces a summary line, and one whose `overlordFactionId` is the human produces none (mirror how existing per-type notice tests build their ctx).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts tests/standings.test.ts`
Expected: FAIL - the type does not exist; TypeScript errors are the exhaustive Records doing their job. Add all pieces in Step 3 before re-running.

- [ ] **Step 3: Implement - every piece, one commit**

1. `src/game.ts` - union: add `| "tribute-forwarded"` after `"tribute"` in `GameEventType`.

2. `src/game.ts` - `nestsUnderItsPlay`: add `case "tribute-forwarded":` to the `return true` group (a hop is a consequence of the forced play and indents under it, one line per hop).

3. `src/game.ts` - tribute branch of `playCard`; replace from `const lord = overlords.get(p.factionId);` down to (not including) the hostage-debt block:

```ts
  } else if (isTributeCard(cardId)) {
    const lord = overlords.get(p.factionId);
    if (lord === undefined) return state;
    // Which track this card pays is the card's own business - see TRIBUTE_CARDS.
    const tributeTrack = TRIBUTE_CARDS[cardId];
    const bump = tributeTrack === "might" ? bumpMightBy : bumpStatusBy;
    // The tribute flows up the whole chain, hop by hop: each lord - and the
    // lands it has incorporated - gains over its OWN vassal, the previous
    // link, never over the original payer. The payer's omen multiplier sets
    // the amount once and that multiplied amount is what travels; mid-lords'
    // own readings are untouched. The liege rule keeps the chain acyclic, so
    // the walk ends at the root.
    const chain = overlordChainOf(p.factionId, overlords);
    let link = p.factionId;
    for (const beneficiary of chain) {
      const beneficiaries = [
        beneficiary,
        ...state.factionIds.filter((f) => incorporated[f] === beneficiary),
      ];
      for (const b of beneficiaries) {
        relations = bump(relations, b, link, mult);
      }
      events.push({
        turn: state.turn, playerId: p.id,
        type: link === p.factionId ? "tribute" : "tribute-forwarded",
        targetFactionId: link, overlordFactionId: beneficiary,
        track: tributeTrack, amount: mult,
      });
      link = beneficiary;
    }
```

   (import `overlordChainOf` from `./relations`; the hostage-debt block below stays exactly as it is - it reads `hostages[p.factionId]` and `lord`, so only the payer's debt moves.)

4. `src/xp.ts` - `XP_TABLE`:

```ts
  // Rides on somebody else's forced play: the playerId is the payer's seat,
  // and nothing about the hop was the human's choice.
  "tribute-forwarded": 0,
```

5. `src/notices.ts` - a lines helper next to `reclaimedLines`:

```ts
function tributeForwardedLines(
  events: GameEvent[],
  changes: StandingChange[][],
  _ctx: NoticeCtx,
): SummaryLine[] {
  return events.map((e, i) => ({
    text: [
      t("Tribute from your vassal passed on to "),
      faction(e.overlordFactionId ?? ""),
    ],
    changes: changesFor(i, changes),
    tone: "bad",
  }));
}
```

   and the registry entry after `tribute`:

```ts
  "tribute-forwarded": {
    kind: "modal",
    // Only the mid-lord it was taken from hears about it: their vassal's
    // forced payment moved THEIR standing toward their own lord, on a turn
    // they played nothing. The beneficiary merely benefits - the same
    // reasoning that keeps `tribute` silent - and the original payer already
    // owns the play this hop nests under.
    appliesToHuman: (e, ctx) => e.targetFactionId === ctx.humanFactionId,
    lines: tributeForwardedLines,
  },
```

   (match the `NoticeRule` type: if `critical`/`footnotes` are required rather than optional, supply `critical: () => null` / `footnotes: () => []`.)

6. `src/hud.ts` - `eventSegments`, after the `tribute` case:

```ts
    case "tribute-forwarded":
      return clause(named(e.targetFactionId), "pass", [
        t(" tribute on to "), faction(e.overlordFactionId ?? ""),
      ]);
```

7. `src/standings.ts` - `leadMovesOf`: make the existing `tribute` case handle both, since the field semantics are identical per hop:

```ts
    case "tribute":
    case "tribute-forwarded": {
```

   Extend the case's comment: for a forwarded hop, `targetFactionId` is the link the tribute was taken from and `overlordFactionId` the lord it went to; the beneficiary's incorporated lands also gain, but leads against dead factions are never displayed, so the walk ignores them - same as the first hop always has.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts tests/standings.test.ts tests/naming-convention.test.ts tests/notices.test.ts`
Expected: PASS. The naming test also proves the new lines contain no baked-in names.

- [ ] **Step 5: Full suite, then commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/src/xp.ts 02-balticmap/src/notices.ts 02-balticmap/src/hud.ts 02-balticmap/src/standings.ts 02-balticmap/tests/game.test.ts 02-balticmap/tests/standings.test.ts 02-balticmap/tests/naming-convention.test.ts 02-balticmap/tests/notices.test.ts
git commit -m "feat(balticmap): tribute cascades up the chain as tribute-forwarded hops

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: AI policy for chains

**Files:**
- Modify: `src/ai.ts` (steps 2, 3, 5, 5b, 7; `POLICY_COVERAGE`)
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: everything above. Produces: no API changes; `POLICY_COVERAGE` text is asserted by `tests/ai.test.ts` only for key coverage.

- [ ] **Step 1: Write the failing tests**

In `tests/ai.test.ts`, following its existing fixture style (it builds states via the same `newGame`/`pickFaction` route as game.test.ts; reuse its local helpers - read the file first and adapt the construction, keeping these behaviours):

```ts
describe("vassal seats use the conquest cards", () => {
  it("a vassal with the lead subjugates rather than growing crops", () => {
    // human seat irrelevant: put the AI seat (alpha) in a vassalage and give
    // it a crushing lead over a free neighbour, then ask chooseAction.
    let g = playingState(LINE_ADJ); // or this file's equivalent builder
    g = {
      ...g,
      current: 1, // alpha's seat
      overlords: new Map([["alpha", "delta"]]),
      relations: mightLead({}, "alpha", "beta", 4),
    };
    g = withHand(g, 1, ["subjugate", "grow-crops"]);
    const a = chooseAction(g);
    expect(a).toMatchObject({ type: "play", cardIndex: 0, targetId: "beta" });
  });

  it("fan-out defence now counts vassal rivals as threats", () => {
    // gamma is somebody's vassal AND leads the actor on might
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      current: 1,
      overlords: new Map([["gamma", "delta"]]),
      relations: mightLead({}, "gamma", "alpha", 3),
    };
    g = withHand(g, 1, ["fortify", "grow-crops"]);
    expect(chooseAction(g)).toMatchObject({ type: "play", cardIndex: 0 });
  });

  it("incorporate refuses a digest whose freed subtree outweighs the land kept", () => {
    // alpha's vassal beta holds gamma and delta: digesting beta keeps 1 land
    // and frees a 2-land subtree... net negative, so hold the card.
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      current: 1,
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "beta"], ["delta", "beta"],
      ]),
      loyalty: { [loyaltyKey("beta", "alpha")]: INCORPORATE_RAMP },
    };
    g = withHand(g, 1, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).toMatchObject({ type: "play", cardIndex: 1 });
  });
});
```

(Human seat 0 is beta in `playingState`; seat 1 is alpha - keep the seat/faction pairing the builder actually produces, adjusting ids if the file's helper differs. The intent of each case is the contract.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai.test.ts`
Expected: the incorporate case FAILS (old scoring counts the vassal's realm as gain); the others may already pass via legality - keep them regardless, they pin the new behaviour.

- [ ] **Step 3: Implement**

In `src/ai.ts`:

1. Step 2 comment (revolt): rewrite - a vassal CAN now Subjugate and Incorporate, and revolt still outranks them deliberately: freedom first, because only free factions win and every forced tribute feeds the whole chain above.
2. Step 3 (incorporate) - replace the scoring loop body:

```ts
      const MIN_ODDS = 0.5;
      let best: string | null = null;
      let bestScore = 0;
      for (const t of targets) {
        const odds = incorporationChance(state, p.factionId, t);
        if (odds < MIN_ODDS) continue;
        // Permanent lands kept: the target and what it annexed. Its own
        // vassals go FREE on digestion (see playCard), so their subtrees are
        // not a gain but the price - and a pyramid big enough to outweigh
        // the kept land is worth more as vassalage than as one annexation.
        const vassalsOfT = state.factionIds.filter(
          (f) => state.overlords.get(f) === t,
        );
        // realmOf counts t + its vassals + its annexations; dropping the
        // vassals leaves exactly the lands that turn permanent.
        const kept =
          realmOf(t, state.overlords, state.incorporated).length -
          vassalsOfT.length;
        const freed = vassalsOfT.reduce(
          (sum, f) =>
            sum + fullRealmOf(f, state.overlords, state.incorporated).size,
          0,
        );
        const score = odds * kept - freed;
        if (score > bestScore) {
          best = t;
          bestScore = score;
        }
      }
```

   `bestScore` starts at 0 so a net-negative digest is never picked - the policy holds the card instead.
3. Step 5 comment: the own-vassal exclusion in the alliance pick is now load-bearing, not defence in depth - vassals appear in `threatsTo`. Rewrite the comment to say exactly that.
4. Step 5b (take-hostage sizing): a revolting mid-lord walks off with its whole subtree, so replace both `realmOf(...)` calls in the sort with `fullRealmOf(...).size` (import `fullRealmOf` beside `realmOf`).
5. Step 7 (fan-out defence): remove `!state.overlords.has(f) &&` from the `threatened` filter and note why: a vassal with the lead can now Subjugate, so it is exactly as much of a threat as a free rival.
6. `POLICY_COVERAGE`: update the two entries whose meaning changed:

```ts
  "incorporate": "3: incorporate the best permanent gain net of freed vassals",
  "subjugate": "4: subjugate the biggest lead (vassal seats included)",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ai.test.ts`
Expected: PASS, including the existing POLICY_COVERAGE key-coverage test.

- [ ] **Step 5: Full suite, then commit**

```bash
git add 02-balticmap/src/ai.ts 02-balticmap/tests/ai.test.ts
git commit -m "feat(balticmap): AI plays conquest cards from vassal seats and prices digestion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Prose and map surfaces

**Files:**
- Modify: `src/view.ts` (`relationshipLine`)
- Modify: `src/cards.ts` (tribute card texts)
- Modify: `src/main.ts` (`renderThreatBadges` realm set)
- Modify: `src/notices.ts` (`released` rule doc comment only)
- Test: `tests/view.test.ts`, `tests/cards.test.ts` (only if a text-pinning test exists)

- [ ] **Step 1: Write the failing tests**

In `tests/view.test.ts`, following its existing `relationshipLine` cases (it passes a `factionName` lookup; mirror the neighbouring tests' argument style):

```ts
  it("names the direct lord and the chain's root, nothing between", () => {
    // delta -> gamma -> beta -> alpha, hovering delta as an outside human
    const o = new Map([
      ["delta", "gamma"], ["gamma", "beta"], ["beta", "alpha"],
    ]);
    expect(relationshipLine("delta", "human", o, {}, (id) => id))
      .toBe("Vassal of gamma, ultimately a vassal of alpha");
  });

  it("says so when the chain's root is the human", () => {
    const o = new Map([["delta", "gamma"], ["gamma", "human"]]);
    expect(relationshipLine("delta", "human", o, {}, (id) => id))
      .toBe("Vassal of gamma, ultimately your vassal");
  });

  it("a direct vassalage gains no ultimately clause", () => {
    const o = new Map([["delta", "gamma"]]);
    expect(relationshipLine("delta", "human", o, {}, (id) => id))
      .toBe("Vassal of gamma");
  });
```

(The existing tests show whether the `holds` suffix interleaves; if the hovered land is also a lord, the new clause goes after the direct-lord name and before `holds` - assert whatever composition reads naturally once implemented, but the three cases above are the contract.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/view.test.ts`
Expected: FAIL - no `ultimately` clause exists.

- [ ] **Step 3: Implement**

`src/view.ts`, inside `relationshipLine`:

1. Add a helper above the `held` computation:

```ts
  // The chain can run deeper than one link. Name the direct lord and, when
  // the chain's root is somebody further up, the root - the two ends are what
  // the player can act on; spelling every middle link is noise.
  const ultimately = (of: string): string => {
    const root = realmRootOf(of, overlords, incorporated);
    const direct = overlords.get(of);
    if (direct === undefined || root === direct) return "";
    return root === humanFactionId
      ? ", ultimately your vassal"
      : `, ultimately a vassal of ${factionName(root)}`;
  };
```

   (import `realmRootOf` in view.ts.)
2. In the plain-vassal tail, append it:

```ts
  return holds === null
    ? `Vassal of ${factionName(lord)}${ultimately(polygonFactionId)}`
    : `Vassal of ${factionName(lord)}${ultimately(polygonFactionId)}, ${holds}`;
```

3. In the incorporated branch, extend the existing one-level suffix the same way: after the `", itself a vassal of X"` clause, append `ultimately(owner)`. (`", itself your vassal"` needs no clause - the human end of the chain is already named.)

`src/cards.ts`: update the two tribute texts -

```ts
  "pay-military-tribute": { ...same fields..., text: "Forced: while a vassal, grant your overlord +1 Might. Overlords pass it on up their own chain of lords." },
  "pay-status-tribute": { ...same fields..., text: "Forced: while a vassal, grant your overlord +1 Status. Overlords pass it on up their own chain of lords." },
```

(keep every other field literally as it is; if `tests/cards.test.ts` pins card texts, update the pin).

`src/main.ts`, `renderThreatBadges`: replace the `realmOf` set and its now-false comment:

```ts
  // The full realm, like applyOwnership: a grand-vassal sits inside the human
  // realm's outline, and a badge floating on a land the outline claims reads
  // as a contradiction. Restive DIRECT vassals keep their unrest badge via
  // `restive` below, and while a card is armed `targets` re-narrows to what
  // is legal - so a poachable grand-vassal still badges when it matters.
  const humanRealm = fullRealmOf(
    human.factionId, game.overlords, game.incorporated,
  );
```

(`fullRealmOf` is already imported in main.ts; drop `realmOf` from the import only if this was its last use there - `renderVassalOverlay` still uses it for the stripes, which deliberately stay per direct fealty link.)

`src/notices.ts`: in the `released` rule's doc comment, replace the claim that falling to Subjugate scatters your vassals - the scatter now happens only when a mid-lord is DIGESTED (`freeVassalsOf` in the incorporate branch); a subjugated lord keeps its pyramid.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/view.test.ts tests/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, build, commit**

Run: `npm test && npm run build`

```bash
git add 02-balticmap/src/view.ts 02-balticmap/src/cards.ts 02-balticmap/src/main.ts 02-balticmap/src/notices.ts 02-balticmap/tests/view.test.ts 02-balticmap/tests/cards.test.ts
git commit -m "feat(balticmap): chain-aware hover prose, badges and tribute card texts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Evidence - full suites, balance, playtest notes

**Files:**
- Possibly modify: `tests/fixtures/*`, `tests/baseline-config.ts`, `tests/scenarios.test.ts` bands (only as their own docs direct)

- [ ] **Step 1: Full test suite and build**

Run: `npm test && npm run build` from `02-balticmap/`. Both must pass. If `tests/scenarios.test.ts` or `tests/sim.test.ts` fail on pacing bands or seeded fixtures, that is expected behaviour change, not rng drift: read the guidance comments at the top of those files and re-derive the fixture/bands the way they document (do NOT hand-tweak numbers to green).

- [ ] **Step 2: Lint from the repo root**

Run: `cd .. && npm run lint && cd 02-balticmap`
Expected: clean.

- [ ] **Step 3: Balance run**

Run: `npm run balance` (about a minute). Record in the task notes: Subjugate/Incorporate play share (both should rise - vassal seats now play them), cards never played (should be none), targeting bias, waste, and the stalemate number (full-subtree Raid should push it down or hold it; a RISE is a red flag to report, not to fix silently).

- [ ] **Step 4: Commit any re-derived fixtures**

```bash
git add 02-balticmap/tests
git commit -m "test(balticmap): re-derive seeded fixtures and pacing bands for vassal chains

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Skip if nothing changed.)

- [ ] **Step 5: Playtest note (the human gate)**

The repo card rule ends card work with judgement. Tell the user what to play and what would look wrong, concretely:

- Boot `?seed=7&turns=40` and watch for pyramids: hover a vassal-of-a-vassal and check the "Vassal of X, ultimately a vassal of Y" line, the stripes (direct lord's colour) and the root's shading agree.
- Get subjugated on purpose (`?rel=` a rival ahead), keep a vassal of your own, and pay a forced tribute: the modal/log should show your payment and, when your own vassal pays, the indented "passed on to" line with the (Might ... -> ...) suffix matching the badge.
- As a vassal, play Subjugate at a free neighbour; then check your lord's scoreboard count includes your new vassal.
- Wrong-looking things to report: a `released` line on a plain subjugation, a badge inside your realm outline on a grand-vassal, a victory screen while you still owe fealty, tribute numbers in the modal disagreeing with the log.
