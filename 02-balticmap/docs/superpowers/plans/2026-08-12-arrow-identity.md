# Arrow Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An arrow on the map is a thing that arrives, moves and leaves, rather
than a picture redrawn from scratch every repaint - so it can fade in when it is
declared and fade out when it is spent, which it never could before.

**Architecture:** `renderArrowScene` keeps its layout maths and gains a retained
`Map<string, SVGGElement>`. A key not present last render fades in; a key gone
this render fades out and is removed when the animation reports itself finished;
a surviving key animates to its new lane. Marches key on the id step 1 gave
them.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

This is **step 4 of the design spec**
(`docs/superpowers/specs/2026-08-11-presentation-pipeline-design.md`), section
6. Steps 1 to 3 are merged: marches carry identity, one queue owns the state and
defers the commit, and one classifier says how every event is presented.

## Global Constraints

- `npm test` and `npm run build` must pass, and `npm run lint` from the REPO
  ROOT must pass, before any commit.
- Do NOT run `npm run balance`.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- No em dashes and no non-typable unicode in source, comments or commit
  messages.
- Comments state a standing constraint. Never a date, never a chronicle of the
  change. Flagged eight times across steps 1 to 3.
- Mutations are made from `world()`; only rendering reads `game()`.
- Never re-derive an animation's duration: game logic waits on the animation
  reporting itself finished, never on a second timer set to the same number.
- Nothing may consume rng. No card behaviour change.
- **The game must remain playable after every task.**

---

### Task 1: The scene retains its arrows

**Files:** Modify `src/arrow-scene.ts`; extend `tests/arrow-scene.test.ts`.

Today `renderArrowScene` opens with `host.replaceChildren()`, so every arrow is
destroyed and recreated on every repaint - one End turn produced 190 add/remove
mutations. Nothing can fade because nothing survives a frame.

- [ ] **Step 1: Retain by key**

The host gains a retained `Map<string, SVGGElement>` across calls. Per render:
- a key present now and not before: append and fade IN;
- a key present before and not now: fade OUT, remove when the animation reports
  itself finished, and drop it from the map AT ONCE so a re-added key cannot
  collide with a corpse;
- a key present in both: update its geometry in place and animate to its new
  lane rather than rebuilding it.

The layout maths is unchanged; this is about identity and lifecycle only.

- [ ] **Step 2: The aim preview opts out**

`kind: "aim"` re-packs on every pointer move and must track the cursor. It gets
no enter or exit transition and no lane animation. Everything else fades.

- [ ] **Step 3: Tests**

`tests/arrow-scene.test.ts` already pins the layout. Add:
- a key present in two successive renders is the SAME element both times
  (identity, the property everything else rests on);
- a key that disappears is not removed synchronously, and IS removed once its
  animation reports itself finished;
- a key re-added while its predecessor is still fading gets a fresh element and
  the corpse does not steal it;
- the aim preview is rebuilt without a transition.

happy-dom has no WAAPI, so `runAnimation` falls back to a timer there; drive
these with the same fake-timer approach the existing animation tests use.

- [ ] **Step 4: Browser pass**

The user's requirement, stated literally: **arrows must fade in and out
smoothly, and never just appear or disappear.** Declare a raid and watch its
arrow fade in. End the turn and watch it fade out when it lands. Count the
add/remove mutations across one End turn with a MutationObserver and compare
against the 190 recorded before this work - a repaint that changes nothing
should produce none at all.

---

### Task 2: A resolution is drawn by the arrows that leave

**Files:** Modify `src/main.ts` (`flashResolutions`, `ghostGroup`),
`src/style.css` (`svg.replaying`).

`Beat.retires` has been populated since step 3 and is still unread. Step 3 also
gave a beat its `resolutions` - one arrow for a landing, two for a standoff.

- [ ] **Step 1: The beat retires its arrows**

A map beat's `retires` list names the march ids whose arrows this beat takes off
the board. They exit plain - a fade, no result label - and the beat's
`resolutions` are what carry the outcome.

- [ ] **Step 2: The resolution arrows join the retained scene**

They are keyed by transition and event rather than by any march, so they pack
along the border beside whatever else stands there, and they leave when the beat
ends. That is what lets `flashResolutions`' manual rebuild, the separate
`ghostGroup` layer, and the `svg.replaying { display: none }` rule all go - all
three existed only because a live rebuild used to wipe a mid-fade ghost, and
with identity a rebuild wipes nothing.

Check that claim before acting on it: if hiding the live arrows during a beat is
doing something the retained scene does not, say so rather than deleting the
rule and finding out in the browser.

- [ ] **Step 3: Browser pass**

Watch a raid land: its arrow fades out, the resolution arrow fades in on the
same border reading `N/M DMG` in neutral ink, the badge walks, the sound plays.
Watch a standoff: two arrows leave, two resolution arrows appear side by side,
one each way. Confirm no arrow is hidden abruptly at any point, and that a live
arrow standing on the same border as a resolution is packed beside it rather
than under it.

---

## Self-Review

**Spec coverage.** Section 6 of the design spec, and the `retires` half of
section 3 that step 3 left unread.

**Placeholders.** Both tasks name sites and required behaviour rather than
quoting bodies, because both are changes to existing functions whose current
shape the implementer must read. The properties to test are given literally.

**Type consistency.** `Beat.retires: number[]` and
`Beat.resolutions: ResolutionArrow[]` were defined in step 3 and are consumed
unchanged here. Arrow keys: marches are `march:<id>`, claims `claim:<key>`,
resolutions `resolution:<turn>:<ids>:<from>`, plus `aim`.

**Known risk.** Task 2 deletes three things at once on the strength of one
argument. If the argument turns out to be wrong for any of them, keep that one
and write down why rather than forcing the deletion.
