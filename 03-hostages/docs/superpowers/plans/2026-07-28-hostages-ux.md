# Hostages UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prototype 03's text-dump duel screen with a card table that has legible turns, visible deck/discard piles, animated cards, and one architecturally-enforced "this happened" modal.

**Architecture:** `state.log` is promoted from a list of log lines to the single typed event stream, with a `vitals` and `piles` snapshot attached to every event. The UI is built once and mutated in place; a beat driver consumes the events appended by each engine call and animates them in order, rendering the table from each event's own snapshot rather than from final state. An exhaustive `Record<EventKind, ModalRole>` forces every event kind to declare whether it headlines a modal, folds into one, or is silent with a written reason.

**Tech Stack:** Vite, vanilla TypeScript (no framework), vitest with happy-dom, plain CSS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-28-hostages-ux-design.md`

## Global Constraints

- Working directory is `03-hostages/`. All paths in this plan are relative to it.
- **No em dashes and no non-typable unicode** anywhere in code, comments, copy or commit messages. Use `-` for dashes and `->` for arrows. This applies to user-facing game copy too.
- `npm test` and `npm run build` must both pass before every commit. `build` runs `tsc` then `vite build`, so a type error fails it.
- **Never `git add -A`.** Other sessions work in sibling prototype directories on this same branch. Stage explicit paths under `03-hostages/` only.
- No rules changes. Card effects, legality, the AI, and the win/loss conditions are untouched. If a change to `effects.ts`, `legality.ts`, `ai.ts` or the card content seems necessary, stop and report instead.
- `vite.config.ts` keeps `base: "/prototypes/03/"`. Do not change it.
- Existing engine tests (`game`, `effects`, `legality`, `ai`, `integration`, `deck`, `log`, `content`, `reachability`, `rng`, `summary`, `types`, `smoke`) must keep passing. They assert on `state.log` by `.some(e => e.kind === ...)` and `.filter(...)`, not by index, so added event kinds do not break them. If one does break, fix the test to filter by kind rather than weakening the assertion.
- Timing values live in exported constants blocks, never inline literals.

---

### Task 1: Vitals snapshot and diff

The fourteen fields worth reporting to the player, captured per event and diffed over a segment. Pure functions, no DOM.

**Files:**
- Create: `src/vitals.ts`
- Test: `tests/vitals.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Zone`, `Range` from `src/types.ts` (already exist).
- Produces:
  - `interface Vitals` with fields `playerWill, playerVigor, wifeVigor, convictWill, convictVigor, distracted, secretsLeft: number`, `bound, toppled, weaponDown, offBalance, incapacitated: boolean`, `zone: Zone`, `range: Range`
  - `type VitalsChange` (discriminated on `field`)
  - `snapshot(state: GameState): Vitals`
  - `diff(before: Vitals, after: Vitals): VitalsChange[]`
  - `lines(changes: VitalsChange[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/vitals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { snapshot, diff, lines } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

function started() {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

describe("snapshot", () => {
  it("captures every tracked field from the state", () => {
    const state = started();
    state.player.willpower = 5;
    state.convict.distracted = 2;
    state.secretsRemaining = ["secretSafe"];
    const v = snapshot(state);
    expect(v).toEqual({
      playerWill: 5,
      playerVigor: state.player.vigor,
      wifeVigor: state.wife.vigor,
      convictWill: state.convict.willpower,
      convictVigor: state.convict.vigor,
      distracted: 2,
      secretsLeft: 1,
      bound: state.player.bound,
      toppled: false,
      weaponDown: false,
      offBalance: false,
      incapacitated: false,
      zone: "livingRoom",
      range: state.scene.range,
    });
  });

  it("does not alias the state - later mutation leaves the snapshot alone", () => {
    const state = started();
    const v = snapshot(state);
    state.player.vigor -= 3;
    expect(v.playerVigor).toBe(state.player.vigor + 3);
  });
});

describe("diff", () => {
  it("is empty when nothing moved", () => {
    const state = started();
    expect(diff(snapshot(state), snapshot(state))).toEqual([]);
  });

  it("reports numeric changes with from and to", () => {
    const state = started();
    const before = snapshot(state);
    state.player.vigor -= 2;
    state.wife.vigor -= 1;
    const changes = diff(before, snapshot(state));
    expect(changes).toContainEqual({
      field: "playerVigor",
      from: before.playerVigor,
      to: before.playerVigor - 2,
    });
    expect(changes).toContainEqual({
      field: "wifeVigor",
      from: before.wifeVigor,
      to: before.wifeVigor - 1,
    });
  });

  it("reports boolean and enum changes", () => {
    const state = started();
    const before = snapshot(state);
    state.player.bound = !before.bound;
    state.scene.zone = "bedroom";
    const changes = diff(before, snapshot(state));
    expect(changes).toContainEqual({ field: "bound", from: before.bound, to: !before.bound });
    expect(changes).toContainEqual({ field: "zone", from: "livingRoom", to: "bedroom" });
  });

  it("returns changes in a stable declared order, not object key order", () => {
    const state = started();
    const before = snapshot(state);
    state.scene.range = before.range === "near" ? "away" : "near";
    state.player.vigor -= 1;
    state.convict.willpower -= 1;
    const fields = diff(before, snapshot(state)).map((c) => c.field);
    expect(fields).toEqual(["playerVigor", "convictWill", "range"]);
  });
});

describe("lines", () => {
  it("phrases numeric changes with an arrow", () => {
    expect(lines([{ field: "playerVigor", from: 6, to: 4 }])).toEqual(["Your vigor 6 -> 4"]);
    expect(lines([{ field: "wifeVigor", from: 4, to: 2 }])).toEqual(["Her vigor 4 -> 2"]);
    expect(lines([{ field: "convictVigor", from: 3, to: 0 }])).toEqual(["His vigor 3 -> 0"]);
  });

  it("phrases boolean changes as prose in both directions", () => {
    expect(lines([{ field: "bound", from: true, to: false }])).toEqual(["Your hands are free"]);
    expect(lines([{ field: "bound", from: false, to: true }])).toEqual(["You are bound"]);
    expect(lines([{ field: "incapacitated", from: false, to: true }])).toEqual(["He is down"]);
    expect(lines([{ field: "incapacitated", from: true, to: false }])).toEqual([
      "He is back on his feet",
    ]);
  });

  it("phrases distraction by its new value, and its loss as prose", () => {
    expect(lines([{ field: "distracted", from: 0, to: 2 }])).toEqual(["He is distracted (2)"]);
    expect(lines([{ field: "distracted", from: 1, to: 0 }])).toEqual(["He shakes it off"]);
  });

  it("phrases scene changes", () => {
    expect(lines([{ field: "zone", from: "livingRoom", to: "bedroom" }])).toEqual([
      "You are in the bedroom",
    ]);
    expect(lines([{ field: "range", from: "away", to: "near" }])).toEqual(["He is close"]);
  });

  it("contains no em dashes or unicode arrows", () => {
    const all = lines([
      { field: "playerVigor", from: 6, to: 4 },
      { field: "zone", from: "livingRoom", to: "bedroom" },
    ]).join(" ");
    expect(all).not.toMatch(/[—→←…•]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vitals.test.ts`
Expected: FAIL with "Failed to resolve import ../src/vitals".

- [ ] **Step 3: Write the implementation**

Create `src/vitals.ts`:

```ts
import type { GameState, Range, Zone } from "./types";

/** The fields worth reporting to the player when they change. Deliberately
 *  excludes pile sizes and hand contents: those are drawn, not narrated. */
export interface Vitals {
  playerWill: number;
  playerVigor: number;
  wifeVigor: number;
  convictWill: number;
  convictVigor: number;
  distracted: number;
  secretsLeft: number;
  bound: boolean;
  toppled: boolean;
  weaponDown: boolean;
  offBalance: boolean;
  incapacitated: boolean;
  zone: Zone;
  range: Range;
}

type NumericField =
  | "playerWill"
  | "playerVigor"
  | "wifeVigor"
  | "convictWill"
  | "convictVigor"
  | "distracted"
  | "secretsLeft";

type BooleanField = "bound" | "toppled" | "weaponDown" | "offBalance" | "incapacitated";

export type VitalsChange =
  | { field: NumericField; from: number; to: number }
  | { field: BooleanField; from: boolean; to: boolean }
  | { field: "zone"; from: Zone; to: Zone }
  | { field: "range"; from: Range; to: Range };

export function snapshot(state: GameState): Vitals {
  return {
    playerWill: state.player.willpower,
    playerVigor: state.player.vigor,
    wifeVigor: state.wife.vigor,
    convictWill: state.convict.willpower,
    convictVigor: state.convict.vigor,
    distracted: state.convict.distracted,
    secretsLeft: state.secretsRemaining.length,
    bound: state.player.bound,
    toppled: state.player.toppled,
    weaponDown: state.convict.weaponDown,
    offBalance: state.convict.offBalance,
    incapacitated: state.convict.incapacitated,
    zone: state.scene.zone,
    range: state.scene.range,
  };
}

/** Reading order for the modal: your body, her body, his body, his conditions,
 *  your conditions, the room. Fixed here so output never depends on key order. */
const ORDER: Array<VitalsChange["field"]> = [
  "playerWill",
  "playerVigor",
  "wifeVigor",
  "convictWill",
  "convictVigor",
  "secretsLeft",
  "bound",
  "toppled",
  "incapacitated",
  "weaponDown",
  "offBalance",
  "distracted",
  "zone",
  "range",
];

export function diff(before: Vitals, after: Vitals): VitalsChange[] {
  const changes: VitalsChange[] = [];
  for (const field of ORDER) {
    if (before[field] === after[field]) continue;
    changes.push({ field, from: before[field], to: after[field] } as VitalsChange);
  }
  return changes;
}

function numericLine(field: NumericField, from: number, to: number): string {
  switch (field) {
    case "playerWill":
      return `Your willpower ${from} -> ${to}`;
    case "playerVigor":
      return `Your vigor ${from} -> ${to}`;
    case "wifeVigor":
      return `Her vigor ${from} -> ${to}`;
    case "convictWill":
      return `His willpower ${from} -> ${to}`;
    case "convictVigor":
      return `His vigor ${from} -> ${to}`;
    case "secretsLeft":
      return `Secrets left ${from} -> ${to}`;
    case "distracted":
      return to === 0 ? "He shakes it off" : `He is distracted (${to})`;
  }
}

function booleanLine(field: BooleanField, to: boolean): string {
  switch (field) {
    case "bound":
      return to ? "You are bound" : "Your hands are free";
    case "toppled":
      return to ? "You are on the floor" : "You are upright";
    case "weaponDown":
      return to ? "His knife is on the floor" : "He is armed again";
    case "offBalance":
      return to ? "He is off-balance" : "He is steady";
    case "incapacitated":
      return to ? "He is down" : "He is back on his feet";
  }
}

export function lines(changes: VitalsChange[]): string[] {
  return changes.map((c) => {
    switch (c.field) {
      case "zone":
        return c.to === "bedroom" ? "You are in the bedroom" : "You are in the living room";
      case "range":
        return c.to === "near" ? "He is close" : "He moves away";
      case "bound":
      case "toppled":
      case "weaponDown":
      case "offBalance":
      case "incapacitated":
        return booleanLine(c.field, c.to);
      default:
        return numericLine(c.field, c.from, c.to);
    }
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/vitals.test.ts && npm run typecheck`
Expected: all vitals tests PASS, typecheck clean.

- [ ] **Step 5: Run the whole suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vitals.ts tests/vitals.test.ts
git commit -m "feat(hostages): vitals snapshot and diff for event-driven UI"
```

---

### Task 2: Promote the log to the event stream

`LogEntry` becomes `GameEvent`, gains `vitals` and `piles` snapshots, and three new kinds appear: `turn`, `draw`, `reshuffle`.

**Files:**
- Modify: `src/types.ts` (rename `LogKind` -> `EventKind`, `LogEntry` -> `GameEvent`, add kinds and snapshot fields)
- Modify: `src/log.ts` (fill snapshots in `push`; add `logTurn`, `logDraw`, `logReshuffle`)
- Modify: `src/deck.ts` (`drawCard` gains an `onReshuffle` callback)
- Modify: `src/game.ts` (emit turn markers and draws through a helper)
- Test: `tests/events.test.ts` (new), `tests/log.test.ts` (extend)

**Interfaces:**
- Consumes: `snapshot` from `src/vitals.ts` (Task 1).
- Produces:
  - `type EventKind = "scene" | "turn" | "lead" | "answer" | "decline" | "effect" | "coercion" | "surrender" | "recover" | "haulUp" | "pass" | "discard" | "draw" | "reshuffle" | "outcome"`
  - `interface EventPiles { player: { deck: number; discard: number; hand: readonly string[] }; convict: { deck: number; discard: number; hand: number } }`
  - `interface GameEvent { turn: number; side: Side | "system"; kind: EventKind; cardId?: string; text: string; deltas: string[]; vitals: Vitals; piles: EventPiles }`
  - `logTurn(state: GameState, side: Side): void`
  - `logDraw(state: GameState, side: Side, cardId: string): void`
  - `logReshuffle(state: GameState, side: Side): void`
  - `drawCard(pile: Pile, rng: RngState, onReshuffle?: () => void): string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newRun, chooseOpening, playerLead, playerPass } from "../src/game";
import { drawCard } from "../src/deck";
import type { EventKind, GameState } from "../src/types";

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

const kinds = (state: GameState): EventKind[] => state.log.map((e) => e.kind);

describe("event stream", () => {
  it("stamps vitals on every event", () => {
    const state = started();
    expect(state.log.length).toBeGreaterThan(0);
    for (const e of state.log) {
      expect(e.vitals.playerVigor).toBe(state.player.vigor);
      expect(typeof e.vitals.secretsLeft).toBe("number");
    }
  });

  it("stamps pile snapshots on every event", () => {
    const state = started();
    const last = state.log[state.log.length - 1];
    expect(last.piles.player.hand).toEqual(state.playerPile.hand);
    expect(last.piles.player.deck).toBe(state.playerPile.deck.length);
    expect(last.piles.convict.hand).toBe(state.convictPile.hand.length);
  });

  it("does not alias the hand - later mutation leaves the snapshot alone", () => {
    const state = started();
    const before = state.log[state.log.length - 1].piles.player.hand.length;
    state.playerPile.hand.push("stoic");
    expect(state.log[state.log.length - 1].piles.player.hand).toHaveLength(before);
  });

  it("emits a draw per card dealt in the opening", () => {
    const state = started();
    // three for each side
    expect(state.log.filter((e) => e.kind === "draw")).toHaveLength(6);
  });

  it("emits a turn marker for each side's turn", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = [];
    playerLead(state, "stallHim");
    const turnMarkers = state.log.filter((e) => e.kind === "turn");
    expect(turnMarkers.map((e) => e.side)).toContain("convict");
  });

  it("puts the convict turn marker before anything he does", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    const seq = kinds(state);
    const marker = seq.lastIndexOf("turn");
    expect(marker).toBeGreaterThan(-1);
    const convictMarker = state.log.findIndex((e) => e.kind === "turn" && e.side === "convict");
    const convictDraw = state.log.findIndex((e) => e.kind === "draw" && e.side === "convict" && e.turn > 1);
    expect(convictMarker).toBeLessThan(convictDraw);
  });

  it("marks the turn with the number it belongs to", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    for (const e of state.log.filter((m) => m.kind === "turn")) {
      expect(e.turn).toBeGreaterThan(0);
    }
  });
});

describe("drawCard reshuffle hook", () => {
  it("fires exactly once when the deck is refilled from the discard", () => {
    let fired = 0;
    const pile = { deck: [], discard: ["stoic", "stallHim"], hand: [] as string[] };
    drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
    drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
  });

  it("does not fire when both deck and discard are empty", () => {
    let fired = 0;
    const pile = { deck: [] as string[], discard: [] as string[], hand: [] as string[] };
    expect(drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    })).toBeNull();
    expect(fired).toBe(0);
  });

  it("still works with no callback supplied", () => {
    const pile = { deck: ["stoic"], discard: [] as string[], hand: [] as string[] };
    expect(drawCard(pile, { seed: 7 })).toBe("stoic");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/events.test.ts`
Expected: FAIL - no `EventKind` export, no `vitals` on entries, zero `draw` events.

- [ ] **Step 3: Update `src/types.ts`**

Replace the `LogKind` and `LogEntry` declarations (currently lines 96-117) with:

```ts
export type EventKind =
  | "scene"
  | "turn"
  | "lead"
  | "answer"
  | "decline"
  | "effect"
  | "coercion"
  | "surrender"
  | "recover"
  | "haulUp"
  | "pass"
  | "discard"
  | "draw"
  | "reshuffle"
  | "outcome";

/** Pile sizes and the player's hand as they stood when the event fired. The
 *  UI draws from these rather than from final state, so a chain of events
 *  animates through the intermediate positions instead of snapping. */
export interface EventPiles {
  player: { deck: number; discard: number; hand: readonly string[] };
  convict: { deck: number; discard: number; hand: number };
}

export interface GameEvent {
  turn: number;
  side: Side | "system";
  kind: EventKind;
  cardId?: string;
  text: string;
  deltas: string[];
  vitals: Vitals;
  piles: EventPiles;
}
```

Add `import type { Vitals } from "./vitals";` at the top of `src/types.ts`, and change `GameState.log` to `log: GameEvent[]`.

Note: `src/vitals.ts` imports `GameState` from `src/types.ts` and `src/types.ts` imports `Vitals` from `src/vitals.ts`. This is a type-only cycle, which TypeScript resolves and which erases entirely at runtime. Both imports must use `import type` so no runtime cycle is created.

- [ ] **Step 4: Update `src/log.ts`**

Replace the file with:

```ts
import { cardById, cardNameInProse } from "./content/cards";
import { snapshot } from "./vitals";
import type { EventPiles, GameEvent, EventKind, GameState, Side } from "./types";

export function actorName(side: Side | "system"): string {
  if (side === "player") return "You";
  if (side === "convict") return "The Convict";
  return "";
}

/** Copies the hand so a later mutation cannot rewrite history. */
function pilesOf(state: GameState): EventPiles {
  return {
    player: {
      deck: state.playerPile.deck.length,
      discard: state.playerPile.discard.length,
      hand: [...state.playerPile.hand],
    },
    convict: {
      deck: state.convictPile.deck.length,
      discard: state.convictPile.discard.length,
      hand: state.convictPile.hand.length,
    },
  };
}

export function push(
  state: GameState,
  entry: Omit<GameEvent, "turn" | "vitals" | "piles">,
): void {
  state.log.push({
    ...entry,
    turn: state.turn,
    vitals: snapshot(state),
    piles: pilesOf(state),
  });
}

export function logCard(
  state: GameState,
  side: Side,
  kind: "lead" | "answer",
  cardId: string,
  deltas: string[],
): void {
  const card = cardById(cardId);
  push(state, {
    side,
    kind,
    cardId,
    text: `${actorName(side)} play${side === "player" ? "" : "s"} ${cardNameInProse(card.name)}. ${card.narration}`,
    deltas,
  });
}

export function logNote(
  state: GameState,
  side: Side | "system",
  kind: EventKind,
  text: string,
  deltas: string[] = [],
): void {
  push(state, { side, kind, text, deltas });
}

/** Structural marker: opens a turn. The UI uses these as segment boundaries
 *  and as the source of the turn banner, so one must be emitted at the top of
 *  every turn on both sides, after the turn counter increments. */
export function logTurn(state: GameState, side: Side): void {
  logNote(state, side, "turn", side === "player" ? "Your turn." : "His turn.");
}

export function logDraw(state: GameState, side: Side, cardId: string): void {
  push(state, {
    side,
    kind: "draw",
    cardId,
    text: side === "player" ? "You draw a card." : "He draws a card.",
    deltas: [],
  });
}

export function logReshuffle(state: GameState, side: Side): void {
  logNote(
    state,
    side,
    "reshuffle",
    side === "player" ? "You shuffle what you have left." : "He shuffles his hand back together.",
  );
}
```

- [ ] **Step 5: Update `src/deck.ts`**

Change `drawCard` only:

```ts
export function drawCard(
  pile: Pile,
  rng: RngState,
  onReshuffle?: () => void,
): string | null {
  if (pile.deck.length === 0) {
    if (pile.discard.length === 0) return null;
    pile.deck = shuffle(rng, pile.discard);
    pile.discard = [];
    onReshuffle?.();
  }
  const card = pile.deck.shift();
  if (card === undefined) return null;
  pile.hand.push(card);
  return card;
}
```

- [ ] **Step 6: Update `src/game.ts`**

Add to the imports from `./log`: `logDraw`, `logReshuffle`, `logTurn`.

Add this helper next to the other private helpers (just above `drawThenDecidePlayerPhase`):

```ts
/** Every draw in the game goes through here so the event stream always shows
 *  the reshuffle that preceded a draw, in that order. */
function draw(state: GameState, side: Side): void {
  const pile = side === "player" ? state.playerPile : state.convictPile;
  const cardId = drawCard(pile, state.rng, () => logReshuffle(state, side));
  if (cardId !== null) logDraw(state, side, cardId);
}
```

Then replace each existing `drawCard(...)` call site:

- In `chooseOpening`, the starting-hand loop becomes:
  ```ts
  for (let i = 0; i < STARTING_HAND; i += 1) {
    draw(state, "player");
    draw(state, "convict");
  }
  ```
  This loop currently runs before `logNote(state, "system", "scene", choice.text)`. Leave that order alone: the scene line stays the last event of the opening.
- In `convictTurn`, `drawCard(state.convictPile, state.rng)` becomes `draw(state, "convict")`.
- In `drawThenDecidePlayerPhase`, `drawCard(state.playerPile, state.rng)` becomes `draw(state, "player")`.
- In `playerPass`, `drawCard(state.playerPile, state.rng)` becomes `draw(state, "player")`.

Add the turn markers:

- In `convictTurn`, immediately after `state.turn += 1;` add `logTurn(state, "convict");`
- In `startPlayerTurn`, immediately after `state.turn += 1;` add `logTurn(state, "player");`

Make the `surrender` kind reachable. `playerSurrender` currently logs the forced
giving-up of a secret as `logCard(state, "player", "answer", secretId, deltas)`.
Change that one call's kind to `"surrender"`, and widen `logCard`'s `kind`
parameter in `src/log.ts` from `"lead" | "answer"` to
`"lead" | "answer" | "surrender"`. Keep it a narrow union rather than the full
`EventKind`, so no caller can log a card event under a kind that carries no card.

The voluntary path stays as it is: answering a coercive lead by handing over a
secret goes through `spendPlayerAnswer` and is logged as an ordinary `answer`
event by `resolveExchange`. That case folds into the report for his exchange,
which is the intended presentation. Only the forced path gets its own kind, and
therefore its own box.

Leave every other line of `game.ts` alone.

- [ ] **Step 7: Fix the type-name references**

`LogEntry` and `LogKind` no longer exist. Update every reference:

Run: `grep -rn "LogEntry\|LogKind" src tests`
Change each to `GameEvent` / `EventKind` respectively. At the time of writing the only references are inside `src/types.ts` and `src/log.ts`, both of which this task already rewrote, so this step should find nothing. If it does, fix it.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/events.test.ts tests/log.test.ts tests/deck.test.ts && npm test`
Expected: PASS.

`tests/log.test.ts` builds a complete `GameState` literal, so `snapshot(state)` works there unchanged. If an engine test now fails because it counted log entries, change it to filter by kind rather than relaxing the assertion, and note it in the commit message.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/log.ts src/deck.ts src/game.ts tests/events.test.ts
git commit -m "feat(hostages): promote the log to a typed event stream with snapshots"
```

---

### Task 3: Modal roles and notice building

The enforcement point. Every event kind declares what it does to the modal, and a segment of events becomes at most one box.

**Files:**
- Create: `src/notices.ts`
- Test: `tests/notices.test.ts`

**Interfaces:**
- Consumes: `EventKind`, `GameEvent` from `src/types.ts`; `VitalsChange`, `lines` from `src/vitals.ts`; `cardById`, `cardNameInProse` from `src/content/cards.ts`.
- Produces:
  - `type ModalRole = { role: "headline" } | { role: "detail" } | { role: "silent"; reason: string }`
  - `const MODAL_ROLES: Record<EventKind, ModalRole>`
  - `interface Notice { title: string; what: string; flavor: string; rows: string[] }`
  - `buildNotice(segment: GameEvent[], changes: VitalsChange[]): Notice | null`

- [ ] **Step 1: Write the failing test**

Create `tests/notices.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MODAL_ROLES, buildNotice } from "../src/notices";
import type { EventKind, GameEvent } from "../src/types";
import { snapshot, diff } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

const ALL_KINDS: EventKind[] = [
  "scene", "turn", "lead", "answer", "decline", "effect", "coercion",
  "surrender", "recover", "haulUp", "pass", "discard", "draw",
  "reshuffle", "outcome",
];

function evt(kind: EventKind, over: Partial<GameEvent> = {}): GameEvent {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return {
    turn: 1,
    side: "convict",
    kind,
    text: "",
    deltas: [],
    vitals: snapshot(state),
    piles: { player: { deck: 0, discard: 0, hand: [] }, convict: { deck: 0, discard: 0, hand: 0 } },
    ...over,
  };
}

describe("MODAL_ROLES", () => {
  it("assigns a role to every event kind and nothing else", () => {
    expect(Object.keys(MODAL_ROLES).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("gives every silent kind a written reason", () => {
    for (const [kind, rule] of Object.entries(MODAL_ROLES)) {
      if (rule.role !== "silent") continue;
      expect(rule.reason.length, `${kind} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("keeps routine bookkeeping silent", () => {
    for (const kind of ["draw", "reshuffle", "discard", "pass", "turn", "scene", "outcome"] as const) {
      expect(MODAL_ROLES[kind].role).toBe("silent");
    }
  });

  it("headlines the two things that can open a box", () => {
    expect(MODAL_ROLES.lead.role).toBe("headline");
    expect(MODAL_ROLES.surrender.role).toBe("headline");
  });
});

describe("buildNotice", () => {
  it("returns null when the segment has no headline", () => {
    expect(buildNotice([evt("turn"), evt("draw"), evt("pass")], [])).toBeNull();
  });

  it("returns null for an empty segment", () => {
    expect(buildNotice([], [])).toBeNull();
  });

  it("titles the box with the headline card and names what he played", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "knifeToHerThroat" }),
      evt("decline", { side: "player", text: "You take it." }),
    ];
    const notice = buildNotice(segment, []);
    expect(notice?.title).toBe("Hold It to Her Throat");
    expect(notice?.what).toContain("He plays");
    expect(notice?.what).toContain("You had no answer for it.");
  });

  it("names the card you answered with", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "knifeToHerThroat" }),
      evt("answer", { side: "player", cardId: "takeItForHer" }),
    ];
    expect(buildNotice(segment, [])?.what).toContain("Take It for Her");
  });

  it("carries the headline card's flavor line", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    expect(buildNotice(segment, [])?.flavor.length).toBeGreaterThan(0);
  });

  it("renders the vitals changes as rows", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    const notice = buildNotice(segment, [
      { field: "playerVigor", from: 6, to: 4 },
      { field: "range", from: "away", to: "near" },
    ]);
    expect(notice?.rows).toEqual(["Your vigor 6 -> 4", "He is close"]);
  });

  it("says so plainly when the exchange changed nothing", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "backhand" })];
    const notice = buildNotice(segment, []);
    expect(notice?.rows).toEqual([]);
    expect(notice?.what).toContain("Nothing came of it.");
  });

  it("folds coercion detail into the what line", () => {
    const segment = [
      evt("turn"),
      evt("lead", { cardId: "whereIsIt" }),
      evt("coercion", { text: "He got what he wanted. He does not need to ask again." }),
    ];
    expect(buildNotice(segment, [])?.what).toContain("He got what he wanted.");
  });

  it("builds a surrender box headlined by the secret", () => {
    const segment = [evt("surrender", { side: "player", cardId: "secretSafe" })];
    const notice = buildNotice(segment, [{ field: "secretsLeft", from: 3, to: 2 }]);
    expect(notice?.title).toBe("You Give Him Something");
    expect(notice?.what).toContain("The safe is behind the headboard");
    expect(notice?.rows).toEqual(["Secrets left 3 -> 2"]);
  });

  it("uses the first headline when a segment somehow holds two", () => {
    const segment = [evt("lead", { cardId: "backhand" }), evt("lead", { cardId: "whereIsIt" })];
    expect(buildNotice(segment, [])?.title).toBe("Backhand");
  });

  it("produces copy free of em dashes and unicode arrows", () => {
    const segment = [evt("turn"), evt("lead", { cardId: "knifeToHerThroat" })];
    const n = buildNotice(segment, [{ field: "wifeVigor", from: 4, to: 2 }]);
    const all = [n?.title, n?.what, n?.flavor, ...(n?.rows ?? [])].join(" ");
    expect(all).not.toMatch(/[—→←…•]/);
  });
});
```

Note on the two expected card names: run `grep -n 'name:' src/content/cards-convict.ts` and `grep -n 'name:' src/content/cards-player.ts` and use the real `name` strings for `knifeToHerThroat`, `backhand` and `takeItForHer` in the assertions above. Do not change the card content to match the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notices.test.ts`
Expected: FAIL with "Failed to resolve import ../src/notices".

