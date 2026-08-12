# Presentation Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One table decides how every event is presented, one gate decides whose
business it is, and the score-float subsystem is deleted - so a defense change
is shown by the badge walking and a sound, never by a coloured number floating
off a polygon.

**Architecture:** `src/presentation.ts` replaces `REPLAY_RULES`, `floatFor` and
`animateEvents`' implicit type-keyed rules with one exhaustive
`Record<GameEventType, PresentationRule>` returning `Beat[]`. The `present`
stage builds its beats from it. Beats hold descriptions, not DOM, so a beat
that has not run has drawn nothing.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

This is **step 3 of the design spec**
(`docs/superpowers/specs/2026-08-11-presentation-pipeline-design.md`). Steps 1
and 2 are merged: marches carry identity, and `src/transitions.ts` owns the
state as a queue whose displayed value lags until the beats explaining a move
have run.

## Global Constraints

- `npm test` and `npm run build` must pass, and `npm run lint` from the REPO
  ROOT must pass, before any commit.
- Do NOT run `npm run balance`.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- No em dashes and no non-typable unicode in source, comments or commit
  messages. Use `-`, `->`, `"`, `'`, `...`.
- Comments state a standing constraint. Never a date, never a chronicle of the
  change. This was flagged seven times across steps 1 and 2.
- Mutations are made from `world()`; only rendering reads `game()`.
- Every player-facing card or faction name is a `card()` / `faction()` segment
  from `src/rich-text.ts`, never interpolated into a string.
- Nothing may consume rng that did not before. No card behaviour change;
  `cardRulesHash` must not move.
- **The game must remain playable after every task.**

---

### Task 1: The classifier, with no wiring

**Files:** Create `src/presentation.ts` and `tests/presentation.test.ts`.

**Interfaces produced** (Task 2 imports exactly these):

```ts
/** How one event is presented. Exhaustive over GameEventType, the
 *  NOTICE_RULES shape: a new event type does not compile until somebody
 *  decides, and a type that is never presented writes the sentence saying
 *  why. */
export type PresentationRule =
  | { kind: "presented"; beats(e: GameEvent, ctx: PresentCtx): Beat[] }
  | { kind: "never"; reason: string };

export type Beat =
  | { kind: "map"; polygon: string; label: Segment[]; sound: SoundName | null;
      badges: BadgeWalk[]; retires: number[]; resolution?: ResolutionArrow }
  | { kind: "hud"; motion: "draw" | "play" | "pulse" | "reveal";
      cardId?: string; sound: SoundName | null }
  | { kind: "ask"; polygon: string };

/** One badge stepping from the score it HAD to the score it has. */
export interface BadgeWalk {
  polygon: string; track: "defense" | "disease"; before: number; after: number;
}

/** The resultant force of one resolution, drawn for the length of the beat
 *  and then gone. Keyed by transition and event rather than by any march,
 *  because a clash retires two arrows and produces one force whose strength
 *  is neither side's and whose direction may be the opposite of either. */
export interface ResolutionArrow {
  key: string; from: string; to: string; strength: number;
  label: string; tone: "ours" | "hostile" | "other";
}

export const PRESENTATION_RULES: Record<GameEventType, PresentationRule>;

/** The beats a transition's events earn, in order. */
export function presentEvents(events: GameEvent[], ctx: PresentCtx): Beat[];
```

`PresentCtx` carries what a rule needs and nothing more: the seats this SCREEN
plays, their full realm, the `linked` set, the standings walk for the batch,
and the `NoticeCtx`. It must not carry DOM or the queue.

- [ ] **Step 1: Port the rules**

`REPLAY_RULES` in `src/replay.ts` is the starting point and most entries carry
over almost unchanged - the labels, the sounds and the written reasons are all
still right. Three things change:

- `kind: "passed-over"` becomes `kind: "never"`, same written reason.
- `kind: "shown"` becomes `kind: "presented"` returning a one-element `[map]`
  beat, with `badges` filled from the walk. **The badge walk is now how every
  score change is shown**, not just the ones the camera visits.
- `march-resolved` also returns its `resolution` arrow and its `retires` list,
  read off `marchIds` and `incoming` (both landed in step 1).

- [ ] **Step 2: One audience gate**

`involvesLocalSeats(e, ctx)` replaces `ownCause`, `worthTheCamera`, the float's
absent gate and `animateEvents`' local-seat test. Shown when a seat THIS SCREEN
plays is at either end, or has an arrow or demand standing between it and the
land (`linked`, kept - a land regrowing under your incoming arrow changes what
that arrow will do, and the arrow is yours), or when the screen owes an answer.

Per-screen and not per-human: `humanSeats` is plural and a guest plays one of
them.

