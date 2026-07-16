# Cell Room Exits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the post-coffin cell room a real exit - three routes (strength/candle, ingenuity via a guard-niche, and a -1 caution fallback) all converging on the cell door, which opens into a stubbed corridor room where scene1 ends - and add `perception`/`sanity` stats held at 0.

**Architecture:** All game logic lives in `src/ink/scene1.ink` (compiled to `scene1.json` by `npm run compile:ink`, which runs automatically before tests). The `Scene1` TypeScript wrapper (`src/ink/scene1.ts`) exposes a snapshot; `src/main.ts` renders it and maps image tags to background PNGs; `src/itemLabels.ts` maps LIST item ids to player-facing labels. We extend the Ink with new items, knots, and choices, and thread two new stat variables through the snapshot and debug panel.

**Tech Stack:** TypeScript, Vite, inkjs + inkjs-compiler, Vitest. Plain CSS. No backend.

## Global Constraints

- **Never break the fiction.** Player-visible text (paragraphs AND choice labels) must never contain the words `cell`, `prison`, `coffin`, `dungeon`, `tutorial`, or meta phrases (`build set`, `clue found`, `item gained`, `memory gained`, `deduction`). The test `expectNoFictionBreak` enforces this on every `choose`/`interact` in the test helpers. All authored strings below already comply - copy them verbatim.
- **No em dashes / no fancy unicode** in any file. Use `-`, straight quotes, and `...`.
- **Item labels are 1:1 with the Ink LIST.** The test "has exactly one label per item defined in the ink LIST" fails unless `Object.keys(ITEM_LABELS)` exactly equals the `LIST items` ids. Whenever you add a LIST item, add its label in the same commit.
- **Never create an unwinnable state.** Every build must retain a working route out of the cell; the caution route is the universal fallback and must always be reachable once the door has been tried.
- **Stats stay hidden from the player.** `perception`/`sanity` appear only in the debug panel, never in prose.
- **Run tests with `npm test`** (compiles Ink, then runs Vitest). Never edit `src/ink/scene1.json` by hand - it is generated.

---

## File Structure

- `src/ink/scene1.ink` - all new items, variables, knots, and choices (the bulk of the work).
- `src/ink/scene1.ts` - add `perception`/`sanity` to the snapshot `attributes`.
- `src/itemLabels.ts` - add labels for `door`, `window`, `key`.
- `src/main.ts` - map `guard-niche`/`corridor` image tags to backgrounds; add `perception`/`sanity` debug rows.
- `src/ink/scene1.test.ts` - new tests per task.
- `public/backgrounds/guard-niche.png`, `public/backgrounds/corridor.png` - already placed (1672x941). No action needed.

---

## Task 1: perception and sanity stats

**Files:**
- Modify: `src/ink/scene1.ink` (VAR declarations, near the top with the other `VAR` lines)
- Modify: `src/ink/scene1.ts` (the `Scene1Snapshot` type and `snapshot` getter)
- Modify: `src/main.ts` (`renderDebug`)
- Test: `src/ink/scene1.test.ts`