- [ ] **Step 3: Write the implementation**

Create `src/notices.ts`:

```ts
import { cardById, cardNameInProse } from "./content/cards";
import { lines } from "./vitals";
import type { VitalsChange } from "./vitals";
import type { EventKind, GameEvent } from "./types";

/**
 * What an event does to the interrupting modal.
 *
 * `headline` names the box. `detail` folds into whichever box is open.
 * `silent` never surfaces in one, and must say why in writing.
 *
 * The role belongs to the kind, not to who acted: a `lead` is a headline
 * whether you or he played it. Your own leads never reach a box because the
 * beat driver never opens a segment on your turn, not because the role
 * differs.
 */
export type ModalRole =
  | { role: "headline" }
  | { role: "detail" }
  | { role: "silent"; reason: string };

/** Exhaustive by construction: adding an EventKind is a compile error until
 *  someone decides whether it interrupts the player. */
export const MODAL_ROLES: Record<EventKind, ModalRole> = {
  lead: { role: "headline" },
  surrender: { role: "headline" },

  answer: { role: "detail" },
  decline: { role: "detail" },
  effect: { role: "detail" },
  coercion: { role: "detail" },
  recover: { role: "detail" },
  haulUp: { role: "detail" },

  draw: { role: "silent", reason: "routine; the deck pile animates it" },
  reshuffle: { role: "silent", reason: "routine; the pile pulses" },
  discard: { role: "silent", reason: "routine; visible in the log" },
  pass: { role: "silent", reason: "nothing happened; the banner says whose turn it is" },
  turn: { role: "silent", reason: "structural marker, not an occurrence" },
  scene: { role: "silent", reason: "the opening event has its own screen" },
  outcome: { role: "silent", reason: "the ending screen covers it" },
};

export interface Notice {
  title: string;
  what: string;
  flavor: string;
  rows: string[];
}

const SURRENDER_TITLE = "You Give Him Something";

function sentences(segment: GameEvent[], head: GameEvent): string[] {
  const out: string[] = [];

  if (head.kind === "surrender" && head.cardId !== undefined) {
    out.push(`You give up ${cardNameInProse(cardById(head.cardId).name)}.`);
  } else if (head.cardId !== undefined) {
    out.push(`He plays ${cardNameInProse(cardById(head.cardId).name)}.`);
    const answer = segment.find((e) => e.kind === "answer" && e.side === "player");
    const declined = segment.some((e) => e.kind === "decline");
    if (answer?.cardId !== undefined) {
      out.push(`You answered with ${cardNameInProse(cardById(answer.cardId).name)}.`);
    } else if (declined) {
      out.push("You had no answer for it.");
    }
  }

  for (const e of segment) {
    if (e.kind === "coercion" || e.kind === "recover" || e.kind === "haulUp") {
      if (e.text.length > 0) out.push(e.text);
    }
  }
  return out;
}

/**
 * Assembles at most one box from a segment of events plus the vitals that
 * moved across it. Returns null when the segment holds no headline, which is
 * how a turn where he only paced produces no interruption.
 */
export function buildNotice(segment: GameEvent[], changes: VitalsChange[]): Notice | null {
  const head = segment.find((e) => MODAL_ROLES[e.kind].role === "headline");
  if (head === undefined || head.cardId === undefined) return null;

  const card = cardById(head.cardId);
  const rows = lines(changes);
  const parts = sentences(segment, head);
  if (rows.length === 0 && parts.length <= 1) parts.push("Nothing came of it.");

  return {
    title: head.kind === "surrender" ? SURRENDER_TITLE : card.name,
    what: parts.join(" "),
    flavor: card.flavor,
    rows,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/notices.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notices.ts tests/notices.test.ts
git commit -m "feat(hostages): exhaustive modal roles and notice building"
```

