# Multiplayer over PeerJS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two humans (host + guest) play one game of Baltic Tribes over
WebRTC via PeerJS, host-authoritative, with rejoin-by-link, per
`docs/superpowers/specs/2026-08-08-multiplayer-peerjs-design.md`.

**Architecture:** The host runs the one true simulation exactly as today
(rules, seeded rng, all AI seats). The guest is a rendering client
holding full state: it sends actions, receives `{state-sans-log,
newEvents}` updates, and renders through the existing HUD. New modules:
a state codec, a wire protocol, a PeerJS binding, host/guest session
drivers, and a join panel. One cross-cutting refactor: "the human is
players[0] / playerId 1" becomes a `localPlayerId`/`localSeat`
parameter.

**Tech Stack:** Plain TypeScript + Vite, no framework, imperative DOM.
`peerjs` (^1.5.4) becomes the project's first and only runtime
dependency. Tests: vitest (node env for protocol, happy-dom for HUD).

## Global Constraints

- Working directory for everything: `02-balticmap/`. Commit with
  explicit paths scoped to this prototype. Never `git add -A`.
- `npm test` and `npm run build` must pass before every commit. The
  pre-commit hook runs biome lint + `tsc --noEmit`; do not bypass it.
- The golden replay fixture (`tests/rng-isolation.test.ts` against
  `tests/fixtures/seeded-games-baseline.json`) must pass UNCHANGED at
  every task. If it fails, the refactor changed engine behaviour - fix
  the code, never re-freeze the baseline.
- Rich-text rule: player-facing prose naming a card or faction builds
  the sentence from `t()`, `card()`, `faction()` segments
  (src/rich-text.ts), never template literals. Player display names
  (e.g. "Alice") are plain text - the rule covers card and faction
  names only.
- No em dashes or non-typable unicode in any new code, comments, or
  UI strings. Use "-", "->", "...".
- A dark-background container declares its own `color` (see the
  AGENTS.md dark-box rule) - applies to the new net panel CSS.
- `serializeGame`/`deserializeGame` are the ONLY way state crosses the
  wire; `GameState.overlords` is a `Map` and raw `JSON.stringify`
  silently drops it to `{}`.
- Engine files (`game.ts`, `cards.ts`, `playability.ts`, `relations.ts`,
  `ai.ts`) are NOT modified by this plan. The engine already does
  everything the host needs.
- Boot params stay solo-only: `src/boot-params.ts` keeps its
  `players[0]` reads (lines 224, 277) untouched, and `join` is NOT a
  boot param.

## File Structure

- Create `src/net-codec.ts` - GameState <-> JSON-safe form.
- Create `src/net-protocol.ts` - message types, validation, update
  building, guest phase mapping, `Wire` interface + in-memory pair.
  No peerjs import, so tests never load peerjs.
- Create `src/net.ts` - the only file importing `peerjs`: peer
  creation, connection wrapping, heartbeat. Imported only by main.ts.
- Create `src/net-host.ts` / `src/net-guest.ts` - per-role session
  drivers over a `Wire`. Pure protocol logic, testable over the
  in-memory pair.
- Create `src/net-ui.ts` - the join/host panel and connection status.
- Modify `src/hud.ts`, `src/notices.ts`, `src/xp.ts` - localPlayerId
  parameterization; `src/hud.ts` also gains `setWaiting` and player
  name display.
- Modify `src/main.ts` - localSeat, mode switch, host chain, guest
  input path, integration.
- Modify `src/style.css`, `package.json`.
- Tests: `tests/net-codec.test.ts`, `tests/net-protocol.test.ts`,
  `tests/net-pipe.test.ts`, additions to `tests/hud.test.ts` and
  `tests/boot-params.test.ts`.

---

### Task 1: State codec

**Files:**
- Create: `src/net-codec.ts`
- Test: `tests/net-codec.test.ts`

**Interfaces:**
- Consumes: `GameState` from `src/game.ts`.
- Produces: `SerializedGameState`, `serializeGame(state: GameState):
  SerializedGameState`, `deserializeGame(s: SerializedGameState):
  GameState`. Every later networking task uses exactly these.

- [ ] **Step 1: Write the failing test**

```ts
// tests/net-codec.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import { serializeGame, deserializeGame } from "../src/net-codec";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A real mid-game state: dealt, then a few AI rounds so overlords,
 *  relations and the log are all populated. */
function midGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseDeck(g, buildDeck());
  g = pickFaction(g, "alpha", rng);
  for (let i = 0; i < 12 && g.phase === "playing"; i++) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  return g;
}

describe("net codec", () => {
  it("round-trips a mid-game state through JSON, overlords included", () => {
    const g = midGame(seededRng(7));
    const wire = JSON.parse(JSON.stringify(serializeGame(g)));
    const back = deserializeGame(wire);
    expect(back).toEqual(g);
    expect(back.overlords).toBeInstanceOf(Map);
  });

  it("raw JSON.stringify would have dropped overlords (the reason this file exists)", () => {
    const g = midGame(seededRng(7));
    const raw = JSON.parse(JSON.stringify(g));
    // Map -> {} is the silent bug the codec guards against. If this
    // assertion ever fails, overlords stopped being a Map and the codec
    // may be deletable - revisit, do not just fix the test.
    expect(raw.overlords).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/net-codec.test.ts`
Expected: FAIL - cannot resolve `../src/net-codec`.

- [ ] **Step 3: Write the implementation**

```ts
// src/net-codec.ts
import type { GameState } from "./game";

/** GameState with `overlords` as a plain record - the one field a
 *  JSON round-trip cannot carry (a Map stringifies to {}). Everything
 *  else on GameState is already records, arrays and primitives. */
export type SerializedGameState = Omit<GameState, "overlords"> & {
  overlords: Record<string, string>;
};

export function serializeGame(state: GameState): SerializedGameState {
  return { ...state, overlords: Object.fromEntries(state.overlords) };
}

export function deserializeGame(s: SerializedGameState): GameState {
  return { ...s, overlords: new Map(Object.entries(s.overlords)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/net-codec.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full gates, then commit**

Run: `npm test && npm run build`
Expected: all suites pass, build clean.

```bash
git add src/net-codec.ts tests/net-codec.test.ts
git commit -m "feat(net): GameState codec - overlords Map to record and back"
```

---

### Task 2: Wire protocol - messages, validation, updates, guest view

**Files:**
- Create: `src/net-protocol.ts`
- Test: `tests/net-protocol.test.ts`

**Interfaces:**
- Consumes: `serializeGame`/`deserializeGame` (Task 1); `GameState`,
  `GameEvent`, `GamePhase`, `playCard`, `discardCard`, `endTurn` from
  `src/game.ts`; `CARDS`, `Rng` from `src/cards.ts`; `RuleSelections`
  from `src/rules.ts`.
- Produces (used by Tasks 5-10):
  - `PROTOCOL_VERSION: number`, `cardSetHash(): string`
  - `type NetAction`, `type NetMessage`
  - `seatOfFaction(state, factionId): number` (-1 when absent)
  - `validateAction(state, seat, turn, action): string | null`
  - `applyNetAction(state, rng, action): GameState`
  - `buildUpdate(state, sentLog): NetMessage` (type "update")
  - `applyUpdate(prev: GameState | null, msg): GameState`
  - `guestPhaseView(state, guestFactionId): GamePhase`
  - `interface Wire`, `wirePair(): [Wire, Wire]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/net-protocol.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import {
  applyNetAction, applyUpdate, buildUpdate, guestPhaseView, seatOfFaction,
  validateAction, wirePair, type NetMessage,
} from "../src/net-protocol";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function freshGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseDeck(g, buildDeck());
  return pickFaction(g, "alpha", rng);
}

describe("action validation", () => {
  it("accepts the current seat's play of the card actually at that index", () => {
    const rng = seededRng(3);
    const g = freshGame(rng); // current = 0 (alpha)
    const cardId = g.players[0].hand[0];
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId,
    })).toBeNull();
  });

  it("rejects an out-of-turn action", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    const seat = seatOfFaction(g, "gamma");
    const cardId = g.players[seat].hand[0];
    expect(validateAction(g, seat, g.turn, {
      type: "play", cardIndex: 0, cardId,
    })).toMatch(/turn/);
  });

  it("rejects a stale turn stamp", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    const cardId = g.players[0].hand[0];
    expect(validateAction(g, 0, g.turn - 1, {
      type: "play", cardIndex: 0, cardId,
    })).toMatch(/turn/);
  });

  it("rejects a cardId that disagrees with cardIndex", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "not-the-card-at-0",
    })).toMatch(/hand/);
  });
});

describe("updates", () => {
  it("carries the state without the log and the log tail separately, and the guest reassembles both", () => {
    const rng = seededRng(9);
    let host = freshGame(rng);
    // Guest baseline: the start snapshot (here, the same immutable
    // state value - the engine never mutates in place).
    let guest: GameState | null = host;
    let sentLog = host.log.length;
    // A few AI turns move the host on; the guest catches up per update.
    for (let i = 0; i < 6 && host.phase === "playing"; i++) {
      host = advance(aiTakeTurn(host, rng), rng);
      const msg = buildUpdate(host, sentLog);
      expect(msg.type).toBe("update");
      if (msg.type === "update") {
        expect(msg.state.log).toEqual([]); // the log never re-crosses the wire
        guest = applyUpdate(guest, msg);
        sentLog = host.log.length;
      }
    }
    expect(guest).toEqual(host);
  });
});

describe("applyNetAction", () => {
  it("routes end-turn to endTurn only under unlimited rules (standard refuses)", () => {
    const rng = seededRng(5);
    const g = freshGame(rng);
    expect(applyNetAction(g, rng, { type: "end-turn" })).toBe(g);
  });
});

describe("guestPhaseView", () => {
  it("maps the host's victory to the guest's defeat", () => {
    const rng = seededRng(5);
    const g = { ...freshGame(rng), phase: "victory" as const };
    expect(guestPhaseView(g, "beta")).toBe("defeat");
  });

  it("maps a unification by the guest's own faction to victory", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      phase: "defeat",
      log: [...base.log, {
        turn: base.turn, playerId: 2, type: "unified",
        overlordFactionId: "beta",
      }],
    };
    expect(guestPhaseView(g, "beta")).toBe("victory");
    expect(guestPhaseView(g, "gamma")).toBe("defeat");
  });
});

