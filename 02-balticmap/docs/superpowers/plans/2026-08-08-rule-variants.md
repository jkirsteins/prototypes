# Rule Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rules system of axes of mutually exclusive options, picked on the deck screen and remembered across games, whose first axis is turn structure: `standard` (today's game, untouched) or `unlimited` (play any number of cards per turn, refill the hand to 4 at turn start, no discards).

**Architecture:** A typed registry in a new `src/rules.ts` (the `CARDS` shape); `GameState.rules` stamped at `newGame` and frozen by a `chooseRules` transition legal only during deck-building; a handful of choke points in `game.ts`/`ai.ts`/`hud.ts`/`main.ts` each read one axis. The deck screen grows a Rules button + summary label whose modal holds the radio groups. Spec: `docs/superpowers/specs/2026-08-08-rule-variants-design.md`.

**Tech Stack:** Plain TypeScript + Vite, no framework, imperative DOM, vitest (happy-dom for DOM suites).

## Global Constraints

- The standard game must be bit-identical to today: same rng consumption, same events. The existing drift/golden tests are the guard; if one fails, the change is wrong, not the test.
- `npm test` and `npm run build` must pass before every commit (run them from `02-balticmap/`).
- Never interpolate a card or faction name into player-facing strings (none of the new prose needs one; keep it that way).
- A dark box states its own text colour (`src/style.css`).
- Everything the player acts on stays outside the `.ds-deck` scroll region.
- Comments explain the rule, never the history ("was", "now", dates are all banned).
- Stage commits with explicit paths scoped to `02-balticmap/`. Never `git add -A`.
- No em dashes or non-ASCII punctuation in any new text; use "-", "->", "...".

---

### Task 1: The registry and prefs: src/rules.ts

**Files:**
- Create: `src/rules.ts`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: `MetaStorage`, `memoryStorage` from `src/meta.ts` (existing).
- Produces: `RuleSelections` (`{ turn: "standard" | "unlimited" }`), `RULE_AXES: RuleAxis[]`, `DEFAULT_RULES: RuleSelections`, `mergeRules(picks: Record<string, unknown>): RuleSelections`, `summarizeRules(rules: RuleSelections): string`, `RULES_PREFS_KEY: string`, `loadRulesPrefs(storage: MetaStorage): RuleSelections`, `saveRulesPrefs(storage: MetaStorage, rules: RuleSelections): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULES, RULE_AXES, RULES_PREFS_KEY, loadRulesPrefs, mergeRules,
  saveRulesPrefs, summarizeRules,
} from "../src/rules";
import { memoryStorage } from "../src/meta";

describe("RULE_AXES", () => {
  it("every axis's default is one of its options, and ids are unique", () => {
    const axisIds = RULE_AXES.map((a) => a.id);
    expect(new Set(axisIds).size).toBe(axisIds.length);
    for (const axis of RULE_AXES) {
      const ids = axis.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(axis.defaultOption);
      expect(DEFAULT_RULES[axis.id]).toBe(axis.defaultOption);
    }
  });
});

describe("mergeRules", () => {
  it("keeps a known pick and drops an unknown axis or option", () => {
    expect(mergeRules({ turn: "unlimited", bogus: "x" }))
      .toEqual({ turn: "unlimited" });
    expect(mergeRules({ turn: "gone" })).toEqual(DEFAULT_RULES);
  });
});

describe("rules prefs", () => {
  it("round-trips through storage", () => {
    const s = memoryStorage();
    saveRulesPrefs(s, { turn: "unlimited" });
    expect(loadRulesPrefs(s)).toEqual({ turn: "unlimited" });
  });
  it("absent, corrupt or stale storage yields defaults", () => {
    const s = memoryStorage();
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, "not json");
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, JSON.stringify({ turn: "gone" }));
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
  });
});

describe("summarizeRules", () => {
  it("names the picked option per axis", () => {
    expect(summarizeRules(DEFAULT_RULES)).toBe("One card per turn");
    expect(summarizeRules({ turn: "unlimited" })).toBe("Unlimited plays");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/rules.test.ts`
Expected: FAIL - cannot resolve `../src/rules`.

- [ ] **Step 3: Write src/rules.ts**

