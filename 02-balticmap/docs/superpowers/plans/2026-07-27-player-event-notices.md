# Player Event Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface events where another player harms the human faction as a mandatory dismissable modal with flavor text, highlight all human-involving activity-log entries, enforce a compile-time modal-or-silent decision for every event type, and drop the on-screen attribution.

**Architecture:** A new pure module `src/notices.ts` holds an exhaustive `Record<GameEventType, NoticeRule>` registry and a `noticeFor()` function. The HUD (src/hud.ts) already diffs freshly appended log events in `renderLog`; it additionally feeds that diff through `noticeFor`, queues resulting notices, and renders them one at a time in a full-screen modal overlay. The engine (game.ts) is untouched.

**Tech Stack:** TypeScript (strict), Vite, vitest with happy-dom for DOM tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-27-player-event-notices-design.md`

## Global Constraints

- UI copy and code comments use only keyboard-typable characters: no em dashes (use "-"), no unicode arrows or fancy quotes.
- Faction names are plain (no invented titles); interpolate names exactly as provided by the faction-name lookup.
- Engine purity: `src/game.ts` and other engine modules must not change.
- Commit messages follow the repo convention: `feat(hostages): ...` / `test(hostages): ...` / `chore(hostages): ...`.
- TDD: write the failing test, see it fail, implement, see it pass, commit.
- Run tests with `npm test -- <file>` (vitest run) from the repo root `/Users/janis.kirsteins/Projects/prototypes/02-balticmap`.

---

### Task 1: Notice registry module

**Files:**
- Create: `src/notices.ts`
- Test: `tests/notices.test.ts` (new)

**Interfaces:**
- Consumes: `GameEvent`, `GameEventType` types from `src/game.ts` (already exist, do not modify game.ts).
- Produces (used by Task 2):
  - `interface Notice { title: string; what: string; flavor: string; consequence?: string }`
  - `interface NoticeCtx { humanFactionId: string; factionName(id: string | undefined): string; factionOf(playerId: number): string | undefined }`
  - `type NoticeRule` (discriminated union, kinds "modal" and "silent")
  - `const NOTICE_RULES: Record<GameEventType, NoticeRule>`
  - `function noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null`

- [ ] **Step 1: Write the failing test**

Create `tests/notices.test.ts` with exactly:

```ts
import { describe, it, expect } from "vitest";
import { NOTICE_RULES, noticeFor, type NoticeCtx } from "../src/notices";
import type { GameEvent, GameEventType } from "../src/game";

const ALL_TYPES: GameEventType[] = [
  "draw", "play", "reshuffle", "discard",
  "subjugated", "released", "incorporated", "reclaimed", "tribute",
  "victory", "defeat",
];

const NAMES: Record<string, string> = {
  livs: "Lower Daugava Livs",
  jersika: "Jersikans",
  latgale: "Latgalians",
};

const FACTION_BY_PLAYER: Record<number, string> = {
  1: "livs", 2: "jersika", 3: "latgale",
};

const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionName: (id) => (id !== undefined ? NAMES[id] ?? id : ""),
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
};

const ev = (partial: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 3,
  playerId: 2,
  ...partial,
});