---

### Task 4: Derived card text

The card face needs a short rules line, and the hover panel needs the requirement in prose. Both are derived from the card data so they cannot go stale.

**Files:**
- Create: `src/content/card-text.ts`
- Test: `tests/card-text.test.ts`

**Interfaces:**
- Consumes: `CardDef`, `Effect`, `CardRequirement` from `src/types.ts`.
- Produces:
  - `summarize(card: CardDef): string` - the compressed face line, e.g. `-3 vig, off-balance`
  - `requirementText(req: CardRequirement): string` - prose, e.g. `Needs: he is near, he is distracted or off-balance.` Returns `""` when there are no requirements.

- [ ] **Step 1: Write the failing test**

Create `tests/card-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarize, requirementText } from "../src/content/card-text";
import { cardById, ALL_CARDS } from "../src/content/cards";

describe("summarize", () => {
  it("compresses damage by target", () => {
    expect(summarize(cardById("kickHisKnee"))).toContain("-3 his vig");
  });

  it("names the state a card sets", () => {
    expect(summarize(cardById("kickHisKnee"))).toContain("off-balance");
  });

  it("describes a card that only frees you", () => {
    expect(summarize(cardById("wiggleOut"))).toBe("hands free");
  });

  it("describes a card that only topples you", () => {
    expect(summarize(cardById("rockTheChair"))).toBe("you fall");
  });

  it("returns a non-empty line for every card in the game", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card).length, `${card.id} has no summary`).toBeGreaterThan(0);
    }
  });

  it("stays short enough for a card face", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card).length, `${card.id} summary too long`).toBeLessThanOrEqual(46);
    }
  });

  it("uses no em dashes or unicode", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card)).not.toMatch(/[—→←…•]/);
    }
  });
});

describe("requirementText", () => {
  it("is empty when a card has no requirements", () => {
    expect(requirementText({})).toBe("");
  });

  it("phrases a single requirement", () => {
    expect(requirementText({ bound: true })).toBe("Needs: you are bound.");
  });

  it("joins several requirements with commas", () => {
    const text = requirementText({ range: "near", convictDistractedOrOffBalance: true });
    expect(text).toBe("Needs: he is near, he is distracted or off-balance.");
  });

  it("covers every requirement key used by the real cards", () => {
    for (const card of ALL_CARDS) {
      const keys = Object.keys(card.requires);
      if (keys.length === 0) continue;
      expect(requirementText(card.requires).length, `${card.id}`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-text.test.ts`
Expected: FAIL with "Failed to resolve import ../src/content/card-text".

- [ ] **Step 3: Write the implementation**

Create `src/content/card-text.ts`:

```ts
import type { CardDef, CardRequirement, Effect } from "../types";

function effectPhrase(effect: Effect): string | null {
  switch (effect.kind) {
    case "damage": {
      const who = effect.target === "convict" ? "his" : effect.target === "player" ? "your" : "her";
      return `-${effect.amount} ${who} vig`;
    }
    case "willpower": {
      const who = effect.target === "convict" ? "his" : "your";
      const sign = effect.amount > 0 ? "+" : "";
      return `${sign}${effect.amount} ${who} will`;
    }
    case "restoreWillpowerTo":
      return `will back to ${effect.value}`;
    case "setBound":
      return effect.value ? "you are bound" : "hands free";
    case "setToppled":
      return effect.value ? "you fall" : "you stand";
    case "setDistracted":
      return `distract ${effect.turns}`;
    case "setOffBalance":
      return effect.value ? "off-balance" : null;
    case "setWeaponDown":
      return effect.value ? "knife down" : "he rearms";
    case "setRange":
      return effect.value === "near" ? "he closes" : "he backs off";
    case "setZone":
      return effect.value === "bedroom" ? "to the bedroom" : "to the living room";
    case "bindOrHurt":
      return "rebind or hurt";
    case "reviveConvict":
      return `he is up at ${effect.vigor}`;
    case "negateLead":
      return "cancel it";
    case "halveIncomingDamage":
      return "halve the hit";
    case "interposeForWife":
      return `take it for her (-${effect.selfDamage} your vig)`;
    case "stripCoercion":
      return "no answer owed";
  }
}

/** The compressed line printed on a card face. Derived from the effects so a
 *  balance change cannot leave stale prose behind. */
export function summarize(card: CardDef): string {
  const phrases = card.effects.map(effectPhrase).filter((p): p is string => p !== null);
  if (phrases.length === 0) return "hold on";
  return phrases.join(", ");
}

function requirementPhrases(req: CardRequirement): string[] {
  const out: string[] = [];
  if (req.bound !== undefined) out.push(req.bound ? "you are bound" : "you are not bound");
  if (req.toppled !== undefined) out.push(req.toppled ? "you are on the floor" : "you are upright");
  if (req.range !== undefined) out.push(req.range === "near" ? "he is near" : "he is away");
  if (req.zone !== undefined) {
    out.push(req.zone === "bedroom" ? "you are in the bedroom" : "you are in the living room");
  }
  if (req.convictDistracted !== undefined) {
    out.push(req.convictDistracted ? "he is distracted" : "he is not distracted");
  }
  if (req.convictOffBalance !== undefined) {
    out.push(req.convictOffBalance ? "he is off-balance" : "he is steady");
  }
  if (req.convictWeaponDown !== undefined) {
    out.push(req.convictWeaponDown ? "his knife is down" : "he is armed");
  }
  if (req.convictIncapacitated !== undefined) {
    out.push(req.convictIncapacitated ? "he is down" : "he is on his feet");
  }
  if (req.convictDistractedOrOffBalance) out.push("he is distracted or off-balance");
  if (req.coercionDefused !== undefined) out.push("you have defused a demand");
  if (req.answersCardId !== undefined) out.push("it answers one particular card");
  if (req.answersTag === "deception") out.push("he is answering a bluff");
  else if (req.answersTag !== undefined) out.push("he is threatening her");
  if (req.answersCoercion) out.push("he is making a demand");
  if (req.answersDamageToOwner) out.push("it would hurt you");
  if (req.answersDamageToConvictAtLeast !== undefined) out.push("it would hurt him");
  return out;
}

/** Prose for the hover panel. Empty string when a card is unconditional. */
export function requirementText(req: CardRequirement): string {
  const phrases = requirementPhrases(req);
  if (phrases.length === 0) return "";
  return `Needs: ${phrases.join(", ")}.`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/card-text.test.ts`
Expected: PASS. If the 46-character face-line cap fails for a specific card, shorten that card's phrases in `effectPhrase` (never the card content), then re-run.

- [ ] **Step 5: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/card-text.ts tests/card-text.test.ts
git commit -m "feat(hostages): derive card face and requirement text from card data"
```

---

### Task 5: The flight primitive

Ported from `02-balticmap/src/animate.ts`, unchanged in approach.

**Files:**
- Create: `src/ui/animate.ts`
- Test: `tests/animate.test.ts`

**Interfaces:**
- Produces:
  - `interface Point { x: number; y: number }`
  - `interface FlightStage { to: Point; scale: number; durationMs: number; holdMs?: number }`
  - `flyCard(container, className, label, from, stages, onDone?): HTMLElement`
  - `centerOf(rect: DOMRect): Point`

- [ ] **Step 1: Write the failing test**

Create `tests/animate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flyCard, centerOf } from "../src/ui/animate";

let container: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<div id='app'></div>";
  container = document.querySelector<HTMLElement>("#app") as HTMLElement;
});

afterEach(() => {
  vi.useRealTimers();
});

const from = { x: 10, y: 20, width: 60, height: 90 };

