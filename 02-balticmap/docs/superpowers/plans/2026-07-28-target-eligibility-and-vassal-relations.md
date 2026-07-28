# Target Eligibility and Vassal Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep subjugated factions as independent relation targets and explain why each nearby faction is available or blocked for a targeted card.

**Architecture:** Add a pure, structured eligibility evaluator in `playability.ts`, then make `validTargetsFor` a projection of it. Separate political target identity from display-color identity in `main.ts`, and pass formatted candidate explanations into the HUD without duplicating gameplay rules.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom, SVG/DOM APIs.

## Global Constraints

- Work on the current branch. Do not create a feature branch or worktree.
- A subjugated faction keeps its own pairwise Might and Status relationships.
- An incorporated polygon resolves to its living owner.
- Faraway factions are omitted from potential-target explanations.
- Show all applicable visible blocking reasons in stable order.
- Do not change Subjugate thresholds or realm-size scaling.
- Use only ASCII characters in source, tests, documentation, commits, and user-facing copy.
- Run prototype tests and build, then verify through the repository root server.
- Stage explicit `02-balticmap` paths only. Never use `git add -A`.

---

### Task 1: Structured Target Eligibility

**Files:**
- Modify: `src/playability.ts`
- Modify: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `RulesView`, `SUBJUGATE_THRESHOLD`, `realmOf`, `leadsOf`, and `allianceActive`.
- Produces:

```ts
export type TargetBlockReason =
  | { code: "alliance"; expiresTurn: number }
  | {
      code: "insufficient-lead";
      requiredLead: number;
      mightLead: number;
      statusLead: number;
      realmSize: number;
    }
  | { code: "already-vassal" }
  | { code: "actor-subjugated" }
  | { code: "overlord-prohibited" }
  | { code: "incorporated" }
  | { code: "self" }
  | { code: "not-your-vassal" };

export type TargetEligibility =
  | { state: "irrelevant"; factionId: string }
  | { state: "available"; factionId: string }
  | {
      state: "blocked";
      factionId: string;
      reasons: TargetBlockReason[];
    };

export function targetEligibilityFor(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
): TargetEligibility[];
```

- `validTargetsFor(view, actorFactionId, cardId)` returns only faction IDs
  whose eligibility state is `available`.

- [ ] **Step 1: Write failing evaluator tests**

Add focused cases to `tests/playability.test.ts`:

```ts
describe("targetEligibilityFor", () => {
  it("keeps another overlord's vassal as its own Raid candidate", () => {
    const v = view({ overlords: new Map([["gamma", "delta"]]) });
    expect(targetEligibilityFor(v, "beta", "raid")).toContainEqual({
      state: "available",
      factionId: "gamma",
    });
  });

  it("reports every visible Subjugate blocker in stable order", () => {
    const alliances = { [allianceKey("beta", "gamma")]: 9 };
    const v = view({
      overlords: new Map([["gamma", "delta"]]),
      alliances,
      turn: 4,
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "alliance", expiresTurn: 9 },
        {
          code: "insufficient-lead",
          requiredLead: 2,
          mightLead: 0,
          statusLead: 0,
          realmSize: 1,
        },
      ],
    });
  });

  it("reports scaled Subjugate values", () => {
    let relations: Relations = {};
    relations = bumpMight(relations, "beta", "gamma");
    const v = view({
      relations,
      incorporated: { alpha: "gamma" },
    });
    expect(targetEligibilityFor(v, "beta", "subjugate")).toContainEqual({
      state: "blocked",
      factionId: "gamma",
      reasons: [{
        code: "insufficient-lead",
        requiredLead: 4,
        mightLead: 1,
        statusLead: 0,
        realmSize: 2,
      }],
    });
  });

  it("omits faraway factions as irrelevant candidates", () => {
    const result = targetEligibilityFor(view(), "beta", "subjugate");
    expect(result.find((entry) => entry.factionId === "delta")?.state)
      .toBe("irrelevant");
  });
});
```

Adjust fixture adjacency only where necessary so each test states which
factions are in reach.

- [ ] **Step 2: Run the evaluator tests and verify failure**

Run:

```bash
npm test -- tests/playability.test.ts
```

Expected: FAIL because `targetEligibilityFor` and its types are not exported.

- [ ] **Step 3: Implement the pure evaluator**

In `src/playability.ts`, add helpers that:

```ts
function allianceExpiry(
  view: RulesView,
  actor: string,
  candidate: string,
): number | undefined {
  const expiry = view.alliances[allianceKey(actor, candidate)];
  return expiry !== undefined && view.turn < expiry ? expiry : undefined;
}
```

For each faction in `view.factionIds`, evaluate geographic relevance first.
Return `irrelevant` for factions outside the card's candidate reach. For
relevant candidates, append reasons in this order:

1. `self`
2. `incorporated`
3. `actor-subjugated`
4. `overlord-prohibited`
5. `already-vassal` or `not-your-vassal`
6. `alliance`
7. `insufficient-lead`

For Subjugate, calculate:

