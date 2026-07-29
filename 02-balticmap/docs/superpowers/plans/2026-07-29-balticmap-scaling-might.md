# Might That Scales With The Map - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Raid's Might gain scale with how much of a target's territory you border, add a Favourable omens card that doubles your next Might or Status gain, let any faction win so a world without a human collapse has an end state, and measure whether the two dials shorten games.

**Architecture:** Rules stay split as they are today. `relations.ts` gains amount-taking bumps, `playability.ts` gains a pure `borderStrength` and learns the new card's legality, `game.ts` resolves the doubling and the new ending, `ai.ts` evaluates both dials, and `hud.ts` / `main.ts` surface them on hover. A new `runWorld` in `sim.ts` plays 26 identical seats with no privileged seat, behind a temporary `GameState.raidRule` flag that is deleted in the final task.

**Tech Stack:** TypeScript, Vite, vitest, vite-node for simulation CLIs. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md`

## Global Constraints

- Working directory is `02-balticmap`. All paths below are relative to it.
- `npm test` (vitest) and `npm run build` (`tsc` then `vite build`) must both pass before every commit.
- `vite.config.ts` must keep `base: "/prototypes/02/"`. Do not touch it.
- Stage with explicit paths scoped to `02-balticmap`. **Never `git add -A`** - other prototypes in this repo are edited concurrently by other sessions.
- Never commit `.superpowers/`.
- Writing style for all user-facing copy, comments and docs: no em dashes, no unicode arrows, no fancy quotes, no ellipsis characters. Use `-`, `->`, `"`, `'`, `...`.
- Faction naming rules already in the codebase are unchanged by this work.
- Card name is exactly `Favourable omens` (British spelling), id exactly `favourable-omens`.
- Card text is exactly: `The signs are read: your next Might or Status gain counts double.`
- `SUBJUGATE_THRESHOLD` stays 2. This plan does not touch the Subjugate formula.
- Comments explain *why*, matching the existing house style. Do not add comments that restate the code.

---

### Task 1: Amount-taking relation bumps

Raid must grant more than 1 Might, and a doubled card must grant twice its normal amount. Every relation change today is hardcoded to +1.

**Files:**
- Modify: `src/relations.ts:22-60`
- Test: `tests/relations.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `bumpMightBy(rel: Relations, actor: string, target: string, amount: number): Relations`
  - `bumpStatusBy(rel: Relations, actor: string, target: string, amount: number): Relations`
  - `bumpMightAllBy(rel: Relations, actor: string, others: string[], amount: number): Relations`
  - `bumpMight`, `bumpStatus`, `bumpMightAll` keep their existing signatures and become the amount-1 case.

- [ ] **Step 1: Write the failing test**

Append to `tests/relations.test.ts`:

```ts
describe("amount-taking bumps", () => {
  it("adds the given amount in one step", () => {
    const rel = bumpMightBy({}, "alpha", "beta", 3);
    expect(getRel(rel, "alpha", "beta").might).toBe(3);
    expect(getRel(rel, "alpha", "beta").status).toBe(0);
  });

  it("accumulates onto an existing counter", () => {
    const rel = bumpMightBy(bumpMight({}, "alpha", "beta"), "alpha", "beta", 2);
    expect(getRel(rel, "alpha", "beta").might).toBe(3);
  });

  it("bumps status the same way, leaving might alone", () => {
    const rel = bumpStatusBy({}, "alpha", "beta", 4);
    expect(getRel(rel, "alpha", "beta")).toEqual({ status: 4, might: 0 });
  });

  it("is a no-op for zero, rather than writing an empty entry", () => {
    // A zero amount must not materialise a key: `getRel` treats a missing key
    // as 0/0, and a spurious entry would make two equal boards compare unequal
    // in the simulation's reproducibility check.
    expect(bumpMightBy({}, "alpha", "beta", 0)).toEqual({});
  });

  it("bumps every other faction by the amount", () => {
    const rel = bumpMightAllBy({}, "alpha", ["beta", "gamma"], 2);
    expect(getRel(rel, "alpha", "beta").might).toBe(2);
    expect(getRel(rel, "alpha", "gamma").might).toBe(2);
  });

  it("keeps the +1 helpers behaving exactly as before", () => {
    expect(bumpMight({}, "alpha", "beta")).toEqual(bumpMightBy({}, "alpha", "beta", 1));
    expect(bumpStatus({}, "alpha", "beta")).toEqual(bumpStatusBy({}, "alpha", "beta", 1));
    expect(bumpMightAll({}, "alpha", ["beta"])).toEqual(
      bumpMightAllBy({}, "alpha", ["beta"], 1),
    );
  });
});
```

Add `bumpMightBy`, `bumpStatusBy`, `bumpMightAllBy` to the existing import from `../src/relations` at the top of the file, keeping `getRel`, `bumpMight`, `bumpStatus`, `bumpMightAll` if already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/relations.test.ts`
Expected: FAIL - `bumpMightBy is not a function` (or a TypeScript error that the export does not exist).

- [ ] **Step 3: Write minimal implementation**

In `src/relations.ts`, replace the private `bump` helper and the three exported bumps with:

```ts
function bumpBy(
  rel: Relations,
  actor: string,
  target: string,
  field: "status" | "might",
  amount: number,
): Relations {
  // A zero amount must not materialise a key; a missing key already means 0.
  if (amount <= 0) return rel;
  const cur = getRel(rel, actor, target);
  return {
    ...rel,
    [relKey(actor, target)]: { ...cur, [field]: cur[field] + amount },
  };
}

export function bumpStatusBy(
  rel: Relations, actor: string, target: string, amount: number,
): Relations {
  return bumpBy(rel, actor, target, "status", amount);
}

export function bumpMightBy(
  rel: Relations, actor: string, target: string, amount: number,
): Relations {
  return bumpBy(rel, actor, target, "might", amount);
}

export function bumpStatus(rel: Relations, actor: string, target: string): Relations {
  return bumpStatusBy(rel, actor, target, 1);
}

export function bumpMight(rel: Relations, actor: string, target: string): Relations {
  return bumpMightBy(rel, actor, target, 1);
}
```

Then replace `bumpMightAll` with:

