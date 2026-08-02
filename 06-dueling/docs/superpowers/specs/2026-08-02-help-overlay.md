# Help overlay ("?") - Spec

## Overview

The engine's rules are undiscoverable in-game: the only guidance is a one-line key
list (`draw.ts:38-39`), and the parryable-interval rule - the single most confusing
mechanic - is stated nowhere. This spec adds a "?" panel that explains the rules
well enough to play without reading source, and makes "up to date" a build-time
property rather than a promise.

Depends on `2026-08-02-fighter-state-tracks.md`: `HELP` is typed over the
post-restructure unions and must be written after the renames land, so it is written
once.

---

## 1. Trigger and behavior

- A "?" button drawn in the canvas corner, plus the `?` and `h` keys. All toggle.
- `Escape` closes; clicking outside the panel closes.
- **Opening pauses the simulation.** A reference you cannot read without dying is
  useless.
- Pausing uses a separate `helpOpen` flag; the accumulator gate becomes
  `paused || helpOpen`. It must **not** mutate `state.paused`, or opening and
  closing help would silently clear a manual pause. Consistent with the standing
  rule that time control only drives the accumulator, never the simulation.
- Independent of the backtick debug overlay: help is for players, the overlay is
  for tuning. Neither implies the other.

## 2. Rendering and scrolling

The panel is an **HTML element layered over the canvas**, not canvas-drawn text.

Rationale: the content exceeds one screen and canvas has no native scrolling;
drawing it would mean hand-rolling scroll state, wheel handling, clamping and a
scrollbar. An HTML overlay gets scrolling, text selection and resizing for free,
and the DOM boundary already exists (`src/combat/` is DOM-free; `src/main.ts` owns
the DOM).

- `max-height` bounded by the viewport, `overflow-y: auto`.
- Content max-width for readability; centred over the canvas.
- Game keybindings other than the close keys are inert while open.

## 3. Content model

```ts
interface HelpEntry {
  label: string;                        // what the HUD calls it
  what: string;                         // what is happening, one sentence
  player: string;                       // what the player must / must not do now
  ms?: (w: WeaponProfile) => number;    // derived, never a literal
}

export const HELP: Record<FighterState["kind"] | AttackPhase, HelpEntry>;
```

**The `Record` over the unions is the up-to-date mechanism.** Adding a state or
phase without documenting it is a compile error, not a review miss. Same lesson as
`POLICY_COVERAGE` in `02-balticmap`: prose asking people to remember did not work,
so the requirement is expressed as something that fails the build.

**Durations must be derived from `WEAPONS` via the `ms` callback, never written as
literals**, so retuning a weapon cannot strand an old number in the help. A test
asserts the rendered panel contains the current values for both weapons.

Beyond per-state entries the panel must state:

- The three-zone measure (out / wide / narrow) and that a strike lands only within
  `reach` at strike resolution.
- **The parryable interval, in full:** the parry must overlap the first
  `PARRYABLE_FRACTION` of the strike; any overlap counts; the practical window is
  `parryWindowMs + strike * PARRYABLE_FRACTION` wide and opens before the strike
  does - so pressing early is the safe error, and pressing once the blade is
  delivered (the dark bar segment) can never work.
- That a parry is never buffered, and why.
- Single-hit lethality, and what whiff and parried recovery cost the attacker.
- The key list, sourced from the same table that draws the control line, not a copy.
- After §8.1/§8.2 of the state-tracks spec land: the feint cancel and its recovery,
  and the carry-a-parry-into-a-step rule.

## 4. AGENTS.md requirement

`AGENTS.md` gains a section stating:

> The "?" panel is the player-facing statement of the engine's rules. It must stay
> **concise** and **current**. Any change to a state, phase, timing, acceptance rule
> or the parryable interval updates `HELP` in the same commit. `HELP` is typed as a
> `Record` over the state and phase unions, so an undocumented state fails the
> build; a rule change that does not alter the union will not, and is on you.
>
> Concise means: one sentence for what is happening, one for what the player must
> or must not do. If an entry needs a paragraph, the mechanic is too complicated,
> not the explanation.

## 5. Testing

- **Currency:** every `HELP` entry renders non-empty for both weapons; the rendered
  panel contains the current `WEAPONS` values for every duration it cites.
  Type-level exhaustiveness covers "a state exists but is undocumented".
- **Pause isolation:** opening help freezes the sim; closing resumes; a manual
  pause taken before opening survives an open/close cycle.
- **Manual:** open mid-fight, scroll to the bottom, close, confirm the duel resumes
  exactly where it froze.

## 6. Out of scope

- Localisation. English only; the `Record` shape does not preclude it later.
- Tutorialisation (guided first duel, contextual tips). This is a reference panel.
