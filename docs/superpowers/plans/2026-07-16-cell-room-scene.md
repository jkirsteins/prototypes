# Cell Room Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After "Step into the room.", show a new room background and scene prose with a repeatable "Look around." choice that finds nothing specific, so the story no longer ends there.

**Architecture:** Extend the existing single ink story (`src/ink/coffin.ink`) with a `cell_room` knot the step-in choice diverts to, following the same loop pattern as `coffin_loop`. The background is driven by the existing `# image:` tag mechanism mapped in `main.ts`.

**Tech Stack:** inkjs (compiled via `npm run compile:ink`), TypeScript, Vite, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-cell-room-scene-design.md`.
- Show, don't tell: player-facing text must never contain "cell", "prison", "dungeon", or "coffin" - the player has not learned where they are.
- No meta language in player-facing text (no "tutorial", "CLUE FOUND:", etc.).
- No variable or attribute changes in this beat.
- `npm test` runs `compile:ink` first, so editing `coffin.ink` is enough; never hand-edit `coffin.json`.
- Only typable ASCII characters in prose (no em dashes, unicode ellipsis, or fancy quotes).

---

### Task 1: `cell_room` knot in the ink story (TDD)

**Files:**
- Modify: `src/ink/coffin.ink` (the `lid_open` knot at the end of the file)
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: `CoffinScene` snapshot API (`snapshot.imageId`, `snapshot.choices`, `snapshot.paragraphs`) - already exists, unchanged.
- Produces: story state after "Step into the room." with image tag `cell-room` and a sticky choice literally titled `Look around.` (Task 2 relies on the `cell-room` image id string).

- [ ] **Step 1: Update the tests to expect the room instead of story end**

In `src/ink/coffinScene.test.ts`:

1a. Extend the fiction-break guard. Add `"prison"` and `"dungeon"` to `FICTION_BREAKING_TERMS`:

```ts
const FICTION_BREAKING_TERMS = [
  "coffin",
  "prison",
  "dungeon",
  "tutorial",
  "build set",
  "clue found",
  "item gained",
  "memory gained",
  "deduction",
];
```

Add a word-boundary check for "cell" inside `expectNoFictionBreak` (substring matching would false-positive on words like "excellent"):

```ts
function expectNoFictionBreak(scene: CoffinScene): void {
  const text = visibleText(scene).toLowerCase();
  for (const term of FICTION_BREAKING_TERMS) {
    expect(text, `player-visible text must not contain "${term}"`).not.toContain(term);
  }
  expect(text, 'player-visible text must not contain "cell"').not.toMatch(/\bcells?\b/);
}
```

1b. Replace the test `"ends the scene after stepping into the room"` (currently asserts `choices` has length 0) with:

```ts
it("reveals the room after stepping in", () => {
  const scene = new CoffinScene();

  choose(scene, "Feel along the velvet.");
  choose(scene, "Work the loose nail free.");
  choose(scene, "Trace where the wood resists.");
  choose(scene, "Force the hinge with the nail.");
  choose(scene, "Step into the room.");

  expect(scene.snapshot.paragraphs.length).toBeGreaterThan(0);
  expect(scene.snapshot.imageId).toBe("cell-room");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});
```

1c. In the test `"offers only the step choice once the lid is open by force"`, replace the final assertion:

```ts
choose(scene, "Step into the room.");
expect(scene.snapshot.choices).toHaveLength(0);
```

with:

```ts
choose(scene, "Step into the room.");
expect(scene.snapshot.imageId).toBe("cell-room");
```

1d. Add a new test after `"reveals the room after stepping in"`:

```ts
it("keeps the room open after looking around finds nothing", () => {
  const scene = new CoffinScene();

  choose(scene, "Feel along the velvet.");
  choose(scene, "Work the loose nail free.");
  choose(scene, "Trace where the wood resists.");
  choose(scene, "Force the hinge with the nail.");
  choose(scene, "Step into the room.");

  choose(scene, "Look around.");
  expect(scene.snapshot.paragraphs.join(" ")).toContain(
    "Nothing in particular catches your eye.",
  );
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");

  choose(scene, "Look around.");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - `reveals the room after stepping in` (imageId is `lid-open`, no `Look around.` choice), `keeps the room open after looking around finds nothing` (choice `Look around.` not available), and `offers only the step choice once the lid is open by force` (imageId is `lid-open`). The other tests stay green.

- [ ] **Step 3: Add the `cell_room` knot to the ink story**

In `src/ink/coffin.ink`, change the end of the `lid_open` knot from:

```ink
+ [Step into the room.]
    You take hold of the worn edges and pull yourself up and over. Your legs are slow to remember their work, but they hold.

    Dust stirs around your feet and settles. The room accepts you without a sound.
    -> END
```

to:

```ink
+ [Step into the room.]
    You take hold of the worn edges and pull yourself up and over. Your legs are slow to remember their work, but they hold.

    Dust stirs around your feet and settles. The room accepts you without a sound.
    -> cell_room

=== cell_room ===
# image:cell-room
Cold rises through the flagstones and finds your bare ankles at once.

Grey light leans in through a barred window, strained through the ribbons of a curtain long past its duty. A heavy door stands shut in the far wall, banded in iron, with a small grille set at eye height. Along the stone, chains hang slack and patient, and a low pallet holds a blanket someone left twisted, as if they got up in a hurry.

A single candle burns in a sconce by the door. Somebody expects to come back.

-> cell_room_loop

=== cell_room_loop ===
+ [Look around.]
    You look, and look again. Nothing in particular catches your eye.
    -> cell_room_loop
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS - all tests green (the fiction-break guard also vets the new prose).

- [ ] **Step 5: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffin.json src/ink/coffinScene.test.ts
git commit -m "feat: cell room scene with look-around scaffold after stepping in"
```

---

### Task 2: Background asset and wiring

**Files:**
- Create: `public/backgrounds/cell-room.png` (copy of user-supplied image)
- Modify: `src/main.ts:14-16` (the `BACKGROUNDS` map)

**Interfaces:**
- Consumes: image id string `cell-room` emitted by the `# image:cell-room` tag from Task 1.
- Produces: player-visible background swap; no code interface for later tasks.

- [ ] **Step 1: Copy the asset into the project**

```bash
cp "/Users/janis.kirsteins/Downloads/3d6b2591-46d3-4944-a5ad-46ffaedf938c.png" public/backgrounds/cell-room.png
```

Verify: `ls -la public/backgrounds/` shows `cell-room.png` alongside `awakening.png` and `lid-open.png`, with a plausible file size (roughly a few MB, same order as `lid-open.png`).

- [ ] **Step 2: Register the background in `main.ts`**

Change:

```ts
const BACKGROUNDS: Record<string, string> = {
  "lid-open": `${import.meta.env.BASE_URL}backgrounds/lid-open.png`,
};
```

to:

```ts
const BACKGROUNDS: Record<string, string> = {
  "lid-open": `${import.meta.env.BASE_URL}backgrounds/lid-open.png`,
  "cell-room": `${import.meta.env.BASE_URL}backgrounds/cell-room.png`,
};
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: compile:ink, tsc, and vite build all succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add public/backgrounds/cell-room.png src/main.ts
git commit -m "feat: cell room background image wiring"
```

---

### Post-implementation verification (per AGENTS.md)

After both tasks: offer the user an end-to-end check in a real browser (Playwright / chrome-devtools against `npm run dev`): escape the coffin, choose "Step into the room.", confirm the new background renders and "Look around." loops with the nothing-specific line.