```ts
/** +amount might from actor toward every id in others (the Fortify effect). */
export function bumpMightAllBy(
  rel: Relations, actor: string, others: string[], amount: number,
): Relations {
  let out = rel;
  for (const target of others) out = bumpMightBy(out, actor, target, amount);
  return out;
}

export function bumpMightAll(
  rel: Relations, actor: string, others: string[],
): Relations {
  return bumpMightAllBy(rel, actor, others, 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all files. Every existing caller of `bumpMight` / `bumpStatus` / `bumpMightAll` is untouched because their signatures did not change.

- [ ] **Step 5: Commit**

```bash
git add src/relations.ts tests/relations.test.ts
git commit -m "refactor(balticmap): let relation bumps take an amount"
```

---

### Task 2: borderStrength

The pure rules function behind Raid's new gain. It counts nothing about cards, so it belongs with the other rules predicates in `playability.ts`.

**Files:**
- Modify: `src/playability.ts` (add after `reachOf`, around line 30)
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `realmOf` from `src/relations.ts` (already imported by `playability.ts`), `RulesView`.
- Produces: `borderStrength(view: RulesView, actorFactionId: string, targetFactionId: string): number`

- [ ] **Step 1: Write the failing test**

Append to `tests/playability.test.ts`. The file already defines `ORDER`, `LINE_ADJ` (`alpha - beta - gamma - delta` in a line) and the `view()` helper; reuse them.

```ts
describe("borderStrength", () => {
  it("counts one for a lone faction touching the target", () => {
    expect(borderStrength(view(), "alpha", "beta")).toBe(1);
  });

  it("counts the actor's vassals that touch the target", () => {
    // alpha holds gamma as a vassal. alpha touches beta, gamma touches beta.
    const v = view({ overlords: new Map([["gamma", "alpha"]]) });
    expect(borderStrength(v, "alpha", "beta")).toBe(2);
  });

  it("counts lands the actor has incorporated", () => {
    const v = view({ incorporated: { gamma: "alpha" } });
    expect(borderStrength(v, "alpha", "beta")).toBe(2);
  });

  it("counts lands the target has incorporated as the target", () => {
    // beta is dead land owned by gamma, so alpha's border with beta is a
    // border with gamma.
    const v = view({ incorporated: { beta: "gamma" } });
    expect(borderStrength(v, "alpha", "gamma")).toBe(1);
  });

  it("does not count the target's vassals as the target", () => {
    // beta is gamma's vassal, not gamma's land. alpha touches beta only, so
    // alpha has no border with gamma at all - which is also why Raid on gamma
    // is not legal here.
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(borderStrength(v, "alpha", "gamma")).toBe(0);
    expect(validTargetsFor(v, "alpha", "raid")).not.toContain("gamma");
  });

  it("never yields 0 for a target Raid actually allows", () => {
    // The invariant the whole design leans on: legality and the gain are
    // derived from one adjacency resolution, so they cannot disagree.
    const v = view({
      overlords: new Map([["gamma", "alpha"]]),
      incorporated: { delta: "beta" },
    });
    for (const actor of ORDER) {
      for (const target of validTargetsFor(v, actor, "raid")) {
        expect(borderStrength(v, actor, target)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
```

Add `borderStrength` to the existing import from `../src/playability`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/playability.test.ts`
Expected: FAIL - `borderStrength` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/playability.ts`, directly below `reachOf`:

```ts
/** How many lands of the actor's realm border the target's core - the target
 *  itself, or a land the target has incorporated. The target's vassals resolve
 *  to themselves, not to their lord.
 *
 *  This mirrors `reachOf`'s `incorporated[adj] ?? adj` resolution deliberately.
 *  Because legality and this number come from the same rule, a Raid that the
 *  rules allow always has at least one bordering land, so the gain is never 0
 *  and the number on the tooltip can never contradict the target being
 *  offered. */
export function borderStrength(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
): number {
  const realm = realmOf(actorFactionId, view.overlords, view.incorporated);
  return realm.filter((member) =>
    (view.adjacency[member] ?? []).some(
      (adj) => (view.incorporated[adj] ?? adj) === targetFactionId,
    ),
  ).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/playability.ts tests/playability.test.ts
git commit -m "feat(balticmap): count how much of a target's border you hold"
```

---

### Task 3: Raid scales, behind the temporary raidRule flag

**Files:**
- Modify: `src/game.ts` (the `GameState` interface, `newGame`, the `raid` branch of `playCard`)
- Modify: `src/cards.ts` (Raid's rules text, which currently promises a flat +1)
- Test: `tests/game.test.ts`, and any test asserting Raid's old text

**Interfaces:**
- Consumes: `borderStrength` (Task 2), `bumpMightBy` (Task 1).
- Produces:
  - `export type RaidRule = "border" | "flat";`
  - `GameState.raidRule: RaidRule` - **required, no `?`, no `?? "border"` fallback anywhere.** Every `GameState` construction site must state a value, which is the whole point: a defaulted flag is one that can be silently wrong. Today the only construction site is `newGame`; everything else spreads an existing state.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`. The file already defines `FACTIONS`, `LINE_ADJ`, `playingState`, `withHand`, `withRel`, `seededRng`.

```ts
describe("raid gain", () => {
  it("grants one Might for a single bordering land", () => {
    // beta is the human; beta borders alpha and gamma.
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(1);
  });

  it("grants one Might per bordering land of the actor's realm", () => {
    // Give beta gamma as a vassal. beta borders alpha; gamma does not.
    // Now make a map where both do.
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["gamma"],
    };
    let g = playingState(ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(2);
  });

  it("grants a flat one under the flat rule", () => {
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["gamma"],
    };
    let g = playingState(ADJ);
    g = { ...g, raidRule: "flat", overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(1);
  });

  it("defaults a real game to the border rule", () => {
    expect(newGame(FACTIONS).raidRule).toBe("border");
  });

  it("no longer promises a flat +1 in its rules text", () => {
    expect(CARDS["raid"].text).not.toContain("+1 Might over one faction");
    expect(CARDS["raid"].text).toContain("border");
  });
});
```

Ensure `getRel` is in the import from `../src/relations` at the top of the file (it already is).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game.test.ts`
Expected: FAIL - `raidRule` does not exist on `GameState`, and the multi-border case gives 1 instead of 2.

- [ ] **Step 3: Write minimal implementation**

In `src/cards.ts`, replace Raid's `text` so it stops promising a flat +1. The card is the only place a player learns the rule, and hover (Task 8) shows the actual number per target:

```ts
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Might over one faction in reach for each of your lands on their border." },
```

Search the tests for the old string `Gain +1 Might over one faction in reach of your realm.` and update any assertion that carries it.

In `src/game.ts`, add the import of `borderStrength` to the existing `./playability` import and `bumpMightBy` to the existing `./relations` import.

Add above the `GameState` interface:

```ts
/** How Raid converts border into Might. `"border"` is the shipped rule;
 *  `"flat"` is the pre-2026-07-29 +1 and exists only so the simulation can
 *  measure what the change bought. Removed once that measurement is recorded
 *  in the 2026-07-29 scaling-might spec. */
export type RaidRule = "border" | "flat";
```

Add to `GameState`, after `bodyguards`:

```ts
  raidRule: RaidRule;
```

Add to the object `newGame` returns, after `bodyguards: []`:

```ts
    raidRule: "border",
```

Replace the raid branch of `playCard`:

```ts
  if (cardId === "raid" && targetId !== undefined) {
    const gain = state.raidRule === "flat"
      ? 1
      : borderStrength(viewOf(state), p.factionId, targetId);
    relations = bumpMightBy(relations, p.factionId, targetId, gain);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
```

`viewOf(state)` reads the board before the play, which is correct: playing Raid does not move a border.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): raid gains one might per bordering land"
```

---

### Task 4: Favourable omens

**Files:**
- Modify: `src/cards.ts` (append to `CARDS`)
- Modify: `src/playability.ts` (`RulesView`, `isCardPlayable`)
- Modify: `src/game.ts` (`GameState`, `newGame`, `viewOf`, `GameEvent`, `playCard`)
- Test: `tests/game.test.ts`, `tests/playability.test.ts`, `tests/cards.test.ts`

**Interfaces:**
- Consumes: `bumpMightBy`, `bumpStatusBy`, `bumpMightAllBy` (Task 1).
- Produces:
  - `CARDS["favourable-omens"]`
  - `export const DOUBLABLE_CARDS: ReadonlySet<string>` exported from **`src/cards.ts`**. It lives with the card table because `game.ts`, `ai.ts`, `target-explanations.ts` and `main.ts` all need it, and every one of those already imports from `cards.ts`. Putting it in `game.ts` would make `target-explanations.ts` depend on the engine to render a tooltip.
  - `GameState.omens: string[]`, `RulesView.omens: string[]`
  - `GameEvent.doubled?: boolean`

- [ ] **Step 1: Write the failing tests**

First, fix the four `RulesView` literals in `tests/playability.test.ts` by adding `omens: []`: the `view()` helper at line 17, and the three explicit literals at lines 277, 294 and 313. Then append:

```ts
describe("favourable-omens legality", () => {
  it("is playable when no reading is held", () => {
    expect(isCardPlayable(view(), "alpha", "favourable-omens")).toBe(true);
  });

  it("is not playable while a reading is already held", () => {
    expect(
      isCardPlayable(view({ omens: ["alpha"] }), "alpha", "favourable-omens"),
    ).toBe(false);
  });

  it("is unaffected by another faction's reading", () => {
    expect(
      isCardPlayable(view({ omens: ["beta"] }), "alpha", "favourable-omens"),
    ).toBe(true);
  });
});
```

Append to `tests/game.test.ts`:

```ts
describe("favourable omens", () => {
  const armed = (g: GameState): GameState => ({ ...g, omens: ["beta"] });

  it("records a reading when played", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["favourable-omens"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.omens).toContain("beta");
  });

  it("doubles Raid, border and all", () => {
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["gamma"],
    };
    let g = armed(playingState(ADJ));
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(4); // 2 border x 2
    expect(g.omens).not.toContain("beta");
    expect(g.log.at(-1)).toMatchObject({ type: "play", cardId: "raid", doubled: true });
  });

  it("doubles Shrewd marriage", () => {
    let g = withHand(armed(playingState(LINE_ADJ)), 0, ["shrewd-marriage"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").status).toBe(2);
    expect(g.omens).toEqual([]);
  });

  it("doubles Fortify against every living faction", () => {
    let g = withHand(armed(playingState(LINE_ADJ)), 0, ["fortify"]);
    g = playCard(g, 0, seededRng(1));
    expect(getRel(g.relations, "beta", "alpha").might).toBe(2);
    expect(getRel(g.relations, "beta", "gamma").might).toBe(2);
    expect(getRel(g.relations, "beta", "delta").might).toBe(2);
  });

  it("doubles the parting blow from Revolt", () => {
    let g = armed(playingState(LINE_ADJ));
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = withHand(g, 0, ["revolt"]);
    g = playCard(g, 0, seededRng(1));
    expect(leadsOf(g.relations, "beta", "alpha")).toEqual({ might: 2, status: 2 });
  });

  it("doubles the tribute a vassal pays, which is the cost of hoarding it", () => {
    let g = armed(playingState(LINE_ADJ));
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = withHand(g, 0, ["pay-tribute"]);
    g = playCard(g, 0, seededRng(1), undefined, "might");
    expect(getRel(g.relations, "alpha", "beta").might).toBe(2);
    expect(g.omens).toEqual([]);
  });

  it("passes through a card with nothing to double, keeping the reading", () => {
    let g = armed(playingState(LINE_ADJ));
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.omens).toContain("beta");
    expect(g.log.at(-1)).not.toHaveProperty("doubled");
  });

  it("does not stack: a second reading is not playable", () => {
    const g = armed(playingState(LINE_ADJ));
    const set = playableSet(viewOf(g), "beta", ["favourable-omens"]);
    expect(set.mode).toBe("discard");
  });
});
```

Add `playableSet` to the `../src/playability` import and `leadsOf` to the `../src/relations` import in `tests/game.test.ts` if not already present.

In `tests/cards.test.ts`, append to whichever describe block covers the card table:

```ts
it("carries Favourable omens as a one-per-deck buildable card", () => {
  const card = CARDS["favourable-omens"];
  expect(card.name).toBe("Favourable omens");
  expect(card.targeted).toBe(false);
  expect(card.forced).toBe(false);
  expect(card.maxPerDeck).toBe(1);
  expect(card.deckBuildable).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - `CARDS["favourable-omens"]` is undefined, `omens` is not on `GameState` or `RulesView`.

- [ ] **Step 3: Write minimal implementation**

In `src/cards.ts`, append the doubling set below `CARDS`:

```ts
/** Cards a Favourable omens reading doubles. Everything else resolves as
 *  normal and leaves the reading in reserve, so a reading is never spent on a
 *  card with no number to double. Pay tribute is deliberately included: a
 *  reading held while subjugated costs you, which is what stops the card from
 *  being free to sit on. */
export const DOUBLABLE_CARDS: ReadonlySet<string> = new Set([
  "raid", "shrewd-marriage", "fortify", "revolt", "pay-tribute",
]);
```

Then append as the **last** entry of `CARDS`, after `bodyguard`. Appending matters: `buildDeck()` takes the first `DECK_SIZE` non-basics, so appending leaves the default deck byte-for-byte what it is today and the existing `full`-deck scenario bands do not move on account of deck composition. The player still reaches this card through the deck screen and the AI through `buildAiDeck`, both of which enumerate all of `CARDS`.

```ts
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "The signs are read: your next Might or Status gain counts double." },
```

In `src/playability.ts`, add to `RulesView` after `bodyguards`:

```ts
  omens: string[]; // faction ids holding an unspent Favourable omens reading
```

and in `isCardPlayable`, directly after the `bodyguard` line:

```ts
  if (cardId === "favourable-omens") return !view.omens.includes(factionId);
```

In `src/game.ts`:

Add to `GameEvent`:

```ts
  doubled?: boolean; // play: a card whose numbers a reading doubled
```

Add to `GameState` after `bodyguards`:

```ts
  omens: string[]; // faction ids holding an unspent Favourable omens reading
```

Add to `newGame`'s returned object: `omens: [],`
Add to `viewOf`'s returned object: `omens: state.omens,`

Add `DOUBLABLE_CARDS` to the existing `./cards` import.

In `playCard`, add alongside the other mutable locals (next to `let bodyguards = state.bodyguards;`):

```ts
  let omens = state.omens;
  const doubled = omens.includes(p.factionId) && DOUBLABLE_CARDS.has(cardId);
  const mult = doubled ? 2 : 1;
  if (doubled) omens = omens.filter((f) => f !== p.factionId);
```

Then apply `mult` in each effect branch:

```ts
  if (cardId === "raid" && targetId !== undefined) {
    const gain = state.raidRule === "flat"
      ? 1
      : borderStrength(viewOf(state), p.factionId, targetId);
    relations = bumpMightBy(relations, p.factionId, targetId, gain * mult);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
    relations = bumpStatusBy(relations, p.factionId, targetId, mult);
  } else if (cardId === "fortify") {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in incorporated),
    );
    relations = bumpMightAllBy(relations, p.factionId, living, mult);
  } else if (cardId === "favourable-omens") {
    if (!omens.includes(p.factionId)) omens = [...omens, p.factionId];
  } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
```

In the `revolt` branch, replace the two chained bumps with:

```ts
    relations = bumpStatusBy(
      bumpMightBy(relations, p.factionId, former, mult), p.factionId, former, mult,
    );
```

In the `pay-tribute` branch, replace the bump loop with:

```ts
    const bump = tributeTrack === "might" ? bumpMightBy : bumpStatusBy;
    for (const b of beneficiaries) {
      relations = bump(relations, b, p.factionId, mult);
    }
```

Leave Subjugate's vassal-loss penalty on `bumpMight`/`bumpStatus`: Subjugate is not doublable, and that penalty is granted to the poached vassal, not to the actor.

Next to the existing prevented line, add:

```ts
  if (doubled) events[0] = { ...events[0], doubled: true };
```

Finally add `omens,` to the object `playCard` returns.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/cards.ts src/playability.ts src/game.ts tests/cards.test.ts tests/playability.test.ts tests/game.test.ts
git commit -m "feat(balticmap): read the omens to double your next gain"
```

---

### Task 5: Any faction can win

**Files:**
- Modify: `src/game.ts` (`GameEventType`, `GameState`, `newGame`, the endings block and learning hook of `playCard`, `advance`)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `GameEventType` gains `"unified"`; the event carries `overlordFactionId` naming the winner.
  - `GameState.humanSeat: number | null` - required, `0` from `newGame`.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`:

```ts
describe("any faction can win", () => {
  // FACTIONS has 4 members, so victoryRealmSize is ceil(0.55 * 4) = 3.
  it("ends the game when a rival reaches victory size", () => {
    let g = playingState(LINE_ADJ);
    // alpha already holds gamma; incorporating delta makes its realm 3.
    g = {
      ...g,
      current: 1, // alpha's seat
      incorporated: { gamma: "alpha" },
      overlords: new Map([["delta", "alpha"]]),
    };
    g = withHand(g, 1, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "delta");
    expect(g.phase).toBe("defeat");
    expect(g.log.at(-1)).toMatchObject({ type: "unified", overlordFactionId: "alpha" });
  });

  it("still calls the human's own unification a victory", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      incorporated: { alpha: "beta" },
      overlords: new Map([["gamma", "beta"]]),
    };
    g = withHand(g, 0, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "gamma");
    expect(g.phase).toBe("victory");
    expect(g.log.some((e) => e.type === "unified")).toBe(false);
  });

  it("has no seat to lose when humanSeat is null", () => {
    let g = { ...playingState(LINE_ADJ), humanSeat: null, current: 1 };
    g = {
      ...g,
      incorporated: { gamma: "alpha" },
      overlords: new Map([["delta", "alpha"]]),
    };
    g = withHand(g, 1, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "delta");
    expect(g.log.at(-1)).toMatchObject({ type: "unified", overlordFactionId: "alpha" });
  });

  it("defaults a real game to seat 0", () => {
    expect(newGame(FACTIONS).humanSeat).toBe(0);
  });
});

describe("advance", () => {
  it("skips an incorporated seat that is not the human seat", () => {
    let g = playingState(LINE_ADJ);
    // gamma is players[2] (id 3). Incorporate it and step off beta's turn.
    g = { ...g, incorporated: { gamma: "alpha" }, playedThisTurn: true };
    g = advance(g, seededRng(1));
    expect(g.players[g.current].factionId).not.toBe("gamma");
  });

  it("skips an incorporated seat 0 when there is no human seat", () => {
    let g = { ...playingState(LINE_ADJ), humanSeat: null };
    g = { ...g, incorporated: { beta: "alpha" }, current: 3, playedThisTurn: true };
    g = advance(g, seededRng(1));
    expect(g.players[g.current].factionId).not.toBe("beta");
  });

  it("never skips the human seat, even once incorporated", () => {
    // In the shipped game this cannot arise, since the game ends the moment
    // the human is incorporated. The rule is asserted so the world-run change
    // cannot quietly alter single-player behaviour.
    let g = playingState(LINE_ADJ);
    g = { ...g, incorporated: { beta: "alpha" }, current: 3, playedThisTurn: true };
    g = advance(g, seededRng(1));
    expect(g.current).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/game.test.ts`
Expected: FAIL - `humanSeat` is not on `GameState`, and no `unified` event exists.

- [ ] **Step 3: Write minimal implementation**

In `src/game.ts`, add `"unified"` to `GameEventType`:

```ts
  | "victory" | "defeat" | "unified";
```

Add to `GameState` after `raidRule`:

```ts
  /** Index of the seat treated as the player, or null for a world simulation
   *  with no privileged seat. Only the endings block and `advance` consult it;
   *  the rest of the app still addresses the human as index 0 / player id 1. */
  humanSeat: number | null;
```

Add `humanSeat: 0,` to `newGame`'s returned object.

Gate the learning hook, which is player-facing meta progress and has nothing to record in a seatless world. Change its condition from `p.id !== 1 &&` to:

```ts
    state.humanSeat !== null &&
    p.id !== 1 &&
```

Replace the whole endings block at the bottom of `playCard`:

```ts
  // endings
  // Defeat is checked before victory; the spec notes the two cannot coincide.
  // A rival unification is checked last, so a play that wins for the human is
  // never mistaken for one that loses to somebody else.
  const seat = state.humanSeat;
  const humanFaction = seat === null ? null : players[seat].factionId;
  const winSize = victoryRealmSize(state.factionIds.length);
  if (humanFaction !== null && incorporated[humanFaction] !== undefined) {
    phase = "defeat";
    events.push({
      turn: state.turn, playerId: p.id, type: "defeat",
      targetFactionId: humanFaction,
      overlordFactionId: incorporated[humanFaction],
    });
  } else if (
    humanFaction !== null &&
    realmOf(humanFaction, overlords, incorporated).length >= winSize
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  } else {
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        realmOf(f, overlords, incorporated).length >= winSize,
    );
    if (unifier !== undefined) {
      // "defeat" is simply the terminal non-victory phase. With no human seat
      // no screen renders it; with one, the human has lost the map.
      phase = "defeat";
      events.push({
        turn: state.turn, playerId: p.id, type: "unified",
        overlordFactionId: unifier,
      });
    }
  }
```

Delete the now-unused `const human = players[0];` line **only if** the learning hook above it no longer needs it - it does, so keep it, and leave the learning hook reading `players[0]`.

Replace `advance`:

```ts
/** Moves to the next living player after a completed turn. An incorporated
 *  seat is skipped, except the human seat, which always gets its turn - in the
 *  shipped game it is never incorporated without the game ending anyway. The
 *  turn counter bumps on wrap. */
export function advance(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing" || !state.playedThisTurn) return state;
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated;
  let current = state.current;
  let turn = state.turn;
  for (let tried = 0; tried < state.players.length; tried++) {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
    if (current === state.humanSeat || !inert(current)) {
      return beginTurn({ ...state, current, turn }, rng);
    }
  }
  // Unreachable while a game is playing: a unification ends the run long
  // before every seat is incorporated. Throwing beats spinning.
  throw new Error("advance: no living seat to move to");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both. `tests/sim.test.ts` still passes because its one `GameState` literal is a spread of a real state.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): let any faction unify the Balts and end the game"
```

---

### Task 6: Show the new ending and the doubling

The activity log and post-mortem screen currently assume every loss is an incorporation, so a rival unification would render "Incorporated by " with an empty name.

**Files:**
- Modify: `src/hud.ts` (`eventText`, `renderPostmortem`)
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: the `unified` event and `doubled` flag (Tasks 4 and 5).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/hud.test.ts` inside the `describe("createHud", ...)` block. The file already provides `setup()`, `playing()`, `withHand()` and `q()`; use them exactly as the surrounding tests do. Note `FACTIONS` there is `["alpha", "beta", "gamma"]` and the name map renders them as `Alpha`, `Beta`, `Gamma`.

```ts
it("names the faction that unified the Balts", () => {
  const { container, hud } = setup();
  const g = playing();
  hud.update({
    ...g,
    phase: "defeat",
    log: [
      ...g.log,
      { turn: 9, playerId: 2, type: "unified", overlordFactionId: "alpha" },
    ],
  });
  expect(q(container, ".pm-cause").textContent).toBe("Alpha unified the Balts");
});

it("marks a doubled play in the activity log", () => {
  const { container, hud } = setup();
  const g = playing();
  hud.update({
    ...g,
    log: [
      ...g.log,
      {
        turn: 3, playerId: 1, type: "play", cardId: "raid",
        targetFactionId: "alpha", doubled: true,
      },
    ],
  });
  expect(q(container, ".activity-log-entries").textContent)
    .toContain("You played Raid on Alpha - doubled");
});
```

Both selectors are the real class names: `pm-cause` is assigned at `src/hud.ts:151` and `activity-log-entries` at `src/hud.ts:223`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL - `eventText` has no `unified` case (TypeScript will also flag the non-exhaustive switch once `"unified"` joins `GameEventType`), and no "doubled" text is produced.

- [ ] **Step 3: Write minimal implementation**

In `src/hud.ts` `eventText`, extend the `play` case:

```ts
      case "play": {
        const target = e.targetFactionId !== undefined
          ? ` on ${factionName(e.targetFactionId)}`
          : "";
        const suffix = e.prevented ? " - prevented" : e.doubled ? " - doubled" : "";
        return you
          ? `You played ${cardName(e.cardId)}${target}${suffix}`
          : `Player ${e.playerId} played ${cardName(e.cardId)}${target}${suffix}`;
      }
```

and add a case beside `defeat`:

```ts
      case "unified":
        return `${factionName(e.overlordFactionId)} unifies the Balts`;
```

In `renderPostmortem`, replace the `else` branch's first three lines:

```ts
    } else {
      const unified = [...state.log].reverse().find((e) => e.type === "unified");
      if (unified !== undefined) {
        pmCause.textContent =
          `${factionName(unified.overlordFactionId)} unified the Balts`;
        pmDeltas.textContent = "";
        pmBuildup.replaceChildren();
        return;
      }
      const defeatEvent = [...state.log].reverse().find((e) => e.type === "defeat");
      const killer = defeatEvent?.overlordFactionId;
      pmCause.textContent = `Incorporated by ${factionName(killer)}`;
```

If `renderPostmortem` does work after the `if/else` that must still run, hoist that work above this `return` instead of returning early - read the function before editing and keep its tail behaviour intact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/hud.ts tests/hud.test.ts
git commit -m "feat(balticmap): report a rival unification and a doubled play"
```

---

### Task 7: AI evaluates both dials

Required by the repo rule that a card change must revisit the AI. Step 5 assumes every play is worth exactly 1, and step 7 ranks targets by point deficit, which is the wrong ranking once gains vary.

**Files:**
- Modify: `src/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `borderStrength` (Task 2), `DOUBLABLE_CARDS` and `GameState.omens` / `.raidRule` (Tasks 3 and 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/ai.test.ts`. The file's `base()` makes alpha the actor at index 1 and builds with `newGame(FACTIONS)`, whose default adjacency makes **every faction adjacent to every other**. The fixtures below rely on that; each one states the board it produces.

```ts
/** Which card the policy chose, by name rather than by index. */
const chosen = (g: GameState): string => {
  const a = chooseAction(g);
  return a.type === "play" ? g.players[1].hand[a.cardIndex] : "(discard)";
};

describe("chooseAction with scaling gains", () => {
  it("5: finishes a bar that only a multi-point Raid can reach", () => {
    // Full adjacency. alpha holds delta, so alpha's realm touches beta twice
    // -> Raid on beta is worth 2, and beta's bar is 2 x 1 land = 2.
    // alpha also sits one Status short of gamma's bar of 2.
    // Old policy: Raid needs lead === bar - 1, which fails at lead 0, so it
    // falls to Shrewd marriage on gamma. New policy: 0 + 2 >= 2, so Raid on
    // beta finishes now. The two differ, which is what makes this a test.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["delta", "alpha"]]),
      relations: statusLead({}, "alpha", "gamma", 1),
    };
    g = withHand(g, ["shrewd-marriage", "raid"]);
    expect(chooseAction(g)).toMatchObject({
      type: "play", targetId: "beta",
    });
    expect(chosen(g)).toBe("raid");
  });

  it("6b: reads the omens before building", () => {
    // No vassals, so Raid is worth 1 against a bar of 2: step 5 cannot fire
    // and the policy would otherwise build. It reads the omens instead.
    expect(chosen(withHand(base(), ["favourable-omens", "raid"]))).toBe(
      "favourable-omens",
    );
  });

  it("6b: does not read the omens with nothing to double", () => {
    expect(chosen(withHand(base(), ["favourable-omens", "grow-crops"]))).toBe(
      "grow-crops",
    );
  });

  it("6b: never reads the omens while a vassal, which would double its tribute", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "delta"]]) };
    expect(chosen(withHand(g, ["favourable-omens", "raid"]))).toBe("raid");
  });

  it("6b: never delays a play that finishes a subjugation", () => {
    // lead 1 + gain 1 meets beta's bar of 2, so step 5 fires first.
    let g = base();
    g = { ...g, relations: lead({}, "alpha", "beta", 1) };
    expect(chosen(withHand(g, ["favourable-omens", "raid"]))).toBe("raid");
  });

  it("7: ranks by plays remaining, not by point deficit", () => {
    // A six-land map built so the two rankings disagree:
    //   beta  - bar 2, alpha trails by 1 -> deficit 3, Raid worth 1 -> 3 plays
    //   gamma - bar 4 (gamma plus incorporated g1), lead 0 -> deficit 4,
    //           Raid worth 3 (alpha, a1 and a2 all touch gamma) -> 2 plays
    // Neither is finishable, so step 5 stays quiet and step 7 decides.
    // The old ranking picks beta (3 < 4); the new one must pick gamma.
    const IDS = ["alpha", "a1", "a2", "beta", "gamma", "g1"];
    const ADJ = {
      alpha: ["a1", "a2", "beta", "gamma"],
      a1: ["alpha", "gamma"],
      a2: ["alpha", "gamma"],
      beta: ["alpha"],
      gamma: ["alpha", "a1", "a2", "g1"],
      g1: ["gamma"],
    };
    let g = pickFaction(
      chooseDeck(startGame(newGame(IDS, ADJ)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = {
      ...g,
      current: g.players.findIndex((p) => p.factionId === "alpha"),
      overlords: new Map([["a1", "alpha"], ["a2", "alpha"]]),
      incorporated: { g1: "gamma" },
      relations: lead({}, "beta", "alpha", 1), // beta leads alpha by 1
    };
    g = {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === "alpha" ? { ...pl, hand: ["raid"] } : pl,
      ),
    };
    expect(chooseAction(g)).toMatchObject({ type: "play", targetId: "gamma" });
  });
});
```

Add to `tests/ai.test.ts`: `pickFaction`, `chooseDeck`, `startGame`, `newGame` and `type GameState` from `../src/game`, `buildDeck` from `../src/cards`, and a `statusLead` helper beside the existing `lead`:

```ts
function statusLead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpStatus(out, actor, target);
  return out;
}
```

If a fixture does not produce the board its comment describes, fix the fixture, never the assertion. Print `borderStrength(viewOf(g), "alpha", target)` and `leadsOf(...)` to see the actual board before changing anything.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ai.test.ts`
Expected: FAIL - the omens step does not exist and the ranking is by deficit.

- [ ] **Step 3: Write minimal implementation**

In `src/ai.ts`, extend the imports:

```ts
import {
  SUBJUGATE_THRESHOLD, borderStrength, playableSet, validTargetsFor,
} from "./playability";
import {
  DOUBLABLE_CARDS, discardCard, playCard, viewOf,
  type GameState, type TributeTrack,
} from "./game";
```

Add below `TRACKS`:

```ts
/** What a play would actually move, so the policy stops assuming every card
 *  is worth exactly 1: Raid scales with border, and any doublable card is
 *  worth twice as much while a reading is held. */
function gainOf(
  state: GameState,
  actorFactionId: string,
  cardId: string,
  targetId: string,
): number {
  const base =
    cardId === "raid" && state.raidRule === "border"
      ? borderStrength(viewOf(state), actorFactionId, targetId)
      : 1;
  const doubled =
    state.omens.includes(actorFactionId) && DOUBLABLE_CARDS.has(cardId);
  return doubled ? base * 2 : base;
}
```

In step 5, replace the threshold test:

```ts
      if (
        leadsOf(state.relations, p.factionId, t)[field] +
          gainOf(state, p.factionId, cardId, t) >= needed
      ) {
        return { type: "play", cardIndex: i, targetId: t };
      }
```

Insert a new step between the defensive Fortify block and the build block:

```ts
  // 6b: read the omens before building. Raid is one per deck, so spending a
  // turn now and playing it doubled next turn beats playing it plain and
  // following with filler. Never while a vassal: a forced Pay tribute would
  // spend the reading on the overlord. This sits after step 5 so a reading
  // never delays a play that wins a subjugation outright.
  const omens = idxOf("favourable-omens");
  if (
    omens !== undefined &&
    state.overlords.get(p.factionId) === undefined &&
    p.hand.some((c) => DOUBLABLE_CARDS.has(c))
  ) {
    return { type: "play", cardIndex: omens };
  }
```

`idxOf` only returns indexes from the playable set, and `isCardPlayable` already refuses a second reading, so no extra stacking guard is needed here.

Replace the build block's ranking. Rename its `deficit` field to `plays`:

```ts
  // 7: build toward the closest new subjugation, measured in plays remaining
  // rather than points - a 6-point gap closed 3 at a time is nearer than a
  // 4-point gap closed 1 at a time.
  let build: { cardIndex: number; targetId: string; plays: number; order: number } | null = null;
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(t, state.overlords, state.incorporated).length;
      const deficit = needed - leadsOf(state.relations, p.factionId, t)[field];
      const plays = Math.ceil(deficit / gainOf(state, p.factionId, cardId, t));
      const order = state.factionIds.indexOf(t);
      if (
        build === null ||
        plays < build.plays ||
        (plays === build.plays && order < build.order)
      ) {
        build = { cardIndex: i, targetId: t, plays, order };
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both. If a pre-existing AI test now fails, read it: a ranking change that flips a target is expected, and the test's comment should be updated to state the new reason. A test asserting a *priority order* must not be weakened.

- [ ] **Step 5: Commit**

```bash
git add src/ai.ts tests/ai.test.ts
git commit -m "feat(balticmap): teach the AI to value border and a reading"
```

---

### Task 8: Show active modifiers on hover

Requested directly: a modifier must be visible before the card is played. Two of the three are invisible today, and `borderStrength` is unguessable from the map.

**Files:**
- Modify: `src/target-explanations.ts`
- Modify: `src/hud.ts` (`HudCallbacks`, `renderHand`)
- Modify: `src/main.ts` (the callbacks object around line 556-570)
- Modify: `src/style.css` (add beside `.card-tip-targets`, around line 933)
- Test: `tests/target-explanations.test.ts`, `tests/hud.test.ts`

**Interfaces:**
- Consumes: `borderStrength`, `DOUBLABLE_CARDS`, `GameState.omens`.
- Produces:
  - `explainTargetEligibility(entries, factionName, annotate?)` - third parameter `annotate: (factionId: string) => string[]`, defaulting to `() => []`, whose lines are appended to **available** entries only.
  - `cardModifierLines(view: ModifierView, factionId: string, cardId: string): string[]` in `src/target-explanations.ts`, where `ModifierView` is `{ omens: string[]; diplomacyBoost: string[]; bodyguards: string[] }`. `GameState` satisfies it structurally, so `main.ts` passes the game straight in. It is a pure function so all four modifier cases are unit-testable; `main.ts` keeps only the wiring.
  - `HudCallbacks.cardModifiers?(cardId: string): string[]`

- [ ] **Step 1: Write the failing test**

Append to `tests/target-explanations.test.ts`:

```ts
describe("cardModifierLines", () => {
  const none = { omens: [], diplomacyBoost: [], bodyguards: [] };

  it("says nothing when no modifier is active", () => {
    expect(cardModifierLines(none, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "bodyguard")).toEqual([]);
  });

  it("marks a doublable card while a reading is held", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts double."]);
    expect(cardModifierLines(v, "alpha", "pay-tribute"))
      .toEqual(["Favourable omens: this card counts double."]);
  });

  it("leaves a card with nothing to double unmarked", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "subjugate")).toEqual([]);
  });

  it("says a reading is already in hand", () => {
    expect(cardModifierLines({ ...none, omens: ["alpha"] }, "alpha", "favourable-omens"))
      .toEqual(["A reading is already in hand."]);
  });

  it("says an Alliance will run long", () => {
    expect(
      cardModifierLines({ ...none, diplomacyBoost: ["alpha"] }, "alpha", "alliance"),
    ).toEqual(["Extended diplomacy: this Alliance lasts 10 turns."]);
  });

  it("says a bodyguard is already posted", () => {
    expect(cardModifierLines({ ...none, bodyguards: ["alpha"] }, "alpha", "bodyguard"))
      .toEqual(["A bodyguard is already posted."]);
  });

  it("ignores another faction's modifiers", () => {
    const v = { omens: ["beta"], diplomacyBoost: ["beta"], bodyguards: ["beta"] };
    expect(cardModifierLines(v, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "bodyguard")).toEqual([]);
  });
});
```

Also append:

```ts
it("appends annotation lines to available targets only", () => {
  const entries: TargetEligibility[] = [
    { state: "available", factionId: "alpha" },
    { state: "blocked", factionId: "beta", reasons: [{ code: "self" }] },
  ];
  const out = explainTargetEligibility(entries, (id) => id, () => ["+3 Might"]);
  expect(out[0].lines).toEqual(["alpha", "Available.", "+3 Might"]);
  expect(out[1].lines).not.toContain("+3 Might");
});

