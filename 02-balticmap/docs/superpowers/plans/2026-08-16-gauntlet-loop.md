# Gauntlet Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** The run becomes pick a bordering target, duel it, cash the reward, the
whole world takes one turn, repeat.

**Architecture:** One new field on `GameState`, a discriminated union naming
which part of the cycle the run is in. Duel scoping is one more arm on
`takesNoTurn`, which is already the single question the turn loop asks. The
target pick is a `Decision` raised as a MODAL, not a new `GamePhase`. The world
tick is an ordinary unscoped round through the existing `stepAiChain` and round
summary.

**Spec:** `02-balticmap/docs/superpowers/specs/2026-08-15-run-structure-attack-design.md`,
section E.

## Global Constraints

- Branch `feature/run-structure`. `npm test` and `npm run build` before every
  commit. Never `npm run balance`. Never `git add -A`.
- Comments explain WHY, no dates, no chronicle, plain ASCII.
- Run the stuck-seat sweep (method in
  `.superpowers/sdd/2026-08-15-acting-vassals/task-2-report.md`) after any
  change to who takes a turn. Zero, every time.
- Reviews are being skipped for time. Anything unverified goes in
  `02-balticmap/FOLLOWUP.md` - append, never rewrite.

## The state, decided up front so both batches agree

```ts
/** Where the run is in the gauntlet cycle. One field rather than three
 *  booleans, because the three states are exclusive and a reader that has to
 *  combine flags is a reader that will combine them wrongly. */
export type Gauntlet =
  | { kind: "duel"; enemy: string; until: number }
  | { kind: "world-tick" }
  | { kind: "picking"; candidates: string[] };
```

`GameState.gauntlet: Gauntlet`. It is a plain object of plain values, so it
crosses `src/net-codec.ts` for free - but the compile-time check is what proves
it, not this sentence.

The cycle, and every transition happens at the ROUND WRAP:

- `duel` -> `world-tick` when a land has changed hands between the two realms,
  or `state.turn >= until`.
- `world-tick` -> `picking` after exactly one unscoped round.
- `picking` -> `duel` when the pick is answered. Nothing else moves while a
  pick is owed.

**Why the picker is a modal and not a `GamePhase`.** `CLAUDE.md` records what a
second playing-phase costs: every reader of `phase` in the app has to learn it,
all of them the same way. The pick is a question asked mid-run, which is exactly
what the modal machinery already exists for - the harvest boon and the
conquest's defenders - and `inputLocked` already knows how to hold a screen
while a question is owed.

---

### Batch A: the engine

**Files:** `src/game.ts`, `src/state.ts` or wherever `GameState` lives,
`src/net-codec.ts` (compile check only), `src/relations.ts` if the realm walk
needs a helper, `tests/game.test.ts`, `tests/net-codec.test.ts`

- [ ] **A1.** Add the `Gauntlet` union and the `GameState` field. Seed a new
  game at `{ kind: "picking", candidates: [...] }` so the first thing a run
  does is choose. Confirm `npm run build` passes - that is the wire check.

- [ ] **A2.** `takesNoTurn` gains the duel arm. While `gauntlet.kind === "duel"`,
  a faction in neither `fullRealmOf(human)` nor `fullRealmOf(enemy)` takes no
  turn. Put it AFTER the annexed arm and the human arm: an annexed seat is out
  of the run whatever the gauntlet says, and a person is never frozen out of
  their own turn. Its doc comment must say where in the order it sits and why,
  the way the existing three arms do.

  Test: during a duel, a third faction with a ruler takes no turn; the human
  does; the enemy does; a vassal of either side does.

- [ ] **A3.** The candidates. A bordering faction the human may legally fight -
  reuse `attackReach` and `aimsWithinOwnRealm` rather than writing a fourth
  spelling of "who may I attack". Some neighbours are meant to be ignorable, so
  the list is an offer, not a requirement.

- [ ] **A4.** The transitions at the round wrap, exactly as listed above.
  `DUEL_TURNS` is a named constant; start at 20, which is the top of the
  refactor spec's 10-20 target, because a duel that ends early on a capture is
  the common case and the cap is the backstop.

  Test each transition, and test that a duel ending on a capture and a duel
  ending on the clock both reach `world-tick`.

- [ ] **A5.** Sweep. This changes who takes a turn, which is the shape that
  froze the game twice on this branch.

Commit per step where it is natural. Report to
`.superpowers/sdd/2026-08-16-gauntlet-loop/batch-a-report.md`.

---

### Batch B: the pick, the reward, and the screen

**Files:** `src/decisions.ts`, `src/main.ts`, `src/hud.ts`,
`src/net-protocol.ts`, `src/rich-text.ts` consumers, `tests/*`

- [ ] **B1.** A `pick-duel` `Decision`. `DECISION_ROUTES` is an exhaustive
  `Record<DecisionKind, Route>`, so this does not compile until it either names
  the `NetAction` it crosses the wire as, or says in a sentence why it is the
  host's alone. Decide and say which. `src/main.ts` is lint-banned from
  importing the engine mutators, so the answer goes through `commitDecision`
  like every other decision in play.

- [ ] **B2.** The reward, derived from what the land IS rather than rolled.
  Smallest set that proves the idea: a large land (high `siteCaps`) yields
  growth, a land carrying a defensive terrain status yields defense, otherwise
  wealth. One function, `rewardFor(land)`, read by both the picker and the
  cashing so the two cannot promise different things - that is the same rule
  `SINGLE_LAND_HEAL` follows.

- [ ] **B3.** Cash it when the duel ends with the human having taken a land
  from the enemy. Losing or timing out pays nothing. A `GameEventType` for it,
  which means a `NOTICE_RULES` entry and a `PRESENTATION_RULES` entry - both are
  exhaustive `Record`s and will refuse to compile until classified.

- [ ] **B4.** The modal. It lists each candidate with its reward, and every
  faction name is a `faction()` segment and every card name a `card()` segment -
  `tests/naming-convention.test.ts` fails a plain-text name. Declining is a real
  choice if the design allows it; if it does not, say so on the modal rather
  than leaving the player hunting for a way out.

- [ ] **B5.** `inputLocked` must include a pending pick, and the modal must
  repaint on the way in and out - a derived lock with no repaint behind it is a
  hand that stays greyed until the player hovers something.

- [ ] **B6.** Sweep, full suite, build.

Report to `.superpowers/sdd/2026-08-16-gauntlet-loop/batch-b-report.md`.

---

### Batch C: gate, deploy, playtest

- [ ] **C1.** `npm test`, `npm run build`, sweep, `npx biome lint 02-balticmap`.
- [ ] **C2.** Push. The preview deploys to
  `https://jkirsteins.github.io/prototypes/preview/feature-run-structure/02/`.
- [ ] **C3.** Play it. Does a duel feel like an arc? Is the world tick readable
  at the beat counts stage 1 measured - up to 16 beats and 29.5s at a five-land
  realm, and a world tick is that with every seat acting? Is declining ever
  right?
- [ ] **C4.** Append everything unverified to `02-balticmap/FOLLOWUP.md`.
