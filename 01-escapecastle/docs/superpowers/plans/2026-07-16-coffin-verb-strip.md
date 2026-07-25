# Coffin Scene on the Verb Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the coffin scene's verb+object actions (feel velvet, take nail, force hinge) onto the spotted/inventory verb strip, leaving ink choices only for manner/intention actions (push, call, trace, remember).

**Architecture:** Ink stays the single source of truth (spec: `docs/superpowers/specs/2026-07-16-coffin-verb-strip-design.md`). A new `current_room` ink VAR plus a `room_return` knot lets the shared `interact` dispatcher divert back to whichever loop the player is in (`coffin_loop`, `lid_open_loop`, or `cell_room_loop`). Coffin objects `lining`, `nail`, `hinge` join the items LIST; `start` spots the lining so the strip appears from the first beat; `lid_open` clears coffin-local spotted entries. No changes to `coffinScene.ts` or `main.ts`.

**Tech Stack:** ink (inkjs 2.x), TypeScript, Vite, Vitest. `npm test` recompiles the ink (`inkjs-compiler src/ink/coffin.ink -o src/ink/coffin.json`) then runs Vitest.

## Global Constraints

- Never break the fiction: player-visible text must never contain "coffin", "cell", "prison", "dungeon", "tutorial", "build set", "clue found", "item gained", "memory gained", "deduction" (enforced by `expectNoFictionBreak` in the test file).
- Mechanics stay hidden: no stats/flags in player-facing prose; state changes are silent.
- Minimal UI: no new UI elements; the existing strip is reused untouched.
- Prose and code use only typable ASCII punctuation: no em dashes, no unicode arrows/ellipsis/fancy quotes.
- `ITEM_LABELS` keys must exactly match the ink `LIST items` ids (enforced by the "item labels" test).
- Every task ends with `npm test` green and a commit.

---

### Task 1: `room_return` plumbing (behavior-neutral refactor)

**Files:**
- Modify: `src/ink/coffin.ink`
- Test: `src/ink/coffinScene.test.ts` (existing suite only; no new tests)

**Interfaces:**
- Produces: ink VAR `current_room` ("coffin" | "cell"), knot `room_return` (diverts to `cell_room_loop` when `current_room == "cell"`, to `lid_open_loop` when `escaped`, else to `coffin_loop`), knot `lid_open_loop` (holds the "Step into the room." choice). Later tasks divert every interact stitch here.

- [ ] **Step 1: Confirm the suite is green before refactoring**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Add the `current_room` variable**

In `src/ink/coffin.ink`, after the line `VAR light_scanned = false`, add:

```
VAR current_room = "coffin"
```

- [ ] **Step 3: Split `lid_open` into knot + loop**

Replace:

```
+ [Step into the room.]
    You take hold of the worn edges and pull yourself up and over. Your legs are slow to remember their work, but they hold.

    Dust stirs around your feet and settles. The room accepts you without a sound.
    -> cell_room
```

(the choice at the end of `=== lid_open ===`) with:

```
-> lid_open_loop

=== lid_open_loop ===
+ [Step into the room.]
    You take hold of the worn edges and pull yourself up and over. Your legs are slow to remember their work, but they hold.

    Dust stirs around your feet and settles. The room accepts you without a sound.
    -> cell_room
```

- [ ] **Step 4: Mark the cell room as the current room**

In `=== cell_room ===`, directly after the `# image:cell-room` line, add:

```
~ current_room = "cell"
```

- [ ] **Step 5: Add the `room_return` knot**

Directly above `=== interact(verb, item) ===`, add:

```
=== room_return ===
{ current_room == "cell": -> cell_room_loop }
{ escaped: -> lid_open_loop }
-> coffin_loop
```

- [ ] **Step 6: Route all interact stitches through `room_return`**

From the `=== interact(verb, item) ===` line to the end of the file, replace every occurrence of `-> cell_room_loop` with `-> room_return` (12 occurrences: `look_table`, `look_drawer`, `use_table` is unaffected since it ends in `-> force_drawer`, `use_drawer` has one inside the `{ drawer_open: }` block, `force_drawer`, `look_tinderbox`, `use_tinderbox`, `look_candle`, `use_candle`, `look_hanging`, `look_cage`, `look_bucket`, `interact_fallback`). Do NOT touch the `-> cell_room_loop` inside the "Look around." choice in `=== cell_room_loop ===` itself.