it("annotates nothing when no annotator is given", () => {
  const entries: TargetEligibility[] = [{ state: "available", factionId: "alpha" }];
  expect(explainTargetEligibility(entries, (id) => id)[0].lines)
    .toEqual(["alpha", "Available."]);
});
```

Append to `tests/hud.test.ts` inside `describe("createHud", ...)`:

```ts
it("shows an active modifier above the card description", () => {
  const { container, hud } = setup({
    cardModifiers: () => ["Favourable omens: this card counts double."],
  });
  hud.update(withHand(playing(), 0, ["raid"]));
  const tip = q(container, ".card-tip");
  expect(tip.firstElementChild!.className).toBe("card-tip-modifier");
  expect(tip.textContent).toContain("Favourable omens: this card counts double.");
  expect(tip.textContent).toContain("on their border"); // description still there
});
```

`setup()` builds its `HudCallbacks` from an options object, so add `cardModifiers` to both its parameter type and the spread that assembles `cb`, matching the existing `targetExplanations` entry exactly:

```ts
  cardModifiers?: (cardId: string) => string[];
```

```ts
    ...(opts?.cardModifiers ? { cardModifiers: opts.cardModifiers } : {}),
```

The existing test `"hand cards carry a name span and a rules tip"` asserts `.card-tip` textContent equals the description exactly. It keeps passing because `setup()` without `cardModifiers` leaves the callback undefined and `renderHand` falls back to an empty list. Do not change that test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/target-explanations.test.ts tests/hud.test.ts`
Expected: FAIL - `explainTargetEligibility` takes two arguments, and no `.card-tip-modifier` element is rendered.