describe("flyCard", () => {
  it("appends a card immediately and positions it at the origin", () => {
    flyCard(container, "back", "", from, [{ to: { x: 200, y: 200 }, scale: 1, durationMs: 100 }]);
    const card = container.querySelector<HTMLElement>(".flying-card");
    expect(card).not.toBeNull();
    expect(card?.style.left).toBe("10px");
    expect(card?.style.top).toBe("20px");
    expect(card?.className).toContain("back");
  });

  it("applies each stage transform in order", () => {
    flyCard(container, "", "Backhand", from, [
      { to: { x: 100, y: 100 }, scale: 1.5, durationMs: 100 },
      { to: { x: 300, y: 300 }, scale: 0.6, durationMs: 200 },
    ]);
    const card = container.querySelector<HTMLElement>(".flying-card") as HTMLElement;
    vi.advanceTimersByTime(30);
    expect(card.style.transform).toContain("scale(1.5)");
    vi.advanceTimersByTime(120);
    expect(card.style.transform).toContain("scale(0.6)");
  });

  it("removes the element and calls onDone after the last stage", () => {
    const done = vi.fn();
    flyCard(container, "", "x", from, [{ to: { x: 50, y: 50 }, scale: 1, durationMs: 100 }], done);
    expect(container.querySelector(".flying-card")).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(container.querySelector(".flying-card")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("still cleans up and reports done when there are no stages", () => {
    const done = vi.fn();
    flyCard(container, "", "x", from, [], done);
    vi.advanceTimersByTime(1000);
    expect(container.querySelector(".flying-card")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("honours the hold between stages", () => {
    flyCard(container, "", "x", from, [
      { to: { x: 100, y: 100 }, scale: 1, durationMs: 100, holdMs: 500 },
      { to: { x: 200, y: 200 }, scale: 1, durationMs: 100 },
    ]);
    vi.advanceTimersByTime(300);
    expect(container.querySelector(".flying-card")).not.toBeNull();
    vi.advanceTimersByTime(500);
    expect(container.querySelector(".flying-card")).toBeNull();
  });

  it("labels the card so a player can read what flew", () => {
    flyCard(container, "", "Backhand", from, []);
    expect(container.querySelector(".flying-card")?.textContent).toBe("Backhand");
  });
});

describe("centerOf", () => {
  it("returns the middle of a rect", () => {
    expect(centerOf({ x: 10, y: 20, width: 100, height: 40 } as DOMRect)).toEqual({
      x: 60,
      y: 40,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/animate.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/animate".

- [ ] **Step 3: Write the implementation**

Create `src/ui/animate.ts`:

```ts
export interface Point {
  x: number;
  y: number;
}

export interface FlightStage {
  to: Point; // where the card's center ends up
  scale: number;
  durationMs: number;
  holdMs?: number; // pause after arriving, before the next stage
}

export const centerOf = (r: DOMRect): Point => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

/** Spawns a fixed-position card element and flies it through the given stages
 *  with CSS transforms, then removes it. Timing is driven by setTimeout, not
 *  transitionend: happy-dom never fires transition events, and a dropped
 *  event must not leak the element. */
export function flyCard(
  container: HTMLElement,
  className: string,
  label: string,
  from: { x: number; y: number; width: number; height: number },
  stages: FlightStage[],
  onDone?: () => void,
): HTMLElement {
  const el = document.createElement("div");
  el.className = className ? `flying-card ${className}` : "flying-card";
  el.textContent = label;
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  container.appendChild(el);

  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let delay = 20; // let the initial styles land before the first transition
  for (const s of stages) {
    setTimeout(() => {
      el.style.transitionDuration = `${s.durationMs}ms`;
      el.style.transform = `translate(${s.to.x - cx}px, ${s.to.y - cy}px) scale(${s.scale})`;
    }, delay);
    delay += s.durationMs + (s.holdMs ?? 0);
  }
  setTimeout(() => {
    el.remove();
    onDone?.();
  }, delay);
  return el;
}
```

- [ ] **Step 4: Add the stylesheet block**

Append to `src/style.css`:

```css
/* --- flying cards ------------------------------------------------------ */

.flying-card {
  position: fixed;
  z-index: 30;
  pointer-events: none;
  border: 1px solid var(--edge);
  border-radius: 3px;
  background: var(--panel);
  color: var(--ink);
  font-size: 0.7rem;
  padding: 0.35rem 0.25rem;
  text-align: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  transition-property: transform;
  transition-timing-function: ease;
}

.flying-card.back {
  color: transparent;
  background:
    repeating-linear-gradient(45deg, rgba(216, 212, 204, 0.08) 0 3px, transparent 3px 6px),
    var(--panel);
}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run tests/animate.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/animate.ts src/style.css tests/animate.test.ts
git commit -m "feat(hostages): card flight primitive"
```

---

### Task 6: The beat driver

The sequencer. It owns segment tracking and the modal trigger, and it is fully testable without any DOM because the visuals are injected as hooks.

**Files:**
- Create: `src/ui/beats.ts`
- Test: `tests/beats.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `EventKind` from `src/types.ts`; `diff` from `src/vitals.ts`; `buildNotice`, `Notice` from `src/notices.ts`.
- Produces:
  - `const BEAT_MS: Record<EventKind, number>`
  - `interface BeatHooks { play(event: GameEvent): void; notice(notice: Notice, done: () => void): void; settled(): void }`
  - `interface BeatDriver { run(state: GameState): void; reset(): void; isBusy(): boolean }`
  - `createBeats(hooks: BeatHooks): BeatDriver`

**Segment rules** (implement exactly this):
- a `turn` event with `side === "convict"` flushes any open segment, then opens a new one containing itself
- a `turn` event with `side === "player"` flushes the open segment (using its own vitals as the closing snapshot), then leaves none open
- a `surrender` event flushes the open segment, then opens a new one containing itself
- an `outcome` event discards the open segment without flushing (the ending screen speaks instead)
- any other event is appended to the open segment if one is open, and ignored otherwise
- flushing means: `buildNotice(segment, diff(segment[0].vitals, closing.vitals))`, and if non-null, pause the queue and hand it to `hooks.notice`

- [ ] **Step 1: Write the failing test**

Create `tests/beats.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBeats, BEAT_MS } from "../src/ui/beats";
import type { BeatHooks } from "../src/ui/beats";
import type { EventKind, GameEvent, GameState } from "../src/types";
import { newRun, chooseOpening, playerLead, playerPass } from "../src/game";
import type { Notice } from "../src/notices";

const ALL_KINDS: EventKind[] = [
  "scene", "turn", "lead", "answer", "decline", "effect", "coercion",
  "surrender", "recover", "haulUp", "pass", "discard", "draw",
  "reshuffle", "outcome",
];

function recorder() {
  const played: GameEvent[] = [];
  const notices: Notice[] = [];
  let resume: (() => void) | null = null;
  let settled = 0;
  const hooks: BeatHooks = {
    play: (e) => played.push(e),
    notice: (n, done) => {
      notices.push(n);
      resume = done;
    },
    settled: () => {
      settled += 1;
    },
  };
  return {
    hooks,
    played,
    notices,
    settledCount: () => settled,
    dismiss: () => {
      const r = resume;
      resume = null;
      r?.();
    },
    pending: () => resume !== null,
  };
}

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BEAT_MS", () => {
  it("gives every event kind a duration", () => {
    expect(Object.keys(BEAT_MS).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("keeps a full convict exchange under 1500ms", () => {
    const chain = BEAT_MS.turn + BEAT_MS.draw + BEAT_MS.lead + BEAT_MS.answer + BEAT_MS.effect;
    expect(chain).toBeLessThanOrEqual(1500);
  });
});

describe("beat driver", () => {
  it("plays every fresh event once, in order", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.map((e) => e.kind)).toEqual(state.log.map((e) => e.kind));
  });

  it("only plays events appended since the last run", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const first = r.played.length;
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBe(state.log.length);
    expect(r.played.length).toBeGreaterThan(first);
  });

  it("is busy until the chain drains, then settles exactly once", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    expect(beats.isBusy()).toBe(true);
    expect(r.settledCount()).toBe(0);
    vi.advanceTimersByTime(10000);
    expect(beats.isBusy()).toBe(false);
    expect(r.settledCount()).toBe(1);
  });

  it("settles even when there is nothing fresh to play", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.settledCount()).toBe(2);
  });

  it("shows no notice for the player's own turn", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = [];
    playerLead(state, "stallHim");
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(0);
  });

  it("holds the chain open until the notice is dismissed, then settles", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);

    // Hand-built segment: his turn, his lead, your decline, the effect,
    // then your turn marker which closes it.
    const base = state.log[state.log.length - 1];
    const push = (kind: EventKind, over: Partial<GameEvent> = {}) => {
      state.log.push({ ...base, kind, deltas: [], text: "", ...over });
    };
    push("turn", { side: "convict" });
    push("lead", { side: "convict", cardId: "backhand" });
    push("decline", { side: "player", text: "You take it." });
    push("turn", {
      side: "player",
      vitals: { ...base.vitals, playerVigor: base.vitals.playerVigor - 2 },
    });

    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].rows).toContain(
      `Your vigor ${base.vitals.playerVigor} -> ${base.vitals.playerVigor - 2}`,
    );
    expect(beats.isBusy()).toBe(true);
    expect(r.settledCount()).toBe(1); // the initial deal only

    r.dismiss();
    vi.advanceTimersByTime(10000);
    expect(beats.isBusy()).toBe(false);
    expect(r.settledCount()).toBe(2);
  });

  it("drops the open segment when the run ends", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const base = state.log[state.log.length - 1];
    state.log.push({ ...base, kind: "turn", side: "convict", text: "", deltas: [] });
    state.log.push({ ...base, kind: "lead", side: "convict", cardId: "backhand", text: "", deltas: [] });
    state.log.push({ ...base, kind: "outcome", side: "system", text: "", deltas: [] });
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.notices).toHaveLength(0);
  });

  it("forgets everything on reset so a new run replays from the start", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const first = r.played.length;
    beats.reset();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBe(first * 2);
  });

  it("replays from the start when the log shrinks under it", () => {
    const r = recorder();
    const beats = createBeats(r.hooks);
    const state = started();
    beats.run(state);
    vi.advanceTimersByTime(10000);
    const fresh = started();
    beats.run(fresh);
    vi.advanceTimersByTime(10000);
    expect(r.played.length).toBeGreaterThan(fresh.log.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/beats.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/beats".

- [ ] **Step 3: Write the implementation**

Create `src/ui/beats.ts`:

```ts
import { buildNotice } from "../notices";
import type { Notice } from "../notices";
import { diff } from "../vitals";
import type { EventKind, GameEvent, GameState } from "../types";

/** How long the table dwells on each kind of event. The full chain between
 *  your click and your next input stays around 1.3s, which is short enough
 *  that no skip control is warranted. Tune here, nowhere else. */
export const BEAT_MS: Record<EventKind, number> = {
  scene: 0,
  turn: 120,
  lead: 250,
  answer: 200,
  decline: 120,
  effect: 200,
  coercion: 150,
  surrender: 300,
  recover: 200,
  haulUp: 200,
  pass: 200,
  discard: 180,
  draw: 180,
  reshuffle: 200,
  outcome: 0,
};

export interface BeatHooks {
  /** Perform the visual for one event. Called once per event, in order. */
  play(event: GameEvent): void;
  /** Open the modal. The driver stays busy until `done` is called. */
  notice(notice: Notice, done: () => void): void;
  /** The chain has drained: unlock input and draw final state. */
  settled(): void;
}

export interface BeatDriver {
  run(state: GameState): void;
  reset(): void;
  isBusy(): boolean;
}

export function createBeats(hooks: BeatHooks): BeatDriver {
  let rendered = 0;
  let busy = false;
  let queue: GameEvent[] = [];
  let segment: GameEvent[] | null = null;

  /** Closes the open segment against `closing` and returns the notice, if
   *  any. Always leaves the segment closed. */
  function flush(closing: GameEvent): Notice | null {
    const open = segment;
    segment = null;
    if (open === null || open.length === 0) return null;
    return buildNotice(open, diff(open[0].vitals, closing.vitals));
  }

  /** Applies the segment rules to one event and returns a notice to show
   *  before continuing, if that event closed a segment worth reporting. */
  function track(event: GameEvent): Notice | null {
    if (event.kind === "outcome") {
      segment = null;
      return null;
    }
    if (event.kind === "turn") {
      const notice = flush(event);
      if (event.side === "convict") segment = [event];
      return notice;
    }
    if (event.kind === "surrender") {
      const notice = flush(event);
      segment = [event];
      return notice;
    }
    segment?.push(event);
    return null;
  }

  function step(): void {
    const event = queue.shift();
    if (event === undefined) {
      busy = false;
      hooks.settled();
      return;
    }
    hooks.play(event);
    const notice = track(event);
    const wait = BEAT_MS[event.kind];
    if (notice !== null) {
      setTimeout(() => hooks.notice(notice, step), wait);
      return;
    }
    setTimeout(step, wait);
  }

  return {
    run(state: GameState): void {
      // A shorter log than we have rendered means a fresh run replaced the
      // old one under us; start over rather than slicing past the end.
      if (state.log.length < rendered) {
        rendered = 0;
        segment = null;
      }
      queue = state.log.slice(rendered);
      rendered = state.log.length;
      busy = true;
      step();
    },
    reset(): void {
      rendered = 0;
      queue = [];
      segment = null;
      busy = false;
    },
    isBusy: () => busy,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/beats.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/beats.ts tests/beats.test.ts
git commit -m "feat(hostages): beat driver with segment tracking and modal trigger"
```

---

### Task 7: Stat plates

The three actor panels plus the scene and condition flags, rendered from a `Vitals` snapshot so they step through intermediate values during a beat chain and pop when a number moves.

**Files:**
- Create: `src/ui/plates.ts`
- Modify: `src/style.css`
- Test: `tests/plates.test.ts`

**Interfaces:**
- Consumes: `Vitals` from `src/vitals.ts`.
- Produces:
  - `interface Plate { root: HTMLElement; update(v: Vitals): void }`
  - `createPlate(who: "convict" | "player" | "wife"): Plate`
  - `const POP_MS: number`

**DOM contract** (tests and later tasks depend on these attributes):
- root: `<div class="plate" data-plate="convict">`
- name: `<span class="plate-name">HIM</span>` / `YOU` / `HER`
- stats: `<span class="plate-stat" data-stat="convict-will">WILL 6</span>`, ids `convict-will`, `convict-vigor`, `player-will`, `player-vigor`, `wife-vigor`
- a changed stat gains class `pop` for `POP_MS` ms
- conditions: `<span class="plate-line" data-line="convict">` / `data-line="player"`, text only

- [ ] **Step 1: Write the failing test**

Create `tests/plates.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPlate, POP_MS } from "../src/ui/plates";
import { snapshot } from "../src/vitals";
import type { Vitals } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

function vitals(over: Partial<Vitals> = {}): Vitals {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return { ...snapshot(state), ...over };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("plate", () => {
  it("labels each side", () => {
    expect(createPlate("convict").root.querySelector(".plate-name")?.textContent).toBe("HIM");
    expect(createPlate("player").root.querySelector(".plate-name")?.textContent).toBe("YOU");
    expect(createPlate("wife").root.querySelector(".plate-name")?.textContent).toBe("HER");
  });

  it("renders his willpower and vigor", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ convictWill: 6, convictVigor: 3 }));
    expect(plate.root.querySelector("[data-stat='convict-will']")?.textContent).toBe("WILL 6");
    expect(plate.root.querySelector("[data-stat='convict-vigor']")?.textContent).toBe("VIG 3");
  });

  it("gives the wife a vigor only, since she has no willpower", () => {
    const plate = createPlate("wife");
    plate.update(vitals({ wifeVigor: 4 }));
    expect(plate.root.querySelector("[data-stat='wife-vigor']")?.textContent).toBe("VIG 4");
    expect(plate.root.querySelector("[data-stat='wife-will']")).toBeNull();
  });

  it("pops a stat that changed and clears the pop after POP_MS", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 6 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
    plate.update(vitals({ playerVigor: 4 }));
    expect(stat.classList.contains("pop")).toBe(true);
    vi.advanceTimersByTime(POP_MS + 10);
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("does not pop a stat that held still", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 6 }));
    plate.update(vitals({ playerVigor: 6 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("does not pop on the very first update", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 4 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("writes his range, weapon and conditions on one line", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ range: "near", weaponDown: false, offBalance: true, distracted: 2 }));
    const line = plate.root.querySelector("[data-line='convict']")?.textContent ?? "";
    expect(line).toContain("near");
    expect(line).toContain("knife up");
    expect(line).toContain("off-balance");
    expect(line).toContain("distracted (2)");
  });

  it("says he is down when incapacitated", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ incapacitated: true }));
    expect(plate.root.querySelector("[data-line='convict']")?.textContent).toContain("down");
  });

  it("writes your room and your conditions on one line", () => {
    const plate = createPlate("player");
    plate.update(vitals({ zone: "bedroom", bound: true, toppled: true }));
    const line = plate.root.querySelector("[data-line='player']")?.textContent ?? "";
    expect(line).toContain("bedroom");
    expect(line).toContain("bound");
    expect(line).toContain("on the floor");
  });

  it("marks a plate as spent when its vigor hits zero", () => {
    const plate = createPlate("wife");
    plate.update(vitals({ wifeVigor: 0 }));
    expect(plate.root.classList.contains("spent")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plates.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/plates".

- [ ] **Step 3: Write the implementation**

Create `src/ui/plates.ts`:

```ts
import { el } from "./render";
import type { Vitals } from "../vitals";

export const POP_MS = 220;

export type Who = "convict" | "player" | "wife";

export interface Plate {
  root: HTMLElement;
  update(v: Vitals): void;
}

const NAME: Record<Who, string> = { convict: "HIM", player: "YOU", wife: "HER" };

function convictLine(v: Vitals): string {
  const parts: string[] = [v.range === "near" ? "near" : "away"];
  parts.push(v.weaponDown ? "knife down" : "knife up");
  if (v.incapacitated) parts.push("down");
  if (v.offBalance) parts.push("off-balance");
  if (v.distracted > 0) parts.push(`distracted (${v.distracted})`);
  return parts.join(" / ");
}

function playerLine(v: Vitals): string {
  const parts: string[] = [v.zone === "bedroom" ? "bedroom" : "living room"];
  if (v.bound) parts.push("bound");
  if (v.toppled) parts.push("on the floor");
  return parts.join(" / ");
}

export function createPlate(who: Who): Plate {
  const root = el("div", "plate");
  root.dataset.plate = who;
  root.append(el("span", "plate-name", NAME[who]));

  const stats = el("div", "plate-stats");
  const nodes = new Map<string, HTMLElement>();
  const add = (key: string, label: string): void => {
    const node = el("span", "plate-stat");
    node.dataset.stat = key;
    node.textContent = `${label} 0`;
    nodes.set(key, node);
    stats.append(node);
  };
  if (who !== "wife") add(`${who}-will`, "WILL");
  add(who === "wife" ? "wife-vigor" : `${who}-vigor`, "VIG");
  root.append(stats);

  const line = el("div", "plate-line");
  if (who !== "wife") {
    line.dataset.line = who;
    root.append(line);
  }

  // Held so a stat only pops on an actual change, and never on first paint.
  const last = new Map<string, number>();
  let painted = false;

  function setStat(key: string, label: string, value: number): void {
    const node = nodes.get(key);
    if (node === undefined) return;
    node.textContent = `${label} ${value}`;
    if (painted && last.get(key) !== value) {
      node.classList.add("pop");
      setTimeout(() => node.classList.remove("pop"), POP_MS);
    }
    last.set(key, value);
  }

  function update(v: Vitals): void {
    if (who === "convict") {
      setStat("convict-will", "WILL", v.convictWill);
      setStat("convict-vigor", "VIG", v.convictVigor);
      line.textContent = convictLine(v);
      root.classList.toggle("spent", v.convictVigor <= 0);
    } else if (who === "player") {
      setStat("player-will", "WILL", v.playerWill);
      setStat("player-vigor", "VIG", v.playerVigor);
      line.textContent = playerLine(v);
      root.classList.toggle("spent", v.playerVigor <= 0);
    } else {
      setStat("wife-vigor", "VIG", v.wifeVigor);
      root.classList.toggle("spent", v.wifeVigor <= 0);
    }
    painted = true;
  }

  return { root, update };
}
```

- [ ] **Step 4: Add the stylesheet block**

Append to `src/style.css`:

```css
/* --- stat plates ------------------------------------------------------- */

.plate {
  border: 1px solid var(--edge);
  background: var(--panel);
  padding: 0.4rem 0.6rem;
  min-width: 8rem;
}

.plate.spent { border-color: var(--warn); opacity: 0.7; }

.plate-name {
  display: block;
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: var(--dim);
}

.plate-stats { display: flex; gap: 0.6rem; }

.plate-stat {
  font-size: 0.95rem;
  transition: color 120ms ease;
}

.plate-stat.pop {
  color: var(--warn);
  animation: stat-pop 220ms ease;
}

@keyframes stat-pop {
  50% { transform: scale(1.35); }
}

.plate-line {
  font-size: 0.7rem;
  color: var(--dim);
  margin-top: 0.15rem;
  min-height: 1em;
}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run tests/plates.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/plates.ts src/style.css tests/plates.test.ts
git commit -m "feat(hostages): stat plates rendered from vitals snapshots"
```

---

### Task 8: Deck and discard piles

**Files:**
- Create: `src/ui/piles.ts`
- Modify: `src/style.css`
- Test: `tests/piles.test.ts`

**Interfaces:**
- Produces:
  - `interface Pile { root: HTMLElement; update(count: number): void; pulse(): void }`
  - `createPile(key: string, label: string): Pile` where `key` is one of `player-deck`, `player-discard`, `convict-deck`, `convict-discard`
  - `pileLayers(count: number): number`
  - `const PULSE_MS: number`

**DOM contract:** `<div class="pile" data-pile="player-deck">` containing `.pile-stack` (holding `pileLayers(n)` `.card-back` children), `.pile-count` and `.pile-label`. Empty stacks gain class `empty` on `.pile-stack`.

- [ ] **Step 1: Write the failing test**

Create `tests/piles.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPile, pileLayers, PULSE_MS } from "../src/ui/piles";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pileLayers", () => {
  it("shows nothing for an empty pile", () => {
    expect(pileLayers(0)).toBe(0);
  });

  it("thickens with the pile and caps out", () => {
    expect(pileLayers(1)).toBe(1);
    expect(pileLayers(5)).toBe(2);
    expect(pileLayers(10)).toBe(3);
    expect(pileLayers(30)).toBe(4);
  });

  it("never returns more layers for a smaller pile", () => {
    for (let n = 1; n < 40; n += 1) {
      expect(pileLayers(n)).toBeGreaterThanOrEqual(pileLayers(n - 1));
    }
  });
});