describe("wirePair", () => {
  it("delivers messages both ways and reports close to both sides", () => {
    const [a, b] = wirePair();
    const got: NetMessage[] = [];
    b.onMessage((m) => got.push(m));
    a.send({ type: "ping" });
    expect(got).toEqual([{ type: "ping" }]);
    let closed = 0;
    a.onClose(() => closed++);
    b.onClose(() => closed++);
    a.close();
    expect(closed).toBe(2);
    a.send({ type: "ping" }); // after close: dropped, no throw
    expect(got.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/net-protocol.test.ts`
Expected: FAIL - cannot resolve `../src/net-protocol`.

- [ ] **Step 3: Write the implementation**

```ts
// src/net-protocol.ts
import { CARDS, type Rng } from "./cards";
import {
  discardCard, endTurn, playCard,
  type GameEvent, type GamePhase, type GameState,
} from "./game";
import type { RuleSelections } from "./rules";
import {
  deserializeGame, serializeGame, type SerializedGameState,
} from "./net-codec";

export const PROTOCOL_VERSION = 1;

/** Fingerprint of the build's card set. Two deploys whose CARDS differ
 *  cannot share a game - hand indexes and rules text would disagree -
 *  so the hello handshake compares this and refuses politely. */
export function cardSetHash(): string {
  return Object.keys(CARDS).sort().join(",");
}

/** The guest's move, the AiAction shape plus end-turn. `cardId` rides
 *  beside `cardIndex` so the host can refuse a hand-order mismatch
 *  instead of silently playing the wrong card. */
export type NetAction =
  | { type: "play"; cardIndex: number; cardId: string; targetId?: string }
  | { type: "discard"; cardIndex: number; cardId: string }
  | { type: "end-turn" };

export type NetMessage =
  /** Both directions on connect: refuse politely at the lobby, never
   *  desync mid-game. `name` is the sender's display name. */
  | { type: "hello"; version: number; cards: string; name: string }
  | { type: "refuse"; reason: string }
  /** Host -> guest, on connect and whenever the host's pick changes. */
  | { type: "lobby-host"; rules: RuleSelections; takenFactionId: string | null }
  /** Guest -> host: its deck (card ids, already a legal DECK_SIZE deck
   *  from the guest's own collection) and chosen faction. */
  | { type: "lobby-guest"; deck: string[]; factionId: string }
  | { type: "start"; state: SerializedGameState; guestFactionId: string }
  | { type: "action"; turn: number; seat: number; action: NetAction }
  /** The log never re-crosses the wire: `state.log` is empty and the
   *  guest appends `newEvents` to its own copy. */
  | { type: "update"; state: SerializedGameState; newEvents: GameEvent[] }
  /** Full state including the whole log: on start and on rejoin. */
  | { type: "snapshot"; state: SerializedGameState; guestFactionId: string }
  | { type: "reject"; reason: string }
  | { type: "ping" }
  | { type: "pong" };

export function seatOfFaction(state: GameState, factionId: string): number {
  return state.players.findIndex((p) => p.factionId === factionId);
}

/** Races and bugs, not malice (trusted friends): is it this seat's
 *  turn, and is the named card really at that index. Card legality
 *  itself stays with playCard/discardCard, which return the state
 *  unchanged on a refused move. */
export function validateAction(
  state: GameState, seat: number, turn: number, action: NetAction,
): string | null {
  if (state.phase !== "playing") return "the game is not in play";
  if (seat < 0 || seat >= state.players.length) return "no such seat";
  if (state.current !== seat) return "not this seat's turn";
  if (turn !== state.turn) return "stale turn stamp";
  if (action.type === "end-turn") return null;
  if (state.players[seat].hand[action.cardIndex] !== action.cardId) {
    return "hand mismatch: card is not at that index";
  }
  return null;
}

export function applyNetAction(
  state: GameState, rng: Rng, action: NetAction,
): GameState {
  switch (action.type) {
    case "play":
      return playCard(state, action.cardIndex, rng, action.targetId);
    case "discard":
      return discardCard(state, action.cardIndex);
    case "end-turn":
      return endTurn(state);
  }
}

export function buildUpdate(
  state: GameState, sentLog: number,
): Extract<NetMessage, { type: "update" }> {
  return {
    type: "update",
    state: serializeGame({ ...state, log: [] }),
    newEvents: state.log.slice(sentLog),
  };
}

export function applyUpdate(
  prev: GameState | null,
  msg: Extract<NetMessage, { type: "update" }>,
): GameState {
  const bare = deserializeGame(msg.state);
  return { ...bare, log: [...(prev?.log ?? []), ...msg.newEvents] };
}

/** The engine's endings are host-centric (they pivot on humanSeat, the
 *  host's seat 0). The guest maps the phase for presentation: the
 *  host's victory is the guest's defeat, and a unification by the
 *  guest's own faction is the guest's victory. See the spec's
 *  host-seat privileges section. */
export function guestPhaseView(
  state: GameState, guestFactionId: string,
): GamePhase {
  if (state.phase === "victory") return "defeat";
  if (state.phase === "defeat") {
    const ending = state.log[state.log.length - 1];
    if (
      ending?.type === "unified" &&
      ending.overlordFactionId === guestFactionId
    ) {
      return "victory";
    }
  }
  return state.phase;
}

/** One duplex message channel. src/net.ts wraps a PeerJS
 *  DataConnection into this; wirePair below is the in-memory version
 *  the protocol tests run on, so no test ever imports peerjs. */
export interface Wire {
  send(msg: NetMessage): void;
  onMessage(fn: (msg: NetMessage) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

/** Two connected Wires with synchronous delivery. Close on either side
 *  closes both, like a real connection. */
export function wirePair(): [Wire, Wire] {
  const msgFns: ((m: NetMessage) => void)[][] = [[], []];
  const closeFns: (() => void)[][] = [[], []];
  let open = true;
  const side = (mine: number, theirs: number): Wire => ({
    send(m) {
      if (open) for (const fn of msgFns[theirs]) fn(m);
    },
    onMessage(fn) {
      msgFns[mine].push(fn);
    },
    onClose(fn) {
      closeFns[mine].push(fn);
    },
    close() {
      if (!open) return;
      open = false;
      for (const fns of closeFns) for (const fn of fns) fn();
    },
  });
  return [side(0, 1), side(1, 0)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/net-protocol.test.ts`
Expected: PASS. If the update round-trip test fails on `toEqual`,
check that `applyUpdate` starts from the DESERIALIZED state (Map
restored) - that is the codec doing its job.

- [ ] **Step 5: Full gates, then commit**

Run: `npm test && npm run build`

```bash
git add src/net-protocol.ts tests/net-protocol.test.ts
git commit -m "feat(net): wire protocol - messages, validation, updates, guest phase view"
```

---

### Task 3: localPlayerId in hud.ts

**Files:**
- Modify: `src/hud.ts` (sites at lines 215, 284, 286, 650, 652, 664,
  671, 1080, 1311, 1333, 1352, 1472, 1687, 1705, 1753, 1808, 1837,
  1957 - line numbers as of commit 356ff89, re-grep before editing)
- Test: `tests/hud.test.ts` (additions)

**Interfaces:**
- Consumes: nothing new.
- Produces: two optional members on `HudCallbacks` (src/hud.ts:34),
  which Task 10 wires up:

```ts
  /** The player id of the seat this screen belongs to. Absent means 1
   *  (seat 0), which is every solo game and the host. The guest's
   *  screen passes its own seat's player id so "You", the secrecy
   *  rules, the log filters and the standings all pivot on the right
   *  seat. A callback, not a constant: the guest learns its seat from
   *  the start snapshot, after createHud has run. */
  localPlayerId?(): number;
  /** The display name of the human behind this faction, or null. Drawn
   *  beside the faction in the scoreboard. Plain text, not a segment -
   *  the rich-text rule covers card and faction names only. */
  playerNameOf?(factionId: string): string | null;
```

  Also on the `Hud` interface (src/hud.ts:83):

```ts
  /** Renders "Waiting for <faction> (<name>)..." in the status bar
   *  while a remote seat holds the turn; null clears it. The faction
   *  is a segment (it lights the map like any faction name); the
   *  player name is plain text. */
  setWaiting(factionId: string | null, playerName?: string): void;
```

- [ ] **Step 1: Establish the one read**

Inside `createHud`, right after the callbacks parameter is in scope,
add:

```ts
  const localPlayerId = (): number => cb.localPlayerId?.() ?? 1;
```

Module-level functions outside `createHud` that contain a listed site
gain a `localPlayerId: number` parameter, threaded from this one read
at their call sites. Two worked examples of the mechanical pattern:

Site hud.ts:215 (the "You" speaker):

```ts
// before
if (e.playerId === 1) return { segments: [t("You")], person: "second" };
// after - the enclosing function gains `localPlayerId: number`
if (e.playerId === localPlayerId) return { segments: [t("You")], person: "second" };
```

Site hud.ts:286 (the derived faction):

```ts
// before
const humanFactionId = state.players.find((pl) => pl.id === 1)?.factionId;
// after
const humanFactionId = state.players.find((pl) => pl.id === localPlayerId)?.factionId;
```

`state.players[0]` sites become
`state.players.find((pl) => pl.id === localPlayerId)` (or index lookup
via the id, whichever the site already shapes toward). Do NOT rename
existing local variables like `human`/`humanFactionId` - the diff
stays reviewable and the meaning ("the local player") is unchanged.

- [ ] **Step 2: Verify no site remains**

Run: `grep -n "players\[0\]\|playerId === 1\|pl.id === 1" src/hud.ts`
Expected: no output.

- [ ] **Step 3: Add `setWaiting` and the scoreboard name**

`setWaiting` renders into the existing `status` element the same way
`setPinned` does (see src/hud.ts:1996), with segments:

```ts
    setWaiting(factionId, playerName) {
      // Renders beside/instead of the ordinary status content while a
      // remote seat holds the turn. Null clears back to the normal
      // status rendering.
      if (factionId === null) { /* clear, re-render normal status */ }
      else {
        renderSegments(statusTarget, [
          t("Waiting for "), faction(factionId),
          t(playerName !== undefined ? ` (${playerName})...` : "..."),
        ], hooks);
      }
    },
```

(Adapt `statusTarget`/`hooks` to the file's existing status-rendering
plumbing at src/hud.ts:1996 - the point is: faction as a segment,
name as plain text, one clear/set pair, no second status element.)

Scoreboard (row construction near src/hud.ts:1766): after the faction
segment of a row, if `cb.playerNameOf?.(factionId)` returns a name,
append a plain text node `" (" + name + ")"`.

- [ ] **Step 4: Write the guest-perspective test**

Add to `tests/hud.test.ts`, reusing that file's existing createHud
setup helper (it already runs under happy-dom). The test builds a
4-faction game where player id 2 (seat 1, "beta") is the local player,
and asserts the two behaviours that MUST flip with the seat:

Build the state and hud with the file's existing helpers (the suite
already constructs a `GameState` and calls `createHud` under
happy-dom; reuse that setup verbatim, adding the new callback). The
two behaviours under test, with the assertion shape spelled out - only
the setup plumbing comes from the existing helpers:

```ts
describe("localPlayerId", () => {
  it("a hud for player 2 says You for player 2 and hides player 1's secret plays", () => {
    // State: log holds a play by playerId 2 of an ordinary card, and
    // a play by playerId 1 of a secret card. Use a card id from the
    // secret-set literal pinned in tests/cards.test.ts - no guessing.
    // Hud created with: localPlayerId: () => 2.
    const logText = root.querySelector(".log")!.textContent!;
    expect(logText).toContain("You");            // player 2's own play
    expect(logText).toContain("a secret card");  // player 1's play hidden
    expect(logText).not.toContain(CARDS[secretId].name);
  });

  it("defaults to player 1 when the callback is absent", () => {
    // Same state, hud created WITHOUT localPlayerId: player 1's secret
    // play is their own, so it renders with its real card name.
    const logText = root.querySelector(".log")!.textContent!;
    expect(logText).toContain(CARDS[secretId].name);
  });
});
```

(`.log` stands for whatever selector the surrounding hud tests already
use to read log lines - copy theirs, and mind that `hidesItsCard`
keys on the PLAY event's renderer, so drive the log through
`hud.update` the way the neighbouring tests do.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, including `tests/rng-isolation.test.ts` and
`tests/naming-convention.test.ts`, both untouched. Any hud test that
fails is a threading mistake in Step 1 - the default path must be
byte-identical to today.

- [ ] **Step 6: Build, then commit**

Run: `npm run build`

```bash
git add src/hud.ts tests/hud.test.ts
git commit -m "refactor(hud): the local player is a parameter, not seat 0"
```

---

### Task 4: localPlayerId in notices.ts, xp.ts; localSeat in main.ts

**Files:**
- Modify: `src/notices.ts` (sites at lines 153, 185, 526, 842, 848),
  `src/xp.ts` (lines 100, 106), `src/main.ts` (the fifteen
  `game.players[0]` sites listed below plus `isHumanTurn` call sites)
- Test: existing suites (`tests/notices.test.ts` if present,
  `tests/game.test.ts` uses runXp/runTurnips defaults)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `runXp(log: GameEvent[], localPlayerId = 1): number` and
    `runTurnips(log: GameEvent[], localPlayerId = 1): number` in
    src/xp.ts - defaulted, so every existing caller compiles
    unchanged.
  - The notices entry points that hud calls (`buildRoundSummary`,
    `walkCtxOf`, the `NOTICE_RULES` predicates that read
    `e.playerId === 1`) gain a threaded `localPlayerId: number`
    parameter (defaulted to 1 where it keeps existing tests
    compiling). hud passes its `localPlayerId()` value through.
  - In src/main.ts: `let localSeat = 0;` plus
    `function localHuman() { return game.players[localSeat]; }` and
    `function isLocalTurn(): boolean { return game.phase === "playing" && game.current === localSeat; }`.
    Task 10 sets `localSeat` for the guest; solo and host keep 0.

- [ ] **Step 1: xp.ts**

```ts
export function runXp(log: GameEvent[], localPlayerId = 1): number {
  return log.reduce(
    (sum, e) => sum + (e.playerId === localPlayerId ? xpForEvent(e) : 0), 0,
  );
}

export function runTurnips(log: GameEvent[], localPlayerId = 1): number {
  return log.filter(
    (e) =>
      e.type === "play" && e.playerId === localPlayerId &&
      e.cardId === "grow-crops",
  ).length;
}
```

(Match the file's existing bodies exactly - the only change is the
parameter replacing the literal 1.)

- [ ] **Step 2: notices.ts**

Same mechanical pattern as Task 3: each function containing a listed
site gains `localPlayerId: number`, threaded from its callers (which
are in hud.ts, where `localPlayerId()` already exists after Task 3).
`NOTICE_RULES` is a const record of per-event-type rules; where a rule
closure reads `e.playerId === 1` (lines 526, 842, 848), change the
closure's signature to receive `localPlayerId` and update the one
place hud invokes those rule members to pass it. Do not restructure
NOTICE_RULES - it is an exhaustive Record and must stay one.

Verify: `grep -n "playerId === 1" src/notices.ts src/xp.ts`
Expected: no output.

- [ ] **Step 3: main.ts localSeat**

Add near the other module state (beside `let resolving = false;`,
src/main.ts:228):

```ts
/** The seat this screen plays. 0 for solo and host; the guest learns
 *  its seat from the start snapshot. Presentation only - the engine's
 *  humanSeat stays the host's seat 0. */
let localSeat = 0;

function localHuman() {
  return game.players[localSeat];
}

function isLocalTurn(): boolean {
  return game.phase === "playing" && game.current === localSeat;
}
```

Replace every `const human = game.players[0];` in main.ts (lines 239,
248, 296, 393, 493, 578, 609, 724, 795, 896, 930, 957, 1173, 1223,
1250) with `const human = localHuman();`. Replace `isHumanTurn(game)`
call sites in main.ts with `isLocalTurn()` (the import can go once no
site uses it). `bankRunProgress` (src/main.ts:1062) passes the local
player id through:

```ts
  const me = localHuman();
  meta = bankRun(
    meta,
    runXp(game.log, me?.id ?? 1),
    runTurnips(game.log, me?.id ?? 1),
  );
```

Leave `src/boot-params.ts` untouched (its players[0] reads are
solo-boot by design).

Verify: `grep -n "players\[0\]" src/main.ts src/notices.ts` - no
output; `grep -rn "players\[0\]\|playerId === 1" src/ | grep -v boot-params` - no output.

- [ ] **Step 4: Run the full suite and the replay fixture explicitly**

Run: `npm test && npx vitest run tests/rng-isolation.test.ts`
Expected: PASS with the baseline NOT re-frozen. This refactor must not
change a single behaviour at localSeat 0.

- [ ] **Step 5: Build, then commit**

Run: `npm run build`

```bash
git add src/notices.ts src/xp.ts src/main.ts
git commit -m "refactor: localPlayerId through notices and xp, localSeat in main"
```

---

### Task 5: PeerJS binding

**Files:**
- Create: `src/net.ts`
- Modify: `package.json` (+ lockfile)

**Interfaces:**
- Consumes: `Wire`, `NetMessage` from src/net-protocol.ts.
- Produces (used only by Task 10's main.ts integration):
  - `hostPeer(cb: { onOpen(id: string): void; onWire(wire: Wire): void; onError(reason: string): void }): { close(): void }`
  - `joinPeer(hostId: string, cb: { onWire(wire: Wire): void; onError(reason: string): void }): { close(): void }`

No unit test: this file is the thin peerjs boundary and everything
testable lives behind `Wire`. It is exercised by the Task 11 two-tab
acceptance run. Keep it free of game imports.

- [ ] **Step 1: Add the dependency**

Run: `npm install peerjs@^1.5.4`
Expected: package.json gains its first `dependencies` entry;
`npm run build` still passes (peerjs ships its own types).

- [ ] **Step 2: Write the implementation**

```ts
// src/net.ts
import Peer, { type DataConnection } from "peerjs";
import type { NetMessage, Wire } from "./net-protocol";

/** WebRTC connections can half-die without firing close, so the wire
 *  pings and declares death on silence. Both numbers are generous for
 *  a turn-based game. */
const PING_EVERY_MS = 5000;
const DEAD_AFTER_MS = 15000;

function wrap(conn: DataConnection): Wire {
  const msgFns: ((m: NetMessage) => void)[] = [];
  const closeFns: (() => void)[] = [];
  let lastSeen = Date.now();
  let closed = false;
  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try {
      conn.close();
    } catch {
      // already closing; nothing to do
    }
    for (const fn of closeFns) fn();
  };
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > DEAD_AFTER_MS) {
      shutdown();
      return;
    }
    if (conn.open) conn.send({ type: "ping" } satisfies NetMessage);
  }, PING_EVERY_MS);
  conn.on("data", (raw) => {
    lastSeen = Date.now();
    const msg = raw as NetMessage;
    if (msg.type === "ping") {
      if (conn.open) conn.send({ type: "pong" } satisfies NetMessage);
      return;
    }
    if (msg.type === "pong") return;
    for (const fn of msgFns) fn(msg);
  });
  conn.on("close", shutdown);
  conn.on("error", shutdown);
  return {
    send(m) {
      if (conn.open) conn.send(m);
    },
    onMessage(fn) {
      msgFns.push(fn);
    },
    onClose(fn) {
      closeFns.push(fn);
    },
    close: shutdown,
  };
}

/** Opens a Peer on the public PeerJS cloud broker and reports its id
 *  (the join link's payload). Every incoming connection is wrapped and
 *  handed over - mid-game that is the guest rejoining, and the session
 *  layer decides what that means. The Peer stays open for the whole
 *  session so the link keeps working. */
export function hostPeer(cb: {
  onOpen(id: string): void;
  onWire(wire: Wire): void;
  onError(reason: string): void;
}): { close(): void } {
  const peer = new Peer();
  peer.on("open", (id) => cb.onOpen(id));
  peer.on("connection", (conn) => {
    conn.on("open", () => cb.onWire(wrap(conn)));
  });
  peer.on("error", (err) => cb.onError(String(err)));
  return { close: () => peer.destroy() };
}

export function joinPeer(hostId: string, cb: {
  onWire(wire: Wire): void;
  onError(reason: string): void;
}): { close(): void } {
  const peer = new Peer();
  peer.on("open", () => {
    const conn = peer.connect(hostId, { reliable: true });
    conn.on("open", () => cb.onWire(wrap(conn)));
    conn.on("error", (err) => cb.onError(String(err)));
  });
  peer.on("error", (err) => cb.onError(String(err)));
  return { close: () => peer.destroy() };
}
```

- [ ] **Step 3: Gates, then commit**

Run: `npm test && npm run build`

```bash
git add src/net.ts package.json package-lock.json
git commit -m "feat(net): peerjs binding - peers, wrapped connections, heartbeat"
```

---

### Task 6: Host session driver

**Files:**
- Create: `src/net-host.ts`
- Test: `tests/net-pipe.test.ts` (started here, grown in Tasks 7-8)

**Interfaces:**
- Consumes: `Wire`, `NetMessage`, `NetAction`, `PROTOCOL_VERSION`,
  `cardSetHash`, `validateAction`, `applyNetAction`, `buildUpdate`,
  `seatOfFaction` from net-protocol; `serializeGame` from net-codec;
  `GameState`, `Rng`, `RuleSelections`.
- Produces (used by Task 10 and the pipe tests):

```ts
export interface HostDeps {
  getGame(): GameState;
  setGame(g: GameState): void;
  rng: Rng;
  name: string;
  rules(): RuleSelections;
  /** Host's chosen faction, or null before the map click. Drives the
   *  lobby's takenFactionId. */
  hostFactionId(): string | null;
  onGuestHello(name: string): void;
  onGuestPick(pick: { deck: string[]; factionId: string }): void;
  /** A valid guest action was applied and pushed; main.ts continues
   *  the chain (advance + AI seats) from here. */
  onGuestAction(): void;
  onClosed(): void;
}

export interface HostSession {
  guestName(): string | null;
  guestPick(): { deck: string[]; factionId: string } | null;
  guestFactionId(): string | null;
  /** Call once pickFaction has dealt: records the guest's faction,
   *  sends the start snapshot, and marks the whole log as sent. */
  markStarted(guestFactionId: string): void;
  /** Send the state delta since the last send. Call after every
   *  host-side change the guest must see. Cheap when nothing moved. */
  pushUpdate(): void;
  /** Re-announce the lobby (rules + taken faction) - on hello and
   *  whenever the host's pick changes. */
  sendLobby(): void;
  close(): void;
}

export function createHostSession(wire: Wire, deps: HostDeps): HostSession
```

- [ ] **Step 1: Write the failing tests** (in `tests/net-pipe.test.ts`)

```ts
// tests/net-pipe.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn, chooseAction } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import {
  cardSetHash, PROTOCOL_VERSION, seatOfFaction, wirePair,
  type NetMessage,
} from "../src/net-protocol";
import { createHostSession, type HostDeps } from "../src/net-host";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A host harness over one wire: real deps wired to a mutable game. */
function makeHost(rng: Rng) {
  const [hostWire, guestWire] = wirePair();
  let game: GameState = startGame(newGame(FACTIONS));
  game = chooseDeck(game, buildDeck());
  const picks: { deck: string[]; factionId: string }[] = [];
  const deps: HostDeps = {
    getGame: () => game,
    setGame: (g) => { game = g; },
    rng,
    name: "Hosta",
    rules: () => ({ turn: "standard" }),
    hostFactionId: () => "alpha",
    onGuestHello: () => {},
    onGuestPick: (p) => picks.push(p),
    onGuestAction: () => {},
    onClosed: () => {},
  };
  const session = createHostSession(hostWire, deps);
  return {
    session, guestWire, picks, deps,
    game: () => game, setGame: (g: GameState) => { game = g; },
  };
}

function collect(wire: { onMessage(fn: (m: NetMessage) => void): void }) {
  const got: NetMessage[] = [];
  wire.onMessage((m) => got.push(m));
  return got;
}

describe("host session", () => {
  it("answers hello with hello + lobby, and refuses a version mismatch", () => {
    const h = makeHost(seededRng(1));
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    expect(got.map((m) => m.type)).toEqual(["hello", "lobby-host"]);
    expect(h.session.guestName()).toBe("Gusta");

    const h2 = makeHost(seededRng(1));
    const got2 = collect(h2.guestWire);
    h2.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION + 1, cards: cardSetHash(),
      name: "Gusta",
    });
    expect(got2.map((m) => m.type)).toEqual(["refuse"]);
  });

  it("rejects a guest pick of the host's own faction", () => {
    const h = makeHost(seededRng(1));
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "alpha" });
    expect(got.some((m) => m.type === "reject")).toBe(true);
    expect(h.picks).toEqual([]);
  });

  it("applies a valid guest action, rejects an out-of-turn one, and streams updates", () => {
    const rng = seededRng(2);
    const h = makeHost(rng);
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "gamma" });
    // Deal on the host exactly as main.ts will: guest deck override.
    const pick = h.picks[0];
    let g = pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck()));
    h.setGame(g);
    h.session.markStarted(pick.factionId);
    expect(got.at(-1)?.type).toBe("start");

    // Guest acts out of turn (current is seat 0): rejected.
    const guestSeat = seatOfFaction(h.game(), "gamma");
    h.guestWire.send({
      type: "action", turn: h.game().turn, seat: guestSeat,
      action: { type: "discard", cardIndex: 0, cardId: h.game().players[guestSeat].hand[0] },
    });
    expect(got.at(-1)?.type).toBe("reject");

    // Advance host-side to the guest's seat (host + one AI take turns).
    g = h.game();
    while (g.current !== guestSeat) {
      g = advance(aiTakeTurn(g, rng), rng);
    }
    h.setGame(g);
    h.session.pushUpdate();
    expect(got.at(-1)?.type).toBe("update");

    // Now a real action from the policy, with the honest cardId.
    const a = chooseAction(h.game());
    const hand = h.game().players[guestSeat].hand;
    h.guestWire.send({
      type: "action", turn: h.game().turn, seat: guestSeat,
      action: a.type === "play"
        ? { type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
            ...(a.targetId !== undefined ? { targetId: a.targetId } : {}) }
        : { type: "discard", cardIndex: a.cardIndex, cardId: hand[a.cardIndex] },
    });
    // A valid action produces an update (the state moved).
    expect(got.at(-1)?.type).toBe("update");
    expect(h.game().playedThisTurn).toBe(true);
  });

  it("greets a mid-game hello with a snapshot (rejoin)", () => {
    const rng = seededRng(3);
    const h = makeHost(rng);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "beta" });
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    // A second hello mid-game is the guest coming back.
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    const snap = got.find((m) => m.type === "snapshot");
    expect(snap).toBeDefined();
    if (snap?.type === "snapshot") {
      expect(snap.guestFactionId).toBe("beta");
      expect(snap.state.log.length).toBe(h.game().log.length);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/net-pipe.test.ts`
Expected: FAIL - cannot resolve `../src/net-host`. (Also confirm
`chooseAction` is exported from src/ai.ts; it is - src/ai.ts:193.)

- [ ] **Step 3: Write the implementation**

```ts
// src/net-host.ts
import type { GameState } from "./game";
import type { Rng } from "./cards";
import type { RuleSelections } from "./rules";
import { serializeGame } from "./net-codec";
import {
  applyNetAction, buildUpdate, cardSetHash, PROTOCOL_VERSION,
  seatOfFaction, validateAction, type NetMessage, type Wire,
} from "./net-protocol";

export interface HostDeps {
  getGame(): GameState;
  setGame(g: GameState): void;
  rng: Rng;
  name: string;
  rules(): RuleSelections;
  hostFactionId(): string | null;
  onGuestHello(name: string): void;
  onGuestPick(pick: { deck: string[]; factionId: string }): void;
  onGuestAction(): void;
  onClosed(): void;
}

export interface HostSession {
  guestName(): string | null;
  guestPick(): { deck: string[]; factionId: string } | null;
  guestFactionId(): string | null;
  markStarted(guestFactionId: string): void;
  pushUpdate(): void;
  sendLobby(): void;
  close(): void;
}

export function createHostSession(wire: Wire, deps: HostDeps): HostSession {
  let guestName: string | null = null;
  let guestPick: { deck: string[]; factionId: string } | null = null;
  let guestFactionId: string | null = null;
  /** Log events the guest already has; buildUpdate slices from here. */
  let sentLog = 0;

  const sendLobby = (): void => {
    wire.send({
      type: "lobby-host",
      rules: deps.rules(),
      takenFactionId: deps.hostFactionId(),
    });
  };

  const handle = (msg: NetMessage): void => {
    const g = deps.getGame();
    switch (msg.type) {
      case "hello": {
        if (msg.version !== PROTOCOL_VERSION || msg.cards !== cardSetHash()) {
          wire.send({
            type: "refuse",
            reason: "the two builds differ - reload both pages on the same version",
          });
          wire.close();
          return;
        }
        guestName = msg.name;
        wire.send({
          type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
          name: deps.name,
        });
        deps.onGuestHello(msg.name);
        if (g.phase === "playing" && guestFactionId !== null) {
          // The guest coming back mid-game: full state, log included.
          sentLog = g.log.length;
          wire.send({
            type: "snapshot", state: serializeGame(g), guestFactionId,
          });
        } else {
          sendLobby();
        }
        return;
      }
      case "lobby-guest": {
        if (!g.factionIds.includes(msg.factionId)) {
          wire.send({ type: "reject", reason: "unknown faction" });
          return;
        }
        if (msg.factionId === deps.hostFactionId()) {
          wire.send({ type: "reject", reason: "faction already taken" });
          return;
        }
        guestPick = { deck: msg.deck, factionId: msg.factionId };
        deps.onGuestPick(guestPick);
        return;
      }
      case "action": {
        const seat =
          guestFactionId === null ? -1 : seatOfFaction(g, guestFactionId);
        const err =
          msg.seat !== seat
            ? "not your seat"
            : validateAction(g, seat, msg.turn, msg.action);
        if (err !== null) {
          wire.send({ type: "reject", reason: err });
          return;
        }
        const next = applyNetAction(g, deps.rng, msg.action);
        if (next === g) {
          wire.send({ type: "reject", reason: "the rules refused that move" });
          return;
        }
        deps.setGame(next);
        pushUpdate();
        deps.onGuestAction();
        return;
      }
      // The host never receives these; ping/pong die in the wire wrap.
      case "refuse": case "lobby-host": case "start": case "update":
      case "snapshot": case "reject": case "ping": case "pong":
        return;
    }
  };

  const pushUpdate = (): void => {
    const g = deps.getGame();
    wire.send(buildUpdate(g, sentLog));
    sentLog = g.log.length;
  };

  wire.onMessage(handle);
  wire.onClose(deps.onClosed);

  return {
    guestName: () => guestName,
    guestPick: () => guestPick,
    guestFactionId: () => guestFactionId,
    markStarted(fid) {
      guestFactionId = fid;
      const g = deps.getGame();
      sentLog = g.log.length;
      wire.send({ type: "start", state: serializeGame(g), guestFactionId: fid });
    },
    pushUpdate,
    sendLobby,
    close: () => wire.close(),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/net-pipe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full gates, then commit**

Run: `npm test && npm run build`

```bash
git add src/net-host.ts tests/net-pipe.test.ts
git commit -m "feat(net): host session - lobby, action validation, updates, rejoin snapshot"
```

---

### Task 7: Guest session driver

**Files:**
- Create: `src/net-guest.ts`
- Test: `tests/net-pipe.test.ts` (additions)

**Interfaces:**
- Consumes: net-protocol (`applyUpdate`, `deserializeGame` via codec,
  hello constants), `Wire`.
- Produces (used by Task 10 and Task 8's full-game test):

```ts
export interface GuestDeps {
  name: string;
  onHostHello(name: string): void;
  onLobby(info: { rules: RuleSelections; takenFactionId: string | null }): void;
  /** Every state the guest should render: start, snapshot, update. */
  onState(g: GameState, guestFactionId: string): void;
  onReject(reason: string): void;
  /** Version/card-set mismatch: the session is over before it began. */
  onRefused(reason: string): void;
  onClosed(): void;
}

export interface GuestSession {
  hostName(): string | null;
  guestFactionId(): string | null;
  game(): GameState | null;
  sendPick(deck: string[], factionId: string): void;
  sendAction(a: NetAction): void;
  close(): void;
}

export function createGuestSession(wire: Wire, deps: GuestDeps): GuestSession
```

- [ ] **Step 1: Write the failing test** (append to tests/net-pipe.test.ts)

```ts
import { createGuestSession, type GuestDeps } from "../src/net-guest";

describe("guest session", () => {
  it("sends hello on creation, surfaces the lobby, and replicates start + updates", () => {
    const rng = seededRng(4);
    const h = makeHost(rng);
    const states: GameState[] = [];
    let lobby: { rules: unknown; takenFactionId: string | null } | null = null;
    const deps: GuestDeps = {
      name: "Gusta",
      onHostHello: () => {},
      onLobby: (info) => { lobby = info; },
      onState: (g) => states.push(g),
      onReject: () => {},
      onRefused: () => {},
      onClosed: () => {},
    };
    const guest = createGuestSession(h.guestWire, deps);
    expect(h.session.guestName()).toBe("Gusta"); // hello crossed on creation
    expect(lobby).not.toBeNull();

    guest.sendPick(buildDeck(), "delta");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    expect(guest.guestFactionId()).toBe("delta");
    expect(states.length).toBe(1);
    expect(states[0]).toEqual(h.game());

    // Host moves on; guest's replica follows and stays deep-equal.
    let g = h.game();
    for (let i = 0; i < 5 && g.phase === "playing"; i++) {
      g = advance(aiTakeTurn(g, rng), rng);
    }
    h.setGame(g);
    h.session.pushUpdate();
    expect(guest.game()).toEqual(h.game());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/net-pipe.test.ts`
Expected: FAIL - cannot resolve `../src/net-guest`.

- [ ] **Step 3: Write the implementation**

```ts
// src/net-guest.ts
import type { GameState } from "./game";
import type { RuleSelections } from "./rules";
import { deserializeGame } from "./net-codec";
import {
  applyUpdate, cardSetHash, PROTOCOL_VERSION, seatOfFaction,
  type NetAction, type NetMessage, type Wire,
} from "./net-protocol";

export interface GuestDeps {
  name: string;
  onHostHello(name: string): void;
  onLobby(info: { rules: RuleSelections; takenFactionId: string | null }): void;
  onState(g: GameState, guestFactionId: string): void;
  onReject(reason: string): void;
  onRefused(reason: string): void;
  onClosed(): void;
}

export interface GuestSession {
  hostName(): string | null;
  guestFactionId(): string | null;
  game(): GameState | null;
  sendPick(deck: string[], factionId: string): void;
  sendAction(a: NetAction): void;
  close(): void;
}

export function createGuestSession(wire: Wire, deps: GuestDeps): GuestSession {
  let hostName: string | null = null;
  let guestFactionId: string | null = null;
  let game: GameState | null = null;

  const handle = (msg: NetMessage): void => {
    switch (msg.type) {
      case "hello":
        hostName = msg.name;
        deps.onHostHello(msg.name);
        return;
      case "refuse":
        deps.onRefused(msg.reason);
        return;
      case "lobby-host":
        deps.onLobby({ rules: msg.rules, takenFactionId: msg.takenFactionId });
        return;
      case "start":
      case "snapshot":
        guestFactionId = msg.guestFactionId;
        game = deserializeGame(msg.state);
        deps.onState(game, guestFactionId);
        return;
      case "update":
        if (guestFactionId === null) return; // update before start: drop
        game = applyUpdate(game, msg);
        deps.onState(game, guestFactionId);
        return;
      case "reject":
        deps.onReject(msg.reason);
        return;
      // Guest never receives these; ping/pong die in the wire wrap.
      case "lobby-guest": case "action": case "ping": case "pong":
        return;
    }
  };

  wire.onMessage(handle);
  wire.onClose(deps.onClosed);
  wire.send({
    type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
    name: deps.name,
  });

  return {
    hostName: () => hostName,
    guestFactionId: () => guestFactionId,
    game: () => game,
    sendPick(deck, factionId) {
      wire.send({ type: "lobby-guest", deck, factionId });
    },
    sendAction(a) {
      if (game === null || guestFactionId === null) return;
      wire.send({
        type: "action", turn: game.turn,
        seat: seatOfFaction(game, guestFactionId), action: a,
      });
    },
    close: () => wire.close(),
  };
}
```

- [ ] **Step 4: Run to verify pass, full gates, commit**

Run: `npx vitest run tests/net-pipe.test.ts && npm test && npm run build`

```bash
git add src/net-guest.ts tests/net-pipe.test.ts
git commit -m "feat(net): guest session - replicated state, picks, actions"
```

---

### Task 8: Full game over the pipe, guest perspective, rejoin

**Files:**
- Test: `tests/net-pipe.test.ts` (additions only - if a test exposes a
  session bug, the fix goes in net-host.ts/net-guest.ts/net-protocol.ts)

**Interfaces:**
- Consumes: everything Tasks 6-7 produced, plus `formatLead` from
  `src/view.ts` and `leadOf` from `src/relations.ts` for the
  standings-from-the-guest-side assertion.

- [ ] **Step 1: Write the full-game test**

Append to tests/net-pipe.test.ts. The host harness mirrors what
main.ts will do: after every local action, advance and run AI seats
until the current seat is the host's or the guest's, then push.

```ts
import { formatLead } from "../src/view";
import { leadOf } from "../src/relations";
import { guestPhaseView } from "../src/net-protocol";

/** main.ts's resumeChain, distilled: run AI seats until a human
 *  (host seat 0 or guest) is on turn or the run ends. */
function runChain(
  g: GameState, rng: Rng, guestSeat: number,
): GameState {
  let out = g;
  while (
    out.phase === "playing" && out.current !== 0 && out.current !== guestSeat
  ) {
    out = advance(aiTakeTurn(out, rng), rng);
  }
  return out;
}

describe("a whole game over the pipe", () => {
  it("host and guest replicas agree for 15 rounds, and the guest's standings read from its own seat", () => {
    const rng = seededRng(11);
    const h = makeHost(rng);
    const states: GameState[] = [];
    const rejects: string[] = [];
    const guest = createGuestSession(h.guestWire, {
      name: "Gusta",
      onHostHello: () => {}, onLobby: () => {},
      onState: (g) => states.push(g),
      onReject: (r) => rejects.push(r),
      onRefused: () => {}, onClosed: () => {},
    });
    guest.sendPick(buildDeck(), "gamma");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    const guestSeat = seatOfFaction(h.game(), "gamma");

    for (let round = 0; round < 15 && h.game().phase === "playing"; round++) {
      // Host's turn: the policy plays it locally, then the chain runs
      // to the guest's seat, then push.
      if (h.game().current === 0) {
        h.setGame(advance(aiTakeTurn(h.game(), rng), rng));
      }
      h.setGame(runChain(h.game(), rng, guestSeat));
      h.session.pushUpdate();
      if (h.game().phase !== "playing") break;

      // Guest's turn: the guest decides FROM ITS OWN REPLICA, exactly
      // as the real client will.
      const rg = guest.game();
      expect(rg).toEqual(h.game());
      if (rg === null) throw new Error("no replica");
      const a = chooseAction(rg);
      const hand = rg.players[guestSeat].hand;
      guest.sendAction(a.type === "play"
        ? { type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
            ...(a.targetId !== undefined ? { targetId: a.targetId } : {}) }
        : { type: "discard", cardIndex: a.cardIndex, cardId: hand[a.cardIndex] });
      expect(rejects).toEqual([]); // every replica-derived action lands
      // Host continues the chain past the guest's committed turn.
      h.setGame(runChain(advance(h.game(), rng), rng, guestSeat));
      h.session.pushUpdate();
    }

    // Replicas agree to the end...
    expect(guest.game()).toEqual(h.game());
    // ...and the guest's standings are ITS signed lead, not the host's:
    const g = guest.game();
    if (g !== null && g.phase === "playing") {
      const other = "beta";
      const guestLead = leadOf(g.relations, "gamma", other);
      expect(formatLead("M", guestLead, null))
        .toBe(formatLead("M", leadOf(h.game().relations, "gamma", other), null));
      // The host's own view of the same pair may differ in sign; the
      // guest never renders that one.
    }
    // The guest's phase view maps the host-centric ending, if one came.
    if (g !== null && g.phase !== "playing") {
      expect(["victory", "defeat"]).toContain(guestPhaseView(g, "gamma"));
    }
  });

  it("a dropped guest rejoins over a fresh wire and resumes deep-equal", () => {
    const rng = seededRng(12);
    const h = makeHost(rng);
    const guest1 = createGuestSession(h.guestWire, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: () => {}, onReject: () => {}, onRefused: () => {},
      onClosed: () => {},
    });
    guest1.sendPick(buildDeck(), "beta");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    // Some turns pass, then the wire dies.
    const guestSeat = seatOfFaction(h.game(), "beta");
    h.setGame(runChain(advance(aiTakeTurn(h.game(), rng), rng), rng, guestSeat));
    h.guestWire.close();

    // main.ts re-wraps the guest's NEW connection into a NEW host
    // session over the same deps, resuming the started faction.
    const [hostWire2, guestWire2] = wirePair();
    createHostSession(hostWire2, h.deps, { guestFactionId: "beta" });
    const states: GameState[] = [];
    const guest2 = createGuestSession(guestWire2, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: (g) => states.push(g), onReject: () => {},
      onRefused: () => {}, onClosed: () => {},
    });
    expect(states.length).toBe(1); // the mid-game hello got a snapshot
    expect(guest2.game()).toEqual(h.game());
    expect(guest2.guestFactionId()).toBe("beta");
  });
});
```

The test names a real interface need: **rejoin arrives on a NEW
session object** (new wire, new `createHostSession`), so the session
must be constructable already-knowing the guest's faction. Add the
optional third parameter to net-host.ts:

```ts
export function createHostSession(
  wire: Wire, deps: HostDeps,
  /** Rejoin: the game is already dealt and this is the guest's
   *  faction, so the next hello gets a snapshot, not a lobby. */
  resume?: { guestFactionId: string },
): HostSession {
  // ...the one change inside:
  let guestFactionId: string | null = resume?.guestFactionId ?? null;
```

- [ ] **Step 2: Run, fix, pass**

Run: `npx vitest run tests/net-pipe.test.ts`
Expected: PASS after adding the `resume` parameter to net-host.ts.
Failures worth expecting: `rejects` non-empty means validateAction and
the replica disagree - by construction they cannot unless an update
was missed; find the missing pushUpdate, do not weaken the assertion.

- [ ] **Step 3: Full gates, then commit**

Run: `npm test && npm run build`

```bash
git add src/net-host.ts tests/net-pipe.test.ts
git commit -m "test(net): full game over the pipe, guest-side standings, rejoin resume"
```

---

### Task 9: Join panel UI and the join URL param

**Files:**
- Create: `src/net-ui.ts`
- Modify: `src/style.css`
- Test: `tests/boot-params.test.ts` (one addition)

**Interfaces:**
- Consumes: `MetaStorage` from src/meta.ts (for the name pref).
- Produces (wired by Task 10):

```ts
export const NET_NAME_KEY = "balticmap-net-name";

export interface NetPanel {
  root: HTMLElement;
  name(): string;
  setVisible(v: boolean): void;
  setStatus(text: string): void;      // one status line; "" clears
  showInvite(link: string, peerId: string): void;
  showReconnect(fn: () => void): void; // guest-side drop
  hideReconnect(): void;
}

export function createNetPanel(
  app: HTMLElement,
  hooks: { onHost(): void; onJoin(hostId: string): void },
  storage: MetaStorage,
  defaultName: string,               // "Host" or "Guest"
): NetPanel
```

- [ ] **Step 1: Add the boot-param guard test**

Append to tests/boot-params.test.ts:

```ts
it("a URL naming only join is not a boot param - the player's page stays untouched", () => {
  expect(parseBootParams("?join=abc123")).toBeNull();
});
```

Run: `npx vitest run tests/boot-params.test.ts`
Expected: PASS already (join is not in BOOT_KEYS). The test pins the
property so a future BOOT_KEYS edit cannot silently break the join
link's storage behaviour.

- [ ] **Step 2: Write the panel**

```ts
// src/net-ui.ts
import type { MetaStorage } from "./meta";

export const NET_NAME_KEY = "balticmap-net-name";

export interface NetPanel {
  root: HTMLElement;
  name(): string;
  setVisible(v: boolean): void;
  setStatus(text: string): void;
  showInvite(link: string, peerId: string): void;
  showReconnect(fn: () => void): void;
  hideReconnect(): void;
}

/** The "Play with a friend" panel: host button, join field, name
 *  field, status line, invite link. Rudimentary by design - plain
 *  imperative DOM like the rest of the app. Player names are plain
 *  text; no card or faction name is ever rendered here, which is what
 *  keeps this file outside the rich-text rule. */
export function createNetPanel(
  app: HTMLElement,
  hooks: { onHost(): void; onJoin(hostId: string): void },
  storage: MetaStorage,
  defaultName: string,
): NetPanel {
  const root = document.createElement("div");
  root.className = "net-panel hidden";

  const title = document.createElement("div");
  title.className = "net-title";
  title.textContent = "Play with a friend";

  const nameRow = document.createElement("label");
  nameRow.className = "net-row";
  nameRow.textContent = "Your name ";
  const nameInput = document.createElement("input");
  nameInput.className = "net-name";
  nameInput.value = storage.getItem(NET_NAME_KEY) ?? defaultName;
  nameInput.addEventListener("change", () => {
    storage.setItem(NET_NAME_KEY, nameInput.value.trim());
  });
  nameRow.appendChild(nameInput);

  const hostBtn = document.createElement("button");
  hostBtn.className = "net-host";
  hostBtn.textContent = "Host a game";
  hostBtn.addEventListener("click", hooks.onHost);

  const joinRow = document.createElement("div");
  joinRow.className = "net-row";
  const joinInput = document.createElement("input");
  joinInput.className = "net-join-id";
  joinInput.placeholder = "Paste an invite link or id";
  const joinBtn = document.createElement("button");
  joinBtn.className = "net-join";
  joinBtn.textContent = "Join";
  joinBtn.addEventListener("click", () => {
    const raw = joinInput.value.trim();
    if (raw.length === 0) return;
    // A pasted full link carries the id as its join param.
    const fromUrl = /[?&]join=([^&]+)/.exec(raw)?.[1];
    hooks.onJoin(fromUrl !== undefined ? decodeURIComponent(fromUrl) : raw);
  });
  joinRow.append(joinInput, joinBtn);

  const invite = document.createElement("div");
  invite.className = "net-invite hidden";

  const status = document.createElement("div");
  status.className = "net-status";

  const reconnectBtn = document.createElement("button");
  reconnectBtn.className = "net-reconnect hidden";
  reconnectBtn.textContent = "Reconnect";
  let reconnectFn: (() => void) | null = null;
  reconnectBtn.addEventListener("click", () => reconnectFn?.());

  root.append(title, nameRow, hostBtn, joinRow, invite, status, reconnectBtn);
  app.appendChild(root);

  /** One copyable value with its Copy button. */
  const copyRow = (label: string, value: string): HTMLElement => {
    const row = document.createElement("div");
    row.className = "net-copy-row";
    const text = document.createElement("code");
    text.textContent = value;
    const btn = document.createElement("button");
    btn.textContent = `Copy ${label}`;
    btn.addEventListener("click", () => {
      void navigator.clipboard.writeText(value);
    });
    row.append(text, btn);
    return row;
  };

  return {
    root,
    name: () =>
      (nameInput.value.trim().length > 0 ? nameInput.value.trim() : defaultName),
    setVisible(v) {
      root.classList.toggle("hidden", !v);
    },
    setStatus(text) {
      status.textContent = text;
    },
    showInvite(link, peerId) {
      invite.replaceChildren(copyRow("link", link), copyRow("id", peerId));
      invite.classList.remove("hidden");
      hostBtn.classList.add("hidden");
      joinRow.classList.add("hidden");
    },
    showReconnect(fn) {
      reconnectFn = fn;
      reconnectBtn.classList.remove("hidden");
    },
    hideReconnect() {
      reconnectFn = null;
      reconnectBtn.classList.add("hidden");
    },
  };
}
```

- [ ] **Step 3: Style it**

Append to src/style.css. The panel is a dark box, so it DECLARES its
text colour (the AGENTS.md dark-box rule):

```css
/* "Play with a friend" panel - a dark box, so it states its own
   colour; see the dark-box rule in AGENTS.md. */
.net-panel {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 30;
  background: #1b1710;
  color: #e8ddc8;
  border: 1px solid #4a4032;
  border-radius: 6px;
  padding: 10px 12px;
  max-width: 320px;
  font-size: 13px;
}
.net-panel.hidden { display: none; }
.net-panel .net-title { font-weight: 600; margin-bottom: 6px; }
.net-panel .net-row { display: flex; gap: 6px; margin: 4px 0; align-items: center; }
.net-panel input {
  flex: 1;
  min-width: 0;
  background: #2a241a;
  color: #e8ddc8;
  border: 1px solid #4a4032;
  border-radius: 4px;
  padding: 3px 6px;
}
.net-panel button {
  background: #3a3226;
  color: #e8ddc8;
  border: 1px solid #5a4f3d;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
}
.net-panel .net-copy-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 4px 0;
}
.net-panel .net-copy-row code {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.net-panel .net-status { margin-top: 6px; min-height: 1em; opacity: 0.9; }
.net-panel .hidden { display: none; }
```

- [ ] **Step 4: Gates, then commit**

Run: `npm test && npm run build`

```bash
git add src/net-ui.ts src/style.css tests/boot-params.test.ts
git commit -m "feat(net): join panel - host, join by link or id, names, status"
```

---

### Task 10: main.ts integration - host mode, guest mode, names, drops

This is the largest task. Everything below goes in `src/main.ts`
unless said otherwise; it wires Tasks 1-9 into the live app.

**Files:**
- Modify: `src/main.ts`, `src/hud.ts` (only if `setWaiting` needs a
  hook missed in Task 3), `src/deck-screen.ts` (only if the rules
  picker needs a disabled state - see step 6)
- Test: none new (this layer is main.ts, which has no test reach; the
  pipe tests cover the logic, Task 11 covers the wiring)

**Interfaces:**
- Consumes: everything produced by Tasks 1-9.
- Produces: the running feature.

- [ ] **Step 1: Mode state and controller**

Near `let localSeat = 0;`:

```ts
import { createHostSession, type HostSession } from "./net-host";
import { createGuestSession, type GuestSession } from "./net-guest";
import { hostPeer, joinPeer } from "./net";
import { createNetPanel } from "./net-ui";
import {
  guestPhaseView, seatOfFaction, type NetAction, type Wire,
} from "./net-protocol";

type NetState =
  | { role: "solo" }
  | {
      role: "host";
      session: HostSession | null; // null between drop and rejoin
      hostPick: string | null;     // host's chosen faction pre-deal
      guestSeat: number | null;    // set at deal time
      peerId: string | null;
    }
  | {
      role: "guest";
      session: GuestSession | null;
      hostId: string;
      deckCards: string[] | null;  // chosen deck, until start
      faction: string | null;      // set by start/snapshot
    };

let net: NetState = { role: "solo" };

function controllerOf(seat: number): "local" | "remote" | "ai" {
  if (seat === localSeat) return "local";
  if (net.role === "host" && seat === net.guestSeat) return "remote";
  return "ai";
}
```

- [ ] **Step 2: The chain runs by controller, not by seat 0**

Replace the body of `afterHumanAction` (src/main.ts:1080) and add
`resumeChain`:

```ts
/** Runs AI seats until a human-controlled seat (local or remote) is on
 *  turn or the run ends, then settles the screen. The host also pushes
 *  the settled state to the guest and shows who it is waiting for. */
function resumeChain(): void {
  let iterations = 0;
  while (game.phase === "playing" && controllerOf(game.current) === "ai") {
    if (++iterations > 1000) {
      console.error("AI chain stalled - breaking");
      break;
    }
    game = advance(aiTakeTurn(game, rng), rng);
  }
  if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
  if (net.role === "host") net.session?.pushUpdate();
  resolving =
    game.phase === "playing" && controllerOf(game.current) === "remote";
  refresh();
  updateWaitingStatus();
}

function afterHumanAction(): void {
  harvestRoll = null;
  game = advance(game, rng);
  if (game.phase === "victory" || game.phase === "defeat") bankRunProgress();
  if (net.role === "host") net.session?.pushUpdate();
  refresh();
  if (game.phase !== "playing" || controllerOf(game.current) === "local") {
    updateWaitingStatus();
    return;
  }
  resolving = true;
  hud.afterPlayAnimation(() => {
    resumeChain();
  });
}
```

`updateWaitingStatus` drives the hud's waiting line and the panel:

```ts
function updateWaitingStatus(): void {
  const remote =
    game.phase === "playing" && controllerOf(game.current) === "remote";
  if (remote && net.role === "host") {
    const fid = game.players[game.current].factionId;
    hud.setWaiting(fid, net.session?.guestName() ?? undefined);
  } else if (
    net.role === "guest" && game.phase === "playing" && !isLocalTurn()
  ) {
    // Everything between the guest's turns is "the host's world moving".
    hud.setWaiting(null); // the log itself shows what is happening
  } else {
    hud.setWaiting(null);
  }
}
```

- [ ] **Step 3: Hosting**

The panel and peer wiring, after `createHud`/`createDeckScreen`:

```ts
const netPanel = createNetPanel(app, {
  onHost() {
    if (net.role !== "solo") return;
    netPanel.setStatus("Getting an id from the broker...");
    const peer = hostPeer({
      onOpen(id) {
        net = {
          role: "host", session: null, hostPick: null, guestSeat: null,
          peerId: id,
        };
        const link = `${window.location.origin}${window.location.pathname}?join=${id}`;
        netPanel.showInvite(link, id);
        netPanel.setStatus("Waiting for a friend to join...");
      },
      onWire(wire) {
        if (net.role !== "host") return;
        attachHostWire(wire);
      },
      onError(reason) {
        netPanel.setStatus(`Connection error: ${reason}`);
      },
    });
    void peer; // held by closure; the Peer lives for the session
  },
  onJoin(hostId) {
    startJoin(hostId);
  },
}, storage, "Player");
netPanel.setVisible(game.phase === "main-menu");
```

`attachHostWire` creates the session (fresh or resumed):

```ts
function attachHostWire(wire: Wire): void {
  if (net.role !== "host") return;
  const startedFaction =
    net.guestSeat !== null ? game.players[net.guestSeat].factionId : null;
  const session = createHostSession(wire, {
    getGame: () => game,
    setGame: (g) => { game = g; },
    rng,
    name: netPanel.name(),
    rules: () => rulesPrefs,
    hostFactionId: () => (net.role === "host" ? net.hostPick : null),
    onGuestHello(name) {
      netPanel.setStatus(`${name} is connected.`);
      netPanel.hideReconnect();
      refresh();
    },
    onGuestPick() {
      tryDeal();
    },
    onGuestAction() {
      // The guest's play is committed and pushed; run the world past it.
      game = advance(game, rng);
      resumeChain();
    },
    onClosed() {
      if (net.role !== "host") return;
      net.session = null;
      resolving = game.phase === "playing";
      netPanel.setVisible(true);
      netPanel.setStatus(
        "Your friend disconnected. The game is paused until they rejoin with the same link.",
      );
    },
  }, startedFaction !== null ? { guestFactionId: startedFaction } : undefined);
  net.session = session;
  netPanel.setStatus("Connected.");
}
```

`tryDeal` runs when either pick lands (host's map click or the guest's
lobby message):

```ts
/** Deals once both humans have picked. The guest's deck rides in via
 *  pickFaction's aiDeckFor override - its seat is built from the deck
 *  the guest chose out of its own collection. */
function tryDeal(): void {
  if (net.role !== "host" || net.session === null) return;
  const pick = net.session.guestPick();
  if (net.hostPick === null || pick === null) return;
  if (game.phase !== "pick-faction") return;
  game = pickFaction(game, net.hostPick, rng, (r, fid) =>
    fid === pick.factionId ? pick.deck : buildAiDeck(r),
  );
  net.guestSeat = seatOfFaction(game, pick.factionId);
  net.session.markStarted(pick.factionId);
  netPanel.setVisible(false);
  refresh();
  updateWaitingStatus();
}
```

(`buildAiDeck` needs importing from "./cards" in main.ts.)

The host's faction click: in `interceptClick`'s pick-faction branch
(src/main.ts:1418), in host mode the click STORES the pick instead of
dealing immediately:

```ts
    if (game.phase === "pick-faction") {
      if (regionId === null) return true;
      const fid = regionById.get(regionId)!.faction;
      if (net.role === "host") {
        if (fid === net.session?.guestPick()?.factionId) return true; // taken
        net.hostPick = fid;
        net.session?.sendLobby();
        tryDeal();
        return true;
      }
      if (net.role === "guest") {
        guestPickFaction(fid);
        return true;
      }
      game = pickFaction(game, fid, rng);
      refresh();
      return true;
    }
```

- [ ] **Step 4: Joining**

```ts
function startJoin(hostId: string): void {
  if (boot !== null) {
    netPanel.setStatus("Join links cannot carry test boot params.");
    return;
  }
  netPanel.setStatus("Connecting...");
  const peer = joinPeer(hostId, {
    onWire(wire) {
      attachGuestWire(wire, hostId);
    },
    onError(reason) {
      netPanel.setStatus(`Could not connect: ${reason}`);
      netPanel.showReconnect(() => startJoin(hostId));
    },
  });
  void peer;
}

function attachGuestWire(wire: Wire, hostId: string): void {
  const prev = net.role === "guest" ? net : null;
  const session = createGuestSession(wire, {
    name: netPanel.name(),
    onHostHello(name) {
      netPanel.setStatus(`Connected to ${name}. Pick your deck and land.`);
      netPanel.hideReconnect();
      // The guest walks the same local screens to reach the map click;
      // its local sim is a staging area the start snapshot replaces.
      if (game.phase === "main-menu") {
        game = startGame(game);
        deckScreen.update(deckScreenView(true));
      }
    },
    onLobby(info) {
      rulesPrefs = info.rules; // the host's rules are the game's rules
      deckScreen.update(deckScreenView(game.phase === "deck-building"));
      if (info.takenFactionId !== null) {
        netPanel.setStatus("Host has picked their land.");
      }
    },
    onState(g, fid) {
      game = g;
      if (net.role === "guest") net.faction = fid;
      localSeat = Math.max(0, seatOfFaction(g, fid));
      resolving = false;
      netPanel.setVisible(false);
      refresh();
      updateWaitingStatus();
    },
    onReject(reason) {
      console.error("host rejected the action:", reason);
      resolving = false;
      refresh();
    },
    onRefused(reason) {
      netPanel.setStatus(reason);
    },
    onClosed() {
      if (net.role !== "guest") return;
      net.session = null;
      resolving = true; // nothing can act until the host is back
      netPanel.setVisible(true);
      netPanel.setStatus("Connection lost.");
      netPanel.showReconnect(() => startJoin(hostId));
    },
  });
  net = {
    role: "guest", session, hostId,
    deckCards: prev?.deckCards ?? null, faction: prev?.faction ?? null,
  };
}
```

The `?join=` URL, near the boot-param parsing (src/main.ts:136):

```ts
const joinId = new URLSearchParams(window.location.search).get("join");
```

and after the panel exists:

```ts
if (joinId !== null) {
  if (boot !== null) {
    netPanel.setStatus("Join links cannot carry test boot params.");
  } else {
    netPanel.setVisible(true);
    startJoin(joinId);
  }
}
```

- [ ] **Step 5: The guest's actions go over the wire**

Guest deck confirm - in `createDeckScreen`'s `onStart`
(src/main.ts:1349), after the existing meta write, branch:

```ts
    if (net.role === "guest") {
      net.deckCards = buildPlayerDeck(meta.knownCards, selectedIds);
      game = chooseRules(game, rulesPrefs);
      game = chooseDeck(game, net.deckCards);
      deckScreen.update(deckScreenView(false));
      netPanel.setStatus("Pick your land on the map.");
      refresh();
      return;
    }
```

Guest faction click:

```ts
function guestPickFaction(fid: string): void {
  if (net.role !== "guest" || net.session === null) return;
  if (net.deckCards === null) return;
  net.session.sendPick(net.deckCards, fid);
  netPanel.setStatus("Waiting for the host to start the game...");
}
```

Guest plays - in `onPlayCard` (src/main.ts:1160), FIRST thing after
the existing guard block:

```ts
      if (net.role === "guest") {
        if (discardMode()) {
          disarm();
          sendGuestAction({
            type: "discard", cardIndex: index,
            cardId: localHuman().hand[index],
          });
          return;
        }
        const card = CARDS[localHuman().hand[index]];
        if (card?.targeted) {
          // The armed flow stays local; only the commit crosses the wire.
          if (armed === index) { disarm(); return; }
          armed = index;
          if (armedTargets().length === 0) { disarm(); return; }
          applyTargeting();
          hud.setArmed(index, card.name);
          return;
        }
        disarm();
        sendGuestAction({
          type: "play", cardIndex: index, cardId: localHuman().hand[index],
        });
        return;
      }
```

with:

```ts
function sendGuestAction(a: NetAction): void {
  if (net.role !== "guest" || net.session === null) return;
  resolving = true;
  refresh();
  net.session.sendAction(a);
  // resolving clears when the next onState lands (or onReject).
}
```

The armed-card commit in `interceptClick` (src/main.ts:1448) gains the
guest branch:

```ts
      disarm();
      if (valid) {
        if (net.role === "guest") {
          sendGuestAction({
            type: "play", cardIndex: idx,
            cardId: localHuman().hand[idx], targetId: faction,
          });
        } else {
          game = playCard(game, idx, rng, faction);
          afterHumanPlay();
        }
      }
      return true;
```

`onEndTurn` (src/main.ts:1200) similarly sends
`{ type: "end-turn" }` in guest mode instead of the local endTurn.

`onSurrender` (src/main.ts:1151) starts with
`if (net.role === "guest") return;` - the guest has no surrender (see
the spec's host-seat privileges section). Also hide the button: the
hud already renders it from callbacks; gate `onSurrender` presence or
add a class toggle in refresh - the simplest honest form is the
early return plus `surrenderBtn` hidden via a `net-guest` class on
`#app` set once when guest mode begins:

```ts
app.classList.toggle("net-guest", net.role === "guest");
```

with CSS: `.net-guest .surrender { display: none; }` (match the
button's real class name in hud.ts).

The turnip-harvest branch in onPlayCard cannot trigger for the guest
(the injection is host-seat-gated in the engine), but guard it anyway
with the same `net.role === "guest"` early path (it falls into the
untargeted send).

- [ ] **Step 6: Phase view, hud callbacks, names**

`refresh()` renders the guest's mapped phase:

```ts
function viewState(): GameState {
  if (net.role === "guest" && net.faction !== null) {
    return { ...game, phase: guestPhaseView(game, net.faction) };
  }
  return game;
}
```

and `hud.update(game)` (src/main.ts:1049) becomes
`hud.update(viewState())`.

Wire the Task 3 callbacks into `createHud`:

```ts
    localPlayerId() {
      return game.players[localSeat]?.id ?? 1;
    },
    playerNameOf(factionId) {
      if (net.role === "host" && net.guestSeat !== null) {
        if (game.players[net.guestSeat]?.factionId === factionId) {
          return net.session?.guestName() ?? "Guest";
        }
        return null;
      }
      if (net.role === "guest") {
        // The host is seat 0 in every dealt game.
        if (game.players[0]?.factionId === factionId) {
          return net.session?.hostName() ?? "Host";
        }
        return null;
      }
      return null;
    },
```

The map hover (hoverLines, src/main.ts:723) gains the "Played by" line
right after the first line:

```ts
  const otherHuman = playerNameOfFaction(region.faction);
  if (otherHuman !== null) {
    lines.push({ text: `Played by ${otherHuman}` });
  }
```

where `playerNameOfFaction` is the same logic as the hud callback,
extracted once in main.ts and passed to both (do not write it twice).

Panel visibility follows the phase - in `refresh()`:

```ts
  netPanel.setVisible(
    game.phase === "main-menu" ||
    (net.role !== "solo" && net.session === null),
  );
```

(the second arm keeps the panel up while disconnected).

- [ ] **Step 7: New game and net mode**

`onNewGame` (src/main.ts:1126): a host starting a new game mid-session
abandons the multiplayer run. Keep it honest and simple:

```ts
      if (net.role !== "solo") {
        net.session?.close?.();
        net = { role: "solo" };
        localSeat = 0;
        app.classList.remove("net-guest");
      }
```

(`close` exists on both session interfaces.) The peer objects close
with their wires; a fresh Host click builds new ones.

- [ ] **Step 8: Manual smoke check in one browser**

Run the dev server per AGENTS.md and load
`http://127.0.0.1:4173/prototypes/02/`. Confirm: solo play is
unchanged (deck screen, faction pick, a few turns); the net panel
shows on the menu; "Host a game" produces a link. This is a smoke
check only - the real check is Task 11.

- [ ] **Step 9: Full gates, then commit**

Run: `npm test && npx vitest run tests/rng-isolation.test.ts && npm run build`
Expected: all pass, baseline untouched.

```bash
git add src/main.ts src/hud.ts src/style.css src/deck-screen.ts
git commit -m "feat(net): host and guest play over peerjs - lobby, turns, names, drops"
```

(Drop hud.ts/deck-screen.ts from the add list if they ended up
unmodified.)

---

### Task 11: Acceptance - two tabs playing each other via Chrome DevTools

**Files:** none (verification; fixes discovered here go to the module
that owns them, committed separately with their own test where
reachable).

This is the REQUIRED finish line per the spec and the user's explicit
instruction. Do not report the work done without it.

- [ ] **Step 1: Gates**

Run: `npm test && npm run test:all && npm run build`
Expected: all green. `rng-isolation` baseline unchanged
(`git diff --stat tests/fixtures/` is empty).

- [ ] **Step 2: Start the dev server**

Per repo AGENTS.md: the root dev server serves
`http://127.0.0.1:4173/prototypes/02/`. Start it (background), confirm
the page loads.

- [ ] **Step 3: Load the Chrome DevTools MCP tools**

Load via ToolSearch in ONE call: `new_page`, `navigate_page`,
`take_snapshot`, `take_screenshot`, `click`, `fill`,
`list_console_messages`, `list_pages`, `select_page`, `evaluate_script`,
`wait_for`. **If the Chrome DevTools tools are blocked or unavailable,
STOP and tell the user - they will resolve it. Do not substitute a
different browser path without being told to.**

- [ ] **Step 4: The two-tab session**

1. Tab A (host): open the page. In the net panel type a name
   ("Anna"), click "Host a game". Read the invite link out of the DOM
   (`evaluate_script` on `.net-copy-row code`).
2. Tab B (guest): open THAT link in a second page. Name "Bela".
   Confirm the panel reports connected on both tabs.
3. Both tabs: click New game / proceed to the deck screen, PICK DECK
   TILES EXPLICITLY (an unmodified confirm ships ten Grow turnips -
   see the memory note), confirm, then click a land each. Confirm the
   host tab refuses the guest's land (taken) if clicked, and that the
   game starts on both.
4. Play at least 3 full rounds: host plays a card, wait for the AI
   chain, guest plays a card (include one TARGETED play from the
   guest - arm a card, click a legal land). After each action,
   screenshot BOTH tabs and READ the screenshots (the AGENTS.md
   screenshot rule): the same events must appear in both logs with
   the same numbers, each side's log says "You" for its own plays,
   and the host tab shows "Waiting for <faction> (Bela)..." while
   it is the guest's turn.
5. Names: hover the guest's land in the host tab - the tooltip carries
   "Played by Bela". Check the scoreboard rows on both tabs for the
   other player's name.
6. Rejoin: close tab B (or `navigate_page` it away). Confirm tab A
   pauses with the disconnect status. Reopen the join link in a new
   tab, confirm the game resumes mid-state and the guest's hand,
   standings and log match the host's view of them.
7. Console check on both tabs: `list_console_messages` with no
   uncaught errors (peerjs ICE warnings are acceptable noise; anything
   from our modules is not).

- [ ] **Step 5: Judgement call - play it**

Per the repo card rule: end by saying what was played and what would
look wrong. Note anything that felt broken (turn pacing, a modal
appearing on the wrong side, a standings sign flip) even if the
checks passed.

- [ ] **Step 6: Stop the dev server, final report**

Report to the user: what ran, what was seen in both tabs, screenshots
read, any deviations. If Chrome DevTools was blocked, this task is
NOT done - say so plainly.

---

## Execution notes

- Tasks 1-2 are independent of Tasks 3-4; either pair can go first,
  but keep each task's commit self-contained.
- Tasks 6-8 depend on 1-2. Task 10 depends on everything before it.
- Several sessions may be working in this repo; before starting,
  `git pull --rebase` and re-run the greps in Tasks 3-4 (line numbers
  drift).
- If `npm run balance` behaviour is wanted after the refactors: not
  required by this plan (no card changed), but the golden replay
  fixture passing at every task is mandatory.