- [ ] **Step 3: Write minimal implementation**

In `src/target-explanations.ts`, add `DOUBLABLE_CARDS` to a new import from `./cards`, and append:

```ts
/** The slice of state the modifier lines need. `GameState` satisfies this
 *  structurally, so the caller passes the game straight in. */
export interface ModifierView {
  omens: string[];
  diplomacyBoost: string[];
  bodyguards: string[];
}

/** What is currently affecting this card for this faction, in words, for the
 *  hover tip. Two of these were invisible before: a player could hold an
 *  Extended diplomacy or a Bodyguard and have no way to see it. */
export function cardModifierLines(
  view: ModifierView,
  factionId: string,
  cardId: string,
): string[] {
  const lines: string[] = [];
  if (view.omens.includes(factionId)) {
    if (DOUBLABLE_CARDS.has(cardId)) {
      lines.push("Favourable omens: this card counts double.");
    }
    if (cardId === "favourable-omens") {
      lines.push("A reading is already in hand.");
    }
  }
  if (cardId === "alliance" && view.diplomacyBoost.includes(factionId)) {
    lines.push("Extended diplomacy: this Alliance lasts 10 turns.");
  }
  if (cardId === "bodyguard" && view.bodyguards.includes(factionId)) {
    lines.push("A bodyguard is already posted.");
  }
  return lines;
}
```