- [ ] **Step 3: Tests**

Port `tests/replay.test.ts` wholesale - it already pins exhaustiveness, the
written reasons, segment-only labels, the `ownCause` gate, the `linked` gate
and the two-seat mirror. Then add:

- every `presented` rule that can move a score returns a `BadgeWalk` for it;
- `march-resolved` returns `retires` equal to the event's `marchIds`, and a
  `resolution` whose strength is `incoming` and whose direction is winner at
  loser;
- a `never` rule returns no beats for any event of its type;
- the audience gate from both seats of a two-seat game.

- [ ] **Step 4: Run, then commit**

`npx vitest run tests/presentation.test.ts`, then the full suite and build.
Nothing imports the module yet, so the game is untouched.

---

### Task 2: The float subsystem dies

**Files:** Modify `src/main.ts` (the `present` stage, `floatScoreMarks` and
friends), `src/style.css`, delete `src/replay.ts` and `tests/replay.test.ts`.

- [ ] **Step 1: The present stage builds beats**

`present` calls `presentEvents(t.events, ctx)` and runs each beat as one queue
step, in order. A `map` beat: frame the land, light it, walk its badges, play
its sound, show its label, and hand back when the slowest reports done. A `hud`
beat: the existing flight, pulse or reveal. An `ask` beat is left to stage 3,
which already owns the conquest question - if the classifier emits one, the
stage reads it rather than re-deriving.

- [ ] **Step 2: DELETE the floats**

Remove `floatScoreMarks`, `floatFor`, `queueFloats`, `floatedEvents`,
`replayedIndices`, `FLOAT_MS`, the `floatGroup` element and `.score-float`,
`.float-good`, `.float-bad` from `src/style.css`. There must be no coloured
number floating off any polygon anywhere in the game.

The badge walk replaces them, and it is now universal rather than
replay-only - which also removes the reason `replayedIndices` existed at all.
Two systems that had to agree about which events the other had claimed become
one system.

- [ ] **Step 3: Verify the deletion is total**

`grep -rn "score-float\|floatFor\|floatedEvents\|replayedIndices\|FLOAT_MS" src/ tests/`
must return nothing. `src/replay.ts` and `tests/replay.test.ts` are deleted,
with every live reader moved to `src/presentation.ts`.

- [ ] **Step 4: Browser pass - this is the gate**

The user's original complaint is what you are checking. Play a raid and watch
it land:
- NO green or red number appears anywhere on a polygon;
- the target's defense badge ANIMATES from its old value to its new one;
- a raid sound plays;
- nothing is painted before the beat that explains it - sample the DOM during
  the animation and confirm no mark is sitting on the map waiting to move.
Also boot `?seed=11&faction=selonians&build=warpath&turns=8` and confirm no
floats appear at all on a paint that presents nothing (74 of them did before
step 2).

Quote what you saw. Port-scoped kill of the dev server, never a broad
`pkill -f vite`.

---

### Task 3: The clash label is neutral, and says DMG

**Files:** Modify `src/main.ts` (`flashMarchResolution`'s label) and
`src/style.css`.

- [ ] **Step 1: Neutral ink, and the word**

The resolved-march label reads `1/3 DMG` - what got through out of what was
thrown, with the word so the number cannot be read as a score. Delete
`.clash-flash.clash-good` and `.clash-bad`'s green and red fills; one neutral
ink for all three cases.

The denominator is `incoming`, which step 1 made present on every
`march-resolved` an army caused - including an uncontested landing, where the
old code fell back to `?? 1` and drew every uncontested raid one unit wide
whatever its strength.

- [ ] **Step 2: Browser pass, then commit**

A raid landing shows a neutral `N/M DMG`, and a 3-strength raid onto a
1-defense land reads `1/3 DMG` rather than `1/1`. No green, no red, no leading
sign.

---

## Self-Review

**Spec coverage.** Sections 3 and 4 of the design spec, and the float half of
"what this deletes". Section 6 (keyed arrow rendering, the transient resolution
arrow as an exit) is step 4 and has its own plan.

**Placeholders.** Task 1 gives the interfaces literally. Tasks 2 and 3 are
deletions and relocations of code the spec and `src/replay.ts` already carry in
full, so they name sites rather than quoting bodies.

**Type consistency.** `Beat`, `BadgeWalk`, `ResolutionArrow` and
`PRESENTATION_RULES` are defined in Task 1 and imported unchanged by Task 2.
`ResolutionArrow` is produced in Task 1 and consumed by Task 3's label and by
step 4's renderer.

**Known risk.** Task 2 is where behaviour visibly changes. If the badge walk
turns out not to be legible enough on its own for an event the camera does not
visit, say so rather than quietly reinstating a float.