describe("pile", () => {
  it("carries its key and label", () => {
    const pile = createPile("player-deck", "Deck");
    expect(pile.root.dataset.pile).toBe("player-deck");
    expect(pile.root.querySelector(".pile-label")?.textContent).toBe("Deck");
  });

  it("shows the count", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(8);
    expect(pile.root.querySelector(".pile-count")?.textContent).toBe("8");
  });

  it("draws a layer stack that matches the count", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(10);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(pileLayers(10));
  });

  it("marks an empty pile and draws no backs", () => {
    const pile = createPile("player-discard", "Discard");
    pile.update(0);
    expect(pile.root.querySelector(".pile-stack")?.classList.contains("empty")).toBe(true);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(0);
  });

  it("clears the empty mark when cards come back", () => {
    const pile = createPile("player-discard", "Discard");
    pile.update(0);
    pile.update(3);
    expect(pile.root.querySelector(".pile-stack")?.classList.contains("empty")).toBe(false);
  });

  it("rebuilds rather than accumulating layers across updates", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(30);
    pile.update(1);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(1);
  });

  it("pulses for a reshuffle and stops pulsing after PULSE_MS", () => {
    const pile = createPile("player-deck", "Deck");
    pile.pulse();
    expect(pile.root.classList.contains("pulse")).toBe(true);
    vi.advanceTimersByTime(PULSE_MS + 10);
    expect(pile.root.classList.contains("pulse")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/piles.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/piles".

- [ ] **Step 3: Write the implementation**

Create `src/ui/piles.ts`:

```ts
import { el } from "./render";

export const PULSE_MS = 260;

export interface Pile {
  root: HTMLElement;
  update(count: number): void;
  pulse(): void;
}

/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4.
 *  The point is that a draining deck is legible at a glance, not that the
 *  layers are countable. */
export function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}

export function createPile(key: string, label: string): Pile {
  const root = el("div", "pile");
  root.dataset.pile = key;
  const stack = el("div", "pile-stack");
  const count = el("div", "pile-count", "0");
  const labelNode = el("div", "pile-label", label);
  root.append(stack, count, labelNode);

  return {
    root,
    update(n: number): void {
      count.textContent = String(n);
      stack.classList.toggle("empty", n === 0);
      stack.textContent = "";
      for (let i = 0; i < pileLayers(n); i += 1) {
        const back = el("div", "card-back");
        back.style.translate = `${-2 * i}px ${-2 * i}px`;
        stack.append(back);
      }
    },
    pulse(): void {
      root.classList.add("pulse");
      setTimeout(() => root.classList.remove("pulse"), PULSE_MS);
    },
  };
}
```

- [ ] **Step 4: Add the stylesheet block**

Append to `src/style.css`:

```css
/* --- piles ------------------------------------------------------------- */

.pile { width: 3.4rem; text-align: center; }

.pile-stack {
  position: relative;
  width: 3rem;
  height: 4.2rem;
  margin: 0 auto;
}

.pile-stack.empty {
  border: 1px dashed var(--edge);
  border-radius: 3px;
}

.card-back {
  position: absolute;
  inset: 0;
  border: 1px solid var(--edge);
  border-radius: 3px;
  background:
    repeating-linear-gradient(45deg, rgba(216, 212, 204, 0.08) 0 3px, transparent 3px 6px),
    var(--panel);
}

.pile-count { font-size: 0.75rem; margin-top: 0.2rem; }
.pile-label { font-size: 0.65rem; color: var(--dim); letter-spacing: 0.1em; }

.pile.pulse .pile-stack { animation: pile-pulse 260ms ease; }

@keyframes pile-pulse {
  50% { transform: scale(1.14); }
}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run tests/piles.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/piles.ts src/style.css tests/piles.test.ts
git commit -m "feat(hostages): deck and discard pile indicators"
```

---

### Task 9: The hand fan

**Files:**
- Create: `src/ui/hand.ts`
- Modify: `src/style.css`
- Test: `tests/hand.test.ts`

**Interfaces:**
- Consumes: `summarize`, `requirementText` from `src/content/card-text.ts`; `cardById` from `src/content/cards.ts`; `Legality` from `src/legality.ts`.
- Produces:
  - `interface HandOption { cardId: string; legality: Legality }`
  - `interface Hand { root: HTMLElement; update(options: HandOption[], onPick: (cardId: string) => void, locked: boolean): void; rectOf(cardId: string): DOMRect | null }`
  - `createHand(): Hand`
  - `createBackFan(): { root: HTMLElement; update(count: number): void }` for the convict's face-down hand
  - `const FAN_ANGLE_DEG: number`, `const FAN_DROP_PX: number`

**DOM contract:** root `<div class="hand" data-hand="player">`; each card is `<button class="card" data-card-id="...">` containing `.card-name` and `.card-summary`, plus a `.card-detail` panel with `.card-rules`, `.card-requires`, `.card-flavor` and (when illegal) `.card-reason`. Illegal cards are `disabled` and carry class `unplayable`, and stay at their index in the fan. When `locked` is true every card is disabled but keeps its `unplayable` marking unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/hand.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createHand, createBackFan } from "../src/ui/hand";
import { summarize } from "../src/content/card-text";
import { cardById } from "../src/content/cards";

const ok = { ok: true } as const;
const no = (reason: string) => ({ ok: false, reason }) as const;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("hand", () => {
  it("renders one card per option, in order", () => {
    const hand = createHand();
    hand.update(
      [
        { cardId: "stoic", legality: ok },
        { cardId: "stallHim", legality: ok },
      ],
      () => {},
      false,
    );
    const ids = [...hand.root.querySelectorAll(".card")].map((c) => (c as HTMLElement).dataset.cardId);
    expect(ids).toEqual(["stoic", "stallHim"]);
  });

  it("prints the card name and its derived summary on the face", () => {
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: ok }], () => {}, false);
    const card = hand.root.querySelector(".card") as HTMLElement;
    expect(card.querySelector(".card-name")?.textContent).toBe(cardById("kickHisKnee").name);
    expect(card.querySelector(".card-summary")?.textContent).toBe(summarize(cardById("kickHisKnee")));
  });

  it("carries the full rules, requirement and flavor in the detail panel", () => {
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: ok }], () => {}, false);
    const card = hand.root.querySelector(".card") as HTMLElement;
    expect(card.querySelector(".card-rules")?.textContent).toBe(cardById("kickHisKnee").rules);
    expect(card.querySelector(".card-requires")?.textContent).toContain("Needs:");
    expect(card.querySelector(".card-flavor")?.textContent).toBe(cardById("kickHisKnee").flavor);
  });

  it("reports a pick for a legal card", () => {
    const picks: string[] = [];
    const hand = createHand();
    hand.update([{ cardId: "stallHim", legality: ok }], (id) => picks.push(id), false);
    hand.root.querySelector<HTMLButtonElement>(".card")?.click();
    expect(picks).toEqual(["stallHim"]);
  });

  it("dims an illegal card in place and states the reason without removing it", () => {
    const hand = createHand();
    hand.update(
      [
        { cardId: "stoic", legality: ok },
        { cardId: "kickHisKnee", legality: no("needs: you are not bound") },
        { cardId: "stallHim", legality: ok },
      ],
      () => {},
      false,
    );
    const ids = [...hand.root.querySelectorAll(".card")].map((c) => (c as HTMLElement).dataset.cardId);
    expect(ids).toEqual(["stoic", "kickHisKnee", "stallHim"]);
    const card = hand.root.querySelector<HTMLButtonElement>(".card[data-card-id='kickHisKnee']");
    expect(card?.disabled).toBe(true);
    expect(card?.classList.contains("unplayable")).toBe(true);
    expect(card?.querySelector(".card-reason")?.textContent).toBe("needs: you are not bound");
  });

  it("does not fire a pick for an illegal card", () => {
    const picks: string[] = [];
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: no("nope") }], (id) => picks.push(id), false);
    hand.root.querySelector<HTMLButtonElement>(".card")?.click();
    expect(picks).toEqual([]);
  });

  it("locks every card while the table is busy without marking them unplayable", () => {
    const hand = createHand();
    hand.update([{ cardId: "stallHim", legality: ok }], () => {}, true);
    const card = hand.root.querySelector<HTMLButtonElement>(".card");
    expect(card?.disabled).toBe(true);
    expect(card?.classList.contains("unplayable")).toBe(false);
  });

  it("fans cards symmetrically around the middle", () => {
    const hand = createHand();
    hand.update(
      ["stoic", "stallHim", "flinch"].map((cardId) => ({ cardId, legality: ok })),
      () => {},
      false,
    );
    const cards = [...hand.root.querySelectorAll<HTMLElement>(".card")];
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[0].style.transform).not.toBe(cards[2].style.transform);
  });

  it("replaces the previous hand rather than appending to it", () => {
    const hand = createHand();
    hand.update([{ cardId: "stoic", legality: ok }], () => {}, false);
    hand.update([{ cardId: "stallHim", legality: ok }], () => {}, false);
    expect(hand.root.querySelectorAll(".card")).toHaveLength(1);
  });

  it("returns null for a card it is not holding", () => {
    const hand = createHand();
    hand.update([{ cardId: "stoic", legality: ok }], () => {}, false);
    expect(hand.rectOf("stallHim")).toBeNull();
  });
});

describe("back fan", () => {
  it("shows one face-down card per held card", () => {
    const fan = createBackFan();
    fan.update(4);
    expect(fan.root.querySelectorAll(".card-back")).toHaveLength(4);
  });

  it("shows nothing for an empty hand", () => {
    const fan = createBackFan();
    fan.update(0);
    expect(fan.root.querySelectorAll(".card-back")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hand.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/hand".

- [ ] **Step 3: Write the implementation**

Create `src/ui/hand.ts`:

```ts
import { cardById } from "../content/cards";
import { requirementText, summarize } from "../content/card-text";
import { el } from "./render";
import type { Legality } from "../legality";

export const FAN_ANGLE_DEG = 4;
export const FAN_DROP_PX = 5;

export interface HandOption {
  cardId: string;
  legality: Legality;
}

export interface Hand {
  root: HTMLElement;
  update(options: HandOption[], onPick: (cardId: string) => void, locked: boolean): void;
  rectOf(cardId: string): DOMRect | null;
}

function cardButton(
  option: HandOption,
  onPick: (cardId: string) => void,
  locked: boolean,
): HTMLElement {
  const card = cardById(option.cardId);
  const button = el("button", "card") as HTMLButtonElement;
  button.dataset.cardId = option.cardId;
  button.type = "button";
  button.append(el("span", "card-name", card.name));
  button.append(el("span", "card-summary", summarize(card)));

  const detail = el("span", "card-detail");
  detail.append(el("span", "card-rules", card.rules));
  const requires = requirementText(card.requires);
  if (requires.length > 0) detail.append(el("span", "card-requires", requires));
  detail.append(el("span", "card-flavor", card.flavor));
  if (!option.legality.ok) detail.append(el("span", "card-reason", option.legality.reason));
  button.append(detail);

  // Unplayable is about the game state, locked is about the animation being
  // mid-flight. Both disable, only the first is worth marking: a card that
  // greys out for a moment while cards fly would read as a rules change.
  button.classList.toggle("unplayable", !option.legality.ok);
  button.disabled = locked || !option.legality.ok;
  if (!button.disabled) button.addEventListener("click", () => onPick(option.cardId));
  return button;
}

export function createHand(): Hand {
  const root = el("div", "hand");
  root.dataset.hand = "player";

  return {
    root,
    update(options, onPick, locked): void {
      root.textContent = "";
      const n = options.length;
      options.forEach((option, i) => {
        const button = cardButton(option, onPick, locked);
        const offset = i - (n - 1) / 2;
        button.style.transform =
          `rotate(${offset * FAN_ANGLE_DEG}deg) ` +
          `translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
        root.append(button);
      });
    },
    rectOf(cardId: string): DOMRect | null {
      const node = root.querySelector<HTMLElement>(`.card[data-card-id="${cardId}"]`);
      return node === null ? null : node.getBoundingClientRect();
    },
  };
}

export function createBackFan(): { root: HTMLElement; update(count: number): void } {
  const root = el("div", "hand hand-backs");
  root.dataset.hand = "convict";
  return {
    root,
    update(count: number): void {
      root.textContent = "";
      for (let i = 0; i < count; i += 1) root.append(el("div", "card-back"));
    },
  };
}
```

- [ ] **Step 4: Add the stylesheet block**

Append to `src/style.css`:

```css
/* --- hand -------------------------------------------------------------- */

.hand {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 0.25rem;
  min-height: 8rem;
}

.hand .card {
  position: relative;
  width: 7rem;
  height: 7.5rem;
  padding: 0.4rem 0.45rem;
  text-align: left;
  border: 1px solid var(--edge);
  background: var(--panel);
  transform-origin: bottom center;
  transition: transform 140ms ease, border-color 140ms ease;
}