Then change `explainTargetEligibility`'s signature and its available branch:

```ts
export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
  /** Extra lines appended to available targets, e.g. what a Raid there gains.
   *  Blocked targets get none: the block reason is the useful answer. */
  annotate: (factionId: string) => string[] = () => [],
): TargetExplanation[] {
```

and inside, for the available case:

```ts
      return [{
        factionId: entry.factionId,
        lines: [factionName(entry.factionId), "Available.", ...annotate(entry.factionId)],
        available: true,
      }];
```

In `src/hud.ts`, add to `HudCallbacks`:

```ts
  /** Lines describing modifiers currently affecting this card, shown at the
   *  top of its hover tip. */
  cardModifiers?(cardId: string): string[];
```

In `renderHand`, insert immediately after the `tip.addEventListener(...)` line and **before** the description is appended:

```ts
      for (const text of cb.cardModifiers?.(cardId) ?? []) {
        const modifier = document.createElement("div");
        modifier.className = "card-tip-modifier";
        modifier.textContent = text;
        tip.appendChild(modifier);
      }
```

In `src/style.css`, add above `.card-tip-targets`:

```css
.card-tip-modifier {
  margin-bottom: 6px;
  padding: 4px 6px;
  border-left: 3px solid #8a6d2f;
  border-radius: 3px;
  background: #f6efdc;
  color: #5a4620;
  font-weight: 700;
  text-align: left;
}
```

In `src/main.ts`, add `borderStrength` to the `./playability` import and `cardModifierLines` to the existing `./target-explanations` import. Replace `targetExplanations` and add `cardModifiers` alongside it:

```ts
    targetExplanations(cardId) {
      const human = game.players[0];
      if (!human || !CARDS[cardId]?.targeted) return [];
      const view = viewOf(game);
      const doubled = game.omens.includes(human.factionId);
      return explainTargetEligibility(
        targetEligibilityFor(view, human.factionId, cardId),
        (id) => factionById.get(id)?.name ?? id,
        cardId === "raid"
          ? (id) => {
              const n = borderStrength(view, human.factionId, id);
              return [
                doubled ? `+${n * 2} Might (doubled)` : `+${n} Might`,
              ];
            }
          : undefined,
      );
    },
    cardModifiers(cardId) {
      const human = game.players[0];
      return human ? cardModifierLines(game, human.factionId, cardId) : [];
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both.

- [ ] **Step 5: Verify in a browser**

From the **repo root**, not this directory:

```bash
npm run dev
```

Open `http://127.0.0.1:4173/prototypes/`, follow the link to prototype 02, start a game with Favourable omens and Raid in the deck, and confirm by eye:

1. Hovering Raid lists each target with a `+N Might` line, and N matches the number of your lands touching that realm on the map.
2. After playing Favourable omens, hovering Raid shows the modifier line and `+2N Might (doubled)`.
3. Hovering Favourable omens while a reading is held shows "A reading is already in hand." and the card is not playable.

Do not skip this. A happy-dom test asserts the element exists; only the browser shows whether the tip is readable and correctly positioned.

- [ ] **Step 6: Commit**

```bash
git add src/target-explanations.ts src/hud.ts src/main.ts src/style.css tests/target-explanations.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): show active modifiers and raid's gain on hover"
```

---

### Task 9: World runs

A run with no privileged seat, so "how long until the world resolves" has an answer.