```ts
import type { MetaStorage } from "./meta";

/** The rules the player can swap before a game. Organized as AXES: each axis
 *  is a group of mutually exclusive options and a game carries exactly one
 *  pick per axis, so "both options of one axis" is unrepresentable and picks
 *  on different axes combine freely. No recalibration ships with a pick:
 *  `npm run balance` runs the standard rules, and calibration against another
 *  set happens only when asked for by name. See the 2026-08-08 rule-variants
 *  design doc. */
export interface RuleOption {
  id: string;
  name: string;
  /** One line of rules text, shown only in the picker modal. */
  text: string;
}

export interface RuleAxis {
  id: keyof RuleSelections;
  name: string;
  options: RuleOption[];
  defaultOption: string;
}

/** One pick per axis, always complete. Typed literally rather than as
 *  Record<string, string> so a choke point reading `state.rules.turn` is
 *  checked by tsc, and a future axis extends this type. */
export interface RuleSelections {
  turn: "standard" | "unlimited";
}

export const RULE_AXES: RuleAxis[] = [
  {
    id: "turn",
    name: "Turn structure",
    defaultOption: "standard",
    options: [
      {
        id: "standard",
        name: "One card per turn",
        text: "Play or discard one card each turn; draw one at turn start.",
      },
      {
        id: "unlimited",
        name: "Unlimited plays",
        text: "Play any number of cards each turn; your hand refills to 4 at turn start. No discards - a dead hand waits for the board to change.",
      },
    ],
  },
];

/** A literal rather than a derivation, so the conformance test in
 *  tests/rules.test.ts can catch the two drifting apart. */
export const DEFAULT_RULES: RuleSelections = { turn: "standard" };

/** Folds unknown-checked picks over the defaults: an axis or option that does
 *  not exist falls back to that axis's default, the same drop rule `rel=`
 *  applies to an unknown track. Every reader of untrusted picks (storage, a
 *  URL) comes through here, so the fallback is one rule, not three copies. */
export function mergeRules(picks: Record<string, unknown>): RuleSelections {
  const out: Record<string, string> = { ...DEFAULT_RULES };
  for (const axis of RULE_AXES) {
    const v = picks[axis.id];
    if (typeof v === "string" && axis.options.some((o) => o.id === v)) {
      out[axis.id] = v;
    }
  }
  return out as unknown as RuleSelections;
}

/** The deck screen's one-line overview: the picked option's name per axis.
 *  Names only - the options themselves appear nowhere but the modal. */
export function summarizeRules(rules: RuleSelections): string {
  return RULE_AXES
    .map((a) => a.options.find((o) => o.id === rules[a.id])?.name ?? "")
    .filter((s) => s.length > 0)
    .join(", ");
}

/** Last-used picks, remembered game to game. A preference, not progression,
 *  so it lives beside the log prefs rather than in MetaRecord - and through
 *  the same MetaStorage abstraction, for the same reason LogPrefs does. */
export const RULES_PREFS_KEY = "balticmap-rules-prefs-v1";

export function loadRulesPrefs(storage: MetaStorage): RuleSelections {
  try {
    const raw = storage.getItem(RULES_PREFS_KEY);
    if (raw === null) return { ...DEFAULT_RULES };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_RULES };
    }
    return mergeRules(parsed as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRulesPrefs(
  storage: MetaStorage, rules: RuleSelections,
): void {
  try {
    storage.setItem(RULES_PREFS_KEY, JSON.stringify(rules));
  } catch {
    // storage unavailable or full: the pick still holds for the session,
    // it just does not survive a reload - same tradeoff meta.ts accepts.
  }
}
```