.hand .card:hover:not(:disabled),
.hand .card:focus-visible {
  border-color: var(--ink);
  transform: translateY(-0.7rem) rotate(0deg) !important;
  z-index: 5;
}

.hand .card.unplayable {
  opacity: 0.38;
  filter: grayscale(1);
}

.card-name { display: block; font-size: 0.75rem; line-height: 1.25; }
.card-summary {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.7rem;
  color: var(--dim);
}

.card-detail {
  display: none;
  position: absolute;
  bottom: calc(100% + 0.4rem);
  left: 50%;
  transform: translateX(-50%);
  width: 16rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--edge);
  background: var(--bg);
  z-index: 10;
}

.hand .card:hover .card-detail,
.hand .card:focus-visible .card-detail { display: block; }

.card-rules { display: block; font-size: 0.75rem; }
.card-requires { display: block; margin-top: 0.3rem; font-size: 0.7rem; color: var(--dim); }
.card-flavor {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.7rem;
  font-style: italic;
  color: var(--dim);
}
.card-reason { display: block; margin-top: 0.3rem; font-size: 0.7rem; color: var(--warn); }

.hand-backs { min-height: 3rem; gap: 0.15rem; }
.hand-backs .card-back {
  position: static;
  width: 1.6rem;
  height: 2.4rem;
}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run tests/hand.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hand.ts src/style.css tests/hand.test.ts
git commit -m "feat(hostages): card fan with hover detail and in-place unplayable cards"
```

---

### Task 10: Secrets rows, log drawer and the modal

Three small display modules, grouped because none carries enough logic to justify its own review gate.

**Files:**
- Create: `src/ui/secrets.ts`, `src/ui/logdrawer.ts`, `src/ui/notice.ts`
- Modify: `src/style.css`
- Test: `tests/secrets.test.ts`, `tests/logdrawer.test.ts`, `tests/notice.test.ts`

**Interfaces:**
- Produces:
  - `createSecrets(): { root: HTMLElement; update(held: readonly string[], onPick: ((id: string) => void) | null): void; rectOf(id: string): DOMRect | null }` - renders `SECRETS` in their fixed order, each either held or spent
  - `createTaken(): { root: HTMLElement; update(held: readonly string[]): void }` - his side; shows the secrets no longer held
  - `createLogDrawer(): { root: HTMLElement; append(events: GameEvent[]): void; clear(): void }`
  - `createNotice(): { root: HTMLElement; show(n: Notice, onDismiss: () => void): void; hide(): void; isOpen(): boolean }`

**DOM contract:**
- secrets: `<div class="secrets" data-secrets="held">` with `<button class="secret" data-card-id="secretSafe">`; a spent secret carries class `spent`, is `disabled`, and stays in place
- taken: `<div class="secrets" data-secrets="taken">` with non-interactive `<div class="secret taken">`
- log: `<div class="log-drawer" data-log>` with `.log-toggle` button, `.log-entries`, one `.log-entry[data-side]` per event and a `.log-turn` separator when the turn number changes
- notice: `<div class="notice-overlay" data-notice>` (class `hidden` when closed) wrapping `.notice-card` with `.notice-title`, `.notice-what`, `.notice-flavor`, `.notice-rows` (one `.notice-row` per row) and `.notice-continue`

- [ ] **Step 1: Write the failing tests**

Create `tests/secrets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSecrets, createTaken } from "../src/ui/secrets";
import { SECRETS, cardById } from "../src/content/cards";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("held secrets", () => {
  it("shows all three from the start, in a fixed order", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const ids = [...secrets.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(SECRETS);
  });

  it("names each secret by its card name", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const first = secrets.root.querySelector(".secret") as HTMLElement;
    expect(first.textContent).toContain(cardById(SECRETS[0]).name);
  });

  it("keeps a spent secret in place, marked and disabled", () => {
    const secrets = createSecrets();
    secrets.update([SECRETS[0], SECRETS[2]], null);
    const ids = [...secrets.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(SECRETS);
    const gone = secrets.root.querySelector<HTMLButtonElement>(
      `.secret[data-card-id='${SECRETS[1]}']`,
    );
    expect(gone?.classList.contains("spent")).toBe(true);
    expect(gone?.disabled).toBe(true);
  });

  it("is not pickable when no handler is supplied", () => {
    const secrets = createSecrets();
    secrets.update(SECRETS, null);
    const first = secrets.root.querySelector<HTMLButtonElement>(".secret");
    expect(first?.disabled).toBe(true);
  });

  it("reports a pick for a held secret when a handler is supplied", () => {
    const picks: string[] = [];
    const secrets = createSecrets();
    secrets.update(SECRETS, (id) => picks.push(id));
    secrets.root.querySelector<HTMLButtonElement>(`.secret[data-card-id='${SECRETS[0]}']`)?.click();
    expect(picks).toEqual([SECRETS[0]]);
  });

  it("never reports a pick for a spent secret", () => {
    const picks: string[] = [];
    const secrets = createSecrets();
    secrets.update([SECRETS[0]], (id) => picks.push(id));
    secrets.root.querySelector<HTMLButtonElement>(`.secret[data-card-id='${SECRETS[1]}']`)?.click();
    expect(picks).toEqual([]);
  });
});

describe("taken secrets", () => {
  it("is empty while you still hold all three", () => {
    const taken = createTaken();
    taken.update(SECRETS);
    expect(taken.root.querySelectorAll(".secret")).toHaveLength(0);
  });

  it("shows exactly what he has taken", () => {
    const taken = createTaken();
    taken.update([SECRETS[0]]);
    const ids = [...taken.root.querySelectorAll(".secret")].map(
      (n) => (n as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual([SECRETS[1], SECRETS[2]]);
  });
});
```

Create `tests/logdrawer.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createLogDrawer } from "../src/ui/logdrawer";
import { newRun, chooseOpening } from "../src/game";

beforeEach(() => {
  document.body.innerHTML = "";
});

function started() {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

describe("log drawer", () => {
  it("appends one entry per event", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log);
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("accumulates across calls rather than replacing", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log.slice(0, 2));
    drawer.append(state.log.slice(2));
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("marks which side each entry belongs to", () => {
    const drawer = createLogDrawer();
    const state = started();
    drawer.append(state.log);
    const sides = [...drawer.root.querySelectorAll(".log-entry")].map(
      (n) => (n as HTMLElement).dataset.side,
    );
    expect(sides).toEqual(state.log.map((e) => e.side));
  });

  it("inserts a separator when the turn number changes", () => {
    const drawer = createLogDrawer();
    const state = started();
    const bumped = state.log.map((e, i) => ({ ...e, turn: i < 2 ? 1 : 2 }));
    drawer.append(bumped);
    expect(drawer.root.querySelectorAll(".log-turn")).toHaveLength(2);
  });

  it("collapses and expands", () => {
    const drawer = createLogDrawer();
    const toggle = drawer.root.querySelector<HTMLButtonElement>(".log-toggle");
    expect(drawer.root.classList.contains("collapsed")).toBe(false);
    toggle?.click();
    expect(drawer.root.classList.contains("collapsed")).toBe(true);
    toggle?.click();
    expect(drawer.root.classList.contains("collapsed")).toBe(false);
  });

  it("empties on clear", () => {
    const drawer = createLogDrawer();
    drawer.append(started().log);
    drawer.clear();
    expect(drawer.root.querySelectorAll(".log-entry")).toHaveLength(0);
  });

  it("scrolls to the newest entry after appending", () => {
    // happy-dom performs no layout, so scrollHeight is permanently 0 and a
    // naive assertion would pass against code that never touched scrollTop.
    // Stub the getter to a distinctive value so only real code can produce it.
    const stubbed = 4242;
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollHeight", {
      configurable: true,
      get: () => stubbed,
    });
    try {
      const drawer = createLogDrawer();
      document.body.append(drawer.root);
      drawer.append(started().log);
      const entries = drawer.root.querySelector<HTMLElement>(".log-entries");
      expect(entries?.scrollTop).toBe(stubbed);
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollHeight", original);
    }
  });
});
```

Create `tests/notice.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createNotice } from "../src/ui/notice";
import type { Notice } from "../src/notices";

const sample: Notice = {
  title: "Backhand",
  what: "He plays Backhand. You had no answer for it.",
  flavor: "It is not the pain, it is how easy it was for him.",
  rows: ["Your vigor 6 -> 4", "He is close"],
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("notice modal", () => {
  it("starts hidden", () => {
    const notice = createNotice();
    expect(notice.root.classList.contains("hidden")).toBe(true);
    expect(notice.isOpen()).toBe(false);
  });

  it("shows the title, what and flavor", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    expect(notice.isOpen()).toBe(true);
    expect(notice.root.querySelector(".notice-title")?.textContent).toBe("Backhand");
    expect(notice.root.querySelector(".notice-what")?.textContent).toBe(sample.what);
    expect(notice.root.querySelector(".notice-flavor")?.textContent).toBe(sample.flavor);
  });

  it("renders one row per vitals change", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    const rows = [...notice.root.querySelectorAll(".notice-row")].map((n) => n.textContent);
    expect(rows).toEqual(sample.rows);
  });

  it("hides the row block when nothing changed", () => {
    const notice = createNotice();
    notice.show({ ...sample, rows: [] }, () => {});
    expect(notice.root.querySelector(".notice-rows")?.classList.contains("hidden")).toBe(true);
  });

  it("dismisses on continue and reports it once", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    notice.root.querySelector<HTMLButtonElement>(".notice-continue")?.click();
    expect(dismissed).toBe(1);
    expect(notice.isOpen()).toBe(false);
  });

  it("does not report a second dismissal from a stale click", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    const button = notice.root.querySelector<HTMLButtonElement>(".notice-continue");
    button?.click();
    button?.click();
    expect(dismissed).toBe(1);
  });

  it("replaces its content rather than accumulating rows across shows", () => {
    const notice = createNotice();
    notice.show(sample, () => {});
    notice.root.querySelector<HTMLButtonElement>(".notice-continue")?.click();
    notice.show({ ...sample, rows: ["He is down"] }, () => {});
    expect(notice.root.querySelectorAll(".notice-row")).toHaveLength(1);
  });

  it("hides without reporting a dismissal", () => {
    let dismissed = 0;
    const notice = createNotice();
    notice.show(sample, () => {
      dismissed += 1;
    });
    notice.hide();
    expect(notice.isOpen()).toBe(false);
    expect(dismissed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/secrets.test.ts tests/logdrawer.test.ts tests/notice.test.ts`
Expected: FAIL, three unresolved imports.

- [ ] **Step 3: Write `src/ui/secrets.ts`**

```ts
import { SECRETS, cardById } from "../content/cards";
import { el } from "./render";

export interface Secrets {
  root: HTMLElement;
  update(held: readonly string[], onPick: ((cardId: string) => void) | null): void;
  rectOf(cardId: string): DOMRect | null;
}

/** Your side. All three stay on the table for the whole run; the ones he has
 *  taken sit there spent, so the loss condition is a row that drains rather
 *  than a counter that ticks. */
export function createSecrets(): Secrets {
  const root = el("div", "secrets");
  root.dataset.secrets = "held";
  root.append(el("span", "secrets-label", "what he wants:"));
  const row = el("div", "secrets-row");
  root.append(row);

  return {
    root,
    update(held, onPick): void {
      row.textContent = "";
      for (const cardId of SECRETS) {
        const button = el("button", "secret") as HTMLButtonElement;
        button.type = "button";
        button.dataset.cardId = cardId;
        button.textContent = cardById(cardId).name;
        const stillHeld = held.includes(cardId);
        button.classList.toggle("spent", !stillHeld);
        button.disabled = !stillHeld || onPick === null;
        if (!button.disabled && onPick !== null) {
          button.addEventListener("click", () => onPick(cardId));
        }
        row.append(button);
      }
    },
    rectOf(cardId: string): DOMRect | null {
      const node = row.querySelector<HTMLElement>(`.secret[data-card-id="${cardId}"]`);
      return node === null ? null : node.getBoundingClientRect();
    },
  };
}

/** His side: what he has already got out of you. */
export function createTaken(): { root: HTMLElement; update(held: readonly string[]): void } {
  const root = el("div", "secrets");
  root.dataset.secrets = "taken";
  const label = el("span", "secrets-label", "taken from you:");
  const row = el("div", "secrets-row");
  root.append(label, row);

  return {
    root,
    update(held): void {
      row.textContent = "";
      const taken = SECRETS.filter((id) => !held.includes(id));
      label.classList.toggle("hidden", taken.length === 0);
      for (const cardId of taken) {
        const node = el("div", "secret taken", cardById(cardId).name);
        node.dataset.cardId = cardId;
        row.append(node);
      }
    },
  };
}
```

- [ ] **Step 4: Write `src/ui/logdrawer.ts`**

```ts
import { el } from "./render";
import type { GameEvent } from "../types";

export interface LogDrawer {
  root: HTMLElement;
  append(events: readonly GameEvent[]): void;
  clear(): void;
}

export function createLogDrawer(): LogDrawer {
  const root = el("div", "log-drawer");
  root.dataset.log = "";

  const header = el("div", "log-header");
  const title = el("span", "log-title", "Activity");
  const toggle = el("button", "log-toggle", "<") as HTMLButtonElement;
  toggle.type = "button";
  header.append(title, toggle);

  const entries = el("div", "log-entries");
  root.append(header, entries);

  let lastTurn = 0;

  toggle.addEventListener("click", () => {
    const collapsed = root.classList.toggle("collapsed");
    toggle.textContent = collapsed ? ">" : "<";
    // Entries are display:none while collapsed, so a scroll would no-op.
    if (!collapsed) entries.scrollTop = entries.scrollHeight;
  });

  return {
    root,
    append(events): void {
      for (const event of events) {
        if (event.turn !== lastTurn) {
          entries.append(el("div", "log-turn", `Turn ${event.turn}`));
          lastTurn = event.turn;
        }
        const entry = el("div", "log-entry", event.text);
        entry.dataset.side = event.side;
        if (event.deltas.length > 0) {
          entry.append(el("span", "log-deltas", event.deltas.join(", ")));
        }
        entries.append(entry);
      }
      if (events.length > 0) entries.scrollTop = entries.scrollHeight;
    },
    clear(): void {
      entries.textContent = "";
      lastTurn = 0;
    },
  };
}
```

- [ ] **Step 5: Write `src/ui/notice.ts`**

```ts
import { el } from "./render";
import type { Notice } from "../notices";

export interface NoticeModal {
  root: HTMLElement;
  show(notice: Notice, onDismiss: () => void): void;
  hide(): void;
  isOpen(): boolean;
}

export function createNotice(): NoticeModal {
  const root = el("div", "notice-overlay hidden");
  root.dataset.notice = "";
  const card = el("div", "notice-card");
  const title = el("h2", "notice-title");
  const what = el("p", "notice-what");
  const flavor = el("p", "notice-flavor");
  const rows = el("div", "notice-rows");
  const button = el("button", "notice-continue", "Continue") as HTMLButtonElement;
  button.type = "button";
  card.append(title, what, flavor, rows, button);
  root.append(card);

  // Cleared on dismissal so a stale second click cannot report twice.
  let pending: (() => void) | null = null;

  function dismiss(): void {
    const done = pending;
    pending = null;
    root.classList.add("hidden");
    done?.();
  }

  button.addEventListener("click", dismiss);

  return {
    root,
    show(notice, onDismiss): void {
      title.textContent = notice.title;
      what.textContent = notice.what;
      flavor.textContent = notice.flavor;
      flavor.classList.toggle("hidden", notice.flavor.length === 0);
      rows.textContent = "";
      rows.classList.toggle("hidden", notice.rows.length === 0);
      for (const row of notice.rows) rows.append(el("div", "notice-row", row));
      pending = onDismiss;
      root.classList.remove("hidden");
      button.focus();
    },
    hide(): void {
      pending = null;
      root.classList.add("hidden");
    },
    isOpen: () => !root.classList.contains("hidden"),
  };
}
```

- [ ] **Step 6: Add the stylesheet block**

Append to `src/style.css`:

```css
/* --- secrets ----------------------------------------------------------- */

.secrets { display: flex; align-items: baseline; gap: 0.5rem; }
.secrets-label { font-size: 0.65rem; color: var(--dim); letter-spacing: 0.1em; }
.secrets-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }

.secret {
  font: inherit;
  font-size: 0.65rem;
  color: inherit;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--warn);
  background: var(--panel);
  max-width: 11rem;
}

.secret.spent {
  border-color: var(--edge);
  color: var(--dim);
  opacity: 0.4;
  text-decoration: line-through;
}

.secret.taken { border-color: var(--warn); color: var(--warn); opacity: 1; }

/* --- log drawer -------------------------------------------------------- */

.log-drawer {
  border: 1px solid var(--edge);
  background: var(--panel);
  width: 16rem;
  display: flex;
  flex-direction: column;
  max-height: 26rem;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--edge);
}