- [ ] **Step 7: Verify no behavior change**

Run: `npm test`
Expected: all tests PASS (same set as step 1).

- [ ] **Step 8: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffin.json
git commit -m "refactor: room_return knot so interact stitches divert to the current room"
```

---

### Task 2: Coffin items in the LIST, lining spotted from the first beat

**Files:**
- Modify: `src/ink/coffin.ink`
- Modify: `src/itemLabels.ts`
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: LIST ids `lining`, `nail`, `hinge` with labels "velvet", "nail", "hinge"; `spotted == ["lining"]` at story start; opening prose no longer names the brass plate.

- [ ] **Step 1: Write the failing test**

In `src/ink/coffinScene.test.ts`, inside `describe("opening ink scene", ...)`, after the test `"never breaks the fiction in the opening beat"`, add:

```ts
  it("spots the velvet lining from the first beat and keeps the plate unnamed", () => {
    const scene = new CoffinScene();

    expect(scene.snapshot.spotted).toEqual(["lining"]);
    expect(scene.snapshot.paragraphs.join(" ").toLowerCase()).not.toContain("brass");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - `spotted` is `[]`, and the "item labels" test also fails once the LIST changes (next step keeps both in one cycle; at this point only the new test fails).

- [ ] **Step 3: Extend the LIST, spot the lining, drop the plate from the opening**

In `src/ink/coffin.ink` replace:

```
LIST items = table, drawer, tinderbox, candle, hanging, cage, bucket
```

with:

```
LIST items = lining, nail, hinge, table, drawer, tinderbox, candle, hanging, cage, bucket
```

Replace the opening of `=== start ===`:

```
=== start ===
# image:coffin
Darkness. The air is stale and tastes of dust.

Velvet presses against your shoulders. Wood waits inches above your face. Somewhere near your right hand, a small brass plate rasps softly when you breathe.
```

with:

```
=== start ===
# image:coffin
~ spotted += lining
Darkness. The air is stale and tastes of dust.

Velvet presses against your shoulders. Wood waits inches above your face.
```

- [ ] **Step 4: Add the new item labels**

Replace the body of `src/itemLabels.ts`:

```ts
// Maps ink LIST item ids (src/ink/coffin.ink `LIST items`) to player-facing labels.
export const ITEM_LABELS: Record<string, string> = {
  lining: "velvet",
  nail: "nail",
  hinge: "hinge",
  table: "table",
  drawer: "drawer",
  tinderbox: "small tin",
  candle: "candle",
  hanging: "wall hanging",
  cage: "iron cage",
  bucket: "bucket",
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS, including the new test and the "item labels" parity test.

- [ ] **Step 6: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffin.json src/itemLabels.ts src/ink/coffinScene.test.ts
git commit -m "feat: coffin objects join the item list and the lining is spotted from the start"
```

---

### Task 3: Coffin strip interactions (lining, nail, hinge) replace four ink choices

**Files:**
- Modify: `src/ink/coffin.ink`
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: `room_return` (Task 1), LIST ids and labels (Task 2).
- Produces: dispatcher handlers `look_lining`, `look_nail`, `use_nail`, `look_hinge`, `use_hinge`; the trace ink choice sets `~ spotted += hinge`; ink choices "Feel along the velvet.", "Work the loose nail free.", "Think about the loose nail.", "Force the hinge with the nail." are gone; VARs `lining_seen`, `nail_seen`, `nail_taken` are gone. Test helper `enterRoomByWits(scene)` for later tasks.

- [ ] **Step 1: Write the failing tests**

In `src/ink/coffinScene.test.ts`, after the `enterRoomByForce` helper, add:

```ts
function enterRoomByWits(scene: CoffinScene): void {
  interact(scene, "look", "lining");
  interact(scene, "use", "nail");
  choose(scene, "Trace where the wood resists.");
  interact(scene, "use", "hinge");
  choose(scene, "Step into the room.");
}
```

Replace the test `"sets an ingenuity build by finding the nail and forcing the hinge"` with:

```ts
  it("sets an ingenuity build by finding the nail and forcing the hinge", () => {
    const scene = new CoffinScene();

    interact(scene, "look", "lining");
    expect(scene.snapshot.spotted).toContain("nail");

    interact(scene, "use", "nail");
    expect(scene.snapshot.inventory).toContain("nail");
    expect(scene.snapshot.spotted).not.toContain("nail");

    choose(scene, "Trace where the wood resists.");
    expect(scene.snapshot.spotted).toContain("hinge");

    interact(scene, "use", "hinge");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("ingenious");
    expect(scene.snapshot.attributes.ingenuity).toBe(2);
    expect(scene.snapshot.imageId).toBe("lid-open");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Step into the room.",
    );
  });
```

Replace the test `"keeps the escape unreachable until both nail and hinge are found"` with:

```ts
  it("keeps the escape unreachable until the hinge is found and the nail is carried", () => {
    const scene = new CoffinScene();

    scene.interact("use", "hinge");
    expect(scene.snapshot.escaped).toBe(false);

    interact(scene, "look", "lining");
    interact(scene, "use", "nail");
    scene.interact("use", "hinge");
    expect(scene.snapshot.escaped).toBe(false);

    choose(scene, "Trace where the wood resists.");
    interact(scene, "use", "hinge");
    expect(scene.snapshot.escaped).toBe(true);
  });
```

Add three new tests after it:

```ts
  it("refuses the hinge to bare fingers", () => {
    const scene = new CoffinScene();

    choose(scene, "Trace where the wood resists.");
    interact(scene, "use", "hinge");

    expect(scene.snapshot.escaped).toBe(false);
    expect(scene.snapshot.paragraphs.join(" ")).toContain("Flesh loses to iron");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Push against the wood above you.",
    );
  });

  it("answers unauthored combinations in the dark and stays in the dark", () => {
    const scene = new CoffinScene();

    interact(scene, "use", "lining");

    expect(scene.snapshot.paragraphs.join(" ")).toContain("nothing comes of it");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Push against the wood above you.",
    );
  });

  it("covers the lining and nail look/use branches at every stage", () => {
    const scene = new CoffinScene();

    interact(scene, "look", "lining");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("loose in its post");

    interact(scene, "look", "nail");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("not made to hold you");

    interact(scene, "look", "lining");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("given up all it knows");

    interact(scene, "use", "nail");
    expect(scene.snapshot.inventory).toContain("nail");

    interact(scene, "look", "nail");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("rides your fist");

    interact(scene, "use", "nail");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("worth prying");
  });
```

Update the four tests that still enter the room via the removed choices. In `"reveals the room after stepping in"`, `"keeps the room open after looking around finds nothing new"`, `"keeps the drawer stuck without strength"`, and `"finds the drawer under the table but cannot force it weak-handed"`, replace the five lines:

```ts
    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");
    choose(scene, "Step into the room.");
```

with:

```ts
    enterRoomByWits(scene);
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL - `interact(scene, "look", "lining")` produces the fallback line (no handler yet), the ingenuity tests cannot find "Trace where the wood resists." payoffs, and `enterRoomByWits` cannot escape.

- [ ] **Step 3: Implement the ink changes**

In `src/ink/coffin.ink`:

3a. Delete the three VAR lines:

```
VAR lining_seen = false
VAR nail_seen = false
VAR nail_taken = false
```

3b. In `=== start ===`, replace the conditional:

```
{ nail_taken:
The bent nail rests in your fist, ugly and useful.
}
```

with:

```
{ inventory ? nail:
The bent nail rests in your fist, ugly and useful.
}
```

3c. In `=== coffin_loop ===`, delete these four choices entirely:

```
+ {not lining_seen} [Feel along the velvet.]
    # image:coffin-lining
    ~ lining_seen = true
    ~ nail_seen = true
    Your fingers find a torn seam in the velvet, then a rough nub of metal beneath it. A nail, loose in its post.
    -> coffin_loop

+ {nail_seen and not nail_taken} [Work the loose nail free.]
    # image:coffin-nail
    ~ nail_taken = true
    You worry the nail back and forth until it gives up its tiny post. It is bent, sharp, and mean enough to matter.
    -> coffin_loop
```

```
+ {nail_taken and hinge_seen} [Force the hinge with the nail.]
    # image:coffin-hinge
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the metal complains.

    It is not a key. It is not a tool. But it is enough. The hinge buckles, and the wood above you swings open with the offended groan of old carpentry.
    -> lid_open

+ {lining_seen and not nail_taken} [Think about the loose nail.]
    # image:coffin-nail
    It is small, but it is the only thing in here that was not made to hold you.
    -> coffin_loop
```

3d. Replace the trace choice:

```
+ {not hinge_seen} [Trace where the wood resists.]
    # image:coffin-hinge
    ~ hinge_seen = true
    You follow the resistance to one side. There: a cramped hinge, half-hidden behind the edge of the brass plate.
    -> coffin_loop
```

with:

```
+ {not hinge_seen} [Trace where the wood resists.]
    # image:coffin-hinge
    ~ hinge_seen = true
    ~ spotted += hinge
    You follow the resistance to one side, past a small brass plate that rasps under your knuckles. There: a cramped hinge, half-hidden behind the plate's edge.
    -> coffin_loop
```

3e. In `=== interact(verb, item) ===`, add these lines above the existing `{ verb == "look" and item == "table": -> look_table }` line:

```
{ verb == "look" and item == "lining": -> look_lining }
{ verb == "look" and item == "nail": -> look_nail }
{ verb == "use" and item == "nail": -> use_nail }
{ verb == "look" and item == "hinge": -> look_hinge }
{ verb == "use" and item == "hinge": -> use_hinge }
```

3f. Add the five stitches directly after the dispatcher's `-> interact_fallback(verb, item)` line (i.e. as the first stitches of the `interact` knot, before `= look_table`):

```
= look_lining
# image:coffin-lining
{ (spotted ? nail) or (inventory ? nail):
    You go over the seam again, corner to corner. The velvet has given up all it knows.
- else:
    ~ spotted += nail
    Your fingers find a torn seam in the velvet, then a rough nub of metal beneath it. A nail, loose in its post.
}
-> room_return

= look_nail
# image:coffin-nail
{ inventory ? nail:
    Bent, sharp, and mean enough to matter. It rides your fist like it belongs there.
- else:
    It is small, but it is the only thing in here that was not made to hold you.
}
-> room_return

= use_nail
# image:coffin-nail
{ inventory ? nail:
    You turn the nail over in your fingers. It is waiting for something worth prying.
- else:
    ~ spotted -= nail
    ~ inventory += nail
    You worry the nail back and forth until it gives up its tiny post. It is bent, sharp, and mean enough to matter.
}
-> room_return

= look_hinge
# image:coffin-hinge
The hinge is cramped and stiff, its pin barely proud of the leaf. It was made to swing for someone standing outside.
-> room_return

= use_hinge
# image:coffin-hinge
{ inventory ? nail:
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the metal complains.

    It is not a key. It is not a tool. But it is enough. The hinge buckles, and the wood above you swings open with the offended groan of old carpentry.
    -> lid_open
- else:
    You work a fingertip into the hinge gap and pry. Flesh loses to iron, the way it always has.
}
-> room_return
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffin.json src/ink/coffinScene.test.ts
git commit -m "feat: lining, nail, and hinge move onto the verb strip"
```

---

### Task 4: Clear coffin objects at lid-open; carried nail persists

**Files:**
- Modify: `src/ink/coffin.ink`
- Test: `src/ink/coffinScene.test.ts`

**Interfaces:**
- Consumes: `enterRoomByWits` (Task 3), `lid_open_loop` (Task 1).
- Produces: `lid_open` clears `lining`, `nail`, `hinge` from `spotted`; inventory rides through.

- [ ] **Step 1: Write the failing tests**

Add to `src/ink/coffinScene.test.ts`:

```ts
  it("leaves the dark's objects behind when the way opens", () => {
    const scene = new CoffinScene();
    enterRoomByWits(scene);

    expect(scene.snapshot.spotted).not.toContain("lining");
    expect(scene.snapshot.spotted).not.toContain("nail");
    expect(scene.snapshot.spotted).not.toContain("hinge");
    expect(scene.snapshot.inventory).toContain("nail");
  });

  it("carries the nail through a forced escape", () => {
    const scene = new CoffinScene();

    interact(scene, "look", "lining");
    interact(scene, "use", "nail");
    for (let push = 0; push < 5; push += 1) {
      choose(scene, "Push against the wood above you.");
    }

    expect(scene.snapshot.spotted).toEqual([]);
    expect(scene.snapshot.inventory).toContain("nail");

    interact(scene, "look", "nail");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toEqual([
      "Step into the room.",
    ]);

    choose(scene, "Step into the room.");
    expect(scene.snapshot.inventory).toContain("nail");
    expect(scene.snapshot.spotted).toContain("candle");
  });
```

The second test also proves `room_return` sends a mid-lid-open interaction back to `lid_open_loop` instead of ending the story.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - `spotted` still contains `lining` (and `hinge` on the wits path) after the lid opens.

- [ ] **Step 3: Clear coffin-local spotted entries in `lid_open`**

In `=== lid_open ===`, directly after the `# image:lid-open` line, add:

```
~ spotted -= (lining, nail, hinge)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ink/coffin.ink src/ink/coffin.json src/ink/coffinScene.test.ts
git commit -m "feat: lid-open clears the dark's spotted objects, carried nail rides along"
```

---

### Task 5: End-to-end browser verification (Playwright/Chrome)

**Files:**
- None modified (verification only; fix regressions if found).

**Interfaces:**
- Consumes: the full feature.

- [ ] **Step 1: Start the dev server**

Run in background: `npm run dev`
Expected: Vite serves on `http://127.0.0.1:5173/`.

- [ ] **Step 2: Verify the wits path in a real browser**

Using the browser tools (chrome-devtools MCP), navigate to `http://127.0.0.1:5173/` and confirm:

1. The verb strip is visible from the first beat: "look" and "use" plus the word "velvet". The opening prose does not mention a brass plate.
2. With "look" selected, click "velvet": prose about the torn seam and nail; "nail" appears in the strip.
3. Select "use", click "nail": the nail moves to the carried cluster on the right of the strip.
4. Click the ink choice "Trace where the wood resists.": "hinge" appears in the strip.
5. With "use" selected, click "hinge": the lid-open beat plays (background swaps to the lid-open image), only "Step into the room." remains as a choice, and the strip no longer shows velvet or hinge but still shows the carried nail.
6. Click "Step into the room.": the room scene renders, strip shows "candle" plus the carried "nail".

- [ ] **Step 3: Verify the strength path and the empty-handed hinge**

Toggle the debug panel with the backtick key and click "Reset story". Then confirm:

1. Click "Trace where the wood resists.", select "use", click "hinge": in-fiction failure prose ("Flesh loses to iron..."), still in the dark, choices intact.
2. Click "Push against the wood above you." five times: the lid opens, step into the room, strip shows "candle" and nothing carried.
3. Toggle the debug panel closed.

- [ ] **Step 4: Stop the dev server and report**

Stop the background dev server. Report verification results; if any check failed, fix and re-run before claiming completion.

---

## Self-Review Notes

- Spec coverage: action mapping (Task 3), spotting and opening-prose adjustment (Task 2), room_return/current_room/lid_open_loop (Task 1), lid-open cleanup and nail persistence (Task 4), labels (Task 2), tests (Tasks 2-4), browser verification (Task 5). Flag cleanup for `lining_seen`/`nail_seen`/`nail_taken` in Task 3; `hinge_seen` stays, as the spec requires.
- The ink compiles as part of `npm test`, so every task's test run also validates ink syntax.
- `spotted ? nail` disambiguated with parentheses in `look_lining` to avoid `or` precedence surprises.