Check that `src/meta.ts` exports `MetaStorage` and `memoryStorage` (it does; `main.ts` imports both).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rules.ts tests/rules.test.ts
git commit -m "feat(rules): rule-axes registry, prefs and summary"
```

---

### Task 2: GameState.rules and chooseRules

**Files:**
- Modify: `src/game.ts` (interface `GameState` near line 104; `newGame` near line 222; after `chooseDeck` near line 268)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `RuleSelections`, `DEFAULT_RULES` from Task 1.
- Produces: `GameState.rules: RuleSelections`; `chooseRules(state: GameState, rules: RuleSelections): GameState` exported from `src/game.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts`, add to the imports from `../src/game`: `chooseRules`. Add a new import: `import { DEFAULT_RULES } from "../src/rules";`. Then add:

```ts
describe("chooseRules", () => {
  it("defaults every game to DEFAULT_RULES", () => {
    expect(newGame(FACTIONS).rules).toEqual(DEFAULT_RULES);
  });

  it("stamps picks during deck-building and refuses them after", () => {
    const g = startGame(newGame(FACTIONS));
    const picked = chooseRules(g, { turn: "unlimited" });
    expect(picked.rules.turn).toBe("unlimited");
    const playing = playingState();
    expect(chooseRules(playing, { turn: "unlimited" })).toBe(playing);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts -t chooseRules`
Expected: FAIL - `chooseRules` is not exported.

- [ ] **Step 3: Implement**

In `src/game.ts`:

1. Add to the imports: `import { DEFAULT_RULES, type RuleSelections } from "./rules";`
2. In `interface GameState`, directly under `playedThisTurn: boolean;`:

```ts
  /** One pick per rule axis, stamped before the game starts and immutable for
   *  the run. `chooseRules` is the only writer. See src/rules.ts. */
  rules: RuleSelections;
```

3. In `newGame`'s returned object, directly under `playedThisTurn: false,`:

```ts
    rules: { ...DEFAULT_RULES },
```

4. After `chooseDeck` (below line 268):

```ts
/** Locks in the rule picks. Legal only while deck-building, like the deck
 *  itself: everything after `pickFaction` - the AI chain, the log, the
 *  animations - may branch on an axis, so a mid-run swap could contradict
 *  what the player has already seen happen. */
export function chooseRules(
  state: GameState, rules: RuleSelections,
): GameState {
  if (state.phase !== "deck-building") return state;
  return { ...state, rules: { ...rules } };
}
```

- [ ] **Step 4: Type-check and fix fallout**

Run: `npx tsc --noEmit`
Any test or source file that builds a `GameState` object literal (rather than spreading one) now fails for the missing `rules` field; fix each by adding `rules: DEFAULT_RULES,` (import it). Files that spread an existing state (`{ ...g, ... }`) need nothing.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, including the new `chooseRules` tests.

- [ ] **Step 6: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(rules): GameState.rules, stamped by chooseRules while deck-building"
```

(Include any other files step 4 touched, by explicit path.)

---

### Task 3: The unlimited refill in beginTurn

**Files:**
- Modify: `src/game.ts` (`OPENING_HAND` near line 168; `beginTurn` near line 430)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `GameState.rules` from Task 2.
- Produces: `HAND_REFILL` exported from `src/game.ts` (value 4); unlimited-mode `beginTurn` behaviour.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts`, add a helper beside `playingState` and new tests (import `HAND_REFILL` from `../src/game`):

```ts
/** A playing state under unlimited turn rules, human seat current. */
function unlimitedPlaying(adj?: Record<string, string[]>): GameState {
  const g = chooseRules(startGame(newGame(FACTIONS, adj)), {
    turn: "unlimited",
  });
  return pickFaction(chooseDeck(g, buildDeck()), "beta", seededRng(1));
}
```

```ts
describe("beginTurn under unlimited rules", () => {
  it("refills the hand to HAND_REFILL, reshuffling a dry deck mid-refill", () => {
    let g = unlimitedPlaying();
    // Strand the player on an empty hand and a one-card deck; the rest of
    // their cards sit in the discard, so the refill must reshuffle mid-loop.
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0
          ? {
              ...pl,
              hand: [],
              deck: pl.deck.slice(0, 1),
              discard: [...pl.deck.slice(1), ...pl.hand],
            }
          : pl,
      ),
    };
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(HAND_REFILL);
    const fresh = after.log.slice(before);
    expect(fresh.filter((e) => e.type === "draw")).toHaveLength(HAND_REFILL);
    expect(fresh.some((e) => e.type === "reshuffle")).toBe(true);
  });

  it("draws what exists when deck and discard cannot fill the hand", () => {
    let g = unlimitedPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: [], deck: ["raid"], discard: ["fortify"] } : pl,
      ),
    };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(2);
  });

  it("draws nothing when the hand is already full", () => {
    const g = unlimitedPlaying();
    // pickFaction's beginTurn already refilled to HAND_REFILL.
    expect(g.players[0].hand).toHaveLength(HAND_REFILL);
    const before = g.log.length;
    // Force the human's turn to begin again without a play, as advance never
    // would: what matters is only that a full hand draws nothing.
    const again = beginTurn(g, seededRng(3));
    expect(again.players[0].hand).toHaveLength(HAND_REFILL);
    expect(again.log.slice(before).some((e) => e.type === "draw")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts -t "beginTurn under unlimited"`
Expected: FAIL - `HAND_REFILL` not exported (and hand lengths wrong once it is).

- [ ] **Step 3: Implement**

In `src/game.ts`, under `export const OPENING_HAND = 3;`:

```ts
/** The hand the unlimited turn structure refills to at turn start: the hand a
 *  standard-rules player decides with, i.e. the opening hand plus the one
 *  turn-start draw. */
export const HAND_REFILL = OPENING_HAND + 1;
```

In `beginTurn`, replace only the single-draw block

```ts
  let hand = p.hand;
  if (deck.length > 0) {
    events.push({ turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0] });
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
```

with

```ts
  let hand = p.hand;
  if (state.rules.turn === "unlimited") {
    // Refill rather than draw one. Each draw logs the same `draw` event the
    // single-draw path logs, and a deck that runs dry mid-refill reshuffles
    // exactly as it does between turns, so the log needs no new vocabulary.
    while (
      hand.length < HAND_REFILL &&
      (deck.length > 0 || discard.length > 0)
    ) {
      if (deck.length === 0) {
        deck = shuffle(discard, rng);
        discard = [];
        events.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
      }
      events.push({
        turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0],
      });
      hand = [...hand, deck[0]];
      deck = deck.slice(1);
    }
  } else if (deck.length > 0) {
    events.push({ turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0] });
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
```

The pre-existing reshuffle block above it (deck empty and discard non-empty, before any draw) stays exactly as it is - it runs for both modes, and the standard path through the function must not change by a character.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS - the new tests, and every existing beginTurn/rng test untouched.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(rules): unlimited turn structure refills the hand to 4 at turn start"
```

---

### Task 4: playCard keeps the turn open; endTurn closes it; no discards

**Files:**
- Modify: `src/game.ts` (`playCard` return near line 1049; `discardCard` near line 1054)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `GameState.rules`, `unlimitedPlaying` helper from Task 3.
- Produces: `endTurn(state: GameState): GameState` exported from `src/game.ts`; unlimited-mode `playCard`/`discardCard` behaviour.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts` (add `endTurn` to the `../src/game` import):

```ts
describe("unlimited turn flow", () => {
  it("keeps the turn open across plays and closes it on endTurn", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["grow-crops", "grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.playedThisTurn).toBe(false);
    g = playCard(g, 0, seededRng(1));
    expect(g.playedThisTurn).toBe(false);
    expect(advance(g, seededRng(3))).toBe(g); // the turn is not over
    g = endTurn(g);
    expect(g.playedThisTurn).toBe(true);
    expect(advance(g, seededRng(3)).current).not.toBe(0);
  });

  it("endTurn is a no-op under standard rules and on a closed turn", () => {
    const standard = playingState();
    expect(endTurn(standard)).toBe(standard);
    let g = unlimitedPlaying();
    g = endTurn(g);
    expect(endTurn(g)).toBe(g);
  });

  it("never discards in unlimited mode, even with nothing playable", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["revolt"]); // unplayable while free: dead hand
    expect(discardCard(g, 0)).toBe(g);
    // the way out is endTurn, with the dead card still held
    const done = endTurn(g);
    expect(done.playedThisTurn).toBe(true);
    expect(done.players[0].hand).toEqual(["revolt"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts -t "unlimited turn flow"`
Expected: FAIL - `endTurn` is not exported.

- [ ] **Step 3: Implement**

In `src/game.ts`:

1. In `playCard`'s final return, change `playedThisTurn: true,` to:

```ts
    playedThisTurn: state.rules.turn !== "unlimited",
```

(`playedThisTurn` now reads as "turn complete": one play completes a standard turn; only `endTurn` completes an unlimited one.)

2. In `discardCard`, directly under `if (state.playedThisTurn) return state;`:

```ts
  // No discards of any kind under the unlimited turn structure: a dead hand
  // waits for the board to change, and the turn ends by endTurn alone.
  if (state.rules.turn === "unlimited") return state;
```

3. After `discardCard`:

```ts
/** Closes an unlimited-rules turn. The only writer of `playedThisTurn` that
 *  moves nothing else: no event and no log line, because the log already
 *  carries every play the turn made. Standard turns close through playCard
 *  and discardCard instead, so this refuses them. */
export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.rules.turn !== "unlimited") return state;
  if (state.playedThisTurn) return state;
  return { ...state, playedThisTurn: true };
}
```

4. Update the doc comment on `playedThisTurn` in `interface GameState` to:

```ts
  /** True once this turn is complete: a standard turn's one play or discard,
   *  or an unlimited turn's explicit endTurn. `advance` refuses to move on
   *  until it is set. */
  playedThisTurn: boolean;
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(rules): unlimited turns stay open across plays and close on endTurn"
```

---

### Task 5: The AI's unlimited turn

**Files:**
- Modify: `src/ai.ts` (`aiTakeTurn` near line 516)
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `endTurn` from Task 4, `chooseAction`/`playCard`/`discardCard` (existing).
- Produces: `aiTakeTurn` completes a WHOLE turn in either mode - every caller (`main.ts` AI chain, `fastForward` in boot-params, `sim.ts`) keeps its `advance(aiTakeTurn(g, rng), rng)` shape unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/ai.test.ts`, mirror the `seededRng`/state helpers `tests/game.test.ts` uses if they are not already present (the file has its own setup; add what is missing locally, importing `chooseRules` from `../src/game`):

```ts
function unlimitedAiPlaying(): GameState {
  const g = chooseRules(startGame(newGame(["alpha", "beta", "gamma", "delta"])), {
    turn: "unlimited",
  });
  return pickFaction(chooseDeck(g, buildDeck()), "beta", seededRng(1));
}

describe("aiTakeTurn under unlimited rules", () => {
  it("plays multiple cards, then ends the turn without discarding", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: ["grow-crops", "grow-crops", "revolt"] } : pl,
      ),
    };
    const before = g.log.length;
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    const fresh = after.log.slice(before);
    expect(fresh.filter((e) => e.type === "play")).toHaveLength(2);
    expect(fresh.some((e) => e.type === "discard")).toBe(false);
  });

  it("a dead hand ends the turn with no discard and the hand intact", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: ["revolt"] } : pl,
      ),
    };
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    expect(after.players[0].hand).toEqual(["revolt"]);
  });
});
```

(`revolt` is unplayable for a free faction, so it both pads a mixed hand and makes a dead one.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ai.test.ts -t "unlimited rules"`
Expected: FAIL - `playedThisTurn` false after one call, or a `discard` event logged.

- [ ] **Step 3: Implement**

In `src/ai.ts`, add `endTurn` to the `./game` import and replace `aiTakeTurn`:

```ts
/** Ceiling on plays per unlimited AI turn. The refill happens only at turn
 *  start, so the hand itself bounds the loop; the cap is belt-and-braces
 *  against a future card that adds cards to the hand mid-turn. */
const MAX_AI_PLAYS = 16;

/** One WHOLE turn for the current seat, in either mode - every caller wraps
 *  this in `advance`, so a partial turn here would stall the game. Under
 *  unlimited rules that means the same one-card policy consulted again on
 *  each updated state until it finds nothing playable: no new branches, so
 *  POLICY_COVERAGE is untouched, and no discards, so a `discard` verdict is
 *  the stop signal rather than an action. */
export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  if (state.rules.turn === "unlimited") {
    let g = state;
    for (let plays = 0; g.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
      const a = chooseAction(g);
      if (a.type === "discard") break;
      const next = playCard(g, a.cardIndex, rng, a.targetId);
      if (next === g) break; // a refused play must not spin
      g = next;
    }
    return endTurn(g);
  }
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId);
}
```

(`endTurn` on an ended phase returns the state unchanged, which is right: a play that won the game mid-turn needs no turn-close, and the callers' `phase === "playing"` loop guards already stop.)

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS - `sim.test.ts` and the scenario/pacing suites in particular, which pin the standard path.

- [ ] **Step 5: Commit**

```bash
git add src/ai.ts tests/ai.test.ts
git commit -m "feat(rules): AI plays out a whole unlimited turn, ending without discards"
```

---

### Task 6: Boot param rules= and its docs

**Files:**
- Modify: `src/boot-params.ts`, `src/main.ts` (storage seeding near line 142), `CLAUDE.md` (boot-param list)
- Test: `tests/boot-params.test.ts`

**Interfaces:**
- Consumes: `RuleSelections`, `mergeRules`, `DEFAULT_RULES`, `RULES_PREFS_KEY` from Task 1; `chooseRules` from Task 2.
- Produces: `BootParams.rules: RuleSelections | null`; `?rules=turn:unlimited` boots an unlimited game.

- [ ] **Step 1: Write the failing tests**

In `tests/boot-params.test.ts`, following the file's existing import and state-construction idiom:

```ts
describe("rules=", () => {
  it("parses axis:option pairs and drops unknown ones", () => {
    expect(parseBootParams("?rules=turn:unlimited")?.rules)
      .toEqual({ turn: "unlimited" });
    expect(parseBootParams("?rules=turn:unlimited;bogus:x")?.rules)
      .toEqual({ turn: "unlimited" });
    expect(parseBootParams("?rules=turn:gone")?.rules).toEqual(DEFAULT_RULES);
  });

  it("is null when absent, so a bare URL is untouched", () => {
    expect(parseBootParams("?seed=1")?.rules).toBeNull();
    expect(parseBootParams("")).toBeNull();
  });

  it("stamps the picks into the booted state", () => {
    const params = parseBootParams("?rules=turn:unlimited&faction=beta&seed=1");
    const g = applyBootParams(
      newGame(["alpha", "beta", "gamma"]), params!, seededRng(1),
    );
    expect(g.rules.turn).toBe("unlimited");
    expect(g.phase).toBe("playing");
  });

  it("reaches a booted deck screen too", () => {
    const params = parseBootParams("?rules=turn:unlimited&screen=deck");
    const g = applyBootParams(
      newGame(["alpha", "beta", "gamma"]), params!, seededRng(1),
    );
    expect(g.phase).toBe("deck-building");
    expect(g.rules.turn).toBe("unlimited");
  });
});
```

(Import `DEFAULT_RULES` from `../src/rules`; reuse the file's existing `seededRng`/faction fixtures, adding them only if absent.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/boot-params.test.ts -t "rules="`
Expected: FAIL - `rules` is not a `BootParams` field.

- [ ] **Step 3: Implement in src/boot-params.ts**

1. Extend the `./game` import with `chooseRules`, and add:
   `import { DEFAULT_RULES, mergeRules, type RuleSelections } from "./rules";`
   (`DEFAULT_RULES` only if the file ends up needing it; drop it otherwise.)
2. In `interface BootParams`:

```ts
  /** Rule picks for the booted game, or null to leave the defaults. Unknown
   *  axes and options are dropped by `mergeRules`, the same rule that drops
   *  an unknown `rel=` track, so a URL from before an axis existed - or
   *  after one is removed - still boots. */
  rules: RuleSelections | null;
```

3. Add the parser beside `parseRel`:

```ts
/** `rules=turn:unlimited;other:pick` - axis:option pairs, `;`-separated, the
 *  `rel=` clause convention. Unparseable or unknown pairs are dropped, never
 *  thrown, for the same reason parseRel drops them. */
function parseRules(raw: string): RuleSelections {
  const picks: Record<string, unknown> = {};
  for (const clause of raw.split(";")) {
    const [axis, option] = clause.split(":");
    if (axis === undefined || option === undefined) continue;
    picks[axis.trim()] = option.trim();
  }
  return mergeRules(picks);
}
```

4. Add `"rules"` to `BOOT_KEYS`. In `parseBootParams`, add `const rules = q.get("rules");` beside the other reads and to the returned object:

```ts
    rules: rules === null ? null : parseRules(rules),
```

5. In `applyBootParams`, stamp the picks before the deck-screen early return, so a booted picker already carries them:

```ts
  let g = startGame(state);
  if (params.rules !== null) g = chooseRules(g, params.rules);
```

(the `if (params.screen === "deck") return g;` line stays directly after).

- [ ] **Step 4: Seed the pref on a booted page in src/main.ts**

A booted page runs on memory storage; the deck screen reads its picks from the prefs, so the param has to seed them the way `popups=` seeds `LOG_PREFS_KEY`. In the storage IIFE (near line 144), under the `boot.popups` block:

```ts
    if (boot.rules !== null) {
      mem.setItem(RULES_PREFS_KEY, JSON.stringify(boot.rules));
    }
```

Add `RULES_PREFS_KEY` to the `./rules` import in `main.ts` (create the import; Task 8 extends it).

- [ ] **Step 5: Document the param**

In `02-balticmap/CLAUDE.md`, add to the query-param bullet list, after the `rel=` bullet:

```markdown
- `rules=turn:unlimited` - rule picks, `axis:option` pairs separated by `;`.
  An unknown axis or option is dropped by the `rel=` unknown-track rule; an
  omitted axis keeps its default. The pick also seeds the booted page's rules
  preference, so a booted deck screen shows it.
```

- [ ] **Step 6: Run the suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/boot-params.ts src/main.ts tests/boot-params.test.ts CLAUDE.md
git commit -m "feat(rules): rules= boot param stamps and seeds the picked rule set"
```

---

### Task 7: The human's unlimited turn: End turn button and flow

**Files:**
- Modify: `src/hud.ts` (`HudCallbacks` near line 31; button creation near line 676; append list near line 926; `renderHand` near line 1261; `renderStatus` near line 1493; visibility block near line 1701), `src/main.ts` (`discardMode` near line 215; `afterHumanAction` callers near lines 938 and 1132; HUD callbacks near line 912), `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `endTurn` from Task 4; `GameState.rules`.
- Produces: `HudCallbacks.onEndTurn?(): void` and `HudCallbacks.isResolving?(): boolean`; a `.end-turn-btn` element; `afterHumanPlay()` in `main.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/hud.test.ts`: add `chooseRules` to the `../src/game` import. In `setup`'s `opts` type add `onEndTurn?: () => void; isResolving?: () => boolean;` and to the `cb` construction:

```ts
    ...(opts?.onEndTurn ? { onEndTurn: opts.onEndTurn } : {}),
    ...(opts?.isResolving ? { isResolving: opts.isResolving } : {}),
```

Add local helpers beside the file's existing state builders (adapting names to what the file already has):

```ts
function unlimitedHudPlaying(): GameState {
  const g = chooseRules(startGame(newGame(FACTIONS)), { turn: "unlimited" });
  return pickFaction(chooseDeck(g, buildDeck()), "alpha", seededRng(1));
}
```

Then:

```ts
describe("End turn button", () => {
  it("is hidden under standard rules", () => {
    const { container, hud } = setup({ onEndTurn: vi.fn() });
    hud.update(standardPlayingState(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.classList.contains("hidden")).toBe(true);
  });

  it("shows, enables and fires on the human's unlimited turn", () => {
    const onEndTurn = vi.fn();
    const { container, hud } = setup({ onEndTurn });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.classList.contains("hidden")).toBe(false);
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a play is resolving and once the turn is closed", () => {
    const { container, hud } = setup({
      onEndTurn: vi.fn(), isResolving: () => true,
    });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("keeps the hand inert while a play is resolving", () => {
    const { container, hud } = setup({ isResolving: () => true });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const card = container.querySelector(".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
  });
});
```

(`standardPlayingState()` is whatever helper the file already uses to reach a playing state; reuse it rather than adding a duplicate.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hud.test.ts -t "End turn"`
Expected: FAIL - no `.end-turn-btn` in the DOM.

- [ ] **Step 3: Implement in src/hud.ts**

1. In `HudCallbacks`:

```ts
  /** Close an unlimited-rules turn. Absent where no such turn exists
   *  (standard rules, tests): the button then never renders. */
  onEndTurn?(): void;
  /** True while a committed action is still resolving - a card in flight or
   *  the AI chain behind it. The unlimited hand stays open between plays, so
   *  `playedThisTurn` alone no longer covers the flight window. */
  isResolving?(): boolean;
```

2. After the `surrenderBtn` block (near line 695):

```ts
  // Closes an unlimited-rules turn. No confirm step, unlike Surrender: ending
  // a turn is routine and reversible next turn, not terminal.
  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "end-turn-btn hidden";
  endTurnBtn.textContent = "End turn";
  endTurnBtn.addEventListener("click", () => cb.onEndTurn?.());
```

3. Add `endTurnBtn` to the container append list (line 926), after `surrenderBtn`.
4. In `renderHand`, change the `canPlay` line to:

```ts
    const canPlay =
      isHumanTurn(state) && !state.playedThisTurn &&
      !(cb.isResolving?.() ?? false);
```

5. In `renderStatus`'s `isHumanTurn` branch (line 1506), keep the pin branch as is and change the prompt to:

```ts
      } else if (isHumanTurn(state)) {
        if (state.rules.turn === "unlimited") {
          statusText.textContent =
            `Turn ${state.turn} - play cards, then end your turn`;
        } else {
          statusText.textContent = (cb.isDiscardMode?.() ?? false)
            ? "No playable card - discard one"
            : `Turn ${state.turn} - play a card`;
        }
      } else {
```

6. In the visibility block (near line 1701), after the `surrenderBtn` toggle:

```ts
      endTurnBtn.classList.toggle(
        "hidden",
        state.phase !== "playing" || state.rules.turn !== "unlimited" ||
          cb.onEndTurn === undefined,
      );
      endTurnBtn.disabled =
        !isHumanTurn(state) || state.playedThisTurn ||
        (cb.isResolving?.() ?? false);
```

- [ ] **Step 4: Implement in src/main.ts**

1. Add `endTurn` to the `./game` import.
2. In `discardMode()`, add a first conjunct:

```ts
function discardMode(): boolean {
  return (
    game.rules.turn !== "unlimited" &&
    isHumanTurn(game) &&
    !game.playedThisTurn &&
    humanPlayableSet().mode === "discard"
  );
}
```

3. Add beside `afterHumanAction`:

```ts
/** After a completed human PLAY. An unlimited turn stays open: wait out the
 *  flight with input locked, then hand the turn back to the player rather
 *  than to the AI chain. A standard turn - or a play that ended the run -
 *  falls through to afterHumanAction as before. */
function afterHumanPlay(): void {
  if (game.rules.turn === "unlimited" && game.phase === "playing") {
    resolving = true;
    refresh();
    hud.afterPlayAnimation(() => {
      resolving = false;
      refresh();
    });
    return;
  }
  afterHumanAction();
}
```

4. Replace `afterHumanAction()` with `afterHumanPlay()` at exactly the two PLAY sites: after `game = playCard(game, index, rng);` in `onPlayCard` (line 938) and after the targeted play in the map-click handler (line 1132). The forced-discard site (line 917) keeps `afterHumanAction()` - it is unreachable in unlimited mode anyway.
5. In the HUD callbacks object (beside `onPlayCard`):

```ts
    onEndTurn() {
      if (!isHumanTurn(game) || game.playedThisTurn || resolving) return;
      if (game.rules.turn !== "unlimited") return;
      disarm();
      game = endTurn(game);
      afterHumanAction();
    },
    isResolving() {
      return resolving;
    },
```

- [ ] **Step 5: Style the button in src/style.css**

Beside the `.surrender-btn` rules:

```css
/* Bottom-right, clear of the hand fan and the discard pile - re-check the
   corner in a browser whenever either moves. */
.end-turn-btn {
  position: absolute;
  right: 16px;
  bottom: 170px;
  font-size: 14px;
  padding: 8px 18px;
  border: 1px solid #c9b896;
  border-radius: 5px;
  background: #fff;
  color: #6b6152;
  cursor: pointer;
  z-index: 6;
}

.end-turn-btn.hidden {
  display: none;
}

.end-turn-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 6: Run the suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hud.ts src/main.ts src/style.css tests/hud.test.ts
git commit -m "feat(rules): End turn button and open-hand flow for unlimited turns"
```

---

### Task 8: The deck screen's Rules button, summary and modal

**Files:**
- Modify: `src/deck-screen.ts`, `src/main.ts` (prefs wiring near lines 158, 1027-1074), `src/style.css`
- Test: `tests/deck-screen.test.ts`

**Interfaces:**
- Consumes: `RULE_AXES`, `RuleSelections`, `DEFAULT_RULES`, `summarizeRules`, `loadRulesPrefs`, `saveRulesPrefs` from Task 1; `chooseRules` from Task 2.
- Produces: `DeckScreenView.rules: RuleSelections`; `DeckScreenCallbacks.onRulesChange?(next: RuleSelections): void`; `.ds-rules-btn`, `.ds-rules-summary`, `.ds-rules-overlay`, `.ds-rules-done` elements; radio inputs named `ds-rules-<axisId>`.

- [ ] **Step 1: Write the failing tests**

In `tests/deck-screen.test.ts`: add `onRulesChange: vi.fn(),` to the `cb` object in `setup`, add `rules: DEFAULT_RULES,` to the `view()` helper's base object (import `DEFAULT_RULES` from `../src/rules`), and add:

```ts
describe("rules picker", () => {
  it("summarizes the current picks and keeps the options out of the screen", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "One card per turn",
    );
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("opens the modal from the button and closes it on Done", () => {
    const { container, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(false);
    q(container, ".ds-rules-done").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("reports a radio pick and reflects the updated view", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    const radio = container.querySelector(
      'input[name="ds-rules-turn"][value="unlimited"]',
    ) as HTMLInputElement;
    radio.click();
    expect(cb.onRulesChange).toHaveBeenCalledWith({ turn: "unlimited" });
    screen.update(view({ rules: { turn: "unlimited" } }));
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "Unlimited plays",
    );
    expect(radio.checked).toBe(true);
  });

  it("keeps the rules row outside the scrolling grid", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-deck").contains(q(container, ".ds-rules-row")))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/deck-screen.test.ts -t "rules picker"`
Expected: FAIL - no `.ds-rules-summary`.

- [ ] **Step 3: Implement in src/deck-screen.ts**

1. Imports: `import { DEFAULT_RULES, RULE_AXES, summarizeRules, type RuleSelections } from "./rules";`
2. `DeckScreenView` gains:

```ts
  /** The rule picks to display - the owner's saved preference. */
  rules: RuleSelections;
```

3. `DeckScreenCallbacks` gains:

```ts
  /** A radio pick in the rules modal. Fired per change, not on Done, so the
   *  pick is remembered even if the player closes the screen another way.
   *  Optional like the tip pair: a screen built without it renders the
   *  summary and an inert modal rather than crashing. */
  onRulesChange?(next: RuleSelections): void;
```

4. After the `start` button creation (near line 89), build the row and the modal. The modal is the ONLY place options are listed; the row carries just the button and the summary:

```ts
  // The pick that applies to the next game, stated without its alternatives:
  // the options live in the modal alone, so the screen stays a deck picker.
  const rulesRow = document.createElement("div");
  rulesRow.className = "ds-rules-row";
  const rulesBtn = document.createElement("button");
  rulesBtn.className = "ds-rules-btn";
  rulesBtn.textContent = "Rules";
  const rulesSummary = document.createElement("span");
  rulesSummary.className = "ds-rules-summary";
  rulesRow.append(rulesBtn, rulesSummary);

  const rulesOverlay = document.createElement("div");
  rulesOverlay.className = "ds-rules-overlay hidden";
  const rulesInner = document.createElement("div");
  rulesInner.className = "ds-rules-inner";
  /** What the view last reported, so a radio change can report a complete
   *  RuleSelections rather than a lone axis. */
  let currentRules: RuleSelections = { ...DEFAULT_RULES };
  const radios: {
    axisId: keyof RuleSelections; optionId: string; input: HTMLInputElement;
  }[] = [];
  // Built once: RULE_AXES is static, so update() only syncs checked state.
  for (const axis of RULE_AXES) {
    const axisName = document.createElement("div");
    axisName.className = "ds-rules-axis-name";
    axisName.textContent = axis.name;
    rulesInner.appendChild(axisName);
    for (const option of axis.options) {
      const label = document.createElement("label");
      label.className = "ds-rules-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `ds-rules-${axis.id}`;
      input.value = option.id;
      input.addEventListener("change", () => {
        cb.onRulesChange?.({ ...currentRules, [axis.id]: option.id });
      });
      const optionName = document.createElement("span");
      optionName.className = "ds-rules-option-name";
      optionName.textContent = option.name;
      const optionText = document.createElement("span");
      optionText.className = "ds-rules-option-text";
      optionText.textContent = option.text;
      label.append(input, optionName, optionText);
      rulesInner.appendChild(label);
      radios.push({ axisId: axis.id, optionId: option.id, input });
    }
  }
  const rulesDone = document.createElement("button");
  rulesDone.className = "notice-continue ds-rules-done";
  rulesDone.textContent = "Done";
  rulesInner.appendChild(rulesDone);
  rulesOverlay.appendChild(rulesInner);
  rulesBtn.addEventListener("click", () =>
    rulesOverlay.classList.remove("hidden"),
  );
  rulesDone.addEventListener("click", () =>
    rulesOverlay.classList.add("hidden"),
  );
```

5. Change the root append (line 91) to include both, keeping the row with the other action controls outside the grid:

```ts
  root.append(
    title, deckLabel, deckRow, counter, undiscovered, rulesRow, start,
    packOverlay, rulesOverlay,
  );
```

6. In `update()`: add `rulesRow` to the hide-while-a-pack-is-open loop (`for (const el of [deckLabel, deckRow, counter, start])` -> `[deckLabel, deckRow, counter, rulesRow, start]`), and sync the picks near the top, after the `savedPicks` block:

```ts
      currentRules = view.rules;
      rulesSummary.textContent = summarizeRules(view.rules);
      for (const r of radios) {
        r.input.checked = view.rules[r.axisId] === r.optionId;
      }
```

- [ ] **Step 4: Wire src/main.ts**

1. Extend the `./rules` import (started in Task 6) to: `import { RULES_PREFS_KEY, loadRulesPrefs, saveRulesPrefs, type RuleSelections } from "./rules";` and add `chooseRules` to the `./game` import.
2. After `let meta: MetaRecord = ...` (line 158):

```ts
/** The rule picks the next game starts with. Loaded once and kept in sync
 *  with storage on every change; a booted page's memory storage was seeded
 *  from `rules=` above, so this needs no boot special case. */
let rulesPrefs: RuleSelections = loadRulesPrefs(storage);
```

3. In `deckScreenView`'s returned object: `rules: rulesPrefs,`
4. In the `createDeckScreen` callbacks:

```ts
  onRulesChange(next) {
    rulesPrefs = next;
    saveRulesPrefs(storage, rulesPrefs);
    deckScreen.update(deckScreenView(true));
  },
```

5. In `onStart`, stamp the picks before the deck (line 1071):

```ts
    game = chooseRules(game, rulesPrefs);
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
```

- [ ] **Step 5: Style it in src/style.css**

Beside the other `.ds-` rules. The overlay is a dark box and states its own text colour; the option text restates the colour rather than inheriting across the light/dark boundary:

```css
.ds-rules-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.ds-rules-btn {
  font-size: 13px;
  padding: 5px 14px;
  border: 1px solid #c9b896;
  border-radius: 5px;
  background: #fff;
  color: #6b6152;
  cursor: pointer;
}

.ds-rules-summary {
  color: #cbbfa4;
  font-size: 13px;
}

.ds-rules-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 8, 4, 0.75);
  z-index: 30;
}

.ds-rules-overlay.hidden {
  display: none;
}

.ds-rules-inner {
  background: #1b1710;
  color: #e8dfc8;
  border: 1px solid #c9b896;
  border-radius: 8px;
  padding: 20px 24px;
  max-width: 440px;
}

.ds-rules-axis-name {
  font-weight: bold;
  margin-bottom: 8px;
}

.ds-rules-option {
  display: block;
  margin: 8px 0;
  cursor: pointer;
}

.ds-rules-option-name {
  margin-left: 6px;
}

.ds-rules-option-text {
  display: block;
  font-size: 12px;
  color: #cbbfa4;
  margin-left: 24px;
}

.ds-rules-done {
  margin-top: 16px;
}
```

- [ ] **Step 6: Run the suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/deck-screen.ts src/main.ts src/style.css tests/deck-screen.test.ts
git commit -m "feat(rules): deck-screen Rules button, summary and picker modal"
```

---

### Task 9: Full verification and browser pass

**Files:**
- No new files; fixes land where the pass finds them.

- [ ] **Step 1: Full gates**

Run, from `02-balticmap/`: `npm test && npm run build`
Expected: both PASS. `npm test` includes the drift/golden and pacing suites that pin the standard game.

- [ ] **Step 2: Browser pass**

Start the root dev server per the repo AGENTS.md and check, reading every screen (not just its layout):

1. `http://127.0.0.1:4173/prototypes/02/?screen=deck` - the Rules button and "One card per turn" summary sit outside the scroll grid; the modal opens, its text is legible on the dark box, a pick updates the summary, Done closes it.
2. Pick Unlimited plays, start a run - the End turn button shows bottom-right (not overlapping the hand or discard pile); play two cards in one turn; watch the second stay available while the first flies but not before it lands; End turn hands over to the AI; the round summary lists multiple AI plays per rival where they happened.
3. Refresh onto `?rules=turn:unlimited&faction=selonians&seed=7` - boots straight into an unlimited run; the status bar reads "play cards, then end your turn".
4. `?rules=turn:unlimited&faction=selonians&seed=7&hand=revolt` - a dead hand: every card greyed, End turn still enabled, and no discard prompt.
5. A standard-rules run from the ordinary menu - no End turn button, discard prompt still appears when nothing is playable, and the deck screen remembers the last pick across a reload.

Read the draw animations in step 3's opening turn: the refill draws several cards; if the flights overlap unreadably, fix in `hud.ts`/`animate.ts` and re-run the suite.

- [ ] **Step 3: Commit any fixes**

Scoped paths, as always. Then report what to playtest (the card-work rule): a few unlimited runs, watching for whether the AI's multi-play rounds feel readable in the one-modal format, and whether turn pacing still ramps rather than snowballing on turn 2.