**Interfaces:**
- Produces: `Scene1Snapshot.attributes` gains `perception: number` and `sanity: number`, both always `0` for now. Later tasks read these in tests.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("opening ink scene", ...)` block in `src/ink/scene1.test.ts`:

```ts
it("tracks perception and sanity, held at zero", () => {
  const scene = new Scene1();

  expect(scene.snapshot.attributes.perception).toBe(0);
  expect(scene.snapshot.attributes.sanity).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run scene1`
Expected: FAIL - `attributes.perception` is `undefined` (type error / `undefined` not `0`).

- [ ] **Step 3: Add the Ink variables**

In `src/ink/scene1.ink`, add these two lines immediately after `VAR ingenuity = 0`:

```ink
VAR perception = 0
VAR sanity = 0
```

- [ ] **Step 4: Expose them in the snapshot**

In `src/ink/scene1.ts`, update the `attributes` type in `Scene1Snapshot`:

```ts
  attributes: {
    caution: number;
    ingenuity: number;
    perception: number;
    sanity: number;
    strength: number;
  };
```

And update the `attributes` object in the `snapshot` getter:

```ts
      attributes: {
        caution: this.numberVariable("caution"),
        ingenuity: this.numberVariable("ingenuity"),
        perception: this.numberVariable("perception"),
        sanity: this.numberVariable("sanity"),
        strength: this.numberVariable("strength"),
      },
```

- [ ] **Step 5: Show them in the debug panel**

In `src/main.ts`, in `renderDebug`, add two rows after the `ingenuity` row:

```ts
        <div><dt>ingenuity</dt><dd>${snapshot.attributes.ingenuity}</dd></div>
        <div><dt>perception</dt><dd>${snapshot.attributes.perception}</dd></div>
        <div><dt>sanity</dt><dd>${snapshot.attributes.sanity}</dd></div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 7: Commit**

```bash
git add src/ink/scene1.ink src/ink/scene1.ts src/main.ts src/ink/scene1.test.ts
git commit -m "feat: track perception and sanity stats, held at zero"
```

---

## Task 2: the door, the corridor stub, and the caution fallback

Delivers: the cell door becomes interactable; trying it while locked prints a response and arms the caution route; the strength/candle route (light -> see hinge pins -> lift the door) opens it; the caution route (throw your weight) always opens it once tried; either way you land in the stubbed corridor and scene1 ends.

**Files:**
- Modify: `src/ink/scene1.ink`
- Modify: `src/itemLabels.ts`
- Modify: `src/main.ts` (`BACKGROUNDS`)
- Test: `src/ink/scene1.test.ts`

**Interfaces:**
- Consumes: existing `enterRoomByForce`/`enterRoomByWits` test helpers; existing `candle_lit`, `strength`, `caution`, `current_room` variables.
- Produces: LIST items `door`, `key`, `window` exist; variables `door_tried`, `pins_seen`, `door_open`; knots `corridor`, `corridor_loop`, `caution_door`, `look_door`, `use_door`; image tag `corridor` maps to a background. `use_door` opens the door when (`pins_seen` and `strength >= 2`) or (`inventory ? key`); otherwise sets `door_tried`. Reaching `corridor` sets `imageId` to `corridor` and offers the single choice `Start down the gallery.`

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe("opening ink scene", ...)` in `src/ink/scene1.test.ts`:

```ts
it("keeps the door shut and arms nothing but a warning on the first try", () => {
  const scene = new Scene1();
  enterRoomByForce(scene);

  interact(scene, "use", "door");

  expect(scene.snapshot.imageId).toBe("cell-room");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("carried the key away");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
    "Throw your weight against the door.",
  );
});

it("opens the door by candlelight and strength, into the gallery beyond", () => {
  const scene = new Scene1();
  enterRoomByForce(scene);
  choose(scene, "Look around.");
  interact(scene, "use", "table");
  interact(scene, "take", "tinderbox");
  interact(scene, "use", "candle");

  interact(scene, "look", "door");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("hinge pins");

  interact(scene, "use", "door");
  expect(scene.snapshot.imageId).toBe("corridor");
  expect(scene.snapshot.paragraphs.join(" ")).toContain("gallery of grey stone");

  choose(scene, "Start down the gallery.");
  expect(scene.snapshot.choices).toEqual([]);
});

it("does not reveal the hinge pins until the candle is lit", () => {
  const scene = new Scene1();
  enterRoomByForce(scene);

  interact(scene, "look", "door");
  expect(scene.snapshot.paragraphs.join(" ")).not.toContain("hinge pins");

  interact(scene, "use", "door");
  expect(scene.snapshot.imageId).toBe("cell-room");
});

it("bursts the door open recklessly at the cost of caution", () => {
  const scene = new Scene1();
  enterRoomByWits(scene);

  interact(scene, "use", "door");
  choose(scene, "Throw your weight against the door.");

  expect(scene.snapshot.attributes.caution).toBe(-1);
  expect(scene.snapshot.imageId).toBe("corridor");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run scene1`
Expected: FAIL - `door` is not a discovered item, so `interact("use","door")` is ignored and `imageId` stays `cell-room` with no matching paragraphs.

- [ ] **Step 3: Add LIST items and their labels**

In `src/ink/scene1.ink`, replace the `LIST items` line with:

```ink
LIST items = lining, nail, hinge, table, drawer, tinderbox, candle, hanging, cage, bucket, door, window, key
```

Add these three new variables immediately after `VAR sanity = 0` (from Task 1):

```ink
VAR door_tried = false
VAR pins_seen = false
VAR door_open = false
```

In `src/itemLabels.ts`, add three entries to `ITEM_LABELS` (after `bucket`):

```ts
  bucket: "bucket",
  door: "door",
  window: "window",
  key: "iron key",
```

- [ ] **Step 4: Spot the door on entering the cell**

In `src/ink/scene1.ink`, in the `=== cell_room ===` knot, replace the line `~ spotted += candle` with:

```ink
~ spotted += (candle, door, window)
```

- [ ] **Step 5: Dispatch the door verbs**

In `src/ink/scene1.ink`, in the `=== interact(verb, item) ===` knot, add these two lines immediately before `-> interact_fallback(verb, item)`:

```ink
{ verb == "look" and item == "door": -> look_door }
{ verb == "use" and item == "door": -> use_door }
```

- [ ] **Step 6: Add the door knots**

In `src/ink/scene1.ink`, add these knots immediately after the `= look_bucket` stitch (before `=== interact_fallback ===`):

```ink
= look_door
{ candle_lit:
    ~ pins_seen = true
    By the candlelight you can see what the dark kept hidden: the great hinges sit on this side, their pins seated but never peened over. Drive them up and out, and the slab itself becomes the way through.
- else:
    Iron-banded oak, a grille at eye height, a keyhole gone black with age. It was built to keep something in, and it has not forgotten the work.
}
-> room_return

= use_door
{ door_open:
    -> corridor
}
{ pins_seen && strength >= 2:
    ~ door_open = true
    You set your shoulder beneath the door's edge and drive the hinge pins up out of their seats, one and then the other. The whole slab tips loose of its frame, and you walk it aside far enough to pass.
    -> corridor
}
{ inventory ? key:
    ~ door_open = true
    You fit the rust-black key to the keyhole. It bites, resists, then turns with a deep iron clunk, and the lock lets go.
    -> corridor
}
~ door_tried = true
You try the door. It does not give a hair. The lock is a heavy warded thing, and there is no key in it - whoever turned it last carried the key away.
-> room_return
```

- [ ] **Step 7: Add the caution choice and its knot**

In `src/ink/scene1.ink`, in `=== cell_room_loop ===`, add this choice immediately after the `+ [Look around.]` choice block (as a new top-level choice in the loop):

```ink
+ { door_tried && not door_open } [Throw your weight against the door.]
    -> caution_door
```

Add this knot immediately after the `=== cell_room_loop ===` knot (before `=== room_return ===`):

```ink
=== caution_door ===
~ door_open = true
~ caution = caution - 1
You back off a step and hurl your whole weight at the door. The iron holds - but the wood around it is old and worm-run, and on the third blow the frame lets go with a crack and the whole slab bursts outward.
-> corridor
```

- [ ] **Step 8: Add the corridor stub and route to it**

In `src/ink/scene1.ink`, replace the entire `=== room_return ===` knot with (adds the corridor case):

```ink
=== room_return ===
{ current_room == "corridor": -> corridor_loop }
{ current_room == "cell": -> cell_room_loop }
{ escaped: -> lid_open_loop }
-> coffin_loop
```

Add these two knots immediately after `=== caution_door ===`:

```ink
=== corridor ===
# image:corridor
~ current_room = "corridor"
~ spotted = ()
The door gives, and the cold breath of a far larger place moves past you.

You step out onto a gallery of grey stone. A staircase curls up toward a high window where real daylight - thin, but daylight - lies across the steps. Tall arched panes march down one wall, and beyond them: open sky, and the blue suggestion of hills a long way off. A strip of red carpet, worn to its threads, runs the length of the floor. Portraits watch from their frames, pale men in old collars, their painted eyes turned toward a door at the far end. A suit of armour stands sentinel beside it, and does not move.

Out of the dark that held you, at last. Nowhere near out of the castle.
-> corridor_loop

=== corridor_loop ===
+ [Start down the gallery.]
    Your bare feet find the cold carpet, and the castle takes the sound without an echo.
    -> END
```

- [ ] **Step 9: Map the corridor background**

In `src/main.ts`, add this entry to the `BACKGROUNDS` object (after the `"cell-room-lit"` line):

```ts
  "cell-room-lit": `${import.meta.env.BASE_URL}backgrounds/cell-room-lit.png`,
  corridor: `${import.meta.env.BASE_URL}backgrounds/corridor.png`,
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing tests plus the four new ones). If the label test fails, re-check Step 3 added exactly `door`, `window`, `key` labels.

- [ ] **Step 11: Commit**

```bash
git add src/ink/scene1.ink src/itemLabels.ts src/main.ts src/ink/scene1.test.ts
git commit -m "feat: cell door opens by candlelight+strength or reckless force, into the corridor stub"
```

---

## Task 3: the ingenuity route through the guard-niche

Delivers: the ingenious player (who carries the nail but has no strength for the drawer) prises a bar out of the barred opening, squeezes into the guard-niche, takes the iron key, slips back, and unlocks the door with it. Exercises room-to-room travel with a carried item.

**Files:**
- Modify: `src/ink/scene1.ink`
- Modify: `src/main.ts` (`BACKGROUNDS`)
- Test: `src/ink/scene1.test.ts`

**Interfaces:**
- Consumes: `use_door`'s existing `inventory ? key` branch (Task 2); `bars_pried`, `saved_spotted` (added here); the `key`/`window` LIST items and labels (added in Task 2).
- Produces: variables `bars_pried`, `saved_spotted`; knots `enter_niche`, `guard_niche`, `guard_niche_loop`, `look_window`, `use_window`, `look_key`, `use_key`, `take_key`; image tag `guard-niche` maps to a background; cell loop choice `Squeeze through the gap.`; niche loop choice `Slip back through the gap.`

- [ ] **Step 1: Write the failing tests**

Add these tests inside `describe("opening ink scene", ...)` in `src/ink/scene1.test.ts`:

```ts
it("prises the bars, fetches the key from the niche, and unlocks the door", () => {
  const scene = new Scene1();
  enterRoomByWits(scene);

  interact(scene, "use", "window");
  expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
    "Squeeze through the gap.",
  );

  choose(scene, "Squeeze through the gap.");
  expect(scene.snapshot.imageId).toBe("guard-niche");
  expect(scene.snapshot.spotted).toContain("key");

  interact(scene, "take", "key");
  expect(scene.snapshot.inventory).toContain("key");

  choose(scene, "Slip back through the gap.");
  expect(scene.snapshot.imageId).toBe("cell-room");
  expect(scene.snapshot.spotted).toContain("door");
  expect(scene.snapshot.spotted).not.toContain("key");

  interact(scene, "use", "door");
  expect(scene.snapshot.imageId).toBe("corridor");
});

it("cannot prise the bars bare-handed and offers no way through", () => {
  const scene = new Scene1();
  enterRoomByForce(scene);

  interact(scene, "use", "window");

  expect(scene.snapshot.paragraphs.join(" ")).toContain("no match for them");
  expect(scene.snapshot.choices.map((choice) => choice.text)).not.toContain(
    "Squeeze through the gap.",
  );
});

it("keeps perception and sanity at zero along the ingenuity route", () => {
  const scene = new Scene1();
  enterRoomByWits(scene);
  interact(scene, "use", "window");
  choose(scene, "Squeeze through the gap.");
  interact(scene, "take", "key");
  choose(scene, "Slip back through the gap.");
  interact(scene, "use", "door");

  expect(scene.snapshot.attributes.perception).toBe(0);
  expect(scene.snapshot.attributes.sanity).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run scene1`
Expected: FAIL - `interact("use","window")` currently falls through to `interact_fallback` (no `use_window` knot), so no `Squeeze through the gap.` choice appears.

- [ ] **Step 3: Add the niche variables**

In `src/ink/scene1.ink`, add these two lines immediately after `VAR door_open = false` (from Task 2):

```ink
VAR bars_pried = false
VAR saved_spotted = ()
```

- [ ] **Step 4: Dispatch the window and key verbs**

In `src/ink/scene1.ink`, in the `=== interact(verb, item) ===` knot, add these lines immediately before `-> interact_fallback(verb, item)` (alongside the door lines from Task 2):

```ink
{ verb == "look" and item == "window": -> look_window }
{ verb == "use" and item == "window": -> use_window }
{ verb == "look" and item == "key": -> look_key }
{ verb == "use" and item == "key": -> use_key }
{ verb == "take" and item == "key": -> take_key }
```

- [ ] **Step 5: Add the window and key knots**

In `src/ink/scene1.ink`, add these stitches immediately after the `= use_door` stitch (from Task 2), before `=== interact_fallback ===`:

```ink
= look_window
{ bars_pried:
    One bar hangs loose where you worked it out of the stone. The gap behind it breathes cold, older air.
- else:
    A row of iron bars, thick with rust, set into a low opening in the wall. The space behind them is not the outside - it is close, and dim, and long forgotten.
}
-> room_return

= use_window
{ bars_pried:
    The bar is already out. The gap is there for the taking.
    -> room_return
}
{ inventory ? nail:
    ~ bars_pried = true
    You wedge the nail behind the most corroded of the bars and lever, throwing your weight against it until the old iron tears free of the crumbling mortar. A gap opens - narrow, but enough.
    -> room_return
}
You haul on the bars. They are set deep and mean to stay, and your fingers are no match for them.
-> room_return

= look_key
{ inventory ? key:
    A gaoler's key, heavy and black with rust. Cut for a single lock, and you can guess which.
- else:
    It hangs from an iron ring on the wall, catching the thin light. Big, rust-black, and cut for a lock that matters.
}
-> room_return

= use_key
{ inventory ? key:
    The key is no use in your fist alone. It wants the lock it was cut for.
- else:
    Better in your hand first.
}
-> room_return

= take_key
{ inventory ? key:
    The key is already in your fist, cold and heavy.
- else:
    ~ spotted -= key
    ~ inventory += key
    You lift the key off its ring. It is heavier than it looks, and cold straight through.
}
-> room_return
```

- [ ] **Step 6: Add the squeeze-through choice**

In `src/ink/scene1.ink`, in `=== cell_room_loop ===`, add this choice immediately after the caution choice (from Task 2):

```ink
+ { bars_pried } [Squeeze through the gap.]
    -> enter_niche
```

- [ ] **Step 7: Add the niche knots**

In `src/ink/scene1.ink`, add these knots immediately after `=== corridor_loop ===` (from Task 2):

```ink
=== enter_niche ===
~ current_room = "niche"
~ saved_spotted = spotted
~ spotted = ()
{ not (inventory ? key):
    ~ spotted += key
}
-> guard_niche

=== guard_niche ===
# image:guard-niche
You fold yourself through the gap and drop into a space barely wider than your shoulders. A blade of pale daylight falls from a slit high in the far wall, thick with drifting dust. The air is colder here, and older.

Behind you, the barred gap gives back onto the dark you crawled out of. A three-legged stool waits under a plank shelf, where a dented tin cup keeps company with a candle-stub gone to a hard grey lump. And on the near wall, hung from an iron ring and catching what little light there is: a key. Big, black with rust, and cut for a lock that matters.
-> guard_niche_loop

=== guard_niche_loop ===
+ [Slip back through the gap.]
    ~ current_room = "cell"
    ~ spotted = saved_spotted
    ~ saved_spotted = ()
    { candle_lit:
        You fold yourself back through the gap into the low light. # image:cell-room-lit
    - else:
        You fold yourself back through the gap into the dark. # image:cell-room
    }
    -> cell_room_loop
```

- [ ] **Step 8: Route room_return through the niche**

In `src/ink/scene1.ink`, replace the entire `=== room_return ===` knot with (adds the niche case):

```ink
=== room_return ===
{ current_room == "niche": -> guard_niche_loop }
{ current_room == "corridor": -> corridor_loop }
{ current_room == "cell": -> cell_room_loop }
{ escaped: -> lid_open_loop }
-> coffin_loop
```

- [ ] **Step 9: Map the guard-niche background**

In `src/main.ts`, add this entry to `BACKGROUNDS` (after the `corridor` line from Task 2):

```ts
  corridor: `${import.meta.env.BASE_URL}backgrounds/corridor.png`,
  "guard-niche": `${import.meta.env.BASE_URL}backgrounds/guard-niche.png`,
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing tests plus the three new ones).

- [ ] **Step 11: Commit**

```bash
git add src/ink/scene1.ink src/main.ts src/ink/scene1.test.ts
git commit -m "feat: ingenuity route - prise the bars, take the niche key, unlock the door"
```

---

## Task 4: end-to-end browser verification

Per AGENTS.md, verify the whole flow in a real browser before declaring done. This task adds no code; it drives the running app with the Chrome DevTools / Playwright MCP and confirms each route works and renders the right backgrounds. If any check fails, open a bug and fix it under systematic-debugging before marking the plan complete.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves at `http://127.0.0.1:5173` (note the actual port from the output).

- [ ] **Step 2: Verify the strength/candle route**

Drive the app in the browser: push out of the coffin five times -> Step into the room -> Look around -> Use the table -> Take the small tin -> Use the candle -> Look at the door -> Use the door -> Start down the gallery.
Expected: background progresses `coffin` -> `lid-open` -> `cell-room` -> `cell-room-lit` (after the candle) -> `corridor` (after the door). Press `` ` `` to open the debug panel and confirm `build = strength`, `strength = 2`, `perception = 0`, `sanity = 0`.

- [ ] **Step 3: Verify the ingenuity route**

Reset the story (debug panel "Reset story"). Escape the coffin by wits: Look at the velvet -> Take the nail -> Trace where the wood resists -> Use the hinge -> Step into the room. Then Use the window -> Squeeze through the gap -> Take the iron key -> Slip back through the gap -> Use the door -> Start down the gallery.
Expected: backgrounds include `guard-niche` while in the niche and `corridor` at the end. Debug shows `build = ingenious`, `ingenuity = 2`, `perception = 0`, `sanity = 0`.

- [ ] **Step 4: Verify the caution route and the locked-door message**

Reset. Escape the coffin either way, enter the room, then Use the door once. Confirm the "...carried the key away" text appears and the door stays shut (background still `cell-room`). Then choose "Throw your weight against the door."
Expected: background becomes `corridor`; debug shows `caution = -1`.

- [ ] **Step 5: Confirm no dead-end for the ingenious build**

Reset. Escape by wits, enter the room, and without touching the window confirm that after one Use-the-door the "Throw your weight against the door." choice is present (the caution fallback is always reachable), and separately that the window route is available. Both being present proves the ingenious build cannot get stuck.

- [ ] **Step 6: Final full-suite run**

Run: `npm test` and `npm run build`
Expected: all tests PASS and the production build succeeds (Ink compiles, `tsc` is clean, Vite builds).

- [ ] **Step 7: Commit any fixes**

If Steps 2-6 required code changes, commit them with a descriptive message. If everything passed with no changes, there is nothing to commit for this task.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-16-cell-room-exits-design.md`):
- Map / door-as-goal / corridor stub -> Task 2.
- Candle route (drawer -> tinderbox -> candle -> pins -> lift) -> Task 2.
- Ingenuity route (window -> niche -> key -> back -> unlock) -> Task 3.
- Caution route (`caution - 1`, appears after `door_tried`) -> Task 2.
- Locked-door interaction (`door_tried`, "carried the key away") -> Task 2.
- Room travel with room-scoped strips -> Task 3 (`saved_spotted` save/restore; simpler and exact vs. the spec's reconstruction idea - documented deviation, same observable behavior).
- `perception`/`sanity` at 0, in snapshot + debug -> Task 1.
- Item labels 1:1 -> Task 2 (all three labels added with the LIST items).
- No-dead-end guarantee -> Task 4 Step 5 + Task 3's bare-handed-window test.
- Browser E2E per AGENTS.md -> Task 4.

**Deviation note:** the spec proposed a `refresh_cell_spotted` helper that rebuilds `spotted` from flags. This plan instead saves the cell's `spotted` into `saved_spotted` on entering the niche and restores it on return. Ink copies list variables by value, so this is exact and avoids the fragile flag-by-flag reconstruction. Same observable behavior; strictly simpler.

**Type consistency:** `attributes` keys (`caution`, `ingenuity`, `perception`, `sanity`, `strength`) match between `Scene1Snapshot`, the getter, and the debug panel. Ink variable names (`door_tried`, `pins_seen`, `door_open`, `bars_pried`, `saved_spotted`) are used identically across knots. Choice labels referenced in tests (`Throw your weight against the door.`, `Squeeze through the gap.`, `Slip back through the gap.`, `Start down the gallery.`) match the Ink verbatim.

**Placeholder scan:** no TBD/TODO; every code and test step shows complete content.