**Files:**
- Modify: `src/sim.ts`
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `GameState.humanSeat`, `GameState.raidRule`, the `unified` event.
- Produces:
  - `runWorld(opts: WorldOptions): WorldSummary`
  - `WorldOptions { seed: number; deck: string[]; raidRule: RaidRule; turnCap: number }`
  - `WorldSummary { seed: number; outcome: "unified" | "cap"; endTurn: number; winner: string | null; subjugations: number; incorporations: number; largestRealm: number; turnsSinceLastIncorporation: number }`

- [ ] **Step 1: Write the failing test**

Append to `tests/sim.test.ts`:

```ts
describe("runWorld", () => {
  const deck = [
    "raid", "subjugate", "incorporate",
    ...Array.from({ length: 7 }, () => "grow-crops"),
  ];

  it("reproduces an identical summary for an identical seed", () => {
    const opts = { seed: 7, deck, raidRule: "border" as const, turnCap: 80 };
    expect(runWorld(opts)).toEqual(runWorld(opts));
  });

  it("reports a capped world rather than dropping it", () => {
    const w = runWorld({ seed: 1, deck, raidRule: "border", turnCap: 1 });
    expect(w.outcome).toBe("cap");
    expect(w.winner).toBeNull();
  });

  it("names the winner when the world resolves", () => {
    const w = runWorld({ seed: 3, deck, raidRule: "border", turnCap: 400 });
    if (w.outcome === "unified") {
      expect(w.winner).not.toBeNull();
      expect(SIM_FACTION_IDS).toContain(w.winner);
      expect(w.largestRealm).toBeGreaterThanOrEqual(
        Math.ceil(0.55 * SIM_FACTION_IDS.length),
      );
    } else {
      // A capped world is a legitimate result and the point of measuring;
      // it must still carry usable stall numbers.
      expect(w.turnsSinceLastIncorporation).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the flat rule a different world from the border rule", () => {
    const opts = { seed: 11, deck, turnCap: 200 };
    expect(runWorld({ ...opts, raidRule: "flat" }))
      .not.toEqual(runWorld({ ...opts, raidRule: "border" }));
  });
});
```

Add `runWorld` to the import from `../src/sim`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sim.test.ts`
Expected: FAIL - `runWorld` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/sim.ts`, add `realmOf` to the `./relations` import (add the import if the file has none) and `type RaidRule` to the `./game` import. Append:

```ts
// -- world runs -------------------------------------------------------------

export interface WorldOptions {
  seed: number;
  /** The deck every one of the 26 seats plays. Must hold exactly DECK_SIZE. */
  deck: string[];
  raidRule: RaidRule;
  turnCap: number;
}

export interface WorldSummary {
  seed: number;
  outcome: "unified" | "cap";
  endTurn: number;
  winner: string | null;
  subjugations: number;
  incorporations: number;
  /** The biggest realm any faction reached at any point. */
  largestRealm: number;
  /** Turns between the last incorporation and the end of the run. */
  turnsSinceLastIncorporation: number;
}

const biggestRealm = (s: GameState): number =>
  Math.max(
    ...s.factionIds.map((f) => realmOf(f, s.overlords, s.incorporated).length),
  );

/** One headless game with no privileged seat: all 26 lands hold the same deck
 *  and play the same policy, and the run ends when somebody unifies the Balts
 *  or the cap is reached.
 *
 *  The last three summary fields exist to tell a slow game from a stalemate.
 *  A capped run whose largest realm is 3 and which has not seen an
 *  incorporation in 60 turns is the failure this whole change is aimed at, and
 *  it should be a number rather than an undifferentiated "cap". */
export function runWorld(opts: WorldOptions): WorldSummary {
  const rng = seededRng(opts.seed);
  const seeded: GameState = {
    ...newGame(SIM_FACTION_IDS, SIM_ADJACENCY),
    humanSeat: null,
    raidRule: opts.raidRule,
  };
  let state = pickFaction(
    chooseDeck(startGame(seeded), opts.deck),
    SIM_FACTION_IDS[0],
    rng,
    () => opts.deck,
  );
  let largestRealm = biggestRealm(state);
  while (state.phase === "playing" && state.turn <= opts.turnCap) {
    const actor = state.players[state.current].factionId;
    const next = aiTakeTurn(state, rng);
    if (!next.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${opts.seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${state.players[state.current].hand.join(", ")}]`,
      );
    }
    state = next.phase === "playing" ? advance(next, rng) : next;
    largestRealm = Math.max(largestRealm, biggestRealm(state));
  }
  const unified = state.log.find((e) => e.type === "unified");
  const lastIncorporation = [...state.log]
    .reverse()
    .find((e) => e.type === "incorporated");
  return {
    seed: opts.seed,
    outcome: unified === undefined ? "cap" : "unified",
    endTurn: state.turn,
    winner: unified?.overlordFactionId ?? null,
    subjugations: state.log.filter((e) => e.type === "subjugated").length,
    incorporations: state.log.filter((e) => e.type === "incorporated").length,
    largestRealm,
    turnsSinceLastIncorporation: state.turn - (lastIncorporation?.turn ?? 0),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both. If `runWorld` throws a stuck-turn error, that is a real bug in `advance` or `playableSet`, not a data point - debug it before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/sim.ts tests/sim.test.ts
git commit -m "feat(balticmap): simulate a world with no privileged seat"
```

---

### Task 10: Conquest arms and the world CLI

**Files:**
- Modify: `src/sim.ts` (arms, batch, aggregation)
- Create: `scripts/simulate-world.ts`
- Modify: `package.json` (one script entry)
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `runWorld` (Task 9).
- Produces:
  - `WORLD_ARMS: Record<string, WorldArm>` with keys `conquest-flat`, `conquest-scaled`, `conquest-omens`
  - `runWorldBatch(opts: { games: number; turnCap: number; firstSeed: number; arm: string }): WorldSummary[]`
  - `aggregateWorld(arm: string, games: WorldSummary[]): WorldStats`

- [ ] **Step 1: Write the failing test**

Append to `tests/sim.test.ts`:

```ts
describe("world arms", () => {
  it("holds exactly DECK_SIZE cards in every arm", () => {
    for (const arm of Object.values(WORLD_ARMS)) {
      expect(arm.deck).toHaveLength(DECK_SIZE);
    }
  });

  it("differs from conquest-scaled only by the rule", () => {
    expect(WORLD_ARMS["conquest-flat"].deck)
      .toEqual(WORLD_ARMS["conquest-scaled"].deck);
    expect(WORLD_ARMS["conquest-flat"].raidRule).toBe("flat");
    expect(WORLD_ARMS["conquest-scaled"].raidRule).toBe("border");
  });

  it("differs from conquest-omens only by one card", () => {
    expect(WORLD_ARMS["conquest-omens"].raidRule).toBe("border");
    expect(WORLD_ARMS["conquest-omens"].deck).toContain("favourable-omens");
    expect(WORLD_ARMS["conquest-omens"].deck.filter((c) => c !== "grow-crops"))
      .toEqual([
        ...WORLD_ARMS["conquest-scaled"].deck.filter((c) => c !== "grow-crops"),
        "favourable-omens",
      ]);
  });

  it("keeps the flat rule confined to one place in the source", () => {
    // The spec's guarantee that the temporary raidRule flag cannot be set
    // anywhere by accident. Deleted along with the flag in the final task.
    const dir = new URL("../src/", import.meta.url);
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => readFileSync(new URL(f, dir), "utf8").includes('"flat"'));
    expect(hits).toEqual(["sim.ts"]);
  });

  it("rejects an unknown arm by name", () => {
    expect(() => runWorldBatch({ games: 1, turnCap: 5, firstSeed: 1, arm: "nope" }))
      .toThrow(/unknown world arm/);
  });

  it("pairs arms seed for seed", () => {
    const opts = { games: 3, turnCap: 30, firstSeed: 1 };
    const a = runWorldBatch({ ...opts, arm: "conquest-flat" });
    const b = runWorldBatch({ ...opts, arm: "conquest-scaled" });
    expect(a.map((g) => g.seed)).toEqual(b.map((g) => g.seed));
  });

  it("aggregates end turns over resolved worlds only", () => {
    const stats = aggregateWorld("x", [
      { seed: 1, outcome: "unified", endTurn: 10, winner: "a", subjugations: 3,
        incorporations: 2, largestRealm: 15, turnsSinceLastIncorporation: 0 },
      { seed: 2, outcome: "cap", endTurn: 99, winner: null, subjugations: 1,
        incorporations: 0, largestRealm: 3, turnsSinceLastIncorporation: 99 },
    ]);
    expect(stats.unifiedShare).toBe(0.5);
    expect(stats.capShare).toBe(0.5);
    expect(stats.medianEndTurn).toBe(10); // the capped run contributes no end
  });
});
```

Add `WORLD_ARMS`, `runWorldBatch`, `aggregateWorld` to the `../src/sim` import, `DECK_SIZE` to the `../src/cards` import, and `import { readdirSync, readFileSync } from "node:fs";` at the top. `tests/sim.test.ts` runs in the default node environment, so `node:fs` is available; if the file carries a `@vitest-environment happy-dom` pragma, move the source-scan test into `tests/cards.test.ts` instead rather than changing the environment.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sim.test.ts`
Expected: FAIL - none of the three exports exist.

- [ ] **Step 3: Write minimal implementation**

Append to `src/sim.ts`:

```ts
/** Three lands worth of conquest and nothing else, so the measurement is about
 *  the subjugation loop rather than about Alliance or Bodyguard. */
export const CONQUEST_DECK: string[] = [
  "raid", "subjugate", "incorporate",
  ...Array.from({ length: DECK_SIZE - 3 }, () => "grow-crops"),
];

export const CONQUEST_OMENS_DECK: string[] = [
  "raid", "subjugate", "incorporate", "favourable-omens",
  ...Array.from({ length: DECK_SIZE - 4 }, () => "grow-crops"),
];

export interface WorldArm {
  deck: string[];
  raidRule: RaidRule;
}

/** `conquest-scaled` exists to attribute a result. Without it, a shorter game
 *  under `conquest-omens` cannot be told apart from "the deck simply holds one
 *  more non-potato card" - the same reasoning that put the `defensive` arm in
 *  the 2026-07-29 new-player spec. */
export const WORLD_ARMS: Record<string, WorldArm> = {
  "conquest-flat": { deck: CONQUEST_DECK, raidRule: "flat" },
  "conquest-scaled": { deck: CONQUEST_DECK, raidRule: "border" },
  "conquest-omens": { deck: CONQUEST_OMENS_DECK, raidRule: "border" },
};

export interface WorldBatchOptions {
  games: number;
  turnCap: number;
  firstSeed: number;
  arm: string;
}

export function runWorldBatch(opts: WorldBatchOptions): WorldSummary[] {
  const arm = WORLD_ARMS[opts.arm];
  if (arm === undefined) {
    throw new Error(
      `unknown world arm "${opts.arm}"; known: ${Object.keys(WORLD_ARMS).join(", ")}`,
    );
  }
  return Array.from({ length: opts.games }, (_, i) =>
    runWorld({
      seed: opts.firstSeed + i,
      deck: arm.deck,
      raidRule: arm.raidRule,
      turnCap: opts.turnCap,
    }),
  );
}

export interface WorldStats {
  arm: string;
  games: number;
  unifiedShare: number;
  capShare: number;
  /** Over resolved worlds only; null when none resolved. */
  medianEndTurn: number | null;
  meanEndTurn: number | null;
  meanSubjugations: number | null;
  meanIncorporations: number | null;
  medianLargestRealm: number | null;
  /** Median turns of silence before a capped world gave up. Null when every
   *  world resolved. This is the stalemate number. */
  medianStallTurns: number | null;
}

export function aggregateWorld(arm: string, games: WorldSummary[]): WorldStats {
  const unified = games.filter((g) => g.outcome === "unified");
  const capped = games.filter((g) => g.outcome === "cap");
  const share = (n: number): number => (games.length === 0 ? 0 : n / games.length);
  return {
    arm,
    games: games.length,
    unifiedShare: share(unified.length),
    capShare: share(capped.length),
    medianEndTurn: median(unified.map((g) => g.endTurn)),
    meanEndTurn: mean(unified.map((g) => g.endTurn)),
    meanSubjugations: mean(games.map((g) => g.subjugations)),
    meanIncorporations: mean(games.map((g) => g.incorporations)),
    medianLargestRealm: median(games.map((g) => g.largestRealm)),
    medianStallTurns: median(capped.map((g) => g.turnsSinceLastIncorporation)),
  };
}
```

Create `scripts/simulate-world.ts`:

```ts
/** Headless conquest run: how long does a world of equal decks take to
 *  resolve, and do the scaling Raid and Favourable omens shorten it?
 *
 *  npm run simulate:world -- --games=52 --cap=200 --seed=1 --arms=conquest-flat,conquest-scaled,conquest-omens
 */
import {
  WORLD_ARMS, aggregateWorld, runWorldBatch,
  type WorldStats, type WorldSummary,
} from "../src/sim";

function flag(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

function num(name: string, fallback: number): number {
  const raw = flag(name, String(fallback));
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number, got "${raw}"`);
  }
  return Math.floor(n);
}

const games = num("games", 52);
const turnCap = num("cap", 200);
const firstSeed = num("seed", 1);
const arms = flag(
  "arms",
  "conquest-flat,conquest-scaled,conquest-omens",
).split(",");

for (const arm of arms) {
  if (!(arm in WORLD_ARMS)) {
    throw new Error(
      `unknown world arm "${arm}"; known: ${Object.keys(WORLD_ARMS).join(", ")}`,
    );
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(1));

const results = new Map<string, WorldSummary[]>();
for (const arm of arms) {
  const started = process.hrtime.bigint();
  results.set(arm, runWorldBatch({ games, turnCap, firstSeed, arm }));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`ran ${arm}: ${games} worlds in ${(ms / 1000).toFixed(1)}s`);
}

const stats: WorldStats[] = arms.map((arm) =>
  aggregateWorld(arm, results.get(arm)!),
);

console.log(
  `\n${games} worlds per arm, ${turnCap}-turn cap, ` +
    `seeds ${firstSeed}..${firstSeed + games - 1}, 26 equal seats\n`,
);

const cols: [string, (s: WorldStats) => string][] = [
  ["arm", (s) => s.arm],
  ["unified", (s) => pct(s.unifiedShare)],
  ["median end", (s) => n1(s.medianEndTurn)],
  ["mean end", (s) => n1(s.meanEndTurn)],
  ["capped", (s) => pct(s.capShare)],
  ["median stall", (s) => n1(s.medianStallTurns)],
  ["median biggest realm", (s) => n1(s.medianLargestRealm)],
  ["mean subjugations", (s) => n1(s.meanSubjugations)],
  ["mean incorporations", (s) => n1(s.meanIncorporations)],
];

const widths = cols.map(([head, get]) =>
  Math.max(head.length, ...stats.map((s) => get(s).length)),
);
const row = (cells: string[]): string =>
  cells.map((c, i) => c.padEnd(widths[i])).join("  ");

console.log(row(cols.map(([head]) => head)));
console.log(row(widths.map((w) => "-".repeat(w))));
for (const s of stats) console.log(row(cols.map(([, get]) => get(s))));
```

Add to `package.json` `scripts`, after `"simulate:check"`:

```json
    "simulate:world": "vite-node scripts/simulate-world.ts",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` and `npm run build`
Expected: PASS both.

- [ ] **Step 5: Smoke the CLI**

Run: `npm run simulate:world -- --games=4 --cap=120`
Expected: a three-row table with no crash. If every arm reports 0% unified at a 120-turn cap, that is a finding, not a bug - note it and continue to Task 11, which measures properly.

- [ ] **Step 6: Commit**

```bash
git add src/sim.ts scripts/simulate-world.ts package.json tests/sim.test.ts
git commit -m "feat(balticmap): measure how long an equal-deck world takes to resolve"
```

---

### Task 11: Measure, re-band, and record the results

This is the task the whole change exists to answer. It produces numbers first and edits bands second.

**Files:**
- Modify: `src/scenarios.ts` (world scenario type and list, re-banded existing scenarios)
- Modify: `scripts/check-scenarios.ts` (run world scenarios too)
- Modify: `docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md` (Results)
- Test: `tests/scenarios.test.ts`

**Interfaces:**
- Consumes: `WORLD_ARMS`, `runWorldBatch`, `aggregateWorld` (Task 10).
- Produces:
  - `WorldExpectation { unifiedShare?: Band; medianEndTurn?: Band; capShare?: Band }`
  - `WorldScenario { id; description; arm; games; firstSeed; turnCap; expect }`
  - `WORLD_SCENARIOS: WorldScenario[]`
  - `runWorldScenario(s: WorldScenario): WorldScenarioResult`

- [ ] **Step 1: Measure the three arms**

Run:

```bash
npm run simulate:world -- --games=104 --cap=300 --seed=1
```

Record the full table. 104 worlds is four passes of the 26 lands and takes a few minutes; if it exceeds ten minutes, halve `--games` and say so in the spec rather than quietly using a smaller sample.

- [ ] **Step 2: Re-measure the four existing scenarios**

Run: `npm run simulate:check`

Any scenario now outside its band is expected: the rival-unification ending can now terminate a run that used to play on. Record each measured value.

- [ ] **Step 3: Write the failing world-scenario test**

Append to `tests/scenarios.test.ts`, mirroring how the file already iterates `SCENARIOS`:

```ts
describe("world scenarios", () => {
  it("names a known arm and orders every band", () => {
    for (const s of WORLD_SCENARIOS) {
      expect(Object.keys(WORLD_ARMS)).toContain(s.arm);
      for (const band of Object.values(s.expect)) {
        expect(band[0]).toBeLessThanOrEqual(band[1]);
      }
    }
  });

  it("counts an unmeasurable metric as a miss, never as a pass", () => {
    const checks = worldChecksFor(
      { medianEndTurn: [1, 10] },
      { arm: "x", games: 0, unifiedShare: 0, capShare: 0, medianEndTurn: null,
        meanEndTurn: null, meanSubjugations: null, meanIncorporations: null,
        medianLargestRealm: null, medianStallTurns: null },
    );
    expect(checks[0].ok).toBe(false);
  });

  it("holds every committed world band", () => {
    for (const s of WORLD_SCENARIOS) {
      const result = runWorldScenario(s);
      for (const c of result.checks) {
        expect(
          c.ok,
          `${s.id} ${c.metric}: ${c.value} outside ${c.band[0]}..${c.band[1]}`,
        ).toBe(true);
      }
    }
  }, 600_000);
});
```

Import `WORLD_SCENARIOS`, `runWorldScenario`, `worldChecksFor` from `../src/scenarios` and `WORLD_ARMS` from `../src/sim`.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- tests/scenarios.test.ts`
Expected: FAIL - `WORLD_SCENARIOS` does not exist.

- [ ] **Step 5: Add the world scenario machinery**

Append to `src/scenarios.ts`, and add `WORLD_ARMS`, `aggregateWorld`, `runWorldBatch`, `type WorldStats`, `type WorldSummary` to its `./sim` import:

```ts
export interface WorldExpectation {
  unifiedShare?: Band;
  medianEndTurn?: Band;
  capShare?: Band;
}

export interface WorldScenario {
  id: string;
  description: string;
  arm: keyof typeof WORLD_ARMS & string;
  games: number;
  firstSeed: number;
  turnCap: number;
  expect: WorldExpectation;
}

export interface WorldCheck {
  metric: keyof WorldExpectation;
  value: number | null;
  band: Band;
  ok: boolean;
}

export interface WorldScenarioResult {
  scenario: WorldScenario;
  stats: WorldStats;
  checks: WorldCheck[];
  ok: boolean;
}

export function worldChecksFor(
  expect: WorldExpectation,
  stats: WorldStats,
): WorldCheck[] {
  return (Object.keys(expect) as (keyof WorldExpectation)[]).map((metric) => {
    const band = expect[metric]!;
    const value = stats[metric];
    return {
      metric,
      value,
      band,
      ok: value !== null && value >= band[0] && value <= band[1],
    };
  });
}

export function runWorldScenario(s: WorldScenario): WorldScenarioResult {
  if (!(s.arm in WORLD_ARMS)) throw new Error(`${s.id}: unknown arm "${s.arm}"`);
  const games: WorldSummary[] = runWorldBatch({
    games: s.games, turnCap: s.turnCap, firstSeed: s.firstSeed, arm: s.arm,
  });
  const stats = aggregateWorld(s.id, games);
  const checks = worldChecksFor(s.expect, stats);
  return { scenario: s, stats, checks, ok: checks.every((c) => c.ok) };
}
```

- [ ] **Step 6: Commit the measured bands**

First re-run at the sample the scenarios will actually use, since a band must match its own sample size:

```bash
npm run simulate:world -- --games=26 --cap=300 --seed=1
```

Add `WORLD_SCENARIOS` to `src/scenarios.ts` with exactly these three entries, filling each `<...>` from that run using the derivation below:

```ts
/** Bands come from the measured run recorded in the 2026-07-29 scaling-might
 *  spec, then widened. A miss means pacing moved, not that a seed was unlucky:
 *  every scenario is fixed-seed. */
export const WORLD_SCENARIOS: WorldScenario[] = [
  {
    id: "conquest-flat",
    description:
      "The pre-scaling world: equal conquest decks and a flat +1 Raid. " +
      "Kept only until the measurement is recorded; retired with the flag.",
    arm: "conquest-flat",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [<measured - 0.15>, <measured + 0.15>], // measured <x>
      medianEndTurn: [<0.6 * measured>, <1.5 * measured>],  // measured <y>
    },
  },
  {
    id: "conquest-scaled",
    description:
      "The same decks with Raid scaling on border. Guards the claim that " +
      "the scaling alone, with no extra card, resolves more worlds sooner.",
    arm: "conquest-scaled",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: { /* same two metrics, same derivation */ },
  },
  {
    id: "conquest-omens",
    description:
      "Scaling plus Favourable omens - the shipped world. Guards the whole " +
      "change: a later edit that returns this to a stalemate fails here.",
    arm: "conquest-omens",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: { /* same two metrics, same derivation */ },
  },
];
```

Derivation, applied to the value measured for that arm:

- **turn medians:** `[floor(0.6 * measured), ceil(1.5 * measured)]`
- **shares:** `[max(0, measured - 0.15), min(1, measured + 0.15)]`, rounded to two decimals

Keep the `// measured <x>` comment on every band so the next reader sees what it was widened from. If an arm's `medianEndTurn` measured `null` because no world resolved, omit that metric from its `expect` rather than banding a null - and say so in the spec's findings, because an arm that never resolves is the headline result.

Then apply the same derivation to any of the four existing `SCENARIOS` whose bands Step 2 showed to be missed, using the value measured there.

- [ ] **Step 7: Wire the world scenarios into the CLI**

In `scripts/check-scenarios.ts`, add `WORLD_SCENARIOS, runWorldScenario` to the import and append a second loop after the existing one, before the summary line. Change the two summary lines to count both lists:

```ts
for (const scenario of WORLD_SCENARIOS) {
  const started = process.hrtime.bigint();
  const result = runWorldScenario(scenario);
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(
    `\n${result.ok ? "PASS" : "FAIL"}  ${scenario.id}` +
      `  (${scenario.games} worlds, ${scenario.arm}, ${secs.toFixed(1)}s)`,
  );
  console.log(`      ${scenario.description}`);
  for (const c of result.checks) {
    console.log(
      `      ${c.ok ? "ok  " : "MISS"} ${c.metric.padEnd(24)}` +
        ` ${n1(c.value).padStart(7)}   expected ${c.band[0]}..${c.band[1]}`,
    );
  }
  if (!result.ok) failed += 1;
}

const total = SCENARIOS.length + WORLD_SCENARIOS.length;
console.log(
  failed === 0
    ? `\nall ${total} scenarios inside their bands`
    : `\n${failed} of ${total} scenarios outside their bands`,
);
```

- [ ] **Step 8: Fill in the spec's Results section**

Replace the placeholder Results section of `docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md` with:

1. The exact command and sample size used.
2. The three-arm table from Step 1.
3. Numbered findings, in the style of the 2026-07-29 new-player spec, answering in order: does `conquest-scaled` resolve more worlds and sooner than `conquest-flat`; does `conquest-omens` add anything beyond `conquest-scaled`; and did the stall metrics fall.
4. Any existing band that moved, with its old value, its new value and the reason.

**If the numbers say the change did not help, write that.** A flat or worse result is the finding. Do not widen a band to hide a regression, and do not adjust an arm to get a nicer number. Record it, then stop and raise it rather than continuing to Task 12.

- [ ] **Step 9: Run everything**

Run: `npm test`, `npm run build`, `npm run simulate:check`
Expected: PASS all three.

- [ ] **Step 10: Commit**

```bash
git add src/scenarios.ts scripts/check-scenarios.ts tests/scenarios.test.ts docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md
git commit -m "test(balticmap): band the conquest worlds and record the measurements"
```

---

### Task 12: Retire the raidRule flag

Not optional and not deferred. The flag existed to produce the numbers now written in the spec.

**Do not start this task until Task 11's Results section is committed** and shows the change helped. If it did not, stop and raise it.

**Files:**
- Modify: `src/game.ts`, `src/ai.ts`, `src/sim.ts`, `src/scenarios.ts`
- Modify: `tests/game.test.ts`, `tests/sim.test.ts`
- Modify: `docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `GameState` without `raidRule`; `RaidRule` gone; `WORLD_ARMS` without `conquest-flat`.

- [ ] **Step 1: Delete the rule branch**

In `src/game.ts`: delete the `RaidRule` type, the `raidRule` field on `GameState`, and the `raidRule: "border"` line in `newGame`. Simplify the raid branch to:

```ts
  if (cardId === "raid" && targetId !== undefined) {
    const gain = borderStrength(viewOf(state), p.factionId, targetId);
    relations = bumpMightBy(relations, p.factionId, targetId, gain * mult);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
```

In `src/ai.ts`, simplify `gainOf`:

```ts
  const base =
    cardId === "raid"
      ? borderStrength(viewOf(state), actorFactionId, targetId)
      : 1;
```

In `src/sim.ts`: drop `raidRule` from `WorldOptions`, from the `seeded` state in `runWorld`, from `WorldArm`, and from every `WORLD_ARMS` entry. Delete the `conquest-flat` entry. `WorldArm` becomes `{ deck: string[] }`; if that leaves it a one-field wrapper, replace `WORLD_ARMS: Record<string, WorldArm>` with `WORLD_ARMS: Record<string, string[]>` mapping arm name straight to deck, and update `runWorldBatch` accordingly.

In `src/scenarios.ts`: delete the `conquest-flat` world scenario.

- [ ] **Step 2: Delete the tests that only existed for the flag**

From `tests/game.test.ts`: delete `"grants a flat one under the flat rule"` and `"defaults a real game to the border rule"`.
From `tests/sim.test.ts`: delete `"gives the flat rule a different world from the border rule"`, delete `"keeps the flat rule confined to one place in the source"` and its `node:fs` import, drop `raidRule` from every `runWorld` call, and delete `"differs from conquest-scaled only by the rule"`. Keep `"differs from conquest-omens only by one card"` and `"holds exactly DECK_SIZE cards in every arm"`.

- [ ] **Step 3: Verify the flag is gone**

Run:

```bash
grep -rn "raidRule\|RaidRule\|conquest-flat\|\"flat\"" src tests scripts
```

Expected: no matches outside the spec document. Any match in `src`, `tests` or `scripts` is leftover and must be removed.

- [ ] **Step 4: Update the spec**

In the design document, rewrite the "Retiring the flag" section in the past tense: the flag existed during this branch, produced the `conquest-flat` numbers now in Results, and was removed in the same branch. State plainly that the `conquest-flat` baseline is no longer runnable and survives only as those numbers, unlike the `unarmed` deck arm which stays live.

- [ ] **Step 5: Run everything**

Run: `npm test`, `npm run build`, `npm run simulate:check`
Expected: PASS all three.

- [ ] **Step 6: Verify the whole thing in a browser**

From the repo root: `npm run dev`, then `http://127.0.0.1:4173/prototypes/` and into prototype 02. Play a full game with Favourable omens, Raid, Subjugate and Incorporate in the deck and confirm:

1. Raid's hover gain rises as your realm grows.
2. A reading doubles the next gain and the log says "doubled".
3. Reaching 15 lands wins; if an AI gets there first, the post-mortem says who unified the Balts rather than an empty "Incorporated by".

- [ ] **Step 7: Commit**

```bash
git add src/game.ts src/ai.ts src/sim.ts src/scenarios.ts tests/game.test.ts tests/sim.test.ts docs/superpowers/specs/2026-07-29-balticmap-scaling-might-design.md
git commit -m "refactor(balticmap): retire the temporary raid rule flag"
```

---

## Notes for the implementer

- **The landing page needs no edit.** This is a change inside an existing prototype, not a new one, so `.github/pages-index.html` already links it.
- **`npm test` is the gate, not a formality.** `tests/scenarios.test.ts` runs real simulations and is slow. Do not shorten its timeouts to make it finish; if it is genuinely too slow, reduce `games` in the scenario and say so in the spec.
- **The seeded rng is shared.** `seededRng` in `src/sim.ts` and the copies in the test files must stay the same LCG, or a committed band stops meaning anything.
- **If a step's fixture does not produce the board its comment describes,** fix the fixture, never the assertion. An assertion changed to match whatever the code does tests nothing.