```ts
const realmSize = realmOf(candidate, view.overlords, view.incorporated).length;
const requiredLead = SUBJUGATE_THRESHOLD * realmSize;
const lead = leadsOf(view.relations, actorFactionId, candidate);
```

Return `available` when no reasons remain. Preserve existing special reach
rules for Shrewd Marriage and Alliance toward an actor's overlord.

- [ ] **Step 4: Make existing targeting a projection**

Replace card-specific filtering in `validTargetsFor` with:

```ts
return targetEligibilityFor(view, factionId, cardId)
  .filter(
    (entry): entry is Extract<TargetEligibility, { state: "available" }> =>
      entry.state === "available",
  )
  .map((entry) => entry.factionId);
```

Keep non-targeted cards returning an empty target array.

- [ ] **Step 5: Run playability tests**

Run:

```bash
npm test -- tests/playability.test.ts tests/ai.test.ts
```

Expected: PASS. Existing target lists and AI target choices remain unchanged.

- [ ] **Step 6: Commit Task 1**

```bash
git add 02-balticmap/src/playability.ts 02-balticmap/tests/playability.test.ts
git commit -m "refactor(balticmap): centralize target eligibility"
```

### Task 2: Preserve Vassal Political Identity

**Files:**
- Modify: `src/game.ts`
- Modify: `src/main.ts`
- Modify: `tests/game.test.ts`
- Modify: `tests/view.test.ts`

**Interfaces:**
- Consumes: `validTargetsFor` from Task 1.
- Produces:

```ts
export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}
```

This helper resolves incorporation only. It never follows `overlords`.

- [ ] **Step 1: Add the Raid relation regression test**

In `tests/game.test.ts`, add:

```ts
it("raids another overlord's vassal without changing the overlord relation", () => {
  let g = playingState(LINE_ADJ);
  g = {
    ...g,
    overlords: new Map([["gamma", "delta"]]),
  };
  g = withHand(g, 0, ["raid"]);
  const after = playCard(g, 0, rng(), "gamma");
  expect(leadsOf(after.relations, "beta", "gamma").might).toBe(1);
  expect(leadsOf(after.relations, "beta", "delta").might).toBe(0);
});
```

- [ ] **Step 2: Add political identity tests**

Place the exported helper in a small pure module if importing `main.ts` would
execute application startup. Prefer `src/view.ts` when that matches its current
responsibility. Add tests to `tests/view.test.ts`:

```ts
expect(politicalFactionForPolygon(
  "gamma",
  {},
)).toBe("gamma");

expect(politicalFactionForPolygon(
  "gamma",
  { gamma: "delta" },
)).toBe("delta");
```

The first assertion must still return `gamma` when the caller separately has
`overlords = new Map([["gamma", "delta"]])`.

- [ ] **Step 3: Run tests and verify the regression boundary**

Run:

```bash
npm test -- tests/game.test.ts tests/view.test.ts
```

Expected: the direct resolver regression may already pass, proving the defect
is in polygon/UI identity routing. The new helper test fails until exported.

- [ ] **Step 4: Route targeting and hover through political identity**

Use `politicalFactionForPolygon` in `main.ts` for:

- hover relation lookup;
- Subjugate-available lookup;
- armed target highlighting;
- click target resolution.

Do not use `effectiveFaction`, realm-root hover logic, or overlord color
resolution for these paths. Keep `effectiveFaction` limited to map fill color.

The click path should be:

```ts
const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
const faction = raw === undefined
  ? undefined
  : politicalFactionForPolygon(raw, game.incorporated);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/game.test.ts tests/view.test.ts tests/interaction.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/src/main.ts 02-balticmap/src/view.ts 02-balticmap/tests/game.test.ts 02-balticmap/tests/view.test.ts
git commit -m "fix(balticmap): keep vassal relation targets separate"
```

### Task 3: Format Candidate Explanations

**Files:**
- Create: `src/target-explanations.ts`
- Create: `tests/target-explanations.test.ts`

**Interfaces:**
- Consumes: `TargetEligibility` and `TargetBlockReason` from Task 1.
- Produces:

```ts
export interface TargetExplanation {
  factionId: string;
  lines: string[];
  available: boolean;
}

export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
): TargetExplanation[];
```

- [ ] **Step 1: Write failing formatter tests**

Create `tests/target-explanations.test.ts` with cases for available,
alliance, insufficient lead, multiple reasons, and irrelevant omission:

```ts
expect(explainTargetEligibility([{
  state: "blocked",
  factionId: "gamma",
  reasons: [
    { code: "alliance", expiresTurn: 12 },
    {
      code: "insufficient-lead",
      requiredLead: 4,
      mightLead: 1,
      statusLead: 0,
      realmSize: 2,
    },
  ],
}], nameOf)).toEqual([{
  factionId: "gamma",
  available: false,
  lines: [
    "Gamma",
    "Blocked by Alliance until turn 12.",
    "Need a Might or Status lead of 4 because their realm has 2 lands.",
    "Current leads: Might 1, Status 0.",
  ],
}]);
```

Also assert singular copy for one land and that `irrelevant` entries produce
no result.

- [ ] **Step 2: Run the formatter tests and verify failure**

Run:

```bash
npm test -- tests/target-explanations.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the formatter**

Implement an exhaustive `switch` over every reason code. Use exact,
player-facing sentences, including:

```ts
case "alliance":
  return [`Blocked by Alliance until turn ${reason.expiresTurn}.`];
case "insufficient-lead":
  return [
    `Need a Might or Status lead of ${reason.requiredLead} because their realm has ${reason.realmSize} ${reason.realmSize === 1 ? "land" : "lands"}.`,
    `Current leads: Might ${reason.mightLead}, Status ${reason.statusLead}.`,
  ];
```

Use concise copy for remaining reasons. Preserve evaluator reason order.

- [ ] **Step 4: Run formatter tests**

Run:

```bash
npm test -- tests/target-explanations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add 02-balticmap/src/target-explanations.ts 02-balticmap/tests/target-explanations.test.ts
git commit -m "feat(balticmap): explain target eligibility"
```

### Task 4: Inspectable Card Candidate Popup

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `targetEligibilityFor` from Task 1 and
  `explainTargetEligibility` from Task 3.
- Extends `HudCallbacks` with:

```ts
targetExplanations?(cardId: string): TargetExplanation[];
```

- [ ] **Step 1: Write failing HUD tests**

Add tests proving:

```ts
const { container, hud } = setup({
  canPlayCard: () => false,
  targetExplanations: () => [{
    factionId: "gamma",
    available: false,
    lines: [
      "Gamma",
      "Blocked by Alliance until turn 12.",
    ],
  }],
});
hud.update(stateWithHand(["subjugate"]));
const card = q<HTMLButtonElement>(container, ".card");
expect(card.disabled).toBe(false);
expect(card.getAttribute("aria-disabled")).toBe("true");
expect(q(container, ".card-tip").textContent).toContain("Potential targets");
expect(q(container, ".card-tip").textContent)
  .toContain("Blocked by Alliance until turn 12.");
```

Also click the inspectable but unplayable card and assert
`onPlayCard` is not called.

- [ ] **Step 2: Run HUD tests and verify failure**

Run:

```bash
npm test -- tests/hud.test.ts
```

Expected: FAIL because disabled cards are not inspectable and no target
explanation callback exists.

- [ ] **Step 3: Render potential targets**

Extend `HudCallbacks`, then append a structured section to `.card-tip` for
targeted cards:

```text
Potential targets

Gamma
Blocked by Alliance until turn 12.
```

Use DOM nodes and classes rather than concatenating HTML. Omit the section
when the callback returns an empty array.

- [ ] **Step 4: Make unavailable cards inspectable without making them playable**

Do not set the native `disabled` property merely because a card is
rule-unplayable during the human turn. Instead:

- set `aria-disabled="true"`;
- retain `.unplayable`;
- allow hover/focus;
- install the play click handler only when `playable` is true.

Continue using native `disabled` outside the human action window. This keeps
the explanation accessible while preserving turn enforcement.

- [ ] **Step 5: Wire live explanations**

In `main.ts`, implement:

```ts
targetExplanations(cardId) {
  const human = game.players[0];
  if (!human || !CARDS[cardId]?.targeted) return [];
  return explainTargetEligibility(
    targetEligibilityFor(viewOf(game), human.factionId, cardId),
    (id) => factionById.get(id)?.name ?? id,
  );
}
```

- [ ] **Step 6: Style the expanded popup**

Keep the card itself at the existing size. Make `.card-tip` readable with:

- a constrained width;
- scrolling or a maximum height when many candidates exist;
- distinct available and blocked candidate styling;
- pointer behavior that does not intercept card clicks unexpectedly.

- [ ] **Step 7: Run HUD and interaction tests**

Run:

```bash
npm test -- tests/hud.test.ts tests/interaction.test.ts tests/playability.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add 02-balticmap/src/hud.ts 02-balticmap/src/main.ts 02-balticmap/src/style.css 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): show target blocking reasons"
```

### Task 5: Full Verification and Root Landing Page Check

**Files:**
- Modify only if verification exposes a scoped defect in files already listed.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified prototype with no new interface.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 3: Verify through the root server**

From `/Users/janis.kirsteins/Projects/prototypes`, run:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:4173/prototypes/
```

Navigate through the landing page to `02-balticmap`. Verify:

1. A vassal polygon displays its overlord's color.
2. Raid against that vassal increments the vassal popup Might value.
3. The overlord popup does not receive that Raid increment.
4. Subjugate explains insufficient lead values for a reachable target.
5. Subjugate explains an active Alliance and its expiry.
6. Faraway factions do not appear in the card candidate list.
7. An unavailable targeted card can be inspected but not played.

- [ ] **Step 4: Inspect the final diff and status**

Run:

```bash
git status --short
git diff --check HEAD~4..HEAD
git log -5 --oneline
```

Confirm no unrelated `03-hostages` or `.superpowers/` files were staged or
committed.

- [ ] **Step 5: Commit verification-only fixes if needed**

If verification required a scoped correction:

```bash
git add 02-balticmap/<explicit-file-paths>
git commit -m "fix(balticmap): address eligibility verification"
```

If no correction was needed, do not create an empty commit.