.log-title { font-size: 0.7rem; letter-spacing: 0.15em; color: var(--dim); }

.log-toggle {
  font: inherit;
  font-size: 0.7rem;
  padding: 0 0.4rem;
  border: 1px solid var(--edge);
  background: transparent;
  color: var(--dim);
}

.log-drawer.collapsed { width: 2.2rem; }
.log-drawer.collapsed .log-entries,
.log-drawer.collapsed .log-title { display: none; }

.log-entries { overflow-y: auto; padding: 0.4rem 0.5rem; }
.log-turn {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: var(--dim);
  border-top: 1px solid var(--edge);
  padding-top: 0.3rem;
}
.log-entry { font-size: 0.72rem; padding: 0.15rem 0; }
.log-entry[data-side="convict"] { color: var(--warn); }
.log-entry[data-side="system"] { color: var(--dim); font-style: italic; }

/* --- notice modal ------------------------------------------------------ */

.notice-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 7, 5, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}

.notice-overlay.hidden { display: none; }

.notice-card {
  width: min(26rem, calc(100% - 3rem));
  border: 1px solid var(--warn);
  background: var(--panel);
  padding: 1.25rem 1.4rem;
}

.notice-title {
  margin: 0 0 0.6rem;
  font-size: 1rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--warn);
}

.notice-what { margin: 0 0 0.6rem; font-size: 0.85rem; }
.notice-flavor { margin: 0 0 0.8rem; font-size: 0.8rem; font-style: italic; color: var(--dim); }
.notice-rows { border-top: 1px solid var(--edge); padding-top: 0.6rem; margin-bottom: 0.9rem; }
.notice-row { font-size: 0.8rem; padding: 0.1rem 0; }

.notice-continue {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.45rem 1.4rem;
  border: 1px solid var(--edge);
  background: var(--bg);
  color: var(--ink);
}

.notice-continue:hover { border-color: var(--ink); }

.hidden { display: none; }
```

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run tests/secrets.test.ts tests/logdrawer.test.ts tests/notice.test.ts && npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/secrets.ts src/ui/logdrawer.ts src/ui/notice.ts src/style.css \
        tests/secrets.test.ts tests/logdrawer.test.ts tests/notice.test.ts
git commit -m "feat(hostages): secrets rows, log drawer and the notice modal"
```

---

### Task 11: Assemble the table

The coordinator. Builds the shell once, renders from a `GameEvent` during beats and from `GameState` at rest, and hands the beat driver its visual hooks.

**Files:**
- Create: `src/ui/table.ts`
- Delete: `src/ui/duel.ts`
- Modify: `src/main.ts`, `src/style.css`
- Rewrite: `tests/ui.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5-10, plus `legalPlayerLeads`, `legalPlayerAnswers`, `legalPlayerDiscards` from `src/game.ts` and `Actions` from `src/ui/render.ts`.
- Produces:
  - `interface Table { root: HTMLElement; present(state: GameState, onSettled: () => void): void }`
  - `createTable(actions: Actions): Table`
  - `bannerText(state: GameState): string`

**Behaviour:**
- `present(state, onSettled)` runs the beat driver over the fresh events, then draws final state and calls `onSettled`
- during beats, plates render from `event.vitals`, piles and the convict's back fan from `event.piles`, and the hand is locked
- at rest, the hand renders the options for the current phase: `legalPlayerLeads` in `playerLead` (plus a Wait and Watch button), `legalPlayerAnswers` in `playerAnswer` (plus a Take It button), `legalPlayerDiscards` in `discardDown`; in `forcedSurrender` the hand is empty and the held secrets become pickable
- the center strip holds the pending lead card face-up when `state.pendingLead` is set

- [ ] **Step 1: Write the failing test**

Replace `tests/ui.test.ts` entirely:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTitle } from "../src/ui/title";
import { renderEvent } from "../src/ui/event";
import { renderEnding } from "../src/ui/ending";
import { createTable, bannerText } from "../src/ui/table";
import { chooseOpening, newRun, playerLead } from "../src/game";
import { SECRETS } from "../src/content/cards";
import type { Actions } from "../src/ui/render";
import type { GameState } from "../src/types";

let root: HTMLElement;
const calls: string[] = [];

const actions: Actions = {
  start: () => calls.push("start"),
  choose: (id) => calls.push(`choose:${id}`),
  lead: (id) => calls.push(`lead:${id}`),
  pass: () => calls.push("pass"),
  answer: (id) => calls.push(`answer:${id}`),
  surrender: (id) => calls.push(`surrender:${id}`),
  discard: (id) => calls.push(`discard:${id}`),
  restart: () => calls.push("restart"),
};

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

/** Mounts a table and runs every pending beat so it is at rest. */
function settled(state: GameState) {
  const table = createTable(actions);
  root.append(table.root);
  let done = 0;
  table.present(state, () => {
    done += 1;
  });
  vi.advanceTimersByTime(20000);
  return { table, settledCount: () => done };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<div id='app'></div>";
  root = document.querySelector<HTMLElement>("#app") as HTMLElement;
  calls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("title screen", () => {
  it("renders and starts a run", () => {
    renderTitle(root, actions);
    expect(root.querySelector("[data-screen='title']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("#start")?.click();
    expect(calls).toEqual(["start"]);
  });
});

describe("event screen", () => {
  it("offers three choices that report back", () => {
    renderEvent(root, actions);
    const buttons = root.querySelectorAll<HTMLButtonElement>("button.choice");
    expect(buttons).toHaveLength(3);
    buttons[0].click();
    expect(calls[0]).toMatch(/^choose:/);
  });
});

describe("bannerText", () => {
  it("names the phase without shouting a wall of text", () => {
    const state = started();
    expect(bannerText(state)).toContain("YOUR TURN");
    state.phase = "playerAnswer";
    expect(bannerText(state)).toContain("HE IS WAITING");
    state.phase = "forcedSurrender";
    expect(bannerText(state)).toContain("HE HAS YOU");
    state.phase = "discardDown";
    expect(bannerText(state)).toContain("HAND IS FULL");
  });
});

describe("table", () => {
  it("builds the three plates, four piles and both hands", () => {
    const { table } = settled(started());
    for (const who of ["convict", "player", "wife"]) {
      expect(table.root.querySelector(`[data-plate='${who}']`)).not.toBeNull();
    }
    for (const key of ["player-deck", "player-discard", "convict-deck", "convict-discard"]) {
      expect(table.root.querySelector(`[data-pile='${key}']`)).not.toBeNull();
    }
    expect(table.root.querySelector("[data-hand='player']")).not.toBeNull();
    expect(table.root.querySelector("[data-hand='convict']")).not.toBeNull();
    expect(table.root.querySelector("[data-log]")).not.toBeNull();
    expect(table.root.querySelector("[data-notice]")).not.toBeNull();
  });

  it("reports settled once the opening deal has played out", () => {
    const { settledCount } = settled(started());
    expect(settledCount()).toBe(1);
  });

  it("shows your current stats once at rest", () => {
    const state = started();
    const { table } = settled(state);
    expect(table.root.querySelector("[data-stat='player-vigor']")?.textContent).toBe(
      `VIG ${state.player.vigor}`,
    );
  });

  it("shows the real pile counts once at rest", () => {
    const state = started();
    const { table } = settled(state);
    expect(
      table.root.querySelector("[data-pile='player-deck'] .pile-count")?.textContent,
    ).toBe(String(state.playerPile.deck.length));
  });

  it("offers your hand plus a wait option on your turn", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const { table } = settled(state);
    expect(table.root.querySelector(".card[data-card-id='stallHim']")).not.toBeNull();
    expect(table.root.querySelector("#pass")).not.toBeNull();
  });

  it("fires the lead action for a legal card", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const { table } = settled(state);
    table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']")?.click();
    expect(calls).toEqual(["lead:stallHim"]);
  });

  it("keeps an illegal card in the fan, dimmed, with a reason", () => {
    const state = started();
    state.playerPile.hand = ["kickHisKnee"];
    const { table } = settled(state);
    const card = table.root.querySelector<HTMLButtonElement>(".card[data-card-id='kickHisKnee']");
    expect(card).not.toBeNull();
    expect(card?.disabled).toBe(true);
    expect(card?.querySelector(".card-reason")?.textContent).toBe("needs: you are not bound");
  });

  it("offers a decline while answering, and shows his lead in the center", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["backhand"];
    playerLead(state, "stallHim");
    const { table } = settled(state);
    expect(table.root.querySelector("[data-banner]")?.textContent).toContain("HE IS WAITING");
    expect(
      table.root.querySelector("[data-slot='lead'] .card-name")?.textContent,
    ).not.toBeUndefined();
    table.root.querySelector<HTMLButtonElement>("#decline")?.click();
    expect(calls).toEqual(["answer:null"]);
  });

  it("makes held secrets inert on your own turn", () => {
    const state = started();
    const { table } = settled(state);
    const held = table.root.querySelector<HTMLButtonElement>(
      `[data-secrets='held'] .secret[data-card-id='${SECRETS[0]}']`,
    );
    expect(held?.disabled).toBe(true);
  });

  it("keeps secrets out of the fan so they only live in their own row", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["whereIsIt"];
    playerLead(state, "stallHim");
    const { table } = settled(state);
    // A secret is a legal answer to his demand, but it belongs to the row.
    for (const secretId of SECRETS) {
      expect(table.root.querySelector(`.hand .card[data-card-id='${secretId}']`)).toBeNull();
    }
  });

  it("fires surrender for a held secret during forced surrender", () => {
    const state = started();
    state.phase = "forcedSurrender";
    const { table } = settled(state);
    table.root
      .querySelector<HTMLButtonElement>(
        `[data-secrets='held'] .secret[data-card-id='${SECRETS[0]}']`,
      )
      ?.click();
    expect(calls).toEqual([`surrender:${SECRETS[0]}`]);
  });

  it("offers every held card when discarding down", () => {
    const state = started();
    state.phase = "discardDown";
    state.playerPile.hand = ["stoic", "stallHim"];
    const { table } = settled(state);
    const ids = [...table.root.querySelectorAll(".hand .card")].map(
      (c) => (c as HTMLElement).dataset.cardId,
    );
    expect(ids).toEqual(["stoic", "stallHim"]);
    table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stoic']")?.click();
    expect(calls).toEqual(["discard:stoic"]);
  });

  it("writes the whole event stream into the log drawer", () => {
    const state = started();
    const { table } = settled(state);
    expect(table.root.querySelectorAll(".log-entry")).toHaveLength(state.log.length);
  });

  it("locks the hand while beats are still playing", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    const table = createTable(actions);
    root.append(table.root);
    table.present(state, () => {});
    // mid-chain: the opening deal has not drained yet
    const card = table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']");
    if (card !== null) expect(card.disabled).toBe(true);
    vi.advanceTimersByTime(20000);
    expect(
      table.root.querySelector<HTMLButtonElement>(".card[data-card-id='stallHim']")?.disabled,
    ).toBe(false);
  });
});

describe("ending screen", () => {
  it("shows the headline, the account and a restart", () => {
    const state = started();
    state.outcome = "victory";
    renderEnding(root, state, actions);
    expect(root.querySelector(".headline")?.textContent).toMatch(/You win/);
    expect(root.querySelectorAll(".summary-line").length).toBeGreaterThan(0);
    root.querySelector<HTMLButtonElement>("#restart")?.click();
    expect(calls).toEqual(["restart"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/table".

- [ ] **Step 3: Write `src/ui/table.ts`**

```ts
import { legalPlayerAnswers, legalPlayerDiscards, legalPlayerLeads } from "../game";
import { cardById } from "../content/cards";
import { summarize } from "../content/card-text";
import { createBeats } from "./beats";
import { centerOf, flyCard } from "./animate";
import { createBackFan, createHand } from "./hand";
import type { HandOption } from "./hand";
import { createLogDrawer } from "./logdrawer";
import { createNotice } from "./notice";
import { createPile } from "./piles";
import { createPlate } from "./plates";
import { createSecrets, createTaken } from "./secrets";
import { el } from "./render";
import type { Actions } from "./render";
import type { GameEvent, GameState, Side } from "../types";

const CARD_W = 112; // matches .hand .card in style.css
const CARD_H = 120;
const CENTER_SCALE = 1.25;

export function bannerText(state: GameState): string {
  if (state.phase === "playerAnswer") return "HE IS WAITING - answer or take it";
  if (state.phase === "forcedSurrender") return "HE HAS YOU - give up a secret";
  if (state.phase === "discardDown") return "YOUR HAND IS FULL - discard one";
  return "YOUR TURN - lead a card";
}

export interface Table {
  root: HTMLElement;
  present(state: GameState, onSettled: () => void): void;
}