describe("NOTICE_RULES registry", () => {
  it("has an explicit rule for every event type", () => {
    for (const t of ALL_TYPES) {
      expect(NOTICE_RULES[t], `missing rule for ${t}`).toBeDefined();
    }
  });

  it("every silent rule carries a non-empty reason", () => {
    for (const t of ALL_TYPES) {
      const rule = NOTICE_RULES[t];
      if (rule.kind === "silent") {
        expect(rule.reason.length, `empty reason for ${t}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("noticeFor", () => {
  it("builds a subjugation notice when an AI subjugates the human", () => {
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Beneath the Yoke");
    expect(n!.what).toBe("Jersikans played Subjugate against Lower Daugava Livs.");
    expect(n!.flavor).toContain("Jersikans name the tribute");
    expect(n!.consequence).toContain("Two Pay Tribute cards were shuffled into your deck");
  });

  it("is null when the human subjugates someone else", () => {
    const n = noticeFor(
      ev({
        type: "subjugated", playerId: 1,
        targetFactionId: "jersika", overlordFactionId: "livs",
      }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("is null for AI-vs-AI subjugation", () => {
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "latgale", overlordFactionId: "jersika" }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("builds a release notice when another player frees the human", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
      ctx,
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe("The Yoke Is Broken");
    expect(n!.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
    expect(n!.flavor).toBe(
      "The lord you paid is lord no longer. No riders come for tribute " +
      "this season - you stand free.",
    );
    expect(n!.consequence).toBe(
      "All Pay Tribute cards were removed from your deck, hand, and discard.",
    );
  });

  it("is null for a release that frees another faction", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "latgale" }),
      ctx,
    );
    expect(n).toBeNull();
  });

  it("is null for every silent event type", () => {
    const silent: GameEvent[] = [
      ev({ type: "draw", playerId: 1, cardId: "raid" }),
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ev({ type: "reshuffle", playerId: 1 }),
      ev({ type: "discard", playerId: 1, cardId: "raid" }),
      ev({ type: "incorporated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "reclaimed", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika" }),
      ev({ type: "tribute", playerId: 1, targetFactionId: "livs", overlordFactionId: "jersika", track: "might" }),
      ev({ type: "victory", playerId: 1 }),
      ev({ type: "defeat", targetFactionId: "livs", overlordFactionId: "jersika" }),
    ];
    for (const e of silent) {
      expect(noticeFor(e, ctx), `expected null for ${e.type}`).toBeNull();
    }
  });

  it("falls back to raw ids for unknown factions", () => {
    const n = noticeFor(
      ev({ type: "subjugated", playerId: 9, targetFactionId: "livs", overlordFactionId: "mystery" }),
      ctx,
    );
    expect(n).not.toBeNull();
    // playerId 9 has no faction: factionOf returns undefined, factionName("")
    expect(n!.what).toBe(" played Subjugate against Lower Daugava Livs.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/notices.test.ts`
Expected: FAIL - cannot resolve `../src/notices` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/notices.ts` with exactly:

```ts
import type { GameEvent, GameEventType } from "./game";

/** A player-facing interruption for an event that changed the human's state. */
export interface Notice {
  title: string;
  what: string; // factual: who did what
  flavor: string; // period-tone line, rendered italic
  consequence?: string; // mechanical effect on the human player
}

export interface NoticeCtx {
  humanFactionId: string;
  factionName(id: string | undefined): string;
  factionOf(playerId: number): string | undefined;
}

/** Every GameEventType must decide: interrupt the human, or stay silent
 *  with a written reason. The exhaustive Record makes adding an event type
 *  a compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      build(e: GameEvent, ctx: NoticeCtx): Notice;
    }
  | { kind: "silent"; reason: string };

const victimOfOther = (e: GameEvent, ctx: NoticeCtx): boolean =>
  e.targetFactionId === ctx.humanFactionId && e.playerId !== 1;

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: { kind: "silent", reason: "routine; visible in log and card animation" },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      return {
        title: "Beneath the Yoke",
        what: `${actor} played Subjugate against ${ctx.factionName(e.targetFactionId)}.`,
        flavor:
          "Armed riders gather before your halls. Your elders count spears, " +
          `then bow their heads. ${actor} name the tribute; you will pay it.`,
        consequence:
          "Two Pay Tribute cards were shuffled into your deck. When one is " +
          "in hand, it must be played before anything else.",
      };
    },
  },
  released: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      return {
        title: "The Yoke Is Broken",
        what: `The fall of your overlord to ${actor} releases you from vassalage.`,
        flavor:
          "The lord you paid is lord no longer. No riders come for tribute " +
          "this season - you stand free.",
        consequence:
          "All Pay Tribute cards were removed from your deck, hand, and discard.",
      };
    },
  },
  incorporated: {
    kind: "silent",
    reason: "human target always co-occurs with defeat; postmortem covers it",
  },
  reclaimed: {
    kind: "silent",
    reason: "self-initiated when it touches the human",
  },
  tribute: {
    kind: "silent",
    reason: "self-initiated (human pays) or human merely benefits",
  },
  victory: { kind: "silent", reason: "postmortem overlay covers it" },
  defeat: { kind: "silent", reason: "postmortem overlay covers it" },
};

/** The single entry point the HUD uses per fresh log event. */
export function noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null {
  const rule = NOTICE_RULES[e.type];
  if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) return null;
  return rule.build(e, ctx);
}
```

Note the subjugated flavor says "{actor} name the tribute" (plural verb - faction names are plural peoples, e.g. "Jersikans name the tribute"). The test asserts this exact phrasing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/notices.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/notices.ts tests/notices.test.ts
git commit -m "feat(hostages): exhaustive notice registry for player-affecting events"
```

---

### Task 2: HUD notice modal with queue

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css` (append new rules at the end)
- Test: `tests/hud.test.ts` (append a new describe block)

**Interfaces:**
- Consumes from Task 1: `noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null`, `type Notice`, `type NoticeCtx` from `./notices`.
- Produces: DOM structure `.notice-overlay > .notice-card > (.notice-title, .notice-what, .notice-flavor, .notice-consequence, .notice-continue)`. Overlay hidden via the codebase's `.hidden` class convention. Task 3 does not depend on this task's code, but both edit hud.ts - execute sequentially.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud.test.ts` (top-level, after the last describe block). Also extend the existing imports from `../src/game` to include `type GameEvent`:

```ts
describe("notice modal", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  function withEvents(g: GameState, events: GameEvent[]): GameState {
    return { ...g, log: [...g.log, ...events] };
  }

  const subjugatedYou: GameEvent = {
    turn: 1, playerId: 2, type: "subjugated",
    targetFactionId: "beta", overlordFactionId: "alpha",
  };
  const releasedYou: GameEvent = {
    turn: 1, playerId: 3, type: "released", targetFactionId: "beta",
  };

  it("shows a mandatory modal when an AI subjugates you", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou]));
    const overlay = q(container, ".notice-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("Beneath the Yoke");
    expect(q(container, ".notice-what").textContent).toBe(
      "Alpha played Subjugate against Beta.",
    );
    expect(q(container, ".notice-flavor").textContent).toContain("bow their heads");
    expect(q(container, ".notice-consequence").textContent).toContain(
      "Two Pay Tribute cards",
    );
  });

  it("dismisses on Continue and stays dismissed on re-render", () => {
    const { container, hud } = setup();
    const g = withEvents(playing(), [subjugatedYou]);
    hud.update(g);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    hud.update(g); // same state: no new events, no re-show
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("queues multiple notices and shows them in order", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou, releasedYou]));
    expect(q(container, ".notice-title").textContent).toBe("Beneath the Yoke");
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("The Yoke Is Broken");
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("dismisses on Escape", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("shows nothing for your own plays or AI-vs-AI events", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [
      { turn: 1, playerId: 1, type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta" },
      { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma", overlordFactionId: "alpha" },
    ]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("clears the queue and overlay when a new game starts", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou, releasedYou]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    hud.update(playing()); // fresh game: shorter log resets renderLog
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    // a later dismiss must not resurface stale queued notices
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("does not show notices once the game has ended", () => {
    const { container, hud } = setup();
    let g = withEvents(playing(), [subjugatedYou]);
    g = { ...g, phase: "defeat" };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });
});
```

Note: `setup`, `q`, `seededRng`, `FACTIONS`, `withHand` and the game imports already exist in this file - reuse them, do not redeclare.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: the new "notice modal" tests FAIL (no `.notice-overlay` element); all pre-existing tests still PASS.

- [ ] **Step 3: Implement the modal in src/hud.ts**

3a. Add imports at the top of `src/hud.ts`:

```ts
import { noticeFor, type Notice, type NoticeCtx } from "./notices";
```

3b. Inside `createHud`, after the `logPanel` construction block (after `logPanel.append(logHeader, logEntries);`), add the overlay elements and queue logic:

```ts
  const noticeOverlay = document.createElement("div");
  noticeOverlay.className = "notice-overlay hidden";
  const noticeCard = document.createElement("div");
  noticeCard.className = "notice-card";
  const noticeTitle = document.createElement("h2");
  noticeTitle.className = "notice-title";
  const noticeWhat = document.createElement("p");
  noticeWhat.className = "notice-what";
  const noticeFlavor = document.createElement("p");
  noticeFlavor.className = "notice-flavor";
  const noticeConsequence = document.createElement("p");
  noticeConsequence.className = "notice-consequence";
  const noticeContinue = document.createElement("button");
  noticeContinue.className = "notice-continue";
  noticeContinue.textContent = "Continue";
  noticeContinue.addEventListener("click", () => dismissNotice());
  noticeCard.append(
    noticeTitle, noticeWhat, noticeFlavor, noticeConsequence, noticeContinue,
  );
  noticeOverlay.appendChild(noticeCard);

  let noticeQueue: Notice[] = [];

  function showNotice(n: Notice): void {
    noticeTitle.textContent = n.title;
    noticeWhat.textContent = n.what;
    noticeFlavor.textContent = n.flavor;
    noticeConsequence.textContent = n.consequence ?? "";
    noticeConsequence.classList.toggle("hidden", n.consequence === undefined);
    noticeOverlay.classList.remove("hidden");
  }

  function dismissNotice(): void {
    const next = noticeQueue.shift();
    if (next !== undefined) showNotice(next);
    else noticeOverlay.classList.add("hidden");
  }

  function clearNotices(): void {
    noticeQueue = [];
    noticeOverlay.classList.add("hidden");
  }

  /** Player-affecting events interrupt: queue one modal per fresh notice. */
  function enqueueNotices(state: GameState, fresh: GameEvent[]): void {
    if (state.phase !== "playing") return;
    const human = state.players[0];
    if (!human) return;
    const ctx: NoticeCtx = {
      humanFactionId: human.factionId,
      factionName,
      factionOf: (playerId) =>
        state.players.find((pl) => pl.id === playerId)?.factionId,
    };
    for (const e of fresh) {
      const n = noticeFor(e, ctx);
      if (n === null) continue;
      if (noticeOverlay.classList.contains("hidden")) showNotice(n);
      else noticeQueue.push(n);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !noticeOverlay.classList.contains("hidden")) {
      dismissNotice();
    }
  });
```

3c. Add `noticeOverlay` to the container append (it must be last so it stacks above everything):

```ts
  container.append(
    menu, postmortem, status, deckPile.root, discardPile.root, hand, logPanel,
    noticeOverlay,
  );
```

3d. In `renderLog`, the reset branch (when `state.log.length < renderedEvents`) additionally clears notices:

```ts
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
      clearNotices();
    }
```

3e. In `update(state)`, wire the fresh-event diff through notices. Replace the line `animateEvents(renderLog(state));` with:

```ts
        const fresh = renderLog(state);
        enqueueNotices(state, fresh);
        animateEvents(fresh);
```

And at the start of `update`, after `lastState = state;`, clear notices when leaving the playing phase:

```ts
      if (state.phase !== "playing") clearNotices();
```

- [ ] **Step 4: Add the CSS**

Append to `src/style.css`:

```css
.notice-overlay {
  position: absolute;
  inset: 0;
  background: rgba(30, 24, 16, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}

.notice-overlay.hidden {
  display: none;
}

.notice-card {
  width: min(420px, calc(100% - 48px));
  background: #fdf9f1;
  border: 1px solid #c9b896;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  padding: 22px 24px;
  text-align: center;
  color: #3f3428;
}

.notice-title {
  font-size: 22px;
  margin-bottom: 10px;
}

.notice-what {
  font-size: 14px;
  margin-bottom: 10px;
}

.notice-flavor {
  font-size: 13px;
  font-style: italic;
  color: #6b5d49;
  margin-bottom: 10px;
}

.notice-consequence {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}

.notice-continue {
  font-size: 14px;
  padding: 8px 22px;
  border: 1px solid #a89468;
  border-radius: 6px;
  background: #efe3c8;
  color: #3f3428;
  cursor: pointer;
}

.notice-continue:hover {
  background: #e6d6b4;
}
```

Check first whether style.css already has a global `.hidden { display: none; }` rule that applies here (grep for `.hidden`); if it does, omit the `.notice-overlay.hidden` block.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/hud.test.ts`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(hostages): mandatory notice modal for events that hit the player"
```

---

### Task 3: Activity log highlighting for human-involving events

**Files:**
- Modify: `src/hud.ts` (renderLog and renderPostmortem)
- Modify: `src/style.css` (append)
- Test: `tests/hud.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: existing `GameEvent` fields (`playerId`, `targetFactionId`, `overlordFactionId`); Task 2's hud.ts layout (sequential edit, run after Task 2).
- Produces: `.log-entry.log-you` class on entries involving the human faction, in both the live activity log and the postmortem log.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud.test.ts`:

```ts
describe("log highlighting", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("marks entries involving the human faction with log-you", () => {
    const { container, hud } = setup();
    let g = playing(); // log: your opening draw (playerId 1)
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "draw", cardId: "raid" },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma", overlordFactionId: "alpha" },
        { turn: 1, playerId: 3, type: "reclaimed", targetFactionId: "gamma", overlordFactionId: "beta" },
      ],
    };
    hud.update(g);
    // dismiss the modal the subjugation raised; this test is about the log
    q(container, ".notice-continue").click();
    const entries = [...container.querySelectorAll(".activity-log .log-entry")];
    const flags = entries.map((el) => el.classList.contains("log-you"));
    // your draw, AI draw, you subjugated, AI-vs-AI, AI reclaims from you
    expect(flags).toEqual([true, false, true, false, true]);
  });

  it("marks postmortem log entries the same way", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      phase: "defeat",
      log: [
        ...g.log,
        { turn: 2, playerId: 2, type: "defeat", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    const entries = [...container.querySelectorAll(".pm-log .log-entry")];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[entries.length - 1].classList.contains("log-you")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: the two new tests FAIL (no `log-you` classes); everything else PASSES.

- [ ] **Step 3: Implement in src/hud.ts**

3a. Inside `createHud`, next to the `eventText` helper, add:

```ts
  function involvesHuman(e: GameEvent, humanFactionId: string | undefined): boolean {
    if (humanFactionId === undefined) return false;
    return (
      e.playerId === 1 ||
      e.targetFactionId === humanFactionId ||
      e.overlordFactionId === humanFactionId
    );
  }
```

3b. In `renderLog`, compute the human faction once before the loop and toggle the class on each new entry:

```ts
    const humanFactionId = state.players[0]?.factionId;
```

and inside the `for (const e of fresh)` loop, after `entry.textContent = eventText(e);`:

```ts
      entry.classList.toggle("log-you", involvesHuman(e, humanFactionId));
```

3c. In `renderPostmortem`, the `pmLog.replaceChildren(...)` mapping gets the same toggle. The existing code builds `d` with class `log-entry`; add:

```ts
        d.classList.toggle("log-you", involvesHuman(e, human?.factionId));
```

(`human` is already in scope at the top of `renderPostmortem`; guard with optional chaining since players may be empty in edge cases - pass `human?.factionId`.)

- [ ] **Step 4: Add the CSS**

Append to `src/style.css`:

```css
.log-entry.log-you {
  border-left: 3px solid #a8542f;
  background: #f7ecdc;
  padding-left: 6px;
  font-weight: 600;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/hud.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(hostages): highlight activity-log entries involving the player"
```

---

### Task 4: Remove on-screen attribution

**Files:**
- Modify: `src/map-render.ts` (remove the attribution element)
- Modify: `src/style.css` (remove the `.attribution` rule)
- Test: `tests/render.test.ts` (invert the attribution test)

**Interfaces:**
- Consumes: nothing from other tasks (independent; can run in any order).
- Produces: no `.attribution` element in the DOM. The `attribution` field stays in `src/types.ts`, the map data, and `tests/data.test.ts`.

- [ ] **Step 1: Update the test to expect no attribution**

In `tests/render.test.ts`, replace the test:

```ts
  it("adds the attribution line to the container", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")!.textContent).toBe(
      data.attribution,
    );
  });
```

with:

```ts
  it("renders no attribution line (internal prototype)", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/render.test.ts`
Expected: the replaced test FAILS (attribution element still rendered).

- [ ] **Step 3: Remove the element and CSS**

In `src/map-render.ts`, delete these four lines (around lines 152-155):

```ts
  const attribution = document.createElement("div");
  attribution.className = "attribution";
  attribution.textContent = data.attribution;
  container.appendChild(attribution);
```

In `src/style.css`, delete the whole `.attribution { ... }` block (around line 222):

```css
.attribution {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 11px;
  color: #8a8a8a;
  z-index: 5;
  pointer-events: none;
}
```

Do NOT touch `src/types.ts`, the map data, or `tests/data.test.ts` - the source record stays.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/render.test.ts && npm test -- tests/data.test.ts`
Expected: both PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/map-render.ts src/style.css tests/render.test.ts
git commit -m "chore(hostages): drop on-screen attribution for internal prototype"
```

---

### Task 5: End-to-end verification in Chrome

**Files:**
- No code changes expected; fixes discovered here become follow-up edits.

**Interfaces:**
- Consumes: everything above, running via `npm run dev`.

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, tsc clean.

- [ ] **Step 2: Manual pass in Chrome**

Start `npm run dev` and drive the app in Chrome (browser automation is fine):

1. New game -> pick a deck -> pick a faction. Verify no attribution text bottom-left.
2. Play turns until an AI subjugates you (pick a weak faction adjacent to a strong one and play grow-crops/fortify passively to invite it; AI aggression makes this quick). Verify: dimming modal appears with title "Beneath the Yoke", factual line, italic flavor, consequence line; map and hand are not clickable behind it; Continue dismisses it.
3. Verify the corresponding activity-log entry is highlighted (accent border, tinted background) while AI-vs-AI entries are not.
4. Verify Escape also dismisses a notice.
5. Finish or abandon: no notice modal on the victory/defeat screens.

Expected: all five observations hold.

- [ ] **Step 3: Report**

No commit. Report verification results (with any screenshots) back in the session.
