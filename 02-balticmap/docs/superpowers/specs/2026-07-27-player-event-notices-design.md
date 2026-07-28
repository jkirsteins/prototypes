# Player Event Notices - Design

Date: 2026-07-27
Status: approved

## Problem

When another player's action changes the human player's state (e.g. the human
faction is subjugated), the only feedback is a plain activity-log line such as
"Lower Daugava Livs submits to Jersikans". It is easy to miss entirely. Two
gaps:

1. Log entries that involve the human faction look identical to AI-vs-AI
   entries.
2. Meaningful events that hit the human have no interrupting surface at all.

## Goals

- Any event that involves the human faction is visually distinct in the
  activity log.
- Events where the human faction is the victim/subject of another player's
  action surface as a mandatory dismissable modal with a factual line, a
  hand-written flavor line, and the mechanical consequence.
- Architecture enforces, at compile time, that every current and future
  `GameEventType` has an explicit modal-or-silent decision.
- Remove the on-screen data-source attribution (internal prototype, not
  published).

## Non-goals

- Modals for events the human initiated (they clicked the card).
- Modals for events where the human merely benefits (AI pays tribute to you,
  your vassal breaks free from you).
- Modals for victory/defeat/human-incorporation - the existing postmortem
  overlay covers those.
- Random flavor variants; one crafted line per event type.
- Engine (game.ts) changes. The notice layer is presentation-only.

## Architecture

Chosen approach: pure registry module + HUD-owned modal queue. The engine
stays untouched; the HUD already diffs freshly appended log events for
animations (`renderLog` in hud.ts) and will feed the same diff through the
registry.

### 1. Notice registry - new `src/notices.ts` (pure, no DOM)

```ts
export interface Notice {
  title: string;        // "Beneath the Yoke"
  what: string;         // "Jersikans played Subjugate against you."
  flavor: string;       // period-tone line, italic in UI
  consequence?: string; // mechanical effect on the human player
}

export interface NoticeCtx {
  humanFactionId: string;
  factionName(id: string | undefined): string;
  factionOf(playerId: number): string | undefined;
}

export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      build(e: GameEvent, ctx: NoticeCtx): Notice;
    }
  | { kind: "silent"; reason: string };

export const NOTICE_RULES: Record<GameEventType, NoticeRule>;

export function noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null;
```

`NOTICE_RULES` is exhaustively keyed by `GameEventType`. This is the
enforcement point: adding a new event type to game.ts fails `tsc` until the
author adds a registry entry - either a modal builder or `silent` with a
written reason. `noticeFor` returns the built Notice when the rule is `modal`
and `appliesToHuman` passes; otherwise null.

Initial rules:

| Event type   | Rule   | Detail                                                            |
| ------------ | ------ | ----------------------------------------------------------------- |
| subjugated   | modal  | when `targetFactionId === humanFactionId` and `playerId !== 1`    |
| released     | modal  | when `targetFactionId === humanFactionId` and `playerId !== 1`    |
| draw         | silent | routine; visible in hand and log                                  |
| play         | silent | routine; visible in log and card animation                        |
| discard      | silent | routine                                                           |
| reshuffle    | silent | routine; deck pulse animation                                     |
| incorporated | silent | human target always co-occurs with defeat -> postmortem covers it |
| reclaimed    | silent | self-initiated when it touches the human                          |
| tribute      | silent | self-initiated (human pays) or human merely benefits              |
| victory      | silent | postmortem overlay covers it                                      |
| defeat       | silent | postmortem overlay covers it                                      |

### 2. Modal UI - hud.ts + style.css

- Full-screen dimming overlay (`.notice-overlay`) above map, hand, and log;
  captures all pointer events, so it must be dismissed.
- Card content: title, factual line, flavor line (italic), consequence line,
  single "Continue" button. Escape also dismisses.
- Queue semantics: all AI turns resolve in one synchronous batch before
  `hud.update`, so multiple notices can arrive together. Fresh events from
  `renderLog` are mapped through `noticeFor`; non-null results are pushed onto
  a queue and shown one at a time, in log order. Dismissing shows the next.
- Notices are only queued while `state.phase === "playing"`; when the game
  ends the postmortem takes over.
- `NoticeCtx` is built once per `createHud` state update from
  `state.players[0].factionId`, the existing factionNames map, and
  `state.players` (playerId -> factionId).

### 3. Activity log highlighting - hud.ts + style.css

- New helper: an event involves the human when `playerId === 1` or
  `targetFactionId`/`overlordFactionId` equals the human faction id.
- Such entries get a `log-you` class: accent left border, background tint,
  heavier text weight. Applied both in the live activity log and in the
  postmortem log (same entry builder).
- AI-vs-AI entries are unchanged.

### 4. Flavor text

Hand-written, names interpolated, keyboard-typable characters only.

subjugated (human target):

- title: "Beneath the Yoke"
- what: "{actor} played Subjugate against {human faction}."
- flavor: "Armed riders gather before your halls. Your elders count spears,
  then bow their heads. The victors name the tribute; you will pay it."
- consequence: "Two Pay Tribute cards were shuffled into your deck. When one
  is in hand, it must be played before anything else."

released (human target):

- title: "The Yoke Is Broken"
- what: "The fall of your overlord to {actor} releases you from vassalage."
- flavor: "The lord you paid is lord no longer. No riders come for tribute
  this season - you stand free."
- consequence: "All Pay Tribute cards were removed from your deck, hand, and
  discard."

The consequence lines match the engine: subjugate shuffles two `pay-tribute`
cards into the vassal's deck and `pay-tribute` is a forced card
(playability.ts `playableSet`); release strips them (`stripTribute`).

### 5. Attribution removal

- Delete the attribution element creation in map-render.ts (the
  `div.attribution` appended to the container).
- Delete the `.attribution` rule in style.css.
- Update render.test.ts: the "adds the attribution line" test becomes an
  assertion that no `.attribution` element is rendered.
- Keep the `attribution` field in map data, types.ts, and data.test.ts so the
  source record survives and the notice is trivial to restore before any
  publication.

## Data flow

1. Engine appends `GameEvent`s to `state.log` (unchanged).
2. `hud.update(state)` -> `renderLog(state)` diffs fresh events (existing).
3. Each fresh event: (a) rendered as a log entry, with `log-you` when it
   involves the human; (b) passed through `noticeFor`; non-null results are
   queued.
4. Modal overlay shows queue head; Continue/Escape advances the queue.

## Error handling

- `noticeFor` is pure and total: unknown faction ids fall back to the raw id
  via `factionName` (existing HUD pattern); missing `playerId` mapping yields
  the raw player number only inside factual lines, never a crash.
- A log reset (new game) clears the notice queue and hides the overlay.

## Testing

TDD throughout; implementation via subagents per task.

New `tests/notices.test.ts`:

- Every `GameEventType` has a registry entry (runtime sweep; compile-time
  exhaustiveness is the primary guard).
- subjugated targeting the human by an AI -> Notice with interpolated actor
  and correct consequence text.
- subjugated played by the human, and AI-vs-AI subjugation -> null.
- released mirrors the same matrix.
- All silent types -> null, and every silent rule carries a non-empty reason.

hud.test.ts additions:

- Fresh human-targeting subjugated event -> overlay visible with title,
  what, flavor, consequence.
- Continue click hides it; with two queued notices they display sequentially.
- Log entry involving the human has `log-you`; AI-vs-AI entry does not.
- New game (log reset) clears queue and overlay.

render.test.ts: attribution assertions inverted as described.

Final verification: run the full vitest suite, then an end-to-end pass in
Chrome (per project practice, happy-dom misses real-browser issues).