export function createTable(actions: Actions): Table {
  const root = el("section", "table");
  root.dataset.screen = "duel";

  const convictPlate = createPlate("convict");
  const playerPlate = createPlate("player");
  const wifePlate = createPlate("wife");
  const backs = createBackFan();
  const taken = createTaken();
  const secrets = createSecrets();
  const hand = createHand();
  const log = createLogDrawer();
  const notice = createNotice();

  const piles = {
    "player-deck": createPile("player-deck", "Deck"),
    "player-discard": createPile("player-discard", "Discard"),
    "convict-deck": createPile("convict-deck", "Deck"),
    "convict-discard": createPile("convict-discard", "Discard"),
  };

  const topRow = el("div", "table-row table-top");
  topRow.append(convictPlate.root, backs.root, taken.root, piles["convict-deck"].root, piles["convict-discard"].root);

  const banner = el("h2", "banner");
  banner.dataset.banner = "";

  const center = el("div", "center");
  center.dataset.center = "";
  const leadSlot = el("div", "slot");
  leadSlot.dataset.slot = "lead";
  const answerSlot = el("div", "slot");
  answerSlot.dataset.slot = "answer";
  center.append(leadSlot, answerSlot);

  const youRow = el("div", "table-row table-you");
  youRow.append(playerPlate.root, wifePlate.root, secrets.root);

  const handRow = el("div", "table-row table-hand");
  const choices = el("div", "choices");
  handRow.append(piles["player-deck"].root, hand.root, choices, piles["player-discard"].root);

  const board = el("div", "board");
  board.append(topRow, banner, center, youRow, handRow);

  const shell = el("div", "table-shell");
  shell.append(board, log.root);
  root.append(shell, notice.root);

  /** Renders the parts that a beat can step through, from that beat's own
   *  snapshot rather than from final state. Without this the table would
   *  snap to the end result on the first beat and the chain would animate
   *  against numbers that had already moved. */
  function paintEvent(event: GameEvent): void {
    convictPlate.update(event.vitals);
    playerPlate.update(event.vitals);
    wifePlate.update(event.vitals);
    piles["player-deck"].update(event.piles.player.deck);
    piles["player-discard"].update(event.piles.player.discard);
    piles["convict-deck"].update(event.piles.convict.deck);
    piles["convict-discard"].update(event.piles.convict.discard);
    backs.update(event.piles.convict.hand);
  }

  const rectOf = (node: HTMLElement) => node.getBoundingClientRect();
  const spawn = (r: DOMRect) => ({ x: r.x, y: r.y, width: CARD_W, height: CARD_H });

  function animate(event: GameEvent): void {
    const side: Side = event.side === "convict" ? "convict" : "player";
    if (event.kind === "draw") {
      const deck = piles[side === "player" ? "player-deck" : "convict-deck"].root;
      const target = side === "player" ? hand.root : backs.root;
      flyCard(root, "back", "", spawn(rectOf(deck)), [
        { to: centerOf(rectOf(target)), scale: 1, durationMs: 170 },
      ]);
      return;
    }
    if (event.kind === "reshuffle") {
      piles[side === "player" ? "player-deck" : "convict-deck"].pulse();
      return;
    }
    if (event.kind === "lead" || event.kind === "answer") {
      if (event.cardId === undefined) return;
      const card = cardById(event.cardId);
      const origin =
        (side === "player" ? hand.rectOf(event.cardId) : null) ??
        rectOf(side === "player" ? hand.root : backs.root);
      const slot = event.kind === "lead" ? leadSlot : answerSlot;
      flyCard(root, "", card.name, spawn(origin), [
        { to: centerOf(rectOf(slot)), scale: CENTER_SCALE, durationMs: 220 },
      ]);
      return;
    }
    if (event.kind === "surrender" && event.cardId !== undefined) {
      const origin = secrets.rectOf(event.cardId) ?? rectOf(secrets.root);
      flyCard(root, "", cardById(event.cardId).name, spawn(origin), [
        { to: centerOf(rectOf(taken.root)), scale: 0.9, durationMs: 280 },
      ]);
      return;
    }
    if (event.kind === "discard") {
      const discard = piles[side === "player" ? "player-discard" : "convict-discard"].root;
      const origin = rectOf(side === "player" ? hand.root : backs.root);
      flyCard(root, "back", "", spawn(origin), [
        { to: centerOf(rectOf(discard)), scale: 0.8, durationMs: 170 },
      ]);
    }
  }

  function renderCenter(state: GameState): void {
    leadSlot.textContent = "";
    answerSlot.textContent = "";
    if (state.pendingLead === null) return;
    const card = cardById(state.pendingLead.cardId);
    const face = el("div", "card center-card");
    face.dataset.cardId = card.id;
    face.append(el("span", "card-name", card.name));
    face.append(el("span", "card-summary", summarize(card)));
    leadSlot.append(face);
  }

  /** Secrets live in their own row for the whole run, so they are filtered
   *  out of the fan even when they are legal answers. Showing a card in two
   *  places at once would make the row look like a duplicate rather than the
   *  place the secret actually lives. */
  const notSecret = (option: HandOption): boolean =>
    !cardById(option.cardId).tags.includes("secret");

  function handOptions(state: GameState): HandOption[] {
    if (state.phase === "playerLead") return legalPlayerLeads(state).filter(notSecret);
    if (state.phase === "playerAnswer") return legalPlayerAnswers(state).filter(notSecret);
    if (state.phase === "discardDown") {
      return legalPlayerDiscards(state).map((cardId) => ({ cardId, legality: { ok: true } }));
    }
    return [];
  }

  /** The secrets row is where a secret is ever played from: as an answer
   *  while he is pressing you, or as the forced surrender when your
   *  willpower is gone. It is inert the rest of the time. */
  function secretHandler(state: GameState, locked: boolean): ((id: string) => void) | null {
    if (locked) return null;
    if (state.phase === "forcedSurrender") return (id) => actions.surrender(id);
    if (state.phase !== "playerAnswer") return null;
    const legal = new Set(
      legalPlayerAnswers(state)
        .filter((o) => o.legality.ok && !notSecret(o))
        .map((o) => o.cardId),
    );
    if (legal.size === 0) return null;
    return (id) => {
      if (legal.has(id)) actions.answer(id);
    };
  }

  function pickFor(state: GameState): (cardId: string) => void {
    if (state.phase === "playerAnswer") return (id) => actions.answer(id);
    if (state.phase === "discardDown") return (id) => actions.discard(id);
    return (id) => actions.lead(id);
  }

  function renderChoices(state: GameState, locked: boolean): void {
    choices.textContent = "";
    if (locked) return;
    if (state.phase === "playerLead") {
      const pass = el("button", "secondary", "Wait and watch (draw a card)") as HTMLButtonElement;
      pass.type = "button";
      pass.id = "pass";
      pass.addEventListener("click", () => actions.pass());
      choices.append(pass);
    } else if (state.phase === "playerAnswer") {
      const decline = el("button", "secondary", "Take it") as HTMLButtonElement;
      decline.type = "button";
      decline.id = "decline";
      decline.addEventListener("click", () => actions.answer(null));
      choices.append(decline);
    }
  }

  function paintState(state: GameState, locked: boolean): void {
    banner.textContent = bannerText(state);
    hand.update(handOptions(state), pickFor(state), locked);
    renderChoices(state, locked);
    renderCenter(state);
    taken.update(state.secretsRemaining);
    secrets.update(state.secretsRemaining, secretHandler(state, locked));
  }

  let current: GameState | null = null;
  let settledCallback: (() => void) | null = null;

  const beats = createBeats({
    play(event) {
      paintEvent(event);
      animate(event);
      log.append([event]);
    },
    notice(n, done) {
      notice.show(n, done);
    },
    settled() {
      if (current !== null) paintState(current, false);
      const done = settledCallback;
      settledCallback = null;
      done?.();
    },
  });

  return {
    root,
    present(state, onSettled): void {
      current = state;
      settledCallback = onSettled;
      paintState(state, true);
      beats.run(state);
    },
  };
}
```

- [ ] **Step 4: Delete the old duel screen**

```bash
git rm src/ui/duel.ts
```

- [ ] **Step 5: Rewrite `src/main.ts`**

```ts
import {
  chooseOpening,
  newRun,
  playerAnswer,
  playerDiscard,
  playerLead,
  playerPass,
  playerSurrender,
} from "./game";
import { createTable } from "./ui/table";
import type { Table } from "./ui/table";
import { renderEnding } from "./ui/ending";
import { renderEvent } from "./ui/event";
import { renderTitle } from "./ui/title";
import { clear } from "./ui/render";
import type { Actions } from "./ui/render";
import type { GameState } from "./types";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
let state: GameState | null = null;
let table: Table | null = null;

function nextSeed(): number {
  return Math.floor(performance.now() * 1000) % 2147483647;
}

const actions: Actions = {
  start() {
    state = newRun(nextSeed());
    draw();
  },
  choose(id) {
    if (state) chooseOpening(state, id);
    draw();
  },
  lead(id) {
    if (state) playerLead(state, id);
    draw();
  },
  pass() {
    if (state) playerPass(state);
    draw();
  },
  answer(id) {
    if (state) playerAnswer(state, id);
    draw();
  },
  surrender(id) {
    if (state) playerSurrender(state, id);
    draw();
  },
  discard(id) {
    if (state) playerDiscard(state, id);
    draw();
  },
  restart() {
    state = null;
    draw();
  },
};

/** The table is kept alive across turns so its elements can animate; every
 *  other screen is a plain re-render and drops it. */
function leaveTable(): void {
  table = null;
}

function draw(): void {
  if (!root) return;
  const current = state;
  if (current === null) {
    leaveTable();
    renderTitle(root, actions);
    return;
  }
  if (current.phase === "openingEvent") {
    leaveTable();
    renderEvent(root, actions);
    return;
  }
  if (table === null) {
    clear(root);
    table = createTable(actions);
    root.append(table.root);
  }
  table.present(current, () => {
    if (current.phase !== "gameOver") return;
    leaveTable();
    clear(root);
    renderEnding(root, current, actions);
  });
}

draw();
```

- [ ] **Step 6: Add the layout stylesheet block**

Append to `src/style.css`:

```css
/* --- table layout ------------------------------------------------------ */

.table { display: block; padding: 1rem; }
.table-shell {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  max-width: 72rem;
  margin: 0 auto;
}

.board { flex: 1; display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }

.table-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.table-top { border-bottom: 1px solid var(--edge); padding-bottom: 0.6rem; }
.table-you { border-top: 1px solid var(--edge); padding-top: 0.6rem; }
.table-hand { align-items: flex-end; justify-content: space-between; }

.center {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  min-height: 8rem;
}

.slot { width: 7rem; min-height: 7.5rem; }

.center-card {
  width: 7rem;
  min-height: 7.5rem;
  padding: 0.4rem 0.45rem;
  border: 1px solid var(--warn);
  background: var(--panel);
}

.choices { display: flex; flex-direction: column; gap: 0.4rem; }

@media (max-width: 900px) {
  .table-shell { flex-direction: column; }
  .log-drawer { width: 100%; max-height: 12rem; }
  .hand .card { width: 5.5rem; height: 6.5rem; }
}
```

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS. If `tests/ui.test.ts` fails on a selector, fix `table.ts` to honour the DOM contract rather than loosening the test.

- [ ] **Step 8: Commit**

```bash
git add src/ui/table.ts src/main.ts src/style.css tests/ui.test.ts
git add -u src/ui/duel.ts
git commit -m "feat(hostages): assemble the duel table and retire the text screen"
```

---

### Task 12: Verify in the browser and tidy the stylesheet

Tests over happy-dom cannot see layout, so nothing above proves the table looks right. This task is the visual pass.

**Files:**
- Modify: `src/style.css` (only as the browser pass demands)
- Modify: `docs/superpowers/specs/2026-07-28-hostages-ux-design.md` if reality diverged from the spec

- [ ] **Step 1: Start the root dev server**

From the repo root (`/Users/janis.kirsteins/Projects/prototypes`):

```bash
npm run dev
```

Open `http://127.0.0.1:4173/prototypes/` and follow the link to prototype 03. Do not serve `03-hostages` on its own at a bare root: its `base` is `/prototypes/03/`, so a bare-root server makes asset paths resolve by accident locally while still being wrong in production.

- [ ] **Step 2: Play a full run and check each of these**

Confirm every item, and fix the CSS where one fails:

- [ ] the opening deal animates six cards out of the two decks, and the counts land on the real deck sizes
- [ ] on your turn the banner says YOUR TURN and your hand is clickable
- [ ] leading a card flies it to the center; his answer, if any, flies in to meet it
- [ ] stat plates pop on the numbers that changed, not on the ones that held still
- [ ] after his turn resolves, exactly one modal appears, naming his card and listing the changes
- [ ] dismissing the modal unlocks the hand and the banner returns to YOUR TURN
- [ ] no modal appears after your own lead resolves
- [ ] illegal cards sit dimmed in the fan at their own position, and hovering one shows the reason
- [ ] hovering a legal card raises it and shows rules, requirement and flavor
- [ ] deck and discard stacks visibly thin and thicken; a reshuffle pulses the deck
- [ ] the three secrets show face-up; giving one up flies it across to his row and leaves a struck-through slot behind
- [ ] the log drawer accumulates entries with turn separators and collapses cleanly
- [ ] nothing overflows horizontally at 1280px, and the layout stacks without overlap at 800px
- [ ] a full turn from click to next input takes roughly 1.3s and never feels like waiting

- [ ] **Step 3: Check the console**

Confirm zero errors and zero warnings in DevTools across a full run, including a win and a loss.

- [ ] **Step 4: Full verification**

Run, in `03-hostages/`:

```bash
npm test && npm run build
```

Expected: PASS. Report the actual test count and any skipped assertions.

- [ ] **Step 5: Commit**

```bash
git add src/style.css
git commit -m "polish(hostages): table layout fixes from the browser pass"
```

---

## Self-review notes

Checked against the spec, section by section:

- Spec 2 (one event stream, new kinds, vitals snapshot) -> Tasks 1 and 2. The spec described only a `vitals` snapshot; the plan also adds an `EventPiles` snapshot, because plates rendered per beat while piles rendered from final state would visibly desynchronise. This is an addition to the spec, not a contradiction, and section 4's "renders from each event's own snapshot" depends on it.
- Spec 3 (exhaustive modal roles, two triggers, no box on your turn) -> Task 3 for the roles and builder, Task 6 for the triggers. The segment rules are stated as an explicit list in Task 6 because they are the subtlest part of the change.
- Spec 4 (the table, its modules, derived card text, unplayable treatment, secrets rows) -> Tasks 4, 7, 8, 9, 10, 11.
- Spec 5 (beats, timings, `flyCard` port, input lock) -> Tasks 5, 6, 11. `BEAT_MS` is an exhaustive `Record<EventKind, number>`, and Task 6 asserts the chain stays under the 1500ms budget.
- Spec 6 (test files) -> every named file appears: `vitals`, `notices`, `beats`, `animate`, plus the rewritten `ui.test.ts` and per-module tests the spec did not enumerate.
- Spec 7 (out of scope) -> the Global Constraints forbid rules changes; title, event and ending screens keep their content and only gain CSS; the 900px breakpoint is in Task 11.

Type consistency: `snapshot`/`diff`/`lines` (Task 1) are consumed under those exact names in Tasks 3, 6 and 7. `MODAL_ROLES`/`buildNotice`/`Notice` (Task 3) are consumed in Task 6 and 10. `summarize`/`requirementText` (Task 4) in Tasks 9 and 11. `flyCard`/`centerOf` (Task 5) in Task 11. `createBeats`/`BeatHooks` (Task 6) in Task 11. `createPlate`/`createPile`/`createHand`/`createBackFan`/`createSecrets`/`createTaken`/`createLogDrawer`/`createNotice` all appear in Task 11's import list under the names their tasks export.

One known risk, flagged rather than hidden: Task 2 introduces a type-only import cycle between `src/types.ts` and `src/vitals.ts`. TypeScript resolves this and it erases at runtime, but both sides must use `import type`. If `tsc` complains, the fallback is to move `Vitals` into `src/types.ts` and have `vitals.ts` import it from there.
